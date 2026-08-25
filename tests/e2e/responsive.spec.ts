import { expect, test, type Locator, type Page } from '@playwright/test';

import { logicalToClientX, measureFruitBand } from './support/canvas-probe';
import { openWithTestApi, readFruits } from './support/test-api';

/**
 * レスポンシブ / タッチ最適化（T-10 / UI-03 / R-04）の E2E。
 *
 * 本 spec は playwright.config.ts の 2 プロジェクト（`chromium` = 1280×800 の PC 想定 /
 * `mobile-portrait` = 375×667・DPR 2・タッチ有効の iPhone SE 相当）の**両方**で走る。
 * viewport 依存の判定は `page.viewportSize()` から分岐させ、spec を 2 本に割らない。
 *
 * スクリーンショット比較ではなく実寸・可視・実解像度の判定で見る（盤面は物理演算で
 * 毎フレーム変わるため、画像比較は基準画像を持てない = 恒常的に flaky になる）。
 */

/** 論理座標系（契約点 §5）。CSS の `--stage-aspect` / `--stage-max-*` と同じ値 */
const LOGICAL_WIDTH = 480;
const LOGICAL_HEIGHT = 720;

/** 実寸の丸め誤差（サブピクセル）を吸収する許容量 */
const PIXEL_TOLERANCE = 1;

interface ViewportGeometry {
  /** 文書全体の高さ（スクロールが必要かの判定に使う） */
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
  scrollTop: number;
}

async function readViewportGeometry(page: Page): Promise<ViewportGeometry> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      scrollTop: root.scrollTop || document.body.scrollTop,
    };
  });
}

interface CanvasGeometry {
  /** 実解像度（バックバッファ） */
  width: number;
  height: number;
  /** CSS 表示サイズ（renderer.ts が倍率の基準に使う `clientWidth` / `clientHeight`） */
  cssWidth: number;
  cssHeight: number;
  /** レイアウト実寸（サブピクセルを含む）。アスペクト比とぼやけの検査に使う */
  boxWidth: number;
  boxHeight: number;
  dpr: number;
}

async function readCanvasGeometry(canvas: Locator): Promise<CanvasGeometry> {
  return canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const rect = target.getBoundingClientRect();
    return {
      width: target.width,
      height: target.height,
      cssWidth: target.clientWidth,
      cssHeight: target.clientHeight,
      boxWidth: rect.width,
      boxHeight: rect.height,
      dpr: window.devicePixelRatio,
    };
  });
}

/** {@link expectCrisp} が実解像度に期待する値（renderer.ts の倍率算出と同じ式） */
function expectedResolution(geometry: CanvasGeometry): { width: number; height: number } {
  const scale = (geometry.cssWidth * geometry.dpr) / LOGICAL_WIDTH;
  return { width: Math.round(LOGICAL_WIDTH * scale), height: Math.round(LOGICAL_HEIGHT * scale) };
}

/**
 * R-04: 実解像度が「CSS 表示サイズ × devicePixelRatio」に一致していること（＝ぼやけない）。
 *
 * 描画は幅を基準に倍率を決める（renderer.ts）ため、高さは同じ倍率から導かれる値と比べる。
 * `clientWidth` は整数へ丸められるので、実寸（サブピクセル）との差は 1 実ピクセルまで許す
 * （DPR を掛け忘れる類の退行はこの許容量では隠れない）。
 */
function expectCrisp(geometry: CanvasGeometry): void {
  const expected = expectedResolution(geometry);
  expect(geometry.width).toBe(expected.width);
  expect(geometry.height).toBe(expected.height);
  expect(Math.abs(geometry.width - geometry.boxWidth * geometry.dpr)).toBeLessThanOrEqual(
    geometry.dpr,
  );
  // アスペクト比 2:3 を保っている（CSS 側の aspect-ratio が効いている）
  expect(geometry.boxWidth / geometry.boxHeight).toBeCloseTo(LOGICAL_WIDTH / LOGICAL_HEIGHT, 2);
}

test('[UI-03] プレイエリアと HUD がスクロールなしに 1 画面へ収まる', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('controls')).toBeVisible();
  // HUD の中身（#8 が生成する）も見えていること
  await expect(page.getByTestId('score')).toBeVisible();
  await expect(page.getByTestId('next-fruit')).toBeVisible();
  await expect(page.getByTestId('pause-toggle')).toBeVisible();

  const viewport = await readViewportGeometry(page);
  // 縦・横ともスクロールが要らない（375×667 / 1280×800 の両方で）
  expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.clientHeight + PIXEL_TOLERANCE);
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + PIXEL_TOLERANCE);

  // 主要要素がビューポートの内側に完全に収まっている
  const size = page.viewportSize();
  expect(size).not.toBeNull();
  if (size === null) {
    return;
  }
  for (const testId of ['hud', 'game-canvas', 'controls']) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box, `${testId} の実寸が取れない`).not.toBeNull();
    if (box === null) {
      continue;
    }
    expect(box.y, `${testId} が上へはみ出している`).toBeGreaterThanOrEqual(-PIXEL_TOLERANCE);
    expect(box.y + box.height, `${testId} が下へはみ出している`).toBeLessThanOrEqual(
      size.height + PIXEL_TOLERANCE,
    );
    expect(box.x + box.width, `${testId} が右へはみ出している`).toBeLessThanOrEqual(
      size.width + PIXEL_TOLERANCE,
    );
  }
});

test('[UI-03 / R-04] 盤面が 2:3 を保ち、過剰に拡大せず、実解像度が DPR に合っている', async ({
  page,
}) => {
  await page.goto('/');

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();
  const geometry = await readCanvasGeometry(canvas);

  expectCrisp(geometry);

  // 論理サイズ（480×720）より大きくは表示しない（PC で過剰に拡大しない）
  expect(geometry.cssWidth).toBeLessThanOrEqual(LOGICAL_WIDTH + PIXEL_TOLERANCE);
  expect(geometry.cssHeight).toBeLessThanOrEqual(LOGICAL_HEIGHT + PIXEL_TOLERANCE);

  const size = page.viewportSize();
  expect(size).not.toBeNull();
  if (size === null) {
    return;
  }
  // 狭い画面では横幅をほぼ使い切る（余白だけが広い＝小さすぎる表示になっていない）
  const isNarrow = size.width < LOGICAL_WIDTH;
  if (isNarrow) {
    expect(geometry.cssHeight).toBeGreaterThan(size.height * 0.6);
  } else {
    // PC 想定では等倍（480×720）で出る
    expect(geometry.cssWidth).toBeCloseTo(LOGICAL_WIDTH, 0);
  }
});

/**
 * 代表的な端末サイズ。縦持ち・横持ち・タブレット・PC を 1 本のテストで舐める。
 *
 * 430×932 は「幅の上限（`max-width`）と高さの上限（等倍 720px）が同時に効く」サイズで、
 * canvas に両方の上限を掛けていた実装では CSS 表示サイズが 2:3 から崩れた（＝描画が縦に
 * 引き伸ばされた）。回帰させないためリストに残す。
 */
const VIEWPORTS: readonly { name: string; width: number; height: number }[] = [
  { name: 'iPhone SE 相当（縦）', width: 375, height: 667 },
  { name: '狭い端末（縦）', width: 320, height: 568 },
  { name: '背の高い端末（縦）', width: 430, height: 932 },
  { name: 'スマホ（横）', width: 812, height: 375 },
  { name: 'タブレット（縦）', width: 768, height: 1024 },
  { name: 'PC', width: 1280, height: 800 },
];

test('[UI-03 / R-04] 代表的な端末サイズで 2:3 を保ち、スクロールが出ない', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // レイアウトと実解像度の反映（ResizeObserver → 次フレーム）を待つ
    await expect
      .poll(async () => {
        const geometry = await readCanvasGeometry(canvas);
        return geometry.width === expectedResolution(geometry).width;
      })
      .toBe(true);

    const geometry = await readCanvasGeometry(canvas);
    expect(
      geometry.boxWidth / geometry.boxHeight,
      `${viewport.name} で CSS 表示サイズの縦横比が崩れている`,
    ).toBeCloseTo(LOGICAL_WIDTH / LOGICAL_HEIGHT, 2);
    expect(geometry.boxWidth, `${viewport.name} で盤面が等倍を超えている`).toBeLessThanOrEqual(
      LOGICAL_WIDTH + PIXEL_TOLERANCE,
    );

    const layout = await readViewportGeometry(page);
    expect(layout.scrollHeight, `${viewport.name} で縦スクロールが出ている`).toBeLessThanOrEqual(
      layout.clientHeight + PIXEL_TOLERANCE,
    );
    expect(layout.scrollWidth, `${viewport.name} で横スクロールが出ている`).toBeLessThanOrEqual(
      layout.clientWidth + PIXEL_TOLERANCE,
    );
  }
});

test('[R-04] 画面回転・リサイズの後も描画がぼやけず、入力座標がずれない', async ({ page }) => {
  const original = page.viewportSize();
  expect(original).not.toBeNull();
  if (original === null) {
    return;
  }

  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();

  // 回転（縦横入れ替え）→ 一段狭いサイズ → 元へ戻す
  const sizes = [
    { width: original.height, height: original.width },
    { width: Math.round(original.width * 0.75), height: Math.round(original.height * 0.75) },
    original,
  ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    /*
     * 実解像度の更新は ResizeObserver → 次フレームで行われる（main.ts / renderer.ts）。
     * 反映を待たずに測ると 1 フレーム前の値を見てしまうため、条件が満たされるまで待つ。
     */
    await expect
      .poll(async () => {
        const geometry = await readCanvasGeometry(canvas);
        return geometry.width === expectedResolution(geometry).width;
      })
      .toBe(true);

    expectCrisp(await readCanvasGeometry(canvas));

    const viewport = await readViewportGeometry(page);
    expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.clientHeight + PIXEL_TOLERANCE);
  }

  /*
   * FR-01: リサイズ後も入力の座標変換（`toLogicalX`）が表示倍率に追従していること。
   * 押した位置に予告の果物（`DROP_Y = 60`）が移るので、描画されたピクセルの平均 x で見る。
   */
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }
  /** 予告の果物は狙いの位置に描かれる。半径ぶんの偏りを許容する幅 */
  const aimTolerance = 40;
  for (const logicalX of [120, 360]) {
    await canvas.click({
      position: { x: logicalToClientX(box, logicalX) - box.x, y: box.height / 2 },
    });
    await expect
      .poll(async () => {
        const band = await measureFruitBand(page, 30, 100);
        return band.centerX ?? -1;
      })
      .toBeGreaterThan(logicalX - aimTolerance);

    const band = await measureFruitBand(page, 30, 100);
    expect(band.pixels).toBeGreaterThan(0);
    expect(band.centerX ?? -1).toBeLessThan(logicalX + aimTolerance);
  }
});

/** AC-06 が指定する viewport（iPhone SE 相当の縦持ち。UI-03） */
const AC06_VIEWPORT = { width: 375, height: 667 };

test('[AC-06] 375×667 の viewport でプレイエリア全体が収まりタッチでプレイできる', async ({
  page,
  hasTouch,
}) => {
  /*
   * `mobile-portrait` プロジェクトでは既にこのサイズだが、`chromium`（PC 想定）でも
   * AC を検証したいので明示的に合わせる。タッチの有無だけプロジェクト差として分岐する
   * （AC の「タッチでプレイできる」は hasTouch = true の側で実際のタッチ経路を踏む）。
   */
  await page.setViewportSize(AC06_VIEWPORT);
  await openWithTestApi(page);

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('controls')).toBeVisible();

  // 実解像度の反映（ResizeObserver → 次フレーム）を待ってから寸法を見る
  await expect
    .poll(async () => {
      const geometry = await readCanvasGeometry(canvas);
      return geometry.width === expectedResolution(geometry).width;
    })
    .toBe(true);
  expectCrisp(await readCanvasGeometry(canvas));

  // スクロールなしで 1 画面に収まる
  const layout = await readViewportGeometry(page);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + PIXEL_TOLERANCE);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + PIXEL_TOLERANCE);

  // プレイエリア全体がビューポートの内側にある
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }
  expect(box.y).toBeGreaterThanOrEqual(-PIXEL_TOLERANCE);
  expect(box.y + box.height).toBeLessThanOrEqual(AC06_VIEWPORT.height + PIXEL_TOLERANCE);
  expect(box.x).toBeGreaterThanOrEqual(-PIXEL_TOLERANCE);
  expect(box.x + box.width).toBeLessThanOrEqual(AC06_VIEWPORT.width + PIXEL_TOLERANCE);

  // タッチで果物が落ちる（タッチ非対応のプロジェクトではポインタ操作で同じ経路を踏む）
  const tapX = box.x + box.width / 2;
  const tapY = box.y + box.height / 2;
  if (hasTouch) {
    await page.touchscreen.tap(tapX, tapY);
  } else {
    await page.mouse.click(tapX, tapY);
  }
  await expect
    .poll(async () => (await readFruits(page)).length, { message: '果物が落ちていない' })
    .toBeGreaterThan(0);
});

test('[UI-03] タッチ操作でページがスクロール / 引っ張り更新されない', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();

  // CSS 側の抑止が効いている（body のパン / ズームとスクロールチェーンを止める）
  const styles = await page.evaluate(() => {
    const body = window.getComputedStyle(document.body);
    const root = window.getComputedStyle(document.documentElement);
    const target = document.querySelector('canvas[data-testid="game-canvas"]');
    return {
      bodyTouchAction: body.touchAction,
      bodyUserSelect: body.userSelect || body.webkitUserSelect,
      rootOverscroll: root.overscrollBehaviorY,
      canvasTouchAction: target === null ? '' : window.getComputedStyle(target).touchAction,
    };
  });
  expect(styles.bodyTouchAction).toBe('none');
  expect(styles.canvasTouchAction).toBe('none');
  expect(styles.rootOverscroll).toBe('none');
  expect(styles.bodyUserSelect).toBe('none');

  // 盤面を上下にドラッグしてもスクロール位置は動かない
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2, { steps: 8 });
  await page.mouse.up();

  const viewport = await readViewportGeometry(page);
  expect(viewport.scrollTop).toBe(0);
  expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.clientHeight + PIXEL_TOLERANCE);
});
