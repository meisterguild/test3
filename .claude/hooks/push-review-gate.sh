#!/bin/sh
# テンプレートリポジトリ自身の開発用フォワーダ。
#
# 本リポジトリは二層構造で、push レビューゲートの実体（ペイロード）は
# template/.claude/hooks/push-review-gate.sh にある。ルート .claude/settings.json の
# PreToolUse hook は $CLAUDE_PROJECT_DIR/.claude/hooks/push-review-gate.sh を起動するため、
# ここでは実体へ委譲するだけにして、ゲート本体を二重管理しない（契約点 C5）。
set -u

# 委譲先の解決順序:
#   1. CLAUDE_PROJECT_DIR 起点（委譲先の実体と 1 段目の基準を揃えるため）
#   2. 無ければ自身のスクリプト位置起点（フォワーダと実体は固定の相対関係にあるため、
#      CLAUDE_PROJECT_DIR が worktree・サブディレクトリ等を指していても解決できる）
# 2 を持たないと、CLAUDE_PROJECT_DIR がリポジトリ直下と異なる場合に必ず exit 2 となり、
# PreToolUse hook は全 Bash コマンドで発火するためセッションの Bash が全滅する。
SELF_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GATE="${CLAUDE_PROJECT_DIR:-$SELF_ROOT}/template/.claude/hooks/push-review-gate.sh"
if [ ! -x "$GATE" ]; then
  GATE="$SELF_ROOT/template/.claude/hooks/push-review-gate.sh"
fi

# fail-closed: どちらでも実体が見つからなければ push を止める
# （PreToolUse のブロック条件は exit 2 のみ）
if [ ! -x "$GATE" ]; then
  echo "✖ $GATE が見つかりません（または実行権限がありません）。AI レビューを実行できないため push を中止します（fail-closed）。" >&2
  echo "  緊急 bypass が必要な場合のみ: git push --no-verify" >&2
  exit 2
fi

exec "$GATE"
