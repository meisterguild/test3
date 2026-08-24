import { expect, test, type Page } from '@playwright/test';

/**
 * 効果音（T-09 / FR-11）の E2E。
 *
 * 音そのものは自動では聞き取れないため、**`AudioContext` の生成と `OscillatorNode` の本数**を
 * 数えて「鳴らそうとしたか」を観測する。音の内容（音高・エンベロープ）は
 * tests/unit/sfx.test.ts が固定しているので、ここでは実ブラウザでしか確認できない
 * 3 点だけを見る。
 *
 * - 読み込み直後に `AudioContext` を作っていないこと（ブラウザの自動再生ポリシー準拠）
 * - 実際のドロップ操作で音が鳴ること
 * - ミュート設定（契約点 §8）が再生を止めること
 * - `AudioContext` が無い環境でもゲームが壊れないこと
 */

/** 契約点 §8 の永続化キー */
const MUTED_KEY = 'suika.muted';

/** 観測結果を持たせる window のプロパティ名（本番コードには口を作らない） */
const PROBE_KEY = '__sfxProbe';

/** ドロップのクールダウン（FR-10 / `DROP_COOLDOWN_MS`）を確実に越える待ち時間 */
const COOLDOWN_WAIT_MS = 600;

interface SfxProbe {
  /** 生成された `AudioContext` の数 */
  contexts: number;
  /** 生成された `OscillatorNode` の数（＝鳴らそうとした音の本数） */
  oscillators: number;
}

/**
 * `AudioContext` を数える計測器をページのスクリプトより先に差し込む。
 *
 * `addInitScript` を使うのは、アプリの起動（`bootstrap()`）より前に差し替える必要があるため。
 */
async function installSfxProbe(page: Page): Promise<void> {
  await page.addInitScript(
    ([probeKey]) => {
      const key = probeKey ?? '';
      const probe = { contexts: 0, oscillators: 0 };
      Object.defineProperty(window, key, { value: probe });

      const Original = window.AudioContext;
      if (Original === undefined) {
        return;
      }
      window.AudioContext = class ProbedAudioContext extends Original {
        constructor(options?: AudioContextOptions) {
          super(options);
          probe.contexts += 1;
        }
        override createOscillator(): OscillatorNode {
          probe.oscillators += 1;
          return super.createOscillator();
        }
      };
    },
    [PROBE_KEY],
  );
}

/** 計測結果を読み出す */
async function readSfxProbe(page: Page): Promise<SfxProbe> {
  return page.evaluate(
    ([probeKey]) =>
      (window as unknown as Record<string, SfxProbe | undefined>)[probeKey ?? ''] ?? {
        contexts: 0,
        oscillators: 0,
      },
    [PROBE_KEY],
  );
}

/** 盤面の中央をクリックして果物を落とす（＝ユーザー操作 + `drop` イベント） */
async function dropFruit(page: Page): Promise<void> {
  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('[FR-11] ページ読み込み直後は AudioContext を生成しない（自動再生ポリシー）', async ({
  page,
}) => {
  await installSfxProbe(page);
  await page.goto('/');
  await expect(page.getByTestId('game-canvas')).toBeVisible();

  expect((await readSfxProbe(page)).contexts).toBe(0);
});

test('[FR-11] ドロップ操作で AudioContext が生成され効果音が鳴る', async ({ page }) => {
  await installSfxProbe(page);
  await page.goto('/');
  await dropFruit(page);

  await expect.poll(async () => (await readSfxProbe(page)).oscillators).toBeGreaterThan(0);
  // ユーザー操作が何度あってもコンテキストは 1 つだけ
  expect((await readSfxProbe(page)).contexts).toBe(1);
});

test('[FR-11 / DT-02] ミュート中は音を鳴らさず AudioContext も作らない', async ({ page }) => {
  await installSfxProbe(page);
  await page.goto('/');
  await page.evaluate(
    ([key]) => {
      window.localStorage.setItem(key ?? '', 'true');
    },
    [MUTED_KEY],
  );
  await page.reload();

  await expect(page.getByTestId('mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  await dropFruit(page);

  const muted = await readSfxProbe(page);
  expect(muted.contexts).toBe(0);
  expect(muted.oscillators).toBe(0);

  // 解除すれば鳴る（解除操作がユーザー操作なので、その場で生成してよい）
  await page.getByTestId('mute-toggle').click();
  expect((await readSfxProbe(page)).contexts).toBe(1);
  // 直前のドロップのクールダウン（FR-10 / `DROP_COOLDOWN_MS`）を越えてから落とす
  await page.waitForTimeout(COOLDOWN_WAIT_MS);
  await dropFruit(page);
  await expect.poll(async () => (await readSfxProbe(page)).oscillators).toBeGreaterThan(0);
});

test('[FR-11] AudioContext が使えない環境でもゲームが継続する', async ({ page }) => {
  await page.addInitScript(() => {
    // Web Audio API を持たないブラウザ / 生成が拒否される状況を再現する
    Object.defineProperty(window, 'AudioContext', { value: undefined });
  });
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');
  await dropFruit(page);

  // 起動エラーの掲示（main.ts の boot-error）が出ていない＝ゲームは動いている
  await expect(page.getByTestId('boot-error')).toHaveCount(0);
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  expect(pageErrors).toHaveLength(0);
});
