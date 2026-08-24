# 工程④ デザイン

> `/design-ui` の工程④。ここには詳細手順のみを記載する。順序・CP・共通前提は `../SKILL.md` を参照。

1. `../templates/design-spec-template.md` に従い、デザイン仕様を `docs/internal/design/04-design-spec.md` に作成する。
2. **WF 正本を保持したまま**、別ページ（例：`02_Design`）＋別コンポーネント（例：`03_Components`）で**非破壊にデザイン化**する（`../rules/` のルール一式を適用）。
   - 順序：**① Variables / Text Styles（トークン）を整備 → ② WF 部品を複製した Design 用 Component へ紐付け → ③ 各画面へ適用**。
   - **WF 正本の Main Component・WF ページは直接編集しない**（トークン適用は複製側で行う）。※大規模反映時のバックアップ・進め方は `../SKILL.md`「注意事項」を参照。
3. メインとは別に起動したレビュー用エージェントが `../rules/self-review.md` で監査 → メインのエージェントが修正する。
4. `../rules/external-review-guide.md` に従い、外部レビュアー向けのレビュー依頼文（観点 + Figma URL）を用意する。人間がレビューを取得して戻したら、結果を `docs/internal/design/05-review/` に反映する。

→ **★CP3：人間 / FE 確認（実装に渡せる品質か）**
