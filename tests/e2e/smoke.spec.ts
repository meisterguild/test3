import { expect, test } from '@playwright/test';

/**
 * 物理・描画の基盤（T-04）のスモークテスト。
 * 受け入れ条件 ID 付きのシナリオ（AC-01〜06）は T-11 で追加する。
 */
test('トップページの canvas が表示され、盤面が描画される', async ({ page }) => {
  await page.goto('/?autodrop=0');

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();

  /*
   * R-04: canvas の実解像度は「CSS 表示サイズ × devicePixelRatio」。
   * 論理座標系 480×720（契約点 §5）はアスペクト比として現れる。
   */
  const geometry = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    return {
      width: target.width,
      height: target.height,
      cssWidth: target.clientWidth,
      cssHeight: target.clientHeight,
      dpr: window.devicePixelRatio,
    };
  });

  expect(geometry.cssWidth).toBeGreaterThan(0);
  expect(geometry.cssHeight).toBeGreaterThan(0);
  expect(geometry.width).toBe(Math.round(geometry.cssWidth * geometry.dpr));
  expect(geometry.width / geometry.height).toBeCloseTo(480 / 720, 2);

  // UI-01: 容器の枠とデッドラインが描かれている（＝背景一色ではない）
  const distinctColors = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const ctx = target.getContext('2d');
    if (ctx === null) {
      return 0;
    }
    const { data } = ctx.getImageData(0, 0, target.width, target.height);
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    return colors.size;
  });
  expect(distinctColors).toBeGreaterThan(1);
});

test('果物が落下して床の上に積み上がる', async ({ page }) => {
  await page.goto('/');

  // 暫定オートドロップ（DROP_COOLDOWN_MS 間隔）で数個落ちるまで待つ
  await page.waitForTimeout(3000);

  const fruits = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-testid="game-canvas"]');
    const ctx = canvas?.getContext('2d') ?? null;
    if (canvas === null || ctx === null) {
      return { drawnRows: 0 };
    }
    /*
     * 落下・積み上がりを「盤面下部に果物の色が現れたか」で確認する。
     * ゲーム内部の状態を window へ露出させない（本番コードにテスト用の口を作らない）ため、
     * 描画結果のピクセルだけを見る。
     */
    const bottom = Math.floor(canvas.height * 0.75);
    const { data } = ctx.getImageData(0, bottom, canvas.width, canvas.height - bottom);
    const background = new Set(['247,242,231', '138,106,68']);
    let drawnRows = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (!background.has(`${data[i]},${data[i + 1]},${data[i + 2]}`)) {
        drawnRows += 1;
      }
    }
    return { drawnRows };
  });

  expect(fruits.drawnRows).toBeGreaterThan(0);
});
