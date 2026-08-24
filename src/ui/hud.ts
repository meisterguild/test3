/**
 * HUD（現在スコア / ハイスコア / 次の果物 / ミュート切替）。FR-05 / FR-06 / FR-08 / UI-01 / DT-02。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §7（購読するイベント）・
 * §8（永続化キーは local-store.ts が持つ）・§9（`data-testid`）
 *
 * 本モジュールは `Game` を**購読するだけ**で、ゲーム状態を書き換えない（契約点 §7 が
 * 「HUD / 効果音は購読側」としてイベントを切っているのに合わせる）。DOM の構造も本モジュールに
 * 閉じ込め、index.html には差し込み先の空要素だけを置く（構造の二重管理を避ける）。
 *
 * 音の再生は #10 の担当。本モジュールが持つのはミュート状態の保持・永続化・見た目までで、
 * 状態の受け渡しは {@link HudHandle.onMuteChange} で行う（#10 は本ファイルを触らずに購読できる）。
 */

import { FRUITS } from '../game/fruits';
import type { GameEvents } from '../game/game';
import type { Unsubscribe } from '../game/physics';
import type { FruitTier } from '../game/types';
import { createLocalStore, type LocalStore } from '../storage/local-store';

/** 契約点 §9 の主要 testid のうち HUD が持つもの */
export const HUD_TESTIDS = {
  score: 'score',
  highScore: 'high-score',
  nextFruit: 'next-fruit',
  muteToggle: 'mute-toggle',
} as const;

/**
 * 本モジュールが使う `Game` の一部（テストからスタブを渡せるよう最小限で切る）。
 *
 * `on` は契約点 §7 の形をそのまま使う。初期表示には現在値が必要なので、
 * イベントが飛ぶ前の状態を読むための getter も要求する。
 */
export interface HudGame {
  on<K extends keyof GameEvents>(event: K, handler: (payload: GameEvents[K]) => void): Unsubscribe;
  readonly score: number;
  readonly nextTier: FruitTier;
}

export interface HudHandle {
  /** 現在のミュート設定（永続化された値で初期化される） */
  readonly muted: boolean;
  /**
   * ミュート設定の変化を購読する（効果音 #10 が使う）。
   * 登録直後には呼ばれない（初期値は {@link HudHandle.muted} で読む）。
   */
  onMuteChange(handler: (muted: boolean) => void): Unsubscribe;
  /** 購読を解除し、生成した DOM を取り除く */
  dispose(): void;
}

export interface HudDeps {
  /** HUD を差し込む要素（index.html の `.hud`）。中身は生成時に置き換える */
  mount: HTMLElement;
  game: HudGame;
  /** 永続化ストア。既定は `localStorage`（テストからはスタブを渡す） */
  store?: LocalStore;
}

/** 表示用にスコアを整形する（3 桁区切り。桁が増えても読めるようにする） */
function formatScore(score: number): string {
  return score.toLocaleString('ja-JP');
}

/** ラベル + 値の 1 区画を作る */
function createField(
  label: string,
  testid: string,
  tag: 'output' | 'span',
): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'hud__field';

  const labelEl = document.createElement('span');
  labelEl.className = 'hud__label';
  labelEl.textContent = label;

  const value = document.createElement(tag);
  value.className = 'hud__value';
  value.dataset.testid = testid;

  root.append(labelEl, value);
  return { root, value };
}

/**
 * HUD を組み立てて `Game` に接続する。
 *
 * 購読するイベント（契約点 §7）とその用途:
 *
 * - `scorechange` … 現在スコアの表示。ハイスコアを超えた時点で表示と保存値も更新する（FR-05 / FR-06）
 * - `drop` … 先読みキューが繰り上がったので次の果物を描き直す（FR-08）
 * - `statuschange` … `restart` でスコアと先読みキューが作り直されるため表示を同期する
 * - `gameover` … ハイスコアを保存する（FR-06）
 */
export function createHud(deps: HudDeps): HudHandle {
  const { mount, game } = deps;
  const store = deps.store ?? createLocalStore();

  const scoreField = createField('スコア', HUD_TESTIDS.score, 'output');
  const highScoreField = createField('ハイスコア', HUD_TESTIDS.highScore, 'output');
  const nextField = createField('つぎ', HUD_TESTIDS.nextFruit, 'span');
  nextField.root.classList.add('hud__field--next');

  /*
   * 次の果物は「色 + 名前」で示す（色だけだと色覚特性によって区別できない）。
   * `next-fruit` の textContent は名前だけになるよう、色見本は装飾用の空要素で置く。
   */
  const nextSwatch = document.createElement('span');
  nextSwatch.className = 'hud__swatch';
  nextSwatch.setAttribute('aria-hidden', 'true');
  const nextName = document.createElement('span');
  nextName.className = 'hud__next-name';
  nextField.value.append(nextSwatch, nextName);

  const muteButton = document.createElement('button');
  muteButton.type = 'button';
  muteButton.className = 'hud__mute';
  muteButton.dataset.testid = HUD_TESTIDS.muteToggle;

  mount.replaceChildren(scoreField.root, highScoreField.root, nextField.root, muteButton);

  let highScore = store.getHighScore();
  let muted = store.getMuted();
  const muteHandlers = new Set<(muted: boolean) => void>();

  function renderScore(score: number): void {
    scoreField.value.textContent = formatScore(score);
  }

  function renderHighScore(): void {
    highScoreField.value.textContent = formatScore(highScore);
  }

  function renderNextFruit(tier: FruitTier): void {
    const fruit = FRUITS[tier];
    if (fruit === undefined) {
      return;
    }
    nextSwatch.style.backgroundColor = fruit.color;
    nextName.textContent = fruit.label;
    // 色見本は読み上げないため、区画そのものに用途込みのラベルを付ける
    nextField.value.setAttribute('aria-label', `次の果物: ${fruit.label}`);
  }

  function renderMute(): void {
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.textContent = muted ? '🔇 ミュート中' : '🔊 音あり';
    // 押した先の動作を読み上げさせる（表示テキストは現在の状態を示している）
    muteButton.setAttribute('aria-label', muted ? 'ミュートを解除する' : 'ミュートにする');
  }

  /**
   * ハイスコアを更新して保存する。更新が無ければ何もしない。
   *
   * `gameover`（#9）を待たずに超えた時点で保存するのは、リロード・タブを閉じるといった
   * ゲームオーバーを経ない離脱でも記録を残すため（FR-06）。書き込みは 1 合体につき
   * 最大 1 回で、`localStorage` が使えない環境では local-store 側が黙って捨てる。
   */
  function updateHighScore(score: number): void {
    if (!Number.isFinite(score) || score <= highScore) {
      return;
    }
    highScore = Math.floor(score);
    store.setHighScore(highScore);
    renderHighScore();
  }

  /** ゲーム側の現在値から表示を作り直す（初期表示・`restart` 後の同期） */
  function syncFromGame(): void {
    renderScore(game.score);
    updateHighScore(game.score);
    renderNextFruit(game.nextTier);
  }

  function setMuted(next: boolean): void {
    if (muted === next) {
      return;
    }
    muted = next;
    store.setMuted(muted);
    renderMute();
    for (const handler of [...muteHandlers]) {
      handler(muted);
    }
  }

  const onMuteClick = (): void => {
    setMuted(!muted);
  };
  muteButton.addEventListener('click', onMuteClick);

  const unsubscribes: Unsubscribe[] = [
    game.on('scorechange', ({ score }) => {
      renderScore(score);
      updateHighScore(score);
    }),
    game.on('drop', () => {
      renderNextFruit(game.nextTier);
    }),
    game.on('statuschange', () => {
      syncFromGame();
    }),
    game.on('gameover', ({ score }) => {
      // 契約点 §7 の payload の score を優先しつつ、購読中に見た最大値も落とさない
      updateHighScore(score);
      store.setHighScore(highScore);
    }),
  ];

  renderScore(game.score);
  renderHighScore();
  renderNextFruit(game.nextTier);
  renderMute();
  updateHighScore(game.score);

  return {
    get muted() {
      return muted;
    },

    onMuteChange(handler) {
      muteHandlers.add(handler);
      return () => muteHandlers.delete(handler);
    },

    dispose() {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
      unsubscribes.length = 0;
      muteHandlers.clear();
      muteButton.removeEventListener('click', onMuteClick);
      mount.replaceChildren();
    },
  };
}
