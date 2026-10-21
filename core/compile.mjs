// 富文档 → Moss Layout JSON。
//
// 这是全项目唯一允许做坐标转换的地方。输出必须满足 Moss 模板《JSON Layout》的契约：
//   - 只保留 summary / items 两个顶层字段
//   - items 扁平、非空，每项只有 label/caption/bbox/text（可选 tags/palette）
//   - bbox 为中心原点、yxyx、整数
//   - 单行 JSON，字符串内换行需转义（JSON.stringify 自动处理）

import {
  pageSize,
  toMoss,
  PANEL_SHAPES,
  FRAME_STYLES,
  CAMERAS,
  STYLE_PRESETS,
  READING_ORDERS,
  readingOrderOf,
  bboxCenter,
} from './manga-doc.mjs';
import { bubblePhrase, bubbleType } from './bubbles.mjs';
import { validatePage } from './validate.mjs';

const MAX_PER_COLUMN = 12;

/**
 * 编译一页。
 * @param {object} page 富文档
 * @param {{characterText?:string, sceneText?:string, note?:string}} [ctx]
 *        人物与场景由调用方（CLI / 服务器）按项目 bible 解析好传进来。
 * @returns {{doc:object, json:string, warnings:Array, stats:object}}
 */
export function compilePage(page, ctx = {}) {
  const size = pageSize(page);
  const style = STYLE_PRESETS[page.style] || STYLE_PRESETS.mono;
  const guard = style.guard || '';

  const caption = buildSummary(page, size, style, ctx);
  const items = [];

  for (const panel of readingOrderOf(page)) {
    items.push({
      label: 'object',
      caption: panelCaption(panel, guard),
      bbox: toMoss(panel.bbox, size),
    });
  }

  for (const bubble of sortBubbles(page)) {
    const item = {
      label: 'text',
      caption: bubbleCaption(bubble, size, guard),
      bbox: toMoss(bubble.bbox, size),
    };
    if (bubble.text) item.text = bubble.text;
    items.push(item);
  }

  const doc = {
    summary: {
      meta: style.meta,
      canvas: autoCanvas(page),
      caption,
    },
    items,
  };

  const json = JSON.stringify(doc);
  const warnings = validatePage(page, doc);

  return {
    doc,
    json,
    warnings,
    stats: {
      panels: page.panels.length,
      bubbles: page.bubbles.length,
      items: items.length,
      chars: caption.length,
      bytes: new TextEncoder().encode(json).length,
    },
  };
}

function autoCanvas(page) {
  return page.panels.length > 1 || page.bubbles.length > 1 ? 'multi_panel' : 'single';
}

// ---------------------------------------------------------------- summary

function buildSummary(page, size, style, ctx) {
  const parts = [style.phrase];
  const order = READING_ORDERS[page.reading] || READING_ORDERS.rtl;

  if (page.panels.length > 0) {
    const n = page.panels.length;
    parts.push(`The page is divided into ${n} ${n === 1 ? 'panel' : 'panels'}. ${order.phrase}`);
  }

  if (page.bubbles.length > 0) {
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

// ---------------------------------------------------------------- items

function panelCaption(panel, guard) {
  const shape = PANEL_SHAPES[panel.shape] || PANEL_SHAPES.rect;
  const frame = FRAME_STYLES[panel.frame] || FRAME_STYLES.border;
  const camera = CAMERAS[panel.camera];
  const parts = [shape.phrase];

  // 出血格不描边，说明边框反而会让模型画出一条线
  if (!String(panel.shape || '').startsWith('bleed')) parts.push(frame.phrase);
  if (camera) parts.push(camera.phrase);

  const body = (panel.caption || '').trim();
  if (body) parts.push(`This box contains only: ${body}`);

  if (guard) parts.push(guard);
  return parts.join(', ');
}

function bubbleCaption(bubble, size, guard) {
  const parts = [bubblePhrase(bubble)];
  parts.push(`placed in the ${placementWord(bubble.bbox, size)}`);
  parts.push(textLayout(bubble));
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

function textLayout(bubble) {
  const [x1, y1, x2, y2] = bubble.bbox;
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const fs = Math.max(8, Number(bubble.size) || 22);
  const cols = Math.max(1, Math.floor(w / (fs * 1.15)));
  const perCol = Math.max(1, Math.floor(h / (fs * 1.35)));
  if (bubble.vertical === false) {
    return `Horizontal lettering, about ${perCol} lines of ${cols} characters each`;
  }
  const cap = Math.min(perCol, MAX_PER_COLUMN);
  return `Vertical lettering in ${cols} column${cols > 1 ? 's' : ''} read right to left, about ${cap} characters per column`;
}

/** 气泡按阅读顺序排：先上后下，同带内右→左（rtl） */
function sortBubbles(page) {
  const rtl = page.reading !== 'ltr';
  return [...page.bubbles].sort((a, b) => {
    if (Math.abs(a.bbox[1] - b.bbox[1]) > 24) return a.bbox[1] - b.bbox[1];
    return rtl ? b.bbox[0] - a.bbox[0] : a.bbox[0] - b.bbox[0];
  });
}

/** 供 UI 显示「这一条会写进提示词的形态描述」 */
export function previewBubbleCaption(bubble, size) {
  return bubbleCaption(bubble, size || { width: 768, height: 1280 }, '');
}

export { bubbleType };
