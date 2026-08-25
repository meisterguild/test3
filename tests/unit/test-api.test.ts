import { describe, expect, it, vi } from 'vitest';

import { installTestApi, TEST_API_VERSION, type SuikaTestApi } from '../../src/debug/test-api';
import { CONTAINER_LEFT, CONTAINER_RIGHT } from '../../src/game/constants';
import { FRUITS } from '../../src/game/fruits';
import type { FruitBody, FruitSnapshot } from '../../src/game/physics';
import type { FruitTier } from '../../src/game/types';

/**
 * テストフック（`src/debug/test-api.ts`）の単体テスト。
 *
 * E2E 側はフックの**振る舞い**に依存するため、フック自身の契約（公開先・検証・委譲先）は
 * ここで固定する。実物の `GameController` / `PhysicsWorld` は使わない（NFR-05）。
 */

function createStubDeps() {
  const dropped: { x: number; tier: FruitTier | undefined }[] = [];
  const placed: { tier: FruitTier; x: number; y: number; landed: boolean }[] = [];
  let clearCount = 0;
  const fruits: FruitSnapshot[] = [
    {
      fruitId: 1,
      tier: 2,
      x: 100,
      y: 200,
      radius: FRUITS[2]?.radius ?? 0,
      angle: 0,
      isSleeping: true,
      landed: true,
    },
  ];

  const game = {
    status: 'playing' as const,
    score: 42,
    overMs: 300,
    aimX: 123,
    snapshot: (): FruitSnapshot[] => [...fruits],
    dropAt: vi.fn((x: number, tier?: FruitTier): boolean => {
      dropped.push({ x, tier });
      return true;
    }),
  };

  const physics = {
    addFruit: vi.fn(
      (tier: FruitTier, x: number, y: number, options?: { landed?: boolean }): FruitBody => {
        placed.push({ tier, x, y, landed: options?.landed ?? false });
        // 本フックが読むのは `fruitId` だけなので、他の Body のプロパティは持たせない
        return { fruitId: placed.length } as unknown as FruitBody;
      },
    ),
    clearFruits: vi.fn((): void => {
      clearCount += 1;
    }),
  };

  const target: { __suikaTestApi?: SuikaTestApi } = {};
  return {
    game,
    physics,
    target,
    dropped,
    placed,
    clearCount: () => clearCount,
    install: (): SuikaTestApi => installTestApi({ game, physics, target }),
  };
}

describe('installTestApi', () => {
  it('公開先に指定した版のフックを載せる', () => {
    const deps = createStubDeps();
    const api = deps.install();

    expect(deps.target.__suikaTestApi).toBe(api);
    expect(api.version).toBe(TEST_API_VERSION);
  });

  it('観測系はゲームの現在値をそのまま返す', () => {
    const api = createStubDeps().install();

    expect(api.status()).toBe('playing');
    expect(api.score()).toBe(42);
    expect(api.overMs()).toBe(300);
    expect(api.aimX()).toBe(123);
    expect(api.fruits()).toHaveLength(1);
    expect(api.fruits()[0]?.tier).toBe(2);
  });

  it('スナップショットは呼ぶたびに別の配列を返す（呼び出し側の変更が漏れない）', () => {
    const api = createStubDeps().install();

    const first = api.fruits();
    first.length = 0;

    expect(api.fruits()).toHaveLength(1);
  });

  it('drop は tier を明示して dropAt へ委譲する（先読みキューを消費しない）', () => {
    const deps = createStubDeps();
    const api = deps.install();

    expect(api.drop(3, 200)).toBe(true);
    expect(deps.dropped).toEqual([{ x: 200, tier: 3 }]);
  });

  it('place は着地済みとして物理世界へ追加し、払い出された ID を返す', () => {
    const deps = createStubDeps();
    const api = deps.install();

    expect(api.place(1, 200, 300)).toBe(1);
    expect(deps.placed).toEqual([{ tier: 1, x: 200, y: 300, landed: true }]);
  });

  it('place の x は容器の内側（半径ぶん内側）へクランプされる', () => {
    const deps = createStubDeps();
    const api = deps.install();
    const radius = FRUITS[4]?.radius ?? 0;

    api.place(4, -1000, 300);
    api.place(4, 1000, 300);

    expect(deps.placed.map((entry) => entry.x)).toEqual([
      CONTAINER_LEFT + radius,
      CONTAINER_RIGHT - radius,
    ]);
  });

  it('clear は物理世界の果物だけを取り除く', () => {
    const deps = createStubDeps();
    const api = deps.install();

    api.clear();

    expect(deps.clearCount()).toBe(1);
  });

  it('範囲外の tier は RangeError で落とす（E2E 側の誤りを黙って飲み込まない）', () => {
    const api = createStubDeps().install();
    const outOfRange = 11 as FruitTier;

    expect(() => api.drop(outOfRange, 200)).toThrow(RangeError);
    expect(() => api.place(outOfRange, 200, 300)).toThrow(RangeError);
  });

  it('有限でない座標は RangeError で落とす', () => {
    const api = createStubDeps().install();

    expect(() => api.drop(0, Number.NaN)).toThrow(RangeError);
    expect(() => api.place(0, Number.POSITIVE_INFINITY, 300)).toThrow(RangeError);
    expect(() => api.place(0, 200, Number.NaN)).toThrow(RangeError);
  });
});
