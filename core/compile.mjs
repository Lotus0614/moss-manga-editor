// items → Moss Layout JSON 的通用 walker。
//
// 内核不认识任何漫画概念：类型、写法、summary 全从配置管理器取。
//   config-store 提供 types / buildSummary，方言自己负责 compile 的内容。

import { pageSize, toMoss } from './manga-doc.mjs';
import { itemType, buildSummary } from './config-store.mjs';
import { validatePage } from './validate.mjs';

export function compilePage(page) {
  const size = pageSize(page);
  const items = [];

  for (const item of page.items || []) {
    const type = itemType(item.type);
    if (!type) continue;
    const compiled = type.compile({ item, page });
    const out = { label: compiled.label, caption: compiled.caption, bbox: toMoss(item.bbox, size) };
    if (compiled.text) out.text = compiled.text;
    if (Array.isArray(item.tags) && item.tags.length) out.tags = item.tags;
    if (Array.isArray(item.palette) && item.palette.length) out.palette = item.palette;
    items.push(out);
  }

  const doc = {
    summary: buildSummary({ page, items }),
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
