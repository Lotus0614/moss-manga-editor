// 画布：SVG 渲染分格与气泡，支持拖拽移动、八向缩放、吸附。
// 坐标全程使用文档坐标（左上原点、绝对像素），viewBox 就是画布尺寸。

import { html, useRef, useState, useEffect } from '../lib.mjs';

const MIN_SIZE = 32;
const SNAP = 6;

function shapeClip(shape, bbox) {
  const [x1, y1, x2, y2] = bbox;
  const w = x2 - x1;
  const h = y2 - y1;
  if (shape === 'slant-top') {
    return [[x1, y1 + h * 0.12], [x2, y1], [x2, y2], [x1, y2]];
  }
  if (shape === 'slant-side') {
    return [[x1, y1], [x1 + w * 0.86, y1], [x2, y2], [x1, y2]];
  }
  return null;
}

function starPoints(bbox, spikes = 12) {
  const [x1, y1, x2, y2] = bbox;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = (x2 - x1) / 2;
  const ry = (y2 - y1) / 2;
  const pts = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = (Math.PI * i) / spikes - Math.PI / 2;
    const k = i % 2 === 0 ? 1 : 0.82;
    pts.push([cx + Math.cos(angle) * rx * k, cy + Math.sin(angle) * ry * k]);
  }
  return pts;
}

const toPath = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';

/** 竖排文字：留出椭圆内切空间，从右往左排并整体居中 */
function verticalLines(text, bbox, fontSize) {
  const [x1, y1, x2, y2] = bbox;
  const insetX = Math.min((x2 - x1) * 0.16, fontSize * 1.6);
  const insetY = Math.min((y2 - y1) * 0.14, fontSize * 1.2);
  const usableH = Math.max(fontSize, y2 - y1 - insetY * 2);
  const perCol = Math.max(1, Math.floor(usableH / (fontSize * 1.1)));
  const chars = [...String(text || '')];
  const cols = [];
  for (let i = 0; i < chars.length; i += perCol) cols.push(chars.slice(i, i + perCol));
  const step = fontSize * 1.1;
  const totalW = Math.max(1, cols.length) * step;
  const centerX = (x1 + x2) / 2;
  const startX = centerX + totalW / 2 - step / 2;
  const centerY = (y1 + y2) / 2;
  const startY = centerY - (Math.min(perCol, cols[0]?.length || 1) * step) / 2 + fontSize * 0.35;
  return cols.map((col, i) => ({
    x: startX - i * step,
    y: startY,
    chars: col.slice(0, Math.floor((y2 - y1 - insetY) / step) + 1),
  }));
}

/** 横排文字：按框宽自动折行 */
function horizontalLines(text, bbox, fontSize) {
  const [x1, y1, x2, y2] = bbox;
  const usableW = Math.max(fontSize * 2, x2 - x1 - 10);
  const perLine = Math.max(1, Math.floor(usableW / (fontSize * 1.02)));
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const chars = [...raw];
    for (let i = 0; i < chars.length; i += perLine) out.push(chars.slice(i, i + perLine).join(''));
    if (!chars.length) out.push('');
  }
  const maxLines = Math.max(1, Math.floor((y2 - y1 - 8) / (fontSize * 1.3)));
  return out.slice(0, maxLines);
}

function Bubble({ bubble, selected, onSelect, onDragStart }) {
  const t = bubble.type || 'speech';
  const [x1, y1, x2, y2] = bubble.bbox;
  const fs = bubble.fontSize || 22;
  const bare = t === 'narration' || t === 'sfx';
  const dashed = t === 'heart';
  const wavy = t === 'tremble';
  const burst = t === 'shout';
  const cloud = t === 'thought';

  const common = {
    class: `bub-shape ${selected ? 'sel' : ''}`,
    onPointerDown: (e) => {
      e.stopPropagation();
      onSelect?.({ kind: 'bubble', id: bubble.id });
      onDragStart?.(e, 'bubble', bubble.id, 'move');
    },
  };

  let shape = null;
  if (!bare) {
    if (burst) {
      shape = html`<path ...${common} d=${toPath(starPoints(bubble.bbox))} />`;
    } else if (cloud) {
      shape = html`<g ...${{ onPointerDown: common.onPointerDown }}>
        <ellipse class=${common.class} cx=${(x1 + x2) / 2} cy=${(y1 + y2) / 2} rx=${(x2 - x1) / 2} ry=${(y2 - y1) / 2} />
        <ellipse
          class=${common.class}
          cx=${(x1 + x2) / 2}
          cy=${(y1 + y2) / 2}
          rx=${(x2 - x1) / 2 - fs * 0.35}
          ry=${(y2 - y1) / 2 - fs * 0.35}
          stroke-dasharray="5 4"
        />
      </g>`;
    } else {
      shape = html`<ellipse
        ...${common}
        cx=${(x1 + x2) / 2}
        cy=${(y1 + y2) / 2}
        rx=${(x2 - x1) / 2}
        ry=${(y2 - y1) / 2}
        stroke-dasharray=${wavy ? '3 3' : dashed ? '7 5' : 'none'}
      />`;
    }
  }

  const columns = bubble.vertical === false ? [] : verticalLines(bubble.text, bubble.bbox, fs);
  const rows = bubble.vertical === false ? horizontalLines(bubble.text, bubble.bbox, fs) : [];

  return html`<g>
    ${shape}
    <rect
      x=${x1}
      y=${y1}
      width=${x2 - x1}
      height=${y2 - y1}
      fill="transparent"
      style="cursor:move"
      onPointerDown=${(e) => {
        e.stopPropagation();
        onSelect?.({ kind: 'bubble', id: bubble.id });
        onDragStart?.(e, 'bubble', bubble.id, 'move');
      }}
    />
    ${bubble.vertical === false
      ? html`<text class="bub-text" x=${x1 + 6} y=${y1 + fs + 2} font-size=${fs}>
          ${rows.map((line, i) => html`<tspan x=${x1 + 6} dy=${i === 0 ? 0 : fs * 1.3}>${line}</tspan>`)}
        </text>`
      : columns.map(
          (col) => html`<text class="bub-text" x=${col.x} y=${col.y} font-size=${fs} text-anchor="middle">
            ${col.chars.map((ch, i) => html`<tspan x=${col.x} dy=${i === 0 ? 0 : fs * 1.1}>${ch}</tspan>`)}
          </text>`
        )}
  </g>`;
}

function Panel({ panel, index, selected, onSelect, onDragStart, hasImage }) {
  const [x1, y1, x2, y2] = panel.bbox;
  const bleed = String(panel.shape || '').startsWith('bleed');
  const clip = shapeClip(panel.shape, panel.bbox);
  const isCircle = panel.shape === 'circle';
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const boxClass = `pn-box ${bleed ? 'bleed' : ''} ${selected ? 'sel' : ''} ${hasImage ? 'overlay' : ''}`;

  return html`<g>
    ${clip
      ? html`<path class=${boxClass} d=${toPath(clip)} />`
      : isCircle
        ? html`<ellipse class=${boxClass} cx=${cx} cy=${cy} rx=${(x2 - x1) / 2} ry=${(y2 - y1) / 2} />`
        : html`<rect class=${boxClass} x=${x1} y=${y1} width=${x2 - x1} height=${y2 - y1} />`}
    <text class="pn-index" x=${x1 + 6} y=${y1 + 16}>${String(index + 1).padStart(2, '0')}${panel.camera ? ` · ${panel.camera}` : ''}</text>
    <rect
      x=${x1}
      y=${y1}
      width=${Math.max(0, x2 - x1)}
      height=${Math.max(0, y2 - y1)}
      fill="transparent"
      style="cursor:move"
      onPointerDown=${(e) => {
        e.stopPropagation();
        onSelect?.({ kind: 'panel', id: panel.id });
        onDragStart?.(e, 'panel', panel.id, 'move');
      }}
    />
  </g>`;
}

export default function Canvas({ page, scale, selection, onSelect, onChange, onCommit }) {
  const W = page.size.width;
  const H = page.size.height;
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [guides, setGuides] = useState([]);

  const currentVersion = (page.versions || []).find((v) => v.id === page.currentVersionId) || (page.versions || []).slice(-1)[0];

  function pointOf(event) {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    };
  }

  function edgesToSnap() {
    const xs = [0, W / 2, W];
    const ys = [0, H / 2, H];
    for (const p of page.panels) {
      xs.push(p.bbox[0], p.bbox[2]);
      ys.push(p.bbox[1], p.bbox[3]);
    }
    return { xs, ys };
  }

  function snapValue(value, candidates) {
    let best = value;
    let bestDist = SNAP + 1;
    for (const c of candidates) {
      const dist = Math.abs(value - c);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return bestDist <= SNAP ? best : value;
  }

  function startDrag(event, kind, id, mode) {
    const item = kind === 'panel' ? page.panels.find((p) => p.id === id) : page.bubbles.find((b) => b.id === id);
    if (!item) return;
    dragRef.current = {
      kind,
      id,
      mode,
      startPoint: pointOf(event),
      origin: [...item.bbox],
      moved: false,
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function onMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const pt = pointOf(event);
    const dx = pt.x - drag.startPoint.x;
    const dy = pt.y - drag.startPoint.y;
    const [x1, y1, x2, y2] = drag.origin;
    let bbox;
    const { xs, ys } = edgesToSnap();

    if (drag.mode === 'move') {
      bbox = [x1 + dx, y1 + dy, x2 + dx, y2 + dy];
      // 整块移动时让左边缘吸附
      const snappedX = snapValue(bbox[0], xs);
      const snappedY = snapValue(bbox[1], ys);
      const offX = snappedX - bbox[0];
      const offY = snappedY - bbox[1];
      bbox = [bbox[0] + offX, bbox[1] + offY, bbox[2] + offX, bbox[3] + offY];
      setGuides(
        Math.abs(offX) > 0.5 || Math.abs(offY) > 0.5
          ? [
              ...(Math.abs(offX) > 0.5 ? [{ x: snappedX, y1: 0, y2: H }] : []),
              ...(Math.abs(offY) > 0.5 ? [{ y: snappedY, x1: 0, x2: W }] : []),
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

    bbox = bbox.map((v) => Math.round(v));
    drag.moved = true;
    onChange(drag.kind, drag.id, bbox);
  }

  function onUp() {
    const drag = dragRef.current;
    window.removeEventListener('pointermove', onMove);
    setGuides([]);
    dragRef.current = null;
    if (drag?.moved) onCommit?.(drag.kind, drag.id);
  }

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onMove);
    },
    []
  );

  const handlesFor = (bbox) => {
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

  const selectedItem =
    selection?.kind === 'panel'
      ? page.panels.find((p) => p.id === selection.id)
      : selection?.kind === 'bubble'
        ? page.bubbles.find((b) => b.id === selection.id)
        : null;

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
        ${currentVersion?.image
          ? html`<image href=${currentVersion.image} x="0" y="0" width=${W} height=${H} preserveAspectRatio="xMidYMid slice" />`
          : null}

        <rect class="safe-line" x="8" y="8" width=${W - 16} height=${H - 16} />

        ${page.panels.map((panel, i) => html`<${Panel}
          key=${panel.id}
          panel=${panel}
          index=${i}
          hasImage=${Boolean(currentVersion?.image)}
          selected=${selection?.kind === 'panel' && selection.id === panel.id}
          onSelect=${onSelect}
          onDragStart=${startDrag}
        />`)}

        ${page.bubbles.map((bubble) => html`<${Bubble}
          key=${bubble.id}
          bubble=${bubble}
          selected=${selection?.kind === 'bubble' && selection.id === bubble.id}
          onSelect=${onSelect}
          onDragStart=${startDrag}
        />`)}

        ${guides.map((g) =>
          g.x !== undefined
            ? html`<line class="guide" x1=${g.x} y1=${g.y1} x2=${g.x} y2=${g.y2} />`
            : html`<line class="guide" x1=${g.x1} y1=${g.y} x2=${g.x2} y2=${g.y} />`
        )}

        ${selectedItem
          ? handlesFor(selectedItem.bbox).map(
              ([mode, x, y]) =>
                html`<rect
                  class=${`handle ${mode}`}
                  x=${x - 4}
                  y=${y - 4}
                  width="8"
                  height="8"
                  onPointerDown=${(e) => {
                    e.stopPropagation();
                    startDrag(e, selection.kind, selection.id, mode);
                  }}
                />`
            )
          : null}
      </svg>
    </div>
  </div>`;
}
