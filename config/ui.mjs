// 展示规则：右栏表单字段、画布标签、类型配色。
// 属于「漫画方言」的一部分，换展示习惯就改这个文件。

import { ITEM_TYPES } from '../core/runtime.mjs';
import {
  PANEL_SHAPES,
  FRAME_STYLES,
  CAMERAS,
  STYLE_PRESETS,
  READING_ORDERS,
  BUBBLE_TYPES,
  TAIL_DIRECTIONS,
} from './prompts.mjs';

const names = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.name || k]));

/** 枚举词表：字段声明里的 options 指向这里 */
export const ENUM_SOURCES = {
  PANEL_SHAPES: names(PANEL_SHAPES),
  FRAME_STYLES: names(FRAME_STYLES),
  CAMERAS: names(CAMERAS),
  STYLE_PRESETS: names(STYLE_PRESETS),
  READING_ORDERS: names(READING_ORDERS),
  BUBBLE_TYPES: Object.fromEntries(BUBBLE_TYPES.map((b) => [b.key, b.name])),
  TAIL_DIRECTIONS: {
    none: '无尾巴',
    'down-left': '左下',
    down: '下',
    'down-right': '右下',
    left: '左',
    right: '右',
    'up-left': '左上',
    up: '上',
    'up-right': '右上',
  },
  MOSS_LABELS: { object: 'object', character: 'character', text: 'text' },
};

export function enumOptions(name) {
  return ENUM_SOURCES[name] || {};
}

/** 页面级字段（右栏表单用） */
export const PAGE_FIELDS = [
  { key: 'reading', type: 'enum', label: '阅读顺序', options: 'READING_ORDERS' },
  { key: 'style', type: 'enum', label: '画风', options: 'STYLE_PRESETS' },
  { key: 'vertical', type: 'bool', label: '全局竖排' },
  { key: 'scene', type: 'text', label: '场景' },
  { key: 'note', type: 'text', label: '补充说明' },
];

export function itemType(key) {
  return ITEM_TYPES.find((t) => t.key === key) || null;
}

export function fieldsOf(key) {
  return itemType(key)?.fields || [];
}

/** 画布左上角标签：字段声明里 canvas: true 的才展示 */
export function labelOf(item, index = 0) {
  const type = itemType(item.type);
  if (!type) return item.type || '';
  const parts = [];
  for (const f of type.fields) {
    if (!f.canvas) continue;
    const raw = item[f.key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (Array.isArray(raw) && !raw.length) continue;
    parts.push(f.type === 'enum' ? ENUM_SOURCES[f.options]?.[raw] ?? raw : String(raw));
  }
  const head = type.label + (item.type === 'panel' ? index + 1 : '');
  return parts.length ? head + ' · ' + parts.join(' / ') : head;
}

/** 类型颜色：按名字确定性推导，永远浅色 */
export function typeColor(name) {
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.codePointAt(0)) % 997;
  const hue = Math.round((hash * 137.508) % 360);
  return {
    fill: 'hsla(' + hue + ', 45%, 87%, 0.30)',
    stroke: 'hsla(' + hue + ', 42%, 45%, 0.75)',
  };
}

export { ITEM_TYPES } from '../core/runtime.mjs';
