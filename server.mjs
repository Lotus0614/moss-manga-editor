#!/usr/bin/env node
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

import { resolveArchiveDir, readConfig, writeConfig, readState, ensureArchive } from './scripts/lib/config.mjs';
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
  setCurrentVersion,
  changes,
  ack,
} from './scripts/lib/archive.mjs';
import { listWorkflows, readWorkflow, importWorkflow } from './scripts/lib/workflow.mjs';
import { renderPage } from './scripts/lib/render.mjs';
import { compilePage } from './core/compile.mjs';
import { compileContext } from './core/bible.mjs';
import { applyPreset, seedPage, PRESET_IDS } from './core/presets.mjs';
import { ComfyClient } from './scripts/lib/comfy.mjs';

const PORT = Number(process.env.PORT || 5123);
const HOST = process.env.HOST || '127.0.0.1';
const ARCHIVE = resolveArchiveDir(process.env.MOSS_ARCHIVE);
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
    if (method === 'GET') return json(res, 200, await readConfig(ARCHIVE));
    if (method === 'PUT') return json(res, 200, await writeConfig(ARCHIVE, await body(req)));
  }

  if (path === '/api/comfy/models' && method === 'GET') {
    const config = await readConfig(ARCHIVE);
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

  if (path === '/api/workflows' && method === 'GET') return json(res, 200, { workflows: await listWorkflows(ARCHIVE) });

  const wfMatch = path.match(/^\/api\/workflows\/([^/]+)$/);
  if (wfMatch) {
    const name = safe(wfMatch[1]);
    if (method === 'GET') {
      const wf = await readWorkflow(ARCHIVE, name);
      return json(res, 200, wf);
    }
    if (method === 'PUT') {
      const payload = await body(req);
      const raw = typeof payload.raw === 'string' ? payload.raw : JSON.stringify(payload.raw, null, 2);
      const imported = await importWorkflow(ARCHIVE, raw, name);
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
        const versions = await getVersions(ARCHIVE, project.slug);
        const pages = await listPages(ARCHIVE, project.slug);
        const cover = versions.items.slice(-1)[0]?.image || '';
        withCover.push({ slug: project.slug, name: project.name, size: project.size, pages: pages.length, cover, updatedAt: versions.items.slice(-1)[0]?.at || project.createdAt });
      }
      return json(res, 200, { projects: withCover });
    }
    if (method === 'POST') {
      const payload = await body(req);
      const project = await createProject(ARCHIVE, { name: payload.name, size: payload.size });
      if (payload.withSamplePage) {
        const page = await createPage(ARCHIVE, project.slug, {});
        await savePage(ARCHIVE, project.slug, seedPage(page.page), { actor: 'web' });
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
        let page = created.page;
        if (!payload.blank) {
          const preset = PRESET_IDS.includes(payload.preset) ? payload.preset : 'band-3';
          const saved = await savePage(ARCHIVE, slug, seedPage(page, preset), { actor: 'web' });
          page = saved.page;
        }
        return json(res, 201, page);
      }
    }

    if (rest === 'versions/current' && method === 'POST') {
      const payload = await body(req);
      const store = await setCurrentVersion(ARCHIVE, slug, String(payload.id || ''));
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
        const config = await readConfig(ARCHIVE);
        const job = { id: `job_${Date.now().toString(36)}`, page: page.id, index: page.index, status: 'running', progress: 0, at: new Date().toISOString() };
        jobs.push(job);
        if (jobs.length > 60) jobs.shift();
        bus.emit('job', { ...job });
        renderPage({
          dir: ARCHIVE,
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
        const versions = await getVersions(ARCHIVE, slug);
        const items = versions.items.filter((v) => v.page === page.id);
        return json(res, 200, { page, versions: items, current: versions.current });
      }
      if (method === 'PUT') {
        const payload = await body(req);
        const saved = await savePage(ARCHIVE, slug, { ...page, ...payload, id: page.id }, { actor: 'web' });
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

await ensureArchive(ARCHIVE);
server.listen(PORT, HOST, async () => {
  const config = await readConfig(ARCHIVE);
  const state = await readState(ARCHIVE);
  console.log('');
  console.log(`  MOSS 漫画预览  http://${HOST}:${PORT}`);
  console.log(`  存档 ${ARCHIVE}（rev ${state.rev}）`);
  console.log(`  ComfyUI ${config.comfy.url} · 工作流 ${config.workflow.name} · ckpt ${config.defaults.ckpt || '未设置'}`);
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

