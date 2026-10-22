# MOSS Layout JSON 规范（原版）

MOSS-Image 的布局提示词格式。这里照录官方规范，用于理解编译产物；日常画漫画不需要手写，`compile` 会生成它。

适用：文字必须落在指定位置、画布要切多格、元素相对位置必须固定、要在已有构图上做增减或换字。
画面复杂但不需要控位时，用普通 caption，不需要 Layout。

## 结构

```json
{
  "width": 1536,
  "height": 1024,
  "bbox_coord_space": "abs",
  "bbox_format": "xyxy",
  "summary": {
    "caption": "……",
    "meta": ["poster"],
    "canvas": "single"
  },
  "items": [
    { "label": "object", "caption": "……", "bbox": [176, 224, 800, 864] },
    { "label": "text", "caption": "……", "text": "把日常，过成诗。", "bbox": [928, 272, 1408, 448] }
  ]
}
```

上面是草稿形态（左上原点）。最终交付用文末的单行形态。

## 字段白名单

不得增减字段。

| 字段 | 位置 | 必填 | 取值 |
|---|---|---|---|
| `width` `height` | 根 | 是 | 正整数，16 的倍数，等于出图尺寸 |
| `bbox_coord_space` | 根 | 是 | 固定 `"abs"`（左上角原点） |
| `bbox_format` | 根 | 是 | 固定 `"xyxy"` |
| `summary.caption` | summary | 是 | 整图描述，非空 |
| `summary.meta` | summary | 否 | 字符串数组，媒介/品类，1–4 个 |
| `summary.canvas` | summary | 否 | `single` / `multi_panel` / `collage` |
| `summary.palette` | summary | 否 | 十六进制色值数组，3–5 个 |
| `items` | 根 | 是 | 非空扁平数组 |
| `label` | item | 是 | 仅 `object` / `character` / `text` |
| `caption` | item | 是 | 该元素可见外观，非空 |
| `bbox` | item | 是 | 四个数 `[x1,y1,x2,y2]`，左上角原点 |
| `text` | item | `text` 项必填 | 要渲染的确切字符 |
| `tags` | item | 否 | 字符串数组 |
| `palette` | item | 否 | 十六进制色值数组 |

## 硬性约束

- 不写 `children`、`parent`、`id`、`elements`、`scene_type`、`gen_brief`、`must_not` 或任何说明字段；未知字段会被拒绝
- `label` 只有三个值。分格区域写成 `object`，在 caption 里说明是第几格
- `items` 必须扁平，不能嵌套
- `bbox` 必须 `x1<x2`、`y1<y2`，且落在 `0..width` / `0..height` 内
- 多个元素共用或重叠同一个 box 是允许的
- box 是摆放标注，不是要画出来的边框或贴纸底，caption 里不要写「带边框的框」
- 每个 item 的 caption 只描述该元素本身；整图风格、光线、色调写在 `summary.caption`

## canvas

只填 `single` / `multi_panel` / `collage`，默认 `single`。

| 值 | 含义 |
|---|---|
| `single` | 整张画布一幅画面，绝大多数情况 |
| `multi_panel` | 画布切成多格，用于分镜、前后对比、多镜头并列 |
| `collage` | 多个素材拼贴叠放，允许不规则边界和穿插 |

它只描述组织方式，不做排版：所有 `bbox` 永远在同一套坐标里，`canvas` 不会自动分栏。需要分格时自己给每个区域写 bbox，并在 `summary.caption` 写明格数与分隔方式。

## tags

只放在 item 上，`summary` 里不能有。

作用是：这个元素容易被画错时，用短词点明它是什么。用于 UI 部件、具体角色、特定器物、特殊材质、界面文字类型。

- 3–6 个短词，全小写英文，多词用下划线（`health_bar`、`open_field`）
- 只标身份，不重复 caption，不写形容词堆
- 身份清楚就不要写，把长度留给 caption
- `text` 项可以用它标注文字性质（`ui_text`、`calligraphy`）

## palette

只在颜色是硬要求时写。

- 十六进制大写 `#RRGGBB`，3–5 个，按面积从大到小
- `summary.palette` 写整图主色；`item.palette` 写该元素局部色
- `text` 项固定两个值：文字色 + 底色（无底色时用背景主色代替）
- 普通题材省略这个字段

## 坐标换算

先在左上角原点下算好 `[x1,y1,x2,y2]`，交付时换算成中心原点。

宽 W、高 H，最终坐标为 `[y_min, x_min, y_max, x_max]`：

```
y_min = y1 - H/2      x_min = x1 - W/2
y_max = y2 - H/2      x_max = x2 - W/2
```

- 用整数除法，`W/2`、`H/2` 取整（1024 → 512，1536 → 768）
- `x1`、`y1` 向下取整，`x2`、`y2` 向上取整，再减中心，box 只会略大不会切内容
- 输出必须是整数

例：1536×1024，杯子 `[176,224,800,864]` → `[-288,-592,352,32]`

## 输出形态

单行紧凑 JSON，字段顺序固定为 `summary`、`items`、`bbox_coord_space`、`bbox_format`，写 `abs_centralized` 与 `yxyx`，**不带 `width` / `height`**。

```json
{"summary":{"meta":["product campaign"],"canvas":"single","caption":"…","palette":["#F2E8DA","#8A7A66","#3B2E24"]},"items":[{"label":"object","caption":"…","bbox":[-288,-592,352,32],"tags":["ceramic_cup"],"palette":["#F2E8DA"]},{"label":"text","caption":"…","text":"把日常，过成诗。","bbox":[-240,160,-64,640],"palette":["#1F3D2B","#F2E8DA"]}],"bbox_coord_space":"abs_centralized","bbox_format":"yxyx"}
```

需要「草稿 / 可编辑版」时才输出左上原点的 `abs` / `xyxy` 版本，并保留 `width` / `height`。

## 交付前检查

- 每个 box 反算回左上原点后仍在画布内
- box 之间没有压住不该压的文字
- 主标题字号明显大于副文案，文字色与背景对比足够
- 所有坐标为整数，字段名与 `label` 取值都在白名单内
- 单行 JSON 能解析，`text` 里的换行是 `\n` 而不是真实断行

## 与本题目的关系

本工具直接产出「单行形态」：

- 页面坐标用左上原点 `[x1,y1,x2,y2]`，`core/manga-doc.mjs` 的 `toMoss()` 负责换成中心原点
- `label` 由类型定义决定（面板 → `object`，文字 → `text`，原生项可指定）
- `tags` / `palette` 在页面 item 上写，编译时原样透传
- `summary` 由 `config/types.mjs` 的 `buildSummary` 生成
