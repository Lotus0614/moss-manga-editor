# 存档格式

配置和存档是两棵树：配置（含工作流）在固定的配置根，存档只放项目数据。

```
<配置根>  默认 ~/.moss-manga（MOSS_CONFIG 可覆盖）
├── config.json                 # ComfyUI 地址、当前工作流、出图参数
└── workflows/                  # 全局工作流（跟存档无关）

<存档>    默认 <配置根>/archive（config.archive 或 --dir 可改）
├── state.json  journal.jsonl
└── projects/<slug>/
    ├── project.json            # 项目 + 人物设定 + 页序
    ├── pages/p01.json          # 一页一个文件
    ├── versions.json           # 渲染历史
    ├── versions/<id>.json      # 该次渲染喂进去的 Moss JSON（只读）
    └── images/<sha256>.png
```

## 页面只有一个数组：items

v3 起不再分 `panels` / `bubbles`，所有东西都在同一个数组里，用 `type` 区分：

| type | 是什么 | 主要字段 |
|---|---|---|
| `panel` | 一个分格 | `bbox` `shape` `frame` `camera` `caption` |
| `bubble` | 一条文字 | `bbox` `kind` `text` `size` `tail` `vertical?` |
| `native` | 原生 Moss item，绕过语义层 | `bbox` `label` `caption` `text?` |

```jsonc
{
  "id": "p01", "index": 1, "title": "车厢", "rev": 7,
  "size": [768, 1280],
  "reading": "rtl",          // rtl 右→左 | ltr 左→右
  "style": "mono",           // mono | color | sketch
  "vertical": true,          // 全局文字竖排；单条 bubble 可用自己的 vertical 覆盖
  "scene": "a half-empty train carriage, fluorescent light",
  "note": "",
  "items": [
    { "type": "panel", "id": "pn_a", "bbox": [8, 8, 760, 424],
      "shape": "rect", "frame": "border", "camera": "wide",
      "caption": "wide shot of a crowded platform, grey silhouettes",
      "tags": ["crowded_platform", "grey_silhouettes"] },

    { "type": "bubble", "id": "bb_b", "bbox": [60, 30, 500, 96],
      "kind": "narration", "text": "每天早上八点十七分，我在同一节车厢里。",
      "size": 20, "tail": "none", "vertical": false },

    { "type": "native", "id": "nt_c", "bbox": [520, 980, 740, 1180],
      "label": "character", "caption": "水科 小春（22），白衬衫，黑色长发" }
  ]
}
```

## panel

| 字段 | 值 |
|---|---|
| `bbox` | `[x1,y1,x2,y2]`，左上原点、绝对像素、整数 |
| `shape` | `rect` `slant-top` `slant-side` `bleed-top` `bleed-bottom` `bleed-left` `bleed-right` `bleed-all` `circle` |
| `frame` | `border` 描边（默认） `none` 无边 `thick` 粗边 |
| `camera` | `eye` `high` `low` `wide` `medium` `close` `xclose` `ots` `dutch` |
| `caption` | 这一格**看得见**的东西：谁 + 在哪 + 做什么，**开头带编号和位置** |

出血格（`bleed-*`）可以超出画布；其它形状超出只会被裁。

**caption 开头写位置**（编号由编译器自动加，不写）：

```
PANEL 3, LEFT TALL PANEL — a pitch black void with one point of pure white light…
PANEL 1, the wide band across the top — a crowded platform at dusk
```

位置不套格式，`LEFT TALL PANEL`、`the small inset at the bottom right`、`the huge panel bleeding off the bottom` 都行；编号要连续、不重复，增删格子后重排。

## bubble

| 字段 | 值 |
|---|---|
| `kind` | `speech` 对话 `shout` 喊叫 `whisper` 小声 `tremble` 颤抖 `thought` 内心 `heart` 心之声 `narration` 旁白 `sfx` 拟声词 |
| `text` | 要渲染的字，原样；换行用 `\n` |
| `size` | 字号，默认 22 |
| `tail` | `down-left` `down` `down-right` `left` `right` `up-left` `up` `up-right` `none`；`none` = 说话者不在画面 |
| `caption` | 选填，给枚举覆盖不到的特殊文字补充说明 |`n| `vertical` | 不写就跟随页面 `vertical`；写 `true`/`false` 单独覆盖 |

**文字不用写在哪一格**：编译器按 bbox 自动加 `inside PANEL N` 或 `at the edge of PANEL N`。

## native

语义层覆盖不到时用，直接把 `label` / `caption` / `text` 写进 Moss JSON：

- `label`：`object` | `text` | `character`
- `caption`：原样拼进产物
- `text`：`label = text` 时必填

编辑器里它显示为虚线框，提醒你这是「手写的原始项」。

## tags / palette（三种 item 都能用）

两个可选字段，直接透传进 Moss JSON 的同名位置。

**tags** —— 只在这个元素容易被画错时写，3~6 个全小写英文短词，多词用下划线：

```jsonc
"tags": ["convenience_store", "fluorescent_light"]
```

text 项可以用它标文字性质（`ui_text`、`calligraphy`）。只标「这是什么」，不重复 caption。

**palette** —— 只在颜色是硬要求时写，`#RRGGBB` 3~5 个，按面积从大到小：

```jsonc
"palette": ["#1F3D2B", "#F2E8DA"]     // 文字项固定两个：文字色 + 底色
```

普通题材省略。写了 palette 也仍要在 caption 里描述色彩关系。

## 输出形态

发给 ComfyUI 的顶层只有四个字段：

```jsonc
{ "summary": {...}, "items": [...], "bbox_coord_space": "abs_centralized", "bbox_format": "yxyx" }
```

`width` / `height` 不进产物（只用于换算）；`items` 里每个元素可选带 `tags` / `palette`。

## 坐标

只有一套：**左上原点、绝对像素 `[x1,y1,x2,y2]`**。

- 整数，`x1 < x2`、`y1 < y2`
- 四边留 8~16px 安全边
- 中心原点 `yxyx` 的转换由编译器负责，**不要手算**

## 尺寸

`size` 是 `[宽, 高]`，都必须是 16 的倍数。常用：`[768,1280]` 分镜页、`[1152,1920]` 高清、`[1024,1024]` 方图、`[1536,1024]` 横版。

## 没有版式预设

工具不再提供 band-3 / 四宫格之类的预设——漫画排版本来就不该被模板限制。新建页只给**一个占满整页的框**当起手，怎么切、怎么斜、怎么出血，自己拖或者让 AI 按故事来定。

## versions.json

```jsonc
{
  "currentByPage": { "p01": "v003" },   // 每页各自采用哪一版
  "items": [
    { "id": "v003", "page": "p01", "image": "/media/<slug>/<sha>.png",
      "seed": 909507867, "width": 768, "height": 1280,
      "steps": 11, "cfg": 2, "sampler": "euler", "scheduler": "sgm_uniform",
      "workflow": "moss-user.json", "ms": 18183 }
  ]
}
```

历史只读：切 `currentByPage` 只影响预览用哪一版，改不动已生成的图。

## journal.jsonl

每次写入一行，`rev` 单调递增；`manga changes` 就是按页聚合这些操作。

## 不变量

1. `bbox` 四个整数，`x1<x2`、`y1<y2`
2. `size` 是 16 的倍数
3. 页面 id `p01`，项目 slug 是 ASCII
4. 图片只增不改，文件名是内容 sha256
5. item 的 `id` 稳定；改内容不要换 id，否则 diff 会当成「删了又加」

## 加一个新类型

类型、字段、编译规则都在 `core/registry.mjs`。往 `ITEM_TYPES` 里加一项即可，编译、校验、编辑器表单、画布按钮和配色全部自动认得。

```js
{
  key: 'sfx',                       // 存进 page.json 的 type
  label: '拟声',                    // 按钮和右栏标题
  fields: [                         // 右栏表单按这个生成
    { key: 'text', type: 'text', label: '拟声词', required: true },
    { key: 'caption', type: 'longtext', label: '写法说明' },
  ],
  compile({ item, ctx }) {          // 返回合法 Moss item（不要给 bbox）
    return { label: 'text', caption: [item.caption, ctx.guard].filter(Boolean).join(', '), text: item.text };
  },
}
```

- `fields[].type` 可选：`text` / `longtext` / `number` / `enum` / `bool` / `tags` / `palette`
- `enum` 用 `options: 'CAMERAS'` 引用词表（词表在 `prompt-templates.mjs` 和 `registry.mjs` 的 `ENUM_SOURCES`）
- `compile` 返回值只能是 `label` / `caption` / `text` / `tags` / `palette`，`bbox` 由核心补
- 页面级字段在 `PAGE_FIELDS`，同样是数据驱动

改完刷新网页就能用，不用重启服务。
## 画布标签由字段决定

画布左上角那行字不是写死的，由字段声明上的 `canvas: true` 决定：

```js
{ key: 'camera', type: 'enum', label: '机位', options: 'CAMERAS', canvas: true },
{ key: 'shape',  type: 'enum', label: '形状', options: 'PANEL_SHAPES', canvas: true },
```

生成规则（`core/registry.mjs` 的 `labelOf`）：

1. 类型名开头，`panel` 带序号（`面板3`），其它不带
2. 遍历该类型字段，**只有 `canvas: true` 的才出现**，空值跳过
3. 枚举值按 `ENUM_SOURCES` 翻成中文
4. 用 ` · ` 连类型和值，多个值之间用 ` / `

```
面板3 · 中景 / 矩形
气泡 · 对话
原生 · character
```

想加一项就把字段的 `canvas` 改成 `true`，想去掉就删掉这个属性——不用改画布代码。

## 画布渲染是统一的

所有类型走同一套渲染：同一个标签样式、同一个正文字号公式 `max(13, min(w/16, h/5, 22))`、同样的直角、同样的描边。颜色只按类型名推（`typeColor`），不按类型写 CSS。

加新类型不需要写任何画布代码，也不该为它加特例样式。
## 提示词模板（Agent 直接改这里）

`manga init` 会在配置根生成 `prompt-templates.json`，内容就是全部可改的提示词：

```jsonc
{
  "panelShapes":    { "rect": { "name": "矩形", "phrase": "rectangular panel with straight edges" } },
  "frameStyles":    { … },
  "cameras":        { … },
  "stylePresets":   { "mono": { "phrase": "…", "guard": "…", "meta": [] } },
  "readingOrders":  { … },
  "bubbleTypes":    [ { "key": "speech", "name": "对话", "phrase": "…", "tail": true } ],
  "tailDirections": { … },
  "snippets":       { "textLock": "…{panels}…{texts}…", "placement": "placed in the {area} area of the page" }
}
```

规则：

- **改措辞**：直接改 `phrase` / `snippets` 里的句子，保存即生效（下一次 `compile` / `render`）
- **加枚举**：往对应对象加一项，例如新机位 `"bird": { "name": "鸟瞰", "phrase": "bird's eye view" }`
- `snippets` 里的 `{name}` 是占位符（`{n}` 面板号、`{area}` 位置、`{panels}`/`{texts}` 数量），改句子时保留它们
- 想恢复默认：删掉这个文件再跑一次 `manga init --force`

代码里的 `core/prompt-templates.mjs` 只是默认值；配置里有的键会覆盖它。