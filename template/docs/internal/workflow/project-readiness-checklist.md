# Project Readiness Checklist

このドキュメントは **プロジェクトが実装フェーズに進める状態か確認するためのチェックリスト**です。

AIは以下を確認し、すべて満たされるまで **実装を開始してはいけません。**

---

# Requirements Definition

要件定義が完了していること。

- [ ] 要件定義書（`docs/deliverables/requirements-definition/requirements-definition.md`）が作成・承認されている

---

# Product Definition

プロジェクトの基本情報が整理されていること。

- [ ] `docs/internal/product/product.md` が定義されている
- [ ] プロジェクト目的が明確
- [ ] 想定ユーザーが定義されている
- [ ] 利用環境が定義されている

---

# Scope Definition

MVPの範囲が定義されていること。

- [ ] `docs/internal/product/scope.md` が作成されている
- [ ] MVP機能が定義されている
- [ ] MVPに含まれない機能が整理されている
- [ ] 制約条件が明確

---

# Feature Definition

主要機能が整理されていること。

- [ ] `docs/deliverables/features/` に主要機能が定義されている
- [ ] 各機能の目的が明確
- [ ] ユーザー操作が定義されている
- [ ] 例外ケースが整理されている

---

# Task Definition

実装タスクが作成されていること。

- [ ] `docs/internal/tasks/backlog.md` が作成されている
- [ ] 主要機能がタスクに分解されている
- [ ] MVP完成までのタスクが定義されている

---

# Technical Conditions

技術条件が整理されていること。

- [ ] 使用言語が決まっている
- [ ] フレームワークが決まっている（必要な場合）
- [ ] データ保存の有無が決まっている
- [ ] 外部サービスの有無が決まっている

---

# Functional Design

基本設計が整理されていること。

- [ ] 基本設計書（`docs/deliverables/functional-design/`）が作成・承認されている（基本設計を行った場合）

---

# Directory Structure

ディレクトリ構成が決定していること。

- [ ] AIがディレクトリ構成案を提示している
- [ ] ディレクトリ構成がユーザーに承認されている
- [ ] ファイル配置ルールが決まっている
- [ ] プロジェクト規模に適した構成になっている
- [ ] 将来の拡張を考慮した構造になっている

---

# Implementation Approval

実装開始の最終確認。

- [ ] ユーザーが実装開始を承認した

---

# Ready for Implementation

すべてのチェックが完了した場合のみ、AIは次のフェーズへ進むことができます。

```text
Implementation Phase
```

AIは次の作業を開始します。

```
task実装
↓
テスト作成
↓
レビュー
```

---

# If Not Ready

未完了項目がある場合、AIは以下を行います。

- 不足している情報をユーザーへ質問する
- 必要なドキュメント作成を提案する
- 実装を開始しない
