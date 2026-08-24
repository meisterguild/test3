import { describe, expect, it, vi } from 'vitest';

import { CONTAINER_LEFT, CONTAINER_RIGHT, DROP_Y } from '../../src/game/constants';
import { FRUITS } from '../../src/game/fruits';
import { createGame, type GameEvents } from '../../src/game/game';
import type { FruitContact, FruitSnapshot, PhysicsWorld } from '../../src/game/physics';
import type { Renderer, Scene } from '../../src/game/renderer';
import type { FruitTier, GameStatus } from '../../src/game/types';

/** 物理世界のスタブ。呼び出しの記録だけを行い、Matter.js には依存しない（NFR-05） */
function createStubPhysics() {
  const added: { tier: FruitTier; x: number; y: number }[] = [];
  const removed: number[] = [];
  const steps: number[] = [];
  const contactHandlers = new Set<(contact: FruitContact) => void>();
  let fruits: FruitSnapshot[] = [];
  let clearCount = 0;
  let disposeCount = 0;

  const physics: PhysicsWorld = {
    addFruit(tier, x, y) {
      added.push({ tier, x, y });
      const snapshot: FruitSnapshot = {
        fruitId: added.length,
        tier,
        x,
        y,
        radius: FRUITS[tier]?.radius ?? 0,
        angle: 0,
        isSleeping: false,
      };
      fruits = [...fruits, snapshot];
      // 返り値の FruitBody は game.ts では参照しないため、必要な形だけ満たす
      return { fruitId: snapshot.fruitId, tier } as never;
    },
    removeFruit(fruitId) {
      removed.push(fruitId);
      fruits = fruits.filter((fruit) => fruit.fruitId !== fruitId);
    },
    snapshot: () => [...fruits],
    fruitCount: () => fruits.length,
    step(deltaMs) {
      steps.push(deltaMs);
      return 1;
    },
    onFruitContact(handler) {
      contactHandlers.add(handler);
      return () => contactHandlers.delete(handler);
    },
    clearFruits() {
      clearCount += 1;
      fruits = [];
    },
    dispose() {
      disposeCount += 1;
    },
  };

  return {
    physics,
    added,
    removed,
    steps,
    contactHandlers,
    clearCount: () => clearCount,
    disposeCount: () => disposeCount,
  };
}

function createStubRenderer() {
  const scenes: Scene[] = [];
  let resizeCount = 0;
  const renderer: Renderer = {
    resize() {
      resizeCount += 1;
      return true;
    },
    render(scene) {
      scenes.push(scene);
    },
    scale: 1,
  };
  return { renderer, scenes, resizeCount: () => resizeCount };
}

/** rAF のスタブ。`runFrame(timestamp)` で 1 フレームだけ進める */
function createFrameDriver() {
  let nextHandle = 1;
  const pending = new Map<number, (timestampMs: number) => void>();
  const cancelled: number[] = [];

  return {
    // createGame へ関数として渡すため、this に依存しないアロー関数で持つ
    requestFrame: (callback: (timestampMs: number) => void): number => {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle: number): void => {
      cancelled.push(handle);
      pending.delete(handle);
    },
    cancelled,
    pendingCount: (): number => pending.size,
    runFrame: (timestampMs: number): void => {
      const [entry] = [...pending.entries()];
      if (entry === undefined) {
        throw new Error('保留中のフレームがありません');
      }
      const [handle, callback] = entry;
      pending.delete(handle);
      callback(timestampMs);
    },
  };
}

function setup(options: { drawTier?: () => FruitTier } = {}) {
  const physicsStub = createStubPhysics();
  const rendererStub = createStubRenderer();
  const frames = createFrameDriver();
  const game = createGame({
    physics: physicsStub.physics,
    renderer: rendererStub.renderer,
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    ...(options.drawTier === undefined ? {} : { drawTier: options.drawTier }),
  });
  return { game, physicsStub, rendererStub, frames };
}

/** 呼ばれた順に tier を返す抽選スタブ（尽きたら最後の値を繰り返す） */
function drawTierSequence(tiers: readonly FruitTier[]): () => FruitTier {
  let index = 0;
  return () => {
    const tier = tiers[Math.min(index, tiers.length - 1)] ?? 0;
    index += 1;
    return tier;
  };
}

describe('createGame', () => {
  it('生成直後は ready、start で playing になり statuschange が発火する', () => {
    const { game, frames } = setup();
    const statuses: GameStatus[] = [];
    game.on('statuschange', ({ status }) => statuses.push(status));

    expect(game.status).toBe('ready');
    game.start();

    expect(game.status).toBe('playing');
    expect(statuses).toEqual(['playing']);
    expect(frames.pendingCount()).toBe(1);
    // 二重 start は無視する（statuschange も増えない）
    game.start();
    expect(statuses).toEqual(['playing']);
  });

  it('ループは物理を進めてから描画する。初回フレームの delta は 0', () => {
    const { game, physicsStub, rendererStub, frames } = setup();
    game.start();

    frames.runFrame(1000);
    expect(physicsStub.steps).toEqual([0]);
    expect(rendererStub.scenes).toHaveLength(1);

    frames.runFrame(1016);
    expect(physicsStub.steps).toEqual([0, 16]);
    expect(rendererStub.scenes).toHaveLength(2);
    // 次フレームが継続して予約されている
    expect(frames.pendingCount()).toBe(1);
  });

  it('pause でループが止まり、resume で delta 0 から再開する', () => {
    const { game, physicsStub, frames } = setup();
    const statuses: GameStatus[] = [];
    game.on('statuschange', ({ status }) => statuses.push(status));
    game.start();
    frames.runFrame(1000);
    frames.runFrame(1016);

    game.pause();
    expect(game.status).toBe('paused');
    expect(frames.pendingCount()).toBe(0);
    expect(frames.cancelled).toHaveLength(1);

    game.resume();
    expect(game.status).toBe('playing');
    // 停止中に経過した時間が巨大な delta として物理に渡らないこと
    frames.runFrame(9000);
    expect(physicsStub.steps).toEqual([0, 16, 0]);
    expect(statuses).toEqual(['playing', 'paused', 'playing']);
  });

  it('paused では pause / start を無視し、playing では resume を無視する', () => {
    const { game } = setup();
    game.resume();
    expect(game.status).toBe('ready');

    game.start();
    game.resume();
    expect(game.status).toBe('playing');

    game.pause();
    game.pause();
    expect(game.status).toBe('paused');
    game.start();
    expect(game.status).toBe('paused');
  });

  it('[FR-02] dropAt は DROP_Y に果物を追加して drop イベントを発火する', () => {
    const { game, physicsStub } = setup({ drawTier: () => 3 });
    const drops: GameEvents['drop'][] = [];
    game.on('drop', (payload) => drops.push(payload));

    game.start();
    expect(game.dropAt(240)).toBe(true);

    expect(physicsStub.added).toEqual([{ tier: 3, x: 240, y: DROP_Y }]);
    expect(drops).toEqual([{ tier: 3 }]);
  });

  it('dropAt の x は容器の内側（±半径）へクランプされる', () => {
    const { game, physicsStub } = setup({ drawTier: () => 2 });
    const radius = FRUITS[2]?.radius ?? 0;
    game.start();

    game.dropAt(-100);
    game.dropAt(10_000);

    expect(physicsStub.added.map((fruit) => fruit.x)).toEqual([
      CONTAINER_LEFT + radius,
      CONTAINER_RIGHT - radius,
    ]);
  });

  it('playing 以外では dropAt が何もしない', () => {
    const { game, physicsStub } = setup();
    expect(game.dropAt(240)).toBe(false);

    game.start();
    game.pause();
    expect(game.dropAt(240)).toBe(false);
    expect(physicsStub.added).toHaveLength(0);
  });

  it('[FR-08] 生成時に current / next の 2 個を抽選し、ドロップで繰り上げる', () => {
    const { game } = setup({ drawTier: drawTierSequence([0, 1, 2, 3]) });

    expect(game.currentTier).toBe(0);
    expect(game.nextTier).toBe(1);

    game.start();
    game.drop();
    expect(game.currentTier).toBe(1);
    expect(game.nextTier).toBe(2);

    game.drop();
    expect(game.currentTier).toBe(2);
    expect(game.nextTier).toBe(3);
  });

  it('[FR-08] tier を明示した dropAt は先読みキューを消費しない', () => {
    const { game, physicsStub } = setup({ drawTier: drawTierSequence([0, 1, 2]) });
    game.start();

    game.dropAt(240, 9);

    expect(physicsStub.added).toEqual([{ tier: 9, x: 240, y: DROP_Y }]);
    expect(game.currentTier).toBe(0);
    expect(game.nextTier).toBe(1);
  });

  it('[FR-01] aimAt は狙いを容器の内側（±現在の果物の半径）へクランプする', () => {
    const { game } = setup({ drawTier: () => 4 });
    const radius = FRUITS[4]?.radius ?? 0;
    game.start();

    // 初期値は容器の中央
    expect(game.aimX).toBe((CONTAINER_LEFT + CONTAINER_RIGHT) / 2);

    game.aimAt(300);
    expect(game.aimX).toBe(300);

    game.aimAt(-9999);
    expect(game.aimX).toBe(CONTAINER_LEFT + radius);

    game.aimAt(9999);
    expect(game.aimX).toBe(CONTAINER_RIGHT - radius);

    // 壊れた値は無視する（直前の狙いを保つ）
    game.aimAt(Number.NaN);
    expect(game.aimX).toBe(CONTAINER_RIGHT - radius);
  });

  it('[FR-01] drop は現在の狙い位置へ current を落とす', () => {
    const { game, physicsStub } = setup({ drawTier: drawTierSequence([1, 2]) });
    game.start();

    game.aimAt(180);
    expect(game.drop()).toBe(true);

    expect(physicsStub.added).toEqual([{ tier: 1, x: 180, y: DROP_Y }]);
    // 落とした位置に次の果物が待機する
    expect(game.aimX).toBe(180);
  });

  it('[FR-01] 繰り上げ後の果物が大きい場合、狙いは新しい半径で再クランプされる', () => {
    // tier 0（半径 14）→ tier 10（半径 98）。端に寄せた狙いは内側へ戻る
    const { game } = setup({ drawTier: drawTierSequence([0, 10]) });
    game.start();

    game.aimAt(9999);
    expect(game.aimX).toBe(CONTAINER_RIGHT - (FRUITS[0]?.radius ?? 0));

    game.drop();
    expect(game.currentTier).toBe(10);
    expect(game.aimX).toBe(CONTAINER_RIGHT - (FRUITS[10]?.radius ?? 0));
  });

  it('playing 以外では aimAt / drop が何もしない', () => {
    const { game, physicsStub } = setup();
    game.aimAt(300);
    expect(game.aimX).toBe((CONTAINER_LEFT + CONTAINER_RIGHT) / 2);
    expect(game.drop()).toBe(false);

    game.start();
    game.pause();
    game.aimAt(300);
    expect(game.aimX).toBe((CONTAINER_LEFT + CONTAINER_RIGHT) / 2);
    expect(game.drop()).toBe(false);
    expect(physicsStub.added).toHaveLength(0);
  });

  it('[FR-01] ドロップ待機中の果物を DROP_Y に描画する（ゲームオーバー後は描かない）', () => {
    const { game, rendererStub, frames } = setup({ drawTier: () => 2 });
    game.start();
    game.aimAt(200);
    frames.runFrame(1000);

    expect(rendererStub.scenes.at(-1)?.preview).toEqual({ tier: 2, x: 200, y: DROP_Y });

    game.emit('gameover', { score: 0, highScore: 0, isNewHighScore: false });
    game.redraw();
    expect(rendererStub.scenes.at(-1)?.preview).toBeUndefined();
  });

  it('addScore は累計スコアを更新して scorechange を発火する（変化しない加算は発火しない）', () => {
    const { game } = setup();
    const scores: number[] = [];
    game.on('scorechange', ({ score }) => scores.push(score));

    game.addScore(10);
    game.addScore(5);
    game.addScore(0);
    game.addScore(Number.NaN);

    expect(game.score).toBe(15);
    expect(scores).toEqual([10, 15]);
  });

  it('restart は果物とスコアをリセットして playing に戻す', () => {
    const { game, physicsStub, rendererStub, frames } = setup();
    const events: string[] = [];
    game.on('statuschange', ({ status }) => events.push(`status:${status}`));
    game.on('scorechange', ({ score }) => events.push(`score:${score}`));

    game.start();
    game.dropAt(240);
    game.addScore(30);
    frames.runFrame(1000);

    game.restart();

    expect(game.status).toBe('playing');
    expect(game.score).toBe(0);
    expect(physicsStub.clearCount()).toBe(1);
    expect(rendererStub.resizeCount()).toBe(2);
    expect(events).toEqual(['status:playing', 'score:30', 'score:0']);
    // リセット後もループが回り続ける
    frames.runFrame(2000);
    expect(frames.pendingCount()).toBe(1);
  });

  it('[FR-08] restart は先読みキューを引き直し、狙いを中央へ戻す', () => {
    const { game } = setup({ drawTier: drawTierSequence([0, 1, 2, 3]) });
    game.start();
    game.aimAt(150);
    game.drop();

    game.restart();

    expect(game.currentTier).toBe(3);
    expect(game.nextTier).toBe(3);
    expect(game.aimX).toBe((CONTAINER_LEFT + CONTAINER_RIGHT) / 2);
  });

  it('gameover の emit は over へ遷移させ、statuschange を先に流してループを止める', () => {
    const { game, frames } = setup();
    const order: string[] = [];
    game.on('statuschange', ({ status }) => order.push(`status:${status}`));
    game.on('gameover', ({ score }) => order.push(`gameover:${score}`));

    game.start();
    frames.runFrame(1000);
    game.emit('gameover', { score: 42, highScore: 42, isNewHighScore: true });

    expect(game.status).toBe('over');
    expect(order).toEqual(['status:playing', 'status:over', 'gameover:42']);
    expect(frames.pendingCount()).toBe(0);
    // over からは restart のみ受け付ける
    game.resume();
    expect(game.status).toBe('over');
    game.restart();
    expect(game.status).toBe('playing');
  });

  it('merge イベントは購読者へそのまま流れる（発火元は #7）', () => {
    const { game } = setup();
    const merges: GameEvents['merge'][] = [];
    game.on('merge', (payload) => merges.push(payload));

    game.emit('merge', { tier: 4, score: 10, x: 100, y: 200 });

    expect(merges).toEqual([{ tier: 4, score: 10, x: 100, y: 200 }]);
  });

  it('on の戻り値で購読を解除できる', () => {
    const { game } = setup();
    const handler = vi.fn();
    const unsubscribe = game.on('drop', handler);
    game.start();
    game.dropAt(240);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    game.dropAt(240);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('onFruitContact は物理側の衝突通知をそのまま中継する（#7 の入口）', () => {
    const { game, physicsStub } = setup();
    const handler = vi.fn();
    game.onFruitContact(handler);

    const contact: FruitContact = {
      a: { fruitId: 1, tier: 1, x: 0, y: 0, radius: 19, angle: 0, isSleeping: false },
      b: { fruitId: 2, tier: 1, x: 1, y: 1, radius: 19, angle: 0, isSleeping: false },
    };
    for (const contactHandler of physicsStub.contactHandlers) {
      contactHandler(contact);
    }

    expect(handler).toHaveBeenCalledWith(contact);
  });

  it('snapshot / resize / redraw は物理・描画へ委譲する', () => {
    const { game, rendererStub } = setup();
    game.start();
    game.dropAt(240);

    expect(game.snapshot()).toHaveLength(1);
    expect(game.resize()).toBe(true);
    game.redraw();
    expect(rendererStub.scenes.at(-1)?.fruits).toHaveLength(1);
  });

  it('[NFR-01] fps は実測フレーム間隔から算出する', () => {
    const { game, frames } = setup();
    game.start();

    expect(game.fps).toBe(0);
    // 16ms 間隔（≒60fps）で 1 秒分進める
    for (let i = 0; i <= 62; i += 1) {
      frames.runFrame(1000 + i * 16);
    }

    expect(game.fps).toBeGreaterThan(55);
    expect(game.fps).toBeLessThan(65);
  });

  it('dispose 後はループが止まり、操作は例外になる', () => {
    const { game, physicsStub, frames } = setup();
    game.start();
    game.dispose();

    expect(frames.pendingCount()).toBe(0);
    expect(physicsStub.disposeCount()).toBe(1);
    expect(() => game.start()).toThrow(/dispose/);
    expect(() => game.dropAt(240)).toThrow(/dispose/);
    // dispose は冪等
    expect(() => game.dispose()).not.toThrow();
  });
});
