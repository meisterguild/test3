# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業する際の指示書です。

---

## 絶対規約: 応答言語

**すべての応答を必ず日本語で行うこと。**

- テキスト応答・エラー・確認メッセージはすべて日本語
- コード・コマンド・ファイルパス・URLは英語のまま
- 技術用語には初出時に日本語訳を併記する

---

## 本テンプレートの対象範囲

本テンプレートの主対象は **要件定義〜外部設計（Phase 1〜2）**。
Phase 3 以降（実装・テスト・レビュー/コミット）の規約は、設計後に同一リポジトリで開発を続ける場合の補助として保持している。

---

## Phase 1: 要件定義

プロジェクト開始時は、「要件ヒアリング」または「要求仕様読み込み」から開始すること。
プロンプトによる指定がない場合は、「要件ヒアリング」と「要求仕様読み込み」のどちらで行うかを確認すること。

### 要件ヒアリング（AI Requirements Interview）

参照ドキュメント：`docs/internal/workflow/requirements-interview.md`

ヒアリング結果は要件定義書（`docs/deliverables/requirements-definition/requirements-definition.md`）としてまとめる（同ガイドの Step 4）。

### 要求仕様読み込み

参照ドキュメント：`.claude/skills/requirements-definition/SKILL.md`

要件定義書の作成後は、ドキュメントのレベルを合わせるため、要件定義書の内容で `docs/internal/product/product.md` と `docs/internal/product/scope.md` を更新する。

### 完了条件（両方式共通）

どちらの方式でも、要件定義書の最終版（`docs/deliverables/requirements-definition/requirements-definition.md`）が完成・承認されるまで、設計を開始してはいけない。

### 画面遷移図ドラフト（画面を持つプロダクトの場合）

要件定義書の完成後、`.claude/skills/requirements-definition/references/screen-flow-template.md` に従い、画面遷移図ドラフトを `docs/internal/requirements-definition-draft/screen-flow.md` に生成する。Phase 2 の UI デザイン工程 `/design-ui` のたたき台とする。画面を持たないプロダクト（バッチ・API 等）では省略してよい。

---

## Phase 2: 外部設計

要件定義の完了後、以下の順序で外部設計を行うこと。

### 前段: 技術条件の確認

参照ドキュメント：`docs/internal/workflow/design-interview.md`（Step 1）

基本設計書の作成前に、技術スタック・制約などの技術条件を確認して確定する。

### 本体: 基本設計書の作成

基本設計書の作成は `/requirements-to-functional-design` スキルに委譲する。
手順・承認ポイント・レビューはスキル側の規定に従うこと。本ファイル側で設計書の作成手順を追加で課さない。
成果物は `docs/deliverables/functional-design/` に生成される。

### 任意: UIデザイン

UIデザインが必要な場合は `/design-ui` スキルを使う。成果物は `docs/internal/design/` と Figma ファイル。

### 実装移行時（Phase 3 開始前）

実装へ進む場合は、`docs/internal/workflow/design-interview.md` の Step 2・3（タスク分解・ディレクトリ構成合意）を行うこと。
ディレクトリ構成が承認されるまで、実装ファイルの作成を開始してはいけない（詳細は design-interview.md に集約）。

---

## ドキュメント更新ルール

| 対象 | AIの権限 |
| ------------------------------------------------------------------------------------------------ | ------------ |
| `docs/deliverables/requirements-definition/`・`docs/internal/requirements-definition-draft/`・`docs/internal/product/`・`docs/deliverables/features/`・`docs/internal/tasks/` | 直接更新する |
| `docs/deliverables/functional-design/`・`docs/internal/design/`・`docs/deliverables/test-scenarios/`・`docs/deliverables/test-evidence/`（スキル成果物） | 直接更新する |
| `docs/internal/workflow/`・`docs/internal/quality/` | 提案のみ行う |

詳細な権限区分は `docs/internal/workflow/document-update-policy.md` を参照すること。

---

## 品質・セキュリティ規約

実装・レビュー時は `docs/internal/quality/conventions.md` に従うこと。
このファイルは規約の一例（サンプル）であり、実装移行時にプロジェクトに合わせて編集・確定する。

### push 時 AI レビューゲート

`git push` 実行時、PreToolUse hook が `.claude/hooks/review-runner.py` によるセキュリティ / コード品質の AI レビューを実行する。high 所見がある場合 push はブロックされるため、`.claude/last-review.md` の所見を修正してから再 push すること。

- レビュー対象の判定ルールは `.claude/skills/code-security-review/references/security-gate.yml`。**実装移行時に「PJ で追加」箇所（ソース配置・ロックファイル・ORM 等）を必ず編集する。**
- agent / モデル / 深度 / block レベルは `.claude/review-config.yml`（または環境変数 `REVIEW_*`）で調整。既定 agent は claude。
- 緊急 bypass は `git push --no-verify` のみ（ターミナルからの手動 push はゲート対象外）。

---

## AI行動指針

### フェーズごとの承認ルール

作業は以下のフェーズに分けて進め、承認なしに次のフェーズに進むことは禁止。

**必ず各フェーズ完了後にユーザーの承認を得てから次のフェーズに進むこと。**

```text
Phase 1: 要件定義
  - 目的・背景・対象ユーザーを整理して提示する
  - 不明点はすべて質問してから整理する
  ↓ ユーザーの承認を得る
Phase 2: 外部設計
  - 技術条件を確認し、基本設計書を /requirements-to-functional-design スキルで作成する
  - 設計判断のトレードオフ提示・承認・レビューはスキル内の規定に従う
  ↓ ユーザーの承認を得る
Phase 3: 実装
  - タスク分解・ディレクトリ構成の承認を得てから着手する
  - 設計通りに実装する
  - 設計との差分が生じた場合は即座にユーザーに報告して承認を得る
  ↓ ユーザーの確認を得る
Phase 4: テスト
  - テストコードを作成・実行して結果を報告する
  ↓ ユーザーの確認を得る
Phase 5: レビュー・コミット
  - コードレビューを実行して結果を報告する
  - 問題がなければコミットする
  ↓ ユーザーの最終承認を得る
```

---

### 禁止操作（ユーザーの明示的な指示がない限り実行禁止）

- 本番環境のDB操作（DROP / TRUNCATE / UPDATE 全件等）
- git push --force（mainブランチへの強制プッシュ）
- .env ファイルの上書き
- 既存マイグレーションファイルの編集
- 依存パッケージの削除
- テストをスキップする（skip / --no-coverage 等）

---

### 不明点・リスクがある場合

以下を必ず守る。

- 推測で実装しない
- 確信が持てない場合は必ず質問してから進める
- 破壊的な変更をする前は必ず確認を取る
- **仕様にない内容を勝手に補完しない**（不足・曖昧点・必要な確認事項は、勝手に決めず**質問として抽出**する）
- **AI が決めてはいけない判断**（顧客運用・業務ルール・表示要否・文言の厳密さ 等）は、勝手に補完せず **Human/PM 確認事項として分離**して出す

---

### 確認・レビューの終了条件（有限 QA）

質問・レビューは、**その工程で次工程に進めない Critical を 0 件にする**ことを完了条件とする。
これは全工程のすべての Critical をなくす意味ではなく、工程単位で進行可否を判断するための基準であり、すべての指摘をゼロにする必要はない。

- **Critical**（決まらない／直さないと次工程に進めない）が残る間は、確認・修正を続ける。
- Critical が 0 件になったら、**観点を変えて最大 2 回**だけ再走査して終了する（同じ読み直しの反復ではなく、違う角度で見落としを拾う）。
- Warning / Review / Assumption / Deferred は残ってよい。ただし**影響・対応方針・判断先・仮前提・見送り理由を明記**する。

---

### コードレビューの提案

実装が完了したらコードをレビューし、コード品質・セキュリティ・パフォーマンスの3点を確認する。
セキュリティリスクがある箇所は⚠️マークで明示し、パフォーマンス懸念がある箇所は💡マークで提案する。

---

## プロジェクト概要（テンプレート）

```text
プロジェクト名:
[プロジェクト名を記載]

概要:
[システムの概要を1〜3行で記載]

技術スタック:
- Language: [言語 + バージョン]
- Framework: [フレームワーク + バージョン]
- DB: [DB種別 + バージョン]
- Infrastructure: [Docker / クラウド等]
- Other: [外部サービス・ライブラリ等]
```

---

## スキル（カスタムコマンド）

本テンプレートが同梱するスキルは、プロジェクト立ち上げ（要件定義〜外部設計）のワークフローに密結合な3件と、利用頻度の高い汎用スキル4件。

### ワークフロースキル（3件）

| コマンド                 | 説明                                                            |
| ------------------------ | --------------------------------------------------------------- |
| /requirements-definition | 要求仕様・議事録から要件定義書を作成                            |
| /plan-to-issues          | 要件定義書・設計書から作業計画を立てて GitHub Issue を一括起票  |
| /github-issue            | GitHub issue の作成・更新・検索（テンプレ・ラベル体系に準拠）   |

### 汎用スキル（6件・一時的に直接管理）

| コマンド                           | 説明                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| /design-ui                         | 要件からFigmaでUIデザイン制作                                        |
| /requirements-to-functional-design | 要件定義書から基本設計書を生成                                       |
| /test-scenario-writer              | 仕様書からE2Eテストシナリオ作成                                      |
| /test-scenario-runner              | シナリオに沿った動作確認・証跡取得                                   |
| /code-security-review              | セキュリティ観点の AI コードレビュー（push ゲートの観点定義と兼用）  |
| /code-quality-review               | コード品質観点の AI コードレビュー（push ゲートの観点定義と兼用）    |

### エージェント（1件）

| エージェント  | 説明                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| e2e-qa-tester | ローカルの自然言語テストケース（`docs/internal/e2e/testcases/`）を Playwright CLI で自動実行し証跡を残す QA エージェント |

テストケースの書き方は `docs/internal/e2e/testcases/README.md`、エージェント本体は `.claude/agents/e2e-qa-tester.md` を参照。

コミット・レビュー・テスト実行などの汎用操作は、Claude Code の標準機能をそのまま使う。

汎用スキルの単一の真実源は [000-agent-plugins](https://github.com/meisterguild/000-agent-plugins)。
上記6件は導入の手間を減らすため、一時的に本リポジトリでも直接管理している
（code-security-review / code-quality-review の由来は 000-ai-template-dev-workflow）。
その他の汎用スキルはプラグインとして導入する（導入手順は README.md を参照）。

---

## 関連リポジトリ

| リポジトリ                                                                                   | 役割                                                                                   |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [000-agent-plugins](https://github.com/meisterguild/000-agent-plugins)                       | 汎用 Agent Skill のプラグイン配布所（スキルの単一の真実源）                            |
| [000-ai-template-dev-workflow](https://github.com/meisterguild/000-ai-template-dev-workflow) | ループエンジニアリング用ボイラープレート（CI・pre-push AI レビュー）。開発中・実験段階 |
| [mg-auto-pr-loop](https://github.com/meisterguild/mg-auto-pr-loop)                           | Issue → 実装 → PR を自動で回す daemon（開発中の dev-workflow の展開が前提）            |

dev-workflow / mg-auto-pr-loop は開発中のため、実務プロジェクトへの導入は前提としない（自動ループ運用は将来の選択肢）。
