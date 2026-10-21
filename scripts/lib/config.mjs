// 存档配置与全局状态（config.json / state.json）。
// 存档位置解析顺序：--dir > 环境变量 MOSS_ARCHIVE > ~/.moss-manga

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { now } from '../../core/manga-doc.mjs';

export const DEFAULT_ARCHIVE = join(homedir(), '.moss-manga');

export function resolveArchiveDir(dir) {
  const picked = dir || process.env.MOSS_ARCHIVE || DEFAULT_ARCHIVE;
  return resolve(picked.replace(/^~(?=$|[\\/])/, homedir()));
}

export function defaultConfig() {
  return {
    version: 2,
    comfy: { url: 'http://127.0.0.1:8188', timeoutMs: 180000 },
    workflow: { name: 'default.json', exposed: ['seed', 'steps', 'cfg'] },
    defaults: {
      ckpt: '',
      steps: 28,
      cfg: 5,
      sampler: 'euler',
      scheduler: 'simple',
      negative: 'nsfw, worst quality, bad anatomy, watermark, jpeg artifact',
      lora: '',
    },
    editable: {
      layout: true,
      text: true,
      bubbleType: true,
      style: true,
      params: { seed: true, steps: false, cfg: false },
    },
    createdAt: now(),
  };
}

export function defaultState() {
  return { rev: 0, ackedRev: 0, updatedAt: now() };
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function writeJson(file, value) {
  await mkdir(resolve(file, '..'), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}

export const configPath = (dir) => join(dir, 'config.json');
export const statePath = (dir) => join(dir, 'state.json');

export async function ensureArchive(dir) {
  await mkdir(join(dir, 'projects'), { recursive: true });
  await mkdir(join(dir, 'workflows'), { recursive: true });
  if (!(await readJson(configPath(dir), null))) await writeJson(configPath(dir), defaultConfig());
  if (!(await readJson(statePath(dir), null))) await writeJson(statePath(dir), defaultState());
  return dir;
}

export async function readConfig(dir) {
  const saved = (await readJson(configPath(dir), null)) || {};
  const base = defaultConfig();
  return {
    ...base,
    ...saved,
    comfy: { ...base.comfy, ...(saved.comfy || {}) },
    workflow: { ...base.workflow, ...(saved.workflow || {}) },
    defaults: { ...base.defaults, ...(saved.defaults || {}) },
    editable: {
      ...base.editable,
      ...(saved.editable || {}),
      params: { ...base.editable.params, ...(saved.editable?.params || {}) },
    },
  };
}

export async function writeConfig(dir, patch) {
  const current = await readConfig(dir);
  const next = {
    ...current,
    ...patch,
    comfy: { ...current.comfy, ...(patch.comfy || {}) },
    workflow: { ...current.workflow, ...(patch.workflow || {}) },
    defaults: { ...current.defaults, ...(patch.defaults || {}) },
    editable: {
      ...current.editable,
      ...(patch.editable || {}),
      params: { ...current.editable.params, ...(patch.editable?.params || {}) },
    },
  };
  await writeJson(configPath(dir), next);
  return next;
}

export async function readState(dir) {
  return (await readJson(statePath(dir), null)) || defaultState();
}

export async function writeState(dir, state) {
  const next = { ...state, updatedAt: now() };
  await writeJson(statePath(dir), next);
  return next;
}

/** 点号路径取值：config set comfy.url xxx */
export function getPath(object, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), object);
}

/** 点号路径写值，返回新对象（不改原对象） */
export function setPath(object, path, value) {
  const keys = path.split('.');
  const clone = JSON.parse(JSON.stringify(object));
  let cursor = clone;
  for (const key of keys.slice(0, -1)) {
    if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
  return clone;
}
