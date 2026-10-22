import { BUBBLE_TYPES, TAIL_DIRECTIONS, prompts } from './prompts.mjs';

// 八种漫画文字载体的英文模板。
// 抄自 Moss 模板《漫画生成技巧》4.1 / 4.2 节。这些句子是喂给模型的「形状指令」，
// 改文案前先看那份文档，改错会让气泡画歪。

/**
 * @typedef {Object} BubbleType
 * @property {string} id      两位编号，与文档表格对齐
 * @property {string} key     程序内标识
 * @property {string} name    中文名（UI 显示）
 * @property {string} phrase  写进 caption 的英文形态描述
 * @property {boolean} tail   是否带尾巴
 * @property {boolean} inline 是否为浮字（无气泡，允许出血跨格）
 */


export { BUBBLE_TYPES, TAIL_DIRECTIONS };
const byKey = (types) => Object.fromEntries((types || BUBBLE_TYPES).map((b) => [b.key, b]));
export const BUBBLE_BY_KEY = byKey(BUBBLE_TYPES);



export function bubbleType(key) {
  const map = byKey(prompts.bubbleTypes);
  return map[key] || map.speech || BUBBLE_BY_KEY[key];
}

/**
 * 一条文字项的形态描述（位置由 compile 根据 bbox 补）。
 * @param {{kind?:string, tail?:string}} bubble
 */
export function bubblePhrase(bubble) {
  const t = bubbleType(bubble.kind);
  const parts = [t.phrase];
  if (t.tail) {
    const tail = bubble.tail;
    if (!tail || tail === 'none') parts.push('NO tail because the speaker is off panel');
    else parts.push(`a short tapering tail ${TAIL_DIRECTIONS[tail] || TAIL_DIRECTIONS['down-left']}`);
  }
  return parts.join(', ');
}
