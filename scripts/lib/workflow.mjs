// 工作流文件管理：读写、校验、参数清单。
//
// 工作流是**全局配置**，放在 <配置根>/workflows/，跟存档无关。
// 这里没有内置工作流、也没有回退：找不到就是找不到，直接报错。
// 静默回退会让「渲染成功」变成用错工作流的假象，比失败更糟。
//
// 自动替换也不做：工作流可能很复杂，由调用方（AI）读懂 JSON 后自己写好占位符，
// 再用 workflow save 落盘 + check 校验。

import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { describeWorkflow, fillGraph, MissingParam } from '../../core/placeholders.mjs';
import { workflowsDir, stripBom } from './config.mjs';

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

/** 列出配置根里的工作流（没有内置、没有兜底） */
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

/** 读工作流文本；找不到就抛错，绝不回退 */
export async function readWorkflow(configDir, name) {
  const safe = basename(String(name || ''));
  if (!safe) throw new Error('还没有设置工作流：先用 `manga workflow save <你的 API JSON>` 导入一份');
  const file = join(workflowsDir(configDir), safe);
  if (!(await exists(file))) {
    const available = (await listWorkflows(configDir)).map((w) => w.name);
    throw new Error(
      `找不到工作流 ${safe}（找的是 ${file}）` +
        (available.length ? `；现有：${available.join(', ')}` : '；配置根里还没有任何工作流')
    );
  }
  return { name: safe, raw: await readFile(file, 'utf8'), file };
}

/** 校验一份工作流文本，报告它是否满足生成的最低要求。不做替换，只诊断 */
export function checkWorkflow(raw) {
  const desc = describeWorkflow(stripBom(String(raw)));
  if (!desc.ok) return { ok: false, error: desc.error, nodeCount: 0, params: [], missing: [], warnings: [] };

  const names = new Set(desc.params.map((p) => p.name));
  const missing = ['prompt', 'width', 'height'].filter((key) => !names.has(key));
  const warnings = [];
  if (missing.includes('prompt')) warnings.push('没有 {{prompt}}：生成的图不会带分格布局，只是普通文生图');
  if (missing.includes('width')) warnings.push('没有 {{width}}：宽度写死在文件里，改不了画布');
  if (missing.includes('height')) warnings.push('没有 {{height}}：高度写死在文件里，改不了画布');
  if (!names.has('seed')) warnings.push('没有 {{seed}}：每次出图不可复现，也没法换 seed 重出');

  return { ok: missing.length === 0, error: '', nodeCount: desc.nodeCount, params: desc.params, missing, warnings };
}

/** 保存工作流：校验格式后写到 <配置根>/workflows/<name>。source 可以是文件路径或 JSON 文本 */
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
  return { name: safe, ...checkWorkflow(text), raw: text, desc };
}

/**
 * 组装一次渲染要填进工作流的值。
 * ckpt 不强制：只有工作流真的写了 {{ckpt}} 才需要（由 render 判断）。
 */
export function buildValues({ page, project, config, opts = {} }) {
  const defaults = config.defaults || {};
  const [width, height] = page.size;
  const seed = pickSeed(opts.seed, defaults.seed);
  const loras = parseLoras(opts.lora ?? defaults.lora);
  const lora = loras[0] || { name: '', weight: 0 };

  return {
    prompt: '',
    negative: opts.negative ?? defaults.negative ?? '',
    width,
    height,
    seed,
    steps: numberOrEmpty(opts.steps ?? defaults.steps),
    cfg: numberOrEmpty(opts.cfg ?? defaults.cfg),
    denoise: numberOrEmpty(opts.denoise ?? defaults.denoise),
    sampler: opts.sampler ?? defaults.sampler ?? '',
    scheduler: opts.scheduler ?? defaults.scheduler ?? '',
    ckpt: opts.ckpt ?? defaults.ckpt ?? '',
    lora_name: lora.name,
    lora_strength: lora.weight,
    batch_size: 1,
  };
}

/** 空就是空，不要替用户猜一个数字 */
const numberOrEmpty = (value) => {
  if (value === '' || value === undefined || value === null) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
};

function pickSeed(value, fallback) {
  const n = Number(value ?? fallback);
  if (Number.isFinite(n) && n >= 0) return n;
  return Math.floor(Math.random() * 2 ** 31);
}

export function parseLoras(text = '') {
  const out = [];
  for (const m of String(text || '').matchAll(/<lora:([^:>]+?)(?::([\d.]+))?>/g)) {
    out.push({ name: m[1].trim(), weight: m[2] === undefined ? 1 : Number(m[2]) });
  }
  return out;
}

/** 填图：缺参数会抛 MissingParam，调用方转成可读错误 */
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
      const known = Object.keys(values).join(', ');
      throw new Error(`工作流里有未提供的占位符 {{${err.param}}}（已知参数：${known}）`);
    }
    throw err;
  }
}
