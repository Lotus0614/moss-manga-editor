// 项目设置：新建页面的默认值（阅读顺序 / 画风 / 文字排版）。
// 只影响之后新建的页，已有页面不受影响。

import { html, api, apiPut, useState, useEffect, toast } from '../lib.mjs';

const STYLE_LABELS = [
  ['mono', '黑白网点'],
  ['color', '彩色'],
  ['sketch', '线稿'],
];

export default function ProjectSettings({ slug, open, onClose, onSaved, onOpenGlobal }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !slug) return;
    api(`/api/projects/${slug}`)
      .then((p) => {
        const d = p.defaults || {};
        setForm({
          name: p.name,
          reading: d.reading || 'rtl',
          style: d.style || 'mono',
          vertical: d.vertical !== false,
        });
      })
      .catch((err) => toast(err.message, 'bad'));
  }, [open, slug]);

  if (!open || !form) return null;

  async function save() {
    setBusy(true);
    try {
      const saved = await apiPut(`/api/projects/${slug}`, {
        name: form.name,
        defaults: { reading: form.reading, style: form.style, vertical: form.vertical },
      });
      onSaved?.(saved);
      toast('已保存，之后新建的页面会用这些默认值');
      onClose?.();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return html`<div class="modal-mask" onClick=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class="modal">
      <header>
        项目设置
        <div class="spacer" style="flex:1"></div>
        <button class="btn sm ghost" onClick=${onClose}>关闭</button>
      </header>
      <div class="body">
        <div class="field">
          <label>项目名</label>
          <input class="input" value=${form.name} onInput=${(e) => setForm({ ...form, name: e.currentTarget.value })} />
        </div>

        <div class="row2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field">
            <label>默认阅读顺序</label>
            <select class="select" value=${form.reading} onChange=${(e) => setForm({ ...form, reading: e.currentTarget.value })}>
              <option value="rtl">右 → 左</option>
              <option value="ltr">左 → 右</option>
            </select>
          </div>
          <div class="field">
            <label>默认画风</label>
            <select class="select" value=${form.style} onChange=${(e) => setForm({ ...form, style: e.currentTarget.value })}>
              ${STYLE_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
            </select>
          </div>
        </div>

        <div class="field">
          <label>默认文字排版</label>
          <div class="row">
            <button
              class=${`chip ${form.vertical ? 'on' : 'ghost'}`}
              onClick=${() => setForm({ ...form, vertical: true })}
            >全部竖排</button>
            <button
              class=${`chip ${form.vertical ? 'ghost' : 'on'}`}
              onClick=${() => setForm({ ...form, vertical: false })}
            >全部横排</button>
          </div>
          <span class="hint">只作用于新建的页面；已有页面可以在页面属性里单独改。</span>
        </div>

        <div class="divider"></div>
        <div class="row">
          <span class="hint">工作流和生图参数是全局的，不属于某个项目。</span>
          <div class="spacer"></div>
          <button class="btn ghost" onClick=${onOpenGlobal}>打开全局设置</button>
        </div>
      </div>
      <footer>
        <button class="btn ghost" onClick=${onClose}>取消</button>
        <button class="btn inv" disabled=${busy} onClick=${save}>${busy ? '保存中…' : '保存'}</button>
      </footer>
    </div>
  </div>`;
}
