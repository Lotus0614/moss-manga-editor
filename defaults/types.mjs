import { prompts } from './prompts.mjs';
import { bubblePhrase } from './bubbles.mjs';

// 默认类型定义（随包发布）。init 时会复制到配置根，之后 Agent 改配置里那份。
//
// 必须按这个格式导出：一个数组，每项 { key, label, fields, compile }。
// compile({ item, ctx }) 返回 { label, caption, text?, tags?, palette? }，不要给 bbox（核心会补）。

// 不 import 任何东西：词表和气泡短语都由编译器通过 ctx 传进来，复制到任何目录都能用。
const phraseOf = (item, field) => (prompts[field] || {})[item[field]]?.phrase || '';

export default [
  {
    key: 'panel',
    label: '面板',
    fields: [
      { key: 'caption', type: 'longtext', label: '画面描述', required: true },
      { key: 'camera', type: 'enum', label: '机位', options: 'cameras', default: 'medium', canvas: true },
      { key: 'shape', type: 'enum', label: '形状', options: 'panelShapes', default: 'rect', canvas: true },
      { key: 'frame', type: 'enum', label: '边框', options: 'frameStyles', default: 'border' },
      { key: 'tags', type: 'tags', label: 'tags' },
      { key: 'palette', type: 'palette', label: 'palette' },
    ],
    compile({ item, ctx }) {
      const parts = [phraseOf(item, 'panelShapes')];
      if (!String(item.shape || '').startsWith('bleed')) parts.push(phraseOf(item, 'frameStyles'));
      if (item.camera) parts.push(phraseOf(item, 'cameras'));
      const body = (item.caption || '').trim();
      const tag = ctx.number ? 'PANEL ' + ctx.number : '';
      const sn = prompts.snippets || {};
      if (body || tag) parts.push((sn.boxPrefix || 'This box contains only:') + ' ' + [tag, body].filter(Boolean).join(', '));
      if (ctx.guard) parts.push(ctx.guard);
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
    compile({ item, ctx }) {
      const parts = [bubblePhrase(item)];
      const where = ctx.locate(item);
      if (where) parts.push(where);
      if (item.caption) parts.push(String(item.caption));
      parts.push(ctx.placement(item.bbox));
      parts.push(ctx.textLayout(item, ctx.vertical));
      if (ctx.guard) parts.push(ctx.guard);
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
    compile({ item, ctx }) {
      return {
        label: item.label || 'object',
        caption: [item.caption, ctx.guard].filter(Boolean).join(', '),
        ...(item.text ? { text: item.text } : {}),
      };
    },
  },
];
