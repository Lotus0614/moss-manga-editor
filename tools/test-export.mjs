// PDF 组装的结构自测：不依赖浏览器，喂假 JPEG 数据进去检查字节布局。
//   node tools/test-export.mjs

import assert from 'node:assert/strict';
import { buildPdf } from '../web/components/export.mjs';

const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const pages = [
  { bytes: fakeJpeg, width: 768, height: 1280 },
  { bytes: fakeJpeg, width: 768, height: 1280 },
];

const pdf = buildPdf(pages, '测试章节');
const text = Buffer.from(pdf).toString('latin1');

assert.ok(text.startsWith('%PDF-1.4'), 'PDF 头');
assert.ok(text.trimEnd().endsWith('%%EOF'), 'PDF 尾');
assert.ok(text.includes('/Count 2'), '页数正确');
assert.ok(text.includes('/Type /XObject') && text.includes('/Filter /DCTDecode'), '图片对象');
assert.ok(text.includes('/MediaBox [0 0 768 1280]'), '页面尺寸');

// xref 里每个偏移都应指向 "N 0 obj"
const xrefStart = Number(text.slice(text.lastIndexOf('startxref') + 9).trim().split('\n')[0]);
assert.ok(xrefStart > 0 && xrefStart < pdf.length, 'startxref 合法');
const xrefBlock = text.slice(xrefStart);
const entries = [...xrefBlock.matchAll(/^(\d{10}) 00000 n/gm)].map((m) => Number(m[1]));
assert.equal(entries.length, 8, '两页 × 3 个对象 + catalog + pages = 8');

for (const [i, offset] of entries.entries()) {
  const head = text.slice(offset, offset + 12);
  assert.match(head, /^\d+ 0 obj/, `偏移 ${offset} 指向的对象头不对（第 ${i + 1} 个）`);
}

console.log(`PDF 自测通过：${pages.length} 页，${pdf.length} 字节，${entries.length} 个对象`);
