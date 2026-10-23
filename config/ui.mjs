// 展示规则：右栏表单字段、画布标签、类型配色。
// 属于「漫画方言」的一部分，换展示习惯就改这个文件。

import { ITEM_TYPES } from '../core/runtime.mjs';
import { prompts } from './prompts.mjs';

/** 词表 { 值: { name, … } } → 下拉用 { 值: 显示名 } */
const options = (table) =>
  Object.fromEntries(Object.entries(table || {}).map(([key, entry]) => [key, (entry && entry.name) || key]));

/**
 * 枚举词表：字段声明里的 options 写这里的键，与 prompts.mjs 聚合对象的键一一对应。
 * prompts.mjs 里所有表都是 { 值: { name, … } }，新加一张挂到 prompts 上，这里自动认得。
 */
export const ENUM_SOURCES = {
  ...Object.fromEntries(
    Object.entries(prompts)
      .filter(([key]) => key !== 'snippets')
      .map(([key, table]) => [key, options(table)])
  ),
  // MOSS 原生 label 是格式固定项，不随提示词变，所以不在 prompts.mjs 里
  mossLabels: { object: 'object', character: 'character', text: 'text' },
};

export function enumOptions(name) {
  const key = String(name ?? '');
  if (ENUM_SOURCES[key]) return ENUM_SOURCES[key];
  const hit = Object.keys(ENUM_SOURCES).find((k) => k.toLowerCase() === key.toLowerCase());
  return hit ? ENUM_SOURCES[hit] : {};
}

/** 页面级字段（右栏表单用） */
export const PAGE_FIELDS = [
  { key: 'reading', type: 'enum', label: '阅读顺序', options: 'readingOrders' },
  { key: 'style', type: 'enum', label: '画风', options: 'stylePresets' },
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
    parts.push(f.type === 'enum' ? enumOptions(f.options)[raw] ?? raw : String(raw));
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
