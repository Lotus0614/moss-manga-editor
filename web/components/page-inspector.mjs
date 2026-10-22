// 右栏：页面属性 / 单个 item 属性。纯展示组件，改动通过回调交给编辑器。

import { html, cls, BUBBLE_LABELS, CAMERA_LABELS, SHAPE_LABELS, FRAME_LABELS } from '../lib.mjs';

const STYLE_LABELS = [
  ['mono', '黑白网点'],
  ['color', '彩色'],
  ['sketch', '线稿'],
];

const TYPE_NAME = { panel: '分格', bubble: '文字', native: '原生项' };

export function bboxField(item, patchItem) {
  return html`<div class="field">
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
        />`
      )}
    </div>
  </div>`;
}

export function metaFields(item, patchItem) {
  return html`<div class="field">
      <label>tags（3–6 个英文短词，选填）</label>
      <input
        class="input"
        value=${(item.tags || []).join(' ')}
        placeholder="ceramic_cup speckled_glaze"
        onInput=${(e) => patchItem(item.id, { tags: e.currentTarget.value.split(/[\s,]+/).filter(Boolean) })}
      />
    </div>
    <div class="field">
      <label>palette（最多 5 个，按面积从大到小）</label>
      <div class="row wrap">
        ${(item.palette || []).map(
          (hex, i) => html`<span class="swatch" key=${`${hex}-${i}`}>
            <input
              type="color"
              value=${hex}
              title=${hex}
              onInput=${(e) => {
                const next = [...(item.palette || [])];
                next[i] = e.currentTarget.value.toUpperCase();
                patchItem(item.id, { palette: next });
              }}
            />
            <button
              class="swatch-x"
              title="移除"
              onClick=${() => patchItem(item.id, { palette: (item.palette || []).filter((_, j) => j !== i) })}
            >×</button>
          </span>`
        )}
        ${(item.palette || []).length < 5
          ? html`<button class="chip" onClick=${() => patchItem(item.id, { palette: [...(item.palette || []), '#000000'] })}>＋ 颜色</button>`
          : null}
      </div>
    </div>`;
}

/** 页面属性：阅读顺序、画风、全局排版、场景、补充说明、内容清单 */
/** 单个 item 属性 */
export function ItemInspector({ item, patchItem, removeItem, onBack, onCopy }) {
  const header = html`<div class="row">
    <button class="btn sm ghost" onClick=${onBack}>← 返回</button>
    <div class="spacer"></div>
    <button class="btn sm ghost" onClick=${onCopy}>复制</button>
    <button class="btn sm ghost" onClick=${() => removeItem(item.id)}>删除</button>
  </div>`;

  const common = [bboxField(item, patchItem), metaFields(item, patchItem)];

  if (item.type === 'bubble') {
    return html`<div class="col">
      ${header}
      <div class="field">
        <label>文字</label>
        <textarea class="textarea" style="min-height:90px" value=${item.text || ''} onInput=${(e) => patchItem(item.id, { text: e.currentTarget.value })}></textarea>
      </div>
      <div class="row2">
        <div class="field">
          <label>类型</label>
          <select class="select" value=${item.kind} onChange=${(e) => patchItem(item.id, { kind: e.currentTarget.value })}>
            ${BUBBLE_LABELS.map((b) => html`<option value=${b.key}>${b.name}</option>`)}
          </select>
        </div>
        <div class="field">
          <label>字号</label>
          <input class="input" type="number" value=${item.size} onInput=${(e) => patchItem(item.id, { size: Number(e.currentTarget.value) || 22 })} />
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <label>排版</label>
          <select
            class="select"
            value=${item.vertical === undefined ? 'auto' : item.vertical ? 'v' : 'h'}
            onChange=${(e) => {
              const v = e.currentTarget.value;
              patchItem(item.id, { vertical: v === 'auto' ? undefined : v === 'v' });
            }}
          >
            <option value="auto">跟随全局</option>
            <option value="v">竖排</option>
            <option value="h">横排</option>
          </select>
        </div>
        <div class="field">
          <label>尾巴</label>
          <select class="select" value=${item.tail} onChange=${(e) => patchItem(item.id, { tail: e.currentTarget.value })}>
            <option value="none">无（说话者不在画面）</option>
            ${['down-left', 'down', 'down-right', 'left', 'right', 'up-left', 'up', 'up-right'].map((d) => html`<option value=${d}>${d}</option>`)}
          </select>
        </div>
      </div>
      ${common}
    </div>`;
  }

  if (item.type === 'native') {
    return html`<div class="col">
      ${header}
      <div class="field">
        <label>label（原生 Moss 字段）</label>
        <select class="select" value=${item.label} onChange=${(e) => patchItem(item.id, { label: e.currentTarget.value })}>
          ${['object', 'text', 'character'].map((l) => html`<option value=${l}>${l}</option>`)}
        </select>
      </div>
      <div class="field">
        <label>caption</label>
        <textarea class="textarea" style="min-height:80px" value=${item.caption || ''} onInput=${(e) => patchItem(item.id, { caption: e.currentTarget.value })}></textarea>
      </div>
      ${item.label === 'text'
        ? html`<div class="field">
            <label>text（要渲染的字）</label>
            <textarea class="textarea" style="min-height:60px" value=${item.text || ''} onInput=${(e) => patchItem(item.id, { text: e.currentTarget.value })}></textarea>
          </div>`
        : null}
      ${common}
    </div>`;
  }

  return html`<div class="col">
    ${header}
    <div class="field">
      <label>这一格画什么</label>
      <textarea class="textarea" style="min-height:110px" value=${item.caption || ''} onInput=${(e) => patchItem(item.id, { caption: e.currentTarget.value })}></textarea>
    </div>
    <div class="row2">
      <div class="field">
        <label>机位</label>
        <select class="select" value=${item.camera} onChange=${(e) => patchItem(item.id, { camera: e.currentTarget.value })}>
          ${CAMERA_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
        </select>
      </div>
      <div class="field">
        <label>形状</label>
        <select class="select" value=${item.shape} onChange=${(e) => patchItem(item.id, { shape: e.currentTarget.value })}>
          ${SHAPE_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
        </select>
      </div>
    </div>
    <div class="field">
      <label>边框</label>
      <select class="select" value=${item.frame} onChange=${(e) => patchItem(item.id, { frame: e.currentTarget.value })}>
        ${FRAME_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
      </select>
    </div>
    ${common}
  </div>`;
}

export { TYPE_NAME };
