// 自测：编译契约的黄金用例。
// 运行：node core/self-test.mjs
//
// 这些断言对应 Moss 模板文档里的硬性约定，任何一条挂了都说明产物会被模型拒绝或画歪。

import assert from 'node:assert/strict';
import { compilePage } from './compile.mjs';
import { createPage, createPanel, createBubble, toMoss, fromMoss } from './manga-doc.mjs';
import { validatePage } from './validate.mjs';
import { decompile } from './decompile.mjs';
import { fillGraph, scanTokens, MissingParam, describeWorkflow } from './placeholders.mjs';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
}

const SIZE = { width: 768, height: 1280 };

// ---------------------------------------------------------------- 坐标

test('文档 §3.4 的换算示例（1536×1024）', () => {
  const got = toMoss([176, 224, 800, 864], { width: 1536, height: 1024 });
  assert.deepEqual(got, [-288, -592, 352, 32]);
});

test('输出顺序是 yxyx，不是 xyxy', () => {
  const got = toMoss([0, 0, 100, 200], { width: 1024, height: 1024 });
  assert.deepEqual(got, [-512, -512, -312, -412]);
});

test('toMoss / fromMoss 往返一致', () => {
  for (const bbox of [[8, 0, 536, 400], [0, 0, 768, 1280], [100, 200, 100, 300]]) {
    const back = fromMoss(toMoss(bbox, SIZE), SIZE);
    assert.deepEqual(back, [Math.min(bbox[0], bbox[2]), Math.min(bbox[1], bbox[3]), Math.max(bbox[0], bbox[2]), Math.max(bbox[1], bbox[3])]);
  }
});

test('左上向下取整、右下向上取整', () => {
  const got = toMoss([10.6, 20.2, 100.4, 200.9], SIZE);
  // 草稿取整为 [10,20,101,201] → 减偏移
  assert.deepEqual(got, [20 - 640, 10 - 384, 201 - 640, 101 - 384]);
});

// ---------------------------------------------------------------- 编译

const DOC_PANELS = [
  [-640, -376, -240, 152],
  [-224, -376, 16, -4],
  [-224, 12, 16, 384],
  [32, -376, 640, 384],
];
const DOC_BUBBLES = [
  [-620, 300, -260, 430],
  [150, 216, 360, 366],
  [110, 116, 340, 316],
  [510, -184, 570, 86],
];

function buildDocPage() {
  const page = createPage({ size: SIZE });
  page.panels = DOC_PANELS.map((moss, i) =>
    createPanel({ name: `格${i + 1}`, bbox: fromMoss(moss, SIZE), caption: `panel content ${i + 1}` })
  );
  page.bubbles = DOC_BUBBLES.map((moss, i) =>
    createBubble({ bbox: fromMoss(moss, SIZE), text: `测试台词${i + 1}`, type: i === 1 ? 'thought' : 'speech' })
  );
  return page;
}

const compiled = compilePage(buildDocPage(), { characterText: 'CHARACTER: W = a 22 year old college girl.' });

test('四个面板的 bbox 与文档示例完全一致', () => {
  const got = compiled.doc.items.filter((i) => i.label === 'object').map((i) => JSON.stringify(i.bbox)).sort();
  const want = DOC_PANELS.map((b) => JSON.stringify(b)).sort();
  assert.deepEqual(got, want);
});

test('四条文字的 bbox 与文档示例完全一致', () => {
  const got = compiled.doc.items.filter((i) => i.label === 'text').map((i) => JSON.stringify(i.bbox)).sort();
  const want = DOC_BUBBLES.map((b) => JSON.stringify(b)).sort();
  assert.deepEqual(got, want);
});

test('产物只含 summary / items', () => {
  assert.deepEqual(Object.keys(compiled.doc).sort(), ['items', 'summary']);
});

test('已经去掉 width / height / 坐标声明', () => {
  const raw = compiled.json;
  for (const key of ['bbox_coord_space', 'bbox_format', '"width"', '"height"']) {
    assert.ok(!raw.includes(key), `产物里不该出现 ${key}`);
  }
});

test('输出是单行 JSON，且能原样解析回来', () => {
  assert.ok(!compiled.json.includes('\n'));
  const back = JSON.parse(compiled.json);
  assert.equal(back.items.length, 8);
});

test('summary.caption 非空且含黑白锁色句', () => {
  assert.ok(compiled.doc.summary.caption.length > 80);
  assert.ok(/zero colour/i.test(compiled.doc.summary.caption));
});

test('每个 item 的 caption 都带收尾的锁色句', () => {
  for (const item of compiled.doc.items) {
    assert.ok(/Black ink, white paper and grey screentone only, zero colour\./.test(item.caption), item.caption);
  }
});

test('旁白项包含 no bubble, no box, no background', () => {
  const page = createPage({ size: SIZE });
  page.panels = [createPanel({ bbox: [8, 8, 760, 400] })];
  page.bubbles = [createBubble({ type: 'narration', text: '旁白', bbox: [40, 40, 400, 120] })];
  const out = compilePage(page);
  const text = out.doc.items.find((i) => i.label === 'text');
  assert.ok(/no bubble, no box, no background/i.test(text.caption));
  assert.ok(/NO tail|zero colour|no bubble/i.test(text.caption));
});

test('编译无 error 级告警', () => {
  const errs = compiled.warnings.filter((w) => w.level === 'error');
  assert.deepEqual(errs, []);
});

test('本身已包含全部允许字段，没有多余键', () => {
  const allowed = new Set(['label', 'caption', 'bbox', 'text']);
  for (const item of compiled.doc.items) {
    for (const key of Object.keys(item)) assert.ok(allowed.has(key), `多出字段 ${key}`);
  }
});

// ---------------------------------------------------------------- 校验

test('越界面板会被警告', () => {
  const page = createPage({ size: SIZE });
  page.panels = [createPanel({ bbox: [-40, 0, 400, 400] })];
  const warnings = validatePage(page, compilePage(page).doc);
  assert.ok(warnings.some((w) => w.code === 'panel.out'));
});

test('空页会被拦下', () => {
  const page = createPage({ size: SIZE });
  const warnings = validatePage(page, compilePage(page).doc);
  assert.ok(warnings.some((w) => w.level === 'error'));
});

test('文字超预算会被警告', () => {
  const page = createPage({ size: SIZE });
  page.panels = [createPanel({ bbox: [8, 8, 760, 400] })];
  page.bubbles = [
    createBubble({ text: '字'.repeat(300), bbox: [40, 40, 120, 100], fontSize: 24 }),
  ];
  const warnings = validatePage(page, compilePage(page).doc);
  assert.ok(warnings.some((w) => w.code === 'bubble.overflow'));
});

// ---------------------------------------------------------------- 反编译

test('编译产物能反编译回同一组坐标', () => {
  const page = decompile(compiled.json, SIZE);
  assert.equal(page.panels.length, 4);
  assert.equal(page.bubbles.length, 4);
  const again = compilePage(page);
  const got = again.doc.items.map((i) => JSON.stringify(i.bbox)).sort();
  const want = [...DOC_PANELS, ...DOC_BUBBLES].map((b) => JSON.stringify(b)).sort();
  assert.deepEqual(got, want);
});

test('反编译能认出内心气泡与出血格', () => {
  const page = decompile(compiled.json, SIZE);
  assert.ok(page.bubbles.some((b) => b.type === 'thought'));
});

// ---------------------------------------------------------------- 占位符

test('占位符被识别', () => {
  const tokens = scanTokens({ a: { inputs: { text: '{{prompt}}', seed: '{{seed}}' } } });
  assert.deepEqual(tokens.map((t) => t.name).sort(), ['prompt', 'seed']);
});

test('整串占位符保留原始类型', () => {
  const graph = { n: { class_type: 'KSampler', inputs: { seed: '{{seed}}', steps: '{{steps}}' } } };
  const filled = fillGraph(graph, { seed: 12345, steps: 28 });
  assert.equal(filled.n.inputs.seed, 12345);
  assert.equal(typeof filled.n.inputs.seed, 'number');
});

test('占位符嵌在文字里时转字符串', () => {
  const filled = fillGraph({ t: 'size={{width}}x{{height}}' }, { width: 768, height: 1280 });
  assert.equal(filled.t, 'size=768x1280');
});

test('缺参数时抛出带参数名的错误', () => {
  assert.throws(() => fillGraph({ t: '{{nope}}' }, {}), (err) => err instanceof MissingParam && err.param === 'nope');
});

test('原图不被修改（纯函数）', () => {
  const graph = { t: '{{x}}' };
  fillGraph(graph, { x: 1 });
  assert.equal(graph.t, '{{x}}');
});

test('describeWorkflow 拒绝非 API 格式', () => {
  assert.equal(describeWorkflow('{"nodes":[],"links":[]}').ok, false);
  assert.equal(describeWorkflow('not json').ok, false);
  assert.equal(describeWorkflow('{"1":{"class_type":"A","inputs":{}}}').ok, true);
});

// ---------------------------------------------------------------- 汇总

console.log(`\n${passed} 通过，${failures.length} 失败`);
if (failures.length) {
  console.error('\n失败详情：');
  for (const { name, err } of failures) console.error(`- ${name}: ${err.stack || err.message}`);
  process.exitCode = 1;
} else {
  console.log('\n编译产物示例（前 400 字）：');
  console.log(compiled.json.slice(0, 400) + '…');
}
