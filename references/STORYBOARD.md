# 分镜写法（画好一页的手册）

模型不会替你构思。它只会照着「每格写着什么 + 气泡写着什么」画。这一段写不好，出来就是一坨。

---

## 一、一页 = 一个节拍

**每页只讲一件事**：发生什么、谁的反应、停在哪。

- 叙事页 4~6 格，情绪页 2~3 格，高潮页 1 满版 + 2~4 嵌格
- 每格只承载一个信息点，别在一格里塞"她进门、脱鞋、坐下"
- 大格放在页面**下三分之一**，那是视线落点
- 一页只留**一处**出血（满版/破框），多了冲击力互相抵消

## 二、每格 caption 的五要素

顺序随意，但这五样要齐：

```
主体（谁） + 动作（在做什么） + 环境（在哪） + 景别（机位） + 光线/氛围
```

真实可用的例子：

```
W sits on the floor by the window, knees pulled up, afternoon light across her face
close-up of her hand gripping the strap, knuckles pale, blurred passengers behind
wide shot of the platform at 8am, faceless grey commuter silhouettes, her small figure among them
the empty carriage after the crowd leaves, scattered seats, fluorescent light flickering
```

**反例**（会画砸）：

| 写法 | 问题 |
|---|---|
| `孤独` | 抽象词，模型只会给你一张空椅子 |
| `她很伤心，因为想起了昨天的事` | 叙事说明，不是画面 |
| `画面很感人，8k masterpiece` | 空转质量词，没有信息 |
| `第一格和第二格的过渡` | 编辑说明，模型读不懂 |

规则：**只写看得见的东西**。情绪用动作、构图、光线表达，不直接写形容词。

## 三、气泡：位置和容量

模型对「气泡放哪」最不敏感，所以要靠 bbox 和字数把它按住：

- 气泡 bbox 中心不要压在人物脸上：人物通常占格子的左 1/2 或中间，气泡优先放**右上**或**左侧空白**
- 一条气泡最多 **12 字/列 × 3 列**，超了就会糊成一团
- 一页文字总量控制在 **5~8 条**，超过就是"字比画多"
- 台词要短。真实漫画一句 6~14 字；把长句拆成两条，或改成旁白

`compile` 会算「这个框能放多少字」，超了给 `bubble.overflow` 警告——**看到就改，别忽略**。

## 四、气泡类型别用错

| 场景 | 用哪个 |
|---|---|
| 正常说话 | `speech` 白椭圆 + 尾巴 |
| 喊叫 / 命令 | `shout` 锯齿爆炸 |
| 气音、虚弱 | `whisper` 小椭圆 + 三点尾 |
| 发抖、哭 | `tremble` 波浪边 |
| 心里想 | `thought` 云朵，无尾巴 |
| 心之声 / 电话那头 | `heart` 虚线框，无尾巴 |
| 时间地点交代 | `narration` 无框浮字 |
| 拟声词（咚、哗） | `sfx` 毛笔字 |

说话人不在画面里时 `tail: "none"`，否则模型会给一个指着空气的尾巴。

## 五、黑白要锁死

`style: "mono"` 时，编译器会给 summary 和**每一条** item 末尾加锁色句：

```
Black ink, white paper and grey screentone only, zero colour.
```

如果出来还是彩色，通常是：
1. 工作流里的负面提示词没跟着走 → 检查 `defaults.negative`
2. 用户用了彩色 LoRA → 换掉
3. 提示词里写了颜色词（`red ribbon`、`blue sky`）→ 改成 `dark ribbon`

## 六、人物一致性

设定只在 `bible.characters[].desc` 里写一次，页面的 `summary.caption` 会自动带上。

分格 caption 里**不要重复整段设定**，用短复述：

```
W in her white sailor blouse, black hair with a clip      ✅
a 22 year old college girl, long straight black hair ...  ❌（太长，会挤掉画面描述）
```

## 七、常见翻车与对策

| 现象 | 原因 | 对策 |
|---|---|---|
| 格子串味、内容跑到别的格 | 模型没理解分区 | 每格 caption 以 `This box contains only:` 开头（编译器自动加，但你要确保 caption 本身不跨格） |
| 气泡根本没画 | bbox 太小 / 被面板挤掉 / 文字太长 | 放大 bbox，减少字数，一页别超过 8 条 |
| 气泡画了但没字 | 文字框小于字号 | 提高字号或放大框 |
| 人物每格都变 | caption 里没有稳定锚点 | bible 写细，每格复述服装/发型关键词 |
| 整页糊成一团 | 格数太多 | 降到 4 格以内，一页一件事 |
| 出现彩色 | 提示词里有颜色词或 LoRA 冲突 | 去掉颜色词、换 LoRA |
| 画面没有分格线 | 工作流没接 `{{prompt}}` | `manga workflow check` 看 `{{prompt}}` 在不在 |

## 八、出图前自查

```bash
node scripts/manga.mjs compile --page N
```

- `error`：必须修（通常是没分格）
- `panel.blank`：某格没写 caption → 一定画成空框
- `bubble.overflow`：字数超框 → 拆条或放大
- `panel.out`：超出画布 → 除非是出血格，否则会裁掉
- `order.ambiguous`：同一横带两格重叠 → 阅读顺序会乱

## 九、一页完整的例子

```json
{
  "title": "车厢",
  "scene": "a half-empty train carriage, fluorescent light, blurred grey silhouettes",
  "panels": [
    { "caption": "wide shot of a crowded platform at 8am, faceless grey commuter silhouettes, her small figure among them", "camera": "wide", "shape": "rect" },
    { "caption": "close-up of her hand gripping the strap, knuckles pale, blurred passengers behind", "camera": "close", "shape": "rect" },
    { "caption": "full-body portrait of W in the carriage, wall of silhouettes behind her, faint blush", "camera": "medium", "shape": "bleed-bottom" }
  ],
  "bubbles": [
    { "type": "narration", "text": "每天早上八点十七分，我在同一节车厢里。", "vertical": false, "size": 20,
      "bbox": [60, 30, 500, 96] },
    { "type": "thought", "text": "挤成这样……其实我，并不讨厌。", "bbox": [420, 760, 700, 940] },
    { "type": "speech", "text": "……今天也要，撑过去。", "bbox": [80, 980, 380, 1150] }
  ]
}
```

注意三件事：旁白横排放在顶部空白、内心气泡在右下不与脸重叠、台词 3 条以内。
