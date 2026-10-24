// 终端输出格式：人看的紧凑文本，AI 用 --json。

const TYPE_LABEL = { panel: '格', bubble: '字', native: '原生' };

export function pageOutline(page) {
  const lines = [];
  lines.push(`第 ${page.index} 页${page.title ? ` · ${page.title}` : ''}  ${page.size[0]}×${page.size[1]}  rev ${page.rev}`);
  lines.push(`画风 ${page.style} · 文字${page.vertical ? '竖排' : '横排'}${page.scene ? ` · 场景 ${page.scene}` : ''}`);
  if (!page.items?.length) lines.push('（还没有任何内容）');

  for (const item of page.items || []) {
    const [x1, y1, x2, y2] = item.bbox;
    const box = `[${x1},${y1},${x2},${y2}]`;
    if (item.type === 'panel') {
      const caption = (item.note || item.desc || item.caption || '（未写描述）').slice(0, 48);
      lines.push(`  格 ${item.id} ${box} ${item.shape}/${item.camera}  ${caption}`);
    } else if (item.type === 'bubble') {
      const text = (item.text || '').replace(/\n/g, '⏎').slice(0, 40);
      const dir = item.vertical === undefined ? '跟随' : item.vertical ? '竖' : '横';
      lines.push(`  字 ${item.id} ${box} ${item.kind}/${dir}  「${text}」`);
    } else {
      lines.push(`  原生 ${item.id} ${box} ${item.label}  ${(item.caption || '').slice(0, 40)}`);
    }
  }
  if (page.note) lines.push(`  备注：${page.note.slice(0, 80)}`);
  return lines.join('\n');
}

export function projectOutline(project, pages) {
  const lines = [`${project.name}（${project.slug}）  画布 ${project.size}  ${pages.length} 页`];
  for (const page of pages) {
    lines.push(`  第 ${page.index} 页 ${page.id}  ${page.items ?? 0} 项${page.title ? ` · ${page.title}` : ''}`);
  }
  return lines.join('\n');
}

export function warningsText(warnings, limit = 8) {
  if (!warnings?.length) return '校验：通过（0 条提醒）';
  const errors = warnings.filter((w) => w.level === 'error');
  const warns = warnings.filter((w) => w.level === 'warn');
  const lines = [`校验：${errors.length} 个错误 / ${warns.length} 个提醒`];
  for (const w of warnings.slice(0, limit)) lines.push(`  [${w.level === 'error' ? '错误' : '提醒'}] ${w.code} ${w.message}`);
  if (warnings.length > limit) lines.push(`  …还有 ${warnings.length - limit} 条`);
  return lines.join('\n');
}

export function table(rows, headers) {
  if (!rows.length) return '（空）';
  const widths = headers.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (cells) => cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

export function diffText(result) {
  if (!result.pages.length) return `自 rev ${result.since} 以来没有改动（当前 rev ${result.to}）`;
  const lines = [`变更：rev ${result.since} → ${result.to}`];
  for (const group of result.pages) {
    lines.push(`\n第 ${group.index ?? '?'} 页 ${group.page}（${group.project}）`);
    for (const op of group.ops) lines.push(`  ${describe(op)}`);
    if (group.warnings !== undefined) lines.push(`  校验：${group.warnings} 条提醒`);
  }
  return lines.join('\n');
}

function describe(op) {
  const who = TYPE_LABEL[op.target] || '项';
  if (op.op === 'create') return '新建页面';
  if (op.op === 'add') {
    const tail = op.text ? `「${op.text}」` : op.caption ? ` ${op.caption}` : '';
    return `+ ${who} ${op.id} [${(op.bbox || []).join(',')}]${tail}`;
  }
  if (op.op === 'remove') return `- ${who} ${op.id}`;
  if (op.op === 'bbox') return `~ ${who} ${op.id} 位置 [${op.from.join(',')}] → [${op.to.join(',')}]`;
  if (op.op === 'text') return `~ 文字 ${op.id}「${op.from}」→「${op.to}」`;
  if (op.op === 'page') return `~ 页.${op.field}：${op.from ?? '（空）'} → ${op.to ?? '（空）'}`;
  return `~ ${who} ${op.id} ${op.field}：${op.from} → ${op.to}`;
}
