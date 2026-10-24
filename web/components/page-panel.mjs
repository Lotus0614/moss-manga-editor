// 右栏：页面属性。字段来自 config/manga.mjs 的 PAGE，加字段不用改这里。
// 「本页角色」勾选直接增删 character 项——一页有谁是单一真相，不再存第二套列表。

import { html, toast } from '../lib.mjs';
import { PAGE, optionsOf, itemType } from '../../config/manga.mjs';
import { createItem } from '../../core/manga-doc.mjs';

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

export default function PagePanel({ page, mutate, setSelection, characters = [] }) {
  const countOf = (id) => page.items.filter((it) => it.type === 'character' && it.ref === id).length;

  function toggleCharacter(id, on) {
    const before = countOf(id);
    mutate((cur) => {
      const items = cur.items || [];
      if (on) {
        const n = items.filter((it) => it.type === 'character').length;
        const bbox = [40 + (n % 4) * 36, 900 + (n % 3) * 28, 300 + (n % 4) * 36, 1240 + (n % 3) * 28];
        return { ...cur, items: [...items, createItem('character', { ref: id, bbox })] };
      }
      return {
        ...cur,
        items: items.filter((it) => !(it.type === 'character' && it.ref === id)),
      };
    });
    // 一页摆了好几处时，取消勾选会把它们一起撤掉——说清楚删了几个
    if (!on && before > 1) {
      const name = characters.find((char) => char.id === id)?.name || id;
      toast(`「${name}」在本页的 ${before} 处都撤掉了，Ctrl+Z 可撤回`);
    }
  }

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
    <span class="label">本页角色</span>
    ${characters.length
      ? html`<div class="col" style="gap:3px">
          ${characters.map((char) => {
            const n = countOf(char.id);
            return html`<label class="rowitem" key=${char.id} style="cursor:pointer">
              <input
                type="checkbox"
                checked=${n > 0}
                onChange=${(e) => toggleCharacter(char.id, e.currentTarget.checked)}
              />
              <span class="grow ellipsis">${char.name}</span>
              <span class="mono small">${n > 1 ? `×${n}` : char.id}</span>
            </label>`;
          })}
        </div>`
      : html`<span class="hint">项目还没有角色，点顶栏「角色表」添加。</span>`}

    <div class="divider"></div>
    <span class="label">本页内容（点选编辑）</span>
    <div class="col" style="gap:3px">
      ${page.items.length
        ? page.items.map(
            (it, i) => html`<div class="rowitem" onClick=${() => setSelection({ kind: it.type, id: it.id })}>
              <span class="mono small">${itemType(it.type)?.label || it.type}${it.type === 'panel' ? i + 1 : ''}</span>
              <span class="grow ellipsis">${(it.text || it.caption || it.ref || '（空）').slice(0, 40)}</span>
            </div>`
          )
        : html`<span class="hint">还没有内容，用画布右下角的按钮加一个。</span>`}
    </div>
    <div class="divider"></div>
    <div class="hint">Alt + 点击：从上往下穿透，选中被压住的格子。Shift + 点击：多选，可整体拖动。</div>
  </div>`;
}
