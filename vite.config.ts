import { defineConfig } from 'vitest/config';

/**
 * Vite（開発サーバ / ビルド）と Vitest（単体テスト）の設定を 1 箇所に集約する。
 * 契約点: docs/internal/architecture/suika-game-structure.md §1 / §2
 */
export default defineConfig({
  build: {
    // NFR-02: Chrome / Safari / Firefox / Edge の最新安定版が対象。IE は非対応。
    // 「最新安定版」の下限として、ES2022 構文がネイティブに通る世代を明示しておく
    // （Vite の既定 baseline に依存させず、要件由来の値としてここに固定する）。
    target: ['es2022', 'chrome111', 'edge111', 'firefox111', 'safari16.4'],
    outDir: 'dist',
    /*
     * 本番成果物にソースを埋め込まない。障害解析が必要なときだけ `SUIKA_SOURCEMAP=1` を付ける。
     * `VITE_` 接頭辞は「クライアントへ露出する env」の名前空間なので使わず、
     * 汎用名（SOURCEMAP 等）が偶然設定されていて誤って有効化されないよう接頭辞を付ける。
     */
    sourcemap: process.env.SUIKA_SOURCEMAP === '1',
  },
  test: {
    // NFR-05: ゲームルールは純関数なので DOM 不要。DOM が必要なテストだけ
    // ファイル先頭に `// @vitest-environment jsdom` を書いて個別に切り替える。
    environment: 'node',
    // 契約点 §9: 単体テストは tests/unit/<module>.test.ts に置く。
    // tests/e2e は Playwright の担当なので Vitest からは除外する。
    include: ['tests/unit/**/*.test.ts'],
    // 基盤構築（T-01）時点では単体テストが 0 件でも `npm test` を成功させる。
    passWithNoTests: true,
  },
});
