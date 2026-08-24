# Structure（構造ルール）

Figma で UI を組み立てるときの構造ルールをまとめる。レイヤーを作る・Auto Layout を組む・Component 化する前にこのファイルを参照する。

このファイルの大原則は1つ：**AI エージェントが後から読み直したときに、構造や責務を推測しなくてよい状態を保つこと**。レイヤーが増えるほど、責務が曖昧なほど、AI の誤認識リスクが上がる。だから常に「最小構造 + 明確な責務」を優先する。

## 優先順位

構造判断で迷ったらこの順で優先する。

1. Auto Layout
2. レスポンシブ
3. 再利用性
4. 保守性
5. AI 再読込性
6. デザイン表現

## 大原則

- AI が推測しなくてよい構造・命名を優先する
- 最小構造を優先する。不要な Layer / Wrapper / Frame / Style / Variant / Component を作らない
- Figma Native 構造を優先する。HTML / DOM 構造をそのまま Figma レイヤーに再現しない
- 実装（コード）は参考にするが、`div` / `section` / `span` などの HTML タグをレイヤー化しない
- レイヤー順は表示順と一致させる
- 余白は Padding / Gap で管理する（空 Frame や手動スペースで調整しない）

## レイヤー責務（Layer Responsibility）

レイヤーは次のいずれかの責務を持つ場合のみ作る。責務を説明できないレイヤーは作らない。

- Layout（レイアウト）
- Content / Visual（コンテンツ・見た目）
- Interaction（操作・状態）
- Export（書き出し対象）
- Responsive（レスポンシブ）
- State（状態）

### 作ってはいけないレイヤー

- 意味のない Wrapper、Text だけを包む Frame、1要素だけの Auto Layout
- 非表示レイヤーによる状態切替
- 「将来使うかもしれない」だけのレイヤー・空レイヤー
- HTML 再現目的のレイヤー（Link / Div / Span ラッパー）

> 禁止レイヤー名（`Wrapper` / `Inner` / `Box` / `Frame` / `Group` など）は naming-conventions.md を参照。

## Auto Layout

- 通常の UI 構造は Auto Layout で組む（Frame ではなく Auto Layout が基本）
- **Group は使わない**（一時的な整理用途のみ。レイアウト管理には使わない）
- Hug / Fill を使う。Fixed Width 依存・Absolute 配置依存にしない
- Padding / Gap で余白を管理し、値は Spacing トークンを使う（tokens-and-scales.md）
- ネストは Layout 責務がある場合のみ。Gap だけ・Padding だけの Wrapper 連鎖を作らない
- 画像も Auto Layout に含める

## Frame の使いどころ

Frame は次の「責務がある時だけ」使う。それ以外は Auto Layout を使う。

- 画像（Frame + Fill Image）
- Page Root
- Export 対象
- Hover / Click 領域 / 背景 / Border など視覚状態が必要な箇所
- 特殊なクリップ表現

## Section / Container / Content の階層

ページやセクションは責務を分けて構造化する。HTML の `section` タグの模倣ではなく、UI 責務単位で設計する。

| 構造      | 責務                                     |
| --------- | ---------------------------------------- |
| Section   | ページ / セクション / UI 責務単位        |
| Container | Width / Padding / Alignment / Responsive |
| Content   | Auto Layout / Gap / 実コンテンツ         |

- `TopSection` / `MiddleSection` のような位置依存名は使わない（naming-conventions.md）
- 責務不明の Container、Wrapper だけの Container を作らない

## Component

- 2 回以上使う想定があり、UI 責務が明確なものを Component 化する
- **WF 段階でも**、繰り返し使う UI 要素（ボタン／入力／ドロップダウン／選択コントロール 等）はコンポーネント化する。独立コピーのまま量産するとサイズ・スタイルが少しずつズレる（ドリフト）ため。コンポーネント化すれば変更が 1 箇所で全反映でき、02_Design へはトークンを当てるだけで昇格できる
- **アイコン（矢印・記号を含む）は、WF 段階からフォント文字（←▾›＋ 等）で代用せず、標準アイコンセット（例：Material Symbols）を使ってコンポーネント化する**。理由：フォント文字は太さ・サイズが不揃いで品質感が落ちる／標準セットは認知性が高く実装と一致しやすい／コンポーネント化でドリフト防止・02_Design へそのまま昇格できる。※どのセット（Material Symbols / SF Symbols 等）を使うかはプラットフォームに依存するため案件側（`docs/internal/design/`）で指定する。
- 同一 UI 概念は 1 つの Component Set にまとめる。UI 責務が違う場合のみ別 Component にする
- Auto Layout 前提で作る
- 状態は Variant で管理する（非表示レイヤー切替・Detach 編集はしない）

### Variant と Property の役割分担

- **Variant**：構造・状態・サイズの差分（`Type` / `State` / `Size` / `Theme`）
- **Property**：表示内容の差し替え（Label Text / Has Icon（Boolean）/ Leading・Trailing Icon / Loading Text など）

### 状態（State）

- 必須：Enabled / Hovered / Focused / Pressed / Disabled
- 任意（必要に応じて）：Loading / Error / Success / Warning / ReadOnly / Selected / Unselected / Expanded / Collapsed / Open / Closed / Empty / Skeleton など。対になる状態（Open/Closed・Expanded/Collapsed・Selected/Unselected）は両方を用意して網羅する

### Component の作りすぎを防ぐ

- 1 要素 1 Component、Text だけの Component、再利用予定のない Component を作らない
- Variant 爆発（Boolean / Text Variant の乱立）を避ける
- 巨大 Component・過剰な Atomic 分割を避ける

## レスポンシブ（Responsive）

- レイアウト変化はできる限り Auto Layout で吸収する（Variant 化しない）
- トークン差分（余白・文字サイズ）は Variables / Variable Mode で吸収する
- 構造そのものが変わる場合のみ Responsive Variant を作る
- Breakpoint ごとに全 Variant を固定化する／Device 別 Component を乱立させる、はしない

| 構造        | 責務               |
| ----------- | ------------------ |
| Variant     | 構造差分           |
| Auto Layout | 自然なレスポンシブ |
| Variables   | トークン切替       |

> 対象とする画面幅（Breakpoint）の具体値・範囲は案件ごとに異なるため、案件側（`docs/internal/design/`）で指定する。標準値は tokens-and-scales.md を参照。

## やってはいけない構造（まとめ）

- HTML 完全再現 / HTML タグ由来 Frame
- 意味のない Wrapper / 過剰ネスト / Group によるレイアウト
- Fixed Width 依存 / Absolute 依存 / Mask 依存レイアウト
- 空 Frame による余白調整
- 推測で作った Component / State / Variant
