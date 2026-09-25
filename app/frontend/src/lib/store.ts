// Queue + corridor state. Real files run the real extraction pipeline and then the
// real two-engine strip (App.stripInto); the sample NDA carries fixture entities so
// the corridor stays demoable with the engine off.
import { detectFormat, docxContentHold } from './extract/detect';
import { readText, wordCount } from './extract/text';
import { extractDocx, inMainFlow, flowText, type DocxResult } from './extract/docx';
import { extractPdf, type PdfResult } from './extract/pdf';
import type { NetWindow } from './netmeter';
import { docxMarks as readDocxMarks, type FinishRecord, type DocxMark } from './attest';
import { sideOf, type SideRead } from './side';

/** Queue states. 'ready' means THE ENGINE HAS FINISHED with this document — it ran
 *  and its table is the table, or it refused and the label says so. It has never
 *  meant "the extractor produced text", and saying so was the defect: a file whose
 *  text had been read but whose engine run had not started reported 'ready', drew a
 *  done-dot and a live Review button, and opened on an empty table — which is what a
 *  document the engine read and cleared looks like. 'queued' is that gap, named. */
export type QState = 'reading' | 'queued' | 'stripping' | 'ready' | 'held' | 'error';
export interface Entity {
  key: string; text: string; tag: string; cat: 'person' | 'org' | 'loc' | 'id' | 'contact' | 'detail' | 'protected' | 'term';
  prov: 'both passes' | 'one pass' | 'pattern' | 'second sweep' | 'added by you';
  occ: number; junk?: boolean; dead?: boolean;
  /** review verdict: engine-confident rows arrive 'confirmed'; shaky rows
   *  (boilerplate suspects, second-read finds) arrive 'pending' and the
   *  finish button stays locked until a human decides each one */
  status?: 'confirmed' | 'pending' | 'ignored';
  /** a human verdict landed on this row in the review: confirmed, left readable, re-classed,
   *  folded, unfolded, widened, or added by hand. `status: 'confirmed'` is NOT that — every
   *  row the engine is sure of arrives confirmed, and counting those as reviewed is how the
   *  screen came to say "42 of 42 reviewed" before anyone had read the document. Absent on
   *  every row the machine made; lib/review.ts counts it for the tally and the receipt. */
  decided?: true;
  /** engine-native class + mechanism, carried for the export mask */
  cls?: string; src?: string;
  /** docx only: where outside the body the engine's separate read of that text (lib/side.ts)
   *  found this name — "a header", "the footnotes", … — for the Review screen to say. Set at
   *  the strip and never read by a mask: the writer masks every part with the whole table. */
  found?: string[];
}
export interface QFile {
  id: string; name: string; badge: string; state: QState;
  sizeLabel: string; statusLabel: string;
  words?: number; meta?: string;
  kind?: 'text' | 'docx' | 'pdf' | 'sample';
  text?: string;
  docx?: DocxResult; pdf?: PdfResult;
  /** the original package bytes (docx only) — what the .docx writer rewrites in place.
   *  In memory for the queue's lifetime, never sent anywhere, never written back. */
  bytes?: Uint8Array;
  entities?: Entity[]; sample?: boolean;
  reason?: string;
  warnings?: string[];
  /** engine outcome (real files only): the release gate + its per-layer verdicts */
  masked?: string; engineComplete?: boolean; completeBy?: Record<string, boolean>;
  engineStats?: Record<string, unknown>;
  /** the network window MEASURED across this document's engine run (lib/netmeter);
   *  undefined = no engine run happened, and the receipt must say "not measured" */
  netRun?: NetWindow;
  /** live strip progress 0–100 (state === 'stripping') */
  stripPct?: number;
  /** model-cleared candidates awaiting human confirmation in review */
  suspects?: Array<{ text: string; verdict: string; occ: number }>;
  /** the human pressed finish on the review — the export gate; nothing real exports without
   *  it. It records that they read the document and its marks, NOT that they decided every
   *  row: how many they decided is Entity.decided, counted by lib/review.ts. Set only by
   *  lib/attest.ts finishFile, and taken off by recheckFinish when a later change leaves
   *  readable anything that was masked when they finished. */
  reviewed?: boolean;
  /** the export as it stood when the lawyer finished (lib/attest.ts) — what `reviewed`
   *  attests to. Present exactly while `reviewed` is. */
  finish?: FinishRecord;
  /** why the finish came off after the lawyer pressed it, in plain words, naming what would
   *  be readable. The Review screen shows it until they finish again, and every later write
   *  measures it again (lib/attest.ts recheckFinish), so it describes the table on screen. */
  reopened?: string;
  /** the change that took the finish off and the finish it took off — what `reopened` is
   *  measured against. A new object only when a finish comes off, so App can tell a new
   *  reopen from a note measured again. */
  reopen?: { cause: string; from: FinishRecord | null };
  /** docx only: every text the saved .docx carries, read once at the drop (lib/attest.ts
   *  docxMarks) — each flow as the writer hands it to the mask, and every text outside the
   *  flows (style, font and list names, field codes, the watermark) with what the writer does
   *  to each. null when the package could not be read for them: the finish record then cannot
   *  cover them and fails closed. */
  docxMarks?: DocxMark[] | null;
  /** docx only: the text the saved .docx carries outside its body — headers, footers,
   *  footnotes, endnotes, charts, SmartArt, a watermark — which the engine reads in a request
   *  of its own after the body (lib/side.ts), and what that read found only there. Listed from
   *  docxMarks at the drop; filled by the strip. */
  side?: SideRead;
}

/** A real file whose engine run has not finished — queued behind another document,
 *  or in flight. Its entity table is necessarily EMPTY, and an empty table is
 *  indistinguishable from "the engine read this and found nothing", so every road
 *  into review and export refuses it instead of showing it as clean. */
export const awaitingEngine = (f: QFile): boolean => f.state === 'queued' || f.state === 'stripping';

const ordinal = (n: number): string => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** Where a waiting file really sits in line, counted over the queue on screen.
 *  Computed at render and never stored: a stored position goes stale the moment
 *  another drop lands behind it. 0 when the file is not waiting. */
export function queuePosition(files: QFile[], id: string): number {
  let n = 0;
  for (const f of files) {
    if (f.state !== 'queued') continue;
    n++;
    if (f.id === id) return n;
  }
  return 0;
}

/** What a waiting queue row says. It has to carry the wait in words, because the
 *  row it replaced said "Read" — the same word a finished document says. */
export function queueNote(pos: number): string {
  return `Waiting — ${pos <= 1 ? 'next' : ordinal(pos)} in queue · not redacted yet`;
}

/** The plain-words answer to "why can't I open this one yet?", for every route
 *  that refuses a file the engine has not finished. A blocked action states where
 *  the file is; it never just fails to respond. */
export function notRunYetNote(files: QFile[], f: QFile): string {
  if (f.state === 'stripping') return `${f.name} is being redacted right now — the review opens when the engine finishes.`;
  const pos = queuePosition(files, f.id);
  return `${f.name} has not been redacted yet — it is ${pos <= 1 ? 'next in line' : `${ordinal(pos)} in the queue`}. Nothing is marked on it until the engine has read it.`;
}

/** Work that closing the window would throw away. This used to count entity rows
 *  only, so a close during a multi-file run — the longest and most losable work in
 *  the app, and the one nothing on disk can recover — passed without a word. */
export function hasUnsavedWork(files: QFile[]): boolean {
  return files.some((f) => !f.sample && (awaitingEngine(f) || (f.entities !== undefined && f.entities.length > 0)));
}

let nextId = 1;
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

export async function ingestFile(file: File): Promise<QFile> {
  const id = String(nextId++);
  const base: QFile = { id, name: file.name, badge: (file.name.split('.').pop() || 'file').toUpperCase().slice(0, 4), state: 'reading', sizeLabel: kb(file.size), statusLabel: 'Reading…' };
  // Everything — including the read itself — inside the try: a locked, deleted, or
  // cloud-placeholder file must land as a visible error row, never a rejection.
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const route = detectFormat(buf, file.name);
    if (route.route === 'refuse') {
      return { ...base, state: 'held', statusLabel: 'Held', reason: route.reason };
    }
    if (route.route === 'text') {
      const t = readText(buf);
      const bad = (t.text.match(/�/g) || []).length;
      if (t.text.length && bad / t.text.length > 0.05) {
        return { ...base, state: 'held', statusLabel: 'Held', reason: 'Held — text is not valid UTF-8/UTF-16 (unreadable encoding); re-save it as UTF-8 and drop it again.' };
      }
      const warnings = bad > 0 ? [`${bad} character(s) could not be decoded (�) — if names carry accents, re-save the file as UTF-8.`] : [];
      const words = wordCount(t.text);
      if (words === 0) {
        return { ...base, kind: 'text', state: 'held', statusLabel: 'Held', reason: 'Held — the file has no readable text; there is nothing to redact.' };
      }
      // entities:[] until the strip lands (App.stripInto fills it); if the engine
      // is offline it stays empty and select-to-redact populates it manually.
      // The row leaves here 'queued', not 'ready': reading a file is not redacting
      // it, and the only honest thing a row can say before the engine has run is
      // that it is waiting.
      return { ...base, kind: 'text', state: 'queued', words, text: t.text, entities: [], warnings, meta: `${words.toLocaleString()} words · ${base.sizeLabel}`, statusLabel: warnings.length ? 'Waiting for the engine — read with warnings' : 'Waiting for the engine' };
    }
    if (route.route === 'docx-walker') {
      const d = await extractDocx(buf);
      if (d.inventory.scanned.length === 0) {
        return { ...base, kind: 'docx', state: 'held', docx: d, statusLabel: 'Held', reason: 'Held — no readable document parts inside (not a Word document?). Open it in Word, save it as a Word Document (.docx) and drop that copy.' };
      }
      if (d.inventory.invalid.includes('word/document.xml')) {
        return { ...base, kind: 'docx', state: 'held', docx: d, statusLabel: 'Held', reason: 'Held — the main document part is malformed and could not be read. Open it in Word, save it again as a Word Document (.docx) and drop that copy.' };
      }
      // The main flow, by the walker's own predicate (extract/docx.ts inMainFlow): body-part
      // runs that are not tracked deletions. Text in headers, footers, footnotes, endnotes
      // and the glossary stays out of it even when it sits inside a tracked insertion. The
      // engine reads the headers, footers, footnotes, endnotes, charts and SmartArt in a
      // request of their own, listed below from what the saved file carries (lib/side.ts
      // sideOf); the glossary is removed from the saved file and read by no engine.
      // flowText is the ONE definition of how runs become text: runs of a paragraph
      // concatenate as they stand (Word splits words across runs), paragraphs are lines.
      // Until the real-document trial (2026-09-13) this joined runs with a space, which
      // put "Marg aret" in front of the engine and erased every paragraph boundary.
      const bodyText = flowText(d.items.filter(inMainFlow));
      // The .txt lane refuses encoded content at detectFormat; a Word file reaches it only here,
      // after the walk. Without this call a base64 attachment pasted into a memo went to the
      // engine and into both exports readable to any model that decodes it (measured 2026-09-23:
      // the same block held in a .txt, queued in a .docx body).
      const encoded = docxContentHold(d.items);
      if (encoded) return { ...base, kind: 'docx', state: 'held', docx: d, statusLabel: 'Held', reason: encoded.reason };
      const words = wordCount(bodyText);
      const parts = d.inventory.scanned.length;
      // read here because the package is compressed and finishing is synchronous; a failure
      // costs this file its finish on the first change after it, never the drop
      let docxMarks: QFile['docxMarks'];
      try { docxMarks = await readDocxMarks(buf); } catch { docxMarks = null; }
      return { ...base, kind: 'docx', state: 'queued', words, text: bodyText, docx: d, docxMarks, side: sideOf(docxMarks, d.items), bytes: buf, entities: [], warnings: d.warnings, meta: `${words.toLocaleString()} words · ${parts} parts`, statusLabel: d.complete ? 'Waiting for the engine' : 'Waiting for the engine — read with warnings' };
    }
    // pdf
    const p = await extractPdf(buf);
    const okPages = p.pages.filter((x) => x.status === 'ok');
    const words = okPages.reduce((a, x) => a + x.words, 0);
    if (okPages.length === 0) {
      return { ...base, kind: 'pdf', state: 'held', pdf: p, statusLabel: 'Held', reason: pdfHeldReason(p) };
    }
    return { ...base, kind: 'pdf', state: 'queued', words, pdf: p, text: pdfText(p), entities: [], warnings: p.warnings, meta: `${words.toLocaleString()} words · ${p.pages.length} pages${p.pages.length - okPages.length ? ` · ${p.pages.length - okPages.length} refused` : ''}`, statusLabel: p.complete ? 'Waiting for the engine' : 'Waiting for the engine — read with warnings' };
  } catch (e: any) {
    return { ...base, state: 'error', statusLabel: 'Held', reason: unreadableReason(e) };
  }
}

/** A file no reader could open (a broken zip, a PDF with no structure). The reader's own words say
 *  what failed; the way through is a fresh copy from the program that made the file. */
export const unreadableReason = (e: unknown): string =>
  `Couldn’t read this file (${String((e as { message?: string } | null)?.message || e).replace(/\.$/, '')}). Open it in the program that made it, save a new copy and drop that.`;

/** Why a PDF none of whose pages could be read is held, from the pages' own refusals. A page
 *  refused for an encoded block has text, and says which block to delete: held as "no readable
 *  text", a one-page PDF carrying a base64 attachment sent the lawyer to re-OCR a file that
 *  needed one block taken out, and History printed the same false reason. A scan stamped by an
 *  e-filing system has a few words in its margin and no text layer, so it is held as the scan
 *  it is, whichever page the scan is on. A PDF refused for more than one cause, or with more
 *  than one block, names every page and its way through: named by its first cause alone, an
 *  exhibit with a base64 block on page 1 and a scan on page 2 sent the lawyer to delete the
 *  block and drop it again, to be held a second time, or let through with page 2 cut from the
 *  text, for a cause the first hold never mentioned (2026-09-24). A blank page is named only
 *  when nothing else is, since it needs no fix. test/drop-holds.mjs drives each through
 *  ingestFile. */
const BLOCK_WAY = 'delete that block from the source and export the PDF again';
function pdfHeldReason(p: PdfResult): string {
  const enc = p.pages.filter((x) => /^refused: (?:an email’s headers|an encoded certificate|encoded content)/.test(x.status));
  const scans = p.pages.filter((x) => /image-only|a scan with an e-filing stamp/.test(x.status));
  const garbled = p.pages.filter((x) => /garbled extraction/.test(x.status));
  const kinds = [enc, scans, garbled].filter((k) => k.length).length;
  if (kinds === 0) return 'Held — no readable text: no page of this PDF carries text or a scanned image. If the document it was made from has words in it, drop that instead.';
  if (kinds === 1 && enc.length === 1) return `Held — page ${enc[0].page} holds ${enc[0].status.replace(/^refused: /, '').replace(' — the page is left out; ', ' — ')}`;
  if (kinds === 1 && scans.length) return 'Held — scanned pages need OCR: this app reads the text a PDF carries, and a scan carries none. Run OCR on it (in Acrobat, Scan & OCR) and drop the copy that saves.';
  if (kinds === 1 && garbled.length) return 'Held — the text in this PDF does not decode: its fonts map to the wrong characters. Drop the document it was made from (the .docx or the text) instead.';
  const on = (ps: typeof p.pages) => (ps.length === 1 ? `page ${ps[0].page}` : `pages ${ps.slice(0, -1).map((x) => x.page).join(', ')} and ${ps[ps.length - 1].page}`);
  const causes: string[] = [];
  // Each encoded page keeps the way through its own refusal gives (pdf.ts): a link's value and
  // letters written as "%" escapes are not a block, and "delete that block" over either sent the
  // lawyer looking for a block the page does not have. Pages whose way is to delete a block
  // share one clause, as they always have.
  const says = (x: (typeof enc)[number]) => `page ${x.page} holds ${x.status.replace(/^refused: /, '').replace(/ — the page is left out; .*$/, '')}`;
  const wayOf = (x: (typeof enc)[number]) => / — the page is left out; (.*?)(?: to include it)?$/.exec(x.status)?.[1] ?? BLOCK_WAY;
  const blocks = enc.filter((x) => wayOf(x) === BLOCK_WAY);
  const own = enc.filter((x) => wayOf(x) !== BLOCK_WAY).map((x) => `${says(x)} — ${wayOf(x)}`);
  if (blocks.length) causes.push(`${blocks.map(says).join('; ')} — delete ${blocks.length === 1 ? 'that block' : 'those blocks'} from the source and export the PDF again`);
  causes.push(...own);
  if (scans.length) causes.push(`${on(scans)} ${scans.length === 1 ? 'is a scan' : 'are scans'} with no text layer — run OCR on ${scans.length === 1 ? 'it' : 'them'} (in Acrobat, Scan & OCR)`);
  if (garbled.length) causes.push(`the text on ${on(garbled)} does not decode: its fonts map to the wrong characters — drop the document it was made from (the .docx or the text) instead`);
  // a page whose fonts do not decode is fixed by dropping the source document instead of a
  // PDF, so "drop the copy that saves" is said only when every fix ends in a PDF
  return `Held — no page of this PDF can be read yet: ${causes.join('; ')}.${garbled.length ? '' : ' Then drop the copy that saves.'}`;
}

/** A page the intake refused stays in the copy as a line saying it is missing. Dropped silently,
 *  page 7 of an agreement vanished from the text a model reads, and neither the model nor the
 *  receipt could tell the operative clause was gone. */
export function pdfText(p: PdfResult): string {
  return p.pages.map((x) => (x.status === 'ok' ? x.text : `[page ${x.page} is not included: this app could not read it]`)).join('\n\n');
}

// Folder drop: walk entries recursively, skip hidden. One unreadable entry (cloud-only
// stub, deleted mid-drop, ACL-blocked subfolder) must cost only itself — siblings still
// land, and the failure is reported by name instead of vanishing the whole drop.
export interface DropResult { files: File[]; failures: string[] }
export async function filesFromDrop(dt: DataTransfer): Promise<DropResult> {
  const out: File[] = [];
  const failures: string[] = [];
  const entries: any[] = [];
  for (const item of Array.from(dt.items)) {
    const e = (item as any).webkitGetAsEntry?.();
    if (e) entries.push(e);
  }
  if (!entries.length) return { files: Array.from(dt.files), failures };
  async function walkEntry(entry: any): Promise<void> {
    if (entry.name.startsWith('.')) return;
    if (entry.isFile) {
      try {
        const f: File = await new Promise((res, rej) => entry.file(res, rej));
        out.push(f);
      } catch { failures.push(entry.name); }
    } else if (entry.isDirectory) {
      try {
        const reader = entry.createReader();
        let batch: any[];
        do {
          batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          for (const child of batch) await walkEntry(child);
        } while (batch.length);
      } catch { failures.push(entry.name + '/'); }
    }
  }
  for (const e of entries) await walkEntry(e);
  return { files: out, failures };
}

export const SAMPLE_TEXT = `JOINT VENTURE AGREEMENT

This Agreement is entered into by and between Hastings Holdings Ltd, a company incorporated in Singapore (UEN 199204512K), having its registered office at 80 Raffles Place, #32-01, and Intraco Corporation (together, the "Parties").

1. Representatives. Hastings appoints Lim Wei Sheng as its authorised representative, reachable at +65 6438 2210. Intraco appoints Margaret Tan, reachable at (415) 555-0173.

2. Notices. All notices to Lim Wei Sheng shall be copied to Margaret Tan. As agreed by wei sheng in the side letter, notice periods run from receipt.

3. Force Majeure. Neither Party shall be liable for any failure caused by events beyond its reasonable control, subject to Governing Law and notice within ten Business Days.`;

export function sampleFile(): QFile {
  // Fixture rows mirror what the real engine produces on this text — including
  // the SHORT-FORM rows ("Hastings", "Intraco") that ride their parent's tag.
  // occ is COMPUTED against the text below; a demo receipt must never lie.
  const rows: Array<Omit<Entity, 'occ'>> = [
    { key: 'lim', text: 'Lim Wei Sheng', tag: '[PERSON-1]', cat: 'person', prov: 'both passes' },
    { key: 'tan', text: 'Margaret Tan', tag: '[PERSON-2]', cat: 'person', prov: 'both passes' },
    { key: 'low', text: 'wei sheng', tag: '[PERSON-1]', cat: 'person', prov: 'second sweep' },
    { key: 'hastings', text: 'Hastings Holdings Ltd', tag: '[COMPANY-1]', cat: 'org', prov: 'both passes' },
    { key: 'hast-short', text: 'Hastings', tag: '[COMPANY-1]', cat: 'org', prov: 'second sweep' },
    { key: 'intraco', text: 'Intraco Corporation', tag: '[COMPANY-2]', cat: 'org', prov: 'both passes' },
    { key: 'intra-short', text: 'Intraco', tag: '[COMPANY-2]', cat: 'org', prov: 'second sweep' },
    { key: 'addr1', text: '80 Raffles Place, #32-01', tag: '[ADDRESS-1]', cat: 'loc', prov: 'one pass' },
    { key: 'uen', text: 'UEN 199204512K', tag: '[ID-1]', cat: 'id', prov: 'pattern' },
    { key: 'phone1', text: '+65 6438 2210', tag: '[PHONE-1]', cat: 'contact', prov: 'one pass' },
    { key: 'usphone', text: '(415) 555-0173', tag: '[PHONE-2]', cat: 'contact', prov: 'second sweep' },
    { key: 'junk1', text: 'Force Majeure', tag: '[TERM-3]', cat: 'term', prov: 'pattern', junk: true },
    { key: 'junk2', text: 'Governing Law', tag: '[TERM-4]', cat: 'term', prov: 'pattern', junk: true },
    { key: 'junk3', text: 'Business Days', tag: '[TERM-5]', cat: 'term', prov: 'pattern', junk: true },
  ];
  // shaky rows arrive pending; boilerplate suspects additionally arrive
  // UNMASKED (readability: "ten [TERM 5]" is a broken sentence, and legal
  // boilerplate leaks nothing) — identity pendings stay masked, fail-closed
  const entities: Entity[] = rows.map((r) => ({
    ...r,
    occ: sampleOcc(r.text),
    status: r.junk || r.prov === 'second sweep' ? 'pending' : 'confirmed',
    dead: r.junk ? true : undefined,
  }));
  const words = wordCount(SAMPLE_TEXT);
  return {
    id: String(nextId++), name: 'sample-nda.txt', badge: 'TXT', state: 'ready', kind: 'sample',
    sizeLabel: '2 KB', statusLabel: 'Sample — entities from the demo set',
    words, text: SAMPLE_TEXT, entities, sample: true,
    // the model-cleared tier, demoed: looked at, judged non-identifying — yours to confirm
    suspects: [{ text: 'Singapore', verdict: 'place', occ: sampleOcc('Singapore') }],
    meta: `${words.toLocaleString()} words · sample`,
  };
}

/** honest occurrence count for fixture rows (word-boundary, case-insensitive) */
function sampleOcc(span: string): number {
  const esc = span.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'giu');
  return Math.max(1, (SAMPLE_TEXT.match(re) || []).length);
}

