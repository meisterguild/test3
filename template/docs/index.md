# ドキュメント目次

このリポジトリのドキュメントは、`docs/` 配下で以下の2区分に分類されています。

- `deliverables/`: そのまま外部（顧客等）に共有できる成果物
- `internal/`: 内部専用（生資料・運用ガイド・規約・タスク管理など）で外部共有しない

---

## deliverables/ の一覧

| ディレクトリ | 内容 |
|-----------|------|
| [requirements-definition/](./deliverables/requirements-definition/) | 要件定義書（最終版）の格納先 |
| [features/](./deliverables/features/) | 機能仕様（[index.md](./deliverables/features/index.md)：機能一覧） |
| functional-design/ | 基本設計書（/requirements-to-functional-design スキルの生成先） |
| test-scenarios/ | E2Eテストシナリオ（/test-scenario-writer スキルの生成先） |
| test-evidence/ | 動作確認の証跡・レポート（/test-scenario-runner スキル・e2e-qa-tester エージェントの生成先） |

## internal/ の一覧

| ディレクトリ | 内容 |
|-----------|------|
| [inputs/](./internal/inputs/) | 要求仕様・議事録などの生資料置き場（git管理対象外） |
| [requirements-definition-draft/](./internal/requirements-definition-draft/) | 要件定義の中間ドキュメント（事前確認事項 pre_check.md・要件定義書ドラフト）の格納先 |
| [product/](./internal/product/) | プロジェクト定義（[product.md](./internal/product/product.md)：目的・対象ユーザー、[scope.md](./internal/product/scope.md)：MVPスコープ） |
| [tasks/](./internal/tasks/) | 実装タスク（[backlog.md](./internal/tasks/backlog.md)） |
| [workflow/](./internal/workflow/) | AI開発フローの運用ルール |
| [quality/](./internal/quality/) | 品質規約の一例（実装移行時にプロジェクト用に確定） |
| [architecture/](./internal/architecture/) | アーキテクチャ・ディレクトリ構成ガイド（[project-structure.md](./internal/architecture/project-structure.md)） |
| design/ | UIデザイン成果物（/design-ui スキルの生成先） |
| [e2e/](./internal/e2e/) | E2E テストケース（[testcases/](./internal/e2e/testcases/)：人が書く自然言語ケース）と操作フローリファレンス（[flows/](./internal/e2e/flows/)）。e2e-qa-tester エージェントの入力 |

---

## internal/workflow/ の内容

| ドキュメント | 内容 |
|-----------|------|
| [requirements-interview.md](./internal/workflow/requirements-interview.md) | 要件ヒアリングの進め方 |
| [design-interview.md](./internal/workflow/design-interview.md) | 技術条件の確認と実装移行の準備（外部設計本体は /requirements-to-functional-design スキルに委譲） |
| [project-readiness-checklist.md](./internal/workflow/project-readiness-checklist.md) | 実装フェーズに進めるかの確認チェックリスト |
| [document-update-policy.md](./internal/workflow/document-update-policy.md) | AIがどのドキュメントを更新できるかのポリシー |
| [multi-agent-development.md](./internal/workflow/multi-agent-development.md) | PM役・作業者役に分けた開発運用ルール |

## internal/quality/ の内容

| ドキュメント | 内容 |
|-----------|------|
| [conventions.md](./internal/quality/conventions.md) | 品質規約の一例（プロジェクトごとに選択が分かれる決定事項のみを集約） |

---

## ドキュメントの更新ルール

- 更新可否の区分（AI直接更新可 / 提案のみ / 人間のみ編集）は [internal/workflow/document-update-policy.md](./internal/workflow/document-update-policy.md) を参照する
- 機能追加・変更時はドキュメントも同時に更新する
- 実装と乖離したドキュメントは速やかに修正する
