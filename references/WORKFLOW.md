# 工作流接入

## 你只需要导出，不用改

用户给的是 ComfyUI 导出的**完整** API JSON，原样导入即可：

```bash
manga workflow import moss.json
```

导入时会自动做三件事：

1. 顺着采样器的 `positive` 连线找到文本编码节点，把它的 `text` 换成 `{{prompt}}`
2. 找到带 `width`/`height` 的 latent 节点，换成 `{{width}}` / `{{height}}`
3. 列出其余「可以暴露」的参数，并打印对应的 `workflow expose` 命令

```
已导入 default.json（7 个节点）
已自动绑定：prompt（节点 2.text）、width（节点 4.width）、height（节点 4.height）
还可以暴露（问用户要不要）：negative、seed 随机种子、steps 步数、cfg CFG、检查点
  命令：manga workflow expose negative=3.text seed=5.seed steps=5.steps
```

用户点头后再开：

```bash
manga workflow expose seed=5.seed steps=5.steps
```

节点号必须用导入时打印的那个，别猜。

## 两种格式

| 形态 | 样子 | 能用吗 |
|---|---|---|
| UI 格式 | `{ "nodes": [...], "links": [...] }` | ❌ 让用户重新导出 |
| API 格式 | `{ "6": { "class_type": "...", "inputs": {...} } }` | ✅ |

在 ComfyUI 里用 **工作流 → 导出 (API)**。

## 手动加占位符（可选）

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
| `没有找到采样器节点` | 不是文生图链路，或用了非标采样器节点 | 让用户确认导出的是画图那条工作流 |
| `没有找到带 width/height 的 latent 节点` | latent 节点被包在子图里 | 手动把尺寸节点的值改成 `{{width}}`/`{{height}}` |
| `工作流节点错误：...` | 缺自定义节点、模型文件不在、枚举值不支持 | 在 ComfyUI 里手动跑一次同样的工作流 |
| `工作流里有未提供的占位符 {{x}}` | 图里写了占位符但没对应值 | 改成已有参数名，或删掉占位符 |
| `还没有设置检查点 ckpt` | `defaults.ckpt` 为空 | `manga config set defaults.ckpt <文件名>` |
| `这一页还有错误：...` | 页面内容过不了校验 | `manga compile --page N` 看具体哪条 |
| `等待生成结果超时` | 图太大/步数太高 | `comfy.timeoutMs` 调大，或 `--steps` 降低 |

## 换工作流

```bash
manga workflow import new-moss.json --name default.json
manga doctor
```

导入会自动覆盖同名文件并重新绑定，不需要先删旧的。
