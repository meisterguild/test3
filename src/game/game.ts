/**
 * 状態機械 + `requestAnimationFrame` ループ + イベント発火。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §7（イベント名・payload・API 形）
 *
 * 発火するのは `statuschange` / `drop` / `merge` / `scorechange` / `gameover`。
 *
 * ゲームオーバー（FR-07）は、判定そのものを gameover.ts の純関数に委譲し、本モジュールが
 * 「継続時間の保持・playing のフレームだけ進める・確定したら状態機械を終端させる」を担う
 * （docs/specs/game-core-rules.md R-E）。
 *
 * 合体（FR-03 / FR-04）は本モジュールがフレーム単位で適用する。判定そのものは merge.ts の
 * 純関数に委譲し、ここは**接触ペアの収集・物理ボディの削除と生成・スコア加算・イベント発火**だけを行う。
 *
 * 依存（物理・描画・時間・フレーム要求）はすべて引数で注入する。DOM や rAF を掴まないため、
 * 単体テストでは偽のフレーム駆動で決定論的に検証できる（NFR-05）。
 *
 * 落下位置の狙い（`aimX`）と先読みキュー（`currentTier` / `nextTier`）も本モジュールが保持する
 * （docs/specs/game-core-rules.md R-F）。入力デバイスの解釈は input.ts の責務。
 */

import {
  CONTAINER_LEFT,
  CONTAINER_RIGHT,
  DROP_Y,
  FPS_SAMPLE_WINDOW_MS,
  PHYSICS_TIMESTEP_MS,
  STAGE_WIDTH,
} from './constants';
import { FRUITS } from './fruits';
import { advanceOverflow } from './gameover';
import { resolveMergeBatch, type MergeContact } from './merge';
import type { FruitContact, FruitSnapshot, PhysicsWorld, Unsubscribe } from './physics';
import type { Renderer } from './renderer';
import type { FruitTier, GameStatus } from './types';

/** 契約点 §7 のイベント表。**この名前と payload は契約点** */
export interface GameEvents {
  drop: { tier: FruitTier };
  merge: { tier: FruitTier; score: number; x: number; y: number };
  scorechange: { score: number };
  statuschange: { status: GameStatus };
  gameover: { score: number; highScore: number; isNewHighScore: boolean };
}

/** 契約点 §7 の公開 API */
export interface Game {
  on<K extends keyof GameEvents>(event: K, handler: (payload: GameEvents[K]) => void): Unsubscribe;
  start(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  readonly status: GameStatus;
}

/**
 * `Game`（契約点 §7）に、同一プロセス内の他モジュールが使う操作を足したもの。
 *
 * 契約点の `Game` を細らせないため、契約外の操作はこちら側に置く
 * （HUD / 効果音のように「購読するだけ」のモジュールは `Game` だけを受け取れば済む）。
 *
 * - `aimAt` / `drop` / `dropAt` … 入力（input.ts）が呼ぶ
 * - `currentTier` / `nextTier` / `aimX` … HUD（#8）と描画が読む
 * - `addScore` … 合体以外の加点（デバッグ・計測用）。合体の加点は本モジュール内で行う
 * - `onFruitContact` / `emit` … ゲームオーバー（#9）が物理側の事象を拾って結果を通知する
 */
export interface GameController extends Game {
  /**
   * 落下位置の狙いを更新する（論理座標 x）。容器の内側（± 現在の果物の半径）へクランプする。
   *
   * `status !== 'playing'` のとき・有限でない値のときは何もしない。
   */
  aimAt(x: number): void;
  /**
   * 現在の狙い位置（{@link GameController.aimX}）へ {@link GameController.currentTier} を落とす。
   * 落とせたら `true`。クールダウン（FR-10）は入力側（input.ts）の責務。
   */
  drop(): boolean;
  /**
   * 指定 x（論理座標）に果物を落とす。落とせたら `true`。狙いもその位置へ移動する。
   *
   * `status !== 'playing'` のときは何もしない。x は容器内へクランプする。
   *
   * @param tier 落とす果物を明示する（デバッグ・計測用）。省略時は先読みキューの `current` を使い、
   *   キューを 1 つ繰り上げる（R-F: 抽選はドロップ成立時のみ）。明示した場合はキューを消費しない。
   */
  dropAt(x: number, tier?: FruitTier): boolean;
  /** スコアを加算する。変化したら `scorechange` を発火する */
  addScore(delta: number): void;
  /** 果物どうしの衝突開始（物理側の `collisionStart` を果物だけに絞ったもの） */
  onFruitContact(handler: (contact: FruitContact) => void): Unsubscribe;
  /**
   * イベントを発火する（デバッグ・計測用の外部トリガ）。
   *
   * `gameover` を発火したときだけ副作用がある: 状態を `over` へ遷移させ（`statuschange` が先に飛ぶ）、
   * ループを止める。通常のゲームオーバーはループ内の判定（spec R-E）が同じ経路を通るため、
   * ここから呼ぶのは「盤面を積まずに終了状態を再現したい」場合に限る。
   */
  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void;
  /**
   * 果物の現在状態（デッドライン判定 #9 / デバッグ表示が使う）。
   * 物理エンジンに依存しない値の配列（毎回新規）。
   */
  snapshot(): FruitSnapshot[];
  /**
   * canvas の実解像度を表示サイズに合わせ直す（R-04）。解像度が変わったら `true`。
   * ループが止まっている状態（`paused` / `over`）で呼んだ場合は {@link redraw} も必要。
   */
  resize(): boolean;
  /** 現在の状態を 1 枚描き直す（ループが止まっているときの再描画用） */
  redraw(): void;
  /** 現在の狙い位置（論理座標 x）。ドロップ待機中の果物の中心 x */
  readonly aimX: number;
  /** ドロップ待機中の果物の tier（R-F の `current`） */
  readonly currentTier: FruitTier;
  /** 次に落ちる果物の tier（R-F の `next`。HUD の予告表示 #8 が読む） */
  readonly nextTier: FruitTier;
  /** 現在のスコア */
  readonly score: number;
  /**
   * 直近の実測フレームレート（NFR-01 の確認用）。
   * ループ停止中は最後に計測した値を保持する。計測前は 0。
   */
  readonly fps: number;
  /**
   * デッドライン超過の継続時間 (ms)（spec R-E の `overMs`）。デバッグ表示・テスト用。
   * 超過している果物が 0 個のフレームで 0 に戻る。
   */
  readonly overMs: number;
  /** ループを止めて購読・物理世界を破棄する */
  dispose(): void;
}

export interface GameDeps {
  physics: PhysicsWorld;
  renderer: Renderer;
  /**
   * 果物の出現抽選（既定は常に tier 0）。本番は `spawn.drawFruitTier` を渡す。
   *
   * 「抽選する関数」と「抽選済みの値」を読み分けられるよう、
   * 保持している値（{@link GameController.nextTier}）とは別の名前にしている。
   */
  drawTier?: () => FruitTier;
  /**
   * 保存済みハイスコアの読み取り（既定は常に 0）。本番は `local-store` の `getHighScore` を渡す。
   *
   * `gameover` の payload（契約点 §7）の `highScore` / `isNewHighScore` を組むために使う。
   * 読むのは `start` / `restart` の時点だけ（＝そのプレイ開始前の記録）。プレイ中に読むと、
   * HUD が更新途中のハイスコアを保存済みにしてしまうため `isNewHighScore` が常に false になる。
   */
  readHighScore?: () => number;
  /** 次フレームの要求。既定は `requestAnimationFrame` */
  requestFrame?: (callback: (timestampMs: number) => void) => number;
  /** フレーム要求の取り消し。既定は `cancelAnimationFrame` */
  cancelFrame?: (handle: number) => void;
}

/** 果物の半径（論理座標 px）。`FruitTier` は 0〜10 に閉じているため既定値には落ちない */
function radiusOf(tier: FruitTier): number {
  return FRUITS[tier]?.radius ?? 0;
}

/**
 * 落下位置の x を容器の内側へ収める。
 *
 * 果物が壁に食い込んだ状態で生成されると弾き出されるため、中心 x を
 * 「容器の内側 ± 半径」に制限する（狙いの可視化とドロップで同じ範囲を使う）。
 *
 * @param radius 落とす果物の半径（論理座標 px）
 * @returns `CONTAINER_LEFT + radius` 〜 `CONTAINER_RIGHT - radius` の範囲に収めた x。
 *   半径が容器の内幅の半分を超える（＝収まる位置が無い）場合は容器の中央
 */
export function clampDropX(x: number, radius: number): number {
  const minX = CONTAINER_LEFT + radius;
  const maxX = CONTAINER_RIGHT - radius;
  if (maxX < minX) {
    return (CONTAINER_LEFT + CONTAINER_RIGHT) / 2;
  }
  return Math.min(Math.max(x, minX), maxX);
}

/**
 * ゲームを生成する。生成直後の状態は `ready`（ループは回っていない）。
 *
 * 状態遷移（契約点 §7 の `statuschange` はこの遷移で発火する）:
 *
 * ```text
 * ready --start--> playing <--pause/resume--> paused
 *                    |                          |
 *                    +---------restart----------+--> playing（スコア・果物をリセット）
 *                    +--超過が猶予を超える-----> over --restart--> playing
 * ```
 */
export function createGame(deps: GameDeps): GameController {
  const { physics, renderer } = deps;
  const drawTier = deps.drawTier ?? ((): FruitTier => 0);
  const readHighScore = deps.readHighScore ?? ((): number => 0);
  const requestFrame =
    deps.requestFrame ??
    ((callback: (timestampMs: number) => void) => requestAnimationFrame(callback));
  const cancelFrame = deps.cancelFrame ?? ((handle: number) => cancelAnimationFrame(handle));

  type Handlers = { [K in keyof GameEvents]: Set<(payload: GameEvents[K]) => void> };
  const handlers: Handlers = {
    drop: new Set(),
    merge: new Set(),
    scorechange: new Set(),
    statuschange: new Set(),
    gameover: new Set(),
  };

  let status: GameStatus = 'ready';
  let score = 0;
  /*
   * 先読みキュー（R-F）。生成時に 2 回抽選し、以降はドロップ成立時にだけ繰り上げる
   * （クールダウンで弾かれた入力では抽選しない）。
   */
  let currentTier = drawTier();
  let queuedTier = drawTier();
  /** 落下位置の狙い（論理座標 x）。初期値は容器の中央 */
  let aimX = clampDropX(STAGE_WIDTH / 2, radiusOf(currentTier));
  /** rAF のハンドル。null ならループは止まっている */
  let frameHandle: number | null = null;
  /** 直前フレームのタイムスタンプ。null なら次フレームを delta 0 として扱う */
  let lastFrameMs: number | null = null;
  let disposed = false;
  /** デッドライン超過の継続時間 (ms)（spec R-E の `overMs`）。判定は gameover.ts */
  let overMs = 0;
  /**
   * このプレイを始めた時点の保存済みハイスコア（`gameover` の `isNewHighScore` の基準）。
   * `start` / `restart` で読み直す。
   */
  let highScoreBaseline = 0;
  /* フレームレートの実測（{@link GameController.fps}）。一定時間ごとに平均を取り直す */
  let fps = 0;
  let framesInWindow = 0;
  let fpsWindowStartMs: number | null = null;
  /**
   * 現在のフレームに届いた接触ペア（R-D）。
   *
   * `physics.step` の中（Matter.js の衝突コールバック）で溜めるだけにして、
   * ボディの削除・生成は step が返ったあとにまとめて適用する。
   * エンジンが衝突ペアを走査している最中に World を変更しないための緩衝地帯。
   */
  const pendingContacts: MergeContact[] = [];

  const unsubscribeContact = physics.onFruitContact((contact) => {
    // E-13: playing 以外のフレームではルールを評価しない
    if (status !== 'playing') {
      return;
    }
    pendingContacts.push({ a: contact.a, b: contact.b });
  });

  function emitEvent<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    // ハンドラ内で購読解除されても走査が壊れないよう、コピーしてから呼ぶ
    for (const handler of [...handlers[event]]) {
      handler(payload);
    }
  }

  /** 公開版の emit。`gameover` は状態機械の終了を伴う（{@link GameController.emit}） */
  function emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    if (event === 'gameover' && status !== 'over') {
      setStatus('over');
      stopLoop();
    }
    emitEvent(event, payload);
  }

  /** スコアを加算する（内部用。`assertUsable` は公開側で行う） */
  function applyScore(delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }
    score += delta;
    emitEvent('scorechange', { score });
  }

  /**
   * 溜まった接触ペアを 1 パスで畳み込み、成立した合体を物理世界へ適用する（FR-03 / FR-04 / R-D）。
   *
   * 呼ぶのは `physics.step` が返ったあと。判定は merge.ts の純関数が行うため、
   * ここは「消す・作る・加点する・通知する」だけを順に実行する。
   *
   * イベントは合体 1 件ごとに `merge` を発火し、`scorechange` はフレーム分をまとめて 1 回だけ流す
   * （同時合体でスコア表示が同一フレーム内に何度も書き換わるのを避ける）。
   */
  function applyMerges(): void {
    if (pendingContacts.length === 0) {
      return;
    }
    const { merges, score: gained } = resolveMergeBatch(pendingContacts);
    pendingContacts.length = 0;

    for (const merge of merges) {
      for (const fruitId of merge.consumedFruitIds) {
        physics.removeFruit(fruitId);
      }
      if (merge.kind === 'promote') {
        // annihilate（スイカ同士）では新しい果物を作らない（tier 11 は存在しない）
        // 合体で生まれた果物は落下中ではない（spec R-E / E-12: 即座に超過判定の対象にする）
        physics.addFruit(merge.tier, merge.x, merge.y, { landed: true });
      }
      emitEvent('merge', { tier: merge.tier, score: merge.score, x: merge.x, y: merge.y });
    }
    applyScore(gained);
  }

  function setStatus(next: GameStatus): void {
    if (status === next) {
      return;
    }
    status = next;
    emitEvent('statuschange', { status: next });
  }

  /**
   * 現在の状態を 1 枚描く。
   *
   * @param fruits 既に取得済みのスナップショット（ループ内でゲームオーバー判定と共用する。
   *   省略時は取り直す）。1 フレームに 2 回スナップショットを作らないための引数（NFR-01）
   */
  function draw(fruits: FruitSnapshot[] = physics.snapshot()): void {
    /*
     * ドロップ待機中の果物を DROP_Y に描くことで狙いを可視化する（FR-01）。
     * ゲームオーバー後は操作できないので消す。
     */
    const preview = status === 'over' ? undefined : { tier: currentTier, x: aimX, y: DROP_Y };
    renderer.render({ fruits, preview });
  }

  /** 狙いを更新する。容器内へクランプするため、範囲外の値でも状態は壊れない */
  function setAim(x: number): void {
    if (!Number.isFinite(x)) {
      return;
    }
    aimX = clampDropX(x, radiusOf(currentTier));
  }

  /** ドロップ成立時にキューを繰り上げる（R-F）。狙いの再クランプは呼び出し側で行う */
  function advanceQueue(): void {
    currentTier = queuedTier;
    queuedTier = drawTier();
  }

  function dropAt(x: number, tier?: FruitTier): boolean {
    assertUsable();
    if (status !== 'playing') {
      return false;
    }
    const dropTier = tier ?? currentTier;
    // 壊れた x（NaN 等）でゲームを止めず、現在の狙いのまま落とす
    const targetX = Number.isFinite(x) ? clampDropX(x, radiusOf(dropTier)) : aimX;
    physics.addFruit(dropTier, targetX, DROP_Y);
    if (tier === undefined) {
      advanceQueue();
    }
    // 明示 tier のドロップでも、次の待機果物は落とした位置に置く（狙いの連続性）
    setAim(targetX);
    emitEvent('drop', { tier: dropTier });
    return true;
  }

  function tick(timestampMs: number): void {
    frameHandle = null;
    if (status !== 'playing') {
      // pause / gameover と同一フレームで止まった場合。ここでループを終端させる
      lastFrameMs = null;
      return;
    }
    /*
     * 初回フレーム（および resume 直後）は delta を 0 にする。
     * rAF のタイムスタンプは start() 時点からの経過ではないため、
     * そのまま差分を取ると巨大な delta で物理が飛ぶ。
     */
    const deltaMs = lastFrameMs === null ? 0 : timestampMs - lastFrameMs;
    lastFrameMs = timestampMs;

    const steps = physics.step(deltaMs);
    // 衝突コールバックの外（step の完了後）で盤面を変更する（R-D）
    applyMerges();

    // 判定と描画で同じスナップショットを使う（1 フレームに 1 回だけ作る）
    const fruits = physics.snapshot();
    if (checkGameOver(fruits, steps)) {
      // 状態は over（ループも停止済み）。最後の盤面を 1 枚描いて終わる
      draw(fruits);
      return;
    }

    draw(fruits);
    measureFps(timestampMs);
    scheduleFrame();
  }

  /**
   * デッドライン超過を 1 フレーム分進め、確定したら `gameover` を発火する（FR-07 / spec R-E）。
   *
   * 経過時間には**実際に物理が進んだ時間**（`physics.step` が消化したステップ数 ×
   * {@link PHYSICS_TIMESTEP_MS}）を使い、rAF の生の delta は使わない。タブ復帰直後の
   * 巨大な delta（数十秒）をそのまま積むと、物理が 1 フレーム分しか進んでいないのに
   * 猶予（`GAMEOVER_GRACE_MS`）を飛び越えて即終了になる（spec E-11 / R-6）。
   *
   * @param fruits このフレームの盤面（`DeadlineFruit` は `FruitSnapshot` の部分集合なので、
   *   詰め替えずにそのまま渡せる）
   * @param steps このフレームで実行された物理ステップ数
   * @returns ゲームオーバーが確定したら `true`
   */
  function checkGameOver(fruits: readonly FruitSnapshot[], steps: number): boolean {
    const result = advanceOverflow(overMs, fruits, steps * PHYSICS_TIMESTEP_MS);
    overMs = result.overMs;
    if (!result.isOver) {
      return false;
    }
    emit('gameover', {
      score,
      highScore: Math.max(highScoreBaseline, score),
      isNewHighScore: score > highScoreBaseline,
    });
    return true;
  }

  /** 保存済みハイスコアを読み直す。壊れた値は 0 として扱う（判定を止めない） */
  function readBaselineHighScore(): number {
    const value = readHighScore();
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function measureFps(timestampMs: number): void {
    if (fpsWindowStartMs === null) {
      fpsWindowStartMs = timestampMs;
      framesInWindow = 0;
      return;
    }
    framesInWindow += 1;
    const elapsedMs = timestampMs - fpsWindowStartMs;
    if (elapsedMs >= FPS_SAMPLE_WINDOW_MS) {
      fps = (framesInWindow * 1000) / elapsedMs;
      fpsWindowStartMs = timestampMs;
      framesInWindow = 0;
    }
  }

  function scheduleFrame(): void {
    if (disposed || frameHandle !== null) {
      return;
    }
    frameHandle = requestFrame(tick);
  }

  function stopLoop(): void {
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    lastFrameMs = null;
    // 再開時に「停止していた時間」を 1 サンプルに混ぜないよう計測窓を捨てる
    fpsWindowStartMs = null;
    framesInWindow = 0;
  }

  function assertUsable(): void {
    if (disposed) {
      throw new Error('Game は dispose 済みです');
    }
  }

  return {
    on(event, handler) {
      const set = handlers[event];
      set.add(handler);
      return () => set.delete(handler);
    },

    emit,

    start() {
      assertUsable();
      if (status !== 'ready') {
        return;
      }
      highScoreBaseline = readBaselineHighScore();
      overMs = 0;
      setStatus('playing');
      renderer.resize();
      scheduleFrame();
    },

    pause() {
      assertUsable();
      if (status !== 'playing') {
        return;
      }
      setStatus('paused');
      stopLoop();
      // 停止中の画面が空にならないよう最後の状態を描き直す
      draw();
    },

    resume() {
      assertUsable();
      if (status !== 'paused') {
        return;
      }
      setStatus('playing');
      scheduleFrame();
    },

    restart() {
      assertUsable();
      stopLoop();
      physics.clearFruits();
      // 盤面を消す前のフレームで届いた接触は、もう存在しない果物を指すので捨てる
      pendingContacts.length = 0;
      if (score !== 0) {
        score = 0;
        emitEvent('scorechange', { score });
      }
      // R-F: リスタート時も 2 個を抽選し直す。狙いは中央へ戻す
      currentTier = drawTier();
      queuedTier = drawTier();
      aimX = clampDropX(STAGE_WIDTH / 2, radiusOf(currentTier));
      // spec R-E: 超過継続時間も初期化する（前回の終了状態を持ち込まない）
      overMs = 0;
      // 前回のプレイ中に更新されたハイスコアを次の基準にする（FR-06）
      highScoreBaseline = readBaselineHighScore();
      // ready を経由せず playing へ直行する（プレイヤーの操作なしで再開できる状態にする）
      setStatus('playing');
      renderer.resize();
      scheduleFrame();
    },

    aimAt(x) {
      assertUsable();
      if (status !== 'playing') {
        return;
      }
      setAim(x);
    },

    drop() {
      return dropAt(aimX);
    },

    dropAt,

    addScore(delta) {
      assertUsable();
      applyScore(delta);
    },

    onFruitContact(handler) {
      return physics.onFruitContact(handler);
    },

    snapshot() {
      return physics.snapshot();
    },

    resize() {
      return renderer.resize();
    },

    redraw: draw,

    get status() {
      return status;
    },

    get aimX() {
      return aimX;
    },

    get currentTier() {
      return currentTier;
    },

    get nextTier() {
      return queuedTier;
    },

    get score() {
      return score;
    },

    get fps() {
      return fps;
    },

    get overMs() {
      return overMs;
    },

    dispose() {
      if (disposed) {
        return;
      }
      stopLoop();
      disposed = true;
      unsubscribeContact();
      pendingContacts.length = 0;
      for (const set of Object.values(handlers)) {
        set.clear();
      }
      physics.dispose();
    },
  };
}
