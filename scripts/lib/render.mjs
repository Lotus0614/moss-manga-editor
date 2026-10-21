// 渲染一页：编译 → 填工作流 → 提交 ComfyUI → 取图 → 存版本。

import { compilePage } from '../../core/compile.mjs';
import { compileContext } from '../../core/bible.mjs';
import { blocking } from '../../core/validate.mjs';
import { comfyFromSettings } from './comfy.mjs';
import { readWorkflow, buildValues, fillWorkflow, parseLoras } from './workflow.mjs';
import { saveImage, addVersion } from './archive.mjs';

/**
 * 只准备不提交，用于 --dry-run 与错误定位。
 */
export async function prepareRender({ dir, project, page, config, opts = {} }) {
  const compiled = compilePage(page, compileContext(project, page));
  const errors = blocking(compiled.warnings);
  if (errors.length) {
    return { ok: false, error: `这一页还有错误：${errors[0].message}`, warnings: compiled.warnings };
  }

  const values = buildValues({ page, project, config, opts });
  values.prompt = compiled.json;

  if (!values.ckpt) {
    return {
      ok: false,
      error: '还没有设置检查点 ckpt：用 `manga config set defaults.ckpt <文件名>`，或在设置页里选一个',
      warnings: compiled.warnings,
    };
  }

  const workflow = await readWorkflow(dir, config.workflow?.name || 'default.json');
  const warnings = [...compiled.warnings];
  const loras = parseLoras(opts.lora ?? config.defaults?.lora);
  if (loras.length && !String(workflow.raw).includes('{{lora_name}}')) {
    warnings.push({
      level: 'warn',
      code: 'lora.unsupported',
      message: `工作流没有 {{lora_name}} 占位符，LoRA「${loras[0].name}」不会生效`,
    });
  }

  let graph;
  try {
    graph = fillWorkflow(workflow.raw, values);
  } catch (err) {
    return { ok: false, error: err.message, warnings };
  }

  return { ok: true, graph, values, workflow: workflow.name, compiled, warnings, loras };
}

/**
 * 真正出图。会写图片与版本记录。
 * @param {{dir:string, slug:string, project:object, page:object, config:object, opts?:object, onProgress?:Function}} input
 */
export async function renderPage({ dir, slug, project, page, config, opts = {}, onProgress }) {
  const prepared = await prepareRender({ dir, project, page, config, opts });
  if (!prepared.ok) throw Object.assign(new Error(prepared.error), { warnings: prepared.warnings });

  const client = comfyFromSettings(config);
  const result = await client.run(prepared.graph, {
    timeoutMs: Number(opts.timeoutMs) || config.comfy?.timeoutMs || 180000,
    onProgress: (p) => onProgress?.(p),
  });

  const image = result.images[0];
  if (!image) throw new Error('ComfyUI 没有返回任何图片');

  const buffer = await client.view({ filename: image.filename, subfolder: image.subfolder, type: image.type });
  const ext = (image.filename.split('.').pop() || 'png').toLowerCase();
  const stored = await saveImage(dir, slug, buffer, ext);

  const version = await addVersion(dir, slug, {
    page: page.id,
    pageIndex: page.index,
    image: stored.url,
    file: stored.file,
    hash: stored.hash,
    promptJson: prepared.compiled.json,
    seed: prepared.values.seed,
    width: prepared.values.width,
    height: prepared.values.height,
    steps: prepared.values.steps,
    cfg: prepared.values.cfg,
    sampler: prepared.values.sampler,
    scheduler: prepared.values.scheduler,
    lora: prepared.loras,
    workflow: prepared.workflow,
    comfyPromptId: result.promptId,
    ms: result.ms,
  });

  return {
    version,
    image: stored.url,
    file: stored.file,
    seed: prepared.values.seed,
    ms: result.ms,
    warnings: prepared.warnings,
  };
}
