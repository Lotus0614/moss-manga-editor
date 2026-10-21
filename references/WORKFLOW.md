# 工作流接入

## 什么是 API 格式

ComfyUI 有两种导出：

| 形态 | 样子 | 能用吗 |
|---|---|---|
| UI 格式 | `{ "nodes": [...], "links": [...] }` | ❌ |
| API 格式 | `{ "6": { "class_type": "...", "inputs": {...} } }` | ✅ |

在 ComfyUI 里用 **工作流 → 导出 (API)**。别用「保存」，那个是 UI 格式。

## 占位符

导入后，把要暴露成参数的字段值改成 `{{名字}}`：

```json
{
  "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "{{prompt}}", "clip": ["1", 1] } },
  "3": { "class_type": "KSampler", "inputs": { "seed": "{{seed}}", "steps": "{{steps}}", "cfg": "{{cfg}}" } }
}
```

规则：

- 某个字符串**整个**就是一个占位符 → 保留原始类型（`{{seed}}` 是数字）
- 夹在文字里 → 转字符串拼接（`"{{width}}x{{height}}"`）
- 提供了没用的占位符没关系；用了没提供的会报错，并列出已知参数
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

## 最小工作流

要把 Moss 的排版 JSON 真正用上，这几处必须有：

1. 正向文本编码器的 `text` = `{{prompt}}`
2. 潜空间尺寸 `width`/`height` = `{{width}}`/`{{height}}`
3. `seed` = `{{seed}}`
4. 模型加载器的 `ckpt_name` = `{{ckpt}}`
5. 最后有一个 `SaveImage`（或任何会把图片放进 `outputs` 的节点）

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
manga workflow import my-moss.json --name default.json
manga doctor
```

导入后会打印识别到的参数。没有 `{{prompt}}` 就说明占位符没写对，回去改 JSON 再导一次。
