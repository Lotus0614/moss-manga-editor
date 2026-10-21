# Agent

## 循环

`server/agent/loop.mjs`：

```
用户发言
  → 需要压缩？(消息数 > keep*2) 就把最旧的一段总结进 thread.summary
  → for step in 1..maxSteps:
      chat(messages, tools)
      有 tool_calls → 逐个执行 → 结果作为 role=tool 消息回填 → 继续
      没有 tool_calls → 这就是最终回复，结束
  → 每轮都落盘线程文件
```

刻意**不做流式输出**：工具调用的流式增量拼接很容易出错，收益是「字一点点冒出来」。现在改成每个工具调用实时推给前端（`tool` / `tool_result` 事件），用户看到的是「它在干什么」，比逐字更有用。

## 双模式

| 模式 | 谁干活 | 提示词 |
|---|---|---|
| `single` | 主 Agent 直接改页面 | `MAIN_AGENT_PROMPT` |
| `sub` | 主 Agent 分派，每页一个子线程 | 主 = `MAIN_AGENT_PROMPT`，子 = `PAGE_AGENT_PROMPT` |

- 模式存在线程的 `mode` 字段上，`unset` 时第一句话会先问你要哪种（不消耗大模型调用，文案是固定的 `MODE_QUESTION`）。
- 子模式下主 Agent 多一个 `dispatch_page_agent(pageId, instruction)` 工具：它会找到/创建该页的子线程，用页面提示词跑一个受限循环（子 Agent 没有 `dispatch` 工具，最多递归 2 层）。
- 子线程独立落盘，用户可以在右栏下拉里直接选某一页的 Agent 继续聊。

## 工具清单

工具在 `server/agent/tools.mjs`，是 Agent 唯一能改数据的方式。

| 分组 | 工具 |
|---|---|
| 项目 | `get_project` `update_project` `list_pages` |
| 页面 | `get_page` `create_page` `update_page` `delete_page` `apply_layout` |
| 分格 | `add_panel` `update_panel` `remove_panel` |
| 文字 | `add_bubble` `update_bubble` `remove_bubble` |
| 编译 | `compile_page` |
| 生成 | `generate_page` `get_job` |
| 版本 | `list_versions` `set_current_version` |
| 设定 | `update_bible` |
| 子模式 | `dispatch_page_agent` |

约定：

- 坐标参数接受 `[x1,y1,x2,y2]`、`{x1,y1,x2,y2}` 或 `{x,y,w,h}`，内部统一成文档坐标。
- 写操作立即落盘，并顺手把页面 id 加进 `pageOrder`。
- 工具返回值会被截断到 12k 字符再回填给模型，避免 `compile_page` 的 JSON 撑爆上下文。
- 工具报错不中断循环：错误信息作为 `role=tool` 的内容回填，模型自己决定怎么补救。

## 上下文压缩

`compressIfNeeded()`：消息数超过 `keepMessages * 2` 时，把最旧的一段交给大模型压成 ≤400 字摘要（保留目标、已定设定、已做改动、遗留问题），摘要存在 `thread.summary`，之后每轮都带上。

压缩失败不会阻塞主流程：退化成「砍掉最老的一半」。

可调：设置页的「最多工具轮数」「保留对话条数」。

## 图片输入

用户贴的图先 `POST /api/upload` 存成 `data/uploads/<sha>.<ext>`，发消息时把 URL 放进 `images`。服务端读文件转 base64 data URL，按 OpenAI vision 格式塞进 `content` 数组。

注意：历史消息里的图片会原样保留在 JSON 里，时间长了文件会变大——真要控制体积，可以在压缩时把旧图替换成 `[图片]`。

## 提示词

`server/agent/prompts.mjs` 里 `MANGA_RULES` 是把 Moss 模板文档的硬规则压成的约束：画布与坐标、版式节奏、形状枚举、八种气泡、人物一致性、黑白锁色、工作流程（先读再改、改完必编译、生成慢要轮询）。

改这部分时注意：它同时约束主 Agent 和子 Agent，写太细会挤掉上下文，写太松模型会乱改。

## 加一个工具

1. 在 `toolSchemas()` 里加 `{ type:'function', function:{ name, description, parameters } }`。
2. 在 `executeTool()` 里加同名 `case`，返回可 JSON 序列化的对象。
3. 需要新能力就从 `ctx` 上取（`ctx.generate`、`ctx.runSubAgent`），不要在工具里直接 import 路由模块。

工具描述里写清楚**什么时候用**，比写清楚参数更重要——模型选工具靠的是 description。
