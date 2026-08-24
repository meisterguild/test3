import { expect, test } from '@playwright/test';

/**
 * 基盤構築（T-01）のスモークテスト。
 * 受け入れ条件 ID 付きのシナリオ（AC-01〜06）は T-11 で追加する。
 */
test('トップページに空の canvas が表示される', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();

  // 論理座標系 480×720（契約点 §5）が canvas 属性として設定されていること
  await expect(canvas).toHaveAttribute('width', '480');
  await expect(canvas).toHaveAttribute('height', '720');

  // 描画領域が実際に確保されていること（CSS の aspect-ratio 反映を確認する）
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('canvas の描画領域を取得できませんでした');
  }
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
});
