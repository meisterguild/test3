# Design Interview Guide

このドキュメントは **AIが要件定義と外部設計の橋渡し、および実装移行の準備を行うためのガイド**です。

AIはこのガイドに従い、設計開始前の技術条件確認と、実装へ進む場合の準備を段階的に行ってください。

基本設計書そのものの作成手順は本文書では規定しません（後述の「外部設計本体（スキルへ委譲）」を参照）。

**重要：実装移行の準備が完了するまで実装を開始してはいけません。**

---

# Interview Rules

AIは以下のルールを守ること。

- 一度に質問は **1〜3個まで**
- 推測で仕様を確定しない
- 回答をもとにドキュメント更新案を作る
- 承認前にファイルを書き換えない
- readiness を満たすまで実装を開始しない

---

# Flow

本文書の流れは次のとおりです。

```
Step 1. Technical Conditions（設計開始前）
  ↓
外部設計本体 → /requirements-to-functional-design スキルへ委譲
  ↓
Step 2. Task Breakdown（実装へ進む場合）
Step 3. Directory Structure Alignment（実装へ進む場合）
```

---

# Step 1: Technical Conditions（設計開始前）

目的: 技術条件を確認する。

更新対象:

```
docs/internal/product/product.md
```

質問例:

- 使用技術は何ですか？
- フレームワークは使いますか？
- データ保存は必要ですか？
- 外部APIはありますか？

---

# 外部設計本体（スキルへ委譲）

基本設計書の作成は `/requirements-to-functional-design` スキルで行います。

参照ドキュメント：`.claude/skills/requirements-to-functional-design/SKILL.md`

- 手順・承認ポイント・レビューは **スキル側の規定に従う**。本文書では規定しない
- 成果物は `docs/deliverables/functional-design/` に生成される（スキル仕様）
- UIデザインが必要な場合は `/design-ui` スキルを使う（成果物は `docs/internal/design/`）

---

# Step 2: Task Breakdown（実装へ進む場合）

目的: 実装タスクを整理する。

**このステップは実装移行時に行う。** 外部設計まででプロジェクトを終える場合は不要。

更新対象:

```
docs/internal/tasks/backlog.md
```

AIは以下を行います。

- feature を task に分解
- 実装順序を提案
- MVP完成条件を整理

---

# Step 3: Directory Structure Alignment（実装へ進む場合）

目的: **実装前にディレクトリ構成を合意する。**

AIは以下を行うこと。

- 想定ディレクトリ構成を提示する
- 各ディレクトリの役割を説明する
- プロジェクト規模に対して適切か説明する

構成パターン（規模別・言語非依存）は `docs/internal/architecture/project-structure.md` を参照し、プロジェクトの技術スタックに合わせた具体案を提示すること。

**ユーザーの承認があるまで実装ファイルの作成は禁止。**
（基本設計書などの設計ドキュメントは対象外。それらの生成はスキル側の承認フロー内で行われる。）

---

# Completion Criteria

完了条件は2段階に分かれます。

## 設計フェーズ完了

- 技術条件が確定している（Step 1）
- 基本設計書が作成されている（作成中の承認・レビューは `/requirements-to-functional-design` スキルの規定に従う）
- 完成した基本設計書一式に対して、ユーザーの承認を得ている（CLAUDE.md の Phase 2 完了承認）

## 実装移行可

- backlog.md が定義されている（Step 2）
- ディレクトリ構成が承認されている（Step 3）
- 以下を確認済みである

```
docs/internal/workflow/project-readiness-checklist.md
```
