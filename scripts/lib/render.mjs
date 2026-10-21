// 渲染一页：编译 → 填工作流 → 提交 ComfyUI → 取图 → 存版本。

import { compilePage } from '../../core/compile.mjs';
import { compileContext } from '../../core/bible.mjs';
import { blocking } from '../../core/validate.mjs';
import { comfyFromSettings } from './comfy.mjs';
import { readWorkflow, buildValues, fillWorkflow } from './workflow.mjs';
import { saveImage, addVersion } from './archive.mjs';

export async function prepareRender({ dir, configDir = dir, project, page, config, opts = {} }) {
  const compiled = compilePage(page, compileContext(project, page));
  const errors = blocking(compiled.warnings);
  if (errors.length) return { ok: false, error: `这一页还有错误：${errors[0].message}`, warnings: compiled.warnings };

  if (!config.workflow?.name) {
    return {
      ok: false,
      error: '还没有工作流：把你的 ComfyUI「导出 (API)」JSON 发我，改好占位符后用 `manga workflow save` 存进去',
      warnings: compiled.warnings,
    };
  }

  let workflow;
  try {
    workflow = await readWorkflow(configDir, config.workflow.name);
  } catch (err) {
    return { ok: false, error: err.message, warnings: compiled.warnings };
  }

  // 取值：自动项覆盖一切；用户参数 项目 > 全局
  const auto = buildValues({ page, opts });
  auto.prompt = compiled.json;
  const values = { ...(config.params || {}), ...(project?.params || {}), ...auto };

  let graph;
  try {
    graph = fillWorkflow(workflow.raw, values);
  } catch (err) {
    return { ok: false, error: err.message, warnings: compiled.warnings };
  }

  return { ok: true, graph, values, workflow: workflow.name, compiled, warnings: compiled.warnings };
}

export async function renderPage({ dir, configDir, slug, project, page, config, opts = {}, onProgress }) {
  const prepared = await prepareRender({ dir, configDir, project, page, config, opts });
  if (!prepared.ok) throw Object.assign(new Error(prepared.error), { warnings: prepared.warnings });

  const client = comfyFromSettings(config);
  const result = await client.run(prepared.graph, {
    timeoutMs: Number(opts.timeoutMs) || config.comfy?.timeoutMs || 180000,
    onProgress: (p) => onProgress?.(p),
  });

  const image = result.images[0];
  if (!image) throw new Error('ComfyUI 没有返回任何图片（工作流里需要一个 SaveImage 之类节点）');

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
    params: Object.fromEntries(
      Object.entries(prepared.values).filter(([k]) => !['prompt', 'width', 'height'].includes(k))
    ),
    workflow: prepared.workflow,
    comfyPromptId: result.promptId,
    ms: result.ms,
  });

  return { version, image: stored.url, file: stored.file, seed: prepared.values.seed, ms: result.ms, warnings: prepared.warnings };
}
