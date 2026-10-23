// 编辑页：左页序 / 中画布 + 工作台 / 右属性面板。
// 页面是单层 items；快捷键 Delete 删除、Ctrl+C/V 复制粘贴、Ctrl+Z 撤销。

import {
  html,
  api,
  apiPost,
  apiPut,
  apiDelete,
  go,
  useState,
  useEffect,
  useRef,
  useMemo,
  toast,
  cls,
  setApp,

} from '../lib.mjs';
import Canvas from '../components/canvas.mjs';
import PagePanel from '../components/page-panel.mjs';
import ItemForm from '../components/item-form.mjs';
import { ITEM_TYPES, itemType } from '../../config/ui.mjs';
import { PromptPanel, HistoryPanel, ChangesPanel } from '../components/workbench.mjs';
import { exportLongImage, exportPdf } from '../components/export.mjs';
import { compilePage } from '../../core/compile.mjs';
import { compileContext } from '../../core/bible.mjs';
import { createItem } from '../../core/manga-doc.mjs';

const STYLE_LABELS = [
  ['mono', '黑白网点'],
  ['color', '彩色'],
  ['sketch', '线稿'],
];

const TYPE_NAME = { panel: '分格', bubble: '文字', native: '原生项' };

export default function EditorPage({ projectId, pageId, config, onOpenSettings }) {
  const [project, setProject] = useState(null);
  const [pages, setPages] = useState([]);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [page, setPage] = useState(null);
  const [versions, setVersions] = useState([]);
  const [current, setCurrent] = useState('');
  const [selection, setSelection] = useState(null);
  const [tab, setTab] = useState('prompt');
  const [gen, setGen] = useState(null);
  const [busyGen, setBusyGen] = useState(false);
  const [fitScale, setFitScale] = useState(0.55);
  const [zoom, setZoom] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [grid, setGrid] = useState(4);
  const [opacity, setOpacity] = useState(0.55);
  const [changes, setChanges] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState('');

  const stageRef = useRef(null);
  const pageRef = useRef(null);
  const saveTimer = useRef(null);
  const createdFirst = useRef(false);
  const history = useRef([]);
  const clipboard = useRef(null);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const proj = await api(`/api/projects/${projectId}`);
        if (!alive) return;
        setProject(proj);
        setApp({ project: proj });
        const data = await api(`/api/projects/${projectId}/pages`);
        if (!alive) return;
        setPages(data.pages || []);
        setPagesLoaded(true);
      } catch (err) {
        toast(err.message, 'bad');
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!pageId) return;
    let alive = true;
    api(`/api/projects/${projectId}/pages/${pageId}`)
      .then((data) => {
        if (!alive) return;
        setPage(data.page);
        pageRef.current = data.page;
        setVersions(data.versions || []);
        setCurrent(data.current || '');
        setApp({ page: data.page });
        setSelection(null);
        history.current = [];
      })
      .catch((err) => toast(err.message, 'bad'));
    return () => {
      alive = false;
    };
  }, [projectId, pageId]);

  useEffect(() => {
    if (!pagesLoaded || pageId || !project || createdFirst.current) return;
    if (!pages.length) {
      createdFirst.current = true;
      apiPost(`/api/projects/${projectId}/pages`, {})
        .then((doc) => go(`/p/${projectId}/p/${doc.id}`))
        .catch((err) => toast(err.message, 'bad'));
    } else {
      go(`/p/${projectId}/p/${pages[0].id}`);
    }
  }, [project, pages, pagesLoaded, pageId, projectId]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !page) return;
    const fit = () => {
      const w = el.clientWidth - 48;
      const h = el.clientHeight - 48;
      setFitScale(Math.max(0.16, Math.min(w / page.size[0], h / page.size[1])));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page?.size?.[0], page?.size?.[1], page]);

  useEffect(() => {
    const es = new EventSource('/api/jobs/stream');
    es.addEventListener('job', (event) => {
      let job;
      try {
        job = JSON.parse(event.data);
      } catch {
        return;
      }
      const cur = pageRef.current;
      if (!cur || job.page !== cur.id) return;
      setGen(job);
      if (job.status === 'done') {
        setBusyGen(false);
        toast('生成完成');
        reloadPage(cur.id);
        refreshPages();
      } else if (job.status === 'error') {
        setBusyGen(false);
        toast(job.error || '生成失败', 'bad');
      }
    });
    return () => es.close();
  }, [projectId]);

  // ---- 快捷键
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'c') {
        copySelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        paste();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = idsOfSelection();
        if (ids.length) {
          e.preventDefault();
          removeItems(ids);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

  function refreshPages() {
    api(`/api/projects/${projectId}/pages`)
      .then((data) => {
        setPages(data.pages || []);
        setPagesLoaded(true);
      })
      .catch(() => {});
  }

  function reloadPage(id) {
    api(`/api/projects/${projectId}/pages/${id}`)
      .then((data) => {
        setPage(data.page);
        pageRef.current = data.page;
        setVersions(data.versions || []);
        setCurrent(data.current || '');
      })
      .catch(() => {});
  }

  /** selection 统一形状：{ kind, id, ids }，id 是主选中项，ids 是全部选中 */
  function select(next) {
    if (!next) return setSelection(null);
    const ids = Array.isArray(next.ids) && next.ids.length ? next.ids : [next.id];
    setSelection({ kind: next.kind, id: next.id || ids[ids.length - 1], ids });
  }

  // ---- 修改与历史
  function snapshot() {
    const cur = pageRef.current;
    if (!cur) return;
    const json = JSON.stringify(cur);
    if (history.current[history.current.length - 1] === json) return;
    history.current.push(json);
    if (history.current.length > 80) history.current.shift();
  }

  function mutate(updater) {
    const cur = pageRef.current;
    if (!cur) return;
    snapshot();
    const next = typeof updater === 'function' ? updater(cur) : { ...cur, ...updater };
    pageRef.current = next;
    setPage(next);
    scheduleSave();
  }

  /** 拖拽过程中只更新视图，不进历史；list 是 [{ id, bbox }] */
  function updateBbox(list) {
    const cur = pageRef.current;
    if (!cur || !list?.length) return;
    const map = new Map(list.map((one) => [one.id, one.bbox]));
    const next = { ...cur, items: cur.items.map((it) => (map.has(it.id) ? { ...it, bbox: map.get(it.id) } : it)) };
    pageRef.current = next;
    setPage(next);
  }

  function undo() {
    const snap = history.current.pop();
    if (!snap) {
      toast('没有可撤销的操作');
      return;
    }
    const prev = JSON.parse(snap);
    pageRef.current = prev;
    setPage(prev);
    setSelection(null);
    saveNow();
  }

  function copySelected() {
    const cur = pageRef.current;
    const items = idsOfSelection()
      .map((id) => cur?.items.find((it) => it.id === id))
      .filter(Boolean)
      .map((it) => JSON.parse(JSON.stringify(it)));
    if (!items.length) return;
    clipboard.current = items;
    toast(items.length > 1 ? `已复制 ${items.length} 项` : `已复制${TYPE_NAME[items[0].type] || '项'}`);
  }

  function paste() {
    const src = clipboard.current;
    if (!src?.length) return;
    const created = src.map((one) => {
      const { id, ...rest } = one;
      return createItem(one.type, {
        ...rest,
        bbox: [one.bbox[0] + 24, one.bbox[1] + 24, one.bbox[2] + 24, one.bbox[3] + 24],
      });
    });
    mutate((cur) => ({ ...cur, items: [...cur.items, ...created] }));
    select({ kind: created[0].type, id: created[created.length - 1].id, ids: created.map((it) => it.id) });
    setTimeout(saveNow, 60);
  }

  /** 当前选中的 id 列表（单选也返回单元素数组） */
  function idsOfSelection() {
    if (!selection) return [];
    if (Array.isArray(selection.ids) && selection.ids.length) return selection.ids;
    return selection.id ? [selection.id] : [];
  }

  function scheduleSave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, 600);
  }

  async function saveNow() {
    const cur = pageRef.current;
    if (!cur) return;
    try {
      const saved = await apiPut(`/api/projects/${projectId}/pages/${cur.id}`, { ...cur, replaceItems: true });
      pageRef.current = saved;
      setPage((prev) => (prev && prev.id === saved.id ? { ...prev, rev: saved.rev } : prev));
      refreshPages();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  const compiled = useMemo(() => {
    if (!page) return null;
    try {
      return compilePage(page, compileContext(project, page));
    } catch (err) {
      return { json: '', warnings: [{ level: 'error', code: 'compile', message: err.message }], stats: {} };
    }
  }, [page, project]);

  async function generate() {
    if (!page || generating) return;
    if (!config?.workflow?.name) {
      toast('还没有工作流：在设置里粘贴 ComfyUI「导出 (API)」的 JSON，或让 Agent 用 workflow save 导入', 'bad');
      onOpenSettings?.();
      return;
    }
    setBusyGen(true);
    try {
      const res = await apiPost(`/api/projects/${projectId}/pages/${page.id}/render`, {});
      setGen({ status: 'running', progress: 0, id: res.jobId });
    } catch (err) {
      setBusyGen(false);
      toast(err.message, 'bad');
    }
  }

  async function addPage() {
    try {
      const doc = await apiPost(`/api/projects/${projectId}/pages`, {});
      refreshPages();
      go(`/p/${projectId}/p/${doc.id}`);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function removePage() {
    if (!page) return;
    if (!confirm(`删除第 ${page.index} 页？这一页的历史图会一起删掉。`)) return;
    try {
      await apiDelete(`/api/projects/${projectId}/pages/${page.id}`);
      const rest = pages.filter((p) => p.id !== page.id);
      setPages(rest);
      go(rest.length ? `/p/${projectId}/p/${rest[0].id}` : `/p/${projectId}`);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function loadChanges() {
    try {
      setChanges(await api('/api/changes'));
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function confirmChanges() {
    try {
      await apiPost('/api/ack', {});
      toast('已确认');
      loadChanges();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function pickVersion(id) {
    setCurrent(id);
    try {
      await apiPost(`/api/projects/${projectId}/versions/current`, { id, pageId: page.id });
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function collectExportItems() {
    const items = [];
    for (const p of pages) {
      const data = await api(`/api/projects/${projectId}/pages/${p.id}`);
      const list = (data.versions || []).filter((v) => v.page === p.id);
      const picked = list.find((v) => v.id === data.current) || list.slice(-1)[0];
      if (picked) items.push({ image: picked.image, index: p.index, title: p.title });
    }
    return items;
  }

  async function doExport(kind) {
    setExporting(kind);
    try {
      const items = await collectExportItems();
      if (kind === 'long') await exportLongImage(items, project?.name || 'chapter');
      else await exportPdf(items, project?.name || 'chapter');
      setShowExport(false);
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setExporting('');
    }
  }

  if (!page) return html`<div class="page-scroll"><div class="container">载入中…</div></div>`;

  const warnings = compiled?.warnings || [];
  const errors = warnings.filter((w) => w.level === 'error');
  const warns = warnings.filter((w) => w.level === 'warn');
  const selectedIds = idsOfSelection();
  const multi = selectedIds.length > 1;
  const selected = selection ? page.items.find((it) => it.id === selection.id) : null;
  const version = versions.find((v) => v.id === current) || versions.slice(-1)[0];
  const image = version?.image || '';
  const generating = busyGen || Boolean(gen && (gen.status === 'queued' || gen.status === 'running'));
  const scale = fitScale * zoom;

  function addItem(type) {
    const def = itemType(type);
    const patch = {};
    for (const f of def?.fields || []) {
      if (f.default !== undefined) patch[f.key] = f.default;
      else if (f.type === 'tags' || f.type === 'palette') patch[f.key] = [];
    }
    const bbox = type === 'bubble' ? [400, 140, 680, 320] : type === 'native' ? [40, 40, 400, 160] : [40, 420, 728, 780];
    const item = createItem(type, { bbox, ...(type === 'bubble' ? { text: '新台词' } : {}), ...patch });
    mutate((cur) => ({ ...cur, items: [...cur.items, item] }));
    select({ kind: item.type, id: item.id });
    setTimeout(saveNow, 60);
  }

  function removeItems(ids) {
    const drop = new Set(ids);
    if (!drop.size) return;
    mutate((cur) => ({ ...cur, items: cur.items.filter((it) => !drop.has(it.id)) }));
    setSelection(null);
    setTimeout(saveNow, 60);
  }

  function removeItem(id) {
    removeItems([id]);
  }

  function patchItem(id, patch) {
    mutate((cur) => ({ ...cur, items: cur.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  }

  return html`<div class="editor">
    <aside class="rail">
      <div class="rail-head">PAGES<div class="spacer"></div>${pages.length}</div>
      <div class="rail-list">
        ${pages.map(
          (p) => html`<div class=${cls('pg', p.id === page.id && 'on')} key=${p.id} onClick=${() => go(`/p/${projectId}/p/${p.id}`)}>
            <span class="n">${String(p.index).padStart(2, '0')}</span>
            <div class="thumb">
              ${p.cover ? html`<img src=${p.cover} alt="" loading="lazy" />` : html`<span class="ghost">${p.items}项</span>`}
            </div>
          </div>`
        )}
      </div>
      <div class="rail-foot">
        <button class="btn sm grow" onClick=${addPage}>＋ 新页</button>
        <button class="btn sm ghost" onClick=${removePage}>删</button>
      </div>
    </aside>

    <section class="work">
      <div class="work-head">
        <input
          class="input"
          style="width:160px;border-color:var(--line);padding:2px 6px;font-size:12px"
          value=${page.title || ''}
          placeholder=${`第 ${page.index} 页`}
          onInput=${(e) => mutate({ title: e.currentTarget.value })}
        />
        <span class="meta">${page.size[0]}×${page.size[1]} · ${page.items.length} 项 · rev ${page.rev}</span>
        ${errors.length
          ? html`<span class="tag" style="background:#000;color:#fff">${errors.length} 个错误</span>`
          : warns.length
            ? html`<span class="tag">${warns.length} 个提醒</span>`
            : null}
        <div class="spacer"></div>
        ${image
          ? html`<label class="meta" style="display:flex;align-items:center;gap:5px">
              图
              <input type="range" min="0" max="1" step="0.05" value=${opacity} style="width:70px" onInput=${(e) => setOpacity(Number(e.currentTarget.value))} />
            </label>`
          : null}
        <label class="meta" style="display:flex;align-items:center;gap:4px">网格
          <select class="select" style="width:56px;padding:1px 14px 1px 4px;font-size:11px" value=${grid} onChange=${(e) => setGrid(Number(e.currentTarget.value))}>
            ${[1, 2, 4, 8, 16].map((n) => html`<option value=${n}>${n}px</option>`)}
          </select>
        </label>
        <button class=${cls('btn ghost', !showBoxes && 'inv')} onClick=${() => setShowBoxes((v) => !v)}>${showBoxes ? '隐藏框' : '显示框'}</button>
        <button class="btn ghost" onClick=${undo} title="Ctrl+Z">撤销</button>
        <button class="btn ghost" onClick=${() => setShowExport(true)}>导出</button>
        <button class="btn inv" disabled=${errors.length > 0 || generating} onClick=${generate}>
          ${generating ? `生成中 ${gen?.progress || 0}%` : '生成'}
        </button>
      </div>

      <div
        class="stage"
        ref=${stageRef}
        onWheel=${(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setZoom((z) => Math.min(3, Math.max(0.5, Number((z - Math.sign(e.deltaY) * 0.1).toFixed(2)))));
        }}
        onPointerDown=${(e) => {
          if (e.target !== e.currentTarget) return;
          const el = e.currentTarget;
          const start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
          const move = (ev) => {
            el.scrollLeft = start.left - (ev.clientX - start.x);
            el.scrollTop = start.top - (ev.clientY - start.y);
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      >
        <${Canvas}
          page=${page}
          image=${image}
          imageOpacity=${opacity}
          showBoxes=${showBoxes}
          grid=${grid}
          scale=${scale}
          selection=${selection}
          onSelect=${select}
          onBegin=${snapshot}
          onChange=${updateBbox}
          onCommit=${saveNow}
        />
      </div>

      <div class="canvas-ctrl bottom" style=${`bottom:${dockCollapsed ? 46 : 284}px`}>
        ${ITEM_TYPES.map(
          (t) => html`<button class="btn" onClick=${() => addItem(t.key)}>
            <svg class="plus" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M5 1v8M1 5h8" /></svg>
            ${t.label}
          </button>`
        )}
      </div>
      <div class="canvas-ctrl top">
        <input type="range" min="0.5" max="3" step="0.05" value=${zoom} title="缩放" style="width:90px" onInput=${(e) => setZoom(Number(e.currentTarget.value))} />
        <button class="icon-btn" title="适应画布" onClick=${() => setZoom(1)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
          </svg>
        </button>
        <button class=${cls('icon-btn', !showBoxes && 'on')} title="显示 / 隐藏框" onClick=${() => setShowBoxes((v) => !v)}>${showBoxes ? '▣' : '□'}</button>
      </div>

      <div class=${cls('dock', dockCollapsed && 'collapsed')}>
        <div class="dock-head">
          <div class=${cls('tab', tab === 'prompt' && 'on')} onClick=${() => setTab('prompt')}>
            提示词${errors.length
              ? html`<span class="badge">${errors.length}</span>`
              : warns.length
                ? html`<span class="badge warn">${warns.length}</span>`
                : null}
          </div>
          <div class=${cls('tab', tab === 'history' && 'on')} onClick=${() => setTab('history')}>
            历史<span class="badge warn">${versions.length}</span>
          </div>
          <div class=${cls('tab', tab === 'changes' && 'on')} onClick=${() => { setTab('changes'); loadChanges(); }}>变更</div>
          <div class="spacer"></div>
          <button class="btn sm ghost" onClick=${() => setDockCollapsed((v) => !v)}>${dockCollapsed ? '展开' : '收起'}</button>
          <div class="spacer"></div>
          <span class="meta">${version ? `${version.id} · seed ${version.seed}` : '还没有生成过'}</span>
        </div>
        <div class="dock-body">
          ${tab === 'prompt'
            ? html`<${PromptPanel} compiled=${compiled} warnings=${warnings} />`
            : tab === 'history'
              ? html`<${HistoryPanel} versions=${versions} current=${current} onPick=${pickVersion} />`
              : html`<${ChangesPanel} changes=${changes} onReload=${loadChanges} onAck=${confirmChanges} />`}
        </div>
      </div>
    </section>

    <aside class="inspect">
      <div class="inspect-head">${multi ? `已选 ${selectedIds.length} 项` : selected ? `${TYPE_NAME[selected.type]}属性` : '页面属性'}</div>
      <div class="inspect-body">${multi
        ? html`<div class="col">
            <div class="hint">多选：可以直接在画布上整体拖动，右侧不提供逐项编辑。Shift + 点击可加减选。</div>
            <div class="col" style="gap:3px">
              ${selectedIds.map((id) => {
                const it = page.items.find((one) => one.id === id);
                if (!it) return null;
                return html`<div class="rowitem" onClick=${() => select({ kind: it.type, id })}>
                  <span class="mono small">${itemType(it.type)?.label || it.type}</span>
                  <span class="grow ellipsis">${(it.text || it.caption || '（空）').slice(0, 40)}</span>
                </div>`;
              })}
            </div>
            <div class="row">
              <button class="btn sm ghost grow" onClick=${() => setSelection(null)}>取消选择</button>
              <button class="btn sm ghost" onClick=${() => removeItems(selectedIds)}>删除</button>
            </div>
          </div>`
        : selected
          ? html`<${ItemForm}
              item=${selected}
              patchItem=${patchItem}
              removeItem=${removeItem}
              onBack=${() => setSelection(null)}
              onCopy=${copySelected}
            />`
          : html`<${PagePanel} page=${page} mutate=${mutate} setSelection=${select} />`}</div>
    </aside>

    ${showExport
      ? html`<div class="modal-mask" onClick=${(e) => e.target === e.currentTarget && setShowExport(false)}>
          <div class="modal">
            <header>导出</header>
            <div class="body">
              <div class="hint">每页取当前采用的版本，按页码排序；没有图的页会被跳过。</div>
              <button class="btn wide" disabled=${exporting === 'long'} onClick=${() => doExport('long')}>
                ${exporting === 'long' ? '拼接中…' : '单张长图（PNG）'}
              </button>
              <button class="btn wide" disabled=${exporting === 'pdf'} onClick=${() => doExport('pdf')}>
                ${exporting === 'pdf' ? '生成中…' : 'PDF（每页一张）'}
              </button>
            </div>
            <footer><button class="btn ghost" onClick=${() => setShowExport(false)}>关闭</button></footer>
          </div>
        </div>`
      : null}
  </div>`;

  // ---------------------------------------------------------------- 页面属性

  // ---------------------------------------------------------------- 工作台

}