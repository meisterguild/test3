/**
 * 状態機械 + `requestAnimationFrame` ループ + イベント発火。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §7（イベント名・payload・API 形）
 *
 * 本 issue（#5）で発火するのは `statuschange` / `drop` / `scorechange`。
 * `merge` は #7、`gameover` は #9 が本モジュールの `emit` 経路に繋ぐ（イベント定義は先に確定させる）。
 *
 * 依存（物理・描画・時間・フレーム要求）はすべて引数で注入する。DOM や rAF を掴まないため、
 * 単体テストでは偽のフレーム駆動で決定論的に検証できる（NFR-05）。
 */

import { CONTAINER_LEFT, CONTAINER_RIGHT, DROP_Y, FPS_SAMPLE_WINDOW_MS } from './constants';
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
 * - `dropAt` … 入力（#6）が呼ぶ
 * - `addScore` … 合体（#7）が加点する
 * - `onFruitContact` / `emit` … 合体（#7）・ゲームオーバー（#9）が物理側の事象を拾って結果を通知する
 */
export interface GameController extends Game {
  /**
   * 指定 x（論理座標）に果物を落とす。落とせたら `true`。
   *
   * `status !== 'playing'` のときは何もしない。x は容器内へクランプする（#6 のクールダウンは入力側の責務）。
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
  /** 次に落とす果物の tier を決める（既定は tier 0。抽選の接続は #6） */
  nextTier?: () => FruitTier;
  /** 次フレームの要求。既定は `requestAnimationFrame` */
  requestFrame?: (callback: (timestampMs: number) => void) => number;
  /** フレーム要求の取り消し。既定は `cancelAnimationFrame` */
  cancelFrame?: (handle: number) => void;
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
  const nextTier = deps.nextTier ?? ((): FruitTier => 0);
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
    renderer.render({ fruits: physics.snapshot() });
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
      // ready を経由せず playing へ直行する（プレイヤーの操作なしで再開できる状態にする）
      setStatus('playing');
      renderer.resize();
      scheduleFrame();
    },

    dropAt(x, tier) {
      assertUsable();
      if (status !== 'playing') {
        return false;
      }
      const dropTier = tier ?? nextTier();
      /*
       * 果物が壁に食い込んだ状態で生成されると弾き出されるため、
       * 中心 x を「容器の内側 ± 半径」に収める。
       */
      const radius = FRUITS[dropTier]?.radius ?? 0;
      const minX = CONTAINER_LEFT + radius;
      const maxX = CONTAINER_RIGHT - radius;
      const clampedX = Math.min(Math.max(x, minX), Math.max(minX, maxX));
      physics.addFruit(dropTier, clampedX, DROP_Y);
      emitEvent('drop', { tier: dropTier });
      return true;
    },

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
