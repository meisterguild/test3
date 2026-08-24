import { describe, expect, it } from 'vitest';

import {
  CONTAINER_LEFT,
  CONTAINER_RIGHT,
  DEADLINE_Y,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from '../../src/game/constants';
import { FRUITS } from '../../src/game/fruits';
import { createRendererWithContext, type RenderingContext2D } from '../../src/game/renderer';
import type { FruitSnapshot } from '../../src/game/physics';

interface Call {
  name: string;
  args: unknown[];
  /** 呼び出し時点のスタイル。色の検証に使う */
  fillStyle: string;
  strokeStyle: string;
}

/**
 * 2D コンテキストのスタブ。jsdom は canvas の 2D 実装を持たないため、
 * 呼び出しを記録するだけのオブジェクトを注入して描画内容を検証する（NFR-05）。
 */
function createStubContext(cssWidth: number, cssHeight: number) {
  const calls: Call[] = [];
  const canvas = { width: 0, height: 0, clientWidth: cssWidth, clientHeight: cssHeight };

  const ctx = {
    canvas: canvas as unknown as HTMLCanvasElement,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  } as RenderingContext2D;

  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push({
        name,
        args,
        // グラデーション / パターンは使わないため、文字列以外は空扱いにする
        fillStyle: typeof ctx.fillStyle === 'string' ? ctx.fillStyle : '',
        strokeStyle: typeof ctx.strokeStyle === 'string' ? ctx.strokeStyle : '',
      });
    };

  const methods = [
    'setTransform',
    'save',
    'restore',
    'beginPath',
    'moveTo',
    'lineTo',
    'arc',
    'fill',
    'stroke',
    'fillRect',
    'fillText',
    'setLineDash',
  ] as const;
  for (const name of methods) {
    Object.defineProperty(ctx, name, { value: record(name), writable: true });
  }

  return { ctx, canvas, calls };
}

function fruit(overrides: Partial<FruitSnapshot> = {}): FruitSnapshot {
  return {
    fruitId: 1,
    tier: 5,
    x: 240,
    y: 300,
    radius: FRUITS[5]?.radius ?? 0,
    angle: 0,
    isSleeping: false,
    landed: true,
    ...overrides,
  };
}

describe('createRendererWithContext', () => {
  it('[R-04] canvas の実解像度を CSS サイズ × devicePixelRatio に合わせる', () => {
    const { ctx, canvas } = createStubContext(240, 360);
    const renderer = createRendererWithContext(ctx, { devicePixelRatio: () => 2 });

    expect(renderer.resize()).toBe(true);
    // CSS 240px × DPR 2 = 480 実ピクセル（論理座標系と等倍なので倍率は 1.0）
    expect(canvas.width).toBe(480);
    expect(canvas.height).toBe(720);
    expect(renderer.scale).toBeCloseTo(1);
  });

  it('[R-04] DPR 2 でも論理座標系のまま描画できるよう倍率が transform に載る', () => {
    const { ctx, calls } = createStubContext(480, 720);
    const renderer = createRendererWithContext(ctx, { devicePixelRatio: () => 2 });
    renderer.resize();
    renderer.render({ fruits: [] });

    const transform = calls.find((call) => call.name === 'setTransform');
    expect(transform?.args).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('[R-04] サイズが変わらない再 resize では実解像度を書き換えない（内容が消えないこと）', () => {
    const { ctx, canvas } = createStubContext(480, 720);
    const renderer = createRendererWithContext(ctx, { devicePixelRatio: () => 1 });

    expect(renderer.resize()).toBe(true);
    expect(renderer.resize()).toBe(false);
    expect(canvas.width).toBe(STAGE_WIDTH);
    expect(canvas.height).toBe(STAGE_HEIGHT);
  });

  it('レイアウト前（CSS サイズ 0）は論理サイズで描く', () => {
    const { ctx, canvas } = createStubContext(0, 0);
    const renderer = createRendererWithContext(ctx, { devicePixelRatio: () => 3 });

    renderer.resize();
    expect(canvas.width).toBe(STAGE_WIDTH * 3);
    expect(renderer.scale).toBeCloseTo(3);
  });

  it('[UI-01] 容器の枠とデッドラインを描画する', () => {
    const { ctx, calls } = createStubContext(480, 720);
    const renderer = createRendererWithContext(ctx, { devicePixelRatio: () => 1 });
    renderer.resize();
    renderer.render({ fruits: [] });

    // 容器: 左壁・右壁・床の 3 枚（背景の fillRect を除く）
    const rects = calls.filter((call) => call.name === 'fillRect');
    expect(rects.length).toBe(4);
    expect(rects[0]?.args).toEqual([0, 0, STAGE_WIDTH, STAGE_HEIGHT]);

    // デッドライン: CONTAINER_LEFT → CONTAINER_RIGHT の水平線を破線で引く
    expect(calls.some((call) => call.name === 'setLineDash')).toBe(true);
    const moveTo = calls.find((call) => call.name === 'moveTo');
    const lineTo = calls.find((call) => call.name === 'lineTo');
    expect(moveTo?.args).toEqual([CONTAINER_LEFT, DEADLINE_Y]);
    expect(lineTo?.args).toEqual([CONTAINER_RIGHT, DEADLINE_Y]);
  });

  it('果物を FRUITS の色で塗り、中央にラベルを描く', () => {
    const { ctx, calls } = createStubContext(480, 720);
    const renderer = createRendererWithContext(ctx, { devicePixelRatio: () => 1 });
    renderer.resize();
    renderer.render({ fruits: [fruit({ tier: 5, x: 100, y: 200 })] });

    const arc = calls.find((call) => call.name === 'arc');
    expect(arc?.args).toEqual([100, 200, FRUITS[5]?.radius, 0, Math.PI * 2]);
    // 色は fill 実行時点の fillStyle で確認する（arc の時点ではまだ容器の色）
    const fill = calls.find((call) => call.name === 'fill');
    expect(fill?.fillStyle).toBe(FRUITS[5]?.color);

    const label = calls.find((call) => call.name === 'fillText');
    expect(label?.args).toEqual([FRUITS[5]?.label, 100, 200]);
  });

  it('小さすぎる果物にはラベルを描かない（文字が読めないため）', () => {
    const { ctx, calls } = createStubContext(480, 720);
    const renderer = createRendererWithContext(ctx, { devicePixelRatio: () => 1 });
    renderer.resize();
    renderer.render({ fruits: [fruit({ tier: 0, radius: FRUITS[0]?.radius ?? 0 })] });

    expect(calls.some((call) => call.name === 'fillText')).toBe(false);
  });

  it('preview（ドロップ待機中の果物）を渡すと FRUITS の半径で描く', () => {
    const { ctx, calls } = createStubContext(480, 720);
    const renderer = createRendererWithContext(ctx, { devicePixelRatio: () => 1 });
    renderer.resize();
    renderer.render({ fruits: [], preview: { tier: 2, x: 300, y: 60 } });

    const arc = calls.find((call) => call.name === 'arc');
    expect(arc?.args).toEqual([300, 60, FRUITS[2]?.radius, 0, Math.PI * 2]);
  });
});
