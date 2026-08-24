import { expect, test } from '@playwright/test';

/**
 * ゲームオーバー・リスタート・ポーズ（T-09 / FR-07 / FR-09 / UI-02）のスモークテスト。
 *
 * 判定規則そのものは tests/unit/gameover.test.ts（純関数）と tests/unit/game.test.ts
 * （状態機械）が固定している。ここでは**実ブラウザで 1 ゲームが終わり、もう一度遊べること**
 * だけを見る。AC 付きの網羅シナリオは T-11 で追加する。
 */

/**
 * ゲームオーバーへ到達するための連続投入（`?stress=` / `?interval=` は main.ts のデバッグ足場）。
 *
 * クールダウンより短い間隔で落とし続けると、デッドラインより上の超過が途切れないまま
 * 猶予時間（1500ms）を超える。容器を実際に満杯にするより桁違いに速く、
 * 判定・イベント・モーダルの経路は同一（spec R-E）。
 */
const STRESS_QUERY = 'stress=60&interval=120';

/** 猶予時間 + 投入と物理の立ち上がりぶん */
const OVER_TIMEOUT_MS = 20_000;

test('[FR-07 / UI-02] デッドライン超過が続くとゲームオーバーモーダルが表示され、リトライで続けて遊べる', async ({
  page,
}) => {
  await page.goto(`/?${STRESS_QUERY}`);

  const modal = page.getByTestId('gameover-modal');
  await expect(modal).toBeVisible({ timeout: OVER_TIMEOUT_MS });

  // UI-02: 最終スコアとハイスコアが読める
  await expect(page.getByTestId('final-score')).not.toBeEmpty();
  await expect(page.getByTestId('final-high-score')).not.toBeEmpty();

  // 終了状態はリトライでのみ解除する（Esc では閉じない）
  const retry = page.getByTestId('retry-button');
  await expect(retry).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();

  await retry.click();

  // FR-09: 盤面とスコアが初期化され、続けて遊べる
  await expect(modal).toBeHidden();
  await expect(page.getByTestId('score')).toHaveText('0');
});

test('[FR-09] ポーズ中は盤面が止まり、再開で落下が続く', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByTestId('game-canvas');
  const pause = page.getByTestId('pause-toggle');

  // 落下中の果物を作ってから止める（止まっていることを見分けられる状態にする）
  await canvas.click({ position: { x: 200, y: 40 } });
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');

  const paused = await canvas.screenshot();
  await page.waitForTimeout(600);
  // ポーズ中は物理が進まないので描画も変わらない
  expect(await canvas.screenshot()).toEqual(paused);

  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(600);

  expect(await canvas.screenshot()).not.toEqual(paused);
});
