// 修图：拿这一页的一版**渲染图**当参考图 → 上传 ComfyUI → 填编辑工作流 → 取图 → 存新版本。
//
// 和 render.mjs 对称：这里只认「配置里的文件名字」和「工作流里的占位符」，
// 不认识模型、尺寸、步数——那些都写在工作流里，代码不覆盖。

import { createHash } from 'node:crypto';

import { buildEditPrompt } from '../../config/manga.mjs';
import { pageSize } from '../../core/manga-doc.mjs';
import { describeWorkflow } from '../../core/placeholders.mjs';
import { comfyFromSettings } from './comfy.mjs';
import { readWorkflow, fillWorkflow, pickSeed } from './workflow.mjs';
import { getVersions, currentOf, imageBytes, saveImage, addVersion } from './archive.mjs';

/** 编辑工作流必须提供的三个占位符：参考图 + 指令 + 种子（种子写死会让连续修图发糊） */
export const EDIT_PARAMS = ['prompt', 'image', 'seed'];

/** 拿来当参考图的版本：就是当前采用的那一版（渲染版、修图版都行） */
export function sourceVersion(store, pageId) {
  const items = (store?.items || []).filter((v) => v.page === pageId);
  if (!items.length) return null;
  const current = currentOf(store, pageId);
  return items.find((v) => v.id === current) || items[items.length - 1];
}

/**
 * 推荐拿来当参考图的那一版：顺着 base 一路退回渲染版。
 * 只是「建议」——在改过的图上接着改会让版式和画质越跑越偏，所以界面上提示一下，
 * 但不再强制，用户想从哪一版改就从哪一版改。
 */
export function recommendedVersion(store, pageId) {
  const items = (store?.items || []).filter((v) => v.page === pageId);
  if (!items.length) return null;
  const current = currentOf(store, pageId);
  const picked = items.find((v) => v.id === current) || items[items.length - 1];
  if (picked.kind !== 'edit') return picked;

  const byId = new Map(items.map((v) => [v.id, v]));
  const seen = new Set();
  let base = picked;
  while (base && base.kind === 'edit' && !seen.has(base.id)) {
    seen.add(base.id);
    base = base.base ? byId.get(base.base) : null;
  }
  // 基准链断了（老数据没有 base）：退回这一页最早那版渲染；一版渲染都没有就只能推荐当前这版
  return base && base.kind !== 'edit' ? base : items.find((v) => v.kind !== 'edit') || picked;
}

/** 提交给工作流的取值：用户参数（项目 > 全局）再叠自动项 */
export function buildEditValues({ page, config, project, prompt, seed, image }) {
  const { width, height } = pageSize(page);
  return {
    ...(config?.params || {}),
    ...(project?.params || {}),
    prompt,
    image,
    width,
    height,
    seed: pickSeed(seed),
  };
}

/**
 * 预检 + 组装。返回 {ok, workflow, raw, base, prompt, values}，
 * 不碰网：上传由调用方做（--dry-run 就停在这一步之后）。
 */
export async function prepareEdit({ dir, configDir, project, page, config, opts = {} }) {
  const name = String(config?.edit?.name || '').trim();
  if (!name) {
    return {
      ok: false,
      error:
        '还没有修图工作流：把 Qwen 的「导出 (API)」JSON 改两处（LoadImage 的 image → {{image}}，提示词节点 → {{prompt}}），' +
        '用 `manga workflow save xxx.json --name edit.json --no-activate` 存进来，再 `manga config set edit.name=edit.json`',
    };
  }

  const store = await getVersions(dir, project.slug);
  const base = sourceVersion(store, page.id);
  if (!base) {
    return { ok: false, error: '这一页还没有图：先在网页点「生成」，或用 `manga render` 出一版，修图是改现成的图' };
  }

  const marks = Array.isArray(opts.marks) ? opts.marks : [];
  const prompt = buildEditPrompt({ request: opts.prompt, marks });
  if (!prompt) return { ok: false, error: '写一句要改什么：manga edit --page 3 --prompt "把左上角气泡的尾巴删掉"' };

  let workflow;
  try {
    workflow = await readWorkflow(configDir, name);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const desc = describeWorkflow(workflow.raw);
  if (!desc.ok) return { ok: false, error: desc.error };
  const names = new Set(desc.params.map((p) => p.name));
  const missing = EDIT_PARAMS.filter((key) => !names.has(key));
  if (missing.length) {
    return {
      ok: false,
      error: `修图工作流 ${workflow.name} 缺占位符：${missing.map((m) => `{{${m}}}`).join('、')}（三处：LoadImage 的 image、提示词节点、KSampler 的 seed；seed 写死会让连续修图发糊）`,
    };
  }

  const values = buildEditValues({ page, config, project, prompt, seed: opts.seed, image: '' });
  // 工作流没写 {{seed}} 时种子是写死的，记一个没用上的随机数只会误导
  return { ok: true, workflow: workflow.name, raw: workflow.raw, base, prompt, values, marks, seedParam: names.has('seed') };
}

/** 把参考图的名字填进图里（--dry-run 用一个占位名字，正式提交用上传后的路径） */
export function fillEdit(prepared, image) {
  return fillWorkflow(prepared.raw, { ...prepared.values, image });
}

export async function editPage({ dir, configDir, slug, project, page, config, opts = {}, onProgress }) {
  const prepared = await prepareEdit({ dir, configDir, project, page, config, opts });
  if (!prepared.ok) throw Object.assign(new Error(prepared.error), { code: 'edit' });

  const client = comfyFromSettings(config);
  // 涂鸦图（画好标记的那张）由调用方给；没有就用这一版的渲染图
  const overlay = Buffer.isBuffer(opts.overlay) && opts.overlay.length ? opts.overlay : null;
  const buffer = overlay || (await imageBytes(dir, slug, prepared.base.file));
  const ext = overlay
    ? String(opts.overlayExt || 'png').toLowerCase()
    : (prepared.base.file.split('.').pop() || 'png').toLowerCase();
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 12);
  const image = await client.uploadImage(buffer, `moss_edit_${hash}.${ext}`);
  // 涂鸦图存一份进存档：出问题能回看当时标的是哪块
  const marksStore = overlay ? await saveImage(dir, slug, overlay, ext) : null;

  const graph = fillEdit(prepared, image);
  const result = await client.run(graph, {
    timeoutMs: Number(opts.timeoutMs) || config.comfy?.timeoutMs || 180000,
    onProgress: (p) => onProgress?.(p),
  });

  const output = result.images[0];
  if (!output) throw new Error('ComfyUI 没有返回任何图片（编辑工作流里得有一个保存图片的节点）');

  const bytes = await client.view({ filename: output.filename, subfolder: output.subfolder, type: output.type });
  const outExt = (output.filename.split('.').pop() || 'png').toLowerCase();
  const stored = await saveImage(dir, slug, bytes, outExt);

  const version = await addVersion(dir, slug, {
    page: page.id,
    pageIndex: page.index,
    image: stored.url,
    file: stored.file,
    hash: stored.hash,
    kind: 'edit',
    base: prepared.base.id,
    editPrompt: String(opts.prompt || '').trim(),
    prompt: prepared.prompt,
    ...(prepared.seedParam ? { seed: prepared.values.seed } : {}),
    ...(marksStore ? { overlay: marksStore.url, marks: prepared.marks } : {}),
    workflow: prepared.workflow,
    comfyPromptId: result.promptId,
    ms: result.ms,
  });

  return {
    version,
    image: stored.url,
    file: stored.file,
    base: prepared.base.id,
    prompt: prepared.prompt,
    ms: result.ms,
  };
}
