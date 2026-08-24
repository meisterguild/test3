# Document Update Policy

このドキュメントは **AIがどのドキュメントを更新できるかを定義するポリシー**です。

AIはこのルールに従ってドキュメントを更新してください。

---

# Update Categories

ドキュメントは次の3種類に分類されます。

| Category      | Description      |
| ------------- | ---------------- |
| AI Editable   | AIが直接更新可能 |
| Proposal Only | AIは変更提案のみ |
| Human Only    | 人間のみ編集     |

なお、`docs/deliverables/`（外部提供可の成果物）と `docs/internal/`（内部専用）の区分は**外部共有可否の軸**であり、AIの更新権限とは直交する。更新権限は従来どおりディレクトリ単位で定める（例：`docs/internal/tasks/` はAI直接更新可、`docs/internal/workflow/` は提案のみ）。

---

# AI Editable Documents

AIが **直接更新してよいドキュメント**

```text
docs/deliverables/requirements-definition/*
docs/internal/requirements-definition-draft/*
docs/internal/product/*
docs/deliverables/features/*
docs/internal/tasks/*
```

対象例

```text
docs/deliverables/requirements-definition/requirements-definition.md
docs/internal/requirements-definition-draft/pre_check.md
docs/internal/requirements-definition-draft/requirements-definition-draft.md
docs/internal/product/product.md
docs/internal/product/scope.md
docs/deliverables/features/*
docs/internal/tasks/backlog.md
```

AIは以下を行ってよい。

- 内容追加
- 更新
- 新しいfeature作成
- 新しいtask作成

## スキル成果物ディレクトリ

同梱スキルの成果物ディレクトリも **AIが直接更新可能**（生成先はスキル仕様に従う）。

```text
docs/deliverables/functional-design/   # /requirements-to-functional-design
docs/internal/design/                  # /design-ui
docs/deliverables/test-scenarios/      # /test-scenario-writer
docs/deliverables/test-evidence/       # /test-scenario-runner
```

---

# Proposal Only Documents

AIは **変更案のみ提示する**

```text
docs/internal/workflow/*
docs/internal/quality/*
docs/internal/architecture/*
```

AIは以下を行う。

```text
変更案を提示
↓
ユーザー承認
↓
更新
```

AIは **承認なしに変更してはいけない。**

---

# Human Only Documents

AIは **編集してはいけない**

```text
CLAUDE.md
README.md
START_PROMPT.md
```

AIはこれらの変更を提案することはできるが、
直接編集してはいけない。

---

# Document Creation Rules

AIが新しいドキュメントを作る場合は
以下のディレクトリのみ使用する。

```text
docs/deliverables/requirements-definition/
docs/internal/requirements-definition-draft/
docs/internal/product/
docs/deliverables/features/
docs/internal/tasks/
```

スキル実行時は、上記に加えてスキル成果物ディレクトリ
（`docs/deliverables/functional-design/`・`docs/internal/design/`・`docs/deliverables/test-scenarios/`・`docs/deliverables/test-evidence/`）を使用してよい。

それ以外の場所に新規ドキュメントを作成してはいけない。

---

# Document Update Order

AIは以下の順序でドキュメントを作成する。

```text
1. product.md
2. scope.md
3. features
4. tasks
```

順序を守ること。

---

# File Structure Protection

AIは **ディレクトリ構造を変更してはいけない。**

以下は禁止。

```text
新しいトップレベルフォルダ作成
docs構造変更
workflow変更
```

---

# Implementation Lock

以下の条件を満たすまで **実装を開始してはいけない。**

```text
product.md 完成
scope.md 完成
features 定義
tasks 作成
```

完了後

```text
docs/internal/workflow/project-readiness-checklist.md
```

を確認する。

---

# Conflict Resolution

仕様が曖昧な場合

```text
推測で実装しない
ユーザーへ質問する
```

---

# Summary

AIの役割

```text
要件定義（要件ヒアリング または 要求仕様読み込み）
↓
要件定義書・product / scope / feature作成
↓
基本設計書作成（/requirements-to-functional-design スキル）
↓
task作成（実装へ進む場合）
↓
実装
```

この順序を必ず守ること。
