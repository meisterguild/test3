# スイカゲーム E2E シナリオ対応表（AC ID ↔ テスト）

- 起点 issue: [#12](https://github.com/meisterguild/test3/issues/12)（Part-of [#1](https://github.com/meisterguild/test3/issues/1)）
- AC の定義（真理ソース）: [game-core-rules.md](../../specs/game-core-rules.md)「要件レベル受け入れ条件（AC-01〜AC-06）」
- 実行系: Playwright（`npm run test:e2e`。spec は `tests/e2e/**/*.spec.ts`）

本ファイルは **AC ID とテストの対応を追跡するための一覧**で、`test-scenario-writer` スキルが生成する自然言語シナリオ YAML（同ディレクトリの `*.yaml`）とは別物。こちらは「実装済みの自動テストがどの AC を押さえているか」を示す。

## AC-01〜AC-06（要件レベル・通しシナリオ）

テスト名の先頭に AC ID を入れる規約にしているので、`npx playwright test -g "\[AC-03\]"` のように ID で直接実行できる。

| AC ID | 受け入れ条件 | 根拠 ID | テストファイル | テスト名 | プロジェクト |
| --- | --- | --- | --- | --- | --- |
| AC-01 | 初回アクセスでゲーム画面が表示され、次の果物が見える | FR-08 / UI-01 | `tests/e2e/gameplay.spec.ts` | `[AC-01] 初回アクセスでゲーム画面が表示され、次の果物が見える` | chromium |
| AC-02 | 狙いを左右に動かしてドロップすると、果物が落ちて容器内で静止する | FR-01 / FR-02 | `tests/e2e/gameplay.spec.ts` | `[AC-02] 狙いを左右に動かしてドロップすると、果物が落ちて容器内で静止する` | chromium |
| AC-03 | 同種果物を接触させると 1 段階上へ合体し、スコアが増える | FR-03 / FR-05 | `tests/e2e/gameplay.spec.ts` | `[AC-03] 同種果物を接触させると 1 段階上へ合体し、スコアが増える` | chromium |
| AC-04 | 容器を満杯にするとゲームオーバーモーダルが表示される | FR-07 / UI-02 | `tests/e2e/gameplay.spec.ts` | `[AC-04] 容器を満杯にするとゲームオーバーモーダルが表示される` | chromium |
| AC-05 | リロード後もハイスコアが保持されている | FR-06 | `tests/e2e/gameplay.spec.ts` | `[AC-05] リロード後もハイスコアが保持されている` | chromium |
| AC-06 | 375×667 の viewport でプレイエリア全体が収まりタッチでプレイできる | UI-03 | `tests/e2e/responsive.spec.ts` | `[AC-06] 375×667 の viewport でプレイエリア全体が収まりタッチでプレイできる` | chromium / mobile-portrait |

AC-06 だけ 2 プロジェクトで走る（`mobile-portrait` は 375×667・DPR 2・タッチ有効。`chromium` 側は viewport を合わせてポインタ操作で同じ経路を踏む）。他の spec は `chromium` のみ（`playwright.config.ts` の `testMatch`）。

## 潜在リスクの観測

| ID | リスク | 単体テスト | E2E |
| --- | --- | --- | --- |
| R-01（spec の R-1） | 1 フレーム内の多重合体によるスコア二重計上 | `tests/unit/merge.test.ts > [game-core-rules:R-1]` | `tests/e2e/gameplay.spec.ts > [R-01] 同時接触でもスコアが二重計上されない` |

E2E 側は同 tier 3 個をわずかに重ねて置き、同一フレームに `[(A,B), (B,C)]` が届く状況を実ブラウザで作る。二重計上されるとスコアが 2 倍になるので落ちる。境界値（重複ペア・消滅済み ID 等）の網羅は単体テスト側に置く。

## ルール単位の AC（単体テスト）

`docs/specs/game-core-rules.md` の `AC-1`〜`AC-13` は Vitest で検証する（テスト名の prefix は `[game-core-rules:AC-N]`）。ゼロ埋めの有無で要件レベル（`AC-01`）とルール単位（`AC-1`）を読み分ける。

| spec の AC | テストファイル |
| --- | --- |
| AC-1 / R-4 | `tests/unit/fruits.test.ts` |
| AC-2 / AC-4 / AC-5 / AC-6 / AC-7 / R-1 / R-5 | `tests/unit/merge.test.ts` |
| AC-3 / AC-13 | `tests/unit/score.test.ts` |
| AC-8 / AC-9 / AC-10 / R-3 | `tests/unit/spawn.test.ts` |
| AC-11 / AC-12 / R-2 / R-6 | `tests/unit/gameover.test.ts` |

## flaky 対策（採用した仕組み）

物理シミュレーションは非決定的で、実操作と待機時間だけで AC-03〜AC-04 を再現すると E2E が不安定になる。そこで**テストフック**を実装し、盤面の組み立てと観測をフック経由で行う。

- 実体: `src/debug/test-api.ts`（`?testapi=1` を付けたときだけ `window.__suikaTestApi` として公開する。既定では公開しない）
- E2E 側の包み: `tests/e2e/support/test-api.ts`
- 公開する操作: 観測（`status` / `score` / `overMs` / `aimX` / `fruits`）と盤面の組み立て（`drop` / `place` / `clear`）のみ。合体判定・スコア加算・ゲームオーバー判定は本番と同じ経路を通す
- 「静止した」は待機時間ではなく `isSleeping`、「合体した」はスコアと果物の tier で観測する

seed 固定（`?seed=`）を採らなかった理由は PR / issue #12 の設計判断を参照（フレーム時間が可変なので乱数を固定しても物理は決定論にならない）。

## 実行方法

```bash
# 全 E2E（build → preview を自動起動）
npm run test:e2e

# AC ID で絞る
npx playwright test -g "\[AC-0"

# スマホ縦持ちのプロジェクトだけ
npx playwright test --project=mobile-portrait
```
