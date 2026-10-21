// 设置弹窗：ComfyUI / 工作流 / 出图参数。
//
// 出图参数不是写死的表单——只渲染工作流里**真实存在**的占位符。
// 工作流没有 {{steps}} 就不显示步数，没有 {{ckpt}} 就不显示检查点。

import { html, api, apiPut, useState, useEffect, toast } from '../lib.mjs';

/** 占位符 → 表单字段。没在表里的（prompt/width/height…）由页面自动填，不给输入框 */
const FIELDS = {
  negative: { label: '负面提示词', type: 'textarea', key: 'negative', placeholder: 'nsfw, worst quality, bad anatomy' },
  steps: { label: '步数', type: 'number', key: 'steps' },
  cfg: { label: 'CFG', type: 'number', key: 'cfg', step: '0.1' },
  sampler: { label: '采样器', type: 'text', key: 'sampler', placeholder: 'euler' },
  scheduler: { label: '调度器', type: 'text', key: 'scheduler', placeholder: 'simple' },
  seed: { label: '默认 seed', type: 'number', key: 'seed', hint: '留空或 -1 = 每张随机' },
  ckpt: { label: '检查点', type: 'ckpt', key: 'ckpt' },
  lora_name: { label: 'LoRA', type: 'text', key: 'lora', placeholder: '<lora:moss\\xxx:0.7>' },
  denoise: { label: '重绘幅度', type: 'number', key: 'denoise', step: '0.05' },
};

/** 这些由页面/编译器自动填，只展示不给输入框 */
const AUTO = ['prompt', 'width', 'height', 'batch_size', 'lora_strength'];

const ORDER = ['negative', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'seed', 'ckpt', 'lora_name'];

export default function SettingsModal({ open, config, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [wf, setWf] = useState({ raw: '', params: [], ok: false, missing: [] });

  useEffect(() => {
    if (!open || !config) return;
    setForm(JSON.parse(JSON.stringify(config)));
    setStatus(null);
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    loadWorkflows();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const name = form?.workflow?.name;
    if (!name) {
      setWf({ raw: '', params: [], ok: false, missing: [] });
      return;
    }
    api(`/api/workflows/${encodeURIComponent(name)}`)
      .then((data) => setWf({ raw: data.raw || '', params: data.params || [], ok: Boolean(data.ok), missing: data.missing || [] }))
      .catch(() => setWf({ raw: '', params: [], ok: false, missing: [] }));
  }, [open, form?.workflow?.name]);


  async function loadWorkflows() {
    try {
      const data = await api('/api/workflows');
      setWorkflows(data.workflows || []);
    } catch {
      /* 忽略 */
    }
  }

  if (!open || !form) return null;

  const patchComfy = (patch) => setForm({ ...form, comfy: { ...form.comfy, ...patch } });
  const patchDefaults = (patch) => setForm({ ...form, defaults: { ...form.defaults, ...patch } });
  const setDefault = (key, value) => patchDefaults({ [key]: value });

  const params = wf.params || [];
  const paramNames = params.map((p) => p.name);
  const visible = ORDER.filter((name) => paramNames.includes(name));
  const autoFilled = paramNames.filter((name) => AUTO.includes(name));

  async function testComfy() {
    setBusy('comfy');
    setStatus(null);
    try {
      const res = await api('/api/comfy/models');
      if (res.ok) {
        setStatus({ ok: true, message: '连接正常' });
      } else {
        setStatus({ ok: false, message: res.message || '连不上' });
      }
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setBusy('');
    }
  }

  async function save() {
    setBusy('save');
    try {
      const saved = await apiPut('/api/config', {
        comfy: form.comfy,
        defaults: form.defaults,
        workflow: form.workflow,
      });
      onSaved?.(saved);
      toast('已保存');
      onClose?.();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy('');
    }
  }

  async function saveWorkflow() {
    setBusy('wf');
    try {
      const res = await apiPut(`/api/workflows/${encodeURIComponent(form.workflow.name || 'default.json')}`, { raw: wf.raw });
      setForm({ ...form, workflow: { ...form.workflow, name: res.name } });
      const savedCfg = await apiPut('/api/config', { workflow: { name: res.name } });
      onSaved?.(savedCfg);
      toast(`已保存 ${res.name}（${res.params?.length || 0} 个占位符）`);
      loadWorkflows();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy('');
    }
  }

  return html`<div class="modal-mask" onClick=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class="modal wide">
      <header>
        设置
        <div class="spacer" style="flex:1"></div>
        <button class="btn sm ghost" onClick=${onClose}>关闭</button>
      </header>
      <div class="body">
        <!-- ComfyUI -->
        <section class="panel-box">
          <header>ComfyUI</header>
          <div class="body">
            <div class="row2">
              <div class="field">
                <label>服务地址</label>
                <input class="input" value=${form.comfy.url} placeholder="http://127.0.0.1:8188" onInput=${(e) => patchComfy({ url: e.currentTarget.value })} />
              </div>
              <div class="field">
                <label>单张超时（毫秒）</label>
                <input class="input" type="number" value=${form.comfy.timeoutMs} onInput=${(e) => patchComfy({ timeoutMs: Number(e.currentTarget.value) || 180000 })} />
              </div>
            </div>
            <div class="row">
              <button class="btn" disabled=${busy === 'comfy'} onClick=${testComfy}>${busy === 'comfy' ? '测试中…' : '测试连接'}</button>
              ${status ? html`<div class="status ${status.ok ? 'ok' : 'bad'}">${status.ok ? 'OK' : 'FAIL'} · ${status.message}</div>` : null}
            </div>
          </div>
        </section>

        <!-- 工作流 -->
        <section class="panel-box">
          <header>
            工作流
            ${form.workflow.name
              ? html`<span class="tag">${form.workflow.name}</span>`
              : html`<span class="tag" style="background:#000;color:#fff">未设置</span>`}
          </header>
          <div class="body">
            <div class="row">
              <select
                class="select grow"
                value=${form.workflow.name || ''}
                onChange=${(e) => setForm({ ...form, workflow: { ...form.workflow, name: e.currentTarget.value } })}
              >
                <option value="">（未选择）</option>
                ${workflows.map((w) => html`<option value=${w.name}>${w.name}${w.ok ? '' : '（缺占位符）'}</option>`)}
              </select>
              <button class="btn ghost" onClick=${loadWorkflows}>刷新</button>
            </div>
            ${wf.missing?.length
              ? html`<div class="status bad">缺占位符：${wf.missing.map((m) => `{{${m}}}`).join('、')}</div>`
              : null}
            <div class="row wrap">
              ${params.length
                ? params.map((p) => html`<span class="chip ghost">{{${p.name}}}</span>`)
                : html`<span class="hint">还没有占位符。</span>`}
            </div>
            <details>
              <summary class="hint" style="cursor:pointer">查看 / 替换工作流 JSON（一般由 Agent 改）</summary>
              <textarea
                class="textarea"
                style="min-height:150px;margin-top:8px;font-family:var(--mono);font-size:11px"
                value=${wf.raw}
                placeholder="粘贴 ComfyUI「导出 (API)」的 JSON"
                onInput=${(e) => setWf({ ...wf, raw: e.currentTarget.value })}
              ></textarea>
              <div class="row">
                <div class="spacer"></div>
                <button class="btn" disabled=${busy === 'wf'} onClick=${saveWorkflow}>${busy === 'wf' ? '保存中…' : '保存工作流'}</button>
              </div>
            </details>
          </div>
        </section>

        <!-- 出图参数：只显示工作流里真实存在的占位符 -->
        <section class="panel-box">
          <header>出图参数</header>
          <div class="body">
            ${visible.length
              ? html`<div class="param-grid">
                  ${visible.map((name) => {
                    const spec = FIELDS[name];
                    const value = form.defaults[spec.key];
                    if (spec.type === 'ckpt') {
                      return html`<div class="field" key=${name}>
                        <label>${spec.label} <span class="mono">{{${name}}}</span></label>
                        <input
                          class="input"
                          value=${value ?? ''}
                          placeholder="照抄 ComfyUI checkpoints 里的文件名"
                          onInput=${(e) => setDefault(spec.key, e.currentTarget.value)}
                        />
                      </div>`;
                    }
                    if (spec.type === 'textarea') {
                      return html`<div class="field full" key=${name}>
                        <label>${spec.label} <span class="mono">{{${name}}}</span></label>
                        <textarea
                          class="textarea"
                          style="min-height:44px"
                          value=${value ?? ''}
                          placeholder=${spec.placeholder || ''}
                          onInput=${(e) => setDefault(spec.key, e.currentTarget.value)}
                        ></textarea>
                      </div>`;
                    }
                    return html`<div class="field" key=${name}>
                      <label>${spec.label} <span class="mono">{{${name}}}</span></label>
                      <input
                        class="input"
                        type=${spec.type}
                        step=${spec.step || null}
                        value=${value ?? ''}
                        placeholder=${spec.placeholder || ''}
                        onInput=${(e) =>
                          setDefault(spec.key, spec.type === 'number' ? (e.currentTarget.value === '' ? '' : Number(e.currentTarget.value)) : e.currentTarget.value)}
                      />
                      ${spec.hint ? html`<span class="hint">${spec.hint}</span>` : null}
                    </div>`;
                  })}
                </div>`
              : html`<span class="hint">${form.workflow.name ? '这个工作流没有可调参数。' : '先选工作流，这里只显示它实际用到的参数。'}</span>`}
            ${autoFilled.length
              ? html`<div class="row wrap">
                  <span class="hint">自动填：</span>
                  ${autoFilled.map((name) => html`<span class="chip ghost">{{${name}}}</span>`)}
                </div>`
              : null}
          </div>
        </section>

        <div class="hint mono">存档：${config?.archive || ''}</div>
      </div>
      <footer>
        <button class="btn ghost" onClick=${onClose}>取消</button>
        <button class="btn inv" disabled=${busy === 'save'} onClick=${save}>${busy === 'save' ? '保存中…' : '保存'}</button>
      </footer>
    </div>
  </div>`;
}
