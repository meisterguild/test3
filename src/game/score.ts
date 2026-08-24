/**
 * スコア計算（FR-05）。
 *
 * 真理ソース: docs/specs/game-core-rules.md R-C（契約点 §6 はその要約）
 * 合体スコアは果物テーブルの列として持たず、式から導出する（D-2: 同じ値を 2 箇所に置かない）。
 */

import { MAX_TIER } from './fruits';
import type { FruitTier } from './types';

/** スイカ同士が消滅したときの加算スコア（FR-04） */
export const WATERMELON_ANNIHILATE_SCORE = 100;

/**
 * 合体で**生成される果物の tier** から加算スコアを求める。
 *
 * `mergeScore(t) = t * (t + 1) / 2`（三角数のため整数で閉じ、丸め誤差が出ない）。
 *
 * @param tier 生成される果物の tier（1〜{@link MAX_TIER}）。tier 0 は合体で生成されないため契約違反
 * @throws {RangeError} 範囲外の tier を渡した場合（E-8 / D-6: 静かに 0 点を返すとスコア欠落が
 *   テストをすり抜けるため、呼び出し側の契約違反として開発時に落とす）
 */
export function mergeScore(tier: FruitTier): number {
  if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER) {
    throw new RangeError(`mergeScore: tier は 1〜${MAX_TIER} の整数のみ（受け取った値: ${tier}）`);
  }
  return (tier * (tier + 1)) / 2;
}
