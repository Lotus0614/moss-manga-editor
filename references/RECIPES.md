# 常见改法（补丁配方）

所有补丁都是「只写要改的字段」，用 `manga page set --page N --file patch.json` 应用。
没写的字段保持原样；`items` 按 `id` 合并（对不上的当作新项追加），删项用 `removeItems`。

先看现状：

```bash
manga page show --page 1 --summary
```

输出会带每个元素的 `id` 和 `bbox`，补丁里用 `id` 定位。

---

## 改一句台词

```json
{ "items": [{ "type": "bubble", "id": "bb_cd34", "text": "……今天，也要撑过去。" }] }
```

注意：只写这一条，其它气泡**不要**出现在数组里，否则会被删掉。

---

## 只改一格的画面描述

```json
{ "items": [{ "type": "panel", "id": "pn_ab12", "caption": "close-up of her hand gripping the strap, blurred passengers behind" }] }
```

---

## 挪动 + 放大一格

```json
{ "items": [{ "type": "panel", "id": "pn_ab12", "bbox": [8, 700, 760, 1272] }] }
```

`bbox` 是左上原点 `[x1,y1,x2,y2]`，必须是整数，别超出画布（出血格除外）。

---

## 整页重排

没有版式预设，直接写 items。比如把两格改成三格：

```json
{
  "items": [
    { "type": "panel", "id": "pn_a", "bbox": [8, 8, 760, 420] },
    { "type": "panel", "id": "pn_b", "bbox": [8, 428, 380, 848] },
    { "type": "panel", "id": "pn_c", "bbox": [388, 428, 760, 848] }
  ]
}
```

`items` 按 id 合并：能对上 id 的改坐标，对不上的当作新项追加。要删项用 `removeItems`。

---

## 加一条旁白

加一条新文字：`items` 里放一个不带 `id` 的对象就会追加（id 自动生成）：

```json
{
  "items": [
    { "type": "bubble", "id": "bb_cd34", "text": "……今天也要，撑过去。", "bbox": [353, 488, 676, 628], "kind": "speech", "tail": "down-left" },
    { "type": "bubble", "text": "八点十七分，车厢里没有座位。", "bbox": [40, 30, 420, 96], "kind": "narration", "vertical": false, "size": 20 }
  ]
}
```

---

## 改画风 / 阅读顺序

```json
{ "style": "color", "reading": "ltr" }
```

---

## 加一页

```bash
manga page new --title "站台"
manga page show --page 3 --summary
```

新页只有一个占满整页的框，再按需要切成多格。

---

## 重出某页（换 seed）

```bash
manga render --page 2 --seed 12345
```

不传 seed 就是随机。同一份页面 + 同一个 seed = 同一张图（工作流没变的前提下）。

---

## 出图前先自查

```bash
manga compile --page 2
```

`error` 会拦住渲染，`warn` 只是提醒。常见 warn：

- `panel.blank`：某一格没写 caption，会画成空框
- `bubble.overflow`：字数超出这一框的容量，建议拆条或放大框
- `panel.out`：超出画布，内容可能被裁掉

---

## 用户改完页面后

```bash
manga changes --json     # 只看差异，不要重读所有页
manga render --page 2    # 改哪页就重出哪页
manga ack                # 同步完一定要 ack，否则下次还返回同一批差异
```

---

## 给用户看的预览

```bash
manga serve --open       # 启动并打开浏览器
manga stop               # 关掉
```

用户说"改好了"，先 `manga changes` 看看他到底改了什么，再决定要不要重出。
