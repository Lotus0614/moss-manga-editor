// Agent 主循环：一次用户发言 → 若干轮工具调用 → 最终回复。
// 刻意不做流式输出（工具调用的流式拼接容易出错），改为把每个工具调用实时推给前端。

import { chat, LlmError } from '../llm.mjs';
import { toolSchemas, executeTool } from './tools.mjs';
import { MAIN_AGENT_PROMPT, PAGE_AGENT_PROMPT, COMPRESS_PROMPT } from './prompts.mjs';
import { getThread, saveThread, ensurePageThread } from './store.mjs';

const MAX_DEPTH = 2;

/**
 * @param {object} opts
 * @param {object} opts.thread     线程（会被就地更新并落盘）
 * @param {object} opts.settings   含 llm/comfy 的原始设置
 * @param {(type:string, data:any)=>void} opts.emit  SSE 推送
 * @param {object} [opts.hooks]    {generate, runSubAgent}
 * @param {number} [opts.depth]    子 Agent 递归深度
 */
export async function runAgent({ thread, settings, emit, hooks = {}, depth = 0 }) {
  const maxSteps = Math.max(1, settings.agent?.maxSteps || 10);
  const keep = Math.max(4, settings.agent?.keepMessages || 12);
  const system = thread.kind === 'page' ? PAGE_AGENT_PROMPT : MAIN_AGENT_PROMPT;

  await compressIfNeeded(thread, settings, keep, emit);

  const ctx = {
    projectId: thread.projectId,
    pageId: thread.pageId,
    settings,
    thread,
    generate: hooks.generate,
    runSubAgent:
      depth < MAX_DEPTH && hooks.dispatch
        ? async ({ pageId, instruction }) => {
            const sub = await ensurePageThread(thread.projectId, pageId);
            sub.mode = 'single';
            sub.messages.push({ role: 'user', content: instruction });
            await saveThread(sub);
            emit('subagent_start', { threadId: sub.id, pageId, instruction });
            const text = await runAgent({
              thread: sub,
              settings,
              emit: (type, data) => emit('subagent_event', { threadId: sub.id, type, data }),
              hooks: { generate: hooks.generate },
              depth: depth + 1,
            });
            emit('subagent_done', { threadId: sub.id, pageId, text });
            return { threadId: sub.id, text };
          }
        : undefined,
  };

  const tools = toolSchemas(depth > 0 ? 'single' : thread.mode === 'sub' ? 'sub' : 'single');
  let finalText = '';
  let steps = 0;

  while (steps < maxSteps) {
    steps += 1;
    let result;
    try {
      result = await chat({
        settings,
        messages: [{ role: 'system', content: system }, ...thread.messages],
        tools,
        temperature: settings.llm.temperature,
        timeoutMs: 240000,
      });
    } catch (err) {
      const message = err instanceof LlmError ? err.message : String(err.message || err);
      emit('error', { message });
      thread.messages.push({ role: 'assistant', content: `（出错了：${message}）` });
      await saveThread(thread);
      return message;
    }

    const message = result.message;
    const toolCalls = message.tool_calls || [];
    thread.messages.push({
      role: 'assistant',
      content: message.content || '',
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    });

    if (message.content) emit('text', { text: message.content });

    if (!toolCalls.length) {
      finalText = message.content || '';
      break;
    }

    for (const call of toolCalls) {
      const name = call.function?.name || '';
      let args = {};
      try {
        args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      emit('tool', { name, args });
      let output;
      try {
        output = await executeTool(ctx, name, args);
        emit('tool_result', { name, ok: true });
      } catch (err) {
        output = { error: err.message };
        emit('tool_result', { name, ok: false, error: err.message });
      }
      thread.messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: truncate(JSON.stringify(output), 12000),
      });
    }

    await saveThread(thread);
  }

  if (steps >= maxSteps && !finalText) {
    finalText = '（已经改了很多轮，先停一下。要继续的话告诉我下一步做什么。）';
    emit('text', { text: finalText });
    thread.messages.push({ role: 'assistant', content: finalText });
  }

  await saveThread(thread);
  emit('done', { text: finalText });
  return finalText;
}

async function compressIfNeeded(thread, settings, keep, emit) {
  if (thread.messages.length <= keep * 2) return;
  const cut = thread.messages.length - keep;
  const old = thread.messages.slice(0, cut);
  const keepMessages = thread.messages.slice(cut);
  const digest = old
    .map((m) => {
      const role = m.role === 'assistant' ? 'AI' : m.role === 'tool' ? '工具' : '用户';
      const body = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${role}: ${body}`.slice(0, 800);
    })
    .join('\n');

  try {
    const { message } = await chat({
      settings,
      messages: [
        { role: 'system', content: COMPRESS_PROMPT },
        { role: 'user', content: `${thread.summary ? `已有摘要：${thread.summary}\n\n` : ''}新对话：\n${digest}` },
      ],
      temperature: 0.2,
      maxTokens: 600,
      timeoutMs: 60000,
    });
    thread.summary = (message.content || '').slice(0, 1200);
    thread.messages = keepMessages;
    emit('compressed', { summary: thread.summary });
  } catch {
    // 压缩失败不能挡住主流程，只裁掉最老的一半
    thread.messages = thread.messages.slice(Math.floor(thread.messages.length / 2));
    emit('compressed', { summary: thread.summary || '' });
  }
  await saveThread(thread);
}

function truncate(text, limit) {
  if (typeof text !== 'string') return text;
  return text.length > limit ? `${text.slice(0, limit)}…（已截断）` : text;
}

export { getThread };
