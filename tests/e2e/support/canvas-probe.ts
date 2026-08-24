/**
 * E2E から盤面を観測するための補助（T-05 の smoke と T-10 のレスポンシブで共有）。
 *
 * ゲーム内部の状態を `window` へ露出させない（本番コードにテスト用の口を作らない）ため、
 * 観測は **描画結果のピクセル** と **要素の実寸** だけで行う。
 *
 * `*.spec.ts` に一致しないファイル名なので Playwright のテスト収集対象にはならない。
 */

import type { Page } from '@playwright/test';

/** 論理座標系の幅（契約点 §5 の 480×720）。ピクセル走査の倍率算出に使う */
const STAGE_WIDTH = 480;

/** 容器の内側（`CONTAINER_LEFT` / `CONTAINER_RIGHT`）。走査範囲を盤面の内側へ絞る */
const CONTAINER_LEFT = 40;
const CONTAINER_RIGHT = 440;

/** 盤面として無視する色（背景 #f7f2e7 / 容器 #8a6a44） */
const BOARD_COLORS: readonly (readonly [number, number, number])[] = [
  [247, 242, 231],
  [138, 106, 68],
];

/** 色差の許容量（アンチエイリアスを果物と数えないための閾値） */
const COLOR_TOLERANCE = 30;

export interface FruitBand {
  /** 果物として数えたピクセル数 */
  pixels: number;
  /** 果物ピクセルの平均 x（論理座標）。1 つも無ければ `null` */
  centerX: number | null;
}

/**
 * 指定した論理座標 y の帯に描かれた果物ピクセルを数え、平均 x（論理座標）を返す。
 *
 * 実解像度は「CSS 表示サイズ × devicePixelRatio」（R-04）なので、走査位置は
 * `canvas.width / 480` を倍率として論理座標から引き直す。
 */
export async function measureFruitBand(
  page: Page,
  logicalTop: number,
  logicalBottom: number,
): Promise<FruitBand> {
  return page.evaluate(
    ({
      logicalTop: top,
      logicalBottom: bottom,
      stageWidth,
      left: leftEdge,
      right: rightEdge,
      ignored,
      tolerance,
    }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-testid="game-canvas"]');
      const ctx = canvas?.getContext('2d') ?? null;
      if (canvas === null || ctx === null) {
        return { pixels: 0, centerX: null };
      }
      // 論理座標系 → 実解像度の倍率（R-04）
      const scale = canvas.width / stageWidth;
      // 壁の縁のアンチエイリアスを拾わないよう、容器の内側へ 2px 分の余白を取る
      const left = Math.round(leftEdge * scale) + 2;
      const right = Math.round(rightEdge * scale) - 2;
      const width = right - left;
      const y0 = Math.round(top * scale);
      const height = Math.max(1, Math.round((bottom - top) * scale));
      if (width <= 0 || height <= 0) {
        return { pixels: 0, centerX: null };
      }
      const { data } = ctx.getImageData(left, y0, width, height);
      let pixels = 0;
      let sumX = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
        const isBoard = ignored.some(
          ([ir, ig, ib]) =>
            Math.abs(r - (ir ?? 0)) + Math.abs(g - (ig ?? 0)) + Math.abs(b - (ib ?? 0)) < tolerance,
        );
        if (isBoard) {
          continue;
        }
        pixels += 1;
        sumX += (left + ((i / 4) % width)) / scale;
      }
      return { pixels, centerX: pixels === 0 ? null : sumX / pixels };
    },
    {
      logicalTop,
      logicalBottom,
      stageWidth: STAGE_WIDTH,
      left: CONTAINER_LEFT,
      right: CONTAINER_RIGHT,
      // readonly のまま渡せないので複製する（evaluate の引数は構造化複製される）
      ignored: BOARD_COLORS.map((color) => [...color]),
      tolerance: COLOR_TOLERANCE,
    },
  );
}

/** 論理座標 x を canvas 上のクライアント座標へ直す（表示倍率は box から取る） */
export function logicalToClientX(box: { x: number; width: number }, logicalX: number): number {
  return box.x + (logicalX / STAGE_WIDTH) * box.width;
}

export { STAGE_WIDTH as LOGICAL_STAGE_WIDTH };
