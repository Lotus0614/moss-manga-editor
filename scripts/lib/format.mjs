// 终端输出格式：人看的紧凑文本，AI 用 --json。

export function pageOutline(page) {
  const lines = [];
  const head = `第 ${page.index} 页${page.title ? ` · ${page.title}` : ''}  ${page.size[0]}×${page.size[1]}  rev ${page.rev}`;
  lines.push(head);
  lines.push(`阅读 ${page.reading === 'rtl' ? '右→左' : '左→右'} · 画风 ${page.style}${page.scene ? ` · 场景 ${page.scene}` : ''}`);
  if (!page.panels.length) lines.push('（还没有分格）');
  page.panels.forEach((panel, i) => {
    const [x1, y1, x2, y2] = panel.bbox;
    const caption = panel.caption ? panel.caption.slice(0, 48) : '（未写描述）';
    lines.push(`  格${i + 1} ${panel.id} [${x1},${y1},${x2},${y2}] ${panel.shape}/${panel.camera}  ${caption}`);
  });
  page.bubbles.forEach((bubble, i) => {
    const [x1, y1, x2, y2] = bubble.bbox;
    const text = bubble.text.replace(/\n/g, '⏎').slice(0, 40);
    lines.push(`  字${i + 1} ${bubble.id} [${x1},${y1},${x2},${y2}] ${bubble.type}${bubble.vertical ? '' : ' 横排'}  「${text}」`);
  });
  if (page.note) lines.push(`  备注：${page.note.slice(0, 80)}`);
  return lines.join('\n');
}

export function projectOutline(project, pages) {
  const lines = [`${project.name}（${project.slug}）  画布 ${project.size}  ${pages.length} 页`];
  const characters = project.bible?.characters || [];
  if (characters.length) {
    lines.push(`人物 ${characters.map((c) => c.code || c.name).join('、')}`);
  }
  if (project.bible?.scene) lines.push(`共用场景：${project.bible.scene}`);
  for (const page of pages) {
    lines.push(`  第 ${page.index} 页 ${page.id}  ${page.panels}格 ${page.bubbles}字${page.title ? ` · ${page.title}` : ''}`);
  }
  return lines.join('\n');
}

export function warningsText(warnings, limit = 8) {
  if (!warnings?.length) return '校验：通过（0 条提醒）';
  const errors = warnings.filter((w) => w.level === 'error');
  const warns = warnings.filter((w) => w.level === 'warn');
  const lines = [`校验：${errors.length} 个错误 / ${warns.length} 个提醒`];
  for (const w of warnings.slice(0, limit)) {
    lines.push(`  [${w.level === 'error' ? '错误' : '提醒'}] ${w.code} ${w.message}`);
  }
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
  if (op.op === 'create') return '新建页面';
  if (op.op === 'add') {
    const tail = op.text ? `「${op.text}」` : op.caption ? ` ${op.caption}` : '';
    return `+ ${op.target === 'bubble' ? '文字' : '格'} ${op.id} [${(op.bbox || []).join(',')}]${tail}`;
  }
  if (op.op === 'remove') return `- ${op.target === 'bubble' ? '文字' : '格'} ${op.id}`;
  if (op.op === 'bbox') return `~ ${op.target === 'bubble' ? '文字' : '格'} ${op.id} 位置 [${op.from.join(',')}] → [${op.to.join(',')}]`;
  if (op.op === 'text') return `~ 文字 ${op.id} 「${op.from}」→「${op.to}」`;
  if (op.op === 'page') return `~ 页.${op.field}：${op.from ?? '（空）'} → ${op.to ?? '（空）'}`;
  return `~ ${op.target} ${op.id} ${op.field}：${op.from} → ${op.to}`;
}
