import { defineConfig, devices } from '@playwright/test';

const PREVIEW_HOST = '127.0.0.1';
const PREVIEW_PORT = 4173;
const BASE_URL = `http://${PREVIEW_HOST}:${PREVIEW_PORT}`;

/**
 * E2E テスト設定。契約点 §9 に従い spec は tests/e2e/<scenario>.spec.ts に置く。
 * 本番と同じ成果物を検証したいので、dev サーバではなく build → preview を対象にする。
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // PC 想定。viewport は template/.playwright/cli.config.json と揃える。
      // スマホ縦持ち向けのプロジェクトは T-10 / T-11 で追加する。
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    /*
     * build もこの command に含める。npm script 側に置くと `npx playwright test` や
     * IDE から直接起動したときに build が走らず、古い dist/ でテストが緑になる。
     *
     * host を明示するのは、`vite preview` の既定 host（localhost）が環境によって ::1 だけを
     * listen し、IPv4 の baseURL と食い違って webServer 待機がタイムアウトするため。
     */
    command: `npm run build && npm run preview -- --host ${PREVIEW_HOST} --port ${PREVIEW_PORT} --strictPort`,
    url: BASE_URL,
    /*
     * 既存サーバを再利用しない。再利用すると command 自体が実行されず build が飛ぶため、
     * 「常に最新の dist/ を検証する」保証が失われる。手元で preview を起動したまま
     * E2E を回すと strictPort で衝突するので、その場合は先に preview を止める。
     */
    reuseExistingServer: false,
    // tsc + vite build + preview 起動の合計をカバーする値
    timeout: 180_000,
    // build / preview の出力を握り潰さない（起動失敗の原因を追えるようにする）
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
