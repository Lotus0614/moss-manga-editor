// 漫画排版辅助函数：编号、定位、页面区域、排版方向。
//
// 只是可 import 的纯函数，不导出任何 ctx 对象——谁需要什么自己取。
// 换一套编号/定位规则，改这个文件就行。

/** 参与分镜编号的类型（按 role 标记，不认具体 key） */
export const panelsOf = (page, types = []) =>
  (page.items || []).filter((it) => {
    const t = types.find((x) => x.key === it.type);
    return (t?.role || (it.type === 'panel' ? 'panel' : 'item')) === 'panel';
  });

/** 阅读顺序排序：同一横带内先右后左（或相反），再上→下 */
export function readingOrder(page, types = []) {
  const rtl = page.reading !== 'ltr';
  return [...panelsOf(page, types)].sort((a, b) => {
    if (Math.abs(a.bbox[1] - b.bbox[1]) > 24) return a.bbox[1] - b.bbox[1];
    return rtl ? b.bbox[0] - a.bbox[0] : a.bbox[0] - b.bbox[0];
  });
}

/** 面板编号：在阅读顺序里的 1-based 序号；非面板返回 undefined */
export function panelNumber(page, item, types = []) {
  const list = readingOrder(page, types);
  const index = list.findIndex((p) => p.id === item.id);
  return index >= 0 ? index + 1 : undefined;
}

/** 文字落在哪个面板：完全在里面 / 压到边缘 */
export function locateInPanel(page, item, types = []) {
  const panels = panelsOf(page, types);
  const [bx1, by1, bx2, by2] = item.bbox;
  const cx = (bx1 + bx2) / 2;
  const cy = (by1 + by2) / 2;
  let chosen = null;
  let bestArea = 0;

  for (const p of panels) {
    const [x1, y1, x2, y2] = p.bbox;
    const inside = cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
    const ix = Math.min(bx2, x2) - Math.max(bx1, x1);
    const iy = Math.min(by2, y2) - Math.max(by1, y1);
    const area = ix > 0 && iy > 0 ? ix * iy : 0;
    if (inside) {
      chosen = p;
      break;
    }
    if (area > bestArea) {
      bestArea = area;
      chosen = p;
    }
  }
  if (!chosen) return '';
  const [x1, y1, x2, y2] = chosen.bbox;
  const fully = bx1 >= x1 - 2 && bx2 <= x2 + 2 && by1 >= y1 - 2 && by2 <= y2 + 2;
  const number = panelNumber(page, chosen, types);
  return (fully ? 'inside' : 'at the edge of') + ' PANEL ' + (number ?? '?');
}

/** 页面区域：九宫格描述 */
export function placementOf(page, bbox) {
  const [w, h] = page.size;
  const rx = (bbox[0] + bbox[2]) / 2 / w;
  const ry = (bbox[1] + bbox[3]) / 2 / h;
  const vertical = ry < 0.34 ? 'upper' : ry > 0.66 ? 'lower' : 'middle';
  const horizontal = rx < 0.34 ? 'left' : rx > 0.66 ? 'right' : 'centre';
  return vertical + ' ' + horizontal + ' area of the page';
}

/** 竖排 / 横排描述（不算列数字数，不提字号） */
export function textLayoutOf(page, item) {
  const vertical = typeof item.vertical === 'boolean' ? item.vertical : page.vertical !== false;
  return vertical ? 'vertical lettering, columns read right to left' : 'horizontal lettering';
}
