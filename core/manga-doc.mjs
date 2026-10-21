// 漫画页面文档（v3）：单层 items。
//
// 页面只有一串 items，每个 item 用 type 区分：
//   panel  —— 一个分格：坐标、形状、边框、机位、画面描述
//   bubble —— 一条文字：坐标、气泡类型、原文、排版
//   native —— 原生 Moss item：直接给 label/caption/text，绕过语义层（逃生口）
//
// 坐标一律「左上原点、绝对像素 [x1,y1,x2,y2]」；只有 toMoss() 做中心原点 yxyx 转换。
// 尺寸必须是 16 的倍数，W/2 与 H/2 才是整数。

export const GRID = 16;
export const DEFAULT_SIZE = [768, 1280];

export const SIZE_PRESETS = {
  page: { name: '分镜页 768×1280', size: [768, 1280], manga: true },
  'page-hd': { name: '分镜页高清 1152×1920', size: [1152, 1920], manga: true },
  square: { name: '方图 1024×1024', size: [1024, 1024], manga: false },
  wide: { name: '横版 1536×1024', size: [1536, 1024], manga: false },
};

export const ITEM_TYPES = ['panel', 'bubble', 'native'];

/** 面板形状 */
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

/** 全局竖排开关（页面级），单个 item 可用自己的 vertical 覆盖 */
export function isVertical(page, item) {
  if (typeof item?.vertical === 'boolean') return item.vertical;
  return page?.vertical !== false;
}

// ---------------------------------------------------------------- 坐标

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

// ---------------------------------------------------------------- item 工厂

export function createPanelItem(patch = {}) {
  return {
    type: 'panel',
    id: uid('pn'),
    bbox: [8, 8, 760, 420],
    shape: 'rect',
    frame: 'border',
    camera: 'medium',
    caption: '',
    ...patch,
  };
}

export function createBubbleItem(patch = {}) {
  return {
    type: 'bubble',
    id: uid('bb'),
    bbox: [40, 40, 240, 140],
    kind: 'speech',
    text: '',
    size: 22,
    tail: 'down-left',
    // vertical 不写 = 跟随页面全局
    ...patch,
  };
}

export function createNativeItem(patch = {}) {
  return {
    type: 'native',
    id: uid('nt'),
    bbox: [0, 0, 768, 1280],
    label: 'object',
    caption: '',
    ...patch,
  };
}

export function createItem(type = 'panel', patch = {}) {
  if (type === 'bubble') return createBubbleItem(patch);
  if (type === 'native') return createNativeItem(patch);
  return createPanelItem(patch);
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
    vertical: true,
    scene: '',
    note: '',
    items: [],
    ...patch,
  };
}

// ---------------------------------------------------------------- 归一化

function normalizeBubbleItem(b) {
  return {
    type: 'bubble',
    id: b.id || uid('bb'),
    bbox: b.bbox,
    kind: b.kind || b.bubbleType || 'speech',
    text: String(b.text || ''),
    size: Number(b.size || b.fontSize) || 22,
    tail: b.tail || (b.tailOff ? 'none' : b.tailDir) || 'down-left',
    ...(typeof b.vertical === 'boolean' ? { vertical: b.vertical } : {}),
  };
}

/** 兼容 v1/v2：panels + bubbles 两套数组会被合并进 items */
export function normalizePage(raw = {}) {
  const size = pageSize(raw);
  const style = typeof raw.style === 'string' ? raw.style : raw.style?.preset;

  let items = [];
  if (Array.isArray(raw.items)) {
    items = raw.items.map((it) => normalizeItem(it, size));
  } else {
    // v2 存档迁移
    for (const p of raw.panels || []) {
      items.push(
        normalizeItem(
          {
            type: 'panel',
            id: p.id,
            bbox: p.bbox,
            shape: p.shape,
            frame: p.frame,
            camera: p.camera,
            caption: p.caption,
          },
          size
        )
      );
    }
    for (const b of raw.bubbles || []) {
      items.push(
        normalizeItem(
          {
            type: 'bubble',
            id: b.id,
            bbox: b.bbox,
            kind: b.type || b.kind,
            text: b.text,
            size: b.size || b.fontSize,
            tail: b.tail || (b.tailOff ? 'none' : b.tailDir),
            vertical: b.vertical,
          },
          size
        )
      );
    }
  }

  const page = {
    id: raw.id || uid('pg'),
    index: Number(raw.index) || 1,
    title: String(raw.title || ''),
    rev: Number(raw.rev) || 0,
    size: [size.width, size.height],
    reading: READING_ORDERS[raw.reading || raw.readingOrder] ? raw.reading || raw.readingOrder : 'rtl',
    style: STYLE_PRESETS[style] ? style : 'mono',
    vertical: raw.vertical !== false,
    scene: String(raw.scene || ''),
    note: String(raw.note || ''),
    items,
  };
  return page;
}

function normalizeItem(raw = {}, size) {
  const type = ITEM_TYPES.includes(raw.type) ? raw.type : 'panel';
  const bbox = normalizeBbox(raw.bbox, size);
  if (type === 'bubble') return normalizeBubbleItem({ ...raw, bbox });
  if (type === 'native') {
    return {
      type: 'native',
      id: raw.id || uid('nt'),
      bbox,
      label: ['object', 'text', 'character'].includes(raw.label) ? raw.label : 'object',
      caption: String(raw.caption || ''),
      ...(raw.text ? { text: String(raw.text) } : {}),
    };
  }
  return {
    type: 'panel',
    id: raw.id || uid('pn'),
    bbox,
    shape: raw.shape || 'rect',
    frame: raw.frame || 'border',
    camera: raw.camera || 'medium',
    caption: String(raw.caption || ''),
  };
}

export function panelsOf(page) {
  return (page.items || []).filter((it) => it.type === 'panel');
}

export function bubblesOf(page) {
  return (page.items || []).filter((it) => it.type === 'bubble');
}

/** 阅读顺序：同一横带内先右后左（用于提示与自检） */
export function readingOrderOf(page) {
  const rtl = page.reading !== 'ltr';
  return [...panelsOf(page)].sort((a, b) => {
    if (Math.abs(a.bbox[1] - b.bbox[1]) > 24) return a.bbox[1] - b.bbox[1];
    return rtl ? b.bbox[0] - a.bbox[0] : a.bbox[0] - b.bbox[0];
  });
}
