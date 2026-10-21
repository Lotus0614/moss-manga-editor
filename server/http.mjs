// 极简 HTTP 工具：无框架，够用就行。
// 路由是 [method, '/api/x/:id', handler] 三元组，参数从 pathname 里抠。

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json',
};

export function json(res, status, data, headers = {}) {
  const text = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(text);
}

export function text(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

export function fail(res, status, message, extra = {}) {
  json(res, status, { error: message, ...extra });
}

/** 读 JSON body；超过 limit 直接断开 */
export async function readBody(req, limit = 32 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.destroy();
      throw Object.assign(new Error('请求体过大'), { status: 413 });
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw Object.assign(new Error(`JSON 解析失败：${err.message}`), { status: 400 });
  }
}

export async function readRaw(req, limit = 64 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.destroy();
      throw Object.assign(new Error('上传过大'), { status: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------- 路由

export function route(method, pattern, handler) {
  const keys = [];
  const source = pattern
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { method, re: new RegExp(`^${source}/?$`), keys, handler };
}

export function match(routes, method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.re);
    if (!m) continue;
    const params = {};
    r.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(m[i + 1]);
    });
    return { handler: r.handler, params };
  }
  return null;
}

// ---------------------------------------------------------------- 静态文件

export function makeStatic(rootDir) {
  const root = resolve(rootDir);
  return async function serveStatic(req, res, pathname) {
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
    const target = resolve(join(root, rel));
    if (target !== root && !target.startsWith(root + sep)) {
      fail(res, 403, '越界访问');
      return true;
    }
    let info;
    try {
      info = await stat(target);
    } catch {
      return false;
    }
    if (info.isDirectory()) {
      return serveStatic(req, res, `${pathname.replace(/\/?$/, '/')}index.html`);
    }
    const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': info.size,
      'cache-control': 'no-cache',
    });
    createReadStream(target).pipe(res);
    return true;
  };
}

export async function sendFile(res, filePath, type) {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    fail(res, 404, '文件不存在');
    return;
  }
  res.writeHead(200, {
    'content-type': type || MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
}

// ---------------------------------------------------------------- SSE

export function sse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(':ok\n\n');
  const heartbeat = setInterval(() => {
    try {
      res.write(':ping\n\n');
    } catch {
      /* 连接已断 */
    }
  }, 15000);
  let closed = false;
  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      res.end();
    },
    get closed() {
      return closed;
    },
    onClientClose(fn) {
      res.on('close', () => {
        closed = true;
        clearInterval(heartbeat);
        fn?.();
      });
    },
  };
}
