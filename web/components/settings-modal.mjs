// 设置弹窗：ComfyUI / 出图默认值 / 工作流 / 可编辑范围。
// 取代原来的独立设置页：不用离开画布就能改。

import { html, api, apiPut, useState, useEffect, toast } from '../lib.mjs';

export default function SettingsModal({ open, config, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState({ checkpoints: [], samplers: [] });
  const [workflows, setWorkflows] = useState([]);
  const [wfRaw, setWfRaw] = useState('');
  const [wfParams, setWfParams] = useState([]);

  useEffect(() => {
    if (!open || !config) return;
    setForm(JSON.parse(JSON.stringify(config)));
    setStatus(null);
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    loadModels();
    loadWorkflows();
  }, [open]);

  useEffect(() => {
    if (!open || !form?.workflow?.name) return;
    api(`/api/workflows/${encodeURIComponent(form.workflow.name)}`)
      .then((data) => {
        setWfRaw(data.raw || '');
        setWfParams(data.params || []);
      })
      .catch(() => {});
  }, [open, form?.workflow?.name]);

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
    } catch {
      /* 忽略 */
    }
  }

  if (!open || !form) return null;

  const patchComfy = (patch) => setForm({ ...form, comfy: { ...form.comfy, ...patch } });
  const patchDefaults = (patch) => setForm({ ...form, defaults: { ...form.defaults, ...patch } });
  const patchEditable = (patch) => setForm({ ...form, editable: { ...form.editable, ...patch } });
  const patchParam = (patch) => setForm({ ...form, editable: { ...form.editable, params: { ...form.editable.params, ...patch } } });

  async function testComfy() {
    setBusy('comfy');
    setStatus(null);
    try {
      const res = await api('/api/comfy/models');
      if (res.ok) {
        setStatus({ ok: true, message: `连接正常 · ${res.checkpoints.length} 个检查点 / ${res.loras.length} 个 LoRA` });
        setModels(res);
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
        editable: form.editable,
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
      const res = await apiPut(`/api/workflows/${encodeURIComponent(form.workflow.name || 'default.json')}`, { raw: wfRaw });
      setWfParams(res.params || []);
      setForm({ ...form, workflow: { ...form.workflow, name: res.name } });
      // 保存工作流的同时把它设为当前，避免「保存了但没生效」
      const savedCfg = await apiPut('/api/config', { workflow: { name: res.name } });
      onSaved?.(savedCfg);
      toast(`已保存 ${res.name}，识别到 ${res.params?.length || 0} 个占位符`);
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
              <button class="btn ghost" onClick=${loadModels}>刷新模型</button>
              ${status ? html`<div class="status ${status.ok ? 'ok' : 'bad'}">${status.ok ? 'OK' : 'FAIL'} · ${status.message}</div>` : null}
            </div>
          </div>
        </section>

        <!-- 工作流 -->
        <section class="panel-box">
          <header>工作流 ${form.workflow.name ? html`<span class="tag">${form.workflow.name}</span>` : html`<span class="tag" style="background:#000;color:#fff">未设置</span>`}</header>
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
            <span class="hint">
              工作流存在配置根，跟存档无关。正常情况下让 Agent 读你的「导出 (API)」JSON、改成带
              <b>{{prompt}}</b> / <b>{{width}}</b> / <b>{{height}}</b> 的完整文件；这里只是兜底的手动入口。
            </span>
            <textarea class="textarea" style="min-height:150px;font-family:var(--mono);font-size:11px" value=${wfRaw} placeholder="粘贴 ComfyUI「导出 (API)」的 JSON" onInput=${(e) => setWfRaw(e.currentTarget.value)}></textarea>
            <div class="row wrap">
              ${wfParams.length ? wfParams.map((p) => html`<span class="chip ghost">{{${p.name}}}</span>`) : html`<span class="hint">还没有占位符。</span>`}
              <div class="spacer"></div>
              <button class="btn" disabled=${busy === 'wf'} onClick=${saveWorkflow}>${busy === 'wf' ? '保存中…' : '保存工作流'}</button>
            </div>
          </div>
        </section>

        <!-- 出图默认值 -->
        <section class="panel-box">
          <header>出图默认值</header>
          <div class="body">
            <div class="row3">
              <div class="field">
                <label>步数</label>
                <input class="input" type="number" value=${form.defaults.steps} onInput=${(e) => patchDefaults({ steps: Number(e.currentTarget.value) })} />
              </div>
              <div class="field">
                <label>CFG</label>
                <input class="input" type="number" step="0.1" value=${form.defaults.cfg} onInput=${(e) => patchDefaults({ cfg: Number(e.currentTarget.value) })} />
              </div>
              <div class="field">
                <label>采样器</label>
                <input class="input" value=${form.defaults.sampler} onInput=${(e) => patchDefaults({ sampler: e.currentTarget.value })} />
              </div>
            </div>
            <div class="row2">
              <div class="field">
                <label>检查点 ckpt（仅当工作流里有 ${'{{ckpt}}'}）</label>
                <select class="select" value=${form.defaults.ckpt} onChange=${(e) => patchDefaults({ ckpt: e.currentTarget.value })}>
                  <option value="">（不需要 / 未选择）</option>
                  ${models.checkpoints.map((m) => html`<option value=${m}>${m}</option>`)}
                  ${form.defaults.ckpt && !models.checkpoints.includes(form.defaults.ckpt)
                    ? html`<option value=${form.defaults.ckpt}>${form.defaults.ckpt}</option>`
                    : null}
                </select>
              </div>
              <div class="field">
                <label>默认 LoRA（可空）</label>
                <input class="input" value=${form.defaults.lora} placeholder="<lora:moss\\xxx:0.7>" onInput=${(e) => patchDefaults({ lora: e.currentTarget.value })} />
              </div>
            </div>
            <div class="field">
              <label>负面提示词</label>
              <textarea class="textarea" style="min-height:48px" value=${form.defaults.negative} onInput=${(e) => patchDefaults({ negative: e.currentTarget.value })}></textarea>
            </div>
          </div>
        </section>

        <!-- 可编辑范围 -->
        <section class="panel-box">
          <header>允许 Agent 改什么</header>
          <div class="body">
            <div class="row wrap" style="gap:18px">
              <label class="chk"><input type="checkbox" checked=${form.editable.layout !== false} onChange=${(e) => patchEditable({ layout: e.currentTarget.checked })} />版面</label>
              <label class="chk"><input type="checkbox" checked=${form.editable.text !== false} onChange=${(e) => patchEditable({ text: e.currentTarget.checked })} />台词</label>
              <label class="chk"><input type="checkbox" checked=${form.editable.bubbleType !== false} onChange=${(e) => patchEditable({ bubbleType: e.currentTarget.checked })} />气泡类型</label>
              <label class="chk"><input type="checkbox" checked=${form.editable.style !== false} onChange=${(e) => patchEditable({ style: e.currentTarget.checked })} />画风</label>
            </div>
            <div class="row wrap" style="gap:18px">
              <label class="chk"><input type="checkbox" checked=${form.editable.params?.seed !== false} onChange=${(e) => patchParam({ seed: e.currentTarget.checked })} />改 seed</label>
              <label class="chk"><input type="checkbox" checked=${form.editable.params?.steps === true} onChange=${(e) => patchParam({ steps: e.currentTarget.checked })} />改步数</label>
              <label class="chk"><input type="checkbox" checked=${form.editable.params?.cfg === true} onChange=${(e) => patchParam({ cfg: e.currentTarget.checked })} />改 CFG</label>
            </div>
            <span class="hint">关掉的范围，CLI 会直接拒绝越权改动。</span>
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
