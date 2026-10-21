// 工作流文件管理：读写、校验、参数清单。
//
// 工作流是**全局配置**，放在 <配置根>/workflows/（默认 ~/.moss-manga/workflows），
// 跟存档无关；技能自带的 workflows/ 作为兜底模板。
//
// 这里不做任何「猜哪个节点是提示词」的自动替换：工作流可能很复杂，
// 由调用方（AI）读懂 JSON 后自己写好占位符，再用 workflow save 落盘 + check 校验。

import { readFile, readdir, mkdir, writeFile, access, copyFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { describeWorkflow, fillGraph, MissingParam } from '../../core/placeholders.mjs';
import { workflowsDir, stripBom } from './config.mjs';

export const BUILTIN_DIR = resolve(import.meta.dirname, '..', '..', 'workflows');

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

async function listDir(dir) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}

/** 列出所有可用工作流（配置根优先，重名时配置根胜出） */
export async function listWorkflows(configDir) {
  const seen = new Set();
  const out = [];
  for (const [dir, source] of [
    [workflowsDir(configDir), 'config'],
    [BUILTIN_DIR, 'builtin'],
  ]) {
    for (const file of await listDir(dir)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const raw = await readFile(join(dir, file), 'utf8');
      const desc = describeWorkflow(raw);
      out.push({ name: file, source, ok: desc.ok, error: desc.error || '', params: desc.params || [], nodeCount: desc.nodeCount || 0 });
    }
  }
  return out;
}

/** 读工作流文本；先找配置根，再找内置；都没有就用内置通用模板兜底 */
export async function readWorkflow(configDir, name) {
  const safe = basename(String(name || 'default.json'));
  for (const candidate of [safe, 'moss-image.api.json']) {
    for (const dir of [workflowsDir(configDir), BUILTIN_DIR]) {
      const file = join(dir, candidate);
      if (await exists(file)) return { name: basename(candidate), raw: await readFile(file, 'utf8'), file };
    }
  }
  throw new Error(`找不到工作流 ${safe}（配置根 workflows/ 与内置 workflows/ 都没有）`);
}

/**
 * 校验一份工作流文本，报告它是否满足生成的最低要求。
 * 不做替换，只诊断。
 */
export function checkWorkflow(raw) {
  const desc = describeWorkflow(raw);
  if (!desc.ok) return { ok: false, error: desc.error, nodeCount: 0, params: [], missing: [], warnings: [] };

  const names = new Set(desc.params.map((p) => p.name));
  const missing = ['prompt', 'width', 'height'].filter((key) => !names.has(key));
  const warnings = [];
  if (missing.includes('prompt')) warnings.push('没有 {{prompt}}：生成的图不会带分格布局，只是普通文生图');
  if (missing.includes('width')) warnings.push('没有 {{width}}：宽度写死在文件里，改不了画布');
  if (missing.includes('height')) warnings.push('没有 {{height}}：高度写死在文件里，改不了画布');
  if (!names.has('seed')) warnings.push('没有 {{seed}}：每次出图不可复现，也没法换 seed 重出');

  const text = JSON.stringify(desc.params.map((p) => p.name));
  if (!/ckpt/.test(text)) warnings.push('没有 {{ckpt}}：检查点写死在文件里，设置页选 ckpt 不会生效');

  return {
    ok: missing.length === 0,
    error: '',
    nodeCount: desc.nodeCount,
    params: desc.params,
    missing,
    warnings,
  };
}

/**
 * 保存工作流：校验格式后写到 <配置根>/workflows/<name>。
 * source 可以是文件路径或 JSON 文本。
 */
export async function saveWorkflow(configDir, source, name = 'default.json') {
  const rawText =
    typeof source === 'string' && source.trim().startsWith('{') ? source : await readFile(resolve(String(source)), 'utf8');
  const raw = stripBom(rawText).trim();
  const desc = describeWorkflow(raw);
  if (!desc.ok) throw new Error(desc.error);

  const safe = basename(String(name).endsWith('.json') ? name : `${name}.json`);
  const dir = workflowsDir(configDir);
  await mkdir(dir, { recursive: true });
  const text = `${raw.trim()}\n`;
  await writeFile(join(dir, safe), text, 'utf8');
  return { name: safe, ...checkWorkflow(text), raw: text, desc };
}

/** 把内置模板复制到配置根，保证开箱有可用工作流 */
export async function installBuiltin(configDir, name = 'default.json') {
  const builtin = join(BUILTIN_DIR, 'moss-image.api.json');
  if (!(await exists(builtin))) throw new Error('内置工作流缺失');
  const dir = workflowsDir(configDir);
  await mkdir(dir, { recursive: true });
  const target = join(dir, name);
  await copyFile(builtin, target);
  return { name, file: target };
}

/**
 * 组装一次渲染要填进工作流的值。
 * @param {{page:object, project:object, config:object, opts:object}} input
 */
export function buildValues({ page, project, config, opts = {} }) {
  const defaults = config.defaults || {};
  const [width, height] = page.size;
  const seed = pickSeed(opts.seed, defaults.seed);
  const loras = parseLoras(opts.lora ?? defaults.lora);
  const lora = loras[0] || { name: '', weight: 0 };

  return {
    prompt: '', // 由调用方编译后填入
    negative: opts.negative ?? defaults.negative,
    width,
    height,
    seed,
    steps: num(opts.steps, defaults.steps, 28),
    cfg: num(opts.cfg, defaults.cfg, 5),
    sampler: opts.sampler ?? defaults.sampler,
    scheduler: opts.scheduler ?? defaults.scheduler,
    ckpt: opts.ckpt ?? defaults.ckpt,
    lora_name: lora.name,
    lora_strength: lora.weight,
    batch_size: 1,
  };
}

const num = (value, fallback, dflt) => {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : dflt;
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
    graph = JSON.parse(raw);
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
