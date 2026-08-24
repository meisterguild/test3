#!/bin/sh
# Claude Code PreToolUse hook: `git push` の実行前に AI レビュー (review-runner.py) を走らせる。
#
# 呼び出し元: .claude/settings.json の hooks.PreToolUse（matcher: Bash）
# exit 0 = push 許可（または対象外コマンド）/ exit 2 = push ブロック（stderr が Claude に返る）
#
# hook は全 Bash コマンドで起動し（settings.json 側に "if" フィルタは置かない）、
# 「git push かどうか」の判定は本スクリプトが行う。"if" の glob 解釈（引数なしの
# 素の `git push` がマッチしない可能性等）に依存すると、フィルタ不一致 = ゲート不発の
# silent skip になるため。対象外コマンドは数十 ms で exit 0 する。
#
# 既知の限界（クライアントサイドゲートの前提。強制ではなく「摩擦」として機能する）:
#   - ゲート対象は Claude Code 経由の Bash `git push` のみ（ターミナルからの push は対象外）
#   - ルール (security-gate.yml) は作業ツリーから読むため、ツリー上の書き換えで判定は変わる
#   - レビュー範囲は「現在の HEAD 基準の差分」であり、`git push origin HEAD~3:x` や
#     他ブランチ指定など refspec 付き push では実際の push 内容と一致しないことがある
#
# review-runner.py の exit code（block 所見 = 1 / 実行失敗 = 2）は、PreToolUse の
# ブロック条件が「exit 2 のみ」のため、非 0 をすべて 2 に正規化する。
#
# 緊急 bypass: `git push --no-verify`（独立した引数として指定されたときのみ。監査は
# Claude Code の transcript に残るコマンド文字列で行う）
set -u

INPUT=$(cat)  # PreToolUse hook は stdin に JSON（tool_input.command 等）を受け取る

# コマンドを分類する:
#   other   = git push を含まない → 対象外（exit 0）
#   bypass  = すべての git push セグメントに --no-verify が独立引数として付く → 素通し（exit 0）
#   push    = レビュー対象
#   unknown = 判定不能（JSON パース失敗等）→ fail-closed でレビューに進む
VERDICT=$(printf '%s' "$INPUT" | python3 -c '
import json, shlex, sys

try:
    cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
except Exception:
    print("unknown")
    sys.exit(0)

try:
    tokens = shlex.split(cmd)
except ValueError:
    tokens = cmd.split()

# コマンドをセパレータでセグメントに分割し、`git ... push` を含むセグメントを探す
# （複合コマンド cd x && git push も検知。クォート内の "push" は shlex により
# 1 トークンになるため誤検知しない）
SEPARATORS = {"&&", "||", ";", "|", "&"}
segments, cur = [], []
for t in tokens:
    if t in SEPARATORS:
        if cur:
            segments.append(cur)
        cur = []
    else:
        cur.append(t)
if cur:
    segments.append(cur)

push_segments = []
for seg in segments:
    seen_git = False
    for t in seg:
        if t == "git" or t.endswith("/git"):
            seen_git = True
        elif t == "push" and seen_git:
            push_segments.append(seg)
            break

if not push_segments:
    print("other")
elif all("--no-verify" in seg for seg in push_segments):
    # push と同一セグメント内の --no-verify のみ bypass と認める
    # （git commit --no-verify && git push のような別セグメントの指定では skip しない）
    print("bypass")
else:
    print("push")
' 2>/dev/null || echo unknown)

case "$VERDICT" in
  other)
    exit 0 ;;
  bypass)
    echo "[push-gate] --no-verify 指定のため AI レビューを skip（明示的 bypass）。" >&2
    exit 0 ;;
esac
# push / unknown はレビューへ

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# レビュー資材の基準ディレクトリ。通常のプロジェクト（テンプレートをコピーした先）では
# ROOT/.claude を使う。テンプレートリポジトリ (000-ai-template) 自身で動かした場合だけ
# ROOT/template/.claude へフォールバックする（review-runner.py と同じ解決順序）。
# コピー先では ROOT/.claude/review-config.yml が必ず存在するため挙動は不変。
CLAUDE_DIR="$ROOT/.claude"
if [ ! -f "$CLAUDE_DIR/review-config.yml" ] && [ -f "$ROOT/template/.claude/review-config.yml" ]; then
  CLAUDE_DIR="$ROOT/template/.claude"
fi

RUNNER="$CLAUDE_DIR/hooks/review-runner.py"
GATE_RULE="$CLAUDE_DIR/skills/code-security-review/references/security-gate.yml"

# fail-closed: レビュー資材が欠けていたら push を止める
# （review-runner.py 自身は security-gate.yml 不在時に exit 0 で silent skip するため hook 側で塞ぐ）
if [ ! -f "$RUNNER" ]; then
  echo "✖ $RUNNER が見つかりません。AI レビューを実行できないため push を中止します（fail-closed）。" >&2
  echo "  緊急 bypass が必要な場合のみ: git push --no-verify" >&2
  exit 2
fi
if [ ! -f "$GATE_RULE" ]; then
  echo "✖ $GATE_RULE が見つかりません。AI レビューを実行できないため push を中止します（fail-closed）。" >&2
  echo "  緊急 bypass が必要な場合のみ: git push --no-verify" >&2
  exit 2
fi

python3 "$RUNNER" >&2 || exit 2
exit 0
