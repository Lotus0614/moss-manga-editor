// items → Moss Layout JSON。
//
// 类型相关的部分（字段、措辞、编译规则）都在 core/registry.mjs；
// 这里只负责：拼 summary、算编号、定位文字、坐标换算、序列化。

import {
  pageSize,
  toMoss,
  STYLE_PRESETS,
  READING_ORDERS,
  isVertical,
  panelsOf,
  bubblesOf,
  readingOrderOf,
  bboxCenter,
} from './manga-doc.mjs';
import { ITEM_TYPE_MAP } from './registry.mjs';
import { validatePage } from './validate.mjs';

export function compilePage(page, ctx = {}) {
  const size = pageSize(page);
  const style = STYLE_PRESETS[page.style] || STYLE_PRESETS.mono;
  const guard = style.guard || '';
  const panels = panelsOf(page);
  const bubbles = bubblesOf(page);

  const caption = buildSummary(page, panels, bubbles, style, ctx);
  const no = new Map(readingOrderOf(page).map((p, i) => [p.id, i + 1]));

  const typeCtx = {
    page,
    size,
    guard,
    locate: (item) => locateInPanel(item, panels, no),
    placement: (bbox) => placementWord(bbox, size),
    textLayout,
  };

  const items = [];
  for (const item of page.items || []) {
    const type = ITEM_TYPE_MAP[item.type];
    if (!type) continue; // 未知类型由 validate 报错

    const compiled = type.compile({
      item,
      ctx: { ...typeCtx, number: no.get(item.id), vertical: isVertical(page, item) },
    });

    const out = { label: compiled.label, caption: compiled.caption, bbox: toMoss(item.bbox, size) };
    if (compiled.text) out.text = compiled.text;
    if (Array.isArray(item.tags) && item.tags.length) out.tags = item.tags;
    if (Array.isArray(item.palette) && item.palette.length) out.palette = item.palette;
    items.push(out);
  }

  const doc = {
    summary: {
      meta: style.meta,
      canvas: panels.length > 1 || bubbles.length > 1 ? 'multi_panel' : 'single',
      caption,
    },
    items,
    bbox_coord_space: 'abs_centralized',
    bbox_format: 'yxyx',
  };

  const json = JSON.stringify(doc);
  const warnings = validatePage(page, doc);

  return {
    doc,
    json,
    warnings,
    stats: {
      panels: panels.length,
      bubbles: bubbles.length,
      items: items.length,
      chars: caption.length,
      bytes: new TextEncoder().encode(json).length,
    },
  };
}

// ---------------------------------------------------------------- summary

function buildSummary(page, panels, bubbles, style, ctx) {
  const parts = [style.phrase];
  const order = READING_ORDERS[page.reading] || READING_ORDERS.rtl;

  if (panels.length > 0) {
    parts.push(`The page is divided into ${panels.length} ${panels.length === 1 ? 'panel' : 'panels'}. ${order.phrase}`);
  }

  if (bubbles.length > 0) {
    parts.push(
      `This page has exactly ${panels.length} panel${panels.length === 1 ? '' : 's'} and exactly ${bubbles.length} text element${bubbles.length === 1 ? '' : 's'}. Render ONLY the text listed below, with the exact wording given. Do NOT invent any additional dialogue, speech bubble, caption, sound effect or lettering, and do not fill empty space with text — any text that is not listed is an error.`
    );
    parts.push(
      'Dialogue uses white speech bubbles with tails, thoughts use white cloud bubbles with no tail, and narration is bare lettering printed directly on the artwork with no bubble, no box and no background.'
    );
  } else {
    parts.push('This page contains NO lettering at all: no speech bubbles, no captions, no sound effects, no text of any kind.');
  }

  const characterText = (ctx.characterText || '').trim();
  if (characterText) parts.push(characterText);

  const sceneText = ((ctx.sceneText ?? page.scene) || '').trim();
  if (sceneText) parts.push(sceneText);

  const note = ((ctx.note ?? page.note) || '').trim();
  if (note) parts.push(note);

  if (style.guard) parts.push(style.guard);

  return parts.join('\n\n');
}

// ---------------------------------------------------------------- 位置与排版

/** 文字落在哪个 PANEL：完全在里面 / 压到边缘 */
function locateInPanel(item, panels, no) {
  const [bx1, by1, bx2, by2] = item.bbox;
  const cx = (bx1 + bx2) / 2;
  const cy = (by1 + by2) / 2;
  let chosen = null;
  let bestArea = 0;

  for (const p of panels) {
    const [x1, y1, x2, y2] = p.bbox;
    const inside = cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
    const ix = Math.min(bx2, x2) - Math.max(bx1, x1);
    const iy = Math.min(by2, y2) - Math.max(by1, y1);
    const area = ix > 0 && iy > 0 ? ix * iy : 0;
    if (inside) {
      chosen = p;
      break;
    }
    if (area > bestArea) {
      bestArea = area;
      chosen = p;
    }
  }
  if (!chosen) return '';
  const [x1, y1, x2, y2] = chosen.bbox;
  const fully = bx1 >= x1 - 2 && bx2 <= x2 + 2 && by1 >= y1 - 2 && by2 <= y2 + 2;
  return `${fully ? 'inside' : 'at the edge of'} PANEL ${no.get(chosen.id) || '?'}`;
}

function placementWord(bbox, size) {
  const [cx, cy] = bboxCenter(bbox);
  const rx = cx / size.width;
  const ry = cy / size.height;
  const vertical = ry < 0.34 ? 'upper' : ry > 0.66 ? 'lower' : 'middle';
  const horizontal = rx < 0.34 ? 'left' : rx > 0.66 ? 'right' : 'centre';
  return `${vertical} ${horizontal} area of the page`;
}

/** 只描述方向，不算列数/字数、不提字号（报数字会让模型把框画歪） */
function textLayout(_bubble, vertical) {
  return vertical ? 'vertical lettering, columns read right to left' : 'horizontal lettering';
}
