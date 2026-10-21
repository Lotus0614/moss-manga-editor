// 工作流自动绑定的自测：喂一份「没有任何占位符」的完整 API 图。
//   node scripts/dev/test-bind.mjs

import assert from 'node:assert/strict';
import { detectBindings, applyBindings, parseExpose } from '../lib/bind.mjs';

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

const GRAPH = {
  1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'moss.safetensors' } },
  2: { class_type: 'CLIPTextEncode', inputs: { text: 'a manga page', clip: ['1', 1] } },
  3: { class_type: 'CLIPTextEncode', inputs: { text: 'bad quality', clip: ['1', 1] } },
  4: { class_type: 'EmptyLatentImage', inputs: { width: 768, height: 1280, batch_size: 1 } },
  5: {
    class_type: 'KSampler',
    inputs: {
      seed: 42,
      steps: 30,
      cfg: 6.5,
      sampler_name: 'dpmpp_2m',
      scheduler: 'karras',
      model: ['1', 0],
      positive: ['2', 0],
      negative: ['3', 0],
      latent_image: ['4', 0],
    },
  },
  6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  7: { class_type: 'SaveImage', inputs: { filename_prefix: 'moss', images: ['6', 0] } },
};

const detected = detectBindings(GRAPH);

test('必绑三项：prompt / width / height', () => {
  const params = detected.required.map((b) => b.param).sort();
  assert.deepEqual(params, ['height', 'prompt', 'width']);
});

test('顺着 positive 连线找到正向文本节点', () => {
  const prompt = detected.required.find((b) => b.param === 'prompt');
  assert.equal(prompt.node, '2');
  assert.equal(prompt.input, 'text');
});

test('其余参数作为候选，不当场改', () => {
  const names = detected.candidates.map((c) => c.param);
  for (const name of ['negative', 'seed', 'steps', 'cfg', 'sampler', 'ckpt']) {
    assert.ok(names.includes(name), `缺少候选 ${name}`);
  }
});

test('绑定只写字面量，不碰连线', () => {
  const { graph, applied } = applyBindings(GRAPH, detected.required);
  assert.equal(graph['2'].inputs.text, '{{prompt}}');
  assert.equal(graph['4'].inputs.width, '{{width}}');
  assert.deepEqual(graph['2'].inputs.clip, ['1', 1]);
  assert.deepEqual(graph['5'].inputs.positive, ['2', 0]);
  assert.equal(applied.length, 3);
});

test('原图不被修改（纯函数）', () => {
  assert.equal(GRAPH['2'].inputs.text, 'a manga page');
  assert.equal(GRAPH['4'].inputs.width, 768);
});

test('已经是占位符的不重复包一层', () => {
  const once = applyBindings(GRAPH, detected.required).graph;
  const twice = applyBindings(once, detected.required);
  assert.equal(twice.graph['2'].inputs.text, '{{prompt}}');
  assert.equal(twice.applied.length, 0);
});

test('parseExpose 解析 参数=节点.输入', () => {
  assert.deepEqual(parseExpose(['seed=5.seed']), [{ param: 'seed', node: '5', input: 'seed' }]);
  assert.throws(() => parseExpose(['seed']), /格式/);
  assert.throws(() => parseExpose(['seed=5']), /节点id/);
});

test('非文生图工作流会给出明确警告', () => {
  const lonely = { 1: { class_type: 'CLIPTextEncode', inputs: { text: 'x' } } };
  const result = detectBindings(lonely);
  assert.ok(result.warnings.some((w) => /采样器/.test(w)));
  assert.equal(result.required.length, 0);
});

console.log(`\n${passed} 通过，${failures.length} 失败`);
if (failures.length) {
  for (const { name, err } of failures) console.error(`- ${name}: ${err.stack || err.message}`);
  process.exitCode = 1;
}
