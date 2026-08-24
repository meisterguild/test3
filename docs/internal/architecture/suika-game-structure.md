# スイカゲーム 実装の契約点

実装 issue を並行して進めても衝突しないように、**issue をまたいで共有される決定事項**をここに集約する。
各実装 issue は本ファイルを読んで前提を揃える。値の変更が必要になった場合は、実装 issue 側で勝手に変えず
本ファイルを更新する PR を出す（真理ソースを 1 箇所に保つ）。

- 要件 ID の定義: [../requirements-definition-draft/suika-game.md](../requirements-definition-draft/suika-game.md)
- ゲームルールの詳細仕様: `docs/specs/game-core-rules.md`（T-02 で新規作成）
- 作業計画: [../tasks/issue-plan.md](../tasks/issue-plan.md)

---

## 1. 技術スタック（決定）

| 領域 | 採用 | 理由 |
| --- | --- | --- |
| ビルド / 開発サーバ | Vite + TypeScript（`strict: true`） | 静的成果物のみを吐ければ十分（NFR-03）。設定量が最小 |
| 描画 | Canvas 2D（フレームワークなし） | 果物は円 + ラベルで表現するため 2D API で足りる（A-04） |
| 物理 | Matter.js | 円剛体の積み上げ・衝突イベントが標準で揃っており、この種のゲームでの実績が多い |
| 単体テスト | Vitest | Vite と設定を共有できる。ルールは純関数なので DOM 不要（NFR-05） |
| E2E | Playwright | テンプレート同梱の `.playwright/` 設定・`e2e-qa-tester` エージェントと揃える |
| 配信 | GitHub Pages（GitHub Actions） | サーバーレス配信の要件（NFR-03）を満たす最短経路 |

### 棄却した代替案

- **物理エンジン自作**: 円同士の積み上げは反発・沈み込み・スリープ処理の作り込みが重く、MVP のリスクが高い
- **Phaser / PixiJS**: 果物 11 種の円描画にはオーバースペック。バンドルサイズと学習コストに見合わない
- **React / Vue**: 状態は canvas 内に閉じており、HUD も要素数が少ない。仮想 DOM の利点が出ない
- **サーバー導入（ランキング）**: MVP スコープ外（[../product/scope.md](../product/scope.md)）

---

## 2. ディレクトリ構成（Pattern 2: Standard Application）

`docs/internal/architecture/project-structure.md`（テンプレート同梱ガイド）の Pattern 2 を採用する。
括弧内は主担当の task-id。

```text
/
├── index.html
├── package.json
├── vite.config.ts              # Vitest 設定も同居 (T-01)
├── playwright.config.ts        # (T-01)
├── public/
│   └── sounds/                 # 効果音 (T-09)
├── src/
│   ├── main.ts                 # エントリ。DOM 取得 → game 起動 (T-04)
│   ├── style.css               # レイアウト・レスポンシブ (T-04 / T-10)
│   ├── game/
│   │   ├── types.ts            # 共有型 (T-03)
│   │   ├── fruits.ts           # 果物定義テーブル DT-01 (T-03)
│   │   ├── score.ts            # スコア計算 FR-05 (T-03)
│   │   ├── merge.ts            # 合体解決の純関数 FR-03 / FR-04 (T-03)
│   │   ├── spawn.ts            # 次の果物の抽選 FR-08 (T-03)
│   │   ├── constants.ts        # 盤面・物理・タイミング定数 (T-04)
│   │   ├── physics.ts          # Matter.js ラッパ FR-02 (T-04)
│   │   ├── renderer.ts         # Canvas 描画 UI-01 (T-04)
│   │   ├── game.ts             # 状態機械 + ループ + イベント発火 (T-04)
│   │   ├── input.ts            # 入力・クールダウン FR-01 / FR-10 (T-05)
│   │   └── gameover.ts         # デッドライン判定 FR-07 (T-08)
│   ├── ui/
│   │   ├── hud.ts              # スコア / 次の果物 / ミュート UI-01 (T-07)
│   │   └── modal.ts            # ゲームオーバーモーダル UI-02 (T-08)
│   ├── storage/
│   │   └── local-store.ts      # ハイスコア・ミュート永続化 FR-06 / DT-02 (T-07)
│   └── audio/
│       └── sfx.ts              # 効果音 FR-11 (T-09)
├── tests/
│   ├── unit/                   # Vitest (T-03 以降、各 issue が追加)
│   └── e2e/                    # Playwright (T-11)
└── docs/                       # 本ドキュメント群
```

**新しいディレクトリを勝手に増やさない。**追加が必要なら理由を issue に書いてから本ファイルを更新する。

---

## 3. 共有型（`src/game/types.ts`）

T-03 が定義し、以降の issue はこれを import する。**この形を変える変更は本ファイルの更新を伴う。**

```ts
/** 果物の段階。0 = さくらんぼ 〜 10 = スイカ */
export type FruitTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface FruitDef {
  tier: FruitTier;
  /** 日本語表示名（HUD / a11y ラベルに使う） */
  label: string;
  /** 論理座標系での半径 (px) */
  radius: number;
  /** 塗り色 (CSS カラー) */
  color: string;
}

export type GameStatus = 'ready' | 'playing' | 'paused' | 'over';

/** 合体判定の結果。物理エンジンに依存しない純粋な値 */
export type MergeResult =
  | { kind: 'none' }
  | { kind: 'promote'; tier: FruitTier; score: number }
  | { kind: 'annihilate'; score: number };
```

---

## 4. 果物定義テーブル（DT-01）

`src/game/fruits.ts` に `FRUITS: readonly FruitDef[]`（index === tier）として持つ。
半径は「論理座標系（§5）」の値。

| tier | label | radius | color |
| --- | --- | --- | --- |
| 0 | さくらんぼ | 14 | `#d63c3c` |
| 1 | いちご | 19 | `#e8556d` |
| 2 | ぶどう | 25 | `#8e5fb0` |
| 3 | デコポン | 31 | `#f2a03d` |
| 4 | かき | 38 | `#e8762c` |
| 5 | りんご | 46 | `#d93a3a` |
| 6 | なし | 55 | `#d9d95e` |
| 7 | もも | 64 | `#f2a3b3` |
| 8 | パイナップル | 74 | `#e0c341` |
| 9 | メロン | 85 | `#9ad14b` |
| 10 | スイカ | 98 | `#3f8f4a` |

- 出現対象（FR-08 の抽選範囲）は **tier 0〜4** の 5 種。
- 半径・色の微調整は許容するが、**tier 数（11）と出現範囲（0〜4）は仕様なので変えない**。

---

## 5. 盤面・物理・タイミング定数（`src/game/constants.ts`）

描画は「論理座標系 480×720」で行い、実際の canvas サイズは CSS サイズ × `devicePixelRatio` で
スケールする（R-04 対策）。物理も論理座標系で計算する。

| 定数 | 値 | 意味 |
| --- | --- | --- |
| `STAGE_WIDTH` | 480 | 論理座標系の幅 |
| `STAGE_HEIGHT` | 720 | 論理座標系の高さ |
| `WALL_THICKNESS` | 20 | 壁・床の厚み |
| `CONTAINER_LEFT` | 40 | 容器内側の左端 x |
| `CONTAINER_RIGHT` | 440 | 容器内側の右端 x（内幅 400） |
| `CONTAINER_FLOOR_Y` | 690 | 容器内側の床の y |
| `DEADLINE_Y` | 120 | デッドラインの y（これより上に留まると NG） |
| `DROP_Y` | 60 | ドロップ待機中の果物の y |
| `DROP_COOLDOWN_MS` | 500 | 次のドロップを受け付けない時間（FR-10） |
| `GAMEOVER_GRACE_MS` | 1500 | デッドライン超過が継続してよい時間（FR-07 / R-03） |
| `GRAVITY_Y` | 1.0 | Matter.js の重力 y |
| `RESTITUTION` | 0.15 | 反発係数 |
| `FRICTION` | 0.3 | 摩擦係数 |
| `ENABLE_SLEEPING` | `true` | 静止果物のスリープ（NFR-01 / R-05） |

物理パラメータ（`GRAVITY_Y` 以下）はプレイフィール調整の対象。**必ずここ 1 箇所に集約する**（R-02）。

---

## 6. スコア計算（FR-05）

`src/game/score.ts` の純関数。合体で**生成される果物の tier `t`** から決定論的に決まる。

```
mergeScore(t) = t * (t + 1) / 2      // t = 1..10
```

| 生成される果物 | tier | スコア |
| --- | --- | --- |
| いちご | 1 | 1 |
| ぶどう | 2 | 3 |
| デコポン | 3 | 6 |
| かき | 4 | 10 |
| りんご | 5 | 15 |
| なし | 6 | 21 |
| もも | 7 | 28 |
| パイナップル | 8 | 36 |
| メロン | 9 | 45 |
| スイカ | 10 | 55 |

- **スイカ同士の接触（FR-04）**: 両方消滅し `WATERMELON_ANNIHILATE_SCORE = 100` を加算する。tier 11 は作らない。
- 合体結果は `MergeResult`（§3）で表す。異なる tier どうしの接触は `{ kind: 'none' }`。

---

## 7. モジュール間イベント契約

T-07（HUD）/ T-08（ゲームオーバー）/ T-09（効果音）が互いのファイルを触らずに機能追加できるよう、
`game.ts` は購読型のイベントを公開する。**この名前と payload は契約点**。

| イベント | payload | 発火タイミング |
| --- | --- | --- |
| `drop` | `{ tier: FruitTier }` | 果物がドロップされた直後 |
| `merge` | `{ tier: FruitTier; score: number; x: number; y: number }` | 合体が成立した直後（`x`,`y` は論理座標） |
| `scorechange` | `{ score: number }` | 累計スコアが変化した直後 |
| `statuschange` | `{ status: GameStatus }` | 状態機械が遷移した直後 |
| `gameover` | `{ score: number; highScore: number; isNewHighScore: boolean }` | ゲームオーバー確定時 |

API 形（T-04 が実装）:

```ts
export interface Game {
  on<K extends keyof GameEvents>(event: K, handler: (payload: GameEvents[K]) => void): () => void;
  start(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  readonly status: GameStatus;
}
```

---

## 8. 永続化（FR-06 / DT-02）

`src/storage/local-store.ts` が `localStorage` を隠蔽する。キーは以下に固定する。

| キー | 型 | 既定値 |
| --- | --- | --- |
| `suika.highScore` | 数値の文字列 | `0` |
| `suika.muted` | `"true"` / `"false"` | `false` |

- 読み取りは**必ず例外を飲む**（プライベートモード等で `localStorage` が使えない環境でもゲームが動くこと）。
  パース不能 / 範囲外の値は既定値にフォールバックする（FR-06）。
- 個人情報・識別子は保存しない。

---

## 9. テストの置き場と命名（NFR-04 / NFR-05）

- 単体テスト: `tests/unit/<module>.test.ts`。ルール系（`fruits` / `score` / `merge` / `spawn` / `gameover`）は
  物理エンジンを import せずにテストできること。
- E2E: `tests/e2e/<scenario>.spec.ts`。テスト名の先頭に受け入れ条件 ID を入れる（例:
  `test('[AC-03] 同種果物が合体してスコアが増える', ...)`）。
- 抽選（`spawn`）は乱数源を引数で注入可能にし、テストで固定できること。
- DOM 要素の取得は `data-testid` 属性で行う。主要 testid: `game-canvas` / `score` / `high-score` /
  `next-fruit` / `mute-toggle` / `gameover-modal` / `retry-button`。
