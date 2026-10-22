// 全局配置：ComfyUI 地址、当前工作流、页面级默认值、任意工作流参数。
//
// 位置固定（默认 ~/.moss-manga，MOSS_CONFIG 可覆盖），工作流也在配置根下。
// 存档（项目/图片/state/journal）是另一棵树，默认 <配置根>/archive。

import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rename, access, copyFile } from 'node:fs/promises';
import { now } from '../../core/manga-doc.mjs';

// 仓库根 = workspace 根：本文件在 <root>/scripts/lib/，上三级就是 root
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_CONFIG_DIR = join(ROOT, 'config');

export function resolveConfigDir(dir) {
  const picked = dir || process.env.MOSS_CONFIG || DEFAULT_CONFIG_DIR;
  return resolve(picked);
}

export function resolveArchiveDir(config, override) {
  if (override) return resolve(override);
  if (process.env.MOSS_ARCHIVE) return resolve(process.env.MOSS_ARCHIVE);
  if (config?.archive) return resolve(config.archive);
  return join(ROOT, 'data');
}

export function defaultConfig() {
  return {
    version: 4,
    archive: '',
    comfy: { url: 'http://127.0.0.1:8188', timeoutMs: 180000 },
    workflow: { name: '' },
    // 页面级默认值：新建项目/页面时继承
    defaults: { canvas: [768, 1280], reading: 'rtl', style: 'mono', vertical: true },
    // 工作流参数：键就是占位符名，值就是用户填的内容（代码里没有白名单）
    params: {},
    createdAt: now(),
  };
}

export const configPath = (configDir) => join(configDir, 'config.json');
export const workflowsDir = (configDir) => join(configDir, 'workflows');

/** 去 BOM：Windows 存的 JSON 常带 BOM，JSON.parse 会直接失败 */
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
  if (!(await readJson(configPath(configDir), null))) await writeJson(configPath(configDir), defaultConfig());
  // 首次运行：把 defaults/ 里的方言文件复制到 config/（已存在就不动）
  for (const name of ['types.mjs', 'prompts.mjs', 'bubbles.mjs', 'helpers.mjs']) {
    const target = join(configDir, name);
    try {
      await access(target);
    } catch {
      await copyFile(join(ROOT, 'defaults', name), target);
    }
  }
  return configDir;
}

export async function readConfig(configDir) {
  const saved = (await readJson(configPath(configDir), null)) || {};
  const base = defaultConfig();

  const defaults = { ...base.defaults, ...(saved.defaults || {}) };
  const params = { ...(saved.params || {}) };
  // 迁移：v3 及更早把出图参数塞在 defaults 里，现在归到 params
  for (const key of ['ckpt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'negative', 'lora', 'seed']) {
    const value = defaults[key];
    if (value !== undefined && value !== '' && params[key] === undefined) params[key] = value;
    delete defaults[key];
  }

  return {
    ...base,
    ...saved,
    defaults,
    params,
    comfy: { ...base.comfy, ...(saved.comfy || {}) },
    workflow: { ...base.workflow, ...(saved.workflow || {}) },
  };
}

export async function writeConfig(configDir, patch = {}) {
  const current = await readConfig(configDir);
  const next = {
    ...current,
    ...patch,
    defaults: { ...current.defaults, ...(patch.defaults || {}) },
    params: { ...current.params, ...(patch.params || {}) },
    comfy: { ...current.comfy, ...(patch.comfy || {}) },
    workflow: { ...current.workflow, ...(patch.workflow || {}) },
  };
  await writeJson(configPath(configDir), next);
  return next;
}

export function getPath(object, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), object);
}

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
