// 数据层：JSON 文件 + 内容寻址图片。
//
// 目录结构：
//   data/settings.json
//   data/projects/<projectId>/project.json
//   data/projects/<projectId>/pages/<pageId>.json
//   data/projects/<projectId>/images/<sha256>.png
//   data/uploads/<sha256>.<ext>
//
// 没有数据库是刻意的：单用户本机场景，文件即真相，AI 改代码时不用猜 schema。

import { mkdir, readFile, writeFile, readdir, rm, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, extname } from 'node:path';
import { normalizePage, createPage, uid, now, DEFAULT_SIZE } from '../core/manga-doc.mjs';

export const DATA_ROOT = process.env.MOSS_DATA ? resolve(process.env.MOSS_DATA) : resolve(process.cwd(), 'data');
const PROJECTS = join(DATA_ROOT, 'projects');
const UPLOADS = join(DATA_ROOT, 'uploads');
const SETTINGS_FILE = join(DATA_ROOT, 'settings.json');

export const DEFAULT_SETTINGS = {
  comfy: {
    url: 'http://127.0.0.1:8188',
    token: '',
    workflow: 'moss-image.api.json',
    timeoutMs: 180000,
  },
  llm: {
    baseUrl: '',
    apiKey: '',
    model: '',
    vision: true,
    temperature: 0.7,
  },
  defaults: {
    size: 'page',
    negative: 'nsfw, worst quality, bad anatomy, watermark, jpeg artifact',
    lora: '',
    seed: -1,
    ckpt: '',
    steps: 28,
    cfg: 5,
    sampler: 'euler',
    scheduler: 'simple',
  },
  agent: {
    mode: 'single',
    maxSteps: 10,
    keepMessages: 12,
  },
  onboarded: false,
};

export async function ensureDirs() {
  await mkdir(PROJECTS, { recursive: true });
  await mkdir(UPLOADS, { recursive: true });
}

// ---------------------------------------------------------------- 原子读写

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, value) {
  await mkdir(resolve(file, '..'), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, file);
}

// ---------------------------------------------------------------- 设置

export async function getSettings() {
  const saved = (await readJson(SETTINGS_FILE, {})) || {};
  const merged = {
    comfy: { ...DEFAULT_SETTINGS.comfy, ...(saved.comfy || {}) },
    llm: { ...DEFAULT_SETTINGS.llm, ...(saved.llm || {}) },
    defaults: { ...DEFAULT_SETTINGS.defaults, ...(saved.defaults || {}) },
    agent: { ...DEFAULT_SETTINGS.agent, ...(saved.agent || {}) },
    onboarded: Boolean(saved.onboarded),
  };
  return maskSettings(merged);
}

/** 下发给前端时永远不带明文 key */
export function maskSettings(s) {
  const key = s.llm?.apiKey || '';
  return {
    ...s,
    llm: {
      ...s.llm,
      apiKey: '',
      apiKeySet: key.length > 0,
      apiKeyHint: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : '',
    },
    comfy: { ...s.comfy, token: s.comfy?.token ? '***' : '', tokenSet: Boolean(s.comfy?.token) },
    ready: Boolean(s.comfy?.url && s.llm?.baseUrl && s.llm?.apiKey && s.llm?.model),
  };
}

/** 读未脱敏的原始设置，仅服务端内部使用 */
export async function getRawSettings() {
  const saved = (await readJson(SETTINGS_FILE, {})) || {};
  return {
    comfy: { ...DEFAULT_SETTINGS.comfy, ...(saved.comfy || {}) },
    llm: { ...DEFAULT_SETTINGS.llm, ...(saved.llm || {}) },
    defaults: { ...DEFAULT_SETTINGS.defaults, ...(saved.defaults || {}) },
    agent: { ...DEFAULT_SETTINGS.agent, ...(saved.agent || {}) },
    onboarded: Boolean(saved.onboarded),
  };
}

export async function saveSettings(patch = {}) {
  const current = await getRawSettings();
  const next = {
    comfy: { ...current.comfy },
    llm: { ...current.llm },
    defaults: { ...current.defaults },
    agent: { ...current.agent },
    onboarded: patch.onboarded ?? current.onboarded,
  };
  for (const group of ['comfy', 'llm', 'defaults', 'agent']) {
    if (!patch[group]) continue;
    for (const [key, value] of Object.entries(patch[group])) {
      // 前端不传 key 时表示「不修改」，避免脱敏后把真 key 冲掉
      if (key === 'apiKey' && (value === '' || value === undefined)) continue;
      if (key === 'token' && (value === '' || value === undefined)) continue;
      if (value !== undefined) next[group][key] = value;
    }
  }
  await writeJson(SETTINGS_FILE, next);
  return maskSettings(next);
}

// ---------------------------------------------------------------- 项目

function projectDir(id) {
  return join(PROJECTS, id);
}

function pagesDir(id) {
  return join(projectDir(id), 'pages');
}

function imagesDir(id) {
  return join(projectDir(id), 'images');
}

function pageFile(projectId, pageId) {
  return join(pagesDir(projectId), `${pageId}.json`);
}

export function emptyBible() {
  return { characters: [], style: { preset: 'mono', note: '' }, scene: '' };
}

export async function listProjects() {
  await ensureDirs();
  const dirs = await readdir(PROJECTS, { withFileTypes: true });
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const project = await readJson(join(PROJECTS, d.name, 'project.json'), null);
    if (!project) continue;
    const pages = await listPages(project.id);
    out.push({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      pageCount: project.pageOrder?.length || pages.length,
      cover: project.cover || pages.find((p) => p.cover)?.cover || '',
      bible: { characters: project.bible?.characters?.length || 0 },
    });
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getProject(id) {
  const project = await readJson(join(projectDir(id), 'project.json'), null);
  if (!project) return null;
  project.bible = { ...emptyBible(), ...(project.bible || {}) };
  return project;
}

export async function createProject({ name = '未命名项目', size = 'page', bible } = {}) {
  await ensureDirs();
  const id = uid('prj');
  const project = {
    id,
    name: String(name || '未命名项目').trim() || '未命名项目',
    size,
    createdAt: now(),
    updatedAt: now(),
    pageOrder: [],
    cover: '',
    bible: bible || emptyBible(),
  };
  await writeJson(join(projectDir(id), 'project.json'), project);
  await mkdir(pagesDir(id), { recursive: true });
  await mkdir(imagesDir(id), { recursive: true });
  return project;
}

export async function updateProject(id, patch = {}) {
  const project = await getProject(id);
  if (!project) return null;
  const next = { ...project, ...patch, updatedAt: now() };
  next.id = id;
  await writeJson(join(projectDir(id), 'project.json'), next);
  return next;
}

export async function deleteProject(id) {
  await rm(projectDir(id), { recursive: true, force: true });
}

// ---------------------------------------------------------------- 页面

export async function listPages(projectId) {
  try {
    const files = await readdir(pagesDir(projectId));
    const out = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const page = await readJson(join(pagesDir(projectId), f), null);
      if (!page) continue;
      const latest = latestVersion(page);
      out.push({
        id: page.id,
        index: page.index,
        title: page.title || '',
        updatedAt: page.updatedAt,
        panels: page.panels?.length || 0,
        bubbles: page.bubbles?.length || 0,
        versions: page.versions?.length || 0,
        cover: latest?.image || '',
        status: latest ? 'done' : 'draft',
      });
    }
    return out.sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
}

export function latestVersion(page) {
  const versions = page?.versions || [];
  return versions.length ? versions[versions.length - 1] : null;
}

export async function getPage(projectId, pageId) {
  const raw = await readJson(pageFile(projectId, pageId), null);
  if (!raw) return null;
  return normalizePage(raw);
}

export async function savePage(projectId, page) {
  const normalized = normalizePage({ ...page, updatedAt: now() });
  await writeJson(pageFile(projectId, normalized.id), normalized);
  const project = await getProject(projectId);
  if (project && !project.pageOrder.includes(normalized.id)) {
    project.pageOrder.push(normalized.id);
    await updateProject(projectId, { pageOrder: project.pageOrder, updatedAt: now() });
  }
  return normalized;
}

export async function createPageRecord(projectId, patch = {}) {
  const project = await getProject(projectId);
  if (!project) return null;
  const existing = await listPages(projectId);
  const index = (patch.index ?? existing.length + 1) || 1;
  const page = createPage({
    size: sizeForProject(project),
    index,
    title: patch.title || '',
    ...patch,
  });
  page.panels = patch.panels || [];
  page.bubbles = patch.bubbles || [];
  return savePage(projectId, page);
}

export function sizeForProject(project) {
  const presets = { page: { width: 768, height: 1280 }, 'page-hd': { width: 1152, height: 1920 }, square: { width: 1024, height: 1024 }, wide: { width: 1536, height: 1024 } };
  return presets[project?.size] || DEFAULT_SIZE;
}

export async function deletePage(projectId, pageId) {
  await rm(pageFile(projectId, pageId), { force: true });
  const project = await getProject(projectId);
  if (project) {
    await updateProject(projectId, { pageOrder: project.pageOrder.filter((x) => x !== pageId) });
  }
}

export async function reorderPages(projectId, order) {
  const project = await getProject(projectId);
  if (!project) return null;
  await updateProject(projectId, { pageOrder: order });
  let i = 1;
  for (const pageId of order) {
    const page = await getPage(projectId, pageId);
    if (!page) continue;
    await savePage(projectId, { ...page, index: i });
    i += 1;
  }
  return listPages(projectId);
}

// ---------------------------------------------------------------- 版本与图片

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function saveImage(projectId, buffer, ext = 'png') {
  const hash = sha256(buffer);
  const dir = imagesDir(projectId);
  await mkdir(dir, { recursive: true });
  const target = join(dir, `${hash}.${ext}`);
  try {
    await stat(target);
  } catch {
    await writeFile(target, buffer);
  }
  return { hash, file: `${hash}.${ext}`, url: `/media/${projectId}/${hash}.${ext}` };
}

export async function imagePath(projectId, file) {
  return join(imagesDir(projectId), file);
}

export async function saveUpload(buffer, ext = 'png') {
  await mkdir(UPLOADS, { recursive: true });
  const hash = sha256(buffer);
  const target = join(UPLOADS, `${hash}.${ext}`);
  try {
    await stat(target);
  } catch {
    await writeFile(target, buffer);
  }
  return { hash, file: `${hash}.${ext}`, url: `/uploads/${hash}.${ext}` };
}

export function uploadPath(file) {
  return join(UPLOADS, file);
}

export async function addVersion(projectId, pageId, version) {
  const page = await getPage(projectId, pageId);
  if (!page) return null;
  const record = {
    id: uid('v'),
    at: now(),
    status: 'done',
    ...version,
  };
  page.versions = [...(page.versions || []), record];
  const saved = await savePage(projectId, page);
  return saved.versions[saved.versions.length - 1];
}

export function extFromMime(mime = '') {
  const m = String(mime).toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('svg')) return 'svg';
  return 'png';
}
