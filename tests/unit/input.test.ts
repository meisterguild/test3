// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { AIM_KEY_STEP, DROP_COOLDOWN_MS, STAGE_WIDTH } from '../../src/game/constants';
import { createInput, toLogicalX, type InputGame } from '../../src/game/input';
import type { GameStatus } from '../../src/game/types';

/**
 * `GameController` のうち入力が使う部分だけのスタブ。
 *
 * 狙いのクランプ・先読みキューは game.ts の責務（tests/unit/game.test.ts で固定）なので、
 * ここでは「入力が何をどの値で呼んだか」だけを記録する。
 */
function createStubGame(initialStatus: GameStatus = 'playing') {
  let status = initialStatus;
  let aimX = STAGE_WIDTH / 2;
  const aims: number[] = [];
  /** ドロップが成立したときの狙い位置 */
  const drops: number[] = [];

  const game: InputGame = {
    get status() {
      return status;
    },
    get aimX() {
      return aimX;
    },
    aimAt(x) {
      aims.push(x);
      aimX = x;
    },
    drop() {
      if (status !== 'playing') {
        return false;
      }
      drops.push(aimX);
      return true;
    },
  };

  return {
    game,
    aims,
    drops,
    setStatus(next: GameStatus) {
      status = next;
    },
  };
}

/** 論理座標 480 が CSS 幅 240 で表示されている canvas（倍率 0.5、左端 100px） */
const RECT = { left: 100, width: 240 } as const;

let canvas: HTMLCanvasElement;
/** 注入する現在時刻。テスト内で進めてクールダウンを検証する */
let nowMs: number;

beforeEach(() => {
  document.body.innerHTML = '';
  canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = (): DOMRect => ({ ...RECT }) as DOMRect;
  document.body.appendChild(canvas);
  nowMs = 0;
});

function setup(
  stub: ReturnType<typeof createStubGame>,
  options: { pointerEvents?: boolean; keyTarget?: EventTarget } = {},
) {
  return createInput(canvas, stub.game, {
    now: () => nowMs,
    pointerEvents: options.pointerEvents ?? true,
    ...(options.keyTarget === undefined ? {} : { keyTarget: options.keyTarget }),
  });
}

function pointer(type: string, clientX: number): void {
  canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
}

/** jsdom は `TouchEvent` を実装していないため、必要なプロパティだけ持つイベントを組む */
function touch(type: string, clientX: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = [{ clientX }];
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : touches });
  Object.defineProperty(event, 'changedTouches', { value: touches });
  canvas.dispatchEvent(event);
  return event;
}

function key(name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: name,
    ...init,
  });
  window.dispatchEvent(event);
  return event;
}

describe('toLogicalX', () => {
  it('[FR-01] CSS 表示サイズと論理座標系のスケール差を吸収する', () => {
    // 左端・中央・右端。CSS 240px 幅に論理 480px が入るので倍率は 2
    expect(toLogicalX(100, RECT)).toBe(0);
    expect(toLogicalX(220, RECT)).toBe(STAGE_WIDTH / 2);
    expect(toLogicalX(340, RECT)).toBe(STAGE_WIDTH);
    // 要素の外側は論理座標系の外に出る（クランプは game 側の責務）
    expect(toLogicalX(40, RECT)).toBe(-120);
  });

  it('等倍表示ではオフセットを引くだけになる', () => {
    expect(toLogicalX(0, { left: 0, width: STAGE_WIDTH })).toBe(0);
    // 除算と乗算を経るため厳密一致ではなく近似で見る
    expect(toLogicalX(123, { left: 0, width: STAGE_WIDTH })).toBeCloseTo(123, 10);
  });

  it('変換できない入力では null を返す（レイアウト前・壊れた座標）', () => {
    expect(toLogicalX(100, { left: 0, width: 0 })).toBeNull();
    expect(toLogicalX(100, { left: 0, width: Number.NaN })).toBeNull();
    expect(toLogicalX(Number.NaN, RECT)).toBeNull();
  });
});

describe('createInput（ポインタ）', () => {
  it('[FR-01] pointermove / pointerdown で狙いを論理座標へ変換して更新する', () => {
    const stub = createStubGame();
    setup(stub);

    pointer('pointermove', 220);
    pointer('pointerdown', 340);

    expect(stub.aims).toEqual([STAGE_WIDTH / 2, STAGE_WIDTH]);
    expect(stub.drops).toEqual([]);
  });

  it('[FR-01] pointerup で「離した位置」へドロップする', () => {
    const stub = createStubGame();
    setup(stub);

    pointer('pointerdown', 220);
    pointer('pointermove', 160);
    pointer('pointerup', 160);

    expect(stub.drops).toEqual([toLogicalX(160, RECT)]);
  });

  it('[FR-10] クールダウン中の連打では 1 個しか落ちない', () => {
    const stub = createStubGame();
    setup(stub);

    pointer('pointerup', 220);
    nowMs = DROP_COOLDOWN_MS - 1;
    pointer('pointerup', 220);
    pointer('pointerup', 220);

    expect(stub.drops).toHaveLength(1);

    // クールダウン経過後は再び落とせる
    nowMs = DROP_COOLDOWN_MS;
    pointer('pointerup', 220);
    expect(stub.drops).toHaveLength(2);
  });
});

describe('createInput（タッチ: PointerEvent 非対応の代替経路）', () => {
  it('[FR-01] touchmove で狙いが動き、touchend でドロップする', () => {
    const stub = createStubGame();
    setup(stub, { pointerEvents: false });

    const moved = touch('touchmove', 220);
    touch('touchend', 160);

    expect(stub.aims).toEqual([STAGE_WIDTH / 2, toLogicalX(160, RECT)]);
    expect(stub.drops).toEqual([toLogicalX(160, RECT)]);
    // ドラッグ中にページがスクロールしないよう既定動作を止める
    expect(moved.defaultPrevented).toBe(true);
  });

  it('マウス操作も pointer 非対応経路で動く', () => {
    const stub = createStubGame();
    setup(stub, { pointerEvents: false });

    pointer('mousemove', 220);
    pointer('mouseup', 220);

    expect(stub.drops).toEqual([STAGE_WIDTH / 2]);
  });

  it('[FR-10] タッチの連打もクールダウンで 1 個に絞られる', () => {
    const stub = createStubGame();
    setup(stub, { pointerEvents: false });

    touch('touchend', 220);
    touch('touchend', 220);

    expect(stub.drops).toHaveLength(1);
  });
});

describe('createInput（キーボード）', () => {
  it('[FR-01] 矢印キーで狙いが AIM_KEY_STEP ずつ動く', () => {
    const stub = createStubGame();
    setup(stub);
    const center = STAGE_WIDTH / 2;

    key('ArrowLeft');
    key('ArrowLeft');
    key('ArrowRight');

    expect(stub.aims).toEqual([
      center - AIM_KEY_STEP,
      center - AIM_KEY_STEP * 2,
      center - AIM_KEY_STEP,
    ]);
  });

  it('[FR-01] Space / Enter でドロップする', () => {
    const stub = createStubGame();
    setup(stub);

    key(' ');
    nowMs = DROP_COOLDOWN_MS;
    key('Enter');

    expect(stub.drops).toHaveLength(2);
  });

  it('[FR-10] キーリピート（repeat）ではドロップしない', () => {
    const stub = createStubGame();
    setup(stub);

    key(' ', { repeat: true });
    expect(stub.drops).toHaveLength(0);

    key(' ');
    expect(stub.drops).toHaveLength(1);
  });

  it('操作キーは既定動作（ページスクロール等）を止める', () => {
    const stub = createStubGame();
    setup(stub);

    expect(key('ArrowLeft').defaultPrevented).toBe(true);
    expect(key(' ').defaultPrevented).toBe(true);
    // ゲームに関係しないキーは奪わない
    expect(key('a').defaultPrevented).toBe(false);
  });

  it('修飾キー併用（ブラウザ / OS のショートカット）は無視する', () => {
    const stub = createStubGame();
    setup(stub);

    key('ArrowLeft', { metaKey: true });
    key(' ', { ctrlKey: true });

    expect(stub.aims).toEqual([]);
    expect(stub.drops).toEqual([]);
  });

  it('keyTarget を差し替えられる（既定は window）', () => {
    const stub = createStubGame();
    const target = document.createElement('div');
    setup(stub, { keyTarget: target });

    key('ArrowLeft');
    expect(stub.aims).toEqual([]);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(stub.aims).toHaveLength(1);
  });
});

describe('createInput（状態と後始末）', () => {
  it('playing 以外（ready / paused / over）では入力を受け付けない', () => {
    const stub = createStubGame('ready');
    setup(stub);

    for (const status of ['ready', 'paused', 'over'] as const) {
      stub.setStatus(status);
      pointer('pointermove', 220);
      pointer('pointerup', 220);
      key('ArrowLeft');
      key(' ');
    }

    expect(stub.aims).toEqual([]);
    expect(stub.drops).toEqual([]);

    // playing に戻れば受け付ける
    stub.setStatus('playing');
    pointer('pointerup', 220);
    expect(stub.drops).toHaveLength(1);
  });

  it('dispose するとリスナが解除される', () => {
    const stub = createStubGame();
    const input = setup(stub);

    input.dispose();
    pointer('pointermove', 220);
    pointer('pointerup', 220);
    key('ArrowLeft');

    expect(stub.aims).toEqual([]);
    expect(stub.drops).toEqual([]);
    // dispose は冪等
    expect(() => input.dispose()).not.toThrow();
  });
});
