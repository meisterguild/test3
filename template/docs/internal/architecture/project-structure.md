# Project Structure Guide

このドキュメントは **プロジェクトの標準ディレクトリ構成を定義するガイド**です。

AIおよび開発者は、このガイドに従ってディレクトリを作成してください。

目的

- ファイル配置の一貫性を保つ
- 不要なディレクトリ増殖を防ぐ
- 将来の拡張に対応する

---

# Important Rule

AIは以下を守ること。

- 新しいディレクトリを勝手に作らない
- 既存構造に従う
- 変更が必要な場合はユーザーに提案する
- 承認なしに構造変更しない

---

# Project Structure Decision

プロジェクト開始時に **以下の構造のいずれかを採用する。**

AIは `design-interview.md` の **Step 3: Directory Structure Alignment** で提案すること。

---

# Pattern 1: Minimal Structure

小規模プロジェクト向け。

例

- スクリプト
- 小さなツール
- 学習プロジェクト
- 単一ファイルアプリ

```
project/
  src/
  docs/
    deliverables/   # 外部提供可の成果物
    internal/       # 内部専用
  README.md
```

説明

| ディレクトリ | 用途         |
| ------------ | ------------ |
| src          | ソースコード |
| docs         | ドキュメント |

---

# Pattern 2: Standard Application

一般的なアプリケーション。

例

- Webアプリ
- CLIツール
- APIサーバー
- デスクトップアプリ

```
project/
  src/
  tests/
  docs/
    deliverables/   # 外部提供可の成果物
    internal/       # 内部専用
  scripts/
  configs/
  assets/
  README.md
```

説明

| ディレクトリ | 用途                   |
| ------------ | ---------------------- |
| src          | アプリケーションコード |
| tests        | テストコード           |
| docs         | 設計・仕様             |
| scripts      | 開発用スクリプト       |
| configs      | 設定ファイル           |
| assets       | 静的ファイル           |

---

# Pattern 3: Large Application

中〜大規模プロジェクト向け。

例

- SaaS
- 大規模Webアプリ
- マイクロサービス
- ゲーム

```
project/
  src/
    core/
    modules/
    services/
  tests/
  docs/
    deliverables/   # 外部提供可の成果物
    internal/       # 内部専用
  infrastructure/
  tools/
  assets/
  configs/
  README.md
```

説明

| ディレクトリ   | 用途           |
| -------------- | -------------- |
| core           | 共通ロジック   |
| modules        | 機能単位コード |
| services       | サービス層     |
| infrastructure | インフラ設定   |
| tools          | 開発ツール     |
| configs        | 環境設定       |

---

# Source Directory Guidelines

`src/` の中の構成は **プロジェクトの種類に応じて決める。**

例

アプリケーション

```
src/
  app/
  domain/
  infrastructure/
```

CLIツール

```
src/
  commands/
  services/
```

ライブラリ

```
src/
  library/
```

---

# Test Structure

テストコードは **tests/** に配置する。

```
tests/
  unit/
  integration/
```

---

# Asset Structure

画像・音声などのリソース。

```
assets/
  images/
  sounds/
  data/
```

---

# Documentation Structure

ドキュメントは **docs/** に配置する。

```
docs/
  deliverables/   # 外部提供可の成果物（requirements-definition, functional-design など）
  internal/       # 内部専用（product, workflow, architecture, tasks など）
```

---

# When Structure Must Change

構造変更が必要な場合。

AIは以下を行う。

1. 変更理由を説明
2. 新構造を提示
3. ユーザー承認を得る

承認なしに構造変更は禁止。

---

# AI Directory Behavior

AIは以下を守る。

禁止

- rootにランダムファイル作成
- 不要なディレクトリ追加
- 同じ役割のフォルダ重複

例

NG

```
src/
source/
lib/
```

---

# Structure Approval

プロジェクト開始前に以下を確認する。

```
[ ] 構造パターンが決定している
[ ] src構造が決定している
[ ] docs構造が決定している
[ ] assetsの有無が決定している
```

承認後のみ **実装を開始する。**
