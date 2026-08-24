# Tokens and Scales

スケール規律の普遍原則と、プロジェクト固有スケールの解決手順、フォールバック用デフォルトスケールをまとめる。Variable 作成・値の適用・レスポンシブ設計の前にこのファイルを参照する。

このファイルの大原則は1つ：**スケール外の値を推測で作らないこと**。どのプロジェクトでも、値そのものではなく「定義済みスケールだけを使う」という規律が品質を支える。

## スケールの解決手順（作業前に必ず実行）

具体的なスケール値はプロジェクトごとに異なる。次の優先順位で解決し、上位が存在する場合に下位の値を持ち込まない。

1. 編集対象の Figma ファイルに既存の Variables / Styles がある場合は、それを Source of Truth とする。`get_variable_defs` / `search_design_system` で既存トークンを取得してから作業する。既存スケールと矛盾する値・重複トークンを新規作成しない。
2. ユーザーまたはプロジェクトがトークン定義を指定している場合は、それに従って Variables を構築する。コードベースの design tokens、スタイルガイド、プロジェクトドキュメントによる指定などが該当する。
3. どちらも存在しない場合のみ、後述のデフォルトスケールで新規作成する。デフォルトを採用したことを作業報告に含め、ユーザーが差し替えられるようにする。

一度スケールが決まったら、以降の編集ではファイル内の Variables が唯一の正であり、このファイルのデフォルト値を参照し直さない。

## 普遍原則（プロジェクト非依存）

### Spacing

- 少数の固定スケールで管理し、System 責務として一元化する。Component 単位・画面単位の Spacing Token は作らない
- Padding / Gap は Spacing Variables を使用する。余白への直接数値入力は禁止
- スケール外の中途半端な値（スケールが 8px 基準なら 13px / 19px など）を推測で作らない

### Shape（Radius）

- 固定スケールで管理する。Component ごとの独自 Radius、スケール外の値は禁止

### Typography

- Role × Scale の2軸で体系化する（Role は `Display` / `Headline` / `Title` / `Body` / `Label` など）。Scale は `Large` / `Medium` / `Small` の3段階が代表例
- タイポ階層は 3〜4 段階以内に抑える
- Typography Variables（Typescale）を Text Style が参照し、UI へは Text Style で適用する
- Responsive Typography は Variable Mode で管理する
- font-size / line-height の直接指定、推測 font-size は禁止
- Hero / Campaign / Branding Typography は必要時のみ Optional として許可

### Color

- Visual 情報（Blue / Red など）ではなく Role 責務（Primary / Surface / Error など）で管理する。Color Variable を Source of Truth とする
- 背景色 Role には対になる On Color（`OnPrimary` / `OnSurface` など）を揃える
- Brand 表現が必要な場合のみ `Brand/*` 系を別途許可する
- 将来 Theme 切替可能な設計を推奨する。ただし Dark Mode 完全前提・Theme 数増加前提の複雑設計は避ける

### Elevation

- 少数の Level で段階管理する。Effect Style が Elevation Variables を参照し、UI へは Effect Style で適用する
- Shadow の直接生成は禁止

### Motion

- Duration / Easing は少数のトークンに限定する。任意 Duration・任意 Easing（complex cubic-bezier）・常時 Animation・Component ごとの独自 Motion は禁止
- Motion は必要最小限にする

### Icon

- プロジェクトで指定された単一の Icon Library・単一の Style に統一する。Mixed Icon Style・Image 化 Icon・独自生成 Icon は禁止（例外は GitHub / LINE / YouTube などの Brand Icon のみ）
- Icon は Figma Component で管理し、Variants で方向・種類を管理する
- サイズは固定スケールで管理する。Frame 内で中央揃え、サイズ / 座標は整数（小数点座標は禁止）
- Export は Frame 単位（Vector 単体 Export は禁止）、SVG の不要 Group は削除する

### Breakpoint / Grid

- Breakpoint はプロジェクトで定義された値に従い、デバイスごとの Column 数とセットで管理する
- Grid は Layout Grid Style で管理し、Breakpoint / Layout 状態に紐づける

## デフォルトスケール（フォールバック）

既存の Variables とプロジェクト指定のどちらも無い場合の初期値。新規ファイル立ち上げ時にこの値で Variables を構築し、以降はファイル内の Variables を正とする。

### デフォルト：Breakpoint / Grid

| Device  | Breakpoint | Grid       |
| ------- | ---------- | ---------- |
| Mobile  | 390px      | 4 Columns  |
| Tablet  | 768px      | 8 Columns  |
| Desktop | 1440px     | 12 Columns |

### デフォルト：Spacing（8px Grid 基準）

```text
0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96
```

Variable 名は `Spacing/XS`〜`XL` または `Space/4` 系（naming-conventions.md 参照）。

### デフォルト：Shape（Radius）

| Token        | 値  |
| ------------ | --- |
| `Shape/None` | 0   |
| `Shape/XS`   | 2   |
| `Shape/S`    | 4   |
| `Shape/M`    | 8   |
| `Shape/L`    | 12  |
| `Shape/XL`   | 16  |
| `Shape/Full` | 999 |

### デフォルト：Color Role

- Core Role: `Primary` / `Secondary` / `Surface` / `Background` / `Outline` / `Error` / `Success` / `Warning`
- On Color: `OnPrimary` / `OnSecondary` / `OnSurface` / `OnBackground` / `OnError`

> ニュートラルの選び方：無彩色グレーが基本。業務系などでは **warm ニュートラル**（やや暖色寄りのグレー＋オフホワイト背景。例：背景 `#faf9f5` 前後）が馴染む場合もある。どちらを採るかは案件ごとにデザイン工程で決める。

### デフォルト：Font Category

`Font/JP` / `Font/EN` / `Font/Mono`

### デフォルト：Elevation

`Elevation/Level1` / `Elevation/Level2` / `Elevation/Level3`

### デフォルト：Motion

| 項目     | 値                                                       |
| -------- | -------------------------------------------------------- |
| Duration | 100ms / 200ms / 300ms                                    |
| Easing   | ease-out                                                 |
| Category | Hover / Focus / Transition / Scroll / Modal / Navigation |

### デフォルト：Icon

| 項目    | 値                |
| ------- | ----------------- |
| Library | Material Symbols  |
| Style   | Outlined          |
| Size    | 16 / 20 / 24 / 32 |

## Variables / Styles / Components の適用ルール

プロジェクトを問わず固定の責務分離。

| 構造       | 責務                                                                               |
| ---------- | ---------------------------------------------------------------------------------- |
| Variables  | Token 管理 / Theme 管理 / Breakpoint 管理 / Semantic Value 管理（Source of Truth） |
| Styles     | Typography 適用 / Color 適用補助 / Elevation 適用 / Grid 適用                      |
| Components | 実 UI 構造 / 状態管理 / Interaction / Responsive Layout                            |

適用経路は次のとおり固定する。

| 対象             | 適用方法                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Color            | Variables を**直接**適用（必要時のみ補助的に Semantic Color Style。その Style も Variables を参照） |
| Typography       | Text Style 経由（Text Style が Typography Variables を参照）                                        |
| Elevation        | Effect Style 経由（Effect Style が Elevation Variables を参照）                                     |
| Grid             | Layout Grid Style（Breakpoint / Layout 状態に紐づけ）                                               |
| Spacing / Radius | Variables を Auto Layout / Component に適用                                                         |

- 再利用責務がある Style のみ生成する。Component 専用 Style・画面専用 Style・微差だけの Style 乱立は禁止
- Variables へ UI 責務を持たせない。Components へ Token 責務を持たせない

### 既存の成果物へトークンを一括適用するときの運用注意

WF / 既存デザインへ後からトークンを当てる場合（例：グレースケール → 配色化）の進め方。

- **役割名・既存の値・構造を手がかりに適用する**：レイヤーの役割名（naming-conventions の `Txt/役割` 等）や既存の色・サイズから**対応するトークン候補を判定し、確度が高い範囲で一括適用する**。前提として **WF / 仕様・命名が整っていること**（命名が曖昧だと誤適用する）。
- **推測でトークンを当てない**：役割・対応が読み取れない箇所は当てず、確認事項として残す（大原則「スケール外の値を推測で作らない」と同じ精神）。
- **一括適用後は全体整合を確認する**：代表画面だけでなく、波及した全体（他画面・状態・オーバーレイ等）を見直す（`self-review.md`「一括変更後の整合性チェック」参照）。
- **非破壊で適用する**：共有コンポーネント／変数の直接改変は影響範囲が広い。作業は影響範囲を絞って行う（`../SKILL.md`「注意事項」参照）。

## Variable Mode

- Mode は Theme / Density / System 責務単位で分離する（例：`Light` / `Dark`、`Compact` / `Comfortable`）
- Component 専用 Mode・UI 単位 Mode・UI 都合だけの Mode 増殖は禁止
- State 責務と Theme 責務を混在させない
- Production 責務と Archive 責務を分離する

| 構造          | 責務                |
| ------------- | ------------------- |
| Variable Mode | Theme / System 責務 |
| Variant       | Component 構造責務  |
| Variables     | Token               |
| Component     | 実 UI               |
