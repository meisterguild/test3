import { expect, test, type Page } from '@playwright/test';

import {
  CONTAINER_FLOOR_Y,
  CONTAINER_LEFT,
  CONTAINER_RIGHT,
  GAMEOVER_GRACE_MS,
} from '../../src/game/constants';
import { FRUITS, SPAWNABLE_TIERS } from '../../src/game/fruits';
import { mergeScore } from '../../src/game/score';
import type { FruitTier } from '../../src/game/types';
import { logicalToClientX } from './support/canvas-probe';
import {
  dropFruit,
  openWithTestApi,
  placeFruits,
  readAimX,
  readFruits,
  readScore,
  readStatus,
  waitForRest,
  type FruitPlacement,
} from './support/test-api';

/**
 * 要件レベルの受け入れ条件 AC-01〜AC-05 と R-01 の通しシナリオ（T-11 / NFR-04）。
 *
 * AC の定義は `docs/specs/game-core-rules.md`「要件レベル受け入れ条件（AC-01〜AC-06）」、
 * AC ↔ テストの対応表は `docs/deliverables/test-scenarios/suika-game-e2e.md`。
 * AC-06（レスポンシブ / タッチ）は 375×667 のプロジェクトで走らせる必要があるため
 * `responsive.spec.ts` 側に置く。
 *
 * **flaky 対策**: 物理シミュレーションは非決定的なので、盤面の組み立てと観測は
 * テストフック（`?testapi=1` → `window.__suikaTestApi`。実体は `src/debug/test-api.ts`）
 * 経由で行う。「静止した」は待機時間ではなく `isSleeping`、「合体した」は待機時間ではなく
 * スコアと果物の tier で観測する（`support/test-api.ts`）。
 *
 * 盤面の定数（容器・デッドライン・猶予時間）とルールの期待値（`mergeScore`）は
 * 実装から import する。同じ数値をテストへ書き写すと spec R-4（二重管理による乖離）を
 * 自分で作ることになるため。
 */

/** 落とした果物が転がって止まる範囲の許容量（論理座標 px） */
const ROLL_TOLERANCE = 80;

/** 床の上で静止したと認める許容量（論理座標 px。めり込み・浮きの両方向） */
const FLOOR_TOLERANCE = 6;

/** 合体・ゲームオーバーの成立を待つ上限（物理の立ち上がり + 猶予時間ぶんの余裕を見る） */
const MERGE_TIMEOUT_MS = 15_000;
const GAMEOVER_TIMEOUT_MS = GAMEOVER_GRACE_MS + 20_000;

/** 満杯の盤面を組むときの格子間隔（最大半径 38 の tier 4 が重ならない幅） */
const FILL_CELL = 80;

/** 格子の列（論理座標 x）。容器の内側（40〜440）に tier 4 が収まる位置 */
const FILL_COLUMNS = [80, 160, 240, 320, 400] as const;

/** 格子に使う 2 種類の果物。隣接セルで必ず別 tier になるよう市松に置く（＝置いた瞬間には合体しない） */
const FILL_TIERS = [4, 3] as const satisfies readonly FruitTier[];

/** 積み増しの上限（1 巡ぶんの高さ）。壁の上端（`WALL_TOP_Y = 0`）より外へ置かないための天井 */
const FILL_MAX_ROWS = 6;

/** 果物を置かない上端の余白（論理座標 px）。ここより上は壁が無く、横へ抜けうる */
const FILL_TOP_MARGIN = 20;

/** 1 巡ぶん置いたあと、落ち着く（合体・沈み込み）のを待つ時間 */
const FILL_SETTLE_MS = 900;

/** 積み増しの試行回数の上限。手元では 5 巡前後で確定する（無限ループにしないための蓋） */
const FILL_MAX_ROUNDS = 12;

/**
 * 容器を満杯にしてゲームオーバーへ到達させる（AC-04）。
 *
 * 実操作で積み上げると数十秒かかるうえ、積み方が出現抽選（spec R-F）に依存して安定しない。
 * テストフックで**着地済みの果物を格子状に直接置き**、空いている高さを埋め続ける。
 *
 * 1 度置いて終わりにできないのは、積んだ山が落ち着く過程で同 tier どうしが合体し
 * （2 個 → 1 個）、山がデッドラインより下へ沈むため。**空き空間を測って積み増す**
 * ことを繰り返すと、合体で減る量より積む量が勝ってやがて超過が続く。
 *
 * 市松に 2 tier を置くのは、置いた直後に合体で崩れないようにするため（隣接セルは必ず別 tier）。
 * 巡ごとに市松の位相をずらすのは、同じ列に同 tier が積み重なるのを避けるため。
 */
async function fillUntilGameOver(page: Page): Promise<void> {
  const radius = FRUITS[FILL_TIERS[0]]?.radius ?? 0;

  for (let round = 0; round < FILL_MAX_ROUNDS; round += 1) {
    if ((await readStatus(page)) === 'over') {
      return;
    }
    // 着地済みの山の上端。落下中の果物は「積み上がった高さ」ではないので除く（spec R-E）
    const landed = (await readFruits(page)).filter((fruit) => fruit.landed);
    const pileTop =
      landed.length === 0
        ? CONTAINER_FLOOR_Y
        : Math.min(...landed.map((fruit) => fruit.y - fruit.radius));

    const rows = Math.min(
      FILL_MAX_ROWS,
      Math.max(1, Math.floor((pileTop - FILL_TOP_MARGIN) / FILL_CELL)),
    );
    const placements: FruitPlacement[] = [];
    for (let row = 0; row < rows; row += 1) {
      const y = pileTop - radius - row * FILL_CELL;
      for (const [col, x] of FILL_COLUMNS.entries()) {
        placements.push({ tier: FILL_TIERS[(row + col + round) % 2] ?? FILL_TIERS[0], x, y });
      }
    }
    await placeFruits(page, placements);
    await page.waitForTimeout(FILL_SETTLE_MS);
  }
}

/**
 * 同じ tier 0（さくらんぼ）を同じ列へ 2 個落として 1 回だけ合体させる。
 *
 * 出現抽選（spec R-F）に依存しないよう tier を明示して落とす。1 個目が静止してから
 * 2 個目を落とすので、接触するのは必ずこの 2 個（＝加算されるスコアは `mergeScore(1)` の 1 回分）。
 */
async function mergeTwoCherries(page: Page, logicalX: number): Promise<void> {
  expect(await dropFruit(page, 0, logicalX)).toBe(true);
  await waitForRest(page, 1);
  expect(await dropFruit(page, 0, logicalX)).toBe(true);
  await expect
    .poll(() => readScore(page), { timeout: MERGE_TIMEOUT_MS, message: '合体でスコアが増えない' })
    .toBe(mergeScore(1));
}

test('[AC-01] 初回アクセスでゲーム画面が表示され、次の果物が見える', async ({ page }) => {
  await page.goto('/');

  // 盤面・HUD・操作バーが揃って見えている（UI-01）
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('controls')).toBeVisible();
  await expect(page.getByTestId('pause-toggle')).toBeVisible();
  await expect(page.getByTestId('boot-error')).toHaveCount(0);

  // 開始時点のスコアは 0、ゲームオーバーモーダルは出ていない
  await expect(page.getByTestId('score')).toHaveText('0');
  await expect(page.getByTestId('gameover-modal')).toBeHidden();

  // FR-08: 次の果物が抽選対象（tier 0〜4）の名前で予告されている
  const spawnableLabels = SPAWNABLE_TIERS.map((tier) => FRUITS[tier]?.label ?? '');
  await expect(page.getByTestId('next-fruit')).toHaveText(
    new RegExp(`^(${spawnableLabels.join('|')})$`),
  );
});

test('[AC-02] 狙いを左右に動かしてドロップすると、果物が落ちて容器内で静止する', async ({
  page,
}) => {
  await openWithTestApi(page);

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }
  const pointerY = box.y + box.height / 2;

  // FR-01: ポインタの位置に狙いが追従する（左 → 右）
  await page.mouse.move(logicalToClientX(box, 120), pointerY);
  await expect.poll(() => readAimX(page)).toBeLessThan(160);
  await page.mouse.move(logicalToClientX(box, 360), pointerY);
  await expect.poll(() => readAimX(page)).toBeGreaterThan(320);

  const aimX = await readAimX(page);
  await page.mouse.down();
  await page.mouse.up();

  // FR-02: 落ちて容器の中で静止する（判定は isSleeping。待機時間では待たない）
  const [fruit] = await waitForRest(page, 1);
  expect(fruit).toBeDefined();
  if (fruit === undefined) {
    return;
  }
  expect(fruit.x - fruit.radius).toBeGreaterThanOrEqual(CONTAINER_LEFT - FLOOR_TOLERANCE);
  expect(fruit.x + fruit.radius).toBeLessThanOrEqual(CONTAINER_RIGHT + FLOOR_TOLERANCE);
  // 床の上まで落ちている（＝空中で止まっていない）
  expect(fruit.y + fruit.radius).toBeGreaterThan(CONTAINER_FLOOR_Y - FLOOR_TOLERANCE);
  expect(fruit.y + fruit.radius).toBeLessThan(CONTAINER_FLOOR_Y + FLOOR_TOLERANCE);
  // 落とした位置の近くに留まっている（転がりぶんは許容する）
  expect(Math.abs(fruit.x - aimX)).toBeLessThan(ROLL_TOLERANCE);
});

test('[AC-03] 同種果物を接触させると 1 段階上へ合体し、スコアが増える', async ({ page }) => {
  await openWithTestApi(page);

  await mergeTwoCherries(page, (CONTAINER_LEFT + CONTAINER_RIGHT) / 2);

  // FR-03: 2 個が 1 段階上の 1 個になる（盤面の果物数は 1 減る）
  const [merged] = await waitForRest(page, 1);
  expect(merged?.tier).toBe(1);
  // FR-05: HUD の表示もルールどおりの点数になっている
  await expect(page.getByTestId('score')).toHaveText(String(mergeScore(1)));
});

test('[AC-04] 容器を満杯にするとゲームオーバーモーダルが表示される', async ({ page }) => {
  await openWithTestApi(page);

  await fillUntilGameOver(page);

  // FR-07: デッドライン超過が猶予時間続くと終了する（spec R-E）
  const modal = page.getByTestId('gameover-modal');
  await expect(modal).toBeVisible({ timeout: GAMEOVER_TIMEOUT_MS });
  expect(await readStatus(page)).toBe('over');

  // UI-02: 最終スコアとハイスコアが読める
  await expect(page.getByTestId('final-score')).not.toBeEmpty();
  await expect(page.getByTestId('final-high-score')).not.toBeEmpty();
});

test('[AC-05] リロード後もハイスコアが保持されている', async ({ page }) => {
  await openWithTestApi(page);

  await mergeTwoCherries(page, (CONTAINER_LEFT + CONTAINER_RIGHT) / 2);

  // FR-06: ハイスコアはゲームオーバーを待たず、超えた時点で保存される
  await expect(page.getByTestId('high-score')).toHaveText(String(mergeScore(1)));

  await page.reload();

  // 現在スコアは 0 に戻り、ハイスコアだけが残る
  await expect(page.getByTestId('score')).toHaveText('0');
  await expect(page.getByTestId('high-score')).toHaveText(String(mergeScore(1)));
});

test('[R-01] 同時接触でもスコアが二重計上されない', async ({ page }) => {
  await openWithTestApi(page);

  /*
   * 同 tier 3 個をわずかに重ねて置き、1 フレームで [(A,B), (B,C)] が届く状況を作る（spec R-D）。
   * 二重計上されると `mergeScore(1)` の 2 倍が入る。ペアが別フレームに割れた場合も
   * 「成立するのは 1 組だけ・残り 1 個は別 tier なので以降は合体しない」ため期待値は同じ。
   */
  const radius = FRUITS[0]?.radius ?? 0;
  const centerX = (CONTAINER_LEFT + CONTAINER_RIGHT) / 2;
  const gap = radius * 2 - 1;
  const y = CONTAINER_FLOOR_Y - radius;
  await placeFruits(page, [
    { tier: 0, x: centerX - gap, y },
    { tier: 0, x: centerX, y },
    { tier: 0, x: centerX + gap, y },
  ]);

  await expect
    .poll(() => readScore(page), { timeout: MERGE_TIMEOUT_MS, message: '合体が成立しない' })
    .toBe(mergeScore(1));

  // 成立するのは 1 組だけ。余った 1 個はそのまま残る（spec E-3）
  const fruits = await waitForRest(page, 2);
  expect(fruits.map((fruit) => fruit.tier).sort()).toEqual([0, 1]);
  // 以降もスコアは動かない（別 tier どうしは合体しない）
  expect(await readScore(page)).toBe(mergeScore(1));
  expect((await readFruits(page)).length).toBe(2);
});
