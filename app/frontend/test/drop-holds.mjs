// DROP HOLDS — a file the drop holds says why, in its own row, with the way through.
// Run from app/frontend:   node test/drop-holds.mjs
//
// Follows test/intake-refusal.mjs law 6: the real store.ts is bundled as the app ships it, with
// only pdf.ts's two browser imports (a Vite "?url" worker and the browser build) swapped for
// pdfjs's node build, and handed files through ingestFile, the call Drop makes. Drop.tsx is then
// rendered with react-dom/server over what ingestFile returned, as protected-terms.mjs law 13
// renders Export.tsx. Effects do not run in that render; nothing checked here needs one.
//
// The laws, and what each one costs when it breaks:
//
//   1. A PDF WHOSE EVERY PAGE IS REFUSED IS HELD FOR THE REASONS ITS PAGES GIVE, ALL OF THEM. A
//      page carrying a base64 block, a certificate or an email's headers is named with the block
//      to delete, and one carrying a name written as "%" escapes with the letters to put back —
//      in a PDF held for more than one cause as well as alone; a scan, on any page and with or
//      without an e-filing stamp, is held for OCR;
//      text whose fonts do not decode sends the lawyer to the source; a PDF refused for more
//      than one cause names every page and its way through; a PDF with none of these says so.
//      Cost: "no readable text" over a file that needed one block taken out sent the lawyer to
//      re-OCR it, and History printed the same false reason (wf5 INT-7); a hold naming its
//      first cause alone sent the lawyer round again for the next; and a page of "%" escapes
//      held beside another cause was told to delete a block it does not have.
//
//   2. EVERY HOLD'S REASON IS IN ITS ROW, WHOLE. Cost: a reason of 46 characters or more — and
//      every reason that names a way through is — sat behind "⚠ Held" in a hover title, which
//      never shows on touch and is not an accessible name (wf5 INT-8).
//
//   3. "WHY FILES GET HELD" NAMES ENCODED CONTENT and the way through it.
//      Cost: the one hold the lawyer has no word for is read as the app failing.
//
//   4. A FINISH A LATER CHANGE TOOK OFF SAYS WHY, IN ITS ROW, WHOLE. Cost: the note that names
//      the change, what the copy would now show readable and how to finish again sat in the
//      chip's hover title, which never shows on touch and is not an accessible name; the row
//      said only "Changed since you finished".
//
// Every law is followed by a CONTROL that runs the same check on the code as it was — recreated
// by an edit of the real source at bundle time, never a string typed to fail. Exit 1 on any FAIL.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const dir = mkdtempSync(join(tmpdir(), 'drop-holds-'));
const url = (p) => 'file:///' + p.replace(/\\/g, '/');
let pass = 0, fail = 0;
const check = (ok, what, detail = '') => { console.log((ok ? '  PASS  ' : '  FAIL  ') + what + (detail ? '\n          ' + detail : '')); ok ? pass++ : fail++; };

// store.ts reaches engine.ts, which touches window/localStorage on import (tauri.ts, the settings)
const kv = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (kv.has(k) ? kv.get(k) : null), setItem: (k, v) => kv.set(k, String(v)), removeItem: (k) => kv.delete(k) };

const req = createRequire(join(here, '..', 'package.json'));
const pdfjsUrl = pathToFileURL(req.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;
const workerUrl = pathToFileURL(req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
const fontsDir = join(dirname(req.resolve('pdfjs-dist/package.json')), 'standard_fonts').replace(/\\/g, '/') + '/';
const swap = (c, a, b, file) => { if (!c.includes(a)) throw new Error(`drop-holds: ${file} no longer contains ${JSON.stringify(a.slice(0, 120))} — update this test`); return c.replace(a, () => b); };
const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
/** esbuild plugin: pdf.ts on pdfjs's node build, and `edits` [file suffix, from, to] applied to the real source */
const nodePlugin = (edits = []) => ({ name: 'drop-holds', setup(b) {
  b.onResolve({ filter: /^file:/ }, (a) => ({ path: a.path, external: true }));
  b.onLoad({ filter: /\.(ts|tsx)$/ }, (a) => {
    const mine = edits.filter(([f]) => a.path.replace(/\\/g, '/').endsWith(f));
    const pdf = /extract[\\/]pdf\.ts$/.test(a.path);
    if (!mine.length && !pdf) return undefined;
    let c = lf(a.path);
    if (pdf) {
      c = swap(c, "import * as pdfjs from 'pdfjs-dist';", `import * as pdfjs from ${JSON.stringify(pdfjsUrl)};`, 'pdf.ts');
      c = swap(c, "import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';", `const workerUrl = ${JSON.stringify(workerUrl)};`, 'pdf.ts');
      c = c.replace("standardFontDataUrl: '/pdfjs/standard_fonts/'", () => `standardFontDataUrl: ${JSON.stringify(fontsDir)}`);
    }
    for (const [f, from, to] of mine) c = swap(c, from, to, f);
    return { contents: c, loader: a.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: dirname(a.path) };
  });
} });
const storeBundle = async (name, edits) => {
  const out = join(dir, name + '.mjs');
  await build({ entryPoints: [join(here, '..', 'src', 'lib', 'store.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent', plugins: [nodePlugin(edits)], define: { 'import.meta.env.DEV': 'false' } });
  return import(url(out));
};

// A PDF built by hand. A page is its lines of text, or { scan: true } for a page that is one
// full-page image and no text: the shape a scanner saves; `stamp` adds a line of text in the
// top margin band, as an e-filing system stamps a scan.
const pdfOf = (pages) => {
  const objs = [], font = 3 + pages.length * 2, image = font + 1;
  objs.push('<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  for (const pg of pages) {
    const tj = (l) => `(${l.replace(/[()\\]/g, '\\$&')}) Tj`;
    const content = pg.scan ? 'q 612 0 0 792 0 0 cm /Im1 Do Q' + (pg.stamp ? ` BT /F1 8 Tf 40 780 Td ${tj(pg.stamp)} ET` : '')
      : 'BT /F1 9 Tf 40 760 Td ' + pg.map((l, i) => `${i ? '0 -12 Td ' : ''}${tj(l)}`).join('\n') + ' ET';
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${image} 0 R >> >> /Contents ${objs.length + 2} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  objs.push('<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4 >>\nstream\n\x80\x40\x40\x80\nendstream');
  let s = '%PDF-1.4\n';
  const off = objs.map((o, i) => { const at = s.length; s += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
};
// the attachment test/intake-refusal.mjs uses: a client's name, DOB and NI number, base64 at 76 columns
const SECRET = 'Jane Roe, DOB 01/02/1980, NI QQ123456C, 14 Wisteria Lane, Greendale. Our client instructs us to settle for the sum discussed on the call; please treat this as privileged.';
const B64_LINES = Buffer.from((SECRET + '\n').repeat(3), 'utf8').toString('base64').match(/.{1,76}/g);
const quotesDoc = (r) => /Jane|Roe|QQ123456C|Wisteria|Greendale|SmFu|%4B|Kestrel/.test(r ?? '');
const drop = (S, bytes, name) => S.ingestFile(new File([bytes], name));

// ── LAW 1: a PDF whose every page is refused says why ──
console.log('\n— law 1: a PDF held whole says what its pages say —');
const store = await storeBundle('store');
// store.ts as it was until wf6: the reason read off page 1's status for "image-only" alone
const was = await storeBundle('store-as-it-was', [['lib/store.ts', 'reason: pdfHeldReason(p) };', "reason: p.pages[0]?.status.includes('image-only') ? 'Held — scanned pages need OCR' : 'Held — no readable text' };"]]);
const FILES = {
  exhibit: [pdfOf([['Exhibit C', ...B64_LINES]]), 'exhibit.pdf'],
  scan: [pdfOf([{ scan: true }]), 'scan.pdf'],
  laterScan: [pdfOf([[], { scan: true }]), 'cover-and-scan.pdf'],
  blank: [pdfOf([[]]), 'blank.pdf'],
  letter: [Buffer.from(['Please file the attached.', ...B64_LINES, 'Regards'].join('\r\n'), 'utf8'), 'letter.txt'],
};
const got = {};
for (const [k, [bytes, name]] of Object.entries(FILES)) got[k] = await drop(store, bytes, name);
// Where a page's hold stands, in pdf.ts's words: a line is counted as the page's text is read,
// blank space counting none, and the hold says so. Every PDF held here is held whole, so no
// page's way through ends "to include it" — that is said only beside pages that went through.
const LINE = 'from line \\d+ of the page \\(counting only lines with text on them\\)';
const WAY = new RegExp(`${LINE} — delete that block from the source and export the PDF again$`);
const enc = got.exhibit;
check(enc.state === 'held' && new RegExp(`^Held — page 1 holds encoded content, which this app cannot read, ${LINE}`).test(enc.reason ?? '') && WAY.test(enc.reason) && !/OCR|no readable text/.test(enc.reason) && !quotesDoc(enc.reason),
  'a one-page PDF carrying a base64 block is held naming page 1 and the block, and says the way through; it does not send the lawyer to OCR, and quotes nothing of the document', `state=${enc.state} reason=${enc.reason}`);
const encWas = await drop(was, ...FILES.exhibit);
check(encWas.state === 'held' && !(/^Held — page 1 holds encoded content/.test(encWas.reason ?? '') && WAY.test(encWas.reason)),
  'CONTROL: store.ts as it was holds the same PDF as "no readable text", and the check catches it', encWas.reason);
check(got.scan.state === 'held' && /^Held — scanned pages need OCR\b/.test(got.scan.reason ?? '') && /Run OCR on it .* and drop the copy/.test(got.scan.reason ?? ''),
  'CONTROL: a scanned PDF (one full-page image, no text) is still held for OCR, and says to run OCR and drop the copy', got.scan.reason);
check(got.laterScan.state === 'held' && /^Held — scanned pages need OCR\b/.test(got.laterScan.reason ?? ''),
  'a PDF whose scan is on page 2, behind a blank cover, is held for OCR too', got.laterScan.reason);
const laterWas = await drop(was, ...FILES.laterScan);
check(!/OCR/.test(laterWas.reason ?? ''), 'CONTROL: store.ts as it was read page 1 alone and held it as "no readable text", which the check above would catch', laterWas.reason);
check(got.blank.state === 'held' && /^Held — no readable text: no page of this PDF carries text or a scanned image\b/.test(got.blank.reason ?? '') && /drop that instead/.test(got.blank.reason ?? ''),
  'a PDF with no text and no image says so, and names the way through', got.blank.reason);

// Every refusal a page can give, alone, behind a blank cover, and together. Held by its first
// cause alone, an exhibit with a base64 block on page 1 and a scan on page 2 named the block
// only: the lawyer deleted it and dropped the file again, to be held a second time or let
// through with page 2 cut from the text, for a cause the first hold never mentioned
// (2026-09-24). Each hold here names every page, its cause and its way through.
const B64_PEM = Buffer.from((SECRET + '\n').repeat(3), 'utf8').toString('base64').match(/.{1,64}/g);
const EMAIL = ['Printed from Outlook', 'Received: from mail.example.com (mail.example.com [192.0.2.1]) by mx.example.org with ESMTPS id 4Xyz12; Mon, 3 Jun 2024 10:00:00 +0000', 'From: Jane Roe <jane.roe@example.com>', 'To: Counsel <counsel@example.org>', 'Subject: Settlement', 'Date: Mon, 3 Jun 2024 10:00:00 +0000', 'Message-ID: <abc123@example.com>', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', 'Please settle for the sum discussed.'];
const PEM = ['Exhibit D', '-----BEGIN CERTIFICATE-----', ...B64_PEM.slice(0, 4), '-----END CERTIFICATE-----'];
const GARBLED = ['\x01\x02\x03\x04\x05\x06\x07\x08 \x0e\x0f\x10\x11\x12\x13 abc', '\x14\x15\x16\x17\x18\x19 \x1a\x1b\x1c\x1d\x1e\x1f'];
const B64P = ['Exhibit C', ...B64_LINES];
const EFILED = { scan: true, stamp: 'Case 1:23-cv-01234 Document 12 Filed 06/03/24' };
const SCAN = { scan: true };
const ENC = (n) => `page ${n} holds encoded content, which this app cannot read, ${LINE}`;
// a name written as "%" escapes: its way through is to put the letters back, not to delete a
// block, which the page does not have
const PCT = ['Receipt', 'Paid to %4B%65%73%74%72%65%6C Holdings on 3 June.'];
const PCTH = (n) => `page ${n} holds encoded content \\(letters written as “%” and two hex digits\\), which this app cannot read, ${LINE}`;
const PCT_WAY = 'replace those letters in the source with the letters they stand for, or delete them, and export the PDF again';
const LINK = ['MEMORANDUM', 'To stop receiving these, click', 'https://news.lawfirm.example/unsubscribe?e=amFuZS5yb2VAY2xpZW50Y28uY29t', 'Thank you.'];
const LINKH = (n) => `page ${n} holds encoded content inside a link, which this app cannot read, ${LINE}`;
const LINK_WAY = 'delete the link in the source, or replace it with the words it shows, and export the PDF again';
// a name in quoted-printable, and a name as an encoded email header word: printed from a mail
// program's source view, their way through is the mail program, not a block to delete
const QP = ['Correspondence', 'Dear Ren=C3=A9e, thank you for the draft.'];
const QPH = (n) => `page ${n} holds encoded content \\(quoted-printable email encoding, which splits words with “=”\\), which this app cannot read, ${LINE}`;
const HDR = ['Correspondence', 'Name as sent: =?utf-8?B?UmVuw6ll?= of counsel.'];
const HDRH = (n) => `page ${n} holds encoded content \\(email header text written as =\\?utf-8\\?…\\?=\\), which this app cannot read, ${LINE}`;
const MAIL_WAY = 'open the message in your mail program and print it to PDF again from there';
const re = (s) => (r) => new RegExp(s).test(r);
const PDF_CASES = [
  ['email', 'a printed email\'s headers', [EMAIL], re(`^Held — page 1 holds an email’s headers \\(a printed message source\\) ${LINE} — delete that block from the source and export the PDF again$`)],
  ['pem', 'a certificate block', [PEM], re(`^Held — page 1 holds an encoded certificate or key block, which this app cannot read, ${LINE} — delete that block from the source and export the PDF again$`)],
  ['garbled', 'text whose fonts do not decode', [GARBLED], re('^Held — the text in this PDF does not decode: its fonts map to the wrong characters\\. Drop the document it was made from \\(the \\.docx or the text\\) instead\\.$')],
  ['efiled', 'a scan with an e-filing stamp in its margin', [EFILED], re('^Held — scanned pages need OCR\\b')],
  ['coverEnc', 'a base64 block behind a blank cover', [[], B64P], re(`^Held — ${ENC(2)} — delete that block from the source and export the PDF again$`)],
  ['coverEmail', 'an email\'s headers behind a blank cover', [[], EMAIL], re(`^Held — page 2 holds an email’s headers \\(a printed message source\\) ${LINE} — delete that block`)],
  ['pct', 'a name written as "%" escapes', [PCT], re(`^Held — ${PCTH(1)} — ${PCT_WAY}$`)],
  ['pctScan', 'a name written as "%" escapes on page 1 and a scan on page 2', [PCT, SCAN], re(`^Held — no page of this PDF can be read yet: ${PCTH(1)} — ${PCT_WAY}; page 2 is a scan with no text layer — run OCR on it \\(in Acrobat, Scan & OCR\\)\\. Then drop the copy that saves\\.$`)],
  ['encPct', 'a base64 block on page 1 and a name written as "%" escapes on page 2', [B64P, PCT], re(`^Held — no page of this PDF can be read yet: ${ENC(1)} — delete that block from the source and export the PDF again; ${PCTH(2)} — ${PCT_WAY}\\. Then drop the copy that saves\\.$`)],
  ['encScan', 'a base64 block on page 1 and a scan on page 2', [B64P, SCAN], re(`^Held — no page of this PDF can be read yet: ${ENC(1)} — delete that block from the source and export the PDF again; page 2 is a scan with no text layer — run OCR on it \\(in Acrobat, Scan & OCR\\)\\. Then drop the copy that saves\\.$`)],
  ['scanEnc', 'a scan on page 1 and a base64 block on page 2', [SCAN, B64P], re(`^Held — no page of this PDF can be read yet: ${ENC(2)} — delete that block from the source and export the PDF again; page 1 is a scan with no text layer — run OCR on it \\(in Acrobat, Scan & OCR\\)\\. Then drop the copy that saves\\.$`)],
  ['encBlankEnc', 'base64 blocks on pages 1 and 3, page 2 blank', [B64P, [], B64P], (r) => re(`^Held — no page of this PDF can be read yet: ${ENC(1)}; ${ENC(3)} — delete those blocks from the source and export the PDF again\\. Then drop the copy that saves\\.$`)(r) && !/page 2/.test(r)],
  ['scanEncScan', 'scans on pages 1 and 3 around a base64 block', [SCAN, B64P, EFILED], re(`^Held — no page of this PDF can be read yet: ${ENC(2)} — delete that block from the source and export the PDF again; pages 1 and 3 are scans with no text layer — run OCR on them \\(in Acrobat, Scan & OCR\\)\\. Then drop the copy that saves\\.$`)],
  // a link whose value is encoded: its way through is to delete the link or write out the words
  // it shows, and "delete that block" beside a scan sent the lawyer looking for a block the page
  // does not have (P2T7-4)
  ['link', 'a link carrying an encoded address', [LINK], re(`^Held — ${LINKH(1)} — ${LINK_WAY}$`)],
  ['qp', 'a name written in quoted-printable', [QP], re(`^Held — ${QPH(1)} — ${MAIL_WAY}$`)],
  ['header', 'a name written as an encoded email header word', [HDR], re(`^Held — ${HDRH(1)} — ${MAIL_WAY}$`)],
  ['linkScan', 'a link carrying an encoded address on page 1 and a scan on page 2', [LINK, SCAN], re(`^Held — no page of this PDF can be read yet: ${LINKH(1)} — ${LINK_WAY}; page 2 is a scan with no text layer — run OCR on it \\(in Acrobat, Scan & OCR\\)\\. Then drop the copy that saves\\.$`)],
  ['garbledEmail', 'text that does not decode on page 1 and an email\'s headers on page 2', [GARBLED, EMAIL], re(`^Held — no page of this PDF can be read yet: page 2 holds an email’s headers \\(a printed message source\\) ${LINE} — delete that block from the source and export the PDF again; the text on page 1 does not decode: its fonts map to the wrong characters — drop the document it was made from \\(the \\.docx or the text\\) instead\\.$`)],
];
const pdfHolds = async (S) => {
  const r = {};
  for (const [k, , pages] of PDF_CASES) r[k] = await drop(S, pdfOf(pages), `${k}.pdf`);
  return r;
};
const heldAs = (f, test) => f.state === 'held' && test(f.reason ?? '') && !quotesDoc(f.reason);
const wrongIn = (got) => PDF_CASES.filter(([k, , , test]) => !heldAs(got[k], test)).map(([k]) => k);
const live = await pdfHolds(store);
check(wrongIn(live).length === 0, `each PDF is held naming every page, its cause and its way through, and quotes nothing of the document: ${PDF_CASES.map((c) => c[1]).join('; ')}`,
  PDF_CASES.map(([k]) => `${k}: ${live[k].state} · ${live[k].reason}`).join('\n          '));
// store.ts as it was before 2026-09-24 (the first cause alone, read off the first encoded page),
// and one rule at a time taken out of it now — each recreated by an edit of the real source
const src = lf(join(here, '..', 'src', 'lib', 'store.ts'));
const fnAt = src.indexOf('function pdfHeldReason(p: PdfResult): string {\n');
const fnNow = src.slice(fnAt, src.indexOf('\n}\n', fnAt) + 2);
const FIRST_CAUSE = `function pdfHeldReason(p: PdfResult): string {
  const enc = p.pages.find((x) => /^refused: (?:an email’s headers|an encoded certificate|encoded content)/.test(x.status));
  if (enc) return \`Held — page \${enc.page} holds \${enc.status.replace(/^refused: /, '').replace(' — the page is left out; ', ' — ')}\`;
  if (p.pages.some((x) => /image-only|a scan with an e-filing stamp/.test(x.status))) return 'Held — scanned pages need OCR: this app reads the text a PDF carries, and a scan carries none. Run OCR on it (in Acrobat, Scan & OCR) and drop the copy that saves.';
  if (p.pages.some((x) => /garbled extraction/.test(x.status))) return 'Held — the text in this PDF does not decode: its fonts map to the wrong characters. Drop the document it was made from (the .docx or the text) instead.';
  return 'Held — no readable text: no page of this PDF carries text or a scanned image. If the document it was made from has words in it, drop that instead.';
}`;
const HOLD_CONTROLS = [
  ['the first cause alone, as it was', [[fnNow, FIRST_CAUSE]], ['encScan', 'scanEnc', 'encBlankEnc', 'scanEncScan', 'garbledEmail']],
  ['an email\'s headers not named', [['/^refused: (?:an email’s headers|an encoded certificate|encoded content)/', '/^refused: (?:an encoded certificate|encoded content)/']], ['email', 'coverEmail', 'garbledEmail']],
  ['a certificate block not named', [['/^refused: (?:an email’s headers|an encoded certificate|encoded content)/', '/^refused: (?:an email’s headers|encoded content)/']], ['pem']],
  ['text that does not decode not named', [['const garbled = p.pages.filter((x) => /garbled extraction/.test(x.status));', 'const garbled: typeof p.pages = [];']], ['garbled', 'garbledEmail']],
  ['a scan with an e-filing stamp not read as a scan', [['/image-only|a scan with an e-filing stamp/', '/image-only/']], ['efiled', 'scanEncScan']],
  ['page 1 alone read for a block', [['const enc = p.pages.filter(', 'const enc = p.pages.slice(0, 1).filter(']], ['coverEnc', 'coverEmail', 'scanEnc', 'encBlankEnc', 'scanEncScan']],
  ['the page\'s own refusal passed through as the way through', [[".replace(' — the page is left out; ', ' — ')", '']], ['email', 'pem', 'coverEnc', 'coverEmail', 'pct', 'link']],
  ['every encoded page told to delete a block, as it was', [['const blocks = enc.filter((x) => wayOf(x) === BLOCK_WAY);', 'const blocks = enc;'], ['const own = enc.filter((x) => wayOf(x) !== BLOCK_WAY).map((x) => `${says(x)} — ${wayOf(x)}`);', 'const own: string[] = [];']], ['pctScan', 'encPct', 'linkScan']],
];
let hc = 0;
for (const [what, pairs, must] of HOLD_CONTROLS) {
  const S = await storeBundle(`store-hold-${hc++}`, pairs.map(([a, b]) => ['lib/store.ts', a, b]));
  const wrong = wrongIn(await pdfHolds(S));
  const missed = must.filter((k) => !wrong.includes(k));
  check(missed.length === 0, `CONTROL: ${what} is caught`, `caught by: ${wrong.join(', ') || 'nothing'}${missed.length ? ` · NOT caught by: ${missed.join(', ')}` : ''}`);
}
{
  // pdf.ts pageHold without its two mail branches: both pages told to delete a block they do not have
  const S = await storeBundle('store-hold-mail', [['lib/extract/pdf.ts', "  if (hold.kind === 'qp') return", '  if (false) return'], ['lib/extract/pdf.ts', "  if (hold.kind === 'header') return", '  if (false) return']]);
  const wrong = wrongIn(await pdfHolds(S));
  check(['qp', 'header'].every((k) => wrong.includes(k)), 'CONTROL: a quoted-printable page and an encoded header word, their own ways taken out of pdf.ts, are caught', `caught by: ${wrong.join(', ') || 'nothing'}`);
}

// ── LAW 2: the reason is in the row ──
console.log('\n— law 2: every hold says why, in its own row —');
const dropScreen = JSON.stringify(join(here, '..', 'src', 'screens', 'Drop.tsx').replace(/\\/g, '/'));
const renderer = async (name, edits) => {
  const out = join(dir, name + '.mjs');
  await build({
    stdin: { contents: `export { default as Drop } from ${dropScreen};\nexport { renderToString } from 'react-dom/server';\nexport { createElement } from 'react';`, resolveDir: join(here, '..'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [nodePlugin(edits)], outfile: out, logLevel: 'silent', define: { 'import.meta.env.DEV': 'false' },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const R = await import(url(out));
  const noop = () => {};
  return (files) => R.renderToString(R.createElement(R.Drop, { files, onDropFiles: noop, onBrowse: noop, onSample: noop, onReview: noop, onRemove: noop, onExport: noop, onShowNetlog: noop, net: { observing: false, offAny: false } })).replace(/<!-- -->/g, '');
};
const decode = (s) => s.replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** each queue row: its opening tag and the words it shows (attributes, titles included, are not words) */
const rows = (html) => html.split('<details')[0].split('<div class="q-row"').slice(1).map((r) => ({ tag: r.slice(0, r.indexOf('>')), text: decode(r.slice(r.indexOf('>') + 1).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim() }));
const unreadable = { ...(await drop(store, Buffer.from('%PDF-1.4\nnot a pdf at all\n%%EOF\n', 'latin1'), 'broken.pdf')) };
const HELD = [enc, got.scan, got.blank, got.letter, unreadable];
check(HELD.every((f) => (f.state === 'held' || f.state === 'error') && (f.reason ?? '').length >= 46) && /^Couldn’t read this file \(.+\)\. Open it in the program that made it, save a new copy and drop that\.$/.test(unreadable.reason ?? ''),
  `the five files the rows below show are held or unreadable, each with a reason of 46 characters or more (${HELD.map((f) => f.name).join(', ')}); a file that cannot be opened at all says so and names the way through`, HELD.map((f) => `${f.name}: ${f.state} · ${(f.reason ?? '').length} chars`).join(' · '));
const whole = (render) => {
  const rs = rows(render(HELD));
  return rs.length === HELD.length && HELD.every((f, i) => rs[i].text.includes(f.reason.replace(/^Held — /, '')) && /height:auto/.test(rs[i].tag) && /flex-wrap:wrap/.test(rs[i].tag));
};
const drops = await renderer('drop');
check(whole(drops), 'every held row shows its whole reason as words in the row, and the row grows to hold it (height:auto, wrapping)',
  rows(drops([enc]))[0]?.text);
const asItWas = await renderer('drop-as-it-was', [
  ['screens/Drop.tsx', "{(f.state === 'held' || f.state === 'error') && <span className=\"heldlbl\">⚠ Held</span>}",
    "{(f.state === 'held' || f.state === 'error') && (<span className=\"heldlbl\" title={f.reason}>⚠ {f.reason && f.reason.length < 46 ? f.reason : 'Held'}</span>)}"],
  ['screens/Drop.tsx', "{(f.state === 'held' || f.state === 'error') && f.reason && <div className=\"heldwhy\" style={HELD_WHY}>{f.reason.replace(/^Held — /, '')}</div>}", ''],
]);
check(!whole(asItWas), 'CONTROL: Drop.tsx as it was (the reason in a title behind "⚠ Held" unless under 46 characters) is caught', rows(asItWas([enc]))[0]?.text);
const unstyled = await renderer('drop-unstyled', [['screens/Drop.tsx', "((f.state === 'held' || f.state === 'error') && f.reason) || ", '']]);
check(!whole(unstyled), 'CONTROL: a held row left at the queue\'s fixed height, where a two-line reason runs into the row below, is caught');
// a row that is not held gains nothing
const queued = await drop(store, Buffer.from('MEMORANDUM\r\nThe client instructs us to settle.', 'utf8'), 'memo.txt');
const qr = rows(drops([queued]))[0];
check(queued.state === 'queued' && !!qr && !/height:auto/.test(qr.tag) && !/Held/.test(qr.text), 'CONTROL: a queued row keeps the queue\'s own height and says nothing of a hold', `${queued.state} · ${qr?.text}`);

// ── LAW 3: "Why files get held" names encoded content ──
console.log('\n— law 3: the explainer names every kind of hold —');
const WHY_ENC = /A file carrying encoded content — an email attachment pasted in as a block of base64, a certificate or key, a saved email's headers — is held too: a model can decode what this app cannot read, so it cannot mask what is inside\. The hold names the line or page; save an attachment as its own file and drop that, or delete the block and drop the file again\./;
const why = (render) => decode((render([queued]).match(/<details class="why">([\s\S]*?)<\/details>/)?.[1] ?? '').replace(/<[^>]*>/g, ''));
check(WHY_ENC.test(why(drops)), '"Why files get held" says encoded content is held, why, and the two ways through', why(drops).slice(0, 140));
const noEnc = await renderer('drop-why-as-it-was', [['screens/Drop.tsx', " A file carrying encoded content — an email attachment pasted in as a block of base64, a certificate or key, a saved email's headers — is held too: a model can decode what this app cannot read, so it cannot mask what is inside. The hold names the line or page; save an attachment as its own file and drop that, or delete the block and drop the file again.", '']]);
check(!WHY_ENC.test(why(noEnc)), 'CONTROL: the explainer as it was, with no word of encoded content, is caught');

// ── LAW 4: a finish a later change took off says why, in its row ──
console.log('\n— law 4: a finish taken off says why, in its own row —');
{
  // the real finish and recheck (lib/attest.ts) over a file the real intake read, as App.tsx
  // runs them: finished, then a row switched off after the finish
  const outA = join(dir, 'attest.mjs');
  await build({ stdin: { contents: `export { finishFile, recheckFinish } from ${JSON.stringify(join(here, '..', 'src', 'lib', 'attest.ts').replace(/\\/g, '/'))};\nexport { decideRows } from ${JSON.stringify(join(here, '..', 'src', 'lib', 'review.ts').replace(/\\/g, '/'))};`, resolveDir: join(here, '..'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile: outA, logLevel: 'silent', plugins: [nodePlugin()], define: { 'import.meta.env.DEV': 'false' } });
  const A = await import(url(outA));
  const memo = await drop(store, Buffer.from('MEMORANDUM\r\nJane Roe instructs us to settle.', 'utf8'), 'memo.txt');
  const ready = { ...memo, state: 'ready', statusLabel: '1 entity', entities: [{ key: 'r1', text: 'Jane Roe', tag: '[Person1]', cat: 'person', prov: 'engine', occ: 1, status: 'confirmed' }] };
  const finished = A.finishFile(ready, 'us', []);
  const changed = A.recheckFinish(finished, { ...finished, entities: A.decideRows(finished.entities, ['r1'], { dead: true, status: 'ignored' }) }, 'us', [], 'A change made after you finished');
  check(finished.reviewed === true && changed.reviewed === false && (changed.reopened ?? '').length >= 46,
    'the file is finished, and switching its one row off after the finish takes the finish off with a note', changed.reopened);
  const noteShown = (render) => {
    const r = rows(render([changed]))[0];
    return !!r && /Changed since you finished/.test(r.text) && r.text.includes(changed.reopened) && /height:auto/.test(r.tag) && /flex-wrap:wrap/.test(r.tag);
  };
  check(noteShown(drops), 'the row of a file whose finish came off says so and shows the whole note as words, and grows to hold it', rows(drops([changed]))[0]?.text);
  const titleOnly = await renderer('drop-reopened-as-it-was', [
    ['screens/Drop.tsx', "borderColor: 'var(--amber)' }}>Changed since you finished</span>}", "borderColor: 'var(--amber)' }} title={f.reopened}>Changed since you finished</span>}"],
    ['screens/Drop.tsx', "{f.state === 'ready' && !f.reviewed && f.reopened && <div className=\"heldwhy\" style={HELD_WHY}>{f.reopened}</div>}", ''],
    ['screens/Drop.tsx', " || (f.state === 'ready' && !f.reviewed && f.reopened) ? HELD_ROW", ' ? HELD_ROW'],
  ]);
  check(!noteShown(titleOnly), 'CONTROL: Drop.tsx as it was (the note in the chip\'s hover title only) is caught', rows(titleOnly([changed]))[0]?.text);
  const fixedHeight = await renderer('drop-reopened-unstyled', [['screens/Drop.tsx', " || (f.state === 'ready' && !f.reviewed && f.reopened) ? HELD_ROW", ' ? HELD_ROW']]);
  check(!noteShown(fixedHeight), 'CONTROL: the note left in a row of the queue\'s fixed height, where it runs into the row below, is caught');
  const fr = rows(drops([finished]))[0];
  check(!!fr && /Reviewed ✓/.test(fr.text) && !/Changed since you finished/.test(fr.text) && !/height:auto/.test(fr.tag), 'CONTROL: a finished file\'s row says it is finished and carries no note', fr?.text);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
