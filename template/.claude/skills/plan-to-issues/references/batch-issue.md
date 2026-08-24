> `/plan-to-issues` のフェーズ4〜5で使う一括起票の手順。全体フロー・承認ゲートは `../SKILL.md` を参照。issue 本文・ラベル・dry-run/headless の規約は `.claude/skills/github-issue/references/github-issue.md` に完全準拠する（ここでは再定義しない）。

# 一括起票の手順（dry-run 一括提示 → 2パス起票 → relationship 配線）

## 前提確認

- `gh auth status` で認証を確認。未認証なら中断（dry-run/auto）／stderr + exit 非0（headless）。
- 対象ラベルがリポジトリに存在するか `gh label list` で確認。未存在なら `gh label create` を提案（自動作成しない。色・説明は github-issue のラベル体系）。headless は自動作成せず stderr + exit 非0。

## フェーズ4: dry-run 一括提示（★CP2）

全 issue の起票コマンド＋本文プレビューを **1回でまとめて** 提示する。本文は stdin（heredoc）渡しが既定。

````text
# 起票予定（N 件・起票順）:

## T-01: ユーザー登録APIの実装  [type:feat]
```bash
gh issue create --title "ユーザー登録APIの実装" --label "type:feat" --body-file - <<'EOF'
## 概要
...
## 対象 spec（真理ソース）
- docs/deliverables/functional-design/03-api.md#ユーザー登録api
## 経緯・関連
- 根拠: FR-03, R-01
## 実装範囲
...
## 完了条件 (Definition of Done)
- [ ] ...
## 補足
task-id: T-01
EOF
```

## T-02: ...（issue 数ぶん）

# relationship 配線予定:
- 親子: （なし）
- blocked-by: T-02 は T-01 に blocked
````

提示後、「この内容で全件起票していいですか？（個別修正の指定も可）」と確認する。headless では提示・確認を行わず即実行。

## フェーズ5 パス1: 作成（依存トポロジ順）

1. 依存グラフをトポロジカルソートし、blocked-by の少ない（先行する）task から起票する。blocked-by は子（兄弟）同士にのみ張られている前提。
   - 取りまとめ親は blocked-by チェーンに含めない。ただし `addSubIssue` の前提として **親を先に起票**し、その後に子を起票する（親を子より先に作る、という作成順の意味のみ）。
2. 計画 doc の `issue#` が **空の task だけ** を対象にする（埋まっていれば再実行時スキップ＝冪等）。
3. 1件ずつ `gh issue create` を実行し、URL を得る。

```bash
url=$(gh issue create --title "<title>" --label "type:<t>" --body-file - <<'EOF'
<本文>
EOF
)
num=$(basename "$url")   # 末尾が issue 番号
```

1. **node ID を取得**して記録する（relationship 配線に必須）。

```bash
node_id=$(gh issue view "$num" --json id -q .id)   # 例: I_kwDO...
```

1. 計画 doc `docs/internal/tasks/issue-plan.md` の当該行の `issue#`（`#<num>`）と `node-id`（`<node_id>`）を **その場で書き戻す**。1件ごとに書くことで途中失敗しても再開できる。

## フェーズ5 パス2: relationship 配線

全 issue の番号・node ID が揃ったら、親子・blocked-by を `gh api graphql` で配線する。

### 親子（sub-issue）

`issueId` が親、`subIssueId` が子。

```bash
gh api graphql -f query='
mutation($parent:ID!, $child:ID!) {
  addSubIssue(input:{ issueId:$parent, subIssueId:$child }) {
    subIssue { number }
  }
}' -f parent="$PARENT_NODE_ID" -f child="$CHILD_NODE_ID"
```

### blocked-by（依存）

`issueId` がブロックされる側、`blockingIssueId` がブロックする側。

```bash
gh api graphql -f query='
mutation($blocked:ID!, $blocker:ID!) {
  addBlockedBy(input:{ issueId:$blocked, blockingIssueId:$blocker }) {
    clientMutationId
  }
}' -f blocked="$BLOCKED_NODE_ID" -f blocker="$BLOCKER_NODE_ID"
```

配線に成功したら、計画 doc の「relationship 配線予定」の該当行に ✅ を付す。

### フォールバック（API が使えないとき）

`addSubIssue` / `addBlockedBy` が権限・機能提供状況で失敗する場合は、対象 issue の body「経緯・関連」にテキストで残し、relationship を張れなかった旨を警告する。中断はしない。

```bash
# 例: 子 issue の body に親を明記（github-issue の body 更新規約に従う）
gh issue comment "<num>" --body-file - <<'EOF'
Parent: #<親番号>
Depends on: #<ブロック元番号>
(relationship API が利用できなかったためテキストで記録)
EOF
```

## 途中失敗時の扱い

- 失敗した時点で停止し、済み分の `issue#`・`node-id` は計画 doc に記録済みであることを確認する。
- エラー理由と、既に起票できた issue 番号一覧を報告する。
- 再実行は「空の `issue#` を持つ task のみ」を対象にする（重複起票しない）。

## headless の差分（github-issue に準拠）

- ★CP2 の提示・確認を省略し即起票。
- 未確定項目は `<未確認>` のまま起票。テンプレ判別不能は `chore.md`。
- ラベル未存在は自動作成せず stderr + exit 非0。
- relationship API 失敗はテキストフォールバックして警告（中断しない）。
- その他の失敗は stderr に理由明示 + exit 非0。
