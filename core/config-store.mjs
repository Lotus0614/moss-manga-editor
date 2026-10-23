// 配置管理器：漫画方言在 config/ 里注册，其余代码（core / web / scripts）只从这里取。
//
// 一份配置长这样：
//   {
//     name: 'manga',
//     page:  [ 页面级字段 ],
//     types: [ { key, label, role?, fields, compile({ item, page }) } ],
//     snippets: { 句子模板 },
//     buildSummary({ page, items }) { return { meta, canvas, caption } },
//   }
//
// 字段统一形状（页面字段和 item 字段完全一样）：
//   { key, type, label, required?, default?, canvas?, options? }
//   type = text | longtext | number | enum | bool | tags | palette
//   enum 的 options 是数组，每项 { value, label, ... }，显示名和提示词短语都放这里。

const FIELD_TYPES = new Set(['text', 'longtext', 'number', 'enum', 'bool', 'tags', 'palette']);

const EMPTY = { name: '', page: [], types: [], snippets: {}, buildSummary: null, problems: [] };
let current = EMPTY;

// ---------------------------------------------------------------- 注册

export function registerConfig(config = {}) {
  const problems = [];
  const page = normalizeFields(config.page || [], '页面', problems);
  const types = (config.types || []).map((type) => {
    const label = type.key || '?';
    if (!type.key) problems.push(`${label}：类型没有 key`);
    if (typeof type.compile !== 'function') problems.push(`${label}：类型没有 compile()`);
    return { ...type, fields: normalizeFields(type.fields || [], `类型 ${label}`, problems) };
  });

  const keys = new Set();
  for (const type of types) {
    if (keys.has(type.key)) problems.push(`类型 ${type.key}：key 重复`);
    keys.add(type.key);
  }

  current = {
    name: String(config.name || ''),
    page,
    types,
    snippets: { ...(config.snippets || {}) },
    buildSummary: typeof config.buildSummary === 'function' ? config.buildSummary : null,
    problems,
  };
  return current;
}

function normalizeFields(fields, where, problems) {
  return fields.map((field) => {
    const at = `${where} 字段 ${field.key || '?'}`;
    if (!field.key) problems.push(`${at}：没有 key`);
    if (!field.label) problems.push(`${at}：没有 label`);
    if (!FIELD_TYPES.has(field.type)) problems.push(`${at}：type "${field.type}" 不认识`);

    const out = { ...field };
    if (field.type === 'enum') {
      if (!Array.isArray(field.options) || !field.options.length) {
        problems.push(`${at}：enum 必须给 options 数组`);
        out.options = [];
      } else {
        out.options = field.options.map((option, i) => {
          if (option === null || typeof option !== 'object' || option.value === undefined) {
            problems.push(`${at}：第 ${i + 1} 个选项目缺少 value`);
            return { value: String(option), label: String(option) };
          }
          return { label: String(option.label ?? option.value), ...option };
        });
        const seen = new Set();
        for (const option of out.options) {
          if (seen.has(option.value)) problems.push(`${at}：选项 "${option.value}" 重复`);
          seen.add(option.value);
        }
        if (field.default !== undefined && !seen.has(field.default)) {
          problems.push(`${at}：default "${field.default}" 不在 options 里`);
        }
      }
    }
    return out;
  });
}

// ---------------------------------------------------------------- 读取

export function getConfig() {
  return current;
}

export function configProblems() {
  return current.problems;
}

export function pageFields() {
  return current.page;
}

export function pageField(key) {
  return current.page.find((field) => field.key === key) || null;
}

export function itemTypes() {
  return current.types;
}

export function itemType(key) {
  return current.types.find((type) => type.key === key) || null;
}

export function fieldsOf(key) {
  return itemType(key)?.fields || [];
}

export function fieldOf(typeKey, fieldKey) {
  return fieldsOf(typeKey).find((field) => field.key === fieldKey) || null;
}

export function optionsOf(field) {
  return Array.isArray(field?.options) ? field.options : [];
}

/** 某个枚举字段的某个值对应的完整选项（含 label / phrase 等） */
export function optionOf(field, value) {
  if (!field) return null;
  return optionsOf(field).find((option) => option.value === value) || null;
}

export function optionLabel(field, value) {
  return optionOf(field, value)?.label ?? value;
}

/** 类型上的某个枚举字段取值 → 选项（写 compile 时用） */
export function typeOption(typeKey, fieldKey, value) {
  return optionOf(fieldOf(typeKey, fieldKey), value);
}

// ---------------------------------------------------------------- 句子模板

export function snippets() {
  return current.snippets;
}

/** 取模板并填 {name} 占位符 */
export function snippet(name, vars = {}) {
  const template = current.snippets[name];
  if (template === undefined) return '';
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (vars[key] !== undefined ? String(vars[key]) : match));
}

// ---------------------------------------------------------------- summary

export function buildSummary(args) {
  if (!current.buildSummary) return { meta: [], canvas: 'single', caption: '' };
  return current.buildSummary(args);
}

// ---------------------------------------------------------------- 画布标签

/** 画布左上角标签：只有 canvas: true 的字段才出现 */
export function canvasLabel(item, index = 0) {
  const type = itemType(item.type);
  if (!type) return item.type || '';
  const parts = [];
  for (const field of type.fields) {
    if (!field.canvas) continue;
    const raw = item[field.key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (Array.isArray(raw) && !raw.length) continue;
    parts.push(field.type === 'enum' ? optionLabel(field, raw) : String(raw));
  }
  const head = type.label + (type.key === 'panel' ? index + 1 : '');
  return parts.length ? `${head} · ${parts.join(' / ')}` : head;
}
