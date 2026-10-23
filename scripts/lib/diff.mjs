// 语义化 diff：把「页面文件前后」压成一组可读操作。
// 页面是单层 items，所以按 id 对齐即可。

const PAGE_FIELDS = ['title', 'scene', 'note', 'style', 'size', 'vertical'];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function clip(value) {
  if (typeof value !== 'string') return value;
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

/**
 * @param {object|null} before 之前的页面（null = 新建）
 * @param {object} after 之后的页面
 */
export function diffPage(before, after) {
  if (!before) return [{ op: 'create', target: 'page', index: after?.index ?? null }];
  const ops = [];

  for (const field of PAGE_FIELDS) {
    if (!same(before[field], after[field])) {
      ops.push({ op: 'page', field, from: clip(before[field]), to: clip(after[field]) });
    }
  }

  diffItems(before.items, after.items, ops);
  return ops;
}

function diffItems(before = [], after = [], ops) {
  const oldMap = new Map((before || []).map((x) => [x.id, x]));
  const newMap = new Map((after || []).map((x) => [x.id, x]));

  for (const [id, item] of newMap) {
    if (!oldMap.has(id)) {
      const op = { op: 'add', target: item.type, id, bbox: item.bbox };
      if (item.type === 'bubble') {
        op.kind = item.kind;
        op.text = clip(item.text);
      } else if (item.caption) {
        op.caption = clip(item.caption);
      }
      ops.push(op);
    }
  }

  for (const [id] of oldMap) {
    if (!newMap.has(id)) ops.push({ op: 'remove', target: oldMap.get(id).type, id });
  }

  for (const [id, now] of newMap) {
    const prev = oldMap.get(id);
    if (!prev) continue;
    if (!same(prev.bbox, now.bbox)) ops.push({ op: 'bbox', target: now.type, id, from: prev.bbox, to: now.bbox });
    for (const key of Object.keys(now)) {
      if (key === 'id' || key === 'bbox' || key === 'type') continue;
      if (same(prev[key], now[key])) continue;
      ops.push({
        op: now.type === 'bubble' && key === 'text' ? 'text' : 'field',
        target: now.type,
        id,
        field: key,
        from: clip(prev[key]),
        to: clip(now[key]),
      });
    }
    // 被删掉的可选字段（tags / palette 等）也要算一次改动
    for (const key of Object.keys(prev)) {
      if (key === 'id' || key === 'bbox' || key === 'type') continue;
      if (key in now) continue;
      ops.push({ op: 'field', target: now.type, id, field: key, from: clip(prev[key]), to: undefined });
    }
  }
}

/** 一条操作的人话描述 */
export function describeOp(op) {
  const who = op.target === 'bubble' ? '文字' : op.target === 'panel' ? '格' : '原生项';
  if (op.op === 'create') return '新建页面';
  if (op.op === 'add') {
    const tail = op.text ? `「${op.text}」` : op.caption ? ` ${op.caption}` : '';
    return `+ ${who} ${op.id} [${(op.bbox || []).join(',')}]${tail}`;
  }
  if (op.op === 'remove') return `- ${who} ${op.id}`;
  if (op.op === 'bbox') return `~ ${who} ${op.id} 位置 [${op.from.join(',')}] → [${op.to.join(',')}]`;
  if (op.op === 'text') return `~ 文字 ${op.id}「${op.from}」→「${op.to}」`;
  if (op.op === 'page') return `~ 页.${op.field}: ${fmt(op.from)} → ${fmt(op.to)}`;
  return `~ ${who} ${op.id} ${op.field}: ${fmt(op.from)} → ${fmt(op.to)}`;
}

function fmt(value) {
  if (value === undefined) return '（空）';
  if (typeof value === 'string') return value || '（空）';
  return JSON.stringify(value);
}
