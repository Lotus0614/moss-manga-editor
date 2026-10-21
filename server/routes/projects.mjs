// 项目 / 页面 / 编译预览。

import { json, fail, readBody, route } from '../http.mjs';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  listPages,
  getPage,
  savePage,
  createPageRecord,
  deletePage,
  reorderPages,
  emptyBible,
} from '../store.mjs';
import { compilePage } from '../../core/compile.mjs';
import { compileContext } from '../../core/bible.mjs';
import { applyPreset, seedPage } from '../../core/presets.mjs';
import { normalizePage } from '../../core/manga-doc.mjs';

async function requireProject(id, res) {
  const project = await getProject(id);
  if (!project) {
    fail(res, 404, '项目不存在');
    return null;
  }
  return project;
}

async function requirePage(projectId, pageId, res) {
  const page = await getPage(projectId, pageId);
  if (!page) {
    fail(res, 404, '页面不存在');
    return null;
  }
  return page;
}

export const routes = [
  route('GET', '/api/projects', async ({ res }) => {
    json(res, 200, { projects: await listProjects() });
  }),

  route('POST', '/api/projects', async ({ req, res }) => {
    const body = await readBody(req);
    const project = await createProject({ name: body.name, size: body.size, bible: body.bible });
    if (body.withSamplePage) {
      const page = await createPageRecord(project.id, {});
      await savePage(project.id, seedPage(page));
    }
    json(res, 201, await getProject(project.id));
  }),

  route('GET', '/api/projects/:id', async ({ res, params }) => {
    const project = await requireProject(params.id, res);
    if (!project) return;
    json(res, 200, project);
  }),

  route('PUT', '/api/projects/:id', async ({ req, res, params }) => {
    const project = await requireProject(params.id, res);
    if (!project) return;
    const body = await readBody(req);
    const patch = {};
    for (const key of ['name', 'size', 'cover', 'pageOrder']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.bible) patch.bible = { ...emptyBible(), ...body.bible };
    json(res, 200, await updateProject(params.id, patch));
  }),

  route('DELETE', '/api/projects/:id', async ({ res, params }) => {
    const project = await requireProject(params.id, res);
    if (!project) return;
    await deleteProject(params.id);
    json(res, 200, { ok: true });
  }),

  route('GET', '/api/projects/:id/pages', async ({ res, params }) => {
    const project = await requireProject(params.id, res);
    if (!project) return;
    json(res, 200, { pages: await listPages(params.id) });
  }),

  route('POST', '/api/projects/:id/pages', async ({ req, res, params }) => {
    const project = await requireProject(params.id, res);
    if (!project) return;
    const body = await readBody(req);
    let page = await createPageRecord(params.id, { title: body.title });
    if (body.blank) {
      page = await savePage(params.id, { ...page, panels: [], bubbles: [] });
    } else {
      // 默认给一页可直接用的版式：套预设，再补两个示例气泡
      const seeded = body.preset ? applyPreset(page, body.preset) : seedPage(page);
      page = await savePage(params.id, seeded);
    }
    json(res, 201, page);
  }),

  route('POST', '/api/projects/:id/reorder', async ({ req, res, params }) => {
    const project = await requireProject(params.id, res);
    if (!project) return;
    const body = await readBody(req);
    if (!Array.isArray(body.order)) return fail(res, 400, 'order 必须是页面 id 数组');
    json(res, 200, { pages: await reorderPages(params.id, body.order) });
  }),

  route('GET', '/api/projects/:id/pages/:pageId', async ({ res, params }) => {
    const page = await requirePage(params.id, params.pageId, res);
    if (!page) return;
    json(res, 200, page);
  }),

  route('PUT', '/api/projects/:id/pages/:pageId', async ({ req, res, params }) => {
    const page = await requirePage(params.id, params.pageId, res);
    if (!page) return;
    const body = await readBody(req);
    const merged = normalizePage({ ...page, ...body, id: page.id });
    json(res, 200, await savePage(params.id, merged));
  }),

  route('DELETE', '/api/projects/:id/pages/:pageId', async ({ res, params }) => {
    const page = await requirePage(params.id, params.pageId, res);
    if (!page) return;
    await deletePage(params.id, params.pageId);
    json(res, 200, { ok: true });
  }),

  // 编译预览：编辑器右边「这页会变成什么提示词」直接打这个接口
  route('POST', '/api/projects/:id/pages/:pageId/compile', async ({ res, params }) => {
    const project = await requireProject(params.id, res);
    if (!project) return;
    const page = await requirePage(params.id, params.pageId, res);
    if (!page) return;
    const compiled = compilePage(page, compileContext(project, page));
    json(res, 200, {
      json: compiled.json,
      doc: compiled.doc,
      warnings: compiled.warnings,
      stats: compiled.stats,
    });
  }),
];
