import { expect, test, type Page } from '@playwright/test';

/**
 * 物理・描画の基盤（T-04）と落下操作（T-05 / FR-01）のスモークテスト。
 * 受け入れ条件 ID 付きのシナリオ（AC-01〜06）は T-11 で追加する。
 */
test('トップページの canvas が表示され、盤面が描画される', async ({ page }) => {
  await page.goto('/');

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

/** ドロップのクールダウン（FR-10 / `DROP_COOLDOWN_MS`）を確実に越える待ち時間 */
const COOLDOWN_WAIT_MS = 600;

/**
 * 指定した論理座標 y の帯に描かれた果物ピクセルを数え、平均 x（論理座標）を返す。
 *
 * ゲーム内部の状態を `window` へ露出させない（本番コードにテスト用の口を作らない）ため、
 * 観測は描画結果のピクセルだけで行う。背景・容器の色は除外する。
 */
async function measureFruitBand(
  page: Page,
  logicalTop: number,
  logicalBottom: number,
): Promise<{ pixels: number; centerX: number | null }> {
  return page.evaluate(
    ({ logicalTop: top, logicalBottom: bottom }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-testid="game-canvas"]');
      const ctx = canvas?.getContext('2d') ?? null;
      if (canvas === null || ctx === null) {
        return { pixels: 0, centerX: null };
      }
      // 論理座標系 480×720 → 実解像度の倍率（R-04）
      const scale = canvas.width / 480;
      /*
       * 走査範囲は容器の内側だけに絞る（壁の縁のアンチエイリアスを果物と数えないため、
       * 内側へ 2px 分だけ余白を取る）。
       */
      const left = Math.round(40 * scale) + 2;
      const right = Math.round(440 * scale) - 2;
      const width = right - left;
      const y0 = Math.round(top * scale);
      const height = Math.max(1, Math.round((bottom - top) * scale));
      const { data } = ctx.getImageData(left, y0, width, height);
      // 背景 #f7f2e7 / 容器 #8a6a44 に近い色は盤面として無視する
      const ignored = [
        [247, 242, 231],
        [138, 106, 68],
      ];
      let pixels = 0;
      let sumX = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
        const isBoard = ignored.some(
          ([ir, ig, ib]) =>
            Math.abs(r - (ir ?? 0)) + Math.abs(g - (ig ?? 0)) + Math.abs(b - (ib ?? 0)) < 30,
        );
        if (isBoard) {
          continue;
        }
        pixels += 1;
        sumX += (left + ((i / 4) % width)) / scale;
      }
      return { pixels, centerX: pixels === 0 ? null : sumX / pixels };
    },
    { logicalTop, logicalBottom },
  );
}

test('[FR-01] ポインタで狙いが左右に動き、クリックで果物が落ちて積み上がる', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }
  /** 論理座標 x を canvas 上のクライアント座標へ直す */
  const clientX = (logicalX: number): number => box.x + (logicalX / 480) * box.width;
  const clientY = box.y + box.height / 2;

  // ドロップ待機中の果物（DROP_Y = 60）が狙いの位置に描かれる
  await page.mouse.move(clientX(120), clientY);
  const leftAim = await measureFruitBand(page, 30, 100);
  expect(leftAim.pixels).toBeGreaterThan(0);
  expect(leftAim.centerX ?? 0).toBeLessThan(200);

  await page.mouse.move(clientX(360), clientY);
  const rightAim = await measureFruitBand(page, 30, 100);
  expect(rightAim.centerX ?? 0).toBeGreaterThan(280);

  // クリックで落とす（クールダウンを空けて数個）
  for (const logicalX of [120, 240, 360, 200]) {
    await page.mouse.move(clientX(logicalX), clientY);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(COOLDOWN_WAIT_MS);
  }
  // 落下・着地を待つ
  await page.waitForTimeout(1500);

  // 盤面下部（論理 y 540 以下）に果物が積み上がっている
  const stacked = await measureFruitBand(page, 540, 690);
  expect(stacked.pixels).toBeGreaterThan(0);
});

test('[FR-01] 矢印キーで狙いが動き、Space で果物が落ちる', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();

  const before = await measureFruitBand(page, 30, 100);
  expect(before.centerX).not.toBeNull();

  // 左へ 5 回。AIM_KEY_STEP = 20 なので論理座標で 100px 動く
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('ArrowLeft');
  }
  const moved = await measureFruitBand(page, 30, 100);
  expect(moved.centerX ?? 0).toBeLessThan((before.centerX ?? 0) - 50);

  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);

  const stacked = await measureFruitBand(page, 540, 690);
  expect(stacked.pixels).toBeGreaterThan(0);
});
