import { expect, test } from '@playwright/test';

/**
 * HUD（T-07 / FR-05 / FR-06 / FR-08 / DT-02 / UI-01）のスモークテスト。
 *
 * 合体を伴うスコア加算のシナリオ（AC 付き）は T-11 で追加する。ここでは
 * **永続化の読み書きと表示の配線**（ブラウザの `localStorage` を実際に経由する経路）だけを見る。
 * 表示の更新規則は tests/unit/hud.test.ts が固定している。
 */

/** 契約点 §8 の永続化キー */
const HIGH_SCORE_KEY = 'suika.highScore';
const MUTED_KEY = 'suika.muted';

test('[UI-01] HUD にスコア・ハイスコア・次の果物・ミュートが表示される', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('score')).toHaveText('0');
  await expect(page.getByTestId('high-score')).toHaveText('0');
  // FR-08: 次の果物は名前で示される（果物名は 2 文字以上の日本語）
  await expect(page.getByTestId('next-fruit')).not.toBeEmpty();
  await expect(page.getByTestId('mute-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('[FR-06] 保存済みのハイスコアがリロード後も表示される', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(
    ([key]) => {
      window.localStorage.setItem(key ?? '', '12345');
    },
    [HIGH_SCORE_KEY],
  );

  await page.reload();

  // 表示は 3 桁区切り（ja-JP）
  await expect(page.getByTestId('high-score')).toHaveText('12,345');
});

test('[DT-02] ミュート設定がリロード後も保持される', async ({ page }) => {
  await page.goto('/');

  const toggle = page.getByTestId('mute-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  const stored = await page.evaluate(
    ([key]) => window.localStorage.getItem(key ?? ''),
    [MUTED_KEY],
  );
  expect(stored).toBe('true');

  await page.reload();
  await expect(page.getByTestId('mute-toggle')).toHaveAttribute('aria-pressed', 'true');
});

test('[FR-06] localStorage が使えない環境でもゲームが起動する', async ({ page }) => {
  /*
   * `localStorage` のプロパティ参照そのものが投げる状態（プライベートモード等）を再現する。
   * ページのスクリプトより先に差し込む必要があるので addInitScript を使う。
   */
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('SecurityError');
      },
    });
  });

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  // 盤面と HUD が出ていて、起動エラーの表示が無いこと
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('0');
  await expect(page.getByTestId('high-score')).toHaveText('0');
  await expect(page.getByTestId('boot-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});
