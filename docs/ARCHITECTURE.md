# 架构

## 三层，依赖方向只有一个

```
core/   ← 纯函数，浏览器和 Node 都 import。不许依赖 server/ 或 web/
server/ ← Node，import core/。不 import web/
web/    ← 浏览器，import core/（通过 /core/*.mjs 静态路由）。不 import server/
```

为什么这样切：编译逻辑（页面文档 → Moss JSON）必须**只有一份实现**。如果前端预览和后端提交各写一遍，早晚出现「预览是对的、发出去的不对」。现在前端直接在自己的进程里编译（`/core/compile.mjs` 由服务端静态托管），后端提交前也用同一个函数编译，两边不可能不一致。

## 数据流

```
浏览器
  页序/画布 ──(PUT /api/projects/:id/pages/:pageId)──► data/projects/<id>/pages/<page>.json
      │
      └─ 本地调用 core/compile.mjs 得到提示词（即时预览，不打扰服务端）

生成
  POST /pages/:page/generate
      → prepareGeneration()：编译 + 填工作流占位符
      → ComfyUI /prompt
      → 轮询 /history（WebSocket 只用来推进度）
      → 取图 → 存 data/.../images/<sha256>.png
      → 追加版本记录到页面文件
      → SSE /api/jobs/stream 推给前端
```

## 为什么零构建

- 没有打包步骤 → 改一个 `.mjs`，刷新页面就生效，AI 改完不用「等你跑 build」。
- 没有 `node_modules` → 后端只用 `node:http`、`node:fs`、`fetch`、`WebSocket`、`node:crypto`。
- 前端 Preact + htm 用 import map 从 CDN 或 `web/vendor/` 加载，代码里没有 JSX 编译产物。

代价是没有类型检查、没有 tree-shaking。对这个体量的工具是划算的。

## 文件职责

| 文件 | 职责 | 改它的时机 |
|---|---|---|
| `core/manga-doc.mjs` | 文档结构、坐标换算 `toMoss`/`fromMoss`、形状/机位/画风的措辞表 | 加字段、加形状、加机位 |
| `core/compile.mjs` | 文档 → Moss JSON | 改提示词拼法 |
| `core/validate.mjs` | 提交前检查（error 拦截生成，warn 只提醒） | 加规则 |
| `core/bubbles.mjs` | 八种气泡的英文形态描述 | 改气泡文案 |
| `core/presets.mjs` | 版式预设、示例页 | 加版式 |
| `core/placeholders.mjs` | 工作流占位符扫描/填充 | 改参数类型推断 |
| `core/decompile.mjs` | Moss JSON → 文档（导入用） | 提高反推准确度 |
| `server/http.mjs` | 路由、静态、SSE | 极少改 |
| `server/store.mjs` | JSON 文件存储 + 设置脱敏 | 加存储实体 |
| `server/comfy.mjs` | ComfyUI 客户端 | 换端点、加能力探测 |
| `server/llm.mjs` | OpenAI 兼容客户端 | 换协议 |
| `server/agent/*` | 工具定义、循环、提示词 | 加工具、调策略 |
| `web/pages/*` | 页面级组件 | 改界面 |
| `web/components/canvas.mjs` | SVG 画布与拖拽 | 改交互 |

## 硬约束（改代码前必须知道）

1. **坐标**：文档里一律「左上原点、绝对像素 `[x1,y1,x2,y2]`」；只有 `core/manga-doc.mjs` 的 `toMoss()` 做中心原点 `yxyx` 转换。别在别处再写一遍换算。
2. **尺寸是 16 的倍数**：这样 `W/2`、`H/2` 是整数，转换不丢精度。默认 768×1280。
3. **Moss JSON 只允许 `summary` + 扁平 `items`**：多一个 `id`/`children` 字段模型就解析失败。`core/validate.mjs` 会拦。
4. **单行 JSON**：提交前必须是 `JSON.stringify` 的结果，不能是格式化过的多行。
5. **设置里的密钥不回传前端**：`getSettings()` 返回的是脱敏版本，前端提交空字符串表示「不修改」。

## 请求清单

| 方法 | 路径 | 用途 |
|---|---|---|
| GET/PUT | `/api/settings` | 读写设置（key 脱敏） |
| POST | `/api/settings/test-comfy` `/test-llm` | 连通性自检 |
| GET | `/api/workflows` `/api/workflows/:name` | 工作流列表与内容 |
| PUT | `/api/workflows/:name` | 保存工作流 |
| GET | `/api/comfy/models` | 从 ComfyUI 拉检查点/LoRA/采样器 |
| GET/POST | `/api/projects` | 项目列表/新建 |
| GET/PUT/DELETE | `/api/projects/:id` | 项目读写 |
| GET/POST | `/api/projects/:id/pages` | 页面列表/新建 |
| GET/PUT/DELETE | `/api/projects/:id/pages/:pageId` | 页面读写 |
| POST | `/api/projects/:id/pages/:pageId/compile` | 编译预览（服务端版） |
| POST | `/api/projects/:id/pages/:pageId/generate` | 提交生成 |
| POST | `/api/projects/:id/pages/:pageId/graph` | 只看「会发给 ComfyUI 什么」 |
| GET | `/api/jobs` `/api/jobs/:id` `/api/jobs/stream` | 任务与进度 |
| GET/POST | `/api/projects/:id/threads` | 对话线程 |
| POST | `/api/threads/:id/messages` | 发消息（SSE） |
| GET | `/core/:file` | 把 core 暴露给浏览器 import |
| GET | `/media/:projectId/:file` | 生成图 |
