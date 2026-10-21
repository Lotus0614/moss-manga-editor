// 生成链路：编译 → 填工作流 → 提交 ComfyUI → 取图 → 落版本。
//
// 工作流是「图里写占位符」的简单方案：用户把 ComfyUI 导出的 API JSON 贴进设置页，
// 想暴露什么参数就写 {{名字}}，缺参数会在提交前明确报出来。

import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { json, fail, readBody, route, sse } from '../http.mjs';
import { getProject, getPage, addVersion, saveImage, getRawSettings, sha256 } from '../store.mjs';
import { compilePage } from '../../core/compile.mjs';
import { compileContext } from '../../core/bible.mjs';
import { blocking } from '../../core/validate.mjs';
import { fillGraph, MissingParam, describeWorkflow } from '../../core/placeholders.mjs';
import { comfyFromSettings, ComfyError } from '../comfy.mjs';
import { createJob, updateJob, getJob, listJobs, bus, pruneJobs } from '../jobs.mjs';

const WORKFLOW_DIR = resolve(process.env.MOSS_WORKFLOWS || join(process.cwd(), 'workflows'));
const LORA_RE = /<lora:([^:>]+?)(?::([\d.]+))?>/g;

export function parseLoras(text = '') {
  const out = [];
  for (const m of String(text).matchAll(LORA_RE)) {
    out.push({ name: m[1].trim(), weight: m[2] === undefined ? 1 : Number(m[2]) });
  }
  return out;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** 选工作流文件：有 lora 且存在 lora 变体时自动用变体 */
async function pickWorkflow(settings, loras) {
  const configured = settings.comfy.workflow || 'moss-image.api.json';
  const candidates = [configured];
  if (loras.length && configured.includes('.api.json')) {
    candidates.unshift(configured.replace('.api.json', '-lora.api.json'));
  }
  for (const name of candidates) {
    const file = join(WORKFLOW_DIR, name.replace(/[^a-zA-Z0-9._-]/g, ''));
    if (await exists(file)) return { name, raw: await readFile(file, 'utf8') };
  }
  throw Object.assign(new Error(`找不到工作流文件 ${configured}（目录：${WORKFLOW_DIR}）`), { status: 400 });
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * 组装一次生成所需的全部内容。generate 与 /graph 预览共用，保证两边一致。
 */
export async function prepareGeneration({ project, page, settings, body = {} }) {
  const compiled = compilePage(page, compileContext(project, page));
  const errors = blocking(compiled.warnings);
  if (errors.length) {
    return { ok: false, status: 400, error: errors[0].message, warnings: compiled.warnings, compiled };
  }

  const loras = parseLoras(body.lora ?? settings.defaults.lora);
  const workflow = await pickWorkflow(settings, loras);
  const defaults = settings.defaults;
  const size = page.size;
  const seed = Number.isFinite(Number(body.seed)) && Number(body.seed) >= 0 ? Number(body.seed) : defaults.seed >= 0 ? defaults.seed : randomSeed();
  const lora = loras[0] || { name: '', weight: 0 };

  const values = {
    prompt: compiled.json,
    negative: body.negative ?? defaults.negative,
    width: size.width,
    height: size.height,
    seed,
    steps: body.steps ?? defaults.steps,
    cfg: body.cfg ?? defaults.cfg,
    sampler: body.sampler ?? defaults.sampler,
    scheduler: body.scheduler ?? defaults.scheduler,
    ckpt: body.ckpt ?? defaults.ckpt,
    lora_name: lora.name,
    lora_strength: lora.weight,
    batch_size: 1,
  };

  const params = describeWorkflow(workflow.raw);
  if (!params.ok) {
    return { ok: false, status: 400, error: `工作流有问题：${params.error}`, warnings: compiled.warnings, compiled };
  }
  if (!values.ckpt) {
    return { ok: false, status: 400, error: '还没有设置检查点（ckpt），去设置页选一个，或在工作流里把 {{ckpt}} 换成固定值', warnings: compiled.warnings, compiled };
  }

  let graph;
  try {
    graph = fillGraph(JSON.parse(workflow.raw), values);
  } catch (err) {
    if (err instanceof MissingParam) {
      return {
        ok: false,
        status: 400,
        error: `工作流里有未提供的占位符：{{${err.param}}}（已知参数：${params.params.map((p) => p.name).join(', ')}）`,
        warnings: compiled.warnings,
        compiled,
      };
    }
    throw err;
  }

  return { ok: true, graph, values, workflow: workflow.name, compiled, loras, seed };
}

export async function runGeneration({ projectId, page, prepared, settings, job }) {
  const client = comfyFromSettings(settings);
  updateJob(job.id, { status: 'running' });
  try {
    const result = await client.run(prepared.graph, {
      timeoutMs: settings.comfy.timeoutMs || 180000,
      onProgress: (p) => updateJob(job.id, { progress: p }),
      onEvent: (e) => {
        if (e.type === 'queued') updateJob(job.id, { promptId: e.promptId });
      },
    });

    const image = result.images[0];
    const buffer = await client.view({ filename: image.filename, subfolder: image.subfolder, type: image.type });
    const ext = (image.filename.split('.').pop() || 'png').toLowerCase();
    const stored = await saveImage(projectId, buffer, ext);
    const version = await addVersion(projectId, page.id, {
      image: stored.url,
      file: stored.file,
      hash: stored.hash,
      promptJson: prepared.compiled.json,
      promptHash: sha256(prepared.compiled.json),
      workflow: prepared.workflow,
      seed: prepared.seed,
      width: page.size.width,
      height: page.size.height,
      steps: prepared.values.steps,
      cfg: prepared.values.cfg,
      sampler: prepared.values.sampler,
      scheduler: prepared.values.scheduler,
      lora: prepared.loras,
      warnings: prepared.compiled.warnings.filter((w) => w.level === 'warn').length,
      comfyPromptId: result.promptId,
      ms: result.ms,
      jobId: job.id,
    });
    updateJob(job.id, { status: 'done', version, ms: result.ms, progress: { value: 1, max: 1 } });
  } catch (err) {
    updateJob(job.id, {
      status: 'error',
      error: err instanceof ComfyError ? err.message : err.message,
      details: err.details || null,
    });
  } finally {
    pruneJobs();
  }
}

export const routes = [
  route('POST', '/api/projects/:id/pages/:pageId/generate', async ({ req, res, params }) => {
    const project = await getProject(params.id);
    if (!project) return fail(res, 404, '项目不存在');
    const page = await getPage(params.id, params.pageId);
    if (!page) return fail(res, 404, '页面不存在');
    const settings = await getRawSettings();
    const body = await readBody(req);

    let prepared;
    try {
      prepared = await prepareGeneration({ project, page, settings, body });
    } catch (err) {
      return fail(res, err.status || 500, err.message);
    }
    if (!prepared.ok) {
      return json(res, prepared.status, { error: prepared.error, warnings: prepared.warnings || [] });
    }

    const job = createJob({
      projectId: params.id,
      pageId: page.id,
      pageIndex: page.index,
      seed: prepared.seed,
      workflow: prepared.workflow,
    });
    runGeneration({ projectId: params.id, page, prepared, settings, job });
    json(res, 202, { jobId: job.id, seed: prepared.seed, workflow: prepared.workflow });
  }),

  // 不提交，只返回「这一次会发给 ComfyUI 的完整图」，用于排查
  route('POST', '/api/projects/:id/pages/:pageId/graph', async ({ req, res, params }) => {
    const project = await getProject(params.id);
    if (!project) return fail(res, 404, '项目不存在');
    const page = await getPage(params.id, params.pageId);
    if (!page) return fail(res, 404, '页面不存在');
    const settings = await getRawSettings();
    const body = await readBody(req);
    try {
      const prepared = await prepareGeneration({ project, page, settings, body });
      if (!prepared.ok) return json(res, prepared.status, { error: prepared.error, warnings: prepared.warnings || [] });
      json(res, 200, { workflow: prepared.workflow, values: prepared.values, graph: prepared.graph, warnings: prepared.compiled.warnings });
    } catch (err) {
      fail(res, err.status || 500, err.message);
    }
  }),

  route('GET', '/api/jobs', async ({ res }) => {
    json(res, 200, { jobs: listJobs() });
  }),

  route('GET', '/api/jobs/:id', async ({ res, params }) => {
    const job = getJob(params.id);
    if (!job) return fail(res, 404, '任务不存在');
    json(res, 200, job);
  }),

  route('GET', '/api/jobs/stream', async ({ req, res }) => {
    const stream = sse(res);
    const listener = (job) => stream.send('job', job);
    bus.on('job', listener);
    stream.onClientClose(() => bus.off('job', listener));
    // 先补发当前所有任务，避免前端连上之前错过
    for (const job of listJobs()) stream.send('job', job);
  }),

  route('POST', '/api/jobs/:id/cancel', async ({ res, params }) => {
    const job = getJob(params.id);
    if (!job) return fail(res, 404, '任务不存在');
    const settings = await getRawSettings();
    try {
      await comfyFromSettings(settings).interrupt();
    } catch {
      /* ComfyUI 没开就忽略 */
    }
    updateJob(job.id, { status: 'canceled', error: '已取消' });
    json(res, 200, { ok: true });
  }),
];
