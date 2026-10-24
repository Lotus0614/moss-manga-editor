// 校验：把《JSON Layout》第七节的检查清单变成代码。
// level=error 阻止生成，level=warn 只提醒。

import { pageSize, bboxArea, panelsOf, bubblesOf } from './manga-doc.mjs';
import { itemType, typeOption } from '../config/manga.mjs';

const ALLOWED_TOP = new Set(['summary', 'items', 'bbox_coord_space', 'bbox_format']);
const ALLOWED_ITEM = new Set(['label', 'caption', 'bbox', 'text', 'tags', 'palette']);
const ALLOWED_SUMMARY = new Set(['meta', 'canvas', 'caption', 'palette']);
const FORBIDDEN = ['children', 'parent', 'id', 'elements', 'boxes', 'layout'];

const MIN_SIDE = 40;

export function validatePage(page, doc) {
  const out = [];
  const size = pageSize(page);
  const add = (level, code, message, target) => out.push({ level, code, message, target });

  if (size.width % 16 !== 0 || size.height % 16 !== 0) {
    add('error', 'size.grid', `画布尺寸必须是 16 的倍数，当前 ${size.width}×${size.height}`);
  }

  const items = page.items || [];
  if (!items.length) add('error', 'page.empty', '这一页还没有任何内容');

  items.forEach((item, i) => {
    const name = `第 ${i + 1} 项`;
    if (!itemType(item.type)) {
      add('error', 'item.type', `${name} 的 type「${item.type}」不认识`, item.id);
      return;
    }

    const [x1, y1, x2, y2] = item.bbox;
    if (x2 - x1 < MIN_SIDE || y2 - y1 < MIN_SIDE) {
      add('warn', 'item.tiny', `${name} 太小（${Math.round(x2 - x1)}×${Math.round(y2 - y1)}），模型可能画不出内容`, item.id);
    }

    if (item.type === 'panel') {
      const shape = typeOption('panel', 'shape', item.shape);
      if (!shape?.bleed && (x1 < 0 || y1 < 0 || x2 > size.width || y2 > size.height)) {
        add('warn', 'panel.out', `${name} 超出画布，内容可能被裁掉`, item.id);
      }
      if (!item.desc?.trim() && !item.caption?.trim())
        add('warn', 'panel.blank', `${name} 没写画面描述，只会画出一个空框`, item.id);
      if (!shape) add('warn', 'panel.shape', `${name} 的形状「${item.shape}」不认识`, item.id);
    }

    if (item.type === 'bubble') {
      const text = (item.text || '').trim();
      if (!text) {
        add('warn', 'bubble.empty', `${name} 没有文字`, item.id);
        return;
      }
      if (!item.vertical && text.includes('\n')) {
        add('warn', 'bubble.newline', `${name} 是横排却包含换行，模型可能忽略`, item.id);
      }
      const budget = textBudget(item);
      const used = text.replace(/\s/g, '').length;
      if (used > budget.capacity) {
        add(
          'warn',
          'bubble.overflow',
          `${name} 文字 ${used} 字，按当前框与字号最多约 ${budget.capacity} 字（${budget.cols} 列 × ${budget.perCol}），建议拆条或放大框`,
          item.id
        );
      }
    }

    // 文字压分格线 / 贴边：模型会把字直接画到接缝和边框上
    if (item.type === 'bubble' || (item.type === 'native' && item.label === 'text')) {
      const place = textPlacement(page, item);
      if (place.seam) {
        add('warn', 'text.seam', `${name} 的文字框跨在分格线上，会被画到两格接缝处：${place.seam}`, item.id);
      }
      if (place.tight !== null) {
        add('warn', 'text.edge', `${name} 的文字框离分格线只有 ${place.tight}px，字会被画到边框上`, item.id);
      }
    }

    if (item.type === 'native') {
      if (!item.caption?.trim()) add('warn', 'native.blank', `${name} 是原生 item 但没有 caption`, item.id);
      if (item.label === 'text' && !item.text) add('warn', 'native.text', `${name} 是文字类原生 item 但没有 text`, item.id);
    }
  });

  // 气泡大面积重叠
  const bubbles = bubblesOf(page);
  for (let i = 0; i < bubbles.length; i += 1) {
    for (let j = i + 1; j < bubbles.length; j += 1) {
      const a = bubbles[i];
      const b = bubbles[j];
      const overlap = intersectionArea(a.bbox, b.bbox);
      const minArea = Math.min(bboxArea(a.bbox), bboxArea(b.bbox)) || 1;
      if (overlap / minArea > 0.35) {
        add('warn', 'bubble.overlap', `文字 ${a.id} 与 ${b.id} 大面积重叠`, a.id);
      }
    }
  }

  if (doc) checkDocShape(doc, add);
  return out;
}

function checkDocShape(doc, add) {
  for (const key of Object.keys(doc)) {
    if (!ALLOWED_TOP.has(key)) add('error', 'doc.key', `顶层多出了字段「${key}」，模型会解析失败`);
  }
  for (const key of Object.keys(doc.summary || {})) {
    if (!ALLOWED_SUMMARY.has(key)) add('error', 'doc.summary.key', `summary 多出了字段「${key}」`);
  }
  if (!doc.summary?.caption?.trim()) add('error', 'doc.caption', 'summary.caption 为空');
  if (doc.bbox_coord_space !== 'abs_centralized') add('error', 'doc.coord', 'bbox_coord_space 必须是 abs_centralized');
  if (doc.bbox_format !== 'yxyx') add('error', 'doc.format', 'bbox_format 必须是 yxyx');
  if (!Array.isArray(doc.items) || doc.items.length === 0) {
    add('error', 'doc.items', 'items 不能为空');
    return;
  }
  doc.items.forEach((item, i) => {
    for (const key of Object.keys(item)) {
      if (!ALLOWED_ITEM.has(key)) add('error', 'doc.item.key', `items[${i}] 多出了字段「${key}」`);
      if (FORBIDDEN.includes(key)) add('error', 'doc.item.forbidden', `items[${i}] 出现禁用字段「${key}」`);
    }
    if (!['object', 'character', 'text'].includes(item.label)) {
      add('error', 'doc.item.label', `items[${i}].label「${item.label}」非法`);
    }
    if (!Array.isArray(item.bbox) || item.bbox.length !== 4 || item.bbox.some((v) => !Number.isInteger(v))) {
      add('error', 'doc.item.bbox', `items[${i}].bbox 必须是四个整数`);
    } else if (!(item.bbox[0] < item.bbox[2] && item.bbox[1] < item.bbox[3])) {
      add('error', 'doc.item.bbox.order', `items[${i}].bbox 的 y_min<y_max 且 x_min<x_max 不成立`);
    }
    if (item.label === 'text' && !item.text) add('error', 'doc.item.text', `items[${i}] 是文字项但缺少 text`);
    if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some((t) => typeof t !== 'string'))) {
      add('error', 'doc.item.tags', `items[${i}].tags 必须是字符串数组`);
    }
    if (item.palette !== undefined) {
      const bad = !Array.isArray(item.palette) || item.palette.some((c) => !/^#[0-9A-F]{6}$/i.test(String(c)));
      if (bad) add('error', 'doc.item.palette', `items[${i}].palette 必须是 #RRGGBB 数组`);
    }
    if (!item.caption?.trim()) add('error', 'doc.item.caption', `items[${i}].caption 为空`);
  });
}

function intersectionArea(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * 文字框和面板的关系：
 *   seam  —— 没有完整落在任何一格内，却跨了不止一格（字会画到接缝上）
 *   tight —— 完整落在某一格内，但离某条边不到 EDGE_MARGIN px
 */
const EDGE_MARGIN = 10;

function textPlacement(page, item) {
  const [x1, y1, x2, y2] = item.bbox;
  const inside = [];
  const partial = [];

  for (const panel of panelsOf(page)) {
    const [px1, py1, px2, py2] = panel.bbox;
    if (intersectionArea(item.bbox, panel.bbox) <= 0) continue;
    const fully = x1 >= px1 - 2 && x2 <= px2 + 2 && y1 >= py1 - 2 && y2 <= py2 + 2;
    (fully ? inside : partial).push(panel);
  }

  if (!inside.length && partial.length > 1) {
    return { seam: partial.map((panel) => panel.id).join(' / '), tight: null };
  }
  if (inside.length === 1) {
    const [px1, py1, px2, py2] = inside[0].bbox;
    const gap = Math.min(x1 - px1, y1 - py1, px2 - x2, py2 - y2);
    return { seam: '', tight: gap < EDGE_MARGIN ? Math.round(gap) : null };
  }
  return { seam: '', tight: null };
}

export function textBudget(item) {
  const [x1, y1, x2, y2] = item.bbox;
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const fs = Math.max(8, Number(item.size) || 22);
  const cols = item.vertical === false ? Math.max(1, Math.floor(w / (fs * 1.02))) : Math.max(1, Math.floor(w / (fs * 1.15)));
  const perCol = Math.max(1, Math.floor(h / (fs * 1.35)));
  return { cols, perCol, capacity: cols * perCol };
}

export function blocking(warnings) {
  return warnings.filter((w) => w.level === 'error');
}
