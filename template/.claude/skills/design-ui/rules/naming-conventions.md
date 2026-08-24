# Naming Conventions

Figma 内の命名規則をまとめる。対象は Layer / Component / Property / Variant / Variable / Style / Icon / Page / Annotation のすべて。ノードや Variable に名前を付ける前にこのファイルを参照する。

## 基本原則

- 英語のみで命名する（English Only）。日本語と英語の混在は禁止（例：Property に `Type` / `Size` / `アイコン` が並ぶ状態は不可）
- 単数形で統一する
- 命名は意味（Role）ベースで行う。見た目・位置・装飾情報を名前に入れない
- `/` で階層化する
- PascalCase を使用する
- Component Naming は Role Based + PascalCase で統一する
- Internal Layer Naming は Prefix + Role で統一する
- 実文言（表示テキストそのもの）を Layer 名に使用しない

## Reserved Name（禁止名）

以下を含む名前は Critical 違反として必ず修正する。

- `Frame` / `Group` / `Rectangle`（自動命名の放置）
- `Copy` / `Temp` / `Final`
- `Wrapper` / `Inner` / `Box` / `Area`（責務不明レイヤー名）

## Layer Naming

### Prefix

| Prefix       | 用途                                                    |
| ------------ | ------------------------------------------------------- |
| `Txt/`       | テキスト                                                |
| `Img/`       | 画像                                                    |
| `Icon/`      | アイコン                                                |
| `Btn/`       | ボタン                                                  |
| `Card/`      | カード                                                  |
| `Section/`   | UI 責務単位のセクション                                 |
| `Container/` | Layout 責務（Width / Padding / Alignment / Responsive） |
| `Content/`   | 実コンテンツ・Auto Layout・Alignment                    |
| `Layout/`    | レイアウト責務レイヤー                                  |

### Preferred Layer 名

- `Btn/Primary`
- `Txt/Heading`
- `Txt/Description`
- `Img/Hero`
- `Card/Product`

### Text Layer

意味責務単位で分割し、役割で命名する。

- `Txt/Title`
- `Txt/Label`
- `Txt/Description`
- `Txt/Caption`
- `Txt/Question`
- `Txt/Answer`

### Image Layer

- `Img/Thumbnail`
- `Img/Hero`
- `Img/Avatar`
- `Img/Banner`

### Avoid Layer 名

- `Frame 123` / `Group 456` / `Rectangle 789`
- `BigBlueButton`・`RedButton`（見た目依存）
- `TopHeroText`・`LeftText`（位置依存）
- `BigCard`（装飾情報混在）
- 複数責務混在 Naming

## Component Naming

Role Based + PascalCase。UI 責務単位で命名し、Semantic 責務を優先する。

### Preferred Component 名

- `Button/Filled`
- `Button/Outlined`
- `Button/Primary`
- `Input/Text`
- `Card/Product`
- `FAQ/Item`
- `Header/Global`
- `Navigation/Primary`
- `Navigation/Header`
- `Modal/Confirm`

### Avoid Component 名

- `Btn`（略語単体）・`MainButton`・`PrimaryCTA`
- `Card1`・`Component1`・`Component2`（連番）
- `MobileButton`・`DesktopCard`（デバイス依存）
- `BigButton`・`SmallCard`・`BlueButton`・`LargeCard`（見た目依存）
- `TempComponent`・`FinalButton`

## Variant / Property Naming

Variant Property は責務単位で命名し、State / Type / Size / Theme を分離する。

### Preferred Property 名

- `Type` / `State` / `Size` / `Theme` / `Breakpoint`
- `Icon` / `Label` / `Status` / `Direction`

### Preferred Value

- `Primary` / `Secondary`
- `Hover` / `Disabled`
- `Large` / `Small`
- `Light` / `Dark`
- `Desktop` / `Mobile`

### Avoid Variant / Property 名

- `Variant1`・`DesktopVersion`・`BigButton`・`FinalState`
- 日本語 Property 名

## Variable Naming

Role Based + PascalCase、意味ベースで統一する。Small / Medium Project では過剰 namespace を避ける（namespace は Large Scale / Enterprise / Multi Brand のみ許可）。

### カテゴリ

`Color` / `Typography` / `Font` / `Spacing` / `Shape` / `Elevation` / `Motion` / `Opacity`

### Color

- `Color/Primary`・`Color/OnPrimary`
- `Color/Surface`・`Color/OnSurface`
- `Color/Background`
- `Color/Outline`
- `Color/Error`・`Color/Success`・`Color/Warning`

Semantic Role を細分化する場合は次のように命名する。

- `Color/Text/Primary`
- `Color/Surface/Base`
- `Color/Border/Subtle`

### Font

- `Font/JP`・`Font/EN`・`Font/Mono`

### Spacing

- `Spacing/XS`〜`Spacing/XL`、または `Space/4`・`Space/8`・`Space/16`・`Space/24`

### Shape

- `Shape/None`・`Shape/XS`・`Shape/S`・`Shape/M`・`Shape/L`・`Shape/XL`・`Shape/Full`

### Elevation

- `Elevation/Level1`・`Elevation/Level2`・`Elevation/Level3`

### Motion

- `Motion/Fast`・`Motion/Normal`・`Motion/Slow`

### Typography（Variables）

- `Type/Heading/L`・`Type/Heading/M`
- `Type/Body/L`・`Type/Body/M`
- `Type/Caption/S`

### Forbidden

- `MainColor`・`ButtonBlue`・`CardBlue`・`HeroBlue`・`DarkBlue`（Visual / Component 依存）
- `Blue500`・`HeroRed`・`CTA/Red`（Visual 依存・Component 専用）
- `BigRadius`・`LargeSpacing`
- `HeroPadding`・`CardSpacing`・`ButtonGap`（UI 固有 Spacing）
- `color.primary` と `Color/Primary` の混在（記法揺れ）
- `sys` などの namespace 乱用

## Style Naming

### Text Style（Role × Scale）

Role: `Display` / `Headline` / `Title` / `Body` / `Label` × Scale: `Large` / `Medium` / `Small`

- `Display/Large`・`Display/Medium`・`Display/Small`
- `Headline/Large`・`Headline/Medium`・`Headline/Small`
- `Title/Large`・`Title/Medium`・`Title/Small`
- `Body/Large`・`Body/Medium`・`Body/Small`
- `Label/Large`・`Label/Medium`・`Label/Small`

### Semantic Color Style（必要時のみ）

- `Text/Primary`・`Text/Secondary`
- `Surface/Primary`・`Surface/Base`
- `Border/Default`・`Border/Subtle`

### Avoid Style 名

- `HeroTitleStyle`・`CardTitleStyle`・`CardBodyStyle`・`PageTitleStyle`・`HeroTextStyle`（UI / Page 固有 Style）
- `Hero/Text`・`Card/Title`（Component 専用 Semantic Style）
- `HeroTitle`・`FAQTitle`・`CardText`・`SpecialText`（用途別 Typography 乱立）

## Icon Naming

案件で指定した Icon Library（既定は Material Symbols の Outlined）を Component 管理する。

- `Icon/Search`
- `Icon/Menu`
- `Icon/ArrowRight`

## Page Naming

ページは**役割ベース**で構成する。ページ名そのものより「役割が明確で、正本がどれか分かる」ことを優先する。案件に既存のページ構成がある場合は**既存構成との整合を優先**する（無理に固定名へ改名しない）。

### 役割（必須）

- **Wireframe（WF 正本）**：情報構造・導線・状態の正。原則グレースケール。例名：`01_Wireframe` / `Wireframe`
- **Design（実装対象デザイン）**：FE 引き渡し対象の完成デザイン。例名：`02_Design` / `Pages` / `Design`
- **Components（Design 用 Component）**：WF 部品を複製し Token を適用したもの。例名：`03_Components` / `Components`

### 役割（任意）

- **Cover**：Figma 一覧での識別用。例名：`00_Cover` / `Cover`
- **Flow**：画面遷移図・全体構造の確認用。例名：`00_Flow` / `Flow`
- **Design Tokens**：必要な場合のみ（Variables の説明・一覧）。※Token / Variables の正は Figma Variables ＋ `tokens-and-scales.md`
- **Review**：レビュー・比較用　／　**Archive**：旧 UI・退避

### 推奨ページ名の例

- AI 駆動で新規作成：`00_Cover`(任意) ／ `00_Flow`(任意) ／ `01_Wireframe` ／ `02_Design` ／ `03_Components` ／ `Review` ／ `Archive`
- 既存制作案件に合わせる：`Cover` ／ `Design Tokens` ／ `Components` ／ `Pages` ／ `Review` ／ `Archive`

### ルール・禁止

- どのページが **WF 正本／実装対象デザイン／Component か**を、ページ名または補足で明確にする。
- **Design 用ページと Components ページは分離**する。**WF 正本の Main Component を直接デザイン化しない**（複製側で作る）。
- 役割が曖昧・重複するページ、`Final` / `Copy` / `New` / `Draft` などの曖昧名は禁止。

## Annotation Prefix

Annotation は種類と Prefix を統一する。カテゴリは Interaction / Responsive / Development / Motion / Accessibility。

- `Hover:`
- `Pressed:`
- `Sticky:`
- `Breakpoint:`
- `Transition:`
- `Scroll:`
- `Animation:`
- `Accessibility:`
