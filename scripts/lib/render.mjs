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
export async function prepareRender({ dir, configDir = dir, project, page, config, opts = {} }) {
  const compiled = compilePage(page, compileContext(project, page));
  const errors = blocking(compiled.warnings);
  if (errors.length) {
    return { ok: false, error: `这一页还有错误：${errors[0].message}`, warnings: compiled.warnings };
  }

  if (!config.workflow?.name) {
    return {
      ok: false,
      error: '还没有工作流：把你的 ComfyUI「导出 (API)」JSON 发我，我改好占位符后用 `manga workflow save` 存进去',
      warnings: compiled.warnings,
    };
  }

  let workflow;
  try {
    workflow = await readWorkflow(configDir, config.workflow.name);
  } catch (err) {
    return { ok: false, error: err.message, warnings: compiled.warnings };
  }

  // 生图参数：项目级覆盖全局，没填就跟随全局
  const generation = project?.generation || {};
  const effective = {
    ...config,
    defaults: { ...config.defaults, ...Object.fromEntries(Object.entries(generation).filter(([, v]) => v !== '' && v !== undefined && v !== null)) },
  };
  const values = { ...(config.params || {}), ...buildValues({ page, project, config: effective, opts }) };
  values.prompt = compiled.json;

  // 工作流用到哪些参数，就必须填哪些；没用到的一个都不要求
  const REQUIRED = [
    ['ckpt', '检查点'],
    ['steps', '步数'],
    ['cfg', 'CFG'],
    ['sampler', '采样器'],
    ['scheduler', '调度器'],
    ['denoise', '重绘幅度'],
  ];
  const missing = REQUIRED.filter(([key]) => new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(workflow.raw))
    .filter(([key]) => values[key] === '' || values[key] === undefined || values[key] === null)
    .map(([key, label]) => `{{${key}}}（${label}）`);
  if (missing.length) {
    return {
      ok: false,
      error: `工作流需要这些参数，但还没填：${missing.join('、')}。在设置里填一下。`,
      warnings: compiled.warnings,
    };
  }

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
 */
export async function renderPage({ dir, configDir, slug, project, page, config, opts = {}, onProgress }) {
  const prepared = await prepareRender({ dir, configDir, project, page, config, opts });
  if (!prepared.ok) throw Object.assign(new Error(prepared.error), { warnings: prepared.warnings });

  const client = comfyFromSettings(config);
  const result = await client.run(prepared.graph, {
    timeoutMs: Number(opts.timeoutMs) || config.comfy?.timeoutMs || 180000,
    onProgress: (p) => onProgress?.(p),
  });

  const image = result.images[0];
  if (!image) throw new Error('ComfyUI 没有返回任何图片（工作流里需要一个 SaveImage / PreviewImage 类节点）');

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
