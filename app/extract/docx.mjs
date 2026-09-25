// simpler.legal — W3 extraction layer, docx forensic walker (v0).
// Design of record: design/APP_DESIGN_2026-07-19.md §3.5. Doctrine: FAIL-LOUD —
// every zip part is enumerated; anything we did not walk is reported, never dropped.
// Dependency-free zip read (Node zlib here; the browser twin app/frontend/src/lib/extract/
// docx.ts uses DecompressionStream) + fast-xml-parser (MIT) for real XML walking — no
// regex-on-XML. The two files are kept in step by hand; test.mjs runs this one.
//
// Deliberately surfaced as their own find classes (the leaks conversion tools drop):
//   rev:'del' — tracked-change deletions (w:del/w:delText): "removed" text still in the file
//   rev:'ins' — tracked-change insertions (w:ins), with author metadata where present
//             (both are FLAGS on the item; `kind` stays the part's channel — a tracked
//             insertion in a footer is footer text, never body text. Audit B5, 2026-09-13.)
//   hidden    — w:vanish runs: invisible on screen, present in the XML
//   alt-text  — image/shape descriptions living in attributes, not text nodes
//   comment   — word/comments.xml including WHO commented
//   a:t text  — text boxes / SmartArt / charts (DrawingML), missed by naive w:t grabs
//   field     — field instructions (w:instrText, w:fldSimple): a HYPERLINK's mailto:, a
//               MERGEFIELD's name — text Word never shows
//   link      — TargetMode="External" relationship targets and hyperlink tooltips
//   control   — content-control alias/tag and every drop-down entry (chosen or not)
//   variable  — settings.xml document variables · people — people.xml author names
//   chart/diagram — chart data and SmartArt text parts
//
// Shape of the text (2026-09-13, the real-document trial): items are runs, and Word splits
// a paragraph into runs anywhere — mid-word when a spell-check or a formatting change
// lands. `para` is the paragraph counter within the part; `pre` is what stood between the
// previous run and this one (a tab, a line break, a whitespace-only run). flowText() is the
// ONE definition of readable text: runs of a paragraph concatenate as they stand, a
// paragraph change is one newline.

import zlib from 'node:zlib';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

// ---------- minimal zip reader ----------
export function readZip(buf) {
  // EOCD: scan back for 0x06054b50
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip (no end-of-central-directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.set(name, { method, csize, lho });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const nameLen = buf.readUInt16LE(e.lho + 26);
      const extraLen = buf.readUInt16LE(e.lho + 28);
      const start = e.lho + 30 + nameLen + extraLen;
      const raw = buf.subarray(start, start + e.csize);
      if (e.method === 0) return Buffer.from(raw);
      if (e.method === 8) return zlib.inflateRawSync(raw);
      throw new Error(`unsupported zip method ${e.method} for ${name}`);
    },
  };
}

// ---------- the flow ----------
export const inMainFlow = (i) => i.kind === 'body' && i.rev !== 'del';

export function flowLayout(items) {
  let out = '';
  let last;
  const spans = [];
  for (const it of items) {
    if (it.para !== undefined) {
      if (last !== undefined && it.para !== last) out += '\n';
      last = it.para;
    }
    out += it.pre ?? '';
    spans.push({ s: out.length, e: out.length + it.text.length, item: it });
    out += it.text;
  }
  return { text: out, spans };
}
export const flowText = (items) => flowLayout(items).text;

export function droppedChannels(items) {
  const out = new Set();
  for (const i of items) {
    if (inMainFlow(i)) continue;
    if (i.rev === 'del') out.add('deleted');
    if (i.kind !== 'body') out.add(i.kind);
  }
  return [...out];
}

// ---------- OOXML walking ----------
export const PARSER_OPTIONS = {
  preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '',
  alwaysCreateTextNode: true, trimValues: false,
  // text stays text: the parser's default turns "007123" into 7123 and "0x1A" into 26
  parseTagValue: false, parseAttributeValue: false,
  // numeric character references decode to their characters (a real header carried
  // `&#xA;` inside attribute values, 2026-09-13); without this the parser keeps the
  // reference as literal text and the writer's re-escape would corrupt it. The option's
  // other effect, named HTML entities, cannot occur in well-formed OOXML.
  htmlEntities: true,
};
const parser = new XMLParser(PARSER_OPTIONS);

// an Office 2016 chart (chartEx) holds its text in cx:v and cx:pt, and an equation its runs in
// m:t: "EBITDA of Kestrel" typed in Word's equation editor was read by nothing until 2026-09-23
const TEXT_TAGS = new Set(['w:t', 'w:delText', 'a:t', 'c:v', 'cx:v', 'cx:pt', 'vt:lpwstr', 'vt:lpstr', 'm:t']);
const FIELD_TAGS = new Set(['w:instrText', 'w:delInstrText']);
export const ATTR_TEXT = {
  'wp:docPr': { attrs: ['title', 'descr'], kind: 'alt-text' },
  'a:cNvPr': { attrs: ['title', 'descr'], kind: 'alt-text' },
  'pic:cNvPr': { attrs: ['title', 'descr'], kind: 'alt-text' },
  'v:shape': { attrs: ['alt', 'title'], kind: 'alt-text' },
  'w:fldSimple': { attrs: ['w:instr'], kind: 'field' },
  'w:hyperlink': { attrs: ['w:tooltip'], kind: 'link' },
  'w:alias': { attrs: ['w:val'], kind: 'control' },
  'w:tag': { attrs: ['w:val'], kind: 'control' },
  'w:listItem': { attrs: ['w:displayText', 'w:value'], kind: 'control' },
  // a legacy form-field drop-down (FORMDROPDOWN) keeps its entries in w:ffData
  'w:listEntry': { attrs: ['w:val'], kind: 'control' },
  'w:docVar': { attrs: ['w:val'], kind: 'variable' },
  'w15:person': { attrs: ['w15:author'], kind: 'people' },
  // the person's directory identity: "S::name@firm.example::guid" (fixture, 2026-09-13)
  'w15:presenceInfo': { attrs: ['w15:userId'], kind: 'people' },
  't:Attribution': { attrs: ['userName', 'userId'], kind: 'task' },
  't:Assign': { attrs: ['userName', 'userId'], kind: 'task' },
  't:SetTitle': { attrs: ['title'], kind: 'task' },
  // an Office 2016 chart's data column is named on its level (the column's header in the sheet)
  'cx:lvl': { attrs: ['name'], kind: 'chart' },
};

// w:val is ST_OnOff: "false", "0" and "off" all switch w:vanish off; reading "off" as on
// dropped a run Word shows ("does not consent" shipped as "does consent", 2026-09-23)
export function hasVanish(children) {
  for (const node of children) {
    if (node['w:rPr']) {
      for (const p of node['w:rPr']) {
        if ('w:vanish' in p) {
          const v = (p[':@'] || {})['w:val'];
          if (v !== 'false' && v !== '0' && v !== 'off') return true;
        }
      }
    }
  }
  return false;
}

/** a table row's trPr carries a tracked row insertion/deletion: every cell in it is that */
export function rowRevision(children) {
  for (const node of children) {
    if (node['w:trPr']) {
      for (const p of node['w:trPr']) {
        if ('w:del' in p) return 'del';
        if ('w:ins' in p) return 'ins';
      }
    }
  }
  return undefined;
}

// the arguments an equation prints apart from what stands beside them; every other structure (a
// box, a bar, an accent, a group character, a delimiter) prints in line (docx.ts MATH_APART, INT-9)
const MATH_APART = {
  'm:sSub': new Set(['m:sub']), 'm:sSup': new Set(['m:sup']), 'm:sSubSup': new Set(['m:sub', 'm:sup']), 'm:sPre': new Set(['m:sub', 'm:sup']),
  'm:f': new Set(['m:num', 'm:den']), 'm:rad': new Set(['m:deg', 'm:e']), 'm:nary': new Set(['m:sub', 'm:sup']), 'm:func': new Set(['m:e']),
  'm:limLow': new Set(['m:lim']), 'm:limUpp': new Set(['m:lim']), 'm:mr': new Set(['m:e']), 'm:eqArr': new Set(['m:e']),
};

// a phantom whose m:show is off prints nothing of its argument (docx.ts phantomUnshown, W5R-7)
function phantomUnshown(kids) {
  const pr = (kids || []).find((k) => 'm:phantPr' in k);
  const show = pr ? pr['m:phantPr'].find((k) => 'm:show' in k) : undefined;
  const v = show ? String((show[':@'] || {})['m:val'] ?? 'on') : 'on';
  return v === '0' || v === 'off' || v === 'false';
}

// Fonts whose codes draw pictures, not letters: a check box (Wingdings F0FE) or an arrow is a
// w:sym, and none is text.
const DINGBAT_FONT = /^(?:Wingdings(?: [23])?|Webdings|(?:ITC )?Zapf ?Dingbats|Marlett|MS Outlook|Bookshelf Symbol \d+|MT Extra|Monotype Sorts|MS Reference Specialty)$/i;
// What a w:sym draws, as text: '' for a picture. A symbol font's codes are written F000–F0FF,
// the font's own 0–255. Symbol draws Greek and mathematics there, and its 0–9 are digits; any
// other font's character is text as it stands, F0xx read as its own 0–255. Until 2026-09-24
// the walker read none: "6123" + a w:sym "4" + "567" read "6123567" while Word drew 61234567
// (W-LEAK-4). Symbol's Greek capitals look like Latin ones (Τ Α Ν) and are read as nothing.
export function symText(font, char) {
  if (!/^[0-9A-Fa-f]{1,6}$/.test(char)) return '';
  const code = parseInt(char, 16);
  const low = code >= 0xf000 && code <= 0xf0ff ? code - 0xf000 : code;
  const f = font.trim();
  if (DINGBAT_FONT.test(f)) return '';
  if (/^Symbol$/i.test(f)) return low >= 0x30 && low <= 0x39 ? String.fromCharCode(low) : '';
  if (low < 0x20 || (low >= 0x7f && low < 0xa0) || (low >= 0xd800 && low <= 0xdfff) || low > 0x10ffff) return '';
  return String.fromCodePoint(low);
}
// A part written in UTF-16: a byte-order mark, or "<" written as two bytes one of them zero.
// Word reads it; decoded as UTF-8 it reads as no XML at all (W-LEAK-8).
export const utf16Part = (u) => u.length >= 2 && ((u[0] === 0xff && u[1] === 0xfe) || (u[0] === 0xfe && u[1] === 0xff) || (u[0] === 0x3c && u[1] === 0) || (u[0] === 0 && u[1] === 0x3c));
// A symbol's character that no run's text follows in its paragraph is an item of its own, at
// the paragraph's end (docx.ts symEnd): a new paragraph empties `pending`, and "Margaret Ta" + a
// w:sym "n" ending the paragraph read "Margaret Ta", which no row matches. So is one that a run
// or a symbol of the other flow follows, a tracked deletion's or the live text's: read into it,
// "Margaret T" + a deleted "a" + "an" read "Margaret Taan".
function symEnd(state, out) {
  const it = state.sym;
  state.sym = undefined;
  if (!it || !state.pending.trim()) return;
  const lead = /^\s*/.exec(state.pending)[0];
  it.text = state.pending.slice(lead.length);
  if (lead) it.pre = lead;
  takePending(state, it.rev);
  out.push(it);
}
// `pending` handed to what comes next (docx.ts takePending): a tracked deletion's item or symbol
// takes it all, and what the live text wrote into it (`live`: a space run, a tab, a break, a
// no-break hyphen outside a deletion) stays pending for the live text. Given to the deletion
// alone, "Paid Margaret Tan" + " " + a deleted "within 30 days" + "promptly" read "Paid Margaret
// Tanpromptly" live (W7F-1).
function takePending(state, rev) {
  if (rev === 'del') { state.pending = state.live ?? ''; return; }
  state.pending = '';
  state.live = '';
}
function addPending(state, ctx, s) {
  state.pending += s;
  if (ctx.flags.rev !== 'del') state.live = (state.live ?? '') + s;
}

function walk(nodes, ctx, out, state) {
  for (const node of nodes) {
    const attrs = node[':@'] || {};
    for (const key of Object.keys(node)) {
      if (key === ':@') continue;
      if (key === '#text') {
        if (!ctx.capture) continue;
        const text = String(node[key]);
        // a field instruction is not in the flow: it neither takes the gap before it nor a
        // paragraph number (a TOC line is "heading, tab, PAGEREF field, page number" — the
        // tab belongs to the page number, not to the instruction between them)
        if (ctx.flags.kind === 'field') { if (text.trim()) out.push({ text, ...ctx.flags, node, elem: ctx.elem }); continue; }
        // a whitespace-only run is the gap between its neighbours, not an item (inter-
        // element whitespace of a captureAll part is not even that)
        if (!text.trim()) { if (ctx.inText) addPending(state, ctx, text); continue; }
        // outside a run (a captureAll part: dc:creator, a custom-XML field) each element's
        // text is a value of its own: on one line custom properties "Kestrel" and "Margaret
        // Tan" fused into "KestrelMargaret Tan", where neither name has a word boundary
        const item = { text, ...ctx.flags, node, elem: ctx.elem, para: ctx.inText ? state.para : ++state.seq };
        // an equation's run: the stretch of the equation it prints in (the equation, or an
        // argument printed apart — MATH_APART), so the writer reads side by side only the runs
        // that render so (docx.ts WalkItem.math)
        if (ctx.math) item.math = ctx.math;
        // Word's paragraph number and the text-box flag (docx.ts DocxItem `wp`, `inBox`)
        if (state.wp) item.wp = state.wp;
        if (ctx.inBox) item.inBox = true;
        // a phantom's argument that does not show (docx.ts WalkItem `unshown`)
        if (ctx.unshown) item.unshown = true;
        // an equation's runs render with nothing between them, and a name typed across two of
        // them reads as one word no row matches; each is read as a word of its own. The space
        // is in the reading only — the writer never writes `pre` back.
        if (state.gap) {
          state.gap = false;
          const prev = out[out.length - 1];
          if (!state.pending && prev && prev.para === item.para && !/\s$/.test(prev.text)) { state.pending = ' '; item.gap = true; }
        }
        // a symbol is read in the flow it is drawn in (docx.ts, the same line)
        if (state.sym && (state.sym.rev === 'del') !== (item.rev === 'del')) symEnd(state, out);
        if (state.pending) { item.pre = state.pending; takePending(state, item.rev); state.sym = undefined; }
        out.push(item);
        continue;
      }
      const at = ATTR_TEXT[key];
      if (at) {
        const seen = new Set();
        for (const a of at.attrs) {
          const v = attrs[a];
          if (!v || !String(v).trim() || seen.has(v)) continue;
          seen.add(v);
          out.push({ text: String(v), kind: at.kind, attr: a, node });
        }
      }
      // paragraph and inline breaks are the SHAPE of the text (flowText): a paragraph
      // starts a line, a tab or break inside a run is kept in front of the next run.
      // Inside property blocks (w:pPr/w:tabs holds tab STOPS, not tabs) they are not.
      // A DrawingML paragraph (a:p — chart titles, SmartArt) and a chart data point
      // (c:pt — one category label or value) are lines too; without that, chart values
      // "0770" and "0900123" concatenate into one phone-shaped string. A property's value
      // (vt:lpwstr, vt:lpstr) is one value, never the continuation of the one before.
      if (key === 'w:p' || key === 'a:p' || key === 'c:pt' || key === 'c:tx' || key === 'cx:pt' || key === 'cx:tx' || key === 'vt:lpwstr' || key === 'vt:lpstr') {
        symEnd(state, out);
        state.para = ++state.seq; state.pending = state.live = '';
        if (key === 'w:p' && !ctx.inBox) state.wp = (state.wp ?? 0) + 1;
      }
      else if (key === 'm:r') state.gap = true;
      else if (!ctx.inProps && (key === 'w:tab' || key === 'w:ptab')) addPending(state, ctx, '\t');
      else if (!ctx.inProps && (key === 'w:br' || key === 'w:cr')) addPending(state, ctx, '\n');
      // "twenty‑one" is one word with a non-breaking hyphen element between two runs
      else if (!ctx.inProps && key === 'w:noBreakHyphen') addPending(state, ctx, '-');
      else if (!ctx.inProps && key === 'w:sym') {
        const ch = symText(String(attrs['w:font'] ?? ''), String(attrs['w:char'] ?? ''));
        if (ch && state.sym && (state.sym.rev === 'del') !== (ctx.flags.rev === 'del')) symEnd(state, out);
        state.pending += ch;
        if (ch && !state.sym) {
          state.sym = { text: '', ...ctx.flags, node, para: state.para };
          if (state.wp) state.sym.wp = state.wp;
          if (ctx.inBox) state.sym.inBox = true;
        }
      }
      const zone = key === 'm:oMath' || MATH_APART[ctx.tag ?? '']?.has(key) ? node : ctx.zone;
      const next = { capture: ctx.capture, inText: false, flags: { ...ctx.flags }, inProps: ctx.inProps || /Pr$/.test(key) || key === 'w:tabs', parent: node, tag: key, zone, math: key === 'm:r' ? zone ?? ctx.parent : ctx.math, inBox: ctx.inBox || key === 'w:txbxContent', unshown: ctx.unshown || (key === 'm:phant' && phantomUnshown(node[key])) };
      // revision marks are a FLAG on the run, like `hidden` — never a change of channel.
      // A move is a deletion where the text left and an insertion where it arrived; a
      // row-level mark (w:trPr) covers every cell of the row.
      if (key === 'w:del' || key === 'w:moveFrom') { next.flags.rev = 'del'; next.flags.author = attrs['w:author'] || next.flags.author; }
      if (key === 'w:ins' || key === 'w:moveTo') { next.flags.rev = 'ins'; next.flags.author = attrs['w:author'] || next.flags.author; }
      if (key === 'w:tr') { const rr = rowRevision(node[key]); if (rr) next.flags.rev = rr; }
      if (key === 'w:r' && hasVanish(node[key])) next.flags.hidden = true;
      // a chart's numeric cache holds doubles, not text: listed like any chart text, but a
      // tag can never be written INTO one (Word refuses "4.[card]" — stress file 02,
      // 2026-09-13); the .docx writer treats `num` items on their own terms
      if (key === 'c:numCache' || key === 'c:numLit' || key === 'cx:numDim') next.flags.num = true;
      if (TEXT_TAGS.has(key)) { next.capture = true; next.inText = true; next.elem = node; }
      if (FIELD_TAGS.has(key)) { next.capture = true; next.inText = true; next.flags.kind = 'field'; next.elem = node; }
      let kids = node[key];
      // Word writes a text box twice — mc:Choice (DrawingML) and mc:Fallback (VML) carry
      // the same runs. Read the Choice and only in its absence the Fallback.
      if (key === 'mc:AlternateContent') {
        const choice = kids.filter((k) => 'mc:Choice' in k);
        if (choice.length) kids = choice;
      }
      // a text box's paragraphs are their own; the anchor paragraph continues after them
      if (key === 'w:txbxContent') {
        const outer = state.para;
        walk(kids, next, out, state);
        symEnd(state, out);
        state.para = outer; state.pending = state.live = '';
        continue;
      }
      walk(kids, next, out, state);
    }
  }
}

/** Parse one XML part and walk it: the tree and the items in document order, each still
 *  pointing at its text node (the .docx writer edits exactly what the walker read). */
export function walkPart(xml, captureAll = false) {
  const tree = parser.parse(xml);
  const items = [];
  const state = { para: 0, seq: 0, pending: '' };
  walk(tree, { capture: captureAll, inText: false, flags: {}, inProps: false }, items, state);
  symEnd(state, items);
  return { tree, items };
}

/** Walk an already-parsed (and possibly edited) tree — the .docx writer's second look. */
export function walkTree(tree, captureAll = false) {
  const items = [];
  const state = { para: 0, seq: 0, pending: '' };
  walk(tree, { capture: captureAll, inText: false, flags: {}, inProps: false }, items, state);
  symEnd(state, items);
  return items;
}

export function externalTargets(xml) {
  const out = [];
  (function find(nodes) {
    for (const node of nodes) {
      const attrs = node[':@'] || {};
      if (node['Relationship'] && attrs.TargetMode === 'External' && attrs.Target) out.push(String(attrs.Target));
      for (const k of Object.keys(node)) if (k !== ':@' && k !== '#text') find(node[k]);
    }
  })(parser.parse(xml));
  return out;
}

function extractComments(xml) {
  const tree = parser.parse(xml);
  const out = [];
  (function find(nodes) {
    for (const node of nodes) {
      if (node['w:comment']) {
        const author = (node[':@'] || {})['w:author'] || 'unknown';
        const texts = [];
        const state = { para: 0, seq: 0, pending: '' };
        walk(node['w:comment'], { capture: false, inText: false, flags: {}, inProps: false }, texts, state);
        symEnd(state, texts);
        out.push({ kind: 'comment', author, text: flowText(texts) });
      } else {
        for (const k of Object.keys(node)) if (k !== ':@' && k !== '#text') find(node[k]);
      }
    }
  })(tree);
  return out;
}

// ---------- part classification (the fail-loud inventory) ----------
export const RULES = [
  { re: /^word\/document\.xml$/, kind: 'body' },
  { re: /^word\/header\d+\.xml$/, kind: 'header' },
  { re: /^word\/footer\d+\.xml$/, kind: 'footer' },
  { re: /^word\/footnotes\.xml$/, kind: 'footnote' },
  { re: /^word\/endnotes\.xml$/, kind: 'endnote' },
  { re: /^word\/comments\.xml$/, kind: 'comments' },
  { re: /^word\/glossary\/document\.xml$/, kind: 'glossary' },
  { re: /^word\/charts\/chart\d+\.xml$/, kind: 'chart' },
  // an Office 2016 chart (waterfall, funnel, treemap …) and a chart's own drawing (a text box
  // or shape placed on it): each carries typed text, and each was unrecognized until 2026-09-23
  { re: /^word\/charts\/chartEx\d+\.xml$/, kind: 'chart' },
  { re: /^word\/drawings\/drawing\d+\.xml$/, kind: 'chart' },
  { re: /^word\/diagrams\/(data|drawing)\d+\.xml$/, kind: 'diagram' },
  { re: /^word\/settings\.xml$/, kind: 'variable' },
  { re: /^word\/people\.xml$/, kind: 'people' },
  { re: /^word\/documenttasks\/documenttasks\d+\.xml$/, kind: 'task' },
  { re: /^word\/(glossary\/)?_rels\/[^/]+\.rels$/, kind: 'link', rels: true },
  { re: /^docProps\/(core|app|custom)\.xml$/, kind: 'properties', captureAll: true },
  { re: /^customXml\/item\d+\.xml$/, kind: 'customXml', captureAll: true },
];
// a signed macro project's signature (vbaProjectSignature.bin, and its Agile and V3 forms) is
// a certificate, not text
const BINARY_RE = /^(word\/(vbaProject\.bin|vbaProjectSignature(?:Agile|V3)?\.bin|embeddings\/|media\/|fonts\/|activeX\/)|docProps\/thumbnail)/;
// intelligence.xml holds Editor word hashes, LabelInfo.xml the sensitivity-label ids: no
// readable text (checked on the 2026-09-13 trial files), listed as structure. Anchored at both
// ends, and a folder of relationships only for its .rels parts, as the app's walker is.
export const STRUCTURAL_RE = /^(?:\[Content_Types\]\.xml|_rels\/[^/]*\.rels|word\/(?:glossary\/)?(?:styles\.xml|stylesWithEffects\.xml|fontTable\.xml|webSettings\.xml|theme\/theme\d+\.xml|theme\/themeOverride\d+\.xml|numbering\.xml|settings\.xml)|word\/glossary\/_rels\/[^/]*\.rels|word\/comments(?:Extended|Ids|Extensible)\.xml|word\/intelligence\.xml|docMetadata\/LabelInfo\.xml|word\/charts\/(?:style|colors)\d+\.xml|word\/charts\/_rels\/[^/]*\.rels|word\/drawings\/_rels\/[^/]*\.rels|word\/diagrams\/(?:layout|quickStyle|colors)\d+\.xml|word\/diagrams\/_rels\/[^/]*\.rels|customXml\/itemProps\d+\.xml|customXml\/_rels\/[^/]*\.rels)$/;

export function extractDocx(buf) {
  const zip = readZip(buf);
  const items = [];
  const inventory = { scanned: [], structural: [], binaryFlagged: [], unrecognized: [], invalid: [] };
  const wide = new Set();   // refused as the rest are, and said truly: Word reads these

  for (const name of zip.names) {
    if (name.endsWith('/')) continue;
    const rule = RULES.find(r => r.re.test(name));
    if (rule) {
      const data = zip.read(name);
      if (!data) continue;
      // fast-xml-parser parses truncated/corrupt XML best-effort and silently drops
      // text — validate first so a malformed part is refused loudly, never half-read.
      const xml = data.toString('utf8');
      if (XMLValidator.validate(xml) !== true) {
        inventory.invalid.push(name);
        if (utf16Part(data)) wide.add(name);
        continue;
      }
      inventory.scanned.push(name);
      if (rule.rels) {
        items.push(...externalTargets(xml).map(t => ({ part: name, kind: 'link', text: t })));
      } else if (rule.kind === 'comments') {
        items.push(...extractComments(xml).map(x => ({ part: name, ...x })));
      } else {
        for (const w of walkPart(xml, !!rule.captureAll).items) {
          const { node: _node, elem: _elem, math: _math, gap: _gap, unshown: _unshown, ...rest } = w;
          items.push({ part: name, ...rest, kind: rest.kind || rule.kind });
        }
      }
    } else if (BINARY_RE.test(name)) {
      inventory.binaryFlagged.push(name);      // present, NOT scanned — surfaced loudly
    } else if (STRUCTURAL_RE.test(name)) {
      inventory.structural.push(name);         // structure, no free text — listed, not silent
    } else {
      inventory.unrecognized.push(name);       // fail-loud: we don't know what this is
    }
  }

  return {
    items: items.filter(i => i.text && i.text.trim()),
    inventory,
    complete: inventory.unrecognized.length === 0 && inventory.invalid.length === 0,
    warnings: [
      ...inventory.invalid.map(p => wide.has(p) ? `Written in UTF-16, which Word reads and this app does not — part refused, not read: ${p}` : `Malformed XML — part refused, not read: ${p}`),
      ...inventory.binaryFlagged.map(p => `Embedded binary present, not scanned: ${p}`),
      ...inventory.unrecognized.map(p => `Unrecognized part not scanned: ${p}`),
    ],
  };
}
