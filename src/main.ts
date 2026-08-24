/**
 * エントリポイント。canvas を取得して `Game` を起動する。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §2
 *
 * 本ファイルは読み込み時に `bootstrap()` を実行する副作用モジュールなので、内部関数は export しない
 * （import した時点で起動してしまうため単体テストには向かない）。テスト対象は `src/game/**` 側に置く。
 */

import { CONTAINER_LEFT, CONTAINER_RIGHT, DROP_COOLDOWN_MS } from './game/constants';
import { createGame, type GameController } from './game/game';
import { createInput } from './game/input';
import { createPhysicsWorld } from './game/physics';
import { createRenderer } from './game/renderer';
import { drawFruitTier } from './game/spawn';
import { createLocalStore } from './storage/local-store';
import { createHud } from './ui/hud';
import { createGameModal } from './ui/modal';

const ERROR_MESSAGE_TESTID = 'boot-error';

/** デバッグ計測表示の testid（契約点 §9: DOM の取得は data-testid で行う） */
const DEBUG_STATS_TESTID = 'debug-stats';

/** デバッグ計測表示の更新間隔 */
const DEBUG_STATS_INTERVAL_MS = 1000;

/**
 * `?stress=<個数>` での連続投入間隔。実プレイのクールダウン（FR-10）と同じ値にする。
 *
 * これより短くすると、落下中の果物が次々と空中で触れ合って「着地済みかつデッドラインより上」
 * の状態が途切れなくなり、盤面が埋まる前にゲームオーバー（#9 / spec R-E）が確定してしまう。
 * 果物 60 個規模の計測（NFR-01）を成立させるため、実プレイと同じ間隔まで落とす。
 */
const STRESS_DROP_INTERVAL_MS = DROP_COOLDOWN_MS;

function requireCanvas(): HTMLCanvasElement {
  // 契約点 §9: DOM 要素の取得は data-testid で行う
  const el = document.querySelector<HTMLCanvasElement>('canvas[data-testid="game-canvas"]');
  if (el === null) {
    throw new Error('game-canvas が見つかりません（index.html の data-testid を確認してください）');
  }
  return el;
}

/**
 * HUD / 操作バーを差し込む位置の基準要素。
 *
 * canvas は盤面の枠（index.html の `.app__stage`。残り高さを受け取る箱）に包まれているため、
 * 枠の内側へ差し込むと縦 1 列のレイアウト（UI-03）が崩れる。
 * 枠があればそれを、無ければ canvas 自身を基準にする。
 */
function stageAnchorOf(canvas: HTMLCanvasElement): HTMLElement {
  // 契約点 §9: DOM 要素の取得は data-testid で行う
  return canvas.closest<HTMLElement>('[data-testid="stage"]') ?? canvas;
}

/**
 * HUD（#8）の差し込み先。index.html の `.hud` が無ければ盤面の直前に作る。
 *
 * canvas と違い、無ければ作れる要素なので起動を止めない（スコアが見えないまま遊べてしまう
 * 状態を避けるため、欠落時は生成側で補う）。
 */
function requireHudMount(canvas: HTMLCanvasElement): HTMLElement {
  // 契約点 §9: DOM 要素の取得は data-testid で行う
  const existing = document.querySelector<HTMLElement>('[data-testid="hud"]');
  if (existing !== null) {
    return existing;
  }
  const mount = document.createElement('section');
  mount.className = 'hud';
  mount.dataset.testid = 'hud';
  mount.setAttribute('aria-label', 'スコア表示');
  // 盤面の直前（＝盤面の上）に置く。基準要素の親が無い異常系だけ body 末尾へ逃がす
  const anchor = stageAnchorOf(canvas);
  const parent = anchor.parentNode;
  if (parent === null) {
    document.body.appendChild(mount);
  } else {
    parent.insertBefore(mount, anchor);
  }
  return mount;
}

/**
 * ポーズ操作・ゲームオーバーモーダル（#9）の差し込み先。無ければ盤面の直後に作る。
 * HUD と同じ方針（欠落しても遊べる状態を壊さない）。
 */
function requireControlsMount(canvas: HTMLCanvasElement): HTMLElement {
  // 契約点 §9: DOM 要素の取得は data-testid で行う
  const existing = document.querySelector<HTMLElement>('[data-testid="controls"]');
  if (existing !== null) {
    return existing;
  }
  const mount = document.createElement('section');
  mount.className = 'controls';
  mount.dataset.testid = 'controls';
  mount.setAttribute('aria-label', 'ゲーム操作');
  const anchor = stageAnchorOf(canvas);
  const parent = anchor.parentNode;
  if (parent === null) {
    document.body.appendChild(mount);
  } else {
    // 盤面の直後（＝盤面の下）に置く
    parent.insertBefore(mount, anchor.nextSibling);
  }
  return mount;
}

/** 起動失敗を画面にも出す。何度呼ばれても表示は 1 つだけにする。 */
function showBootError(): void {
  if (document.querySelector(`[data-testid="${ERROR_MESSAGE_TESTID}"]`) !== null) {
    return;
  }
  const message = document.createElement('p');
  message.dataset.testid = ERROR_MESSAGE_TESTID;
  message.setAttribute('role', 'alert');
  message.textContent =
    'ゲームを表示できませんでした。詳細はブラウザのコンソールを確認してください。';
  document.body.appendChild(message);
}

/**
 * DPR の変化だけを拾う（R-04）。
 *
 * ディスプレイ間の移動やズームでは CSS 表示サイズが変わらないことがあり、
 * `ResizeObserver` も `resize` も発火しないまま実解像度が古いまま残る（＝ぼやける）。
 * 「現在の DPR に一致する」メディアクエリを張り、外れた瞬間に張り直して通知する。
 */
function observeDevicePixelRatio(onChange: () => void): void {
  if (typeof window.matchMedia !== 'function') {
    return;
  }
  let query: MediaQueryList | null = null;
  const handleChange = (): void => {
    // 新しい DPR で監視をやり直してから通知する（次の変化も拾えるようにする）
    watch();
    onChange();
  };
  function watch(): void {
    query?.removeEventListener('change', handleChange);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener('change', handleChange);
  }
  watch();
}

/**
 * 表示サイズ・DPR の変化に追従させる（R-04）。
 *
 * `ResizeObserver` は canvas の CSS サイズ変化（ウィンドウリサイズ・画面回転・URL バーの
 * 出入りによる `100dvh` の変化）を、`resize` と {@link observeDevicePixelRatio} は
 * 表示サイズを伴わない DPR 変化を拾う。
 * 再描画はループが次フレームで行うため、ここでは解像度合わせだけを行う。
 */
function observeViewport(canvas: HTMLCanvasElement, game: GameController): void {
  const applyResize = (): void => {
    if (game.status === 'paused' || game.status === 'over') {
      // ループが止まっている状態では再描画されないので、解像度変更後に 1 枚描き直す
      if (game.resize()) {
        game.redraw();
      }
      return;
    }
    game.resize();
  };

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(applyResize).observe(canvas);
  }
  window.addEventListener('resize', applyResize);
  observeDevicePixelRatio(applyResize);
}

/**
 * デバッグ用の計測表示（#6 / #7 でも消さない。NFR-01 / R-05 の確認手段として残す）。
 *
 * `?stress=<個数>` または `?fps=1` を付けたときだけ DOM に現れる。
 * 実測 fps（NFR-01）と sleeping 中の果物数（R-05）を 1 秒ごとに更新する。
 */
function startDebugStats(game: GameController): void {
  const stats = document.createElement('p');
  stats.dataset.testid = DEBUG_STATS_TESTID;
  stats.style.margin = '0';
  stats.style.fontVariantNumeric = 'tabular-nums';
  document.querySelector('.app')?.appendChild(stats);

  window.setInterval(() => {
    const fruits = game.snapshot();
    const sleeping = fruits.filter((fruit) => fruit.isSleeping).length;
    stats.textContent = `fps ${game.fps.toFixed(1)} / 果物 ${fruits.length} / sleeping ${sleeping}`;
  }, DEBUG_STATS_INTERVAL_MS);
}

/**
 * 指定個数を連続投入する（`?stress=<個数>`。NFR-01 の計測用）。
 *
 * 一度にまとめて投入すると生成位置が重なって強く弾き合い、計測にならないため間隔を空ける。
 * ゲームオーバー（#9）で盤面が止まったら投入も止める。
 *
 * @param intervalMs 投入間隔。既定は {@link STRESS_DROP_INTERVAL_MS}
 */
function startStressFill(game: GameController, count: number, intervalMs: number): void {
  const span = CONTAINER_RIGHT - CONTAINER_LEFT;
  let dropped = 0;
  const timer = window.setInterval(() => {
    if (dropped >= count || game.status === 'over') {
      window.clearInterval(timer);
      return;
    }
    // 容器内へ横方向に散らす（同じ x に積み続けると 1 本の塔になり負荷の傾向が偏る）
    game.dropAt(CONTAINER_LEFT + ((dropped * 37) % span));
    dropped += 1;
  }, intervalMs);
}

/**
 * `?interval=<ms>` の解釈（`?stress=` と併用したときだけ効く）。
 *
 * クールダウンより短い間隔での連続投入は、落下中の果物が空中で触れ合って
 * デッドライン超過が途切れなくなる（＝盤面が埋まる前にゲームオーバーへ到達する）。
 * ゲームオーバー経路を E2E から短時間で踏むための足場。
 *
 * @returns 1 フレーム（16ms）以上の間隔。未指定・解釈できない値なら既定値
 */
function resolveStressInterval(raw: string | null): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value)) {
    return STRESS_DROP_INTERVAL_MS;
  }
  return Math.max(16, value);
}

/**
 * URL のクエリパラメータでデバッグ用の足場を有効化する。
 *
 * - `?stress=<個数>` … 指定個数を連続投入する（計測表示も自動で有効化）
 * - `?interval=<ms>` … `?stress=` の投入間隔を上書きする（既定は実プレイのクールダウン）
 * - `?fps=1` … 実測 fps / 果物数 / sleeping 数を表示する
 */
function startDebugTools(game: GameController): void {
  const params = new URLSearchParams(window.location.search);

  const stress = Number.parseInt(params.get('stress') ?? '', 10);
  if (Number.isFinite(stress) && stress > 0) {
    startStressFill(game, stress, resolveStressInterval(params.get('interval')));
  }
  if (params.get('stress') !== null || params.get('fps') === '1') {
    startDebugStats(game);
  }
}

/**
 * 起動処理。canvas → renderer / physics → game を組み立ててループを開始する。
 * 描画不能なら理由をユーザーにも見える形で出す（無言の空白画面にしない）。
 *
 * 文言は原因を断定しない。canvas 要素の欠落（マークアップ / ビルド不具合）と
 * コンテキスト取得失敗（対象外ブラウザ）のどちらもここに来るため、
 * 原因の特定は console のログに委ねる。
 */
function bootstrap(): void {
  try {
    const canvas = requireCanvas();
    const store = createLocalStore();
    const game = createGame({
      physics: createPhysicsWorld(),
      renderer: createRenderer(canvas),
      drawTier: drawFruitTier,
      // gameover の payload（ハイスコア更新の有無）に保存済みの記録を使う（FR-06 / UI-02）
      readHighScore: () => store.getHighScore(),
    });

    observeViewport(canvas, game);
    // スコア・ハイスコア・次の果物・ミュート（FR-05 / FR-06 / FR-08 / DT-02）
    createHud({ mount: requireHudMount(canvas), game, store });
    // ゲームオーバーモーダルとポーズ / 再開（FR-07 / FR-09 / UI-02）
    createGameModal({ mount: requireControlsMount(canvas), game });
    // 落下操作（FR-01 / FR-10）。ページ全体で遊べるようキー入力は window で受ける
    createInput(canvas, game);
    game.start();
    startDebugTools(game);
  } catch (error) {
    console.error('ゲームの初期化に失敗しました', error);
    showBootError();
  }
}

bootstrap();
