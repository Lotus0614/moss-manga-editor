// 应用根组件：顶栏 + 路由 + 全局提示。

import {
  html,
  render,
  useEffect,
  useState,
  useRoute,
  useApp,
  setApp,
  useToasts,
  api,
  go,
  toast,
} from './lib.mjs';
import ProjectsPage from './pages/projects.mjs';
import SettingsPage from './pages/settings.mjs';
import EditorPage from './pages/editor.mjs';

function Toasts() {
  const items = useToasts();
  return html`<div class="toasts">
    ${items.map((t) => html`<div class="toast ${t.kind === 'bad' ? 'bad' : ''}" key=${t.id}>${t.message}</div>`)}
  </div>`;
}

function Topbar({ route }) {
  const app = useApp();
  const project = app.project;
  const page = app.page;
  return html`<div class="topbar">
    <div class="brand" onClick=${() => go('/projects')}>MOSS MANGA</div>
    <span class="tag">EDITOR</span>
    ${route.name === 'editor' && project
      ? html`<div class="crumb">
          <b>${project.name}</b>
          ${page ? ` / 第 ${page.index} 页${page.title ? ` · ${page.title}` : ''}` : ''}
        </div>`
      : html`<div class="crumb">${route.name === 'settings' ? '设置' : '项目'}</div>`}
    <div class="spacer"></div>
    ${route.name === 'editor'
      ? html`<button class="btn ghost" onClick=${() => go('/projects')}>项目列表</button>`
      : null}
    <button class="btn" onClick=${() => go('/settings')}>设置</button>
  </div>`;
}

function App() {
  const route = useRoute();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api('/api/settings')
      .then((s) => {
        setSettings(s);
        setApp({ settings: s });
        if (!s.ready && !s.onboarded && route.name !== 'settings') go('/settings');
      })
      .catch((err) => toast(err.message, 'bad'));
    // 只跑一次：引导跳转不需要跟着设置变化反复触发
  }, []);

  useEffect(() => {
    if (route.name !== 'editor') setApp({ project: null, page: null });
  }, [route.name]);

  let body;
  if (route.name === 'settings') {
    body = html`<${SettingsPage}
      settings=${settings}
      onSaved=${(s) => {
        setSettings(s);
        setApp({ settings: s });
      }}
    />`;
  } else if (route.name === 'editor' && route.params.projectId) {
    body = html`<${EditorPage} projectId=${route.params.projectId} pageId=${route.params.pageId} settings=${settings} />`;
  } else {
    body = html`<${ProjectsPage} settings=${settings} />`;
  }

  return html`<div>
    <${Topbar} route=${route} />
    ${body}
    <${Toasts} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
