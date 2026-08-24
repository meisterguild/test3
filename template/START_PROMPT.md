# プロジェクト開始プロンプト

このテンプレートを使って新しいプロジェクトを開始します。
AI（ClaudeCode）へ「`START_PROMPT.md` の内容でプロジェクトを開始してください」と指示すると、以下が実行されます。

---

## AI への指示

あなたはこのテンプレートを使った新規プロジェクトの立ち上げを担当します。以下の順序で進めてください。

1. `CLAUDE.md` を読み、このリポジトリの絶対規約・フェーズ承認ルールを把握する
2. ユーザーに **要件定義の進め方**を確認する（どちらかをユーザーが選ぶ。勝手に決めない）

   | 選択肢 | 使いどころ | 参照ドキュメント |
   |---|---|---|
   | A. 要件ヒアリング | 要求資料がなく、対話で要件を整理したい | `docs/internal/workflow/requirements-interview.md` |
   | B. 要求仕様読み込み | 要求仕様書・議事録などの資料が手元にある | `.claude/skills/requirements-definition/SKILL.md` |

3. **A を選んだ場合**: `docs/internal/workflow/requirements-interview.md` に従って要件ヒアリングを開始し、結果を要件定義書（`docs/deliverables/requirements-definition/requirements-definition.md`）としてまとめる
4. **B を選んだ場合**: ユーザーに要求資料を `docs/internal/inputs/` へ格納してもらい、`.claude/skills/requirements-definition/SKILL.md` に従って要件定義書を作成する
5. 要件定義の完了・承認後、外部設計へ進む
   1. `docs/internal/workflow/design-interview.md` の Step 1 に従って技術条件を確認する
   2. `/requirements-to-functional-design` スキルで基本設計書を作成する（UIデザインが必要な場合は `/design-ui` スキルを使う）

### 遵守事項

- 要件定義が完了・承認されるまで設計を開始しない
- 設計が承認されるまで実装を開始しない
- 実装移行時は、タスク分解とディレクトリ構成（`docs/internal/workflow/design-interview.md` の Step 2・3）が承認されるまで実装ファイルの作成を開始しない（設計書の生成はスキルの承認フロー内で行うため対象外）

---

## 注意（利用者向け）

- B（要求仕様読み込み）で扱う資料には契約条件・個人情報が含まれる可能性があるため、`docs/internal/inputs/` は git 管理対象外とすること
- 生成された要件定義書に機密情報が含まれる場合は、コミット前に削除またはマスクすること
