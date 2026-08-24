/**
 * ゲームコアの共有型。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §3（この形を変える変更は契約点の更新を伴う）
 * ルールの真理ソース: docs/specs/game-core-rules.md
 *
 * 本ファイルは型のみを持ち、物理エンジン（Matter.js）に依存しない（NFR-05）。
 */

/** 果物の段階。0 = さくらんぼ 〜 10 = スイカ */
export type FruitTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface FruitDef {
  tier: FruitTier;
  /** 日本語表示名（HUD / a11y ラベルに使う） */
  label: string;
  /** 論理座標系での半径 (px) */
  radius: number;
  /** 塗り色 (CSS カラー) */
  color: string;
}

export type GameStatus = 'ready' | 'playing' | 'paused' | 'over';

/** 合体判定の結果。物理エンジンに依存しない純粋な値 */
export type MergeResult =
  | { kind: 'none' }
  | { kind: 'promote'; tier: FruitTier; score: number }
  | { kind: 'annihilate'; score: number };
