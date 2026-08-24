/**
 * 合体判定の単体テスト（docs/specs/game-core-rules.md R-B / R-D）。
 *
 * - 接触 1 組の解決: AC-2 / AC-4 / AC-5
 * - フレーム単位の畳み込み: AC-6 / AC-7 / R-1（物理エンジンには依存せず、接触ペア列を直接投入する）
 */

import { describe, expect, it } from 'vitest';

import { MAX_TIER } from '../../src/game/fruits';
import { resolveMerge, resolveMergeBatch, type MergeCandidate } from '../../src/game/merge';
import { mergeScore, WATERMELON_ANNIHILATE_SCORE } from '../../src/game/score';
import type { FruitTier } from '../../src/game/types';

const ALL_TIERS: readonly FruitTier[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** 合体で昇格しうる tier（0〜9） */
const PROMOTABLE_TIERS = ALL_TIERS.filter((tier) => tier !== MAX_TIER);

/** 接触ペアを組み立てるための果物 1 個（座標は中点の検証に使う） */
function fruit(fruitId: number, tier: FruitTier, x: number, y: number): MergeCandidate {
  return { fruitId, tier, x, y };
}

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

describe('resolveMergeBatch: 1 組の接触の畳み込み結果', () => {
  it('[game-core-rules:AC-2] promote は生成 tier・加算スコア・中点を返す', () => {
    const result = resolveMergeBatch([{ a: fruit(1, 2, 100, 200), b: fruit(2, 2, 140, 300) }]);

    expect(result.score).toBe(mergeScore(3));
    expect(result.merges).toEqual([
      {
        kind: 'promote',
        tier: 3,
        score: mergeScore(3),
        x: 120,
        y: 250,
        consumedFruitIds: [1, 2],
      },
    ]);
  });

  it('[game-core-rules:AC-4] annihilate は生成 tier を持たず、消滅 ID だけを返す', () => {
    const result = resolveMergeBatch([
      { a: fruit(1, MAX_TIER, 100, 100), b: fruit(2, MAX_TIER, 200, 100) },
    ]);

    expect(result.score).toBe(WATERMELON_ANNIHILATE_SCORE);
    expect(result.merges).toEqual([
      {
        kind: 'annihilate',
        tier: MAX_TIER,
        score: WATERMELON_ANNIHILATE_SCORE,
        x: 150,
        y: 100,
        consumedFruitIds: [1, 2],
      },
    ]);
  });

  it('[game-core-rules:AC-5] 異 tier の接触は合体を生まない', () => {
    const result = resolveMergeBatch([
      { a: fruit(1, 3, 0, 0), b: fruit(2, 4, 0, 0) },
      { a: fruit(3, 0, 0, 0), b: fruit(4, 10, 0, 0) },
    ]);

    expect(result).toEqual({ merges: [], score: 0 });
  });

  it('接触ペアが 0 件でもスコア 0・合体 0 件を返す（E-2 で壁・床は除外済み）', () => {
    expect(resolveMergeBatch([])).toEqual({ merges: [], score: 0 });
  });
});

describe('[game-core-rules:AC-6] 1 フレーム内で同一果物が二重に合体しない', () => {
  it('[game-core-rules:R-1] ペア列 [(A,B), (B,C)] では (A,B) だけが成立し、C は残る', () => {
    const a = fruit(1, 1, 100, 100);
    const b = fruit(2, 1, 120, 100);
    const c = fruit(3, 1, 140, 100);

    const result = resolveMergeBatch([
      { a, b },
      { a: b, b: c },
    ]);

    expect(result.merges).toHaveLength(1);
    expect(result.score).toBe(mergeScore(2));
    expect(result.merges[0]?.consumedFruitIds).toEqual([1, 2]);
    // C（fruitId 3）はどの合体にも参加していない
    expect(result.merges.flatMap((merge) => [...merge.consumedFruitIds])).not.toContain(3);
  });

  it('[game-core-rules:R-1] 同一ペアが重複して届いてもスコアは 1 回分（E-4）', () => {
    const a = fruit(1, 0, 0, 0);
    const b = fruit(2, 0, 10, 0);

    const result = resolveMergeBatch([
      { a, b },
      { a, b },
      { a: b, b: a },
    ]);

    expect(result.merges).toHaveLength(1);
    expect(result.score).toBe(mergeScore(1));
  });

  it('消滅済みの果物を含むペアが後から届いても例外を投げず不成立になる（E-5）', () => {
    const a = fruit(1, 5, 0, 0);
    const b = fruit(2, 5, 0, 0);
    const c = fruit(3, 5, 0, 0);
    const d = fruit(4, 5, 0, 0);

    const result = resolveMergeBatch([
      { a, b },
      { a: c, b: a }, // a は消費済みなので不成立。c は残る
      { a: c, b: d }, // c はまだ残っているので成立する
    ]);

    expect(result.merges.map((merge) => merge.consumedFruitIds)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(result.score).toBe(mergeScore(6) * 2);
  });

  it('スイカ 3 個の同時接触では 1 組だけ消滅する（E-6）', () => {
    const a = fruit(1, MAX_TIER, 0, 0);
    const b = fruit(2, MAX_TIER, 0, 0);
    const c = fruit(3, MAX_TIER, 0, 0);

    const result = resolveMergeBatch([
      { a, b },
      { a: b, b: c },
      { a, b: c },
    ]);

    expect(result.merges).toHaveLength(1);
    expect(result.score).toBe(WATERMELON_ANNIHILATE_SCORE);
  });

  it('同一果物どうしのペアが届いても自己合体しない', () => {
    const a = fruit(1, 2, 0, 0);
    expect(resolveMergeBatch([{ a, b: a }])).toEqual({ merges: [], score: 0 });
  });
});

describe('[game-core-rules:AC-7] 同フレームに生成された果物は連鎖合体しない', () => {
  it('2 組が同時合体しても加算スコアは 2 組分のみ（生成果物は同フレームの判定に参加しない）', () => {
    const result = resolveMergeBatch([
      { a: fruit(1, 3, 0, 0), b: fruit(2, 3, 20, 0) },
      { a: fruit(3, 3, 100, 0), b: fruit(4, 3, 120, 0) },
    ]);

    expect(result.merges).toHaveLength(2);
    expect(result.merges.every((merge) => merge.tier === 4)).toBe(true);
    // 生成される tier 4 が 2 個できるが、その合体（tier 5）は同フレームでは成立しない
    expect(result.score).toBe(mergeScore(4) * 2);
  });

  it('入力順に対して決定論的（同じペア列なら常に同じ結果）', () => {
    const contacts = [
      { a: fruit(1, 1, 0, 0), b: fruit(2, 1, 40, 0) },
      { a: fruit(2, 1, 40, 0), b: fruit(3, 1, 80, 0) },
    ];

    expect(resolveMergeBatch(contacts)).toEqual(resolveMergeBatch(contacts));
  });
});
