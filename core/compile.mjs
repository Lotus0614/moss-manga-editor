// items → Moss Layout JSON 的通用 walker。
//
// 内核不认识任何漫画概念：类型、写法、summary 全由调用方注入。
//   types        [{ key, role?, fields, compile({ item, page, prompts }) }]
//   prompts      词表 / 句式
//   buildSummary ({ page, items, prompts }) => { meta, canvas, caption }

import { pageSize, toMoss } from './manga-doc.mjs';
import { ITEM_TYPES, getBuildSummary } from './runtime.mjs';
import { prompts as defaultPrompts } from '../config/prompts.mjs';
import { buildSummary as defaultBuildSummary } from '../config/types.mjs';
import { validatePage } from './validate.mjs';

export function compilePage(page, opts = {}) {
  // 调用方不给就退回配置里的词表与类型
  const types = opts.types || ITEM_TYPES;
  const prompts = opts.prompts || defaultPrompts;
  const buildSummary = opts.buildSummary || getBuildSummary() || defaultBuildSummary;
  const byKey = new Map(types.map((t) => [t.key, t]));
  const size = pageSize(page);

  const items = [];
  for (const item of page.items || []) {
    const type = byKey.get(item.type);
    if (!type) continue;
    const compiled = type.compile({ item, page, prompts });
    const out = { label: compiled.label, caption: compiled.caption, bbox: toMoss(item.bbox, size) };
    if (compiled.text) out.text = compiled.text;
    if (Array.isArray(item.tags) && item.tags.length) out.tags = item.tags;
    if (Array.isArray(item.palette) && item.palette.length) out.palette = item.palette;
    items.push(out);
  }

  const doc = {
    summary: buildSummary ? buildSummary({ page, items, prompts }) : { meta: [], canvas: 'single', caption: '' },
    items,
    bbox_coord_space: 'abs_centralized',
    bbox_format: 'yxyx',
  };

  const json = JSON.stringify(doc);
  return {
    doc,
    json,
    warnings: validatePage(page, doc),
    stats: {
      items: items.length,
      chars: doc.summary.caption.length,
      bytes: new TextEncoder().encode(json).length,
    },
  };
}
