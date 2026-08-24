/**
 * 効果音（FR-11）。ドロップ / 合体 / ゲームオーバーの 3 種を鳴らす。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §7（購読するイベント）・
 * §8（ミュート設定 `suika.muted`）
 *
 * 本モジュールは `Game` を**購読するだけ**で、ゲーム状態も DOM も書き換えない
 * （`src/game/**` 側に音の知識を持ち込まない、という契約点 §7 の切り方に合わせる）。
 * ミュート状態の保持・永続化・見た目は HUD（`src/ui/hud.ts`）の責務で、
 * 本モジュールはその値を**受け取って尊重するだけ**（保存はしない）。
 *
 * ## 音源: Web Audio API による合成（外部ファイルなし）
 *
 * 音源ファイルは持たず、`OscillatorNode` + `GainNode` のエンベロープだけで合成する。
 * 素材のライセンス確認が不要になり、`public/sounds/` にバイナリを同梱せずに済む
 * （NFR-03: 外部通信を持たないため、同梱しない＝配信物が増えない方が望ましい）。
 * 代償として音は素朴だが、合体のフィードバックとしては tier ごとの音高差で十分機能する。
 *
 * ## 自動再生ポリシー
 *
 * `AudioContext` は**最初のユーザー操作まで生成しない**。読み込み直後に生成すると
 * `suspended` 状態のコンテキストが残り、ブラウザによっては警告が出る。
 * 生成の起点は 2 つあり、どちらもユーザー操作の中で走る:
 *
 * - {@link SfxDeps.gestureTarget} で受け取る最初の操作（`pointerdown` / `keydown` / `touchend`）
 * - ミュート解除（{@link SfxHandle.setMuted}。ボタン操作から呼ばれる）
 *
 * ## 失敗時の扱い
 *
 * `AudioContext` が使えない環境（未実装・生成拒否）でも**例外を呼び出し側へ漏らさない**。
 * 警告を 1 回だけログに出して、以降は無音のままゲームを続ける（FR-11）。
 */

import type { GameEvents } from '../game/game';
import type { Unsubscribe } from '../game/physics';
import type { FruitTier } from '../game/types';
import { createLocalStore, type LocalStore } from '../storage/local-store';

/** マスター音量（合成音は素の振幅が大きいので全体を絞る） */
export const MASTER_GAIN = 0.35;

/**
 * 同時に鳴らせる音の本数。
 *
 * 連鎖合体は 1 フレームに複数件成立しうる（game.ts の `applyMerges`）。
 * 全部鳴らすと振幅が加算されて割れるため、超過分は捨てる。
 * ゲームオーバーだけは上限を無視する（1 回しか鳴らないうえ、聞こえないと終了に気づけない）。
 */
export const MAX_VOICES = 8;

/** 合体音の基準周波数 (Hz)。tier 0 相当の音高（実際に鳴るのは tier 1 以上） */
export const MERGE_BASE_HZ = 880;

/** 合体音が 1 オクターブ下がるのに要する tier 数（大きいほど tier 差が緩やかになる） */
export const MERGE_TIERS_PER_OCTAVE = 5;

/** 立ち上がり時間 (秒)。0 にするとクリックノイズが出るため最小限の傾斜を付ける */
const ATTACK_SEC = 0.006;

/**
 * 無音とみなすゲイン。
 *
 * `exponentialRampToValueAtTime` は 0 を受け付けない（正の値でなければならない）ため、
 * 0 の代わりに使う可聴域外の値。
 */
const SILENT_GAIN = 0.0001;

/** 既定でユーザー操作とみなすイベント（マウス / キーボード / タッチのそれぞれで最初に届くもの） */
const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

/**
 * 本モジュールが使う `AudioParam` の一部。
 *
 * `AudioContext` 一式を型で要求するとテストからスタブを渡せないため、
 * 実際に呼ぶメソッドだけで切る（戻り値は使わないので `unknown`）。
 */
export interface SfxAudioParam {
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}

/** 本モジュールが使う `GainNode` の一部 */
export interface SfxGainNode {
  readonly gain: SfxAudioParam;
  connect(destination: object): unknown;
}

/** 本モジュールが使う `OscillatorNode` の一部 */
export interface SfxOscillatorNode {
  type: OscillatorType;
  readonly frequency: SfxAudioParam;
  connect(destination: object): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}

/** 本モジュールが使う `AudioContext` の一部 */
export interface SfxAudioContext {
  /** 現在時刻 (秒)。スケジューリングの基準 */
  readonly currentTime: number;
  /** `'suspended'` なら {@link SfxAudioContext.resume} で再開する */
  readonly state: string;
  readonly destination: object;
  createOscillator(): SfxOscillatorNode;
  createGain(): SfxGainNode;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** 本モジュールが使う `EventTarget` の一部（既定は `window`） */
export interface SfxEventTarget {
  addEventListener(
    type: string,
    listener: () => void,
    options?: { once?: boolean; passive?: boolean },
  ): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** 本モジュールが使う `Game`（契約点 §7）の一部。購読しかしないので `on` だけで足りる */
export interface SfxGame {
  on<K extends keyof GameEvents>(event: K, handler: (payload: GameEvents[K]) => void): Unsubscribe;
}

export interface SfxHandle {
  /** 現在のミュート設定 */
  readonly muted: boolean;
  /**
   * ミュート設定を反映する（保存は行わない。永続化は HUD / local-store の責務）。
   *
   * 解除時はその場で `AudioContext` を生成・再開する。ミュートボタンの click から
   * 呼ばれる前提で、ユーザー操作の中で生成することになるため自動再生ポリシーに抵触しない。
   */
  setMuted(muted: boolean): void;
  /**
   * `AudioContext` を生成済みか（自動再生ポリシー準拠の確認用）。
   * 生成に失敗した場合も `false` のまま。
   */
  readonly started: boolean;
  /** 購読を解除し、`AudioContext` を閉じる */
  dispose(): void;
}

export interface SfxDeps {
  game: SfxGame;
  /** 初期ミュート状態。省略時は {@link SfxDeps.store} から読む（契約点 §8） */
  muted?: boolean;
  /**
   * ミュート設定の変化の購読（HUD の `onMuteChange` を渡す）。
   * 省略した場合は {@link SfxHandle.setMuted} で外から反映する。
   */
  subscribeMuted?: (handler: (muted: boolean) => void) => Unsubscribe;
  /** 初期ミュート状態の読み取り元。既定は `localStorage`（テストからはスタブを渡す） */
  store?: LocalStore;
  /** `AudioContext` の生成。既定は `new AudioContext()`（テストからはスタブを渡す） */
  createContext?: () => SfxAudioContext;
  /**
   * 最初のユーザー操作を待つ対象。既定は `window`。
   * `null` を渡すと待たない（生成の起点はミュート解除と最初の再生だけになる）
   */
  gestureTarget?: SfxEventTarget | null;
}

/** 1 音の指定。合成に必要な値だけを持つ */
interface ToneSpec {
  type: OscillatorType;
  /** 開始周波数 (Hz) */
  fromHz: number;
  /** 終了周波数 (Hz)。{@link ToneSpec.fromHz} と等しければグライドしない */
  toHz: number;
  /** 発音長 (秒) */
  durationSec: number;
  /** 立ち上がり後のピーク音量（マスターゲインを掛ける前の値） */
  peak: number;
  /** 発音開始を遅らせる秒数（複数音を並べるときに使う） */
  delaySec: number;
}

/** ドロップ音（FR-01 の操作フィードバック）。短く落ちる 1 音 */
const DROP_TONES: readonly ToneSpec[] = [
  { type: 'triangle', fromHz: 520, toHz: 300, durationSec: 0.1, peak: 0.5, delaySec: 0 },
];

/**
 * ゲームオーバー音（FR-07）。下降する 3 音で「終わり」を示す。
 * 上限（{@link MAX_VOICES}）の対象外なので、合体音が鳴っている最中でも必ず鳴る。
 */
const GAMEOVER_TONES: readonly ToneSpec[] = [
  { type: 'square', fromHz: 392, toHz: 392, durationSec: 0.18, peak: 0.35, delaySec: 0 },
  { type: 'square', fromHz: 294, toHz: 294, durationSec: 0.18, peak: 0.35, delaySec: 0.14 },
  { type: 'square', fromHz: 196, toHz: 196, durationSec: 0.36, peak: 0.35, delaySec: 0.28 },
];

/**
 * 合体音の基準周波数（FR-11: 合体後の tier が高いほど低音にする）。
 *
 * tier ごとに一定比で下げる（等比＝人の耳には等間隔に聞こえる）。
 * 既定値では tier 1 で約 766Hz、最大の tier 10（スイカ）で 220Hz。
 */
export function mergeFrequency(tier: FruitTier): number {
  return MERGE_BASE_HZ * 2 ** (-tier / MERGE_TIERS_PER_OCTAVE);
}

/** 合体音。基準周波数から上へ跳ねる 1 音（「ポン」と鳴らす） */
function mergeTones(tier: FruitTier): readonly ToneSpec[] {
  const base = mergeFrequency(tier);
  return [
    { type: 'square', fromHz: base, toHz: base * 1.5, durationSec: 0.16, peak: 0.3, delaySec: 0 },
  ];
}

/** 既定の `AudioContext` 生成。未実装のブラウザでは投げる（呼び出し側が握りつぶす） */
function createDefaultContext(): SfxAudioContext {
  if (typeof AudioContext === 'undefined') {
    throw new Error('AudioContext が利用できません');
  }
  return new AudioContext();
}

/** 既定のユーザー操作の受け口。`window` が無い環境（SSR・node テスト）では待たない */
function resolveDefaultGestureTarget(): SfxEventTarget | null {
  return typeof window === 'undefined' ? null : window;
}

/**
 * 効果音を `Game` に接続する。
 *
 * 購読するイベント（契約点 §7）:
 *
 * - `drop` … ドロップ音
 * - `merge` … 合体音（payload の `tier` で音高を決める）
 * - `gameover` … 終了音
 */
export function createSfx(deps: SfxDeps): SfxHandle {
  const { game } = deps;
  const createContext = deps.createContext ?? createDefaultContext;
  const gestureTarget =
    deps.gestureTarget === undefined ? resolveDefaultGestureTarget() : deps.gestureTarget;

  let muted = deps.muted ?? (deps.store ?? createLocalStore()).getMuted();
  let context: SfxAudioContext | null = null;
  let master: SfxGainNode | null = null;
  /** 生成に失敗したか。一度失敗したら以降は試さない（毎フレーム例外を投げさせない） */
  let contextFailed = false;
  let disposed = false;
  /** 発音中の音の終了時刻 (秒)。{@link MAX_VOICES} の判定に使う */
  const voiceEndTimes: number[] = [];
  /** 同じ警告を繰り返さないための既出メッセージ */
  const warned = new Set<string>();

  /** 同じ文言の警告は 1 回だけ出す（毎フレーム鳴らすので抑制しないとログが埋まる） */
  function warnOnce(message: string, error: unknown): void {
    if (warned.has(message)) {
      return;
    }
    warned.add(message);
    console.warn(message, error);
  }

  /** ユーザー操作の待ち受けを外す。生成を試みたあとは不要になる */
  function detachGesture(): void {
    if (gestureTarget === null) {
      return;
    }
    for (const type of GESTURE_EVENTS) {
      gestureTarget.removeEventListener(type, handleGesture);
    }
  }

  /**
   * `AudioContext` とマスターゲインを用意する（初回だけ生成する）。
   *
   * @returns 使えるコンテキスト。ミュート中・生成失敗・dispose 済みなら `null`
   */
  function ensureContext(): SfxAudioContext | null {
    if (disposed || contextFailed || muted) {
      return null;
    }
    if (context !== null) {
      return context;
    }
    try {
      const created = createContext();
      const gain = created.createGain();
      gain.gain.setValueAtTime(MASTER_GAIN, created.currentTime);
      gain.connect(created.destination);
      context = created;
      master = gain;
      return context;
    } catch (error) {
      // 音が出ないだけでゲームは続く（FR-11）
      contextFailed = true;
      warnOnce('効果音を初期化できませんでした（音なしで続行します）', error);
      return null;
    }
  }

  /** `suspended` なら再開する。失敗しても無視する（音が出ないだけ） */
  function resumeContext(target: SfxAudioContext): void {
    if (target.state !== 'suspended') {
      return;
    }
    try {
      void target.resume().catch(() => undefined);
    } catch {
      // 再開できない状態（closed 等）でも呼び出し側を止めない
    }
  }

  /** 終了済みの音を台帳から落とす */
  function pruneVoices(nowSec: number): void {
    for (let i = voiceEndTimes.length - 1; i >= 0; i -= 1) {
      if ((voiceEndTimes[i] ?? 0) <= nowSec) {
        voiceEndTimes.splice(i, 1);
      }
    }
  }

  /** 1 音を組み立ててスケジュールする */
  function playTone(
    target: SfxAudioContext,
    output: SfxGainNode,
    spec: ToneSpec,
    nowSec: number,
  ): void {
    const startSec = nowSec + spec.delaySec;
    const endSec = startSec + spec.durationSec;

    const oscillator = target.createOscillator();
    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(spec.fromHz, startSec);
    if (spec.toHz !== spec.fromHz) {
      oscillator.frequency.exponentialRampToValueAtTime(spec.toHz, endSec);
    }

    /*
     * エンベロープは「短い立ち上がり → 指数減衰」。矩形波を素で切ると
     * 始端・終端でクリックノイズが出るため、必ずゲインで包む。
     */
    const envelope = target.createGain();
    envelope.gain.setValueAtTime(SILENT_GAIN, startSec);
    envelope.gain.linearRampToValueAtTime(spec.peak, startSec + ATTACK_SEC);
    envelope.gain.exponentialRampToValueAtTime(SILENT_GAIN, endSec);

    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(startSec);
    oscillator.stop(endSec);

    voiceEndTimes.push(endSec);
  }

  /**
   * 指定の音を鳴らす。ミュート中・コンテキストが使えないときは何もしない。
   *
   * @param capped {@link MAX_VOICES} の上限を尊重するか（`false` なら必ず鳴らす）
   */
  function play(specs: readonly ToneSpec[], capped: boolean): void {
    if (muted || disposed) {
      return;
    }
    const target = ensureContext();
    if (target === null || master === null) {
      return;
    }
    try {
      resumeContext(target);
      const nowSec = target.currentTime;
      pruneVoices(nowSec);
      if (capped && voiceEndTimes.length + specs.length > MAX_VOICES) {
        return;
      }
      for (const spec of specs) {
        playTone(target, master, spec, nowSec);
      }
    } catch (error) {
      // 再生できないことでゲームを止めない（FR-11）
      warnOnce('効果音を再生できませんでした（音なしで続行します）', error);
    }
  }

  /**
   * 最初のユーザー操作。ここで初めて `AudioContext` を生成する。
   *
   * ミュート中は生成せず、待ち受けも外さない（解除後の最初の操作で生成できるようにする）。
   */
  function handleGesture(): void {
    if (muted) {
      return;
    }
    const target = ensureContext();
    // 生成を試みた時点で待ち受けの役目は終わり（失敗した場合も再試行しない）
    detachGesture();
    if (target !== null) {
      resumeContext(target);
    }
  }

  function setMuted(next: boolean): void {
    if (muted === next || disposed) {
      return;
    }
    muted = next;
    if (muted) {
      return;
    }
    // 解除操作はユーザー操作なので、この場で生成してよい
    const target = ensureContext();
    if (target !== null) {
      detachGesture();
      resumeContext(target);
    }
  }

  if (gestureTarget !== null) {
    for (const type of GESTURE_EVENTS) {
      gestureTarget.addEventListener(type, handleGesture, { passive: true });
    }
  }

  const unsubscribes: Unsubscribe[] = [
    game.on('drop', () => {
      play(DROP_TONES, true);
    }),
    game.on('merge', ({ tier }) => {
      play(mergeTones(tier), true);
    }),
    game.on('gameover', () => {
      play(GAMEOVER_TONES, false);
    }),
  ];

  const unsubscribeMuted = deps.subscribeMuted?.(setMuted);

  return {
    get muted() {
      return muted;
    },

    get started() {
      return context !== null;
    },

    setMuted,

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
      unsubscribes.length = 0;
      unsubscribeMuted?.();
      detachGesture();
      voiceEndTimes.length = 0;
      if (context !== null) {
        try {
          void context.close().catch(() => undefined);
        } catch {
          // 既に閉じている場合でも dispose を失敗させない
        }
        context = null;
        master = null;
      }
    },
  };
}
