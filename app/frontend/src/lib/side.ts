// The text a .docx carries outside its body, and the engine's read of it (owner ruling 27,
// 2026-09-25).
//
// The engine used to read the body alone (store.ts sends it the main flow), and the .docx
// writer masked the headers, footers, footnotes, endnotes, charts and SmartArt with the body's
// table, the always-redact list and the safety-net pattern only. So a client named in the
// letterhead, a witness named in a footnote, or "Client-Matter: Tan / 12345.001" in a footer —
// named nowhere in the body and not on the list — shipped readable in the saved .docx, and the
// writer's gate, which re-walks the output with the same table, passed it (LAUNCH.md row 2.2).
//
// Now that text goes to the same engine in a SECOND request of its own. The body's request is
// unchanged, byte for byte (test/doctrine-profile.mjs law 5); the second request is used only
// to find names. What it finds is joined to the document in two ways (engine.ts joinSide):
//   · a name the body also carries joins the review table, as a row of the body, and is masked
//     in every export — the table still means "found in this document's body" (protected-terms
//     law 3), because it is in the body;
//   · a name only the other parts carry is kept apart, on `side.rows`, and never in the table.
//     The .docx writer masks with those rows too (engine.ts docxMaskTable), so they are masked
//     wherever the saved .docx carries them. The copied text and the .txt are the body alone,
//     so they carry none of them. The Review screen lists them, with where each was found.
//
// Fail closed: when the body was read by an engine and the other parts could not be, the saved
// .docx is held with the reason (engine.ts exportPlan `docxHeld`); the copied text and the .txt,
// which are the body alone, are not held on that ground. When no engine read the body either
// (the engine was offline, or its run failed), nothing is sent, and every surface says that no
// engine read those parts, as it said before.
//
// WHAT IS SENT is read off docxMarks (attest.ts), the texts the writer's own output carries, so
// the engine reads what the saved file would carry and nothing the writer removes:
//   · each flow the writer masks besides the body — every header (a first-page header, even and
//     odd headers, a later section's header: each is its own part), footer, the footnotes, the
//     endnotes, each chart and each SmartArt part, text boxes in them included — as its record;
//   · the texts the writer masks where they stand ('mask' read 'text'): a watermark, a
//     signature line's signer, e-mail and instructions, a form field's help, status-bar and
//     default text, a list's number text, a chart's trendline name and data-label separator,
//     a SmartArt layout's title and description;
//   · a chart's data column name (cx:lvl name), which the writer does not mask but holds the
//     file on when the table places in it.
// NOT sent:
//   · a chart's plotted numbers (its numeric cache): they are numbers, and the safety-net
//     pattern reads them;
//   · what the writer removes whatever the table says — comments, reviewers, tasks, the
//     glossary, document properties, custom XML, alt-text, hidden text, tracked deletions,
//     link targets and tooltips, content-control entries, document variables — none of it is
//     in docxMarks, because none of it is in the saved file;
//   · what the writer renames or holds on whatever it says, or reads as code — style, list,
//     theme and font names, bookmarks, field instructions, a number format's printed text, a
//     part's name, the file's markup. A name in those is masked by the table (the names the
//     engine found here included), renamed, or holds the file, as before.
// A text box in the body is body text already (docx.ts inBox), and was always read.
//
// HOW THE TEXTS ARE JOINED (SIDE_JOIN). The texts of different places go in one request, each
// once, with a line of four #s between them and a blank line either side. Until the second pass
// of 2026-09-25 they were joined by a blank line alone, and the frozen pipeline's rows are read
// off its alignment with the text sent (serve-legal.mjs rowsFromFinal over lib-legal/regions.mjs
// alignTags), which folds two tags into one region when fewer than four characters that are not
// white space stand between them. So a header ending "Partner: Rhiannon Blake" and the next
// header beginning "Brightline Holdings Ltd" came back as ONE row, "Rhiannon Blake\n\nBrightline
// Holdings Ltd", which placed in neither part's text: the second name shipped readable in the
// saved .docx under a gate that passed and a receipt that said it was masked (H-ATK-1, found
// with the frozen alignTags on five realistic pairs of parts: two headers, a header and a
// footer, two footers, an endnote and a chart's title). Four #s are
// four characters no region takes: alignTags folds across fewer than four, and takes a
// punctuation mark into a region only from its own list, which # is not on. The row that crosses
// the line anyway (a pipeline that masked the line itself) is cut at it by engine.ts joinSide.
// test/docx-parts.mjs law 85 runs the real alignTags and the real rowsFromFinal over it.
import type { DocxMark } from './attest';
import type { Entity } from './store';
import { CAT_LABEL, CAT_ORDER } from './categories';
import { foldFullwidth } from '../../../../lib-core/anonymize.mjs';

/** between the texts of two places in what an engine is sent (see HOW THE TEXTS ARE JOINED) */
export const SIDE_JOIN = '\n\n####\n\n';
/** that line, with the white space either side of it, where a row that crosses it is cut
 *  (engine.ts joinSide) */
export const SIDE_SEAM = /\s*####\s*/;

/** where docxMarks says the writer's body flow is — the one flow that is not sent here */
export const BODY_WHERE = 'the body of the saved .docx';

/** One text the saved .docx carries outside its body, where docxMarks names its place: "a
 *  header", "a footer", "the footnotes", "the endnotes", "a chart", "a diagram", "a
 *  watermark", "a signature line", "a list’s number text", … */
export interface SidePlace { where: string; part: string; text: string }

/** 'waiting' — read at the drop, not yet sent; 'none' — the saved .docx carries no such text;
 *  'read' — an engine read it and its finds are joined; 'unread' — it was not read although the
 *  body was, or could not be listed at the drop, and the saved .docx is held; 'not-run' — no
 *  engine read the body, so nothing was sent */
export type SideState = 'waiting' | 'none' | 'read' | 'unread' | 'not-run';

export interface SideRead {
  state: SideState;
  places: SidePlace[];
  /** what an engine is sent: each distinct text of `places` once, SIDE_JOIN between */
  text: string;
  /** 'unread' and 'not-run': why, in words that finish the sentence "… not read by an engine: " */
  why?: string;
  /** 'unread' after an engine DID read that text and the app could not use what it made of it
   *  (the frozen pipeline's output did not align with it): every surface says it was read and
   *  could not be used, never that no engine read it */
  ran?: boolean;
  /** 'unread': whether dropping the document again can change it — true for a failed request or
   *  an in-app core read that did not finish; false when the text could not be listed at the
   *  drop, or the frozen pipeline's read of it did not align, which a new drop repeats */
  again?: boolean;
  /** 'unread' after a failed request: the engine's own words, for the screen only — they can
   *  name a process and its path, so they never go on the receipt */
  detail?: string;
  /** 'read': the engine that read it (stats.engine of its run) and the genre it was routed as */
  engine?: string;
  genre?: string;
  /** the names found ONLY outside the body: never in the review table; the .docx writer masks
   *  with them. `found` on each says where. */
  rows: Entity[];
  /** 'read': how many names found here the body also carries, which joined the review table */
  joined?: number;
}

/** a chart's plotted value, as docxMarks writes it (docxWrite numericForm) */
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
/** A text with no letter and no digit once a list level's placeholders (%1–%9) are taken out —
 *  a list's "%1." or "(%2)", a bullet, a rule of dashes — can carry no name, number or address,
 *  and is not sent. Measured 2026-09-25 over the owner's 21 .docx (counts only): without this,
 *  16 of the 21 had text to send; in 8 of those it was a list's number text alone, 6 characters
 *  sent with no letter or digit in them once %1 was out, and each would have been a second
 *  engine request, and a .docx held whenever that request failed, for nothing an engine can
 *  find. With it, 8 of 21 have text to send. "Kestrel Schedule %1." has letters, and is sent
 *  (test/docx-parts.mjs law 84). */
const NOTHING_TO_FIND = (t: string): boolean => !/[\p{L}\p{N}]/u.test(t.replace(/%[1-9]/g, ''));
const fold = (s: string): string => foldFullwidth(s) as string;

/** why the parts outside the body were not listed at the drop (store.ts sets docxMarks null) */
export const MARKS_UNREAD = 'the texts the saved .docx carries outside its body could not be read when the document was dropped';

/** why they were not listed when docxMarks came back empty over a file that has them */
export const MARKS_HELD = 'the texts the saved .docx carries outside its body could not be listed, because the writer held the file when it was written to list them';
/** the parts whose text sideOf sends, by name (docx.ts RULES): a header, a footer, the notes, a
 *  chart, a chart's drawn text box, SmartArt */
const SIDE_PART = /^word\/(header\d+|footer\d+|footnotes|endnotes)\.xml$|^word\/(charts|diagrams|drawings)\//;

/** The text outside the body an engine is sent, read at the drop from docxMarks. `marks` null
 *  (the package could not be read for them) is held: nothing can say what the saved file would
 *  carry there. So is an empty list over a file whose walk (`items`) found text in such a part:
 *  docxMarks lists nothing when the writer holds the file it writes to list them (attest.ts), and
 *  "carries none of that text" would be said of a letterhead nobody read. */
export function sideOf(marks: DocxMark[] | null | undefined, items: ReadonlyArray<{ part: string; text: string }> = []): SideRead {
  if (!Array.isArray(marks)) return { state: 'unread', places: [], text: '', rows: [], why: MARKS_UNREAD, again: false };
  if (!marks.length && items.some((i) => SIDE_PART.test(i.part) && i.text.trim())) return { state: 'unread', places: [], text: '', rows: [], why: MARKS_HELD, again: false };
  const places: SidePlace[] = [];
  for (const m of marks) {
    if (m.read !== 'text' || NOTHING_TO_FIND(m.text)) continue;
    const sent = (m.kind === 'flow' && m.where !== BODY_WHERE && !(m.pieces === undefined && NUMBER.test(m.text.trim())))
      || m.kind === 'mask'
      || (m.kind === 'hold' && m.where === 'a chart');
    if (sent) places.push({ where: m.where, part: m.part, text: fold(m.text) });
  }
  const seen = new Set<string>();
  const texts: string[] = [];
  for (const p of places) if (!seen.has(p.text)) { seen.add(p.text); texts.push(p.text); }
  const text = texts.join(SIDE_JOIN);
  return { state: text.trim() ? 'waiting' : 'none', places, text, rows: [] };
}

/** A .docx whose body no engine read — the engine was offline, or its run failed (App.tsx
 *  stripInto): nothing is sent, and every surface says no engine read that text, as it says of
 *  the body, which is how such a .docx was saved before the engine read that text. Text that
 *  could not be listed at the drop is in the same place, since no engine read the body either,
 *  and is said the same way. */
export function sideNotRun(side: SideRead | undefined, why: string): SideRead | undefined {
  return side && (side.state === 'waiting' || side.state === 'unread') ? { ...side, state: 'not-run', why } : side;
}

/** the rows the .docx writer masks with besides the table — shared, so an unread file and a
 *  text file hand every caller the same empty array */
const NO_ROWS: Entity[] = [];
export const sideRowsOf = (f: { side?: SideRead }): Entity[] => f.side?.rows ?? NO_ROWS;

/** "a header, a footer and the footnotes" */
export function andList(words: string[]): string {
  const w = [...new Set(words)];
  return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : w[0] ?? '';
}

/** the places a side read covered, in words, each once, in the order the file carries them */
export const placesSaid = (side: SideRead): string => andList(side.places.map((p) => p.where));

/** the writer's channels (docx.ts RULES kinds) whose flows sideOf sends: what the save line may
 *  say the engine read, once the side read is 'read' */
export const SIDE_KINDS = ['header', 'footer', 'footnote', 'endnote', 'chart', 'diagram'];

/** what the parts are, said the same on the receipt and the page */
export const SIDE_PARTS = 'headers (with any watermark), footers, footnotes, endnotes, chart and SmartArt text';

/** Why the saved .docx is held on the side read, or null. Held while the body was read by an
 *  engine and the text outside it was not — or could not be listed — never when no engine read
 *  the body either (that document says so everywhere, and is not held on this ground). */
export function sideHeld(side: SideRead | undefined): string | null {
  if (!side) return null;
  if (side.state === 'waiting') return 'the text the saved .docx carries outside its body has not been sent to an engine, so the .docx is held; the copied text and the .txt are the body alone and are not held on this ground.';
  if (side.state !== 'unread') return null;
  const way = side.again
    ? 'Dropping the document again sends the body and that text to the engine again.'
    : 'Dropping the same file again is not expected to change this: the same file is read the same way.';
  const lead = side.ran
    ? 'the app could not use the engine’s read of the text the saved .docx carries outside its body'
    : 'the engine did not read the text the saved .docx carries outside its body';
  return `${lead}: ${side.why}. The .docx is held, because a name only that text carries would not be in its mask; the copied text and the .txt are the body alone and are not held on this ground. ${way}`;
}

/** The Review's bold words for an 'unread' side read: an engine that read the text and whose
 *  read could not be used is not said to have not read it (H-ATK-3) */
export const sideUnreadHead = (side: SideRead): string => (side.ran ? 'Outside the body read, but its read could not be used.' : 'Outside the body not read.');

/** "People 2, IDs & contact 1": the rows by the review table's own headings, in its order */
function byHeading(rows: Entity[]): string {
  const n = new Map<string, number>();
  for (const e of rows) { const h = CAT_LABEL[e.cat] ?? 'Other'; n.set(h, (n.get(h) ?? 0) + 1); }
  const rank = (h: string): number => { const i = CAT_ORDER.indexOf(h); return i < 0 ? CAT_ORDER.length : i; };
  return [...n.keys()].sort((a, b) => rank(a) - rank(b)).map((h) => `${h} ${n.get(h)}`).join(', ');
}

/** The clause the receipt's scope sentence and the page's twin carry for these parts, by what
 *  happened to them. `page`: the page's sentence (a sentence of its own, capitalised) rather
 *  than the receipt's clause inside a semicolon list. */
export function sideScope(side: SideRead | undefined, page: boolean): string {
  const lead = page ? 'Headers (with any watermark), footers, footnotes, endnotes, chart and SmartArt text stay in the file and are' : `${SIDE_PARTS} kept in the file and`;
  const read = page ? 'The engine read that text in a request of its own, apart from the body' : 'the engine read that text in a request of its own, apart from the body';
  if (side?.state === 'read') {
    return `${lead} masked with this table, the names the engine found only there, your always-redact list and the safety-net pattern${page ? '. ' : '; '}${read} (${side.text.length.toLocaleString('en-US')} characters, from ${placesSaid(side)})`;
  }
  if (side?.state === 'none') return `${lead} masked with this table, your always-redact list and the safety-net pattern (this document carries none of that text with a letter or a digit in it, so none was sent to an engine)`;
  if (side?.state === 'unread' && side.ran) return `${lead} masked with this table, your always-redact list and the safety-net pattern only, because the app could not use the engine’s read of them — so the .docx is held`;
  if (side?.state === 'unread' || side?.state === 'waiting') return `${lead} masked with this table, your always-redact list and the safety-net pattern only, because no engine read them — so the .docx is held`;
  return `${lead} masked with this table, your always-redact list and the safety-net pattern only, because no engine read them${side?.state === 'not-run' && side.why ? ` (${side.why})` : ''}`;
}

/** The receipt's line on these parts: counts and places, never a name — the receipt travels
 *  with the copy, and a name found only in the letterhead is not in the copy. Empty for a file
 *  that is not a .docx. */
export function sideReceipt(side: SideRead | undefined, bodyGenre?: unknown): string | null {
  if (!side) return null;
  if (side.state === 'none') return 'outside the body: the saved .docx carries no header, footer, footnote, endnote, chart, SmartArt or watermark text with a letter or a digit in it, so nothing there was sent to an engine';
  if (side.state === 'read') {
    // Counted as what they are, by the review table's headings: a footer's direct line and matter
    // reference are not names, and "it found 3 names" of one person, a telephone number and a
    // reference said otherwise (H-ATK-4). Nothing found is said as nothing, with no "masked with
    // them as well".
    const n = side.rows.length;
    const routed = side.genre && typeof bodyGenre === 'string' && bodyGenre && side.genre !== bodyGenre ? ` (the pipeline routed that text as ${side.genre}, the body as ${bodyGenre})` : '';
    const found = n
      ? `it found ${n} thing${n === 1 ? '' : 's'} to mask there that the app did not find in the body (${byHeading(side.rows)}), and the saved .docx is masked with ${n === 1 ? 'it' : 'them'} as well`
      : 'it found nothing to mask there that the app did not find in the body';
    return `outside the body: the engine read ${side.text.length.toLocaleString('en-US')} characters from ${placesSaid(side)} in a request of its own, apart from the body${routed}; ${found} — the copied text and the .txt are made from the body alone${side.joined ? `; ${side.joined} it found there that the body also carries joined the review table as rows of the body` : ''}`;
  }
  if (side.state === 'unread' && side.ran) return `outside the body: read by the engine, but the read could not be used — ${side.why}; the saved .docx is held`;
  if (side.state === 'unread' || side.state === 'waiting') return `outside the body: NOT read by an engine — ${side.why ?? 'not read yet'}; the saved .docx is held`;
  return `outside the body: not read by an engine${side.why ? ` — ${side.why}` : ''}; the saved .docx masks ${placesSaid(side) || 'those parts'} with this table, your always-redact list and the safety-net pattern only`;
}
