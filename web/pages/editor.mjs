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
  formatTime,
  BUBBLE_LABELS,
  CAMERA_LABELS,
  SHAPE_LABELS,
  FRAME_LABELS,
} from '../lib.mjs';
import Canvas from '../components/canvas.mjs';
import { exportLongImage, exportPdf } from '../components/export.mjs';
import { compilePage } from '../../core/compile.mjs';
import { compileContext } from '../../core/bible.mjs';
import { createPanelItem, createBubbleItem } from '../../core/manga-doc.mjs';

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
  const [scale, setScale] = useState(0.55);
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
      setScale(Math.max(0.16, Math.min(w / page.size[0], h / page.size[1])));
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
        if (selection) {
          e.preventDefault();
          removeItem(selection.id);
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

  /** 拖拽过程中只更新视图，不进历史 */
  function updateBbox(id, bbox) {
    const cur = pageRef.current;
    if (!cur) return;
    const next = { ...cur, items: cur.items.map((it) => (it.id === id ? { ...it, bbox } : it)) };
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
    const item = cur?.items.find((it) => it.id === selection?.id);
    if (!item) return;
    clipboard.current = JSON.parse(JSON.stringify(item));
    toast(`已复制${TYPE_NAME[item.type] || '项'}`);
  }

  function paste() {
    const src = clipboard.current;
    if (!src) return;
    const patch = {
      ...src,
      id: undefined,
      bbox: [src.bbox[0] + 24, src.bbox[1] + 24, src.bbox[2] + 24, src.bbox[3] + 24],
    };
    const created = src.type === 'bubble' ? createBubbleItem(patch) : src.type === 'native' ? patch : createPanelItem(patch);
    mutate((cur) => ({ ...cur, items: [...cur.items, created] }));
    setSelection({ kind: created.type, id: created.id });
    setTimeout(saveNow, 60);
  }

  function scheduleSave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, 600);
  }

  async function saveNow() {
    const cur = pageRef.current;
    if (!cur) return;
    try {
      const saved = await apiPut(`/api/projects/${projectId}/pages/${cur.id}`, cur);
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
  const selected = selection ? page.items.find((it) => it.id === selection.id) : null;
  const version = versions.find((v) => v.id === current) || versions.slice(-1)[0];
  const image = version?.image || '';
  const generating = busyGen || Boolean(gen && (gen.status === 'queued' || gen.status === 'running'));

  function addItem(type) {
    const item =
      type === 'bubble'
        ? createBubbleItem({ bbox: [420, 120, 700, 320], text: '新台词' })
        : createPanelItem({ bbox: [40, 420, 728, 780], caption: '' });
    mutate((cur) => ({ ...cur, items: [...cur.items, item] }));
    setSelection({ kind: item.type, id: item.id });
    setTimeout(saveNow, 60);
  }

  function removeItem(id) {
    mutate((cur) => ({ ...cur, items: cur.items.filter((it) => it.id !== id) }));
    setSelection(null);
    setTimeout(saveNow, 60);
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
        <button class="btn ghost" onClick=${undo} title="Ctrl+Z">撤销</button>
        <button class="btn ghost" onClick=${() => setShowExport(true)}>导出</button>
        <button class="btn inv" disabled=${errors.length > 0 || generating} onClick=${generate}>
          ${generating ? `生成中 ${gen?.progress || 0}%` : '生成'}
        </button>
      </div>

      <div class="stage" ref=${stageRef}>
        <${Canvas}
          page=${page}
          image=${image}
          imageOpacity=${opacity}
          scale=${scale}
          selection=${selection}
          onSelect=${setSelection}
          onBegin=${snapshot}
          onChange=${updateBbox}
          onCommit=${saveNow}
        />
      </div>

      <div class="dock">
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
          <span class="meta">${version ? `${version.id} · seed ${version.seed}` : '还没有生成过'}</span>
        </div>
        <div class="dock-body">
          ${tab === 'prompt' ? renderPrompt() : tab === 'history' ? renderHistory() : renderChanges()}
        </div>
      </div>
    </section>

    <aside class="inspect">
      <div class="inspect-head">${selected ? `${TYPE_NAME[selected.type]}属性` : '页面属性'}</div>
      <div class="inspect-body">${selected ? itemForm(selected) : pageForm()}</div>
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

  function pageForm() {
    return html`<div class="col">
      <div class="row2">
        <div class="field">
          <label>阅读顺序</label>
          <select class="select" value=${page.reading} onChange=${(e) => mutate({ reading: e.currentTarget.value })}>
            <option value="rtl">右 → 左</option>
            <option value="ltr">左 → 右</option>
          </select>
        </div>
        <div class="field">
          <label>画风</label>
          <select class="select" value=${page.style} onChange=${(e) => mutate({ style: e.currentTarget.value })}>
            ${STYLE_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
          </select>
        </div>
      </div>

      <div class="field">
        <label>文字排版（全局）</label>
        <div class="row">
          <button
            class=${cls('chip', page.vertical !== false ? 'on' : 'ghost')}
            onClick=${() =>
              mutate((cur) => ({
                ...cur,
                vertical: true,
                items: cur.items.map((it) => (it.type === 'bubble' ? { ...it, vertical: undefined } : it)),
              }))}
          >全部竖排</button>
          <button
            class=${cls('chip', page.vertical === false ? 'on' : 'ghost')}
            onClick=${() =>
              mutate((cur) => ({
                ...cur,
                vertical: false,
                items: cur.items.map((it) => (it.type === 'bubble' ? { ...it, vertical: undefined } : it)),
              }))}
          >全部横排</button>
        </div>
        <span class="hint">单条文字可以在它的属性里单独覆盖。</span>
      </div>

      <div class="field">
        <label>场景（写进 SETTING）</label>
        <textarea class="textarea" style="min-height:48px" value=${page.scene || ''} onInput=${(e) => mutate({ scene: e.currentTarget.value })}></textarea>
      </div>
      <div class="field">
        <label>补充说明</label>
        <textarea class="textarea" style="min-height:48px" value=${page.note || ''} onInput=${(e) => mutate({ note: e.currentTarget.value })}></textarea>
      </div>

      <div class="divider"></div>
      <div class="row wrap">
        <button class="chip" onClick=${() => addItem('panel')}>＋ 分格</button>
        <button class="chip" onClick=${() => addItem('bubble')}>＋ 文字</button>
      </div>

      <div class="divider"></div>
      <span class="label">本页内容（点选编辑）</span>
      <div class="col" style="gap:3px">
        ${page.items.length
          ? page.items.map(
              (it, i) => html`<div class="rowitem" onClick=${() => setSelection({ kind: it.type, id: it.id })}>
                <span class="mono small">${TYPE_NAME[it.type]}${it.type === 'panel' ? i + 1 : ''}</span>
                <span class="grow ellipsis">${(it.type === 'bubble' ? it.text : it.caption) || '（空）'}</span>
              </div>`
            )
          : html`<span class="hint">还没有内容，点上面的按钮加一个框。</span>`}
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- item 属性

  function itemForm(item) {
    const bboxInputs = html`<div class="field">
      <label>坐标 x1 / y1 / x2 / y2</label>
      <div class="row">
        ${item.bbox.map(
          (v, i) => html`<input
            class="input"
            type="number"
            style="width:25%"
            value=${Math.round(v)}
            onInput=${(e) => {
              const bbox = [...item.bbox];
              bbox[i] = Number(e.currentTarget.value);
              patchItem(item.id, { bbox });
            }}
          />`
        )}
      </div>
    </div>`;

    const header = html`<div class="row">
      <button class="btn sm ghost" onClick=${() => setSelection(null)}>← 返回</button>
      <div class="spacer"></div>
      <button class="btn sm ghost" onClick=${copySelected}>复制</button>
      <button class="btn sm ghost" onClick=${() => removeItem(item.id)}>删除</button>
    </div>`;

    if (item.type === 'bubble') {
      return html`<div class="col">
        ${header}
        <div class="field">
          <label>文字</label>
          <textarea class="textarea" style="min-height:90px" value=${item.text || ''} onInput=${(e) => patchItem(item.id, { text: e.currentTarget.value })}></textarea>
        </div>
        <div class="row2">
          <div class="field">
            <label>类型</label>
            <select class="select" value=${item.kind} onChange=${(e) => patchItem(item.id, { kind: e.currentTarget.value })}>
              ${BUBBLE_LABELS.map((b) => html`<option value=${b.key}>${b.name}</option>`)}
            </select>
          </div>
          <div class="field">
            <label>字号</label>
            <input class="input" type="number" value=${item.size} onInput=${(e) => patchItem(item.id, { size: Number(e.currentTarget.value) || 22 })} />
          </div>
        </div>
        <div class="row2">
          <div class="field">
            <label>排版</label>
            <select
              class="select"
              value=${item.vertical === undefined ? 'auto' : item.vertical ? 'v' : 'h'}
              onChange=${(e) => {
                const v = e.currentTarget.value;
                patchItem(item.id, { vertical: v === 'auto' ? undefined : v === 'v' });
              }}
            >
              <option value="auto">跟随全局</option>
              <option value="v">竖排</option>
              <option value="h">横排</option>
            </select>
          </div>
          <div class="field">
            <label>尾巴</label>
            <select class="select" value=${item.tail} onChange=${(e) => patchItem(item.id, { tail: e.currentTarget.value })}>
              <option value="none">无（说话者不在画面）</option>
              ${['down-left', 'down', 'down-right', 'left', 'right', 'up-left', 'up', 'up-right'].map((d) => html`<option value=${d}>${d}</option>`)}
            </select>
          </div>
        </div>
        ${bboxInputs}
      </div>`;
    }

    if (item.type === 'native') {
      return html`<div class="col">
        ${header}
        <div class="field">
          <label>label（原生 Moss 字段）</label>
          <select class="select" value=${item.label} onChange=${(e) => patchItem(item.id, { label: e.currentTarget.value })}>
            ${['object', 'text', 'character'].map((l) => html`<option value=${l}>${l}</option>`)}
          </select>
        </div>
        <div class="field">
          <label>caption</label>
          <textarea class="textarea" style="min-height:80px" value=${item.caption || ''} onInput=${(e) => patchItem(item.id, { caption: e.currentTarget.value })}></textarea>
        </div>
        ${item.label === 'text'
          ? html`<div class="field">
              <label>text（要渲染的字）</label>
              <textarea class="textarea" style="min-height:60px" value=${item.text || ''} onInput=${(e) => patchItem(item.id, { text: e.currentTarget.value })}></textarea>
            </div>`
          : null}
        ${bboxInputs}
      </div>`;
    }

    return html`<div class="col">
      ${header}
      <div class="field">
        <label>这一格画什么</label>
        <textarea class="textarea" style="min-height:110px" value=${item.caption || ''} onInput=${(e) => patchItem(item.id, { caption: e.currentTarget.value })}></textarea>
      </div>
      <div class="row2">
        <div class="field">
          <label>机位</label>
          <select class="select" value=${item.camera} onChange=${(e) => patchItem(item.id, { camera: e.currentTarget.value })}>
            ${CAMERA_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
          </select>
        </div>
        <div class="field">
          <label>形状</label>
          <select class="select" value=${item.shape} onChange=${(e) => patchItem(item.id, { shape: e.currentTarget.value })}>
            ${SHAPE_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
          </select>
        </div>
      </div>
      <div class="field">
        <label>边框</label>
        <select class="select" value=${item.frame} onChange=${(e) => patchItem(item.id, { frame: e.currentTarget.value })}>
          ${FRAME_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
        </select>
      </div>
      ${bboxInputs}
    </div>`;
  }

  // ---------------------------------------------------------------- 工作台

  function renderPrompt() {
    return html`<div class="row" style="align-items:flex-start;gap:16px">
      <div class="grow col" style="min-width:0;flex:1.2">
        <div class="row">
          <span class="mono small muted">${compiled?.stats?.items || 0} 项 · ${compiled?.stats?.bytes || 0} 字节</span>
          <div class="spacer"></div>
          <button class="btn sm ghost" onClick=${() => {
            navigator.clipboard?.writeText(compiled?.json || '');
            toast('已复制');
          }}>复制 JSON</button>
        </div>
        <div class="prompt-box">${compiled?.json || '（编译失败）'}</div>
      </div>
      <div class="col" style="width:42%;min-width:0">
        <span class="mono small muted">校验</span>
        ${warnings.length
          ? html`<ul class="warn-list">
              ${warnings.map(
                (w) => html`<li class=${w.level}>
                  <span class="code">${w.code}</span>
                  <span>${w.message}</span>
                </li>`
              )}
            </ul>`
          : html`<span class="hint">没有发现问题。</span>`}
      </div>
    </div>`;
  }

  function renderHistory() {
    const list = [...versions].reverse();
    if (!list.length) return html`<div class="hint">这一页还没有生成过图片。点右上角「生成」。</div>`;
    return html`<div class="col" style="gap:10px">
      <div class="history-strip">
        ${list.map(
          (v) => html`<div class=${cls('version', v.id === (current || list[0]?.id) && 'on')} key=${v.id} onClick=${() => pickVersion(v.id)}>
            <img src=${v.image} alt="" loading="lazy" />
            <div class="vmeta"><b>${v.seed}</b>${formatTime(v.at).slice(5)}</div>
          </div>`
        )}
      </div>
      <span class="hint">点缩略图切换当前采用版；历史只读，不会改布局。</span>
    </div>`;
  }

  function renderChanges() {
    if (!changes) return html`<div class="hint">读取中…</div>`;
    if (!changes.pages.length) return html`<div class="hint">自 rev ${changes.since} 以来没有改动（当前 rev ${changes.to}）。</div>`;
    return html`<div class="col" style="gap:8px">
      <div class="row">
        <span class="mono small muted">rev ${changes.since} → ${changes.to}</span>
        <div class="spacer"></div>
        <button class="btn sm" onClick=${confirmChanges}>确认已查看</button>
      </div>
      ${changes.pages.map(
        (group) => html`<div class="col" style="gap:2px">
          <span class="mono small">第 ${group.index ?? '?'} 页 · ${group.title || group.page}</span>
          ${group.ops.map((op) => html`<div class="small" style="border-left:2px solid var(--line);padding-left:8px">${describe(op)}</div>`)}
        </div>`
      )}
    </div>`;
  }
}

function describe(op) {
  if (op.op === 'create') return '新建页面';
  if (op.op === 'add') return `+ ${op.target} ${op.id} [${(op.bbox || []).join(',')}]${op.text ? `「${op.text}」` : ''}`;
  if (op.op === 'remove') return `- ${op.target} ${op.id}`;
  if (op.op === 'bbox') return `~ ${op.target} ${op.id} [${op.from.join(',')}] → [${op.to.join(',')}]`;
  if (op.op === 'text') return `~ 文字 ${op.id}「${op.from}」→「${op.to}」`;
  if (op.op === 'page') return `~ 页.${op.field}：${op.from ?? '（空）'} → ${op.to ?? '（空）'}`;
  return `~ ${op.target} ${op.id} ${op.field}`;
}
