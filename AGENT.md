# AGENT

在这个工作区里画漫画的操作手册。默认按这里做，不要临时发明流程。

## 目录职责

| 路径 | 是什么 | 能不能改 |
|---|---|---|
| `config/` | 你的配置：类型、词表、句式、工作流、参数 | ✅ 随便改 |
| `data/` | 作品：项目、页面、图片 | 通过 CLI 改，别手改 |
| `core/` | 引擎：坐标、编译、校验 | ⚠️ 只有修 bug 才动 |
| `web/`、`scripts/` | 编辑器与命令行 | ⚠️ 只有修 bug 才动 |

**所有提示词相关的东西都在 `config/manga.mjs`**：

- 词表（形状 / 机位 / 画风 / 气泡 / 尾巴）：一项就是 `{ value, label, phrase }`，`label` 是界面上的字，`phrase` 是喂给模型的英文
- 类型与字段：页面字段和 item 字段是同一种格式，`compile({ item, page })` 决定怎么变成 Moss item
- 句子模板和 `buildSummary`：整页 summary 怎么写

需要调整内置提示词（形状、机位、画风、气泡措辞、句式）时，改这一个文件。

## 读什么

画的时候只读这两份：`references/FORMAT.md`（页面 JSON 怎么写）、`references/TECHNIQUES.md`（版式、节奏、人物与背景）。
**画成人向页面时先读 `references/R18-MANGA.md`**（满版、嵌格、同格双视角、文字与提示词模板）。
要查命令再加 `references/CLI.md`，要换工作流才读 `references/WORKFLOW.md`。

下面这些**画漫画时不要读**，只有加功能或改 bug 时才看：

```
core/   scripts/   server.mjs   web/   tools/   references/MOSSS_LAYOUT.md
```

`MOSSS_LAYOUT.md` 是 MOSS 官方 Layout 规范，`compile` 已经按它生成好 JSON，日常用不到。

## 检查配置

```bash
node manga.mjs doctor          # 未配置就先读 INSTALL.md
```

## 每个格子都要有中文备注（重要）

- 每个 item 的 `note` 写**中文**，一句话说清「这一格在干什么」：谁在做什么、这格的作用、关键道具
- `note` **不进提示词**，只是给人看的；画布上优先显示它，没有备注的格子会把英文提示词铺满，用户看不懂
- 用户提意见时，**先改 `note` / `desc` 让人看懂，再改 `desc` 里的具体画面**；两边分工：
  - `note` 中文，给人看
  - `desc` 英文，进提示词（面板=画面描述，气泡=特殊文字补充，角色=这一格的差异）
- 需要完全自己控制某一格的提示词时，填 `caption`（填了就只用它，其他字段不再进提示词）

## 人物的写法（重要）

- 角色一次写进项目：`node manga.mjs character add --id reina --name Reina --look "18, long straight black hair, red armband, NO glasses"`（网页里是顶栏「角色表」）
- 页面上加人：`node manga.mjs page add-character --page 12 --ref reina`，或者网页右栏「本页角色」勾选
- 人物项只有 `ref` + 可选 `desc`：**位置只靠 bbox**，朝向/遮挡/表情写在 `desc` 里，不写就不写
- 这一格整段不一样（裸体、受伤、换装）：`desc` 前面加 `!`，整段替换角色表外貌
- **格子只写场景**：`panel.desc` 不写人物长相、衣服、表情
- **名字只写罗马音**：提示词里的汉字会被模型当成「要画在画面上的字」

## 动手前必须先问

每个项目问一次。**没得到回答就不要建项目、不要写页面、不要开始想分镜。**

> 「这个项目想用什么画风：黑白网点 / 彩色 / 线稿？画布用 768×1280 还是别的（16 的倍数）？」

用户没回答就停在这里，不要替他选默认值。

## 画一页的完整流程

1. **构思**：定人物、场景、这页要推进什么。先把「分几格、每格画什么、谁说什么」写成一句话清单给用户确认，别直接开画。
2. **建项目**（本项目第一次画时）

```bash
node manga.mjs project new --name "项目名" --canvas 768x1280
```

   画风是项目级默认值：建项目时带过去，之后每一页都能单独改。

3. **建页**

```bash
node manga.mjs page new --title "第 1 页"
```

4. **写页面 JSON**（或直接改 `data/projects/<slug>/pages/pNN.json`）

   字段、坐标规则读 `references/FORMAT.md`；版式、节奏、人物与背景的写法读 `references/TECHNIQUES.md`。
5. **校验**

```bash
node manga.mjs compile --page 1
```

   有 `error` 就不能渲染，先修（空 caption、越界、文字溢出、气泡重叠都会报）。

6. **出图**

```bash
node manga.mjs render --page 1
```

7. **给用户看**：把图片路径或预览地址给用户，等反馈。

## 用户改完之后

**直接读页面文件**，不要看 diff、不要用 `changes`/`ack`：

```bash
cat data/projects/<slug>/pages/p01.json
```

改完重新 `render --page 1`。

用户开着网页时不用让他手动刷新：服务器盯着存档目录，你改了页面 JSON 或出了新图，网页会自动拉取最新的。如果他手上有没保存的改动，页面会出现「外部已更新 · 刷新」按钮，等他自己点。

## 常用命令

```bash
node manga.mjs project list
node manga.mjs page list
node manga.mjs page show --page 1 --summary
node manga.mjs compile --page 1
node manga.mjs render --page 1 [--seed 42]
node manga.mjs page set --page 1 --file patch.json   # 只改一条
node manga.mjs serve [--port 5123]
node manga.mjs stop
```
