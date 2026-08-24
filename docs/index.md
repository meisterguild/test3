# ドキュメント目次（スイカゲームプロジェクト）

このディレクトリは、本リポジトリで開発する **ブラウザで遊べるスイカゲーム** のプロジェクトドキュメントです。
`template/docs/` はプロジェクトへコピーされるテンプレート本体（ペイロード）であり、本ディレクトリとは別物です。

- `deliverables/`: そのまま外部に共有できる成果物
- `internal/`: 内部専用（生資料・設計メモ・タスク管理）

## internal/ の一覧

| ドキュメント | 内容 |
| --- | --- |
| [product/product.md](./internal/product/product.md) | プロダクト概要・ターゲット・MVP / 非 MVP |
| [product/scope.md](./internal/product/scope.md) | MVP スコープ・除外項目・将来検討 |
| [requirements-definition-draft/suika-game.md](./internal/requirements-definition-draft/suika-game.md) | 要件定義ドラフト（**要件 ID の真理ソース**: FR / UI / DT / NFR / AC / R） |
| [architecture/suika-game-structure.md](./internal/architecture/suika-game-structure.md) | 実装の契約点（技術スタック・ディレクトリ・共有型・定数・イベント契約） |
| [tasks/issue-plan.md](./internal/tasks/issue-plan.md) | 作業計画（タスク分解・依存グラフ・カバレッジ表・起票結果） |
| [tasks/backlog.md](./internal/tasks/backlog.md) | タスク台帳（issue 番号と状態） |

## 未作成（実装 issue で作られる）

| パス | 作成する issue |
| --- | --- |
| `docs/specs/game-core-rules.md` | [#3](https://github.com/meisterguild/test3/issues/3) ゲームコアルールの仕様策定 |
| `docs/deliverables/test-scenarios/` | [#12](https://github.com/meisterguild/test3/issues/12) E2E テストシナリオの整備 |

## 読む順番

1. [product/product.md](./internal/product/product.md) — 何を作るのか
2. [requirements-definition-draft/suika-game.md](./internal/requirements-definition-draft/suika-game.md) — 要件 ID
3. [architecture/suika-game-structure.md](./internal/architecture/suika-game-structure.md) — 実装時に守る契約
4. [tasks/issue-plan.md](./internal/tasks/issue-plan.md) — どの issue が何を担当するか
