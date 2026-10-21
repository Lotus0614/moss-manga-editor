// 工作流占位符引擎。语法：{{name}} 或 {{name:默认值}}
//
// 没有白名单：工作流里出现什么名字，就是什么参数。
// 默认值写在占位符里（{{steps:30}}），保存工作流时会被抄进 config.params；
// 渲染时取值优先级：项目 params > 全局 params > 占位符默认值。

const TOKEN = /\{\{\s*([a-zA-Z0-9_.-]+)(?::([^}]*))?\s*\}\}/g;
const EXACT = /^\s*\{\{\s*([a-zA-Z0-9_.-]+)(?::([^}]*))?\s*\}\}\s*$/;

export class MissingParam extends Error {
  constructor(name) {
    super(`工作流缺少参数：${name}`);
    this.name = 'MissingParam';
    this.param = name;
  }
}

/** 默认值按字面量推断类型：30 → 数字，true → 布尔，其它 → 字符串 */
export function parseDefault(raw) {
  if (raw === undefined) return undefined;
  const text = String(raw).trim();
  if (text === '') return '';
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^-?\d+\.\d+$/.test(text)) return Number(text);
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
  return text;
}

/** 扫出所有占位符：名字、出现次数、默认值 */
export function scanTokens(raw) {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const found = new Map();
  const re = new RegExp(TOKEN.source, 'g');
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    const entry = found.get(name) || { name, count: 0, defaultValue: undefined, hasDefault: false };
    entry.count += 1;
    if (m[2] !== undefined) {
      entry.defaultValue = parseDefault(m[2]);
      entry.hasDefault = true;
    }
    found.set(name, entry);
  }
  return [...found.values()];
}

/** 只按名字猜类型，用于没有默认值时决定表单控件 */
export function inferType(name, defaultValue) {
  if (defaultValue !== undefined) {
    if (typeof defaultValue === 'number') return 'number';
    if (typeof defaultValue === 'boolean') return 'boolean';
  }
  const key = String(name).toLowerCase();
  if (/(steps|cfg|width|height|seed|denoise|strength|scale|weight|batch|count|index|fps|frames|length)/.test(key)) return 'number';
  if (/^(is_|use_|enable|enabled)/.test(key)) return 'boolean';
  return 'string';
}

export function describeWorkflow(raw) {
  let graph;
  try {
    graph = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    return { ok: false, error: `工作流 JSON 解析失败：${err.message}`, params: [] };
  }
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    return { ok: false, error: '工作流必须是 API 格式（{节点id: {class_type, inputs}}）', params: [] };
  }
  const nodes = Object.entries(graph);
  if (!nodes.length) return { ok: false, error: '工作流里没有任何节点', params: [] };
  const bad = nodes.find(([, n]) => !n || !n.class_type);
  if (bad) return { ok: false, error: `节点 ${bad[0]} 缺少 class_type，可能不是 API 格式`, params: [] };

  const params = scanTokens(graph).map((t) => ({
    name: t.name,
    count: t.count,
    hasDefault: t.hasDefault,
    defaultValue: t.defaultValue,
    type: inferType(t.name, t.defaultValue),
  }));
  return { ok: true, params, nodeCount: nodes.length };
}

/** 把 params 里的默认值抽出来（保存工作流时用） */
export function collectDefaults(raw) {
  const desc = describeWorkflow(raw);
  if (!desc.ok) return {};
  const out = {};
  for (const p of desc.params) if (p.hasDefault) out[p.name] = p.defaultValue;
  return out;
}

export function fillGraph(value, values, path = '') {
  if (typeof value === 'string') return fillString(value, values);
  if (Array.isArray(value)) return value.map((v, i) => fillGraph(v, values, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = fillGraph(v, values, path ? `${path}.${k}` : k);
    return out;
  }
  return value;
}

function pick(name, values, fallback) {
  if (values && name in values && values[name] !== undefined) return values[name];
  if (fallback !== undefined) return fallback;
  throw new MissingParam(name);
}

function fillString(str, values) {
  const exact = str.match(EXACT);
  if (exact) return pick(exact[1], values, parseDefault(exact[2]));

  const re = new RegExp(TOKEN.source, 'g');
  return str.replace(re, (_, name, dflt) => String(pick(name, values, parseDefault(dflt))));
}

export function missingParams(raw, values) {
  return scanTokens(raw)
    .filter((t) => !t.hasDefault)
    .map((t) => t.name)
    .filter((name) => !(name in (values || {})) || values[name] === undefined);
}
