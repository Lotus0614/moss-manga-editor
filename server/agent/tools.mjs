// Agent 工具集：agent 只能通过这些函数改数据，不直接碰文件。

import { createPanel, createBubble, normalizeBbox, pageSize, uid } from '../../core/manga-doc.mjs';
import { compilePage } from '../../core/compile.mjs';
import { compileContext } from '../../core/bible.mjs';
import { applyPreset, LAYOUT_PRESETS } from '../../core/presets.mjs';
import {
  getProject,
  getPage,
  savePage,
  createPageRecord,
  deletePage,
  listPages,
  updateProject,
  emptyBible,
  savePage as storeSavePage,
} from '../store.mjs';
import { getRawSettings } from '../store.mjs';
import { createJob, getJob } from '../jobs.mjs';

const BBOX_HINT = 'bbox 用左上原点绝对像素 [x1,y1,x2,y2]，例如 [8,8,760,420]';

function bboxOf(input, page) {
  const size = pageSize(page);
  if (Array.isArray(input)) return normalizeBbox(input, size);
  if (input && typeof input === 'object') {
    if ('x1' in input) return normalizeBbox([input.x1, input.y1, input.x2, input.y2], size);
    if ('x' in input) return normalizeBbox([input.x, input.y, input.x + (input.w || 0), input.y + (input.h || 0)], size);
  }
  return null;
}

async function load(projectId, pageId) {
  const project = await getProject(projectId);
  if (!project) throw new Error('项目不存在');
  if (!pageId) return { project, page: null };
  const page = await getPage(projectId, pageId);
  if (!page) throw new Error('页面不存在');
  return { project, page };
}

function pickPatch(input, keys) {
  const patch = {};
  for (const key of keys) if (input?.[key] !== undefined) patch[key] = input[key];
  return patch;
}

const PANEL_KEYS = ['name', 'caption', 'camera', 'shape', 'frame', 'cast', 'locked'];
const BUBBLE_KEYS = ['text', 'type', 'tailDir', 'tailOff', 'vertical', 'fontSize', 'panelId', 'locked'];
const PAGE_KEYS = ['title', 'scene', 'cast', 'readingOrder'];

export function toolSchemas(mode = 'single') {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_project',
        description: '读取项目信息：名称、画布、人物设定（bible）、页面清单。',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_project',
        description: '改项目名、画布尺寸，或整体替换人物设定 bible。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            size: { type: 'string', enum: ['page', 'page-hd', 'square', 'wide'] },
            bible: {
              type: 'object',
              description: '角色卡数组：{characters:[{id,code,name,desc,recap,enabled}], scene, style}',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_pages',
        description: '列出所有页面的页码、标题、格数与状态。',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_page',
        description: '读取一页的完整内容（分格、气泡、设定、版本数）。',
        parameters: { type: 'object', properties: { pageId: { type: 'string' } }, required: ['pageId'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_page',
        description: '新建一页，可指定版式预设。默认给出三横带与两个示例气泡。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            preset: { type: 'string', enum: LAYOUT_PRESETS.map((p) => p.id) },
            blank: { type: 'boolean', description: 'true 表示建空白页' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_page',
        description: '改页级属性：标题、场景、出场人物、阅读顺序、风格。',
        parameters: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            title: { type: 'string' },
            scene: { type: 'string' },
            cast: { type: 'array', items: { type: 'string' } },
            readingOrder: { type: 'string', enum: ['rtl', 'ltr'] },
            style: { type: 'object', description: '{preset:"mono"|"color"|"sketch", lora, guardPerItem}' },
          },
          required: ['pageId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'apply_layout',
        description: '用版式预设重排这一页（会替换现有分格）。',
        parameters: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            preset: { type: 'string', enum: LAYOUT_PRESETS.map((p) => p.id) },
          },
          required: ['pageId', 'preset'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_page',
        description: '删除一页。',
        parameters: { type: 'object', properties: { pageId: { type: 'string' } }, required: ['pageId'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_panel',
        description: `加一个分格。${BBOX_HINT}；caption 写这一格看见什么，只写画面，不写心理活动。`,
        parameters: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            bbox: { type: 'array', items: { type: 'number' } },
            caption: { type: 'string' },
            camera: { type: 'string', enum: ['eye', 'high', 'low', 'wide', 'medium', 'close', 'xclose', 'ots', 'dutch'] },
            shape: { type: 'string' },
            frame: { type: 'string', enum: ['border', 'none', 'thick'] },
            name: { type: 'string' },
            cast: { type: 'array', items: { type: 'string' } },
          },
          required: ['pageId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_panel',
        description: '改一个分格的位置、形状、机位或画面描述。',
        parameters: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            panelId: { type: 'string' },
            bbox: { type: 'array', items: { type: 'number' } },
            caption: { type: 'string' },
            camera: { type: 'string' },
            shape: { type: 'string' },
            frame: { type: 'string' },
            name: { type: 'string' },
            cast: { type: 'array', items: { type: 'string' } },
          },
          required: ['pageId', 'panelId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'remove_panel',
        description: '删掉一个分格。',
        parameters: {
          type: 'object',
          properties: { pageId: { type: 'string' }, panelId: { type: 'string' } },
          required: ['pageId', 'panelId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_bubble',
        description: `加一条文字。${BBOX_HINT}；text 是要渲染的字原样内容，换行用 \\n。`,
        parameters: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            text: { type: 'string' },
            type: { type: 'string', enum: ['speech', 'shout', 'whisper', 'tremble', 'thought', 'heart', 'narration', 'sfx'] },
            bbox: { type: 'array', items: { type: 'number' } },
            panelId: { type: 'string' },
            tailDir: { type: 'string', enum: ['down-left', 'down', 'down-right', 'left', 'right', 'up-left', 'up', 'up-right'] },
            tailOff: { type: 'boolean' },
            fontSize: { type: 'number' },
            vertical: { type: 'boolean' },
          },
          required: ['pageId', 'text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_bubble',
        description: '改一条文字的内容、类型、位置或字号。',
        parameters: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            bubbleId: { type: 'string' },
            text: { type: 'string' },
            type: { type: 'string' },
            bbox: { type: 'array', items: { type: 'number' } },
            tailDir: { type: 'string' },
            tailOff: { type: 'boolean' },
            fontSize: { type: 'number' },
            panelId: { type: 'string' },
          },
          required: ['pageId', 'bubbleId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'remove_bubble',
        description: '删掉一条文字。',
        parameters: {
          type: 'object',
          properties: { pageId: { type: 'string' }, bubbleId: { type: 'string' } },
          required: ['pageId', 'bubbleId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'compile_page',
        description: '把这一页编译成 Moss Layout JSON 并返回校验结果。改完必看 warnings。',
        parameters: { type: 'object', properties: { pageId: { type: 'string' } }, required: ['pageId'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_page',
        description: '提交 ComfyUI 生成这一页的图片，返回 jobId。之后用 get_job 轮询。',
        parameters: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            seed: { type: 'number' },
            steps: { type: 'number' },
            cfg: { type: 'number' },
          },
          required: ['pageId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_job',
        description: '查生成任务状态；done 时会带上图片路径。',
        parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_versions',
        description: '列出这一页的历史生成版本（含 seed 与时间）。',
        parameters: { type: 'object', properties: { pageId: { type: 'string' } }, required: ['pageId'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'set_current_version',
        description: '把某一版设为当前采用版。',
        parameters: {
          type: 'object',
          properties: { pageId: { type: 'string' }, versionId: { type: 'string' } },
          required: ['pageId', 'versionId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_bible',
        description: '改人物设定与共用场景。characters 是完整数组，会整体替换。',
        parameters: {
          type: 'object',
          properties: {
            characters: { type: 'array', items: { type: 'object' } },
            scene: { type: 'string' },
            style: { type: 'object' },
          },
        },
      },
    },
  ];

  if (mode === 'sub') {
    tools.push({
      type: 'function',
      function: {
        name: 'dispatch_page_agent',
        description: '子 Agent 模式专用：把某一页的具体改动交给该页的子 Agent 执行。',
        parameters: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            instruction: { type: 'string', description: '给子 Agent 的明确指令' },
          },
          required: ['pageId', 'instruction'],
        },
      },
    });
  }

  return tools;
}

/**
 * 执行工具。ctx = {projectId, pageId, settings, thread, runSubAgent}
 */
export async function executeTool(ctx, name, args = {}) {
  const projectId = ctx.projectId;
  switch (name) {
    case 'get_project': {
      const project = await getProject(projectId);
      if (!project) throw new Error('项目不存在');
      const pages = await listPages(projectId);
      return { project, pages };
    }

    case 'update_project': {
      const patch = pickPatch(args, ['name', 'size']);
      if (args.bible) patch.bible = { ...emptyBible(), ...args.bible };
      return await updateProject(projectId, patch);
    }

    case 'list_pages': {
      return { pages: await listPages(projectId) };
    }

    case 'get_page': {
      const { page } = await load(projectId, args.pageId);
      return page;
    }

    case 'create_page': {
      let page = await createPageRecord(projectId, { title: args.title });
      if (args.blank) page = await storeSavePage(projectId, { ...page, panels: [], bubbles: [] });
      else if (args.preset) page = await storeSavePage(projectId, applyPreset(page, args.preset));
      return { pageId: page.id, index: page.index, panels: page.panels.length };
    }

    case 'update_page': {
      const { page } = await load(projectId, args.pageId);
      const patch = pickPatch(args, PAGE_KEYS);
      if (args.style) patch.style = { ...page.style, ...args.style };
      const saved = await savePage(projectId, { ...page, ...patch });
      return { pageId: saved.id, title: saved.title };
    }

    case 'apply_layout': {
      const { page } = await load(projectId, args.pageId);
      const saved = await storeSavePage(projectId, applyPreset(page, args.preset));
      return { pageId: saved.id, panels: saved.panels.map((p) => ({ id: p.id, name: p.name, bbox: p.bbox })) };
    }

    case 'delete_page': {
      await deletePage(projectId, args.pageId);
      return { ok: true };
    }

    case 'add_panel': {
      const { page } = await load(projectId, args.pageId);
      const bbox = bboxOf(args.bbox, page);
      const panel = createPanel({
        ...pickPatch(args, PANEL_KEYS),
        ...(bbox ? { bbox } : {}),
      });
      const saved = await savePage(projectId, { ...page, panels: [...page.panels, panel] });
      return { panelId: panel.id, bbox: panel.bbox, panels: saved.panels.length };
    }

    case 'update_panel': {
      const { page } = await load(projectId, args.pageId);
      const idx = page.panels.findIndex((p) => p.id === args.panelId);
      if (idx < 0) throw new Error('找不到这个分格');
      const patch = pickPatch(args, PANEL_KEYS);
      const bbox = bboxOf(args.bbox, page);
      if (bbox) patch.bbox = bbox;
      page.panels[idx] = { ...page.panels[idx], ...patch };
      await savePage(projectId, page);
      return { ok: true, panel: page.panels[idx] };
    }

    case 'remove_panel': {
      const { page } = await load(projectId, args.pageId);
      await savePage(projectId, { ...page, panels: page.panels.filter((p) => p.id !== args.panelId) });
      return { ok: true };
    }

    case 'add_bubble': {
      const { page } = await load(projectId, args.pageId);
      const size = pageSize(page);
      const bbox =
        bboxOf(args.bbox, page) || [
          Math.round(size.width * 0.3),
          Math.round(size.height * 0.12),
          Math.round(size.width * 0.7),
          Math.round(size.height * 0.22),
        ];
      const bubble = createBubble({ ...pickPatch(args, BUBBLE_KEYS), bbox });
      const saved = await savePage(projectId, { ...page, bubbles: [...page.bubbles, bubble] });
      return { bubbleId: bubble.id, bbox: bubble.bbox, bubbles: saved.bubbles.length };
    }

    case 'update_bubble': {
      const { page } = await load(projectId, args.pageId);
      const idx = page.bubbles.findIndex((b) => b.id === args.bubbleId);
      if (idx < 0) throw new Error('找不到这条文字');
      const patch = pickPatch(args, BUBBLE_KEYS);
      const bbox = bboxOf(args.bbox, page);
      if (bbox) patch.bbox = bbox;
      page.bubbles[idx] = { ...page.bubbles[idx], ...patch };
      await savePage(projectId, page);
      return { ok: true, bubble: page.bubbles[idx] };
    }

    case 'remove_bubble': {
      const { page } = await load(projectId, args.pageId);
      await savePage(projectId, { ...page, bubbles: page.bubbles.filter((b) => b.id !== args.bubbleId) });
      return { ok: true };
    }

    case 'compile_page': {
      const { project, page } = await load(projectId, args.pageId);
      const compiled = compilePage(page, compileContext(project, page));
      return {
        json: compiled.json,
        warnings: compiled.warnings,
        stats: compiled.stats,
      };
    }

    case 'generate_page': {
      if (!ctx.generate) throw new Error('生成能力不可用');
      return await ctx.generate(args);
    }

    case 'get_job': {
      const job = getJob(args.jobId);
      if (!job) throw new Error('任务不存在');
      return job;
    }

    case 'list_versions': {
      const { page } = await load(projectId, args.pageId);
      return {
        versions: (page.versions || []).map((v) => ({
          id: v.id,
          at: v.at,
          image: v.image,
          seed: v.seed,
          ms: v.ms,
        })),
        currentVersionId: page.currentVersionId || '',
      };
    }

    case 'set_current_version': {
      const { page } = await load(projectId, args.pageId);
      if (!(page.versions || []).some((v) => v.id === args.versionId)) throw new Error('版本不存在');
      await savePage(projectId, { ...page, currentVersionId: args.versionId });
      return { ok: true };
    }

    case 'update_bible': {
      const project = await getProject(projectId);
      const bible = { ...emptyBible(), ...project.bible };
      if (args.characters) bible.characters = args.characters;
      if (args.scene !== undefined) bible.scene = args.scene;
      if (args.style) bible.style = { ...bible.style, ...args.style };
      await updateProject(projectId, { bible });
      return { ok: true, bible };
    }

    case 'dispatch_page_agent': {
      if (!ctx.runSubAgent) throw new Error('子 Agent 模式没开启');
      return await ctx.runSubAgent({ pageId: args.pageId, instruction: args.instruction });
    }

    default:
      throw new Error(`没有这个工具：${name}`);
  }
}

export { createJob, getRawSettings, uid };
