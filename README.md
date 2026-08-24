# AIプロジェクト立ち上げテンプレート

言語・フレームワークを問わず、Claude Code を活用した新規プロジェクトの立ち上げをスムーズに始めるためのテンプレートです。AIによる要件ヒアリング（または要求仕様読み込み）から、要件定義書・基本設計書の生成までを主対象とし、設計後に同一リポジトリで開発を続ける場合のフェーズ承認付き実装フローも同梱しています。

新しいプロジェクトを開始する際にこのテンプレートをコピーし、AIと対話しながら要件を整理することで、すぐにAI開発を開始できます。

---

## このテンプレートでできること

- Claude Code がプロジェクトのルール・規約を理解した状態で開発を始められる
- チームメンバー全員が同じAI開発環境を再現できる
- AIが要件ヒアリング（または要求仕様読み込み）を行い、要件定義書・基本設計書などのプロジェクトドキュメントを生成できる
- フェーズごとの承認ワークフローで、AIが暴走せず確認を取りながら開発を進められる
- git push 時の AI レビューゲート（セキュリティ / 品質所見が high なら push をブロック。lefthook 等の追加インストール不要、前提は python3 と claude CLI のみ）

---

## このリポジトリの構成

このリポジトリは、役割の異なる **2 つの層** で構成されています。

| 層 | 位置 | 役割 | コピーする？ |
| ---------------- | ------------------ | ------------------------------------------------------------ | ------------ |
| **テンプレート層** | `template/` 配下 | プロジェクトへ持ち込むテンプレート本体（規約・ドキュメント・スキル・hook） | **する** |
| **メタ層** | `template/` の外 | このリポジトリ自身の説明・運用資産（使い方ガイド、リポジトリ自身の設定） | しない |

**コピー対象の判定基準は「`template/` 配下かどうか」の 1 行だけです。**ファイル単位で選ぶ必要はありません。

```text
000-ai-template/
├── README.md                         # このファイル（使い方ガイド。メタ層）
├── CLAUDE.md                         # このリポジトリ自体を開発する AI への指示書（メタ層）
├── .gitignore                        # このリポジトリ自身の git 管理設定（メタ層）
├── .claude/
│   ├── settings.json                 # このリポジトリでの Claude Code 設定（push ゲートの配線）
│   └── hooks/push-review-gate.sh     # template/ 側の実体へ委譲するフォワーダ
├── tests/                            # テンプレート層の hook のテスト（メタ層）
└── template/                         # ← プロジェクトへコピーする本体
```

`template/` 直下がコピー先の**プロジェクトルート**に対応します。したがって `template/CLAUDE.md` は `your-project/CLAUDE.md` に、`template/docs/` は `your-project/docs/` になります。

---

## 新プロジェクト開始時の手順

### Step 1: テンプレートをコピー

```bash
# template/ の中身をプロジェクトのルートディレクトリにコピー
cp -r /path/to/000-ai-template/template/. /path/to/your-project/
```

> ※ 末尾の `/.` は、ドットファイル（`.claude` / `.playwright` / `.gitignore`）を含めてコピーするために必須です。
> ※ `template/` ディレクトリ自体はコピーされません（中身だけがプロジェクトルートに展開されます）。

### Step 2: プラグインを導入（必要な場合のみ）

本テンプレートのフローでよく使う汎用スキル4件は同梱済みです。追加のスキルが必要な場合のみ、後述の「[プラグインで導入するスキル](#プラグインで導入するスキル)」の手順でインストールします。

### Step 3: プロジェクトを開始

Claude Code に以下を入力します。

```text
START_PROMPT.md の内容でプロジェクトを開始してください
```

AIが要件定義の進め方を確認し、選択に応じて次のいずれかの方式で進めます。

| 方式                | 進め方                                                                  | 参照                                              |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| A. 要件ヒアリング   | 資料なしで、AIとの対話により要件を整理し、要件定義書を作成する          | `docs/internal/workflow/requirements-interview.md` |
| B. 要求仕様読み込み | `docs/internal/inputs/` に格納した要求仕様・議事録から要件定義書を作成する | `.claude/skills/requirements-definition/SKILL.md` |

> ※ 要求仕様・議事録には契約条件・個人情報が含まれる可能性があるため、`docs/internal/inputs/` はgit管理対象外とすること。
> ※ 生成物に契約条件・個人情報が含まれる場合は、gitへのコミット前に削除またはマスクすること。

### Step 4: 外部設計

要件定義の承認後、AIが以下の順序で外部設計を行います。

1. **技術条件の確認**: `docs/internal/workflow/design-interview.md` の Step 1 に従い、技術スタック・制約を確定する
2. **基本設計書の生成**: `/requirements-to-functional-design` スキルで基本設計書一式を作成する（成果物は `docs/deliverables/functional-design/`。承認ポイント・レビューはスキル側の規定に従う）
3. **UIデザイン（必要な場合）**: `/design-ui` スキルでUIデザインを制作する（成果物は `docs/internal/design/` と Figma ファイル）

### Step 5: 実装へ進む場合

本テンプレートの主対象は外部設計までです。設計後に同一リポジトリで開発を続ける場合は、`docs/internal/workflow/design-interview.md` の Step 2・3（タスク分解・ディレクトリ構成合意）を行ったうえで実装へ進みます。

以下が満たされている場合、開発を開始できます。

- 要件定義書（`docs/deliverables/requirements-definition/requirements-definition.md`）が作成・承認されている
- product.md / scope.md が定義されている
- features が定義されている
- 基本設計書（`docs/deliverables/functional-design/`）が作成・承認されている（該当する場合）
- tasks が作成されている
- `.claude/skills/code-security-review/references/security-gate.yml` の「PJ で追加」箇所（ソースコード配置・ロックファイル・ORM ディレクトリ等）をプロジェクトに合わせて編集している（push 時 AI レビューの対象判定に使われる）

確認は `docs/internal/workflow/project-readiness-checklist.md` で行います。

---

## AI開発フロー

```text
テンプレートコピー + プラグイン導入
↓
AIへ指示「START_PROMPT.md の内容でプロジェクトを開始してください」
↓
要件定義書の作成（A: AI要件ヒアリング / B: 要求仕様読み込み）
↓
技術条件の確認（design-interview.md の Step 1）
↓
基本設計書の生成（/requirements-to-functional-design。UIが必要なら /design-ui）
↓ ここまでが本テンプレートの主対象
タスク分解・ディレクトリ構成合意（design-interview.md の Step 2・3）
↓
Claude Code 実装（フェーズ承認付き）
↓
AIレビュー
```

AIは以下のドキュメントを生成・更新します。

- docs/deliverables/requirements-definition/
- docs/internal/product/
- docs/deliverables/features/
- docs/internal/tasks/
- docs/deliverables/functional-design/（基本設計書）
- docs/internal/design/・docs/deliverables/test-scenarios/・docs/deliverables/test-evidence/（各スキルの実行時）

---

## スキル

### 同梱スキル: ワークフロースキル（3件）

フェーズワークフローに密結合なスキルを同梱しています。

| コマンド                   | 説明                                                           |
| -------------------------- | -------------------------------------------------------------- |
| `/requirements-definition` | 要求仕様・議事録から要件定義書を作成                           |
| `/plan-to-issues`          | 要件定義書・設計書から作業計画を立てて GitHub Issue を一括起票 |
| `/github-issue`            | GitHub issue の作成・更新・検索（テンプレ・ラベル体系に準拠）  |

コミット・レビュー・テスト実行などの汎用操作は、Claude Code の標準機能をそのまま使います。

### 同梱スキル: 汎用スキル（6件・一時的に直接管理）

汎用スキルの単一の真実源は [000-agent-plugins](https://github.com/meisterguild/000-agent-plugins) ですが、本テンプレートのフローで利用頻度の高い以下の6件は、導入の手間を減らすため**一時的にこのリポジトリでも直接管理**しています（code-security-review / code-quality-review の由来は 000-ai-template-dev-workflow）。

| コマンド                              | 説明                                                                 |
| ------------------------------------- | -------------------------------------------------------------------- |
| `/design-ui`                          | 要件からFigmaでUIデザイン制作                                        |
| `/requirements-to-functional-design`  | 要件定義書から基本設計書を生成                                       |
| `/test-scenario-writer`               | 仕様書からE2Eテストシナリオ作成                                      |
| `/test-scenario-runner`               | シナリオに沿った動作確認・証跡取得                                   |
| `/code-security-review`               | セキュリティ観点の AI コードレビュー（push ゲートの観点定義と兼用）  |
| `/code-quality-review`                | コード品質観点の AI コードレビュー（push ゲートの観点定義と兼用）    |

> ※ 000-agent-plugins との二重管理は暫定措置です。将来はプラグイン導入へ一本化し、本リポジトリ側の複製は削除する予定です。
> ※ なお、本テンプレートではスキルの既定出力先を `docs/deliverables/`・`docs/internal/` 配下に変更しており、上流（000-agent-plugins）の既定パスとは差分があります。

### プラグインで導入するスキル

上記以外の汎用スキルは 000-agent-plugins から導入します。

```text
/plugin marketplace add meisterguild/000-agent-plugins
/plugin install <skill-name>@mg-agent-plugins
```

収録スキルの一覧は 000-agent-plugins の README を参照してください。

---

## ファイル構成

以下は**このリポジトリでの位置**（`template/` 付き）です。コピー後のプロジェクトでは `template/` が外れ、`template/` の中身がそのままプロジェクトルート直下に並びます（例: `template/docs/` → `your-project/docs/`）。

```text
000-ai-template/
├── README.md                        # このファイル（使い方ガイド。メタ層・コピーしない）
├── CLAUDE.md                        # このリポジトリ自体を開発する AI への指示書（メタ層・コピーしない）
├── .gitignore                       # このリポジトリ自身の git 管理設定（メタ層・コピーしない）
├── .claude/                         # メタ層（コピーしない）
│   ├── settings.json                # このリポジトリでの Claude Code 設定（push ゲートの配線）
│   └── hooks/
│       └── push-review-gate.sh      # template/ 側の実体へ委譲するフォワーダ
├── tests/                           # メタ層（コピーしない）
│   └── test_review_runner_diff_range.py # review-runner.py の diff_range() の回帰テスト
└── template/                        # ← ここから下がプロジェクトへコピーする本体
    ├── CLAUDE.md                    # Claude Code への指示書。ルール・規約・禁止事項を定義（最重要）
    ├── START_PROMPT.md              # プロジェクト開始時にAIへ渡す開始プロンプト（入口）
    ├── .gitignore                   # プロジェクトの git 管理設定
    ├── .playwright/                 # Playwright CLI の設定（E2E 動作確認で使用）
    ├── docs/                        # AIが参照・生成するドキュメント群
    │   ├── index.md                 # ドキュメント目次
    │   ├── deliverables/            # そのまま外部（顧客等）に共有できる成果物
    │   │   ├── requirements-definition/ # 要件定義書（AIが生成）
    │   │   └── features/            # 機能仕様
    │   ├── quality/                 # 品質指標のレポート（/report-quality-metrics の出力先）
    │   └── internal/                # 内部専用（外部共有しない）
    │       ├── inputs/              # 要求仕様・顧客議事録の置き場（git管理対象外）
    │       ├── product/             # プロジェクト概要とMVPスコープ（product.md / scope.md）
    │       ├── tasks/               # 実装タスク（backlog.md）
    │       ├── workflow/            # AI開発フロー（要件ヒアリング・技術条件確認・実装移行の手順、readinessチェック）
    │       ├── quality/             # 品質規約の一例（conventions.md。実装移行時にプロジェクト用に確定）
    │       ├── e2e/                 # E2Eテストケース・フローの置き場
    │       └── architecture/        # プロジェクト標準ディレクトリ構成のガイド
    ├── templates/                   # ドキュメントテンプレート
    │   └── feature-template.md      # 機能仕様テンプレート（要件ヒアリング・要件定義の両方で使用）
    └── .claude/
        ├── agents/                  # 同梱エージェント（e2e-qa-tester）
        ├── hooks/                   # push 時 AI レビューゲートの実体（push-review-gate.sh / review-runner.py）
        ├── settings.json            # Claude Code 設定（push ゲートの配線）
        ├── review-config.yml        # AI レビューの動作設定（agent / 深度 / block レベル）
        └── skills/                  # 同梱スキル（ワークフロー用3件 + 汎用6件）
            ├── requirements-definition/
            │   └── references/      # 要件定義書テンプレート（スキルに同梱）
            ├── plan-to-issues/                    # 作業計画から GitHub Issue を一括起票
            ├── github-issue/                      # GitHub issue の作成・更新・検索
            ├── design-ui/                         # ここから汎用スキル6件
            ├── requirements-to-functional-design/ # （一時的に直接管理。真実源は 000-agent-plugins）
            ├── test-scenario-writer/
            ├── test-scenario-runner/
            ├── code-security-review/              # セキュリティ観点 AI レビュー（push ゲートの対象判定ルール references/security-gate.yml を同梱）
            ├── code-quality-review/               # コード品質観点 AI レビュー
            └── report-quality-metrics/            # 品質指標レポート生成用の補助スキル（通常フローでは直接呼ばない）
```

> ※ 本文中の `docs/...`・`.claude/...` といったパス表記は、いずれも**コピー後のプロジェクトルート起点**です（このリポジトリ内では `template/` を前置きした位置にあります）。
> ※ `tests/` はこのリポジトリ自身の保守用（メタ層）です。テンプレート層の hook のロジックを固定する回帰テストで、プロジェクトへはコピーされません（コピー先の `tests/` と衝突させないため）。実行は `python3 -m unittest discover -s tests`（標準ライブラリのみ・追加依存なし）。
> ※ `template/`（単数・ペイロードの根）と `template/templates/`（複数・ドキュメントテンプレート置き場）は別物です。
> ※ スキル実行時には上記に加え、`docs/deliverables/functional-design/`（基本設計書）、`docs/internal/design/`（UIデザイン）、`docs/deliverables/test-scenarios/`（テストシナリオ）、`docs/deliverables/test-evidence/`（動作確認の証跡）が生成されます。

---

## ドキュメント更新ルール

要件定義・設計の成果物（`docs/deliverables/requirements-definition/`・`docs/internal/product/` や `docs/deliverables/functional-design/` 等のスキル成果物）はAIが直接更新し、`docs/internal/workflow/`・`docs/internal/quality/` はAIが提案のみ行います。
詳細な権限区分は `docs/internal/workflow/document-update-policy.md` を参照してください。

---

## カスタマイズガイド

### フレームワーク固有ルールの追加

`CLAUDE.md` に `## [Framework] Rules` セクションを追加します。

### スキルの追加

プロジェクト固有のワークフローは、`.claude/skills/<skill-name>/SKILL.md` を追加すると `/<skill-name>` として使用できます。汎用的に使えるスキルに育った場合は、このリポジトリではなく 000-agent-plugins への収録を検討してください。

---

## このリポジトリで開発しているアプリ（スイカゲーム）

このリポジトリのルート直下（`template/` の外＝**メタ層**）では、テンプレート運用の検証を兼ねてスイカゲームを開発しています。**プロジェクトへはコピーされません**（コピー対象は `template/` 配下のみ）。

- 仕様・計画のドキュメント: `docs/`（`docs/internal/architecture/suika-game-structure.md` が実装の契約点）
- 技術スタック: Vite + TypeScript（`strict`）/ Matter.js / Vitest / Playwright

### セットアップ

```bash
# 依存のインストール（Node.js 22.12 以上。package.json の engines を参照）
npm install

# E2E を実行する場合のみ、初回にブラウザを取得する
npx playwright install --with-deps chromium
```

### npm scripts

| コマンド | 内容 |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev` | 開発サーバを起動（http://localhost:5173） |
| `npm run build` | 型チェック（`tsc --noEmit`）＋本番ビルド（`dist/` を生成） |
| `npm run preview` | ビルド成果物をローカルで配信 |
| `npm test` | 単体テスト（Vitest / `tests/unit/**/*.test.ts`） |
| `npm run test:watch` | 単体テストの watch 実行 |
| `npm run test:e2e` | E2E テスト（Playwright / `tests/e2e/**/*.spec.ts`。build 実行後に preview を自動起動） |
| `npm run lint` | ESLint（`template/` 配下は対象外） |
| `npm run format` | Prettier で整形（`template/` 配下・Markdown は対象外） |

単体テストの既定環境は `node` です。DOM が必要なテストだけ、ファイル先頭に `// @vitest-environment jsdom` を書いて切り替えます。

本番ビルドはソースマップを出力しません。デバッグ時のみ `VITE_SOURCEMAP=1 npm run build` で有効化できます。

### アプリのファイル構成（メタ層・コピーしない）

```text
000-ai-template/
├── index.html                  # エントリ HTML（canvas を配置）
├── package.json
├── tsconfig.json
├── vite.config.ts              # Vite + Vitest 設定
├── playwright.config.ts        # E2E 設定（webServer = build → preview）
├── eslint.config.js            # ESLint flat config
├── .prettierrc.json / .prettierignore
├── public/sounds/              # 効果音の置き場
├── src/
│   ├── main.ts                 # エントリポイント
│   ├── style.css
│   ├── game/                   # ルール・物理・描画・ゲームループ
│   ├── ui/                     # HUD・モーダル
│   ├── storage/                # localStorage の隠蔽
│   └── audio/                  # 効果音
└── tests/
    ├── unit/                   # Vitest
    ├── e2e/                    # Playwright
    └── test_review_runner_diff_range.py  # テンプレート層 hook の回帰テスト（別系統）
```

> ※ `tests/` は Python の hook 回帰テスト（メタ層の保守用）とアプリのテストが同居します。実行系は別で、Python 側は `python3 -m unittest discover -s tests`、アプリ側は `npm test` / `npm run test:e2e` です（Vitest / Playwright の対象は `tests/unit` / `tests/e2e` に限定してあります）。

---

## エコシステム内での立ち位置

このテンプレートは、社内のAI開発資材のうち、新規プロジェクトの立ち上げ（要件定義〜外部設計が主対象。設計後に開発を続ける場合のフェーズ承認付き実装フローも同梱）を担当します。

| リポジトリ                                                                                   | 役割                                                                         |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **000-ai-template（本リポジトリ）**                                                          | 新規プロジェクトの立ち上げテンプレート（要件定義〜設計のワークフローを同梱） |
| [000-agent-plugins](https://github.com/meisterguild/000-agent-plugins)                       | 汎用 Agent Skill のプラグイン配布所。スキルの単一の真実源                    |
| [000-ai-template-dev-workflow](https://github.com/meisterguild/000-ai-template-dev-workflow) | ループエンジニアリング用ボイラープレート（CI・pre-push AIレビュー）          |
| [mg-auto-pr-loop](https://github.com/meisterguild/mg-auto-pr-loop)                           | Issue → 実装 → PR を自動で回す daemon（dev-workflow の展開が前提）           |

- 本リポジトリが同梱するスキルは、フェーズワークフローに密結合な3件と、利用頻度の高い汎用スキル4件（「[スキル](#スキル)」参照）
- 汎用スキルの単一の真実源は 000-agent-plugins。うち利用頻度の高い4件は、導入の手間を減らすため一時的に本リポジトリでも直接管理している（二重管理は暫定措置。将来はプラグイン導入へ一本化予定）
- dev-workflow / mg-auto-pr-loop は、実装以降の自動ループ運用（Issue → 実装 → PR）向けに開発中。いずれも実験段階のため、実務プロジェクトへの導入は安定版の提供後を推奨する

---

## よくある質問

**Q. AIはどのドキュメントを更新しますか。**

A. docs/deliverables/requirements-definition・docs/internal/product・docs/deliverables/features・docs/internal/tasks と、docs/deliverables/functional-design/ などのスキル成果物を直接更新します。workflow / quality はAIが提案のみ行います（詳細は docs/internal/workflow/document-update-policy.md）。

**Q. docsは全部作らないといけませんか。**

A. 必須ではありません。AIは存在するドキュメントのみ参照します。まず product.md / scope.md / features / tasks の整備を推奨します。

**Q. チームメンバーが増えた場合はどうすればよいですか。**

A. このテンプレートはGit管理することで同じAI開発環境を再現できます。プラグイン導入（Step 2）は各メンバーの環境で実行してください。
