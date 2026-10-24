// 角色表：项目里的人物设定只在这里解释。
//
// 约定（唯一出处）：
//   project.characters = [{ id: 'reina', name: 'Reina', look: '18, long black hair, ...' }]
//   page.items[] 里 type = 'character' 的项只存 ref + caption（+ bbox），不存外貌。
//
// config/manga.mjs 不认识这个结构：它只拿到一个 resolveCharacter(ref) 回调，
// 提示词怎么拼是 config 的事，数据从哪来是这里的事。

/** 项目角色表（永远返回数组） */
export function projectCharacters(project) {
  return Array.isArray(project?.characters) ? project.characters : [];
}

/** 按 id 找角色，找不到返回 null */
export function characterById(project, id) {
  if (!id) return null;
  return projectCharacters(project).find((char) => char.id === id) || null;
}

/** 本页用到的角色 id（去重，按出场顺序）——给 UI 做"本页角色"勾选用 */
export function characterRefsOfPage(page) {
  const seen = new Set();
  const ids = [];
  for (const item of page?.items || []) {
    if (item.type !== 'character' || !item.ref || seen.has(item.ref)) continue;
    seen.add(item.ref);
    ids.push(item.ref);
  }
  return ids;
}

/** 存盘前的清洗：id 转小写 ASCII、去重、只保留 id/name/look */
export function normalizeCharacters(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const id = String(raw?.id || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = String(raw?.name || '').trim() || id;
    const look = String(raw?.look || '').trim();
    out.push({ id, name, look });
  }
  return out;
}
