// 人物 / 风格 / 场景的组装逻辑。
// 依据《漫画生成技巧》第五节：设定集中在 summary.caption，分格只做短关键词复述。

/**
 * 人物卡 → 一句英文设定。
 * desc 建议按文档顺序写：性别年龄 → 发型 → 五官 → 上装 → 下装 → 袜鞋 → 随身物 → 体型
 */
export function characterText(bible, cast = []) {
  const characters = (bible?.characters || []).filter((c) => c.enabled !== false);
  const chosen = cast?.length ? characters.filter((c) => cast.includes(c.id)) : characters;
  return chosen
    .map((c) => {
      const label = c.code || c.name || 'CHARACTER';
      const desc = String(c.desc || '').trim();
      if (!desc) return '';
      return `CHARACTER: ${label} = ${desc}`;
    })
    .filter(Boolean)
    .join('\n');
}

/** 分格里的短复述，例如 "W in her white sailor blouse and navy skirt" */
export function shortRecap(bible, cast = []) {
  const characters = (bible?.characters || []).filter((c) => c.enabled !== false);
  const chosen = cast?.length ? characters.filter((c) => cast.includes(c.id)) : [];
  return chosen
    .map((c) => `${c.code || c.name} in ${c.recap || 'her usual outfit'}`)
    .join('; ');
}

export function sceneText(project, page) {
  const own = String(page?.scene || '').trim();
  if (own) return `SETTING: ${own}`;
  const shared = String(project?.bible?.scene || '').trim();
  return shared ? `SETTING: ${shared}` : '';
}

/** 编译器上下文：一句话把项目/页面里的设定收齐 */
export function compileContext(project, page) {
  return {
    characterText: characterText(project?.bible, page?.cast || []),
    sceneText: sceneText(project, page),
    extra: '',
  };
}

export function createCharacter(patch = {}) {
  return {
    id: `ch_${Math.random().toString(36).slice(2, 8)}`,
    code: 'W',
    name: '',
    desc: '',
    recap: '',
    enabled: true,
    ...patch,
  };
}
