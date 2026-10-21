# moss-manga

用 MOSS 模型画漫画的**技能包**。Agent 读 `SKILL.md` 就知道怎么问配置、怎么构思、怎么建页、怎么出图；你在浏览器里看和改，改完让它重出。

没有 LLM 客户端、没有内置 Agent——思考交给你的 Agent，这个包只提供「存档格式 + 命令 + 预览界面」。

- 旧的全栈版（带 Agent 对话）在 git 分支 `v1-fullstack`。
- 零构建、零 `npm install`，只用 Node 内置模块。

## 安装

把整个目录放进你的技能目录，**文件夹名用 `moss-manga`**：

```
<技能目录>/moss-manga/
├── SKILL.md          ← Agent 读这个
├── references/       ← 格式、CLI、工作流、配方
├── scripts/          ← CLI 与实现
├── core/             ← 编译/校验纯函数
├── web/              ← 预览编辑器
└── workflows/        ← 内置工作流模板（兜底）
```

装好后跑一次自检：

```bash
node scripts/manga.mjs doctor
```

## 配置与存档是两棵树

```
~/.moss-manga/            ← 配置根（MOSS_CONFIG 可覆盖）
├── config.json           ComfyUI 地址、当前工作流、默认参数、编辑范围
└── workflows/            全局工作流，跟存档无关
~/.moss-manga/archive/    ← 存档（config.archive 或 --dir 可改）
├── state.json  journal.jsonl
└── projects/<slug>/{project.json,pages/,versions.json,images/}
```

换存档不丢配置；工作流只属于配置，`manga workflow path` 就能拿到该写到哪。

## Agent 的固定流程

1. `manga doctor --json` → 没配置就依次问：ComfyUI 地址 → 要 Moss 工作流 → 允许改哪些部分 → 存档位置。
2. 工作流：用户原样发 API JSON，**Agent 自己读、自己改成带占位符的完整文件**，`manga workflow save` + `check`。脚本不做任何猜测式替换。
3. 构思剧情、人物、分页脚本，**发给用户确认**。
4. `project new` → `page new --preset` → `page set --file patch.json` → `compile` → `render`。
5. `serve --open` 让用户看。
6. 用户改完 → `manga changes --json` 只看差异 → 重出 → `ack`。

细节在 `SKILL.md`，字段说明在 `references/FORMAT.md`。

## 命令速查

```bash
manga doctor                                  # 配置体检
manga init --comfy http://127.0.0.1:8188      # 初始化配置 + 存档
manga workflow path                           # 工作流该放哪
manga workflow save moss.json                 # 校验并保存（不改内容）
manga workflow check                          # 看占位符齐不齐
manga project new --name "雨中的便利店"
manga page new --preset band-3
manga page show --page 1 --summary            # 紧凑大纲，省上下文
manga page set --page 1 --file patch.json     # 数组按 id 合并，只改你写的
manga compile --page 1                        # 看 Moss JSON 与校验
manga render --page 1                         # 出图
manga changes                                 # 自上次 ack 的差异
manga serve --open                            # 浏览器预览
```

完整参数见 `references/CLI.md`。

## 页面文件是唯一真源

`pages/p01.json` 是薄语义层（格子、气泡、文字、机位），Moss 的原始 JSON 由 `compile` 现算——那东西是中心原点负坐标的单行 JSON，人改不动。

每次保存都会 `rev+1` 并往 `journal.jsonl` 写一条语义操作，`manga changes` 只返回差异，Agent 不用重读所有页。

## 预览编辑器

```bash
node scripts/manga.mjs serve --open   # 或 node server.mjs
```

左页序 / 中画布 + 工作台（属性、提示词、历史、变更）/ 没有右栏。拖框即改，600ms 防抖保存。

## 开发与自测

```bash
npm test        # 编译契约 25 项 + PDF 结构 + 存档/diff 9 项
npm run check   # 全项目语法
npm run vendor  # 把前端依赖抓到本地，之后断网可用
```

## 边界

- 单用户本机，没有账号体系，别直接暴露公网。
- Moss 一次成像，没有局部重绘：改一格也是整页重跑。
- 中文文字渲染不稳定，编辑器给的是位置 + 字数预算，不是保证。
- 内置工作流只是通用 SD 图，要出真正的漫画必须换成你的 Moss 工作流。
