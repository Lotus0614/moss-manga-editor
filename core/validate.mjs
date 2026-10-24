// 校验：把《JSON Layout》第七节的检查清单变成代码。
// level=error 阻止生成，level=warn 只提醒。

import { pageSize } from './manga-doc.mjs';
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
    // 文字项的框可以很小（拟声词、名牌），不对它做尺寸校验
    const isText = item.type === 'bubble' || (item.type === 'native' && item.label === 'text');
    if (!isText && (x2 - x1 < MIN_SIDE || y2 - y1 < MIN_SIDE)) {
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

    if (item.type === 'native') {
      if (!item.caption?.trim()) add('warn', 'native.blank', `${name} 是原生 item 但没有 caption`, item.id);
    }
  });

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

export function blocking(warnings) {
  return warnings.filter((w) => w.level === 'error');
}
