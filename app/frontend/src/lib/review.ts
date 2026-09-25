// The review's own accounting: which rows a human decided, which stand as they were marked,
// and which are still waiting. Pure — no React, no engine — so test/review-honesty.mjs can
// pin it, and ONE place computes what the review screen and the receipt both print.
//
// Why it exists (LAUNCH.md §4.3): the review screen printed "42 of 42 reviewed" and a green
// "Confirm & finish review" before anyone had read a word. It counted every row the engine
// was sure of as reviewed (`entities.length - pending`), and on the frozen service path no
// row ever arrives pending, so that count was the whole table the moment the document
// opened. Finishing the review is the gate Export and Compare release on, and the receipt
// travels with the copy: a count that turns engine confidence into a human's reading is a
// false statement in the record the firm keeps of what it sent out.
import type { Entity } from './store';
import type { Claim, FloorHit, PlacedPart } from './engine';

/** Every row is exactly one of three, and the three add up to the table:
 *    waiting  — status 'pending'. The finish button stays locked on it. A pending identity
 *               row is masked until decided (engine.ts, at the status mapping); a
 *               boilerplate suspect is readable until decided.
 *    decided  — a human verdict landed on it in this review (Entity.decided), and nothing
 *               has put it back in the queue since.
 *    standing — neither: marked by the engine, the safety-net pattern or the always-redact
 *               list, and not touched by a human. It exports exactly as it was marked. */
export interface ReviewTally { total: number; decided: number; waiting: number; standing: number }

export function reviewTally(entities: Entity[]): ReviewTally {
  let decided = 0, waiting = 0;
  for (const e of entities) {
    // pending wins: a row a human re-tagged but has not yet confirmed or left readable is
    // still waiting on the verdict the lock exists for
    if (e.status === 'pending') waiting++;
    else if (e.decided) decided++;
  }
  return { total: entities.length, decided, waiting, standing: entities.length - decided - waiting };
}

/** Model-cleared candidates no row covers yet: spans the in-app core's model looked at and
 *  judged not identifying. They are readable in the export and nothing locks on them, so
 *  they are none of the three above — and they were left out of every count, so the rail
 *  said "0 waiting on you" beside a list headed "you confirm" and the receipt never
 *  mentioned them. ONE definition: the rail lists these, the tally, the finish title and
 *  the receipt count them. The frozen service path returns none. */
export function liveSuspects<S extends { text: string }>(suspects: S[] | undefined, entities: Entity[]): S[] {
  return (suspects ?? []).filter((s) => !entities.some((e) => e.text.toLowerCase() === s.text.toLowerCase()));
}

/** The answers the classify prompt lets the model give for a candidate that is not an
 *  identity: lib-core/anonymize.mjs CLASSIFY_GRAMMAR less its identity classes, which
 *  test/review-honesty.mjs reads and fails on when they drift. A candidate is listed with the
 *  model's own answer as its verdict. An answer with no text has been a failed call since wf5
 *  S5L-2 (tauri.ts; engine.rs complete_within), so its layer is marked incomplete and the span
 *  is never listed. What can still arrive outside these three is an answer from a server that
 *  does not hold the model to the grammar ("none", "n/a"), or lib-core's own word for an empty
 *  answer, "unclassified". Neither is a judgment, and the screen, the finish title and the
 *  receipt do not call it one. */
export const CLEARED_AS: readonly string[] = ['place', 'date', 'generic'];
export const modelJudged = (s: { verdict?: string }): boolean => CLEARED_AS.includes((s.verdict ?? '').trim().toLowerCase());

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The review footer's line. Three counts, a fourth when the model left candidates readable,
 *  and never "N of N reviewed": nothing the app can see tells it that a human read a row
 *  nobody touched. */
export function tallyLine(t: ReviewTally, cleared = 0): string {
  return `${t.decided} decided by you · ${t.standing} as marked automatically · ${t.waiting} waiting on you`
    + (cleared ? ` · ${cleared} left readable by the model` : '');
}

export const TALLY_TITLE = 'Decided by you: rows you confirmed, left readable, re-classed, folded, widened or added. '
  + 'As marked automatically: rows the engine, the safety-net pattern or your always-redact list marked, which you have not changed — they export as they stand. '
  + 'Waiting on you: rows the engine flagged for a decision. A name found only on the second read stays masked until you decide it; possible boilerplate stays readable until you do. '
  + 'Left readable by the model: candidates the model looked at and did not class as a name, a company, a brand or an address. Nothing locks on them; each stays readable unless you redact it from its list.';

/** The finish button's label once nothing is waiting. Pressing it is the lawyer's
 *  attestation, so the label says what is being attested. Export's hold message names the
 *  button through this constant, so the instruction and the button cannot drift apart —
 *  they did: Export told the lawyer to press "Looks right — continue", which no button says. */
export const FINISH_LABEL = '✓ I’ve checked it — finish review';

/** What a finish on a .docx does not promise. The finish is measured against the body the
 *  writer saves (lib/attest.ts finishHold), not against the writer's final check of the file it
 *  writes, and that check can still hold the save: hidden text or a field between two parts of
 *  a name joins them in the saved copy, and in 17 of 240 seeded trials a file finished and was
 *  then held at the save (wf5 P23-1). The owner's ruling of 2026-09-23 keeps the finish as it
 *  is, and no screen may show a .docx as finished without saying the save runs that check. */
export const DOCX_SAVE_NOTE = 'Saving the .docx runs a final check of its own on the file it writes, and holds the save, saying why, if that check fails.';

/** What finishing records, with the numbers the lawyer has to weigh before pressing: how
 *  many marks go out exactly as the machine made them, and how many candidates the model
 *  left readable — `cleared` the ones it judged not identifying, `unanswered` the ones its
 *  answer gave no class for (modelJudged). Every sentence after the first is a count, and on
 *  a .docx DOCX_SAVE_NOTE closes it; test/review-honesty.mjs holds the title to that, because
 *  one appended "every row has been checked" is the defect. */
export function finishTitle(t: ReviewTally, cleared = 0, unanswered = 0, docx = false): string {
  const stays = (n: number, what: string) => ` ${n} ${plural(n, 'candidate', 'candidates')} ${what} ${plural(n, 'stays', 'stay')} readable unless you redact ${plural(n, 'it', 'them')}.`;
  const left = (cleared ? stays(cleared, 'the model judged not identifying') : '') + (unanswered ? stays(unanswered, 'the model gave no class for') : '')
    + (docx ? ` ${DOCX_SAVE_NOTE}` : '');
  if (t.total === 0) return `Finishing records that you have read this document. Nothing is marked on it, so nothing in it will be redacted.${left}`;
  const one = t.standing === 1;
  const stand = t.decided === t.total
    ? `You decided all ${t.total} ${plural(t.total, 'row', 'rows')}.`
    : `${t.standing} mark${one ? '' : 's'} stand${one ? 's' : ''} as ${one ? 'it was' : 'they were'} made automatically unless you change ${one ? 'it' : 'them'}; you decided ${t.decided}.`;
  return `Finishing records that you have read this document and its marks. ${stand}${left}`;
}

/** The receipt's review line. COUNTS ONLY: the receipt travels with the redacted copy, so
 *  it never names a row, a term or a tag. It states the scope of the human review — how
 *  much of the table a person decided — because "finished" alone reads as "every row was
 *  checked", and that is the claim this module exists to stop the app making. On the
 *  sample it says "the fixed demo set", not "automatically (engine, …)": the same receipt
 *  prints "engine: none" a few lines later, and a receipt that contradicts itself on the
 *  demo a prospective firm reads first is worth nothing on the documents that follow. */
export function receiptReviewLine(entities: Entity[], reviewed: boolean, sample = false, suspects?: Array<{ text: string; verdict?: string }>): string {
  const t = reviewTally(entities);
  const live = liveSuspects(suspects, entities);
  const cleared = live.filter(modelJudged).length, unanswered = live.length - cleared;
  const status = reviewed
    ? 'finished by you'
    : sample ? 'not finished — this is the sample document, which exports without one' : 'NOT finished';
  const went = (n: number, what: string) => `${n} ${plural(n, 'candidate', 'candidates')} ${what} ${plural(n, 'was', 'were')} left readable without a decision`;
  const leftPart = [
    cleared ? went(cleared, sample ? 'the demo set shows as cleared by the model' : 'the model judged not identifying') : '',
    unanswered ? went(unanswered, 'the model gave no class for') : '',
  ].filter(Boolean).join('; ');
  if (t.total === 0) return `review: ${status} — the table was empty, so there was nothing marked to decide${leftPart ? `; ${leftPart}` : ''}`;
  const by = sample
    ? `as the fixed demo set or the safety-net pattern marked ${plural(t.standing, 'it', 'them')}`
    : 'as marked automatically (engine, safety-net pattern or always-redact list)';
  const parts = [
    `you decided ${t.decided} of the ${t.total} ${plural(t.total, 'row', 'rows')}`,
    `${t.standing} ${plural(t.standing, 'stands', 'stand')} ${by}, unchanged by you`,
  ];
  // Reachable after finishing: undo can put a decided row back in the queue while the export
  // stays exactly as it was finished (a pending identity row is masked), and then the finish
  // stands (lib/attest.ts recheckFinish). The line says so rather than folding it into either count.
  if (t.waiting) parts.push(`${t.waiting} ${plural(t.waiting, 'was', 'were')} still waiting on a decision when this copy was made`);
  if (leftPart) parts.push(leftPart);
  return `review: ${status} — ${parts.join('; ')}`;
}

/** The review header and its filters count by what the export does with each row NOW. The
 *  header read "1 redacted · 3 pending" over a table whose export masked three names: the
 *  pending identity rows are masked while they wait (fail-closed), and a count that leaves
 *  them out of "redacted" reads as "pending means readable". Redacted and readable split
 *  the table between them; waiting cuts across both. */
export type RowFilter = 'all' | 'pending' | 'masked' | 'readable';
export function rowIn(e: Entity, f: RowFilter): boolean {
  if (f === 'all') return true;
  if (f === 'pending') return e.status === 'pending';
  return f === 'masked' ? !e.dead : !!e.dead;
}
export function headLine(entities: Entity[]): string {
  const n = (f: RowFilter) => entities.filter((e) => rowIn(e, f)).length;
  const waiting = n('pending');
  return `${n('masked')} redacted · ${n('readable')} readable${waiting ? ` · ${waiting} waiting on you` : ''}`;
}

/** A human verdict on the rows named by `keys`: `patch` lands, and each row is recorded as
 *  decided. Every verdict path on the review screen goes through here or widenRow, or mints
 *  its row with `decided: true` — test/review-honesty.mjs reads Review.tsx and fails if one
 *  does not. A key reaches the FIRST row that carries it and no other: the screen resolves
 *  a key with `entities.find`, so a second row sharing a key is never the row the lawyer
 *  was shown, and a verdict that fanned out to it left a name nobody chose readable. */
export function decideRows(entities: Entity[], keys: Iterable<string>, patch: Partial<Entity>): Entity[] {
  const want = new Set(keys);
  return entities.map((e) => {
    if (!want.has(e.key)) return e;
    want.delete(e.key);
    return { ...e, ...patch, decided: true as const };
  });
}

/** The exact undo of a verdict: each row named in `before` goes back to the object it was,
 *  field for field — restoring only the fields a verdict usually changes left `decided`
 *  behind, so an undone confirm still counted as a human decision. It restores a row only
 *  when the row in the table is the same row: the same key AND the same text, first match
 *  only, the counterpart of decideRows. Matching on the key alone turned an undo into a
 *  substitution when two rows shared one (measured: a hand-added "Alice Kowalczyk" was
 *  replaced by a second copy of "Bob Nowak", dropped out of the table and exported
 *  readable, while verify-by-extraction passed because she was no longer a listed span). */
export function restoreRows(entities: Entity[], before: Entity[]): Entity[] {
  const prev = new Map(before.map((e) => [e.key, e] as const));
  const done = new Set<string>();
  return entities.map((e) => {
    const p = prev.get(e.key);
    if (!p || p.text !== e.text || done.has(e.key)) return e;
    done.add(e.key);
    return p;
  });
}

/** The undo of a hand-added row: that row leaves, no other. It filtered on the key alone,
 *  so undoing the second of two rows that shared a key removed both. */
export function withdrawRow(entities: Entity[], row: Entity): Entity[] {
  const i = entities.findIndex((e) => e.key === row.key && e.text === row.text);
  return i < 0 ? entities : [...entities.slice(0, i), ...entities.slice(i + 1)];
}

/** A key for a row the review screen mints — 'u' added by hand, 'x' the short form an
 *  extend-drag keeps — one past the highest either prefix already carries in THIS table.
 *  It was a counter on the component: Review unmounts on every step away (App renders it
 *  under `step === 2`), the counter restarted at 0, and the second name added by hand in a
 *  file got 'u1' again. Read off the table, a key cannot repeat while the row that holds
 *  it is still there, whatever mounted in between. */
export function mintHandKey(entities: Entity[], prefix: 'u' | 'x'): string {
  let n = 0;
  for (const e of entities) {
    const m = /^[ux](\d+)$/.exec(e.key);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return prefix + (n + 1);
}

/** Drag-to-extend as one verdict. The widened row and every row the drag swallowed into
 *  its tag are the lawyer's decision. The short form's other occurrences are not: the row
 *  that keeps masking it where it stands alone (never unmask silently) is the source row as
 *  it was — its mark, its provenance, its place in the queue — with only a new key and
 *  count. It was minted 'added by you' and decided, so one drag counted as two decisions
 *  and the receipt put occurrences nobody looked at under "you decided". */
export function widenRow(entities: Entity[], key: string, text: string, occ: number, aloneOcc: number, swallowed: string[], keep?: string): Entity[] {
  const src = entities.find((e) => e.key === key);
  if (!src) return entities;
  let next = decideRows(entities, [key], widened(text, occ));
  // `keep`: the key the caller minted for the short form, so its undo can name that row. A
  // key the table already holds is never reused; the undo then finds nothing to withdraw and
  // the short form stays masked.
  const kept = keep && !entities.some((e) => e.key === keep) ? keep : mintHandKey(entities, 'x');
  if (aloneOcc > 0) next = [...next, { ...src, key: kept, occ: aloneOcc }];
  if (swallowed.length) next = decideRows(next, swallowed, swallowedInto(src.tag));
  return next;
}
/** what the drag writes on the row it widens, and on each row it swallows — widenRow and its
 *  undo read the same two definitions */
const widened = (text: string, occ: number): Partial<Entity> => ({ text, occ, status: 'confirmed' });
const swallowedInto = (tag: string): Partial<Entity> => ({ tag, status: 'confirmed' });

/** One drag-to-extend, as its undo needs it: the row as it was, the text and count it was
 *  widened to, the key of the short form widenRow kept (null when none was kept), and the
 *  rows the drag swallowed, as they were. */
export interface Widened { was: Entity; text: string; occ: number; kept: string | null; swallowed: Entity[] }

type Fields = Record<string, unknown>;
const fieldsOf = (...rows: Entity[]): string[] => [...new Set(rows.flatMap((r) => Object.keys(r)))];
const at = (e: Entity, k: string): unknown => (e as unknown as Fields)[k];
/** `was`, with every change made to the row since the drag kept: a field that still holds what
 *  the drag wrote (`wrote`) goes back to `was`, any other keeps its value now. `was` itself
 *  when nothing else touched the row. */
function undoDrag(now: Entity, wrote: Entity, was: Entity): Entity {
  const keys = fieldsOf(now, wrote, was);
  if (keys.every((k) => at(now, k) === at(wrote, k))) return was;
  const out: Fields = {};
  for (const k of keys) {
    const v = at(now, k) === at(wrote, k) ? at(was, k) : at(now, k);
    if (v !== undefined) out[k] = v;
  }
  return out as unknown as Entity;
}

/** The undo of widenRow, and of nothing else: the widened row goes back to the row it was,
 *  the short form it kept leaves, each swallowed row goes back to what it was — each found by
 *  key and text, as restoreRows finds a row — and every change made to those rows since the
 *  drag stays. It was a snapshot of the whole table taken before the drag, and then each row
 *  put back whole, and both took back changes that push no undo of their own: Export's "Mask
 *  them in every form" moves the widened row itself under Protected terms, U on the drag put
 *  the row back as it was before, and the second "Kestrel Holdings Pte" — a zero-width space
 *  inside "Holdings" — went readable under a toast that said only "Undone: Extended to …"
 *  (2026-09-23). What the short form's row gained since the drag (the same button reaches it
 *  when the list names the short form) moves onto the row that masks the short form again. */
export function unwidenRow(entities: Entity[], w: Widened): Entity[] {
  const minted: Entity = { ...w.was, key: w.kept ?? '' };
  const short = w.kept ? entities.find((e) => e.key === w.kept && e.text === w.was.text) : undefined;
  // the short form's own changes since the drag: every field but its key and its count
  const carried = short ? fieldsOf(short, minted).filter((k) => k !== 'key' && k !== 'occ' && at(short, k) !== at(minted, k)) : [];
  let back = false;
  let next = entities.map((e) => {
    if (back || e.key !== w.was.key || e.text !== w.text) return e;
    back = true;
    const row = undoDrag(e, { ...w.was, ...widened(w.text, w.occ), decided: true }, w.was);
    if (!carried.length) return row;
    const out: Fields = { ...row };
    for (const k of carried) { const v = at(short!, k); if (v === undefined) delete out[k]; else out[k] = v; }
    return out as unknown as Entity;
  });
  if (w.kept) next = withdrawRow(next, { ...w.was, key: w.kept });
  const prev = new Map(w.swallowed.map((s) => [s.key, s] as const));
  const done = new Set<string>();
  return next.map((e) => {
    const s = prev.get(e.key);
    if (!s || s.text !== e.text || done.has(e.key)) return e;
    done.add(e.key);
    return undoDrag(e, { ...s, ...swallowedInto(w.was.tag), decided: true }, s);
  });
}

/** The review pane's parts, each character drawn under the row whose tag the export writes
 *  over it (owner ruling 4: the highlight shows every stretch the copy masks, and as what).
 *  placeSpans (engine.ts) claims whole matches, longest first, and skips a shorter row's match
 *  that overlaps one it has claimed, because a part there is a drag handle for its row. The
 *  export differs from that in three ways, and each was a false statement on screen:
 *  - it keeps a shorter row's words outside a longer match as claims of their own (placements,
 *    THE OVERLAP RULE), and places the two-token prefix lib-core adds for a name, which no row
 *    is: "Mrs Margaret Tan Wei Ling attended" exported "[Person1] [Person2] attended" while the
 *    pane showed "Wei Ling" as plain text (2026-09-23);
 *  - a row left readable claims nothing, and the safety-net pattern masks what it covers all
 *    the same: a switched-off "kestrel.tan@example.com today" was drawn as readable over an
 *    address the copy writes as [email], and "+65 6123" inside a kept "hotline on +65 6123" as
 *    the hotline's row, its "4567" as plain text, over "the [Person1] [phone]" (P2-5);
 *  - a kept row's part can lie inside another row's claim: with "Lim Wei Sheng" and "Wei"
 *    kept, "Lim Wei signed" exports as "[Person1] signed" while the pane said the "Wei" went out
 *    as [Person2], and a click on it opened a row that decides nothing there (P2-M1).
 *  So the export's own claims (Remask.claims) and its safety-net matches (`floorHits`, the ones
 *  not exempt; a match masks over any claim, since that pattern runs over what the table left)
 *  decide each character, never a re-derivation: under a divergence there are none and the
 *  parts come back as placed. A character the export masks under a row other than the part
 *  drawn over it becomes a piece of that row (`pc`), with no drag handles — dragged from its own
 *  edge it would widen the row from the middle — and pieces of one row side by side are one.
 *  A kept row's part cut that way keeps its handles at its own ends only, and carries the whole
 *  part (`span`) for a drag to widen from; a character in it that no claim covers is plain
 *  text. `pc.row` is null for a claim whose row the table no
 *  longer lists and for a safety-net match with no row of its own yet; the piece is shown. */
export type PanePart = PlacedPart & { pc?: { row: Entity | null; tag: string; floor: boolean }; span?: [number, number] };
export function withMaskedPieces(text: string, parts: PlacedPart[], claims: ReadonlyArray<Claim> | undefined, entities: Entity[], floorHits?: ReadonlyArray<FloorHit>): PanePart[] {
  if (!claims) return parts;
  type Masker = { key: string; row: Entity | null; tag: string; text: string; floor: boolean };
  const lower = (s: string) => s.trim().toLowerCase();
  const byKey = new Map<string, Masker>();
  const at: Array<Masker | undefined> = new Array(text.length);
  const lay = (s: number, e: number, m: Masker) => { for (let i = Math.max(0, s); i < Math.min(e, text.length); i++) at[i] = m; };
  let any = false;
  for (const c of claims) {
    const key = `c\u0000${c.row}\u0000${c.tag}`;
    let m = byKey.get(key);
    if (!m) byKey.set(key, (m = { key, row: entities.find((x) => !x.dead && x.text === c.row && x.tag === c.tag) ?? null, tag: c.tag, text: c.row, floor: false }));
    lay(c.s, c.e, m);
    any = true;
  }
  for (const h of floorHits ?? []) {
    if (h.exempt) continue;
    const key = `f\u0000${h.tag}\u0000${lower(h.text)}`;
    let m = byKey.get(key);
    if (!m) byKey.set(key, (m = { key, row: entities.find((x) => !x.dead && x.tag === h.tag && lower(x.text) === lower(h.text)) ?? null, tag: h.tag, text: lower(h.text), floor: true }));
    lay(h.s, h.e, m);
    any = true;
  }
  if (!any) return parts;
  // whether the export masks a character under the kept row its part is drawn for
  const own = (m: Masker, e: Entity) => m.tag === e.tag && (m.floor ? lower(e.text) === m.text : e.text === m.text);
  const out: PanePart[] = [];
  const keyOf = new WeakMap<PanePart, string>();
  const piece = (s: number, e: number, m: Masker) => {
    const last = out[out.length - 1];
    if (last?.pc && last.end === s && keyOf.get(last) === m.key) {
      const joined: PanePart = { ...last, t: last.t + text.slice(s, e), end: e };
      keyOf.set(joined, m.key);
      out[out.length - 1] = joined;
      return;
    }
    const p: PanePart = { t: text.slice(s, e), start: s, end: e, pc: { row: m.row, tag: m.tag, floor: m.floor } };
    keyOf.set(p, m.key);
    out.push(p);
  };
  for (const part of parts) {
    const kept = part.e && !part.e.dead ? part.e : null;
    const cls = (i: number): Masker | null => { const m = at[i]; return m && !(kept && own(m, kept)) ? m : null; };
    let cut = false;
    for (let i = part.start; i < part.end; i++) if (cls(i)) { cut = true; break; }
    if (!cut) { out.push(part); continue; }
    // inside a cut kept part a character no claim covers is plain text: the export trims its
    // claim at the cut ("the [Person1] [phone]" keeps the space), and marking that space as the
    // row would be the pane stating a mask the copy does not carry
    const kind = (i: number): Masker | 'own' | 'plain' => cls(i) ?? (kept && !at[i] ? 'plain' : 'own');
    let s = part.start;
    while (s < part.end) {
      const m = kind(s);
      let e = s + 1;
      while (e < part.end && kind(e) === m) e++;
      if (m === 'plain') out.push({ t: text.slice(s, e), start: s, end: e });
      else if (m !== 'own') piece(s, e, m);
      else out.push({ ...part, t: text.slice(s, e), start: s, end: e, ...(kept ? { span: [part.start, part.end] as [number, number] } : {}) });
      s = e;
    }
  }
  return out;
}
