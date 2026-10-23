// 右栏：页面属性。字段来自 config/manga.mjs 的 PAGE，加字段不用改这里。

import { html } from '../lib.mjs';
import { PAGE, optionsOf, itemType } from '../../config/manga.mjs';

function Field({ field, value, onChange }) {
  if (field.type === 'enum') {
    return html`<div class="field" key=${field.key}>
      <label>${field.label}</label>
      <select class="select" value=${value ?? field.default ?? ''} onChange=${(e) => onChange(e.currentTarget.value)}>
        ${optionsOf(field).map((option) => html`<option value=${option.value}>${option.label}</option>`)}
      </select>
    </div>`;
  }

  if (field.type === 'bool') {
    return html`<div class="field" key=${field.key}>
      <label>${field.label}</label>
      <label class="row" style="gap:6px;align-items:center">
        <input type="checkbox" checked=${value !== false} onChange=${(e) => onChange(e.currentTarget.checked)} />
        <span class="hint">${value === false ? '关闭' : '开启'}</span>
      </label>
    </div>`;
  }

  return html`<div class="field" key=${field.key}>
    <label>${field.label}</label>
    <textarea
      class="textarea"
      style="min-height:44px"
      value=${value ?? ''}
      onInput=${(e) => onChange(e.currentTarget.value)}
    ></textarea>
  </div>`;
}

export default function PagePanel({ page, mutate, setSelection }) {
  return html`<div class="col">
    ${PAGE.map(
      (field) => html`<${Field}
        key=${field.key}
        field=${field}
        value=${page[field.key]}
        onChange=${(v) => mutate({ [field.key]: v })}
      />`
    )}

    <div class="divider"></div>
    <span class="label">本页内容（点选编辑）</span>
    <div class="col" style="gap:3px">
      ${page.items.length
        ? page.items.map(
            (it, i) => html`<div class="rowitem" onClick=${() => setSelection({ kind: it.type, id: it.id })}>
              <span class="mono small">${itemType(it.type)?.label || it.type}${it.type === 'panel' ? i + 1 : ''}</span>
              <span class="grow ellipsis">${(it.text || it.caption || '（空）').slice(0, 40)}</span>
            </div>`
          )
        : html`<span class="hint">还没有内容，用画布右下角的按钮加一个。</span>`}
    </div>
    <div class="divider"></div>
    <div class="hint">Alt + 点击：从上往下穿透，选中被压住的格子。Shift + 点击：多选，可整体拖动。</div>
  </div>`;
}
