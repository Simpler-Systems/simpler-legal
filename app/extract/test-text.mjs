import fs from 'node:fs';
import { readText, maskSpans, csvShape } from './text.mjs';
import { detectFormat } from './detect.mjs';

let failures = 0;
const assert = (c, l) => { console.log(`${c ? '  ✔' : '  ✘ FAIL'} ${l}`); if (!c) failures++; };

// ---------- text family ----------
console.log('— text family (.txt .md .csv .log) —');

// CSV: UTF-8 BOM + CRLF + quoted field containing a comma
const csvBody = 'Name,SSN,Notes\r\n"Lim, Wei Sheng",123-45-6789,"met at 80 Raffles Place"\r\nMargaret Tan,987-65-4321,ok\r\n';
const csvBuf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csvBody, 'utf8')]);
const csv = readText(csvBuf);
assert(csv.bom && csv.encoding === 'utf-8' && csv.eol === 'crlf', `csv: BOM + encoding + CRLF detected (${csv.encoding}, ${csv.eol})`);
assert(csv.text === csvBody, 'csv: BOM stripped, content intact');

// mask like the engine would (longest-first, in place) and prove the CSV survives
const t = csv.text;
const spans = [
  { start: t.indexOf('Lim, Wei Sheng'), end: t.indexOf('Lim, Wei Sheng') + 'Lim, Wei Sheng'.length, tag: '[PERSON-1]' },
  { start: t.indexOf('123-45-6789'), end: t.indexOf('123-45-6789') + 11, tag: '[ID-1]' },
  { start: t.indexOf('80 Raffles Place'), end: t.indexOf('80 Raffles Place') + 16, tag: '[ADDRESS-1]' },
  { start: t.indexOf('Margaret Tan'), end: t.indexOf('Margaret Tan') + 12, tag: '[PERSON-2]' },
  { start: t.indexOf('987-65-4321'), end: t.indexOf('987-65-4321') + 11, tag: '[ID-2]' },
];
const masked = maskSpans(t, spans);
assert(!masked.includes('Lim') && !masked.includes('123-45-6789') && masked.includes('[PERSON-1]'), 'csv: all planted PII masked in place');
assert(JSON.stringify(csvShape(masked)) === JSON.stringify(csvShape(t)), `csv: row/column structure IDENTICAL after masking (${JSON.stringify(csvShape(masked))})`);
assert(masked.includes('"[PERSON-1]"'), 'csv: quoting preserved around masked quoted field');

// UTF-16 LE and BE
const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Secret: Hastings Holdings', 'utf16le')]);
assert(readText(le).text === 'Secret: Hastings Holdings' && readText(le).encoding === 'utf-16le', 'utf-16le decoded');
const beBody = Buffer.from('Secret: Hastings Holdings', 'utf16le').swap16();
const be = Buffer.concat([Buffer.from([0xfe, 0xff]), beBody]);
assert(readText(be).text === 'Secret: Hastings Holdings' && readText(be).encoding === 'utf-16be', 'utf-16be decoded');

// plain LF log
const log = readText(Buffer.from('2026-07-19 login jreyes from 10.1.2.3\n', 'utf8'));
assert(!log.bom && log.eol === 'lf', 'log: plain utf-8, LF preserved');

// ---------- format detection by magic bytes ----------
console.log('— format detection (magic bytes, not extension trust) —');
const docx = fs.readFileSync(new URL('./fixture.docx', import.meta.url));
const pdf = fs.readFileSync(new URL('./fixture.pdf', import.meta.url));
const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);

assert(detectFormat(docx, 'contract.docx').route === 'docx-walker', 'docx → docx walker');
assert(detectFormat(pdf, 'filing.pdf').route === 'pdf-walker', 'pdf → pdf walker');
const doc = detectFormat(ole, 'old-memo.doc');
assert(doc.route === 'refuse' && /Save As/.test(doc.reason), `legacy .doc → REFUSED BY CODE with helper ("${doc.reason.slice(0, 45)}…")`);
const msg = detectFormat(ole, 'thread.msg');
assert(msg.route === 'refuse' && /Outlook/.test(msg.reason), 'legacy .msg → refused with Outlook helper');
const xlsx = detectFormat(docx, 'model.xlsx');
assert(xlsx.route === 'refuse' && /CSV/.test(xlsx.reason), 'xlsx (zip family) → refused with Save-As-CSV helper');
assert(detectFormat(csvBuf, 'data.csv').route === 'text', 'csv → text lane');
assert(detectFormat(Buffer.from([0x89, 0x50, 0x00, 0x47]), 'shot.bin').route === 'refuse', 'unknown binary (NUL sniff) → refused');

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL GREEN');
