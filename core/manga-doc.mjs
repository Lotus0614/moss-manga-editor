// 漫画页面文档模型（v2 薄语义层）。
//
// 这是存档里唯一可编辑的页面格式，Moss JSON 永远由 core/compile.mjs 现算。
// 坐标系：文档内一律「左上原点、绝对像素 [x1,y1,x2,y2]」；
// 只有 toMoss() 做中心原点 yxyx 转换，别在别处再写一遍。
//
// 尺寸必须是 16 的正整数倍，W/2 与 H/2 才是整数，换算不会丢精度。

export const GRID = 16;

/** 分镜页固定竖版；其余尺寸仅供单图/横版项目使用 */
export const SIZE_PRESETS = {
  page: { name: '分镜页 768×1280', size: [768, 1280], manga: true },
  'page-hd': { name: '分镜页高清 1152×1920', size: [1152, 1920], manga: true },
  square: { name: '方图 1024×1024', size: [1024, 1024], manga: false },
  wide: { name: '横版 1536×1024', size: [1536, 1024], manga: false },
};

export const DEFAULT_SIZE = [768, 1280];

export const PANEL_SHAPES = {
  rect: { name: '矩形', phrase: 'rectangular panel with straight edges', clip: { kind: 'rect' } },
  'slant-top': {
    name: '斜切上边',
    phrase: 'trapezoid panel with a slanted top edge cutting diagonally',
    clip: { kind: 'poly', points: [[0, 0.12], [1, 0], [1, 1], [0, 1]] },
  },
  'slant-side': {
    name: '斜切侧边',
    phrase: 'panel with a sharply angled slanted side edge',
    clip: { kind: 'poly', points: [[0, 0], [0.86, 0], [1, 1], [0, 1]] },
  },
  'bleed-top': { name: '出血·上', phrase: 'panel bleeding off the TOP edge of the page, no border', clip: { kind: 'rect' } },
  'bleed-bottom': { name: '出血·下', phrase: 'panel bleeding off the BOTTOM edge of the page, no border', clip: { kind: 'rect' } },
  'bleed-left': { name: '出血·左', phrase: 'panel bleeding off the LEFT edge of the page, no border', clip: { kind: 'rect' } },
  'bleed-right': { name: '出血·右', phrase: 'panel bleeding off the RIGHT edge of the page, no border', clip: { kind: 'rect' } },
  'bleed-all': {
    name: '满版',
    phrase: 'full-bleed panel covering the whole page, no border, artwork running off all four edges',
    clip: { kind: 'rect' },
  },
  circle: { name: '圆形', phrase: 'circular panel with a clean round border', clip: { kind: 'ellipse' } },
};

export const FRAME_STYLES = {
  border: { name: '描边', phrase: 'crisp black panel border with a white gutter around it' },
  none: { name: '无边', phrase: 'no border, artwork fills the panel edge to edge' },
  thick: { name: '粗边', phrase: 'heavy black panel border' },
};

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
    phrase:
      'MANGA LINEART ONLY, clean black ink lines on pure white, no screentone, no shading fills, no colour at all.',
    guard: 'Black ink on white only, zero tone, zero colour.',
  },
};

export const READING_ORDERS = {
  rtl: { name: '右 → 左（日式）', phrase: 'Panels are read RIGHT to LEFT, top to bottom.' },
  ltr: { name: '左 → 右（西式）', phrase: 'Panels are read LEFT to RIGHT, top to bottom.' },
};

// ---------------------------------------------------------------- 基础工具

let seq = 0;
export function uid(prefix = 'id') {
  seq = (seq + 1) % 100000;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function now() {
  return new Date().toISOString();
}

export function isGrid(value, grid = GRID) {
  return Number.isInteger(value) && value % grid === 0;
}

export function pageSize(page) {
  const raw = page?.size;
  if (Array.isArray(raw)) {
    const [w, h] = raw;
    if (isGrid(w) && isGrid(h)) return { width: w, height: h };
  } else if (raw && typeof raw === 'object') {
    if (isGrid(raw.width) && isGrid(raw.height)) return { width: raw.width, height: raw.height };
  }
  return { width: DEFAULT_SIZE[0], height: DEFAULT_SIZE[1] };
}

// ---------------------------------------------------------------- 坐标换算

/**
 * 文档坐标 → Moss 坐标（中心原点，yxyx）。全项目唯一实现。
 * @param {number[]} bbox [x1,y1,x2,y2]
 * @param {{width:number,height:number}} size
 * @returns {number[]} [y_min-H/2, x_min-W/2, y_max-H/2, x_max-W/2]
 */
export function toMoss(bbox, size) {
  const [x1, y1, x2, y2] = bbox;
  const dx = size.width / 2;
  const dy = size.height / 2;
  const l = Math.floor(Math.min(x1, x2));
  const t = Math.floor(Math.min(y1, y2));
  const r = Math.ceil(Math.max(x1, x2));
  const b = Math.ceil(Math.max(y1, y2));
  return [t - dy, l - dx, b - dy, r - dx];
}

/** Moss 坐标 → 文档坐标（导入用） */
export function fromMoss(mossBbox, size) {
  const [a, c, d, e] = mossBbox;
  const dx = size.width / 2;
  const dy = size.height / 2;
  return [c + dx, a + dy, e + dx, d + dy];
}

export function normalizeBbox(bbox, size = { width: DEFAULT_SIZE[0], height: DEFAULT_SIZE[1] }) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return [0, 0, size.width, size.height];
  const nums = bbox.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
  const [x1, y1, x2, y2] = nums;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

export function bboxArea(bbox) {
  const [x1, y1, x2, y2] = bbox;
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

export function bboxCenter(bbox) {
  const [x1, y1, x2, y2] = bbox;
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

export function bboxIntersects(a, b, pad = 0) {
  return a[0] < b[2] - pad && a[2] > b[0] + pad && a[1] < b[3] - pad && a[3] > b[1] + pad;
}

// ---------------------------------------------------------------- 工厂函数

export function createPanel(patch = {}) {
  return {
    id: uid('pn'),
    bbox: [8, 8, 760, 420],
    shape: 'rect',
    frame: 'border',
    camera: 'medium',
    caption: '',
    ...patch,
  };
}

export function createBubble(patch = {}) {
  return {
    id: uid('bb'),
    type: 'speech',
    text: '',
    bbox: [40, 40, 240, 140],
    vertical: true,
    size: 22,
    tail: 'down-left',
    ...patch,
  };
}

export function createPage(patch = {}) {
  const size = Array.isArray(patch.size) ? patch.size : DEFAULT_SIZE;
  return {
    id: uid('pg'),
    index: 1,
    title: '',
    rev: 0,
    size,
    reading: 'rtl',
    style: 'mono',
    scene: '',
    note: '',
    panels: [],
    bubbles: [],
    ...patch,
  };
}

/**
 * 补齐缺失字段，容忍手改坏的 JSON，同时兼容 v1 存档（size 对象、fontSize、tailOff）。
 */
export function normalizePage(raw = {}) {
  const size = pageSize(raw);
  const style = typeof raw.style === 'string' ? raw.style : raw.style?.preset;
  const page = {
    id: raw.id || uid('pg'),
    index: Number(raw.index) || 1,
    title: String(raw.title || ''),
    rev: Number(raw.rev) || 0,
    size: [size.width, size.height],
    reading: READING_ORDERS[raw.reading || raw.readingOrder] ? raw.reading || raw.readingOrder : 'rtl',
    style: STYLE_PRESETS[style] ? style : 'mono',
    scene: String(raw.scene || ''),
    note: String(raw.note || raw.summary?.caption || ''),
    panels: (Array.isArray(raw.panels) ? raw.panels : []).map((p) => ({
      id: p.id || uid('pn'),
      bbox: normalizeBbox(p.bbox, size),
      shape: p.shape || 'rect',
      frame: p.frame || 'border',
      camera: p.camera || 'medium',
      caption: String(p.caption || ''),
    })),
    bubbles: (Array.isArray(raw.bubbles) ? raw.bubbles : []).map((b) => ({
      id: b.id || uid('bb'),
      type: b.type || 'speech',
      text: String(b.text || ''),
      bbox: normalizeBbox(b.bbox, size),
      vertical: b.vertical !== false,
      size: Number(b.size || b.fontSize) || 22,
      tail: b.tail || (b.tailOff ? 'none' : b.tailDir) || 'down-left',
    })),
  };
  if (!READING_ORDERS[page.reading]) page.reading = 'rtl';
  return page;
}

/** 阅读顺序：同一横带内先右后左 */
export function readingOrderOf(page) {
  const rtl = page.reading !== 'ltr';
  return [...page.panels].sort((a, b) => {
    const ay = a.bbox[1];
    const by = b.bbox[1];
    if (Math.abs(ay - by) > 24) return ay - by;
    return rtl ? b.bbox[0] - a.bbox[0] : a.bbox[0] - b.bbox[0];
  });
}
