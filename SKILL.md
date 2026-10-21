---
name: moss-manga
description: 用 MOSS 模型生成漫画分镜的工具链。用户想画漫画、画分镜、做多页漫画时使用：先检查配置（ComfyUI 地址、Moss 工作流、存档位置），再构思剧情与分页脚本让用户确认，然后用 CLI 建项目、排页、编译、出图，最后启动网页预览让用户自己看和改。改完可重复渲染。不读项目源码，一切通过 scripts/manga.mjs 操作。
---

# MOSS 漫画

你负责「构思 + 排版 + 出图」，用户负责「看 + 改」。所有改动都通过 CLI 落到存档文件，用户可以在网页里直接改版面。

**不要读 `scripts/` 里的代码**，需要细节时读 `references/`。CLI 的每个命令都有 `--json`。

---

## 第 0 步：先看状态（每次会话都先做）

```bash
node scripts/manga.mjs doctor --json
```

看 `configured` 字段：

- `true` → 跳到「第 2 步：构思」。
- `false` → 走「第 1 步：配置」，**一次只问一个问题**。

---

## 第 1 步：配置（只做一次）

按顺序问，用户没回答前不要往下走。

**1.1 ComfyUI 在哪？**

> 「ComfyUI 的服务地址是什么？默认是本机的 http://127.0.0.1:8188。」

```bash
node scripts/manga.mjs init --comfy <地址>
```

失败就说明 ComfyUI 没开或端口不对，告诉用户怎么启动，别继续。

**1.2 要 Moss 的工作流**

> 「这个工具需要 MOSS 模型的工作流。请在 ComfyUI 里打开它，点『工作流 → 导出 (API)』，把 JSON 原样发我（贴文本或给路径都行），**不用改任何东西**。」

拿到之后：

1. 先问路径，知道该写到哪：

```bash
node scripts/manga.mjs workflow path --json
```

2. **你自己读这份 JSON**，判断哪个节点的文本输入接的是正向提示词、哪个 latent 节点的 `width`/`height` 是画布尺寸（看 `class_type` 和 `inputs` 里的连线，不要照抄任何示例节点号）。
3. 把这三处换成占位符，生成**完整的新文件**（不是片段）：`{{prompt}}`、`{{width}}`、`{{height}}`。写法是直接把值改成占位符字符串，连线保持原样：

```jsonc
"6": { "class_type": "CLIPTextEncode", "inputs": { "text": "{{prompt}}", "clip": ["1", 1] } },
"5": { "class_type": "EmptyLatentImage", "inputs": { "width": "{{width}}", "height": "{{height}}", "batch_size": 1 } }
```

4. 保存并校验：

```bash
node scripts/manga.mjs workflow save <你写好的文件> --name default.json
node scripts/manga.mjs workflow check
```

`save` 会写到配置根的 `workflows/` 并报告缺哪几项；`check` 打印当前工作流的全部占位符。

5. 然后问用户：

> 「提示词和尺寸我固定可以改。另外这些也能开：随机种子（换一版重出）、步数、CFG、采样器、负面提示词、检查点——要放开哪些？」

要开的，在文件里同样改成 `{{seed}}` / `{{steps}}` 这类占位符（会自动填，见 `references/WORKFLOW.md` 的对照表），再 `workflow save` 一次。

**注意**：工作流是全局配置，和存档无关。换存档、换机器都不影响它。

如果 `check` 报「缺 {{prompt}}」之类的，说明你改写时漏了，回去补——不要靠脚本猜。

**1.3 项目默认值（一次问完，别一项一项问）**

> 「开始画之前定几个默认值，之后新建的项目都按这个来（建好后也能在项目设置里改）：
> ① 阅读顺序：右→左（日式）还是左→右？
> ② 画风：黑白网点 / 彩色 / 线稿？
> ③ 文字：竖排还是横排？
> ④ 画布尺寸：768×1280 竖版分镜，还是别的（必须是 16 的倍数）？」

```bash
node scripts/manga.mjs config set defaults.reading=rtl defaults.style=mono defaults.vertical=true "defaults.canvas=[768,1280]"
```

**不要问「哪些内容允许我改」——全部都能改。** 也没有子 Agent、没有锁定开关。

**1.4 检查点（只有工作流用到时才需要）**

先别问。只有你改过的工作流里**真的写了 `{{ckpt}}`**，才需要：

```bash
node scripts/manga.mjs config set defaults.ckpt <模型文件名>
```

工作流里模型是固定的（直接写了文件名），就跳过这一步，**不要为了过校验编一个假 ckpt**。`doctor` 也只在这时有要求。

**1.5 存档放哪**

> 「生成的内容存在哪？默认 `~/.moss-manga/archive`，你可以指定别的目录（比如放到某个项目文件夹里）。」

先解释一句：**配置和工作流存在 `~/.moss-manga`，跟档案件是分开的**，换存档不会丢配置。

默认就用默认；要改：

```bash
node scripts/manga.mjs config set archive=/path/to/archive
```

（临时的用 `--dir <路径>`，或环境变量 `MOSS_ARCHIVE`。）

**1.6 复检**

```bash
node scripts/manga.mjs doctor
```

`configured: true` 才算完成。**有 workflow 但 name 为空、或文件不存在，都算没配好**——这种情况下 `render` 会直接报错（这是故意的：以前它静默回退到内置工作流，结果用错模型出图还以为成功了）。

然后告诉用户：「配置好了，随时可以开始画。」

---

## 第 2 步：构思（先别写文件）

写 caption 的要点：**只写看得见的东西**（谁 + 在哪 + 做什么 + 景别 + 光线），不写心理活动、不写抽象形容词、不写质量词。台词要短（一句 6~14 字），一页 5~8 条。

产出四样东西，整段发给用户确认：

1. 一句话立意 / 类型（日常、悬疑、成人向…）
2. 人物设定：按 `姓名 → 性别年龄 → 发型 → 五官 → 上装 → 下装 → 袜鞋 → 随身物 → 体型` 写，用于跨页一致性
3. 分页脚本表：每页几格、每格「景别 + 画什么 + 有没有台词」，台词要写全（模型不会替你编对）
4. 画风：黑白网点 / 彩色 / 线稿

**只有用户说「可以 / 开始 / 没问题」之后才进第 3 步。** 用户改主意就改脚本，不要先建项目再改。

---

## 第 3 步：落地出图

```bash
node scripts/manga.mjs project new --name "雨中的便利店"
node scripts/manga.mjs page new                        # 一页一条，重复到需要的页数
```

**没有版式预设**：新建页只给你一个占满整页的框，怎么切自己定（拖框或写 `items` 补丁）。

然后逐页填内容。先看现状，再写补丁文件，最后 `page set`：

```bash
node scripts/manga.mjs page show --page 1 --summary    # 看这一页现在长什么样
```

补丁是一个 JSON，只写要改的字段（详见 `references/FORMAT.md`）：

```json
{
  "title": "车厢",
  "scene": "a half-empty train carriage, fluorescent light",
  "items": [
    { "type": "panel", "id": "pn_xxx", "bbox": [8, 8, 760, 420],
      "caption": "wide shot of a crowded platform, grey silhouettes", "camera": "wide" },
    { "type": "panel", "id": "pn_yyy", "bbox": [8, 428, 760, 848],
      "caption": "close-up of her hand gripping the strap", "camera": "close" },
    { "type": "bubble", "id": "bb_zzz", "bbox": [420, 900, 700, 1080],
      "kind": "speech", "text": "……今天也要，撑过去。" }
  ]
}
```

```bash
node scripts/manga.mjs page set --page 1 --file /tmp/p1.json
node scripts/manga.mjs compile --page 1          # 必须通过：有 error 就先修
node scripts/manga.mjs render --page 1 --json
```

`compile` 的 error 会拦住渲染。常见 error 只有一个：这一页没有分格。

**渲染很慢（十几秒到几分钟）**，一页一页来，不要并发提交。

### 如果模型自己往空格子里塞气泡 / 假文字

编译器已经在 `summary` 里锁死了数量：`This page has exactly N panels and exactly M text elements…Do NOT invent any additional dialogue…`，纯图页则会写 `NO lettering at all`。

如果仍然出现假文字，按顺序试：

1. 减少这一页的 bubble 数量（气泡越多越容易诱发它继续编）
2. 把该条文字改成 `type: "native"`（`label: "text"`）——原生文字项不触发对话规则，代价是那条不再套竖排/气泡模板
3. 在 `note` 里补一句 `no lettering except the listed text`

---

## 第 4 步：交付预览（一定要把网址给用户）

```bash
node scripts/manga.mjs serve --open
```

命令会打印 `http://127.0.0.1:5123`。**必须把这个网址原样发在回复里**，不能让用户自己猜：

> 「生成完了，打开 http://127.0.0.1:5123 就能翻页看。如果哪一页不满意，可以直接在页面上拖框、改字（左边选页、右下工作台看提示词、右边改属性），保存后跟我说一声；也可以直接告诉我改哪一页的什么，我重出一版。」

如果 5123 被占用，`serve --port 5124`，然后把新端口发给用户。

---

## 第 5 步：修改循环（最重要）

用户改完页面后，**不要重新读所有页**：

```bash
node scripts/manga.mjs changes --json
```

它只返回「自上次确认以来被改过的页 + 具体操作」（哪个格子挪了、哪句台词改了、哪条气泡加了）。根据 ops 决定改什么，改完 `render` 重出，最后：

```bash
node scripts/manga.mjs ack
```

`ack` 之前 changes 会一直返回同一批差异，所以**每次同步完都要 ack**。

---

## 命令速查

| 目的 | 命令 |
|---|---|
| 检查配置 | `manga doctor` |
| 初始化 | `manga init --comfy URL [--ckpt 名] [--workflow 文件]` |
| 改默认值 | `manga config set defaults.reading=rtl defaults.style=mono "defaults.canvas=[768,1280]"` |
| 校验工作流 | `manga workflow check` |
| 改配置 | `manga config set defaults.ckpt=xxx editable.text=true` |
| 看配置 | `manga config get defaults` |
| 建项目 | `manga project new --name "名字" [--canvas 768x1280]` |
| 列项目 | `manga project list` |
| 看项目 | `manga project show --project slug` |
| 建页 | `manga page new [--project slug] [--title 标题]` |
| 列页 | `manga page list [--project slug]` |
| 看页 | `manga page show --page N [--summary]` |
| 改页 | `manga page set --page N --file patch.json` |
| 改版面 | `manga page set --page N --file patch.json`（items 按 id 合并） |
| 编译 | `manga compile --page N` |
| 出图 | `manga render --page N [--seed S] [--steps N] [--dry-run]` |
| 看变更 | `manga changes [--since rev]` |
| 确认 | `manga ack` |
| 预览 | `manga serve [--port 5123] [--open]` / `manga stop` |

全局参数：`--dir <存档>`、`--project <slug>`、`--json`。

---

## 纪律

1. **不读 `scripts/` 源码**，要细节读 `references/`；但 `core/prompt-templates.mjs` 是数据文件——用户对效果不满意时可以直接改里面的措辞，或加新的形状/机位/气泡枚举（加完编译器和编辑器自动认）。
2. **不改 `scripts/` 代码**——只有用户明确要求「修 bug」或「加功能」时才动，改完要跑 `npm test`。
3. **不手写 Moss JSON**，那是 `compile` 的产物；你只写页面文档。
4. **工作流占位符由你改写文件完成**：读用户给的 API JSON → 自己判断节点 → 生成完整新文件 → `workflow save` → `workflow check`。不要让用户手写占位符，也不要指望脚本猜节点。
5. **可以读工作流 JSON**（那是用户给你的产物），但**不要读 `scripts/` 源码**。
6. **不猜坐标**：先 `page show --summary`，再基于现有 bbox 改。
7. **不问「哪些能改」**：所有内容都能改，没有权限开关。
8. **配置阶段一次问一件事**，但项目默认值那四项可以一次问完。
9. **用户没说「开始」就不要渲染**。
10. 生成失败先看错误信息：`连不上 ComfyUI` 是环境问题，`节点错误` 是工作流问题，`这一页还有错误` 是内容问题。

---

## 更多细节

| 文件 | 什么时候读 |
|---|---|

| `references/FORMAT.md` | 写补丁前：items 三种类型、字段含义、坐标规则 |
| `references/CLI.md` | 忘了参数或输出的字段名 |
| `references/WORKFLOW.md` | 导入工作流、占位符、报错对照 |
| `references/RECIPES.md` | 常见改动怎么写（加一格、改台词、换版式、重出一版） |
