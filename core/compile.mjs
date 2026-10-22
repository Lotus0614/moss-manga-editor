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
  readingOrderOf,
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
  // 每页从 1 开始、按阅读顺序给 panel 编号（只用于 caption 里的引用）
  const no = new Map(readingOrderOf(page).map((p, i) => [p.id, i + 1]));
  const items = [];

  for (const item of page.items || []) {
    const base = { bbox: toMoss(item.bbox, size) };
    const extra = {};
    if (Array.isArray(item.tags) && item.tags.length) extra.tags = item.tags;
    if (Array.isArray(item.palette) && item.palette.length) extra.palette = item.palette;

    if (item.type === 'panel') {
      items.push({ label: 'object', caption: panelCaption(item, guard, no.get(item.id)), ...base, ...extra });
    } else if (item.type === 'bubble') {
      items.push({ label: 'text', caption: bubbleCaption(item, page, size, guard, panels, no), ...base, ...extra, ...(item.text ? { text: item.text } : {}) });
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
      `This page has exactly ${panels.length} panel${panels.length === 1 ? '' : 's'} and exactly ${bubbles.length} text element${bubbles.length === 1 ? '' : 's'}. Render ONLY the text listed below, with the exact wording given. Do NOT invent any additional dialogue, speech bubble, caption, sound effect or lettering, and do not fill empty space with text — any text that is not listed is an error.`
    );
    parts.push(
      'Dialogue uses white speech bubbles with tails, thoughts use white cloud bubbles with no tail, and narration is bare lettering printed directly on the artwork with no bubble, no box and no background.'
    );
  } else {
    parts.push(
      'This page contains NO lettering at all: no speech bubbles, no captions, no sound effects, no text of any kind.'
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

function panelCaption(panel, guard, number) {
  const shape = PANEL_SHAPES[panel.shape] || PANEL_SHAPES.rect;
  const frame = FRAME_STYLES[panel.frame] || FRAME_STYLES.border;
  const camera = CAMERAS[panel.camera];
  const parts = [shape.phrase];

  if (!String(panel.shape || '').startsWith('bleed')) parts.push(frame.phrase);
  if (camera) parts.push(camera.phrase);

  const body = (panel.caption || '').trim();
  const tag = number ? `PANEL ${number}` : '';
  if (body || tag) parts.push(`This box contains only: ${[tag, body].filter(Boolean).join(', ')}`);
  if (guard) parts.push(guard);
  return parts.join(', ');
}

function bubbleCaption(bubble, page, size, guard, panels = [], no = new Map()) {
  const parts = [bubblePhrase(bubble)];
  const where = locateInPanel(bubble, panels, no);
  if (where) parts.push(where);
  if (bubble.caption) parts.push(String(bubble.caption));
  parts.push(`placed in the ${placementWord(bubble.bbox, size)}`);
  parts.push(textLayout(bubble, isVertical(page, bubble)));
  if (guard) parts.push(guard);
  return parts.join(', ');
}

/** 文字落在哪个 PANEL：完全在里面 / 压到边缘，两种说法 */
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

function textLayout(bubble, vertical) {
  // 只描述方向，不算列数/字数、不提字号：
  // 报字数会让模型为了凑够列数把气泡画宽，报字号它也画不准。
  if (!vertical) return 'horizontal lettering';
  return 'vertical lettering, columns read right to left';
}
/** 供 UI 显示「这一条会写进提示词的形态描述」 */
export function previewBubbleCaption(bubble, size) {
  return bubbleCaption(bubble, { vertical: true }, size || { width: 768, height: 1280 }, '');
}
