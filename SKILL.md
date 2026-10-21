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

> 「这个工具需要 MOSS 模型的工作流。如果你已经有，请在 ComfyUI 里打开它，点『工作流 → 导出 (API)』，把生成的 JSON 发给我（贴文本或者给文件路径都行）。」

收到后：

```bash
node scripts/manga.mjs workflow import <文件路径> --name default.json
```

导入后会打印识别到的参数（`prompt`、`seed`、`width`…）。如果**没有** `{{prompt}}`，说明用户导出的是普通工作流或没写占位符——让他在正向文本编码器的 `text` 里改成 `{{prompt}}` 再来。

**1.3 哪些部分允许你改**

> 「哪些内容允许我直接改？默认我改版面、台词、气泡类型，不改画风。你也可以把某几项关掉。」

按回答写：

```bash
node scripts/manga.mjs config set editable.layout=true editable.text=true editable.bubbleType=true editable.style=false
```

关掉的范围，CLI 会拒绝越权改动（`page set` 直接报错），这是保护用户的手段。

**1.4 选检查点**

```bash
node scripts/manga.mjs config set defaults.ckpt <模型文件名>
```

不确定有哪些就用 `config get defaults.ckpt` 旁边的报错提示，或让用户去网页设置页选。

**1.5 存档放哪**

> 「生成的内容存在哪？默认 `~/.moss-manga`，你可以指定别的目录。」

默认就用默认；要改就每次命令带 `--dir <路径>`（或设环境变量 `MOSS_ARCHIVE`）。

**1.6 复检**

```bash
node scripts/manga.mjs doctor
```

`configured: true` 才算完成。然后告诉用户：「配置好了，随时可以开始画。」

---

## 第 2 步：构思（先别写文件）

产出四样东西，整段发给用户确认：

1. 一句话立意 / 类型（日常、悬疑、成人向…）
2. 人物设定：按 `姓名 → 性别年龄 → 发型 → 五官 → 上装 → 下装 → 袜鞋 → 随身物 → 体型` 写，用于跨页一致性
3. 分页脚本表：每页几格、每格「景别 + 画什么 + 有没有台词」
4. 画风：黑白网点 / 彩色 / 线稿

**只有用户说「可以 / 开始 / 没问题」之后才进第 3 步。** 用户改主意就改脚本，不要先建项目再改。

---

## 第 3 步：落地出图

```bash
node scripts/manga.mjs project new --name "雨中的便利店"
node scripts/manga.mjs page new --preset band-3        # 一页一条，重复到需要的页数
```

版式预设：`band-3` 三横带、`band-4` 四横带、`daily-5` 日常五带、`split-2x2` 四宫格、`climax` 高潮页、`single` 整页。

然后逐页填内容。先看现状，再写补丁文件，最后 `page set`：

```bash
node scripts/manga.mjs page show --page 1 --summary    # 看这一页现在长什么样
```

补丁是一个 JSON，只写要改的字段（详见 `references/FORMAT.md`）：

```json
{
  "title": "车厢",
  "scene": "a half-empty train carriage, fluorescent light",
  "panels": [
    { "id": "pn_xxx", "caption": "wide shot of a crowded platform, grey silhouettes", "camera": "wide" },
    { "id": "pn_yyy", "caption": "close-up of her hand gripping the strap", "camera": "close" }
  ],
  "bubbles": [
    { "id": "bb_zzz", "text": "……今天也要，撑过去。" }
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

---

## 第 4 步：交付预览

```bash
node scripts/manga.mjs serve --open
```

对用户说：

> 「生成完了，浏览器里可以翻页查看。如果哪一页不满意，可以直接在页面上拖框、改字，保存后跟我说一声；或者直接告诉我改哪一页的什么，我重出一版。」

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
| 导入工作流 | `manga workflow import <文件> --name default.json` |
| 改配置 | `manga config set defaults.ckpt=xxx editable.text=true` |
| 看配置 | `manga config get defaults` |
| 建项目 | `manga project new --name "名字" [--size page]` |
| 列项目 | `manga project list` |
| 看项目 | `manga project show --project slug` |
| 建页 | `manga page new [--project slug] [--preset band-3] [--title 标题]` |
| 列页 | `manga page list [--project slug]` |
| 看页 | `manga page show --page N [--summary]` |
| 改页 | `manga page set --page N --file patch.json` |
| 换版式 | `manga page apply --page N --preset climax` |
| 编译 | `manga compile --page N` |
| 出图 | `manga render --page N [--seed S] [--steps N] [--dry-run]` |
| 看变更 | `manga changes [--since rev]` |
| 确认 | `manga ack` |
| 预览 | `manga serve [--port 5123] [--open]` / `manga stop` |

全局参数：`--dir <存档>`、`--project <slug>`、`--json`。

---

## 纪律

1. **不读 `scripts/` 源码**，要细节读 `references/`。
2. **不手写 Moss JSON**，那是 `compile` 的产物；你只写页面文档。
3. **不猜坐标**：先 `page show --summary`，再基于现有 bbox 改。
4. **不跳过 compile**：有 error 就渲染不了，浪费一次排队。
5. **一次只问一个问题**，配置阶段尤其如此。
6. **用户没说「开始」就不要渲染**。
7. 生成失败先看错误信息：`连不上 ComfyUI` 是环境问题，`节点错误` 是工作流问题，`这一页还有错误` 是内容问题。

---

## 更多细节

| 文件 | 什么时候读 |
|---|---|
| `references/FORMAT.md` | 写补丁前：页面文档每个字段的含义、坐标、版式预设 |
| `references/CLI.md` | 忘了参数或输出的字段名 |
| `references/WORKFLOW.md` | 导入工作流、占位符、报错对照 |
| `references/RECIPES.md` | 常见改动怎么写（加一格、改台词、换版式、重出一版） |
