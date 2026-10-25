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

工作流分两份，别混：

- **生图**（`workflow.name`，MOSS）：要 `{{prompt}}` + `{{width}}` + `{{height}}`，产出整页
- **修图**（`edit.name`，Qwen 编辑之类的编辑模型）：只要 `{{prompt}}` + `{{image}}`，模型、尺寸、步数全在那份工作流里

用户第一次发工作流时一次要两份（`INSTALL.md` 第 5 步）。修图那份是可选的：没有就跳过，网页不会出现修图按钮，`doctor` 里显示「修图：（未配置）」。

## 每个格子都要有中文备注（重要）

- 每个 item 的 `note` 写**中文**，一句话说清「这一格在干什么」：谁在做什么、这格的作用、关键道具
- `note` **不进提示词**，只是给人看的；画布上优先显示它，没有备注的格子会把英文提示词铺满，用户看不懂
- 用户提意见时，**先改 `note` / `desc` 让人看懂，再改 `desc` 里的具体画面**；两边分工：
  - `note` 中文，给人看
  - `desc` 英文，进提示词（面板=编号 + 位置 + 画面；气泡=位置 + 说话人；角色=这一格的差异）
- 需要完全自己控制某一格的提示词时，填 `caption`（填了就只用它，其他字段不再进提示词；边框与画风也得自己写清）

## 编号、位置、说话人都要自己写（重要）

编译器**不算版式**：不排面板名次、不判断文字落在哪一格、不描述九宫格方位。这些都得写在 `desc` 里：

- 面板：**编号必须有**，后面接方位与横竖，最后写画面：`PANEL ONE, top-left horizontal panel — …`、`PANEL THREE, the tall panel across the FULL WIDTH at the TOP — …`；一页之内连续、不重复
- 左右并排：`PANEL TWO, the RIGHT panel of the middle row, to the RIGHT of PANEL THREE`
- 气泡：`in the TOP LEFT of PANEL ONE, SPOKEN BY CHARACTER ONE - SHION`（**不要靠尾巴方向指认说话人**，气泡已经没有尾巴字段了）
- 剧情与版式一律写 `scene`，**不要填 `summaryCaption`**（填了就等于把自动的格数、文字数、角色表、text lock 全部关掉）；角色表会由 character 项自动追加

## desc 三段分工（重要）

一页出问题，九成是这三段写重了：

| 写在 | 写什么 | 不要写 |
|---|---|---|
| `panel.desc` | `PANEL n` + 方位 + **房间、道具、光、机位** | 人物长相、衣服、姿势（特写格除外：手、腕、皮肤这种没有 character 项的格子才写） |
| `character.desc` | 一句：`CHARACTER ONE — SHION, inside PANEL ONE only, at the LEFT of PANEL ONE, 姿势` | 外貌（在角色表）、解释句（「这是她唯一一次出现」会被画出来） |
| `bubble.desc` | 谁说的 + 尾巴朝哪：`spoken by CHARACTER TWO - TOUMA, pointing down toward his head`；不在画面里写 `no point, no tail, round speed bubbles` | 不要重复 `WHITE OVAL speech bubble with…`，`kind` 已经给了 |

三条硬规矩：

1. **同一个人只能在一处描述**。`panel.desc` 和 `character.desc` 各写一遍 → 模型画两份（第 12 页第一格画成三个人就是这个原因）。
2. **文字里的方位必须和 `bbox` 一致**。desc 说 `at the LEFT`，bbox 就得在左半边；说 RIGHT 就在右半边。
3. **人物 bbox 收紧到 150–300px 宽**，别占满整格，占太宽模型会往空处再塞人。

`scene` 只写三段：`SETTING:`（地点时间光）、`LAYOUT:`（几格、每格在哪、左右谁先读）、`STORY:`（每格发生什么）。不写 `BREAKOUT`、不写「谁是谁」的备注、不写阅读方向（编译器会加）。

## 破框要压到别的格子上

破框不是让人物冲到空白纸上——那块白纸本来就没内容，冲上去等于白扔版面。**破框是人物压到相邻那一格**：把他的 `bbox` 越过自己的格线 60–120px 伸进旁边那格的画面里，`desc` 写 `her hair sweeps UP across the top border of PANEL FOUR and is painted ON TOP of the panel above, its panel line passing BEHIND her hair`。头发、腿、手臂都行，前提是相邻那格是同一个场景。

## 多格页面容易踩的坑

写完一页，按这五条自查（细节在 `references/TECHNIQUES.md` 的「多格页面的硬规则」）：

- **特写格不要用角色项**：眼睛、手、衣褶这类放大格用 `native` 加 `Extreme close-up inset showing ONLY …`，用 `character` 会长出多余的头
- **双人拆两个框**：两个 `character` 项 X 之间留 30–140px，caption 写 `standing far apart on opposite ends of the panel`
- **并排小格对齐上边界**：左右并列两格的 `y1` 取同一个值，否则人物跨格
- **小格用半身景别**：6–7 格的页面里写 `waist-up medium shot`，不要 `full-body`，否则人物变四头身
- **气泡别贴着别人的头**：气泡 `bbox` 离其他人的头至少 80px；说话人不在画面里时把 `kind` 换成 `speech-notail`（对话·无指向），不要再靠尾巴指人（句式见 `references/FORMAT.md` 的 bubble 一节）

## 语序：先光后物

文本编码器是单向的，写在后面的词影响不到前面。所以 `desc` 和 `summaryCaption` 都按这个顺序：**镜头与光 → 人物与环境 → 动作表情 → 收尾否定句**。多角色同页时主角写第一段，第二个角色开头用 `In sharp contrast, …NO…` 切断它继承的色调与骨相。

## 人物的写法（重要）

- **只给主角建角色表**：需要跨页保持一致的人（1–3 个）才写进 `characters`，路人和背景人物直接用原生项（`label: object` / `label: character`）描述，不必建角色
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

   有 `error` 就不能渲染，先修（空 caption、越界、类型不认识都会报）。

6. **出图**

```bash
node manga.mjs render --page 1
```

7. **给用户看**：把图片路径或预览地址给用户，等反馈。

## 出图有瑕疵就修图（不要重画）

配了编辑模型时，页面上的小毛病用修图解决，别整页重出。**编辑模型只做「不改大布局」的修改**——它是照着原图重画，动到构图就会把格线、气泡、台词一起带偏。

| 该修 | 不该修（重新 render） |
|---|---|
| 气泡尾巴指错人、多了条尾巴 | 改机位 / 视角 / 景别 |
| 手上多一根手指、多一只手 | 换人、换脸、换装成另一个人 |
| 五官画崩、表情不对 | 改分镜格数、挪格子、改构图 |
| 台词糊了、写错了字 | 大改姿势、加一个角色 |
| 局部颜色不对、有小穿帮 | 整页重画 |

```bash
node manga.mjs edit --page 1 --prompt "把左上角气泡的尾巴删掉"
```

- **一句只说一件事**，位置说准：「左上角的气泡」「第三格右边那只手」「第二格她的外套」
- 修图拿这一页**当前采用的版本**当参考图，结果存成新版本（历史里带 ✎），原来的图不会被改
- 改歪了别硬修：在历史里换回上一版，或者重新 `render`；同一张图连着修不要超过 2～3 次
- 想让同样的指令出不同的结果，修图时加 `--seed`（不给就随机）
- `doctor` 里「修图：」是空的 = 没配工作流，直接说没有这个能力，别假装能修

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
