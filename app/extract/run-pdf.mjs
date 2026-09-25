// Run the PDF walker against a real file: node run-pdf.mjs <path.pdf>
import fs from 'node:fs';
import { extractPdf } from './pdf.mjs';

const p = process.argv[2];
const buf = fs.readFileSync(p);
const res = await extractPdf(buf).catch(e => { console.error('EXTRACTION REFUSED (fail-loud): ' + e.message); process.exit(1); });

console.log(`file: ${p} · ${buf.length.toLocaleString()} bytes`);
console.log(res.summary + ` · complete: ${res.complete}`);
if (res.metaFinds.length) { console.log('metadata:'); res.metaFinds.forEach(m => console.log(`  [${m.key}] ${m.value.slice(0, 80)}`)); }
if (res.annotations.length) { console.log(`annotations: ${res.annotations.length}`); res.annotations.slice(0, 5).forEach(a => console.log(`  p${a.page} ${a.subtype}${a.field ? ' · ' + a.field : ''}${a.value ? ' · ' + String(a.value).slice(0, 50) : ''}`)); }
res.warnings.forEach(w => console.log('  ◆ ' + w));
const ok = res.pages.filter(x => x.status === 'ok');
if (ok.length) {
  console.log(`sample text (page ${ok[0].page}):`);
  console.log('  ' + ok[0].text.split('\n').slice(0, 4).join('\n  ').slice(0, 300));
}
console.log('per-page:', res.pages.map(x => `p${x.page}:${x.status === 'ok' ? x.words + 'w' : 'REFUSED'}`).join(' '));
