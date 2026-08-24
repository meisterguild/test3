---
name: plan-to-issues
description: |
  要件定義書・基本設計書などの入力ドキュメントから「次の作業」を洗い出して作業計画（タスク分解）を作り、ユーザー承認のうえ GitHub Issue を一括起票する。issue 起票そのものの規約（type 体系・テンプレート・ラベル・dry-run/headless の挙動）は再定義せず github-issue スキルに完全準拠し、本スキルは複数 issue の計画・順序・依存関係・トレーサビリティのみを上乗せする。入力ドキュメントはプロンプトで指定する（要件定義書・基本設計書・その他の仕様資料など、汎用）。
  ユーザーが「要件定義から issue を一括で作って」「設計書から次の作業を切って issue 化して」「基本設計から作業を issue にまとめて」「作業計画を立てて issue を起票して」「次にやる作業を issue で一式作って」のように、ドキュメントから複数の作業 issue をまとめて作りたいときは必ずこのスキルを使うこと。
  単発の issue 起票・更新・検索だけのとき（github-issue を直接使う）、要件定義書や設計書そのものの作成・改訂のとき（requirements-definition / requirements-to-functional-design を使う）には使わない。
---

# 入力ドキュメントから作業計画を立てて GitHub Issue を一括起票する

要件定義書・基本設計書などの成果物を入力に、実装エージェント／チームが次に着手すべき作業を洗い出し、**作業計画（タスク分解）** に落とし、ユーザーの承認を得たうえで **GitHub Issue を一括起票** する。

読者（issue の受け手）は、これから実装に着手するチームやコーディングエージェント。したがって各 issue は「どの仕様に従い、何をどこまでやれば完了か」が一意に読み取れる状態でなければならない。

**issue 起票の規約は再定義しない。** type 体系・テンプレート本文・ラベル体系・dry-run/auto/headless の挙動は、すべて `github-issue` スキルの規約に完全準拠する。真理ソースは以下:

- 操作規約: `.claude/skills/github-issue/references/github-issue.md`
- テンプレート本文: `.claude/skills/github-issue/references/templates/<テンプレ名>.md`

本スキルが上乗せするのは **①複数 issue の計画化 ②起票順序 ③依存・親子の relationship 配線 ④要件↔issue のトレーサビリティ** の4点だけ。

## このスキルの2大失敗モード（先に宣言する）

1. **創作**: 入力に根拠のないタスクを勝手に作る。すべてのタスクは要件ID／設計判断ID（`FR-xx` / `UI-xx` / `R-xx` / `D-xx` 等）に紐づける。紐づかない作業は起票せず、質問するか計画のカバレッジ表に「未 issue 化＋理由」として残す。
2. **漏れ**: 入力の要件を取りこぼす。全要件IDが最低1タスクに対応していることを、計画のカバレッジ表で機械的に突合して保証する。

## 使い方

```text
/plan-to-issues [入力パス...] [--granularity feature|layered] [--phase <範囲>]
```

- **入力パス**（複数可・プロンプト指定を最優先）: 要件定義書・基本設計書などのパス。未指定なら既定探索先（下記）を提示して確認する。
- **--granularity**: タスク分解の粒度を上書きする。既定は `feature`（機能単位）。`layered` は 1 機能を spec→test-design→feat に分割する。詳細は `references/decomposition.md`。
- **--phase**: 工程の部分実行。`~3`=作業計画まで作って止める / `5~`=承認済みの計画 doc から起票だけ行う。指定なしは全工程。

## 入出力の規定

- **入力**: プロンプト指定を最優先。未指定時の既定探索先は次の順で探す。
  - 基本設計書: `docs/deliverables/functional-design/00-overview.md`〜`04-ui.md`
  - 要件定義書: `docs/deliverables/requirements-definition/requirements-definition.md`
  - どちらも無い／指定が曖昧なときは推測せず質問する。
- **出力**:
  - 作業計画 doc: `docs/internal/tasks/issue-plan.md`（複数運用時はユーザー指定で `issue-plan-<name>.md`）
  - タスク台帳同期: `docs/internal/tasks/backlog.md`（既存フォーマットに追記）
  - GitHub Issue（本体）と、その親子・blocked-by relationship
- **起票規約の真理ソース**: `.claude/skills/github-issue/`（完全準拠、重複定義しない）
- **前提**: `gh` CLI がインストール済み・認証済みであること（`gh auth status`）。未インストール／未認証ならユーザーに伝えて中断する。操作対象は cwd の git リポジトリに紐づく GitHub リポジトリ。

## 動作モード（dry-run / auto / headless）

`github-issue` と同じ3モードを踏襲する。副作用（計画 doc の書き込みは除く実起票・relationship 配線）は既定で dry-run。

- **dry-run（既定）**: 各承認ポイント（★CP1／★CP2）で提示・確認を取ってから進む。
- **auto**: ユーザーが「auto で」「確認なしで」と明示した場合、実行前の確認をスキップ（不足項目の質問はする）。
- **headless**: `claude -p` 等の対話不能環境、またはユーザーが「headless で」と明示した場合。確認も質問もせず計画→一括起票まで一気通貫する（下記「headless モードの動作差分」）。

## ワークフロー

### 1. 入力の読込と検証

1. 入力パスを確定する（プロンプト指定＞既定探索先。未指定・不在・曖昧なら質問）。
2. **入力ステージを判定する**（次工程の切り出し方が変わる）:
   - **ステージA**: 要件定義書のみ（設計未着手）
   - **ステージB**: 基本設計書あり（設計済み。`docs/deliverables/functional-design/` が存在）
3. 根拠IDを機械的に抽出する。
   - 要件定義書: `BR` / `FR` / `UI` / `DT` / `INT` / `NFR` / `AC` 等のID
   - 基本設計書: 設計判断ID `D-xx`、根拠要件ID `R-xx`、`00-overview.md` の要件対応表
4. 抽出できない・入力どうしが矛盾する箇所は **創作で埋めず質問** する（失敗モード①防止）。要件対応表（あれば）をカバレッジ検証のベースラインにする。

### 2. タスク分解と issue マッピング

`references/decomposition.md` に従って、作業単位ごとに次を決める。

- タイトル / type・テンプレ / 根拠ID / 親(task-id) / blocked-by(task-id) / 優先度 / DoD要約

要点（詳細は `references/decomposition.md`）:

- **粒度（既定・漏れ防止）**: 「実装エージェントが1つの作業として着手できる最小の意味単位」。機能要件 FR・設計上の機能／API／画面／設計判断の単位に 1 タスク。各タスクは必ず1つ以上の根拠IDに紐づける。
- **type/テンプレ判定の唯一の根拠**は `.claude/skills/github-issue/references/github-issue.md` の規約表。判別不能はフェーズ1で確認、headless は `chore.md` フォールバック。
- **トレーサビリティ**（`github-issue` のテンプレ節を改変せず活用する。詳細は `references/decomposition.md`）:
  - 「対象 spec（真理ソース）」← 入力設計書のパス＋該当セクション
  - 「経緯・関連」← 根拠ID（`根拠: FR-03, R-01, D-02`）
  - 「補足」← `task-id`（逆引き用）
- **依存・親子は task-id で保持する**（issue 番号は起票まで未確定）。親子＝サブタスク分割（構造）、blocked-by＝先行依存（順序）として区別する。
  - 親は分割前の課題を取りまとめる箱で、**別立ての取りまとめ課題として新規起票**する（既存の作業タスクを親に流用しない）。親自体は依存チェーンの一員にしない。
  - **blocked-by は兄弟（子）同士にのみ張り、親と子の間には張らない。親子と blocked-by を同一ペアに重ねて張ることは禁止**（詳細は `references/decomposition.md`）。

### 3. 作業計画の作成 ── ★CP1

1. `references/work-plan-template.md` の固定書式で計画 doc を `docs/internal/tasks/issue-plan.md` に作成する。タスク表・Mermaid 依存グラフ・**カバレッジ表**（全根拠ID→task-id、未 issue 化IDは理由必須）・backlog.md 追記プレビューを含める。
2. **推奨: 文脈を持たないサブエージェントで計画をレビューする**（`references/review.md` を渡す）。観点＝カバレッジ漏れ／type適合／依存の循環・欠落／根拠IDの実在／DoDの具体性。重大指摘は計画に反映する。小規模・headless では省略してよい。
3. **★CP1: この作業計画（粒度・type・依存・親子・カバレッジ）で起票してよいか、ユーザーの承認を得る。承認なしにフェーズ4へ進むことは禁止。**

### 4. 一括起票の dry-run 提示 ── ★CP2

1. 全 issue の起票コマンドと本文プレビューを **まとめて一括提示** する（`github-issue` の dry-run 形式に準拠）。本文は stdin（heredoc）渡しを既定とする。

   ````text
   # 起票予定（N 件）:
   ## T-01: <title>  [type:feat]
   ```bash
   gh issue create --title "<title>" --label "type:feat" --body-file - <<'EOF'
   ## 概要
   ...
   EOF
   ```
   ...（issue 数ぶん）
   # relationship 配線予定:
   - 親子: T-02 の親 = T-01
   - blocked-by: T-03 は T-01 に blocked
   ````

2. ラベルがリポジトリに未存在なら `gh label create` を提案する（自動作成しない、色・説明は `github-issue` のラベル体系に従う）。
3. **★CP2: 起票実行の一括承認を得る（「全部起票していい」）。個別修正の申し出（「T-03 だけ type 変えて」等）も受ける。承認なしの実起票は禁止。**

### 5. 順次起票（2パス）と結果記録

手順の詳細は `references/batch-issue.md`。

- **パス1（作成）**: 依存トポロジ順（依存の少ないものから）に `gh issue create` を実行。各起票直後に issue 番号・URL・GraphQL node ID を取得し、計画 doc の該当列に **逐次書き込む**（冪等の真理ソース）。
- **パス2（relationship 配線）**: 親子・blocked-by を持つ issue に `gh api graphql` で配線する。**親子は取りまとめ親↔各子のみ、blocked-by は子同士のみで配線し、親をどの子とも blocked-by で繋がない（同一ペアに親子と blocked-by を重ねて張らない）。**
  - 親子: `addSubIssue(input:{ issueId:<親nodeID>, subIssueId:<子nodeID> })`
  - blocked-by: `addBlockedBy(input:{ issueId:<被ブロックnodeID>, blockingIssueId:<ブロック元nodeID> })`
  - **フォールバック**: API が使えない（機能未提供・権限不足・失敗）場合は、対象 issue の body「経緯・関連」に `Parent: #N` / `Depends on #N` をテキストで残し、relationship を張れなかった旨を警告出力する（中断はしない）。
- 途中失敗時は、済み分の issue 番号を計画 doc に記録して停止し、エラー理由と既起票一覧を報告する。

### 6. 仕上げと報告

1. `docs/internal/tasks/backlog.md` に起票済みタスクを追記する（既存列 `ID / Task / Feature / Priority / Status` を維持。Status に issue #／URL）。
2. 報告に含める: 作成 issue 一覧（#・title・type・根拠ID・親/依存）、relationship 配線結果（成功／フォールバック）、カバレッジ残（未 issue 化IDと理由）、レビュー残指摘。

## 冪等性・再実行

- 計画 doc の `issue#` 列が **唯一の再開ポイント**。# が埋まった task は再実行時にスキップする（重複起票防止）。relationship を配線済みかも doc に印を残す。
- 任意で起票前に `gh issue list --search "<タイトル>"` により同名 issue の存在を dry-run 時に警告する。

## headless モードの動作差分

対話できないため、確認・質問を以下のとおり置き換える。規約・テンプレ・ラベル体系は他モードと共通。

| 場面 | dry-run / auto | headless |
| --- | --- | --- |
| ★CP1 計画承認 | 計画提示 → 承認 | 確認なし・計画 doc を残して続行 |
| ★CP2 起票承認 | dry-run 一括提示 → 承認 | 確認なし・即一括起票 |
| 入力が曖昧・不足 | 質問する | 質問せず、埋まらない項目は `<未確認>` で起票 |
| テンプレ判別不能 | 候補提示して確認 | `chore.md` にフォールバック |
| ラベル未存在 | `gh label create` を提案 | 自動作成せず stderr に明示 + exit 非0 |
| relationship API 失敗 | ユーザーに相談 | body へのテキスト記載にフォールバックし警告（中断しない） |
| 起票失敗 | 報告して相談 | stderr に理由明示 + exit 非0 |

計画 doc はどのモードでも必ず残す（後追い確認・冪等リランのため）。

## やらないこと

- issue 起票規約（type・テンプレ・ラベル・削除禁止）の再定義。`github-issue` に委譲する。
- 要件定義書・基本設計書そのものの作成・改訂。不備は質問・報告に留める（改訂は `requirements-definition` / `requirements-to-functional-design`）。
- ★CP1／★CP2 なしの計画確定・実起票。
- ラベルの自動作成、依存の推測補完、根拠のないタスクの創作。
- `github-issue` のテンプレート本文の改変。
