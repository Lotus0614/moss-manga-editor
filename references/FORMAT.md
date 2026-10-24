# 存档格式

配置和存档是两棵树：配置（含工作流）在固定的配置根，存档只放项目数据。

```
config  默认 config/（MOSS_CONFIG 可覆盖）
├── config.json                 # ComfyUI 地址、当前工作流、出图参数
└── workflows/                  # 全局工作流（跟存档无关）

data    默认 config/archive（config.archive 或 --dir 可改）
├── state.json  journal.jsonl
└── projects/<slug>/
    ├── project.json            # 项目 + 人物设定 + 页序
    ├── pages/p01.json          # 一页一个文件
    ├── versions.json           # 渲染历史
    ├── versions/<id>.json      # 该次渲染喂进去的 Moss JSON（只读）
    └── images/<sha256>.png
```

> MOSS 原生格式的完整字段白名单、canvas/tags/palette 用法与坐标换算，见
> `references/MOSSS_LAYOUT.md`。

## 页面只有一个数组：items

所有元素都在同一个数组里，用 `type` 区分：

| type     | 是什么                     | 专有字段                                | 共有字段                        |
| -------- | -------------------------- | --------------------------------------- | ------------------------------- |
| `panel`  | 一个分格                   | `bbox` `shape` `frame` `camera` `desc`  | `note` `caption` `tags` `palette` |
| `character` | 一个指定位置的人物      | `bbox` `ref` `desc?`                    | `note` `caption` `tags` `palette` |
| `bubble` | 一条文字                   | `bbox` `kind` `text` `tail` `vertical?` | `note` `caption` `tags` `palette` |
| `native` | 原生 Moss item，绕过语义层 | `bbox` `label` `text?`                  | `note` `caption` `tags` `palette` |

`native` 是基础格子，四种类型都带同一组共有字段：

| 共有字段  | 作用                                                                 |
| --------- | -------------------------------------------------------------------- |
| `note`    | 备注，**写中文**，只给人看，不进提示词（画布上优先显示它）           |
| `caption` | 整段覆盖。留空就按类型自动拼；填了就只用这段，其余字段不再进提示词   |
| `tags`    | 透传给 Moss，也当分类用                                               |
| `palette` | 透传给 Moss（`#RRGGBB` 数组）                                        |

旧存档（`version` 缺失或 1）读取时会自动迁移：当时的 `caption` 本来是画面描述，会被搬到 `desc`，并存成 `version: 2`。

```jsonc
{
    "id": "p01",
    "index": 1,
    "title": "车厢",
    "rev": 7,
    "version": 2,
    "size": [768, 1280],
    "style": "mono", // mono | color | sketch
    "vertical": true, // 全局文字竖排；单条 bubble 可用自己的 vertical 覆盖
    "scene": "a half-empty train carriage, fluorescent light",
    "note": "",
    "summaryMeta": [], // 留空 = 用画风自带的 meta
    "summaryCaption": "", // 填了就整段替换自动拼的 summary
    "items": [
        {
            "type": "panel",
            "id": "pn_a",
            "bbox": [8, 8, 760, 424],
            "shape": "rect",
            "frame": "border",
            "camera": "wide",
            "desc": "wide shot of a crowded platform, grey silhouettes",
            "note": "第一格：交代站台和人群",
            "tags": ["crowded_platform", "grey_silhouettes"],
        },

        {
            "type": "bubble",
            "id": "bb_b",
            "bbox": [60, 30, 500, 96],
            "kind": "narration",
            "text": "每天早上八点十七分，我在同一节车厢里。",
            "size": 20,
            "tail": "none",
            "vertical": false,
        },

        {
            "type": "native",
            "id": "nt_c",
            "bbox": [520, 980, 740, 1180],
            "label": "character",
            "caption": "水科 小春（22），白衬衫，黑色长发",
        },
    ],
}
```

## panel

| 字段      | 值                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `bbox`    | `[x1,y1,x2,y2]`，左上原点、绝对像素、整数                                                                  |
| `shape`   | `rect` `slant-top` `slant-side` `bleed-top` `bleed-bottom` `bleed-left` `bleed-right` `bleed-all` `circle` |
| `frame`   | `border` 描边（默认） `none` 无边 `thick` 粗边                                                             |
| `camera`  | `eye` `high` `low` `wide` `medium` `close` `xclose` `ots` `dutch`                                          |
| `desc`    | 这一格**看得见**的东西：谁 + 在哪 + 做什么，**开头带编号和位置**                                           |

出血格（`bleed-*`）可以超出画布；其它形状超出只会被裁。

**desc 开头写位置**（编号由编译器自动加，不写）：

```
PANEL 3, LEFT TALL PANEL — a pitch black void with one point of pure white light…
PANEL 1, the wide band across the top — a crowded platform at dusk
```

位置不套格式，`LEFT TALL PANEL`、`the small inset at the bottom right`、`the huge panel bleeding off the bottom` 都行；编号要连续、不重复，增删格子后重排。

## bubble

| 字段      | 值                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| `kind`    | `speech` 对话 `shout` 喊叫 `whisper` 小声 `tremble` 颤抖 `thought` 内心 `heart` 心之声 `narration` 旁白 `sfx` 拟声词 |
| `text`    | 要渲染的字，原样；换行用 `\n`                                                                                        |
| `tail`    | `down-left` `down` `down-right` `left` `right` `up-left` `up` `up-right` `none`；`none` = 说话者不在画面             |
| `desc`    | 选填，给枚举覆盖不到的特殊文字补充说明                                                                               |
| `vertical` | 不写就跟随页面 `vertical`；写 `true`/`false` 单独覆盖（不在表单里，手写页面时才用）                                 |

**文字不用写在哪一格**：编译器按 bbox 自动加 `inside PANEL N` 或 `at the edge of PANEL N`。

## character

人物只有两个字段：**这是谁**（`ref`）、**这一格有什么不一样**（`desc`）。外貌不写在页面上，存在项目的角色表里，也不写汉字名（模型会把汉字当成要渲染的字）。

| 字段      | 值                                                                                     |
| --------- | -------------------------------------------------------------------------------------- |
| `ref`     | 项目 `characters[].id`，必填                                                             |
| `desc`    | 选填，自由文本：背面、遮挡、正在做什么，要写才写；**以 `!` 开头则整段替换角色表的外貌**   |

```jsonc
{ "type": "character", "id": "c1", "ref": "reina", "bbox": [560, 900, 740, 1200] }
{ "type": "character", "id": "c2", "ref": "reina", "bbox": [...], "desc": "seen from behind, no face" }
{ "type": "character", "id": "c3", "ref": "reina", "bbox": [...], "desc": "!completely naked, only the red armband" }
```

**位置只由 bbox 表达**，编译器不生成任何位置文案。人物朝向由格子里的构图和 `desc` 决定：背身就不要写表情。

角色表在 `project.json` 里，用顶栏「角色表」维护，或者走 CLI：

```bash
manga character add --id reina --name Reina --look "18, long straight black hair, red armband, NO glasses"
```

编译产物：

```
character Reina: 18, long straight black hair, ..., NO glasses. This figure appears only inside its own box
character Reina: 18, ... . In this box: seen from behind, no face. This figure appears only inside its own box
character Reina: completely naked, only the red armband. This figure appears only inside its own box
```

整页 summary 末尾追加（用 `!` 覆盖的那几格不进来）：

```
CHARACTERS IN THIS PAGE (each one appears only inside its own box):
- Reina: 18, long straight black hair, ...
```

**格子只写场景**：`panel.desc` 不写人物长相、衣服、表情——那些属于 character 项。

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
    "currentByPage": { "p01": "v003" }, // 每页各自采用哪一版
    "items": [
        {
            "id": "v003",
            "page": "p01",
            "image": "/media/<slug>/<sha>.png",
            "seed": 909507867,
            "width": 768,
            "height": 1280,
            "steps": 11,
            "cfg": 2,
            "sampler": "euler",
            "scheduler": "sgm_uniform",
            "workflow": "moss-user.json",
            "ms": 18183,
        },
    ],
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

类型、字段、编译规则都在 `config/manga.mjs`。往 `types` 数组里加一项即可：编译、校验、右栏表单、画布按钮、配色全部自动认得。

```js
{
  key: 'sfx',                       // 存进 page.json 的 type
  label: '拟声',                    // 按钮和右栏标题
  fields: [                         // 右栏表单按这个生成；note/caption/tags/palette 从 BASE_FIELDS 继承
    { key: 'text', type: 'text', label: '拟声词', required: true },
    { key: 'desc', type: 'text', label: '写法说明' },
  ],
  compile({ item, page }) {         // 返回合法 Moss item（不要给 bbox）
    return { label: 'text', caption: item.desc, text: item.text };
  },
}
```

- 所有类型都从 `BASE_FIELDS` 继承 `note` / `caption` / `tags` / `palette`，自己只写专有字段
- `fields[].type` 可选：`text` / `longtext` / `number` / `enum` / `bool` / `tags` / `palette` / `characterRef`
- `enum` 的 `options` 直接给数组：`[{ value: 'eye', label: '平视', phrase: 'eye-level shot' }]`
- `compile` 返回值只能是 `label` / `caption` / `text` / `tags` / `palette`，`bbox` 由核心补
- 页面级字段在同一个文件的 `page` 数组里，格式与 item 字段完全一样

改完刷新网页就能用，不用重启服务。

## 画布标签由字段决定

画布左上角那行字不是写死的，由字段声明上的 `canvas: true` 决定：

```js
{ key: 'camera', type: 'enum', label: '机位', options: CAMERAS, canvas: true },
{ key: 'shape',  type: 'enum', label: '形状', options: SHAPES, canvas: true },
```

生成规则（`config/manga.mjs` 的 `canvasLabel`）：

1. 类型名开头，`panel` 带序号（`面板3`），其它不带
2. 遍历该类型字段，**只有 `canvas: true` 的才出现**，空值跳过
3. 枚举值取选项的 `label`
4. 用 `·` 连类型和值，多个值之间用 `/`

```
面板3 · 中景 / 矩形
气泡 · 对话
原生 · character
```

想加一项就把字段的 `canvas` 改成 `true`，想去掉就删掉这个属性——不用改画布代码。

## 画布渲染是统一的

所有类型走同一套渲染：同一个标签样式、同一个正文字号公式 `max(17, min(w/13, h/4.5, 30))`、同样的直角、同样的描边。颜色只按类型名推（`typeColor`），不按类型写 CSS。

加新类型不需要写任何画布代码，也不该为它加特例样式。

## 配置：一个文件

方言全在 `config/manga.mjs`：词表、页面字段、item 类型、句子模板、`buildSummary`。

```js
export const PAGE = [ … ];       // 页面字段
export const TYPES = [ … ];      // item 类型
export const SNIPPETS = { … };   // 句子模板
export function buildSummary({ page, items }) { … }
```

编译、校验、右栏表单、画布标签都直接 `import` 这个文件，格式就是下面这几节写的形状。少了字段、枚举没选项、`default` 越界，`npm run check` 会报出来。

## 词表

每张词表是数组，一项就是 `{ value, label, phrase }`：

| 键 | 是什么 |
| --- | --- |
| `value` | 存进 page.json 的值 |
| `label` | 右栏下拉、画布标签上显示的字 |
| `phrase` | 拼进提示词的英文 |

```js
export const CAMERAS = [
  { value: 'eye', label: '平视', phrase: 'eye-level shot' },
  { value: 'high', label: '俯视', phrase: 'high-angle shot looking down' },
];
```

有的项还会多带自己专用的键，就写在那一项里：

- 画风 `STYLES`：`meta`（进 `summary.meta`）、`guard`（补到每一项末尾的硬约束）
- 文字载体 `BUBBLES`：`tail`（这种载体画不画尾巴）
- 形状 `SHAPES`：`bleed`（可以超出画布，校验时不再报越界）

改措辞就改 `phrase`；加一个机位就在数组里加一项，下拉和提示词同时就有了。

## 句子模板

`SNIPPETS` 里是整句模板，`{xxx}` 是占位符（`{n}` 面板数、`{panels}` / `{texts}` 数量、`{order}` 阅读顺序那句），改句子时保留它们。

## 字段

页面字段和 item 字段是同一种格式：

```js
{ key: 'camera', type: 'enum', label: '机位', options: CAMERAS, default: 'medium', canvas: true }
```

- `type`：`text` / `longtext` / `number` / `enum` / `bool` / `tags` / `palette`
- `enum` 的 `options` 直接是数组：可以引用上面定义好的常量，也可以就地写 `[{ value, label, phrase }]`
- `default`：新建 item 时的初值，必须出现在 `options` 里
- `required`：右栏表单标星
- `canvas: true`：这一项的值会出现在画布左上角的标签里

## 类型

```js
{
  key: 'panel',                 // 存进 page.json 的 type
  label: '面板',                // 按钮与右栏标题
  role: 'panel',                // 参与编号、能被文字定位
  fields: [ … ],
  compile({ item, page }) {     // 返回 { label, caption, text?, tags?, palette? }，bbox 由核心补
    …
  },
}
```

`compile` 只拿到 `{ item, page }`；排版辅助函数（编号、定位、九宫格、竖排）就是同文件里的普通函数，直接用。

## buildSummary

```js
export function buildSummary({ page, items }) {
  return { meta, canvas, caption };
}
```

`items` 已经是编译后的 Moss item，`caption` 就是整页那段总述。

## 编译流程

```js
compilePage(page)                 // 用 config/manga.mjs 的类型与 buildSummary
  → 每个 item 调自己类型的 compile
  → toMoss() 把坐标换成中心原点 yxyx
  → buildSummary() 拼 summary
  → validatePage() 校验
```

编译器遍历 `items`，逐个调用类型自己的 `compile`，补上坐标后拼成最终 JSON。
