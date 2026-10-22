// 类型注册表：item 有哪些类型、每种有哪些字段、怎么编译成原生 Moss item。
//
// 加一个新类型 = 往 ITEM_TYPES 里加一项。编译器、校验、编辑器表单、画布按钮/配色全部自动跟着变。
// 必须守住的只有两条：
//   1. bbox 永远是 [x1,y1,x2,y2]（左上原点），compile 不要碰它，核心会补
//   2. compile 返回只能含 Moss 白名单字段：label / caption / bbox / text / tags / palette

import { PANEL_SHAPES, FRAME_STYLES, CAMERAS, READING_ORDERS, STYLE_PRESETS } from './manga-doc.mjs';
import { bubblePhrase, BUBBLE_TYPES } from './bubbles.mjs';
import { PROMPT_SNIPPETS as S } from './prompt-templates.mjs';

export const ITEM_TYPES = [
  {
    key: 'panel',
    label: '面板',
    fields: [
      { key: 'caption', type: 'longtext', label: '画面描述', required: true },
      { key: 'camera', type: 'enum', label: '机位', options: 'CAMERAS', default: 'medium', canvas: true },
      { key: 'shape', type: 'enum', label: '形状', options: 'PANEL_SHAPES', default: 'rect', canvas: true },
      { key: 'frame', type: 'enum', label: '边框', options: 'FRAME_STYLES', default: 'border' },
      { key: 'tags', type: 'tags', label: 'tags' },
      { key: 'palette', type: 'palette', label: 'palette' },
    ],
    compile({ item, ctx }) {
      const shape = PANEL_SHAPES[item.shape] || PANEL_SHAPES.rect;
      const frame = FRAME_STYLES[item.frame] || FRAME_STYLES.border;
      const camera = CAMERAS[item.camera];
      const parts = [shape.phrase];
      if (!String(item.shape || '').startsWith('bleed')) parts.push(frame.phrase);
      if (camera) parts.push(camera.phrase);
      const body = (item.caption || '').trim();
      const tag = ctx.number ? 'PANEL ' + ctx.number : '';
      if (body || tag) parts.push(S.boxPrefix + ' ' + [tag, body].filter(Boolean).join(', '));
      if (ctx.guard) parts.push(ctx.guard);
      return { label: 'object', caption: parts.join(', ') };
    },
  },
  {
    key: 'bubble',
    label: '气泡',
    fields: [
      { key: 'text', type: 'longtext', label: '文字', required: true },
      { key: 'kind', type: 'enum', label: '类型', options: 'BUBBLE_TYPES', default: 'speech', canvas: true },
      { key: 'tail', type: 'enum', label: '尾巴', options: 'TAIL_DIRECTIONS', default: 'down-left' },
      { key: 'caption', type: 'text', label: '补充说明（特殊文字用）' },
      { key: 'tags', type: 'tags', label: 'tags' },
      { key: 'palette', type: 'palette', label: 'palette' },
    ],
    compile({ item, ctx }) {
      const parts = [bubblePhrase(item)];
      const where = ctx.locate(item);
      if (where) parts.push(where);
      if (item.caption) parts.push(String(item.caption));
      parts.push(ctx.placement(item.bbox));
      parts.push(ctx.textLayout(item, ctx.vertical));
      if (ctx.guard) parts.push(ctx.guard);
      return { label: 'text', caption: parts.join(', '), ...(item.text ? { text: item.text } : {}) };
    },
  },
  {
    key: 'native',
    label: '原生',
    fields: [
      { key: 'label', type: 'enum', label: 'label', options: 'MOSS_LABELS', default: 'object', canvas: true },
      { key: 'caption', type: 'longtext', label: 'caption', required: true },
      { key: 'text', type: 'longtext', label: 'text（label=text 时必填）' },
      { key: 'tags', type: 'tags', label: 'tags' },
      { key: 'palette', type: 'palette', label: 'palette' },
    ],
    compile({ item, ctx }) {
      return {
        label: item.label || 'object',
        caption: [item.caption, ctx.guard].filter(Boolean).join(', '),
        ...(item.text ? { text: item.text } : {}),
      };
    },
  },
];

export const ITEM_TYPE_MAP = Object.fromEntries(ITEM_TYPES.map((t) => [t.key, t]));

/** 枚举词表：字段声明里的 options 指向这里 */
export const ENUM_SOURCES = {
  PANEL_SHAPES: Object.fromEntries(Object.entries(PANEL_SHAPES).map(([k, v]) => [k, v.name || k])),
  FRAME_STYLES: Object.fromEntries(Object.entries(FRAME_STYLES).map(([k, v]) => [k, v.name || k])),
  CAMERAS: Object.fromEntries(Object.entries(CAMERAS).map(([k, v]) => [k, v.name || k])),
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
  READING_ORDERS: Object.fromEntries(Object.entries(READING_ORDERS).map(([k, v]) => [k, v.name || k])),
  STYLE_PRESETS: Object.fromEntries(Object.entries(STYLE_PRESETS).map(([k, v]) => [k, v.name || k])),
};

/** 页面级字段（右栏表单用） */
export const PAGE_FIELDS = [
  { key: 'reading', type: 'enum', label: '阅读顺序', options: 'READING_ORDERS' },
  { key: 'style', type: 'enum', label: '画风', options: 'STYLE_PRESETS' },
  { key: 'vertical', type: 'bool', label: '全局竖排' },
  { key: 'scene', type: 'text', label: '场景' },
  { key: 'note', type: 'text', label: '补充说明' },
];

export function itemType(key) {
  return ITEM_TYPE_MAP[key] || null;
}

/**
 * 画布左上角标签：由字段声明里的 canvas: true 决定展示哪些值。
 * 想加/减一个展示项，改字段上的 canvas 标记即可，不用碰画布代码。
 */
export function labelOf(item, index = 0) {
  const type = itemType(item.type);
  if (!type) return item.type || '';
  const parts = [];
  for (const f of type.fields) {
    if (!f.canvas) continue;
    const raw = item[f.key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (Array.isArray(raw) && !raw.length) continue;
    const shown = f.type === 'enum' ? ENUM_SOURCES[f.options]?.[raw] ?? raw : String(raw);
    parts.push(shown);
  }
  const head = type.label + (item.type === 'panel' ? index + 1 : '');
  return parts.length ? head + ' · ' + parts.join(' / ') : head;
}

export function fieldsOf(key) {
  const type = itemType(key);
  return type ? type.fields : [];
}

/**
 * 类型颜色：按名字确定性推导，永远浅色。
 * 黄金角散开色相，避免相近名字挤在一起；不用给每个类型手配颜色。
 */
export function typeColor(name) {
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.codePointAt(0)) % 997;
  const hue = Math.round((hash * 137.508) % 360);
  return {
    fill: 'hsla(' + hue + ', 45%, 87%, 0.30)',
    stroke: 'hsla(' + hue + ', 42%, 45%, 0.75)',
  };
}
