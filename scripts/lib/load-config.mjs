// 载入配置根里的方言文件，注册进配置管理器。
//
// config/ 下的 manga.mjs 随代码一起走；CLI / 服务器 / 网页启动时各调一次 loadConfig()，
// 之后所有模块只从 core/config-store.mjs 取，不再 import 方言文件。

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { registerConfig, configProblems } from '../../core/config-store.mjs';

export const dialectPath = (configDir) => join(configDir, 'manga.mjs');

/** 读配置根里的 manga.mjs 并注册；文件坏了就把错误带回去，别静默留空配置 */
export async function loadConfig(configDir) {
  const file = dialectPath(configDir);
  try {
    const url = pathToFileURL(file).href + '?t=' + Date.now();
    const mod = await import(url);
    const config = mod.default || mod.manga;
    if (!config) return { file, applied: false, problems: [], error: '没有 default 导出' };
    registerConfig(config);
    return { file, applied: true, problems: configProblems(), error: '' };
  } catch (err) {
    return { file, applied: false, problems: [], error: err.message };
  }
}
