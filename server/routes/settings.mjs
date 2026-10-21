// 设置、工作流、ComfyUI 能力探测。

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { json, fail, readBody, route } from '../http.mjs';
import { getSettings, saveSettings, getRawSettings } from '../store.mjs';
import { describeWorkflow } from '../../core/placeholders.mjs';
import { ComfyClient } from '../comfy.mjs';
import { testLlm } from '../llm.mjs';

const WORKFLOW_DIR = resolve(process.env.MOSS_WORKFLOWS || join(process.cwd(), 'workflows'));

async function readWorkflow(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe.endsWith('.json')) throw Object.assign(new Error('工作流文件名必须以 .json 结尾'), { status: 400 });
  return readFile(join(WORKFLOW_DIR, safe), 'utf8');
}

export const routes = [
  route('GET', '/api/settings', async ({ res }) => {
    json(res, 200, await getSettings());
  }),

  route('PUT', '/api/settings', async ({ req, res }) => {
    const patch = await readBody(req);
    const saved = await saveSettings(patch);
    json(res, 200, saved);
  }),

  // 测试 ComfyUI：可以传未保存的 url/token
  route('POST', '/api/settings/test-comfy', async ({ req, res }) => {
    const body = await readBody(req);
    const raw = await getRawSettings();
    const url = body.url || raw.comfy.url;
    const token = body.token && body.token !== '***' ? body.token : raw.comfy.token;
    const client = new ComfyClient({ url, token });
    try {
      const stats = await client.stats();
      const info = await client.objectInfo();
      const counts = {
        checkpoints: info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]?.length || 0,
        loras: info.LoraLoader?.input?.required?.lora_name?.[0]?.length || 0,
        samplers: info.KSampler?.input?.required?.sampler_name?.[0]?.length || 0,
      };
      json(res, 200, {
        ok: true,
        message: `连接正常 · ${stats.system?.comfyui_version || '未知版本'} · ${counts.checkpoints} 个检查点 / ${counts.loras} 个 LoRA`,
        counts,
        devices: (stats.devices || []).map((d) => ({ name: d.name, vram: d.vram_total })),
      });
    } catch (err) {
      json(res, 200, { ok: false, message: err.message });
    }
  }),

  route('POST', '/api/settings/test-llm', async ({ req, res }) => {
    const body = await readBody(req);
    const raw = await getRawSettings();
    const merged = {
      ...raw,
      llm: {
        ...raw.llm,
        baseUrl: body.baseUrl || raw.llm.baseUrl,
        model: body.model || raw.llm.model,
        apiKey: body.apiKey && body.apiKey !== '***' ? body.apiKey : raw.llm.apiKey,
      },
    };
    json(res, 200, await testLlm(merged));
  }),

  route('GET', '/api/workflows', async ({ res }) => {
    await mkdir(WORKFLOW_DIR, { recursive: true });
    const files = (await readdir(WORKFLOW_DIR)).filter((f) => f.endsWith('.json'));
    const out = [];
    for (const file of files) {
      const raw = await readFile(join(WORKFLOW_DIR, file), 'utf8');
      const desc = describeWorkflow(raw);
      out.push({ name: file, ok: desc.ok, error: desc.error || '', params: desc.params || [], nodeCount: desc.nodeCount || 0 });
    }
    json(res, 200, { dir: WORKFLOW_DIR, workflows: out });
  }),

  route('GET', '/api/workflows/:name', async ({ res, params }) => {
    try {
      const raw = await readWorkflow(params.name);
      const desc = describeWorkflow(raw);
      json(res, 200, { name: params.name, raw, ...desc });
    } catch (err) {
      fail(res, err.status || 404, err.message);
    }
  }),

  // 用户把自己的 API 格式工作流贴进来即可替换
  route('PUT', '/api/workflows/:name', async ({ req, res, params }) => {
    const body = await readBody(req);
    const raw = typeof body.raw === 'string' ? body.raw : JSON.stringify(body.raw, null, 2);
    const desc = describeWorkflow(raw);
    if (!desc.ok) return fail(res, 400, desc.error);
    const safe = String(params.name).replace(/[^a-zA-Z0-9._-]/g, '');
    const name = safe.endsWith('.json') ? safe : `${safe}.json`;
    await mkdir(WORKFLOW_DIR, { recursive: true });
    await writeFile(join(WORKFLOW_DIR, name), raw.endsWith('\n') ? raw : `${raw}\n`, 'utf8');
    json(res, 200, { name, ...desc });
  }),

  // 从 ComfyUI 拉可选模型/采样器，供设置页下拉框使用
  route('GET', '/api/comfy/models', async ({ res }) => {
    const raw = await getRawSettings();
    const client = new ComfyClient({ url: raw.comfy.url, token: raw.comfy.token });
    try {
      const info = await client.objectInfo();
      json(res, 200, {
        ok: true,
        checkpoints: info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [],
        loras: info.LoraLoader?.input?.required?.lora_name?.[0] || [],
        samplers: info.KSampler?.input?.required?.sampler_name?.[0] || [],
        schedulers: info.KSampler?.input?.required?.scheduler?.[0] || [],
      });
    } catch (err) {
      json(res, 200, { ok: false, message: err.message, checkpoints: [], loras: [], samplers: [], schedulers: [] });
    }
  }),
];
