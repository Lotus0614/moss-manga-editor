# INSTALL

给 AI 看的安装说明。按顺序做，不要跳步，也不要提前做后面的步骤。

两条前提：

- **没拿到工作流 JSON 之前，不要问「哪些参数要做成占位符」**——你不知道里面有什么节点、哪些值值得暴露，问了用户也没法回答。
- 安装阶段不要读 `core/`、`scripts/`、`web/`、`tools/` 的代码，也不要读 `references/MOSSS_LAYOUT.md`。这些只在加功能、改 bug 时才看。

## 1. 确认项目位置

先问用户：

> 「我打算把漫画工作台放在 `/当前工作区路径`，可以吗？还是你想放到别的目录？」

- 用户说可以 → 就在当前工作区落地
- 用户给了别的路径 → 到那个目录落地，并在后续所有命令里用它
- **不要**放到技能/临时目录；这里会成为长期项目根，`data/` 里是作品

## 2. 拉取项目

```bash
git clone https://github.com/Lotus0614/moss-manga-editor.git .
# 或者把压缩包解到当前目录
```

拉完目录里应该有：`manga.mjs`、`config/`、`core/`、`scripts/`、`web/`、`references/`、`start.bat`。

**不要**在此时手动建 `data/`——下一步会生成。

## 3. 初始化

```bash
node manga.mjs init
```

它会创建：

```
config/config.json        ComfyUI 地址、当前工作流、出图参数
config/workflows/         放工作流 JSON
data/                     存档（projects/ images/ state.json）
```

`config/` 里的 `types.mjs`、`prompts.mjs`、`helpers.mjs`、`ui.mjs` 随代码一起下来，不用生成，已存在的文件也不会被覆盖。

## 4. 配 ComfyUI

问用户：

> 「ComfyUI 跑在哪个地址？默认 `http://127.0.0.1:8188`。」

```bash
node manga.mjs config set comfy.url=http://127.0.0.1:8188
node manga.mjs doctor          # 应该显示 ComfyUI 可连
```

连不上时确认：ComfyUI 是否启动、端口是否被改、是否在另一台机器（远程要带 `http://IP:端口`）。

## 5. 要工作流 JSON

**这一步只要 JSON，别问参数。**

> 「把 ComfyUI 里调好的工作流用『导出 (API)』存成 JSON，把文件路径或内容发我。」

拿到之后，先自己读一遍 JSON：顶层是 `节点 id → { class_type, inputs }` 才算 API 格式（不是 `nodes` / `links` 那种界面格式）。

然后按 `references/WORKFLOW.md` 改：

- 要暴露的值写成 `{{名字:默认值}}`，例如 `"steps": "{{steps:28}}"`、`"cfg": "{{cfg:6.5}}"`
- `{{prompt}}`、`{{width}}`、`{{height}}` 保留（这三个由代码填）
- 检查点写成 `{{ckpt:D:\models\xxx.safetensors}}`

```bash
node manga.mjs workflow save ./moss.api.json
node manga.mjs workflow check
```

## 6. 推荐可调参数

看过 JSON 之后才做这一步，因为是照着里面的节点提建议，不是让用户凭空列举。

> 「这个工作流里有：检查点 / 步数 / CFG / 采样器 / LoRA / 尺寸……我建议把 A、B、C 做成可填，其余固定在工作流里，行吗？」

按回答把对应字段改成占位符，再 `workflow check` 确认。

`config/config.json` 的 `params` 里会保存这些值，网页的设置页也能改。

## 7. 收尾：让用户选怎么开始

原样把这段发给用户：

```
装好了。

接下来你想怎么开始？
A. 就在这个对话里开始画 —— 我会读 AGENT.md，按「构思剧情 → 分镜确认 → 出图 → 你改我重出」走
B. 新开一个对话，把这个目录当工作区 —— 那边我同样按 AGENT.md 工作
C. 先看看界面 —— 双击 start.bat，或者我现在帮你跑 node manga.mjs serve
```

- 选 **A** → 立刻读 `AGENT.md`，进入画漫画流程
- 选 **B** → 到此为止，不要继续
- 选 **C** → `node manga.mjs serve --open`，把 `http://127.0.0.1:5123` 给用户，并说明「你自己也能建项目、改页面，改完我重出」
