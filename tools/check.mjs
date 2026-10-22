// 自检：语法 + 配置。
//   node tools/check.mjs

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { applyTypes } from '../core/runtime.mjs';
import { types } from '../config/types.mjs';
import { PAGE_FIELDS, enumOptions } from '../config/ui.mjs';

const run = promisify(execFile);
const ROOT = resolve(process.cwd());
const SKIP = new Set(['node_modules', 'data', 'web/vendor', '.git']);

async function* walk(dir, rel = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (SKIP.has(entry.name) || SKIP.has(relPath)) continue;
    if (entry.isDirectory()) yield* walk(join(dir, entry.name), relPath);
    else if (entry.name.endsWith('.mjs')) yield join(dir, entry.name);
  }
}

let failed = 0;
let checked = 0;
for await (const file of walk(ROOT)) {
  checked += 1;
  try {
    await run(process.execPath, ['--check', file]);
  } catch (err) {
    failed += 1;
    console.error(`✗ ${file.replace(ROOT + '\\', '')}`);
    console.error(String(err.stderr || err.message).split('\n').slice(0, 4).join('\n'));
  }
}

console.log(failed ? `\n${failed} / ${checked} 个文件有语法错误` : `\n${checked} 个文件语法正常`);

// 配置自检：每个 enum 字段的 options 都要查得到词表，default 必须在词表里。
// 这里漏了，网页右栏的下拉就是空的。
applyTypes(types);
const enumFields = [
  ...types.flatMap((type) => type.fields.filter((f) => f.type === 'enum').map((f) => [`${type.key}.${f.key}`, f])),
  ...PAGE_FIELDS.filter((f) => f.type === 'enum').map((f) => [`page.${f.key}`, f]),
];
for (const [where, field] of enumFields) {
  const table = enumOptions(field.options);
  if (!Object.keys(table).length) {
    failed += 1;
    console.error(`✗ ${where}：options: '${field.options}' 在 config/ui.mjs 的 ENUM_SOURCES 里查不到`);
  } else if (field.default !== undefined && !table[field.default]) {
    failed += 1;
    console.error(`✗ ${where}：default: '${field.default}' 不在 '${field.options}' 词表里`);
  }
}
console.log(failed ? '' : `${enumFields.length} 个枚举字段词表正常`);

process.exitCode = failed ? 1 : 0;
