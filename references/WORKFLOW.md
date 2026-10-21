# 工作流接入

工作流是**全局配置**：放在 `<配置根>/workflows/`（默认 `~/.moss-manga/workflows`），跟存档无关。换存档、换项目都不用重新导。

## 流程：AI 改写文件，脚本只校验

用户给的是 ComfyUI 导出的**完整** API JSON，原样给你，不做任何改动。剩下的由你（AI）完成：

**1. 先问路径**

```bash
manga workflow path --json
```

```json
{ "configDir": "C:\\Users\\me\\.moss-manga", "workflowsDir": "C:\\Users\\me\\.moss-manga\\workflows", "current": "default.json", "archive": "...\\archive" }
```

**2. 读懂这份 JSON**

工作流可能很复杂：多个文本编码器、提示词拼接、ControlNet、自定义节点。你要自己看：

- 哪个节点的文本输入是**正向**提示词（通常是采样器 `positive` 连过去的那个 `CLIPTextEncode`）
- 哪个 latent 节点的 `width` / `height` 是画布尺寸
- 还有哪些参数值得暴露（`seed`、`steps`、`cfg`、`sampler_name`、检查点、LoRA）

**不要照抄示例里的节点号**，按实际 `class_type` 和连线判断。

**3. 生成完整的新文件**

只改那几个值，其余原样保留（连线 `["1", 0]` 绝对不能动）：

```jsonc
{
  "1": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "moss_v1.safetensors" } },
  "2": { "class_type": "CLIPTextEncode", "inputs": { "text": "{{prompt}}", "clip": ["1", 1] } },
  "4": { "class_type": "EmptyLatentImage", "inputs": { "width": "{{width}}", "height": "{{height}}", "batch_size": 1 } },
  "5": { "class_type": "KSampler", "inputs": { "seed": "{{seed}}", "positive": ["2", 0], "negative": ["3", 0] } }
}
```

**4. 保存与校验**

```bash
manga workflow save /tmp/moss-api.json --name default.json
manga workflow check
```

```
default.json：7 个节点
占位符：{{prompt}} {{width}} {{height}} {{seed}}
可以直接生成。
```

缺 `{{prompt}}` / `{{width}}` / `{{height}}` 时 `check` 会列出来，`doctor` 也会把它当问题——回去补文件，不要绕过去。

## 两种格式

| 形态 | 样子 | 能用吗 |
|---|---|---|
| UI 格式 | `{ "nodes": [...], "links": [...] }` | ❌ 让用户重新导出 |
| API 格式 | `{ "6": { "class_type": "...", "inputs": {...} } }` | ✅ |

在 ComfyUI 里用 **工作流 → 导出 (API)**。

## 占位符写法

自动绑定覆盖不到的地方，可以自己写。规则：

- 某个字符串**整个**就是一个占位符 → 保留原始类型（`{{seed}}` 是数字）
- 夹在文字里 → 转字符串拼接（`"{{width}}x{{height}}"`）
- 提供了没用的占位符没关系；用了没提供的会报错并列出已知参数
- **连线值不能改**：`"clip": ["1", 1]` 是「节点 1 的第 1 个输出」，不是文本

## 自动可用的参数

不用自己算，`render` 会自动填：

| 占位符 | 来源 |
|---|---|
| `{{prompt}}` | 编译出的 Moss Layout JSON（单行） |
| `{{negative}}` | `defaults.negative` |
| `{{width}}` `{{height}}` | 页面尺寸 |
| `{{seed}}` | `--seed`，否则 `defaults.seed`，否则随机（一定显式记录） |
| `{{steps}}` `{{cfg}}` `{{sampler}}` `{{scheduler}}` | `defaults.*` 或命令行 |
| `{{ckpt}}` | `defaults.ckpt`（必须填） |
| `{{lora_name}}` `{{lora_strength}}` | 从 `defaults.lora` 或 `--lora` 解析第一条 |
| `{{batch_size}}` | 1 |

## 报错对照

| 报错 | 原因 | 处理 |
|---|---|---|
| `连不上 ComfyUI` | 地址错、ComfyUI 没开、端口不是 8188 | 先 `doctor`，确认 URL |
| `工作流节点错误：...` | 缺自定义节点、模型文件不在、枚举值不支持 | 在 ComfyUI 里手动跑一次同样的工作流 |
| `工作流里有未提供的占位符 {{x}}` | 图里写了占位符但没对应值 | 改成已有参数名，或删掉占位符 |
| `还没有设置检查点 ckpt` | `defaults.ckpt` 为空 | `manga config set defaults.ckpt <文件名>` |
| `这一页还有错误：...` | 页面内容过不了校验 | `manga compile --page N` 看具体哪条 |
| `等待生成结果超时` | 图太大/步数太高 | `comfy.timeoutMs` 调大，或 `--steps` 降低 |

## 换工作流

```bash
manga workflow save /path/to/new-moss.json --name default.json
manga workflow check
```

同名文件直接覆盖，不需要先删旧的；`save` 会自动把它设为当前工作流。
