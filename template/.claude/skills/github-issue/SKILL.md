---
name: github-issue
description: |
  GitHub issue の作成・更新・検索を行う。テンプレート（feat / fix / spec / docs-other / test-design / test-other / refactor / perf / style / chore）に従って issue を起票し、ラベル付け、クローズ、一覧取得などを行う。
  ユーザーが「issue」「Issue」という言葉を使ったとき、または GitHub 上のタスク・バグ・仕様変更を記録・管理しようとしているときは、必ずこのスキルを使うこと。
  「issue を立てて」「issue 一覧見せて」「自分の issue は？」「このバグを記録しておいて」のような依頼は明示的にスキルを呼ぶサインであり、必ず参照すること。
  対話可能な環境（手動操作 / Claude Code GUI）では dry-run（確認あり）で動作する。headless 環境（daemon 等から `claude -p` で起動された場合）、またはユーザーが「headless モードで」「確認・質問なしで」のように明示指定した場合は、環境を問わず確認・質問を一切行わない headless モードで即実行する。
---

# GitHub Issue 管理

GitHub issue を `gh` CLI 経由で作成・更新・検索する。

- **操作規約**: `.claude/skills/github-issue/references/github-issue.md` に従う（削除禁止、type 体系、テンプレート、ラベル体系）
- **テンプレート本文**: `.claude/skills/github-issue/references/templates/<テンプレ名>.md` を参照する。テンプレ名と type label は1対1ではなく、`docs` と `test` は用途別に複数テンプレが対応する（`spec.md` / `docs-other.md`、`test-design.md` / `test-other.md`）

## 前提

- `gh` CLI がインストール済み・認証済みであること
- 操作対象は cwd の git リポジトリに紐づく GitHub リポジトリ

`gh auth status` で認証状態を確認できる。`gh` が未インストール、または未認証のときはユーザーに伝えて中断する。

## 動作モード: dry-run / auto / headless

このスキルは副作用を伴う操作（作成・更新）について、既定で **dry-run モード** を取る。

- **dry-run（既定）**: 実行予定の `gh` コマンドと、書き込む本文プレビューを提示し、ユーザーの確認を取ってから実行する
- **auto**: ユーザーが「実行していい」「auto で」「確認なしで」のように明示した場合は確認をスキップして即実行（埋まらない必須項目の質問は行う）
- **headless**: 以下のいずれかに該当する場合。確認も質問も一切行わず即実行する（詳細は下記「headless モードの動作差分」）
  - daemon 等から `claude -p` で起動された（対話不能な環境）
  - ユーザーが「headless モードで」「確認・質問なしで」「すべてお任せで」のように明示指定した（**環境を問わず適用する**。対話可能な環境でも、指定された時点で以降の確認・質問をすべて省略する）

auto と headless の違いは**質問の有無**。auto は実行前の確認だけを省略し、不足項目があれば質問する。headless は質問もせず `<未確認>` のまま起票する。

検索系（`gh issue list`、`gh issue view`）は副作用がないので dry-run 確認は不要。どのモードでも直接実行する。

### headless モードの動作差分

対話できないため、以降のワークフロー中の「確認する」「質問する」の分岐を以下のとおり置き換える。規約・テンプレート・ラベル体系は他モードと共通。

| 場面 | dry-run / auto | headless |
| --- | --- | --- |
| 実行確認 | dry-run 提示 → 確認（auto はスキップ） | 確認なし・即実行 |
| テンプレ判別不能 | 候補を提示して確認 | `chore.md` にフォールバック（後から人間が修正可） |
| 埋まらない必須項目 | ユーザーに質問 | 質問せず `<未確認>` と明示して起票（人間が後で補う） |
| 対象 spec が特定不能 | 他項目より先に質問 | `<未確認>` のまま起票 |
| 削除依頼 | クローズ提案 → 明示確認で実行 | 常に拒否（stderr に理由 + exit 非 0） |
| ラベル未存在 | `gh label create` を dry-run 提案 | 自動作成せず stderr に明示 + exit 非 0 |
| 失敗時 | ユーザーに報告して対応を相談 | stderr に理由明示 + exit 非 0 |

dry-run の提示形式は以下を使う:

````
# 実行予定:
```bash
gh issue create --title "..." --label "type:feat" --body-file - <<'EOF'
## 概要
...
EOF
```

# 本文プレビュー:
```markdown
## 概要
...
```
````

提示後に「実行していいですか？」と確認する。

## ワークフロー

### 1. 操作の判別

ユーザーの依頼から、以下のどれに該当するかを判別する。

| 依頼の傾向 | 操作 |
| --- | --- |
| 「issue を立てて」「起票して」「記録して」 | 作成（2-A） |
| 「クローズして」「閉じて」「ラベル変えて」「コメントして」 | 更新（2-B） |
| 「一覧」「最近の」「自分の」「未対応の」 | 検索（2-C） |
| 「削除して」「消して」 | 削除依頼（2-D。規約により拒否を基本とする） |

判別が曖昧なときは、勝手に進めず短く確認する。

### 2-A. 作成フロー（ハイブリッド方式）

ユーザーの最初の発言から取れる情報を埋め、不足分のみ質問する。最初から「テンプレ種別は？タイトルは？背景は？…」と全部聞き返さない。

#### Step 1. テンプレ判定

ユーザー発言から **テンプレ名** を推定する。テンプレ名 → label の対応は `.claude/skills/github-issue/references/github-issue.md`「テンプレート」表に従う。

| 発言の語彙 / 文脈 | テンプレ | label |
| --- | --- | --- |
| 「バグ」「動かない」「エラー」「落ちる」 | `fix.md` | `type:fix` |
| 「機能追加」「新規実装」「作りたい」 | `feat.md` | `type:feat` |
| 「仕様」「spec」「AC」「R 定義」「仕様変更」 | `spec.md` | `type:docs` |
| 「README」「docs/ 配下のドキュメント変更」（specs 以外） | `docs-other.md` | `type:docs` |
| 「テスト設計」「AC 抽出」「テスト雛形」「it.todo」 | `test-design.md` | `type:test` |
| 「テスト追加」「テストコードを書く・直す」 | `test-other.md` | `type:test` |
| 「リファクタ」「整理」「内部構造を変える」 | `refactor.md` | `type:refactor` |
| 「性能」「パフォーマンス」「遅い」「最適化」 | `perf.md` | `type:perf` |
| 「フォーマット」「整形」「lint ルール」 | `style.md` | `type:style` |
| 「依存更新」「ビルド設定」「規約整理」「運用整備」 | `chore.md` | `type:chore` |
| 判別不能 | — | 候補を 1〜2 個提示して短く確認 |

迷ったら「`feat.md` で進めますがよいですか？」のように一案を提示して確認する。複数尋ねない。headless モードでは確認せず `chore.md` にフォールバックする。

#### Step 2. テンプレートの読み込み

該当テンプレートを `.claude/skills/github-issue/references/templates/<テンプレ名>` から読み込む。同じ type label に複数テンプレが対応する場合は、**対象パスや作業内容で判別**する:

- `docs/specs/` を触るか? → `spec.md`、それ以外の docs 変更 → `docs-other.md`
- spec から AC/R 抽出・it.todo 雛形作成か? → `test-design.md`、既存テストの追加・修正 → `test-other.md`

#### Step 3. 項目埋め

ユーザー発言から各項目を可能な限り埋める。**埋まらない必須項目だけを質問**する。

- 質問するときは一度に全部出さず、3〜4 項目ずつ区切る
- ユーザーが書いた語句はなるべく原文を尊重する
- 不明な値は `<未確認>` で残し、issue 本文にも明示する（埋めるのを忘れた印になり、後から補えるため）
- headless モードでは質問せず、埋まらない項目はすべて `<未確認>` のまま起票する

##### 「対象 spec」フィールドの扱い

ユーザー発言に「テスト設計」「テスト書く」「実装する」「実装だけ」などが含まれ、起票対象が **テスト設計 / 実装のみ** だと判断できる場合、`対象 spec` を**必須**として優先的に確認する。

- ユーザー発言や直近の文脈から spec パスが特定できる → そのまま埋める（複数なら列挙）
- 特定できない → ユーザーに直接質問する（他の項目より先に確認する）。headless モードでは質問せず `<未確認>` のまま起票する
- 「(本 issue で新規作成)」のフル機能 issue だとユーザーが明言した場合のみ、その旨を明記して進める（テンプレを `spec.md` に切り替えることも検討する）

詳細は `.claude/skills/github-issue/references/github-issue.md` の「対象 spec の必須化」を参照。

#### Step 4. 標準項目（assignee / milestone）

ユーザーが明示している場合のみ設定する。**自分から聞き返さない**。デフォルトは未指定。
（規約: `.claude/skills/github-issue/references/github-issue.md` の「標準項目」を参照）

#### Step 5. dry-run 提示と実行

組み立てたコマンドと本文プレビューを dry-run 形式で提示する。本文は **stdin（heredoc）経由で渡す** のを既定とする — `--body` 直渡しは長文や改行で壊れる一方、`--body-file -` + heredoc なら一時ファイルを作らずに済む。

```bash
gh issue create --title "<title>" --label "type:feat" --body-file - <<'EOF'
## 概要
...
EOF
```

ユーザー確認後に実行し、issue URL を返す。headless モードでは dry-run 提示・確認を行わず即実行し、issue URL を出力する。

長文や複雑な引用などで stdin で扱いづらい場合に限り、PJ 内 `.local/` 配下に一時ファイルを作成して `--body-file <path>` で渡す（`/tmp/` などプロジェクト外には作らない）。**一時ファイルを作った場合、削除は実行しない**（環境によって `rm` が拒否されるため）。代わりに作成完了の応答で「一時ファイルを `<path>` に残しています。不要なら削除してください」と必ず伝える。

### 2-B. 更新フロー

| 操作 | コマンド |
| --- | --- |
| クローズ | `gh issue close <番号>` |
| 再オープン | `gh issue reopen <番号>` |
| ラベル追加 | `gh issue edit <番号> --add-label "<label>"` |
| ラベル削除（issue から外す） | `gh issue edit <番号> --remove-label "<label>"` |
| コメント追加 | `gh issue comment <番号> --body-file <tmp>` |
| assignee 変更 | `gh issue edit <番号> --add-assignee / --remove-assignee`（`@me` は IAT コンテナ内では解決不能（403）。login を明示する。App bot 自身は assignee に指定できない） |

すべて dry-run 提示 → 確認 → 実行（headless モードでは即実行）。コメント追加の本文も作成時と同様、**stdin（heredoc）経由で渡す** のを既定とする（`gh issue comment <番号> --body-file - <<'EOF' ... EOF`）。stdin で扱いづらい場合のみ PJ 内 `.local/` 配下に一時ファイルを作成し、削除は実行せず、ファイルパスをユーザーに伝えて削除を委ねる。

### 2-C. 検索フロー

| 依頼 | コマンド |
| --- | --- |
| 「一覧」「直近」（既定） | `gh issue list --state open --limit 20` |
| 「自分にアサインされた」 | `gh issue list --assignee @me --state open --limit 20`（IAT コンテナ内では `@me` が解決不能（403）。`--assignee <環境所有者のlogin>` を明示する） |
| 「自分が作成した」 | `gh issue list --author @me --state open --limit 20`（IAT コンテナ内では `--author` に依頼者の login を明示。daemon 起票分は `--author "app/<app-slug>"`） |
| 「ラベル X の」 | `gh issue list --label "X" --state open --limit 20` |
| closed も含む | `--state all` を追加 |
| 件数指定 | `--limit N` |

検索は副作用なしのため dry-run 確認をスキップして直接実行する。結果は読みやすく整形する。

```
#42 ログイン処理がときどき落ちる
   labels: type:fix, priority:high
   assignee: @hanamura
   updated: 2026-04-20
```

タイトル行の番号は markdown リンクとして issue URL を貼る。

### 2-D. 削除依頼

「削除」「消して」と言われたときは、規約 `.claude/skills/github-issue/references/github-issue.md` に従い、即座にコマンドを提示しない。

1. **まずクローズで足りないかを確認する**: 「issue の削除は規約上、明示的な指示が必要です。多くの場合はクローズで十分です。クローズに切り替えますか？」
2. ユーザーが明示的に「削除でいい」「明示的に削除して」と返答した場合に限り、dry-run で削除コマンド（`gh issue delete <番号>`）を提示する
3. dry-run 提示時にも「削除は復元できません。本当に実行しますか？」と再確認する

コメント削除・ラベル自体の削除も同様の扱い。

headless モードでは削除依頼は**常に拒否**し、以下を stderr に出力して exit 非 0 で終了する（削除は復元できず、確認なしで実行してよい操作ではないため。明示指定で headless モードに入っている場合も同様）。

```
ERROR: headless モードでは issue 削除は禁止
対応: dry-run モード（確認あり）でユーザーの明示確認を取って実行する
```

## 出力形式

### 作成成功時

```
✅ issue #N を作成しました
URL: <url>
テンプレ: <テンプレ名>
ラベル: <カンマ区切り>
assignee: <login / なし>
```

### 更新成功時

```
✅ issue #N を更新しました
操作: <close / label 追加 / コメント追加 など>
URL: <url>
```

### 検索結果

上記 2-C のフォーマット。0 件のときは「該当する issue はありません」と明示する。

### 失敗時（headless モード）

stderr に理由を明示し、exit 非 0 で終了する（daemon 側が失敗を検知できるようにする）。

```
ERROR: <理由>
```

## ラベル未作成時の挙動

`gh issue create --label "..."` がラベル未存在で失敗したら、`gh label create` の dry-run 提案を行う。色・説明は規約 `.claude/skills/github-issue/references/github-issue.md` の「ラベル体系」を参照する（自動作成はしない）。ユーザー確認後に作成、その後元のコマンドを再実行する。

headless モードでも自動作成はしない。「ラベル `<name>` が未作成」と stderr に明示して exit 非 0 で終了する（人間が事前にラベルを作成してから再実行する運用）。
