// Moss Layout JSON → 富文档（尽力而为）。
// 用途：导入别人给的 JSON、从历史提示词还原成可编辑页面。
// 形状与气泡类型靠 caption 关键词反推，猜不准的地方写进 note。

import { createPage, createPanel, createBubble, fromMoss, normalizePage, DEFAULT_SIZE } from './manga-doc.mjs';

const SHAPE_HINTS = [
  [/full-bleed|covering the whole page/i, 'bleed-all'],
  [/bleeding off the (top)/i, 'bleed-top'],
  [/bleeding off the (bottom)/i, 'bleed-bottom'],
  [/bleeding off the (left)/i, 'bleed-left'],
  [/bleeding off the (right)/i, 'bleed-right'],
  [/circular/i, 'circle'],
  [/slanted top/i, 'slant-top'],
  [/slanted side|angled slanted/i, 'slant-side'],
];

const BUBBLE_HINTS = [
  [/jagged\s+explosive/i, 'shout'],
  [/cloud-shaped|scalloped/i, 'thought'],
  [/dashed/i, 'heart'],
  [/shaky\s+wavy/i, 'tremble'],
  [/three tiny circles/i, 'whisper'],
  [/sound effect/i, 'sfx'],
  [/narration|directly on the artwork/i, 'narration'],
];

/**
 * @param {string|object} input 单行 JSON 字符串或已解析对象
 * @param {[number,number]} [size] 画布尺寸（Moss 输出里没有，必须外部给）
 */
export function decompile(input, size = DEFAULT_SIZE) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const dims = Array.isArray(size) ? size : [size.width, size.height];
  const pageSizeValue = { width: dims[0] || DEFAULT_SIZE[0], height: dims[1] || DEFAULT_SIZE[1] };
  const page = createPage({ size: [pageSizeValue.width, pageSizeValue.height] });
  page.note = doc.summary?.caption || '';
  page.panels = [];
  page.bubbles = [];

  for (const item of doc.items || []) {
    const bbox = fromMoss(item.bbox, pageSizeValue);
    if (item.label === 'text') {
      const type = guessBubbleType(item.caption);
      page.bubbles.push(
        createBubble({
          type,
          text: item.text || '',
          bbox,
          tail: /NO tail/i.test(item.caption || '') ? 'none' : 'down-left',
        })
      );
    } else {
      page.panels.push(
        createPanel({
          bbox,
          shape: guessShape(item.caption),
          frame: /no border/i.test(item.caption || '') ? 'none' : 'border',
          caption: stripMeta(item.caption || ''),
        })
      );
    }
  }

  page.note = `${page.note}\n（由 Moss JSON 导入，形状与气泡类型为自动推断，需要手动校正。）`.trim();
  return normalizePage(page);
}

function guessShape(caption = '') {
  for (const [re, shape] of SHAPE_HINTS) if (re.test(caption)) return shape;
  return 'rect';
}

function guessBubbleType(caption = '') {
  for (const [re, type] of BUBBLE_HINTS) if (re.test(caption)) return type;
  return 'speech';
}

/** 去掉编译时加的句式前缀，留下人写的那部分 */
function stripMeta(caption) {
  const m = caption.match(/This box contains only:\s*(.+)$/i);
  if (m) {
    return m[1]
      .replace(/\s*,\s*Black ink[^,]*$/i, '')
      .replace(/\s*,\s*$/, '')
      .trim();
  }
  return caption
    .replace(/Black ink, white paper and grey screentone only, zero colour\.?/gi, '')
    .replace(/\s*,\s*$/, '')
    .trim();
}
