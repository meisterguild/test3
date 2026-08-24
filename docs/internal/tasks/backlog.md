# Task Backlog

作業計画の詳細（根拠 ID・依存関係・DoD）は [issue-plan.md](./issue-plan.md) を参照。

| ID  | Task | Feature | Priority | Status |
| --- | ---- | ------- | -------- | ------ |
| T-01 | プロジェクト基盤の構築（Vite + TypeScript + Vitest + Playwright） | 基盤 | high | [#2](https://github.com/meisterguild/test3/issues/2) open（未 queue） |
| T-02 | ゲームコアルールの仕様策定 | 仕様 | high | [#3](https://github.com/meisterguild/test3/issues/3) open（未 queue） |
| T-03 | 果物定義・スコア・合体解決のコアロジック実装 | コアロジック | high | [#4](https://github.com/meisterguild/test3/issues/4) open（blocked by #2, #3） |
| T-04 | 物理シミュレーションと Canvas 描画の基盤 | 物理・描画 | high | [#5](https://github.com/meisterguild/test3/issues/5) open（blocked by #2） |
| T-05 | 落下操作とドロップ制御 | 操作 | high | [#6](https://github.com/meisterguild/test3/issues/6) open（blocked by #5） |
| T-06 | 同種果物の合体処理の組み込み | コアロジック | high | [#7](https://github.com/meisterguild/test3/issues/7) open（blocked by #4, #6） |
| T-07 | スコア表示・ハイスコア永続化・HUD | UI | medium | [#8](https://github.com/meisterguild/test3/issues/8) open（blocked by #7） |
| T-08 | ゲームオーバー判定・モーダル・リスタート / ポーズ | UI | medium | [#9](https://github.com/meisterguild/test3/issues/9) open（blocked by #7） |
| T-09 | 効果音とミュート切替 | 演出 | low | [#10](https://github.com/meisterguild/test3/issues/10) open（blocked by #9） |
| T-10 | レスポンシブ / タッチ最適化 | UI | medium | [#11](https://github.com/meisterguild/test3/issues/11) open（blocked by #6） |
| T-11 | E2E テストシナリオの整備（Playwright） | 品質 | medium | [#12](https://github.com/meisterguild/test3/issues/12) open（blocked by #9） |
| T-12 | GitHub Pages への静的デプロイ | 配信 | medium | [#13](https://github.com/meisterguild/test3/issues/13) open（blocked by #2） |

- 「未 queue」= `status:queued` ラベル未付与。auto-pr-loop の実装 daemon はまだこれらを拾わない。
  計画に合意後の queue 手順は [issue-plan.md](./issue-plan.md) の「起票後の運用」を参照。
