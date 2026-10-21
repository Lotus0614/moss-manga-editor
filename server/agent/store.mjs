// 对话线程存储：主 Agent 一个线程，每个子 Agent 一个线程。
// 线程文件放在项目目录里，另存一份索引 data/threads.json 便于按 id 直接查。

import { mkdir, readdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DATA_ROOT } from '../store.mjs';
import { now, uid } from '../../core/manga-doc.mjs';

const PROJECTS = join(DATA_ROOT, 'projects');
const INDEX_FILE = join(DATA_ROOT, 'threads.json');

const threadsDir = (projectId) => join(PROJECTS, projectId, 'threads');
const threadFile = (projectId, id) => join(threadsDir(projectId), `${id}.json`);

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(resolve(file, '..'), { recursive: true });
  const tmp = `${file}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, file);
}

async function readIndex() {
  return (await readJson(INDEX_FILE, {})) || {};
}

async function writeIndex(index) {
  await writeJson(INDEX_FILE, index);
}

export function createThreadRecord({ projectId, kind = 'main', pageId = '', title = '', mode = 'unset' }) {
  return {
    id: uid('th'),
    projectId,
    kind,
    pageId,
    title: title || (kind === 'page' ? '页面子 Agent' : '主 Agent'),
    mode,
    summary: '',
    messages: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

export async function createThread(info) {
  const thread = createThreadRecord(info);
  await saveThread(thread);
  return thread;
}

export async function saveThread(thread) {
  const next = { ...thread, updatedAt: now() };
  await writeJson(threadFile(thread.projectId, thread.id), next);
  const index = await readIndex();
  index[next.id] = next.projectId;
  await writeIndex(index);
  return next;
}

export async function getThread(id) {
  const index = await readIndex();
  const projectId = index[id];
  if (!projectId) return null;
  return readJson(threadFile(projectId, id), null);
}

export async function listThreads(projectId) {
  try {
    const files = await readdir(threadsDir(projectId));
    const out = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const t = await readJson(join(threadsDir(projectId), f), null);
      if (!t) continue;
      out.push({
        id: t.id,
        kind: t.kind,
        pageId: t.pageId,
        title: t.title,
        mode: t.mode,
        messages: t.messages?.length || 0,
        updatedAt: t.updatedAt,
      });
    }
    return out.sort((a, b) => String(a.createdAt || a.updatedAt).localeCompare(String(b.createdAt || b.updatedAt)));
  } catch {
    return [];
  }
}

export async function deleteThread(id) {
  const index = await readIndex();
  const projectId = index[id];
  if (!projectId) return false;
  await rm(threadFile(projectId, id), { force: true });
  delete index[id];
  await writeIndex(index);
  return true;
}

/** 找到项目里的主线程，没有就建一个 */
export async function ensureMainThread(projectId) {
  const threads = await listThreads(projectId);
  const main = threads.find((t) => t.kind === 'main');
  if (main) return getThread(main.id);
  return createThread({ projectId, kind: 'main', title: '主 Agent' });
}

/** 每一页一个子线程 */
export async function ensurePageThread(projectId, pageId, title = '') {
  const threads = await listThreads(projectId);
  const found = threads.find((t) => t.kind === 'page' && t.pageId === pageId);
  if (found) return getThread(found.id);
  return createThread({ projectId, kind: 'page', pageId, title: title || `第 ${pageId.slice(-4)} 页` });
}
