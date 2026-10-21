// 语义化 diff：把「页面文件前后」压成一组可读操作。
// 不产生 diff 文件，只在 journal 里记一条；AI 用 `manga changes` 读。

const PAGE_FIELDS = ['title', 'scene', 'note', 'reading', 'style', 'size'];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function clip(value) {
  if (typeof value !== 'string') return value;
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

/**
 * @param {object|null} before 之前的页面（null = 新建）
 * @param {object} after 之后的页面
 * @returns {Array<object>} 操作列表
 */
export function diffPage(before, after) {
  if (!before) return [{ op: 'create', target: 'page', index: after?.index ?? null }];
  const ops = [];

  for (const field of PAGE_FIELDS) {
    if (!same(before[field], after[field])) {
      ops.push({ op: 'page', field, from: clip(before[field]), to: clip(after[field]) });
    }
  }

  diffItems('panel', before.panels, after.panels, ops);
  diffItems('bubble', before.bubbles, after.bubbles, ops);
  return ops;
}

function diffItems(target, before = [], after = [], ops) {
  const oldMap = new Map((before || []).map((x) => [x.id, x]));
  const newMap = new Map((after || []).map((x) => [x.id, x]));

  for (const [id, item] of newMap) {
    if (!oldMap.has(id)) {
      const op = { op: 'add', target, id, bbox: item.bbox };
      if (target === 'bubble') {
        op.type = item.type;
        op.text = clip(item.text);
      } else if (item.caption) {
        op.caption = clip(item.caption);
      }
      ops.push(op);
    }
  }

  for (const [id] of oldMap) {
    if (!newMap.has(id)) ops.push({ op: 'remove', target, id });
  }

  for (const [id, now] of newMap) {
    const prev = oldMap.get(id);
    if (!prev) continue;
    if (!same(prev.bbox, now.bbox)) {
      ops.push({ op: 'bbox', target, id, from: prev.bbox, to: now.bbox });
    }
    for (const key of Object.keys(now)) {
      if (key === 'id' || key === 'bbox') continue;
      if (same(prev[key], now[key])) continue;
      const isText = target === 'bubble' && key === 'text';
      ops.push({
        op: isText ? 'text' : 'field',
        target,
        id,
        field: key,
        from: clip(prev[key]),
        to: clip(now[key]),
      });
    }
  }
}

/** 一条操作的人话描述，CLI 默认输出用 */
export function describeOp(op) {
  const who = op.target === 'bubble' ? '文字' : op.target === 'panel' ? '格' : '页';
  if (op.op === 'create') return '新建页面';
  if (op.op === 'add') {
    const tail = op.op === 'add' && op.text ? `「${op.text}」` : op.caption ? ` ${op.caption}` : '';
    return `+ ${who} ${op.id} [${(op.bbox || []).join(',')}]${tail}`;
  }
  if (op.op === 'remove') return `- ${who} ${op.id}`;
  if (op.op === 'bbox') return `~ ${who} ${op.id} 位置 [${op.from.join(',')}] → [${op.to.join(',')}]`;
  if (op.op === 'text') return `~ 文字 ${op.id} 「${op.from}」→「${op.to}」`;
  if (op.op === 'page') return `~ 页.${op.field}: ${fmt(op.from)} → ${fmt(op.to)}`;
  return `~ ${who} ${op.id} ${op.field}: ${fmt(op.from)} → ${fmt(op.to)}`;
}

function fmt(value) {
  if (value === undefined) return '（空）';
  if (typeof value === 'string') return value || '（空）';
  return JSON.stringify(value);
}
