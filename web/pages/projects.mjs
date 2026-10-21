// 项目列表页。

import { html, api, apiDelete, go, useState, useEffect, formatTime, toast, cls } from '../lib.mjs';

const SIZES = [
  ['page', '分镜页 768×1280'],
  ['page-hd', '分镜页高清 1152×1920'],
  ['square', '方图 1024×1024'],
  ['wide', '横版 1536×1024'],
];

export default function ProjectsPage({ settings }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', size: 'page', withSamplePage: true });
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
    const name = form.name.trim() || '未命名项目';
    setBusy(true);
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        body: { name, size: form.size, withSamplePage: form.withSamplePage },
      });
      setCreating(false);
      setForm({ name: '', size: 'page', withSamplePage: true });
      go(`/p/${project.id}`);
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function remove(event, project) {
    event.stopPropagation();
    if (!confirm(`删除项目「${project.name}」？页面的历史图片会一起删掉，无法恢复。`)) return;
    try {
      await apiDelete(`/api/projects/${project.id}`);
      toast('已删除');
      load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  const ready = settings?.ready;

  return html`<div class="page-scroll">
    <div class="container">
      ${!ready
        ? html`<div class="banner warn">
            <span>还没配置完 ComfyUI 或大模型，现在可以先把版面排好，出图前补上配置。</span>
            <button class="btn" onClick=${() => go('/settings')}>去设置</button>
          </div>`
        : null}

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
          ? html`<div class="empty-state">
              <b>还没有项目</b>
              新建一个，然后让 Agent 或你自己排出第一页。
            </div>`
          : html`<div class="grid-projects">
              ${list.map(
                (p) => html`<div class="card" key=${p.id} onClick=${() => go(`/p/${p.id}`)}>
                  <div class="cover">
                    ${p.cover
                      ? html`<img src=${p.cover} alt="" loading="lazy" />`
                      : html`<span class="empty">NO IMAGE</span>`}
                  </div>
                  <div class="meta">
                    <div class="name">${p.name}</div>
                    <div class="row">
                      <span class="sub">${p.pageCount} 页</span>
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
              <div class="field">
                <label>画布</label>
                <select
                  class="select"
                  value=${form.size}
                  onChange=${(e) => setForm({ ...form, size: e.currentTarget.value })}
                >
                  ${SIZES.map(([id, label]) => html`<option value=${id}>${label}</option>`)}
                </select>
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
