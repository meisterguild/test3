/**
 * デッドライン超過の継続判定（FR-07 / R-03）。
 *
 * ルールの真理ソース: docs/specs/game-core-rules.md R-E
 * 契約点: docs/internal/architecture/suika-game-structure.md §5（`DEADLINE_Y` / `GAMEOVER_GRACE_MS`）
 *
 * 本モジュールは**純関数だけ**を持つ。物理エンジン・DOM・時計に触らず、
 * 「盤面の値」と「経過時間」から次の超過継続時間を計算するだけ（NFR-05）。
 * 状態（`overMs`）の保持と `status === 'playing'` の間だけ進めるゲートは game.ts の責務
 * （spec R-E: ポーズ中に時間が進んでゲームオーバーになるのを防ぐ。R-6）。
 *
 * 座標系は契約点 §5 の論理座標系（y は下方向が正）。したがって「デッドラインより上」は
 * `y` が小さい側で、果物の上端は `y - radius` になる（spec D-3: 中心ではなく上端で判定する）。
 */

import { DEADLINE_Y, GAMEOVER_GRACE_MS } from './constants';

/**
 * 判定に必要な果物 1 個の値（spec R-E の盤面スナップショット）。
 *
 * `physics.ts` の `FruitSnapshot` の**部分集合**にしてあるため、game.ts は
 * `physics.snapshot()` の結果をそのまま渡せる（毎フレームの詰め替え配列を作らない。NFR-01）。
 *
 * 果物 ID を受け取らないのは、判定が「超過している果物が 1 個以上か」という集約だけを見るため
 * （spec R-E は `overMs` を盤面全体で 1 つ持つ。個体ごとの継続時間は仕様に無い）。
 */
export interface DeadlineFruit {
  /** 中心 y（論理座標） */
  y: number;
  /** 半径（論理座標 px） */
  radius: number;
  /**
   * ドロップ後に一度でも他の物体（壁・床・果物）と接触したか（spec R-E の `landed`）。
   *
   * `false`（＝落下中）の果物は判定対象外。`DROP_Y`（60）は `DEADLINE_Y`（120）より上にあるため、
   * この除外がないとドロップするたびに超過カウントが始まる（R-2 / AC-12）。
   */
  landed: boolean;
}

export interface DeadlineOptions {
  /** デッドラインの y。既定は {@link DEADLINE_Y} */
  deadlineY?: number;
  /** 超過を許容する継続時間 (ms)。既定は {@link GAMEOVER_GRACE_MS} */
  graceMs?: number;
}

/** 1 フレーム分の判定結果（spec Outputs の「ゲームオーバー判定」） */
export interface DeadlineState {
  /** ゲームオーバーが確定したか（`overMs >= graceMs`） */
  isOver: boolean;
  /** 更新後の超過継続時間 (ms)。超過している果物が 0 個なら 0 */
  overMs: number;
  /** そのフレームで超過していた果物の個数（デバッグ・警告表示用） */
  overflowingCount: number;
}

/** 有限な数値だけを通す。壊れた値（`NaN` / `Infinity`）で判定を動かさないための門 */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * この果物がデッドラインを超過しているか（spec R-E）。
 *
 * 「上端がデッドラインより上」＝ `y - radius < deadlineY`。
 * **等号は超過ではない**（線にちょうど触れている状態はセーフ）。
 *
 * @param deadlineY 判定に使うデッドライン。既定は {@link DEADLINE_Y}
 */
export function isOverflowing(fruit: DeadlineFruit, deadlineY: number = DEADLINE_Y): boolean {
  if (!fruit.landed) {
    return false;
  }
  if (!Number.isFinite(fruit.y) || !Number.isFinite(fruit.radius)) {
    // 壊れた座標でゲームを終わらせない（物理の異常値は #5 の責務）
    return false;
  }
  return fruit.y - fruit.radius < deadlineY;
}

/**
 * 超過している果物の個数（盤面果物数に対して線形。NFR-01）。
 *
 * @param deadlineY 判定に使うデッドライン。既定は {@link DEADLINE_Y}
 */
export function countOverflowing(
  fruits: readonly DeadlineFruit[],
  deadlineY: number = DEADLINE_Y,
): number {
  let count = 0;
  for (const fruit of fruits) {
    if (isOverflowing(fruit, deadlineY)) {
      count += 1;
    }
  }
  return count;
}

/**
 * 超過継続時間を 1 フレーム分進める（spec R-E の継続時間の更新）。
 *
 * - 超過している果物が 1 個以上 → `overMs += dtMs`
 * - 超過している果物が 0 個 → `overMs = 0`（リセット。E-10 の「果物 0 個」もここに落ちる）
 * - `overMs >= graceMs` → ゲームオーバー確定
 *
 * 呼び出しは `status === 'playing'` のフレームだけ（ゲートは game.ts）。
 * `dtMs` は「実際に物理が進んだ時間」を渡す（E-11: タブ復帰直後の巨大な delta を
 * そのまま渡すと猶予を飛び越えて即終了になる。上限クランプは呼び出し側の責務）。
 *
 * @param prevOverMs 前フレームまでの継続時間。負値・非有限値は 0 として扱う
 * @param dtMs このフレームで進んだ時間 (ms)。負値・非有限値は 0 として扱う（加算しない）
 * @returns 更新後の状態（引数は変更しない）
 */
export function advanceOverflow(
  prevOverMs: number,
  fruits: readonly DeadlineFruit[],
  dtMs: number,
  options: DeadlineOptions = {},
): DeadlineState {
  const deadlineY = finiteOr(options.deadlineY ?? DEADLINE_Y, DEADLINE_Y);
  const graceMs = finiteOr(options.graceMs ?? GAMEOVER_GRACE_MS, GAMEOVER_GRACE_MS);
  const overflowingCount = countOverflowing(fruits, deadlineY);

  if (overflowingCount === 0) {
    return { isOver: false, overMs: 0, overflowingCount: 0 };
  }

  const base = Math.max(0, finiteOr(prevOverMs, 0));
  const delta = Math.max(0, finiteOr(dtMs, 0));
  const overMs = base + delta;
  return { isOver: overMs >= graceMs, overMs, overflowingCount };
}
