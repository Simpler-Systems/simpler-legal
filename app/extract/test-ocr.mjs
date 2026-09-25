// Can a fully local OCR pass recover the pixel-borne PII the pdf walker refused?
import fs from 'node:fs';
import { ocrImage } from './ocr.mjs';

const jpg = fs.readFileSync(new URL('./fixture-scan.jpg', import.meta.url));
console.log('running local OCR on fixture-scan.jpg (the page the walker refused)…');
const res = await ocrImage(jpg);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? '  ✔' : '  ✘ FAIL'} ${l}`); if (!c) failures++; };

assert(res.text.includes('123-45-6789'), 'pixel-borne SSN RECOVERED by local OCR');
assert(/Lim\s+Wei\s+Sheng/.test(res.text), 'pixel-borne name recovered');
assert(res.confidence > 0, `page confidence reported (${res.confidence}%)`);
console.log(`  words: ${res.words} · low-confidence words: ${res.lowConfidence.length}${res.lowConfidence.length ? ' → ' + res.lowConfidence.slice(0, 5).join(', ') : ''}`);
console.log(`  flag carried: "${res.flag.slice(0, 60)}…"`);
console.log('\nrecovered text:\n' + res.text.split('\n').filter(l => l.trim()).map(l => '  | ' + l).join('\n'));

if (failures) { console.error(`${failures} FAILURES`); process.exit(1); }
console.log('\nALL GREEN — the scan wall is passable, locally.');
