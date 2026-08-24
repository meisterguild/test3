/**
 * 合体の判定ロジック（FR-03 / FR-04）。
 *
 * 真理ソース: docs/specs/game-core-rules.md R-B
 * 物理ボディの生成・削除やフレーム単位の畳み込み（R-D）はここでは扱わない（#7 の担当）。
 */

import { MAX_TIER } from './fruits';
import { mergeScore, WATERMELON_ANNIHILATE_SCORE } from './score';
import type { FruitTier, MergeResult } from './types';

/**
 * 接触した 2 個の tier から合体結果を求める純関数（引数の順序で結果は変わらない）。
 *
 * - 異 tier → `none`
 * - 同 tier かつ `tier < MAX_TIER` → `promote`（1 段階上の果物 1 個 + 加算スコア）
 * - 同 tier かつ `tier === MAX_TIER`（スイカ同士）→ `annihilate`（両方消滅・tier 11 は作らない）
 */
export function resolveMerge(a: FruitTier, b: FruitTier): MergeResult {
  if (a !== b) {
    return { kind: 'none' };
  }
  if (a === MAX_TIER) {
    return { kind: 'annihilate', score: WATERMELON_ANNIHILATE_SCORE };
  }
  // a < MAX_TIER が確定しているため、a + 1 は必ず FruitTier の範囲に収まる
  const promoted = (a + 1) as FruitTier;
  return { kind: 'promote', tier: promoted, score: mergeScore(promoted) };
}
