// 校验：把《JSON Layout》第七节的检查清单变成代码。
// level=error 会阻止生成，level=warn 只是提醒。UI 用 blocking() 判断。

import { pageSize, PANEL_SHAPES, bboxArea, bboxIntersects } from './manga-doc.mjs';

const ALLOWED_TOP = new Set(['summary', 'items']);
const ALLOWED_ITEM = new Set(['label', 'caption', 'bbox', 'text', 'tags', 'palette']);
const ALLOWED_SUMMARY = new Set(['meta', 'canvas', 'caption', 'palette']);
const FORBIDDEN = ['children', 'parent', 'id', 'elements', 'boxes', 'layout'];

const MIN_SIDE = 40;

/**
 * @param {object} page 富文档
 * @param {object} [doc] 编译产物（可选，传入时额外检查 Moss 契约）
 * @returns {{level:'error'|'warn', code:string, message:string, target?:string}[]}
 */
export function validatePage(page, doc) {
  const out = [];
  const size = pageSize(page);
  const add = (level, code, message, target) => out.push({ level, code, message, target });

  // ---- 画布
  if (size.width % 16 !== 0 || size.height % 16 !== 0) {
    add('error', 'size.grid', `画布尺寸必须是 16 的倍数，当前 ${size.width}×${size.height}`);
  }

  // ---- 面板
  if (!page.panels.length) {
    add('error', 'panel.empty', '这一页还没有任何分格');
  }
  page.panels.forEach((panel, i) => {
    const name = panel.name || `格${i + 1}`;
    const [x1, y1, x2, y2] = panel.bbox;
    const bleed = String(panel.shape || '').startsWith('bleed');
    if (x2 - x1 < MIN_SIDE || y2 - y1 < MIN_SIDE) {
      add('warn', 'panel.tiny', `${name} 太小（${Math.round(x2 - x1)}×${Math.round(y2 - y1)}），模型可能画不出内容`, panel.id);
    }
    if (!bleed) {
      if (x1 < 0 || y1 < 0 || x2 > size.width || y2 > size.height) {
        add('warn', 'panel.out', `${name} 超出画布，内容可能被裁掉`, panel.id);
      }
    }
    if (!panel.caption?.trim()) {
      add('warn', 'panel.blank', `${name} 没有内容描述，只会画出一个空框`, panel.id);
    }
    if (!PANEL_SHAPES[panel.shape]) {
      add('warn', 'panel.shape', `${name} 的形状「${panel.shape}」不认识，已按矩形处理`, panel.id);
    }
  });

  // ---- 气泡
  page.bubbles.forEach((bubble, i) => {
    const label = `气泡${i + 1}`;
    const text = (bubble.text || '').trim();
    if (!text) {
      add('warn', 'bubble.empty', `${label} 没有文字`, bubble.id);
      return;
    }
    if (!bubble.vertical && text.includes('\n')) {
      add('warn', 'bubble.newline', `${label} 是横排却包含了换行，模型可能忽略`, bubble.id);
    }
    const budget = textBudget(bubble);
    const used = text.replace(/\s/g, '').length;
    if (used > budget.capacity) {
      add(
        'warn',
        'bubble.overflow',
        `${label} 文字 ${used} 字，按当前框与字号最多约 ${budget.capacity} 字（${budget.cols} 列 × ${budget.perCol} 字），建议拆条或放大框`,
        bubble.id
      );
    }
    if (budget.cols > 1 && budget.perCol > 12) {
      add('warn', 'bubble.columns', `${label} 每列 ${budget.perCol} 字，超过 12 字建议加列`, bubble.id);
    }
  });

  // ---- 气泡互相压盖
  for (let i = 0; i < page.bubbles.length; i += 1) {
    for (let j = i + 1; j < page.bubbles.length; j += 1) {
      const a = page.bubbles[i];
      const b = page.bubbles[j];
      const overlap = intersectionArea(a.bbox, b.bbox);
      const minArea = Math.min(bboxArea(a.bbox), bboxArea(b.bbox)) || 1;
      if (overlap / minArea > 0.35) {
        add('warn', 'bubble.overlap', `气泡${i + 1} 与 气泡${j + 1} 大面积重叠`, a.id);
      }
    }
  }

  // ---- 阅读顺序
  const ambiguous = sameBandAmbiguity(page);
  if (ambiguous) {
    add('warn', 'order.ambiguous', ambiguous);
  }

  // ---- 编译产物契约
  if (doc) {
    checkDocShape(doc, add);
  } else if (!page.panels.length && !page.bubbles.length) {
    add('error', 'doc.empty', '页面既没有分格也没有文字，无法生成');
  }

  return out;
}

function checkDocShape(doc, add) {
  for (const key of Object.keys(doc)) {
    if (!ALLOWED_TOP.has(key)) add('error', 'doc.key', `顶层多出了字段「${key}」，模型会解析失败`);
  }
  for (const key of Object.keys(doc.summary || {})) {
    if (!ALLOWED_SUMMARY.has(key)) add('error', 'doc.summary.key', `summary 多出了字段「${key}」`);
  }
  if (!doc.summary?.caption?.trim()) {
    add('error', 'doc.caption', 'summary.caption 为空');
  }
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
    if (item.label === 'text' && !item.text) {
      add('error', 'doc.item.text', `items[${i}] 是文字项但缺少 text`);
    }
    if (!item.caption?.trim()) {
      add('error', 'doc.item.caption', `items[${i}].caption 为空`);
    }
  });
}

function intersectionArea(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

export function textBudget(bubble) {
  const [x1, y1, x2, y2] = bubble.bbox;
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const fs = Math.max(8, Number(bubble.fontSize) || 22);
  const cols = bubble.vertical === false ? 1 : Math.max(1, Math.floor(w / (fs * 1.15)));
  const perCol = Math.max(1, Math.floor(h / (fs * 1.35)));
  return { cols, perCol, capacity: cols * perCol * (bubble.vertical === false ? 1 : 1) };
}

/** 同一横带里两块重叠、又分不出先后 → 阅读线会乱 */
function sameBandAmbiguity(page) {
  const rtl = page.readingOrder !== 'ltr';
  const panels = page.panels;
  for (let i = 0; i < panels.length; i += 1) {
    for (let j = i + 1; j < panels.length; j += 1) {
      const a = panels[i].bbox;
      const b = panels[j].bbox;
      const sameBand = Math.abs(a[1] - b[1]) < 24 && Math.abs(a[3] - b[3]) < 24;
      const xOverlap = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
      if (sameBand && xOverlap > 24) {
        return `格${i + 1} 与 格${j + 1} 在同一横带且位置重叠，${rtl ? '右→左' : '左→右'}阅读顺序会歧义`;
      }
    }
  }
  return '';
}

export function blocking(warnings) {
  return warnings.filter((w) => w.level === 'error');
}

export { bboxIntersects };
