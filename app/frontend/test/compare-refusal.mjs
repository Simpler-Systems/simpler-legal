// COMPARE REFUSAL — which document holds "Copy the changes", and what clears it.
// Run from app/frontend:   node test/compare-refusal.mjs
//
// Bundles src/screens/Compare.tsx with esbuild (as test/protected-terms.mjs bundles
// engine.ts) and drives the REAL maskSide / copyHeld / redactedChanges.
//
// The laws, and what each one costs when it breaks:
//
//   1. Two DIFFERENT files that share a name are two sides. Lawyers compare
//      v1/Agreement.docx against v2/Agreement.docx routinely; keyed on the name, the
//      second document's hold vanished behind the first's, the lawyer cleared one and
//      was refused again for a reason never shown.
//   2. Every refusal names its side in the pickers' words ("earlier version" / "later
//      version") as well as the file name — with two same-named files the name alone
//      does not say which one to fix.
//   3. Every hold reason carries a way through, and every gate still holds exactly as
//      it did: this change is wording and identity, never a looser gate.
//   4. A refusal puts NOTHING on the clipboard (text is null).
//   5. A way through names a road the app has. A file Drop holds after its strip run
//      stopped keeps its text and an empty table; it was sent to Review, which it
//      cannot reach (Drop gives a held row no Review button). An Ignored row's button
//      is "Redact again", not "Confirm".
//   6. The pickers' "n of k by this name on Drop" counts the rows Drop shows, including
//      the ones with no text, or it points at the wrong row.
//   7. The always-redact list holds the clipboard as it holds Export: a term added to the
//      list after both drafts were read went onto the clipboard readable under "Copied,
//      redacted" while Export held the same document over it (2026-09-23).
//   8. The clipboard's re-read asks a protected row with the match its mask used
//      (rowSurvives), as Export does — and asks the whole paragraph, the gaps BEFORE each tag
//      the mask wrote as well as the tail after the last one: a re-read text built from the
//      tail alone passes a name that stands readable ahead of a tag.
//   9. The review way names the finish button by the label lib/review.ts gives it. It
//      named "Confirm & finish review" after that button had been renamed, and this file
//      pinned the dead label.
//  10. A document whose finish a later change took off (lib/attest.ts recheckFinish) is
//      held as changed since the lawyer finished, with the note that says what changed —
//      not as a document nobody reviewed, which sent the lawyer to "decide every row" of
//      a table they had finished and never named the change.
//  11. A partial name of a listed name is counted on the clipboard and never named there.
//      The payload goes into a model; "partial name … — Hastings" told it the readable
//      "Hastings" is part of a name the copy masks. The pieces are named on this screen. Read
//      word by word over every line of the payload that is not document text, so a piece
//      printed on the line after the count is caught as surely as one printed beside it.
//  12. The re-read asks the paragraphs' readable words, not the tags the mask wrote in them:
//      a protected row "Card" was found in "[card]" and held a copy that masked it everywhere.
//      The fragment count reads the same words, so it finds no "Card" there either.
//  13. The overlap rule reaches the clipboard: where two kept names meet ("Mrs Margaret Tan"
//      in "Mrs Margaret Tan Wei Ling", beside "Tan Wei Ling"), the longer row's tag covers its
//      span and the shorter row's remainder keeps its own tag, and the copied paragraph is the
//      one the export's .txt carries. "Wei Ling" went onto the clipboard readable before.
//  14. A way through names only a button the page offers. For a term whose press on Export
//      would leave it readable, Export shows no button; a way that sent the lawyer to "one
//      button" there sent them to a button that is not on the page.
//  15. A document Export's verification holds is held here too. The re-read asks each row
//      whole; a kept row the mask leaves readable IN PART ("Wei Ling" of a kept "Tan Wei
//      Ling") is whole nowhere and passed it, while Export — which also reads every place the
//      row stands in the original — held the same document. The clipboard now asks Export's
//      own answer, names the row, and gives the way through.
//  16. An address run into a kept name reaches the clipboard with the address and the whole
//      name masked. The email rule's match ends INSIDE the name ("…@kestrel.comAnna"); the
//      engine took a glued edge only where a match ended at it, the row placed nowhere, and
//      "[email] Tan" was copied under a green verification that asked the same match.
//  17. A listed term readable only in part is marked "(in part)" in the refusal, as Export
//      marks it. Named bare, "Tan Wei Ling" sent the lawyer to search the redacted text for a
//      name it carries nowhere whole.
//  18. A kept name run together ("KestrelCapital", "kestrelcapital.com") reaches the clipboard
//      masked under its row's tag, as the .txt and the saved .docx mask it. It was copied
//      readable under a green verification.
//  19. A kept name run together behind a shorter claim ("Mr Wei Ling Tan12" behind its own
//      prefix, "Ms Anna Tan12" behind a kept "Anna") reaches the clipboard masked whole, and a
//      listed term the body writes only run together holds it. Both were copied readable.
//  20. A kept name run past a shorter row the lawyer left readable ("Ms Anna Tan12" beside a
//      left-readable "Anna") reaches the clipboard masked whole, declared or kept, and listed
//      after both drafts were read it is refused. Each was copied readable.
//  21. A client number inside an IBAN, a wire or a DMS reference, and a client's name written
//      with %20 in a pasted link, reach the clipboard masked, and listed late are refused; a
//      party's name is not masked inside "Margaret Tang", "Wong Wei Ming" or "supporter". The
//      clipboard copies what the .txt carries, as the .docx writer reads it (owner rulings 8, 9
//      and 10 of 2026-09-24).
//  22. A kept name inside a web address a row the lawyer left readable stands in, and a kept
//      name run into a hyphenated host behind a kept shorter name, reach the clipboard masked
//      as the .txt and the .docx mask them; listed late inside such an address, the term is
//      refused. A kept or listed name a percent-escape that writes no character may hide
//      ("Ren%E9%20Tan") is refused, and the way names the escape. Each was copied readable
//      under a green re-read.
//  23. The fragment count reads a piece of a listed name as a reader reads it: glued to a digit
//      or a superscript ("Kierkegaard12", "KIERKEGAARD01", "Kierkegaard2024.pdf") and written
//      with escapes in a link ("Dr.%20Kierkegaard", "S%C3%B8ren") it is counted, and inside a
//      longer word ("supporter", "Kierkegaardian") or as a plural in small letters ("the
//      porters") it is not. Each was copied under "no fragment of any listed name is readable
//      below" (owner ruling 21). Since its second pass the screen is handed each piece as the
//      copy writes it ("KIERKEGAARD", "S%C3%B8ren"), a capitalised piece under four letters
//      ("the Tans") is counted, and a word of a term on the always-redact list with no row
//      ("Mr Kestrel12" for "Kestrel Capital Partners") is counted beside the tables' rows.
//  24. A name the .docx writer reads since owner rulings 18 and 19 reaches the clipboard as the
//      .txt carries it: run into a hashtag ("#kestrelcapitaldeal"), a short form written long
//      ("Hickson Corporation" for "Hickson Corp"), a number grouped by an em dash, a minus, a
//      tab or " - ", a ligature in the row, "&nbsp" with no semicolon; and "ISPs" is not cut
//      before its P beside a kept "I.S.".
//
// Every claim prints PASS or FAIL; laws 1, 7 to 24 are followed by a CONTROL that re-creates the
// broken version and asserts the check would catch it — for 8, 11 and 13 to 24 by bundling the
// source with the old line put back (compareWith). Exit 1 on any FAIL.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const dir = mkdtempSync(join(tmpdir(), 'compare-refusal-'));
const bundle = join(dir, 'compare.mjs');
// Compare imports lib/store, which imports the PDF reader: pdfjs needs a browser (a Vite
// `?url` worker import, DOMMatrix at load). Nothing here reads a PDF, so the reader
// resolves to a stub that says so if anything ever calls it.
const noPdf = { name: 'no-pdf', setup(b) {
  b.onResolve({ filter: /extract[\\/]pdf$/ }, (args) => ({ path: args.path, namespace: 'no-pdf' }));
  b.onLoad({ filter: /.*/, namespace: 'no-pdf' }, () => ({ contents: 'export function extractPdf() { throw new Error("compare-refusal: the PDF reader is stubbed out"); }', loader: 'js' }));
} };
// The entry names its modules by absolute path, built here: a relative specifier written into
// this string reads to tools/check-clone-imports.mjs as an import of test/src/…, which does
// not exist, and holds `npm run verify`.
const srcPath = (...p) => JSON.stringify(join(here, '..', 'src', ...p).replace(/\\/g, '/'));
// the finish button's label comes from where the Review screen takes it, not from this file
const stdin = {
  contents: [
    `export * from ${srcPath('screens', 'Compare.tsx')};`,
    `export { FINISH_LABEL } from ${srcPath('lib', 'review.ts')};`,
    `export { withProtectedTerms, rowSurvives, exportPlan, syncFloorRows } from ${srcPath('lib', 'engine.ts')};`,
    `export { loadPractice } from ${srcPath('lib', 'practice.ts')};`,
  ].join('\n'),
  resolveDir: join(here, '..'), loader: 'ts',
};
await build({ stdin, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [noPdf], outfile: bundle, logLevel: 'silent' });

/** The same entry with [from, to] pairs applied to the source files `edits` names ({ 'Compare.tsx':
 *  pairs, 'engine.ts': pairs }), bundled apart, for a CONTROL that re-creates a line as it was
 *  (test/protected-terms.mjs mutantOf is the same device). Throws when a line is no longer in its
 *  source, so a CONTROL can never pass by testing nothing. */
let mutants = 0;
async function compareWith(edits) {
  const out = join(dir, `mutant-${++mutants}.mjs`);
  const mutant = { name: 'mutant', setup(b) {
    for (const [target, pairs] of Object.entries(edits)) b.onLoad({ filter: new RegExp(`[\\\\/]${target.replace('.', '\\.')}$`) }, (a) => {
      let s = readFileSync(a.path, 'utf8');
      for (const [from, to] of pairs) {
        if (!s.includes(from)) throw new Error(`compare-refusal: a CONTROL's line is no longer in ${target}: ${from}`);
        s = s.replace(from, to);
      }
      return { contents: s, loader: target.endsWith('.tsx') ? 'tsx' : 'ts' };
    });
  } };
  await build({ stdin, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [mutant, noPdf], outfile: out, logLevel: 'silent' });
  return import('file:///' + out.replace(/\\/g, '/'));
}
// maskPara as it would be with the gap before a tag left out of the re-read's text (law 8)
const CP_GAP = [['if (sp.s > pos) { out += side.norm.slice(pos, sp.s); plain += side.norm.slice(pos, sp.s); }', 'if (sp.s > pos) { out += side.norm.slice(pos, sp.s); }']];
// the payload with the pieces printed on the line after the count (law 11)
const CP_NEXTLINE = [[": `Fragment check: no partial name of a listed name found. The check reads ${FRAG_HOW}.`,", ": `Fragment check: no partial name of a listed name found. The check reads ${FRAG_HOW}.`,\n    ...(frags.length ? [`(${frags.join(', ')})`] : []),"]];
// the engine's overlap rule as it was: a shorter row that meets a longer one places nothing (law 13)
const OLD_OVERLAP = [['if (!over.length) { claimed.push({ s, e, tag: row.tag }); continue; }', 'if (!over.length) { claimed.push({ s, e, tag: row.tag }); continue; } continue;']];
// the engine without the cut: a declared term glued to a number the pattern takes never places,
// so its press lifts nothing — the one stuck hold known (law 14, and protected-terms law 25)
const NO_CUT = [['row.tol ? protectedSpans(text, row.span, cuts)', 'row.tol ? protectedSpans(text, row.span)']];
// the way through as it was: every held term sent to the held row's one button (law 14)
const OLD_WAY = [['const stuck = plan.holds.map((h) => h.term).filter((t) => plan.stuck.includes(t));', 'const stuck: string[] = [];']];
// the clipboard without Export's verification (law 15), and Export's verification as it was:
// the export's words alone, each row asked whole (protected-terms law 24 holds the same line)
const CP_NO_VERIFIED = [['  if (!plan.verified) {', '  if (false) {']];
const WHOLE_ONLY_VERIFY = [['rowSurvives(readable, e) || (!isFloorRow(e) && runHit.has(e.text)) || (!rm.divergence && !isFloorRow(e) && rowSpans(text, e, cuts).some(([s, t]) => coverage(text, s, t, cut).open))', 'rowSurvives(readable, e)']];
// every held term named bare, "in part" or not (law 17)
const CP_NO_PART = [['const said = plan.holds.map((h) => (h.partly ? `${h.term} (in part)` : h.term));', 'const said = plan.holds.map((h) => h.term);']];
// the engine taking a glued edge only where the safety-net match ends at it (law 16)
const EDGE_CUT_ONLY = [['const freed = (c: FloorCuts, i: number) => c.has(i) || c.inside(i);', 'const freed = (c: FloorCuts, i: number) => c.has(i);']];
// the engine without the run-together rule (protected-terms law 34): a glued name the guarded
// edge refuses is then placed nowhere, which is what law 16's CONTROL needs to show — and the
// list read as words alone, as it was before the rule (protected-terms LIST_WORDS_ONLY)
const LIST_WORDS_ONLY = [
  ['const runs = runAt(text, terms.map((t) => t.trim()));', 'const runs = new Map<string, Array<[number, number]>>();'],
  ['const runRead = byNameOf(runReadings(exported, wantNames, left, true, leftUnderList));', 'const runRead = new Map<string, Array<[number, number]>>();'],
  ['const runBare = o ? byNameOf(runsThrough(', 'const runBare = false ? byNameOf(runsThrough('],
];
const NO_RUN = [
  ['const names = runNames([...bySpan.keys()]);', 'const names: RefName[] = [];'],
  ['(!isFloorRow(e) && runHit.has(e.text)) || ', ''],
  ...LIST_WORDS_ONLY,
];
// a row read run together only where its claims left the text, and no verification of one over
// the original (protected-terms law 36)
const NO_THROUGH = [['    const through = runsThrough(text, names, ', '    const through: RefFind[] = [] || runsThrough(text, names, ']];
const NO_RUN_OPEN = [['  if (!rm.divergence) for (const t of runOpen(', '  if (false) for (const t of runOpen(']];

// the engine bundle touches window/localStorage on import (tauri.ts inTauri, the settings)
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { maskSide, copyHeld, redactedChanges, compare, pickerLabels, FINISH_LABEL, withProtectedTerms, rowSurvives, exportPlan, syncFloorRows, loadPractice } = await import('file:///' + bundle.replace(/\\/g, '/'));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FINISH = new RegExp(esc(FINISH_LABEL));

let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) fails++; };

const V1 = 'This Agreement is made between Alice Harwood and Brightline Ltd.\n\nThe term is two years.';
const V2 = 'This Agreement is made between Alice Harwood and Brightline Ltd.\n\nThe term is three years.';
const row = (text, tag, cat) => ({ key: text, text, tag, cat, prov: 'both passes', occ: 1, status: 'confirmed', cls: cat === 'person' ? 'PERSON' : 'COMPANY' });
const rows = () => [row('Alice Harwood', '[Person1]', 'person'), row('Brightline Ltd', '[Company1]', 'org')];
const file = (id, text, over = {}) => ({
  id, name: 'Agreement.docx', badge: 'DOCX', state: 'ready', sizeLabel: '1 KB', statusLabel: '',
  text, entities: rows(), reviewed: true, engineComplete: true, ...over,
});

// ── 3: every gate, in order, still holds — each with a way through ─────────────────
const gates = [
  ['no entity table', { entities: undefined }, /no entity table/, /Drop the file in again/],
  ['being redacted', { state: 'stripping' }, /being redacted right now/, /Wait for the run to finish/],
  ['waiting in the queue', { state: 'queued' }, /waiting in the queue/, /Wait for its turn/],
  ['not reviewed', { reviewed: false }, /has not been reviewed/, FINISH],
  ['engine run unfinished', { engineComplete: false }, /did not finish/, /re-run the engine/],
  // an in-app core step whose model calls failed: a new run makes those calls again
  ['in-app core step unfinished', { engineComplete: false, completeBy: { span: true, rails: true, residue: false, suspicion: true } }, /did not finish.*pass 2 \(the re-read of the redacted copy\) did not finish/, /re-run the engine/],
  // LAUNCH.md 4.11: the frozen pipeline's tags did not align. It reads the same text the same
  // way, so "drop the file in again" sent the lawyer round a loop; the way says so instead
  ['frozen pipeline alignment failed', { engineComplete: false, completeBy: { pipeline: true, align: false } }, /did not finish.*differs from the document somewhere other than at a tag/, /not expected to change this.*no other way through/],
  ['every row switched off', { entities: rows().map((e) => ({ ...e, dead: true })) }, /every row on its table switched off/, /Ignored filter, and press “Redact again”/],
  // App.tsx addFiles' catch: 'held' with the queued file's text and empty table kept
  ['held on Drop after the run stopped', { state: 'held', entities: [], reviewed: undefined, engineComplete: undefined, reason: 'Held — the redaction run stopped: boom. Drop the file again to retry it.' }, /is held on Drop.*the redaction run stopped: boom/, /Drop the file in again/],
  ['error on Drop', { state: 'error', reason: 'Couldn’t read this file: bad zip' }, /is held on Drop/, /Drop the file in again/],
];
for (const [what, over, why, way] of gates) {
  const s = maskSide(file('g', V1, over));
  check(s.held !== null && why.test(s.held), `gate "${what}" holds, with its reason`);
  check(typeof s.way === 'string' && way.test(s.way), `gate "${what}" names its way through`);
}
{
  const aligned = maskSide(file('al', V1, { engineComplete: false, completeBy: { pipeline: true, align: false } }));
  check(!/Drop the file in again|re-run the engine/.test(aligned.way ?? ''), 'after an alignment failure the way does not send the lawyer to drop the file again (LAUNCH.md 4.11)');
  check(/re-run the engine/.test('Drop the file in again to re-run the engine, review the new copy, and pick that copy here.'),
    'CONTROL: the way every unfinished run was given before matches that detector');
}
const stopped = maskSide(file('h', V1, { state: 'held', entities: [], reviewed: undefined, reason: 'Held — the redaction run stopped: boom. Drop the file again to retry it.' }));
check(!/Review, decide every row|has not been reviewed/.test(`${stopped.held} ${stopped.way}`), 'a file held on Drop is not sent to Review, which it cannot reach from there');
check(!/Confirm the names|confirm the names/.test(maskSide(file('g', V1, { entities: rows().map((e) => ({ ...e, dead: true })) })).way ?? ''), 'the Ignored-rows way names the button that is on screen, not "confirm"');
const clean = maskSide(file('c', V1));
check(clean.held === null && clean.way === null && clean.spans.length > 0, 'a reviewed, complete file with live rows is not held and is masked');
check(maskSide(file('s', V1, { sample: true, reviewed: false })).held === null, 'the sample is exempt from the review gate, as before');

// ── 1 + 2: same name, different files, different reasons ─────────────────────────
const a = maskSide(file('1', V1, { reviewed: false }));
const b = maskSide(file('2', V2, { state: 'queued' }));
const both = copyHeld(a, b);
check(both !== null && /has not been reviewed/.test(both) && /waiting in the queue/.test(both), 'two same-named files held for different reasons: BOTH reasons are printed');
check(/The earlier version, Agreement\.docx, has not been reviewed/.test(both), 'the earlier side is named in the pickers\' words, with its file name');
check(/The later version, Agreement\.docx, has not been redacted yet/.test(both), 'the later side is named in the pickers\' words, with its file name');
check(FINISH.test(both) && /Wait for its turn/.test(both), 'each held side carries its own way through');

// CONTROL: the name-keyed de-duplication this replaced. It must lose the second reason,
// or the check above proves nothing.
const byName = (x, y) => [x.held ? `${x.name} ${x.held}` : '', y.held && !(x.held && x.name === y.name) ? `${y.name} ${y.held}` : ''].filter(Boolean).join(' · ');
check(!/waiting in the queue/.test(byName(a, b)), 'CONTROL: keyed on the name, the later side\'s reason is lost — the check above has teeth');

const onlyLater = copyHeld(maskSide(file('1', V1)), b);
check(onlyLater !== null && !/earlier version/.test(onlyLater) && /The later version/.test(onlyLater), 'only the later side held: only the later side is named');
check(copyHeld(clean, maskSide(file('d', V2))) === null, 'neither side held: no refusal');

const same = maskSide(file('1', V1, { reviewed: false }));
const once = copyHeld(same, same);
check(once !== null && /^The file in both pickers, Agreement\.docx, has not been reviewed/.test(once) && once.split('has not been reviewed').length === 2, 'the same file in both pickers is refused once, not twice');

// ── 4: a refusal copies nothing ───────────────────────────────────────────────────
const report = compare(V1, V2);
const refused = redactedChanges(a, b, report);
check(refused.text === null, 'a held pair puts nothing on the clipboard');
check(/^Nothing was copied\. The earlier version, Agreement\.docx/.test(refused.refusal ?? '') && /The later version, Agreement\.docx/.test(refused.refusal ?? ''), 'the refusal names both sides');
check(!/Alice Harwood|Brightline/.test(refused.refusal ?? ''), 'the refusal carries no document text');

const ok = redactedChanges(clean, maskSide(file('d', V2)), report);
check(typeof ok.text === 'string' && ok.refusal === null && !/Alice Harwood|Brightline Ltd/.test(ok.text), 'a clean pair still copies, masked');

// ── 6: the ordinal counts Drop's rows ─────────────────────────────────────────────
const failed = { id: 'x', name: 'Agreement.docx', badge: 'DOCX', state: 'error', sizeLabel: '', statusLabel: 'Held', reason: 'Couldn’t read this file' };
const d1 = file('1', V1, { meta: '12 words · 3 parts' });
const d2 = file('2', V2, { meta: '12 words · 3 parts' });
const lab = pickerLabels([failed, d1, d2], [d1, d2]);
check(/2 of 3 by this name on Drop/.test(lab.get('1') ?? '') && /3 of 3 by this name on Drop/.test(lab.get('2') ?? ''), 'with a failed read of the same name first on Drop, the drafts are labelled 2 of 3 and 3 of 3');
const solo = pickerLabels([file('9', V1, { name: 'Lease.txt' }), d1], [file('9', V1, { name: 'Lease.txt' }), d1]);
check(solo.get('9') === 'Lease.txt' && solo.get('1') === 'Agreement.docx', 'a name Drop lists once prints as itself');

// ── 7: the always-redact list holds the clipboard ─────────────────────────────────
const LIST = 'simpler-legal.protected-terms';
const K1 = 'This Agreement is made between Alice Harwood and Brightline Ltd.\n\nKestrel pays two million.';
const K2 = 'This Agreement is made between Alice Harwood and Brightline Ltd.\n\nKestrel pays three million.';
const kReport = compare(K1, K2);
store.set(LIST, JSON.stringify(['Kestrel'])); // declared after both drafts were read: no row for it
const k1 = maskSide(file('k1', K1));
const k2 = maskSide(file('k2', K2));
check(k1.held !== null && /always-redact list/.test(k1.held) && /Kestrel/.test(k1.held) && /Export holds this document/.test(k1.held ?? ''),
  'a term on the list with no row holds the side, read from the list as saved', String(k1.held));
check(/press Export on its row/.test(k1.way ?? '') && /masks the term in this document/.test(k1.way ?? ''), 'the way through names the road: Drop\'s Export button, then the held row\'s button', String(k1.way));
const kRefused = redactedChanges(k1, k2, kReport);
check(kRefused.text === null && /always-redact list/.test(kRefused.refusal ?? ''), 'the pair puts nothing on the clipboard', String(kRefused.refusal).slice(0, 160));
store.set(LIST, JSON.stringify([]));
const kLeak = redactedChanges(maskSide(file('k1', K1)), maskSide(file('k2', K2)), kReport);
check(typeof kLeak.text === 'string' && /Kestrel pays/.test(kLeak.text),
  'CONTROL: with the term off the list the same pair copies with "Kestrel" readable — the leak the hold stands in front of', (kLeak.text ?? '').split('\n').filter((l) => /Kestrel/.test(l)).join(' / '));
const masked = (id, text) => file(id, text, { entities: withProtectedTerms(text, rows(), ['Kestrel']) });
const kFixed = redactedChanges(maskSide(masked('k1', K1), ['Kestrel']), maskSide(masked('k2', K2), ['Kestrel']), kReport);
check(typeof kFixed.text === 'string' && !/Kestrel/.test(kFixed.text), 'once the held row\'s button has masked it, the pair copies with the term masked', String(kFixed.refusal));
const deadUnder = (id, text) => file(id, text, { entities: withProtectedTerms(text, rows(), ['Kestrel']).map((e) => (e.text === 'Kestrel' ? { ...e, dead: true, status: 'ignored' } : e)) });
check(maskSide(deadUnder('k1', K1), ['Kestrel']).held === null, 'a term left readable under Protected terms in the review is the lawyer\'s decision, and holds nothing here, as on Export');

// ── 8: the re-read asks a protected row with the match its mask used ─────────────
const O1 = 'Reply to O’Brien.\n\nTwo years.';
const O2 = 'Reply to O’Brien.\n\nThree years, per O\'Brien.';
const oReport = compare(O1, O2);
const oA = maskSide(file('o1', O1, { entities: [] }), []);
const oB = maskSide(file('o2', O2, { entities: [] }), []);
// a mask that missed the straight form, as a regression in placements() would
const missed = (cat) => ({ ...oB, spans: [], kept: [{ key: 'o', text: 'O’Brien', tag: '[Protected1]', cat, prov: 'pattern', occ: 1, status: 'confirmed' }] });
const oHeld = redactedChanges(oA, missed('protected'), oReport);
check(oHeld.text === null && /still readable/.test(oHeld.refusal ?? ''), 'a protected row left standing in its other form is caught by the re-read and the copy is held', String(oHeld.refusal).slice(0, 140));
const oFoot = redactedChanges(oA, missed('org'), oReport);
check(typeof oFoot.text === 'string' && /O'Brien/.test(oFoot.text), 'CONTROL: asked with the engine\'s footprint, as the re-read asked every row before, the same text copies', String(oFoot.refusal));
// The same survivor standing BEFORE a tag the mask did write. The paragraph above has no tag in
// it, so its whole text is the tail maskPara appends after its last placement; a re-read text
// built from the tail alone would pass it and never read what comes ahead of "[Person1]".
const O3 = 'Reply to O’Brien.\n\nThree years, per O\'Brien and Alice Harwood.';
const o3Report = compare(O1, O3);
const oB3 = maskSide(file('o3', O3), []);
const aheadOfTag = { ...oB3, kept: [...oB3.kept, { key: 'o', text: 'O’Brien', tag: '[Protected1]', cat: 'protected', prov: 'pattern', occ: 1, status: 'confirmed' }] };
const tagAt = oB3.spans.find((sp) => O3.slice(sp.s, sp.e) === 'Alice Harwood');
check(!!tagAt && O3.lastIndexOf('O\'Brien') < tagAt.s, 'the case is the one it names: the readable form stands ahead of a tag the mask wrote in the same paragraph', JSON.stringify(oB3.spans));
const o3Held = redactedChanges(oA, aheadOfTag, o3Report);
check(o3Held.text === null && /still readable[^]*O’Brien/.test(o3Held.refusal ?? ''), 'a protected row left standing ahead of a tag is caught by the re-read and the copy is held', String(o3Held.refusal).slice(0, 160));
const CG = await compareWith({ 'Compare.tsx': CP_GAP });
const gapOut = CG.redactedChanges(oA, aheadOfTag, o3Report);
check(typeof gapOut.text === 'string' && /per O'Brien and \[Person1\]/.test(gapOut.text),
  'CONTROL: with the gap before a tag left out of the re-read\'s text, the same pair COPIES with the name readable — the check above can fail', String(gapOut.refusal ?? (gapOut.text ?? '').split('\n').filter((l) => /O'Brien/.test(l)).join(' / ')));

// ── 9: the finish button, by its own label ─────────────────────────────────────────
const unreviewedWay = maskSide(file('u', V1, { reviewed: false })).way ?? '';
check(unreviewedWay.includes(`“${FINISH_LABEL}”`) && !/Confirm & finish review/.test(unreviewedWay), 'the review way quotes the label the Review screen puts on the button', unreviewedWay);
const reviewSrc = readFileSync(join(here, '..', 'src', 'screens', 'Review.tsx'), 'utf8');
check(/\bFINISH_LABEL\b/.test(reviewSrc.slice(reviewSrc.indexOf('return ('))), 'the Review screen renders FINISH_LABEL, so the way names a button that exists');
const compareSrc = readFileSync(join(here, '..', 'src', 'screens', 'Compare.tsx'), 'utf8');
check(!/Confirm &(?:amp;)? finish review/.test(compareSrc), 'Compare.tsx carries no copy of a finish label of its own');
check(/Confirm & finish review/.test("'Open it in Review, decide every row, and press “Confirm & finish review”.'") && FINISH_LABEL !== 'Confirm & finish review',
  'CONTROL: the line that was there trips that check, and the label it named is not the button\'s');

// ── 10: a finish a later change took off ──────────────────────────────────────────
// the note as lib/attest.ts reopenNote writes it; the Review screen shows the same words
const NOTE = 'Undoing “Leave visible” on Brightline Ltd left “Brightline Ltd” readable in the export, and it was masked when you finished. Export holds this document until you finish again.';
const reopenedOk = (s) => typeof s.held === 'string' && /^has changed since you finished its review — finish again\. /.test(s.held) && s.held.includes(NOTE.replace(/\.$/, ''))
  && !/has not been reviewed/.test(s.held) && typeof s.way === 'string' && s.way.includes(`“${FINISH_LABEL}”`);
const reo = maskSide(file('r', V1, { reviewed: false, reopened: NOTE }));
check(reopenedOk(reo), 'a finish that came off holds the side as changed since you finished, with what changed, and names the finish button', `${reo.held} | ${reo.way}`);
const reoSaid = copyHeld(reo, clean) ?? '';
check(reoSaid.startsWith('The earlier version, Agreement.docx, has changed since you finished its review — finish again. Undoing') && /until you finish again\. Open it in Review, where the same note stands at the top/.test(reoSaid),
  'the refusal reads as sentences: side, what changed, the way through', reoSaid);
check(redactedChanges(reo, clean, report).text === null, 'and the pair puts nothing on the clipboard — the note names text the comparison on screen already shows, and goes nowhere else');
check(!reopenedOk(maskSide(file('r', V1, { reviewed: false }))), 'CONTROL: the hold a finish that came off got until now ("has not been reviewed") fails that check');

// ── 11: a partial name is counted on the clipboard, never named ───────────────────
// The payload is pasted into a model. "partial name … — Hastings" at its top told the model
// that the readable "Hastings" below is part of a name the copy masks, with the paragraph
// that carries [Company1] not even on the clipboard.
const rowH = () => [row('Hastings Holdings Ltd', '[Company1]', 'org')];
const H1 = 'Hastings Holdings Ltd agreed the price.\n\nThe deed was signed for Hastings on Monday.';
const H2 = 'Hastings Holdings Ltd agreed the price.\n\nThe deed was signed for Hastings on Tuesday.';
store.set(LIST, JSON.stringify([]));
const hOut = redactedChanges(maskSide(file('h1', H1, { entities: rowH() })), maskSide(file('h2', H2, { entities: rowH() })), compare(H1, H2));
const NAMED = /partial name[^\n]*Hastings|Hastings[^\n]*partial name/;
check(typeof hOut.text === 'string' && /^Fragment check: 1 partial name of listed names may be readable below — not named here/m.test(hOut.text) && !NAMED.test(hOut.text)
  && hOut.frags === 1 && hOut.fragWords.join() === 'Hastings',
  'the copy counts the partial name and does not name it; the screen is handed the piece to name', `${(hOut.text ?? '').split('\n').find((l) => /^Fragment check/.test(l))} | ${JSON.stringify(hOut.fragWords)}`);
check(/fragWords\.join\(/.test(compareSrc) && !/the copy names/.test(compareSrc),
  'the note after a copy names the pieces on this screen, and does not say the copy names them');
check(NAMED.test('Fragment check: 1 partial name of listed names is still readable below — Hastings — because the tables list the longer span. Read those lines once before you paste them.'),
  'CONTROL: the line the copy carried before trips that check');
// NAMED reads one line. The piece printed on the line after the count tells the model the same
// thing, so every line of the payload that is not document text ("+ " / "- ") is read word by
// word for any word of any piece the screen is handed.
const WORD = /[^\p{L}\p{N}’']+/u;
const namedIn = (out) => {
  const said = new Set((out.text ?? '').split('\n').filter((l) => !/^[+-] /.test(l)).flatMap((l) => l.split(WORD)).filter(Boolean).map((w) => w.toLowerCase()));
  return out.fragWords.flatMap((f) => f.split(WORD)).filter((w) => w && said.has(w.toLowerCase()));
};
check(hOut.fragWords.length > 0 && namedIn(hOut).length === 0, 'no line of the copy but the document\'s own carries a word of a piece, on the count\'s line or any other', JSON.stringify(namedIn(hOut)));
const NL = await compareWith({ 'Compare.tsx': CP_NEXTLINE });
const nlOut = NL.redactedChanges(NL.maskSide(file('h1', H1, { entities: rowH() })), NL.maskSide(file('h2', H2, { entities: rowH() })), NL.compare(H1, H2));
check(namedIn(nlOut).join() === 'Hastings' && !NAMED.test(nlOut.text ?? ''),
  'CONTROL: with the pieces printed on the line after the count, the word scan names "Hastings" and the one-line pattern does not — the scan is the check that has teeth', (nlOut.text ?? '').split('\n').filter((l) => /^Fragment check|^\(/.test(l)).join(' / '));

// ── 12: a tag the mask wrote is not a name left readable ──────────────────────────
// A protected row "Card" was re-read in the "[card]" the safety-net pattern wrote for the card
// number: the copy was held as "still readable — Card", with every occurrence masked.
const C1 = 'This Agreement is made between Alice Harwood and Brightline Ltd.\n\nMr Card paid 4111 1111 1111 1111 on 3 May.';
const C2 = 'This Agreement is made between Alice Harwood and Brightline Ltd.\n\nMr Card paid 4111 1111 1111 1111 on 4 May.';
store.set(LIST, JSON.stringify(['Card']));
const cardEnts = (text) => withProtectedTerms(text, rows(), ['Card']);
const cOut = redactedChanges(maskSide(file('c1', C1, { entities: cardEnts(C1) }), ['Card']), maskSide(file('c2', C2, { entities: cardEnts(C2) }), ['Card']), compare(C1, C2));
const cBody = (cOut.text ?? '').split('\n').filter((l) => /^[+-] /.test(l)).join('\n');
check(typeof cOut.text === 'string' && cOut.refusal === null && /\[card\]/.test(cBody) && !/\bCard\b/.test(cBody.replace(/\[card\]/g, '')),
  'a declared "Card" beside the [card] the mask wrote: the pair copies, with the name and the number masked', String(cOut.refusal ?? cBody));
check(cOut.frags === 0 && cOut.fragWords.length === 0 && /^Fragment check: no partial name of a listed name found\./m.test(cOut.text ?? ''),
  'and the fragment count reads the same words: no piece of a listed name is counted in "[card]"', `${cOut.frags} ${JSON.stringify(cOut.fragWords)}`);
const cardRow = cardEnts(C1).find((e) => e.text === 'Card');
check(!!cardRow && rowSurvives(cBody, cardRow),
  'CONTROL: re-read out of the copied bytes, as it was, the row "Card" survives in "[card]" and the copy is held');
store.set(LIST, JSON.stringify([]));

// ── 13: the overlap rule reaches the clipboard ────────────────────────────────────
// "Mrs Margaret Tan" and "Tan Wei Ling" meet in "Mrs Margaret Tan Wei Ling". The longer row
// claimed its span and the shorter row placed nothing, so "Wei Ling" went onto the clipboard
// readable, and the re-read passed it: the footprint of "Tan Wei Ling" is not in "Wei Ling".
const P1 = 'Mrs Margaret Tan Wei Ling attended on Monday. Tan Wei Ling signed.';
const P2 = 'Mrs Margaret Tan Wei Ling attended on Tuesday. Tan Wei Ling signed.';
const tanRows = () => [row('Mrs Margaret Tan', '[Person1]', 'person'), row('Tan Wei Ling', '[Person2]', 'person')];
const pOut = redactedChanges(maskSide(file('p1', P1, { entities: tanRows() }), []), maskSide(file('p2', P2, { entities: tanRows() }), []), compare(P1, P2));
const pAfter = (pOut.text ?? '').split('\n').find((l) => l.startsWith('+ ')) ?? '';
const pTxt = exportPlan({ text: P2, entities: tanRows(), reviewed: true, engineComplete: true, kind: 'text' }, [], loadPractice()).red;
check(pOut.refusal === null && pAfter === '+ [Person1] [Person2] attended on Tuesday. [Person2] signed.' && pAfter === `+ ${pTxt}`,
  'the copied paragraph is the export\'s .txt: the longer row\'s tag over its span, the remainder under the shorter row\'s tag, no word of either name readable', `${pAfter} | ${pTxt}`);
// the overlap rule as it was, with each later guard taken off too: law 15's hold and the
// verification it asks both catch the readable remainder now, so the CONTROL for this law
// removes all three to show what the rule alone let through
const OO = await compareWith({ 'engine.ts': [...OLD_OVERLAP, ...WHOLE_ONLY_VERIFY], 'Compare.tsx': CP_NO_VERIFIED });
const ooOut = OO.redactedChanges(OO.maskSide(file('p1', P1, { entities: tanRows() }), []), OO.maskSide(file('p2', P2, { entities: tanRows() }), []), OO.compare(P1, P2));
check(ooOut.refusal === null && /^\+ \[Person1\] Wei Ling attended/m.test(ooOut.text ?? ''),
  'CONTROL: under the overlap rule as it was, the same pair copies with "Wei Ling" readable — the check above can fail', (ooOut.text ?? '').split('\n').find((l) => l.startsWith('+ ')));

// ── 14: a way through names only a button the page offers ─────────────────────────
// Export offers a held term's button only where pressing it clears the hold (engine.ts
// pressLifts); where it would not, the held row says what the lawyer can do instead. No such
// term is known with today's engine, so the engine is taken back to one: without the cut (and
// without the run-together rule, protected-terms law 34, which places the glued name as well),
// "Tan" glued to a number the pattern takes is held, and pressing its button lifts nothing.
const GT = 'Call Tan61234567 today. Anna Tan signed.';
store.set(LIST, JSON.stringify(['Tan']));
const gSide = (M) => M.maskSide(file('g1', GT, { entities: M.syncFloorRows(GT, [row('Anna Tan', '[Person1]', 'person')], M.loadPractice()) }), ['Tan']);
const NC = await compareWith({ 'engine.ts': [...NO_CUT, ...NO_RUN] });
const stuckWay = gSide(NC).way ?? '';
check(/always-redact list/.test(gSide(NC).held ?? '') && /offers no button for it/.test(stuckWay) && /select the whole word it is written into and redact it/.test(stuckWay) && !/with one button/.test(stuckWay),
  'a term whose press would leave it readable: the way says Drop offers no button for it, and names what the lawyer can do instead', stuckWay);
const liveWay = gSide({ maskSide, syncFloorRows, loadPractice }).way ?? '';
check(/masks the term in this document with one button/.test(liveWay) && !/offers no button/.test(liveWay),
  'with today\'s engine the same term\'s press clears the hold, and the way names the held row\'s one button', liveWay);
const NCOld = await compareWith({ 'engine.ts': [...NO_CUT, ...NO_RUN], 'Compare.tsx': OLD_WAY });
const oldWay = gSide(NCOld).way ?? '';
check(/with one button/.test(oldWay) && !/offers no button/.test(oldWay),
  'CONTROL: with the way as it was, the same stuck term is sent to a button Export does not show — the check above can fail', oldWay);
store.set(LIST, JSON.stringify([]));

// ── 15: a document Export's verification holds is held here too ───────────────────
// Today's overlap rule masks the remainder, so the row readable in part is re-created with the
// overlap rule as it was. Export's verification catches it (it reads where "Tan Wei Ling"
// stands in the original and finds "Wei Ling" uncovered); the clipboard must say the same.
const VO = await compareWith({ 'engine.ts': OLD_OVERLAP });
const vPlan = VO.exportPlan({ text: P2, entities: tanRows(), reviewed: true, engineComplete: true, kind: 'text' }, [], VO.loadPractice());
const vSide = VO.maskSide(file('p2', P2, { entities: tanRows() }), []);
const vOut = VO.redactedChanges(VO.maskSide(file('p1', P1, { entities: tanRows() }), []), vSide, VO.compare(P1, P2));
check(!vPlan.verified && vPlan.survivors.map((e) => e.text).join() === 'Tan Wei Ling',
  'setup: with the overlap rule as it was, Export\'s verification holds the page — "Tan Wei Ling" stands readable in part', JSON.stringify(vPlan.survivors.map((e) => e.text)));
check(vOut.text === null && /a row you chose to redact still readable, whole or in part, in its redacted text — Tan Wei Ling — and Export holds this document for the same reason/.test(vOut.refusal ?? '')
  && /select the whole word it is written into and redact it; then pick the document here again\./.test(vSide.way ?? ''),
  'the clipboard refuses the same document, names the row, and gives the way through', `${vOut.refusal} | ${vSide.way}`);
const VN = await compareWith({ 'engine.ts': OLD_OVERLAP, 'Compare.tsx': CP_NO_VERIFIED });
const vnOut = VN.redactedChanges(VN.maskSide(file('p1', P1, { entities: tanRows() }), []), VN.maskSide(file('p2', P2, { entities: tanRows() }), []), VN.compare(P1, P2));
check(vnOut.refusal === null && /^\+ \[Person1\] Wei Ling attended/m.test(vnOut.text ?? ''),
  'CONTROL: without asking Export\'s verification, the clipboard\'s own re-read passes the same pair with "Wei Ling" readable — the check above can fail', (vnOut.text ?? '').split('\n').find((l) => l.startsWith('+ ')));

// ── 16: an address run into a name reaches the clipboard masked whole ──────────────
// The email rule's last label takes every letter after the dot, so "anna.tan@kestrel.comAnna Tan"
// is one match that ends inside the name. The engine took a glued edge only where the match
// ENDS at the name: the row placed nowhere and "[email] Tan" went onto the clipboard under a
// green verification (protected-terms law 28b holds the .txt, preview and .docx to the same).
const A1 = 'The fee is two.\n\nSigned on Monday: anna.tan@kestrel.comAnna Tan, partner.';
const A2 = 'The fee is two.\n\nSigned on Tuesday: anna.tan@kestrel.comAnna Tan, partner.';
const annaRows = () => [row('Anna Tan', '[Person1]', 'person')];
const aPair = (M) => M.redactedChanges(M.maskSide(file('a1', A1, { entities: M.syncFloorRows(A1, annaRows(), M.loadPractice()) }), []), M.maskSide(file('a2', A2, { entities: M.syncFloorRows(A2, annaRows(), M.loadPractice()) }), []), M.compare(A1, A2));
const aOut = aPair({ redactedChanges, maskSide, syncFloorRows, loadPractice, compare });
const aTxt = exportPlan({ text: A2, entities: syncFloorRows(A2, annaRows(), loadPractice()), reviewed: true, engineComplete: true, kind: 'text' }, [], loadPractice()).red;
check(aOut.refusal === null && !/\bTan\b/.test(aOut.text ?? '') && (aOut.text ?? '').includes('+ Signed on Tuesday: [email] [Person1], partner.') && aTxt.endsWith('Signed on Tuesday: [email] [Person1], partner.'),
  'an address run into a kept name: the clipboard carries the address\'s tag and the name\'s, as the .txt does, and no word of the name', (aOut.text ?? aOut.refusal ?? '').split('\n').filter((l) => /Signed/.test(l)).join(' / '));
const aWas = aPair(await compareWith({ 'engine.ts': [...EDGE_CUT_ONLY, ...NO_RUN] }));
check(aWas.refusal === null && (aWas.text ?? '').includes('+ Signed on Tuesday: [email] Tan, partner.'),
  'CONTROL: with a glued edge taken only where the match ends at the name, as it was, and without the run-together rule (protected-terms law 34), the same pair copies "Tan" readable — the check above can fail', (aWas.text ?? aWas.refusal ?? '').split('\n').filter((l) => /Signed/.test(l)).join(' / '));

// ── 17: a term readable in part is marked "(in part)", as Export marks it ──────────
// "Tan Wei Ling" listed after both drafts were read, over a kept "Mrs Margaret Tan": the kept
// name's tag covers "Tan" and "Wei Ling" is readable. The refusal named "Tan Wei Ling", a name
// the lawyer searches the redacted text for and finds nowhere.
const W1 = 'Mrs Margaret Tan Wei Ling attended on Monday. Anna Tan signed.';
const W2 = 'Mrs Margaret Tan Wei Ling attended on Tuesday. Anna Tan signed.';
const wRows = () => [row('Mrs Margaret Tan', '[Person1]', 'person'), row('Anna Tan', '[Person2]', 'person')];
store.set(LIST, JSON.stringify(['Tan Wei Ling']));
const wHeld = (M) => M.maskSide(file('w2', W2, { entities: M.syncFloorRows(W2, wRows(), M.loadPractice()) }), ['Tan Wei Ling']).held ?? '';
const wNow = wHeld({ maskSide, syncFloorRows, loadPractice });
const wPlan = exportPlan({ text: W2, entities: syncFloorRows(W2, wRows(), loadPractice()), reviewed: true, engineComplete: true, kind: 'text' }, ['Tan Wei Ling'], loadPractice());
check(wPlan.holds.length === 1 && wPlan.holds[0].partly && /always-redact list still readable in its redacted text — Tan Wei Ling \(in part\) — and Export holds/.test(wNow)
  && !/\(in part\)/.test(k1.held ?? ''),
  'a listed term readable only in part is marked "(in part)" in the refusal, and a term readable whole is not');
const wWas = wHeld(await compareWith({ 'Compare.tsx': CP_NO_PART }));
check(/— Tan Wei Ling — and Export holds/.test(wWas),
  'CONTROL: with every held term named bare, as it was, the refusal names "Tan Wei Ling" with nothing to say only part of it is readable — the check above can fail');
store.set(LIST, JSON.stringify([]));

// ── 18: a kept name run together reaches the clipboard masked, as the .txt masks it ─────────
// A row's match starts and stops at a word's edge, so "KestrelCapital" and "kestrelcapital.com"
// beside a kept "Kestrel Capital" went onto the clipboard readable under a green verification,
// while the saved .docx masked both (protected-terms law 34 holds the .txt, the Review preview
// and the .docx to the same).
const R1 = 'The fee is two.\n\nPaid to KestrelCapital (kestrelcapital.com) on Monday.';
const R2 = 'The fee is two.\n\nPaid to KestrelCapital (kestrelcapital.com) on Tuesday.';
const kcRows = () => [row('Kestrel Capital', '[Company1]', 'org')];
const rPair = (M) => M.redactedChanges(M.maskSide(file('r1', R1, { entities: M.syncFloorRows(R1, kcRows(), M.loadPractice()) }), []), M.maskSide(file('r2', R2, { entities: M.syncFloorRows(R2, kcRows(), M.loadPractice()) }), []), M.compare(R1, R2));
const rOut = rPair({ redactedChanges, maskSide, syncFloorRows, loadPractice, compare });
const rTxt = exportPlan({ text: R2, entities: syncFloorRows(R2, kcRows(), loadPractice()), reviewed: true, engineComplete: true, kind: 'text' }, [], loadPractice()).red;
check(rOut.refusal === null && !/kestrel|capital/i.test(rOut.text ?? '') && (rOut.text ?? '').includes('+ Paid to [Company1] ([Company1].com) on Tuesday.') && rTxt.endsWith('Paid to [Company1] ([Company1].com) on Tuesday.'),
  'a kept name run together, capital first and lower case: the clipboard masks both under the row\'s tag, as the .txt does', (rOut.text ?? rOut.refusal ?? '').split('\n').filter((l) => /Paid/.test(l)).join(' / '));
const rWas = rPair(await compareWith({ 'engine.ts': NO_RUN }));
check(rWas.refusal === null && (rWas.text ?? '').includes('+ Paid to KestrelCapital (kestrelcapital.com) on Tuesday.'),
  'CONTROL: without the run-together rule, the same pair copies both readable, with nothing refused — the check above can fail', (rWas.text ?? rWas.refusal ?? '').split('\n').filter((l) => /Paid/.test(l)).join(' / '));

// ── 19: a name run together behind a shorter claim, and a listed term written only run together ──
// A kept "Wei Ling Tan" in "Mr Wei Ling Tan12": its two-word prefix placed and walled the
// run-together rule off the rest, and "[Person1] Tan12" was copied under a green verification; a
// kept "Anna" did the same to a kept "Anna Tan" in "Ms Anna Tan12". A term the body writes only
// run together ("KestrelCapital-Escrow"), listed after both drafts were read, was asked as words,
// found nowhere, and copied readable (protected-terms laws 35 and 36 hold the .txt, the preview
// and the .docx to the same).
const G1 = 'The fee is two.\n\nMr Wei Ling Tan12 and Ms Anna Tan12 signed on Monday.';
const G2 = 'The fee is two.\n\nMr Wei Ling Tan12 and Ms Anna Tan12 signed on Tuesday.';
const gRows = () => [row('Wei Ling Tan', '[Person1]', 'person'), row('Anna Tan', '[Person2]', 'person'), row('Anna', '[Person3]', 'person')];
const gPair = (M) => M.redactedChanges(M.maskSide(file('g1', G1, { entities: M.syncFloorRows(G1, gRows(), M.loadPractice()) }), []), M.maskSide(file('g2', G2, { entities: M.syncFloorRows(G2, gRows(), M.loadPractice()) }), []), M.compare(G1, G2));
const gLine = (o) => (o.text ?? o.refusal ?? '').split('\n').filter((l) => /signed|Wei Ling|Anna/.test(l)).join(' / ');
const gOut = gPair({ redactedChanges, maskSide, syncFloorRows, loadPractice, compare });
const gTxt = exportPlan({ text: G2, entities: syncFloorRows(G2, gRows(), loadPractice()), reviewed: true, engineComplete: true, kind: 'text' }, [], loadPractice()).red;
check(gOut.refusal === null && !/\bTan|Ling|Anna\b/.test(gOut.text ?? '') && (gOut.text ?? '').includes('+ Mr [Person1]12 and Ms [Person2]12 signed on Tuesday.') && gTxt.endsWith('Mr [Person1]12 and Ms [Person2]12 signed on Tuesday.'),
  'a kept name run together behind its own prefix or a shorter kept row: the clipboard masks it whole under its tag, as the .txt does', gLine(gOut));
const gHeld = gPair(await compareWith({ 'engine.ts': NO_THROUGH }));
check(gHeld.text === null && /Wei Ling Tan/.test(gHeld.refusal ?? '') && /Anna Tan/.test(gHeld.refusal ?? ''),
  'CONTROL: with the name read run together only where its claims left the text, Export\'s verification holds and so does the clipboard, naming both rows', gLine(gHeld));
const gWas = gPair(await compareWith({ 'engine.ts': [...NO_THROUGH, ...NO_RUN_OPEN] }));
check(gWas.refusal === null && (gWas.text ?? '').includes('+ Mr [Person1] Tan12 and Ms [Person3] Tan12 signed on Tuesday.'),
  'CONTROL: and with that verification taken back too, "Tan12" is copied twice under nothing refused — the checks above can fail', gLine(gWas));
const E1 = 'The fee is two.\n\nWire to KestrelCapital-Escrow on Monday.';
const E2 = 'The fee is two.\n\nWire to KestrelCapital-Escrow on Tuesday.';
store.set(LIST, JSON.stringify(['Kestrel Capital']));
const ePair = (M) => M.redactedChanges(M.maskSide(file('e1', E1, { entities: [] }), ['Kestrel Capital']), M.maskSide(file('e2', E2, { entities: [] }), ['Kestrel Capital']), M.compare(E1, E2));
const eOut = ePair({ redactedChanges, maskSide, compare });
check(eOut.text === null && /always-redact list still readable in its redacted text — Kestrel Capital — and Export holds/.test(eOut.refusal ?? ''),
  'a listed term the body writes only run together, listed after both drafts were read, holds the clipboard and is named', eOut.refusal ?? '');
const eWas = ePair(await compareWith({ 'engine.ts': LIST_WORDS_ONLY }));
check(eWas.refusal === null && (eWas.text ?? '').includes('+ Wire to KestrelCapital-Escrow on Tuesday.'),
  'CONTROL: with the list asked as words alone, as it was, the term is copied readable with nothing refused — the check above can fail', eWas.text ?? eWas.refusal ?? '');
store.set(LIST, JSON.stringify([]));

// ── 20: a name run past a shorter row the lawyer left readable ─────────────────────────────
// Every place a row left readable stood was a wall to the run-together reading, so a kept "Anna
// Tan" in "Ms Anna Tan12" beside a left-readable "Anna" was copied "Ms Anna Tan12" under a green
// verification, and "Anna Tan" listed after both drafts were read was copied the same with
// nothing refused, while the saved .docx masked it (protected-terms law 39 holds the .txt, the
// preview and the .docx to the same). A find is now dropped only where it lies wholly inside such
// a place and is that row's own name (law 22 here, protected-terms law 41).
const LEFT_AS_WALLS = [
  ['const blank = walled(text, walls);', 'const blank = walled(text, [...walls, ...deadAt]);'],
  ['    const through = runsThrough(text, names, held,', '    const through = runsThrough(walled(text, [...deadAt]), names, held,'],
  // the export's words read with no place governing went out unfiltered; as walls, every place
  // walled them (listHolds reads with leftUnderList, so there only the list's rows govern)
  ['  if (!dz.some((p) => p[2])) return refFind(r, names, \'text\', false, map);\n', ''],
  ['  return refFind(r, names, \'text\', false, true).filter((f) => !inLeft(dz, f, own.get(f.name) ?? []));', '  return refFind(walled(r, [...dz]), names, \'text\', false, map);'],
  ['  return new Set(runsThrough(text, names, cut,', '  return new Set(runsThrough(walled(text, [...dz]), names, cut,'],
  ['const runBare = o ? byNameOf(runsThrough(o.text, runNames(want), cut,', 'const runBare = o ? byNameOf(runsThrough(walled(o.text, [...leftAt]), runNames(want), cut,'],
];
const leftAnna = () => ({ ...row('Anna', '[Person2]', 'person'), dead: true, status: 'ignored' });
const L1 = 'The fee is two.\n\nMs Anna Tan12 stated on Monday. Anna agreed.';
const L2 = 'The fee is two.\n\nMs Anna Tan12 stated on Tuesday. Anna agreed.';
const lLine = (o) => (o.text ?? o.refusal ?? '').split('\n').filter((l) => /stated|Anna/.test(l)).join(' / ');
const lPair = (M, rowsOf, terms) => M.redactedChanges(M.maskSide(file('l1', L1, { entities: M.syncFloorRows(L1, rowsOf(M, L1), M.loadPractice()) }), terms), M.maskSide(file('l2', L2, { entities: M.syncFloorRows(L2, rowsOf(M, L2), M.loadPractice()) }), terms), M.compare(L1, L2));
const LIVE = { redactedChanges, maskSide, syncFloorRows, loadPractice, compare, withProtectedTerms };
const WALLS = await compareWith({ 'engine.ts': LEFT_AS_WALLS });
const keptRows = () => [row('Anna Tan', '[Person1]', 'person'), leftAnna()];
const lKept = lPair(LIVE, keptRows, []);
const lTxt = exportPlan({ text: L2, entities: syncFloorRows(L2, keptRows(), loadPractice()), reviewed: true, engineComplete: true, kind: 'text' }, [], loadPractice()).red;
check(lKept.refusal === null && (lKept.text ?? '').includes('+ Ms [Person1]12 stated on Tuesday. Anna agreed.') && lTxt.endsWith('Ms [Person1]12 stated on Tuesday. Anna agreed.'),
  'a kept name run past a shorter row left readable: the clipboard masks it whole and leaves the shorter row as the lawyer left it, as the .txt does', lLine(lKept));
const lKeptWas = lPair(WALLS, keptRows, []);
check(lKeptWas.refusal === null && (lKeptWas.text ?? '').includes('+ Ms Anna Tan12 stated on Tuesday. Anna agreed.'),
  'CONTROL: with the places left readable as walls, as they were, "Anna Tan12" is copied with nothing refused — the check above can fail', lLine(lKeptWas));
// the same term declared before both drafts were read, and listed after
const JR = () => row('Jane Roe', '[Person3]', 'person');
store.set(LIST, JSON.stringify(['Anna Tan']));
const declaredRows = (M, T) => M.withProtectedTerms(T, [leftAnna(), JR()], ['Anna Tan'], M.loadPractice());
const lDecl = lPair(LIVE, declaredRows, ['Anna Tan']);
check(lDecl.refusal === null && /\+ Ms \[Protected\d+\]12 stated on Tuesday\. Anna agreed\./.test(lDecl.text ?? ''),
  'declared before the drop: the clipboard masks the term run past the row left readable', lLine(lDecl));
const lDeclWas = lPair(WALLS, declaredRows, ['Anna Tan']);
check(lDeclWas.refusal === null && (lDeclWas.text ?? '').includes('+ Ms Anna Tan12 stated on Tuesday. Anna agreed.'),
  'CONTROL: with the walls as they were, the declared term is copied readable with nothing refused — the check above can fail', lLine(lDeclWas));
const lateRows = () => [leftAnna(), JR()];
const lLate = lPair(LIVE, lateRows, ['Anna Tan']);
check(lLate.text === null && /always-redact list still readable in its redacted text — Anna Tan — and Export holds/.test(lLate.refusal ?? ''),
  'listed after both drafts were read: the clipboard is refused and names the term, as Export holds it', lLine(lLate));
const lLateWas = lPair(WALLS, lateRows, ['Anna Tan']);
check(lLateWas.refusal === null && (lLateWas.text ?? '').includes('+ Ms Anna Tan12 stated on Tuesday. Anna agreed.'),
  'CONTROL: with the walls as they were, the listed term is copied readable with nothing refused — the check above can fail', lLine(lLateWas));
store.set(LIST, JSON.stringify([]));

// ── 21: a name inside other characters, read as the writer reads it ────────────────────────
// Owner rulings 8, 9 and 10 (2026-09-24) changed how the .docx writer reads a name in text a
// reader sees, and the engine imports that reading. Before them a client number on the table
// was copied readable inside the IBAN, the wire and the DMS reference that carried it; a
// party's name was copied masked inside "Margaret Tang", "Wong Wei Ming" and "supporter"; and a
// client's name written with %20 in a pasted SharePoint link was copied readable
// (protected-terms law 40 holds the .txt, the preview and the .docx to the same). Each CONTROL
// changes the writer's reading in the copy of docxWrite.ts the engine bundles.
const DIGITS_NOT_LOOSE = [["const loose = (n: RefName) => n.c.length >= RUN_FLOOR && (/\\p{L}/u.test(n.c) || /^\\p{N}+$/u.test(n.c));", "const loose = (n: RefName) => n.c.length >= RUN_FLOOR && /\\p{L}/u.test(n.c);"]];
const INSIDE_PROSE = [
  ['  if (!k.cuts.has(at) && !(loose && k.np[at])) return false;', '  if (!k.cuts.has(at) && !loose) return false;'],
  ['  if (k.cuts.has(e) || (loose && k.np[e - 1])) return true;', '  if (k.cuts.has(e) || loose) return true;'],
];
const PCT_AS_WRITTEN = [["const runs = f.includes('%') ? pctRuns(f) : [];", 'const runs: never[] = [];']];
const WAS = {
  digits: ['a row of digits alone read inside no token, as before ruling 9', await compareWith({ 'docxWrite.ts': DIGITS_NOT_LOOSE })],
  prose: ['a row from six letters read anywhere inside a word, as before ruling 8', await compareWith({ 'docxWrite.ts': INSIDE_PROSE })],
  pct: ['a percent-escape read as written, as before ruling 10', await compareWith({ 'docxWrite.ts': PCT_AS_WRITTEN })],
};
const idRow = (text, tag) => ({ ...row(text, tag, 'id'), cls: 'ID' });
const SP = 'https://firm.sharepoint.com/sites/Clients/Shared%20Documents';
const nPair = (M, S, rowsOf, terms) => {
  const T1 = `The fee is two.\n\n${S} Signed on Monday.`, T2 = `The fee is two.\n\n${S} Signed on Tuesday.`;
  return M.redactedChanges(M.maskSide(file('n1', T1, { entities: M.syncFloorRows(T1, rowsOf(), M.loadPractice()) }), terms), M.maskSide(file('n2', T2, { entities: M.syncFloorRows(T2, rowsOf(), M.loadPractice()) }), terms), M.compare(T1, T2));
};
const nLine = (o) => (o.text ?? o.refusal ?? '').split('\n').filter((l) => /Tuesday/.test(l)).join(' / ');
const INSIDE = [
  ['a client number inside an IBAN', 'Pay into account 31926819 (IBAN GB29NWBK60161331926819) by Friday.', () => [idRow('31926819', '[ID1]')], 'Pay into account [ID1] (IBAN GB29NWBK601613[ID1]) by Friday.', 'digits', 'GB29NWBK60161331926819'],
  ['a client number inside a wire reference', 'Wire ref CHK0001234567890 for account 1234567890.', () => [idRow('1234567890', '[ID1]')], 'Wire ref CHK000[ID1] for account [ID1].', 'digits', 'CHK0001234567890'],
  ['a matter number inside a DMS number', 'Filed as DMS441790201, matter 4417902.', () => [idRow('4417902', '[ID1]')], 'Filed as DMS[ID1]01, matter [ID1].', 'digits', 'DMS441790201'],
  ['"Margaret Tang" beside a row "Margaret Tan"', 'Margaret Tang, not Margaret Tan, attended.', () => [row('Margaret Tan', '[Person1]', 'person')], 'Margaret Tang, not [Person1], attended.', 'prose', '[Person1]g'],
  ['"Wong Wei Ming" beside a row "Ong Wei Ming"', 'Wong Wei Ming gave evidence after Ong Wei Ming.', () => [row('Ong Wei Ming', '[Person1]', 'person')], 'Wong Wei Ming gave evidence after [Person1].', 'prose', 'W[Person1]'],
  ['"supporter" beside a row "Porter"', 'Mr Porter, a supporter, attended.', () => [row('Porter', '[Person1]', 'person')], 'Mr [Person1], a supporter, attended.', 'prose', 'sup[Person1]'],
  ['a client\'s name written with %20 in a SharePoint link', `Filed at ${SP}/Margaret%20Tan%20Matter/brief.docx today. Margaret Tan attended.`, () => [row('Margaret Tan', '[Person1]', 'person')], `Filed at ${SP}/[Person1]%20Matter/brief.docx today. [Person1] attended.`, 'pct', 'Margaret%20Tan'],
];
for (const [label, S, rowsOf, W, was, shows] of INSIDE) {
  const live = nPair(LIVE, S, rowsOf, []);
  const T2 = `The fee is two.\n\n${S} Signed on Tuesday.`;
  const txt = exportPlan({ text: T2, entities: syncFloorRows(T2, rowsOf(), loadPractice()), reviewed: true, engineComplete: true, kind: 'text' }, [], loadPractice()).red;
  check(live.refusal === null && (live.text ?? '').includes(`+ ${W} Signed on Tuesday.`) && txt.endsWith(`${W} Signed on Tuesday.`),
    `${label}: the clipboard copies what the .txt carries`, nLine(live));
  const [why, M] = WAS[was];
  const old = nPair(M, S, rowsOf, []);
  check(old.refusal === null && (old.text ?? '').includes(shows) && !(old.text ?? '').includes(`+ ${W} Signed on Tuesday.`),
    `CONTROL: with ${why}, the clipboard copies "${shows}" with nothing refused — the check above can fail`, nLine(old));
}
// listed after both drafts were read, with no row: refused and named, as Export holds it
for (const [label, S, term, was, shows] of [
  ['a client number inside an IBAN', 'Pay IBAN GB29NWBK60161331926819 now. Jane Roe agreed.', '31926819', 'digits', 'GB29NWBK60161331926819'],
  ['a client\'s name written with %20 in a link', `Link ${SP}/Margaret%20Tan%20Matter/x now. Jane Roe agreed.`, 'Margaret Tan', 'pct', 'Margaret%20Tan'],
]) {
  store.set(LIST, JSON.stringify([term]));
  const late = nPair(LIVE, S, () => [JR()], [term]);
  check(late.text === null && new RegExp(`always-redact list still readable in its redacted text — ${esc(term)} — and Export holds`).test(late.refusal ?? ''),
    `${label}, listed after both drafts were read: the clipboard is refused and names the term`, late.refusal ?? late.text ?? '');
  const [why, M] = WAS[was];
  const old = nPair(M, S, () => [JR()], [term]);
  check(old.refusal === null && (old.text ?? '').includes(shows),
    `CONTROL: with ${why}, the listed term is copied readable with nothing refused — the check above can fail`, nLine(old));
  store.set(LIST, JSON.stringify([]));
}

// ── 22: a place left readable hides only its own name; a name run into an address; an escape ─
// Three readings the clipboard shared with the .txt and not with the saved .docx (protected-terms
// law 41 holds the .txt, the preview and the .docx to one text): a kept "Kestrel Capital" inside
// a web address the lawyer left readable was copied readable, and listed late was copied with
// nothing refused (P1-F1); a kept "Kestrel Capital" run into "kestrel-capitalgroup.com" behind a
// kept "Kestrel" was copied "[Company2]-capitalgroup.com" (P1-F4); a kept "René Tan" beside
// "Ren%E9%20Tan" in a link was copied under a green re-read (P1-F5). Each CONTROL puts the one
// line back in the engine the clipboard bundles.
const OLD_CONTAINMENT = [
  ['  return at.some(([a, b, c]) => a <= f.s && f.e <= b && names.includes(c));', '  return at.some(([a, b]) => a <= f.s && f.e <= b);'],
  ["  const c = governs ? refCompact(d.text).c : '';", '  const c = refCompact(d.text).c;'],
];
const NO_PROBE = [['      np ??= nonProse(slice, names);\n      if (np.has(`${f.s}:${f.e}:${f.name}`)) out.push(g);\n', '']];
const NO_ESC = [["  if (!rm.divergence && hasEscape(readable)) {", '  if (false) {']];
const OC = await compareWith({ 'engine.ts': OLD_CONTAINMENT });
const leftUrl = () => ({ ...row('www.kestrelcapital.com', '[URL1]', 'id'), cls: 'URL', dead: true, status: 'ignored' });
const txtOf = (S, rowsOf, terms) => {
  const T2 = `The fee is two.\n\n${S} Signed on Tuesday.`;
  return exportPlan({ text: T2, entities: syncFloorRows(T2, rowsOf(), loadPractice()), reviewed: true, engineComplete: true, kind: 'text' }, terms, loadPractice()).red;
};
{
  const S = 'Visit www.kestrelcapital.com for the data room. Kestrel Capital signed.';
  const rowsOf = () => [leftUrl(), row('Kestrel Capital', '[Company1]', 'org')];
  const W = 'Visit www.[Company1].com for the data room. [Company1] signed.';
  const live = nPair(LIVE, S, rowsOf, []);
  check(live.refusal === null && (live.text ?? '').includes(`+ ${W} Signed on Tuesday.`) && txtOf(S, rowsOf, []).endsWith(`${W} Signed on Tuesday.`),
    'a kept name inside a web address the lawyer left readable: the clipboard masks it, as the .txt and the .docx do', nLine(live));
  const was = nPair(OC, S, rowsOf, []);
  check(was.refusal === null && (was.text ?? '').includes('+ Visit www.kestrelcapital.com'),
    'CONTROL: with any find inside a place left readable dropped, as it was, the clipboard copies "www.kestrelcapital.com" with nothing refused — the check above can fail', nLine(was));
}
{
  const S = 'Visit www.kestrelcapital.com for the data room. Jane Roe signed.';
  const rowsOf = () => [leftUrl(), JR()];
  store.set(LIST, JSON.stringify(['Kestrel Capital']));
  const late = nPair(LIVE, S, rowsOf, ['Kestrel Capital']);
  check(late.text === null && /always-redact list still readable in its redacted text — Kestrel Capital — and Export holds/.test(late.refusal ?? ''),
    'listed after both drafts were read, written inside a web address left readable: the clipboard is refused and names the term, as Export holds it', late.refusal ?? late.text ?? '');
  const was = nPair(OC, S, rowsOf, ['Kestrel Capital']);
  check(was.refusal === null && (was.text ?? '').includes('+ Visit www.kestrelcapital.com'),
    'CONTROL: with any find inside a place left readable dropped, as it was, the listed term is copied readable with nothing refused — the check above can fail', nLine(was));
  store.set(LIST, JSON.stringify([]));
}
{
  const S = 'See https://kestrel-capitalgroup.com/deals now. Kestrel Capital signed. Kestrel agreed.';
  const rowsOf = () => [row('Kestrel Capital', '[Company1]', 'org'), row('Kestrel', '[Company2]', 'org')];
  const W = 'See https://[Company1]group.com/deals now. [Company1] signed. [Company2] agreed.';
  const live = nPair(LIVE, S, rowsOf, []);
  check(live.refusal === null && (live.text ?? '').includes(`+ ${W} Signed on Tuesday.`) && txtOf(S, rowsOf, []).endsWith(`${W} Signed on Tuesday.`),
    'a kept name run into a hyphenated host behind a kept shorter name: the clipboard masks it whole under its own tag, as the .txt and the .docx do', nLine(live));
  const was = nPair(await compareWith({ 'engine.ts': NO_PROBE }), S, rowsOf, []);
  check(was.refusal === null && (was.text ?? '').includes('-capitalgroup.com'),
    'CONTROL: with a name read through a claim only at a word\'s break, as it was, the clipboard copies "-capitalgroup.com" with nothing refused — the check above can fail', nLine(was));
}
{
  const ESC_SAYS = '“René Tan” may stand in a web address or a file’s path written with a percent-escape (%E9) that is no character, where nothing can say which letter it meant';
  const S = `Filed at ${SP}/Ren%E9%20Tan/x.docx today. René Tan signed.`;
  const rowsOf = () => [row('René Tan', '[Person1]', 'person')];
  const kept = nPair(LIVE, S, rowsOf, []);
  check(kept.text === null && /a row you chose to redact still readable, whole or in part, in its redacted text — René Tan — and Export holds/.test(kept.refusal ?? '') && (kept.refusal ?? '').includes(ESC_SAYS),
    'a kept name a percent-escape that writes no character may hide: the clipboard is refused, and the way names the escape', kept.refusal ?? kept.text ?? '');
  const was = nPair(await compareWith({ 'engine.ts': NO_ESC }), S, rowsOf, []);
  check(was.refusal === null && (was.text ?? '').includes('Ren%E9%20Tan'),
    'CONTROL: with the escape not asked, as it was, the clipboard copies "Ren%E9%20Tan" with nothing refused — the check above can fail', nLine(was));
  const bare = nPair(await compareWith({ 'Compare.tsx': [['plan.escaped ? `${find}. ${escapeWay(', 'false ? `${find}. ${escapeWay(']] }), S, rowsOf, []);
  check(bare.text === null && !(bare.refusal ?? '').includes(ESC_SAYS),
    'CONTROL: without the sentence the refusal sends the lawyer to find "René Tan" in a document that writes it "Ren%E9%20Tan" — the check above can fail', bare.refusal ?? '');
  // listed after both drafts were read, with no row: refused, no button on Export, escape named
  const lS = S.replace('René Tan signed', 'Jane Roe signed');
  store.set(LIST, JSON.stringify(['René Tan']));
  const late = nPair(LIVE, lS, () => [JR()], ['René Tan']);
  check(late.text === null && /Masking René Tan from that page would leave it readable/.test(late.refusal ?? '') && (late.refusal ?? '').includes(ESC_SAYS),
    'listed after both drafts were read, written only with such an escape: refused, and the way names the escape', late.refusal ?? late.text ?? '');
  const lBare = nPair(await compareWith({ 'Compare.tsx': [['.${escs} Then pick', '. Then pick']] }), lS, () => [JR()], ['René Tan']);
  check(lBare.text === null && /Masking René Tan from that page/.test(lBare.refusal ?? '') && !(lBare.refusal ?? '').includes(ESC_SAYS),
    'CONTROL: without it the way sends the lawyer to select a word the review cannot find by its letters — the check above can fail', lBare.refusal ?? '');
  store.set(LIST, JSON.stringify([]));
}

// ── 23: the fragment count reads what a reader reads ───────────────────────────────────────
// The count (law 11) was asked at the footprint's edges of the copy as written, which refuse a
// digit on either side: "Kierkegaard12", "Kierkegaard¹", "Kierkegaard2024.pdf" and a surname in
// a pasted link written "%20Kierkegaard" or "S%C3%B8ren" went onto the clipboard readable under
// "Fragment check: no fragment of any listed name is readable below" (F-FRAG, owner ruling 21,
// 2026-09-24; protected-terms law 42 holds the reading, 18z the Export screen). Since the
// second pass the screen is handed each piece as the copy writes it — a lawyer searching the
// copy for "Søren" does not find "S%C3%B8ren" (P1T-5) — a capitalised piece under four letters
// is counted (F6), and so is a word of a term on the always-redact list with no row (F5). Each
// CONTROL puts the check back as it stood at the round's start, its body in place of the live
// one, in the engine the clipboard bundles.
{
  const SIG = "export function survivingFragments(exported: string, kept: ReadonlyArray<Pick<Entity, 'text'>>, terms: readonly string[] = []): string[] {";
  const ROUND_START = [[SIG, [
    SIG,
    '  const found = new Set<string>();',
    '  for (const e of kept) for (const tok of e.text.split(/\\s+/)) {',
    "    const t = tok.replace(/[^\\p{L}\\p{N}]/gu, '');",
    '    if (t.length < 4 || FRAGMENT_STOP.has(t.toLowerCase())) continue;',
    '    if (spanSurvives(exported, t)) found.add(t);',
    '  }',
    '  return [...found];',
    '}',
    "function survivingFragmentsNow(exported: string, kept: ReadonlyArray<Pick<Entity, 'text'>>, terms: readonly string[] = []): string[] {",
  ].join('\n')]];
  const OF = await compareWith({ 'engine.ts': ROUND_START });
  const SK = () => [row('Søren Kierkegaard', '[Person1]', 'person')];
  const MT = () => [row('Margaret Tan', '[Person1]', 'person')];
  const MP = () => [row('Mr Porter', '[Person1]', 'person')];
  const COUNTED = /^Fragment check: 1 partial name of listed names may be readable below — not named here, because the tables list the longer span\.$/m;
  const COUNTED_ANY = /^Fragment check: \d+ partial names? of listed names may be readable below/m;
  const NONE = /^Fragment check: no partial name of a listed name found\. The check reads each word of a row you masked or of a listed term, [^\n]*; never inside a plain word of letters\.$/m;
  const PP = 'https://urldefense.proofpoint.com/v2/url?u=https-3A__dms.example.com_find-3Fq-3DDr.-2520Kierkegaard&d=DwMF';
  for (const [label, piece, shows, S, rowsOf = SK] of [
    ['a footnote\'s number after the surname', 'Kierkegaard', 'Kierkegaard12', 'Kierkegaard12 replied.'],
    ['a superscript note mark', 'Kierkegaard', 'Kierkegaard¹', 'Kierkegaard¹ replied.'],
    ['a year before it', 'Kierkegaard', '2024Kierkegaard', 'See the 2024Kierkegaard memo.'],
    ['a file name', 'Kierkegaard', 'Kierkegaard2024.pdf', 'Open Kierkegaard2024.pdf now.'],
    ['a matter reference in capitals', 'KIERKEGAARD', 'KIERKEGAARD01', 'Ref: KIERKEGAARD01.'],
    ['%20 before it in a link', 'Kierkegaard', 'Dr.%20Kierkegaard', 'See https://dms.example.com/find?q=Dr.%20Kierkegaard now.'],
    ['a Proofpoint v2 link', 'Kierkegaard', 'Dr.-2520Kierkegaard', `See ${PP} now.`],
    ['the given name written with escapes', 'S%C3%B8ren', 'S%C3%B8ren', 'See /clients/S%C3%B8ren/memo now.'],
    ['a superscript letter glued to the surname', 'Kierkegaard', 'Kierkegaardᵃ', 'Kierkegaardᵃ replied.'],
    ['a capitalised surname of three letters in a plural', 'Tan', 'The Tans', 'The Tans came.', MT],
  ]) {
    const T = `${S} ${rowsOf()[0].text} signed.`;
    const live = nPair(LIVE, T, rowsOf, []);
    check(live.refusal === null && (live.text ?? '').includes(shows) && COUNTED.test(live.text ?? '') && live.frags === 1 && live.fragWords.join() === piece && namedIn(live).length === 0,
      `${label} ("${shows}"): the copy counts the piece, names it nowhere but its own line, and the screen is handed "${piece}" as the copy writes it`, `${(live.text ?? live.refusal ?? '').split('\n').find((l) => /^Fragment check/.test(l)) ?? live.refusal} | ${JSON.stringify(live.fragWords)}`);
    const was = nPair(OF, T, rowsOf, []);
    check(was.refusal === null && (was.text ?? '').includes(shows) && NONE.test(was.text ?? '') && was.frags === 0,
      `CONTROL: with the check as it stood at the round's start, "${shows}" is copied under "no fragment" — the check above can fail`, `${was.frags} ${JSON.stringify(was.fragWords)}`);
  }
  // what it does not count: a piece inside a longer word, which no reader takes for the name and
  // the mask leaves too (owner ruling 8), a plural in small letters ("the porters", a noun), and
  // a short piece in small letters ("the tan leather")
  const UNGUARDED = await compareWith({ 'engine.ts': [["for (const f of refFind(exported.split(TAG_BLANK).join(WALL), runNames([...letters]), 'text')) {", "for (const f of refFind(exported.split(TAG_BLANK).join(WALL), runNames([...letters]), 'all')) {"]] });
  const ANY_CASE = await compareWith({ 'engine.ts': [['      if (short.has(f.name) && !/^[\\p{Lu}%&]/u.test(w)) continue;\n', '']] });
  const INSIDE = 'read as the .docx writer reads a name in its code, from six letters anywhere inside a word';
  for (const [label, S, rowsOf, piece, M, why] of [
    ['"supporter" and "Porterfield" beside a kept "Mr Porter"', 'A supporter and Porterfield came. Mr Porter signed.', MP, 'porter', UNGUARDED, INSIDE],
    ['"Kierkegaardian" beside a kept "Søren Kierkegaard"', 'Kierkegaardian thought. Søren Kierkegaard signed.', SK, 'kierkegaard', UNGUARDED, INSIDE],
    ['"the porters" beside a kept "Mr Porter"', 'Then the porters came. Mr Porter signed.', MP, 'porter', UNGUARDED, INSIDE],
    ['"the tan leather" beside a kept "Margaret Tan"', 'Then the tan leather came. Margaret Tan signed.', MT, 'tan', ANY_CASE, 'a short piece read in any case'],
  ]) {
    const live = nPair(LIVE, S, rowsOf, []);
    check(live.refusal === null && live.frags === 0 && NONE.test(live.text ?? ''), `${label}: nothing is counted`, `${live.frags} ${JSON.stringify(live.fragWords)}`);
    const was = nPair(M, S, rowsOf, []);
    check(was.frags >= 1 && was.fragWords.some((w) => w.toLowerCase() === piece) && COUNTED_ANY.test(was.text ?? ''),
      `CONTROL: ${why}, "${piece}" is counted — the check above can fail`, `${was.frags} ${JSON.stringify(was.fragWords)}`);
  }
  // a word of a term on the always-redact list, the term with no row (F5): the tables' rows alone
  // were asked, and "Mr Kestrel12" beside a listed "Kestrel Capital Partners" was copied under
  // "no fragment"
  const KT = 'Mr Kestrel12 replied.', KTL = ['Kestrel Capital Partners'];
  store.set(LIST, JSON.stringify(KTL));
  const kt = nPair(LIVE, KT, () => [], KTL);
  check(kt.refusal === null && COUNTED.test(kt.text ?? '') && kt.frags === 1 && kt.fragWords.join() === 'Kestrel' && namedIn(kt).length === 0,
    'a word of a listed term with no row ("Mr Kestrel12" for "Kestrel Capital Partners"): the copy counts it and the screen is handed "Kestrel"', `${kt.refusal ?? ''} ${kt.frags} ${JSON.stringify(kt.fragWords)}`);
  const ktWas = nPair(await compareWith({ 'Compare.tsx': [[', [...new Set([...(a.terms ?? []), ...(b.terms ?? [])])]);', ');']] }), KT, () => [], KTL);
  check(ktWas.refusal === null && NONE.test(ktWas.text ?? '') && ktWas.frags === 0,
    'CONTROL: with the tables\' rows alone asked, as it was, "Mr Kestrel12" is copied under "no fragment" — the check above can fail', `${ktWas.frags} ${JSON.stringify(ktWas.fragWords)}`);
  store.set(LIST, JSON.stringify([]));
  // The none-line says what the check reads, in the export receipt's words: "no fragment of any
  // listed name is readable below" claimed a completeness on a payload pasted into a model, and
  // "the tan leather" beside a kept "Margaret Tan" above is copied under it (D3L-1)
  const litOf = (file, name) => (readFileSync(join(here, '..', 'src', 'screens', file), 'utf8').match(new RegExp(`const ${name} = '([^']*)';`)) ?? [])[1];
  const recScope = litOf('Export.tsx', 'fragHow'), cmpScope = litOf('Compare.tsx', 'FRAG_HOW');
  check(!!recScope && recScope === cmpScope, 'the copy\'s none-line states the scope the export receipt states for the same check, word for word (Export.tsx fragHow)', cmpScope);
  const OldNone = await compareWith({ 'Compare.tsx': [["`Fragment check: no partial name of a listed name found. The check reads ${FRAG_HOW}.`", "'Fragment check: no fragment of any listed name is readable below.'"]] });
  const oldTan = nPair(OldNone, 'Then the tan leather came. Margaret Tan signed.', MT, []);
  check(oldTan.refusal === null && oldTan.frags === 0 && !NONE.test(oldTan.text ?? ''),
    'CONTROL: with the none-line as it was, no scope is stated and the none-line checks fail — they can fail', (oldTan.text ?? '').split('\n').find((l) => /^Fragment check/.test(l)));
}

// ── 24: a name the writer reads since owner rulings 18 and 19, on the clipboard ─────────────
// '#' joined '@' (ruling 18); a short form written long is masked whole (19a); a number grouped
// by any dash, a minus, a tab or " - " is read as one (19b); a row is folded by NFKD (19c);
// "&nbsp" is read with no semicolon (19d); a run of capitals before a plural s is one word (19e).
// The engine asks the writer's refFind for each, so the clipboard carries what the .txt carries
// (protected-terms law 44 holds the .txt, the Review preview and the saved .docx body, header
// and footer to the same texts; 18za the Export clipboard and name key). Each CONTROL is the
// ruling as it was, in the copy of docxWrite.ts the engine bundles.
{
  const RULING_WAS = {
    hash: ['"#" read as neither a joiner nor a handle\'s first character, as before ruling 18', [['const JOINER = /[./\\\\:@_#]/;', 'const JOINER = /[./\\\\:@_]/;'], ['const HANDLE = /^[@#]$/;', 'const HANDLE = /^@$/;']]],
    long: ['no designator read written whole, as before ruling 19a', [["const LONG_FORM: Record<string, string> = { co: 'company', corp: 'corporation', inc: 'incorporated' };", 'const LONG_FORM: Record<string, string> = {};']]],
    dsep: ['a number grouped only by a space, a dot, a slash or a hyphen, as before ruling 19b', [['if (N(ch) && lastN && DIGIT_SEP.test(gap)) dsep.add(c.length);', 'if (N(ch) && lastN && /^[ ./\\-   ‐-–]$/.test(gap)) dsep.add(c.length);']]],
    nfkd: ['the letters folded by NFD alone, as before ruling 19c', [["  const k = ch.normalize('NFKD');", "  const k = ch.normalize('NFD');"]]],
    nbsp: ['"&nbsp" read only with its semicolon, as before ruling 19d', [['&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+/g;', '&[A-Za-z][A-Za-z0-9]{1,31};)+/g;'], ['|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)/y;', '|&(?:(nbsp);|([A-Za-z][A-Za-z0-9]{1,31});)/y;'], ['|&#?[0-9A-Za-z]+;|&nbsp/;', '|&#?[0-9A-Za-z]+;/;'], ["&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+`, 'g');", "&[A-Za-z][A-Za-z0-9]{1,31};)+`, 'g');"], ["|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)`, 'y');", "|&(?:(nbsp);|([A-Za-z][A-Za-z0-9]{1,31});)`, 'y');"]]],
    plural: ['"ISPs" cut before its P, as before ruling 19e', [['&& Ll(chars[i + 1]) && !plural)', '&& Ll(chars[i + 1]))']]],
  };
  const one = (s) => s.replace(/[ \t]+/g, ' ');
  for (const [label, S, rowsOf, W, was, shows] of [
    ['a kept "Kestrel Capital" run into a hashtag, "#kestrelcapitaldeal"', 'Tag #kestrelcapitaldeal today. Kestrel Capital agreed.', () => [row('Kestrel Capital', '[Company1]', 'org')], 'Tag #[Company1]deal today. [Company1] agreed.', 'hash', '#kestrelcapitaldeal'],
    ['"Hickson Corporation" beside a kept "Hickson Corp"', 'Hickson Corporation appeals. Hickson Corp agreed.', () => [row('Hickson Corp', '[Company1]', 'org')], '[Company1] appeals. [Company1] agreed.', 'long', 'Hickson Corporation'],
    ['a kept client number grouped by an em dash, a minus sign, a tab and " - "', 'Pay 3192—6819, 3192−6819, 3192\t6819 and 3192 - 6819 now. Client 31926819.', () => [idRow('31926819', '[ID1]')], 'Pay [ID1], [ID1], [ID1] and [ID1] now. Client [ID1].', 'dsep', '3192—6819'],
    ['a kept "Griﬃths" with the ligature in the row, written plain', 'Mr Griffiths replied. Mr Griffiths agreed.', () => [row('Griﬃths', '[Person1]', 'person')], 'Mr [Person1] replied. Mr [Person1] agreed.', 'nfkd', 'Mr Griffiths'],
    ['"Margaret&nbspTan" beside a kept "Margaret Tan"', 'Client: Margaret&nbspTan. Margaret Tan agreed.', () => [row('Margaret Tan', '[Person1]', 'person')], 'Client: [Person1]. [Person1] agreed.', 'nbsp', 'Margaret&nbspTan'],
    ['"ISPs" beside a kept "I.S."', 'The ISPs replied. I.S. agreed.', () => [row('I.S.', '[Person1]', 'person')], 'The ISPs replied. [Person1] agreed.', 'plural', '[Person1]Ps'],
  ]) {
    const live = nPair(LIVE, S, rowsOf, []);
    const T2 = `The fee is two.\n\n${S} Signed on Tuesday.`;
    const txt = exportPlan({ text: T2, entities: syncFloorRows(T2, rowsOf(), loadPractice()), reviewed: true, engineComplete: true, kind: 'text' }, [], loadPractice()).red;
    check(live.refusal === null && one(live.text ?? '').includes(`+ ${W} Signed on Tuesday.`) && one(txt).endsWith(`${W} Signed on Tuesday.`) && live.frags === 0,
      `${label}: the clipboard copies what the .txt carries, with no fragment counted`, one(nLine(live)));
    const [why, pairs] = RULING_WAS[was];
    const old = nPair(await compareWith({ 'docxWrite.ts': pairs }), S, rowsOf, []);
    check(old.refusal === null && (old.text ?? '').includes(shows) && !one(old.text ?? '').includes(`+ ${W} Signed on Tuesday.`),
      `CONTROL: with ${why}, the clipboard copies "${shows}" with nothing refused — the check above can fail`, one(nLine(old)));
  }
}

console.log(fails ?`\n${fails} FAIL` : '\nall PASS');
process.exit(fails ? 1 : 0);
