import { describe, expect, it } from 'vitest';

import { DEADLINE_Y, GAMEOVER_GRACE_MS } from '../../src/game/constants';
import {
  advanceOverflow,
  countOverflowing,
  isOverflowing,
  type DeadlineFruit,
} from '../../src/game/gameover';

/**
 * デッドライン超過の継続判定（docs/specs/game-core-rules.md R-E / AC-11 / AC-12）。
 *
 * 物理エンジンを使わず、盤面の値と経過時間だけで固定する（NFR-05）。
 */

/** 着地済み・任意の上端位置の果物を作る */
function fruit(overrides: Partial<DeadlineFruit> = {}): DeadlineFruit {
  return { y: DEADLINE_Y + 100, radius: 20, landed: true, ...overrides };
}

/** 上端（`y - radius`）が `top` になる果物 */
function fruitWithTop(top: number, overrides: Partial<DeadlineFruit> = {}): DeadlineFruit {
  const radius = overrides.radius ?? 20;
  return fruit({ ...overrides, radius, y: top + radius });
}

describe('isOverflowing（R-E: 超過している果物の定義）', () => {
  it('[D-3] 上端がデッドラインより上なら超過', () => {
    expect(isOverflowing(fruitWithTop(DEADLINE_Y - 1))).toBe(true);
  });

  it('[D-3] 中心ではなく上端で判定する（中心が線より下でも上端が上なら超過）', () => {
    // 中心 y = 130（線より下）、半径 20 → 上端 110（線より上）
    expect(isOverflowing(fruit({ y: DEADLINE_Y + 10, radius: 20 }))).toBe(true);
  });

  it('線にちょうど触れている状態（等号）は超過ではない', () => {
    expect(isOverflowing(fruitWithTop(DEADLINE_Y))).toBe(false);
  });

  it('線より下は超過ではない', () => {
    expect(isOverflowing(fruitWithTop(DEADLINE_Y + 1))).toBe(false);
  });

  it('[R-03 / R-2] 落下中（landed = false）は線より上でも判定対象外', () => {
    expect(isOverflowing(fruitWithTop(DEADLINE_Y - 100, { landed: false }))).toBe(false);
  });

  it('壊れた座標（NaN / Infinity）では超過にしない', () => {
    expect(isOverflowing(fruit({ y: Number.NaN }))).toBe(false);
    expect(isOverflowing(fruit({ y: Number.NEGATIVE_INFINITY }))).toBe(false);
    expect(isOverflowing(fruit({ radius: Number.NaN }))).toBe(false);
  });

  it('デッドラインの位置は引数で差し替えられる', () => {
    const target = fruitWithTop(200);
    expect(isOverflowing(target)).toBe(false);
    expect(isOverflowing(target, 300)).toBe(true);
  });
});

describe('countOverflowing', () => {
  it('超過している果物だけを数える', () => {
    const fruits = [
      fruitWithTop(DEADLINE_Y - 30),
      fruitWithTop(DEADLINE_Y - 1),
      fruitWithTop(DEADLINE_Y),
      fruitWithTop(DEADLINE_Y + 50),
      fruitWithTop(DEADLINE_Y - 50, { landed: false }),
    ];
    expect(countOverflowing(fruits)).toBe(2);
  });

  it('[E-10] 盤面が空なら 0', () => {
    expect(countOverflowing([])).toBe(0);
  });
});

describe('advanceOverflow（R-E: 継続時間の更新）', () => {
  const over = [fruitWithTop(DEADLINE_Y - 10)];

  it('[AC-11] 超過が続く間は経過時間を積み上げる', () => {
    const first = advanceOverflow(0, over, 100);
    expect(first).toEqual({ isOver: false, overMs: 100, overflowingCount: 1 });

    const second = advanceOverflow(first.overMs, over, 200);
    expect(second.overMs).toBe(300);
    expect(second.isOver).toBe(false);
  });

  it('[AC-11] 猶予時間の境界: 直前は未確定、到達で確定する', () => {
    expect(advanceOverflow(GAMEOVER_GRACE_MS - 2, over, 1).isOver).toBe(false);
    expect(advanceOverflow(GAMEOVER_GRACE_MS - 1, over, 1).isOver).toBe(true);
  });

  it('[E-10 / AC-12] 超過している果物が 0 個なら継続時間は 0 に戻る', () => {
    expect(advanceOverflow(GAMEOVER_GRACE_MS - 1, [], 100)).toEqual({
      isOver: false,
      overMs: 0,
      overflowingCount: 0,
    });
    expect(advanceOverflow(GAMEOVER_GRACE_MS - 1, [fruitWithTop(DEADLINE_Y + 1)], 100).overMs).toBe(
      0,
    );
  });

  it('[R-03 / AC-12] 落下中の果物だけが線より上にある盤面では確定しない', () => {
    const dropping = [fruitWithTop(DEADLINE_Y - 60, { landed: false })];
    const result = advanceOverflow(0, dropping, GAMEOVER_GRACE_MS * 10);
    expect(result).toEqual({ isOver: false, overMs: 0, overflowingCount: 0 });
  });

  it('[E-11] 経過時間 0 では積み上げない（超過の検出だけを行う）', () => {
    const result = advanceOverflow(500, over, 0);
    expect(result.overMs).toBe(500);
    expect(result.overflowingCount).toBe(1);
  });

  it('[E-11] 巨大な経過時間はそのまま積む（上限クランプは呼び出し側の責務）', () => {
    expect(advanceOverflow(0, over, 60_000).isOver).toBe(true);
  });

  it('壊れた入力（NaN / 負値）を 0 として扱い、例外を投げない', () => {
    expect(advanceOverflow(Number.NaN, over, 100).overMs).toBe(100);
    expect(advanceOverflow(-500, over, 100).overMs).toBe(100);
    expect(advanceOverflow(100, over, Number.NaN).overMs).toBe(100);
    expect(advanceOverflow(100, over, -100).overMs).toBe(100);
  });

  it('猶予時間・デッドラインは引数で差し替えられる', () => {
    expect(advanceOverflow(0, over, 100, { graceMs: 50 }).isOver).toBe(true);
    // 線を上へずらせば同じ盤面が超過しなくなる
    expect(advanceOverflow(0, over, 100, { deadlineY: 0 }).overflowingCount).toBe(0);
  });

  it('引数の配列・前フレームの値を書き換えない（純関数）', () => {
    const fruits = [fruitWithTop(DEADLINE_Y - 10)];
    const snapshot = structuredClone(fruits);
    advanceOverflow(120, fruits, 30);
    expect(fruits).toEqual(snapshot);
  });
});
