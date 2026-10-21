// 工作流：读取、导入、占位符填充、参数取值。
// 工作流文件可以有多个：存档里的 <archive>/workflows 优先，技能自带的 workflows/ 兜底。

import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { describeWorkflow, fillGraph, MissingParam } from '../../core/placeholders.mjs';

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

/** 列出所有可用工作流（存档里的在前，重名时存档优先） */
export async function listWorkflows(archiveDir) {
  const seen = new Set();
  const out = [];
  for (const [dir, source] of [
    [join(archiveDir, 'workflows'), 'archive'],
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

/** 读工作流文本；先找存档，再找内置；都找不到就用内置的通用模板兜底 */
export async function readWorkflow(archiveDir, name) {
  const safe = basename(String(name || 'default.json'));
  const candidates = [safe, 'moss-image.api.json'];
  for (const candidate of candidates) {
    for (const dir of [join(archiveDir, 'workflows'), BUILTIN_DIR]) {
      const file = join(dir, candidate);
      if (await exists(file)) return { name: basename(candidate), raw: await readFile(file, 'utf8'), file };
    }
  }
  throw new Error(`找不到工作流 ${safe}（存档 workflows/ 与内置 workflows/ 都没有）`);
}

/** 导入用户从 ComfyUI 导出的 API JSON */
export async function importWorkflow(archiveDir, raw, name = 'default.json') {
  const desc = describeWorkflow(raw);
  if (!desc.ok) throw new Error(desc.error);
  const safe = basename(String(name).endsWith('.json') ? name : `${name}.json`);
  const dir = join(archiveDir, 'workflows');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, safe), raw.endsWith('\n') ? raw : `${raw}\n`, 'utf8');
  return { name: safe, ...desc };
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
