#!/usr/bin/env node
/**
 * テストシナリオYAML のスキーマ検証（/test-scenario-writer スキル同梱・プロジェクト非依存）
 *
 * 使い方: プロジェクトルートで
 *   node <このスキルのディレクトリ>/scripts/validate-scenarios.mjs <yamlパス>...
 *
 * YAMLパーサは実行元プロジェクトの node_modules から解決する
 * （js-yaml または yaml のどちらかがあれば良い）。
 * スキーマ定義: ../references/scenario-schema.md
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

function loadYamlParser() {
  // 実行元（カレントディレクトリ）の node_modules から探す
  const require = createRequire(resolve(process.cwd(), 'package.json'));
  try {
    const jsYaml = require('js-yaml');
    return (text) => jsYaml.load(text);
  } catch { /* 次の候補へ */ }
  try {
    const yaml = require('yaml');
    return (text) => yaml.parse(text);
  } catch { /* 下でエラー */ }
  console.error('YAMLパーサが見つかりません。プロジェクトに js-yaml か yaml を追加してください:');
  console.error('  npm install -D js-yaml');
  process.exit(2);
}

const parseYaml = loadYamlParser();

const TYPES = ['display', 'input-validation', 'transition', 'state', 'error', 'permission'];
const PRIORITIES = ['high', 'medium', 'low'];
const DISPOSITIONS = ['other-layer', 'impl-pending', 'untestable'];
const ID_PATTERN = /^[A-Z]{2,5}-[A-Z0-9]+-\d{3}$/;

function validate(path) {
  const errors = [];
  const doc = parseYaml(readFileSync(path, 'utf-8'));

  if (!doc || typeof doc !== 'object') {
    return [`${path}: YAMLが空か、オブジェクトではありません`];
  }

  // meta
  const meta = doc.meta;
  if (!meta) {
    errors.push('meta がありません');
  } else {
    for (const key of ['source', 'system', 'prefix', 'extracted_at']) {
      if (!meta[key]) errors.push(`meta.${key} がありません`);
    }
    if (meta.prefix && !/^[A-Z]{2,5}$/.test(meta.prefix)) {
      errors.push(`meta.prefix "${meta.prefix}" は英大文字2〜5字にしてください`);
    }
  }

  // scenarios
  if (!Array.isArray(doc.scenarios) || doc.scenarios.length === 0) {
    errors.push('scenarios が空です');
  } else {
    const ids = new Set();
    doc.scenarios.forEach((s, i) => {
      const label = s?.id ?? `scenarios[${i}]`;
      for (const key of ['id', 'source_ref', 'screen', 'title', 'type', 'priority']) {
        if (!s?.[key]) errors.push(`${label}: ${key} がありません`);
      }
      if (s?.id) {
        if (!ID_PATTERN.test(s.id)) {
          errors.push(`${label}: id の形式が不正です（例: ATT-LOGIN-001）`);
        } else if (meta?.prefix && !s.id.startsWith(`${meta.prefix}-`)) {
          errors.push(`${label}: id が meta.prefix "${meta.prefix}" で始まっていません`);
        }
        if (ids.has(s.id)) errors.push(`${label}: id が重複しています`);
        ids.add(s.id);
      }
      if (s?.type && !TYPES.includes(s.type)) {
        errors.push(`${label}: type "${s.type}" は不正です（${TYPES.join(' | ')}）`);
      }
      if (s?.priority && !PRIORITIES.includes(s.priority)) {
        errors.push(`${label}: priority "${s.priority}" は不正です（${PRIORITIES.join(' | ')}）`);
      }
      if (!Array.isArray(s?.preconditions)) errors.push(`${label}: preconditions はリストにしてください（不要なら []）`);
      for (const key of ['steps', 'expected']) {
        if (!Array.isArray(s?.[key]) || s[key].length === 0) {
          errors.push(`${label}: ${key} は1件以上のリストにしてください`);
        }
      }
    });
  }

  // unmapped
  if (!Array.isArray(doc.unmapped)) {
    errors.push('unmapped がありません（確認対象外の要件が無い場合も [] を明示してください）');
  } else {
    doc.unmapped.forEach((u, i) => {
      for (const key of ['source_ref', 'requirement', 'reason']) {
        if (!u?.[key]) errors.push(`unmapped[${i}]: ${key} がありません`);
      }
      if (!u?.disposition) {
        errors.push(`unmapped[${i}]: disposition がありません（${DISPOSITIONS.join(' | ')}）`);
      } else if (!DISPOSITIONS.includes(u.disposition)) {
        errors.push(`unmapped[${i}]: disposition "${u.disposition}" は不正です（${DISPOSITIONS.join(' | ')}）`);
      } else if (u.disposition === 'other-layer' && !u.layer) {
        errors.push(`unmapped[${i}]: disposition=other-layer には layer（unit / feature 等）が必要です`);
      } else if (u.disposition === 'impl-pending' && !u.revisit) {
        errors.push(`unmapped[${i}]: disposition=impl-pending には revisit（再追加の契機）が必要です`);
      }
    });
  }

  return errors;
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('使い方: node validate-scenarios.mjs <yamlパス>...');
  process.exit(2);
}

let failed = false;
for (const path of paths) {
  let errors;
  try {
    errors = validate(path);
  } catch (e) {
    errors = [`読み込み失敗: ${e.message}`];
  }
  if (errors.length === 0) {
    const doc = parseYaml(readFileSync(path, 'utf-8'));
    console.log(`OK: ${path} (シナリオ ${doc.scenarios.length}件, unmapped ${doc.unmapped.length}件)`);
  } else {
    failed = true;
    console.error(`NG: ${path}`);
    for (const e of errors) console.error(`  - ${e}`);
  }
}
process.exit(failed ? 1 : 0);
