/**
 * Canvas 2D 描画（UI-01 / R-04）。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §5（論理座標系 480×720）
 *
 * 描画は常に**論理座標系 480×720** で行い、canvas の実解像度は
 * 「CSS 表示サイズ × `devicePixelRatio`」へ合わせる（R-04: Retina でぼやけさせない）。
 * 拡大縮小は `setTransform` で 1 箇所に閉じるため、各描画関数は論理座標だけを扱う。
 */

import {
  CONTAINER_FLOOR_Y,
  CONTAINER_LEFT,
  CONTAINER_RIGHT,
  DEADLINE_Y,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  WALL_THICKNESS,
  WALL_TOP_Y,
} from './constants';
import { FRUITS } from './fruits';
import type { FruitSnapshot } from './physics';
import type { FruitTier } from './types';

/** 描画に必要な最小の 2D コンテキスト。テストからスタブを渡せるよう型で切っておく */
export type RenderingContext2D = Pick<
  CanvasRenderingContext2D,
  | 'canvas'
  | 'setTransform'
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'fill'
  | 'stroke'
  | 'fillRect'
  | 'fillText'
  | 'setLineDash'
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

/** 1 フレーム分の描画対象 */
export interface Scene {
  fruits: readonly FruitSnapshot[];
  /** ドロップ待機中の果物（#6 が繋ぐ）。無ければ描かない */
  preview?: { tier: FruitTier; x: number; y: number } | undefined;
}

export interface Renderer {
  /**
   * canvas の実解像度を CSS 表示サイズ × `devicePixelRatio` へ合わせる（R-04）。
   * 初期化時・リサイズ時・DPR 変化時に呼ぶ。サイズが変わらなければ何もしない。
   *
   * @returns 実解像度を更新したら `true`
   */
  resize(): boolean;
  /** 1 フレーム描画する */
  render(scene: Scene): void;
  /** 現在の実解像度と論理座標系の倍率（テスト・デバッグ用） */
  readonly scale: number;
}

/* 見た目の値は描画の関心事なので renderer 内に閉じる（物理パラメータではないため constants.ts には置かない） */
const COLOR_BACKGROUND = '#f7f2e7';
const COLOR_CONTAINER = '#8a6a44';
const COLOR_DEADLINE = '#d64545';
const COLOR_FRUIT_OUTLINE = 'rgba(0, 0, 0, 0.18)';
const COLOR_LABEL = 'rgba(32, 24, 16, 0.85)';
const DEADLINE_DASH: readonly number[] = [12, 8];
const DEADLINE_LINE_WIDTH = 2;
const FRUIT_OUTLINE_WIDTH = 1.5;
/** ラベルを描く最小半径。これより小さい果物は文字が読めないので描かない */
const LABEL_MIN_RADIUS = 18;
/** ラベルのフォントサイズ（半径に対する比） */
const LABEL_FONT_RATIO = 0.42;
const LABEL_FONT_MAX_PX = 20;

export interface RendererOptions {
  /** DPR の取得（テストで固定できるよう注入可能にする）。既定は `window.devicePixelRatio` */
  devicePixelRatio?: () => number;
  /** CSS 表示サイズの取得。既定は canvas の `clientWidth` / `clientHeight` */
  cssSize?: () => { width: number; height: number };
}

function defaultDevicePixelRatio(): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  return Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

/**
 * `Renderer` を生成する。
 *
 * @param canvas 描画先。2D コンテキストが取れない場合は例外（呼び出し側が起動失敗として扱う）
 */
export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}): Renderer {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('Canvas 2D コンテキストを取得できませんでした');
  }
  return createRendererWithContext(ctx, options);
}

/**
 * コンテキストを直接受け取る版。DOM の無い環境（単体テスト）から使う。
 *
 * `ctx.canvas` の `width` / `height` を実解像度として書き換えるため、
 * スタブ側も `canvas` を持つ必要がある。
 */
export function createRendererWithContext(
  ctx: RenderingContext2D,
  options: RendererOptions = {},
): Renderer {
  const getDpr = options.devicePixelRatio ?? defaultDevicePixelRatio;
  const getCssSize =
    options.cssSize ??
    ((): { width: number; height: number } => ({
      width: ctx.canvas.clientWidth,
      height: ctx.canvas.clientHeight,
    }));

  /** 論理座標系 → 実ピクセルの倍率。resize() で更新する */
  let scale = 1;

  function applyResolution(): boolean {
    const css = getCssSize();
    const dpr = getDpr();
    /*
     * CSS 側で aspect-ratio 480/720 を維持しているため、幅を基準に倍率を決める。
     * レイアウト前（clientWidth === 0）は論理サイズをそのまま使い、次の resize() でやり直す。
     */
    const cssWidth = css.width > 0 ? css.width : STAGE_WIDTH;
    const nextScale = (cssWidth * dpr) / STAGE_WIDTH;
    const width = Math.round(STAGE_WIDTH * nextScale);
    const height = Math.round(STAGE_HEIGHT * nextScale);

    if (ctx.canvas.width === width && ctx.canvas.height === height) {
      scale = nextScale;
      return false;
    }
    // canvas の width / height 代入は内容をクリアするため、変化したときだけ行う
    ctx.canvas.width = width;
    ctx.canvas.height = height;
    scale = nextScale;
    return true;
  }

  function drawContainer(): void {
    ctx.fillStyle = COLOR_CONTAINER;
    const wallHeight = CONTAINER_FLOOR_Y - WALL_TOP_Y;
    // 左右の壁（内側の面が CONTAINER_LEFT / CONTAINER_RIGHT。物理側の静的ボディと同じ位置）
    ctx.fillRect(CONTAINER_LEFT - WALL_THICKNESS, WALL_TOP_Y, WALL_THICKNESS, wallHeight);
    ctx.fillRect(CONTAINER_RIGHT, WALL_TOP_Y, WALL_THICKNESS, wallHeight);
    // 床（上面が CONTAINER_FLOOR_Y）
    ctx.fillRect(
      CONTAINER_LEFT - WALL_THICKNESS,
      CONTAINER_FLOOR_Y,
      CONTAINER_RIGHT - CONTAINER_LEFT + WALL_THICKNESS * 2,
      WALL_THICKNESS,
    );
  }

  /** デッドライン（UI-01）。破線で「越えてはいけない高さ」を示す */
  function drawDeadline(): void {
    ctx.save();
    ctx.strokeStyle = COLOR_DEADLINE;
    ctx.lineWidth = DEADLINE_LINE_WIDTH;
    ctx.setLineDash([...DEADLINE_DASH]);
    ctx.beginPath();
    ctx.moveTo(CONTAINER_LEFT, DEADLINE_Y);
    ctx.lineTo(CONTAINER_RIGHT, DEADLINE_Y);
    ctx.stroke();
    ctx.restore();
  }

  function drawFruit(tier: FruitTier, x: number, y: number, radius: number, angle: number): void {
    const def = FRUITS[tier];
    if (def === undefined) {
      return;
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.strokeStyle = COLOR_FRUIT_OUTLINE;
    ctx.lineWidth = FRUIT_OUTLINE_WIDTH;
    ctx.stroke();

    /*
     * 転がりが分かるよう、中心から外周へ向かう線を 1 本引く。
     * 円だけだと回転が見えず、積み上がりの挙動（FR-02）を目視確認できない。
     */
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    ctx.stroke();

    if (radius < LABEL_MIN_RADIUS) {
      return;
    }
    const fontPx = Math.min(radius * LABEL_FONT_RATIO, LABEL_FONT_MAX_PX);
    ctx.font = `600 ${fontPx.toFixed(1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLOR_LABEL;
    ctx.fillText(def.label, x, y);
  }

  return {
    resize: applyResolution,

    render(scene) {
      /*
       * 実解像度 → 論理座標系の変換をここだけで行う（R-04）。
       * setTransform は毎フレーム引き直す（save/restore の入れ子ずれで倍率が壊れないように）。
       */
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = COLOR_BACKGROUND;
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

      drawContainer();
      drawDeadline();

      for (const fruit of scene.fruits) {
        drawFruit(fruit.tier, fruit.x, fruit.y, fruit.radius, fruit.angle);
      }
      if (scene.preview !== undefined) {
        const def = FRUITS[scene.preview.tier];
        if (def !== undefined) {
          drawFruit(scene.preview.tier, scene.preview.x, scene.preview.y, def.radius, 0);
        }
      }
    },

    get scale() {
      return scale;
    },
  };
}
