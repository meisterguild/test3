/**
 * 合体判定の単体テスト（docs/specs/game-core-rules.md R-B / AC-2 / AC-4 / AC-5）。
 *
 * フレーム単位の畳み込み（R-D / AC-6 / AC-7）は #7 の実装範囲なのでここでは扱わない。
 */

import { describe, expect, it } from 'vitest';

import { MAX_TIER } from '../../src/game/fruits';
import { resolveMerge } from '../../src/game/merge';
import { mergeScore, WATERMELON_ANNIHILATE_SCORE } from '../../src/game/score';
import type { FruitTier } from '../../src/game/types';

const ALL_TIERS: readonly FruitTier[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** 合体で昇格しうる tier（0〜9） */
const PROMOTABLE_TIERS = ALL_TIERS.filter((tier) => tier !== MAX_TIER);

describe('[game-core-rules:AC-2] 同 tier（0〜9）の接触は 1 段階上へ合体する', () => {
  it.each(PROMOTABLE_TIERS)(
    'tier %i 同士 → tier + 1 へ昇格し、生成 tier のスコアが入る',
    (tier) => {
      const promoted = (tier + 1) as FruitTier;
      expect(resolveMerge(tier, tier)).toEqual({
        kind: 'promote',
        tier: promoted,
        score: mergeScore(promoted),
      });
    },
  );

  it('昇格先は必ず MAX_TIER 以下', () => {
    for (const tier of PROMOTABLE_TIERS) {
      const result = resolveMerge(tier, tier);
      expect(result.kind).toBe('promote');
      if (result.kind === 'promote') {
        expect(result.tier).toBeLessThanOrEqual(MAX_TIER);
      }
    }
  });
});

describe('[game-core-rules:AC-4] スイカ同士は両方消滅し 100 点が入る', () => {
  it('tier 10 同士 → annihilate（新果物は生成しない）', () => {
    const result = resolveMerge(MAX_TIER, MAX_TIER);
    expect(result).toEqual({ kind: 'annihilate', score: WATERMELON_ANNIHILATE_SCORE });
    expect(result).not.toHaveProperty('tier');
  });
});

describe('[game-core-rules:AC-5] 異なる tier の接触では何も起きない', () => {
  it('隣接 tier を含むすべての異 tier の組み合わせが none', () => {
    for (const a of ALL_TIERS) {
      for (const b of ALL_TIERS) {
        if (a === b) {
          continue;
        }
        expect(resolveMerge(a, b)).toEqual({ kind: 'none' });
      }
    }
  });

  it('none にはスコアも生成 tier も含まれない', () => {
    const result = resolveMerge(0, 1);
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('tier');
  });
});

describe('resolveMerge は引数の順序に依存しない純関数', () => {
  it('(a, b) と (b, a) の結果が一致し、同じ入力で常に同じ結果を返す', () => {
    for (const a of ALL_TIERS) {
      for (const b of ALL_TIERS) {
        expect(resolveMerge(a, b)).toEqual(resolveMerge(b, a));
        expect(resolveMerge(a, b)).toEqual(resolveMerge(a, b));
      }
    }
  });
});
