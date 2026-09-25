import fs from 'node:fs';
import { extractPdf } from './pdf.mjs';

const buf = fs.readFileSync(new URL('./fixture.pdf', import.meta.url));
const res = await extractPdf(buf);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? '  ✔' : '  ✘ FAIL'} ${l}`); if (!c) failures++; };

console.log('— pdf walker —');
const p1 = res.pages[0], p2 = res.pages[1];
assert(p1.status === 'ok' && p1.text.includes('Hastings Holdings'), 'page 1: text extracted');
assert(p1.text.includes('123-45-6789'), 'page 1: planted SSN present in extraction');
assert(p2.status.startsWith('refused'), `page 2: empty page REFUSED (${p2.status})`);
assert(res.complete === false, 'complete:false when any page is refused (fail-loud)');
const author = res.metaFinds.find(m => m.key === 'Author');
assert(author && author.value === 'Janet Kwon', 'metadata author caught (/Info)');
assert(res.warnings.some(w => w.includes('page 2')), 'refusal surfaced as a warning');
console.log('\n' + res.summary);
res.warnings.forEach(w => console.log('  ◆ ' + w));

// true image-only "scan": a page whose text exists only as pixels
console.log('— scan refusal (image-only pdf) —');
const scan = await extractPdf(fs.readFileSync(new URL('./fixture-scan.pdf', import.meta.url)));
const sp = scan.pages[0];
assert(sp.status.includes('image-only'), `image-only page refused with scan diagnosis (${sp.status})`);
assert(!scan.pages.some(p => p.text.includes('123-45-6789')), 'pixel-borne SSN NOT extractable (it is an image) — hence the refusal');
assert(scan.complete === false, 'scan file: complete:false, fail-loud');

// stamped scan: the same image page after CM/ECF put a header stamp and a Bates number on it.
// Measured miss (2026-09-14): 19/19 pages of a scanned complaint passed as "ok" on ~10 stamp words.
console.log('— stamped scan (image page whose only text is the e-filing stamp) —');
const st = await extractPdf(fs.readFileSync(new URL('./fixture-scan-stamped.pdf', import.meta.url)));
const stp = st.pages[0];
assert(stp.status.includes('margin stamp'), `stamped image page refused with the stamp diagnosis (${stp.status})`);
assert(stp.words > 0, `the stamp words were seen (${stp.words}) — the refusal is about WHERE they are, not that there are none`);
assert(!st.pages.some(p => p.text.includes('1:26-cv-00001')), 'the stamp text is not passed on as page content');
assert(st.complete === false, 'stamped scan: complete:false, fail-loud');

// letterhead control: a page that HAS an image (a small logo) over real text must stay ok.
console.log('— letterhead control (small logo over a page of text) —');
const lh = await extractPdf(fs.readFileSync(new URL('./fixture-letterhead.pdf', import.meta.url)));
const lhp = lh.pages[0];
assert(lhp.status === 'ok', `letterhead page still ok (${lhp.status})`);
assert(lhp.text.includes('Hastings') && lhp.text.includes('M-2026-0141'), 'letterhead page text extracted in full');
assert(lh.complete === true, 'letterhead file: complete:true');

if (failures) { console.error(`${failures} FAILURES`); process.exit(1); }
console.log('\nALL GREEN');
