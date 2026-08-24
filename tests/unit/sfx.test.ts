// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSfx,
  MAX_VOICES,
  mergeFrequency,
  MERGE_BASE_HZ,
  type SfxAudioContext,
  type SfxAudioParam,
  type SfxGainNode,
  type SfxGame,
  type SfxOscillatorNode,
} from '../../src/audio/sfx';
import type { GameEvents } from '../../src/game/game';
import type { FruitTier } from '../../src/game/types';
import { MUTED_KEY, createLocalStore, type KeyValueStorage } from '../../src/storage/local-store';

/**
 * `Game` のうち効果音が使う部分だけのスタブ（契約点 §7 のイベントをそのまま流す）。
 * 効果音は購読しかしないので `on` と発火だけを持つ。
 */
function createStubGame() {
  type Handlers = { [K in keyof GameEvents]: Set<(payload: GameEvents[K]) => void> };
  const handlers: Handlers = {
    drop: new Set(),
    merge: new Set(),
    scorechange: new Set(),
    statuschange: new Set(),
    gameover: new Set(),
  };

  const game: SfxGame = {
    on(event, handler) {
      const set = handlers[event];
      set.add(handler);
      return () => set.delete(handler);
    },
  };

  return {
    game,
    emit: <K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void => {
      for (const handler of [...handlers[event]]) {
        handler(payload);
      }
    },
    handlerCount: (event: keyof GameEvents): number => handlers[event].size,
  };
}

/** スケジュールされた 1 音の観測結果 */
interface RecordedTone {
  type: OscillatorType;
  /** `setValueAtTime` で置かれた開始周波数 */
  fromHz: number;
  startSec: number;
  stopSec: number;
}

/**
 * `AudioContext` のスタブ。
 *
 * 実装が呼ぶメソッド（{@link SfxAudioContext}）だけを持ち、生成された音を記録する。
 * jsdom には Web Audio API が無いため、テストは必ずこれを注入する。
 */
function createStubContext(options: { state?: string } = {}) {
  const tones: RecordedTone[] = [];
  const gains: SfxGainNode[] = [];
  let currentTime = 0;
  let state = options.state ?? 'running';
  let closed = false;
  let resumeCount = 0;

  const destination = {};

  function createParam(onSetValue: (value: number, atSec: number) => void): SfxAudioParam {
    return {
      setValueAtTime: onSetValue,
      linearRampToValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
    };
  }

  const context: SfxAudioContext = {
    get currentTime() {
      return currentTime;
    },
    get state() {
      return state;
    },
    destination,
    createOscillator() {
      const tone: RecordedTone = { type: 'sine', fromHz: 0, startSec: 0, stopSec: 0 };
      const oscillator: SfxOscillatorNode = {
        type: 'sine',
        frequency: createParam((value) => {
          tone.fromHz = value;
        }),
        connect: () => undefined,
        start(when) {
          tone.type = oscillator.type;
          tone.startSec = when ?? currentTime;
          tones.push(tone);
        },
        stop(when) {
          tone.stopSec = when ?? currentTime;
        },
      };
      return oscillator;
    },
    createGain() {
      const gain: SfxGainNode = {
        gain: createParam(() => undefined),
        connect: () => undefined,
      };
      gains.push(gain);
      return gain;
    },
    resume() {
      resumeCount += 1;
      state = 'running';
      return Promise.resolve();
    },
    close() {
      closed = true;
      state = 'closed';
      return Promise.resolve();
    },
  };

  return {
    context,
    tones,
    /** マスターゲイン + 各音のエンベロープの合計（生成された GainNode 数） */
    gainCount: (): number => gains.length,
    isClosed: (): boolean => closed,
    resumeCount: (): number => resumeCount,
    advance: (deltaSec: number): void => {
      currentTime += deltaSec;
    },
  };
}

/** `localStorage` の最小スタブ（local-store のテストと同じ切り方） */
function createStubStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

/**
 * 警告ログを黙らせて記録する。
 *
 * 効果音は失敗しても `console.warn` だけで続行する（FR-11）ため、テスト出力を汚さないよう
 * 毎テストで差し替える。`ReturnType` で受けるのは `vi.spyOn` の総称型を書き下さずに
 * 具体的なモック型を得るため（型が `any` に落ちると lint に引っかかる）。
 */
function spyOnWarn() {
  return vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

let warnSpy: ReturnType<typeof spyOnWarn>;

beforeEach(() => {
  warnSpy = spyOnWarn();
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('createSfx（自動再生ポリシー）', () => {
  it('生成直後は AudioContext を作らない', () => {
    const { game } = createStubGame();
    const createContext = vi.fn(() => createStubContext().context);

    const sfx = createSfx({ game, muted: false, createContext });

    expect(createContext).not.toHaveBeenCalled();
    expect(sfx.started).toBe(false);
    sfx.dispose();
  });

  it('最初のユーザー操作で AudioContext を 1 つだけ生成する', () => {
    const { game } = createStubGame();
    const createContext = vi.fn(() => createStubContext().context);

    const sfx = createSfx({ game, muted: false, createContext });
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(sfx.started).toBe(true);
    sfx.dispose();
  });

  it('ユーザー操作が suspended のコンテキストを再開する', () => {
    const { game } = createStubGame();
    const stub = createStubContext({ state: 'suspended' });

    const sfx = createSfx({ game, muted: false, createContext: () => stub.context });
    window.dispatchEvent(new Event('pointerdown'));

    expect(stub.resumeCount()).toBe(1);
    sfx.dispose();
  });

  it('ミュート中のユーザー操作では AudioContext を生成しない', () => {
    const { game } = createStubGame();
    const createContext = vi.fn(() => createStubContext().context);

    const sfx = createSfx({ game, muted: true, createContext });
    window.dispatchEvent(new Event('pointerdown'));

    expect(createContext).not.toHaveBeenCalled();
    expect(sfx.started).toBe(false);
    sfx.dispose();
  });

  it('ミュート解除でその場に AudioContext を生成する（解除操作自体がユーザー操作のため）', () => {
    const { game } = createStubGame();
    const createContext = vi.fn(() => createStubContext().context);

    const sfx = createSfx({ game, muted: true, createContext });
    sfx.setMuted(false);

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(sfx.started).toBe(true);
    sfx.dispose();
  });
});

describe('createSfx（再生）', () => {
  it('drop / merge / gameover でそれぞれ音を鳴らす', () => {
    const stubGame = createStubGame();
    const stub = createStubContext();
    const sfx = createSfx({
      game: stubGame.game,
      muted: false,
      createContext: () => stub.context,
      gestureTarget: null,
    });

    stubGame.emit('drop', { tier: 0 });
    expect(stub.tones).toHaveLength(1);

    stub.advance(1);
    stubGame.emit('merge', { tier: 3, score: 6, x: 100, y: 200 });
    expect(stub.tones).toHaveLength(2);

    stub.advance(1);
    stubGame.emit('gameover', { score: 6, highScore: 6, isNewHighScore: true });
    // 終了音は下降 3 音
    expect(stub.tones).toHaveLength(5);

    sfx.dispose();
  });

  it('合体音は tier が高いほど低い（契約点 FR-11）', () => {
    const stubGame = createStubGame();
    const stub = createStubContext();
    const sfx = createSfx({
      game: stubGame.game,
      muted: false,
      createContext: () => stub.context,
      gestureTarget: null,
    });

    const tiers: FruitTier[] = [1, 5, 10];
    for (const tier of tiers) {
      stub.advance(1);
      stubGame.emit('merge', { tier, score: 1, x: 0, y: 0 });
    }

    const frequencies = stub.tones.map((tone) => tone.fromHz);
    expect(frequencies).toHaveLength(tiers.length);
    expect(frequencies[0]).toBeGreaterThan(frequencies[1] ?? 0);
    expect(frequencies[1]).toBeGreaterThan(frequencies[2] ?? 0);

    sfx.dispose();
  });

  it('ミュート中は鳴らさず、解除後は鳴る', () => {
    const stubGame = createStubGame();
    const stub = createStubContext();
    const sfx = createSfx({
      game: stubGame.game,
      muted: true,
      createContext: () => stub.context,
      gestureTarget: null,
    });

    stubGame.emit('drop', { tier: 0 });
    expect(stub.tones).toHaveLength(0);

    sfx.setMuted(false);
    stubGame.emit('drop', { tier: 0 });
    expect(stub.tones).toHaveLength(1);

    sfx.setMuted(true);
    stub.advance(1);
    stubGame.emit('drop', { tier: 0 });
    expect(stub.tones).toHaveLength(1);

    sfx.dispose();
  });

  it('ミュート状態の変化を購読して反映する（HUD からの通知）', () => {
    const stubGame = createStubGame();
    const stub = createStubContext();
    const handlers = new Set<(muted: boolean) => void>();
    const sfx = createSfx({
      game: stubGame.game,
      muted: false,
      subscribeMuted: (handler) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
      createContext: () => stub.context,
      gestureTarget: null,
    });

    for (const handler of handlers) {
      handler(true);
    }
    expect(sfx.muted).toBe(true);

    stubGame.emit('drop', { tier: 0 });
    expect(stub.tones).toHaveLength(0);

    sfx.dispose();
    expect(handlers.size).toBe(0);
  });

  it('初期ミュートは local-store（契約点 §8 の suika.muted）から読む', () => {
    const stubGame = createStubGame();
    const store = createLocalStore(createStubStorage({ [MUTED_KEY]: 'true' }));
    const sfx = createSfx({
      game: stubGame.game,
      store,
      createContext: () => createStubContext().context,
      gestureTarget: null,
    });

    expect(sfx.muted).toBe(true);
    sfx.dispose();
  });

  it('同時多発の合体でも同時発音数の上限を超えない', () => {
    const stubGame = createStubGame();
    const stub = createStubContext();
    const sfx = createSfx({
      game: stubGame.game,
      muted: false,
      createContext: () => stub.context,
      gestureTarget: null,
    });

    // 時間を進めずに（＝同時に）大量の合体を流し込む
    for (let i = 0; i < MAX_VOICES * 3; i += 1) {
      stubGame.emit('merge', { tier: 2, score: 3, x: 0, y: 0 });
    }
    expect(stub.tones).toHaveLength(MAX_VOICES);

    // 発音が終わる時間まで進めればまた鳴る
    stub.advance(10);
    stubGame.emit('merge', { tier: 2, score: 3, x: 0, y: 0 });
    expect(stub.tones).toHaveLength(MAX_VOICES + 1);

    sfx.dispose();
  });

  it('同時発音数の上限に達していてもゲームオーバー音は鳴る', () => {
    const stubGame = createStubGame();
    const stub = createStubContext();
    const sfx = createSfx({
      game: stubGame.game,
      muted: false,
      createContext: () => stub.context,
      gestureTarget: null,
    });

    for (let i = 0; i < MAX_VOICES * 2; i += 1) {
      stubGame.emit('merge', { tier: 2, score: 3, x: 0, y: 0 });
    }
    const beforeGameOver = stub.tones.length;
    stubGame.emit('gameover', { score: 0, highScore: 0, isNewHighScore: false });

    expect(stub.tones.length).toBe(beforeGameOver + 3);
    sfx.dispose();
  });
});

describe('createSfx（失敗時もゲームを止めない: FR-11）', () => {
  it('AudioContext を生成できない環境でも例外が漏れない', () => {
    const stubGame = createStubGame();
    const createContext = vi.fn((): SfxAudioContext => {
      throw new Error('AudioContext が利用できません');
    });
    const sfx = createSfx({
      game: stubGame.game,
      muted: false,
      createContext,
      gestureTarget: null,
    });

    expect(() => {
      stubGame.emit('drop', { tier: 0 });
      stubGame.emit('merge', { tier: 1, score: 1, x: 0, y: 0 });
      stubGame.emit('gameover', { score: 1, highScore: 1, isNewHighScore: true });
    }).not.toThrow();

    // 一度失敗したら再試行しない（毎フレーム例外を投げさせない）
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(sfx.started).toBe(false);
    sfx.dispose();
  });

  it('再生中に例外が起きても握りつぶし、警告は 1 回だけ出す', () => {
    const stubGame = createStubGame();
    const stub = createStubContext();
    const broken: SfxAudioContext = {
      ...stub.context,
      get currentTime() {
        return stub.context.currentTime;
      },
      get state() {
        return stub.context.state;
      },
      createOscillator() {
        throw new Error('オシレータを作れません');
      },
    };
    const sfx = createSfx({
      game: stubGame.game,
      muted: false,
      createContext: () => broken,
      gestureTarget: null,
    });

    expect(() => {
      stubGame.emit('drop', { tier: 0 });
      stubGame.emit('drop', { tier: 0 });
    }).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    sfx.dispose();
  });
});

describe('createSfx（後始末）', () => {
  it('dispose で購読を解除し AudioContext を閉じる', () => {
    const stubGame = createStubGame();
    const stub = createStubContext();
    const sfx = createSfx({
      game: stubGame.game,
      muted: false,
      createContext: () => stub.context,
      gestureTarget: null,
    });

    stubGame.emit('drop', { tier: 0 });
    expect(stub.tones).toHaveLength(1);

    sfx.dispose();

    expect(stub.isClosed()).toBe(true);
    expect(stubGame.handlerCount('drop')).toBe(0);
    expect(stubGame.handlerCount('merge')).toBe(0);
    expect(stubGame.handlerCount('gameover')).toBe(0);

    stub.advance(10);
    stubGame.emit('drop', { tier: 0 });
    expect(stub.tones).toHaveLength(1);
  });

  it('dispose 後のユーザー操作では AudioContext を生成しない', () => {
    const { game } = createStubGame();
    const createContext = vi.fn(() => createStubContext().context);

    const sfx = createSfx({ game, muted: false, createContext });
    sfx.dispose();
    window.dispatchEvent(new Event('pointerdown'));

    expect(createContext).not.toHaveBeenCalled();
  });
});

describe('mergeFrequency', () => {
  it('tier 0 は基準周波数、tier が上がるほど単調に下がる', () => {
    expect(mergeFrequency(0)).toBeCloseTo(MERGE_BASE_HZ);

    const tiers: FruitTier[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (let i = 1; i < tiers.length; i += 1) {
      const previous = mergeFrequency(tiers[i - 1] ?? 0);
      const current = mergeFrequency(tiers[i] ?? 0);
      expect(current).toBeLessThan(previous);
    }
  });

  it('全 tier が可聴域（20Hz〜20kHz）に収まる', () => {
    const tiers: FruitTier[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const tier of tiers) {
      expect(mergeFrequency(tier)).toBeGreaterThan(20);
      expect(mergeFrequency(tier)).toBeLessThan(20000);
    }
  });
});
