# ComfyUI 接入与工作流

## 只依赖 HTTP 与 WebSocket

| 用途 | 端点 |
|---|---|
| 探活与能力 | `GET /system_stats`、`GET /object_info` |
| 提交 | `POST /prompt` `{prompt: <API 格式图>, client_id}` |
| 进度 | `WS /ws?clientId=`（只用来推进度，失败就退回纯轮询） |
| 结果 | `GET /history/<prompt_id>` |
| 取图 | `GET /view?filename=&subfolder=&type=` |
| 队列/打断 | `GET /queue`、`POST /interrupt` |

结果判定：轮询 `/history/<id>`，`status.status_str === 'error'` 抛错并带上 `exception_message` 与 `node_type`；否则遍历 `outputs` 收集 `.images`，取第一张。

产物**一律复制进** `data/projects/<id>/images/`，不依赖 ComfyUI 的 output 目录长期存在。

## 工作流用占位符，不用绑定清单

图里直接写 `{{prompt}}`，提交前把整棵树走一遍替换（`core/placeholders.mjs`）。

规则：

- 某个字符串**整个**就是一个占位符 → 保留原始类型（`{{seed}}` 是数字，`{{mask}}` 可以是数组）
- 占位符夹在文字里 → 转成字符串拼接（`"size={{width}}x{{height}}"`）
- 缺值 → 抛 `MissingParam`，接口返回 400 并指出少了哪个
- 原图不被修改（纯函数）

类型推断只看名字：

| 名字 | 类型 |
|---|---|
| width / height / seed / steps / cfg / denoise / strength / scale / weight / lora_weight / lora_strength / batch_size / fps / frames / length / index / count | number |
| is_* / use_* / enable* | boolean |
| 其它 | string |

类型只影响 UI 上选什么控件，填值时前后端都会做一次显式转换，不会因为类型猜错而静默出错。

## 内置参数

提交时自动提供的值（来源见括号）：

| 占位符 | 值 |
|---|---|
| `{{prompt}}` | 编译出来的 Moss Layout JSON，单行 |
| `{{negative}}` | 设置页「负面提示词」 |
| `{{width}}` `{{height}}` | 页面尺寸 |
| `{{seed}}` | 请求体 seed，否则设置里的固定 seed，否则随机（永远显式记录） |
| `{{steps}}` `{{cfg}}` `{{sampler}}` `{{scheduler}}` | 设置页「出图默认值」 |
| `{{ckpt}}` | 设置页选中的检查点（**必填**，空值会直接报错） |
| `{{lora_name}}` `{{lora_strength}}` | 从 `<lora:名字:权重>` 解析出的第一个 |
| `{{batch_size}}` | 1 |

## 两个内置工作流

| 文件 | 说明 |
|---|---|
| `moss-image.api.json` | 基础链路：Checkpoint → CLIPTextEncode ×2 → EmptyLatentImage → KSampler → VAEDecode → SaveImage |
| `moss-image-lora.api.json` | 多一个 LoraLoader，模型走 `{{lora_name}}`/`{{lora_strength}}` |

有 LoRA 时 `prepareGeneration()` 会自动优先找同名的 `-lora` 变体（`moss-image.api.json` → `moss-image-lora.api.json`）。找不到就用基础版，LoRA 不生效。

**这两份只是能跑的通用 SD 图，不是 Moss 专用工作流。** 换成你自己的见下一节。

## 换成你自己的工作流

1. ComfyUI 菜单 **工作流 → 导出 (API)**（不是「保存」，也不是 UI 格式）。
   - API 格式长这样：`{ "6": { "class_type": "...", "inputs": {...} } }`
   - UI 格式长这样：`{ "nodes": [...], "links": [...] }`，**不能直接用**
2. 设置页 →「ComfyUI 工作流」→ 选文件 → 贴进去 → 保存。
3. 把要调的字段改成占位符。最小要求是 `{{prompt}}`、`{{width}}`、`{{height}}`、`{{seed}}`、`{{ckpt}}`。
4. 保存时会立刻做一次结构检查：必须是 API 格式、每个节点有 `class_type`，然后列出识别到的参数。

注意 **连线值不能替换**：`"clip": ["1", 1]` 是「节点 1 的第 1 个输出」，不是文本。只替换字面量。

## 调试

- `POST /api/projects/:id/pages/:pageId/graph` 返回「这一次会发给 ComfyUI 的完整图 + 填进去的值」，不提交。
- 节点报错时 `ComfyError.details` 里是 ComfyUI 原始的 `node_errors`，前端 toast 会显示消息，服务端 console 有完整堆栈。
- 超时调设置页的「单张生成超时」。OOM 一般表现为任务 error，消息里有 ComfyUI 的原始异常。

## 常见错误对照

| 现象 | 原因 |
|---|---|
| `连不上 ComfyUI` | 地址/端口不对，或 ComfyUI 没开 `--listen` 却填了内网 IP |
| `工作流节点错误：...` | 缺自定义节点、模型文件不存在、枚举值不在 ComfyUI 支持范围内 |
| `工作流里有未提供的占位符 {{x}}` | 图里写了占位符但没对应参数；改名或去掉 |
| `还没有设置检查点（ckpt）` | 设置页没选，或工作流里 `{{ckpt}}` 没替换成固定值 |
| 生成的图没有分格 | 工作流里没有把 `{{prompt}}` 接到正向文本编码器 |
