// PDF reader — browser port of app/extract/pdf.mjs. pdfjs-dist with local worker/cmaps/fonts
// (zero network), plus the project rails: scan/garble refusal, metadata sweep, annotation
// enumeration, prior-revision sniff, OCR-provenance flag.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { contentHold, type Hold } from './detect';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfPage { page: number; status: string; words: number; text: string }
export interface PdfResult {
  pages: PdfPage[];
  metaFinds: Array<{ key: string; value: string }>;
  annotations: Array<{ page: number; subtype: string; field?: string; value?: string }>;
  attachments: string[];
  warnings: string[];
  complete: boolean;
  summary: string;
}

// stamped-scan rail (port of app/extract/pdf.mjs, 2026-09-15): a page that is ONE IMAGE whose
// only text sits in the header/footer margins (a court's e-filing stamp, a Bates number) is
// refused. Measured miss 2026-09-14: a 19-page scanned complaint passed scan-detect 19/19 at
// ~10 stamp words a page. Thresholds measured over 9 RECAP filings: scanned pages paint one
// image at 100% of the page; letterhead/photo images on text pages measured 1–31%.
const IMAGE_PAGE_COVER = 0.9;
const MARGIN_BAND = 0.12;
const IMAGE_PAGE_BODY_WORDS = 15;
const mulCtm = (m: number[], n: number[]): number[] => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
function imagePaints(ops: { fnArray: number[]; argsArray: any[] }, pageW: number, pageH: number): { count: number; best: number } {
  const O: any = pdfjs.OPS;
  const paint = new Set<number>([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageMaskXObject,
    O.paintImageXObjectRepeat, O.paintImageMaskXObjectRepeat, O.paintImageMaskXObjectGroup].filter((x) => x !== undefined));
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  let count = 0, best = 0;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === O.save) stack.push(ctm);
    else if (fn === O.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === O.transform) ctm = mulCtm(ctm, ops.argsArray[i]);
    else if (paint.has(fn)) {
      count++;
      const w = Math.hypot(ctm[0], ctm[1]), h = Math.hypot(ctm[2], ctm[3]);
      best = Math.max(best, Math.min(1, (w * h) / (pageW * pageH)));
    }
  }
  return { count, best };
}
function bodyWordCount(items: any[], page: any): number {
  const [x0, y0, x1, y1] = page.view as number[];
  const W = x1 - x0, H = y1 - y0;
  const rot = ((page.rotate % 360) + 360) % 360;
  let n = 0;
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const along = rot % 180 === 0 ? (it.transform[5] - y0) / H : (it.transform[4] - x0) / W;
    if (along > MARGIN_BAND && along < 1 - MARGIN_BAND) n += it.str.split(/\s+/).filter(Boolean).length;
  }
  return n;
}

function garbleRatio(s: string): number {
  if (!s.length) return 0;
  let bad = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd || (c >= 0xe000 && c <= 0xf8ff) || (c < 32 && c !== 10 && c !== 9 && c !== 13)) bad++;
  }
  return bad / s.length;
}

/** The page's text, a line per baseline, and which of those lines are raised or lowered pieces
 *  of another (`riders`, 0-based). A footnote marker or an ordinal's "st" sits about a third of
 *  the font's height off its line's baseline and is read as a line of its own; the text keeps it
 *  there, as the engine has always read it, and a hold's line count leaves it out, as a lawyer
 *  counting down the printed page does. Counted, the named line was one too far down for every
 *  marker above it. */
function orderText(items: any[]): { text: string; riders: boolean[] } {
  const lines: Array<{ y: number; h: number; parts: Array<{ x: number; str: string }> }> = [];
  for (const it of items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5]);
    let line = lines.find((l) => Math.abs(l.y - y) <= 2);
    if (!line) { line = { y, h: 0, parts: [] }; lines.push(line); }
    line.h = Math.max(line.h, it.height || Math.hypot(it.transform[2], it.transform[3]) || 0);
    line.parts.push({ x: it.transform[4], str: it.str });
  }
  lines.sort((a, b) => b.y - a.y);
  const texts = lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(''));
  // within six tenths of a line's height of a line carrying more text: a word processor raises a
  // superscript a third to a half of the font's height, and single spacing puts the next line a
  // whole height or more away
  const riders = lines.map((l, i) => lines.some((m, j) => j !== i && Math.abs(m.y - l.y) <= m.h * 0.6 && texts[j].trim().length > texts[i].trim().length));
  return { text: texts.join('\n'), riders };
}

/** A page the content rule holds, in the words the .txt and .docx refusals use for the same
 *  content, and the way through. The line is counted as orderText reads the page: a line of
 *  text is a line, blank space is none, and a raised marker is part of its line, where a .txt
 *  counts its empty lines and a Word file its empty paragraphs. Unsaid, a lawyer counting down the printed page landed one line short
 *  of a link under a blank line, and a link's value was called a block. */
function pageHold(hold: Hold, riders: boolean[]): { says: string; way: string } {
  const line = Math.max(1, hold.line - riders.slice(0, hold.line - 1).filter(Boolean).length);
  const at = `from line ${line} of the page (counting only lines with text on them)`;
  const block = 'delete that block from the source and export the PDF again';
  const mail = 'open the message in your mail program and print it to PDF again from there';
  if (hold.format === 'email') return { says: `an email’s headers (a printed message source) ${at}`, way: block };
  if (hold.format === 'pem') return { says: `an encoded certificate or key block, which this app cannot read, ${at}`, way: block };
  if (hold.kind === 'link') return { says: `encoded content inside a link, which this app cannot read, ${at}`, way: 'delete the link in the source, or replace it with the words it shows, and export the PDF again' };
  if (hold.kind === 'percent') return { says: `encoded content (letters written as “%” and two hex digits), which this app cannot read, ${at}`, way: 'replace those letters in the source with the letters they stand for, or delete them, and export the PDF again' };
  if (hold.kind === 'qp') return { says: `encoded content (quoted-printable email encoding, which splits words with “=”), which this app cannot read, ${at}`, way: mail };
  if (hold.kind === 'header') return { says: `encoded content (email header text written as =?utf-8?…?=), which this app cannot read, ${at}`, way: mail };
  return { says: `encoded content, which this app cannot read, ${at}`, way: block };
}

export async function extractPdf(buf: Uint8Array): Promise<PdfResult> {
  const raw = new TextDecoder('latin1').decode(buf);
  const headers = (raw.match(/%PDF-\d\.\d/g) || []).length;
  const eofs = (raw.match(/%%EOF/g) || []).length;

  // untrusted-input rule (design doc §3.5): pdfjs-dist 6 removed the eval font path
  // entirely (the old isEvalSupported knob is gone; the shipped build contains no
  // eval/new Function) — the rule is satisfied by the library itself plus the app CSP.
  const doc = await pdfjs.getDocument({
    data: buf.slice(),
    cMapUrl: '/pdfjs/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
  }).promise;

  const warnings: string[] = [];
  const pages: PdfPage[] = [];
  const annotations: PdfResult['annotations'] = [];
  // the way through for each page the content rule holds, finished once every page is read
  const ways = new Map<number, string>();

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const { text, riders } = orderText(tc.items as any[]);

    let img = { count: 0, best: 0 };
    try {
      const ops = await page.getOperatorList();
      const [vx0, vy0, vx1, vy1] = page.view as number[];
      img = imagePaints(ops as any, vx1 - vx0, vy1 - vy0);
    } catch { /* non-fatal: no image evidence, the text rules alone decide */ }
    const hasImage = img.count > 0;
    const words = text.split(/\s+/).filter(Boolean).length;

    let status = 'ok';
    if (text.replace(/\s/g, '').length < 3) {
      status = hasImage ? 'refused: image-only (scan?) — no text layer' : 'refused: no extractable text';
    } else if (garbleRatio(text) > 0.05) {
      status = 'refused: garbled extraction (broken font mapping)';
    } else if (img.best >= IMAGE_PAGE_COVER && bodyWordCount(tc.items as any[], page) < IMAGE_PAGE_BODY_WORDS) {
      status = `refused: image page whose only text is a margin stamp (${words} words, all in the header/footer band; image covers ${Math.round(img.best * 100)}% of the page) — a scan with an e-filing stamp, no text layer`;
    } else {
      // The text lane's content rule (detect.ts contentHold), per page: a printed message
      // source or an exhibit carrying a base64 block leaves that page out, not shipped unread.
      const hold = contentHold(text);
      if (hold) { const h = pageHold(hold, riders); status = `refused: ${h.says}`; ways.set(n, h.way); }
    }

    const anns = await page.getAnnotations({ intent: 'display' });
    for (const a of anns as any[]) {
      annotations.push({ page: n, subtype: a.subtype, field: a.fieldName || undefined, value: a.fieldValue || a.contents || undefined });
    }
    pages.push({ page: n, status, words, text: status === 'ok' ? text : '' });
  }
  // "To include it" is the way back in for a page the rest of the file went through without.
  // Where no page reads the drop holds the whole file (store.ts), and on a one-page file the
  // words read as if the rest had gone through.
  const tail = pages.some((p) => p.status === 'ok') ? ' to include it' : '';
  for (const p of pages) {
    const way = ways.get(p.page);
    if (way) p.status += ` — the page is left out; ${way}${tail}`;
    if (p.status !== 'ok') warnings.push(`Page ${p.page} ${p.status}`);
  }

  const meta: any = await doc.getMetadata().catch(() => null);
  const info = (meta && meta.info) || {};
  const metaFinds = ['Author', 'Creator', 'Producer', 'Title', 'Subject', 'Keywords']
    .filter((k) => info[k]).map((k) => ({ key: k, value: String(info[k]) }));

  const provenance = `${info.Producer || ''} ${info.Creator || ''}`;
  if (/paper capture|clearscan|abbyy|finereader|tesseract|ocr/i.test(provenance)) {
    warnings.push(`Text layer appears to be OCR output (${(info.Producer || info.Creator || '').trim()}) — review against the page images.`);
  }

  const att = await doc.getAttachments().catch(() => null);
  const attachments = att ? Object.keys(att) : [];
  if (attachments.length) warnings.push(`${attachments.length} embedded attachment(s) present, not scanned.`);
  const overlays = annotations.filter((a) => ['Square', 'Ink', 'Highlight'].includes(a.subtype));
  if (overlays.length) warnings.push(`${overlays.length} drawn-box annotation(s) — if meant as redactions, they are overlays, not deletions.`);
  if (headers > 1 || eofs > 2) warnings.push(`File contains ${headers} PDF header(s) / ${eofs} EOF marker(s) — possible prior revisions inside the file.`);

  const refused = pages.filter((p) => p.status !== 'ok');
  return {
    pages, metaFinds, annotations, attachments, warnings,
    complete: refused.length === 0,
    summary: `${doc.numPages} pages · ${pages.length - refused.length} extracted · ${refused.length} refused`,
  };
}
