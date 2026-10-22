// 运行时状态：当前生效的类型表与 summary 构造器。
// 内容全部来自 config/，这里只保存引用。

import defaultTypes from '../config/types.mjs';

export let ITEM_TYPES = defaultTypes;
export let ITEM_TYPE_MAP = Object.fromEntries(ITEM_TYPES.map((t) => [t.key, t]));

let BUILD_SUMMARY = null;

/** 用配置里的类型表替换默认值 */
export function applyTypes(list) {
  if (!Array.isArray(list) || !list.length) return ITEM_TYPES;
  ITEM_TYPES = list;
  ITEM_TYPE_MAP = Object.fromEntries(list.map((t) => [t.key, t]));
  return ITEM_TYPES;
}

export function getBuildSummary() {
  return BUILD_SUMMARY;
}

export function setBuildSummary(fn) {
  if (typeof fn === 'function') BUILD_SUMMARY = fn;
  return BUILD_SUMMARY;
}
