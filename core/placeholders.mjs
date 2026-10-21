// 工作流占位符引擎。
//
// 设计：ComfyUI 的 API 格式图里直接写 {{prompt}}、{{seed}} 这样的占位符，
// 提交前整棵树走一遍替换。用户不需要理解绑定清单，改图 = 改 JSON。
//
// 类型规则：
//   - 整个字符串就是一个占位符 → 保留原始类型（数字还是数字，数组还是数组）
//   - 占位符夹在别的文字里 → 转成字符串拼接
//   - 缺值时抛 MissingParam，让 UI 明确告诉用户少了哪个参数

const TOKEN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const EXACT = /^\s*\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}\s*$/;

const NUMBER_NAMES = new Set([
  'width', 'height', 'seed', 'steps', 'cfg', 'guidance', 'batch', 'batch_size',
  'denoise', 'strength', 'scale', 'weight', 'lora_weight', 'lora_strength', 'start', 'end',
  'fps', 'frames', 'length', 'index', 'count', 'width2', 'height2', 'noise_seed',
]);

export class MissingParam extends Error {
  constructor(name) {
    super(`工作流缺少参数：${name}`);
    this.name = 'MissingParam';
    this.param = name;
  }
}

/** 扫出模板里所有占位符名 */
export function scanTokens(raw) {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const found = new Map();
  for (const m of text.matchAll(TOKEN)) {
    const name = m[1];
    found.set(name, (found.get(name) || 0) + 1);
  }
  return [...found.entries()].map(([name, count]) => ({ name, count }));
}

/** 按名字猜类型，只用于 UI 选控件 */
export function inferType(name) {
  const key = String(name).toLowerCase();
  if (NUMBER_NAMES.has(key)) return 'number';
  if (/^(is_|use_|enable|enabled)/.test(key)) return 'boolean';
  return 'string';
}

/** 解析工作流文本，返回参数清单；解析失败时返回错误而不是抛异常 */
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

  const params = scanTokens(graph).map((t) => ({ ...t, type: inferType(t.name) }));
  return { ok: true, params, nodeCount: nodes.length };
}

/** 递归填充，返回新对象（不改原图） */
export function fillGraph(value, values, path = '') {
  if (typeof value === 'string') return fillString(value, values);
  if (Array.isArray(value)) return value.map((v, i) => fillGraph(v, values, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = fillGraph(v, values, path ? `${path}.${k}` : k);
    }
    return out;
  }
  return value;
}

function fillString(str, values) {
  const exact = str.match(EXACT);
  if (exact) {
    const name = exact[1];
    if (!(name in values) || values[name] === undefined) throw new MissingParam(name);
    return values[name];
  }
  return str.replace(TOKEN, (_, name) => {
    if (!(name in values) || values[name] === undefined) throw new MissingParam(name);
    const v = values[name];
    return typeof v === 'string' ? v : String(v);
  });
}

/** 先算缺哪些参数，用于提交前提示（不抛异常） */
export function missingParams(raw, values) {
  return scanTokens(raw)
    .map((t) => t.name)
    .filter((name) => !(name in values) || values[name] === undefined);
}
