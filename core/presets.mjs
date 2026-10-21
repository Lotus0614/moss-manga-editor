// 页型预设：一键套用版式。数值按 768×1280 标定，其它尺寸按比例换算。

import { createPanel, createBubble, pageSize } from './manga-doc.mjs';

const MARGIN = 8;
const GUTTER = 8;

export const LAYOUT_PRESETS = [
  {
    id: 'band-3',
    name: '三横带（叙事页）',
    hint: '最稳的叙事页，一格一事',
    build: (w, h) => {
      const g = GUTTER;
      const bandH = Math.round((h - MARGIN * 2 - g * 2) / 3);
      return [
        [MARGIN, MARGIN, w - MARGIN, MARGIN + bandH],
        [MARGIN, MARGIN + bandH + g, w - MARGIN, MARGIN + bandH * 2 + g],
        [MARGIN, MARGIN + bandH * 2 + g * 2, w - MARGIN, h - MARGIN],
      ];
    },
  },
  {
    id: 'band-4',
    name: '四横带（推进页）',
    hint: '事件推进，节奏偏快',
    build: (w, h) => {
      const g = GUTTER;
      const bandH = Math.round((h - MARGIN * 2 - g * 3) / 4);
      return [0, 1, 2, 3].map((i) => [
        MARGIN,
        MARGIN + i * (bandH + g),
        w - MARGIN,
        i === 3 ? h - MARGIN : MARGIN + i * (bandH + g) + bandH,
      ]);
    },
  },
  {
    id: 'daily-5',
    name: '日常页 5 带（含左右二分）',
    hint: '带 2 右格写发生、左格写反应',
    build: (w, h) => {
      const half = Math.round(w / 2);
      const g = GUTTER;
      return [
        [MARGIN, 0, w - MARGIN, 230],
        [half + g / 2, 246, w - MARGIN, 470],
        [MARGIN, 246, half - g / 2, 470],
        [MARGIN, 486, w - MARGIN, 720],
        [MARGIN, 736, w - MARGIN, h],
      ];
    },
  },
  {
    id: 'split-2x2',
    name: '四宫格',
    hint: '对话密集的对峙页',
    build: (w, h) => {
      const g = GUTTER;
      const halfW = Math.round((w - MARGIN * 2 - g) / 2);
      const halfH = Math.round((h - MARGIN * 2 - g) / 2);
      return [
        [MARGIN, MARGIN, MARGIN + halfW, MARGIN + halfH],
        [MARGIN + halfW + g, MARGIN, w - MARGIN, MARGIN + halfH],
        [MARGIN, MARGIN + halfH + g, MARGIN + halfW, h - MARGIN],
        [MARGIN + halfW + g, MARGIN + halfH + g, w - MARGIN, h - MARGIN],
      ];
    },
  },
  {
    id: 'climax',
    name: '高潮页（满版 + 嵌格）',
    hint: '冲击页：一整张满版，两个角部嵌格',
    build: (w, h) => [
      [0, 0, w, h],
      [MARGIN, MARGIN, 250, 220],
      [w - 260, h - 220, w - MARGIN, h - MARGIN],
    ],
  },
  {
    id: 'single',
    name: '整页一张',
    hint: '单张插画 / 封面',
    build: (w, h) => [[0, 0, w, h]],
  },
];

export const LAYOUT_BY_ID = Object.fromEntries(LAYOUT_PRESETS.map((p) => [p.id, p]));
export const PRESET_IDS = LAYOUT_PRESETS.map((p) => p.id);

/**
 * 套用预设：重置 panels，清掉失效的气泡归属。
 * @param {object} page
 * @param {string} presetId
 */
export function applyPreset(page, presetId) {
  const preset = LAYOUT_BY_ID[presetId];
  if (!preset) return page;
  const { width: w, height: h } = pageSize(page);
  const boxes = preset.build(w, h);
  const panels = boxes.map((bbox, i) =>
    createPanel({
      bbox,
      shape: pickShape(preset.id, i),
      frame: preset.id === 'climax' && i === 0 ? 'none' : 'border',
      camera: autoCamera(preset.id, i, boxes.length),
    })
  );
  return { ...page, panels, bubbles: page.bubbles || [] };
}

function pickShape(presetId, index) {
  if (presetId === 'climax' && index === 0) return 'bleed-all';
  if (presetId === 'band-4' && index === 0) return 'slant-top';
  return 'rect';
}

function autoCamera(presetId, index, total) {
  if (presetId === 'climax') return index === 0 ? 'wide' : 'close';
  if (index === 0) return 'wide';
  if (index === total - 1) return 'close';
  return 'medium';
}

/** 新建页的默认内容：套版式 + 两条示例文字（面板少于两格时也能用） */
export function seedPage(page, presetId = 'band-3') {
  const withPanels = applyPreset(page, presetId);
  const { width: w } = pageSize(withPanels);
  const panels = withPanels.panels;
  if (!panels.length) return withPanels;

  const first = panels[0];
  const second = panels[1] || panels[0];
  const bubbles = [
    createBubble({
      type: 'narration',
      text: '每天早上八点十七分，我在同一节车厢里。',
      bbox: [Math.round(w * 0.08), first.bbox[1] + 22, Math.round(w * 0.66), first.bbox[1] + 88],
      size: 20,
      vertical: false,
    }),
    createBubble({
      type: 'speech',
      text: '……今天也要，撑过去。',
      bbox: [Math.round(w * 0.46), second.bbox[1] + 56, Math.round(w * 0.88), second.bbox[1] + 196],
      tail: 'down-left',
      size: 22,
    }),
  ];
  return { ...withPanels, bubbles };
}
