// 设置页：ComfyUI、大模型、出图默认值、工作流、Agent。

import { html, api, apiPut, useState, useEffect, toast, go, cls } from '../lib.mjs';

function Status({ state }) {
  if (!state) return null;
  return html`<div class="status ${state.ok ? 'ok' : 'bad'}">
    ${state.ok ? 'OK' : 'FAIL'} · ${state.message || ''}
  </div>`;
}

export default function SettingsPage({ settings, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [comfyTest, setComfyTest] = useState(null);
  const [llmTest, setLlmTest] = useState(null);
  const [models, setModels] = useState({ checkpoints: [], loras: [], samplers: [], schedulers: [] });
  const [workflows, setWorkflows] = useState([]);
  const [wfName, setWfName] = useState('');
  const [wfRaw, setWfRaw] = useState('');
  const [wfParams, setWfParams] = useState([]);

  useEffect(() => {
    if (settings) {
      setForm({
        comfy: { ...settings.comfy },
        llm: { ...settings.llm },
        defaults: { ...settings.defaults },
        agent: { ...settings.agent },
        onboarded: settings.onboarded,
      });
      setWfName(settings.comfy.workflow || '');
    }
  }, [settings]);

  useEffect(() => {
    loadWorkflows();
    loadModels();
  }, []);

  async function loadWorkflows() {
    try {
      const data = await api('/api/workflows');
      setWorkflows(data.workflows || []);
      if (!wfName && data.workflows?.length) setWfName(data.workflows[0].name);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function loadModels() {
    try {
      const data = await api('/api/comfy/models');
      setModels(data);
    } catch {
      /* ComfyUI 没开就静默 */
    }
  }

  async function openWorkflow(name) {
    setWfName(name);
    try {
      const data = await api(`/api/workflows/${encodeURIComponent(name)}`);
      setWfRaw(data.raw || '');
      setWfParams(data.params || []);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  useEffect(() => {
    if (wfName) openWorkflow(wfName);
  }, [wfName]);

  if (!form) return html`<div class="page-scroll"><div class="container">读取设置…</div></div>`;

  const setComfy = (patch) => setForm({ ...form, comfy: { ...form.comfy, ...patch } });
  const setLlm = (patch) => setForm({ ...form, llm: { ...form.llm, ...patch } });
  const setDefaults = (patch) => setForm({ ...form, defaults: { ...form.defaults, ...patch } });
  const setAgent = (patch) => setForm({ ...form, agent: { ...form.agent, ...patch } });

  async function save(extra = {}) {
    setBusy('save');
    try {
      const payload = {
        comfy: form.comfy,
        llm: form.llm,
        defaults: form.defaults,
        agent: form.agent,
        ...extra,
      };
      const saved = await apiPut('/api/settings', payload);
      onSaved?.(saved);
      toast('已保存');
      return saved;
    } catch (err) {
      toast(err.message, 'bad');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function testComfy() {
    setBusy('comfy');
    setComfyTest(null);
    try {
      const result = await api('/api/settings/test-comfy', {
        method: 'POST',
        body: { url: form.comfy.url, token: form.comfy.token },
      });
      setComfyTest(result);
      if (result.ok) loadModels();
    } catch (err) {
      setComfyTest({ ok: false, message: err.message });
    } finally {
      setBusy('');
    }
  }

  async function testLlm() {
    setBusy('llm');
    setLlmTest(null);
    try {
      const result = await api('/api/settings/test-llm', {
        method: 'POST',
        body: { baseUrl: form.llm.baseUrl, apiKey: form.llm.apiKey, model: form.llm.model },
      });
      setLlmTest(result);
    } catch (err) {
      setLlmTest({ ok: false, message: err.message });
    } finally {
      setBusy('');
    }
  }

  async function saveWorkflow() {
    setBusy('wf');
    try {
      const data = await apiPut(`/api/workflows/${encodeURIComponent(wfName)}`, { raw: wfRaw });
      setWfParams(data.params || []);
      toast(`工作流已保存，识别到 ${data.params?.length || 0} 个参数`);
      loadWorkflows();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy('');
    }
  }

  async function finishOnboarding() {
    const saved = await save({ onboarded: true });
    if (saved) go('/projects');
  }

  return html`<div class="page-scroll">
    <div class="container">
      <div class="section-title">
        <h1>设置</h1>
        <span class="count">${form.onboarded ? '已配置' : '首次配置'}</span>
      </div>

      ${!form.onboarded
        ? html`<div class="banner warn">
            <span>第一次用：填好下面两块（ComfyUI 地址 + 大模型），点「完成设置」就能开始。</span>
          </div>`
        : null}

      <div class="settings-grid">
        <!-- ComfyUI -->
        <section class="panel-box">
          <header>ComfyUI</header>
          <div class="body">
            <div class="field">
              <label>服务地址</label>
              <input
                class="input"
                value=${form.comfy.url}
                placeholder="http://127.0.0.1:8188"
                onInput=${(e) => setComfy({ url: e.currentTarget.value })}
              />
              <span class="hint">ComfyUI 默认端口 8188；如果开了 --listen 或走了反代，把完整地址填这里。</span>
            </div>
            <div class="row2">
              <div class="field">
                <label>访问令牌（可选）</label>
                <input
                  class="input"
                  value=${form.comfy.token}
                  placeholder=${form.comfy.tokenSet ? '已设置，留空则不修改' : '没有就留空'}
                  onInput=${(e) => setComfy({ token: e.currentTarget.value })}
                />
              </div>
              <div class="field">
                <label>单张生成超时（毫秒）</label>
                <input
                  class="input"
                  type="number"
                  value=${form.comfy.timeoutMs}
                  onInput=${(e) => setComfy({ timeoutMs: Number(e.currentTarget.value) || 180000 })}
                />
              </div>
            </div>
            <div class="row">
              <button class="btn" disabled=${busy === 'comfy'} onClick=${testComfy}>
                ${busy === 'comfy' ? '测试中…' : '测试连接'}
              </button>
              <button class="btn ghost" onClick=${loadModels}>刷新模型列表</button>
            </div>
            <${Status} state=${comfyTest} />
          </div>
        </section>

        <!-- 出图默认值 -->
        <section class="panel-box">
          <header>出图默认值</header>
          <div class="body">
            <div class="row2">
              <div class="field">
                <label>检查点 ckpt</label>
                <select class="select" value=${form.defaults.ckpt} onChange=${(e) => setDefaults({ ckpt: e.currentTarget.value })}>
                  <option value="">（未选择）</option>
                  ${models.checkpoints.map((m) => html`<option value=${m} selected=${m === form.defaults.ckpt}>${m}</option>`)}
                  ${form.defaults.ckpt && !models.checkpoints.includes(form.defaults.ckpt)
                    ? html`<option value=${form.defaults.ckpt}>${form.defaults.ckpt}</option>`
                    : null}
                </select>
              </div>
              <div class="field">
                <label>默认 LoRA（可空）</label>
                <input
                  class="input"
                  value=${form.defaults.lora}
                  placeholder="<lora:moss\\xxx:0.7>"
                  onInput=${(e) => setDefaults({ lora: e.currentTarget.value })}
                />
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
              <textarea
                class="textarea"
                style="min-height:52px"
                value=${form.defaults.negative}
                onInput=${(e) => setDefaults({ negative: e.currentTarget.value })}
              ></textarea>
            </div>
            <span class="hint">这些值会填进工作流里同名的占位符（{{steps}}、{{cfg}}、{{sampler}}…）。</span>
          </div>
        </section>

        <!-- 大模型 -->
        <section class="panel-box">
          <header>大模型（OpenAI 兼容）</header>
          <div class="body">
            <div class="field">
              <label>Base URL</label>
              <input
                class="input"
                value=${form.llm.baseUrl}
                placeholder="https://api.deepseek.com/v1"
                onInput=${(e) => setLlm({ baseUrl: e.currentTarget.value })}
              />
              <span class="hint">填到 /v1 为止。DeepSeek、OpenAI、OpenRouter、vLLM、Ollama 都是这个格式。</span>
            </div>
            <div class="row2">
              <div class="field">
                <label>API Key</label>
                <input
                  class="input"
                  type="password"
                  value=${form.llm.apiKey}
                  placeholder=${form.llm.apiKeySet ? `已设置 ${form.llm.apiKeyHint}，留空则不修改` : 'sk-…'}
                  onInput=${(e) => setLlm({ apiKey: e.currentTarget.value })}
                />
              </div>
              <div class="field">
                <label>模型名</label>
                <input
                  class="input"
                  value=${form.llm.model}
                  placeholder="deepseek-chat"
                  onInput=${(e) => setLlm({ model: e.currentTarget.value })}
                />
              </div>
            </div>
            <div class="row">
              <label class="chk">
                <input type="checkbox" checked=${form.llm.vision !== false} onChange=${(e) => setLlm({ vision: e.currentTarget.checked })} />
                模型支持看图
              </label>
              <div class="spacer"></div>
              <button class="btn" disabled=${busy === 'llm'} onClick=${testLlm}>
                ${busy === 'llm' ? '测试中…' : '测试连通'}
              </button>
            </div>
            <${Status} state=${llmTest} />
            <span class="hint">密钥只存在本机 data/settings.json，界面上永远不会回显完整内容。</span>
          </div>
        </section>

        <!-- 工作流 -->
        <section class="panel-box">
          <header>ComfyUI 工作流</header>
          <div class="body">
            <div class="row">
              <select class="select grow" value=${wfName} onChange=${(e) => setWfName(e.currentTarget.value)}>
                ${workflows.map((w) => html`<option value=${w.name}>${w.name}${w.ok ? '' : '（解析失败）'}</option>`)}
                ${!workflows.length ? html`<option value="">（workflows 目录为空）</option>` : null}
              </select>
              <button class="btn" disabled=${busy === 'wf'} onClick=${saveWorkflow}>${busy === 'wf' ? '保存中…' : '保存工作流'}</button>
            </div>
            <span class="hint">
              把 ComfyUI 里导出的 <b>API 格式</b> JSON 贴进下面，想暴露成参数的字段写成 {{prompt}}、{{seed}} 这种占位符。
              保存后会自动识别出参数清单。
            </span>
            <textarea
              class="textarea"
              style="min-height:190px;font-family:var(--mono);font-size:11px"
              value=${wfRaw}
              onInput=${(e) => setWfRaw(e.currentTarget.value)}
            ></textarea>
            <div class="row wrap">
              ${wfParams.length
                ? wfParams.map((p) => html`<span class="chip ghost" title="出现 ${p.count} 次">{{${p.name}}} · ${p.type}</span>`)
                : html`<span class="hint">还没有识别到占位符。</span>`}
            </div>
            <div class="row">
              <button class="btn ghost" onClick=${() => setComfy({ workflow: wfName })}>设为当前工作流</button>
              <span class="hint">当前：${form.comfy.workflow}</span>
            </div>
          </div>
        </section>

        <!-- Agent -->
        <section class="panel-box">
          <header>Agent</header>
          <div class="body">
            <div class="row3">
              <div class="field">
                <label>默认模式</label>
                <select class="select" value=${form.agent.mode} onChange=${(e) => setAgent({ mode: e.currentTarget.value })}>
                  <option value="single">单 Agent</option>
                  <option value="sub">子 Agent</option>
                </select>
              </div>
              <div class="field">
                <label>最多工具轮数</label>
                <input class="input" type="number" value=${form.agent.maxSteps} onInput=${(e) => setAgent({ maxSteps: Number(e.currentTarget.value) || 10 })} />
              </div>
              <div class="field">
                <label>保留对话条数</label>
                <input class="input" type="number" value=${form.agent.keepMessages} onInput=${(e) => setAgent({ keepMessages: Number(e.currentTarget.value) || 12 })} />
              </div>
            </div>
            <span class="hint">超过保留条数的旧对话会被压缩成摘要，避免上下文越滚越大。</span>
          </div>
        </section>
      </div>

      <div class="row" style="margin-top:22px">
        <button class="btn inv" disabled=${busy === 'save'} onClick=${() => save()}>${busy === 'save' ? '保存中…' : '保存设置'}</button>
        ${!form.onboarded
          ? html`<button class="btn" disabled=${busy === 'save'} onClick=${finishOnboarding}>完成设置，开始用</button>`
          : html`<button class="btn ghost" onClick=${() => go('/projects')}>回到项目</button>`}
        <span class="hint">只有 ComfyUI 和大模型都填了才算 ready。</span>
      </div>
    </div>
  </div>`;
}
