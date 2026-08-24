/**
 * 出現抽選の単体テスト（docs/specs/game-core-rules.md R-F / AC-8 / AC-9 / R-3）。
 *
 * 先読みキュー（AC-10）はゲーム状態機械側の責務なのでここでは扱わない。
 */

import { describe, expect, it } from 'vitest';

import { SPAWNABLE_TIERS } from '../../src/game/fruits';
import { drawFruitTier, nextTier, TOTAL_SPAWN_WEIGHT } from '../../src/game/spawn';
import type { FruitTier } from '../../src/game/types';

/** 与えた値を順に返す乱数源（尽きたら最後の値を返し続ける） */
function sequenceRng(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value ?? 0;
  };
}

const fixedRng = (value: number): (() => number) => sequenceRng([value]);

describe('[game-core-rules:AC-8] 出現抽選が tier 0〜4 の重み付きで決定論的に行われる', () => {
  it('重みの合計は 15', () => {
    expect(TOTAL_SPAWN_WEIGHT).toBe(15);
  });

  it.each([
    { rngValue: 0, expected: 0 },
    { rngValue: 0.3, expected: 0 },
    { rngValue: 0.34, expected: 1 },
    { rngValue: 0.6, expected: 2 },
    { rngValue: 0.8, expected: 3 },
    { rngValue: 0.9, expected: 3 },
    { rngValue: 0.99, expected: 4 },
  ])('rng() = $rngValue → tier $expected', ({ rngValue, expected }) => {
    expect(drawFruitTier(fixedRng(rngValue))).toBe(expected);
  });

  it.each([
    // 境界（r = 5, 9, 12, 14）は上位側の tier を選ぶ
    { r: 5, expected: 1 },
    { r: 9, expected: 2 },
    { r: 12, expected: 3 },
    { r: 14, expected: 4 },
  ])('累積境界 r = $r → tier $expected', ({ r, expected }) => {
    expect(drawFruitTier(fixedRng(r / TOTAL_SPAWN_WEIGHT))).toBe(expected);
  });

  it('同じ乱数列に対して常に同じ結果を返す（決定論的）', () => {
    const values = [0.01, 0.42, 0.77, 0.95, 0.5];
    const run = (): FruitTier[] => {
      const rng = sequenceRng(values);
      return values.map(() => drawFruitTier(rng));
    };
    expect(run()).toEqual([0, 1, 2, 4, 1]);
    expect(run()).toEqual(run());
  });
});

describe('[game-core-rules:R-3] 抽選比率が SPAWN_WEIGHTS どおりで、偏った系列も再現できる', () => {
  it('r を等間隔に走査すると 5 : 4 : 3 : 2 : 1 になる', () => {
    const samples = 15_000;
    const counts = new Map<FruitTier, number>(SPAWNABLE_TIERS.map((tier) => [tier, 0]));
    for (let i = 0; i < samples; i += 1) {
      const tier = drawFruitTier(fixedRng(i / samples));
      counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([5000, 4000, 3000, 2000, 1000]);
  });

  it('大玉が連続する系列を固定 rng で再現できる', () => {
    const biased = sequenceRng([0.99, 0.95, 0.99]);
    expect([drawFruitTier(biased), drawFruitTier(biased), drawFruitTier(biased)]).toEqual([
      4, 4, 4,
    ]);
  });
});

describe('[game-core-rules:AC-9] 契約外の乱数値でも抽選結果が範囲を外れない', () => {
  it.each([
    { label: '1', rngValue: 1, expected: 4 },
    { label: '1.5', rngValue: 1.5, expected: 4 },
    { label: '-0.1', rngValue: -0.1, expected: 0 },
    { label: 'NaN', rngValue: Number.NaN, expected: 0 },
  ])('rng() = $label → 例外を投げず tier $expected', ({ rngValue, expected }) => {
    expect(() => drawFruitTier(fixedRng(rngValue))).not.toThrow();
    expect(drawFruitTier(fixedRng(rngValue))).toBe(expected);
  });
});

describe('drawFruitTier の既定引数と別名', () => {
  it('既定の Math.random でも常に tier 0〜4 を返す', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(SPAWNABLE_TIERS).toContain(drawFruitTier());
    }
  });

  it('nextTier は drawFruitTier と同一の実体', () => {
    expect(nextTier).toBe(drawFruitTier);
    expect(nextTier(fixedRng(0.5))).toBe(drawFruitTier(fixedRng(0.5)));
  });
});
