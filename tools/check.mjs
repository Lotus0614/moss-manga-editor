// 自检：语法 + 方言配置。
//   node tools/check.mjs

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { registerConfig } from '../core/config-store.mjs';
import mangaConfig from '../config/manga.mjs';

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

// 方言配置：注册时就校验过一遍（枚举没词表、default 越界、重复 value 都会记下来）
const store = registerConfig(mangaConfig);
for (const problem of store.problems) {
  failed += 1;
  console.error(`✗ ${problem}`);
}
const enumCount = [...store.page, ...store.types.flatMap((type) => type.fields)].filter((field) => field.type === 'enum').length;
if (!store.problems.length) {
  console.log(`配置：${store.page.length} 个页面字段、${store.types.length} 个类型、${enumCount} 个枚举字段`);
  console.log(`字段：${store.page.map((field) => field.key).join(' / ')}`);
}

process.exitCode = failed ? 1 : 0;
