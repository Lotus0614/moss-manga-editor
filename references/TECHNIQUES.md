# 漫画技巧

分镜页的画法建议。整理自 MOSS 官方《漫画生成技巧》，按本项目的能力做了调整。

配套：页面字段与坐标见 `FORMAT.md`，命令见 `CLI.md`。

## 尺寸

画布尺寸不固定，按用途挑；宽高都必须是 16 的倍数，换尺寸后坐标范围随之变化。

| 用途 | 尺寸 | 面积 | 说明 |
| --- | --- | --- | --- |
| 快速试稿、单格少字 | 768 × 1280 | 约 1.0MP | 出图快，小字容易糊 |
| 常规连载页 | 1024 × 1536 | 约 1.5MP | 密排中文台词的起点 |
| 文字密集页 | 1152 × 1920 | 约 2.2MP | 一页十几条对白、要小字清晰 |
| 方图 / 横版 | 1024 × 1024 / 1536 × 1024 | 约 1.0 / 1.6MP | 单页插图、跨页 |

字越多、字号越小，越要往上加分辨率——低分辨率下 `text` 那层会被 VAE 解码糊掉。

建议四边留 8–16px 安全边，只有出血格向外越界。跨页时另开一页，不建议加长画布。

## 阅读顺序

固定右 → 左：同一横带内先右后左、再往下，`summary` 会自动写入这句说明，不需要手写。

排版时按这个顺序安排视线：右上第一格，同一横带往左，然后下一带。

## 版式

### 常见结构

| 名称        | 说明                       | 适合               |
| ----------- | -------------------------- | ------------------ |
| 横带式      | 3–6 条横带，每条可左右二分 | 叙事页，信息密度高 |
| 斜切式      | 面板间以斜线分隔，形成梯形 | 速度感、情绪推进   |
| 出血式      | 面板越过画布边缘，不画边框 | 特写、全景冲击     |
| 大格 + 小格 | 一大格配 2–5 小格          | 角色介绍、情绪落点 |
| 满版 + 嵌格 | 整页一张大图，角部贴小格   | 高潮页、细节补充   |

不规则面板建议直接描述几何关系，例如 `slanted upper edge cutting diagonally`、`bleeding off the top and right edges, no border`。同一行面板保持相近高度基准，阅读线更容易维持。

### 页型与密度（推荐值）

| 页型   | 格数    | 结构         | 大格位置        | 气泡数 |
| ------ | ------- | ------------ | --------------- | ------ |
| 日常页 | 4–6     | 横带式 2/1/2 | 底部            | 5–8    |
| 推进页 | 4–5     | 斜切式       | 中段偏下        | 4–6    |
| 情绪页 | 2–3     | 大格 + 小格  | 占版面 60% 以上 | 2–4    |
| 高潮页 | 1 + 2–4 | 满版 + 嵌格  | 即满版          | 2–5    |

一格承载一个信息点比较稳妥。

### 出血与破格

出血不是一种面板形状，而是版面关系：把一个框的 `bbox` 画到超出画布边界，超出部分自然被裁掉，看上去就是画面溢出了页面。

- **整格出血**：给这一格一个越出画布的 `bbox`，`frame` 设为 `none`（无边），caption 里写 `bleeding off the bottom, left and right edges with no border`
- **人物破格**：人物单独给一个框，`overlay: true` 让它压在其它面板之上，bbox 越出画布或越过面板边界，caption 里写 `her head and hair breaking out past the top border of the panel`
- 一页做一次出血就够，做多了冲击力会被稀释
- 出血框也要遵守 16 的倍数，越界部分算负数或超过画布宽高都允许

### 多格页面的硬规则

违反这几条时最典型的失败是「多画一颗头」和「人物跨格」：

1. **局部特写用原生项**：眼睛、嘴唇、手、衣褶、招牌这类放大格写成 `native`（`label: text` 或 `label: object`），caption 开头写 `Extreme close-up inset showing ONLY the …`。任何 `label: character` 的格子都会被当成「这里要画一个人」，特写格里就会长出多余的头。
2. **两个人就两个框**：同格双人拆成两个 `character` 项，两个 `bbox` 的 X 之间留 30–140px 空档，caption 写 `standing far apart on opposite ends of the panel`；写进同一个框会画成肩贴肩。
3. **并排小格对齐上边界**：左右并列的两格，`bbox` 的 `y1` 取同一个值，否则其中一格的人会半截身子跨进旁边那格。
4. **小格用半身景别**：一页 6–7 格时，小格的 caption 写 `waist-up medium shot` 或 `thigh-up medium shot`，不要写 `full-body`，否则人物被压成四头身。
5. **留白放标题**：页面顶部或斜角留白处放一个 `native` 写标题字（`Ornate stylized manga title logo in bold typography`），比让模型自己找地方塞字稳。
6. **只出草图时全用原生项**：把整页 `character` 都换成 `native`，caption 写「只画几何体、不画五官」，得到的是分镜占位图。

### 节奏原则

1. 先排节奏再排内容：格密节奏快，格疏节奏慢，一页留一两处停顿
2. 大格放在页面下三分之一，冲击更足
3. 出血格一页一个左右即可，多了冲击力会被稀释
4. 动线靠人物视线、气泡尾巴、身体朝向牵引
5. 右侧写「发生」、左侧写「反应」，符合日漫阅读习惯
6. 斜切与梯形作为点缀，一页一两处
7. 先铺气泡占位，再安排人物，可以减少气泡压脸
8. 留安全边，避免裁切损失关键信息

## 人物一致性

只有主角需要跨页一致，所以只给主角建角色表（`manga character add`）；路人和背景人物直接写在各自格子的 `desc` 里，不进角色表。

主角的设定只写一次（角色表），分格用短关键词复述，一致性更稳。

建议的描述顺序：

1. 性别与年龄
2. 发型（长度、刘海、发饰）
3. 五官（眼型、痣、肤色）
4. 上装（款式、颜色、领子、配饰）
5. 下装（款式、颜色、长度）
6. 袜鞋
7. 随身物
8. 体型

示例：

```
W = a 22 year old college girl, long straight black hair with a blunt fringe,
small hair clip; white short-sleeved sailor blouse with a dark square collar
edged in two white stripes and a thin ribbon tie; knee-length pleated skirt;
white loose socks bunched at the calves; dark loafers; school bag; large bust.
```

分格复述：`W in her white sailor blouse and navy skirt, black hair with a clip`

### 多格页面里的三条

1. **每格都要重复骨相与瞳色的短句**：`our tall slender 16-year-old girl with a softly tapered chin and sharp green eyes` 这类短句不能省。省掉瞳色以后，同一个框里 `blush` 一类的词会把眼睛染成粉色。
2. **不要写幼龄词，连否定句也不要**：`petite`、`child`、`10 years old`、`little` 在多格里会被单独提取出来，写 `neither a 10-year-old child` 一样会把人物画幼。
3. **图内印字和设定年龄分开处理**：名牌上印 `12岁` 会把人物画幼，印 `AGE 19` 会把身材带胖；需要时改印 `15岁`，并在正文里补纤细体型描写。
