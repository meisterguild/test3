#!/usr/bin/env node
/**
 * 列挙スケルトン生成（/test-scenario-writer Phase 1・レバー3「列挙をコード化」用）
 *
 * 構造化ソース（xlsx を CSV 化したもの・採番リスト・md/txt など）の
 * 非空行を「1行 = 1ソース単位」として連番付きで出力する。
 * この連番リストが「数え漏れゼロ」の機械的な分母になる
 * （AI が「全部で何項目あるか」を判断・列挙しない）。
 *
 * 使い方（プロジェクトルートで）:
 *   # xlsx は先に同梱の xlsx-to-text.mjs でテキスト化してから渡す
 *   node <skill>/scripts/extract-units.mjs <テキスト化済みソース>... > <slug>.units.tsv
 *
 * 出力（TSV。1行1単位）:
 *   <連番4桁>\t<ファイル>#<元行番号>\t<行内容>
 * 末尾に単位総数を標準エラーへ出す（台帳の処理済み数と突き合わせる分母）。
 *
 * 注意: セル内改行があると1単位が複数行に分割される。xlsx は同梱の
 * xlsx-to-text.mjs（セル内改行を空白に潰す）でテキスト化すれば整形済みになる。
 */
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: extract-units.mjs <textfile>...');
  process.exit(2);
}

let n = 0;
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch (e) {
    console.error(`読み込み失敗: ${f}: ${e.message}`);
    process.exit(1);
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // CSV の空セル由来の連続カンマを除いて空行判定する
    const content = raw.replace(/,+$/, '').replace(/^,+/, '').trim();
    if (!content) continue;
    n += 1;
    console.log(`${String(n).padStart(4, '0')}\t${f}#${i + 1}\t${raw.trim()}`);
  }
}
console.error(`source units: ${n}`);
