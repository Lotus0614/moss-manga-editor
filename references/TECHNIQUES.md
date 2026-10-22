# 漫画技巧

分镜页的画法。内容整理自 MOSS 官方《漫画生成技巧》《JSON Layout》，并结合本工具的实现。

配套：字段与坐标见 `FORMAT.md`，命令见 `CLI.md`，工作流见 `WORKFLOW.md`。

## 一、尺寸

分镜页固定 **768 × 1280**（竖版）。本工具默认画布就是它，别改方图或横版。

- 坐标范围 `x ∈ [0, 768]`、`y ∈ [0, 1280]`，左上原点
- 四边留 8–16px 安全边，只有出血格向外越界
- 需要跨页时另开一张 768×1280，不加长画布

## 二、阅读顺序

默认日式**右 → 左、上 → 下**。同一横带先右后左，再往下，不能跨层跳跃。

`summary` 里由 `readingOrders` 自动写：`Panels are read RIGHT TO LEFT, top to bottom.`

## 三、版式

### 五种常用结构

| 名称 | 说明 | 适用 |
|---|---|---|
| 横带式 | 3–6 条横带，每条可左右二分 | 叙事页，信息密度高 |
| 斜切式 | 面板间以斜线分隔，形成梯形 | 速度感、情绪推进 |
| 出血式 | 面板越过画布边缘，不画边框 | 特写、全景冲击 |
| 大格 + 小格 | 一大格配 2–5 小格 | 角色介绍、情绪落点 |
| 满版 + 嵌格 | 整页一张大图，角部贴小格 | 高潮页、细节补充 |

### 不规则怎么写

直接描述几何关系，不要用术语：

```
slanted upper edge cutting diagonally
trapezoid panel with a sharply angled edge
bleeding off the top and right edges, no border
her head and hair breaking OUT past the top border
```

原则：**格可以歪，阅读线不能乱**。同一行保持统一高度基准。

### 密度

| 页型 | 格数 | 结构 | 大格位置 | 气泡数 |
|---|---|---|---|---|
| 日常页 | 4–6 | 横带式 2/1/2 | 底部最后一格 | 5–8 |
| 推进页 | 4–5 | 斜切式 | 中段偏下 | 4–6 |
| 情绪页 | 2–3 | 大格 + 小格 | 占版面 60% 以上 | 2–4 |
| 高潮页 | 1 + 2–4 | 满版 + 嵌格 | 即满版 | 2–5 |

每格只承载一个信息点。

### 八条节奏原则

1. **先排节奏，再排内容**。格密＝节奏快，格疏＝节奏慢，一页要有一两处停顿
2. **大格放落点**：最大的格放页面下三分之一，冲击最足
3. **一页只给一次出血**，多了冲击力被稀释
4. **动线靠视线与尾巴牵引**：人物视线、气泡尾巴、身体朝向共同引导阅读
5. **右格写「发生」，左格写「反应」**
6. **斜切与梯形是调味**，一页最多一两处
7. **气泡先占位，人物后画**：气泡当色块铺一遍，剩余空间再安排脸
8. **留安全边**，只有出血格越界

一句话：**版式是对读者呼吸的安排**。

## 四、气泡

### 八种文字载体

| 类型 | 形状 | 尾巴 | 填充 |
|---|---|---|---|
| 对话 | 椭圆，线条均匀 | 指向说话者嘴部，由粗到细 | 白 |
| 喊叫 | 爆炸锯齿 | 粗、短 | 白 |
| 小声 | 小椭圆 | 三个小圆点依次缩小 | 白 |
| 颤抖 | 波浪边椭圆 | 细、抖 | 白 |
| 内心 | 云朵 / 毛边 | 无 | 白 |
| 心之声 | 虚线轮廓 | 无 | 无 |
| 旁白 | 无框浮字 | 无 | 无 |
| 拟声词 | 手写毛笔字，可跨格 | 无 | 无 |

英文描述在 `config/bubbles.mjs` 里，改那个文件即可。

### 硬性规则

- 旁白**必须**写 `no bubble, no box, no background`，否则会被画成白底框
- 说话者不在画面内 → 不加尾巴，注明 `NO tail because the speaker is off panel`
- 情绪强（喊叫、动摇、气音）换用对应形状，别一律椭圆
- 文字竖排多列自右向左，每列 8–12 字
- 气泡不压脸、不压关键动作、不跨格线
- 每个文字条目独立 item，各自带 bbox

## 五、人物一致性

设定集中写在 `summary`（本工具里就是页面的 `scene` + 人物设定段），分格只复述短关键词。

描述顺序：

1. 性别与年龄 2. 发型（长度、刘海、发饰） 3. 五官（眼型、痣、肤色）
4. 上装（款式、颜色、领子、配饰） 5. 下装 6. 袜鞋 7. 随身物 8. 体型

```
W = a 22 year old college girl, long straight black hair with a blunt fringe,
small hair clip; white short-sleeved sailor blouse with a dark square collar
edged in two white stripes and a thin ribbon tie; knee-length pleated skirt;
white loose socks bunched at the calves; dark loafers; school bag; large bust.
```

分格复述：`W in her white sailor blouse and navy skirt, black hair with a clip`

## 六、背景与空间

1. 背景是信息，不是装饰。每页至少一个「锚点格」交代时间地点
2. 一页最多一张全景，其余只给局部
3. 黑白靠网点密度做景深：近密、远淡，别整页一个灰度
4. 人群用灰色无脸剪影，解决一致性也造压迫感
5. 每页安排一个「记号道具」（布丁、伞、便签、时钟），贯穿全篇后回收
6. 光即情绪：窗格光＝日常，顶灯＝压迫，荧光灯＝冷漠，路灯＝孤独，夕阳＝告别
7. 人脸与关键动作周围留「呼吸白」，背景不得压脸
8. 场景元素只定义一次，写进 `scene`，后续页用短句复述
9. 先定机位（平视 / 俯视 / 仰视），再摆人

### 背景层级

| 层级 | 内容 | 频率 |
|---|---|---|
| L0 | 留白、网点、纯色 | 高 |
| L1 | 局部道具（杯子、门把、袜子） | 高 |
| L2 | 房间、走廊、车厢 | 中 |
| L3 | 全景、天空、街道 | 每页最多一张 |

### 场景元素表（写进 `scene`）

```
场景：房间 / 车厢 / 街道
- 窗户：位置、尺寸、光向
- 主家具：床 / 桌 / 椅子 / 衣柜 的位置
- 地面：榻榻米 / 木地板 / 瓷砖
- 光源：顶灯 / 台灯 / 窗外，色温
- 常用道具：3–5 件
- 机位：平视 / 俯视 / 仰视
```

复述示例：`his small room, futon by the wall, window on the right, one floor lamp`

## 七、画风

黑白（默认）：

```
MONOCHROME MANGA PAGE, ONE-COLOUR PRINT. Black ink lines on bare white paper,
grey screentone dot patterns only. ZERO COLOUR: no flesh colour, no skin tone,
no blue, no cyan, no yellow, no brown, no colour wash.
Skin is flat pale GREY halftone with black line shading, never a flesh tone.
Shadows are dense black crosshatching; highlights are untouched white paper.
```

每个分格和每条文字末尾再加一句收尾（本工具自动加）：

```
Black ink, white paper and grey screentone only, zero colour.
```

彩色：

```
FULL COLOR JAPANESE MANGA PAGE: clean ink lineart with soft muted digital
colouring, pale skin tones, desaturated palette.
```

三种预设写在 `config/prompts.mjs` 的 `stylePresets` 里，改它即可。

## 八、常见问题

| 现象 | 处理 |
|---|---|
| 旁白出现白框 | caption 里加 `no bubble, no box, no background` |
| 画面出现彩色 | summary 与面板 caption 同时强调 monochrome |
| 气泡形状错误 | 逐条指定形状与尾巴；情绪强的换锯齿 / 波浪 |
| 格子串位 | 面板 caption 写 `This box contains only ...`（本工具自动加） |
| 人物不一致 | 设定集中在 `scene`，分格短关键词复述 |
| 阅读顺序混乱 | 横带式结构 + 明确右→左 |
| 文字溢出 | 减少每列字数，扩大 bbox |
| 模型自己加假字 | 减少气泡数量；纯图页写 `no lettering` |
| 版面呆板 | 斜切、出血、错落高度，但保持阅读线 |

## 九、交付前自检

- [ ] 是否有交代时间地点的锚点格
- [ ] 一页内是否有一处明显的停顿大格
- [ ] 出血格是否只有一个
- [ ] 斜切是否不超过两处
- [ ] 阅读线是否始终右→左、上→下
- [ ] 气泡是否压脸、压动作、跨格线
- [ ] 安全边是否保留
- [ ] 人物设定是否与 `scene` 一致
