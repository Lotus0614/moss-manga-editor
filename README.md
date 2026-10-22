# moss-manga

- 使用 MOSS Image 创作生成漫画的工作台，可以由 Agent 生成漫画并手动调整生成的内容。
- 项目未添加任何依赖，所有都通过原生JS实现，方便 Agent 对项目进行修改。
- 项目目前在探索阶段，一些文档和提示词编辑方式完全由作者总结而出，有些地方可能不够理想，欢迎实践后提交 PR 让生图体验更好更稳定。有任何关于项目的问题、想要的功能、经验分享可以加群：1082160486

## 特点

- **分镜即数据**：一页是一份 JSON，面板、气泡、原生元素共用一个 `items` 数组，坐标直接对应画面
- **提示词可改**：形状、机位、画风、气泡措辞、句式都在 `config/` 里，改文件即生效，不用动代码
- **编译有校验**：越界、空描述、文字溢出、气泡重叠会在出图前报错
- **历史可回看**：每次渲染存一个版本，带 seed 与 prompt 快照
- **网页可编辑**：拖版面、改台词、调透明度、缩放平移

## 快速开始

把 `INSTALL.md` 发给 AI，它会按流程完成安装与配置。

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
scripts/         命令行
web/             网页编辑器
references/      格式、命令、工作流、漫画技巧
INSTALL.md       安装步骤（可整份交给 AI 执行）
AGENT.md         工作手册（画画流程与约定）
```

## 文档

| 需要什么                                             | 看哪里                     |
| ---------------------------------------------------- | -------------------------- |
| 安装                                                 | `INSTALL.md`               |
| 画一页的流程                                         | `AGENT.md`                 |
| 页面 JSON 与坐标                                     | `references/FORMAT.md`     |
| 命令参数                                             | `references/CLI.md`        |
| ComfyUI 工作流与占位符                               | `references/WORKFLOW.md`   |
| 分镜版式、节奏、人物、背景                           | `references/TECHNIQUES.md` |
| MOSS 官方 Layout JSON 规范（一般情况不用读这个文档） | `references/MOSSS_LAYOUT.md` |

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
