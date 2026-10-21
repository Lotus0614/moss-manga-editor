// items → Moss Layout JSON。
//
// 这是全项目唯一允许做坐标转换的地方。输出必须满足 Moss 模板《JSON Layout》的契约：
//   - 只保留 summary / items 两个顶层字段
//   - items 扁平、非空，每项只有 label/caption/bbox/text
//   - bbox 为中心原点、yxyx、整数
//   - 单行 JSON

import {
  pageSize,
  toMoss,
  PANEL_SHAPES,
  FRAME_STYLES,
  CAMERAS,
  STYLE_PRESETS,
  READING_ORDERS,
  isVertical,
  panelsOf,
  bubblesOf,
  bboxCenter,
} from './manga-doc.mjs';
import { bubblePhrase } from './bubbles.mjs';
import { validatePage } from './validate.mjs';

const MAX_PER_COLUMN = 12;

/**
 * 编译一页。items 按数组顺序输出（作者顺序即模型读到的顺序）。
 * @param {object} page
 * @param {{characterText?:string, sceneText?:string, note?:string}} [ctx]
 */
export function compilePage(page, ctx = {}) {
  const size = pageSize(page);
  const style = STYLE_PRESETS[page.style] || STYLE_PRESETS.mono;
  const guard = style.guard || '';
  const panels = panelsOf(page);
  const bubbles = bubblesOf(page);

  const caption = buildSummary(page, panels, bubbles, style, ctx);
  const items = [];

  for (const item of page.items || []) {
    const base = { bbox: toMoss(item.bbox, size) };
    const extra = {};
    if (Array.isArray(item.tags) && item.tags.length) extra.tags = item.tags;
    if (Array.isArray(item.palette) && item.palette.length) extra.palette = item.palette;

    if (item.type === 'panel') {
      items.push({ label: 'object', caption: panelCaption(item, guard), ...base, ...extra });
    } else if (item.type === 'bubble') {
      items.push({ label: 'text', caption: bubbleCaption(item, page, size, guard), ...base, ...extra, ...(item.text ? { text: item.text } : {}) });
    } else if (item.type === 'native') {
      items.push({
        label: item.label || 'object',
        caption: [item.caption, guard].filter(Boolean).join(', '),
        ...base,
        ...extra,
        ...(item.text ? { text: item.text } : {}),
      });
    }
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
      'Dialogue is set in white speech bubbles with tails, thoughts in white cloud bubbles with no tail, and narration is bare lettering printed directly on the artwork with no bubble, no box and no background.'
    );
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

// ---------------------------------------------------------------- 各类 item

function panelCaption(panel, guard) {
  const shape = PANEL_SHAPES[panel.shape] || PANEL_SHAPES.rect;
  const frame = FRAME_STYLES[panel.frame] || FRAME_STYLES.border;
  const camera = CAMERAS[panel.camera];
  const parts = [shape.phrase];

  if (!String(panel.shape || '').startsWith('bleed')) parts.push(frame.phrase);
  if (camera) parts.push(camera.phrase);

  const body = (panel.caption || '').trim();
  if (body) parts.push(`This box contains only: ${body}`);
  if (guard) parts.push(guard);
  return parts.join(', ');
}

function bubbleCaption(bubble, page, size, guard) {
  const parts = [bubblePhrase(bubble)];
  parts.push(`placed in the ${placementWord(bubble.bbox, size)}`);
  parts.push(textLayout(bubble, isVertical(page, bubble)));
  if (guard) parts.push(guard);
  return parts.join(', ');
}

function placementWord(bbox, size) {
  const [cx, cy] = bboxCenter(bbox);
  const rx = cx / size.width;
  const ry = cy / size.height;
  const vertical = ry < 0.34 ? 'upper' : ry > 0.66 ? 'lower' : 'middle';
  const horizontal = rx < 0.34 ? 'left' : rx > 0.66 ? 'right' : 'centre';
  return `${vertical} ${horizontal} area of the page`;
}

function textLayout(bubble, vertical) {
  const [x1, y1, x2, y2] = bubble.bbox;
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const fs = Math.max(8, Number(bubble.size) || 22);
  if (!vertical) {
    const cols = Math.max(1, Math.floor(w / (fs * 1.02)));
    const rows = Math.max(1, Math.floor(h / (fs * 1.3)));
    return `Horizontal lettering, about ${rows} lines of ${cols} characters each`;
  }
  const cols = Math.max(1, Math.floor(w / (fs * 1.15)));
  const perCol = Math.max(1, Math.min(Math.floor(h / (fs * 1.35)), MAX_PER_COLUMN));
  return `Vertical lettering in ${cols} column${cols > 1 ? 's' : ''} read right to left, about ${perCol} characters per column`;
}

/** 供 UI 显示「这一条会写进提示词的形态描述」 */
export function previewBubbleCaption(bubble, size) {
  return bubbleCaption(bubble, { vertical: true }, size || { width: 768, height: 1280 }, '');
}
