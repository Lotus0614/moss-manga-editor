// Moss Layout JSON → 富文档（尽力而为）。
// 用途：导入别人给的 JSON、把历史版本还原成可编辑的页面。
// 形状与气泡类型靠 caption 里的关键词反推，猜不准的地方保留原 caption 到 notes。

import { createPage, createPanel, createBubble, fromMoss, pageSize, DEFAULT_SIZE } from './manga-doc.mjs';

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
 * @param {{width?:number,height?:number}} [size] 画布尺寸（Moss 输出里没有，必须外部给）
 */
export function decompile(input, size = DEFAULT_SIZE) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const pageSizeValue = {
    width: size.width || DEFAULT_SIZE.width,
    height: size.height || DEFAULT_SIZE.height,
  };
  const page = createPage({ size: pageSizeValue });
  page.summary.caption = doc.summary?.caption || '';
  page.summary.meta = Array.isArray(doc.summary?.meta) ? doc.summary.meta : [];
  page.panels = [];
  page.bubbles = [];
  page.versions = [];

  for (const item of doc.items || []) {
    const bbox = fromMoss(item.bbox, pageSizeValue);
    if (item.label === 'text') {
      page.bubbles.push(
        createBubble({
          type: guessBubbleType(item.caption),
          text: item.text || '',
          bbox,
          tailOff: /NO tail/i.test(item.caption || ''),
        })
      );
    } else {
      page.panels.push(
        createPanel({
          bbox,
          shape: guessShape(item.caption),
          caption: stripMeta(item.caption || ''),
          frame: /no border/i.test(item.caption || '') ? 'none' : 'border',
        })
      );
    }
  }

  page.notes = '由 Moss JSON 导入，形状与气泡类型为自动推断，可能需要手动校正。';
  return page;
}

function guessShape(caption = '') {
  for (const [re, shape] of SHAPE_HINTS) if (re.test(caption)) return shape;
  return 'rect';
}

function guessBubbleType(caption = '') {
  for (const [re, type] of BUBBLE_HINTS) if (re.test(caption)) return type;
  return 'speech';
}

/** 去掉我们编译时加的句式前缀，留下人写的那部分 */
function stripMeta(caption) {
  const m = caption.match(/This box contains only:\s*([^,]+(?:,\s*(?!Black ink)[^,]+)*)/i);
  if (m) return m[1].trim();
  return caption
    .replace(/Black ink, white paper and grey screentone only, zero colour\.?/gi, '')
    .replace(/\s*,\s*$/,'')
    .trim();
}
