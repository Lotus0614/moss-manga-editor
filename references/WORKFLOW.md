# 工作流接入

工作流是**全局配置**：放在 `config/workflows/`（默认 `config//workflows`），跟存档无关。换存档、换项目都不用重新导。

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

如果某个字段你判断错了位置，也可以手写。规则：

- 某个字符串**整个**就是一个占位符 → 保留原始类型（`{{seed}}` 是数字）
- 夹在文字里 → 转字符串拼接（`"{{width}}x{{height}}"`）
- 提供了没用的占位符没关系；用了没提供的会报错并列出已知参数
- **连线值不能改**：`"clip": ["1", 1]` 是「节点 1 的第 1 个输出」，不是文本

## 参数怎么来

**没有参数白名单。** 工作流里写什么占位符，就是什么参数。

**代码自动填的四个**（不要写进表单，也不用配）：

| 占位符 | 来源 |
|---|---|
| `{{prompt}}` | 生图：页面编译出的 Moss Layout JSON；修图：包好的那句修改指令 |
| `{{width}}` `{{height}}` | 页面尺寸（生图用；修图工作流写了也会填） |
| `{{seed}}` | 每次随机（`--seed 42` 才固定） |
| `{{image}}` | 修图：上传到 ComfyUI `input/moss/` 的参考图路径 |

**其余全部由用户填**，写在占位符的默认值里：

```jsonc
"steps": "{{steps:30}}",
"cfg": "{{cfg:6.5}}",
"sampler_name": "{{sampler:dpmpp_2m}}",
"lora_data": "{{lora_data:<lora:moss\\khn:0.8>}}"
```

- 语法 `{{名字:默认值}}`，只按**第一个 `:`** 切分，所以 lora 串里的冒号不受影响
- 默认值按字面量推断类型：`30` → 数字、`true` → 布尔、其它字符串
- `workflow save` 会把默认值抄进 `config.params`，配置里因此自带一份可读的默认
- 取值优先级：**项目 params > 全局 params > 占位符默认值**
- 不写默认值也行（`{{steps}}`），那样就必须有人填，否则报错

改值：

```bash
manga config set params.steps=24 'params.lora_data=<lora:moss\khn:0.9>'
```
## 报错对照

| 报错 | 原因 | 处理 |
|---|---|---|
| `连不上 ComfyUI` | 地址错、ComfyUI 没开、端口不是 8188 | 先 `doctor`，确认 URL |
| `工作流节点错误：...` | 缺自定义节点、模型文件不在、枚举值不支持 | 在 ComfyUI 里手动跑一次同样的工作流 |
| `工作流里有未提供的占位符 {{x}}` | 图里写了占位符但没对应值 | 改成已有参数名，或删掉占位符 |
| `需要参数 {{ckpt}}，但没有值也没有默认值` | 工作流要 ckpt 但没人填 | `manga config set params.ckpt=<文件名>` |
| `这一页还有错误：...` | 页面内容过不了校验 | `manga compile --page N` 看具体哪条 |
| `等待生成结果超时` | 图太大/步数太高 | `comfy.timeoutMs` 调大，或 `--steps` 降低 |
| `修图工作流 edit.json 缺占位符：{{image}}` | 编辑工作流的 LoadImage 没替换 | 把 `image` 改成 `{{image}}`，再 `workflow check --name edit.json` |
| `这一页还没有图` | 修图要先有一版图当参考 | 先 `manga render --page N` |
| `工作流 xxx 是修图工作流（含 {{image}}）` | 把 edit.json 配成了生图工作流 | `config set workflow.name=default.json` |

## 换工作流

```bash
manga workflow save /path/to/new-moss.json --name default.json
manga workflow check
```

同名文件直接覆盖，不需要先删旧的；`save` 会自动把它设为当前工作流。

## 修图工作流

生图和修图是**两份**工作流，互不影响：

| 用途 | 配置键 | 占位符 |
|---|---|---|
| 生图（MOSS） | `workflow.name` | `{{prompt}}` `{{width}}` `{{height}}`（+ 任意参数） |
| 修图（Qwen Image Edit 之类） | `edit.name` | 只要 `{{prompt}}` `{{image}}` |

修图工作流来自 ComfyUI 里调好的编辑工作流，**导出 (API) 之后只改两处**：

- `LoadImage` 的 `image` → `{{image}}`
- 提示词那个字符串节点（常见是 `PrimitiveStringMultiline` 的 `value`）→ `{{prompt}}`

其余全部原样：模型、LoRA、尺寸、步数、采样器、超分、保存节点都不动——修图的画幅和画质由这份工作流决定，代码不覆盖。

```bash
manga workflow save ./qwen-edit.api.json --name edit.json --no-activate
manga config set edit.name=edit.json
manga workflow check --name edit.json
```

`--no-activate` 不能省：不加会把生图工作流也切成这份。`check` 看到 `{{image}}` 就按修图工作流校验（只要求 prompt / image），所以不会再去抱怨缺 `{{width}}` / `{{height}}`。

提交时 `manga edit` 会：读这一页当前版本的图 → `POST /upload/image` 传到 `input/moss/` → 把返回值填进 `{{image}}` → 提交 → 取图 → 存成新版本。工作流里没写 `{{seed}}` 时种子是写死的，同样的指令重跑会得到同一张图；想让它每次都变，把 `KSampler` 的 `seed` 也写成 `{{seed}}`。

生图工作流里**不该**出现 `{{image}}`：一旦有，`render` 会直接报错说是修图工作流，免得把整页图喂进去。
