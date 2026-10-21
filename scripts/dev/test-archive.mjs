// 存档与 diff 的自测：不依赖 ComfyUI。
//   node scripts/dev/test-archive.mjs

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { diffPage } from '../lib/diff.mjs';
import {
  createProject,
  createPage,
  getPage,
  savePage,
  listPages,
  changes,
  ack,
  readJournal,
} from '../lib/archive.mjs';
import { ensureArchive, readState, readConfig, writeConfig } from '../lib/config.mjs';

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
}

// ---------------------------------------------------------------- 纯函数

await test('diff 能认出 bbox 变化', () => {
  const before = { panels: [{ id: 'a', bbox: [8, 8, 760, 400], caption: 'x' }], bubbles: [] };
  const after = { panels: [{ id: 'a', bbox: [8, 8, 760, 424], caption: 'x' }], bubbles: [] };
  const ops = diffPage(before, after);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'bbox');
  assert.deepEqual(ops[0].to, [8, 8, 760, 424]);
});

await test('diff 能认出文本变化与增删', () => {
  const before = { panels: [{ id: 'a', bbox: [0, 0, 10, 10] }], bubbles: [{ id: 'b', text: '旧' }] };
  const after = {
    panels: [{ id: 'a', bbox: [0, 0, 10, 10] }, { id: 'c', bbox: [0, 20, 10, 30] }],
    bubbles: [],
  };
  const ops = diffPage(before, after);
  assert.ok(ops.some((o) => o.op === 'add' && o.id === 'c'));
  assert.ok(ops.some((o) => o.op === 'remove' && o.id === 'b'));
});

await test('没有改动就不产生操作', () => {
  const page = { panels: [{ id: 'a', bbox: [0, 0, 10, 10] }], bubbles: [] };
  assert.deepEqual(diffPage(page, JSON.parse(JSON.stringify(page))), []);
});

// ---------------------------------------------------------------- 存档

const dir = await mkdtemp(join(tmpdir(), 'moss-test-'));

await test('ensureArchive 建立 config 与 state', async () => {
  await ensureArchive(dir);
  const config = await readConfig(dir);
  assert.equal(config.version, 2);
  assert.ok(config.comfy.url.startsWith('http'));
  const state = await readState(dir);
  assert.equal(state.rev, 0);
});

await test('建项目 / 建页 / rev 递增', async () => {
  const project = await createProject(dir, { name: 'Test Book' });
  assert.equal(project.slug, 'test-book');
  const created = await createPage(dir, project.slug, { title: '第一页' });
  assert.equal(created.page.id, 'p01');
  assert.equal(created.page.index, 1);
  assert.ok(created.rev > 0);
  const pages = await listPages(dir, project.slug);
  assert.equal(pages.length, 1);
});

await test('保存页面会记 journal 并推进 rev', async () => {
  const project = { slug: 'test-book' };
  const page = await getPage(dir, project.slug, 'p01');
  const before = (await readState(dir)).rev;
  const saved = await savePage(dir, project.slug, { ...page, title: '改过标题' }, { actor: 'test' });
  assert.equal(saved.rev, before + 1);
  assert.ok(saved.ops.some((o) => o.op === 'page' && o.field === 'title'));
  const journal = await readJournal(dir);
  assert.equal(journal.slice(-1)[0].actor, 'test');
});

await test('没有改动时不推进 rev', async () => {
  const page = await getPage(dir, 'test-book', 'p01');
  const before = (await readState(dir)).rev;
  const saved = await savePage(dir, 'test-book', page);
  assert.equal(saved.rev, before);
  assert.deepEqual(saved.ops, []);
});

await test('changes 按页聚合，ack 之后清空', async () => {
  await ack(dir);
  const page = await getPage(dir, 'test-book', 'p01');
  await savePage(dir, 'test-book', { ...page, note: '加一句备注' });
  const diff = await changes(dir);
  assert.equal(diff.pages.length, 1);
  assert.equal(diff.pages[0].page, 'p01');
  assert.ok(diff.pages[0].ops.length >= 1);
  await ack(dir);
  const after = await changes(dir);
  assert.equal(after.pages.length, 0);
});

await test('配置写入是深合并且不丢默认值', async () => {
  const saved = await writeConfig(dir, { defaults: { ckpt: 'x.safetensors' } });
  assert.equal(saved.defaults.ckpt, 'x.safetensors');
  assert.equal(saved.defaults.steps, 28);
  assert.equal(typeof saved.comfy.url, 'string');
});

// ---------------------------------------------------------------- 汇总

await rm(dir, { recursive: true, force: true });

console.log(`\n${passed} 通过，${failures.length} 失败`);
if (failures.length) {
  for (const { name, err } of failures) console.error(`- ${name}: ${err.stack || err.message}`);
  process.exitCode = 1;
}
