// 提示词模板表：模型吃什么「措辞」，全在这里。
//
// 想改生成效果就改这个文件——不用碰编译器逻辑：
//   - 改某个形状的 phrase → 换一种说法喂给模型
//   - 加一个新形状/机位/气泡类型 → 在这张表里加一行，编译器和编辑器自动认得
//
// 每张表的形状：{ key: { name, phrase } }，phrase 是拼进 caption 的英文。

/** 分格形状：phrase 决定模型画成什么样 */
export const PANEL_SHAPES = {
  rect: { name: '矩形', phrase: 'rectangular panel with straight edges' },
  'slant-top': { name: '斜切上边', phrase: 'trapezoid panel with a slanted top edge cutting diagonally' },
  'slant-side': { name: '斜切侧边', phrase: 'panel with a sharply angled slanted side edge' },
  'bleed-top': { name: '出血·上', phrase: 'panel bleeding off the TOP edge of the page, no border' },
  'bleed-bottom': { name: '出血·下', phrase: 'panel bleeding off the BOTTOM edge of the page, no border' },
  'bleed-left': { name: '出血·左', phrase: 'panel bleeding off the LEFT edge of the page, no border' },
  'bleed-right': { name: '出血·右', phrase: 'panel bleeding off the RIGHT edge of the page, no border' },
  'bleed-all': { name: '满版', phrase: 'full-bleed panel covering the whole page, no border, artwork running off all four edges' },
  circle: { name: '圆形', phrase: 'circular panel with a clean round border' },
};

/** 边框 */
export const FRAME_STYLES = {
  border: { name: '描边', phrase: 'crisp black panel border with a white gutter around it' },
  none: { name: '无边', phrase: 'no border, artwork fills the panel edge to edge' },
  thick: { name: '粗边', phrase: 'heavy black panel border' },
};

/** 机位 / 景别 */
export const CAMERAS = {
  eye: { name: '平视', phrase: 'eye-level shot' },
  high: { name: '俯视', phrase: 'high-angle shot looking down' },
  low: { name: '仰视', phrase: 'low-angle shot looking up' },
  wide: { name: '全景', phrase: 'wide establishing shot' },
  medium: { name: '中景', phrase: 'medium shot' },
  close: { name: '特写', phrase: 'close-up' },
  xclose: { name: '大特写', phrase: 'extreme close-up' },
  ots: { name: '过肩', phrase: 'over-the-shoulder shot' },
  dutch: { name: '荷兰角', phrase: 'dutch angle with a tilted horizon' },
};

/** 画风：整页的总基调，phrase 进 summary，guard 会补到每个 item 末尾 */
export const STYLE_PRESETS = {
  mono: {
    name: '黑白网点',
    meta: ['japanese manga page', 'monochrome'],
    phrase:
      'STRICTLY BLACK AND WHITE MANGA PAGE, monochrome ink with grey screentone only. Black ink lines on bare white paper, grey screentone dot patterns only. ZERO COLOUR: no flesh colour, no skin tone, no blue, no cyan, no yellow, no brown, no colour wash. Skin is flat pale GREY halftone with black line shading. Shadows are dense black crosshatching, highlights are untouched white paper.',
    guard: 'Black ink, white paper and grey screentone only, zero colour.',
  },
  color: {
    name: '彩色',
    meta: ['japanese manga page', 'full color'],
    phrase:
      'FULL COLOUR JAPANESE MANGA PAGE: clean ink lineart with soft muted digital colouring, pale skin tones, desaturated palette, consistent light direction across all panels.',
    guard: '',
  },
  sketch: {
    name: '线稿',
    meta: ['manga lineart', 'monochrome'],
    phrase: 'MANGA LINEART ONLY, clean black ink lines on pure white, no screentone, no shading fills, no colour at all.',
    guard: 'Black ink on white only, zero tone, zero colour.',
  },
};

/** 阅读顺序 */
export const READING_ORDERS = {
  rtl: { name: '右 → 左（日式）', phrase: 'Panels are read RIGHT TO LEFT, top to bottom.' },
  ltr: { name: '左 → 右（西式）', phrase: 'Panels are read LEFT TO RIGHT, top to bottom.' },
};

/** 八种文字载体：抄自模板文档 4.2 节，改错会让气泡画歪 */
export const BUBBLE_TYPES = [
  {
    id: '01',
    key: 'speech',
    name: '对话',
    phrase: 'WHITE OVAL speech bubble, smooth even outline, thin black line',
    tail: true,
  },
  { id: '02', key: 'shout', name: '喊叫', phrase: 'JAGGED EXPLOSIVE speech bubble with sharp spiky edges', tail: true },
  {
    id: '03',
    key: 'whisper',
    name: '小声',
    phrase: 'small round WHITE OVAL speech bubble, its tail made of three tiny circles trailing away in a line',
    tail: true,
  },
  { id: '04', key: 'tremble', name: '颤抖', phrase: 'WHITE speech bubble with a SHAKY WAVY outline', tail: true },
  {
    id: '05',
    key: 'thought',
    name: '内心',
    phrase: 'WHITE CLOUD-shaped thought bubble, scalloped edge, thin black outline, NO tail',
    tail: false,
  },
  { id: '06', key: 'heart', name: '心之声', phrase: 'speech bubble with a DASHED black outline, white interior, NO tail', tail: false },
  {
    id: '07',
    key: 'narration',
    name: '旁白',
    phrase:
      'narration lettering printed DIRECTLY on the artwork, floating freely, no bubble, no box, no background, thin white outline only',
    tail: false,
  },
  {
    id: '08',
    key: 'sfx',
    name: '拟声词',
    phrase: 'hand-lettered sound effect, bold brush strokes, slightly rotated, thin white outline, no bubble',
    tail: false,
  },
];

/** 尾巴方向 */
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

// ---------------------------------------------------------------- 句子模板
// 编译器里所有会进入提示词的固定句式都在这里，{xxx} 是占位符。
// 想改语气、改措辞，改这里，不用碰编译逻辑。

export const PROMPT_SNIPPETS = {
  panelCount: 'The page is divided into {n} {panels}. {order}',
  textLock:
    'This page has exactly {panels} panel(s) and exactly {texts} text element(s). Render ONLY the text listed below, with the exact wording given. Do NOT invent any additional dialogue, speech bubble, caption, sound effect or lettering, and do not fill empty space with text — any text that is not listed is an error.',
  bubbleRule:
    'Dialogue uses white speech bubbles with tails, thoughts use white cloud bubbles with no tail, and narration is bare lettering printed directly on the artwork with no bubble, no box and no background.',
  noLettering: 'This page contains NO lettering at all: no speech bubbles, no captions, no sound effects, no text of any kind.',
  boxPrefix: 'This box contains only:',
  panelInside: 'inside PANEL {n}',
  panelEdge: 'at the edge of PANEL {n}',
  placement: 'placed in the {area} area of the page',
  textVertical: 'vertical lettering, columns read right to left',
  textHorizontal: 'horizontal lettering',
};

/** 把 {name} 替换成值 */
export function fillSnippet(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (m, key) => (vars[key] !== undefined ? String(vars[key]) : m));
}
/** 聚合导出：types.mjs 用 prompts.xxx 访问 */
export const prompts = {
  panelShapes: PANEL_SHAPES,
  frameStyles: FRAME_STYLES,
  cameras: CAMERAS,
  stylePresets: STYLE_PRESETS,
  readingOrders: READING_ORDERS,
  bubbleTypes: BUBBLE_TYPES,
  tailDirections: TAIL_DIRECTIONS,
  snippets: PROMPT_SNIPPETS,
};