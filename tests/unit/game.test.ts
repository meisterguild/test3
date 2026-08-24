import { describe, expect, it, vi } from 'vitest';

import { CONTAINER_LEFT, CONTAINER_RIGHT, DROP_Y } from '../../src/game/constants';
import { FRUITS, MAX_TIER } from '../../src/game/fruits';
import { createGame, type GameEvents } from '../../src/game/game';
import type { FruitContact, FruitSnapshot, PhysicsWorld } from '../../src/game/physics';
import type { Renderer, Scene } from '../../src/game/renderer';
import { mergeScore, WATERMELON_ANNIHILATE_SCORE } from '../../src/game/score';
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
  /** 次の `step` の中で発火させる接触（Matter.js の衝突コールバックの発火位置を再現する） */
  let contactsDuringStep: FruitContact[] = [];
  /**
   * 衝突コールバックを抜けた直後（= まだ `step` の内側）に観測した盤面変更の累計回数。
   * R-D の「走査中に盤面を変更しない」を検証するために記録する。
   */
  const mutationsInsideStep: number[] = [];

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
      const queued = contactsDuringStep;
      contactsDuringStep = [];
      for (const contact of queued) {
        for (const handler of contactHandlers) {
          handler(contact);
        }
      }
      if (queued.length > 0) {
        mutationsInsideStep.push(added.length + removed.length);
      }
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

  /** 盤面にいる 2 個から接触ペアを組む（ID の指定ミスはテスト側の誤りとして落とす） */
  const contactOf = (fruitIdA: number, fruitIdB: number): FruitContact => {
    const a = fruits.find((fruit) => fruit.fruitId === fruitIdA);
    const b = fruits.find((fruit) => fruit.fruitId === fruitIdB);
    if (a === undefined || b === undefined) {
      throw new Error(`盤面に存在しない fruitId です: ${fruitIdA} / ${fruitIdB}`);
    }
    return { a, b };
  };

  return {
    physics,
    added,
    removed,
    steps,
    contactHandlers,
    contactOf,
    /** 次の `step` の中で発火させる接触を積む */
    queueContacts: (...contacts: FruitContact[]): void => {
      contactsDuringStep.push(...contacts);
    },
    mutationsInsideStep,
    /** 盤面の変更回数（追加 + 削除）。`mutationsInsideStep` との比較に使う */
    mutationCount: () => added.length + removed.length,
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

  it('merge イベントは emit 経由でも購読者へそのまま流れる', () => {
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

  it('onFruitContact は物理側の衝突通知をそのまま中継する（#9 の入口）', () => {
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

/**
 * 合体の組み込み（FR-03 / FR-04 / R-01。docs/specs/game-core-rules.md R-B / R-D）。
 *
 * 判定そのものは merge.test.ts が押さえているので、ここでは
 * **物理ボディの削除・生成・スコア加算・イベント発火**という game.ts の責務だけを見る。
 * 接触は物理スタブの `step` の中から発火させ、Matter.js の衝突コールバックの位置を再現する。
 */
describe('createGame の合体処理', () => {
  it('[FR-03] 同 tier の接触で tier+1 が中点に生成され、元の 2 個が消える', () => {
    const { game, physicsStub, frames } = setup({ drawTier: () => 0 });
    const merges: GameEvents['merge'][] = [];
    const scores: GameEvents['scorechange'][] = [];
    game.on('merge', (payload) => merges.push(payload));
    game.on('scorechange', (payload) => scores.push(payload));

    game.start();
    game.dropAt(200);
    game.dropAt(240);
    physicsStub.queueContacts(physicsStub.contactOf(1, 2));
    frames.runFrame(1000);

    expect(physicsStub.removed).toEqual([1, 2]);
    expect(physicsStub.added.at(-1)).toEqual({ tier: 1, x: 220, y: DROP_Y });
    expect(merges).toEqual([{ tier: 1, score: mergeScore(1), x: 220, y: DROP_Y }]);
    // scorechange はフレーム分をまとめて 1 回
    expect(scores).toEqual([{ score: mergeScore(1) }]);
    expect(game.score).toBe(mergeScore(1));
    // 盤面の果物は 2 個 → 1 個に減る
    expect(game.snapshot()).toHaveLength(1);
  });

  it('[FR-04] スイカ同士の接触で両方が消え、tier 11 は生成されない', () => {
    const { game, physicsStub, frames } = setup();
    const merges: GameEvents['merge'][] = [];
    game.on('merge', (payload) => merges.push(payload));

    game.start();
    game.dropAt(200, MAX_TIER);
    game.dropAt(240, MAX_TIER);
    physicsStub.queueContacts(physicsStub.contactOf(1, 2));
    frames.runFrame(1000);

    expect(physicsStub.removed).toEqual([1, 2]);
    // ドロップした 2 個以降は 1 個も追加されていない
    expect(physicsStub.added).toHaveLength(2);
    expect(game.snapshot()).toHaveLength(0);
    expect(game.score).toBe(WATERMELON_ANNIHILATE_SCORE);
    expect(merges).toEqual([
      { tier: MAX_TIER, score: WATERMELON_ANNIHILATE_SCORE, x: 220, y: DROP_Y },
    ]);
  });

  it('異 tier の接触では合体せず、スコアも盤面も動かない', () => {
    const { game, physicsStub, frames } = setup();
    const merges: GameEvents['merge'][] = [];
    game.on('merge', (payload) => merges.push(payload));

    game.start();
    game.dropAt(200, 2);
    game.dropAt(240, 3);
    physicsStub.queueContacts(physicsStub.contactOf(1, 2));
    frames.runFrame(1000);

    expect(physicsStub.removed).toEqual([]);
    expect(physicsStub.added).toHaveLength(2);
    expect(merges).toEqual([]);
    expect(game.score).toBe(0);
  });

  it('[R-01] 同一フレームに 3 個の同 tier が接触してもスコアが二重計上されない', () => {
    const { game, physicsStub, frames } = setup({ drawTier: () => 0 });
    const merges: GameEvents['merge'][] = [];
    const scores: GameEvents['scorechange'][] = [];
    game.on('merge', (payload) => merges.push(payload));
    game.on('scorechange', (payload) => scores.push(payload));

    game.start();
    game.dropAt(200);
    game.dropAt(220);
    game.dropAt(240);
    // 3 個が同時接触して重複ペアまで届く状況
    physicsStub.queueContacts(
      physicsStub.contactOf(1, 2),
      physicsStub.contactOf(2, 3),
      physicsStub.contactOf(1, 3),
      physicsStub.contactOf(1, 2),
    );
    frames.runFrame(1000);

    expect(merges).toHaveLength(1);
    expect(physicsStub.removed).toEqual([1, 2]);
    expect(game.score).toBe(mergeScore(1));
    expect(scores).toEqual([{ score: mergeScore(1) }]);
    // 余った 1 個 + 生成された 1 個
    expect(game.snapshot().map((fruit) => fruit.tier)).toEqual([0, 1]);
  });

  it('合体で生成された果物はその後のフレームで通常どおり合体する（連鎖）', () => {
    const { game, physicsStub, frames } = setup({ drawTier: () => 0 });
    const merges: GameEvents['merge'][] = [];
    game.on('merge', (payload) => merges.push(payload));

    game.start();
    game.dropAt(200);
    game.dropAt(240);
    physicsStub.queueContacts(physicsStub.contactOf(1, 2));
    frames.runFrame(1000);

    // 生成された tier 1（fruitId 3）に、同じ tier 1 を隣接させる
    game.dropAt(180, 1);
    physicsStub.queueContacts(physicsStub.contactOf(3, 4));
    frames.runFrame(1016);

    expect(merges.map((merge) => merge.tier)).toEqual([1, 2]);
    expect(physicsStub.added.at(-1)).toEqual({ tier: 2, x: 200, y: DROP_Y });
    expect(game.score).toBe(mergeScore(1) + mergeScore(2));
    expect(game.snapshot().map((fruit) => fruit.tier)).toEqual([2]);
  });

  it('[R-01] 盤面の変更は衝突コールバックの外（step 完了後）で行う', () => {
    const { game, physicsStub, frames } = setup({ drawTier: () => 0 });
    game.start();
    game.dropAt(200);
    game.dropAt(240);
    const before = physicsStub.mutationCount();

    physicsStub.queueContacts(physicsStub.contactOf(1, 2));
    frames.runFrame(1000);

    // コールバックを抜けた時点では盤面が変わっていない（Matter.js の走査中に World を触らない）
    expect(physicsStub.mutationsInsideStep).toEqual([before]);
    // フレームを抜けたあとに削除 2 件・生成 1 件が適用されている
    expect(physicsStub.mutationCount()).toBe(before + 3);
  });

  it('playing 以外のフレームで届いた接触は評価しない（E-13）', () => {
    const { game, physicsStub, frames } = setup({ drawTier: () => 0 });
    game.start();
    game.dropAt(200);
    game.dropAt(240);
    const contact = physicsStub.contactOf(1, 2);

    game.pause();
    for (const handler of physicsStub.contactHandlers) {
      handler(contact);
    }
    game.resume();
    frames.runFrame(1000);

    expect(physicsStub.removed).toEqual([]);
    expect(game.score).toBe(0);
  });

  it('restart は溜まっていた接触を捨てる（消えた果物を指すため）', () => {
    const { game, physicsStub, frames } = setup({ drawTier: () => 0 });
    game.start();
    game.dropAt(200);
    game.dropAt(240);
    for (const handler of physicsStub.contactHandlers) {
      handler(physicsStub.contactOf(1, 2));
    }

    game.restart();
    frames.runFrame(1000);

    expect(physicsStub.clearCount()).toBe(1);
    expect(physicsStub.removed).toEqual([]);
    expect(game.score).toBe(0);
  });
});
