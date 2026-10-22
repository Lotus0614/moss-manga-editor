// 右栏：页面属性（阅读顺序 / 画风 / 全局排版 / 场景 / 内容清单）。
// 干净的独立组件——之前把添加按钮从这里删掉时改坏了模板，重新起一份。

import { html, cls } from '../lib.mjs';

const STYLE_LABELS = [
  ['mono', '黑白网点'],
  ['color', '彩色'],
  ['sketch', '线稿'],
];

const TYPE_NAME = { panel: '面板', bubble: '气泡', native: '原生' };

export default function PagePanel({ page, mutate, setSelection }) {
  return html`<div class="col">
    <div class="row2">
      <div class="field">
        <label>阅读顺序</label>
        <select class="select" value=${page.reading} onChange=${(e) => mutate({ reading: e.currentTarget.value })}>
          <option value="rtl">右 → 左</option>
          <option value="ltr">左 → 右</option>
        </select>
      </div>
      <div class="field">
        <label>画风</label>
        <select class="select" value=${page.style} onChange=${(e) => mutate({ style: e.currentTarget.value })}>
          ${STYLE_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
        </select>
      </div>
    </div>

    <div class="field">
      <label>文字排版（全局）</label>
      <div class="row">
        <button
          class=${cls('chip', page.vertical !== false ? 'on' : 'ghost')}
          onClick=${() =>
            mutate((cur) => ({
              ...cur,
              vertical: true,
              items: cur.items.map((it) => (it.type === 'bubble' ? { ...it, vertical: undefined } : it)),
            }))}
        >全部竖排</button>
        <button
          class=${cls('chip', page.vertical === false ? 'on' : 'ghost')}
          onClick=${() =>
            mutate((cur) => ({
              ...cur,
              vertical: false,
              items: cur.items.map((it) => (it.type === 'bubble' ? { ...it, vertical: undefined } : it)),
            }))}
        >全部横排</button>
      </div>
      <span class="hint">只影响生成的提示词；画布上一律横排显示。</span>
    </div>

    <div class="field">
      <label>场景（写进 SETTING）</label>
      <textarea class="textarea" style="min-height:48px" value=${page.scene || ''} onInput=${(e) => mutate({ scene: e.currentTarget.value })}></textarea>
    </div>

    <div class="field">
      <label>补充说明</label>
      <textarea class="textarea" style="min-height:48px" value=${page.note || ''} onInput=${(e) => mutate({ note: e.currentTarget.value })}></textarea>
    </div>

    <div class="divider"></div>
    <span class="label">本页内容（点选编辑）</span>
    <div class="col" style="gap:3px">
      ${page.items.length
        ? page.items.map(
            (it, i) => html`<div class="rowitem" onClick=${() => setSelection({ kind: it.type, id: it.id })}>
              <span class="mono small">${TYPE_NAME[it.type] || it.type}${it.type === 'panel' ? i + 1 : ''}</span>
              <span class="grow ellipsis">${(it.type === 'bubble' ? it.text : it.caption) || '（空）'}</span>
            </div>`
          )
        : html`<span class="hint">还没有内容，用画布右下角的「面板 / 气泡 / 原生」加一个。</span>`}
    </div>
  </div>`;
}
