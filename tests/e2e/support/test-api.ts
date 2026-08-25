/**
 * テストフック（`src/debug/test-api.ts`）を E2E から使うための薄い包み。
 *
 * `page.evaluate` の中では外側のヘルパを呼べないため、各関数がフックの取得と呼び出しを
 * それぞれ完結させている（重複は意図的。`window.__suikaTestApi` を触る箇所を本ファイルに閉じる）。
 *
 * `*.spec.ts` に一致しないファイル名なので Playwright のテスト収集対象にはならない。
 */

import { expect, type Page } from '@playwright/test';

import { TEST_API_VERSION } from '../../../src/debug/test-api';
import type { FruitSnapshot } from '../../../src/game/physics';
import type { FruitTier, GameStatus } from '../../../src/game/types';

/** テストフックを有効化するクエリ（`src/debug/test-api.ts` の `TEST_API_QUERY_KEY`） */
export const TEST_API_QUERY = 'testapi=1';

/** 盤面が静止したと判断するまでの待ち時間。sleeping の判定は Matter.js 側で 60 フレームかかる */
const REST_TIMEOUT_MS = 10_000;

/**
 * テストフックを有効にしてトップページを開き、フックが公開されるまで待つ。
 *
 * @param extraQuery 追加のクエリ（`stress=60` のように `key=value` 形式で渡す）
 */
export async function openWithTestApi(page: Page, extraQuery?: string): Promise<void> {
  const query = extraQuery === undefined ? TEST_API_QUERY : `${TEST_API_QUERY}&${extraQuery}`;
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__suikaTestApi !== undefined);
  // 想定した形の口が公開されているか（フックの形を変えたら E2E 側も直す）
  expect(await page.evaluate(() => window.__suikaTestApi?.version)).toBe(TEST_API_VERSION);
}

/** 盤面の果物すべて */
export function readFruits(page: Page): Promise<FruitSnapshot[]> {
  return page.evaluate(() => {
    const api = window.__suikaTestApi;
    if (api === undefined) {
      throw new Error('テストフックが公開されていません（?testapi=1 を付けて開く）');
    }
    return api.fruits();
  });
}

/** 現在スコア（HUD の表示ではなくゲーム内部の値） */
export function readScore(page: Page): Promise<number> {
  return page.evaluate(() => {
    const api = window.__suikaTestApi;
    if (api === undefined) {
      throw new Error('テストフックが公開されていません（?testapi=1 を付けて開く）');
    }
    return api.score();
  });
}

/** 状態機械の現在状態 */
export function readStatus(page: Page): Promise<GameStatus> {
  return page.evaluate(() => {
    const api = window.__suikaTestApi;
    if (api === undefined) {
      throw new Error('テストフックが公開されていません（?testapi=1 を付けて開く）');
    }
    return api.status();
  });
}

/** 現在の狙い位置（論理座標 x） */
export function readAimX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const api = window.__suikaTestApi;
    if (api === undefined) {
      throw new Error('テストフックが公開されていません（?testapi=1 を付けて開く）');
    }
    return api.aimX();
  });
}

/** 指定 tier を指定 x（論理座標）から落とす */
export function dropFruit(page: Page, tier: FruitTier, x: number): Promise<boolean> {
  return page.evaluate(
    ({ tier: dropTier, x: dropX }) => {
      const api = window.__suikaTestApi;
      if (api === undefined) {
        throw new Error('テストフックが公開されていません（?testapi=1 を付けて開く）');
      }
      return api.drop(dropTier, dropX);
    },
    { tier, x },
  );
}

/** 指定 tier を着地済みとして直接置く（返り値は果物 ID） */
export function placeFruit(page: Page, tier: FruitTier, x: number, y: number): Promise<number> {
  return page.evaluate(
    ({ tier: placeTier, x: placeX, y: placeY }) => {
      const api = window.__suikaTestApi;
      if (api === undefined) {
        throw new Error('テストフックが公開されていません（?testapi=1 を付けて開く）');
      }
      return api.place(placeTier, placeX, placeY);
    },
    { tier, x, y },
  );
}

/** {@link placeFruits} に渡す 1 個分の指定 */
export interface FruitPlacement {
  tier: FruitTier;
  x: number;
  y: number;
}

/**
 * 複数の果物をまとめて置く。
 *
 * 1 回の `page.evaluate` で置き切るのは、呼び出しをまたぐ間に物理が進んで
 * 「置いている途中の盤面」が崩れるのを避けるため（同時接触や満杯状態の再現に効く）。
 */
export function placeFruits(page: Page, placements: readonly FruitPlacement[]): Promise<number[]> {
  return page.evaluate((specs) => {
    const api = window.__suikaTestApi;
    if (api === undefined) {
      throw new Error('テストフックが公開されていません（?testapi=1 を付けて開く）');
    }
    return specs.map((spec) => api.place(spec.tier, spec.x, spec.y));
  }, placements as FruitPlacement[]);
}

/**
 * 盤面が「指定個数で静止した」状態になるまで待ち、そのスナップショットを返す。
 *
 * 静止の判定は待機時間ではなく Matter.js の sleeping（`isSleeping`）で行う
 * （ENABLE_SLEEPING = true。契約点 §5）。合体で個数が変わる盤面では使わない。
 */
export async function waitForRest(page: Page, expectedCount: number): Promise<FruitSnapshot[]> {
  await expect
    .poll(
      async () => {
        const fruits = await readFruits(page);
        return fruits.length === expectedCount && fruits.every((fruit) => fruit.isSleeping);
      },
      { timeout: REST_TIMEOUT_MS, message: `果物 ${expectedCount} 個が静止しない` },
    )
    .toBe(true);
  return readFruits(page);
}
