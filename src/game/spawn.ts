/**
 * 次に落とす果物の出現抽選（FR-08）。
 *
 * 真理ソース: docs/specs/game-core-rules.md R-F
 * 乱数源は引数で注入する（NFR-05: テストで固定して決定論的に検証できるようにするため）。
 */

import { SPAWNABLE_MAX_TIER, SPAWNABLE_TIERS, SPAWN_WEIGHTS } from './fruits';
import type { FruitTier } from './types';

/** 抽選重みの合計（R-F の累積表の右端） */
export const TOTAL_SPAWN_WEIGHT: number = SPAWN_WEIGHTS.reduce((sum, weight) => sum + weight, 0);

/**
 * tier 0〜4 から重み付き抽選で 1 つ選ぶ。
 *
 * `r = rng() * TOTAL_SPAWN_WEIGHT` としたとき、累積重みが `r` を超える最小の tier を返す
 * （境界 `r = 5, 9, 12, 14` は上位側の tier）。
 *
 * @param rng `0 <= rng() < 1` を返す乱数源。既定は `Math.random`
 * @returns 常に tier 0〜4。契約違反の乱数値（1 以上 / 負 / NaN）でも例外は投げず、
 *   範囲へクランプして返す（E-9: プレイ中に起きうるためゲームを止めない）
 */
export function drawFruitTier(rng: () => number = Math.random): FruitTier {
  const raw = rng() * TOTAL_SPAWN_WEIGHT;
  const r = Number.isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), TOTAL_SPAWN_WEIGHT);

  let cumulative = 0;
  for (const tier of SPAWNABLE_TIERS) {
    cumulative += SPAWN_WEIGHTS[tier];
    if (cumulative > r) {
      return tier;
    }
  }
  // ここに到達するのは r === TOTAL_SPAWN_WEIGHT のときだけ（rng() >= 1 をクランプした場合）
  return SPAWNABLE_MAX_TIER;
}

/**
 * {@link drawFruitTier} の別名。
 *
 * spec（真理ソース）は `drawFruitTier`、issue #4 の実装範囲は `nextTier` と表記が割れているため、
 * 両方の呼び名で参照できるようにしておく（実体は 1 つ）。呼び名の統一は #7 で spec と合わせて行う。
 */
export const nextTier = drawFruitTier;
