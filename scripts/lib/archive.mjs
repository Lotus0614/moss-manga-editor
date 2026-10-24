// 存档读写：项目 / 页面 / 版本 / 变更日志。
//
// 目录结构：
//   <archive>/config.json  state.json  journal.jsonl
//   <archive>/projects/<slug>/project.json
//                             pages/pNN.json
//                             versions.json + versions/<id>.json
//                             images/<sha256>.<ext>
//   <archive>/workflows/*.json
//
// 每次写入都会：rev+1 → 落页面 → 写 state → 追加 journal（含语义 ops）。

import { mkdir, readdir, rm, appendFile, stat, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { now, normalizePage, createPage as makePage, pageSize } from '../../core/manga-doc.mjs';
import { readJson, writeJson } from './config.mjs';
import { diffPage } from './diff.mjs';

const statePath = (dir) => join(dir, 'state.json');

export function defaultState() {
  return { rev: 0, ackedRev: 0, updatedAt: now() };
}

export async function readState(dir) {
  return (await readJson(statePath(dir), null)) || defaultState();
}

export async function writeState(dir, state) {
  const next = { ...state, updatedAt: now() };
  await writeJson(statePath(dir), next);
  return next;
}

/** 存档只建「项目数据」这半边，配置不在这里 */
export async function ensureArchive(dir) {
  await mkdir(join(dir, 'projects'), { recursive: true });
  if (!(await readJson(statePath(dir), null))) await writeJson(statePath(dir), defaultState());
  return dir;
}

const projectsDir = (dir) => join(dir, 'projects');
const projectDir = (dir, slug) => join(projectsDir(dir), slug);
const pagesDir = (dir, slug) => join(projectDir(dir, slug), 'pages');
const imagesDir = (dir, slug) => join(projectDir(dir, slug), 'images');
const versionsFile = (dir, slug) => join(projectDir(dir, slug), 'versions.json');
const journalFile = (dir) => join(dir, 'journal.jsonl');

/** 只保留 ASCII：目录名要能在任何 shell、zip、git 里安全传递 */
export function slugify(name) {
  const ascii = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return ascii.length >= 2 ? ascii : `proj-${Date.now().toString(36).slice(-6)}`;
}

// ---------------------------------------------------------------- 项目

export async function listProjects(dir) {
  const entries = await readdir(projectsDir(dir), { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const project = await readJson(join(projectsDir(dir), entry.name, 'project.json'), null);
    if (project) out.push(project);
  }
  return out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function getProject(dir, slug) {
  const project = await readJson(join(projectDir(dir, slug), 'project.json'), null);
  if (!project) return null;
  project.pages = Array.isArray(project.pages) ? project.pages : [];
  project.characters = Array.isArray(project.characters) ? project.characters : [];
  return project;
}

export async function saveProject(dir, project) {
  await mkdir(projectDir(dir, project.slug), { recursive: true });
  await mkdir(pagesDir(dir, project.slug), { recursive: true });
  await writeJson(join(projectDir(dir, project.slug), 'project.json'), project);
  return project;
}

export async function createProject(dir, { name, size = 'page', canvas, defaults } = {}) {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await getProject(dir, slug)) slug = `${base}-${n++}`;
  const project = {
    id: slug,
    slug,
    name: String(name || slug),
    size,
    canvas: Array.isArray(canvas) ? canvas : [768, 1280],
    defaults: defaults || { style: 'mono', vertical: true },
    characters: [],
    pages: [],
    createdAt: now(),
  };
  await saveProject(dir, project);
  await mkdir(imagesDir(dir, slug), { recursive: true });
  return project;
}

export async function removeProject(dir, slug) {
  await rm(projectDir(dir, slug), { recursive: true, force: true });
}

// ---------------------------------------------------------------- 页面

export async function listPages(dir, slug) {
  const files = await readdir(pagesDir(dir, slug)).catch(() => []);
  const out = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readJson(join(pagesDir(dir, slug), file), null);
    if (!raw) continue;
    const page = normalizePage(raw);
    out.push({
      id: page.id,
      index: page.index,
      title: page.title,
      rev: page.rev,
      panels: page.items.filter((it) => it.type === 'panel').length,
      bubbles: page.items.filter((it) => it.type === 'bubble').length,
      items: page.items.length,
    });
  }
  return out.sort((a, b) => a.index - b.index);
}

export async function getPage(dir, slug, ref) {
  const pageId = await resolvePageId(dir, slug, ref);
  if (!pageId) return null;
  const raw = await readJson(join(pagesDir(dir, slug), `${pageId}.json`), null);
  return raw ? normalizePage(raw) : null;
}

/** --page 3 或 --page p03 都接受 */
export async function resolvePageId(dir, slug, ref) {
  const pages = await listPages(dir, slug);
  const text = String(ref ?? '').trim();
  if (!text) return null;
  const byId = pages.find((p) => p.id === text);
  if (byId) return byId.id;
  const index = Number(text);
  if (Number.isFinite(index)) return pages.find((p) => p.index === index)?.id || null;
  return null;
}

async function nextPageId(dir, slug) {
  const pages = await listPages(dir, slug);
  const max = pages.reduce((acc, p) => {
    const n = Number(String(p.id).replace(/\D/g, ''));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `p${String(max + 1).padStart(2, '0')}`;
}

/**
 * 新建一页。默认给「一个占满整页的框」当起手，不是版式预设——
 * 怎么排由用户/AI 自己拖。
 */
export async function createPage(dir, slug, { title = '', size, items } = {}) {
  const project = await getProject(dir, slug);
  if (!project) throw new Error(`项目不存在：${slug}`);
  const pages = await listPages(dir, slug);
  const id = await nextPageId(dir, slug);
  const sizes = { page: [768, 1280], 'page-hd': [1152, 1920], square: [1024, 1024], wide: [1536, 1024] };
  const pageSize = size || (Array.isArray(project.canvas) ? project.canvas : null) || sizes[project.size] || sizes.page;
  const initialItems =
    items ||
    [
      { type: 'panel', bbox: [8, 8, pageSize[0] - 8, pageSize[1] - 8] },
    ];
  const defaults = project.defaults || {};
  const page = normalizePage(
    makePage({
      id,
      index: pages.length + 1,
      title,
      size: pageSize,
      items: initialItems,
      ...(defaults.style ? { style: defaults.style } : {}),
      ...(typeof defaults.vertical === 'boolean' ? { vertical: defaults.vertical } : {}),
    })
  );
  const saved = await writePageFile(dir, slug, page, { actor: 'cli', op: 'create' });
  project.pages = [...pages.map((p) => p.id), id];
  await saveProject(dir, project);
  return saved;
}

/**
 * 保存页面：算 rev、写文件、记 journal。
 * @returns {{page:object, rev:number, ops:Array}}
 */
export async function savePage(dir, slug, page, { actor = 'cli' } = {}) {
  const before = await readJson(join(pagesDir(dir, slug), `${page.id}.json`), null);
  const normalized = normalizePage(page);
  return writePageFile(dir, slug, normalized, { actor, before });
}

async function writePageFile(dir, slug, page, { actor = 'cli', before = null, op = null } = {}) {
  const state = await readState(dir);
  const normalized = normalizePage(page);
  const ops = before ? diffPage(normalizePage(before), normalized) : op ? [{ op, target: 'page', index: normalized.index }] : [];

  if (before && ops.length === 0) {
    return { page: normalized, rev: state.rev, ops: [] };
  }

  const rev = state.rev + 1;
  const next = { ...normalized, rev };
  await writeJson(join(pagesDir(dir, slug), `${next.id}.json`), next);
  await writeState(dir, { ...state, rev });
  await appendJournal(dir, {
    rev,
    at: now(),
    actor,
    project: slug,
    page: next.id,
    index: next.index,
    ops,
  });
  return { page: next, rev, ops };
}

export async function removePage(dir, slug, ref) {
  const pageId = await resolvePageId(dir, slug, ref);
  if (!pageId) throw new Error(`找不到页面：${ref}`);
  await rm(join(pagesDir(dir, slug), `${pageId}.json`), { force: true });
  const project = await getProject(dir, slug);
  project.pages = project.pages.filter((id) => id !== pageId);
  await saveProject(dir, project);
  const state = await readState(dir);
  const rev = state.rev + 1;
  await writeState(dir, { ...state, rev });
  await appendJournal(dir, { rev, at: now(), actor: 'cli', project: slug, page: pageId, index: null, ops: [{ op: 'remove', target: 'page' }] });
  return { pageId, rev };
}

/** 重排页序：传入页面 id 或序号的数组 */
export async function reorderPages(dir, slug, order) {
  const pages = await listPages(dir, slug);
  const ids = order
    .map((ref) => pages.find((p) => p.id === String(ref) || p.index === Number(ref))?.id)
    .filter(Boolean);
  const rest = pages.map((p) => p.id).filter((id) => !ids.includes(id));
  const finalOrder = [...ids, ...rest];
  let index = 1;
  for (const id of finalOrder) {
    const raw = await readJson(join(pagesDir(dir, slug), `${id}.json`), null);
    if (!raw) continue;
    if (raw.index !== index) {
      raw.index = index;
      await writeJson(join(pagesDir(dir, slug), `${id}.json`), raw);
    }
    index += 1;
  }
  const project = await getProject(dir, slug);
  project.pages = finalOrder;
  await saveProject(dir, project);
  return listPages(dir, slug);
}

// ---------------------------------------------------------------- 版本

export async function getVersions(dir, slug) {
  const raw = (await readJson(versionsFile(dir, slug), null)) || {};
  const items = Array.isArray(raw.items) ? raw.items : [];
  const currentByPage = { ...(raw.currentByPage || {}) };
  // 兼容旧格式：单个 current 字符串，归到它所属的那一页
  if (raw.current && !Object.keys(currentByPage).length) {
    const picked = items.find((v) => v.id === raw.current);
    if (picked) currentByPage[picked.page] = picked.id;
  }
  // 有图但没有采用记录的页，默认取该页最新一版（不覆盖已有的选择）
  const latestByPage = {};
  for (const item of items) latestByPage[item.page] = item.id;
  for (const [pageId, versionId] of Object.entries(latestByPage)) {
    if (!currentByPage[pageId]) currentByPage[pageId] = versionId;
  }
  return { currentByPage, items };
}

/** 某一页当前采用的版本 id */
export function currentOf(store, pageId) {
  return store?.currentByPage?.[pageId] || '';
}

export async function addVersion(dir, slug, version) {
  const store = await getVersions(dir, slug);
  const id = `v${String(store.items.length + 1).padStart(3, '0')}`;
  const item = { id, at: now(), ...version };
  store.items.push(item);
  store.currentByPage[item.page] = id;
  await writeJson(versionsFile(dir, slug), store);
  if (version.promptJson) {
    await writeJson(join(projectDir(dir, slug), 'versions', `${id}.json`), {
      id,
      page: version.page,
      prompt: version.promptJson,
      seed: version.seed,
    });
  }
  return item;
}

export async function setCurrentVersion(dir, slug, pageId, versionId) {
  const store = await getVersions(dir, slug);
  const picked = store.items.find((v) => v.id === versionId);
  if (!picked) throw new Error(`版本不存在：${versionId}`);
  if (pageId && picked.page !== pageId) throw new Error(`版本 ${versionId} 不属于第 ${pageId} 页`);
  store.currentByPage[picked.page] = versionId;
  await writeJson(versionsFile(dir, slug), store);
  return store;
}

// ---------------------------------------------------------------- 图片

export async function saveImage(dir, slug, buffer, ext = 'png') {
  const hash = createHash('sha256').update(buffer).digest('hex');
  const target = join(imagesDir(dir, slug), `${hash}.${ext}`);
  await mkdir(imagesDir(dir, slug), { recursive: true });
  try {
    await stat(target);
  } catch {
    await writeFile(target, buffer);
  }
  return { hash, file: `${hash}.${ext}`, url: `/media/${slug}/${hash}.${ext}` };
}

export async function imageBytes(dir, slug, file) {
  return readFile(join(imagesDir(dir, slug), file));
}

// ---------------------------------------------------------------- 变更日志

const MAX_JOURNAL_BYTES = 512 * 1024;

async function appendJournal(dir, entry) {
  const file = journalFile(dir);
  await appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
  try {
    const info = await stat(file);
    if (info.size > MAX_JOURNAL_BYTES) {
      const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
      const keep = lines.slice(-2000);
      await writeFile(file, `${keep.join('\n')}\n`, 'utf8');
    }
  } catch {
    /* 裁剪失败不影响写入 */
  }
}

export async function readJournal(dir) {
  try {
    const text = await readFile(journalFile(dir), 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 自 since 版本之后的所有变更，按页面聚合。
 * @param {number} [since] 默认用 state.ackedRev
 */
export async function changes(dir, since) {
  const state = await readState(dir);
  const from = Number.isFinite(Number(since)) ? Number(since) : state.ackedRev;
  const entries = (await readJournal(dir)).filter((e) => e.rev > from);
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.project}/${entry.page}`;
    const group = groups.get(key) || {
      project: entry.project,
      page: entry.page,
      index: entry.index,
      rev: 0,
      ops: [],
    };
    group.ops.push(...(entry.ops || []));
    group.rev = Math.max(group.rev, entry.rev);
    if (entry.index) group.index = entry.index;
    groups.set(key, group);
  }
  return {
    since: from,
    to: state.rev,
    acked: state.ackedRev,
    pages: [...groups.values()].sort((a, b) => (a.index || 0) - (b.index || 0)),
  };
}

/** 确认已同步：把 ackedRev 推到当前 rev */
export async function ack(dir) {
  const state = await readState(dir);
  await writeState(dir, { ...state, ackedRev: state.rev });
  return { ackedRev: state.rev };
}

export async function currentRev(dir) {
  return (await readState(dir)).rev;
}

export { pageSize };
