// 载入配置根里的 types.mjs —— 类型是「数据 + 函数」，直接 import。
//
// config/ 下的提示词与类型文件随代码一起走，运行时读的是配置根里的那份。

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { applyTypes, setBuildSummary } from '../../core/runtime.mjs';

export const typesPath = (configDir) => join(configDir, 'types.mjs');

/** 载入配置根里的 types.mjs；文件坏了就把错误带回去，别静默留个空类型表 */
export async function loadTypes(configDir) {
  const file = typesPath(configDir);
  try {
    const url = pathToFileURL(file).href + '?t=' + Date.now();
    const mod = await import(url);
    const list = mod.types || mod.TYPES || mod.default || [];
    applyTypes(list);
    setBuildSummary(mod.buildSummary);
    return { file, applied: true, count: list.length, error: '' };
  } catch (err) {
    return { file, applied: false, count: 0, error: err.message };
  }
}
