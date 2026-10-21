// 右栏：Agent 对话。支持多轮、贴图、模式切换、子 Agent 线程切换。

import { html, api, apiPut, apiPost, streamPost, useState, useEffect, useRef, toast, formatTime, cls } from '../lib.mjs';

const MODE_TEXT = { unset: '未选模式', single: '单 Agent', sub: '子 Agent' };

/** 只处理 **加粗** 与换行，够用就好，不引 markdown 库 */
function richText(text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part) =>
    part.startsWith('**') && part.endsWith('**') ? html`<b>${part.slice(2, -2)}</b>` : part
  );
}

export default function Chat({ projectId, pageId, onActivity }) {
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState('');
  const [thread, setThread] = useState(null);
  const [live, setLive] = useState([]);
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let data = await api(`/api/projects/${projectId}/threads`);
        let list = data.threads || [];
        if (!list.length) {
          const created = await apiPost(`/api/projects/${projectId}/threads`, { kind: 'main' });
          list = [{ id: created.id, kind: 'main', title: created.title, mode: created.mode }];
        }
        if (!alive) return;
        setThreads(list);
        const preferred = list.find((t) => t.kind === 'main') || list[0];
        setThreadId(preferred.id);
      } catch (err) {
        toast(err.message, 'bad');
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!threadId) return;
    let alive = true;
    api(`/api/threads/${threadId}`)
      .then((data) => alive && setThread(data))
      .catch((err) => toast(err.message, 'bad'));
    return () => {
      alive = false;
    };
  }, [threadId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [thread, live]);

  async function setMode(mode) {
    if (!thread) return;
    try {
      const saved = await apiPut(`/api/threads/${threadId}`, { mode });
      setThread(saved);
      setThreads((list) => list.map((t) => (t.id === saved.id ? { ...t, mode: saved.mode } : t)));
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function pickFiles(event) {
    const files = [...(event.currentTarget.files || [])].slice(0, 4);
    event.currentTarget.value = '';
    for (const file of files) {
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'content-type': file.type || 'image/png' },
          body: file,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '上传失败');
        setImages((list) => [...list, data.url]);
      } catch (err) {
        toast(err.message, 'bad');
      }
    }
  }

  async function send() {
    const content = text.trim();
    if ((!content && !images.length) || busy || !thread) return;
    setBusy(true);
    setText('');
    const attachments = [...images];
    setImages([]);

    const optimistic = {
      role: 'user',
      content: content || '',
      images: attachments,
    };
    setThread({ ...thread, messages: [...(thread.messages || []), optimistic] });
    setLive([]);

    try {
      await streamPost(
        `/api/threads/${threadId}/messages`,
        { text: content, images: attachments },
        (event) => {
          const data = event.data || {};
          if (event.type === 'text' || event.type === 'mode_question') {
            setLive((items) => [...items, { kind: 'text', text: data.text || '' }]);
          } else if (event.type === 'tool') {
            setLive((items) => [...items, { kind: 'tool', name: data.name, args: data.args, pending: true }]);
          } else if (event.type === 'tool_result') {
            setLive((items) =>
              items.map((it) => (it.kind === 'tool' && it.name === data.name && it.pending ? { ...it, pending: false, ok: data.ok, error: data.error } : it))
            );
          } else if (event.type === 'subagent_start') {
            setLive((items) => [...items, { kind: 'tool', name: `子 Agent · ${data.pageId}`, args: { instruction: data.instruction }, pending: true }]);
          } else if (event.type === 'subagent_done') {
            setLive((items) =>
              items.map((it) => (it.kind === 'tool' && it.name?.startsWith('子 Agent') && it.pending ? { ...it, pending: false, ok: true } : it))
            );
          } else if (event.type === 'error') {
            setLive((items) => [...items, { kind: 'error', text: data.message }]);
          } else if (event.type === 'compressed') {
            setLive((items) => [...items, { kind: 'tool', name: '上下文压缩', args: {}, pending: false, ok: true }]);
          } else if (event.type === 'done') {
            setLive((items) => [...items, { kind: 'done' }]);
          }
        }
      );
    } catch (err) {
      setLive((items) => [...items, { kind: 'error', text: err.message }]);
    } finally {
      setBusy(false);
      onActivity?.();
      try {
        const fresh = await api(`/api/threads/${threadId}`);
        setThread(fresh);
        setLive([]);
      } catch {
        /* 忽略刷新失败 */
      }
    }
  }

  const mode = thread?.mode || 'unset';
  const messages = (thread?.messages || []).filter((m) => m.role !== 'system');
  const compactMode = mode === 'sub';

  return html`<aside class="chat">
    <div class="chat-head">
      AGENT
      <select
        class="select"
        style="width:auto;max-width:150px;padding:1px 20px 1px 5px;font-size:10px;border-color:var(--line)"
        value=${threadId}
        onChange=${(e) => setThreadId(e.currentTarget.value)}
      >
        ${threads.map((t) => html`<option value=${t.id}>${t.kind === 'main' ? '主 Agent' : t.title || '页面 Agent'}</option>`)}
      </select>
      <div class="spacer"></div>
      <span class="tag" style="border-color:var(--line);color:var(--mid)">${MODE_TEXT[mode]}</span>
    </div>

    <div class="msgs" ref=${listRef}>
      ${!messages.length && !live.length
        ? html`<div class="m tool"><div class="body">
            让 Agent 帮你排页，或者自己在画布上拖。第一次对话会先问你要单 Agent 还是子 Agent。
          </div></div>`
        : null}

      ${messages.map((m, i) => {
        if (m.role === 'tool') {
          return html`<div class="m tool" key=${`t${i}`}><div class="body">
            <b>${m.name || '工具'}</b> · ${String(m.content || '').slice(0, 160)}
          </div></div>`;
        }
        if (m.role === 'assistant') {
          const textContent =
            typeof m.content === 'string' ? m.content : (m.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
          if (!textContent) return null;
          return html`<div class="m" key=${`a${i}`}>
            <div class="who">AGENT</div>
            <div class="body">${richText(textContent)}</div>
          </div>`;
        }
        const body =
          typeof m.content === 'string'
            ? m.content
            : (m.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
        const imgs = Array.isArray(m.content)
          ? (m.content || []).filter((c) => c.type === 'image_url').map((c) => c.image_url.url)
          : m.images || [];
        return html`<div class="m me" key=${`u${i}`}>
          <div class="who">你</div>
          <div class="body">
            ${body}
            ${imgs.map((src) => html`<img src=${src} alt="" />`)}
          </div>
        </div>`;
      })}

      ${live.map((it, i) => {
        if (it.kind === 'text') {
          return html`<div class="m" key=${`l${i}`}><div class="who">AGENT</div><div class="body">${richText(it.text)}</div></div>`;
        }
        if (it.kind === 'tool') {
          return html`<div class="m tool" key=${`l${i}`}><div class="body">
            <b>${it.name}</b>${it.pending ? ' …' : it.ok === false ? ` ✗ ${it.error || ''}` : ' ✓'}
            ${it.args && it.args.pageId ? ` · ${String(it.args.pageId).slice(-6)}` : ''}
          </div></div>`;
        }
        if (it.kind === 'error') {
          return html`<div class="m err" key=${`l${i}`}><div class="who">错误</div><div class="body">${it.text}</div></div>`;
        }
        return null;
      })}
      ${busy ? html`<div class="m tool"><div class="body">思考中…</div></div>` : null}
    </div>

    <div class="composer">
      ${images.length
        ? html`<div class="attachments">
            ${images.map(
              (url) => html`<div class="att" key=${url}>
                <img src=${url} alt="" />
                <button onClick=${() => setImages((list) => list.filter((u) => u !== url))}>×</button>
              </div>`
            )}
          </div>`
        : null}
      <textarea
        placeholder="让它改哪一页、怎么改；也可以贴参考图。"
        value=${text}
        onInput=${(e) => setText(e.currentTarget.value)}
        onKeyDown=${(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
        }}
      ></textarea>
      <div class="bar">
        <span class=${cls('chip', mode === 'single' ? 'on' : 'ghost')} onClick=${() => setMode('single')}>单 Agent</span>
        <span class=${cls('chip', compactMode ? 'on' : 'ghost')} onClick=${() => setMode('sub')}>子 Agent</span>
        <div class="spacer"></div>
        <button class="icon-btn" title="贴图" onClick=${() => fileRef.current?.click()}>＋</button>
        <button class="btn inv" disabled=${busy} onClick=${send}>${busy ? '…' : '发送'}</button>
      </div>
      <input ref=${fileRef} type="file" accept="image/*" multiple style="display:none" onChange=${pickFiles} />
    </div>
  </aside>`;
}
