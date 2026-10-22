# moss-manga

AI 写提示词、本地 ComfyUI（MOSS 模型）出图的漫画工作台。
零依赖，只要求 Node 22+；所有提示词都可改，改了就能重出。

## 三条上手路径

**① 让 AI 装（推荐）**
把本目录里的 `INSTALL.md` 发给 AI，让它按步骤做：确认项目位置 → 拉取 → 配 ComfyUI → 导工作流 → 问默认值 → 收尾。

**② 手动装**

```bash
git clone <仓库地址> my-manga && cd my-manga
node manga.mjs init
node manga.mjs config set comfy.url=http://127.0.0.1:8188
node manga.mjs workflow save ./moss.api.json
node manga.mjs workflow check
```

**③ 只想看看界面**

双击 `start.bat`（首次会自动生成配置并打开浏览器）。

## 目录

```
manga.mjs         入口
config/           配置：类型、词表、句式、工作流、生图参数   ← 改这里
data/             作品：项目、页面、图片                    ← 产物
core/             引擎：坐标换算、编译、校验
defaults/         配置的出厂默认值（init 时复制到 config/）
scripts/          命令行
web/              网页编辑器（预览、拖版面、改台词）
references/       格式、命令、工作流、漫画技巧
INSTALL.md        给 AI 的安装步骤
AGENT.md          给 AI 的工作手册（画漫画的流程与规矩）
```

## 文档地图

| 什么时候读 | 读哪个 |
|---|---|
| 第一次安装 | `INSTALL.md` |
| 每天画漫画 | `AGENT.md` |
| 页面 JSON 每个字段什么意思、坐标怎么算 | `references/FORMAT.md` |
| 查命令参数 | `references/CLI.md` |
| ComfyUI 工作流怎么接、占位符怎么写 | `references/WORKFLOW.md` |
| 画得不够好看：分镜节奏、气泡、人物、背景 | `references/TECHNIQUES.md` |
| 整体怎么用 | `README.md`（本文） |

## 它能做什么

- 把「分镜描述」编译成 MOSS Layout JSON（面板、气泡、原生元素、编号、文字归属）
- 提交 ComfyUI 出图，历史版本可回看
- 网页里直接拖版面、改台词、改提示词，改完再出一版
- 所有措辞（形状、机位、画风、气泡、句式）都在 `config/` 里，改完即生效

## 需要什么

- Node 22 或更高
- 一个跑起来的 ComfyUI（默认 `http://127.0.0.1:8188`）
- 一份 MOSS 工作流，用 ComfyUI 的「导出 (API)」保存

## 常用命令

```bash
node manga.mjs doctor                    # 状态检查
node manga.mjs project new --name "雨夜"
node manga.mjs page new --title "第 1 页"
node manga.mjs compile --page 1          # 只编译，不出图
node manga.mjs render --page 1           # 出图
node manga.mjs serve                     # 网页预览 http://127.0.0.1:5123
node manga.mjs stop
```

## 遇到问题

- **连不上 ComfyUI** → `node manga.mjs doctor`，确认地址和端口
- **workflow check 报缺占位符** → 工作流里要有 `{{prompt}}` `{{width}}` `{{height}}`，其余参数用 `{{名字:默认值}}`
- **编译报错** → 错误码含义见 `references/FORMAT.md`
- **想换风格** → 改 `config/prompts.mjs` 的 `stylePresets`，不要动代码
