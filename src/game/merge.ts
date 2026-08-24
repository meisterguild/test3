/**
 * 合体の判定ロジック（FR-03 / FR-04）とフレーム単位の畳み込み（R-D）。
 *
 * 真理ソース: docs/specs/game-core-rules.md R-B / R-D
 * どちらも Matter.js を import しない純関数（NFR-05）。物理ボディの生成・削除と
 * イベント発火は本モジュールの戻り値を受けた game.ts の責務。
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

/**
 * 合体判定に必要な果物 1 個分の情報（spec Inputs の `FruitRef`）。
 * 物理層のスナップショット（`FruitSnapshot`）はこの形を満たす。
 */
export interface MergeCandidate {
  fruitId: number;
  tier: FruitTier;
  x: number;
  y: number;
}

/** 1 フレームに届いた接触 1 組 */
export interface MergeContact {
  a: MergeCandidate;
  b: MergeCandidate;
}

/** 成立した合体 1 件。物理層への適用指示と `merge` イベントの payload を兼ねる */
export interface ResolvedMerge {
  kind: 'promote' | 'annihilate';
  /**
   * `promote` は**生成する**果物の tier、`annihilate` は消滅したスイカの tier（`MAX_TIER`）。
   * どちらも「この合体で成立した段階」を表すので、`merge` イベントではこの値をそのまま流す。
   */
  tier: FruitTier;
  /** この合体 1 件で加算されるスコア */
  score: number;
  /** 消滅する 2 個の中心の中点（`promote` の生成位置。R-B） */
  x: number;
  y: number;
  /** 盤面から取り除く 2 個（spec Outputs の「消滅果物 ID 集合」） */
  consumedFruitIds: readonly [number, number];
}

/** 1 フレーム分の合体解決の結果 */
export interface MergeBatchResult {
  /** 成立した合体（入力順） */
  merges: ResolvedMerge[];
  /** そのフレームの加算スコアの総和（0 以上の整数） */
  score: number;
}

/**
 * 1 フレーム分の接触ペア列を畳み込み、成立する合体だけを返す（R-D）。
 *
 * **消費済み `fruitId` を持ちながら入力順に 1 パスで畳み込む**ため、同一果物が 1 フレームで
 * 2 回合体することはない（＝スコアの二重計上が構造的に起きない。R-1 / AC-6）。
 * 生成される果物は戻り値に予約として載るだけで後続ペアの判定に参加しないため、
 * 同フレーム内の連鎖も起きない（D-4 / AC-7。連鎖は次フレーム以降に成立する）。
 *
 * 計算量は接触ペア数に対して線形（NFR-01）。
 *
 * @param contacts 物理層のイベント到着順に並んだ接触ペア。同一ペアの重複・
 *   既に消滅した果物を含むペア（E-4 / E-5）が混ざっていてもよい（例外を投げず読み飛ばす）
 */
export function resolveMergeBatch(contacts: Iterable<MergeContact>): MergeBatchResult {
  /** この畳み込みで既に合体に参加した果物の ID */
  const consumed = new Set<number>();
  const merges: ResolvedMerge[] = [];
  let score = 0;

  for (const { a, b } of contacts) {
    // 同一果物どうしのペアは物理層では起きないが、届いても合体させない（自己合体の防止）
    if (a.fruitId === b.fruitId) {
      continue;
    }
    if (consumed.has(a.fruitId) || consumed.has(b.fruitId)) {
      continue;
    }
    const result = resolveMerge(a.tier, b.tier);
    if (result.kind === 'none') {
      continue;
    }
    consumed.add(a.fruitId);
    consumed.add(b.fruitId);
    score += result.score;
    merges.push({
      kind: result.kind,
      tier: result.kind === 'promote' ? result.tier : a.tier,
      score: result.score,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      consumedFruitIds: [a.fruitId, b.fruitId],
    });
  }

  return { merges, score };
}
