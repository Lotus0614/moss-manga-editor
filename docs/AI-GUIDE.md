# 给要改这个项目的 AI

## 30 秒上手

```bash
node server.mjs        # http://127.0.0.1:5123
node core/self-test.mjs   # 编译契约，任何改动后都跑
node tools/check.mjs      # 全项目语法检查
```

没有 `npm install`，没有 build 步骤。改 `.mjs` → 刷新页面。**不要**引入打包器、TypeScript、框架依赖；这个项目的核心价值就是「改完立刻能看到」。

## 读文件的顺序

1. `README.md` —— 它是什么
2. `docs/ARCHITECTURE.md` —— 三层结构与请求表
3. `docs/DATA-MODEL.md` —— PageDoc 字段与坐标系
4. `core/compile.mjs` + `core/manga-doc.mjs` —— 真正要小心的两个文件
5. `docs/AGENT.md` / `docs/WORKFLOW.md` —— 只在改对应功能时读

## 五条不能破坏的约束

| # | 约束 | 破了会怎样 | 怎么验证 |
|---|---|---|---|
| 1 | 文档坐标是左上原点、`[x1,y1,x2,y2]`；只有 `toMoss()` 做中心原点 `yxyx` 转换 | 整页偏移或坐标转置 | `node core/self-test.mjs` 前 4 项 |
| 2 | 画布宽高是 16 的倍数 | 换算出现小数，模型落点漂 | `validatePage` 的 `size.grid` |
| 3 | Moss JSON 只有 `summary` + 扁平 `items`，每项只有 `label/caption/bbox/text` | ComfyUI 侧解析失败 | self-test「产物只含 summary / items」 |
| 4 | 提交前必须 `JSON.stringify` 成单行 | 同上 | self-test「输出是单行 JSON」 |
| 5 | 接口不回传明文密钥 | 泄漏 | `getSettings()` 里的 `maskSettings` |

改编译相关代码的标准动作：**先加一条 self-test，再改实现**。现在有 25 条，覆盖了文档给出的黄金用例（四格页、1536×1024 换算示例）。

## 常见改动落在哪

| 想做的事 | 改哪里 |
|---|---|
| 加一个分格形状 | `core/manga-doc.mjs` 的 `PANEL_SHAPES`（`phrase` 是喂模型的英文，`clip` 是编辑器预览）+ `web/components/canvas.mjs` 的 `shapeClip` |
| 加一种气泡 | `core/bubbles.mjs` 的 `BUBBLE_TYPES`（英文形态描述抄 Moss 文档 4.2 节）+ `web/lib.mjs` 的 `BUBBLE_LABELS` + canvas 的 `Bubble` 渲染分支 |
| 改提示词拼法 | `core/compile.mjs` 的 `buildSummary` / `panelCaption` / `bubbleCaption` |
| 加版式预设 | `core/presets.mjs` 的 `LAYOUT_PRESETS`（`build(w,h)` 返回 bbox 数组） |
| 加校验规则 | `core/validate.mjs`，`error` 会拦住生成 |
| 加 Agent 工具 | `server/agent/tools.mjs`：`toolSchemas()` 加声明 + `executeTool()` 加 case |
| 改 Agent 行为 | `server/agent/prompts.mjs`（规则）或 `loop.mjs`（轮数、压缩） |
| 加接口 | `server/routes/*.mjs` 导出 `routes` 数组，`server.mjs` 里已经汇总 |
| 改界面 | `web/pages/*` 页面、`web/components/*` 组件、`web/styles/storyboard.css` |
| 换配色 | 只改 `storyboard.css` 的 `:root` 五个颜色 |

## 调试手段

**看渲染结果**（不需要人肉开浏览器）：

```powershell
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
cmd /c "`"$chrome`" --headless=new --disable-gpu --user-data-dir=$env:TEMP\c1 --window-size=1680,1000 --virtual-time-budget=9000 --dump-dom http://127.0.0.1:5123/#/projects > $env:TEMP\dom.txt"
```

- `--dump-dom` 拿渲染后的 HTML，能查到组件有没有渲染、有没有报错。
- `--screenshot=路径` 直接出图，用来看版面。
- PowerShell 5.1 读 DOM 时注意用 `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)`，否则中文全是乱码。
- Chrome 有时没退出就返回，读文件前重试几次（我在排查时遇到过文件占用）。

**看接口**：`curl`/`Invoke-RestMethod` 直接打 `/api/...`。改页面后想确认「会发给 ComfyUI 什么」，用 `POST /api/projects/:id/pages/:pageId/graph`。

**看生成链路**：`GET /api/jobs/:id` 里有 `status/progress/error`，`error` 里通常是 ComfyUI 的原始异常。

## 容易踩的坑

1. **前端 import 要带 `../` 相对路径**：`web/pages/editor.mjs` 引 core 用 `../../core/compile.mjs`，服务端有 `/core/:file` 路由托管。别写成别名，没有 bundler。
2. **htm 不是 JSX**：`html\`<div class=${x} onClick=${fn}>`，事件属性名是 `onPointerDown` 这种驼峰，`class` 不是 `className`。
3. **Preact 的 state 更新是浅合并**：嵌套对象要整个替换（`setPage(p => ({...p, style: {...p.style, preset}}))`）。
4. **不要在 `setState` 更新函数里做副作用**：现在有几处顺手更新了 `pageRef`，能跑但属于妥协，新代码别学。
5. **`data/` 里是真实数据**：调试时先备份，或者用 `MOSS_DATA=/tmp/x` 指到别处。
6. **ComfyUI 可能没开**：设置页的「测试连接」会告诉你；生成失败不一定是代码问题。
