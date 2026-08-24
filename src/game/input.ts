/**
 * 落下操作（FR-01）とドロップクールダウン（FR-10）。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §5（`DROP_Y` / `DROP_COOLDOWN_MS`）・§7（`drop` イベント）
 *
 * 本モジュールの責務は「入力デバイスの出来事を論理座標の狙い（`aimAt`）とドロップ（`drop`）へ翻訳すること」
 * だけに閉じる。狙いのクランプ・先読みキュー・`drop` イベントの発火は game.ts が持つ
 * （入力経路が増えてもゲーム状態の更新規則が 1 箇所に留まるようにするため）。
 *
 * 操作は 3 系統。
 *
 * - ポインタ（マウス / ペン / タッチ）… 移動で狙い、離した位置でドロップ
 * - タッチ（`PointerEvent` 非対応ブラウザ向けの代替）… `touchmove` で狙い、`touchend` でドロップ
 * - キーボード … `ArrowLeft` / `ArrowRight` で狙い、`Space` / `Enter` でドロップ
 */

import { AIM_KEY_STEP, DROP_COOLDOWN_MS, STAGE_WIDTH } from './constants';
import type { GameStatus } from './types';

/** 本モジュールが使う `GameController` の一部（テストからスタブを渡せるよう最小限で切る） */
export interface InputGame {
  readonly status: GameStatus;
  readonly aimX: number;
  aimAt(x: number): void;
  drop(): boolean;
}

/** 入力を受け取る要素（canvas）。DOM の無い環境からも呼べるよう最小限で切る */
export interface InputSurface {
  getBoundingClientRect(): { left: number; width: number };
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void;
}

/** キー入力の購読先（既定は `window`。canvas にフォーカスが無くても操作できるようにする） */
export type KeyEventTarget = Pick<InputSurface, 'addEventListener' | 'removeEventListener'>;

export interface InputHandle {
  /** 登録したリスナをすべて解除する */
  dispose(): void;
}

export interface InputOptions {
  /** 現在時刻 (ms)。既定は `performance.now`（テストで固定できるよう注入可能にする） */
  now?: () => number;
  /** キー入力の購読先。既定は `window` */
  keyTarget?: KeyEventTarget;
  /** ドロップの最短間隔 (ms)。既定は {@link DROP_COOLDOWN_MS} */
  cooldownMs?: number;
  /** 矢印キー 1 回の移動量（論理座標 px）。既定は {@link AIM_KEY_STEP} */
  keyStep?: number;
  /**
   * `PointerEvent` を使えるか。既定は `typeof PointerEvent !== 'undefined'`。
   * `false` のときは `mousemove` / `mouseup` と `touchmove` / `touchend` で代替する。
   */
  pointerEvents?: boolean;
}

/** ドロップに使うキー。`Space` は古い実装で `Spacebar` を返すため両方見る */
const DROP_KEYS: readonly string[] = [' ', 'Spacebar', 'Enter'];

/**
 * ポインタ / マウスイベントの横位置（クライアント座標）。
 *
 * リスナは `Event` として受け取る（{@link InputSurface} を DOM に依存させないため）ので、
 * 横位置を持たない種類のイベントが来た場合は `null` を返して無視できるようにする。
 */
function clientXOf(event: Event): number | null {
  const { clientX } = event as Partial<MouseEvent>;
  return typeof clientX === 'number' ? clientX : null;
}

function defaultNow(): number {
  // performance.now は単調増加なので、時刻同期でクールダウンが飛ぶことがない
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * canvas 上のクライアント座標を論理座標（0〜{@link STAGE_WIDTH}）へ変換する。
 *
 * canvas は CSS で拡大縮小される（R-04）ため、表示幅と論理座標系の幅の比で割り戻す。
 *
 * @returns 論理座標 x。レイアウト前（表示幅 0）など変換できない場合は `null`
 */
export function toLogicalX(clientX: number, rect: { left: number; width: number }): number | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(rect.width) || rect.width <= 0) {
    return null;
  }
  return ((clientX - rect.left) / rect.width) * STAGE_WIDTH;
}

/**
 * 入力を `game` へ接続する。
 *
 * `status !== 'playing'`（`ready` / `paused` / `over`）の間は狙いもドロップも受け付けない。
 * ドロップは {@link InputOptions.cooldownMs} の間隔を空けてしか成立しない（FR-10。
 * キーリピート・連打・タッチの多重発火で複数個落ちるのを防ぐ）。
 */
export function createInput(
  surface: InputSurface,
  game: InputGame,
  options: InputOptions = {},
): InputHandle {
  const now = options.now ?? defaultNow;
  const cooldownMs = options.cooldownMs ?? DROP_COOLDOWN_MS;
  const keyStep = options.keyStep ?? AIM_KEY_STEP;
  const usePointerEvents = options.pointerEvents ?? typeof PointerEvent !== 'undefined';
  const keyTarget: KeyEventTarget | null =
    options.keyTarget ?? (typeof window === 'undefined' ? null : window);

  /** 直近にドロップが成立した時刻。null ならまだ落としていない */
  let lastDropMs: number | null = null;
  const removers: (() => void)[] = [];

  function isAcceptingInput(): boolean {
    return game.status === 'playing';
  }

  function aimAtClientX(clientX: number): void {
    const logicalX = toLogicalX(clientX, surface.getBoundingClientRect());
    if (logicalX === null) {
      return;
    }
    game.aimAt(logicalX);
  }

  /** クールダウン（FR-10）を見てからドロップする。落ちたときだけ時刻を更新する */
  function tryDrop(): void {
    if (!isAcceptingInput()) {
      return;
    }
    const nowMs = now();
    if (lastDropMs !== null && nowMs - lastDropMs < cooldownMs) {
      return;
    }
    if (game.drop()) {
      lastDropMs = nowMs;
    }
  }

  function listen(
    target: InputSurface | KeyEventTarget,
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    removers.push(() => target.removeEventListener(type, listener, options));
  }

  const handleAimEvent = (event: Event): void => {
    if (!isAcceptingInput()) {
      return;
    }
    const clientX = clientXOf(event);
    if (clientX !== null) {
      aimAtClientX(clientX);
    }
  };

  /** 離した位置でドロップする。押した瞬間ではなくドラッグ後の位置を採用するため */
  const handleReleaseEvent = (event: Event): void => {
    if (!isAcceptingInput()) {
      return;
    }
    const clientX = clientXOf(event);
    if (clientX !== null) {
      aimAtClientX(clientX);
    }
    tryDrop();
  };

  const handleTouchMove = (event: Event): void => {
    if (!isAcceptingInput()) {
      return;
    }
    const touch = (event as TouchEvent).touches[0];
    if (touch === undefined) {
      return;
    }
    // ドラッグで画面がスクロールしないようにする（CSS の touch-action と二重に塞ぐ）
    if (event.cancelable) {
      event.preventDefault();
    }
    aimAtClientX(touch.clientX);
  };

  const handleTouchEnd = (event: Event): void => {
    if (!isAcceptingInput()) {
      return;
    }
    // touchend の touches は空。離れた指は changedTouches 側にある
    const touch = (event as TouchEvent).changedTouches[0];
    if (touch !== undefined) {
      aimAtClientX(touch.clientX);
    }
    tryDrop();
  };

  const handleKeyDown = (event: Event): void => {
    if (!isAcceptingInput()) {
      return;
    }
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.altKey || keyEvent.ctrlKey || keyEvent.metaKey) {
      // ブラウザ / OS のショートカット（タブ切り替え等）を奪わない
      return;
    }
    if (keyEvent.key === 'ArrowLeft' || keyEvent.key === 'ArrowRight') {
      const delta = keyEvent.key === 'ArrowLeft' ? -keyStep : keyStep;
      // 現在の狙い（game 側でクランプ済み）を起点にするので、入力側は位置を持たない
      game.aimAt(game.aimX + delta);
      keyEvent.preventDefault();
      return;
    }
    if (DROP_KEYS.includes(keyEvent.key)) {
      /*
       * 押しっぱなしの自動リピートはドロップとして数えない（FR-10）。
       * クールダウンでも弾かれるが、意図を明示しておく。
       */
      if (!keyEvent.repeat) {
        tryDrop();
      }
      // Space によるページスクロール・Enter によるボタン誤操作を防ぐ
      keyEvent.preventDefault();
    }
  };

  if (usePointerEvents) {
    listen(surface, 'pointermove', handleAimEvent);
    // 押した時点でも狙いを合わせる（タップ位置へ即座に予告を移す）
    listen(surface, 'pointerdown', handleAimEvent);
    listen(surface, 'pointerup', handleReleaseEvent);
  } else {
    listen(surface, 'mousemove', handleAimEvent);
    listen(surface, 'mouseup', handleReleaseEvent);
    listen(surface, 'touchmove', handleTouchMove, { passive: false });
    listen(surface, 'touchend', handleTouchEnd);
  }

  if (keyTarget !== null) {
    listen(keyTarget, 'keydown', handleKeyDown);
  }

  return {
    dispose() {
      for (const remove of removers) {
        remove();
      }
      removers.length = 0;
    },
  };
}
