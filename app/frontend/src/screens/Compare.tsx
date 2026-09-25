// Compare — "what changed between two versions of a document".
//
// A redline is the other side's ACCOUNT of what they changed. This screen is the
// principal's own check: it reads both texts and reports every textual difference
// it finds, including the ones nobody redlined. The comparison is deterministic —
// LCS alignment over paragraphs, then over words inside a changed pair — and it
// runs entirely in this tab. Nothing is sent anywhere and nothing is judged.
//
// One line of that is load-bearing and was false until 2026-09-23: "nothing is sent
// anywhere". The screen sends nothing, but its "Copy the changes" button used to hand
// the clipboard the RAW text of both documents — see the clipboard section below
// compare(), which is where the mask now lives.
import { useEffect, useMemo, useState } from 'react';
import { awaitingEngine, type Entity, type QFile } from '../lib/store';
import { escapeWay, exportPlan, fragmentTerms, isFloorRow, rowSurvives, survivingFragments, TAG_BLANK, unfinishedSaid } from '../lib/engine';
import { loadProtectedTerms } from '../lib/protected';
import { loadPractice } from '../lib/practice';
import { FINISH_LABEL } from '../lib/review';

interface Props { files: QFile[]; onGoToDrop: () => void }

type Kind = 'same' | 'del' | 'ins';
interface Op { k: Kind; ai: number; bi: number }

/** Paragraph alignment above this many paragraphs stops doing word-level work. */
const COARSE_PARAS = 1200;
/** DP table ceiling. Past this the aligner degrades to a straight replace and says so. */
const CELL_CAP = 4_000_000;
/** What the fragment check reads, in the export receipt's words (Export.tsx fragHow), copied
 *  word for word and pinned to it by compare-refusal: the payload is pasted into a model, and
 *  "no fragment of any listed name is readable below" claimed a completeness the check does not
 *  have — "the tan leather" beside a kept "Margaret Tan" was copied under it (D3L-1). */
const FRAG_HOW = 'each word of a row you masked or of a listed term, and each part of one joined by an apostrophe, a hyphen or a dot, save a word it skips as too common to stand for a name alone, even where it is a surname: a title such as Mr or Dr, a designator such as Inc, LLC or Group, a two-letter code such as US, UK, NA or SA, the words the, and, for and of, and Bank, Road, Street, Place and Avenue; each from four letters, from two where the name and the copy both write it with an upper-case first letter, or from four digits; found where a word breaks (a space, a punctuation mark, a digit, a superscript, an upper-case letter after a small one), through escapes, and from four letters inside an address, a path, or a handle or a tag written with a plain @ or #; never inside a plain word of letters';

const LABEL: Record<'changed' | 'added' | 'removed', { word: string; color: string }> = {
  changed: { word: 'Changed', color: 'var(--amber)' },
  added: { word: 'Added', color: 'var(--go)' },
  removed: { word: 'Removed', color: 'var(--held)' },
};

/** A paragraph AND where it sits. The offsets are what the clipboard mask needs: the
 *  entity table's placements are recorded against the document by byte range
 *  (lib/engine.ts Placement.s/e), so a paragraph that only carries its text cannot be
 *  masked without guessing which bytes it was. */
interface Para { text: string; s: number; e: number }

/** The comparison reads a newline-normalized copy while the entity table was built on
 *  the file as it stands, and the two disagree by one byte per CRLF. `at[i]` is where
 *  raw offset i lands in the normalized text; null means the file has no CR at all and
 *  the two agree, which is the common case and skips the map entirely. */
function normalizeNewlines(raw: string): { text: string; at: number[] | null } {
  if (!raw.includes('\r')) return { text: raw, at: null };
  let text = '';
  const at = new Array<number>(raw.length + 1);
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '\r') {
      // both halves of a CRLF point at the one LF that replaces them
      at[i] = text.length;
      if (raw[i + 1] === '\n') { at[i + 1] = text.length; i++; }
      text += '\n';
      i++;
    } else {
      at[i] = text.length;
      text += raw[i];
      i++;
    }
  }
  at[raw.length] = text.length;
  return { text, at };
}

/** `raw.slice(s, e).trim()`, with the trim taken off the offsets too. */
function trimRange(norm: string, s: number, e: number): Para {
  while (s < e && /\s/.test(norm[s])) s++;
  while (e > s && /\s/.test(norm[e - 1])) e--;
  return { text: norm.slice(s, e), s, e };
}

/** `norm.split(sep).map(trim).filter(Boolean)`, keeping each piece's range. */
function cutRanges(norm: string, sep: RegExp): Para[] {
  const out: Para[] = [];
  let last = 0;
  for (const m of norm.matchAll(sep)) {
    out.push(trimRange(norm, last, m.index!));
    last = m.index! + m[0].length;
  }
  out.push(trimRange(norm, last, norm.length));
  return out.filter((p) => p.text !== '');
}

/** Blank-line paragraphs. Some extractions (PDF pages, DOCX runs) arrive without
 *  blank lines at all — then single newlines are the only structure there is, and
 *  a file with neither reads as one long paragraph. That is the file's shape, not
 *  a guess: the word-level pass still finds the changes inside it. */
function paragraphRanges(norm: string): Para[] {
  const byBlank = cutRanges(norm, /\n\s*\n+/g);
  if (byBlank.length > 1) return byBlank;
  return cutRanges(norm, /\n/g);
}

/** The comparison's own view: the same split, text only. It is DERIVED from the ranges
 *  rather than written twice, because the clipboard mask lines a block up with its
 *  paragraph by index — two splitters that drifted apart would mask the wrong bytes. */
function paragraphs(raw: string): string[] {
  return paragraphRanges(normalizeNewlines(raw).text).map((p) => p.text);
}

/** Words carrying their own trailing space, so rendering keeps the original
 *  spacing while the comparison only ever looks at the word. */
function tokenize(p: string): string[] {
  return p.match(/\S+\s*/g) ?? [];
}

/**
 * Longest-common-subsequence alignment of two string sequences.
 * Common head and tail are trimmed first (two versions of one document usually
 * share most of both), then a forward-filled DP table is walked once.
 * Returns ops in document order; `degraded` means the table would have been too
 * large, so the middle is reported as a wholesale replacement instead.
 */
function align(a: string[], b: string[]): { ops: Op[]; degraded: boolean } {
  const ops: Op[] = [];
  const na = a.length;
  const nb = b.length;
  let head = 0;
  while (head < na && head < nb && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < na - head && tail < nb - head && a[na - 1 - tail] === b[nb - 1 - tail]) tail++;
  for (let i = 0; i < head; i++) ops.push({ k: 'same', ai: i, bi: i });

  const n = na - head - tail;
  const m = nb - head - tail;
  let degraded = false;

  if (n > 0 && m > 0 && n * m > CELL_CAP) {
    degraded = true;
    for (let i = 0; i < n; i++) ops.push({ k: 'del', ai: head + i, bi: head });
    for (let j = 0; j < m; j++) ops.push({ k: 'ins', ai: head + n, bi: head + j });
  } else if (n === 0 || m === 0) {
    for (let i = 0; i < n; i++) ops.push({ k: 'del', ai: head + i, bi: head });
    for (let j = 0; j < m; j++) ops.push({ k: 'ins', ai: head + n, bi: head + j });
  } else {
    const w = m + 1;
    const dp = new Int32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      const row = i * w;
      const next = (i + 1) * w;
      for (let j = m - 1; j >= 0; j--) {
        dp[row + j] = a[head + i] === b[head + j]
          ? dp[next + j + 1] + 1
          : Math.max(dp[next + j], dp[row + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[head + i] === b[head + j]) { ops.push({ k: 'same', ai: head + i, bi: head + j }); i++; j++; }
      // deletions before insertions on a tie, so a replaced run reads del-then-ins
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push({ k: 'del', ai: head + i, bi: head + j }); i++; }
      else { ops.push({ k: 'ins', ai: head + i, bi: head + j }); j++; }
    }
    while (i < n) { ops.push({ k: 'del', ai: head + i, bi: head + m }); i++; }
    while (j < m) { ops.push({ k: 'ins', ai: head + n, bi: head + j }); j++; }
  }

  for (let t = 0; t < tail; t++) ops.push({ k: 'same', ai: na - tail + t, bi: nb - tail + t });
  return { ops, degraded };
}

interface Seg { k: Kind; core: string; tail: string }

/** Word-level marks inside one changed paragraph. */
function wordSegs(before: string, after: string): { segs: Seg[]; degraded: boolean } {
  const at = tokenize(before);
  const bt = tokenize(after);
  const { ops, degraded } = align(at.map((t) => t.trimEnd()), bt.map((t) => t.trimEnd()));
  const runs: Array<{ k: Kind; text: string }> = [];
  for (const op of ops) {
    const text = op.k === 'ins' ? bt[op.bi] : at[op.ai];
    if (text === undefined) continue;
    const last = runs[runs.length - 1];
    if (last && last.k === op.k) last.text += text;
    else runs.push({ k: op.k, text });
  }
  const segs = runs.map((r) => {
    const m = /^([\s\S]*?)(\s*)$/.exec(r.text);
    return { k: r.k, core: m ? m[1] : r.text, tail: m ? m[2] : '' };
  }).filter((s) => s.core !== '' || s.tail !== '');
  return { segs, degraded };
}

type Block =
  | { kind: 'same'; n: number; text: string }
  | { kind: 'added'; n: number; text: string }
  | { kind: 'removed'; n: number; text: string }
  | { kind: 'changed'; n: number; was: number; before: string; after: string; sim: number; segs: Seg[] | null };

/** Word-bag Dice similarity, 0..1 — how much of the two paragraphs' vocabulary is shared. */
export function similarity(a: string, b: string): number {
  const bag = (s: string) => {
    const m = new Map<string, number>();
    for (const w of s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  };
  const A = bag(a), B = bag(b);
  let na = 0, nb = 0, both = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  if (!na && !nb) return 1;
  for (const [w, v] of A) both += Math.min(v, B.get(w) ?? 0);
  return (2 * both) / (na + nb);
}
/** A removed paragraph against an added one is called a REWRITE only when at least
 *  half its words survive. Below that the pair is two unrelated paragraphs that happen
 *  to sit in the same slot, and a strikethrough-plus-insert view of them draws a
 *  sentence neither version contains (audit B4). */
export const PAIR_MIN = 0.5;

interface Report {
  blocks: Block[];
  paras: number;
  changed: number;
  added: number;
  removed: number;
  same: number;
  coarse: boolean;
  paraDegraded: boolean;
  wordDegraded: boolean;
}

export function compare(earlier: string, later: string): Report {
  const a = paragraphs(earlier);
  const b = paragraphs(later);
  const coarse = a.length > COARSE_PARAS || b.length > COARSE_PARAS;
  const { ops, degraded: paraDegraded } = align(a, b);

  const blocks: Block[] = [];
  let wordDegraded = false;
  let i = 0;
  while (i < ops.length) {
    if (ops[i].k === 'same') {
      blocks.push({ kind: 'same', n: ops[i].bi + 1, text: b[ops[i].bi] });
      i++;
      continue;
    }
    const dels: Op[] = [];
    const inss: Op[] = [];
    while (i < ops.length && ops[i].k !== 'same') {
      if (ops[i].k === 'del') dels.push(ops[i]); else inss.push(ops[i]);
      i++;
    }
    // a removed paragraph sitting against an added one is one paragraph rewritten —
    // IF they share their words (PAIR_MIN); otherwise they are listed separately
    const paired = Math.min(dels.length, inss.length);
    for (let p = 0; p < paired; p++) {
      const before = a[dels[p].ai];
      const after = b[inss[p].bi];
      const sim = similarity(before, after);
      if (sim < PAIR_MIN) {
        blocks.push({ kind: 'removed', n: dels[p].ai + 1, text: before });
        blocks.push({ kind: 'added', n: inss[p].bi + 1, text: after });
        continue;
      }
      let segs: Seg[] | null = null;
      if (!coarse) {
        const w = wordSegs(before, after);
        segs = w.segs;
        if (w.degraded) wordDegraded = true;
      }
      blocks.push({ kind: 'changed', n: inss[p].bi + 1, was: dels[p].ai + 1, before, after, sim, segs });
    }
    for (let p = paired; p < dels.length; p++) blocks.push({ kind: 'removed', n: dels[p].ai + 1, text: a[dels[p].ai] });
    for (let p = paired; p < inss.length; p++) blocks.push({ kind: 'added', n: inss[p].bi + 1, text: b[inss[p].bi] });
  }

  return {
    blocks,
    paras: b.length,
    changed: blocks.filter((x) => x.kind === 'changed').length,
    added: blocks.filter((x) => x.kind === 'added').length,
    removed: blocks.filter((x) => x.kind === 'removed').length,
    same: blocks.filter((x) => x.kind === 'same').length,
    coarse,
    paraDegraded,
    wordDegraded,
  };
}

// ── What goes on the clipboard ───────────────────────────────────────────────────────
// The list ABOVE reads the documents as they stand, and so does Review: reading your own
// files on your own machine is the job. The clipboard is the other thing entirely — it is
// the one surface in this app that manufactures document text on demand for pasting into
// a frontier model — and until 2026-09-23 "Copy the changes" pushed b.before / b.after /
// b.text onto it verbatim. Those are slices of f.text, which is the ORIGINAL document
// (App.tsx stores text: r.doc, the folded original, not the mask — that is why
// Export's exportPlan has to call remask() to get redacted bytes at all). Every name in every
// changed paragraph travelled, one line under a screen that said "Both documents stay on
// this machine".
//
// The mask is the export's own (lib/engine.ts remask), applied BY OFFSET rather than
// re-run paragraph by paragraph. Re-running it on an isolated paragraph is NOT the same
// operation: footprintRegex joins a span's tokens with \s+ (lib-core/anonymize.mjs:428),
// so a name the extractor wrapped across a line break is ONE placement over the whole
// document and two unmatchable halves once the splitter has cut between them — and the
// fallback splitter cuts on every single newline, which is the shape PDF and .docx text
// arrives in. Cutting the document's own placements out of each paragraph's byte range
// cannot lose that name: the placement overlaps both paragraphs, and both get the tag.

/** A stretch of the document the export mask replaces, in normalized-text offsets. */
interface Span { s: number; e: number; tag: string }

/** One side of the comparison, prepared for the clipboard. */
export interface Side {
  /** the queue's QFile.id — the file's identity. The name is not one: two drafts of one
   *  agreement are routinely both "Agreement.docx", dropped from two folders. */
  id: string;
  name: string;
  /** the document with its newlines normalized — what `paras` indexes into */
  norm: string;
  paras: Para[];
  /** the export mask, sorted and non-overlapping */
  spans: Span[];
  /** the rows the mask is meant to have removed — the verify-by-extraction list */
  kept: Entity[];
  /** the always-redact list's terms the fragment check asks for beside `kept` (engine.ts
   *  fragmentTerms: every term but one the lawyer left readable in this document) */
  terms?: string[];
  /** non-null = this document may not go on the clipboard, in the words the screen prints */
  held: string | null;
  /** with `held`: what the lawyer does to clear it, as a whole sentence. A refusal that
   *  names no road leaves the lawyer guessing which screen fixes it. */
  way: string | null;
}

/** The export mask for one document, or the reason there is not one. The gates are
 *  Export's own, in Export's order — no table, no review, incomplete run, nothing kept,
 *  divergence, a declared term still readable (Export.tsx `!file.entities`,
 *  `!file.sample && !file.reviewed`, then lib/engine.ts exportPlan's `incomplete`,
 *  `nothingKept`, `rm.divergence`, `holds`) — because this button is a second export path
 *  and must not be an easier one. The mask and the list check are exportPlan's, the call
 *  Export makes, so the two paths cannot drift apart on either.
 *
 *  The list gate was missing here until 2026-09-23: a term added to the always-redact list
 *  after both drafts were read went onto the clipboard readable under "Copied, redacted"
 *  while Export held the same document over it. `terms` defaults to the list as saved,
 *  read when the pair is picked (Settings is another lane, so Compare remounts after it).
 *
 *  The review gate was briefly left out here on the argument that "a review only ever
 *  kills rows, so an unreviewed table masks more". That premise is false: Review ADDS
 *  rows (select-to-redact mints 'added by you' rows, Review.tsx addSpan; a model-cleared
 *  suspect becomes a row only through its "Redact…" button) and WIDENS them (drag-to-
 *  extend, Review.tsx extendSpan — written for the engine's classic partial catch, "Lim"
 *  taken and "Bo Seng" left readable). Measured without this gate (2026-09-23 verifier
 *  harness): an engine run that left a name off its table put that name on the clipboard
 *  under "Copied ✓ — redacted", and an engine run that returned an EMPTY table put the
 *  whole changed text there with "0 tags" — Export refuses both documents, and App's
 *  openExport says why: nothing exports without your review. The same rule covers the
 *  document no engine ever read (an offline run lands 'ready' with only declared terms
 *  and safety-net rows, App.tsx stripInto, the !up branch). */
export function maskSide(f: QFile, terms: string[] = loadProtectedTerms()): Side {
  const raw = f.text ?? '';
  const { text: norm, at } = normalizeNewlines(raw);
  const base = { id: f.id, name: f.name, norm, paras: paragraphRanges(norm), spans: [] as Span[], kept: [] as Entity[] };
  // Each way through names the control that exists today (Review's finish button, by the
  // label lib/review.ts gives it; its Ignored filter and that row's "Redact again"; Drop's
  // queue row and its Export button) and the road Export's own held rows give for the same
  // gate — re-dropping for an unfinished run or a failed mask.
  const hold = (why: string, way: string): Side => ({ ...base, held: why, way });
  // A file Drop holds can still carry the text and the empty table it had while queued:
  // when App's strip loop falls over, every file behind it goes 'held' with both kept
  // (App.tsx addFiles). Without this case it fell through to the review gate and was
  // sent to Review — a road it does not have: Drop gives a held row no Review button,
  // History reopens only 'ready' files, and Find skips an empty table. Drop's own
  // reason is quoted because it is the only account of what stopped.
  if (f.state === 'held' || f.state === 'error') {
    const said = (f.reason ?? '').trim().replace(/[.\s]+$/, '');
    return hold(`is held on Drop, so the engine never finished reading it and there is no table to mask with${said ? ` — Drop’s row says “${said}”` : ''}`, 'Drop the file in again to re-run the engine, open the new copy in Review and finish the review, then pick that copy here.');
  }
  if (!f.entities) return hold('has no entity table at all — nothing has read it yet', 'Drop the file in again so the engine reads it, then open it in Review and finish the review.');
  if (awaitingEngine(f)) {
    return f.state === 'stripping'
      ? hold('is being redacted right now, so its table is not final', 'Wait for the run to finish — Drop shows its progress — then open it in Review and finish the review.')
      : hold('has not been redacted yet — it is still waiting in the queue', 'Wait for its turn — Drop shows where it sits in line — then open it in Review and finish the review.');
  }
  // A finish a later change took off (lib/attest.ts recheckFinish) is not a document nobody
  // reviewed: Export and this screen said it was until 2026-09-23, and sent the lawyer to
  // "decide every row" of a table they had finished, without naming the change that took
  // the finish off. The note names text from the original, as the comparison below does; a
  // refusal never reaches the clipboard (redactedChanges returns text: null with it).
  if (!f.sample && !f.reviewed && f.reopened) return hold(`has changed since you finished its review — finish again. ${f.reopened.trim().replace(/[.\s]+$/, '')}`, `Open it in Review, where the same note stands at the top, and press “${FINISH_LABEL}” again once what it names is settled.`);
  if (!f.sample && !f.reviewed) return hold('has not been reviewed — nothing leaves this app until you have walked its table and confirmed it, and Export holds this document for the same reason', `Open it in Review, decide every row, and press “${FINISH_LABEL}”.`);
  // why it did not finish, and whether a new drop can change that (engine.ts unfinishedSaid): a
  // frozen-pipeline run whose tags did not align fails the same way on the same text, and "drop
  // the file in again" sent the lawyer round that loop (LAUNCH.md 4.11)
  if (!f.sample && f.engineComplete === false) {
    const u = unfinishedSaid(f.completeBy);
    return hold(`had an engine run that did not finish, so its table is incomplete — ${u.why} — and Export holds this document too`, u.again
      ? 'Drop the file in again to re-run the engine, review the new copy, and pick that copy here.'
      : 'Dropping the same file again is not expected to change this, because the frozen pipeline reads the same text the same way; the app has no other way through for this document.');
  }
  // Export's nothingKept: every row switched off means the mask would blank nothing the
  // table ever found, and Export holds that rather than ship the document as it stands.
  if (f.entities.length > 0 && f.entities.every((e) => e.dead)) return hold('has every row on its table switched off, so a copy would be the document as it stands — Export holds this document too', 'Open it in Review, choose the Ignored filter, and press “Redact again” on each name that must be masked — “Restore” on a row flagged as boilerplate.');
  const plan = exportPlan(f, terms, loadPractice());
  const rm = plan.rm;
  // Divergence means remask could not reproduce the frozen core's own bytes, and it
  // empties placements and floorHits when it says so (lib/engine.ts Remask.divergence).
  // Masking by offset against an empty list emits the document verbatim — which is
  // exactly the defect this section exists to close — so this refuses instead.
  if (rm.divergence) return hold(`could not be masked: ${rm.divergence}`, 'Drop the file in again; if this repeats, the fault is in this app, not in your review.');
  // Checked over the WHOLE masked document, as Export checks it, not only the paragraphs
  // that changed: which paragraphs go on the clipboard depends on the other draft, and a
  // gate that passed or held by the pairing would be one the lawyer cannot predict. The
  // button that masks a held term lives on Export's held row, because it writes the table.
  if (plan.holds.length) {
    const n = plan.holds.length;
    // plan.stuck: the terms whose button on Export would leave the hold in place (engine.ts
    // pressLifts). Export offers no button for those, so a way through that sent the lawyer
    // to "one button" there would send them to a button that is not on the page.
    const stuck = plan.holds.map((h) => h.term).filter((t) => plan.stuck.includes(t));
    const one = stuck.length === 1;
    // a stuck term written only with a percent-escape that writes no character (ListHold.esc):
    // the review's search does not find "René Tan" in "Ren%E9%20Tan", so the way names the escape
    const escs = plan.holds.filter((h) => h.esc && plan.stuck.includes(h.term)).map((h) => ` ${escapeWay(h.term, h.esc!)}`).join('');
    const way = stuck.length
      ? `On Drop, press Export on its row; the held row there says why. Masking ${stuck.join(', ')} from that page would leave ${one ? 'it' : 'them'} readable, so it offers no button for ${one ? 'it' : 'them'}: in Review, select the whole word ${one ? 'it is' : 'each is'} written into and redact it, or take ${one ? 'it' : 'them'} off the always-redact list in Settings${n > stuck.length ? `; the held row masks the other${n - stuck.length === 1 ? '' : 's'} with one button` : ''}.${escs} Then pick the document here again.`
      : `On Drop, press Export on its row; the held row there says why and masks ${n === 1 ? 'the term' : 'them'} in this document with one button. Then pick the document here again.`;
    // a term readable only IN PART (engine.ts ListHold.partly) is marked as Export marks it: a
    // lawyer told "Tan Wei Ling" is readable searches the text for the whole name and finds it
    // nowhere, since the copy carries "Wei Ling" beside a kept name's tag
    const said = plan.holds.map((h) => (h.partly ? `${h.term} (in part)` : h.term));
    return hold(`has ${n === 1 ? 'a term' : `${n} terms`} on your always-redact list still readable in its redacted text — ${said.join(', ')} — and Export holds this document for the same reason`, way);
  }
  // Export's verification (engine.ts exportPlan survivors): a kept row readable in the export,
  // whole or IN PART. The re-read in redactedChanges asks each row whole, in the paragraphs it
  // copies, and a row the mask leaves readable in part is whole nowhere — a kept "Tan Wei Ling"
  // of which "Wei Ling" stood readable passed it while Export held the same document. The mask
  // is the same one, so this asks Export's own answer rather than a second one of its own.
  if (!plan.verified) {
    const names = plan.survivors.map((e) => e.text);
    const one = names.length === 1;
    const find = `In Review, find ${one ? 'it' : 'each one'} in the document, select the whole word ${one ? 'it is' : 'each is'} written into and redact it`;
    // a kept name a percent-escape that writes no character may hide (engine.ts escaped): the
    // review's search does not find "René Tan" in "Ren%E9%20Tan", so the way names the escape
    return hold(`has ${one ? 'a row' : `${names.length} rows`} you chose to redact still readable, whole or in part, in its redacted text — ${names.join(', ')} — and Export holds this document for the same reason`, plan.escaped ? `${find}. ${escapeWay(plan.escaped.name, plan.escaped.esc)} Then pick the document here again.` : `${find}; then pick the document here again.`);
  }
  const off = (i: number) => (at ? at[i] : i);
  const claims: Span[] = [];
  for (const p of rm.placements) claims.push({ s: off(p.s), e: off(p.e), tag: p.tag });
  // An exempt floor hit is a dead floor row: the export leaves that text readable on
  // purpose (lib/engine.ts applyFloor), and so does this. A hit with no original offset
  // (s < 0) lies entirely inside an emitted tag and has no bytes here to cut.
  for (const h of rm.floorHits) if (!h.exempt && h.s >= 0) claims.push({ s: off(h.s), e: off(h.e), tag: h.tag });
  claims.sort((x, y) => x.s - y.s || y.e - x.e);
  const spans: Span[] = [];
  for (const c of claims) {
    if (c.e <= c.s) continue;
    const last = spans[spans.length - 1];
    // overlaps are merged, never dropped: a floor hit whose original range reaches across
    // a table tag would otherwise re-emit the very text the table already replaced
    if (last && c.s < last.e) { if (c.e > last.e) last.e = c.e; continue; }
    spans.push({ ...c });
  }
  return { ...base, spans, kept: f.entities.filter((e) => !e.dead), terms: fragmentTerms(f.entities, terms), held: null, way: null };
}

/** Why the clipboard is refused before anything is built, or null — whole sentences, one
 *  per held document, each naming its side in the pickers' own words as well as its file
 *  name and ending on the way through. Rendered on screen as soon as the pair is picked:
 *  a held export says so before the lawyer reaches for the button, and so does this.
 *
 *  The two sides are told apart by FILE IDENTITY. They were once told apart by name, so
 *  v1/Agreement.docx and v2/Agreement.docx, held for two different reasons, printed only
 *  the earlier one's: the lawyer cleared it, pressed again, and met the second refusal
 *  for the first time. The one real duplicate is the same file in both pickers. */
export function copyHeld(a: Side, b: Side): string | null {
  const say = (who: string, s: Side) => `${who}, ${s.name}, ${s.held}. ${s.way}`;
  if (a.id === b.id) return a.held ? say('The file in both pickers', a) : null;
  const parts = [
    a.held ? say('The earlier version', a) : '',
    b.held ? say('The later version', b) : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** One paragraph with the document's own placements cut out of it, and how many tags
 *  that took. A placement that merely overlaps the paragraph is clipped to it and still
 *  tagged: at the seam this masks a little more, never less. `plain` is the same paragraph
 *  with each tag standing as TAG_BLANK — the words a reader meets in it, which is what the
 *  names are re-read out of (engine.ts exportReadable says why a tag is not one of them). */
function maskPara(side: Side, p: Para): { text: string; plain: string; tags: number } {
  let out = '';
  let plain = '';
  let pos = p.s;
  let tags = 0;
  for (const sp of side.spans) {
    if (sp.e <= p.s) continue;
    if (sp.s >= p.e) break;
    if (sp.s > pos) { out += side.norm.slice(pos, sp.s); plain += side.norm.slice(pos, sp.s); }
    out += sp.tag;
    plain += TAG_BLANK;
    tags++;
    pos = Math.min(sp.e, p.e);
  }
  return { text: out + side.norm.slice(pos, p.e), plain: plain + side.norm.slice(pos, p.e), tags };
}

export interface Changes {
  /** what goes on the clipboard — null when the copy is refused */
  text: string | null;
  /** why it was refused, in the words the screen prints */
  refusal: string | null;
  /** measured on what was actually built */
  paras: number;
  tags: number;
  /** partial names still readable in it — stated, never a hold (see below) */
  frags: number;
  /** those partial names, for the note on THIS screen only — never put on the clipboard */
  fragWords: string[];
}

/** The changes, redacted, with their own scope stated on them. Fail-closed at three
 *  points: a document with no usable table, a block that cannot be lined up with the
 *  paragraph it came from, and a name that survived the mask. Each one copies NOTHING —
 *  copying less would be a redline missing the paragraphs it could not mask, which reads
 *  exactly like a document that did not change there. */
export function redactedChanges(a: Side, b: Side, report: Report): Changes {
  const no = (why: string): Changes => ({ text: null, refusal: why, paras: 0, tags: 0, frags: 0, fragWords: [] });
  const held = copyHeld(a, b);
  if (held) return no(`Nothing was copied. ${held} The clipboard would have carried document text that Export would not release, so the copy is held — the comparison on screen still reads both documents as they are.`);

  const body: string[] = [];
  const plain: string[] = [];
  let tags = 0;
  let broke = false;
  /** A block carries a paragraph INDEX (compare() records bi + 1 and ai + 1); the mask
   *  needs that paragraph's byte range. Both come out of paragraphRanges, so the texts
   *  agree by construction — and the agreement is checked anyway, because if it ever
   *  stops holding the mask would cut the wrong bytes and still call itself redacted. */
  const take = (side: Side, idx: number, expect: string): string => {
    const p = side.paras[idx];
    if (!p || p.text !== expect) { broke = true; return ''; }
    const m = maskPara(side, p);
    tags += m.tags;
    body.push(m.text);
    plain.push(m.plain);
    return m.text;
  };

  const lines: string[] = [];
  for (const bl of report.blocks) {
    if (bl.kind === 'same') continue;
    if (bl.kind === 'changed') {
      const before = take(a, bl.was - 1, bl.before);
      const after = take(b, bl.n - 1, bl.after);
      lines.push(`Paragraph ${bl.n} — changed (${Math.round(bl.sim * 100)}% of its words kept)`, `- ${before}`, `+ ${after}`, '');
    } else {
      const t = take(bl.kind === 'added' ? b : a, bl.n - 1, bl.text);
      lines.push(`Paragraph ${bl.n} — ${bl.kind}`, `${bl.kind === 'added' ? '+' : '-'} ${t}`, '');
    }
  }
  if (broke) return no('Nothing was copied: a paragraph in the list could not be lined up with its place in the document, so the app cannot say which bytes the mask covers. That is a fault in this app, not in your documents — the comparison on screen is unaffected.');

  // Verify by extraction, the same check the export runs over its own bytes (the receipt's
  // verify-by-extraction line in Export.tsx): every row either table means to remove, re-read
  // out of the text that is about to be copied. Only the document text is in this check — a paragraph number
  // or a percentage in the scaffolding would otherwise match a table row that is a bare
  // number and hold a clean copy. The sentinel between paragraphs is what the payload
  // itself puts there: on the clipboard every two paragraph bodies have a "Paragraph N —"
  // or a "+ " between them, so no span is ever spelled across a seam that only this join
  // creates.
  // Re-read out of the paragraphs' readable words, the tags blanked: the tags are not the
  // document's words, and a row "Card" or "Phone" was found in the "[card]" and "[phone]"
  // this mask wrote, holding a clean copy (engine.ts exportReadable).
  const built = plain.join('\n\u0000\n');
  const survived = new Set<string>();
  // rowSurvives, as Export asks it: a protected row is masked with the tolerant match, so
  // it is re-read with it too; the footprint alone does not see a straight-apostrophe
  // "O'Brien" left readable where the row is "O’Brien"
  for (const side of [a, b]) for (const e of side.kept) if (rowSurvives(built, e)) survived.add(e.text);
  if (survived.size) {
    const list = [...survived];
    return no(`Nothing was copied: ${list.length} name(s) the tables mean to remove are still readable in the text that was about to go on the clipboard — ${list.slice(0, 5).join(', ')}${list.length > 5 ? `, and ${list.length - 5} more` : ''}. The copy is held.`);
  }

  // Fragments are STATED, never held on — the same call the export receipt makes (its
  // fragment line in Export.tsx) and the same judgment behind it: a bare "Hastings" surviving
  // where "Hastings Holdings Ltd" is the row is usually the document's own word, and holding
  // every copy over one would hold nearly every copy. It is said because the line above
  // ("re-read out of this text") is a claim about WHOLE spans, and this is exactly where
  // that claim stops. Table rows only: the safety-net rows are numbers, not names.
  // COUNTED on the clipboard, never named, as the receipt counts them: the payload is written
  // to be pasted into a model, and "partial name … — Hastings" beside the text told it that
  // the readable "Hastings" is part of a name the copy masks — with the paragraph holding
  // [Company1] not even on the clipboard, the one thing that said the masked party exists
  // (2026-09-23). The pieces are named on this screen only (fragWords), each as the copy writes
  // it (engine.ts survivingFragments). The always-redact list's terms are asked too, as Export
  // asks them: with the tables alone, "Mr Kestrel12 replied." for a listed "Kestrel Capital
  // Partners" with no row went on the clipboard under "no fragment of any listed name" (F5-TERMS).
  const frags = survivingFragments(built, [...a.kept, ...b.kept].filter((e) => !isFloorRow(e)), [...new Set([...(a.terms ?? []), ...(b.terms ?? [])])]);
  const head = [
    'Compare — the earlier version against the later one',
    `${report.paras} paragraphs · ${report.changed} changed · ${report.added} added · ${report.removed} removed · ${report.same} unchanged`,
    '',
    `Redacted for sending: every line of document text below is masked with its own document's entity table and the safety-net pattern — the same mask the Export screen ships (lib/engine.ts remask) — ${tags} tag${tags === 1 ? '' : 's'} across ${body.length} paragraph${body.length === 1 ? '' : 's'}, and every name on both tables was then re-read out of this text to check it had gone.`,
    "Scope: the two file names are NOT here — a file name is not part of either document, so neither table covers it. Tags are numbered per document: [Person1] in the earlier version and [Person1] in the later one are not necessarily the same person. The comparison itself was computed on the documents as they stand, BEFORE masking, so a paragraph listed as changed whose two lines now read alike changed only in text both tables masked. Anything neither table lists is still here, and nothing below was read for meaning.",
    frags.length
      ? `Fragment check: ${frags.length} partial name${frags.length === 1 ? '' : 's'} of listed names may be readable below — not named here, because the tables list the longer span.`
      : `Fragment check: no partial name of a listed name found. The check reads ${FRAG_HOW}.`,
    '',
  ];
  return { text: [...head, ...lines].join('\n'), refusal: null, paras: body.length, tags, frags: frags.length, fragWords: frags };
}

const SNIPPET: React.CSSProperties = {
  fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.65, color: 'var(--ink)',
  background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 6, padding: '9px 12px',
  whiteSpace: 'pre-wrap',
};
const PICKER: React.CSSProperties = {
  font: 'inherit', fontSize: 13, color: 'var(--ink)', background: 'var(--paper)',
  border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px', width: '100%', maxWidth: 340,
};

/** What the pickers print for each file they list. A name two files on Drop share gets
 *  its place among them on the Drop list and the file's own line from under its name
 *  there (words, then size, parts or pages): without it the two options for
 *  v1/Agreement.docx and v2/Agreement.docx read identically, and a lawyer can compare
 *  the drafts backwards — every insertion reported as a deletion — with nothing on
 *  screen to say so. A unique name prints as itself.
 *
 *  The ordinal is counted over EVERY file Drop lists (`all`, in Drop's order), not only
 *  the ones the pickers offer: Drop also shows rows with no text — a failed read, a
 *  scanned PDF — and an ordinal counted without them names the wrong Drop row the
 *  moment one of those shares the name. */
export function pickerLabels(all: QFile[], shown: QFile[]): Map<string, string> {
  const count = new Map<string, number>();
  const place = new Map<string, number>();
  for (const f of all) {
    const n = (count.get(f.name) ?? 0) + 1;
    count.set(f.name, n);
    place.set(f.id, n);
  }
  const out = new Map<string, string>();
  for (const f of shown) {
    const k = count.get(f.name) ?? 1;
    const n = place.get(f.id);
    if (k < 2 || n === undefined) { out.set(f.id, f.name); continue; }
    out.set(f.id, `${f.name} — ${n} of ${k} by this name on Drop${f.meta ? ` · ${f.meta}` : ''}`);
  }
  return out;
}

export default function Compare({ files, onGoToDrop }: Props) {
  const usable = useMemo(() => files.filter((f) => typeof f.text === 'string' && f.text.trim().length > 0), [files]);
  const [earlierId, setEarlierId] = useState('');
  const [laterId, setLaterId] = useState('');
  const [showSame, setShowSame] = useState(false);
  const [copied, setCopied] = useState(false);
  /** what the last copy attempt did, in words — the success states what went on the
   *  clipboard, the failure states that nothing did and why */
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const label = useMemo(() => pickerLabels(files, usable), [files, usable]);

  const earlier = usable.find((f) => f.id === earlierId) ?? null;
  const later = usable.find((f) => f.id === laterId) ?? null;

  // Escape clears the pair — the fastest way back to a clean slate
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && /input|textarea/i.test(t.tagName)) return;
      setEarlierId('');
      setLaterId('');
      setCopied(false);
      setNote(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const report = useMemo<Report | null>(
    () => (earlier?.text && later?.text ? compare(earlier.text, later.text) : null),
    [earlier?.text, later?.text],
  );

  // The clipboard's mask, per document. Computed here rather than inside the click so
  // the screen can say the copy is held BEFORE the lawyer reaches for the button —
  // Export's held rows work that way, and a button that only refuses once pressed is a
  // promise the screen never made. Keyed on the file objects: App patches one file at a
  // time (setFiles maps and leaves the others identical), so this recomputes when a
  // table changes and not when some other document's does.
  const sides = useMemo(
    () => (earlier?.text && later?.text ? { a: maskSide(earlier), b: maskSide(later) } : null),
    [earlier, later],
  );
  const held = useMemo(() => (sides ? copyHeld(sides.a, sides.b) : null), [sides]);

  // The last press's note is cleared when the pair changes AND when the hold does. This
  // screen stays mounted while the strip loop runs, so a queued side lands, the hold moves
  // on from "wait for its turn" to "finish the review" — and the live held row, which
  // stands down while a note is up, stayed hidden behind a refusal that still said wait.
  useEffect(() => { setCopied(false); setNote(null); }, [earlierId, laterId, held]);

  const copyChanges = async () => {
    if (!report || !earlier || !later || !sides) return;
    const out = redactedChanges(sides.a, sides.b, report);
    if (out.text === null) { setCopied(false); setNote({ ok: false, text: out.refusal! }); return; }
    let ok = false;
    try {
      await navigator.clipboard.writeText(out.text);
      ok = true;
    } catch {
      // clipboard permission can be refused; the textarea path always works
      const ta = document.createElement('textarea');
      ta.value = out.text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(ok);
    setNote(ok
      ? { ok: true, text: `Copied, redacted — ${out.paras} paragraph${out.paras === 1 ? '' : 's'} of document text, ${out.tags} tag${out.tags === 1 ? '' : 's'} placed, both file names left off. Re-read afterwards: no name from either table is in what went on the clipboard${out.frags ? `, though ${out.frags} partial name${out.frags === 1 ? '' : 's'} of listed names ${out.frags === 1 ? 'is' : 'are'}: ${out.fragWords.join(', ')}. The copy counts ${out.frags === 1 ? 'it' : 'them'} at the top without naming ${out.frags === 1 ? 'it' : 'them'}; read the lines that carry ${out.frags === 1 ? 'it' : 'them'} before you paste` : ''}.` }
      : { ok: false, text: 'Nothing was copied: this window could not reach the clipboard, by either road. Nothing was put anywhere.' });
  };

  /** Export's held row, in its own colours — a refusal on an egress path is not a hint. */
  const HELD_ROW: React.CSSProperties = {
    color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)',
    borderRadius: 6, padding: '7px 10px', marginTop: 0, marginBottom: 12,
  };

  const honesty = (
    <div className="postnote">
      This screen finds every textual difference between the two versions, deterministically — if a
      word moved, it is in the list below. A paragraph is shown as a rewrite only when at least half
      its words survive; below that, the removed and the added paragraph are listed separately, so a
      strikethrough never shows a sentence neither version contains. It does not yet judge which of
      those changes are legally material; that judgment has not been built or measured, so the
      reading stays yours.
    </div>
  );

  if (usable.length < 2) {
    return (
      <section className="screen">
        <h1>Compare versions</h1>
        <div className="sub">
          Two versions of the same document, lined up so you can see what actually changed — your own
          check, not the other side's account of it.
        </div>
        <div className="setcard" style={{ maxWidth: 560 }}>
          <div className="srow" style={{ gap: 10, alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mut)" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="8" height="16" rx="1.5" /><rect x="13" y="4" width="8" height="16" rx="1.5" /></svg>
            <b>{usable.length === 0 ? 'No documents to compare yet' : 'One document is not a comparison'}</b>
          </div>
          <div className="srow" style={{ color: 'var(--ink2)' }}>
            Comparing needs two documents with readable text in the queue — the earlier version and the
            later one. {usable.length === 1 ? 'One is loaded; drop the other version in.' : 'Drop both in, then come back here.'}
          </div>
          <div className="srow">
            <button className="btn-plain" onClick={onGoToDrop}>Go to Drop</button>
          </div>
        </div>
        {honesty}
      </section>
    );
  }

  return (
    <section className="screen wide">
      <h1>Compare versions</h1>
      <div className="sub">
        Two versions of the same document, lined up so you can see what actually changed — your own
        check, computed here from the text, not the other side's account of it.
      </div>

      <div className="setcard" style={{ maxWidth: 'none' }}>
        <div className="srow" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="k" htmlFor="cmp-earlier" style={{ flex: 'none', width: 120, color: 'var(--ink)' }}>Earlier version</label>
          <select id="cmp-earlier" style={PICKER} value={earlierId} onChange={(e) => setEarlierId(e.target.value)}>
            <option value="">Choose a document…</option>
            {usable.map((f) => <option key={f.id} value={f.id}>{label.get(f.id) ?? f.name}</option>)}
          </select>
        </div>
        <div className="srow" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="k" htmlFor="cmp-later" style={{ flex: 'none', width: 120, color: 'var(--ink)' }}>Later version</label>
          <select id="cmp-later" style={PICKER} value={laterId} onChange={(e) => setLaterId(e.target.value)}>
            <option value="">Choose a document…</option>
            {usable.map((f) => <option key={f.id} value={f.id}>{label.get(f.id) ?? f.name}</option>)}
          </select>
        </div>
        {/* This line used to say only "Both documents stay on this machine", one screen
            away from the button that put both documents' raw text on the clipboard. The
            documents do stay; the clipboard is the exception, so the exception is what
            this says. */}
        <div className="srow" style={{ color: 'var(--mut)', fontSize: 12.5, paddingTop: 2 }}>
          Both documents stay on this machine — the comparison runs in this tab and reads them as
          they are. The clipboard is the one thing that leaves, and it is redacted: <b>Copy the
          changes</b> masks every paragraph it copies with that document's own entity table first,
          leaves both file names off, and copies nothing at all until both documents have been redacted and reviewed
          and no term on your always-redact list is readable in either, unless you left it readable under Protected terms in that document’s review.{' '}
          <kbd>Esc</kbd> clears the pair.
        </div>
      </div>

      {!report && (
        <div className="postnote" style={{ color: 'var(--mut)' }}>
          Pick both versions to run the comparison.
        </div>
      )}

      {report && earlier && later && (
        <>
          {earlier.id === later.id && (
            <div className="postnote" style={{ color: 'var(--amber)' }}>
              Both pickers point at the same file, so of course nothing differs — pick the other version
              on one of them.
            </div>
          )}

          <div className="seclbl" style={{ marginTop: 22 }}>
            What changed
            <span className="cnt">{label.get(earlier.id) ?? earlier.name} → {label.get(later.id) ?? later.name}</span>
          </div>

          <div style={{ fontSize: 14, color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums', marginBottom: 12 }}>
            {report.paras} paragraphs · {report.changed} changed · {report.added} added · {report.removed} removed · {report.same} unchanged
            <span style={{ color: 'var(--mut)', fontSize: 12.5 }}> (counted in the later version)</span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <button className="chipf" data-on={showSame || undefined} onClick={() => setShowSame((s) => !s)}>
              {showSame ? 'Hide unchanged paragraphs' : 'Show unchanged paragraphs'} {report.same}
            </button>
            <button className="btn-plain" onClick={copyChanges} disabled={report.changed + report.added + report.removed === 0}
              title={held ? 'Held — see the line below' : 'Copies the changed paragraphs, masked with each document’s own entity table'}>
              {copied ? 'Copied ✓ — redacted' : 'Copy the changes'}
            </button>
          </div>

          {/* The copy is held, and the screen says so where the button is rather than
              waiting to be pressed. The button stays live: pressing it repeats the
              reason in the row below — which is why this one stands down once that row
              is up, rather than printing the same refusal twice in two reds. */}
          {held && !note && (
            <div className="postnote" style={HELD_ROW}>
              ✗ Copying is held. {held} The comparison below still reads both documents as they
              are — nothing has left this machine, and nothing would.
            </div>
          )}
          {note && (
            <div className="postnote" style={note.ok ? { color: 'var(--go)', marginTop: 0, marginBottom: 12 } : HELD_ROW}>
              {note.ok ? '✓ ' : '✗ '}{note.text}
            </div>
          )}

          {report.coarse && (
            <div className="postnote" style={{ color: 'var(--amber)', marginTop: 0, marginBottom: 12 }}>
              One of these documents runs past {COARSE_PARAS.toLocaleString()} paragraphs, so the comparison is
              paragraph-level only — a changed paragraph is shown whole, without the word-by-word marks.
            </div>
          )}
          {report.paraDegraded && (
            <div className="postnote" style={{ color: 'var(--amber)', marginTop: 0, marginBottom: 12 }}>
              The differing stretch was too large to align paragraph-by-paragraph, so it is reported as one
              wholesale replacement rather than matched pairs. The text below is still complete.
            </div>
          )}
          {report.wordDegraded && (
            <div className="postnote" style={{ color: 'var(--amber)', marginTop: 0, marginBottom: 12 }}>
              At least one changed paragraph was too long to mark word-by-word; it is shown as the old text
              struck out followed by the new text.
            </div>
          )}

          {report.changed + report.added + report.removed === 0 && (
            <div className="setcard" style={{ maxWidth: 560 }}>
              <div className="srow" style={{ color: 'var(--ink2)' }}>
                <b style={{ color: 'var(--ink)' }}>No textual differences.</b>
              </div>
              <div className="srow" style={{ color: 'var(--ink2)' }}>
                Every paragraph in the later version matches one in the earlier version, in the same order.
                Formatting, comments and tracked-change metadata are not part of this comparison.
              </div>
            </div>
          )}

          {report.blocks.map((b, idx) => {
            if (b.kind === 'same') {
              if (!showSame) return null;
              return (
                <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '7px 2px', color: 'var(--mut)' }}>
                  <span className="etag" style={{ marginTop: 3 }}>Paragraph {b.n}</span>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', minWidth: 0 }}>{b.text}</span>
                </div>
              );
            }
            const meta = LABEL[b.kind];
            return (
              <div key={idx} className="setcard" style={{ maxWidth: 'none', marginBottom: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 9 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: meta.color }}>
                    <i style={{ width: 8, height: 8, borderRadius: 2, background: meta.color, display: 'inline-block' }} aria-hidden="true" />
                    {meta.word}
                  </span>
                  <span className="etag" style={{ marginLeft: 'auto' }}>Paragraph {b.n}</span>
                  {b.kind === 'changed' && b.was !== b.n && (
                    <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>was paragraph {b.was}</span>
                  )}
                  {b.kind === 'changed' && (
                    <span style={{ fontSize: 11.5, color: 'var(--mut)' }} title="Share of the two paragraphs' words that both contain — the gate on calling this a rewrite is one half">{Math.round(b.sim * 100)}% of its words kept</span>
                  )}
                  {b.kind === 'removed' && (
                    <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>of the earlier version</span>
                  )}
                </div>

                {b.kind === 'changed' ? (
                  b.segs ? (
                    <div style={SNIPPET}>
                      {b.segs.map((s, i) => (
                        s.k === 'del' ? (
                          <span key={i}><del style={{ color: 'var(--mut)' }}>{s.core}</del>{s.tail}</span>
                        ) : s.k === 'ins' ? (
                          <span key={i}><ins style={{ textDecoration: 'none', background: 'var(--w-term)', borderRadius: 3, padding: '0 2px' }}>{s.core}</ins>{s.tail}</span>
                        ) : (
                          <span key={i}>{s.core}{s.tail}</span>
                        )
                      ))}
                    </div>
                  ) : (
                    <>
                      <div style={{ ...SNIPPET, color: 'var(--mut)', textDecoration: 'line-through', marginBottom: 6 }}>{b.before}</div>
                      <div style={SNIPPET}>{b.after}</div>
                    </>
                  )
                ) : (
                  <div style={b.kind === 'removed' ? { ...SNIPPET, color: 'var(--mut)' } : SNIPPET}>{b.text}</div>
                )}
              </div>
            );
          })}
        </>
      )}

      {honesty}
    </section>
  );
}
