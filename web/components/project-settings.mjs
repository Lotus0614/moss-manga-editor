// 项目设置：新建页默认值 + 项目级工作流参数（留空 = 跟随全局）。
// 参数列表同样由工作流占位符生成，代码不认识具体名字。

import { html, api, apiPut, useState, useEffect, toast } from '../lib.mjs';

const STYLE_LABELS = [
  ['mono', '黑白网点'],
  ['color', '彩色'],
  ['sketch', '线稿'],
];

const AUTO = ['prompt', 'width', 'height', 'seed'];

export default function ProjectSettings({ slug, open, onClose, onSaved, onOpenGlobal }) {
  const [form, setForm] = useState(null);
  const [globalParams, setGlobalParams] = useState({});
  const [params, setParams] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !slug) return;
    Promise.all([api(`/api/projects/${slug}`), api('/api/config')])
      .then(async ([p, cfg]) => {
        setGlobalParams(cfg.params || {});
        setForm({
          name: p.name,
          reading: (p.defaults || {}).reading || 'rtl',
          style: (p.defaults || {}).style || 'mono',
          vertical: (p.defaults || {}).vertical !== false,
          canvas: p.canvas || [768, 1280],
          params: { ...(p.params || {}) },
        });
        const name = cfg.workflow?.name;
        if (name) {
          const wf = await api(`/api/workflows/${encodeURIComponent(name)}`);
          setParams((wf.params || []).filter((x) => !AUTO.includes(x.name)));
        }
      })
      .catch((err) => toast(err.message, 'bad'));
  }, [open, slug]);

  if (!open || !form) return null;

  const setParam = (name, value) =>
    setForm((prev) => {
      const next = { ...prev, params: { ...prev.params } };
      if (value === undefined) delete next.params[name];
      else next.params[name] = value;
      return next;
    });

  async function save() {
    setBusy(true);
    try {
      const saved = await apiPut(`/api/projects/${slug}`, {
        name: form.name,
        canvas: form.canvas,
        defaults: { reading: form.reading, style: form.style, vertical: form.vertical },
        params: form.params,
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
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field">
            <label>画布宽（16 的倍数）</label>
            <input class="input" type="number" step="16" value=${form.canvas[0]} onInput=${(e) => setForm({ ...form, canvas: [Number(e.currentTarget.value) || 768, form.canvas[1]] })} />
          </div>
          <div class="field">
            <label>画布高（16 的倍数）</label>
            <input class="input" type="number" step="16" value=${form.canvas[1]} onInput=${(e) => setForm({ ...form, canvas: [form.canvas[0], Number(e.currentTarget.value) || 1280] })} />
          </div>
        </div>
        <span class="hint">只影响之后新建的页面；已有页面尺寸不变。</span>

        <div class="divider"></div>
        <span class="label">项目级工作流参数（留空 = 跟随全局）</span>
        ${params.length
          ? html`<div class="param-grid">
              ${params.map((p) => {
                const own = form.params[p.name];
                const fallback = globalParams[p.name] ?? (p.hasDefault ? p.defaultValue : '');
                return html`<div class="field" key=${p.name}>
                  <label>${p.name} <span class="mono">{{${p.name}}}</span></label>
                  <input
                    class="input"
                    type=${p.type === 'number' ? 'number' : 'text'}
                    value=${own !== undefined ? own : ''}
                    placeholder=${fallback === '' || fallback === undefined ? '未设置' : `全局：${fallback}`}
                    onInput=${(e) => {
                      const raw = e.currentTarget.value;
                      if (raw === '') return setParam(p.name, undefined);
                      if (p.type === 'number') return setParam(p.name, Number(raw));
                      if (p.type === 'boolean') return setParam(p.name, raw === 'true');
                      return setParam(p.name, raw);
                    }}
                  />
                </div>`;
              })}
            </div>`
          : html`<span class="hint">当前工作流没有可填参数。</span>`}

        <div class="divider"></div>
        <div class="row">
          <span class="hint">工作流本身是全局的，这里只覆盖参数值。</span>
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
