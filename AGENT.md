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

- 词表（形状 / 机位 / 画风 / 文字载体）：一项就是 `{ value, label, phrase }`，`label` 是界面上的字，`phrase` 是喂给模型的英文
- 类型与字段：页面字段和 item 字段是同一种格式，`compile({ item, page })` 决定怎么变成 Moss item
- 句子模板和 `buildSummary`：整页 summary 怎么写

需要调整内置提示词（形状、机位、画风、气泡措辞、句式）时，改这一个文件。

## 读什么

画的时候只读这两份：`references/FORMAT.md`（页面 JSON 怎么写，**包括编号、位置、说话人、summary 的手写约定**）、`references/TECHNIQUES.md`（版式、节奏、人物与背景）。
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
  - `desc` 英文，进提示词（面板=编号 + 位置 + 画面；气泡=位置 + 说话人；角色=这一格的差异）
- 需要完全自己控制某一格的提示词时，填 `caption`（填了就只用它，其他字段不再进提示词；边框和画风守卫也得自己补）

## 编号、位置、说话人都要自己写（重要）

编译器**不算版式**：不排面板名次、不判断文字落在哪一格、不描述九宫格方位。这些都得写在 `desc` 里：

- 面板：`PANEL ONE, the tall panel across the FULL WIDTH at the TOP of the page — …`
- 左右并排：`PANEL TWO, the RIGHT panel of the middle row, to the RIGHT of PANEL THREE`
- 气泡：`in the TOP LEFT of PANEL ONE, SPOKEN BY CHARACTER ONE - SHION`（**不要靠尾巴方向指认说话人**，气泡已经没有尾巴字段了）
- summary：`summaryCaption` 自己写格数、排布、每格剧情；角色表不用写，编译器会自动追加

## 多格页面容易踩的坑

写完一页，按这五条自查（细节在 `references/TECHNIQUES.md` 的「多格页面的硬规则」）：

- **特写格不要用角色项**：眼睛、手、衣褶这类放大格用 `native` 加 `Extreme close-up inset showing ONLY …`，用 `character` 会长出多余的头
- **双人拆两个框**：两个 `character` 项 X 之间留 30–140px，caption 写 `standing far apart on opposite ends of the panel`
- **并排小格对齐上边界**：左右并列两格的 `y1` 取同一个值，否则人物跨格
- **小格用半身景别**：6–7 格的页面里写 `waist-up medium shot`，不要 `full-body`，否则人物变四头身
- **气泡别贴着别人的头**：气泡 `bbox` 离其他人的头至少 80px；画面外的人说话要写 `tail-less bubble, NO pointer tail`（句式见 `references/FORMAT.md` 的 bubble 一节）

## 语序：先光后物

文本编码器是单向的，写在后面的词影响不到前面。所以 `desc` 和 `summaryCaption` 都按这个顺序：**镜头与光 → 人物与环境 → 动作表情 → 收尾否定句**。多角色同页时主角写第一段，第二个角色开头用 `In sharp contrast, …NO…` 切断它继承的色调与骨相。

## 人物的写法（重要）

- 角色一次写进项目：`node manga.mjs character add --id shion --name "CHARACTER ONE - SHION" --look "18, long straight black hair, NO glasses"`（网页里是顶栏「角色表」）
- **名字必须带编号**：`CHARACTER ONE - SHION` 这种形式，summary 的角色表靠它自动解析编号和名字
- 页面上加人：`node manga.mjs page add-character --page 12 --ref shion`，或者网页右栏「本页角色」勾选
- 人物项是 `ref` + 必填 `desc`：**这一格的文案你自己写全**——编号 + 名字 + 位置 + 姿势，编译器不补任何东西
- **格子里不写外貌**：外貌只写在角色表，summary 末尾的 `CHARACTERS IN THIS PAGE` 会自动带上
- 这一格跟角色表不一样（裸体、受伤、换装）：`desc` 开头加 `!`，该角色就不进本页角色表，外貌你自己在这格里写
- **格子只写场景**：`panel.desc` 不写人物长相、衣服、表情
- **提示词里名字只写罗马音**（汉字会被画到画面上）；但**对话台词里叫名字要用中文**（紫苑 / 冬真 / 枫）

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
