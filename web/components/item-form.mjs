// 元素属性表单：完全由 config-store 里的字段声明生成，代码里不出现任何具体字段名。
// 加一个新类型/新字段，这里自动多出对应控件。

import { html, cls } from '../lib.mjs';
import { fieldsOf, itemType, optionsOf } from '../../core/config-store.mjs';

const TYPE_LABEL = (key) => itemType(key)?.label || key;

function Field({ field, value, onChange }) {
  const label = html`<label>${field.label}${field.required ? html`<span class="req">*</span>` : null}</label>`;

  if (field.type === 'bool') {
    return html`<div class="field">
      ${label}
      <label class="row" style="gap:6px;align-items:center">
        <input type="checkbox" checked=${value !== false} onChange=${(e) => onChange(e.currentTarget.checked)} />
        <span class="hint">${value === false ? '关闭' : '开启'}</span>
      </label>
    </div>`;
  }

  if (field.type === 'enum') {
    return html`<div class="field">
      ${label}
      <select class="select" value=${value ?? field.default ?? ''} onChange=${(e) => onChange(e.currentTarget.value)}>
        ${optionsOf(field).map((option) => html`<option value=${option.value}>${option.label}</option>`)}
      </select>
    </div>`;
  }

  if (field.type === 'number') {
    return html`<div class="field">
      ${label}
      <input class="input" type="number" value=${value ?? ''} onInput=${(e) => onChange(e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))} />
    </div>`;
  }

  if (field.type === 'longtext') {
    return html`<div class="field">
      ${label}
      <textarea class="textarea" style="min-height:96px" value=${value ?? ''} onInput=${(e) => onChange(e.currentTarget.value)}></textarea>
    </div>`;
  }

  if (field.type === 'tags') {
    return html`<div class="field">
      ${label}
      <input
        class="input"
        value=${(value || []).join(' ')}
        placeholder="3–6 个英文短词"
        onInput=${(e) => onChange(e.currentTarget.value.split(/[\s,]+/).filter(Boolean))}
      />
    </div>`;
  }

  if (field.type === 'palette') {
    const list = value || [];
    return html`<div class="field">
      ${label}
      <div class="row wrap">
        ${list.map(
          (hex, i) => html`<span class="swatch" key=${hex + i}>
            <input
              type="color"
              value=${hex}
              onInput=${(e) => {
                const next = [...list];
                next[i] = e.currentTarget.value.toUpperCase();
                onChange(next);
              }}
            />
            <button class="swatch-x" onClick=${() => onChange(list.filter((_, j) => j !== i))}>×</button>
          </span>`
        )}
        ${list.length < 5 ? html`<button class="chip" onClick=${() => onChange([...list, '#000000'])}>＋ 颜色</button>` : null}
      </div>
    </div>`;
  }

  return html`<div class="field">
    ${label}
    <input class="input" value=${value ?? ''} onInput=${(e) => onChange(e.currentTarget.value)} />
  </div>`;
}

/** 单个元素：字段由注册表决定，全部展示（右栏不做可见性过滤） */
export default function ItemForm({ item, patchItem, removeItem, onBack, onCopy }) {
  const fields = fieldsOf(item.type);

  return html`<div class="col">
    <div class="row">
      <button class="btn sm ghost" onClick=${onBack}>← 返回</button>
      <span class="tag">${TYPE_LABEL(item.type)}</span>
      <div class="spacer"></div>
      <button class="btn sm ghost" onClick=${onCopy}>复制</button>
      <button class="btn sm ghost" onClick=${() => removeItem(item.id)}>删除</button>
    </div>

    <div class="field">
      <label>坐标 x1 / y1 / x2 / y2</label>
      <div class="row">
        ${item.bbox.map(
          (v, i) => html`<input
            class="input"
            type="number"
            style="width:25%"
            value=${Math.round(v)}
            onInput=${(e) => {
              const bbox = [...item.bbox];
              bbox[i] = Number(e.currentTarget.value);
              patchItem(item.id, { bbox });
            }}
          />
        `)}
      </div>
    </div>



    ${fields.map(
      (field) => html`<${Field}
        key=${field.key}
        field=${field}
        value=${item[field.key]}
        onChange=${(v) => patchItem(item.id, { [field.key]: v })}
      />`
    )}
  </div>`;
}
