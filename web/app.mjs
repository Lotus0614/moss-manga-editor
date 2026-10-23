// 应用根组件：顶栏 + 路由 + 设置弹窗 + 全局提示。

import { html, render, useEffect, useState, useRoute, useApp, setApp, useToasts, api, go, toast } from './lib.mjs';
import { registerConfig, configProblems } from '../core/config-store.mjs';
import mangaConfig from '../config/manga.mjs';
import ProjectsPage from './pages/projects.mjs';
import EditorPage from './pages/editor.mjs';
import SettingsModal from './components/settings-modal.mjs';
import ProjectSettings from './components/project-settings.mjs';

// 方言注册一次，之后各组件只从 config-store 取
const store = registerConfig(mangaConfig);
if (store.problems.length) console.error('[配置]', store.problems);

function Toasts() {
  const items = useToasts();
  return html`<div class="toasts">
    ${items.map((t) => html`<div class="toast ${t.kind === 'bad' ? 'bad' : ''}" key=${t.id}>${t.message}</div>`)}
  </div>`;
}

function Topbar({ route, onOpenSettings, onOpenProjectSettings }) {
  const app = useApp();
  const project = app.project;
  const page = app.page;
  return html`<div class="topbar">
    <div class="brand" onClick=${() => go('/projects')}>MOSS MANGA</div>
    <span class="tag">PREVIEW</span>
    ${route.name === 'editor' && project
      ? html`<div class="crumb"><b>${project.name}</b>${page ? ` / 第 ${page.index} 页${page.title ? ` · ${page.title}` : ''}` : ''}</div>`
      : html`<div class="crumb">项目</div>`}
    <div class="spacer"></div>
    ${route.name === 'editor' ? html`<button class="btn ghost" onClick=${() => go('/projects')}>项目列表</button>` : null}
    ${route.name === 'editor' ? html`<button class="btn ghost" onClick=${onOpenProjectSettings}>项目设置</button>` : null}
    <button class="btn" onClick=${onOpenSettings}>设置</button>
  </div>`;
}

function App() {
  const route = useRoute();
  const [config, setConfig] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);

  useEffect(() => {
    Promise.all([api('/api/config'), api('/api/health')])
      .then(([cfg, health]) => {
        setConfig({ ...cfg, archive: health.archive });
        setApp({ settings: cfg });
      })
      .catch((err) => toast(err.message, 'bad'));
  }, []);

  useEffect(() => {
    if (route.name !== 'editor') setApp({ project: null, page: null });
  }, [route.name]);

  const applyConfig = (next) => {
    setConfig((prev) => ({ ...prev, ...next }));
    setApp({ settings: next });
  };

  let body;
  if (route.name === 'editor' && route.params.projectId) {
    body = html`<${EditorPage}
      projectId=${route.params.projectId}
      pageId=${route.params.pageId}
      config=${config}
      onOpenSettings=${() => setSettingsOpen(true)}
    />`;
  } else {
    body = html`<${ProjectsPage} />`;
  }

  return html`<div>
    <${Topbar} route=${route} onOpenSettings=${() => setSettingsOpen(true)} onOpenProjectSettings=${() => setProjectSettingsOpen(true)} />
    ${body}
    <${ProjectSettings}
      slug=${route.params.projectId}
      open=${projectSettingsOpen}
      onClose=${() => setProjectSettingsOpen(false)}
      onSaved=${(p) => setApp({ project: p })}
      onOpenGlobal=${() => { setProjectSettingsOpen(false); setSettingsOpen(true); }}
    />
    <${SettingsModal} open=${settingsOpen} config=${config} onClose=${() => setSettingsOpen(false)} onSaved=${applyConfig} />
    <${Toasts} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
