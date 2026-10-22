// 运行时可覆盖的模板表。
//
// 各模块 import 的是这里导出的对象引用，所以 applyTemplates() 改了内容，
// 编译器和注册表立刻看到新值——不用改任何 import。

import * as defaults from '../config/prompts.mjs';

export const T = {
  panelShapes: defaults.PANEL_SHAPES,
  frameStyles: defaults.FRAME_STYLES,
  cameras: defaults.CAMERAS,
  stylePresets: defaults.STYLE_PRESETS,
  readingOrders: defaults.READING_ORDERS,
  bubbleTypes: defaults.BUBBLE_TYPES,
  tailDirections: defaults.TAIL_DIRECTIONS,
  snippets: defaults.PROMPT_SNIPPETS,
};

/** 合并配置里的模板；只覆盖传进来的键，其余保持默认 */
export function applyTemplates(patch = {}) {
  for (const key of Object.keys(T)) {
    const value = patch[key];
    if (value && typeof value === 'object') {
      // 深合并一层：允许只改其中某一项
      for (const [k, v] of Object.entries(value)) {
        const current = T[key][k];
        T[key][k] = current && typeof current === 'object' && !Array.isArray(current) ? { ...current, ...v } : v;
      }
    }
  }
  return T;
}

export function resetTemplates() {
  applyTemplates(defaults);
  return T;
}
