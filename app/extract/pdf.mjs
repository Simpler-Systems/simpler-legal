// simpler.legal — W3 extraction layer, PDF reader (v0).
// Design of record: design/APP_DESIGN_2026-07-19.md §3.5. Engine: pdfjs-dist (Apache-2.0),
// isEvalSupported:false (untrusted-input rule), fonts/cMaps resolved locally from the package.
// Project rails on top of raw pdf.js, all fail-loud:
//   scan-detect   — a page with no extractable text is REFUSED per page, never passed as clean
//   stamped-scan  — a page that is ONE IMAGE whose only text sits in the header/footer margins
//                   (a court's e-filing stamp, a Bates number) is REFUSED per page. Measured
//                   2026-09-14 (OPS_LEDGER): a 19-page scanned complaint passed scan-detect 19/19
//                   at ~10 words a page because every page carried the CM/ECF header as text;
//                   the "redacted" export would have held none of the complaint and all of the
//                   case number. An OCR'd scan (full-page image + a body of text) still passes;
//                   a letterhead logo over a page of text still passes (image far under 90%).
//   garble-detect — PUA/replacement-char-heavy extraction (broken ToUnicode) is REFUSED per page
//   metadata      — /Info swept, six keys (Author/Creator/Producer are classic staff-name
//                   leaks). XMP IS NOT READ YET (dc:creator, xmpMM:History with prior
//                   filenames/editors) — nor are Custom /Info keys, /OpenAction JS, or the
//                   contents of embedded attachments. Named in the container audit; a
//                   comment that claims coverage the code lacks is worse than no comment.
//   annotations   — comments, form-field values, and drawn-box overlays enumerated
//   attachments   — embedded files flagged present-not-scanned
//   revisions     — multiple %PDF headers / EOF markers => possible prior versions inside the file

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
const { getDocument, OPS } = await import('file://' + pdfjsPath.replace(/\\/g, '/'));
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PKG_DIR = path.dirname(require.resolve('pdfjs-dist/package.json'));
const FONTS = pathToFileURL(path.join(PKG_DIR, 'standard_fonts')).href + '/';
const CMAPS = pathToFileURL(path.join(PKG_DIR, 'cmaps')).href + '/';

// stamped-scan rail thresholds (measured over 9 RECAP filings + fixtures, 2026-09-15):
// scanned pages paint one image at 100% of the page; letterhead/photo images on text pages
// measured 1–31%; a stamped scan's words all sit within 3% of the top edge.
const IMAGE_PAGE_COVER = 0.9;      // painted image area / page area
const MARGIN_BAND = 0.12;          // top and bottom margin band, as a fraction of the page height
const IMAGE_PAGE_BODY_WORDS = 15;  // fewer body words than this, on a full-page image, is a stamp

const mulCtm = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
// Walk the operator list with a CTM stack (q / Q / cm) and report how many images the page
// paints and the largest one's coverage of the page area (unit square through the CTM).
function imagePaints(ops, pageW, pageH) {
  const paint = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject,
    OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObjectRepeat, OPS.paintImageMaskXObjectGroup].filter((x) => x !== undefined));
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let count = 0, best = 0;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mulCtm(ctm, ops.argsArray[i]);
    else if (paint.has(fn)) {
      count++;
      const w = Math.hypot(ctm[0], ctm[1]), h = Math.hypot(ctm[2], ctm[3]);
      best = Math.max(best, Math.min(1, (w * h) / (pageW * pageH)));
    }
  }
  return { count, best };
}
// Words whose baseline lies outside the top/bottom margin bands (rotation-aware).
function bodyWordCount(items, page) {
  const [x0, y0, x1, y1] = page.view;
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

function garbleRatio(s) {
  if (!s.length) return 0;
  let bad = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0xfffd || (c >= 0xe000 && c <= 0xf8ff) || (c < 32 && c !== 10 && c !== 9 && c !== 13)) bad++;
  }
  return bad / s.length;
}

// v0 reading-order: group items into lines by y (tolerance), sort lines top→bottom, items left→right.
// UNBENCHED — the multi-column reconstructor is its own M2 rail; this handles single-column sanely.
function orderText(items) {
  const lines = [];
  for (const it of items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5]);
    let line = lines.find(l => Math.abs(l.y - y) <= 2);
    if (!line) { line = { y, parts: [] }; lines.push(line); }
    line.parts.push({ x: it.transform[4], str: it.str });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map(l => l.parts.sort((a, b) => a.x - b.x).map(p => p.str).join('')).join('\n');
}

export async function extractPdf(buf) {
  const data = new Uint8Array(buf);
  // revision sniff on raw bytes, before parsing
  const raw = Buffer.from(buf).toString('latin1');
  const headers = (raw.match(/%PDF-\d\.\d/g) || []).length;
  const eofs = (raw.match(/%%EOF/g) || []).length;

  const doc = await getDocument({
    data, isEvalSupported: false,
    standardFontDataUrl: FONTS, cMapUrl: CMAPS, cMapPacked: true,
  }).promise;

  const warnings = [];
  const pages = [];
  let annotations = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const text = orderText(tc.items);

    let img = { count: 0, best: 0 };
    try {
      const ops = await page.getOperatorList();
      const [vx0, vy0, vx1, vy1] = page.view;
      img = imagePaints(ops, vx1 - vx0, vy1 - vy0);
    } catch { /* op-list failure is non-fatal for v0: no image evidence, the text rules alone decide */ }
    const hasImage = img.count > 0;
    const words = text.split(/\s+/).filter(Boolean).length;

    let status = 'ok';
    if (text.replace(/\s/g, '').length < 3) {
      status = hasImage ? 'refused: image-only (scan?) — no text layer' : 'refused: no extractable text';
    } else if (garbleRatio(text) > 0.05) {
      status = 'refused: garbled extraction (broken font mapping) — renders fine, extracts wrong';
    } else if (img.best >= IMAGE_PAGE_COVER && bodyWordCount(tc.items, page) < IMAGE_PAGE_BODY_WORDS) {
      status = `refused: image page whose only text is a margin stamp (${words} words, all in the header/footer band; image covers ${Math.round(img.best * 100)}% of the page) — a scan with an e-filing stamp, no text layer`;
    }
    if (status !== 'ok') warnings.push(`page ${n} ${status}`);

    const anns = await page.getAnnotations({ intent: 'display' });
    for (const a of anns) {
      annotations.push({
        page: n, subtype: a.subtype,
        field: a.fieldName || undefined,
        value: a.fieldValue || a.contents || undefined,
      });
    }
    pages.push({ page: n, status, words, text: status === 'ok' ? text : '' });
  }

  const meta = await doc.getMetadata().catch(() => null);
  const info = (meta && meta.info) || {};
  const metaFinds = ['Author', 'Creator', 'Producer', 'Title', 'Subject', 'Keywords']
    .filter(k => info[k]).map(k => ({ key: k, value: String(info[k]) }));

  const provenance = `${info.Producer || ''} ${info.Creator || ''}`;
  if (/paper capture|clearscan|abbyy|finereader|tesseract|ocr/i.test(provenance)) {
    warnings.push(`text layer appears to be OCR output (${(info.Producer || info.Creator || '').trim()}) — a scanner's text layer can be incomplete or wrong; review against the page images`);
  }

  const att = await doc.getAttachments().catch(() => null);
  const attachments = att ? Object.keys(att) : [];
  if (attachments.length) warnings.push(`${attachments.length} embedded attachment(s) present, NOT scanned: ${attachments.join(', ')}`);

  const overlayBoxes = annotations.filter(a => ['Square', 'Ink', 'Highlight'].includes(a.subtype));
  if (overlayBoxes.length) warnings.push(`${overlayBoxes.length} drawn-box/markup annotation(s) — if these are meant as redactions, they are OVERLAYS, not deletions`);
  if (headers > 1 || eofs > 2) warnings.push(`file contains ${headers} PDF header(s) / ${eofs} EOF marker(s) — possible prior revisions inside the file bytes`);

  const refused = pages.filter(p => p.status !== 'ok');
  return {
    pages, metaFinds, annotations, attachments, warnings,
    complete: refused.length === 0,
    summary: `${doc.numPages} pages · ${pages.filter(p => p.status === 'ok').length} extracted · ${refused.length} refused · ${metaFinds.length} metadata fields · ${annotations.length} annotations`,
  };
}
