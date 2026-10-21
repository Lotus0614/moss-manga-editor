// 语法自检：递归 node --check 所有 .mjs。
//   node tools/check.mjs

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
process.exitCode = failed ? 1 : 0;
