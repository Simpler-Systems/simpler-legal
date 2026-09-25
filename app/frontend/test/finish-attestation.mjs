// FINISH ATTESTATION — finishing a review is the lawyer's attestation over the export as it
// stood when they pressed it, and nothing after the press may leave readable what they saw
// masked while the file still says "finished by you".
// Run from app/frontend:   node test/finish-attestation.mjs
//
// Follows test/review-honesty.mjs: esbuild the REAL modules (src/lib/attest.ts, undo.ts,
// engine.ts, review.ts, and the .docx walker and writer) and drive what the app calls. App.tsx
// is a React component with no test runner behind it, so its wiring is checked from its source.
//
// Round-2 review findings, both MAJOR, both fail-open:
//   C3-1  ONE undo stack for every file. U on file B's review popped file A's last change:
//         a name added by hand to A, a file already finished, was withdrawn; A exported it
//         readable with verification green, because it was no longer a listed span.
//   C3-2  a Settings practice change after finishing dropped the SSN rule's rows: an SSN the
//         lawyer saw masked went out readable under "finished by you", and its row had left
//         the table, so Export's survivor checks could not see it.
//   and the round-1 hand-off: a file stayed finished whatever changed in it afterwards.
// Round-3 findings against the fix:
//   E-M1  the record measured the document of record only. A .docx's headers, footers and
//         footnotes are not in it, and an SSN in a running header, a surname in a letterhead,
//         a codename masked by the always-redact list went out readable in the saved .docx
//         under "finished by you" (a practice switch, a row left visible, the list emptied).
//   E-M2  the word count parsed tags by shape and required a digit: the frozen service writes
//         [Date], [Code], [Dem], [X], so "Redact again" took the finish off and the screen said
//         "Date" had been left readable.
//   E-paths-2..4  an extend's undo put back a whole-table snapshot (review-honesty.mjs holds
//         that one); the note kept naming a text the lawyer had since masked again; a phone
//         number was quoted as "415) 555-0173".
//   E-M3  a practice change ran two remasks per finished file where one would do.
// Round-4 findings against that:
//   E3-1  the body of the saved .docx is masked with docxMaskTable's table, not the review
//         table. "Mrs Margaret Tan" added to the always-redact list after finishing won the
//         overlap with the row "Tan Wei Ling", which lost its whole placement: the saved body
//         said "[Protected2] Wei Ling attended" under "finished by you", while the text export
//         the record measured still said [Person1].
//   E3-3  four one-line breaks of attest.ts passed every check here: the word count taken
//         out, compared by presence, blind to a tag the export wrote at finish and no longer
//         writes, a changed text ignored.
//   E-M1, what remained: the record read three texts outside a .docx's flows — watermarks,
//         kept field codes, chart sheet names. A term the always-redact list masked in a
//         style's name, a list's number text, a caption label, a font or theme name, a
//         chart's trendline or number format shipped readable once the list was emptied.
// Round-5 findings against that:
//   P2-M1, P2-PATHS-1  every flow was measured as the file was read at the drop — the body as
//         the document of record, a header as the walker read it — and the writer masks each
//         one after removing hidden runs and the results of the fields it removes, so the
//         stretches either side touch. "Mrs Margaret [hidden note] Tan Wei Ling": a list term,
//         or the same name added by hand after finishing, won the overlap with "Tan Wei Ling" in
//         the writer's flow only, and the saved body said "[Protected2] Wei Ling attended" under
//         a finish that stood. A codename split by a hidden run, and a DOCPROPERTY result between
//         two words of a firm's name, the same.
//   P2-PATHS-3  a DOCPROPERTY result the writer removes from a header was named as readable
//         there once the list was emptied: a finish taken off for a name the saved header never
//         carried.
//   P2-PATHS-4  a term taken off the list and a practice switched in one visit to Settings were
//         measured together, and the note blamed the practice switch.
//   P2-M2  the saved body was remasked on every table write while the list named a body row
//         (+283 ms a write at 67.7k words).
//   P2-M3  eight one-line breaks of attest.ts's comparator passed every check here.
//
// The laws, and what each one costs when it breaks:
//
//   1. A CHANGE IS JUDGED BY WHAT THE EXPORT LEAVES READABLE, NEVER BY ITS KIND. Anything
//      readable now that was masked at finish takes the finish off; a change that only
//      masks more leaves it standing — whatever the tags look like. Measured two ways: the
//      words in the bytes, counted, and the places in the original the masks sat.
//      Cost: guessed from the kind of action, adding a row reads as safe — and a longer row
//      that overlaps a shorter one unmasks the shorter one's tail. Too strict the other way,
//      and Export's own "Mask it in this document" button sends the lawyer back to Review.
//
//   2. THE FINISH COMES OFF, SAYS WHY, AND COMES BACK ONLY BY FINISHING AGAIN. The baseline
//      is the export at finish — never re-based on a later state — and the Review screen's
//      note names the cause and what is readable, quoted as it stands in the document, and
//      stays true of the table on screen while the finish is off.
//      Cost: the receipt says "finished by you" over bytes the lawyer never saw.
//
//   3. A .DOCX IS MEASURED IN EVERY PART THE WRITER MASKS, AS THE WRITER MASKS IT, AND EVERY
//      TEXT IT SAVES OUTSIDE THEM, under the table the writer is handed, and held to what the
//      real writer saves.
//      Cost: E-M1 — a client identifier in a running header, a style's name or a font name
//      ships readable, unseen; E3-1 — a name the lawyer saw masked ships in the saved body;
//      P2-M1 — the same across a hidden note the lawyer never saw.
//
//   4. AN UNDO REACHES ONLY THE FILE ON SCREEN, AND IS NEVER SILENT.
//      Cost: C3-1 — a client's name readable in a finished file, and nothing said so.
//
//   5. APP.TSX ROUTES EVERY TABLE WRITE, EVERY PRACTICE CHANGE, EVERY CHANGE TO THE
//      ALWAYS-REDACT LIST AND EVERY FINISH THROUGH THE HELPERS, and the cost of the recheck
//      on a 60k-word document is measured.
//      Cost: one path that skips recheckFinish is C3-2 again.
//
// Every law is followed by a CONTROL that runs the same check on the broken version —
// recreated code or recreated behaviour, never a string typed to fail — and asserts the
// check catches it. Exit 1 on any FAIL.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const src = (...p) => join(here, '..', 'src', ...p);
const dir = mkdtempSync(join(tmpdir(), 'finish-attestation-'));
const url = (p) => 'file:///' + p.replace(/\\/g, '/');
const out = {};
for (const [name, entry] of [['engine', ['lib', 'engine.ts']], ['attest', ['lib', 'attest.ts']], ['undo', ['lib', 'undo.ts']], ['review', ['lib', 'review.ts']],
  ['docxWrite', ['lib', 'extract', 'docxWrite.ts']], ['docx', ['lib', 'extract', 'docx.ts']]]) {
  out[name] = join(dir, `${name}.mjs`);
  await build({ entryPoints: [src(...entry)], bundle: true, platform: 'node', format: 'esm', outfile: out[name], logLevel: 'silent' });
}

// the engine bundle touches window/localStorage on import (tauri.ts inTauri, the settings)
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { remask, syncFloorRows, withProtectedTerms, protectedEntities, mapLegalOutcome, exportPlan, spanMatches, occurrencesOutside, docxMaskTable, isFloorRow } = await import(url(out.engine));
const {
  finishRecord, exposedSince, finishFile, recheckFinish, reopenNote, readableWords, exportOf, withFloorRows, docxMarks, finishHold,
} = await import(url(out.attest));
const { pushUndo, takeUndo, dropFile, undoneNote, NOTHING_TO_UNDO, ALREADY_UNDONE, UNDO_CAP } = await import(url(out.undo));
const { decideRows, restoreRows, withdrawRow, receiptReviewLine, widenRow, mintHandKey } = await import(url(out.review));
const { writeZip, writeRedactedDocx, savedFlowText } = await import(url(out.docxWrite));
const { extractDocx, flowText, inMainFlow, readZip, walkPart } = await import(url(out.docx));
const core = await import(url(join(here, '..', '..', '..', 'lib-core', 'anonymize.mjs')));
/** attest.ts with one line as it would be broken, bundled apart, for a CONTROL to run the same
 *  check on — or, given [from, to] pairs, the few lines one behaviour spans. `engine` pairs
 *  break engine.ts inside the same bundle, for a CONTROL that recreates the engine as it was,
 *  and `writer` pairs docxWrite.ts, for one that recreates the writer. Throws when a line is
 *  no longer in the source, so a CONTROL can never pass by testing nothing. */
let mutants = 0;
async function attestWith(from, to, engine = [], writer = []) {
  return bundleWith(src('lib', 'attest.ts'), Array.isArray(from) ? from : [[from, to]], engine, writer);
}
/** engine.ts with `engine` pairs applied: exportPlan as the engine was, for the writer to save with */
const engineWith = (engine) => bundleWith(src('lib', 'engine.ts'), [], engine);
/** docxWrite.ts with `writer` pairs applied: the writer as it was, to save with */
const writerWith = (writer) => bundleWith(src('lib', 'extract', 'docxWrite.ts'), [], [], writer);
/** The engine and the writer as they were before each placed a listed name run together
 *  (engine.ts placements, THE RUN-TOGETHER RULE; docxWrite placeFlow's last pass): where either
 *  now places what a line of the record exists to follow, that line is a second reading of its
 *  case, and its CONTROL is held to the case in this world, where the line is the only one. */
const PRE_RUN_ENGINE = [['  if (names.length) {\n    const walls', '  if (false) {\n    const walls']];
const PRE_RUN_WRITER = [['  if (!names.length) return res;\n  const last = flowLayout(', '  return res;\n  const last = flowLayout(']];
async function bundleWith(entry, pairs, engine, writer = []) {
  const file = join(dir, `mutant-${++mutants}.mjs`);
  const plugin = { name: 'mutant', setup(b) {
    b.onLoad({ filter: /[\\/](attest|engine|docxWrite)\.ts$/ }, (a) => {
      const name = /engine\.ts$/.test(a.path) ? 'engine.ts' : /docxWrite\.ts$/.test(a.path) ? 'docxWrite.ts' : 'attest.ts';
      let c = readFileSync(a.path, 'utf8').replace(/\r\n/g, '\n');
      for (const [x, y] of name === 'engine.ts' ? engine : name === 'docxWrite.ts' ? writer : pairs) {
        if (!c.includes(x)) throw new Error(`CONTROL anchor not found in ${name}: ${x.slice(0, 80)}`);
        c = c.replace(x, y);
      }
      return { contents: c, loader: 'ts', resolveDir: join(a.path, '..') };
    });
  } };
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: file, logLevel: 'error', plugins: [plugin] });
  return import(url(file));
}
/** engine.ts placements as it was until 2026-09-23: a longer row that overlaps a shorter one
 *  took the shorter row's whole match, and its other words shipped readable */
const OLD_OVERLAP = [['if (!over.length) { claimed.push({ s, e, tag: row.tag }); continue; }', 'if (!over.length) { claimed.push({ s, e, tag: row.tag }); continue; } continue;']];
/** docxWrite.ts as it was until 2026-09-23 (INT-1): placeFlow stripped the flow of its hidden
 *  runs and removed fields' results first and masked what was left — "John " + hidden
 *  "Michael " + "Smith" was masked as "John Smith", which no row names — and the gate had no
 *  backstop against the record (recordBackstop), so it saved that copy */
const OLD_WRITER = [['const masked = pass(record, pieces);', "const masked = '';"], ['  recordBackstop(saved, records, mask, clean, leaks);\n', '']];

let pass = 0, fail = 0;
const check = (ok, what, detail = '') => { console.log((ok ? '  PASS  ' : '  FAIL  ') + what + (detail ? '\n          ' + detail : '')); ok ? pass++ : fail++; };

/** an engine row; ADDRESS is a class propagateProperPrefixes leaves alone, so each row masks
 *  exactly its own span and the cases below read as written */
const row = (key, text, tag, extra = {}) => ({ key, text, tag, cat: 'loc', cls: 'ADDRESS', prov: 'one pass', occ: 1, status: 'confirmed', ...extra });
const person = (key, text, tag, extra = {}) => ({ key, text, tag, cat: 'person', cls: 'PERSON', prov: 'both passes', occ: 1, status: 'confirmed', ...extra });
const hand = (key, text, tag) => ({ key, text, tag, cat: 'person', prov: 'added by you', occ: 1, status: 'confirmed', decided: true });
const bytes = (text, rows, practice = 'sg') => remask(text, rows, practice).text;
/** a file as the app holds it, table synced to the floor as App.withFloor does */
const fileOf = (id, text, rows, practice = 'sg', extra = {}) => ({ id, name: `${id}.txt`, badge: 'TXT', state: 'ready', sizeLabel: '1 KB', statusLabel: 'Read', text, entities: syncFloorRows(text, rows, practice), ...extra });
/** App.withFloor, as it now runs */
const withFloor = (f, practice) => (f.text && f.entities ? { ...f, entities: withFloorRows(f.text, f.entities, practice) } : f);
/** a text export's record and measure, for the cases that have no file around them */
const recOf = (text, rows, p) => finishRecord({ text, entities: rows }, p, []);
const exposedOf = (rec, text, rows, p) => exposedSince(rec, { text, entities: rows }, p, []);
/** the texts a note quotes, each with where it says the text is (null: the document itself) */
const quotes = (note) => [...(note ?? '').matchAll(/“([^”]*)”(?: \(in ([^)]+)\))?/g)].map((m) => ({ text: m[1], where: m[2] ?? null }));
const balanced = (s) => [['(', ')'], ['[', ']'], ['{', '}']].every(([a, b]) => s.split(a).length === s.split(b).length);

// ── LAW 1: judged by what the export leaves readable ──
console.log('\n— law 1: a change is judged by what the export leaves readable —');
const CASES = [];
{
  const T1 = 'Alice Kowalczyk instructed us. Later Bob Nowak called about the claim.';
  const t1 = [hand('u1', 'Alice Kowalczyk', '[Person1]'), person('e1', 'Bob Nowak', '[Person2]')];
  CASES.push(['withdrawing a name added by hand (the C3-1 undo)', T1, t1, withdrawRow(t1, t1[0]), 'sg', 'sg', 'expose', 'remove']);
  CASES.push(['leaving an engine row visible', T1, t1, decideRows(t1, ['e1'], { dead: true, status: 'ignored' }), 'sg', 'sg', 'expose', 'decide']);

  const T2 = 'The parties agree that Force Majeure applies. Margaret Tan signed.';
  const junk = { ...row('j1', 'Force Majeure', '[Term1]'), cat: 'term', junk: true, status: 'pending', dead: true };
  const t2 = [junk, person('p1', 'Margaret Tan', '[Person1]')];
  const confirmed = decideRows(t2, ['j1'], { dead: false, status: 'confirmed' });
  CASES.push(['undoing the confirm of a boilerplate row, after finishing with it masked', T2, confirmed, restoreRows(confirmed, [junk]), 'sg', 'sg', 'expose', 'undo']);

  const T3 = 'Lim Bo Seng Holdings Pte signed. Lim Bo left.';
  const t3 = [row('a', 'Seng Holdings Pte', '[Company1]')];
  CASES.push(['adding a longer row that overlaps a shorter one (the shorter row keeps its other words, engine.ts placements)', T3, t3, [...t3, hand('u1', 'Lim Bo Seng Holdings', '[Company2]')], 'sg', 'sg', 'stand', 'add']);

  const T4 = 'Claimant SSN 123-45-6789, tel +65 6438 2210, email jo@example.com.';
  const us = syncFloorRows(T4, [], 'us');
  CASES.push(['a practice change from United States to Singapore (C3-2)', T4, us, syncFloorRows(T4, us, 'sg'), 'us', 'sg', 'expose', 'practice']);

  const T5 = 'Kestrel Holdings agreed. Margaret Tan signed for the buyer.';
  const t5 = [person('p1', 'Margaret Tan', '[Person1]')];
  CASES.push(['Export’s “Mask it in this document” (withProtectedTerms over a late term)', T5, t5, withProtectedTerms(T5, t5, ['Kestrel']), 'sg', 'sg', 'stand', 'add']);

  const T6 = 'Margaret Tan met Tan and Wei Sheng at noon.';
  const t6 = [person('m', 'Margaret Tan', '[Person1]'), person('t', 'Tan', '[Person2]'), person('w', 'Wei Sheng', '[Person3]')];
  CASES.push(['folding a row into another tag (same as…)', T6, t6, decideRows(t6, ['t'], { tag: '[Person1]', dead: false, status: 'confirmed' }), 'sg', 'sg', 'stand', 'decide']);
  CASES.push(['unfolding a row to a tag of its own', T6, t6, decideRows(t6, ['w'], { tag: '[Person9]' }), 'sg', 'sg', 'stand', 'decide']);

  const pend = person('s', 'Wei Sheng', '[Person3]', { prov: 'second sweep', status: 'pending' });
  const t7 = [person('m', 'Margaret Tan', '[Person1]'), pend];
  const decided = decideRows(t7, ['s'], { dead: false, status: 'confirmed' });
  CASES.push(['undoing a confirm that puts a masked name back in the queue (a pending name stays masked)', T6, decided, restoreRows(decided, [pend]), 'sg', 'sg', 'stand', 'undo']);
  const left = decideRows(t7, ['s'], { dead: true, status: 'ignored' });
  CASES.push(['redacting again a name left visible before finishing', T6, left, decideRows(left, ['s'], { dead: false, status: 'confirmed' }), 'sg', 'sg', 'stand', 'decide']);
  CASES.push(['adding a name by hand', T1, t1, [...t1, hand('u2', 'Later', '[Person3]')], 'sg', 'sg', 'stand', 'add']);
  const sg = syncFloorRows(T4, [], 'sg');
  CASES.push(['a practice change from Singapore to United States (adds the SSN rule)', T4, sg, syncFloorRows(T4, sg, 'us'), 'sg', 'us', 'stand', 'practice']);
}
const measured = CASES.map(([label, text, was, now, p0, p1, want, kind]) => {
  const x = exposedOf(recOf(text, was, p0), text, now, p1);
  return { label, want, kind, x, got: x ? 'expose' : 'stand', before: bytes(text, was, p0), after: bytes(text, now, p1) };
});
for (const m of measured) {
  check(m.got === m.want, `${m.want === 'expose' ? 'takes the finish off' : 'leaves the finish standing'}: ${m.label}`,
    `${m.before}\n          ${m.after}${m.x ? `\n          readable again: ${JSON.stringify(m.x.spans)} · words ${JSON.stringify(m.x.words)}` : ''}`);
}
{
  const ssn = measured.find((m) => m.kind === 'practice' && m.want === 'expose');
  check(ssn.x?.spans.join() === '123-45-6789' && ssn.after.includes('123-45-6789'),
    'the SSN is named as the text left readable, as it stands in the original', JSON.stringify(ssn.x));

  // CONTROL: the rule guessed from the kind of change — additions, decisions and practice
  // changes that add a rule are safe; removals, visible-leaves and undos are not. Under the
  // overlap rule as it was until 2026-09-23 (engine.ts placements dropped the shorter row's
  // whole match), adding the longer row shipped "Pte": the measurement takes that finish off,
  // and the guess reads an addition as safe. Today it only reopens finishes over nothing.
  const guess = (m) => (m.kind === 'remove' || m.kind === 'undo' || (m.kind === 'decide' && /visible/.test(m.label)) || (m.kind === 'practice' && /to Singapore/.test(m.label)) ? 'expose' : 'stand');
  const wrong = measured.filter((m) => guess(m) !== m.want);
  const OLD = await attestWith([], null, OLD_OVERLAP);
  const [label3, text3, was3, now3] = CASES.find((c) => c[0].startsWith('adding a longer row'));
  const x3 = OLD.exposedSince(OLD.finishRecord({ text: text3, entities: was3 }, 'sg', []), { text: text3, entities: now3 }, 'sg', []);
  check(guess({ kind: 'add', label: label3 }) === 'stand' && x3?.spans.join() === 'Pte' && OLD.exportOf(text3, now3, 'sg').text.includes('Pte signed')
    && wrong.every((m) => m.want === 'stand'),
    'CONTROL: under the overlap rule as it was, adding a longer row ships "Pte" — the measurement takes the finish off, the guess from the kind of change reads it as safe; and every guess it gets wrong today reopens a finish over nothing',
    [`old rule: ${OLD.exportOf(text3, now3, 'sg').text} · ${JSON.stringify(x3)}`, ...wrong.map((m) => `${m.label}: guessed ${guess(m)}, measured ${m.want}`)].join('\n          '));

  // CONTROL: the word count alone misses a change that unmasks one occurrence while masking
  // another; the offsets catch it. The lawyer leaves the row that masks the last "Pte" readable
  // and redacts the one that masks the first.
  const T = 'Pte Lim Bo Seng Holdings Pte';
  const both = [row('a', 'Seng Holdings Pte', '[Company1]'), row('b', 'Pte Lim Bo Seng Holdings', '[Company2]', { dead: true, status: 'ignored' })];
  const was = both;
  const now = decideRows(decideRows(both, ['b'], { dead: false, status: 'confirmed' }), ['a'], { dead: true, status: 'ignored' });
  const x = exposedOf(recOf(T, was, 'sg'), T, now, 'sg');
  check(!!x && x.words.length === 0 && x.spans.join() === 'Pte',
    'CONTROL: a swap — the last "Pte" unmasked, the first masked — leaves every word count where it was; only the places the masks sat catch it',
    `${bytes(T, was)}  →  ${bytes(T, now)} · ${JSON.stringify(x)}`);
}

// The other half: the words the bytes carry, counted. It is the ONLY measure when remask's
// accounting diverged from the frozen core, because the offsets are then empty rather than
// true — and a run of more than 256 adjacent claims of one tag diverges (collapseAdjacentTags
// folds pairs for eight passes; the placement merge folds them all). The lawyer can finish
// while Export holds on that; a later change that clears the hold — re-tagging the run so it
// no longer merges — then exports whatever the finish no longer covers. Until 2026-09-23 no
// check here failed with the count taken out, compared by presence, blind to a tag the export
// wrote at finish and no longer writes, or ignoring a changed text: each CONTROL below bundles
// attest.ts with that one line and runs the same check on it.
console.log('\n— law 1, where the offsets cannot be trusted: the word count —');
{
  const RUN = 'Kim '.repeat(300);
  const kim = row('k', 'Kim', '[Person1]');
  const why = 'A change made after you finished';
  /** a table write as App.updateEntities makes it, through the attest module given */
  const write = (A, f, fn) => A.recheckFinish(f, { ...f, entities: A.withFloorRows(f.text, fn(f.entities), 'sg') }, 'sg', [], why);
  const keyed = (es, k) => es.find((e) => e.key === k);
  const W = [
    { label: 'a name withdrawn, the only place it stood', mutant: 'no-words', text: RUN + 'Anna Kowalczyk signed the consent.',
      rows: [kim, row('a', 'Anna Kowalczyk', '[Person2]')], steps: [(es) => withdrawRow(es, keyed(es, 'a'))], names: 'Anna,Kowalczyk' },
    { label: 'a name withdrawn whose words stand readable elsewhere ("Later Anna and Kowalczyk met")', mutant: 'presence-not-count', text: RUN + 'Anna Kowalczyk signed. Later Anna and Kowalczyk met.',
      rows: [kim, row('a', 'Anna Kowalczyk', '[Person2]')], steps: [(es) => withdrawRow(es, keyed(es, 'a'))], names: 'Anna,Kowalczyk' },
    { label: 'the service\'s [X] re-tagged [Date], then the party "X" withdrawn: [X] is a tag the export wrote at finish and no longer writes', mutant: 'tags-now-only', text: RUN + 'Party X met the tribunal on 12 May 2019.',
      rows: [kim, row('x', 'X', '[Person2]'), row('d', '12 May 2019', '[X]')], steps: [(es) => decideRows(es, ['d'], { tag: '[Date]' }), (es) => withdrawRow(es, keyed(es, 'x'))], names: 'X' },
  ];
  const MUTANT = {
    'no-words': ['for (const [w, n] of readableWords(now.bytes, tags)) if ((before.get(w) ?? 0) < n) words.push(w);', ''],
    'presence-not-count': ['if ((before.get(w) ?? 0) < n) words.push(w);', 'if (!before.has(w)) words.push(w);'],
    'tags-now-only': ['const tags = new Set([...was.tags, ...now.tags]);', 'const tags = new Set([...now.tags]);'],
    'textchanged-ignored': ["if ((f.text ?? '') !== rec.body.text) return TEXT_CHANGED;", ''],
  };
  const A0 = { recheckFinish, withFloorRows, finishFile, exposedSince };
  /** finish, run the steps, and clear the hold: the run re-tagged [Initials], which does not merge */
  const play = (A, w) => {
    let f = A.finishFile(fileOf('W', w.text, w.rows), 'sg', []);
    const held = remask(w.text, f.entities, 'sg').divergence;
    for (const s of w.steps) f = write(A, f, s);
    const cleared = write(A, f, (es) => decideRows(es, ['k'], { tag: '[Initials]' }));
    return { held, f, cleared, out: remask(w.text, cleared.entities, 'sg') };
  };
  for (const w of W) {
    const r = play(A0, w);
    const q = quotes(r.f.reopened).map((x) => x.text).join();
    check(!!r.held && r.f.reviewed === false && q === w.names,
      `takes the finish off where the offsets are empty: ${w.label}`, `export held at finish: ${r.held}\n          ${r.f.reopened}`);
    const m = play(await attestWith(...MUTANT[w.mutant]), w);
    check(m.f.reviewed === true && m.cleared.reviewed === true && !m.out.divergence && w.names.split(',').every((n) => m.out.text.includes(n)),
      `CONTROL (${w.mutant}): the finish stands, the re-tag clears the hold, and the export carries ${w.names.split(',').map((n) => `"${n}"`).join(' and ')} under "finished by you" — the check catches it`,
      m.out.text.slice(-70));
  }

  // a changed text is exposure by definition: the offsets mean nothing over another text
  const T0 = 'Margaret Tan signed. Bob Nowak witnessed.', T1 = 'Margaret Tan signed.';
  const ts = [row('m', 'Margaret Tan', '[Person1]'), row('b', 'Bob Nowak', '[Person2]')];
  const shrink = (A) => { const f = A.finishFile(fileOf('C', T0, ts), 'sg', []); return A.recheckFinish(f, { ...f, text: T1 }, 'sg', [], why); };
  const c = shrink(A0);
  check(c.reviewed === false && /changed the text this review was finished over/.test(c.reopened ?? ''),
    'a text that changes under the same table takes the finish off, and says the text changed', c.reopened);
  check(shrink(await attestWith(...MUTANT['textchanged-ignored'])).reviewed === true,
    'CONTROL (textchanged-ignored): measured by offsets over a text shorter by a sentence, nothing reads as unmasked and the finish stands over a text the lawyer never finished — the check catches it');
}

// Three lines of the comparator that no check here broke until 2026-09-23 (P2-M3). Each case is
// the one its line exists for, judged by the export before and after; each CONTROL bundles
// attest.ts with that one line broken and runs the same case.
console.log('\n— law 1, the comparator line by line —');
{
  const why = 'A change made after you finished';
  const play = (A, text, was, fn) => {
    const f = A.finishFile(fileOf('L', text, was), 'sg', []);
    return A.recheckFinish(f, { ...f, entities: A.withFloorRows(text, fn(f.entities), 'sg') }, 'sg', [], why);
  };
  const A0 = { finishFile, recheckFinish, withFloorRows };
  const said = (g) => (g.reviewed ? 'finish stands' : g.reopened);

  // the lawyer swaps which form of one number is left visible: every word count stays where it
  // was, and only the places the masks sat — the floor's hits among them — show "6438 2210"
  // readable where it was masked
  const TP = 'Call 6438 2210 today, or 6438-2210 after hours.';
  const fl = syncFloorRows(TP, [], 'sg');
  const k1 = fl.find((e) => e.text === '6438 2210')?.key, k2 = fl.find((e) => e.text === '6438-2210')?.key;
  const swap = (es) => decideRows(decideRows(es, [k2], { dead: false, status: 'confirmed' }), [k1], { dead: true, status: 'ignored' });
  const pw = decideRows(fl, [k2], { dead: true, status: 'ignored' });
  const p0 = play(A0, TP, pw, swap);
  check(!!k1 && !!k2 && p0.reviewed === false && quotes(p0.reopened).map((q) => q.text).join() === '6438 2210',
    'takes the finish off: the number left visible swapped for its other form — the words are the same, the one masked at finish is readable', `${bytes(TP, pw)} → ${bytes(TP, swap(pw))}\n          ${said(p0)}`);
  const pm = play(await attestWith('if (!h.exempt && h.s >= 0 && h.e > h.s) rs.push([h.s, h.e]);', 'if (h.s >= 0 && h.e > h.s) rs.push([h.s, h.e]);'), TP, pw, swap);
  check(pm.reviewed === true, 'CONTROL (hidden-with-exempt): counting the form left visible at finish as masked, the swap leaves the finish standing while the export shows "6438 2210" — the check catches it', said(pm));

  // the middle of a masked name unmasked while the same word is masked elsewhere: only the gap
  // between two masks that still cover the name's ends is readable
  const TB = 'Lim Bo Seng signed. Bo left.';
  const bw = [row('a', 'Lim Bo Seng', '[Person1]')];
  const split = (es) => [...es.filter((e) => e.key !== 'a'), row('l', 'Lim', '[Person1]'), row('s', 'Seng', '[Person1]'), row('bl', 'Bo left', '[Person2]')];
  const b0 = play(A0, TB, bw, split);
  check(b0.reviewed === false && quotes(b0.reopened).map((q) => q.text).join() === 'Bo',
    'takes the finish off: "Bo" unmasked inside "Lim Bo Seng" while the other "Bo" is masked', `${bytes(TB, bw)} → ${bytes(TB, split(bw))}\n          ${said(b0)}`);
  const bm = play(await attestWith('if (now[k][0] > s) out.push([s, now[k][0]]);', ''), TB, bw, split);
  check(bm.reviewed === true, 'CONTROL (uncovered-no-gap): without the gap between two masks, the finish stands while the export shows "[Person1] Bo [Person1]" — the check catches it', said(bm));

  // a name masked in two pieces of one tag, one piece re-tagged: the export goes from
  // "[Person1] signed." to "[Person1] [Person2] signed." — only a space is newly readable, and
  // a note would quote nothing
  const TM = 'Lim Bo Seng signed.';
  const mw = [row('a', 'Lim', '[Person1]'), row('b', 'Bo Seng', '[Person1]')];
  const retag = (es) => decideRows(es, ['b'], { tag: '[Person2]' });
  const m0 = play(A0, TM, mw, retag);
  check(m0.reviewed === true, 'leaves the finish standing: a merged run of one tag split by re-tagging a piece', `${bytes(TM, mw)} → ${bytes(TM, retag(mw))}\n          ${said(m0)}`);
  const mm = play(await attestWith('if (HAS_WORD.test(t) && !out.includes(t)) out.push(t);', 'if (!out.includes(t)) out.push(t);'), TM, mw, retag);
  check(mm.reviewed === false && quotes(mm.reopened).some((q) => !q.text.trim()),
    'CONTROL (spans-no-hasword): counting the space between the two tags as a readable text, the finish comes off and the note quotes “” — the check catches it', said(mm));
}

// The frozen legal service's tags carry no number: [Date], [Code], [Amount], [Dem], [Place],
// [X] (lib-legal/legal-rails.mjs, serve-legal.mjs `tag || '[X]'`), and mapLegalOutcome puts
// them in the table as they come. A change that masks more under them must leave the finish.
console.log('\n— law 1, under the frozen service\'s own tags —');
{
  const TEXT = 'On 12 May 2019 Anna Kowalczyk filed application 1520/06 before the tribunal. The hearing on 3 June 2019 was adjourned; the claim is for SGD 250,000.';
  const svc = (span, cls, tag) => ({ span, cls, src: 'legal-pipeline', tag });
  const o = mapLegalOutcome(TEXT, { genre: 'courts', engine: 'v1-legal-frozen', final: '', alignOk: true,
    rows: [svc('12 May 2019', 'DETAIL', '[Date]'), svc('3 June 2019', 'DETAIL', '[Date]'), svc('Anna Kowalczyk', 'PERSON', '[Person1]'), svc('1520/06', 'ID', '[Code]'), svc('SGD 250,000', 'DETAIL', '[Amount]')] });
  const T = o.doc;
  const base = syncFloorRows(T, o.entities, 'sg');
  const key = (text) => base.find((e) => e.text === text).key;
  check(['[Date]', '[Code]', '[Amount]'].every((t) => base.some((e) => e.tag === t)), 'setup: the table carries the service\'s digitless tags as mapLegalOutcome hands them over',
    base.map((e) => `${e.text}=${e.tag}`).join(' · '));
  const leave = (es, text) => decideRows(es, [key(text)], { dead: true, status: 'ignored' });
  const redact = (es, text) => decideRows(es, [key(text)], { dead: false, status: 'confirmed' });
  const T2 = 'Matter HC-1520 was filed. Our letter on HC‑1520 followed.'; // the second has a U+2011 hyphen
  const o2 = mapLegalOutcome(T2, { genre: 'product', engine: 'v1-legal-frozen', final: '', alignOk: true, rows: [svc('HC-1520', 'ID', '[Code]')] });
  const SVC = [
    ['Review’s Redact again on a [Date] row left visible before finishing', T, leave(base, '3 June 2019'), (es) => redact(es, '3 June 2019'), 'stand'],
    ['Export’s “Mask it in this document” on a [Code] row left visible', T, leave(base, '1520/06'), (es) => withProtectedTerms(T, es, ['1520/06']), 'stand'],
    ['Export’s “Mask them in every form” on a [Code] term the row misses in one form', o2.doc, syncFloorRows(o2.doc, o2.entities, 'sg'), (es) => withProtectedTerms(o2.doc, es, ['HC-1520']), 'stand'],
    ['re-tagging a [Date] row [Dem]', T, base, (es) => decideRows(es, [key('12 May 2019')], { tag: '[Dem]' }), 'stand'],
    ['re-tagging an [Amount] row [X]', T, base, (es) => decideRows(es, [key('SGD 250,000')], { tag: '[X]' }), 'stand'],
    ['leaving a [Date] row visible after finishing', T, base, (es) => leave(es, '12 May 2019'), 'expose'],
  ];
  const runs = SVC.map(([label, text, was, fn, want]) => {
    const f = finishFile(fileOf('S', text, was), 'sg', []);
    const g = recheckFinish(f, withFloor({ ...f, entities: fn(f.entities) }, 'sg'), 'sg', [], 'A change made after you finished');
    return { label, want, g, before: bytes(text, f.entities), after: bytes(text, g.entities) };
  });
  for (const r of runs) {
    check((r.g.reviewed === true) === (r.want === 'stand'), `${r.want === 'stand' ? 'leaves the finish standing' : 'takes the finish off'}: ${r.label}`,
      `${r.before}\n          ${r.after}${r.g.reopened ? `\n          ${r.g.reopened}` : ''}`);
  }
  const off = runs.find((r) => r.want === 'expose').g;
  check(quotes(off.reopened).map((q) => q.text).join() === '12 May 2019', 'the note names the date, not the word "Date"', off.reopened);

  // CONTROL: the counter as it shipped — tags recognised by a pattern that wants a digit —
  // counts each new [Date] as the readable word "Date"
  const SHIPPED_TAG = /\[[A-Za-z]+-?\d+\]|\[(?:email|nric|card|phone|number|ssn|ein|nino|nhs)\]/g;
  const shippedWords = (b) => { const m = new Map(); for (const w of b.replace(SHIPPED_TAG, ' ').match(/[\p{L}\p{N}]+/gu) ?? []) m.set(w, (m.get(w) ?? 0) + 1); return m; };
  const risen = (count, a, b) => { const o0 = count(a); return [...count(b)].filter(([w, n]) => (o0.get(w) ?? 0) < n).map(([w]) => w); };
  const again = runs[0], tags = new Set([...again.g.entities, ...base].map((e) => e.tag));
  const was = risen(shippedWords, again.before, again.after), now = risen((b) => readableWords(b, tags), again.before, again.after);
  check(was.join() === 'Date' && now.length === 0,
    'CONTROL: the shipped counter reads Redact again as "Date" become readable — the false reopen — and the counter that strips the tags the export writes reads nothing',
    `shipped: ${JSON.stringify(was)} · now: ${JSON.stringify(now)}`);
  const lit = readableWords('Filed [Date] and [sic] on [Date1].', new Set(['[Date]']));
  check(!lit.has('Date') && lit.get('sic') === 1 && lit.get('Date1') === 1,
    'only the tags the export can write are taken out: a bracketed word the table never wrote is counted as the text it is');
}

// ── LAW 2: the finish comes off, says why, and comes back only by finishing again ──
console.log('\n— law 2: the finish, the recheck and the note —');
{
  const T = 'Alice Kowalczyk instructed us. Later Bob Nowak called about the claim.';
  const a = fileOf('A', T, [hand('u1', 'Alice Kowalczyk', '[Person1]'), person('e1', 'Bob Nowak', '[Person2]')]);
  const emptied = { ...a, entities: [] };
  check(recheckFinish(a, emptied, 'sg', [], 'x') === emptied && emptied.reopened === undefined,
    'a file that was never finished passes through untouched, whatever the change');

  const fin = finishFile(a, 'sg', []);
  check(fin.reviewed === true && !!fin.finish && fin.reopened === undefined, 'finishing sets the flag and records what it covers');

  const masked = withFloor({ ...fin, entities: [...fin.entities, hand('u2', 'Later', '[Person3]')] }, 'sg');
  const kept = recheckFinish(fin, masked, 'sg', [], 'A change made after you finished');
  check(kept === masked && kept.reviewed === true && kept.finish === fin.finish,
    'a change that masks more keeps the finish — and the record stays the one made at finish, not the new state');

  const back = withFloor({ ...kept, entities: withdrawRow(kept.entities, hand('u2', 'Later', '[Person3]')) }, 'sg');
  check(recheckFinish(kept, back, 'sg', [], 'Your undo').reviewed === true,
    'undoing that addition returns to exactly what was finished, and the finish stands');

  const gone = withFloor({ ...kept, entities: withdrawRow(kept.entities, kept.entities[0]) }, 'sg');
  const off = recheckFinish(kept, gone, 'sg', [], 'Your undo');
  check(off.reviewed === false && off.finish === undefined && typeof off.reopened === 'string',
    'withdrawing the name that was masked at finish takes the finish off and drops its record');
  const noteOk = (s) => /^Your undo left “Alice Kowalczyk” readable in the export, and it was masked when you finished\. Export holds this document until you finish again\.$/.test(s ?? '');
  check(noteOk(off.reopened), 'the note says what did it, names the text, and says the way through', off.reopened);
  check(receiptReviewLine(off.entities, !!off.reviewed).startsWith('review: NOT finished'),
    'the receipt that file would print says NOT finished', receiptReviewLine(off.entities, !!off.reviewed));

  // The note is measured again on every later write while the finish is off, so it is true
  // of the table on screen. The finish itself comes back only by finishing again.
  /** every text the note quotes as readable in the document is readable in its export now */
  const noteTrue = (f) => quotes(f.reopened).every((q) => q.where !== null || bytes(f.text, f.entities).includes(q.text.replace(/…$/, '')));
  const redacted = withFloor({ ...off, entities: [...off.entities, hand('u1', 'Alice Kowalczyk', '[Person1]')] }, 'sg');
  const r1 = recheckFinish(off, redacted, 'sg', [], 'A change made after you finished');
  check(r1.reviewed === false && noteTrue(r1) && /^Your undo took your finish off\. Nothing masked when you finished is readable as the table stands now\. Export holds this document until you finish again\.$/.test(r1.reopened ?? ''),
    'Alice masked again after the reopen: the note stops naming her and says nothing masked at finish is readable now — the finish stays off', r1.reopened);
  const bob = withFloor({ ...r1, entities: decideRows(r1.entities, ['e1'], { dead: true, status: 'ignored' }) }, 'sg');
  const r2 = recheckFinish(r1, bob, 'sg', [], 'A change made after you finished');
  check(r2.reviewed === false && noteTrue(r2) && /As the table stands now, “Bob Nowak” would be readable in the export, and it was masked when you finished\./.test(r2.reopened ?? ''),
    'a later change that leaves something else readable is named, measured against the same finish', r2.reopened);
  check(r2.reopen === off.reopen && recheckFinish(r2, r2, 'sg', [], 'x') === r2,
    'the reopen stays the one that took the finish off (App keys its toast on it), and a write that changes nothing changes no note');
  // CONTROL: the note as it shipped, fixed at the reopen (`if (!before.reviewed) return after`)
  const fixed = (b, f, ...rest) => (!b.reviewed ? f : recheckFinish(b, f, ...rest));
  const c1 = fixed(off, redacted, 'sg', [], 'A change made after you finished');
  check(!noteTrue(c1) && /“Alice Kowalczyk” readable/.test(c1.reopened ?? '') && bytes(T, c1.entities).startsWith('[Person1]'),
    'CONTROL: the note fixed at the reopen still says “Alice Kowalczyk” is readable beside an export that masks her — the truth check catches it',
    `${c1.reopened}\n          ${bytes(T, c1.entities)}`);

  const again = finishFile(r2, 'sg', []);
  check(again.reviewed === true && again.reopened === undefined && again.reopen === undefined && !!again.finish, 'finishing again restores the finish and clears the note and its reopen');
  const relived = withFloor({ ...again, entities: decideRows(again.entities, ['e1'], { dead: true, status: 'ignored' }) }, 'sg');
  check(relived.entities !== again.entities && recheckFinish(again, relived, 'sg', [], 'x').reviewed === true,
    'and the new finish covers the table as it now stands: Bob Nowak, readable when the lawyer finished again, is measured and stands');

  const noRecord = recheckFinish({ ...fin, finish: undefined }, masked, 'sg', [], 'A change made after you finished');
  check(noRecord.reviewed === false && /no record of it was kept/.test(noRecord.reopened ?? ''),
    'a finished file with no record of what was finished fails closed on its next change, and says why', noRecord.reopened);

  // many things readable at once: three named and a count, never a wall of text
  const many = reopenNote('Switching the practice to Singapore', { spans: ['a', 'b', 'c', 'd', 'e'], words: [], parts: [], textChanged: false });
  check(/left “a”, “b”, “c” and 2 more readable in the export, and they were masked when you finished/.test(many), 'five things readable: three named and "and 2 more"', many);
  const long = reopenNote('Your undo', { spans: ['x'.repeat(200)], words: [], parts: [], textChanged: false });
  check(long.length < 260 && long.includes('…'), 'a long span is cut in the note, not printed whole', `${long.length} chars`);

  // C3-2 end to end, as App.onPracticeChange now runs it: finished under United States, the
  // practice switched to Singapore
  const TS = 'Claimant SSN 123-45-6789, tel +65 6438 2210, email jo@example.com.';
  const finUs = finishFile(fileOf('S', TS, [], 'us'), 'us', []);
  const now = recheckFinish(finUs, withFloor(finUs, 'sg'), 'sg', [], 'Switching the practice to Singapore');
  check(now.reviewed === false && /“123-45-6789” readable/.test(now.reopened ?? '') && bytes(TS, now.entities, 'sg').includes('123-45-6789'),
    'C3-2: the SSN readable after the practice change takes the finish off, and the note names it', now.reopened);
  // CONTROL: onPracticeChange as it shipped — fs.map(withFloor), `reviewed` untouched
  const shipped = { ...finUs, entities: syncFloorRows(TS, finUs.entities, 'sg') };
  check(shipped.reviewed === true && bytes(TS, shipped.entities, 'sg').includes('123-45-6789')
    && receiptReviewLine(shipped.entities, !!shipped.reviewed).startsWith('review: finished by you'),
    'CONTROL: the shipped practice path leaves the SSN readable under "finished by you" — the recheck is what catches it',
    receiptReviewLine(shipped.entities, !!shipped.reviewed));
  const finSg = finishFile(fileOf('S', TS, [], 'sg'), 'sg', []);
  check(recheckFinish(finSg, withFloor(finSg, 'us'), 'us', [], 'x').reviewed === true,
    'the other direction — Singapore to United States adds the SSN rule — only masks more, and the finish stands');
}

// Every practice pair against an oracle that does not use attest.ts: an identifier masked
// under the practice at finish and readable under the new one must take the finish off, and
// the note quotes it as it stands in the document.
{
  const IDS = ['123-45-6789', '12-3456789', 'AB 12 34 56 C', '943 476 5919', '(415) 555-0173', '07700 900123', '+65 6438 2210', 'S1234567D', 'jo@example.com'];
  const T = `SSN ${IDS[0]}, EIN ${IDS[1]}, NINO ${IDS[2]}, NHS ${IDS[3]}, US tel ${IDS[4]}, UK mob ${IDS[5]}, SG tel ${IDS[6]}, NRIC ${IDS[7]}, mail ${IDS[8]}. Margaret Tan signed.`;
  const rows = [person('m', 'Margaret Tan', '[Person1]')];
  const lines = [], bad = [], quoted = [];
  for (const p0 of ['sg', 'us', 'uk']) for (const p1 of ['sg', 'us', 'uk']) {
    if (p0 === p1) continue;
    const f0 = finishFile(fileOf('F', T, rows, p0), p0, []);
    const g = recheckFinish(f0, withFloor(f0, p1), p1, [], `Switching the practice to ${p1}`);
    const b0 = bytes(T, f0.entities, p0), b1 = bytes(T, g.entities, p1);
    const exposed = IDS.filter((s) => !b0.includes(s) && b1.includes(s));
    const q = quotes(g.reopened).map((x) => x.text);
    quoted.push(...q);
    const named = exposed.length <= 3 ? exposed.every((s) => q.includes(s)) : q.length === 3;
    if ((exposed.length > 0) !== (g.reviewed === false) || !named) bad.push(`${p0}→${p1}`);
    lines.push(`${p0}→${p1}: ${exposed.length ? exposed.join(', ') : 'nothing'} readable · ${g.reviewed ? 'finish stands' : `note quotes ${q.join(' | ')}`}`);
  }
  check(bad.length === 0, 'every practice pair takes the finish off exactly when the oracle finds an identifier made readable, and the note names it', lines.join('\n          '));
  check(quoted.includes('(415) 555-0173') && quoted.every((s) => T.includes(s) && balanced(s)),
    'every text a note quotes stands in the document as quoted — the US number with its opening bracket', [...new Set(quoted)].join(' | '));
  // CONTROL: the trim as it shipped took every non-letter off both ends
  const shippedTrim = (s) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const cut = [...new Set(quoted)].map(shippedTrim);
  check(cut.some((s) => !balanced(s)), 'CONTROL: the shipped trim quotes the number as “415) 555-0173”, and the check catches it', cut.join(' | '));
}

// ── LAW 3: a .docx is measured in every part the writer masks ──
console.log('\n— law 3: a .docx is measured in every part the writer masks —');
const enc = (x) => new TextEncoder().encode(x);
const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"';
const para = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const runsOf = (...ts) => `<w:p>${ts.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join('')}</w:p>`;
const watermark = (s) => `<w:p><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1" type="#_x0000_t136" style="position:absolute;rotation:315" fillcolor="silver" stroked="f"><v:textpath style="font-family:&quot;Calibri&quot;" string="${s}"/></v:shape></w:pict></w:r></w:p>`;
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
/** the package shape of test/protected-terms.mjs makeDocx: a body, a header, and footnotes */
function makeDocx({ body, header, footnotes }) {
  const over = [], rels = [], files = [];
  let sect = '';
  if (header != null) {
    over.push('<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>');
    rels.push(`<Relationship Id="rIdH" Type="${REL}/header" Target="header1.xml"/>`);
    files.push({ name: 'word/header1.xml', data: enc(`${decl}<w:hdr ${NS}>${header}</w:hdr>`) });
    sect += '<w:headerReference w:type="default" r:id="rIdH"/>';
  }
  if (footnotes != null) {
    over.push('<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>');
    rels.push(`<Relationship Id="rIdF" Type="${REL}/footnotes" Target="footnotes.xml"/>`);
    files.push({ name: 'word/footnotes.xml', data: enc(`${decl}<w:footnotes ${NS}><w:footnote w:id="1">${footnotes}</w:footnote></w:footnotes>`) });
  }
  return writeZip([
    { name: '[Content_Types].xml', data: enc(`${decl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${over.join('')}</Types>`) },
    { name: '_rels/.rels', data: enc(`${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: enc(`${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`) },
    { name: 'word/document.xml', data: enc(`${decl}<w:document ${NS}><w:body>${body}<w:sectPr>${sect}</w:sectPr></w:body></w:document>`) },
    ...files,
  ]);
}
/** a .docx as store.ts holds it after the engine: the main flow as the text of record, the
 *  walker's items, what it carries outside its flows read at the drop, the package */
async function docxFile(id, pkg, rows, p, terms = []) {
  const d = await extractDocx(pkg);
  const text = core.foldFullwidth(flowText(d.items.filter(inMainFlow)));
  const prot = protectedEntities(text, terms);
  return { id, name: `${id}.docx`, badge: 'DOCX', kind: 'docx', state: 'ready', sizeLabel: '1 KB', statusLabel: 'Read', engineComplete: true,
    text, docx: d, docxMarks: await docxMarks(pkg), bytes: pkg, entities: syncFloorRows(text, [...rows, ...prot], p) };
}
/** Every text a package carries, read with nothing from attest.ts: each element text and
 *  attribute value of every XML part, and every part's name. xml:space is left out: the writer
 *  sets it where a rewrite leaves a space at a run's end, so it follows the mask. */
async function carried(pkg) {
  const zip = await readZip(pkg);
  const td = new TextDecoder();
  const all = [];
  // every other name the saved package writes: an unprefixed attribute (KestrelHoldings="1"), a
  // local name under Word's own prefix (<w:KestrelHoldings/>). Kept apart from `all`, whose texts
  // are compared word by word between two saves, where one more <w:t> is one more "t": the
  // writer never rewrites a name, it holds on it or ships it, so a name can only be exposed by
  // shipping where it held, and that is all this list is read for (owner ruling 12). Read by
  // the prefix rule above alone, P2-PATHS A6 and P2T6-2 S3 read "the writer ships nothing new"
  // while it shipped the name, and the battery failed the record for taking the finish off
  const names = [];
  for (const n of zip.names.filter((x) => !x.endsWith('/'))) {
    all.push({ where: n, text: n });
    // an element's or an attribute's name, and a prefix a declaration binds, under a prefix
    // none of these packages' own vocabularies uses: <acme:KestrelHoldings/>, xmlns:kestrel=…
    const named = (q) => {
      const c = q.indexOf(':');
      const p = c > 0 ? q.slice(0, c) : '';
      if (p === 'xmlns') { if (!OWN_PREFIX.test(q.slice(6))) all.push({ where: `${n} a name in the markup`, text: q.slice(6) }); return; }
      if (p && !OWN_PREFIX.test(p)) all.push({ where: `${n} a name in the markup`, text: q });
      else if (q !== 'xmlns' && p !== 'xml') names.push({ where: `${n} a name in the markup`, text: q });
    };
    const visit = (nodes, path) => {
      for (const node of nodes) for (const k of Object.keys(node)) {
        if (k === ':@') { for (const [a, v] of Object.entries(node[k])) { named(a); if (a !== 'xml:space') all.push({ where: `${n} ${path}@${a}`, text: String(v) }); } continue; }
        if (k === '#text') { all.push({ where: `${n} ${path}`, text: String(node[k]) }); continue; }
        if (!k.startsWith('?')) named(k);
        if (Array.isArray(node[k])) visit(node[k], k);
      }
    };
    visit(walkPart(td.decode(await zip.read(n))).tree, '');
  }
  return Object.assign(all, { names });
}
/** the prefixes Word and these packages write for the format's own namespaces */
const OWN_PREFIX = /^(w|r|m|a|c|v|o|mc|wp|pic|xml|w10|w14|w15|w16\w*|wps|wpg|wpc|wp14|a14|cx\d*|dgm|ds|cp|dc|dcterms|dcmitype|xsi|vt|ep|sl|wne|aink|am3d|oel|w16se|w16cid|w16du|w16sdtdh|w16cex)$/;
/** what the real writer saves for this table, practice and list, as if the file were finished:
 *  every text the saved .docx carries (carried), or why it held */
async function savedAll(f, p, terms, E = { exportPlan }, W = { writeRedactedDocx }) {
  const plan = E.exportPlan({ ...f, reviewed: true }, terms, p);
  const report = await W.writeRedactedDocx(f.bytes, { mask: plan.docx.mask });
  return report.bytes ? { all: await carried(report.bytes), held: null } : { all: null, held: report.held };
}
/** `E`: an engine bundle (engineWith) whose plan the writer saves with, and `W` a writer
 *  bundle (writerWith) that saves, for a CONTROL */
async function saved(f, p, terms, E, W) {
  const s = await savedAll(f, p, terms, E, W);
  return s.all ? s.all.map((x) => x.text).join('\n') : `held: ${s.held}`;
}
/** the fail-closed comparator of test/protected-terms.mjs: a word readable in `b` more often
 *  than in `a`, tags out first (every tag in these packages is numbered or a floor word) */
const TAGS = /\[[A-Za-z]+-?\d*\]/g;
// the neutral names the writer gives a style, a font, a theme or a colour it replaces whole are
// its own words, like a tag: a term added to the list turns "Osprey Sans" into "Redacted font
// 1", and read as words that is text newly readable
const NEUTRAL = /\bRedacted(?: (?:style|font|theme|colour) |Style)\d+\b/g;
// a word as a reader reads it: a letter drawn in a circle or a square ("Ⓜⓐⓡⓖⓐⓡⓔⓣ") is a symbol to
// Unicode and still a letter to whoever opens the file (SEAM-F3)
const tokens = (s) => { const m = new Map(); for (const t of (s.replace(TAGS, ' ').replace(NEUTRAL, ' ').match(/[\p{L}\p{N}\u24B6-\u24E9\u{1F130}-\u{1F149}\u{1F150}-\u{1F169}\u{1F170}-\u{1F189}]+/gu) ?? [])) m.set(t, (m.get(t) ?? 0) + 1); return m; };
const readableIn = (a, b) => { const o = tokens(a); return [...tokens(b)].filter(([t, n]) => (o.get(t) ?? 0) < n).map(([t]) => t); };
/** strip the record's knowledge that this is a .docx: the body-only record that shipped */
const bodyOnly = (f) => ({ ...f, kind: undefined, docx: undefined, docxMarks: undefined });
const BODY = 'the body of the saved .docx';
/** What the real writer saves for this table, practice and list, read with nothing from
 *  attest.ts: every text it handed its mask (`out`, with what the mask made of it), each flow's
 *  record as its report gives it (the text it placed the table over), and the text each of
 *  those parts shows in the saved file — walked as the writer walks a flow (docxWrite partFlow:
 *  no attribute, field code or chart value; a paragraph change is a newline) and folded — beside
 *  the text export. */
async function writerSaved(f, p, terms, E = { exportPlan }, W = { writeRedactedDocx }) {
  const plan = E.exportPlan({ ...f, reviewed: true }, terms, p);
  const out = new Map();
  const mask = Object.assign((t) => { const m = plan.docx.mask(t); out.set(t, m.text); return m; }, { names: plan.docx.mask.names });
  const report = await W.writeRedactedDocx(f.bytes, { mask });
  const records = new Map(report.flows.map((x) => [x.part, x.record]));
  const shows = new Map();
  if (report.bytes) {
    const zip = await readZip(report.bytes);
    for (const part of records.keys()) {
      const data = await zip.read(part);
      if (!data) continue;
      let synthetic = -1;
      const items = walkPart(new TextDecoder().decode(data)).items.filter((i) => !i.attr && i.kind !== 'field' && !i.num && i.rev !== 'del');
      shows.set(part, core.foldFullwidth(flowText(items.map((i) => (i.para === undefined ? { ...i, para: synthetic-- } : i)))));
    }
  }
  return { out, records, shows, red: plan.red, held: report.held ?? null };
}
const BODY_PART = 'word/document.xml';
/** What each flow of the saved .docx shows readable in `b` that it did not in `a`, paragraph by
 *  paragraph (writerSaved's `shows`): the place a word stands, which a count over the whole
 *  package cannot see — "Wei Ling" masked in one paragraph at finish and readable in another,
 *  then the other way round, counts the same. Each as "word @part:paragraph". */
const readableByPlace = (a, b) => {
  const out = [];
  for (const [part, now] of b.shows) {
    const was = (a.shows.get(part) ?? '').split('\n');
    now.split('\n').forEach((l, i) => { for (const t of readableIn(was[i] ?? '', l)) out.push(`${t} @${part}:${i}`); });
  }
  return out;
};
/** A record held to the writer: every flow it measured is one the writer placed the table over
 *  (its record), measured as the text that part of the saved file shows — or a text the writer
 *  masked on its own (a chart value), to the same bytes; and with no saved body of its own, the
 *  saved body shows the text export. Empty when the record says what the writer does. */
function heldToWriter(rec, f, w) {
  const cut = (s) => JSON.stringify(s === undefined ? '(nothing)' : s.length > 70 ? s.slice(0, 70) + '…' : s);
  if (w.held) return [`the writer held the file: ${w.held}`];
  const bad = [];
  for (const [where, part, m] of [...(rec.saved ? [[BODY, BODY_PART, rec.saved]] : []), ...rec.parts.map((x) => [x.where, x.part, x])]) {
    if (w.records.get(part) === m.text) { if (w.shows.get(part) !== m.bytes) bad.push(`${where}: measured as ${cut(m.bytes)}, the saved file shows ${cut(w.shows.get(part))}`); }
    else if (!w.out.has(m.text)) bad.push(`${where}: measured over ${cut(m.text)}, a text the writer never masked`);
    else if (w.out.get(m.text) !== m.bytes) bad.push(`${where}: measured as ${cut(m.bytes)}, the writer wrote ${cut(w.out.get(m.text))}`);
  }
  if (!rec.saved && w.shows.get(BODY_PART) !== w.red) bad.push(`no saved body kept, but the saved body shows ${cut(w.shows.get(BODY_PART))} and the text export ${cut(w.red)}`);
  return bad;
}
/** The flows as the record read them until 2026-09-23, recreated as marks: the body as the
 *  document of record, every other flow as the walker read the file dropped — its hidden runs
 *  left out, the results of the fields the writer removes left in. */
const WHERE_OLD = { header: 'a header', footer: 'a footer', footnote: 'the footnotes', endnote: 'the endnotes', chart: 'a chart', diagram: 'a diagram' };
function walkerFlowMarks(f) {
  const byPart = new Map();
  for (const i of f.docx.items) {
    if (inMainFlow(i) || i.rev === 'del' || i.hidden || i.attr || i.num || !WHERE_OLD[i.kind]) continue;
    if (!byPart.has(i.part)) byPart.set(i.part, []);
    byPart.get(i.part).push(i);
  }
  const flows = [...byPart.values()].map((items) => {
    let synthetic = -1;
    return { part: items[0].part, kind: 'flow', read: 'text', where: WHERE_OLD[items[0].kind], text: core.foldFullwidth(flowText(items.map((i) => (i.para === undefined ? { ...i, para: synthetic-- } : i)))) };
  });
  return [...f.docxMarks.filter((m) => m.kind !== 'flow'), { part: 'word/document.xml', kind: 'flow', read: 'text', where: BODY, text: f.text }, ...flows];
}
{
  const us = (p) => p;
  const D = [];
  // D1 — the C3-2 path in a .docx: the SSN is in the running header only
  {
    const pkg = await makeDocx({ body: para('The claimant was dismissed on grounds the tribunal rejected.'), header: para('Claimant file · SSN 123-45-6789 · PRIVILEGED') });
    D.push({ label: 'a practice switch from United States to Singapore, with the SSN in the header only', f: await docxFile('D1', pkg, [], 'us'), p0: 'us', t0: [],
      change: (f) => withFloor(f, 'sg'), p1: us('sg'), t1: [], cause: 'Switching the practice to Singapore', want: 'expose', names: ['123-45-6789 @a header'] });
    D.push({ label: 'a practice switch from Singapore to United States (adds the SSN rule)', f: await docxFile('D1b', pkg, [], 'sg'), p0: 'sg', t0: [],
      change: (f) => withFloor(f, 'us'), p1: 'us', t1: [], cause: 'Switching the practice to United States', want: 'stand' });
  }
  // D2 — a surname masked in the header and a footnote only through a row the body never uses on its own
  {
    const pkg = await makeDocx({ body: para('Alice Kowalczyk instructed us on 3 May. Bob Nowak replied.'), header: para('Kowalczyk v Nowak — without prejudice'), footnotes: para('See the statement of Kowalczyk, para 4.') });
    const rows = [person('a', 'Alice Kowalczyk', '[Person1]'), person('k', 'Kowalczyk', '[Person1]'), person('b', 'Bob Nowak', '[Person2]'), person('n', 'Nowak', '[Person2]')];
    D.push({ label: 'the surname row left visible after finishing (the body is unchanged by it)', f: await docxFile('D2', pkg, rows, 'sg'), p0: 'sg', t0: [],
      change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['k'], { dead: true, status: 'ignored' }) }, 'sg'), p1: 'sg', t1: [], cause: 'A change made after you finished', want: 'expose',
      names: ['Kowalczyk @a header', 'Kowalczyk @the footnotes'] });
    D.push({ label: 'redacting the surname again after finishing with it left visible', f: await docxFile('D2b', pkg, decideRows(rows, ['k'], { dead: true, status: 'ignored' }), 'sg'), p0: 'sg', t0: [],
      change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['k'], { dead: false, status: 'confirmed' }) }, 'sg'), p1: 'sg', t1: [], cause: 'A change made after you finished', want: 'stand' });
  }
  // D3 — the always-redact list masks a header-only codename, a letterhead split across runs
  //      and a watermark; the list is then emptied in Settings
  {
    const pkg = await makeDocx({ body: para('The buyer shall pay the price on completion. Margaret Tan signed.'),
      header: watermark('KESTREL – STRICTLY CONFIDENTIAL') + runsOf('Har', 'row Le', 'ung LLP') + para('PROJECT KESTREL') });
    const rows = [person('p', 'Margaret Tan', '[Person1]')];
    const TERMS = ['Kestrel', 'Harrow Leung LLP'];
    D.push({ label: 'the always-redact list emptied in Settings (a codename, a split letterhead and a watermark the body never says)', f: await docxFile('D3', pkg, rows, 'sg', TERMS), p0: 'sg', t0: TERMS,
      change: (f) => f, p1: 'sg', t1: [], cause: 'Changing the always-redact list in Settings', want: 'expose',
      names: ['KESTREL @a header', 'Harrow Leung LLP @a header', 'KESTREL @a watermark'] });
    D.push({ label: 'a term added to the always-redact list in Settings', f: await docxFile('D3b', pkg, rows, 'sg', ['Kestrel']), p0: 'sg', t0: ['Kestrel'],
      change: (f) => f, p1: 'sg', t1: TERMS, cause: 'Changing the always-redact list in Settings', want: 'stand' });
    D.push({ label: 'leaving Settings with the list as it was', f: await docxFile('D3c', pkg, rows, 'sg', TERMS), p0: 'sg', t0: TERMS,
      change: (f) => f, p1: 'sg', t1: TERMS, cause: 'Changing the always-redact list in Settings', want: 'stand' });
  }
  for (const d of D) {
    const fin = finishFile(d.f, d.p0, d.t0);
    const g = recheckFinish(fin, d.change(fin), d.p1, d.t1, d.cause);
    const leaked = readableIn(await saved(fin, d.p0, d.t0), await saved(g, d.p1, d.t1));
    const q = quotes(g.reopened).map((x) => `${x.text} @${x.where ?? 'the body'}`);
    d.g = g; d.leaked = leaked; d.fin = fin;
    const namesOk = !d.names || d.names.every((n) => q.includes(n));
    check((g.reviewed === true) === (d.want === 'stand') && (leaked.length > 0) === (d.want === 'expose') && namesOk,
      `${d.want === 'stand' ? 'leaves the finish standing' : 'takes the finish off'}: ${d.label} — and the real writer's saved .docx agrees`,
      `${d.want === 'expose' ? `readable in the saved .docx now, masked at finish: ${JSON.stringify(leaked)}\n          ` : ''}${g.reopened ?? 'finish stands'}`);
  }
  // CONTROL: the record as it shipped measured the document of record only
  const shipped = [];
  for (const d of D.filter((x) => x.want === 'expose')) {
    const fin = finishFile(bodyOnly(d.f), d.p0, d.t0);
    const g = recheckFinish(fin, d.change(fin), d.p1, d.t1, d.cause);
    shipped.push(`${d.f.id}: ${g.reviewed ? 'finish stands' : 'off'} while ${JSON.stringify(d.leaked)} ships readable`);
    if (!g.reviewed) shipped.push('(the body-only record caught this one)');
  }
  check(shipped.every((s) => !s.startsWith('(')) && shipped.length === D.filter((x) => x.want === 'expose').length,
    'CONTROL: a body-only record leaves every one of those finishes standing while the saved .docx carries what was masked at finish — the check catches it', shipped.join('\n          '));

  // the watermark is a text the writer masks that the walker does not list: without what the
  // file carries outside its flows, read at the drop, the record cannot see it
  const d3 = D.find((d) => d.f.id === 'D3');
  const noMarks = { ...d3.f, docxMarks: d3.f.docxMarks.filter((m) => m.kind === 'flow') };
  const finNoMarks = finishFile(noMarks, 'sg', d3.t0);
  const gNoMarks = recheckFinish(finNoMarks, noMarks, 'sg', [], d3.cause);
  check(!quotes(gNoMarks.reopened).some((x) => x.where === 'a watermark') && d3.leaked.filter((w) => w === 'KESTREL').length > 0,
    'CONTROL: without the texts read at the drop, the note never mentions the watermark while the saved .docx prints KESTREL across every page', gNoMarks.reopened);
  const unread = { ...d3.f, docxMarks: null };
  const u = recheckFinish(finishFile(unread, 'sg', d3.t0), unread, 'sg', ['Kestrel', 'Harrow Leung LLP', 'Osprey'], d3.cause);
  check(u.reviewed === false && /style, font and list names, field codes, the watermark — could not be read when it was dropped/.test(u.reopened ?? ''),
    'a .docx whose texts outside its flows could not be read at the drop fails closed on a change, and says what could not be read', u.reopened);
  const same = finishFile(unread, 'sg', d3.t0);
  check(recheckFinish(same, same, 'sg', d3.t0, d3.cause) === same,
    'and leaving Settings with nothing changed does not take its finish off: the export is the one finished, input for input');
}

// The body of the saved .docx is masked with docxMaskTable's table, not the review table: a
// row the always-redact list adds, or moves under Protected terms, places there and not in the
// text export. Until 2026-09-23 a longer row took a shorter one's whole match (E3-1): with
// "Mrs Margaret Tan" listed after finishing, the saved body read "[Protected2] Wei Ling
// attended" while the text export still said [Person1]. engine.ts placements now keeps the
// shorter row's other words under its own tag, so the finish stands — and the record, which
// measures the saved body apart, is what took it off when the engine did not.
console.log('\n— law 3, the body of the saved .docx —');
{
  const pkg = await makeDocx({ body: para('Mrs Margaret Tan Wei Ling attended the hearing with her counsel.') });
  const f0 = await docxFile('E31', pkg, [person('t', 'Tan Wei Ling', '[Person1]')], 'sg');
  const LIST = ['Mrs Margaret Tan'], why = 'Changing the always-redact list in Settings';
  const run = (A) => { const fin = A.finishFile(f0, 'sg', []); return { fin, g: A.recheckFinish(fin, fin, 'sg', LIST, why) }; };
  const { fin, g } = run({ finishFile, recheckFinish });
  const at = await saved(fin, 'sg', []), now = await saved(g, 'sg', LIST);
  const leaked = readableIn(at, now);
  check(g.reviewed === true && leaked.length === 0 && !/Wei|Ling/.test(now) && bytes(f0.text, g.entities).includes('[Person1] attended'),
    'E3-1: a list term that meets a row inside a name leaves the finish standing — the row keeps the rest of the name, and the real writer\'s saved body masks every word it masked at finish',
    `saved body now: ${JSON.stringify(now.split('\n').find((l) => /attended/.test(l)))} · ${g.reopened ?? 'finish stands'}`);
  // CONTROL: the engine as it was — the same check, over the saved body that engine wrote
  const OE = await engineWith(OLD_OVERLAP);
  const old = run(await attestWith([], null, OLD_OVERLAP));
  const oldLeak = readableIn(await saved(old.fin, 'sg', [], OE), await saved(old.g, 'sg', LIST, OE));
  check(oldLeak.join() === 'Wei,Ling' && old.g.reviewed === false && quotes(old.g.reopened).some((q) => q.text === 'Wei Ling' && q.where === BODY),
    'CONTROL: under the overlap rule as it was, the saved body reads "[Protected2] Wei Ling attended" and the record takes the finish off naming it — the check tells the two engines apart',
    `readable in the saved .docx now, masked at finish: ${JSON.stringify(oldLeak)}\n          ${old.g.reopened}`);
  check(finishRecord(f0, 'sg', ['Osprey', 'Harrow Leung LLP']).saved === null && finishRecord(f0, 'sg', ['Tan Wei Ling']).saved === null && finishRecord(f0, 'sg', LIST).saved !== null,
    'the saved body costs a second remask only when it can differ from the text export: a term the body never says costs none, a term naming a row that places exactly as the row did costs none (P2-M2), a term that places a row of its own is measured');
}

// The writer places the table over each flow's record — the document of record for the body,
// hidden runs and the results of the fields it removes (AUTHOR, FILENAME, DOCPROPERTY…) still
// in it — and ships only the stretches it keeps, then masks what those stretches read once
// more, where taking the rest out joined what the record kept apart. Until 2026-09-23 it
// stripped first and masked what was left, and the record measured the body as the document
// of record and every other flow as the file was read at the drop (P2-M1, P2-PATHS-1, INT-1).
// Each case is judged by the real writer's saved .docx (carried), and each record is held to
// the flows the writer placed over and what its saved file shows (writerSaved) — neither reads
// attest.ts.
console.log('\n— law 3, every flow as the writer masks it —');
{
  const r = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const hid = (t) => `<w:r><w:rPr><w:vanish/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const fieldOf = (instr, result) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${r(result)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const pOf = (...runs) => `<w:p>${runs.join('')}</w:p>`;
  const org = (key, text, tag) => ({ key, text, tag, cat: 'org', cls: 'COMPANY', prov: 'both passes', occ: 1, status: 'confirmed' });
  const LIST = 'Changing the always-redact list in Settings', LATER = 'A change made after you finished';
  /** Review's extend, as Review.tsx makes it */
  const extend = (key, to) => (f) => {
    const e = f.entities.find((x) => x.key === key);
    return withFloor({ ...f, entities: widenRow(f.entities, key, to, spanMatches(f.text, to), occurrencesOutside(f.text, e.text, to), [], mintHandKey(f.entities, 'x')) }, 'sg');
  };
  const WF = [
    { id: 'H1', label: 'a list term meeting a name across a hidden drafting note (the row keeps the rest of the name)', want: 'stand',
      body: pOf(r('Mrs Margaret '), hid('[confirm spelling with client] '), r('Tan Wei Ling attended the hearing with her counsel.')),
      rows: [person('t', 'Tan Wei Ling', '[Person1]')], t0: [], t1: ['Mrs Margaret Tan'], cause: LIST },
    { id: 'H2', label: 'a list term meeting a name across an AUTHOR field the writer removes (the row keeps the rest of the name)', want: 'stand',
      body: pOf(r('Mrs Margaret '), fieldOf(' AUTHOR ', 'J Smith '), r('Tan Wei Ling attended the hearing with her counsel.')),
      rows: [person('t', 'Tan Wei Ling', '[Person1]')], t0: [], t1: ['Mrs Margaret Tan'], cause: LIST },
    { id: 'H3', label: 'a list term meeting a name across a FILENAME field in a header (the row keeps the rest of the name)', want: 'stand',
      body: para('Tan Wei Ling attended the hearing with her counsel.'), header: pOf(r('Re Mrs Margaret '), fieldOf(' FILENAME ', 'draft7.docx '), r('Tan Wei Ling')),
      rows: [person('t', 'Tan Wei Ling', '[Person1]')], t0: [], t1: ['Mrs Margaret Tan'], cause: LIST },
    { id: 'H5', label: 'the same name added by hand after finishing, no list (the row keeps the rest of the name)', want: 'stand',
      body: pOf(r('Mrs Margaret '), hid('[check spelling] '), r('Tan Wei Ling attended the hearing.')) + para('Mrs Margaret Tan signed the consent.'),
      rows: [person('t', 'Tan Wei Ling', '[Person1]')], t0: [], t1: [], cause: LATER, change: (f) => withFloor({ ...f, entities: [...f.entities, hand('u1', 'Mrs Margaret Tan', '[Person2]')] }, 'sg') },
    { id: 'H6', label: 'the same name added by hand after finishing, meeting a name across a FILENAME field in a header (the row keeps the rest of the name)', want: 'stand',
      body: para('Tan Wei Ling attended the hearing.') + para('Mrs Margaret Tan signed the consent.'), header: pOf(r('Re Mrs Margaret '), fieldOf(' FILENAME ', 'draft7.docx '), r('Tan Wei Ling')),
      rows: [person('t', 'Tan Wei Ling', '[Person1]')], t0: [], t1: [], cause: LATER, change: (f) => withFloor({ ...f, entities: [...f.entities, hand('u1', 'Mrs Margaret Tan', '[Person2]')] }, 'sg') },
    { id: 'PX', label: 'a codename row extended after finishing, the other mention split by a hidden run', want: 'expose', names: [`Project Kestrel @${BODY}`],
      body: para('Project Kestrel Phase 2 closes in May.') + pOf(r('Project '), hid('[internal] '), r('Kestrel is confidential.')),
      rows: [{ key: 'k', text: 'Project Kestrel', tag: '[Term1]', cat: 'term', cls: 'ID', prov: 'both passes', occ: 1, status: 'confirmed' }], t0: [], t1: [], cause: LATER, change: extend('k', 'Project Kestrel Phase') },
    { id: 'PM', label: 'a middle name the author hid, the firm\'s "John Smith" taken off the list (the row masks the name as the document of record has it; the list was never what masked it)', want: 'stand',
      body: pOf(r('John '), hid('Michael '), r('Smith, the claimant, attended.')),
      rows: [person('j', 'John Michael Smith', '[Person1]')], t0: ['John Smith'], t1: [], cause: LIST },
    { id: 'PD', label: 'a DOCPROPERTY result between two words of a firm, the firm taken off the list (the row masks the firm as the document of record has it)', want: 'stand',
      body: pOf(r('Kestrel '), fieldOf(' DOCPROPERTY Division ', 'Capital '), r('Holdings signed the deed.')),
      rows: [org('o', 'Kestrel Capital Holdings', '[Company1]')], t0: ['Kestrel Holdings'], t1: [], cause: LIST },
    { id: 'P3', label: 'a header DOCPROPERTY result the writer removes, its name taken off the list (P2-PATHS-3)', want: 'stand',
      body: para('The purchaser attended.'), header: pOf(r('Client: '), fieldOf(' DOCPROPERTY Client ', 'Margaret Tan')),
      rows: [], t0: ['Margaret Tan'], t1: [], cause: LIST },
    { id: 'D6', label: 'a term naming a body row, whose tolerant match then meets another row (a U+2011 hyphen; the other row keeps its other word)', want: 'stand',
      body: para('Kestrel-Osprey signed for Kestrel‑Osprey Trust.'),
      rows: [org('k', 'Kestrel-Osprey', '[Company1]'), org('t', 'Osprey Trust', '[Company2]')], t0: [], t1: ['Kestrel-Osprey'], cause: LIST },
    // a form of a row's name its own pattern never reads is placed under the row's name by the
    // engine's run-together rule and the writer's last pass, list or no list (engine.ts
    // placements, docxWrite placeFlow; owner ruling 1): until this round the list emptied
    // shipped it (SB, SG)
    { id: 'SB', label: 'a term listed after the strip and then taken off, where the list\'s move read a U+2011 form the row never did (the row\'s name places there without the list)', want: 'stand',
      body: para('Kestrel-Osprey signed. The Kestrel‑Osprey board agreed.'),
      rows: [org('k', 'Kestrel-Osprey', '[Company1]')], strip: [], t0: ['Kestrel-Osprey'], t1: [], cause: LIST },
    { id: 'MT', label: 'a term listed after the strip that no row names, then taken off (the saved body masked it at finish, the text export never did)', want: 'expose', names: [`Kestrel Holdings @${BODY}`],
      body: para('Kestrel Holdings signed the deed. Margaret Tan witnessed.'),
      rows: [person('m', 'Margaret Tan', '[Person1]')], strip: [], t0: ['Kestrel Holdings'], t1: [], cause: LIST },
    // the writer's last step over each flow: a name of the table run together with the text
    // beside it, masked in the saved body only (docxWrite placeFlow, owner ruling 1)
    { id: 'RT', label: 'a term listed after the strip that the body writes run together (KestrelHoldings), then taken off (the saved body masked it at finish, the text export never did)', want: 'expose', names: [`KestrelHoldings @${BODY}`],
      body: para('KestrelHoldings signed the deed. Margaret Tan witnessed.'),
      rows: [person('m', 'Margaret Tan', '[Person1]')], strip: [], t0: ['Kestrel Holdings'], t1: [], cause: LIST },
    { id: 'RH', label: 'the same, a hidden note in the body besides', want: 'expose', names: [`KestrelHoldings @${BODY}`],
      body: para('KestrelHoldings signed the deed.') + pOf(r('Margaret Tan '), hid('[check] '), r('witnessed.')),
      rows: [person('m', 'Margaret Tan', '[Person1]')], strip: [], t0: ['Kestrel Holdings'], t1: [], cause: LIST },
    { id: 'CL', label: 'a term naming a row added by hand, which has no class of its own (the move keeps the class it placed with, and its two-word prefix)', want: 'stand',
      body: para('Mrs Margaret Tan signed. Mrs Margaret agreed.'),
      rows: [hand('u1', 'Mrs Margaret Tan', '[Person1]')], t0: [], t1: ['Mrs Margaret Tan'], cause: LIST },
    { id: 'NB', label: 'a term naming a body row that places exactly as the row did', want: 'stand',
      body: pOf(r('Margaret '), hid('[née Lim] '), r('Tan signed. Margaret Tan agreed.')),
      rows: [person('m', 'Margaret Tan', '[Person1]')], t0: [], t1: ['Margaret Tan'], cause: LIST },
    // the writer folds a flow before it masks it (docxWrite partFlow), so a surname typed in
    // fullwidth letters is masked by the row that names it in ordinary ones
    { id: 'FW', label: 'a surname typed in fullwidth letters in a header and a footnote, its row left visible after finishing', want: 'expose', names: ['KOWALCZYK @a header', 'Kowalczyk @the footnotes'],
      body: para('Alice Kowalczyk instructed us. Bob Nowak replied.'), header: para('ＫＯＷＡＬＣＺＹＫ v Nowak'), footnotes: para('See the statement of Ｋｏｗａｌｃｚｙｋ, para 4.'),
      rows: [person('a', 'Alice Kowalczyk', '[Person1]'), person('k', 'Kowalczyk', '[Person1]'), person('b', 'Bob Nowak', '[Person2]'), person('n', 'Nowak', '[Person2]')], t0: [], t1: [], cause: LATER,
      change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['k'], { dead: true, status: 'ignored' }) }, 'sg') },
  ];
  // What the writer's second pass blanks, already in the document: an earlier redaction's █, a
  // precedent's own "[Person1]". The second pass blanks every occurrence of every tag the first
  // placed, the document's own among them, and until 2026-09-23 the record could not read that
  // pass back to the document of record when the body carried either: the saved body was then
  // compared by its words alone, which refused a finish over "cooperate" and let one stand while
  // the saved body shipped "Wei Ling" (P2-PATHS-1). And a term glued to a number the safety net
  // cuts ("Call Kestrel61234567"), which the writer's table places and the tolerant pattern
  // alone does not find (P2T-1).
  const MASK_TERMS = 'Masking the always-redact terms in this document', SWAP = ['Mrs Margaret Tan', 'Wei Ling Road'];
  const swapBody = (extra) => pOf(r('Mrs Margaret Tan '), hid('[née Lim] '), r('Wei Ling attended.')) + para('She lives on Wei Ling Road.') + para(extra);
  const maskThem = (f) => withFloor({ ...f, entities: withProtectedTerms(f.text, f.entities, SWAP, 'sg') }, 'sg');
  /** the safety net's row for the office number left readable, before the finish */
  const leaveNumber = (f) => withFloor({ ...f, entities: decideRows(f.entities, f.entities.filter((e) => isFloorRow(e) && e.text === '61234567').map((e) => e.key), { dead: true, status: 'ignored' }) }, 'sg');
  const RB = [
    { id: 'K4', label: 'an earlier redaction\'s ████ in the body, and a hyphen the author hid in "co-operate" (a term the body never says added to the list)', want: 'stand',
      body: para('Margaret Tan signed. Exhibit 4: ████.') + pOf(r('The parties will co'), hid('-'), r('operate fully.')),
      rows: [person('m', 'Margaret Tan', '[Person1]')], t0: [], t1: ['Kestrel'], cause: LIST },
    { id: 'LT', label: 'a precedent\'s own "[Person1]" and a hidden note inside the name the table tags [Person1], the row left visible after finishing', want: 'expose', names: ['Margaret Tan @the body'],
      body: para('[Person1] instructed us on 3 May.') + pOf(r('Margaret Tan '), hid('[check] '), r('signed.')),
      rows: [person('m', 'Margaret Tan', '[Person1]')], t0: [], t1: [], cause: LATER, change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['m'], { dead: true, status: 'ignored' }) }, 'sg') },
    { id: 'K6', label: 'two terms listed after finishing and masked from Export, which leave the saved body "[Protected1] Wei Ling attended" — an earlier redaction\'s ████ in the body', want: 'expose', names: [`Wei Ling @${BODY}`],
      body: swapBody('Exhibit 4: ████ is attached.'), rows: [person('t', 'Tan Wei Ling', '[Person1]')], t0: [], t1: SWAP, cause: MASK_TERMS, change: maskThem },
    { id: 'K6T', label: 'the same, with a precedent\'s own "[Person1]" in the body', want: 'expose', names: [`Wei Ling @${BODY}`],
      body: swapBody('Exhibit 4: [Person1] is attached.'), rows: [person('t', 'Tan Wei Ling', '[Person1]')], t0: [], t1: SWAP, cause: MASK_TERMS, change: maskThem },
    { id: 'G1', label: 'a row the list names, carried also glued to a phone number, the list emptied (the row masks it there without the list)', want: 'stand',
      body: para('Kestrel signed the deed. Call Kestrel61234567 for the desk.'), rows: [org('k', 'Kestrel', '[Company1]')], strip: [], t0: ['Kestrel'], t1: [], cause: LIST },
    { id: 'G2', label: 'a term no row names, carried only glued to a phone number, listed after the strip and then taken off', want: 'expose', names: [`Kestrel @${BODY}`],
      body: para('Margaret Tan signed. Call Kestrel61234567 for the desk.'), rows: [person('m', 'Margaret Tan', '[Person1]')], strip: [], t0: ['Kestrel'], t1: [], cause: LIST },
    { id: 'SG', label: 'a row the list names, its U+2011 form carried only glued to a phone number, the list emptied (the row\'s own pattern never read that form; its name places there without the list)', want: 'stand',
      body: para('Kestrel-Osprey signed. Call Kestrel‑Osprey61234567 for the desk.'), rows: [org('k', 'Kestrel-Osprey', '[Company1]')], strip: [], t0: ['Kestrel-Osprey'], t1: [], cause: LIST },
    // the writer's first pass as rewriteRuns writes it, read back through its second: one tag
    // for a name the hidden run splits across two runs, written in the first; two tags, not
    // one, where a row and the safety net's hit touch; the safety net's tag among them
    { id: 'SP', label: 'a name split by a hidden middle name, a firm glued to a phone number, and a hyphen hidden in "co-operate" (a term the body never says added to the list)', want: 'stand',
      body: pOf(r('John '), hid('Michael '), r('Smith signed. Call Kestrel61234567 for the desk.')) + pOf(r('The parties will co'), hid('-'), r('operate fully.')),
      rows: [person('j', 'John Michael Smith', '[Person1]'), org('k', 'Kestrel', '[Company1]')], t0: [], t1: ['Osprey'], cause: LIST },
    // the writer's second pass masks the joined flow with the table it is handed, never the text
    // export's: the list's own row for a firm the hidden note splits places there alone (P23-2)
    { id: 'J1', label: 'a firm on the list that a hidden note splits, masked by the writer only once the note is out, the list emptied', want: 'expose', names: [`Harrow Leung LLP @${BODY}`],
      body: pOf(r('Harrow '), hid('[check] '), r('Leung LLP acted for the claimant.')), rows: [], t0: ['Harrow Leung LLP'], t1: [], cause: LIST },
    // a number the lawyer left readable is written into no tag by either pass: counted among
    // them, the saved body is read by its words alone (P23-3, P2-PATHS-1)
    { id: 'K4X', label: 'the K4 body with an office number left readable before finishing', want: 'stand',
      body: para('Margaret Tan signed. Exhibit 4: ████.') + pOf(r('The parties will co'), hid('-'), r('operate fully.')) + para('Office 61234567.'),
      rows: [person('m', 'Margaret Tan', '[Person1]')], pre: leaveNumber, t0: [], t1: ['Kestrel'], cause: LIST },
    { id: 'K6X', label: 'the K6 body with an office number left readable before finishing', want: 'expose', names: [`Wei Ling @${BODY}`],
      body: swapBody('Exhibit 4: ████ is attached. Office 61234567.'), rows: [person('t', 'Tan Wei Ling', '[Person1]')], pre: leaveNumber, t0: [], t1: SWAP, cause: MASK_TERMS, change: maskThem },
  ];
  const play = (A, c, marks) => {
    const f0 = marks ? { ...c.f0, docxMarks: marks } : c.f0;
    const fin = A.finishFile(f0, 'sg', c.t0);
    return { fin, g: A.recheckFinish(fin, (c.change ?? ((f) => f))(fin), 'sg', c.t1, c.cause) };
  };
  const A0 = { finishFile, recheckFinish };
  const off = [], refused = [], byWords = [];
  const ALL = [...WF, ...RB];
  for (const c of ALL) {
    c.f0 = await docxFile(c.id, await makeDocx({ body: c.body, header: c.header, footnotes: c.footnotes }), c.rows, 'sg', c.strip ?? c.t0);
    if (c.pre) c.f0 = c.pre(c.f0);
    const hold = finishHold(c.f0, 'sg', c.t0);
    if (hold) refused.push(`${c.id}: ${hold}`);
    const { fin, g } = play(A0, c);
    c.fin = fin;
    const wAt = await writerSaved(fin, 'sg', c.t0), wNow = await writerSaved(g, 'sg', c.t1);
    c.leaked = readableIn(await saved(fin, 'sg', c.t0), await saved(g, 'sg', c.t1));
    c.moved = readableByPlace(wAt, wNow);
    const q = quotes(g.reopened).map((x) => `${x.text} @${x.where ?? 'the body'}`);
    const ok = (g.reviewed === true) === (c.want === 'stand') && (c.leaked.length + c.moved.length > 0) === (c.want === 'expose') && (c.names ?? []).every((n) => q.includes(n));
    check(ok, `${c.want === 'stand' ? 'leaves the finish standing' : 'takes the finish off'}: ${c.label} — and the real writer's saved .docx agrees`,
      `${c.want === 'expose' ? `readable in the saved .docx now, masked at finish: ${JSON.stringify(c.leaked)}${c.moved.length ? ` · where it stands: ${JSON.stringify(c.moved)}` : ''}\n          ` : ''}${g.reopened ?? 'finish stands'}`);
    // the record at finish and after the change, each held to the texts the writer masked, and
    // each flow read back to its record — never compared by its words alone
    for (const [f, p, t, when, w] of [[fin, 'sg', c.t0, 'at finish', wAt], [g, 'sg', c.t1, 'after the change', wNow]]) {
      const rec = finishRecord(f, p, t);
      const bad = heldToWriter(rec, f, w);
      if (bad.length) off.push(`${c.id} ${when}: ${bad.join('; ')}`);
      for (const [where, m] of [...(rec.saved ? [[BODY, rec.saved]] : []), ...rec.parts.map((x) => [x.where, x])]) if (!m.hidden) byWords.push(`${c.id} ${when}: ${where}`);
    }
  }
  check(off.length === 0, `in all ${ALL.length} cases, at finish and after the change, every flow the record measured is one the writer placed the table over, measured as what the saved file shows — and a record with no saved body of its own is one whose saved body shows the text export`,
    off.join('\n          '));
  check(refused.length === 0, `finishing is refused in none of the ${ALL.length} cases: in each, the saved .docx masks everything the screen masks`, refused.join('\n          '));
  // the saved body of every case the writer takes text out of, an earlier redaction's █ and a
  // precedent's own tag among them (K4, LT, K6, K6T), a name split across two runs beside a row
  // and the safety net's hit that touch (SP), a firm the list masks only once a hidden note is out
  // (J1), and a body with a number the lawyer left readable (K4X, K6X)
  const STRIPPED_BODY = ['H1', 'H2', 'H5', 'PX', 'PM', 'PD', 'NB', 'K4', 'LT', 'K6', 'K6T', 'SP', 'J1', 'K4X', 'K6X', 'RH'];
  const stripped = STRIPPED_BODY.map((id) => ALL.find((c) => c.id === id));
  check(byWords.length === 0 && stripped.every((c) => !!finishRecord(c.fin, 'sg', c.t0).saved?.hidden),
    `in all ${ALL.length} cases every flow the record measured is read back to the document of record, place by place — the saved body of each of the ${STRIPPED_BODY.length} whose body the writer takes text out of among them — and none is compared by its words alone`,
    byWords.join('\n          '));
  const pm = WF.find((c) => c.id === 'PM');
  const pmW = await writerSaved(pm.f0, 'sg', pm.t1);
  check(pm.f0.text.includes('John Michael Smith') && pmW.records.get(BODY_PART) === pm.f0.text && pmW.out.has(pm.f0.text) && !/John|Michael|Smith/.test(pmW.shows.get(BODY_PART) ?? 'John'),
    'the writer places the table over the document of record, hidden middle name and all, and with "John Smith" off the list the saved body names nobody',
    `${JSON.stringify(pm.f0.text)} · the saved body shows ${JSON.stringify(pmW.shows.get(BODY_PART))}`);

  // CONTROL: the flows as read before 2026-09-23 — the body as the document of record, a header
  // as the walker read the file dropped
  const was = [];
  for (const c of WF) {
    const { fin, g } = play(A0, c, walkerFlowMarks(c.f0));
    const wrong = (g.reviewed === true) !== (c.want === 'stand');
    const bad = heldToWriter(finishRecord(g, 'sg', c.t1), g, await writerSaved(g, 'sg', c.t1)).length > 0;
    was.push({ c, wrong, bad, said: g.reviewed ? 'finish stands' : g.reopened, fin });
  }
  const wrongOld = was.filter((x) => x.wrong).map((x) => x.c.id);
  // every case whose body or header the writer takes something out of
  const STRIPPED = ['H1', 'H2', 'H3', 'H5', 'H6', 'PX', 'P3', 'NB'];
  check(wrongOld.join() === 'PX,P3' && was.filter((x) => STRIPPED.includes(x.c.id)).every((x) => x.bad),
    'CONTROL: read as the file was dropped, the extended codename\'s finish stands while the saved .docx ships "Project Kestrel", the header DOCPROPERTY takes one off for a name the saved header never carried, and in every case the writer takes something out of, what was measured is not what the saved file shows — both checks catch it',
    was.map((x) => `${x.c.id}: ${x.wrong ? 'WRONG ' : ''}${x.bad ? 'NOT THE WRITER\'S TEXTS ' : ''}${x.said}`).join('\n          '));

  // CONTROL: the overlap rule as it was until 2026-09-23 — where a moved row meets another (D6)
  // the saved .docx ships part of the name, and the record takes that finish off. H1–H6 met it
  // only while the writer masked the stripped flow: it places over the document of record now,
  // where the hidden note or the removed field's result still stands between "Mrs Margaret" and
  // "Tan", and the list term matches nothing there under either rule
  const OE = await engineWith(OLD_OVERLAP), OA = await attestWith([], null, OLD_OVERLAP);
  const oldRule = [];
  for (const c of WF.filter((x) => ['H1', 'H2', 'H3', 'H5', 'H6', 'D6'].includes(x.id))) {
    const { fin, g } = play(OA, c);
    const leak = readableIn(await saved(fin, 'sg', c.t0, OE), await saved(g, 'sg', c.t1, OE));
    oldRule.push({ id: c.id, leak, off: g.reviewed === false, said: g.reopened ?? 'finish stands' });
  }
  const d6 = oldRule.find((x) => x.id === 'D6');
  check(oldRule.length === 6 && d6.leak.length > 0 && d6.off && oldRule.filter((x) => x !== d6).every((x) => x.leak.length === 0 && !x.off),
    'CONTROL: under the overlap rule as it was, D6 ships part of a name in the saved .docx and the record takes its finish off — the check that leaves it standing today is the one that caught it — and H1, H2, H3, H5 and H6 ship nothing under either rule, because the writer places over the document of record',
    oldRule.map((x) => `${x.id}: ${JSON.stringify(x.leak)} · ${x.said}`).join('\n          '));

  // CONTROLS — attest.ts with one line broken, on the case that line exists for
  const cl = WF.find((c) => c.id === 'CL'), sb = WF.find((c) => c.id === 'SB'), mt = WF.find((c) => c.id === 'MT');
  // The record's own shortcut past the saved body asks the text export for the table's names
  // (runsTogether), which finds a listed term wherever the export leaves it readable, run
  // together or not: each CONTROL below on a line that decides the same thing takes it out too.
  const NO_RUNS = ['  if (r && !runsTogether(r, names) && !heldIn(', '  if (r && !heldIn('];
  // Where a moved row's tolerant match reads a form its own pattern never did ("Kestrel‑Osprey",
  // a U+2011 hyphen), the engine's run-together rule and the writer's last pass now place that
  // form under the row's name, list or no list, and SB and SG ship nothing new. The lines that
  // told the two placements apart are held to them under the engine and the writer as they were
  // before those rules, where the list emptied ships the form.
  const PE = await engineWith(PRE_RUN_ENGINE), PW = await writerWith(PRE_RUN_WRITER);
  const preA = (from) => attestWith([...from, NO_RUNS], null, PRE_RUN_ENGINE, PRE_RUN_WRITER);
  const preRun = async (A, c) => { const x = play(A, c); return { ...x, leak: readableIn(await saved(x.fin, 'sg', c.t0, PE, PW), await saved(x.g, 'sg', c.t1, PE, PW)) }; };
  const PRE0 = await preA([]);
  const sbWas = await preRun(PRE0, sb);
  const always = await preRun(await preA([['e === entities[i] || placesAsBefore(f, wb.text, entities[i], practice, exact)', 'true']]), sb);
  check(sbWas.leak.length > 0 && sbWas.g.reviewed === false && always.g.reviewed === true,
    'CONTROL: under the engine and writer as they were before their run-together rules, the list emptied ships "Kestrel‑Osprey" in the saved body and the record takes the finish off; with a row the list moves counted as placing as before whatever its tolerant match finds, the finish stands — the check catches it',
    `${JSON.stringify(sbWas.leak)} · ${sbWas.g.reopened ?? 'finish stands'}\n          ${always.g.reopened ?? 'finish stands'}`);
  // CONTROL (P23-2): the text export's table read on the writer's second pass as well as its
  // first — the pass that masks a firm once the hidden note between its words is out. The
  // writer's last pass finds the joined firm by the table's names too, so the record's mask is
  // handed none here
  const j1 = RB.find((c) => c.id === 'J1');
  const everyPass = play(await attestWith([['record && text === m.text ? record : table', 'record ?? table'], ['{ names: names.map((n) => n.name) }', '{ names: [] as string[] }']]), j1);
  check(j1.leaked.length > 0 && everyPass.g.reviewed === true,
    'CONTROL (P23-2): with the text export\'s table read on every pass, and no name handed to the last, "Harrow Leung LLP" — masked by the writer\'s second pass at finish, readable in the saved body now — leaves the finish standing', everyPass.g.reopened ?? 'finish stands');
  // CONTROL (P23-3): the safety net's hits the lawyer left readable counted among the stretches
  // the writer writes a tag for — P2-PATHS-1's two failures, on a body with a number left readable
  const k4x = RB.find((c) => c.id === 'K4X'), k6x = RB.find((c) => c.id === 'K6X');
  const exemptToo = await attestWith('[...r.placements, ...r.floorHits.filter((h) => !h.exempt)].map(', '[...r.placements, ...r.floorHits].map(');
  const etHold = exemptToo.finishHold(k4x.f0, 'sg', k4x.t0), et = play(exemptToo, k6x);
  check(!!etHold && k6x.leaked.length + k6x.moved.length > 0 && et.g.reviewed === true,
    'CONTROL (P23-3): with a number left readable counted as a tag the writer writes, finishing K4X is refused over a word the screen never masked, and K6X\'s finish stands while the saved body reads "Wei Ling"', `${etHold}\n          ${et.g.reopened ?? 'finish stands'}`);
  // A row the list moves, glued to a number the safety net cuts, places as it did: the engine
  // takes the glued edge for the row as it was (footprintSpans) and as moved (protectedSpans), so
  // the saved body is the text export and costs no remask of its own (wf5 INT-21). The record
  // with no saved body is held to the writer's saved body above (heldToWriter).
  const g1 = RB.find((c) => c.id === 'G1');
  const glued = await attestWith('    if (exact) {\n      const cuts = floorCuts(', '    if (false) {\n      const cuts = floorCuts(');
  check(finishRecord(g1.fin, 'sg', g1.t0).saved === null && glued.finishRecord(g1.fin, 'sg', g1.t0).saved !== null,
    'a row the list moves that stands glued to a phone number places as it did, and the saved body costs no second remask — asked without the engine\'s cuts (CONTROL), the glued edge counts as a change and the body is measured apart');
  // CONTROL: the move as it was until 2026-09-23 (engine.ts asListRow stamped a classless row
  // with the Protected class, which has no two-word prefix): the record, which takes the move
  // to keep a row's class, leaves the finish standing while the saved body reads "Mrs Margaret
  // agreed" — the case's check, and the record held to the writer, both catch it
  const OM = [["cls: e.cls ?? (e.cat === 'protected' ? PROTECTED_CLS : 'PERSON') });", 'cls: e.cls ?? PROTECTED_CLS });']];
  const OMA = await attestWith([], null, OM), OME = await engineWith(OM);
  const classless = play(OMA, cl);
  const clLeak = readableIn(await saved(classless.fin, 'sg', cl.t0, OME), await saved(classless.g, 'sg', cl.t1, OME));
  const clOff = heldToWriter(OMA.finishRecord(classless.g, 'sg', cl.t1), classless.g, await writerSaved(classless.g, 'sg', cl.t1, OME));
  check(clLeak.join() === 'Mrs,Margaret' && classless.g.reviewed === true && clOff.length > 0,
    'CONTROL: under the move as it was, a classless row loses its two-word prefix in the saved body while the record keeps the finish — the case\'s check and the record held to the writer both catch it',
    `readable in the saved .docx now: ${JSON.stringify(clLeak)} · ${classless.g.reopened ?? 'finish stands'}\n          ${clOff.join('\n          ')}`);
  const textExport = play(await attestWith('  if (r && !runsTogether(r, names) && !heldIn(r.text, writerIntervals(r).map((iv) => iv.tag), names)) return null;', '  if (keptWhole(wb)) return null;'), mt);
  check(mt.leaked.join() === 'Kestrel,Holdings' && textExport.g.reviewed === true,
    'CONTROL: measuring the text export in place of the saved body, the list emptied leaves the finish standing while the saved body reads "Kestrel Holdings signed" — the check catches it', textExport.g.reopened ?? 'finish stands');
  // the writer's run-together pass, read by the record: the saved body taken for the text export
  // wherever the table places as the export's does, and the pass left out of the record's mask
  const rt = WF.find((c) => c.id === 'RT'), rh = WF.find((c) => c.id === 'RH');
  const asText = play(await attestWith(...NO_RUNS), rt);
  check(rt.leaked.includes('KestrelHoldings') && asText.g.reviewed === true,
    'CONTROL: the saved body taken for the text export while the writer masks a name run together in it, the list emptied leaves the finish standing while the saved body reads "KestrelHoldings signed" — the check catches it', asText.g.reopened ?? 'finish stands');
  // The record's first pass over a body it saves whole is the text export's, which does not
  // place the list's term run together; the writer's first pass, under the table, does (the
  // engine's run-together rule), and the record reaches the same saved body through the
  // writer's last pass. Without it, RT's finish stands; RH's second pass is under the table.
  const NO_PASS = await attestWith('{ names: names.map((n) => n.name) }', '{ names: [] as string[] }');
  const noPass = play(NO_PASS, rt), noPassH = play(NO_PASS, rh);
  check(rh.leaked.includes('KestrelHoldings') && noPass.g.reviewed === true && noPassH.g.reviewed === false,
    'CONTROL: the record\'s mask handed the writer no names, the writer\'s last pass never runs over the record, and the list emptied leaves RT\'s finish standing while the saved body reads "KestrelHoldings" — the check catches it; with a hidden note in the body the second pass, under the table, masks it and the finish comes off either way',
    `${noPass.g.reopened ?? 'finish stands'} · ${noPassH.g.reopened ?? 'finish stands'}`);
  const nowhere = play(await attestWith([[': !occurs(f, wb.text, e.text, practice))))', ': true)))'], NO_RUNS]), mt);
  check(nowhere.g.reviewed === true,
    'CONTROL: a row the list adds counted as placing nothing though the body says it, the finish stands over the same saved body — the check catches it', nowhere.g.reopened ?? 'finish stands');
  const baseline = play(await attestWith('const was = rec.saved ?? rec.body, is = now.saved ?? now.body;', 'const was = rec.body, is = now.saved ?? now.body;'), mt);
  check(mt.leaked.length > 0 && baseline.g.reviewed === true,
    'CONTROL (saved-baseline-textexport): the saved body compared against the text export at finish, the list emptied leaves the finish standing while the saved body reads "Kestrel Holdings" — the check catches it', baseline.g.reopened ?? 'finish stands');
  const fw = WF.find((c) => c.id === 'FW');
  // the flows as the saved file shows them, unfolded, in place of the record the writer placed over
  const U = await attestWith([['const wf = flowWhere ? written.flows.find((x) => x.part === n) : undefined;', 'const wf = undefined;'],
    ["if (flowWhere) add({ part: n, text: fold(text), kind: 'flow', read: 'text', where: flowWhere });", "if (flowWhere) add({ part: n, text, kind: 'flow', read: 'text', where: flowWhere });"]]);
  const unfolded = play(U, fw, await U.docxMarks(fw.f0.bytes));
  const unfoldedOff = heldToWriter(U.finishRecord(unfolded.fin, 'sg', fw.t0), unfolded.fin, await writerSaved(unfolded.fin, 'sg', fw.t0));
  // the mask now places the surname in its fullwidth letters as well, so the finish comes off
  // under either reading; what the unfolded reading still gets wrong is which text it measured
  check(fw.leaked.length > 0 && unfoldedOff.length > 0,
    'CONTROL (P23-T1): the flows read as the saved file shows them, unfolded, the record measures a header and a footnote the writer never masked — the record held to the writer catches it',
    `${unfolded.g.reopened ?? 'finish stands'}\n          ${unfoldedOff.join('\n          ')}`);

  // CONTROL: recordAt as it was until 2026-09-23 — the stretches that ship rebuilt without the
  // first pass's tags, nothing blanked, and every █ of the second pass's text skipped
  const OLD_RECORD_AT = [
    ['      if (!tagged.has(iv)) { t += iv.tag; for (let x = 0; x < iv.tag.length; x++) at.push(-1); tagged.add(iv); }', '      tagged.add(iv);'],
    ['  const want = blankTags(lay.text, tags);', '  const want = lay.text;'],
    ['  return want === text ? lay.pos : null;', "  const out = new Int32Array(text.length).fill(-1);\n  let w = 0;\n  for (let j = 0; j < text.length; j++) {\n    if (text[j] === '█') continue;\n    if (want[w] !== text[j]) return null;\n    out[j] = lay.pos[w++];\n  }\n  return w === want.length ? out : null;"],
  ];
  const ORA = await attestWith(OLD_RECORD_AT);
  const k4 = RB.find((c) => c.id === 'K4');
  const oldK4 = ORA.finishHold(k4.f0, 'sg', k4.t0);
  const k6 = RB.find((c) => c.id === 'K6'), ltOld = RB.find((c) => c.id === 'LT');
  const oldK6 = play(ORA, k6).g;
  const oldLT = ORA.finishRecord(ltOld.fin, 'sg', ltOld.t0).saved;
  check(quotes(oldK4).some((q) => q.text === 'cooperate') && oldK6.reviewed === true && ['Wei', 'Ling'].every((w) => k6.moved.some((x) => x.startsWith(`${w} @`))) && !!oldLT && oldLT.hidden === null,
    'CONTROL (P2-PATHS-1): under recordAt as it was, the finish over an earlier redaction\'s ████ is refused over "cooperate", a word the screen never masked; the swap-through past a ████ keeps its finish while the saved body ships "Wei Ling" where it masked it at finish; and past a precedent\'s own "[Person1]" the saved body is compared by its words alone — the checks catch all three',
    `${oldK4}\n          K6: ${oldK6.reopened ?? 'finish stands'}\n          LT: ${oldLT ? (oldLT.hidden === null ? 'by its words' : 'read back to the record') : 'no saved body kept'}`);
  // a writer recordAt was not written for — here one that blanks its tags with another
  // character — is compared by its words alone, never read back to the wrong places
  const BLANK = [["(t) => '█'.repeat(t.length)) : text;\n  };", "(t) => '▒'.repeat(t.length)) : text;\n  };"]];
  const BA = await attestWith([], null, [], BLANK), BW = await writerWith(BLANK);
  const lt = RB.find((c) => c.id === 'LT');
  const blanked = play(BA, lt);
  const bRec = BA.finishRecord(blanked.fin, 'sg', lt.t0);
  const bOff = heldToWriter(bRec, blanked.fin, await writerSaved(blanked.fin, 'sg', lt.t0, undefined, BW));
  check(!!bRec.saved && bRec.saved.hidden === null && bOff.length === 0 && blanked.g.reviewed === false,
    'P2T-2: under a writer that blanks its tags for the second pass with another character, the saved body is compared by its words alone — no stretch read back to a place it does not stand — what the record measures is still what that writer saves, and the finish still comes off',
    `${bRec.saved ? (bRec.saved.hidden ? 'read back to the record' : 'by its words') : 'no saved body'} · ${bOff.join('; ') || 'held to the writer'} · ${blanked.g.reopened ?? 'finish stands'}`);
  // CONTROLS (P2T-1): a row the list adds, and a row it moves, asked where they place without
  // the safety net's cuts — as the tolerant pattern alone finds them
  const g2 = RB.find((c) => c.id === 'G2'), sgc = RB.find((c) => c.id === 'SG');
  const uncut = play(await attestWith([["const found = protectedRegex(term, 'i').test(text) || protectedMatches(text, term, practice) > 0;", "const found = protectedRegex(term, 'i').test(text);"], NO_RUNS]), g2);
  check(g2.leaked.includes('Kestrel') && uncut.fin.finish.saved === null && uncut.g.reviewed === true,
    'CONTROL: a row the list adds counted as placing nothing where it stands glued to a number the safety net cuts, the saved body at finish ("Call [Protected2][phone]") is taken for the text export, and the list emptied leaves the finish standing while it reads "Call Kestrel" — the check catches it',
    `${uncut.g.reopened ?? 'finish stands'}`);
  // placesAsBefore both ways: compared under the engine's cuts, and, with a safety-net row left
  // readable, only where neither match takes a glued edge
  // (under the engine and writer as they were before their run-together rules, as above)
  const sgWas = await preRun(PRE0, sgc);
  const uncutSame = await preRun(await preA([['same = protectedSpans(text, e.text, cuts).join() === footprintSpans(text, e.text, cuts).join();', 'same = protectedSpans(text, e.text).join() === footprintSpans(text, e.text).join();']]), sgc);
  const uncutLeft = await preRun(await preA([[' && protectedMatches(text, e.text, practice) === tol.length;', ';'], ['const exact = !entities.some((e) => isFloorRow(e) && e.dead);', 'const exact = false;']]), sgc);
  check(sgWas.leak.length > 0 && sgWas.g.reviewed === false && [uncutSame, uncutLeft].every((x) => x.fin.finish.saved === null && x.g.reviewed === true),
    'CONTROL: under the engine and writer as they were before their run-together rules, a row the list moves counted as placing as before when only its uncut matches agree — under the engine\'s cuts, and where a number is left readable — the saved body at finish is taken for the text export, and the list emptied leaves the finish standing while the saved body reads the glued U+2011 form the row never read — the check catches both',
    `${JSON.stringify(sgWas.leak)} · ${sgWas.g.reopened ?? 'finish stands'}\n          ${uncutSame.g.reopened ?? 'finish stands'} · ${uncutLeft.g.reopened ?? 'finish stands'}`);

  // The two branches of placesAsBefore asked of one row on one text, where they must part: a
  // listed "Kestrel" glued to a telephone number. With no safety-net row left readable the
  // engine cuts at the number and the row places as before; with one left readable the edge is
  // glued, so it is counted as not the same (a remask, never a name). Each is remembered apart:
  // under one key, the first answer given is the one the other case reads (P2-T8).
  {
    const EXP = ['const NONE_EXEMPT: ReadonlySet<string> = new Set();', 'const NONE_EXEMPT: ReadonlySet<string> = new Set();\nexport { placesAsBefore as __placesAsBefore };'];
    const KEY = ["const key = `${practice}\\u0000${exact ? 'x' : ''}\\u0000${e.cls}\\u0000${e.text}`;", 'const key = `${practice}\\u0000${e.cls}\\u0000${e.text}`;'];
    const T = 'Call Kestrel61234567 today.';
    const row = { key: 'k', text: 'Kestrel', tag: '[Protected1]', cat: 'org', cls: 'Protected', prov: 'always-redact list', occ: 1, status: 'confirmed' };
    // the answers are remembered per extracted document (memoFor keys on `docx`)
    const both = (A) => { const f = { text: T, docx: {} }; return [A.__placesAsBefore(f, T, row, 'sg', true), A.__placesAsBefore(f, T, row, 'sg', false)]; };
    const live = both(await attestWith([EXP]));
    check(live.join() === 'true,false',
      'placesAsBefore: "Kestrel" glued to a telephone number places as before where no safety-net row is left readable, and is counted as not the same where one is — each answer kept apart on the same file', live.join(' · '));
    const oneBranch = both(await attestWith([EXP, ['    if (exact) {', '    if (true) {']]));
    const oneKey = both(await attestWith([EXP, KEY]));
    check(oneBranch.join() === 'true,true' && oneKey.join() === 'true,true',
      'CONTROL (P2-T8): the exact branch taken in both cases, or both answers remembered under one key, the row counts as placing as before with a number left readable — the check catches both', `${oneBranch.join(' · ')} | ${oneKey.join(' · ')}`);
  }

  // INT-1 (attack-hidden3): "John " + hidden "Michael " + "Smith", confirmed as "John Michael
  // Smith". The screen and the .txt mask the claimant; until 2026-09-23 the saved .docx named
  // him, because the writer took the hidden run out first and "John Smith" matched no row. The
  // writer places over the document of record now; and a finish over a saved body that would
  // show readable what the screen masks is refused (finishHold, finishFile), and a change after
  // finishing that brings one about takes the finish off — each CONTROL runs the writer as it was.
  {
    const ah = await docxFile('AH3', await makeDocx({ body: pOf(r('John '), hid('Michael '), r('Smith, the claimant, attended.')) }), [person('j', 'John Michael Smith', '[Person1]')], 'sg');
    // the saved body's texts, one per run: "John " and "Smith, the claimant, attended." are two runs
    const line = (t) => JSON.stringify(t.split('\n').filter((l) => /John|Smith|claimant/.test(l)).join(''));
    const names = (t) => /\bJohn\b/.test(t) && /\bSmith\b/.test(t);
    const hold = finishHold(ah, 'sg', []), fin = finishFile(ah, 'sg', []);
    const now = await saved(fin, 'sg', []);
    check(hold === null && fin.reviewed === true && !/John|Michael|Smith/.test(now),
      'INT-1: a name the author broke with a hidden run finishes, and the real writer\'s saved .docx masks every word of it', `${hold ?? 'not refused'} · the saved body ${line(now)}`);
    const OW = await writerWith(OLD_WRITER), OWA = await attestWith([], null, [], OLD_WRITER);
    const was = await saved(fin, 'sg', [], undefined, OW);
    const oldHold = OWA.finishHold(ah, 'sg', []), oldFin = OWA.finishFile(ah, 'sg', []);
    const again = OWA.finishFile({ ...ah, reviewed: true }, 'sg', []);
    check(names(was) && quotes(oldHold).some((q) => q.text === 'John Smith') && oldFin === ah && again.reviewed === false && again.reopened === oldHold && /drop the file again/.test(oldHold ?? ''),
      'CONTROL: under the writer as it was, the saved body reads "John Smith, the claimant" — and the finish is refused, naming "John Smith", saying why and the two ways through; pressed on a file already finished, it takes that finish off with the same words',
      `${line(was)}\n          ${oldHold}`);
    const blind = await attestWith([['const s = rec.saved, b = rec.body;\n  if (!s) return [];', 'const s = rec.saved, b = rec.body;\n  return [];']], null, [], OLD_WRITER);
    check(blind.finishFile(ah, 'sg', []).reviewed === true,
      'CONTROL: under that writer, with the refusal taken out, the finish stands over a saved .docx that names the claimant — the refusal is what stops it');
    // a saved body that cannot be read back to the record is compared by its words: under the
    // writer as it was and with recordAt answering null, the words are what refuse the finish
    const WORDS_ONLY = [['function recordAt(lay: Laid, tags: string[], text: string): Int32Array | null {\n', 'function recordAt(lay: Laid, tags: string[], text: string): Int32Array | null {\n  return null;\n']];
    const WOA = await attestWith(WORDS_ONLY, null, [], OLD_WRITER);
    const byWordsHold = WOA.finishHold(ah, 'sg', []);
    const noWords = await attestWith([...WORDS_ONLY, ['  return [...readableWords(s.bytes, tags)].filter(([w, n]) => (shown.get(w) ?? 0) < n).map(([w]) => w);', '  return [];']], null, [], OLD_WRITER);
    check(WOA.finishRecord(ah, 'sg', []).saved?.hidden === null && ['John', 'Smith'].every((w) => quotes(byWordsHold).some((q) => q.text === w)) && noWords.finishFile(ah, 'sg', []).reviewed === true,
      'CONTROL (P2T-2): under the writer as it was, a saved body compared by its words alone is refused naming "John" and "Smith"; with the word count taken out, the finish stands over a saved .docx that names the claimant — the check catches it', byWordsHold);
    // the same name marked after finishing: the screen masks more, and so does the saved body
    const bare = await docxFile('AH3b', await makeDocx({ body: pOf(r('John '), hid('Michael '), r('Smith, the claimant, attended.')) }), [], 'sg');
    const mark = (f) => withFloor({ ...f, entities: [...f.entities, hand('u1', 'John Michael Smith', '[Person1]')] }, 'sg');
    const f1 = finishFile(bare, 'sg', []), g1 = recheckFinish(f1, mark(f1), 'sg', [], LATER);
    check(f1.reviewed === true && g1.reviewed === true && !/John|Smith/.test(await saved(g1, 'sg', [])),
      'the name marked by hand after finishing keeps the finish: the saved .docx masks it as the screen does', g1.reopened ?? 'finish stands');
    const o1 = OWA.finishFile(bare, 'sg', []), og1 = OWA.recheckFinish(o1, mark(o1), 'sg', [], LATER);
    const wasNow = await saved(og1, 'sg', [], undefined, OW);
    check(o1.reviewed === true && og1.reviewed === false && quotes(og1.reopened).some((q) => q.text === 'John Smith') && og1.reopened.startsWith(`${LATER} took your finish off`) && names(wasNow),
      'CONTROL: under the writer as it was, the same mark takes the finish off — the saved .docx would still say "John Smith" while the screen masks him — and the note says so', og1.reopened);
    // the next write while the finish is off: the note is measured again, and must go on naming
    // what the saved .docx would show — nothing masked at finish is readable, so only the
    // refusal's measure says it
    const next = (A, f) => A.recheckFinish(f, { ...f, entities: [...f.entities] }, 'sg', [], LATER);
    const og2 = next(OWA, og1);
    const OWR = await attestWith([['    const u = x ? [] : unseen();', '    const u: string[] = [];']], null, [], OLD_WRITER);
    const oo1 = OWR.finishFile(bare, 'sg', []), oog2 = next(OWR, OWR.recheckFinish(oo1, mark(oo1), 'sg', [], LATER));
    check(og2.reviewed === false && quotes(og2.reopened).some((q) => q.text === 'John Smith') && oog2.reviewed === false && !quotes(oog2.reopened).some((q) => q.text === 'John Smith'),
      'CONTROL (P2T-2): under the writer as it was, a write made while the finish is off keeps the note naming "John Smith"; with that measure taken out of the reopened branch, the note says nothing masked at finish is readable while the saved .docx names him — the check catches it',
      `${og2.reopened}\n          ${oog2.reopened}`);
  }
}

// ── what the saved .docx carries outside its flows ──
// Style names, ids and aliases, list number texts and names, caption labels, font and theme
// names, a chart's trendline, number format and cell references, field codes: each is masked
// in place, renamed with its style, or shipped as written with the save held when the mask
// places in it. Each case below puts a name in one channel only, finishes, changes the list,
// the practice or the table, and holds the record's answer to what the real writer saves —
// read by carried(), which knows nothing of attest.ts.
console.log('\n— law 3, what the saved .docx carries outside its flows —');
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const CT = 'application/vnd.openxmlformats-officedocument';
/** a package with a body and any of: styles, numbering, settings, fontTable (inner XML of each
 *  root), theme (its name), themeFonts (the inner XML of its font scheme), chart (the
 *  chartSpace's inner XML), extra ([name, whole XML] of a part no relationship names, which the
 *  writer does not know) */
function makePackage(body, parts = {}) {
  const over = [], rels = [], files = [];
  const add = (name, type, relType, xml) => {
    const id = `rId${rels.length + 10}`;
    over.push(`<Override PartName="/word/${name}" ContentType="${type}"/>`);
    rels.push(`<Relationship Id="${id}" Type="${REL}/${relType}" Target="${name}"/>`);
    files.push({ name: `word/${name}`, data: enc(decl + xml) });
    return id;
  };
  if (parts.styles) add('styles.xml', `${CT}.wordprocessingml.styles+xml`, 'styles', `<w:styles ${W_NS}>${parts.styles}</w:styles>`);
  if (parts.numbering) add('numbering.xml', `${CT}.wordprocessingml.numbering+xml`, 'numbering', `<w:numbering ${W_NS}>${parts.numbering}</w:numbering>`);
  if (parts.settings) add('settings.xml', `${CT}.wordprocessingml.settings+xml`, 'settings', `<w:settings ${W_NS}>${parts.settings}</w:settings>`);
  if (parts.fontTable) add('fontTable.xml', `${CT}.wordprocessingml.fontTable+xml`, 'fontTable', `<w:fonts ${W_NS}>${parts.fontTable}</w:fonts>`);
  if (parts.theme) add('theme/theme1.xml', `${CT}.theme+xml`, 'theme', `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${parts.theme}"><a:themeElements><a:clrScheme name="Office"/><a:fontScheme name="Office">${parts.themeFonts ?? ''}</a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`);
  if (parts.chart) add('charts/chart1.xml', `${CT}.drawingml.chart+xml`, 'chart', `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${parts.chart}</c:chartSpace>`);
  const hdr = parts.header ? add('header1.xml', `${CT}.wordprocessingml.header+xml`, 'header', `<w:hdr ${W_NS}>${parts.header}</w:hdr>`) : null;
  for (const [name, xml] of parts.extra ?? []) files.push({ name, data: enc(decl + xml) });
  return writeZip([
    { name: '[Content_Types].xml', data: enc(`${decl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${CT}.wordprocessingml.document.main+xml"/>${over.join('')}${parts.moreTypes ?? ''}</Types>`) },
    { name: '_rels/.rels', data: enc(`${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: enc(`${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}${parts.moreRels ?? ''}</Relationships>`) },
    { name: 'word/document.xml', data: enc(`${decl}<w:document ${W_NS}${parts.docNs ?? ''}><w:body>${body}${hdr ? `<w:sectPr><w:headerReference w:type="default" r:id="${hdr}"/></w:sectPr>` : ''}</w:body></w:document>`) },
    ...files,
  ]);
}
{
  const styled = (t, id) => `<w:p><w:pPr><w:pStyle w:val="${id}"/></w:pPr><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const styleDef = (id, name, extra = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${extra}</w:style>`;
  const fld = (instr, result) => `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${result}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  const form = (ff, code, result) => `<w:p><w:r><w:fldChar w:fldCharType="begin"><w:ffData>${ff}</w:ffData></w:fldChar></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${result}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  const chart = (inner) => `<c:chart><c:plotArea><c:barChart><c:ser>${inner}</c:ser></c:barChart></c:plotArea></c:chart>`;
  const numLit = '<c:val><c:numLit><c:ptCount val="1"/><c:pt idx="0"><c:v>4</c:v></c:pt></c:numLit></c:val>';
  const list = (abs) => `<w:abstractNum w:abstractNumId="0">${abs}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`;
  const SIGN = para('Margaret Tan signed.');
  const MARKUP = 'a name in the .docx’s markup';
  // the document of record: a span the note quotes with no place after it
  const DOC = 'the document';
  const MC = ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
  const EMPTIED ={ p0: 'sg', t0: ['Kestrel'], p1: 'sg', t1: [], change: (f) => f, cause: 'Changing the always-redact list in Settings' };
  const SSN = '<w:captions><w:caption w:name="Exhibit 123-45-6789" w:pos="below"/></w:captions>';
  const eqP = (inner) => `<w:p><m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inner}</m:oMath></w:p>`;
  const mr = (t) => `<m:r><m:t>${t}</m:t></m:r>`, mrw = (t) => `<m:r><w:t>${t}</w:t></m:r>`;
  const om = (inner) => `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inner}</m:oMath>`, wr = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const fmt = (code) => `<c:val><c:numLit><c:formatCode>${code}</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4</c:v></c:pt></c:numLit></c:val>`;
  const PP_V3 = 'https://urldefense.com/v3/__https://firm/sites/Osprey*E2Lane/brief.docx__;JQ!!AbC!xyz$';
  const PP_V2 = 'https://urldefense.proofpoint.com/v2/url?u=https-3A__firm_sites_Osprey-E2Lane_brief.docx&amp;d=DwMF';
  const OSPREY_LEFT = { rows: [person('m', 'Margaret Tan', '[Person1]'), person('o', 'Osprey Lane', '[Person2]')], t0: [], t1: [], cause: 'A change made after you finished', probe: /osprey/i, held: true,
    change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['o'], { dead: true, status: 'ignored' }) }, 'sg') };
  const US_TO_SG = { p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore' };
  const KES_ESCAPED = { t0: ['Kestrel Holdings'], held: true, probe: /Kes(?:%u0074|&#116;|&#x74;)rel/ };
  const W14 = ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';
  const ACME = ' xmlns:acme="urn:acme:crm"';
  const INNER = 'the .docx’s internal markup';
  const LATER = 'A change made after you finished';
  const MT = person('m', 'Margaret Tan', '[Person1]');
  const leaveRow = (key) => (f) => withFloor({ ...f, entities: decideRows(f.entities, [key], { dead: true, status: 'ignored' }) }, 'sg');
  // a row added by hand, taken back as the Review screen takes it back (review.ts withdrawRow)
  const withdrawn = (key) => (f) => withFloor({ ...f, entities: withdrawRow(f.entities, f.entities.find((e) => e.key === key)) }, 'sg');
  const SHORT_LISTED = { t0: ['4417'], held: true, probe: /4417/ };
  const MATTER_WITHDRAWN = { rows: [MT, hand('h', '4521', '[Code1]')], t0: [], t1: [], change: withdrawn('h'), cause: LATER, held: true, probe: /4521/ };
  const C = [
    ['a paragraph style\'s name', 'a style name', [styled('Recitals.', 'KHead') + SIGN, { styles: styleDef('KHead', 'Kestrel Heading') }]],
    ['a style\'s id only', 'a style name', [styled('Recitals.', 'KestrelBody') + SIGN, { styles: styleDef('KestrelBody', 'Body Client') }]],
    ['a style\'s alias', 'a style name', [styled('Recitals.', 'BC') + SIGN, { styles: styleDef('BC', 'Body Client', '<w:aliases w:val="Kestrel body"/>') }]],
    ['a STYLEREF to a style the file defines (renamed with the style, never held)', 'a style name', [styled('Recitals.', 'KHead') + `<w:p><w:fldSimple w:instr=' STYLEREF "Kestrel Heading" '><w:r><w:t>Recitals.</w:t></w:r></w:fldSimple></w:p>` + SIGN, { styles: styleDef('KHead', 'Kestrel Heading') }]],
    ['a TOC \\t naming a style the file defines (renamed with the style, never held)', 'a style name', [styled('Recitals.', 'KHead') + fld(' TOC \\o "1-3" \\t "Kestrel Heading,1" \\h ', 'Recitals 1') + SIGN, { styles: styleDef('KHead', 'Kestrel Heading') }]],
    ['a TOC \\t list of two defined styles, one after the client', 'a style name', [styled('A.', 'KHead') + styled('B.', 'Plain') + fld(' TOC \\t "Plain Heading;1;Kestrel Heading;2" \\h ', 'x') + SIGN, { styles: styleDef('KHead', 'Kestrel Heading') + styleDef('Plain', 'Plain Heading') }]],
    ['a latent style exception', 'a style name', [SIGN, { styles: '<w:latentStyles><w:lsdException w:name="Kestrel Quote" w:uiPriority="29"/></w:latentStyles>' + styleDef('Normal', 'Normal') }]],
    ['a list\'s number text', 'a list’s number text', [SIGN, { numbering: list('<w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="Kestrel Schedule %1"/></w:lvl>') }]],
    ['a font the text uses', 'a font name', [`<w:p><w:r><w:rPr><w:rFonts w:ascii="Kestrel Sans" w:hAnsi="Kestrel Sans"/></w:rPr><w:t>Recitals.</w:t></w:r></w:p>` + SIGN, { fontTable: '<w:font w:name="Kestrel Sans"><w:family w:val="swiss"/></w:font>' }]],
    ['a font in the font table only', 'a font name', [SIGN, { styles: styleDef('Normal', 'Normal'), fontTable: '<w:font w:name="Kestrel Serif"/>' }]],
    ['a theme name', 'a theme name', [SIGN, { theme: 'Kestrel Theme' }]],
    ['a chart\'s trendline name', 'a trendline name', [SIGN, { chart: chart(`<c:trendline><c:name>Kestrel trend</c:name><c:trendlineType val="linear"/></c:trendline>${numLit}`) }]],
    ['a chart\'s number format', 'a number format', [SIGN, { chart: chart('<c:val><c:numLit><c:formatCode>"Kestrel" 0</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4</c:v></c:pt></c:numLit></c:val>') }]],
    // a font, theme or colour name is replaced whole when any reading of it places, and a
    // standard font never (docxWrite identValue)
    ['a font name with nothing between its words (KestrelSans), on a run and in the font table', 'a font name', [`<w:p><w:r><w:rPr><w:rFonts w:ascii="KestrelSans" w:hAnsi="KestrelSans"/></w:rPr><w:t>Recitals.</w:t></w:r></w:p>` + SIGN, { fontTable: '<w:font w:name="KestrelSans"/>' }]],
    ['a drawn shape\'s font (a VML style\'s font-family)', 'a font name', [`<w:p><w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml" id="_x0000_s1025" style="position:absolute;margin-left:0;font-family:&quot;Kestrel Sans&quot;"/></w:pict></w:r></w:p>` + SIGN, {}]],
    // the name read with the whole mask as written — the safety-net pattern too (P2-T6)
    ['a font name carrying an SSN ("Font 123-45-6789"), practice United States to Singapore', 'a font name', [`<w:p><w:r><w:rPr><w:rFonts w:ascii="Font 123-45-6789" w:hAnsi="Font 123-45-6789"/></w:rPr><w:t>Recitals.</w:t></w:r></w:p>` + SIGN, {}],
      { p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore', probe: /123-45-6789/ }],
    // An equation is masked as it renders, after the passes over the flow it stands in and over
    // what they left (docxWrite maskMath): the runs of one stretch side by side with nothing
    // between them, whatever holds a run's text — m:t, or a w:t inside m:r — a box printing its
    // argument in line, each zone by the whole mask and then for the table's names. What it
    // masks is part of the flow the writer saves, so it is named where the flow is. Read run by
    // run, the split ones left the finish standing (wf5 INT-2, INT-9); read as marks of their
    // own, the SSN ones stood on a practice switch and came off over a stretch the writer still
    // masked (P2-1..3).
    ['an equation whose two runs split a listed name ("Kes" + "trel")', BODY, [eqP(mr('Kes') + mr('trel')) + SIGN, {}], { eq: true }],
    ['an equation whose boxed run ends a listed name ("Kes" + a box holding "trel")', BODY, [eqP(mr('Kes') + `<m:box><m:e>${mr('trel')}</m:e></m:box>`) + SIGN, {}], { eq: true }],
    ['an equation whose two runs hold their text in a w:t, splitting a listed name ("Har" + "row")', BODY, [eqP(mrw('Har') + mrw('row')) + SIGN, {}],
      { eq: true, t0: ['Harrow'], probe: /harrow/i }],
    ['an equation in a header whose two runs split a listed name ("Kes" + "trel")', 'a header', [SIGN, { header: eqP(mr('Kes') + mr('trel')) }], { eq: true }],
    ['an SSN typed across two runs of an equation ("123-45-" + "6789"), practice United States to Singapore', BODY, [eqP(mr('123-45-') + mr('6789')) + SIGN, {}],
      { eq: true, p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore', probe: /123-45-6789/ }],
    ['an SSN typed across two runs of an equation in a header, practice United States to Singapore', 'a header', [SIGN, { header: eqP(mr('123-45-') + mr('6789')) }],
      { eq: true, p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore', probe: /123-45-6789/ }],
    ['an equation "Margaret T" + "an", a row "Margaret" added by hand (the zone masked whole at finish, "Tan" left after the shorter row)', BODY, [eqP(mr('Margaret T') + mr('an')) + para('The parties signed.'), {}],
      { eq: true, t0: [], change: (f) => withFloor({ ...f, entities: [...f.entities, hand('u1', 'Margaret', '[Person2]')] }, 'sg'), cause: 'A change made after you finished', probe: /\btan\b/i }],
    // what joins one zone to the next as Word renders them (docxWrite mathZones), read from how
    // each run stood at the drop (equationsOf): text touching an equation, two equations side by
    // side — each with the space the walker puts before an equation for reading only — and a
    // phantom Word does not show, which renders nothing between the runs either side of it
    // (W5R-7). Each field lost, the record reads the zones apart and a finish stands while the
    // saved .docx renders the withdrawn name (P23-1)
    ['an equation touching the text before it, the two splitting a listed name ("Call Kes" + an equation "trel")', BODY, [`<w:p>${wr('Call Kes')}${om(mr('trel'))}${wr(' today.')}</w:p>` + SIGN, {}], { eq: true }],
    ['two equations side by side splitting a listed name ("Kes", "trel")', BODY, [`<w:p>${wr('Call ')}${om(mr('Kes'))}${om(mr('trel'))}${wr(' today.')}</w:p>` + SIGN, {}], { eq: true }],
    // the saved file still carries the phantom's "zz" between the two, so the note quotes them
    // apart, as the record holds them
    ['an equation whose runs split a listed name around a phantom Word does not show ("Kes", a hidden "zz", "trel")', BODY, [eqP(mr('Kes') + `<m:phant><m:phantPr><m:show m:val="0"/><m:zeroWid m:val="1"/></m:phantPr><m:e>${mr('zz')}</m:e></m:phant>` + mr('trel')) + SIGN, {}], { eq: true, probe: /^(?:Kes|trel)$/ }],
    ['a confirmed row written only in an equation, in a w:t with nothing between its words, left visible after finishing', DOC, [eqP(mrw('OspreyLane')) + para('The parties signed.'), {}],
      { eq: true, rows: [person('o', 'Osprey Lane', '[Person1]')], t0: [], change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['o'], { dead: true, status: 'ignored' }) }, 'sg'), cause: 'A change made after you finished', probe: /osprey/i }],
    // and where the writer masks the same after the change as at finish, the finish stands: the
    // list emptied of a name the table's own row still finds run together; the practice still
    // masking an SSN taken off the list; a row switched off while another still covers the zone
    ['an equation that writes a listed name with nothing between its words, the list emptied (the row the list put in the table still finds it)', null, [eqP(mr('KestrelHoldings')) + SIGN, {}],
      { eq: true, t0: ['Kestrel Holdings'] }],
    ['an SSN across two runs of an equation, taken off the list under United States (the practice still masks it)', null, [eqP(mr('123') + mr('-45-6789')) + para('Harrow Leung signed.'), {}],
      { eq: true, rows: [person('h', 'Harrow Leung', '[Person1]')], p0: 'us', t0: ['123-45-6789'], p1: 'us', probe: /6789/ }],
    ['an SSN across two runs of an equation in a header, taken off the list under United States', null, [para('Harrow Leung signed.'), { header: eqP(mr('123') + mr('-45-6789')) }],
      { eq: true, rows: [person('h', 'Harrow Leung', '[Person1]')], p0: 'us', t0: ['123-45-6789'], p1: 'us', probe: /6789/ }],
    ['an equation "Margaret Tan" in one run, the shorter row "Tan" switched off (the longer still masks it)', null, [eqP(mr('Margaret Tan')) + para('The parties signed.'), {}],
      { eq: true, rows: [person('a', 'Margaret Tan', '[Person1]'), person('b', 'Tan', '[Person2]')], t0: [], change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['b'], { dead: true, status: 'ignored', decided: true }) }, 'sg'), cause: 'A change made after you finished', probe: /tan/i }],
    ['an equation "Ta" + a box holding "n Wei Ling", the longer row switched off (the zone masked as before)', null, [eqP(mr('Ta') + `<m:box><m:e>${mr('n Wei Ling')}</m:e></m:box>`) + para('The parties signed.'), {}],
      { eq: true, rows: [person('a', 'Tan Wei Ling', '[Person1]'), person('b', 'Wei Ling', '[Person2]')], t0: [], change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['a'], { dead: true, status: 'ignored', decided: true }) }, 'sg'), cause: 'A change made after you finished', probe: /tan|wei|ling/i }],
    ['a standard font whose name is a listed term (Georgia)', null, [`<w:p><w:r><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/></w:rPr><w:t>Recitals.</w:t></w:r></w:p>` + SIGN, { fontTable: '<w:font w:name="Georgia"/>' }],
      { t0: ['Georgia'], probe: /georgia/i }],
    // a built-in style is Word's vocabulary: never renamed for its name, and an alias of one
    // that places goes on its own
    ['a built-in style whose name is a listed term (Strong)', null, [styled('Recitals.', 'Strong') + SIGN, { styles: styleDef('Strong', 'Strong') }],
      { t0: ['Strong'], probe: /strong/i }],
    ['an alias of a built-in style', 'a style name', [styled('Recitals.', 'Quote') + SIGN, { styles: styleDef('Quote', 'Quote', '<w:aliases w:val="Kestrel pull quote"/>') }]],
    ['a TOC \\t instruction split across two runs, naming a style the file does not define', 'a field code', [`<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\t "Kes</w:instrText></w:r><w:r><w:instrText xml:space="preserve">trel Custom,1" \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>x</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>` + SIGN, { styles: styleDef('Normal', 'Normal') }], { held: true }],
    ['a TOC \\t naming a style the file does not define', 'a field code', [fld(' TOC \\o "1-3" \\t "Kestrel Custom,1" \\h ', 'x') + SIGN, { styles: styleDef('Normal', 'Normal') }], { held: true }],
    ['a pStyle naming a style the file does not define', 'a style name', [styled('Recitals.', 'KestrelLegacy') + SIGN, { styles: styleDef('Normal', 'Normal') }], { held: true }],
    ['a firm name an identifier carries with nothing between its words (O\'Brien Kessler in OBrienKesslerMemo)', 'a style name', [styled('Memo.', 'OBrienKesslerMemo') + SIGN, { styles: styleDef('OBrienKesslerMemo', 'Memo Body') }],
      { t0: ["O'Brien Kessler"], probe: /o.?brien|kessler/i }],
    ['a person row left visible, whose name a style id carries', 'a style name', [styled('Letter.', 'MargaretTanLetter') + SIGN, { styles: styleDef('MargaretTanLetter', 'Letter Style') }],
      { t0: [], change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['m'], { dead: true, status: 'ignored' }) }, 'sg'), cause: 'A change made after you finished', probe: /margaret/i }],
    // the writer reads a style's id as written and with its underscores as spaces, and a number
    // format's quoted literals, with the safety-net pattern too (docxWrite scanStyles,
    // maskValue): under United States the SSN there is renamed or masked, and a switch to
    // Singapore ships it — as a practice switch ships the SSN in a header (D1)
    ['an SSN-shaped style id, practice United States to Singapore', 'a style name', [styled('Memo.', 'Memo_123-45-6789') + SIGN, { styles: styleDef('Memo_123-45-6789', 'Memo Body') }],
      { p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore', probe: /123-45-6789/ }],
    ['an SSN in a chart\'s number format, practice United States to Singapore', 'a number format', [SIGN, { chart: chart('<c:val><c:numLit><c:formatCode>"123-45-6789" 0</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>4</c:v></c:pt></c:numLit></c:val>') }],
      { p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore', probe: /123-45-6789/ }],
    // Excel stores a format's literals one character at a time or in several quoted runs, and the
    // writer reads each stretch as it prints (docxWrite formatRuns): read one quoted run or one
    // escape at a time, the record left these finishes standing while a switch shipped the SSN
    // (wf5 INT-3). A digit outside every quoted run and escape is not in a stretch the writer
    // reads as printed, and the record reads what the writer masks: a switch that stops the
    // pattern reading one changes nothing the saved .docx carries (P23-4).
    ['an SSN escaped one character at a time in a chart\'s number format, practice United States to Singapore', 'a number format', [SIGN, { chart: chart(fmt('\\1\\2\\3\\-\\4\\5\\-\\6\\7\\8\\9 0')) }],
      { p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore', probe: /\\1\\2\\3/ }],
    ['an SSN in three quoted runs in a chart\'s number format, practice United States to Singapore', 'a number format', [SIGN, { chart: chart(fmt('"123"-"45"-"6789" 0')) }],
      { p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore', probe: /123/ }],
    ['an SSN-shaped run of digits in a chart number format\'s code, outside any quotes or escape (123-45-6789#,##0), practice United States to Singapore', null, [SIGN, { chart: chart(fmt('123-45-6789#,##0')) }],
      { p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore', probe: /123-45-6789/ }],
    // the writer renames these whatever they say — List1, Label1, Sheet1 — so no change to the
    // table can make them readable (docxWrite listName, labelName, the chart's formulas)
    ['a list definition\'s name', null, [SIGN, { numbering: list('<w:name w:val="Kestrel clauses"/><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>') }]],
    ['a caption label', null, [SIGN, { settings: '<w:captions><w:caption w:name="Kestrel Exhibit" w:pos="below"/></w:captions>' }]],
    ['an SSN in a caption label, practice United States to Singapore', null, [SIGN, { settings: SSN }],
      { p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore', probe: /123-45-6789/ }],
    ['a kept SEQ field\'s counter', null, [fld(' SEQ Kestrel_Exhibit \\* ARABIC ', '1') + SIGN, {}]],
    ['a chart\'s worksheet name', null, [SIGN, { chart: chart(`<c:cat><c:strRef><c:f>'Kestrel data'!$A$2:$A$3</c:f></c:strRef></c:cat>${numLit}`) }]],
    // the writer removes these, or renames the bookmark: nothing to leave readable
    ['a legacy form field\'s dropdown entry', null, [form('<w:name w:val="Dropdown1"/><w:enabled/><w:ddList><w:listEntry w:val="Kestrel Holdings"/><w:listEntry w:val="Other"/></w:ddList>', 'FORMDROPDOWN', 'Other') + SIGN, {}]],
    ['a legacy form field\'s help text', null, [form('<w:name w:val="Text1"/><w:enabled/><w:helpText w:type="text" w:val="Enter the Kestrel matter"/><w:textInput/>', 'FORMTEXT', 'x') + SIGN, {}]],
    ['a legacy form field\'s macro name', null, [form('<w:name w:val="Text2"/><w:enabled/><w:entryMacro w:val="KestrelFill"/><w:textInput/>', 'FORMTEXT', 'x') + SIGN, {}]],
    ['a PAGEREF to an author bookmark', null, [`<w:p><w:bookmarkStart w:id="3" w:name="KestrelSPA"/><w:r><w:t>The SPA governs.</w:t></w:r><w:bookmarkEnd w:id="3"/></w:p>` + fld(' PAGEREF KestrelSPA \\h ', '4') + SIGN, {}]],
    // the writer holds the save on a kept field while ANY listed term is in it: one of two
    // taken off the list leaves it held, and nothing of it ships
    ['a kept field naming two listed terms, one taken off the list (the writer still holds on the other)', null, [fld(' TOC \\o "1-3" \\t "Kestrel Osprey Custom,1" \\h ', 'x') + SIGN, { styles: styleDef('Normal', 'Normal') }],
      { t0: ['Kestrel', 'Osprey'], t1: ['Kestrel'] }],
    // a font name is replaced whole while any listed term places in it: one of two taken off
    // the list leaves "Redacted font 1" in the saved .docx, and nothing of the name ships
    ['a font whose name carries two listed terms, one taken off the list (the writer still replaces it whole on the other)', null, [`<w:p><w:r><w:rPr><w:rFonts w:ascii="Kestrel Osprey Sans" w:hAnsi="Kestrel Osprey Sans"/></w:rPr><w:t>Clause one applies.</w:t></w:r></w:p>` + SIGN, {}],
      { t0: ['Kestrel', 'Osprey'], t1: ['Kestrel'] }],
    // a machine value (a language tag) is read with rows of six characters or more only: a
    // four-letter listed name in it was never masked, so taking it off the list unmasks nothing
    ['a four-letter listed name in a run\'s language tag, taken off the list', null, ['<w:p><w:r><w:rPr><w:lang w:val="park"/></w:rPr><w:t>Recitals.</w:t></w:r></w:p>' + SIGN, {}],
      { t0: ['Park'], probe: /park/i }],
    // and so is a theme's script code, Word's own four letters ("Hans", "Thai"; docxWrite
    // fontScript), in every theme Office writes: a given name "Hans" on the list was never held
    // there, so taking it off the list releases nothing
    ['a listed given name that is a theme\'s script code ("Hans"), taken off the list', null, [SIGN, { theme: 'Office Theme', themeFonts: '<a:majorFont><a:latin typeface="Calibri Light"/><a:font script="Hans" typeface="SimSun"/><a:font script="Thai" typeface="Tahoma"/></a:majorFont>' }],
      { t0: ['Hans'], probe: /hans/i }],
    // a name of the table run together with what stands beside it is masked where it stands in
    // text a reader sees and in a number format, and holds the save in any value shipped as
    // written (docxWrite maskValue, maskFormat, readOutput; owner ruling 1). Each of these was
    // masked or held at finish, and read by nothing in the record until this round (INT-2, INT-3)
    ['a chart\'s trendline name that runs a listed firm together (KestrelHoldings)', 'a trendline name', [SIGN, { chart: chart(`<c:trendline><c:name>KestrelHoldings trend</c:name><c:trendlineType val="linear"/></c:trendline>${numLit}`) }],
      { t0: ['Kestrel Holdings'] }],
    ['a list\'s number text that runs a listed firm together', 'a list’s number text', [SIGN, { numbering: list('<w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="KestrelHoldings Schedule %1"/></w:lvl>') }],
      { t0: ['Kestrel Holdings'] }],
    ['a number format whose quoted literal runs a listed firm together', 'a number format', [SIGN, { chart: chart(fmt('"KestrelHoldings" 0')) }],
      { t0: ['Kestrel Holdings'] }],
    ['a number format whose currency section runs a listed firm together', 'a number format', [SIGN, { chart: chart(fmt('[$KestrelHoldings-409] 0')) }],
      { t0: ['Kestrel Holdings'] }],
    // a hit in a currency section takes the section whole: one of two names taken off the list
    // leaves it masked whole on the other
    ['a currency section naming two listed terms, one taken off the list (the writer still masks the section whole on the other)', null, [SIGN, { chart: chart(fmt('[$Kestrel Osprey-409] 0')) }],
      { t0: ['Kestrel', 'Osprey'], t1: ['Kestrel'] }],
    // a bracket quoted or escaped only looks like a currency section: the writer masks each name
    // in it alone, so the one taken off the list ships (P2-T5)
    ['a quoted look-alike of a currency section naming two listed terms, one taken off the list', 'a number format', [SIGN, { chart: chart(fmt('"[$Kestrel Osprey-409]" 0')) }],
      { t0: ['Kestrel', 'Osprey'], t1: ['Kestrel'], probe: /osprey/i }],
    ['an escaped look-alike of a currency section naming two listed terms, one taken off the list', 'a number format', [SIGN, { chart: chart(fmt('\\[$Kestrel Osprey-409] 0')) }],
      { t0: ['Kestrel', 'Osprey'], t1: ['Kestrel'], probe: /osprey/i }],
    // a name in the markup — a namespace's prefix, an element's name — ships as written and
    // holds the save while one of the table's names is in it (docxWrite readOutput nsDecl,
    // qnameRead)
    ['a namespace prefix that is a listed term', MARKUP, ['<w:p xmlns:kestrel="urn:example:one"><w:r><w:t>Recitals.</w:t></w:r></w:p>' + SIGN, {}],
      { held: true }],
    ['an element name that runs a listed firm together', MARKUP, ['<w:p><w:r><w:t>Recitals.</w:t></w:r><acme:KestrelHoldings xmlns:acme="urn:example:one"/></w:p>' + SIGN, {}],
      { t0: ['Kestrel Holdings'], held: true }],
    // one for each reader of the markup the writer holds on (qnameRead's attribute names, mcList,
    // nsDecl's addresses, schemaRest, the relationship ids, a code word in a part it does not
    // know): each could be deleted with every case above still passing (P2-T4)
    ['an attribute name that runs a listed firm together, on a paragraph', MARKUP, ['<w:p xmlns:acme="urn:example:one" acme:KestrelHoldings="1"><w:r><w:t>Recitals.</w:t></w:r></w:p>' + SIGN, {}],
      { t0: ['Kestrel Holdings'], held: true }],
    ['a markup-compatibility list naming an element that runs a listed firm together (mc:ProcessContent="ad:KestrelHoldings")', MARKUP, [SIGN, { docNs: `${MC} xmlns:ad="urn:example:addin" mc:Ignorable="ad" mc:ProcessContent="ad:KestrelHoldings"` }],
      { held: true }],
    ['a markup-compatibility list naming an undeclared prefix that is a listed term (mc:Ignorable="kestrel")', MARKUP, [SIGN, { docNs: `${MC} mc:Ignorable="kestrel"` }], { held: true }],
    ['a namespace address carrying a listed name (urn:kestrel-holdings:matter)', MARKUP, [SIGN, { docNs: ' xmlns:ad="urn:kestrel-holdings:matter"' }], { held: true }],
    // (an address in a part the writer does not know is text there, and that part holds the
    // save whatever the list says: the address is read on a paragraph)
    ['an address on purl.org carrying a listed name, on a paragraph', 'the .docx’s internal markup', ['<w:p w:rsidR="00A1" ad:src="http://purl.org/matters/Kestrel Holdings"><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', { docNs: ' xmlns:ad="urn:example:addin"' }],
      { t0: ['Kestrel Holdings'], held: true }],
    ['a code word carrying a short listed name (limAcq), in a part the writer does not know', 'the .docx’s internal markup', [SIGN, { extra: [['word/addin1.xml', '<ad:data xmlns:ad="urn:example:addin"><ad:rec ad:key="limAcq"/></ad:data>']] }],
      { t0: ['Lim'], held: true, probe: /lim/i }],
    ['a relationship id carrying a short listed name (limHdr)', 'the .docx’s internal markup', [para('Recitals.') + SIGN, { moreRels: `<Relationship Id="limHdr" Type="${REL}/header" Target="header9.xml"/>`, moreTypes: `<Override PartName="/word/header9.xml" ContentType="${CT}.wordprocessingml.header+xml"/>`, extra: [['word/header9.xml', `<w:hdr ${W_NS}><w:p><w:r><w:t>H</w:t></w:r></w:p></w:hdr>`]] }],
      { t0: ['Lim'], held: true, probe: /lim/i }],
    // a part the writer does not know holds the file on a number the safety-net pattern masks
    // anywhere in it (owner ruling 2); once the lawyer leaves that number readable in the body,
    // the pattern passes it wherever it stands, and the part ships it. No practice switch ships
    // one: every practice runs the frozen table, which masks a bare run of digits ("61234567"
    // held under United States as under Singapore), and a punctuated number in such a part is
    // no code, so the part holds as text under any practice ("123-45-6789", measured)
    ['a telephone number an add-in keeps as a code in a part the writer does not know, the same number left readable in the body after finishing', 'the .docx’s internal markup',
      [para('Call 61234567 for the desk.') + SIGN, { extra: [['word/addin1.xml', '<ad:data xmlns:ad="urn:example:addin"><ad:rec ad:tel="61234567"/></ad:data>']] }],
      { p0: 'sg', t0: [], p1: 'sg', t1: [], cause: 'A change made after you finished', probe: /61234567/, held: true,
        change: (f) => withFloor({ ...f, entities: decideRows(f.entities, f.entities.filter((e) => isFloorRow(e) && e.text === '61234567').map((e) => e.key), { dead: true, status: 'ignored' }) }, 'sg') }],
    // the same number as the text of the add-in's own element: read by the safety net at the
    // writer's gate, as the add-in's attribute is (elemNet, W-LEAK-3), and by the part's own reading
    ['a telephone number an add-in keeps as its element\'s text in a part the writer does not know, the same number left readable in the body after finishing', 'the .docx’s internal markup',
      [para('Call 61234567 for the desk.') + SIGN, { extra: [['word/addin1.xml', '<ad:data xmlns:ad="urn:example:addin"><ad:rec><ad:tel>61234567</ad:tel></ad:rec></ad:data>']] }],
      { p0: 'sg', t0: [], p1: 'sg', t1: [], cause: 'A change made after you finished', probe: /61234567/, held: true,
        change: (f) => withFloor({ ...f, entities: decideRows(f.entities, f.entities.filter((e) => isFloorRow(e) && e.text === '61234567').map((e) => e.key), { dead: true, status: 'ignored' }) }, 'sg') }],
    // the same number as the name of the add-in's part: read by the part's own reading alone
    // (netName over the part's name), so this is the case that reading answers for. Its text
    // written with escapes, the other value only that reading reads, holds the save as text
    // whatever the number does
    ['a telephone number an add-in writes into the name of a part the writer does not know, the same number left readable in the body after finishing', 'the .docx’s internal markup',
      [para('Call 61234567 for the desk.') + SIGN, { extra: [['word/tel61234567.xml', '<ad:data xmlns:ad="urn:example:addin"><ad:rec/></ad:data>']] }],
      { p0: 'sg', t0: [], p1: 'sg', t1: [], cause: 'A change made after you finished', probe: /61234567/, held: true,
        change: (f) => withFloor({ ...f, entities: decideRows(f.entities, f.entities.filter((e) => isFloorRow(e) && e.text === '61234567').map((e) => e.key), { dead: true, status: 'ignored' }) }, 'sg') }],
    // An add-in's attribute in a part Word writes is read by the safety-net pattern as written
    // (owner ruling 11, attrNet); an attribute with no prefix on a WordprocessingML element is in
    // no namespace, so its name is read (owner ruling 12, nsOfName); an escape that writes no
    // character where a name could stand holds (owner ruling 10, pctHidden); and in a part Word
    // never wrote, a name under Word's own prefix is read (P2T6-2). Each held the save at finish
    // and shipped with the finish standing until the record read it as the writer does
    // (P2-PATHS A2, A6, C3, C5, C6; P2T6-2 S3, S5)
    ['an SSN an add-in wrote on a body paragraph, practice United States to Singapore', 'the .docx’s internal markup',
      ['<w:p xmlns:acme="urn:example:crm" acme:ssn="123-45-6789"><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}],
      { p0: 'us', t0: [], p1: 'sg', change: (f) => withFloor(f, 'sg'), cause: 'Switching the practice to Singapore', probe: /123-45-6789/, held: true }],
    ['an unprefixed attribute name that runs a listed firm together, on a paragraph (KestrelHoldings="1")', MARKUP, ['<w:p KestrelHoldings="1"><w:r><w:t>Recitals.</w:t></w:r></w:p>' + SIGN, {}],
      { t0: ['Kestrel Holdings'], held: true }],
    ['a namespace address with a malformed escape inside a listed name (Osprey%E2Lane)', MARKUP, [SIGN, { docNs: ' xmlns:ad="urn:example:Osprey%E2Lane"' }],
      { t0: ['Osprey Lane'], held: true, probe: /osprey/i }],
    ['an add-in\'s link with a malformed escape inside a listed name (Osprey%E2Lane), on a paragraph', 'the .docx’s internal markup',
      ['<w:p xmlns:ad="urn:example:addin" ad:src="https://dms/sites/Osprey%E2Lane/x"><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}],
      { t0: ['Osprey Lane'], held: true, probe: /osprey/i }],
    ['an element under Word\'s prefix that runs a listed firm together, in a part the writer does not know (<w:KestrelHoldings/>)', MARKUP,
      [para('Recitals.') + SIGN, { extra: [['word/acme1.xml', `<acme:root xmlns:acme="urn:example:one" ${W_NS}><w:KestrelHoldings/></acme:root>`]] }], { t0: ['Kestrel Holdings'], held: true }],
    ['a markup-compatibility list naming Word\'s prefix and a listed firm run together, in a part the writer does not know (mc:ProcessContent="w:KestrelHoldings")', MARKUP,
      [para('Recitals.') + SIGN, { extra: [['word/acme2.xml', `<acme:root xmlns:acme="urn:example:one"${MC} ${W_NS} mc:ProcessContent="w:KestrelHoldings"><acme:x/></acme:root>`]] }], { t0: ['Kestrel Holdings'], held: true }],
    // a flow the writer's gate holds on though its passes place nothing there: the note quotes
    // the link, and says the writer held the save on it
    ['a pasted link in the body with a malformed escape inside a name of the table (Osprey%E2Lane), the row left readable', 'the body of the saved .docx',
      [para('Filed at https://firm/sites/Osprey%E2Lane/brief.docx today.') + SIGN, {}],
      { rows: [person('m', 'Margaret Tan', '[Person1]'), person('o', 'Osprey Lane', '[Person2]')], t0: [], t1: [], cause: 'A change made after you finished', probe: /osprey/i, held: true,
        change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['o'], { dead: true, status: 'ignored' }) }, 'sg') }],
    ['a pasted link in a header with a malformed escape inside a name of the table (Osprey%E2Lane), the row left readable', 'a header',
      [SIGN, { header: para('Filed at https://firm/sites/Osprey%E2Lane/brief.docx today.') }],
      { rows: [person('m', 'Margaret Tan', '[Person1]'), person('o', 'Osprey Lane', '[Person2]')], t0: [], t1: [], cause: 'A change made after you finished', probe: /osprey/i, held: true,
        change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['o'], { dead: true, status: 'ignored' }) }, 'sg') }],
    // the same link after a mail gateway rewrote it, which writes the escape with no '%': "-E2"
    // (Proofpoint v2), "*E2" with the '%' listed after "__;" (v3). The gate holds on either
    // (docxWrite hasEscape), and the record looked for a held escape only in a flow that carried
    // a literal '%': each held the save at finish and shipped with the finish standing once the
    // row was left readable (F-FIN-PP)
    ['a Proofpoint v3 link in the body with a malformed escape inside a name of the table (Osprey*E2Lane), the row left readable', BODY,
      [para(`Filed at ${PP_V3} today.`) + SIGN, {}], OSPREY_LEFT],
    ['a Proofpoint v2 link in the body with a malformed escape inside a name of the table (Osprey-E2Lane), the row left readable', BODY,
      [para(`Filed at ${PP_V2} today.`) + SIGN, {}], OSPREY_LEFT],
    ['a Proofpoint v3 link in a header with a malformed escape inside a name of the table (Osprey*E2Lane), the row left readable', 'a header',
      [SIGN, { header: para(`Filed at ${PP_V3} today.`) }], OSPREY_LEFT],
    // An SSN an add-in wrote where Word shows nothing — run into an element's name, in a
    // namespace's address, in an attribute escaped as %XX, %uXXXX or character references — is
    // read by the safety-net pattern as the writer reads it (readName and nsDecl with the net in
    // every part, netName, pctDecoded). Each held the save under United States at finish, and
    // while the record read these by the rows only, or undecoded, a switch to Singapore shipped it
    // with the finish standing (P2R6-1, F-FIN-NS, P2R6-5)
    ['an SSN run into an add-in\'s element name on a body paragraph (<acme:ssn123-45-6789/>), practice United States to Singapore', MARKUP,
      ['<w:p xmlns:acme="urn:acme:crm"><acme:ssn123-45-6789/><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}], { ...US_TO_SG, probe: /123-45-6789/, held: true }],
    ['an SSN in an add-in\'s namespace address on a body paragraph (urn:acme:ssn:123-45-6789), practice United States to Singapore', MARKUP,
      ['<w:p xmlns:acme="urn:acme:ssn:123-45-6789"><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}], { ...US_TO_SG, probe: /123-45-6789/, held: true }],
    ['an SSN run into a namespace address in a part the writer does not know (urn:acme:ssn123-45-6789), practice United States to Singapore', MARKUP,
      [SIGN, { extra: [['word/addin1.xml', '<ad:data xmlns:ad="urn:example:addin" xmlns:q="urn:acme:ssn123-45-6789"><ad:rec/></ad:data>']] }], { ...US_TO_SG, probe: /123-45-6789/, held: true }],
    ['an SSN percent-escaped in an add-in\'s attribute on a body paragraph (123%2D45%2D6789), practice United States to Singapore', 'the .docx’s internal markup',
      ['<w:p xmlns:acme="urn:acme:crm" acme:ssn="123%2D45%2D6789"><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}], { ...US_TO_SG, probe: /123(?:-|%2D)45(?:-|%2D)6789/, held: true }],
    ['an SSN %uXXXX-escaped in an add-in\'s attribute on a body paragraph (123%u002D45%u002D6789), practice United States to Singapore', 'the .docx’s internal markup',
      ['<w:p xmlns:acme="urn:acme:crm" acme:ssn="123%u002D45%u002D6789"><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}], { ...US_TO_SG, probe: /123(?:-|%u002D)45(?:-|%u002D)6789/, held: true }],
    ['an SSN written with character references in an add-in\'s attribute on a body paragraph (123&#45;45&#45;6789), practice United States to Singapore', 'the .docx’s internal markup',
      ['<w:p xmlns:acme="urn:acme:crm" acme:ssn="123&amp;#45;45&amp;#45;6789"><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}], { ...US_TO_SG, probe: /123(?:-|&#45;)45(?:-|&#45;)6789/, held: true }],
    // A listed firm with one letter written as %uXXXX or a character reference is the firm's name
    // (owner ruling 10): the saved .docx carries "Kes%u0074rel Holdings" once the list is emptied,
    // and the finish comes off. The probe reads the escape, as a reader of the file would; read
    // for "kestrel" the four look like finishes taken off over nothing (wf7 atk1 Y5c/d/e/h)
    ['a listed firm with a letter %uXXXX-escaped in an add-in\'s attribute (Kes%u0074rel Holdings), the list emptied', 'the .docx’s internal markup',
      ['<w:p xmlns:acme="urn:acme:crm" acme:client="Kes%u0074rel Holdings"><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}], KES_ESCAPED],
    ['a listed firm with a letter as a decimal character reference in an add-in\'s attribute (Kes&#116;rel Holdings), the list emptied', 'the .docx’s internal markup',
      ['<w:p xmlns:acme="urn:acme:crm" acme:client="Kes&amp;#116;rel Holdings"><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}], KES_ESCAPED],
    ['a listed firm with a letter as a hex character reference in an unprefixed attribute on a paragraph (Kes&#x74;rel Holdings), the list emptied', 'the .docx’s internal markup',
      ['<w:p client="Kes&amp;#x74;rel Holdings"><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}], KES_ESCAPED],
    ['a listed firm with a letter %uXXXX-escaped in an add-in\'s element text on a body paragraph (Kes%u0074rel Holdings), the list emptied', 'the .docx’s internal markup',
      ['<w:p xmlns:acme="urn:acme:crm"><acme:client>Kes%u0074rel Holdings</acme:client><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>', {}], KES_ESCAPED],
    // a media type in the package's list of parts, read as the writer reads it (mediaRest): the
    // words of Office's own blanked, what is left read as a name
    ['a listed short name in a media type Office writes, in the package\'s list of parts', 'the .docx’s internal markup',
      [SIGN, { moreTypes: '<Default Extension="lim" ContentType="application/vnd.openxmlformats-officedocument.lim.notes+xml"/>' }], { t0: ['Lim'], held: true, probe: /\blim\b/i }],
    // A row of two to five digits counts where it is the whole of an element's text, or of a value
    // the safety net reads — an add-in's attribute or element, a part the writer does not know —
    // and nowhere else (owner ruling 19g). Read by rows of six characters or more, each held the
    // save at finish and shipped with the finish standing once the list was emptied or the row
    // taken back (P2R7-1, P2T7-1)
    ['a listed short number as the text of an Office element on a body paragraph (<w14:x>4417</w14:x>), the list emptied', INNER,
      [`<w:p${W14}><w14:x>4417</w14:x><w:r><w:t>The parties signed.</w:t></w:r></w:p>` + SIGN, {}], SHORT_LISTED],
    ['a listed short number as the text of an Office element in a header (<w14:x>4417</w14:x>), the list emptied', INNER,
      [SIGN, { header: `<w:p${W14}><w14:x>4417</w14:x><w:r><w:t>Head.</w:t></w:r></w:p>` }], SHORT_LISTED],
    ['a listed short number an add-in wrote on a body paragraph (acme:ref="4417"), the list emptied', INNER,
      [`<w:p${ACME} acme:ref="4417"><w:r><w:t>The parties signed.</w:t></w:r></w:p>` + SIGN, {}], SHORT_LISTED],
    ['a listed short number as the text of an add-in\'s element in a style (<acme:matter>44179</acme:matter>), the list emptied', 'the style definitions',
      [SIGN, { styles: `<w:style${ACME} w:type="paragraph" w:styleId="Memo"><w:name w:val="Memo"/><acme:matter>44179</acme:matter></w:style>` }], { t0: ['44179'], held: true, probe: /44179/ }],
    ['a matter number added by hand, as the text of an add-in\'s element on a body paragraph (<acme:matter>4521</acme:matter>), the row taken back', INNER,
      [`<w:p${ACME}><acme:matter>4521</acme:matter><w:r><w:t>Margaret Tan signed.</w:t></w:r></w:p>`, {}], MATTER_WITHDRAWN],
    ['a matter number added by hand, as an element\'s text in a part the writer does not know, the row taken back', INNER,
      [SIGN, { extra: [['word/addin1.xml', '<ad:data xmlns:ad="urn:example:addin"><ad:matter>4521</ad:matter></ad:data>']] }], MATTER_WITHDRAWN],
    ['a matter number added by hand, as an attribute in a part the writer does not know, the row taken back', INNER,
      [SIGN, { extra: [['word/addin1.xml', '<ad:data xmlns:ad="urn:example:addin"><ad:rec matter="4521"/></ad:data>']] }], MATTER_WITHDRAWN],
    // A listed firm run together after a '#' (owner ruling 18), and a party the table writes short
    // read in its long form (owner ruling 19a): the engine and the record read both by the
    // writer's own refFind, and each is masked at finish and ships once its row is left readable
    ['a confirmed firm run together in a hashtag in the body (#kestrelcapitaldeal), the row left readable', DOC,
      [para('Tag #kestrelcapitaldeal on every post.') + SIGN, {}],
      { rows: [MT, person('k', 'Kestrel Capital', '[Company1]')], t0: [], t1: [], change: leaveRow('k'), cause: LATER, probe: /kestrel/i }],
    ['a listed firm run together in a hashtag in a header (#kestrelcapitaldeal), the list emptied', 'a header',
      [SIGN, { header: para('Tag #kestrelcapitaldeal on every post.') }], { t0: ['Kestrel Capital'], probe: /kestrel/i }],
    // a listed name written in letters drawn in a circle in a header: the writer reads each as the
    // letter it draws (symbolRead, WL-6) and masks the name at finish; the record counted words of
    // letters and digits only, so emptying the list shipped it with the finish standing (SEAM-F3)
    ['a listed name written in circled letters in a header (Ⓜⓐⓡⓖⓐⓡⓔⓣ Ⓣⓐⓝ), the list emptied', 'a header',
      [para('Jane Roe signed.'), { header: para('Client: Ⓜⓐⓡⓖⓐⓡⓔⓣ Ⓣⓐⓝ.') }],
      { rows: [person('j', 'Jane Roe', '[Person2]')], t0: ['Margaret Tan'], probe: /Ⓜⓐⓡⓖⓐⓡⓔⓣ/u }],
    ['a listed name written in negative circled letters in a header (🅜🅐🅡🅖🅐🅡🅔🅣 🅣🅐🅝), the list emptied', 'a header',
      [para('Jane Roe signed.'), { header: para('Client: 🅜🅐🅡🅖🅐🅡🅔🅣 🅣🅐🅝.') }],
      { rows: [person('j', 'Jane Roe', '[Person2]')], t0: ['Margaret Tan'], probe: /🅜🅐🅡🅖🅐🅡🅔🅣/u }],
    ['a party the table writes short, written in full in the body (Hickson Corp, "Hickson Corporation"), the row left readable', DOC,
      [para('Hickson Corporation appeals.') + SIGN, {}],
      { rows: [MT, person('h', 'Hickson Corp', '[Company1]')], t0: [], t1: [], change: leaveRow('h'), cause: LATER, probe: /hickson/i }],
    // and the numbers Word writes for itself, which the writer ships beside such a row before and
    // after: an Office attribute — a paragraph's id, a table's width, a tab stop — is read for a
    // row from six characters, and a short row inside a longer value is no hit (P2R7-2). A card's
    // last four that is also a tab stop of Word's stock Header style takes the finish off for the
    // body alone, and never says the save was held
    ['a listed short number that is a paragraph\'s id Word wrote (w14:textId="4417"), the list emptied', null,
      [`<w:p${W14} w14:textId="4417"><w:r><w:t>The parties signed.</w:t></w:r></w:p>` + SIGN, {}], { t0: ['4417'], probe: /4417/ }],
    ['a listed short number that is a table\'s width in twips (w:gridCol 4417), the list emptied', null,
      ['<w:tbl><w:tblGrid><w:gridCol w:w="4417"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4417" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Cell.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' + SIGN, {}], { t0: ['4417'], probe: /4417/ }],
    ['a listed short number inside a longer value an add-in wrote (acme:ref="9944179"), the list emptied', null,
      [`<w:p${ACME} acme:ref="9944179"><w:r><w:t>The parties signed.</w:t></w:r></w:p>` + SIGN, {}], { t0: ['44179'], probe: /44179/ }],
    // a drawing's position, which Word works out: the writer reads it as an Office attribute
    // (officeMeasure, W7F-2) and ships a listed "44450" standing there before and after; read
    // whole, the record takes the finish off naming a value the save never held on
    ['a listed short number that is a drawing\'s position (<wp:posOffset>44450</wp:posOffset>), the list emptied', null,
      ['<w:p><w:r><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>44450</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>-12700</wp:posOffset></wp:positionV><wp:extent cx="914400" cy="914400"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="1" name="Text Box 1"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr/><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic><wp14:sizeRelH relativeFrom="margin"><wp14:pctWidth>0</wp14:pctWidth></wp14:sizeRelH></wp:anchor></w:drawing></w:r><w:r><w:t>Terms.</w:t></w:r></w:p>' + SIGN, {}], { t0: ['44450'], probe: /44450/ }],
    ['a card\'s last four added by hand that is also a tab stop of Word\'s stock Header style (w:pos="9026"), the row taken back', DOC,
      [para('The card ending 9026 was charged.') + SIGN, { styles: '<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/></w:tabs></w:pPr></w:style>' }],
      { rows: [MT, hand('h', '9026', '[Card1]')], t0: [], t1: [], change: withdrawn('h'), cause: LATER, probe: /9026/ }],
    ['a row "Office" left readable in the body, beside the media types of Office\'s own parts', DOC, [SIGN + para('Office hours are posted.'), {}],
      { rows: [person('m', 'Margaret Tan', '[Person1]'), person('o', 'Office', '[Person2]')], t0: [], t1: [], cause: 'A change made after you finished', probe: /office/i,
        change: (f) => withFloor({ ...f, entities: decideRows(f.entities, ['o'], { dead: true, status: 'ignored' }) }, 'sg') }],
    // changes that only mask more
    // a listed "Osprey" masks the link's first word, and the name the save held on stands
    // nowhere in what ships: "…/sites/[Protected1]%E2Lane/…" is released with nothing of the
    // finish's name in it
    ['the same link in the body, "Osprey" put on the list', null, [para('Filed at https://firm/sites/Osprey%E2Lane/brief.docx today.') + SIGN, {}],
      { rows: [person('m', 'Margaret Tan', '[Person1]'), person('o', 'Osprey Lane', '[Person2]')], t0: [], t1: ['Osprey'], probe: /osprey/i }],
    ['an SSN in a caption label, practice Singapore to United States', null, [SIGN, { settings: SSN }],
      { p0: 'sg', t0: [], p1: 'us', change: (f) => withFloor(f, 'us'), cause: 'Switching the practice to United States' }],
    ['a term added to the list (a style, a font and a list number text carry them)', null, [styled('Recitals.', 'KHead') + `<w:p><w:r><w:rPr><w:rFonts w:ascii="Osprey Sans"/></w:rPr><w:t>x</w:t></w:r></w:p>` + SIGN,
      { styles: styleDef('KHead', 'Kestrel Heading'), numbering: list('<w:lvl w:ilvl="0"><w:lvlText w:val="Osprey %1"/></w:lvl>') }], { t1: ['Kestrel', 'Osprey'] }],
    ['leaving Settings with the list as it was', null, [styled('Recitals.', 'KHead') + SIGN, { styles: styleDef('KHead', 'Kestrel Heading'), theme: 'Kestrel Theme' }], { t1: ['Kestrel'] }],
  ];
  const rows = [person('m', 'Margaret Tan', '[Person1]')];
  const cases = [];
  for (const [label, where, [body, parts], o = {}] of C) {
    const c = { label, where, held: !!o.held, probe: o.probe ?? /kestrel/i, ...EMPTIED, ...o };
    c.f0 = await docxFile(`N${cases.length}`, await makePackage(body, parts), c.rows ?? rows, c.p0, c.t0);
    cases.push(c);
  }
  /** the finish and one change, through the attest module given; `marks` in place of the ones read at the drop */
  const run = async (A, c, marks) => {
    const f0 = { ...c.f0, docxMarks: marks ?? (A.docxMarks === docxMarks ? c.f0.docxMarks : await A.docxMarks(c.f0.bytes)) };
    const fin = A.finishFile(f0, c.p0, c.t0);
    const after = c.change(fin);
    return { fin, g: A.recheckFinish(fin, after, c.p1, c.t1, c.cause), x: A.exposedSince(fin.finish, after, c.p1, c.t1) };
  };
  const A0 = { docxMarks, finishFile, recheckFinish, exposedSince };
  for (const c of cases) {
    const r = await run(A0, c);
    const at = await savedAll(r.fin, c.p0, c.t0), now = await savedAll(r.g, c.p1, c.t1);
    const text = (s) => s.all.map((x) => x.text).join('\n');
    // held at finish, nothing shipped: exposed when what was masked now ships at all, a name in
    // the markup included — read whole as well, because Word shows an instruction split across
    // runs as one
    c.exposed = !now.all ? false
      : !at.all ? c.probe.test(text(now)) || now.all.names.some((x) => c.probe.test(x.text)) || c.probe.test(now.all.filter((x) => !x.where.includes('@')).map((x) => x.text).join(''))
        : readableIn(text(at), text(now)).length > 0;
    c.at = at.held ? 'held' : 'saved';
    c.r = r;
  }
  const said = (c, r) => (r.g.reviewed ? 'finish stands' : r.g.reopened.replace(/ Export holds this document until you finish again\.$/, ''));
  const bad = cases.filter((c) => c.exposed !== !c.r.g.reviewed || c.exposed !== !!c.where);
  check(bad.length === 0 && cases.length === C.length,
    `in all ${cases.length} cases the finish comes off exactly when the real writer's saved .docx leaves readable what it masked or held on at finish`,
    cases.map((c) => `${bad.includes(c) ? '*** ' : ''}${c.label}: at finish ${c.at}, the writer ${c.exposed ? 'now ships it' : 'ships nothing new'} · ${said(c, c.r)}`).join('\n          '));
  // the note names the channel, and says "held the save" only where the writer held it
  const wrong = cases.filter((c) => c.where).filter((c) => !(c.where === DOC ? c.r.x?.spans.some((s) => c.probe.test(s)) : c.r.x?.parts.some((p) => p.where === c.where && !!p.held === c.held && p.spans.some((s) => c.probe.test(s))))
    || /held the save/.test(c.r.g.reopened) !== c.held);
  check(wrong.length === 0, 'each note quotes the name where it stands, and says the writer held the save on it only for a text the writer ships as written — never for a style it renames',
    wrong.map((c) => `${c.label}: want “…” (in ${c.where})${c.held ? ', held' : ''} · ${said(c, c.r)}`).join('\n          '));

  // The writer reads a style's id with the safety-net pattern as written, and with its
  // underscores as spaces, and in no other reading (docxWrite styleFloor): "Schedule123456789"
  // carries no number the pattern reads as written, and the writer never renames it for the
  // "123456789" its word reading splits off. attest.ts styleReadings reads it by that rule
  // (P2T-4): a record that floor-read every reading would call the style masked at finish, and a
  // long number left visible in the body would take the finish off naming a style the saved
  // .docx never renamed.
  {
    const sched = await docxFile('SCH', await makePackage(styled('Account 123456789 is attached.', 'Schedule123456789') + SIGN, { styles: styleDef('Schedule123456789', 'Schedule Body') }), rows, 'sg');
    const leave = (f) => withFloor({ ...f, entities: decideRows(f.entities, [f.entities.find((e) => e.text === '123456789')?.key], { dead: true, status: 'ignored' }) }, 'sg');
    const later = 'A change made after you finished';
    const runSched = (A) => { const fin = A.finishFile(sched, 'sg', []); const after = leave(fin); return { fin, g: A.recheckFinish(fin, after, 'sg', [], later), x: A.exposedSince(fin.finish, after, 'sg', []) }; };
    const sc = runSched(A0);
    const idShips = (s) => !!s.all?.some((x) => x.text === 'Schedule123456789');
    const styleSaid = (r) => (r.x?.parts ?? []).some((p) => p.where === 'a style name');
    check(idShips(await savedAll(sc.fin, 'sg', [])) && idShips(await savedAll(sc.g, 'sg', [])) && sc.g.reviewed === false && !styleSaid(sc) && quotes(sc.g.reopened).some((q) => q.text === '123456789' && q.where === null),
      'a long number left visible in the body takes the finish off naming the number in the document, and never the style "Schedule123456789", which the writer ships as written before and after',
      sc.g.reopened);
    const allFloor = runSched(await attestWith("({ text, rule: 'ident', floor: styleFloor(j, v) })", "({ text, rule: 'ident', floor: true })"));
    check(styleSaid(allFloor),
      'CONTROL (P2T-4): a style rule that reads every reading of an id with the safety-net pattern names "Schedule123456789" in a style name — a style the saved .docx never renamed — and the check catches it', allFloor.g.reopened);
  }

  // CONTROL: the record's reach before 2026-09-23 — watermarks, kept field codes, chart sheet names
  const OLD = new Set(['a watermark', 'a field code', 'a chart’s worksheet name']);
  const missed = [];
  for (const c of cases.filter((x) => x.exposed)) {
    const r = await run(A0, c, c.f0.docxMarks.filter((m) => OLD.has(m.where) || m.kind === 'flow'));
    if (r.g.reviewed) missed.push(`${c.label} (${c.where})`);
  }
  check(missed.length >= 10 && missed.every((l) => ![...OLD].some((w) => l.endsWith(`(${w})`))),
    `CONTROL: the old reach leaves ${missed.length} finishes standing while the saved .docx ships the name — every one in a style, a list’s number text, a font, a theme, a chart or the .docx’s markup`, missed.join('\n          '));

  // CONTROL: read from the file as dropped, the PAGEREF's argument names the client; the writer
  // renames the bookmark and the reference with it, so nothing of it ships
  const pr = cases.find((c) => c.label === 'a PAGEREF to an author bookmark');
  const input = await run(A0, pr, [...pr.f0.docxMarks, { part: 'word/document.xml', text: ' PAGEREF KestrelSPA \\h ', kind: 'hold', read: 'field', where: 'a field code' }]);
  check(!pr.exposed && pr.r.g.reviewed === true && input.g.reviewed === false,
    'CONTROL: a field code read from the file as dropped takes the finish off for a bookmark name the writer never ships — reading what the writer saves is what keeps that finish', input.g.reopened);

  // CONTROLS — attest.ts with one line broken, on the case that line exists for
  const one = (label) => cases.find((c) => c.label.startsWith(label));
  // The engine places a listed name run together wherever a reading of a value carries it, so a
  // line below that follows one of the writer's own run-together readings is a second reading of
  // its case today: each such CONTROL runs under the engine as it was before that rule
  // (PRE_RUN_ENGINE), where the real record takes the finish off while the writer, saving with
  // that engine's table, ships the name — and the line broken leaves the finish standing
  const PE = await engineWith(PRE_RUN_ENGINE);
  const PRE0 = await attestWith([], null, PRE_RUN_ENGINE);
  const preBroken = (from, to) => attestWith([[from, to]], null, PRE_RUN_ENGINE);
  const shown = (x) => x.all.map((y) => y.text).join('\n');
  const pre = async (A, c) => {
    const r = await run(A, c);
    const at = await savedAll(r.fin, c.p0, c.t0, PE), now = await savedAll(r.g, c.p1, c.t1, PE);
    return { ...r, exposed: !!at.all && !!now.all && readableIn(shown(at), shown(now)).length > 0 };
  };
  const preHeld = async (c, A) => { const was = await pre(PRE0, c), x = await pre(A, c); return { ok: c.exposed && was.exposed && was.g.reviewed === false && x.g.reviewed === true, was, x }; };
  const split = one('a TOC \\t instruction split');
  const mj = await run(await attestWith("for (const instr of joinedInstructions(tree)) add({ part: n, text: blankField(instr, defined), kind: 'hold', read: 'field', where: 'a field code' });", ''), split);
  check(split.exposed && mj.g.reviewed === true,
    'CONTROL: without the instruction read whole, a TOC split "\\t "Kes" + "trel Custom,1"" leaves the finish standing while the writer, which held on it at finish, now ships it — the check catches it');
  const ob = one('a firm name an identifier carries');
  const mc = await preHeld(ob, await preBroken('    for (const c of carry) { const nm = refFind(c.text, names, c.how, true, false)[0]?.name ?? pctHidden(c.text, names, c.how)?.name; if (nm) got.add(nm); }', ''));
  check(mc.ok,
    'CONTROL: under the engine as it was before its run-together rule, without looking through an identifier for a listed name, OBrienKesslerMemo leaves the finish standing while the writer, which renamed the style at finish, now ships it — the check catches it',
    `${said(ob, mc.was)} · ${said(ob, mc.x)}`);
  const ms = await attestWith("for (const [s, e] of styleArgs(text)) if (defined(text.slice(s, e))) for (let k = s; k < e; k++) own[k] = '█';", '');
  const heldSaid = [];
  for (const c of [one('a STYLEREF to a style'), one('a TOC \\t naming a style the file defines')]) if (/held the save/.test((await run(ms, c)).g.reopened ?? '')) heldSaid.push(c.label);
  check(heldSaid.length === 2,
    'CONTROL: with a defined style\'s name left in the field code, the note says the writer held the save on it — it renamed it with the style — and the wording check catches it', heldSaid.join(' · '));
  const two = one('a kept field naming two listed terms');
  const mh = await run(await attestWith('if (was.hits[i].length && !now.hits[i].length) put(m.where, true, was.hits[i]);', 'if (was.hits[i].length > now.hits[i].length) put(m.where, true, was.hits[i]);'), two);
  check(!two.exposed && two.r.g.reviewed === true && mh.g.reviewed === false && /held the save/.test(mh.g.reopened ?? ''),
    'CONTROL: reading a hold as released when fewer listed terms are in it, the finish comes off saying the writer held the save — while the writer still holds on the other term and ships nothing', mh.g.reopened);
  const twoFont = one('a font whose name carries two listed terms');
  const mw = await run(await attestWith('if (was.hits[i].length && !now.hits[i].length) put(m.where, false, was.hits[i]);', 'if (was.hits[i].length > now.hits[i].length) put(m.where, false, was.hits[i]);'), twoFont);
  check(!twoFont.exposed && twoFont.r.g.reviewed === true && mw.g.reviewed === false && quotes(mw.g.reopened).some((q) => q.where === 'a font name'),
    'CONTROL (P23-T2): reading a font name as shipped when fewer listed terms place in it, the finish comes off naming "Kestrel" in a font name — while the writer still replaces "Kestrel Osprey Sans" whole and ships nothing of it', mw.g.reopened);
  const lang = one('a four-letter listed name in a run');
  const m6 = await run(await attestWith("(rule === 'rows6' ? h.e - h.s >= 6 || (whole === true && allOf(t, h) && SHORT_DIGITS.test(t.slice(h.s, h.e))) : countsInIdent(t, h))", "(rule === 'rows6' ? true : countsInIdent(t, h))"), lang);
  check(!lang.exposed && lang.r.g.reviewed === true && m6.g.reviewed === false,
    'CONTROL: reading a machine value with every row, a language tag "park" the writer never masked takes the finish off — the six-character floor is what keeps it', m6.g.reopened);
  const script = one('a listed given name that is a theme\'s script code');
  const mfs = await run(await attestWith('fontScript(tag, k, t) || MACHINE.test(t)', 'MACHINE.test(t)'), script);
  check(!script.exposed && script.r.g.reviewed === true && mfs.g.reviewed === false,
    'CONTROL (R-fontScript): a theme\'s script code read as a name, the list emptied of "Hans" takes the finish off over a theme the writer never held on and the saved .docx carries unchanged', mfs.g.reopened);

  // the writer's whole-name replacement, its standard fonts, its equations and Word's built-in
  // styles (2026-09-23): each line of the record that follows one, broken on its case
  const glued = one('a font name with nothing between its words');
  const mi = await preHeld(glued, await preBroken("if (m.read === 'ident') { const w = fold(m.text.trim()); return { readings: identReadings(w).map((text, j) => ({ text, rule: j === 0 ? 'all' : 'ident' })), carry: [{ text: w, how: 'all' }] }; }",
    "if (m.read === 'ident') return { readings: [{ text: v, rule: 'all' }], carry: [] };"));
  check(mi.ok,
    'CONTROL: under the engine as it was before its run-together rule, a font name read as written only, "KestrelSans" — which the writer replaced whole at finish and now ships — leaves the finish standing; reading it as the writer does is what catches it',
    `${said(glued, mi.was)} · ${said(glued, mi.x)}`);
  const georgia = one('a standard font whose name is a listed term');
  const mf = await run(await attestWith('if (!STANDARD_FONT.test(v.trim()) && !NEUTRAL_IDENT.test(v.trim()))', 'if (!NEUTRAL_IDENT.test(v.trim()))'), georgia);
  check(!georgia.exposed && georgia.r.g.reviewed === true && mf.g.reviewed === false,
    'CONTROL: without the writer\'s standard fonts, the list emptied of "Georgia" takes the finish off over a font every saved .docx carries as Word wrote it', mf.g.reopened);
  const strong = one('a built-in style whose name is a listed term');
  const mb = await run(await attestWith('const builtin = name !== undefined && BUILTIN_STYLE.test(name.trim());', 'const builtin = false;'), strong);
  check(!strong.exposed && strong.r.g.reviewed === true && mb.g.reviewed === false,
    'CONTROL: reading a built-in style as the author\'s, the list emptied of "Strong" takes the finish off over a style the writer never renamed', mb.g.reopened);
  // The equations measured with the flow they stand in, as the writer masks them after its
  // passes (attest.ts maskEquations): one line of it broken at a time, on the cases it is for.
  // Each CONTROL names the finishes that stand while the saved .docx ships what the writer
  // masked at finish (open), and those that come off while it ships nothing new (wrongly off).
  const eqs = cases.filter((c) => c.eq);
  const eqVerdicts = async (A) => {
    const open = [], wrongOff = [];
    for (const c of eqs) {
      const stands = (await run(A, c)).g.reviewed === true;
      if (c.exposed && stands) open.push(c.label);
      if (!c.exposed && !stands) wrongOff.push(c.label);
    }
    return { open, wrongOff, said: [...open.map((l) => `finish stands: ${l}`), ...wrongOff.map((l) => `finish off: ${l}`)].join('\n          ') };
  };
  const labels = (...heads) => heads.map((h) => one(h).label);
  const sameAs = (got, want) => [...got].sort().join('|') === [...want].sort().join('|');
  const JOINS = labels('an equation touching the text before it', 'two equations side by side', 'an equation whose runs split a listed name around a phantom');
  const BODY_SPLIT = [...labels('an equation whose two runs split', 'an equation whose boxed run', 'an equation whose two runs hold their text in a w:t', 'an SSN typed across two runs of an equation (', 'an equation "Margaret T" + "an"'), ...JOINS];
  const SPLIT = [...BODY_SPLIT, ...labels('an equation in a header whose two runs', 'an SSN typed across two runs of an equation in a header')];
  const SSNS = labels('an SSN typed across two runs of an equation (', 'an SSN typed across two runs of an equation in a header');
  // the SSN on the list in a header's equation, taken off under United States: the zone the
  // writer masks by the practice still covers it, and only a measure of the zone says so
  const STILL = labels('an SSN across two runs of an equation in a header');
  check(eqs.length === 16 && sameAs(eqs.filter((c) => c.exposed).map((c) => c.label), [...SPLIT, one('a confirmed row written only in an equation').label]),
    `setup: ${eqs.length} equation cases, ${eqs.filter((c) => c.exposed).length} of which the saved .docx ships after the change`, eqs.map((c) => `${c.exposed ? 'ships' : 'nothing'}: ${c.label}`).join('\n          '));
  // C1: no equation measured at all
  const e1 = await eqVerdicts(await attestWith('  if (m.eq) {', '  if (false) {'));
  check(sameAs(e1.open, SPLIT) && sameAs(e1.wrongOff, STILL),
    `CONTROL (P2-1, P2-2): the equations left out of the flow's measure, each of the ${SPLIT.length} equations whose runs split what the writer masks leaves the finish standing while the saved .docx ships it, and the SSN a header's equation still masks takes it off`, e1.said);
  // C2: each zone read for the table's names only, never by the whole mask
  const e2 = await eqVerdicts(await attestWith('    const all = writerIntervals(r);\n    if (applyIvs(view, all) !== r.text) return null;', '    const all: Interval[] = [];'));
  check(sameAs(e2.open, SSNS) && sameAs(e2.wrongOff, STILL),
    'CONTROL (P2-3): each zone read for the table\'s names only, an SSN typed across two runs of an equation, in the body and in a header, leaves the finish standing on a switch to Singapore while the saved .docx ships it', e2.said);
  // C3: run by run, as the record read an equation before wf5
  const e3 = await eqVerdicts(await attestWith('  for (const zone of mathZones(walk as unknown as WalkItem[])) {', '  for (const zone of walk.filter((w) => w.math).map((w) => [w]) as unknown as WalkItem[][]) {'));
  check(sameAs(e3.open, SPLIT) && sameAs(e3.wrongOff, STILL),
    `CONTROL (INT-2): an equation read run by run, the ${SPLIT.length} whose runs split what the writer masks — "Kes" + "trel" in two runs and across a box, the SSN in two runs — leave the finish standing`, e3.said);
  // C4: what a zone masks never counted as hidden at finish
  const e4 = await eqVerdicts(await attestWith('    for (const iv of ivs) backTo(pos, iv.s, iv.e, masked);\n', ''));
  check(sameAs(e4.open, SPLIT) && sameAs(e4.wrongOff, STILL),
    `CONTROL (P2-1): what an equation's zone masked left out of what was hidden at finish, each of the ${SPLIT.length} — "Tan" among them, masked in the zone at finish and left after the row "Margaret" now — leaves the finish standing`, e4.said);
  // C5: a body with an equation taken as the text export whenever the writer kept the rest whole
  const e5 = await eqVerdicts(await attestWith('keptWhole(wb) && !wb.eq ? exportOf', 'keptWhole(wb) ? exportOf'));
  check(sameAs(e5.open, BODY_SPLIT) && e5.wrongOff.length === 0,
    `CONTROL (P2-2): a body with an equation measured as the text export whenever the rest is kept whole, the ${BODY_SPLIT.length} bodies whose equation the writer masks leave the finish standing — the export never reads an equation as it renders`, e5.said);
  // C6–C8: one field of how a run stood in an equation (equationsOf) dropped at a time
  const [touch, phant] = [JOINS.slice(0, 2), JOINS.slice(2)];
  const e6 = await eqVerdicts(await attestWith("      if ('m:oMath' in i.math) x.line = true;\n", ''));
  check(sameAs(e6.open, touch) && e6.wrongOff.length === 0,
    'CONTROL (P23-1): without the element each run stands in, an equation read as never in line with the text beside it, the text touching an equation and the two equations side by side leave the finish standing while the saved .docx renders "Kestrel"', e6.said);
  const e7 = await eqVerdicts(await attestWith('    if (i.gap) x.gap = true;\n', ''));
  check(sameAs(e7.open, touch) && e7.wrongOff.length === 0,
    'CONTROL (P23-1): the space the walker puts before an equation read as one Word renders, the same two leave the finish standing', e7.said);
  const e8 = await eqVerdicts(await attestWith('    if (i.unshown) x.unshown = true;\n', ''));
  check(sameAs(e8.open, phant) && e8.wrongOff.length === 0,
    'CONTROL (P23-1): a phantom Word does not show read as text between "Kes" and "trel", the finish stands while the saved .docx renders "Kestrel"', e8.said);

  // a number format read as the writer reads it: each stretch it prints, mapped back to the code
  // (a listed name is found in the code as written as well, so only the pattern's cases tell)
  const fmts = cases.filter((c) => c.where === 'a number format' && c.t0.length === 0);
  const noRuns = await attestWith(", ...(m.read === 'name' && m.where === NUMBER_FORMAT ? formatRuns(v).filter((r) => r.text.trim()).map((r) => ({ text: r.text, rule: 'all' as Rule, run: r })) : [])", '');
  const noMap = await attestWith("      else if (run) own = merged([...own, ...keep.map((h): Range => [run.at[h.s] - (run.how[h.s] === 'e' ? 1 : 0), run.at[h.e - 1] + 1])]);\n", '');
  const fmtMissed = [];
  for (const [A, what] of [[noRuns, 'no stretch read'], [noMap, 'no stretch mapped back']]) for (const c of fmts) if ((await run(A, c)).g.reviewed === true) fmtMissed.push(`${what}: ${c.label}`);
  check(fmts.length === 3 && fmts.every((c) => c.exposed) && fmtMissed.length === 2 * fmts.length,
    `CONTROL (INT-3): without the stretches a number format prints, or with them read and never mapped back to the code, each of the ${fmts.length} number formats the safety-net pattern masked at finish and ships now leaves the finish standing`, fmtMissed.join('\n          '));
  const own = one('an SSN-shaped run of digits in a chart number format');
  const mn = await run(await attestWith("rule: m.read !== 'name' ? 'all' : 'rows' }", "rule: m.read !== 'name' || m.where === NUMBER_FORMAT ? 'all' : 'rows' }"), own);
  check(!own.exposed && own.r.g.reviewed === true && mn.g.reviewed === false && quotes(mn.g.reopened).some((q) => q.where === 'a number format'),
    'CONTROL (P23-4): a number format\'s code read with the safety-net pattern as written, which the writer does not do, takes the finish off naming "123-45-6789" in a number format — while the saved .docx carries "123-45-6789#,##0" unchanged before and after the switch', mn.g.reopened);

  // a name run together, read where the writer reads it: one line of the record broken on each
  // case that line exists for
  const runCase = (label, A) => run(A, one(label));
  const trend = one('a chart\'s trendline name that runs'), lvl = one('a list\'s number text that runs');
  const quoted = one('a number format whose quoted literal runs'), curr = one('a number format whose currency section runs');
  const both = one('a currency section naming two listed terms');
  const prefix = one('a namespace prefix that is a listed term'), elem = one('an element name that runs');
  const addin = one('a telephone number an add-in writes into the name of a part');
  const noValueRuns = await preBroken("        own = merged([...own, ...refSpans(blank, names, m.read === 'text' ? 'text' : 'all').map((f): Range => [f.s, f.long ?? f.e])]);\n", '');
  const vr = [await preHeld(trend, noValueRuns), await preHeld(lvl, noValueRuns)];
  check(vr.every((r) => r.ok),
    'CONTROL: under the engine as it was before its run-together rule, a value masked in place read without the table\'s names run together, the trendline "KestrelHoldings trend" and the list number text "KestrelHoldings Schedule %1" — each masked by the writer at finish and shipped now — leave the finish standing',
    vr.map((r) => `${said(trend, r.was)} · ${said(trend, r.x)}`).join('\n          '));
  const noFormatRuns = await preBroken("        const finds = [...refSpans(v, names).map((f): Range => [f.s, f.e]), ...runs.flatMap((r) => refSpans(r.text, names).map((f): Range => [r.at[f.s] - (r.how[f.s] === 'e' ? 1 : 0), r.at[f.e - 1] + 1]))];", '        const finds: Range[] = [];');
  const fr = [await preHeld(quoted, noFormatRuns), await preHeld(curr, noFormatRuns)];
  check(fr.every((r) => r.ok),
    'CONTROL: under the engine as it was before its run-together rule, a number format read without the table\'s names run together, "KestrelHoldings" in a quoted literal and in a currency section — each masked by the writer at finish and shipped now — leave the finish standing',
    fr.map((r) => `${said(quoted, r.was)} · ${said(quoted, r.x)}`).join('\n          '));
  const noWiden = await runCase('a currency section naming two listed terms', await attestWith('          for (const [a, b] of sections) if (s < b && e > a) { s = Math.min(s, a); e = Math.max(e, b); }\n', ''));
  check(!both.exposed && both.r.g.reviewed === true && noWiden.g.reviewed === false && quotes(noWiden.g.reopened).some((q) => q.where === 'a number format'),
    'CONTROL: a currency section read name by name, one of two listed terms taken off the list takes the finish off naming the other in a number format — while the writer still masks "[$Kestrel Osprey-409]" whole on the first and ships nothing of it', noWiden.g.reopened);
  const noNames = await attestWith('        const elemUri = nsOf(tag, here);\n        qname(tag, here);\n', '        const elemUri = nsOf(tag, here);\n');
  const noDecl = await attestWith('            if (k === \'xmlns\' || k.startsWith(\'xmlns:\')) { nsDecl(k, v); continue; }', '            if (k === \'xmlns\' || k.startsWith(\'xmlns:\')) continue;');
  const [en, pd] = [await run(noNames, elem), await run(noDecl, prefix)];
  check(elem.exposed && prefix.exposed && en.g.reviewed === true && pd.g.reviewed === true,
    'CONTROL: the markup read without its element names, or without the prefixes its declarations bind, <acme:KestrelHoldings/> and xmlns:kestrel — each of which held the save at finish and ships now — leave the finish standing',
    `${said(elem, en)} · ${said(prefix, pd)}`);
  const noNet = await run(await attestWith("      for (const v of [...unknownPartValues(tree), ...(/\\d/.test(own) ? [fold(netName(own))] : [])]) add({ part: n, text: v, kind: 'hold', read: 'net', where: placeOf(n) });\n", ''), addin);
  // the body carries the number too, so its finish comes off either way: what the reading adds
  // is the note naming the part that now ships it. Aimed until this round at the number as an
  // add-in's element's text, which the gate's own reading of that element (elemNet) now names too
  const inPart = (g) => quotes(g.reopened).some((q) => q.text === '61234567' && q.where === 'the .docx’s internal markup');
  check(addin.exposed && inPart(addin.r.g) && !inPart(noNet.g),
    'CONTROL: a part the writer does not know read without the safety-net pattern\'s own reading of it, the telephone number in the part\'s name that held the save ships once the lawyer leaves it readable in the body, and the note names the body alone — never the part that now carries it as well', `${said(addin, addin.r)} | ${said(addin, noNet)}`);

  // this round's readers, each line broken on the case it exists for: the finish stands while
  // the writer, which held the save on it at finish, now ships it
  const ANYWHERE = [' ?? pctHidden(c.text, names, c.how)?.name', ''];
  const MEDIA_BACK = ["const rest = k === 'ContentType' && n === '[Content_Types].xml' ? mediaRest(v) : schemaRest(v);", 'const rest = schemaRest(v);'];
  const PCT_ONLY = ['if (!names.length || !hasEscape(bytes)) return undefined;', "if (!names.length || !bytes.includes('%')) return undefined;"];
  const PCT_UNDECODED = ["if (/%[0-9A-Fa-f]{2}/.test(v)) { const d = pctDecoded(v); if (d !== v) add({ part: n, text: d, kind: 'hold', read: 'name', where: placeOf(n), ...vnet }); }", 'if (/%[0-9A-Fa-f]{2}/.test(v)) { }'];
  const U_UNDECODED = ["          else if (REF_ESCAPE.test(v)) { const d = pctDecoded(v); if (d !== v) add({ part: n, text: d, kind: 'hold', read: 'name', where: placeOf(n), ...vnet }); }\n", ''];
  const SHORT_ROWS = [' || (whole === true && allOf(t, h) && SHORT_DIGITS.test(t.slice(h.s, h.e)))', ''];
  const NOT_WHOLE = [", ...(read === 'machine' && !MEDIA_RE.test(n) && !officeMeasure(parent, ns) ? { whole: true } : {}) });", ' });'];
  const NO_NET_NAME = ["      if (net && /\\d/.test(v)) add({ part: n, text: netName(v), kind: 'hold', read: 'name', where: MARKUP, net: true });\n", ''];
  const RULED = [
    ['an SSN an add-in wrote on a body paragraph', 'an add-in\'s attribute read by the rows only', ['const vnet = netPart || attrNet(k, here, elemUri) ? { net: true } : {};', 'const vnet = netPart ? { net: true } : {};']],
    ['an SSN an add-in wrote on a body paragraph', 'a value marked for the safety net and never read by it', ["return m.net && m.read !== 'net' && !GUID_VALUE.test(m.text.trim()) ? ", 'return false ? ']],
    ['an unprefixed attribute name', 'an attribute with no prefix put in its element\'s namespace, as the copy did', ['const nsOf = nsOfName;', "const nsOf = (q: string, scope: ReadonlyMap<string, string>, elemUri?: string) => (q.includes(':') || elemUri === undefined ? nsOfName(q, scope, elemUri) : elemUri);"]],
    ['a namespace address with a malformed escape', 'no look for an escape where a name could stand', ANYWHERE],
    ['an add-in\'s link with a malformed escape', 'no look for an escape where a name could stand', ANYWHERE],
    ['an element under Word\'s prefix', 'a local name under a prefix the format defines left unread in a part Word never wrote', [' if (netPart) named(q.slice(c + 1), netPart);', '']],
    ['a markup-compatibility list naming Word\'s prefix', 'a listed name under a prefix the format defines left unread in a part Word never wrote', ['{ if (netPart && c >= 0) named(tok.slice(c + 1), netPart); continue; }', 'continue;']],
    ['a pasted link in the body', 'the saved body taken for the text export though the gate holds on it', [' && !heldIn(r.text, writerIntervals(r).map((iv) => iv.tag), names)', '']],
    ['a pasted link in the body', 'a body held at finish never said to ship', ['    const u = unheld(was, is);\n    if (u) parts.push({ where: BODY, spans: [u], words: [], held: true });\n', '']],
    ['a pasted link in a header', 'a header held at finish never said to ship', ['    const u = unheld(rec.parts[i], p);\n    if (u) parts.push({ where: p.where, spans: [u], words: [], held: true });\n', '']],
    ['a listed short name in a media type', 'a media type read as a code word', MEDIA_BACK],
    ['a Proofpoint v3 link in the body', 'a held escape looked for only in a flow with a literal "%"', PCT_ONLY],
    ['a Proofpoint v2 link in the body', 'a held escape looked for only in a flow with a literal "%"', PCT_ONLY],
    ['a Proofpoint v3 link in a header', 'a held escape looked for only in a flow with a literal "%"', PCT_ONLY],
    ['an SSN run into an add-in\'s element name', 'an element\'s name read by the safety net only in a part Word never wrote', ['      named(q, true);', '      named(q, netPart);']],
    ['an SSN in an add-in\'s namespace address', 'a declared address read by the safety net only in a part Word never wrote', ['for (const a of new Set([v, pctDecoded(v)])) named(schemaRest(a) ?? a, true);', 'for (const a of new Set([v, pctDecoded(v)])) named(schemaRest(a) ?? a, netPart);']],
    ['an SSN run into a namespace address in a part the writer does not know', 'a name with a digit never read as netName reads it', NO_NET_NAME],
    ['an SSN percent-escaped in an add-in\'s attribute', 'an attribute\'s %XX escapes left undecoded', PCT_UNDECODED],
    ['an SSN %uXXXX-escaped in an add-in\'s attribute', 'an attribute\'s %uXXXX escapes and character references left undecoded', U_UNDECODED],
    ['an SSN written with character references', 'an attribute\'s %uXXXX escapes and character references left undecoded', U_UNDECODED],
    ['a listed short number as the text of an Office element on a body paragraph', 'a row of two to five digits counted from six characters, as before owner ruling 19g', SHORT_ROWS],
    ['a listed short number as the text of an Office element in a header', 'a row of two to five digits counted from six characters, as before owner ruling 19g', SHORT_ROWS],
    ['a listed short number an add-in wrote on a body paragraph', 'a row of two to five digits counted from six characters, as before owner ruling 19g', SHORT_ROWS],
    ['a listed short number as the text of an add-in\'s element in a style', 'a row of two to five digits counted from six characters, as before owner ruling 19g', SHORT_ROWS],
    ['a matter number added by hand, as the text of an add-in\'s element', 'a row of two to five digits counted from six characters, as before owner ruling 19g', SHORT_ROWS],
    ['a matter number added by hand, as an element\'s text in a part', 'a row of two to five digits counted from six characters, as before owner ruling 19g', SHORT_ROWS],
    ['a matter number added by hand, as an attribute in a part', 'a row of two to five digits counted from six characters, as before owner ruling 19g', SHORT_ROWS],
    ['a listed short number as the text of an Office element on a body paragraph', 'an Office element\'s text never read whole', NOT_WHOLE],
    ['a listed short number as the text of an Office element in a header', 'an Office element\'s text never read whole', NOT_WHOLE],
  ];
  const ruled = [];
  const brokenBy = new Map();
  for (const [label, what, pair] of RULED) {
    const k = pair.join('\u0000');
    if (!brokenBy.has(k)) brokenBy.set(k, await attestWith([pair]));
    const c = one(label), r = await run(brokenBy.get(k), c);
    if (!(c.exposed && c.r.g.reviewed === false && r.g.reviewed === true)) ruled.push(`${what}: ${c.label} · ${said(c, r)}`);
  }
  check(ruled.length === 0,
    `CONTROL: each of the ${RULED.length} lines this round's readers stand on, broken on its case, leaves the finish standing while the writer, which held the save on it at finish, now ships it`, ruled.join('\n          '));
  // Scoped as the writer scopes it: a short row counted where it is the whole of any value a
  // machine reads takes the finish off over Word's own numbers, which the writer ships before and
  // after, and says the save was held on a tab stop it never held on (P2R7-2; the unscoped fix
  // P2T7-1 tried in scratch)
  const everyWhole = await attestWith('whole: !!m.whole || (!!m.net && !GUID_VALUE.test(m.text.trim()))', 'whole: true');
  const overOff = [];
  for (const c of [one('a listed short number that is a paragraph'), one('a listed short number that is a table')]) {
    const r = await run(everyWhole, c);
    if (!(!c.exposed && c.r.g.reviewed === true && r.g.reviewed === false)) overOff.push(`${c.label} · ${said(c, r)}`);
  }
  const tab = one('a card\'s last four added by hand'), tabWide = await run(everyWhole, tab);
  check(overOff.length === 0 && tab.exposed && !/held the save/.test(tab.r.g.reopened ?? '') && /held the save/.test(tabWide.g.reopened ?? ''),
    'CONTROL (P2R7-2): a row of two to five digits counted wherever it is the whole of a value a machine reads, emptying the list of "4417" takes the finish off over a paragraph\'s id and a table\'s width the writer ships before and after, and the card\'s note says the save was held on a tab stop — the checks catch it',
    [...overOff, `${tab.label} · ${said(tab, tabWide)}`].join('\n          '));
  // The '#' and the long form are the writer's own reading (refFind: HANDLE, JOINER, LONG_FORM),
  // which the engine and the record import: put back as it was in the record's copy of the
  // writer, each finish stands while the real writer, which masked the name at finish, ships it
  const readAsWas = async (label, writer) => {
    const c = one(label), r = await run(await attestWith([], null, [], writer), c);
    return { ok: c.exposed && c.r.g.reviewed === false && r.g.reviewed === true, said: `${c.label} · ${said(c, r)}` };
  };
  const noHash = [['const JOINER = /[./\\\\:@_#]/;', 'const JOINER = /[./\\\\:@_]/;'], ['const HANDLE = /^[@#]$/;', 'const HANDLE = /^@$/;']];
  const asWas = [await readAsWas('a confirmed firm run together in a hashtag in the body', noHash), await readAsWas('a listed firm run together in a hashtag in a header', noHash),
    await readAsWas('a party the table writes short', [["const LONG_FORM: Record<string, string> = { co: 'company', corp: 'corporation', inc: 'incorporated' };", 'const LONG_FORM: Record<string, string> = {};']])];
  check(asWas.every((x) => x.ok),
    'CONTROL (owner rulings 18, 19a): the record reading a \'#\' as prose, or a name the table writes short never in its long form, leaves each finish standing while the saved .docx ships the "#kestrelcapitaldeal" or "Hickson Corporation" it masked at finish',
    asWas.map((x) => x.said).join('\n          '));

  // At finish, the record counts a value the writer ships as written exactly where the writer's
  // gate holds the save on it. Counted where the gate saves, a later change takes the finish off
  // over nothing and says the save was held; held where the record counts nothing, a change that
  // releases it ships it with the finish standing. The safety-net pattern counts where it takes the
  // whole of an Office element's text (owner ruling 19f) and anywhere in an add-in's (elemNet):
  // no change separates either from the row the body's own copy of the number puts in the table —
  // every practice's pattern takes a bare run of digits whole, and the floor row left readable is
  // that same row — so the record is held to the gate here, at finish, one value per document.
  const memo = (inner, ns = '') => ({ styles: `<w:style${ns} w:type="paragraph" w:styleId="Memo"><w:name w:val="Memo"/>${inner}</w:style>` });
  const GATE = [
    ['a number the pattern takes whole, as an Office element\'s text in a style (<w14:x>61234567</w14:x>)', memo('<w14:x>61234567</w14:x>', W14), [], true],
    ['the same number with a percent sign after it, which the pattern does not take whole (<w14:x>61234567%</w14:x>)', memo('<w14:x>61234567%</w14:x>', W14), [], false],
    ['the same, as an add-in\'s element text, which the pattern reads anywhere (<acme:x>61234567%</acme:x>)', memo('<acme:x>61234567%</acme:x>', ACME), [], true],
    ['a listed short number as an Office element\'s text in a style (<w14:x>4417</w14:x>)', memo('<w14:x>4417</w14:x>', W14), ['4417'], true],
    ['a listed short number as a style\'s tab stop (w:pos="4417")', memo('<w:pPr><w:tabs><w:tab w:val="right" w:pos="4417"/></w:tabs></w:pPr>'), ['4417'], false],
    ['a listed short number as an add-in\'s attribute on a style (acme:ref="4417")', { styles: `<w:style${ACME} acme:ref="4417" w:type="paragraph" w:styleId="Memo"><w:name w:val="Memo"/></w:style>` }, ['4417'], true],
    ['a listed short number inside a longer value an add-in wrote on a style (acme:ref="9944179")', { styles: `<w:style${ACME} acme:ref="9944179" w:type="paragraph" w:styleId="Memo"><w:name w:val="Memo"/></w:style>` }, ['44179'], false],
  ];
  const gateFiles = [];
  for (const [label, parts, terms, holds] of GATE) {
    const f = await docxFile(`GATE${gateFiles.length}`, await makePackage(SIGN, parts), [MT], 'sg', terms);
    gateFiles.push({ label, f, terms, holds, held: !!(await savedAll(f, 'sg', terms)).held });
  }
  // the marks read by the module under test, as `run` reads them
  const gateOff = async (A) => {
    const out = [];
    for (const g of gateFiles) {
      const f = A.docxMarks === docxMarks ? g.f : { ...g.f, docxMarks: await A.docxMarks(g.f.bytes) };
      const counted = (A.finishRecord(f, 'sg', g.terms).names?.hits ?? []).some((h) => h.length > 0);
      if (counted !== g.held) out.push(`${g.label}: the writer ${g.held ? 'holds' : 'saves'}, the record ${counted ? 'counts it' : 'counts nothing'}`);
    }
    return out;
  };
  const gateNow = await gateOff({ finishRecord, docxMarks });
  const writerMoved = gateFiles.filter((g) => g.held !== g.holds).map((g) => `${g.label}: the writer now ${g.held ? 'holds' : 'saves'}`);
  check(gateNow.length === 0 && writerMoved.length === 0,
    `in all ${GATE.length} documents the record counts, at finish, exactly the value the writer's gate holds the save on — the safety-net pattern where it takes an Office element's text whole and anywhere in an add-in's, a short row where it is the whole of an element's text or of a value the pattern reads`,
    [...gateNow, ...writerMoved].join('\n          '));
  const GATE_BROKEN = [
    ['the pattern never counted where it takes an element\'s text whole', ' || (whole === true && allOf(t, h))\n', '\n', /takes whole, as an Office/],
    ['an add-in\'s element text read by the rows alone', '...(netPart || (!MEDIA_RE.test(n) && elemNet(parent, ns)) ? { net: true } : {}), ', '...(netPart ? { net: true } : {}), ', /add-in's element text, which/],
    ['a short row counted from six characters', ...SHORT_ROWS, /short number as an (?:Office element|add-in's attribute)/],
    ['a short row counted where it is the whole of any value a machine reads', 'whole: !!m.whole || (!!m.net && !GUID_VALUE.test(m.text.trim()))', 'whole: true', /tab stop/],
  ];
  const gateMissed = [];
  for (const [what, from, to, want] of GATE_BROKEN) {
    const off = await gateOff(await attestWith(from, to));
    if (!off.length || !off.every((l) => want.test(l))) gateMissed.push(`${what}: ${off.join(' · ') || 'nothing named'}`);
  }
  check(gateMissed.length === 0, `CONTROL: each of the ${GATE_BROKEN.length} lines the record counts these by, broken, names the documents it is for and no other`, gateMissed.join('\n          '));
  // A listed firm with one letter escaped is held three ways at finish: the attribute's %uXXXX and
  // references decoded, the look for a name through an escape (refFind), and the engine's own
  // placement of a listed name run together, which reads through one. Under the engine as it was
  // before that rule, with the other two taken out, each finish stands while the writer, which
  // held on it at finish, now ships the name
  const kes = ['a listed firm with a letter %uXXXX-escaped in an add-in\'s attribute', 'a listed firm with a letter as a decimal', 'a listed firm with a letter as a hex', 'a listed firm with a letter %uXXXX-escaped in an add-in\'s element text'].map(one);
  const blind = await attestWith([U_UNDECODED, ['    for (const c of carry) { const nm = refFind(c.text, names, c.how, true, false)[0]?.name ?? pctHidden(c.text, names, c.how)?.name; if (nm) got.add(nm); }\n', '']], null, PRE_RUN_ENGINE);
  const kesOpen = [];
  for (const c of kes) {
    const r = await run(blind, c);
    const at = await savedAll(r.fin, c.p0, c.t0, PE), now = await savedAll(r.g, c.p1, c.t1, PE);
    if (!(c.exposed && c.r.g.reviewed === false && !at.all && !!now.all && c.probe.test(shown(now)) && r.g.reviewed === true)) kesOpen.push(`${c.label} · ${said(c, r)}`);
  }
  check(kes.length === 4 && kesOpen.length === 0,
    'CONTROL: under the engine as it was before its run-together rule, with an attribute\'s %uXXXX and references left undecoded and no look for a name through an escape, each of the 4 listed firms written with an escaped letter leaves the finish standing while the writer, which held on it at finish, now ships it',
    kesOpen.join('\n          '));
  // The note as the lawyer reads it, not the record under it: a note quotes 60 characters of a
  // stretch, and a stretch the save held on is a whole token, so a gateway link carries the name
  // past the cut. Quoted from its start, the Proofpoint v2 link's note read "https://
  // urldefense.proofpoint.com/v2/url?u=https-3A__firm_si…" and named no one.
  const unseen = cases.filter((c) => c.where && c.held && !c.probe.test(c.r.g.reopened ?? ''));
  check(unseen.length === 0 && cases.filter((c) => c.where && c.held).length >= 20,
    `each note for a stretch the writer held the save on shows the lawyer the name it held on, in the words of the note — a gateway link longer than a note quotes included (${cases.filter((c) => c.where && c.held).length} cases)`,
    unseen.map((c) => `${c.label} · ${said(c, c.r)}`).join('\n          '));
  const v2 = one('a Proofpoint v2 link in the body');
  const fromStart = await run(await attestWith([['  if (b - a <= 60) return { name, shown: bytes.slice(a, b) };\n', '  return { name, shown: bytes.slice(a, b) };\n']]), v2);
  check(fromStart.g.reviewed === false && !v2.probe.test(fromStart.g.reopened),
    'CONTROL: a held stretch quoted from its start, as it was, gives the Proofpoint v2 link\'s note without the name it held on', said(v2, fromStart));
  // read as "held then, not now" alone, masking more takes a finish off: the listed "Osprey"
  // walls the name the save held on off from the escape, and nothing of it ships
  const wall = one('the same link in the body, "Osprey" put on the list');
  const unwalled = await run(await attestWith("return pctHidden(blankTags(is.bytes, is.tags), [was.held.name], 'text') ? was.held.shown : null;", 'return was.held.shown;'), wall);
  check(!wall.exposed && wall.r.g.reviewed === true && unwalled.g.reviewed === false,
    'CONTROL: a flow the gate no longer holds read as shipping what it held on, whatever now stands in it, "Osprey" put on the list takes the finish off over a link that now ships "[…]%E2Lane" and nothing of "Osprey Lane"', said(wall, unwalled));
  const office = one('a row "Office" left readable');
  const officeHeld = await run(await attestWith([MEDIA_BACK]), office);
  check(office.r.g.reviewed === false && !/held the save/.test(office.r.g.reopened) && /held the save/.test(officeHeld.g.reopened ?? ''),
    'CONTROL: media types read as code words, a row "Office" left readable is said to have held the save on Office\'s own media types, which the writer never reads — the wording check catches it', said(office, officeHeld));
}

// attest.ts reads a name with the writer's own readings, imported from docxWrite.ts. A reading
// the writer takes and the record does not is a name the finish lets through, and a copy drifts
// from the writer the day the writer changes with nothing failing — so none of them may come
// back as a copy: each is defined nowhere in attest.ts, and each is one docxWrite.ts exports.
console.log('\n— law 3, the writer\'s readings, taken from the writer —');
{
  const READINGS = ['REF_CUT', 'REF_JOIN', 'refWords', 'REF_CJK', 'REF_INVISIBLE', 'RefName', 'refCompact', 'refNames', 'refCarries', 'IDENT', 'identReadings', 'countsInIdent',
    'MACHINE', 'EMAILISH', 'VOCAB', 'SCHEMA', 'SYNTAX_ATTR', 'Mode', 'FACE', 'F', 'ATTR_MASK', 'ELEM_MASK', 'STYLE_REFS', 'styleAttr', 'refKind', 'WORD_BOOKMARK', 'NEUTRAL_REF', 'KEEP_FIELD', 'joinedInstructions', 'numericForm',
    'NEUTRAL_NAME', 'STANDARD_FONT', 'NEUTRAL_IDENT', 'BUILTIN_STYLE', 'idOfName', 'FORMULA_TAGS', 'formatRuns', 'FormatRun', 'mathZones', 'zoneText',
    'styleFloor', 'NUMBER_FORMAT', 'refFind', 'refSpans', 'KNOWN_NS', 'schemaRest', 'OWN_MEDIA', 'zoneRead', 'unknownPartValues', 'netName', 'pctDecoded', 'fontScript', 'FlowPiece', 'WriterFlow',
    // copies until 2026-09-24, or readings the writer took that the record did not: the copied
    // namespace lookup gave an attribute with no prefix its element's namespace after the writer
    // stopped (owner ruling 12), and a media type was read as a code word after the writer began
    // to read what mediaRest leaves of it
    'MC_NS', 'MC_LISTS', 'LAYOUT_RE', 'MEDIA_RE', 'R_ATTRS', 'nsOfName', 'attrNet', 'pctHidden', 'GUID_VALUE', 'mediaRest',
    // imported and not listed until 2026-09-24, so an exact copy of hasEscape put back in
    // attest.ts passed this law (P2T7-2); and owner rulings 19d, 19f and 19g, taken by import
    'hasEscape', 'savedFlowText', 'MaskFn', 'REF_ESCAPE', 'allOf', 'SHORT_DIGITS', 'elemNet', 'officeMeasure'];
  // a declaration at any depth, and a name taken out by destructuring: a copy inside a function
  // is a copy all the same (P2T-4 — the guard read column 0 only)
  const defined = (source, name) => new RegExp(`^[ \\t]*(?:export\\s+)?(?:const|let|var|function|type|interface|class)\\s+(?:${name}\\b|[{[][^=;]*\\b${name}\\b[^=;]*[}\\]]\\s*=)`, 'm').test(source);
  const exported = (source, name) => new RegExp(`^export (?:const|function|type|interface) ${name}\\b`, 'm').test(source);
  const ATT = readFileSync(src('lib', 'attest.ts'), 'utf8').replace(/\r\n/g, '\n');
  const WR = readFileSync(src('lib', 'extract', 'docxWrite.ts'), 'utf8').replace(/\r\n/g, '\n');
  // an import names a thing defined elsewhere, and its `type FormatRun,` is the one line shaped
  // like a declaration that is not one
  const copies = (att) => { const own = att.replace(/^import\b[^;]*;/gm, ''); return READINGS.filter((n) => defined(own, n)); };
  const unexported = READINGS.filter((n) => !exported(WR, n));
  check(copies(ATT).length === 0 && unexported.length === 0 && /from '\.\/extract\/docxWrite'/.test(ATT),
    `each of the ${READINGS.length} readings attest.ts takes from the writer is the writer's own export — none is copied`,
    [...copies(ATT).map((n) => `${n}: defined in attest.ts`), ...unexported.map((n) => `${n}: not exported by docxWrite.ts`)].join('\n          '));
  const back = copies(ATT + "\nconst STYLE_REFS = new Set(['w:pStyle', 'w:rStyle', 'w:tblStyle']);\n");
  check(back.join() === 'STYLE_REFS', 'CONTROL: a copy of STYLE_REFS put back in attest.ts, seven style references short, is reported', back.join(' · '));
  const inner = copies(ATT + "\nfunction readIdent(v: string) {\n  const IDENT = /^[\\p{L}\\p{N}_]{1,80}$/u;\n  const { refWords } = local;\n  return IDENT.test(v) && refWords(v);\n}\n");
  check(inner.join() === 'refWords,IDENT', 'CONTROL: a copy of IDENT declared inside a function, and refWords taken out by destructuring, are reported', inner.join(' · '));
  const renamed = READINGS.filter((n) => !exported(WR.replace('export function refCarries(', 'export function refCarriesNow('), n));
  check(renamed.join() === 'refCarries', 'CONTROL: a reading the writer renames is reported, never passed as unchecked', renamed.join(' · '));
  // and every name attest.ts imports from the writer is on the list, where a copy of it is looked
  // for; the writer itself is the one import that is no reading
  const writerImports = (att) => {
    const m = /^import \{([^}]*)\} from '\.\/extract\/docxWrite';/m.exec(att);
    return m ? m[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean) : null;
  };
  const unlisted = (att) => (writerImports(att) ?? ['(no import from the writer found)']).filter((n) => !READINGS.includes(n) && n !== 'writeRedactedDocx');
  check(unlisted(ATT).length === 0, `each of the ${writerImports(ATT)?.length} names attest.ts imports from the writer is on the list, and a copy of it would be reported`, unlisted(ATT).join(' · '));
  const plusOne = unlisted(ATT.replace('pctHidden, hasEscape, GUID_VALUE, mediaRest,', 'pctHidden, hasEscape, GUID_VALUE, mediaRest, DIGIT_SEP,'));
  const escCopy = copies(ATT.replace('pctHidden, hasEscape, GUID_VALUE', 'pctHidden, GUID_VALUE') + "\nfunction hasEscape(s: string): boolean { return s.includes('%') || /urldefense/i.test(s); }\n");
  check(plusOne.join() === 'DIGIT_SEP' && escCopy.join() === 'hasEscape',
    'CONTROL (P2T7-2): a reading imported from the writer and left off the list is reported, and so is the exact copy of hasEscape that passed while it was off the list', `${plusOne.join(' · ')} | ${escCopy.join(' · ')}`);

  // The rules attest.ts still copies, because the writer exports nothing that states them: each
  // stands in attest.ts and in docxWrite.ts as copied, so the day the writer changes one the gate
  // names it here instead of a finish drifting from the file it attests to (INT-2 and INT-3 were
  // two such drifts). Each entry: what it is, its text in attest.ts, its text in the writer.
  // Every anchor stands exactly once in its file: one that stood twice passed while one of its
  // sites drifted, and five writer changes and one attest change went unnamed (P2-T7).
  const COPIED = [
    ['a number format\'s code as written by the rows only, each stretch it prints by the whole mask (maskFormat)',
      ["if (m.kind === 'mask') return { readings: [{ text: v, rule: m.read !== 'name' ? 'all' : 'rows' }, ...(m.read === 'name' && m.where === NUMBER_FORMAT ? formatRuns(v).filter((r) => r.text.trim()).map((r) => ({ text: r.text, rule: 'all' as Rule, run: r })) : [])], carry: [] };"], ['const { hits, divergence } = readAll(st.mask, [flow, ...runs.map((r) => r.text)]);', 'const ivs: Array<{ s: number; e: number; tag: string }> = hits[0].filter((h) => !h.floor && h.e > h.s).map((h) => ({ s: h.s, e: h.e, tag: h.tag }));']],
    ['a machine value read with rows of six characters or more, and the pattern\'s hit or a row of two to five digits where it takes the whole of an element\'s text or of a value the pattern reads (allOf, SHORT_DIGITS; owner rulings 19f, 19g)',
      ['|| (h.floor ? floor === true || (whole === true && allOf(t, h))', ": rule !== 'net' && (rule === 'rows' || (rule === 'rows6' ? h.e - h.s >= 6 || (whole === true && allOf(t, h) && SHORT_DIGITS.test(t.slice(h.s, h.e))) : countsInIdent(t, h)))));"],
      [': h.floor ? (!!lit && lit.some(([s, e]) => h.s >= s && h.e <= e)) || (o.whole && allOf(r, h))', ": o.mode === 'machine' ? h.e - h.s >= 6 || ((o.floor || o.whole) && allOf(r, h) && SHORT_DIGITS.test(r.slice(h.s, h.e))) : countsInIdent(r, h)));"]],
    ['the stretches a pass writes a tag for, folded where they overlap, the longer first where two start together (mergedIntervals, foldIntervals)',
      ['return foldIvs([...r.placements, ...r.floorHits.filter((h) => !h.exempt)].map((x) => ({ s: x.s, e: x.e, tag: x.tag })));', 'for (const iv of all.sort((a, b) => a.s - b.s || b.e - a.e)) {', 'if (prev && iv.s < prev.e) { if (iv.e > prev.e) prev.e = iv.e; continue; }'],
      ['const all: MaskInterval[] = [...m.placements, ...m.floorHits.filter((h) => !h.exempt)].sort((a, b) => a.s - b.s || b.e - a.e);', 'if (prev && iv.s < prev.e) { if (iv.e > prev.e) prev.e = iv.e; continue; }',
        'for (const iv of [...all].sort((a, b) => a.s - b.s || b.e - a.e)) {', 'if (prev && iv.s < prev.e) { prev.e = Math.max(prev.e, iv.e); continue; }\n    ivs.push({ ...iv });']],
    ['each tag written in the first stretch its interval reaches, the covered rest removed (rewriteRuns)', ['while (k < ivs.length && ivs[k].e <= sp.s) k++;', 'if (iv.e > sp.e) break;'],
      ['if (iv.e > sp.e) break;', 'while (k < ivs.length && ivs[k].e <= sp.s) k++;']],
    ['every tag written so far blanked before the next pass reads the flow (placeFlow blank)', ["  return placed.length ? text.replace(new RegExp(placed.join('|'), 'g'), (t) => '█'.repeat(t.length)) : text;\n}"],
      ["    return placed.length ? text.replace(new RegExp(placed.join('|'), 'g'), (t) => '█'.repeat(t.length)) : text;\n  };"]],
    ['the last pass over a flow: the names run together, as a reader sees text, every tag a wall (placeFlow)', ["for (const f of refSpans(blankTags(fold(lay.text), tags), called, 'text')) {", "const found = refFind(blankTags(fold(r.text), writerIntervals(r).map((iv) => iv.tag)), names, 'text', true, false).length > 0;", 'for (const r of alone.values()) { for (const iv of writerIntervals(r)) tags.push(iv.tag); loose ||= keepsWords(r); }'],
      ["const run = runTags(refSpans(blank(fold(last.text)), names, 'text'), mask);", 'res.tags.push(...ivs.map((iv) => iv.tag), ...run.tags);']],
    ['a value masked in place, then its names run together beside what the mask placed (maskValue)', ["own = merged([...own, ...refSpans(blank, names, m.read === 'text' ? 'text' : 'all').map((f): Range => [f.s, f.long ?? f.e])]);"],
      ["const run = runTags(refSpans(blanked, st.names, mode === 'text' ? 'text' : 'all'), st.mask);"]],
    ['a number format\'s names run together, in the code as written and where it prints (maskFormat)', ["const finds = [...refSpans(v, names).map((f): Range => [f.s, f.e]), ...runs.flatMap((r) => refSpans(r.text, names).map((f): Range => [r.at[f.s] - (r.how[f.s] === 'e' ? 1 : 0), r.at[f.e - 1] + 1]))];"],
      ['const run = runTags([...refSpans(flow, st.names), ...runs.flatMap((r) => refSpans(r.text, st.names).map((f) => ({ ...inCode(r, f.s, f.e), name: f.name })))], st.mask);']],
    ['a currency section, outside quotes and escapes, taken whole by a hit in it (maskFormat)',
      ["if (code[i] === '\"') { q = !q; continue; }", "if (code[i] === '\\\\') { i++; continue; }", "if (code[i + 1] === '$') sections.push([i, e]);", 'for (const [a, b] of sections) if (s < b && e > a) { s = Math.min(s, a); e = Math.max(e, b); }'],
      ["if (flow[i] === '\"') { q = !q; continue; }", "if (flow[i] === '\\\\') { i++; continue; }", "if (flow[i + 1] === '$') sections.push([i, e]);", 'for (const iv of ivs) for (const [s, e] of sections) if (iv.s < e && iv.e > s) { iv.s = Math.min(iv.s, s); iv.e = Math.max(iv.e, e); }']],
    ['an equation masked as it renders, after the flow\'s passes, over the flow they left: the zones, each read with the tags written blanked, by the whole mask, then for the names as the zone reads (maskMath)',
      ['const eq = maskEquations(items, pieces, m.eq, tags, names, ask, masked);', "const elem = (x: EqPiece) => (x.m === undefined ? undefined : (elems[x.m] ??= x.line ? { 'm:oMath': [] } : { 'm:e': [] }));", "const walk = pieces.map((p, k) => ({ kind: 'body', text: items[k].text, pre: p.pre, para: eq[k].bare ? undefined : p.para, math: elem(eq[k]), gap: eq[k].gap, unshown: eq[k].unshown, node: {}, k }));", "const view = tagRe ? fold(text).replace(tagRe, (t) => '█'.repeat(t.length)) : fold(text);",
        'if (applyIvs(view, all) !== r.text) return null;', 'for (const f of refSpans(view, names, zoneRead(zone))) {', 'if (n.divergence || !n.placements.length) return null;', 'const ivs = foldIvs(all);\n    const runs = spans.map((sp) => ({ s: sp.s, e: sp.e, item: items[(sp.item as unknown as { k: number }).k] }));'],
      ['        maskMath(items, st, tagsUsed);', "const written = [...new Set([...blank, ...st.tags])].filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'));", "const line = (m?: Record<string, unknown>) => !m || 'm:oMath' in m;", 'if (i.attr || i.kind === \'field\' || i.num || i.unshown) continue;',
        '|| (!(i.pre && !i.gap) && !/\\s$/.test(prev.text) && !/^\\s/.test(i.text) && line(prev.math) && line(i.math) && (!!i.math || !!prev.math || math)));',
        "const view = tagRe ? fold(text).replace(tagRe, (t) => '█'.repeat(t.length)) : fold(text);", 'if (applyIntervals(view, all) !== m.text) { st.held ??= `the writer could not reproduce the masked text of an equation in ${st.part} from its placements`; return; }',
        'const run = runTags(refSpans(view, st.names, zoneRead(zone)), st.mask);', "if (n.divergence || !n.placements.length) return `the mask could not say what to write for a name of the table run together with the text beside it${n.divergence ? `: ${n.divergence}` : ''}`;", 'const ivs = foldIntervals(all);\n    st.written += rewriteRuns(spans, ivs, new Set());']],
    ['what the gate looks through for the names run together, by the kind of value (checkRef)', ["case 'machine': return { readings: [{ text: v, rule: 'rows6', whole: !!m.whole || (!!m.net && !GUID_VALUE.test(m.text.trim())) }], carry: [...(OWN_MEDIA.test(m.text.trim()) ? [] : [{ text: m.text, how: 'run' as const }]), ...also] };", "default: return { readings: [{ text: v, rule: 'all' }], carry: [{ text: m.text, how: 'text' }, ...also] };"],
      ["else if (o.mode === 'machine' && !OWN_MEDIA.test(o.value.trim())) checkRef(o.label, o.value, 'run');", "else if (o.mode === 'text') checkRef(o.label, o.value, 'text');"]],
    ['a name in the markup: an element\'s, an attribute\'s, a prefix, a declared address, and in a part the writer does not know a local name under a prefix the format defines and a name with a digit as netName reads it (readName, qnameRead, mcList, nsDecl)',
      ['if (own) { if (p && !own.has(p)) named(p, netPart); if (netPart) named(q.slice(c + 1), netPart); return; }', 'if (uri !== undefined && KNOWN_NS.get(uri)?.has(p)) { if (netPart && c >= 0) named(tok.slice(c + 1), netPart); continue; }',
        'if (p && !own?.has(p)) named(p, true);', 'for (const a of new Set([v, pctDecoded(v)])) named(schemaRest(a) ?? a, true);', 'named(q, true);', 'named(tok, true);',"if (k === 'xmlns' || k.startsWith('xmlns:')) { nsDecl(k, v); continue; }", "if (k === 'Requires' && elemUri === MC_NS) { mcList(v, here); continue; }",
        "if (net && /\\d/.test(v)) add({ part: n, text: netName(v), kind: 'hold', read: 'name', where: MARKUP, net: true });"],
      ['if (own) { if (p && !own.has(p)) readName(label, p, net); if (net) readName(label, q.slice(c + 1), net); return; }', 'if (uri !== undefined && KNOWN_NS.get(uri)?.has(p)) { if (net && c >= 0) readName(label, tok.slice(c + 1), net); continue; }',
        'if (p && !own?.has(p)) readName(label, p, net);', 'for (const a of new Set([v, pctDecoded(v)])) readName(label, schemaRest(a) ?? a, net);', 'readName(label, q, true);', 'readName(label, tok, true);',"if (k === 'xmlns' || k.startsWith('xmlns:')) { nsDecl(`${part} a namespace declaration (${tag}@${k})`, k, v, true); continue; }", "if (k === 'Requires' && elemUri === MC_NS) { mcList(`${part} a compatibility list (${tag}@${k})`, v, here, net); continue; }",
        "if (net && /\\d/.test(v)) want(label, netName(v), 'name', true);"]],
    ['an attribute\'s value read by the safety-net pattern as written, whatever its reading, in a part the writer does not know or in a namespace Office\'s formats do not define, and never a GUID (attrNet, want\'s floor; owner ruling 11)',
      ['const vnet = netPart || attrNet(k, here, elemUri) ? { net: true } : {};', "return m.net && m.read !== 'net' && !GUID_VALUE.test(m.text.trim()) ? { readings: [...r.readings, { text: fold(m.text), rule: 'net', floor: true }], carry: r.carry } : r;"],
      ['const vnet = net || attrNet(k, here, elemUri);', 'if (floor && GUID_VALUE.test(value.trim())) floor = false;', "floorAt.push(o.floor && j === 0 ? whole : o.mode === 'ident' ? (j === 0 ? whole : null)"]],
    ['an attribute\'s value with escapes, read as the package means it and as a name, in any part (pctDecoded)',
      ["if (/%[0-9A-Fa-f]{2}/.test(v)) { const d = pctDecoded(v); if (d !== v) add({ part: n, text: d, kind: 'hold', read: 'name', where: placeOf(n), ...vnet }); }", "else if (REF_ESCAPE.test(v)) { const d = pctDecoded(v); if (d !== v) add({ part: n, text: d, kind: 'hold', read: 'name', where: placeOf(n), ...vnet }); }"],
      ["if (/%[0-9A-Fa-f]{2}/.test(v)) { const d = pctDecoded(v); if (d !== v) { want(`${part} ${tag}@${k}`, d, 'name', vnet); checkRef(`${part} ${tag}@${k}`, d); } }", "else if (REF_ESCAPE.test(v)) { const d = pctDecoded(v); if (d !== v) { want(`${part} ${tag}@${k}`, d, 'name', vnet); checkRef(`${part} ${tag}@${k}`, d); } }"]],
    ['an escape that writes no character where a name of the table could stand, looked for where no name is found: in every value looked through, and in each flow as saved (pctHidden, owner ruling 10)',
      ['for (const c of carry) { const nm = refFind(c.text, names, c.how, true, false)[0]?.name ?? pctHidden(c.text, names, c.how)?.name; if (nm) got.add(nm); }', "const h = pctHidden(blankTags(bytes, tags), names, 'text');"],
      ['const hid = at ? null : pctHidden(v, names, how);', "want(n, text, 'text');"]],
    ['a media type in the package\'s list of parts read by what mediaRest leaves of it, any other value on the format\'s own hosts by what schemaRest leaves',
      ["const rest = k === 'ContentType' && n === '[Content_Types].xml' ? mediaRest(v) : schemaRest(v);"], ["const rest = k === 'ContentType' && part === '[Content_Types].xml' ? mediaRest(v) : schemaRest(v);"]],
    ['a relationship\'s id read for the names run together unless it is Word\'s own rIdN',["const relId = ((tag === 'Relationship' && k === 'Id') || R_ATTRS.includes(k)) && !/^rId\\d+$/.test(t);"],
      ["if (foreign.has(part) || (((tag === 'Relationship' && k === 'Id') || R_ATTRS.includes(k)) && !/^rId\\d+$/.test(t))) checkRef(`${part} ${tag}@${k}`, t);"]],
    ['a part the writer does not know (writeRedactedDocx, readOutput)', ["const foreign = !rule && n !== '[Content_Types].xml' && !/\\.rels$/.test(n) && !LAYOUT_RE.test(n);"],
      ["if (!rule && n !== '[Content_Types].xml' && !/\\.rels$/.test(n) && !LAYOUT_RE.test(n)) foreign.add(n);"]],
    ['a picture of a part the writer does not know, never read by the safety-net pattern', ['if (foreign && !MEDIA_RE.test(n)) {', 'const netPart = foreign && !MEDIA_RE.test(n);'],
      ['const net = foreign.has(part) && !MEDIA_RE.test(part);']],
    ['a part the writer does not know read by the safety-net pattern: its values, and its own name where it carries a digit (numbers)',
      ["for (const v of [...unknownPartValues(tree), ...(/\\d/.test(own) ? [fold(netName(own))] : [])]) add({ part: n, text: v, kind: 'hold', read: 'net', where: placeOf(n) });", 'const own = pctDecoded(n);'],
      ['const numbers = unknownPartValues;', 'const own = pctDecoded(n);', 'const { hits, divergence } = readAll(opts.mask, [...numbers(tree), ...(/\\d/.test(own) ? [fold(netName(own))] : [])]);']],
    ['a name written short and read in its long form masked to the end of the word it stands in ("Hickson Corp" in "Hickson Corporation", refFind\'s `long`, owner ruling 19a)',
      ['found.push({ s: f.s, e: f.long ?? f.e, tag: r.text });', 'backTo(lay.pos, f.s, f.long ?? f.e, masked);', 'all.push({ s: f.s, e: f.long ?? f.e, tag: n.text });'],
      ['ivs.push({ s: f.s, e: f.long ?? f.e, tag: n.text });']],
    ['an element\'s text: an add-in\'s read by the safety-net pattern in any part Word writes, and a machine value in any part but a picture counted where a hit takes it whole, save a drawing\'s position or share of the page (elemNet, want\'s `whole`, officeMeasure; owner rulings 19f, 19g)',
      ["...(netPart || (!MEDIA_RE.test(n) && elemNet(parent, ns)) ? { net: true } : {}), ...(read === 'machine' && !MEDIA_RE.test(n) && !officeMeasure(parent, ns) ? { whole: true } : {}) });"],
      ["want(`${part} ${em ? em[1] : `<${parent}> text`}`, v, mode, net || (!MEDIA_RE.test(part) && elemNet(parent, ns)), mode === 'machine' && !MEDIA_RE.test(part) && !officeMeasure(parent, ns));", 'owners.push({ label, mode, value, also: [], more: 0, floor, whole: whole && !floor });']],
  ];
  const once = (source, x) => source.split(x).length === 2;
  const staleIn = (list, att, wr) => list.filter(([, a, w]) => !a.every((x) => once(att, x)) || !w.every((x) => once(wr, x))).map(([n]) => n);
  const stale = (att, wr) => staleIn(COPIED, att, wr);
  check(stale(ATT, WR).length === 0, `each of the ${COPIED.length} rules attest.ts still copies from the writer stands in both files as copied, each anchor at one place`, stale(ATT, WR).join('\n          '));
  // Each anchor is the whole of its line, indentation aside: one that ended before its line did
  // passed while the rest of the line changed. 27 of 86 did until this round, and the writer's
  // anchor on qnameRead stopped short of the second reading it gives a local name in a part Word
  // never wrote, which could be taken out with the guard green (P2T6-1)
  const partial = (list, att, wr) => list.flatMap(([n, a, w]) => [...a.map((x) => [att, x]), ...w.map((x) => [wr, x])].filter(([s, x]) => {
    const i = s.indexOf(x);
    if (i < 0) return false;
    const ls = s.lastIndexOf('\n', i) + 1, le = s.indexOf('\n', i + x.length);
    return !!s.slice(ls, i).trim() || !!s.slice(i + x.length, le < 0 ? s.length : le).trim();
  }).map(([, x]) => `${n}: “${x.slice(0, 70)}”`));
  const anchors = COPIED.reduce((k, [, a, w]) => k + a.length + w.length, 0);
  check(partial(COPIED, ATT, WR).length === 0, `each of the ${anchors} anchors is the whole of its line in its file, indentation aside`, partial(COPIED, ATT, WR).join('\n          '));
  const cutW = 'if (own) { if (p && !own.has(p)) readName(label, p, net);';
  const cut = COPIED.map(([n, a, w]) => [n, a, w.map((x) => (x.startsWith(cutW) ? cutW : x))]);
  const secondGone = WR.replace(' if (net) readName(label, q.slice(c + 1), net);', '');
  check(secondGone !== WR && staleIn(cut, ATT, secondGone).length === 0 && partial(cut, ATT, WR).length === 1,
    'CONTROL (P2T6-1): with the writer\'s anchor on qnameRead cut short where it stood until this round, the writer\'s second reading of a local name taken out passes the drift guard — and the anchor is reported as part of its line',
    partial(cut, ATT, WR).join(' · '));
  // CONTROL, one for every anchor on either side: that one site changed, and the guard names its
  // rule alone (a function replacement: an anchor's own "$'" is text, not a pattern)
  const changed = (source, x) => source.replace(x, () => `${x.slice(0, -1)} /* changed */${x.slice(-1)}`);
  const unnamed = [];
  let sites = 0;
  for (const [name, a, w] of COPIED) {
    for (const x of a) { sites++; const got = stale(changed(ATT, x), WR); if (got.join() !== name) unnamed.push(`attest.ts “${x.slice(0, 70)}”: ${got.join(' · ') || 'nothing named'}`); }
    for (const x of w) { sites++; const got = stale(ATT, changed(WR, x)); if (got.join() !== name) unnamed.push(`docxWrite.ts “${x.slice(0, 70)}”: ${got.join(' · ') || 'nothing named'}`); }
  }
  check(unnamed.length === 0 && sites > COPIED.length * 2, `CONTROL: each of the ${sites} anchors changed at its one site, in either file, and the guard names its rule alone`, unnamed.join('\n          '));
  // CONTROL: an anchor that comes to stand twice is reported — a copy beside the live line would
  // pass while the live line drifts
  const [dupName, , dupW] = COPIED[2];
  const dup = stale(ATT, `${WR}\n${dupW[0]}\n`);
  check(dup.join() === dupName, 'CONTROL: a second copy of a writer anchor is reported, and names its rule', dup.join(' · '));
}

// A tag written inside a word the author ran together splits it: "KestrelHoldings" saved as
// "[Person2]Holdings" carries a word "Holdings" no count at finish had, while every character
// of it was as readable then as now. Counted as words, masking more took the finish off and the
// note said "Holdings" was masked when you finished (P2-4, W1-W3). Where both sides carry
// offsets, the offsets decide. The oracle reads no words: each stretch the saved file leaves
// between tags now must stand, as written, in what it saved at finish.
console.log('\n— law 3, a tag written inside a word that ran together —');
{
  const TAG = /\[[A-Za-z]+-?\d*\]/;
  const within = (at, now) => now.split(TAG).filter((x) => /[\p{L}\p{N}]/u.test(x)).every((x) => at.includes(x));
  const shown = (s) => (s.all ? s.all.map((x) => x.text).join('\n') : `held: ${s.held}`);
  const LATER = 'A change made after you finished', LIST = 'Changing the always-redact list in Settings';
  const kestrel = (f) => withFloor({ ...f, entities: [...f.entities, hand('u1', 'Kestrel', '[Person2]')] }, 'sg');
  const W = [
    ['a row "Kestrel" added by hand over "KestrelHoldings", in a .txt', () => fileOf('W1', 'Signed by KestrelHoldings for Margaret Tan.', [person('m', 'Margaret Tan', '[Person1]')]), kestrel, [], LATER],
    ['the same row over the same word, in a .docx', async () => docxFile('W1D', await makeDocx({ body: para('Signed by KestrelHoldings for Margaret Tan.') }), [person('m', 'Margaret Tan', '[Person1]')], 'sg'), kestrel, [], LATER],
    ['a row "Margaret Tan" added by hand over "MrsMargaretTan", in a .docx', async () => docxFile('W2D', await makeDocx({ body: para('Signed by MrsMargaretTan today.') }), [], 'sg'),
      (f) => withFloor({ ...f, entities: [...f.entities, hand('u1', 'Margaret Tan', '[Person2]')] }, 'sg'), [], LATER],
    ['"Wei Ling" put on the always-redact list over "TanWeiLing", in a .docx', async () => docxFile('W3D', await makeDocx({ body: para('Witnessed by TanWeiLing and Margaret Tan.') }), [person('m', 'Margaret Tan', '[Person1]')], 'sg'),
      (f) => f, ['Wei Ling'], LIST],
  ];
  const runW = async (A, [, make, change, t1, cause]) => {
    const f0 = await make();
    const fin = A.finishFile(f0, 'sg', []);
    const g = A.recheckFinish(fin, change(fin), 'sg', t1, cause);
    return { fin, g };
  };
  const rs = [];
  for (const w of W) {
    const r = await runW({ finishFile, recheckFinish }, w);
    const docx = r.fin.kind === 'docx';
    const at = docx ? shown(await savedAll(r.fin, 'sg', [])) : bytes(r.fin.text, r.fin.entities);
    const now = docx ? shown(await savedAll(r.g, 'sg', w[3])) : bytes(r.g.text, r.g.entities);
    rs.push({ label: w[0], at, now, g: r.g });
  }
  check(rs.every((r) => r.at !== r.now && within(r.at, r.now) && r.g.reviewed === true),
    `in all ${W.length} cases the saved file only masks more — every stretch it now leaves readable it left readable at finish — and the finish stands`,
    rs.map((r) => `${r.label}: ${r.g.reviewed ? 'finish stands' : r.g.reopened}`).join('\n          '));
  // CONTROL: words counted where both sides carry offsets, as it shipped
  const counted = await attestWith('  if (was.hidden && now.hidden && !was.loose && !now.loose) return { spans, words: [] };\n', '');
  const off = [];
  for (const w of W) { const r = await runW(counted, w); if (r.g.reviewed === false) off.push(`${w[0]}: ${r.g.reopened}`); }
  check(off.length === W.length,
    'CONTROL (P2-4): counting words where the offsets say nothing new is readable, each of these takes the finish off and says the rest of the word — "Holdings", "Mrs", "Tan" — was masked when you finished', off.join('\n          '));
}

// What the record cannot compare, it does not: a flow or a text outside the flows that
// changed under the same body and table is a text the lawyer never finished, and masks that
// could not be placed with certainty say nothing about what they would leave readable.
console.log('\n— law 3, what the record cannot compare —');
{
  const body = para('Margaret Tan signed the consent.');
  const fA = await docxFile('H', await makeDocx({ body, header: para('Margaret Tan · Kestrel matter · PRIVILEGED') }), [person('m', 'Margaret Tan', '[Person1]')], 'sg');
  const pB = await makeDocx({ body, header: para('Margaret Tan · PRIVILEGED') });
  const b = { bytes: pB, docx: await extractDocx(pB), docxMarks: await docxMarks(pB) };
  const run = (A) => { const fin = A.finishFile(fA, 'sg', []); return A.recheckFinish(fin, { ...fin, ...b }, 'sg', [], 'A change made after you finished'); };
  const g = run({ finishFile, recheckFinish });
  check(g.reviewed === false && /changed the text this review was finished over/.test(g.reopened ?? ''),
    'a header that changed under the same body and table takes the finish off, and says the text changed', g.reopened);
  // two lines stand behind this: the flows compared text for text, and the marks — which carry
  // each flow as the writer masks it — compared mark for mark; either one alone holds
  check(run(await attestWith([['if (now.parts.length !== rec.parts.length || now.parts.some((p, i) => p.text !== rec.parts[i].text)) return TEXT_CHANGED;', ''],
    ['const x = (a ?? []) as DocxMark[], y = (b ?? []) as DocxMark[];', "const x = ((a ?? []) as DocxMark[]).filter((m) => m.kind !== 'flow'), y = ((b ?? []) as DocxMark[]).filter((m) => m.kind !== 'flow');"]])).reviewed === true,
    'CONTROL: measured by offsets over a header shorter by two words, nothing reads as unmasked and the finish stands over a header the lawyer never saw — the check catches it');

  // a style renamed in the package: the record's measures are per text, and another list of
  // texts is another document
  const sBody = para('Margaret Tan signed the consent.') + '<w:p><w:pPr><w:pStyle w:val="H"/></w:pPr><w:r><w:t>Recitals.</w:t></w:r></w:p>';
  const sDef = (name) => ({ styles: `<w:style w:type="paragraph" w:styleId="H"><w:name w:val="${name}"/></w:style>` });
  const fS = await docxFile('S', await makePackage(sBody, sDef('Plain Heading')), [person('m', 'Margaret Tan', '[Person1]')], 'sg');
  const pK = await makePackage(sBody, sDef('Kestrel Heading'));
  const k = { bytes: pK, docx: await extractDocx(pK), docxMarks: await docxMarks(pK) };
  const runS = (A) => { const fin = A.finishFile(fS, 'sg', []); return A.recheckFinish(fin, { ...fin, ...k }, 'sg', [], 'A change made after you finished'); };
  const s = runS({ finishFile, recheckFinish });
  check(s.reviewed === false && /changed the text this review was finished over/.test(s.reopened ?? ''),
    'a style name that changed under the same body and table takes the finish off, and says the text changed', s.reopened);
  check(runS(await attestWith('if (!sameMarks(rec.basis.docxMarks, f.docxMarks)) return TEXT_CHANGED;', '')).reviewed === true && (await saved({ ...fS, ...k }, 'sg', [])).includes('Kestrel Heading'),
    'CONTROL: compared mark for mark across two lists of texts, the finish stands while the saved .docx names a style "Kestrel Heading" the lawyer never saw — the check catches it');

  // more than 256 adjacent claims of one tag diverge (see law 1): a style name that is one long
  // run of a listed surname leaves the names measure empty rather than true
  const kim = { part: 'word/styles.xml', text: 'Kim '.repeat(300).trim(), kind: 'hold', read: 'text', where: 'the style definitions' };
  const fD = { ...fS, docxMarks: [...fS.docxMarks, kim], entities: [...fS.entities, row('k', 'Kim', '[Person2]')] };
  const runD = (A) => { const fin = A.finishFile(fD, 'sg', []); return { fin, g: A.recheckFinish(fin, fin, 'sg', ['Osprey'], 'Changing the always-redact list in Settings') }; };
  let dv = null, threw = null;
  try { dv = runD({ finishFile, recheckFinish }); } catch (e) { threw = e.message; }
  check(!!dv?.fin.finish.names?.divergence && dv.g.reviewed === false && /masks could not be placed with certainty/.test(dv.g.reopened ?? ''),
    'masks that could not be placed with certainty in the texts outside the flows fail closed on the next change, and say so', threw ?? dv?.g.reopened);
  let crashed = null, md = null;
  try { md = runD(await attestWith('if (rec.names?.divergence || now.names?.divergence) return { spans: [], words: [], parts: [], textChanged: false, unread: DIVERGED };', '')).g; } catch (e) { crashed = e.message; }
  check(crashed !== null,
    'CONTROL: compared without the divergence check, the recheck throws on the empty measure, inside App.tsx\'s table write — the check catches it', crashed ?? md?.reopened ?? 'finish stands');
}

// Where the offsets cannot say all that the saved .docx carries, the record falls back: to the
// words of a flow where a name written over keeps a word of it ("[Company1] Fund"), to no
// offsets where the writer holds the file, to "could not be measured" where the writer's passes
// cannot be read back, and to a refusal at the drop where an equation cannot be matched to the
// runs the writer saves. Each fallback is one line of attest.ts, and fifteen of them could each
// be taken out with every check in this file still green (P23-6). Each case below reaches one,
// and each CONTROL takes one out. savedHidden, measureFlow and compare are read through a bundle
// that exports them, so a case measures the one flow it is about.
console.log('\n— law 3, where the offsets cannot say it all —');
{
  const { refNames } = await import(url(out.docxWrite));
  const eqP = (inner) => `<w:p><m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inner}</m:oMath></w:p>`;
  const mr = (t) => `<m:r><m:t>${t}</m:t></m:r>`;
  // a phantom Word does not show: its text stays in the file, and nothing renders between the
  // runs either side of it
  const phantom = (inner) => `<m:phant><m:phantPr><m:show m:val="0"/><m:zeroWid m:val="1"/></m:phantPr><m:e>${inner}</m:e></m:phant>`;
  const wr = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const hid = (t) => `<w:r><w:rPr><w:vanish/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const org = (key, text, tag, extra = {}) => ({ key, text, tag, cat: 'org', cls: 'COMPANY', prov: 'both passes', occ: 1, status: 'confirmed', ...extra });
  const SIGN = para('Margaret Tan signed.');
  const EXP = ['function savedHidden(', 'export { savedHidden as __savedHidden, measureFlow as __measureFlow, compare as __compare };\nfunction savedHidden('];
  const bodyOf = (marks) => marks.find((m) => m.kind === 'flow' && m.where === 'the body of the saved .docx');
  const TAG = /\[[^[\]\n]{1,60}\]/g;
  const LIST = 'Changing the always-redact list in Settings';
  // a mask handed the name "Kestrel Fund", placing `alone` in it and nothing anywhere else: the
  // name as the finish masked it (whole), as a later table masks it (one word of it), and a
  // mask that places nothing for it, which the writer holds the file on
  const maskOf = (alone) => Object.assign((t) => remask(t, t === 'Kestrel Fund' ? alone : [], 'sg'), { names: ['Kestrel Fund'] });
  const [WHOLE, ONE, NONE] = [maskOf([org('kf', 'Kestrel Fund', '[Company2]')]), maskOf([org('k', 'Kestrel', '[Company1]')]), maskOf([])];
  // one flow as the writer saves it under mask M, measured from the calls the writer made
  const savedOf = (A, m, M) => {
    const calls = [];
    const rec = Object.assign((t) => { const r = M(t); calls.push({ text: t, r }); return r; }, { names: M.names });
    const bytes = savedFlowText({ part: m.part, kind: '', record: m.text, pieces: m.pieces }, rec);
    return bytes === null ? null : { writer: bytes, ...A.__savedHidden(m, calls, refNames(M), bytes, M) };
  };
  const asMeasure = (m, s) => ({ text: m.text, bytes: s.bytes, hidden: s.hidden, tags: s.tags, ...(s.loose ? { loose: true } : {}) });
  // a tag the saved flow carries that the record neither had nor knows it wrote: compare reads
  // it as words ("Company1") that were not readable at finish
  const unlisted = (m, s) => [...new Set(s.bytes.match(TAG) ?? [])].filter((t) => !m.text.includes(t) && !s.tags.includes(t));

  const mLB = bodyOf(await docxMarks(await makePackage(para('Signed for KestrelFund today.') + SIGN, {})));
  const mLP = bodyOf(await docxMarks(await makePackage(para('Signed for Kestrelfund today.') + SIGN, {})));
  const pkgLE = await makePackage(eqP(mr('Kestrel') + phantom(mr('zz')) + mr('Fund')) + SIGN, {});
  const mLE = bodyOf(await docxMarks(pkgLE));
  const heldLE = await writeRedactedDocx(pkgLE, { mask: NONE });
  const TWO = Object.assign((t) => remask(t, t === 'Kestrel Fund' ? [org('k', 'Kestrel', '[Company1]')] : t === 'Fund' ? [org('f', 'Fund', '[Company3]')] : [], 'sg'), { names: ['Kestrel Fund', 'Fund'] });
  const pkgKF = await makePackage(eqP(mr('KestrelFund')) + SIGN, {});
  const mKF = bodyOf(await docxMarks(pkgKF));
  const wKF = await writeRedactedDocx(pkgKF, { mask: TWO });
  const fSSN = await docxFile('SSN', await makePackage(eqP(mr('123') + phantom(mr('zz')) + mr('-45-6789')) + para('Harrow Leung signed.'), {}), [person('h', 'Harrow Leung', '[Person1]')], 'us');
  const planSSN = exportPlan({ ...fSSN, reviewed: true }, [], 'us');
  const pkgEq = await makePackage(eqP(mr('Kes') + mr('trel')) + SIGN, {});
  const mEq = bodyOf(await docxMarks(pkgEq));
  // a mask that cannot certify an equation: every text but the body's own passes comes back
  // unchanged with a divergence from the frozen core (the writer's maskMath holds the file on it)
  const DIV = Object.assign((t) => { const r = remask(t, [], 'sg'); return t.includes('Margaret') ? r : { ...r, divergence: 'the frozen core disagreed' }; }, { names: [] });
  const heldDIV = await writeRedactedDocx(pkgEq, { mask: DIV });
  // a writer whose saved flow reads other than its passes left it: one word changed after the
  // last, with no mask asked
  const W_SHIFT = [['  return fold(flowLayout(pieces.map((p) => p.item)).text);\n}', "  return fold(flowLayout(pieces.map((p) => p.item)).text).replace('signed', 'sined');\n}"]];
  const pkgHdr = await makePackage(SIGN, { header: eqP(mr('Kestrel')) });
  const fA = await docxFile('A', await makePackage(`<w:p>${wr('Margaret Tan ')}${hid('[check] ')}${wr('signed.')}</w:p>` + eqP(mr('Kes') + mr('trel')), {}), [person('m', 'Margaret Tan', '[Person1]')], 'sg', ['Kestrel']);
  const fAH = await docxFile('AH', await makePackage(SIGN, { header: `<w:p>${wr('Margaret Tan ')}${hid('[check] ')}${wr('signed.')}</w:p>` + eqP(mr('Kes') + mr('trel')) }), [person('m', 'Margaret Tan', '[Person1]')], 'sg', ['Kestrel']);
  // writers this record was not written for: one that saves the body's runs short of the last,
  // one that saves no flow for a header, one that blanks the tags it wrote with another character
  const W_SHORT = [['record: flow, pieces: pieces.map((p) => ({', 'record: flow, pieces: pieces.slice(0, -1).map((p) => ({']];
  const W_NOHDR = [['        report.flows.push({ part: n,', "        if (rule.kind !== 'header') report.flows.push({ part: n,"]];
  const BLANK = [["(t) => '█'.repeat(t.length)) : text;\n  };", "(t) => '▒'.repeat(t.length)) : text;\n  };"]];
  const BW = await writerWith(BLANK);

  const LAWS = {
    measured: {
      label: 'a listed name the author ran into the next word as one word of prose ("Kestrelfund", a row "Kestrel", the row "KestrelFund" switched off) is measured as the writer saves the body, "[Company1] Fund", and as a flow that keeps a word of a name readable; written "KestrelFund", which the body\'s own pass masks inside the word, it is measured as the writer saves that',
      // The body's own pass reads a row inside a token that is not a word of prose (engine.ts
      // THE RUN-TOGETHER RULE, owner ruling 8), so it masks "KestrelFund" as "[Company1]Fund"
      // and the writer's read of the names run together finds nothing left to write over; with
      // that fixture alone this law stopped reaching a flow that keeps a word (2026-09-24). A
      // word of prose, "Kestrelfund", the pass leaves, and the writer's read writes it over with
      // what the mask makes of "Kestrel Fund" alone. Both are measured as the writer saves them.
      run: async (A) => {
        const T = [org('k', 'Kestrel', '[Company1]'), org('d', 'KestrelFund', '[Company2]', { dead: true, status: 'ignored' })];
        const one = (m) => {
          const meas = A.__measureFlow(m, T, 'sg', refNames({ names: ['Kestrel Fund'] }));
          const w = savedFlowText({ part: m.part, kind: '', record: m.text, pieces: m.pieces }, Object.assign((t) => remask(t, T, 'sg'), { names: ['Kestrel Fund'] }));
          return { meas, w, said: `measured ${JSON.stringify(meas.bytes)} · the writer saves ${JSON.stringify(w)} · keeps a word: ${meas.loose}` };
        };
        const p = one(mLP), c = one(mLB);
        return [p.meas.loose === true && p.meas.bytes.includes('[Company1] Fund') && p.meas.bytes === p.w && c.meas.bytes === c.w, `${p.said} | written "KestrelFund": ${c.said}`];
      },
    },
    body: {
      label: 'finished with "KestrelFund" masked whole, then written over as "[Company1] Fund": the body names "Fund" as readable now, though the stretch it stands in is masked at both times',
      run: async (A) => {
        const s0 = savedOf(A, mLB, WHOLE), s1 = savedOf(A, mLB, ONE);
        const c = A.__compare(asMeasure(mLB, s0), asMeasure(mLB, s1));
        return [/\[Company1\] Fund/.test(s1.writer) && s1.loose === true && c.words.includes('Fund'), `the writer saves ${JSON.stringify(s1.writer)} · keeps a word: ${s1.loose} · named readable ${JSON.stringify(c)}`];
      },
    },
    equation: {
      label: 'the same in an equation whose runs split the name around a phantom Word does not show ("Kestrel", a hidden "zz", "Fund"): measured as the writer masks it, "Fund" named as readable now, and every tag the saved equation carries one the record knows it wrote',
      run: async (A) => {
        const s0 = savedOf(A, mLE, WHOLE), s1 = savedOf(A, mLE, ONE);
        const c = A.__compare(asMeasure(mLE, s0), asMeasure(mLE, s1));
        return [s1.loose === true && c.words.includes('Fund') && unlisted(mLE, s1).length === 0, `measured ${JSON.stringify(s1.bytes)} · keeps a word: ${s1.loose} · tags ${JSON.stringify(s1.tags)} · tags it does not know ${JSON.stringify(unlisted(mLE, s1))} · named readable ${JSON.stringify(c)}`];
      },
    },
    held: {
      label: 'an equation the writer holds the file on (a listed name run together in it that the mask places nothing for) is measured with no offsets, as a flow nothing of which ships',
      run: async (A) => {
        const s = savedOf(A, mLE, NONE);
        return [!!s && s.hidden === null && !heldLE.bytes, `offsets ${JSON.stringify(s?.hidden)} · the writer ${heldLE.bytes ? 'saves the file' : `holds it: ${heldLE.held}`}`];
      },
    },
    // Two fallbacks for a mask or a writer this record was not written for, which no real
    // document here produces, so each is read against one made to: with no case reaching them,
    // either taken out passed every other check in this file (P2T6-5)
    diverged: {
      label: 'an equation whose mask diverges from the frozen core and changes nothing ("Kes" + "trel") is measured with no offsets, as a flow nothing of which ships — the writer holds the file on it',
      run: async (A) => {
        const s = savedOf(A, mEq, DIV);
        return [!!s && s.hidden === null && !heldDIV.bytes && /could not certify an equation/.test(heldDIV.held ?? ''), `offsets ${JSON.stringify(s?.hidden)} · the writer ${heldDIV.bytes ? 'saves the file' : `holds it: ${heldDIV.held}`}`];
      },
    },
    rebuilt: {
      writer: W_SHIFT,
      label: 'a writer whose saved body reads other than its passes left it (a word changed after the last, no mask asked) is measured with no offsets, and a body with an equation as unsure',
      run: async (A) => {
        const meas = A.__measureFlow(mEq, [org('k', 'Kestrel', '[Company1]')], 'sg', refNames({ names: ['Kestrel'] }));
        return [/sined/.test(meas.bytes) && meas.hidden === null && /could not be measured/.test(meas.unsure ?? ''), `measured ${JSON.stringify(meas.bytes)} · offsets ${JSON.stringify(meas.hidden)} · unsure: ${meas.unsure ?? 'no'}`];
      },
    },
    ssn: {
      label: 'an SSN typed in an equation around a phantom ("123", a hidden "zz", "-45-6789"), practice United States: measured as the writer saves it, "[ssn]" with no digit readable, and "[ssn]" a tag the record knows it wrote',
      run: async (A) => {
        const m = bodyOf(fSSN.docxMarks);
        const meas = A.__measureFlow(m, planSSN.docx.table, 'us', refNames(planSSN.docx.mask));
        return [/\[ssn\]/.test(meas.bytes) && !/6789/.test(meas.bytes) && meas.tags.includes('[ssn]') && unlisted(m, meas).length === 0, `measured ${JSON.stringify(meas.bytes)} · tags ${JSON.stringify(meas.tags)} · tags it does not know ${JSON.stringify(unlisted(m, meas))}`];
      },
    },
    blanked: {
      label: 'an equation "KestrelFund" the body\'s own passes wrote "[Company1] Fund" into is read with what they wrote blanked, as the writer reads it: "Fund" is not taken for a listed name the writer never masks there',
      run: async (A) => {
        const s = savedOf(A, mKF, TWO);
        const w = (await carried(wKF.bytes)).filter((x) => x.where.startsWith('word/document.xml')).map((x) => x.text).join('|');
        return [s.bytes.includes('[Company1] Fund') && !/Company3/.test(s.bytes) && w.includes('[Company1] Fund') && !/Company3/.test(w), `measured ${JSON.stringify(s.bytes)} · the writer saves ${JSON.stringify(w.split('|').filter((x) => /Compan/.test(x)))}`];
      },
    },
    pieces: {
      writer: W_SHORT,
      label: 'a writer that saves the body\'s runs other than as they were read (the last one left out) is refused at the drop, over an equation that cannot be matched to the runs it saves',
      run: async (A) => { const e = await A.docxMarks(pkgEq).then(() => null, (x) => x.message); return [/could not be matched to the runs the writer saves/.test(e ?? ''), e ?? 'read without a word']; },
    },
    header: {
      writer: W_NOHDR,
      label: 'a header with an equation that the writer saves no flow for is refused at the drop, and says so',
      run: async (A) => { const e = await A.docxMarks(pkgHdr).then(() => null, (x) => x.message); return [/saved no flow for word\/header1\.xml/.test(e ?? ''), e ?? 'read without a word']; },
    },
    unsure: {
      writer: BLANK,
      label: 'where the body\'s equations cannot be measured as the writer masks them (a writer that blanks its tags with another character), taking "Kestrel" off the list takes the finish off and says the equations could not be measured, while the saved .docx ships "Kes"',
      run: async (A) => {
        const fin = A.finishFile({ ...fA, docxMarks: await A.docxMarks(fA.bytes) }, 'sg', ['Kestrel']);
        const g = A.recheckFinish(fin, fin, 'sg', [], LIST);
        const ships = /Kes/.test(((await savedAll(g, 'sg', [], undefined, BW)).all ?? []).map((x) => x.text).join('\n'));
        return [fin.reviewed === true && g.reviewed === false && /could not be measured/.test(g.reopened ?? '') && ships, `${g.reviewed ? 'the finish stands' : g.reopened} · the saved .docx ships "Kes": ${ships}`];
      },
    },
    // a header is measured apart from the body, and its unsure has to pin the recheck as the
    // body's does: read from the body only, this case passed every check in this file while the
    // saved header shipped "Kes" under a finish that stood (P2T6-4)
    unsureHeader: {
      writer: BLANK,
      label: 'the same with the equation and the hidden note in a header: taking "Kestrel" off the list takes the finish off and says the header\'s equations could not be measured, while the saved header ships "Kes"',
      run: async (A) => {
        const fin = A.finishFile({ ...fAH, docxMarks: await A.docxMarks(fAH.bytes) }, 'sg', ['Kestrel']);
        const g = A.recheckFinish(fin, fin, 'sg', [], LIST);
        const ships = /Kes/.test(((await savedAll(g, 'sg', [], undefined, BW)).all ?? []).filter((x) => x.where.startsWith('word/header')).map((x) => x.text).join('\n'));
        return [fin.reviewed === true && g.reviewed === false && /equations in a header could not be measured/.test(g.reopened ?? '') && ships, `${g.reviewed ? 'the finish stands' : g.reopened} · the saved header ships "Kes": ${ships}`];
      },
    },
  };
  const live = await attestWith([EXP]);
  const bundle = (pairs, writer) => attestWith([...pairs, EXP], null, [], writer ?? []);
  for (const L of Object.values(LAWS)) {
    const [ok, said] = await L.run(L.writer ? await bundle([], L.writer) : live);
    check(ok, L.label, said);
  }
  // CONTROL (P23-6): each fallback taken out, against the one case above that reaches it
  const OUT = [
    ['unsure', 'without the check for a flow measured as unsure, taking "Kestrel" off the list leaves the finish standing while the saved .docx ships "Kes"',
      [['  if (unsure) return { spans: [], words: [], parts: [], textChanged: false, unread: unsure };\n', '']]],
    ['unsure', 'with a flow whose passes cannot be read back not marked unsure where it has an equation, the same change leaves the finish standing while the saved .docx ships "Kes"',
      [['...(m.eq ? { unsure: ', '...(false ? { unsure: ']]],
    ['body', 'compared by offsets alone where a name written over keeps a word, "Fund" is not named as readable, and nothing in the body is',
      [['if (was.hidden && now.hidden && !was.loose && !now.loose) return { spans, words: [] };', 'if (was.hidden && now.hidden) return { spans, words: [] };']]],
    ['measured', 'with the kept word dropped where the flow is measured, "[Company1] Fund" is not marked as keeping one, and is compared by offsets alone',
      [['...(saved.loose ? { loose: true } : {})', '...{}']]],
    ['measured', 'without asking whether the mask of a name alone keeps a word of it, the flow is not marked, and "Fund" is compared by offsets alone',
      [['loose ||= keepsWords(r); }', '}']]],
    ['equation', 'without asking the same of a name written over in an equation, the equation is compared by offsets alone and "Fund" is not named',
      [['      loose ||= keepsWords(n);\n', '']]],
    ['held', 'measured by offsets where the writer holds the file, the record states what ships of a flow nothing of which ships',
      [['    if (!eq) return { hidden: null, bytes, tags, loose };', '    if (!eq) return { hidden: uncovered([[0, rec.length]], uncovered(merged(pieces.map((p): Range => [p.s, p.e])), merged(masked))), bytes, tags, loose };']]],
    ['ssn', 'with the flow read back before its equations were masked, the measure carries the SSN\'s digits readable where the saved .docx carries "[ssn]"',
      [['    out = fold(flowLayout(items).text);\n', '']]],
    ['ssn', 'without the tags the equations wrote, "[ssn]" is read as the word "ssn", readable in the saved flow',
      [['    tags.push(...eq.tags);\n', '']]],
    ['equation', 'without the tag a name alone writes in an equation, "[Company1]" is not known as a tag, and "Company1" is named as readable',
      [['      tags.push(...writerIntervals(n).map((iv) => iv.tag));\n', '']]],
    ['ssn', 'without the tags each equation wrote passed back, "[ssn]" is read as the word "ssn"',
      [['    wrote.push(...tags);\n', '']]],
    ['ssn', 'without the saved flow\'s own tags taken into its measure, "[ssn]" is read as the word "ssn"',
      [['  for (const t of saved.tags) tags.add(t);\n', '']]],
    ['blanked', 'without the tags the body\'s read of a name alone wrote, the equation reads "Fund" as a listed name and the measure masks it, while the saved .docx ships it readable',
      [['      for (const iv of ivs) tags.push(iv.tag);\n', '']]],
    ['pieces', 'with an equation left unmatched in silence, the drop reads the body without a word, over runs the writer does not save',
      [['  if (!aligned) throw new Error(', '  if (!aligned) return undefined;\n  if (false) throw new Error(']]],
    ['header', 'without the refusal, a header equation the writer saves no flow for is read at the drop and never measured, and nothing says so',
      [['    else if (flowWhere && flow.some((i) => i.math)) throw new Error(', '    else if (false) throw new Error(']]],
    ['unsureHeader', 'with only the body\'s measure asked whether it is unsure, taking "Kestrel" off the list leaves the finish standing while the saved header ships "Kes"',
      [['const unsure = [rec.saved, now.saved, ...rec.parts, ...now.parts].find', 'const unsure = [rec.saved, now.saved].find']]],
    ['diverged', 'without asking whether an equation\'s mask diverged, an equation the writer holds the file on is measured by offsets, as if it shipped as its mask left it',
      [['    if (r.divergence) return null;\n    const all = writerIntervals(r);', '    const all = writerIntervals(r);']]],
    ['rebuilt', 'without reading the rebuilt flow against the bytes the writer saved, the body is measured by offsets the writer\'s saved flow does not bear out',
      [['  if (fold(flowLayout(items).text) !== bytes) return lost();\n', '']]],
    ['rebuilt', 'with that fallback not marking a body with an equation unsure, the same body is compared by its words, its equations never measured, and nothing says so',
      [['  if (fold(flowLayout(items).text) !== bytes) return lost();', '  if (fold(flowLayout(items).text) !== bytes) return { hidden: null, bytes, tags, loose };']]],
  ];
  for (const [id, label, pairs] of OUT) {
    // a moved anchor throws here and ends the run, never reads as a CONTROL that caught something
    const A = await bundle(pairs, LAWS[id].writer);
    let r;
    try { r = await LAWS[id].run(A); } catch (e) { r = [false, `threw: ${e.message}`]; }
    check(!r[0], `CONTROL (P23-6): ${label}`, r[1]);
  }
}

// ── LAW 4: an undo reaches only the file on screen ──
console.log('\n— law 4: undo reaches only the file on screen, and says what it did —');
{
  // C3-1 as the lawyer did it. A: add Alice by hand, finish, "next file". B: confirm a row,
  // then U twice on B's review.
  const TA = 'Alice Kowalczyk instructed us. Later Bob Nowak called about the claim.';
  const TB = 'Yusuf Demir wrote. Nothing else.';
  const run = (impl) => {
    const files = new Map();
    const write = (id, fn) => files.set(id, recheckFinish(files.get(id), withFloor({ ...files.get(id), entities: fn(files.get(id).entities) }, 'sg'), 'sg', [], 'Your undo'));
    files.set('A', fileOf('A', TA, [person('e1', 'Bob Nowak', '[Person2]')]));
    files.set('B', fileOf('B', TB, [person('y', 'Yusuf Demir', '[Person1]', { prov: 'second sweep', status: 'pending' })]));
    let stack = [];
    let seq = 0;
    const alice = hand('u1', 'Alice Kowalczyk', '[Person1]');
    write('A', (es) => [...es, alice]);
    stack = impl.push(stack, { id: ++seq, fileId: 'A', what: 'Redacted “Alice Kowalczyk” — 1 occurrence masked', run: () => write('A', (es) => withdrawRow(es, alice)) });
    files.set('A', finishFile(files.get('A'), 'sg', []));
    const y = files.get('B').entities[0];
    write('B', (es) => decideRows(es, [y.key], { dead: false, status: 'confirmed' }));
    stack = impl.push(stack, { id: ++seq, fileId: 'B', what: '“Yusuf Demir” confirmed — redacts as Person 1', run: () => write('B', (es) => restoreRows(es, [y])) });
    const said = [];
    for (let i = 0; i < 2; i++) { const r = impl.u(stack, 'B'); stack = r.rest; said.push(r.said); }
    const a = files.get('A');
    return { a, said, aBytes: bytes(TA, a.entities), stackLeft: stack.map((e) => e.fileId).join() };
  };
  const NEW = {
    push: pushUndo,
    u: (stack, onScreen) => { const { entry, rest } = takeUndo(stack, onScreen); if (entry) entry.run(); return { rest, said: entry ? undoneNote(entry) : NOTHING_TO_UNDO }; },
  };
  // the stack as it shipped: push, and pop with no file check and no message (App.undoToast)
  const OLD = {
    push: (stack, e) => [...stack, e],
    u: (stack) => { const rest = stack.slice(); const e = rest.pop(); if (e) e.run(); return { rest, said: '' }; },
  };
  const now = run(NEW);
  check(!now.aBytes.includes('Alice') && now.a.reviewed === true && now.stackLeft === 'A',
    'C3-1: two U presses on B\'s review undo B\'s change and then stop — A keeps Alice masked and its finish, and its entry waits for A\'s own review', now.aBytes);
  check(now.said[0] === 'Undone: “Yusuf Demir” confirmed — redacts as Person 1' && now.said[1] === NOTHING_TO_UNDO,
    'the first press says what it undid; the second says there is nothing left in this document', now.said.join(' | '));
  const was = run(OLD);
  check(was.aBytes.includes('Alice Kowalczyk') && was.said.every((s) => s === ''),
    'CONTROL: the single stack withdraws Alice from finished file A on the second press, silently — the check catches it', was.aBytes);
  check(was.a.reviewed === false && /“Alice Kowalczyk” readable/.test(was.a.reopened ?? ''),
    'and even then the recheck takes A\'s finish off and names her, so the leak cannot export under "finished by you"', was.a.reopened);

  // the toast's own button undoes that toast's change, once
  let stack = [];
  stack = pushUndo(stack, { id: 1, fileId: 'A', what: 'one', run: () => {} });
  stack = pushUndo(stack, { id: 2, fileId: 'A', what: 'two', run: () => {} });
  const t1 = takeUndo(stack, 'A', 1);
  check(t1.entry?.id === 1 && t1.rest.map((e) => e.id).join() === '2', 'a toast\'s button undoes its own change, not the latest one');
  check(takeUndo(t1.rest, 'A', 1).entry === null && ALREADY_UNDONE.length > 0, 'pressed again, it finds nothing and says the change was already undone');
  check(takeUndo(stack, 'B', 2).entry === null, 'an entry id from another file never matches');
  check(dropFile([...stack, { id: 3, fileId: 'B', what: 'b', run: () => {} }], 'A').map((e) => e.id).join() === '3', 'removing a file drops its changes and no other file\'s');
  let big = [];
  for (let i = 0; i < UNDO_CAP + 5; i++) big = pushUndo(big, { id: i, fileId: 'A', what: String(i), run: () => {} });
  check(big.length === UNDO_CAP && big[0].id === 5, `the stack keeps the latest ${UNDO_CAP} changes`);
}

// ── LAW 5: App.tsx wiring, and the cost ──
console.log('\n— law 5: App.tsx routes every write, practice change, list change and finish through the helpers —');
/** comments out, so a word in a comment is never read as code */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1');
const APP = readFileSync(src('App.tsx'), 'utf8').replace(/\r\n/g, '\n');
const REVIEW = readFileSync(src('screens', 'Review.tsx'), 'utf8').replace(/\r\n/g, '\n');
const mutate = (source, from, to) => { if (!source.includes(from)) throw new Error(`CONTROL anchor not found: ${from.slice(0, 80)}`); return source.replace(from, to); };
const LEAVE_SETTINGS = /useLayoutEffect\(\(\) => \{\s*const left = lastLane\.current === 'settings' && lane !== 'settings';\s*lastLane\.current = lane;\s*if \(lane === 'settings' && !measuredIn\.current\) measuredIn\.current = \{ practice: loadPractice\(\), terms: loadProtectedTerms\(\) \};\s*if \(!left\) return;\s*measuredIn\.current = null;\s*const p = loadPractice\(\), terms = loadProtectedTerms\(\);\s*setFiles\(\(fs\) => fs\.map\(\(f\) => recheckFinish\(f, f, p, terms, LIST_CAUSE\)\)\);\s*\}, \[lane\]\);/;
/** a practice switch measures the list edits made before it in the same visit first, under the
 *  practice they were made under (P2-PATHS-4) */
const PRACTICE_SWITCH = /const onPracticeChange = useCallback\(\(\) => \{\s*const p = loadPractice\(\), terms = loadProtectedTerms\(\);\s*const why = `Switching the practice to \$\{practiceLabel\(p\)\}`;\s*const was = measuredIn\.current;\s*const listed = !!was && was\.terms\.join\('\\n'\) !== terms\.join\('\\n'\);\s*setFiles\(\(fs\) => fs\.map\(\(f\) => \{\s*const g = listed \? recheckFinish\(f, f, was!\.practice, terms, LIST_CAUSE\) : f;\s*return recheckFinish\(g, withFloor\(g, p\), p, terms, why\);\s*\}\)\);\s*if \(was\) measuredIn\.current = \{ practice: p, terms \};\s*\}, \[\]\);/;
const audit = (source) => {
  const s = code(source);
  const problems = [];
  if (/reviewed:\s*true/.test(s)) problems.push('`reviewed: true` written directly');
  if ((s.match(/\bfinishFile\(/g) || []).length !== 1) problems.push('finishFile is not the one road to a finish');
  if (!/finishFile\(f, loadPractice\(\), loadProtectedTerms\(\)\)/.test(s)) problems.push('the finish does not record the practice and the always-redact list in force');
  // every map over the queue that re-syncs a table must recheck the finish
  for (const m of s.matchAll(/fs\.map\(([^;]*?withFloor[^;]*?)\);/g)) if (!/recheckFinish\(/.test(m[1])) problems.push(`a table write without recheckFinish: ${m[0].replace(/\s+/g, ' ').slice(0, 90)}`);
  if (/fs\.map\(withFloor\)/.test(s)) problems.push('fs.map(withFloor) — the practice change as it shipped');
  if (/syncFloorRows\(f\.text, f\.entities/.test(s)) problems.push('a floor sync that bypasses withFloorRows');
  if (!/onPracticeChange=\{onPracticeChange\}/.test(s)) problems.push('Settings is not handed onPracticeChange');
  if (!LEAVE_SETTINGS.test(s)) problems.push('leaving Settings does not recheck every file against the always-redact list');
  if (!/const LIST_CAUSE = 'Changing the always-redact list in Settings';/.test(s)) problems.push('a finish the list takes off is not named for the list');
  if (!PRACTICE_SWITCH.test(s)) problems.push('a practice switch measures the list edits made before it as its own');
  if (/undoStack\.current\.pop\(\)/.test(s)) problems.push('the undo stack is popped without a file check');
  if (!/takeUndo\(undoStack\.current, fileId, entryId\)/.test(s)) problems.push('undoIn does not take its entry through takeUndo');
  if (!/onUndo=\{\(\) => \{ if \(active\) undoIn\(active\.id\); \}\}/.test(s)) problems.push('U on the review is not bound to the file on screen');
  if (!/toast\.fileId === reviewOnScreen/.test(s)) problems.push('the toast\'s Undo button is not limited to the file on screen');
  if (!/showToast\(undoneNote\(entry\)\)/.test(s)) problems.push('an undo does not say what it undid');
  if (!/f\.reopen && seenReopen\.current\.get\(f\.id\) !== f\.reopen\b/.test(s)) problems.push('the reopen toast is not keyed on the reopen itself');
  return problems;
};
{
  const p = audit(APP);
  check(p.length === 0, 'the finish, every table write, the practice change, leaving Settings, both undo roads and the reopen toast go through the helpers', p.join('\n          '));
  check((code(APP).match(/recheckFinish\(/g) || []).length === 4,
    'recheckFinish is called in exactly the four places that change a finished export: a table write, a practice change and the list edits made before it, and leaving Settings (the always-redact list)');
  const noteShown = /\{file\.reopened && \(/.test(REVIEW) && /Changed since you finished — finish again\.<\/b> \{file\.reopened\}/.test(REVIEW);
  check(noteShown, 'the Review screen shows the note, headed "Changed since you finished — finish again."');
  // the finish button asks finishHold before it finishes, finishes nowhere else, and shows a
  // refusal beside itself: a refusal App never hears of cannot be finished over
  const HOLD = /const hold = file \? finishHold\(file, loadPractice\(\), loadProtectedTerms\(\)\) : null;\s*if \(hold\) \{ setHeld\(\{ note: hold, entities \}\); return; \}\s*setHeld\(null\);\s*onContinue\(\);/;
  // the refusal is shown only while the table is the one it was measured on: a row marked since
  // can have answered it, and a refusal kept after that tells the lawyer to mark what is masked
  const KEYED = /const heldNote = held && held\.entities === entities \? held\.note : null;/;
  const refusal = (src0) => HOLD.test(code(src0)) && (code(src0).match(/onContinue\(\)/g) || []).length === 1 && KEYED.test(code(src0))
    && /\{heldNote && \(\s*<div className="vrow" role="alert"[^>]*>\s*<span[^>]*>\s*<b>Not finished\.<\/b> \{heldNote\}/.test(src0);
  check(refusal(REVIEW), 'the Review screen asks finishHold before it finishes, finishes nowhere else, and shows a refusal beside the button, headed "Not finished.", only while the table is the one it was measured on');
  check(!refusal(mutate(REVIEW, 'if (hold) { setHeld({ note: hold, entities }); return; }', '')), 'CONTROL: a finish button that finishes over the refusal is caught');
  check(!refusal(mutate(REVIEW, '{heldNote && (', '{false && (')), 'CONTROL: a refusal that is never shown is caught');
  check(!refusal(mutate(REVIEW, 'const heldNote = held && held.entities === entities ? held.note : null;', 'const heldNote = held ? held.note : null;')),
    'CONTROL (P2T-3): a refusal shown on after the table changed under it is caught');
  // the file list: without a word there, a file whose finish came off read like one never opened
  const DROP = readFileSync(src('screens', 'Drop.tsx'), 'utf8').replace(/\r\n/g, '\n');
  // the note is words in the row, not a hover title (a title never shows on touch and is not an
  // accessible name); test/drop-holds.mjs law 4 renders the row over a real recheck
  const chip = (s) => /\{!f\.reviewed && f\.reopened && <span className="revchip"[^>]*>Changed since you finished<\/span>\}/.test(code(s))
    && /\{f\.state === 'ready' && !f\.reviewed && f\.reopened && <div className="heldwhy" style=\{HELD_WHY\}>\{f\.reopened\}<\/div>\}/.test(code(s));
  check(chip(DROP), 'the file list says "Changed since you finished" on a file whose finish came off, and shows the note in the row');
  check(!chip(mutate(DROP, "borderColor: 'var(--amber)' }}>Changed since you finished</span>", "borderColor: 'var(--amber)' }}></span>")), 'CONTROL: a row with no word for a finish that came off is caught');
  check(!chip(mutate(DROP, "{f.state === 'ready' && !f.reviewed && f.reopened && <div className=\"heldwhy\" style={HELD_WHY}>{f.reopened}</div>}", '')), 'CONTROL: a row whose note is only a hover title, as it was, is caught');

  // CONTROLS — each recreates the code that shipped
  const c1 = audit(mutate(APP, 'onPracticeChange={onPracticeChange}', 'onPracticeChange={() => setFiles((fs) => fs.map(withFloor))}'));
  check(c1.length > 0, 'CONTROL: the practice change as it shipped (fs.map(withFloor)) is caught', c1.join(' · '));
  const c2 = audit(mutate(APP, '? recheckFinish(f, withFloor({ ...f, entities: fn(f.entities) }, p), p, terms, why)', '? withFloor({ ...f, entities: fn(f.entities) }, p)'));
  check(c2.length > 0, 'CONTROL: a table write that skips the recheck is caught', c2.join(' · '));
  const c3 = audit(mutate(APP, 'finishFile(f, loadPractice(), loadProtectedTerms())', '{ ...f, reviewed: true }'));
  check(c3.length > 0, 'CONTROL: markReviewed as it shipped ({ ...f, reviewed: true }) is caught', c3.join(' · '));
  const c4 = audit(mutate(APP, 'const { entry, rest } = takeUndo(undoStack.current, fileId, entryId);', 'const entry = undoStack.current.pop(); const rest = undoStack.current;'));
  check(c4.length > 0, 'CONTROL: the undo that pops the shared stack is caught', c4.join(' · '));
  const c5 = audit(mutate(APP, 'toast.fileId === reviewOnScreen', 'toast.fileId'));
  check(c5.length > 0, 'CONTROL: a toast Undo button that works from any screen is caught', c5.join(' · '));
  const c6 = audit(mutate(APP, 'setFiles((fs) => fs.map((f) => recheckFinish(f, f, p, terms, LIST_CAUSE)));', ''));
  check(c6.length > 0, 'CONTROL: leaving Settings with no recheck — the list as it shipped, which nothing measured — is caught', c6.join(' · '));
  const c7 = audit(mutate(APP, 'f.reopen && seenReopen.current.get(f.id) !== f.reopen', 'f.reopened && seenReopen.current.get(f.id) !== f.reopened'));
  check(c7.length > 0, 'CONTROL: a toast keyed on the note, which would announce "something would now be readable" each time the note is re-measured, is caught', c7.join(' · '));
  check(!(/\{file\.reopened && \(/.test(mutate(REVIEW, '{file.reopened && (', '{false && (')) ), 'CONTROL: a note that is never rendered is caught');
  const c8 = audit(mutate(APP, 'const g = listed ? recheckFinish(f, f, was!.practice, terms, LIST_CAUSE) : f;', 'const g = f;'));
  check(c8.length > 0, 'CONTROL: a practice switch that measures the list edits before it as its own — P2-PATHS-4 as it shipped — is caught', c8.join(' · '));
}

// The two Settings roads replayed over the real helpers: as App.tsx runs them now (the source
// checks above hold it to this), and as they shipped, where a practice switch measured the list
// as just edited. Settings saves the list without telling App; App learns of it at a practice
// switch or on leaving.
console.log('\n— law 5, one visit to Settings, two changes: each named for what it left readable —');
{
  const LIST_CAUSE = 'Changing the always-redact list in Settings';
  const PLACE = { sg: 'Singapore', us: 'United States', uk: 'United Kingdom' };
  const NOW = (fs, was, p, terms) => {
    const listed = was.terms.join('\n') !== terms.join('\n');
    return fs.map((f) => { const g = listed ? recheckFinish(f, f, was.practice, terms, LIST_CAUSE) : f; return recheckFinish(g, withFloor(g, p), p, terms, `Switching the practice to ${PLACE[p]}`); });
  };
  const SHIPPED = (fs, was, p, terms) => fs.map((f) => recheckFinish(f, withFloor(f, p), p, terms, `Switching the practice to ${PLACE[p]}`));
  /** into Settings, the steps in order, and out */
  const visit = (practiceChange, f, p0, t0, steps) => {
    let fs = [f], practice = p0, list = t0, was = { practice: p0, terms: t0 };
    for (const s of steps) {
      if (s.list) list = s.list;
      if (s.practice) { practice = s.practice; fs = practiceChange(fs, was, practice, list); was = { practice, terms: list }; }
    }
    return fs.map((x) => recheckFinish(x, x, practice, list, LIST_CAUSE))[0];
  };
  const pkg = await makeDocx({ body: para('The purchaser attended the completion meeting.'), header: para('KESTREL · SSN 123-45-6789 · PRIVILEGED') });
  const fUs = finishFile(await docxFile('V1', pkg, [], 'us', []), 'us', ['Kestrel']);
  const opens = (g, cause) => g.reviewed === false && ((g.reopened ?? '').startsWith(`${cause} took your finish off`) || (g.reopened ?? '').startsWith(`${cause} left `));
  const said = (g) => g.reopened ?? 'finish stands';
  // the codename taken off the list, then a switch to a practice with no SSN rule: each change
  // leaves something readable of its own
  const listFirst = [{ list: [] }, { practice: 'uk' }];
  const a = visit(NOW, fUs, 'us', ['Kestrel'], listFirst);
  const aq = quotes(a.reopened).map((q) => q.text);
  check(opens(a, LIST_CAUSE) && aq.includes('KESTREL') && aq.includes('123-45-6789'),
    'the list edited, then the practice switched: the note names the list, which took the finish off first, and lists what the table leaves readable now — the codename and the SSN', said(a));
  const as = visit(SHIPPED, fUs, 'us', ['Kestrel'], listFirst);
  check(opens(as, 'Switching the practice to United Kingdom'),
    'CONTROL: measured together as they shipped, the note blames the practice switch for the codename the list let go — the check catches it', said(as));
  // P2-PATHS-4 as filed: the term taken off the list, then a switch that masks more
  const fSg = finishFile(await docxFile('V2', await makeDocx({ body: para('The purchaser attended.'), header: para('KESTREL — PRIVILEGED &amp; CONFIDENTIAL') }), [], 'sg', []), 'sg', ['Kestrel']);
  const b = visit(NOW, fSg, 'sg', ['Kestrel'], [{ list: [] }, { practice: 'us' }]);
  const bs = visit(SHIPPED, fSg, 'sg', ['Kestrel'], [{ list: [] }, { practice: 'us' }]);
  check(opens(b, LIST_CAUSE) && quotes(b.reopened).some((q) => q.text === 'KESTREL' && q.where === 'a header'),
    'P2-PATHS-4: the term taken off the list, then the practice switched to one that masks more — the note names the list and the header', said(b));
  check(opens(bs, 'Switching the practice to United States'),
    'CONTROL: as it shipped, the same visit blames "Switching the practice to United States", a change that masks more — the check catches it', said(bs));
  // the practice first: it took the finish off, and the note keeps naming it
  const c = visit(NOW, fUs, 'us', ['Kestrel'], [{ practice: 'sg' }, { list: [] }]);
  check(opens(c, 'Switching the practice to Singapore') && quotes(c.reopened).some((q) => q.text === 'KESTREL'),
    'the practice switched, then the list edited: the switch took the finish off first and stays named, and the note lists the codename the list let go since', said(c));
  // a visit that changes nothing leaves the finish alone
  const d = visit(NOW, fSg, 'sg', ['Kestrel'], [{ list: ['Kestrel', 'Osprey'] }, { practice: 'sg' }, { list: ['Kestrel'] }]);
  check(d.reviewed === true, 'a visit that adds a term, re-picks the practice and takes the term off again leaves the finish standing', said(d));
}

// withFloorRows is syncFloorRows with the export made once: the same table back (the same
// array when nothing needs syncing), and the export it remembers for a synced table equal to a
// fresh remask of it. Over every practice pair, stale and dead floor rows, and no floor at all.
console.log('\n— withFloorRows answers as syncFloorRows does, from one export —');
{
  const T = 'SSN 123-45-6789, EIN 12-3456789, NINO AB 12 34 56 C, US tel (415) 555-0173, SG tel +65 6438 2210, NRIC S1234567D, mail jo@example.com. Margaret Tan signed.';
  const rows = [person('m', 'Margaret Tan', '[Person1]')];
  const tables = [];
  for (const p0 of ['sg', 'us', 'uk']) {
    const t = syncFloorRows(T, rows, p0);
    tables.push([`synced under ${p0}`, t]);
    const fl = t.find((e) => e.src === 'structured-floor');
    if (fl) tables.push([`synced under ${p0}, a floor row left readable`, decideRows(t, [fl.key], { dead: true, status: 'ignored' })]);
    tables.push([`synced under ${p0}, a floor row with a stale count`, t.map((e) => (e === fl ? { ...e, occ: e.occ + 3 } : e))]);
  }
  tables.push(['no floor rows at all', rows]);
  tables.push(['a text with no floor hit', rows]);
  const bad = [];
  let synced = 0, same = 0;
  for (const [label, t] of tables) for (const p of ['sg', 'us', 'uk']) {
    const text = label === 'a text with no floor hit' ? 'Margaret Tan signed.' : T;
    const a = withFloorRows(text, t, p), b = syncFloorRows(text, t, p);
    if ((a === t) !== (b === t) || JSON.stringify(a) !== JSON.stringify(b)) { bad.push(`${label} → ${p}: differs from syncFloorRows`); continue; }
    if (a === t) { same++; continue; }
    synced++;
    const mem = exportOf(text, a, p), fresh = remask(text, a, p);
    if (JSON.stringify(mem) !== JSON.stringify(fresh)) bad.push(`${label} → ${p}: the remembered export is not the synced table's`);
    if (mem !== exportOf(text, t, p)) bad.push(`${label} → ${p}: the synced table was measured again`);
  }
  check(bad.length === 0 && synced > 0 && same > 0,
    `the same table as syncFloorRows in all ${same + synced} cases (${same} unchanged, ${synced} synced), and each synced table's export is the one already made and equal to a fresh remask`, bad.join('\n          '));
  // CONTROL: a remembered export that skipped the exemption would differ from a fresh one
  const t = syncFloorRows(T, rows, 'us');
  const fl = t.find((e) => e.src === 'structured-floor');
  const dead = decideRows(t, [fl.key], { dead: true, status: 'ignored' });
  check(JSON.stringify(remask(T, dead, 'us')) !== JSON.stringify(remask(T, t, 'us')),
    'CONTROL: a floor row\'s dead flag does change the export, so the equality above would catch a remembered export that lost it');
}

console.log('\n— the cost on a 60k-word document —');
{
  const ms = (f) => { const a = performance.now(); const r = f(); return [performance.now() - a, r]; };
  const why = 'A change made after you finished';
  // real public-domain opinions from the repo's corpus, concatenated to 60k words
  const corpus = join(here, '..', '..', '..', 'corpus');
  let T = '';
  for (const f of readdirSync(corpus).filter((n) => n.endsWith('.txt')).sort()) {
    if ((T.match(/\S+/g) || []).length >= 60000) break;
    T += readFileSync(join(corpus, f), 'utf8') + '\n\n';
  }
  const words = (T.match(/\S+/g) || []).length;
  const cnt = new Map();
  for (const m of T.matchAll(/\b[A-Z][a-z]{2,} [A-Z][a-z]{2,}\b/g)) cnt.set(m[0], (cnt.get(m[0]) || 0) + 1);
  const rows = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([s, n], i) => row('e' + i, s, `[Company${i + 1}]`, { occ: n }));
  const file = fileOf('P', T, rows, 'sg');
  const [cold, fin] = ms(() => finishFile(file, 'sg', []));
  // App.updateEntities: the write, withFloor, the recheck
  const [write, off] = ms(() => recheckFinish(fin, withFloor({ ...fin, entities: withdrawRow(fin.entities, fin.entities[0]) }, 'sg'), 'sg', [], why));
  const [warm, x2] = ms(() => exposedSince(fin.finish, off, 'sg', []));
  const [preview] = ms(() => exportOf(T, off.entities, 'sg'));
  console.log(`  NOTE  corpus opinions, ${words.toLocaleString('en')} words, ${file.entities.length} rows: finish ${cold.toFixed(0)} ms · a table write on the finished file (withFloor + recheck) ${write.toFixed(0)} ms · the recheck again ${warm.toFixed(0)} ms · Review's preview afterwards ${preview.toFixed(1)} ms`);
  check(words >= 60000 && off.reviewed === false && quotes(off.reopened).some((q) => q.text === fin.entities[0].text) && !!x2,
    `the recheck finds the withdrawn row in a ${words.toLocaleString('en')}-word document`, off.reopened);
  check(exportOf(T, off.entities, 'sg') === exportOf(T, off.entities, 'sg') && preview < 50,
    'Review\'s preview of the table a recheck just measured is served from that measurement, not computed again', `${preview.toFixed(1)} ms`);
  check(warm < 500, 'everything the recheck does beyond the one remask stays well under half a second', `${warm.toFixed(0)} ms`);

  // a dense synthetic 60k-word document: a name every 6 tokens, a phone or email every 30
  // (the shape E-M3 measured at 8,571 placements), and a US SSN every 90 so a switch to United
  // States changes the floor rows — the cost the lawyer feels on a name-dense matter, stated
  // beside the corpus figure
  const first = ['Alice', 'Bob', 'Chen', 'Divya', 'Ewa', 'Farid', 'Grace', 'Hiro', 'Ines', 'Jonas', 'Kavya', 'Liam', 'Mei', 'Nadia', 'Omar', 'Priya', 'Quentin', 'Rosa', 'Sven', 'Tariq'];
  const last = ['Kowalczyk', 'Nowak', 'Tan', 'Lim', 'Rahman', 'Okafor', 'Silva', 'Novak', 'Haddad', 'Moreau', 'Rossi', 'Schmidt', 'Yamada', 'Park', 'Singh'];
  const names = first.flatMap((a) => last.map((b) => `${a} ${b}`));
  const filler = 'the court held that the respondent had failed to establish on the balance of probabilities any breach of the duty owed and the appeal is accordingly dismissed with costs'.split(' ');
  const parts = [];
  for (let i = 1, w = 0; w < 60000; i++) {
    if (i % 6 === 0) { parts.push(names[i % names.length]); w += 2; } else if (i % 90 === 47) { parts.push(`SSN ${100 + (i % 600)}-${10 + (i % 89)}-${1000 + (i % 8999)}`); w += 2; } else if (i % 30 === 1) { parts.push(i % 2 ? `+65 ${6000 + (i % 3999)} ${1000 + (i % 8999)}` : `user${i}@example.com`); w++; } else { parts.push(filler[i % filler.length]); w++; }
  }
  const DT = parts.join(' ');
  const dense = fileOf('Q', DT, names.slice(0, 300).map((s, k) => row('s' + k, s, `[Person${k + 1}]`)), 'sg');
  const [dFinish, dFin] = ms(() => finishFile(dense, 'sg', []));
  const [dWrite, dOff] = ms(() => recheckFinish(dFin, withFloor({ ...dFin, entities: withdrawRow(dFin.entities, dFin.entities[0]) }, 'sg'), 'sg', [], why));
  const [dPractice, dUs] = ms(() => recheckFinish(dFin, withFloor(dFin, 'us'), 'us', [], 'Switching the practice to United States'));
  // read before the next practice: the memo keeps one practice per table
  const oneExport = exportOf(DT, dUs.entities, 'us') === exportOf(DT, dFin.entities, 'us');
  const [dPractice2, dUk] = ms(() => recheckFinish(dFin, withFloor(dFin, 'uk'), 'uk', [], 'Switching the practice to United Kingdom'));
  const r = exportOf(DT, dFin.entities, 'sg');
  const remasks = (g) => (g.entities === dFin.entities ? 'one: the floor rows stood' : 'two: the floor rows changed, and syncFloorRows makes its own');
  console.log(`  NOTE  dense synthetic, ${(DT.match(/\S+/g) || []).length.toLocaleString('en')} words, ${r.placements.length.toLocaleString('en')} placements + ${r.floorHits.length.toLocaleString('en')} floor hits: finish ${dFinish.toFixed(0)} ms (one remask) · a table write ${dWrite.toFixed(0)} ms (one) · practice to United States ${dPractice.toFixed(0)} ms (${remasks(dUs)}) · to United Kingdom ${dPractice2.toFixed(0)} ms (${remasks(dUk)})`);
  check(dOff.reviewed === false && dUs.entities !== dFin.entities && dUs.reviewed === true && oneExport,
    'on the dense document a practice change that adds floor rows (the SSNs, under United States) masks more and keeps the finish, and the recheck reads the export the floor sync was decided on — no third remask', `${dUs.reviewed} ${dUs.reopened ?? ''} ${oneExport}`);
  // CONTROL: a memo keyed on the table alone would hand a practice change the old export
  const TS = 'Claimant SSN 123-45-6789 agreed.';
  const ts = syncFloorRows(TS, [], 'us');
  const us = exportOf(TS, ts, 'us').text, sgNow = exportOf(TS, ts, 'sg').text;
  check(us !== sgNow && sgNow === bytes(TS, ts, 'sg'), 'the memo is checked against the practice: the same table under another practice is measured again', `${us} · ${sgNow}`);
}

// A 60k-word .docx shaped like a long firm document — a table of contents over _Toc
// bookmarks, numbered exhibits, cross-references to author bookmarks, 60 styles, a numbering
// part, fonts, a theme, a caption label — and what reading its texts outside the flows costs:
// once at the drop (docxMarks: one write under a mask that places nothing, then the walk),
// and on every finish and every recheck that measures.
{
  const ms = async (f) => { const a = performance.now(); const r = await f(); return [performance.now() - a, r]; };
  const filler = 'the court held that the respondent had failed to establish on the balance of probabilities any breach of the duty owed and the appeal is accordingly dismissed with costs'.split(' ');
  const names = ['Alice Kowalczyk', 'Bob Nowak', 'Margaret Tan', 'Kestrel Holdings', 'Harrow Leung LLP', 'Chen Wei', 'Divya Rahman'];
  const run = (t, rpr = '') => `<w:r>${rpr}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  const fld = (instr, res) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(res)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const toc = [], paras = [];
  let words = 0;
  for (let k = 1, sec = 0; words < 60000; k++) {
    if (k % 40 === 1) {
      const bm = `_Toc${100000 + ++sec}`;
      toc.push(`<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr>${run(`Section ${sec}`)}${fld(` PAGEREF ${bm} \\h `, String(sec))}</w:p>`);
      paras.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:bookmarkStart w:id="${sec}" w:name="${bm}"/>${run(`Section ${sec}`)}<w:bookmarkEnd w:id="${sec}"/></w:p>`);
      words += 2;
      continue;
    }
    let p = '';
    for (let r = 0; r < 4; r++) {
      const t = [];
      for (let i = 0; i < 12; i++) t.push((k * 7 + r * 13 + i) % 9 === 0 ? names[(k + i) % names.length] : filler[(k + r + i) % filler.length]);
      p += run(t.join(' ') + ' ', r === 2 ? '<w:rPr><w:rStyle w:val="Emph"/><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/></w:rPr>' : '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/></w:rPr>');
      words += 12;
    }
    if (k % 25 === 0) { p += fld(' SEQ Exhibit \\* ARABIC ', String(k / 25)); words++; }
    if (k % 30 === 0) { p += fld(` REF _Ref${200000 + k} \\h `, 'the clause above'); words += 3; }
    if (k % 45 === 0) { p += `<w:bookmarkStart w:id="${9000 + k}" w:name="Clause${k}"/>${run('see ')}<w:bookmarkEnd w:id="${9000 + k}"/>` + fld(` PAGEREF Clause${k} \\h `, '7'); words += 2; }
    paras.push(`<w:p><w:pPr><w:pStyle w:val="${k % 3 ? 'BodyText' : 'ClauseText'}"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${p}</w:p>`);
  }
  const body = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>${toc.join('')}<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>` + paras.join('');
  const styles = ['Heading1:heading 1', 'TOC1:toc 1', 'BodyText:Body Text', 'ClauseText:Clause Text', 'Emph:Emphasis Firm'].concat(Array.from({ length: 55 }, (_, i) => `Style${i}:Firm Style ${i}`))
    .map((s) => { const [id, name] = s.split(':'); return `<w:style w:type="${id === 'Emph' ? 'character' : 'paragraph'}" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`; }).join('');
  const pkg = await makePackage(body, { styles, settings: '<w:captions><w:caption w:name="Exhibit" w:pos="below"/></w:captions>', fontTable: '<w:font w:name="Calibri"/><w:font w:name="Georgia"/>', theme: 'Office Theme',
    numbering: '<w:abstractNum w:abstractNumId="0"><w:name w:val="Firm clauses"/><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' });
  const [tx, d] = await ms(() => extractDocx(pkg));
  const [tm, marks] = await ms(() => docxMarks(pkg));
  const text = core.foldFullwidth(flowText(d.items.filter(inMainFlow)));
  // the list at finish names a style only ("Firm Style 7"), a term the text never says, and a firm the body carries
  const TERMS = ['Kestrel', 'Osprey', 'Harrow Leung LLP', 'Firm Style 7'];
  const rows = ['Alice Kowalczyk', 'Bob Nowak', 'Margaret Tan', 'Chen Wei', 'Divya Rahman'].map((t, i) => person(`p${i}`, t, `[Person${i + 1}]`));
  const entities = syncFloorRows(text, [...rows, ...protectedEntities(text, TERMS)], 'sg');
  const base = { id: 'big', name: 'big.docx', kind: 'docx', badge: 'DOCX', state: 'ready', engineComplete: true, bytes: pkg, text, docx: d, docxMarks: marks };
  // each its own table, so no export remembered for one serves the other; three runs, each
  // with and without, and the middle difference, which the machine's load does not move as it
  // moves a single run of a second or more
  const why = 'Changing the always-redact list in Settings';
  const runs = [];
  let fin, g, finNo, gNo;
  for (let i = 0; i < 3; i++) {
    const [a, f1] = await ms(() => finishFile({ ...base, entities: [...entities] }, 'sg', TERMS));
    // without them: the flows alone, as the writer masks them
    const [b, f2] = await ms(() => finishFile({ ...base, docxMarks: marks.filter((m) => m.kind === 'flow'), entities: [...entities] }, 'sg', TERMS));
    const [c, g1] = await ms(() => recheckFinish(f1, f1, 'sg', ['Kestrel'], why));
    const [d, g2] = await ms(() => recheckFinish(f2, f2, 'sg', ['Kestrel'], why));
    runs.push({ a, b, c, d });
    [fin, g, finNo, gNo] = [f1, g1, f2, g2];
  }
  const mid = (xs) => xs.slice().sort((x, y) => x - y)[xs.length >> 1];
  const tFin = mid(runs.map((x) => x.a)), tFinNo = mid(runs.map((x) => x.b)), tRe = mid(runs.map((x) => x.c)), tReNo = mid(runs.map((x) => x.d));
  const addF = mid(runs.map((x) => x.a - x.b)), addR = mid(runs.map((x) => x.c - x.d));
  console.log(`  NOTE  .docx, ${words.toLocaleString('en')} words, ${(pkg.length / 1024).toFixed(0)} KB zipped, ${marks.length} texts outside the flows: at the drop docxMarks ${tm.toFixed(0)} ms beside extractDocx ${tx.toFixed(0)} ms · finish ${tFin.toFixed(0)} ms (${tFinNo.toFixed(0)} ms without them) · a recheck that measures ${tRe.toFixed(0)} ms (${tReNo.toFixed(0)} ms without them)`);
  check(words >= 60000 && g.reviewed === false && quotes(g.reopened).some((q) => q.text === 'Firm Style 7' && q.where === 'a style name') && gNo.reviewed === true,
    `the recheck finds the style-only term in a ${words.toLocaleString('en')}-word .docx, which a record without the texts outside the flows lets through`, g.reopened);
  // Half a second, or half of what the same finish or recheck costs without them in this run
  // where that is more: a busy machine slows both alike (four copies of docx-parts.mjs beside
  // this file took the finish from about 1.2 s to 2.6 s and what they add to +387 ms), and a
  // bound that does not move with it fails with no defect in the code. Idle it is the half
  // second it always was. A body remasked again among those texts (measureNames handed the
  // flows as well) added 1,752 ms to the finish and 1,609 ms to the recheck idle, and fails it.
  const bF = Math.max(500, tFinNo / 2), bR = Math.max(500, tReNo / 2);
  check(addF < bF && addR < bR, 'what the texts outside the flows add to a finish and to a recheck stays under half a second each, or under half of what each costs without them where the machine makes that more',
    `finish +${addF.toFixed(0)} ms (bound ${bF.toFixed(0)}) · recheck +${addR.toFixed(0)} ms (bound ${bR.toFixed(0)}) (the middle of three runs, each with and without)`);

  // Whole-body remasks, counted: attest.ts with a counter at the one remask every export, and
  // every pass of the saved body's measure, goes through (exportOf), bumped for a text as long
  // as this body only. A count is what the laws below hold, and a time is printed beside it:
  // the time of a 60k-word write swings with the machine's load, the count does not.
  const COUNT = ['  const r = remask(text, entities, practice);\n  if (!byText)', '  if (text.length > 100000) (globalThis as any).__bodyRemasks = ((globalThis as any).__bodyRemasks ?? 0) + 1;\n  const r = remask(text, entities, practice);\n  if (!byText)'];
  // and the one remask attest.ts reaches through the engine: syncFloorRows makes its own, which
  // exportOf never sees (withFloorRows calls it when the floor rows are out of step). Counted at
  // exportOf alone, one whole-body sync on every measure of the saved body left every law here
  // green while a finish on the 60k-word .docx went from 1,458 to 2,791 ms (P2R6-4)
  const SYNC_COUNT = ['export function syncFloorRows(text: string, entities: Entity[], practice: Practice = loadPractice()): Entity[] {\n  const r = remask(text, entities, practice);',
    'export function syncFloorRows(text: string, entities: Entity[], practice: Practice = loadPractice()): Entity[] {\n  if (text.length > 100000) (globalThis as any).__bodyRemasks = ((globalThis as any).__bodyRemasks ?? 0) + 1;\n  const r = remask(text, entities, practice);'];
  const counted = (pairs) => attestWith([COUNT, ...pairs], null, [SYNC_COUNT]);
  const CA = await counted([]);

  // P2-M2: a term on the list that names a body row, on every table write. The row places as it
  // did, so the saved body is the text export and costs nothing; it cost a second remask of the
  // whole body on every write (+283 ms at 67.7k words). Held as a count: the difference of two
  // medians of five, held under 150 ms until 2026-09-24, read +198, +202, +279 and +337 ms on
  // runs made while other processes loaded the machine, each with the body remasked once.
  const med = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
  const retag = (A, f, terms) => A.recheckFinish(f, { ...f, entities: A.withFloorRows(f.text, decideRows(f.entities, ['p3'], { tag: '[Person9]' }), 'sg') }, 'sg', terms, 'A change made after you finished');
  const A1 = { recheckFinish, withFloorRows };
  const ROW = [...TERMS, 'Margaret Tan'];
  const tw = { none: [], row: [] };
  let wRow;
  for (let i = 0; i < 5; i++) {
    const fa = finishFile({ ...base, entities: [...entities] }, 'sg', TERMS), fb = finishFile({ ...base, entities: [...entities] }, 'sg', ROW);
    tw.none.push((await ms(() => retag(A1, fa, TERMS)))[0]);
    const [t, w] = await ms(() => retag(A1, fb, ROW));
    tw.row.push(t);
    wRow = w;
  }
  const extra = med(tw.row) - med(tw.none);
  console.log(`  NOTE  a table write on the finished .docx: ${med(tw.none).toFixed(0)} ms · with a term on the list naming a body row ${med(tw.row).toFixed(0)} ms (${extra >= 0 ? '+' : ''}${extra.toFixed(0)} ms; medians of five, each on fresh tables)`);
  /** the whole-body remasks one table write makes on a fresh finish, through the attest module given */
  const writeRemasks = (A, terms) => {
    const f = A.finishFile({ ...base, entities: [...entities] }, 'sg', terms);
    globalThis.__bodyRemasks = 0;
    const g = retag(A, f, terms);
    return { n: globalThis.__bodyRemasks, g };
  };
  const [cNone, cRow] = [writeRemasks(CA, TERMS), writeRemasks(CA, ROW)];
  check(wRow.reviewed === true && finishRecord(wRow, 'sg', ROW).saved === null && cRow.g.reviewed === true && cNone.n === 1 && cRow.n === cNone.n,
    'a table write while the list names a body row makes no second remask of the body: the row places as it did, and the write remasks the body once, as it does without the term',
    `whole-body remasks on the write: ${cNone.n} without the term, ${cRow.n} with it`);
  const noSame = await counted([['e === entities[i] || placesAsBefore(f, wb.text, entities[i], practice, exact)', 'e === entities[i]']]);
  const oRow = writeRemasks(noSame, ROW);
  check(noSame.finishRecord(wRow, 'sg', ROW).saved !== null && oRow.n === cNone.n + 1,
    'CONTROL: without asking whether the moved row places as before, the same write measures the saved body apart — the second remask P2-M2 measured, and the count catches it', `whole-body remasks on the write: ${oRow.n}`);
  // The count is made inside exportOf and syncFloorRows, so a remask asked anywhere else in
  // attest.ts is one it never sees: P2-M2's own shape made around exportOf — a whole-body remask
  // for each row a listed term names, the answer unchanged — passed every check in this file
  // while a table write cost +950 ms (P2T6-6). attest.ts names remask twice, its import and
  // exportOf's call, and syncFloorRows twice, the same import and withFloorRows' sync; a second
  // sync passed the law as it read remask alone (P2R6-4).
  const remaskLines = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '').trim()).filter((l) => /\b(remask|syncFloorRows)\b/.test(l));
  const ATT_SRC = readFileSync(src('lib', 'attest.ts'), 'utf8').replace(/\r\n/g, '\n');
  // The law reads the two names, so either brought in under another name is a third site it
  // cannot see: "syncFloorRows as resync" and one resync in finishHold passed it while every
  // press of Finish paid a whole-body remask no count here measures (P2T7-3)
  const renamedIn = (s) => /\b(?:remask|syncFloorRows)\s+as\b/.test(s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n'));
  const oneSite = (s) => { const l = remaskLines(s); return !renamedIn(s) && l.length === 3 && l[0].startsWith('import { remask, syncFloorRows,') && l[1] === 'const r = remask(text, entities, practice);' && l[2] === 'const synced = syncFloorRows(text, entities, practice);'; };
  check(oneSite(ATT_SRC), 'attest.ts asks for a whole-body remask at two places only: exportOf, where every export is remembered and the count above is made, and withFloorRows\' sync, which runs only when the floor rows are out of step and is counted as well', remaskLines(ATT_SRC).join(' · '));
  const SYNC_EXACT = ['  const exact = !entities.some((e) => isFloorRow(e) && e.dead);\n', '  const exact = !entities.some((e) => isFloorRow(e) && e.dead) && (dt === entities || syncFloorRows(wb.text, dt, practice) !== null);\n'];
  const AROUND = [['e === entities[i] || placesAsBefore(f, wb.text, entities[i], practice, exact)', 'e === entities[i] || (remask(wb.text, dt, practice), placesAsBefore(f, wb.text, entities[i], practice, exact))'],
    ['  const ask = (text: string) => exportOf(text, record && text === m.text ? record : table, practice);', '  const ask = (text: string) => remask(text, record && text === m.text ? record : table, practice);'],
    ['e === entities[i] || placesAsBefore(f, wb.text, entities[i], practice, exact)', 'e === entities[i] || (syncFloorRows(wb.text, dt, practice), placesAsBefore(f, wb.text, entities[i], practice, exact))'], SYNC_EXACT];
  const caught = AROUND.map(([a, z]) => { if (ATT_SRC.split(a).length !== 2) throw new Error(`CONTROL anchor not found once in attest.ts: ${a.slice(0, 80)}`); return !oneSite(ATT_SRC.replace(a, () => z)); });
  check(caught.every(Boolean), 'CONTROL (P2T6-6, P2R6-4): a whole-body remask or floor sync made around exportOf for each row a listed term names, one floor sync on every measure of the saved body, and the saved flow\'s mask asked of remask direct, are each a second site, and the law names it', caught.join(','));
  const HOLD_AT = "  if (f.kind !== 'docx' || typeof f.text !== 'string' || !f.entities) return null;\n  const unseen = unseenIn(finishRecord(f, practice, terms));";
  const IMPORT_AT = 'import { remask, syncFloorRows, docxMaskTable,';
  for (const a of [HOLD_AT, IMPORT_AT]) if (ATT_SRC.split(a).length !== 2) throw new Error(`CONTROL anchor not found once in attest.ts: ${a.slice(0, 80)}`);
  const resync = ATT_SRC.replace(IMPORT_AT, () => 'import { remask, syncFloorRows, docxMaskTable, syncFloorRows as resync,')
    .replace(HOLD_AT, () => HOLD_AT.replace('\n', '\n  resync(f.text, [...f.entities], practice);\n'));
  check(!oneSite(resync) && remaskLines(resync).length === 3,
    'CONTROL (P2T7-3): a floor sync on every press of Finish, under a name the import gives it, is a third site and the law names it — the lines it reads by name still count three', `${oneSite(resync)} ${remaskLines(resync).length}`);
  // and the count sees the sync as it runs: the same write with one floor sync on every measure
  // of the saved body, the answer unchanged, makes a whole-body remask more than without it
  const oSync = writeRemasks(await counted([SYNC_EXACT]), ROW);
  check(oSync.g.reviewed === true && oSync.n > cRow.n,
    'CONTROL (P2R6-4): a floor sync on every measure of the saved body while the list names a row, the answer unchanged, costs the write another whole-body remask, and the count catches it', `whole-body remasks on the write: ${oSync.n} against ${cRow.n}`);

  // The same document with one hidden note in the body: the saved body is not the text export,
  // and it is measured apart on every finish and every recheck that measures, as the writer
  // saves it — its two passes over the body, the first over the document of record under the
  // table it is handed, the second over what ships — the cost of measuring what the writer
  // saves, stated here on each run beside what those two passes cost the writer alone.
  const hidPara = `<w:p>${run('Margaret ')}${run('[née Lim] ', '<w:rPr><w:vanish/></w:rPr>')}${run('Tan attended the hearing.')}</w:p>`;
  const pkgH = await makePackage(hidPara + body, { styles, settings: '<w:captions><w:caption w:name="Exhibit" w:pos="below"/></w:captions>', fontTable: '<w:font w:name="Calibri"/><w:font w:name="Georgia"/>', theme: 'Office Theme',
    numbering: '<w:abstractNum w:abstractNumId="0"><w:name w:val="Firm clauses"/><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' });
  const dH = await extractDocx(pkgH);
  const textH = core.foldFullwidth(flowText(dH.items.filter(inMainFlow)));
  const baseH = { ...base, id: 'bigH', bytes: pkgH, text: textH, docx: dH, docxMarks: await docxMarks(pkgH) };
  const entH = syncFloorRows(textH, [...rows, ...protectedEntities(textH, TERMS)], 'sg');
  // What is claimed is what measuring the saved body adds beyond the writer's own two passes,
  // and it cannot be read off cold runs: a 60k-word finish swings two- to three-fold with the
  // machine's load (the same remask of this body measured 0.7–2.8 s within one run of this
  // file), so the difference of two cold finishes, less the passes timed apart, moved from
  // −0.5 s to +2.2 s run to run. Each finish and each write is therefore made twice, the
  // second over the same tables with every mask served from memory (exportOf) and the record
  // made afresh (the other file's finish between them), and the claim is the difference of the
  // second runs: the placement over the record, the reading back to it, and the comparison.
  // The writer's last pass is its own too — the table's names read run together over the whole
  // flow, a scan no memory serves — and the record makes it, since it saves the flow through
  // the writer's savedFlowText: it is timed apart (`tl`) and is not what the record adds.
  const tf = { plain: [], hid: [] }, tr = { plain: [], hid: [] }, tp = [], tl = [], extraF = [], extraW = [], fresh = [];
  const namesH = exportPlan({ ...baseH, entities: [...entH], reviewed: true }, TERMS, 'sg').docx.mask.names;
  const bodyH = baseH.docxMarks.find((m) => m.kind === 'flow' && m.part === BODY_PART);
  const afterOf = (f) => ({ ...f, entities: withFloorRows(f.text, decideRows(f.entities, ['p3'], { tag: '[Person9]' }), 'sg') });
  const write = (f, after) => recheckFinish(f, after, 'sg', TERMS, 'A change made after you finished');
  let finH, holds;
  for (let i = 0; i < 5; i++) {
    const ep = [...entities], eh = [...entH];
    const [a, fp] = await ms(() => finishFile({ ...base, entities: ep }, 'sg', TERMS));
    const [b, fh] = await ms(() => finishFile({ ...baseH, entities: eh }, 'sg', TERMS));
    tf.plain.push(a); tf.hid.push(b); finH = fh;
    const [a2, fp2] = await ms(() => finishFile({ ...base, entities: ep }, 'sg', TERMS));
    const [b2, fh2] = await ms(() => finishFile({ ...baseH, entities: eh }, 'sg', TERMS));
    const ap = afterOf(fp), ah = afterOf(fh);
    const [wa] = await ms(() => write(fp, ap)), [wb, gh] = await ms(() => write(fh, ah));
    tr.plain.push(wa); tr.hid.push(wb);
    const [wa2] = await ms(() => write(fp, ap)), [wb2, gh2] = await ms(() => write(fh, ah));
    extraF.push(b2 - a2); extraW.push(wb2 - wa2);
    fresh.push(fp2.finish !== fp.finish && fh2.finish !== fh.finish && !!fh2.finish.saved && gh.reviewed === true && gh2.reviewed === true);
    // the writer's own two passes over this body under the table the finish hands it, timed
    // mask call by mask call: what measuring the saved body cannot do without
    const dt = docxMaskTable([...entH], TERMS).table;
    let passes = 0;
    const memo = new Map();
    const timed = Object.assign((t) => { const a0 = performance.now(); const m = remask(t, dt, 'sg'); passes += performance.now() - a0; memo.set(t, m); return m; }, { names: [] });
    const flowH = { part: bodyH.part, kind: '', record: bodyH.text, pieces: bodyH.pieces };
    savedFlowText(flowH, timed);
    tp.push(passes);
    // its last pass: the same flow with every mask served from memory, with the table's names
    // and without
    const served = (names) => Object.assign((t) => { let m = memo.get(t); if (!m) memo.set(t, (m = remask(t, dt, 'sg'))); return m; }, { names });
    savedFlowText(flowH, served(namesH));
    const [withRead] = await ms(() => savedFlowText(flowH, served(namesH))), [withoutRead] = await ms(() => savedFlowText(flowH, served([])));
    tl.push(withRead - withoutRead);
  }
  // Review asks before it finishes; the finish then keeps the record it asked of
  const eh = [...entH];
  const [tHold, hold] = await ms(() => finishHold({ ...baseH, entities: eh }, 'sg', TERMS));
  const [tAfter] = await ms(() => finishFile({ ...baseH, entities: eh }, 'sg', TERMS));
  holds = [hold, finishHold({ ...base, entities: [...entities] }, 'sg', TERMS)];
  const fx = med(tf.hid) - med(tf.plain), rx = med(tr.hid) - med(tr.plain), pm = med(tp), rl = med(tl), ef = med(extraF), ew = med(extraW);
  console.log(`  NOTE  one hidden note in the 60k-word body: finish ${med(tf.hid).toFixed(0)} ms (${fx >= 0 ? '+' : ''}${fx.toFixed(0)} ms beside the same body without it) · the recheck after a table write ${med(tr.hid).toFixed(0)} ms (${rx >= 0 ? '+' : ''}${rx.toFixed(0)} ms) · the writer's own two passes over that body ${pm.toFixed(0)} ms, and its read of the names run together ${rl.toFixed(0)} ms · with the masks served from memory, finish +${ef.toFixed(0)} ms, recheck +${ew.toFixed(0)} ms · Review's press of finish: the refusal check ${tHold.toFixed(0)} ms, then the finish ${tAfter.toFixed(0)} ms`);
  // The bound is a quarter of the writer's own two passes, timed in the same loop, so it moves
  // with the machine's load as they do: four copies of docx-parts.mjs beside this file took the
  // passes to 4.9 s and the recheck's addition to 483 ms (a tenth of them), over the fixed
  // 250 ms bound this replaced, with nothing wrong. What it guards is a mask of the body made
  // afresh where memory serves it, which the remask count below cannot see (it counts at
  // exportOf, and a mask made around it never gets there): measureFlow asking remask direct
  // added 1,449 ms to the finish and 1,423 ms to the recheck idle, nine tenths of the passes.
  const bP = pm / 4;
  check(!!finH.finish.saved && finH.finish.saved.text === textH && !finH.finish.saved.bytes.includes('[née Lim]') && finH.reviewed === true && holds.every((h) => h === null)
    && fresh.every(Boolean) && ef - rl < bP && ew - rl < bP && tAfter < 50,
    'with a hidden note in the body, the saved body is measured as the writer saves it — placed over the document of record, the note left out — on every finish and write, nothing is refused, what it adds beyond the writer\'s own passes (two under the table, and the names read run together) stays under a quarter of what those passes cost, and the finish after Review\'s check costs nothing more',
    `beyond the writer's passes, with the masks served from memory: finish ${(ef - rl).toFixed(0)} ms, recheck ${(ew - rl).toFixed(0)} ms, bound ${bP.toFixed(0)} ms (medians of five; the writer's own read of the names run together, ${rl.toFixed(0)} ms, taken off each) · records made afresh ${fresh.join(',')} · the finish after the check ${tAfter.toFixed(0)} ms · ${holds.join(' · ')}`);

  // What a hidden note adds is counted as well as timed (P2T-5, P2-PATHS-3): remasks of the
  // whole body, the cost that swings with the machine and grows with the table. The writer's
  // first pass is over the document of record under a table that places there as the text
  // export's does, so it is the text export's own remask, read from memory; the second, over
  // what ships, is the one measuring the saved body cannot do without. The first pass was made
  // afresh until 2026-09-23 — three body remasks where the plain body makes one, about 1.3 s a
  // table write at 200 rows beside 0.8 s without the note.
  const remasks = (A, f) => {
    globalThis.__bodyRemasks = 0;
    const fin = A.finishFile({ ...f, entities: [...f.entities] }, 'sg', TERMS);
    const atFinish = globalThis.__bodyRemasks;
    globalThis.__bodyRemasks = 0;
    const g = A.recheckFinish(fin, { ...fin, entities: A.withFloorRows(fin.text, decideRows(fin.entities, ['p3'], { tag: '[Person9]' }), 'sg') }, 'sg', TERMS, 'A change made after you finished');
    return { atFinish, atWrite: globalThis.__bodyRemasks, fin, g };
  };
  const [cPlain, cHid] = [remasks(CA, { ...base, entities: entities }), remasks(CA, { ...baseH, entities: entH })];
  const CO = await counted([['return measureFlow(wb, dt, practice, names, asExport ? entities : undefined);', 'return measureFlow(wb, dt, practice, names);']]);
  const oHid = remasks(CO, { ...baseH, entities: entH });
  const counts = (c) => `finish ${c.atFinish}, a table write ${c.atWrite}`;
  check(cPlain.atFinish === 1 && cPlain.atWrite === 1 && cHid.atFinish === 2 && cHid.atWrite === 2 && !!cHid.fin.finish.saved?.hidden && cHid.g.reviewed === true,
    'a hidden note in the 60k-word body costs a finish and a table write one body remask each beyond the plain body — the writer\'s second pass — and the first pass is the text export\'s own, read from memory',
    `whole-body remasks · plain: ${counts(cPlain)} · with the note: ${counts(cHid)}`);
  check(oHid.atFinish === 3 && oHid.atWrite === 3,
    'CONTROL (P2T-5): with the writer\'s first pass made afresh, the same finish and write make three body remasks each — the count catches it', counts(oHid));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
