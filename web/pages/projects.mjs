// 项目列表页。

import { html, api, apiDelete, go, useState, useEffect, toast } from '../lib.mjs';

const SIZES = [
  ['page', '分镜页 768×1280'],
  ['page-hd', '分镜页高清 1152×1920'],
  ['square', '方图 1024×1024'],
  ['wide', '横版 1536×1024'],
];

export default function ProjectsPage() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', width: 768, height: 1280, withSamplePage: true });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api('/api/projects');
      setList(data.projects || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    setBusy(true);
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        body: { name: form.name.trim() || '未命名项目', canvas: [form.width, form.height], withSamplePage: form.withSamplePage },
      });
      setCreating(false);
      setForm({ name: '', width: 768, height: 1280, withSamplePage: true });
      go(`/p/${project.slug}`);
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function remove(event, project) {
    event.stopPropagation();
    if (!confirm(`删除项目「${project.name}」？页面与历史图会一起删掉。`)) return;
    try {
      await apiDelete(`/api/projects/${project.slug}`);
      toast('已删除');
      load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  return html`<div class="page-scroll">
    <div class="container">
      <div class="section-title">
        <h1>项目</h1>
        <span class="count">${list ? `${list.length} 个` : '…'}</span>
        <div class="spacer"></div>
        <button class="btn inv" onClick=${() => setCreating(true)}>新建项目</button>
      </div>

      ${error ? html`<div class="banner warn"><span>${error}</span></div>` : null}

      ${list === null
        ? html`<div class="empty-state">读取中…</div>`
        : list.length === 0
          ? html`<div class="empty-state"><b>还没有项目</b>新建一个，或者让你的 Agent 用 CLI 建。</div>`
          : html`<div class="grid-projects">
              ${list.map(
                (p) => html`<div class="card" key=${p.slug} onClick=${() => go(`/p/${p.slug}`)}>
                  <div class="cover">
                    ${p.cover ? html`<img src=${p.cover} alt="" loading="lazy" />` : html`<span class="empty">NO IMAGE</span>`}
                    ${p.covers && p.covers.length > 0
                      ? html`<div class="filmstrip">
                          ${p.covers.map((src) => html`<img src=${src} alt="" loading="lazy" />`)}
                        </div>`
                      : null}
                  </div>
                  <div class="meta">
                    <div class="name">${p.name}</div>
                    <div class="row">
                      <span class="sub">${p.pages} 页 · ${p.images || 0} 张图</span>
                      <div class="spacer"></div>
                      <button class="btn sm ghost" onClick=${(e) => remove(e, p)}>删除</button>
                    </div>
                  </div>
                </div>`
              )}
              <div class="card add" onClick=${() => setCreating(true)}>+ 新建项目</div>
            </div>`}
    </div>

    ${creating
      ? html`<div class="modal-mask" onClick=${(e) => e.target === e.currentTarget && setCreating(false)}>
          <div class="modal">
            <header>新建项目</header>
            <div class="body">
              <div class="field">
                <label>项目名</label>
                <input
                  class="input"
                  autofocus
                  value=${form.name}
                  placeholder="例如：雨中的便利店"
                  onInput=${(e) => setForm({ ...form, name: e.currentTarget.value })}
                  onKeyDown=${(e) => e.key === 'Enter' && create()}
                />
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="field">
                  <label>画布宽（16 的倍数）</label>
                  <input class="input" type="number" step="16" value=${form.width} onInput=${(e) => setForm({ ...form, width: Number(e.currentTarget.value) || 768 })} />
                </div>
                <div class="field">
                  <label>画布高（16 的倍数）</label>
                  <input class="input" type="number" step="16" value=${form.height} onInput=${(e) => setForm({ ...form, height: Number(e.currentTarget.value) || 1280 })} />
                </div>
              </div>
              <label class="chk">
                <input
                  type="checkbox"
                  checked=${form.withSamplePage}
                  onChange=${(e) => setForm({ ...form, withSamplePage: e.currentTarget.checked })}
                />
                顺便生成一页示例排版
              </label>
            </div>
            <footer>
              <button class="btn ghost" onClick=${() => setCreating(false)}>取消</button>
              <button class="btn inv" disabled=${busy} onClick=${create}>${busy ? '创建中…' : '创建'}</button>
            </footer>
          </div>
        </div>`
      : null}
  </div>`;
}
