// 大模型客户端：只实现 OpenAI 兼容的 /chat/completions，够覆盖 DeepSeek、OpenAI、
// OpenRouter、vLLM、Ollama（/v1）等。不引 SDK，一个 fetch 搞定。

export class LlmError extends Error {
  constructor(message, { status = 0, details = null } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    this.details = details;
  }
}

export function normalizeBase(base) {
  return String(base || '').trim().replace(/\/+$/, '');
}

export function chatUrl(base) {
  const b = normalizeBase(base);
  return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`;
}

export function modelsUrl(base) {
  const b = normalizeBase(base);
  return b.endsWith('/chat/completions') ? b.replace(/\/chat\/completions$/, '/models') : `${b}/models`;
}

function authHeaders(settings) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${settings?.llm?.apiKey || ''}`,
  };
}

function assertConfigured(settings) {
  const llm = settings?.llm || {};
  if (!llm.baseUrl) throw new LlmError('还没有填大模型 Base URL，去设置页填一下');
  if (!llm.apiKey) throw new LlmError('还没有填大模型 API Key，去设置页填一下');
  if (!llm.model) throw new LlmError('还没有填模型名，去设置页填一下');
}

/**
 * 一次对话。支持 tools（函数调用）与多模态 content。
 * 返回 { message, usage }，message 是 OpenAI 格式的 assistant 消息。
 */
export async function chat({ settings, messages, tools, toolChoice, temperature, maxTokens, timeoutMs = 180000, signal }) {
  assertConfigured(settings);
  const llm = settings.llm;
  const body = {
    model: llm.model,
    messages,
    temperature: temperature ?? llm.temperature ?? 0.7,
  };
  if (maxTokens) body.max_tokens = maxTokens;
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice || 'auto';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(chatUrl(llm.baseUrl), {
      method: 'POST',
      headers: authHeaders(settings),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LlmError(`大模型返回 ${res.status}：${text.slice(0, 400) || res.statusText}`, {
        status: res.status,
        details: text,
      });
    }
    const data = await res.json();
    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new LlmError('大模型返回里没有 choices[0].message', { details: data });
    }
    return { message, usage: data.usage || null, raw: data };
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err.name === 'AbortError') throw new LlmError('大模型请求超时');
    throw new LlmError(`连不上大模型（${llm.baseUrl}）：${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 列出可用模型；有的服务没有 /models，就返回空数组而不是报错 */
export async function listModels(settings) {
  if (!settings?.llm?.baseUrl || !settings?.llm?.apiKey) return [];
  try {
    const res = await fetch(modelsUrl(settings.llm.baseUrl), { headers: authHeaders(settings) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
  } catch {
    return [];
  }
}

/** 连通性自检：先试 /models，失败再发一句最短对话 */
export async function testLlm(settings) {
  try {
    assertConfigured(settings);
  } catch (err) {
    return { ok: false, message: err.message, models: [] };
  }
  const models = await listModels(settings);
  if (models.length) {
    return { ok: true, message: `连接正常，可见 ${models.length} 个模型`, models };
  }
  try {
    const { message } = await chat({
      settings,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
      timeoutMs: 25000,
    });
    return { ok: true, message: `连接正常（模型回复：${(message.content || '').slice(0, 20) || '空'}）`, models: [] };
  } catch (err) {
    return { ok: false, message: err.message, models: [] };
  }
}

/** 把本地图片变成 vision 消息片段 */
export function imagePart(dataUrl) {
  return { type: 'image_url', image_url: { url: dataUrl } };
}

export function supportsVision(settings) {
  return settings?.llm?.vision !== false;
}
