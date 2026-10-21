// Agent 对话接口：线程管理 + SSE 流式推送工具调用。

import { readFile } from 'node:fs/promises';
import { json, fail, readBody, route, sse } from '../http.mjs';
import { getProject, getPage, getRawSettings, imagePath, uploadPath } from '../store.mjs';
import { listThreads, createThread, getThread, saveThread, deleteThread } from '../agent/store.mjs';
import { runAgent } from '../agent/loop.mjs';
import { MODE_QUESTION } from '../agent/prompts.mjs';
import { createJob } from '../jobs.mjs';
import { prepareGeneration, runGeneration } from './generate.mjs';

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

async function toDataUrl(url, projectId) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  const clean = String(url).split('?')[0];
  const ext = (clean.split('.').pop() || 'png').toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/png';
  let file;
  const uploadMatch = clean.match(/^\/uploads\/([^/]+)$/);
  const mediaMatch = clean.match(/^\/media\/([^/]+)\/([^/]+)$/);
  if (uploadMatch) file = uploadPath(uploadMatch[1]);
  else if (mediaMatch) file = await imagePath(mediaMatch[1] || projectId, mediaMatch[2]);
  else return null;
  try {
    const buffer = await readFile(file);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

export const routes = [
  route('GET', '/api/projects/:id/threads', async ({ res, params }) => {
    const project = await getProject(params.id);
    if (!project) return fail(res, 404, '项目不存在');
    json(res, 200, { threads: await listThreads(params.id) });
  }),

  route('POST', '/api/projects/:id/threads', async ({ req, res, params }) => {
    const project = await getProject(params.id);
    if (!project) return fail(res, 404, '项目不存在');
    const body = await readBody(req);
    const thread = await createThread({
      projectId: params.id,
      kind: body.kind === 'page' ? 'page' : 'main',
      pageId: body.pageId || '',
      title: body.title || '',
      mode: body.mode || 'unset',
    });
    json(res, 201, thread);
  }),

  route('GET', '/api/threads/:threadId', async ({ res, params }) => {
    const thread = await getThread(params.threadId);
    if (!thread) return fail(res, 404, '对话不存在');
    json(res, 200, thread);
  }),

  route('PUT', '/api/threads/:threadId', async ({ req, res, params }) => {
    const thread = await getThread(params.threadId);
    if (!thread) return fail(res, 404, '对话不存在');
    const body = await readBody(req);
    if (body.mode && ['single', 'sub', 'unset'].includes(body.mode)) thread.mode = body.mode;
    if (typeof body.title === 'string') thread.title = body.title;
    await saveThread(thread);
    json(res, 200, thread);
  }),

  route('DELETE', '/api/threads/:threadId', async ({ res, params }) => {
    const ok = await deleteThread(params.threadId);
    if (!ok) return fail(res, 404, '对话不存在');
    json(res, 200, { ok: true });
  }),

  // 一次发言 = 一条 SSE 流
  route('POST', '/api/threads/:threadId/messages', async ({ req, res, params }) => {
    const thread = await getThread(params.threadId);
    if (!thread) return fail(res, 404, '对话不存在');
    const settings = await getRawSettings();
    const body = await readBody(req);
    const text = String(body.text || '').trim();
    const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
    if (!text && !images.length) return fail(res, 400, '说点什么再发');
    if (body.mode && ['single', 'sub'].includes(body.mode)) thread.mode = body.mode;

    const dataUrls = (await Promise.all(images.map((u) => toDataUrl(u, thread.projectId)))).filter(Boolean);
    const userMessage =
      dataUrls.length > 0
        ? {
            role: 'user',
            content: [
              ...(text ? [{ type: 'text', text }] : []),
              ...dataUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          }
        : { role: 'user', content: text };

    thread.messages.push(userMessage);
    await saveThread(thread);

    const stream = sse(res);
    stream.onClientClose(() => {});

    // 没选模式先问模式：不浪费一次大模型调用，回答是固定的
    if (thread.mode === 'unset') {
      thread.messages.push({ role: 'assistant', content: MODE_QUESTION });
      await saveThread(thread);
      stream.send('mode_question', { question: MODE_QUESTION });
      stream.send('text', { text: MODE_QUESTION });
      stream.send('done', { text: MODE_QUESTION });
      stream.close();
      return;
    }

    const emit = (type, data) => stream.send(type, data);

    const hooks = {
      dispatch: thread.mode === 'sub',
      generate: async (args) => {
        const page = await getPage(thread.projectId, args.pageId);
        if (!page) throw new Error('页面不存在');
        const project = await getProject(thread.projectId);
        const prepared = await prepareGeneration({ project, page, settings, body: args });
        if (!prepared.ok) throw new Error(prepared.error);
        const job = createJob({
          projectId: thread.projectId,
          pageId: page.id,
          pageIndex: page.index,
          seed: prepared.seed,
          workflow: prepared.workflow,
        });
        runGeneration({ projectId: thread.projectId, page, prepared, settings, job });
        return { jobId: job.id, seed: prepared.seed, workflow: prepared.workflow };
      },
    };

    try {
      emit('start', { threadId: thread.id, mode: thread.mode });
      await runAgent({ thread, settings, emit, hooks });
    } catch (err) {
      emit('error', { message: err.message || String(err) });
      stream.send('done', { text: '' });
    } finally {
      stream.close();
    }
  }),
];
