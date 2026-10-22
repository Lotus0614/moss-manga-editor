// 提示词模板：代码里的是默认值，全局配置里的覆盖它。
//
// 提示词与类型都是 config/ 下的 .mjs 文件，运行时直接 import。

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
} from '../../config/prompts.mjs';
import { applyTemplates } from '../../core/templates-store.mjs';
import { applyTypes, setBuildSummary } from '../../core/runtime.mjs';
import { pathToFileURL } from 'node:url';

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
    setBuildSummary(mod.buildSummary);
    return { file, applied: true, count: list.length };
  } catch {
    return { file, applied: false, count: 0 };
  }
}