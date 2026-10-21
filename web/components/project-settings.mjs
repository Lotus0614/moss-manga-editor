// 项目设置：新建页面的默认值 + 项目级生图参数（留空则跟随全局）。
// 只影响这个项目；新建页继承排版默认值，生图参数在渲染时覆盖全局。

import { html, api, apiPut, useState, useEffect, toast } from '../lib.mjs';

const STYLE_LABELS = [
  ['mono', '黑白网点'],
  ['color', '彩色'],
  ['sketch', '线稿'],
];

const GEN_FIELDS = [
  ['steps', '步数', 'number'],
  ['cfg', 'CFG', 'number'],
  ['sampler', '采样器', 'text'],
  ['scheduler', '调度器', 'text'],
  ['ckpt', '检查点', 'text'],
  ['lora', 'LoRA', 'text'],
];

export default function ProjectSettings({ slug, open, onClose, onSaved, onOpenGlobal }) {
  const [form, setForm] = useState(null);
  const [global, setGlobal] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !slug) return;
    Promise.all([api(`/api/projects/${slug}`), api('/api/config')])
      .then(([p, cfg]) => {
        const d = p.defaults || {};
        setGlobal(cfg.defaults || {});
        setForm({
          name: p.name,
          reading: d.reading || 'rtl',
          style: d.style || 'mono',
          vertical: d.vertical !== false,
          generation: {
            steps: '',
            cfg: '',
            sampler: '',
            scheduler: '',
            ckpt: '',
            lora: '',
            negative: '',
            ...(p.generation || {}),
          },
        });
      })
      .catch((err) => toast(err.message, 'bad'));
  }, [open, slug]);

  if (!open || !form) return null;

  const setGen = (patch) => setForm({ ...form, generation: { ...form.generation, ...patch } });

  async function save() {
    setBusy(true);
    try {
      const saved = await apiPut(`/api/projects/${slug}`, {
        name: form.name,
        defaults: { reading: form.reading, style: form.style, vertical: form.vertical },
        generation: form.generation,
      });
      onSaved?.(saved);
      toast('已保存');
      onClose?.();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return html`<div class="modal-mask" onClick=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class="modal wide">
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

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
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
            <button class=${`chip ${form.vertical ? 'on' : 'ghost'}`} onClick=${() => setForm({ ...form, vertical: true })}>全部竖排</button>
            <button class=${`chip ${form.vertical ? 'ghost' : 'on'}`} onClick=${() => setForm({ ...form, vertical: false })}>全部横排</button>
          </div>
          <span class="hint">只作用于新建的页面；已有页面在页面属性里单独改。</span>
        </div>

        <div class="divider"></div>
        <span class="label">生图参数（留空 = 跟随全局）</span>
        <div class="param-grid">
          ${GEN_FIELDS.map(([key, label, type]) => {
            const globalValue = global[key];
            return html`<div class="field" key=${key}>
              <label>${label}</label>
              <input
                class="input"
                type=${type}
                value=${form.generation[key] ?? ''}
                placeholder=${globalValue === undefined || globalValue === '' ? '跟随全局（未设置）' : `跟随全局：${globalValue}`}
                onInput=${(e) => setGen({ [key]: type === 'number' ? (e.currentTarget.value === '' ? '' : Number(e.currentTarget.value)) : e.currentTarget.value })}
              />
            </div>`;
          })}
        </div>
        <div class="field">
          <label>负面提示词</label>
          <textarea
            class="textarea"
            style="min-height:48px"
            value=${form.generation.negative ?? ''}
            placeholder=${global.negative ? `跟随全局：${String(global.negative).slice(0, 40)}…` : '跟随全局（未设置）'}
            onInput=${(e) => setGen({ negative: e.currentTarget.value })}
          ></textarea>
        </div>

        <div class="divider"></div>
        <div class="row">
          <span class="hint">工作流是全局的；这里只覆盖生图参数。</span>
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
