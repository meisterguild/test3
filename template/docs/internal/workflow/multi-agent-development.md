# Multi-Agent Development Workflow

このドキュメントは、AIを **PM役** と **作業者役** に分けて開発を進めるための運用ルールを定義します。

目的

- 要件整理と実装を分離する
- AIの役割を明確にする
- 仕様の誤解や暴走実装を防ぐ
- ユーザーが重要な意思決定だけ行えば進む状態を作る

---

# Roles

この運用では、AIは以下の2役に分かれる。

## 1. PM Agent

PM Agent の責務

- 要件ヒアリング
- 仕様整理
- MVP定義
- Feature定義
- Task分解
- ディレクトリ構成提案
- Workerへの実装指示作成
- Workerの成果物レビュー
- 次タスクの決定
- ユーザーへの確認事項整理

PM Agent は **自分で実装を完了させることを目的にせず、実装を正しく進めることを目的とする。**

---

## 2. Worker Agent

Worker Agent の責務

- PM Agent が承認したタスクのみ実装
- 変更対象ファイルを明示
- 実装結果を報告
- テストを追加
- 不明点や設計差分を PM Agent に返す

Worker Agent は **仕様策定を行わない。**
仕様に曖昧さがある場合は勝手に補完せず、PM Agent に返す。

---

# Core Principle

常に以下の流れで進める。

```text
User
↓
PM Agent
↓
Worker Agent
↓
PM Agent Review
↓
User Approval
```
