#!/usr/bin/env node
/**
 * 完全性リント（/test-scenario-writer の決定論的な突き合わせ。AI同士のチェックではない）
 *
 * 使い方（プロジェクトルートで。引数は拡張子で判別するので順不同）:
 *   Phase 1（台帳の網羅確認）: node lint-scenarios.mjs <slug>.inventory.md <slug>.units.tsv
 *   Phase 2（消し込み検証）:   node lint-scenarios.mjs <slug>.yaml <slug>.inventory.md <slug>.units.tsv
 *
 * 検出する漏れ候補（いずれも警告。誤検出を含むため人がレビューする）:
 *  1. unit未処理: units.tsv の連番が台帳のどの行にも出てこない（転記漏れ）            [inventory + units]
 *  2. 対応未記入: 台帳行の「対応」欄が シナリオID / unmapped / 対象外 のいずれでもない [inventory + yaml]
 *  3. アサーション取りこぼし: 台帳行の規則・数値トークン（切り上げ / 90% / 30日 /
 *     2000円以上 等）が、対応シナリオの expected/steps/title に出てこない             [inventory + yaml]
 *  4. 処分の矛盾: 1台帳行の「対応」欄に シナリオID と unmapped が同居                 [inventory + yaml]
 *  5. ID不在: 「対応」欄のシナリオIDが YAML に存在しない                              [inventory + yaml]
 *  6. unmapped件数不一致: 台帳で unmapped とした行数と YAML の unmapped 件数が異なる  [inventory + yaml]
 *
 * 終了コードは常に 0（ハード失敗ではなく要レビューの一覧）。警告件数は標準エラーへ。
 * YAMLパーサは YAML を渡したときだけ、実行元プロジェクトの node_modules（js-yaml / yaml）から解決する。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const ID_RE = /[A-Z]{2,5}-[A-Z0-9]+-\d{3}/g;

function loadYamlParser() {
  const require = createRequire(resolve(process.cwd(), 'package.json'));
  try { return (t) => require('js-yaml').load(t); } catch { /* next */ }
  try { return (t) => require('yaml').parse(t); } catch { /* below */ }
  console.error('YAMLパーサが見つかりません（js-yaml か yaml を入れてください）');
  process.exit(2);
}

// 全角数字→半角、％→%、桁区切りカンマ・空白除去で比較用に正規化する
function norm(s) {
  return String(s)
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/％/g, '%')
    .replace(/(\d),(?=\d{3})/g, '$1')
    .replace(/\s+/g, '');
}

// 規則・数値トークン（取りこぼすと検証が痩せる類）を抽出する。
// 数値は前置語・単位・比較語ごと1トークンとして拾う。単位が辞書に無くても数値部分は
// 必ずトークンになるため、要件中の数値が対応シナリオに現れなければ検出できる
// （取りこぼしより誤検出側に倒す設計。警告は人がレビューする前提）
const ROUNDING_RE = /切り上げ|切り捨て|四捨五入/g;
const NUM_RE = /(?:上位|最大|最小|最低|第)?\d+(?:\.\d+)?(?:ヶ月|か月|カ月|文字|時間|営業日|[%円件人日年月週回分秒歳位桁点枚個通])?(?:以上|以下|以内|未満|超)?/g;
function tokensOf(text) {
  const n = norm(text);
  return [...new Set([...(n.match(ROUNDING_RE) || []), ...(n.match(NUM_RE) || [])])];
}

// inventory.md のテーブルを読む（ヘッダから「unit」「要件」「対応」列を特定。unit 列の有無に両対応）
function parseInventory(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  let cols = null;
  const rows = [];
  for (const line of lines) {
    if (!/^\s*\|/.test(line)) { continue; }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!cols) {
      const idxReq = cells.findIndex((c) => c.startsWith('要件'));
      const idxMap = cells.findIndex((c) => c === '対応');
      if (idxReq >= 0 && idxMap >= 0) {
        cols = {
          no: cells.findIndex((c) => c === 'No'),
          unit: cells.findIndex((c) => c.toLowerCase() === 'unit'),
          req: idxReq,
          map: idxMap,
        };
      }
      continue; // ヘッダ行自体はデータにしない
    }
    if (/^[-:\s]+$/.test(cells.join(''))) continue; // 区切り行
    if (cells.length <= Math.max(cols.req, cols.map)) continue;
    rows.push({
      no: cols.no >= 0 ? cells[cols.no] : String(rows.length + 1),
      unit: cols.unit >= 0 ? cells[cols.unit] : '',
      req: cells[cols.req] || '',
      map: cells[cols.map] || '',
    });
  }
  if (!cols) {
    console.error(`警告: ${path} に「| ... | 要件 | 対応 |」形式のテーブルが見つかりません`);
    return null;
  }
  return rows;
}

// units.tsv（extract-units.mjs の出力。<連番>\t<ファイル>#<行>\t<内容>）から連番を読む
function parseUnits(path) {
  const ids = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(\d+)\t/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

function lint({ yamlPath, inventoryPath, unitsPath }) {
  const warnings = [];
  const rows = parseInventory(inventoryPath);
  if (!rows) return warnings;

  // 1. unit未処理（台帳に unit 列があり units.tsv を渡されたときのみ）
  if (unitsPath) {
    if (rows.every((r) => !r.unit)) {
      console.error('警告: 台帳に unit 列が無いため unit 網羅チェックはスキップします');
    } else {
      const processed = new Set(rows.map((r) => String(parseInt(r.unit, 10))).filter((u) => u !== 'NaN'));
      for (const id of parseUnits(unitsPath)) {
        if (!processed.has(String(parseInt(id, 10)))) {
          warnings.push(`[unit未処理] unit ${id} が台帳のどの行にも出てきません（転記漏れの可能性）`);
        }
      }
    }
  }

  if (!yamlPath) return warnings; // 2〜6 は YAML（Phase 2 以降）が必要

  const parseYaml = loadYamlParser();
  const doc = parseYaml(readFileSync(yamlPath, 'utf8'));
  const scenarios = Array.isArray(doc?.scenarios) ? doc.scenarios : [];
  const unmappedCount = Array.isArray(doc?.unmapped) ? doc.unmapped.length : 0;

  // シナリオID → 検索対象テキスト（正規化済み）
  const byId = new Map();
  for (const s of scenarios) {
    const text = [s.title, ...(s.steps || []), ...(s.expected || []),
      ...(s.preconditions || []), s.notes].filter(Boolean).join(' ');
    byId.set(s.id, norm(text));
  }

  let ledgerUnmapped = 0;
  for (const row of rows) {
    const ids = row.map.match(ID_RE) || [];
    const isUnmapped = /unmapped/i.test(row.map);
    if (isUnmapped) ledgerUnmapped += 1;

    // 2. 対応未記入（消し込み等式の左辺に宙に浮いた行がある）
    if (ids.length === 0 && !isUnmapped && !row.map.includes('対象外')) {
      warnings.push(`[対応未記入] 台帳No.${row.no} の対応欄が シナリオID / unmapped / 対象外 のいずれでもありません: ${row.req.slice(0, 50)}`);
      continue;
    }
    // 4. 処分の矛盾: 同じ行に ID と unmapped が同居
    if (ids.length > 0 && isUnmapped) {
      warnings.push(`[処分矛盾] 台帳No.${row.no} の対応欄に ${ids.join('/')} と unmapped が同居しています: ${row.req.slice(0, 50)}`);
    }
    if (ids.length === 0) continue; // unmapped / 対象外 はトークン照合の対象外

    // 5. ID不在 ＋ 対応シナリオの結合テキスト
    let combined = '';
    for (const id of ids) {
      if (!byId.has(id)) {
        warnings.push(`[ID不在] 台帳No.${row.no} の対応ID ${id} が YAML に存在しません`);
      } else {
        combined += byId.get(id);
      }
    }
    // 3. アサーション取りこぼし
    for (const tok of tokensOf(row.req)) {
      if (combined && !combined.includes(tok)) {
        warnings.push(`[トークン未反映] 台帳No.${row.no}「${tok}」が ${ids.join('/')} の expected/steps に出現しません: ${row.req.slice(0, 50)}`);
      }
    }
  }

  // 6. unmapped 件数不一致
  if (ledgerUnmapped !== unmappedCount) {
    warnings.push(`[unmapped件数不一致] 台帳で unmapped とした行は ${ledgerUnmapped} 行、YAML の unmapped は ${unmappedCount} 件です（1アサーション=1エントリが原則）`);
  }

  return warnings;
}

const args = { yamlPath: undefined, inventoryPath: undefined, unitsPath: undefined };
for (const a of process.argv.slice(2)) {
  if (/\.ya?ml$/i.test(a)) args.yamlPath = a;
  else if (/\.tsv$/i.test(a)) args.unitsPath = a;
  else if (/\.md$/i.test(a)) args.inventoryPath = a;
  else { console.error(`不明な引数: ${a}（.yaml / .md / .tsv のいずれかを指定）`); process.exit(2); }
}
if (!args.inventoryPath) {
  console.error('使い方: node lint-scenarios.mjs [<slug>.yaml] <slug>.inventory.md [<slug>.units.tsv]');
  process.exit(2);
}

let warnings;
try {
  warnings = lint(args);
} catch (e) {
  console.error(`読み込み失敗: ${e.message}`);
  process.exit(2);
}

if (warnings.length === 0) {
  const checked = [
    args.unitsPath ? 'unit網羅' : null,
    args.yamlPath ? '消し込み・トークン照合' : null,
  ].filter(Boolean).join(' + ') || 'なし（inventory のみでは照合できる項目がありません）';
  console.log(`LINT OK: ${args.inventoryPath}（警告なし。実施したチェック: ${checked}）`);
} else {
  for (const w of warnings) console.log(w);
  console.error(`\n警告 ${warnings.length} 件（誤検出を含む。1件ずつ要否を判断すること）`);
}
process.exit(0);
