# 操作スクリプトの例（Webアプリ / Playwright の場合）

一回限りの操作スクリプトの一例として、Webアプリを Playwright ライブラリで直接操作する場合を示す。証跡ディレクトリに `run-<対象>.mjs` として保存し、`node` で実行する。

対象がネイティブアプリ・CLI 等の場合はこの例をそのまま使えないが、構成は共通 — シナリオID単位で「操作 → 各検証ポイントで証跡取得（スクリーンショットまたは出力保存） → 機械チェック結果をJSONで出力」の形に揃える。

```js
import { chromium } from "playwright";

const EVIDENCE = "<証跡ディレクトリ>";
const results = [];
const browser = await chromium.launch();
const page = await browser.newPage();

// ATT-LOGIN-004: 認証成功時にダッシュボードへ遷移する
await page.goto("http://localhost:8001/login");
await page.screenshot({
  path: `${EVIDENCE}/ATT-LOGIN-004_01_login.png`,
  fullPage: true,
});
await page.fill('input[name="email"]', process.env.E2E_USER_EMAIL);
await page.fill('input[name="password"]', process.env.E2E_USER_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL("**/dashboard");
await page.screenshot({
  path: `${EVIDENCE}/ATT-LOGIN-004_02_dashboard.png`,
  fullPage: true,
});
results.push({
  id: "ATT-LOGIN-004",
  check: "ダッシュボードへ遷移",
  ok: page.url().includes("/dashboard"),
});

await browser.close();
console.log(JSON.stringify(results, null, 2));
```
