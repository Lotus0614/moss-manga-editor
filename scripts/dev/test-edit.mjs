// 修图的自测：不依赖 ComfyUI（上传/排队/取图那一段只走真机验收）。
//   node scripts/dev/test-edit.mjs

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildEditPrompt, describeMarks } from '../../config/manga.mjs';
import { checkWorkflow, saveWorkflow } from '../lib/workflow.mjs';
import { ensureConfig, writeConfig, readConfig } from '../lib/config.mjs';
import { ensureArchive, createProject, createPage, addVersion, getVersions, setCurrentVersion } from '../lib/archive.mjs';
import { sourceVersion, recommendedVersion, prepareEdit, fillEdit, buildEditValues } from '../lib/edit.mjs';

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

// ---------------------------------------------------------------- 提示词

await test('修图提示词只包一层「别动别处」', () => {
  const got = buildEditPrompt({ request: '把左上角气泡的尾巴删掉。' });
  assert.ok(got.startsWith('在这张漫画里把左上角气泡的尾巴删掉。'));
  assert.ok(got.includes('气泡里的文字一个字都不改'));
  assert.ok(!got.endsWith('。。'));
});

await test('空请求返回空串（由调用方报错）', () => {
  assert.equal(buildEditPrompt({ request: '   ' }), '');
  assert.equal(buildEditPrompt({}), '');
});

await test('画了标记就说明「只改标出来的地方」', () => {
  const got = buildEditPrompt({ request: '把气泡尾巴删掉', marks: [{ tool: 'rect', color: 'red' }] });
  assert.ok(got.includes('只改图中红色方框标出来的地方'));
  assert.ok(got.includes('不要把标记画进画面'));
});

await test('多个标记、重复标记都能收成一句话', () => {
  assert.equal(describeMarks([]), '');
  assert.equal(
    describeMarks([
      { tool: 'rect', color: 'red' },
      { tool: 'brush', color: 'blue' },
      { tool: 'rect', color: 'red' },
    ]),
    '红色方框和蓝色涂鸦'
  );
  assert.equal(describeMarks([{ tool: 'ellipse', color: 'nope' }]), '彩色圆圈');
});

// ---------------------------------------------------------------- 工作流识别

const EDIT_WF = JSON.stringify({
  1: { class_type: 'LoadImage', inputs: { image: '{{image}}' } },
  2: { class_type: 'PrimitiveStringMultiline', inputs: { value: '{{prompt}}' } },
  3: { class_type: 'KSampler', inputs: { seed: '{{seed}}' } },
});

const NO_SEED_WF = JSON.stringify({
  1: { class_type: 'LoadImage', inputs: { image: '{{image}}' } },
  2: { class_type: 'PrimitiveStringMultiline', inputs: { value: '{{prompt}}' } },
});

const RENDER_WF = JSON.stringify({
  1: { class_type: 'CLIPTextEncode', inputs: { text: '{{prompt}}' } },
  2: { class_type: 'EmptyLatentImage', inputs: { width: '{{width}}', height: '{{height}}' } },
});

await test('带 {{image}} 的是修图工作流，要 prompt/image/seed', () => {
  const got = checkWorkflow(EDIT_WF);
  assert.equal(got.kind, 'edit');
  assert.equal(got.ok, true);
  assert.deepEqual(got.missing, []);
});

await test('缺 {{seed}} 的修图工作流不算合格（种子写死会让连续修图发糊）', () => {
  const got = checkWorkflow(NO_SEED_WF);
  assert.equal(got.kind, 'edit');
  assert.equal(got.ok, false);
  assert.deepEqual(got.missing, ['seed']);
  assert.ok(got.warnings.some((w) => w.includes('发糊')));
});

await test('不带 image 的仍按生图校验', () => {
  const got = checkWorkflow(RENDER_WF);
  assert.equal(got.kind, 'render');
  assert.equal(got.ok, true);
});

// ---------------------------------------------------------------- 存档准备

const dir = await mkdtemp(join(tmpdir(), 'moss-edit-'));
const configDir = await mkdtemp(join(tmpdir(), 'moss-edit-config-'));

await ensureConfig(configDir);
await ensureArchive(dir);
const project = await createProject(dir, { name: 'Edit Book' });
const created = await createPage(dir, project.slug, { title: '第一页' });
const page = created.page;

await test('没有版本时 sourceVersion 返回空，prepareEdit 明确报错', async () => {
  const store = await getVersions(dir, project.slug);
  assert.equal(sourceVersion(store, page.id), null);
  const cfg = { edit: { name: 'edit.json' } };
  const got = await prepareEdit({ dir, configDir, project, page, config: cfg, opts: { prompt: '删掉尾巴' } });
  assert.equal(got.ok, false);
  assert.match(got.error, /还没有图/);
});

await addVersion(dir, project.slug, { page: page.id, pageIndex: 1, image: '/media/x/a.png', seed: 11, width: 768, height: 1280 });
await addVersion(dir, project.slug, { page: page.id, pageIndex: 1, image: '/media/x/b.png', seed: 22, width: 768, height: 1280 });

await test('没配工作流时提示怎么配', async () => {
  const got = await prepareEdit({ dir, configDir, project, page, config: { edit: { name: '' } }, opts: { prompt: '删掉尾巴' } });
  assert.equal(got.ok, false);
  assert.match(got.error, /还没有修图工作流/);
});

await test('空指令不提交', async () => {
  const got = await prepareEdit({ dir, configDir, project, page, config: { edit: { name: 'edit.json' } }, opts: {} });
  assert.equal(got.ok, false);
  assert.match(got.error, /写一句要改什么/);
});

await test('缺 {{image}} 时点名缺哪个占位符', async () => {
  await saveWorkflow(configDir, JSON.stringify({ 9: { class_type: 'PrimitiveStringMultiline', inputs: { value: '{{prompt}}' } } }), 'bad.json');
  const got = await prepareEdit({ dir, configDir, project, page, config: { edit: { name: 'bad.json' } }, opts: { prompt: '删掉尾巴' } });
  assert.equal(got.ok, false);
  assert.match(got.error, /\{\{image\}\}/);
});

await test('缺 {{seed}} 时预检直接拦住，不让它带着写死的种子跑', async () => {
  await saveWorkflow(configDir, NO_SEED_WF, 'noseed.json');
  const got = await prepareEdit({ dir, configDir, project, page, config: { edit: { name: 'noseed.json' } }, opts: { prompt: '删掉尾巴' } });
  assert.equal(got.ok, false);
  assert.match(got.error, /\{\{seed\}\}/);
  assert.match(got.error, /发糊/);
});

// ---------------------------------------------------------------- 组装

await saveWorkflow(configDir, EDIT_WF, 'edit.json');

await test('默认拿该页最新一版当参考图，取页面尺寸', async () => {
  const got = await prepareEdit({ dir, configDir, project, page, config: { edit: { name: 'edit.json' } }, opts: { prompt: '删掉尾巴' } });
  assert.equal(got.ok, true);
  assert.equal(got.base.seed, 22);
  assert.equal(got.values.width, page.size[0]);
  assert.equal(got.values.height, page.size[1]);
  assert.ok(got.prompt.startsWith('在这张漫画里删掉尾巴'));
});

await test('涂鸦标记会带进提示词、并记在预检结果里', async () => {
  const marks = [{ tool: 'ellipse', color: 'blue' }];
  const got = await prepareEdit({
    dir,
    configDir,
    project,
    page,
    config: { edit: { name: 'edit.json' } },
    opts: { prompt: '把她的手改短', marks },
  });
  assert.equal(got.ok, true);
  assert.deepEqual(got.marks, marks);
  assert.ok(got.prompt.includes('蓝色圆圈'));
});

await test('切到别的版本后，修图以当前采用的版本为准', async () => {
  const store = await getVersions(dir, project.slug);
  const first = store.items.find((v) => v.seed === 11);
  await setCurrentVersion(dir, project.slug, page.id, first.id);
  const picked = sourceVersion(await getVersions(dir, project.slug), page.id);
  assert.equal(picked.seed, 11);
});

await test('当前版是修图版时，照样从它出发（不再强制退回渲染版）', async () => {
  const store = await getVersions(dir, project.slug);
  const render = store.items.find((v) => v.seed === 11);
  const edit = await addVersion(dir, project.slug, {
    page: page.id,
    pageIndex: 1,
    image: '/media/x/e1.png',
    kind: 'edit',
    base: render.id,
    editPrompt: '删掉尾巴',
  });
  await setCurrentVersion(dir, project.slug, page.id, edit.id);
  const picked = sourceVersion(await getVersions(dir, project.slug), page.id);
  assert.equal(picked.id, edit.id);
  // 但推荐的那版仍然是渲染版，界面上据此提示
  const recommend = recommendedVersion(await getVersions(dir, project.slug), page.id);
  assert.equal(recommend.id, render.id);
});

await test('基准链断掉时，推荐版本退回渲染版；编辑仍用当前那一版', async () => {
  const store = await getVersions(dir, project.slug);
  const orphan = await addVersion(dir, project.slug, {
    page: page.id,
    pageIndex: 1,
    image: '/media/x/e2.png',
    kind: 'edit',
    base: 'v999',
    editPrompt: '改歪的版本',
  });
  await setCurrentVersion(dir, project.slug, page.id, orphan.id);
  const store2 = await getVersions(dir, project.slug);
  assert.equal(sourceVersion(store2, page.id).id, orphan.id);
  const recommend = recommendedVersion(store2, page.id);
  assert.equal(recommend.kind, 'render');
  assert.ok([store.items.find((v) => v.seed === 11).id, store.items.find((v) => v.seed === 22).id].includes(recommend.id));
});

await test('整页只有修图版时，也能修（推荐版本就是它自己）', async () => {
  const lonely = await createPage(dir, project.slug, { title: '只有修图版' });
  const only = await addVersion(dir, project.slug, {
    page: lonely.page.id,
    pageIndex: lonely.page.index,
    image: '/media/x/only-edit.png',
    kind: 'edit',
    base: 'v999',
    editPrompt: '没有原图',
  });
  const got = await prepareEdit({
    dir,
    configDir,
    project,
    page: lonely.page,
    config: { edit: { name: 'edit.json' } },
    opts: { prompt: '删掉尾巴' },
  });
  assert.equal(got.ok, true);
  assert.equal(got.base.id, only.id);
  assert.equal(recommendedVersion(await getVersions(dir, project.slug), lonely.page.id).id, only.id);
});

await test('fillEdit 把参考图写成 LoadImage 的 image', () => {
  const prepared = { raw: EDIT_WF, values: { prompt: 'p', image: '', width: 768, height: 1280, seed: 7 } };
  const graph = fillEdit(prepared, 'moss/abc.png');
  assert.equal(graph['1'].inputs.image, 'moss/abc.png');
  assert.equal(graph['2'].inputs.value, 'p');
});

await test('config.edit 写进去读得回来', async () => {
  await writeConfig(configDir, { edit: { name: 'edit.json' } });
  const cfg = await readConfig(configDir);
  assert.equal(cfg.edit.name, 'edit.json');
  assert.equal(cfg.workflow.name, '');
});

await test('buildEditValues 里项目参数压过全局参数', () => {
  const values = buildEditValues({
    page,
    config: { params: { steps: 30, cfg: 1 } },
    project: { params: { steps: 12 } },
    prompt: 'p',
    image: 'x.png',
    seed: 5,
  });
  assert.equal(values.steps, 12);
  assert.equal(values.cfg, 1);
  assert.equal(values.seed, 5);
});

// ---------------------------------------------------------------- 汇总

await rm(dir, { recursive: true, force: true });
await rm(configDir, { recursive: true, force: true });

console.log(`\n${passed} 通过，${failures.length} 失败`);
if (failures.length) {
  for (const { name, err } of failures) console.error(`- ${name}: ${err.stack || err.message}`);
  process.exitCode = 1;
}
