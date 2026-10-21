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

/** @type {BubbleType[]} */
export const BUBBLE_TYPES = [
  {
    id: '01',
    key: 'speech',
    name: '对话',
    phrase: 'WHITE OVAL speech bubble, smooth even outline, thin black line',
    tail: true,
    inline: false,
  },
  {
    id: '02',
    key: 'shout',
    name: '喊叫',
    phrase: 'JAGGED EXPLOSIVE speech bubble with sharp spiky edges',
    tail: true,
    inline: false,
  },
  {
    id: '03',
    key: 'whisper',
    name: '小声',
    phrase: 'small round WHITE OVAL speech bubble, its tail made of three tiny circles trailing away in a line',
    tail: true,
    inline: false,
  },
  {
    id: '04',
    key: 'tremble',
    name: '颤抖',
    phrase: 'WHITE speech bubble with a SHAKY WAVY outline',
    tail: true,
    inline: false,
  },
  {
    id: '05',
    key: 'thought',
    name: '内心',
    phrase: 'WHITE CLOUD-shaped thought bubble, scalloped edge, thin black outline, NO tail',
    tail: false,
    inline: false,
  },
  {
    id: '06',
    key: 'heart',
    name: '心之声',
    phrase: 'speech bubble with a DASHED black outline, white interior, NO tail',
    tail: false,
    inline: false,
  },
  {
    id: '07',
    key: 'narration',
    name: '旁白',
    phrase:
      'narration lettering printed DIRECTLY on the artwork, floating freely, no bubble, no box, no background, thin white outline only',
    tail: false,
    inline: true,
  },
  {
    id: '08',
    key: 'sfx',
    name: '拟声词',
    phrase: 'hand-lettered sound effect, bold brush strokes, slightly rotated, thin white outline, no bubble',
    tail: false,
    inline: true,
  },
];

export const BUBBLE_BY_KEY = Object.fromEntries(BUBBLE_TYPES.map((b) => [b.key, b]));

export const TAIL_DIRECTIONS = {
  'down-left': 'pointing down-left',
  down: 'pointing straight down',
  'down-right': 'pointing down-right',
  left: 'pointing left',
  right: 'pointing right',
  'up-left': 'pointing up-left',
  up: 'pointing straight up',
  'up-right': 'pointing up-right',
};

export function bubbleType(key) {
  return BUBBLE_BY_KEY[key] || BUBBLE_BY_KEY.speech;
}

/**
 * 一条文字项的形态描述（位置由 compile 根据 bbox 补）。
 * @param {{type?:string, tail?:string}} bubble
 */
export function bubblePhrase(bubble) {
  const t = bubbleType(bubble.type);
  const parts = [t.phrase];
  if (t.tail) {
    const tail = bubble.tail;
    if (!tail || tail === 'none') parts.push('NO tail because the speaker is off panel');
    else parts.push(`a short tapering tail ${TAIL_DIRECTIONS[tail] || TAIL_DIRECTIONS['down-left']}`);
  }
  return parts.join(', ');
}
