# 数据模型

一切都存在 `data/` 下的 JSON 文件里，没有数据库。理由：单用户、项目数量级在几十，文件即真相，AI 改代码时不用猜 schema。

```
data/
  settings.json
  threads.json                       ← 线程 id → projectId 索引
  uploads/<sha256>.<ext>             ← 聊天里贴的参考图
  projects/<projectId>/
    project.json                     ← 项目 + 人物设定(bible) + 页序
    pages/<pageId>.json              ← 一页的全部内容 + 历史版本
    images/<sha256>.<ext>            ← 生成图，内容寻址，重复自动去重
    threads/<threadId>.json          ← 对话记录
```

## Project

```jsonc
{
  "id": "prj_xxx",
  "name": "雨中的便利店",
  "size": "page",                    // page | page-hd | square | wide
  "createdAt": "...", "updatedAt": "...",
  "pageOrder": ["pg_a", "pg_b"],
  "cover": "/media/...",
  "bible": {
    "characters": [
      {
        "id": "ch_x", "code": "W", "name": "水科 小春",
        "desc": "a 22 year old college girl, long straight black hair with a blunt fringe, ...",
        "recap": "her white sailor blouse and navy skirt",
        "enabled": true
      }
    ],
    "style": { "preset": "mono", "note": "" },
    "scene": "a half-empty train carriage, fluorescent light, blurred grey silhouettes"
  }
}
```

`desc` 建议按文档顺序写：性别年龄 → 发型 → 五官 → 上装 → 下装 → 袜鞋 → 随身物 → 体型。编译时它会被包成 `CHARACTER: W = ...` 塞进 `summary.caption`，保证跨页一致。

## PageDoc

这是编辑器唯一编辑的对象，也是编译器的输入。

```jsonc
{
  "id": "pg_xxx",
  "index": 1,
  "title": "",
  "size": { "width": 768, "height": 1280 },   // 必须是 16 的倍数
  "readingOrder": "rtl",                       // rtl（日式右→左）| ltr
  "style": { "preset": "mono", "lora": "", "guardPerItem": true },
  "scene": "本页专属场景，空则用 bible.scene",
  "cast": ["ch_x"],                            // 本页出场人物 id
  "summary": { "meta": [], "caption": "", "palette": [] },
  "panels": [Panel],
  "bubbles": [Bubble],
  "versions": [Version],
  "currentVersionId": "v_xxx",                 // 画布上显示哪一版
  "notes": "",
  "createdAt": "...", "updatedAt": "..."
}
```

### Panel

```jsonc
{
  "id": "pn_xxx",
  "name": "格1",
  "bbox": [8, 8, 760, 420],          // 左上原点绝对像素 [x1,y1,x2,y2]
  "shape": "rect",                   // rect | slant-top | slant-side | bleed-top | bleed-bottom
                                     //   | bleed-left | bleed-right | bleed-all | circle
  "frame": "border",                 // border | none | thick
  "camera": "medium",                // eye | high | low | wide | medium | close | xclose | ots | dutch
  "caption": "这一格画什么",          // 只写画面，不写心理活动
  "cast": [],                        // 预留：这一格出现谁
  "locked": false                    // 预留：给「锁定不被 Agent 改」用
}
```

### Bubble

```jsonc
{
  "id": "bb_xxx",
  "type": "speech",     // speech | shout | whisper | tremble | thought | heart | narration | sfx
  "text": "……今天也要，撑过去。",   // 原样渲染，换行用 \n
  "bbox": [353, 483, 676, 623],
  "tailDir": "down-left",            // 尾巴方向，type 带尾巴时有效
  "tailOff": false,                  // true = 说话者不在画面里，不要尾巴
  "vertical": true,                  // 竖排（默认）
  "fontSize": 22,
  "panelId": "pn_xxx",               // 归属哪一格（仅供参考，不进 Moss JSON）
  "locked": false
}
```

### Version

```jsonc
{
  "id": "v_xxx",
  "at": "2025-...",
  "image": "/media/prj_x/<sha>.png",
  "hash": "<sha256>",
  "promptJson": "{\"summary\":...}",   // 这一版到底喂了什么，只读
  "promptHash": "<sha256 of promptJson>",
  "workflow": "moss-image.api.json",
  "seed": 909507867,
  "width": 768, "height": 1280,
  "steps": 16, "cfg": 5, "sampler": "euler", "scheduler": "simple",
  "lora": [{ "name": "moss\\x", "weight": 0.7 }],
  "warnings": 4,
  "comfyPromptId": "...",
  "ms": 16344,
  "jobId": "job_xxx"
}
```

历史版本**只读**：UI 只能切换 `currentVersionId`，改不了它记录的布局。

## 坐标系

| | 原点 | 顺序 | 用在哪 |
|---|---|---|---|
| 文档坐标 | 左上 | `[x1,y1,x2,y2]` | 编辑器、面板属性输入框、拖拽 |
| Moss 坐标 | 中心 | `[y_min, x_min, y_max, x_max]` | 只出现在编译产物里 |

换算（`core/manga-doc.mjs`）：

```
out = [ y1 - H/2, x1 - W/2, y2 - H/2, x2 - W/2 ]
      左/上向下取整，右/下向上取整
```

`core/self-test.mjs` 里锁了文档给出的例子：1536×1024 下 `[176,224,800,864]` → `[-288,-592,352,32]`。

## 不变量

1. `x1 < x2`、`y1 < y2`，四个都是整数。
2. 尺寸是 16 的倍数。
3. 只有 `bleed-*` 形状允许超出画布；其它形状超出只是警告，不阻断。
4. `summary.caption` 非空。
5. 版本数组只追加，不改写；`currentVersionId` 必须存在于 `versions`。
6. `JSON.stringify` 出来必须单行。
