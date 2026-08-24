// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameEvents } from '../../src/game/game';
import type { GameStatus } from '../../src/game/types';
import { createGameModal, MODAL_TESTIDS, type ModalGame } from '../../src/ui/modal';

/**
 * ゲームオーバーモーダルとポーズ操作（FR-07 / FR-09 / UI-02）。
 *
 * `Game` はスタブに差し替え、本モジュールが「表示と入口」だけを担っていること
 * （状態遷移そのものは game.ts の責務）を固定する。
 */
function createStubGame(initialStatus: GameStatus = 'playing') {
  let status = initialStatus;
  type Handlers = { [K in keyof GameEvents]: Set<(payload: GameEvents[K]) => void> };
  const handlers: Handlers = {
    drop: new Set(),
    merge: new Set(),
    scorechange: new Set(),
    statuschange: new Set(),
    gameover: new Set(),
  };

  function emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    for (const handler of [...handlers[event]]) {
      handler(payload);
    }
  }

  /** 状態を変えて `statuschange` を流す（game.ts の状態機械の振る舞いを最小限で再現する） */
  const setStatus = (next: GameStatus): void => {
    status = next;
    emit('statuschange', { status: next });
  };

  const calls = { pause: 0, resume: 0, restart: 0 };

  const game: ModalGame = {
    on(event, handler) {
      const set = handlers[event];
      set.add(handler);
      return () => set.delete(handler);
    },
    pause: () => {
      calls.pause += 1;
      setStatus('paused');
    },
    resume: () => {
      calls.resume += 1;
      setStatus('playing');
    },
    restart: () => {
      calls.restart += 1;
      setStatus('playing');
    },
    get status() {
      return status;
    },
  };

  /**
   * ゲームオーバーの発火を game.ts と同じ順で再現する
   * （`statuschange`（over）が先、`gameover` が後。契約点 §7）。
   */
  const finish = (payload: GameEvents['gameover']): void => {
    setStatus('over');
    emit('gameover', payload);
  };

  return { game, calls, emit, setStatus, finish };
}

function query(testid: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

/** 契約点 §9 の testid で引く（見つからなければテスト側の誤りとして落とす） */
function require(testid: string): HTMLElement {
  const el = query(testid);
  if (el === null) {
    throw new Error(`要素が見つかりません: ${testid}`);
  }
  return el;
}

function mountPoint(): HTMLElement {
  const mount = document.createElement('section');
  document.body.appendChild(mount);
  return mount;
}

const GAMEOVER: GameEvents['gameover'] = { score: 1234, highScore: 5000, isNewHighScore: false };

beforeEach(() => {
  document.body.replaceChildren();
});

describe('createGameModal', () => {
  it('[UI-02] 生成直後はモーダルを表示しない', () => {
    const { game } = createStubGame();
    const handle = createGameModal({ mount: mountPoint(), game });

    expect(handle.open).toBe(false);
    expect(require(MODAL_TESTIDS.gameOverModal).hidden).toBe(true);
    expect(query(MODAL_TESTIDS.pauseToggle)).not.toBeNull();
  });

  it('[FR-07 / UI-02] gameover で最終スコアとハイスコアを表示する', () => {
    const { game, finish } = createStubGame();
    const handle = createGameModal({ mount: mountPoint(), game });

    finish(GAMEOVER);

    expect(handle.open).toBe(true);
    const modal = require(MODAL_TESTIDS.gameOverModal);
    expect(modal.hidden).toBe(false);
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    // 3 桁区切りで表示する（HUD と同じ整形）
    expect(require(MODAL_TESTIDS.finalScore).textContent).toBe('1,234');
    expect(require(MODAL_TESTIDS.finalHighScore).textContent).toBe('5,000');
  });

  it('[UI-02] ハイスコア更新の有無を表示に反映する', () => {
    const { game, finish } = createStubGame();
    createGameModal({ mount: mountPoint(), game });

    finish(GAMEOVER);
    expect(require(MODAL_TESTIDS.newHighScore).hidden).toBe(true);

    finish({ score: 6000, highScore: 6000, isNewHighScore: true });
    expect(require(MODAL_TESTIDS.newHighScore).hidden).toBe(false);
  });

  it('[UI-02] 表示時にリトライボタンへフォーカスが移る', () => {
    const { game, finish } = createStubGame();
    createGameModal({ mount: mountPoint(), game });

    finish(GAMEOVER);

    expect(document.activeElement).toBe(require(MODAL_TESTIDS.retryButton));
  });

  it('[UI-02] Esc ではモーダルを閉じない（終了状態は明示操作でのみ解除する）', () => {
    const { game, finish } = createStubGame();
    const handle = createGameModal({ mount: mountPoint(), game });
    finish(GAMEOVER);

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(handle.open).toBe(true);
    expect(require(MODAL_TESTIDS.gameOverModal).hidden).toBe(false);
    // 背後（input.ts の window リスナ）へ渡さない
    expect(event.defaultPrevented).toBe(true);
  });

  it('[UI-02] Tab はモーダル内へ留める', () => {
    const { game, finish } = createStubGame();
    createGameModal({ mount: mountPoint(), game });
    // 背後にフォーカス可能な要素がある状態を作る
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    finish(GAMEOVER);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );

    expect(document.activeElement).toBe(require(MODAL_TESTIDS.retryButton));
  });

  it('[FR-09] リトライで restart を呼び、playing に戻ったらモーダルを閉じる', () => {
    const { game, calls, finish } = createStubGame();
    const handle = createGameModal({ mount: mountPoint(), game });
    finish(GAMEOVER);

    require(MODAL_TESTIDS.retryButton).click();

    expect(calls.restart).toBe(1);
    expect(handle.open).toBe(false);
    expect(require(MODAL_TESTIDS.gameOverModal).hidden).toBe(true);
  });

  it('[FR-09] ポーズボタンで pause / resume をトグルする', () => {
    const { game, calls } = createStubGame();
    createGameModal({ mount: mountPoint(), game });
    const button = require(MODAL_TESTIDS.pauseToggle);

    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();
    expect(calls.pause).toBe(1);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('再開');

    button.click();
    expect(calls.resume).toBe(1);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('ポーズ');
  });

  it('[FR-09] 遊べない状態（ready / over）ではポーズボタンを無効化する', () => {
    const { game, setStatus, finish } = createStubGame('ready');
    createGameModal({ mount: mountPoint(), game });
    const button = require(MODAL_TESTIDS.pauseToggle) as HTMLButtonElement;

    expect(button.disabled).toBe(true);

    setStatus('playing');
    expect(button.disabled).toBe(false);

    finish(GAMEOVER);
    expect(button.disabled).toBe(true);
  });

  it('dispose で購読・リスナ・DOM を片付ける', () => {
    const { game, emit } = createStubGame();
    const mount = mountPoint();
    const handle = createGameModal({ mount, game });
    const retry = require(MODAL_TESTIDS.retryButton);
    const restart = vi.spyOn(game, 'restart');

    handle.dispose();

    expect(mount.childElementCount).toBe(0);
    expect(query(MODAL_TESTIDS.gameOverModal)).toBeNull();
    // 取り外した DOM を操作しても、購読解除済みなのでゲームは動かない
    retry.click();
    emit('gameover', GAMEOVER);
    expect(restart).not.toHaveBeenCalled();
    expect(handle.open).toBe(false);
  });
});
