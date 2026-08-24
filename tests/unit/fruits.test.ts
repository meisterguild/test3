/**
 * 果物定義テーブルの単体テスト（docs/specs/game-core-rules.md R-A / AC-1 / R-4）。
 *
 * 期待値は spec の表を**ハードコード**する（R-4: 実装定数をそのまま読み直すと乖離を検知できない）。
 */

import { describe, expect, it } from 'vitest';

import {
  FRUITS,
  MAX_TIER,
  SPAWNABLE_MAX_TIER,
  SPAWNABLE_TIERS,
  SPAWN_WEIGHTS,
} from '../../src/game/fruits';
import type { FruitDef } from '../../src/game/types';

/** docs/specs/game-core-rules.md R-A の表（tier / label / radius / color） */
const SPEC_TABLE: readonly FruitDef[] = [
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

describe('[game-core-rules:AC-1] 果物テーブルが tier 0〜10 で一意に定まる', () => {
  it('要素数は 11（tier は増減しない）', () => {
    expect(FRUITS).toHaveLength(11);
    expect(MAX_TIER).toBe(10);
  });

  it('index === tier で並び、label は非空・color は CSS カラー文字列', () => {
    FRUITS.forEach((fruit, index) => {
      expect(fruit.tier).toBe(index);
      expect(fruit.label.length).toBeGreaterThan(0);
      expect(fruit.color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  it('半径が tier に対して厳密単調増加（14 → 98）', () => {
    const radii = FRUITS.map((fruit) => fruit.radius);
    expect(radii[0]).toBe(14);
    expect(radii.at(-1)).toBe(98);
    // 昇順に並んでいて、かつ重複がない ＝ 厳密単調増加
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
    expect(new Set(radii).size).toBe(radii.length);
  });
});

describe('[game-core-rules:R-4] 実装定数が spec の表と一致する', () => {
  it('FRUITS が R-A の表と完全一致する', () => {
    expect(FRUITS).toEqual(SPEC_TABLE);
  });

  it('抽選範囲は tier 0〜4、重みは [5, 4, 3, 2, 1]', () => {
    expect(SPAWNABLE_TIERS).toEqual([0, 1, 2, 3, 4]);
    expect(SPAWN_WEIGHTS).toEqual([5, 4, 3, 2, 1]);
    // 抽選対象はすべて実在する tier であること
    for (const tier of SPAWNABLE_TIERS) {
      expect(FRUITS[tier]?.tier).toBe(tier);
    }
  });

  it('SPAWNABLE_MAX_TIER が SPAWNABLE_TIERS の末尾と一致する', () => {
    expect(SPAWNABLE_MAX_TIER).toBe(SPAWNABLE_TIERS.at(-1));
  });
});
