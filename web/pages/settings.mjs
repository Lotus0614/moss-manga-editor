// 设置页：ComfyUI、检查点与出图默认值、工作流、编辑范围。

import { html, api, apiPut, useState, useEffect, toast, go } from '../lib.mjs';

export default function SettingsPage({ config, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [comfy, setComfy] = useState(null);
  const [models, setModels] = useState({ checkpoints: [], loras: [], samplers: [] });
  const [workflows, setWorkflows] = useState([]);
  const [wfName, setWfName] = useState('');
  const [wfRaw, setWfRaw] = useState('');
  const [wfParams, setWfParams] = useState([]);

  useEffect(() => {
    if (config) {
      setForm(JSON.parse(JSON.stringify(config)));
      setWfName(config.workflow?.name || 'default.json');
    }
  }, [config]);

  useEffect(() => {
    loadModels();
    loadWorkflows();
  }, []);

  useEffect(() => {
    if (wfName) {
      api(`/api/workflows/${encodeURIComponent(wfName)}`)
        .then((data) => {
          setWfRaw(data.raw || '');
        })
        .catch(() => {});
    }
  }, [wfName]);

  async function loadModels() {
    try {
      setModels(await api('/api/comfy/models'));
    } catch {
      /* ComfyUI 没开就静默 */
    }
  }

  async function loadWorkflows() {
    try {
      const data = await api('/api/workflows');
      setWorkflows(data.workflows || []);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  if (!form) return html`<div class="page-scroll"><div class="container">读取设置…</div></div>`;

  const patchComfy = (patch) => setForm({ ...form, comfy: { ...form.comfy, ...patch } });
  const setDefaults = (patch) => setForm({ ...form, defaults: { ...form.defaults, ...patch } });
  const setEditable = (patch) => setForm({ ...form, editable: { ...form.editable, ...patch } });
  const setParam = (patch) => setForm({ ...form, editable: { ...form.editable, params: { ...form.editable.params, ...patch } } });

  async function save() {
    setBusy('save');
    try {
      const saved = await apiPut('/api/config', {
        comfy: form.comfy,
        defaults: form.defaults,
        editable: form.editable,
        workflow: form.workflow,
      });
      onSaved?.(saved);
      toast('已保存');
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy('');
    }
  }

  async function testComfy() {
    setBusy('comfy');
    setComfy(null);
    try {
      const res = await api('/api/comfy/models');
      if (res.ok) {
        setComfy({ ok: true, message: `连接正常 · ${res.checkpoints.length} 个检查点 / ${res.loras.length} 个 LoRA` });
        setModels(res);
      } else {
        setComfy({ ok: false, message: res.message || '连不上' });
      }
    } catch (err) {
      setComfy({ ok: false, message: err.message });
    } finally {
      setBusy('');
    }
  }

  async function saveWorkflow() {
    setBusy('wf');
    try {
      const res = await apiPut(`/api/workflows/${encodeURIComponent(wfName)}`, { raw: wfRaw });
      setWfParams(res.params || []);
      toast(`已保存，识别到 ${res.params?.length || 0} 个参数`);
      loadWorkflows();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy('');
    }
  }

  return html`<div class="page-scroll">
    <div class="container">
      <div class="section-title">
        <h1>设置</h1>
        <span class="count">${config?.archive || ''}</span>
      </div>

      <div class="settings-grid">
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
              <button class="btn ghost" onClick=${loadModels}>刷新模型列表</button>
              ${comfy
                ? html`<div class="status ${comfy.ok ? 'ok' : 'bad'}">${comfy.ok ? 'OK' : 'FAIL'} · ${comfy.message}</div>`
                : null}
            </div>
          </div>
        </section>

        <section class="panel-box">
          <header>检查点与出图默认值</header>
          <div class="body">
            <div class="row2">
              <div class="field">
                <label>检查点 ckpt</label>
                <select class="select" value=${form.defaults.ckpt} onChange=${(e) => setDefaults({ ckpt: e.currentTarget.value })}>
                  <option value="">（未选择）</option>
                  ${models.checkpoints.map((m) => html`<option value=${m}>${m}</option>`)}
                  ${form.defaults.ckpt && !models.checkpoints.includes(form.defaults.ckpt)
                    ? html`<option value=${form.defaults.ckpt}>${form.defaults.ckpt}</option>`
                    : null}
                </select>
              </div>
              <div class="field">
                <label>默认 LoRA（可空）</label>
                <input class="input" value=${form.defaults.lora} placeholder="<lora:moss\\xxx:0.7>" onInput=${(e) => setDefaults({ lora: e.currentTarget.value })} />
              </div>
            </div>
            <div class="row3">
              <div class="field">
                <label>步数</label>
                <input class="input" type="number" value=${form.defaults.steps} onInput=${(e) => setDefaults({ steps: Number(e.currentTarget.value) })} />
              </div>
              <div class="field">
                <label>CFG</label>
                <input class="input" type="number" step="0.1" value=${form.defaults.cfg} onInput=${(e) => setDefaults({ cfg: Number(e.currentTarget.value) })} />
              </div>
              <div class="field">
                <label>采样器</label>
                <input class="input" value=${form.defaults.sampler} onInput=${(e) => setDefaults({ sampler: e.currentTarget.value })} />
              </div>
            </div>
            <div class="field">
              <label>负面提示词</label>
              <textarea class="textarea" style="min-height:52px" value=${form.defaults.negative} onInput=${(e) => setDefaults({ negative: e.currentTarget.value })}></textarea>
            </div>
          </div>
        </section>

        <section class="panel-box">
          <header>ComfyUI 工作流</header>
          <div class="body">
            <div class="row">
              <select class="select grow" value=${wfName} onChange=${(e) => setWfName(e.currentTarget.value)}>
                ${workflows.map((w) => html`<option value=${w.name}>${w.name}${w.ok ? '' : '（解析失败）'}</option>`)}
                ${!workflows.length ? html`<option value="">（没有工作流）</option>` : null}
              </select>
              <button class="btn" disabled=${busy === 'wf'} onClick=${saveWorkflow}>${busy === 'wf' ? '保存中…' : '保存'}</button>
            </div>
            <span class="hint">
              把 ComfyUI 里「工作流 → 导出 (API)」得到的 JSON 贴进来；想暴露成参数的字段写成 <b>{{prompt}}</b>、<b>{{seed}}</b>。
              保存后自动识别参数清单。
            </span>
            <textarea class="textarea" style="min-height:170px;font-family:var(--mono);font-size:11px" value=${wfRaw} onInput=${(e) => setWfRaw(e.currentTarget.value)}></textarea>
            <div class="row wrap">
              ${wfParams.length ? wfParams.map((p) => html`<span class="chip ghost">{{${p.name}}} · ${p.type}</span>`) : null}
              <div class="spacer"></div>
              <button class="btn ghost" onClick=${() => setForm({ ...form, workflow: { ...form.workflow, name: wfName } })}>设为当前</button>
              <span class="hint">当前：${form.workflow.name}</span>
            </div>
          </div>
        </section>

        <section class="panel-box">
          <header>允许 Agent 改什么</header>
          <div class="body">
            <div class="row wrap" style="gap:16px">
              <label class="chk"><input type="checkbox" checked=${form.editable.layout !== false} onChange=${(e) => setEditable({ layout: e.currentTarget.checked })} />版面（格子位置 / 形状 / 气泡位置）</label>
              <label class="chk"><input type="checkbox" checked=${form.editable.text !== false} onChange=${(e) => setEditable({ text: e.currentTarget.checked })} />台词</label>
              <label class="chk"><input type="checkbox" checked=${form.editable.bubbleType !== false} onChange=${(e) => setEditable({ bubbleType: e.currentTarget.checked })} />气泡类型</label>
              <label class="chk"><input type="checkbox" checked=${form.editable.style !== false} onChange=${(e) => setEditable({ style: e.currentTarget.checked })} />画风</label>
            </div>
            <div class="row wrap" style="gap:16px">
              <label class="chk"><input type="checkbox" checked=${form.editable.params?.seed !== false} onChange=${(e) => setParam({ seed: e.currentTarget.checked })} />允许改 seed</label>
              <label class="chk"><input type="checkbox" checked=${form.editable.params?.steps === true} onChange=${(e) => setParam({ steps: e.currentTarget.checked })} />允许改步数</label>
              <label class="chk"><input type="checkbox" checked=${form.editable.params?.cfg === true} onChange=${(e) => setParam({ cfg: e.currentTarget.checked })} />允许改 CFG</label>
            </div>
            <span class="hint">关掉的范围，CLI 的 page set 会直接拒绝越权改动，避免 Agent 悄悄改了你不想让它碰的东西。</span>
          </div>
        </section>
      </div>

      <div class="row" style="margin-top:22px">
        <button class="btn inv" disabled=${busy === 'save'} onClick=${save}>${busy === 'save' ? '保存中…' : '保存设置'}</button>
        <button class="btn ghost" onClick=${() => go('/projects')}>回到项目</button>
      </div>
    </div>
  </div>`;
}

