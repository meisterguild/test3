# Requirements Interview Guide

このドキュメントは **AIが新しいプロジェクトの要件ヒアリングを行うためのガイド**です。

AIはこのガイドに従い、段階的に要件を整理してください。
回答をもとにプロジェクトの要件定義を行い、最終成果物として要件定義書（`docs/deliverables/requirements-definition/requirements-definition.md`）をまとめます。

**重要：要件定義書が完成・承認されるまで設計を開始してはいけません。**

---

# Interview Rules

AIは以下のルールを守ること。

- 一度に質問は **1〜3個まで**
- 推測で仕様を確定しない
- 回答をもとにドキュメント更新案を作る
- 承認前にファイルを書き換えない

---

# Interview Flow

ヒアリングは次の順序で進めます。

```
1. Project Overview
2. MVP Scope
3. Feature Definition
4. Requirements Definition Document
5. Screen Flow Draft
```

---

# Step 1: Project Overview

目的: プロジェクトの基本情報を理解する。

更新対象:

```
docs/internal/product/product.md
```

質問例:

- このプロジェクトの目的は何ですか？
- 誰が使うアプリですか？
- どのような問題を解決しますか？
- 利用環境は何ですか？（ブラウザ / モバイル / 社内ツールなど）

---

# Step 2: MVP Scope

目的: MVPで実装する範囲を決める。

更新対象:

```
docs/internal/product/scope.md
```

質問例:

- MVPとして必須の機能は何ですか？
- 今回作らない機能はありますか？
- 将来的に追加したい機能はありますか？
- 制約条件はありますか？

---

# Step 3: Feature Definition

目的: アプリの機能を整理する。

更新対象:

```
docs/deliverables/features/
```

AIは以下を生成します。

```
feature ドキュメント
templates/feature-template.md を元にした機能仕様
```

---

# Step 4: Requirements Definition Document

目的: ヒアリング結果を要件定義書としてまとめる。

更新対象:

```
docs/deliverables/requirements-definition/requirements-definition.md
```

AIは以下を行うこと。

- Step 1〜3 の整理結果（product / scope / features）をもとに、要件定義書のドラフトを作成する
- 章立て・表形式・ID付与ルールは `.claude/skills/requirements-definition/references/requirements-definition-template.md` に従う（「要求仕様読み込み」方式と同一フォーマットにするため）
- ドラフトをユーザーに提示し、承認を得てから最終版ルールを適用して `requirements-definition.md` を確定する

---

# Step 5: Screen Flow Draft（画面を持つプロダクトの場合）

目的: 要件定義書をもとに、画面遷移図のドラフトを作成する。

更新対象:

```
docs/internal/requirements-definition-draft/screen-flow.md
```

AIは以下を行う。

- `.claude/skills/requirements-definition/references/screen-flow-template.md` の構成に従い、画面要件（UI-xxx）・業務フロー・機能仕様から画面遷移図（Mermaid）と遷移一覧のドラフトを作成する
- Phase 1 ではドラフト扱いとし、確定は Phase 2 の UI デザイン工程（`/design-ui`）で行う
- 画面を持たないプロダクト（バッチ・API 等）では省略してよい

---

# Interview Completion Criteria

以下を満たしたらヒアリング完了。

- product.md が定義されている
- scope.md が定義されている
- `docs/deliverables/features/` に主要機能が定義されている
- 要件定義書（`docs/deliverables/requirements-definition/requirements-definition.md`）が作成され、ユーザーの承認を得ている
- （画面を持つプロダクトの場合）画面遷移図ドラフト（`docs/internal/requirements-definition-draft/screen-flow.md`）が作成されている

---

# After Completion

ヒアリング完了後は、次の順序で外部設計へ進みます。

```
docs/internal/workflow/design-interview.md（Step 1: Technical Conditions）
↓
/requirements-to-functional-design スキルで基本設計書を作成
```

