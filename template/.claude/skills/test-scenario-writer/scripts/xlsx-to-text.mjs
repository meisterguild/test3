#!/usr/bin/env node
/**
 * xlsx 全シートのテキスト化（/test-scenario-writer Phase 1 用）
 *
 * 全シートを漏れなく CSV 風テキストにする。セル内改行は空白に潰し、
 * 1論理行 = 1物理行 にするので、出力をそのまま extract-units.mjs に渡せる。
 *
 * 使い方（プロジェクトルートで）:
 *   node <skill>/scripts/xlsx-to-text.mjs <xlsxパス>... > <テキスト化出力>.txt
 *
 * xlsx パッケージは実行元プロジェクトの node_modules から解決する。
 */
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(resolve(process.cwd(), 'package.json'));
let XLSX;
try {
  XLSX = require('xlsx');
} catch {
  console.error('xlsx パッケージが見つかりません。プロジェクトに追加してください: npm install -D xlsx');
  process.exit(2);
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('使い方: node xlsx-to-text.mjs <xlsxパス>...');
  process.exit(2);
}

for (const f of files) {
  let wb;
  try {
    wb = XLSX.readFile(f);
  } catch (e) {
    console.error(`読み込み失敗: ${f}: ${e.message}`);
    process.exit(1);
  }
  for (const name of wb.SheetNames) {
    console.log(`=== ${f} : ${name} ===`);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    for (const row of rows) {
      console.log(row.map((c) => String(c).replace(/\r?\n/g, ' ')).join(','));
    }
  }
}
