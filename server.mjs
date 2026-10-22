#!/usr/bin/env node
import { loadTypes } from './scripts/lib/templates.mjs';
// 预览服务器：给人和 Agent 看/改漫画存档用。
//   node server.mjs                 → http://127.0.0.1:5123
//   MOSS_ARCHIVE=/path node server.mjs
//
// 不做 Agent、不做对话：改内容由用户点，或由外部 Agent 走 CLI。

import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { EventEmitter } from 'node:events';

import { resolveConfigDir, resolveArchiveDir, ensureConfig, readConfig, writeConfig } from './scripts/lib/config.mjs';
import { ensureArchive, readState } from './scripts/lib/archive.mjs';
import {
  listProjects,
  getProject,
  createProject,
  saveProject,
  removeProject,
  listPages,
  getPage,
  savePage,
  createPage,
  removePage,
  saveImage,
  getVersions,
  currentOf,
  setCurrentVersion,
  changes,
  ack,
} from './scripts/lib/archive.mjs';
import { listWorkflows, readWorkflow, saveWorkflow, checkWorkflow } from './scripts/lib/workflow.mjs';
import { renderPage } from './scripts/lib/render.mjs';
import { compilePage } from './core/compile.mjs';
import { compileContext } from './core/bible.mjs';
import { createPanelItem } from './core/manga-doc.mjs';
import { ComfyClient } from './scripts/lib/comfy.mjs';

const PORT = Number(process.env.PORT || 5123);
const HOST = process.env.HOST || '127.0.0.1';
const CONFIG_DIR = resolveConfigDir();
const CONFIG = await readConfig(CONFIG_DIR);
const ARCHIVE = resolveArchiveDir(CONFIG, process.env.MOSS_ARCHIVE);
const WEB = resolve(import.meta.dirname, 'web');
const CORE = resolve(import.meta.dirname, 'core');

const bus = new EventEmitter();
bus.setMaxListeners(32);
const jobs = [];

// ---------------------------------------------------------------- 小工具

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

const fail = (res, status, message) => json(res, status, { error: message });

async function body(req, limit = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('请求体过大'), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw Object.assign(new Error(`JSON 解析失败：${err.message}`), { status: 400 });
  }
}

async function sendFile(res, file, type) {
  try {
    const info = await stat(file);
    res.writeHead(200, {
      'content-type': type || MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-cache',
    });
    createReadStream(file).pipe(res);
  } catch {
    fail(res, 404, '文件不存在');
  }
}

function sse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  res.write(':ok\n\n');
  return {
    send(event, data) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      res.end();
    },
  };
}

const safe = (name) => String(name).replace(/[^a-zA-Z0-9._-]/g, '');

// ---------------------------------------------------------------- 路由

async function route(req, res, url) {
  const path = decodeURIComponent(url.pathname);
  const method = req.method;

  if (path === '/api/health') return json(res, 200, { ok: true, archive: ARCHIVE, version: '2.0.0' });

  if (path === '/api/config') {
    if (method === 'GET') return json(res, 200, await readConfig(CONFIG_DIR));
    if (method === 'PUT') {
      const patch = await body(req);
      return json(res, 200, await writeConfig(CONFIG_DIR, { ...patch, params: patch.params }));
    }
  }

  if (path === '/api/comfy/models' && method === 'GET') {
    const config = await readConfig(CONFIG_DIR);
    const client = new ComfyClient({ url: config.comfy.url });
    try {
      const info = await client.objectInfo();
      return json(res, 200, {
        ok: true,
        checkpoints: info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [],
        loras: info.LoraLoader?.input?.required?.lora_name?.[0] || [],
        samplers: info.KSampler?.input?.required?.sampler_name?.[0] || [],
      });
    } catch (err) {
      return json(res, 200, { ok: false, message: err.message, checkpoints: [], loras: [], samplers: [] });
    }
  }

  if (path === '/api/workflows' && method === 'GET') return json(res, 200, { workflows: await listWorkflows(CONFIG_DIR) });

  const wfMatch = path.match(/^\/api\/workflows\/([^/]+)$/);
  if (wfMatch) {
    const name = safe(wfMatch[1]);
    if (method === 'GET') {
      const wf = await readWorkflow(CONFIG_DIR, name);
      // 带上占位符清单：设置弹窗要按它决定显示哪些参数
      return json(res, 200, { ...wf, ...checkWorkflow(wf.raw) });
    }
    if (method === 'PUT') {
      const payload = await body(req);
      const raw = typeof payload.raw === 'string' ? payload.raw : JSON.stringify(payload.raw, null, 2);
      const imported = await saveWorkflow(CONFIG_DIR, raw, name);
      return json(res, 200, imported);
    }
  }

  if (path === '/api/changes' && method === 'GET') {
    const since = url.searchParams.get('since');
    const result = await changes(ARCHIVE, since === null ? undefined : Number(since));
    for (const group of result.pages) {
      const project = await getProject(ARCHIVE, group.project);
      const page = await getPage(ARCHIVE, group.project, group.page);
      if (project && page) {
        group.index = page.index;
        group.title = page.title;
        group.warnings = compilePage(page, compileContext(project, page)).warnings.length;
      }
    }
    return json(res, 200, result);
  }

  if (path === '/api/ack' && method === 'POST') return json(res, 200, await ack(ARCHIVE));

  if (path === '/api/jobs' && method === 'GET') return json(res, 200, { jobs: jobs.slice(-30).reverse() });

  if (path === '/api/jobs/stream' && method === 'GET') {
    const stream = sse(res);
    const listener = (job) => stream.send('job', job);
    bus.on('job', listener);
    for (const job of jobs.slice(-20)) stream.send('job', job);
    req.on('close', () => bus.off('job', listener));
    return;
  }

  if (path === '/api/projects') {
    if (method === 'GET') {
      const projects = await listProjects(ARCHIVE);
      const withCover = [];
      for (const project of projects) {
        const store = await getVersions(ARCHIVE, project.slug);
        const pages = await listPages(ARCHIVE, project.slug);
        const latest = store.items.slice(-1)[0];
        // 每页当前版，最多取 3 张做成胶片条，让「这个项目一共几张图」看得出来
        const covers = pages
          .map((p) => {
            const id = currentOf(store, p.id);
            return store.items.find((v) => v.id === id)?.image || '';
          })
          .filter(Boolean)
          .slice(0, 3);
        withCover.push({
          slug: project.slug,
          name: project.name,
          size: project.size,
          pages: pages.length,
          images: store.items.length,
          covers,
          cover: latest?.image || '',
          updatedAt: latest?.at || project.createdAt,
        });
      }
      return json(res, 200, { projects: withCover });
    }
    if (method === 'POST') {
      const payload = await body(req);
      const cfg = await readConfig(CONFIG_DIR);
      const project = await createProject(ARCHIVE, {
        name: payload.name,
        size: payload.size,
        canvas: payload.canvas || cfg.defaults.canvas,
        defaults: { reading: cfg.defaults.reading, style: cfg.defaults.style, vertical: cfg.defaults.vertical },
      });
      if (payload.withSamplePage) {
        await createPage(ARCHIVE, project.slug, {});
      }
      return json(res, 201, project);
    }
  }

  const projMatch = path.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
  if (projMatch) {
    const slug = safe(projMatch[1]);
    const rest = projMatch[2] || '';
    const project = await getProject(ARCHIVE, slug);
    if (!project && rest !== '') return fail(res, 404, '项目不存在');

    if (rest === '') {
      if (method === 'GET') return json(res, 200, project);
      if (method === 'PUT') {
        const payload = await body(req);
        if (payload.name) project.name = String(payload.name);
        if (payload.bible) project.bible = { ...project.bible, ...payload.bible };
        if (payload.defaults) project.defaults = { ...(project.defaults || {}), ...payload.defaults };
        if (payload.generation) project.generation = { ...(project.generation || {}), ...payload.generation };
        if (Array.isArray(payload.canvas)) project.canvas = payload.canvas;
        if (payload.params) project.params = { ...(project.params || {}), ...payload.params };
        await saveProject(ARCHIVE, project);
        return json(res, 200, project);
      }
      if (method === 'DELETE') {
        await removeProject(ARCHIVE, slug);
        return json(res, 200, { ok: true });
      }
    }

    if (rest === 'pages') {
      if (method === 'GET') {
        const pages = await listPages(ARCHIVE, slug);
        const versions = await getVersions(ARCHIVE, slug);
        const coverOf = (pageId) => versions.items.filter((v) => v.page === pageId).slice(-1)[0]?.image || '';
        return json(res, 200, { pages: pages.map((p) => ({ ...p, cover: coverOf(p.id) })) });
      }
      if (method === 'POST') {
        const payload = await body(req);
        const created = await createPage(ARCHIVE, slug, { title: payload.title || '' });
        return json(res, 201, created.page);
      }
    }

    if (rest === 'versions/current' && method === 'POST') {
      const payload = await body(req);
      const store = await setCurrentVersion(ARCHIVE, slug, String(payload.pageId || ''), String(payload.id || ''));
      return json(res, 200, store);
    }

    const pageMatch = rest.match(/^pages\/([^/]+)(?:\/(compile|render))?$/);
    if (pageMatch) {
      const pageId = safe(pageMatch[1]);
      const action = pageMatch[2];
      const page = await getPage(ARCHIVE, slug, pageId);
      if (!page) return fail(res, 404, '页面不存在');

      if (action === 'compile' && method === 'POST') {
        const compiled = compilePage(page, compileContext(project, page));
        return json(res, 200, { json: compiled.json, doc: compiled.doc, warnings: compiled.warnings, stats: compiled.stats });
      }

      if (action === 'render' && method === 'POST') {
        const payload = await body(req);
        const config = await readConfig(CONFIG_DIR);
        const job = { id: `job_${Date.now().toString(36)}`, page: page.id, index: page.index, status: 'running', progress: 0, at: new Date().toISOString() };
        jobs.push(job);
        if (jobs.length > 60) jobs.shift();
        bus.emit('job', { ...job });
        renderPage({
          dir: ARCHIVE,
          configDir: CONFIG_DIR,
          slug,
          project,
          page,
          config,
          opts: payload,
          onProgress: (p) => {
            job.progress = p?.max ? Math.round((p.value / p.max) * 100) : job.progress;
            bus.emit('job', { ...job });
          },
        })
          .then((result) => {
            Object.assign(job, { status: 'done', progress: 100, image: result.image, seed: result.seed, ms: result.ms });
            bus.emit('job', { ...job });
          })
          .catch((err) => {
            Object.assign(job, { status: 'error', error: err.message });
            bus.emit('job', { ...job });
          });
        return json(res, 202, { jobId: job.id });
      }

      if (method === 'GET') {
        const store = await getVersions(ARCHIVE, slug);
        const items = store.items.filter((v) => v.page === page.id);
        return json(res, 200, { page, versions: items, current: currentOf(store, page.id) });
      }
      if (method === 'PUT') {
        const payload = await body(req);
        const next = { ...page, ...payload, id: page.id };
        if (!payload.replaceItems) {
          // 局部更新：按 id 合并，避免把没提到的 item 删掉
          const map = new Map(page.items.map((it) => [it.id, it]));
          for (const item of payload.items || []) {
            if (item?.id && map.has(item.id)) map.set(item.id, { ...map.get(item.id), ...item });
            else map.set(item?.id || `tmp_${Math.random().toString(36).slice(2, 8)}`, item);
          }
          for (const id of payload.removeItems || []) map.delete(id);
          next.items = [...map.values()];
        }
        const saved = await savePage(ARCHIVE, slug, next, { actor: 'web' });
        return json(res, 200, saved.page);
      }
      if (method === 'DELETE') {
        await removePage(ARCHIVE, slug, page.id);
        return json(res, 200, { ok: true });
      }
    }
  }

  if (path.startsWith('/media/')) {
    const parts = path.split('/').filter(Boolean);
    const slug = safe(parts[1]);
    const file = safe(parts[2]);
    return sendFile(res, join(ARCHIVE, 'projects', slug, 'images', file));
  }

  if (path.startsWith('/config/')) {
    return sendFile(res, resolve(join(WEB, '..', 'config', safe(path.slice(8)))), 'text/javascript; charset=utf-8');
  }

  if (path.startsWith('/core/')) {
    return sendFile(res, join(CORE, safe(path.slice(6))), 'text/javascript; charset=utf-8');
  }

  return false;
}

// ---------------------------------------------------------------- 静态

async function serveStatic(req, res, path) {
  const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const file = resolve(join(WEB, rel));
  if (!file.startsWith(WEB + sep) && file !== WEB) return fail(res, 403, '越界访问');
  if (!existsSync(file)) return fail(res, 404, '未找到');
  if (rel === 'index.html') {
    let html = await readFile(file, 'utf8');
    const vendored = existsSync(join(WEB, 'vendor', 'preact.mjs'));
    html = html.replace('<!--IMPORTMAP-->', importmap(vendored));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    return res.end(html);
  }
  return sendFile(res, file);
}

function importmap(vendored) {
  const map = vendored
    ? { preact: '/vendor/preact.mjs', 'preact/hooks': '/vendor/preact-hooks.mjs', htm: '/vendor/htm.mjs' }
    : {
        preact: 'https://esm.sh/preact@10.25.4',
        'preact/hooks': 'https://esm.sh/preact@10.25.4/hooks',
        htm: 'https://esm.sh/htm@3.1.1',
      };
  return `<script type="importmap">${JSON.stringify({ imports: map })}</script>`;
}

// ---------------------------------------------------------------- 启动

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    const handled = await route(req, res, url);
    if (handled !== false) return;
    if (req.method === 'GET') return await serveStatic(req, res, url.pathname);
    return fail(res, 404, '未找到');
  } catch (err) {
    if (res.headersSent) return res.end();
    const status = err.status || 500;
    if (status >= 500) console.error('[error]', err);
    fail(res, status, err.message || '服务器内部错误');
  }
});

await ensureConfig(CONFIG_DIR);
  await loadTypes(CONFIG_DIR);
await ensureArchive(ARCHIVE);
server.listen(PORT, HOST, async () => {
  const config = await readConfig(CONFIG_DIR);
  const state = await readState(ARCHIVE);
  console.log('');
  console.log(`  MOSS 漫画预览  http://${HOST}:${PORT}`);
  console.log(`  配置 ${CONFIG_DIR}`);
  console.log(`  存档 ${ARCHIVE}（rev ${state.rev}）`);
  console.log(`  ComfyUI ${config.comfy.url} · 工作流 ${config.workflow.name || '（未设置）'} · 参数 ${Object.keys(config.params || {}).length} 个`);
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 被占用：PORT=5124 node server.mjs`);
    process.exit(1);
  }
  throw err;
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

