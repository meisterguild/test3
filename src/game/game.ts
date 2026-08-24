/**
 * 状態機械 + `requestAnimationFrame` ループ + イベント発火。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §7（イベント名・payload・API 形）
 *
 * 発火するのは `statuschange` / `drop` / `scorechange`。
 * `merge` は #7、`gameover` は #9 が本モジュールの `emit` 経路に繋ぐ（イベント定義は先に確定させる）。
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
  STAGE_WIDTH,
} from './constants';
import { FRUITS } from './fruits';
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
 * - `addScore` … 合体（#7）が加点する
 * - `onFruitContact` / `emit` … 合体（#7）・ゲームオーバー（#9）が物理側の事象を拾って結果を通知する
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
   * イベントを発火する（#7 / #9 が自分の判定結果を通知するのに使う）。
   *
   * `gameover` を発火したときだけ副作用がある: 状態を `over` へ遷移させ（`statuschange` が先に飛ぶ）、
   * ループを止める。ゲームオーバーの**判定**は #9 の責務、**状態機械の終了**は本モジュールの責務、
   * という切り分けにするため（#9 に status を直接書かせない）。
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
 *                    +--emit('gameover')-------> over --restart--> playing
 * ```
 */
export function createGame(deps: GameDeps): GameController {
  const { physics, renderer } = deps;
  const drawTier = deps.drawTier ?? ((): FruitTier => 0);
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
  /* フレームレートの実測（{@link GameController.fps}）。一定時間ごとに平均を取り直す */
  let fps = 0;
  let framesInWindow = 0;
  let fpsWindowStartMs: number | null = null;

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

  function setStatus(next: GameStatus): void {
    if (status === next) {
      return;
    }
    status = next;
    emitEvent('statuschange', { status: next });
  }

  function draw(): void {
    /*
     * ドロップ待機中の果物を DROP_Y に描くことで狙いを可視化する（FR-01）。
     * ゲームオーバー後は操作できないので消す。
     */
    const preview = status === 'over' ? undefined : { tier: currentTier, x: aimX, y: DROP_Y };
    renderer.render({ fruits: physics.snapshot(), preview });
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

    physics.step(deltaMs);
    draw();
    measureFps(timestampMs);
    scheduleFrame();
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
      if (score !== 0) {
        score = 0;
        emitEvent('scorechange', { score });
      }
      // R-F: リスタート時も 2 個を抽選し直す。狙いは中央へ戻す
      currentTier = drawTier();
      queuedTier = drawTier();
      aimX = clampDropX(STAGE_WIDTH / 2, radiusOf(currentTier));
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
      if (!Number.isFinite(delta) || delta === 0) {
        return;
      }
      score += delta;
      emitEvent('scorechange', { score });
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

    dispose() {
      if (disposed) {
        return;
      }
      stopLoop();
      disposed = true;
      for (const set of Object.values(handlers)) {
        set.clear();
      }
      physics.dispose();
    },
  };
}
