// 工作流自动绑定：用户直接给完整的 API JSON，我们负责把关键字段换成占位符。
//
// 必绑（不问用户）：prompt / width / height
// 候选（问用户要不要暴露）：seed steps cfg sampler negative ckpt lora…
//
// 只替换字面量，绝不动连线（["6", 0] 这种是节点引用）。

const SAMPLER = /KSampler|SamplerCustom|KSamplerAdvanced/i;
const TEXT_ENCODE = /CLIPTextEncode|TextEncode|Prompt/i;
const LATENT = /Empty.*Latent|LatentImage/i;

const KNOWN = {
  seed: { param: 'seed', note: '随机种子' },
  noise_seed: { param: 'seed', note: '随机种子' },
  steps: { param: 'steps', note: '步数' },
  cfg: { param: 'cfg', note: 'CFG' },
  sampler_name: { param: 'sampler', note: '采样器' },
  scheduler: { param: 'scheduler', note: '调度器' },
  denoise: { param: 'denoise', note: '重绘幅度' },
};

function isLink(value) {
  return Array.isArray(value);
}

function hasPlaceholder(value) {
  return typeof value === 'string' && /\{\{/.test(value);
}

/**
 * @param {object} graph API 格式工作流
 * @returns {{required:Array, candidates:Array, warnings:Array}}
 */
export function detectBindings(graph) {
  const nodes = Object.entries(graph || {}).map(([id, node]) => ({ id, ...node }));
  const required = [];
  const candidates = [];
  const warnings = [];

  const push = (list, param, node, input, note = '') => {
    if (list.some((b) => b.param === param)) return;
    list.push({ param, node, input, note });
  };

  const samplers = nodes.filter((n) => SAMPLER.test(n.class_type || ''));
  const sampler = samplers[0];
  if (samplers.length > 1) warnings.push(`有 ${samplers.length} 个采样器，只绑定了第一个（节点 ${sampler.id}）`);

  // ---- 正向 / 负向提示词：顺着采样器的连线找文本编码节点
  if (sampler) {
    for (const [input, param] of [['positive', 'prompt'], ['negative', 'negative']]) {
      const link = sampler.inputs?.[input];
      if (!isLink(link)) continue;
      const target = graph[String(link[0])];
      if (!target?.inputs) {
        warnings.push(`采样器 ${sampler.id} 的 ${input} 指向的节点 ${link[0]} 不存在`);
        continue;
      }
      if (!TEXT_ENCODE.test(target.class_type || '')) {
        warnings.push(`采样器 ${sampler.id} 的 ${input} 连到了 ${target.class_type}，不是文本编码节点，跳过`);
        continue;
      }
      const textKey = Object.keys(target.inputs).find((k) => /^(text|prompt|string)$/i.test(k));
      if (!textKey) {
        warnings.push(`节点 ${link[0]} 找不到文本输入`);
        continue;
      }
      if (param === 'prompt') push(required, 'prompt', String(link[0]), textKey);
      else push(candidates, 'negative', String(link[0]), textKey);
    }
  } else {
    warnings.push('没有找到采样器节点，无法自动定位提示词');
  }

  // ---- 尺寸：随便一个 latent 节点的 width / height
  const latent = nodes.find((n) => LATENT.test(n.class_type || '') && n.inputs && 'width' in n.inputs);
  if (latent) {
    push(required, 'width', latent.id, 'width');
    push(required, 'height', latent.id, 'height');
  } else {
    warnings.push('没有找到带 width/height 的 latent 节点（EmptyLatentImage 之类）');
  }

  // ---- 其他可暴露的参数
  if (sampler) {
    for (const [input, meta] of Object.entries(KNOWN)) {
      if (!sampler.inputs || !(input in sampler.inputs)) continue;
      push(candidates, meta.param, sampler.id, input, meta.note);
    }
  }

  const ckptNode = nodes.find((n) => /CheckpointLoader|UNETLoader/i.test(n.class_type || '') && n.inputs?.ckpt_name !== undefined);
  if (ckptNode) push(candidates, 'ckpt', ckptNode.id, 'ckpt_name', '检查点');

  const loraNode = nodes.find((n) => /LoraLoader/i.test(n.class_type || '') && n.inputs?.lora_name !== undefined);
  if (loraNode) {
    push(candidates, 'lora_name', loraNode.id, 'lora_name', 'LoRA 文件名');
    if ('strength_model' in (loraNode.inputs || {})) push(candidates, 'lora_strength', loraNode.id, 'strength_model', 'LoRA 强度');
  }

  return { required, candidates, warnings };
}

/**
 * 写入占位符，返回新图（不改原对象）。
 * @param {object} graph
 * @param {Array<{param:string,node:string,input:string}>} bindings
 */
export function applyBindings(graph, bindings) {
  const clone = JSON.parse(JSON.stringify(graph));
  const applied = [];
  for (const { param, node, input } of bindings) {
    const target = clone[node];
    if (!target?.inputs || !(input in target.inputs)) continue;
    if (isLink(target.inputs[input])) continue;
    if (hasPlaceholder(target.inputs[input])) continue;
    target.inputs[input] = `{{${param}}}`;
    applied.push({ param, node, input });
  }
  return { graph: clone, applied };
}

/** 把 "seed=3.seed" 这样的表达式解析成绑定 */
export function parseExpose(expressions) {
  return expressions.map((expr) => {
    const [param, target] = String(expr).split('=');
    if (!param || !target) throw new Error(`格式应为 参数=节点id.输入名，例如 seed=3.seed（收到 ${expr}）`);
    const dot = target.indexOf('.');
    if (dot < 0) throw new Error(`目标要写成 节点id.输入名（收到 ${target}）`);
    return { param: param.trim(), node: target.slice(0, dot).trim(), input: target.slice(dot + 1).trim() };
  });
}
