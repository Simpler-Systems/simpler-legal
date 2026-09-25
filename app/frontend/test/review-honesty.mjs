// REVIEW HONESTY — the review screen must never state that a human looked at a row nobody
// looked at: not in its tally, not on its finish button, not on the receipt that travels
// with the copy.
// Run from app/frontend:   node test/review-honesty.mjs
//
// Follows test/protected-terms.mjs and test/doctrine-profile.mjs: esbuild the REAL modules
// (src/lib/review.ts, src/lib/engine.ts) and drive what the app exports. The in-app core's
// Web Worker is stubbed to the protocol engine.ts speaks ({type:'strip'} in, {type:'done'}
// out), so the table under test goes through the real status mapping. Review.tsx is a React
// component with no test runner behind it, so its wiring is checked from its source.
//
// LAUNCH.md §4.3 and §4.2, both NO-GO on 2026-09-22:
//   "42 of 42 reviewed" before a human read anything. Review.tsx counted
//   `entities.length - pending` as reviewed; on the frozen service path nothing arrives
//   pending, so the count was the whole table the moment the document opened, beside a green
//   "✓ Confirm & finish review" titled "Everything reviewed — good to go". Pressing it sets
//   the flag Export and Compare release on.
//
// The six laws, and what each one costs when it breaks:
//
//   1. ENGINE CONFIDENCE IS NEVER A HUMAN DECISION. A table fresh from either engine counts
//      zero rows decided, and the tally never prints "N of N reviewed".
//      Cost: the screen tells the lawyer, and anyone watching, that the document was read.
//
//   2. EVERY VERDICT RECORDS ITSELF, UNDO PUTS BACK EXACTLY WHAT WAS THERE, AND A VERDICT
//      REACHES ONLY THE ROW IT NAMES. Keys the screen mints cannot repeat across a remount;
//      the short form an extend-drag keeps is the engine's row, not a decision.
//      Cost: an undone confirm still counted as a decision; a key minted twice turned one
//      undo into a row substitution that exported a hand-added client name readable.
//
//   3. REVIEW.TSX ROUTES EVERY onUpdate THROUGH THE HELPERS. Every call records a decision
//      (decideRows, widenRow, a row minted with `decided: true`) or is an exact undo
//      (restoreRows, withdrawRow or unwidenRow over an untouched snapshot of the rows it
//      changed — never a snapshot of the whole table), and no call rewrites a row inline.
//      Cost: one path that forgets — the drag, the fold, a keyboard shortcut — and its rows
//      stand as "marked automatically" after a human changed them, or the reverse; a
//      whole-table undo takes back changes it never names (a term masked from Export).
//
//   4. THE FINISH BUTTON AND THE RECEIPT SAY WHAT WAS ATTESTED. The button cannot finish
//      while a row is pending; with nothing pending it is an attestation and says so, with
//      the count of marks that go out as the machine made them and of the candidates the
//      model judged, apart from those it gave no class for; on a .docx it, and Drop's chip,
//      say the save runs a final check of its own; Export's hold names that button; the pending redirect hands C and I to the row it names; the receipt carries
//      counts and never a name, a term or a tag.
//      Cost: a finish over an open question; an instruction that leaves a different name
//      readable; a client's name in the artefact that travels to the model provider; a
//      verdict credited to the model that it never gave.
//
//   5. A PENDING IDENTITY ROW IS MASKED UNTIL A HUMAN DECIDES IT, AND THE HEADER SAYS SO.
//      Cost: a name found by the second read ships readable because nobody has answered yet,
//      or the screen reads "pending" as "readable" while the bytes mask it.
//
//   6. THE PANE MARKS WHAT THE COPY MASKS. Every stretch the export masks is highlighted
//      under the tag that masks it, read off the export's own claims and safety-net matches,
//      a click on it opens the row that masks it, and nothing else is highlighted.
//      Cost: a word the copy masks shown as plain text, which the lawyer can neither see nor
//      decide, or shown under a row that decides nothing there.
//
// Every law is followed by a CONTROL that runs the same check on the broken version —
// recreated code or recreated behaviour, never a string typed to fail — and asserts the
// check catches it, so a green run means the assertions have teeth. Exit 1 on any FAIL.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const src = (...p) => join(here, '..', 'src', ...p);
const dir = mkdtempSync(join(tmpdir(), 'review-honesty-'));
const url = (p) => 'file:///' + p.replace(/\\/g, '/');
const out = {};
for (const [name, entry] of [['engine', src('lib', 'engine.ts')], ['review', src('lib', 'review.ts')]]) {
  out[name] = join(dir, `${name}.mjs`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out[name], logLevel: 'silent' });
}
// The engine as it was before its run-together rule (engine.ts placements): a form of a row's
// name its own pattern never reads — a zero-width space inside a word, a straight apostrophe for
// a curly one — is masked today under the row's name whatever the row's category. A CONTROL
// whose harm is such a form is held to its case under this engine, where the row's category is
// what masks it.
out.preRun = join(dir, 'engine-pre-run.mjs');
await build({ entryPoints: [src('lib', 'engine.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out.preRun, logLevel: 'silent',
  plugins: [{ name: 'pre-run', setup(b) {
    b.onLoad({ filter: /[\\/]engine\.ts$/ }, (a) => {
      const c = readFileSync(a.path, 'utf8').replace(/\r\n/g, '\n');
      const x = '  if (names.length) {\n    const walls';
      if (!c.includes(x)) throw new Error('CONTROL anchor not found in engine.ts: the run-together rule');
      return { contents: c.replace(x, '  if (false) {\n    const walls'), loader: 'ts', resolveDir: join(a.path, '..') };
    });
  } }] });

// the engine bundle touches window/localStorage on import (tauri.ts inTauri, the settings)
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
// The in-app core runs in a Web Worker. The stub answers {type:'strip'} with the table set
// below, so stripText -> mapOutcome -> the status mapping all run as they do in the app.
let WORKER_TABLE = [];
globalThis.Worker = class {
  constructor() { this.onmessage = null; this.onerror = null; }
  postMessage(m) {
    if (m.type !== 'strip') return;
    setTimeout(() => this.onmessage?.({ data: { type: 'done', doc: m.text, table: WORKER_TABLE, rejected: [], masked: m.text, complete: true, completeBy: { span: true }, stats: {} } }), 0);
  }
  terminate() {}
};

const { stripText, mapLegalOutcome, remask, spanMatches, occurrencesOutside, wordContains, withProtectedTerms, listHolds, placeSpans, syncFloorRows } = await import(url(out.engine));
const PRE_RUN = await import(url(out.preRun));
const {
  reviewTally, tallyLine, FINISH_LABEL, finishTitle, receiptReviewLine, decideRows, restoreRows,
  withdrawRow, mintHandKey, widenRow, unwidenRow, liveSuspects, rowIn, headLine, withMaskedPieces, modelJudged, CLEARED_AS,
  DOCX_SAVE_NOTE,
} = await import(url(out.review));

let pass = 0, fail = 0;
const check = (ok, what, detail = '') => { console.log((ok ? '  PASS  ' : '  FAIL  ') + what + (detail ? '\n          ' + detail : '')); ok ? pass++ : fail++; };
const PRACTICE = 'us';

/** "42 of 42 reviewed", or any count phrased as a share of the table being reviewed */
const CLAIMS_REVIEWED = (s) => /\breviewed\b/i.test(s) || /\b(\d+) of \1\b/.test(s);
/** same keys, same values — a key present with `undefined` is NOT the same as an absent key */
const sameRow = (a, b) => {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};
const sameTable = (a, b) => a.length === b.length && a.every((r, i) => sameRow(r, b[i]));

// The helpers as the first pass shipped them, and the per-mount counter Review.tsx minted
// keys with — recreated so each CONTROL below runs the same check on the broken version.
const OLD = {
  decideRows: (es, keys, patch) => { const want = new Set(keys); return es.map((e) => (want.has(e.key) ? { ...e, ...patch, decided: true } : e)); },
  restoreRows: (es, before) => { const prev = new Map(before.map((e) => [e.key, e])); return es.map((e) => prev.get(e.key) ?? e); },
  withdraw: (es, ent) => es.filter((e) => e.key !== ent.key),
  /** `const addSeq = useRef(0)` — a fresh counter every time Review mounts */
  mount: () => { let seq = 0; return (_es, p) => p + ++seq; },
  widen: (es, key, text, occ, alone, swallowed) => {
    const e = es.find((x) => x.key === key);
    let next = OLD.decideRows(es, [key], { text, occ, status: 'confirmed' });
    if (alone > 0) next = [...next, { key: 'x1', text: e.text, tag: e.tag, cat: e.cat, prov: 'added by you', occ: alone, status: 'confirmed', decided: true }];
    if (swallowed.length) next = OLD.decideRows(next, swallowed, { tag: e.tag, status: 'confirmed' });
    return next;
  },
};
const NEW = { decideRows, restoreRows, withdraw: withdrawRow, mount: () => mintHandKey, widen: widenRow };

// A frozen-service table, built the way the app builds it: 42 rows, every one the engine's.
const SURNAMES = ['Kowalczyk', 'Nowak', 'Achterberg', 'Oyelaran', 'Szymanski', 'Castellano', 'Lindqvist', 'Moreau', 'Haddad', 'Okonkwo', 'Varga', 'Brennan', 'Takahashi', 'Delacroix'];
const FIRST = ['Anna', 'Piotr', 'Maren'];
const NAMES = FIRST.flatMap((f) => SURNAMES.map((s) => `${f} ${s}`)); // 42 distinct people
const LEGAL_TEXT = NAMES.map((n, i) => `On day ${i + 1} ${n} gave evidence.`).join(' ');
const legal = mapLegalOutcome(LEGAL_TEXT, {
  genre: 'courts', engine: 'v1-legal-frozen', final: LEGAL_TEXT, alignOk: true,
  rows: NAMES.map((n, i) => ({ span: n, cls: 'PERSON', src: 'legal-pipeline', tag: `[Person${i + 1}]` })),
});
const TABLE = legal.entities;

// ── LAW 1: engine confidence is never a human decision ──
console.log('\n— law 1: a table nobody has touched —');
{
  const t = reviewTally(TABLE);
  check(TABLE.length === 42 && t.decided === 0,
    'a frozen-service table of 42 engine rows counts 0 decided by you', JSON.stringify(t));
  check(t.standing === 42 && t.waiting === 0 && t.decided + t.standing + t.waiting === t.total,
    'all 42 stand as marked automatically, and the three counts add up to the table', JSON.stringify(t));
  const tallyOk = (line, decided) => !CLAIMS_REVIEWED(line) && new RegExp(`\\b${decided} decided by you\\b`).test(line);
  const line = tallyLine(t);
  check(tallyOk(line, t.decided), 'the tally says "0 decided by you" and nothing that reads as "N of N reviewed"', line);

  // CONTROL: the formula and the line that shipped, through the same check
  const oldCount = TABLE.length - TABLE.filter((e) => e.status === 'pending').length;
  const oldLine = `${oldCount} of ${TABLE.length} reviewed`;
  check(!tallyOk(oldLine, t.decided) && oldCount === 42,
    'CONTROL: the old `entities.length - pending` prints "42 of 42 reviewed" for 0 human decisions, and the tally check rejects that line', oldLine);

  // model-cleared candidates are neither decided nor standing, and the tally says they exist
  const cleared = liveSuspects([{ text: 'Singapore' }, { text: NAMES[0] }], TABLE);
  const withCleared = tallyLine(t, cleared.length);
  const mentionsCleared = (s, n) => new RegExp(`\\b${n} left readable by the model\\b`).test(s);
  check(cleared.length === 1 && mentionsCleared(withCleared, 1) && tallyOk(withCleared, 0),
    'a model-cleared candidate no row covers is counted on the tally; one a row covers is not', withCleared);
  // CONTROL: the tally as the screen called it before (no count passed) says nothing of it
  check(!mentionsCleared(tallyLine(t), 1), 'CONTROL: the tally called without the count omits the candidate, and the check catches it', tallyLine(t));

  // the in-app core: every row arrives undecided too, pending or not
  WORKER_TABLE = [
    { span: 'Margaret Tan', cls: 'PERSON', src: 'span', tag: '[Person1]' },
    { span: 'Wei Sheng', cls: 'PERSON', src: 'engineB:residue', tag: '[Person2]' },
    { span: 'Hastings Holdings', cls: 'COMPANY', src: 'rail:classify', tag: '[Company1]' },
  ];
  const core = await stripText('Margaret Tan met Wei Sheng at Hastings Holdings.', () => {});
  check(core.entities.every((e) => e.decided === undefined) && reviewTally(core.entities).decided === 0,
    'the in-app core\'s rows arrive undecided — pending and confirmed alike', JSON.stringify(core.entities.map((e) => [e.prov, e.status, e.decided])));

  // Measured, not asserted: the frozen service path cannot put a row in the queue at all.
  console.log(`  NOTE  frozen service path (mapLegalOutcome): ${TABLE.filter((e) => e.status === 'pending').length} of ${TABLE.length} rows arrive pending — every row is prov 'pattern' / confirmed, so the guided review cannot engage there; this file keeps the tally honest on that path, it does not change it`);
}

// ── LAW 2: every verdict records itself, undo is exact, a verdict reaches only its row ──
console.log('\n— law 2: verdicts, their undo, and the keys they reach —');
{
  const VERDICTS = [
    ['confirm', { dead: false, status: 'confirmed' }],
    ['leave readable', { dead: true, status: 'ignored' }],
    ['redact as other', { cat: 'org', cls: 'COMPANY', dead: false, status: 'confirmed' }],
    ['same as', { tag: '[Person1]', dead: false, status: 'confirmed' }],
    ['unfold', { tag: '[Person99]' }],
  ];
  for (const [label, patch] of VERDICTS) {
    const before = TABLE[5];
    const after = decideRows(TABLE, [before.key], patch);
    const row = after.find((e) => e.key === before.key);
    check(row.decided === true && reviewTally(after).decided === 1 && after.filter((e, i) => e !== TABLE[i]).length === 1,
      `${label}: the row is recorded as decided, and no other row is touched`, JSON.stringify(reviewTally(after)));
    const undone = restoreRows(after, [before]);
    check(sameTable(undone, TABLE) && !('decided' in undone[5]) && reviewTally(undone).decided === 0,
      `${label}: undo restores the table exactly — no \`decided\` key left behind`);
  }

  const keys = TABLE.slice(0, 7).map((e) => e.key);
  const bulk = decideRows(TABLE, keys, { dead: true, status: 'ignored' });
  check(reviewTally(bulk).decided === 7 && sameTable(restoreRows(bulk, TABLE.slice(0, 7)), TABLE),
    'a bulk verdict decides each row it names, and its undo restores all of them exactly');

  // a re-tagged row that is still pending is still waiting: the lock and the count agree
  const pend = [{ ...TABLE[0], status: 'pending' }, ...TABLE.slice(1)];
  const retag = decideRows(pend, [pend[0].key], { tag: '[Person77]' });
  const rt = reviewTally(retag);
  check(rt.waiting === 1 && rt.decided === 0,
    'a pending row a human re-tagged but has not confirmed counts as waiting, not decided', JSON.stringify(rt));

  // CONTROL: the undo that shipped before this lane restored {dead, status} and nothing else
  {
    const before = TABLE[5];
    const after = decideRows(TABLE, [before.key], { dead: false, status: 'confirmed' });
    const prev = { dead: before.dead, status: before.status };
    const oldUndo = after.map((e) => (e.key === before.key ? { ...e, ...prev } : e));
    check(!sameTable(oldUndo, TABLE) && reviewTally(oldUndo).decided === 1,
      'CONTROL: a field-scoped undo leaves the row counted as decided, and the exactness check catches it',
      JSON.stringify(reviewTally(oldUndo)));
  }

  // Two visits to the review of one file. Review unmounts on every step away (App renders it
  // under `step === 2`), so a counter on the component starts again at 0 on the second visit.
  // The lawyer adds a name on each visit, then leaves the second one readable and presses U.
  const VISIT_TEXT = 'Alice Kowalczyk instructed us. Later Bob Nowak called about the claim.';
  const handRow = (key, text, tag) => ({ key, text, tag, cat: 'person', prov: 'added by you', occ: 1, status: 'confirmed', decided: true });
  function twoVisits(impl) {
    let table = [];
    let mint = impl.mount();                                   // visit 1
    table = [...table, handRow(mint(table, 'u'), 'Alice Kowalczyk', '[Person1]')];
    mint = impl.mount();                                       // Finish → Export → Back
    const bobKey = mint(table, 'u');
    table = [...table, handRow(bobKey, 'Bob Nowak', '[Person2]')];
    const bytesBefore = remask(VISIT_TEXT, table, PRACTICE).text;
    const ent = table.find((e) => e.key === bobKey);           // decide(): the row the screen resolves
    const after = impl.decideRows(table, [bobKey], { dead: true, status: 'ignored' });
    const undone = impl.restoreRows(after, [ent]);
    const bytes = remask(VISIT_TEXT, undone, PRACTICE).text;
    return {
      keys: table.map((e) => e.key), touched: after.filter((e, i) => e !== table[i]).length,
      exact: sameTable(undone, table) && bytes === bytesBefore, bytes,
      readable: ['Alice Kowalczyk', 'Bob Nowak'].filter((n) => bytes.includes(n)),
    };
  }
  const visitsOk = (r) => new Set(r.keys).size === r.keys.length && r.touched === 1 && r.exact && r.readable.length === 0;
  const now = twoVisits(NEW);
  check(visitsOk(now), 'a name added on each of two visits gets its own key; one verdict touches one row; its undo puts back the table and the bytes exactly',
    `${now.keys.join(', ')} · after U: ${now.bytes}`);
  // CONTROL: the per-mount counter and the key-only helpers — the measured leak
  const was = twoVisits(OLD);
  check(!visitsOk(was) && was.readable.length > 0,
    'CONTROL: with the per-mount counter both names get the same key, and the undo exports one of them readable — the check catches it',
    `${was.keys.join(', ')} · after U: ${was.bytes}`);

  // The helpers hold even if a key does repeat (a table from anywhere else): a verdict
  // reaches the first row with the key — the one `entities.find` shows the lawyer — and the
  // undo restores that row and no other.
  const DUP = [handRow('u1', 'Alice Kowalczyk', '[Person1]'), handRow('u1', 'Bob Nowak', '[Person2]')];
  const dupOk = (impl) => {
    const bytesBefore = remask(VISIT_TEXT, DUP, PRACTICE).text;
    const after = impl.decideRows(DUP, ['u1'], { dead: true, status: 'ignored' });
    const undone = impl.restoreRows(after, [DUP[0]]);
    const gone = impl.withdraw(DUP, DUP[1]);
    return after.filter((e, i) => e !== DUP[i]).length === 1 && sameTable(undone, DUP)
      && remask(VISIT_TEXT, undone, PRACTICE).text === bytesBefore
      && gone.length === 1 && gone[0] === DUP[0];
  };
  check(dupOk(NEW), 'on a table where two rows share a key, a verdict, its undo, and the undo of an add each reach exactly one row');
  check(!dupOk(OLD), 'CONTROL: the key-only helpers fan the verdict out, substitute a row on undo, and withdraw both rows — the check catches it');

  // Drag-to-extend. "Lim" (engine, one pass) is widened to "Lim Bo Seng"; the drag swallows
  // the engine's "Bo Seng"; "Lim" still stands alone twice and keeps a row of its own.
  const WTEXT = 'Lim met the board. Lim Bo Seng signed for the buyer. Bo Seng left early. Lim left last.';
  const eng = (key, text, tag, extra = {}) => ({ key, text, tag, cat: 'person', prov: 'one pass', occ: spanMatches(WTEXT, text), status: 'confirmed', ...extra });
  const widenOk = (impl, srcRow) => {
    const W = [srcRow, eng('e1', 'Bo Seng', '[Person2]')];
    const newText = 'Lim Bo Seng';
    const alone = occurrencesOutside(WTEXT, srcRow.text, newText);
    const swallowed = W.filter((x) => x.key !== srcRow.key && !x.dead && x.tag !== srcRow.tag && wordContains(newText, x.text)).map((x) => x.key);
    const after = impl.widen(W, srcRow.key, newText, spanMatches(WTEXT, newText), alone, swallowed);
    const short = after.find((e) => e.text === srcRow.text);
    const bytes = remask(WTEXT, after, PRACTICE).text;
    const t = reviewTally(after);
    return {
      ok: alone === 2 && !!short && new Set(after.map((e) => e.key)).size === after.length
        && short.prov === srcRow.prov && short.status === srcRow.status && !!short.decided === !!srcRow.decided
        && t.decided === 2 && t.waiting === (srcRow.status === 'pending' ? 1 : 0)
        && !/\bLim\b|\bBo Seng\b/.test(bytes),
      detail: `${JSON.stringify(t)} · short form: ${short ? `${short.key} ${short.prov}/${short.status}${short.decided ? '/decided' : ''}` : 'none'} · ${bytes}`,
    };
  };
  const w1 = widenOk(NEW, eng('e0', 'Lim', '[Person1]'));
  check(w1.ok, 'extend-drag: the widened row and the swallowed row are decided; the short form kept where it stands alone is the engine\'s row, undecided, and still masked', w1.detail);
  const w2 = widenOk(NEW, eng('e0', 'Lim', '[Person1]', { prov: 'second sweep', status: 'pending' }));
  check(w2.ok, 'extend-drag on a pending row: the short form stays in the queue, masked, because nobody decided those occurrences', w2.detail);
  // CONTROL: the short form minted 'added by you' and decided — one drag counted as two decisions' worth of reading
  const w0 = widenOk(OLD, eng('e0', 'Lim', '[Person1]'));
  check(!w0.ok, 'CONTROL: the short form minted as "added by you, decided" is caught', w0.detail);

  // The drag's undo takes back the drag and nothing else. After the drag the lawyer masks a
  // declared term from Export ("Mask it in this document", which pushes no undo of its own);
  // U on the review then reaches the drag, and must leave that term masked.
  {
    const srcRow = eng('e0', 'Lim', '[Person1]');
    const W = [srcRow, eng('e1', 'Bo Seng', '[Person2]')];
    const newText = 'Lim Bo Seng';
    const alone = occurrencesOutside(WTEXT, srcRow.text, newText);
    const swallowed = W.filter((x) => x.key !== srcRow.key && !x.dead && x.tag !== srcRow.tag && wordContains(newText, x.text));
    const keep = mintHandKey(W, 'x');
    const snapshot = W.map((x) => ({ ...x })); // what Review.tsx took before the drag, and restored whole
    const later = withProtectedTerms(WTEXT, widenRow(W, srcRow.key, newText, spanMatches(WTEXT, newText), alone, swallowed.map((x) => x.key), keep), ['the board']);
    const undoOk = (undo) => {
      const back = undo(later);
      const bytes = remask(WTEXT, back, PRACTICE).text;
      return { ok: sameTable(back.filter((e) => e.cat !== 'protected'), W) && back.some((e) => e.cat === 'protected' && e.text === 'the board') && !/the board/.test(bytes), bytes };
    };
    const u = undoOk((es) => unwidenRow(es, { was: srcRow, text: newText, occ: spanMatches(WTEXT, newText), kept: alone > 0 ? keep : null, swallowed }));
    check(u.ok, 'the drag\'s undo puts back exactly the rows the drag changed and withdraws the short form it kept; a term masked from Export after the drag stays masked', u.bytes);
    const c = undoOk(() => snapshot);
    check(!c.ok, 'CONTROL: the whole-table snapshot the drag\'s undo used to restore drops the term masked after it, and "the board" is readable again', c.bytes);
  }

  // The same, when Export's button changes a row the DRAG changed. "Mask them in every form"
  // moves a row the list names under Protected terms in place (withProtectedTerms), and the
  // widened row, or the short form the drag kept, is such a row whenever the lawyer declares
  // the text they just dragged. Put back whole, the undo took the button's change back with
  // the drag's (E3-2), and nothing said so.
  {
    // the second mention has a zero-width space inside "Holdings", as pasted text often does
    const T = 'Kestrel Holdings Pte agreed. Payment by Kestrel Hold' + String.fromCharCode(0x200b) + 'ings Pte followed.';
    const src = { key: 'k', text: 'Kestrel Holdings', tag: '[Company1]', cat: 'org', cls: 'COMPANY', prov: 'both passes', occ: 1, status: 'confirmed' };
    const newText = 'Kestrel Holdings Pte';
    const alone = occurrencesOutside(T, src.text, newText);
    const keep = mintHandKey([src], 'x');
    const occ = spanMatches(T, newText);
    const dragged = widenRow([src], src.key, newText, occ, alone, [], keep);
    const terms = [newText];
    const masked = withProtectedTerms(T, dragged, terms);
    const w = { was: src, text: newText, occ, kept: alone > 0 ? keep : null, swallowed: [] };
    const run = (undo) => {
      const back = undo(masked, w);
      const bytes = remask(T, back, PRACTICE).text;
      const row = back.find((e) => e.key === 'k');
      return { ok: row?.text === src.text && row.cat === 'protected' && !/Kestrel|Hold/.test(bytes) && listHolds(bytes, back, terms).length === 0, bytes, row };
    };
    const now = run(unwidenRow);
    check(masked.find((e) => e.key === 'k')?.cat === 'protected' && now.ok,
      'the drag\'s undo after Export moved the widened row under Protected terms: the row goes back to "Kestrel Holdings" and stays under Protected terms, so both forms stay masked and Export holds nothing',
      `${now.bytes} · ${JSON.stringify(now.row)}`);
    const untouched = unwidenRow(dragged, w);
    check(untouched.length === 1 && untouched[0] === src, 'with nothing changed since the drag, its undo puts back the very row it was');
    // CONTROL: the undo as it shipped put the row back whole. The row leaves Protected terms
    // under either engine; the zero-width form that left readable is masked today under the
    // row's name whatever its category, so what it cost is shown under the engine before that rule
    const putBack = (es, x) => es.map((e) => (e.key === x.was.key && e.text === x.text ? x.was : e));
    const whole = run(putBack);
    const [wasWhole, wasNow] = [PRE_RUN.remask(T, putBack(masked, w), PRACTICE).text, PRE_RUN.remask(T, unwidenRow(masked, w), PRACTICE).text];
    check(!whole.ok && whole.row?.cat !== 'protected' && /Kestrel Hold/.test(wasWhole) && !/Kestrel|Hold/.test(wasNow),
      'CONTROL: put back whole, the row leaves Protected terms, and under the engine as it was before its run-together rule the second "Kestrel Holdings Pte" (a zero-width space inside) is readable again under a toast that says only "Undone: Extended to …", where the undo as it is keeps it masked — the check catches it',
      `${wasWhole} · ${wasNow}`);

    // the short form the drag kept is the row Export's button reaches when the lawyer declares
    // the short form: its change moves onto the row that masks the short form again
    const TO = 'O’Brien met the board. O’Brien Kessler signed. Later O\'Brien left.';
    const ob = { key: 'e0', text: 'O’Brien', tag: '[Person1]', cat: 'person', cls: 'PERSON', prov: 'one pass', occ: 2, status: 'confirmed' };
    const nt = 'O’Brien Kessler';
    const lone = occurrencesOutside(TO, ob.text, nt);
    const k2 = mintHandKey([ob], 'x');
    const occ2 = spanMatches(TO, nt);
    const d2 = widenRow([ob], ob.key, nt, occ2, lone, [], k2);
    const m2 = withProtectedTerms(TO, d2, ['O’Brien']);
    const w2 = { was: ob, text: nt, occ: occ2, kept: lone > 0 ? k2 : null, swallowed: [] };
    const run2 = (undo) => { const back = undo(m2, w2); const bytes = remask(TO, back, PRACTICE).text; return { ok: !/Brien/.test(bytes) && listHolds(bytes, back, ['O’Brien']).length === 0, bytes }; };
    const s1 = run2(unwidenRow);
    check(lone > 0 && m2.find((e) => e.key === k2)?.cat === 'protected' && s1.ok,
      'the drag\'s undo after Export moved the short form\'s row under Protected terms: the restored row takes that change, and the straight-apostrophe "O\'Brien" stays masked', s1.bytes);
    // (the straight-apostrophe form is masked today under the row's name whatever its category,
    // as above)
    const carryless = (es, x) => unwidenRow(es.map((e) => (e.key === x.kept ? { ...x.was, key: x.kept, occ: e.occ } : e)), x);
    const [noCarry, carried] = [PRE_RUN.remask(TO, carryless(m2, w2), PRACTICE).text, PRE_RUN.remask(TO, unwidenRow(m2, w2), PRACTICE).text];
    check(/Brien/.test(noCarry) && !/Brien/.test(carried),
      'CONTROL: under the engine as it was before its run-together rule, an undo that drops the short form\'s row without carrying its change leaves "O\'Brien" readable, where the undo as it is keeps it masked — the check catches it',
      `${noCarry} · ${carried}`);
  }
}

// ── LAW 3: every onUpdate in Review.tsx records a decision or is an exact undo ──
console.log('\n— law 3: the review screen\'s wiring —');
/** comments out, so a word in a comment is never read as code or as screen text */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1');
/** every call of the identifier `onUpdate` — whatever its first argument is spelled as */
function onUpdateCalls(source) {
  const calls = [];
  const s = code(source);
  for (const m of s.matchAll(/\bonUpdate\s*\(/g)) {
    let i = m.index + m[0].length - 1, depth = 0;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '\'' || c === '"' || c === '`') { const q = c; for (i++; i < s.length && s[i] !== q; i++) if (s[i] === '\\') i++; continue; }
      if (c === '(') depth++;
      else if (c === ')' && --depth === 0) break;
    }
    calls.push({ line: s.slice(0, m.index).split('\n').length, body: s.slice(m.index, i + 1).replace(/\s+/g, ' ') });
  }
  return calls;
}
// Each call must be exactly one of these shapes. A patch literal may appear in a verdict's
// arguments; nothing may map, filter or spread a row inline — that is where a path forgets.
const INLINE = /=>|\.\.\.|\.map\(|\.filter\(/;
const classify = (body) => {
  const v = body.match(/^onUpdate\(file\.id, \(es\) => (?:decideRows|widenRow)\(es, (.*)\)\)$/);
  if (v && !INLINE.test(v[1])) return 'verdict';
  if (body === 'onUpdate(file.id, (es) => [...es, ent])') return 'verdict';
  if (/^onUpdate\(file\.id, \(es\) => (?:restoreRows\(es, (?:\[\w+\]|\w+)\)|withdrawRow\(es, \w+\)|unwidenRow\(es, \w+\))\)$/.test(body)) return 'undo';
  return null;
};
/** every row literal the screen mints by hand carries `decided: true`, and its key comes off the table */
const mintsUndecided = (source) => code(source).split('\n').filter((l) => /prov: 'added by you'/.test(l) && !/decided: true/.test(l));
const mintsByCounter = (source) => code(source).split('\n').filter((l) => /prov: 'added by you'/.test(l) && !/key: mintHandKey\(entities, '[ux]'\)/.test(l));
function audit(source) {
  const calls = onUpdateCalls(source);
  const loose = calls.filter((c) => !classify(c.body));
  // Props declares it, the component destructures it, and every other mention is a call: an
  // alias (`const up = onUpdate`) would route writes past the scan
  const mentions = (code(source).match(/\bonUpdate\b/g) || []).length;
  return { calls, loose, aliased: mentions !== calls.length + 2, undecided: mintsUndecided(source), counter: mintsByCounter(source) };
}
const auditOk = (a) => a.calls.length >= 16 && a.loose.length === 0 && !a.aliased && a.undecided.length === 0 && a.counter.length === 0;
const REVIEW = readFileSync(src('screens', 'Review.tsx'), 'utf8').replace(/\r\n/g, '\n');
/** a copy of Review.tsx with one span replaced — refuses to run if the anchor is gone, so a
 *  CONTROL can never pass by mutating nothing */
const mutate = (source, from, to) => { if (!source.includes(from)) throw new Error(`CONTROL anchor not found in Review.tsx: ${from.slice(0, 80)}`); return source.replace(from, to); };
{
  const a = audit(REVIEW);
  const verdicts = a.calls.filter((c) => classify(c.body) === 'verdict').length;
  const undos = a.calls.filter((c) => classify(c.body) === 'undo').length;
  check(a.calls.length >= 16,
    `the scan finds the screen's onUpdate calls (${a.calls.length}: ${verdicts} verdicts, ${undos} undos) — fewer than 16 means the scan broke, not the code`);
  check(a.loose.length === 0,
    'every onUpdate call records a decision (decideRows, widenRow, or a minted row) or is an exact undo, and none rewrites a row inline',
    a.loose.map((c) => `Review.tsx:${c.line}  ${c.body.slice(0, 120)}`).join('\n          '));
  check(!a.aliased, 'onUpdate is only ever called — never passed on under another name the scan cannot see');
  check(a.undecided.length === 0 && a.counter.length === 0,
    'every row the screen mints by hand carries decided: true and a key read off the table (mintHandKey)',
    [...a.undecided, ...a.counter].map((l) => l.trim().slice(0, 140)).join('\n          '));
  const noReviewed = (source) => !/\breviewed\b/i.test(code(source)) && /\{tallyLine\(tally, suspectsLive\.length\)\}/.test(source);
  check(noReviewed(REVIEW), 'no code on the screen says "reviewed", and the tally renders tallyLine with the model-cleared count');

  // CONTROLS — each recreates code that shipped, or the mutation a reviewer measured green
  const loose1 = audit(mutate(REVIEW, 'onUpdate(file.id, (es) => decideRows(es, [key], patch));',
    'onUpdate(file.id, (es) => es.map((e) => (e.key === key ? { ...e, ...patch } : e)));'));
  check(!auditOk(loose1), 'CONTROL: decide() as it shipped (a bare map over the rows) is caught', loose1.loose.map((c) => `line ${c.line}`).join(', '));
  const drag = audit(mutate(REVIEW, 'onUpdate(file.id, (es) => widenRow(es, e.key, newText, occNew, alone, swallowedKeys, keep));',
    'onUpdate(file.id, (es) => { let next = decideRows(es, [e.key], { text: newText, occ: occNew, status: \'confirmed\' }); if (swallowed.length) next = next.map((x) => (swallowed.some((s) => s.key === x.key) ? { ...x, tag: e.tag, status: \'confirmed\' as const } : x)); return next; });'));
  check(!auditOk(drag), 'CONTROL: a drag that re-tags the swallowed rows with a bare map, beside a decideRows for the widened row, is caught', drag.loose.map((c) => `line ${c.line}`).join(', '));
  const snapUndo = audit(mutate(REVIEW, '() => onUpdate(file.id, (es) => unwidenRow(es, widened)));', '() => onUpdate(file.id, () => before));'));
  check(!auditOk(snapUndo), 'CONTROL: the drag\'s undo as it shipped (the whole table put back from a snapshot) is caught', snapUndo.loose.map((c) => `line ${c.line}`).join(', '));
  const foldUndo = audit(mutate(REVIEW, '() => onUpdate(file.id, (es) => restoreRows(es, [child])));',
    '() => onUpdate(file.id, (es) => restoreRows(es, [{ ...child, decided: true }])));'));
  check(!auditOk(foldUndo), 'CONTROL: a fold undo that restores a doctored snapshot ({ ...child, decided: true }) is caught');
  const groupAll = audit(mutate(REVIEW, "es.filter((e) => e.status === 'pending').forEach((e) => decide(e.key, 'confirm'));",
    "onUpdate(file!.id, (xs) => xs.map((x) => (es.some((y) => y.key === x.key && y.status === 'pending') ? { ...x, dead: false, status: 'confirmed' as const } : x)));"));
  check(!auditOk(groupAll), 'CONTROL: a group "Confirm all" that calls onUpdate(file!.id, …) directly and records nothing is caught');

  // The drag counts a row under Protected terms the way the row is placed — tolerantly, every
  // apostrophe and dash. Counted with the footprint, the only lone "O'Brien" (straight
  // apostrophe) of a protected "O’Brien" widened to "O’Brien Kessler LLP" is found nowhere, the
  // short form keeps no row, and the export holds on a term with no row (F7).
  const TOL = /const tol = e\.cat === 'protected' && !isFloorRow\(e\);\s*const occNew = tol \? protectedMatches\(doc, newText\) : spanMatches\(doc, newText\);[\s\S]{0,200}?const alone = occurrencesOutside\(doc, e\.text, newText, tol\);/;
  const TO = 'O’Brien Kessler LLP signed. Later O\'Brien left.';
  const lone = [occurrencesOutside(TO, 'O’Brien', 'O’Brien Kessler LLP', true), occurrencesOutside(TO, 'O’Brien', 'O’Brien Kessler LLP')];
  check(TOL.test(code(REVIEW)) && lone[0] === 1 && lone[1] === 0,
    'the drag counts a protected row tolerantly, as it is placed: the lone straight-apostrophe "O\'Brien" is found (the footprint count finds none)', `tolerant ${lone[0]} · footprint ${lone[1]}`);
  check(!TOL.test(code(mutate(REVIEW, 'const alone = occurrencesOutside(doc, e.text, newText, tol);', 'const alone = occurrencesOutside(doc, e.text, newText);'))),
    'CONTROL: the drag as it shipped (the footprint count for every row) is caught');
  const alias = audit(mutate(REVIEW, '  const decide = (key: string,', '  const write = onUpdate;\n  const decide = (key: string,'));
  check(!auditOk(alias) && alias.aliased, 'CONTROL: onUpdate passed on under another name is caught');
  const unmarked = audit(mutate(REVIEW, "prov: 'added by you', occ, status: 'confirmed', decided: true", "prov: 'added by you', occ, status: 'confirmed'"));
  check(!auditOk(unmarked), 'CONTROL: a hand-added row minted without decided: true is caught');
  const counter = audit(mutate(REVIEW, "key: mintHandKey(entities, 'u')", "key: 'u' + ++addSeq.current"));
  check(!auditOk(counter), 'CONTROL: the per-mount counter key (\'u\' + ++addSeq.current) is caught');
  check(!noReviewed(mutate(REVIEW, '{tallyLine(tally, suspectsLive.length)}', '{tally.total - tally.waiting} of {tally.total} reviewed')),
    'CONTROL: a tally rendered as "{total - waiting} of {total} reviewed" is caught');
  check(!noReviewed(mutate(REVIEW, '{tallyLine(tally, suspectsLive.length)}', '{reviewedCount} of {entities.length} reviewed')),
    'CONTROL: the tally line that shipped ("{reviewedCount} of {entities.length} reviewed") is caught');
}

// ── LAW 4: the finish gate and button, Export's hold, the redirect and the receipt ──
console.log('\n— law 4: what finishing says —');
const EXPORT = readFileSync(src('screens', 'Export.tsx'), 'utf8').replace(/\r\n/g, '\n');
{
  // The gate: the finish handler returns before onContinue while anything is pending, and
  // onContinue — the call that sets the flag Export and Compare release on — has no other caller.
  // Between the two stands only the refusal over a saved .docx the screen does not show
  // (attest.ts finishHold, held by test/finish-attestation.mjs law 5), written out here in full:
  // it can keep the file from finishing and can do nothing else.
  const HOLD_STEP = /(?:const hold = file \? finishHold\(file, loadPractice\(\), loadProtectedTerms\(\)\) : null;\s*if \(hold\) \{ setHeld\(\{ note: hold, entities \}\); return; \}\s*setHeld\(null\);\s*)?/.source;
  const GATE = new RegExp(/onClick=\{\(\) => \{\s*if \(pendingList\.length > 0\) \{[\s\S]*?\breturn;\s*\}\s*/.source + HOLD_STEP + /onContinue\(\);\s*\}\}/.source);
  const gateOk = (source) => (code(source).match(/\bonContinue\(\)/g) || []).length === 1 && GATE.test(code(source));
  check(gateOk(REVIEW), 'the finish button cannot finish while a row is pending: its handler returns first, and nothing else calls onContinue');
  check(!gateOk(mutate(REVIEW, 'if (pendingList.length > 0) {\n                      // the guided card IS the queue', 'if (false) {\n                      // the guided card IS the queue')),
    'CONTROL: the gate removed (if (pendingList.length > 0) → if (false)) is caught');
  check(!gateOk(mutate(REVIEW, '  const toggle = (key: string) => {', '  const skip = () => onContinue();\n  const toggle = (key: string) => {')),
    'CONTROL: a second road to onContinue is caught');

  // the button's zero-pending branch, as the screen renders it: the title counts the candidates
  // the model judged apart from the ones it gave no class for, and knows a .docx from a text
  const buttonOk = (source) => /pendingList\.length > 0 \? `\$\{pendingList\.length\} pending — review first` : FINISH_LABEL\}/.test(source)
    && /this takes you to the next one` : finishTitle\(tally, judgedLive\.length, unjudgedLive\.length, file\.kind === 'docx'\)\}/.test(source)
    && /const judgedLive = suspectsLive\.filter\(modelJudged\);/.test(source) && /const unjudgedLive = suspectsLive\.filter\(\(s\) => !modelJudged\(s\)\);/.test(source)
    && !/Confirm & finish|Everything reviewed|good to go/i.test(FINISH_LABEL + ' ' + (code(source).match(/<button className=\{pendingList[\s\S]*?<\/button>/)?.[0] ?? ''));
  check(buttonOk(REVIEW), 'with nothing pending the finish button renders FINISH_LABEL and finishTitle(tally, judged count, no-class count, whether it is a .docx)', FINISH_LABEL);
  const FINISH_CALL = ": finishTitle(tally, judgedLive.length, unjudgedLive.length, file.kind === 'docx')}";
  const shippedButton = mutate(mutate(REVIEW, ': FINISH_LABEL}', ": '✓ Confirm & finish review'}"),
    FINISH_CALL, ": 'Everything reviewed — good to go'}");
  check(!buttonOk(shippedButton), 'CONTROL: the button as it shipped ("✓ Confirm & finish review", "Everything reviewed — good to go") is caught');
  check(!buttonOk(mutate(REVIEW, FINISH_CALL, ': finishTitle(tally, suspectsLive.length)}')),
    'CONTROL: the title call as it was (every live candidate counted as judged, nothing said of a .docx save) is caught');

  // The title: an attestation, then counts, and on a .docx, last, the one sentence that says the
  // save runs a check of its own. One appended "every row has been checked" is the whole of the
  // defect, so the title is held to these sentence shapes. A candidate the model gave no class
  // for is counted apart and never called judged (INT-17): an answer outside the grammar, or
  // lib-core's "unclassified", is not a judgment.
  const ATTEST = /^Finishing records that you have read this document(?: and its marks)?\.$/;
  const COUNTS = [
    /^\d+ marks? stands? as (?:it was|they were) made automatically unless you change (?:it|them); you decided \d+\.$/,
    /^You decided all \d+ rows?\.$/,
    /^Nothing is marked on it, so nothing in it will be redacted\.$/,
    /^\d+ candidates? the model judged not identifying stays? readable unless you redact (?:it|them)\.$/,
    /^\d+ candidates? the model gave no class for stays? readable unless you redact (?:it|them)\.$/,
  ];
  const some = decideRows(TABLE, TABLE.slice(0, 3).map((e) => e.key), { dead: false, status: 'confirmed' });
  const all = decideRows(TABLE, TABLE.map((e) => e.key), { dead: false, status: 'confirmed' });
  const titleOk = (fn) => {
    // [rows, judged, given no class, a .docx, what the title must say]
    const cases = [
      [TABLE, 0, 0, false, /\b42 marks stand\b.*you decided 0\b/], [some, 0, 0, false, /\b39 marks stand\b.*you decided 3\b/],
      [all, 0, 0, false, /You decided all 42 rows/], [[], 0, 0, false, /Nothing is marked/], [TABLE, 2, 0, false, /\b2 candidates the model judged/],
      [TABLE, 1, 2, false, /\b1 candidate the model judged not identifying stays\b.*\b2 candidates the model gave no class for stay\b/],
      [TABLE, 0, 1, false, /^(?!.*judged).*\b1 candidate the model gave no class for\b/],
      [TABLE, 1, 0, true, /\bfinal check of its own\b/], [[], 0, 0, true, /\bfinal check of its own\b/],
    ];
    return cases.every(([rows, judged, unanswered, docx, must]) => {
      const title = fn(reviewTally(rows), judged, unanswered, docx);
      const note = docx ? ` ${DOCX_SAVE_NOTE}` : '';
      if (docx ? !title.endsWith(note) : title.includes(DOCX_SAVE_NOTE)) return false;
      const [first, ...rest] = title.slice(0, title.length - note.length).split(/(?<=\.)\s+/);
      return ATTEST.test(first) && rest.every((s) => COUNTS.some((re) => re.test(s))) && must.test(title);
    });
  };
  check(/^Saving the \.docx runs a final check of its own on the file it writes, and holds the save, saying why, if that check fails\.$/.test(DOCX_SAVE_NOTE),
    'the .docx note says the save checks the file it writes and can be held, and says why when it is', DOCX_SAVE_NOTE);
  check(titleOk(finishTitle), 'the title says finishing records your reading, then only counts (marks standing as the machine made them, your decisions, candidates the model judged and candidates it gave no class for, apart), and on a .docx, last, that the save runs a final check of its own',
    finishTitle(reviewTally(TABLE), 1, 2, true));
  check(!titleOk((t, c, u, d) => `${finishTitle(t, c, u, d)} Every row has been checked.`), 'CONTROL: a title that appends "Every row has been checked." is caught');
  check(!titleOk(() => 'Everything reviewed — good to go'), 'CONTROL: the title that shipped ("Everything reviewed — good to go") is caught');
  check(!titleOk((t, c, u) => finishTitle(t, c + u)), 'CONTROL (INT-17): the title as it was, a candidate with no class from the model counted among those it judged not identifying, is caught');
  check(!titleOk((t, c, u) => finishTitle(t, c, u)), 'CONTROL (P23-1): a .docx finish title that says nothing of the save\'s own final check is caught');

  // Export's hold names the real button
  const holdOk = (exportSrc) => {
    const hold = exportSrc.split('\n').find((l) => /hasn’t been reviewed/.test(l)) ?? '';
    return /\{FINISH_LABEL\}/.test(hold) && buttonOk(REVIEW);
  };
  check(holdOk(EXPORT), 'Export\'s unreviewed hold tells the lawyer to press FINISH_LABEL, the label the review screen renders');
  const oldExport = EXPORT.replace(/^.*hasn’t been reviewed.*$/m,
    '        <div className="vrow" style={{ color: \'var(--amber)\' }}>⚠ This document hasn’t been reviewed. Walk the entity table, then confirm with “Looks right — continue”.</div>');
  check(oldExport !== EXPORT && !holdOk(oldExport), 'CONTROL: the hold that shipped ("confirm with “Looks right — continue”", a button that does not exist) is caught');

  // The pending redirect. C and I follow the selection; the toast told the lawyer to press I
  // while a settled row was selected, and I left THAT row readable. The redirect now hands
  // the keys to the card's row when they are not already on it, and names the row.
  const redirectOk = (source) => /const onCard = !!guided && keyTarget === guided\.key && !selHidden;/.test(source)
    && /const next = onCard \? guided! : pendingList\[0\];/.test(source)
    && /if \(!onCard\) setSel\(null\);/.test(source)
    && /starting with “\$\{next\.text\}”\. C confirms it, I leaves it readable\./.test(source)
    && !/Press C to confirm, I to leave readable\./.test(source);
  check(redirectOk(REVIEW), 'the pending redirect hands C and I to the guided card\'s row and names it before telling the lawyer to press them');
  const oldRedirect = REVIEW.replace(/ {22}\/\/ The toast says which keys[\s\S]*?if \(!onCard\) setSel\(null\);\n/, '')
    .replace(/starting with “\$\{next\.text\}”\. C confirms it, I leaves it readable\./, 'Press C to confirm, I to leave readable.');
  check(oldRedirect !== REVIEW && !redirectOk(oldRedirect), 'CONTROL: the redirect that shipped (keys left on the selected row, "Press C to confirm, I to leave readable.") is caught');

  // The receipt line: counts, and never a name, a term or a tag
  const decided = decideRows(TABLE, TABLE.slice(0, 3).map((e) => e.key), { dead: false, status: 'confirmed' });
  const namesNothing = (line, rows, extra = []) => [...rows.flatMap((e) => [e.text, e.tag, ...e.text.split(/\s+/)]), ...extra].filter((s) => s.length > 2 && line.includes(s)).length === 0;
  const line = receiptReviewLine(decided, true, false, [{ text: 'Singapore', verdict: 'place' }]);
  check(namesNothing(line, decided, ['Singapore']), 'the receipt\'s review line names no row, term, tag or candidate', line);
  check(/finished by you — you decided 3 of the 42 rows; 39 stand as marked automatically/.test(line),
    'it states the scope: 3 of 42 decided by you, 39 standing as marked automatically', line);
  const leftClause = (s) => /\b1 candidate the model judged not identifying was left readable without a decision\b/.test(s);
  check(leftClause(line), 'and the model-cleared candidate that went out readable, as a count', line);
  // A candidate the model gave no class for went out readable too, and the receipt counts it
  // apart: "judged not identifying" over an answer outside the grammar states a verdict nobody gave
  const mixed = [{ text: 'Singapore', verdict: 'place' }, { text: 'Kestrel', verdict: 'unclassified' }, { text: 'Osprey', verdict: 'none' }];
  const apart = (s) => /\b1 candidate the model judged not identifying was left readable without a decision; 2 candidates the model gave no class for were left readable without a decision\b/.test(s);
  const mixedLine = receiptReviewLine(decided, true, false, mixed);
  check(apart(mixedLine) && namesNothing(mixedLine, decided, mixed.map((s) => s.text)), 'a candidate the model gave no class for is counted apart from the one it judged, and neither is named', mixedLine);
  check(!apart(receiptReviewLine(decided, true, false, mixed.map((s) => ({ ...s, verdict: 'place' })))),
    'CONTROL (INT-17): the receipt as it was, every live candidate counted as judged not identifying, is caught');
  const none = receiptReviewLine(TABLE, true);
  check(/you decided 0 of the 42 rows; 42 stand as marked automatically/.test(none),
    'a review finished with no decision at all says so on the receipt', none);
  const reopened = receiptReviewLine([{ ...decided[0], status: 'pending', decided: undefined }, ...decided.slice(1)], true);
  check(/1 was still waiting on a decision when this copy was made/.test(reopened), 'a row undone back into the queue after finishing is counted as waiting, not as decided', reopened);
  // CONTROLS: a line that lists rows; the receipt call as it shipped (no candidates passed)
  const naming = `review: finished by you — decided: ${decided.filter((e) => e.decided).map((e) => e.text).join(', ')}`;
  check(!namesNothing(naming, decided), 'CONTROL: a line that lists the decided rows is caught by the name check', naming.slice(0, 120));
  check(!leftClause(receiptReviewLine(decided, true)), 'CONTROL: the receipt called without the candidates says nothing of them, and the check catches it');
  const exportPasses = (s) => /receiptReviewLine\(file\.entities, !!file\.reviewed, !!file\.sample, file\.suspects\)/.test(s);
  check(exportPasses(EXPORT), 'Export hands the receipt line the model-cleared candidates');
  check(!exportPasses(EXPORT.replace('!!file.sample, file.suspects)', '!!file.sample)')), 'CONTROL: the Export call that shipped (no candidates) is caught');

  // What counts as judged is read from the grammar the model answers under: lib-core/anonymize.mjs
  // CLASSIFY_GRAMMAR less the classes that make a row (IDENTITY_CLASSES there, IDENTITY in
  // suspicion.mjs). A class added to the grammar and not here would count a real judgment as "no
  // class"; one here and not in the grammar would call an answer a judgment the model can never give.
  const CORE = readFileSync(join(here, '..', '..', '..', 'lib-core', 'anonymize.mjs'), 'utf8');
  const SUSP = readFileSync(join(here, '..', '..', '..', 'lib-core', 'suspicion.mjs'), 'utf8');
  const clearedOf = (core) => {
    const grammar = [...(core.match(/export const CLASSIFY_GRAMMAR = '([^']*)'/)?.[1] ?? '').matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    const ids = (s, name) => new Set([...(s.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`))?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]));
    const a = ids(core, 'IDENTITY_CLASSES'), b = ids(SUSP, 'IDENTITY');
    if (!grammar.length || !a.size || [...a].sort().join() !== [...b].sort().join()) return null;
    return grammar.filter((g) => !a.has(g)).sort().join();
  };
  const judgedOk = (core, judged) => clearedOf(core) === [...CLEARED_AS].sort().join()
    && ['place', ' Date ', 'generic'].every((v) => judged({ verdict: v }))
    && ['unclassified', 'none', '', undefined, 'person'].every((v) => !judged({ verdict: v }));
  check(judgedOk(CORE, modelJudged), `modelJudged counts as judged exactly the classes the classify grammar allows that make no row (${CLEARED_AS.join(', ')}), and not "unclassified", "none" or an empty answer`);
  const grown = CORE.replace('| "generic"\'', '| "generic" | "product"\'');
  check(grown !== CORE && !judgedOk(grown, modelJudged), 'CONTROL: a grammar that gains a class ("product") the screen does not count is caught');
  check(!judgedOk(CORE, (s) => !!s.verdict), 'CONTROL: every answer with text counted as a judgment, the reading under which "unclassified" was a verdict, is caught');

  // P23-1: no screen shows a .docx as finished without saying the save runs its own final check.
  // Drop's "Reviewed ✓" chip is the other place a finish shows, and its title carries the note.
  const DROP = readFileSync(src('screens', 'Drop.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const CHIP_NOTE = "${f.kind === 'docx' ? ` ${DOCX_SAVE_NOTE}` : ''}`}>Reviewed ✓</span>";
  const chipOk = (s) => s.includes(CHIP_NOTE) && /import \{[^}]*\bDOCX_SAVE_NOTE\b[^}]*\} from '\.\.\/lib\/review';/.test(s);
  check(chipOk(DROP), 'Drop\'s "Reviewed ✓" chip on a .docx says the save runs its own final check');
  const oldChip = DROP.replace("${f.kind === 'docx' ? ` ${DOCX_SAVE_NOTE}` : ''}", '');
  check(oldChip !== DROP && !chipOk(oldChip), 'CONTROL: the chip as it was, with no word of the save\'s own check, is caught');

  // The sample: the same receipt prints "engine: none — the sample's rows are a fixed demo
  // set", so its review line must not credit an engine with the rows
  const SAMPLE_ROWS = [
    { key: 'lim', text: 'Lim Wei Sheng', tag: '[PERSON-1]', cat: 'person', prov: 'both passes', occ: 2, status: 'confirmed' },
    { key: 'low', text: 'wei sheng', tag: '[PERSON-1]', cat: 'person', prov: 'second sweep', occ: 1, status: 'pending' },
  ];
  const sampleOk = (s) => !/engine/i.test(s) && /fixed demo set/.test(s);
  const sampleLine = receiptReviewLine(SAMPLE_ROWS, false, true, [{ text: 'Singapore', verdict: 'place' }]);
  check(sampleOk(sampleLine), 'the sample\'s review line credits the fixed demo set, not an engine', sampleLine);
  check(!sampleOk(receiptReviewLine(SAMPLE_ROWS, false, false)), 'CONTROL: the wording the sample got before ("marked automatically (engine, …)") is caught');

  // Measured, not asserted: another lane owns Compare.tsx and test/compare-refusal.mjs.
  const COMPARE = readFileSync(src('screens', 'Compare.tsx'), 'utf8');
  const cmpHold = COMPARE.split('\n').find((l) => /has not been reviewed —/.test(l)) ?? '';
  console.log(`  NOTE  Compare's hold ${/FINISH_LABEL/.test(cmpHold) ? 'names FINISH_LABEL' : `still names a button this screen does not render: ${(cmpHold.match(/“([^”]+)”/) || [])[1] ?? '(none found)'}`}`);
}

// ── LAW 5: a pending identity row is masked until a human decides it ──
console.log('\n— law 5: pending never means readable —');
{
  const TEXT = 'Margaret Tan wrote to Wei Sheng of Kestrel Pacific about the Force Majeure clause. Wei Sheng replied.';
  WORKER_TABLE = [
    { span: 'Margaret Tan', cls: 'PERSON', src: 'span', tag: '[Person1]' },
    { span: 'Wei Sheng', cls: 'PERSON', src: 'engineB:residue', tag: '[Person2]' },
    { span: 'Kestrel Pacific', cls: 'COMPANY', src: 'b3:caps+freq', tag: '[Company1]' },
    { span: 'Force Majeure', cls: 'COMPANY', src: 'rail:classify', tag: '[Company2]', junkSuspect: true },
  ];
  const o = await stripText(TEXT, () => {});
  const by = (s) => o.entities.find((e) => e.text === s);
  check(by('Wei Sheng').status === 'pending' && !by('Wei Sheng').dead && by('Kestrel Pacific').status === 'pending' && !by('Kestrel Pacific').dead,
    'rows only the second read found (engineB residue, b3) arrive pending and NOT dead', JSON.stringify(o.entities.map((e) => [e.text, e.prov, e.status, !!e.dead])));
  check(by('Force Majeure').status === 'pending' && by('Force Majeure').dead === true,
    'a boilerplate suspect arrives pending and readable — the one pending row that is');
  const pendingIdentity = o.entities.filter((e) => e.status === 'pending' && !e.junk);
  const masked = remask(o.doc, o.entities, PRACTICE).text;
  const readable = pendingIdentity.filter((e) => masked.includes(e.text));
  check(pendingIdentity.length === 2 && readable.length === 0,
    'every pending identity row is MASKED in the export bytes while it waits', masked);
  check(masked.includes('Force Majeure'), 'and the boilerplate suspect is the text it was', masked);

  // Only a decision lifts the mask, and the decision is counted as one.
  const left = decideRows(o.entities, [by('Wei Sheng').key], { dead: true, status: 'ignored' });
  check(remask(o.doc, left, PRACTICE).text.includes('Wei Sheng') && reviewTally(left).decided === 1,
    'leaving it readable is a decision: the name appears, and the tally counts one decided by you');

  // CONTROL: give the pending identity row the boilerplate treatment and it ships readable
  const junked = o.entities.map((e) => (e.text === 'Wei Sheng' ? { ...e, dead: true } : e));
  const junkedOut = remask(o.doc, junked, PRACTICE).text;
  check(junked.filter((e) => e.status === 'pending' && !e.junk).some((e) => junkedOut.includes(e.text)),
    'CONTROL: a pending identity row marked dead is readable in the bytes, so the masking check can fail', junkedOut);

  // The header counts what the bytes do. It said "1 redacted · 3 pending" here, over an
  // export that masked three names.
  const headerOk = (redacted, rows) => {
    const bytes = remask(o.doc, rows, PRACTICE).text;
    return redacted === rows.filter((e) => !bytes.includes(e.text)).length
      && rows.filter((e) => rowIn(e, 'readable')).every((e) => bytes.includes(e.text));
  };
  const head = headLine(o.entities);
  const redacted = Number(head.match(/^(\d+) redacted/)?.[1]);
  check(head === '3 redacted · 1 readable · 3 waiting on you' && headerOk(redacted, o.entities),
    'the header\'s "redacted" is the number of names the export masks, pending ones included; "readable" is what it leaves', head);
  const pillsOk = (source) => /\{headLine\(entities\)\}/.test(source) && /entities\.filter\(\(e\) => rowIn\(e, v\)\)\.length/.test(source) && /\browIn\(e, prov\)/.test(source);
  check(pillsOk(REVIEW), 'the header, the filter pills and the filtered list all count through rowIn');
  // CONTROL: the header's count as it shipped — rows neither pending nor left readable
  const oldRedacted = o.entities.filter((e) => e.status !== 'pending' && !e.dead).length;
  check(!headerOk(oldRedacted, o.entities), `CONTROL: the old count (${oldRedacted} redacted beside 3 masked names) is caught`);
  const oldHeaderSrc = mutate(REVIEW, '<span>{headLine(entities)}</span>',
    "<span>{entities.filter((e) => statusOf(e) === 'confirmed').length} redacted · {pendingList.length} pending</span>");
  check(!pillsOk(oldHeaderSrc), 'CONTROL: the header source as it shipped is caught');
}

// ── LAW 6: the pane marks what the copy masks ──
console.log('\n— law 6: what the pane marks is what the copy masks —');
{
  // placeSpans gives each match to one row, longest first, and skips a shorter row's match that
  // overlaps a longer one's; the export masks that shorter row's words outside the longer match,
  // and the first two words of a name, all the same (engine.ts placements). With "Mrs Margaret
  // Tan" and "Tan Wei Ling" both kept, the copy read "[Person1] [Person2] attended." while the
  // pane showed "Wei Ling" as plain text (owner ruling, 2026-09-23). Three more ways the pane
  // and the copy parted, each measured on the first pass of that fix (2026-09-24): a
  // safety-net match under a row left readable ("Please write to [email] today." drawn with the
  // address as readable text), or across a kept row ("the [Person1] [phone]" drawn as the row
  // over "+65 6123" and "4567" as plain text); and a kept row inside another row's claim ("Lim
  // Wei signed" exports as "[Person1] signed", the pane said the "Wei" went out as [Person2]
  // and a click on it opened a row that decides nothing there). The pane is held to the
  // export's own claims and safety-net matches: every character either masks is marked under
  // the tag it writes there, a click opens a row the table lists under that tag, and nothing
  // else is marked.
  const row = (key, text, tag, extra = {}) => ({ key, text, tag, cat: 'person', prov: 'engine', occ: 1, status: 'confirmed', ...extra });
  const off = { dead: true, status: 'ignored' };
  // a row the lawyer added by hand over a safety-net match and then switched off; the screen
  // re-syncs the pattern rows after each decision (syncFloorRows), so the match has a row of
  // its own — and before that re-sync it has none, which the pane must survive too
  const hand = (text) => ({ key: 'h1', text, tag: '[Person1]', cat: 'person', prov: 'added by you', occ: 1, status: 'confirmed', decided: true });
  const switchedOff = (handText, resync = true) => (text) => {
    const t = decideRows(syncFloorRows(text, [hand(handText)], PRACTICE), ['h1'], off);
    return resync ? syncFloorRows(text, t, PRACTICE) : t;
  };
  // the pattern's own row for each match named, switched off as the lawyer does on the table
  const netOff = (...matches) => (text) => {
    const t = syncFloorRows(text, [], PRACTICE);
    const keys = matches.map((x) => t.find((e) => e.text === x)?.key);
    if (keys.some((k) => !k)) throw new Error(`law 6 setup: the safety net finds no row for ${matches.join(', ')} in "${text}"`);
    return decideRows(t, keys, off);
  };
  const C = (label, text, rows, piece) => [label, text, typeof rows === 'function' ? rows(text) : rows, piece];
  const CASES = [
    C('a shorter name beside a longer one', 'Mrs Margaret Tan Wei Ling attended.', [row('a', 'Mrs Margaret Tan', '[Person1]'), row('b', 'Tan Wei Ling', '[Person2]')], 'Wei Ling'),
    C('the first two words of a name, which no row is', 'Lim Wei Sheng wrote. Lim Wei signed.', [row('a', 'Lim Wei Sheng', '[Person1]')], 'Lim Wei'),
    C('the shorter name left readable', 'Mrs Margaret Tan Wei Ling attended.', [row('a', 'Mrs Margaret Tan', '[Person1]'), row('b', 'Tan Wei Ling', '[Person2]', off)], null),
    // the LONGER row left readable: placeSpans gives the match to it, and what the copy masks
    // is the kept row inside it
    C('the longer name left readable, a kept name inside it', 'Margaret Tan Wei Ling attended.', [row('a', 'Margaret Tan Wei Ling', '[Person1]', off), row('b', 'Margaret Tan', '[Person2]')], 'Margaret Tan'),
    C('the longer name left readable, a kept name at its end', 'Dr Margaret Tan attended.', [row('a', 'Dr Margaret Tan', '[Person1]', off), row('b', 'Margaret Tan', '[Person2]')], 'Margaret Tan'),
    C('the longer name left readable, a kept name in its middle', 'Wei Ling Tan Holdings signed.', [row('a', 'Wei Ling Tan Holdings', '[Company1]', { ...off, cat: 'org' }), row('b', 'Ling Tan', '[Person2]')], 'Ling Tan'),
    C('a kept name inside the first two words of another', 'Lim Wei Sheng wrote. Lim Wei signed.', [row('a', 'Lim Wei Sheng', '[Person1]'), row('b', 'Wei', '[Person2]')], 'Lim Wei'),
    C('an email address under a hand row switched off', 'Please write to kestrel.tan@example.com today.', switchedOff('kestrel.tan@example.com today'), 'kestrel.tan@example.com'),
    C('the same, before the table has a row for the match', 'Please write to kestrel.tan@example.com today.', switchedOff('kestrel.tan@example.com today', false), 'kestrel.tan@example.com'),
    C('an NRIC under a hand row switched off', 'The claimant, NRIC S1234567D, attended.', switchedOff('NRIC S1234567D'), 'S1234567D'),
    C('an SSN under a hand row switched off', 'The claimant, SSN 123-45-6789, attended.', switchedOff('SSN 123-45-6789'), '123-45-6789'),
    C('a phone number across a hand row switched off', 'Call the hotline on +65 6123 4567 today.', switchedOff('hotline on +65 6123'), '+65 6123 4567'),
    C('a phone number across a kept row', 'Call the hotline on +65 6123 4567 today.', (t) => syncFloorRows(t, [row('h', 'hotline on +65 6123', '[Person1]')], PRACTICE), '+65 6123 4567'),
    // the safety-net row itself switched off: the copy leaves the match readable (the export
    // marks it exempt), and a pane that drew it masked would tell the lawyer an identity number
    // is hidden that the copy ships
    C('an NRIC whose safety-net row the lawyer switched off', 'The claimant, NRIC S1234567D, attended.', netOff('S1234567D'), null),
    C('an email address whose safety-net row is switched off, a telephone number beside it kept', 'Write to kestrel.tan@example.com or call +65 6123 4567 today.', netOff('kestrel.tan@example.com'), '+65 6123 4567'),
    // two pieces side by side, each its own row's: a signature line that lost its break, read
    // whole as one name and switched off, with the name and the number in it each masked; and
    // two safety-net matches run together before the table has rows for them. Drawn as one
    // piece, the number would be shown going out as the name's tag, and a click on it would open
    // the name's row, which decides nothing there
    C('a name and a telephone number run together, under a row switched off', 'Regards, Margaret Tan+65 6123 4567', (t) => syncFloorRows(t, [row('a', 'Margaret Tan+65 6123 4567', '[Person1]', off), row('b', 'Margaret Tan', '[Person2]')], PRACTICE), 'Margaret Tan+65 6123 4567'),
    C('an email address and a telephone number run together, before the table has rows for them', 'Write to kestrel@example.com+1 212 555 0100 now.', [], 'kestrel@example.com+1 212 555 0100'),
    // two matches of one pattern, each its own row under the one tag the pattern writes: a
    // click on either opens the row that decides it
    C('two telephone numbers, each its own safety-net row', 'Call 212 555 0100 or 646 555 0199 today.', (t) => syncFloorRows(t, [], PRACTICE), '646 555 0199'),
    // a switched-off row listed before a kept one of the same name and tag: the click opens the
    // kept row, which masks the piece. Opened on the switched-off one, the table would tell the
    // lawyer "left readable" over a name the copy masks, and a restore there would do nothing;
    // with the pane's find reading switched-off rows too, every other case here passed
    C('a shorter name beside a longer one, a switched-off twin of it listed first', 'Mrs Margaret Tan Wei Ling attended.', [row('b0', 'Tan Wei Ling', '[Person2]', off), row('a', 'Mrs Margaret Tan', '[Person1]'), row('b', 'Tan Wei Ling', '[Person2]')], 'Wei Ling'),
  ];
  /** each character's tag as the pane marks it: a kept row's part under its row's tag, a piece
   *  under the tag the export writes there; '' for neither */
  const marked = (text, parts) => {
    const m = Array(text.length).fill('');
    for (const p of parts) { const t = p.e && !p.e.dead ? p.e.tag : p.pc ? p.pc.tag : ''; for (let i = p.start; i < p.end; i++) m[i] = t; }
    return m.join('|');
  };
  /** and as the export masks it: its claims, then each safety-net match it does not exempt */
  const masked = (text, rm) => {
    const m = Array(text.length).fill('');
    for (const c of rm.claims) for (let i = c.s; i < c.e; i++) m[i] = c.tag;
    for (const h of rm.floorHits) if (!h.exempt) for (let i = h.s; i < h.e; i++) m[i] = h.tag;
    return m.join('|');
  };
  /** a click on a piece opens a row the table lists, left on, under the tag the copy writes
   *  there, and for a safety-net match the row of that match — every match of one pattern is
   *  under one tag, so the tag alone let a click on the second of two telephone numbers open the
   *  first one's row (P2T6-7); a cut kept part widens from the whole part as placed, never from
   *  a piece of it */
  const rowsOk = (text, rows, parts) => {
    const placed = placeSpans(text, rows);
    const lower = (s) => s.trim().toLowerCase();
    return parts.every((p) => (!p.pc || !p.pc.row || (rows.includes(p.pc.row) && !p.pc.row.dead && p.pc.row.tag === p.pc.tag && (!p.pc.floor || lower(p.pc.row.text).includes(lower(p.t)))))
      && (!p.span || placed.some((q) => q.e === p.e && q.start === p.span[0] && q.end === p.span[1] && q.start <= p.start && p.end <= q.end)));
  };
  const caseOk = (pane, [, text, rows]) => {
    const rm = remask(text, rows, PRACTICE);
    if (rm.divergence || !rm.claims) return false;
    const parts = pane(text, rows, rm);
    return parts.map((p) => p.t).join('') === text && marked(text, parts) === masked(text, rm) && rowsOk(text, rows, parts);
  };
  const caught = (pane) => CASES.filter((c) => !caseOk(pane, c)).map((c) => c[0]);
  const LIVE = (text, rows, rm) => withMaskedPieces(text, placeSpans(text, rows), rm.claims, rows, rm.floorHits);
  check(caught(LIVE).length === 0,
    `every stretch the export masks is marked in the pane under the tag it writes there, a click opens that row, and nothing it leaves readable is marked: ${CASES.length} cases`,
    [...caught(LIVE).map((l) => `WRONG: ${l}`), ...CASES.filter((c) => c[3]).map(([, text, rows, piece]) => `"${piece}" → ${remask(text, rows, PRACTICE).text}`)].join('\n          '));
  // every case below is a way the pane stated something the copy does not carry, each against
  // the pane as it was or with one rule of withMaskedPieces taken out
  const reviewWith = async (x, y) => {
    const f = join(dir, `review-law6-${reviewWith.n = (reviewWith.n ?? 0) + 1}.mjs`);
    await build({ entryPoints: [src('lib', 'review.ts')], bundle: true, platform: 'node', format: 'esm', outfile: f, logLevel: 'silent',
      plugins: [{ name: 'law6', setup(b) {
        b.onLoad({ filter: /[\\/]review\.ts$/ }, (a) => {
          const c = readFileSync(a.path, 'utf8').replace(/\r\n/g, '\n');
          if (c.split(x).length !== 2) throw new Error(`CONTROL anchor not found once in review.ts: ${x.slice(0, 80)}`);
          return { contents: c.replace(x, () => y), loader: 'ts', resolveDir: join(a.path, '..') };
        });
      } }] });
    const w = (await import(url(f))).withMaskedPieces;
    return (text, rows, rm) => w(text, placeSpans(text, rows), rm.claims, rows, rm.floorHits);
  };
  const CONTROLS = [
    ['the pane as it was before owner ruling 4 (placeSpans alone)', (text, rows) => placeSpans(text, rows),
      ['a shorter name beside a longer one', 'the first two words of a name, which no row is', 'an email address under a hand row switched off', 'a phone number across a kept row']],
    ['the pane given the claims and not the safety-net matches (the first pass)', (text, rows, rm) => withMaskedPieces(text, placeSpans(text, rows), rm.claims, rows),
      ['an email address under a hand row switched off', 'the same, before the table has a row for the match', 'an NRIC under a hand row switched off', 'an SSN under a hand row switched off', 'a phone number across a hand row switched off', 'a phone number across a kept row']],
    ['a kept row\'s part drawn whole whatever the export writes inside it (the first pass)', await reviewWith('    if (!cut) { out.push(part); continue; }', '    if (!cut || kept) { out.push(part); continue; }'),
      ['a kept name inside the first two words of another', 'a phone number across a kept row']],
    ['a switched-off row\'s part drawn whole, as readable', await reviewWith('    if (!cut) { out.push(part); continue; }', '    if (!cut || part.e?.dead) { out.push(part); continue; }'),
      ['the longer name left readable, a kept name inside it', 'the longer name left readable, a kept name at its end', 'the longer name left readable, a kept name in its middle', 'an email address under a hand row switched off', 'a phone number across a hand row switched off']],
    ['the space a cut claim leaves drawn as the row', await reviewWith("cls(i) ?? (kept && !at[i] ? 'plain' : 'own')", "cls(i) ?? 'own'"),
      ['a phone number across a kept row']],
    ['a cut part widened from its own piece', await reviewWith('span: [part.start, part.end] as [number, number]', 'span: [s, e] as [number, number]'),
      ['a phone number across a kept row']],
    ['a safety-net match the lawyer switched off drawn as masked', await reviewWith('    if (h.exempt) continue;\n', ''),
      ['an NRIC whose safety-net row the lawyer switched off', 'an email address whose safety-net row is switched off, a telephone number beside it kept']],
    ['two pieces of different rows side by side joined into one', await reviewWith('if (last?.pc && last.end === s && keyOf.get(last) === m.key) {', 'if (last?.pc && last.end === s) {'),
      ['a name and a telephone number run together, under a row switched off', 'an email address and a telephone number run together, before the table has rows for them']],
    ['two safety-net matches of one tag read as one row', await reviewWith('const key = `f\\u0000${h.tag}\\u0000${lower(h.text)}`;', 'const key = `f\\u0000${h.tag}`;'),
      ['two telephone numbers, each its own safety-net row']],
    ['a piece opening the first row of its name and tag, switched off or not', await reviewWith('entities.find((x) => !x.dead && x.text === c.row && x.tag === c.tag)', 'entities.find((x) => x.text === c.row && x.tag === c.tag)'),
      ['a shorter name beside a longer one, a switched-off twin of it listed first']],
  ];
  for (const [what, pane, must] of CONTROLS) {
    const got = caught(pane);
    const missed = must.filter((l) => !got.includes(l));
    check(got.length > 0 && missed.length === 0, `CONTROL: ${what} is caught`, `caught by: ${got.join('; ') || 'nothing'}${missed.length ? ` · NOT caught by: ${missed.join('; ')}` : ''}`);
  }
  // under a divergence there are no claims to read, and the pane adds nothing it would have to
  // guess — not even from the safety-net matches, which a divergence also empties
  const [, t0, r0] = CASES[0];
  const [, t1, r1] = CASES.find((c) => c[0] === 'a phone number across a kept row');
  check(withMaskedPieces(t0, placeSpans(t0, r0), undefined, r0).every((p) => !p.pc)
    && withMaskedPieces(t1, placeSpans(t1, r1), undefined, r1, remask(t1, r1, PRACTICE).floorHits).every((p) => !p.pc && !p.span),
    'with no claims (a divergence) the pane adds no piece');

  // Review.tsx hands the pane the export's own claims and safety-net matches, draws a piece as
  // its row's, with no drag handle, and a click on it opens the row that masks it; a cut kept
  // part's handles widen the whole part
  const wiredOk = (s) => /claims=\{rm && !rm\.divergence \? rm\.claims : undefined\} floorHits=\{rm && !rm\.divergence \? rm\.floorHits : undefined\}/.test(s)
    && /withMaskedPieces\(text, placeSpans\(text, entities, ghosts\), claims, entities, floorHits\)/.test(s)
    && /\) : p\.pc \? \(\s*(?:\/\/[^\n]*\n\s*)*<span key=\{i\} data-o=\{p\.start\} data-piece=""/.test(s)
    && /onClick=\{\(\) => p\.pc!\.row && onPick\(p\.pc!\.row\.key\)\}>\{p\.t\}<\/span>\s*\) : p\.g \?/.test(s)
    && ['l', 'r'].every((side) => new RegExp(`onDragEdge\\(p\\.e!, '${side}', p\\.span\\?\\.\\[0\\] \\?\\? p\\.start, p\\.span\\?\\.\\[1\\] \\?\\? p\\.end, ev\\)`).test(s))
    && (s.match(/onDragEdge\(p\.e!, '[lr]', /g) ?? []).length === 2;
  check(wiredOk(REVIEW), 'Review.tsx gives the pane the export\'s claims and safety-net matches, draws each piece, a click on one opens the row that masks it, and a drag widens the whole part');
  check(!wiredOk(mutate(REVIEW, 'withMaskedPieces(text, placeSpans(text, entities, ghosts), claims, entities, floorHits)', 'placeSpans(text, entities, ghosts)')), 'CONTROL: the pane wired as it was (placeSpans alone) is caught');
  check(!wiredOk(mutate(REVIEW, 'claims={rm && !rm.divergence ? rm.claims : undefined}', '')), 'CONTROL: the pane given no claims is caught');
  check(!wiredOk(mutate(REVIEW, ' floorHits={rm && !rm.divergence ? rm.floorHits : undefined}', '')), 'CONTROL: the pane given no safety-net matches (the first pass) is caught');
  check(!wiredOk(mutate(REVIEW, "onDragEdge(p.e!, 'r', p.span?.[0] ?? p.start, p.span?.[1] ?? p.end, ev)", "onDragEdge(p.e!, 'r', p.start, p.end, ev)")), 'CONTROL: a handle that widens from its piece\'s own offsets is caught');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
