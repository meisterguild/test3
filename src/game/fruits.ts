/**
 * 果物定義テーブル（DT-01）と出現抽選の重み（FR-08）。
 *
 * 真理ソース: docs/specs/game-core-rules.md R-A（契約点 §4 はその要約）
 * 値を変えるときは spec を先に更新する（R-4: 数値の二重管理による乖離を防ぐ）。
 */

import type { FruitDef, FruitTier } from './types';

/**
 * 果物定義。**index === tier** で保持する（11 段階固定・増減しない）。
 * 半径は論理座標系（契約点 §5: 480×720）の px。
 */
export const FRUITS: readonly FruitDef[] = [
  { tier: 0, label: 'さくらんぼ', radius: 14, color: '#d63c3c' },
  { tier: 1, label: 'いちご', radius: 19, color: '#e8556d' },
  { tier: 2, label: 'ぶどう', radius: 25, color: '#8e5fb0' },
  { tier: 3, label: 'デコポン', radius: 31, color: '#f2a03d' },
  { tier: 4, label: 'かき', radius: 38, color: '#e8762c' },
  { tier: 5, label: 'りんご', radius: 46, color: '#d93a3a' },
  { tier: 6, label: 'なし', radius: 55, color: '#d9d95e' },
  { tier: 7, label: 'もも', radius: 64, color: '#f2a3b3' },
  { tier: 8, label: 'パイナップル', radius: 74, color: '#e0c341' },
  { tier: 9, label: 'メロン', radius: 85, color: '#9ad14b' },
  { tier: 10, label: 'スイカ', radius: 98, color: '#3f8f4a' },
];

/** 最大 tier（スイカ）。これ以上の果物は存在しない（合体しても tier 11 を作らない） */
export const MAX_TIER = 10 satisfies FruitTier;

/**
 * 出現抽選の対象 tier。`SPAWN_WEIGHTS` と **同じ並び**（index === tier）で持つ。
 * タプルとして固定するのは、`SPAWN_WEIGHTS[tier]` の添字アクセスを型で保証するため。
 */
export const SPAWNABLE_TIERS = [0, 1, 2, 3, 4] as const satisfies readonly FruitTier[];

/** 出現抽選で出うる最大 tier（`SPAWNABLE_TIERS` の末尾と一致する。整合はテストで固定する） */
export const SPAWNABLE_MAX_TIER = 4 satisfies FruitTier;

/** 出現抽選の重み（R-F）。index === tier で `SPAWNABLE_TIERS` に対応する */
export const SPAWN_WEIGHTS = [5, 4, 3, 2, 1] as const satisfies readonly number[];
