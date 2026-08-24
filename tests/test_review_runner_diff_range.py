#!/usr/bin/env python3
"""`template/.claude/hooks/review-runner.py` の `diff_range()` の回帰テスト。

実行方法:

    python3 -m unittest discover -s tests -v

標準ライブラリの `unittest` のみで書いてある（review-runner.py 自体が
「Python 3.8+ / 標準ライブラリのみ」の制約で作られているため、テスト側にも
追加の依存を持ち込まない）。pytest を導入している環境では `pytest tests` でも動く。

一時ディレクトリに bare repo を `origin` として登録した git repo を作り、
`develop` → `epic-317` → 作業ブランチの多段構成で `diff_range()` の戻り値を検証する。
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
RUNNER_PATH = REPO_ROOT / "template" / ".claude" / "hooks" / "review-runner.py"

# fixture の git 操作をユーザーの global / system 設定（core.hooksPath や
# init.defaultBranch 等）から切り離す
_GIT_ENV = {
    **os.environ,
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_SYSTEM": os.devnull,
    "GIT_AUTHOR_NAME": "test",
    "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "test",
    "GIT_COMMITTER_EMAIL": "test@example.com",
}


def _load_runner():
    """review-runner.py をパス指定でロードする。

    ファイル名にハイフンを含むため通常の `import` ができない。また import 時に
    `git rev-parse --show-toplevel` の結果へ `os.chdir` するため、cwd を退避・復元し、
    基準ディレクトリのフォールバック通知（stderr への print）も飲む。
    """
    spec = importlib.util.spec_from_file_location("review_runner", RUNNER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"{RUNNER_PATH} をロードできません")
    module = importlib.util.module_from_spec(spec)
    saved_cwd = os.getcwd()
    try:
        os.chdir(REPO_ROOT)
        with contextlib.redirect_stderr(io.StringIO()):
            spec.loader.exec_module(module)
    finally:
        os.chdir(saved_cwd)
    return module


runner = _load_runner()


def git(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", *args], cwd=str(cwd), capture_output=True, text=True, env=_GIT_ENV
    )
    if result.returncode != 0:
        raise AssertionError(
            f"git {' '.join(args)} が失敗しました (cwd={cwd}):\n{result.stderr}"
        )
    return result


class DiffRangeTestBase(unittest.TestCase):
    """一時 git repo + bare origin を用意する共通土台。"""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="review-runner-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.saved_cwd = os.getcwd()
        self.addCleanup(os.chdir, self.saved_cwd)

        self.origin = self.tmp / "origin.git"
        self.work = self.tmp / "work"
        git("init", "--bare", "-b", "develop", str(self.origin), cwd=self.tmp)
        git("init", "-b", "develop", str(self.work), cwd=self.tmp)
        git("remote", "add", "origin", str(self.origin), cwd=self.work)

    def commit(self, name: str) -> None:
        (self.work / name).write_text(f"{name}\n", encoding="utf-8")
        git("add", name, cwd=self.work)
        git("commit", "-m", f"chore: add {name}", cwd=self.work)

    def set_origin_head(self, branch: str) -> None:
        git(
            "symbolic-ref",
            "refs/remotes/origin/HEAD",
            f"refs/remotes/origin/{branch}",
            cwd=self.work,
        )

    def new_branch(self, name: str) -> None:
        """作業ブランチを切る。upstream は張らない（初回 push 前の状態を再現）。"""
        git("checkout", "-b", name, cwd=self.work)
        subprocess.run(
            ["git", "branch", "--unset-upstream"],
            cwd=str(self.work), capture_output=True, text=True, env=_GIT_ENV,
        )

    def diff_range(self) -> str | None:
        """作業 repo を cwd にして `diff_range()` を呼ぶ（git 呼び出しは cwd 相対）。"""
        os.chdir(self.work)
        try:
            return runner.diff_range()
        finally:
            os.chdir(self.saved_cwd)

    # --- fixture 部品 -------------------------------------------------------

    def build_develop(self) -> None:
        """`develop` を 2 コミット作って origin へ push し、origin/HEAD を develop にする。"""
        self.commit("a.txt")
        self.commit("b.txt")
        git("push", "origin", "develop", cwd=self.work)
        self.set_origin_head("develop")

    def build_epic(self) -> None:
        """`develop` から `epic-317` を切って 2 コミット積み、origin へ push する。"""
        git("checkout", "-b", "epic-317", cwd=self.work)
        self.commit("epic-1.txt")
        self.commit("epic-2.txt")
        git("push", "origin", "epic-317", cwd=self.work)


class ForkPointDetectionTest(DiffRangeTestBase):
    def test_epic_branch_first_push_uses_epic_as_base(self) -> None:
        """受け入れ条件 1: epic から切った枝の初回 push は `origin/epic-317...HEAD`。

        修正前はここが `origin/develop...HEAD` に落ち、epic に既にマージ済みの
        コミット（epic-1 / epic-2）がレビュー対象へ混入していた。
        """
        self.build_develop()
        self.build_epic()
        self.new_branch("fix/33-work")
        self.commit("work-1.txt")

        self.assertEqual(self.diff_range(), "origin/epic-317...HEAD")

    def test_default_branch_first_push_is_unchanged(self) -> None:
        """受け入れ条件 2: 既定ブランチから切った通常の枝は従来と同じ範囲（回帰なし）。"""
        self.build_develop()
        self.new_branch("fix/34-plain")
        self.commit("work-1.txt")

        self.assertEqual(self.diff_range(), "origin/develop...HEAD")

    def test_second_push_uses_own_remote_ref(self) -> None:
        """受け入れ条件 3: `origin/<branch>` がある 2 回目以降は 2 ドットの増分レビュー。"""
        self.build_develop()
        self.build_epic()
        self.new_branch("fix/33-work")
        self.commit("work-1.txt")
        # -u を付けず push（upstream 未設定のまま remote ref だけ作る = 優先順位 2 の経路）
        git("push", "origin", "fix/33-work", cwd=self.work)
        self.commit("work-2.txt")

        self.assertEqual(self.diff_range(), "origin/fix/33-work..HEAD")

    def test_sibling_work_branch_is_not_chosen_as_base(self) -> None:
        """受け入れ条件 4: 自分の枝から派生した兄弟作業ブランチは分岐元に選ばれない。

        `origin/fix/99-sibling` の merge-base は HEAD 自身（= 差分 0 件）になるため、
        除外しないと最小コミット数で必ず勝ってしまい、自分の変更が丸ごと
        レビュー対象から漏れる。
        """
        self.build_develop()
        self.build_epic()
        self.new_branch("fix/33-work")
        self.commit("work-1.txt")
        # 自分の枝の先端から兄弟ブランチを切って push し、ローカルからは消す
        git("push", "origin", "HEAD:refs/heads/fix/99-sibling", cwd=self.work)
        git("fetch", "origin", cwd=self.work)
        self.commit("work-2.txt")

        self.assertIn(
            "origin/fix/99-sibling",
            git("for-each-ref", "--format=%(refname:short)",
                "refs/remotes/origin", cwd=self.work).stdout,
            "前提が崩れている: 兄弟ブランチの remote ref が作られていない",
        )
        self.assertEqual(self.diff_range(), "origin/epic-317...HEAD")

    def test_fork_point_wins_over_remote_default_branch(self) -> None:
        """origin/HEAD が別ブランチ（main）を指していても、実際の分岐元を選ぶ。

        修正前は origin/HEAD 決め打ちで `origin/main...HEAD` になり、develop に
        マージ済みのコミットがレビュー対象へ混入していた。
        """
        self.commit("a.txt")
        git("branch", "main", cwd=self.work)
        git("push", "origin", "main", cwd=self.work)
        self.set_origin_head("main")
        self.commit("develop-1.txt")
        git("push", "origin", "develop", cwd=self.work)

        self.new_branch("fix/35-from-develop")
        self.commit("work-1.txt")

        self.assertEqual(self.diff_range(), "origin/develop...HEAD")

    def test_explicit_upstream_still_takes_precedence(self) -> None:
        """優先順位 1（`@{upstream}`）を新しい 3 が食わないことを固定する。"""
        self.build_develop()
        self.build_epic()
        self.new_branch("fix/36-tracked")
        self.commit("work-1.txt")
        git("branch", "--set-upstream-to=origin/develop", cwd=self.work)

        self.assertEqual(self.diff_range(), "origin/develop..HEAD")


class FallbackTest(DiffRangeTestBase):
    def test_no_remote_refs_falls_through_to_none(self) -> None:
        """受け入れ条件 5: remote ref が無い環境（clone/init 直後）でも落ちずに None。"""
        self.commit("a.txt")
        self.new_branch("fix/37-nothing-fetched")
        self.commit("work-1.txt")

        self.assertIsNone(self.diff_range())

    def test_only_work_branch_refs_falls_through_to_none(self) -> None:
        """候補が作業ブランチだけなら 3 は成立せず、従来のフォールバック経路へ落ちる。

        origin/HEAD 未設定・origin/develop 無しなので最終的に None（早期 exit）になる。
        """
        self.commit("a.txt")
        git("push", "origin", "HEAD:refs/heads/fix/99-sibling", cwd=self.work)
        git("fetch", "origin", cwd=self.work)
        self.new_branch("fix/38-only-siblings")
        self.commit("work-1.txt")

        self.assertIsNone(self.diff_range())

    def test_unrelated_history_falls_through_to_remote_default_branch(self) -> None:
        """merge-base が取れない候補しか無い場合は従来の 4（origin/HEAD）へ落ちる。

        orphan ブランチは origin/develop と共通祖先を持たないため 3 は候補を選べない。
        fail-open の挙動（従来のフォールバックへ素通り）を変えていないことを固定する。
        """
        self.build_develop()
        git("checkout", "--orphan", "fix/39-orphan", cwd=self.work)
        git("rm", "-rf", "--cached", ".", cwd=self.work)
        for stale in ("a.txt", "b.txt"):
            (self.work / stale).unlink()
        self.commit("orphan-1.txt")

        self.assertEqual(self.diff_range(), "origin/develop...HEAD")


if __name__ == "__main__":
    unittest.main()
