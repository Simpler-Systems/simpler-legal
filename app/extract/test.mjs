// Fixture test for the docx forensic walker AND the .docx writer — every planted hiding spot
// must be listed by the walker, every binary flagged, nothing unrecognized; then the writer
// must clear every one of them from the package it writes, and the re-walk of that package
// must read the way the masked flow reads. Exit non-zero on any miss.
//
//   node app/extract/make-fixture.mjs && node app/extract/test.mjs
//
// The writer is TypeScript (app/frontend/src/lib/extract/docxWrite.ts); it is bundled here
// with esbuild (a vite dependency of app/frontend, so `npm install` there is the only setup)
// into a temp file and driven the way the Export screen drives it, with a mask function of
// this test's own: a fixed name table plus the frozen structured floor (lib-core FLOOR_RULES).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractDocx, flowText, inMainFlow, readZip, walkPart, walkTree } from './docx.mjs';
import { FLOOR_RULES } from '../../lib-core/anonymize.mjs';

const buf = fs.readFileSync(new URL('./fixture.docx', import.meta.url));
const res = extractDocx(buf);

const all = res.items.map((i) => i.text).join('\n');
let failures = 0;
// Every assert() that actually RUNS bumps this, and the foot of the file checks it for EXACT
// equality against EXPECTED_ASSERTIONS. It exists because "the assertions stopped running" is a
// failure mode this suite has already had: with the writer's output assertions guarded by
// `if (report.bytes)` (test.mjs:148 before this change), a run in which the writer HELD the
// export skipped 59 of the 119 assertions in silence and printed "59 passes + 1 fail" — a
// console that reads as a smaller test run, not as a broken gate. `failures` cannot see that,
// because an assertion that never ran never failed. A counted total can.
let ran = 0;
function assert(cond, label, detail = '') {
  ran++;
  console.log(`${cond ? '  ✔' : '  ✘ FAIL'} ${label}${!cond && detail ? `\n        ${detail}` : ''}`);
  if (!cond) failures++;
}
const find = (marker, extra = () => true) => res.items.find((i) => i.text.includes(marker) && extra(i));

console.log('— the walker: body shape —');
const flow = flowText(res.items.filter(inMainFlow));
assert(flow.includes('between Hastings Holdings Ltd and Margaret Tan.'), 'a run split mid-word ("Marg" + "aret Tan.") reads as one word in the flow', JSON.stringify(flow.split('\n')[0]));
assert(flow.includes('Ref\tM-2026-0141\nSecond line by Ravi Pillai'), 'a tab and a line break inside a run are in the flow as \\t and \\n');
assert(flow.includes('TABLE-CELL: Counsel\nTABLE-CELL: Nadia Rahman'), 'table cells are lines of their own');
assert(flow.includes('Contact: Email Margaret Tan or our website; merge «ClientSSN»'), 'a field result, a hyperlink and a simple field read as their visible text', JSON.stringify(flow.split('\n').find((l) => l.startsWith('Contact'))));
assert(flow.includes('CONTROL-CONTENT: Lim Wei Sheng'), 'content-control content is in the flow');
assert((flow.match(/TEXTBOX-TEXT: call \+65 6438 2210/g) || []).length === 1, 'a text box written twice (mc:Choice + mc:Fallback) is read once', String((flow.match(/TEXTBOX-TEXT/g) || []).length));
assert(flow.includes(' after the box'), 'the anchor paragraph continues after the text box');
assert(!/FIELD-MAILTO|MERGEFIELD|FORMDROPDOWN|TOOLTIP|CONTROL-ALIAS|CONTROL-TAG|CONTROL-ITEM|LEGACY-ENTRY|ALTTEXT/.test(flow), 'no field code, tooltip, control plumbing or alt-text is in the flow');

console.log('— the walker: every hiding spot listed —');
const del = find('SECRET-DELETED');
assert(del && del.rev === 'del' && del.kind === 'body' && del.author === 'Opposing Counsel', `tracked deletion: rev:del, kind body, author kept (${del?.author})`);
const ins = find('INSERTED-BY-TRACKING');
assert(ins && ins.rev === 'ins' && ins.kind === 'body', 'tracked insertion: rev:ins, kind body');
assert(!flow.includes('SECRET-DELETED') && flow.includes('INSERTED-BY-TRACKING'), 'main flow drops the deletion and keeps the insertion');
for (const [marker, kind] of [['HEADER-INS', 'header'], ['FOOTER-INS', 'footer'], ['FOOTNOTE-INS', 'footnote'], ['ENDNOTE-INS', 'endnote'], ['GLOSSARY-INS', 'glossary']]) {
  const it = find(marker);
  assert(it && it.rev === 'ins' && it.kind === kind, `${marker}: rev:ins · kind ${it?.kind ?? '(missing)'} — expected ${kind}`);
}
assert(!/HEADER-INS|FOOTER-INS|FOOTNOTE-INS|ENDNOTE-INS|GLOSSARY-INS/.test(flow), 'main flow contains NO insertion from outside the body');
const hid = find('HIDDEN-VANISH-TEXT');
assert(hid && hid.hidden === true, 'hidden (w:vanish) run listed and flagged');
const alt = find('ALTTEXT: photo');
assert(alt && alt.kind === 'alt-text' && alt.attr === 'descr', 'picture alt-text (wp:docPr descr)');
assert(find('ALTTEXT-CHART')?.kind === 'alt-text', 'chart frame alt-text');
const fld = find('FIELD-MAILTO');
assert(fld && fld.kind === 'field' && fld.part === 'word/document.xml', 'complex field instruction (w:instrText): the HYPERLINK mailto');
const merge = find('FIELD-MERGE');
assert(merge && merge.kind === 'field' && merge.attr === 'w:instr', 'simple field instruction (w:fldSimple w:instr): the MERGEFIELD');
assert(find(' FORMDROPDOWN ')?.kind === 'field', 'legacy form field instruction');
const tip = find('TOOLTIP');
assert(tip && tip.kind === 'link' && tip.attr === 'w:tooltip', 'hyperlink tooltip');
const ext = find('LINK-TARGET');
assert(ext && ext.kind === 'link' && ext.part === 'word/_rels/document.xml.rels', 'external hyperlink target, from the relationships part');
assert(find('CONTROL-ALIAS')?.kind === 'control' && find('CONTROL-TAG')?.kind === 'control', 'content-control alias and tag');
const items = res.items.filter((i) => i.text.startsWith('CONTROL-ITEM'));
assert(items.length === 2 && items.every((i) => i.kind === 'control' && i.attr === 'w:displayText'), `both drop-down entries, chosen or not (${items.length})`);
assert(res.items.some((i) => i.text === 'lws' && i.kind === 'control' && i.attr === 'w:value'), 'a drop-down entry\'s stored value too');
const legacy = res.items.filter((i) => i.text.startsWith('LEGACY-ENTRY'));
assert(legacy.length === 2 && legacy.every((i) => i.kind === 'control'), `both legacy form-field entries (w:listEntry) (${legacy.length})`);
const dv = find('DOCVAR');
assert(dv && dv.kind === 'variable' && dv.part === 'word/settings.xml', 'document variable (settings.xml)');
const pp = find('PEOPLE: Janet');
assert(pp && pp.kind === 'people' && pp.attr === 'w15:author', 'people.xml author');
assert(find('PEOPLE-ID')?.attr === 'w15:userId', 'people.xml directory identity (w15:presenceInfo userId)');
assert(all.includes('TEXTBOX-TEXT'), 'text-box text');
assert(all.includes('HEADER-TEXT') && all.includes('FOOTER-TEXT') && all.includes('FOOTNOTE-TEXT') && all.includes('ENDNOTE-TEXT'), 'header, footer, footnote, endnote text');
assert(find('GLOSSARY-TEXT')?.kind === 'glossary', 'building-block (glossary) text');
const com = res.items.find((i) => i.kind === 'comment');
assert(com && com.author === 'Janet Kwon' && com.text.includes('COMMENT-TEXT'), `comment + author (${com?.author})`);
const chart = res.items.filter((i) => i.part === 'word/charts/chart1.xml');
assert(chart.some((i) => i.text.startsWith('CHART-TITLE')) && chart.some((i) => i.text.startsWith('CHART-SERIES')) && chart.filter((i) => i.text.startsWith('CHART-CAT')).length === 2, 'chart title (a:t), series name and both category labels (c:v)');
const nums = chart.filter((i) => i.num);
assert(nums.length === 2 && nums.every((i) => i.kind === 'chart') && nums.map((i) => i.text).join('|') === '4.4000000000000004|91234567', `chart numeric cache values flagged num (${nums.map((i) => i.text).join('|')})`);
assert(new Set(nums.map((i) => i.para)).size === 2, 'each chart value is a line of its own (never "4.4…91234567")');
assert(find('DIAGRAM-TEXT')?.kind === 'diagram' && find('DIAGRAM-DRAWING')?.kind === 'diagram', 'SmartArt text in the data model and the drawing');
assert(all.includes('PROPS-AUTHOR') && all.includes('PROPS-LASTMOD') && all.includes('PROPS-TITLE'), 'core properties (title, author, last-modified-by)');
assert(all.includes('PROPS-COMPANY') && all.includes('PROPS-MANAGER'), 'app properties (company, manager)');
assert(all.includes('CUSTOMPROP: Hifn'), 'custom properties');
const cx = res.items.filter((i) => i.kind === 'customXml');
assert(cx.length === 2 && cx.every((i) => i.part === 'customXml/item1.xml'), `custom XML data store captured whole (${cx.length} items)`);

console.log('— the walker: fail-loud inventory —');
for (const p of ['word/vbaProject.bin', 'word/media/image1.png', 'word/embeddings/Microsoft_Excel_Worksheet.xlsx', 'docProps/thumbnail.jpeg']) {
  assert(res.inventory.binaryFlagged.includes(p), `binary flagged NOT-SCANNED: ${p}`);
}
for (const p of ['[Content_Types].xml', '_rels/.rels', 'word/styles.xml', 'word/charts/_rels/chart1.xml.rels', 'word/diagrams/layout1.xml', 'word/diagrams/quickStyle1.xml', 'word/diagrams/colors1.xml', 'customXml/itemProps1.xml', 'customXml/_rels/item1.xml.rels']) {
  assert(res.inventory.structural.includes(p), `structural, no free text: ${p}`);
}
assert(res.inventory.unrecognized.length === 0, 'zero unrecognized parts (complete enumeration)', res.inventory.unrecognized.join(', '));
assert(res.inventory.invalid.length === 0 && res.complete === true, 'complete: true');
console.log(`  parts: ${res.inventory.scanned.length} scanned · ${res.inventory.structural.length} structural · ${res.inventory.binaryFlagged.length} binary-flagged · ${res.inventory.unrecognized.length} unrecognized · items ${res.items.length}`);

// ── the writer ───────────────────────────────────────────────────────────────
console.log('— the writer: bundle docxWrite.ts —');
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { build } = require('esbuild');
const tmp = fs.mkdtempSync(join(tmpdir(), 'docx-test-'));
const bundle = join(tmp, 'docx-writer.mjs');
await build({ entryPoints: [fileURLToPath(new URL('../frontend/src/lib/extract/docxWrite.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' });
const { writeRedactedDocx } = await import(pathToFileURL(bundle).href);

// the mask: a fixed table (longest first, whole words), then the frozen floor over what is left
const TABLE = [
  ['Hastings Holdings', '[Org1]'], ['Hastings', '[Org1]'], ['Intraco Corporation', '[Org2]'], ['Intraco', '[Org2]'], ['Hifn Incorporated', '[Org3]'], ['Hifn', '[Org3]'], ['Acme Bakery', '[Org4]'],
  ['Margaret Tan', '[Person1]'], ['Lim Wei Sheng', '[Person2]'], ['Nadia Rahman', '[Person3]'], ['Ravi Pillai', '[Person4]'], ['Rosa Delgado', '[Person5]'], ['Mei Ling Chua', '[Person6]'],
  ['Farah Osman', '[Person7]'], ['Kwame Mensah', '[Person8]'], ['Tomas Berglund', '[Person9]'], ['Anand Krishnan', '[Person10]'], ['Dana Whitlock', '[Person11]'], ['John Naismith', '[Person12]'],
  ['Bob Trenholm', '[Person13]'], ['Priya Nair', '[Person14]'], ['Janet Kwon', '[Person15]'], ['Opposing Counsel', '[Person16]'], ['dwesterfield', '[Person17]'],
].sort((a, b) => b[0].length - a[0].length);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function simpleMask(text) {
  const claims = [];
  for (const [name, tag] of TABLE) {
    for (const m of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${esc(name)}(?![\\p{L}\\p{N}])`, 'gu'))) {
      const s = m.index, e = s + m[0].length;
      if (claims.some((k) => s < k.e && e > k.s)) continue;
      claims.push({ s, e, tag });
    }
  }
  const floorHits = [];
  for (const [re, tag] of FLOOR_RULES) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
      const s = m.index, e = s + m[0].length;
      if (!m[0].trim() || [...claims, ...floorHits].some((k) => s < k.e && e > k.s)) continue;
      floorHits.push({ s, e, tag, exempt: false });
    }
  }
  const ivs = [...claims, ...floorHits].sort((a, b) => a.s - b.s);
  let out = '', pos = 0;
  for (const iv of ivs) { out += text.slice(pos, iv.s) + iv.tag; pos = iv.e; }
  return { text: out + text.slice(pos), placements: claims.sort((a, b) => a.s - b.s), floorHits, divergence: null };
}

const report = await writeRedactedDocx(new Uint8Array(buf), { mask: simpleMask });
assert(report.held === null && report.bytes, 'the writer produced a package (not held)', report.held ?? '');

// Everything below used to sit inside `if (report.bytes) { … }`, and that guard was the defect:
// when the writer HELD the export there were no bytes to re-walk, so 31 assert sites — 59
// executions once the dropped-parts and receipt-count loops are expanded, and among them the
// raw-bytes SECRETS sweep, the only check in this repo that reads the byte-copied
// STRUCTURAL_COPY_RE parts — simply did not execute. A held export is precisely the run whose
// output most needs checking, and it was the one run that checked nothing. So the block is now a
// function called UNCONDITIONALLY: no bytes is a named FAILURE on the line below, and the
// assertion count at the foot of the file fails a second time because the other 58 did not run
// (measured: forcing report.bytes null gives 3 FAILURES and exit 1, where it used to give 1).
// Nothing about WHAT any assertion checks changed — only whether a missing package can make them
// vanish.
function writerAssertions(report) {
  if (!report.bytes) {
    assert(false, 'the writer produced bytes, so the output assertions below could RUN', `held: ${report.held ?? '(no reason given)'} — the redacted package was never written, so the re-walk, the receipt counts and the raw-bytes SECRETS sweep were all skipped; this is a broken gate, not a smaller suite`);
    return;
  }
  // DOCX_TEST_OUT=<path> keeps the redacted package somewhere chosen (to open it in Word)
  const outPath = process.env.DOCX_TEST_OUT || join(tmp, 'fixture.redacted.docx');
  fs.writeFileSync(outPath, report.bytes);
  console.log(`  redacted package: ${outPath} (${report.bytes.length} bytes)`);
  const out = extractDocx(Buffer.from(report.bytes));
  const outFlow = flowText(out.items.filter(inMainFlow));
  const outAll = out.items.map((i) => i.text).join('\n');
  const zip = readZip(Buffer.from(report.bytes));
  const part = (n) => { const d = zip.read(n); return d ? d.toString('utf8') : null; };

  console.log('— the writer: the package reads as the masked flow —');
  assert(out.complete === true && out.inventory.unrecognized.length === 0, 'output walks completely');
  assert(outFlow.split('\n')[0] === 'SERVICE AGREEMENT between [Org1] Ltd and [Person1].', 'a name split across two runs is one tag in the first run, the rest removed', JSON.stringify(outFlow.split('\n')[0]));
  assert(outFlow.includes('The parties agree as follows. INSERTED-BY-TRACKING: notify [Org2].'), 'the deletion is gone, the insertion is plain text, the name masked', JSON.stringify(outFlow.split('\n')[1]));
  assert(outFlow.includes('Ref\tM-2026-0141\nSecond line by [Person4]'), 'tab and break survive, the name after them is masked');
  assert(outFlow.includes('TABLE-CELL: Counsel\nTABLE-CELL: [Person3]'), 'table cell masked');
  assert(outFlow.includes('Contact: Email [Person1] or our website; merge «ClientSSN»'), 'field results stay as text and are masked; the hyperlink stays as text', JSON.stringify(outFlow.split('\n').find((l) => l.startsWith('Contact'))));
  assert(outFlow.includes('CONTROL-CONTENT: [Person2]'), 'content-control content masked, control unwrapped');
  assert(outFlow.split('\n').includes('[Person7]'), 'legacy form-field result masked');
  assert((outFlow.match(/TEXTBOX-TEXT: call \[phone\]/g) || []).length === 1 && outFlow.includes(' after the box'), 'text box masked by the floor, once');
  assert(!outFlow.includes('HIDDEN-VANISH') && !outAll.includes('HIDDEN-VANISH'), 'hidden run gone');
  assert(out.items.every((i) => !i.rev && !i.hidden), 'no tracked change or hidden run anywhere in the output');
  assert(!out.items.some((i) => ['comment', 'link', 'control', 'variable', 'people', 'customXml', 'glossary', 'alt-text', 'field'].includes(i.kind)), 'no comment, link, control, variable, people, custom XML, glossary, alt-text or field item in the output', [...new Set(out.items.filter((i) => ['comment', 'link', 'control', 'variable', 'people', 'customXml', 'glossary', 'alt-text', 'field'].includes(i.kind)).map((i) => i.kind))].join(', '));
  const hdr = out.items.filter((i) => i.kind === 'header').map((i) => i.text).join(' ');
  assert(hdr.includes('HEADER-TEXT: Matter 2026-0141 · [Org1] v. [Org2]') && hdr.includes('HEADER-INS: draft reviewed by [Person9]'), 'header masked, its tracked insertion now plain', hdr);
  const ftr = out.items.filter((i) => i.kind === 'footer').map((i) => i.text).join(' ');
  assert(ftr.includes('[Org3] Inc. NRIC [nric]') && ftr.includes('copy to [Person10]'), 'footer masked by the table and the floor', ftr);
  assert(out.items.filter((i) => i.kind === 'footnote').some((i) => i.text.includes('deposition of [Person5]')) && out.items.filter((i) => i.kind === 'endnote').some((i) => i.text.includes('held by [Person7]')), 'footnote and endnote masked');
  const oc = out.items.filter((i) => i.part === 'word/charts/chart1.xml').map((i) => i.text);
  assert(oc.includes('CHART-TITLE: revenue by client — [Org2]') && oc.includes('CHART-SERIES: [Org1] revenue') && oc.includes('CHART-CAT: [Org2]') && oc.includes('CHART-CAT: [Org4]'), 'chart title, series and categories masked', oc.join(' | '));
  assert(oc.includes('4.4000000000000004') && oc.includes('0') && !oc.includes('91234567'), 'chart values: the float artefact untouched, the phone-shaped value set to 0', oc.join(' | '));
  assert(out.items.filter((i) => i.kind === 'diagram').map((i) => i.text).join(' ') === 'DIAGRAM-TEXT: [Person5] reports to [Person6] DIAGRAM-DRAWING: [Person5]', 'SmartArt text masked in both parts');
  const props = out.items.filter((i) => i.kind === 'properties').map((i) => i.text);
  assert(props.join('|') === '3|2026-09-01T09:00:00Z|2026-09-13T09:00:00Z|0|false', 'properties reduced to revision, dates and flags', props.join('|'));

  console.log('— the writer: nothing planted survives in any part —');
  const SECRETS = ['SECRET-DELETED', 'HIDDEN-VANISH', 'COMMENT-TEXT', 'TOOLTIP', 'LINK-TARGET', 'FIELD-MAILTO', 'FIELD-MERGE', 'FORMDROPDOWN', 'CONTROL-ALIAS', 'CONTROL-TAG', 'CONTROL-ITEM', 'LEGACY-ENTRY', 'DOCVAR', 'PEOPLE', 'ALTTEXT', 'GLOSSARY', 'CUSTOMXML', 'CUSTOMPROP', 'PROPS-', 'Microsoft Office Word', '91234567', 'mailto:', ...TABLE.map((t) => t[0])];
  const leaks = [];
  for (const n of zip.names) {
    if (n.endsWith('/')) continue;
    const text = zip.read(n).toString('utf8');
    for (const s of SECRETS) if (text.includes(s)) leaks.push(`${n}: ${s}`);
  }
  assert(leaks.length === 0, 'no planted string in the raw bytes of any output part', leaks.slice(0, 8).join('; '));
  for (const p of ['word/comments.xml', 'word/people.xml', 'word/glossary/document.xml', 'word/vbaProject.bin', 'word/embeddings/Microsoft_Excel_Worksheet.xlsx', 'word/media/image1.png', 'docProps/custom.xml', 'docProps/thumbnail.jpeg', 'customXml/item1.xml', 'customXml/itemProps1.xml', 'customXml/_rels/item1.xml.rels']) {
    assert(report.parts.dropped.includes(p) && !zip.names.includes(p), `dropped: ${p}`);
  }
  const ct = part('[Content_Types].xml');
  assert(ct.includes('PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"'), 'macro-enabled main part becomes a plain document');
  assert(!/people\.xml|comments\.xml|custom\.xml|itemProps1|glossary/.test(ct), 'content-type overrides of dropped parts gone');
  const rels = part('word/_rels/document.xml.rels');
  assert(!/rIdLink|rIdImg|rIdVba|rIdPeople|rIdComments|rIdGlossary|rIdCx/.test(rels) && /rIdChart|rIdHdr|rIdDgmData/.test(rels), 'relationships: external link, image, macros, people, comments, glossary, custom XML gone; chart, header, diagram kept');
  assert(!part('_rels/.rels').includes('thumbnail') && !part('_rels/.rels').includes('custom.xml'), 'package relationships: thumbnail and custom properties gone');
  assert(!part('word/charts/chart1.xml').includes('externalData') && !part('word/charts/_rels/chart1.xml.rels').includes('embeddings'), 'chart: the embedded workbook and its reference gone');
  assert(part('word/document.xml').includes('mc:Choice') && !part('word/document.xml').includes('mc:Fallback'), 'text box written once (Choice kept, Fallback dropped)');
  assert(!part('word/settings.xml').includes('docVars') && !part('word/settings.xml').includes('trackRevisions') && !part('word/settings.xml').includes('rsids'), 'settings: variables, track-changes flag and rsids gone');

  console.log('— the writer: the receipt counts —');
  const rm = report.removed;
  // insertions: body + header + footer + footnote + endnote (the glossary's is in a dropped
  // part); revisionMarks counts the DROP_TAGS set — the two comment range marks and the two
  // legacy list entries; the docVar goes with its w:docVars block (settings)
  const expect = { deletions: 1, insertionsUnwrapped: 5, hiddenRuns: 1, comments: 1, fieldsUnlinked: 3, fieldsRemoved: 0, fieldsKept: 0, hyperlinks: 1, controls: 1, images: 1, objects: 0, altTexts: 1, externalLinks: 1, revisionMarks: 4, permissions: 0, settings: 3, properties: 8, danglingRefs: 1, chartValuesZeroed: 1 };
  for (const [k, v] of Object.entries(expect)) assert(rm[k] === v, `removed.${k} = ${v}`, `got ${rm[k]}`);
  assert(report.gate.leaks.length === 0 && report.gate.parts > 0, `gate: ${report.gate.parts} parts, ${report.gate.items} items re-walked, ${report.gate.leaks.length} leaks`);
  // the gate reads every part the package carries, not the ones the walker lists: styles,
  // numbering, theme and settings shipped unread under a passing gate until 2026-09-23
  // (app/frontend/test/docx-parts.mjs holds the controls)
  const outNames = zip.names.filter((n) => !n.endsWith('/'));
  assert(report.gate.parts === outNames.length && report.gate.values > 0, `gate: read all ${outNames.length} parts of the output and ${report.gate.values} attribute values`, `${report.gate.parts} of ${outNames.length} parts`);
  const said = ['Comments and the list of people', 'Custom properties and custom XML', 'Building blocks saved inside the file', 'Embedded files were removed', 'Macros, ActiveX', 'The preview picture'];
  assert(said.every((s) => report.notes.some((n) => n.startsWith(s))), 'the receipt says in a sentence each that comments, custom properties, building blocks, embedded files, macros and the preview picture went', `missing: ${said.filter((s) => !report.notes.some((n) => n.startsWith(s))).join('; ')}`);
  // a chart's cell references name the workbook's sheets, and the workbook is removed with the
  // embedded files: the writer renames them Sheet1, Sheet2 … in first-seen order, so a warning
  // that quoted the sheet name would print unreviewed text on the receipt (it did, until
  // 2026-09-23; app/frontend/test/docx-parts.mjs law 19 holds the controls)
  const refs = part('word/charts/chart1.xml').match(/<c:f>[^<]*<\/c:f>/g) || [];
  assert(report.warnings.some((w) => /chart value\(s\) replaced by 0/.test(w)) && !report.warnings.some((w) => /worksheet/i.test(w)) && refs.length === 3 && refs.every((f) => /^<c:f>Sheet\d+!\$/.test(f)), 'warnings name the zeroed value and no sheet; the chart\'s cell references name Sheet1 …', `${report.warnings.join(' | ')} || ${refs.join(' ')}`);
  console.log('  warnings:'); report.warnings.forEach((w) => console.log('    ◆ ' + w));
}
writerAssertions(report);

// ── the mirror reads what the app reads ──────────────────────────────────────
// docx.mjs is a hand-kept copy of the app's reader (app/frontend/src/lib/extract/docx.ts), and
// the fixture above was made before equations, Office 2016 charts, a chart's drawn shapes and a
// signed macro project were read: until 2026-09-23 the mirror called chartEx and a chart's
// drawing unrecognized (complete: false) and read neither an equation nor a chartEx category,
// while the app read all four, so a CLI run disagreed with the app on the same file in silence.
// The app's reader is bundled here and both read one package built for these channels.
console.log('— the mirror: reads what the app reads —');
const appReader = join(tmp, 'docx-reader.mjs');
await build({ entryPoints: [fileURLToPath(new URL('../frontend/src/lib/extract/docx.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', outfile: appReader, logLevel: 'silent' });
const APP = await import(pathToFileURL(appReader).href);
const { writeZip } = await import(pathToFileURL(bundle).href);
{
  const enc = (s) => new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
  const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const OR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
  const mr = (t) => `<m:r><m:t xml:space="preserve">${t}</m:t></m:r>`;
  const docXml = `<w:document ${W} xmlns:v="urn:schemas-microsoft-com:vml"><w:body><w:p><w:r><w:t xml:space="preserve">Fee to </w:t></w:r><m:oMath>${mr('Kes')}${mr('trel')}</m:oMath></w:p><w:p><m:oMathPara><m:oMath>${mr('Marga')}${mr('ret Tan')}</m:oMath></m:oMathPara></w:p>`
    + `<w:p><m:oMath><m:r><w:t>Harrow</w:t></m:r>${mr('Leung')}</m:oMath></w:p><w:p><w:r><w:rPr><w:vanish w:val="off"/></w:rPr><w:t>shown as typed</w:t></w:r></w:p>`
    + `<w:p><m:oMath>${mr('Whit')}<m:box><m:e>${mr('field')}</m:e></m:box><m:sSub><m:e>${mr('x')}</m:e><m:sub>${mr('i')}</m:sub></m:sSub></m:oMath></w:p>`
    + '<w:p><w:r><w:t>Before the box</w:t></w:r><w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p><w:r><w:t>Key dates</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p><w:p><w:r><w:t>Regards</w:t></w:r></w:p><w:sectPr/></w:body></w:document>';
  const pkg = await writeZip([
    { name: '[Content_Types].xml', data: enc('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/charts/chartEx1.xml" ContentType="application/vnd.ms-office.chartex+xml"/>'
      + '<Override PartName="/word/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>') },
    { name: '_rels/.rels', data: enc(`<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${OR}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="${OR}/custom-properties" Target="docProps/custom.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: enc(`<Relationships xmlns="${PR}"><Relationship Id="rIdCx" Type="http://schemas.microsoft.com/office/2014/relationships/chartEx" Target="charts/chartEx1.xml"/></Relationships>`) },
    { name: 'word/document.xml', data: enc(docXml) },
    { name: 'word/charts/chartEx1.xml', data: enc('<cx:chartSpace xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><cx:chartData><cx:data id="0"><cx:strDim type="cat"><cx:f>Sheet1!$A$2:$A$3</cx:f><cx:lvl ptCount="2" name="Kestrel column"><cx:pt idx="0">Kestrel fees</cx:pt><cx:pt idx="1">Margaret Tan costs</cx:pt></cx:lvl></cx:strDim>'
      + '<cx:numDim type="val"><cx:f>Sheet1!$B$2:$B$3</cx:f><cx:lvl ptCount="2" formatCode="General"><cx:pt idx="0">4</cx:pt><cx:pt idx="1">5</cx:pt></cx:lvl></cx:numDim></cx:data></cx:chartData><cx:chart><cx:title><cx:tx><cx:txData><cx:v>Kestrel waterfall</cx:v></cx:txData></cx:tx></cx:title></cx:chart></cx:chartSpace>') },
    { name: 'word/charts/_rels/chartEx1.xml.rels', data: enc(`<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${OR}/chartUserShapes" Target="../drawings/drawing1.xml"/></Relationships>`) },
    { name: 'word/drawings/drawing1.xml', data: enc('<c:userShapes xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:cdr="http://schemas.openxmlformats.org/drawingml/2006/chartDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><cdr:relSizeAnchor><cdr:from><cdr:x>0.1</cdr:x><cdr:y>0.1</cdr:y></cdr:from><cdr:to><cdr:x>0.3</cdr:x><cdr:y>0.2</cdr:y></cdr:to><cdr:sp macro="" textlink=""><cdr:nvSpPr><cdr:cNvPr id="2" name="TextBox 1"/><cdr:cNvSpPr txBox="1"/></cdr:nvSpPr><cdr:spPr/><cdr:txBody><a:bodyPr/><a:p><a:r><a:t>Note by Margaret Tan</a:t></a:r></a:p></cdr:txBody></cdr:sp></cdr:relSizeAnchor></c:userShapes>') },
    { name: 'word/drawings/_rels/drawing1.xml.rels', data: enc(`<Relationships xmlns="${PR}"/>`) },
    { name: 'word/vbaProjectSignature.bin', data: new TextEncoder().encode('\u0000CN=Kestrel Holdings\u0000') },
    { name: 'docProps/custom.xml', data: enc('<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Client"><vt:lpwstr>Kestrel</vt:lpwstr></property><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="Partner"><vt:lpwstr>Margaret Tan</vt:lpwstr></property></Properties>') },
  ]);
  const mine = extractDocx(Buffer.from(pkg));
  const app = await APP.extractDocx(pkg);
  const inv = (x) => JSON.stringify(Object.fromEntries(Object.entries(x.inventory).map(([k, v]) => [k, [...v].sort()])));
  assert(inv(mine) === inv(app) && mine.complete === app.complete, 'the mirror\'s inventory is the app\'s, part for part', `mirror ${inv(mine)} complete ${mine.complete} · app ${inv(app)} complete ${app.complete}`);
  // each part as the app lays it out (flowText joins a part's items by paragraph and gap), so a
  // difference in where a paragraph or a gap falls shows here as well as a difference in text
  const byPart = (x, ft) => JSON.stringify([...new Set(x.items.map((i) => i.part))].sort().map((p) => [p, ft(x.items.filter((i) => i.part === p))]));
  assert(byPart(mine, flowText) === byPart(app, APP.flowText), 'the mirror reads every part as the app does, text, paragraphs and gaps', `mirror ${byPart(mine, flowText)} · app ${byPart(app, APP.flowText)}`);
  const eq = mine.items.filter((i) => i.part === 'word/document.xml').map((i) => i.text);
  assert(['Kes', 'trel', 'Marga', 'ret Tan'].every((t) => eq.includes(t)), 'an equation\'s runs (m:t) are read', JSON.stringify(eq));
  // w:vanish w:val="off" is ST_OnOff false: the run is shown, and reading it hidden dropped
  // "not " from "does not consent" in the copy (W5-1, 2026-09-23)
  const shown = (x) => x.items.find((i) => i.text === 'shown as typed');
  assert(!!shown(mine) && !shown(mine).hidden && !!shown(app) && !shown(app).hidden, 'a run whose w:vanish is "off" is read as shown, by the mirror and the app alike', JSON.stringify([shown(mine), shown(app)].map((i) => i && [i.text, !!i.hidden])));
  // a chartEx level's name is the data column's name the chart prints (W5-7)
  const col = (x) => x.items.some((i) => i.part === 'word/charts/chartEx1.xml' && i.attr === 'name' && i.text === 'Kestrel column');
  assert(col(mine) && col(app), 'an Office 2016 chart\'s data column name (cx:lvl @name) is read, by the mirror and the app alike', JSON.stringify(mine.items.filter((i) => i.attr).map((i) => [i.part, i.attr, i.text])));
  const cxi = mine.items.filter((i) => i.part === 'word/charts/chartEx1.xml');
  const cxt = cxi.filter((i) => !i.num).map((i) => i.text);
  assert(['Kestrel fees', 'Margaret Tan costs', 'Kestrel waterfall'].every((t) => cxt.includes(t)) && cxi.filter((i) => i.num).map((i) => i.text).join() === '4,5',
    'an Office 2016 chart\'s categories (cx:pt) and title (cx:v) are read as text, its values (cx:numDim) as chart values', JSON.stringify(cxi.map((i) => [i.text, !!i.num])));
  assert(mine.inventory.scanned.includes('word/drawings/drawing1.xml') && mine.items.some((i) => i.part === 'word/drawings/drawing1.xml' && i.text === 'Note by Margaret Tan'), 'a text box drawn on a chart (word/drawings/drawing1.xml) is read', JSON.stringify(mine.inventory.scanned));
  assert(mine.inventory.binaryFlagged.includes('word/vbaProjectSignature.bin'), 'a macro project\'s signature is listed as a part not read as text', JSON.stringify(mine.inventory.binaryFlagged));
  const props = flowText(mine.items.filter((i) => i.part === 'docProps/custom.xml'));
  assert(props.split('\n').includes('Kestrel') && props.split('\n').includes('Margaret Tan'), 'two custom property values are two values, not "KestrelMargaret Tan"', JSON.stringify(props));
  assert(mine.complete === true && mine.inventory.unrecognized.length === 0, 'the mirror reads the package completely', JSON.stringify(mine.inventory.unrecognized));
  // Word's paragraph number: a text box's own paragraph is not counted, and a run in one is the
  // paragraph it is anchored in (INT-22 — a block in a sidebar named "paragraph 3", the "Regards")
  const wp = (x) => JSON.stringify(['Before the box', 'Key dates', 'Regards'].map((t) => { const i = x.items.find((k) => k.text === t); return i && [t, i.wp, !!i.inBox]; }));
  const wpWant = JSON.stringify([['Before the box', 6, false], ['Key dates', 6, true], ['Regards', 7, false]]);
  assert(wp(mine) === wpWant && wp(app) === wpWant, 'Word\'s paragraph number skips a text box\'s paragraphs and flags the run inside one, by the mirror and the app alike', `mirror ${wp(mine)} · app ${wp(app)} · want ${wpWant}`);
  // An equation's zones: a box prints its argument in line ("Whit" + a boxed "field" is one word
  // on the page), a subscript prints apart (x with subscript i is not "xi") — INT-9, W4-F5
  const zones = (walk) => { const seen = new Map(); return JSON.stringify(walk(docXml).items.filter((i) => i.math).map((i) => [i.text, seen.get(i.math) ?? seen.set(i.math, seen.size).get(i.math)])); };
  const zm = zones(walkPart), za = zones(APP.walkPart);
  const zz = JSON.parse(zm);
  const zoneOf = (t) => zz.find(([x]) => x === t)?.[1];
  assert(zm === za && zoneOf('Whit') === zoneOf('field') && zoneOf('x') === zoneOf('field') && zoneOf('i') !== zoneOf('x'), 'an equation\'s box reads in line with the text beside it and a subscript apart from its base, by the mirror and the app alike', `mirror ${zm} · app ${za}`);
  // A phantom Word does not show (m:show off) is flagged so the writer reads past it: "Kes" +
  // a hidden "zz" + "trel" is "Kestrel" on the page, and read as "Keszztrel" it shipped (W5R-7)
  const phXml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p><m:oMath><m:r><m:t>Kes</m:t></m:r><m:phant><m:phantPr><m:show m:val="0"/></m:phantPr><m:e><m:r><m:t>zz</m:t></m:r></m:e></m:phant><m:phant><m:e><m:r><m:t>yy</m:t></m:r></m:e></m:phant><m:r><m:t>trel</m:t></m:r></m:oMath></w:p></w:body></w:document>';
  const ph = (walk) => JSON.stringify(walk(phXml).items.map((i) => [i.text, !!i.unshown]));
  const phm = ph(walkPart), pha = ph(APP.walkPart);
  assert(phm === pha && phm === JSON.stringify([['Kes', false], ['zz', true], ['yy', false], ['trel', false]]), 'a phantom that does not show is flagged and one that shows is not, by the mirror and the app alike', `mirror ${phm} · app ${pha}`);
}
// A part named to look like one of Word's own is not one of them: the list is anchored to the
// names Word writes (INT-19), at both ends (W5R-8, W-FID-7: word/styles.xml.bak and
// word/charts/_rels/notes.xml were listed as Word's own), so the Review warns on it as the
// writer's note already did
{
  const enc = (s) => new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
  const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const lookalikes = ['word/stylesX.xml', 'word/theme/extra1.xml', 'word/numbering2.xml', 'word/fontTableX.xml',
    'word/styles.xml.bak', 'word/settings.xml.old', 'word/theme/theme1.xml.orig', 'word/styles.xmlold.xml', '_rels/notes.xml',
    'word/charts/_rels/notes.xml', 'word/drawings/_rels/notes.xml', 'customXml/_rels/item1.xml.rels.txt'];
  const own = ['word/styles.xml', 'word/theme/theme1.xml', 'word/numbering.xml', 'word/fontTable.xml', 'word/charts/_rels/chart1.xml.rels', 'customXml/_rels/item1.xml.rels'];
  // the list as it stood, open at its end: each lookalike past Word's own name was Word's own
  const { STRUCTURAL_RE } = await import('./docx.mjs');
  const open = new RegExp(STRUCTURAL_RE.source.replace(/\)\$$/, ')').replace(/\[\^\/\]\*\\\.rels/g, ''));
  assert(STRUCTURAL_RE.source === APP.STRUCTURAL_RE.source && lookalikes.slice(4).every((n) => open.test(n)) && !lookalikes.slice(4).some((n) => STRUCTURAL_RE.test(n)),
    'CONTROL: the mirror\'s list is the app\'s, and open at its end it takes word/styles.xml.bak, word/theme/theme1.xml.orig and word/charts/_rels/notes.xml for Word\'s own', `open ${lookalikes.slice(4).filter((n) => !open.test(n))} · anchored ${lookalikes.slice(4).filter((n) => STRUCTURAL_RE.test(n))}`);
  const pkg = await writeZip([
    { name: '[Content_Types].xml', data: enc('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: enc(`<Relationships xmlns="${PR}"/>`) },
    { name: 'word/document.xml', data: enc('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>') },
    ...[...lookalikes, ...own].map((name) => ({ name, data: enc('<x/>') })),
  ]);
  const mine = extractDocx(Buffer.from(pkg));
  const app = await APP.extractDocx(pkg);
  const got = (x) => JSON.stringify([lookalikes.filter((n) => x.inventory.unrecognized.includes(n)), own.filter((n) => x.inventory.structural.includes(n))]);
  const want = JSON.stringify([lookalikes, own]);
  assert(got(mine) === want && got(app) === want, 'a part named like Word\'s own (word/stylesX.xml, word/theme/extra1.xml) is unrecognized, and Word\'s own are structural, by the mirror and the app alike', `mirror ${got(mine)} · app ${got(app)}`);
}
// The mirror with one line of its own rewritten, bundled apart: the CONTROL that shows an
// assertion below reads the line it is about, not an input that would pass without it
const mirrorWith = async (from, to, label) => {
  const file = fileURLToPath(new URL('./docx.mjs', import.meta.url));
  const s = fs.readFileSync(file, 'utf8');
  if (!s.includes(from)) throw new Error(`CONTROL anchor not found in docx.mjs: ${from}`);
  const out = join(tmp, `mirror-${label}.mjs`);
  await build({ entryPoints: [file], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent',
    plugins: [{ name: 'cut', setup(b) { b.onLoad({ filter: /extract[\\/]docx\.mjs$/ }, () => ({ contents: s.split(from).join(to), loader: 'js' })); } }] });
  return import(pathToFileURL(out).href);
};
// A character put in with Insert > Symbol is a w:sym, not a w:t: until 2026-09-24 the reader
// dropped it, so a letter or digit written that way left the name or number it belongs to
// unread ("Margaret T" + a symbol "a" + "n" read "Margaret Tn", which no row matches). One that
// ends its paragraph, or the part, has no run after it to carry it and is read out there. A
// symbol font's picture (a Wingdings box, a Symbol bullet) is no character and reads as nothing.
{
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const sym = (font, ch) => `<w:r><w:sym w:font="${font}" w:char="${ch}"/></w:r>`;
  const t = (x) => `<w:r><w:t xml:space="preserve">${x}</w:t></w:r>`;
  const xml = `<w:document ${W}><w:body><w:p>${t('Signed by Margaret T')}${sym('Arial', '0061')}${t('n, tel 212555')}${sym('Symbol', 'F030')}${t('147.')}</w:p>`
    + `<w:p>${t('Client: Margaret Ta')}${sym('Arial', '006E')}</w:p><w:p>${sym('Wingdings', 'F0FE')}${t('Agreed')}${sym('Symbol', 'F0B7')}</w:p><w:p>${t('Ref 61234')}${sym('Arial', '0035')}</w:p></w:body></w:document>`;
  const read = (walk, ft) => ft(walk(xml).items);
  const want = 'Signed by Margaret Tan, tel 2125550147.\nClient: Margaret Tan\nAgreed\nRef 612345';
  const mine = read(walkPart, flowText), app = read(APP.walkPart, APP.flowText);
  assert(mine === want && app === want, 'a letter and a digit put in as a symbol (w:sym) are read into the name and the number they belong to, at a paragraph\'s end and the part\'s too, and a Wingdings box and a Symbol bullet read as nothing, by the mirror and the app alike', JSON.stringify({ mine, app, want }));
  const cut = await mirrorWith("const ch = symText(String(attrs['w:font'] ?? ''), String(attrs['w:char'] ?? ''));", "const ch = '';", 'sym');
  const off = read(cut.walkPart, cut.flowText);
  assert(off === 'Signed by Margaret Tn, tel 212555147.\nClient: Margaret Ta\nAgreed\nRef 61234', 'CONTROL: with the mirror reading no w:sym it reads "Margaret Tn", "212555147", "Margaret Ta" and "61234"', JSON.stringify(off));
  const kept = await mirrorWith('  if (!it || !state.pending.trim()) return;', '  return;', 'symend');
  const lost = read(kept.walkPart, kept.flowText);
  assert(lost === 'Signed by Margaret Tan, tel 2125550147.\nClient: Margaret Ta\nAgreed\nRef 61234', 'CONTROL: with the mirror not reading a symbol out at its paragraph\'s end it loses the last letter and the last digit', JSON.stringify(lost));
}
// A symbol is read in the flow it is drawn in: one in a tracked deletion is deleted text, one
// beside a deletion is live text. Until 2026-09-24 a deleted "a" between "Margaret T" and "an"
// read "Margaret Taan" in the live text, and a live "2" before a deletion left "Ref 61345" (the
// app holds the .docx on any such symbol; the reading is what the review and the .txt see). One
// that ends a text box's paragraph, a comment's, or the tree the writer walks again is read out
// there, as at a paragraph's end; the block above reaches none of those three lines. A symbol's
// item carries its own run's revision, not an earlier symbol's in the paragraph: the "A" was
// inserted by a reviewer, the "n" was not.
{
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml"';
  const sym = (ch) => `<w:r><w:sym w:font="Arial" w:char="${ch}"/></w:r>`;
  const t = (x) => `<w:r><w:t xml:space="preserve">${x}</w:t></w:r>`;
  const del = (x) => `<w:del w:id="9" w:author="A" w:date="2026-01-01T00:00:00Z">${x}</w:del>`;
  const ins = (x) => `<w:ins w:id="8" w:author="A" w:date="2026-01-01T00:00:00Z">${x}</w:ins>`;
  const xml = `<w:document ${W}><w:body><w:p>${t('Client: Margaret T')}${del(sym('0061'))}${t('an signed.')}</w:p>`
    + `<w:p>${t('Ref 61')}${sym('0032')}${del('<w:r><w:delText>zz</w:delText></w:r>')}${t('345')}</w:p><w:p>${t('Owner: Margaret T')}${del(sym('0058'))}${sym('0061')}${t('n')}</w:p>`
    + `<w:p>${ins(sym('0041'))}${t('gent: Margaret Ta')}${sym('006E')}</w:p>`
    + `<w:p>${t('Before the box')}<w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p>${t('Contact Margaret Ta')}${sym('006E')}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p><w:p>${t('Ref 71234')}${sym('0035')}</w:p></w:body></w:document>`;
  const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const OR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const u8 = (s) => new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
  const pkg = await writeZip([
    { name: '[Content_Types].xml', data: u8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>') },
    { name: '_rels/.rels', data: u8(`<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${OR}/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: u8(`<Relationships xmlns="${PR}"><Relationship Id="rId2" Type="${OR}/comments" Target="comments.xml"/></Relationships>`) },
    { name: 'word/document.xml', data: u8(`<w:document ${W}><w:body><w:p>${t('Agreed')}</w:p></w:body></w:document>`) },
    { name: 'word/comments.xml', data: u8(`<w:comments ${W}><w:comment w:id="0" w:author="Reviewer"><w:p>${t('Ask Margaret Ta')}${sym('006E')}</w:p></w:comment></w:comments>`) },
  ]);
  // the live text, the deleted text, the live text of the tree walked again, the comment, and the
  // text of any item that carries an insertion's mark
  const read = (M, x) => { const { items, tree } = M.walkPart(xml); const again = M.walkTree(tree); return JSON.stringify([M.flowText(items.filter((i) => i.rev !== 'del')), M.flowText(items.filter((i) => i.rev === 'del')), M.flowText(again.filter((i) => i.rev !== 'del')), x.items.filter((i) => i.kind === 'comment').map((i) => i.text), items.filter((i) => i.rev === 'ins').map((i) => i.text)]); };
  const live = 'Client: Margaret Tan signed.\nRef 612345\nOwner: Margaret Tan\nAgent: Margaret Tan\nBefore the box\nContact Margaret Tan\nRef 712345';
  const want = JSON.stringify([live, 'a\nzz\nX', live, ['Ask Margaret Tan'], []]);
  const mine = read({ walkPart, walkTree, flowText }, extractDocx(Buffer.from(pkg))), app = read(APP, await APP.extractDocx(pkg));
  assert(mine === want && app === want, 'a symbol in a tracked deletion is read as deleted and one beside a deletion as live, and one ending a text box\'s paragraph, a comment\'s and the tree walked again is read out there, and a symbol\'s item carries its own run\'s mark, by the mirror and the app alike', `mirror ${mine} · app ${app}`);
  const CUTS = [
    ['item', "        if (state.sym && (state.sym.rev === 'del') !== (item.rev === 'del')) symEnd(state, out);\n", 'Client: Margaret Taan signed.'],
    ['sym', "        if (ch && state.sym && (state.sym.rev === 'del') !== (ctx.flags.rev === 'del')) symEnd(state, out);\n", 'Owner: Margaret Tn'],
    ['box', '        walk(kids, next, out, state);\n        symEnd(state, out);\n        state.para = outer;', 'Contact Margaret Ta\\n'],
    ['tree', '  symEnd(state, items);\n  return items;', 'Ref 71234"'],
    ['comment', '        symEnd(state, texts);\n', '["Ask Margaret Ta"]'],
    ['stale', "if (state.pending) { item.pre = state.pending; takePending(state, item.rev); state.sym = undefined; }", '["n"]'],
  ];
  const blind = [];
  for (const [label, line, shows] of CUTS) {
    const to = label === 'box' ? line.replace('        symEnd(state, out);\n', '') : label === 'tree' ? '  return items;' : label === 'stale' ? line.replace(' state.sym = undefined;', '') : '';
    const m = await mirrorWith(line, to, `flow-${label}`);
    const got = read(m, m.extractDocx(Buffer.from(pkg)));
    if (!got.includes(shows)) blind.push(`${label}: ${got}`);
  }
  assert(!blind.length, 'CONTROL: with each of those six lines taken out of the mirror, its reading goes wrong where that line reads ("Margaret Taan", "Margaret Tn", the box\'s "Margaret Ta", the tree\'s "71234", the comment\'s "Margaret Ta", an insertion\'s mark on the "n")', blind.join(' | '));
}
// A space or a tab the live text wrote before a tracked deletion stays in the live text. Given to
// the deletion alone, "Paid Margaret Tan" + " " + a deleted "within 30 days" + an inserted
// "promptly" read "Paid Margaret Tanpromptly", which no row matches at a word's edge, and the .txt
// shipped the name under a plan that said verified (W7F-1): a deleted symbol, a deleted run after
// a space run, and one after a tab.
{
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const t = (x) => `<w:r><w:t xml:space="preserve">${x}</w:t></w:r>`;
  const del = (x) => `<w:del w:id="9" w:author="A" w:date="2026-01-01T00:00:00Z">${x}</w:del>`;
  const ins = (x) => `<w:ins w:id="8" w:author="A" w:date="2026-01-01T00:00:00Z">${x}</w:ins>`;
  const dt = (x) => `<w:r><w:delText xml:space="preserve">${x}</w:delText></w:r>`;
  const xml = `<w:document ${W}><w:body><w:p>${t('Paid Margaret Tan')}${t(' ')}${del('<w:r><w:sym w:font="Arial" w:char="00A7"/></w:r>')}${t('and Lee.')}</w:p>`
    + `<w:p>${t('Paid Margaret Tan')}${t(' ')}${del(dt('within 30 days'))}${ins(t('promptly'))}${t('.')}</w:p>`
    + `<w:p>${t('Client:')}${t('Margaret Tan')}<w:r><w:tab/></w:r>${del(dt('old'))}${t('and Lee.')}</w:p></w:body></w:document>`;
  const read = (M) => { const { items } = M.walkPart(xml); return JSON.stringify([M.flowText(items.filter((i) => i.rev !== 'del')), M.flowText(items.filter((i) => i.rev === 'del'))]); };
  const want = JSON.stringify(['Paid Margaret Tan and Lee.\nPaid Margaret Tan promptly.\nClient:Margaret Tan\tand Lee.', ' §\n within 30 days\n\told']);
  const mine = read({ walkPart, flowText }), app = read(APP);
  assert(mine === want && app === want, 'a space run or a tab before a tracked deletion (a symbol, a run, a run an insertion replaces) stays in the live text, by the mirror and the app alike', `mirror ${mine} · app ${app}`);
  const m = await mirrorWith("  if (rev === 'del') { state.pending = state.live ?? ''; return; }", "  if (rev === 'del') { state.pending = ''; return; }", 'live');
  const off = read(m);
  assert(off.startsWith(JSON.stringify(['Paid Margaret Tanand Lee.\nPaid Margaret Tanpromptly.\nClient:Margaret Tanand Lee.']).slice(0, -1)), 'CONTROL: with the deletion taking the live text\'s space and tab, the mirror reads "Margaret Tanand", "Margaret Tanpromptly" and "Margaret Tanand"', off);
}
// A part written in UTF-16 is refused as a malformed one is, since this reader reads UTF-8 only;
// but Word reads it, so the warning says which it is (W-FID-ENC-UTF16, 2026-09-24): "Malformed
// XML" sent the lawyer looking for damage in a file Word opens. One with a byte-order mark
// (UTF-16LE), one without (UTF-16BE, found by the zero byte beside "<"), and a part that is
// malformed in UTF-8, which keeps its word.
{
  const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const u8 = (s) => new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
  const le = (s) => new Uint8Array(Buffer.from(`﻿<?xml version="1.0" encoding="UTF-16"?>${s}`, 'utf16le'));
  const be = (s) => { const b = Buffer.from(`<?xml version="1.0" encoding="UTF-16"?>${s}`, 'utf16le'); for (let i = 0; i < b.length; i += 2) [b[i], b[i + 1]] = [b[i + 1], b[i]]; return new Uint8Array(b); };
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const pkg = await writeZip([
    { name: '[Content_Types].xml', data: u8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: u8(`<Relationships xmlns="${PR}"/>`) },
    { name: 'word/document.xml', data: le(`<w:document ${W}><w:body><w:p><w:r><w:t>Margaret Tan</w:t></w:r></w:p></w:body></w:document>`) },
    { name: 'word/footer1.xml', data: be(`<w:ftr ${W}><w:p><w:r><w:t>Kestrel</w:t></w:r></w:p></w:ftr>`) },
    { name: 'word/header1.xml', data: u8(`<w:hdr ${W}><w:p><w:r><w:t>Kestrel</w:t></w:r></w:p>`) },
  ]);
  const wide = (p) => `Written in UTF-16, which Word reads and this app does not — part refused, not read: ${p}`;
  const want = JSON.stringify([wide('word/document.xml'), wide('word/footer1.xml'), 'Malformed XML — part refused, not read: word/header1.xml'].sort());
  const said = (x) => JSON.stringify(x.warnings.filter((w) => /part refused/.test(w)).sort());
  const mine = extractDocx(Buffer.from(pkg)), app = await APP.extractDocx(pkg);
  assert(said(mine) === want && said(app) === want && !mine.complete && !app.complete, 'a part written in UTF-16, with a byte-order mark or without, is refused and named as UTF-16, and a malformed part as malformed, by the mirror and the app alike', `mirror ${said(mine)} · app ${said(app)}`);
  const cut = await mirrorWith('        if (utf16Part(data)) wide.add(name);\n', '', 'utf16');
  const off = said(cut.extractDocx(Buffer.from(pkg)));
  assert(off === JSON.stringify(['word/document.xml', 'word/footer1.xml', 'word/header1.xml'].map((p) => `Malformed XML — part refused, not read: ${p}`)), 'CONTROL: with the mirror\'s UTF-16 line taken out, each of the three parts is called malformed', off);
}

// ── the gate on the gate ─────────────────────────────────────────────────────
// Measured, not guessed: `node test.mjs | grep -cE '^  (✔|✘ FAIL) '` prints 146 on a green run in
// this tree (2026-09-24: 121, the 10 of the mirror's parity with the app's reader, its 5 on
// Word's paragraph number, an equation's zones, a phantom that does not show, the anchored part
// list and its CONTROL, its 5 on a symbol character and a part in UTF-16 with their CONTROLs,
// and its 2 on a symbol beside a tracked deletion, in a text box, a comment and a tree walked
// again, with their CONTROL, and its 2 on a space or a tab before a tracked deletion, with its
// CONTROL), and one
// of those lines is the assert below, which is itself an assertion — it is snapshotted out of
// the number it checks, so the pin is 145. Do not "fix" 145 to 146 to match what the command
// prints: the pin counts the assertions this suite makes about the walker and the writer, not
// the one that counts them, and setting it to 146 fails immediately (ranTotal is 145). EXACT
// equality, never `>= MIN`: a
// floor passes when an assertion is deleted, commented out or guarded away, which is the whole
// defect this file just fixed. Adding an assertion is supposed to fail here once — raise the
// number in the same commit, deliberately, so the count stays a statement about what this suite
// covers rather than a number that drifts.
const EXPECTED_ASSERTIONS = 145;
const ranTotal = ran; // snapshot first: the assert below would otherwise count itself
assert(ranTotal === EXPECTED_ASSERTIONS, `all ${EXPECTED_ASSERTIONS} assertions ran (${ranTotal})`, ranTotal < EXPECTED_ASSERTIONS
  ? `${ranTotal} of ${EXPECTED_ASSERTIONS} assertions ran — ${EXPECTED_ASSERTIONS - ranTotal} were SKIPPED, not failed. A run that stops asserting is a broken gate, not a smaller suite; find what stopped executing before reading any ✔ above as evidence.`
  : `${ranTotal} assertions ran where ${EXPECTED_ASSERTIONS} were expected — if you added ${ranTotal - EXPECTED_ASSERTIONS}, raise EXPECTED_ASSERTIONS in this same commit.`);

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log(`\nALL GREEN — ${ranTotal} assertions ran: the walker lists every planted hiding spot and the writer clears every one of them.`);
