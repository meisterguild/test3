/**
 * E2E 用のテストフック（#12 / NFR-04）。
 *
 * 物理シミュレーションは非決定的なので、実操作だけで「同種の果物を接触させる」「容器を満杯にする」
 * を再現すると E2E が待機時間頼みになり flaky になる。そこで **盤面を直接組み立てる口** と
 * **内部状態を観測する口** を本ファイル 1 箇所に閉じ込め、`?testapi=1` が付いたときだけ
 * `window.__suikaTestApi` として公開する（既定では公開しない）。
 *
 * 設計上の線引き:
 *
 * - 公開するのは「観測」（{@link SuikaTestApi.status} 等）と「盤面の組み立て」
 *   （{@link SuikaTestApi.drop} / {@link SuikaTestApi.place}）だけ。合体判定・スコア加算・
 *   ゲームオーバー判定は本番と同一の経路を通す（加点や状態遷移をここから直接叩けるようにすると、
 *   テストが検証したいルールそのものを迂回できてしまう）。
 * - `?stress=` / `?fps=`（main.ts）と同じ「URL で有効化するデバッグ足場」の扱い。開発ビルド限定に
 *   しないのは、E2E が本番と同じ成果物（`npm run build` → `preview`）を検証しているため
 *   （playwright.config.ts の `webServer`）。
 * - バックエンド・認証・個人情報を持たないローカル完結のゲーム（NFR-03 / DT-02）なので、
 *   口が本番ビルドに含まれていても、プレイヤーが自分のブラウザのハイスコアを操作できるだけで済む。
 */

import { FRUITS } from '../game/fruits';
import { clampDropX, type GameController } from '../game/game';
import type { FruitSnapshot, PhysicsWorld } from '../game/physics';
import type { FruitDef, FruitTier, GameStatus } from '../game/types';

/** 公開先のプロパティ名。E2E 側（tests/e2e/support/test-api.ts）と共有する契約点 */
export const TEST_API_PROPERTY = '__suikaTestApi';

/**
 * フックの版。E2E 側が「想定した形の口か」を確認するために読む。
 * 破壊的にメソッドを変えるときだけ上げる（増やすだけなら据え置き）。
 */
export const TEST_API_VERSION = 1;

/** `?testapi=1` のクエリキー */
export const TEST_API_QUERY_KEY = 'testapi';

/** E2E へ公開する操作。**この形は tests/e2e/support/test-api.ts との契約点** */
export interface SuikaTestApi {
  readonly version: number;
  /** 状態機械の現在状態 */
  status(): GameStatus;
  /** 現在スコア（合体の加算結果。ここからは加点できない） */
  score(): number;
  /** デッドライン超過の継続時間 (ms)（spec R-E の `overMs`） */
  overMs(): number;
  /** 現在の狙い位置（論理座標 x） */
  aimX(): number;
  /** 盤面の果物すべて（呼ぶたびに新しい配列） */
  fruits(): FruitSnapshot[];
  /**
   * 指定 tier を指定 x（論理座標）から落とす。落ちたら `true`。
   *
   * 先読みキュー（spec R-F）は消費しない（tier を明示するため）。抽選結果に依存せず
   * 「同種の果物を 2 個落とす」を組めるようにするための口。
   */
  drop(tier: FruitTier, x: number): boolean;
  /**
   * 指定 tier を指定位置へ**着地済み**として直接置く。返り値は払い出された果物 ID。
   *
   * 落下を待たずに盤面を組めるので、容器を満杯にした状態（AC-04）や同時接触
   * （R-01）を短時間で再現できる。x は容器の内側へクランプする。
   */
  place(tier: FruitTier, x: number, y: number): number;
  /** 盤面の果物をすべて取り除く（スコア・状態は変えない） */
  clear(): void;
}

/**
 * 本フックが使う依存。`GameController` / `PhysicsWorld` の必要部分だけを受け取る
 * （単体テストからスタブを渡せるようにするため）。
 */
export interface TestApiDeps {
  game: Pick<GameController, 'status' | 'score' | 'overMs' | 'aimX' | 'snapshot' | 'dropAt'>;
  physics: Pick<PhysicsWorld, 'addFruit' | 'clearFruits'>;
  /** 公開先。既定は `window` */
  target?: { [TEST_API_PROPERTY]?: SuikaTestApi };
}

declare global {
  interface Window {
    /** E2E 用のテストフック。`?testapi=1` を付けたときだけ存在する */
    [TEST_API_PROPERTY]?: SuikaTestApi;
  }
}

/**
 * tier を検証して果物定義を返す。
 *
 * 呼び出し元は E2E（型の保証が及ばない `page.evaluate` の中）なので、
 * 範囲外の値は黙って無視せず投げる（テスト側が誤りに気づける形にする）。
 */
function requireFruitDef(tier: FruitTier): FruitDef {
  const def = FRUITS[tier];
  if (def === undefined) {
    throw new RangeError(`tier が範囲外です: ${String(tier)}`);
  }
  return def;
}

/** 座標の検証。`NaN` / `Infinity` で盤面を壊さない */
function requireFinite(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} は有限の数値である必要があります: ${String(value)}`);
  }
  return value;
}

/**
 * テストフックを組み立てて公開する。
 *
 * @returns 公開したフック（呼び出し側が直接使う想定はない。単体テスト用の戻り値）
 */
export function installTestApi(deps: TestApiDeps): SuikaTestApi {
  const { game, physics } = deps;
  const api: SuikaTestApi = {
    version: TEST_API_VERSION,

    status: () => game.status,
    score: () => game.score,
    overMs: () => game.overMs,
    aimX: () => game.aimX,
    fruits: () => game.snapshot(),

    drop(tier, x) {
      requireFruitDef(tier);
      return game.dropAt(requireFinite('x', x), tier);
    },

    place(tier, x, y) {
      const { radius } = requireFruitDef(tier);
      // 壁に食い込んだ位置に生成すると弾き出されるため、ドロップと同じ規則でクランプする
      const clampedX = clampDropX(requireFinite('x', x), radius);
      const body = physics.addFruit(tier, clampedX, requireFinite('y', y), { landed: true });
      return body.fruitId;
    },

    clear: () => physics.clearFruits(),
  };

  const target = deps.target ?? window;
  target[TEST_API_PROPERTY] = api;
  return api;
}
