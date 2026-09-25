// The engine bridge: the measured pipeline (repo-root lib/) runs HERE in the
// webview — pure JS, zero I/O — and reaches the model only through the
// tauri.ts chokepoint. This file owns the translation between the engine's
// table rows and the review screen's Entity shape; nothing else touches both.
import { maskWithTable, propagateProperPrefixes, footprintRegex, foldFullwidth, FLOOR_RULES } from '../../../../lib-core/anonymize.mjs';
import { completeLocal, legalServiceHealth, stripLegalService, type CompleteOpts, type LegalRow } from './tauri';
import { coreRun, engineIdentity, inAppCoreStamp, type CoreRun, type EngineIdentity } from './engineStatus';
import { loadProtectedTerms } from './protected';
import { refFind, refNames, refCompact, pctHidden, pctDecoded, hasEscape, nonProseToken, REF_INVISIBLE, RUN_FLOOR, type RefName, type RefFind } from './extract/docxWrite';
import { JURISDICTION_RULES, PRACTICE_TAG_WORD, practiceLabel } from './floorTables.mjs';
import { loadPractice, type Practice } from './practice';
import { loadProfile, profileLabel, type EngineProfile } from './profile';
import { andList, sideHeld, sideRowsOf, SIDE_SEAM, type SideRead, type SidePlace } from './side';
import type { Entity, QFile } from './store';

export interface StripOutcome {
  /** fullwidth-folded text — becomes the file's text of record so spans match */
  doc: string;
  entities: Entity[];
  /** model-cleared candidates — looked at, judged non-identity; the human confirms */
  suspects: Suspect[];
  /** the engine's own all-entities mask (kept for the receipt; exports re-mask kept rows) */
  masked: string;
  complete: boolean;
  completeBy: Record<string, boolean>;
  stats: Record<string, unknown>;
  /** a .docx's text outside its body, as the engine's separate read of it left it (readSide):
   *  absent for any other file */
  side?: SideRead;
}

export interface Suspect { text: string; verdict: string; occ: number }

interface EngineRow { span: string; cls: string; src: string; tag: string; junkSuspect?: true }

const CAT_OF: Record<string, Entity['cat']> = {
  PERSON: 'person', COMPANY: 'org', BRAND: 'org', ADDRESS: 'loc', LOC: 'loc',
  PHONE: 'contact', EMAIL: 'contact', ID: 'id', URL: 'id', DETAIL: 'detail',
  PROTECTED: 'protected',
};

/** The engine-native class of a user-declared term. Its whole job is to be NEITHER
 *  'COMPANY' nor 'PERSON': lib-core's propagateProperPrefixes gates on exactly those two
 *  names and skips every other value, so a protected row is masked as the span the user
 *  typed and nothing else. Until 2026-09-16 these rows carried no cls at all, placements
 *  defaulted them to 'PERSON', and a declared "Project Lantern Phase Two" also masked the
 *  bare "Project Lantern" everywhere in the document, which is the opposite of what the
 *  Settings card promises: matched exactly, as whole words. The core never reads the
 *  literal, only whether it is one of its two names; CAT_OF above already maps this one
 *  back to the protected category. simpler-red uses the same literal for the same reason,
 *  at lib/protected.mjs:130. It applies ONLY to a row minted here from a declared term;
 *  a row the engine classified keeps the engine's class, for the reason at withProtectedTerms
 *  below. */
const PROTECTED_CLS = 'PROTECTED';

// ---------- a declared term: one identity, one tolerant match ----------
// The always-redact list is TYPED by a lawyer and the documents are WRITTEN by Word, and the
// two disagree on characters nobody sees. Word's AutoFormat turns ' into ’ and a spaced
// hyphen into an en dash; a hyphenated name is kept together with U+2011; a document that
// passed through a Mac or a PDF converter carries é as e + U+0301; copy-paste from a web page
// brings a zero-width space; manual hyphenation leaves a soft hyphen inside a word; and a
// Japanese letterhead glues the katakana reading straight onto the Latin name, so the name
// has a LETTER on its left. The engine's footprint (lib-core, frozen) treats each of these
// as a different string. Measured 2026-09-23 on a letterhead holding the declared firm name:
// all seven shipped readable in the saved .docx, and the leak gate, masking with the same
// table, passed them. The Settings card promises "matched exactly, as whole words" — a
// lawyer reads "O’Brien" and "O'Brien" as the same word, so exactly means that.
//
// protectedRegex is a SUPERSET of footprintRegex(term): every string the footprint matches
// it matches too, so switching a row to it can only mask more. It is used for rows of the
// protected category only; an engine row keeps the frozen footprint (FREEZE.md).
const INVISIBLE = '\\u00ad\\u200b-\\u200d\\u2060\\ufeff';
const INVISIBLE_RE = /[­​-‍⁠﻿]/g;
const APOSTROPHES = "'‘’ʼ′＇";
const DASHES = '-‐‑‒–—―−﹣－';
const APOS_CLASS = `[${APOSTROPHES}]`;
const DASH_CLASS = `[\\${DASHES}]`;
const APOS_RE = new RegExp(APOS_CLASS, 'g');
const DASH_RE = new RegExp(DASH_CLASS, 'g');
/** a letter on the edge of a term blocks a match, as in the footprint — unless it is CJK, a
 *  script written without spaces, where the next character is always a letter; and a term
 *  whose own edge is CJK is guarded on neither side of that edge (protectedRegex) */
const CJK = '\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}\\p{sc=Hangul}';
const GLUED = `(?![${CJK}])[\\p{L}\\p{N}]`;
const GLUED_START = new RegExp(`^${GLUED}`, 'u');
const GLUED_END = new RegExp(`${GLUED}$`, 'u');
/** lib-core footprintRegex's honorific rule, repeated so the superset holds for "Mr." too */
const HONORIFIC_DOT = /^(?:Mr|Ms|Mrs|Dr|Prof|Mdm|Messrs)\.$/i;
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** the declared form a term is compared and matched in: full-width folded (the engine reads
 *  folded text), composed, the invisible characters gone */
const declaredForm = (s: string) => (foldFullwidth(s) as string).normalize('NFC').replace(INVISIBLE_RE, '').trim();

/** The identity of a term, for every "is this the same term?" question — the list against the
 *  table, the table against itself. Until 2026-09-23 those compared `text.toLowerCase()`, so a
 *  row the engine found as "Harrow Leung LLP" (Word's no-break space) and the typed
 *  "Harrow Leung LLP" were two terms: the lawyer's decision to leave the row readable did not
 *  reach the .docx, which minted its own row and masked it anyway, and the name key listed a
 *  tag the .txt did not carry. */
export function termKey(s: string): string {
  return declaredForm(s).replace(APOS_RE, "'").replace(DASH_RE, '-').replace(/\s+/g, ' ').toLowerCase();
}

/** The tolerant match for a declared term (see the note above). Never throws: every
 *  character of the term is escaped. An empty term matches nothing. */
export function protectedRegex(term: string, flags = 'gi'): RegExp {
  const p = protectedParts(term);
  if (!p) return /(?!)/g;
  return new RegExp((p.pre ? `(?<!${GLUED})` : '') + p.body + (p.post ? `(?!${GLUED})` : ''), flags.includes('u') ? flags : flags + 'u');
}

/** protectedRegex apart: the body, and whether each edge is guarded — protectedSpans reads a
 *  guarded edge itself, where the safety-net pattern cuts the word */
function protectedParts(term: string): { body: string; pre: boolean; post: boolean } | null {
  const t = declaredForm(term);
  if (!t) return null;
  const glue = `[${INVISIBLE}]*`;
  // each character as typed, decomposed, and full-width: the text of record is folded, but
  // a match that needs the fold to have happened is one missed fold away from a leak
  const ch = (c: string) => {
    if (APOSTROPHES.includes(c)) return APOS_CLASS;
    if (DASHES.includes(c)) return DASH_CLASS;
    const alts = new Set([c, c.normalize('NFD')]);
    const code = c.charCodeAt(0);
    if (c.length === 1 && code > 0x20 && code < 0x7f) alts.add(String.fromCharCode(code + 0xfee0));
    return alts.size === 1 ? escRe(c) : `(?:${[...alts].map(escRe).join('|')})`;
  };
  const tokens = t.split(/\s+/);
  // Between words, any run of spaces and invisible characters. A zero-width space standing
  // where the space was ("6123​4567", which renders as 61234567 and arrives that way from web
  // and PDF copy) required a real space beside it until 2026-09-23, so a declared number in
  // that form shipped readable in the .txt and the .docx with no hold — the safety-net
  // pattern's \s does not read U+200B either.
  const body = tokens
    .map((tok, i) => [...tok].map(ch).join(glue) + (i < tokens.length - 1 ? (HONORIFIC_DOT.test(tok) ? `[\\s${INVISIBLE}]*` : `[\\s${INVISIBLE}]+`) : ''))
    .join('');
  // A guard only on an edge a space-delimited script writes: a term that starts or ends in a
  // CJK letter has no word boundary there to ask for. Guarded, "東京商事" was refused after
  // the "l" of "Kestrel東京商事" in the ORIGINAL — so no row was minted and nothing was placed
  // — while the export, where "[Protected2]" stands before it, read it: the page was held on a
  // term that was on the list at the drop, said the list had gained it later, and its
  // "Mask it" button changed nothing, press after press (2026-09-23).
  return { body, pre: GLUED_START.test(t), post: GLUED_END.test(t) };
}
/** Where a declared term stands in `text`, as protectedRegex finds it — and, given `cuts`, also
 *  where a guarded edge is glued to the text beside it at an offset the safety-net pattern cuts,
 *  or inside a stretch it masks (floorCuts, freed). The pattern's phone rule opens on no word
 *  boundary, so "Call Tan61234567 today" exports as "Call Tan[phone] today": the declared "Tan"
 *  then stands as a whole word in the copy, and the list hold read it there, but the match on the
 *  original saw "Tan6" and refused it — no row was minted, the page said the term had no row, and
 *  its "Mask it" button changed nothing, press after press (2026-09-23). The edge the pattern will
 *  cut is an edge in the export, and a term standing there is masked as one standing anywhere
 *  else. An edge inside a stretch the pattern masks is the same case with the pattern's match
 *  reaching into the term (footprintSpans has the measured leak). Every other guarded edge is
 *  refused exactly as protectedRegex refuses it: a refused match resumes one character on, which
 *  is where the guarded search would look next. */
export function protectedSpans(text: string, term: string, cuts?: () => FloorCuts): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (!cuts) {
    for (const m of text.matchAll(protectedRegex(term))) out.push([m.index!, m.index! + m[0].length]);
    return out;
  }
  const p = protectedParts(term);
  if (!p) return out;
  const re = new RegExp(p.body, 'giu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const s = m.index, e = s + m[0].length;
    const gluedL = p.pre && GLUED_END.test(text.slice(Math.max(0, s - 2), s));
    const gluedR = p.post && GLUED_START.test(text.slice(e, e + 2));
    if ((!gluedL || freed(cuts(), s)) && (!gluedR || freed(cuts(), e))) { out.push([s, e]); re.lastIndex = e; }
    // one code point on: under the u flag an index inside a surrogate pair is moved back to
    // its start, and the same match would be found again for ever
    else re.lastIndex = s + ((text.codePointAt(s) ?? 0) > 0xffff ? 2 : 1);
  }
  return out;
}

/** Where an ENGINE row stands in `text`: lib-core's footprint, and — given `cuts` — also where a
 *  guarded edge is glued at an offset the safety-net pattern cuts, or inside a stretch it masks,
 *  exactly as protectedSpans takes a declared term there. Kept "Wei Ling Tan" in "Contact Wei
 *  Ling Tan98765432" exported "Contact [Person1] Tan[phone]" until 2026-09-23: the footprint
 *  refused the glued "Tan9", the two-token prefix masked "Wei Ling", the pattern cut the number,
 *  and the surname shipped in the .txt, both clipboards and every part of the .docx with
 *  verification green — verify reads the export, where "Tan" stands beside two tags and "Wei
 *  Ling Tan" nowhere. Accepting the cut alone closed that only where the pattern's match ENDS at
 *  the name. An address reaches into one: the email rule's local part starts at any letter and
 *  its last label takes every letter after the dot, so "anna.tan@kestrel.comAnna Tan" exported
 *  "[email] Tan" and "Anna Tananna.tan@kestrel.com" "Anna [email]" — the glued edge fell inside
 *  the address, the row placed nowhere, and the rest of the name shipped on every path with
 *  verification green, which asks the same match (57 of 522 cases in a sweep of six names, 29
 *  glues and three practices; the 18 left are a letter glued on the name's other side, which
 *  no pattern takes). A glued edge inside a stretch the pattern masks is not a word boundary the
 *  copy keeps: the letter beside it goes with the match. The row then places, remask's straddle
 *  rule leaves the match to the pattern and masks the name's words outside it under the row's
 *  tag, and verification sees the occurrence. The footprint is read off lib-core's own pattern,
 *  never rebuilt: its body is the source between the two guards lib-core writes, so the frozen
 *  match is extended at edges the export itself cuts or masks and at no other. Every safety-net
 *  rule is ASCII, so an edge glued to CJK is never freed: refused as lib-core refuses it. A
 *  pattern not in that shape is matched as it stands. Exported for attest.ts, which asks
 *  whether a row the list moves places as before (placesAsBefore). */
export function footprintSpans(text: string, span: string, cuts?: () => FloorCuts): Array<[number, number]> {
  const re = footprintRegex(span);
  const plain = (): Array<[number, number]> => [...text.matchAll(re)].map((m) => [m.index!, m.index! + m[0].length]);
  if (!cuts) return plain();
  let src = re.source;
  const pre = src.startsWith(FP_PRE);
  if (pre) src = src.slice(FP_PRE.length);
  const post = src.endsWith(FP_POST);
  if (post) src = src.slice(0, -FP_POST.length);
  if (!pre && !post) return plain();
  const out: Array<[number, number]> = [];
  const body = new RegExp(src, re.flags);
  let m: RegExpExecArray | null;
  while ((m = body.exec(text))) {
    const s = m.index, e = s + m[0].length;
    if (e === s) { body.lastIndex = s + 1; continue; }
    const gluedL = pre && FP_GLUE_END.test(text.slice(Math.max(0, s - 2), s));
    const gluedR = post && FP_GLUE_START.test(text.slice(e, e + 2));
    if ((!gluedL || freed(cuts(), s)) && (!gluedR || freed(cuts(), e))) { out.push([s, e]); body.lastIndex = e; }
    else body.lastIndex = s + ((text.codePointAt(s) ?? 0) > 0xffff ? 2 : 1);
  }
  return out;
}
/** the two guards lib-core footprintRegex writes, as they stand in its source */
const FP_PRE = '(?<![\\p{L}\\p{N}])';
const FP_POST = '(?![\\p{L}\\p{N}])';
const FP_GLUE_END = /[\p{L}\p{N}]$/u;
const FP_GLUE_START = /^[\p{L}\p{N}]/u;

/** how many times a declared term occurs, tolerantly — 0 means it does not. A term the
 *  safety-net pattern cuts free of the digits glued to it counts (protectedSpans): that is where
 *  the export shows it as a word, and a count of 0 there left the hold's button with nothing to
 *  mint. Counted under the practice's tables with no exemption, so it can only count more than
 *  the export places: a number the lawyer leaves readable is not cut, and the row then masks
 *  nothing there. Words only: where the term stands run together is protectedEntities' question
 *  too, and this one's callers ask for words (Review's widen, attest's occurs and placesAsBefore,
 *  whose record reads run-together names on its own). */
export function protectedMatches(text: string, term: string, practice: Practice = loadPractice()): number {
  return protectedSpans(text, term, floorCuts(text, practice, NO_EXEMPT)).length;
}
/** the occurrences of one term: its word matches, and each run-together find none of them overlaps */
const occurrences = (words: Array<[number, number]>, runs: Array<[number, number]> | undefined): number => words.length + apart(runs, words).length;
/** the run-together finds `runs` that overlap none of `words` — the same occurrence is one */
const apart = (runs: Array<[number, number]> | undefined, words: Array<[number, number]>): Array<[number, number]> =>
  (runs ?? []).filter(([s, e]) => !words.some(([a, b]) => s < b && e > a));
/** where each of `spans` stands run together in `text` (refFind 'text', as placements() reads a
 *  row), keyed by span — every span in one reading, which compacts the text once */
const runAt = (text: string, spans: readonly string[]): Map<string, Array<[number, number]>> =>
  byNameOf(text ? refFind(text, runNames(spans.filter(Boolean)), 'text') : []);
function byNameOf(finds: RefFind[]): Map<string, Array<[number, number]>> {
  const out = new Map<string, Array<[number, number]>>();
  for (const f of finds) {
    const l = out.get(f.name);
    if (l) l.push([f.s, f.e]); else out.set(f.name, [[f.s, f.e]]);
  }
  return out;
}

/** Entities for the user's declared confidential strings. Deterministic and
 *  add-only: a term that occurs is masked, full stop — no model opinion is
 *  consulted, so this layer cannot weaken the identity gate.
 *
 *  ONLY a term the text contains gets a row, and that is load-bearing: the entity table
 *  means "found in this document's body", and every screen that reads it relies on that.
 *  For one day (2026-09-23) this kept a ×0 row for every declared term, to reach a firm
 *  name that lives only in the letterhead. It reached it — and an adversarial pass then
 *  measured what changing the table's meaning cost everywhere else: Export's "byte-identical
 *  to the original" warning and Review's "Nothing is marked" notice went silent for every
 *  firm with a list; Find claimed every declared term was "in N documents"; the "nothing
 *  kept" release gate could be satisfied by rows that place nothing; and a ×0 row the lawyer
 *  left visible printed the declared term into the RECEIPT, the artefact that travels to the
 *  model provider — with a firm-wide list, another client's codename in this client's file.
 *  The letterhead is reached instead where it lives: docxMaskTable, below, used only by the
 *  .docx writer.
 *
 *  A term the body writes only run together contains it too, found as placements() finds a row
 *  run together (refFind 'text'): "KestrelCapital-Escrow", "www.kestrelcapital.com",
 *  "OspreyPartners", "the Biondos", "AnnaTan12". Counted as words alone (protectedMatches)
 *  until 2026-09-23, such a term got no row, so the copied text, the .txt and the Review preview
 *  carried it readable while the saved .docx masked it with the list's own row — verification
 *  green, no hold, and the receipt saying the list's terms were readable nowhere in the text.
 *  `occ` counts both, one occurrence once. */
export function protectedEntities(text: string, terms: string[], startIndex = 0, practice: Practice = loadPractice()): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<string>();
  let n = startIndex;
  const cuts = floorCuts(text, practice, NO_EXEMPT);
  // protectedMatches, every term's run-together reading taken in one pass over the text: a term
  // at a time, a firm-wide list compacted a matter file once per term
  const runs = runAt(text, terms.map((t) => t.trim()));
  for (const raw of terms) {
    const t = raw.trim();
    const k = termKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const occ = occurrences(protectedSpans(text, t, cuts), runs.get(t));
    if (occ === 0) continue;
    n++;
    out.push({ key: 'prot' + n, text: t, tag: `[Protected${n}]`, cat: 'protected', prov: 'pattern', occ, status: 'confirmed', cls: PROTECTED_CLS });
  }
  return out;
}

/** A row the list answers for, as withProtectedTerms makes it at strip time: the protected
 *  category, so placements() matches it tolerantly, and the ENGINE's class kept (law 2 in
 *  test/protected-terms.mjs — the class decides the two-token prefix placement). A row with no
 *  class keeps the one placementRows gives it where it stands: 'PERSON' for a row the review
 *  minted outside Protected terms. Stamped PROTECTED_CLS, a hand-marked "Margaret Tan Wei Ling"
 *  lost the "Margaret Tan" its prefix placement masks the moment the term went on the list —
 *  declaring it masked less than not declaring it. */
const asListRow = (e: Entity): Entity => ({ ...e, cat: 'protected', cls: e.cls ?? (e.cat === 'protected' ? PROTECTED_CLS : 'PERSON') });

/** the table's rows by termKey — one pass, so the per-term questions below do not re-key it */
function rowsByTerm(entities: Entity[]): Map<string, Entity[]> {
  const m = new Map<string, Entity[]>();
  for (const e of entities) {
    const k = termKey(e.text);
    if (!k) continue;
    const l = m.get(k);
    if (l) l.push(e); else m.set(k, [e]);
  }
  return m;
}

/** The table the .docx WRITER masks with: this document's table, plus a row for every
 *  declared term the table does not already place, and every LIVE row a declared term
 *  names matched the way the list matches it.
 *
 *  Why the writer and nothing else: the table is what the engine found in the BODY (store.ts
 *  hands it the main flow), so a declared term that lives only in the letterhead, a footer
 *  or a footnote has no row in the table. The writer masks those parts with the table — so
 *  until 2026-09-23 it left that term readable, and its output leak gate, which re-walks with
 *  the same table, passed clean. The Settings card promises the list applies to "every
 *  document you process". The copied text and the .txt are body text only, so no other export
 *  path can place one of these rows.
 *
 *  `side`: the names the engine's separate read of the text outside the body found only
 *  there (lib/side.ts, owner ruling 27). They are masked here the way the table's rows are,
 *  after them and before the list's own rows, and a declared term one of them answers for
 *  mints no row of the list's own. A side row whose term a row of the table also holds is
 *  left out: the table's row governs every part, as a row the lawyer left readable does. They
 *  never enter `entities` (the table means "found in this document's body", protected-terms
 *  law 3), and the copied text and the .txt, which are the body, do not carry them.
 *
 *  A row is minted for EVERY declared term without a live row the writer places, with no
 *  check of whether it occurs: an absent term masks nothing, and a presence check that missed
 *  would reopen the leak (the writer masks each part's own flow, which no search from a screen
 *  reproduces exactly). `channel` holds the ones that bring a tag of their own; their tags
 *  continue after the highest [ProtectedN] in the table, so no tag means two things in one
 *  document.
 *
 *  A term whose row the ENGINE found keeps that row's tag, but the writer gets it as a list
 *  row (asListRow). Until 2026-09-23 such a term counted as covered and the row kept the
 *  engine's footprint, so a letterhead printing the firm's name with a non-breaking hyphen,
 *  a straight apostrophe or its katakana reading glued on shipped readable in the .docx under
 *  a passing gate — while the same term declared BEFORE the drop, which withProtectedTerms
 *  upgrades at strip time, was masked there. A declared term masks the same whenever it was
 *  declared. The body cannot differ from the .txt through this: a form the body carries is
 *  readable in the text export, and listHolds holds the page on it.
 *
 *  A term the table answers for only with rows the writer does not place gets a row of the
 *  list's own too, and those are of two kinds:
 *    · a row the structured floor put there (a declared account number the safety-net
 *      pattern also catches). The floor masks the form it matches and nothing else, so the
 *      footer's "6123‑4567" (U+2011), a soft hyphen or a zero-width space inside the number
 *      shipped readable under a passing gate (2026-09-23), where the same term declared before
 *      the drop was a protected row and masked in every form. That row carries the FLOOR's
 *      tag and goes into `table` only, not `channel`: the .txt already says [phone] where the
 *      number stands, and a [ProtectedN] of its own put a second tag on one number — the .txt
 *      said "Call [phone]", the .docx body and footer "Call [Protected2]", and the name key
 *      listed both (2026-09-23). With the floor's tag the body the .docx writes is the .txt,
 *      and the key's safety-net section already reverses it. A floor row left readable is not
 *      this case: the body carries the number, listHolds holds the page, and it falls to the
 *      next kind. An ENGINE row of the term left readable does not stop it: the pattern masks
 *      that row's every body form anyway (the page says so), and asked of any dead row, the
 *      .txt said [nric] and the .docx body [Protected3] for one number, while the page told the
 *      lawyer the .txt left it readable (2026-09-23).
 *      The pattern's match can be WIDER than the term: "+65 6123 4567" for a declared
 *      "6123 4567", an address for a declared domain. Each such live floor row is minted too,
 *      its own text under its own tag and longest first, so the body the .docx writes is still
 *      the .txt: the term alone placed "Call +65 [Protected2]" where the .txt said
 *      "Call [phone]", and inside "j.doe@kestrelcapital.com" it left "j.doe@" readable in the
 *      .docx body, where the .txt masked the whole address. The term itself then takes that
 *      row's tag when the pattern would match it standing alone (a number), and a tag of the
 *      list's own when it would not (a domain in a letterhead is not an address).
 *    · rows left readable before the term was on the list. That choice was about the BODY,
 *      the one part the review shows, and the body stays governed by it: listHolds holds the
 *      page while the body export carries the term readable. The letterhead, the footer and
 *      the watermark were never shown, so no decision was taken about them. Until 2026-09-23
 *      this counted the choice as covering them, on the premise that the page hold would
 *      settle it — and a body that carried "Kestrel" only inside a masked "Kestrel Holdings
 *      Ltd" raised no hold, so "KESTREL – PRIVILEGED & CONFIDENTIAL" shipped in the header,
 *      the watermark and a bookmark under a gate that passed. These are returned in `over`,
 *      so the page says which choice the saved .docx went past, and where.
 *  A row left readable while it sat under Protected terms was decided with the list in view,
 *  and it governs every part: no channel row is minted over it. */
export function docxMaskTable(entities: Entity[], terms: string[], side: Entity[] = []): { table: Entity[]; channel: Entity[]; over: Entity[] } {
  const inTable = side.length ? new Set(entities.map((e) => termKey(e.text))) : null;
  const sideLive = inTable ? side.filter((e) => !e.dead && !inTable.has(termKey(e.text))) : [];
  const byTerm = rowsByTerm(sideLive.length ? [...entities, ...sideLive] : entities);
  const seen = new Set<string>();
  const upgrade = new Set<string>();
  // after every [ProtectedN] a side row holds too, so no tag means two things in the saved file
  let n = sideLive.reduce((m, e) => Math.max(m, Number(/^\[Protected(\d+)\]$/.exec(e.tag)?.[1] ?? 0)), nextProtectedIndex(entities));
  const channel: Entity[] = [];
  const over: Entity[] = [];
  const floorTagged: Entity[] = [];
  const floorMinted = new Set<string>();
  const mintFloor = (text: string, tag: string) => {
    const fk = termKey(text);
    if (floorMinted.has(fk)) return;
    floorMinted.add(fk);
    floorTagged.push({ key: 'protfl' + (floorTagged.length + 1), text, tag, cat: 'protected', prov: 'pattern', occ: 0, status: 'confirmed', cls: PROTECTED_CLS });
  };
  const liveFloor = entities.filter((e) => !e.dead && isFloorRow(e));
  const needsUpgrade = (e: Entity) => !e.dead && e.cat !== 'protected' && !isFloorRow(e);
  for (const raw of terms) {
    const t = raw.trim();
    const k = termKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const rows = byTerm.get(k) ?? [];
    if (rows.some((e) => !e.dead && !isFloorRow(e))) { if (rows.some(needsUpgrade)) upgrade.add(k); continue; }
    if (rows.some(leftUnderList)) continue;
    // the safety-net rows that mask the term in the body: its own, and every one whose wider
    // match holds it — none beside a floor row of the term left readable, which is an
    // exemption: the body carries the number, and the page is held on it
    const exempted = rows.some((e) => e.dead && isFloorRow(e));
    const floor = exempted ? undefined : rows.find((e) => !e.dead && isFloorRow(e));
    const re = protectedRegex(t, 'i');
    const around = exempted ? [] : liveFloor.filter((e) => termKey(e.text) !== k && re.test(e.text));
    for (const e of around) mintFloor(e.text, e.tag);
    const alone = floor ? floor.tag : around.find((e) => e.tag === floorTagAlone(t))?.tag;
    if (alone) {
      mintFloor(t, alone);
      continue;
    }
    n++;
    const row: Entity = { key: 'protch' + n, text: t, tag: `[Protected${n}]`, cat: 'protected', prov: 'pattern', occ: 0, status: 'confirmed', cls: PROTECTED_CLS };
    channel.push(row);
    if (rows.some((e) => e.dead)) over.push(row);
  }
  const base = upgrade.size ? entities.map((e) => (needsUpgrade(e) && upgrade.has(termKey(e.text)) ? asListRow(e) : e)) : entities;
  const sideBase = upgrade.size ? sideLive.map((e) => (needsUpgrade(e) && upgrade.has(termKey(e.text)) ? asListRow(e) : e)) : sideLive;
  const minted = [...sideBase, ...floorTagged, ...channel];
  return { table: minted.length ? [...base, ...minted] : base, channel, over };
}

/** a row left readable while it sat under Protected terms: the review decided it with the list
 *  in view, so the list does not go past it anywhere (docxMaskTable, listHolds, the button) */
const leftUnderList = (e: Entity) => !!e.dead && e.cat === 'protected' && !isFloorRow(e);

/** the tag the frozen safety-net pattern gives `t` standing alone — the first rule, in the
 *  order the floor runs them, whose match is the whole of it — or undefined */
function floorTagAlone(t: string): string | undefined {
  return FROZEN_RULES.find(({ re }) => new RegExp(`^(?:${re.source})$`, re.flags.replace('g', '')).test(t))?.tag;
}

/** the first [ProtectedN] index free in a table: after the highest one it holds, and after the
 *  number of rows the table itself holds, so no tag means two things in one document. Floor
 *  rows are not counted: syncFloorRows adds them after the strip, so counting them numbered a
 *  term the held row's button masks one higher than the same term declared before the drop. */
function nextProtectedIndex(entities: Entity[]): number {
  return entities.reduce((m, e) => Math.max(m, Number(/^\[Protected(\d+)\]$/.exec(e.tag)?.[1] ?? 0)), entities.filter((e) => !isFloorRow(e)).length);
}

/** Which of docxMaskTable's channel rows the saved .docx actually CARRIES, and in which of its
 *  parts — read off the writer's own report of the tags it wrote (docxWrite ChannelReport.tags),
 *  never from a search of our own. For the name key and the receipt ONLY, never for masking:
 *  the key must not list a term this file does not contain, because with a firm-wide list
 *  that is other clients' codenames in this client's key.
 *
 *  It replaced a search of the walker's items (channelPresent) on 2026-09-23, which disagreed
 *  with the file three ways: a letterhead split across runs ("Har" + "row Leung LLP") was in
 *  no single item, so the .docx masked it and the key could not reverse the tag; a term that
 *  lived only in a comment, a hidden run, a property or alt-text was counted as "masked
 *  there" when the writer had REMOVED it; and a declared "Lantern" was listed while the only
 *  "Lantern" in the file sat inside a row the lawyer had widened to "Project Lantern", which
 *  the table masked — the receipt then claimed a masking the channel row never did. */
export function channelWritten(channel: Entity[], written: Record<string, { tags: string[] }>): Array<{ e: Entity; kinds: string[] }> {
  const out: Array<{ e: Entity; kinds: string[] }> = [];
  for (const e of channel) {
    const kinds = Object.keys(written).filter((k) => written[k].tags.includes(e.tag));
    if (kinds.length) out.push({ e, kinds });
  }
  return out;
}

/** Why a declared term holds the export (listHolds):
 *    'no-row'       — the table has no row for it: the list gained it after the document was
 *                     read, or its row was widened or removed in the review. Which of those
 *                     happened is not recorded, so the page does not say.
 *    'other-form'   — live rows answer for it (the engine's, or the safety-net pattern's), and the
 *                     document also writes it in a form their match does not cover (the other
 *                     apostrophe, a non-breaking hyphen, a soft hyphen inside it).
 *    'left-visible' — a row of it was left readable in the review while it was not under
 *                     Protected terms: the decision was made without the list in view. A row
 *                     that is the term run together ("KestrelCapital" for "Kestrel Capital")
 *                     counts, as the writer reads it (owner ruling 1). The
 *                     button masks the term in every form, and so revives that row; until
 *                     2026-09-23 a term with a live row beside the one left readable was held as
 *                     'other-form', and the page never said the button would undo that choice.
 *    'inside'       — every readable occurrence stands inside a WIDER row the lawyer left
 *                     readable ("Kestrel" inside "Kestrel Holdings Ltd", a number inside the
 *                     "+65 …" left readable). Until 2026-09-23 this was held as 'no-row' or
 *                     'other-form', neither of them true, and the button masked the term inside
 *                     the wider name without the page saying it would.
 *  `inside` names those wider rows whatever the why: the button masks the term inside each of
 *  them and leaves the rest of each as the lawyer chose, and the page says so before the press.
 *  `partly`: no occurrence is readable whole — a row the lawyer kept masks some of its words at
 *  each one, and the export carries the rest (listHolds says why that holds). */
export type ListHoldWhy = 'no-row' | 'other-form' | 'left-visible' | 'inside';
/** `esc`: a percent-escape that writes no character where the term could stand, as written
 *  ("%E9" of "Ren%E9%20Tan") — present only then. No press can mask it, and "find it in the
 *  document" does not find the term by its letters there, so the page names the escape. */
export interface ListHold { term: string; why: ListHoldWhy; inside: string[]; partly: boolean; esc?: string }
/** What the lawyer does about a name such an escape may hide, as one sentence: Export's held
 *  rows and the Compare clipboard's refusal both say it, and both otherwise send the lawyer to
 *  "find it in the document", which does not find "René Tan" in "Ren%E9%20Tan". */
export const escapeWay = (name: string, esc: string): string =>
  `“${name}” may stand in a web address or a file’s path written with a percent-escape (${esc}) that is no character, where nothing can say which letter it meant: find the address, and retype it with the letter written out or redact the whole of it.`;

/** Declared terms still READABLE in `exported` that the table does not answer for — each one
 *  holds every export on the page, and Compare's clipboard, until the lawyer masks it (the
 *  button on Export's held row, which runs withProtectedTerms and leaves the table exactly as
 *  it would have been had the term been on the list when the document was dropped — test law
 *  11 compares the two byte for byte).
 *
 *  The table is built when the engine runs, so until 2026-09-23 a term added to the list later
 *  went out readable in the copied text and the .txt — while the saved .docx masked it and the
 *  receipt said the text exports "never contain" it. The first fix skipped any term with a row,
 *  and that let two cases through, both measured the same day:
 *    · a row the engine found keeps the engine's footprint, while termKey calls more forms one
 *      term than that footprint matches. "O’Brien Kessler LLP" found in the sign-off, the list
 *      given "O'Brien Kessler LLP" later: the straight-apostrophe reply in the body shipped
 *      readable, with verification green. Declared before the drop, the row is upgraded to the
 *      tolerant match at strip time and all of it is masked.
 *    · a row left readable in the review keeps that decision, but a decision taken before the
 *      term was on the list is not a decision about the list: declared before the drop, the
 *      same row is revived at strip time (withProtectedTerms) and masked. A row left readable
 *      while it sat under Protected terms WAS decided with the list in view, and governs.
 *  Whether that choice governs is asked of the term's own rows, never the safety-net pattern's,
 *  as docxMaskTable asks it. The floor row is added after every review edit (syncFloorRows),
 *  so a declared "S1234567D" left readable under Protected terms gained a live [nric] row
 *  beside it, the choice stopped counting, the soft-hyphen form the floor does not match held
 *  the page as 'other-form', and "Mask it in every form" left that choice in place, press
 *  after press (2026-09-23).
 *  Matched tolerantly and against the EXPORT, not the original: a declared "Lantern" inside
 *  a masked "Project Lantern" is not readable, and holding the file over it would be wrong.
 *  Callers pass the export's READABLE text (exportReadable), not its bytes: the bytes carry
 *  the tags the export wrote, and a declared "Phone" or "Card" was read in the "[phone]" and
 *  "[card]" the mask put there — held for good, the button changing nothing, the page saying
 *  the term had no row or was written another way (2026-09-23).
 *
 *  READABLE IN PART holds too, and that needs the original (`orig`: the document and the mask
 *  that made the export). A declared "Tan Wei Ling" listed after the drop, beside a kept "Mrs
 *  Margaret Tan": the export read "[Person1] Wei Ling attended", where the term as a whole
 *  stands nowhere, so nothing held — while the .docx masked "Wei Ling" with the list's own row
 *  (2026-09-23). A term is held wherever it stands in the original, matched as a declared term
 *  is placed, with a letter or a digit of it outside everything the export replaced. The
 *  readable text is still asked as well: every exporter passes both, and a caller with only the
 *  export gets the check it had. */
export function listHolds(exported: string, entities: Entity[], terms: string[], orig?: { text: string; rm: Remask; practice: Practice }): ListHold[] {
  const byTerm = rowsByTerm(entities);
  const seen = new Set<string>();
  const out: ListHold[] = [];
  const o = orig && !orig.rm.divergence ? orig : undefined;
  const cut = o ? cutRanges(o.rm) : [];
  const cuts = o ? floorCuts(o.text, o.practice, exemptOf(entities)) : undefined;
  // RUN TOGETHER, every term in one reading of each text: in the export's readable words with
  // every tag a wall, as runFound asks it of a kept row; and in the original at ends a reader
  // takes the name to stop at, as exportPlan asks it of a kept row (runsThrough) — "AnnaTan12" beside a kept "Anna"
  // reads "[Person1]Tan12", where the term as a whole stands nowhere. Each less a find lying
  // wholly inside a place the term itself, run together, was left readable under Protected
  // terms (inLeft; a row left readable there was decided with the list in view, and governs), so
  // a term is not held where the mask its button makes would leave it. Asked as words alone until
  // 2026-09-23, a term written only run together never held: the .txt carried it and the saved
  // .docx masked it. With those places walls instead, "Anna Tan" listed after the drop beside a
  // left-readable "Anna" read "████ Tan12" in "Ms Anna Tan12", held nothing, and the receipt said
  // the term was readable nowhere in the text that carried it (2026-09-24). With every place a
  // row was left readable taking back the finds inside it, "Kestrel Capital" listed after the
  // drop held nothing inside "www.kestrelcapital.com" left readable, nor inside "KestrelCapital"
  // left readable before the term was on the list — a choice the words "Kestrel Capital" left
  // readable the same way holds the page on — and the receipt said the same (P1-F1, P1-F2).
  const want = terms.map((t) => t.trim());
  const left = entities.filter((e) => e.dead && !isFloorRow(e));
  const wantNames = runNames(want);
  const wantC = new Map(wantNames.map((n) => [n.name, [n.c]]));
  const runRead = byNameOf(runReadings(exported, wantNames, left, true, leftUnderList));
  const leftAt = o ? left.flatMap((d) => placesOf(d, rowSpans(o.text, d, cuts), leftUnderList(d))) : [];
  const runBare = o ? byNameOf(runsThrough(o.text, runNames(want), cut, (f) => coverage(o.text, f.s, f.e, cut).open && !inLeft(leftAt, f, wantC.get(f.name) ?? []))) : new Map<string, Array<[number, number]>>();
  // a percent-escape that writes no character where a term could stand holds the saved .docx
  // (docxWrite pctHidden, owner ruling 10); the copy and the .txt carry the same bytes
  const walledExport = hasEscape(exported) ? exported.split(TAG_BLANK).join(WALL) : '';
  for (const raw of terms) {
    const t = raw.trim();
    const k = termKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const rows = byTerm.get(k) ?? [];
    const own = rows.filter((e) => !isFloorRow(e));
    if (own.length && own.every((e) => e.dead) && own.some(leftUnderList)) continue;
    // the term as refFind reads it, and the rows left readable that are the term run together
    // ("KestrelCapital" for "Kestrel Capital"), which termKey calls another term
    const tn = wantNames.filter((n) => n.name === t);
    const kc = tn[0]?.c;
    const kin = kc ? left.filter((e) => termKey(e.text) !== k && refCompact(e.text).c === kc) : [];
    const words = [...exported.matchAll(protectedRegex(t))].map((m): [number, number] => [m.index!, m.index! + m[0].length]);
    const at = [...words, ...apart(runRead.get(t), words)];
    const esc = walledExport ? pctHidden(walledExport, tn, 'text') : null;
    if (esc) at.push([esc.at, esc.at + esc.esc.length]);
    // where it stands in the original with a letter or a digit the export did not replace
    const placed = o ? protectedSpans(o.text, t, cuts) : [];
    const bare = o ? [...placed, ...apart(runBare.get(t), placed)].filter(([s, e]) => coverage(o.text, s, e, cut).open) : [];
    if (!at.length && !bare.length) continue;
    // the wider rows left readable that carry it, as words or run together, each with where it
    // stands — in the export's readable words for `at`, in the original for `bare`
    const wider = entities.filter((e) => e.dead && termKey(e.text) !== k && !kin.includes(e) && (protectedRegex(t, 'i').test(e.text) || (tn.length > 0 && refFind(e.text, tn, 'text', true, false).length > 0)));
    const wr = wider.map((e) => ({ e, at: readableAt(exported, e) })).filter((w) => w.at.length);
    const wo = o && bare.length ? wider.map((e) => ({ e, at: rowSpans(o.text, e, cuts) })).filter((w) => w.at.length) : [];
    const holds = (ws: typeof wr, [s, e]: [number, number]) => ws.filter((w) => w.at.some(([a, b]) => a <= s && e <= b));
    const holding = [...at.flatMap((x) => holds(wr, x)), ...bare.flatMap((x) => holds(wo, x))];
    const inside = [...new Set(holding.map((w) => w.e.text))];
    const allInside = at.every((x) => holds(wr, x).length) && bare.every((x) => holds(wo, x).length);
    const why: ListHoldWhy = [...rows, ...kin].some((e) => e.dead && !leftUnderList(e)) ? 'left-visible' : allInside ? 'inside' : !rows.length ? 'no-row' : 'other-form';
    const partly = !at.length && bare.every(([s, e]) => coverage(o!.text, s, e, cut).shut);
    out.push({ term: t, why, inside, partly, ...(esc ? { esc: esc.esc } : {}) });
  }
  return out;
}

/** the original-text ranges an export replaced — the table's placements and the safety-net
 *  pattern's non-exempt hits — sorted and merged */
function cutRanges(rm: Remask): Array<[number, number]> {
  const rs: Array<[number, number]> = rm.placements.map((p) => [p.s, p.e]);
  for (const h of rm.floorHits) if (!h.exempt && h.s >= 0 && h.e > h.s) rs.push([h.s, h.e]);
  rs.sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of rs) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) { if (e > last[1]) last[1] = e; } else out.push([s, e]);
  }
  return out;
}
/** Of the letters and digits in [s, e) of `text`: does one stand outside every range of `cut`
 *  (`open`), and does one stand inside one (`shut`) */
function coverage(text: string, s: number, e: number, cut: Array<[number, number]>): { open: boolean; shut: boolean } {
  let lo = 0, hi = cut.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cut[mid][1] <= s) lo = mid + 1; else hi = mid; }
  let j = lo, open = false, shut = false;
  for (let i = s; i < e && !(open && shut);) {
    const cp = text.codePointAt(i) ?? 0;
    if (LETTER_OR_DIGIT.test(String.fromCodePoint(cp))) {
      while (j < cut.length && cut[j][1] <= i) j++;
      if (j < cut.length && cut[j][0] <= i) shut = true; else open = true;
    }
    i += cp > 0xffff ? 2 : 1;
  }
  return { open, shut };
}
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
/** the safety-net exemptions a table carries: the text of each floor row left readable */
const exemptOf = (entities: Entity[]): Set<string> => new Set(entities.filter((e) => isFloorRow(e) && e.dead).map((e) => floorKey(e.text)));
/** where a row stands in the ORIGINAL, matched as placements() places it — a floor row as the
 *  pattern's own text, with the footprint */
function rowSpans(text: string, e: Pick<Entity, 'text' | 'cat' | 'src'>, cuts?: () => FloorCuts): Array<[number, number]> {
  try { return e.cat === 'protected' && e.src !== FLOOR_SRC ? protectedSpans(text, e.text, cuts) : footprintSpans(text, e.text, e.src === FLOOR_SRC ? undefined : cuts); } catch { return []; }
}

/** where a row stands readable in an export's readable text — matched as rowSurvives asks it */
function readableAt(exported: string, e: Pick<Entity, 'text' | 'cat' | 'src'>): Array<[number, number]> {
  let re: RegExp;
  try { re = e.cat === 'protected' && e.src !== FLOOR_SRC ? protectedRegex(e.text) : footprintRegex(e.text); } catch { return []; }
  return [...exported.matchAll(re)].map((m) => [m.index!, m.index! + m[0].length]);
}
/** listHolds, the terms only */
export function lateTerms(exported: string, entities: Entity[], terms: string[]): string[] {
  return listHolds(exported, entities, terms).map((h) => h.term);
}

/** Fold the protected lexicon into an engine outcome. An engine find that IS a
 *  protected term is upgraded in place (and revived if it had been discarded),
 *  so a declared secret can never end up sitting in the ignored pile.
 *
 *  Two kinds of row are not upgraded in place:
 *    · a safety-net row (syncFloorRows) is REPLACED by a protected row. The table never places
 *      a floor row — the floor pass masks the one form its pattern matches — so upgrading it in
 *      place gave a row that masked nothing new: "Mask it in every form" left the footer's
 *      "6123‑4567" (U+2011) readable and the page held, press after press, and the row then
 *      kept the page held with the term off the list (2026-09-23). Declared before the drop
 *      the term never had a floor row: the strip minted a protected row and the floor found
 *      nothing left to match. Replacing it gives that table.
 *    · a row left readable while it sat under Protected terms is left as it is: that choice was
 *      made with the list in view (listHolds and docxMaskTable let it govern), and a button
 *      pressed for another form of the term must not undo it. The live row upgraded beside it
 *      masks every form, which lifts the hold.
 *  A row left readable that is a term run together ("KestrelCapital" for "Kestrel Capital", as
 *  refCompact reads both) is revived as the term's own is: listHolds holds the page on it as
 *  'left-visible', and a press that left it readable left the hold standing with no way through
 *  on the page but the review (P1-F2, 2026-09-24). */
export function withProtectedTerms(text: string, entities: Entity[], terms: string[], practice: Practice = loadPractice()): Entity[] {
  const wanted = terms.map((t) => t.trim()).filter(Boolean);
  if (!wanted.length) return entities;
  const lower = new Set(wanted.map(termKey));
  const joined = new Set(runNames(wanted).map((n) => n.c));
  const kin = (e: Entity) => !!e.dead && !isFloorRow(e) && joined.has(refCompact(e.text).c);
  // cls IS DELIBERATELY PRESERVED on an engine row, and this is load-bearing. `cat` is a UI
  // grouping; `cls` is what the export path feeds to propagateProperPrefixes. Stamping
  // PROTECTED_CLS over a row the ENGINE classified would DELETE the two-token prefix placement
  // that ships today: declaring "Northwind Trading Company" would stop masking the bare
  // "Northwind Trading" that is masked when nobody declares anything, so adding a term to the
  // always-redact list would mask LESS than not adding it. That is a recall regression on the
  // export path in the unsafe direction, caused by a UI feature, and it fails the repo's
  // fail-closed rule. The Settings promise is that the DECLARED term is matched exactly; it
  // does not promise that the engine stops masking what it found on its own. simpler-red hit
  // this same trap and pins it in test/protected.test.mjs case 2.
  const next: Entity[] = [];
  for (const e of entities) {
    if ((!lower.has(termKey(e.text)) && !kin(e)) || leftUnderList(e)) next.push(e);
    else if (!isFloorRow(e)) next.push({ ...asListRow(e), dead: undefined, status: 'confirmed' });
  }
  const have = new Set(next.map((e) => termKey(e.text)));
  const add = protectedEntities(text, wanted.filter((t) => !have.has(termKey(t))), nextProtectedIndex(next), practice);
  return add.length ? [...next, ...add] : next;
}

/** Is this row still readable in the export? A protected row is asked with the tolerant match
 *  the mask used for it (protectedRegex), every other row with the engine's footprint. A floor
 *  row is asked with the footprint whatever its category: the floor pass masks the form its
 *  pattern matches, and a table the old button left with a floor row under Protected terms
 *  was asked for forms nothing masks — held with the term off the list (2026-09-23). */
export function rowSurvives(exported: string, e: Pick<Entity, 'text' | 'cat' | 'src'>): boolean {
  return e.cat === 'protected' && e.src !== FLOOR_SRC ? protectedRegex(e.text, 'i').test(exported) : spanSurvives(exported, e.text);
}

/** What stands for a tag in exportReadable: no letter, no digit, no space — so a match that
 *  reached a tag's edge is guarded there exactly as at the tag's brackets, and no word runs
 *  through it */
export const TAG_BLANK = '\u0000';
const TAG_SHAPED = /\[[^[\]\n]{1,60}\]/g;

/** The export as a reader meets the document's own words in it: the original with every span
 *  this export replaced — the table's placements and the safety-net pattern's non-exempt hits,
 *  at their original offsets — standing as TAG_BLANK. Every "is it still readable?" question
 *  (listHolds, rowSurvives, survivingFragments) is asked of this, never of the bytes: the
 *  bytes carry the tags, and a tag is not the lawyer's word. A declared "Phone" read in
 *  "[phone]", "Card" in "[card]" and "Date" in the frozen service's "[Date]", so the page was
 *  held on a term with no readable occurrence; its button could not lift it, the reasons it
 *  gave were false, and the verify line said the span survived (2026-09-23).
 *  Under a divergence the offsets are empty, not true: the core's bytes are read with only the
 *  tags this table and the safety-net pattern write taken out (the export is held then anyway). */
export function exportReadable(original: string, rm: Remask, entities: Entity[]): string {
  if (rm.divergence) return tagsBlanked(rm.text, entities);
  const cut: Array<[number, number]> = rm.placements.map((p) => [p.s, p.e]);
  for (const h of rm.floorHits) if (!h.exempt && h.s >= 0 && h.e > h.s) cut.push([h.s, h.e]);
  cut.sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  for (const [s, e] of cut) {
    if (e <= pos) continue;
    // a floor hit whose original range reaches into a placement is one replaced run
    if (s >= pos) out += original.slice(pos, s) + TAG_BLANK;
    pos = e;
  }
  return out + original.slice(pos);
}

/** `text`, written with tags, with every tag `entities` or the safety-net pattern writes standing
 *  as TAG_BLANK: the readable words of text there are no offsets for — the core's bytes under a
 *  divergence (exportReadable), and a part of the saved .docx other than its body, as the writer
 *  saves it (docxWrite savedFlowText), which the fragment check reads (Export.tsx). A tag read as
 *  words, "Card" was found in "[card]". */
export function tagsBlanked(text: string, entities: ReadonlyArray<Pick<Entity, 'tag'>>): string {
  const tags = new Set<string>([...entities.map((e) => e.tag), ...FROZEN_RULES.map((r) => r.tag), ...Object.values(JURISDICTION_RULES as Record<string, FloorRule[]>).flat().map((r) => r.tag)]);
  return text.replace(TAG_SHAPED, (t) => (tags.has(t) ? TAG_BLANK : t));
}
/** The declared terms the fragment check asks for beside the table's rows (survivingFragments):
 *  every one on the list but a term every row of which the lawyer left readable in this
 *  document, a decision the check does not second-guess. Until owner ruling 21's second pass the
 *  check read the table alone, and a term written only glued ("Mr Kestrel12 replied." for a
 *  listed "Kestrel Capital Partners"), which has no row, was counted nowhere (F5-TERMS). */
export function fragmentTerms(entities: readonly Entity[] | null | undefined, terms: readonly string[]): string[] {
  const byTerm = rowsByTerm([...(entities ?? [])]);
  const out: string[] = [];
  for (const raw of terms) {
    const t = raw.trim();
    const own = (byTerm.get(termKey(t)) ?? []).filter((e) => !isFloorRow(e));
    if (t && !(own.length && own.every((e) => e.dead))) out.push(t);
  }
  return out;
}

export type ExportInput = Pick<QFile, 'text' | 'entities' | 'sample' | 'reviewed' | 'engineComplete' | 'kind' | 'bytes'> & Partial<Pick<QFile, 'side'>>;
export interface ExportPlan {
  rm: Remask;
  /** the bytes of the copied text and the .txt */
  red: string;
  /** `red` as its readable words stand, the tags it wrote blanked (exportReadable) — what every
   *  "still readable?" question below is asked of, and what a fragment check must ask too */
  readable: string;
  /** kept rows still readable in `red`, whole or in part — verify-by-extraction */
  survivors: Entity[];
  /** rows left readable in the review that `red` still carries */
  stillIn: Entity[];
  /** rows left readable in the review that `red` does not carry, each with what masked it */
  maskedAnyway: MaskedAnyway[];
  verified: boolean;
  unreviewed: boolean;
  incomplete: boolean;
  nothingKept: boolean;
  /** declared terms `red` carries readable that the table does not answer for (listHolds) */
  holds: ListHold[];
  /** the held terms the hold's button would NOT clear (pressLifts) — the page offers no button
   *  for these and says what the lawyer can do instead */
  stuck: string[];
  /** every export on the page is held: any of the gates above, or rm.divergence */
  blocked: boolean;
  /** a kept row a percent-escape that writes no character hides where it could stand, and that
   *  escape as written (docxWrite pctHidden) — one of `survivors`, said apart on the page because
   *  "find it in the review" does not find "Ren%E9%20Tan" by its name — or null */
  escaped: { esc: string; name: string } | null;
  /** what the saved .docx is written with — docxMaskTable's table under the page's practice —
   *  or null when this file has no .docx to save. `mask.names` are the spans the table places,
   *  which the writer reads a bookmark name against with nothing between its words
   *  (docxWrite refCarries): carried on the mask, so the two cannot come from different tables.
   *  `bodyReadable`: the terms of `channel` the body export (`readable`) still carries, read off
   *  it, for the receipt's line on those rows.
   *  `mask.leftAt(t)`: where each row the lawyer left readable stands in `t`, found as
   *  placements() finds it. The writer does not read it, and owner ruling 13 (2026-09-24) keeps
   *  it so: its own run-together pass reads `names` alone and in the saved body masks "O'Brien
   *  Kessler LLP", left readable as a row of its own, for a confirmed "O’Brien Kessler LLP" the
   *  .txt keeps it beside — over-redaction, the safe direction. A reader of these places must
   *  take them as placements() does, never as walls: a find lying WHOLLY inside one, where the
   *  row is the same name, is that row's text and is left as the lawyer left it (inLeft); a find
   *  that runs past one, or stands inside a different row, is masked. Read as walls, a kept
   *  "Anna Tan" beside a left-readable "Anna" left "Tan12" readable (P13-B1). */
  docx: { table: Entity[]; channel: Entity[]; over: Entity[]; bodyReadable: string[]; mask: ((text: string) => Remask) & { names: string[]; leftAt: (text: string) => Array<[number, number]> } } | null;
  /** why the saved .docx alone is held, or null: the body was read by an engine and the text
   *  the file carries outside it was not, or could not be listed (lib/side.ts sideHeld, owner
   *  ruling 27). The copied text and the .txt are the body, and are not held on it. */
  docxHeld: string | null;
}

/** A row left readable that the export masks anyway, and what masks it where it stands — read
 *  off the export's own accounting, never assumed. `floor`: the safety-net pattern. `list`: a
 *  live row of the same term under Protected terms, which is matched in every form. `same`:
 *  another live row of the same term. Every other kept row whose placement reaches it is named,
 *  by how that row's own whole match (Claim.m) meets it: `within` — it holds it whole (a longer
 *  name, or a name whose two-word short form it is); `part` — it stands inside it (a shorter
 *  name in it); `overlap` — the two share words and neither holds the other. None of them: it
 *  does not occur in the text as written. `partly`: at an occurrence a letter or a digit of it
 *  stays readable — masked in part, the rest shipped as the lawyer chose.
 *  `by` is null when the accounting diverged and nothing can be attributed.
 *
 *  Named by the ROW and sorted by its match, never by the placement's text or length: read off
 *  the placement, a remainder "Wei Ling" of a kept "Tan Wei Ling" was "another row of the same
 *  name" over a "Wei Ling" left readable; and sorted by length, a kept "Tan Wei Ling" was "a
 *  shorter name inside" a "Mrs Margaret Tan" left readable, which it only shares "Tan" with —
 *  while "Mrs Margaret" shipped and no list of what the copy carries said so (2026-09-23).
 *
 *  Until 2026-09-23 the page put every one of these down to the safety-net pattern, printed
 *  their names into the receipt that travels to the model provider ("1 you left readable is
 *  masked anyway by the safety-net pattern: Kestrel") and sent the lawyer to a safety-net row
 *  that did not exist; each was masked by a longer row or by the list. */
export interface MaskedAnyway { e: Entity; by: { floor: boolean; list: boolean; same: boolean; within: string[]; part: string[]; overlap: string[]; partly: boolean } | null }

function maskedBy(text: string, rm: Remask, e: Entity, entities: Entity[], cut: Array<[number, number]>, cuts: () => FloorCuts): MaskedAnyway['by'] {
  if (rm.divergence) return null;
  const k = termKey(e.text);
  const listTags = new Set(entities.filter((r) => !r.dead && !isFloorRow(r) && r.cat === 'protected' && termKey(r.text) === k).map((r) => r.tag));
  const by = { floor: false, list: false, same: false, within: [] as string[], part: [] as string[], overlap: [] as string[], partly: false };
  const add = (l: string[], w: string) => { if (!l.includes(w)) l.push(w); };
  const claims: Claim[] = rm.claims ?? rm.placements.map((p) => ({ ...p, row: text.slice(p.s, p.e), m: [p.s, p.e] }));
  for (const [s, end] of rowSpans(text, e, cuts)) {
    if (coverage(text, s, end, cut).open) by.partly = true;
    if (rm.floorHits.some((h) => !h.exempt && h.s < end && h.e > s)) by.floor = true;
    for (const c of claims) {
      if (c.s >= end || c.e <= s) continue;
      if (listTags.has(c.tag)) { by.list = true; continue; }
      if (termKey(c.row) === k) { by.same = true; continue; }
      const [a, b] = c.m;
      if (a <= s && end <= b) add(by.within, c.row);
      else if (s <= a && b <= end) add(by.part, c.row);
      else add(by.overlap, c.row);
    }
  }
  return by;
}

/** Everything the Export screen decides about one document, as one pure function of the
 *  document and ONE read of the settings. The screen calls it once and reads every gate, the
 *  text it copies and the mask it hands the .docx writer from here.
 *
 *  It exists because those decisions used to be composed inline in Export.tsx, where nothing
 *  could test them: a replay on 2026-09-23 reverted the late-term hold, computed it over the
 *  original instead of the export, and handed the writer the review table instead of
 *  docxMaskTable's (the original letterhead leak) — one line each — and the suite stayed
 *  green every time. test/protected-terms.mjs drives this function, and renders the screen
 *  itself to check the buttons obey it. */
export function exportPlan(file: ExportInput, terms: string[], practice: Practice): ExportPlan {
  const entities = file.entities ?? [];
  const text = file.text ?? '';
  const rm = remask(text, entities, practice);
  const red = rm.text;
  const readable = exportReadable(text, rm, entities);
  const cut = rm.divergence ? [] : cutRanges(rm);
  const cuts = floorCuts(text, practice, exemptOf(entities));
  const kept = entities.filter((e) => !e.dead);
  // Verified by extraction twice: whole, in the export's readable words; and in part, over the
  // original — every letter and digit of every place a kept row stands, found as the mask finds
  // it, must be one the export replaced. The first alone passed "[Person1] Wei Ling attended"
  // for a kept "Tan Wei Ling" while the overlap rule dropped a shorter row's remainder, since
  // the row as a whole stood nowhere; the second holds the page on any claim the mask drops or
  // places short, instead of shipping a name's other words under "every name you chose to
  // redact is gone". Not asked under a divergence, which holds the page on its own and has no
  // offsets to ask it of. A third time run together (runFound), in the export's readable words
  // with every tag a wall, which is how the .docx writer reads its own masked text for a name run
  // together: asked of the original instead, a find reaching across a tag held the page on the
  // "Co" of "[Party1] Company" for a kept "Ford Motor Co" whose short form had placed, in 7 of
  // the repository's 98 opinions. And run together over the original, read at ends a reader
  // takes the name to stop at, which the "Company" find is not (runOpen): a tag in the export is a wall, so a
  // claim that placed short leaves the rest of the name where no reading of the export finds it.
  const discarded = entities.filter((e) => e.dead);
  const runHit = runFound(readable, kept.filter((e) => !isFloorRow(e)).map((e) => e.text), discarded.filter((e) => !isFloorRow(e)));
  if (!rm.divergence) for (const t of runOpen(text, kept.filter((e) => !isFloorRow(e)).map((e) => e.text), discarded.filter((e) => !isFloorRow(e)), cuts, cut)) runHit.add(t);
  // And a percent-escape that writes no character where a name the mask places could stand
  // ("Ren%E9%20Tan", é written the Latin-1 way, for a kept "René Tan"): no reading can say which
  // letter it meant, and the .docx writer holds the file on it (docxWrite pctHidden, owner ruling
  // 10), asked here with the names the writer is handed. Not asked, the copy, the .txt and the
  // Compare clipboard shipped the link under "none of the listed spans appear in the export"
  // beside a .docx held on those bytes (P1-F5, 2026-09-24).
  let escaped: ExportPlan['escaped'] = null;
  if (!rm.divergence && hasEscape(readable)) {
    const pr = placementRows(entities);
    const ph = pctHidden(readable.split(TAG_BLANK).join(WALL), runNames([...new Set(pr.map((r) => r.span))]), 'text');
    const row = ph ? pr.find((r) => r.span === ph.name)?.row ?? ph.name : undefined;
    if (ph && row !== undefined) { runHit.add(row); escaped = { esc: ph.esc, name: row }; }
  }
  const survivors = kept.filter((e) => rowSurvives(readable, e) || (!isFloorRow(e) && runHit.has(e.text)) || (!rm.divergence && !isFloorRow(e) && rowSpans(text, e, cuts).some(([s, t]) => coverage(text, s, t, cut).open)));
  const stillIn = discarded.filter((e) => rowSurvives(readable, e));
  const maskedAnyway = discarded.filter((e) => !rowSurvives(readable, e)).map((e) => ({ e, by: maskedBy(text, rm, e, entities, cut, cuts) }));
  const holds = listHolds(readable, entities, terms, { text, rm, practice });
  const stuck = holds.filter((h) => !pressLifts(text, entities, h.term, practice)).map((h) => h.term);
  const unreviewed = !file.sample && !file.reviewed;
  const incomplete = !file.sample && file.engineComplete === false;
  const nothingKept = kept.length === 0 && entities.length > 0;
  const verified = survivors.length === 0;
  const blocked = unreviewed || incomplete || !verified || nothingKept || !!rm.divergence || holds.length > 0;
  let docx: ExportPlan['docx'] = null;
  if (file.kind === 'docx' && file.bytes && !unreviewed) {
    const { table, channel, over } = docxMaskTable(entities, terms, sideRowsOf(file));
    const left = entities.filter((e) => e.dead && !isFloorRow(e));
    const leftAt = (t: string) => { const c = floorCuts(t, practice, exemptOf(entities)); return left.flatMap((d) => rowSpans(t, d, c)); };
    // read off the body export's readable words, never inferred from an empty hold list: a term
    // run together inside a spelling of it left readable under Protected terms is no hold, and the
    // .txt carries it while the saved .docx masks it with the list's own row
    const bodyReadable = channel.length ? lateTerms(readable, [], channel.map((e) => e.text)) : [];
    docx = { table, channel, over, bodyReadable, mask: Object.assign((t: string) => remask(t, table, practice), { names: namesOf(table), leftAt }) };
  }
  const docxHeld = file.kind === 'docx' && !file.sample ? sideHeld(file.side) : null;
  return { rm, red, readable, survivors, stillIn, maskedAnyway, verified, unreviewed, incomplete, nothingKept, holds, stuck, blocked, escaped, docx, docxHeld };
}

/** Would the hold's button clear the hold on `term`? Asked by doing what App does with the
 *  press on a copy of the table — withProtectedTerms, then the safety-net rows brought up to
 *  date — and asking the list again of the export that makes. A button that cannot clear its
 *  hold is not offered. On 2026-09-23 a press that changed nothing held its page press after
 *  press for five separate causes (a ruby reading glued on, a term that is also a tag's word, a
 *  safety-net row, a floor row left readable beside the list's own, a term glued to a number),
 *  each fixed where it was found; this asks the same question of the next one, and the page
 *  says what the lawyer can do instead. */
function pressLifts(text: string, entities: Entity[], term: string, practice: Practice): boolean {
  const after = syncFloorRows(text, withProtectedTerms(text, entities, [term], practice), practice);
  const r = remask(text, after, practice);
  return !r.divergence && !listHolds(exportReadable(text, r, after), after, [term], { text, rm: r, practice }).length;
}

/** The names the .docx writer reads a bookmark name against — exportPlan's `docx.mask.names`
 *  for this table and list — without a document to plan. Neither the text nor the practice
 *  enters them: they are the spans docxMaskTable's table places. A caller that wants them
 *  asks here rather than planning an export of an empty file to read them off it. */
export function docxMaskNames(entities: Entity[], terms: string[], side: Entity[] = []): string[] {
  return namesOf(docxMaskTable(entities, terms, side).table);
}
const namesOf = (table: Entity[]) => [...new Set(placementRows(table).map((r) => r.span))];

/** The code every artefact of one export is named after: seven base-36 characters from the
 *  platform's cryptographic random source, drawn when the Export screen opens on a redaction.
 *  It is a function of NOTHING in the document, which is its whole job (Export.tsx, THE
 *  FILENAME CHANNEL, has the two measurements that retired a hash of the original and then a
 *  hash of the redacted text). No fallback to Math.random: a runtime without
 *  crypto.getRandomValues throws here, and the screen says so rather than naming files. */
export function exportCode(): string {
  const A = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  while (out.length < 7) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      // 252 = 7 × 36: a byte above it is dropped so every character is equally likely
      if (b < 252 && out.length < 7) out += A[b % 36];
    }
  }
  return out;
}

function provOf(src: string): Entity['prov'] {
  if (src === 'span') return 'one pass';
  if (src.startsWith('engineB:') || src.startsWith('b3:')) return 'second sweep';
  return 'pattern';
}

/** Occurrence count with the engine's own boundary-guarded footprint. */
export function countOcc(text: string, span: string): number {
  try {
    return Math.max(1, (text.match(footprintRegex(span)) || []).length);
  } catch {
    return Math.max(1, text.split(span).length - 1);
  }
}

/** Verify-by-extraction: does this span still appear in the exported text? */
export function spanSurvives(exported: string, span: string): boolean {
  try {
    return footprintRegex(span).test(exported);
  } catch {
    return exported.includes(span);
  }
}

const PHASE_LABEL: Record<string, string> = {
  span: 'Pass 1 of 3 — reading the document for identities',
  rails: 'Pass 1 of 3 — checking the document’s own defined terms',
  residue: 'Pass 2 of 3 — re-reading the redacted copy for anything left behind',
  suspicion: 'Pass 3 of 3 — double-checking suspicious leftovers',
};

const LEGAL_STAGE_LABEL: Record<string, [string, number]> = {
  substrate: ['Legal engine — pass 1: reading the document for identities', 15],
  sweeps: ['Legal engine — pass 2: the measured sweeps (citations, rails, business dates)', 45],
  restore: ['Legal engine — pass 3: restoring courts, judges and cited codes', 75],
  quasi: ['Legal engine — pass 4: quasi-identifiers (attributes, places)', 90],
};

/** Preferred path: the FROZEN v1-legal pack pipeline via serve-legal.mjs — the engine the
 *  walk-forward rounds actually proved. Falls back to the in-webview core when the
 *  service (or its model) is down, and the outcome SAYS which engine ran (stats.engine —
 *  no silent degradation, the UI-truth law).
 *
 *  `side`: a .docx's text outside its body (lib/side.ts). It is sent AFTER the body, to the
 *  engine that read the body, in a request of its own (readSide); the body's request is the
 *  one it was without it (test/doctrine-profile.mjs law 5). */
export async function stripDocument(
  text: string,
  onProgress: (label: string, pct: number) => void,
  profile: EngineProfile = loadProfile(),
  side?: SideRead,
): Promise<StripOutcome> {
  const terms = loadProtectedTerms();
  // the body's share of the bar, when the text outside it goes after
  const share = side?.state === 'waiting' ? text.length / Math.max(1, text.length + side.text.length) : 1;
  const onBody = share < 1 ? (label: string, pct: number) => onProgress(label, Math.round(pct * share)) : onProgress;
  const svc = await legalServiceHealth();
  if (svc) {
    try {
      onBody('Legal engine — routing the document', 5);
      // Record the stages the service ACTUALLY ran, in order. The receipt used to
      // print a canned pass list; a list inferred from the engine's name is the
      // same defect one layer up. This is the observed sequence.
      const seen: string[] = [];
      const r = await stripLegalService(text, (stage) => {
        if (!seen.includes(stage)) seen.push(stage);
        const [label, pct] = LEGAL_STAGE_LABEL[stage] ?? [`Legal engine — ${stage}`, 50];
        onBody(label, pct);
      }, profile);
      onBody('Building the entity table…', 99);
      const o = mapLegalOutcome(text, r, seen);
      // readSide catches its own failures: one here must hold the .docx, never send the body
      // to the in-app core below
      const s = await readSide(side, o, 'service', onProgress, share, profile);
      return { ...o, entities: withProtectedTerms(o.doc, s.entities, terms), ...(s.side ? { side: s.side } : {}) };
    } catch (e) {
      // fail-loud in the label, then fall back — never pretend the frozen engine ran
      onProgress(`Legal service failed (${String((e as Error).message).slice(0, 60)}) — using in-app core`, 5);
    }
  }
  // The in-app core has no doctrine argument: it is the v1 core, not the v2 sweep stage the
  // profile selects. So a fallback under a non-default doctrine did not honour the setting,
  // and that has to be SAID rather than inferred from `engine: 'in-app-core'` — a lawyer who
  // set "our own matter files" asked for company names never to be released, and this run
  // may release them. Carried on the outcome so the review header and the export receipt
  // both reach it; the receipt is the surface that outlives the progress label.
  const o = await stripText(text, onBody);
  const missed = profile !== 'auto'
    ? {
        profileAsked: profile,
        profileRan: null,
        // Say the CONSEQUENCE, not the mechanism. "the firm profile did not run" is engine
        // vocabulary; what the lawyer needs is which class of thing may still be readable
        // in the document they are about to send out.
        // Which of three: a run that was sent the document and returned nothing usable
        // (RUN_FAILED) was called "unreachable" here while the receipt's engine line said the
        // document went out — two statements about one run, and the one a lawyer answering
        // for where the text went needs is that it did go.
        profileNote: `You chose “${profileLabel(profile)}”, and that setting did not run: ${missedWhy(engineIdentity(o.stats))}, so this document was read by the in-app core, which may leave company and brand names readable.`,
      }
    : {};
  const s = await readSide(side, o, 'core', onProgress, share, profile);
  return { ...o, stats: { ...o.stats, ...missed }, entities: withProtectedTerms(o.doc, s.entities, terms), ...(s.side ? { side: s.side } : {}) };
}

/** why the engine did not read a .docx's text outside the body: fixed words, because they go on
 *  the receipt, which travels — an engine's own error can name a process and its path, and is
 *  kept for the screen (SideRead.detail) */
const SIDE_FAILED = 'the request that sent it to the engine failed';
const SIDE_CUT = 'the in-app core’s read of it did not finish, because one or more of its model calls failed or came back without a whole answer';
const SIDE_BODY_UNFINISHED = 'the engine’s run on the body did not finish, so it was not sent';
const SIDE_ALIGN = 'the frozen legal pipeline read it, but its redacted text of it differs from it somewhere other than at a tag, so the app cannot tell which words it found';

/** The engine's read of a .docx's text outside the body (lib/side.ts, owner ruling 27): sent
 *  once the body is read, to the engine that read it (`via`), in a request of its own, and used
 *  for one thing, the names it finds (joinSide). What the engine made of the text — its mask —
 *  is not used, as nothing is exported from it; but the frozen pipeline's rows are read off
 *  that mask's alignment with the text, so a run whose alignment failed found nothing the app
 *  can use, and is not read (SIDE_ALIGN). Never throws: a failure here is the .docx's hold (exportPlan `docxHeld`) with the reason,
 *  and must not send the body to the in-app core as a failure of the body's run does. */
async function readSide(side: SideRead | undefined, body: StripOutcome, via: 'service' | 'core', onProgress: (label: string, pct: number) => void, share: number, profile: EngineProfile): Promise<{ entities: Entity[]; side?: SideRead }> {
  if (!side) return { entities: body.entities };
  if (side.state !== 'waiting') return { entities: body.entities, side };
  if (!body.complete) return { entities: body.entities, side: { ...side, state: 'not-run', why: SIDE_BODY_UNFINISHED } };
  const n = side.text.length.toLocaleString('en-US');
  const on = (label: string, pct: number) => onProgress(`Outside the body (${n} characters) — ${label}`, Math.round(share * 100 + (1 - share) * pct));
  try {
    let o: StripOutcome;
    if (via === 'service') {
      const seen: string[] = [];
      on('Legal engine — routing the text', 5);
      const r = await stripLegalService(side.text, (stage) => {
        if (!seen.includes(stage)) seen.push(stage);
        const [label, pct] = LEGAL_STAGE_LABEL[stage] ?? [`Legal engine — ${stage}`, 50];
        on(label, pct);
      }, profile);
      o = mapLegalOutcome(side.text, r, seen);
      // The service builds its rows FROM that alignment (serve-legal.mjs rowsFromFinal): when
      // it fails the rows are empty, and taking them would say the engine read a letterhead
      // and found no name in it.
      if (!o.complete) return { entities: body.entities, side: { ...side, state: 'unread', again: false, ran: true, why: SIDE_ALIGN } };
    } else {
      o = await stripText(side.text, on);
      if (!o.complete) return { entities: body.entities, side: { ...side, state: 'unread', again: true, why: SIDE_CUT } };
    }
    on('Joining what it found to the table…', 99);
    const j = joinSide(body.doc, body.entities, o.entities, side.places);
    return {
      entities: j.entities,
      side: { ...side, state: 'read', engine: String(o.stats.engine ?? ''), ...(typeof o.stats.genre === 'string' ? { genre: o.stats.genre } : {}), rows: j.rows, joined: j.joined },
    };
  } catch (e) {
    return { entities: body.entities, side: { ...side, state: 'unread', again: true, why: SIDE_FAILED, detail: String((e as Error)?.message ?? e).slice(0, 200) } };
  }
}

const PROBE = /^\[SideProbe(\d+)\]$/;
const NUMBERED = /^\[([A-Za-z]+)(-?)(\d+)\]$/;

/** Where each of `rows` places in `text`, as the writer places a row there (placements() with
 *  the safety-net pattern's cuts): each row a probe under a tag of its own, beside `beside`,
 *  the rows the writer masks the same text with. `count[i]`: how many places row i claims. */
function probeIn(text: string, rows: Entity[], beside: Entity[], practice: Practice): number[] {
  const count = rows.map(() => 0);
  if (!rows.length || !text) return count;
  const probes = rows.map((e, i): Entity => ({ ...e, tag: `[SideProbe${i}]`, dead: undefined }));
  for (const c of placements(text, [...beside, ...probes], floorCuts(text, practice, NO_EXEMPT))) {
    const m = PROBE.exec(c.tag);
    if (m) count[Number(m[1])]++;
  }
  return count;
}

/** The side run's rows, each cut to a place of its own. sideOf joins the texts of different
 *  places with SIDE_JOIN, a line no region of the frozen pipeline's alignment takes in (lib/
 *  side.ts); a row that crosses it anyway, as it would if the pipeline masked the line itself,
 *  is cut there into its pieces, since the whole of it stands in no place's text and would mask
 *  none of them (H-ATK-1: "Rhiannon Blake\n\nBrightline Holdings Ltd" masked neither part's
 *  second name). The service's rows off one region come one per tag, with the same span
 *  (serve-legal.mjs rowsFromFinal): where there are as many pieces as tags, each piece takes its
 *  tag in order; otherwise the first piece keeps the row's tag and each further piece a tag of
 *  its own, so no tag stands for two names. Each row is also cut to its letters' reach: a region
 *  runs to where the pipeline's own text resumes, and carries the white space before it, which
 *  at a place's end is white space no place's text carries. A piece with no letter or digit is
 *  dropped: it can carry no name. */
export function sideRowsCut(found: Entity[]): Entity[] {
  const top = new Map<string, number>();
  for (const e of found) { const m = NUMBERED.exec(e.tag); if (m) top.set(m[1], Math.max(top.get(m[1]) ?? 0, Number(m[3]))); }
  const named = (s: string) => /[\p{L}\p{N}]/u.test(s);
  const out: Entity[] = [];
  for (let i = 0; i < found.length;) {
    let k = i + 1;
    while (k < found.length && found[k].text === found[i].text) k++;
    const group = found.slice(i, k);
    i = k;
    const pieces = group[0].text.split(SIDE_SEAM).map((s) => s.trim()).filter(named);
    if (pieces.length <= 1) {
      if (pieces.length) for (const e of group) out.push(e.text === pieces[0] ? e : { ...e, text: pieces[0] });
      continue;
    }
    if (pieces.length === group.length) { pieces.forEach((t, j) => out.push({ ...group[j], text: t, key: `${group[j].key}.${j}` })); continue; }
    const e = group[0];
    const m = NUMBERED.exec(e.tag);
    pieces.forEach((t, j) => {
      if (!j || !m) { out.push({ ...e, text: t, key: `${e.key}.${j}` }); return; }
      const n = (top.get(m[1]) ?? 0) + 1;
      top.set(m[1], n);
      out.push({ ...e, text: t, key: `${e.key}.${j}`, tag: `[${m[1]}${m[2]}${n}]` });
    });
  }
  return out;
}

/** The names the engine found in a .docx's text outside the body, joined to the document
 *  (lib/side.ts). `found` is the side run's table; `places` the texts it was sent.
 *    · A row whose term a row of the body already holds is not added: that row masks it in
 *      every part. That row is told where else it was found (Entity.found).
 *    · A row that places in the BODY, as the writer's table places it there beside the body's
 *      rows, joins the table: the body carries it, so the copied text and the .txt must mask it
 *      too, and without it the saved .docx body (which the writer masks with every row) would
 *      mask what the text exports leave readable.
 *    · Any other row places only outside the body. It is returned in `rows`, never in the table
 *      (the table means "found in this document's body", protected-terms law 3), with where it
 *      places and how often; one that places in none of the texts is dropped, as it masks
 *      nothing there. A row the in-app core flagged as boilerplate arrives left readable and
 *      pending, for a decision the review cannot take on it, and is dropped too.
 *    · A row that places in the body only inside the place of a body row (the frozen pipeline
 *      folds two names standing close into one row: "Lim Wei Sheng\nFarah Osman") is carried by
 *      the body too, and joins the table under that row's tag where the two are the same kind, so
 *      one person is not written under two tags in one file. Kept apart, it was listed as "found
 *      only outside the body" beside a body that carries it (H-ATK-5).
 *  Tags: the side run numbered its own. A group of its rows under one tag that holds a row of
 *  the body takes that row's tag, so one name keeps one tag; any other numbered tag is numbered
 *  on past the highest the body holds for its word, so no tag means two things in one file.
 *  A tag with no number ([Date]) is a kind, and is kept.
 *  Each row is first cut to its own place (sideRowsCut). */
export function joinSide(doc: string, entities: Entity[], found: Entity[], places: SidePlace[], practice: Practice = loadPractice()): { entities: Entity[]; rows: Entity[]; joined: number } {
  const bodyBy = new Map<string, Entity>();
  for (const e of entities) { const k = termKey(e.text); if (k && !bodyBy.has(k)) bodyBy.set(k, e); }
  const live = sideRowsCut(found.filter((e) => !e.dead)).filter((e) => termKey(e.text));
  // where each row places outside the body, text by text
  const wheres = live.map(() => [] as string[]);
  const times = live.map(() => 0);
  for (const p of places) {
    const c = probeIn(p.text, live, [], practice);
    c.forEach((k, i) => { if (k) { times[i] += k; if (!wheres[i].includes(p.where)) wheres[i].push(p.where); } });
  }
  // which of the rest place in the body, beside the body's own rows; and which place there only
  // alone, inside the place of a body row, which then says whose
  const bodyRows = entities.filter((e) => !e.dead && !isFloorRow(e));
  const fresh = live.map((e, i) => i).filter((i) => !bodyBy.has(termKey(live[i].text)));
  const inBody = probeIn(doc, fresh.map((i) => live[i]), bodyRows, practice);
  const alone = probeIn(doc, fresh.map((i) => live[i]), [], practice);
  const inside = new Map<number, Entity | null>();
  fresh.forEach((i, j) => {
    if (inBody[j] || !alone[j]) return;
    const e = live[i];
    inside.set(i, bodyRows.find((b) => b.cat === e.cat && probeIn(b.text, [e], [], practice)[0] > 0) ?? null);
  });
  // tags: a group that holds a body row takes its tag, as does one standing inside a body row's
  // place (that row's, where the two are the same kind); the rest numbered past the body's
  const top = new Map<string, number>();
  for (const e of entities) { const m = NUMBERED.exec(e.tag); if (m) top.set(m[1], Math.max(top.get(m[1]) ?? 0, Number(m[3]))); }
  const tagOf = new Map<string, string>();
  for (const e of live) {
    const b = bodyBy.get(termKey(e.text));
    if (b && !tagOf.has(e.tag)) tagOf.set(e.tag, b.tag);
  }
  for (const [i, b] of inside) if (b && !tagOf.has(live[i].tag)) tagOf.set(live[i].tag, b.tag);
  for (const e of live) {
    if (tagOf.has(e.tag)) continue;
    const m = NUMBERED.exec(e.tag);
    if (!m) { tagOf.set(e.tag, e.tag); continue; }
    const k = (top.get(m[1]) ?? 0) + 1;
    top.set(m[1], k);
    tagOf.set(e.tag, `[${m[1]}${m[2]}${k}]`);
  }
  const added: Entity[] = [];
  const rows: Entity[] = [];
  const seen = new Set<string>();
  fresh.forEach((i, j) => {
    const e = live[i];
    const k = termKey(e.text);
    if (seen.has(k)) return;
    seen.add(k);
    const row: Entity = { ...e, key: `side${i}`, tag: tagOf.get(e.tag) ?? e.tag, found: wheres[i] };
    if (inBody[j] || inside.has(i)) added.push({ ...row, occ: countOcc(doc, e.text) });
    else if (wheres[i].length) rows.push({ ...row, occ: times[i], status: 'confirmed' });
  });
  // a body row the side read also found is told where
  const also = new Map<Entity, string[]>();
  live.forEach((e, i) => {
    const b = bodyBy.get(termKey(e.text));
    if (b && wheres[i].length) also.set(b, [...new Set([...(also.get(b) ?? []), ...wheres[i]])]);
  });
  const body = also.size ? entities.map((e) => (also.has(e) ? { ...e, found: also.get(e) } : e)) : entities;
  return { entities: added.length ? [...body, ...added] : body, rows, joined: added.length };
}

/** Why an engine run did not finish, from its own per-step verdicts (completeBy), for the
 *  Export hold and Compare's refusal, and whether dropping the document again can change it.
 *  The frozen pipeline's run is refused when its redacted text does not align with the
 *  document (mapLegalOutcome `align`), and the pipeline gives the same output for the same
 *  text; the in-app core's steps fail on a model call, which a new run makes again. Until
 *  2026-09-25 both said "Re-drop the document to try again", which after an align failure
 *  sends the lawyer round the same loop. */
const STEP_WORD: Record<string, string> = {
  span: 'pass 1 (reading for identities)', rails: 'pass 1 (the document’s own defined terms)',
  residue: 'pass 2 (the re-read of the redacted copy)', suspicion: 'pass 3 (the double-check of suspicious leftovers)',
};
export function unfinishedSaid(completeBy: Record<string, boolean> | undefined): { why: string; again: boolean } {
  if (completeBy?.pipeline === true && completeBy.align === false) {
    return { why: 'the frozen legal pipeline read the whole document, but its redacted text differs from the document somewhere other than at a tag, so the app cannot tell which words each tag replaced', again: false };
  }
  const failed = completeBy ? Object.entries(completeBy).filter(([, ok]) => !ok).map(([k]) => STEP_WORD[k] ?? k) : [];
  return {
    why: failed.length
      ? `the in-app core’s ${andList(failed)} did not finish, because one or more of its model calls failed or came back without a whole answer`
      : 'a step of the engine’s run did not finish',
    again: true,
  };
}

/** why the chosen doctrine did not run, as the in-app core's stamp records it (inAppCoreStamp) */
export function missedWhy(id: Pick<EngineIdentity, 'runStopped' | 'runCut' | 'runFailed'> | null): string {
  // A cut is a stopped run whose result was refused, often at its end, after the pipeline had
  // read the whole document (ruling 20): "stopped partway" then contradicted legal-serve.log,
  // which records the run as completed, on the receipt that goes out with the export (S7A-1).
  if (id?.runCut) return 'the app did not use the frozen legal pipeline’s result, because one of the model’s answers was missing, cut off, or did not say it had finished';
  if (id?.runStopped) return 'the frozen legal pipeline was stopped partway';
  if (id?.runFailed) return 'the frozen legal pipeline was sent this document and returned no result the app could use';
  return 'the local engine was unreachable';
}

export function mapLegalOutcome(text: string, r: { genre: string; engine: string; final: string; alignOk: boolean; rows: LegalRow[]; profile?: string }, stages: string[] = []): StripOutcome {
  const doc = foldFullwidth(text) as string;
  // A row's span is cut to its non-space reach. The service reads each span off the pipeline's
  // alignment with the text (serve-legal.mjs rowsFromFinal), and a region runs to where the
  // pipeline's own text resumes, so it carries the white space after the tag: "Margaret Tan ".
  // Placed with it, the tag took that space too, and the copied text and the .txt read
  // "[Person1]of 3 March." (H-ATK-6; OPS_LEDGER.md 2026-09-13 saw it as "[Id1]August 8, 2013",
  // which the frozen chain's own rendered output also carries; the app's exports are not made from
  // that output). Measured 2026-09-25 over the frozen pipeline's own outputs in raw/stripped (306
  // runs aligned against their drawn originals): 20,347 of the service's rows ended in white
  // space, and a tag run into the letter or digit after it stood 119,045 times in the app's
  // .txt as the rows were, 1,912 times with each span cut (the count takes any letter or digit
  // after a tag, so a name's own plural, "the [Person1]s", counts too), with no run's mask
  // diverging either way. A span
  // that was only white space is no row, as the service already drops one; two that were one span
  // apart from their white space are one row, as the service keys them (lower case, and the tag).
  const seen = new Set<string>();
  const legalRows = r.rows.flatMap((row) => {
    const span = row.span.trim();
    const k = `${span.toLowerCase()}|${row.tag}`;
    if (!span || seen.has(k)) return [];
    seen.add(k);
    return [span === row.span ? row : { ...row, span }];
  });
  const entities: Entity[] = legalRows.map((row, i) => ({
    key: 'e' + i,
    text: row.span,
    tag: row.tag,
    cat: CAT_OF[row.cls] ?? 'term',
    prov: 'pattern' as Entity['prov'],
    occ: countOcc(doc, row.span),
    status: 'confirmed' as Entity['status'],
    cls: row.cls,
    src: row.src,
  }));
  return {
    doc,
    entities,
    suspects: [],
    masked: r.final,
    complete: r.alignOk,
    completeBy: { pipeline: true, align: r.alignOk },
    // profileRan is the service's OWN report of the doctrine it used, echoed on its done
    // line — not the setting we sent. If those two ever disagree the receipt shows the one
    // that did the work, which is the only one that is evidence of anything.
    stats: { engine: r.engine, genre: r.genre, rows: r.rows.length, stages, profileRan: r.profile ?? null },
  };
}

/** Runs the strip in a Web Worker so the UI never stutters; model calls RPC
 *  back through the tauri.ts chokepoint on the main thread. onProgress gets a
 *  human label AND a percentage (from the worker's pre-computed work plan). */
export function stripText(text: string, onProgress: (label: string, pct: number) => void): Promise<StripOutcome> {
  return new Promise<StripOutcome>((resolve, reject) => {
    const worker = new Worker(new URL('./strip.worker.ts', import.meta.url), { type: 'module' });
    // One record per document. On the shared record a worker that died mid-document left its
    // answers behind, and the next document's receipt named a model server that never read it.
    const run = coreRun();
    let phase = 'Pass 1 of 3 — reading every chunk for identities';
    let found = 0;
    let est = 0;
    let lastCalls = 0;
    const t0 = Date.now();
    const emit = () => {
      const pct = est ? Math.min(97, Math.round((lastCalls / est) * 100)) : 4;
      const elapsed = (Date.now() - t0) / 1000;
      const rate = lastCalls / Math.max(1, elapsed);
      const remainS = est && rate > 0 ? (est - lastCalls) / rate : 0;
      const eta = est && lastCalls > 8
        ? ` · ~${remainS < 90 ? Math.max(10, Math.round(remainS / 10) * 10) + 's' : Math.round(remainS / 60) + ' min'} left`
        : '';
      onProgress(`${phase} · ${lastCalls}${est ? `/${est}` : ''} model looks${found ? ` · ${found} found` : ''}${eta}`, pct);
    };
    const finish = (fn: () => void) => { worker.terminate(); fn(); };
    worker.onerror = (e) => finish(() => reject(new Error(e.message || 'strip worker failed')));
    worker.onmessage = async (ev: MessageEvent) => {
      const m = ev.data;
      if (m.type === 'complete-req') {
        try {
          const result = await completeLocal(m.system, m.user, m.opts as CompleteOpts, run);
          worker.postMessage({ type: 'complete-res', reqId: m.reqId, result });
        } catch (e: any) {
          worker.postMessage({ type: 'complete-res', reqId: m.reqId, error: String(e?.message || e) });
        }
        return;
      }
      if (m.type === 'plan') { est = m.estTotal; emit(); return; }
      if (m.type === 'phase') {
        phase = PHASE_LABEL[m.phase] ?? phase;
        if (typeof m.found === 'number') found = m.found;
        if (typeof m.calls === 'number') lastCalls = m.calls;
        emit();
        return;
      }
      if (m.type === 'progress') { lastCalls = m.calls; emit(); return; }
      if (m.type === 'error') { finish(() => reject(new Error(m.message))); return; }
      if (m.type === 'done') { onProgress('Building the entity table…', 99); finish(() => resolve(mapOutcome(m, run))); }
    };
    worker.postMessage({ type: 'strip', text });
  });
}

function mapOutcome(m: { doc: string; table: EngineRow[]; rejected?: Array<{ span: string; verdict: string }>; masked: string; complete: boolean; completeBy: Record<string, boolean>; stats: Record<string, unknown> }, run?: CoreRun): StripOutcome {
  const { doc } = m;
  const suspects: Suspect[] = (m.rejected ?? [])
    .filter((r) => r.span.length >= 3)
    .map((r) => ({ text: r.span, verdict: r.verdict, occ: countOcc(doc, r.span) }))
    .slice(0, 40);
  const entities: Entity[] = (m.table as EngineRow[]).map((row, i) => {
    const prov = provOf(row.src || '');
    return {
      key: 'e' + i,
      text: row.span,
      tag: row.tag,
      // junk suspects group under "Possible over-matches"; their real class
      // rides along in cls for the export path
      cat: row.junkSuspect ? 'term' : (CAT_OF[row.cls] ?? 'term'),
      prov,
      occ: countOcc(doc, row.span),
      junk: row.junkSuspect || undefined,
      // What arrives PENDING — the guided card's queue and the finish-button lock.
      // Boilerplate suspects: pending AND unmasked (readability over ceremony). Rows only the
      // second read found (engineB residue, b3 suspicion): pending but MASKED until a human
      // decides — the fail-closed direction, pinned by test/review-honesty.mjs.
      // 'one pass' (src 'span') is NOT widened in, on measurement (2026-09-23): over the
      // recorded in-app-core tables of walk-forward rounds 4-7 (160 documents, 14,608 rows)
      // against their gold, the share of gold-labelled rows the gold says to mask is 55.1%
      // for 'one pass', 57.2% for rail:classify (the largest block of rows that arrive
      // confirmed) and 42.5% for second sweep (TAB doctrine; product doctrine 34.8 / 34.3 /
      // 27.9). The label also says more than is known: buildTable keeps a span's FIRST
      // nomination, so a 'span' row may have been found by the rails as well. Widening would
      // have put 52% of rows in the queue (median 25 a document, up from 4) on evidence no
      // weaker than rows that arrive confirmed. As it stands, 253 of the 264 recorded
      // two-engine tables open with at least one row pending. This mapping does not reach the
      // frozen service path: mapLegalOutcome confirms every row, and serve-legal.mjs reports
      // src 'legal-pipeline' for all of them, so that path has no per-row evidence to key on.
      status: (row.junkSuspect || prov === 'second sweep' ? 'pending' : 'confirmed') as Entity['status'],
      dead: row.junkSuspect ? true : undefined,
      cls: row.cls,
      src: row.src,
    };
  });
  // Stamp the identity in the APP layer — the vendored core does not name itself
  // (engineB.mjs returns counts only), and every surface that reports which engine
  // ran reads stats.engine. lib-core/ is untouched (FREEZE.md).
  return { doc, entities, suspects, masked: m.masked, complete: m.complete, completeBy: m.completeBy, stats: { ...m.stats, ...inAppCoreStamp(doc, { complete: m.complete, run }) } };
}

/** Real match count with the engine's boundary-guarded footprint — no floor.
 *  0 means "this text does not occur"; callers refuse instead of pretending. */
export function spanMatches(text: string, span: string): number {
  try {
    return (text.match(footprintRegex(span)) || []).length;
  } catch {
    return text.split(span).length - 1;
  }
}

/** Rows the structured floor put in the table (syncFloorRows). The table never places
 *  them — the floor does, over the table's output — and a DEAD floor row is an
 *  exemption: the floor leaves that exact text readable. Until 2026-09-13 the floor was
 *  invisible to every counting, key and scope surface (audit B2): the funnel said
 *  "identical to the original" over a file with seven floor tags in it, the receipt
 *  listed a phone as "left visible by your explicit decision" while the bytes held
 *  [phone], and the name keys had no line for [number] at all. */
export const FLOOR_SRC = 'structured-floor';
const FLOOR_CAT: Record<string, Entity['cat']> = { '[email]': 'contact', '[phone]': 'contact', '[nric]': 'id', '[card]': 'id', '[number]': 'id', '[ssn]': 'id', '[ein]': 'id', '[nino]': 'id', '[nhs]': 'id' };
const FLOOR_CLS: Record<string, string> = { '[email]': 'EMAIL', '[phone]': 'PHONE', '[nric]': 'ID', '[card]': 'ID', '[number]': 'ID', '[ssn]': 'ID', '[ein]': 'ID', '[nino]': 'ID', '[nhs]': 'ID' };
/** the floor's tag, in words, for receipts and keys — the frozen table's five and the
 *  practice tables' four (lib/floorTables.mjs) */
export const FLOOR_WORD: Record<string, string> = { '[email]': 'email address', '[phone]': 'phone number', '[nric]': 'NRIC / FIN', '[card]': 'card number', '[number]': 'long number', ...PRACTICE_TAG_WORD };
/** what the receipt says ran: the frozen table alone, or the frozen table and a practice table */
export function floorTablesLabel(practice: Practice): string {
  return practice === 'sg' ? 'the frozen table (Singapore)' : `the frozen table (Singapore), then the ${practiceLabel(practice)} table`;
}
export const isFloorRow = (e: Entity) => e.src === FLOOR_SRC;
const floorKey = (s: string) => s.trim().toLowerCase();

export interface Placement { s: number; e: number; tag: string }
/** A placement as placements() makes it, before the merge: with the row it places for (`row`,
 *  the review's text of it — a two-token prefix answers for the row it was cut from) and that
 *  row's whole match (`m`), which a remainder or a piece covers only part of. What masked a row
 *  left readable is read off these (maskedBy): read off the placement's own text, a remainder
 *  "Wei Ling" of a kept "Tan Wei Ling" was reported as "another row of the same name" over a
 *  "Wei Ling" left readable, and as a shorter name inside "Mrs Margaret Tan", which it is not
 *  (2026-09-23). */
export interface Claim extends Placement { row: string; m: [number, number] }
export interface FloorHit {
  /** original-text offsets of the text the floor replaced — or, when exempt, left readable */
  s: number; e: number;
  /** that text, as it stands in the original */
  text: string;
  tag: string;
  /** a dead floor row exists for this exact text, so it was left readable */
  exempt: boolean;
}
export interface Remask {
  /** the export bytes */
  text: string;
  /** table claims actually emitted (adjacent duplicates already merged), original offsets */
  placements: Placement[];
  /** claims merged away by the adjacent-duplicate rule — the second half of "[Person1] [Person1]" */
  collapsed: number;
  /** structured-floor matches over the masked text, in rule order */
  floorHits: FloorHit[];
  /** non-null = the accounting above did NOT reproduce the frozen core's own bytes. `text`
   *  is then the core's output and `placements`/`floorHits` are empty: nothing may be
   *  counted from them, and the export screen holds the file and says why. */
  divergence: string | null;
  /** the practice whose table ran after the frozen one (`sg` = the frozen table alone) */
  practice: Practice;
  /** the claims `placements` was made from, each with its row and that row's whole match —
   *  absent under a divergence, and on a mask this file did not make */
  claims?: Claim[];
}

/** a floor rule as applyFloor runs it: the frozen tuples and the practice tables' objects */
type FloorRule = { re: RegExp; tag: string; valid?: (s: string) => boolean };
const asRule = (r: [RegExp, string] | FloorRule): FloorRule => (Array.isArray(r) ? { re: r[0], tag: r[1] } : r);
const FROZEN_RULES: FloorRule[] = (FLOOR_RULES as Array<[RegExp, string]>).map(asRule);

/** The practice pass has no frozen twin to be checked against, so it is checked against
 *  its own reference run: the same hits in the same order with the same tags, each
 *  shipping hit covering its reference hit except for the two repairs (a trailing
 *  separator given back, leading digits absorbed) — and a reference hit may only be
 *  missing where an exemption locked the text it sits in. */
function sameMatchSet(ref: FloorHit[], app: FloorHit[]): boolean {
  const locked = app.filter((h) => h.exempt);
  let j = 0;
  for (const r of ref) {
    const a = app[j];
    if (a && a.tag === r.tag && a.s <= r.s && a.e <= r.e && a.e > a.s && a.e > r.s) { j++; continue; }
    if (locked.some((l) => r.s < l.e && r.e > l.s)) continue; // inside an exempt span: skipped on purpose
    return false;
  }
  return j === app.length;
}

/** The safety-net pattern over the ORIGINAL text, run as the export runs it — the frozen table,
 *  then the practice's, the exemptions honoured — with every hit at its original offsets. The
 *  table's claims are made on the original, and two questions about them are answered from
 *  here: where the pattern will cut a word in two (floorCuts), and which claims stand inside a
 *  match the pattern would mask whole (remask). It does not depend on the claims, so it is kept
 *  for the last few texts: remask, exportPlan and the .docx writer ask it of one text again
 *  and again, and a 60,000-word matter file is read once. */
const floorMemo: Array<{ text: string; key: string; hits: FloorHit[] }> = [];
const NO_EXEMPT: ReadonlySet<string> = new Set();
function floorOfOriginal(text: string, practice: Practice, exempt: ReadonlySet<string>): FloorHit[] {
  const key = `${practice}\u0000${[...exempt].sort().join('\u0000')}`;
  const at = floorMemo.findIndex((m) => m.text === text && m.key === key);
  if (at >= 0) return floorMemo[at].hits;
  const map = Array.from({ length: text.length }, (_, i) => i);
  const frozen = applyFloor(text, map, text, { reference: false, exempt: exempt as Set<string> });
  const rules = (JURISDICTION_RULES as Record<string, FloorRule[]>)[practice] ?? [];
  const hits = rules.length ? [...frozen.hits, ...applyFloor(frozen.text, frozen.map, text, { reference: false, exempt: exempt as Set<string> }, rules).hits] : frozen.hits;
  floorMemo.unshift({ text, key, hits });
  if (floorMemo.length > 4) floorMemo.pop();
  return hits;
}
/** Where the safety-net pattern masks the original, as a guarded edge asks it (freed): `has` — an
 *  offset it cuts at, the edge of a stretch it masks; `inside` — an offset strictly inside one */
export interface FloorCuts { has(i: number): boolean; inside(i: number): boolean }
/** a guarded edge at `i` is no word boundary the export keeps: the pattern cuts there, or masks
 *  the letter on either side of it with the rest of its match */
const freed = (c: FloorCuts, i: number) => c.has(i) || c.inside(i);

/** the stretches the safety-net pattern masks in the original, the exemptions honoured, worked
 *  out the first time a guarded edge asks (protectedSpans, footprintSpans) — never for a text
 *  that has no such edge. Exported for attest.ts, which passes it to those two unread. */
export function floorCuts(text: string, practice: Practice, exempt: ReadonlySet<string>): () => FloorCuts {
  let cuts: FloorCuts | null = null;
  return () => {
    if (!cuts) {
      const at = new Set<number>();
      const hits = floorOfOriginal(text, practice, exempt).filter((h) => !h.exempt && h.s >= 0 && h.e > h.s).map((h): [number, number] => [h.s, h.e]).sort((a, b) => a[0] - b[0]);
      for (const [s, e] of hits) { at.add(s); at.add(e); }
      // one ordered list of disjoint stretches, so the last to start before i is the only one
      // that can hold it; a rule runs over what the rules before it left, but a merge costs
      // nothing and does not lean on that
      const runs: Array<[number, number]> = [];
      for (const [s, e] of hits) {
        const last = runs[runs.length - 1];
        if (last && s < last[1]) last[1] = Math.max(last[1], e); else runs.push([s, e]);
      }
      cuts = {
        has: (i) => at.has(i),
        inside: (i) => {
          let lo = 0, hi = runs.length - 1;
          while (lo <= hi) { const mid = (lo + hi) >> 1; if (runs[mid][0] < i) lo = mid + 1; else hi = mid - 1; }
          return hi >= 0 && i < runs[hi][1];
        },
      };
    }
    return cuts;
  };
}

/** The table's claims: kept, non-floor rows, boundary-guarded and prefix-propagated —
 *  computed as NON-OVERLAPPING placements on the ORIGINAL text (QA finding:
 *  sequential replace could match inside an already-placed tag like
 *  [COMPANY-1] and nest tags; offsets make that structurally impossible).
 *
 *  THE OVERLAP RULE. Longest first, and a longer row wins the text it shares with a shorter
 *  one — but only that text: the shorter row's words outside the overlap are placed under the
 *  shorter row's tag. Until 2026-09-23 the shorter row's whole match was dropped, so with
 *  "Mrs Margaret Tan" and "Tan Wei Ling" both kept, "Mrs Margaret Tan Wei Ling" exported as
 *  "[Person1] Wei Ling": a confirmed row's given names readable, and verification green, since
 *  "Tan Wei Ling" as a whole no longer stood anywhere. A confirmed row's words are masked
 *  wherever the row places. The remainder is trimmed of spacing and must hold a letter or a
 *  digit; a remainder is an ordinary claim, so the .txt, both clipboards, the Review preview and
 *  every part of the .docx (which masks with remask) carry it alike.
 *  The remainder is trimmed of everything that is not a letter, a digit or a mark: trimmed of
 *  spacing only, a kept "Tan, Wei Ling" beside a kept "Mrs Margaret Tan" took the comma into
 *  its tag, and "Mrs Margaret Tan, Wei Ling attended" exported as "[Person1][Person2] attended"
 *  (2026-09-23) — a comma a reader of the copy needs, and nothing of the name.
 *
 *  A protected row is matched with protectedSpans, an engine row with footprintSpans: each also
 *  takes a match glued to digits the safety-net pattern cuts away (`cuts`), which is where the
 *  export shows the row as a word.
 *
 *  THE RUN-TOGETHER RULE. Last, and only over text nothing above claimed: a row standing with
 *  nothing between its words and what is beside it — "KestrelCapital", "kestrelcapital.com",
 *  "the Biondos", "Stan-back" broken across a line, "Traína", "Anna Tan12", "Anna Tan東京" — is
 *  found as the .docx writer finds it in text a reader sees (refFind 'text', the reading its
 *  placeFlow gives a flow, imported so the two readings cannot drift) and placed under the row's
 *  tag. Read 'all' instead, the words "a new man" carried a row "Newman", and x with a
 *  subscript i a row "Xi". A row's match starts and stops at a word's edge, so every one of
 *  these shipped in the .txt, both clipboards and the Review preview with verification green,
 *  while the writer masks them in the saved .docx under owner ruling (1) of 2026-09-23. Over
 *  the repository's 98 opinions, each with its caption's parties as the table, the rule masks
 *  136 more stretches in 18 of them, every one the party's own name (the Biondos, the Smoaks,
 *  the Andriasians, "Traína", "Hickson Corp" inside "Hickson Corporation", "Innovad, Inc"
 *  before a full stop), and costs about 2 s of plan time over all 98 (4.0 s without it, 6.2 s
 *  with). The one over-mask it once carried — "cardio[Party2] drug", a row "Vascular Health"
 *  read inside the plain word "cardiovascular" — is gone since the writer reads a row inside a
 *  word only in a token that is not a word of prose (owner ruling 8, 2026-09-24). Nothing was
 *  held before or after (re-measured 2026-09-24). What is claimed above is a
 *  wall, as the writer blanks the tags it wrote, and a find that overlaps a longer one is
 *  placed in its pieces outside it, as a shorter row is (THE OVERLAP RULE). A find lying wholly
 *  inside a place a row the lawyer left readable stands, where that row is the same name, is not
 *  placed (inLeft): without that a confirmed "O’Brien Kessler LLP" read the straight-apostrophe
 *  "O'Brien Kessler LLP" the lawyer had left readable beside it, masked it, and no page said a
 *  review decision had been undone. A find that runs past such a place is placed: with those
 *  places walls, a left-readable "Anna" walled the kept "Anna Tan" out of "Ms Anna Tan12", and
 *  the name shipped in the .txt, the Review preview and both clipboards with verification green
 *  while the saved .docx masked it (2026-09-24). So is a find inside a place a different row left
 *  readable stands, as the row's own match is: "www.[Company1].com" for a kept "Kestrel Capital"
 *  inside the address "www.kestrelcapital.com" the lawyer left readable, which the saved .docx
 *  masks too (P1-F1). */
function placements(text: string, entities: Entity[], cuts: () => FloorCuts): Claim[] {
  const rows = placementRows(entities);
  rows.sort((a, b) => b.span.length - a.span.length);
  const claimed: Array<Placement & Partial<Pick<Claim, 'row' | 'm'>>> = [];
  const rest = (s: number, e: number, tag: string, row: string, m: [number, number]) => {
    const t = trimmed(text, s, e);
    if (t) claimed.push({ s: t[0], e: t[1], tag, row, m });
  };
  /** where each row's own match stood, by span — THROUGH A CLAIM, below, reads only elsewhere */
  const matched = new Map<string, Array<[number, number]>>();
  for (const row of rows) {
    let found: Array<[number, number]>;
    try {
      found = row.tol ? protectedSpans(text, row.span, cuts) : footprintSpans(text, row.span, cuts);
    } catch { continue; }
    matched.set(row.span, [...(matched.get(row.span) ?? []), ...found]);
    const from = claimed.length;
    for (const [s, e] of found) {
      const over = claimed.filter((c) => s < c.e && e > c.s).sort((a, b) => a.s - b.s);
      if (!over.length) { claimed.push({ s, e, tag: row.tag }); continue; }
      let p = s;
      for (const c of over) { if (c.s > p) rest(p, c.s, row.tag, row.row, [s, e]); p = Math.max(p, c.e); }
      if (p < e) rest(p, e, row.tag, row.row, [s, e]);
    }
    // a match placed whole is its own row's whole match
    for (let i = from; i < claimed.length; i++) if (claimed[i].row === undefined) claimed[i] = { ...claimed[i], row: row.row, m: [claimed[i].s, claimed[i].e] };
  }
  // THE RUN-TOGETHER RULE, over the text with every claim above blanked, less a find inside a
  // place a row of its own name the lawyer left readable stands
  const bySpan = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!bySpan.has(r.span)) bySpan.set(r.span, r);
  const names = runNames([...bySpan.keys()]);
  if (names.length) {
    const walls: Array<[number, number]> = claimed.map((c) => [c.s, c.e]);
    const deadAt: LeftPlace[] = [];
    for (const d of entities) if (d.dead && !isFloorRow(d)) deadAt.push(...placesOf(d, rowSpans(text, d, cuts)));
    // a find is the same name as a row left readable when its span is, or the row the span was
    // cut from is (a two-word prefix answers for its row)
    const own = new Map(names.map((n) => [n.name, [n.c, refCompact(bySpan.get(n.name)?.row ?? n.name).c]]));
    const inDead = (f: RefFind) => inLeft(deadAt, f, own.get(f.name) ?? []);
    const blank = walled(text, walls);
    // a short form written long is placed to the end of its word (RefFind.long, owner ruling
    // 19a): placed short, "Hickson Corporation" went out "[Company1]oration" on every path
    const finds = refFind(blank, names, 'text').map((f) => (f.long ? { s: f.s, e: f.long, name: f.name } : f)).filter((f) => !inDead(f)).sort((a, b) => b.e - b.s - (a.e - a.s) || a.s - b.s);
    for (const f of finds) {
      const r = bySpan.get(f.name);
      if (!r) continue;
      const over = claimed.filter((c) => f.s < c.e && f.e > c.s).sort((a, b) => a.s - b.s);
      if (!over.length) { claimed.push({ s: f.s, e: f.e, tag: r.tag, row: r.row, m: [f.s, f.e] }); continue; }
      let q = f.s;
      for (const c of over) { if (c.s > q) rest(q, c.s, r.tag, r.row, [f.s, f.e]); q = Math.max(q, c.e); }
      if (q < f.e) rest(q, f.e, r.tag, r.row, [f.s, f.e]);
    }
    // THROUGH A CLAIM. The claims above are walls, so a row whose footprint refused a glued edge
    // while a shorter row claimed some of its words was never read whole: kept "Wei Ling Tan" in
    // "Mr Wei Ling Tan12" — the prefix "Wei Ling" claimed, "Tan1" refused — exported "Mr
    // [Person1] Tan12" on every path, the saved .docx included, with verification green; so did
    // "Tan Wei Ling陈伟玲", "Kestrel Capital Partners2", and "Ms Anna Tan12" beside a kept "Anna"
    // (2026-09-23). Read once more with no claim walled, at ends a reader takes the name to stop
    // at (runsThrough), a find outside every place a row of its own name left readable stands
    // (inDead) with a letter or a digit no claim covers is placed
    // whole under its row's tag, the claims inside it given up to it: "Mr [Person1]12", "the
    // [Person1]s". A claim that reaches outside the find keeps its text, and the find's words
    // outside it are placed in pieces, as THE OVERLAP RULE places a shorter row. Where the row's
    // own match stands, the overlap rule above has already placed it, and this does not read it
    // again. A find a longer word carries on past is not read through a claim ("[Party1]mpany");
    // a short form written long is, to the end of its word: "Ford Motor Company" beside a kept
    // "Ford Motor Co" is "[Party1]", where it was "[Party1] Company" (owner ruling 19a).
    const held = claimed.map((c): [number, number] => [c.s, c.e]).sort((a, b) => a[0] - b[0]);
    const through = runsThrough(text, names, held, (f) => coverage(text, f.s, f.e, held).open && !inDead(f));
    for (const f of through.sort((a, b) => b.e - b.s - (a.e - a.s) || a.s - b.s)) {
      const r = bySpan.get(f.name);
      if (!r || (matched.get(f.name) ?? []).some(([a, b]) => f.s < b && f.e > a)) continue;
      const over = claimed.filter((c) => f.s < c.e && f.e > c.s);
      if (!coverage(text, f.s, f.e, over.map((c): [number, number] => [c.s, c.e]).sort((a, b) => a[0] - b[0])).open) continue;
      const cross = over.filter((c) => c.s < f.s || c.e > f.e).sort((a, b) => a.s - b.s);
      for (const c of over) if (!cross.includes(c)) claimed.splice(claimed.indexOf(c), 1);
      if (!cross.length) { claimed.push({ s: f.s, e: f.e, tag: r.tag, row: r.row, m: [f.s, f.e] }); continue; }
      let q = f.s;
      for (const c of cross) { if (c.s > q) rest(q, c.s, r.tag, r.row, [f.s, f.e]); q = Math.max(q, c.e); }
      if (q < f.e) rest(q, f.e, r.tag, r.row, [f.s, f.e]);
    }
  }
  return (claimed as Claim[]).sort((a, b) => a.s - b.s);
}
/** what the .docx writer blanks a written tag with, and refFind reads as a wall */
const WALL = '█';
/** The table's names as the writer reads them run together (refNames), from the spans alone:
 *  refNames reads a mask's `names` and never calls the mask, which throws here if it ever does. */
const runNames = (spans: readonly string[]): RefName[] =>
  refNames(Object.assign((): never => { throw new Error('runNames: refNames called the mask'); }, { names: spans }));
/** `text` with every range in `ranges` (any order, overlaps allowed) written over with WALL */
function walled(text: string, ranges: Array<[number, number]>): string {
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '';
  let p = 0;
  for (const [s, e] of ranges) { if (e <= p) continue; const from = Math.max(s, p); out += text.slice(p, from) + WALL.repeat(e - from); p = e; }
  return out + text.slice(p);
}
/** Which of `spans` stand run together in the export's readable words (exportReadable), each
 *  replaced run a wall, less a find lying wholly inside a place a row the lawyer left readable
 *  (`left`) stands that is the same name (inLeft), as placements() drops one — a find the
 *  placement missed, which the saved .docx would mask and the .txt not. Every row in one reading:
 *  asked a row at a time, the readable text was compacted once per row, and exportPlan on a
 *  407,669-character body with 40 rows took 12.2 s. Read once, it takes 0.65 s against 0.50 s
 *  without the rule, and remask 0.43 s against 0.28 s (measured 2026-09-23). */
function runFound(readable: string, spans: readonly string[], left: readonly Entity[]): Set<string> {
  return new Set(runReadings(readable, runNames(spans), left, false).map((f) => f.name));
}
/** runFound's reading, each find where it stands (`map`) or not. `governs`: which of `left` may
 *  drop a find of its own name (every one, unless the caller says) */
function runReadings(readable: string, names: RefName[], left: readonly Entity[], map: boolean, governs: (d: Entity) => boolean = () => true): RefFind[] {
  if (!names.length) return [];
  const r = readable.split(TAG_BLANK).join(WALL);
  const dz = left.flatMap((d) => placesOf(d, readableAt(r, d), governs(d)));
  // where each find stands is needed to tell one inside a form left readable from one past it
  if (!dz.some((p) => p[2])) return refFind(r, names, 'text', false, map);
  const own = new Map(names.map((n) => [n.name, [n.c]]));
  return refFind(r, names, 'text', false, true).filter((f) => !inLeft(dz, f, own.get(f.name) ?? []));
}
/** A place a row the lawyer left readable stands, and that row's name as refFind compares names
 *  (refCompact: its letters and digits, run together, in small letters) — or '' where the caller
 *  does not let the row govern, which no name equals (refNames drops a name under two). */
type LeftPlace = [number, number, string];
const placesOf = (d: Pick<Entity, 'text'>, at: Array<[number, number]>, governs = true): LeftPlace[] => {
  const c = governs ? refCompact(d.text).c : '';
  return at.map(([a, b]): LeftPlace => [a, b, c]);
};
/** Does `f` lie wholly inside one of `at`, the places a row the lawyer left readable stands, where
 *  that row is the same name — `names`, the find's name and the row it answers for, compacted. A
 *  find that does is that row's text written another way ("O'Brien Kessler LLP" left readable
 *  beside a kept "O’Brien Kessler LLP"), and is left as the lawyer left it. A find that runs past
 *  such a place is a longer name the lawyer kept, and is not: read with those places as walls,
 *  kept "Anna Tan" in "Ms Anna Tan12" beside a left-readable "Anna" read "████ Tan12", and the
 *  name shipped whole in the .txt, the Review preview and both clipboards with verification green
 *  while the saved .docx masked it (2026-09-24). Nor is a find that stands inside a DIFFERENT
 *  row left readable: dropped there, a kept or listed "Kestrel Capital" inside a web address the
 *  lawyer left readable, "www.kestrelcapital.com", shipped in the .txt, the Review preview and
 *  both clipboards under a green verification and no hold, while the saved .docx masked it and
 *  the receipt said none of it was readable in the text (P1-F1, 2026-09-24). A shorter kept row
 *  inside a wider one left readable is masked by the row's own match as well ("Kestrel" inside
 *  "Kestrel Holdings Ltd"), and the run-together reading now agrees with it. */
function inLeft(at: ReadonlyArray<LeftPlace>, f: { s: number; e: number }, names: readonly string[]): boolean {
  return at.some(([a, b, c]) => a <= f.s && f.e <= b && names.includes(c));
}
/** Where `names` stand run together in `w`, at ends a reader takes the name to stop at: refFind
 *  'text' less a find a longer word of prose carries on past. This is the reading asked THROUGH
 *  what the mask claimed (placements, exportPlan, listHolds), and only this one. A short form
 *  written long (LONG_FORM, "Ford Motor Co" in "Ford Motor Company") is taken to the end of its
 *  word, as refFind says it runs (RefFind.long, owner ruling 19a); cut at the short form's end,
 *  it read "Ford Motor Co" into the "Company" beside its placed short form as "[Party1]mpany",
 *  and the page held on "[Party1] Company" in 7 of the repository's 98 opinions. Read
 *  between word breaks alone, a kept "Mary Anne Smith" shipped the "Smiths" of "the Mary Anne
 *  Smiths" behind its own placed "Mary Anne". An end is taken where a word breaks or the word
 *  runs on by fewer than three letters (endHolds), and — from RUN_FLOOR, as refFind takes it —
 *  inside a token that is not a word of prose (a dot, slash, backslash, colon, @, #, underscore
 *  or digit in it, or an @ or # it starts with: owner rulings 8 and 18), asked of refFind itself
 *  (`nonProse`) rather than of a copy of its rule. Until 2026-09-24 that last was refused too, so
 *  a name a shorter kept row had claimed a word of was not read through the claim inside a web
 *  address or a file name: kept "Margaret Tan" and "Margaret", "www.margaret.tanlaw.com" exported
 *  "www.[Person2].tanlaw.com" and "margaret-tanfiles.pdf" "[Person2]-tanfiles.pdf" on every path, the surname readable under a
 *  green verification — and a term listed late beside a kept "Margaret" never held the page over
 *  "www.[Person1]tanlaw.com" while the saved .docx masked it with the list's own row (P1-F4,
 *  P1-T1, P1-T2).
 *  Read only NEAR `near` (what the mask claimed or cut), since each caller wants a find that
 *  overlaps one of those ranges: one that overlaps none stands the same in the export's own words,
 *  where the whole-text readings find it (pass 1 of placements, runFound, listHolds' runRead). A
 *  find overlapping a range stands within as many letters and digits of it as the longest name
 *  holds, and a word break looks two characters back and one on, so each range is widened by that
 *  many and three more, counted in letters and digits and never in characters, since a find
 *  carries any run of spaces between its words. On a 410,000-character body with 40 rows each
 *  call read 28% of it, in 0.09 s where the whole body took 0.25 s to 0.54 s (measured
 *  2026-09-23, three calls to an export plan). `keep` is asked before a find's edges are read.
 *  Only a find that overlaps one of the ranges is returned. A window's edge falls where the
 *  count of letters runs out, often inside a word, and refFind reads the slice's first letter
 *  as a word's first: a kept "Ong" was read in the "ong" of "Wong" whenever "Wong" stood the
 *  window's width from a claim, and "Wong abcdefghijk Margaret Tan signed." exported "W[Person2]
 *  abcdefghijk [Person1] signed." with verification green, a party's name told to the model as
 *  another's while the saved .docx left "Wong" alone (2026-09-24). A find that overlaps a range
 *  has the three letters of slack on each side of it inside the window, which is what refFind
 *  needs to read the edge as the whole text reads it. Each window is then taken out to the
 *  spaces either side of it, however far they stand, since refFind reads whether a word is prose
 *  from the whole of what stands between two spaces: a window that ended before the slash of
 *  "margaret-tanlawpartnershipdocs/brief" read the token as a word of prose, and a kept "Margaret
 *  Tan" beside a kept "Margaret" shipped "[Person2]-tanlawpartnershipdocs/brief" on every path
 *  with verification green (protected-terms law 41). Taken out at most 256 characters until
 *  2026-09-24, the same shipped with the slash 300 letters on: refFind read the cut token as a
 *  word of prose and never took the find (P13-SNAP, protected-terms law 43). Windows that meet
 *  are merged, so however long a token is, a call reads it once. They are merged before they are
 *  taken out to their spaces, and a merged window is taken out only past the end it had: taken
 *  out first, every claim inside one long token walked back to the token's start and on to its
 *  end, and 4,000 claims in a 90,000-character token took 15.7 s (F7-SNAP, 2026-09-24; law 43
 *  times it). A find that is a short form written long (RefFind.long, owner ruling 19a: "Hickson
 *  Corp" in "Hickson Corporation") is returned ending where the long word ends, and its end is
 *  asked there: masked short it went out "[Company1]oration", and read through a claim of
 *  "Ford Motor" it was refused as a find a longer word runs on past, and "Ford Motor Company"
 *  went out "[Party1] Company". */
function runsThrough(w: string, names: RefName[], near: Array<[number, number]>, keep: (f: RefFind) => boolean): RefFind[] {
  if (!names.length || !w || !near.length) return [];
  const reach = names.reduce((m, n) => Math.max(m, n.c.length), 0) + 3;
  const ranges = [...near].sort((x, y) => x[0] - y[0]);
  /** each window, with the ranges it was widened from: ranges[i0] to ranges[i1 - 1] */
  const wins: Array<{ a: number; b: number; i0: number; i1: number }> = [];
  ranges.forEach(([s, e], i) => {
    const lo = stepLetters(w, s, -reach), hi = stepLetters(w, e, reach);
    const last = wins[wins.length - 1];
    // a window that meets the last is merged before it is taken out to its spaces, and taken out
    // only past the last one's end, so no stretch of a token is walked twice
    if (last && lo <= last.b) { if (hi > last.b) last.b = snapOn(w, hi); last.i1 = i + 1; return; }
    wins.push({ a: snapBack(w, lo), b: snapOn(w, hi), i0: i, i1: i + 1 });
  });
  const reaches = (g: RefFind, i0: number, i1: number) => { for (let i = i0; i < i1; i++) if (g.s < ranges[i][1] && g.e > ranges[i][0]) return true; return false; };
  const out: RefFind[] = [];
  for (const { a, b, i0, i1 } of wins) {
    const slice = w.slice(a, b);
    let np: Set<string> | undefined;
    for (const f of refFind(slice, names, 'text')) {
      // a short form written long ends where its word does (RefFind.long, owner ruling 19a)
      const g = { s: f.s + a, e: (f.long ?? f.e) + a, name: f.name };
      if (!reaches(g, i0, i1) || !keep(g)) continue;
      if (endHolds(w, g.s, -1) && endHolds(w, g.e, 1)) { out.push(g); continue; }
      np ??= nonProse(slice, names);
      if (np.has(`${f.s}:${f.e}:${f.name}`)) out.push(g);
    }
  }
  return out;
}
/** the offset of the space before `i` in `s` (or the text's start), and of the space after it
 *  (or the text's end): a window of runsThrough taken out to the whole of each token it cut */
function snapBack(s: string, i: number): number {
  while (i > 0 && !/\s/.test(s[i - 1])) i--;
  return i;
}
function snapOn(s: string, i: number): number {
  while (i < s.length && !/\s/.test(s[i])) i++;
  return i;
}
/** The finds refFind 'text' takes in `s` at ends that are a word's break or, from RUN_FLOOR, a
 *  token that is not a word of prose — and not at the two ends it takes past a longer word of
 *  prose, a closed ending and a short form written long (LONG_FORM): each name is handed to it
 *  with one more place its own words break, before its last letter, and refFind reads both of
 *  those from the name's last word, which is then one letter. Keyed "s:e:name". Asked of refFind,
 *  never of a copy of its rule, so the two cannot drift: '#' joined '@' there (owner ruling 18)
 *  and reached every path of this file with no line here changed. docxWrite's nonProseToken says
 *  the same of one token, but not whether the name's length lets refFind read inside it, nor the
 *  two ends this leaves, which only a find says. A short form written long never reaches this:
 *  runsThrough asks its end where the long word ends (owner ruling 19a). protected-terms law 41
 *  pins what this takes and what it leaves ("the Mary Anne Smiths", "Ford Motor Company"), each
 *  with a CONTROL. */
function nonProse(s: string, names: RefName[]): Set<string> {
  const cut = names.map((n): RefName => ({ name: n.name, c: n.c, cuts: new Set([...(n.cuts ?? refCompact(n.name).cuts), n.c.length - 1]) }));
  return new Set(refFind(s, cut, 'text').map((f) => `${f.s}:${f.e}:${f.name}`));
}
/** the offset `k` letters and digits from `i` (back when `k` is negative), or the text's edge.
 *  A letter outside the Basic Multilingual Plane is not counted, which only widens the window. */
function stepLetters(s: string, i: number, k: number): number {
  let n = Math.abs(k);
  if (k < 0) { while (i > 0 && n > 0) { i--; if (LETTER_OR_DIGIT.test(s[i])) n--; } return i; }
  while (i < s.length && n > 0) { if (LETTER_OR_DIGIT.test(s[i])) n--; i++; }
  return i;
}
/** does a word break at offset `i` of `s`, as refFind reads a word (refCompact's cuts) */
function breakAt(s: string, i: number): boolean {
  const before = s.slice(Math.max(0, i - 16), i);
  return refCompact(before + s.slice(i, i + 16)).cuts.has(refCompact(before).c.length);
}
/** is offset `i` of `s` an end a reader takes a find's name to stop at — the end before it when
 *  `dir` is -1, after it when 1: a word breaks there, or the word runs on past it by fewer than
 *  three letters and digits ("the Mary Anne Smiths"). refFind has already asked its closed list
 *  of endings (s, es), but of a window runsThrough cut from `s`, and a window's edge can fall
 *  inside a word; this asks again of the find as it stands in the whole of `s` */
function endHolds(s: string, i: number, dir: 1 | -1): boolean {
  if (breakAt(s, i)) return true;
  let n = 0;
  for (let j = dir > 0 ? i : i - 1; j >= 0 && j < s.length && LETTER_OR_DIGIT.test(s[j]); j += dir) if (++n >= 3) return false;
  return true;
}
/** Which of the kept rows' spans stand run together in the ORIGINAL, at ends a reader takes
 *  the name to stop at (runsThrough), with a letter or a digit the export did not replace (`cut`),
 *  less a find lying wholly inside a place a row the lawyer left readable stands that is the same
 *  name (inLeft), as placements() drops one. placements() places every such find, so this finds one only when the
 *  mask drops or places short what it found:
 *  runFound reads the export, where a claim's tag is a wall, and "Mr [Person1] Tan12" for a kept
 *  "Wei Ling Tan" carried the name nowhere it could read it (2026-09-23). */
function runOpen(text: string, spans: readonly string[], left: readonly Entity[], cuts: () => FloorCuts, cut: Array<[number, number]>): Set<string> {
  const dz = left.flatMap((d) => placesOf(d, rowSpans(text, d, cuts)));
  const names = runNames(spans);
  const own = new Map(names.map((n) => [n.name, [n.c]]));
  return new Set(runsThrough(text, names, cut, (f) => coverage(text, f.s, f.e, cut).open && !inLeft(dz, f, own.get(f.name) ?? [])).map((f) => f.name));
}
/** [s, e) of `text` with everything but letters, digits and marks trimmed off both ends, or null
 *  when nothing of a name is left in it */
function trimmed(text: string, s: number, e: number): [number, number] | null {
  while (s < e && !NAME_CHAR.test(text.slice(s, s + 2))) s += (text.codePointAt(s) ?? 0) > 0xffff ? 2 : 1;
  while (e > s && !NAME_CHAR_END.test(text.slice(Math.max(s, e - 2), e))) e -= e - 2 >= s && (text.codePointAt(e - 2) ?? 0) > 0xffff ? 2 : 1;
  return /[\p{L}\p{N}]/u.test(text.slice(s, e)) ? [s, e] : null;
}
const NAME_CHAR = /^[\p{L}\p{N}\p{M}]/u;
const NAME_CHAR_END = /[\p{L}\p{N}\p{M}]$/u;

/** The rows the table places, as lib-core is handed them: kept, non-floor, and the two-token
 *  prefixes propagateProperPrefixes adds for a COMPANY or PERSON row. placements() masks with
 *  these, and exportPlan hands their spans to the .docx writer as the names a bookmark is read
 *  against, so the writer never reads a bookmark for a name the mask does not place. */
function placementRows(entities: Entity[]): Array<{ span: string; tag: string; tol?: boolean; row: string }> {
  const rows = propagateProperPrefixes(
    entities
      // The 'PERSON' default is for rows the review screen mints with no class of their own,
      // where a name is the likely case and over-masking is the safe direction. A protected
      // row must never fall through it: Review's drag-to-extend clones a row by cat and drops
      // cls, so the short form left behind by widening a protected span arrives here classless
      // and would otherwise be spread by its leading two tokens.
      .filter((e) => !e.dead && !isFloorRow(e))
      // `tol`: a protected row is matched tolerantly (protectedRegex — curly apostrophes, dash
      // variants, decomposed accents, invisible characters, CJK neighbours). The flag rides on
      // the row object, so the two-token prefixes lib-core adds for a COMPANY/PERSON row do
      // not carry it and keep the frozen footprint.
      .map((e) => ({ span: e.text, tag: e.tag, cls: e.cls ?? (e.cat === 'protected' ? PROTECTED_CLS : 'PERSON'), src: e.src ?? 'review', tol: e.cat === 'protected', row: e.text })),
  ) as Array<{ span: string; tag: string; tol?: boolean; row?: string }>;
  // a prefix lib-core added answers for the row it was cut from: the row of its tag whose first
  // two words it is (propagateProperPrefixes cuts "a b", less a trailing comma or full stop)
  const head = (span: string) => span.split(/\s+/).slice(0, 2).join(' ').replace(/[,.]+$/, '').toLowerCase();
  return rows.map((r) => (r.row !== undefined ? r : { ...r, row: rows.find((p) => p.row !== undefined && p.tag === r.tag && head(p.span) === r.span.toLowerCase())?.row ?? r.span })) as Array<{ span: string; tag: string; tol?: boolean; row: string }>;
}

/** the tag shapes the adjacent-duplicate rule merges — same shape collapseAdjacentTags tests */
const COLLAPSIBLE = /^\[[A-Za-z]+-?\d+\]$/;

/** One pass of the frozen floor rules over `cur`, where `map[i]` is the original offset of
 *  cur[i] (-1 inside a tag). `reference` mode is lib-core's floorMask exactly — it exists so
 *  the app's accounting can be checked against the frozen core byte for byte before any
 *  number derived from it is shown. App mode adds, on an IDENTICAL match set:
 *    · exemptions — a match whose text is a dead floor row is left readable, and later
 *      rules may not carve a smaller match out of it;
 *    · two emission repairs — a trailing separator the card rule swallows is put back
 *      ("[card]on the day" → "[card] on the day"), and a match that begins flush after a
 *      digit run absorbs the run ("9[phone]" → "[phone]", and the core's "[number][phone]"
 *      for a long run becomes one "[phone]"): a floor tag never leaves a stray digit
 *      before it. Only the phone rule can begin flush after a digit (the other four open
 *      on \b or swallow digits into the match); nothing is absorbed AFTER a match, because
 *      every digit rule ends on \b and a match the email rule leaves digits after
 *      ("[email]123") is emitted as the core emits it — extending it could swallow the
 *      start of the core's next match and mask less than the core does. */
function applyFloor(cur: string, map: number[], text: string, mode: { reference: true } | { reference: false; exempt: Set<string> }, rules: FloorRule[] = FROZEN_RULES): { text: string; map: number[]; hits: FloorHit[] } {
  const hits: FloorHit[] = [];
  const locked: Array<[number, number]> = []; // original-offset ranges left readable on purpose
  for (const { re, tag, valid } of rules) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let next = '';
    const nextMap: number[] = [];
    let last = 0;
    const copy = (from: number, to: number) => { for (let i = from; i < to; i++) { next += cur[i]; nextMap.push(map[i]); } };
    for (const m of cur.matchAll(g)) {
      let s = m.index!, e = s + m[0].length;
      if (s < last) continue; // cannot happen (matches never overlap, nothing grows forward); kept so a rule change cannot double-emit
      if (valid && !valid(m[0])) continue; // a nominee that fails its check is no match, in either mode
      if (!mode.reference) {
        while (e > s + 1 && /[ .-]/.test(cur[e - 1])) e--;
        while (s > last && map[s - 1] >= 0 && /\d/.test(cur[s - 1])) s--; // never back into an emitted span
      }
      let os = -1, oe = -1;
      for (let i = s; i < e; i++) if (map[i] >= 0) { if (os < 0) os = map[i]; oe = map[i] + 1; }
      const orig = os >= 0 ? text.slice(os, oe) : cur.slice(s, e);
      if (!mode.reference) {
        if (locked.some(([a, b]) => os < b && oe > a)) continue; // a later rule inside an exempt span
        if (mode.exempt.has(floorKey(orig))) {
          hits.push({ s: os, e: oe, text: orig, tag, exempt: true });
          locked.push([os, oe]);
          continue;
        }
      }
      hits.push({ s: os, e: oe, text: orig, tag, exempt: false });
      copy(last, s);
      for (let i = 0; i < tag.length; i++) { next += tag[i]; nextMap.push(-1); }
      last = e;
    }
    copy(last, cur.length);
    cur = next;
    map = nextMap;
  }
  return { text: cur, map, hits };
}

/** The export mask with its own accounting: the table's claims (adjacent duplicates
 *  merged), then the frozen structured floor over the result, every placement recorded
 *  at its original offsets. The `text` is what ships; everything else is what the
 *  screens may say about it — and none of it is shown unless `divergence` is null. */
export function remask(text: string, entities: Entity[], practice: Practice = loadPractice()): Remask {
  const exempt = new Set(entities.filter((e) => isFloorRow(e) && e.dead).map((e) => floorKey(e.text)));
  const all = placements(text, entities, floorCuts(text, practice, exempt));
  // THE WHOLE-MATCH RULE. A claim standing strictly inside a match of the safety-net pattern is
  // not placed: the pattern masks the whole match instead, with its own tag. With the domain
  // "kestrelcapital" declared before the drop, "Write to j.doe@kestrelcapital.com" exported as
  // "j.doe@[Protected2].com" — the claim broke the address, the email rule no longer matched,
  // and the mailbox stayed readable — while not declaring it gave "[email]" (2026-09-23).
  // Declaring a term must never mask less than not declaring it. The pattern's tag, not the
  // term's, because that is the export the document gets with the term undeclared, byte for
  // byte; because the whole match then becomes a safety-net row, which the name key reverses
  // in its safety-net section; and because "[email]@[Protected2]…" would print the address's
  // shape around a tag. A claim that IS the whole match keeps its own tag (a declared number
  // standing alone is [ProtectedN], the owner's ruling of 2026-09-23), and one inside a match
  // the lawyer left readable is placed, so the term stays masked inside the readable address.
  // A claim that STRADDLES a match — part inside it, part outside — is the same case at the
  // match's edge: placed whole it broke the match, and a declared "6123 4567 ext 12" exported
  // "Tel +65 [Protected1] for the desk", the country code readable, where not declaring it gave
  // "Tel [phone] ext 12" (2026-09-23). The match is left to the pattern, whole, and the claim's
  // words outside it are placed under the claim's own tag: "Tel [phone] [Protected1] for the
  // desk". A claim that holds a whole match is placed as it is, as one that is the match is.
  // Each claim set aside must end up inside a match the pattern masks in the run itself —
  // another claim can change what the pattern sees — and one that does not is placed again,
  // whole, its pieces withdrawn.
  const original = all.length ? floorOfOriginal(text, practice, exempt).filter((h) => h.s >= 0) : [];
  const floor = original.filter((h) => !h.exempt).sort((a, b) => a.s - b.s);
  const aside = new Map<Claim, { cores: Array<{ s: number; e: number }>; pieces: Claim[] }>();
  if (floor.length) {
    for (const c of all) {
      if (within(floor, c, true)) { aside.set(c, { cores: [c], pieces: [] }); continue; }
      const cross = floor.filter((h) => h.s < c.e && h.e > c.s && !(c.s <= h.s && h.e <= c.e));
      if (!cross.length) continue;
      const pieces: Claim[] = [];
      let p = c.s;
      const piece = (s: number, e: number) => { const t = trimmed(text, s, e); if (t) pieces.push({ ...c, s: t[0], e: t[1] }); };
      for (const h of cross) { if (h.s > p) piece(p, h.s); p = Math.max(p, h.e); }
      if (p < c.e) piece(p, c.e);
      aside.set(c, { cores: cross.map((h) => ({ s: Math.max(h.s, c.s), e: Math.min(h.e, c.e) })), pieces });
    }
  }
  let r: Remask;
  let claims: Claim[];
  for (;;) {
    claims = aside.size ? all.flatMap((c) => aside.get(c)?.pieces ?? [c]) : all;
    r = maskClaims(text, claims, exempt, practice);
    if (r.divergence || !aside.size) break;
    const masked = r.floorHits.filter((h) => !h.exempt).sort((a, b) => a.s - b.s);
    const lost = [...aside].filter(([, a]) => a.cores.some((k) => !within(masked, k, false)));
    if (!lost.length) break;
    for (const [c] of lost) aside.delete(c);
  }
  // A match the lawyer left readable, with a claim inside it: the claim is placed, which breaks
  // the pattern's match in the run, so the run records no hit there — and syncFloorRows then
  // took the lawyer's row away as a match the pattern no longer makes, and with the row gone
  // the address was masked whole again, over the choice (measured building this rule). It is
  // recorded as the exemption it is, at its original offsets, and counts nowhere a tag is.
  if (!r.divergence) {
    const open = original.filter((h) => h.exempt && r.placements.some((p) => h.s <= p.s && p.e <= h.e) && !r.floorHits.some((x) => x.s === h.s && x.e === h.e));
    if (open.length) r = { ...r, floorHits: [...r.floorHits, ...open] };
    r = { ...r, claims };
  }
  return r;
}

/** does one of `hits` (sorted by start, disjoint) hold [c.s, c.e) — `strictly`: and more than it */
function within(hits: Array<{ s: number; e: number }>, c: { s: number; e: number }, strictly: boolean): boolean {
  let lo = 0, hi = hits.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (hits[mid].s <= c.s) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  const h = at >= 0 ? hits[at] : null;
  return !!h && c.e <= h.e && (!strictly || h.s < c.s || c.e < h.e);
}

/** remask's run for one set of claims: the placement merge, the check against the frozen core,
 *  the safety-net pass that ships, and the practice table's */
function maskClaims(text: string, claims: Placement[], exempt: Set<string>, practice: Practice): Remask {
  // 1. the claims, merging adjacent identical tags as we go. Adjacent identical tags are ONE
  //    name the engine found in pieces — "Lim Bo Seng" caught as "Lim" + "Bo Seng" must
  //    export as [Person1], not "[Person1] [Person1]". Only whitespace may separate them
  //    and the tag must be identical, so two different people never merge. map[i] is the
  //    original offset of out[i], or -1 inside a tag.
  let out = '';
  const map: number[] = [];
  const emitted: Placement[] = [];
  let collapsed = 0;
  let pos = 0;
  const push = (s: string, at: number) => { for (let i = 0; i < s.length; i++) map.push(at < 0 ? -1 : at + i); out += s; };
  for (let k = 0; k < claims.length; k++) {
    const c = claims[k];
    const gap = text.slice(pos, c.s);
    // `pos` is where the previous claim ended, merged or not, so `gap` is exactly the text
    // between claim k-1 and claim k; a merged run keeps growing while each next claim is
    // the same tag across whitespace — a run of three is one placement, as the regex
    // reaches by folding pairs pass after pass.
    const prev = emitted[emitted.length - 1];
    const after = claims[k + 1]?.s === c.e ? '[' : (text[c.e] ?? '');
    if (prev && prev.tag === c.tag && COLLAPSIBLE.test(c.tag) && /^[ \t]+$/.test(gap) && !/\w/.test(after)) {
      collapsed++;
      prev.e = c.e; // the placement now spans the whole run, whitespace included
      pos = c.e;
      continue;
    }
    push(gap, pos);
    push(c.tag, -1);
    emitted.push({ s: c.s, e: c.e, tag: c.tag });
    pos = c.e;
  }
  push(text.slice(pos), pos);

  // 2. the frozen core's own answer, and the check against it. The reference run uses
  //    the SAME placement loop and the same rules with nothing on top; it must equal
  //    collapseAdjacentTags + floorMask exactly, or nothing here can be trusted.
  let joined = '';
  let jpos = 0;
  for (const c of claims) { joined += text.slice(jpos, c.s) + c.tag; jpos = c.e; }
  joined += text.slice(jpos);
  const coreText = maskWithTable(collapseAdjacentTags(joined), []);
  const held = (why: string): Remask => ({ text: coreText, placements: [], collapsed: 0, floorHits: [], divergence: why, practice });
  if (out !== collapseAdjacentTags(joined)) return held('the placement merge did not reproduce collapseAdjacentTags');
  const ref = applyFloor(out, map, text, { reference: true });
  if (ref.text !== coreText) return held('the floor pass did not reproduce lib-core floorMask');

  // 3. the pass that ships: identical match set, exemptions honoured, the two repairs.
  const app = applyFloor(out, map, text, { reference: false, exempt });

  // 4. the practice table (lib/floorTables.mjs), the same pass over the frozen floor's
  //    output — the frozen bytes are never widened, only what they left readable is read
  //    again. No frozen twin exists for this table, so the shipping run is held against
  //    its own reference run instead.
  const rules = (JURISDICTION_RULES as Record<string, FloorRule[]>)[practice] ?? [];
  if (!rules.length) return { text: app.text, placements: emitted, collapsed, floorHits: app.hits, divergence: null, practice };
  const jRef = applyFloor(app.text, app.map, text, { reference: true }, rules);
  const jApp = applyFloor(app.text, app.map, text, { reference: false, exempt }, rules);
  if (!sameMatchSet(jRef.hits, jApp.hits)) return held(`the ${practiceLabel(practice)} table's pass did not match its own reference run`);
  return { text: jApp.text, placements: emitted, collapsed, floorHits: [...app.hits, ...jApp.hits], divergence: null, practice };
}

/** Keep the table's floor rows in step with what the floor actually does to THIS table's
 *  output: one row per distinct matched text (tag, occurrence count), added when the
 *  floor starts firing on a text and removed when it stops (a kept row now covers it).
 *  A dead floor row survives as long as its pattern still matches — it IS the exemption.
 *  Returns the same array when nothing changed. Call after every table mutation. */
export function syncFloorRows(text: string, entities: Entity[], practice: Practice = loadPractice()): Entity[] {
  const r = remask(text, entities, practice);
  if (r.divergence) return entities; // nothing can be counted; the export screen holds the file
  const want = new Map<string, { text: string; tag: string; occ: number }>();
  for (const h of r.floorHits) {
    const k = floorKey(h.text);
    const w = want.get(k);
    if (w) w.occ++;
    else want.set(k, { text: h.text.trim(), tag: h.tag, occ: 1 });
  }
  let changed = false;
  const next: Entity[] = [];
  const seen = new Set<string>();
  for (const e of entities) {
    if (!isFloorRow(e)) { next.push(e); continue; }
    const w = want.get(floorKey(e.text));
    if (!w) { changed = true; continue; }
    seen.add(floorKey(e.text));
    if (e.occ !== w.occ || e.tag !== w.tag) { changed = true; next.push({ ...e, occ: w.occ, tag: w.tag }); }
    else next.push(e);
  }
  for (const [k, w] of want) {
    if (seen.has(k)) continue;
    changed = true;
    next.push({ key: 'floor:' + k, text: w.text, tag: w.tag, cat: FLOOR_CAT[w.tag] ?? 'id', prov: 'pattern', occ: w.occ, status: 'confirmed', cls: FLOOR_CLS[w.tag] ?? 'ID', src: FLOOR_SRC });
  }
  return changed ? next : entities;
}

/** "[Person1] [Person1] [Person1]" → "[Person1]" (whitespace-separated, same tag only) */
export function collapseAdjacentTags(text: string): string {
  const re = /(\[[A-Za-z]+-?\d+\])([ \t]+)\1(?![\w])/g;
  let out = text;
  for (let i = 0; i < 8; i++) {
    const next = out.replace(re, '$1');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** How many times `short` still stands ALONE — not swallowed by a `long` match.
 *  Extending a redaction must never silently unmask the short form elsewhere.
 *
 *  `tolerant`: both are protected rows, placed with protectedRegex, and are counted with it.
 *  Counted with the footprint, a protected "O’Brien" widened to "O’Brien Kessler LLP" found no
 *  lone occurrence — the lone one was written "O'Brien" — so the widen dropped the short row and
 *  the export was held on a term with no row (2026-09-23). A caller passes it for a protected
 *  row — Review's drag-to-extend did not yet on that date — and the default keeps every other
 *  row on the footprint it is placed with. */
export function occurrencesOutside(text: string, short: string, long: string, tolerant = false): number {
  // counted where the row is placed: also where the safety-net pattern cuts it free of a number
  // glued to it (protectedSpans, footprintSpans)
  const cuts = floorCuts(text, loadPractice(), NO_EXEMPT);
  const match = (s: string): Array<[number, number]> => (tolerant ? protectedSpans(text, s, cuts) : footprintSpans(text, s, cuts));
  let ranges: Array<[number, number]>;
  try { ranges = match(long); } catch { return spanMatches(text, short); }
  let n = 0;
  try {
    for (const [s, e] of match(short)) if (!ranges.some(([a, b]) => s >= a && e <= b)) n++;
  } catch { return 0; }
  return n;
}

/** word-bounded containment: is `short` a whole-word part of `long`? */
export function wordContains(long: string, short: string): boolean {
  if (!short || short.length >= long.length) return false;
  try { return footprintRegex(short).test(long); } catch { return false; }
}

export interface PlacedPart { t: string; start: number; end: number; e?: Entity; g?: { text: string; verdict: string; occ: number } }

/** Offset-annotated split of the document for the review panes: the SAME
 *  longest-first, non-overlapping claiming the export mask uses, so what the
 *  lawyer sees highlighted is what actually gets replaced — and every part
 *  knows where it sits in the text, which is what makes a span draggable. */
export function placeSpans(text: string, entities: Entity[], ghosts: Array<{ text: string; verdict: string; occ: number }> = []): PlacedPart[] {
  type Claim = { s: number; e: number; ent?: Entity; g?: { text: string; verdict: string; occ: number } };
  const claims: Claim[] = [];
  const live = entities.filter((e) => e.text);
  const cands: Array<{ span: string; ent?: Entity; g?: { text: string; verdict: string; occ: number } }> = [
    ...live.map((e) => ({ span: e.text, ent: e })),
    ...ghosts.map((g) => ({ span: g.text, g })),
  ].sort((a, b) => b.span.length - a.span.length);
  const cuts = floorCuts(text, loadPractice(), new Set(entities.filter((e) => isFloorRow(e) && e.dead).map((e) => floorKey(e.text))));
  for (const c of cands) {
    let found: Array<[number, number]>;
    // the same match the export uses for the row (placements), so a curly-apostrophe
    // "O’Brien" the export masks is also the one the review highlights, and so is a "Tan" —
    // declared or found by the engine — the safety-net pattern cuts free of the number glued to it
    try {
      found = c.ent?.cat === 'protected' ? protectedSpans(text, c.span, cuts) : footprintSpans(text, c.span, c.ent ? cuts : undefined);
    } catch { continue; }
    // A shorter row's words outside a longer one's match are not parts here, though the export
    // masks them (placements, THE OVERLAP RULE): a part here is a drag handle for its row, and
    // a piece dragged from its own start would widen the row from the middle of it. The pane
    // draws them as pieces with no handles, read off the export's own claims (review.ts
    // withMaskedPieces), so the highlight shows every stretch the copy masks.
    for (const [s, e] of found) {
      if (claims.some((k) => s < k.e && e > k.s)) continue;
      claims.push({ s, e, ent: c.ent, g: c.g });
    }
  }
  claims.sort((a, b) => a.s - b.s);
  const parts: PlacedPart[] = [];
  let pos = 0;
  for (const k of claims) {
    if (k.s > pos) parts.push({ t: text.slice(pos, k.s), start: pos, end: k.s });
    parts.push({ t: text.slice(k.s, k.e), start: k.s, end: k.e, e: k.ent, g: k.g });
    pos = k.e;
  }
  if (pos < text.length) parts.push({ t: text.slice(pos), start: pos, end: text.length });
  return parts;
}

/** the TRUE number of tags the export places — table claims after the adjacent
 *  merge PLUS the floor's non-exempt replacements, never summed from per-row
 *  estimates. Zero under a divergence, because nothing can be counted then. */
export function maskedCount(text: string, entities: Entity[], practice: Practice = loadPractice()): number {
  const r = remask(text, entities, practice);
  return r.divergence ? 0 : r.placements.length + r.floorHits.filter((h) => !h.exempt).length;
}

/** A word of a kept name that names no one by itself: a designator, a title, a particle, a
 *  generic word of an address. The two- and three-letter entries are there because a short
 *  piece is asked since owner ruling 21 (FRAGMENT_SHORT, below); without them "Mr" of a row "Mr
 *  Porter" and "Co" of "Ford Motor Co" were counted wherever a title or a company was named. */
const FRAGMENT_STOP = new Set(['the', 'and', 'for', 'ltd', 'inc', 'llc', 'corp', 'corporation', 'company', 'group', 'holdings', 'pte', 'limited', 'bank', 'road', 'street', 'place', 'avenue',
  'mr', 'mrs', 'ms', 'dr', 'jr', 'sr', 'st', 'co', 'lp', 'llp', 'plc', 'sa', 'sc', 'ag', 'nv', 'bv', 'pc', 'pa', 'na', 'us', 'uk', 'usa', 'esq', 'hon', 'ii', 'iii', 'iv', 'of']);
/** Under this many letters a piece is asked only as a proper name is written: its first letter
 *  upper-case in the row and where it stands in the export. Never asked until owner ruling 21,
 *  so "Mr Tan replied." beside a kept "Margaret Tan" and "Mr Lee" beside a kept "David Lee" went
 *  out beside "no fragments of listed names survive" (F6-FLOOR4). Read in any case, "Tan" is the
 *  "tan" of a colour and "Lee" of "lee side"; with the capital, a sentence's first word ("Tan
 *  leather was …") is still counted, which only over-flags. */
const FRAGMENT_SHORT = 4;
/** From this many letters and up to RUN_FLOOR, a piece is also looked for run together inside a
 *  token that is not a word of prose (inTokenFinds, below) */
const FRAGMENT_IN_TOKEN = 4;

/** The pieces of kept names the export still carries, each as the export writes it — the
 *  honest edge of verify-by-extraction, which vouches only for whole names: a surviving piece is
 *  flagged, never held (the receipt counts them, the Export screen and the Compare note name
 *  them). A piece is each word of a row or a declared term (`terms`) and, where a word is
 *  written with an apostrophe, a hyphen or a dot inside it, each part of it too: "O'Brien",
 *  "Mendez-Gutierrez" and "Hewlett-Packard" were one piece each until owner ruling 21, so "Ms
 *  O'Brien replied." (with the row's curly apostrophe or a straight one), "Mendez was
 *  removable" and '("Hewlett")' were exported beside a receipt saying no fragment survived
 *  (F2-COMPOUND).
 *
 *  Read as the .docx writer reads a name in text a reader sees (refFind 'text', imported so the
 *  two cannot drift): at the breaks a reader takes a word to stop at — a separator, letters
 *  meeting digits ("Kierkegaard12", a footnote's number; "KIERKEGAARD01"), a small letter
 *  meeting a capital ("KierkegaardLaw"), a Chinese, Japanese or Korean character
 *  ("Kierkegaardキルケゴール") — and a capitalised plural; with every letter folded as the writer
 *  folds it (NFKD and marks: "Munoz" is the row "Muñoz", "Griﬃths" the row "Griffiths", a
 *  fullwidth or a decomposed name the row as typed), an invisible character (a soft hyphen, a
 *  zero-width space, "&shy;") read as nothing, a percent-escape, a character reference and a
 *  mail gateway's rewriting (Proofpoint v2 and v3) read as what they write; and from RUN_FLOOR
 *  inside a token that is not a word of prose ("www.kierkegaardlaw.com", "@kierkegaardlaw",
 *  "#kierkegaardfamily", "KierkegaardFamilyTrust.pdf"). Read at the footprint's edges of the
 *  text as written until the first pass of owner ruling 21, and then with a letter-bounded
 *  pattern over the text and its escapes decoded, every one of those shapes went out uncounted
 *  (F3-FOLD, P1T-4). Never inside a plain word of letters: "supporter", "Porterfield" and
 *  "Kierkegaardian" are not the name, and the mask leaves them too (owner ruling 8).
 *
 *  Named as the export writes it (P1T-5): the lawyer searches the copy for what the ⚠ names,
 *  and a name written "M%C3%BCller" in a pasted link is not found by searching "Müller". A piece
 *  inside another's find is not named again ("Brien" inside "O'Brien"), and one written the same
 *  way twice, in any case, is named once. A piece of digits alone is looked for as before, at an
 *  edge with no letter or digit beside it, in the text as written and with its escapes decoded:
 *  a row's number is not a name, and refFind reads a row of digits under six only in a number
 *  grouped as the table writes it. The check only flags; over-flagging is the safe direction. */
export function survivingFragments(exported: string, kept: ReadonlyArray<Pick<Entity, 'text'>>, terms: readonly string[] = []): string[] {
  const letters = new Set<string>(), digits = new Set<string>(), short = new Set<string>(), inToken = new Set<string>();
  for (const text of [...kept.map((e) => e.text), ...terms]) {
    for (const tok of text.replace(REF_INVISIBLE, '').split(/\s+/)) {
      const core = tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}\p{M}]+$/gu, '');
      if (!core) continue;
      const parts = core.split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
      for (const p of parts.length > 1 ? [core, ...parts] : [core]) {
        const bare = p.replace(/[^\p{L}\p{N}]/gu, '');
        if (!bare || FRAGMENT_STOP.has(bare.toLowerCase())) continue;
        if (!/\p{L}/u.test(bare)) { if (bare.length >= 4) digits.add(bare); continue; }
        if (bare.length >= FRAGMENT_SHORT) {
          letters.add(p);
          if (bare.length >= FRAGMENT_IN_TOKEN && bare.length < RUN_FLOOR && /^\p{L}+$/u.test(bare)) inToken.add(p);
        } else if (/^\p{Lu}\p{L}{1,2}$/u.test(bare)) { letters.add(p); short.add(p); }
      }
    }
  }
  const finds: Array<{ s: number; e: number; w: string; n: string }> = [];
  if (letters.size) {
    for (const f of refFind(exported.split(TAG_BLANK).join(WALL), runNames([...letters]), 'text')) {
      const w = exported.slice(f.s, f.e);
      // a short piece where the export writes it as a proper name is written (an escape is read
      // as what it writes, and counted)
      if (short.has(f.name) && !/^[\p{Lu}%&]/u.test(w)) continue;
      finds.push({ s: f.s, e: f.e, w, n: f.name });
    }
    // a token that carries the piece where refFind found it too is named as refFind read it,
    // as written ("S%C3%B8ren" in "/clients/S%C3%B8ren/memo", not the row's "Søren")
    if (inToken.size) finds.push(...inTokenFinds(exported, [...inToken]).filter((t) => !finds.some((f) => f.n === t.n && t.s <= f.s && f.e <= t.e)));
    // and each piece from FRAGMENT_SHORT letters as the first pass read it, letter-bounded, in
    // the text as written: refFind reads an escape as what it writes, so "Kierkegaard%61" is the
    // plain word "Kierkegaarda" to it, while the copy shows the surname with a % after it
    // (counted by the first pass, lost by refFind alone: P1T-7's as-written view). A modifier
    // letter that is a superscript or subscript letter ("Kierkegaardᵃ", a note mark) is read as
    // the mark it is, not as a letter of the word (F4-SUP-LETTER, where the text carries one).
    const view = exported.replace(/\p{Lm}/gu, (ch) => (ch.normalize('NFKD') !== ch ? ' '.repeat(ch.length) : ch));
    for (const p of letters) {
      if (short.has(p)) continue;
      const bare = p.replace(/[^\p{L}\p{N}]/gu, '');
      for (const m of view.matchAll(new RegExp(fragmentRegex(bare).source, 'giu'))) finds.push({ s: m.index!, e: m.index! + m[0].length, w: exported.slice(m.index!, m.index! + m[0].length), n: p });
    }
  }
  finds.sort((a, b) => a.s - b.s || b.e - a.e);
  const out: string[] = [];
  const said = new Set<string>();
  const name = (w: string) => { const k = w.toLowerCase(); if (!said.has(k)) { said.add(k); out.push(w); } };
  let reach = -1;
  for (const f of finds) {
    if (f.e <= reach) continue;
    reach = f.e;
    name(f.w);
  }
  if (digits.size) {
    const views = viewsOf(exported);
    for (const t of digits) { const re = fragmentRegex(t); if (views.some((v) => re.test(v))) name(t); }
  }
  return out;
}
/** The pieces of FRAGMENT_IN_TOKEN letters and more, under RUN_FLOOR, that stand run together
 *  inside a token that is not a word of prose (docxWrite nonProseToken, the writer's own reading
 *  of a token): "tanyalaw.com", "#hansfamily", "wong_2024.pdf". refFind reads a name inside such a
 *  token only from RUN_FLOOR, as the mask does, since a false mask there tells the model
 *  something false; a flag is a note to the lawyer, and over-flagging is the safe direction.
 *  Compared as refFind compares (refCompact: folded, escapes decoded); named by the piece's own
 *  spelling, since what stands around it in the token is not the name. */
function inTokenFinds(exported: string, pieces: string[]): Array<{ s: number; e: number; w: string; n: string }> {
  const out: Array<{ s: number; e: number; w: string; n: string }> = [];
  const want = pieces.map((p) => ({ p, c: refCompact(p).c }));
  for (const m of exported.matchAll(/[^\s\u0000]+/gu)) {
    const tok = m[0];
    if (!/[\d./\\:@_#%&]/u.test(tok) || !nonProseToken(tok)) continue;
    const c = refCompact(tok).c;
    for (const { p, c: pc } of want) {
      if (!c.includes(pc)) continue;
      // named as the copy writes it where the token carries the piece's letters plainly
      // ("tanyalaw.com" is named "tanya", P1T-5); where a fold, an escape or an invisible
      // character stands among them, by the row's spelling, since no stretch of the token is it
      const at = tok.toLowerCase().indexOf(p.toLowerCase());
      const w = at >= 0 && tok.slice(at, at + p.length).toLowerCase() === p.toLowerCase() ? tok.slice(at, at + p.length) : p;
      out.push({ s: m.index!, e: m.index! + tok.length, w, n: p });
    }
  }
  return out;
}
/** The export as written and, where it carries an escape, with each read as the character it
 *  writes (pctDecoded, owner ruling 21): "q=Dr.%20Kierkegaard" and "Kierkeg%61ard" in a link are
 *  the surname to anyone who follows the link, and to the model that reads it. */
function viewsOf(exported: string): string[] {
  const d = pctDecoded(exported);
  return d === exported ? [exported] : [exported, d];
}
/** A kept name's token where a reader takes it for a word: at an end that is a letter, wherever
 *  no further letter stands beside it; at an end that is a digit, where no letter or digit does,
 *  as spanSurvives reads it. Read at spanSurvives' edges throughout (lib-core footprintRegex), a
 *  digit or a superscript beside a surname hid it, and "Kierkegaard12" (a footnote's number),
 *  "Kierkegaard¹", "the 2024Kierkegaard memo", "Kierkegaard2024.pdf" and "KIERKEGAARD01" were
 *  exported beside a receipt saying no fragment of a listed name survived (F-FRAG, owner ruling
 *  21, 2026-09-24). The check only flags; `t` is letters and digits alone, so it is its own
 *  pattern. Asked since the second pass of ruling 21 of a piece of digits alone. */
function fragmentRegex(t: string): RegExp {
  const cs = [...t];
  const edge = (ch: string) => (/\p{L}/u.test(ch) ? '\\p{L}' : '\\p{L}\\p{N}');
  return new RegExp(`(?<![${edge(cs[0])}])${t}(?![${edge(cs[cs.length - 1])}])`, 'iu');
}
