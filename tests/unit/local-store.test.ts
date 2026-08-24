import { describe, expect, it } from 'vitest';

import {
  createLocalStore,
  DEFAULT_HIGH_SCORE,
  DEFAULT_MUTED,
  HIGH_SCORE_KEY,
  MAX_HIGH_SCORE,
  MUTED_KEY,
  parseHighScore,
  parseMuted,
  type KeyValueStorage,
} from '../../src/storage/local-store';

/** `localStorage` のスタブ（Map 実体）。DOM に依存しない（NFR-05） */
function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage: KeyValueStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
  return { storage, map };
}

/** 読み書きの両方で例外を投げるストレージ（プライベートモード・容量超過の再現） */
function createThrowingStorage(): KeyValueStorage {
  return {
    getItem() {
      throw new DOMException('SecurityError');
    },
    setItem() {
      throw new DOMException('QuotaExceededError');
    },
  };
}

describe('契約点 §8 のキー', () => {
  it('キー名は固定（変更は契約点の更新を伴う）', () => {
    expect(HIGH_SCORE_KEY).toBe('suika.highScore');
    expect(MUTED_KEY).toBe('suika.muted');
  });

  it('既定値はハイスコア 0 / ミュート false', () => {
    expect(DEFAULT_HIGH_SCORE).toBe(0);
    expect(DEFAULT_MUTED).toBe(false);
  });
});

describe('parseHighScore', () => {
  it('未保存（null）は既定値', () => {
    expect(parseHighScore(null)).toBe(DEFAULT_HIGH_SCORE);
  });

  it.each([
    ['abc', 'パース不能'],
    ['12abc', '数値の後ろにゴミが付く'],
    ['', '空文字'],
    ['   ', '空白のみ'],
    ['-5', '負値'],
    ['NaN', 'NaN'],
    ['Infinity', '非有限値'],
    ['1e308', '巨大値（安全な整数の範囲外）'],
    ['99999999999999999999', '桁が落ちる巨大値'],
    ['{}', 'JSON らしき値'],
  ])('壊れた保存値 %s（%s）は既定値へフォールバックする', (raw) => {
    expect(parseHighScore(raw)).toBe(DEFAULT_HIGH_SCORE);
  });

  it.each([
    ['0', 0],
    ['1234', 1234],
    [' 1234 ', 1234],
    ['12.7', 12],
    [String(MAX_HIGH_SCORE), MAX_HIGH_SCORE],
  ])('正常値 %s は %i として読む', (raw, expected) => {
    expect(parseHighScore(raw)).toBe(expected);
  });
});

describe('parseMuted', () => {
  it('"true" のときだけ true', () => {
    expect(parseMuted('true')).toBe(true);
  });

  it.each([null, 'false', 'TRUE', '1', 'yes', ''])('%s は既定値 false', (raw) => {
    expect(parseMuted(raw)).toBe(DEFAULT_MUTED);
  });
});

describe('createLocalStore', () => {
  it('保存した値を読み戻せる（リロード相当。FR-06 / DT-02）', () => {
    const { storage, map } = createMemoryStorage();
    createLocalStore(storage).setHighScore(4321);
    createLocalStore(storage).setMuted(true);

    // 契約点 §8 の表記（数値の文字列 / "true" | "false"）で保存する
    expect(map.get(HIGH_SCORE_KEY)).toBe('4321');
    expect(map.get(MUTED_KEY)).toBe('true');

    // 別インスタンス（= リロード後）から同じ値が読める
    const reloaded = createLocalStore(storage);
    expect(reloaded.getHighScore()).toBe(4321);
    expect(reloaded.getMuted()).toBe(true);
  });

  it('壊れた保存値が入っていても既定値を返す', () => {
    const { storage } = createMemoryStorage({
      [HIGH_SCORE_KEY]: 'abc',
      [MUTED_KEY]: 'maybe',
    });
    const store = createLocalStore(storage);

    expect(store.getHighScore()).toBe(DEFAULT_HIGH_SCORE);
    expect(store.getMuted()).toBe(DEFAULT_MUTED);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, MAX_HIGH_SCORE + 10])(
    '不正な値 %s は保存しない（既存の保存値も壊さない）',
    (score) => {
      const { storage, map } = createMemoryStorage({ [HIGH_SCORE_KEY]: '100' });
      createLocalStore(storage).setHighScore(score);

      expect(map.get(HIGH_SCORE_KEY)).toBe('100');
    },
  );

  it('小数のハイスコアは切り捨てて保存する', () => {
    const { storage, map } = createMemoryStorage();
    createLocalStore(storage).setHighScore(120.9);

    expect(map.get(HIGH_SCORE_KEY)).toBe('120');
  });

  it('localStorage が例外を投げる環境でも例外を漏らさず既定値で動く（FR-06）', () => {
    const store = createLocalStore(createThrowingStorage());

    expect(() => store.setHighScore(500)).not.toThrow();
    expect(() => store.setMuted(true)).not.toThrow();
    expect(store.getHighScore()).toBe(DEFAULT_HIGH_SCORE);
    expect(store.getMuted()).toBe(DEFAULT_MUTED);
  });

  it('localStorage が使えない環境（null）でも例外を投げない（FR-06）', () => {
    const store = createLocalStore(null);

    expect(() => store.setHighScore(500)).not.toThrow();
    expect(() => store.setMuted(true)).not.toThrow();
    expect(store.getHighScore()).toBe(DEFAULT_HIGH_SCORE);
    expect(store.getMuted()).toBe(DEFAULT_MUTED);
  });
});
