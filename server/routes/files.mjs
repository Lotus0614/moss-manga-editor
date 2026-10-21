// 图片与上传文件的读取。

import { json, fail, route, readRaw, sendFile } from '../http.mjs';
import { imagePath, saveUpload, uploadPath, extFromMime } from '../store.mjs';
import { resolve, join } from 'node:path';

const safeName = (name) => String(name).replace(/[^a-zA-Z0-9._-]/g, '');

// 浏览器要直接 import core/ 里的纯函数（编译器、校验器），所以把 core 目录也暴露出去
const CORE_DIR = resolve(process.env.MOSS_CORE || join(process.cwd(), 'core'));

export const routes = [
  route('GET', '/core/:file', async ({ res, params }) => {
    const file = safeName(params.file);
    if (!file) return fail(res, 400, '文件名非法');
    await sendFile(res, join(CORE_DIR, file), 'text/javascript; charset=utf-8');
  }),

  route('GET', '/media/:projectId/:file', async ({ res, params }) => {
    const file = safeName(params.file);
    if (!file) return fail(res, 400, '文件名非法');
    await sendFile(res, await imagePath(safeName(params.projectId), file));
  }),

  route('GET', '/uploads/:file', async ({ res, params }) => {
    const file = safeName(params.file);
    if (!file) return fail(res, 400, '文件名非法');
    await sendFile(res, uploadPath(file));
  }),

  // 前端直接把二进制塞进 body，content-type 决定扩展名
  route('POST', '/api/upload', async ({ req, res }) => {
    const buffer = await readRaw(req);
    if (!buffer.length) return fail(res, 400, '空文件');
    const saved = await saveUpload(buffer, extFromMime(req.headers['content-type']));
    json(res, 201, saved);
  }),
];
