// What finishing a review attests to, and whether a later change still stands inside it.
// Pure — no React — so test/finish-attestation.mjs can drive it with the real remask.
//
// Pressing finish is the lawyer's attestation over the export as it stood at that moment:
// these words go out readable, everything else goes out masked. Export, Compare and the
// receipt all release on it. While nothing after the press could take it back, three things
// broke it:
//   · U on another file's review ran this file's last undo, and a hand-added client name
//     left a finished file readable with verification green (the name was no longer a
//     listed span, so nothing could see it);
//   · a Settings practice change dropped the SSN rule's rows, and an SSN the lawyer had seen
//     masked went out readable under "finished by you";
//   · any row changed after finishing — left visible, withdrawn — kept the flag.
//
// The rule: a change that can only mask MORE leaves the finish standing. Export's own "Mask
// it in this document" button is such a change, and a rule that bounced the lawyer back to
// Review for pressing it would teach them to stop pressing it. A change that leaves ANYTHING
// readable that was masked when they finished takes the finish off, and the Review screen
// says what. Which of the two a change is gets MEASURED on the export itself, never guessed
// from the kind of action: adding a row can unmask text (longest-first claiming drops a
// shorter row that overlapped it — "Seng Holdings Pte" loses "Pte" to a longer "Lim Bo Seng
// Holdings"), and removing one can unmask nothing.
//
// "The export" is every text the lawyer can send: the copied text and the .txt, and for a
// .docx every flow the writer masks — the body under the writer's own table among them — and
// every text the saved .docx carries outside its flows, which the writer masks in place,
// renames with a style, or ships as written unless the mask places in it (docxMarks). The
// record measured the document of record alone until 2026-09-23, and a .docx's headers,
// footers and footnotes are not in it (store.ts keeps the main flow only): an SSN in a running
// header, masked under United States when the lawyer finished, shipped readable in the saved
// .docx after a switch to Singapore, under "finished by you", with every check green — the
// header has no row, so nothing at Export could see it.
//
// Every flow of a .docx is measured as the WRITER saves it, never as the walker reads the file
// dropped: the writer places the table over the flow's record (hidden runs and the results of
// the fields it removes — AUTHOR, FILENAME, DOCPROPERTY… — still in it), keeps the stretches
// that ship, and masks once more where removing the rest joined what the record kept apart
// (docxWrite placeFlow). Measured any other way the record and the saved file disagree both
// ways: read as the file was dropped, a DOCPROPERTY result the writer removes was named as
// readable in a header that did not carry it; read as the flow the writer masked while it
// stripped first, a finish came off over "John Smith" in a body where the writer, placing the
// confirmed "John Michael Smith" over the record, writes [Person1] (2026-09-23).
//
// And a finish is refused, with the reason, while the saved body would show readable what the
// Review screen masks (finishHold): the screen shows the document of record, and pressing
// finish must not attest to a .docx the lawyer cannot see.
import { foldFullwidth, footprintRegex } from '../../../../lib-core/anonymize.mjs';
import { remask, syncFloorRows, docxMaskTable, isFloorRow, protectedRegex, protectedMatches, protectedSpans, footprintSpans, floorCuts, docxMaskNames, type Remask } from './engine';
import { flowLayout, readZip, walkPart, flowText, RULES, type WalkItem } from './extract/docx';
import { sideRowsOf, BODY_WHERE } from './side';
// The writer's own readings of a name and its tables of what it masks in place, renames or
// never reads. A reading the writer takes and the record does not is a name the record lets
// through once the list is emptied, so there is one of each, the writer's: while they were
// copied here, test/finish-attestation.mjs had to hold 36 copies to its source line for line.
import {
  writeRedactedDocx, ATTR_MASK, BUILTIN_STYLE, countsInIdent, ELEM_MASK, EMAILISH, FORMULA_TAGS, identReadings, idOfName, joinedInstructions,
  KEEP_FIELD, MACHINE, NEUTRAL_IDENT, NEUTRAL_NAME, NEUTRAL_REF, numericForm, REF_JOIN, refKind, refNames, refWords, STANDARD_FONT, STYLE_REFS, styleAttr,
  SYNTAX_ATTR, VOCAB, WORD_BOOKMARK, savedFlowText, unknownPartValues, netName, pctDecoded, formatRuns, mathZones, zoneText, zoneRead, styleFloor, NUMBER_FORMAT, refSpans, refFind, KNOWN_NS, schemaRest, OWN_MEDIA, fontScript,
  MC_NS, MC_LISTS, LAYOUT_RE, MEDIA_RE, R_ATTRS, nsOfName, attrNet, pctHidden, hasEscape, GUID_VALUE, mediaRest,
  allOf, SHORT_DIGITS, REF_ESCAPE, elemNet, officeMeasure,
  type FormatRun, type FlowPiece, type MaskFn, type RefName, type WriterFlow,
} from './extract/docxWrite';
import type { Practice } from './practice';
import type { Entity, QFile } from './store';

const fold = (s: string): string => foldFullwidth(s) as string;
// a letter drawn in a circle or a square ("Ⓜⓐⓡⓖⓐⓡⓔⓣ", "🄼🄰🅁🄶", "🅜🅐🅡🅖") is a symbol to Unicode,
// and the writer reads it as the letter it draws (docxWrite symbolRead, WL-6): counted as no
// word here, a listed name written in them in a header shipped once the list was emptied and the
// finish stood (SEAM-F3). The ranges are symbolRead's.
const WORD_RE = /[\p{L}\p{N}\u24B6-\u24E9\u{1F130}-\u{1F149}\u{1F150}-\u{1F169}\u{1F170}-\u{1F189}]+/gu;
const HAS_WORD = /[\p{L}\p{N}\u24B6-\u24E9\u{1F130}-\u{1F149}\u{1F150}-\u{1F169}\u{1F170}-\u{1F189}]/u;
/** a bracketed token short enough to be a tag; stripped only when it IS one of the tags the
 *  export writes (readableWords) */
const TAG_SHAPED = /\[[^[\]\n]{1,60}\]/g;

/** remask, remembered per table and text. A recheck costs one remask of the whole document —
 *  measured 200–330 ms on a 61,432-word opinion with 100–600 rows, and 0.5–1.2 s on a dense
 *  synthetic 60k-word one (8,571 placements) — against a few ms for everything else it does,
 *  and the Review screen renders the same table through remask straight after. Keyed on the
 *  table array itself, which the app never mutates (every write makes a new one), then on the
 *  text (a .docx is measured over several flows with one table), and checked against the
 *  practice, so a practice change never reads a stale export. The table write, the recheck,
 *  the finish and Review's live preview all go through here, and whichever runs first pays
 *  for the others. */
const exports = new WeakMap<Entity[], Map<string, { practice: Practice; r: Remask }>>();
export function exportOf(text: string, entities: Entity[], practice: Practice): Remask {
  let byText = exports.get(entities);
  const hit = byText?.get(text);
  if (hit && hit.practice === practice) return hit.r;
  const r = remask(text, entities, practice);
  if (!byText) exports.set(entities, (byText = new Map()));
  byText.set(text, { practice, r });
  return r;
}

/** Does the table already carry exactly the floor rows this export calls for — the check
 *  syncFloorRows makes before it returns the table unchanged, read off an export already
 *  made? One row per distinct floor text (trimmed, lowercased — engine.ts floorKey), with
 *  the hit count and the tag. */
function floorRowsInStep(r: Remask, entities: Entity[]): boolean {
  const want = new Map<string, { tag: string; occ: number }>();
  for (const h of r.floorHits) {
    const k = h.text.trim().toLowerCase();
    const w = want.get(k);
    if (w) w.occ++;
    else want.set(k, { tag: h.tag, occ: 1 });
  }
  const seen = new Set<string>();
  for (const e of entities) {
    if (!isFloorRow(e)) continue;
    const k = e.text.trim().toLowerCase();
    const w = want.get(k);
    if (!w || e.occ !== w.occ || e.tag !== w.tag) return false;
    seen.add(k);
  }
  return seen.size === want.size;
}

/** syncFloorRows, without the remasks it and the recheck used to repeat. syncFloorRows runs a
 *  remask of its own, and the recheck then ran another over the same table: a practice change
 *  with five finished dense 60k-word files open took 4.0–4.6 s in one synchronous update
 *  (11.7 s on the reviewer's run), against 1.5–2.0 s before the recheck existed. Here the
 *  export is made once, through exportOf, and the table comes back as the same array whenever
 *  its floor rows already match — which is what syncFloorRows itself would return: 2.1–2.4 s
 *  for the five. When they do not match, syncFloorRows runs as it always did, with its own
 *  remask (engine.ts takes no export in: 4.3 s for five files whose SSN rows change), and the
 *  export already made is remembered for the table it returns, because it IS that table's
 *  export: remask reads a floor row only for its `dead` flag (the exemption), and
 *  syncFloorRows keeps every flag, adds live rows, and drops only rows whose text the floor
 *  no longer reaches. So the recheck and Review's preview read that one export.
 *  test/finish-attestation.mjs holds both claims: the same answer as syncFloorRows, and the
 *  remembered export equal to a fresh remask of the synced table. */
export function withFloorRows(text: string, entities: Entity[], practice: Practice): Entity[] {
  const r = exportOf(text, entities, practice);
  if (r.divergence || floorRowsInStep(r, entities)) return entities;
  const synced = syncFloorRows(text, entities, practice);
  if (synced !== entities && !exports.has(synced)) exports.set(synced, new Map([[text, { practice, r }]]));
  return synced;
}

/** every word the bytes leave readable, with how many times it appears. `tags` are the tags
 *  this export (and the one it is compared with) can write — the tables' own tags and the
 *  floor's — and only those are taken out first. A pattern for "what a tag looks like" was
 *  used until 2026-09-23 and required a digit: the frozen service writes [Date], [Code],
 *  [Dem], [Place] and [X], so "Redact again" on a date counted a new word "Date", took the
 *  finish off and told the lawyer "Date" had been left readable. */
export function readableWords(bytes: string, tags: ReadonlySet<string>): Map<string, number> {
  const m = new Map<string, number>();
  const plain = tags.size ? bytes.replace(TAG_SHAPED, (t) => (tags.has(t) ? ' ' : t)) : bytes;
  for (const w of plain.match(WORD_RE) ?? []) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

export type Range = [number, number];

/** the original-text ranges the export replaced — the table's placements and the floor's
 *  non-exempt hits — sorted and merged. Null when remask's accounting diverged from the
 *  frozen core, because its offsets are then empty rather than true. */
function hiddenRanges(r: Remask): Range[] | null {
  if (r.divergence) return null;
  const rs: Range[] = [];
  for (const p of r.placements) rs.push([p.s, p.e]);
  for (const h of r.floorHits) if (!h.exempt && h.s >= 0 && h.e > h.s) rs.push([h.s, h.e]);
  return merged(rs);
}

/** ranges sorted and merged where they touch or overlap */
function merged(rs: Range[]): Range[] {
  rs.sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const [s, e] of rs) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** the parts of `was` that `now` does not cover — both sorted and merged */
function uncovered(was: Range[], now: Range[]): Range[] {
  const out: Range[] = [];
  let j = 0;
  for (const [s0, e] of was) {
    let s = s0;
    while (j < now.length && now[j][1] <= s) j++;
    for (let k = j; k < now.length && now[k][0] < e; k++) {
      if (now[k][0] > s) out.push([s, now[k][0]]);
      s = Math.max(s, now[k][1]);
      if (s >= e) break;
    }
    if (s < e) out.push([s, e]);
  }
  return out;
}

/** One text as the export masks it: the bytes, where in the text the masks sat, and the tags
 *  that export can write. */
interface Measure {
  text: string; bytes: string; hidden: Range[] | null; tags: string[];
  /** a saved .docx flow (measureFlow): the stretches of `text` the saved file keeps, tags and
   *  all — what does not ship lies between them, and is quoted as the saved file reads it */
  ships?: Range[];
  /** the writer wrote over a name run together with what the mask makes of the name alone, and
   *  that left a word of it readable (a name alone that masks as "[Org1] Fund"): the stretch is
   *  in `hidden` and a word of it ships, so the words are counted as well (compare) */
  loose?: boolean;
  /** why this flow could not be measured as the writer saves it, when that leaves part of what
   *  the writer masks unmeasured (an equation over a flow this could not rebuild): a record
   *  with one fails closed (exposedSince) */
  unsure?: string;
  /** a saved .docx flow the writer's gate holds the save on (heldIn): the name, and the
   *  stretch of the saved flow the escape stands in, as the note quotes it */
  held?: { name: RefName; shown: string };
}

/** Stretches of `text` as the lawyer is shown them: only spacing and list punctuation come off
 *  the ends, so a US number reads "(415) 555-0173" and never the unbalanced "415) 555-0173";
 *  each text once. With `ships`, stretches with nothing between them that ships — only what the
 *  writer takes out — are one quote, because they are one in the saved file: "John " and
 *  "Smith" either side of a hidden "Michael " read "John Smith" there. */
function quoted(text: string, rs: Range[], ships?: Range[]): string[] {
  const runs: string[] = [];
  let cur = '', end = -1, j = 0;
  for (const [s, e] of rs) {
    let joined = false;
    if (ships && end >= 0) {
      while (j < ships.length && ships[j][1] <= end) j++;
      // a line break or a tab between them is the spacing between runs, which ships
      joined = s === end || (!(j < ships.length && ships[j][0] < s) && !/[\n\t]/.test(text.slice(end, s)));
    }
    if (joined) cur += text.slice(s, e);
    else { if (end >= 0) runs.push(cur); cur = text.slice(s, e); }
    end = e;
  }
  if (end >= 0) runs.push(cur);
  const out: string[] = [];
  for (const r of runs) {
    const t = r.replace(/^[\s,;:]+|[\s,;:]+$/g, '');
    if (HAS_WORD.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

function measure(text: string, table: Entity[], practice: Practice): Measure {
  const r = exportOf(text, table, practice);
  const tags = new Set<string>();
  for (const e of table) tags.add(e.tag);
  for (const h of r.floorHits) tags.add(h.tag);
  return { text, bytes: r.text, hidden: hiddenRanges(r), tags: [...tags] };
}

/** What became readable between two measures of one text: `spans` are stretches of the text
 *  that were masked and are not now (null offsets on either side leave them empty), `words`
 *  the words the bytes now carry more often than they did. Counts, not presence: a withdrawn
 *  "Anna Kowalczyk" whose two words stand readable elsewhere changes no word's presence.
 *
 *  With offsets on both sides the spans decide alone, because a tag written inside a word
 *  makes a new word of what is left of it: "KestrelHoldings" with a row "Kestrel" added reads
 *  "[Person2]Holdings", and counted by its words that change — which only masks more — took the
 *  finish off and told the lawyer "Holdings" had been masked when they finished (P2-4). The
 *  words are counted only where the offsets cannot say it all: no offsets on a side, or a name
 *  written over with a replacement that keeps a word of it (`loose`). */
function compare(was: Measure, now: Measure): { spans: string[]; words: string[] } {
  const spans = was.hidden && now.hidden ? quoted(now.text, uncovered(was.hidden, now.hidden), now.ships) : [];
  if (was.hidden && now.hidden && !was.loose && !now.loose) return { spans, words: [] };
  const tags = new Set([...was.tags, ...now.tags]);
  const before = readableWords(was.bytes, tags);
  const words: string[] = [];
  for (const [w, n] of readableWords(now.bytes, tags)) if ((before.get(w) ?? 0) < n) words.push(w);
  return { spans, words };
}

/** The .docx parts the writer masks and the document of record leaves out, as the lawyer
 *  would name them. Comments, properties, alt-text, links, controls and the rest are removed
 *  or blanked by the writer whatever the table says, so no change to the table can make
 *  them readable. */
const WHERE: Record<string, string> = { header: 'a header', footer: 'a footer', footnote: 'the footnotes', endnote: 'the endnotes', chart: 'a chart', diagram: 'a diagram' };

/** where the writer's body flow is said to be — the one flow the document of record is not,
 *  and the one lib/side.ts does not send to the engine a second time */
const BODY = BODY_WHERE;

/** `side`: the names the engine's separate read of the text outside the body found only there
 *  (lib/side.ts), which the writer masks with besides the table (docxMaskTable) */
type DocxFields = Pick<QFile, 'kind' | 'docx' | 'docxMarks'> & Partial<Pick<QFile, 'side'>>;

/** the .docx's texts as read at the drop; empty for any other file, and for a .docx whose
 *  texts could not be read (the record is then `unread` and fails closed) */
const marksOf = (f: DocxFields): DocxMark[] => (f.kind === 'docx' && Array.isArray(f.docxMarks) ? (f.docxMarks as DocxMark[]) : []);
/** what the .docx carries outside its flows: every mark but the flows themselves */
const outsideOf = (marks: DocxMark[]): DocxMark[] => marks.filter((m) => m.kind !== 'flow');

/** Every flow of a .docx the writer masks besides its body, as the writer saves it (docxMarks
 *  reads them from the writer): each header, footer, footnote, endnote, chart and diagram part
 *  as its record and the stretches of it that ship, and each chart value in its numeric form.
 *  Read from the file as dropped until 2026-09-23, with the results of the fields the writer
 *  removes still in them: a DOCPROPERTY "Margaret Tan" in a header took a finish off over a
 *  name the saved header never carried. */
export function docxFlows(f: DocxFields): DocxMark[] {
  return marksOf(f).filter((m) => m.kind === 'flow' && m.where !== BODY);
}

/** the body flow the writer masks, when the .docx has one to save */
const writerBody = (f: DocxFields): DocxMark | undefined => marksOf(f).find((m) => m.kind === 'flow' && m.where === BODY);

/** Does the saved flow carry its record whole — no hidden run, no removed field's result taken
 *  out of it? Then the writer places the table over the record and saves exactly that, and
 *  the flow is the record's export (docxWrite placeFlow skips its second pass on the same
 *  test). Remembered per mark: the marks never change after the drop. */
const wholeMemo = new WeakMap<DocxMark, boolean>();
function keptWhole(m: DocxMark): boolean {
  if (!m.pieces) return true;
  let w = wholeMemo.get(m);
  if (w === undefined) {
    w = fold(flowLayout(m.pieces.map((p) => ({ text: m.text.slice(p.s, p.e), pre: p.pre, para: p.para }))).text) === m.text;
    wholeMemo.set(m, w);
  }
  return w;
}

/** One flow of the saved .docx, measured as the writer saves it under `table`: through the
 *  writer's own placement (docxWrite savedFlowText), which places the table over the flow's
 *  record, writes it into the stretches that ship, masks the result once more where taking the
 *  rest out joined what the record kept apart, and last writes over each of the table's names
 *  it finds run together with what stands beside it. `names` are the ones the writer is handed
 *  (namesOf): measured without them until this round, "KestrelHoldings" in a body counted as
 *  readable at finish while the saved .docx masked it, and taking the term off the list left
 *  the finish standing while the saved file shipped it. `text` is the record and `bytes` the
 *  saved flow; `hidden` is every stretch of the record the saved flow does not carry readable,
 *  so a stretch is compared at its place in the record as the text export's are. A mark read
 *  before the writer placed over the record (no `pieces`) is the flow the writer masked, and is
 *  measured as the text export is. `record`: a table known to place over the record exactly
 *  as `table` does (savedBody), whose remask is already made — the first pass reads it.
 *
 *  Then each equation, as docxWrite maskMath masks it after placeFlow (maskEquations): what
 *  it covers is in `hidden` and what it writes in `bytes`, so an equation is measured where it
 *  stands in the flow, one account with the flow's own. */
function measureFlow(m: DocxMark, table: Entity[], practice: Practice, names: RefName[], record?: Entity[]): Measure {
  if (!m.pieces) return measure(m.text, table, practice);
  const calls: MaskCall[] = [];
  const ask = (text: string) => exportOf(text, record && text === m.text ? record : table, practice);
  const mask: MaskFn = Object.assign((text: string) => { const r = ask(text); calls.push({ text, r }); return r; }, { names: names.map((n) => n.name) });
  const bytes = savedFlowText({ part: m.part, kind: '', record: m.text, pieces: m.pieces }, mask);
  const tags = new Set<string>();
  for (const e of table) tags.add(e.tag);
  for (const c of calls) for (const h of c.r.floorHits) tags.add(h.tag);
  // a flow the mask cannot certify is one the writer holds the file on: nothing of it ships,
  // and it is compared by the words of what the mask made of it
  if (bytes === null) return { text: m.text, bytes: calls[calls.length - 1]?.r.text ?? m.text, hidden: null, tags: [...tags] };
  const saved = savedHidden(m, calls, names, bytes, ask);
  for (const t of saved.tags) tags.add(t);
  const held = heldIn(saved.bytes, [...tags], names);
  return {
    text: m.text, bytes: saved.bytes, hidden: saved.hidden, tags: [...tags], ships: merged(m.pieces.map((p): Range => [p.s, p.e])),
    ...(saved.loose ? { loose: true } : {}), ...(saved.unsure ? { unsure: saved.unsure } : {}), ...(held ? { held } : {}),
  };
}
type MaskCall = { text: string; r: Remask };

/** What the writer's gate holds the save on in a flow as saved, beyond what its passes place:
 *  a percent-escape that writes no character where a name of the table could stand (docxWrite
 *  checkRef 'text' → pctHidden, owner ruling 10), read with every tag blanked as the gate
 *  blanks them. Unread here until this round, "https://firm/sites/Osprey%E2Lane/brief.docx" in
 *  a body held the save at finish, and shipped with the finish standing once the row "Osprey
 *  Lane" was left readable — no mask covered it at finish, so no mask came off. `shown`: the
 *  stretch between two spaces the escape stands in, as the saved flow reads it — around the
 *  escape where the stretch is longer than the note quotes (60 characters, from its start), each
 *  cut marked "…". Quoted from its start, a Proofpoint v2 link read "https://urldefense.
 *  proofpoint.com/v2/url?u=https-3A__firm_si…" in the note, the name it held on cut off. */
function heldIn(bytes: string, tags: string[], names: RefName[]): Measure['held'] {
  if (!names.length || !hasEscape(bytes)) return undefined;
  const h = pctHidden(blankTags(bytes, tags), names, 'text');
  const name = h && names.find((n) => n.name === h.name);
  if (!h || !name) return undefined;
  let a = h.at, b = h.at;
  while (a > 0 && !/\s/.test(bytes[a - 1])) a--;
  while (b < bytes.length && !/\s/.test(bytes[b])) b++;
  if (b - a <= 60) return { name, shown: bytes.slice(a, b) };
  // the escape stands inside the name, so the window reaches back the name's length and a little
  const s = Math.max(a, Math.min(h.at - Math.min(40, h.name.length + 8), b - 58)), e = Math.min(b, s + 58);
  return { name, shown: `${s > a ? '…' : ''}${bytes.slice(s, e)}${e < b ? '…' : ''}` };
}

/** One stretch of a flow as the writer holds it between its passes: the text, and for each
 *  character the offset in the record it came from, or -1 for a tag the writer wrote. */
type Kept = { text: string; at: number[]; pre?: string; para?: number };
/** the stretches laid out as the writer lays out a flow (docx flowLayout), folded, with the
 *  record offset of each character (-1 for a tag and for the spacing between runs) */
type Laid = { text: string; pos: Int32Array; spans: Array<{ s: number; e: number; item: Kept }> };
function laidOut(items: Kept[]): Laid {
  const lay = flowLayout(items);
  const text = fold(lay.text);
  const pos = new Int32Array(text.length).fill(-1);
  for (const sp of lay.spans) sp.item.at.forEach((x, j) => { pos[sp.s + j] = x; });
  return { text, pos, spans: lay.spans };
}
/** the record offsets `pos` gives for `s`..`e`, pushed to `out` as ranges */
function backTo(pos: ArrayLike<number>, s: number, e: number, out: Range[]): void {
  let a = -1, b = -1;
  for (let k = s; k < e; k++) {
    const x = pos[k];
    if (x < 0) continue;
    if (x === b) { b++; continue; }
    if (a >= 0) out.push([a, b]);
    a = x;
    b = x + 1;
  }
  if (a >= 0) out.push([a, b]);
}

/** The stretches of a flow's record that its saved flow does not carry readable: what the
 *  writer takes out, and what each step of docxWrite placeFlow masks, read back from what it
 *  handed the mask (`calls`, in order) while the flow is rebuilt here as the writer builds it.
 *  The first pass is over the record, so its placements are record offsets. A second is over
 *  the stretches that ship as the first left them, every tag written blanked (recordAt). The
 *  last looks through the flow as it then reads for the table's `names` run together
 *  (refSpans, as a reader sees text), every tag blanked, and writes each over with what the
 *  mask makes of the name alone — its calls are those names, and only they are looked for here:
 *  a name the writer made no call for it found nowhere, and a flow it found none in is not read
 *  again. Read again with every name, a 60k-word body with a hidden note cost a finish 301 ms
 *  beyond the writer's passes, with the masks from memory; read as the writer's calls say,
 *  169 ms, 147 of them the writer's own read (test/finish-attestation.mjs). The flow rebuilt
 *  must read exactly as the writer saved it (`bytes`), which holds this to what the writer
 *  wrote. `hidden` is null when it does not, or when a call is not the text this expects — a
 *  writer this was not written for — and the flow is then compared by its words alone; a flow
 *  with an equation is then `unsure` as well, since its equations are masked after the passes
 *  and over the flow they leave, which there is none of to mask.
 *
 *  Then the flow's equations (`m.eq`), as docxWrite maskMath masks them over the flow the
 *  passes left (maskEquations): what they cover joins `hidden` and what they write is in
 *  `bytes`. `ask` is the mask the passes were made with. */
type Saved = { hidden: Range[] | null; bytes: string; tags: string[]; loose: boolean; unsure?: string };
function savedHidden(m: DocxMark, calls: MaskCall[], names: RefName[], bytes: string, ask: (text: string) => Remask): Saved {
  const rec = m.text;
  const pieces = m.pieces ?? [];
  const items: Kept[] = pieces.map((p) => { const at: number[] = []; for (let x = p.s; x < p.e; x++) at.push(x); return { text: rec.slice(p.s, p.e), at, pre: p.pre, para: p.para }; });
  const masked: Range[] = [];
  const tags: string[] = [];
  let loose = false;
  const lost = (): Saved => ({ hidden: null, bytes, tags, loose, ...(m.eq ? { unsure: `the equations in ${m.where} could not be measured as the writer masks them` } : {}) });
  let i = 0;
  if (calls[0]?.text === rec) {
    const h = hiddenRanges(calls[0].r);
    if (!h) return lost();
    masked.push(...h);
    const ivs = writerIntervals(calls[0].r);
    writeRuns(pieces.map((p, k) => ({ s: p.s, e: p.e, item: items[k] })), ivs);
    for (const iv of ivs) tags.push(iv.tag);
    i = 1;
  }
  for (; i < calls.length; i++) {
    const lay = laidOut(items);
    const at = recordAt(lay, tags, calls[i].text);
    if (!at) break;
    const h = hiddenRanges(calls[i].r);
    if (!h) return lost();
    for (const [s, e] of h) backTo(at, s, e, masked);
    const ivs = writerIntervals(calls[i].r);
    writeRuns(lay.spans, ivs);
    for (const iv of ivs) tags.push(iv.tag);
  }
  // what the mask makes of each name found run together: the calls after the passes
  const alone = new Map<string, Remask>();
  for (; i < calls.length; i++) {
    const t = calls[i].text;
    if (!names.some((n) => fold(n.name) === t)) return lost();
    alone.set(t, calls[i].r);
  }
  if (alone.size) {
    const lay = laidOut(items);
    const called = names.filter((n) => alone.has(fold(n.name)));
    const found: Interval[] = [];
    // a name written short and read in its long form ("Hickson Corp" in "Hickson Corporation",
    // owner ruling 19a) is masked to the end of the word it stands in (docxWrite runTags, `long`)
    for (const f of refSpans(blankTags(fold(lay.text), tags), called, 'text')) {
      const r = alone.get(fold(f.name))!;
      found.push({ s: f.s, e: f.long ?? f.e, tag: r.text });
      backTo(lay.pos, f.s, f.long ?? f.e, masked);
    }
    if (found.length) {
      const ivs = foldIvs(found);
      writeRuns(lay.spans, ivs);
      for (const iv of ivs) tags.push(iv.tag);
    }
    // placeFlow adds the tags each name's own mask writes, after the names' (runTags)
    for (const r of alone.values()) { for (const iv of writerIntervals(r)) tags.push(iv.tag); loose ||= keepsWords(r); }
  }
  if (fold(flowLayout(items).text) !== bytes) return lost();
  let out = bytes;
  if (m.eq) {
    const eq = maskEquations(items, pieces, m.eq, tags, names, ask, masked);
    // the writer holds the file on an equation it cannot certify: nothing of it ships, and it
    // is compared by its words, as a flow held by placeFlow is
    if (!eq) return { hidden: null, bytes, tags, loose };
    tags.push(...eq.tags);
    loose ||= eq.loose;
    out = fold(flowLayout(items).text);
  }
  const ships = uncovered(merged(pieces.map((p): Range => [p.s, p.e])), merged(masked));
  return { hidden: uncovered([[0, rec.length]], ships), bytes: out, tags, loose };
}

/** A name written over with what the mask makes of it alone keeps a word of it readable
 *  ("[Org1] Fund"): offsets then cannot say all that the saved flow carries (compare) */
const keepsWords = (r: Remask): boolean => readableWords(r.text, new Set(writerIntervals(r).map((iv) => iv.tag))).size > 0;

/** docxWrite applyIntervals: the text with each interval's stretch replaced by its tag */
function applyIvs(text: string, ivs: Interval[]): string {
  let out = '';
  let pos = 0;
  for (const iv of ivs) { out += text.slice(pos, iv.s) + iv.tag; pos = iv.e; }
  return out + text.slice(pos);
}

/** docxWrite maskMath, over the flow as placeFlow left it (`items`, one per piece): the
 *  flow's runs read into equations as the writer reads them (mathZones, from how each piece
 *  stood in an equation at the drop — `eq`), each zone joined as it renders with every tag in
 *  `blank` blanked, masked by the whole mask, then for the table's names as zoneRead reads the
 *  zone, each written over with what the mask makes of the name alone (runTags), all written
 *  into the runs (writeRuns). What each zone's intervals cover is pushed to `masked` at its
 *  record offsets. Null where the writer holds the file on an equation: the mask could not
 *  certify it, its placements do not rebuild its text, or a name alone places nothing.
 *
 *  Read as marks of their own until this round (read 'eq', every zone as it read in the file
 *  as dropped, looked through for the names only), a finish stood while a practice switch
 *  shipped an SSN typed in an equation the writer had masked by the whole mask, and one came
 *  off over "Kestrel" in an equation whose body placeFlow had masked all along (P2-1..3).
 *
 *  `blank`: the tags this flow wrote. The writer blanks those and every tag it wrote before
 *  in the package — the parts before this one, the values of this part; a zone that carries
 *  one of those as literal text is read here with it unblanked. */
function maskEquations(items: Kept[], pieces: FlowPiece[], eq: EqPiece[], blank: string[], names: RefName[], ask: (text: string) => Remask, masked: Range[]): { tags: string[]; loose: boolean } | null {
  const elems: Array<Record<string, unknown>> = [];
  const elem = (x: EqPiece) => (x.m === undefined ? undefined : (elems[x.m] ??= x.line ? { 'm:oMath': [] } : { 'm:e': [] }));
  const walk = pieces.map((p, k) => ({ kind: 'body', text: items[k].text, pre: p.pre, para: eq[k].bare ? undefined : p.para, math: elem(eq[k]), gap: eq[k].gap, unshown: eq[k].unshown, node: {}, k }));
  const placed = [...new Set(blank)].filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const tagRe = placed.length ? new RegExp(placed.join('|'), 'g') : null;
  const wrote: string[] = [];
  let loose = false;
  const alone = new Map<string, Remask>();
  for (const zone of mathZones(walk as unknown as WalkItem[])) {
    const { text, spans } = zoneText(zone);
    if (!text.trim()) continue;
    const view = tagRe ? fold(text).replace(tagRe, (t) => '█'.repeat(t.length)) : fold(text);
    const r = ask(view);
    if (r.divergence) return null;
    const all = writerIntervals(r);
    if (applyIvs(view, all) !== r.text) return null;
    const tags = all.map((iv) => iv.tag);
    for (const f of refSpans(view, names, zoneRead(zone))) {
      let n = alone.get(f.name);
      if (!n) { n = ask(fold(f.name)); alone.set(f.name, n); }
      if (n.divergence || !n.placements.length) return null;
      all.push({ s: f.s, e: f.long ?? f.e, tag: n.text });
      tags.push(...writerIntervals(n).map((iv) => iv.tag));
      loose ||= keepsWords(n);
    }
    if (!all.length) continue;
    const ivs = foldIvs(all);
    const runs = spans.map((sp) => ({ s: sp.s, e: sp.e, item: items[(sp.item as unknown as { k: number }).k] }));
    const pos: number[] = [];
    for (const sp of runs) for (const x of sp.item.at) pos.push(x);
    for (const iv of ivs) backTo(pos, iv.s, iv.e, masked);
    writeRuns(runs, ivs);
    wrote.push(...tags);
  }
  return { tags: wrote, loose };
}

type Interval = { s: number; e: number; tag: string };
/** The intervals the writer writes a pass's tags for, as docxWrite mergedIntervals makes them:
 *  the placements and the floor's non-exempt hits, the longer first where two start together,
 *  and one that starts inside the one before folded into it under that one's tag. Touching
 *  intervals stay two, and two tags (hiddenRanges merges them; the writer writes both). */
function writerIntervals(r: Remask): Interval[] {
  return foldIvs([...r.placements, ...r.floorHits.filter((h) => !h.exempt)].map((x) => ({ s: x.s, e: x.e, tag: x.tag })));
}
/** intervals sorted, and folded into one where they overlap, the first one's tag kept
 *  (docxWrite mergedIntervals, foldIntervals) */
function foldIvs(all: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const iv of all.sort((a, b) => a.s - b.s || b.e - a.e)) {
    const prev = out[out.length - 1];
    if (prev && iv.s < prev.e) { if (iv.e > prev.e) prev.e = iv.e; continue; }
    out.push(iv);
  }
  return out;
}
/** docxWrite rewriteRuns over the stretches as the writer holds them: each tag in the first
 *  stretch its interval reaches, the covered rest removed. `spans` stand at the offsets `ivs`
 *  are in: the record's for the first pass, the laid-out flow's after it. */
function writeRuns(spans: Array<{ s: number; e: number; item: Kept }>, ivs: Interval[]): void {
  const tagged = new Set<Interval>();
  let k = 0;
  for (const sp of spans) {
    while (k < ivs.length && ivs[k].e <= sp.s) k++;
    if (k >= ivs.length || ivs[k].s >= sp.e) continue;
    const src = sp.item.text, from = sp.item.at;
    let t = '';
    const at: number[] = [];
    const keep = (s: number, e: number) => { t += src.slice(s - sp.s, e - sp.s); for (let x = s - sp.s; x < e - sp.s; x++) at.push(from[x]); };
    let cursor = sp.s;
    for (let j = k; j < ivs.length && ivs[j].s < sp.e; j++) {
      const iv = ivs[j];
      keep(cursor, Math.max(iv.s, sp.s));
      if (!tagged.has(iv)) { t += iv.tag; for (let x = 0; x < iv.tag.length; x++) at.push(-1); tagged.add(iv); }
      cursor = Math.min(iv.e, sp.e);
      if (iv.e > sp.e) break;
    }
    keep(cursor, sp.e);
    sp.item.text = t;
    sp.item.at = at;
  }
}

/** Where each character of `text` — what the writer handed the mask after its first pass —
 *  stands in the record (`lay.pos`), or null when `text` is not the flow as it now reads with
 *  every tag written so far blanked with █, the document's own occurrences among them (docxWrite
 *  placeFlow's blank). Compared whole, character for character: until 2026-09-23 this skipped
 *  every █ in `text` and matched what was left, so a █ the document itself carries (an earlier
 *  redaction) or a literal "[Person1]" (a precedent's placeholder) failed the match, and a body
 *  with a hidden run was compared by its words alone — a finish refused over "cooperate", and
 *  one that stood while "Wei Ling" shipped in the saved body. */
function recordAt(lay: Laid, tags: string[], text: string): Int32Array | null {
  const want = blankTags(lay.text, tags);
  return want === text ? lay.pos : null;
}
/** every occurrence of every tag in `tags` blanked with █, as docxWrite placeFlow blanks them */
function blankTags(text: string, tags: string[]): string {
  const placed = [...new Set(tags)].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return placed.length ? text.replace(new RegExp(placed.join('|'), 'g'), (t) => '█'.repeat(t.length)) : text;
}

/** docxMaskTable's table, remembered per table, list and side rows, so the same table under the
 *  same always-redact list is one array and exportOf serves its flows from memory */
const docxTables = new WeakMap<Entity[], { key: string; side: Entity[]; table: Entity[] }>();
function docxTableOf(entities: Entity[], terms: string[], side: Entity[]): Entity[] {
  const key = terms.join('\n');
  const hit = docxTables.get(entities);
  if (hit && hit.key === key && hit.side === side) return hit.table;
  const { table } = docxMaskTable(entities, terms, side);
  docxTables.set(entities, { key, side, table });
  return table;
}

/** Two questions a recheck asks of the same body over and over, remembered per parsed
 *  package, whose texts never change after the drop: does a declared term occur in it, and
 *  does a row the list moves under Protected terms place there exactly where it placed
 *  before. A firm-wide list asks both on every table write. */
const bodyMemo = new WeakMap<object, { text: string; occurs: Map<string, boolean>; same: Map<string, boolean> }>();
function memoFor(f: Measurable, text: string) {
  const key = f.docx as object | undefined;
  if (!key) return undefined;
  let m = bodyMemo.get(key);
  if (!m || m.text !== text) bodyMemo.set(key, (m = { text, occurs: new Map(), same: new Map() }));
  return m;
}
/** Whether a row the list adds places anywhere in the body, as the writer's table places it
 *  (engine.ts protectedSpans with the safety-net pattern's cuts): "Call Kestrel61234567" masks
 *  as "Call [Protected2][phone]" in the saved body. Asked with the tolerant pattern alone until
 *  2026-09-23, which refuses the glued "Kestrel6", the row counted as placing nothing, the saved
 *  body was taken for the text export ("Call Kestrel[phone]"), and emptying the list left the
 *  finish standing while "Kestrel" shipped in the saved .docx. protectedMatches counts under
 *  the practice with no exemption, so it can only say yes more often than the writer places. */
function occurs(f: Measurable, text: string, term: string, practice: Practice): boolean {
  const m = memoFor(f, text);
  const key = `${practice}\u0000${term}`;
  const hit = m?.occurs.get(key);
  if (hit !== undefined) return hit;
  const found = protectedRegex(term, 'i').test(text) || protectedMatches(text, term, practice) > 0;
  m?.occurs.set(key, found);
  return found;
}
/** Whether the row `e`, moved under Protected terms by the list (engine.ts asListRow: its
 *  text, tag and class kept, matched tolerantly from then on), places where `e` places. The
 *  engine's placements read a row for its span, tag, class and which of the two patterns
 *  matches it (placements, placementRows), and the move keeps the class the row placed with —
 *  its own, or for a row with none the one placementRows gives it where it stands — so a row
 *  whose tolerant match finds exactly the spans its footprint finds places the same text the
 *  same way, and the body the writer saves is the text export. The CL case of
 *  test/finish-attestation.mjs holds that to the writer: under the move as it was until 2026-09-23, which
 *  stamped a classless row with the Protected class, a hand-marked "Mrs Margaret Tan" lost the
 *  "Mrs Margaret" its prefix masks.
 *  The engine also takes a match whose guarded edge is glued at an offset the safety-net
 *  pattern cuts, or inside a stretch it masks ("Call Kestrel61234567"): the moved row where
 *  protectedSpans finds it, the row as it was where footprintSpans does, both under the cuts of
 *  the table's own exemptions (engine.ts placements). With no safety-net row left readable
 *  (`exact`) those cuts are floorCuts with no exemption, and the two are compared as the engine
 *  places them. With one left readable, the exemption set is keyed by a rule of the engine's it
 *  does not export, so the row counts as placing as before only when neither match takes a
 *  glued edge at all (protectedMatches counts with no exemption, so it can only say "not the
 *  same" too often, which costs a remask and never a name). Asked that way in every case until
 *  this round, a listed row glued to a phone number measured the saved body apart on every
 *  write (wf5 INT-21). */
function placesAsBefore(f: Measurable, text: string, e: Entity, practice: Practice, exact: boolean): boolean {
  const m = memoFor(f, text);
  const key = `${practice}\u0000${exact ? 'x' : ''}\u0000${e.cls}\u0000${e.text}`;
  const hit = m?.same.get(key);
  if (hit !== undefined) return hit;
  const at = (re: RegExp) => [...text.matchAll(re)].map((x) => `${x.index}:${x[0].length}`);
  let same = false;
  try {
    if (exact) {
      const cuts = floorCuts(text, practice, NONE_EXEMPT);
      same = protectedSpans(text, e.text, cuts).join() === footprintSpans(text, e.text, cuts).join();
    } else {
      const tol = at(protectedRegex(e.text));
      same = tol.join() === at(footprintRegex(e.text) as RegExp).join() && protectedMatches(text, e.text, practice) === tol.length;
    }
  } catch { same = false; }
  m?.same.set(key, same);
  return same;
}
const NONE_EXEMPT: ReadonlySet<string> = new Set();

/** The body of the saved .docx, measured apart from the text export whenever it can differ
 *  from it, and only then: a second remask of the whole body on a table write costs as much
 *  as the one the text export needs (P2-M2: +283 ms a write at 67.7k words, while a term the
 *  firm lists named a row).
 *
 *  It differs in two ways. The writer takes hidden runs and the results of the fields it
 *  removes out of the body after it places the table over it, and masks what is left once
 *  more where that joined two stretches — measured as the writer saves it always, when it took
 *  anything out (keptWhole). And the writer masks with docxMaskTable's table, which puts a row
 *  of the list's own in for a term with no live row and moves a row the list names under
 *  Protected terms: a row that could UNMASK — until engine.ts placements kept a shorter row's
 *  other words (2026-09-23), a longer row took its whole placement, and "Mrs Margaret Tan"
 *  listed after finishing left "[Protected2] Wei Ling attended" in the saved body while the
 *  text export still said [Person1]. A minted row that occurs nowhere in the body places
 *  nothing, and a moved row that places as before (placesAsBefore) changes nothing but its
 *  matching, so with every row one of those the saved body is the text export and this is
 *  null. test/finish-attestation.mjs holds the null to the real writer's saved body.
 *
 *  With every row one of those and a hidden run in the body, the writer's first pass over the
 *  record places what the text export places, and is read from the text export's remask: a
 *  third remask of the whole body on every finish and every recheck while the list named
 *  anything (P2T-5; 2 against 3, counted in test/finish-attestation.mjs).
 *
 *  A body with an equation in it is always measured apart: the writer masks each equation as
 *  it renders once the passes are done (maskEquations), and the text export reads it as the
 *  record lays it out, so the two part over any equation the mask reads differently joined.
 *  So is one the writer's gate holds the save on (heldIn), which the text export does not
 *  model: the record must say it was held for a change that lets it ship to be seen. */
function savedBody(f: Measurable, entities: Entity[], dt: Entity[], practice: Practice, names: RefName[]): Measure | null {
  const wb = writerBody(f);
  if (wb === undefined) return null;
  const exact = !entities.some((e) => isFloorRow(e) && e.dead);
  const asExport = wb.text === (f.text ?? '')
    && (dt === entities || dt.every((e, i) => (i < entities.length ? e === entities[i] || placesAsBefore(f, wb.text, entities[i], practice, exact) : !occurs(f, wb.text, e.text, practice))));
  const r = asExport && keptWhole(wb) && !wb.eq ? exportOf(wb.text, entities, practice) : null;
  if (r && !runsTogether(r, names) && !heldIn(r.text, writerIntervals(r).map((iv) => iv.tag), names)) return null;
  return measureFlow(wb, dt, practice, names, asExport ? entities : undefined);
}

/** Whether the writer's last step over a body it saves whole finds one of the table's names run
 *  together in it (docxWrite placeFlow: refSpans over the masked flow as a reader sees it, every
 *  tag blanked). The saved body then masks what the text export leaves readable, and is measured
 *  apart: taken for the text export until this round, "KestrelHoldings signed." masked in the
 *  saved .docx at finish shipped readable once the list was emptied, with the finish standing.
 *  Remembered per export and names, since every recheck asks it of the same body. */
const runMemo = new WeakMap<Remask, WeakMap<RefName[], boolean>>();
function runsTogether(r: Remask, names: RefName[]): boolean {
  if (!names.length || r.divergence) return false;
  let byNames = runMemo.get(r);
  const hit = byNames?.get(names);
  if (hit !== undefined) return hit;
  const found = refFind(blankTags(fold(r.text), writerIntervals(r).map((iv) => iv.tag)), names, 'text', true, false).length > 0;
  if (!byNames) runMemo.set(r, (byNames = new WeakMap()));
  byNames.set(names, found);
  return found;
}

// ---------- what a .docx carries outside its flows ----------

/** One text the saved .docx carries, read at the drop (docxMarks), with what the writer does
 *  to it:
 *    · 'flow'  — a flow the writer masks whole, as it hands it to the mask: the body (`where`
 *                BODY), each header, footer, footnote, endnote, chart and diagram part, and
 *                each chart value in its numeric form. Measured like the text export, never
 *                with the texts outside the flows below; the flow's equations with it, where
 *                they stand (`eq`, maskEquations);
 *    · 'mask'  — masked where it stands (docxWrite ATTR_MASK, ELEM_MASK): a watermark, a
 *                list's number text, a chart's trendline; a font, theme or colour name (read
 *                'ident') replaced WHOLE by "Redacted font N" when any reading of it places
 *                (identValue);
 *    · 'style' — shipped as written unless anything in its style's names places, and then the
 *                style is renamed "Redacted style N"; `group` is the style — every id and
 *                name the writer renames together (a built-in style's alias goes on its own);
 *    · 'hold'  — shipped as written, and the whole file held when the mask places in it: a
 *                kept field's instruction, a declaration of a shape's style, a reference to a
 *                style the file does not define, a part's name, a name in the markup (an
 *                element's, an attribute's, a namespace's prefix and address), anything else.
 *  What the writer renames whatever it says — a caption label, a list definition's name, a
 *  chart's sheet and pivot names, a bookmark, a shape's name — no change to the table can make
 *  readable, and is not listed.
 *  `read` is how the writer reads it: 'text' by the table and the safety-net pattern; 'name'
 *  by the table's rows only, cut into words where it is an identifier, and looked through
 *  for the table's names with nothing between their words; 'machine' by the rows only, from
 *  six characters (a number, a hex id, a date Word writes); 'field' as an instruction, Word's
 *  own words blanked; 'style-*' as docxWrite scanStyles reads a style's name, id and aliases;
 *  'ident' as written by the table and the safety-net pattern, its other readings by the rows,
 *  and looked through for the table's names;
 *  'net' by the safety-net pattern alone (a value of a part the writer does not know, which
 *  holds the file when the pattern masks anything in it — docxWrite writeRedactedDocx, owner
 *  ruling 2). A 'mask' mark read 'name' is masked by the rows only. Every hold is also looked
 *  through for the table's names run together, as the gate reads its kind (readingsOf). */
export interface DocxMark {
  part: string;
  text: string;
  kind: 'flow' | 'mask' | 'style' | 'hold';
  read: 'text' | 'name' | 'machine' | 'field' | 'style-name' | 'style-id' | 'style-alias' | 'ident' | 'net';
  where: string;
  /** looked through for the table's names both ways (refFind 'all') besides what its reading
   *  says: every value of a part the writer does not know, and a relationship's own id */
  carries?: boolean;
  /** read by the safety-net pattern as written too, whatever its reading (docxWrite want's
   *  `floor`): an attribute's value in no namespace Office's formats define (attrNet, owner
   *  ruling 11), and a name in the markup of a part the writer does not know */
  net?: boolean;
  /** the text of an element in a part Word writes, where a machine reads it (docxWrite want's
   *  `whole`, owner rulings 19f and 19g): a hit of the safety-net pattern, and a row of two to
   *  five digits, count where they take the whole value (allOf, SHORT_DIGITS) */
  whole?: boolean;
  group?: number;
  /** a flow the writer places over its record (docxWrite WriterFlow): `text` is the record,
   *  folded, and these the stretches of it the saved file keeps (measureFlow) */
  pieces?: FlowPiece[];
  /** a flow with an equation in it: how each of `pieces` stood in an equation at the drop,
   *  one for each, which is what docxWrite mathZones reads a flow's equations by */
  eq?: EqPiece[];
}

/** How one run of a flow stands in an equation (docx WalkItem): `m` the element it prints in
 *  — one number per element, the same for runs printed side by side — and `line` when that
 *  element is an equation's own line (m:oMath); `gap` when the space before it is the
 *  reading's and not the page's; `unshown` when it is in a phantom that takes no ink; `bare`
 *  when it stands in no paragraph. */
export interface EqPiece { m?: number; line?: boolean; gap?: boolean; unshown?: boolean; bare?: boolean }

/** the writer's labels are written with a typewriter apostrophe; the Review screen's are not */
const said = (label: string) => label.replace(/'/g, '’');

/** where a name in the markup stands, as the lawyer would name the place */
const MARKUP = 'a name in the .docx’s markup';

/** where a text outside the flows stands, as the lawyer would name the place */
function placeOf(part: string): string {
  if (/^word\/styles(WithEffects)?\.xml$/.test(part)) return 'the style definitions';
  if (part === 'word/numbering.xml') return 'the list definitions';
  if (part === 'word/fontTable.xml') return 'the font table';
  if (/^word\/theme\//.test(part)) return 'the theme';
  if (part === 'word/settings.xml') return 'the document settings';
  if (/^docProps\//.test(part)) return 'the document properties';
  if (/^word\/charts\//.test(part)) return 'a chart';
  return 'the .docx’s internal markup';
}

/** Where a kept field's instruction names a style: STYLEREF's first argument, and each name
 *  of a TOC's \t list — the places docxWrite rewriteInstr renames a style — as offsets in the
 *  instruction. */
function styleArgs(instr: string): Range[] {
  const toks = [...instr.matchAll(/"([^"]*)"|[^\s"]+/g)];
  if (!toks.length) return [];
  const code = toks[0][0].toUpperCase();
  const out: Range[] = [];
  const at = (t: RegExpMatchArray | undefined, list: boolean) => {
    if (!t || t[0].startsWith('\\')) return;
    const s = t[1] !== undefined ? t.index! + 1 : t.index!;
    const v = t[1] !== undefined ? t[1] : t[0];
    let pos = s;
    (list ? v.split(/([,;])/) : [v]).forEach((p, i) => {
      const name = p.trim();
      if ((!list || i % 4 === 0) && name) { const lead = p.length - p.trimStart().length; out.push([pos + lead, pos + lead + name.length]); }
      pos += p.length;
    });
  };
  if (code === 'STYLEREF') at(toks[1], false);
  for (let i = 1; i < toks.length - 1; i++) if (code === 'TOC' && toks[i][0] === '\\t') at(toks[i + 1], true);
  return out;
}

/** A field's instruction as docxWrite's gate reads it: Word's own words blanked — the field's
 *  code when the writer keeps it, every switch, a format switch's word, Word's bookmark names
 *  and the neutral ones the writer gives — and, here, every name of a style the file defines:
 *  the writer renames that with its style or ships it as the style's own name ships, so it is
 *  read with the style. */
function blankField(text: string, defined: (name: string) => boolean): string {
  const own = text.split('');
  const toks = [...text.matchAll(/"[^"]*"|[^\s"]+/g)];
  toks.forEach((t, i) => {
    if ((i === 0 && KEEP_FIELD.test(t[0])) || t[0].startsWith('\\') || (i > 0 && toks[i - 1][0] === '\\*' && /^[A-Za-z]+$/.test(t[0]))) {
      for (let k = t.index!; k < t.index! + t[0].length; k++) own[k] = '█';
    }
  });
  for (const [s, e] of styleArgs(text)) if (defined(text.slice(s, e))) for (let k = s; k < e; k++) own[k] = '█';
  return own.join('').replace(/[\p{L}\p{N}_]+/gu, (tok) => (WORD_BOOKMARK.test(tok) || NEUTRAL_REF.test(tok) || NEUTRAL_NAME.test(tok) ? '█'.repeat(tok.length) : tok));
}

type XNode = Record<string, any>;
const tagOf = (n: XNode): string | undefined => { for (const k in n) if (k !== ':@') return k; return undefined; };
const valOf = (kids: XNode[], k: string): string | undefined => { const c = kids.find((x) => k in x); return c ? String((c[':@'] ?? {})['w:val'] ?? '') : undefined; };
/** a mask that places nothing: what the writer saves under it is every text the .docx can
 *  carry outside its flows, each where it stands, with nothing yet masked or renamed */
const NO_MASK: MaskFn = Object.assign((text: string) => ({ text, placements: [], floorHits: [], divergence: null }), { names: [] as string[] });

/** The texts the saved .docx carries outside its flows, read once at the drop: finishing and
 *  every recheck run synchronously, and the package is compressed.
 *
 *  Read from what the writer itself saves under a mask that places nothing — never from the
 *  file as dropped — because what the writer removes, renames and decides whatever the table
 *  says (comments, properties, every bookmark name, the fields it removes or unlinks) cannot
 *  be made readable by any change to the table, and what it keeps is exactly what its gate
 *  reads. That output is walked as the gate walks it (docxWrite readOutput): the walker's
 *  items, then every element text and attribute value the walker does not list, then every
 *  part's name, each marked with what the writer does to it (DocxMark). Until 2026-09-23 the
 *  record read three things here — watermarks, kept field codes, chart sheet names — and a
 *  term masked by the always-redact list in a style's name, a list's number text, a caption
 *  label, a font or theme name, a chart's trendline or number format shipped readable in the
 *  saved .docx once the list was emptied, under "finished by you".
 *
 *  A file the writer holds under that mask is held under every mask (a part nothing can read,
 *  an imported document): nothing of it can ship, and nothing is listed. Throws when the
 *  package cannot be read; store.ts records that as null, and the recheck fails closed on it.
 *  Once per file, at the drop: on a 60k-word .docx 800–850 ms, four times what extracting
 *  it costs (about 200 ms), and it adds 30–110 ms to a finish and about 35 ms to every recheck
 *  that measures (test/finish-attestation.mjs states all three on each run). */
export async function docxMarks(buf: Uint8Array): Promise<DocxMark[]> {
  const written = await writeRedactedDocx(buf, { mask: NO_MASK });
  if (!written.bytes) return [];
  const zip = await readZip(written.bytes);
  const td = new TextDecoder();
  const parts = zip.names.filter((n) => !n.endsWith('/'));
  const walked = new Map<string, { tree: XNode[]; items: WalkItem[] }>();
  for (const n of parts) {
    const rule = RULES.find((r) => r.re.test(n) && !r.rels);
    walked.set(n, walkPart(td.decode((await zip.read(n))!), !!rule?.captureAll));
  }
  const out: DocxMark[] = [];
  const seen = new Set<string>();
  const add = (m: DocxMark) => {
    if (!m.text.trim()) return;
    // two flows with one record are one measure only when the same stretches of it ship; a value
    // the safety net reads, or one looked through both ways, is not the same text as one that is not
    const k = [m.kind, m.read, m.where, m.group ?? '', m.net ? 'n' : '', m.whole ? 'w' : '', m.carries ? 'c' : '', m.text, m.pieces?.map((p) => `${p.s}:${p.e}`).join() ?? ''].join('\u0000');
    if (seen.has(k)) return;
    seen.add(k);
    out.push(m);
  };

  // the styles, as docxWrite scanStyles reads them: a style's id, name and aliases, and a
  // latent-style exception's name. The writer renames by id and by name, so a style is every
  // entry an id or a name joins (styles.xml and stylesWithEffects.xml carry the same ones).
  // A built-in style (BUILTIN_STYLE) is Word's vocabulary: its name, and an id that is that
  // name, are never read, and an alias of one that places goes on its own, the style staying
  // as it is. Read as the author's, "Strong" taken off the always-redact list took a finish off
  // over a style name every saved .docx carries as Word wrote it.
  const up: number[] = [];
  const root = (g: number): number => (up[g] === g ? g : (up[g] = root(up[g])));
  const keyed = new Map<string, number>();
  const styleOf = (keys: string[]): number => {
    const g = up.length;
    up.push(g);
    for (const k of keys) { const h = keyed.get(k); if (h === undefined) keyed.set(k, g); else up[root(h)] = g; }
    return g;
  };
  for (const n of ['word/styles.xml', 'word/stylesWithEffects.xml']) {
    const visit = (nodes: XNode[]) => {
      for (const node of nodes) {
        const t = tagOf(node);
        if (!t || t === '#text') continue;
        const a: Record<string, unknown> = node[':@'] ?? {};
        if (t === 'w:style') {
          const kids = node[t] as XNode[];
          const id = a['w:styleId'] !== undefined ? String(a['w:styleId']) : undefined;
          const name = valOf(kids, 'w:name'), aliases = valOf(kids, 'w:aliases');
          const builtin = name !== undefined && BUILTIN_STYLE.test(name.trim());
          const g = styleOf([...(id !== undefined ? [`i:${id}`] : []), ...(name !== undefined ? [`n:${name.toLowerCase()}`] : [])]);
          if (name !== undefined && !builtin) add({ part: n, text: name, kind: 'style', read: 'style-name', where: 'a style name', group: g });
          if (id !== undefined && !(builtin && idOfName(id, name!))) add({ part: n, text: id, kind: 'style', read: 'style-id', where: 'a style name', group: g });
          if (aliases !== undefined) add({ part: n, text: aliases, kind: 'style', read: 'style-alias', where: 'a style name', group: builtin ? styleOf([]) : g });
          continue;
        }
        if (t === 'w:lsdException' && a['w:name'] && !BUILTIN_STYLE.test(String(a['w:name']).trim())) {
          const name = String(a['w:name']);
          add({ part: n, text: name, kind: 'style', read: 'style-name', where: 'a style name', group: styleOf([`n:${name.toLowerCase()}`]) });
          continue;
        }
        visit(node[t] as XNode[]);
      }
    };
    const w = walked.get(n);
    if (w) visit(w.tree);
  }
  // a built-in's name in a field is read as the field's text: the writer never renames it
  const defined = (name: string) => keyed.has(`n:${name.trim().toLowerCase()}`) && !BUILTIN_STYLE.test(name.trim());

  for (const n of parts) {
    const { tree, items } = walked.get(n)!;
    const rule = RULES.find((r) => r.re.test(n) && !r.rels);
    add({ part: n, text: n, kind: 'hold', read: 'name', where: 'the name of a part inside the .docx' });
    // A part the writer does not know (docxWrite writeRedactedDocx): its every value is looked
    // through for the table's names both ways, the safety-net pattern counts on it as written,
    // and a number the pattern masks anywhere in it — an attribute, a namespace's address —
    // holds the whole file (owner ruling 2). Read as a known part's until this round, a
    // telephone number an add-in keeps as a code held the save at finish, and a practice switch
    // that stops the pattern reading it shipped it with the finish standing.
    const foreign = !rule && n !== '[Content_Types].xml' && !/\.rels$/.test(n) && !LAYOUT_RE.test(n);
    const alien = foreign ? { carries: true } : {};
    // every value, and every name in the markup and the part's own name that carries a digit,
    // as the writer's pre-check reads them (writeRedactedDocx: unknownPartValues, netName over
    // pctDecoded), from the writer's own reading of them; a picture's not at all. Read here by a
    // copy of that pre-check until this round, the copy missed the names the writer began to
    // read, and "acme:n123-45-6789" would have shipped under a practice switch with the finish
    // standing (P2-T7).
    if (foreign && !MEDIA_RE.test(n)) {
      const own = pctDecoded(n);
      for (const v of [...unknownPartValues(tree), ...(/\d/.test(own) ? [fold(netName(own))] : [])]) add({ part: n, text: v, kind: 'hold', read: 'net', where: placeOf(n) });
    }
    // A name in the markup — an element's, an attribute's, a prefix a declaration or a
    // compatibility list names, an address a declaration binds — ships as written and holds the
    // save while one of the table's names is in it, unless it is the format's own (KNOWN_NS,
    // docxWrite readOutput). Unread here until this round, <acme:MargaretTan/> held the save at
    // finish, and the row left visible afterwards shipped it with the finish standing.
    // In a part the writer does not know (`net`) a name is read by the safety net as well, as
    // written and as netName reads it, and a local name under a prefix the format defines is
    // read too, since Word never wrote that part (docxWrite readName, qnameRead, mcList): read
    // here as in a part Word writes, <w:KestrelHoldings/> in an add-in's part, and
    // mc:ProcessContent="w:KestrelHoldings" on its root, held the save at finish and shipped
    // with the finish standing once the list was emptied (P2T6-2, 2026-09-24).
    const netPart = foreign && !MEDIA_RE.test(n);
    const named = (v: string, net = false) => {
      add({ part: n, text: v, kind: 'hold', read: 'name', where: MARKUP, ...(net ? { net: true } : {}) });
      if (net && /\d/.test(v)) add({ part: n, text: netName(v), kind: 'hold', read: 'name', where: MARKUP, net: true });
    };
    // The writer's own lookup of the namespace a name is in (nsOfName): an attribute with no
    // prefix on a WordprocessingML element is in none (owner ruling 12, W3-7). A copy here gave
    // it the element's namespace, so <w:p KestrelHoldings="1"> held the save at finish, and a
    // list edit for another matter shipped it with the finish standing (P2-PATHS-A6).
    const nsOf = nsOfName;
    const qname = (q: string, scope: Map<string, string>, elemUri?: string) => {
      const c = q.indexOf(':');
      const p = c > 0 ? q.slice(0, c) : '';
      if (p === 'xml' || p === 'xmlns' || q === 'xmlns') return;
      const uri = nsOf(q, scope, elemUri);
      const own = uri !== undefined ? KNOWN_NS.get(uri) : undefined;
      if (own) { if (p && !own.has(p)) named(p, netPart); if (netPart) named(q.slice(c + 1), netPart); return; }
      named(q, true);
    };
    const mcList = (v: string, scope: Map<string, string>) => {
      for (const tok of v.split(/\s+/)) {
        if (!tok) continue;
        const c = tok.indexOf(':');
        const p = c >= 0 ? tok.slice(0, c) : tok;
        const uri = scope.get(p);
        if (uri !== undefined && KNOWN_NS.get(uri)?.has(p)) { if (netPart && c >= 0) named(tok.slice(c + 1), netPart); continue; }
        named(tok, true);
      }
    };
    // an address as written and with its escapes read (pctDecoded, owner ruling 10)
    const nsDecl = (k: string, v: string) => {
      const p = k === 'xmlns' ? '' : k.slice(6);
      const own = KNOWN_NS.get(v);
      if (p && !own?.has(p)) named(p, true);
      if (own) return;
      for (const a of new Set([v, pctDecoded(v)])) named(schemaRest(a) ?? a, true);
    };
    // a flow the writer masks is kept as the writer places the table over it (its record, and
    // the stretches of it that ship: docxWrite WriterFlow; each chart value in its numeric form)
    // and measured as one; a flow it does not — a property's value, a part it does not know —
    // ships as it stands or holds the file
    const masks = !!rule && !rule.captureAll;
    const flowWhere = masks ? (rule!.kind === 'body' ? BODY : WHERE[rule!.kind]) : undefined;
    const wf = flowWhere ? written.flows.find((x) => x.part === n) : undefined;
    const covered = new Set<unknown>();
    const coveredAttrs = new Map<unknown, Set<string>>();
    const flow: WalkItem[] = [];
    for (const i of items) {
      covered.add(i.node);
      if (i.attr) coveredAttrs.set(i.node, (coveredAttrs.get(i.node) ?? new Set<string>()).add(i.attr));
      if (i.kind === 'field') add({ part: n, text: blankField(i.text, defined), kind: 'hold', read: 'field', where: 'a field code' });
      else if (i.attr) add({ part: n, text: i.text, kind: 'hold', read: 'text', where: placeOf(n) });
      else if (!i.num) flow.push(i);
      else if (flowWhere) add({ part: n, text: numericForm(fold(i.text)), kind: 'flow', read: 'text', where: flowWhere });
    }
    for (const instr of joinedInstructions(tree)) add({ part: n, text: blankField(instr, defined), kind: 'hold', read: 'field', where: 'a field code' });
    if (wf) { const eq = equationsOf(flow, wf, n); add({ part: n, text: wf.record, kind: 'flow', read: 'text', where: flowWhere!, pieces: wf.pieces, ...(eq ? { eq } : {}) }); }
    else if (flowWhere && flow.some((i) => i.math)) throw new Error(`the writer saved no flow for ${n}, which has an equation, so what it masks there cannot be measured`);
    else if (flow.length) {
      let synthetic = -1;
      const text = flowText(flow.map((i) => (i.para === undefined ? { ...i, para: synthetic-- } : i)));
      if (flowWhere) add({ part: n, text: fold(text), kind: 'flow', read: 'text', where: flowWhere });
      else add({ part: n, text, kind: masks ? 'mask' : 'hold', read: 'text', where: placeOf(n) });
    }
    // a font, theme or colour name, as docxWrite identValue takes it: never one that comes with
    // Windows, macOS or Office, nor a neutral name the writer gave
    const ident = (v: string, where: string) => {
      if (!STANDARD_FONT.test(v.trim()) && !NEUTRAL_IDENT.test(v.trim())) add({ part: n, text: v, kind: 'mask', read: 'ident', where });
    };
    // as docxWrite's gate walks the output (readOutput), in its order; `ns`: the prefixes
    // declared on the way down, each with its namespace ('' the default)
    const audit = (nodes: XNode[], parent: string, gp: string, ns: Map<string, string>) => {
      for (const node of nodes) {
        const tag = tagOf(node);
        if (!tag) continue;
        if (tag.startsWith('?')) { if (tag !== '?xml') add({ part: n, text: tag.slice(1), kind: 'hold', read: 'machine', where: placeOf(n) }); continue; }
        if (tag === '#text') {
          if (covered.has(node)) continue;
          // renamed whatever they say: a chart's cell references (their sheets and names) and
          // a pivot chart's source
          if (FORMULA_TAGS.has(parent) || (parent === 'c:name' && gp === 'c:pivotSource')) continue;
          const v = String(node['#text']);
          const em = ELEM_MASK[parent];
          const t = v.trim();
          if (em) add({ part: n, text: v, kind: 'mask', read: em[0], where: said(em[1]) });
          else {
            // An add-in's own element's text is read by the safety-net pattern in any part Word
            // writes (docxWrite elemNet), and Office's own, where a machine reads it, by the
            // pattern and by a row of two to five digits where either takes the whole value
            // (owner rulings 19f, 19g), save a drawing's position or share of the page, which Word
            // works out and the writer reads as it reads an Office attribute (officeMeasure, W7F-2).
            // Read by the rows from six characters only here,
            // <w14:x>4417</w14:x> held the save at finish on a listed "4417", and emptying the
            // list shipped it from the body or a header with the finish standing (P2T7-1)
            const read = MACHINE.test(t) || VOCAB.test(t) ? 'machine' : 'text';
            add({ part: n, text: v, kind: 'hold', read, where: placeOf(n), ...alien,
              ...(netPart || (!MEDIA_RE.test(n) && elemNet(parent, ns)) ? { net: true } : {}), ...(read === 'machine' && !MEDIA_RE.test(n) && !officeMeasure(parent, ns) ? { whole: true } : {}) });
          }
          continue;
        }
        const a: Record<string, unknown> = node[':@'] ?? {};
        let here = ns;
        for (const k in a) if (k === 'xmlns' || k.startsWith('xmlns:')) { if (here === ns) here = new Map(ns); here.set(k === 'xmlns' ? '' : k.slice(6), String(a[k])); }
        const elemUri = nsOf(tag, here);
        qname(tag, here);
        const walkedAttrs = coveredAttrs.get(node);
        for (const k in a) {
          const v = String(a[k]);
          // XML's own syntax, read by what it declares or lists; an attribute that only looks
          // like it (mc:client on a prefix bound to another namespace) is read like any other
          if (SYNTAX_ATTR.test(k)) {
            if (k === 'xmlns' || k.startsWith('xmlns:')) { nsDecl(k, v); continue; }
            if (nsOf(k, here) === MC_NS && MC_LISTS.has(k.slice(k.indexOf(':') + 1))) { mcList(v, here); continue; }
          }
          if (k === 'Requires' && elemUri === MC_NS) { mcList(v, here); continue; }
          qname(k, here, elemUri);
          // An add-in's own attribute, in any part, is read by the safety-net pattern as written
          // (docxWrite attrNet, owner ruling 11). Read by the rows only here, an SSN an add-in
          // wrote into <w:p acme:ssn="…"> held the save at finish under United States, and a
          // switch to Singapore shipped it from the body, a header or the styles with the finish
          // standing (P2-PATHS-A2).
          const vnet = netPart || attrNet(k, here, elemUri) ? { net: true } : {};
          // a value with escapes, read as the package means it (pctDecoded) and as a name, before
          // anything else the writer does with it
          if (/%[0-9A-Fa-f]{2}/.test(v)) { const d = pctDecoded(v); if (d !== v) add({ part: n, text: d, kind: 'hold', read: 'name', where: placeOf(n), ...vnet }); }
          else if (REF_ESCAPE.test(v)) { const d = pctDecoded(v); if (d !== v) add({ part: n, text: d, kind: 'hold', read: 'name', where: placeOf(n), ...vnet }); }
          if (!v.trim() || refKind(tag, k, parent)) continue;
          // renamed whatever they say (listName, labelName, vmlId): a list definition's name,
          // a caption label, a drawn shape's id
          if ((tag === 'w:name' && parent === 'w:abstractNum' && k === 'w:val') || (tag === 'w:caption' && k === 'w:name') || (tag === 'w:autoCaption' && k === 'w:caption')
            || (tag.startsWith('v:') && (k === 'id' || k === 'o:spid')) || (tag === 'o:OLEObject' && k === 'ShapeID')) continue;
          if (tag.startsWith('v:') && k === 'style') {
            // CSS, declaration by declaration (docxWrite vmlStyle): a font-family is a font
            // name, the next text box a shape's id; any other value ships as written
            for (const decl of v.split(';')) {
              const c = decl.indexOf(':');
              if (c < 0) continue;
              const prop = decl.slice(0, c).trim().toLowerCase(), val = decl.slice(c + 1).trim();
              if (!val || prop === 'mso-next-textbox') continue;
              if (prop === 'font-family') { for (const fam of val.split(',')) ident(fam.trim().replace(/^(["'])(.*)\1$/s, '$2'), 'a font name'); continue; }
              add({ part: n, text: val, kind: 'hold', read: MACHINE.test(val) || VOCAB.test(val) ? 'machine' : 'name', where: 'a drawn shape’s style' });
            }
            continue;
          }
          if (walkedAttrs?.has(k)) continue;
          // an address on the format's own hosts, and a media type Office writes in the package's
          // list of parts: what schemaRest and mediaRest leave of it, as a name (docxWrite
          // readOutput). Read here as a code word until this round, a media type
          // "…officedocument.lim.notes+xml" held the save on a listed "Lim" at finish and shipped
          // it with the finish standing, and a row "Office" left readable was said to have held
          // the save on Office's own "…officedocument…" in every file
          const rest = k === 'ContentType' && n === '[Content_Types].xml' ? mediaRest(v) : schemaRest(v);
          if (rest !== null) { if (rest) add({ part: n, text: rest, kind: 'hold', read: 'name', where: placeOf(n), ...alien, ...vnet }); continue; }
          const am = ATTR_MASK[tag]?.[k];
          const t = v.trim();
          if (am?.[0] === 'ident') ident(v, said(am[1]));
          else if (am) add({ part: n, text: v, kind: 'mask', read: am[0], where: said(am[1]) });
          else if (styleAttr(tag, k, parent) || (tag === 'w:aliases' && parent === 'w:style')) {
            // a style's own names are read with the style, above; a reference to a style the
            // file defines is renamed with it, and one to a style it does not ships as written
            // unless it is a built-in's name, which the writer never reads
            if (STYLE_REFS.has(tag) && !keyed.has(`i:${v}`) && !BUILTIN_STYLE.test(t)) add({ part: n, text: v, kind: 'hold', read: 'name', where: 'a style name' });
          } else {
            // a relationship's id other than Word's own rIdN is looked through for the table's
            // names both ways, as a value of a part the writer does not know is
            const relId = ((tag === 'Relationship' && k === 'Id') || R_ATTRS.includes(k)) && !/^rId\d+$/.test(t);
            // a theme's script code ("Hans", "Thai") is Word's own value, as the writer reads it
            // (fontScript): read as a name, a row "Hans" held at finish and came off with the list
            // over a theme the saved .docx carries unchanged
            add({ part: n, text: v, kind: 'hold', read: EMAILISH.test(v) ? 'text' : fontScript(tag, k, t) || MACHINE.test(t) || VOCAB.test(t) ? 'machine' : 'name', where: placeOf(n), ...alien, ...(relId ? { carries: true } : {}), ...vnet });
          }
        }
        audit(node[tag] as XNode[], tag, parent, here);
      }
    };
    audit(tree, '', '', new Map());
  }
  for (const m of out) if (m.group !== undefined) m.group = root(m.group);
  return out;
}

/** How each piece of the writer's flow stood in an equation (EqPiece), read from the runs of
 *  the part as the writer saved it (`flow`: its runs as partFlow keeps them — no attribute,
 *  field or chart value), or undefined when none stands in one. The writer reads its pieces
 *  from the same runs, so the two are one for one; a run that is not its piece's text is a
 *  writer this was not written for, and the drop fails loud, since the flow's equations would
 *  go unmeasured (store.ts records the marks unread, and every finish over them fails closed). */
function equationsOf(flow: WalkItem[], wf: WriterFlow, part: string): EqPiece[] | undefined {
  if (!flow.some((i) => i.math)) return undefined;
  const aligned = flow.length === wf.pieces.length && flow.every((i, k) => {
    const p = wf.pieces[k];
    return fold(i.text) === wf.record.slice(p.s, p.e) && (i.pre ?? '') === (p.pre ?? '') && (i.para === undefined || i.para === p.para);
  });
  if (!aligned) throw new Error(`the equations in ${part} could not be matched to the runs the writer saves`);
  const ids = new Map<object, number>();
  return flow.map((i): EqPiece => {
    const x: EqPiece = {};
    if (i.math) {
      let m = ids.get(i.math);
      if (m === undefined) ids.set(i.math, (m = ids.size));
      x.m = m;
      if ('m:oMath' in i.math) x.line = true;
    }
    if (i.gap) x.gap = true;
    if (i.unshown) x.unshown = true;
    if (i.para === undefined) x.bare = true;
    return x;
  });
}

/** How the writer reads one mark, reading by reading: 'all' takes the table and the
 *  safety-net pattern, 'rows' the table's rows only, 'ident' the rows where a placement
 *  inside an identifier counts (countsInIdent), 'rows6' the rows from six characters, 'net'
 *  none of the rows; with
 *  `floor`, the safety-net pattern's hits count on that reading too; with `whole`, where a hit
 *  of the pattern, or a row of two to five digits on a 'rows6' reading, takes the whole value
 *  (docxWrite allOf, SHORT_DIGITS, owner rulings 19f and 19g). And the texts it looks
 *  through for the table's names run together (`carry`), each the way the gate reads its kind
 *  (docxWrite checkRef): a name both ways, a text as a reader sees it, a value Word writes for
 *  itself run together from RUN_FLOOR characters, save the format's own media types. */
type Rule = 'all' | 'rows' | 'ident' | 'rows6' | 'net';
type Reading = { text: string; rule: Rule; floor?: boolean; whole?: boolean; run?: FormatRun };
type Carry = { text: string; how: 'all' | 'run' | 'text' };
/** the pattern counts on a style's id as written and with its underscores as spaces, never on
 *  the id cut into words (docxWrite styleFloor): "Memo_123-45-6789" is an SSN the author typed,
 *  and the record that read an id with the table's rows only let a practice switch ship it
 *  with the finish standing */
const styleReadings = (v: string): Reading[] => identReadings(v).map((text, j) => ({ text, rule: 'ident', floor: styleFloor(j, v) }));
/** A value the writer reads by the safety-net pattern as written too (`net`, docxWrite want's
 *  `floor`): the pattern's hits on the whole value count, beside its own readings — but never on
 *  a GUID, which the writer does not read that way (GUID_VALUE). */
function readingsOf(m: DocxMark): { readings: Reading[]; carry: Carry[] } {
  const r = readingsOwn(m);
  return m.net && m.read !== 'net' && !GUID_VALUE.test(m.text.trim()) ? { readings: [...r.readings, { text: fold(m.text), rule: 'net', floor: true }], carry: r.carry } : r;
}
function readingsOwn(m: DocxMark): { readings: Reading[]; carry: Carry[] } {
  const v = fold(m.text);
  const ident = identReadings(v).map((text): Reading => ({ text, rule: 'ident' }));
  const also: Carry[] = m.carries ? [{ text: m.text, how: 'all' }] : [];
  // docxWrite identValue: as written by the whole mask, its other readings by the rows, and
  // looked through for the table's names
  if (m.read === 'ident') { const w = fold(m.text.trim()); return { readings: identReadings(w).map((text, j) => ({ text, rule: j === 0 ? 'all' : 'ident' })), carry: [{ text: w, how: 'all' }] }; }
  // the safety-net pattern alone decides; a row there holds under the value's own reading
  if (m.read === 'net') return { readings: [{ text: v, rule: 'net', floor: true }], carry: [] };
  // docxWrite maskFormat: a number format's code as written by the rows only, and each stretch
  // it prints (formatRuns) by the whole mask. Read by the pattern as written, a practice switch
  // would take the finish off over "123-45-6789#,##0", which the saved .docx carries unchanged
  // before and after (test/finish-attestation.mjs, P23-4)
  if (m.kind === 'mask') return { readings: [{ text: v, rule: m.read !== 'name' ? 'all' : 'rows' }, ...(m.read === 'name' && m.where === NUMBER_FORMAT ? formatRuns(v).filter((r) => r.text.trim()).map((r) => ({ text: r.text, rule: 'all' as Rule, run: r })) : [])], carry: [] };
  switch (m.read) {
    // a row under six characters counts where it is the whole value in a value the safety net
    // reads (docxWrite want's `floor`, never a GUID) and in an element's text (`whole`), and
    // nowhere else: the attributes of Office's own elements carry Word's sizes and spacing
    // ("w:sz 20", "w:ind 4521"), which the writer ships beside such a row (owner ruling 19g)
    case 'machine': return { readings: [{ text: v, rule: 'rows6', whole: !!m.whole || (!!m.net && !GUID_VALUE.test(m.text.trim())) }], carry: [...(OWN_MEDIA.test(m.text.trim()) ? [] : [{ text: m.text, how: 'run' as const }]), ...also] };
    case 'name': return { readings: ident, carry: [{ text: m.text, how: 'all' }] };
    case 'style-name': return { readings: [{ text: v, rule: 'all' }, ...styleReadings(v)], carry: [{ text: m.text, how: 'all' }] };
    case 'style-id': return { readings: styleReadings(v), carry: [{ text: m.text, how: 'all' }] };
    case 'style-alias': return { readings: [{ text: v, rule: 'all' }, ...styleReadings(v)], carry: [{ text: m.text, how: 'all' }] };
    case 'field': {
      const readings: Reading[] = [{ text: v, rule: 'all' }];
      if (v.includes('_')) readings.push({ text: v.replace(/_/g, ' '), rule: 'all' });
      const toks = m.text.match(/[\p{L}\p{N}_]+/gu) ?? [];
      for (const tok of toks) { const w = refWords(tok); if (w) readings.push({ text: fold(w), rule: 'ident' }); }
      // each word both ways, and the instruction whole as a reader sees text (docxWrite field)
      const whole: Carry[] = [{ text: m.text, how: 'text' }, ...(m.text.includes('_') ? [{ text: m.text.replace(/_/g, ' '), how: 'text' as const }] : [])];
      return { readings, carry: [...toks.map((t): Carry => ({ text: t, how: 'all' })), ...whole] };
    }
    default: return { readings: [{ text: v, rule: 'all' }], carry: [{ text: m.text, how: 'text' }, ...also] };
  }
}

/** docxWrite maskFormat's currency sections, [$symbol-locale], outside quotes and escapes: a hit
 *  in one takes the section whole, so a section is masked whole or not at all */
function currencySections(code: string): Range[] {
  const sections: Range[] = [];
  for (let i = 0, q = false; i < code.length; i++) {
    if (code[i] === '"') { q = !q; continue; }
    if (q) continue;
    if (code[i] === '\\') { i++; continue; }
    if (code[i] !== '[') continue;
    const j = code.indexOf(']', i);
    const e = j < 0 ? code.length : j + 1;
    if (code[i + 1] === '$') sections.push([i, e]);
    i = e - 1;
  }
  return sections;
}

/** Per mark: what the writer's reading of it finds under one table (`hits`, the text each
 *  placement covers and each name an identifier carries), and for a mark masked where it
 *  stands, the stretches of it masked (`hidden`). `divergence`: the mask could not certify
 *  its own placements, and nothing here is known. */
interface NamesMeasure { hits: string[][]; hidden: Array<Range[] | null>; divergence: string | null }

/** Every reading of every mark in one remask, joined by REF_JOIN, which no row's match and no
 *  rule of the safety-net pattern crosses (the writer batches its own readings the same way),
 *  and remembered with the table like every other export. */
function measureNames(marks: DocxMark[], dt: Entity[], practice: Practice, names: RefName[]): NamesMeasure {
  const index = new Map<string, number>();
  const texts: string[] = [];
  const per = marks.map((m) => {
    const { readings, carry } = readingsOf(m);
    return {
      carry,
      at: readings.filter((r) => r.text.trim()).map((r) => {
        let k = index.get(r.text);
        if (k === undefined) { k = texts.length; index.set(r.text, k); texts.push(r.text); }
        return { k, rule: r.rule, floor: r.floor, whole: r.whole, run: r.run };
      }),
    };
  });
  const starts: number[] = [];
  let joined = '';
  texts.forEach((t, i) => { if (i) joined += REF_JOIN; starts.push(joined.length); joined += t; });
  const r = exportOf(joined, dt, practice);
  if (r.divergence) return { hits: [], hidden: [], divergence: r.divergence };
  const found: Array<Array<{ s: number; e: number; floor: boolean }>> = texts.map(() => []);
  const put = (s: number, e: number, floor: boolean) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= s) lo = mid; else hi = mid - 1; }
    found[lo].push({ s: s - starts[lo], e: Math.min(e - starts[lo], texts[lo].length), floor });
  };
  for (const p of r.placements) put(p.s, p.e, false);
  for (const h of r.floorHits) if (!h.exempt && h.s >= 0 && h.e > h.s) put(h.s, h.e, true);
  const hits: string[][] = [];
  const hidden: Array<Range[] | null> = [];
  per.forEach(({ at, carry }, i) => {
    const got = new Set<string>();
    let own: Range[] = [];
    at.forEach(({ k, rule, floor, whole, run }, j) => {
      const t = texts[k];
      const keep = found[k].filter((h) => rule === 'all'
        || (h.floor ? floor === true || (whole === true && allOf(t, h))
          : rule !== 'net' && (rule === 'rows' || (rule === 'rows6' ? h.e - h.s >= 6 || (whole === true && allOf(t, h) && SHORT_DIGITS.test(t.slice(h.s, h.e))) : countsInIdent(t, h)))));
      for (const h of keep) got.add(t.slice(h.s, h.e));
      if (j === 0) own = merged(keep.map((h): Range => [h.s, h.e]));
      else if (run) own = merged([...own, ...keep.map((h): Range => [run.at[h.s] - (run.how[h.s] === 'e' ? 1 : 0), run.at[h.e - 1] + 1])]);
    });
    const m = marks[i];
    // a text masked where it stands is also masked where one of the table's names stands run
    // together in it (docxWrite maskValue, maskFormat): in a number format, in the code as
    // written and where it prints, and a hit in a currency section takes the section whole; in
    // any other text, beside what the mask placed, which is a wall
    if (m.kind === 'mask' && m.read !== 'ident') {
      const v = fold(m.text);
      if (m.read === 'name' && m.where === NUMBER_FORMAT) {
        const runs = formatRuns(v);
        const finds = [...refSpans(v, names).map((f): Range => [f.s, f.e]), ...runs.flatMap((r) => refSpans(r.text, names).map((f): Range => [r.at[f.s] - (r.how[f.s] === 'e' ? 1 : 0), r.at[f.e - 1] + 1]))];
        const sections = currencySections(v);
        own = merged([...own, ...finds].map(([s0, e0]): Range => {
          let s = s0, e = e0;
          for (const [a, b] of sections) if (s < b && e > a) { s = Math.min(s, a); e = Math.max(e, b); }
          return [s, e];
        }));
      } else if (names.length) {
        let blank = v;
        for (const [s0, e0] of own) blank = blank.slice(0, s0) + '█'.repeat(e0 - s0) + blank.slice(e0);
        own = merged([...own, ...refSpans(blank, names, m.read === 'text' ? 'text' : 'all').map((f): Range => [f.s, f.long ?? f.e])]);
      }
    }
    // a text is renamed or held whole on the first name the gate finds in it, or on a
    // percent-escape that writes no character where one could stand (docxWrite checkRef,
    // pctHidden, owner ruling 10): read without it, "urn:acme:Osprey%E2Lane" held the save at
    // finish and shipped once the list was emptied, with the finish standing (P2-PATHS-C35)
    for (const c of carry) { const nm = refFind(c.text, names, c.how, true, false)[0]?.name ?? pctHidden(c.text, names, c.how)?.name; if (nm) got.add(nm); }
    hits.push([...got]);
    hidden.push(m.kind === 'mask' ? own : null);
  });
  return { hits, hidden, divergence: null };
}

/** the names the writer looks for in an identifier: the spans docxMaskTable's table places,
 *  which exportPlan hands the writer as mask.names (engine.ts docxMaskNames), read the way the
 *  writer reads them (refNames), remembered per table */
const namesMemo = new WeakMap<Entity[], RefName[]>();
function namesOf(entities: Entity[], terms: string[], dt: Entity[], side: Entity[]): RefName[] {
  let n = namesMemo.get(dt);
  if (!n) {
    n = refNames(Object.assign(NO_MASK.bind(null), { names: docxMaskNames(entities, terms, side) }));
    namesMemo.set(dt, n);
  }
  return n;
}

/** What a change left readable of what the .docx carries outside its flows: a stretch masked
 *  in place at finish and not now; a style renamed at finish and not now; a text the writer
 *  held the file on at finish and now ships as it stands (`held`). */
function namesExposed(marks: DocxMark[], was: NamesMeasure, now: NamesMeasure): Exposed['parts'] {
  const out = new Map<string, Exposed['parts'][number]>();
  const put = (where: string, held: boolean, texts: string[]) => {
    const key = `${held ? 'h' : 's'}${where}`;
    let p = out.get(key);
    for (const t0 of texts) {
      const t = t0.replace(/^[\s,;:]+|[\s,;:]+$/g, '');
      if (!HAS_WORD.test(t)) continue;
      if (!p) out.set(key, (p = { where, spans: [], words: [], ...(held ? { held: true } : {}) }));
      if (!p.spans.includes(t)) p.spans.push(t);
    }
  };
  const styles = new Map<number, { was: boolean; now: boolean; hits: string[] }>();
  marks.forEach((m, i) => {
    // replaced whole at finish, and shipped as written now
    if (m.read === 'ident') { if (was.hits[i].length && !now.hits[i].length) put(m.where, false, was.hits[i]); }
    else if (m.kind === 'mask') put(m.where, false, uncovered(was.hidden[i] ?? [], now.hidden[i] ?? []).map(([s, e]) => m.text.slice(s, e)));
    else if (m.kind === 'hold') { if (was.hits[i].length && !now.hits[i].length) put(m.where, true, was.hits[i]); }
    else {
      const g = styles.get(m.group ?? -1) ?? { was: false, now: false, hits: [] };
      g.was ||= was.hits[i].length > 0;
      g.now ||= now.hits[i].length > 0;
      g.hits.push(...was.hits[i]);
      styles.set(m.group ?? -1, g);
    }
  });
  for (const g of styles.values()) if (g.was && !g.now) put('a style name', false, g.hits);
  return [...out.values()];
}

/** What the lawyer attested to when they pressed finish: the export of THIS text under THIS
 *  table and practice, kept as bytes and as the places the masks sat (which also catches a
 *  change that unmasks one occurrence of a word while masking another: the word count would
 *  not move) — and for a .docx the same of every other flow the writer masks, each under the
 *  table the writer is handed: the review table plus the always-redact list at finish
 *  (engine.ts docxMaskTable), under the practice at finish, and what the writer's reading of
 *  every text outside the flows found (docxMarks). Every flow is the one the writer masks, not
 *  the file as dropped. The .docx body is the text export under that table and is kept apart
 *  (`saved`) only when it differs from it. */
export interface FinishRecord {
  body: Measure;
  /** the saved .docx body — the writer's body flow under docxMaskTable's table — whenever
   *  that flow or that table can make it differ from `body` (savedBody) */
  saved: Measure | null;
  parts: Array<Measure & { where: string; part: string }>;
  /** the texts outside the flows (docxMarks), under the same table; null with none */
  names: NamesMeasure | null;
  /** a .docx whose texts outside the flows could not be read at the drop: nothing after the
   *  finish can be measured against it, and the recheck fails closed */
  unread: boolean;
  practice: Practice;
  /** what the export was made of — the table (never mutated in place: every write makes a new
   *  array), the .docx as read, and the list — so a recheck with every input the same knows
   *  the export is the one finished without measuring it */
  basis: { entities: Entity[] | undefined; docx: QFile['docx']; docxMarks: QFile['docxMarks']; terms: string; side: Entity[] };
}

type Measurable = Pick<QFile, 'text' | 'entities'> & DocxFields;

/** The last record made. Pressing finish asks for it twice — finishHold, then finishFile — and
 *  a finish of a 60k-word .docx costs 0.6–0.9 s; the record is served again when every input is
 *  the one it was made of, compared as `unchanged` compares them. */
let lastRecord: { kind: QFile['kind']; rec: FinishRecord } | null = null;

export function finishRecord(f: Measurable, practice: Practice, terms: string[]): FinishRecord {
  if (lastRecord && lastRecord.kind === f.kind && unchanged(lastRecord.rec, f, practice, terms)) return lastRecord.rec;
  const rec = recordOf(f, practice, terms);
  lastRecord = { kind: f.kind, rec };
  return rec;
}
function recordOf(f: Measurable, practice: Practice, terms: string[]): FinishRecord {
  const entities = f.entities ?? [];
  // by the kind of file, never by whether it has other parts: a .docx with a body alone is
  // still written with docxMaskTable's table
  const side = sideRowsOf(f);
  const dt = f.kind === 'docx' ? docxTableOf(entities, terms, side) : entities;
  const marks = outsideOf(marksOf(f));
  // the names the writer is handed (exportPlan's mask.names), for every flow and every text
  const names = f.kind === 'docx' ? namesOf(entities, terms, dt, side) : [];
  return {
    body: measure(f.text ?? '', entities, practice),
    saved: f.kind === 'docx' ? savedBody(f, entities, dt, practice, names) : null,
    parts: docxFlows(f).map((m) => ({ where: m.where, part: m.part, ...measureFlow(m, dt, practice, names) })),
    names: marks.length ? measureNames(marks, dt, practice, names) : null,
    // the flows are read with the texts outside them (docxMarks), so a .docx whose marks were
    // never read has no saved body or other flow to measure either — not only no names
    unread: f.kind === 'docx' && !Array.isArray(f.docxMarks),
    practice,
    basis: { entities: f.entities, docx: f.docx, docxMarks: f.docxMarks, terms: terms.join('\n'), side },
  };
}

/** every input of the export is the one it was finished over */
const unchanged = (rec: FinishRecord, f: Measurable, practice: Practice, terms: string[]): boolean =>
  f.entities === rec.basis.entities && (f.text ?? '') === rec.body.text && practice === rec.practice
  && f.docx === rec.basis.docx && f.docxMarks === rec.basis.docxMarks && terms.join('\n') === rec.basis.terms
  && sideRowsOf(f) === rec.basis.side;

/** the same texts outside the flows, read the same way: the record's measures are per mark */
const sameMarks = (a: QFile['docxMarks'], b: QFile['docxMarks']): boolean => {
  const x = (a ?? []) as DocxMark[], y = (b ?? []) as DocxMark[];
  return x === y || (x.length === y.length && x.every((m, i) => m.text === y[i].text && m.kind === y[i].kind && m.read === y[i].read && m.group === y[i].group && (m.pieces?.length ?? -1) === (y[i].pieces?.length ?? -1)));
};

/** What a change left readable that was masked at finish, text by text. `spans` and `words`
 *  are the document of record's; `parts` the other flows of a .docx and what it carries
 *  outside them, each with where it is — the saved body among them when it leaves readable
 *  what the text export does not, and `held` on a text the writer held the save on at finish
 *  rather than masked. Anything non-empty means the finish no longer covers the export. */
export interface Exposed {
  spans: string[];
  words: string[];
  parts: Array<{ where: string; spans: string[]; words: string[]; held?: boolean }>;
  textChanged: boolean;
  /** the record cannot be compared, and why, in words the note can end on */
  unread?: string;
}

const TEXT_CHANGED: Exposed = { spans: [], words: [], parts: [], textChanged: true };
const OUTSIDE = 'what this .docx carries outside its text — style, font and list names, field codes, the watermark';
const UNREAD = `${OUTSIDE} — could not be read when it was dropped`;
const DIVERGED = `the masks could not be placed with certainty in ${OUTSIDE}`;

/** A flow the writer's gate held the save on at finish (heldIn) that it no longer holds, while
 *  what it now saves still carries that escape where the name it held on could stand: the
 *  stretch, as the note quotes it, or null. Read under the finish's name, not only as "held
 *  then, not now": a row added over "Osprey" walls the name off in "[Org1]%E2Lane", which
 *  ships nothing the finish held, and a finish taken off for masking more is one the lawyer
 *  learns to ignore. */
function unheld(was: Measure, is: Measure): string | null {
  if (!was.held || is.held) return null;
  return pctHidden(blankTags(is.bytes, is.tags), [was.held.name], 'text') ? was.held.shown : null;
}

export function exposedSince(rec: FinishRecord, f: Measurable, practice: Practice, terms: string[]): Exposed | null {
  if (rec.unread) return { spans: [], words: [], parts: [], textChanged: false, unread: UNREAD };
  // the offsets mean nothing over a different text, so a changed text is exposure by
  // definition — the app never rewrites a text after its run, and if it ever does, the finish
  // must not outlive it
  if ((f.text ?? '') !== rec.body.text) return TEXT_CHANGED;
  const now = finishRecord(f, practice, terms);
  if (now.parts.length !== rec.parts.length || now.parts.some((p, i) => p.text !== rec.parts[i].text)) return TEXT_CHANGED;
  if (!sameMarks(rec.basis.docxMarks, f.docxMarks)) return TEXT_CHANGED;
  if (rec.names?.divergence || now.names?.divergence) return { spans: [], words: [], parts: [], textChanged: false, unread: DIVERGED };
  // a flow whose equations could not be measured as the writer masks them cannot say what a
  // change left readable in them
  const unsure = [rec.saved, now.saved, ...rec.parts, ...now.parts].find((m) => m?.unsure)?.unsure;
  if (unsure) return { spans: [], words: [], parts: [], textChanged: false, unread: unsure };
  const body = compare(rec.body, now.body);
  const parts: Exposed['parts'] = [];
  // the saved body names only what the text export does not already: the lawyer is told each
  // text once, where it is readable — "John" and "Smith" are not named again beside "John
  // Michael Smith"
  if (rec.saved || now.saved) {
    const was = rec.saved ?? rec.body, is = now.saved ?? now.body;
    // offsets compare one text only; the writer's body flow is fixed at the drop, so two
    // different texts here mean the record and the file no longer describe one package
    if (was.text !== is.text) return TEXT_CHANGED;
    const s = compare(was, is);
    const spans = s.spans.filter((t) => !body.spans.some((b) => b.includes(t))), words = s.words.filter((w) => !body.words.includes(w));
    if (spans.length || words.length) parts.push({ where: BODY, spans, words });
    const u = unheld(was, is);
    if (u) parts.push({ where: BODY, spans: [u], words: [], held: true });
  }
  now.parts.forEach((p, i) => {
    const c = compare(rec.parts[i], p);
    if (c.spans.length || c.words.length) parts.push({ where: p.where, ...c });
    const u = unheld(rec.parts[i], p);
    if (u) parts.push({ where: p.where, spans: [u], words: [], held: true });
  });
  if (rec.names && now.names) parts.push(...namesExposed(outsideOf(marksOf(f)), rec.names, now.names));
  return body.spans.length || body.words.length || parts.length ? { ...body, parts, textChanged: false } : null;
}

const quote = (s: string) => `“${s.length > 60 ? s.slice(0, 60) + '…' : s}”`;

/** The Review screen's sentence for a finish that came off: what did it, and what it left
 *  readable. It names text from the original, which the Review screen shows anyway; it is
 *  never written into the receipt.
 *
 *  `again`: the note measured once more on a later write, while the finish is still off. It
 *  describes the table as it stands NOW, because a note fixed at the moment of the reopen
 *  went on saying "Bob Nowak" was readable in the export after the lawyer had redacted him
 *  again, beside a preview that showed [Person2]. The finish still comes back only by
 *  finishing again. */
export function reopenNote(cause: string, x: Exposed | null | 'no-record', again = false): string {
  const held = 'Export holds this document until you finish again.';
  if (x === 'no-record') return `${cause} could not be measured against what you finished, because no record of it was kept. ${held}`;
  if (!x) return `${cause} took your finish off. Nothing masked when you finished is readable as the table stands now. ${held}`;
  if (x.unread) return `${cause} could not be measured against what you finished: ${x.unread}. ${held}`;
  const where = (p: Exposed['parts'][number]) => (p.spans.length ? p.spans : p.words).map((s) => `${quote(s)} (in ${p.where})`);
  const shown = [...(x.spans.length ? x.spans : x.words).map(quote), ...x.parts.filter((p) => !p.held).flatMap(where)];
  // a field code, a part's name, anything the writer ships as written: never masked, the
  // writer held the whole .docx on it
  const kept = x.parts.filter((p) => p.held).flatMap(where);
  if (x.textChanged || (!shown.length && !kept.length)) {
    return `${cause} changed the text this review was finished over, so what you finished no longer describes what would be exported. ${held}`;
  }
  const say = (l: string[]) => l.slice(0, 3).join(', ') + (l.length > 3 ? ` and ${l.length - 3} more` : '');
  const masked = `${shown.length === 1 ? 'it was' : 'they were'} masked when you finished`;
  const heldOn = kept.length && `${say(kept)} would be saved in the .docx as ${kept.length === 1 ? 'it stands, and it' : 'they stand, and they'} held the save when you finished`;
  if (again) return `${cause} took your finish off. As the table stands now, ${[shown.length && `${say(shown)} would be readable in the export, and ${masked}`, heldOn].filter(Boolean).join('; ')}. ${held}`;
  if (!shown.length) return `${cause} took your finish off: ${heldOn}. ${held}`;
  return `${cause} left ${say(shown)} readable in the export, and ${masked}${heldOn ? `; ${heldOn}` : ''}. ${held}`;
}

/** Finishing: the flag, the record of what it covers, and any earlier reopen cleared. The ONE
 *  place `reviewed` becomes true (test/finish-attestation.mjs holds App.tsx to it). `terms` is
 *  the always-redact list the .docx writer would be handed now. */
export function finishFile(f: QFile, practice: Practice, terms: string[]): QFile {
  const finish = typeof f.text === 'string' && f.entities ? finishRecord(f, practice, terms) : undefined;
  // Review.tsx asks finishHold before it finishes, and says why; a finish reached by any other
  // road is refused here as well, and Export then holds the file as not finished
  const unseen = finish ? unseenIn(finish) : [];
  if (unseen.length) return f.reviewed ? { ...f, reviewed: false, finish: undefined, reopened: holdNote(unseen, f) } : f;
  return { ...f, reviewed: true, finish, reopen: undefined, reopened: undefined };
}

/** What the saved .docx body would show readable that the Review screen masks, each as the
 *  saved file would read it. The screen shows the document of record under the review table;
 *  the .docx is saved from the file's own runs under docxMaskTable's table (savedBody). Where
 *  the two part, the stretches the text export masks and the saved body leaves readable are
 *  quoted from the record, run together across what the writer takes out; where the saved
 *  body cannot be read back to the record, the words it carries readable more often than the
 *  text export, counted. Empty when the saved body is the text export.
 *
 *  Until the writer placed the table over the record (2026-09-23) this was the INT-1 leak:
 *  "John " + hidden "Michael " + "Smith", confirmed as "John Michael Smith", masked on the
 *  screen and in the .txt, and the saved .docx named the claimant. A text the saved file joins
 *  that the screen shows apart ("Kes" + hidden "x" + "trel") is not a stretch the screen
 *  masks, and is not listed. */
function unseenIn(rec: FinishRecord): string[] {
  const s = rec.saved, b = rec.body;
  if (!s) return [];
  if (s.text === b.text && s.hidden && b.hidden) return quoted(s.text, uncovered(b.hidden, s.hidden), s.ships);
  const tags = new Set([...b.tags, ...s.tags]);
  const shown = readableWords(b.bytes, tags);
  return [...readableWords(s.bytes, tags)].filter(([w, n]) => (shown.get(w) ?? 0) < n).map(([w]) => w);
}

/** Why a finish is refused, or taken off, over what unseenIn found, and what the lawyer can do
 *  about it. A row of their own over the words masks them in both — a word inside the name
 *  places in the document of record wherever the saved file carries it — and a .docx the
 *  writer takes text out of can instead be cleaned in Word and dropped again. */
function holdNote(unseen: string[], f: DocxFields): string {
  const it = unseen.length === 1 ? 'it' : 'them';
  const list = unseen.slice(0, 3).map(quote).join(', ') + (unseen.length > 3 ? ` and ${unseen.length - 3} more` : '');
  const wb = writerBody(f);
  const cleaned = wb && !keptWhole(wb) ? `; or, in Word, remove or unhide the hidden text and fields around ${it}, save, and drop the file again` : '';
  return `Saved as a .docx, this document would show ${list} readable, and this screen masks ${it}. The .docx is saved from the Word file itself, with the firm’s always-redact list, not from the text on this screen, and here the two do not mask the same — so finishing would vouch for a copy you have not seen. Mark ${unseen.length === 1 ? 'it' : 'those words'} in the document, each word on its own where the screen shows them apart, and finish again${cleaned}.`;
}

/** Why pressing finish must not finish this file, or null when it may: the saved .docx body
 *  would show readable what the Review screen masks (unseenIn). Review.tsx asks before it
 *  finishes and shows the sentence beside the button; finishFile refuses the same. The record
 *  it measures is the one the finish then keeps (finishRecord), so asking costs nothing more. */
export function finishHold(f: Measurable, practice: Practice, terms: string[]): string | null {
  if (f.kind !== 'docx' || typeof f.text !== 'string' || !f.entities) return null;
  const unseen = unseenIn(finishRecord(f, practice, terms));
  return unseen.length ? holdNote(unseen, f) : null;
}

/** Every write to a table, every practice change and every change to the always-redact list
 *  passes the file through here. A file that was never finished passes untouched. A finished
 *  one keeps its finish only when the export after the change leaves nothing readable that
 *  was masked when the lawyer finished; otherwise the finish comes off and `reopened` says
 *  why, in plain words. A finished file with no record of what was finished is treated as
 *  exposed — the one unmeasurable case fails closed. A file whose finish already came off
 *  has its note measured again against that finish, so the note is true of the table on
 *  screen; the finish itself comes back only by finishing again. */
export function recheckFinish(before: QFile, after: QFile, practice: Practice, terms: string[], cause: string): QFile {
  const measurable = typeof after.text === 'string' && !!after.entities;
  // what finishHold refuses a finish over: a change after finishing can bring it about with
  // nothing masked at finish readable now — a row added on the screen that the saved body
  // does not mask — and the finish must not stand over a .docx the screen does not show
  const unseen = (): string[] => (measurable && after.kind === 'docx' ? unseenIn(finishRecord(after, practice, terms)) : []);
  if (!before.reviewed) {
    const r = before.reopen;
    if (!r?.from) return after;
    const x = measurable ? exposedSince(r.from, after, practice, terms) : TEXT_CHANGED;
    const u = x ? [] : unseen();
    const note = u.length ? `${r.cause} took your finish off, and Export holds this document. ${holdNote(u, after)}` : reopenNote(r.cause, x, true);
    return note === after.reopened ? after : { ...after, reopened: note };
  }
  const reopen = (from: FinishRecord | null, note: string): QFile =>
    ({ ...after, reviewed: false, finish: undefined, reopen: { cause, from }, reopened: note });
  if (!before.finish) return reopen(null, reopenNote(cause, 'no-record'));
  // leaving Settings rechecks every file whether the list changed or not; with nothing
  // changed there is nothing to measure — and a .docx whose texts outside its flows could not
  // be read (which fails closed on any change) keeps a finish nothing has touched
  if (unchanged(before.finish, after, practice, terms)) return after;
  const x = measurable ? exposedSince(before.finish, after, practice, terms) : TEXT_CHANGED;
  if (x) return reopen(before.finish, reopenNote(cause, x));
  const u = unseen();
  return u.length ? reopen(before.finish, `${cause} took your finish off, and Export holds this document. ${holdNote(u, after)}`) : after;
}
