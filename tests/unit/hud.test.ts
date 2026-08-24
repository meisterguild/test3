// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { FRUITS } from '../../src/game/fruits';
import type { GameEvents } from '../../src/game/game';
import type { FruitTier } from '../../src/game/types';
import {
  createLocalStore,
  HIGH_SCORE_KEY,
  MUTED_KEY,
  type KeyValueStorage,
  type LocalStore,
} from '../../src/storage/local-store';
import { createHud, HUD_TESTIDS, type HudGame } from '../../src/ui/hud';

/**
 * `Game` のうち HUD が使う部分だけのスタブ。
 *
 * イベントの発火順・payload は契約点 §7 のものをそのまま再現する
 * （スコア加算やキュー繰り上げの規則自体は game.ts の責務なので、ここでは検証しない）。
 */
function createStubGame(initial: { score?: number; nextTier?: FruitTier } = {}) {
  let score = initial.score ?? 0;
  let nextTier: FruitTier = initial.nextTier ?? 0;

  type Handlers = { [K in keyof GameEvents]: Set<(payload: GameEvents[K]) => void> };
  const handlers: Handlers = {
    drop: new Set(),
    merge: new Set(),
    scorechange: new Set(),
    statuschange: new Set(),
    gameover: new Set(),
  };

  const game: HudGame = {
    on(event, handler) {
      const set = handlers[event];
      set.add(handler);
      return () => set.delete(handler);
    },
    get score() {
      return score;
    },
    get nextTier() {
      return nextTier;
    },
  };

  // 分割代入して呼ばれるため `this` は使わない
  function emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    for (const handler of [...handlers[event]]) {
      handler(payload);
    }
  }

  /*
   * 操作系は分割代入して使うため、メソッド構文ではなくアロー関数で持つ
   * （`this` に依存しない形にする）。
   */
  return {
    game,
    emit,
    /** 購読者数（dispose で購読が外れたことの確認に使う） */
    handlerCount: (event: keyof GameEvents): number => handlers[event].size,
    /** 合体でスコアが増えた状況（game.ts と同じく状態更新 → 通知の順） */
    addScore: (delta: number): void => {
      score += delta;
      emit('scorechange', { score });
    },
    /** ドロップで先読みキューが繰り上がった状況 */
    dropTo: (tier: FruitTier): void => {
      nextTier = tier;
      emit('drop', { tier });
    },
    setScore: (next: number): void => {
      score = next;
    },
  };
}

/** `localStorage` のスタブ（Map 実体） */
function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage: KeyValueStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
  return { store: createLocalStore(storage), map };
}

function mountElement(): HTMLElement {
  const mount = document.createElement('section');
  mount.dataset.testid = 'hud';
  document.body.appendChild(mount);
  return mount;
}

/** 契約点 §9 の testid で要素を引く（本番の取得経路と同じ手段で検証する） */
function byTestId(testid: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
  if (element === null) {
    throw new Error(`data-testid="${testid}" が見つかりません`);
  }
  return element;
}

function setup(options: { store: LocalStore; score?: number; nextTier?: FruitTier }) {
  const mount = mountElement();
  const stub = createStubGame({ score: options.score ?? 0, nextTier: options.nextTier ?? 0 });
  const hud = createHud({ mount, game: stub.game, store: options.store });
  return { mount, hud, ...stub };
}

/** 表示は 3 桁区切り。実行環境のロケール実装に依存しないよう同じ整形で期待値を作る */
function formatted(score: number): string {
  return score.toLocaleString('ja-JP');
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('初期表示（UI-01 / 契約点 §9）', () => {
  it('契約点 §9 の testid をすべて付与する', () => {
    setup({ store: createMemoryStorage().store });

    for (const testid of Object.values(HUD_TESTIDS)) {
      expect(byTestId(testid)).not.toBeNull();
    }
  });

  it('保存済みハイスコアを初期表示する（FR-06）', () => {
    const { store } = createMemoryStorage({ [HIGH_SCORE_KEY]: '2500' });
    setup({ store });

    expect(byTestId(HUD_TESTIDS.score).textContent).toBe(formatted(0));
    expect(byTestId(HUD_TESTIDS.highScore).textContent).toBe(formatted(2500));
  });

  it('次の果物を色 + 名前で表示する（FR-08）', () => {
    setup({ store: createMemoryStorage().store, nextTier: 3 });

    const next = byTestId(HUD_TESTIDS.nextFruit);
    expect(next.textContent).toBe('デコポン');
    expect(next.getAttribute('aria-label')).toContain('デコポン');
    const swatch = next.querySelector<HTMLElement>('.hud__swatch');
    expect(swatch?.style.backgroundColor).not.toBe('');
  });

  it('保存済みのミュート設定をボタンに反映する（DT-02）', () => {
    const { store } = createMemoryStorage({ [MUTED_KEY]: 'true' });
    const { hud } = setup({ store });

    expect(hud.muted).toBe(true);
    expect(byTestId(HUD_TESTIDS.muteToggle).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('スコア表示（FR-05）', () => {
  it('合体（scorechange）ごとに現在スコアの表示が増える', () => {
    const { addScore } = setup({ store: createMemoryStorage().store });

    addScore(3);
    expect(byTestId(HUD_TESTIDS.score).textContent).toBe(formatted(3));

    addScore(6);
    expect(byTestId(HUD_TESTIDS.score).textContent).toBe(formatted(9));
  });

  it('4 桁以上は 3 桁区切りで表示する', () => {
    const { addScore } = setup({ store: createMemoryStorage().store });

    addScore(12345);
    expect(byTestId(HUD_TESTIDS.score).textContent).toBe(formatted(12345));
  });
});

describe('ハイスコア（FR-06）', () => {
  it('現在スコアが超えた時点で表示と保存値を更新する', () => {
    const { store, map } = createMemoryStorage({ [HIGH_SCORE_KEY]: '10' });
    const { addScore } = setup({ store });

    addScore(4);
    // まだ超えていないので保存値は変わらない
    expect(byTestId(HUD_TESTIDS.highScore).textContent).toBe(formatted(10));
    expect(map.get(HIGH_SCORE_KEY)).toBe('10');

    addScore(20);
    expect(byTestId(HUD_TESTIDS.highScore).textContent).toBe(formatted(24));
    expect(map.get(HIGH_SCORE_KEY)).toBe('24');
  });

  it('gameover でハイスコアを保存する（契約点 §7 の payload を使う）', () => {
    const { store, map } = createMemoryStorage();
    const { emit } = setup({ store });

    emit('gameover', { score: 777, highScore: 777, isNewHighScore: true });

    expect(map.get(HIGH_SCORE_KEY)).toBe('777');
    expect(byTestId(HUD_TESTIDS.highScore).textContent).toBe(formatted(777));
  });

  it('ハイスコアを下回る gameover では保存値を下げない', () => {
    const { store, map } = createMemoryStorage({ [HIGH_SCORE_KEY]: '900' });
    const { emit } = setup({ store });

    emit('gameover', { score: 120, highScore: 900, isNewHighScore: false });

    expect(map.get(HIGH_SCORE_KEY)).toBe('900');
    expect(byTestId(HUD_TESTIDS.highScore).textContent).toBe(formatted(900));
  });

  it('localStorage が使えなくても例外を投げず表示は動く（FR-06）', () => {
    const throwing: KeyValueStorage = {
      getItem() {
        throw new DOMException('SecurityError');
      },
      setItem() {
        throw new DOMException('QuotaExceededError');
      },
    };
    const { addScore, emit } = setup({ store: createLocalStore(throwing) });

    expect(() => addScore(50)).not.toThrow();
    expect(() =>
      emit('gameover', { score: 50, highScore: 50, isNewHighScore: true }),
    ).not.toThrow();
    expect(byTestId(HUD_TESTIDS.score).textContent).toBe(formatted(50));
    expect(byTestId(HUD_TESTIDS.highScore).textContent).toBe(formatted(50));
  });
});

describe('次の果物（FR-08）', () => {
  it('ドロップごとに表示が更新される', () => {
    const { dropTo } = setup({ store: createMemoryStorage().store, nextTier: 0 });

    dropTo(4);
    expect(byTestId(HUD_TESTIDS.nextFruit).textContent).toBe(FRUITS[4]?.label);

    dropTo(1);
    expect(byTestId(HUD_TESTIDS.nextFruit).textContent).toBe(FRUITS[1]?.label);
  });

  it('restart（statuschange）でスコアと次の果物を同期し直す', () => {
    const { store } = createMemoryStorage();
    const { emit, addScore, setScore } = setup({ store, nextTier: 0 });

    addScore(30);
    // restart は score を 0 に戻し、先読みキューを引き直す（game.ts の挙動）
    setScore(0);
    emit('statuschange', { status: 'playing' });

    expect(byTestId(HUD_TESTIDS.score).textContent).toBe(formatted(0));
    // ハイスコアは restart では下がらない
    expect(byTestId(HUD_TESTIDS.highScore).textContent).toBe(formatted(30));
  });
});

describe('ミュート切替（DT-02）', () => {
  it('クリックで状態が反転し localStorage に永続化される', () => {
    const { store, map } = createMemoryStorage();
    const { hud } = setup({ store });
    const button = byTestId(HUD_TESTIDS.muteToggle);

    button.click();
    expect(hud.muted).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(map.get(MUTED_KEY)).toBe('true');

    button.click();
    expect(hud.muted).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(map.get(MUTED_KEY)).toBe('false');
  });

  it('変化を購読できる（効果音 #10 が本ファイルを触らずに繋げられる）', () => {
    const { hud } = setup({ store: createMemoryStorage().store });
    const seen: boolean[] = [];
    const unsubscribe = hud.onMuteChange((muted) => seen.push(muted));

    byTestId(HUD_TESTIDS.muteToggle).click();
    unsubscribe();
    byTestId(HUD_TESTIDS.muteToggle).click();

    expect(seen).toEqual([true]);
  });
});

describe('dispose', () => {
  it('購読を解除し DOM を取り除く', () => {
    const { store } = createMemoryStorage();
    const { hud, mount, addScore, handlerCount } = setup({ store });

    hud.dispose();

    expect(mount.childElementCount).toBe(0);
    for (const event of ['scorechange', 'drop', 'statuschange', 'gameover'] as const) {
      expect(handlerCount(event)).toBe(0);
    }
    expect(() => addScore(10)).not.toThrow();
  });
});
