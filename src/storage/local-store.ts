/**
 * `localStorage` の隠蔽（FR-06 / DT-02）。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §8（キー名・型・既定値）
 *
 * 本モジュールの責務は「壊れた保存値と使えないストレージを、呼び出し側から見えないようにすること」。
 * したがって **読み書きは一切例外を投げない**（プライベートモード・ストレージ無効化・容量超過でも
 * ゲームが止まらないこと）。保存値が壊れていれば既定値（`0` / `false`）へフォールバックする。
 *
 * 保存するのはハイスコアとミュート設定だけで、個人情報・識別子は保存しない（契約点 §8）。
 */

/** ハイスコアのキー（契約点 §8。**この文字列は契約点**） */
export const HIGH_SCORE_KEY = 'suika.highScore';

/** ミュート設定のキー（契約点 §8。**この文字列は契約点**） */
export const MUTED_KEY = 'suika.muted';

/** ハイスコアの既定値（契約点 §8） */
export const DEFAULT_HIGH_SCORE = 0;

/** ミュート設定の既定値（契約点 §8） */
export const DEFAULT_MUTED = false;

/**
 * ハイスコアとして受け付ける上限。
 *
 * これを超える値（`"1e308"` や桁を足された値）は「壊れた保存値」として既定値へ落とす。
 * 上限を安全な整数に置くのは、`Number` に載せた時点で桁が落ちる値を正常値として扱わないため。
 */
export const MAX_HIGH_SCORE = Number.MAX_SAFE_INTEGER;

/**
 * 本モジュールが使う `localStorage` の一部。
 *
 * `Storage` 全体ではなくこの 4 メソッドで切るのは、テストから最小のスタブ（読み書きで例外を
 * 投げるものを含む）を渡せるようにするため。
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 契約点 §8 の永続化 API */
export interface LocalStore {
  /** 保存されたハイスコア。未保存・壊れた値・読み取り失敗時は {@link DEFAULT_HIGH_SCORE} */
  getHighScore(): number;
  /**
   * ハイスコアを保存する。
   *
   * 非有限値・負値・{@link MAX_HIGH_SCORE} 超過は保存しない（壊れた値を書き込まない）。
   * 小数は切り捨てる。書き込みに失敗しても例外は投げない。
   */
  setHighScore(score: number): void;
  /** 保存されたミュート設定。未保存・壊れた値・読み取り失敗時は {@link DEFAULT_MUTED} */
  getMuted(): boolean;
  /** ミュート設定を保存する。書き込みに失敗しても例外は投げない */
  setMuted(muted: boolean): void;
}

/**
 * 既定のストレージ（`globalThis.localStorage`）を取得する。
 *
 * プロパティへのアクセス自体が `SecurityError` を投げるブラウザ設定（Cookie 無効時の Chrome 等）が
 * あるため、参照も try/catch で包む。使えなければ `null` を返し、以降の読み書きは既定値で動く。
 */
function resolveDefaultStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 例外を飲んで値を読む。読めなければ `null`（＝未保存と同じ扱い） */
function readItem(storage: KeyValueStorage | null, key: string): string | null {
  if (storage === null) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** 例外を飲んで値を書く。失敗（容量超過・無効化）は黙って捨てる */
function writeItem(storage: KeyValueStorage | null, key: string, value: string): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(key, value);
  } catch {
    // 保存できないことでゲームを止めない（FR-06）
  }
}

/**
 * 保存文字列をハイスコアとして解釈する。
 *
 * `Number` を使うのは、`Number.parseInt` が `"12abc"` を `12` として受けてしまうため
 * （壊れた保存値は既定値へ落としたい）。
 *
 * @returns 0 以上 {@link MAX_HIGH_SCORE} 以下の整数。解釈できなければ {@link DEFAULT_HIGH_SCORE}
 */
export function parseHighScore(raw: string | null): number {
  if (raw === null) {
    return DEFAULT_HIGH_SCORE;
  }
  const trimmed = raw.trim();
  // `Number('')` は 0 になるため、空文字は明示的に弾く
  if (trimmed === '') {
    return DEFAULT_HIGH_SCORE;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > MAX_HIGH_SCORE) {
    return DEFAULT_HIGH_SCORE;
  }
  // 小数（`"12.7"`）は切り捨てて受ける。表示は整数で行うため
  return Math.floor(value);
}

/**
 * 保存文字列をミュート設定として解釈する。
 *
 * 契約点 §8 の表記（`"true"` / `"false"`）だけを真偽として受け、それ以外はすべて既定値
 * （`false`）にする。`"1"` 等を真として広く受けると、書き込み側の表記が揺れても検知できない。
 */
export function parseMuted(raw: string | null): boolean {
  return raw === 'true';
}

/**
 * 永続化ストアを生成する。
 *
 * @param storage 保存先。既定は `globalThis.localStorage`（使えない環境では `null` 相当に落ち、
 *   読み取りは既定値・書き込みは無視になる）。テストからはスタブを渡す
 */
export function createLocalStore(
  storage: KeyValueStorage | null = resolveDefaultStorage(),
): LocalStore {
  return {
    getHighScore() {
      return parseHighScore(readItem(storage, HIGH_SCORE_KEY));
    },

    setHighScore(score) {
      if (!Number.isFinite(score)) {
        return;
      }
      const value = Math.floor(score);
      if (value < 0 || value > MAX_HIGH_SCORE) {
        return;
      }
      writeItem(storage, HIGH_SCORE_KEY, String(value));
    },

    getMuted() {
      return parseMuted(readItem(storage, MUTED_KEY));
    },

    setMuted(muted) {
      writeItem(storage, MUTED_KEY, muted ? 'true' : 'false');
    },
  };
}
