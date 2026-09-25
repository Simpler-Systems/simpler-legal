#!/usr/bin/env node
// SITE CLAIMS — the sentences on the public site that the laws below name are held to the code
// that does what they say.
//
// What it does not do. A sentence with no law here is not checked. A law drives the cases it
// names; it shows each stated case still behaves as stated, and that the page does not state a
// narrower class than a driven case shows, but it cannot show that the stated class is the whole
// of what ships: a case nobody wrote down is not driven. Round 5 found three sentences that
// passed every law and were false (the percent-escape class stated as spaces only, "the receipt
// states the same limits in full", the count of http:// strings), and each now has a law.
//
//   node tools/site-claims.mjs
//
// Why this is a gate. In round 4 the FAQ drifted from the .docx writer in nine places with every
// other gate green, because nothing read site/: the pages said a case shipped after it had been
// closed, and said nothing of cases still open. A hand-run check in a scratch folder caught it
// once and then could not catch it again. This file is that check, carried into the tree.
//
// What a law is. Each law pairs a sentence (or a sentence that must be absent) on site/index.html,
// site/it.html or site/research.html with the code fact behind it, and the fact is computed from
// the code as it stands, never from git HEAD or a saved copy of the page:
//   · the .docx cases are written through the REAL engine (exportPlan's .docx mask), walker and
//     writer, bundled from app/frontend/src, and the output is read byte by byte;
//   · the text-export cases go through exportPlan, the intake cases through detectFormat;
//   · the rest read the source, FREEZE.md or a committed board.
// A blind spot is a two-way law: the page names it exactly when the writer still ships it, so a
// fix in the writer turns this red until the sentence comes off ("closed in code"), and a
// sentence dropped while the case still ships turns it red too.
//
// CONTROLS. Every law carries at least one control: the page as it stands with the sentence
// dropped, or with an earlier, now false, sentence put back. Each control must make its law
// fail; a control that passes means the law has no teeth, and that fails the run. The harness
// itself has a control: each driven case that ships has a partner that must mask or hold, so a
// harness that cannot tell a ship from a hold fails here rather than passing every law.
//
// Bundles go to a fresh folder under the OS temp directory and are deleted on exit. Exit 0 when
// every law passes and every control fails; 1 otherwise; 2 when esbuild is not installed.
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'app', 'frontend', 'src');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
let esbuild;
try {
  esbuild = await import(pathToFileURL(createRequire(join(ROOT, 'app', 'frontend', 'package.json')).resolve('esbuild')).href);
} catch {
  console.error('site-claims: esbuild is not installed under app/frontend; run `npm run setup`');
  process.exit(2);
}
const build = esbuild.build ?? esbuild.default.build;
const DIR = mkdtempSync(join(tmpdir(), 'site-claims-'));

let code = 1;
try {
  code = await main();
} catch (e) {
  console.error(`site-claims: ${e.stack ?? e}`);
  code = 1;
} finally {
  rmSync(DIR, { recursive: true, force: true });
}
process.exit(code);

// ---------------------------------------------------------------------------------------------
async function main() {
  // the app's modules read window and localStorage at import
  const store = new Map();
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  let n = 0;
  const bundle = async (...entry) => {
    const outfile = join(DIR, `b${n++}.mjs`);
    await build({ entryPoints: [join(SRC, ...entry)], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
    return import(pathToFileURL(outfile).href);
  };
  const E = await bundle('lib', 'engine.ts');
  const D = await bundle('lib', 'extract', 'docx.ts');
  const W = await bundle('lib', 'extract', 'docxWrite.ts');
  const T = await bundle('lib', 'extract', 'detect.ts');

  // ---- building .docx packages -------------------------------------------------------------
  const enc = (x) => new TextEncoder().encode(x);
  const dec = (u) => new TextDecoder().decode(u);
  const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const NS = [
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"', 'xmlns:o="urn:schemas-microsoft-com:office:office"',
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"', 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
    'xmlns:v="urn:schemas-microsoft-com:vml"', 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"', 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"', 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"',
    'mc:Ignorable="w14"',
  ].join(' ');
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
  const CT = { header: `${WML}.header+xml`, footer: `${WML}.footer+xml`, footnotes: `${WML}.footnotes+xml`, endnotes: `${WML}.endnotes+xml`, chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml' };
  const OPENING = 'Margaret Tan signed the heads of terms for Kestrel.';
  async function docx({ body = '', header, footer, parts = [], sect = '', raw = false }) {
    const over = [], rels = [], files = [];
    if (header != null) { parts = [{ name: 'word/header1.xml', xml: `<w:hdr ${NS}>${header}</w:hdr>`, type: CT.header, rel: ['header', 'header1.xml', 'rIdH'] }, ...parts]; sect += '<w:headerReference w:type="default" r:id="rIdH"/>'; }
    if (footer != null) { parts = [{ name: 'word/footer1.xml', xml: `<w:ftr ${NS}>${footer}</w:ftr>`, type: CT.footer, rel: ['footer', 'footer1.xml', 'rIdF'] }, ...parts]; sect += '<w:footerReference w:type="default" r:id="rIdF"/>'; }
    let k = 0;
    for (const p of parts) {
      if (p.type) over.push(`<Override PartName="/${p.name}" ContentType="${p.type}"/>`);
      if (p.rel) rels.push(`<Relationship Id="${p.rel[2] ?? `rIdP${k++}`}" Type="${p.rel[0].includes('/') ? p.rel[0] : `${REL}/${p.rel[0]}`}" Target="${p.rel[1]}"/>`);
      files.push({ name: p.name, data: p.data ?? enc(decl + p.xml) });
    }
    return W.writeZip([
      { name: '[Content_Types].xml', data: enc(`${decl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${WML}.document.main+xml"/>${over.join('')}</Types>`) },
      { name: '_rels/.rels', data: enc(`${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`) },
      { name: 'word/_rels/document.xml.rels', data: enc(`${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`) },
      { name: 'word/document.xml', data: enc(`${decl}<w:document ${NS}><w:body>${raw ? '' : para(OPENING)}${body}<w:sectPr>${sect}<w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`) },
      ...files,
    ]);
  }
  const run = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const para = (t) => `<w:p>${run(t)}</w:p>`;
  const mr = (t) => `<m:r><m:t xml:space="preserve">${t}</m:t></m:r>`;
  const eq = (inner) => `<w:p>${run('The payment is ')}<m:oMath>${inner}</m:oMath>${run('.')}</w:p>`;
  const notesPart = (root, item, t) => `<w:${root} ${NS}><w:${item} w:id="1">${para(t)}</w:${item}></w:${root}>`;
  const unk = (inner, name = 'word/unheardOf.xml') => ({ name, xml: `<acme:notes xmlns:acme="urn:acme:notes" ${NS}>${inner}</acme:notes>`, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', name.replace(/^word\//, '')] });
  const chartBody = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="5486400" cy="3200400"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const chart = (fmt) => docx({ body: chartBody, parts: [{ name: 'word/charts/chart1.xml', xml: `<c:chartSpace ${NS}><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>${fmt}</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4.5</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>`, type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] }] });

  // ---- writing and reading them ------------------------------------------------------------
  const row = (key, text, tag, cls, cat) => ({ key, text, tag, cat, cls, prov: 'both passes', occ: 1, status: 'confirmed', src: 'span' });
  const ROWS = [row('p', 'Margaret Tan', '[Person1]', 'PERSON', 'person')];
  const TERMS = ['Kestrel', 'Harrow Leung'];
  const one = (text) => [row('p', text, '[Person1]', 'PERSON', 'person')];
  const compact = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  /** 'held' | 'ships' | 'masked', and what the body says. `needle`: a string the output must
   *  carry for the case to ship; `word`: the same, compacted and with markup gone (a name split
   *  across an equation's runs). */
  async function out(pkg, { needle, word, rows = ROWS, terms = TERMS, practice = 'us', side } = {}) {
    // `side`: the engine's separate read of the text outside the body (lib/side.ts), as store.ts
    // attaches it to the file; left out, the file carries none, as a file dropped before ruling 27
    const plan = E.exportPlan({ text: '', entities: rows, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg, side }, terms, practice);
    const report = await W.writeRedactedDocx(pkg, { mask: plan.docx.mask });
    if (report.held || !report.bytes) return { how: 'held', report, why: report.held ?? '' };
    const zip = await D.readZip(report.bytes);
    const raw = {};
    for (const nm of zip.names) raw[nm] = dec(await zip.read(nm));
    const body = [...(raw['word/document.xml'] ?? '').matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    const carried = Object.values(raw).some((s) => (needle && s.includes(needle)) || (word && compact(s.replace(/<[^>]*>/g, '')).includes(word)));
    const passed = report.gate.leaks.length === 0;
    return { how: carried && passed ? 'ships' : carried ? 'leak-reported' : 'masked', report, raw, body };
  }
  const txt = (text, rows = ROWS, terms = [], practice = 'us') => {
    const p = E.exportPlan({ text, entities: rows, reviewed: true, engineComplete: true, kind: 'text' }, terms, practice);
    return { red: p.red, verified: p.verified, blocked: p.blocked };
  };

  // ---- the cases -----------------------------------------------------------------------------
  const C = {};
  const pairs = []; // [case that ships, partner that must not]
  const put = async (k, pkg, o) => { C[k] = await out(await pkg, o); };
  const withAttr = (attr, t = 'Recitals') => `<w:p xmlns:acme="urn:acme" ${attr}>${run(t)}</w:p>`;
  const shape = (attr) => `<w:p><w:r><w:pict><v:shape id="s1" ${attr} style="width:10pt;height:10pt"/></w:pict></w:r>${run('Recitals')}</w:p>`;

  // what the check reads
  await put('nsDecl', docx({ body: `<w:p xmlns:acme="urn:matter:Margaret Tan">${run('Recitals')}</w:p>` }), { needle: 'urn:matter:Margaret Tan' });
  await put('mcList', docx({ body: `<w:p xmlns:k="urn:x" mc:Ignorable="k Kestrel">${run('Recitals')}</w:p>` }), { needle: 'k Kestrel' });
  await put('elemName', docx({ body: `<w:p><acme:MargaretTan xmlns:acme="urn:acme"/>${run('Recitals')}</w:p>` }), { needle: 'acme:MargaretTan' });
  await put('schemaAttr', docx({ body: withAttr('acme:src="http://purl.org/matters/Margaret Tan"') }), { needle: 'Margaret Tan"' });
  await put('lowerGlued', docx({ body: withAttr('acme:client="margaretTan"') }), { needle: 'margaretTan' });
  await put('termAttr', docx({ body: withAttr('acme:src="http://www.w3.org/Kestrel/4471"') }), { needle: 'Kestrel/4471' });
  // run together, in the text a reader sees
  await put('runBody', docx({ body: para('MargaretTan initialled; see margarettan.com.') }), { word: 'margarettan' });
  await put('runHeader', docx({ header: para('KestrelCapital draft') }), { word: 'kestrel' });
  await put('runFooter', docx({ footer: para('KestrelHoldings draft') }), { word: 'kestrel' });
  await put('runTable', docx({ body: `<w:tbl><w:tr><w:tc>${para('KestrelCapital')}</w:tc></w:tr></w:tbl>` }), { word: 'kestrel' });
  await put('runFootnote', docx({ body: `<w:p>${run('See note')}<w:r><w:footnoteReference w:id="1"/></w:r></w:p>`, parts: [{ name: 'word/footnotes.xml', xml: notesPart('footnotes', 'footnote', 'Advised by KestrelCapital.'), type: CT.footnotes, rel: ['footnotes', 'footnotes.xml'] }] }), { word: 'kestrel' });
  await put('runEndnote', docx({ body: `<w:p>${run('See note')}<w:r><w:endnoteReference w:id="1"/></w:r></w:p>`, parts: [{ name: 'word/endnotes.xml', xml: notesPart('endnotes', 'endnote', 'Advised by KestrelCapital.'), type: CT.endnotes, rel: ['endnotes', 'endnotes.xml'] }] }), { word: 'kestrel' });
  await put('runTextBox', docx({ body: `<w:p><w:r><w:pict><v:shape id="tb1" style="width:100pt;height:40pt"><v:textbox><w:txbxContent>${para('Counsel: KestrelCapital')}</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>` }), { word: 'kestrel' });
  const runTxt = txt('MargaretTan initialled; see margarettan.com. Margaret Tan signed.');
  // In text a reader sees (owner ruling 8, textHolds): never inside a plain word of letters, at
  // any length; from six inside a token that is not prose; before a plural on a capitalised
  // name. In the file's code the old reading stands and a run-on holds.
  await put('shortLiWu', docx({ raw: true, body: para('Li Wu signed for LIWUCORP.') }), { needle: 'LIWUCORP', rows: one('Li Wu'), terms: [] });
  await put('shortTan', docx({ raw: true, body: para('Tan paid tanholdings.com.') }), { needle: 'tanholdings', rows: one('Tan'), terms: [] });
  // a capital at the start of the word marks where the name starts, not where it ends
  await put('shortTanCap', docx({ raw: true, body: para('Tan paid Tanholdings.') }), { needle: 'Tanholdings', rows: one('Tan'), terms: [] });
  await put('plainTerm', docx({ footer: para('kestrelholdings draft') }), { needle: 'kestrelholdings' });
  await put('plainRow', docx({ body: para('Filed as margarettanfile.') }), { needle: 'margarettanfile' });
  await put('tokenTerm', docx({ footer: para('See www.kestrelcorp.com and @kestrelholdings.') }), { word: 'kestrel' });
  // a tag, as a handle is (owner ruling 18: "#" beside "@" in JOINER and HANDLE)
  await put('hashTerm', docx({ footer: para('Filed under #kestrelholdings.') }), { word: 'kestrel' });
  await put('plainInCode', docx({ body: withAttr('acme:client="kestrelholdings"') }), { needle: 'kestrelholdings' });
  await put('longGlued', docx({ body: para('Paid KESTRELHOLDINGS.') }), { needle: 'KESTRELHOLDINGS' });
  pairs.push(['shortLiWu', 'runBody'], ['shortTan', 'tokenTerm'], ['shortTanCap', 'runBody'], ['plainTerm', 'tokenTerm'], ['plainTerm', 'hashTerm'], ['plainRow', 'runBody'], ['longGlued', 'plainInCode']);
  const shortTxt = [txt('Li Wu signed for LIWUCORP.', one('Li Wu')), txt('Tan paid tanholdings.com.', one('Tan')), txt('Tan paid Tanholdings.', one('Tan'))];
  const plainTxt = { term: txt('Draft for kestrelholdings.', [], ['Kestrel']), row: txt('Filed as margarettanfile.'), token: txt('See www.kestrelcorp.com, @kestrelholdings and #kestrelholdings.', [row('k', 'Kestrel', '[Company1]', 'COMPANY', 'org')], ['Kestrel']) };
  const plural = { docx: await out(await docx({ raw: true, body: para('The Smiths sued the smiths.') }), { rows: one('Smith'), terms: [] }), txt: txt('The Smiths sued the smiths.', one('Smith')) };
  // what ruling 8 closed: a row no longer reaches into a different, longer name
  await put('tang', docx({ raw: true, body: para('Margaret Tang, not Margaret Tan, signed.') }), { terms: [] });
  await put('wong', docx({ raw: true, body: para('Wong Wei Ming gave evidence after Ong Wei Ming.') }), { rows: one('Ong Wei Ming'), terms: [], practice: 'sg' });
  await put('porter', docx({ raw: true, body: para('The court reporter certified the transcript. Mr Porter testified.') }), { rows: one('Porter'), terms: [] });
  await put('tanner', docx({ raw: true, body: para('Margaret Tanner met Margaret Tan.') }), { terms: [] });
  const overTxt = { tang: txt('Margaret Tang, not Margaret Tan, signed.'), wong: txt('Wong Wei Ming gave evidence after Ong Wei Ming.', one('Ong Wei Ming'), [], 'sg'), porter: txt('The court reporter certified the transcript. Mr Porter testified.', one('Porter')) };
  // and where it still does: a capital starts a find, a capitalised plural ends one
  await put('mcdonald', docx({ raw: true, body: para('McDonald met Donald.') }), { rows: one('Donald'), terms: [] });
  await put('laws', docx({ raw: true, body: para('The Laws Committee met. Mr Law signed.') }), { rows: one('Law'), terms: [], practice: 'sg' });
  // and, from six letters, inside a tag as inside any token that is not prose (owner ruling 18)
  await put('hashOver', docx({ raw: true, body: para('The #supporters met Mr Porter.') }), { rows: one('Porter'), terms: [] });
  const overNow = { mcdonald: txt('McDonald met Donald.', one('Donald')), laws: txt('The Laws Committee met. Mr Law signed.', one('Law'), [], 'sg'), hash: txt('The #supporters met Mr Porter.', one('Porter')) };
  // a row of digits alone (owner ruling 9): inside a longer number, across one separator, not a comma
  const ACCT = [row('d', '31926819', '[ID1]', 'ID', 'id')];
  const DIGITS = 'Pay GB29NWBK60161331926819, 3192 6819 or 3192-6819.';
  await put('digits', docx({ raw: true, body: para(DIGITS) }), { needle: '6819', rows: ACCT, terms: [] });
  await put('digitsComma', docx({ raw: true, body: para('Ref 3192,6819.') }), { needle: '3192,6819', rows: ACCT, terms: [] });
  pairs.push(['digitsComma', 'digits']);
  const digitsTxt = { grouped: txt(DIGITS, ACCT), comma: txt('Ref 3192,6819.', ACCT) };
  // Grouped by a mark DIGIT_SEP (docxWrite.ts) does not list: an underscore, two spaces, a range's
  // spaced en dash (owner ruling 19b widened the list; D1, driven 2026-09-24: a comma, an
  // underscore, a colon, a plus, an apostrophe, two spaces, and a spaced en dash, em dash or
  // slash each ship verified from both exports). Its partner is every mark 19b added.
  const DIGITS_OTHER = 'Pay 3192_6819, 3192  6819 or 3192 – 6819.';
  await put('digitsUnderscore', docx({ raw: true, body: para('Ref 3192_6819.') }), { needle: '3192_6819', rows: ACCT, terms: [] });
  await put('digitsSpacedEn', docx({ raw: true, body: para('Ref 3192 – 6819.') }), { needle: '3192 – 6819', rows: ACCT, terms: [] });
  const DIGITS_WIDE = 'Pay 3192—6819, 3192−6819, 3192·6819, 3192 - 6819 or (3192) 6819.';
  await put('digitsWide', docx({ raw: true, body: para(DIGITS_WIDE) }), { needle: '6819', rows: ACCT, terms: [] });
  await put('digitsTab', docx({ raw: true, body: `<w:p>${run('Ref 3192')}<w:r><w:tab/></w:r>${run('6819.')}</w:p>` }), { word: '31926819', rows: ACCT, terms: [] });
  pairs.push(['digitsUnderscore', 'digitsWide'], ['digitsSpacedEn', 'digitsWide'], ['digitsUnderscore', 'digitsTab']);
  digitsTxt.other = txt(DIGITS_OTHER, ACCT);
  digitsTxt.wide = txt(DIGITS_WIDE, ACCT);
  // A row of fewer than six digits (D1L-3, owner ruling 19g): standing alone in text it is masked;
  // in the file's code it holds where it is the whole of a value (SHORT_DIGITS) that the writer
  // reads, and is not looked for inside a longer number or value, under one of Office's own
  // prefixes, with no prefix on a shape, or in a drawing's position (OFFICE_MEASURE).
  const MATTER = row('m', '44179', '[ID1]', 'ID', 'id');
  const posOffset = (v) => `<w:p><w:r><w:drawing><wp:anchor><wp:positionH relativeFrom="column"><wp:posOffset>${v}</wp:posOffset></wp:positionH><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="Shape 1"/></wp:anchor></w:drawing></w:r>${run('Recitals')}</w:p>`;
  const MROWS = [...ROWS, MATTER];
  await put('shortDigitsIn', docx({ raw: true, body: para('Ref 9944179 filed.') }), { needle: '9944179', rows: [MATTER], terms: [] });
  await put('shortDigitsAlone', docx({ raw: true, body: para('Matter 44179 filed.') }), { needle: '44179', rows: [MATTER], terms: [] });
  await put('shortDigitsAttr', docx({ body: withAttr('acme:ref="44179"') }), { needle: 'acme:ref="44179"', rows: MROWS });
  await put('shortDigitsAttrIn', docx({ body: withAttr('acme:ref="9944179"') }), { needle: 'acme:ref="9944179"', rows: MROWS });
  await put('shortDigitsAttrWords', docx({ body: withAttr('acme:ref="Matter 44179"') }), { needle: 'acme:ref="Matter 44179"', rows: MROWS });
  await put('shortDigitsUnk', docx({ parts: [unk('<acme:note acme:ref="44179"/>')] }), { needle: 'acme:ref="44179"', rows: MROWS });
  await put('shortDigitsUnkIn', docx({ parts: [unk('<acme:note acme:ref="9944179"/>')] }), { needle: 'acme:ref="9944179"', rows: MROWS });
  await put('sixDigitsUnk', docx({ parts: [unk('<acme:note acme:ref="319268"/>')] }), { needle: 'acme:ref="319268"', rows: [...ROWS, row('m6', '319268', '[ID1]', 'ID', 'id')] });
  await put('shortDigitsOffice', docx({ body: `<w:p w:tel="44179">${run('Recitals')}</w:p>` }), { needle: 'w:tel="44179"', rows: MROWS });
  await put('shortDigitsShape', docx({ body: shape('ref="44179"') }), { needle: 'ref="44179"', rows: MROWS });
  await put('shortDigitsOfficeElem', docx({ body: `<w:p><w14:x>44179</w14:x>${run('Recitals')}</w:p>` }), { needle: '>44179<', rows: MROWS });
  await put('shortDigitsPos', docx({ body: posOffset('44179') }), { needle: '>44179<', rows: MROWS });
  await put('shortDigitsPct', docx({ body: `<w:p><w:r><w:drawing><wp:anchor><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="Shape 1"/><wp14:sizeRelH xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" relativeFrom="page"><wp14:pctWidth>44179</wp14:pctWidth></wp14:sizeRelH></wp:anchor></w:drawing></w:r>${run('Recitals')}</w:p>` }), { needle: '>44179<', rows: MROWS });
  pairs.push(['shortDigitsIn', 'shortDigitsAlone'], ['shortDigitsAttrIn', 'shortDigitsAttr'], ['shortDigitsAttrWords', 'shortDigitsAttr'], ['shortDigitsUnkIn', 'shortDigitsUnk'],
    ['shortDigitsOffice', 'shortDigitsOfficeElem'], ['shortDigitsShape', 'shortDigitsAttr'], ['shortDigitsPos', 'shortDigitsOfficeElem'], ['shortDigitsPct', 'shortDigitsOfficeElem']);
  const shortDigitsTxt = { inside: txt('Ref 9944179 filed.', [MATTER]), alone: txt('Matter 44179 filed.', [MATTER]) };
  // A designator written out (D1J-4 / D1L-6, owner ruling 19a): found, and the whole word is masked.
  const HICK = [row('h', 'Hickson Corp', '[Company1]', 'COMPANY', 'org')];
  const LONG_IN = 'Hickson Corporation signed. Hickson Corp paid.';
  const longForm = { docx: await out(await docx({ raw: true, body: para(LONG_IN) }), { rows: HICK, terms: [] }), txt: txt(LONG_IN, HICK) };
  // A hyphen inside a word (D1L-7), as text copied from a PDF keeps a line's break; Word's own
  // optional hyphen is its partner and is masked.
  await put('hyphenIn', docx({ body: para('Later Marga-ret Tan agreed.') }), { needle: 'Marga-ret Tan' });
  await put('softHyphen', docx({ body: `<w:p>${run('Later Marga')}<w:r><w:softHyphen/></w:r>${run('ret Tan agreed.')}</w:p>` }), { needle: 'ret Tan agreed' });
  pairs.push(['hyphenIn', 'softHyphen']);
  const hyphenTxt = [txt('Margaret Tan signed. Later Marga-\nret Tan agreed.'), txt('Margaret Tan signed. Later Marga-ret Tan agreed.')];
  // A ligature (D1J-3, closed by owner ruling 19c): the fold is NFKD, so "Griﬃths" is the row
  // Griffiths in the text, in the text export and in an add-in's attribute.
  const GRIFF = [...ROWS, row('g', 'Griffiths', '[Person2]', 'PERSON', 'person')];
  await put('ligBody', docx({ body: para('Mr Griﬃths signed.') }), { needle: 'Griﬃths', rows: GRIFF });
  await put('ligAttr', docx({ body: withAttr('acme:client="Griﬃths"') }), { needle: 'Griﬃths', rows: GRIFF });
  const ligTxt = txt('Mr Griffiths signed. Mr Griﬃths agreed.', GRIFF);
  // letters spaced apart, or each in brackets (U+249C…24B5, which NFKD folds to "(a)" and the
  // writer leaves as a symbol); a circled letter folds to the letter and is its partner
  await put('spaced', docx({ body: para('Signed: M a r g a r e t T a n.') }), { needle: 'M a r g a r e t T a n' });
  const BRACKETED = 'Signed: ⒨⒜⒭⒢⒜⒭⒠⒯ ⒯⒜⒩.';
  await put('bracketed', docx({ raw: true, body: para(BRACKETED) }), { needle: '⒨⒜⒭⒢⒜⒭⒠⒯', terms: [] });
  await put('circled', docx({ raw: true, body: para('Signed: Ⓜⓐⓡⓖⓐⓡⓔⓣ Ⓣⓐⓝ.') }), { needle: 'Ⓜⓐⓡⓖ', terms: [] });
  pairs.push(['spaced', 'runBody'], ['bracketed', 'circled']);
  const spacedTxt = txt('Signed: M a r g a r e t T a n.');
  const bracketTxt = { bracketed: txt(BRACKETED), circled: txt('Signed: Ⓜⓐⓡⓖⓐⓡⓔⓣ Ⓣⓐⓝ.') };
  // A line break inside a name's letters is not read; one inside an escape, in a link that starts
  // with a scheme or "www.", is (LINK_BROKEN, owner ruling 17). A hard break (w:br) in the .docx,
  // a line feed in the text export.
  const BR = '<w:r><w:br/></w:r>';
  await put('brokenName', docx({ raw: true, body: `<w:p>${run('Signed by Marg')}${BR}${run('aret Tan today.')}</w:p>` }), { word: 'margarettan', terms: [] });
  await put('brokenEscape', docx({ raw: true, body: `<w:p>${run('See https://dms.example.com/Margaret%2')}${BR}${run('0Tan/brief today.')}</w:p>` }), { needle: 'Margaret%2', terms: [] });
  await put('brokenNoScheme', docx({ raw: true, body: `<w:p>${run('See dms.example.com/Margaret%2')}${BR}${run('0Tan/brief today.')}</w:p>` }), { needle: 'Margaret%2', terms: [] });
  pairs.push(['brokenName', 'brokenEscape'], ['brokenNoScheme', 'brokenEscape']);
  const brokenTxt = { name: txt('Signed by Marg\naret Tan today.'), escape: txt('See https://dms.example.com/Margaret%2\n0Tan/brief today.'), noScheme: txt('See dms.example.com/Margaret%2\n0Tan/brief today.') };
  // The same break where the next line starts with a quote mark, as each line of a quoted reply
  // does: BR and LINK_BROKEN take no ">" after the break, so the escape is left broken and the name
  // ships from both exports (D1L-1, driven 2026-09-25). Its partner is brokenEscape.
  await put('brokenQuoted', docx({ raw: true, body: `<w:p>${run('See https://dms.example.com/Margaret%2')}${BR}${run('&gt; 0Tan/brief today.')}</w:p>` }), { needle: 'Margaret%2', terms: [] });
  pairs.push(['brokenQuoted', 'brokenEscape']);
  brokenTxt.quoted = txt('See https://dms.example.com/Margaret%2\n> 0Tan/brief today.');
  // Digits grouped by a mark DIGIT_SEP does not take, each of which a reader takes for one it
  // does: a fraction slash, an ideographic and a small full stop, a swung dash, a heavy minus, a
  // white, a black and a triangular bullet, a square bracket, a no-break space in " - " and ") ",
  // and a line separator; a hard break (w:br) in the .docx and a line feed in the text export
  // (D1J-F3, D1L-2, driven 2026-09-25). Their partner is digitsWide.
  const DIGITS_LOOK = 'Pay 3192\u20446819, 3192\u30026819, 3192\uFE526819, 3192\u20536819, 3192\u27966819, 3192\u25E66819, 3192\u25CF6819, 3192\u20236819, [3192] 6819, 3192\u00A0-\u00A06819, (3192)\u00A06819 or 3192\u20286819.';
  await put('digitsLook', docx({ raw: true, body: para(DIGITS_LOOK) }), { needle: '6819', rows: ACCT, terms: [] });
  await put('digitsBr', docx({ raw: true, body: `<w:p>${run('Ref 3192')}${BR}${run('6819 paid.')}</w:p>` }), { word: '31926819', rows: ACCT, terms: [] });
  pairs.push(['digitsLook', 'digitsWide'], ['digitsBr', 'digitsWide']);
  digitsTxt.look = txt(DIGITS_LOOK, ACCT);
  digitsTxt.lf = txt('Ref 3192\n6819 paid.', ACCT);
  // An invisible direction mark inside a name's letters (D1J-F4): REF_INVISIBLE reads through a
  // soft hyphen, U+200B to U+200D, U+2060 and U+FEFF only, so a left-to-right or right-to-left
  // mark, as text pasted from a right-to-left document carries, ships from both exports. Each
  // mark it reads through is a partner.
  const BIDI = { bidiLrm: '\u200E', bidiRlm: '\u200F' };
  const ZW = { zwSpace: '\u200B', zwNonJoiner: '\u200C', zwJoiner: '\u200D', wordJoiner: '\u2060', softHyphenChar: '\u00AD' };
  const markTxt = {};
  for (const [k, ch] of Object.entries({ ...BIDI, ...ZW })) {
    await put(k, docx({ raw: true, body: para(`Client: Mar${ch}garet Tan signed.`) }), { needle: `Mar${ch}garet`, terms: [] });
    markTxt[k] = txt(`Client: Mar${ch}garet Tan signed.`);
  }
  for (const b of Object.keys(BIDI)) for (const z of Object.keys(ZW)) pairs.push([b, z]);
  // What the partial-name check reads of a saved .docx (D1J-F1, D1J-F2), computed as Export.tsx
  // computes it: the body as the copy writes it, then each part but the body as the writer saves
  // it (savedFlowText, tags blanked), through survivingFragments with the listed terms.
  const fragsOf = async (pkg, rows, terms = []) => {
    const d = await D.extractDocx(pkg);
    const plan = E.exportPlan({ text: D.flowText(d.items.filter(D.inMainFlow)), entities: rows, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg }, terms, 'us');
    const report = await W.writeRedactedDocx(pkg, { mask: plan.docx.mask });
    if (!report.bytes) return { frags: null, raw: '', readable: plan.readable };
    const others = report.flows.filter((f) => f.kind !== 'body').flatMap((f) => { const t = W.savedFlowText(f, plan.docx.mask); return t === null ? [] : [E.tagsBlanked(t, plan.docx.table)]; });
    const zip = await D.readZip(report.bytes);
    let raw = '';
    for (const nm of zip.names) raw += dec(await zip.read(nm));
    return { frags: E.survivingFragments([plan.readable, ...others].join(`\n${E.TAG_BLANK}\n`), rows.filter((e) => !e.dead && !E.isFloorRow(e)), E.fragmentTerms(rows, terms)), raw, readable: plan.readable };
  };
  const SK = one('Soren Kierkegaard');
  const SK_BODY = para('Client: Soren Kierkegaard signed.');
  const watermark = (t) => `<w:p><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1" o:spid="_x0000_s2049" type="#_x0000_t136" style="position:absolute;width:468pt;height:117pt"><v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="${t}"/></v:shape></w:pict></w:r></w:p>`;
  const signer = (t) => `<w:p><w:r><w:pict><v:shape id="sig1" style="width:192pt;height:96pt"><o:signatureline v:ext="edit" id="{00000000-0000-0000-0000-000000000001}" provid="{00000000-0000-0000-0000-000000000000}" o:suggestedsigner="${t}" issignatureline="t"/></v:shape></w:pict></w:r></w:p>`;
  const numbering = (t) => ({ name: 'word/numbering.xml', xml: `<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="${t}"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`, type: `${WML}.numbering+xml`, rel: ['numbering', 'numbering.xml'] });
  const listed = `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run('Client: Soren Kierkegaard signed.')}</w:p>`;
  const frag = {
    header: await fragsOf(await docx({ raw: true, header: para('Prepared for Mr Kierkegaard'), body: SK_BODY }), SK),
    watermark: await fragsOf(await docx({ raw: true, header: watermark('PREPARED FOR MR KIERKEGAARD'), body: SK_BODY }), SK),
    signer: await fragsOf(await docx({ raw: true, header: signer('Mr Kierkegaard'), body: SK_BODY }), SK),
    listNumber: await fragsOf(await docx({ raw: true, body: listed, parts: [numbering('Kierkegaard %1.')] }), SK),
    // a surname that is a word FRAGMENT_STOP skips, and one it does not
    street: await fragsOf(await docx({ raw: true, body: para('Client: Della Street signed. Later Ms Street replied.') }), one('Della Street')),
    weber: await fragsOf(await docx({ raw: true, body: para('Client: Hans Weber signed. Later Mr Weber replied.') }), one('Hans Weber')),
  };
  // A letter written as a symbol (w:sym): in the Symbol font Word draws the Greek capital shaped
  // like the Latin one, and symText returns no letter, so "Margaret TΑn" ships; in a font that
  // draws letters the symbol holds the file.
  const sym = (font, ch) => `<w:p>${run('Client: Margaret T')}<w:r><w:sym w:font="${font}" w:char="${ch}"/></w:r>${run('n signed.')}</w:p>`;
  await put('symSymbol', docx({ raw: true, body: sym('Symbol', 'F041') }), { needle: 'Margaret T', terms: [] });
  await put('symArial', docx({ raw: true, body: sym('Arial', '0061') }), { needle: 'Margaret T', terms: [] });
  pairs.push(['symSymbol', 'symArial']);
  // percent-escapes and character references (owner ruling 10): masked, held in code
  const LINK = 'Filed at https://firm.sharepoint.com/sites/Clients/Shared%20Documents/Margaret%20Tan%20Matter/brief.docx';
  await put('pctBody', docx({ body: para(LINK) }), { needle: 'Margaret%20Tan' });
  await put('pctNbsp', docx({ body: para('Client: Margaret&amp;nbsp;Tan.') }), { needle: 'Margaret&amp;nbsp;Tan' });
  await put('pctNs', docx({ body: `<w:p xmlns:acme="http://dms.example.com/clients/Margaret%20Tan/">${run('Recitals')}</w:p>` }), { needle: 'Margaret%20Tan' });
  await put('pctAttr', docx({ body: withAttr('acme:src="http://dms.example.com/clients/Margaret%20Tan/"') }), { needle: 'Margaret%20Tan' });
  await put('badByte', docx({ raw: true, body: para('Profile: https://old.example.com/people/Ren%E9%20Tan.html') }), { needle: 'Ren%E9%20Tan', rows: one('René Tan'), terms: [] });
  const pctTxt = txt(`Margaret Tan signed. ${LINK}`);
  const nbspTxt = txt('Client: Margaret&nbsp;Tan.');
  const badByteTxt = txt('Profile: https://old.example.com/people/Ren%E9%20Tan.html', one('René Tan'));
  // The same bad escape as a mail gateway rewrites it (D1J-2): the writer's hasEscape holds the
  // .docx; engine.ts holds the text export only on includes('%'), so the text export carries it.
  const PP = {
    v3: 'Profile: https://urldefense.com/v3/__https://old.example.com/people/Ren*E9*20Tan.html__;JSU!!abc$',
    v2: 'Profile: https://urldefense.proofpoint.com/v2/url?u=https-3A__x.example.com_docs_Ren-E9-20Tan.pdf&d=DwMFaQ&c=abc today.',
  };
  await put('ppBadByte', docx({ raw: true, body: para(PP.v3) }), { needle: 'Ren*E9*20Tan', rows: one('René Tan'), terms: [] });
  const ppTxt = { v3: txt(PP.v3, one('René Tan')), v2: txt(PP.v2, one('René Tan')) };
  // A character reference (D1J-6, owner ruling 19d): by number with or without its semicolon, and
  // "&nbsp" without it, are read as what they write; another name without it, a name HTML does
  // not define, and a reference escaped again are read as written.
  const RENE = one('René Tan');
  await put('refNoSemi', docx({ body: para('Client: Margaret&amp;nbspTan.') }), { needle: 'Margaret&amp;nbspTan' });
  await put('refNumNoSemi', docx({ body: para('Client: Margaret&amp;#160Tan.') }), { needle: 'Margaret&amp;#160Tan' });
  await put('refNameNoSemi', docx({ raw: true, body: para('Client: Ren&amp;eacute Tan.') }), { needle: 'Ren&amp;eacute Tan', rows: RENE, terms: [] });
  await put('refUndefined', docx({ body: para('Client: Margaret&amp;NBSP;Tan.') }), { needle: 'Margaret&amp;NBSP;Tan' });
  await put('refTwice', docx({ raw: true, body: para('Client: Ren&amp;amp;eacute; Tan.') }), { needle: 'Ren&amp;amp;eacute; Tan', rows: RENE, terms: [] });
  pairs.push(['refNameNoSemi', 'refNoSemi'], ['refUndefined', 'pctNbsp'], ['refTwice', 'refNumNoSemi']);
  const refTxt = {
    noSemi: txt('Client: Margaret&nbspTan.'), numNoSemi: txt('Client: Margaret&#160Tan.'),
    nameNoSemi: txt('Client: Ren&eacute Tan.', RENE), undefined: txt('Client: Margaret&NBSP;Tan.'), twice: txt('Client: Ren&amp;eacute; Tan.', RENE),
  };
  const pctIntake = T.detectFormat(enc(`Memo.\n${LINK}\nRegards.`), 'memo.txt').route;
  // Not only spaces: a browser escapes an apostrophe, an accented letter and every letter of a
  // non-Latin script in a link, and intake lets each of those through (detect.ts percentHold), so
  // a sentence that names spaces alone names a narrower class than ships.
  const SP = 'https://firm.sharepoint.com/sites/Clients';
  const PCT_MORE = {
    pctApos: { row: "O'Brien", said: "Mr O'Brien signed.", link: `${SP}/O%27Brien/brief.docx`, needle: 'O%27Brien' },
    pctAccent: { row: 'Müller', said: 'Mr Müller signed.', link: `${SP}/M%C3%BCller/brief.docx`, needle: 'M%C3%BCller' },
    pctCjk: { row: '陈伟玲', said: '陈伟玲 signed.', link: 'https://www.elitigation.sg/search?q=%E9%99%88%E4%BC%9F%E7%8E%B2', needle: '%E9%99%88%E4%BC%9F%E7%8E%B2', practice: 'sg' },
  };
  const pctMoreTxt = {};
  for (const [k, c] of Object.entries(PCT_MORE)) {
    const text = `${c.said} See ${c.link} today.`;
    await put(k, docx({ raw: true, body: para(text) }), { needle: c.needle, rows: one(c.row), terms: [], practice: c.practice ?? 'us' });
    pctMoreTxt[k] = { ...txt(text, one(c.row), [], c.practice ?? 'us'), intake: T.detectFormat(enc(`Memo.\n${text}\nRegards.`), 'memo.txt').route };
  }
  // a listed term, not only a table row
  await put('pctTerm', docx({ body: para(`See ${SP}/Harrow%20Leung/ today.`) }), { needle: 'Harrow%20Leung' });
  // what intake holds and passes of percent-escapes (detect.ts percentHold)
  const route = (s) => T.detectFormat(enc(`Memo.\n${s}\nRegards.`), 'memo.txt').route;
  const pctRoutes = {
    asciiLetters: route('Payee %4A%61%6E%65%20%52%6F%65 signed.'),
    cjkOutsideLink: route('Payee %E9%99%88%E4%BC%9F%E7%8E%B2 signed.'),
    cjkInLink: route('See https://www.elitigation.sg/search?q=%E9%99%88%E4%BC%9F%E7%8E%B2 today.'),
    accentOutsideLink: route('Payee M%C3%BCller signed.'),
    space: route('Payee Margaret%20Tan signed.'),
  };
  // equations
  for (const [k, inner] of Object.entries({
    eqBox: mr('Kes') + `<m:box><m:e>${mr('trel')}</m:e></m:box>`,
    eqBorderBox: mr('Kes') + `<m:borderBox><m:e>${mr('trel')}</m:e></m:borderBox>`,
    eqBar: mr('Kes') + `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${mr('trel')}</m:e></m:bar>`,
    eqAcc: mr('Kes') + `<m:acc><m:e>${mr('t')}</m:e></m:acc>` + mr('rel'),
    eqGroupChr: mr('Kes') + `<m:groupChr><m:e>${mr('trel')}</m:e></m:groupChr>`,
    eqEmptyDelim: mr('Kes') + `<m:d><m:dPr><m:begChr m:val=""/><m:endChr m:val=""/></m:dPr><m:e>${mr('trel')}</m:e></m:d>`,
    eqFrac: `<m:f><m:num>${mr('Kes')}</m:num><m:den>${mr('trel')}</m:den></m:f>`,
    eqSup: `<m:sSup><m:e>${mr('Kes')}</m:e><m:sup>${mr('trel')}</m:sup></m:sSup>`,
    eqMatrix: `<m:m><m:mr><m:e>${mr('Kes')}</m:e><m:e>${mr('trel')}</m:e></m:mr></m:m>`,
  })) await put(k, docx({ body: eq(inner) }), { word: 'kestrel' });
  pairs.push(['eqFrac', 'eqBox']);
  // the file's code, in Word's own parts
  const RLEE = [...ROWS, row('q', 'Lee', '[Person2]', 'PERSON', 'person')];
  await put('lee', docx({ body: withAttr('acme:client="lee"', 'Lee signed.') }), { needle: 'acme:client="lee"', rows: RLEE });
  await put('leeCap', docx({ body: withAttr('acme:client="Lee"', 'Lee signed.') }), { needle: 'acme:client="Lee"', rows: RLEE });
  // a number the safety net masks in text (owner ruling 11): an add-in's attribute or element
  // holds; under Office's own prefix, or unprefixed on a shape, it is not read
  const TEL = '+1 415 555 0123';
  await put('phoneAttr', docx({ body: withAttr(`acme:tel="${TEL}"`) }), { needle: '555 0123' });
  await put('phoneElem', docx({ body: `<w:p>${run('Recitals')}<acme:tel xmlns:acme="urn:acme">${TEL}</acme:tel></w:p>` }), { needle: '555 0123' });
  await put('phoneW', docx({ body: `<w:p w:tel="${TEL}">${run('Recitals')}</w:p>` }), { needle: '555 0123' });
  await put('phoneShape', docx({ body: shape(`tel="${TEL}"`) }), { needle: '555 0123' });
  await put('phoneText', docx({ body: para(`Call ${TEL}.`) }), { needle: '555 0123' });
  // Digits alone between the tags of an element under an Office namespace that is not text on the
  // page (D1L-2, closed by owner ruling 19f): the net's find holds where it takes the whole value
  // (WHOLE_NET); a drawing's position, size or share of the page (OFFICE_MEASURE) is not read.
  await put('phoneOfficeElem', docx({ body: `<w:p><w14:tel>2125550147</w14:tel>${run('Recitals')}</w:p>` }), { needle: '2125550147' });
  await put('phoneOfficeElemSep', docx({ body: `<w:p><w14:tel>212 555 0147</w14:tel>${run('Recitals')}</w:p>` }), { needle: '212 555 0147' });
  await put('phoneDigitsText', docx({ body: para('Call 2125550147.') }), { needle: '2125550147' });
  await put('phonePos', docx({ body: posOffset('2125550147') }), { needle: '2125550147' });
  pairs.push(['phonePos', 'phoneOfficeElem'], ['phonePos', 'phoneDigitsText']);
  // a name where Word writes only its own words: under Office's namespaces it is not read; an
  // unprefixed attribute on a w: element is (W3-7), and so is the XML declaration's encoding
  await put('wordElem', docx({ body: `<w:p><w:MargaretTan/>${run('Recitals')}</w:p>` }), { needle: 'MargaretTan' });
  await put('wordAttr', docx({ body: `<w:p w:MargaretTan="1">${run('Recitals')}</w:p>` }), { needle: 'MargaretTan' });
  await put('shapeAttr', docx({ body: shape('MargaretTan="1"') }), { needle: 'MargaretTan' });
  await put('bareAttrW', docx({ body: `<w:p MargaretTan="1">${run('Recitals')}</w:p>` }), { needle: 'MargaretTan' });
  await put('declEnc', docx({ sect: '<w:headerReference w:type="default" r:id="rIdH"/>', parts: [{ name: 'word/header1.xml', data: enc(`<?xml version="1.0" encoding="Kestrel" standalone="yes"?><w:hdr ${NS}>${para('Header')}</w:hdr>`), type: CT.header, rel: ['header', 'header1.xml', 'rIdH'] }] }), { needle: 'encoding="Kestrel"' });
  pairs.push(['lee', 'leeCap'], ['phoneW', 'phoneAttr'], ['phoneShape', 'phoneElem'], ['phoneW', 'phoneText'], ['wordElem', 'elemName'], ['wordAttr', 'bareAttrW'], ['shapeAttr', 'declEnc']);
  // closed since round 4
  await put('msoPI', docx({ header: `<?mso-KestrelHoldings?>${para('Header')}` }), { needle: 'KestrelHoldings' });
  await put('chartSSN', chart('[$123-45-6789] 0'), { needle: '123-45-6789' });
  await put('chartPhone', chart('[$+1 415 555 0123] 0'), { needle: '555 0123' });
  await put('chartEmail', chart('[$j.doe@example.com] 0'), { needle: 'j.doe@example.com' });
  // parts the writer does not know
  await put('unkPhone', docx({ parts: [unk('<acme:phone>+14155550123</acme:phone>')] }), { needle: '+14155550123' });
  await put('unkElem', docx({ parts: [unk('<acme:matter><acme:MargaretTan/></acme:matter>')] }), { needle: 'MargaretTan' });
  await put('unkCurrency', docx({ parts: [unk('<acme:fmt><c:numFmt formatCode="[$Jonas Whitfield] 0" sourceLinked="0"/></acme:fmt>')] }), { needle: 'Jonas Whitfield' });
  await put('unkText', docx({ parts: [unk('<acme:note>whitfield</acme:note>')] }), { needle: 'whitfield' });
  await put('unkTyped', docx({ parts: [unk('<acme:note acme:client="Jonas Whitfield"/>')] }), { needle: 'Jonas Whitfield' });
  await put('unkLowerAttr', docx({ parts: [unk('<acme:note acme:client="whitfield"/>')] }), { needle: 'whitfield' });
  await put('unkOfficeElem', docx({ parts: [unk('<acme:matter><w:JonasWhitfield/></acme:matter>')] }), { needle: 'JonasWhitfield' });
  await put('unkOfficeElemRow', docx({ parts: [unk('<acme:matter><w:MargaretTan/></acme:matter>')] }), { needle: 'MargaretTan' });
  // the rest of what the keep rule reads as code, each with a partner that holds
  await put('unkCamelAttr', docx({ parts: [unk('<acme:note acme:client="jonasWhitfield"/>')] }), { needle: 'jonasWhitfield' });
  await put('unkCamelText', docx({ parts: [unk('<acme:note>jonasWhitfield</acme:note>')] }), { needle: 'jonasWhitfield' });
  await put('unkLowerElem', docx({ parts: [unk('<acme:matter><acme:whitfield/></acme:matter>')] }), { needle: 'acme:whitfield' });
  await put('unkCapElem', docx({ parts: [unk('<acme:matter><acme:Whitfield/></acme:matter>')] }), { needle: 'acme:Whitfield' });
  await put('unkLowerPrefix', docx({ parts: [unk('<whitfield:matter xmlns:whitfield="urn:acme:x"/>')] }), { needle: 'whitfield:matter' });
  await put('unkHostText', docx({ parts: [unk('<acme:note>http://purl.org/matters/whitfield</acme:note>')] }), { needle: 'matters/whitfield' });
  await put('unkHostCap', docx({ parts: [unk('<acme:note>http://purl.org/matters/Whitfield</acme:note>')] }), { needle: 'matters/Whitfield' });
  await put('unkHostW3', docx({ parts: [unk('<acme:note acme:src="http://www.w3.org/matters/whitfield"/>')] }), { needle: 'matters/whitfield' });
  await put('unkDigitsText', docx({ parts: [unk('<acme:note>whitfield2291</acme:note>')] }), { needle: 'whitfield2291' });
  await put('unkLowerAttrName', docx({ parts: [unk('<acme:note acme:whitfield="1"/>')] }), { needle: 'acme:whitfield=' });
  await put('unkPartName', docx({ parts: [unk('<acme:v id="3"/>', 'word/Whitfield.xml')] }), { needle: 'acme:v id="3"' });
  await put('unkNsUri', docx({ parts: [unk('<j:note xmlns:j="urn:matters:Jonas Whitfield" j:id="1"/>')] }), { needle: 'urn:matters:Jonas Whitfield' });
  pairs.push(['unkHostW3', 'unkHostCap'], ['unkLowerAttr', 'unkTyped'], ['unkOfficeElem', 'unkOfficeElemRow'], ['unkCamelAttr', 'unkCamelText'], ['unkLowerElem', 'unkCapElem'], ['unkLowerPrefix', 'unkCapElem'], ['unkHostW3', 'unkHostText'],
    ['unkDigitsText', 'unkText'], ['unkLowerAttrName', 'unkCapElem'], ['unkPartName', 'unkText'], ['unkNsUri', 'unkTyped']);
  // the first blind spot: a name nobody found. Since owner ruling 27 the engine reads the text
  // outside the body in a request of its own (lib/side.ts); a name found only there is on
  // side.rows, and the .docx masks with those rows (engine.ts docxMaskTable). footerOnly is the
  // name that read did not find; footerSide is the same file with the read that found it.
  const sideRead = (text, found) => ({ state: 'read', places: [{ where: 'a footer', part: 'word/footer1.xml', text }], text, rows: found.map((t, i) => row(`side${i + 1}`, t, `[Person${i + 2}]`, 'PERSON', 'person')), joined: 0, engine: 'in-app core', genre: 'contract' });
  await put('footerOnly', docx({ footer: para('Delia Marsh, counsel') }), { needle: 'Delia Marsh', side: sideRead('Delia Marsh, counsel', []) });
  await put('footerTerm', docx({ footer: para('Kestrel, counsel') }), { word: 'kestrel' });
  await put('footerSide', docx({ footer: para('Delia Marsh, counsel') }), { needle: 'Delia Marsh', side: sideRead('Delia Marsh, counsel', ['Delia Marsh']) });
  pairs.push(['footerOnly', 'footerTerm'], ['footerOnly', 'footerSide']);
  // the .docx is held, and says why, when the body was read and that text was not (sideHeld):
  // unread, or not yet sent; not when it was read, nor when no engine read the body either
  const footerPkg = await docx({ footer: para('Delia Marsh, counsel') });
  const heldWhen = (state) => E.exportPlan({ text: OPENING, entities: ROWS, reviewed: true, engineComplete: true, kind: 'docx', bytes: footerPkg, side: { state, places: [], text: '', rows: [], why: 'the request to the engine failed', again: true } }, TERMS, 'us').docxHeld;
  const SIDE_HELD_BY = { unread: heldWhen('unread'), waiting: heldWhen('waiting'), read: heldWhen('read'), notRun: heldWhen('not-run') };
  // the engine read that text and its read could not be used (engine.ts readSide sets `ran`)
  SIDE_HELD_BY.unused = E.exportPlan({ text: OPENING, entities: ROWS, reviewed: true, engineComplete: true, kind: 'docx', bytes: footerPkg, side: { state: 'unread', ran: true, places: [], text: '', rows: [], why: 'the frozen legal pipeline read it, but its redacted text of it differs from it somewhere other than at a tag, so the app cannot tell which words it found', again: false } }, TERMS, 'us').docxHeld;
  // the Review screen's warning and the writer's note, for every part name that looks like Word's
  const WARN = {};
  for (const name of ['word/unheardOf.xml', 'word/theme/extra1.xml', 'word/stylesX.xml', 'word/numberingX.xml', 'word/fontTableX.xml', 'word/webSettingsX.xml']) {
    const pkg = await docx({ parts: [unk('<acme:v id="3"/>', name)] });
    const rd = await D.extractDocx(pkg);
    const r = await out(pkg);
    WARN[name] = rd.warnings.some((x) => x.includes(name)) && r.how !== 'held' && r.report.notes.some((x) => x.startsWith(`${name} is a part this writer does not know`));
  }
  // fields: a table of contents built of link fields keeps its page numbers and loses its links
  let tocLinksGo;
  {
    const fc = (t) => `<w:r><w:fldChar w:fldCharType="${t}"/></w:r>`;
    const it = (s) => `<w:r><w:instrText xml:space="preserve">${s}</w:instrText></w:r>`;
    const entry = `<w:p>${fc('begin')}${it(' HYPERLINK \\l "_Toc1" ')}${fc('separate')}${run('Definitions')}${fc('begin')}${it(' PAGEREF _Toc1 \\h ')}${fc('separate')}${run('1')}${fc('end')}${fc('end')}</w:p>`;
    const r = await out(await docx({ body: `<w:p>${fc('begin')}${it(' TOC \\o "1-3" \\h \\z \\u ')}${fc('separate')}</w:p>${entry}<w:p>${fc('end')}</w:p><w:p><w:bookmarkStart w:id="1" w:name="_Toc1"/>${run('Definitions')}<w:bookmarkEnd w:id="1"/></w:p>` }));
    const d = r.raw?.['word/document.xml'] ?? '';
    tocLinksGo = r.how !== 'held' && /PAGEREF _Toc1/.test(d) && !/HYPERLINK/.test(d) && r.report.notes.some((x) => /will not jump there/.test(x));
  }

  // ---- facts ---------------------------------------------------------------------------------
  const EXPORT = read('app', 'frontend', 'src', 'screens', 'Export.tsx');
  const WRITER = read('app', 'frontend', 'src', 'lib', 'extract', 'docxWrite.ts');
  const ENGINE = read('app', 'frontend', 'src', 'lib', 'engine.ts');
  const STATUS = read('app', 'frontend', 'src', 'lib', 'engineStatus.ts');
  const PDF = read('app', 'frontend', 'src', 'lib', 'extract', 'pdf.ts');
  const STORE = read('app', 'frontend', 'src', 'lib', 'store.ts');
  const VERIFY = read('tools', 'verify.mjs');
  const FREEZE = read('FREEZE.md');
  const SERVE = read('serve-legal.mjs');
  const SVC_AUTH = read('app', 'frontend', 'test', 'service-auth.mjs');
  const is = (k, ...hows) => hows.includes(C[k].how);
  const every = (ks, ...hows) => ks.every((k) => is(k, ...hows));
  const b64 = Buffer.from('Margaret Tan, NRIC S1234567D').toString('base64');
  const edgarIn = (r) => JSON.parse(read('pii-bench', `${r}-manifest.json`)).docs.filter((d) => /^edgar/.test(d.file)).length;
  const pureoos = JSON.parse(read('pii-bench', 'pureoos-manifest.json')).docs;
  const util = JSON.parse(read('pii-bench', 'utility-bench', 'v1-round4-result.json')).result;
  // the receipt's statement of the .docx scope, as Export.tsx builds it
  const scopeLine = EXPORT.split('\n').find((l) => l.includes('const docxScope = '));
  if (!scopeLine) throw new Error('docxScope is no longer one line in Export.tsx; re-read how the receipt states the limits');
  const SCOPE = scopeLine.slice(scopeLine.indexOf("'") + 1, scopeLine.lastIndexOf("'"));
  // what the FAQ says the receipt names, each read in docxScope as the clause that states it
  const RECEIPT_NAMES = [
    ['a name split between an equation\'s parts', /does not find a name split between separate parts of an equation/],
    ['letters spaced apart', /does not read a name written with its letters spaced apart/],
    ['a plain word of letters', /never found there inside a word of letters alone/],
    ['a row inside a longer name', /may stand inside a longer name, and is masked there/],
    ['names under Office\'s namespaces', /does not read the name of an element or attribute under a namespace Office\\'s file formats define/],
    ['a number under Office\'s own prefixes', /such a number written into an attribute under one of Office\\'s own prefixes[^.]*is not found/],
    // the second pass of 2026-09-24 (D1J-5): each blind spot the FAQ now adds to the list
    ['a hyphen inside a word', /with a hyphen inside one of its words/],
    ['a name under six inside an address', /and, from six letters and digits, inside a token that is not a word of prose/],
    ['a name under six in a value in code', /it counts a name only from six letters and digits, so a shorter one there is not found/],
    ['a row of digits under six', /A name of digits alone is looked for this way only from six digits\./],
    ['digits grouped any other way', /grouped any other way \([^)]*\), it is not found, and the check does not find it either/],
    // owner rulings 17 to 19 (round 7): the clauses the receipt says now, each a blind spot the FAQ
    // lists (D1, the writer driven on each, 2026-09-24)
    ['letters each in brackets', /written with its letters spaced apart or each in brackets/],
    ['a line break inside a word', /with a line break inside one of its words/],
    // D12 (2026-09-25): an invisible direction mark, a quoted reply's wrapped link, and digits
    // grouped by a mark that only looks like one DIGIT_SEP takes
    ['an invisible direction or format mark', /or with an invisible mark that sets the direction or format of text inside one of its words/],
    ['a quoted reply\'s wrapped link', /where the line after it starts with a quote mark \(">"\), as each line of a quoted reply does, so a name broken there is not found, and the check does not find it either/],
    ['digits grouped by a look-alike mark', /or a mark that only looks like one of those, such as a fraction slash/],
    ['a Symbol-font letter', /does not read a letter written as a symbol \(Word\\'s w:sym\) in the Symbol font/],
    ['a reference HTML reads otherwise', /but not another name without it, "&eacute", nor a name HTML does not define, "&NBSP;", nor a reference escaped again/],
    ['a short number inside a longer value', /so a five-digit matter number inside a longer value there is not found/],
    ['a short number under Office\'s prefixes', /save a name of two to five digits that is the whole of such a value, which holds the file but in an attribute under one of Office\\'s own prefixes/],
    ['a number in a drawing\'s position', /save in a drawing\\'s position, size or share of the page \(wp:posOffset\), which the pattern does not read/],
  ];
  // the fixed words of the .docx scope line that it.html names (D1L-5): the same on every receipt
  const SCOPE_WORDS = ['KestrelCapital', 'XYZReport', 'Corp', 'Inc', 'Office', 'Dublin Core'];
  // every http:// string in the app's own source, and every fetch() the web side makes
  const APP = { ts: '', rs: '' };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) APP.ts += readFileSync(p, 'utf8') + '\n';
      else if (/\.rs$/.test(e.name)) APP.rs += readFileSync(p, 'utf8') + '\n';
    }
  };
  walk(SRC);
  walk(join(ROOT, 'app', 'src-tauri', 'src'));
  const TAURI = read('app', 'frontend', 'src', 'lib', 'tauri.ts');
  const hostsOf = (src) => [...new Set([...src.matchAll(/http:\/\/([^/'"`\s:)<>,\\]+)/g)].map((m) => m[1]).filter((h) => !/^(127\.0\.0\.1|localhost)$/.test(h)))].sort().join(' ');
  // A line that is only a comment (it starts with //, /* or *, in TypeScript and Rust alike)
  // cannot open a connection. Read with them, two comments that quote a link (attest.ts,
  // detect.ts: "https://firm/sites/…", "https://urldefense…") made this fact false and the
  // HTTP law's controls pass (2026-09-24). A comment after code on the same line is still read,
  // so the fact errs toward failing.
  const codeLines = (s) => s.split('\n').filter((l) => !/^\s*(?:\/\/|\/\*|\*)/.test(l)).join('\n');
  /** every fetch() is a template that opens on the loopback address (or on `base`, which is it),
   *  every fetch() is such a template, and nothing else in the web side opens a connection */
  // The one https:// address the app's code may hold (2026-09-25): where Google publishes the
  // model file, which Setup and Settings show as text to copy. Its line is set aside, once, and
  // the name may appear only there and as {MODEL_URL} in a screen's markup, so the address is
  // never handed to fetch, window.open or anything else; a second definition, or an address
  // anywhere else, still fails the https:// test below.
  const MODEL_URL_LINE = /^export const MODEL_URL = '(https:\/\/huggingface\.co\/google\/[^'\s]+)';$/m;
  const modelUrlShownOnly = (ts) => (ts.match(/\bMODEL_URL\b/g) ?? []).length === (MODEL_URL_LINE.test(ts) ? 1 : 0) + (ts.match(/\{MODEL_URL\}/g) ?? []).length;
  const loopbackOnly = (ts, rs) => {
    const calls = [...ts.matchAll(/\bfetch\(\s*`([^`]*)`/g)].map((m) => m[1]);
    return calls.length > 0 && calls.length === (ts.match(/\bfetch\(/g) ?? []).length
      && calls.every((a) => a.startsWith('http://127.0.0.1:') || (a.startsWith('${base}') && /const base = `http:\/\/127\.0\.0\.1:/.test(TAURI)))
      && !/https:\/\//.test(codeLines(ts.replace(MODEL_URL_LINE, '') + rs)) && modelUrlShownOnly(ts)
      && !/XMLHttpRequest|sendBeacon|new WebSocket|new EventSource/.test(ts);
  };
  // What the partial-name check says it read (owner ruling 21): the fragment line and the ⚠ print
  // fragWhere and fragHow, which name the text exports, the saved .docx's other text parts, the
  // floors, and that it never reads inside a plain word of letters.
  // D12 (2026-09-25): not a watermark, a signer or a list's number text (D1J-F1); the words it
  // skips, surnames among them (D1J-F2); a handle or a tag only with a plain @ or # (D1L-4)
  const fragStated = (src) => /const fragWhere = fragDocx\s*\?\s*'the copied text and the \.txt, and the text of every other part of the saved \.docx \(a header, a footer, a note, a chart, SmartArt\), as it saves them, but not text Word keeps as a setting in the code of the file \(a watermark, the signer a signature line suggests, the text a list prints beside each number\)'\s*:\s*'the copied text and the \.txt';/.test(src)
    && /const fragHow = '[^']*, save a word it skips as too common to stand for a name alone, even where it is a surname: [^']*Bank, Road, Street, Place and Avenue; each from four letters, from two where the name and the copy both write it with an upper-case first letter, or from four digits;[^']*or a handle or a tag written with a plain @ or #; never inside a plain word of letters';/.test(src)
    && src.includes(' Read: ${fragWhere}, for ${fragHow}`') && src.includes('The check read {fragWhere}, for {fragHow}.');
  const namesAll = (scope) => RECEIPT_NAMES.every(([, re]) => re.test(scope));
  // and no longer the ligature, which owner ruling 19c closed
  const receiptOk = (scope) => namesAll(scope) && !/ligature/.test(scope);
  const keep = WRITER.match(/export const KEEP_FIELD = \/\^\\s\*\(([^)]*)\)/);
  const F = {
    reads: every(['nsDecl', 'mcList', 'elemName', 'schemaAttr', 'unkOfficeElemRow'], 'held'),
    // an element or attribute name under Word's namespace in Word's own parts is not read, nor
    // an unprefixed attribute on a shape; an unprefixed attribute on a w: element is
    officeNamesUnread: every(['wordElem', 'wordAttr', 'shapeAttr'], 'ships') && is('bareAttrW', 'held'),
    readsSafetyNet: /or the safety-net pattern still finds something it reads/.test(EXPORT),
    runMasked: every(['runBody', 'runHeader', 'runFooter', 'runTable', 'runFootnote', 'runEndnote', 'runTextBox'], 'masked')
      && !/margarettan/i.test(runTxt.red) && runTxt.verified,
    runHeldInCode: every(['lowerGlued', 'termAttr', 'plainInCode'], 'held'),
    floor: W.RUN_FLOOR,
    // a plain word of letters: any length ships, from both exports; under six inside an address too
    plainShips: every(['shortLiWu', 'shortTan', 'shortTanCap', 'plainTerm', 'plainRow', 'longGlued'], 'ships')
      && /LIWUCORP/.test(shortTxt[0].red) && /tanholdings/.test(shortTxt[1].red) && /Tanholdings/.test(shortTxt[2].red) && shortTxt.every((t) => t.verified)
      && /kestrelholdings/.test(plainTxt.term.red) && /margarettanfile/.test(plainTxt.row.red) && plainTxt.term.verified && plainTxt.row.verified,
    // found at a break, before a capitalised plural, and from six inside a token that is not prose
    breaksFound: every(['tokenTerm', 'hashTerm'], 'masked') && !/kestrel/i.test(plainTxt.token.red) && plainTxt.token.verified
      && plural.docx.body === 'The [Person1]s sued the smiths.' && plural.txt.red === 'The [Person1]s sued the smiths.',
    // closed by ruling 8: each of these is now kept
    tangGone: C.tang.body === 'Margaret Tang, not [Person1], signed.' && overTxt.tang.red === 'Margaret Tang, not [Person1], signed.',
    wongGone: C.wong.body === 'Wong Wei Ming gave evidence after [Person1].' && overTxt.wong.red === 'Wong Wei Ming gave evidence after [Person1].',
    porterGone: C.porter.body.includes('court reporter') && overTxt.porter.red.includes('court reporter'),
    overMc: C.mcdonald.body === 'Mc[Person1] met [Person1].' && overNow.mcdonald.red === 'Mc[Person1] met [Person1].',
    overLaws: C.laws.body === 'The [Person1]s Committee met. Mr [Person1] signed.' && overNow.laws.red === 'The [Person1]s Committee met. Mr [Person1] signed.',
    digitsFound: C.digits.body === 'Pay GB29NWBK601613[ID1], [ID1] or [ID1].' && digitsTxt.grouped.red === 'Pay GB29NWBK601613[ID1], [ID1] or [ID1].' && digitsTxt.grouped.verified,
    digitsCommaShips: is('digitsComma', 'ships') && digitsTxt.comma.red.includes('3192,6819') && digitsTxt.comma.verified,
    digitsOtherShips: every(['digitsComma', 'digitsUnderscore', 'digitsSpacedEn'], 'ships') && digitsTxt.other.red === DIGITS_OTHER && digitsTxt.other.verified,
    // owner ruling 19b: an em dash, a minus sign, a middle dot, " - ", ") " and a tab now group
    digitsWideFound: every(['digitsWide', 'digitsTab'], 'masked') && !/6819/.test(digitsTxt.wide.red) && digitsTxt.wide.verified,
    // owner ruling 19g: under six, masked alone in text, held where it is a whole value the writer
    // reads, and not found inside a longer number or value, under Office's prefixes, on a shape or
    // in a drawing's position
    shortDigitsShips: every(['shortDigitsIn', 'shortDigitsAttrIn', 'shortDigitsAttrWords', 'shortDigitsUnkIn', 'shortDigitsOffice', 'shortDigitsShape', 'shortDigitsPos', 'shortDigitsPct'], 'ships')
      && is('shortDigitsAlone', 'masked') && is('sixDigitsUnk', 'held')
      && shortDigitsTxt.inside.red.includes('9944179') && shortDigitsTxt.inside.verified && shortDigitsTxt.alone.red === 'Matter [ID1] filed.',
    shortDigitsWholeHeld: every(['shortDigitsAttr', 'shortDigitsUnk', 'shortDigitsOfficeElem'], 'held'),
    // owner ruling 19a
    longFormWhole: longForm.docx.body === '[Company1] signed. [Company1] paid.' && longForm.txt.red === '[Company1] signed. [Company1] paid.' && longForm.txt.verified,
    hyphenShips: is('hyphenIn', 'ships') && is('softHyphen', 'masked') && hyphenTxt.every((t) => t.verified && t.red.includes('ret Tan agreed')),
    // owner ruling 19c
    ligGone: is('ligBody', 'masked') && is('ligAttr', 'held') && ligTxt.red === 'Mr [Person2] signed. Mr [Person2] agreed.' && ligTxt.verified,
    ppTextHolds: is('ppBadByte', 'held') && Object.values(ppTxt).every((t) => t.blocked) && badByteTxt.blocked,
    // owner ruling 19d: "&nbsp" and a reference by number are read without the semicolon
    refNoSemiRead: every(['refNoSemi', 'refNumNoSemi'], 'masked') && !/Margaret/.test(refTxt.noSemi.red + refTxt.numNoSemi.red) && refTxt.noSemi.verified && refTxt.numNoSemi.verified,
    refShips: every(['refNameNoSemi', 'refUndefined', 'refTwice'], 'ships') && is('pctNbsp', 'masked')
      && refTxt.nameNoSemi.red.includes('Ren&eacute Tan') && refTxt.undefined.red.includes('Margaret&NBSP;Tan') && refTxt.twice.red.includes('Ren&amp;eacute; Tan')
      && [refTxt.nameNoSemi, refTxt.undefined, refTxt.twice].every((t) => t.verified),
    // owner ruling 19f
    phoneOfficeElemHeld: every(['phoneOfficeElem', 'phoneOfficeElemSep'], 'held') && is('phoneDigitsText', 'masked') && is('phonePos', 'ships'),
    spacedShips: is('spaced', 'ships') && spacedTxt.red.includes('M a r g a r e t T a n') && spacedTxt.verified,
    bracketShips: is('bracketed', 'ships') && is('circled', 'masked') && bracketTxt.bracketed.red === BRACKETED && bracketTxt.bracketed.verified && bracketTxt.circled.red === 'Signed: [Person1].',
    brokenShips: every(['brokenName', 'brokenNoScheme'], 'ships') && is('brokenEscape', 'masked')
      && brokenTxt.name.red.includes('Marg\naret Tan') && brokenTxt.noScheme.red.includes('Margaret%2\n0Tan') && !/Margaret/.test(brokenTxt.escape.red)
      && Object.values(brokenTxt).every((t) => t.verified),
    symShips: is('symSymbol', 'ships') && is('symArial', 'held'),
    brokenQuotedShips: is('brokenQuoted', 'ships') && brokenTxt.quoted.red.includes('Margaret%2\n> 0Tan') && brokenTxt.quoted.verified,
    digitsLookShips: is('digitsLook', 'ships') && C.digitsLook.body === DIGITS_LOOK && is('digitsBr', 'ships')
      && digitsTxt.look.red === DIGITS_LOOK && digitsTxt.look.verified && digitsTxt.lf.red === 'Ref 3192\n6819 paid.' && digitsTxt.lf.verified,
    bidiShips: every(Object.keys(BIDI), 'ships') && every(Object.keys(ZW), 'masked')
      && Object.entries(BIDI).every(([k, ch]) => markTxt[k].red.includes(`Mar${ch}garet Tan`) && markTxt[k].verified)
      && Object.keys(ZW).every((k) => markTxt[k].red === 'Client: [Person1] signed.' && markTxt[k].verified),
    // the check reads a header's text and not a watermark, a signer or a list's number text, each
    // of which the saved file carries (D1J-F1)
    fragCodeUnread: JSON.stringify(frag.header.frags) === '["Kierkegaard"]'
      && [frag.watermark, frag.signer, frag.listNumber].every((f) => Array.isArray(f.frags) && f.frags.length === 0)
      && frag.watermark.raw.includes('PREPARED FOR MR KIERKEGAARD') && frag.signer.raw.includes('suggestedsigner="Mr Kierkegaard"') && frag.listNumber.raw.includes('Kierkegaard %1.'),
    // "Ms Street" is skipped beside a masked "Della Street"; "Mr Weber" is flagged (D1J-F2)
    fragStopSkips: JSON.stringify(frag.street.frags) === '[]' && frag.street.readable.includes('Later Ms Street replied.') && JSON.stringify(frag.weber.frags) === '["Weber"]',
    overHash: C.hashOver.body === 'The #sup[Person1]s met Mr [Person1].' && overNow.hash.red === 'The #sup[Person1]s met Mr [Person1].',
    // percent-escapes and character references are read as what they write (owner ruling 10)
    pctMasked: every(['pctBody', 'pctNbsp', ...Object.keys(PCT_MORE), 'pctTerm'], 'masked') && every(['pctNs', 'pctAttr'], 'held')
      && !pctTxt.red.includes('Margaret%20Tan') && pctTxt.verified && !/Margaret/.test(nbspTxt.red) && nbspTxt.verified
      && Object.entries(PCT_MORE).every(([k, c]) => !pctMoreTxt[k].red.includes(c.needle) && pctMoreTxt[k].verified && pctMoreTxt[k].intake === 'text') && pctIntake === 'text',
    pctBadByteHolds: is('badByte', 'held') && (badByteTxt.blocked || !badByteTxt.verified),
    pctIntake: pctRoutes.asciiLetters === 'refuse' && pctRoutes.cjkOutsideLink === 'refuse' && pctRoutes.cjkInLink === 'text' && pctRoutes.accentOutsideLink === 'text' && pctRoutes.space === 'text',
    eqInlineMasked: every(['eqBox', 'eqBorderBox', 'eqBar', 'eqAcc', 'eqGroupChr', 'eqEmptyDelim'], 'masked'),
    eqApartShips: every(['eqFrac', 'eqSup', 'eqMatrix'], 'ships'),
    leeShips: is('lee', 'ships'),
    phoneOfficeShips: every(['phoneW', 'phoneShape'], 'ships') && every(['phoneAttr', 'phoneElem'], 'held') && is('phoneText', 'masked'),
    craftedShips: every(['wordElem', 'wordAttr'], 'ships') && every(['bareAttrW', 'declEnc'], 'held'),
    msoGone: is('msoPI', 'masked'),
    chartMasked: every(['chartSSN', 'chartPhone', 'chartEmail'], 'masked'),
    unkHolds: every(['unkPhone', 'unkElem', 'unkCurrency', 'unkText', 'unkTyped', 'unkOfficeElemRow'], 'held'),
    unkCodeKept: every(['unkLowerAttr', 'unkCamelAttr', 'unkLowerElem', 'unkLowerAttrName', 'unkLowerPrefix', 'unkHostW3', 'unkOfficeElem', 'unkDigitsText', 'unkNsUri', 'unkPartName'], 'ships')
      && 'word/Whitfield.xml' in (C.unkPartName.raw ?? {})
      && every(['unkCamelText', 'unkCapElem', 'unkHostCap', 'unkHostText'], 'held'),
    receiptNames: receiptOk(SCOPE),
    fragStated: fragStated(EXPORT),
    receiptWords: SCOPE_WORDS.every((w) => SCOPE.includes(w)) && EXPORT.includes('${docxSave ? ` ${docxScope}` : \'\'}'),
    httpHosts: hostsOf(APP.ts + APP.rs),
    httpNoRequest: loopbackOnly(APP.ts, APP.rs),
    warnEvery: Object.values(WARN).every(Boolean),
    noteVerbatim: /is a part this writer does not know\./.test(WRITER) && !/the check of the copy read all of it/.test(WRITER)
      && /\$\{r\.notes\.length \? ` \$\{r\.notes\.join\(' '\)\}` : ''\}/.test(EXPORT) && /`redacted \.docx: \$\{dryNow\.report\.notes\.join\(' '\)\}`/.test(EXPORT),
    footerOnlyShips: is('footerOnly', 'ships') && is('footerTerm', 'masked'),
    sideMasked: is('footerSide', 'masked'),
    sideHeld: typeof SIDE_HELD_BY.unread === 'string' && SIDE_HELD_BY.unread.includes('The .docx is held') && SIDE_HELD_BY.unread.includes('the request to the engine failed')
      && typeof SIDE_HELD_BY.waiting === 'string' && SIDE_HELD_BY.read === null && SIDE_HELD_BY.notRun === null
      && typeof SIDE_HELD_BY.unused === 'string' && SIDE_HELD_BY.unused.startsWith('the app could not use the engine’s read of the text the saved .docx carries outside its body') && SIDE_HELD_BY.unused.includes('The .docx is held'),
    refUnlinked: !!keep && !/\bREF\b|HYPERLINK/.test(keep[1]) && /PAGEREF/.test(keep[1]) && /NOTEREF/.test(keep[1]) && /\bTOC\b/.test(keep[1])
      && /\(a REF field\) \$\{plural\(r, 'was', 'were'\)\} written out as the text/.test(WRITER),
    tocLinksGo,
    intake: T.detectFormat(enc('Memo.\n<~87cURD]i,"Ebo80~>\nEnd.'), 'memo.txt').route === 'text'
      && T.detectFormat(enc(`Memo.\n\nPayor ref: ${b64}\n\nRegards.`), 'memo.txt').route === 'refuse'
      && /the page is left out/.test(PDF) && /is not included: this app could not read it\]/.test(STORE),
    keyLists: /'# Left readable by your decision'/.test(EXPORT) && /leftReadable:/.test(EXPORT),
    rustGate: /name: 'rust-unit'/.test(VERIFY) && /cmd: \['cargo', \['test'/.test(VERIFY),
    noChainRun: /no run of\s+the frozen chain through the relay against a live model server is recorded/.test(FREEZE) && /needs a built binary and is not run here/.test(SVC_AUTH),
    perDocRun: /const run = coreRun\(\);/.test(ENGINE) && /inAppCoreStamp\(doc, \{ complete: m\.complete, run \}\)/.test(ENGINE),
    handOutlives: /t\.service === 'hand'\s*\?\s*' Closing this app does not stop that service: it keeps running until it is stopped where it was started[^']*any program running as you can read its token file and send it text\.'/.test(STATUS)
      && /settings: `Running — \$\{said\}\$\{outlives\}/.test(STATUS),
    leftOnDisk: /: failed \? 'the engine service reported that its working copy of this document, and the key from its tags back to the original words, were left on this computer’s disk; ' \+ named/.test(STATUS)
      && /: stop \? 'the frozen run’s working copy of this document, and the key from its tags back to the original words, were left on this computer’s disk when the run was stopped; ' \+ named/.test(STATUS)
      && /const named = parsed\.runService\s*\?\s*'the engine service printed the folder in the window it was started from'\s*:\s*'the engine’s log names the folder: legal-serve\.log, in the logs folder the History screen gives, which is rewritten each time the app starts the service; that start removes the folder or names it there again';/.test(STATUS)
      && /working files were left on disk \(named in the engine service's output: legal-serve\.log when the app started it, else the window it runs in\) — \$\{dir\}/.test(SERVE) && /engine: \$\{eng\.label\}\$\{eng\.detail/.test(EXPORT),
    edgar45: edgarIn('round5') + edgarIn('round6') + edgarIn('round7') === 45 && pureoos.length === 1 && /46 unseen documents — rounds 5, 6, 7 and the pure-OOS probe/.test(FREEZE),
    freezeC9: /\*\[7, not 8 — see C9\]\*/.test(FREEZE) && /The file of record says 7/.test(FREEZE),
    utilityPreFreeze: util.aggregateUtility === 0.968 && util.perDoc.length === 25 && /raw\/stripped\/r4-edgar-FINAL/.test(read('pii-bench', 'utility-bench', 'harness-v1.js')),
  };

  // ---- the release, the licence, the model's address, the security channel (2026-09-25) --------
  // Owner rulings 28 and 30: Apache-2.0 and no end-user licence; v0.1.0 unsigned, offered only at
  // GitHub Releases, and every page that offers it says SmartScreen will warn; the model only
  // from Google's own address, the one the app shows; security reports only through GitHub's
  // private vulnerability reporting, with support@simpler.asia the one e-mail address (ruling 30 as
  // the owner amended it on 2026-09-25). Each fact is read from the file that
  // makes it so, and each page sentence below is held to it both ways.
  const CONF = JSON.parse(read('app', 'src-tauri', 'tauri.conf.json'));
  const MAIN_RS = read('app', 'src-tauri', 'src', 'main.rs');
  const TPN = read('THIRD_PARTY_NOTICES.md');
  const README = read('README.md');
  const SETUP = read('app', 'frontend', 'src', 'screens', 'Setup.tsx');
  const SETTINGS = read('app', 'frontend', 'src', 'screens', 'Settings.tsx');
  const orEmpty = (...p) => (existsSync(join(ROOT, ...p)) ? read(...p) : '');
  const SECURITY = orEmpty('SECURITY.md');
  const PRIVACY = orEmpty('PRIVACY.md');
  const RELEASES = 'https://github.com/Simpler-Systems/simpler-legal/releases/latest';
  const ADVISORY = 'https://github.com/Simpler-Systems/simpler-legal/security/advisories/new';
  const UNSIGNED = `v${CONF.version}, Windows, unsigned: Windows SmartScreen will warn`;
  const MODEL_URL = (APP.ts.match(MODEL_URL_LINE) ?? [])[1] ?? '';
  const MODEL_FILE = (MAIN_RS.match(/const MODEL_FILE: &str = "([^"]+)";/) ?? [])[1] ?? '';
  const MODEL_SHA = (MAIN_RS.match(/const MODEL_SHA256: &str = "([0-9a-f]{64})";/) ?? [])[1] ?? '';
  /** one NSIS installer, per user, and nothing in the configuration signs it */
  const releaseFact = (conf) => {
    const w = conf.bundle?.windows ?? {};
    return JSON.stringify(conf.bundle?.targets) === '["nsis"]' && w.nsis?.installMode === 'currentUser'
      && !w.certificateThumbprint && !w.signCommand && !w.timestampUrl && !conf.bundle?.createUpdaterArtifacts && !conf.plugins?.updater;
  };
  /** LICENSE is the Apache License 2.0, and every manifest says so. The installer's licence page
   *  (bundle.licenseFile, relative to app/src-tauri) is LICENSE's text, then the section on the
   *  three Microsoft Visual C++ runtime files in the llama folder that Microsoft's terms require
   *  (owner ruling of 2026-09-25; tools/derive-notice.mjs checks the section's contents) */
  const LICENCE_SECTION = 'Microsoft Visual C++ runtime files in the llama folder';
  const LICENCE_PAGE_SENTENCE = 'The installer\'s licence page is the Apache-2.0 text, followed by the terms Microsoft requires users to accept for the three Visual C++ runtime files beside llama.cpp; there is no separate end-user licence for this product\'s own code.';
  const licencePageOf = (conf) => (typeof conf.bundle?.licenseFile === 'string' ? orEmpty('app', 'src-tauri', ...conf.bundle.licenseFile.split('/')) : '');
  const apacheFact = (conf, license, page = licencePageOf(conf)) => /^\s*Apache License\s+Version 2\.0, January 2004/.test(license)
    && conf.bundle?.license === 'Apache-2.0'
    && page.startsWith(license) && page.slice(license.length).includes(LICENCE_SECTION)
    && [read('package.json'), read('app', 'frontend', 'package.json')].every((p) => JSON.parse(p).license === 'Apache-2.0')
    && /^license = "Apache-2\.0"$/m.test(read('app', 'src-tauri', 'Cargo.toml'));
  /** Google's repository, one revision, the pinned file's name; the same address and pin in the
   *  notices and the README; shown on Setup and Settings and never handed to anything */
  const modelUrlFact = (url, ts, settings = SETTINGS) => url === `https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/${(url.match(/\/resolve\/([0-9a-f]{40})\//) ?? [])[1]}/${MODEL_FILE}`
    && MODEL_FILE !== '' && TPN.includes(`<${url}>`) && README.includes(`<${url}>`) && TPN.includes(MODEL_SHA) && README.includes(MODEL_SHA)
    && SETUP.includes('<ModelUrl />') && settings.includes('<ModelUrl />') && modelUrlShownOnly(ts);
  /** SECURITY.md gives the private-reporting address, and no e-mail address but the support one
   *  (owner, 2026-09-25). The whole domain is read, so the support address inside a longer one
   *  fails, and so does a mailto: link. PRIVACY.md exists */
  const SUPPORT = 'support@simpler.asia';
  const securityFact = (sec, priv) => sec.includes(`<${ADVISORY}>`)
    && (sec.match(/mailto:|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g) ?? []).every((m) => m === SUPPORT) && priv !== '';
  /** llama.cpp reads LLAMA_ARG_RPC (work sent to other computers) and LLAMA_ARG_HF_REPO,
   *  LLAMA_ARG_MODEL_URL and the like (a model download) from its environment. 'none': the app
   *  names none of them and does not set LLAMA_OFFLINE (the pages state the gap); 'all': it names
   *  every one and sets LLAMA_OFFLINE (the pages must not); 'partial': no sentence on the pages
   *  describes that, so the law fails until the pages and the code agree again. */
  const LLAMA_NET = ['LLAMA_ARG_RPC', 'LLAMA_ARG_HF_REPO', 'LLAMA_ARG_HF_FILE', 'LLAMA_ARG_MODEL_URL', 'LLAMA_ARG_MMPROJ_URL', 'LLAMA_ARG_DOCKER_REPO'];
  const llamaNetState = (rs) => {
    const n = LLAMA_NET.filter((v) => rs.includes(`"${v}"`)).length + (/cmd\.env\("LLAMA_OFFLINE", "1"\)/.test(rs) ? 1 : 0);
    return n === 0 ? 'none' : n === LLAMA_NET.length + 1 ? 'all' : 'partial';
  };
  const llamaGapFact = (rs) => llamaNetState(rs) === 'none';
  const F2 = {
    release: releaseFact(CONF),
    apache: apacheFact(CONF, read('LICENSE')),
    modelUrl: modelUrlFact(MODEL_URL, APP.ts),
    security: securityFact(SECURITY, PRIVACY),
    llamaGap: llamaGapFact(APP.rs),
    llamaNet: llamaNetState(APP.rs),
  };

  // ---- the pages -----------------------------------------------------------------------------
  const visible = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  // the visible text of each page; the raw HTML beside it (idxH, itH, resH) for links and
  // comments; PRIVACY.md as plain words (its backticks dropped)
  const HTML = { idx: read('site', 'index.html'), it: read('site', 'it.html'), res: read('site', 'research.html') };
  const PAGES = { idx: visible(HTML.idx), it: visible(HTML.it), res: visible(HTML.res), idxH: HTML.idx, itH: HTML.it, resH: HTML.res, privacy: PRIVACY.replace(/`/g, '').replace(/\s+/g, ' '), readme: README.replace(/`/g, '').replace(/\s+/g, ' ') };
  const faqOf = (idx) => (idx.match(/What files does it read\?(.*?)What does it cost\?/) ?? ['', ''])[1];
  const moralOf = (idx) => (idx.match(/Simpler Legal never draws boxes over your document\.(.*?)explicitly say so\./) ?? ['', ''])[1];
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const SIX = words[F.floor] ?? String(F.floor);

  /** a page sentence that states a fact: present exactly when the fact holds */
  const says = (bad, label, fact, present) => {
    if (fact && !present) bad.push(`${label}: the code does this and the page does not say so`);
    if (!fact && present) bad.push(`${label}: the page says this and the code no longer does it (closed in code, or the code moved); take the sentence off or re-measure`);
  };
  /** a sentence that must never be on the page while the fact holds */
  const never = (bad, label, fact, present) => {
    if (!fact) bad.push(`${label}: the code fact behind this law is gone; re-read the sentence it guards`);
    else if (present) bad.push(`${label}: the page still says what the code no longer does`);
  };
  const has = (s, t) => s.includes(t);

  // Each law: [name, check(V) -> problems, controls: [name, V -> V']]
  const drop = (field, t) => (V) => { if (!V[field].includes(t)) throw new Error(`control anchor gone from ${field}: ${t.slice(0, 80)}`); return { ...V, [field]: V[field].split(t).join('') }; };
  const putBack = (field, anchor, add) => (V) => { if (!V[field].includes(anchor)) throw new Error(`control anchor gone from ${field}: ${anchor.slice(0, 80)}`); return { ...V, [field]: V[field].replace(anchor, anchor + add) }; };
  const swap = (field, from, to) => (V) => { if (!V[field].includes(from)) throw new Error(`control anchor gone from ${field}: ${from.slice(0, 80)}`); return { ...V, [field]: V[field].split(from).join(to) }; };

  const READS = 'The finished file is read again: every part and the part\'s name, its text, every attribute value, the names of its elements and attributes (in the parts Word writes, not a name under one of Office\'s own namespaces), and the namespaces it declares or lists.';
  const READS_UNQUALIFIED = 'every attribute value, the names of its elements and attributes, and the namespaces it declares or lists.';
  const RUN = 'is masked in the text a reader sees, in the text export too, and holds the export wherever else the check finds it.';
  // owner ruling 8: where a name is found inside a word in text a reader sees, and what ships
  const BREAKS = `In the text a reader sees, a name is found inside a longer word only where a break marks both its ends — a space or punctuation mark, letters meeting digits, a capital after a small letter — or before a plural ending when it is written with its capital (the Smiths where the table says Smith), or, from ${SIX} letters and digits, inside a web or e-mail address, a path, a handle, a tag or a word with a digit in it (www.kestrelcorp.com, @kestrelholdings or #kestrelholdings where the list says Kestrel).`;
  // the second pass's, before owner ruling 18 read a tag as a handle is read
  const BREAKS_R8 = BREAKS.replace('a handle, a tag or', 'a handle or').replace('www.kestrelcorp.com, @kestrelholdings or #kestrelholdings', 'www.kestrelcorp.com or @kestrelholdings');
  const FLOOR = `Run into a plain word of letters where nothing marks both its ends, a name of any length ships, in the text export as well, and the check passes (kestrelholdings where the list says Kestrel, margarettanfile where the table says Margaret Tan, tanholdings or Tanholdings where it says Tan, LIWUCORP where it says Li Wu), and so does a name under ${SIX} letters inside an address (tanholdings.com).`;
  const FLOOR_MORAL = 'A name run into a plain word of letters where nothing marks both its ends is a second: kestrelholdings where the list says Kestrel, or tanholdings where the table says Tan, is not masked in the text export or in the .docx, and the check passes.';
  // the round-6 sentence: a floor with no plain-word rule, which said a name of six or more was found
  const FLOOR_OLD = /a name is found only from \w+ letters and digits, so a shorter one ships|So is a name shorter than \w+ letters run into another word/;
  // ruling 8 closed these; the sentences that stated them must stay off
  const OVER_OLD = /Margaret Tang becomes|Wong Wei Ming becomes|turns reporter into/;
  const MC = 'A row is found in a longer name where a capital marks where it starts: with Donald in the table, McDonald becomes Mc[Person1].';
  const LAWS_OVER = 'And a row is found before a plural ending on a word written with its capital: with Law in the table, the Laws Committee becomes the [Person1]s Committee.';
  // owner ruling 18: a tag is a token that is not prose, so a row of six letters is found inside it
  const HASH_OVER = `And inside a tag, as inside an address or a handle, a row of ${SIX} letters or more is found wherever it stands: with Porter in the table, #supporters becomes #sup[Person1]s.`;
  const OVER_TXT = 'All three happen in the text export too, and the AI you hand the copy to may read someone else, or something else, as the person in your table.';
  const MC_MORAL = 'A table row can also reach into a different, longer name: with Donald in the table, McDonald becomes Mc[Person1], and the two read as one.';
  // owner ruling 9: a row of digits alone
  // The second pass (D1J-1) named the separators DIGIT_SEP holds: "one space … or dash" said more
  // than it does, since an em dash, a minus sign, a tab and nine other characters ship.
  // Owner ruling 19b widened DIGIT_SEP; the marks named here are the ones driven (D1, 2026-09-24).
  const DIGITS_FAQ = `A row of digits alone, such as an account or matter number you add to the table, is found from ${SIX} digits wherever they stand together, inside a longer number or a reference too (an IBAN that ends in it), and in the text a reader sees also across one mark that groups them: a space of any kind or a tab, a full stop, a middle dot or the bullet (•), a slash, a hyphen, a dash or the minus sign, a hyphen with a plain space either side (3192 - 6819), or a round closing bracket and one plain space after the first group, as (3192) 6819 is written; grouped any other way — with a comma (3192,6819), an underscore, a colon, two spaces, a line break, an en or em dash or a slash with a space either side (3192 – 6819, as a range is written), a square bracket ([3192] 6819), a no-break space beside a bracket or a hyphen, or a mark that only looks like one of those (a fraction slash, an ideographic or small full stop, a swung dash, a heavy minus sign, a white, black or triangular bullet: 3192⁄6819, 3192。6819, 3192◦6819) — it ships from both exports, and the check passes.`;
  // round 7's first pass (D1): "a dot" and "a bullet" where a small full stop and a white bullet ship (D1J-F3, D1L-2)
  const DIGITS_FAQ_R9 = `A row of digits alone, such as an account or matter number you add to the table, is found from ${SIX} digits wherever they stand together, inside a longer number or a reference too (an IBAN that ends in it), and in the text a reader sees also across one mark that groups them: a space of any kind or a tab, a dot, a slash, a hyphen, a dash or a minus sign, a middle dot or a bullet, a hyphen with a space either side (3192 - 6819), or a closing bracket and a space after the first group, as (3192) 6819 is written; grouped any other way — with a comma (3192,6819), an underscore, a colon, two spaces, or an en or em dash or a slash with a space either side (3192 – 6819, as a range is written) — it ships from both exports, and the check passes.`;
  // the second pass's: an em dash, a minus sign and a tab have been found since owner ruling 19b
  const DIGITS_R6 = `A row of digits alone, such as an account or matter number you add to the table, is found from ${SIX} digits wherever they stand together, inside a longer number or a reference too (an IBAN that ends in it), and in the text a reader sees also when one plain, no-break or thin space, a dot, a slash, a hyphen or an en dash groups them; grouped any other way — with a comma (3192,6819), an em dash (3192—6819), a minus sign, a tab or another kind of space — it ships from both exports, and the check passes.`;
  const DIGITS_R7 = `and in the text a reader sees also when one space, dot, slash, hyphen or dash groups them; grouped with a comma (3192,6819) it ships from both exports, and the check passes.`;
  // D1L-3, owner ruling 19g: under six digits the row holds where it is a whole value the check reads
  const DIGITS_SHORT = `A row of fewer than ${SIX} digits, such as a five-digit matter number, is masked where it stands alone in the text, and holds the export where it is the whole of a value in the file's code that the check reads (in an add-in's attribute, in a part this app does not know, or between the tags of an element under one of Office's own namespaces); it is not looked for inside a longer number or value (9944179, or Matter 44179 as one value, where the table says 44179), in an attribute under one of Office's own prefixes (w:tel) or with no prefix on a drawn shape, or in a drawing's position, size or share of the page: there it ships, and the check passes.`;
  // round 7's first pass: a drawing's position only, where its size as a share of the page ships too (D1L-5)
  const DIGITS_SHORT_R9 = `A row of fewer than ${SIX} digits, such as a five-digit matter number, is masked where it stands alone in the text, and holds the export where it is the whole of a value in the file's code that the check reads (in an add-in's attribute, in a part this app does not know, or between the tags of an element under one of Office's own namespaces); it is not looked for inside a longer number or value (9944179, or Matter 44179 as one value, where the table says 44179), in an attribute under one of Office's own prefixes (w:tel) or with no prefix on a drawn shape, or in a drawing's position on the page: there it ships, and the check passes.`;
  const DIGITS_SHORT_R8 = `A row of fewer than ${SIX} digits, such as a five-digit matter number, is masked where it stands alone in the text, but is not looked for inside a longer number (9944179 where the table says 44179), in an add-in's value in the file's code, or in a part this app does not know: there it ships, and the check passes.`;
  const UNK_READ = `What is kept is read by the check for your table's names (a row of digits alone under ${SIX} digits only where it is the whole of a value) and by the safety-net pattern,`;
  const UNK_READ_R8 = `What is kept is read by the check for your table's names (a row of digits alone only from ${SIX} digits) and by the safety-net pattern,`;
  // D1J-4 / D1L-6, owner ruling 19a: the designator written out is found, and masked with the name
  const LONG = 'A name that ends in a short designator is found with the designator written out, and the whole word is masked with it: with Hickson Corp in the table, Hickson Corporation becomes [Company1], in the text export too.';
  const LONG_R8 = 'A name that ends in a short designator is found with the designator written out, but only the letters the table writes are masked: with Hickson Corp in the table, Hickson Corporation becomes [Company1]oration, in the text export too.';
  // D1L-7, D1J-6: ways a name ships, each from the text export too
  const HYPHEN = 'when a hyphen stands inside one of its words (Marga-ret Tan, as text copied from a PDF keeps a line\'s break), in the text export too;';
  // D1J-F4: an invisible direction mark inside a name's letters
  const BIDI_FAQ = 'when an invisible mark that sets the direction or format of text stands inside one of its words (a left-to-right mark, as text pasted from a right-to-left document can carry), in the text export too;';
  // closed by owner ruling 19c; must stay off
  const LIG = 'when it is written with a ligature, the single character text copied from a PDF often puts for fi, ff or ffi (Griﬃths where the table says Griffiths), in the text export and in the file\'s code too;';
  const REFS = 'when it is written with a character reference that has lost its semicolon, other than &nbsp or one by number, that HTML does not define, or that was escaped again (Ren&eacute Tan, Margaret&NBSP;Tan, Ren&amp;eacute; Tan), in the text export too;';
  // the second pass's: "&nbsp" without its semicolon has been read since owner ruling 19d
  const REFS_R8 = 'when it is written with a character reference that has lost its semicolon or was escaped again (Margaret&nbspTan, Ren&amp;eacute; Tan), in the text export too;';
  // symText gives no letter for the Symbol font, which draws Greek (a w:sym letter elsewhere holds)
  const SYM = 'when a letter of it is written as a symbol in the Symbol font, which Word draws as the Greek capital shaped like the Latin one (the A of Margaret TΑn), in the .docx;';
  // D1J-2: a mail gateway's rewrite of the same bad escape; engine.ts holds only on '%'
  const PCT_PP = 'Written as a mail gateway rewrites a link (Proofpoint\'s Ren*E9*20Tan or Ren-E9-20Tan), the same escape holds both exports too.';
  // owner ruling 17 (LINK_BROKEN): read across a break inside an escape, only in a link with a
  // scheme or "www."; never across one inside a name's own letters
  const PCT_BREAK = 'A line break that a mail program\'s wrap put inside an escape, or inside a mail gateway\'s wrapping of a link, is read across where the link starts with a scheme (https://) or www., and the name is masked; in a link that starts with neither, or where the line after the break starts with a quote mark (>), as each line of a quoted reply does, a name broken that way ships from both exports, and so does a name with a line break inside its own letters (Marg and aret Tan on two lines), in a link or in prose.';
  // round 7's first pass: no word of a quoted reply, where the break is not read across (D1L-1)
  const PCT_BREAK_R9 = 'A line break that a mail program\'s wrap put inside an escape, or inside a mail gateway\'s wrapping of a link, is read across where the link starts with a scheme (https://) or www., and the name is masked; in a link that starts with neither, a name broken that way ships from both exports, and so does a name with a line break inside its own letters (Marg and aret Tan on two lines), in a link or in prose.';
  // letters spaced apart, or each in brackets
  const SPACED = 'when its letters are spaced apart in the text or each written in brackets (M a r g a r e t T a n, ⒨⒜⒭⒢⒜⒭⒠⒯ ⒯⒜⒩), in the text export too;';
  const SPACED_R8 = 'when its letters are spaced apart in the text (M a r g a r e t T a n), in the text export too;';
  const SPACED_MORAL = 'So is a name typed with its letters spaced apart.';
  // owner ruling 10: percent-escapes and character references; 19d: "&nbsp" and a reference by
  // number without the semicolon
  const PCT_NOW = 'A name written with percent-escapes, as a web link writes a space (Margaret%20Tan), an apostrophe, an accented letter (M%C3%BCller for Müller) or a Chinese name, or with a character reference typed out, with its semicolon or, for &nbsp and a reference by number, without it (Margaret&nbsp;Tan, Margaret&nbspTan, Margaret&#160Tan), is read as the characters it writes: it is masked in both exports, the escapes with it, and holds the export in the file\'s code.';
  const PCT_NOW_R8 = 'A name written with percent-escapes, as a web link writes a space (Margaret%20Tan), an apostrophe, an accented letter (M%C3%BCller for Müller) or a Chinese name, or with a character reference typed out (Margaret&nbsp;Tan), is read as the characters it writes: it is masked in both exports, the escapes with it, and holds the export in the file\'s code.';
  const PCT_BAD = 'An escape that writes no character where a name could stand (Ren%E9%20Tan where the table says René Tan) holds both exports.';
  const PCT_INTAKE = 'A file is held when a run of characters written as % and two hexadecimal digits spells two or more plain Latin letters or digits, or, outside a web link or a file path, two or more letters of another script such as Chinese; an escaped space or punctuation mark, an escaped accented letter, and escaped letters of another script inside a link or a path go through on one line, except in a file name with a bare comma or semicolon in it, which is held, and a name written that way is masked in both exports, the escapes with it (see below); printed across rows, such a link can still be held.';
  // the round-4/5/6 wording that said a percent-escaped name ships
  const PCT_SHIPS_OLD = /when its spaces are written as %20|written with %20 for its spaces|when some of its characters are written as % and two hexadecimal digits|and a name written that way ships|in a namespace address an add-in declared|characters written as % and two hexadecimal digits, as a pasted web link writes/;
  const RECEIPT = `The receipt states what the check reads and what it does not, and names the blind spots below that concern the check itself: a name split between the parts of an equation; a name with its letters spaced apart or each in brackets, with a hyphen, a line break or an invisible direction or format mark inside one of its words, broken across the lines of a quoted reply, or with a letter written as a symbol in the Symbol font; a name run into a plain word of letters; a name under ${SIX} letters inside an address or in a value in the file's code; a row masked inside a longer name; a row of digits alone under ${SIX} digits inside a longer number or value, or grouped other than by the marks it lists; a character reference without its semicolon (other than &nbsp and one by number), one HTML does not define, or one escaped again; a name under one of Office's own namespaces; and a number under one of Office's own prefixes or in a drawing's position, size or share of the page.`;
  // round 7's first pass: without the direction mark, the quoted reply, or a drawing's size
  const RECEIPT_R9 = `The receipt states what the check reads and what it does not, and names the blind spots below that concern the check itself: a name split between the parts of an equation; a name with its letters spaced apart or each in brackets, with a hyphen or a line break inside one of its words, or with a letter written as a symbol in the Symbol font; a name run into a plain word of letters; a name under ${SIX} letters inside an address or in a value in the file's code; a row masked inside a longer name; a row of digits alone under ${SIX} digits inside a longer number or value, or grouped other than by the marks it lists; a character reference without its semicolon (other than &nbsp and one by number), one HTML does not define, or one escaped again; a name under one of Office's own namespaces; and a number under one of Office's own prefixes or in a drawing's position on the page.`;
  // the second pass's list: a ligature and digits in an Office element, closed by owner ruling 19
  const RECEIPT_R8 = `The receipt states what the check reads and what it does not, and names the blind spots below that concern the check itself: a name split between the parts of an equation; a name with its letters spaced apart, with a hyphen inside one of its words, or written with a ligature; a name run into a plain word of letters; a name under ${SIX} letters inside an address or in a value in the file's code; a row masked inside a longer name; a row of digits alone under ${SIX} digits, or grouped other than by the characters it lists; a character reference without its semicolon or escaped again; a name under one of Office's own namespaces; and a number under one of Office's own prefixes or written as digits alone in one of Office's own elements.`;
  // the first-pass list of six (D1J-5: the paragraph below it stated more than six)
  const RECEIPT_R7 = 'The receipt states what the check reads and what it does not, and names the blind spots below that concern the check itself: a name split between the parts of an equation, a name with its letters spaced apart, a name run into a plain word of letters, a row masked inside a longer name, a name under one of Office\'s own namespaces, and a number under one of Office\'s own prefixes.';
  const RECEIPT_OLD = 'The receipt states what the check reads and what it does not, but it does not name three of the cases below: a name written with percent-escapes, a name split between the parts of an equation, and a row masked inside a longer name.';
  const HTTP = 'The other http:// strings in the app\'s source code (app/frontend/src, app/src-tauri/src) name four hosts, schemas.openxmlformats.org, schemas.microsoft.com, purl.org and www.w3.org: they are the addresses of the XML namespaces Word and Office files use, which the .docx writer and its check recognise, and examples of such addresses in the text of the .docx receipt. None of them is requested.';
  const HTTP_HOSTS = 'purl.org schemas.microsoft.com schemas.openxmlformats.org www.w3.org';
  const EQ = 'when it is split between separate parts of an equation, such as a fraction\'s top and bottom, a base and its superscript, or two cells of a matrix;';
  const EQ_MORAL = 'a name split between separate parts of an equation, such as a fraction\'s top and bottom, ships, and the check passes.';
  const LEE = `when it is shorter than ${SIX} letters and a program wrote it in lower case as a value in the code of one of Word's own parts (lee where the table says Lee);`;
  const CRAFTED = 'and when a program other than Word wrote it into one of the few places in the file\'s code that Word fills only with its own words.';
  const PHONE_R7 = 'A telephone or other number that the safety-net pattern masks in the text holds the export when an add-in wrote it into an attribute or an element of its own in one of Word\'s own parts, but is not found when a program wrote it into an attribute under one of Office\'s own prefixes (w:tel) or into an attribute with no prefix on a drawn shape.';
  // D1L-2: the second pass's, digits alone in an Office element not found; owner ruling 19f closed it
  const PHONE_R8 = PHONE_R7.slice(0, -1) + ', or when it is written as digits alone between the tags of an element under one of Office\'s own namespaces that is not text on the page (<w14:tel>2125550147</w14:tel>).';
  const PHONE = 'A telephone or other number that the safety-net pattern masks in the text holds the export when an add-in wrote it into an attribute or an element of its own in one of Word\'s own parts, or when it is written as digits alone between the tags of an element under one of Office\'s own namespaces (<w14:tel>2125550147</w14:tel>), but is not found when a program wrote it into an attribute under one of Office\'s own prefixes (w:tel), into an attribute with no prefix on a drawn shape, or into a drawing\'s position, size or share of the page (<wp:posOffset>).';
  const PHONE_OLD = 'A telephone or other number that the safety-net pattern masks in the text is not found when an add-in wrote it into an attribute in one of Word\'s own parts.';
  const UNK_HOLDS = 'anything typed in it, or a number the safety-net pattern would mask, holds the export.';
  const UNK_KEPT = 'but a name that is not in your table is kept as written where it stands as a program writes code: in small letters, or starting with one and run together (whitfield, jonasWhitfield), as an attribute\'s value, and so at the end of a web address on a host Office\'s own addresses use (purl.org, www.w3.org) in an attribute; run together with digits between its tags (whitfield2291); in small letters, or so run together, as the name of an element, an attribute or a prefix; as the part\'s own file name; whatever it says, as the name of an element under one of Office\'s own namespaces; and, whatever it says, in the address of a namespace the part declares (urn:matters:Jonas Whitfield).';
  const UNK_KEPT_OLD = 'in lower case in an attribute, or as the name of an element under one of Office\'s own namespaces';
  // the round-6 list: a web address on an Office host kept wherever it stands, between tags too
  const UNK_KEPT_R6 = 'in small letters as the name of an element or a prefix, or at the end of a web address on a host Office\'s own addresses use (purl.org, www.w3.org); and';
  const NOTE = 'the save line and the receipt carry the writer\'s note naming it, and the Review screen lists it under Warnings (“Unrecognized part not scanned”).';
  // owner ruling 27: the text outside the body is read in a request of its own (lib/side.ts)
  const SIDE_READ = 'First, the engine reads the main body, and then, in a request of its own, the text the saved .docx carries outside it: headers (with any watermark), footers, footnotes, endnotes, chart and SmartArt text.';
  const SIDE_MASKED = 'A name it finds only there is masked wherever the saved .docx carries it, and the Review screen lists it; the copied text and the .txt are the body alone.';
  const SIDE_HELD = 'If the body was read and that text was not, or its read could not be used, the .docx is held and says why.';
  const FOOTER = 'A name the engine did not find anywhere, and that is not on your always-redact list, is not masked anywhere in the file, and the check passes.';
  const MORAL_FOOTER = 'A name the engine never found, in the body or in the headers, footers and notes it reads apart from the body, is in no table, so the check cannot catch it unless the name is on your always-redact list.';
  const README_SIDE = 'A name it finds only there is masked wherever the saved .docx carries it and is listed on the Review screen; the copied text and the .txt are the body alone. If the body was read and that text was not, or its read could not be used, the saved .docx is held with the reason (sideHeld).';
  // what the pages said while the engine read the body alone (until 2026-09-25)
  const FOOTER_OLD = 'Someone named only in a footer and nowhere in the body would not be masked, and the check would pass, unless that name is on your always-redact list.';
  const FAQ_BODY_ONLY = 'so headers, footers, footnotes, endnotes and chart text are masked with what the body found, your always-redact list and the structured rules.';
  const MORAL_OLD = 'A name the engine never found, such as one that appears only in a header or footnote, is not in that table, so the check cannot catch it unless the name is on your always-redact list.';
  const README_OLD = 'because the engine reads the body alone';
  const FIELDS = 'except that a table of contents whose entries are written as link fields keeps its page numbers but its entries stop being links; a cross-reference that shows a clause\'s number or text (Word\'s REF field), and a link written as a field code, become plain text and no longer update, and the save line and the receipt say so.';
  const INTAKE = 'Not every encoding is caught: ASCII85, for one, goes through unread, and so does a base64 run short enough, or shaped enough like a column of ids, to pass for one.';
  const PDFLINE = 'In a PDF, only the page that carries such a block is left out, marked the same way, and the other pages are read.';
  const IT_NOTES = 'For a .docx export the receipt also carries the writer\'s own notes: what it removed, what it renamed, what it wrote out as plain text (a cross-reference, for example), and any part of the file it did not know and kept.';
  const IT_KEY = 'listed in the name key, under "Left readable by your decision"';
  // D1L-5: the .docx scope line carries fixed example words, so "no piece of either" was false for
  // a table row such as Hickson Corp or Delia Marsh
  const IT_WORDS = 'Every line that concerns a name is a count: the receipt prints no name from the table, no always-redact term and no piece of either, apart from the fixed words of the .docx scope line, which are the same on every receipt whatever the table holds: examples such as KestrelCapital and XYZReport, the designators Co, Corp and Inc, and words such as Office and Dublin Core. A rule that looks for a client\'s name will match the receipt when the name shares one of those words.';
  const IT_WORDS_OLD = 'the receipt prints no name, no always-redact term and no piece of either.';
  // owner ruling 21: the round-6 line said "no fragments of listed names survive" of every export
  const IT_FRAG = 'The partial-name check reads the copied text and the .txt, which stand for the body, and of a .docx export the text of every other part the writer saves (a header, a footer, a note, a chart, SmartArt), as saved; it does not read the file\'s code, nor the text Word keeps there as a setting (a watermark, the signer a signature line suggests, the text a list prints beside each number). It looks for each word of a masked row or a listed term from four letters, from two where both the name and the copy write it with a capital, or from four digits, and never inside a plain word of letters. It skips words too common to stand for a name alone (titles, designators, two-letter codes, the, and, for, of, and Bank, Road, Street, Place and Avenue) even where one is a surname, so Ms Street left in the copy is not flagged where the table says Della Street. Its line on the receipt says what it read, whatever it found.';
  // round 7's first pass: "every other part … that holds text", where a watermark is not read, and no word of the words it skips (D1J-F1, D1J-F2)
  const IT_FRAG_R9 = 'The partial-name check reads the copied text and the .txt, which stand for the body, and of a .docx export every other part the writer saves that holds text (a header, a footer, a note, a chart, SmartArt), as saved; it does not read the file\'s code. It looks for each word of a masked row or a listed term from four letters, from two where both the name and the copy write it with a capital, or from four digits, and never inside a plain word of letters; its line on the receipt says what it read, whatever it found.';
  const IT_RUST ='which the one-command check runs when the Rust toolchain and the app\'s bundled Node runtime (app/src-tauri/binaries) are present; when either is missing it skips them and says which.';
  const IT_CHAIN = 'No run of the frozen chain through the relay against a live model server is recorded yet';
  const IT_HAND = 'closing the app does not stop it, and until it is stopped where it was started, any program running under the user\'s account can read its token file and send it text. Settings says so while the app is using such a service.';
  const IT_DISK = 'When a run fails or is stopped and its working copies were not removed, the engine line on the screen and on the receipt says the working copy and the key were left on the disk, in fixed words that name no folder, and says where the folder is named: in legal-serve.log, in the logs folder the History screen gives, when the app started the service (the app\'s next start of the service rewrites that file and removes the folder or names it there again), or in the window a service started by hand runs in.';
  const IT_DISK_OLD = 'in fixed words that name no folder.';
  const HERO46 = '45 of those documents ran the engine as it stood before it was frozen, and one ran the frozen engine.';
  const RES46 = '45 of the 46 ran the engine as it stood before its freeze, 1 the frozen engine.';
  const C9 = 'FREEZE.md first said 8 and corrects itself to 7 (its correction C9)';
  const UTIL = '25 round-4 documents, masked by the engine as it stood before its freeze';

  // 2026-09-25: the model's address is the one https:// string in the app (Setup.tsx MODEL_URL)
  // "outside comments": two comment lines quote https:// links (attest.ts, detect.ts), and the
  // fact reads the code with comment lines left out (codeLines); until 2026-09-25 the pages said
  // the source held one such address, which the comments made false
  const READ_HTTPS = 'Outside comments, the app\'s source code in those two folders holds one https:// address: Google\'s address for the model file, which the Setup and Settings screens show as text for you to copy. The app never requests it.';
  const PRIVACY_HTTPS = 'Outside comments, the app\'s TypeScript and Rust code holds one https:// address: where Google publishes the model file, which Setup and Settings show as text for you to copy';
  const HTTPS_OLD = 'One https:// address is in the app\'s source code:';
  // engine.rs spawn_launcher removes a fixed list of llama.cpp settings; these are not on it
  const LLAMA_GAP = 'The app does not remove llama.cpp\'s own settings that make the model server connect to another computer: LLAMA_ARG_RPC, which sends the model\'s work to other computers, and LLAMA_ARG_HF_REPO, LLAMA_ARG_MODEL_URL and others like them, which download a model.';
  const LLAMA_GAP_IDX = 'It does not remove llama.cpp\'s own settings that make the model server connect to another computer';

  const LAWS = [
    ['what the .docx check reads: every part, its name, text, attribute values, element and attribute names, namespaces', (V) => {
      const b = [], faq = faqOf(V.idx);
      says(b, 'reads, with the parts Word writes qualified', F.reads && F.readsSafetyNet && F.officeNamesUnread, has(faq, READS) && has(faq, 'or something the safety-net pattern masks.'));
      never(b, 'reads every element and attribute name, unqualified', F.officeNamesUnread, has(faq, READS_UNQUALIFIED));
      never(b, 'round-4 "not read" sentence', F.reads, /The names of its elements and attributes are not read|other than a namespace declaration or a compatibility list/.test(V.idx));
      return b;
    }, [['sentence dropped', drop('idx', READS)], ['round-4 sentence put back', putBack('idx', READS, ' The names of its elements and attributes are not read.')],
      ['qualifier dropped', swap('idx', ' (in the parts Word writes, not a name under one of Office\'s own namespaces)', '')]]],
    ['a name run together is masked in text a reader sees and holds elsewhere', (V) => {
      const b = [];
      says(b, 'run-together', F.runMasked && F.runHeldInCode, has(faqOf(V.idx), RUN));
      never(b, 'round-4 run-together blind spot', F.runMasked, /is not masked anywhere in the text a reader sees|run into another word \(KestrelCapital where the list says Kestrel\) is a second/.test(V.idx));
      return b;
    }, [['sentence dropped', drop('idx', RUN)], ['round-4 moral sentence put back', putBack('idx', 'unless the name is on your always-redact list.', ' A name or listed term run into another word (KestrelCapital where the list says Kestrel) is a second: it is not masked in the text or in the .docx, and the check passes.')]]],
    [`in text a reader sees: found at breaks, before a plural, and from ${F.floor} inside an address; a plain word of letters ships`, (V) => {
      const b = [], faq = faqOf(V.idx);
      says(b, 'where a name is found in text', F.breaksFound, has(faq, BREAKS));
      says(b, 'plain word ships in the FAQ', F.plainShips, has(faq, FLOOR));
      says(b, 'plain word ships in the moral paragraph', F.plainShips, has(moralOf(V.idx), FLOOR_MORAL));
      never(b, 'the round-6 floor that said a name of six or more was found inside any word', F.plainShips, FLOOR_OLD.test(V.idx));
      if (!/export const RUN_FLOOR = \d+;/.test(WRITER)) b.push('RUN_FLOOR is no longer a plain constant in docxWrite.ts; re-read the floor sentences');
      return b;
    }, [['FAQ plain-word sentence dropped', drop('idx', FLOOR)], ['moral sentence dropped', drop('idx', FLOOR_MORAL)], ['break sentence dropped', drop('idx', BREAKS)],
      ['the second pass\'s break sentence, no tag, put back', swap('idx', BREAKS, BREAKS_R8)],
      ['a different floor stated', swap('idx', `from ${SIX} letters and digits, inside a web`, 'from four letters and digits, inside a web')],
      ['round-6 floor put back', putBack('idx', FLOOR, ` Inside a longer word, unless a space or punctuation mark, a digit, or a capital after a small letter shows where the name ends as well as where it starts, a name is found only from ${SIX} letters and digits, so a shorter one ships.`)]]],
    ['a row reaches into a longer name where a capital starts it or a plural ends it (over-masking), in both exports', (V) => {
      const b = [], faq = faqOf(V.idx);
      says(b, 'McDonald', F.overMc, has(faq, MC) && has(moralOf(V.idx), MC_MORAL));
      says(b, 'the Laws Committee', F.overLaws, has(faq, LAWS_OVER));
      says(b, '#supporters', F.overHash, has(faq, HASH_OVER));
      says(b, 'text export too', F.overMc && F.overLaws && F.overHash, has(faq, OVER_TXT));
      never(b, 'Tang, Wong and Porter, closed by ruling 8', F.tangGone && F.wongGone && F.porterGone, OVER_OLD.test(V.idx));
      if (C.tanner.body !== 'Margaret Tanner met [Person1].') b.push('probe: a name three letters longer than the row is masked now; the over-masking sentences need re-measuring');
      return b;
    }, [['McDonald dropped from the moral paragraph', drop('idx', MC_MORAL)], ['McDonald dropped from the FAQ', drop('idx', MC)], ['Laws dropped', drop('idx', LAWS_OVER)],
      ['#supporters dropped', drop('idx', HASH_OVER)],
      ['Tang put back', putBack('idx', MC, ' With Margaret Tan in the table, Margaret Tang becomes [Person1]g.')], ['Porter put back', putBack('idx', LAWS_OVER, ' A row Porter turns reporter into re[Person1].')]]],
    [`a row of digits: found from ${F.floor} inside a longer number and across one listed separator; any other grouping ships; under ${F.floor}, only standing alone`, (V) => {
      const b = [];
      says(b, 'digits', F.digitsFound && F.digitsCommaShips && F.digitsOtherShips && F.digitsWideFound && F.digitsLookShips, has(faqOf(V.idx), DIGITS_FAQ));
      never(b, 'round 7\'s first-pass list, "a dot" and "a bullet" where look-alikes ship', F.digitsLookShips, has(V.idx, DIGITS_FAQ_R9));
      never(b, 'round 7\'s "a drawing\'s position on the page", where its share of the page ships too', F.shortDigitsShips, has(V.idx, DIGITS_SHORT_R9));
      says(b, 'under six digits: alone in text, whole in code', F.shortDigitsShips && F.shortDigitsWholeHeld, has(faqOf(V.idx), DIGITS_SHORT));
      never(b, 'the first-pass "one space … or dash", comma only', F.digitsOtherShips, has(V.idx, DIGITS_R7));
      never(b, 'the second pass\'s list, where an em dash, a minus sign and a tab ship', F.digitsWideFound, has(V.idx, DIGITS_R6));
      never(b, 'the second pass\'s "under six, not looked for in an add-in\'s value"', F.shortDigitsWholeHeld, has(V.idx, DIGITS_SHORT_R8));
      return b;
    }, [['sentence dropped', drop('idx', DIGITS_FAQ)], ['the comma dropped from what ships', swap('idx', 'with a comma (3192,6819), an underscore', 'with an underscore')],
      ['the spaced dash dropped from what ships', swap('idx', ', a line break, an en or em dash or a slash with a space either side (3192 – 6819, as a range is written)', ', a line break')],
      ['the look-alike marks dropped from what ships', swap('idx', ', a square bracket ([3192] 6819), a no-break space beside a bracket or a hyphen, or a mark that only looks like one of those (a fraction slash, an ideographic or small full stop, a swung dash, a heavy minus sign, a white, black or triangular bullet: 3192⁄6819, 3192。6819, 3192◦6819)', '')],
      ['round 7\'s first-pass sentence put back', swap('idx', DIGITS_FAQ, DIGITS_FAQ_R9)], ['round 7\'s first-pass under-six sentence put back', swap('idx', DIGITS_SHORT, DIGITS_SHORT_R9)],
      ['second-pass sentence put back', swap('idx', DIGITS_FAQ, DIGITS_R6)],
      ['first-pass sentence put back', swap('idx', DIGITS_FAQ, DIGITS_R6.slice(0, DIGITS_R6.indexOf('and in the text a reader sees')) + DIGITS_R7)],
      ['under-six sentence dropped', drop('idx', DIGITS_SHORT)], ['second-pass under-six sentence put back', swap('idx', DIGITS_SHORT, DIGITS_SHORT_R8)]]],
    ['a hyphen or a line break inside a word, a reference HTML reads otherwise, a Symbol-font letter: each ships; a ligature no longer does', (V) => {
      const b = [], faq = faqOf(V.idx);
      says(b, 'hyphen', F.hyphenShips, has(faq, HYPHEN));
      says(b, 'references', F.refShips, has(faq, REFS));
      says(b, 'a Symbol-font letter', F.symShips, has(faq, SYM));
      says(b, 'a line break', F.brokenShips && F.brokenQuotedShips, has(faq, PCT_BREAK));
      never(b, 'round 7\'s first-pass line-break sentence, no quoted reply', F.brokenQuotedShips, has(faq, PCT_BREAK_R9));
      says(b, 'an invisible direction mark', F.bidiShips, has(faq, BIDI_FAQ));
      never(b, 'the ligature, closed by owner ruling 19c', F.ligGone, /with a ligature/.test(V.idx));
      never(b, 'the second pass\'s references, "&nbsp" without its semicolon shipping', F.refNoSemiRead, has(V.idx, REFS_R8));
      return b;
    }, [['hyphen clause dropped', drop('idx', HYPHEN)], ['reference clause dropped', drop('idx', REFS)], ['Symbol-font clause dropped', drop('idx', SYM)], ['line-break sentence dropped', drop('idx', PCT_BREAK)],
      ['ligature clause put back', putBack('idx', HYPHEN, ' ' + LIG)], ['second-pass reference clause put back', swap('idx', REFS, REFS_R8)],
      ['direction-mark clause dropped', drop('idx', BIDI_FAQ)], ['round 7\'s first-pass line-break sentence put back', swap('idx', PCT_BREAK, PCT_BREAK_R9)]]],
    ['a designator written out: the whole word is masked with the name, in both exports', (V) => {
      const b = [];
      says(b, 'long form', F.longFormWhole, has(faqOf(V.idx), LONG));
      never(b, 'the second pass\'s "[Company1]oration"', F.longFormWhole, has(V.idx, LONG_R8) || /\[Company1\]oration/.test(V.idx));
      return b;
    }, [['sentence dropped', drop('idx', LONG)], ['second-pass sentence put back', swap('idx', LONG, LONG_R8)]]],
    ['letters spaced apart or each in brackets ship from both exports', (V) => {
      const b = [];
      says(b, 'spaced in the FAQ', F.spacedShips && F.bracketShips, has(faqOf(V.idx), SPACED));
      says(b, 'spaced in the moral paragraph', F.spacedShips, has(moralOf(V.idx), SPACED_MORAL));
      return b;
    }, [['FAQ clause dropped', drop('idx', SPACED)], ['moral sentence dropped', drop('idx', SPACED_MORAL)], ['second-pass clause, no brackets, put back', swap('idx', SPACED, SPACED_R8)]]],
    ['a name written with percent-escapes or a character reference is masked in both exports and holds in code', (V) => {
      const b = [], faq = faqOf(V.idx);
      says(b, 'percent-escapes masked', F.pctMasked && F.refNoSemiRead, has(faq, PCT_NOW));
      says(b, 'an escape that writes no character holds', F.pctBadByteHolds, has(faq, PCT_BAD));
      says(b, 'a mail gateway\'s rewrite of it holds both exports', F.ppTextHolds, has(faq, PCT_PP));
      never(b, 'a sentence that says a mail gateway\'s rewrite ships from the text export', F.ppTextHolds, /the text export carries it as written/.test(V.idx));
      never(b, 'a sentence that says a percent-escaped name ships', F.pctMasked, PCT_SHIPS_OLD.test(V.idx));
      return b;
    }, [['sentence dropped', drop('idx', PCT_NOW)], ['bad-byte sentence dropped', drop('idx', PCT_BAD)], ['mail-gateway sentence dropped', drop('idx', PCT_PP)],
      ['second-pass sentence, no reference without its semicolon, put back', swap('idx', PCT_NOW, PCT_NOW_R8)],
      ['round-6 moral sentence put back', putBack('idx', FLOOR_MORAL, ' A name with some of its characters written as % and two hexadecimal digits, as a pasted web link writes a space, an apostrophe, an accented letter or a Chinese name, is a third: it is not masked in the text export or in the .docx, and the check passes.')],
      ['round-6 FAQ clause put back', putBack('idx', SPACED, ' when some of its characters are written as % and two hexadecimal digits, in a SharePoint or other web link pasted into the text (the text export ships it too);')]]],
    ['intake: which percent-escapes hold and which go through', (V) => {
      const b = [];
      says(b, 'percent intake', F.pctIntake && F.pctMasked, has(faqOf(V.idx), PCT_INTAKE));
      return b;
    }, [['sentence dropped', drop('idx', PCT_INTAKE)], ['"ships" put back', swap('idx', 'and a name written that way is masked in both exports, the escapes with it (see below);', 'and a name written that way ships (see below);')]]],
    ['what the FAQ says the receipt names, the receipt names', (V) => {
      const b = [], faq = faqOf(V.idx);
      const missing = RECEIPT_NAMES.filter(([, re]) => !re.test(SCOPE)).map(([w]) => w);
      says(b, 'the receipt names these blind spots', F.receiptNames, has(faq, RECEIPT));
      if (missing.length) b.push(`the receipt no longer names: ${missing.join(', ')}; re-word the sentence or the receipt`);
      never(b, 'the round-6 "does not name three"', F.receiptNames, has(faq, RECEIPT_OLD));
      never(b, '"in full"', F.receiptNames, /the receipt states the same limits in full/.test(faq));
      never(b, 'the first-pass list of six', F.receiptNames, has(faq, RECEIPT_R7));
      never(b, 'the second pass\'s list, with the ligature and digits in an Office element', F.receiptNames, has(faq, RECEIPT_R8));
      never(b, 'round 7\'s first-pass list, without the direction mark or the quoted reply', F.receiptNames, has(faq, RECEIPT_R9));
      return b;
    }, [['sentence dropped', drop('idx', RECEIPT)], ['round-6 sentence put back', swap('idx', RECEIPT, RECEIPT_OLD)], ['first-pass list of six put back', swap('idx', RECEIPT, RECEIPT_R7)],
      ['second-pass list put back', swap('idx', RECEIPT, RECEIPT_R8)], ['round 7\'s first-pass list put back', swap('idx', RECEIPT, RECEIPT_R9)]]],
    ['Read the code: the other http:// strings are namespace addresses on four hosts, and nothing requests them', (V) => {
      const b = [];
      says(b, 'hosts', F.httpHosts === HTTP_HOSTS && F.httpNoRequest, has(V.idx, HTTP));
      if (F.httpHosts !== HTTP_HOSTS) b.push(`the app source's non-loopback http:// hosts are now: ${F.httpHosts}`);
      never(b, '"one in code, one in a comment"', F.httpHosts === HTTP_HOSTS, /one in code,\s*one in a comment/.test(V.idx));
      return b;
    }, [['sentence dropped', drop('idx', HTTP)], ['round-4 count put back', swap('idx', HTTP, 'The other http:// strings in the app source are Word XML namespace names (one in code, one in a comment), not requests.')],
      ['a host dropped from the list', swap('idx', 'purl.org and www.w3.org: they', 'and www.w3.org: they')]]],
    ['equations: in-line structures masked, separate parts named as a blind spot', (V) => {
      const b = [];
      never(b, 'round-4 box/bar clause', F.eqInlineMasked, /in a box or a border box|in a box or under a bar/.test(V.idx));
      says(b, 'separate parts in the FAQ', F.eqApartShips, has(faqOf(V.idx), EQ));
      says(b, 'separate parts in the moral paragraph', F.eqApartShips, has(moralOf(V.idx), EQ_MORAL));
      return b;
    }, [['FAQ clause dropped', drop('idx', EQ)], ['round-4 clause put back', putBack('idx', EQ, ' when part of it is in a box or a border box, under a bar, an accent or a brace;')]]],
    ['a short lower-case name in the code of Word\'s own parts ships', (V) => {
      const b = [];
      says(b, 'lee', F.leeShips, has(faqOf(V.idx), LEE));
      return b;
    }, [['clause dropped', drop('idx', LEE)]]],
    ['a number in an add-in\'s attribute or element holds; under Office\'s own prefix or on a shape it is not read', (V) => {
      const b = [];
      says(b, 'phone in an attribute', F.phoneOfficeShips && F.phoneOfficeElemHeld, has(faqOf(V.idx), PHONE));
      never(b, 'the round-6 sentence that said an add-in\'s number is not found', F.phoneOfficeShips, has(V.idx, PHONE_OLD));
      never(b, 'the second pass\'s sentence that said digits alone in an Office element are not found', F.phoneOfficeElemHeld, has(V.idx, PHONE_R8));
      return b;
    }, [['sentence dropped', drop('idx', PHONE)], ['round-6 sentence put back', swap('idx', PHONE, PHONE_OLD)], ['first-pass sentence, no Office element, put back', swap('idx', PHONE, PHONE_R7)],
      ['second-pass sentence put back', swap('idx', PHONE, PHONE_R8)]]],
    ['a program other than Word can write a name where Word writes only its own words', (V) => {
      const b = [];
      says(b, 'crafted forms', F.craftedShips, has(faqOf(V.idx), CRAFTED));
      return b;
    }, [['clause dropped', drop('idx', CRAFTED)]]],
    ['cases closed since round 4 are not listed as shipping', (V) => {
      const b = [], faq = faqOf(V.idx);
      never(b, 'mso- note', F.msoGone, /<\?mso-/.test(faq));
      never(b, 'chart currency format', F.chartMasked, /chart's currency format/.test(faq));
      never(b, 'unknown part: phone, currency brackets, element names', F.unkHolds, /a telephone number there is kept as written|currency brackets|a confirmed name used as one ships/.test(faq));
      never(b, 'margaretTan in a program-written value', F.runHeldInCode, /margaretTan\) in a value a program wrote/.test(faq));
      never(b, 'element name in any part', F.reads, /name of an element or attribute a program wrote, in any part/.test(faq));
      return b;
    }, [
      ['mso- clause put back', putBack('idx', CRAFTED, ' A name ships as a program\'s note that begins mso- (<?mso-KestrelHoldings?>).')],
      ['chart clause put back', putBack('idx', CRAFTED, ' A Social Security number ships when written into a chart\'s currency format.')],
      ['unknown-part phone put back', putBack('idx', UNK_HOLDS, ' What is kept is not reviewed: a telephone number there is kept as written.')],
      ['margaretTan clause put back', putBack('idx', CRAFTED, ' A name ships when it is run together starting in lower case (margaretTan) in a value a program wrote into the file\'s code.')],
      ['element-name clause put back', putBack('idx', CRAFTED, ' A name ships when it is the name of an element or attribute a program wrote, in any part (<acme:MargaretTan/>).')],
    ]],
    ['a part the writer does not know: what holds and what is kept', (V) => {
      const b = [], faq = faqOf(V.idx);
      says(b, 'typed text and safety-net numbers hold', F.unkHolds, has(faq, UNK_HOLDS));
      says(b, 'a name written as code is kept', F.unkCodeKept, has(faq, UNK_KEPT));
      says(b, 'what is kept is read for a row of digits under six only where it is a whole value', F.shortDigitsShips && F.shortDigitsWholeHeld, has(faq, UNK_READ));
      never(b, 'the second pass\'s "only from six digits"', F.shortDigitsWholeHeld, has(faq, UNK_READ_R8));
      never(b, 'the round-5 narrower kept list', F.unkCodeKept, has(faq, UNK_KEPT_OLD));
      never(b, 'the round-6 list that kept a web address on an Office host between tags too', F.unkCodeKept, has(faq, UNK_KEPT_R6));
      return b;
    }, [['hold clause dropped', drop('idx', UNK_HOLDS)], ['kept clause dropped', drop('idx', UNK_KEPT)],
      ['digit qualifier dropped', swap('idx', UNK_READ, UNK_READ.replace(` (a row of digits alone under ${SIX} digits only where it is the whole of a value)`, ''))],
      ['second-pass qualifier put back', swap('idx', UNK_READ, UNK_READ_R8)],
      ['round-5 narrower list put back', swap('idx', UNK_KEPT, 'but a name that is not in your table and is written the way a program writes code — ' + UNK_KEPT_OLD + ' — is kept as written.')],
      ['round-6 list put back', swap('idx', UNK_KEPT, 'but a name that is not in your table and is written the way a program writes code is kept as written: in small letters, or starting with one and run together (whitfield, jonasWhitfield), as an attribute\'s value; ' + UNK_KEPT_R6 + ', whatever it says, as the name of an element under one of Office\'s own namespaces.')]]],
    ['the writer\'s note is printed as written, and Review warns on every unknown part', (V) => {
      const b = [], faq = faqOf(V.idx);
      says(b, 'note and warning', F.warnEvery && F.noteVerbatim, has(faq, NOTE));
      never(b, 'round-4 "usually lists" / "untrue" sentences', F.warnEvery && F.noteVerbatim, /usually lists the part under Warnings|the check of the copy read all of it|which is untrue of/.test(faq));
      return b;
    }, [['sentence dropped', drop('idx', NOTE)], ['round-4 exception put back', putBack('idx', NOTE, ' The Review screen usually lists the part under Warnings too, but not a part filed under Word\'s own theme or style folder names.')]]],
    ['outside the body: read in a request of its own, a name found only there masked in the .docx, the .docx held when that read fails, and a name found nowhere not masked', (V) => {
      const b = [], faq = faqOf(V.idx), moral = moralOf(V.idx);
      says(b, 'read apart, and what a find there does', F.sideMasked, has(faq, SIDE_READ) && has(faq, SIDE_MASKED));
      says(b, 'held when that read fails', F.sideHeld, has(faq, SIDE_HELD));
      says(b, 'a name found nowhere', F.footerOnlyShips, has(faq, FOOTER) && has(moral, MORAL_FOOTER));
      says(b, 'README', F.sideMasked && F.sideHeld, has(V.readme, README_SIDE));
      never(b, 'the body-only sentences', F.sideMasked, has(faq, FOOTER_OLD) || has(faq, FAQ_BODY_ONLY) || has(moral, MORAL_OLD) || has(V.readme, README_OLD));
      return b;
    }, [['found-nowhere sentence dropped', drop('idx', FOOTER)], ['held sentence dropped', drop('idx', SIDE_HELD)], ['README sentence dropped', drop('readme', README_SIDE)],
      ['footer-only sentence put back', putBack('idx', FOOTER, ' ' + FOOTER_OLD)], ['moral paragraph as it was', swap('idx', MORAL_FOOTER, MORAL_OLD)],
      ['README "reads the body alone" put back', putBack('readme', README_SIDE, ' It masks them with the review table only, ' + README_OLD + '.')]]],
    ['fields: cross-references and link fields become text, a link-field table of contents loses its links', (V) => {
      const b = [];
      says(b, 'fields', F.refUnlinked && F.tocLinksGo, has(faqOf(V.idx), FIELDS));
      return b;
    }, [['sentence dropped', drop('idx', FIELDS)]]],
    ['intake: the exceptions and the PDF page rule', (V) => {
      const b = [], faq = faqOf(V.idx);
      says(b, 'intake', F.intake, has(faq, INTAKE) && has(faq, PDFLINE));
      return b;
    }, [['exceptions dropped', drop('idx', INTAKE)], ['PDF rule dropped', drop('idx', PDFLINE)]]],
    ['it.html: the receipt carries the writer\'s notes', (V) => { const b = []; says(b, 'notes', F.noteVerbatim, has(V.it, IT_NOTES)); return b; }, [['sentence dropped', drop('it', IT_NOTES)]]],
    ['it.html: the name key lists what was left readable, the receipt names nothing', (V) => {
      const b = [];
      says(b, 'key', F.keyLists, has(V.it, IT_KEY));
      never(b, 'print names', F.keyLists, /two print names/.test(V.it));
      return b;
    }, [['round-4 sentence put back', putBack('it', IT_KEY, ' The two print names.')]]],
    ['it.html: the receipt prints no name from the table, but its .docx scope line carries fixed words a name may share', (V) => {
      const b = [];
      says(b, 'fixed words', F.receiptWords, has(V.it, IT_WORDS));
      never(b, 'the first-pass "no piece of either", unqualified', F.receiptWords, has(V.it, IT_WORDS_OLD));
      return b;
    }, [['sentence dropped', drop('it', IT_WORDS)], ['first-pass sentence put back', swap('it', IT_WORDS, 'Every line that concerns a name is a count: ' + IT_WORDS_OLD)]]],
    ['it.html: the partial-name check says what it read, as the receipt\'s fragment line and the ⚠ do', (V) => {
      const b = [];
      says(b, 'what the partial-name check reads', F.fragStated && F.fragCodeUnread && F.fragStopSkips, has(V.it, IT_FRAG));
      never(b, 'round 7\'s first-pass sentence, "every other part … that holds text"', F.fragCodeUnread, has(V.it, IT_FRAG_R9));
      never(b, 'the round-6 "no fragments of listed names survive"', F.fragStated, /no fragments of listed names survive/.test(V.it + V.idx));
      return b;
    }, [['sentence dropped', drop('it', IT_FRAG)], ['a different floor stated', swap('it', 'from four letters, from two', 'from three letters, from two')],
      ['the .docx body said to be read', swap('it', 'which stand for the body, and of a .docx export the text of every other part', 'and the text of every part of a .docx export')],
      ['the settings Word keeps dropped', swap('it', ', nor the text Word keeps there as a setting (a watermark, the signer a signature line suggests, the text a list prints beside each number)', '')],
      ['the skipped words dropped', swap('it', ' It skips words too common to stand for a name alone (titles, designators, two-letter codes, the, and, for, of, and Bank, Road, Street, Place and Avenue) even where one is a surname, so Ms Street left in the copy is not flagged where the table says Della Street.', '')],
      ['round 7\'s first-pass sentence put back', swap('it', IT_FRAG, IT_FRAG_R9)],
      ['the round-6 line put back', putBack('it', IT_FRAG, ' Its line reads "fragment check: no fragments of listed names survive".')]]],
    ['it.html: the one-command check runs cargo test', (V) => {
      const b = [];
      says(b, 'rust gate', F.rustGate, has(V.it, IT_RUST));
      never(b, 'no cargo', F.rustGate, /one-command check does not run|it runs no cargo test/.test(V.it));
      return b;
    }, [['round-4 sentence put back', putBack('it', IT_RUST, ' The one-command check does not run them.')]]],
    ['it.html: no full-chain run through the relay is claimed', (V) => {
      const b = [];
      says(b, 'chain', F.noChainRun, has(V.it, IT_CHAIN));
      never(b, 'exercised', F.noChainRun, /full chain was exercised/.test(V.it));
      return b;
    }, [['claim put back', putBack('it', IT_CHAIN, '; the full chain was exercised by a scratch harness')]]],
    ['it.html: a service started by hand outlives the app, and Settings says so', (V) => { const b = []; says(b, 'hand service', F.handOutlives, has(V.it, IT_HAND)); return b; }, [['sentence dropped', drop('it', IT_HAND)]]],
    ['it.html: working copies left on disk are stated in fixed words, no folder, and say where the folder is named', (V) => {
      const b = [];
      says(b, 'left on disk', F.leftOnDisk, has(V.it, IT_DISK));
      never(b, 'the round-6 sentence that ended at "no folder"', F.leftOnDisk, has(V.it, IT_DISK_OLD));
      return b;
    }, [['sentence dropped', drop('it', IT_DISK)], ['round-6 sentence put back', swap('it', IT_DISK, IT_DISK.slice(0, IT_DISK.indexOf(IT_DISK_OLD) + IT_DISK_OLD.length))]]],
    ['it.html: the engine line is per document', (V) => {
      const b = [];
      never(b, 'engine-line defects', F.perDocRun, /Two cases are known where the engine line is wrong/.test(V.it));
      return b;
    }, [['round-4 sentence put back', putBack('it', 'requirement is your professionals\' judgment.', ' Two cases are known where the engine line is wrong.')]]],
    ['the 46 unseen agreements: 45 pre-freeze, 1 frozen', (V) => {
      const b = [];
      says(b, 'hero', F.edgar45, has(V.idx, HERO46));
      says(b, 'research', F.edgar45, has(V.res, RES46));
      return b;
    }, [['hero says 46 frozen', swap('idx', HERO46, '46 of those documents ran the frozen engine.')], ['research line dropped', drop('res', RES46)]]],
    ['research.html: FREEZE.md corrects itself to 7', (V) => {
      const b = [];
      says(b, 'C9', F.freezeC9, has(V.res, C9));
      never(b, 'conflict', F.freezeC9, /the two records differ/.test(V.res));
      return b;
    }, [['conflict put back', putBack('res', C9, '; the two records differ')]]],
    ['research.html: 0.968 was measured on round-4 copies masked before the freeze', (V) => {
      const b = [];
      says(b, 'utility', F.utilityPreFreeze, has(V.res, UTIL) && has(V.res, 'measured at 0.968 on round-4 paper masked before the freeze'));
      never(b, 'our masked copy', F.utilityPreFreeze, /our masked copy/.test(V.res));
      return b;
    }, [['sentence dropped', drop('res', UTIL)], ['"our masked copy" put back', putBack('res', UTIL, ' (our masked copy)')]]],
    // ---- 2026-09-25: the launch's own statements (owner rulings 28 and 30) --------------------
    ['download: the installer is offered at GitHub Releases, and each page that offers it says it is unsigned and SmartScreen will warn', (V) => {
      const b = [];
      says(b, 'index: the release link', F2.release, has(V.idxH, `href="${RELEASES}"`));
      says(b, `index: "${UNSIGNED}"`, F2.release, has(V.idx, UNSIGNED));
      says(b, 'IT brief: the release link', F2.release, has(V.itH, `href="${RELEASES}"`));
      says(b, `IT brief: "${UNSIGNED}"`, F2.release, has(V.it, UNSIGNED));
      never(b, 'a page that says nothing is released', F2.release, /not yet published|Nothing has been released|no binary releases|no installer has been published|Pre-release:/i.test(V.idx + V.it + V.res));
      return b;
    }, [['the unsigned line dropped from the download card', drop('idx', UNSIGNED)],
      ['the release link pointed elsewhere', swap('idxH', `href="${RELEASES}"`, 'href="https://example.com/simpler-legal-setup.exe"')],
      ['the IT brief without the unsigned line', drop('it', UNSIGNED)],
      ['"Nothing has been released there yet" put back', putBack('idx', 'Every release is on GitHub Releases.', ' Nothing has been released there yet.')]]],
    ['the model: Google\'s address, pinned by revision, the same on every page as in the app', (V) => {
      const b = [];
      says(b, 'index: the model link', F2.modelUrl, has(V.idxH, `href="${MODEL_URL}"`));
      says(b, 'IT brief: the model address', F2.modelUrl, has(V.it, MODEL_URL));
      const other = [...(V.idxH + V.itH + V.resH).matchAll(/https:\/\/huggingface\.co\/[^\s"'<>]*/g)].map((m) => m[0]).filter((u) => u !== MODEL_URL);
      if (other.length) b.push(`a Hugging Face address that is not the app's (${other[0]})`);
      never(b, 'no Google link or checksum', F2.modelUrl, /download link for it yet|publishes a download link|no Google-published checksum|no Google download link|records no Google/i.test(V.idx + V.it + V.res));
      return b;
    }, [['the main branch linked instead', swap('idxH', MODEL_URL, MODEL_URL.replace(/\/resolve\/[0-9a-f]{40}\//, '/resolve/main/'))],
      ['the IT brief without the address', swap('it', MODEL_URL, 'https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf')],
      ['research.html\'s round-6 sentence put back', putBack('res', 'fine-tune, no telemetry.', ' The repository records no Google-published checksum or download link to compare it with.')]]],
    ['security reports: GitHub private reporting and SECURITY.md, the support address the only e-mail; PRIVACY.md linked', (V) => {
      const b = [];
      says(b, 'index: the advisory link and SECURITY.md', F2.security, has(V.idxH, `href="${ADVISORY}"`) && has(V.idxH, 'blob/main/SECURITY.md"'));
      says(b, 'index: PRIVACY.md', F2.security, has(V.idxH, 'blob/main/PRIVACY.md"'));
      says(b, 'IT brief: the advisory link, SECURITY.md and PRIVACY.md', F2.security, has(V.itH, `href="${ADVISORY}"`) && has(V.it, 'SECURITY.md') && has(V.it, 'PRIVACY.md'));
      never(b, 'no security contact', F2.security, /no security contact/i.test(V.idx + V.it + V.res));
      never(b, 'an e-mail channel', F2.security, /mailto:|security@/i.test(V.idxH + V.itH + V.resH));
      return b;
    }, [['"No security contact is published yet" put back', putBack('it', 'write to support@simpler.asia.', ' No security contact is published yet.')],
      ['the advisory link swapped for an e-mail address', swap('idxH', `href="${ADVISORY}"`, 'href="mailto:security@simpler.legal"')],
      ['PRIVACY.md unlinked', drop('idxH', 'blob/main/PRIVACY.md"')]]],
    ['the licence: Apache-2.0, as LICENSE, the installer and every manifest say, and no other terms', (V) => {
      const b = [];
      says(b, 'index footer', F2.apache, has(V.idx, '© 2026 Simpler Terminal Value Systems Pte Ltd · Apache-2.0 licensed'));
      says(b, 'IT brief', F2.apache, has(V.it, 'Apache-2.0, © Simpler Terminal Value Systems Pte Ltd.') && has(V.it, LICENCE_PAGE_SENTENCE));
      says(b, 'research footer', F2.apache, has(V.res, 'Apache-2.0 licensed.'));
      never(b, 'other terms', F2.apache, /Gemma terms|Gemma Terms|Gemma ToU|\bEULA\b|end-user licence agreement|end-user license agreement/i.test(V.idx + V.it + V.res));
      return b;
    }, [['the footer says MIT', swap('idx', '© 2026 Simpler Terminal Value Systems Pte Ltd · Apache-2.0 licensed', '© 2026 Simpler Terminal Value Systems Pte Ltd · MIT licensed')],
      ['the IT brief\'s old licence-page sentence put back', swap('it', LICENCE_PAGE_SENTENCE, 'The installer\'s licence page is the Apache-2.0 text; there is no separate end-user licence.')],
      ['"Gemma weights remain under Google\'s terms" put back', putBack('idx', 'the Gemma 4 model is Google\'s, also under Apache-2.0', ' · Gemma weights remain under Google\'s Gemma terms')]]],
    ['no promise the launch does not keep: no download host of ours, no copy of the model, no repository "not public yet"', (V) => {
      const b = [];
      const all = V.idxH + V.itH + V.resH;
      never(b, 'a download host of ours', F2.modelUrl, /dl\.simpler\.legal/.test(all));
      never(b, 'a copy of the model of ours', F2.modelUrl, /model mirror|mirror of the model|data-r2/i.test(all));
      never(b, 'the repository said not public', F2.release, /not public yet|publication pending|repository is not public/i.test(V.idx + V.it + V.res));
      return b;
    }, [['the R2 comment put back', putBack('idxH', 'DOWNLOADS (2026-09-25, owner ruling 28):', ' R2: download hrefs marked data-r2 point at dl.simpler.legal.')],
      ['"not public yet" put back', putBack('idx', 'Nothing. Apache-2.0-licensed', ' (the source repository is not public yet)')]]],
    ['the one https:// address in the app is the model\'s, shown as text and never requested', (V) => {
      const b = [];
      const fact = F.httpNoRequest && F2.modelUrl;
      says(b, 'index: Read the code', fact, has(V.idx, READ_HTTPS));
      says(b, 'PRIVACY.md', fact, has(V.privacy, PRIVACY_HTTPS));
      // the comment lines the fact leaves out do hold https:// links, so the pages may not say
      // the source holds one without "outside comments"
      never(b, 'one https:// address in the source, comments included', /https:\/\//.test(APP.ts.replace(MODEL_URL_LINE, '') + APP.rs), has(V.idx, HTTPS_OLD) || /The app's code holds one https:\/\/ address/.test(V.privacy));
      return b;
    }, [['sentence dropped', drop('idx', READ_HTTPS)], ['PRIVACY.md without it', drop('privacy', PRIVACY_HTTPS)],
      ['the unqualified sentence put back', putBack('idx', READ_HTTPS, ' ' + HTTPS_OLD)]]],
    ['the llama.cpp settings the app does not remove are stated where the network is', (V) => {
      const b = [];
      says(b, 'IT brief', F2.llamaGap, has(V.it, LLAMA_GAP));
      says(b, 'index: On a work machine?', F2.llamaGap, has(V.idx, LLAMA_GAP_IDX));
      says(b, 'PRIVACY.md', F2.llamaGap, has(V.privacy, LLAMA_GAP));
      if (F2.llamaNet === 'partial') b.push(`engine.rs names some of ${LLAMA_NET.join(', ')} and LLAMA_OFFLINE but not all, and no page says which`);
      return b;
    }, F2.llamaGap
      ? [['the IT brief without it', drop('it', LLAMA_GAP)], ['PRIVACY.md without it', drop('privacy', LLAMA_GAP)], ['index without it', drop('idx', LLAMA_GAP_IDX)]]
      // once engine.rs removes those settings the three sentences must go, and a page that still
      // states the gap is the break this law has to catch
      : [['the IT brief with it', putBack('it', 'and says which setting to remove.', ' ' + LLAMA_GAP)],
        ['PRIVACY.md with it', putBack('privacy', 'NODE_OPTIONS (scrub_proxy in app/src-tauri/src/engine.rs).', ' ' + LLAMA_GAP)],
        ['index with it', putBack('idx', 'The app also starts everything with proxy settings removed.', ' ' + LLAMA_GAP_IDX)]]],
    ['no page says the app sends nothing off the machine', (V) => {
      const b = [];
      // Two things stand behind this, and either keeps it: the model server the app starts reads
      // llama.cpp's own network settings (the law above), and no capture of what the packaged
      // app and its WebView2 runtime send is on record (PRIVACY.md says so). The index meta, its
      // social card and the tape said "the app sends nothing off the machine" until 2026-09-25.
      const unmeasured = F2.llamaGap || /No packet\s+capture of the packaged app/.test(PRIVACY);
      const offMachine = /sends nothing off th(?:e|is) (?:machine|computer)/i;
      never(b, 'the app sends nothing off the machine', unmeasured, [V.idxH.replace(/<!--[\s\S]*?-->/g, ''), V.it, V.res, V.readme, V.privacy].some((s) => offMachine.test(s)));
      return b;
    }, [['the description saying it', swap('idxH', 'There is no account, no API key and no server of ours." />', 'The app itself sends nothing off the machine." />')],
      ['the tape saying it', swap('idxH', 'NO API KEY &middot; NO ACCOUNT &middot; NO SERVER OF OURS', 'NO API KEY &middot; NO ACCOUNT &middot; SENDS NOTHING OFF THE MACHINE')],
      ['README saying it', putBack('readme', README_SIDE, ' The app sends nothing off this machine.')]]],
  ];

  // ---- run ---------------------------------------------------------------------------------
  let bad = 0;
  // The harness law: in every pair, the side that ships and its partner are judged apart. Its
  // controls are a detector blind one way (everything "ships") and blind the other (nothing does).
  const harness = (judge) => pairs.filter(([s, p]) => judge(s) !== 'ships' || judge(p) === 'ships').map(([s, p]) => `${s} ${judge(s)} / ${p} ${judge(p)}`);
  const hp = harness((k) => C[k].how);
  console.log(`${hp.length ? 'FAIL' : 'PASS'} the harness tells a ship from a mask or a hold (${pairs.length} pairs)`);
  for (const p of hp) console.log(`  pair not told apart: ${p}`);
  if (hp.length) bad++;
  for (const [cname, judge] of [['every case judged "ships"', () => 'ships'], ['no case judged "ships"', () => 'masked']]) {
    const failed = harness(judge).length > 0;
    console.log(`  CONTROL (${cname}) ${failed ? 'fails, as it must' : 'PASSED — the harness law has no teeth'}`);
    if (!failed) bad++;
  }
  // The facts read from source, not driven: each must turn on a source that breaks it, or a law
  // built on it could never fail from the code side.
  for (const [cname, broken] of [
    ['a fetch() to another host', () => loopbackOnly(APP.ts + '\nfetch(`https://api.example.com/v1`);', APP.rs)],
    ['a fetch() whose address is not a template', () => loopbackOnly(APP.ts + '\nfetch(url);', APP.rs)],
    ['an XMLHttpRequest', () => loopbackOnly(APP.ts + '\nnew XMLHttpRequest();', APP.rs)],
    ['a fifth http:// host', () => hostsOf(APP.ts + APP.rs + '\n"http://telemetry.example.com/"') === F.httpHosts],
    ['a receipt with the equation clause cut', () => namesAll(SCOPE.replace('does not find a name split between separate parts of an equation', ''))],
    ['a receipt with the Office-prefix number clause cut', () => namesAll(SCOPE.replace('under one of Office\\\'s own prefixes', ''))],
    ['an https:// string literal', () => loopbackOnly(APP.ts + "\nconst u = 'https://api.example.com/v1';", APP.rs)],
    ['a receipt with the Symbol-font clause cut', () => namesAll(SCOPE.replace(' in the Symbol font', ''))],
    ['a receipt that names the ligature again', () => receiptOk(SCOPE.replace('with a hyphen inside', 'with a ligature, with a hyphen inside'))],
    ['a receipt with the digits-grouped-otherwise clause cut', () => namesAll(SCOPE.replace(', it is not found, and the check does not find it either', ''))],
    ['a fragment line that no longer says what it read', () => fragStated(EXPORT.replace(' Read: ${fragWhere}, for ${fragHow}`', '`'))],
    ['a fragment line that leaves the .docx\'s other text parts unsaid', () => fragStated(EXPORT.replace(', and the text of every other part of the saved .docx (a header, a footer, a note, a chart, SmartArt), as it saves them', ''))],
    ['a fragment line that says it reads a watermark', () => fragStated(EXPORT.replace(', but not text Word keeps as a setting in the code of the file (a watermark, the signer a signature line suggests, the text a list prints beside each number)', ''))],
    ['a fragment line with round 7\'s "a title, a designator or a particle"', () => fragStated(EXPORT.replace(' save a word it skips as too common to stand for a name alone, even where it is a surname: a title such as Mr or Dr, a designator such as Inc, LLC or Group, a two-letter code such as US, UK, NA or SA, the words the, and, for and of, and Bank, Road, Street, Place and Avenue; each', ' but a title, a designator or a particle:'))],
    ['a fragment line that reads any handle or tag', () => fragStated(EXPORT.replace('or a handle or a tag written with a plain @ or #', 'a handle or a tag'))],
    ['a receipt with the direction-mark clause cut', () => namesAll(SCOPE.replace('or with an invisible mark that sets', 'or with a mark that sets'))],
    ['a receipt that says a quoted reply\'s wrapped link is read', () => namesAll(SCOPE.replace('so a name broken there is not found', 'so a name broken there is found'))],
    ['a receipt with the look-alike marks cut', () => namesAll(SCOPE.replace('or a mark that only looks like one of those, such as a fraction slash', 'or a fraction slash'))],
    ['a receipt without the fixed word Office', () => SCOPE_WORDS.every((w) => SCOPE.split('Office').join('Offce').includes(w))],
    // 2026-09-25: the model's address, the release, the licence, the security channel
    ['the model\'s address handed to window.open', () => loopbackOnly(APP.ts + '\nwindow.open(MODEL_URL);', APP.rs)],
    ['the model\'s address fetched', () => loopbackOnly(APP.ts + '\nfetch(MODEL_URL);', APP.rs)],
    ['a second https:// address written as the model\'s', () => loopbackOnly(APP.ts + "\nexport const MODEL_URL = 'https://huggingface.co/google/other/resolve/main/x.gguf';", APP.rs)],
    ['the model\'s address on the main branch', () => modelUrlFact(MODEL_URL.replace(/\/resolve\/[0-9a-f]{40}\//, '/resolve/main/'), APP.ts)],
    ['the model\'s address no longer on Settings', () => modelUrlFact(MODEL_URL, APP.ts, SETTINGS.split('<ModelUrl />').join(''))],
    ['a signing certificate in tauri.conf.json', () => releaseFact({ ...CONF, bundle: { ...CONF.bundle, windows: { ...CONF.bundle.windows, certificateThumbprint: 'A1B2' } } })],
    ['an .msi beside the NSIS installer', () => releaseFact({ ...CONF, bundle: { ...CONF.bundle, targets: ['nsis', 'msi'] } })],
    ['the licence page set to NOTICE', () => apacheFact({ ...CONF, bundle: { ...CONF.bundle, licenseFile: '../../NOTICE' } }, read('LICENSE'))],
    ['the licence page without the Microsoft section (LICENSE alone)', () => apacheFact({ ...CONF, bundle: { ...CONF.bundle, licenseFile: '../../LICENSE' } }, read('LICENSE'))],
    ['the licence page with LICENSE altered', () => apacheFact(CONF, read('LICENSE'), licencePageOf(CONF).replace('Apache License', 'Apache Licence'))],
    ['LICENSE replaced by MIT text', () => apacheFact(CONF, 'MIT License\n\nCopyright (c) 2026')],
    ['SECURITY.md with an e-mail address', () => securityFact(SECURITY + '\nOr write to security@simpler.legal.\n', PRIVACY)],
    ['SECURITY.md with the support address inside a longer domain', () => securityFact(SECURITY + '\nOr write to support@simpler.asia.example.com.\n', PRIVACY)],
    ['SECURITY.md with a mailto: link to the support address', () => securityFact(SECURITY + '\n[write](mailto:support@simpler.asia)\n', PRIVACY)],
    ['SECURITY.md without the advisory link', () => securityFact(SECURITY.split(`<${ADVISORY}>`).join(''), PRIVACY)],
    ['engine.rs removing LLAMA_ARG_RPC', () => llamaGapFact(APP.rs + '\n        "LLAMA_ARG_RPC",\n')],
    ['engine.rs removing every one of them and setting LLAMA_OFFLINE', () => llamaGapFact(APP.rs + LLAMA_NET.map((v) => `\n        "${v}",`).join('') + '\n    cmd.env("LLAMA_OFFLINE", "1");\n')],
  ]) {
    const failed = broken() === false;
    console.log(`  CONTROL (source fact, ${cname}) ${failed ? 'fails, as it must' : 'PASSED — the fact cannot see it'}`);
    if (!failed) bad++;
  }
  for (const [k, v] of Object.entries(F)) if (v === false || v === undefined) console.log(`  fact false: ${k}`);
  if (process.env.SITE_CLAIMS_CASES) for (const [k, v] of Object.entries(C)) console.log(`  case ${k}: ${v.how}${v.why ? ` (${v.why.slice(0, 90)})` : ''}`);
  if (process.env.SITE_CLAIMS_CASES) console.log(`  text export, percent cases: ${JSON.stringify(pctMoreTxt)}
  intake, percent routes: ${JSON.stringify(pctRoutes)}
  text export, ruling 8: ${JSON.stringify({ plainTxt, plural: { docx: plural.docx.body, txt: plural.txt.red } })}
  fetch() calls: ${JSON.stringify([...APP.ts.matchAll(/\bfetch\(\s*([^,)]*)/g)].map((m) => m[1]))}`);
  for (const [name, check, controls] of LAWS) {
    const problems = check(PAGES);
    console.log(`${problems.length ? 'FAIL' : 'PASS'} ${name}`);
    for (const p of problems) console.log(`  ${p}`);
    if (problems.length) bad++;
    if (!controls.length) { console.log('  no CONTROL — a law with none cannot show it can fail'); bad++; }
    for (const [cname, mut] of controls) {
      let failed;
      try { failed = check(mut(PAGES)).length > 0; } catch (e) { console.log(`  CONTROL (${cname}) could not be built: ${e.message}`); bad++; continue; }
      console.log(`  CONTROL (${cname}) ${failed ? 'fails, as it must' : 'PASSED — the law has no teeth'}`);
      if (!failed) bad++;
    }
  }
  console.log(bad ? `site-claims: ${bad} failure(s)` : `site-claims: all ${LAWS.length + 1} laws pass, every control fails`);
  return bad ? 1 : 0;
}
