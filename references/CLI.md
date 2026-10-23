# CLI 参考

入口：`node scripts/manga.mjs <命令> [参数]`。所有命令支持 `--json`，失败时退出码非零。

全局参数：

| 参数 | 作用 |
|---|---|
| `--config <路径>` | 配置根，默认 `config/`（或环境变量 `MOSS_CONFIG`）；只管 `config.json` 与工作流，方言固定是仓库里的 `config/manga.mjs` |
| `--dir <路径>` | 存档目录，默认 `config/archive`（或 `config.archive` / `MOSS_ARCHIVE`） |
| `--project <slug>` | 项目；只有一个项目时可省略 |
| `--json` | 输出结构化 JSON |

---

## doctor

```bash
manga doctor [--json]
```

```json
{
  "configured": true,
  "archive": "C:\\Users\\me\\.moss-manga",
  "comfy": { "url": "http://127.0.0.1:8188", "reachable": true, "version": "0.3.x", "checkpoints": 14, "loras": 30 },
  "workflow": { "name": "default.json", "ok": true, "params": ["prompt", "seed", "width", "height", "steps", "cfg", "ckpt"] },
  "ckpt": "moss_v1.safetensors",
  "projects": 2,
  "problems": []
}
```

`configured` 为 false 时看 `problems`，一条一条解决。

---

## init / config / workflow

```bash
manga init [--comfy URL] [--ckpt 文件名] [--workflow 文件] [--archive 路径]
manga config get [点号路径]
manga config set 键=值 [键=值...]
manga workflow path                    # 打印配置根与工作流目录
manga workflow save <文件> [--name default.json]
manga workflow check [--name default.json]
manga workflow list
manga workflow show [--name default.json]
```

`workflow save` 只做两件事：校验是 API 格式、复制到 `config/workflows/<name>`，然后报告占位符情况。**它不改你的文件**——`{{prompt}}` / `{{width}}` / `{{height}}` 这些由调用方（AI）读懂 JSON 后自己写进文件。

`workflow check` 的输出：

```json
{
  "ok": false,
  "nodeCount": 7,
  "params": [{ "name": "prompt", "count": 1, "type": "string" }, { "name": "width", "count": 1, "type": "number" }],
  "missing": ["height"],
  "warnings": ["没有 {{height}}：尺寸由工作流写死，改不了画布"]
}
```

`ok: false` 不阻止保存，但 `doctor` 会把它列为问题。

`config set` 的值会先尝试当 JSON 解析，所以 `editable.layout=true` 是布尔、`defaults.steps=30` 是数字。

常用键：

| 键 | 含义 |
|---|---|
| `archive` | 存档路径（留空 = `config/archive`） |
| `comfy.url` | ComfyUI 地址 |
| `comfy.timeoutMs` | 单张超时 |
| `defaults.ckpt` | 检查点文件名（只有工作流里写了 `{{ckpt}}` 才需要） |
| `defaults.steps` `defaults.cfg` `defaults.sampler` `defaults.scheduler` | 出图参数 |
| `defaults.negative` | 负面提示词 |
| `defaults.lora` | 默认 LoRA，形如 `<lora:名字:0.7>` |
| `workflow.name` | 当前工作流文件名 |
| `editable.layout` `editable.text` `editable.bubbleType` `editable.style` | Agent 能不能改这些 |
| `editable.params.seed` 等 | Agent 能不能改这些参数 |

---

## project

```bash
manga project new --name "雨中的便利店" [--canvas 768x1280]
manga project list
manga project show [--project slug]
manga project delete [--project slug]
```

`project new` 返回 slug（ASCII，用于后续所有命令）。中文名只作显示。

---

## page

```bash
manga page new [--title 标题] [--blank]   # 默认给一个整页框
manga page list
manga page show --page 3 [--summary]
manga page set  --page 3 --file patch.json
manga page set  --page 3 --patch '{"title":"车厢"}'
manga page set  --page 3 --file patch.json    # items 按 id 合并
manga page delete --page 3
```

`--page` 接受页码（`3`）或页面 id（`p03`）。

`--summary` 输出紧凑大纲（每格一行），不带 `--summary` 输出完整 JSON。**给 AI 看用 `--summary`**，省上下文。

`page set` 的补丁规则见 `RECIPES.md`；越权改动会报 `scope` 错误：

```json
{ "ok": false, "code": "scope", "error": "这些改动超出了允许范围（版面）：~ 格 pn_a 位置 ..." }
```

---

## compile

```bash
manga compile --page 3 [--json]
```

输出 `json`（发给 ComfyUI 的单行 Moss JSON）、`warnings`、`stats`。不落盘。

---

## render

```bash
manga render --page 3 [--seed 123] [--steps 20] [--cfg 5] [--dry-run] [--json]
```

```json
{
  "ok": true,
  "image": "/media/rainy-konbini/<sha>.png",
  "file": "<sha>.png",
  "seed": 909507867,
  "ms": 16344,
  "warnings": []
}
```

- `--dry-run` 只返回「会发给 ComfyUI 的完整图」，不提交。
- 失败时 `{ "ok": false, "code": "render", "error": "..." }`。
- 同一页连续渲染会各存一版历史，不覆盖。

---

## changes / ack（人类用，Agent 不用）

```bash
manga changes [--since 12] [--json]
manga ack
```

```json
{
  "ok": true,
  "since": 12, "to": 15, "acked": 12,
  "pages": [
    {
      "project": "rainy-konbini", "page": "p01", "index": 1, "rev": 15, "warnings": 2,
      "ops": [
        { "op": "bbox", "target": "panel", "id": "pn_a", "from": [8,8,760,400], "to": [8,8,760,424] },
        { "op": "text", "target": "bubble", "id": "bb_c", "from": "旧台词", "to": "新台词" }
      ]
    }
  ]
}
```

**Agent 不要用这两个命令**：直接读 `data/projects/<slug>/pages/pNN.json` 即可，源文件信息量更大。这两个是给网页端「变更」页签用的。`--since` 不传就用上次 `ack` 的位置。`op` 取值：`create` `add` `remove` `bbox` `text` `field` `page`。

网页端看完「变更」页签会自己 ack；Agent 不需要这套流程。

---

## serve / stop / open

```bash
manga serve [--port 5123] [--open]
manga stop
manga open [--port 5123]
```

`serve` 是后台进程（pid 写在 `data/server.pid`），不占前台。用户改完页面刷新即可。

---

## 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 业务错误（看 `error`） |
| 2 | 命令不存在（打印帮助） |

## 自定义占位符（任意）

工作流里的 `{{名字}}` 是**任意**的，没有白名单。除了内置那批（prompt/width/height/seed/steps/cfg/sampler/scheduler/ckpt/negative/denoise/lora_name/lora_strength/batch_size），你自己加的键会从 `config.params` 取值：

```bash
manga config set 'params.lora_data=<lora:moss\xxx:0.8>'
```

渲染时把它填进工作流。没配值又用了占位符，才会报「未提供的占位符」。