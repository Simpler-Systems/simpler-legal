// Run the docx forensic walker against a real file: node run.mjs <path.docx>
import fs from 'node:fs';
import { extractDocx } from './docx.mjs';

const path = process.argv[2];
if (!path) { console.error('usage: node run.mjs <file.docx>'); process.exit(2); }
const buf = fs.readFileSync(path);

let res;
try { res = extractDocx(buf); }
catch (e) { console.error(`EXTRACTION REFUSED (fail-loud): ${e.message}`); process.exit(1); }

const inv = res.inventory;
console.log(`file: ${path} · ${buf.length.toLocaleString()} bytes`);
console.log(`parts: ${inv.scanned.length} scanned · ${inv.structural.length} structural · ${inv.binaryFlagged.length} binary-flagged · ${inv.unrecognized.length} UNRECOGNIZED`);
console.log(`complete: ${res.complete}`);
if (inv.unrecognized.length) { console.log('unrecognized parts (fail-loud):'); inv.unrecognized.forEach(p => console.log('  ✘ ' + p)); }
if (inv.binaryFlagged.length) console.log(`binary-flagged (present, not scanned): ${inv.binaryFlagged.slice(0, 5).join(', ')}${inv.binaryFlagged.length > 5 ? ` … +${inv.binaryFlagged.length - 5} more` : ''}`);

const byKind = {};
for (const i of res.items) byKind[i.kind || 'body'] = (byKind[i.kind || 'body'] || 0) + 1;
console.log('items by kind:', JSON.stringify(byKind));

const interesting = res.items.filter(i => i.rev || ['comment', 'alt-text'].includes(i.kind) || i.hidden);
console.log(`\ninteresting finds (tracked changes/hidden/comments/alt-text): ${interesting.length}`);
interesting.slice(0, 10).forEach(i => console.log(`  [${i.kind}${i.rev ? '·' + i.rev : ''}${i.hidden ? '·hidden' : ''}${i.author ? '·' + i.author : ''}] ${i.text.slice(0, 90)}`));

const props = res.items.filter(i => i.part && i.part.startsWith('docProps/'));
console.log(`\ndocument properties extracted: ${props.length}`);
props.slice(0, 8).forEach(i => console.log(`  [${i.part}] ${i.text.slice(0, 80)}`));

const wordCount = res.items.map(i => i.text).join(' ').split(/\s+/).length;
console.log(`\ntotal extracted: ${res.items.length} items · ~${wordCount.toLocaleString()} words`);
console.log('sample body text:');
res.items.filter(i => i.kind === 'body').slice(0, 4).forEach(i => console.log('  · ' + i.text.slice(0, 100)));
