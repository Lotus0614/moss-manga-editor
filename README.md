# moss-manga

用本地 ComfyUI（MOSS 模型）出图的漫画工作台：AI 写分镜、编译成 Layout JSON、出图、网页里改完再出。

零依赖，Node 22+ 即可运行。

## 特点

- **分镜即数据**：一页是一份 JSON，面板、气泡、原生元素共用一个 `items` 数组，坐标直接对应画面
- **提示词可改**：形状、机位、画风、气泡措辞、句式都在 `config/` 里，改文件即生效，不用动代码
- **编译有校验**：越界、空描述、文字溢出、气泡重叠会在出图前报错
- **历史可回看**：每次渲染存一个版本，带 seed 与 prompt 快照
- **网页可编辑**：拖版面、改台词、调透明度、缩放平移

## 快速开始

推荐把 `INSTALL.md` 发给 AI。

也可以手动起：

```bash
node manga.mjs init
```

Windows 双击 `start.bat` 即可启动网页。

## 目录

```
manga.mjs        入口
config/          配置：类型、词表、句式、工作流、生图参数
data/            作品：项目、页面、图片
core/            引擎：坐标换算、编译、校验、占位符
defaults/        配置的出厂默认值
scripts/         命令行
web/             网页编辑器
references/      格式、命令、工作流、漫画技巧
INSTALL.md       安装步骤（可整份交给 AI 执行）
AGENT.md         工作手册（画画流程与约定）
```

## 文档

| 需要什么 | 看哪里 |
|---|---|
| 安装 | `INSTALL.md` |
| 画一页的流程 | `AGENT.md` |
| 页面 JSON 与坐标 | `references/FORMAT.md` |
| 命令参数 | `references/CLI.md` |
| ComfyUI 工作流与占位符 | `references/WORKFLOW.md` |
| 分镜版式、节奏、人物、背景 | `references/TECHNIQUES.md` |
| MOSS 官方 Layout JSON 规范 | `references/LAYOUT.md` |

## 常用命令

```bash
node manga.mjs doctor                 # 检查配置与 ComfyUI 连通性
node manga.mjs project new --name "雨夜"
node manga.mjs page new --title "第 1 页"
node manga.mjs compile --page 1       # 只编译，不出图
node manga.mjs render --page 1        # 出图
node manga.mjs serve                  # 网页预览
node manga.mjs stop
```

## 要求

- Node 22 或更高
- 运行中的 ComfyUI（默认 `http://127.0.0.1:8188`）
- 一份用「导出 (API)」保存的 MOSS 工作流

## License

MIT
