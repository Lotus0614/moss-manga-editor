// 编辑页：左页序 / 中画布 + 底部工作台 / 右 Agent。
// 页面文档在这里是唯一可编辑真源，编译预览是它的纯函数产物。

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
  PRESET_LABELS,
} from '../lib.mjs';
import Canvas from '../components/canvas.mjs';
import Chat from '../components/chat.mjs';
import { exportLongImage, exportPdf } from '../components/export.mjs';
import { compilePage } from '../../core/compile.mjs';
import { compileContext } from '../../core/bible.mjs';
import { applyPreset, seedPage } from '../../core/presets.mjs';
import { createPanel, createBubble } from '../../core/manga-doc.mjs';

const STYLE_LABELS = [
  ['mono', '黑白网点'],
  ['color', '彩色'],
  ['sketch', '线稿'],
];

export default function EditorPage({ projectId, pageId }) {
  const [project, setProject] = useState(null);
  const [pages, setPages] = useState([]);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [page, setPage] = useState(null);
  const [selection, setSelection] = useState(null);
  const [tab, setTab] = useState('props');
  const [gen, setGen] = useState(null);
  const [scale, setScale] = useState(0.55);
  const [exporting, setExporting] = useState('');
  const [showExport, setShowExport] = useState(false);

  const stageRef = useRef(null);
  const pageRef = useRef(null);
  const saveTimer = useRef(null);
  const createdFirst = useRef(false);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // ---- 加载项目与页面列表
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

  // ---- 加载当前页
  useEffect(() => {
    if (!pageId) return;
    let alive = true;
    api(`/api/projects/${projectId}/pages/${pageId}`)
      .then((doc) => {
        if (!alive) return;
        setPage(doc);
        setApp({ page: doc });
        setSelection(null);
      })
      .catch((err) => toast(err.message, 'bad'));
    return () => {
      alive = false;
    };
  }, [projectId, pageId]);

  // ---- 没有页面时自动建一页（必须等页面列表真的加载完，否则会反复建页）
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

  // ---- 画布自适应缩放
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !page) return;
    const fit = () => {
      const w = el.clientWidth - 44;
      const h = el.clientHeight - 44;
      setScale(Math.max(0.18, Math.min(w / page.size.width, h / page.size.height)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page?.size.width, page?.size.height, page]);

  // ---- 生成任务进度
  useEffect(() => {
    const es = new EventSource('/api/jobs/stream');
    es.addEventListener('job', (event) => {
      let job;
      try {
        job = JSON.parse(event.data);
      } catch {
        return;
      }
      const current = pageRef.current;
      if (!current || job.pageId !== current.id) return;
      setGen(job);
      if (job.status === 'done') {
        toast('生成完成');
        api(`/api/projects/${projectId}/pages/${current.id}`).then((doc) => {
          setPage(doc);
          setApp({ page: doc });
        });
        refreshPages();
      } else if (job.status === 'error') {
        toast(job.error || '生成失败', 'bad');
      }
    });
    return () => es.close();
  }, [projectId]);

  function refreshPages() {
    api(`/api/projects/${projectId}/pages`)
      .then((data) => {
        setPages(data.pages || []);
        setPagesLoaded(true);
      })
      .catch(() => {});
  }

  function updatePage(patch) {
    setPage((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      pageRef.current = next;
      return next;
    });
    scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, 700);
  }

  async function saveNow() {
    const current = pageRef.current;
    if (!current) return;
    try {
      const saved = await apiPut(`/api/projects/${projectId}/pages/${current.id}`, current);
      pageRef.current = saved;
      setPage((prev) => (prev && prev.id === saved.id ? { ...saved, ...prev } : prev));
      refreshPages();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  function onCanvasChange(kind, id, bbox) {
    setPage((prev) => {
      if (!prev) return prev;
      const key = kind === 'panel' ? 'panels' : 'bubbles';
      const next = {
        ...prev,
        [key]: prev[key].map((item) => (item.id === id ? { ...item, bbox } : item)),
      };
      pageRef.current = next;
      return next;
    });
  }

  function onCanvasCommit() {
    saveNow();
  }

  const compiled = useMemo(() => {
    if (!page) return null;
    try {
      return compilePage(page, compileContext(project, page));
    } catch (err) {
      return { json: '', doc: null, warnings: [{ level: 'error', code: 'compile', message: err.message }], stats: {} };
    }
  }, [page, project]);

  async function generate() {
    if (!page) return;
    try {
      const res = await apiPost(`/api/projects/${projectId}/pages/${page.id}/generate`, {});
      setGen({ status: 'queued', progress: { value: 0, max: 0 }, id: res.jobId });
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function addPage(preset = 'band-3') {
    try {
      const doc = await apiPost(`/api/projects/${projectId}/pages`, { preset });
      refreshPages();
      go(`/p/${projectId}/p/${doc.id}`);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function removePage() {
    if (!page) return;
    if (!confirm(`删除第 ${page.index} 页？该页的历史图片也会一起删掉。`)) return;
    try {
      await apiDelete(`/api/projects/${projectId}/pages/${page.id}`);
      const rest = pages.filter((p) => p.id !== page.id);
      setPages(rest);
      if (rest.length) go(`/p/${projectId}/p/${rest[0].id}`);
      else go(`/p/${projectId}`);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function doExport(kind) {
    setExporting(kind);
    try {
      const docs = await Promise.all(pages.map((p) => api(`/api/projects/${projectId}/pages/${p.id}`)));
      const ordered = docs.sort((a, b) => a.index - b.index);
      if (kind === 'long') await exportLongImage(ordered, project?.name || 'chapter');
      else await exportPdf(ordered, project?.name || 'chapter');
      setShowExport(false);
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setExporting('');
    }
  }

  if (!page) {
    return html`<div class="page-scroll"><div class="container">载入中…</div></div>`;
  }

  const warnings = compiled?.warnings || [];
  const errors = warnings.filter((w) => w.level === 'error');
  const warns = warnings.filter((w) => w.level === 'warn');
  const selectedPanel = selection?.kind === 'panel' ? page.panels.find((p) => p.id === selection.id) : null;
  const selectedBubble = selection?.kind === 'bubble' ? page.bubbles.find((b) => b.id === selection.id) : null;
  const currentVersion = (page.versions || []).find((v) => v.id === page.currentVersionId) || (page.versions || []).slice(-1)[0];
  const genProgress =
    gen?.progress?.max > 0 ? Math.round((gen.progress.value / gen.progress.max) * 100) : gen?.status === 'done' ? 100 : 0;

  return html`<div class="editor">
    <!-- 页序 -->
    <aside class="rail">
      <div class="rail-head">PAGES<div class="spacer"></div>${pages.length}</div>
      <div class="rail-list">
        ${pages.map(
          (p) => html`<div
            class=${cls('pg', p.id === page.id && 'on')}
            key=${p.id}
            onClick=${() => go(`/p/${projectId}/p/${p.id}`)}
          >
            <span class="n">${String(p.index).padStart(2, '0')}</span>
            <div class="thumb">
              ${p.cover ? html`<img src=${p.cover} alt="" loading="lazy" />` : html`<span class="ghost">${p.panels}格</span>`}
            </div>
          </div>`
        )}
      </div>
      <div class="rail-foot">
        <button class="btn sm grow" onClick=${() => addPage('band-3')}>＋ 新页</button>
        <button class="btn sm ghost" title="删除本页" onClick=${removePage}>删</button>
      </div>
    </aside>

    <!-- 画布 + 工作台 -->
    <section class="work">
      <div class="work-head">
        <input
          class="input"
          style="width:180px;border-color:var(--line);padding:2px 6px;font-size:12px"
          value=${page.title || ''}
          placeholder=${`第 ${page.index} 页`}
          onInput=${(e) => updatePage({ title: e.currentTarget.value })}
        />
        <span class="meta">${page.size.width}×${page.size.height} · ${page.panels.length}格 ${page.bubbles.length}字</span>
        ${errors.length
          ? html`<span class="tag" style="background:#000;color:#fff">${errors.length} 个错误</span>`
          : warns.length
            ? html`<span class="tag">${warns.length} 个提醒</span>`
            : null}
        <div class="spacer"></div>
        ${gen && gen.status !== 'done' && gen.status !== 'error'
          ? html`<span class="meta">${gen.status === 'queued' ? '排队' : `生成 ${genProgress}%`}</span>`
          : null}
        <button class="btn ghost" onClick=${() => setShowExport(true)}>导出</button>
        <button class="btn inv" disabled=${errors.length > 0} onClick=${generate}>生成</button>
      </div>

      <div class="stage" ref=${stageRef}>
        <${Canvas}
          page=${page}
          scale=${scale}
          selection=${selection}
          onSelect=${setSelection}
          onChange=${onCanvasChange}
          onCommit=${onCanvasCommit}
        />
      </div>

      <!-- 工作台 -->
      <div class="dock">
        <div class="dock-head">
          <div class=${cls('tab', tab === 'props' && 'on')} onClick=${() => setTab('props')}>属性</div>
          <div class=${cls('tab', tab === 'prompt' && 'on')} onClick=${() => setTab('prompt')}>
            提示词
            ${errors.length ? html`<span class="badge">${errors.length}</span>` : warns.length ? html`<span class="badge warn">${warns.length}</span>` : null}
          </div>
          <div class=${cls('tab', tab === 'history' && 'on')} onClick=${() => setTab('history')}>
            历史<span class="badge warn">${(page.versions || []).length}</span>
          </div>
          <div class="spacer"></div>
          <button class="btn sm ghost" onClick=${() => setTab(tab)}>刷新</button>
        </div>

        <div class="dock-body">
          ${tab === 'props' ? renderProps() : tab === 'prompt' ? renderPrompt() : renderHistory()}
        </div>
      </div>
    </section>

    <${Chat} projectId=${projectId} pageId=${page.id} onActivity=${() => {
      api(`/api/projects/${projectId}/pages/${page.id}`).then((doc) => {
        setPage(doc);
        refreshPages();
      });
    }} />

    ${showExport
      ? html`<div class="modal-mask" onClick=${(e) => e.target === e.currentTarget && setShowExport(false)}>
          <div class="modal">
            <header>导出</header>
            <div class="body">
              <div class="hint">
                只导出已经生成过图片的页面（每页取当前采用的版本），按页码顺序排列。
                现在有 ${pages.filter((p) => p.cover).length} / ${pages.length} 页可导出。
              </div>
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

  // ---------------------------------------------------------------- 属性页签

  function renderProps() {
    return html`<div class="inspector">
      <div class="props">
        <div class="field full">
          <label>页面描述补充（会追加到 summary）</label>
          <textarea
            class="textarea"
            style="min-height:44px"
            value=${page.summary?.caption || ''}
            placeholder="这一段整体要传达什么"
            onInput=${(e) => updatePage({ summary: { ...page.summary, caption: e.currentTarget.value } })}
          ></textarea>
        </div>
        <div class="field">
          <label>阅读顺序</label>
          <select class="select" value=${page.readingOrder} onChange=${(e) => updatePage({ readingOrder: e.currentTarget.value })}>
            <option value="rtl">右 → 左</option>
            <option value="ltr">左 → 右</option>
          </select>
        </div>
        <div class="field">
          <label>画风</label>
          <select
            class="select"
            value=${page.style.preset}
            onChange=${(e) => updatePage({ style: { ...page.style, preset: e.currentTarget.value } })}
          >
            ${STYLE_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
          </select>
        </div>
        <div class="field full">
          <label>场景（写进 SETTING）</label>
          <input
            class="input"
            value=${page.scene || ''}
            placeholder="例如：a half-empty train carriage, fluorescent light"
            onInput=${(e) => updatePage({ scene: e.currentTarget.value })}
          />
        </div>
      </div>

      <div class="side">
        ${selectedPanel || selectedBubble
          ? selectedPanel
            ? panelInspector(selectedPanel)
            : bubbleInspector(selectedBubble)
          : html`<div class="col">
              <span class="hint">在画布上点一个格子或一条文字来编辑；也可以直接用下面的版式重排。</span>
              <div class="row wrap">
                ${PRESET_LABELS.map(
                  ([id, name]) =>
                    html`<button class="chip ghost" onClick=${() => {
                      updatePage((prev) => applyPreset(prev, id));
                      setTimeout(saveNow, 60);
                    }}>${name}</button>`
                )}
                <button class="chip" onClick=${() => {
                  updatePage({ panels: [...page.panels, createPanel()] });
                  setTimeout(saveNow, 60);
                }}>＋格</button>
                <button class="chip" onClick=${() => {
                  updatePage({ bubbles: [...page.bubbles, createBubble({ text: '新台词' })] });
                  setTimeout(saveNow, 60);
                }}>＋文字</button>
              </div>
            </div>`}
      </div>
    </div>`;
  }

  function panelInspector(panel) {
    return html`<div class="props">
      <div class="field full">
        <label>这一格画什么（caption）</label>
        <textarea
          class="textarea"
          style="min-height:56px"
          value=${panel.caption || ''}
          placeholder="只写画面：谁、在哪、什么动作、什么景别"
          onInput=${(e) => updatePanel(panel.id, { caption: e.currentTarget.value })}
        ></textarea>
      </div>
      <div class="field">
        <label>机位</label>
        <select class="select" value=${panel.camera} onChange=${(e) => updatePanel(panel.id, { camera: e.currentTarget.value })}>
          ${CAMERA_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
        </select>
      </div>
      <div class="field">
        <label>形状</label>
        <select class="select" value=${panel.shape} onChange=${(e) => updatePanel(panel.id, { shape: e.currentTarget.value })}>
          ${SHAPE_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
        </select>
      </div>
      <div class="field">
        <label>边框</label>
        <select class="select" value=${panel.frame} onChange=${(e) => updatePanel(panel.id, { frame: e.currentTarget.value })}>
          ${FRAME_LABELS.map(([v, n]) => html`<option value=${v}>${n}</option>`)}
        </select>
      </div>
      <div class="field">
        <label>名字</label>
        <input class="input" value=${panel.name || ''} onInput=${(e) => updatePanel(panel.id, { name: e.currentTarget.value })} />
      </div>
      <div class="field full">
        <label>坐标 x1 / y1 / x2 / y2</label>
        <div class="row">
          ${panel.bbox.map(
            (v, i) => html`<input
              class="input"
              type="number"
              style="width:25%"
              value=${Math.round(v)}
              onInput=${(e) => {
                const bbox = [...panel.bbox];
                bbox[i] = Number(e.currentTarget.value);
                updatePanel(panel.id, { bbox });
              }}
            />`
          )}
        </div>
      </div>
      <div class="row full">
        <button class="btn sm ghost" onClick=${() => removePanel(panel.id)}>删除这一格</button>
      </div>
    </div>`;
  }

  function bubbleInspector(bubble) {
    return html`<div class="props">
      <div class="field full">
        <label>文字内容</label>
        <textarea
          class="textarea"
          style="min-height:56px"
          value=${bubble.text || ''}
          onInput=${(e) => updateBubble(bubble.id, { text: e.currentTarget.value })}
        ></textarea>
      </div>
      <div class="field">
        <label>类型</label>
        <select class="select" value=${bubble.type} onChange=${(e) => updateBubble(bubble.id, { type: e.currentTarget.value })}>
          ${BUBBLE_LABELS.map((b) => html`<option value=${b.key}>${b.name}</option>`)}
        </select>
      </div>
      <div class="field">
        <label>字号</label>
        <input
          class="input"
          type="number"
          value=${bubble.fontSize}
          onInput=${(e) => updateBubble(bubble.id, { fontSize: Number(e.currentTarget.value) || 22 })}
        />
      </div>
      <div class="field">
        <label>尾巴方向</label>
        <select class="select" value=${bubble.tailDir} onChange=${(e) => updateBubble(bubble.id, { tailDir: e.currentTarget.value })}>
          ${['down-left', 'down', 'down-right', 'left', 'right', 'up-left', 'up', 'up-right'].map(
            (d) => html`<option value=${d}>${d}</option>`
          )}
        </select>
      </div>
      <div class="field">
        <label>排布</label>
        <select
          class="select"
          value=${bubble.vertical === false ? 'h' : 'v'}
          onChange=${(e) => updateBubble(bubble.id, { vertical: e.currentTarget.value === 'v' })}
        >
          <option value="v">竖排</option>
          <option value="h">横排</option>
        </select>
      </div>
      <div class="row full">
        <label class="chk">
          <input type="checkbox" checked=${!!bubble.tailOff} onChange=${(e) => updateBubble(bubble.id, { tailOff: e.currentTarget.checked })} />
          说话者不在画面里（不要尾巴）
        </label>
      </div>
      <div class="field full">
        <label>坐标 x1 / y1 / x2 / y2</label>
        <div class="row">
          ${bubble.bbox.map(
            (v, i) => html`<input
              class="input"
              type="number"
              style="width:25%"
              value=${Math.round(v)}
              onInput=${(e) => {
                const bbox = [...bubble.bbox];
                bbox[i] = Number(e.currentTarget.value);
                updateBubble(bubble.id, { bbox });
              }}
            />`
          )}
        </div>
      </div>
      <div class="row full">
        <button class="btn sm ghost" onClick=${() => removeBubble(bubble.id)}>删除这条</button>
      </div>
    </div>`;
  }

  function updatePanel(id, patch) {
    updatePage((prev) => ({ ...prev, panels: prev.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }

  function updateBubble(id, patch) {
    updatePage((prev) => ({ ...prev, bubbles: prev.bubbles.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  }

  function removePanel(id) {
    updatePage((prev) => ({ ...prev, panels: prev.panels.filter((p) => p.id !== id) }));
    setSelection(null);
    setTimeout(saveNow, 60);
  }

  function removeBubble(id) {
    updatePage((prev) => ({ ...prev, bubbles: prev.bubbles.filter((b) => b.id !== id) }));
    setSelection(null);
    setTimeout(saveNow, 60);
  }

  // ---------------------------------------------------------------- 提示词页签

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

  // ---------------------------------------------------------------- 历史页签

  function renderHistory() {
    const versions = [...(page.versions || [])].reverse();
    if (!versions.length) {
      return html`<div class="hint">这一页还没有生成过图片。点右上角「生成」试试。</div>`;
    }
    return html`<div class="col" style="gap:10px">
      <div class="history-strip">
        ${versions.map(
          (v) => html`<div
            class=${cls('version', v.id === currentVersion?.id && 'on')}
            key=${v.id}
            onClick=${() => {
              updatePage({ currentVersionId: v.id });
              setTimeout(saveNow, 60);
            }}
          >
            <img src=${v.image} alt="" loading="lazy" />
            <div class="vmeta">
              <b>${v.seed}</b>
              ${formatTime(v.at).slice(5)}
            </div>
          </div>`
        )}
      </div>
      <span class="hint">点缩略图切换当前采用版；历史版本的布局只读，不能修改。</span>
    </div>`;
  }
}
