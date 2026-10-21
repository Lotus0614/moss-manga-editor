#!/usr/bin/env node
// 启动入口：静态资源 + API 都在同一个 node:http 服务上，单进程、零依赖。
//   node server.mjs            → http://127.0.0.1:5123
//   PORT=8080 node server.mjs

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { match, makeStatic, fail } from './server/http.mjs';
import { ensureDirs, getSettings, DATA_ROOT } from './server/store.mjs';
import { routes as settingsRoutes } from './server/routes/settings.mjs';
import { routes as projectRoutes } from './server/routes/projects.mjs';
import { routes as generateRoutes } from './server/routes/generate.mjs';
import { routes as fileRoutes } from './server/routes/files.mjs';
import { routes as agentRoutes } from './server/routes/agent.mjs';

const PORT = Number(process.env.PORT || 5123);
const HOST = process.env.HOST || '127.0.0.1';
const WEB_DIR = resolve(process.env.MOSS_WEB || join(process.cwd(), 'web'));
const serveStatic = makeStatic(WEB_DIR);

const routes = [...settingsRoutes, ...projectRoutes, ...generateRoutes, ...fileRoutes, ...agentRoutes];

const IMPORTMAP_CDN = `<script type="importmap">
{
  "imports": {
    "preact": "https://esm.sh/preact@10.25.4",
    "preact/hooks": "https://esm.sh/preact@10.25.4/hooks",
    "preact/jsx-runtime": "https://esm.sh/preact@10.25.4/jsx-runtime",
    "htm": "https://esm.sh/htm@3.1.1"
  }
}
</script>`;

const IMPORTMAP_LOCAL = `<script type="importmap">
{
  "imports": {
    "preact": "/vendor/preact.mjs",
    "preact/hooks": "/vendor/preact-hooks.mjs",
    "htm": "/vendor/htm.mjs"
  }
}
</script>`;

async function sendIndex(res) {
  const file = join(WEB_DIR, 'index.html');
  let html = await readFile(file, 'utf8');
  const vendored = existsSync(join(WEB_DIR, 'vendor', 'preact.mjs'));
  html = html.replace('<!--IMPORTMAP-->', vendored ? IMPORTMAP_LOCAL : IMPORTMAP_CDN);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  res.end(html);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      await sendIndex(res);
      return;
    }

    const hit = match(routes, req.method, pathname);
    if (hit) {
      await hit.handler({ req, res, params: hit.params, url });
      return;
    }

    if (req.method === 'GET' && (await serveStatic(req, res, pathname))) return;

    fail(res, 404, `未找到 ${req.method} ${pathname}`);
  } catch (err) {
    if (res.headersSent) {
      try {
        res.end();
      } catch {
        /* 已断开 */
      }
      console.error('[error]', err);
      return;
    }
    const status = err.status || 500;
    if (status >= 500) console.error('[error]', err);
    fail(res, status, err.message || '服务器内部错误');
  }
});

server.listen(PORT, HOST, async () => {
  await ensureDirs();
  const settings = await getSettings();
  const base = `http://${HOST}:${PORT}`;
  console.log('');
  console.log('  MOSS 漫画编辑器');
  console.log(`  ${base}`);
  console.log(`  数据目录 ${DATA_ROOT}`);
  console.log(`  ComfyUI  ${settings.comfy.url || '未配置'}`);
  console.log(`  大模型   ${settings.llm.baseUrl ? `${settings.llm.model || '未填模型'} @ ${settings.llm.baseUrl}` : '未配置'}`);
  if (!settings.ready) console.log('  ⚠ 还没有配置完，打开页面会先引导你去设置');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，换一个：PORT=5124 node server.mjs`);
    process.exit(1);
  }
  throw err;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
