# Handoff（引き渡し・整理）

Figma 成果物を「人間／FE（フロントエンジニア）に渡せる状態」に整えるためのルール。デザイン完成前の最終整理と、引き渡しチェックに使う。

## 完成前の整理（Cleanup）

AI エージェントが生成・修正したあとに、誤認識のもとになる不要物を必ず片付ける。

片付け対象：

- 未使用 Layer / 非表示 Layer / Temp Frame
- 古い Variant / 未使用 Component / Detach された Instance
- 未使用 Variable / 未使用 Style

残してはいけない：

- Temp / Backup / Hidden UI の放置
- 古い Variant / Deprecated Component の放置

## ページの整理

Production（本番対象）と、作業途中・アーカイブを混在させない。ページは**役割ベース**で構成し、命名は `naming-conventions.md`「Page Naming」に従う（案件に既存構成があればそれと整合）。

| 役割               | 内容                                     | ページ名の例                   |
| ------------------ | ---------------------------------------- | ------------------------------ |
| Wireframe          | WF 正本（グレースケール）                | `01_Wireframe` / `Wireframe`   |
| **Design（本番）** | **実装対象の完成デザイン＝引き渡し対象** | `02_Design` / `Pages`          |
| Components         | Design 用 Component                      | `03_Components` / `Components` |
| Flow（任意）       | 画面遷移図・全体構造                     | `00_Flow` / `Flow`             |
| Cover（任意）      | 一覧での識別                             | `00_Cover` / `Cover`           |
| Review             | レビュー・比較                           | `Review`                       |
| Archive            | 旧 UI・退避                              | `Archive` / `99_Archive`       |

※ Token / Variables は Figma Variables ／ `tokens-and-scales.md` で管理（`Design Tokens` ページは任意）。**引き渡し対象は Design（本番）ページ**であることを明記する。

## Annotation（注釈）

実装に必要な補足は、UI 上に直書きせず Figma の Annotation で付ける。

- UI テキストと仕様を分離する
- 該当 UI に紐づける
- カテゴリ：Interaction / Responsive / Development / Accessibility
- Prefix を統一する：`Hover:` `Pressed:` `Sticky:` `Breakpoint:` `Transition:` `Accessibility:`
- 実装に必要な内容だけ書く（長文仕様書・感覚的表現・推測仕様を書かない）

## 引き渡しチェックリスト

### Structure

- Auto Layout 確認／不要 Wrapper 削除／Layer 名確認／レスポンシブ確認

### Design System

- Component / Variant / Property / Variable / Style の整理

### Documentation

- Annotation 最新化／Archive 整理／Active UI のみ残す

## FE に渡す情報

引き渡し資料（`docs/internal/design/06-handoff.md`）に次を含める。

- 実装対象画面
- Component 候補
- 状態・エラー一覧
- 権限差分
- 未確定事項 / Backlog
- FE からの指摘・次回改善点

### 未確定事項 / Backlog の書き方

未確定・残件は「メモ」で終わらせず、**次に誰が何を確認すれば閉じるか**が分かる形で残す。1 件ごとに次を明記する（`self-review.md` の Remaining Risks が監査時の残リスクなのに対し、ここは**引き渡し先＝FE / PM / 顧客向けの残件書式**）。

- **状態**：以下を**混在させず1つ**選ぶ
  - Closed（対応済／対応不要として閉じたもの。**Backlog には原則残さず**、経緯として必要な場合のみ記録）
  - Deferred（今回見送り）
  - Review（人・PM・顧客の判断待ち）
  - Out of Scope（対象外）
- **内容**：何が未確定／残っているか（1 行）
- **理由**：なぜ今回やらない／確定できないか
- **再確認条件**：いつ・何が揃えば再検討するか（例：正式案件で／該当機能の実装前に）
- **判断先**：誰が決めるか（FE／PM／顧客／デザイン）

状態の分類語は、質問・レビューの分類（`design-readiness-check.md`「質問の分類と終了条件」）と揃える。
