// DOCX PARTS — every part of the saved .docx is read before it ships, and the places a name
// lives outside the page's text are masked, renamed or removed, never shipped under a gate
// that passed. Run from app/frontend:   node test/docx-parts.mjs
//
// Until 2026-09-23 the writer's gate re-walked only what the walker lists (the flows, field
// codes, chart values, a few attributes) and copied the style, numbering, theme, font and
// settings parts unread. A declared term shipped in a character style's name, a table style,
// a header's paragraph style, a list's number text, a chart's trendline, a theme or font name,
// the sensitivity-label record and settings attributes, each while the gate reported 0 leaks.
//
// Each law below is one channel, with a fixture that carries both a declared term (the
// always-redact list's "Kestrel") and a name the engine found in the body ("Margaret Tan").
// Each is masked, renamed or removed — or the file is held, naming the place — and never
// shipped readable. Each law has a CONTROL that turns its step off in a SCRATCH BUNDLE (an
// esbuild plugin rewrites the writer's or the walker's source as it is bundled; the files on
// disk are never touched), so every check here has been seen to fail.
//
// Every shipped output is also checked for what a recipient's Word needs: every part is
// well-formed XML, every paragraph, run, table and list style it names exists, and every
// link, cross-reference, page reference and table-of-contents switch finds its bookmark.
import { build } from 'esbuild';
import { XMLValidator } from 'fast-xml-parser';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const SRC = join(here, '..', 'src', 'lib');
const dir = mkdtempSync(join(tmpdir(), 'docx-parts-'));

// the engine bundle touches window/localStorage on import (tauri.ts inTauri, the settings)
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

let built = 0;
/** Bundle `entry`; `mutations` — [from, to] in the writer, [from, to, 'docx.ts'] in the walker
 *  — rewrite the source on the way in, each one required to find its text (a CONTROL whose
 *  anchor has moved must fail loudly, not test nothing). */
async function bundle(entry, mutations = []) {
  const outfile = join(dir, `b${built++}.mjs`);
  await build({
    entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
    plugins: [{
      name: 'mutate',
      setup(b) {
        b.onLoad({ filter: /extract[\\/]docx(Write)?\.ts$/ }, (args) => {
          const file = /docxWrite\.ts$/.test(args.path) ? 'docxWrite.ts' : 'docx.ts';
          let s = readFileSync(args.path, 'utf8');
          for (const [from, to, target = 'docxWrite.ts'] of mutations) {
            if (target !== file) continue;
            if (!s.includes(from)) throw new Error(`CONTROL anchor not found in ${file}: ${from}`);
            s = s.split(from).join(to);
          }
          return { contents: s, loader: 'ts' };
        });
      },
    }],
  });
  return import(pathToFileURL(outfile).href);
}
const E = await bundle(join(SRC, 'engine.ts'));
const D = await bundle(join(SRC, 'extract', 'docx.ts'));
const REAL = await bundle(join(SRC, 'extract', 'docxWrite.ts'));
const mutated = (...m) => bundle(join(SRC, 'extract', 'docxWrite.ts'), m);
// The engine's mask places the table's names run together too (engine.ts reads them with the
// writer's own refFind), so a name run together is caught by three readings: the mask's, the
// writer's (placeFlow, maskValue, maskMath) and the gate's (checkRef). EDGE is the engine with
// its copy of refFind finding nothing, a mask that places a row at a word's edges only, as the
// mask did until 2026-09-23: the CONTROLS that prove the writer's and the gate's own readings run
// under it, so each is seen to fail with the others off.
const EDGE = await bundle(join(SRC, 'engine.ts'), [['  if (!names.length || !s) return out;', '  return out;']]);
/** the writer's run-together step over a flow, over a value, and the gate's over text and code */
const FLOW_RUN_OFF = ["const run = runTags(refSpans(blank(fold(last.text)), names, 'text'), mask);", 'const run = runTags([], mask);'];
const VALUE_RUN_OFF = ["const run = runTags(refSpans(blanked, st.names, mode === 'text' ? 'text' : 'all'), st.mask);", 'const run = runTags([], st.mask);'];
const GATE_TEXT_RUN_OFF = ["else if (o.mode === 'text') checkRef(o.label, o.value, 'text');", ''];
const GATE_CODE_RUN_OFF = ["else if (o.mode === 'machine' && !OWN_MEDIA.test(o.value.trim())) checkRef(o.label, o.value, 'run');", ''];

let pass = 0, fail = 0;
const check = (ok, what, detail = '') => { console.log((ok ? '  PASS  ' : '  FAIL  ') + what + (detail ? '\n          ' + String(detail).slice(0, 400) : '')); ok ? pass++ : fail++; };

const PRACTICE = 'us';
const row = (key, text, tag, cls, cat) => ({ key, text, tag, cat, cls, prov: 'both passes', occ: 1, status: 'confirmed', src: 'span' });
/** the name the engine found in the body, and the term on the always-redact list */
const ROWS = [row('p', 'Margaret Tan', '[Person1]', 'PERSON', 'person')];
const TERMS = ['Kestrel'];
/** either of them, in any form an identifier or a value writes it */
const LEAK = /kestrel|margaret[\s_-]*tan/i;

// ── packages ──
const enc = (x) => new TextEncoder().encode(x);
const dec = (u) => new TextDecoder().decode(u);
const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:v="urn:schemas-microsoft-com:vml"', 'xmlns:o="urn:schemas-microsoft-com:office:office"',
  'xmlns:w10="urn:schemas-microsoft-com:office:word"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
  'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
].join(' ');
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
const CT = {
  header: `${WML}.header+xml`, styles: `${WML}.styles+xml`, numbering: `${WML}.numbering+xml`, settings: `${WML}.settings+xml`,
  fontTable: `${WML}.fontTable+xml`, comments: `${WML}.comments+xml`, glossary: `${WML}.document.glossary+xml`,
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml', chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
  people: 'application/vnd.ms-word.people+xml', custom: 'application/vnd.openxmlformats-officedocument.custom-properties+xml',
  label: 'application/vnd.ms-office.classificationlabels+xml', ole: 'application/vnd.openxmlformats-officedocument.oleObject',
};
const para = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const BODY = para('Margaret Tan signed the heads of terms.');
/** A package: the body (and a header) plus `parts`, each { name, xml | data, type?, rel?:
 *  [type, target, id?] from word/document.xml, pkgRel?: type }. `defaults`: extra
 *  [extension, content type] pairs. `sect`: more of the last section's properties (a
 *  first-page or an even-page header's reference, w:titlePg). */
async function docx({ body = '', header, parts = [], rels = [], defaults = [], sect: moreSect = '' }) {
  const over = [], docRels = [...rels], files = [];
  const pkgRels = [`<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>`];
  let sect = moreSect;
  if (header != null) {
    parts = [{ name: 'word/header1.xml', xml: `<w:hdr ${NS}>${header}</w:hdr>`, type: CT.header, rel: ['header', 'header1.xml', 'rIdH'] }, ...parts];
    sect += '<w:headerReference w:type="default" r:id="rIdH"/>';
  }
  let k = 0;
  for (const p of parts) {
    if (p.type) over.push(`<Override PartName="/${p.name}" ContentType="${p.type}"/>`);
    if (p.rel) docRels.push(`<Relationship Id="${p.rel[2] ?? `rIdP${k++}`}" Type="${p.rel[0].includes('/') ? p.rel[0] : `${REL}/${p.rel[0]}`}" Target="${p.rel[1]}"/>`);
    if (p.pkgRel) pkgRels.push(`<Relationship Id="rIdQ${k++}" Type="${p.pkgRel}" Target="${p.name}"/>`);
    files.push({ name: p.name, data: p.data ?? enc(decl + p.xml) });
  }
  const dflt = [['rels', 'application/vnd.openxmlformats-package.relationships+xml'], ['xml', 'application/xml'], ...defaults]
    .map(([e, t]) => `<Default Extension="${e}" ContentType="${t}"/>`).join('');
  return REAL.writeZip([
    { name: '[Content_Types].xml', data: enc(`${decl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${dflt}<Override PartName="/word/document.xml" ContentType="${WML}.document.main+xml"/>${over.join('')}</Types>`) },
    { name: '_rels/.rels', data: enc(`${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${pkgRels.join('')}</Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: enc(`${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${docRels.join('')}</Relationships>`) },
    { name: 'word/document.xml', data: enc(`${decl}<w:document ${NS}><w:body>${BODY}${body}<w:sectPr>${sect}</w:sectPr></w:body></w:document>`) },
    ...files,
  ]);
}

/** The Export screen's dry run: exportPlan's .docx mask over the rows and the list, handed to
 *  the writer — plus every part of the output as text, for searches the writer cannot narrow. */
const shippedOutputs = [];
async function write(pkg, { W = REAL, engine = E, rows = ROWS, terms = TERMS, keepImages = false, practice = PRACTICE } = {}) {
  const plan = engine.exportPlan({ text: '', entities: rows, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg }, terms, practice);
  const report = await W.writeRedactedDocx(pkg, { mask: plan.docx.mask, keepImages });
  const raw = {};
  if (report.bytes) {
    const zip = await D.readZip(report.bytes);
    for (const n of zip.names) raw[n] = dec(await zip.read(n));
    if (W === REAL && engine === E) shippedOutputs.push({ raw, report });
  }
  const leaks = Object.entries(raw).flatMap(([n, x]) => [n, x].filter((s) => LEAK.test(s)).map((s) => `${n}: …${s.slice(Math.max(0, s.search(LEAK) - 30), s.search(LEAK) + 30)}…`));
  return { report, raw, names: Object.keys(raw), leaks, held: report.held ?? '' };
}
const shipsClean = (r) => !r.report.held && r.leaks.length === 0;
const said = (r) => (r.report.held ? `held: ${r.report.held}` : `shipped; readable: ${r.leaks.slice(0, 2).join(' | ') || 'none'}`);

// ── what a recipient's Word needs of the output ──
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** every field instruction in a part: a complex field's instrText runs joined, and fldSimple */
function instructions(xml) {
  const out = [];
  const stack = [];
  for (const m of xml.matchAll(/<w:fldChar\b[^>]*w:fldCharType="(begin|separate|end)"[^>]*\/>|<w:instrText\b[^>]*>([^<]*)<\/w:instrText>|<w:fldSimple\b[^>]*w:instr="([^"]*)"/g)) {
    if (m[1] === 'begin') stack.push({ s: '', done: false });
    else if (m[1]) {
      const f = stack[stack.length - 1];
      if (f && !f.done) { out.push(unesc(f.s)); f.done = true; }
      if (m[1] === 'end') stack.pop();
    } else if (m[2] !== undefined) { const f = stack[stack.length - 1]; if (f && !f.done) f.s += m[2]; }
    else out.push(unesc(m[3]));
  }
  return out;
}
/** Every style a part names exists; every bookmark a link or a field points at exists (Word
 *  matches a bookmark without regard to case, a style name in a switch likewise). */
function dangling(raw) {
  const styles = raw['word/styles.xml'] || '';
  const ids = new Set([...styles.matchAll(/<w:style\b[^>]*w:styleId="([^"]*)"/g)].map((m) => m[1]));
  const names = new Set([...styles.matchAll(/<w:style\b[^>]*>([\s\S]*?)<\/w:style>/g)].map((m) => (/<w:name w:val="([^"]*)"/.exec(m[1])?.[1] ?? '').toLowerCase()));
  const xml = Object.entries(raw).filter(([n]) => /\.xml$/.test(n));
  const marks = new Set(xml.flatMap(([, x]) => [...x.matchAll(/<w:bookmarkStart\b[^>]*w:name="([^"]*)"/g)].map((m) => m[1].toLowerCase())));
  const bad = [];
  let refs = 0;
  const mark = (n, what, v) => { refs++; if (!marks.has(v.toLowerCase())) bad.push(`${n}: ${what} → "${v}" (no such bookmark)`); };
  const style = (n, what, v) => { refs++; if (!names.has(v.trim().toLowerCase())) bad.push(`${n}: ${what} → "${v}" (no such style)`); };
  for (const [n, x] of xml) {
    for (const m of x.matchAll(/<w:(pStyle|rStyle|tblStyle|basedOn|next|link|numStyleLink|styleLink)\b[^>]*w:val="([^"]*)"/g)) {
      refs++;
      if (!ids.has(m[2])) bad.push(`${n}: ${m[1]} → "${m[2]}" (no such style id)`);
    }
    for (const m of x.matchAll(/<w:hyperlink\b[^>]*w:anchor="([^"]*)"/g)) mark(n, 'link', m[1]);
    for (const instr of instructions(x)) {
      const t = [...instr.matchAll(/"([^"]*)"|[^\s"]+/g)].map((m) => m[1] ?? m[0]);
      const code = (t[0] || '').toUpperCase();
      if (['REF', 'PAGEREF', 'NOTEREF'].includes(code) && t[1] && !t[1].startsWith('\\')) mark(n, code, t[1]);
      if (code === 'STYLEREF' && t[1]) style(n, code, t[1]);
      for (let i = 1; i < t.length - 1; i++) {
        if (code === 'TOC' && t[i] === '\\b') mark(n, 'TOC \\b', t[i + 1]);
        if (code === 'TOC' && t[i] === '\\t') t[i + 1].split(/[,;]/).forEach((p, j) => { if (j % 2 === 0 && p.trim()) style(n, 'TOC \\t', p); });
      }
    }
  }
  return { bad, refs };
}
const malformed = (raw) => Object.entries(raw).filter(([n, x]) => /\.(xml|rels)$/.test(n) && XMLValidator.validate(x) !== true).map(([n]) => n);

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 1: the gate reads every part of the output, whatever the part —');
{
  const notes = (text) => ({ name: 'word/unheardOf.xml', xml: `<acme:notes xmlns:acme="urn:acme:notes"><acme:note>${text}</acme:note></acme:notes>`, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] });
  const pkg = await docx({ parts: [notes('Kestrel matter, for Margaret Tan')] });
  const r = await write(pkg);
  const typedOff = ['if (typed(tree)) return hold(', 'if (false) return hold('];
  check(!!r.report.held && /^word\/unheardOf\.xml, a part of the file this app does not know, holds text/.test(r.held) && /Paste Special > Picture/.test(r.held),
    'a part the writer does not know, holding text, holds the file, names the part and says the way through', said(r));
  // the text in such a part is text no engine read and no one reviewed: the table's names are
  // the least of what it can carry, and the gate reads only for them
  const other = await docx({ parts: [notes('Quarterly figures for the Harrow account.')] });
  const ro = await write(other);
  check(!!ro.report.held && /holds text: nothing here masked it and no one reviewed it/.test(ro.held),
    'so does one whose text names nothing the table holds', said(ro));
  const co = await write(other, { W: await mutated(typedOff) });
  check(!co.report.held && /Harrow account/.test(co.raw['word/unheardOf.xml'] || ''),
    'CONTROL: with the writer\'s check off, the gate passes it and the unreviewed text ships', said(co));
  const c1 = await write(pkg, { W: await mutated(typedOff) });
  check(!!c1.report.held && /word\/unheardOf\.xml/.test(c1.held) && /Kestrel/.test(c1.held),
    'CONTROL: with the writer\'s check off, the gate still holds on the table\'s names in the part', said(c1));
  const c = await write(pkg, { W: await mutated(typedOff, ['  for (const n of parts) {\n    gate.parts++;', '  for (const n of parts) {\n    if (!RULES.some((r) => r.re.test(n))) continue;\n    gate.parts++;']) });
  check(!c.report.held && c.leaks.some((l) => l.startsWith('word/unheardOf.xml')),
    'CONTROL: and a gate that reads only the parts the walker lists ships it, with the term readable', said(c));

  const quiet = await write(await docx({ parts: [notes('2026-09-01')] }));
  check(!quiet.report.held && quiet.names.includes('word/unheardOf.xml')
    && quiet.report.notes.some((s) => /^word\/unheardOf\.xml is a part this writer does not know\. Between its tags and in its attributes are only .*, so it was kept as it was\. The check of the copy read /.test(s))
    && quiet.report.channels.other?.parts === 1 && quiet.report.gate.parts === quiet.names.length,
  'the same part holding only a date is kept, read to the end, and the receipt says it was kept as it was', `${said(quiet)} · notes ${JSON.stringify(quiet.report.notes)} · gate ${quiet.report.gate.parts}/${quiet.names.length}`);
  // what the writer changed in such a part is said, measured against the part as it came in:
  // the receipt said "kept as it was" over a font it had just renamed there, since it counted
  // only the tags it wrote (W5-2 lane W, 2026-09-23). A number format quoting a word is typed
  // text now and holds (law 36), so the value changed here is a font.
  const fmt = await docx({ parts: [{ ...notes(''), xml: `<acme:notes xmlns:acme="urn:acme:notes" ${NS}><a:latin typeface="Kestrel Sans"/><acme:n>42</acme:n></acme:notes>` }] });
  const rf = await write(fmt);
  check(shipsClean(rf) && /typeface="Redacted font \d+"/.test(rf.raw['word/unheardOf.xml'] || '')
    && rf.report.notes.some((s) => /^word\/unheardOf\.xml is a part .* so it was kept, with one of them renamed as the writer renames it wherever it stands\./.test(s)),
  'one naming a font after the term is kept with the font renamed, and the receipt says one value in it was renamed', `${said(rf)} · ${JSON.stringify(rf.report.notes)}`);
  const cf = await write(fmt, { W: await mutated(['const m = valuesChanged(', 'const m = 0 * valuesChanged(']) });
  check(cf.report.notes.some((s) => /unheardOf\.xml is a part .*so it was kept as it was\./.test(s)), 'CONTROL: with the part not compared, the receipt says it was kept as it was, over a font it renamed', JSON.stringify(cf.report.notes));

  const attr = await docx({ body: '<w:p xmlns:acme="urn:acme" acme:client="Kestrel"><w:r><w:t>Terms.</w:t></w:r></w:p>' });
  const ra = await write(attr);
  check(!!ra.report.held && /acme:client/.test(ra.held), 'an attribute no one listed, carrying the term, holds the file and names the attribute', said(ra));
  // a hold says where in the document and what the lawyer can do before what the check found:
  // until 2026-09-23 it was the check's own list ("word/document.xml w:p@acme:client: …") alone.
  // An attribute is reached by no Find in Word, so the way through is the object it belongs to or
  // a copy of the text (W7F-2): "find the text in Word" sent the lawyer looking for it
  check(/^text your table masks is still readable in the body\. .*Word's Find does not reach.*copy the document's text into a new blank document.* What the check found: word\/document\.xml w:p@acme:client/.test(ra.held) && !/find the text in Word/.test(ra.held),
    'the hold says where, in the lawyer\'s words, and the way through, before the check\'s own list', ra.held);
  const cw = await write(attr, { W: await mutated(['if (leaks.length) return hold(heldMessage(leaks));', 'if (leaks.length) return hold(`held — the re-walk of the output found: ${leaks.join(\'; \')}`);']) });
  check(!!cw.report.held && !/^text your table masks is still readable in the body\./.test(cw.held), 'CONTROL: the check\'s list alone says neither', cw.held);
  const attrOff = await mutated(['want(`${part} ${am ? am[1] : `${tag}@${k}`}`, v,', 'if (am) want(`${part} ${am ? am[1] : `${tag}@${k}`}`, v,']);
  const ca = await write(attr, { W: attrOff });
  check(!ca.report.held && ca.leaks.length > 0, 'CONTROL: a gate that reads only the attributes it knows ships it readable', said(ca));

  const target = await docx({ rels: [`<Relationship Id="rIdT" Type="${REL}/attachedTemplate" Target="../Kestrel/Margaret Tan precedent.dotx"/>`] });
  const rt = await write(target);
  check(!!rt.report.held && /Target/.test(rt.held), 'a relationship target inside the package that names the matter holds the file', said(rt));
  const ct = await write(target, { W: attrOff });
  check(!ct.report.held && ct.leaks.some((l) => l.startsWith('word/_rels/')), 'CONTROL: unread, the relationship ships with the name in its target', said(ct));

  // no content-type override and no relationship names it: the zip entry is the only place
  const named = await docx({ parts: [{ name: 'word/Kestrel-notes.xml', xml: '<notes><note>42</note></notes>' }] });
  const rn = await write(named);
  check(!!rn.report.held && /part name word\/Kestrel-notes\.xml/.test(rn.held), 'a part whose NAME carries the term, and nothing else does, holds the file', said(rn));
  const cn = await write(named, { W: await mutated(["want(`the part name ${n}`, n, 'name');", ''], ["if (foreign.has(n)) { want(`the part name ${n}`, decoded, 'name', true);", "if (false) { want(`the part name ${n}`, decoded, 'name', true);"]) });
  check(!cn.report.held && cn.names.includes('word/Kestrel-notes.xml'), 'CONTROL: with part names unread, it ships under that name', said(cn));

  const blob = await docx({ defaults: [['dat', 'application/octet-stream']], parts: [{ name: 'word/blob.dat', data: enc('\u0000\u0001Kestrel\u0000'), rel: ['http://acme.example/blob', 'blob.dat'] }] });
  const rb = await write(blob);
  check(!!rb.report.held && /word\/blob\.dat is a part nothing here can read as text/.test(rb.held) && /Open the file in Word/.test(rb.held),
    'a part nothing can read as text holds the file, names it, and says the way through', said(rb));
  // the refusal off, the part is copied across as a picture would be
  const refusalOff = [
    ['if (!isXml(n, types)) unreadable.push(n); else unknown.add(n);', 'if (isXml(n, types)) unknown.add(n);'],
    ["if (n === '[Content_Types].xml' || /\\.rels$/.test(n) || MEDIA_RE.test(n)) {", "if (!isXml(n, types) && !MEDIA_RE.test(n)) continue;\n    if (n === '[Content_Types].xml' || /\\.rels$/.test(n) || MEDIA_RE.test(n)) {"],
    ["if (dropped.has(n) || /\\.rels$/.test(n) || n === '[Content_Types].xml' || MEDIA_RE.test(n)) continue;", "if (dropped.has(n) || /\\.rels$/.test(n) || n === '[Content_Types].xml' || MEDIA_RE.test(n) || !isXml(n, types)) continue;"],
    ['    if (!MEDIA_RE.test(n) || dropped.has(n)) continue;', '    if ((!MEDIA_RE.test(n) && isXml(n, types)) || dropped.has(n)) continue;'],
  ];
  const cb1 = await write(blob, { W: await mutated(...refusalOff) });
  check(!!cb1.report.held && /word\/blob\.dat: a part nothing can read as text is in the output/.test(cb1.held),
    'CONTROL: with the writer\'s refusal off, the gate still holds it', said(cb1));
  const cb2 = await write(blob, { W: await mutated(...refusalOff,
    ['if (!(keepImages && MEDIA_RE.test(n))) leaks.push(`${n}: a part nothing can read as text is in the output`);', 'void 0;']) });
  check(!cb2.report.held && cb2.names.includes('word/blob.dat'), 'CONTROL: with both off, it ships unread', said(cb2));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 2: a style named after the client is renamed everywhere it is used —');
{
  const style = (type, id, name, inner = '', extra = '') => `<w:style w:type="${type}"${extra} w:styleId="${id}"><w:name w:val="${name}"/>${inner}</w:style>`;
  const styles = `<w:styles ${NS}><w:latentStyles w:defLockedState="0" w:count="2"><w:lsdException w:name="Normal" w:qFormat="1"/><w:lsdException w:name="Kestrel Quote" w:uiPriority="30"/></w:latentStyles>`
    + style('paragraph', 'Normal', 'Normal', '<w:qFormat/>', ' w:default="1"')
    + style('paragraph', 'Heading1', 'heading 1', '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>')
    + style('paragraph', 'KestrelHeading', 'Kestrel Heading', '<w:aliases w:val="KH,Kestrel H"/><w:basedOn w:val="Heading1"/><w:next w:val="KestrelBody"/><w:link w:val="KestrelHeadingChar"/>', ' w:customStyle="1"')
    + style('paragraph', 'KestrelBody', 'Kestrel Body', '<w:basedOn w:val="Normal"/>', ' w:customStyle="1"')
    + style('character', 'KestrelHeadingChar', 'Kestrel Heading Char', '<w:link w:val="KestrelHeading"/>', ' w:customStyle="1"')
    + style('character', 'MargaretTanEmphasis', 'Margaret Tan Emphasis', '', ' w:customStyle="1"')
    + style('table', 'TableNormal', 'Normal Table', '', ' w:default="1"')
    + style('table', 'KestrelGrid', 'Kestrel Grid', '<w:basedOn w:val="TableNormal"/>', ' w:customStyle="1"')
    + style('numbering', 'KestrelList', 'Kestrel List', '<w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>', ' w:customStyle="1"')
    + '</w:styles>';
  const numbering = `<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/><w:styleLink w:val="KestrelList"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>`
    + '<w:abstractNum w:abstractNumId="1"><w:numStyleLink w:val="KestrelList"/></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
  const fld = (instr, result) => `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${result}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  const body = fld(' TOC \\o "1-3" \\t "Kestrel Heading,1,Kestrel Body,2" \\h ', 'Contents')
    + '<w:p><w:pPr><w:pStyle w:val="KestrelHeading"/></w:pPr><w:r><w:t>Completion</w:t></w:r></w:p>'
    + '<w:p><w:r><w:rPr><w:rStyle w:val="MargaretTanEmphasis"/></w:rPr><w:t>Signed.</w:t></w:r></w:p>'
    + '<w:tbl><w:tblPr><w:tblStyle w:val="KestrelGrid"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:pPr><w:pStyle w:val="KestrelBody"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Item</w:t></w:r></w:p>'
    + '<w:p><w:fldSimple w:instr=" STYLEREF &quot;Kestrel Heading&quot; "><w:r><w:t>Completion</w:t></w:r></w:fldSimple></w:p>';
  const pkg = await docx({
    body, header: '<w:p><w:pPr><w:pStyle w:val="KestrelHeading"/></w:pPr><w:r><w:t>Letterhead</w:t></w:r></w:p>',
    parts: [{ name: 'word/styles.xml', xml: styles, type: CT.styles, rel: ['styles', 'styles.xml'] }, { name: 'word/numbering.xml', xml: numbering, type: CT.numbering, rel: ['numbering', 'numbering.xml'] }],
  });
  const r = await write(pkg);
  const d = dangling(r.raw);
  const doc = r.raw['word/document.xml'] || '', hdr = r.raw['word/header1.xml'] || '', sty = r.raw['word/styles.xml'] || '';
  check(shipsClean(r), 'six styles named after the client or the signatory ship with neither name, in any part', said(r));
  check(r.report.removed.styles === 6 && /w:styleId="Heading1"/.test(sty) && /<w:name w:val="heading 1"\/>/.test(sty) && /w:styleId="Normal"/.test(sty),
    'exactly those six are renamed; a style that names no one keeps its name', `removed.styles ${r.report.removed.styles}`);
  check(d.bad.length === 0 && d.refs >= 14, `every pStyle, rStyle, tblStyle, basedOn, next, link, styleLink, numStyleLink, TOC \\t and STYLEREF still finds its style (${d.refs} references)`, d.bad.join(' | '));
  const hs = /<w:pStyle w:val="([^"]*)"/.exec(hdr)?.[1], bs = /<w:p><w:pPr><w:pStyle w:val="([^"]*)"/.exec(doc.slice(doc.indexOf('Completion') - 200))?.[1];
  check(!!hs && hs === bs && !/w:aliases/.test(sty), 'the header and the body name the same new style; the renamed style\'s aliases are gone', `${hs} / ${bs}`);
  // the names the note gives are the names the copy's styles carry: the latent-style entry for
  // "Kestrel Quote" takes the first number and defines no style, so the six start at 2
  const noteNames = (r.report.notes.find((s) => /styles whose name carried something masked/.test(s)) || '').match(/Redacted style \d+/g) || [];
  check(noteNames.length >= 2 && noteNames.every((x) => sty.includes(`<w:name w:val="${x}"/>`)), 'the receipt says styles were renamed, and each name it gives is one a style in the copy carries', JSON.stringify(r.report.notes));
  const c1 = await write(pkg, { W: await mutated(['for (const k of [...places].sort((a, b) => a - b)) {', 'for (const k of [...places].filter(() => false)) {']) });
  check(!!c1.report.held && c1.report.gate.leaks.some((l) => /w:style@w:styleId|w:name@w:val/.test(l)), 'CONTROL: with no style renamed, the gate holds the file on the style names', said(c1));
  const c2 = await write(pkg, { W: await mutated(["if (STYLE_REFS.has(tag) && attrs['w:val'] !== undefined) {", 'if (false) {']) });
  check(!!c2.report.held && /w:pStyle|w:rStyle|w:tblStyle/.test(c2.held), 'CONTROL: with the styles renamed but the paragraphs not following, the gate holds on the old ids', said(c2));
  // the snippet a hold prints is the text that was read: an identifier read as its words is
  // several readings on one string, and the snippet stopped at none of them
  check(!/ \| /.test(c1.report.gate.leaks.join(' ')), 'the hold\'s snippets carry no other reading of the same name', c1.report.gate.leaks.join(' · '));
  const c3 = await write(pkg, { W: await mutated(['for (const k of [...places].sort((a, b) => a - b)) {', 'for (const k of [...places].filter(() => false)) {'],
    ['const lo = Math.max(h.s - 18, j < 0 ? 0 : j + REF_JOIN.length), hi = Math.min(h.e + 18, k < 0 ? r.length : k);', 'const lo = Math.max(h.s - 18, 0), hi = Math.min(h.e + 18, r.length);']) });
  check(/ \| /.test(c3.report.gate.leaks.join(' ')), 'CONTROL: with the snippet unbounded, it runs on into the next reading', c3.report.gate.leaks.join(' · '));

  // Word's own styles are Word's words. A row "Strong" (a surname) renamed the built-in
  // character style, and an alias the author gave "heading 1" renamed Heading 1, in the
  // recipient's Styles pane; and the count read 0 when a latent-style entry of the same name
  // came first (2026-09-23)
  const b = `<w:styles ${NS}><w:latentStyles w:defLockedState="0" w:count="3"><w:lsdException w:name="Strong" w:qFormat="1"/><w:lsdException w:name="heading 1" w:qFormat="1"/><w:lsdException w:name="Kestrel Quote" w:uiPriority="30"/></w:latentStyles>`
    + style('paragraph', 'Normal', 'Normal', '<w:qFormat/>', ' w:default="1"')
    + style('paragraph', 'Heading1', 'heading 1', '<w:aliases w:val="Kestrel H"/><w:basedOn w:val="Normal"/>')
    + style('character', 'Strong', 'Strong', '<w:rPr><w:b/></w:rPr>')
    + style('paragraph', 'KestrelQuote', 'Kestrel Quote', '<w:basedOn w:val="Normal"/>', ' w:customStyle="1"')
    + '</w:styles>';
  const bodyB = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Completion</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="KestrelQuote"/></w:pPr><w:r><w:rPr><w:rStyle w:val="Strong"/></w:rPr><w:t>Quoted.</w:t></w:r></w:p>';
  const pkgB = await docx({ body: bodyB, parts: [{ name: 'word/styles.xml', xml: b, type: CT.styles, rel: ['styles', 'styles.xml'] }] });
  const rowsB = [...ROWS, row('s', 'Strong', '[Person2]', 'PERSON', 'person')];
  const rb = await write(pkgB, { rows: rowsB });
  const sb = rb.raw['word/styles.xml'] || '';
  check(shipsClean(rb) && /w:styleId="Strong"><w:name w:val="Strong"\/>/.test(sb) && /w:styleId="Heading1"><w:name w:val="heading 1"\/><w:basedOn/.test(sb) && !/Kestrel H/.test(sb)
    && dangling(rb.raw).bad.length === 0,
  'the built-in Strong and Heading 1 keep their names; the alias that placed goes on its own', `${said(rb)} · ${(sb.match(/<w:style [^>]*>(<w:name[^>]*>)?(<w:aliases[^>]*>)?/g) || []).join(' ')}`);
  check(rb.report.removed.styles === 1 && rb.report.notes.some((s) => /^A style whose name carried something masked was renamed "Redacted style 1"/.test(s)),
    'the one style renamed is counted once, though its latent-style entry came first', `removed.styles ${rb.report.removed.styles} · ${JSON.stringify(rb.report.notes)}`);
  const cb = await write(pkgB, { rows: rowsB, W: await mutated(['const builtin = (e: { name?: string }) => !!e.name && BUILTIN_STYLE.test(e.name.trim());', 'const builtin = (e: { name?: string }) => !!e.name && false;']) });
  check(!/w:styleId="Strong"/.test(cb.raw['word/styles.xml'] || '') && !/w:styleId="Heading1"/.test(cb.raw['word/styles.xml'] || ''), 'CONTROL: read like the author\'s own, both are renamed', said(cb));
  const cc = await write(pkgB, { rows: rowsB, W: await mutated(['map.ids.set(e.id, `RedactedStyle${num}`); defined.add(num);', 'map.ids.set(e.id, `RedactedStyle${num}`); if (!had) defined.add(num);']) });
  check(cc.report.removed.styles === 0, 'CONTROL: counted where a number is first given, the style renamed is not counted', `removed.styles ${cc.report.removed.styles}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 3: a list\'s number text and name are masked —');
{
  const numbering = `<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:name w:val="Kestrel schedules"/><w:multiLevelType w:val="hybridMultilevel"/>`
    + '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="Kestrel Schedule %1."/></w:lvl>'
    + '<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="Margaret Tan (%2)"/></w:lvl></w:abstractNum>'
    + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
  // a LISTNUM field counts in a list by its name
  const body = '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First schedule</w:t></w:r></w:p>'
    + '<w:p><w:fldSimple w:instr=" LISTNUM &quot;Kestrel schedules&quot; \\l 1 "><w:r><w:t>1.</w:t></w:r></w:fldSimple><w:r><w:t>Terms</w:t></w:r></w:p>';
  const pkg = await docx({ body, parts: [{ name: 'word/numbering.xml', xml: numbering, type: CT.numbering, rel: ['numbering', 'numbering.xml'] }] });
  const r = await write(pkg);
  const num = r.raw['word/numbering.xml'] || '';
  check(shipsClean(r) && /w:lvlText w:val="\[[^\]]+\] Schedule %1\."/.test(num) && /w:lvlText w:val="\[Person1\] \(%2\)"/.test(num),
    'the number text prints a tag where the name stood and keeps its level placeholders', said(r) + ' · ' + (num.match(/w:lvlText w:val="[^"]*"/g) || []).join(' '));
  // the list's name is on no page: until 2026-09-23 it was masked as text into a name the
  // gate then read as an identifier, and the file held with no way through
  check(/<w:abstractNum w:abstractNumId="0"><w:name w:val="List1"\/>/.test(num) && /w:instr=" LISTNUM &quot;List1&quot; \\l 1 "/.test(r.raw['word/document.xml'] || '')
    && r.report.notes.some((s) => /^A list definition's name, which Word never shows, was renamed List1/.test(s)),
  'the list is renamed List1, the LISTNUM field that counts in it follows, and the receipt says so', `${(num.match(/<w:name [^>]*>/g) || []).join(' ')} · ${JSON.stringify(r.report.notes)}`);
  const c = await write(pkg, { W: await mutated(["'w:lvlText': { 'w:val':", "'w:lvlTextOff': { 'w:val':"]) });
  check(!!c.report.held && /w:lvlText@w:val/.test(c.held), 'CONTROL: unmasked, the number text holds the file (read as an attribute nobody listed)', said(c));
  const c2 = await write(pkg, { W: await mutated(["else if (parent === 'w:abstractNum') attrs['w:val'] = listName(attrs['w:val'], st);", '']) });
  check(!!c2.report.held && /a list is still named "Kestrel schedules"/.test(c2.held) && /^the app failed to remove or rewrite something it always removes or rewrites \(in the list numbering\)/.test(c2.held),
    'CONTROL: with the list not renamed, the gate holds and says it is the app\'s fault, not the file\'s', said(c2));
  const c3 = await write(pkg, { W: await mutated(["if (code === 'LISTNUM') named(toks[1], listName);", '']) });
  check(!!c3.report.held && /a list is still named "Kestrel schedules"/.test(c3.held), 'CONTROL: with the LISTNUM field not following, the gate holds on the name it still carries', said(c3));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 4: a chart\'s title, series name, trendline, label separator and number formats are masked —');
{
  const chart = `<c:chartSpace ${NS}><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Kestrel revenue for Margaret Tan</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/>`
    + '<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Kestrel</c:v></c:pt></c:strCache></c:strRef></c:tx>'
    + '<c:dLbls><c:numFmt formatCode="&quot;Kestrel &quot;#,##0" sourceLinked="0"/><c:separator>; Margaret Tan; </c:separator><c:showVal val="1"/></c:dLbls>'
    + '<c:trendline><c:name>Kestrel trend</c:name><c:trendlineType val="linear"/></c:trendline>'
    + '<c:cat><c:strRef><c:f>Sheet1!$A$2</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>2025</c:v></c:pt></c:strCache></c:strRef></c:cat>'
    + '<c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>"Kestrel "0.0</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4.5</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser>'
    + '<c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>';
  const body = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="5486400" cy="3200400"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const pkg = await docx({ body, parts: [{ name: 'word/charts/chart1.xml', xml: chart, type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] }] });
  const r = await write(pkg);
  const ch = r.raw['word/charts/chart1.xml'] || '';
  check(shipsClean(r), 'none of the chart\'s text carries either name', said(r));
  check(/formatCode="&quot;\[[^\]]+\] &quot;#,##0"/.test(ch) && /<c:formatCode>"\[[^\]]+\] "0\.0<\/c:formatCode>/.test(ch) && /<c:separator>; \[Person1\]; <\/c:separator>/.test(ch) && /<c:name>\[[^\]]+\] trend<\/c:name>/.test(ch),
    'each is masked in place: the number formats keep their digits, the separator its punctuation', (ch.match(/formatCode="[^"]*"|<c:formatCode>[^<]*|<c:separator>[^<]*|<c:name>[^<]*/g) || []).join(' · '));
  const c = await write(pkg, { W: await mutated(["'c:name': ['text', 'a trendline name']", "'c:nameOff': ['text', 'a trendline name']"]) });
  check(!!c.report.held && /a trendline name|<c:name> text/.test(c.held), 'CONTROL: with the trendline name left unmasked, the gate holds on it', said(c));
  const c2 = await write(pkg, { W: await mutated(["'c:numFmt': { formatCode: ['name', 'a number format'] },", '']) });
  check(!!c2.report.held && /formatCode/.test(c2.held), 'CONTROL: with the label number format left unmasked, the gate holds on it', said(c2));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 5: settings — document variables, attached schemas and caption labels —');
{
  const settings = `<w:settings ${NS} xmlns:sl="http://schemas.openxmlformats.org/schemaLibrary/2006/main"><w:zoom w:percent="100"/><w:attachedSchema w:val="urn:kestrel:matters"/><w:defaultTabStop w:val="720"/>`
    + '<w:captions><w:caption w:name="Kestrel Exhibit" w:pos="below" w:numFmt="decimal"/><w:autoCaptions><w:autoCaption w:name="Word.Document.12" w:caption="Kestrel Exhibit"/></w:autoCaptions></w:captions>'
    + '<w:docVars><w:docVar w:name="KestrelMatter" w:val="Margaret Tan"/></w:docVars>'
    + '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="en-US"/>'
    + '<sl:schemaLibrary><sl:schema sl:uri="urn:kestrel:matters" sl:manifestLocation="C:\\Matters\\Margaret Tan\\matters.xsd"/></sl:schemaLibrary></w:settings>';
  // the captions themselves: "Kestrel Exhibit 1", numbered by a SEQ field that names the label
  // with its space as an underscore, and a table of exhibits that collects them
  const cap = '<w:p><w:r><w:t xml:space="preserve">Kestrel Exhibit </w:t></w:r><w:fldSimple w:instr=" SEQ Kestrel_Exhibit \\* ARABIC "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>'
    + '<w:p><w:fldSimple w:instr=" TOC \\h \\z \\c &quot;Kestrel_Exhibit&quot; "><w:r><w:t>Exhibits</w:t></w:r></w:fldSimple></w:p>';
  const pkg = await docx({ body: cap, parts: [{ name: 'word/settings.xml', xml: settings, type: CT.settings, rel: ['settings', 'settings.xml'] }] });
  const r = await write(pkg);
  const st = r.raw['word/settings.xml'] || '', doc = r.raw['word/document.xml'] || '';
  // the label is on no page — the caption's words are, and are masked as text — so it is
  // renamed whatever it says: until 2026-09-23 a label that placed held the file, with no way
  // through, because Word shows the label nowhere a lawyer could change it
  check(shipsClean(r) && !/<w:docVars|<w:attachedSchema|<sl:schemaLibrary/.test(st) && /w:caption w:name="Label1"/.test(st) && /w:autoCaption[^>]*w:caption="Label1"/.test(st)
    && /w:instr=" SEQ Label1 \\\* ARABIC "/.test(doc) && /w:instr=" TOC \\h \\z \\c &quot;Label1&quot; "/.test(doc) && /\[[^\]]+\] Exhibit <\/w:t>/.test(doc),
  'variables and schemas go; the caption label is renamed Label1 in the settings, the SEQ field and the table of exhibits, and the caption\'s words are masked', said(r) + ' · ' + (st.match(/<w:(auto)?[cC]aption [^>]*>/g) || []).join(' ') + ' · ' + (doc.match(/w:instr="[^"]*"/g) || []).join(' '));
  check(r.report.notes.some((s) => /^A caption label \(the word a caption is numbered by, such as "Exhibit"\) was renamed Label1/.test(s)), 'the receipt says so', JSON.stringify(r.report.notes));
  const c = await write(pkg, { W: await mutated(["'w:attachedSchema', ", "'w:attachedSchemaOff', "]) });
  check(!!c.report.held && /attachedSchema/.test(c.held), 'CONTROL: an attached schema left in holds the file on its address', said(c));
  const c2 = await write(pkg, { W: await mutated(["if (code === 'SEQ') { named(toks[1], labelName);", "if (code === 'SEQ') {"]) });
  check(!!c2.report.held && /a caption label is still named "Kestrel_Exhibit"/.test(c2.held), 'CONTROL: with the SEQ field not following, the gate holds on the label it still names', said(c2));
  const c3 = await write(pkg, { W: await mutated(["if (tag === 'w:caption' && attrs['w:name']) attrs['w:name'] = labelName(attrs['w:name'], st);", '']) });
  check(!!c3.report.held && /a caption label is still named "Kestrel Exhibit"/.test(c3.held), 'CONTROL: with the settings\' label not renamed, the gate holds on it', said(c3));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 6: a document-management system\'s fields go, and the receipt says so —');
{
  const vt = 'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"';
  const prop = (pid, name, v) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${pid}" name="${name}"><vt:lpwstr>${v}</vt:lpwstr></property>`;
  const pkg = await docx({
    rels: [`<Relationship Id="rIdX" Type="${REL}/customXml" Target="../customXml/item1.xml"/>`],
    parts: [
      { name: 'docProps/custom.xml', xml: `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ${vt}>${prop(2, 'Client', 'Kestrel')}${prop(3, 'Responsible', 'Margaret Tan')}</Properties>`, type: CT.custom, pkgRel: `${REL}/custom-properties` },
      { name: 'customXml/item1.xml', xml: '<matter><client>Kestrel</client><lawyer>Margaret Tan</lawyer></matter>' },
      { name: 'customXml/itemProps1.xml', xml: '<ds:datastoreItem ds:itemID="{11111111-2222-3333-4444-555555555555}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"/>', type: 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml' },
      { name: 'customXml/_rels/item1.xml.rels', xml: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/customXmlProps" Target="itemProps1.xml"/></Relationships>` },
    ],
  });
  const r = await write(pkg);
  check(shipsClean(r) && !r.names.some((n) => /^customXml\/|^docProps\/custom\.xml$/.test(n)) && r.report.notes.some((s) => /^Custom properties and custom XML were removed/.test(s)),
    'custom properties and custom XML are removed whole, and the receipt says what they were', said(r) + ' · ' + JSON.stringify(r.report.notes));
  const keep = ['{ re: /^(customXml\\/|docProps\\/custom\\.xml$)/,', '{ re: /^$^/,'];
  const c = await write(pkg, { W: await mutated(keep) });
  check(!!c.report.held && /docProps\/custom\.xml/.test(c.held) && /customXml\/item1\.xml/.test(c.held), 'CONTROL: kept, the custom properties and the custom XML hold the file', said(c));
  // the walker once read two property values side by side as one word ("KestrelMargaret Tan"),
  // where neither name has a boundary: kept, they shipped under a gate that passed. The gate now
  // reads text for the table's names run together too (owner ruling 1), so it is off here with
  // the mask's own reading of them (EDGE)
  const c2 = await write(pkg, { engine: EDGE, W: await mutated(keep,
    ['para: ctx.inText ? state.para : ++state.seq', 'para: state.para', 'docx.ts'],
    [" || key === 'vt:lpwstr' || key === 'vt:lpstr'", '', 'docx.ts'], GATE_TEXT_RUN_OFF) });
  check(!c2.report.held && c2.leaks.some((l) => l.startsWith('docProps/custom.xml')), 'CONTROL: kept, with each value no longer a line of its own and text read for names at a word\'s edges only, both ship readable', said(c2));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 7: no reviewer\'s name or initials is left anywhere —');
{
  const when = 'w:date="2026-09-01T09:00:00Z"';
  const body = `<w:p><w:ins w:id="1" w:author="Margaret Tan" ${when}><w:r><w:t>Inserted.</w:t></w:r></w:ins><w:del w:id="2" w:author="Kestrel Reviewer" ${when}><w:r><w:delText>Gone.</w:delText></w:r></w:del></w:p>`
    + `<w:p><w:pPr><w:rPr><w:ins w:id="3" w:author="Margaret Tan" ${when}/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:rPrChange w:id="4" w:author="Margaret Tan" ${when}><w:rPr/></w:rPrChange></w:rPr><w:t>Bold.</w:t></w:r></w:p>`
    + '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Noted.</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>';
  const pkg = await docx({
    body, parts: [
      { name: 'word/comments.xml', xml: `<w:comments ${NS}><w:comment w:id="0" w:author="Margaret Tan" w:initials="MT" ${when}>${para('Check with Kestrel.')}</w:comment></w:comments>`, type: CT.comments, rel: ['comments', 'comments.xml'] },
      { name: 'word/people.xml', xml: `<w15:people ${NS}><w15:person w15:author="Margaret Tan"><w15:presenceInfo w15:providerId="AD" w15:userId="S::margaret.tan@kestrel.example::1"/></w15:person></w15:people>`, type: CT.people, rel: ['http://schemas.microsoft.com/office/2011/relationships/people', 'people.xml'] },
    ],
  });
  const r = await write(pkg);
  const authors = Object.entries(r.raw).filter(([, x]) => /:(author|initials)="/.test(x)).map(([n]) => n);
  check(shipsClean(r) && authors.length === 0 && !r.names.includes('word/comments.xml') && !r.names.includes('word/people.xml'),
    'tracked changes accepted or taken out, formatting changes, comments and the people list: no author or initials in any part', `${said(r)} · ${authors.join(', ')}`);
  check(r.report.notes.some((s) => /no reviewer's name or initials is in the copy/.test(s)), 'the receipt says so', JSON.stringify(r.report.notes));
  const c = await write(pkg, { W: await mutated(["'w:rPrChange', ", "'w:rPrChangeOff', "]) });
  check(!!c.report.held && /reviewer's name or initials is still on a w:rPrChange/.test(c.held), 'CONTROL: a formatting change left in holds the file on its author', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 8: alt-text and shape names on text boxes, shapes and tables —');
{
  const box = '<w:p><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
    + '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>914400</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>914400</wp:posOffset></wp:positionV><wp:extent cx="1828800" cy="457200"/><wp:wrapNone/>'
    + '<wp:docPr id="2" name="Kestrel box" title="Margaret Tan" descr="Kestrel callout"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvPr id="2" name="Kestrel box" descr="Kestrel callout"/><wps:cNvSpPr txBox="1"/>'
    + '<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr><wps:txbx><w:txbxContent>' + para('Box text') + '</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>';
  const vml = '<w:p><w:r><w:pict><v:rect id="_x0000_s1027" alt="Margaret Tan portrait frame" o:title="Kestrel" style="width:100pt;height:50pt"/></w:pict></w:r></w:p>';
  const tbl = '<w:tbl><w:tblPr><w:tblCaption w:val="Kestrel table"/><w:tblDescription w:val="Margaret Tan"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>' + para('Cell') + '</w:tc></w:tr></w:tbl>';
  const pkg = await docx({ body: box + vml + tbl });
  const r = await write(pkg);
  const doc = r.raw['word/document.xml'] || '';
  check(shipsClean(r) && !/\b(descr|title|alt|o:title)="/.test(doc) && !/w:tblCaption|w:tblDescription/.test(doc) && /<wp:docPr id="2" name="Object 2"\/>/.test(doc),
    'the descriptions and titles go, the shape takes a neutral name', said(r));
  const c = await write(pkg, { W: await mutated(["NV_PROPS.test(tag) ? ['title', 'descr'] :", "false ? ['title', 'descr'] :"]) });
  check(!!c.report.held && /alt-text @descr/.test(c.held), 'CONTROL: left on the text box, the description holds the file', said(c));
  // a legacy (VML) shape's id is its name in the Selection Pane, and a text box names the box
  // its story flows on into: renamed after the highest id Word gave, where until 2026-09-23 the
  // file held with no way through
  const named = '<w:p><w:r><w:pict><v:shape id="Kestrel signing block" o:spid="_x0000_s1029" style="width:100pt;height:50pt;mso-next-textbox:#Kestrel signing block 2"/></w:pict></w:r></w:p>';
  const pv = await docx({ body: vml + named });
  const rv = await write(pv);
  check(shipsClean(rv) && /<v:shape id="_x0000_s1030" o:spid="_x0000_s1029" style="width:100pt;height:50pt;mso-next-textbox:#_x0000_s1031"\/>/.test(rv.raw['word/document.xml'] || ''),
    'the shape is renamed _x0000_s1030, above the ids Word gave, and the text box it flows into follows', said(rv) + ' · ' + ((rv.raw['word/document.xml'] || '').match(/<v:shape [^>]*>/g) || []).join(' '));
  const cv = await write(pv, { W: await mutated(['if (attrs.id) attrs.id = vmlId(attrs.id, st);', '']) });
  check(!!cv.report.held && /a drawn shape is still named "Kestrel signing block"/.test(cv.held), 'CONTROL: with the id not renamed, the gate holds on it', said(cv));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 9: an e-mail address behind a link —');
{
  const pkg = await docx({
    body: '<w:p><w:hyperlink r:id="rIdMail"><w:r><w:t>write to her</w:t></w:r></w:hyperlink></w:p>',
    rels: [`<Relationship Id="rIdMail" Type="${REL}/hyperlink" Target="mailto:margaret.tan@kestrel.example" TargetMode="External"/>`],
  });
  const r = await write(pkg);
  check(shipsClean(r) && !/TargetMode="External"/.test(r.raw['word/_rels/document.xml.rels'] || '') && r.report.removed.externalLinks === 1 && /write to her/.test(r.raw['word/document.xml'] || ''),
    'the mailto: target goes; the words of the link stay as text', said(r));
  // the link's relationship goes twice over: as an external target, and as a relationship no
  // kept element names once the link is unwrapped (law 31); both are turned off to see the gate
  const c = await write(pkg, { W: await mutated(["if (a.TargetMode === 'External') { report.removed.externalLinks++; ids.add(String(a.Id)); continue; }", ''], ['/\\/(image|hyperlink)$/.test(', '/\\/(image)$/.test(']) });
  check(!!c.report.held && /external link/.test(c.held), 'CONTROL: kept, the external target holds the file', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 10: theme and font names —');
{
  const theme = '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Kestrel Theme"><a:themeElements><a:clrScheme name="Kestrel"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1></a:clrScheme>'
    + '<a:fontScheme name="Margaret Tan fonts"><a:majorFont><a:latin typeface="Kestrel Serif"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Kestrel Sans"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
    + '<a:fmtScheme name="Office"/></a:themeElements></a:theme>';
  const fonts = `<w:fonts ${NS}><w:font w:name="Kestrel Sans"><w:altName w:val="Margaret Tan Sans"/><w:panose1 w:val="020B0604020202020204"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font><w:font w:name="Calibri"><w:family w:val="swiss"/></w:font></w:fonts>`;
  const pkg = await docx({
    body: '<w:p><w:r><w:rPr><w:rFonts w:ascii="Kestrel Sans" w:hAnsi="Kestrel Sans"/></w:rPr><w:t>Styled.</w:t></w:r></w:p>',
    parts: [{ name: 'word/theme/theme1.xml', xml: theme, type: CT.theme, rel: ['theme', 'theme/theme1.xml'] }, { name: 'word/fontTable.xml', xml: fonts, type: CT.fontTable, rel: ['fontTable', 'fontTable.xml'] }],
  });
  const r = await write(pkg);
  const face = /<w:font w:name="([^"]*)"/.exec(r.raw['word/fontTable.xml'] || '')?.[1], run = /w:ascii="([^"]*)"/.exec(r.raw['word/document.xml'] || '')?.[1];
  check(shipsClean(r) && !!face && face === run && /<w:font w:name="Calibri">/.test(r.raw['word/fontTable.xml'] || ''),
    'masked in the theme, the font table and the run alike, so the run still names the font the table lists; "Calibri" is untouched', `${said(r)} · ${face} / ${run}`);
  const c = await write(pkg, { W: await mutated(["'a:theme': { name: ['ident', 'a theme name'] }", "'a:themeOff': { name: ['ident', 'a theme name'] }"]) });
  check(!!c.report.held && /a:theme@name/.test(c.held), 'CONTROL: the theme\'s own name left unmasked holds the file', said(c));

  // Word finds a font by its whole spelling, and a theme or font is named the way an identifier
  // is: "KestrelSans", a colour "MargaretTan" shipped under a passing gate until 2026-09-23,
  // since a row's match needs the space
  const glued = '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Kestrel_Brand"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1></a:clrScheme>'
    + '<a:fontScheme name="KestrelFonts"><a:majorFont><a:latin typeface="KestrelSerif"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="KestrelSans"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
    + '<a:fmtScheme name="Office"/></a:themeElements><a:custClrLst><a:custClr name="MargaretTan"><a:srgbClr val="00808A"/></a:custClr></a:custClrLst></a:theme>';
  const pg = await docx({
    body: '<w:p><w:r><w:rPr><w:rFonts w:ascii="KestrelSans" w:hAnsi="KestrelSans"/></w:rPr><w:t>Styled.</w:t></w:r></w:p>',
    parts: [{ name: 'word/theme/theme1.xml', xml: glued, type: CT.theme, rel: ['theme', 'theme/theme1.xml'] }],
  });
  const rg = await write(pg);
  const th = rg.raw['word/theme/theme1.xml'] || '';
  check(shipsClean(rg) && /<a:theme [^>]*name="Redacted theme \d"/.test(th) && /<a:custClr name="Redacted colour 1">/.test(th) && /<a:clrScheme name="Office">/.test(th)
    && /<a:latin typeface="(Redacted font \d)"\/><a:ea typeface=""\/><a:cs typeface=""\/><\/a:minorFont>/.exec(th)?.[1] === /w:ascii="([^"]*)"/.exec(rg.raw['word/document.xml'] || '')?.[1]
    && rg.report.notes.some((s) => /^2 font names that carried something masked were renamed "Redacted font 1" and "Redacted font 2"; where the recipient has no font of that name, Word shows a substitute\./.test(s)),
  'glued names are renamed whole — the theme, the fonts, the colour — the run still names the font the theme lists, "Office" is untouched, and the receipt says a substitute is shown',
  `${said(rg)} · ${(th.match(/name="[^"]*"|typeface="[^"]*"/g) || []).join(' ')} · ${JSON.stringify(rg.report.notes)}`);
  const cg = await write(pg, { W: await mutated(["const FACE: Record<string, [Mode, string]> = { typeface: ['ident', 'a font name'] };", "const FACE: Record<string, [Mode, string]> = { typeface: ['text', 'a font name'] };"],
    ["const F: [Mode, string] = ['ident', 'a font name'];", "const F: [Mode, string] = ['text', 'a font name'];"],
    ["'a:theme': { name: ['ident', 'a theme name'] }", "'a:theme': { name: ['text', 'a theme name'] }"],
    ["'a:fontScheme': { name: ['ident', 'a theme name'] }", "'a:fontScheme': { name: ['text', 'a theme name'] }"],
    ["'a:custClr': { name: ['ident', 'a colour name'] }", "'a:custClr': { name: ['text', 'a colour name'] }"]) });
  check(!cg.report.held && /w:ascii="\[[^\]]+\]Sans"/.test(cg.raw['word/document.xml'] || ''), 'CONTROL: masked and read as text, a glued font name carries a tag inside it where the check above wants it renamed whole', `${said(cg)} · ${/w:ascii="[^"]*"/.exec(cg.raw['word/document.xml'] || '')?.[0]}`);

  // what every machine has is never the firm's: "Roman" and "Georgia" are a surname and a
  // place, and "Times New Roman" was masked into a font no machine has on every run it set
  const std = await docx({
    body: '<w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Set in Times.</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/></w:rPr><w:t>And Georgia type.</w:t></w:r></w:p>',
    parts: [{ name: 'word/fontTable.xml', xml: `<w:fonts ${NS}><w:font w:name="Times New Roman"><w:family w:val="roman"/></w:font><w:font w:name="Georgia"><w:family w:val="roman"/></w:font></w:fonts>`, type: CT.fontTable, rel: ['fontTable', 'fontTable.xml'] }],
  });
  const rowsS = [...ROWS, row('rm', 'Roman', '[Person2]', 'PERSON', 'person'), row('ga', 'Georgia', '[Person3]', 'PERSON', 'person')];
  const rs = await write(std, { rows: rowsS });
  const ds = rs.raw['word/document.xml'] || '';
  check(!rs.report.held && /w:ascii="Times New Roman" w:hAnsi="Times New Roman"/.test(ds) && /w:ascii="Georgia"/.test(ds) && /<w:font w:name="Times New Roman">/.test(rs.raw['word/fontTable.xml'] || '') && /And \[Person3\] type\./.test(ds),
    'Times New Roman and Georgia keep their names under rows "Roman" and "Georgia", which are still masked in the text', said(rs) + ' · ' + (ds.match(/w:ascii="[^"]*"/g) || []).join(' '));
  const cs = await write(std, { rows: rowsS, W: await mutated(['if (!v || STANDARD_FONT.test(v) || NEUTRAL_IDENT.test(v)) return value;', 'if (!v || NEUTRAL_IDENT.test(v)) return value;']) });
  check(!/w:ascii="Times New Roman"/.test(cs.raw['word/document.xml'] || ''), 'CONTROL: read like a name the author chose, Times New Roman is renamed', said(cs));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 11: building blocks saved in the file (the glossary) —');
{
  const gl = `<w:glossaryDocument ${NS}><w:docParts><w:docPart><w:docPartPr><w:name w:val="Kestrel cover"/></w:docPartPr><w:docPartBody>${para('Kestrel standard terms for Margaret Tan')}</w:docPartBody></w:docPart></w:docParts></w:glossaryDocument>`;
  const pkg = await docx({ parts: [
    { name: 'word/glossary/document.xml', xml: gl, type: CT.glossary, rel: ['glossaryDocument', 'glossary/document.xml'] },
    { name: 'word/glossary/_rels/document.xml.rels', xml: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>' },
  ] });
  const r = await write(pkg);
  check(shipsClean(r) && !r.names.some((n) => n.startsWith('word/glossary/')) && r.report.notes.some((s) => /^Building blocks saved inside the file/.test(s)),
    'removed whole, and the receipt says what they were', said(r));
  const c = await write(pkg, { W: await mutated(['{ re: /^word\\/glossary\\//,', '{ re: /^$^/,']) });
  check(!!c.report.held || c.names.some((n) => n.startsWith('word/glossary/')), 'CONTROL: with the removal off, the glossary is not removed', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 12: the sensitivity-label record —');
{
  const label = '<clbl:labelList xmlns:clbl="http://schemas.microsoft.com/office/2020/mipLabelMetadata"><clbl:label id="{3c3a0f4e-1111-2222-3333-444455556666}" enabled="1" method="Standard" siteId="{72f988bf-86f1-41af-91ab-2d7cd011db47}" removed="0"/></clbl:labelList>';
  const pkg = await docx({ parts: [{ name: 'docMetadata/LabelInfo.xml', xml: label, type: CT.label, pkgRel: 'http://schemas.microsoft.com/office/2020/02/relationships/classificationlabels' }] });
  const r = await write(pkg);
  check(shipsClean(r) && !r.names.some((n) => n.startsWith('docMetadata/')) && r.report.notes.some((s) => /tenant ID/.test(s)) && !/classificationlabels/.test(r.raw['_rels/.rels'] || ''),
    'removed with its relationship, and the receipt says it carried the firm\'s tenant ID', said(r));
  // method="Standard" is a word the unknown-part check reads as typed (law 28), so that check
  // is turned off with the removal to see what the gate alone would do
  const c = await write(pkg, { W: await mutated(['{ re: /^docMetadata\\//,', '{ re: /^$^/,'], ['if (typed(tree)) return hold(', 'if (false) return hold(']) });
  check(c.names.includes('docMetadata/LabelInfo.xml'), 'CONTROL: with the removal off, the record ships (it names nothing the table holds)', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 13: every bookmark the author named is renamed, and everything pointing at it follows —');
{
  const bm = (id, name, text) => `<w:p><w:bookmarkStart w:id="${id}" w:name="${name}"/><w:r><w:t>${text}</w:t></w:r><w:bookmarkEnd w:id="${id}"/></w:p>`;
  const link = (name, text) => `<w:p><w:hyperlink w:anchor="${name}"><w:r><w:t>${text}</w:t></w:r></w:hyperlink></w:p>`;
  const simple = (instr, res) => `<w:p><w:fldSimple w:instr="${instr}"><w:r><w:t>${res}</w:t></w:r></w:fldSimple></w:p>`;
  // Word splits an instruction across runs anywhere: the name arrives in two pieces
  const split = '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGEREF Kes</w:instrText></w:r><w:r><w:instrText xml:space="preserve">trelSPA \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
  const body = bm(0, 'KestrelSPA', 'Clause 1') + bm(1, 'Matter_447122109983', 'Clause 2') + bm(2, '_Kestrel', 'hidden') + bm(3, '_Toc462382735', 'Heading')
    + bm(4, '_GoBack', 'here') + bm(5, 'ClauseTwo', 'Clause two') + bm(6, 'MargaretTanLetter', 'Letter')
    + link('KestrelSPA', 'see clause 1') + link('clausetwo', 'see clause two') + split
    + simple(' REF Matter_447122109983 \\h ', 'Clause 2') + simple(' NOTEREF _Kestrel \\h ', '1') + simple(' TOC \\o &quot;1-3&quot; \\b ClauseTwo \\h ', 'Contents')
    + simple(' PAGEREF _Toc462382735 \\h ', '3');
  const header = bm(7, 'Letterhead_Kestrel', 'x') + simple(' PAGEREF KestrelSPA \\h ', '1');
  const pkg = await docx({ body, header });
  const r = await write(pkg);
  const marks = (x) => [...(x || '').matchAll(/w:bookmarkStart[^>]*w:name="([^"]*)"/g)].map((m) => m[1]);
  const d = dangling(r.raw);
  check(shipsClean(r) && !Object.values(r.raw).some((x) => x.includes('447122109983')), 'no bookmark, link or field carries either name, or the matter number', said(r));
  check(JSON.stringify(marks(r.raw['word/document.xml'])) === '["bm1","bm2","_bm3","_Toc462382735","_GoBack","bm4","bm5"]' && JSON.stringify(marks(r.raw['word/header1.xml'])) === '["bm6"]',
    'renamed bm1, bm2 … in document order (a hidden one _bm3), whatever it was called; Word\'s own _Toc and _GoBack keep theirs',
    JSON.stringify([marks(r.raw['word/document.xml']), marks(r.raw['word/header1.xml'])]));
  // a REF is not a field the writer keeps: it is unlinked, its result left as the text it showed
  check(d.bad.length === 0 && d.refs === 7 && !/ REF /.test(r.raw['word/document.xml'] || ''),
    `every link, PAGEREF (the split one and the header's included), NOTEREF and TOC \\b finds its bookmark (${d.refs} references); the REF is unlinked`, d.bad.join(' | '));
  check(r.report.notes.some((s) => /^All 6 bookmarks the author made were renamed bm1, bm2/.test(s)) && r.report.removed.names >= 6, 'the receipt says they were renamed', JSON.stringify(r.report.notes));
  const c1 = await write(pkg, { W: await mutated(['if (!name || WORD_BOOKMARK.test(name)) return name;', 'return name;']) });
  check(!!c1.report.held && /a bookmark is still named/.test(c1.held), 'CONTROL: with nothing renamed, the gate holds on the bookmark names', said(c1));
  const c2 = await write(pkg, { W: await mutated(['const to = rewriteInstr(f.instr, st);', 'const to = f.instr;']) });
  check(!!c2.report.held && /KestrelSPA/.test(c2.held), 'CONTROL: with the split instruction not following, the gate holds on the name it still carries', said(c2));
  // REDACTION_AUDIT gap 3: names no reading of the table could find (a single-case glue, a
  // declared number without its separators) shipped under a gate that passed
  const glued = await docx({ body: bm(0, 'KESTRELSPA', 'a') + bm(1, 'spakestrel', 'b') + bm(2, 'Acct_4471_2210_9983', 'c') + bm(3, 'Acct447122109983', 'd') + simple(' PAGEREF Acct447122109983 \\h ', '4') });
  const g = await write(glued, { terms: [...TERMS, '4471-2210-9983'] });
  check(shipsClean(g) && JSON.stringify(marks(g.raw['word/document.xml'])) === '["bm1","bm2","bm3","bm4"]' && !Object.values(g.raw).some((x) => /4471/.test(x)) && dangling(g.raw).bad.length === 0,
    '"KESTRELSPA", "spakestrel" and a declared account number glued into a bookmark name are renamed like the rest, and the page reference follows', said(g));
  // a name the table does not hold: nothing holds, so only the reference check stands between
  // the recipient and a cross-reference that reads "Error! Reference source not found."
  const plain = await docx({ body: bm(0, 'ClauseTwo', 'Clause two') + simple(' PAGEREF ClauseTwo \\h ', '2') });
  const p = await write(plain);
  check(!p.report.held && dangling(p.raw).bad.length === 0 && dangling(p.raw).refs === 1, 'a page reference to a name nothing masks follows its bookmark too', said(p));
  const c3 = await write(plain, { W: await mutated(["attrs!['w:instr'] = rewriteInstr(instr, st);", 'void 0;']) });
  check(!c3.report.held && dangling(c3.raw).bad.length === 1, 'CONTROL: with the field not following, the file ships with a cross-reference to a bookmark that is gone', `${said(c3)} · ${dangling(c3.raw).bad.join(' | ')}`);

  // what the receipt says of them is what happened: a REF is unlinked, not followed, and a
  // link to a bookmark the file does not have is not a bookmark the author made. Until
  // 2026-09-23 the note said cross-references still pointed at the renamed bookmarks, and
  // counted every name a link or a field named.
  check(r.report.notes.some((s) => /^A cross-reference \(a REF field\) was written out as the text it showed, and will not update in the copy\./.test(s)),
    'the receipt says the REF was written out as its text', JSON.stringify(r.report.notes));
  const missing = await docx({ body: bm(0, 'ClauseTwo', 'Clause two') + link('Nowhere', 'see nowhere') + simple(' PAGEREF Missing \\h ', '9') });
  const m = await write(missing);
  check(!m.report.held && m.report.notes.some((s) => /^The bookmark the author made was renamed bm1,/.test(s)) && m.report.removed.names === 1,
    'two references to bookmarks the file does not have are not counted as bookmarks', `${said(m)} · ${JSON.stringify(m.report.notes)} · names ${m.report.removed.names}`);
  const cm = await write(missing, { W: await mutated(['if (mark && !st.shared.marks.has(k)) {', 'if (!st.shared.marks.has(k)) {']) });
  check(cm.report.notes.some((s) => /^All 3 bookmarks the author made were renamed/.test(s)), 'CONTROL: counted wherever a name is renamed, the receipt says three', JSON.stringify(cm.report.notes));
  // Word matches a link to its bookmark without regard to case: "_TOC…" is Word's own name
  const toc = await docx({ body: bm(0, '_Toc462382735', 'Heading') + link('_TOC462382735', 'see heading') + simple(' PAGEREF _TOC462382735 \\h ', '1') });
  const t = await write(toc);
  check(!t.report.held && dangling(t.raw).bad.length === 0 && dangling(t.raw).refs === 2 && /w:anchor="_TOC462382735"/.test(t.raw['word/document.xml'] || ''),
    'a link and a page reference written "_TOC…" to the bookmark "_Toc…" keep their names and still find it', `${said(t)} · ${dangling(t.raw).bad.join(' | ')}`);
  const ct2 = await write(toc, { W: await mutated(['const WORD_BOOKMARK = /^_(?:(?:Toc|Ref|Hlk)\\d+|GoBack)$/i;', 'const WORD_BOOKMARK = /^_(?:(?:Toc|Ref|Hlk)\\d+|GoBack)$/;']) });
  check(dangling(ct2.raw).bad.length === 2, 'CONTROL: matched with regard to case, both are renamed and point at nothing', `${said(ct2)} · ${dangling(ct2.raw).bad.join(' | ')}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 14: a table of contents is not held by its own page references —');
{
  const run = (x) => `<w:r>${x}</w:r>`;
  const fc = (t) => run(`<w:fldChar w:fldCharType="${t}"/>`);
  const it = (t) => run(`<w:instrText xml:space="preserve">${t}</w:instrText>`);
  const toc = `<w:p>${fc('begin')}${it(' TOC \\o "1-3" \\h \\z \\u ')}${fc('separate')}<w:hyperlink w:anchor="_Toc462382735" w:history="1">${run('<w:t>Heads of terms</w:t>')}${run('<w:tab/>')}${fc('begin')}${it(' PAGEREF _Toc462382735 \\h ')}${fc('separate')}${run('<w:t>1</w:t>')}${fc('end')}</w:hyperlink></w:p><w:p>${fc('end')}</w:p>`
    + '<w:p><w:bookmarkStart w:id="0" w:name="_Toc462382735"/><w:r><w:t>Heads of terms</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>';
  const pkg = await docx({ body: toc });
  const r = await write(pkg);
  const doc = r.raw['word/document.xml'] || '';
  check(shipsClean(r) && doc.includes(' PAGEREF _Toc462382735 \\h ') && doc.includes('w:anchor="_Toc462382735"') && dangling(r.raw).bad.length === 0,
    'Word\'s _Toc names and the page references to them ship as Word wrote them, and resolve', said(r));
  const c = await write(pkg, { W: await mutated(["(WORD_BOOKMARK.test(tok) || NEUTRAL_REF.test(tok) || NEUTRAL_NAME.test(tok) ? '█'.repeat(tok.length) : tok)", 'tok']) });
  check(!!c.report.held && /field code: 1 span\(s\) still readable — "[^"]*_Toc«462382735»/.test(c.held),
    'CONTROL: read as written, "_Toc462382735" is a phone number to the safety-net pattern and holds every file with a contents page', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 15: fonts and embedded files are removed and said; an unknown binary part holds (law 1) —');
{
  const fonts = `<w:fonts ${NS}><w:font w:name="Calibri"><w:family w:val="swiss"/><w:embedRegular r:id="rIdFont" w:fontKey="{11111111-2222-3333-4444-555555555555}"/></w:font></w:fonts>`;
  const pkg = await docx({
    body: '<w:p><w:r><w:object w:dxaOrig="1440" w:dyaOrig="1440"><o:OLEObject Type="Embed" ProgID="Excel.Sheet.12" ShapeID="_x0000_i1025" DrawAspect="Icon" ObjectID="_1234567890" r:id="rIdOle"/></w:object></w:r></w:p>',
    defaults: [['odttf', 'application/vnd.openxmlformats-officedocument.obfuscatedFont'], ['bin', CT.ole]],
    parts: [
      { name: 'word/fontTable.xml', xml: fonts, type: CT.fontTable, rel: ['fontTable', 'fontTable.xml'] },
      { name: 'word/_rels/fontTable.xml.rels', xml: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdFont" Type="${REL}/font" Target="fonts/font1.odttf"/></Relationships>` },
      { name: 'word/fonts/font1.odttf', data: enc('\u0000font made by Margaret Tan at Kestrel\u0000') },
      { name: 'word/embeddings/oleObject1.bin', data: enc('\u0000Kestrel workbook\u0000'), rel: ['oleObject', 'embeddings/oleObject1.bin', 'rIdOle'] },
    ],
  });
  const r = await write(pkg);
  check(shipsClean(r) && !r.names.some((n) => /^word\/(fonts|embeddings)\//.test(n)) && !/w:embedRegular/.test(r.raw['word/fontTable.xml'] || '')
    && r.report.notes.some((s) => /^Fonts embedded in the file were removed/.test(s)) && r.report.notes.some((s) => /^Embedded files were removed: each object inserted into the text .* is gone from the page/.test(s))
    && !r.report.notes.some((s) => /chart/.test(s)),
  'the font and the embedded workbook are removed, the font table no longer points at them, and the receipt says both — the object is gone from the page, and no chart is mentioned', `${said(r)} · ${JSON.stringify(r.report.notes)}`);
  const c = await write(pkg, { W: await mutated(['{ re: /^word\\/fonts\\//,', '{ re: /^$^/,']) });
  check(!!c.report.held && /word\/fonts\/font1\.odttf/.test(c.held), 'CONTROL: with fonts not removed, the font holds the file as a part nothing can read', said(c));
  // the workbook behind a chart: the chart keeps its values, and loses Edit Data
  const chart = `<c:chartSpace ${NS}><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart><c:externalData r:id="rIdWb"/></c:chartSpace>`;
  const pc = await docx({
    body: '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>',
    defaults: [['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']],
    parts: [
      { name: 'word/charts/chart1.xml', xml: chart, type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] },
      { name: 'word/charts/_rels/chart1.xml.rels', xml: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdWb" Type="${REL}/package" Target="../embeddings/Microsoft_Excel_Worksheet.xlsx"/></Relationships>` },
      { name: 'word/embeddings/Microsoft_Excel_Worksheet.xlsx', data: enc('PK\u0003\u0004Kestrel') },
    ],
  });
  const rc = await write(pc);
  check(shipsClean(rc) && rc.report.notes.some((s) => /^Embedded files were removed: the spreadsheet behind each chart: the charts still show their values, but Edit Data will not open\./.test(s)),
    'an embedding that belongs to a chart is said as the spreadsheet behind the chart', `${said(rc)} · ${JSON.stringify(rc.report.notes)}`);
  const cc = await write(pkg, { W: await mutated(["embedOwners.add(/^word\\/charts\\//.test(owner) ? 'chart' : 'object');", "embedOwners.add('chart');"]) });
  check(cc.report.notes.some((s) => /spreadsheet behind each chart/.test(s)), 'CONTROL: with every embedding taken for a chart\'s, the object is said as a chart\'s spreadsheet', JSON.stringify(cc.report.notes));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 16: Word\'s own words are not read as a name —');
{
  // a signatory "Page", a "Mark" and a party "Microsoft" on the table: Word writes "page" on
  // every page break and anchored shape, "Mark" inside every watermark's id and
  // "microsoft"/"office" in every namespace, and numbers that look like phone numbers on
  // every paragraph
  const rows = [...ROWS, row('g', 'Page', '[Person2]', 'PERSON', 'person'), row('m', 'Mark', '[Person3]', 'PERSON', 'person'), row('c', 'Microsoft', '[Company1]', 'COMPANY', 'org')];
  const wm = '<w:p><w:r><w:pict><v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:path textpathok="t" o:connecttype="custom"/><v:textpath on="t" fitshape="t"/><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>'
    + '<v:shape id="PowerPlusWaterMarkObject357831064" o:spid="_x0000_s2049" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:0;width:468pt;height:117pt;rotation:315;z-index:-251655168;mso-position-horizontal:center;mso-position-horizontal-relative:margin" o:allowincell="f" fillcolor="silver" stroked="f">'
    + '<v:fill opacity=".5"/><v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="DRAFT"/><w10:wrap anchorx="margin" anchory="margin"/></v:shape></w:pict></w:r></w:p>';
  const body = '<w:p w14:paraId="61234567" w14:textId="77777777"><w:r><w:t>Page, Mark and Microsoft met.</w:t></w:r><w:r><w:br w:type="page"/></w:r></w:p>'
    + '<w:p><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="1" cy="1"/><wp:wrapNone/><wp:docPr id="3" name="Object 3"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr/><wps:spPr/><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>';
  const footer = '<w:p><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
  const pkg = await docx({ body, header: wm, parts: [{ name: 'word/footer1.xml', xml: `<w:ftr ${NS}>${footer}</w:ftr>`, type: `${WML}.footer+xml`, rel: ['footer', 'footer1.xml'] }] });
  const r = await write(pkg, { rows });
  check(!r.report.held && /\[Person2\], \[Person3\] and \[Company1\] met\./.test(r.raw['word/document.xml'] || ''),
    'the names are masked where they are written, and nothing Word wrote for itself holds the file', said(r));
  const c1 = await write(pkg, { rows, W: await mutated(['const VOCAB = /^(?:', 'const VOCAB = /^(?!)(?:']) });
  check(!!c1.report.held && /"(page|PowerPlusWaterMarkObject357831064)"|«page»|«Mark»/i.test(c1.held), 'CONTROL: read as names, "page" and the watermark\'s id hold the file', said(c1));
  const c2 = await write(pkg, { rows, W: await mutated(['const SCHEMA = /^(?:', 'const SCHEMA = /^(?!)(?:'], ['const SYNTAX_ATTR = /^(xmlns(:|$)|mc:)/;', 'const SYNTAX_ATTR = /(?!)/;']) });
  check(!!c2.report.held && /xmlns|urn:schemas-microsoft-com|schemas\.microsoft\.com/i.test(c2.held), 'CONTROL: read as names, the namespace addresses hold the file on "Microsoft"', said(c2));
  const c3 = await write(pkg, { rows, W: await mutated(["(o.mode === 'text' || (o.mode === 'ident' && lit) ? true", "(o.mode === 'text' || o.mode === 'machine' || (o.mode === 'ident' && lit) ? true"]) });
  check(!!c3.report.held && /w14:paraId: 1 span\(s\) still readable — "«61234567»"/.test(c3.held) && /relativeHeight: 1 span\(s\) still readable — "«251659264»"/.test(c3.held), 'CONTROL: read by the safety-net pattern, a paragraph id and a z-order hold the file as a phone number and a long number', said(c3));
  const c4 = await write(pkg, { rows, W: await mutated(['if ((i === 0 && KEEP_FIELD.test(t[0]))', 'if (false && (i === 0 && KEEP_FIELD.test(t[0]))']) });
  check(!!c4.report.held && /footer1\.xml field code/.test(c4.held), 'CONTROL: with the field\'s own words read, " PAGE " holds the file on the row "Page"', said(c4));
  // a legacy shape's style is CSS Word reads its place out of: masked as text, a row "Page"
  // rewrote "…-relative:page" and the shape lost its anchor, or held every v:rect (2026-09-23)
  const rect = '<w:p><w:r><w:pict><v:rect id="_x0000_s1030" style="position:absolute;width:100pt;height:50pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page"/></w:pict></w:r></w:p>';
  const pr = await docx({ body: rect });
  const rr = await write(pr, { rows });
  check(!rr.report.held && /style="position:absolute;width:100pt;height:50pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page"/.test(rr.raw['word/document.xml'] || ''),
    'a shape anchored to the page keeps "relative:page" under a row "Page"', said(rr));
  const c5 = await write(pr, { rows, W: await mutated(['if (attrs.style) attrs.style = vmlStyle(attrs.style, st);', "if (attrs.style) attrs.style = maskValue(attrs.style, 'text', 'a shape style', st);"]) });
  check(!/relative:page/.test(c5.raw['word/document.xml'] || '') && !c5.report.held, 'CONTROL: masked as text, the anchor is rewritten into a tag and ships broken', said(c5) + ' · ' + ((c5.raw['word/document.xml'] || '').match(/style="[^"]*"/) || [''])[0]);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 17: a field\'s hidden data goes with the field —');
{
  // base64 Word keeps beside some fields (w:fldData): an old hyperlink's target among them, an
  // e-mail address in UTF-16 that no reading of the text finds
  const b64 = Buffer.from('mailto:margaret.tan@kestrel.example', 'utf16le').toString('base64');
  const body = `<w:p><w:r><w:t xml:space="preserve">Write to </w:t></w:r><w:fldSimple w:instr=" HYPERLINK &quot;mailto:margaret.tan@kestrel.example&quot; "><w:fldData xml:space="preserve">${b64}</w:fldData><w:r><w:t>the client contact</w:t></w:r></w:fldSimple></w:p>`;
  const pkg = await docx({ body });
  const r = await write(pkg);
  const doc = r.raw['word/document.xml'] || '';
  check(shipsClean(r) && !/w:fldData/.test(doc) && !doc.includes(b64) && /the client contact/.test(doc), 'the unlinked field keeps its words, and its hidden data goes', said(r));
  const off = ["if (tag === 'w:fldData') { st.removed.externalLinks++; continue; }", ''];
  const c1 = await write(pkg, { W: await mutated(off) });
  check(!!c1.report.held && /hidden data \(w:fldData\)/.test(c1.held), 'CONTROL: left in, the gate holds on it', said(c1));
  const c2 = await write(pkg, { W: await mutated(off,
    ["if (parent === 'w:fldData') { leaks.push(`${part}: a field's hidden data (w:fldData) is still present`); continue; }", ''],
    ["if (tag === 'w:fldData') leaks.push(`${part}: a field's hidden data (w:fldData) is still present`);", '']) });
  check(!c2.report.held && (c2.raw['word/document.xml'] || '').includes(b64), 'CONTROL: and with the gate not looking for it, the address ships inside the paragraph', said(c2));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 18: an equation is read and masked —');
{
  // the equation editor drops the spaces in a math zone: "Kestrel EBITDA" arrives as one run,
  // KestrelEBITDA, and "Margaret Tan" as two runs with nothing between them
  const math = (runs) => `<w:p><m:oMathPara><m:oMath>${runs.map((t) => `<m:r><m:t>${t}</m:t></m:r>`).join('')}</m:oMath></m:oMathPara></w:p>`;
  const pkg = await docx({ body: math(['KestrelEBITDA', '−', 'T']) + math(['Margaret', 'Tan']) });
  const r = await write(pkg);
  const doc = r.raw['word/document.xml'] || '';
  check(shipsClean(r) && /<m:t[^>]*>\[[^\]]+\]EBITDA<\/m:t>/.test(doc) && !/<m:t[^>]*>Margaret|<m:t[^>]*>Tan</.test(doc) && /<m:t xml:space="preserve">\[Person1\]<\/m:t>/.test(doc) && /<m:t>−<\/m:t>/.test(doc),
    'the glued name and the name split over two runs are masked; the rest of the equation is as written', said(r) + ' · ' + (doc.match(/<m:t[^>]*>[^<]*<\/m:t>|<m:t[^>]*\/>/g) || []).join(''));
  // "KestrelEBITDA" is a name run together in an element's text, which the gate reads wherever
  // it stands (owner ruling 1); "Margaret" + "Tan" in two runs is found only by reading them as
  // the equation they render
  const split = await docx({ body: math(['Margaret', 'Tan']) });
  const c1 = await write(split, { W: await mutated(["'vt:lpwstr', 'vt:lpstr', 'm:t']);", "'vt:lpwstr', 'vt:lpstr']);", 'docx.ts']) });
  check(!c1.report.held && /<m:t>Margaret<\/m:t><\/m:r><m:r><m:t>Tan<\/m:t>/.test(c1.raw['word/document.xml'] || ''), 'CONTROL: with equations not read, the name split over two runs ships', said(c1));
  const c2 = await write(pkg, { engine: EDGE, W: await mutated(['        maskMath(items, st, tagsUsed);\n', ''], FLOW_RUN_OFF) });
  check(!!c2.report.held && /an equation/.test(c2.held), 'CONTROL: with the glued name not located, the gate holds on it', said(c2));
  // until W3-A the writer knew "Margaret" and "Tan" were two words only because the reader put a
  // gap between two m:r runs, and with that gap gone both shipped; the writer now reads each
  // equation as it renders, with nothing between its runs, and finds the table's names there with
  // nothing between their words, so the reader's gap is what the review screen shows and no longer
  // what the copy depends on. The controls that break the writer's own read are in law 26.
  const c3 = await write(pkg, { W: await mutated(["else if (key === 'm:r') state.gap = true;", '', 'docx.ts']) });
  check(shipsClean(c3) && !/<m:t[^>]*>(?:Margaret|Tan)</.test(c3.raw['word/document.xml'] || ''), 'with the reader\'s two runs read as one word, "MargaretTan", the equation\'s own read still masks both', said(c3));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 19: a chart\'s cell references and pivot source name no sheet, range or workbook —');
{
  const c15 = 'xmlns:c15="http://schemas.microsoft.com/office/drawing/2012/chart"';
  const chart = (inner, pivot = '') => `<c:chartSpace ${NS} ${c15}>${pivot}<c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/>${inner}</c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  const labels = '<c:extLst><c:ext uri="{02D57815-91ED-43cb-92C2-25804820EDAC}"><c15:datalabelsRange><c15:f>MargaretTan_Labels!$C$2:$C$3</c15:f></c15:datalabelsRange></c:ext></c:extLst>';
  const full = chart('<c:tx><c:strRef><c:f>\'Kestrel Model\'!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Fees</c:v></c:pt></c:strCache></c:strRef></c:tx>'
    + '<c:cat><c:strRef><c:f>\'Kestrel Model\'!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>2025</c:v></c:pt><c:pt idx="1"><c:v>2026</c:v></c:pt></c:strCache></c:strRef></c:cat>'
    + '<c:val><c:numRef><c:f>KestrelRevenue</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>4</c:v></c:pt><c:pt idx="1"><c:v>5</c:v></c:pt></c:numCache></c:numRef></c:val>' + labels,
  '<c:pivotSource><c:name>[Kestrel Model.xlsx]Margaret Tan fees!PivotTable1</c:name><c:fmtId val="0"/></c:pivotSource>');
  const body = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const pkgOf = (xml) => docx({ body, parts: [{ name: 'word/charts/chart1.xml', xml, type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] }] });
  const pkg = await pkgOf(full);
  const r = await write(pkg);
  const ch = r.raw['word/charts/chart1.xml'] || '';
  // the workbook they point into went with the embedded files; until 2026-09-23 a sheet name
  // that placed held the file with no way through, and a range's or a book's name was not read
  check(shipsClean(r) && /<c:f>Sheet1!\$B\$1<\/c:f>/.test(ch) && /<c:f>Sheet1!\$A\$2:\$A\$3<\/c:f>/.test(ch) && /<c:f>Name1<\/c:f>/.test(ch) && /<c15:f>Sheet2!\$C\$2:\$C\$3<\/c15:f>/.test(ch)
    && /<c:name>\[Book1\.xlsx\]Sheet1!PivotTable1<\/c:name>/.test(ch) && !r.report.warnings.some((w) => /worksheet name/.test(w))
    && r.report.notes.some((s) => /^The charts' cell references now call the workbook its sheets Sheet1 and Sheet2, its named ranges Name1 and its pivot tables PivotTable1, whatever they were called:/.test(s)),
  'sheets become Sheet1, Sheet2, a named range Name1, the pivot source a neutral one; the cells stay as written, and the receipt says so', `${said(r)} · ${(ch.match(/<c(15)?:f>[^<]*|<c:name>[^<]*/g) || []).join(' ')}`);
  const c1 = await write(pkg, { W: await mutated(["if (FORMULA_TAGS.has(tag)) for (const c of n[tag] as XNode[]) if ('#text' in c) c['#text'] = neutralFormula(String(c['#text']), st);", '']) });
  check(!!c1.report.held && /a chart's cell reference still names "Kestrel Model"/.test(c1.held), 'CONTROL: with the formulas left as written, the gate holds on the sheet they name', said(c1));
  const c2 = await write(pkg, { W: await mutated(["if (tag === 'c:name' && parent === 'c:pivotSource') {", 'if (false) {']) });
  check(!!c2.report.held && /a pivot chart still names its source/.test(c2.held), 'CONTROL: with the pivot source masked as text, the gate holds on what is left of it', said(c2));
  // the names no reading of text finds: a glued range, a glued sheet
  const glued = await pkgOf(chart('<c:val><c:numRef><c:f>KestrelRevenue</c:f><c:numCache><c:ptCount val="1"/><c:pt idx="0"><c:v>4</c:v></c:pt></c:numCache></c:numRef></c:val>' + labels));
  const c3 = await write(glued, { W: await mutated(["if (FORMULA_TAGS.has(tag)) for (const c of n[tag] as XNode[]) if ('#text' in c) c['#text'] = neutralFormula(String(c['#text']), st);", ''],
    ['if (FORMULA_TAGS.has(parent)) { for (const b of formulaForeign(v)) leaks.push(`${part}: a chart\'s cell reference still names "${b}"`); continue; }', ''], GATE_TEXT_RUN_OFF), engine: EDGE });
  check(!c3.report.held && c3.leaks.length > 0, 'CONTROL: left as written and read as text for names at a word\'s edges only, a glued range and sheet ship', said(c3));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 20: an Office 2016 chart and a text box drawn on a chart are read and masked —');
{
  const chartEx = '<cx:chartSpace xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><cx:chartData><cx:data id="0">'
    + '<cx:strDim type="cat"><cx:f>Sheet1!$A$2:$A$3</cx:f><cx:lvl ptCount="2"><cx:pt idx="0">Margaret Tan</cx:pt><cx:pt idx="1">Kestrel</cx:pt></cx:lvl></cx:strDim>'
    + '<cx:numDim type="val"><cx:f>Sheet1!$B$2:$B$3</cx:f><cx:lvl ptCount="2" formatCode="General"><cx:pt idx="0">4</cx:pt><cx:pt idx="1">5</cx:pt></cx:lvl></cx:numDim></cx:data></cx:chartData>'
    + '<cx:chart><cx:plotArea><cx:plotAreaRegion><cx:series layoutId="waterfall"><cx:dataId val="0"/></cx:series></cx:plotAreaRegion></cx:plotArea></cx:chart></cx:chartSpace>';
  const chart = `<c:chartSpace ${NS}><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart><c:userShapes r:id="rIdUs"/></c:chartSpace>`;
  const shapes = '<c:userShapes xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:cdr="http://schemas.openxmlformats.org/drawingml/2006/chartDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><cdr:relSizeAnchor><cdr:from><cdr:x>0.1</cdr:x><cdr:y>0.1</cdr:y></cdr:from><cdr:to><cdr:x>0.5</cdr:x><cdr:y>0.3</cdr:y></cdr:to>'
    + '<cdr:sp macro="" textlink=""><cdr:nvSpPr><cdr:cNvPr id="2" name="TextBox 1"/><cdr:cNvSpPr txBox="1"/></cdr:nvSpPr><cdr:spPr/><cdr:txBody><a:bodyPr/><a:p><a:r><a:t>Paid to Margaret Tan</a:t></a:r></a:p></cdr:txBody></cdr:sp></cdr:relSizeAnchor></c:userShapes>';
  const graphic = (uri, rid) => `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="${uri}"><c:chart r:id="${rid}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  const pkg = await docx({
    body: graphic('http://schemas.microsoft.com/office/drawing/2014/chartex', 'rIdCx') + graphic('http://schemas.openxmlformats.org/drawingml/2006/chart', 'rIdChart'),
    parts: [
      { name: 'word/charts/chartEx1.xml', xml: chartEx, type: 'application/vnd.ms-office.chartex+xml', rel: ['http://schemas.microsoft.com/office/2014/relationships/chartEx', 'charts/chartEx1.xml', 'rIdCx'] },
      { name: 'word/charts/chart1.xml', xml: chart, type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] },
      { name: 'word/charts/_rels/chart1.xml.rels', xml: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdUs" Type="${REL}/chartUserShapes" Target="../drawings/drawing1.xml"/></Relationships>` },
      { name: 'word/drawings/drawing1.xml', xml: shapes, type: 'application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml' },
    ],
  });
  const r = await write(pkg);
  check(shipsClean(r) && /<cx:pt idx="0">\[Person1\]<\/cx:pt><cx:pt idx="1">\[[^\]]+\]<\/cx:pt>/.test(r.raw['word/charts/chartEx1.xml'] || '') && /<a:t[^>]*>Paid to \[Person1\]<\/a:t>/.test(r.raw['word/drawings/drawing1.xml'] || '')
    && (r.report.channels.chart?.parts ?? 0) >= 3,
  'the waterfall chart\'s categories and the text box on the chart are masked as chart text', said(r));
  // until 2026-09-23 both were parts nothing read, and the file held with no way through
  // short of deleting the chart
  const c = await write(pkg, { W: await mutated(["  { re: /^word\\/charts\\/chartEx\\d+\\.xml$/, kind: 'chart' },\n  { re: /^word\\/drawings\\/drawing\\d+\\.xml$/, kind: 'chart' },\n", '', 'docx.ts']) });
  check(!!c.report.held && /(chartEx1|drawing1)\.xml, a part of the file this app does not know, holds text/.test(c.held), 'CONTROL: not read as charts, they hold the file as parts nothing read', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 21: a namespace declared on an element the writer takes away goes to its content —');
{
  const body = '<w:p><w:ins w:id="9" w:author="Margaret Tan" w:date="2026-09-01T09:00:00Z" xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml/word16du"><w:r><w:rPr><w16du:dateUtc w16du:dateUtc="2026-09-01T09:00:00Z"/></w:rPr><w:t>Inserted.</w:t></w:r></w:ins></w:p>'
    + '<w:p><w:hyperlink r:id="rIdL" xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"><w:r w16cid:x="1"><w:t>linked</w:t></w:r></w:hyperlink></w:p>';
  const pkg = await docx({ body, rels: [`<Relationship Id="rIdL" Type="${REL}/hyperlink" Target="https://example.com/" TargetMode="External"/>`] });
  const r = await write(pkg);
  const doc = r.raw['word/document.xml'] || '';
  check(shipsClean(r) && /<w:r xmlns:w16du="[^"]+"><w:rPr><w16du:dateUtc/.test(doc) && /<w:r w16cid:x="1" xmlns:w16cid="[^"]+">/.test(doc),
    'the runs of an accepted insertion and an unlinked hyperlink carry the declarations their prefixes need', said(r) + ' · ' + (doc.match(/<w:r [^>]*>/g) || []).join(' '));
  const c = await write(pkg, { W: await mutated(['  if (!decl.length) return kids;', '  return kids;']) });
  check(!!c.report.held && /uses the prefix "w16du" with no namespace declared for it/.test(c.held) && /prefix "w16cid" and no namespace declared/.test(c.held),
    'CONTROL: with the declarations left behind, the gate holds on each prefix Word would call damaged', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 22: a document imported whole (altChunk) holds with the way through that fits it —');
{
  const pkg = await docx({ body: '<w:altChunk r:id="rIdAlt"/>', defaults: [['mht', 'message/rfc822']], parts: [{ name: 'word/afchunk.mht', data: enc('MIME-Version: 1.0\r\n\r\nKestrel memo'), rel: ['aFChunk', 'afchunk.mht', 'rIdAlt'] }] });
  const r = await write(pkg);
  check(!!r.report.held && /^this file imports another document \(word\/afchunk\.mht\).* save it once/.test(r.held), 'an imported web page is held with "open it in Word and save it once"', said(r));
  const c = await write(pkg, { W: await mutated(['if (!isXml(n, types)) unreadable.push(n); else unknown.add(n);', 'if (!isXml(n, types)) return hold(`${n} is a part nothing here can read as text`); else unknown.add(n);']) });
  check(!!c.report.held && /nothing here can read as text/.test(c.held), 'CONTROL: refused before its relationship is read, it gets the advice for an object, which it is not', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 23: with pictures kept, a picture no longer on the page is not in the package —');
{
  const pic = (rid, id) => `<w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="${id}" name="Picture ${id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const body = `<w:p><w:del w:id="1" w:author="Margaret Tan" w:date="2026-09-01T09:00:00Z">${pic('rIdGone', 5)}</w:del>${pic('rIdKept', 6)}</w:p>`;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const pkg = await docx({
    body, defaults: [['png', 'image/png']],
    parts: [{ name: 'word/media/image1.png', data: png, rel: ['image', 'media/image1.png', 'rIdGone'] }, { name: 'word/media/image2.png', data: png, rel: ['image', 'media/image2.png', 'rIdKept'] }],
  });
  const r = await write(pkg, { keepImages: true });
  const rels = r.raw['word/_rels/document.xml.rels'] || '';
  // a picture in a tracked deletion, a hidden run, a removed field or an object's preview went
  // off the page and stayed in the package until 2026-09-23, where anyone who unzips the copy sees it
  check(shipsClean(r) && !r.names.includes('word/media/image1.png') && r.names.includes('word/media/image2.png') && !/rIdGone/.test(rels) && /rIdKept/.test(rels) && dangling(r.raw).bad.length === 0,
    'the deleted picture and its relationship go; the one on the page stays', `${said(r)} · ${r.names.join(', ')}`);
  const c = await write(pkg, { keepImages: true, W: await mutated(["if (used) r.root['Relationships'] =", "if (false) r.root['Relationships'] ="]) });
  check(c.names.includes('word/media/image1.png'), 'CONTROL: with relationships counted as they stand, the deleted picture ships in the package', `${said(c)} · ${c.names.join(', ')}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 24: what an older Office leaves behind, and a chart\'s theme override —');
{
  const pkg = await docx({ defaults: [['dat', 'application/octet-stream']], parts: [{ name: '[trash]/0000.dat', data: enc('\u0000Kestrel\u0000') }] });
  const r = await write(pkg);
  check(shipsClean(r) && !r.names.some((n) => n.startsWith('[trash]/')) && r.report.notes.some((s) => /^Leftover pieces of earlier saves, which Word keeps inside the file and never shows, were removed\./.test(s)),
    'the leftovers are removed and said', `${said(r)} · ${JSON.stringify(r.report.notes)}`);
  const c = await write(pkg, { W: await mutated(['{ re: /^\\[trash\\]\\//,', '{ re: /^$^/,']) });
  check(!!c.report.held && /\[trash\]\/0000\.dat is a part nothing here can read as text/.test(c.held), 'CONTROL: not known for what they are, they hold the file with advice to delete an object that does not exist', said(c));

  const ov = '<a:themeOverride xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:clrScheme name="Kestrel"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1></a:clrScheme></a:themeOverride>';
  const po = await docx({ parts: [{ name: 'word/theme/themeOverride1.xml', xml: ov, type: 'application/vnd.openxmlformats-officedocument.themeOverride+xml' }] });
  const ro = await write(po);
  check(shipsClean(ro) && /<a:clrScheme name="Redacted theme 1">/.test(ro.raw['word/theme/themeOverride1.xml'] || '') && !ro.report.channels.other && !ro.report.notes.some((s) => /does not know/.test(s)),
    'a chart\'s theme override is a theme: its name is renamed, and it is not called a part the writer does not know', `${said(ro)} · ${JSON.stringify(ro.report.notes)}`);
  const co = await write(po, { W: await mutated(['word\\/theme\\/(theme|themeOverride)\\d+\\.xml', 'word\\/theme\\/theme\\d+\\.xml']) });
  check(co.report.notes.some((s) => /^word\/theme\/themeOverride1\.xml is a part this writer does not know/.test(s)), 'CONTROL: left out of the layout parts, the receipt calls it unknown', JSON.stringify(co.report.notes));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 25: a name a hidden run or a removed field splits is masked as the document of record has it —');
{
  // "John " + a hidden "Michael " + "Smith": the document of record (what the author wrote,
  // hidden text and all) reads "John Michael Smith", the row the table confirmed; the copy, with
  // the hidden run stripped, reads "John Smith", which no row names. Masked over the stripped
  // text, the name shipped readable under a gate that passed (INT-1, 2026-09-23). The mask is
  // placed over the record and the pieces that survive are rewritten (a); a backstop counts the
  // words of every confirmed row in the saved text against the masked record and holds, naming
  // the row's category and never its words (b).
  const run = (t, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  const hid = (t) => run(t, '<w:vanish/>');
  const p = (...r) => `<w:p>${r.join('')}</w:p>`;
  const fld = (instr, res) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(res)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const JOHN = [...ROWS, row('j', 'John Michael Smith', '[Person2]', 'PERSON', 'person')];
  const NAMED = /John|Michael|Smith/;
  const bodyText = (r) => (r.raw['word/document.xml'] || '').replace(/<w:p\b[^>]*>/g, '\n').replace(/<[^>]+>/g, '');
  const anywhere = (r) => Object.values(r.raw).some((x) => NAMED.test(x));
  const A_OFF = ['const placed = placeFlow(flow, pieces, opts.mask, written);', 'const placed = placeFlow(fold(layout.text), layout.spans, opts.mask, written);'];
  const B_OFF = ['recordBackstop(saved, records, mask, clean, leaks);', ''];
  const aOff = await mutated(A_OFF);
  const bothOff = await mutated(A_OFF, B_OFF);

  const hidden = await docx({ body: p(run('John '), hid('Michael '), run('Smith, the claimant, attended.')) });
  const r = await write(hidden, { rows: JOHN });
  check(shipsClean(r) && !anywhere(r) && /\[Person2\], the claimant, attended\./.test(bodyText(r)),
    'a name a hidden run splits is masked where the copy shows what is left of it', `${said(r)} · ${bodyText(r).trim().replace(/\s+/g, ' ')}`);
  // the attestation reads the saved text through savedFlowText; it must be the copy's text
  const plan = E.exportPlan({ text: '', entities: JOHN, reviewed: true, engineComplete: true, kind: 'docx', bytes: hidden }, TERMS, PRACTICE);
  const flow = r.report.flows?.find((f) => f.part === 'word/document.xml');
  const saved = flow ? REAL.savedFlowText(flow, plan.docx.mask) : null;
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  check(saved != null && norm(saved) === norm(bodyText(r)), 'the writer\'s account of the saved text (savedFlowText) is the text the copy carries', `${JSON.stringify(saved)} vs ${JSON.stringify(norm(bodyText(r)))}`);
  const c1 = await write(hidden, { rows: JOHN, W: aOff });
  check(!!c1.report.held && /a person row \(\[Person2\]\)/.test(c1.held) && !NAMED.test(c1.held),
    'CONTROL: masked over the stripped text, the backstop holds, naming the row\'s category and never its words', said(c1));
  const c2 = await write(hidden, { rows: JOHN, W: bothOff });
  check(!c2.report.held && /John Smith/.test(bodyText(c2)), 'CONTROL: with the backstop off too, "John Smith" ships under a gate that passed', `${said(c2)} · ${bodyText(c2).trim().replace(/\s+/g, ' ').slice(0, 120)}`);

  // a removed field's result inside the name (AUTHOR is removed with its result)
  const author = await docx({ body: p(run('John '), fld('AUTHOR', 'Michael '), run('Smith, the claimant, attended.')) });
  const ra = await write(author, { rows: JOHN });
  check(shipsClean(ra) && !anywhere(ra), 'a name a removed field\'s result splits is masked the same way', `${said(ra)} · ${bodyText(ra).trim().replace(/\s+/g, ' ')}`);
  const ca = await write(author, { rows: JOHN, W: aOff });
  check(!!ca.report.held && /a person row/.test(ca.held) && !NAMED.test(ca.held), 'CONTROL: masked over the stripped text, the backstop holds on it', said(ca));

  // a word of the row standing elsewhere on its own is not the row: "John Doe" is someone else
  const other = await docx({ body: p(run('John '), hid('Michael '), run('Smith met John Doe.')) });
  const ro = await write(other, { rows: JOHN });
  check(shipsClean(ro) && /\[Person2\] met John Doe\./.test(bodyText(ro)) && !/Smith|Michael/.test(bodyText(ro)),
    'a word of the row that stands elsewhere, in another name, ships as written and does not hold the file', `${said(ro)} · ${bodyText(ro).trim().replace(/\s+/g, ' ')}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 26: an equation whose runs split a word is masked as it renders —');
{
  // Word starts a new run wherever the formatting changes or a tracked change lands, inside a
  // word as readily as between two: "Kes" + "trel", "Marga" + "ret Tan". Read run by run, each
  // shipped the name under a gate that passed (W3-A, 2026-09-23).
  const math = (runs) => `<w:p><m:oMathPara><m:oMath>${runs.map((t) => `<m:r><m:t xml:space="preserve">${t}</m:t></m:r>`).join('')}</m:oMath></m:oMathPara></w:p>`;
  const pkg = await docx({ body: math(['Kes', 'trel']) + math(['Marga', 'ret Tan']) });
  const eqs = (x) => ((x.raw['word/document.xml'] || '').match(/<m:t[^>]*>[^<]*<\/m:t>|<m:t[^>]*\/>/g) || []).join('');
  const r = await write(pkg);
  check(shipsClean(r) && !/<m:t[^>]*>(?:Kes|trel|Marga|ret)/.test(r.raw['word/document.xml'] || '') && /<m:t[^>]*>\[Person1\]<\/m:t>/.test(r.raw['word/document.xml'] || ''),
    'a name split inside a word across an equation\'s runs is masked: its tag in the first run, the rest emptied', `${said(r)} · ${eqs(r)}`);
  const c1 = await write(pkg, { engine: EDGE, W: await mutated(['for (const zone of mathZones(items)) {', 'for (const zone of mathZones(items).flatMap((z) => z.map((i) => [i]))) {']) });
  check(!!c1.report.held && /an equation/.test(c1.held), 'CONTROL: with the writer masking an equation run by run, the gate reads it as it renders and holds', said(c1));
  const c2 = await write(pkg, { engine: EDGE, W: await mutated(['    if (on) cur!.push(i); else { close(); cur = [i]; }', '    close(); cur = [i];']) });
  check(!c2.report.held && /<m:t[^>]*>Kes<\/m:t>/.test(c2.raw['word/document.xml'] || ''), 'CONTROL: with an equation read run by run by the writer and the gate alike, "Kes" + "trel" ships', `${said(c2)} · ${eqs(c2)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 27: every name a value holds is read: a style\'s other names, a part\'s name, a connector\'s shapes —');
{
  // Until 2026-09-23 only a value that was one identifier was cut into its words, and a style's
  // aliases "B1,KestrelBody", a part named "word/KestrelNotes.xml" and a VML connector naming
  // the shape it starts from ("#KestrelBox") each shipped the name under a gate that passed (W3-B).
  const styles = `<w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:customStyle="1" w:styleId="BodyText1"><w:name w:val="Body Text 1"/><w:aliases w:val="B1,KestrelBody"/><w:basedOn w:val="Normal"/></w:style></w:styles>`;
  const pkg = await docx({ body: '<w:p><w:pPr><w:pStyle w:val="BodyText1"/></w:pPr><w:r><w:t>Recitals</w:t></w:r></w:p>', parts: [{ name: 'word/styles.xml', xml: styles, type: CT.styles, rel: ['styles', 'styles.xml'] }] });
  const r = await write(pkg);
  const st = r.raw['word/styles.xml'] || '';
  check(shipsClean(r) && !/KestrelBody/.test(st) && dangling(r.raw).bad.length === 0, 'a style whose other names are "B1,KestrelBody" ships without that name, and the paragraph still finds its style', `${said(r)} · ${(st.match(/<w:aliases[^>]*>|w:styleId="[^"]*"/g) || []).join(' ')}`);
  const c1 = await write(pkg, { W: await mutated(
    ["(e.aliases ?? '').split(/[,;]/).map((a) => a.trim()).filter(Boolean);", "[e.aliases ?? ''].filter(Boolean);"],
    ['if (aliasesOf(e).some((a) => refCarries(a, names))) alias(k);', ''],
    ['else for (const tok of new Set(v.match(/[\\p{L}\\p{N}_]+/gu) ?? []))', 'else for (const tok of [] as string[])'],
    VALUE_RUN_OFF,
  ), engine: EDGE });
  check(!!c1.report.held && /aliases/.test(c1.held) && /Rename the style in Word/.test(c1.held), 'CONTROL: with the list read as one value, the writer keeps it and the gate holds, saying how to rename the style', said(c1));

  const vml = '<w:p><w:r><w:pict><v:group id="Group 1" style="width:100pt;height:50pt" coordsize="2000,1000"><v:rect id="KestrelBox" style="width:50pt;height:50pt"/><v:rect id="_x0000_s1030" style="width:50pt;height:50pt"/>'
    + '<v:shape id="_x0000_s1031" style="width:10pt;height:10pt" o:connectortype="straight"/><o:rules v:ext="edit"><o:r id="V:Rule1" type="connector" idref="#_x0000_s1031"><o:proxy start="" idref="#KestrelBox" connectloc="3"/><o:proxy end="" idref="#_x0000_s1030" connectloc="1"/></o:r></o:rules></v:group></w:pict></w:r></w:p>';
  const pv = await docx({ body: vml });
  const rv = await write(pv);
  const doc = rv.raw['word/document.xml'] || '';
  const box = /<v:rect id="([^"]*)"/.exec(doc)?.[1] ?? '';
  check(shipsClean(rv) && box !== 'KestrelBox' && /^_x0000_s\d+$/.test(box) && doc.includes(`idref="#${box}"`), 'a connector naming the shape it starts from names it by the id the shape was given', `${said(rv)} · ${(doc.match(/<(?:v:rect|o:proxy) [^>]*>/g) || []).join(' ')}`);
  const cv = await write(pv, { W: await mutated(['if (VML_RULE.has(tag)) for (const k of VML_RULE_REFS) if (attrs[k]) {', 'if (false) for (const k of VML_RULE_REFS) if (attrs[k]) {']) });
  check(!!cv.report.held && /a connector still names a drawn shape "#KestrelBox"/.test(cv.held), 'CONTROL: with the connector\'s reference left as written, the gate holds on it', said(cv));

  const unk = (name) => ({ name, xml: '<acme:notes xmlns:acme="urn:acme:notes"><acme:n>3</acme:n></acme:notes>', type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', name.replace(/^word\//, '')] });
  const pn = await docx({ parts: [unk('word/KestrelNotes.xml')] });
  const rp = await write(pn);
  check(!!rp.report.held && /the name of a part inside the file/.test(rp.held) && /A part inside the file is named with it: Word never shows that name/.test(rp.held),
    'a part named "word/KestrelNotes.xml" holds the file, and the hold says who reads that name and what to delete', said(rp));
  const cp = await write(pn, { engine: EDGE, W: await mutated(
    ['else for (const tok of new Set(v.match(/[\\p{L}\\p{N}_]+/gu) ?? []))', 'else for (const tok of [] as string[])'],
    ['const at = refFind(v, names, how, true, v.length > 80)[0];', 'const at = IDENT.test(v) ? refFind(v, names, how, true, v.length > 80)[0] : undefined;'],
  ) });
  check(!cp.report.held && cp.names.includes('word/KestrelNotes.xml'), 'CONTROL: with only a value that is one identifier cut into its words, and the mask placing names at a word\'s edges only, the part name ships', said(cp));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 28: a part the writer does not know is kept only when nothing in it, tags or attributes, reads as typed text —');
{
  // The writer read only the text between an unknown part's tags, and a client name in an
  // attribute ("Jonas Whitfield", declared by no one) or in lower case between the tags
  // ("whitfield", which read as a code word) shipped in a part the receipt said held nothing
  // anyone typed (W3-C, 2026-09-23). The gate reads such a part for the table's names only.
  const unk = (inner) => ({ name: 'word/unheardOf.xml', xml: `<acme:notes xmlns:acme="urn:acme:notes" xmlns:r="${REL}">${inner}</acme:notes>`, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] });
  const HELD = /^word\/unheardOf\.xml, a part of the file this app does not know, holds text/;
  const attr = await docx({ parts: [unk('<acme:note acme:client="Jonas Whitfield" acme:n="3"/>')] });
  const ra = await write(attr);
  check(!!ra.report.held && HELD.test(ra.held), 'a name no one declared, in an attribute of an unknown part, holds the file', said(ra));
  const ca = await write(attr, { W: await mutated(['      if (!v || refKind(t, k, parent)) continue;\n      if (styleAttr(t, k, parent)', '      continue;\n      if (styleAttr(t, k, parent)']) });
  check(!ca.report.held && /Jonas Whitfield/.test(ca.raw['word/unheardOf.xml'] || ''), 'CONTROL: with its attributes not read, the name ships (the gate reads for the table\'s names, and no one declared this one)', said(ca));
  const low = await docx({ parts: [unk('<acme:note>whitfield</acme:note>')] });
  const rl = await write(low);
  check(!!rl.report.held && HELD.test(rl.held), 'a single lower-case word between the tags holds the file too: a surname typed in lower case reads like a code word', said(rl));
  const cl = await write(low, { W: await mutated(['!(code(v) && !(between && /^[a-z]+(?:[A-Z][a-z]+)*$/.test(v)))', '!code(v)']) });
  check(!cl.report.held && /whitfield/.test(cl.raw['word/unheardOf.xml'] || ''), 'CONTROL: read as a code word, "whitfield" ships', said(cl));
  const code = await docx({ parts: [unk('<acme:note acme:type="note" r:id="rId3" acme:lang="en-US" acme:n="3" acme:guid="{0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0}" acme:on="true"><acme:flag>true</acme:flag><acme:when>2026-09-01T09:00:00Z</acme:when></acme:note>')] });
  const rc = await write(code);
  check(shipsClean(rc) && rc.names.includes('word/unheardOf.xml') && rc.report.notes.some((s) => /^word\/unheardOf\.xml is a part this writer does not know\. Between its tags and in its attributes are only /.test(s) && !/anyone typed/.test(s)),
    'a part with only code in its tags and attributes is kept, and the receipt says what kinds of value it read in both, never that no one typed them', `${said(rc)} · ${JSON.stringify(rc.report.notes)}`);
  // a number kept as written can be a telephone number someone typed; the note travels to the
  // recipient, so it states what is there rather than vouching for how it got there
  const cv = await write(code, { W: await mutated(['is a part this writer does not know. Between its tags', 'is a part this writer does not know. Nothing in it reads as text anyone typed. Between its tags']) });
  check(cv.report.notes.some((s) => /^word\/unheardOf\.xml is a part/.test(s) && /anyone typed/.test(s)), 'CONTROL: a note that vouches no one typed the part\'s values fails the check above', JSON.stringify(cv.report.notes));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 29: the safety net reads what a person typed into a name, and not what Word wrote —');
{
  // A number format's quoted literal ("SSN 123-45-6789 "0) and a style's name are typed by a
  // person; the codes around them (#,##0.00;[Red]) are Word's. The safety-net pattern counts
  // in the first and never in the second, where it would read [$-409] or a date code as a number.
  const chart = (fmt) => `<c:chartSpace ${NS}><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:dLbls><c:numFmt formatCode="${fmt}" sourceLinked="0"/><c:showVal val="1"/></c:dLbls><c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  const body = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const pkgOf = (fmt) => docx({ body, parts: [{ name: 'word/charts/chart1.xml', xml: chart(fmt), type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] }] });
  const fmtOf = (r) => unesc(/<c:numFmt formatCode="([^"]*)"/.exec(r.raw['word/charts/chart1.xml'] || '')?.[1] ?? '');
  const ssn = await pkgOf('&quot;SSN 123-45-6789 &quot;0');
  const r = await write(ssn);
  check(shipsClean(r) && fmtOf(r) === '"SSN [ssn] "0', 'a number the safety net finds in a number format\'s quoted text is masked there, and the code after it is kept', `${said(r)} · ${fmtOf(r)}`);
  const codes = ['#,##0.00;[Red]-#,##0.00', '0.00E+00', 'dd/mm/yyyy', '[$-409]mmmm d, yyyy;@'];
  const kept = [];
  for (const f of codes) { const x = await write(await pkgOf(f)); kept.push(shipsClean(x) && fmtOf(x) === f ? '' : `${f} → ${x.report.held ? 'held' : fmtOf(x)}`); }
  check(kept.every((k) => !k), 'number formats that are Word\'s codes alone ship as written and hold nothing', kept.filter(Boolean).join('; '));
  const WRITER_NO_LITERAL = ['const { hits, divergence } = readAll(st.mask, [flow, ...runs.map((r) => r.text)]);', 'const { hits, divergence } = readAll(st.mask, [flow, ...runs.map(() => \'\')]);'];
  const c1 = await write(ssn, { W: await mutated(WRITER_NO_LITERAL) });
  check(!!c1.report.held && /123-45-6789/.test(c1.held), 'CONTROL: with the writer reading no literal, the gate reads it and holds', said(c1));
  const c2 = await write(ssn, { W: await mutated(WRITER_NO_LITERAL,
    [": o.mode === 'format' ? (j === 0 ? formatLiterals(r) : null) : null);", ": o.mode === 'format' ? null : null);"],
    ["if (o.mode === 'format') for (const run of formatRuns(v))", 'if (false) for (const run of formatRuns(v))']) });
  check(!c2.report.held && /123-45-6789/.test(fmtOf(c2)), 'CONTROL: with the gate reading none either, the number ships', `${said(c2)} · ${fmtOf(c2)}`);

  const styles = `<w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:customStyle="1" w:styleId="Memo_123-45-6789"><w:name w:val="Memo 123-45-6789"/><w:basedOn w:val="Normal"/></w:style></w:styles>`;
  const rs = await write(await docx({ body: '<w:p><w:pPr><w:pStyle w:val="Memo_123-45-6789"/></w:pPr><w:r><w:t>Memo</w:t></w:r></w:p>', parts: [{ name: 'word/styles.xml', xml: styles, type: CT.styles, rel: ['styles', 'styles.xml'] }] }));
  check(shipsClean(rs) && !Object.values(rs.raw).some((x) => /123-45-6789/.test(x)) && dangling(rs.raw).bad.length === 0, 'a style someone named with a number the safety net finds is renamed, and the paragraph still finds it', `${said(rs)} · ${((rs.raw['word/styles.xml'] || '').match(/w:styleId="[^"]*"|<w:name [^>]*>/g) || []).join(' ')}`);
  // the gate's own reading of a style name takes the safety-net pattern: a writer that leaves
  // the number in the style is held by it (W4-F6 M4, 2026-09-23)
  const memo = await docx({ body: '<w:p><w:pPr><w:pStyle w:val="Memo_123-45-6789"/></w:pPr><w:r><w:t>Memo</w:t></w:r></w:p>', parts: [{ name: 'word/styles.xml', xml: styles, type: CT.styles, rel: ['styles', 'styles.xml'] }] });
  const KEEP_STYLE = ['x.floor ? o.floor :', 'x.floor ? false :'];
  const s1 = await write(memo, { W: await mutated(KEEP_STYLE) });
  check(!!s1.report.held && /the list of styles/.test(s1.held), 'CONTROL: with the writer leaving the number in the style, the gate holds on the style', said(s1));
  const s2 = await write(memo, { W: await mutated(KEEP_STYLE, [": o.mode === 'style' ? (styleFloor(j, v) ? whole : null)", ": o.mode === 'style' ? null"]) });
  check(!s2.report.held && /123-45-6789/.test(s2.raw['word/styles.xml'] || ''), 'CONTROL: and with the gate\'s style reading taking no pattern, the number ships', said(s2));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 30: a chart\'s print header and footer are removed —');
{
  // Excel prints a chart's header and footer only when it prints the chart on its own page, and
  // Word never shows them; their text carries Excel's codes glued to the words ("&CKestrel"), and
  // no reading of text found the name in it (W3-D, 2026-09-23).
  const chart = `<c:chartSpace ${NS}><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4.5</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart>`
    + '<c:printSettings><c:headerFooter><c:oddHeader>&amp;CKestrel Confidential</c:oddHeader></c:headerFooter><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings></c:chartSpace>';
  const body = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const pkg = await docx({ body, parts: [{ name: 'word/charts/chart1.xml', xml: chart, type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] }] });
  const r = await write(pkg);
  check(shipsClean(r) && !/headerFooter|oddHeader/.test(r.raw['word/charts/chart1.xml'] || '') && r.report.notes.some((s) => /^A chart's print header and footer, which Excel prints only when it prints the chart on its own page and Word never shows, were removed\./.test(s)),
    'the print header is removed and the receipt says what it was', `${said(r)} · ${JSON.stringify(r.report.notes)}`);
  const off = ['if (CHART_HF.test(tag)) { st.shared.chartHeaders++; continue; }', ''];
  const c1 = await write(pkg, { W: await mutated(off) });
  check(!!c1.report.held && /a chart's print header or footer \(c:headerFooter\) is still present/.test(c1.held) && /a fault in the app/.test(c1.held), 'CONTROL: kept, it holds the file as the app\'s own fault', said(c1));
  const c2 = await write(pkg, { engine: EDGE, W: await mutated(off, ['if (/^cx?:(odd|even|first)(Header|Footer)$/.test(parent)) {', 'if (false) {'], ['if (CHART_HF.test(tag)) leaks.push(', 'if (false) leaks.push('], GATE_TEXT_RUN_OFF) });
  check(!c2.report.held && c2.leaks.length > 0, 'CONTROL: kept and read as text for names at a word\'s edges only, "&CKestrel" ships under a gate that passed', said(c2));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 31: a link relationship nothing uses is dropped, and a kept one names the bookmark by its new name —');
{
  // A shape's click-link (a:hlinkClick) jumps to a bookmark through a relationship whose target
  // is "#<bookmark>": renamed in the body, the bookmark was still named in the relationship, and a
  // link relationship nothing on the page used still named another (W3-E, 2026-09-23).
  const body = '<w:p><w:bookmarkStart w:id="0" w:name="KestrelSchedule"/><w:r><w:t>Schedule</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>'
    + '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="3" name="Shape 3"><a:hlinkClick r:id="rIdL"/></wp:docPr><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:spPr/><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const pkg = await docx({ body, rels: [`<Relationship Id="rIdL" Type="${REL}/hyperlink" Target="#KestrelSchedule"/>`, `<Relationship Id="rIdX" Type="${REL}/hyperlink" Target="#KestrelOrphan"/>`] });
  const r = await write(pkg);
  const rels = r.raw['word/_rels/document.xml.rels'] || '';
  const mark = /<w:bookmarkStart [^>]*w:name="([^"]*)"/.exec(r.raw['word/document.xml'] || '')?.[1] ?? '';
  check(shipsClean(r) && /^bm\d+$/.test(mark) && rels.includes(`Id="rIdL" Type="${REL}/hyperlink" Target="#${mark}"`) && !/rIdX/.test(rels),
    'the click-link names the bookmark by its new name, and the link relationship nothing used is gone', `${said(r)} · ${mark} · ${rels.replace(/^.*?<Relationships[^>]*>/, '')}`);
  const c1 = await write(pkg, { W: await mutated(['renameRef(String(a.Target).slice(1), relState)', 'String(a.Target).slice(1)']) });
  check(!!c1.report.held && /a link to a bookmark is still named "#KestrelSchedule"/.test(c1.held), 'CONTROL: with the target left as written, the gate holds on it', said(c1));
  const c2 = await write(pkg, { W: await mutated(['/\\/(image|hyperlink)$/.test(', '/\\/(image)$/.test(']) });
  check(!c2.report.held && /Id="rIdX"/.test(c2.raw['word/_rels/document.xml.rels'] || ''), 'CONTROL: with unused link relationships kept, the orphan ships in the package', said(c2));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 32: a signed macro project\'s signatures go with it —');
{
  // Word writes a signed project's signature beside it in up to three forms; each carries the
  // signer's certificate, whose subject is a person's or a firm's name (W3-F, 2026-09-23).
  const sig = enc('\u0000CN=Kestrel Holdings\u0000');
  const pkg = await docx({ defaults: [['bin', 'application/vnd.ms-office.vbaProject']], parts: [
    { name: 'word/vbaProject.bin', data: enc('\u0000vba\u0000') },
    { name: 'word/vbaProjectSignature.bin', data: sig }, { name: 'word/vbaProjectSignatureAgile.bin', data: sig }, { name: 'word/vbaProjectSignatureV3.bin', data: sig },
  ] });
  const r = await write(pkg);
  check(shipsClean(r) && !r.names.some((n) => /vbaProject/.test(n)), 'the project and its three signatures are removed', `${said(r)} · ${r.names.join(', ')}`);
  const x = await D.extractDocx(pkg);
  const flagged = x.inventory?.binaryFlagged ?? [];
  check(['word/vbaProjectSignature.bin', 'word/vbaProjectSignatureAgile.bin', 'word/vbaProjectSignatureV3.bin'].every((n) => flagged.includes(n)) && !(x.inventory?.unrecognized ?? []).length,
    'the reader lists the signatures as parts it does not read as text, not as parts it does not know', JSON.stringify(x.inventory));
  const c = await write(pkg, { W: await mutated(['vbaProject\\.bin|vbaProjectSignature(?:Agile|V3)?\\.bin|', 'vbaProject\\.bin|']) });
  check(!!c.report.held && /^word\/vbaProjectSignature(?:Agile|V3)?\.bin is a part nothing here can read as text/.test(c.held), 'CONTROL: not known for what they are, the signatures hold the file', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 33: a neutral name the writer gives is one the file does not already use —');
{
  // A file redacted once and edited carries Label1 (or List1, Name1, PivotTable1) already; a new
  // label renamed Label1 beside it merges two caption sequences into one numbering (W3-G).
  const settings = `<w:settings ${NS}><w:captions><w:caption w:name="Label1" w:pos="below"/><w:caption w:name="Kestrel Exhibit" w:pos="below"/></w:captions></w:settings>`;
  const body = '<w:p><w:r><w:t xml:space="preserve">Exhibit </w:t></w:r><w:fldSimple w:instr=" SEQ Label1 \\* ARABIC "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>'
    + '<w:p><w:r><w:t xml:space="preserve">Annex </w:t></w:r><w:fldSimple w:instr=" SEQ Kestrel_Exhibit \\* ARABIC "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>';
  const pkg = await docx({ body, parts: [{ name: 'word/settings.xml', xml: settings, type: CT.settings, rel: ['settings', 'settings.xml'] }] });
  const seqs = (x) => instructions(x.raw['word/document.xml'] || '').map((s) => s.trim()).filter((s) => /^SEQ /.test(s));
  const r = await write(pkg);
  const caps = ((r.raw['word/settings.xml'] || '').match(/<w:caption [^>]*>/g) || []).join(' ');
  check(shipsClean(r) && /w:name="Label1"/.test(caps) && /w:name="Label2"/.test(caps) && seqs(r).join(' | ') === 'SEQ Label1 \\* ARABIC | SEQ Label2 \\* ARABIC' && r.report.notes.some((s) => /Label2/.test(s)),
    'the label already called Label1 keeps its name and numbering; the renamed one is Label2', `${said(r)} · ${caps} · ${seqs(r).join(' | ')}`);
  const c = await write(pkg, { W: await mutated(['neutralTaken.add(m[0]);', 'void m;']) });
  check(!c.report.held && seqs(c).filter((s) => /^SEQ Label1\b/.test(s)).length === 2, 'CONTROL: with the names already in the file not reserved, both sequences are Label1 and number as one', seqs(c).join(' | '));

  // the same for a list's name, a chart's named range and a pivot source (W4-F6 M6): each kind
  // the writer names is reserved, not the caption label alone
  const numbering = `<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:name w:val="List1"/><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>`
    + '<w:abstractNum w:abstractNumId="1"><w:name w:val="Kestrel Schedule"/><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
  const chart = (f, pivot) => `<c:chartSpace ${NS}><c:pivotSource><c:name>${pivot}</c:name><c:fmtId val="0"/></c:pivotSource><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numRef><c:f>${f}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  const drawing = (id) => `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="${id}" name="Chart ${id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdC${id}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  const kinds = await docx({ body: drawing(1) + drawing(2), parts: [
    { name: 'word/numbering.xml', xml: numbering, type: CT.numbering, rel: ['numbering', 'numbering.xml'] },
    { name: 'word/charts/chart1.xml', xml: chart('Name1', '[Book1.xlsx]Sheet1!PivotTable1'), type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdC1'] },
    { name: 'word/charts/chart2.xml', xml: chart('KestrelRevenue', '[Kestrel Model.xlsx]Fees!PivotTable1'), type: CT.chart, rel: ['chart', 'charts/chart2.xml', 'rIdC2'] },
  ] });
  const named = (x) => [
    ...[...(x.raw['word/numbering.xml'] || '').matchAll(/<w:name w:val="([^"]*)"/g)].map((m) => m[1]),
    ...['word/charts/chart1.xml', 'word/charts/chart2.xml'].flatMap((n) => [...(x.raw[n] || '').matchAll(/<c:f>([^<]*)<\/c:f>|<c:name>([^<]*)<\/c:name>/g)].map((m) => m[1] ?? m[2])),
  ].join(' | ');
  const rk = await write(kinds);
  check(shipsClean(rk) && named(rk) === 'List1 | List2 | [Book1.xlsx]Sheet1!PivotTable1 | Name1 | [Book1.xlsx]Sheet1!PivotTable2 | Name2',
    'a List1, a Name1 and a PivotTable1 already in the file keep their names; the renamed ones are List2, Name2 and PivotTable2', `${said(rk)} · ${named(rk)}`);
  const ck = await write(kinds, { W: await mutated(['(?:Label|List|Name)[1-9]\\d*(?![\\p{L}\\p{N}_])|(?<=\\[Book1\\.xlsx\\]Sheet1!)PivotTable[1-9]\\d*(?![\\p{L}\\p{N}_])', '(?:Label)[1-9]\\d*(?![\\p{L}\\p{N}_])']) });
  check(named(ck) === 'List1 | List1 | [Book1.xlsx]Sheet1!PivotTable1 | Name1 | [Book1.xlsx]Sheet1!PivotTable1 | Name1', 'CONTROL: with only caption labels reserved, each renamed one takes the name the file already uses', named(ck));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 34: a link to a place in the document that is written out as text is counted —');
{
  // A HYPERLINK field is written out as the text it showed; a \l link jumped to a bookmark, and
  // the receipt said the copy's links point at the bookmark's new name while these no longer
  // jump at all (W3-H, 2026-09-23).
  const body = '<w:p><w:bookmarkStart w:id="0" w:name="Kestrel_Schedule"/><w:r><w:t>Schedule 2</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>'
    + '<w:p><w:fldSimple w:instr=" HYPERLINK \\l &quot;Kestrel_Schedule&quot; "><w:r><w:t>see Schedule 2</w:t></w:r></w:fldSimple></w:p>'
    + '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK \\l "Kestrel_Schedule" \\o "tip" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>again</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
    + '<w:p><w:fldSimple w:instr=" HYPERLINK &quot;https://example.com/x&quot; "><w:r><w:t>external</w:t></w:r></w:fldSimple></w:p>';
  const pkg = await docx({ body });
  const LINKS = /^2 links to places in the document \(a HYPERLINK field\) were written out as the text they showed, and will not jump there in the copy\./;
  const r = await write(pkg);
  check(shipsClean(r) && r.report.notes.some((s) => LINKS.test(s)) && r.report.notes.some((s) => /renamed bm1, whatever it was called; the links, page references and contents entries the copy keeps point at the new name\./.test(s)),
    'the two \\l links are counted as no longer jumping, and the bookmark note speaks only of the links the copy keeps', `${said(r)} · ${JSON.stringify(r.report.notes)}`);
  const c = await write(pkg, { W: await mutated(['st.shared.linksUnlinked++;', 'void 0;']) });
  check(!c.report.held && !c.report.notes.some((s) => /places? in the document \(a HYPERLINK field\)/.test(s)), 'CONTROL: uncounted, the receipt says nothing of them', JSON.stringify(c.report.notes));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 36: a part the writer does not know holds on what an author typed into it, and on a name run together in its code —');
{
  // The receipt told the recipient such a part held nothing anyone typed while a signer's name,
  // a watermark, a trendline's name, a form's help text or a style's name shipped in it
  // unreviewed: every value the writer masks by the table alone was let through the check for
  // typed text (W4-F1, 2026-09-23). And "margaretTan", "kestrelAcquisition" in its code shipped
  // under a gate that read them as single code words (W5-2).
  const unk = (inner) => ({ name: 'word/unheardOf.xml', xml: `<acme:notes xmlns:acme="urn:acme:notes" ${NS}>${inner}</acme:notes>`, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] });
  const HELD = /^word\/unheardOf\.xml, a part of the file this app does not know, holds text/;
  const shapes = {
    'a signature line\'s signer': '<o:signatureline o:suggestedsigner="Jonas Whitfield" o:suggestedsigner2="General Counsel"/>',
    'a watermark': '<v:textpath string="Whitfield draft only"/>',
    'a trendline\'s name': '<c:name>Whitfield projection</c:name>',
    'a form field\'s help text': '<w:helpText w:val="Ask Jonas Whitfield"/>',
  };
  const typedOff = ['if (how) return true;', 'if (how) return false;'];
  for (const [what, inner] of Object.entries(shapes)) {
    const pkg = await docx({ parts: [unk(inner)] });
    const r = await write(pkg);
    const c = await write(pkg, { W: await mutated(typedOff) });
    check(!!r.report.held && HELD.test(r.held) && !c.report.held && /Whitfield/.test(c.raw['word/unheardOf.xml'] || ''),
      `${what} in it holds the file (CONTROL: counted as code, it ships)`, `${said(r)} · control ${said(c)}`);
  }
  const style = await docx({ parts: [unk('<w:style w:type="paragraph" w:styleId="JonasWhitfield"><w:name w:val="Jonas Whitfield"/></w:style>')] });
  const rs = await write(style);
  const cs = await write(style, { W: await mutated(['styleAttr(t, k, parent) ? WORDY.test(v) && !builtinStyle(v) && !code(v) :', 'styleAttr(t, k, parent) ? false :']) });
  check(!!rs.report.held && HELD.test(rs.held) && !cs.report.held && /Jonas Whitfield/.test(cs.raw['word/unheardOf.xml'] || ''),
    'a style named after a person in it holds the file (CONTROL: a style name counted as a name Word looks up ships)', `${said(rs)} · control ${said(cs)}`);
  const fmt = await docx({ parts: [unk('<c:numFmt formatCode="&quot;Whitfield &quot;0" sourceLinked="0"/>')] });
  const rf = await write(fmt);
  const cf = await write(fmt, { W: await mutated(['if (how?.[1] === NUMBER_FORMAT) return formatRuns(v).some((r) => WORDY.test(r.text));', 'if (how?.[1] === NUMBER_FORMAT) return false;']) });
  check(!!rf.report.held && HELD.test(rf.held) && !cf.report.held && /Whitfield/.test(cf.raw['word/unheardOf.xml'] || ''),
    'a number format that prints a word holds the file (CONTROL: read as code, it ships)', `${said(rf)} · control ${said(cf)}`);
  const sym = await write(await docx({ parts: [unk('<c:numFmt formatCode="&quot;$&quot;#,##0.00;[Red]-#,##0.00" sourceLinked="0"/><acme:n>42</acme:n>')] }));
  check(shipsClean(sym) && sym.report.notes.some((s) => /^word\/unheardOf\.xml is a part .* so it was kept as it was\./.test(s)),
    'one whose number format prints only a currency sign is kept as it was, and the receipt says so', `${said(sym)} · ${JSON.stringify(sym.report.notes)}`);

  // a table name run together in a value of the part's own code
  const HARROW = [...ROWS, row('h', 'Harrow Leung', '[Person2]', 'PERSON', 'person')];
  const glued = ['<acme:code>kestrelAcquisition</acme:code>', '<acme:m acme:code="kestrelAcquisition" acme:n="3"/>', '<acme:m acme:owner="margaretTan"/>', '<acme:m acme:client="harrowLeung"/>'];
  const refOff = ['&& !refCarries(v, tableNames);', ';'];
  // between tags a camelCase word is typed whatever it carries (W-FID-2); off with the reading
  const camelOff = ['!(code(v) && !(between && /^[a-z]+(?:[A-Z][a-z]+)*$/.test(v)))', '!(code(v) && !(between && /^[a-z]+$/.test(v)))'];
  const gateOff = [['if (foreign.has(part)) checkRef(', 'if (false) checkRef('], ['if (foreign.has(part) || (((tag', 'if (false || (((tag'], GATE_CODE_RUN_OFF];
  const lines = [];
  for (const inner of glued) {
    const pkg = await docx({ parts: [unk(inner)] });
    const r = await write(pkg, { rows: HARROW });
    const ca = await write(pkg, { rows: HARROW, W: await mutated(refOff, camelOff) });
    const cb = await write(pkg, { rows: HARROW, engine: EDGE, W: await mutated(refOff, camelOff, ...gateOff) });
    const word = /(kestrelAcquisition|margaretTan|harrowLeung)/.exec(inner)[1];
    lines.push({ inner, ok: !!r.report.held && HELD.test(r.held), a: !!ca.report.held && /a part of the file this app does not know/.test(ca.held) && /still carries/.test(ca.held), b: !cb.report.held && (cb.raw['word/unheardOf.xml'] || '').includes(word), r, ca, cb });
  }
  check(lines.every((l) => l.ok), 'a table name run together in a code word of the part, between its tags or in an attribute, holds the file before anything is written', lines.filter((l) => !l.ok).map((l) => `${l.inner} → ${said(l.r)}`).join(' | '));
  check(lines.every((l) => l.a), 'CONTROL: with the writer reading it as a code word, the gate reads every value of the part for the table\'s names run together and holds', lines.filter((l) => !l.a).map((l) => `${l.inner} → ${said(l.ca)}`).join(' | '));
  check(lines.every((l) => l.b), 'CONTROL: with the gate reading it as a code word too, each ships', lines.filter((l) => !l.b).map((l) => `${l.inner} → ${said(l.cb)}`).join(' | '));

  // a relationship id: Word never shows it and it cannot be retyped in Word
  const rid = await docx({ parts: [{ name: 'word/styles.xml', xml: `<w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`, type: CT.styles, rel: ['styles', 'styles.xml', 'rIdKestrel'] }] });
  const rr = await write(rid);
  check(!!rr.report.held && /Relationship@Id: "rIdKestrel"/.test(rr.held) && /An id inside the file that links one of its parts to another carries it: Word never shows that id, so it cannot be found or retyped in Word\./.test(rr.held),
    'a relationship id with the term run into it holds the file, and the hold says it cannot be fixed in Word', said(rr));
  const cr = await write(rid, { engine: EDGE, W: await mutated(["(((tag === 'Relationship' && k === 'Id') || R_ATTRS.includes(k)) && ", '(false && '], GATE_CODE_RUN_OFF) });
  check(!cr.report.held && /Id="rIdKestrel"/.test(cr.raw['word/_rels/document.xml.rels'] || ''), 'CONTROL: with ids read as code words and a name run together not looked for in one, it ships', said(cr));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 37: a processing instruction is removed, and the receipt says so —');
{
  // A note a program leaves in a part for itself (<?dms client="…"?>): Word neither shows nor
  // needs one, and one naming the client in the body shipped under a gate that skipped every
  // one (W5-3, 2026-09-23). A bare Microsoft marker (<?mso-contentType?>) stays.
  const pkg = await docx({ body: '<?dms-client name="Kestrel Holdings" owner="Margaret Tan"?>' + para('Recitals.'), header: '<?mso-contentType?><?acme Kestrel Holdings?>' + para('Header') });
  const PI = /<\?(?!xml )[^?]*\?>/g;
  const pis = (x) => Object.entries(x.raw).flatMap(([n, s]) => (s.match(PI) || []).map((p) => `${n}: ${p}`));
  const r = await write(pkg);
  check(shipsClean(r) && pis(r).join(' ') === 'word/header1.xml: <?mso-contentType?>' && r.report.notes.some((s) => /^2 processing instructions \(a note a program leaves in the file's code for itself, which Word neither shows nor uses\) were removed\./.test(s)),
    'the two a program left in the body and a header are removed and counted; a bare Microsoft marker stays', `${said(r)} · ${pis(r).join(' ')} · ${JSON.stringify(r.report.notes)}`);
  const stripOff = ["if (t.startsWith('?')) { if (keptInstruction(t, n)) return true; shared.instructions++; return false; }", "if (t.startsWith('?')) return true;"];
  const c1 = await write(pkg, { W: await mutated(stripOff) });
  check(!!c1.report.held && /a processing instruction is still present/.test(c1.held) && /a fault in the app/.test(c1.held), 'CONTROL: kept, the gate holds the file as the app\'s own fault', said(c1));
  const c2 = await write(pkg, { W: await mutated(stripOff, ['if (!keptInstruction(tag, node)) leaks.push(', 'if (false) leaks.push(']) });
  check(!c2.report.held && /<\?dms-client name="Kestrel Holdings"/.test(c2.raw['word/document.xml'] || ''), 'CONTROL: and with the gate skipping them, the client\'s name ships in the body', said(c2));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 38: the receipt names the names the copy carries —');
{
  // A template that already has "Redacted style 1" and a font "Redacted font 1" puts the first
  // new one at 2; the receipt said "renamed Redacted style 1 and on", naming the firm's own
  // style as the one renamed (W5-4, 2026-09-23).
  const styles = `<w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>`
    + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="RedactedStyle1"><w:name w:val="Redacted style 1"/><w:basedOn w:val="Normal"/></w:style>'
    + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="KestrelBody"><w:name w:val="Kestrel Body"/><w:basedOn w:val="Normal"/></w:style></w:styles>';
  const fonts = `<w:fonts ${NS}><w:font w:name="Redacted font 1"/><w:font w:name="Kestrel Sans"/></w:fonts>`;
  const body = '<w:p><w:pPr><w:pStyle w:val="KestrelBody"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Kestrel Sans" w:hAnsi="Kestrel Sans"/></w:rPr><w:t>Body</w:t></w:r></w:p>'
    + '<w:p><w:pPr><w:pStyle w:val="RedactedStyle1"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Redacted font 1"/></w:rPr><w:t>Old</w:t></w:r></w:p>';
  const pkg = await docx({ body, parts: [{ name: 'word/styles.xml', xml: styles, type: CT.styles, rel: ['styles', 'styles.xml'] }, { name: 'word/fontTable.xml', xml: fonts, type: CT.fontTable, rel: ['fontTable', 'fontTable.xml'] }] });
  const styleNames = (x) => [...(x.raw['word/styles.xml'] || '').matchAll(/<w:name w:val="([^"]*)"\/>/g)].map((m) => m[1]);
  const had = new Set(['Normal', 'Redacted style 1', 'Kestrel Body']);
  const noteSays = (x) => ((x.report.notes.find((s) => /style whose name carried|styles whose name carried/.test(s)) || '').match(/Redacted style \d+/g) || []);
  const r = await write(pkg);
  const made = styleNames(r).filter((n) => !had.has(n));
  check(shipsClean(r) && made.length === 1 && noteSays(r).join() === made.join() && dangling(r.raw).bad.length === 0,
    'the style note names the style the copy gave, not the one the template already had', `${said(r)} · copy ${styleNames(r).join(', ')} · note ${noteSays(r).join(', ')}`);
  check(/<w:font w:name="Redacted font 1"\/>/.test(r.raw['word/fontTable.xml'] || '') && /<w:font w:name="Redacted font 2"\/>/.test(r.raw['word/fontTable.xml'] || '')
    && r.report.notes.some((s) => /^A font name that carried something masked was renamed "Redacted font 2";/.test(s)),
  'the font note names "Redacted font 2", the name the copy gave, beside the template\'s own "Redacted font 1"', JSON.stringify(r.report.notes));
  const c1 = await write(pkg, { W: await mutated(['const given = [...shown].sort((a, b) => a[0] - b[0]).map(([, g]) => g);', 'const given = [...shown].map((_, i) => `Redacted style ${i + 1}`);']) });
  check(noteSays(c1).join() === 'Redacted style 1', 'CONTROL: counted from 1, the style note names the template\'s own style', JSON.stringify(c1.report.notes));
  const c2 = await write(pkg, { W: await mutated(['nouns.set(noun, [...(nouns.get(noun) ?? []), to]);', 'nouns.set(noun, [...(nouns.get(noun) ?? []), `Redacted ${noun} ${(nouns.get(noun)?.length ?? 0) + 1}`]);']) });
  check(c2.report.notes.some((s) => /renamed "Redacted font 1";/.test(s)), 'CONTROL: counted from 1, the font note names the template\'s own font', JSON.stringify(c2.report.notes));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 39: a number format is read as it prints, however Excel stored its literals —');
{
  // Excel stores a custom format's literal characters escaped one by one (\1\2\3\-…) or in
  // several quoted runs ("123"-"45"-…); read one quoted run or escape at a time, no pattern
  // finds the number, and a data label printed a Social Security number beside every value in
  // the copy (W4-F2, W5-5, 2026-09-23).
  const chart = (fmt) => `<c:chartSpace ${NS}><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:dLbls><c:numFmt formatCode="${fmt}" sourceLinked="0"/><c:showVal val="1"/></c:dLbls><c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  const body = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const pkgOf = (fmt) => docx({ body, parts: [{ name: 'word/charts/chart1.xml', xml: chart(fmt), type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] }] });
  const fmtOf = (r) => unesc(/<c:numFmt formatCode="([^"]*)"/.exec(r.raw['word/charts/chart1.xml'] || '')?.[1] ?? '');
  const escaped = await pkgOf('\\1\\2\\3\\-\\4\\5\\-\\6\\7\\8\\9 0');
  const split = await pkgOf('&quot;123&quot;-&quot;45&quot;-&quot;6789 &quot;0');
  const term = await pkgOf('\\K\\e\\s\\t\\r\\e\\l\\ 0');
  const re = await write(escaped), rs = await write(split), rr = await write(term);
  check(shipsClean(re) && fmtOf(re) === '"[ssn]" 0', 'a number escaped character by character is masked as it prints, the tag written as a quoted literal the code still parses', `${said(re)} · ${fmtOf(re)}`);
  check(shipsClean(rs) && fmtOf(rs) === '"[ssn] "0', 'a number written as quoted runs joined by a bare hyphen is masked as it prints', `${said(rs)} · ${fmtOf(rs)}`);
  check(shipsClean(rr) && /^"\[[^\]]+\]"\\ 0$/.test(fmtOf(rr)), 'a declared term escaped character by character is masked the same way', `${said(rr)} · ${fmtOf(rr)}`);
  const c1 = await write(escaped, { W: await mutated(["if (c === '\\\\' && i + 1 < code.length) { put(i + 1, 'e'); i += 2; continue; }", "if (c === '\\\\' && i + 1 < code.length) { put(i + 1, 'e'); if (cur) runs.push(cur); cur = null; i += 2; continue; }"]) });
  check(!c1.report.held && /\\1\\2\\3/.test(fmtOf(c1)), 'CONTROL: with each escaped character read on its own, by the writer and the gate alike, the number ships', `${said(c1)} · ${fmtOf(c1)}`);
  const c2 = await write(split, { W: await mutated(["if (FORMAT_BARE.has(c)) { put(i, 'b'); i++; continue; }", "if (false) { put(i, 'b'); i++; continue; }"]) });
  check(!c2.report.held && /"123"-"45"/.test(fmtOf(c2)), 'CONTROL: with a bare hyphen ending the stretch, the quoted runs ship', `${said(c2)} · ${fmtOf(c2)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 40: an equation is read as it renders: its runs side by side, its arguments apart —');
{
  // A run is an equation's by its m:r: a "normal text" run of an equation holds a w:t, and
  // "Kes" there beside m:t "trel" shipped the term (W5-6, 2026-09-23). A base and its subscript
  // do not render side by side: joined, x with subscript i read "xi", and a row "Xi" masked the
  // formula the review showed readable (W4-F5).
  const eq = (inner) => `<w:p><m:oMathPara><m:oMath>${inner}</m:oMath></m:oMathPara></w:p>`;
  const normal = await docx({ body: eq('<m:r><w:t>Kes</w:t></m:r><m:r><m:t>trel</m:t></m:r>') });
  const doc = (x) => x.raw['word/document.xml'] || '';
  const r = await write(normal);
  check(shipsClean(r) && !/>(Kes|trel)</.test(doc(r)) && /<(w|m):t[^>]*>\[[^\]]+\]<\/(w|m):t>/.test(doc(r)), 'a name split across an equation\'s normal-text run and its math run is masked', `${said(r)} · ${(doc(r).match(/<(?:w|m):t[^>]*>[^<]*<\/(?:w|m):t>/g) || []).slice(-3).join('')}`);
  const c1 = await write(normal, { engine: EDGE, W: await mutated(['    if (on) cur!.push(i); else { close(); cur = [i]; }', "    if (tagOf(i.elem ?? {}) !== 'm:t') { close(); prev = null; continue; }\n    if (on) cur!.push(i); else { close(); cur = [i]; }"]) });
  check(!c1.report.held && />Kes</.test(doc(c1)), 'CONTROL: with an equation\'s run known by its m:t, "Kes" + "trel" ships', said(c1));

  const XI = [...ROWS, row('x', 'Xi', '[Person2]', 'PERSON', 'person')];
  const sub = await docx({ body: para('Xi signed.') + eq('<m:sSub><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub></m:sSub><m:r><m:t>+1</m:t></m:r>') });
  const rx = await write(sub, { rows: XI });
  check(!rx.report.held && /\[Person2\] signed\./.test(doc(rx)) && /<m:t>x<\/m:t>/.test(doc(rx)) && /<m:t>i<\/m:t>/.test(doc(rx)),
    'x with subscript i is not the word "Xi": the formula ships as written while the name in the text is masked', `${said(rx)} · ${(doc(rx).match(/<m:t[^>]*>[^<]*<\/m:t>/g) || []).join('')}`);
  const cx = await write(sub, { rows: XI, W: await mutated(['      (!!i.math && prev.math === i.math)', '      (!!i.math && !!prev.math)']) });
  check(!/<m:t>x<\/m:t>/.test(doc(cx)), 'CONTROL: with a base and its subscript read as one word, the formula is masked as the row', `${said(cx)} · ${(doc(cx).match(/<m:t[^>]*>[^<]*<\/m:t>/g) || []).join('')}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 41: an Office 2016 chart names its data column, and the review lists it —');
{
  // A cx:lvl's name is printed as a column's name in the chart; a party's name there held the
  // file with no way through in Word, and the review never listed it (W5-7, 2026-09-23).
  const CX = 'xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const chartEx = (extra = '') => `<cx:chartSpace ${CX}><cx:chartData><cx:data id="0"><cx:numDim type="val"><cx:f>Sheet1!$B$2:$B$3</cx:f><cx:lvl ptCount="2" formatCode="General" name="Margaret Tan fees"><cx:pt idx="0">4</cx:pt><cx:pt idx="1">5</cx:pt></cx:lvl></cx:numDim></cx:data></cx:chartData><cx:chart><cx:plotArea><cx:plotAreaRegion><cx:series layoutId="clusteredColumn" uniqueId="{00000001-0000-0000-0000-000000000000}"><cx:dataId val="0"/></cx:series></cx:plotAreaRegion></cx:plotArea></cx:chart>${extra}</cx:chartSpace>`;
  const pkgOf = (xml) => docx({ parts: [{ name: 'word/charts/chartEx1.xml', xml, type: 'application/vnd.ms-office.chartex+xml', rel: ['http://schemas.microsoft.com/office/2014/relationships/chartEx', 'charts/chartEx1.xml', 'rIdCx'] }] });
  const pkg = await pkgOf(chartEx());
  const r = await write(pkg);
  const lvl = (x) => /<cx:lvl [^>]*>/.exec(x.raw['word/charts/chartEx1.xml'] || '')?.[0] ?? '';
  check(shipsClean(r) && /name="\[Person1\] fees"/.test(lvl(r)), 'the column\'s name is masked where it stands', `${said(r)} · ${lvl(r)}`);
  const listed = (await D.extractDocx(pkg)).items.some((i) => i.text === 'Margaret Tan fees');
  const Dm = await bundle(join(SRC, 'extract', 'docx.ts'), [["'cx:lvl': { attrs: ['name'], kind: 'chart' },", '', 'docx.ts']]);
  const unlisted = !(await Dm.extractDocx(pkg)).items.some((i) => i.text === 'Margaret Tan fees');
  check(listed && unlisted, 'the review lists it (CONTROL: with the walker not reading the level\'s name, it does not)', `listed ${listed} · control unlisted ${unlisted}`);
  const c = await write(pkg, { W: await mutated([", name: ['text', 'a chart\\'s data column name'] }", ' }']) });
  check(!!c.report.held && /chartEx1\.xml chart @name/.test(c.held), 'CONTROL: with the writer not masking it, the gate holds the file', said(c));

  // a chartEx's print header goes as a chart's does (law 30); a pattern reading c: alone kept it
  const hf = await pkgOf(chartEx('<cx:printSettings><cx:headerFooter><cx:oddHeader>&amp;CKestrel Confidential</cx:oddHeader></cx:headerFooter></cx:printSettings>'));
  const rh = await write(hf);
  check(shipsClean(rh) && !/headerFooter|oddHeader/.test(rh.raw['word/charts/chartEx1.xml'] || '') && rh.report.notes.some((s) => /^A chart's print header and footer, which Excel prints only when it prints the chart on its own page and Word never shows, were removed\./.test(s)),
    'an Office 2016 chart\'s print header is removed and the receipt says so', `${said(rh)} · ${JSON.stringify(rh.report.notes)}`);
  const ch = await write(hf, { W: await mutated(['const CHART_HF = /^cx?:headerFooter$/;', 'const CHART_HF = /^c:headerFooter$/;']) });
  check(/cx:headerFooter/.test(ch.raw['word/charts/chartEx1.xml'] || '') || !!ch.report.held, 'CONTROL: with only c: headers removed, it is not removed', said(ch));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 42: a VML organisation chart\'s relation table follows its shapes\' new ids —');
{
  // o:rel idsrc/iddest/idcntr name the shapes a chart's connectors join; the shapes were
  // renamed and the table was not, so the file held and told the lawyer to retype an id Word
  // never shows (W4-F4, 2026-09-23).
  const vml = '<w:p><w:r><w:pict><v:group id="Org chart" style="width:100pt;height:50pt" coordsize="2000,1000"><v:rect id="Margaret box" style="width:50pt;height:50pt"/><v:rect id="Kestrel box" style="width:50pt;height:50pt"/>'
    + '<o:diagram v:ext="edit" dgmstyle="0"><o:relationtable v:ext="edit"><o:rel v:ext="edit" idsrc="#Margaret box" iddest="#Kestrel box" idcntr="#Kestrel box"/></o:relationtable></o:diagram></v:group></w:pict></w:r></w:p>';
  const pkg = await docx({ body: vml });
  const r = await write(pkg);
  const doc = r.raw['word/document.xml'] || '';
  const ids = new Set([...doc.matchAll(/<v:rect id="([^"]*)"/g)].map((m) => m[1]));
  const refs = [...doc.matchAll(/(?:idsrc|iddest|idcntr)="#([^"]*)"/g)].map((m) => m[1]);
  check(!r.report.held && !/Kestrel box|Margaret box/.test(doc) && refs.length === 3 && refs.every((x) => ids.has(x)),
    'each reference in the relation table names the id its shape was given', `${said(r)} · ${(doc.match(/<(?:v:rect|o:rel) [^>]*>/g) || []).join(' ')}`);
  const c = await write(pkg, { W: await mutated(["const VML_RULE = new Set(['o:r', 'o:proxy', 'o:rel']);", "const VML_RULE = new Set(['o:r', 'o:proxy']);"]) });
  check(!!c.report.held && /o:rel@(idsrc|iddest|idcntr)/.test(c.held), 'CONTROL: with the table left as written, the gate holds on it', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 43: the backstop to law 25 holds on a word by where it stands, and reads every flow —');
{
  // A hidden suffix on a word that shares a word with a row ("Mr " + "Smith" + hidden "son")
  // counted one "smith" more than the record, where the review masked nothing: the backstop held
  // a correctly masked copy and said a word of the client's name stood where the review masked
  // it (W4-F3, 2026-09-23). Each word the count raises is now carried back to the record.
  const run = (t, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  const hid = (t) => run(t, '<w:vanish/>');
  const p = (...r) => `<w:p>${r.join('')}</w:p>`;
  const text = (x, n = 'word/document.xml') => (x.raw[n] || '').replace(/<w:p\b[^>]*>/g, '\n').replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
  const byCount = ['let why: \'masked\' | \'joined\' | null = null;', 'let why: \'masked\' | \'joined\' | null = \'masked\';'];
  const SMITH = [...ROWS, row('j', 'John Smith', '[Person2]', 'PERSON', 'person')];
  const son = await docx({ body: p(run('John Smith attended. Mr '), run('Smith'), hid('son'), run(' gave evidence.')) });
  const r1 = await write(son, { rows: SMITH });
  check(shipsClean(r1) && /\[Person2\] attended\. Mr Smith gave evidence\./.test(text(r1)), 'a hidden suffix on a word the row shares ships as Word shows it: the review masked nothing there', `${said(r1)} · ${text(r1)}`);
  const c1 = await write(son, { rows: SMITH, W: await mutated(byCount) });
  check(!!c1.report.held && /where the reviewed text masks it/.test(c1.held), 'CONTROL: judged by the count alone, it holds and says the review masked it', said(c1));
  const REYES = [...ROWS, row('d', 'Donald Reyes', '[Person2]', 'PERSON', 'person')];
  const mc = await write(await docx({ body: p(run('Donald Reyes gave evidence. Dr '), hid('Mc'), run('Donald, the expert, agreed.')) }), { rows: REYES });
  check(shipsClean(mc) && /\[Person2\] gave evidence\. Dr Donald, the expert, agreed\./.test(text(mc)), 'so does a hidden prefix ("Mc" + "Donald")', `${said(mc)} · ${text(mc)}`);

  // a word the copy makes by joining what stood either side of hidden text is not one the
  // review read, and holds with that said
  const JOHN = [...ROWS, row('j', 'John Michael Smith', '[Person2]', 'PERSON', 'person')];
  const join1 = await docx({ body: p(run('Jo'), hid('x'), run('hn Smith attended.')) });
  const rj = await write(join1, { rows: JOHN });
  check(!!rj.report.held && /a person row \(\[Person2\]\) stands readable in the copy where the reviewed text does not read it/.test(rj.held) && !/John|Michael|Smith/.test(rj.held),
    'a word of a row the copy joins across hidden text holds, saying the review never read it there', said(rj));
  const cj = await write(join1, { rows: JOHN, W: await mutated(['let whole = r >= 0;', 'let whole = true;'], ['for (let x = 1; whole && x < len; x++) whole = at[a + x] === r + x;', '']) });
  check(!cj.report.held && /John Smith attended/.test(text(cj)), 'CONTROL: taken as the record\'s own word, "John Smith" ships', `${said(cj)} · ${text(cj)}`);

  // the pass that masks a name the strip joins (placeFlow's second pass)
  const kes = await docx({ body: p(run('The buyer is Kes'), hid('x'), run('trel and no one else.')) });
  const rk = await write(kes);
  check(shipsClean(rk) && /The buyer is \[[^\]]+\] and no one else\./.test(text(rk)), 'a declared term the strip joins across hidden text ships masked', `${said(rk)} · ${text(rk)}`);
  const SECOND = 'if (text !== masked && pass(blank(text), now.spans) === null) return res;';
  const ck = await write(kes, { W: await mutated([SECOND, 'return res;']) });
  check(!!ck.report.held && /Kestrel/.test(ck.held), 'CONTROL: with the second pass off, and the run-together step after it, the gate reads the joined term and holds', said(ck));
  // the run-together step reads the flow as it now reads, so it masks a join the second pass missed
  const cs = await write(kes, { W: await mutated([SECOND, '']) });
  check(shipsClean(cs) && /The buyer is \[[^\]]+\] and no one else\./.test(text(cs)), 'with the second pass off alone, the run-together step masks the joined term', `${said(cs)} · ${text(cs)}`);

  // every saved flow is set against its record, not the body's alone
  const hdr = await docx({ header: p(run('John '), hid('Michael '), run('Smith, the claimant, attended.')) });
  const A_OFF = ['const placed = placeFlow(flow, pieces, opts.mask, written);', 'const placed = placeFlow(fold(layout.text), layout.spans, opts.mask, written);'];
  const rh = await write(hdr, { rows: JOHN });
  const ch1 = await write(hdr, { rows: JOHN, W: await mutated(A_OFF) });
  check(shipsClean(rh) && !!ch1.report.held && /in a header/.test(ch1.held) && /word\/header1\.xml: a word of a person row/.test(ch1.held),
    'a name hidden text splits in a header is masked; masked over the stripped text, the backstop holds on the header', `${said(rh)} · control ${said(ch1)}`);
  const ch2 = await write(hdr, { rows: JOHN, W: await mutated(A_OFF, ['const todo = saved.map((s) => {', 'const todo = saved.slice(0, 1).map((s) => {']) });
  check(!ch2.report.held && /John Smith/.test(text(ch2, 'word/header1.xml')), 'CONTROL: with the backstop reading the first flow alone, "John Smith" ships in the header', `${said(ch2)} · ${text(ch2, 'word/header1.xml')}`);
  // one word of a row, alone, is caught as surely as the pair: counted, not matched as a pair
  const lone = await docx({ body: p(run('John '), hid('Michael Smith'), run(', the claimant, attended.')) });
  const rl = await write(lone, { rows: JOHN, W: await mutated(A_OFF) });
  check(!!rl.report.held && /a word of a person row \(\[Person2\]\)/.test(rl.held) && !/John|Michael|Smith/.test(rl.held),
    'masked over the stripped text, a lone "John" left of "John Michael Smith" holds on the backstop', said(rl));
  const cl = await write(lone, { rows: JOHN, W: await mutated(A_OFF, ['for (const [w, n] of t.got) if (n > (had.get(w) ?? 0)) rose.add(w);', 'for (const [w, n] of t.got) if (n > (had.get(w) ?? 0) && t.got.size > 1) rose.add(w);']) });
  check(!cl.report.held && /John ?, the claimant/.test(text(cl)), 'CONTROL: with only two words of a row counted, "John" ships', `${said(cl)} · ${text(cl)}`);

  // a run found out of order in the record is one the writer cannot place a name over. No pass
  // reorders runs today, so the reorder is a mutant; what is tested is that the part holds on it
  const order = await docx({ body: p(run('Margaret '), run('Tan attended.')) });
  const REORDER = ['for (const sp of layout.spans) {', 'for (const sp of [...layout.spans].reverse()) {'];
  const ro = await write(order, { W: await mutated(REORDER) });
  check(!!ro.report.held && /could not find a run of word\/document\.xml in the text of record/.test(ro.held), 'a run found out of order in the record holds the part', said(ro));
  const co = await write(order, { W: await mutated(REORDER, ['(pieces.length && r.s < pieces[pieces.length - 1].e) || ', '']) });
  check(!co.report.held, 'CONTROL: with the order check off, the same writer ships the part', `${said(co)} · ${text(co)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 44: a run Word shows is kept: w:vanish w:val="off" is not hidden —');
{
  // ST_OnOff reads false, 0 and off as off. "off" read as on removed "not " from "does not
  // consent" in the copy and flagged it hidden in the review (W5-1, 2026-09-23).
  const pkg = await docx({ body: '<w:p><w:r><w:t xml:space="preserve">The claimant does </w:t></w:r><w:r><w:rPr><w:vanish w:val="off"/></w:rPr><w:t xml:space="preserve">not </w:t></w:r><w:r><w:t>consent to the order.</w:t></w:r></w:p>' });
  const body = (x) => (x.raw['word/document.xml'] || '').replace(/<[^>]+>/g, '');
  const r = await write(pkg);
  check(shipsClean(r) && /does not consent/.test(body(r)) && r.report.removed.hiddenRuns === 0, 'the run is kept and nothing is counted hidden', `${said(r)} · hidden ${r.report.removed.hiddenRuns}`);
  const x = await D.extractDocx(pkg);
  check(x.items.every((i) => !i.hidden) && x.items.some((i) => i.text === 'not '), 'the review reads it as shown, not as hidden text', JSON.stringify(x.items.map((i) => [i.text, !!i.hidden])));
  const OFF = ["if (v !== 'false' && v !== '0' && v !== 'off') return true;", "if (v !== 'false' && v !== '0') return true;", 'docx.ts'];
  const c = await write(pkg, { W: await mutated(OFF) });
  const Dm = await bundle(join(SRC, 'extract', 'docx.ts'), [OFF]);
  const cx = await Dm.extractDocx(pkg);
  check(/does consent/.test(body(c)) && c.report.removed.hiddenRuns === 1 && cx.items.some((i) => i.text === 'not ' && i.hidden), 'CONTROL: with "off" read as on, "not " is removed from the copy and flagged hidden in the review', `${body(c).slice(-60)} · ${JSON.stringify(cx.items.map((i) => [i.text, !!i.hidden]))}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 45: what an equation prints in line with its neighbours is read with them; what it prints apart stays apart —');
{
  // Keyed by the element directly holding each run, a box, a border box, a bar, an accent, a
  // group character, a delimiter (empty or filled) and a phantom each split an equation's
  // stretch: "Kes" + a boxed "trel" shipped in the .docx under a gate that passed (INT-9,
  // 2026-09-23). A script, a fraction's parts, a radical's degree, an n-ary operator's limits,
  // a function's argument and a limit print apart from their base, and stay apart: joined, x
  // with subscript i read "xi", and a row "Xi" masked a formula the review showed readable (W4-F5).
  // The engine's mask now finds a name run together itself (engine.ts, 2026-09-23), and masks x
  // beside i as a row "Xi" whatever the zones (law 40), so each check runs under EDGE, a mask
  // that places a row at a word's edges only: it is the writer's reading of the equation that is
  // checked, and a zone joined wrongly shows.
  const eq = (inner) => `<w:p><m:oMathPara><m:oMath>${inner}</m:oMath></m:oMathPara></w:p>`;
  const mr = (t) => `<m:r><m:t>${t}</m:t></m:r>`;
  const me = (t) => `<m:e>${mr(t)}</m:e>`;
  const doc = (x) => x.raw['word/document.xml'] || '';
  const eqText = (x) => (doc(x).match(/<m:t[^>]*>[^<]*<\/m:t>/g) || []).join('');
  const INLINE = {
    'a box': `<m:box>${me('trel')}</m:box>`,
    'a border box': `<m:borderBox>${me('trel')}</m:borderBox>`,
    'a bar': `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>${me('trel')}</m:bar>`,
    'an accent': `<m:acc><m:accPr><m:chr m:val="~"/></m:accPr>${me('trel')}</m:acc>`,
    'a group character': `<m:groupChr>${me('trel')}</m:groupChr>`,
    'a delimiter': `<m:d>${me('trel')}</m:d>`,
    'an empty delimiter': `<m:d><m:dPr><m:begChr m:val=""/><m:endChr m:val=""/></m:dPr>${me('trel')}</m:d>`,
    'a phantom': `<m:phant>${me('trel')}</m:phant>`,
  };
  const ZONE_OFF = ["math: key === 'm:r' ? zone ?? ctx.parent : ctx.math", "math: key === 'm:r' ? ctx.parent : ctx.math", 'docx.ts'];
  const zoneOff = await mutated(ZONE_OFF);
  const bad = [], ctl = [];
  for (const [what, inner] of Object.entries(INLINE)) {
    const pkg = await docx({ body: eq(mr('Kes') + inner) });
    for (const engine of [E, EDGE]) {
      const r = await write(pkg, { engine });
      if (!(shipsClean(r) && !/>(?:Kes|trel)</.test(doc(r)) && /<m:t[^>]*>\[[^\]]+\]<\/m:t>/.test(doc(r)))) bad.push(`${what}${engine === EDGE ? ' (EDGE)' : ''}: ${said(r)} · ${eqText(r)}`);
    }
    const c = await write(pkg, { engine: EDGE, W: zoneOff });
    if (!(!c.report.held && />Kes</.test(doc(c)) && />trel</.test(doc(c)))) ctl.push(`${what}: ${said(c)} · ${eqText(c)}`);
  }
  check(!bad.length, `"Kes" beside ${Object.keys(INLINE).join(', ')} holding "trel" is masked, by the mask and by the writer's own reading alike`, bad.join(' | '));
  check(!ctl.length, 'CONTROL: with each run keyed by the element directly holding it, "Kes" and "trel" ship beside each of them', ctl.join(' | '));

  const XI = [...ROWS, row('x', 'Xi', '[Person2]', 'PERSON', 'person')];
  const APART = {
    'a subscript': `<m:sSub>${me('x')}<m:sub>${mr('i')}</m:sub></m:sSub>`,
    'a superscript': `<m:sSup>${me('x')}<m:sup>${mr('i')}</m:sup></m:sSup>`,
    'a subscript and a superscript': `<m:sSubSup>${me('x')}<m:sub>${mr('i')}</m:sub><m:sup>${mr('2')}</m:sup></m:sSubSup>`,
    'a pre-script': `<m:sPre><m:sub>${mr('x')}</m:sub><m:sup>${mr('i')}</m:sup>${me('+1')}</m:sPre>`,
    'a fraction': `<m:f><m:num>${mr('x')}</m:num><m:den>${mr('i')}</m:den></m:f>`,
    'a radical': `<m:rad><m:deg>${mr('x')}</m:deg>${me('i')}</m:rad>`,
    'an n-ary operator\'s limits': `<m:nary><m:naryPr><m:chr m:val="&#8721;"/></m:naryPr><m:sub>${mr('x')}</m:sub><m:sup>${mr('i')}</m:sup>${me('+1')}</m:nary>`,
    'a function\'s name and argument': `<m:func><m:fName>${mr('x')}</m:fName>${me('i')}</m:func>`,
    'a lower limit': `<m:limLow>${me('x')}<m:lim>${mr('i')}</m:lim></m:limLow>`,
    'an upper limit': `<m:limUpp>${me('x')}<m:lim>${mr('i')}</m:lim></m:limUpp>`,
    'a matrix\'s cells': `<m:m><m:mr>${me('x')}${me('i')}</m:mr></m:m>`,
    'an equation array\'s lines': `<m:eqArr>${me('x')}${me('i')}</m:eqArr>`,
  };
  const APART_OFF = ["const zone = key === 'm:oMath' || MATH_APART[ctx.tag ?? '']?.has(key) ? node : ctx.zone;", "const zone = key === 'm:oMath' ? node : ctx.zone;", 'docx.ts'];
  const apartOff = await mutated(APART_OFF);
  const kept = [], joined = [];
  for (const [what, inner] of Object.entries(APART)) {
    const pkg = await docx({ body: para('Xi signed.') + eq(inner) });
    const r = await write(pkg, { rows: XI, engine: EDGE });
    if (!(!r.report.held && /\[Person2\] signed\./.test(doc(r)) && /<m:t>x<\/m:t>/.test(doc(r)) && /<m:t>i<\/m:t>/.test(doc(r)))) kept.push(`${what}: ${said(r)} · ${eqText(r)}`);
    const c = await write(pkg, { rows: XI, engine: EDGE, W: apartOff });
    if (/<m:t>x<\/m:t>/.test(doc(c))) joined.push(`${what}: ${said(c)} · ${eqText(c)}`);
  }
  check(!kept.length, `x and i across ${Object.keys(APART).join(', ')} are not the word "Xi": each formula ships as written while the name in the text is masked`, kept.join(' | '));
  check(!joined.length, 'CONTROL: with every argument read in line with its base, each formula is masked as the row', joined.join(' | '));
  // a matrix's cells and an equation array's lines are keyed by their own entries (W-FID-9): with
  // those two removed and every other kept, the two formulas, and only they, read "xi"
  const cellsOff = await mutated(["'m:mr': new Set(['m:e']), 'm:eqArr': new Set(['m:e']),", '', 'docx.ts']);
  const cellJoined = [];
  for (const [what, inner] of Object.entries(APART)) {
    const c = await write(await docx({ body: para('Xi signed.') + eq(inner) }), { rows: XI, engine: EDGE, W: cellsOff });
    if (/<m:t>x<\/m:t>/.test(doc(c)) === /matrix|array/.test(what)) cellJoined.push(`${what}: ${said(c)} · ${eqText(c)}`);
  }
  check(!cellJoined.length, 'CONTROL: with a matrix row\'s and an equation array\'s entries unlisted, those two formulas are masked as the row and the rest are not', cellJoined.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 46: a name of the table run together with what stands beside it is masked wherever it stands —');
{
  // A row's match starts and stops at a word's edge, and "KestrelCapital" in a footer, a client
  // typed "kestrelholdings" in the body and "MARGARETTAN" in a watermark each shipped readable
  // under a gate that passed (owner ruling 1, 2026-09-23; P1 probe 3, D2, W refix 3). In code,
  // from six letters and digits (RUN_FLOOR) a name is found anywhere inside a word, a shorter one
  // only where the word breaks. In text a reader sees, owner ruling 8 (2026-09-24): where the
  // word breaks, and from six inside a token that is not a word of prose — a web address, a
  // handle — never inside a plain word of letters ("kestrelholdings" is law 58's).
  const WML_FTR = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
  const footer = (t) => ({ name: 'word/footer1.xml', xml: `<w:ftr ${NS}>${para(t)}</w:ftr>`, type: WML_FTR, rel: ['footer', 'footer1.xml', 'rIdF'] });
  const txt = (x, n) => (x.raw[n] || '').replace(/<w:p\b[^>]*>/g, '\n').replace(/<[^>]+>/g, '').trim();
  const cases = [
    ['a footer', await docx({ parts: [footer('KestrelCapital · Private and confidential')] }), 'word/footer1.xml', /^\[[^\]]+\]Capital · Private and confidential$/],
    ['the body, in a web address', await docx({ body: para('Paid to www.kestrelcorp.com on signing.') }), 'word/document.xml', /Paid to www\.\[[^\]]+\]corp\.com on signing\./],
    ['the body, with no space', await docx({ body: para('Copy to MargaretTan by hand.') }), 'word/document.xml', /Copy to \[Person1\] by hand\./],
  ];
  for (const [where, pkg, part, want] of cases) {
    const r = await write(pkg);
    const re = await write(pkg, { engine: EDGE });
    const c1 = await write(pkg, { engine: EDGE, W: await mutated(FLOW_RUN_OFF) });
    const c2 = await write(pkg, { engine: EDGE, W: await mutated(FLOW_RUN_OFF, GATE_TEXT_RUN_OFF) });
    check(shipsClean(r) && want.test(txt(r, part)) && shipsClean(re) && want.test(txt(re, part)),
      `in ${where}, the name run together is masked, by the mask and by the writer's own reading alike`, `${said(r)} · ${txt(r, part).slice(-80)} · EDGE ${said(re)} · ${txt(re, part).slice(-80)}`);
    check(!!c1.report.held && /still carries/.test(c1.held) && !c2.report.held && c2.leaks.length > 0,
      `CONTROL: in ${where}, with the writer's reading off the gate holds on it, and with the gate's off too it ships`, `${said(c1)} · ${said(c2)}`);
  }
  // a watermark, an attribute masked as text
  const wm = await docx({ header: `<w:p><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1" type="#_x0000_t136" style="width:400pt;height:100pt"><v:textpath style="font-family:&quot;Calibri&quot;" string="MARGARETTAN DRAFT"/></v:shape></w:pict></w:r></w:p>` });
  const rw = await write(wm, { engine: EDGE });
  const hw = rw.raw['word/header1.xml'] || '';
  check(shipsClean(rw) && /string="\[Person1\] DRAFT"/.test(hw), 'a watermark reading "MARGARETTAN DRAFT" is masked by the writer\'s own reading', `${said(rw)} · ${/string="[^"]*"/.exec(hw)?.[0]}`);
  const cw1 = await write(wm, { engine: EDGE, W: await mutated(VALUE_RUN_OFF) });
  const cw2 = await write(wm, { engine: EDGE, W: await mutated(VALUE_RUN_OFF, GATE_TEXT_RUN_OFF) });
  check(!!cw1.report.held && /margarettan/i.test(cw1.held) && !cw2.report.held && cw2.leaks.length > 0, 'CONTROL: with the writer\'s reading of a value off the gate holds on the watermark, and with the gate\'s off too it ships', `${said(cw1)} · ${said(cw2)}`);
  // a chart's text
  const chartXml = `<c:chartSpace ${NS}><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>KestrelCapital fees</c:v></c:pt></c:strCache></c:strRef></c:tx></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  const chBody = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const ch = await docx({ body: chBody, parts: [{ name: 'word/charts/chart1.xml', xml: chartXml, type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] }] });
  const rc = await write(ch, { engine: EDGE });
  check(shipsClean(rc) && /<c:v>\[[^\]]+\]Capital fees<\/c:v>/.test(rc.raw['word/charts/chart1.xml'] || ''), 'a chart series named "KestrelCapital fees" is masked by the writer\'s own reading', `${said(rc)} · ${/<c:v>[^<]*<\/c:v>/.exec(rc.raw['word/charts/chart1.xml'] || '')?.[0]}`);
  const cc = await write(ch, { engine: EDGE, W: await mutated(FLOW_RUN_OFF, GATE_TEXT_RUN_OFF) });
  check(!cc.report.held && cc.leaks.length > 0, 'CONTROL: with the writer\'s and the gate\'s readings off, it ships', said(cc));
  // a name Word keeps for itself: a style, a font, a drawn shape's id, a part
  const styles = `<w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:customStyle="1" w:styleId="kestrelheading"><w:name w:val="kestrelheading"/><w:basedOn w:val="Normal"/></w:style></w:styles>`;
  const names = await docx({
    body: '<w:p><w:pPr><w:pStyle w:val="kestrelheading"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Kestrelsans" w:hAnsi="Kestrelsans"/></w:rPr><w:t>Recitals</w:t></w:r></w:p>'
      + '<w:p><w:r><w:pict><v:rect id="kestrelbox2" style="width:50pt;height:50pt"/></w:pict></w:r></w:p>',
    parts: [{ name: 'word/styles.xml', xml: styles, type: CT.styles, rel: ['styles', 'styles.xml'] }],
  });
  const rn = await write(names, { engine: EDGE });
  const d = rn.raw['word/document.xml'] || '';
  check(shipsClean(rn) && !/kestrel/i.test(Object.values(rn.raw).join('')) && /w:ascii="Redacted font \d+"/.test(d) && dangling(rn.raw).bad.length === 0,
    'a style "kestrelheading", a font "Kestrelsans" and a drawn shape "kestrelbox2" are renamed, and the paragraph still finds its style', `${said(rn)} · ${(d.match(/w:(?:ascii|val)="[^"]*"|<v:rect id="[^"]*"/g) || []).join(' ')}`);
  const part = await docx({ parts: [{ name: 'word/kestrelnotes.xml', xml: '<acme:notes xmlns:acme="urn:acme:notes"><acme:n>3</acme:n></acme:notes>', type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'kestrelnotes.xml'] }] });
  const rp = await write(part, { engine: EDGE });
  check(!!rp.report.held && /the name of a part inside the file/.test(rp.held), 'a part named "word/kestrelnotes.xml" holds the file', said(rp));
  const cp = await write(part, { engine: EDGE, W: await mutated(['const at = refFind(v, names, how, true, v.length > 80)[0];', 'const at = undefined;']) });
  check(!cp.report.held && cp.names.includes('word/kestrelnotes.xml'), 'CONTROL: with the gate looking for no name run together, it ships', said(cp));

  // in text a name is found where the word breaks: "Wong" in "WongCapital", not in "Wongsuwan", a
  // surname of its own
  const WONG = [...ROWS, row('w', 'Wong', '[Person3]', 'PERSON', 'person')];
  const short = await docx({ body: para('Wongsuwan signed for WongCapital.') });
  for (const engine of [E, EDGE]) {
    const rs = await write(short, { rows: WONG, engine });
    check(!rs.report.held && /Wongsuwan signed for \[Person3\]Capital\./.test(txt(rs, 'word/document.xml')), `a name is found where the word breaks ("WongCapital") and not inside a word ("Wongsuwan")${engine === EDGE ? ', by the writer\'s own reading' : ''}`, `${said(rs)} · ${txt(rs, 'word/document.xml').slice(-60)}`);
  }
  const cs = await write(short, { rows: WONG, engine: EDGE, W: await mutated(['if (k.cuts.has(e) || (loose && k.np[e - 1])) return true;', 'return true;']) });
  check(/\[Person3\]suwan/.test(txt(cs, 'word/document.xml')), 'CONTROL: with a find\'s end not required to be a break, "Wongsuwan" is masked as the row', `${said(cs)} · ${txt(cs, 'word/document.xml').slice(-60)}`);
  // two words are two words: "a new man" is not a row "Newman"
  const NEWMAN = [...ROWS, row('n', 'Newman', '[Person3]', 'PERSON', 'person')];
  const two = await docx({ body: para('Newman said a new man had come.') });
  const rt = await write(two, { rows: NEWMAN, engine: EDGE });
  check(!rt.report.held && /\[Person3\] said a new man had come\./.test(txt(rt, 'word/document.xml')), 'text a reader sees is read word by word: "a new man" is not the row "Newman"', `${said(rt)} · ${txt(rt, 'word/document.xml')}`);
  const ct = await write(two, { rows: NEWMAN, engine: EDGE, W: await mutated(["const run = runTags(refSpans(blank(fold(last.text)), names, 'text'), mask);", "const run = runTags(refSpans(blank(fold(last.text)), names, 'all'), mask);"], ["else if (o.mode === 'text') checkRef(o.label, o.value, 'text');", "else if (o.mode === 'text') checkRef(o.label, o.value, 'all');"]) });
  check(/said a \[Person3\] had come/.test(txt(ct, 'word/document.xml')), 'CONTROL: read as a code word is, both ways across any separator, "a new man" is masked as the row', `${said(ct)} · ${txt(ct, 'word/document.xml')}`);
  // A tag already written is a wall (refFind's █): "Kestrel Bedrock Capital" is a row between two
  // words, not the listed "Kestrel Capital" run across it. Found across it, the term's tag
  // swallowed the row's, and the copy read "[Protected3] signed." with no company in it
  // (probed 2026-09-23, W-FID-9).
  const BED = [...ROWS, row('b', 'Bedrock', '[Company1]', 'ORG', 'company')];
  const walled = await docx({ body: para('Kestrel Bedrock Capital signed.') });
  for (const engine of [E, EDGE]) {
    const rw = await write(walled, { rows: BED, terms: ['Kestrel Capital'], engine });
    check(!rw.report.held && /Kestrel \[Company1\] Capital signed\./.test(txt(rw, 'word/document.xml')), `a row between the two words of a listed term keeps its own tag, and the term is not found across it${engine === EDGE ? ', by the writer\'s own reading' : ''}`, `${said(rw)} · ${txt(rw, 'word/document.xml').slice(-60)}`);
  }
  const cwl = await write(walled, { rows: BED, terms: ['Kestrel Capital'], W: await mutated(['for (const m of piece.matchAll(/[^█]+/gu)) stretches.push', 'for (const m of piece.matchAll(/[\\s\\S]+/gu)) stretches.push']) });
  check(!/\[Company1\]/.test(txt(cwl, 'word/document.xml')) && /\[[^\]]+\] signed\./.test(txt(cwl, 'word/document.xml')), 'CONTROL: with a written tag no wall, the term is found across the row and its tag swallows the row\'s', `${said(cwl)} · ${txt(cwl, 'word/document.xml').slice(-60)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 47: a part the writer does not know holds on a number the safety net masks in the text —');
{
  // A telephone, card, account or identity number an add-in keeps as a code was kept as a number
  // under a note that said so (owner ruling 2, 2026-09-23): it is read as the body is, under the
  // file's practice. A GUID is not: its digits are random and no one types a number into one.
  const unk = (inner) => ({ name: 'word/unheardOf.xml', xml: `<acme:notes xmlns:acme="urn:acme:notes">${inner}</acme:notes>`, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] });
  const HELD = /^word\/unheardOf\.xml, a part of the file this app does not know, holds a number the safety net masks in the text \(a telephone, card, account or identity number\)/;
  // (a number written with its separators, "123-45-6789", is not a code word and holds as text
  // someone typed, law 36)
  const NUMS = { 'between its tags': '<acme:phone>61234567</acme:phone>', 'in an attribute': '<acme:acct acme:no="4111111111111111"/>', 'of ten digits': '<acme:tel>2125550147</acme:tel>' };
  const PRE_OFF = ['if (hits.some((h) => h.some((x) => x.floor))) return hold(', 'if (false) return hold('];
  const GATE_OFF = ['floorAt.push(o.floor && j === 0 ? whole :', 'floorAt.push(false ? whole :'];
  const preOff = await mutated(PRE_OFF), bothOff = await mutated(PRE_OFF, GATE_OFF);
  for (const [where, inner] of Object.entries(NUMS)) {
    const pkg = await docx({ parts: [unk(inner)] });
    const num = /(\d[\d-]+\d)/.exec(inner)[1];
    const r = await write(pkg);
    check(!!r.report.held && HELD.test(r.held) && !r.held.includes(num) && /Paste Special > Picture/.test(r.held), `a number ${where} holds the file, says the way through and does not print the number`, said(r));
    const c1 = await write(pkg, { W: preOff });
    const c2 = await write(pkg, { W: bothOff });
    check(!!c1.report.held && /safety-net pattern|span\(s\) still readable/.test(c1.held) && !c2.report.held && (c2.raw['word/unheardOf.xml'] || '').includes(num),
      `CONTROL: ${where}, with the writer's reading off the gate holds on it, and with the gate's off too it ships`, `${said(c1)} · ${said(c2)}`);
  }
  const guid = await docx({ parts: [unk('<acme:item acme:id="{0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0}" acme:empty="{00000000-0000-0000-0000-000000000000}"/>')] });
  const rg = await write(guid);
  check(shipsClean(rg) && rg.names.includes('word/unheardOf.xml'), 'a GUID whose groups read as a telephone or a card number to the safety net is kept', said(rg));
  const cg = await write(guid, { W: await mutated(['if (floor && GUID_VALUE.test(value.trim())) floor = false;', ''], ["if (val.trim() && !KNOWN_NS.has(val) && !GUID_VALUE.test(val.trim())) out.push(fold(val));", 'if (val.trim() && !KNOWN_NS.has(val)) out.push(fold(val));']) });
  check(!!cg.report.held && HELD.test(cg.held), 'CONTROL: read as a number, the GUID holds the file', said(cg));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 48: a number format\'s currency section prints its symbol, and is read as printed text —');
{
  // [$symbol-locale] prints the symbol beside every value, and every bracket was skipped as
  // syntax: "[$6123 4567-409] 0" printed a telephone number beside each value under a gate that
  // passed (INT-23, W6-2, 2026-09-23). An ordinary currency section is kept as written.
  const chart = (code) => `<c:chartSpace ${NS}><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:dLbls><c:numFmt formatCode="${code}" sourceLinked="0"/><c:showVal val="1"/></c:dLbls><c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  const body = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const pkgOf = (code) => docx({ body, parts: [{ name: 'word/charts/chart1.xml', xml: chart(code), type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] }] });
  const fmt = (x) => /formatCode="([^"]*)" sourceLinked/.exec(x.raw['word/charts/chart1.xml'] || '')?.[1] ?? '';
  const phone = await pkgOf('[$6123 4567-409]#,##0');
  const r = await write(phone);
  check(shipsClean(r) && !/6123/.test(fmt(r)) && /#,##0$/.test(fmt(r)), 'a currency section printing a telephone number is masked, and the number format still formats', `${said(r)} · ${fmt(r)}`);
  const c = await write(phone, { W: await mutated(["if (sym) for (let x = sym[0]; x < sym[1]; x++) put(x, 'c');", '']) });
  check(!c.report.held && /6123 4567/.test(fmt(c)), 'CONTROL: with the section skipped as syntax, the number ships and the gate passes', `${said(c)} · ${fmt(c)}`);
  for (const code of ['[$€-2] #,##0.00', '[$USD-409] #,##0', '[$-F800]dddd, mmmm dd, yyyy']) {
    const k = await write(await pkgOf(code));
    check(shipsClean(k) && fmt(k) === code.replace(/"/g, '&quot;'), `an ordinary currency or locale section "${code}" is kept as written`, `${said(k)} · ${fmt(k)}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 49: the names in a part\'s own code are read: its elements\', its attributes\', the namespaces it declares and lists —');
{
  // Until 2026-09-23 no name in the markup was read, and <acme:KestrelCapital/>,
  // xmlns:margaretTan=… and mc:Ignorable="kestrelcapital" shipped in a part the receipt said was
  // read; a schema address was skipped whole when it started on Office's host, whatever came
  // after it (INT-23, W6-4, D13R-1, D13R-4). The names Office's own formats define are not read:
  // a row "Target" would hold every file on Relationship@Target.
  const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
  const unk = (xml) => ({ name: 'word/unheardOf.xml', xml, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] });
  const PLACES = {
    'an element\'s name': '<acme:root xmlns:acme="urn:acme-addin"><acme:KestrelCapital acme:id="4471"/></acme:root>',
    'an attribute\'s name': '<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:margaretTan="1"/></acme:root>',
    'a namespace prefix': '<margaretTan:root xmlns:margaretTan="urn:acme-addin"><margaretTan:note margaretTan:id="1"/></margaretTan:root>',
    'a namespace declaration': '<acme:root xmlns:acme="urn:kestrel-capital:matter-4471"><acme:note acme:id="4471"/></acme:root>',
    'a namespace declaration, run together': '<acme:root xmlns:acme="urn:kestrelcapital"><acme:note acme:id="4471"/></acme:root>',
    'a compatibility list': `<acme:root xmlns:acme="urn:acme-addin" ${MC} mc:Ignorable="kestrelcapital"><acme:note acme:id="1"/></acme:root>`,
    'an address on Office\'s own host': '<acme:root xmlns:acme="http://schemas.openxmlformats.org/officeDocument/2006/KestrelCapital"><acme:note acme:id="1"/></acme:root>',
    'an address on Microsoft\'s schema host': '<acme:root xmlns:acme="http://schemas.microsoft.com/office/word/2012/margaretTan"><acme:note acme:id="1"/></acme:root>',
  };
  const OFF = [
    ['const qnameRead = (label: string, q: string, scope: Map<string, string>, elemUri?: string, net = false) => {', 'const qnameRead = (label: string, q: string, scope: Map<string, string>, elemUri?: string, net = false) => { return;'],
    ['const nsDecl = (label: string, k: string, v: string, net = false) => {', 'const nsDecl = (label: string, k: string, v: string, net = false) => { return;'],
    ['const mcList = (label: string, v: string, scope: Map<string, string>, net = false) => {', 'const mcList = (label: string, v: string, scope: Map<string, string>, net = false) => { return;'],
  ];
  // The writer's own check of such a part holds on most of these before anything is written (a
  // name in its markup that is not a code word, or that carries a table name, is typed: W-FID-8),
  // so the gate is read here with that check off, as the backstop it is.
  const PRE_OFF = [
    ['    if (markupTyped(t, here)) return true;\n', '\n'],
    ['if (p && !KNOWN_NS.get(String(a[k]))?.has(p) && !nameCode(p)) return true; continue; }', 'continue; }'],
    ['{ if (listTyped(v, here)) return true; continue; }', '{ continue; }'],
    ['      if (markupTyped(k, here, elemUri)) return true;\n', '\n'],
  ];
  const pre = await mutated(...PRE_OFF);
  const off = await mutated(...PRE_OFF, ...OFF);
  const held = [], shipped = [], writer = [];
  for (const [where, xml] of Object.entries(PLACES)) {
    const pkg = await docx({ parts: [unk(xml)] });
    const d = await write(pkg);
    if (!(d.report.held && /word\/unheardOf\.xml/.test(d.held))) writer.push(`${where}: ${said(d)}`);
    const r = await write(pkg, { W: pre });
    if (!(r.report.held && /word\/unheardOf\.xml/.test(r.held) && /The file's own code carries it/.test(r.held))) held.push(`${where}: ${said(r)}`);
    const c = await write(pkg, { W: off });
    if (!(!c.report.held && c.names.includes('word/unheardOf.xml'))) shipped.push(`${where}: ${said(c)}`);
  }
  check(!writer.length, `a table name in ${Object.keys(PLACES).join('; ')} holds the file`, writer.join(' | '));
  check(!held.length, 'with the writer\'s own check of the part off, the gate holds on each, and the hold says the file\'s own code carries it', held.join(' | '));
  check(!shipped.length, 'CONTROL: with the names in the markup not read either, each ships', shipped.join(' | '));
  // the format's own, exactly, is not read; a foreign producer's standard prefixes are not held
  const own = await docx({ body: `<w:p xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ${MC} mc:Ignorable="w14" w14:paraId="1A2B3C4D"><w:r><w:t>Recitals</w:t></w:r></w:p>` });
  const VOCAB_ROWS = [...ROWS, ...['Target', 'Office', 'Package', 'Format', 'Relationships'].map((w, i) => row(`v${i}`, w, `[Person${i + 3}]`, 'PERSON', 'person'))];
  const ro = await write(own, { rows: VOCAB_ROWS });
  check(shipsClean(ro), 'a file in Office\'s own vocabulary ships under rows "Target", "Office", "Package", "Format" and "Relationships": Relationship@Target, a relationship\'s type, a media type Office writes and mc:Ignorable="w14" are the format\'s, not a name', said(ro));
  const cm = await write(own, { rows: VOCAB_ROWS, W: await mutated(["const rest = k === 'ContentType' && part === '[Content_Types].xml' ? mediaRest(v) : schemaRest(v);", 'const rest = schemaRest(v);']) });
  check(!!cm.report.held && /\[Content_Types\]\.xml (?:Default|Override)@ContentType/.test(cm.held), 'CONTROL: with a media type read whole, the file holds on it', said(cm));
  // a media type under Office's own prefix is read past the format's words
  const vendor = await docx({ parts: [{ ...unk('<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:id="1"/></acme:root>'), type: 'application/vnd.openxmlformats-officedocument.kestrelNotes+xml' }] });
  const rv = await write(vendor);
  check(!!rv.report.held && /\[Content_Types\]\.xml Override@ContentType/.test(rv.held), 'a media type "…officedocument.kestrelNotes+xml" holds the file', said(rv));
  const cv = await write(vendor, { W: await mutated(["  return /[\\p{L}\\p{N}]/u.test(rest) ? rest : '';\n}\n/** What of a value on the format's own hosts", "  return '';\n}\n/** What of a value on the format's own hosts"]) });
  check(!cv.report.held, 'CONTROL: with every media type under Office\'s prefix taken as Office\'s own, it ships', said(cv));
  // after a host the format's own addresses use, a name no one put in the table: taken whole as
  // an address, it was kept under a note that said the part held only code words (D13R-1)
  const after = (v) => docx({ parts: [unk(`<acme:root xmlns:acme="urn:acme-addin"><acme:src acme:href="${v}"/></acme:root>`)] });
  const ra = await write(await after('http://purl.org/matters/Jonas Whitfield'));
  const rk = await write(await after('http://purl.org/dc/elements/1.1/'));
  check(!!ra.report.held && /^word\/unheardOf\.xml, a part of the file this app does not know, holds text/.test(ra.held) && shipsClean(rk) && rk.names.includes('word/unheardOf.xml'),
    'a name no one reviewed after purl.org holds the part as text someone typed; an address with only code words after the host is kept', `${said(ra)} · ${said(rk)}`);
  const cd = await write(await after('http://purl.org/matters/Jonas Whitfield'), { W: await mutated(['    if (!WORDY.test(v)) return false;\n', '    if (!WORDY.test(v) || SCHEMA.test(v)) return false;\n']) });
  check(!cd.report.held && /Jonas Whitfield/.test(cd.raw['word/unheardOf.xml'] || ''), 'CONTROL: with an address on those hosts taken whole, the name ships', said(cd));
  const cs = await write(await docx({ parts: [unk(PLACES['an address on Office\'s own host'])] }), { W: await mutated(['  if (KNOWN_NS.has(v)) return \'\';', '  return \'\';']) });
  check(!cs.report.held, 'CONTROL: with any address on Office\'s host taken as Office\'s own, the one ending "KestrelCapital" ships', said(cs));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 50: a processing instruction is kept only as Office\'s own marker, whole, and a kept picture carries none —');
{
  // "mso-" and any letters kept <?mso-KestrelHoldings?> (INT-23, W6-3); a kept SVG's
  // <?xml-stylesheet href="…"?> held the file as "a fault in the app" with nothing wrong in it (W6-5).
  const pkg = await docx({ header: '<?mso-KestrelHoldings?><?mso-contentType?>' + para('Header') });
  const r = await write(pkg);
  const PI = /<\?(?!xml )[^?]*\?>/g;
  check(shipsClean(r) && ((r.raw['word/header1.xml'] || '').match(PI) || []).join(' ') === '<?mso-contentType?>', 'a marker that is not Office\'s own, whole, is removed; <?mso-contentType?> stays', `${said(r)} · ${((r.raw['word/header1.xml'] || '').match(PI) || []).join(' ')}`);
  const LOOSE = ['const MSO_MARKER = /^\\?mso-contentType$/;', 'const MSO_MARKER = /^\\?mso-[A-Za-z]+$/;'];
  const c1 = await write(pkg, { W: await mutated(LOOSE) });
  check(!!c1.report.held && /mso-kestrelholdings/i.test(c1.held), 'CONTROL: matched as "mso-" and letters, it is kept, and the gate reads its name and holds', said(c1));
  const c2 = await write(pkg, { W: await mutated(LOOSE, ["        else want(`${part} a processing instruction's name`, tag.slice(1), 'machine');", '']) });
  check(!c2.report.held && /<\?mso-KestrelHoldings\?>/.test(c2.raw['word/header1.xml'] || ''), 'CONTROL: and with a kept one\'s name not read, it ships', said(c2));

  const svg = '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/css" href="kestrel-house.css"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><!-- <?not-an-instruction?> --><rect width="10" height="10"/></svg>';
  const pic = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="7" name="Picture 7"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Picture 7"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdSvg"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const sp = await docx({ body: pic, defaults: [['svg', 'image/svg+xml']], parts: [{ name: 'word/media/image1.svg', data: enc(svg), rel: ['image', 'media/image1.svg', 'rIdSvg'] }] });
  const rs = await write(sp, { keepImages: true });
  const out = rs.raw['word/media/image1.svg'] || '';
  // A comment goes too, whole, and is counted as a note of its own: the parser hands the gate no
  // comment, so one kept as it was shipped whatever it said unread (W5R-9, law 52); an
  // instruction inside it is not counted as one.
  check(shipsClean(rs) && out.startsWith('<?xml version="1.0"') && !/xml-stylesheet/.test(out) && !/<!--/.test(out)
    && rs.report.notes.some((n) => /^A processing instruction \(a note a program leaves/.test(n)) && rs.report.notes.some((n) => /^A note in the code of a picture drawn as code \(an SVG\)/.test(n)),
    'a kept SVG is copied without its stylesheet instruction or its comment, its declaration as it was, and the receipt counts each', `${said(rs)} · ${out.slice(0, 120)} · ${JSON.stringify(rs.report.notes)}`);
  const cv = await write(sp, { keepImages: true, W: await mutated(['    if (isXml(n, types)) {\n      const xml = td.decode(data);', '    if (false) {\n      const xml = td.decode(data);']) });
  check(!!cv.report.held && /a processing instruction is still present/.test(cv.held), 'CONTROL: copied byte for byte, the gate holds on it', said(cv));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 51: the note on a kept part the writer does not know says what the check reads, and no more —');
{
  // The receipt prints the note word for word (P1, INT-6): "the check of the copy read all of it"
  // was false while element names, namespace declarations and compatibility lists went unread,
  // and a name run together in a code word was not looked for. It now says what is read and the
  // floor below which a name inside a word is not found.
  const pkg = await docx({ parts: [{ name: 'word/unheardOf.xml', xml: '<acme:notes xmlns:acme="urn:acme:notes"><acme:n acme:lang="en-US">3</acme:n></acme:notes>', type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] }] });
  const READ_ALL = /read all of it|read every|read the whole|read it all/i;
  const note = (x) => x.report.notes.find((n) => n.startsWith('word/unheardOf.xml ')) ?? '';
  const r = await write(pkg);
  const n = note(r);
  // The breaks it names are compactOf's, every one: "at an upper-case letter" said a break stood
  // at each capital, and a word all in capitals has none (P13-INT6, 2026-09-24).
  const BREAKS = 'In each of these it finds a name of your table of two characters or more with a letter in it, or of six digits or more, run together with other characters where the word breaks at both ends of the name — at a space, a punctuation mark or another symbol, where letters meet digits, where a capital follows a small letter, either side of the last of a run of capitals that a small letter follows (as "XYZReport" breaks after "XYZ"; "ISPs" breaks only before its s), and either side of a Chinese, Japanese or Korean character; a word all in capitals or all in small letters has no break inside it — and anywhere inside a word from 6 letters and digits, so a shorter name inside a word is not found; a name of two to five digits alone is found only where it is the whole of a value.';
  check(shipsClean(r) && !!n && !READ_ALL.test(n) && /the names of its elements and attributes but XML's own, the namespaces it declares or lists but those Office's file formats define, and its own name, for the names your table masks and for what the safety net masks\./.test(n) && /what the safety net masks/.test(n) && n.endsWith(BREAKS) && /, so it was kept as it was\. The check/.test(n),
    'the note says what the check reads, the breaks it finds a name at, and the floor for a name inside a word', n);
  const c = await write(pkg, { W: await mutated(['so it was kept${kept}.${removed} The check of the copy read its text', 'so it was kept${kept}; the check of the copy read all of it. The check of the copy read its text']) });
  check(READ_ALL.test(note(c)), 'CONTROL: the sentence as it was trips the check above', note(c));
  // The parser hands the builder no comment and no document type declaration, so both went from a
  // kept part while the note said it was kept "as it was" (SEAM-UNKNOWN-PART-COMMENT, 2026-09-24).
  const commented = await docx({ parts: [{ name: 'word/unheardOf.xml', xml: '<!-- drawn for Margaret Tan --><acme:notes xmlns:acme="urn:acme:notes"><acme:n acme:lang="en-US">3</acme:n></acme:notes>', type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] }] });
  const rc = await write(commented);
  const nc = note(rc);
  check(shipsClean(rc) && !/<!--/.test(rc.raw['word/unheardOf.xml'] || '') && /, so it was kept, every value in it as it was\. A note in its code — a comment, or a document type declaration — which no one sees, was removed\. The check/.test(nc) && !/kept as it was/.test(nc),
    'a kept part whose comment went is not said to be kept "as it was": the note says every value is, and that a note in its code was removed', nc);
  const ccm = await write(commented, { W: await mutated(["const notes = (xml.match(CODE_TOKEN) ?? []).filter((t) => t.startsWith('<!--') || /^<!DOCTYPE/i.test(t)).length;", 'const notes = 0;']) });
  check(/, so it was kept as it was\. The check/.test(note(ccm)) && !/<!--/.test(ccm.raw['word/unheardOf.xml'] || ''), 'CONTROL: with the part\'s comments not counted, the note says "as it was" of a part whose comment went', note(ccm));
  // a document type declaration alone goes too, and is said to (W-FID-TEST-SURVIVORS)
  const typed = await docx({ parts: [{ name: 'word/unheardOf.xml', xml: '<!DOCTYPE acme:notes><acme:notes xmlns:acme="urn:acme:notes"><acme:n acme:lang="en-US">3</acme:n></acme:notes>', type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] }] });
  const rd = await write(typed);
  check(shipsClean(rd) && !/<!DOCTYPE/i.test(rd.raw['word/unheardOf.xml'] || '') && /A note in its code — a comment, or a document type declaration — which no one sees, was removed\./.test(note(rd)) && !/kept as it was/.test(note(rd)),
    'a kept part whose document type declaration went says a note in its code was removed', note(rd));
  const cd = await write(typed, { W: await mutated(["t.startsWith('<!--') || /^<!DOCTYPE/i.test(t)).length;", "t.startsWith('<!--')).length;"]) });
  check(/, so it was kept as it was\. The check/.test(note(cd)), 'CONTROL: with a document type declaration not counted, the note says "as it was"', note(cd));
  // what the note says of a name run together is what the gate does in such a part: "Wong" is
  // found where the word breaks at both its ends, and not inside "wongsuwan", a word of its own
  const WONG = [...ROWS, row('w', 'Wong', '[Person3]', 'PERSON', 'person')];
  const keyed = (v) => docx({ parts: [{ name: 'word/unheardOf.xml', xml: `<acme:notes xmlns:acme="urn:acme:notes"><acme:n acme:k="${v}">3</acme:n></acme:notes>`, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] }] });
  const rb = await write(await keyed('ref4Wong'), { rows: WONG });
  const ri = await write(await keyed('wongsuwan'), { rows: WONG });
  check(!!rb.report.held && !ri.report.held && /acme:k="wongsuwan"/.test(ri.raw['word/unheardOf.xml'] || '') && note(ri) === note(r),
    'in such a part a name under six letters is found where the word breaks at both its ends ("ref4Wong" holds) and not inside a word ("wongsuwan" ships under the same note)', `${said(rb)} · ${said(ri)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 52: an XML declaration carries its version, encoding and standalone, and a kept SVG no note the gate cannot read —');
{
  // The parser takes whatever stands in <?xml …?> as attributes and the builder wrote them back,
  // so client="Margaret Tan" on a part's first line shipped under a gate that stepped over the
  // declaration (W5R-3, 2026-09-23). A kept SVG was copied with its comments, its document type
  // declaration and its declaration as written, none of which the parser hands the gate (W5R-9).
  const DX = '<?xml version="1.0" encoding="UTF-8" standalone="yes" client="Margaret Tan" matter="Kestrel"?>';
  const hdr = { name: 'word/header2.xml', data: enc(`${DX}<w:hdr ${NS}>${para('Draft')}</w:hdr>`), type: CT.header, rel: ['header', 'header2.xml', 'rIdH2'] };
  const odd = { name: 'word/unheardOf.xml', data: enc(`${DX}<acme:note xmlns:acme="urn:acme:notes" acme:n="3"/>`), type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] };
  const pkg = await docx({ parts: [hdr, odd] });
  const first = (x, n) => ((x.raw[n] || '').match(/^<\?xml[^?]*\?>/) || [''])[0];
  const r = await write(pkg);
  check(shipsClean(r) && first(r, 'word/header2.xml') === decl && first(r, 'word/unheardOf.xml') === decl
    && r.report.notes.some((n) => /^The first line of 2 parts \(the XML declaration, which says only which version of XML and which encoding the part uses\) carried more than that, which was removed\.$/.test(n)),
  'a declaration keeps its version, encoding and standalone, what else it carried is removed from a header and from a part the writer does not know, and the receipt says so', `${said(r)} · ${first(r, 'word/header2.xml')} · ${JSON.stringify(r.report.notes)}`);
  const STRIP_OFF = ["      if (extra.length) { const a = { ...(n[':@'] as Record<string, string>) };", "      if (false) { const a = { ...(n[':@'] as Record<string, string>) };"];
  const c1 = await write(pkg, { W: await mutated(STRIP_OFF) });
  check(!!c1.report.held && /XML declaration still carries more than its version, encoding and standalone \(client, matter\)/.test(c1.held) && /a fault in the app/.test(c1.held),
    'CONTROL: with the writer keeping it as written, the gate holds on it as the app\'s own fault', said(c1));
  const c2 = await write(pkg, { W: await mutated(STRIP_OFF, ["else if (tag === '?xml') { if (declExtra(node).length)", "else if (tag === '?xml') { if (false)"]) });
  check(!c2.report.held && /client="Margaret Tan"/.test(c2.raw['word/header2.xml'] || ''), 'CONTROL: and with the gate stepping over the declaration, the name ships on the header\'s first line', said(c2));

  // a kept SVG (keepImages): its comment, its empty document type and its declaration's extras go
  const pic = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="8" name="Picture 8"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Picture 8"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdSvg"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const svgPkg = (svg) => docx({ body: pic, defaults: [['svg', 'image/svg+xml']], parts: [{ name: 'word/media/image1.svg', data: enc(svg), rel: ['image', 'media/image1.svg', 'rIdSvg'] }] });
  const noted = await svgPkg('<?xml version="1.0" encoding="UTF-8" author="Margaret Tan"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><!-- drawn for Margaret Tan, Kestrel matter --><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  const svgOf = (x) => x.raw['word/media/image1.svg'] || '';
  const rs = await write(noted, { keepImages: true });
  check(shipsClean(rs) && svgOf(rs) === '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
    && rs.report.notes.some((n) => /^2 notes in the code of a picture drawn as code \(an SVG\)/.test(n)) && rs.report.notes.some((n) => /^The first line of a part \(the XML declaration/.test(n)),
  'a kept SVG ships without its comment, its document type declaration or its declaration\'s extras, and the receipt counts each', `${said(rs)} · ${svgOf(rs).slice(0, 160)} · ${JSON.stringify(rs.report.notes)}`);
  const KEEP_NOTES = ["        if (pi === undefined) { shared.comments = (shared.comments ?? 0) + 1; return ''; }", '        if (pi === undefined) return m;'];
  const cs = await write(noted, { keepImages: true, W: await mutated(KEEP_NOTES) });
  check(!!cs.report.held && /word\/media\/image1\.svg: a comment or a document type declaration is still present/.test(cs.held), 'CONTROL: with its comment and document type copied as they were, the gate holds on them', said(cs));
  const cs2 = await write(noted, { keepImages: true, W: await mutated(KEEP_NOTES, ['    if (/<!--|<!DOCTYPE/i.test(', '    if (false && /<!--|<!DOCTYPE/i.test(']) });
  check(!cs2.report.held && /drawn for Margaret Tan/.test(svgOf(cs2)), 'CONTROL: and with the gate reading only what the parser hands it, the comment ships with the name in it', said(cs2));
  // a document type that declares entities: the picture may use them, and the gate never reads them
  const ent = await svgPkg('<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE svg [<!ENTITY c "Margaret Tan">]><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  const re = await write(ent, { keepImages: true });
  check(!!re.report.held && /^word\/media\/image1\.svg, a picture drawn as code \(an SVG\), declares entities of its own/.test(re.held) && /Save as Picture/.test(re.held), 'a kept SVG that declares entities holds, and the hold says how to replace it', said(re));
  const ce = await write(ent, { keepImages: true, W: await mutated(['      if (/<!DOCTYPE[^>[]*\\[/i.test(', '      if (false && /<!DOCTYPE[^>[]*\\[/i.test('], ['|<!DOCTYPE[^>]*>|<\\?([\\s\\S]*?)\\?>/gi', '|<\\?([\\s\\S]*?)\\?>/gi'], ['    if (/<!--|<!DOCTYPE/i.test(', '    if (false && /<!--|<!DOCTYPE/i.test(']) });
  check(!ce.report.held && /<!ENTITY c "Margaret Tan">/.test(svgOf(ce)), 'CONTROL: kept, the entity ships the name under a gate that never read it', said(ce));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 53: a row is not found as the start of another name —');
{
  // A row's short last word glued to more letters is another word: "Mary Li" in "Mary Little"
  // was masked to "[Person1]ttle", naming a second person as the first and leaving a stub no one
  // can read back (W5R-4, 2026-09-23). The rule is textHolds' now (owner ruling 8), and the
  // measurements behind it stand there.
  const txt = (x) => (x.raw['word/document.xml'] || '').replace(/<[^>]+>/g, '');
  const cases = [
    ['Mary Li', 'Mary Little gave evidence after Mary Li.', /Mary Little gave evidence after \[Person1\]\./],
    ['Margaret Tan', 'Margaret Tanner, not Margaret Tan, signed.', /Margaret Tanner, not \[Person1\], signed\./],
    ['Chris Ho', 'Chris Howard wrote to Chris Ho.', /Chris Howard wrote to \[Person1\]\./],
  ];
  const GLUE_OFF = ["if (how === 'text') ok = ownSeps(at) && textHolds(k, at, len, n, runs);", "if (how === 'text') ok = ownSeps(at) && ((k.cuts.has(at) && k.cuts.has(at + len)) || runs);"];
  const off = await mutated(GLUE_OFF);
  const bad = [], ctl = [];
  for (const [name, text, want] of cases) {
    const rows = [row('p', name, '[Person1]', 'PERSON', 'person')];
    const pkg = await docx({ body: para(text) });
    const r = await write(pkg, { rows, terms: [] });
    if (!(!r.report.held && want.test(txt(r)) && !/\]\p{Ll}/u.test(txt(r)))) bad.push(`${name}: ${said(r)} · ${txt(r)}`);
    const c = await write(pkg, { rows, terms: [], engine: EDGE, W: off });
    if (!/\[Person1\]\p{Ll}/u.test(txt(c))) ctl.push(`${name}: ${said(c)} · ${txt(c)}`);
  }
  check(!bad.length, 'a row is masked where it stands and not as the start of a longer name ("Mary Little", "Margaret Tanner", "Chris Howard")', bad.join(' | '));
  check(!ctl.length, 'CONTROL: with the rule off, the writer masks the start of the longer name and leaves a stub ("[Person1]ttle")', ctl.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 54: an equation runs on into the text and the equation beside it —');
{
  // "Kes" typed as text before an equation "trel", two equations "Kes" and "trel" side by side,
  // and "Kes" + a phantom Word does not show + "trel" each rendered "Kestrel" and shipped under a
  // gate that passed (W5R-7, 2026-09-23). Each runs under EDGE too, so the writer's own reading of
  // the equation is what is checked.
  const r_ = (t) => `<m:r><m:t>${t}</m:t></m:r>`;
  const om = (x) => `<m:oMath>${x}</m:oMath>`;
  const wr = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const doc = (x) => x.raw['word/document.xml'] || '';
  const CASES = {
    'text, then an equation': wr('Kes') + om(r_('trel')),
    'two equations side by side': om(r_('Kes')) + om(r_('trel')),
    'a phantom Word does not show, between': om(r_('Kes') + `<m:phant><m:phantPr><m:show m:val="0"/><m:zeroWid m:val="1"/></m:phantPr><m:e>${r_('zz')}</m:e></m:phant>` + r_('trel')),
  };
  const OFF = {
    'text, then an equation': ["  const line = (m?: Record<string, unknown>) => !m || 'm:oMath' in m;", '  const line = (m?: Record<string, unknown>) => !m;'],
    'two equations side by side': ["  const line = (m?: Record<string, unknown>) => !m || 'm:oMath' in m;", '  const line = (m?: Record<string, unknown>) => !m;'],
    'a phantom Word does not show, between': ["if (i.attr || i.kind === 'field' || i.num || i.unshown) continue;", "if (i.attr || i.kind === 'field' || i.num) continue;"],
  };
  const bad = [], ctl = [];
  for (const [what, inner] of Object.entries(CASES)) {
    const pkg = await docx({ body: `<w:p>${inner}</w:p>` });
    for (const engine of [E, EDGE]) {
      const r = await write(pkg, { engine });
      if (!(shipsClean(r) && !/>(?:Kes|trel)</.test(doc(r)))) bad.push(`${what}${engine === EDGE ? ' (EDGE)' : ''}: ${said(r)}`);
    }
    const c = await write(pkg, { engine: EDGE, W: await mutated(OFF[what]) });
    if (!(!c.report.held && />Kes</.test(doc(c)) && />trel</.test(doc(c)))) ctl.push(`${what}: ${said(c)}`);
  }
  check(!bad.length, `"Kes" and "trel" are masked as the page shows them: ${Object.keys(CASES).join('; ')}`, bad.join(' | '));
  check(!ctl.length, 'CONTROL: with an equation read apart from what stands beside it, or a phantom that does not show read as if it did, each ships', ctl.join(' | '));
  // The other way round was never open: the walker reads an equation's text on into the text
  // after it, so the mask itself places "Kestrel" there, with the writer's zones and its reading
  // of the flow both off (probed 2026-09-23). Kept here so a change to the walker shows.
  const after = await write(await docx({ body: `<w:p>${om(r_('Kes'))}${wr('trel')}</w:p>` }), { engine: EDGE });
  check(shipsClean(after) && !/>(?:Kes|trel)</.test(doc(after)), '"Kes" in an equation, then "trel" as text, is masked by the mask itself', said(after));
  // a space between them on the page is a space: nothing is joined across it
  const spaced = await docx({ body: `<w:p>${wr('Kes ')}${om(r_('trel'))}</w:p>` });
  const rsp = await write(spaced, { engine: EDGE });
  check(!rsp.report.held && />Kes </.test(doc(rsp)) && />trel</.test(doc(rsp)), '"Kes " (a space before the equation) and "trel" are two words and ship as written', said(rsp));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 55: a part the writer does not know is judged by its markup as by its values —');
{
  // The pre-check judged values only, and every attribute spelled mc:… was passed on its spelling
  // whatever its prefix stood for: mc:client="Jonas Whitfield" (mc bound to an add-in's namespace,
  // or to the real one on an attribute that is not a list), <acme:JonasWhitfield/> and an
  // attribute so named were kept under a note that said the part held only code (W-FID-1, W-FID-8).
  // VOCAB's looser shapes passed a path and a language tag made of a name, and between tags a
  // name keyed as one code word (W-FID-2). No one declared the name, so the gate, which reads for
  // the table's names, passed each.
  const unk = (xml) => ({ name: 'word/unheardOf.xml', xml, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] });
  const MCR = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
  const HOLDS = /^word\/unheardOf\.xml, a part of the file this app does not know, holds text/;
  // A name keyed in camelCase in the markup ("jonasWhitfield") is not judged a name: add-ins name
  // their elements so (acme:clientName), and holding it would hold every add-in's part. Stated as
  // a blind spot, and the gate still reads it for the table's names.
  const MC_SKIP = ['      const ck = k.indexOf(\':\');', '      if (SYNTAX_ATTR.test(k)) continue;\n      const ck = k.indexOf(\':\');'];
  const LOOSE = ['const code = (v: string) => (MACHINE.test(v) || vocabWord(v))', 'const code = (v: string) => (MACHINE.test(v) || VOCAB.test(v))'];
  const WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const PRE = [
    ['mc:client, mc bound to an add-in\'s namespace', '<acme:note xmlns:acme="urn:acme:notes" xmlns:mc="urn:acme:meta" mc:client="Jonas Whitfield" acme:id="7"/>', [MC_SKIP]],
    ['mc:client, mc bound to markup compatibility', `<acme:note xmlns:acme="urn:acme:notes" ${MCR} mc:client="Jonas Whitfield" acme:id="7"/>`, [MC_SKIP]],
    ['an element\'s name', '<acme:note xmlns:acme="urn:acme:notes"><acme:JonasWhitfield acme:id="7"/></acme:note>', [['    if (markupTyped(t, here)) return true;\n', '\n']]],
    ['an attribute\'s name', '<acme:note xmlns:acme="urn:acme:notes" acme:JonasWhitfield="1"/>', [['      if (markupTyped(k, here, elemUri)) return true;\n', '\n']]],
    ['a prefix', '<JonasWhitfield:note xmlns:JonasWhitfield="urn:acme:notes"/>', [['    if (markupTyped(t, here)) return true;\n', '\n'], ['if (p && !KNOWN_NS.get(String(a[k]))?.has(p) && !nameCode(p)) return true; continue; }', 'continue; }']]],
    ['a name keyed as one word between tags', '<acme:note xmlns:acme="urn:acme:notes"><acme:client>jonasWhitfield</acme:client></acme:note>', [['!(code(v) && !(between && /^[a-z]+(?:[A-Z][a-z]+)*$/.test(v)))', '!(code(v) && !(between && /^[a-z]+$/.test(v)))']]],
    ['a path made of a name', '<acme:note xmlns:acme="urn:acme:notes" acme:matter="clients/Whitfield.Jonas"/>', [LOOSE]],
    ['a language tag made of a name', '<acme:note xmlns:acme="urn:acme:notes" acme:who="mr-Jonas-Smith"/>', [LOOSE]],
    ['an add-in\'s author', '<acme:note xmlns:acme="urn:acme:notes"><acme:rev acme:author="jsmith" acme:n="3"/></acme:note>', [['      if (v && /(^|:)(author|initials)$/.test(k)) return true;\n', '\n']]],
  ];
  const held = [], shipped = [];
  for (const [what, xml, off] of PRE) {
    const pkg = await docx({ parts: [unk(xml)] });
    const r = await write(pkg);
    if (!(r.report.held && HOLDS.test(r.held) && !/a fault in the app/.test(r.held))) held.push(`${what}: ${said(r)}`);
    const c = await write(pkg, { W: await mutated(...off) });
    if (!(!c.report.held && c.names.includes('word/unheardOf.xml'))) shipped.push(`${what}: ${said(c)}`);
  }
  check(!held.length, `each holds the file as text in the part, with the way through: ${PRE.map((p) => p[0]).join('; ')}`, held.join(' | '));
  check(!shipped.length, 'CONTROL: with each judged as it was, each ships (no row holds the name)', shipped.join(' | '));
  // what Word and its add-ins write is still kept: a code word, a language tag, a media type,
  // Word's own names and markup compatibility's
  const kept = await docx({ parts: [unk(`<acme:note xmlns:acme="urn:acme:notes" ${MCR} xmlns:w="${WNS}" mc:Ignorable="acme" mc:ProcessContent="w:sdt" acme:lang="zh-Hant-TW" acme:type="image/png" acme:kind="draftNote" acme:ref_id="a7" w:rsidR="00A1B2C3"><acme:when>2026-09-01</acme:when><mc:AlternateContent><mc:Choice Requires="acme"><acme:x/></mc:Choice><mc:Fallback><w:sdt/></mc:Fallback></mc:AlternateContent></acme:note>`)] });
  const rk = await write(kept);
  check(shipsClean(rk) && rk.names.includes('word/unheardOf.xml'), 'a part of code words, a language tag with its script and region, a media type, a name with separators, Word\'s own names and markup compatibility\'s is kept', said(rk));

  // In a part Word writes, an add-in's attribute spelled like Word's own is that add-in's value: a
  // name there is text the table masks, not the app's own fault (W5R-5), and mc:client is read
  // as any attribute is, not stepped over as a compatibility list (W-FID-5).
  const IN_BODY = [
    ['acme:author', '<w:p xmlns:acme="urn:acme:meta" acme:author="Margaret Tan"><w:r><w:t>Terms.</w:t></w:r></w:p>', ["if (/(^|:)(author|initials)$/.test(k) && KNOWN_NS.has(nsOf(k, here, elemUri) ?? ''))", 'if (/(^|:)(author|initials)$/.test(k))'], /a fault in the app/],
    ['mc:client', '<w:p xmlns:mc="urn:acme:meta" mc:client="Margaret Tan"><w:r><w:t>Terms.</w:t></w:r></w:p>', ['        if (SYNTAX_ATTR.test(k)) {', '        if (SYNTAX_ATTR.test(k)) { continue;'], null],
  ];
  for (const [what, body, off, ctlHeld] of IN_BODY) {
    const pkg = await docx({ body });
    const r = await write(pkg);
    check(!!r.report.held && /text your table masks is still readable in the body/.test(r.held) && !/a fault in the app/.test(r.held), `${what}="Margaret Tan" on a paragraph holds as text the table masks, with the way through`, said(r));
    const c = await write(pkg, { W: await mutated(off) });
    check(ctlHeld ? !!c.report.held && ctlHeld.test(c.held) : !c.report.held && /Margaret Tan/.test(c.raw['word/document.xml'] || ''),
      ctlHeld ? `CONTROL: with ${what} judged by its local name, the hold calls it the app's own fault` : `CONTROL: with ${what} stepped over as markup compatibility's own, it ships`, said(c));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 56: a part\'s name is read as the package means it, and the names in its code by the safety net —');
{
  // A part name is percent-encoded in the zip ("word/Margaret%20Tan.xml"), and read as written a
  // row "Margaret Tan" was not found in it: the part, and a picture so named, shipped (W5R-1). In
  // a part Word never wrote, a name in Office's namespaces is not Word's vocabulary:
  // <w:KestrelCapital/> there shipped (W5R-2). A number glued to letters in a name is not read as
  // written ("x2125550147"), and one in an element's name, a compatibility list or a part's name
  // shipped (W5R-6, 2026-09-23).
  const unkAt = (name, xml) => ({ name, xml, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', name.replace(/^word\//, '')] });
  const pctPkg = await docx({ parts: [unkAt('word/Margaret%20Tan.xml', '<acme:root xmlns:acme="urn:acme"/>')] });
  const rp = await write(pctPkg);
  check(!!rp.report.held && /the name of a part inside the file/.test(rp.held) && /Margaret Tan/.test(rp.held), 'a part named "Margaret%20Tan.xml" holds the file on the row it names', said(rp));
  // the list of parts and the links name it as the zip does, and are read as the package means them
  const DEC_OFF = ['    const decoded = pctDecoded(n);\n', '    const decoded = n;\n'];
  const ATTR_DEC_OFF = ['        if (/%[0-9A-Fa-f]{2}/.test(v)) {', '        if (false) {'];
  // refFind reads an escape as the character it writes itself (owner ruling 10), and the mask
  // with it, so each reading above is seen to matter only with that one off too, under EDGE
  const REF_PCT_OFF = ["const runs = f.includes('%') ? pctRuns(f) : [];", 'const runs = [] as ReturnType<typeof pctRuns>;'];
  const cp1 = await write(pctPkg, { engine: EDGE, W: await mutated(DEC_OFF, REF_PCT_OFF) });
  check(!!cp1.report.held && !/the name of a part inside the file/.test(cp1.held) && /the file's list of parts/.test(cp1.held), 'with the part\'s own name read as written, the list of parts and the links that name it still hold the file', said(cp1));
  const cp = await write(pctPkg, { engine: EDGE, W: await mutated(DEC_OFF, ATTR_DEC_OFF, REF_PCT_OFF) });
  check(!cp.report.held && cp.names.includes('word/Margaret%20Tan.xml'), 'CONTROL: with those read as written too, it ships', said(cp));
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const drawing = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="9" name="Picture 9"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Picture 9"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const picPkg = await docx({ body: drawing, defaults: [['png', 'image/png']], parts: [{ name: 'word/media/Margaret%20Tan%20signature.png', data: png, rel: ['image', 'media/Margaret%20Tan%20signature.png', 'rIdImg'] }] });
  const ri = await write(picPkg, { keepImages: true });
  check(!!ri.report.held && /Margaret Tan/.test(ri.held), 'a kept picture named "Margaret%20Tan%20signature.png" holds the file', said(ri));
  const ci = await write(picPkg, { keepImages: true, engine: EDGE, W: await mutated(DEC_OFF, ATTR_DEC_OFF, REF_PCT_OFF) });
  check(!ci.report.held && ci.names.includes('word/media/Margaret%20Tan%20signature.png'), 'CONTROL: read as written, the picture and its relationship ship under that name', said(ci));

  const unk = (xml) => unkAt('word/unheardOf.xml', xml);
  const own = await docx({ parts: [unk('<acme:root xmlns:acme="urn:acme" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:KestrelCapital/></acme:root>')] });
  // the writer's own check of the part leaves a name under Office's namespaces to the gate (a
  // blind spot stated on the receipt for a name no one reviewed): the gate reads it for the table's
  const ro = await write(own);
  check(!!ro.report.held && /The file's own code carries it/.test(ro.held) && /KestrelCapital/.test(ro.held), 'a name in Office\'s namespace in a part Word never wrote holds the file', said(ro));
  const co = await write(own, { W: await mutated(['if (net) readName(label, q.slice(c + 1), net);', '']) });
  check(!co.report.held && /<w:KestrelCapital\/>/.test(co.raw['word/unheardOf.xml'] || ''), 'CONTROL: with Office\'s names taken as Word\'s there too, it ships', said(co));

  const NET = [
    ['an element\'s name', unk('<acme:root xmlns:acme="urn:acme"><acme:x2125550147/></acme:root>')],
    ['an attribute\'s name', unk('<acme:root xmlns:acme="urn:acme" acme:ssn123-45-6789="1"/>')],
    ['a compatibility list', unk('<acme:root xmlns:acme="urn:acme" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="acme2125550147"/>')],
    ['a part\'s name', unkAt('word/tel2125550147.xml', '<acme:root xmlns:acme="urn:acme"/>')],
  ];
  const PRE_NET_OFF = [['  const name = (q: string) => { if (/\\d/.test(q))', '  const name = (q: string) => { if (false)'], ['readAll(opts.mask, [...numbers(tree), ...(/\\d/.test(own) ? [fold(netName(own))] : [])])', 'readAll(opts.mask, numbers(tree))']];
  const GATE_NET_OFF = [['    if (net && /\\d/.test(v)) want(label, netName(v), \'name\', true);', ''], ["if (/\\d/.test(decoded)) want(`the part name ${n}`, netName(decoded), 'name', true);", '']];
  const bad = [], gate = [], ctl = [];
  for (const [what, part] of NET) {
    const pkg = await docx({ parts: [part] });
    const r = await write(pkg);
    if (!(r.report.held && /holds a number the safety net masks/.test(r.held))) bad.push(`${what}: ${said(r)}`);
    const g = await write(pkg, { W: await mutated(...PRE_NET_OFF) });
    if (!(g.report.held && /\[(?:phone|ssn)\]|still readable/.test(g.held))) gate.push(`${what}: ${said(g)}`);
    const c = await write(pkg, { W: await mutated(...PRE_NET_OFF, ...GATE_NET_OFF) });
    if (c.report.held) ctl.push(`${what}: ${said(c)}`);
  }
  check(!bad.length, `a telephone or identity number glued to letters holds the part before anything is written: ${NET.map((x) => x[0]).join('; ')}`, bad.join(' | '));
  check(!gate.length, 'with the writer\'s check of the part off, the gate holds on each', gate.join(' | '));
  check(!ctl.length, 'CONTROL: and with names read by the safety net only as written, each ships', ctl.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 57: Word\'s own words in a theme and a style are not a row, and the receipt names what the copy has —');
{
  // A theme lists thirty-odd scripts by their four-letter codes, and read as names a row "Hans"
  // (a given name) or "Thai" held every file with a theme, with nothing in Word to change
  // (W-FID-4, 2026-09-23). A style of Word's own renamed for its id alone keeps its name, and a
  // note that said it was renamed "Redacted style 1" named a style the copy does not have (W-FID-6).
  const theme = '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Hans" typeface="DengXian Light"/><a:font script="Thai" typeface="Angsana New"/><a:font script="Arab" typeface="Times New Roman"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Hans" typeface="DengXian"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>';
  const pkg = await docx({ parts: [{ name: 'word/theme/theme1.xml', xml: theme, type: CT.theme, rel: ['theme', 'theme/theme1.xml'] }] });
  const HANS = [...ROWS, row('h', 'Hans', '[Person2]', 'PERSON', 'person'), row('t', 'Thai', '[Person3]', 'PERSON', 'person')];
  const r = await write(pkg, { rows: HANS });
  check(shipsClean(r) && /<a:font script="Hans"/.test(r.raw['word/theme/theme1.xml'] || '') && /<a:font script="Thai"/.test(r.raw['word/theme/theme1.xml'] || ''), 'a theme\'s script codes ship as Word wrote them under rows "Hans" and "Thai"', said(r));
  const c = await write(pkg, { rows: HANS, W: await mutated(["script || MACHINE.test(t) || VOCAB.test(t) ? 'machine' : 'name'", "MACHINE.test(t) || VOCAB.test(t) ? 'machine' : 'name'"]) });
  check(!!c.report.held && /a:font@script/.test(c.held), 'CONTROL: read as names, they hold the file', said(c));

  const styles = `<w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="KestrelMacro"><w:name w:val="macro"/><w:basedOn w:val="Normal"/></w:style></w:styles>`;
  const sp = await docx({ body: '<w:p><w:pPr><w:pStyle w:val="KestrelMacro"/></w:pPr><w:r><w:t>Body</w:t></w:r></w:p>', parts: [{ name: 'word/styles.xml', xml: styles, type: CT.styles, rel: ['styles', 'styles.xml'] }] });
  const rs = await write(sp);
  const names = (x) => [...(x.raw['word/styles.xml'] || '').matchAll(/<w:name w:val="([^"]*)"\/>/g)].map((m) => m[1]);
  check(shipsClean(rs) && names(rs).join() === 'Normal,macro' && /w:styleId="RedactedStyle1"/.test(rs.raw['word/styles.xml'] || '')
    && rs.report.notes.some((n) => /^A style of Word's own whose id \(the name the file's code gives it, which Word does not show\) carried something masked was given a new id; its name is Word's and unchanged/.test(n))
    && !rs.report.notes.some((n) => /Redacted style/.test(n)),
  'a built-in style renamed for its id alone keeps its name, and the receipt says its id changed and names no style the copy lacks', `${said(rs)} · ${names(rs).join(', ')} · ${JSON.stringify(rs.report.notes)}`);
  const cs = await write(sp, { W: await mutated(['const given = [...shown].sort((a, b) => a[0] - b[0]).map(([, g]) => g);', 'const given = [...defined].sort((a, b) => a - b).map((d) => `Redacted style ${d}`);']) });
  check(cs.report.notes.some((n) => /renamed "Redacted style 1"/.test(n)) && !names(cs).includes('Redacted style 1'), 'CONTROL: counted by id, the note names "Redacted style 1", which the copy does not have', JSON.stringify(cs.report.notes));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 58: in text a reader sees, a row masks as a word of its own and never inside a plain word —');
{
  // Owner ruling 8 (2026-09-24). A party's name masked inside an ordinary word tells the model
  // something false about who did what ("Mr [Person1], a sup[Person1] of the im[Person1]";
  // "W[Person1] gave evidence after [Person1]": W3-1, W3-4), and one left readable inside a web
  // address or a handle discloses it; where the two conflict the leak rule wins. A row masks as
  // its own word; before s or es; at a small letter meeting a capital ("AcmeHoldings"); with its
  // words run together (ruling 1); and from six characters inside a token that carries a dot, a
  // slash, a backslash, a colon, an @, an underscore or a digit, or that starts with an @ (a
  // handle: "@kestrelholdings"). Never inside a plain word of letters: "kestrelholdings" is such
  // a word, and a reader cannot tell it from "Porterfield" by any of its characters. In markup the round-5 reading stays and the file holds (law 46).
  // Measured over the 99 opinions with TAB's 12,805 names as a table: finds inside a plain word
  // 2,237 → 13; with each opinion's caption parties as its rows, no party's find lost and 29
  // plurals newly masked ("the Bragas", "the Smoaks'").
  const txt = (x) => (x.raw['word/document.xml'] || '').replace(/<w:p\b[^>]*>/g, '\n').replace(/<[^>]+>/g, '').trim().split('\n').slice(1).join('\n');
  const P = (n) => [row('p', n, '[Person1]', 'PERSON', 'person')];
  const O = (n) => [row('o', n, '[Company1]', 'COMPANY', 'org')];
  const NOT = [
    [P('Margaret Tan'), 'Margaret Tang, not Margaret Tan, signed.', 'Margaret Tang, not [Person1], signed.'],
    [P('Ong Wei Ming'), 'Wong Wei Ming gave evidence after Ong Wei Ming.', 'Wong Wei Ming gave evidence after [Person1].'],
    [P('Porter'), 'The court reporter certified it. Mr Porter, a supporter of the importer, testified. Porterfield agreed.', 'The court reporter certified it. Mr [Person1], a supporter of the importer, testified. Porterfield agreed.'],
    [P('Cooper'), 'Ms Cooper did not cooperate; the Cooperative Bank objected.', 'Ms [Person1] did not cooperate; the Cooperative Bank objected.'],
    [P('Porter'), 'THE REPORTER AND MR PORTER.', 'THE REPORTER AND MR [Person1].'],
    [O('Kestrel'), 'Paid to kestrelholdings; Kestrel signed.', 'Paid to kestrelholdings; [Company1] signed.'],
    // an ending only after the name's last word written with its capital, of three letters or
    // more, es only after -s, -x, -z, -ch, -sh; a designator's long form only after a first word
    // (W-FID-ENDING-NOUNS, W-FID-TEST-SURVIVORS)
    [P('Law'), 'Mr Law signed. The laws of Singapore govern.', 'Mr [Person1] signed. The laws of Singapore govern.'],
    [P('Lin'), 'The Lines were cut. Lin signed.', 'The Lines were cut. [Person1] signed.'],
    [P('Lo'), 'Los Angeles; Lo signed.', 'Los Angeles; [Person1] signed.'],
    [O('Co'), 'The company paid Co.', 'The company paid [Company1].'],
  ];
  const MUST = [
    [P('Smith'), 'The Smiths and Smith\'s house; Smith signed.', 'The [Person1]s and [Person1]\'s house; [Person1] signed.'],
    [P('Tan'), 'The Tans came. Tan signed.', 'The [Person1]s came. [Person1] signed.'],
    [P('Jones'), 'The Joneses sued. Jones signed.', 'The [Person1]es sued. [Person1] signed.'],
    [O('Acme'), 'AcmeHoldings paid Acme.', '[Company1]Holdings paid [Company1].'],
    [O('Kestrel'), 'See www.kestrelcorp.com and kestrel_capital; KestrelLLP; Kestrel signed.', 'See www.[Company1]corp.com and [Company1]_capital; [Company1]LLP; [Company1] signed.'],
    [O('Kestrel'), 'Posted by @kestrelholdings; Kestrel signed.', 'Posted by @[Company1]holdings; [Company1] signed.'],
    [P('Porter'), 'Handle porter2024; Porter signed.', 'Handle [Person1]2024; [Person1] signed.'],
    [P('Margaret Tan'), 'MARGARETTAN DRAFT; MargaretTan signed.', '[Person1] DRAFT; [Person1] signed.'],
    // the designator written out is masked with the name (owner ruling 19a). The writer's own
    // reading does; the engine's mask reads the find's short end until engine.ts takes RefFind.long
    // (lane P1), and then the writer's last pass has nothing left to find, so from the mask either
    // is accepted and no other
    [O('Hickson Corp'), 'Hickson Corporation appeals. Hickson Corp answers.', ['[Company1] appeals. [Company1] answers.', '[Company1]oration appeals. [Company1] answers.']],
    [O('Kestrel'), 'Saved at \\\\fileserver\\clients\\kestrelholdings\\brief and urn:kestrelholdings:matter.', 'Saved at \\\\fileserver\\clients\\[Company1]holdings\\brief and urn:[Company1]holdings:matter.'],
  ];
  const bad = [];
  for (const [rows, text, want] of [...NOT, ...MUST]) {
    const pkg = await docx({ body: para(text) });
    for (const engine of [E, EDGE]) {
      const r = await write(pkg, { rows, terms: [], engine });
      const ok = Array.isArray(want) ? (engine === EDGE ? [want[0]] : want) : [want];
      if (r.report.held || !ok.includes(txt(r))) bad.push(`${engine === EDGE ? 'writer' : 'mask'} · "${rows[0].text}": ${said(r)} · ${txt(r)}`);
    }
  }
  check(!bad.length, `by the mask and by the writer's own reading alike, a row is not found in ${NOT.map((x) => `"${x[1].split(/[,.;]/)[0]}"`).join(', ')}, and is in ${MUST.map((x) => `"${x[1].split(/[.;]/)[0]}"`).join(', ')}`, bad.join(' | '));
  // each step of the rule, seen to matter: off, the writer's reading and the gate's (one refFind)
  const one = async (rows, text, off) => txt(await write(await docx({ body: para(text) }), { rows, terms: [], engine: EDGE, W: await mutated(off) }));
  const CTL = [
    ['a find\'s start not required to be a break', P('Ong Wei Ming'), 'Wong Wei Ming gave evidence.', ["if (!k.cuts.has(at) && !(loose && k.np[at])) return false;", ''], /^W\[Person1\] gave/],
    ['a find\'s end not required to be a break', P('Porter'), 'Porterfield agreed.', ['if (k.cuts.has(e) || (loose && k.np[e - 1])) return true;', 'return true;'], /^\[Person1\]field/],
    ['no ending', P('Tan'), 'The Tans came.', ["if (c.charCodeAt(e) === 115 /* s */ && k.cuts.has(e + 1)) return true;", ''], /^The Tans came\.$/],
    ['no token read as other than prose', O('Kestrel'), 'See www.kestrelcorp.com now.', ['if (joined || N(ch)) np = true;', ''], /^See www\.kestrelcorp\.com now\.$/],
    ['a token an @ starts not read as a handle', O('Kestrel'), 'Posted by @kestrelholdings now.', ["if ((seen && JOINER.test(ch)) || (!seen && HANDLE.test(ch))) joined = true;", 'if (seen && JOINER.test(ch)) joined = true;'], /^Posted by @kestrelholdings now\.$/],
    ['no break where a small letter meets a capital', O('Acme'), 'AcmeHoldings paid.', ['((Ll(p) && Lu(ch)) || (L(p) && N(ch))', '((L(p) && N(ch))'], /^AcmeHoldings paid\.$/],
    ['an ending after a word in small letters', P('Law'), 'The laws of Singapore govern.', ['if (/^\\p{L}{3,}$/u.test(tail) && k.cap[at + last]) {', 'if (/^\\p{L}{3,}$/u.test(tail)) {'], /^The \[Person1\]s of Singapore govern\.$/],
    ['es after any name', P('Lin'), 'The Lines were cut.', ['/(?:s|x|z|ch|sh)$/.test(tail)', 'true'], /^The \[Person1\]es were cut\.$/],
    ['an ending after a word of any length', P('Lo'), 'Los Angeles.', ['if (/^\\p{L}{3,}$/u.test(tail) && k.cap[at + last]) {', 'if (/^\\p{L}+$/u.test(tail) && k.cap[at + last]) {'], /^\[Person1\]s Angeles\.$/],
    ['a long form after a name\'s only word', O('Co'), 'The company paid.', ['  const long = last > 0 ? LONG_FORM[tail] : undefined;', '  const long = LONG_FORM[tail];'], /^The \[Company1\] paid\.$/],
    ['no backslash or colon joining a token', O('Kestrel'), 'At \\\\fileserver\\clients\\kestrelholdings and urn:kestrelholdings:matter.', ['const JOINER = /[./\\\\:@_#]/;', 'const JOINER = /[./@_#]/;'], /^At \\\\fileserver\\clients\\kestrelholdings and urn:kestrelholdings:matter\.$/],
  ];
  const ctl = [];
  for (const [what, rows, text, off, want] of CTL) { const t = await one(rows, text, off); if (!want.test(t)) ctl.push(`${what}: ${t}`); }
  check(!ctl.length, `CONTROL: ${CTL.map((x) => x[0]).join('; ')} — each changes what is masked`, ctl.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 59: a row of six digits or more is found wherever its digits stand together —');
{
  // Owner ruling 9 (2026-09-24): a client number declared as a row stood inside an IBAN, a wire
  // or DMS reference and a matter number with a prefix or a suffix, and the safety net, which
  // reads a number whole, masked none of them (SEAM-DIGITS-RUN). In text a reader sees it masks,
  // the digits only; in markup it holds. Word's own ids stay read: with the six-digit runs of
  // the 21 real files' own text as rows, none of their ids held a file.
  const id = (d) => [...ROWS, { key: 'd', text: d, tag: '[ID1]', cls: 'ID', cat: 'id', prov: 'engine', occ: 1, status: 'confirmed' }];
  const txt = (x) => (x.raw['word/document.xml'] || '').replace(/<w:p\b[^>]*>/g, '\n').replace(/<[^>]+>/g, '').trim().split('\n').slice(1).join('\n');
  const CASES = [
    ['an IBAN', '31926819', 'Pay GB29NWBK60161331926819 today.', 'Pay GB29NWBK601613[ID1] today.'],
    ['a wire reference', '1234567890', 'Wire ref CHK0001234567890 sent.', 'Wire ref CHK000[ID1] sent.'],
    ['an account, a DMS number and a matter number with a prefix or a suffix', '4417902', 'ACCT44179020001, DMS441790201, M44179021 and 94417902v2.', 'ACCT[ID1]0001, DMS[ID1]01, M[ID1]1 and 9[ID1]v2.'],
    ['a number that differs by a digit (kept)', '4417902', 'ACCT44179030001 only.', 'ACCT44179030001 only.'],
    ['a date beside the number (kept)', '441790', 'Matter 441790 filed 20240315.', 'Matter [ID1] filed 20240315.'],
  ];
  const bad = [], ctl = [];
  const DIGITS_OFF = ['(/\\p{L}/u.test(n.c) || /^\\p{N}+$/u.test(n.c))', '/\\p{L}/u.test(n.c)'];
  const off = await mutated(DIGITS_OFF);
  for (const [what, d, text, want] of CASES) {
    const pkg = await docx({ body: para(text) });
    for (const engine of [E, EDGE]) {
      const r = await write(pkg, { rows: id(d), engine });
      if (r.report.held || txt(r) !== want) bad.push(`${what}${engine === EDGE ? ' (writer)' : ''}: ${said(r)} · ${txt(r)}`);
    }
    if (want.includes('[ID1]') && !/kept/.test(what)) {
      const c = await write(pkg, { rows: id(d), engine: EDGE, W: off });
      if (c.report.held || !txt(c).includes(d)) ctl.push(`${what}: ${said(c)} · ${txt(c)}`);
    }
  }
  check(!bad.length, `a row of digits is masked, its digits only, by the mask and by the writer's own reading alike, in ${CASES.map((x) => x[0]).join('; ')}`, bad.join(' | '));
  check(!ctl.length, 'CONTROL: with a row of digits found only where its number stands whole, each ships readable', ctl.join(' | '));
  // in markup: an add-in's attribute holds on the row's digits, and on a number that is no row
  // it does not
  const attr = (v) => docx({ body: `<w:p xmlns:acme="urn:acme:meta" acme:ref="${v}"><w:r><w:t>Terms.</w:t></w:r></w:p>` });
  const ra = await write(await attr('M44179021'), { rows: id('4417902') });
  const rn = await write(await attr('12345678'), { rows: id('4417902') });
  check(!!ra.report.held && /text your table masks is still readable in the body/.test(ra.held) && /w:p@acme:ref/.test(ra.held) && !rn.report.held,
    'an add-in\'s attribute "M44179021" holds the file on a row "4417902"; one reading "12345678" ships', `${said(ra)} · ${said(rn)}`);
  const ca = await write(await attr('M44179021'), { rows: id('4417902'), engine: EDGE, W: off });
  check(!ca.report.held && /acme:ref="M44179021"/.test(ca.raw['word/document.xml'] || ''), 'CONTROL: with a row of digits found only whole, the attribute ships', said(ca));
  // Its digits written in groups — a space, a dot, a slash or a hyphen between them, as an
  // account or a DMS number is printed — are the row too (W-LEAK-6): "3192-6819" shipped
  // readable in the .docx and the .txt on a row "31926819".
  const GROUPS = [
    ['an account with a hyphen', '31926819', 'Pay into account 3192-6819 by Friday.', 'Pay into account [ID1] by Friday.'],
    ['an account with a space', '31926819', 'Pay into account 3192 6819 by Friday.', 'Pay into account [ID1] by Friday.'],
    ['a DMS number with dots', '441790201', 'Saved as DMS 4417.902.01 in the system.', 'Saved as DMS [ID1] in the system.'],
    ['a reference with a slash', '12345678', 'Ref 12/345678 filed.', 'Ref [ID1] filed.'],
    ['an account with a no-break space', '31926819', 'Pay into account 3192\u00A06819 by Friday.', 'Pay into account [ID1] by Friday.'],
    ['an account with a thin space', '31926819', 'Pay into account 3192\u20096819 by Friday.', 'Pay into account [ID1] by Friday.'],
    ['an account with an en dash', '31926819', 'Pay into account 3192\u20136819 by Friday.', 'Pay into account [ID1] by Friday.'],
    ['a number that differs by a digit (kept)', '31926819', 'Pay into account 3192-6818 by Friday.', 'Pay into account 3192-6818 by Friday.'],
  ];
  const grouped = await mutated(['const grouped = how === \'text\' && /^\\p{N}+$/u.test(n.c);', 'const grouped = false;']);
  const gb = [], gc = [];
  for (const [what, d, text, want] of GROUPS) {
    const pkg = await docx({ body: para(text) });
    for (const engine of [E, EDGE]) {
      const r = await write(pkg, { rows: id(d), engine });
      if (r.report.held || txt(r) !== want) gb.push(`${what}${engine === EDGE ? ' (writer)' : ''}: ${said(r)} · ${txt(r)}`);
    }
    if (!/kept/.test(what)) {
      const c = await write(pkg, { rows: id(d), engine: EDGE, W: grouped });
      if (c.report.held || txt(c) !== text) gc.push(`${what}: ${said(c)} · ${txt(c)}`);
    }
  }
  check(!gb.length, `a row of digits written in groups is masked, by the mask and by the writer's own reading: ${GROUPS.map((x) => x[0]).join('; ')}`, gb.join(' | '));
  check(!gc.length, 'CONTROL: with a row\'s digits read only where they stand together, each ships readable', gc.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 60: a percent-escape is read as the character it writes —');
{
  // Owner ruling 10 (2026-09-24). A link pasted from SharePoint writes "Margaret%20Tan", and read
  // as written no row was found in it (W3-2, W3-3). In text the mask covers the escapes as
  // written; in markup the decoded value is read and the file holds. An escape that writes no
  // character ("Ren%E9 Tan", é the Latin-1 way) holds where a name could stand behind it (W3-5).
  const txt = (x) => (x.raw['word/document.xml'] || '').replace(/<w:p\b[^>]*>/g, '\n').replace(/<[^>]+>/g, '').trim().split('\n').slice(1).join('\n');
  const P = (n) => [row('p', n, '[Person1]', 'PERSON', 'person')];
  const TEXT = [
    [ROWS, 'See https://acme.sharepoint.com/sites/Matters/Margaret%20Tan%20Notes.docx now.', 'See https://acme.sharepoint.com/sites/Matters/[Person1]%20Notes.docx now.'],
    [P('O\'Brien'), 'See /docs/O%27Brien-file.pdf now.', 'See /docs/[Person1]-file.pdf now.'],
    [P('René Tan'), 'See /docs/Ren%C3%A9%20Tan.pdf now.', 'See /docs/[Person1].pdf now.'],
  ];
  const PCT_OFF = ["const runs = f.includes('%') ? pctRuns(f) : [];", "const runs = [] as ReturnType<typeof pctRuns>;"];
  const off = await mutated(PCT_OFF);
  const bad = [], ctl = [];
  for (const [rows, text, want] of TEXT) {
    const pkg = await docx({ body: para(text) });
    for (const engine of [E, EDGE]) {
      const r = await write(pkg, { rows, terms: [], engine });
      if (r.report.held || txt(r) !== want) bad.push(`${rows[0].text}${engine === EDGE ? ' (writer)' : ''}: ${said(r)} · ${txt(r)}`);
    }
    const c = await write(pkg, { rows, terms: [], engine: EDGE, W: off });
    if (c.report.held || txt(c) !== text) ctl.push(`${rows[0].text}: ${said(c)} · ${txt(c)}`);
  }
  check(!bad.length, 'in a link a reader sees, a row written with percent-escapes is masked, the escapes that wrote it with it, by the mask and by the writer\'s own reading', bad.join(' | '));
  check(!ctl.length, 'CONTROL: with escapes read as written, each ships readable', ctl.join(' | '));
  // an escape that writes no character, where a name could stand; and one beside no name
  const RENE = P('René Tan');
  const rm = await write(await docx({ body: para('See /docs/Ren%E9%20Tan.pdf now.') }), { rows: RENE, terms: [] });
  const rk = await write(await docx({ body: para('Up 100%E9 now.') }), { rows: RENE, terms: [] });
  check(!!rm.report.held && /writes a letter as a percent-escape \(such as %E9\) that stands for no character/.test(rm.held) && /has a percent-escape that is no character \(%E9\) where "René Tan" could stand/.test(rm.held) && !rk.report.held,
    '"Ren%E9%20Tan" holds the file, and says why; "100%E9" beside no name ships', `${said(rm)} · ${said(rk)}`);
  const cm = await write(await docx({ body: para('See /docs/Ren%E9%20Tan.pdf now.') }), { rows: RENE, terms: [], W: await mutated(['      const hid = at ? null : pctHidden(v, names, how);', '      const hid = null;']) });
  check(!cm.report.held && /Ren%E9%20Tan/.test(txt(cm)), 'CONTROL: with no reading of an escape that is no character, it ships', said(cm));
  // in markup: a namespace, in a part Word writes and in one it does not know; a part's name
  const unk = (xml, name = 'word/unheardOf.xml') => ({ name, xml, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', name.replace(/^word\//, '')] });
  const MARKUP = [
    ['a namespace in the body', await docx({ body: '<w:p xmlns:acme="urn:acme:Margaret%20Tan"><w:r><w:t>Terms.</w:t></w:r></w:p>' }), /The file's own code carries it/],
    ['a namespace in a part the writer does not know', await docx({ parts: [unk('<acme:n xmlns:acme="urn:acme:Margaret%20Tan"/>')] }), /The file's own code carries it/],
    ['a part\'s name with an escape that is no character', await docx({ parts: [unk('<acme:n xmlns:acme="urn:acme:notes"/>', 'word/Margaret%20%E2Tan.xml')] }), /the name of a part inside the file/],
  ];
  const mk = [];
  for (const [what, pkg, want] of MARKUP) { const r = await write(pkg); if (!(r.report.held && want.test(r.held))) mk.push(`${what}: ${said(r)}`); }
  check(!mk.length, `in markup the file holds: ${MARKUP.map((x) => x[0]).join('; ')}`, mk.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 61: a number the safety net masks is read in every add-in\'s attribute, in a part Word writes too —');
{
  // Owner ruling 11 (2026-09-24). In a part the writer knows, an attribute outside the namespaces
  // Office's formats define is an add-in's value, and <w:p acme:tel="…"> shipped a telephone
  // number from the body under a receipt that said numbers were read (P23-3). An attribute with no
  // prefix on a w: element is no one's vocabulary (W3-7, ruling 12). In a part the writer does not
  // know, an all-digit path segment of an address on Office's or purl.org's host is read too
  // (P23-4). Word's own values are not: every file Word saves carries thousands of numbers.
  const body = (attrs) => docx({ body: `<w:p ${attrs}><w:r><w:t>Terms.</w:t></w:r></w:p>` });
  const HOLDS = (where) => new RegExp('^word/document\\.xml holds, in a value an add-in wrote into it \\(the attribute ' + where.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '\\), a number the safety net masks in the text');
  const ATTRS = [
    ['an identity number', 'xmlns:acme="urn:acme:meta" acme:ssn="123-45-6789"', 'w:p@acme:ssn', '123-45-6789', 'us'],
    ['a telephone number', 'xmlns:acme="urn:acme:meta" acme:tel="2125550147"', 'w:p@acme:tel', '2125550147', 'us'],
    ['a card number', 'xmlns:acme="urn:acme:meta" acme:card="4111111111111111"', 'w:p@acme:card', '4111111111111111', 'us'],
    ['a Singapore NRIC', 'xmlns:acme="urn:acme:meta" acme:id="S1234567D"', 'w:p@acme:id', 'S1234567D', 'sg'],
    ['a telephone number in an attribute with no prefix on w:p', 'tel="2125550147"', 'w:p@tel', '2125550147', 'us'],
  ];
  const PRE_OFF = ['    if (at >= 0) return hold(`${n} holds, in a value an add-in wrote into it', '    if (false) return hold(`${n} holds, in a value an add-in wrote into it'];
  const GATE_OFF = ['        const vnet = net || attrNet(k, here, elemUri);', '        const vnet = net;'];
  const pre = await mutated(PRE_OFF), both = await mutated(PRE_OFF, GATE_OFF);
  const bad = [], gate = [], ctl = [];
  for (const [what, attrs, where, num, practice] of ATTRS) {
    const pkg = await body(attrs);
    const r = await write(pkg, { practice });
    if (!(r.report.held && HOLDS(where).test(r.held) && !r.held.includes(num) && /copy the document's text into a new blank document/.test(r.held))) bad.push(`${what}: ${said(r)}`);
    const g = await write(pkg, { practice, W: pre });
    if (!g.report.held) gate.push(`${what}: ${said(g)}`);
    const c = await write(pkg, { practice, W: both });
    if (c.report.held || !(c.raw['word/document.xml'] || '').includes(num)) ctl.push(`${what}: ${said(c)}`);
  }
  check(!bad.length, `each holds the file before anything is written, names the attribute and not the number, and says the way through: ${ATTRS.map((x) => x[0]).join('; ')}`, bad.join(' | '));
  check(!gate.length, 'with the writer\'s check off, the gate holds on each', gate.join(' | '));
  check(!ctl.length, 'CONTROL: and with an add-in\'s attribute not read by the safety net, each ships with its number', ctl.join(' | '));
  const bare = await write(await body('tel="2125550147"'), { W: await mutated(['  if (elemUri === WML_MAIN) return undefined;\n', '']) });
  check(!bare.report.held && /tel="2125550147"/.test(bare.raw['word/document.xml'] || ''), 'CONTROL: with an attribute with no prefix taken as Word\'s own on a w: element, the bare telephone number ships', said(bare));
  // Word's own value, the same digits: a paragraph's id
  const own = await body('w14:paraId="2125550147"');
  const ro = await write(own);
  check(!ro.report.held && /w14:paraId="2125550147"/.test(ro.raw['word/document.xml'] || ''), 'a number in Word\'s own attribute (w14:paraId) ships', said(ro));
  const co = await write(own, { W: await mutated(["  return !KNOWN_NS.has(uri);", '  return true;']) });
  check(!!co.report.held, 'CONTROL: with every attribute read by the safety net, Word\'s paragraph id holds the file', said(co));
  // an attribute name with a row in it on a w: element (W3-7)
  const named = await body('MargaretTan="1"');
  const rt = await write(named);
  check(!!rt.report.held && /The file's own code carries it/.test(rt.held) && /MargaretTan/.test(rt.held), 'an attribute with no prefix on w:p named with a row holds the file', said(rt));
  // in a part the writer does not know: an address on Office's or purl.org's host
  const unk = (v) => docx({ parts: [{ name: 'word/unheardOf.xml', xml: `<acme:n xmlns:acme="urn:acme:notes" acme:src="${v}"/>`, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] }] });
  const UNK_HELD = /^word\/unheardOf\.xml, a part of the file this app does not know, holds a number the safety net masks in the text/;
  const ru = await write(await unk('http://purl.org/matters/123456789'));
  const rs = await write(await unk('http://schemas.microsoft.com/office/2125550147/x'));
  const kd = await write(await unk('http://purl.org/dc/elements/1.1/'));
  const km = await write(await unk('http://schemas.microsoft.com/office/2006/metadata/properties'));
  check(!!ru.report.held && UNK_HELD.test(ru.held) && !!rs.report.held && UNK_HELD.test(rs.held) && shipsClean(kd) && shipsClean(km),
    'an identity or a telephone number as a path segment after purl.org or Office\'s host holds; the format\'s own addresses, with their versions and years, are kept', `${said(ru)} · ${said(rs)} · ${said(kd)} · ${said(km)}`);
  const cu = await write(await unk('http://purl.org/matters/123456789'), { W: await mutated(['/^\\d{1,4}$/.test(seg)', '/^\\d+$/.test(seg)']) });
  check(!cu.report.held, 'CONTROL: with every all-digit segment taken as the format\'s own, it ships', said(cu));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 62: a part\'s XML declaration names an encoding the part was read in, or the file holds; the copy says UTF-8 —');
{
  // Any name was allowed as an encoding until 2026-09-24, so encoding="MargaretTan" shipped on a
  // part's first line (W3-6). Every declaration in the 21 real files says UTF-8; this app reads
  // every part as UTF-8, so a part that says it is written another way cannot be said to have
  // been read as written — unless its bytes read the same either way: "UTF-16" over bytes that
  // decoded as UTF-8, and a code page over plain ASCII (W-FID-ENC-ASCII). The copy is UTF-8 and
  // says so: "UTF-16" was kept over UTF-8 bytes (W-FID-ENC-UTF16). A part truly in UTF-16 holds,
  // and says so, where it was called malformed (W-LEAK-8).
  const hdr = (d, body = para('Draft')) => ({ name: 'word/header2.xml', data: enc(`${d}<w:hdr ${NS}>${body}</w:hdr>`), type: CT.header, rel: ['header', 'header2.xml', 'rIdH2'] });
  const odd = (d) => ({ name: 'word/unheardOf.xml', data: enc(`${d}<acme:note xmlns:acme="urn:acme:notes" acme:n="3"/>`), type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] });
  const dx = (e) => `<?xml version="1.0" encoding="${e}" standalone="yes"?>`;
  const rh = await write(await docx({ parts: [hdr(dx('MargaretTan'))] }));
  const ru = await write(await docx({ parts: [odd(dx('Kestrel'))] }));
  check(!!rh.report.held && /^word\/header2\.xml says on its first line \(the XML declaration\) that it is written in the encoding "MargaretTan"/.test(rh.held) && /Open the file in Word and save it again/.test(rh.held)
    && !!ru.report.held && /^word\/unheardOf\.xml says on its first line/.test(ru.held), 'an encoding "MargaretTan" on a header and "Kestrel" on a part the writer does not know hold the file, with the way through', `${said(rh)} · ${said(ru)}`);
  const first = (r, n) => /^<\?xml[^?]*\?>/.exec(r.raw[n] || '')?.[0] ?? '';
  const declNote = (r) => r.report.notes.some((s) => /The first line of a part/.test(s));
  const k16 = await write(await docx({ parts: [hdr(dx('UTF-16'))] }));
  const ka = await write(await docx({ parts: [hdr(dx('US-ASCII'))] }));
  const kl = await write(await docx({ parts: [hdr(dx('ISO-8859-1'))] }));
  const k8 = await write(await docx({ parts: [odd(dx('utf-8'))] }));
  const as8 = [k16, ka, kl].map((r) => first(r, 'word/header2.xml'));
  check([k16, ka, kl, k8].every(shipsClean) && as8.every((d) => /encoding="UTF-8"/.test(d)) && /encoding="utf-8"/.test(first(k8, 'word/unheardOf.xml')) && ![k16, ka, kl].some(declNote),
    '"UTF-16" over bytes read as UTF-8, and US-ASCII and ISO-8859-1 over plain ASCII, are kept and the copy says UTF-8, with no note of a declaration cut; utf-8 is kept as written', `${[k16, ka, kl, k8].map(said).join(' · ')} · ${as8.join(' ')}`);
  const wa = await write(await docx({ parts: [hdr(dx('windows-1252'), para('Café terms'))] }));
  check(!!wa.report.held && /^word\/header2\.xml says on its first line \(the XML declaration\) that it is written in the encoding "windows-1252", and it holds a character beyond plain ASCII/.test(wa.held) && /Open the file in Word and save it again/.test(wa.held),
    'a code page over a part holding a character beyond ASCII holds, and says so', said(wa));
  const u16 = (s) => { const b = Buffer.from('﻿' + s, 'utf16le'); return new Uint8Array(b.buffer, b.byteOffset, b.length); };
  const wide = await docx({ parts: [{ ...hdr(''), data: u16(`${dx('UTF-16')}<w:hdr ${NS}>${para('Margaret Tan, draft')}</w:hdr>`) }] });
  const rw = await write(wide);
  const xw = await D.extractDocx(wide);
  check(!!rw.report.held && /^word\/header2\.xml is written in UTF-16, which Word reads and this app does not/.test(rw.held) && /Word writes every part in UTF-8/.test(rw.held) && !/malformed/i.test(rw.held)
    && xw.warnings.includes('Written in UTF-16, which Word reads and this app does not — part refused, not read: word/header2.xml') && !xw.complete,
    'a header written in UTF-16 holds, says so and the way through, and the reading lists it as refused for that reason', `${said(rw)} · ${JSON.stringify(xw.warnings)}`);
  const c = await write(await docx({ parts: [hdr(dx('MargaretTan'))] }), { W: await mutated(['    if (e !== null) return encodingHeld(n, e);\n', '\n'], ['encoding: /^UTF-8$/i', 'encoding: /^[A-Za-z][\\w.-]*$/']) });
  check(!c.report.held && /encoding="MargaretTan"/.test(c.raw['word/header2.xml'] || ''), 'CONTROL: with any name taken as an encoding, it ships on the header\'s first line', said(c));
  const c16 = await write(await docx({ parts: [hdr(dx('UTF-16'))] }), { W: await mutated(["n[':@'] = { ...a0, encoding: 'UTF-8' };", '{}'],['encoding: /^UTF-8$/i', 'encoding: /^UTF-(?:8|16)$/i']) });
  check(!c16.report.held && /encoding="UTF-16"/.test(first(c16, 'word/header2.xml')), 'CONTROL: with the declaration written as it came, the copy says UTF-16 over UTF-8 bytes', `${said(c16)} · ${first(c16, 'word/header2.xml')}`);
  const ca = await write(await docx({ parts: [hdr(dx('US-ASCII'))] }), { W: await mutated(['return ASCII_SAME.test(v) && (bytes', 'return false && (bytes']) });
  check(!!ca.report.held && /the encoding "US-ASCII"/.test(ca.held), 'CONTROL: with a code page never read as ASCII, US-ASCII over plain ASCII holds', said(ca));
  const cw = await write(wide, { W: await mutated(['if (utf16Part(u)) return utf16Held(n);', '']) });
  const xc = await (await bundle(join(SRC, 'extract', 'docx.ts'), [['        if (utf16Part(data)) wide.add(name);\n', '', 'docx.ts']])).extractDocx(wide);
  check(/^malformed XML part, not written: word\/header2\.xml$/.test(cw.held) && xc.warnings.includes('Malformed XML — part refused, not read: word/header2.xml'), 'CONTROL: with UTF-16 not told apart, the hold and the reading call the header malformed', `${said(cw)} · ${JSON.stringify(xc.warnings)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 63: between an unknown part\'s tags, a plain word after an Office host is read as typed text —');
{
  // Owner ruling 12 (2026-09-24): "http://purl.org/matters/marsh" between tags was kept where
  // "…/Marsh" held, and the receipt had to say so (R-between). Measured before it landed: no part
  // of the 21 real files is held by it. In an attribute a plain lower-case word stays a code word.
  const unk = (xml) => docx({ parts: [{ name: 'word/unheardOf.xml', xml: `<acme:n xmlns:acme="urn:acme:notes">${xml}</acme:n>`, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'unheardOf.xml'] }] });
  const HOLDS = /^word\/unheardOf\.xml, a part of the file this app does not know, holds text/;
  const between = await unk('<acme:src>http://purl.org/matters/marsh</acme:src>');
  const rb = await write(between);
  const ra = await write(await unk('<acme:src acme:href="http://purl.org/matters/marsh"/>'));
  const rd = await write(await unk('<acme:src>http://purl.org/dc/elements/1.1/</acme:src>'));
  check(!!rb.report.held && HOLDS.test(rb.held) && shipsClean(ra) && shipsClean(rd), '"http://purl.org/matters/marsh" between tags holds as typed text; in an attribute, and an address of the format\'s own between tags, are kept', `${said(rb)} · ${said(ra)} · ${said(rd)}`);
  const c = await write(between, { W: await mutated(['typedValue(seg, undefined, between)', 'typedValue(seg, undefined, false)']) });
  check(!c.report.held && /matters\/marsh/.test(c.raw['word/unheardOf.xml'] || ''), 'CONTROL: judged as an attribute\'s value is, it is kept', said(c));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 64: an escape escaped again, a %u escape and a character reference are read as the character they write —');
{
  // Owner ruling 10 read one %XX only: "Margaret%2520Tan" (a link escaped twice, as a mail
  // gateway or a copy between systems writes it), "Margaret%u0020Tan" and "Margaret&#32;Tan"
  // shipped readable in the .docx and the .txt (W-LEAK-1, W-LEAK-7), and with those read, the
  // same link as Proofpoint rewrites it ("Margaret-2520Tan", v2; "Margaret*20Tan", v3) still
  // shipped from the body and a header under a plan that said verified. Two escapes that write no
  // character where one name could stand hold together, "H%E9l%E8ne Dupont" (W-LEAK-2), which each
  // alone did not — but only where most of the name is written out.
  const txt = (x) => (x.raw['word/document.xml'] || '').replace(/<w:p\b[^>]*>/g, '\n').replace(/<[^>]+>/g, '').trim().split('\n').slice(1).join('\n');
  const P = (n) => [row('p', n, '[Person1]', 'PERSON', 'person')];
  const TEXT = [
    ['an escape escaped once more', ROWS, 'See /docs/Margaret%2520Tan.pdf now.', 'See /docs/[Person1].pdf now.'],
    ['and twice more', ROWS, 'See /docs/Margaret%252520Tan.pdf now.', 'See /docs/[Person1].pdf now.'],
    ['a %u escape', ROWS, 'See /docs/Margaret%u0020Tan.pdf now.', 'See /docs/[Person1].pdf now.'],
    ['a numeric reference', ROWS, 'See ?n=Margaret&amp;#32;Tan now.', 'See ?n=[Person1] now.'],
    ['a named reference', P('René Tan'), 'See ?n=Ren&amp;eacute;&amp;nbsp;Tan now.', 'See ?n=[Person1] now.'],
    // Proofpoint writes an escape's "%" as "-" (v2) or as a "*" its list says was a "%" (v3)
    ['a Proofpoint v2 link', ROWS, 'See https://urldefense.proofpoint.com/v2/url?u=https-3A__x.example.com_docs_Margaret-2520Tan.pdf now.', 'See https://urldefense.proofpoint.com/v2/url?u=https-3A__x.example.com_docs_[Person1].pdf now.'],
    ['a Proofpoint v3 link', ROWS, 'See https://urldefense.com/v3/__https://x.example.com/docs/Margaret*20Tan.pdf__;JQ!!AbC!xyz$ now.', 'See https://urldefense.com/v3/__https://x.example.com/docs/[Person1].pdf__;JQ!!AbC!xyz$ now.'],
  ];
  const GATEWAY_OFF = [['  const f = viewed ? fold(s) : gatewayWritten(fold(s));', '  const f = fold(s);']];
  const LAYERS_OFF = [['const PCT_RUN = /(?:%(?:25)*(?:', 'const PCT_RUN = /(?:%(?:'], ['const PCT_ONE = /%(?:25)*(?:', 'const PCT_ONE = /%(?:']];
  const REFS_OFF = [["const refs = !runs.length && !f.includes('%') && f.includes('&') ? pctRuns(f) : runs;", 'const refs = runs;']];
  const OFF = {
    'an escape escaped once more': LAYERS_OFF,
    'and twice more': LAYERS_OFF,
    'a %u escape': [['const PCT_RUN = /(?:%(?:25)*(?:[uU][0-9A-Fa-f]{4}|', 'const PCT_RUN = /(?:%(?:25)*(?:']],
    'a numeric reference': REFS_OFF,
    'a named reference': REFS_OFF,
    'a Proofpoint v2 link': GATEWAY_OFF,
    'a Proofpoint v3 link': GATEWAY_OFF,
  };
  const bad = [], ctl = [];
  for (const [what, rows, text, want] of TEXT) {
    const pkg = await docx({ body: para(text) });
    for (const engine of [E, EDGE]) {
      const r = await write(pkg, { rows, terms: [], engine });
      if (r.report.held || txt(r) !== want) bad.push(`${what}${engine === EDGE ? ' (writer)' : ''}: ${said(r)} · ${txt(r)}`);
    }
    const c = await write(pkg, { rows, terms: [], engine: EDGE, W: await mutated(...OFF[what]) });
    if (c.report.held || txt(c) !== text) ctl.push(`${what}: ${said(c)} · ${txt(c)}`);
  }
  check(!bad.length, `in text a reader sees the row is masked with the escapes that wrote it, by the mask and by the writer's own reading: ${TEXT.map((x) => x[0]).join('; ')}`, bad.join(' | '));
  check(!ctl.length, 'CONTROL: with each reading off, each ships readable', ctl.join(' | '));
  // A gateway's writing is read inside its link only, and only as far as the link says: "-20" in
  // a plain path is a hyphen, and a v3 "*" whose list says it stood for a "*" is one
  const KEPT = [
    'See https://x.example.com/docs/Margaret-20Tan.pdf now.',
    'See https://urldefense.com/v3/__https://x.example.com/docs/Margaret*20Tan.pdf__;Kg!!AbC!xyz$ now.',
  ];
  const kept = [];
  for (const text of KEPT) { const r = await write(await docx({ body: para(text) }), { rows: ROWS, terms: [] }); if (r.report.held || txt(r) !== text) kept.push(`${said(r)} · ${txt(r)}`); }
  check(!kept.length, '"-20" outside a gateway\'s link, and a v3 "*" its list says stood for a "*", are read as written and kept', kept.join(' | '));
  const HOST_OFF = await mutated(["const PP_V2 = new RegExp(`${PP_HEAD}${brokenLit('/v2/url?u=')}", 'const PP_V2 = new RegExp(`'], ['  if (!PP_HOST.test(s)) return s;\n', '']);
  const LIST_OFF = await mutated(["      { const c = moved[k++]; if (c !== undefined && c.length === 1 && c !== '*') out[i] = c; }", "      k++; out[i] = '%';"]);
  const kc = [];
  for (const [text, W] of [[KEPT[0], HOST_OFF], [KEPT[1], LIST_OFF]]) { const r = await write(await docx({ body: para(text) }), { rows: ROWS, terms: [], W }); if (!/\[Person1\]/.test(txt(r))) kc.push(`${said(r)} · ${txt(r)}`); }
  check(!kc.length, 'CONTROL: with a hyphen read as "%" outside a gateway\'s link, and with every v3 "*" read as "%", each is masked', kc.join(' | '));
  // hasEscape, the cheap test engine.ts and attest.ts run before pctHidden, says yes to a v3 link
  // carrying a byte that writes no character ("Ren*E9*20Tan", the list "%%"), where the writer
  // holds; a test for a written "%" alone let the .txt ship it under a plan that said verified
  const v3byte = 'See https://urldefense.com/v3/__https://x.example.com/docs/Ren*E9*20Tan.pdf__;JSU!!AbC!xyz$ now.';
  const RENE = [{ name: 'René Tan', ...REAL.refCompact('René Tan') }];
  const noGate = await mutated(['  return s.includes(\'%\') || PP_HOST.test(s);', '  return s.includes(\'%\');']);
  check(REAL.hasEscape(v3byte) && !!REAL.pctHidden(v3byte, RENE, 'text') && !REAL.hasEscape('See Ren Tan now.'),
    'hasEscape says a Proofpoint link can hold an escape, and pctHidden finds the byte in it; plain text without either is passed by', `${REAL.hasEscape(v3byte)} · ${JSON.stringify(REAL.pctHidden(v3byte, RENE, 'text'))}`);
  check(!noGate.hasEscape(v3byte), 'CONTROL: tested for a "%" alone, the link is passed by', String(noGate.hasEscape(v3byte)));
  // two Latin-1 bytes in one name hold; a run of bytes that would stand for most of a name does not
  const HELENE = P('Hélène Dupont');
  const rh = await write(await docx({ body: para('See /docs/H%E9l%E8ne%20Dupont.pdf now.') }), { rows: HELENE, terms: [] });
  const rk = await write(await docx({ body: para(`Ref x${'%FF'.repeat(18)}y Porter signed.`) }), { rows: P('Tan'), terms: [] });
  check(!!rh.report.held && /has a percent-escape that is no character \(%E9\) where "Hélène Dupont" could stand/.test(rh.held) && !rk.report.held,
    '"H%E9l%E8ne Dupont" holds the file; eighteen bytes that write nothing before "Porter" are not read as a row "Tan"', `${said(rh)} · ${said(rk)}`);
  const ch = await write(await docx({ body: para('See /docs/H%E9l%E8ne%20Dupont.pdf now.') }), { rows: HELENE, terms: [], W: await mutated(['  if (bad.length < 2) return null;', '  return null;']) });
  const ck = await write(await docx({ body: para(`Ref x${'%FF'.repeat(18)}y Porter signed.`) }), { rows: P('Tan'), terms: [], W: await mutated(['if (!got.size || C - wild < 2 * wild) continue;', 'if (!got.size) continue;']) });
  check(!ch.report.held && !!ck.report.held, 'CONTROL: with bytes read one at a time "H%E9l%E8ne Dupont" ships, and with a name read through bytes alone the eighteen hold on "Tan"', `${said(ch)} · ${said(ck)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 65: a letter or a digit Word draws from a symbol (w:sym) is read, and the writer holds on it —');
{
  // "Call 212555" + a w:sym drawing "0" + "147" is 2125550147 on the page, and read without it
  // the .txt said "212555147" while the .docx shipped the number whole under a passing check
  // (W-LEAK-4). The walker reads what the symbol draws; nothing masks inside a w:sym, so the
  // writer holds. A symbol font's picture (a Wingdings check box, a Symbol bullet) is kept.
  const run = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const sym = (font, hex) => `<w:r><w:sym w:font="${font}" w:char="${hex}"/></w:r>`;
  const phone = (s) => docx({ body: `<w:p>${run('Call 212555')}${s}${run('147 today.')}</w:p>` });
  const arial = await phone(sym('Arial', '0030'));
  const symDigit = await phone(sym('Symbol', 'F030'));
  const boxes = await docx({ body: `<w:p>${sym('Wingdings', 'F0FE')}${run(' Agreed ')}${sym('Symbol', 'F0B7')}${run(' Signed')}</w:p>` });
  const text = async (pkg, DD = D) => { const x = await DD.extractDocx(pkg); return DD.flowText(x.items.filter((i) => i.part === 'word/document.xml')); };
  const ra = await write(arial), rs = await write(symDigit), rb = await write(boxes);
  const HOLD = /^word\/document\.xml, the body, has the character "0" written as a symbol \(Word's w:sym, in the font "(Arial|Symbol)"\) rather than as typed text/;
  check(!!ra.report.held && HOLD.test(ra.held) && /delete that character and type it again/.test(ra.held) && !!rs.report.held && HOLD.test(rs.held) && shipsClean(rb) && /<w:sym w:font="Wingdings" w:char="F0FE"\/>/.test(rb.raw['word/document.xml'] || ''),
    'a digit drawn from a w:sym in Arial or in Symbol holds the file, and says the way through; a Wingdings check box and a Symbol bullet are kept', `${said(ra)} · ${said(rs)} · ${said(rb)}`);
  const ta = await text(arial), tb = await text(boxes);
  check(/Call 2125550147 today\./.test(ta) && !/[-]/.test(tb), 'the reading has the digit where Word draws it, and nothing for a picture', `${JSON.stringify(ta)} · ${JSON.stringify(tb)}`);
  const cw = await write(arial, { W: await mutated(['if (/[\\p{L}\\p{N}@]/u.test(ch)) return hold(', 'if (false) return hold(']) });
  const DD = await bundle(join(SRC, 'extract', 'docx.ts'), [["const ch = symText(String(attrs['w:font'] ?? ''), String(attrs['w:char'] ?? ''));", "const ch = '';", 'docx.ts']]);
  const tc = await text(arial, DD);
  check(!cw.report.held && /<w:sym w:font="Arial" w:char="0030"\/>/.test(cw.raw['word/document.xml'] || '') && /Call 212555147 today\./.test(tc), 'CONTROL: with the check off the copy ships with the symbol still drawing its digit beside the mask, and with the walker not reading it the text lacks the digit', `${said(cw)} · ${JSON.stringify(tc)}`);
  // A symbol that ends its paragraph, with no run's text after it to carry it: the character
  // waited for a next run, a new paragraph dropped it, and the .txt read "Margaret Ta" under a
  // plan that said verified (the writer held). One ends a paragraph, one ends the part.
  const ends = await docx({ body: `<w:p>${run('Call 212555014')}${sym('Arial', '0037')}</w:p><w:p>${run('Client: Margaret Ta')}${sym('Arial', '006E')}</w:p>` });
  const te = await text(ends), re = await write(ends);
  check(te.endsWith('\nCall 2125550147\nClient: Margaret Tan') &&!!re.report.held && /has the character "7" written as a symbol/.test(re.held), 'a symbol ending a paragraph, and one ending the part, is read into the number and the name it finishes, and the file holds', `${JSON.stringify(te)} · ${said(re)}`);
  const DE = await bundle(join(SRC, 'extract', 'docx.ts'), [['  if (!it || !state.pending.trim()) return;', '  return;', 'docx.ts']]);
  const tf = await text(ends, DE);
  check(tf.endsWith('\nCall 212555014\nClient: Margaret Ta'),'CONTROL: with the walker not reading a symbol out at its paragraph\'s end, the reading loses it', JSON.stringify(tf));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 66: an add-in\'s element text, a name XML closes its attributes to, and an add-in\'s names are read by the safety net —');
{
  // Owner ruling 11. The text of an add-in's own element in the body (W-LEAK-3); xml:tel and
  // xsi:tel, names XML's and XML Schema's short lists do not have (W-LEAK-5); an add-in's
  // namespace address, a prefix its compatibility list names, an add-in element's own name
  // (W-FID-NSDECL-NET): each shipped a telephone number from the body under a passing check. An
  // e-mail address is said to be one (W-FID-ADDIN-EMAIL-MSG). Word's own names and XML's are kept.
  const body = (x) => docx({ body: `<w:p ${x.attrs ?? ''}>${x.inner ?? ''}<w:r><w:t>Terms.</w:t></w:r></w:p>` });
  const HOLDS = (where, what = 'a number the safety net masks in the text') => new RegExp('^word/document\\.xml holds, in a value an add-in wrote into it \\(' + where.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '\\), ' + what);
  // The element's number is one the pattern takes only in part ("+1…"): a value it takes whole is
  // read in any element's text since owner ruling 19f (law 74), with the add-in's reading off too.
  const CASES = [
    ['the text of an add-in\'s element', { inner: '<acme:tel xmlns:acme="urn:acme:meta">+12125550147</acme:tel>' }, HOLDS('the text of the element <acme:tel>')],
    ['xml:tel', { attrs: 'xml:tel="2125550147"' }, HOLDS('the attribute w:p@xml:tel')],
    ['xsi:tel', { attrs: 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:tel="2125550147"' }, HOLDS('the attribute w:p@xsi:tel')],
    ['an e-mail address', { attrs: 'xmlns:acme="urn:acme:dms" acme:owner="jane.doe@firmmail.com"' }, HOLDS('the attribute w:p@acme:owner', 'an e-mail address, which the safety net masks in the text')],
    ['an add-in\'s namespace address', { attrs: 'xmlns:acme="urn:acme:tel:2125550147"' }, /The file's own code carries it/],
    ['a prefix a compatibility list names', { attrs: 'mc:Ignorable="w14 t2125550147"' }, /The file's own code carries it/],
    ['an add-in element\'s name', { inner: '<acme:t2125550147 xmlns:acme="urn:acme"/>' }, /The file's own code carries it/],
  ];
  const OFF = {
    'the text of an add-in\'s element': [["        if (elemNet(t, here)) for (const y of x[t] as XNode[]) if (tagOf(y) === '#text') put(String(y['#text']), `the text of the element <${t}>`);\n", ''], ['net || (!MEDIA_RE.test(part) && elemNet(parent, ns))', 'net']],
    'xml:tel': [['  if (own && !own.has(k.slice(c + 1))) return true;\n', '']],
    'xsi:tel': [['  if (own && !own.has(k.slice(c + 1))) return true;\n', '']],
    'an e-mail address': [["hs.find((x) => x.floor)?.tag === '[email]'", 'false']],
    'an add-in\'s namespace address': [['nsDecl(`${part} a namespace declaration (${tag}@${k})`, k, v, true)', 'nsDecl(`${part} a namespace declaration (${tag}@${k})`, k, v, net)']],
    'a prefix a compatibility list names': [['      readName(label, tok, true);', '      readName(label, tok, net);']],
    'an add-in element\'s name': [['    readName(label, q, true);\n  };', '    readName(label, q, net);\n  };']],
  };
  const bad = [], ctl = [];
  for (const [what, x, want] of CASES) {
    const pkg = await body(x);
    const r = await write(pkg);
    if (!(r.report.held && want.test(r.held) && !/2125550147|jane\.doe/.test(r.held.replace(/What the check found:[\s\S]*$/, '')))) bad.push(`${what}: ${said(r)}`);
    const c = await write(pkg, { W: await mutated(...OFF[what]) });
    if (what === 'an e-mail address' ? !(c.report.held && HOLDS('the attribute w:p@acme:owner').test(c.held)) : c.report.held) ctl.push(`${what}: ${said(c)}`);
  }
  check(!bad.length, `each holds the file and names the place, not the value: ${CASES.map((x) => x[0]).join('; ')}`, bad.join(' | '));
  check(!ctl.length, 'CONTROL: with each reading off, each ships (and the e-mail address is called a number)', ctl.join(' | '));
  // Word's and XML's own: xml:space, xsi:nil, a sketched line's seed (ask) and a prefix Office
  // writes (arto) under a row that spells it
  const own = await body({ attrs: 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true" xmlns:arto="http://schemas.microsoft.com/office/word/2006/arto"', inner: '<ask:lineSketchStyleProps xmlns:ask="http://schemas.microsoft.com/office/drawing/2018/sketchyshapes" sd="1219033472"/>' });
  const ARTO = [...ROWS, row('a', 'Arto', '[Person2]', 'PERSON', 'person')];
  const ro = await write(own, { rows: ARTO });
  check(shipsClean(ro) && /sd="1219033472"/.test(ro.raw['word/document.xml'] || '') && /xmlns:arto=/.test(ro.raw['word/document.xml'] || ''), 'a sketched line\'s seed, xsi:nil and Office\'s arto prefix under a row "Arto" ship', said(ro));
  const cask = await write(own, { rows: ARTO, W: await mutated(["  ['http://schemas.microsoft.com/office/drawing/2018/sketchyshapes', 'ask'],\n", '']) });
  const carto = await write(own, { rows: ARTO, W: await mutated(["  ['http://schemas.microsoft.com/office/word/2006/arto', 'arto'],\n", '']) });
  check(!!cask.report.held && !!carto.report.held, 'CONTROL: with ask or arto not Office\'s, the file holds', `${said(cask)} · ${said(carto)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 67: an escape that is no character is sent to Word only where Word shows it —');
{
  // A part's name and an add-in's attribute are found in Word nowhere, and the hold told the
  // lawyer to find the address and retype it there (W-FID-PCT-WAYOUT).
  const RENE = [row('p', 'René Tan', '[Person1]', 'PERSON', 'person')];
  const RETYPE = /Find the address and retype it with the letter written out/;
  const NEVER = /A value inside the file that Word never shows — the name of a part, or a value in the file's own code — writes a letter as a percent-escape/;
  const unk = (name) => docx({ parts: [{ name, xml: '<acme:n xmlns:acme="urn:acme:notes"/>', type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', name.replace(/^word\//, '')] }] });
  const rt = await write(await docx({ body: para('See /docs/Ren%E9%20Tan.pdf now.') }), { rows: RENE, terms: [] });
  const rp = await write(await unk('word/Ren%E9%20Tan.xml'), { rows: RENE, terms: [] });
  const ra = await write(await docx({ body: '<w:p xmlns:acme="urn:acme:meta" acme:src="/docs/Ren%E9%20Tan.pdf"><w:r><w:t>Terms.</w:t></w:r></w:p>' }), { rows: RENE, terms: [] });
  check(RETYPE.test(rt.held) && !NEVER.test(rt.held) && NEVER.test(rp.held) && !RETYPE.test(rp.held) && NEVER.test(ra.held) && !RETYPE.test(ra.held),
    'in the body the lawyer is told to retype the address; for a part\'s name and an add-in\'s attribute, that Word never shows them', `${said(rt)} · ${said(rp)} · ${said(ra)}`);
  const c = await write(await unk('word/Ren%E9%20Tan.xml'), { rows: RENE, terms: [], W: await mutated(['const onPage = (l: string) => !/^the part name /.test(l) && !/^[^"]*[@<]/.test(l);', 'const onPage = (l: string) => true;']) });
  check(RETYPE.test(c.held), 'CONTROL: with every leak taken as on a page, a part\'s name is sent to be retyped', said(c));
}

// Laws 68–74 are owner rulings 18 and 19 (2026-09-24). Each is read in text a reader sees in the
// four places a lawyer's text stands — the body, a header, a footnote and a text box — by the
// engine's mask (E) and by the writer's own reading under a mask that finds nothing run together
// (EDGE), and each CONTROL takes the one step back in a scratch bundle of the writer.
const R7 = {
  P: (n, tag = '[Person1]') => [row('p', n, tag, 'PERSON', 'person')],
  O: (n, tag = '[Company1]') => [row('o', n, tag, 'COMPANY', 'org')],
  ID: (d) => [{ key: 'd', text: d, tag: '[ID1]', cls: 'ID', cat: 'id', prov: 'engine', occ: 1, status: 'confirmed' }],
  /** the text of a part as a reader sees it, one line a paragraph */
  plain: (x) => (x || '').replace(/<w:p\b[^>]*>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim(),
  PLACES: [
    ['the body', (t) => ({ body: para(t) }), 'word/document.xml'],
    ['a header', (t) => ({ header: para(t) }), 'word/header1.xml'],
    ['a footnote', (t) => ({ parts: [{ name: 'word/footnotes.xml', xml: `<w:footnotes ${NS}><w:footnote w:id="1">${para(t)}</w:footnote></w:footnotes>`, type: `${WML}.footnotes+xml`, rel: ['footnotes', 'footnotes.xml'] }] }), 'word/footnotes.xml'],
    ['a text box', (t) => ({ body: `<w:p><w:r><w:pict><v:shape style="width:200pt;height:40pt"><v:textbox><w:txbxContent>${para(t)}</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>` }), 'word/document.xml'],
  ],
  /** each case in each place, by each engine: the place's text holds `want` (one of them, where
   *  an array's later entries are what the engine's mask may leave), and `gone` is nowhere */
  async run(cases, engines = [E, EDGE], W = REAL) {
    const bad = [];
    for (const [rows, text, want, gone, only] of cases) {
      for (const [where, make, part] of R7.PLACES) {
        const pkg = await docx(make(text));
        for (const engine of only ?? engines) {
          const r = await write(pkg, { rows, terms: [], engine, W });
          const seen = R7.plain(r.raw[part]);
          const ok = (Array.isArray(want) ? (engine === EDGE ? [want[0]] : want) : [want]).some((w) => seen.includes(w));
          const left = gone && Object.values(r.raw).some((x) => gone.test(x));
          if (r.report.held || !ok || left) bad.push(`${where}${engine === EDGE ? ' (writer)' : ''} · "${text}": ${r.report.held ? `held: ${r.held.slice(0, 160)}` : seen.split('\n').filter((l) => l.trim()).slice(-1)[0]}`);
        }
      }
    }
    return bad;
  },
  /** under the writer `W` and a mask that finds nothing run together, the case ships `text` as it
   *  was in every place */
  async ships(cases, W) {
    const bad = [];
    for (const [rows, text] of cases) {
      for (const [where, make, part] of R7.PLACES) {
        const r = await write(await docx(make(text)), { rows, terms: [], engine: EDGE, W });
        if (r.report.held || !R7.plain(r.raw[part]).includes(R7.plain(text))) bad.push(`${where} · "${text}": ${said(r)}`);
      }
    }
    return bad;
  },
  /** each case through the .txt (exportPlan 'text') by `engine`, the text as a reader has it: not
   *  blocked, and holding `want` (the text itself for a case that ships) */
  txt(cases, engine = E) {
    const bad = [];
    for (const [rows, text, want] of cases) {
      const t = R7.plain(text);
      const p = engine.exportPlan({ text: t, entities: rows, reviewed: true, engineComplete: true, kind: 'text' }, [], PRACTICE);
      if (p.blocked || !p.red.includes(want ?? t)) bad.push(`the .txt · "${t}": ${p.blocked ? 'blocked' : p.red}`);
    }
    return bad;
  },
};

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 68: a token a # starts is a tag, and a row is found in it as in a handle —');
{
  // Owner ruling 18: "#kestrelcapitaldeal" shipped beside rows "Kestrel Capital" and "Kestrel"
  // (P1-F6) where "@kestrelholdings" was masked: a tag is no word of prose, and a row is found in
  // it from RUN_FLOOR. A # after a letter joins a token as an @ does ("deal#kestrelcapitaldeal").
  // The cost the ruling accepts is the last case: a plain word a # starts is read as a tag too.
  const K = [row('k1', 'Kestrel Capital', '[Company1]', 'COMPANY', 'org'), row('k2', 'Kestrel', '[Company2]', 'COMPANY', 'org')];
  const CASES = [
    [K, 'Tagged #kestrelcapitaldeal today.', 'Tagged #[Company1]deal today.', /kestrel/i],
    [K, 'Tagged #TeamKestrel today.', 'Tagged #Team[Company2] today.', /kestrel/i],
    // by the mask only: under EDGE the engine's own match takes "kestrel" as a word (an
    // underscore is a word's edge to it) before the writer reads the token
    [K, 'Tagged #kestrel_capital today.', 'Tagged #[Company1] today.', /kestrel/i, [E]],
    [K, 'Filed under deal#kestrelcapitaldeal today.', 'Filed under deal#[Company1]deal today.', /kestrel/i],
    [R7.P('Porter'), 'Tagged #supporters today.', 'Tagged #sup[Person1]s today.'],
  ];
  const bad = await R7.run(CASES);
  check(!bad.length, 'in the body, a header, a footnote and a text box, by the mask and by the writer\'s own reading, a row is masked in "#kestrelcapitaldeal", "#TeamKestrel", "#kestrel_capital" and "deal#kestrelcapitaldeal", and "#supporters" goes out "#sup[Person1]s", the cost the ruling accepts', bad.join(' | '));
  const HANDLE_OFF = ['const HANDLE = /^[@#]$/;', 'const HANDLE = /^@$/;'];
  const JOIN_OFF = ['const JOINER = /[./\\\\:@_#]/;', 'const JOINER = /[./\\\\:@_]/;'];
  const c1 = await R7.ships([CASES[0], CASES[4]], await mutated(HANDLE_OFF));
  const c2 = await R7.ships([CASES[3]], await mutated(JOIN_OFF));
  check(!c1.length && !c2.length, 'CONTROL: with a # that starts a token read as prose, "#kestrelcapitaldeal" and "#supporters" ship as written; with a # after a letter joining nothing, "deal#kestrelcapitaldeal" does', [...c1, ...c2].join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 69: a designator written out is masked whole with the name —');
{
  // Owner ruling 19a: a row "Hickson Corp" found in "Hickson Corporation" masked the letters of
  // the row only, and "[Company1]oration" went out, half a word that says a designator stood
  // there. The writer's own reading masks the word whole (RefFind.long, runTags); the engine's
  // mask does once engine.ts reads RefFind.long (lane P1), and until then the mask leaves
  // "[Company1]oration", which is all either may give.
  const CASES = [
    [R7.O('Hickson Corp'), 'Hickson Corporation appeals. Hickson Corp answers.', ['[Company1] appeals. [Company1] answers.', '[Company1]oration appeals. [Company1] answers.'], /Hickson/],
    [R7.O('Hickson Inc'), 'Hickson Incorporated signed.', ['[Company1] signed.', '[Company1]orporated signed.'], /Hickson/],
    [R7.O('Acme Co'), 'Acme Company’s brief.', ['[Company1]’s brief.', '[Company1]mpany’s brief.'], /Acme/],
    // not a designator's long form: the row is not found, as before
    [R7.O('Acme Co'), 'The company paid.', 'The company paid.'],
  ];
  const bad = await R7.run(CASES);
  check(!bad.length, 'by the writer\'s own reading "Hickson Corporation", "Hickson Incorporated" and "Acme Company’s" go out "[Company1]", in the body, a header, a footnote and a text box; "the company" is not a row', bad.join(' | '));
  const off = await mutated(["        const to = map && how === 'text' && !k.cuts.has(at + len) ? longTo(k, at, len, n) : 0;", '        const to = 0;']);
  const c = await R7.run([[R7.O('Hickson Corp'), 'Hickson Corporation appeals.', '[Company1]oration appeals.']], [EDGE], off);
  check(!c.length, 'CONTROL: with the find ending where the row does, the writer leaves "[Company1]oration" in every place', c.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 70: a number grouped by any space, dash, minus, middle dot or tab is its digits —');
{
  // Owner ruling 19b: "3192—6819" and a number set out with a tab or a minus sign shipped on a
  // row "31926819" (D1J-1), where "3192-6819" was masked (law 59). The mask covers the digits and
  // what stands between them; a closing bracket's opening one stays ("([ID1]"). A comma, and a
  // dash with a space either side, stay the limit: each ships.
  const d = '31926819';
  const SEPS = [['an em dash', '—'], ['a horizontal bar', '―'], ['a minus sign', '−'], ['a middle dot', '·'], ['an en space', ' '], ['an em space', ' '], ['a hair space', ' '], ['an ideographic space', '　'], ['a hyphen with a space each side', ' - ']];
  const CASES = [
    ...SEPS.map(([, s]) => [R7.ID(d), `Pay into account 3192${s}6819 by Friday.`, 'Pay into account [ID1] by Friday.', /6819/]),
    [R7.ID(d), 'Pay into account (3192) 6819 by Friday.', 'Pay into account ([ID1] by Friday.', /6819/],
  ];
  const bad = await R7.run(CASES);
  // a tab is its own element in Word's markup, between two runs
  const tab = await docx({ body: '<w:p><w:r><w:t xml:space="preserve">Pay into account 3192</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">6819 by Friday.</w:t></w:r></w:p>' });
  for (const engine of [E, EDGE]) { const r = await write(tab, { rows: R7.ID(d), terms: [], engine }); if (r.report.held || /6819/.test(r.raw['word/document.xml'] || '')) bad.push(`a tab${engine === EDGE ? ' (writer)' : ''}: ${said(r)}`); }
  const KEPT = [['a comma', 'Pay into account 3192,6819 by Friday.'], ['an en dash with a space each side', 'Pay into account 3192 – 6819 by Friday.']];
  for (const [what, text] of KEPT) { const r = await write(await docx({ body: para(text) }), { rows: R7.ID(d), terms: [] }); if (r.report.held || !R7.plain(r.raw['word/document.xml']).includes(text)) bad.push(`${what} (the stated limit): ${said(r)}`); }
  check(!bad.length, `a row "${d}" is masked written with ${SEPS.map((x) => x[0]).join(', ')}, a closing bracket and a space, and a tab, in every place; with ${KEPT.map((x) => x[0]).join(' or ')} it ships, as the receipt states`, bad.join(' | '));
  // the line as it stands (its characters are the separators themselves, most of them invisible),
  // set back to the separators of 2026-09-23
  const now = readFileSync(join(SRC, 'extract', 'docxWrite.ts'), 'utf8').split('\n').find((l) => l.startsWith('export const DIGIT_SEP = '));
  const narrow = await mutated([now, 'export const DIGIT_SEP = /^[ ./\\-   ‐-–]$/;']);
  const c = await R7.ships(CASES.map(([rows, text]) => [rows, text]), narrow);
  const ct = await write(tab, { rows: R7.ID(d), terms: [], engine: EDGE, W: narrow });
  check(!c.length && !ct.report.held && /6819/.test(ct.raw['word/document.xml'] || ''), 'CONTROL: with the separators of 2026-09-23 alone, each ships as written', [...c, said(ct)].join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 71: a ligature and a letter of another form are read as the letters they write —');
{
  // Owner ruling 19c: "Mr Griﬃths", with the one character Word's typography writes for "ffi",
  // shipped beside a row "Griffiths" from the body and the .txt, and from an add-in's attribute.
  // A compatibility form is read as its letters (refFold, NFKD); "½" is not twelve.
  const CASES = [
    [R7.P('Griffiths'), 'Mr Griﬃths signed.', 'Mr [Person1] signed.', /Griﬃths/],
    [R7.P('Whitfield'), 'Mr Whitﬁeld signed.', 'Mr [Person1] signed.', /Whitﬁeld/],
    [R7.P('Margaret Tan'), 'Signed \u{1D40C}\u{1D41A}\u{1D42B}\u{1D420}\u{1D41A}\u{1D42B}\u{1D41E}\u{1D42D} Tan.', 'Signed [Person1].', /\u{1D40C}/u],
    [R7.P('Tan'), 'Paid 1½ shares to Tan.', 'Paid 1½ shares to [Person1].'],
  ];
  const bad = await R7.run(CASES);
  const attr = await docx({ body: '<w:p xmlns:acme="urn:acme:meta" acme:owner="Griﬃths"><w:r><w:t>Terms.</w:t></w:r></w:p>' });
  const ra = await write(attr, { rows: R7.P('Griffiths'), terms: [] });
  check(!bad.length && !!ra.report.held && /w:p@acme:owner/.test(ra.held), 'a ligature and a mathematical bold letter are masked as the row\'s letters in every place, "1½" stays, and an add-in\'s attribute "Griﬃths" holds the file', [...bad, said(ra)].join(' | '));
  const off = await mutated(["  const src = k !== ch.normalize('NFD') && /^[\\p{L}\\p{N}\\p{M}]+$/u.test(k) ? k : ch;", '  const src = ch;']);
  const c = await R7.ships(CASES.slice(0, 3).map(([rows, text]) => [rows, text]), off);
  const ca = await write(attr, { rows: R7.P('Griffiths'), terms: [], engine: EDGE, W: off });
  check(!c.length && !ca.report.held, 'CONTROL: with the fold that leaves a ligature one character, each ships, and so does the attribute', [...c, said(ca)].join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 72: "&nbsp" with no semicolon is read as a space —');
{
  // Owner ruling 19d: a page's source pasted into a memo writes "Margaret&nbspTan", a browser
  // reads it as the name with a space, and it shipped from the body and the .txt (law 64 reads
  // "&nbsp;"). In an add-in's attribute the file holds.
  const MT = R7.P('Margaret Tan');
  const CASES = [
    [MT, 'Client: Margaret&amp;nbspTan (see file).', 'Client: [Person1] (see file).', /Margaret&(?:amp;)?nbsp/],
    [MT, 'Client: Margaret&amp;nbsp Tan (see file).', 'Client: [Person1] (see file).', /Margaret&(?:amp;)?nbsp/],
  ];
  const bad = await R7.run(CASES);
  const attr = await docx({ body: '<w:p xmlns:acme="urn:acme:meta" acme:who="Margaret&amp;nbspTan"><w:r><w:t>Terms.</w:t></w:r></w:p>' });
  const ra = await write(attr, { rows: MT, terms: [] });
  check(!bad.length && !!ra.report.held && /w:p@acme:who/.test(ra.held), '"Margaret&nbspTan" and "Margaret&nbsp Tan" are masked in every place, and an add-in\'s attribute "Margaret&nbspTan" holds the file', [...bad, said(ra)].join(' | '));
  const off = await mutated(['|&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+/g;', '|&(?:nbsp;|[A-Za-z][A-Za-z0-9]{1,31};))+/g;'], ['|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)/y;', '|&(?:(nbsp);|([A-Za-z][A-Za-z0-9]{1,31});)/y;'], ['|&#?[0-9A-Za-z]+;|&nbsp/;', '|&#?[0-9A-Za-z]+;/;']);
  const c = await R7.ships(CASES.map(([rows, text]) => [rows, text]), off);
  const ca = await write(attr, { rows: MT, terms: [], engine: EDGE, W: off });
  check(!c.length && !ca.report.held, 'CONTROL: with "&nbsp" read only with its semicolon, each ships', [...c, said(ca)].join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 73: a run of capitals before a plural s is one word —');
{
  // Owner ruling 19e: "MRIs" was read as "MR" + "Is", and a row "M.R." — a party named by
  // initials, as a minor is — was masked in it ("the [Person1]Is of the drivers"), 14 times in
  // one of this repository's opinions. "ISPs" breaks only before its s; a row that is the whole
  // run is found before it ("the KPMGs").
  const CASES = [
    [R7.P('M.R.'), 'The MRIs of M.R. were read.', 'The MRIs of [Person1] were read.'],
    [R7.O('KPMG'), 'The KPMGs report.', 'The [Company1]s report.', /KPMG/],
  ];
  const bad = await R7.run(CASES);
  check(!bad.length, 'a row "M.R." is not found in "MRIs", and "KPMG" is in "KPMGs", in every place', bad.join(' | '));
  const off = await mutated(["    const plural = chars[i + 1] === 's' && !L(chars[i + 2]) && !N(chars[i + 2]);", '    const plural = false;']);
  const c = await R7.run([[R7.P('M.R.'), 'The MRIs of M.R. were read.', 'The [Person1]Is of [Person1] were read.']], [EDGE], off);
  check(!c.length, 'CONTROL: with a break before the last capital, "MRIs" goes out "[Person1]Is"', c.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 74: a machine value under Office\'s prefix is read by the safety net whole, and a short row of digits whole —');
{
  // Owner ruling 19f (D1 NF4): "<w14:x>123456789</w14:x>" — an element no Word writes, under
  // Word's own prefix — shipped a number the safety net masks in the body. Owner ruling 19g (D1
  // NF5): a five-digit matter number declared as a row shipped from an add-in's attribute and
  // from a part the writer does not know, where a hit in a machine value counted from six
  // characters. Each holds where it is the whole value; a number inside a longer one, Word's own
  // ids, and the attributes of Office's own elements are not read for a short row.
  const w14 = (v) => docx({ body: `<w:p><w14:x>${v}</w14:x><w:r><w:t>Terms.</w:t></w:r></w:p>` });
  const unk = (inner) => docx({ parts: [{ name: 'word/matterNotes.xml', xml: `<acme:notes xmlns:acme="urn:acme:notes">${inner}</acme:notes>`, type: 'application/vnd.acme.notes+xml', rel: ['http://acme.example/notes', 'matterNotes.xml'] }] });
  const addin = (v) => docx({ body: `<w:p xmlns:acme="urn:acme:meta" acme:matter="${v}"><w:r><w:t>Terms.</w:t></w:r></w:p>` });
  const HOLD = [
    ['a number the net masks in an Office-prefixed element', await w14('123456789'), []],
    ['a row "44179" in an unknown part\'s attribute', await unk('<acme:note acme:matter="44179"/>'), R7.ID('44179')],
    ['a row "44179" in an unknown part\'s element', await unk('<acme:matter>44179</acme:matter>'), R7.ID('44179')],
    ['a row "44179" in an add-in\'s attribute', await addin('44179'), R7.ID('44179')],
    ['a row "44179" in an Office-prefixed element', await w14('44179'), R7.ID('44179')],
  ];
  const SHIP = [
    ['a date in an Office-prefixed element', await w14('2024-01-02'), []],
    ['a row "44179" inside "441790" in an add-in\'s attribute', await addin('441790'), R7.ID('44179')],
    ['a row "44179" inside Word\'s own id "00044179"', await docx({ body: '<w:p w:rsidR="00044179"><w:r><w:t>Terms.</w:t></w:r></w:p>' }), R7.ID('44179')],
    ['a row "4417" in the attribute of an Office element', await docx({ body: '<w:p><w:pPr><w:spacing w:after="4417"/></w:pPr><w:r><w:t>Terms.</w:t></w:r></w:p>' }), R7.ID('4417')],
  ];
  const bad = [];
  for (const [what, pkg, rows] of HOLD) { const r = await write(pkg, { rows: [...ROWS, ...rows] }); if (!r.report.held) bad.push(`${what}: ${said(r)}`); }
  for (const [what, pkg, rows] of SHIP) { const r = await write(pkg, { rows: [...ROWS, ...rows] }); if (r.report.held) bad.push(`${what}: ${said(r)}`); }
  check(!bad.length, `the file holds on ${HOLD.map((x) => x[0]).join('; ')}; it ships ${SHIP.map((x) => x[0]).join('; ')}`, bad.join(' | '));
  const wholeOff = await mutated(['(o.whole && allOf(r, h))', 'false']);
  const shortOff = await mutated(['h.e - h.s >= 6 || ((o.floor || o.whole) && allOf(r, h) && SHORT_DIGITS.test(r.slice(h.s, h.e)))', 'h.e - h.s >= 6']);
  const c1 = await write(HOLD[0][1], { W: wholeOff });
  const c2 = [];
  for (const [what, pkg, rows] of HOLD.slice(1)) { const r = await write(pkg, { rows: [...ROWS, ...rows], W: shortOff }); if (r.report.held) c2.push(`${what}: ${said(r)}`); }
  check(!c1.report.held && /123456789/.test(c1.raw['word/document.xml'] || '') && !c2.length, 'CONTROL: with the net\'s hits dropped in Office\'s machine values, "123456789" ships; with a machine value\'s hits counted from six characters, each "44179" ships', [said(c1), ...c2].join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 75: the list of parts, a relationships part and a kept picture written in UTF-16 hold and say so; a kept picture says UTF-8 —');
{
  // Law 62 holds a header in UTF-16. The list of parts and the relationships are read before any
  // other part, and a kept picture from its first line only, each at a line of its own: without
  // it the first two held as "malformed", about a file Word opens, and a kept SVG as the app's own
  // fault (W-LEAK-8). A kept SVG whose declaration says "UTF-16" or "US-ASCII" over bytes read as
  // UTF-8 is copied saying UTF-8, as every other part is (law 62): as it came, the copy's reader
  // decodes UTF-8 bytes as UTF-16 and draws no picture.
  const u16 = (s) => { const b = Buffer.from('\ufeff' + s, 'utf16le'); return new Uint8Array(b.buffer, b.byteOffset, b.length); };
  const wide = (x) => u16(x.replace(/^<\?xml[^?]*\?>/, '<?xml version="1.0" encoding="UTF-16" standalone="yes"?>'));
  const rezip = async (pkg, name, f) => { const z = await D.readZip(pkg); const files = []; for (const n of z.names) { const d = await z.read(n); files.push({ name: n, data: n === name ? f(dec(d)) : d }); } return REAL.writeZip(files); };
  const pic = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="7" name="Picture 7"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Picture 7"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdSvg"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const svg = (e) => `<?xml version="1.0" encoding="${e}"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>`;
  const svgPkg = (data) => docx({ body: pic, defaults: [['svg', 'image/svg+xml']], parts: [{ name: 'word/media/image1.svg', data, rel: ['image', 'media/image1.svg', 'rIdSvg'] }] });
  const base = await docx({});
  const CASES = [
    ['[Content_Types].xml', await rezip(base, '[Content_Types].xml', wide), ["  if (utf16Part(ctBytes)) return utf16Held('[Content_Types].xml');\n", ''], /^malformed \[Content_Types\]\.xml$/],
    ['word/_rels/document.xml.rels', await rezip(base, 'word/_rels/document.xml.rels', wide), ['    if (utf16Part(u)) return utf16Held(n);\n    const xml = td.decode(u);\n    if (XMLValidator', '    const xml = td.decode(u);\n    if (XMLValidator'], /^malformed relationships part: word\/_rels\/document\.xml\.rels$/],
    ['word/media/image1.svg', await svgPkg(u16(svg('UTF-16'))), ['      if (utf16Part(u)) return utf16Held(n);\n      const e = declEncoding(', '      const e = declEncoding('], /a fault in the app/],
  ];
  const bad = [], blind = [];
  for (const [name, pkg, cut, wrong] of CASES) {
    const r = await write(pkg, { keepImages: true });
    if (!r.report.held || !r.held.startsWith(`${name} is written in UTF-16, which Word reads and this app does not`) || /malformed|fault in the app/i.test(r.held)) bad.push(`${name}: ${said(r)}`);
    const c = await write(pkg, { keepImages: true, W: await mutated(cut) });
    if (!wrong.test(c.held)) blind.push(`${name}: ${said(c)}`);
  }
  const first = (r) => /^<\?xml[^?]*\?>/.exec(r.raw['word/media/image1.svg'] || '')?.[0] ?? '';
  const k16 = await write(await svgPkg(enc(svg('UTF-16'))), { keepImages: true });
  const kas = await write(await svgPkg(enc(svg('US-ASCII'))), { keepImages: true });
  const declNote = (r) => r.report.notes.some((s) => /The first line of a part/.test(s));
  check(!bad.length && [k16, kas].every(shipsClean) && [k16, kas].every((r) => first(r) === '<?xml version="1.0" encoding="UTF-8"?>' && !declNote(r)),
    'the list of parts, a relationships part and a kept SVG in UTF-16 each hold and say so; a kept SVG saying "UTF-16" or "US-ASCII" over UTF-8 bytes ships saying UTF-8, with no note of a declaration cut', [...bad, said(k16), first(k16), said(kas), first(kas)].join(' | '));
  // not rewritten, the encoding is cut as though it were an extra, and the receipt says so
  const cr = await write(await svgPkg(enc(svg('UTF-16'))), { keepImages: true, W: await mutated(["          if (recoded) a.encoding = 'UTF-8';\n", '']) });
  check(!blind.length && first(cr) === '<?xml version="1.0"?>' && declNote(cr), 'CONTROL: with each part\'s UTF-16 line taken out, the list of parts and the relationships hold as malformed and the SVG as the app\'s fault; with the picture\'s declaration not rewritten, its encoding is cut and the receipt says a first line carried more than it should', [...blind, first(cr), JSON.stringify(cr.report.notes)].join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 76: a symbol is read in the flow it is drawn in, and read out where a text box, a comment or a walked tree ends —');
{
  // A symbol in a tracked deletion was read into the live run after it ("Margaret T" + a deleted
  // "a" + "an" read "Margaret Taan", which no row matches), a live one before a deletion was
  // read as deleted ("Ref 61345"), and a live one after a deleted one took the deletion's flow.
  // The .docx holds on each (law 65); the reading is what the review, the plan and the .txt see.
  // A symbol that ends a text box's paragraph, a comment's, or the tree the writer walks again is
  // read out there, as law 65 reads one ending a paragraph and the part. A symbol's item is its
  // own w:sym's, with that run's revision, not an earlier symbol's in the paragraph ("Reviewer A"
  // inserted the "A", not the "n"); and a Symbol-font bullet reads as nothing, where its code is
  // a middle dot. None of the 21 real files has a w:sym.
  const run = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const sym = (hex, font = 'Arial') => `<w:r><w:sym w:font="${font}" w:char="${hex}"/></w:r>`;
  const rv = (tag, x) => `<w:${tag} w:id="9" w:author="Reviewer A" w:date="2026-01-01T00:00:00Z">${x}</w:${tag}>`;
  const body = `<w:p>${run('Client: Margaret T')}${rv('del', sym('0061'))}${run('an signed.')}</w:p>`
    + `<w:p>${run('Ref 61')}${sym('0032')}${rv('del', '<w:r><w:delText>zz</w:delText></w:r>')}${run('345')}</w:p>`
    + `<w:p>${run('Owner: Margaret T')}${rv('del', sym('0058'))}${sym('0061')}${run('n')}</w:p>`
    + `<w:p>${rv('ins', sym('0041'))}${run('gent: Margaret Ta')}${sym('006E')}</w:p><w:p>${sym('F0B7', 'Symbol')}${run('Agreed')}</w:p>`
    + `<w:p>${run('Before the box')}<w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p>${run('Contact Margaret Ta')}${sym('006E')}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`
    + `<w:p>${run('Ref 71234')}${sym('0035')}</w:p>`;
  const pkg = await docx({ body, parts: [{ name: 'word/comments.xml', xml: `<w:comments ${NS}><w:comment w:id="0" w:author="Reviewer" w:initials="R"><w:p>${run('Ask Margaret Ta')}${sym('006E')}</w:p></w:comment></w:comments>`, type: CT.comments, rel: ['comments', 'comments.xml'] }] });
  const xml = dec(await (await D.readZip(pkg)).read('word/document.xml'));
  // the live text, the deleted text, the live text of the tree walked again, the comment, and
  // the text of any item that carries an insertion's mark
  const read = async (DD) => {
    const { tree, items } = DD.walkPart(xml);
    const again = DD.walkTree(tree);
    const x = await DD.extractDocx(pkg);
    return JSON.stringify([DD.flowText(items.filter((i) => i.rev !== 'del')), DD.flowText(items.filter((i) => i.rev === 'del')), DD.flowText(again.filter((i) => i.rev !== 'del')),
      x.items.filter((i) => i.kind === 'comment').map((i) => i.text), items.filter((i) => i.rev === 'ins').map((i) => i.text)]);
  };
  const live = 'Margaret Tan signed the heads of terms.\nClient: Margaret Tan signed.\nRef 612345\nOwner: Margaret Tan\nAgent: Margaret Tan\nAgreed\nBefore the box\nContact Margaret Tan\nRef 712345';
  const want = JSON.stringify([live, 'a\nzz\nX', live, ['Ask Margaret Tan'], []]);
  const got = await read(D);
  check(got === want, 'a symbol in a tracked deletion is read as deleted and one beside a deletion as live; one ending a text box\'s paragraph, a comment\'s and a walked tree\'s is read out there; a symbol\'s item carries its own run\'s mark; a Symbol bullet reads as nothing', got);
  const CUTS = [
    ['item', ["        if (state.sym && (state.sym.rev === 'del') !== (item.rev === 'del')) symEnd(state, out);\n", ''], 'Client: Margaret Taan signed.'],
    ['sym', ["        if (ch && state.sym && (state.sym.rev === 'del') !== (ctx.flags.rev === 'del')) symEnd(state, out);\n", ''], 'Owner: Margaret Tn'],
    ['box', ['        walk(kids, next, out, state);\n        symEnd(state, out);\n        state.para = outer;', '        walk(kids, next, out, state);\n        state.para = outer;'], 'Contact Margaret Ta\\n'],
    ['tree', ['  symEnd(state, items);\n  return items;', '  return items;'], 'Ref 71234"'],
    ['comment', ['        symEnd(state, texts);\n', ''], '["Ask Margaret Ta"]'],
    ['stale', ["if (state.pending) { item.pre = state.pending; takePending(state, item.rev); state.sym = undefined; }", "if (state.pending) { item.pre = state.pending; takePending(state, item.rev); }"], '["n"]'],
    ['Symbol', ["  if (/^Symbol$/i.test(f)) return low >= 0x30 && low <= 0x39 ? String.fromCharCode(low) : '';\n", ''], '\\n\u00b7Agreed'],
  ];
  const blind = [];
  for (const [label, [from, to], shows] of CUTS) {
    const c = await read(await bundle(join(SRC, 'extract', 'docx.ts'), [[from, to, 'docx.ts']]));
    if (!c.includes(shows)) blind.push(`${label}: ${c}`);
  }
  check(!blind.length, 'CONTROL: with each line taken out of the walker its reading goes wrong where that line reads: "Margaret Taan", "Margaret Tn", the box\'s "Margaret Ta", the tree\'s "71234", the comment\'s "Margaret Ta", an insertion\'s mark on the "n", a bullet read as "·"', blind.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 77: a space or a tab before a tracked deletion stays in the live text —');
{
  // W7F-1: the walker gave what stood before a deleted item to the deletion alone, so "Paid
  // Margaret Tan" + " " + a deleted "within 30 days" + an inserted "promptly" read "Paid Margaret
  // Tanpromptly" in the text the review and the .txt are made from. No row is found inside a word
  // of prose (owner ruling 8), and the .txt shipped the name under a plan that said verified, while
  // the .docx, written run by run, masked it. A deleted symbol, a deleted run after a space run, and
  // one after a tab.
  const run = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const rv = (tag, x) => `<w:${tag} w:id="9" w:author="Reviewer A" w:date="2026-01-01T00:00:00Z">${x}</w:${tag}>`;
  const dt = (t) => `<w:r><w:delText xml:space="preserve">${t}</w:delText></w:r>`;
  const CASES = [
    [`<w:p>${run('Paid Margaret Tan')}${run(' ')}${rv('del', '<w:r><w:sym w:font="Arial" w:char="00A7"/></w:r>')}${run('and Lee.')}</w:p>`, 'Paid Margaret Tan and Lee.'],
    [`<w:p>${run('Paid Margaret Tan')}${run(' ')}${rv('del', dt('within 30 days'))}${rv('ins', run('promptly'))}${run('.')}</w:p>`, 'Paid Margaret Tan promptly.'],
    [`<w:p>${run('Client:')}${run('Margaret Tan')}<w:r><w:tab/></w:r>${rv('del', dt('old'))}${run('and Lee.')}</w:p>`, 'Client:Margaret Tan\tand Lee.'],
  ];
  // the store's record of the body (flowText over inMainFlow) and the .txt the Export screen makes of it
  const read = async (DD) => {
    const out = [];
    for (const [body] of CASES) {
      const x = await DD.extractDocx(await docx({ body }));
      const text = DD.flowText(x.items.filter(DD.inMainFlow)).split('\n').pop();
      const plan = E.exportPlan({ text, entities: R7.P('Margaret Tan'), reviewed: true, engineComplete: true, kind: 'txt' }, [], PRACTICE);
      out.push({ text, red: plan.red, verified: plan.verified });
    }
    return out;
  };
  const got = await read(D);
  const bad = got.filter((g, i) => g.text !== CASES[i][1] || /Margaret/.test(g.red) || !g.red.includes('[Person1]') || !g.verified);
  check(!bad.length, 'the body reads "Paid Margaret Tan and Lee.", "Paid Margaret Tan promptly." and "Client:Margaret Tan\\tand Lee.", and the .txt masks the name in each', JSON.stringify(bad));
  const off = await read(await bundle(join(SRC, 'extract', 'docx.ts'), [["  if (rev === 'del') { state.pending = state.live ?? ''; return; }", "  if (rev === 'del') { state.pending = ''; return; }", 'docx.ts']]));
  check(off.every((g) => /Margaret Tan(and|promptly)/.test(g.text) && /Margaret Tan/.test(g.red) && g.verified), 'CONTROL: with the deletion taking the live text\'s space and tab, the body reads "Margaret Tanand" and "Margaret Tanpromptly", and the .txt ships the name under a plan that says verified', JSON.stringify(off));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 78: a drawing\'s position is Word\'s number, and a value in the code is not sent to Find —');
{
  // W7F-2: law 74 reads the text of an Office element whole and for a row of two to five digits;
  // a real file's picture 44,450 EMUs from its anchor then held on a row "44450", telling the
  // lawyer the text was readable in the body and to find it in Word. A drawing's position and its
  // share of the page are read as an Office attribute is (officeMeasure), a row of digits counting
  // from six characters, the stated limit. Where a value in the code does hold (law 74), the hold
  // says Find does not reach it, and not to find it in Word.
  const WPX = 'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"';
  const anchor = (h, pct) => `<w:p><w:r><w:drawing><wp:anchor ${WPX} distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>${h}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>-12700</wp:posOffset></wp:positionV><wp:extent cx="914400" cy="914400"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="1" name="Text Box 1"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr/><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic><wp14:sizeRelH relativeFrom="margin"><wp14:pctWidth>${pct}</wp14:pctWidth></wp14:sizeRelH></wp:anchor></w:drawing></w:r><w:r><w:t>Terms.</w:t></w:r></w:p>`;
  const SHIP = [['a position of 44450 on a row "44450"', await docx({ body: anchor('44450', '0') }), '44450'], ['a width of 50000 thousandths of a per cent on a row "50000"', await docx({ body: anchor('0', '50000') }), '50000']];
  const HOLD = [['a position of 612345 on a row "612345" (six characters)', await docx({ body: anchor('612345', '0') }), '612345'], ['"<w14:x>44179</w14:x>" on a row "44179"', await docx({ body: '<w:p><w14:x>44179</w14:x><w:r><w:t>Terms.</w:t></w:r></w:p>' }), '44179']];
  const bad = [];
  for (const [what, pkg, d] of SHIP) { const r = await write(pkg, { rows: [...ROWS, ...R7.ID(d)] }); if (!shipsClean(r) || !(r.raw['word/document.xml'] || '').includes(`>${d}<`)) bad.push(`${what}: ${said(r)}`); }
  for (const [what, pkg, d] of HOLD) { const r = await write(pkg, { rows: [...ROWS, ...R7.ID(d)] }); if (!r.report.held || !/Word's Find does not reach/.test(r.held) || /find the text in Word/.test(r.held)) bad.push(`${what}: ${said(r)}`); }
  check(!bad.length, `the file ships ${SHIP.map((x) => x[0]).join(' and ')}, with the drawing where it was; it holds on ${HOLD.map((x) => x[0]).join(' and ')}, saying Word's Find does not reach the value and not to find it in Word`, bad.join(' | '));
  const measured = await mutated(['mode === \'machine\' && !MEDIA_RE.test(part) && !officeMeasure(parent, ns));', 'mode === \'machine\' && !MEDIA_RE.test(part));']);
  const c1 = [];
  for (const [what, pkg, d] of SHIP) { const r = await write(pkg, { rows: [...ROWS, ...R7.ID(d)], W: measured }); if (!r.report.held) c1.push(`${what}: ${said(r)}`); }
  const told = await mutated(['if (readable.some(code)) said.push(', 'if (false) said.push('], ['said.push(readable.every(code) ?', 'said.push(false ?']);
  const c2 = await write(HOLD[1][1], { rows: [...ROWS, ...R7.ID('44179')], W: told });
  check(!c1.length && /find the text in Word/.test(c2.held) && !/Find does not reach/.test(c2.held), 'CONTROL: with a drawing\'s position read as an element no Word writes, both hold; with no sentence for a value in the code, the hold sends the lawyer to find it in Word', [...c1, said(c2)].join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 79: a link a mail client wrapped over a line, in LF or CRLF, is read as one line —');
{
  // WL-1, WL-2, WL-8 (owner ruling 17): a 76-column wrap lands anywhere in a link. With a CRLF
  // anywhere in a Proofpoint link, or an LF inside its own address ("urldefense.proofpoint.com/v2/
  // url?u="), inside an escape ("-25" and "20"), or inside v3's "__;", the client's folder name
  // shipped from the body and the .txt of 47 of 100 places in a v2 link and 34 of 77 in a v3 one,
  // under a plan that said verified; so did a plain "%20" and a Safe Links "%2520" broken inside
  // the escape, and every place of a link on the US government's host, urldefense.us. Swept here
  // at every place a break can stand, LF and CRLF through the .txt and LF (a w:br) through the
  // .docx. A break inside the name's own letters is read as written, in a link as in prose (the
  // stated remainder, 9 places a link). Out of a link, "5%" ending a line and "2125550147" opening
  // the next are two things, and a row of those digits is found.
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const LINKS = [
    ['a Proofpoint v2 link', 'https://urldefense.proofpoint.com/v2/url?u=https-3A__dms.firm.com_Margaret-2520Tan_brief.docx&d=DwMFaQ&c=abc'],
    ['a Proofpoint v3 link', `https://urldefense.com/v3/__https://dms.firm.com/Margaret*20Tan/brief.docx__;${b64('%')}!!abc$`],
    ['a v3 link on urldefense.us', `https://urldefense.us/v3/__https://dms.firm.com/Margaret*20Tan/brief.docx__;${b64('%')}!!abc$`],
    ['a plain link', 'https://dms.firm.com/Margaret%20Tan/brief.docx'],
    ['a Safe Links link', 'https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fdms.firm.com%2FMargaret%2520Tan%2Fbrief.docx&data=05'],
  ];
  const readable = (s) => /Margaret(?:-25|\*|%|%25)20Tan/.test(s.replace(/\r?\n/g, ''));
  const run = (t) => `<w:r><w:t xml:space="preserve">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r>`;
  /** every place a break can stand in each link, outside the name's letters: those that ship */
  const sweep = async (engine, W, kinds) => {
    const out = [];
    let places = 0, letters = 0;
    for (const [what, link] of LINKS) {
      const name = link.indexOf('Margaret'), nameEnd = link.indexOf('Tan', name) + 3;
      for (let i = 1; i < link.length; i++) {
        if (i > name && i < nameEnd && /[A-Za-z]/.test(link[i - 1]) && /[A-Za-z]/.test(link[i]) && !/[*%-]/.test(link.slice(Math.max(name, i - 3), i))) { letters++; continue; }
        places++;
        for (const k of kinds) {
          let ships;
          if (k !== 'docx') {
            const p = engine.exportPlan({ text: `Link: ${link.slice(0, i)}${k}${link.slice(i)} sent.`, entities: ROWS, reviewed: true, engineComplete: true, kind: 'text' }, [], PRACTICE);
            ships = !p.blocked && readable(p.red);
          } else {
            const pkg = await docx({ body: `<w:p>${run('Link: ' + link.slice(0, i))}<w:r><w:br/></w:r>${run(link.slice(i) + ' sent.')}</w:p>` });
            const plan = engine.exportPlan({ text: '', entities: ROWS, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg }, [], PRACTICE);
            const r = await W.writeRedactedDocx(pkg, { mask: plan.docx.mask });
            const body = r.bytes ? dec(await (await D.readZip(r.bytes)).read('word/document.xml')) : '';
            ships = !r.held && readable(body.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'));
          }
          if (ships) out.push(`${what} ${k === 'docx' ? '.docx' : k === '\n' ? 'LF' : 'CRLF'} "${link.slice(Math.max(0, i - 4), i)}|${link.slice(i, i + 4)}"`);
        }
      }
    }
    return { out, places, letters };
  };
  const cur = await sweep(E, REAL, ['\n', '\r\n', 'docx']);
  check(!cur.out.length && cur.places === 391 && cur.letters === 9 * LINKS.length,`at each of ${cur.places} places a break can stand in ${LINKS.map((x) => x[0]).join(', ')}, the name is masked from the .txt with LF and with CRLF and from the .docx with a w:br (${cur.letters} places inside the name's letters are the stated remainder)`, cur.out.slice(0, 8).join(' | '));
  // each reading taken back, the .txt through an engine whose writer is the mutated one
  const CTL = [
    ['no break read in a link', [[String.raw`const BR = '(?:\\r?\\n)?';`, "const BR = '';"]], ['\n'], /v2 link LF .*v3 link LF .*Safe Links link LF /],
    ['a CRLF read as the break it is', [[String.raw`const BR = '(?:\\r?\\n)?';`, String.raw`const BR = '(?:\n)?';`], [String.raw`|\\r?\\n(?=[^&\\s]))+)`, String.raw`|\\n(?=[^&\\s]))+)`], [String.raw`((?:\\S|\\r?\\n(?=\\S))+?)`, String.raw`((?:\\S|\\n(?=\\S))+?)`]], ['\r\n'], /v2 link CRLF .*v3 link CRLF .*on urldefense\.us CRLF /],
    ['no break read inside a gateway\'s own address and "__;"', [["'\\\\$&')).join(BR);", "'\\\\$&')).join('');"]], ['\n'], /v2 link LF "\/\/ur\|ldef".*v3 link LF "ocx_\|_;JQ"/],
    ['a v2 "-" before a break read as written', [[String.raw`const past = (j: number) => { while (s[j] === '\n' || (s[j] === '\r' && s[j + 1] === '\n')) j++; return j; };`, 'const past = (j: number) => j;']], ['\n'], /v2 link LF "ret-\|2520"/],
    ['no escape read over a break in a link', [['[...s.matchAll(LINK_BROKEN)]', '[...s.matchAll(/(?!)/g)]']], ['\n'], /v2 link LF "t-25\|20Ta".*plain link LF "ret%\|20Ta".*Safe Links link LF "t%25\|20Ta"/],
    ['the urldefense.us host not read', [["(?:${brokenLit('com')}|${brokenLit('us')})", "${brokenLit('com')}"]], ['\n'], /on urldefense\.us LF "h\|ttps"/],
  ];
  const ctl = [];
  for (const [what, m, kinds, want] of CTL) {
    const r = await sweep(await bundle(join(SRC, 'engine.ts'), m), REAL, kinds);
    if (!r.out.length || !want.test(r.out.join(' '))) ctl.push(`${what}: ${r.out.length} ship${r.out.length ? ` (${r.out.slice(0, 3).join(' | ')})` : ''}`);
  }
  const wNoBr = await mutated([String.raw`const BR = '(?:\\r?\\n)?';`, "const BR = '';"]);
  const docxOff = await sweep(await bundle(join(SRC, 'engine.ts'), [[String.raw`const BR = '(?:\\r?\\n)?';`, "const BR = '';"]]), wNoBr, ['docx']);
  if (!docxOff.out.length) ctl.push('no break read, the .docx: nothing ships');
  check(!ctl.length, `CONTROL: with each reading taken back, the name ships from the .txt (${CTL.map((x) => x[0]).join('; ')}), and with no break read, from the .docx (${docxOff.out.length} places)`, ctl.join(' | '));
  // out of a link a break is a break: read as one escape, "%\n21" wrote "!" and the digits were gone
  const PROSE = 'Interest at 5%\n2125550147 is the desk line.';
  const find = (W) => W.refFind(PROSE, W.refNames({ names: ['2125550147'] }), 'text').map((f) => PROSE.slice(f.s, f.e));
  const everywhere = await mutated(["const links = [...s.matchAll(LINK_BROKEN)].filter((m) => m[0].includes('\\n')).map((m) => [m.index!, m.index! + m[0].length]);", 'const links = [[0, s.length]];']);
  check(find(REAL).join() === '2125550147', 'out of a link, "5%" ending a line and "2125550147" opening the next are read as written, and the row of those digits is found', JSON.stringify(find(REAL)));
  check(find(everywhere).length === 0, 'CONTROL: with a break read across everywhere, "%\\n21" is read as one escape and the row is not found', JSON.stringify(find(everywhere)));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 80: a character reference is read by HTML\'s whole table, and by number without its semicolon —');
{
  // WL-3, WL-4: a hand list of 34 names read "&nbsp;" and missed the rest of HTML's table, and a
  // reference by number was read only with its semicolon. Text pasted from a page's source with a
  // hair, medium or zero-width space, a word joiner, a direction mark or a middle dot between the
  // words of a client's name, or "&#160" with no semicolon, shipped the name from every place and
  // the .txt under a plan that said verified; so did a declared account number written with
  // "&minus;" or "&middot;", and "&num;" before a tag. A name HTML does not define stays as written
  // (owner ruling 10).
  const MT = R7.P('Margaret Tan'), ACC = R7.ID('31926819'), KC = R7.O('Kestrel Capital');
  const NAMED = ['hairsp', 'MediumSpace', 'emsp13', 'ZeroWidthSpace', 'NoBreak', 'lrm', 'middot', 'NewLine', 'AMP']
    .map((n) => [MT, `Client: Margaret&amp;${n};Tan signed.`, 'Client: [Person1] signed.', /Margaret&(?:amp;)?\w+;Tan/]);
  const NUMBERED = ['#160', '#x2009'].map((n) => [MT, `Client: Margaret&amp;${n}Tan signed.`, 'Client: [Person1] signed.', /Margaret&(?:amp;)?#\w+Tan/]);
  const DIGITS = ['minus', 'middot', 'hairsp'].map((n) => [ACC, `Account 3192&amp;${n};6819 confirmed.`, 'Account [ID1] confirmed.', /6819/]);
  const TAG = [[KC, 'Tagged &amp;num;kestrelcapitaldeal today.', 'Tagged &num;[Company1]deal today.', /kestrelcapital/i]];
  // a reference by number with leading zeros, which HTML reads as the same character
  const ZEROS = ['#00000032;', '#x0000020;'].map((n) => [MT, `Client: Margaret&amp;${n}Tan signed.`, 'Client: [Person1] signed.', /Margaret&(?:amp;)?#\w+;Tan/]);
  const CASES = [...NAMED, ...NUMBERED, ...ZEROS, ...DIGITS, ...TAG];
  const KEPT = [[MT, 'Client: Margaret&amp;foo;Tan signed.', 'Client: Margaret&foo;Tan signed.']];
  const bad = [...await R7.run(CASES), ...R7.txt(CASES), ...await R7.run(KEPT), ...R7.txt(KEPT)];
  const attr = (v) => docx({ body: `<w:p xmlns:acme="urn:acme:meta" acme:who="${v}"><w:r><w:t>Terms.</w:t></w:r></w:p>` });
  const ATTRS = ['Margaret&amp;hairsp;Tan', 'Margaret&amp;#160Tan'];
  const ra = [];
  for (const v of ATTRS) ra.push(await write(await attr(v), { rows: MT, terms: [] }));
  check(!bad.length && ra.every((r) => !!r.report.held && /w:p@acme:who/.test(r.held)),
    `${NAMED.length} names of HTML's table, ${NUMBERED.length} references by number without a semicolon, a declared number and a tag's "&num;" are read as what they write in every place and the .txt; "&foo;" stays as written; an add-in's attribute with either holds the file`, [...bad, ...ra.map(said)].join(' | '));
  // each reading taken back, the .docx under the writer's own reading and the .txt through an
  // engine whose writer is the mutated one
  const CTL = [
    ['the table off, "&nbsp" alone read', [['  return HTML_ENTITY.get(n) ?? null;', "  return n === 'nbsp' ? '\\u00A0' : null;"]], [...NAMED, ...DIGITS, ...TAG], ATTRS[0]],
    ['a name read only in the hand list\'s shape, two to eight letters', [['|&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+/g;', '|&(?:nbsp;?|[A-Za-z]{2,8};))+/g;'], ['|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)/y;', '|&(?:(nbsp);?|([A-Za-z]{2,8});)/y;']], NAMED.filter(([, t]) => /MediumSpace|emsp13|ZeroWidthSpace/.test(t)), null],
    ['a reference by number read only with its semicolon', [['|&#(?:0*\\d{1,7}|[xX]0*[0-9A-Fa-f]{1,6});?|&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+/g;', '|&#(?:0*\\d{1,7}|[xX]0*[0-9A-Fa-f]{1,6});|&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+/g;'], ['|&#(?:0*(\\d{1,7})|[xX]0*([0-9A-Fa-f]{1,6}));?|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)/y;', '|&#(?:0*(\\d{1,7})|[xX]0*([0-9A-Fa-f]{1,6}));|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)/y;'], ['|&#\\d|&#[xX][0-9A-Fa-f]|&#?[0-9A-Za-z]+;|&nbsp/;', '|&#?[0-9A-Za-z]+;|&nbsp/;']], NUMBERED, ATTRS[1]],
    ['a reference by number read to its seventh digit only', [['&#(?:0*\\d{1,7}|[xX]0*[0-9A-Fa-f]{1,6});?|&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+/g;', '&#(?:\\d{1,7}|[xX][0-9A-Fa-f]{1,6});?|&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+/g;'], ['&#(?:0*(\\d{1,7})|[xX]0*([0-9A-Fa-f]{1,6}));?|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)/y;', '&#(?:(\\d{1,7})|[xX]([0-9A-Fa-f]{1,6}));?|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)/y;']], ZEROS, null],
  ];
  const ctl = [];
  for (const [what, m, cases, a] of CTL) {
    const W = await mutated(...m), Eoff = await bundle(join(SRC, 'engine.ts'), m);
    const miss = [...await R7.ships(cases.map(([rows, text]) => [rows, text]), W), ...R7.txt(cases.map(([rows, text]) => [rows, text]), Eoff)];
    if (miss.length) ctl.push(`${what}: ${miss.length} did not ship (${miss.slice(0, 2).join(' | ')})`);
    if (a) { const r = await write(await attr(a), { rows: MT, terms: [], engine: EDGE, W }); if (r.report.held) ctl.push(`${what}: the attribute "${a}" held (${said(r)})`); }
  }
  check(!ctl.length, `CONTROL: with each reading taken back, what it reads ships from every place and the .txt (${CTL.map((x) => x[0]).join('; ')})`, ctl.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 81: a number grouped by a space or a dash of any kind Unicode names, or a bullet, is its digits —');
{
  // WL-5: the comment on DIGIT_SEP said a space of any width and a dash of any length, and a
  // declared account number written with a medium or an Ogham space, a two- or three-em dash, a
  // small em dash or hyphen, a hyphenation point, a katakana middle dot or a bullet shipped from
  // every place and the .txt. The class is now Unicode's own (space separators, dash
  // punctuation) and the dots and bullets named.
  const d = '31926819';
  const SEPS = [['a medium space', ' '], ['an Ogham space', ' '], ['a two-em dash', '⸺'], ['a three-em dash', '⸻'], ['a small em dash', '﹘'], ['a small hyphen-minus', '﹣'], ['a hyphenation point', '‧'], ['a katakana middle dot', '・'], ['a bullet', '•'], ['a bullet operator', '∙']];
  const CASES = SEPS.map(([, s]) => [R7.ID(d), `Pay into account 3192${s}6819 by Friday.`, 'Pay into account [ID1] by Friday.', /6819/]);
  const bad = [...await R7.run(CASES), ...R7.txt(CASES)];
  check(!bad.length, `a row "${d}" is masked written with ${SEPS.map((x) => x[0]).join(', ')}, in every place and the .txt`, bad.join(' | '));
  const now = readFileSync(join(SRC, 'extract', 'docxWrite.ts'), 'utf8').split('\n').find((l) => l.startsWith('export const DIGIT_SEP = '));
  const m = [now, 'export const DIGIT_SEP = /^(?:[\\t \\u00A0./\\-\\u00B7\\u2002-\\u200A\\u202F\\u2010-\\u2015\\u2212\\u3000]| - |\\) )$/u;'];
  const c = [...await R7.ships(CASES.map(([rows, text]) => [rows, text]), await mutated(m)), ...R7.txt(CASES.map(([rows, text]) => [rows, text]), await bundle(join(SRC, 'engine.ts'), [m]))];
  check(!c.length, 'CONTROL: with ruling 19b\'s separators alone, each ships from every place and the .txt', c.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 82: a letter in a circle or a square is its letter, and a small or look-alike "#" or "@" is a tag\'s or a handle\'s —');
{
  // WL-6: Unicode files a letter in a circle or a square as a symbol, so each was a separator and
  // a name written in them shipped from every place and the .txt. WL-7, W7F-3: the small number
  // sign and commercial at of CJK text and the music sharp, which foldFullwidth does not reach,
  // left a tag or a handle read as prose, and a row "Kestrel Capital" inside it shipped where
  // "#kestrelcapitaldeal" was masked (owner ruling 18).
  const MT = R7.P('Margaret Tan'), KE = R7.O('Kestrel'), KC = R7.O('Kestrel Capital');
  const CASES = [
    [MT, 'Client: ⓜⓐⓡⓖⓐⓡⓔⓣ ⓣⓐⓝ.', 'Client: [Person1].', /ⓜⓐ/],
    [KE, 'Client: \u{1F13A}\u{1F134}\u{1F142}\u{1F143}\u{1F141}\u{1F134}\u{1F13B} signed.', 'Client: [Company1] signed.', /\u{1F13A}\u{1F134}/u],
    [KE, 'Client: \u{1F17A}\u{1F174}\u{1F182}\u{1F183}\u{1F181}\u{1F174}\u{1F17B} signed.', 'Client: [Company1] signed.', /\u{1F17A}\u{1F174}/u],
    [KE, 'Client: \u{1F15A}\u{1F154}\u{1F162}\u{1F163}\u{1F161}\u{1F154}\u{1F15B} signed.', 'Client: [Company1] signed.', /\u{1F15A}\u{1F154}/u],
    [KC, 'Tagged ﹟kestrelcapitaldeal today.', 'Tagged ﹟[Company1]deal today.', /kestrelcapital/i],
    [KC, 'Tagged ♯kestrelcapitaldeal today.', 'Tagged ♯[Company1]deal today.', /kestrelcapital/i],
    [KC, 'Posted by ﹫kestrelcapitaldeal today.', 'Posted by ﹫[Company1]deal today.', /kestrelcapital/i],
  ];
  const bad = [...await R7.run(CASES), ...R7.txt(CASES)];
  check(!bad.length, 'a name in circled, squared and filled letters, and a row in a tag or a handle a small "#", a sharp or a small "@" starts, are masked in every place and the .txt', bad.join(' | '));
  const m = ['{ chars.push(symbolRead(ch)); space.push(sp);', '{ chars.push(ch); space.push(sp);'];
  const c = [...await R7.ships(CASES.map(([rows, text]) => [rows, text]), await mutated(m)), ...R7.txt(CASES.map(([rows, text]) => [rows, text]), await bundle(join(SRC, 'engine.ts'), [m]))];
  check(!c.length, 'CONTROL: with each symbol read as written, each ships from every place and the .txt', c.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 83: a compatibility form that holds more than letters and digits stays as written, and one digit is no number in markup —');
{
  // W7F-5: two round-7 bounds no law held. refFold reads a compatibility form as its letters only
  // where it holds nothing else: "½" is "1⁄2", and read through, "12345½" carried a row "123451"
  // and was masked. SHORT_DIGITS reads a row of two to five digits where it is the whole of a
  // value in markup; from one digit, an add-in's acme:matter="7" and Word's own <w14:x>7</w14:x>
  // held the file beside a row "7".
  const HALF = [[R7.ID('123451'), 'Account 12345½ units.', 'Account 12345½ units.']];
  const bad = [...await R7.run(HALF), ...R7.txt(HALF)];
  const off = await mutated(["  const src = k !== ch.normalize('NFD') && /^[\\p{L}\\p{N}\\p{M}]+$/u.test(k) ? k : ch;", "  const src = k !== ch.normalize('NFD') ? k : ch;"]);
  const c = await R7.run([[R7.ID('123451'), 'Account 12345½ units.', 'Account [ID1] units.']], [EDGE], off);
  const ONE = [
    ['an add-in\'s attribute', await docx({ body: '<w:p xmlns:acme="urn:acme:meta" acme:matter="7"><w:r><w:t>Terms.</w:t></w:r></w:p>' })],
    ['an element under Office\'s prefix', await docx({ body: '<w:p><w:r><w:t>Terms.</w:t></w:r><w14:x>7</w14:x></w:p>' })],
  ];
  const any = await mutated(['export const SHORT_DIGITS = /^\\p{N}{2,5}$/u;', 'export const SHORT_DIGITS = /^\\p{N}{1,5}$/u;']);
  for (const [what, pkg] of ONE) {
    const r = await write(pkg, { rows: R7.ID('7'), terms: [] });
    if (r.report.held) bad.push(`a row "7" as the whole of ${what}: ${said(r)}`);
    const ca = await write(pkg, { rows: R7.ID('7'), terms: [], W: any });
    if (!ca.report.held) c.push(`from one digit, a row "7" as the whole of ${what} ships`);
  }
  check(!bad.length, '"12345½" is not a row "123451" in any place or the .txt, and a row "7" as the whole of an add-in\'s attribute or an Office element ships', bad.join(' | '));
  check(!c.length, 'CONTROL: with the fold reading "½" as "1⁄2", the writer masks "12345½" as "[ID1]"; with SHORT_DIGITS from one digit, each "7" holds the file', c.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 84: the names the engine finds only outside the body are masked in the part that carries them —');
{
  // Owner ruling 27. The engine read the body alone, and the writer masked every other part
  // with the body's table, the always-redact list and the safety-net pattern: a client named
  // only in the letterhead, a matter in the footer, a witness in a footnote shipped readable,
  // and the gate, which reads the output with the same table, passed the file (LAUNCH.md 2.2).
  // Now the text the saved file carries outside its body (side.ts sideOf, read off docxMarks)
  // goes to the engine in a request of its own, and what it finds there joins the mask
  // (engine.ts joinSide, docxMaskTable). The engine is not run here: its table for that text is
  // given, as the engine would return it, and everything after it is the app's own code.
  const A = await bundle(join(SRC, 'attest.ts'));
  const S = await bundle(join(SRC, 'side.ts'));
  const hdr = (n, xml) => ({ name: `word/header${n}.xml`, xml: `<w:hdr ${NS}>${xml}</w:hdr>`, type: CT.header, rel: ['header', `header${n}.xml`, `rIdH${n}`] });
  const wm = '<w:p><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1" type="#_x0000_t136" style="position:absolute;width:468pt;height:117pt;rotation:315" fillcolor="silver" stroked="f"><v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="Draft for Vikram Nair"/></v:shape></w:pict></w:r></w:p>';
  const chartXml = `<c:chartSpace ${NS}><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Monthly freight volumes — Calloway Freight plc</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/>`
    + '<c:ser><c:idx val="0"/><c:order val="0"/><c:cat><c:strRef><c:f>Sheet1!$A$2</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>2025</c:v></c:pt></c:strCache></c:strRef></c:cat>'
    + '<c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4120</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser>'
    + '<c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>';
  const DGM = 'xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const pt = (id, t) => `<dgm:pt modelId="{0000000${id}-0000-0000-0000-000000000000}"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${t}</a:t></a:r></a:p></dgm:t></dgm:pt>`;
  const smartArt = `<dgm:dataModel ${DGM}><dgm:ptLst><dgm:pt modelId="{00000000-0000-0000-0000-000000000000}" type="doc"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p/></dgm:t></dgm:pt>${pt(1, 'Helena Ostrowski, Managing Partner')}${pt(2, 'Tomasz Wren, Associate')}</dgm:ptLst><dgm:cxnLst/></dgm:dataModel>`;
  const body = '<w:p><w:r><w:t xml:space="preserve">The witness evidence is summarised below.</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:t xml:space="preserve"> See the correspondence.</w:t></w:r><w:r><w:endnoteReference w:id="1"/></w:r></w:p>'
    + '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="5486400" cy="3200400"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    // the first section ends here, with a header of its own: Schedule 2 follows in the last one
    + `<w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rIdH4"/></w:sectPr></w:pPr><w:r><w:t>End of letter.</w:t></w:r></w:p>`
    + para('Schedule 2 — the estate accounts.');
  const pkg = await docx({
    body,
    header: `${para('Harwood Pike LLP · for Brightline Holdings Ltd · Privileged and confidential')}${wm}`,
    sect: '<w:headerReference w:type="first" r:id="rIdH2"/><w:headerReference w:type="even" r:id="rIdH3"/><w:footerReference w:type="default" r:id="rIdF1"/><w:titlePg/>',
    parts: [
      hdr(2, para('Without prejudice — for the attention of Rhiannon Blake')),
      hdr(3, para('Prepared by Siobhan Kearney')),
      hdr(4, para('Schedule 2 — Estate of Ingrid Solberg')),
      { name: 'word/footer1.xml', xml: `<w:ftr ${NS}>${para('Client-Matter: Okonkwo / 12345.001')}</w:ftr>`, type: `${WML}.footer+xml`, rel: ['footer', 'footer1.xml', 'rIdF1'] },
      { name: 'word/footnotes.xml', xml: `<w:footnotes ${NS}><w:footnote w:id="1">${para('Witness statement of Priya Raman dated 3 March 2024, para 12.')}</w:footnote></w:footnotes>`, type: `${WML}.footnotes+xml`, rel: ['footnotes', 'footnotes.xml'] },
      { name: 'word/endnotes.xml', xml: `<w:endnotes ${NS}><w:endnote w:id="1">${para('Letter from Dafydd Evans to the Tribunal, 14 May 2024.')}</w:endnote></w:endnotes>`, type: `${WML}.endnotes+xml`, rel: ['endnotes', 'endnotes.xml'] },
      { name: 'word/charts/chart1.xml', xml: chartXml, type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdChart'] },
      { name: 'word/diagrams/data1.xml', xml: smartArt, type: 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml', rel: ['diagramData', 'diagrams/data1.xml'] },
      { name: 'word/settings.xml', xml: `<w:settings ${NS}><w:evenAndOddHeaders/></w:settings>`, type: CT.settings, rel: ['settings', 'settings.xml'] },
    ],
  });
  // each name, the part that carries it, and where the review says it was found
  const NAMES = [
    ['Brightline Holdings Ltd', 'word/header1.xml', 'a header', 'the letterhead naming the client'],
    ['Vikram Nair', 'word/header1.xml', 'a watermark', 'a watermark'],
    ['Rhiannon Blake', 'word/header2.xml', 'a header', 'a first-page header that differs from the default'],
    ['Siobhan Kearney', 'word/header3.xml', 'a header', 'the even-page header'],
    ['Ingrid Solberg', 'word/header4.xml', 'a header', 'a later section\'s header'],
    ['Okonkwo', 'word/footer1.xml', 'a footer', 'the footer "Client-Matter: Okonkwo / 12345.001"'],
    ['Priya Raman', 'word/footnotes.xml', 'the footnotes', 'a footnote naming a witness'],
    ['Dafydd Evans', 'word/endnotes.xml', 'the endnotes', 'an endnote'],
    ['Calloway Freight plc', 'word/charts/chart1.xml', 'a chart', 'a chart title naming a company'],
    ['Helena Ostrowski', 'word/diagrams/data1.xml', 'a diagram', 'a SmartArt org chart'],
    ['Tomasz Wren', 'word/diagrams/data1.xml', 'a diagram', 'the same org chart\'s second name'],
  ];
  const marks = await A.docxMarks(pkg);
  const bodyText = D.flowText((await D.extractDocx(pkg)).items.filter(D.inMainFlow));
  const side = S.sideOf(marks);
  const missing = NAMES.filter(([n, , where]) => !side.places.some((p) => p.where === where && p.text.includes(n)));
  check(side.state === 'waiting' && !missing.length && !side.text.includes('Margaret Tan') && !/\b4120\b/.test(side.text),
    'what goes to the engine carries each of the eleven, each at its place, and neither the body nor the chart\'s plotted number', missing.map(([n, , w]) => `${n} (${w})`).join(', ') || `${side.text.length} characters from ${S.placesSaid(side)}`);
  // the engine's table for that text, as it would come back: its own numbering, a person
  // numbered [Person1] as the body's Margaret Tan is
  const people = NAMES.filter(([n]) => !/Ltd|plc/.test(n));
  const found = [
    row('s0', 'Brightline Holdings Ltd', '[Company1]', 'COMPANY', 'org'), row('s1', 'Calloway Freight plc', '[Company2]', 'COMPANY', 'org'),
    ...people.map(([n], i) => row(`p${i}`, n, `[Person${i + 1}]`, 'PERSON', 'person')),
  ];
  const j = E.joinSide(bodyText, ROWS, found, side.places, PRACTICE);
  const sideRead = { ...side, state: 'read', rows: j.rows, joined: j.joined };
  const wrong = NAMES.filter(([n, , where]) => !j.rows.some((e) => e.text === n && e.found?.includes(where)));
  const tags = j.rows.map((e) => e.tag);
  check(j.entities === ROWS && j.rows.length === NAMES.length && !wrong.length && new Set(tags).size === tags.length && !tags.includes('[Person1]'),
    'none joins the body\'s table; each is kept apart, says where it was found, and has a tag of its own, none of them the body\'s [Person1]', wrong.map(([n]) => n).join(', ') || tags.join(' '));
  const writeSide = async (s) => {
    const plan = E.exportPlan({ text: bodyText, entities: ROWS, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg, side: s }, TERMS, PRACTICE);
    const report = await REAL.writeRedactedDocx(pkg, { mask: plan.docx.mask });
    const raw = {};
    if (report.bytes) { const zip = await D.readZip(report.bytes); for (const n of zip.names) raw[n] = dec(await zip.read(n)); }
    if (report.bytes) shippedOutputs.push({ raw, report });
    return { plan, report, raw };
  };
  const w = await writeSide(sideRead);
  const ships = NAMES.filter(([n, part]) => (w.raw[part] ?? '').includes(n));
  check(!!w.report.bytes && !ships.length && NAMES.every(([n, part]) => (w.raw[part] ?? '').includes(j.rows.find((e) => e.text === n).tag)) && !/Margaret Tan/.test(w.raw['word/document.xml'] ?? ''),
    'the saved .docx is written, and each of the eleven is its tag in the part that carries it: ' + NAMES.map(([, , , what]) => what).join('; '), w.report.held || ships.map(([n, part]) => `${n} in ${part}`).join(', '));
  check(w.plan.docxHeld === null && w.plan.red === E.exportPlan({ text: bodyText, entities: ROWS, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg }, TERMS, PRACTICE).red,
    'the copied text and the .txt are the body\'s, the same with the side read as without it');
  const before = await writeSide({ ...side, state: 'not-run', why: 'the engine was offline' });
  const shipped = NAMES.filter(([n, part]) => (before.raw[part] ?? '').includes(n));
  check(!!before.report.bytes && shipped.length === NAMES.length,
    'CONTROL: with no engine read of that text, as the writer masked before, the gate passes the file with all eleven readable in their parts', `${shipped.length} of ${NAMES.length} readable · ${before.report.held ?? 'written'}`);
  const unread = await writeSide({ ...side, state: 'unread', again: true, why: 'the request that sent it to the engine failed' });
  check(/^the engine did not read the text the saved \.docx carries outside its body: the request that sent it to the engine failed\./.test(unread.plan.docxHeld ?? '') && !unread.plan.blocked,
    'when the body was read and that text was not, the plan holds the .docx and not the text exports', unread.plan.docxHeld);
  // an engine row that places nowhere the saved file carries it masks nothing, and is dropped;
  // a name the body carries too joins the body's table and says where else it stands
  const j2 = E.joinSide(bodyText, ROWS, [...found, row('x', 'Margaret Tan', '[Person20]', 'PERSON', 'person'), row('y', 'Nobody Here', '[Person21]', 'PERSON', 'person')], [...side.places, { where: 'a footer', part: 'word/footer2.xml', text: 'Margaret Tan — Private' }], PRACTICE);
  check(j2.rows.length === NAMES.length && j2.entities.length === 1 && j2.entities[0].found?.join() === 'a footer' && j2.entities[0].tag === '[Person1]',
    'a name the body carries is not added again: its row is told it was also found in a footer; one found nowhere is dropped', JSON.stringify(j2.entities.map((e) => [e.text, e.tag, e.found])));
  // a name the side read found that the body carries, but the body's table does not: it joins
  // the table, so the copied text and the .txt mask it as the .docx does
  const j3 = E.joinSide('Margaret Tan met Rhiannon Blake in chambers.', ROWS, found, side.places, PRACTICE);
  const rb = j3.entities.find((e) => e.text === 'Rhiannon Blake');
  check(j3.joined === 1 && !!rb && rb.found?.join() === 'a header' && rb.occ === 1 && !j3.rows.some((e) => e.text === 'Rhiannon Blake'),
    'a name found outside the body that the body also carries, and its table missed, joins the table, with where else it was found', JSON.stringify(rb));
  // the channels one by one, by what docxMarks reads: a later section's header, the even-page
  // and first-page headers are parts of their own, and each is sent
  const hdrs = side.places.filter((p) => p.where === 'a header').map((p) => p.part).sort().join(' ');
  check(hdrs.includes('word/header1.xml') && hdrs.includes('word/header2.xml') && hdrs.includes('word/header3.xml') && hdrs.includes('word/header4.xml'),
    'the default, first-page, even-page and later-section headers are each sent', hdrs);
  const c = S.sideOf(marks.filter((m) => m.where !== 'a header'));
  check(!c.text.includes('Rhiannon Blake') && !c.text.includes('Ingrid Solberg') && c.text.includes('Okonkwo'),
    'CONTROL: with the headers\' marks left out, their names are not sent — the check above reads what sideOf is given', `${c.text.length} characters`);
  // the drop's list could not be made: nothing can say what the saved file carries there
  check(S.sideOf(null).state === 'unread' && S.sideOf([], [{ part: 'word/footer1.xml', text: 'Client-Matter: Okonkwo' }]).state === 'unread' && S.sideOf([], [{ part: 'word/document.xml', text: 'Body.' }]).state === 'none',
    'no list of those texts at the drop, or an empty one over a file whose walk found a footer\'s text, is unread (and the .docx held); an empty one over a body alone is none');
  // a text with no letter and no digit, once a list level's %1 is out, is not sent: measured
  // over the owner's 21 files, a list's "%1." and a bullet were all the text outside the body
  // in most of them, and each would have been a request of its own (and a hold if it failed)
  const numbering = await docx({ parts: [{ name: 'word/numbering.xml', xml: `<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="(%1)."/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum></w:numbering>`, type: CT.numbering, rel: ['numbering', 'numbering.xml'] }] });
  const numMarks = await A.docxMarks(numbering);
  const numSide = S.sideOf(numMarks, (await D.extractDocx(numbering)).items);
  const named = await docx({ parts: [{ name: 'word/numbering.xml', xml: `<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="Okonkwo Schedule %1."/></w:lvl></w:abstractNum></w:numbering>`, type: CT.numbering, rel: ['numbering', 'numbering.xml'] }] });
  const namedSide = S.sideOf(await A.docxMarks(named), (await D.extractDocx(named)).items);
  check(numMarks.some((m) => /number text/.test(m.where) && m.text === '(%1).') && numSide.state === 'none'
    && namedSide.state === 'waiting' && namedSide.text === 'Okonkwo Schedule %1.',
    'a list\'s "(%1)." and a bullet are not sent, and the file is none; "Okonkwo Schedule %1." is sent (the CONTROL: the writer lists both, and only the one with letters goes)',
    `${numSide.state} · ${namedSide.state}: ${namedSide.text.length} characters`);
  check(S.sideOf([{ kind: 'flow', read: 'text', where: 'a footer', part: 'word/footer1.xml', text: '— 12 —' }]).state === 'waiting'
    && S.sideOf([{ kind: 'flow', read: 'text', where: 'a footer', part: 'word/footer1.xml', text: '— · —' }]).state === 'none',
    'a footer with a digit in it is sent; one of dashes and dots is not');
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 85: what the engine read of different places comes back a row of each place, each whole, and each is masked where it stands —');
{
  // Second pass on ruling 27 (2026-09-25). The frozen pipeline returns a masked text; the rows the
  // app gets are read off that text's alignment with the text sent (serve-legal.mjs rowsFromFinal
  // over lib-legal/regions.mjs alignTags), and alignTags folds two tags into one region when fewer
  // than four characters that are not white space stand between them. Law 84 hands joinSide its
  // table; this law makes that table the way the service does, with the real alignTags and the
  // real rowsFromFinal, imported from the tree as they stand. The pipeline's model is not run:
  // `serve` tags each listed name where the text carries it, as the pipeline tags a name it finds,
  // and everything after that is the service's and the app's own code.
  //   H-ATK-1  texts of two places joined by a blank line folded a name ending one into a name
  //            beginning the next: one row, placing in neither, and the second name shipped
  //            readable under a gate that passed (side.ts SIDE_JOIN; engine.ts sideRowsCut)
  //   H-ATK-2  a region over 200 characters was no row at all (serve-legal.mjs rowsFromFinal)
  //   H-ATK-5  a name the body carries inside a folded body row was listed "found only outside
  //            the body", under a second tag (engine.ts joinSide)
  //   H-ATK-6  a row's span carried the white space after it, and the .txt read "[Person1]of"
  const ROOT = join(here, '..', '..', '..');
  const { rowsFromFinal } = await import(pathToFileURL(join(ROOT, 'serve-legal.mjs')).href);
  const A = await bundle(join(SRC, 'attest.ts'));
  // the engine and side modules, with `mutations` [from, to, 'side.ts' | 'engine.ts'] written into
  // them on the way in; each must find its text, and each must be applied (a CONTROL whose anchor
  // moved fails loudly rather than testing nothing)
  let n85 = 0;
  const app85 = async (mutations = []) => {
    const outfile = join(dir, `law85-${n85++}.mjs`);
    const applied = new Set();
    await build({
      stdin: { contents: "export * from './engine.ts';\nexport { sideOf, sideReceipt, SIDE_JOIN } from './side.ts';", resolveDir: SRC, loader: 'ts' },
      bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
      plugins: [{ name: 'mutate85', setup(b) {
        b.onLoad({ filter: /lib[\\/](side|engine)\.ts$/ }, (args) => {
          const file = /side\.ts$/.test(args.path) ? 'side.ts' : 'engine.ts';
          let s = readFileSync(args.path, 'utf8');
          mutations.forEach(([from, to, target], i) => {
            if (target !== file) return;
            if (!s.includes(from)) throw new Error(`CONTROL anchor not found in ${file}: ${from}`);
            s = s.split(from).join(to);
            applied.add(i);
          });
          return { contents: s, loader: 'ts' };
        });
      } }],
    });
    if (applied.size !== mutations.length) throw new Error(`CONTROL not applied: ${mutations.filter((_, i) => !applied.has(i)).map(([f]) => f).join(' | ')}`);
    return import(pathToFileURL(outfile).href);
  };
  const APP = await app85();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const WORD = { PERSON: 'Person', COMPANY: 'Company', ID: 'Id' };
  /** the frozen pipeline as the service answers it: each of `names` that the text carries is
   *  masked there with a tag of its own, numbered per request, and the rows are read off that
   *  masked text by `rowsOf` (the real rowsFromFinal unless a CONTROL says otherwise) */
  const serve = (names, rowsOf = rowsFromFinal, whole = null) => (text) => {
    const n = {};
    let final = text;
    if (whole) { if (!whole.re.test(final)) throw new Error('law 85: the seam-crossing mask found nothing to mask'); final = final.replace(whole.re, whole.tag); }
    for (const [name, cls] of names) {
      if (!final.includes(name)) continue;
      n[cls] = (n[cls] ?? 0) + 1;
      final = final.split(name).join(`[${WORD[cls]}${n[cls]}]`);
    }
    const t = rowsOf(text, final);
    return { done: true, genre: 'product', profile: 'auto', engine: 'v1-legal-frozen', final, alignOk: t.ok, rows: t.rows };
  };
  /** the app's steps for a dropped .docx on the service, as stripDocument and readSide take them,
   *  then Export's plan and the writer: the body sent alone, the text outside it sent apart */
  const through = async (M, pkg, names, { rowsOf, whole } = {}) => {
    const marks = await A.docxMarks(pkg);
    const bodyText = D.flowText((await D.extractDocx(pkg)).items.filter(D.inMainFlow));
    const side = M.sideOf(marks);
    const body = M.mapLegalOutcome(bodyText, serve(names, rowsOf)(bodyText));
    const o = M.mapLegalOutcome(side.text, serve(names, rowsOf, whole)(side.text));
    const j = M.joinSide(body.doc, body.entities, o.entities, side.places, PRACTICE);
    const read = { ...side, state: 'read', rows: j.rows, joined: j.joined };
    const plan = M.exportPlan({ text: body.doc, entities: j.entities, reviewed: true, engineComplete: body.complete && o.complete, kind: 'docx', bytes: pkg, side: read }, [], PRACTICE);
    const report = plan.docxHeld ? { held: plan.docxHeld } : await REAL.writeRedactedDocx(pkg, { mask: plan.docx.mask });
    const raw = {};
    if (report.bytes) { const zip = await D.readZip(report.bytes); for (const n of zip.names) raw[n] = dec(await zip.read(n)); }
    if (report.bytes && M === APP) shippedOutputs.push({ raw, report });
    return { side, body, o, j, read, plan, report, raw, txt: plan.red };
  };
  /** where each name stands readable in the saved .docx: in a part's XML, or in its text with the
   *  markup taken out (a name split across runs) */
  const readable = (r, names) => names.flatMap((n) => Object.entries(r.raw).filter(([, x]) => x.includes(n) || x.replace(/<[^>]*>/g, '').includes(n)).map(([part]) => `${n} in ${part}`));
  const P = (t) => [t, 'PERSON'], C = (t) => [t, 'COMPANY'];
  const hdrP = (n, xml) => ({ name: `word/header${n}.xml`, xml: `<w:hdr ${NS}>${xml}</w:hdr>`, type: CT.header, rel: ['header', `header${n}.xml`, `rIdH${n}`] });
  const ftrP = (n, xml) => ({ name: `word/footer${n}.xml`, xml: `<w:ftr ${NS}>${xml}</w:ftr>`, type: `${WML}.footer+xml`, rel: ['footer', `footer${n}.xml`, `rIdF${n}`] });
  const chart = (title) => ({ name: 'word/charts/chart1.xml', type: CT.chart, rel: ['chart', 'charts/chart1.xml', 'rIdC1'],
    xml: `<c:chartSpace ${NS}><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${title}</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4120</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>` });
  const chartRun = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="5486400" cy="3200400"/><wp:docPr id="1" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdC1"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const notes = (kind, texts) => ({ name: `word/${kind}s.xml`, type: `${WML}.${kind}s+xml`, rel: [`${kind}s`, `${kind}s.xml`],
    xml: `<w:${kind}s ${NS}>${texts.map((t, i) => `<w:${kind} w:id="${i + 1}">${para(t)}</w:${kind}>`).join('')}</w:${kind}s>` });
  const refs = (kind, n) => Array.from({ length: n }, (_, i) => `<w:r><w:${kind}Reference w:id="${i + 1}"/></w:r>`).join('');

  // five pairs of places, each a name ending the first text and a name beginning the next, with
  // under four characters that are not white space between them once joined by a blank line
  const PAIRS = [
    ['a first-page header ends with the partner, the default header begins with the client', await docx({
      sect: '<w:headerReference w:type="first" r:id="rIdH1"/><w:headerReference w:type="default" r:id="rIdH2"/><w:titlePg/>',
      parts: [hdrP(1, para('HARWOOD PIKE LLP') + para('Partner: Rhiannon Blake')), hdrP(2, para('Brightline Holdings Ltd — privileged and confidential'))] }),
    [P('Rhiannon Blake'), C('Brightline Holdings Ltd')]],
    ['a header ends with the client, the footer begins with the matter partner', await docx({
      sect: '<w:headerReference w:type="default" r:id="rIdH1"/><w:footerReference w:type="default" r:id="rIdF1"/>',
      parts: [hdrP(1, para('Private and confidential: Chidi Okonkwo')), ftrP(1, para('Rhiannon Blake / 044817.0003'))] }),
    [P('Chidi Okonkwo'), P('Rhiannon Blake')]],
    ['two footers, the first ending with a name, the second beginning with one', await docx({
      sect: '<w:footerReference w:type="first" r:id="rIdF1"/><w:footerReference w:type="default" r:id="rIdF2"/><w:titlePg/>',
      parts: [ftrP(1, para('Prepared by Rhiannon Blake')), ftrP(2, para('Chidi Okonkwo v Brightline Holdings Ltd'))] }),
    [P('Rhiannon Blake'), P('Chidi Okonkwo'), C('Brightline Holdings Ltd')]],
    ['a header ends with the matter reference, the footer begins with the client', await docx({
      sect: '<w:headerReference w:type="default" r:id="rIdH1"/><w:footerReference w:type="default" r:id="rIdF1"/>',
      parts: [hdrP(1, para('Our ref: RB/044817.0003')), ftrP(1, para('Chidi Okonkwo — privileged and confidential'))] }),
    [['RB/044817.0003', 'ID'], P('Chidi Okonkwo')]],
    ['an endnote ends with a name, the chart title begins with a company', await docx({
      body: `<w:p><w:r><w:t>See the letter.</w:t></w:r>${refs('endnote', 1)}</w:p>${chartRun}`,
      parts: [notes('endnote', ['Letter from Dafydd Evans']), chart('Calloway Freight plc — monthly volumes')] }),
    [P('Dafydd Evans'), C('Calloway Freight plc')]],
  ];
  const JOIN_OFF = ["export const SIDE_JOIN = '\\n\\n####\\n\\n';", "export const SIDE_JOIN = '\\n\\n';", 'side.ts'];
  const BLANK = await app85([JOIN_OFF]);
  const ok1 = [], bad1 = [], ctl1 = [];
  for (const [what, pkg, names] of PAIRS) {
    const all = [P('Margaret Tan'), ...names];
    const secrets = names.map(([n]) => n);
    const r = await through(APP, pkg, all);
    const left = readable(r, secrets);
    const seam = r.side.text.includes('\n\n####\n\n') && r.side.places.length >= 2;
    (seam && r.report.bytes && !left.length ? ok1 : bad1).push(`${what}: ${r.report.held ?? (left.join(', ') || 'clean')}${seam ? '' : ' (no seam sent)'}`);
    const c = await through(BLANK, pkg, all);
    const cl = readable(c, secrets);
    if (c.report.bytes && cl.length) ctl1.push(`${what}: ${cl.join(', ')}`);
  }
  check(ok1.length === PAIRS.length && !bad1.length,
    'each of five pairs of places is sent with a line of four #s between them, and the saved .docx is written with every name in both places masked', bad1.join(' || ') || `${ok1.length} of ${PAIRS.length}`);
  check(ctl1.length === PAIRS.length,
    'CONTROL: with the places joined by a blank line alone (SIDE_JOIN as it was), in each of the five a name ships readable and the writer\'s gate passes the file', ctl1.join(' || ') || 'none readable');

  // the row that crosses the line anyway (a pipeline that masked the line with the names round it)
  // is cut at it: each name its own row, the second under a tag of its own
  const [, pkg1, names1] = PAIRS[0];
  const whole = { re: /(Rhiannon Blake|Brightline Holdings Ltd)\s*####\s*(Rhiannon Blake|Brightline Holdings Ltd)/, tag: '[Person1]' };
  const cross = await through(APP, pkg1, [P('Margaret Tan')], { whole });
  const crossRows = cross.o.entities.map((e) => e.text);
  const cr = cross.j.rows.filter((e) => /Rhiannon Blake|Brightline Holdings Ltd/.test(e.text));
  check(crossRows.length === 1 && /####/.test(crossRows[0]) && cr.length === 2 && cr[0].tag !== cr[1].tag && !cr.some((e) => e.tag === '[Person1]')
    && !!cross.report.bytes && !readable(cross, names1.map(([n]) => n)).length,
    'a row that crosses the line is cut there: each name is a row of its own under a tag of its own, and both are masked in the saved .docx', cr.map((e) => `${e.text} ${e.tag}`).join(' | ') || JSON.stringify(crossRows));
  const UNCUT = await app85([['const pieces = group[0].text.split(SIDE_SEAM).map((s) => s.trim()).filter(named);', 'const pieces = [group[0].text].map((s) => s.trim()).filter(named);', 'engine.ts']]);
  const uncut = await through(UNCUT, pkg1, [P('Margaret Tan')], { whole });
  const ul = readable(uncut, names1.map(([n]) => n));
  check(!!uncut.report.bytes && ul.includes('Brightline Holdings Ltd in word/header2.xml'),
    'CONTROL: with the row not cut at the line, the second header\'s client ships readable under a gate that passes', `${ul.join(', ') || uncut.report.held || 'none readable'} · first header: ${(uncut.raw['word/header1.xml'] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}`);

  // a footnote listing who attended: the names, a comma apart, fold into one region over 200
  // characters. Every region is a row now, and the saved .docx and the .txt mask all fourteen.
  const LIST = ['Ada Lindqvist', 'Bruno Ferreira', 'Cosima Hartley', 'Desmond Achebe', 'Esther Nakamura', 'Florian Weiss', 'Greta Solberg', 'Hamid Rahimi', 'Ines Duarte', 'Jonah Whitcombe', 'Keira Obi', 'Lorcan Byrne', 'Mei Tanaka', 'Nils Berg'];
  const listNames = [P('Margaret Tan'), ...LIST.map(P), C('Harwood Pike LLP')];
  const present = `Present: ${LIST.join(', ')} (all of Harwood Pike LLP).`;
  const inNote = await docx({ body: `<w:p><w:r><w:t>The hearing was attended by counsel for all parties.</w:t></w:r>${refs('footnote', 1)}</w:p>`, parts: [notes('footnote', [present])] });
  const inBody = await docx({ body: para(present) });
  const capped = (o, f) => { const t = rowsFromFinal(o, f); return { ...t, rows: t.rows.filter((x) => x.span.length <= 200) }; };
  const longest = Math.max(...rowsFromFinal(present, serve(listNames)(present).final).rows.map((x) => x.span.length));
  const ln = await through(APP, inNote, listNames);
  const lb = await through(APP, inBody, listNames);
  const lnLeft = readable(ln, LIST), lbLeft = LIST.filter((n) => lb.txt.includes(n));
  check(longest > 200 && !!ln.report.bytes && !lnLeft.length && !lbLeft.length && !!lb.report.bytes && !readable(lb, LIST).length,
    `the fourteen fold into one region of ${longest} characters, a row like any other: none of them is readable in the saved .docx, in the footnote or in the body, or in the .txt`, [...lnLeft, ...lbLeft.map((n) => `${n} in the .txt`)].join(', ') || ln.report.held || lb.report.held);
  const cn = await through(APP, inNote, listNames, { rowsOf: capped });
  const cb = await through(APP, inBody, listNames, { rowsOf: capped });
  const cnLeft = readable(cn, LIST), cbLeft = LIST.filter((n) => cb.txt.includes(n));
  check(!!cn.report.bytes && cnLeft.length === LIST.length && cbLeft.length === LIST.length,
    'CONTROL: with a region over 200 characters skipped, as rowsFromFinal skipped it until now, all fourteen ship readable in the footnote of a saved .docx the gate passes, and in the .txt', `${cnLeft.length} in the .docx, ${cbLeft.length} in the .txt`);
  // stated, not fixed: the fold is the frozen alignment's, so the fourteen are one row under one
  // tag, and the receipt, which counts rows, counts them as one
  check(/it found 2 things to mask there that the app did not find in the body \(People 1, Organizations 1\)/.test(APP.sideReceipt(ln.read) ?? '') && ln.j.rows.filter((e) => e.cat === 'person').length === 1,
    'the fourteen are one row under one tag, and the receipt counts them as one of People', APP.sideReceipt(ln.read));
  // two notes of one part are one text, as the part's flow is (no line of #s between them): a
  // name ending the first and a name beginning the next are one row, masked there as one
  const twoNotes = await docx({ body: `<w:p><w:r><w:t>See the statements.</w:t></w:r>${refs('footnote', 2)}</w:p>`, parts: [notes('footnote', ['Statement of Priya Raman', 'Dafydd Evans, second statement, para 4.'])] });
  const tn = await through(APP, twoNotes, [P('Margaret Tan'), P('Priya Raman'), P('Dafydd Evans')]);
  check(tn.j.rows.length === 1 && /^Priya Raman\s+Dafydd Evans$/.test(tn.j.rows[0].text) && !!tn.report.bytes && !readable(tn, ['Priya Raman', 'Dafydd Evans']).length,
    'a name ending one footnote and a name beginning the next are one row under one tag, and both are masked in the saved .docx', tn.j.rows.map((e) => `${JSON.stringify(e.text)} ${e.tag}`).join(' | ') || tn.report.held);

  // a name the body carries only inside a folded body row ("Lim Wei Sheng\nFarah Osman", one
  // region) and an endnote carries alone: it joins the table under that row's tag
  const folded = await docx({ body: `${para('Lim Wei Sheng')}${para('Farah Osman')}<w:p><w:r><w:t>Exhibits as listed.</w:t></w:r>${refs('endnote', 1)}</w:p>`,
    parts: [notes('endnote', ['Exhibit list held by Farah Osman since March.'])] });
  const foldNames = [P('Margaret Tan'), P('Lim Wei Sheng'), P('Farah Osman')];
  const f = await through(APP, folded, foldNames);
  const cover = f.body.entities.find((e) => e.text.includes('Lim Wei Sheng') && e.text.includes('Farah Osman'));
  const fo = f.j.entities.find((e) => e.text === 'Farah Osman');
  check(!!cover && !!fo && fo.tag === cover.tag && fo.found?.join() === 'the endnotes' && !f.j.rows.some((e) => e.text === 'Farah Osman')
    && !!f.report.bytes && !readable(f, ['Farah Osman']).length && (f.raw['word/endnotes.xml'] ?? '').includes(cover.tag),
    'a name the body carries inside a folded row of its own joins the table under that row\'s tag, is not listed as found only outside the body, and the endnote writes it as that tag', `${fo ? `${fo.text} ${fo.tag}` : 'not in the table'} · cover ${cover ? JSON.stringify(cover.text) + ' ' + cover.tag : 'none'} · side rows ${f.j.rows.map((e) => e.text).join(', ') || 'none'}`);
  const APART = await app85([
    ['    if (inBody[j] || inside.has(i)) added.push({ ...row, occ: countOcc(doc, e.text) });', '    if (inBody[j]) added.push({ ...row, occ: countOcc(doc, e.text) });', 'engine.ts'],
    ['  for (const [i, b] of inside) if (b && !tagOf.has(live[i].tag)) tagOf.set(live[i].tag, b.tag);\n', '', 'engine.ts'],
  ]);
  const fa = await through(APART, folded, foldNames);
  const far = fa.j.rows.find((e) => e.text === 'Farah Osman');
  check(!!far && far.tag !== cover?.tag && !fa.j.entities.some((e) => e.text === 'Farah Osman'),
    'CONTROL: without that join it is listed "found only outside the body" of a body that carries it, under a second tag', far ? `${far.text} ${far.tag} (the body writes it ${cover?.tag})` : 'not a side row');

  // a row's span carries the white space after it; cut, the .txt keeps the space the tag took
  const LETTER = 'We refer to your letter to Margaret Tan of 3 March.';
  const lr = serve([P('Margaret Tan')])(LETTER);
  const lo = APP.mapLegalOutcome(LETTER, lr);
  const TRIM_OFF = ['    const span = row.span.trim();', '    const span = row.span;', 'engine.ts'];
  const UNTRIMMED = await app85([TRIM_OFF]);
  const uo = UNTRIMMED.mapLegalOutcome(LETTER, lr);
  check(lr.rows[0]?.span === 'Margaret Tan ' && lo.entities.map((e) => e.text).join() === 'Margaret Tan' && APP.remask(lo.doc, lo.entities, PRACTICE).text === 'We refer to your letter to [Person1] of 3 March.',
    'the service\'s row is "Margaret Tan " with the space after it; the table\'s is "Margaret Tan", and the .txt reads "[Person1] of 3 March."', JSON.stringify(lr.rows[0]?.span) + ' → ' + APP.remask(lo.doc, lo.entities, PRACTICE).text);
  check(UNTRIMMED.remask(uo.doc, uo.entities, PRACTICE).text === 'We refer to your letter to [Person1]of 3 March.',
    'CONTROL: with each span as the service gave it, the .txt reads "[Person1]of 3 March."', UNTRIMMED.remask(uo.doc, uo.entities, PRACTICE).text);
  // H-ATK-4 on this path: counted by the table's headings, never all "names"
  const [, pkg4, names4] = PAIRS[3];
  const r4 = await through(APP, pkg4, [P('Margaret Tan'), ...names4]);
  const said4 = APP.sideReceipt(r4.read) ?? '';
  check(/it found 2 things to mask there that the app did not find in the body \(People 1, IDs & contact 1\)/.test(said4),
    'the receipt counts a matter reference and a client as one of People and one of IDs & contact, not as two names', said4);
  const UNHEADED = await app85([['that the app did not find in the body (${byHeading(side.rows)}), and the saved', 'that the app did not find in the body, and the saved', 'side.ts']]);
  const said4c = UNHEADED.sideReceipt(r4.read) ?? '';
  check(!/\(People 1, IDs & contact 1\)/.test(said4c) && /it found 2 things to mask there/.test(said4c),
    'CONTROL: with the count by heading taken out of the receipt, the check above fails on the same read', said4c);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— law 35: every part of every file shipped above is well-formed, and was read —');
{
  const bad = shippedOutputs.flatMap((o) => malformed(o.raw));
  const unread = shippedOutputs.filter((o) => o.report.gate.parts !== Object.keys(o.raw).length);
  check(shippedOutputs.length >= 15 && bad.length === 0, `${shippedOutputs.length} files, every XML part well-formed`, bad.join(', '));
  // a prefix no declaration in the part names: Word calls such a file damaged, and a
  // well-formedness check does not see it (read over the whole part, not by scope)
  const undeclared = shippedOutputs.flatMap((o) => Object.entries(o.raw).filter(([n]) => /\.(xml|rels)$/.test(n)).flatMap(([n, x]) => {
    const used = new Set([...x.matchAll(/<\/?([A-Za-z_][\w.-]*):[\w.-]+|\s([A-Za-z_][\w.-]*):[\w.-]+=/g)].map((m) => m[1] ?? m[2]).filter((p) => p !== 'xml' && p !== 'xmlns'));
    return [...used].filter((p) => !x.includes(`xmlns:${p}=`)).map((p) => `${n}: ${p}`);
  }));
  check(undeclared.length === 0, 'no part uses a prefix it does not declare', undeclared.slice(0, 5).join(', '));
  check(unread.length === 0 && shippedOutputs.every((o) => o.report.gate.values > 0), 'the gate read as many parts as each file carries, and their attribute values', unread.map((o) => `${o.report.gate.parts}/${Object.keys(o.raw).length}`).join(' '));
  // a "<" in the text, written back unescaped, breaks the part it is in (the XML library
  // escapes an attribute's quotes itself, so the text is where the writer's own escaping shows)
  const lt = await docx({ body: para('Fees &lt; 5 per cent.') });
  const c = await write(lt, { W: await mutated(["const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')", "const escText = (s: string) => s.replace(/&/g, '&amp;')"]) });
  check(!!c.report.held && /word\/document\.xml: not well-formed XML/.test(c.held), 'CONTROL: a writer that stops escaping "<" in text is held by the gate\'s own parse of the output', said(c));
}

try { rmSync(dir, { recursive: true, force: true }); } catch { /* a scratch bundle left in the temp folder is harmless */ }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
