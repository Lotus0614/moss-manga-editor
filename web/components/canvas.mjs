// 画布：把每个 item 画成「带标签的框」。
//
// 不渲染真实气泡形状——标注清楚比画得像更重要：
//   分格：标签写「格 · 全景/矩形」，里面是画面描述
//   文字：标签写【旁白】【对话】…，里面是台词
// 框半透明，方便看清和底下生成图的区别。

import { html, useRef, useState, useEffect } from '../lib.mjs';

const MIN_SIZE = 40;
const SNAP = 6;

const BUBBLE_LABEL = {
  speech: '对话',
  shout: '喊叫',
  whisper: '小声',
  tremble: '颤抖',
  thought: '内心',
  heart: '心之声',
  narration: '旁白',
  sfx: '拟声词',
};

const CAMERA_LABEL = {
  eye: '平视',
  high: '俯视',
  low: '仰视',
  wide: '全景',
  medium: '中景',
  close: '特写',
  xclose: '大特写',
  ots: '过肩',
  dutch: '荷兰角',
};

const SHAPE_LABEL = {
  rect: '矩形',
  'slant-top': '斜切上',
  'slant-side': '斜切侧',
  'bleed-top': '出血上',
  'bleed-bottom': '出血下',
  'bleed-left': '出血左',
  'bleed-right': '出血右',
  'bleed-all': '满版',
  circle: '圆形',
};

function isVertical(page, item) {
  if (typeof item.vertical === 'boolean') return item.vertical;
  return page.vertical !== false;
}

/** 竖排：每列若干字，从右往左，整体居中 */
function verticalColumns(text, bbox, fs) {
  const [x1, y1, x2, y2] = bbox;
  const perCol = Math.max(1, Math.floor((y2 - y1 - fs) / (fs * 1.1)));
  const chars = [...String(text || '')];
  const cols = [];
  for (let i = 0; i < chars.length; i += perCol) cols.push(chars.slice(i, i + perCol));
  const step = fs * 1.1;
  const total = Math.max(1, cols.length) * step;
  const startX = (x1 + x2) / 2 + total / 2 - step / 2;
  const rows = Math.min(perCol, cols[0]?.length || 1);
  const startY = (y1 + y2) / 2 - (rows * step) / 2 + fs * 0.4;
  return cols.map((col, i) => ({ x: startX - i * step, y: startY, chars: col }));
}

/** 横排：按宽度折行，整体居中 */
function horizontalLines(text, bbox, fs) {
  const [x1, y1, x2, y2] = bbox;
  const perLine = Math.max(1, Math.floor((x2 - x1 - 12) / (fs * 1.02)));
  const lines = [];
  for (const raw of String(text || '').split('\n')) {
    const chars = [...raw];
    for (let i = 0; i < chars.length; i += perLine) lines.push(chars.slice(i, i + perLine).join(''));
    if (!chars.length) lines.push('');
  }
  const maxLines = Math.max(1, Math.floor((y2 - y1 - 24) / (fs * 1.35)));
  const shown = lines.slice(0, maxLines);
  const startY = (y1 + y2) / 2 - (shown.length * fs * 1.35) / 2 + fs;
  return shown.map((line, i) => ({ x: (x1 + x2) / 2, y: startY + i * fs * 1.35, text: line }));
}

function typeColor(name) {
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.codePointAt(0)) % 997;
  const hue = Math.round((hash * 137.508) % 360);
  return { fill: 'hsla(' + hue + ', 45%, 88%, 0.85)', stroke: 'hsl(' + hue + ', 40%, 42%)' };
}

function ItemBox({ item, page, index, selected, onSelect, onDragStart, onBegin }) {
  const [x1, y1, x2, y2] = item.bbox;
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  const isBubble = item.type === 'bubble';
  const isNative = item.type === 'native';
  const color = typeColor(item.type);

  const label = item.showLabel === false ? '' :
    isBubble
    ? `【${BUBBLE_LABEL[item.kind] || item.kind}】`
    : isNative
      ? `原生 · ${item.label}`
      : `格${index + 1} · ${CAMERA_LABEL[item.camera] || ''}${SHAPE_LABEL[item.shape] ? ` / ${SHAPE_LABEL[item.shape]}` : ''}`;

  const fs = isBubble ? Math.max(16, Math.min(Number(item.size) || 22, Math.min(w, h) / 2)) : Math.max(13, Math.min(w / 16, h / 5, 22));
  const body = isBubble ? item.text : isNative ? item.text || item.caption : item.caption;

  // 画布只做排版预览：文字一律横排显示，竖排设置只影响生成的提示词
  const vertical = false;
  const cols = vertical ? verticalColumns(body, item.bbox, fs) : [];
  const rows = !vertical ? horizontalLines(body, item.bbox, fs) : [];

  return html`<g>
    <rect
      style=${'fill:' + color.fill + ';stroke:' + color.stroke}
      class=${`item-box ${item.type} ${selected ? 'sel' : ''}`}
      x=${x1}
      y=${y1}
      width=${w}
      height=${h}
      rx=${isNative ? 2 : 0}
    />
    ${isBubble
      ? html`<text class="item-tag bubble" x=${x1 + 5} y=${y1 + 13}>${label}</text>`
      : html`<text class="item-tag" x=${x1 + 5} y=${y1 + 13}>${label}</text>`}
    ${vertical
      ? cols.map((col) => html`<text class="item-text" x=${col.x} y=${col.y} font-size=${fs} text-anchor="middle">
          ${col.chars.map((ch, i) => html`<tspan x=${col.x} dy=${i === 0 ? 0 : fs * 1.1}>${ch}</tspan>`)}
        </text>`)
      : rows.map((row) => html`<text class="item-text" x=${row.x} y=${row.y} font-size=${fs} text-anchor="middle">${row.text}</text>`)}
    ${isNative ? html`<text class="item-tag" x=${x1 + 5} y=${y2 - 6}>native · ${item.caption?.slice(0, 30) || ''}</text>` : null}
    <rect
      x=${x1}
      y=${y1}
      width=${w}
      height=${h}
      fill="transparent"
      style="cursor:move"
      onPointerDown=${(e) => {
        e.stopPropagation();
        onBegin?.();
        onSelect?.({ kind: item.type, id: item.id });
        onDragStart?.(e, item.id, 'move');
      }}
    />
  </g>`;
}

export default function Canvas({ page, image, imageOpacity = 1, showBoxes = true, grid = 4, scale, selection, onSelect, onBegin, onChange, onCommit }) {
  const [W, H] = page.size;
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [guides, setGuides] = useState([]);

  function pointOf(event) {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
  }

  function edges() {
    const xs = [0, W / 2, W];
    const ys = [0, H / 2, H];
    for (const item of page.items) {
      xs.push(item.bbox[0], item.bbox[2]);
      ys.push(item.bbox[1], item.bbox[3]);
    }
    return { xs, ys };
  }

  function snap(value, candidates) {
    let best = value;
    let dist = SNAP + 1;
    for (const c of candidates) {
      const d = Math.abs(value - c);
      if (d < dist) {
        dist = d;
        best = c;
      }
    }
    return dist <= SNAP ? best : value;
  }

  function startDrag(event, id, mode) {
    const item = page.items.find((it) => it.id === id);
    if (!item) return;
    dragRef.current = { id, mode, start: pointOf(event), origin: [...item.bbox], moved: false };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function onMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const pt = pointOf(event);
    const dx = pt.x - drag.start.x;
    const dy = pt.y - drag.start.y;
    const [x1, y1, x2, y2] = drag.origin;
    let bbox;
    const { xs, ys } = edges();

    if (drag.mode === 'move') {
      bbox = [x1 + dx, y1 + dy, x2 + dx, y2 + dy];
      const sx = snap(bbox[0], xs);
      const sy = snap(bbox[1], ys);
      const ox = sx - bbox[0];
      const oy = sy - bbox[1];
      bbox = [bbox[0] + ox, bbox[1] + oy, bbox[2] + ox, bbox[3] + oy];
      setGuides(
        Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5
          ? [
              ...(Math.abs(ox) > 0.5 ? [{ x: sx, y1: 0, y2: H }] : []),
              ...(Math.abs(oy) > 0.5 ? [{ y: sy, x1: 0, x2: W }] : []),
            ]
          : []
      );
    } else {
      bbox = [...drag.origin];
      if (drag.mode.includes('w')) bbox[0] = x1 + dx;
      if (drag.mode.includes('e')) bbox[2] = x2 + dx;
      if (drag.mode.includes('n')) bbox[1] = y1 + dy;
      if (drag.mode.includes('s')) bbox[3] = y2 + dy;
      if (bbox[2] - bbox[0] < MIN_SIZE) {
        if (drag.mode.includes('w')) bbox[0] = bbox[2] - MIN_SIZE;
        else bbox[2] = bbox[0] + MIN_SIZE;
      }
      if (bbox[3] - bbox[1] < MIN_SIZE) {
        if (drag.mode.includes('n')) bbox[1] = bbox[3] - MIN_SIZE;
        else bbox[3] = bbox[1] + MIN_SIZE;
      }
    }

    drag.moved = true;
    const step = Math.max(1, Number(grid) || 4);
    onChange(drag.id, bbox.map((v) => Math.round(v / step) * step));
  }


  function onUp() {
    const drag = dragRef.current;
    window.removeEventListener('pointermove', onMove);
    setGuides([]);
    dragRef.current = null;
    if (drag?.moved) onCommit?.();
  }

  useEffect(() => () => window.removeEventListener('pointermove', onMove), []);

  const handles = (bbox) => {
    const [x1, y1, x2, y2] = bbox;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    return [
      ['nw', x1, y1],
      ['n', mx, y1],
      ['ne', x2, y1],
      ['e', x2, my],
      ['se', x2, y2],
      ['s', mx, y2],
      ['sw', x1, y2],
      ['w', x1, my],
    ];
  };

  const selectedItem = selection ? page.items.find((it) => it.id === selection.id) : null;
  const panelIndex = (item) => page.items.filter((it) => it.type === 'panel').findIndex((it) => it.id === item.id);

  return html`<div class="page-frame">
    <div class="paper" style=${`width:${W * scale}px;height:${H * scale}px`}>
      <svg
        ref=${svgRef}
        viewBox=${`0 0 ${W} ${H}`}
        width=${W * scale}
        height=${H * scale}
        onPointerDown=${() => onSelect?.(null)}
      >
        <rect x="0" y="0" width=${W} height=${H} fill="#ffffff" />
        ${image ? html`<image href=${image} x="0" y="0" width=${W} height=${H} preserveAspectRatio="xMidYMid slice" opacity=${imageOpacity} />` : null}

        ${showBoxes ? page.items.map((item, i) => html`<${ItemBox}
          key=${item.id}
          item=${item}
          page=${page}
          index=${item.type === 'panel' ? panelIndex(item) : i}
          selected=${selection?.id === item.id}
          onSelect=${onSelect}
          onBegin=${onBegin}
          onDragStart=${startDrag}
        />`) : null}

        ${guides.map((g) =>
          g.x !== undefined
            ? html`<line class="guide" x1=${g.x} y1=${g.y1} x2=${g.x} y2=${g.y2} />`
            : html`<line class="guide" x1=${g.x1} y1=${g.y} x2=${g.x2} y2=${g.y} />`
        )}

        ${showBoxes && selectedItem
          ? handles(selectedItem.bbox).map(
              ([mode, x, y]) =>
                html`<rect
                  class=${`handle ${mode}`}
                  x=${x - 6}
                  y=${y - 6}
                  width="12"
                  height="12"
                  onPointerDown=${(e) => {
                    e.stopPropagation();
                    startDrag(e, selectedItem.id, mode);
                  }}
                />`
            )
          : null}
      </svg>
    </div>
  </div>`;
}
