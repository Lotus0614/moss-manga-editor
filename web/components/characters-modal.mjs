// 角色表：项目级人物设定（id / 显示名 / 英文外貌）。
// 独立入口，和「项目设置」分开；页面上的角色项只存 ref，外貌从这里取。

import { html, api, apiPut, useState, useEffect, toast } from '../lib.mjs';

function nextId(list) {
  const used = new Set(list.map((char) => char.id));
  let n = 1;
  while (used.has(`char${n}`)) n += 1;
  return `char${n}`;
}

export default function CharactersModal({ slug, open, onClose, onSaved }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !slug) return;
    setList(null);
    api(`/api/projects/${slug}`)
      .then((project) => {
        setList((project.characters || []).map((char) => ({ ...char })));
      })
      .catch((err) => toast(err.message, 'bad'));
  }, [open, slug]);

  if (!open) return null;

  const rows = list || [];

  const patch = (index, next) =>
    setList((prev) => prev.map((char, i) => (i === index ? { ...char, ...next } : char)));

  const add = () => setList((prev) => [...prev, { id: nextId(prev), name: '', look: '' }]);
  const remove = (index) => setList((prev) => prev.filter((_, i) => i !== index));

  async function save() {
    const cleaned = [];
    const seen = new Set();
    for (const char of rows) {
      const id = String(char.id || '').trim().toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      cleaned.push({ id, name: String(char.name || '').trim() || id, look: String(char.look || '').trim() });
    }
    setBusy(true);
    try {
      const saved = await apiPut(`/api/projects/${slug}`, { characters: cleaned });
      onSaved?.(saved);
      toast('角色表已保存');
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
        角色表
        <div class="spacer" style="flex:1"></div>
        <button class="btn sm ghost" onClick=${onClose}>关闭</button>
      </header>
      <div class="body">
        <span class="hint">
          外貌只写一次，页面上的角色项按 id 引用。名字用罗马音：提示词里的汉字会被画到画面上。
        </span>

        ${list === null
          ? html`<div class="hint">读取中…</div>`
          : rows.length
            ? html`<div class="col" style="gap:10px">
                ${rows.map(
                  (char, i) => html`<div class="col" style="gap:6px;border:1px solid var(--line,#e5e5e5);padding:8px;border-radius:6px" key=${char.id + i}>
                    <div class="row" style="gap:8px;align-items:center">
                      <span class="mono small" style="min-width:64px">${char.id}</span>
                      <input
                        class="input"
                        placeholder="显示名（罗马音，例如 Reina）"
                        value=${char.name}
                        onInput=${(e) => patch(i, { name: e.currentTarget.value })}
                      />
                      <button class="btn sm ghost" title="删除角色" onClick=${() => remove(i)}>删除</button>
                    </div>
                    <textarea
                      class="textarea"
                      style="min-height:56px"
                      placeholder="英文外貌：年龄、发型、五官、服装、体型（这格裸体／受伤时不要写在这里，写到页面角色的 caption 里，前面加 !）"
                      value=${char.look}
                      onInput=${(e) => patch(i, { look: e.currentTarget.value })}
                    ></textarea>
                  </div>`
                )}
              </div>`
            : html`<div class="hint">还没有角色。先在这里定义主角，页面上才能选。</div>`}

        <div class="row">
          <button class="btn ghost" onClick=${add}>＋ 角色</button>
          <div class="spacer"></div>
          <span class="hint">单格特例（裸体／受伤／换装）：在页面角色的 caption 里写，前面加 <span class="mono">!</span></span>
        </div>
      </div>
      <footer>
        <button class="btn ghost" onClick=${onClose}>取消</button>
        <button class="btn inv" disabled=${busy || list === null} onClick=${save}>${busy ? '保存中…' : '保存'}</button>
      </footer>
    </div>
  </div>`;
}
