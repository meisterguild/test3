# 工程③ ワイヤーフレーム

> `/design-ui` の工程③。ここには詳細手順のみを記載する。順序・CP・共通前提は `../SKILL.md` を参照。

1. `../templates/wireframe-spec-template.md` に従い、WF 仕様を `docs/internal/design/03-wireframe-spec.md` に作成する。
2. Figma にワイヤーフレームを生成する（`../rules/wireframe.md` `../rules/ui-ux-principles.md` `../rules/quality.md` `../rules/structure.md` `../rules/naming-conventions.md` `../rules/tokens-and-scales.md`、必要に応じて `../rules/patterns.md` を適用）。
   - 繰り返し使う UI 要素（ボタン／入力／ドロップダウン／選択コントロール 等）は**コンポーネント化**し、状態は Variant で持つ（`../rules/structure.md`「Component」参照）。サイズ・スタイルのドリフトを防ぐ。
3. メインとは別に起動したレビュー用エージェントが `../rules/self-review.md` で監査し、結果を `docs/internal/design/05-review/` に出力する。修正はメインのエージェントが行う。

→ **★CP2：人間確認（画面構成・導線が妥当か）**
