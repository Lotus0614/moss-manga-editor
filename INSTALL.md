# INSTALL

给 AI 看的安装说明。按顺序做，不要跳步。

## 1. 确认项目位置

先问用户：

> 「我打算把漫画工作台放在 `/当前工作区路径`，可以吗？还是你想放到别的目录？」

- 用户说可以 → 就在当前工作区落地
- 用户给了别的路径 → 到那个目录落地，并在后续所有命令里用它
- **不要**放到技能/临时目录；这里会成为长期项目根，`data/` 里是作品

## 2. 拉取项目

```bash
git clone <仓库地址> .
# 或者把压缩包解到当前目录
```

拉完目录里应该有：`manga.mjs`、`core/`、`defaults/`、`scripts/`、`web/`、`references/`、`start.bat`。

**不要**在此时手动建 `config/`、`data/`——下一步会生成。

## 3. 初始化

```bash
node manga.mjs init
```

它会创建：

```
config/            config.json + types.mjs + prompts.mjs + bubbles.mjs + helpers.mjs + workflows/
data/              存档（projects/ images/ …）
```

已存在的文件不会被覆盖。

## 4. 配 ComfyUI

问用户：

> 「ComfyUI 跑在哪个地址？默认 `http://127.0.0.1:8188`。」

```bash
node manga.mjs config set comfy.url=http://127.0.0.1:8188
node manga.mjs doctor          # 应该显示 ComfyUI 可连
```

连不上时确认：ComfyUI 是否启动、端口是否被改、是否在另一台机器（远程要带 `http://IP:端口`）。

## 5. 配工作流

> 「把 ComfyUI 里调好的工作流用『导出 (API)』存成 JSON，把文件路径或内容发我。」

拿到后由你（AI）改写：

- 要暴露的参数写成 `{{名字:默认值}}`，例如 `"steps": "{{steps:28}}"`、`"cfg": "{{cfg:6.5}}"`
- 必须保留 `{{prompt}}`、`{{width}}`、`{{height}}`（这三个由代码填）
- 检查点写成 `{{ckpt:D:\models\xxx.safetensors}}`

```bash
node manga.mjs workflow save ./moss.api.json
node manga.mjs workflow check
```

## 6. 问默认值（一次问完）

> 「定几个默认值，之后新建页面都用它（以后也能在项目设置里改）：
> ① 阅读顺序：右→左还是左→右？
> ② 画风：黑白网点 / 彩色 / 线稿？
> ③ 文字：竖排还是横排？
> ④ 画布尺寸：768×1280 还是别的（16 的倍数）？」

```bash
node manga.mjs config set defaults.reading=rtl defaults.style=mono defaults.vertical=true "defaults.canvas=[768,1280]"
```

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
