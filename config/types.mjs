// 漫画方言入口：类型定义 + summary 写法。
//
// 固定导出两样：默认的 types 数组、buildSummary 函数。
// 复制到配置根后，import 同目录的 prompts.mjs / helpers.mjs 即可独立运行。

import { prompts } from './prompts.mjs';
import { panelNumber, locateInPanel, placementOf, textLayoutOf, panelsOf, bubblePhrase } from './helpers.mjs';

const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));

export const types = [
  {
    key: 'panel',
    label: '面板',
    role: 'panel',
    fields: [
      { key: 'caption', type: 'longtext', label: '画面描述', required: true },
      { key: 'camera', type: 'enum', label: '机位', options: 'cameras', default: 'medium', canvas: true },
      { key: 'shape', type: 'enum', label: '形状', options: 'panelShapes', default: 'rect', canvas: true },
      { key: 'frame', type: 'enum', label: '边框', options: 'frameStyles', default: 'border' },
      { key: 'tags', type: 'tags', label: 'tags' },
      { key: 'palette', type: 'palette', label: 'palette' },
    ],
    compile({ item, page }) {
      const guard = (prompts.stylePresets[page.style] || {}).guard || '';
      const parts = [prompts.panelShapes[item.shape]?.phrase];
      if (!String(item.shape || '').startsWith('bleed')) parts.push(prompts.frameStyles[item.frame]?.phrase);
      if (item.camera) parts.push(prompts.cameras[item.camera]?.phrase);
      const n = panelNumber(page, item, types);
      const body = (item.caption || '').trim();
      const tag = n ? 'PANEL ' + n : '';
      if (body || tag) {
        parts.push((prompts.snippets.boxPrefix || 'This box contains only:') + ' ' + [tag, body].filter(Boolean).join(', '));
      }
      if (guard) parts.push(guard);
      return { label: 'object', caption: parts.filter(Boolean).join(', ') };
    },
  },
  {
    key: 'bubble',
    label: '气泡',
    fields: [
      { key: 'text', type: 'longtext', label: '文字', required: true },
      { key: 'kind', type: 'enum', label: '类型', options: 'bubbleTypes', default: 'speech', canvas: true },
      { key: 'tail', type: 'enum', label: '尾巴', options: 'tailDirections', default: 'down-left' },
      { key: 'caption', type: 'text', label: '补充说明（特殊文字用）' },
      { key: 'tags', type: 'tags', label: 'tags' },
      { key: 'palette', type: 'palette', label: 'palette' },
    ],
    compile({ item, page }) {
      const guard = (prompts.stylePresets[page.style] || {}).guard || '';
      const parts = [bubblePhrase(item)];
      const where = locateInPanel(page, item, types);
      if (where) parts.push(where);
      if (item.caption) parts.push(String(item.caption));
      parts.push('placed in the ' + placementOf(page, item.bbox));
      parts.push(textLayoutOf(page, item));
      if (guard) parts.push(guard);
      return { label: 'text', caption: parts.filter(Boolean).join(', '), ...(item.text ? { text: item.text } : {}) };
    },
  },
  {
    key: 'native',
    label: '原生',
    fields: [
      { key: 'label', type: 'enum', label: 'label', options: 'mossLabels', default: 'object', canvas: true },
      { key: 'caption', type: 'longtext', label: 'caption', required: true },
      { key: 'text', type: 'longtext', label: 'text（label=text 时必填）' },
      { key: 'tags', type: 'tags', label: 'tags' },
      { key: 'palette', type: 'palette', label: 'palette' },
    ],
    compile({ item }) {
      return {
        label: item.label || 'object',
        caption: item.caption || '',
        ...(item.text ? { text: item.text } : {}),
      };
    },
  },
];

/** 整页 summary：写作风格全在这里 */
export function buildSummary({ page, items }) {
  const sn = prompts.snippets || {};
  const style = prompts.stylePresets[page.style] || prompts.stylePresets.mono;
  const panels = panelsOf(page, types);
  const texts = items.filter((i) => i.label === 'text');
  const parts = [style.phrase];

  if (panels.length > 0) {
    const order = prompts.readingOrders[page.reading] || prompts.readingOrders.rtl;
    parts.push(
      fill(sn.panelCount, { n: panels.length, panels: panels.length === 1 ? 'panel' : 'panels', order: order.phrase })
    );
  }

  if (texts.length > 0) {
    parts.push(fill(sn.textLock, { panels: panels.length, texts: texts.length }));
    parts.push(sn.bubbleRule);
  } else {
    parts.push(sn.noLettering);
  }

  if (page.scene) parts.push(page.scene);
  if (page.note) parts.push(page.note);
  if (style.guard) parts.push(style.guard);

  return {
    meta: style.meta,
    canvas: panels.length > 1 || texts.length > 1 ? 'multi_panel' : 'single',
    caption: parts.filter(Boolean).join('\n\n'),
  };
}

export default types;
