/**
 * エントリポイント。canvas を取得して `Game` を起動する。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §2
 *
 * 本ファイルは読み込み時に `bootstrap()` を実行する副作用モジュールなので、内部関数は export しない
 * （import した時点で起動してしまうため単体テストには向かない）。テスト対象は `src/game/**` 側に置く。
 */

import { CONTAINER_LEFT, CONTAINER_RIGHT } from './game/constants';
import { createGame, type GameController } from './game/game';
import { createInput } from './game/input';
import { createPhysicsWorld } from './game/physics';
import { createRenderer } from './game/renderer';
import { drawFruitTier } from './game/spawn';

const ERROR_MESSAGE_TESTID = 'boot-error';

/** デバッグ計測表示の testid（契約点 §9: DOM の取得は data-testid で行う） */
const DEBUG_STATS_TESTID = 'debug-stats';

/** デバッグ計測表示の更新間隔 */
const DEBUG_STATS_INTERVAL_MS = 1000;

/** `?stress=<個数>` での連続投入間隔。実プレイのクールダウンより短くして早く積ませる */
const STRESS_DROP_INTERVAL_MS = 120;

function requireCanvas(): HTMLCanvasElement {
  // 契約点 §9: DOM 要素の取得は data-testid で行う
  const el = document.querySelector<HTMLCanvasElement>('canvas[data-testid="game-canvas"]');
  if (el === null) {
    throw new Error('game-canvas が見つかりません（index.html の data-testid を確認してください）');
  }
  return el;
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
 * 表示サイズ・DPR の変化に追従させる（R-04）。
 *
 * `ResizeObserver` は canvas の CSS サイズ変化（ウィンドウリサイズ・回転）を、
 * `resize` イベントはズームやディスプレイ間移動による DPR 変化を拾う。
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
 * 指定個数を短い間隔で連続投入する（`?stress=<個数>`。NFR-01 の計測用）。
 *
 * 一度にまとめて投入すると生成位置が重なって強く弾き合い、計測にならないため間隔を空ける。
 */
function startStressFill(game: GameController, count: number): void {
  const span = CONTAINER_RIGHT - CONTAINER_LEFT;
  let dropped = 0;
  const timer = window.setInterval(() => {
    if (dropped >= count) {
      window.clearInterval(timer);
      return;
    }
    // 容器内へ横方向に散らす（同じ x に積み続けると 1 本の塔になり負荷の傾向が偏る）
    game.dropAt(CONTAINER_LEFT + ((dropped * 37) % span));
    dropped += 1;
  }, STRESS_DROP_INTERVAL_MS);
}

/**
 * URL のクエリパラメータでデバッグ用の足場を有効化する。
 *
 * - `?stress=<個数>` … 指定個数を連続投入する（計測表示も自動で有効化）
 * - `?fps=1` … 実測 fps / 果物数 / sleeping 数を表示する
 */
function startDebugTools(game: GameController): void {
  const params = new URLSearchParams(window.location.search);

  const stress = Number.parseInt(params.get('stress') ?? '', 10);
  if (Number.isFinite(stress) && stress > 0) {
    startStressFill(game, stress);
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
    const game = createGame({
      physics: createPhysicsWorld(),
      renderer: createRenderer(canvas),
      drawTier: drawFruitTier,
    });

    observeViewport(canvas, game);
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
