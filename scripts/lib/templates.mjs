// 提示词模板：代码里的是默认值，全局配置里的覆盖它。
//
// 首次 init（或 doctor）会把默认模板导出到 <配置根>/prompt-templates.json；
// 之后 Agent 直接改那个文件即可，不用碰代码。

import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PANEL_SHAPES,
  FRAME_STYLES,
  CAMERAS,
  STYLE_PRESETS,
  READING_ORDERS,
  BUBBLE_TYPES,
  TAIL_DIRECTIONS,
  PROMPT_SNIPPETS,
} from '../../core/prompt-templates.mjs';
import { applyTemplates } from '../../core/templates-store.mjs';
import { applyTypes } from '../../core/registry.mjs';
import { pathToFileURL } from 'node:url';

export const templatesPath = (configDir) => join(configDir, 'prompt-templates.json');

/** 导出当前内置模板（已存在就不覆盖，除非 force） */
export async function exportTemplates(configDir, { force = false } = {}) {
  await mkdir(configDir, { recursive: true });
  const file = templatesPath(configDir);
  if (!force) {
    try {
      await access(file);
      return { file, written: false };
    } catch {}
  }
  const json = {
    _说明: '这些是生成漫画提示词时用的词表与句式。直接改这里，不用改代码。',
    panelShapes: PANEL_SHAPES,
    frameStyles: FRAME_STYLES,
    cameras: CAMERAS,
    stylePresets: STYLE_PRESETS,
    readingOrders: READING_ORDERS,
    bubbleTypes: BUBBLE_TYPES,
    tailDirections: TAIL_DIRECTIONS,
    snippets: PROMPT_SNIPPETS,
  };
  await writeFile(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  return { file, written: true };
}

/** 读配置里的模板并覆盖到运行时（进程内生效） */
export async function loadTemplates(configDir) {
  const file = templatesPath(configDir);
  try {
    const raw = await readFile(file, 'utf8');
    const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
    applyTemplates(data);
    return { file, applied: true, data };
  } catch {
    return { file, applied: false };
  }
}

export const typesPath = (configDir) => join(configDir, 'types.mjs');

/** 把默认类型文件复制到配置根（已存在就不覆盖） */
export async function exportTypes(configDir, { force = false } = {}) {
  await mkdir(configDir, { recursive: true });
  const target = typesPath(configDir);
  if (!force) {
    try {
      await access(target);
      return { file: target, written: false };
    } catch {}
  }
  const source = new URL('../../defaults/types.mjs', import.meta.url);
  await writeFile(target, await readFile(source, 'utf8'), 'utf8');
  return { file: target, written: true };
}

/** 载入配置根里的 types.mjs（没有就用默认） */
export async function loadTypes(configDir) {
  const file = typesPath(configDir);
  try {
    const url = pathToFileURL(file).href + '?t=' + Date.now();
    const mod = await import(url);
    const list = mod.TYPES || mod.default || [];
    applyTypes(list);
    return { file, applied: true, count: list.length };
  } catch {
    return { file, applied: false, count: 0 };
  }
}