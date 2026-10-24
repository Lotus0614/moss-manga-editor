// 漫画方言：这个项目对「漫画」这件事的全部约定。
//
// 页面字段、item 类型、枚举词表、句子模板、summary 写法，全在这一个文件里。
// 内核与网页直接 import 这个文件，用下面导出的数据和查询函数。

const pick = (list, value) =>
    list.find((option) => option.value === value) || null;

// ---------------------------------------------------------------- 词表
// 每项都是 { value, label, phrase?, ... }：value 存进 JSON，label 是界面上显示的字，
// phrase 是拼进提示词的那句英文。多出来的键由这一项自己解释，不用去别处找。

/** 分格形状：bleed = 可以超出画布 */
export const SHAPES = [
    {
        value: 'rect',
        label: '矩形',
        phrase: 'rectangular panel with straight edges',
    },
    {
        value: 'slant-top',
        label: '斜切上边',
        phrase: 'trapezoid panel with a slanted top edge cutting diagonally',
    },
    {
        value: 'slant-side',
        label: '斜切侧边',
        phrase: 'panel with a sharply angled slanted side edge',
    },
    {
        value: 'bleed-top',
        label: '出血·上',
        phrase: 'panel bleeding off the TOP edge of the page, no border',
        bleed: true,
    },
    {
        value: 'bleed-bottom',
        label: '出血·下',
        phrase: 'panel bleeding off the BOTTOM edge of the page, no border',
        bleed: true,
    },
    {
        value: 'bleed-left',
        label: '出血·左',
        phrase: 'panel bleeding off the LEFT edge of the page, no border',
        bleed: true,
    },
    {
        value: 'bleed-right',
        label: '出血·右',
        phrase: 'panel bleeding off the RIGHT edge of the page, no border',
        bleed: true,
    },
    {
        value: 'bleed-all',
        label: '满版',
        phrase: 'full-bleed panel covering the whole page, no border, artwork running off all four edges',
        bleed: true,
    },
    {
        value: 'circle',
        label: '圆形',
        phrase: 'circular panel with a clean round border',
    },
];

/** 边框 */
export const FRAMES = [
    {
        value: 'border',
        label: '描边',
        phrase: 'crisp black panel border with a white gutter around it',
    },
    {
        value: 'none',
        label: '无边',
        phrase: 'no border, artwork fills the panel edge to edge',
    },
    { value: 'thick', label: '粗边', phrase: 'heavy black panel border' },
];

/** 机位 / 景别 */
export const CAMERAS = [
    { value: 'eye', label: '平视', phrase: 'eye-level shot' },
    { value: 'high', label: '俯视', phrase: 'high-angle shot looking down' },
    { value: 'low', label: '仰视', phrase: 'low-angle shot looking up' },
    { value: 'wide', label: '全景', phrase: 'wide establishing shot' },
    { value: 'medium', label: '中景', phrase: 'medium shot' },
    { value: 'close', label: '特写', phrase: 'close-up' },
    { value: 'xclose', label: '大特写', phrase: 'extreme close-up' },
    { value: 'ots', label: '过肩', phrase: 'over-the-shoulder shot' },
    {
        value: 'dutch',
        label: '荷兰角',
        phrase: 'dutch angle with a tilted horizon',
    },
];

/**
 * 画风：整页总基调。
 * phrase 进 summary 开头；guard 会补到每一项末尾，用来压住模型跑偏（彩色/网点/线稿）。
 * meta 进 summary.meta。
 */
export const STYLES = [
    {
        value: 'mono',
        label: '黑白网点',
        meta: ['japanese manga page', 'monochrome'],
        phrase: 'STRICTLY BLACK AND WHITE PRINTED MANGA PAGE, black ink only. Every tone is either PURE BLACK INK, BARE WHITE PAPER, or a VISIBLE SCREENTONE DOT PATTERN — screentone is always a pattern of discrete dots, never a flat grey fill, never a smooth gradient, never an airbrushed grey wash, never grey paint. ZERO COLOUR: no flesh colour, no skin tone, no blue, no cyan, no yellow, no brown, no colour wash. Skin is bare white paper with black line hatching and dot screentone, never a grey fill. Shadows are dense black crosshatching or dense dot patterns, highlights are untouched white paper.',
        guard: 'Pure black ink and bare white paper only, every tone is visible dot screentone, no flat grey fill, no gradient, no airbrush, zero colour.',
    },
    {
        value: 'color',
        label: '彩色',
        meta: ['japanese manga page', 'full color'],
        phrase: 'FULL COLOUR JAPANESE MANGA PAGE: clean ink lineart with soft muted digital colouring, pale skin tones, desaturated palette, consistent light direction across all panels.',
        guard: '',
    },
    {
        value: 'sketch',
        label: '线稿',
        meta: ['manga lineart', 'monochrome'],
        phrase: 'MANGA LINEART ONLY, clean black ink lines on pure white, no screentone, no shading fills, no colour at all.',
        guard: 'Black ink on white only, zero tone, zero colour.',
    },
];

/** 文字载体：tail = 这种载体画不画尾巴 */
export const BUBBLES = [
    {
        value: 'speech',
        label: '对话',
        phrase: 'WHITE OVAL speech bubble, smooth even outline, thin black line',
        tail: true,
    },
    {
        value: 'shout',
        label: '喊叫',
        phrase: 'JAGGED EXPLOSIVE speech bubble with sharp spiky edges',
        tail: true,
    },
    {
        value: 'whisper',
        label: '小声',
        phrase: 'small round WHITE OVAL speech bubble, its tail made of three tiny circles trailing away in a line',
        tail: true,
    },
    {
        value: 'tremble',
        label: '颤抖',
        phrase: 'WHITE speech bubble with a SHAKY WAVY outline',
        tail: true,
    },
    {
        value: 'thought',
        label: '内心',
        phrase: 'WHITE CLOUD-shaped thought bubble, scalloped edge, thin black outline, NO tail',
        tail: false,
    },
    {
        value: 'heart',
        label: '心之声',
        phrase: 'speech bubble with a DASHED black outline, white interior, NO tail',
        tail: false,
    },
    {
        value: 'narration',
        label: '旁白',
        // 旁白压在细节多的画面上根本读不清，改用日漫常见的白底小方框
        phrase: 'narration lettering set in a plain white rectangular caption box with a thin black border, box edges straight and parallel to the panel edge, box covers the artwork behind it',
        tail: false,
    },
    {
        value: 'sfx',
        label: '拟声词',
        phrase: 'hand-lettered sound effect, bold brush strokes, slightly rotated, thin white outline, no bubble',
        tail: false,
    },
];

/** 尾巴方向：none = 说话者不在画面 */
export const TAILS = [
    {
        value: 'none',
        label: '无尾巴',
        phrase: 'NO tail because the speaker is off panel',
    },
    {
        value: 'down-left',
        label: '左下',
        phrase: 'a short tapering tail pointing down-left',
    },
    {
        value: 'down',
        label: '正下',
        phrase: 'a short tapering tail pointing straight down',
    },
    {
        value: 'down-right',
        label: '右下',
        phrase: 'a short tapering tail pointing down-right',
    },
    {
        value: 'left',
        label: '正左',
        phrase: 'a short tapering tail pointing left',
    },
    {
        value: 'right',
        label: '正右',
        phrase: 'a short tapering tail pointing right',
    },
    {
        value: 'up-left',
        label: '左上',
        phrase: 'a short tapering tail pointing up-left',
    },
    {
        value: 'up',
        label: '正上',
        phrase: 'a short tapering tail pointing straight up',
    },
    {
        value: 'up-right',
        label: '右上',
        phrase: 'a short tapering tail pointing up-right',
    },
];

/** 原生 item 的 MOSS label，格式固定三种 */
export const MOSS_LABELS = [
    { value: 'object', label: 'object' },
    { value: 'character', label: 'character' },
    { value: 'text', label: 'text' },
];

// ---------------------------------------------------------------- 角色
// 人物不预设任何字段：只认「这是谁」（ref）和「这一格有什么不一样」（caption）。
// 外貌存在项目的角色表里，编译时通过 resolveCharacter 回调注入——
// 这个文件不知道项目/存档长什么样。

/**
 * 一个 character 项的最终描述。
 *   caption 空         → 用角色表 look
 *   caption 普通文本    → look + "In this box: <caption>"
 *   caption 以 ! 开头   → 整段替换 look（裸体、受伤、换装这类特例）
 */
function characterText(item, resolveCharacter) {
    const caption = String(item.caption || '').trim();
    const char = resolveCharacter ? resolveCharacter(item.ref) : null;
    const name = char?.name || item.ref || 'character';
    const look = String(char?.look || '').trim();

    if (caption.startsWith('!')) {
        return { name, text: caption.slice(1).trim() };
    }
    const extra = caption ? `In this box: ${caption}` : '';
    return { name, text: [look, extra].filter(Boolean).join('. ') };
}

// ---------------------------------------------------------------- 句子模板
// 编译器里所有会进提示词的固定句式；{xxx} 是占位符。

export const SNIPPETS = {
    panelCount: 'The page is divided into {n} {panels}. {order}',
    readingOrder: 'Panels are read RIGHT TO LEFT, top to bottom.',
    textLock:
        'This page has exactly {panels} panel(s) and exactly {texts} text element(s). Render ONLY the text listed below, with the exact wording given. Do NOT invent any additional dialogue, speech bubble, caption, sound effect or lettering, and do not fill empty space with text — any text that is not listed is an error.',
    bubbleRule:
        'Dialogue uses white speech bubbles with tails, thoughts use white cloud bubbles with no tail, and narration sits in a small plain white rectangular caption box. Every bubble and caption box stays INSIDE one panel and never crosses a panel border.',
    noLettering:
        'This page contains NO lettering at all: no speech bubbles, no captions, no sound effects, no text of any kind.',
    boxPrefix: 'This box contains only:',
};

const fill = (template, vars = {}) =>
    String(template || '').replace(/\{(\w+)\}/g, (match, key) =>
        vars[key] !== undefined ? String(vars[key]) : match,
    );

// ---------------------------------------------------------------- 排版辅助

/** 阅读顺序：同一横带内先右后左，再上→下（日漫固定右开） */
function readingOrder(page) {
    return [...panelsOf(page)].sort((a, b) => {
        if (Math.abs(a.bbox[1] - b.bbox[1]) > 24) return a.bbox[1] - b.bbox[1];
        return b.bbox[0] - a.bbox[0];
    });
}

function panelsOf(page) {
    return (page.items || []).filter((item) => PANEL_KEYS.has(item.type));
}

/** 面板编号：在阅读顺序里的 1-based 序号 */
function panelNumber(page, item) {
    const index = readingOrder(page).findIndex((panel) => panel.id === item.id);
    return index >= 0 ? index + 1 : undefined;
}

/** 文字落在哪个面板：完全在里面 / 压到边缘 */
function locateInPanel(page, item) {
    const panels = panelsOf(page);
    const [bx1, by1, bx2, by2] = item.bbox;
    const cx = (bx1 + bx2) / 2;
    const cy = (by1 + by2) / 2;
    let chosen = null;
    let bestArea = 0;

    for (const panel of panels) {
        const [x1, y1, x2, y2] = panel.bbox;
        const inside = cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
        if (inside) {
            chosen = panel;
            break;
        }
        const ix = Math.min(bx2, x2) - Math.max(bx1, x1);
        const iy = Math.min(by2, y2) - Math.max(by1, y1);
        const area = ix > 0 && iy > 0 ? ix * iy : 0;
        if (area > bestArea) {
            bestArea = area;
            chosen = panel;
        }
    }
    if (!chosen) return '';

    const [x1, y1, x2, y2] = chosen.bbox;
    const fully =
        bx1 >= x1 - 2 && bx2 <= x2 + 2 && by1 >= y1 - 2 && by2 <= y2 + 2;
    const number = panelNumber(page, chosen);
    return `${fully ? 'inside' : 'at the edge of'} PANEL ${number ?? '?'}`;
}

/** 页面区域：九宫格描述 */
function placementOf(page, bbox) {
    const [w, h] = page.size;
    const rx = (bbox[0] + bbox[2]) / 2 / w;
    const ry = (bbox[1] + bbox[3]) / 2 / h;
    const vertical = ry < 0.34 ? 'upper' : ry > 0.66 ? 'lower' : 'middle';
    const horizontal = rx < 0.34 ? 'left' : rx > 0.66 ? 'right' : 'centre';
    return `${vertical} ${horizontal} area of the page`;
}

/** 竖排 / 横排描述 */
function textLayoutOf(page, item) {
    const vertical =
        typeof item.vertical === 'boolean'
            ? item.vertical
            : page.vertical !== false;
    return vertical
        ? 'vertical lettering, columns read right to left'
        : 'horizontal lettering';
}

/** 一条文字的形态描述 */
function bubblePhrase(bubble) {
    const kind = pick(BUBBLES, bubble.kind) || pick(BUBBLES, 'speech');
    const parts = [kind.phrase];
    if (kind.tail) {
        parts.push(
            (pick(TAILS, bubble.tail) || pick(TAILS, 'down-left')).phrase,
        );
        // 文字贴到气泡轮廓上会糊成一团，明确要求留边
        parts.push(
            'the lettering sits well inside the bubble with a clear margin, never touching the outline',
        );
    }
    return parts.join(', ');
}

const styleOf = (page) => pick(STYLES, page.style) || pick(STYLES, 'mono');

// ---------------------------------------------------------------- 页面字段

export const PAGE = [
    {
        key: 'style',
        type: 'enum',
        label: '画风',
        options: STYLES,
        default: 'mono',
    },
    { key: 'vertical', type: 'bool', label: '全局竖排', default: true },
    { key: 'scene', type: 'text', label: '场景' },
    { key: 'note', type: 'text', label: '补充说明' },
];

// ---------------------------------------------------------------- item 类型

export const TYPES = [
    {
        key: 'panel',
        label: '面板',
        role: 'panel',
        fields: [
            {
                key: 'caption',
                type: 'longtext',
                label: '画面描述',
                required: true,
            },
            {
                key: 'camera',
                type: 'enum',
                label: '机位',
                options: CAMERAS,
                default: 'medium',
                canvas: true,
            },
            {
                key: 'shape',
                type: 'enum',
                label: '形状',
                options: SHAPES,
                default: 'rect',
                canvas: true,
            },
            {
                key: 'frame',
                type: 'enum',
                label: '边框',
                options: FRAMES,
                default: 'border',
            },
            { key: 'tags', type: 'tags', label: 'tags' },
            { key: 'palette', type: 'palette', label: 'palette' },
        ],
        compile({ item, page }) {
            const style = styleOf(page);
            const shape = pick(SHAPES, item.shape);
            const parts = [shape?.phrase];
            if (!shape?.bleed) parts.push(pick(FRAMES, item.frame)?.phrase);
            if (item.camera) parts.push(pick(CAMERAS, item.camera)?.phrase);

            const number = panelNumber(page, item);
            const body = (item.caption || '').trim();
            const tag = number ? `PANEL ${number}` : '';
            if (body || tag)
                parts.push(
                    `${SNIPPETS.boxPrefix} ${[tag, body].filter(Boolean).join(', ')}`,
                );
            if (style.guard) parts.push(style.guard);

            return {
                label: 'object',
                caption: parts.filter(Boolean).join(', '),
            };
        },
    },
    {
        key: 'character',
        label: '角色',
        fields: [
            {
                key: 'ref',
                type: 'characterRef',
                label: '角色',
                required: true,
                canvas: true,
            },
            {
                key: 'caption',
                type: 'longtext',
                label: '这一格的补充（背面／遮挡／做了什么；以 ! 开头则替换外貌）',
            },
            { key: 'tags', type: 'tags', label: 'tags' },
        ],
        compile({ item, page, resolveCharacter }) {
            // 还没选角色就不出图（右上「＋角色」加出来是空的，选完才有内容）
            if (!item.ref) return null;
            const style = styleOf(page);
            const { name, text } = characterText(item, resolveCharacter);
            const parts = [
                `character ${name}${text ? `: ${text}` : ''}`,
                'This figure appears only inside its own box',
            ];
            if (style.guard) parts.push(style.guard);
            return {
                label: 'character',
                caption: parts.join('. '),
            };
        },
    },
    {
        key: 'bubble',
        label: '气泡',
        fields: [
            { key: 'text', type: 'longtext', label: '文字', required: true },
            {
                key: 'kind',
                type: 'enum',
                label: '类型',
                options: BUBBLES,
                default: 'speech',
                canvas: true,
            },
            {
                key: 'tail',
                type: 'enum',
                label: '尾巴',
                options: TAILS,
                default: 'down-left',
            },
            { key: 'caption', type: 'text', label: '补充说明（特殊文字用）' },
            { key: 'tags', type: 'tags', label: 'tags' },
            { key: 'palette', type: 'palette', label: 'palette' },
        ],
        compile({ item, page }) {
            const style = styleOf(page);
            const parts = [bubblePhrase(item)];
            const where = locateInPanel(page, item);
            if (where) parts.push(where);
            if (item.caption) parts.push(String(item.caption));
            parts.push(`placed in the ${placementOf(page, item.bbox)}`);
            parts.push(textLayoutOf(page, item));
            if (style.guard) parts.push(style.guard);
            return {
                label: 'text',
                caption: parts.filter(Boolean).join(', '),
                ...(item.text ? { text: item.text } : {}),
            };
        },
    },
    {
        key: 'native',
        label: '原生',
        fields: [
            {
                key: 'label',
                type: 'enum',
                label: 'label',
                options: MOSS_LABELS,
                default: 'object',
                canvas: true,
            },
            {
                key: 'caption',
                type: 'longtext',
                label: 'caption',
                required: true,
            },
            {
                key: 'text',
                type: 'longtext',
                label: 'text（label=text 时必填）',
            },
            { key: 'tags', type: 'tags', label: 'tags' },
            { key: 'palette', type: 'palette', label: 'palette' },
        ],
        compile({ item }) {
            return {
                label: item.label || 'object',
                caption: item.caption || '',
                ...(item.text ? { text: item.text } : {}),
            };
        },
    },
];

// ---------------------------------------------------------------- 整页 summary

/** 参与编号的类型：按 role 标记，不认具体 key */
const PANEL_KEYS = new Set(
    TYPES.filter((type) => type.role === 'panel').map((type) => type.key),
);

export function buildSummary({ page, items, resolveCharacter }) {
    const style = styleOf(page);
    const panels = panelsOf(page);
    const texts = items.filter((item) => item.label === 'text');
    const parts = [style.phrase];

    if (panels.length > 0) {
        parts.push(
            fill(SNIPPETS.panelCount, {
                n: panels.length,
                panels: panels.length === 1 ? 'panel' : 'panels',
                order: SNIPPETS.readingOrder,
            }),
        );
    }

    if (texts.length > 0) {
        parts.push(
            fill(SNIPPETS.textLock, {
                panels: panels.length,
                texts: texts.length,
            }),
        );
        parts.push(SNIPPETS.bubbleRule);
    } else {
        parts.push(SNIPPETS.noLettering);
    }

    if (page.scene) parts.push(page.scene);

    // 本页共用同一套外貌的角色：只列一次；用 ! 覆盖的那几格不进来
    const cast = [];
    const seen = new Set();
    for (const item of page.items || []) {
        if (item.type !== 'character' || !item.ref || seen.has(item.ref)) continue;
        if (String(item.caption || '').trim().startsWith('!')) continue;
        seen.add(item.ref);
        const { name, text } = characterText(item, resolveCharacter);
        cast.push({ name, text });
    }
    if (cast.length) {
        parts.push(
            `CHARACTERS IN THIS PAGE (each one appears only inside its own box):\n${cast
                .map((char) => `- ${char.name}${char.text ? `: ${char.text}` : ''}`)
                .join('\n')}`,
        );
    }

    if (page.note) parts.push(page.note);
    if (style.guard) parts.push(style.guard);

    return {
        meta: style.meta,
        canvas:
            panels.length > 1 || texts.length > 1 ? 'multi_panel' : 'single',
        caption: parts.filter(Boolean).join('\n\n'),
    };
}

// ---------------------------------------------------------------- 查询
// 消费方（core / web）直接 import 这些函数和上面的数据，不再经过管理器。

export function pageField(key) {
    return PAGE.find((field) => field.key === key) || null;
}

export function itemType(key) {
    return TYPES.find((type) => type.key === key) || null;
}

export function fieldsOf(typeKey) {
    return itemType(typeKey)?.fields || [];
}

export function fieldOf(typeKey, fieldKey) {
    return fieldsOf(typeKey).find((field) => field.key === fieldKey) || null;
}

export function optionsOf(field) {
    return Array.isArray(field?.options) ? field.options : [];
}

/** 某个枚举字段的某个值对应的整项（含 label / phrase 等） */
export function optionOf(field, value) {
    if (!field) return null;
    return optionsOf(field).find((option) => option.value === value) || null;
}

export function optionLabel(field, value) {
    return optionOf(field, value)?.label ?? value;
}

/** 类型上的某个枚举字段取值 → 选项 */
export function typeOption(typeKey, fieldKey, value) {
    return optionOf(fieldOf(typeKey, fieldKey), value);
}

/** 画布左上角标签：只有 canvas: true 的字段才出现 */
export function canvasLabel(item, index = 0) {
    const type = itemType(item.type);
    if (!type) return item.type || '';
    const parts = [];
    for (const field of type.fields) {
        if (!field.canvas) continue;
        const raw = item[field.key];
        if (raw === undefined || raw === null || raw === '') continue;
        if (Array.isArray(raw) && !raw.length) continue;
        parts.push(
            field.type === 'enum' ? optionLabel(field, raw) : String(raw),
        );
    }
    const head = type.label + (type.key === 'panel' ? index + 1 : '');
    return parts.length ? `${head} · ${parts.join(' / ')}` : head;
}

export default {
    name: 'manga',
    page: PAGE,
    types: TYPES,
    snippets: SNIPPETS,
    buildSummary,
};
