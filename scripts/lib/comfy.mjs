// ComfyUI 客户端：只依赖 HTTP + 内置 WebSocket，不引任何包。
//
// 用到的端点：/system_stats /object_info /prompt /history /view /interrupt /queue

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ComfyError extends Error {
  constructor(message, { status = 0, details = null } = {}) {
    super(message);
    this.name = 'ComfyError';
    this.status = status;
    this.details = details;
  }
}

export class ComfyClient {
  constructor({ url = 'http://127.0.0.1:8188', token = '', timeoutMs = 180000 } = {}) {
    this.url = String(url || '').trim().replace(/\/+$/, '');
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  get base() {
    return this.url || 'http://127.0.0.1:8188';
  }

  headers(extra = {}) {
    const h = { ...extra };
    if (this.token) h.authorization = `Bearer ${this.token}`;
    return h;
  }

  async request(path, { method = 'GET', body, timeoutMs = 15000, raw = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers: this.headers(body ? { 'content-type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new ComfyError(`ComfyUI ${path} 返回 ${res.status}${detail ? `：${detail.slice(0, 300)}` : ''}`, {
          status: res.status,
          details: detail,
        });
      }
      if (raw) return Buffer.from(await res.arrayBuffer());
      return await res.json();
    } catch (err) {
      if (err instanceof ComfyError) throw err;
      if (err.name === 'AbortError') throw new ComfyError(`ComfyUI 请求超时：${this.base}${path}`);
      throw new ComfyError(`连不上 ComfyUI（${this.base}）：${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  stats() {
    return this.request('/system_stats', { timeoutMs: 8000 });
  }

  objectInfo() {
    return this.request('/object_info', { timeoutMs: 30000 });
  }

  queue() {
    return this.request('/queue');
  }

  interrupt() {
    return this.request('/interrupt', { method: 'POST', body: {} });
  }

  /** 提交图，返回 prompt_id；节点错误会带上原始细节便于定位 */
  async submit(graph) {
    const clientId = `manga_${Math.random().toString(36).slice(2, 10)}`;
    const data = await this.request('/prompt', { method: 'POST', body: { prompt: graph, client_id: clientId } });
    if (data.node_errors && Object.keys(data.node_errors).length) {
      const first = Object.values(data.node_errors)[0];
      const message = first?.errors?.[0]?.message || '节点校验失败';
      throw new ComfyError(`工作流节点错误：${message}`, { status: 400, details: data.node_errors });
    }
    if (!data.prompt_id) throw new ComfyError('ComfyUI 没有返回 prompt_id', { details: data });
    return { promptId: data.prompt_id, clientId, queueNumber: data.number };
  }

  history(promptId) {
    return this.request(`/history/${promptId}`, { timeoutMs: 15000 });
  }

  view({ filename, subfolder = '', type = 'output' }) {
    const qs = new URLSearchParams({ filename, subfolder, type });
    return this.request(`/view?${qs}`, { raw: true, timeoutMs: 60000 });
  }

  /**
   * 边看进度边等结果。进度靠 WebSocket（失败就静默降级成纯轮询）。
   */
  async run(graph, { onProgress = () => {}, onEvent = () => {}, timeoutMs = this.timeoutMs } = {}) {
    const { promptId } = await this.submit(graph);
    onEvent({ type: 'queued', promptId });
    const stop = this.watch(promptId, { onProgress, onEvent });
    const started = Date.now();
    try {
      while (Date.now() - started < timeoutMs) {
        await sleep(1000);
        const history = await this.history(promptId);
        const entry = history?.[promptId];
        if (!entry) continue;
        if (entry.status?.status_str === 'error') {
          const msg = entry.status?.messages?.find((m) => m[0] === 'execution_error')?.[1];
          throw new ComfyError(
            `生成失败${msg?.exception_message ? `：${msg.exception_message}` : ''}${msg?.node_type ? `（节点 ${msg.node_type}）` : ''}`,
            { details: entry.status }
          );
        }
        const images = collectImages(entry.outputs);
        if (!images.length) continue;
        onProgress({ value: 1, max: 1, node: null });
        return { promptId, images, entry, ms: Date.now() - started };
      }
      throw new ComfyError('等待生成结果超时（可以调大设置里的超时时间）');
    } finally {
      stop();
    }
  }

  /** 打开 WS 听进度；返回关闭函数。所有异常都吞掉，绝不影响主流程。 */
  watch(promptId, { onProgress = () => {}, onEvent = () => {} } = {}) {
    if (typeof WebSocket !== 'function') return () => {};
    let socket;
    try {
      const wsBase = this.base.replace(/^http/i, 'ws');
      socket = new WebSocket(`${wsBase}/ws?clientId=watch_${promptId}`);
    } catch {
      return () => {};
    }
    socket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.data?.prompt_id && msg.data.prompt_id !== promptId) return;
      if (msg.type === 'progress') onProgress({ value: msg.data.value, max: msg.data.max, node: msg.data.node });
      else if (msg.type === 'executing' && msg.data?.node === null) onEvent({ type: 'executing-done' });
      else if (msg.type === 'execution_error') onEvent({ type: 'error', data: msg.data });
    });
    socket.addEventListener('error', () => {});
    return () => {
      try {
        socket.close();
      } catch {
        /* 已关闭 */
      }
    };
  }
}

/** history.outputs 里所有图片产物 */
export function collectImages(outputs = {}) {
  const out = [];
  for (const [nodeId, output] of Object.entries(outputs)) {
    for (const image of output?.images || []) {
      out.push({ nodeId, filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
    }
  }
  return out;
}

export function comfyFromSettings(settings) {
  return new ComfyClient({
    url: settings?.comfy?.url,
    token: settings?.comfy?.token,
    timeoutMs: settings?.comfy?.timeoutMs || 180000,
  });
}

export { sleep };
