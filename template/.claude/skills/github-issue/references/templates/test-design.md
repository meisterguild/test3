## 対象 spec
<docs/specs/<area>-<feature>.md — 必須。複数なら列挙>

## 概要
<このテスト設計で何を成果物として出すか 1-2 行>

## AC / R 抽出 ToDo
spec から拾うべき振る舞いの一覧。`<spec-name>:AC-N` / `<spec-name>:R-N` の ID を確定させる。

- [ ] AC-1: 
- [ ] R-1: 

## Latent Risks
spec に書かれていない潜在的リスク・エッジケース。空欄なら人間にヒアリングしてから雛形に進める。

- 

## テスト雛形 ToDo
`it.todo("[<spec>:AC-N] ...")` で placeholder を作る対象。後続 PR で `it` に置き換える。

- [ ] `<test-file-path>` に AC / R 分の `it.todo` を作成

## 完了条件
- [ ] AC / R が spec 側で確定している
- [ ] 各 AC / R に対応する `it.todo()` がコミットされている
- [ ] CI の spec ↔ test ID 突合が通る

## 関連
<関連 issue / PR / spec>
