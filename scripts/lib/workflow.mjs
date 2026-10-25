// 工作流文件管理：读写、校验、参数清单。
//
// 参数完全由占位符决定，这里不认识任何具体名字。
// 工作流放在 <配置根>/workflows/，跟存档无关；没有内置模板、没有回退。

import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { describeWorkflow, fillGraph, MissingParam, collectDefaults } from '../../core/placeholders.mjs';
import { workflowsDir, stripBom } from './config.mjs';

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

export async function listWorkflows(configDir) {
  const dir = workflowsDir(configDir);
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf8');
    const desc = describeWorkflow(stripBom(raw));
    out.push({
      name: file,
      source: 'config',
      ok: desc.ok,
      error: desc.error || '',
      params: desc.params || [],
      nodeCount: desc.nodeCount || 0,
    });
  }
  return out;
}

export async function readWorkflow(configDir, name) {
  const safe = basename(String(name || ''));
  if (!safe) throw new Error('还没有设置工作流：先用 `manga workflow save <你的 API JSON>` 导入一份');
  const file = join(workflowsDir(configDir), safe);
  if (!(await exists(file))) {
    const available = (await listWorkflows(configDir)).map((w) => w.name);
    throw new Error(
      `找不到工作流 ${safe}（找的是 ${file}）` + (available.length ? `；现有：${available.join(', ')}` : '；配置根里还没有任何工作流')
    );
  }
  return { name: safe, raw: await readFile(file, 'utf8'), file };
}

/** 校验：生图要 prompt/width/height，修图（带 {{image}} 的）只要 prompt/image */
export function checkWorkflow(raw) {
  const desc = describeWorkflow(stripBom(String(raw)));
  if (!desc.ok) return { ok: false, kind: '', error: desc.error, nodeCount: 0, params: [], missing: [], warnings: [] };

  const names = new Set(desc.params.map((p) => p.name));

  // {{image}} = 图生图（修图）工作流：画布尺寸和种子由工作流自己定，不要求占位符
  if (names.has('image')) {
    const missing = ['prompt', 'image'].filter((key) => !names.has(key));
    const warnings = [];
    if (!names.has('seed')) warnings.push('没有 {{seed}}：每次都用工作流里写死的种子，同样的指令重跑结果一样');
    return { ok: missing.length === 0, kind: 'edit', error: '', nodeCount: desc.nodeCount, params: desc.params, missing, warnings };
  }

  const missing = ['prompt', 'width', 'height'].filter((key) => !names.has(key));
  const warnings = [];
  if (missing.includes('prompt')) warnings.push('没有 {{prompt}}：生成的图不会带分格布局');
  if (missing.includes('width')) warnings.push('没有 {{width}}：宽度写死，改不了画布');
  if (missing.includes('height')) warnings.push('没有 {{height}}：高度写死，改不了画布');
  if (!names.has('seed')) warnings.push('没有 {{seed}}：没法记录 seed');

  return { ok: missing.length === 0, kind: 'render', error: '', nodeCount: desc.nodeCount, params: desc.params, missing, warnings };
}

/** 保存工作流，并把占位符里的默认值抄一份出来（调用方写进 config.params） */
export async function saveWorkflow(configDir, source, name = 'default.json') {
  const rawText =
    typeof source === 'string' && source.trim().startsWith('{') ? source : await readFile(resolve(String(source)), 'utf8');
  const raw = stripBom(rawText).trim();
  const desc = describeWorkflow(raw);
  if (!desc.ok) throw new Error(desc.error);

  const safe = basename(String(name).endsWith('.json') ? name : `${name}.json`);
  const dir = workflowsDir(configDir);
  await mkdir(dir, { recursive: true });
  const text = `${raw}\n`;
  await writeFile(join(dir, safe), text, 'utf8');
  return { name: safe, ...checkWorkflow(text), raw: text, desc, defaults: collectDefaults(text) };
}

/** 自动参数：永远由代码填，不进表单 */
export const AUTO_PARAMS = ['prompt', 'width', 'height', 'seed', 'image'];

/** 只组装自动项；用户参数由调用方从 config.params / project.params 合并 */
export function buildValues({ page, opts = {} }) {
  const [width, height] = page.size;
  return { prompt: '', width, height, seed: pickSeed(opts.seed) };
}

/** 没给就随机：同一页连续出图才有变化 */
export function pickSeed(value) {
  if (value === '' || value === undefined || value === null) return Math.floor(Math.random() * 2 ** 31);
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return n;
  return Math.floor(Math.random() * 2 ** 31);
}

export function fillWorkflow(raw, values) {
  let graph;
  try {
    graph = JSON.parse(stripBom(String(raw)));
  } catch (err) {
    throw new Error(`工作流 JSON 解析失败：${err.message}`);
  }
  try {
    return fillGraph(graph, values);
  } catch (err) {
    if (err instanceof MissingParam) {
      throw new Error(`工作流需要参数 {{${err.param}}}，但没有值也没有默认值。用 \`manga config set params.${err.param}=值\` 提供。`);
    }
    throw err;
  }
}
