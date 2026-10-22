# AGENT

在这个工作区里画漫画的操作手册。默认按这里做，不要临时发明流程。

## 目录职责

| 路径 | 是什么 | 能不能改 |
|---|---|---|
| `config/` | 你的配置：类型、词表、句式、工作流、参数 | ✅ 随便改 |
| `data/` | 作品：项目、页面、图片 | 通过 CLI 改，别手改 |
| `core/` | 引擎：坐标、编译、校验 | ⚠️ 只有修 bug 才动 |
| `defaults/` | 配置的出厂默认值 | 只读参考 |
| `web/`、`scripts/` | 编辑器与命令行 | ⚠️ 只有修 bug 才动 |

**所有提示词相关的东西都在 `config/`**：

- `config/types.mjs` —— 类型有哪些、字段、`compile` 怎么变成 Moss item、`buildSummary` 怎么写 summary
- `config/prompts.mjs` —— 词表（形状/机位/画风/气泡）与句子模板
- `config/bubbles.mjs` —— 8 种气泡文案
- `config/helpers.mjs` —— 编号、定位、页面区域、竖排横排

需要调整内置提示词（形状、机位、画风、气泡措辞、句式）时，改这四个文件。

## 开工前

```bash
node manga.mjs doctor          # 未配置就先读 INSTALL.md
```

## 画一页的完整流程

1. **构思**：定人物、场景、这页要推进什么。先把「分几格、每格画什么、谁说什么」写成一句话清单给用户确认，别直接开画。
2. **建项目/建页**

```bash
node manga.mjs project new --name "项目名"
node manga.mjs page new --title "第 1 页"
```

3. **写页面 JSON**（或直接改 `data/projects/<slug>/pages/pNN.json`）

```jsonc
{
  "reading": "rtl", "style": "mono", "vertical": true,
  "scene": "放课后的教室，夕阳从窗户斜进来",
  "items": [
    { "type": "panel", "bbox": [8, 8, 760, 420],
      "caption": "WIDE SHOT — 空教室里只有她一个人，夕阳把桌椅拉出长影", "camera": "wide" },
    { "type": "bubble", "bbox": [430, 120, 700, 300], "kind": "speech", "text": "……还没走？" }
  ]
}
```

- `bbox` 是 `[x1, y1, x2, y2]`，左上原点，单位像素，**16 的倍数**
- 面板的 caption 开头写**位置**（`WIDE SHOT`、`LEFT TALL PANEL`、`the wide band across the top`），编号由代码自动加，**不要自己写 PANEL 几**
- 文字**不用**写落在哪一格，代码会算 `inside PANEL n` / `at the edge of PANEL n`
- 好看的 caption 长什么样，看 `references/FORMAT.md`；**版面怎么排、气泡怎么用、人物怎么保持一致，看 `references/TECHNIQUES.md`**（分镜节奏、五种版式、八种气泡、背景层级、自检表都在这）

4. **校验**

```bash
node manga.mjs compile --page 1
```

有 `error` 就不能渲染，先修（空 caption、越界、文字溢出、气泡重叠都会报）。

5. **出图**

```bash
node manga.mjs render --page 1
```

6. **给用户看**：把图片路径或预览地址给用户，等反馈。

## 用户改完之后

**直接读页面文件**，不要看 diff、不要用 `changes`/`ack`：

```bash
cat data/projects/<slug>/pages/p01.json
```

改完重新 `render --page 1`。

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

## 硬规则

1. **不问「哪些能改」**——`config/` 下全都能改
2. **不改 `core/`**，除非用户明确说「修 bug」
3. **不手写 `PANEL 3` 编号**，代码会加
4. **不写死字号**，模型画不准，也没必要
5. **一页一页渲染**，不要并发提交
6. **文字归属靠坐标**，把气泡放进它所属面板的框内，位置自然就对了
