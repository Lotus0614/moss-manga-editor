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
        phrase: 'rectangular panel',
    },
    {
        value: 'slant-top',
        label: '斜切上边',
        phrase: 'panel with a slanted top edge',
    },
    {
        value: 'slant-side',
        label: '斜切侧边',
        phrase: 'panel with a slanted side edge',
    },
    {
        value: 'bleed-top',
        label: '出血·上',
        phrase: 'panel bleeding off the top edge, no border',
        bleed: true,
    },
    {
        value: 'bleed-bottom',
        label: '出血·下',
        phrase: 'panel bleeding off the bottom edge, no border',
        bleed: true,
    },
    {
        value: 'bleed-left',
        label: '出血·左',
        phrase: 'panel bleeding off the left edge, no border',
        bleed: true,
    },
    {
        value: 'bleed-right',
        label: '出血·右',
        phrase: 'panel bleeding off the right edge, no border',
        bleed: true,
    },
    {
        value: 'bleed-all',
        label: '满版',
        phrase: 'full-bleed panel, no border',
        bleed: true,
    },
    {
        value: 'circle',
        label: '圆形',
        phrase: 'circular panel',
    },
];

/** 边框 */
export const FRAMES = [
    {
        value: 'border',
        label: '描边',
        phrase: 'crisp black panel border',
    },
    {
        value: 'none',
        label: '无边',
        phrase: 'no border',
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
 * phrase 进 summary 开头（只写一次，靠语序影响后面所有 item），meta 进 summary.meta。
 */
export const STYLES = [
    {
        value: 'mono',
        label: '黑白网点',
        meta: ['comic', 'multi_panel', 'digital_painting', 'monochrome'],
        phrase: 'High-taste, black and white vertical 2D manga comic, black ink on white paper, grey screentone dots only, zero colour.',
    },
    {
        value: 'color',
        label: '彩色',
        meta: ['comic', 'multi_panel', 'digital_painting', 'full color'],
        phrase: 'High-taste, fully colored vertical 2D digital painting comic, clean ink lineart with soft muted colouring.',
    },
    {
        value: 'sketch',
        label: '线稿',
        meta: ['comic', 'multi_panel', 'digital_painting', 'monochrome'],
        phrase: 'High-taste, vertical 2D manga lineart, black ink lines only on white paper, no tone, no colour.',
    },
];

/**
 * 文字载体。尾巴方向不再由字段指定：气泡形态只由 kind 决定，
 * 位置和说话人写进 desc（例：in the TOP LEFT of PANEL ONE, SPOKEN BY CHARACTER ONE - SHION）。
 */
export const BUBBLES = [
    {
        value: 'speech',
        label: '对话',
        phrase: 'white oval speech bubble, thin black outline',
    },
    {
        value: 'shout',
        label: '喊叫',
        phrase: 'jagged spiky speech bubble',
    },
    {
        value: 'whisper',
        label: '小声',
        phrase: 'small round white speech bubble, tail of tiny circles',
    },
    {
        value: 'tremble',
        label: '颤抖',
        phrase: 'white speech bubble with a shaky wavy outline',
    },
    {
        value: 'thought',
        label: '内心',
        phrase: 'white cloud-shaped thought bubble, scalloped edge',
    },
    {
        value: 'heart',
        label: '心之声',
        phrase: 'speech bubble with a dashed outline',
    },
    {
        value: 'narration',
        label: '旁白·白框',
        // 压在细节多的画面上也能读清，日漫常见的白底小方框
        phrase: 'narration in a plain white rectangular box with a thin black border',
    },
    {
        value: 'narration-bare',
        label: '旁白·裸字',
        // 无框：字直接压在画面上，靠白色描边浮起来
        phrase: 'narration printed directly on the artwork, no box, thin white outline',
    },
    {
        value: 'sfx',
        label: '拟声词',
        phrase: 'hand-lettered sound effect, bold brush strokes, no bubble',
    },
];

/** 原生 item 的 MOSS label，格式固定三种 */
export const MOSS_LABELS = [
    { value: 'object', label: 'object' },
    { value: 'character', label: 'character' },
    { value: 'text', label: 'text' },
];

// ---------------------------------------------------------------- 角色
// 角色格只认「这是谁」（ref）和「这一格画什么」（desc，作者写全）。
// 外貌存在项目的角色表里，只用来拼 summary 末尾的角色表；
// 这个文件不知道项目/存档长什么样，通过 resolveCharacter 回调取。

/** summary 角色表里的一行：名字 + 外貌（来自角色表） */
function castLine(item, resolveCharacter) {
    const char = resolveCharacter ? resolveCharacter(item.ref) : null;
    return {
        name: char?.name || item.ref || 'character',
        text: String(char?.look || '').trim(),
    };
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
};

const fill = (template, vars = {}) =>
    String(template || '').replace(/\{(\w+)\}/g, (match, key) =>
        vars[key] !== undefined ? String(vars[key]) : match,
    );

// ---------------------------------------------------------------- 辅助

/** 面板格：只用来数格数，不参与编号 */
function panelsOf(page) {
    return (page.items || []).filter((item) => PANEL_KEYS.has(item.type));
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

/** 一条文字的形态描述：只有形态，位置、说话人、留边都写在 desc 里 */
function bubblePhrase(bubble) {
    return (pick(BUBBLES, bubble.kind) || pick(BUBBLES, 'speech')).phrase;
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
    {
        key: 'summaryMeta',
        type: 'tags',
        label: 'summary.meta（留空 = 用画风自带的）',
    },
    {
        key: 'summaryCaption',
        type: 'longtext',
        label: 'summary.caption（填了就整段替换，包括角色表；留空才自动拼）',
    },
];

// ---------------------------------------------------------------- item 类型

/**
 * 所有格子共用的字段（native 是基础格子，其他类型都继承这一组）。
 *   note     备注，中文，只给人看，不进提示词
 *   caption  整段覆盖：填了就用它当产物 caption，自动拼的那套全部让位
 *   tags / palette  原样透传
 */
const BASE_FIELDS = [
    {
        key: 'note',
        type: 'longtext',
        label: '备注（中文，说明这一格是干什么的；不进提示词）',
    },
    {
        key: 'caption',
        type: 'longtext',
        label: '整段覆盖（留空 = 自动拼；填了就用这段，其他字段不再进提示词）',
    },
    { key: 'tags', type: 'tags', label: 'tags' },
    { key: 'palette', type: 'palette', label: 'palette' },
];

export const TYPES = [
    {
        key: 'panel',
        label: '面板',
        role: 'panel',
        fields: [
            {
                key: 'desc',
                type: 'longtext',
                label: '画面描述（开头自己写 PANEL 编号和位置）',
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
            ...BASE_FIELDS,
        ],
        compile({ item, page }) {
            const shape = pick(SHAPES, item.shape);
            const parts = [shape?.phrase];
            if (!shape?.bleed) parts.push(pick(FRAMES, item.frame)?.phrase);
            if (item.camera) parts.push(pick(CAMERAS, item.camera)?.phrase);

            const body = (item.desc || '').trim();
            if (body) parts.push(body);

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
                key: 'desc',
                type: 'longtext',
                label: '这一格的画面（自己写全：编号 + 名字 + 位置 + 姿势）',
                required: true,
            },
            ...BASE_FIELDS,
        ],
        compile({ item, page }) {
            // 这一格的文案由作者写全（外貌在角色表里，summary 会自动带上）；没写就不出图
            // 开头写 ! 表示「这一格和角色表不一样」，只影响 summary 要不要列这个角色，本身不带进提示词
            const body = String(item.desc || '')
                .replace(/^!/, '')
                .trim()
                .replace(/[.。]+$/, '');
            if (!item.ref || !body) return null;
            return {
                label: 'character',
                caption: `${body}.`,
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
                key: 'desc',
                type: 'longtext',
                label: '位置与说话人（in PANEL TWO, SPOKEN BY CHARACTER ONE - SHION）',
            },
            ...BASE_FIELDS,
        ],
        compile({ item, page }) {
            const parts = [bubblePhrase(item)];
            if (item.desc) parts.push(String(item.desc));
            parts.push(textLayoutOf(page, item));
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
                key: 'text',
                type: 'longtext',
                label: 'text（label=text 时必填）',
            },
            ...BASE_FIELDS,
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

/** 算作面板格数的类型：按 role 标记，不认具体 key */
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

    if (page.note) parts.push(page.note);

    // 角色表：本页出现的角色，外貌只在这里写一次（手写 summary 时不追加）
    const cast = [];
    const seen = new Set();
    for (const item of page.items || []) {
        if (item.type !== 'character' || !item.ref || seen.has(item.ref)) continue;
        if (String(item.desc || '').trim().startsWith('!')) continue;
        seen.add(item.ref);
        cast.push(castLine(item, resolveCharacter));
    }
    const castBlock = cast.length
        ? `CHARACTERS IN THIS PAGE (each one appears only inside its own box):\n${cast
              .map((char) => `- ${char.name}${char.text ? `: ${char.text}` : ''}`)
              .join('\n')}`
        : '';
    if (castBlock) parts.push(castBlock);

    const meta =
        Array.isArray(page.summaryMeta) && page.summaryMeta.length
            ? page.summaryMeta
            : style.meta;
    const override = String(page.summaryCaption || '').trim();

    return {
        meta,
        canvas:
            panels.length > 1 || texts.length > 1 ? 'multi_panel' : 'single',
        caption: override || parts.filter(Boolean).join('\n\n'),
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
