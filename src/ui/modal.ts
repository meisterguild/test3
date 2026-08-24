/**
 * ゲームオーバーモーダルとポーズ / 再開のトグル（FR-07 / FR-09 / UI-02）。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §7（購読するイベント・`Game` の API）・
 * §9（`data-testid`）
 *
 * 本モジュールは `Game` を購読して表示を作り、操作は契約点 §7 の API
 * （`pause` / `resume` / `restart`）へ委譲するだけ。判定・状態遷移は game.ts の責務
 * （HUD と同じく「表示と入口」だけをここに閉じる）。DOM 構造も本モジュールが持ち、
 * index.html には差し込み先の空要素だけを置く。
 *
 * a11y の要求（UI-02）:
 *
 * - 終了時はリトライボタンへフォーカスを移す（キーボードだけで次のプレイに入れる）
 * - `Esc` ではモーダルを閉じない。終了状態はリトライという明示操作でしか解除できないため、
 *   閉じられると「操作できない盤面」だけが残る
 * - Tab はモーダル内で循環させる（背後の HUD / canvas にフォーカスが逃げない）
 */

import type { GameEvents } from '../game/game';
import type { Unsubscribe } from '../game/physics';
import type { GameStatus } from '../game/types';

/** 契約点 §9 の testid のうち本モジュールが持つもの */
export const MODAL_TESTIDS = {
  gameOverModal: 'gameover-modal',
  retryButton: 'retry-button',
  finalScore: 'final-score',
  finalHighScore: 'final-high-score',
  newHighScore: 'new-high-score',
  pauseToggle: 'pause-toggle',
} as const;

/**
 * 本モジュールが使う `Game`（契約点 §7）の一部。
 * テストからスタブを渡せるよう、購読と操作の最小限で切る。
 */
export interface ModalGame {
  on<K extends keyof GameEvents>(event: K, handler: (payload: GameEvents[K]) => void): Unsubscribe;
  pause(): void;
  resume(): void;
  restart(): void;
  readonly status: GameStatus;
}

export interface ModalHandle {
  /** ゲームオーバーモーダルが表示されているか */
  readonly open: boolean;
  /** 購読を解除し、生成した DOM を取り除く */
  dispose(): void;
}

export interface ModalDeps {
  /** ポーズ操作とモーダルを差し込む要素（index.html の `.controls`） */
  mount: HTMLElement;
  game: ModalGame;
}

/** 表示用にスコアを整形する（HUD と同じ 3 桁区切り） */
function formatScore(score: number): string {
  return score.toLocaleString('ja-JP');
}

/** ラベル + 値の 1 行を作る */
function createRow(label: string, testid: string): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement('p');
  root.className = 'modal__row';

  const labelEl = document.createElement('span');
  labelEl.className = 'modal__label';
  labelEl.textContent = label;

  const value = document.createElement('span');
  value.className = 'modal__value';
  value.dataset.testid = testid;

  root.append(labelEl, value);
  return { root, value };
}

/**
 * ポーズ操作とゲームオーバーモーダルを組み立てて `Game` に接続する。
 *
 * 購読するイベント（契約点 §7）とその用途:
 *
 * - `gameover` … モーダルを開き、最終スコア・ハイスコア・更新の有無を表示する（UI-02）
 * - `statuschange` … ポーズボタンの表示を同期し、`playing` へ戻ったらモーダルを閉じる
 *   （`restart` の結果としてのみ起きる。閉じる条件を 1 箇所に寄せる）
 */
export function createGameModal(deps: ModalDeps): ModalHandle {
  const { mount, game } = deps;

  const pauseButton = document.createElement('button');
  pauseButton.type = 'button';
  pauseButton.className = 'controls__pause';
  pauseButton.dataset.testid = MODAL_TESTIDS.pauseToggle;

  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.dataset.testid = MODAL_TESTIDS.gameOverModal;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'modal__panel';

  const title = document.createElement('h2');
  title.className = 'modal__title';
  title.id = 'gameover-modal-title';
  title.textContent = 'ゲームオーバー';
  overlay.setAttribute('aria-labelledby', title.id);

  const scoreRow = createRow('スコア', MODAL_TESTIDS.finalScore);
  const highScoreRow = createRow('ハイスコア', MODAL_TESTIDS.finalHighScore);

  const newRecord = document.createElement('p');
  newRecord.className = 'modal__record';
  newRecord.dataset.testid = MODAL_TESTIDS.newHighScore;
  newRecord.textContent = 'ハイスコア更新！';
  newRecord.hidden = true;

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'modal__retry';
  retryButton.dataset.testid = MODAL_TESTIDS.retryButton;
  retryButton.textContent = 'もう一度遊ぶ';

  panel.append(title, scoreRow.root, highScoreRow.root, newRecord, retryButton);
  overlay.append(panel);
  mount.replaceChildren(pauseButton, overlay);

  let open = false;

  /**
   * ポーズボタンの表示を現在の状態に合わせる。
   *
   * `playing` / `paused` 以外（`ready` / `over`）では押しても意味が無いので無効化する
   * （押せるのに何も起きないボタンを残さない）。
   */
  function renderPause(): void {
    const paused = game.status === 'paused';
    pauseButton.disabled = game.status !== 'playing' && !paused;
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.textContent = paused ? '▶ 再開' : '⏸ ポーズ';
    pauseButton.setAttribute('aria-label', paused ? 'ゲームを再開する' : 'ゲームを一時停止する');
  }

  function openModal(payload: GameEvents['gameover']): void {
    scoreRow.value.textContent = formatScore(payload.score);
    highScoreRow.value.textContent = formatScore(payload.highScore);
    newRecord.hidden = !payload.isNewHighScore;
    overlay.hidden = false;
    open = true;
    /*
     * フォーカスを移して、キーボードだけで次のプレイに入れるようにする。
     * jsdom / 非対応要素でも落ちないよう存在確認してから呼ぶ。
     */
    retryButton.focus?.();
  }

  function closeModal(): void {
    if (!open) {
      return;
    }
    overlay.hidden = true;
    open = false;
  }

  const onPauseClick = (): void => {
    if (game.status === 'paused') {
      game.resume();
      return;
    }
    game.pause();
  };

  const onRetryClick = (): void => {
    // 閉じるのは statuschange（playing）を受けたとき。閉じる条件を 1 箇所に寄せる
    game.restart();
  };

  /**
   * モーダル表示中のキー入力（`document` の捕捉フェーズで見る）。
   *
   * `Esc` は**閉じない**（終了状態はリトライでのみ解除する）。押されたことを背後
   * （input.ts の window リスナ等）へ伝えないよう、ここで止める。
   * Tab は唯一のフォーカス可能要素へ戻し、背後の HUD / canvas へ抜けさせない。
   *
   * モーダル内の要素ではなく `document` で受けるのは、オーバーレイの余白をクリックすると
   * フォーカスが `body` へ移り、モーダル配下のリスナには届かなくなるため。
   */
  const onKeyDown = (event: Event): void => {
    if (!open) {
      return;
    }
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.key === 'Escape') {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      return;
    }
    if (keyEvent.key === 'Tab') {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      retryButton.focus?.();
    }
  };

  pauseButton.addEventListener('click', onPauseClick);
  retryButton.addEventListener('click', onRetryClick);
  // 捕捉フェーズ: window（input.ts）のバブル側リスナより先に判断する
  document.addEventListener('keydown', onKeyDown, true);

  const unsubscribes: Unsubscribe[] = [
    game.on('gameover', (payload) => {
      openModal(payload);
      renderPause();
    }),
    game.on('statuschange', ({ status }) => {
      if (status === 'playing') {
        closeModal();
      }
      renderPause();
    }),
  ];

  renderPause();

  return {
    get open() {
      return open;
    },

    dispose() {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
      unsubscribes.length = 0;
      pauseButton.removeEventListener('click', onPauseClick);
      retryButton.removeEventListener('click', onRetryClick);
      document.removeEventListener('keydown', onKeyDown, true);
      mount.replaceChildren();
    },
  };
}
