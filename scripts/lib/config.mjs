// 全局配置：只放「跟项目无关」的东西——ComfyUI 地址、当前工作流、默认参数、编辑范围。
//
// 位置固定在 <配置根>，默认 ~/.moss-manga（MOSS_CONFIG 可覆盖）；
// 工作流文件也在配置根下的 workflows/，跟存档没有任何关系。
//
// 存档（项目、图片、state、journal）是另一棵树，默认 <配置根>/archive，可自定义。

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { now } from '../../core/manga-doc.mjs';

export const DEFAULT_CONFIG_DIR = join(homedir(), '.moss-manga');

/** 配置根：--config > MOSS_CONFIG > ~/.moss-manga */
export function resolveConfigDir(dir) {
  const picked = dir || process.env.MOSS_CONFIG || DEFAULT_CONFIG_DIR;
  return resolve(picked);
}

/**
 * 存档根：--dir > MOSS_ARCHIVE > config.archive > <配置根>/archive
 * 存档路径属于配置的一部分，所以换存档不会丢配置，换配置也不会搬数据。
 */
export function resolveArchiveDir(config, override) {
  if (override) return resolve(override);
  if (process.env.MOSS_ARCHIVE) return resolve(process.env.MOSS_ARCHIVE);
  if (config?.archive) return resolve(config.archive);
  return join(resolveConfigDir(process.env.MOSS_CONFIG), 'archive');
}

export function defaultConfig(configDir = DEFAULT_CONFIG_DIR) {
  return {
    version: 3,
    archive: '', // 空 = <配置根>/archive
    comfy: { url: 'http://127.0.0.1:8188', timeoutMs: 180000 },
    workflow: { name: '' },
    // 全部留空：这些值没有「合理默认」，必须由用户按自己的工作流填
    defaults: {
      ckpt: '',
      steps: '',
      cfg: '',
      sampler: '',
      scheduler: '',
      denoise: '',
      negative: '',
      lora: '',
      seed: '',
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

export const configPath = (configDir) => join(configDir, 'config.json');
export const workflowsDir = (configDir) => join(configDir, 'workflows');

/** 去 BOM：Windows 下用记事本/PowerShell 存的 JSON 常带 BOM，JSON.parse 会直接失败 */
export function stripBom(text) {
  return typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(stripBom(await readFile(file, 'utf8')));
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

export async function ensureConfig(configDir) {
  await mkdir(workflowsDir(configDir), { recursive: true });
  if (!(await readJson(configPath(configDir), null))) {
    await writeJson(configPath(configDir), defaultConfig(configDir));
  }
  return configDir;
}

export async function readConfig(configDir) {
  const saved = (await readJson(configPath(configDir), null)) || {};
  const base = defaultConfig(configDir);
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

export async function writeConfig(configDir, patch) {
  const current = await readConfig(configDir);
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
  await writeJson(configPath(configDir), next);
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
