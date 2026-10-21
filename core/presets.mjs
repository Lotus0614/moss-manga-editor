// 页型预设：一键套用版式。数值来自 Moss 模板《漫画生成技巧》附录 A.3，
// 全部按 768×1280 标定，其他尺寸按比例缩放。

import { createPanel, createBubble, pageSize } from './manga-doc.mjs';

const MARGIN = 8;
const GUTTER = 8;

/** 预设表：bands 为横带定义，每带可以是单格或左右二分 */
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
        // 带 1 全景
        [MARGIN, 0, w - MARGIN, 230],
        // 带 2 右（发生）
        [half + g / 2, 246, w - MARGIN, 470],
        // 带 2 左（反应）
        [MARGIN, 246, half - g / 2, 470],
        // 带 3 推进
        [MARGIN, 486, w - MARGIN, 720],
        // 带 4 大格落点
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
      // 满版主体
      [0, 0, w, h],
      // 左上嵌格
      [MARGIN, MARGIN, 250, 220],
      // 右下嵌格
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

/**
 * 把预设套到页面上：重置 panels，保留 bubbles（清掉失效的 panelId 引用）。
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
      name: `格${i + 1}`,
      bbox,
      shape: pickShape(preset.id, i),
      frame: preset.id === 'climax' && i === 0 ? 'none' : 'border',
      camera: autoCamera(preset.id, i, boxes.length),
    })
  );
  const validIds = new Set(panels.map((p) => p.id));
  return {
    ...page,
    panels,
    bubbles: (page.bubbles || [])
      .filter((b) => !b.panelId || validIds.has(b.panelId))
      .map((b) => ({ ...b, panelId: validIds.has(b.panelId) ? b.panelId : '' })),
  };
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

/**
 * 新建页面时的默认排版：三横带 + 两个占位气泡，让用户一进来就有东西可拖。
 */
export function seedPage(page) {
  const withPanels = applyPreset(page, 'band-3');
  const { width: w } = pageSize(withPanels);
  const [p1, p2] = withPanels.panels;
  const bubbles = [
    createBubble({
      type: 'narration',
      text: '每天早上八点十七分，我在同一节车厢里。',
      bbox: [Math.round(w * 0.08), p1.bbox[1] + 22, Math.round(w * 0.66), p1.bbox[1] + 88],
      fontSize: 20,
      vertical: false,
    }),
    createBubble({
      type: 'speech',
      text: '……今天也要，撑过去。',
      bbox: [Math.round(w * 0.46), p2.bbox[1] + 56, Math.round(w * 0.88), p2.bbox[1] + 196],
      panelId: p2.id,
      tailDir: 'down-left',
      fontSize: 22,
    }),
  ];
  return { ...withPanels, bubbles };
}
