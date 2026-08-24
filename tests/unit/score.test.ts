/**
 * スコア計算の単体テスト（docs/specs/game-core-rules.md R-C / AC-3 / AC-13 / E-8）。
 */

import { describe, expect, it } from 'vitest';

import { mergeScore, WATERMELON_ANNIHILATE_SCORE } from '../../src/game/score';
import type { FruitTier } from '../../src/game/types';

/** R-C のスコア表（生成される果物の tier → 加算スコア） */
const SPEC_SCORES: ReadonlyArray<{ tier: FruitTier; score: number }> = [
  { tier: 1, score: 1 },
  { tier: 2, score: 3 },
  { tier: 3, score: 6 },
  { tier: 4, score: 10 },
  { tier: 5, score: 15 },
  { tier: 6, score: 21 },
  { tier: 7, score: 28 },
  { tier: 8, score: 36 },
  { tier: 9, score: 45 },
  { tier: 10, score: 55 },
];

describe('[game-core-rules:AC-3] 合体スコアが t * (t + 1) / 2 で決まる', () => {
  it.each(SPEC_SCORES)('tier $tier → $score 点', ({ tier, score }) => {
    expect(mergeScore(tier)).toBe(score);
  });

  it('戻り値は常に非負整数（丸め誤差が出ない）', () => {
    for (const { tier } of SPEC_SCORES) {
      const score = mergeScore(tier);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThan(0);
    }
  });

  it('スイカ同士の消滅スコアは 100 点', () => {
    expect(WATERMELON_ANNIHILATE_SCORE).toBe(100);
  });
});

describe('[game-core-rules:AC-13] 累計スコアが合体スコアの総和として単調非減少に増える', () => {
  it('promote と annihilate の混在列で総和と一致し、減少するフレームがない', () => {
    const merges: readonly number[] = [
      mergeScore(1),
      mergeScore(2),
      WATERMELON_ANNIHILATE_SCORE,
      mergeScore(5),
      mergeScore(10),
    ];

    let total = 0;
    const history = merges.map((gain) => {
      total += gain;
      return total;
    });

    expect(total).toBe(1 + 3 + 100 + 15 + 55);
    expect(history).toEqual([...history].sort((a, b) => a - b));
    expect(history.at(-1)).toBe(total);
  });
});

describe('[game-core-rules:E-8] 範囲外 tier での呼び出しは RangeError', () => {
  it.each([0, 11, -1, 1.5, Number.NaN])('mergeScore(%s) は RangeError を投げる', (value) => {
    expect(() => mergeScore(value as FruitTier)).toThrow(RangeError);
  });
});
