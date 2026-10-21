# 存档格式

存档是一个普通目录，全部是 JSON 文件，可以直接用编辑器打开、也可以用 git 管。

```
<存档>/
├── config.json                 # 全局配置（CLI 的 config 命令读写）
├── state.json                  # { rev, ackedRev } 变更版本号
├── journal.jsonl               # 变更日志，一行一条
├── workflows/                  # 导入的 ComfyUI 工作流
└── projects/<slug>/
    ├── project.json            # 项目 + 人物设定 + 页序
    ├── pages/p01.json          # 一页一个文件，唯一可编辑真源
    ├── versions.json           # 渲染历史（图片、seed、参数）
    ├── versions/<id>.json      # 每次渲染喂进去的 Moss JSON 快照（只读）
    └── images/<sha256>.png     # 图片，内容寻址，重复自动去重
```

## project.json

```jsonc
{
  "id": "rainy-konbini",
  "slug": "rainy-konbini",          // 目录名，ASCII
  "name": "雨中的便利店",
  "size": "page",                   // page | page-hd | square | wide
  "pages": ["p01", "p02"],
  "bible": {
    "characters": [
      {
        "id": "ch_w",
        "code": "W",                // 分格里用这个代号复述
        "name": "水科 小春",
        "desc": "a 22 year old college girl, long straight black hair with a blunt fringe, white sailor blouse with a dark square collar edged in two white stripes, pleated skirt, white loose socks, dark loafers, large bust",
        "enabled": true
      }
    ],
    "scene": "a half-empty train carriage, fluorescent light, blurred grey silhouettes"
  },
  "createdAt": "2025-..."
}
```

`desc` 按这个顺序写最省事：性别年龄 → 发型 → 五官 → 上装 → 下装 → 袜鞋 → 随身物 → 体型。所有人物在每一页都会被自动写进 `summary.caption`，保证跨页一致。

## page（p01.json）

```jsonc
{
  "id": "p01",
  "index": 1,
  "title": "车厢",
  "rev": 7,                         // 每次保存自增，只读
  "size": [768, 1280],              // 必须是 16 的倍数
  "reading": "rtl",                 // rtl 右→左 | ltr 左→右
  "style": "mono",                  // mono 黑白网点 | color 彩色 | sketch 线稿
  "scene": "本页专属场景，空则用 bible.scene",
  "note": "追加在 summary 末尾的补充说明",
  "panels": [ ... ],
  "bubbles": [ ... ]
}
```

### panels[]

```jsonc
{
  "id": "pn_ab12",
  "bbox": [8, 8, 760, 424],         // 左上原点，[x1,y1,x2,y2]，绝对像素
  "shape": "rect",                  // 见下方枚举
  "frame": "border",                // border | none | thick
  "camera": "wide",                 // 见下方枚举
  "caption": "wide shot of a crowded platform, grey silhouettes"
}
```

`caption` 只写**画面**：谁、在哪、什么动作、什么景别。不要写心理活动（那属于气泡），也不要写"这一格表现孤独"这种抽象话。

### bubbles[]

```jsonc
{
  "id": "bb_cd34",
  "type": "speech",                 // 见下方枚举
  "text": "……今天也要，撑过去。",     // 原样渲染，换行用 \n
  "bbox": [353, 488, 676, 628],
  "vertical": true,                 // 竖排（默认 true）
  "size": 22,                       // 字号
  "tail": "down-left"               // 尾巴方向；"none" = 说话者不在画面
}
```

## 枚举

| 字段 | 取值 |
|---|---|
| `shape` | `rect` `slant-top` `slant-side` `bleed-top` `bleed-bottom` `bleed-left` `bleed-right` `bleed-all` `circle` |
| `frame` | `border` 描边（默认） `none` 无边（出血格用） `thick` 粗边 |
| `camera` | `eye` 平视 `high` 俯视 `low` 仰视 `wide` 全景 `medium` 中景 `close` 特写 `xclose` 大特写 `ots` 过肩 `dutch` 荷兰角 |
| `type` | `speech` 对话 `shout` 喊叫 `whisper` 小声 `tremble` 颤抖 `thought` 内心 `heart` 心之声 `narration` 旁白 `sfx` 拟声词 |
| `tail` | `down-left` `down` `down-right` `left` `right` `up-left` `up` `up-right` `none` |

## 坐标

只有一套坐标系：**左上原点、绝对像素、`[x1,y1,x2,y2]`**。

- 必须是整数，`x1 < x2`、`y1 < y2`
- 出血格（`bleed-*`）允许超出画布，其它形状超出只是警告
- 四边留 8~16px 安全边
- 转成 Moss 模型要的中心原点 `yxyx` 由 `compile` 负责，**永远不要手算**

## 尺寸

`size` 是 `[宽, 高]`，两边都必须是 16 的倍数（这样 `W/2`、`H/2` 是整数）。常用：

| 用途 | size |
|---|---|
| 分镜页 | `[768, 1280]` |
| 分镜页高清 | `[1152, 1920]` |
| 方图 | `[1024, 1024]` |
| 横版 | `[1536, 1024]` |

## 版式预设

`manga page new --preset <id>` 或 `manga page apply --page N --preset <id>`：

| id | 说明 |
|---|---|
| `band-3` | 三条横带，最稳的叙事页 |
| `band-4` | 四条横带，推进快 |
| `daily-5` | 五带、第 2 带左右二分（右格发生、左格反应） |
| `split-2x2` | 四宫格 |
| `climax` | 满版 + 两个角部嵌格 |
| `single` | 整页一张 |

套用会**替换全部 panels**，气泡保留但 bbox 不动——所以换版式后要重新看气泡位置。

## versions.json

```jsonc
{
  "current": "v003",
  "items": [
    {
      "id": "v003", "at": "2025-...", "page": "p01", "pageIndex": 1,
      "image": "/media/rainy-konbini/<sha>.png", "file": "<sha>.png",
      "seed": 909507867, "width": 768, "height": 1280,
      "steps": 28, "cfg": 5, "sampler": "euler", "scheduler": "simple",
      "lora": [], "workflow": "default.json", "ms": 16344
    }
  ]
}
```

历史只读：`current` 只决定预览用哪一版，改不动已经生成过的图。

## journal.jsonl

一行一条，`rev` 单调递增：

```json
{"rev":12,"at":"...","actor":"cli","project":"rainy-konbini","page":"p01","index":1,
 "ops":[{"op":"bbox","target":"panel","id":"pn_ab12","from":[8,8,760,400],"to":[8,8,760,424]}]}
```

`manga changes` 就是把 `rev > ackedRev` 的条目按页聚合出来的。

## 不变量

1. `bbox` 四个整数，`x1<x2`、`y1<y2`
2. `size` 是 16 的倍数
3. 页面 id 形如 `p01`，项目 slug 是 ASCII
4. 图片只增不改，文件名是内容 sha256
5. 数组元素 `id` 唯一且稳定（改内容不要换 id，否则 diff 会当成删了加一条）
