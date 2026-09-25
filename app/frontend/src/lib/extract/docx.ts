// Forensic OOXML walker — browser port of app/extract/docx.mjs (validated against real
// NZ-government files). Zip: DataView + DecompressionStream('deflate-raw'). Fail-loud:
// every part enumerated; unknown parts => complete:false, never silent.
import { XMLParser, XMLValidator } from 'fast-xml-parser';

/** One text item from one part. `kind` is the PART's channel (body, header, footer,
 *  footnote, endnote, glossary, properties, comment, alt-text) and nothing else changes
 *  it: a run inside a tracked change keeps its part's kind and says so in `rev`. Until
 *  2026-09-13 the walker overwrote `kind` with 'inserted', so a tracked insertion in a
 *  footer counted as page text and was promoted into the export under a warning that
 *  said the footer was not in it (audit B5).
 *
 *  `para` and `pre` carry the text's SHAPE (2026-09-13, the real-document trial): items
 *  are text runs, and Word splits a paragraph into runs anywhere — mid-word when a
 *  spell-check or a formatting change lands. Joining runs with a space, as the store did
 *  until the trial, put "Marg aret Tan" in front of the engine and lost every paragraph
 *  boundary. `para` is the paragraph counter within the part; `pre` is what stands
 *  between the previous run and this one inside the paragraph (a tab, a line break, a
 *  whitespace-only run). flowText() below is the ONE definition of the readable text. */
/** `num`: a chart's numeric cache value (c:numCache / c:numLit) — a number Word parses as
 *  a double, not text. Listed like any other chart text so nothing is read past, but a
 *  tag can never be written INTO it (Word refuses "4.[card]" — trial stress file 02,
 *  2026-09-13); the .docx writer treats these on their own terms (docxWrite.ts). */
export interface DocxItem { part: string; kind: string; text: string; author?: string; hidden?: boolean; rev?: 'ins' | 'del'; para?: number; pre?: string; attr?: string; num?: boolean; wp?: number; inBox?: boolean }

/* `para` above is the flow's paragraph IDENTITY, not a number a lawyer can find: it counts every
 * line the flow breaks at (a chart's data point, a property's value, a text box's paragraph), and
 * the text of record is laid out by it, so it cannot change without moving every offset the
 * store, the export and the writer share. `wp` is Word's paragraph number: 1-based, over the w:p
 * elements of the part in document order, a text box's own paragraphs not counted; `inBox` is
 * set on a run inside a text box (w:txbxContent), whose `wp` is then the paragraph the box is
 * anchored in. Counted by `para`, a block in a sidebar sent the lawyer to "paragraph 3" of a
 * letter whose third paragraph was "Regards" (I3-PARA-TEXTBOX, INT-22). Undefined in a part with
 * no w:p (a chart, a property). */

/** A walked item that still points at its text node in the parsed part, so a writer can
 *  rewrite exactly the text the walker read (extract/docxWrite.ts). `elem` is the element
 *  holding that text node (the w:t), where xml:space="preserve" has to be set once a
 *  rewrite leaves whitespace at either end. `math`: for a run of an equation (m:r, whatever
 *  holds its text — m:t, or a w:t, which the schema allows there), the stretch of the equation
 *  it prints in (MATH_APART): the equation (m:oMath), or an argument printed apart from what
 *  stands beside it (a subscript, a numerator, a radical's degree, a function's argument). Runs
 *  that share it render side by side; a base and its subscript do not (docxWrite mathZones).
 *  `gap`: the space in `pre` is the reading's own, put before an equation's run so its word is
 *  read as a word; the page has nothing there. `unshown`: in a phantom whose m:show is off,
 *  which takes no ink. Never stored. */
export interface WalkItem extends Omit<DocxItem, 'part'> { node: Record<string, unknown>; elem?: Record<string, unknown>; math?: Record<string, unknown>; gap?: boolean; unshown?: boolean }

/** THE main-flow predicate — the text that becomes the document of record and the
 *  export: body-part runs that are not tracked deletions. One function, imported by the
 *  store (what is read), the export (what is stated missing) and the review rail (what
 *  is listed as forensic), so the three surfaces cannot disagree about a channel. */
export const inMainFlow = (i: DocxItem) => i.kind === 'body' && i.rev !== 'del';

/** The readable text of a run sequence: runs of one paragraph concatenate directly (with
 *  whatever `pre` stood between them), a paragraph change is one newline. The store
 *  builds the document of record with it; the .docx writer places its tags on the same
 *  string, so an offset in one is an offset in the other. */
export function flowText(items: Array<Pick<DocxItem, 'text' | 'para' | 'pre'>>): string {
  return flowLayout(items).text;
}

/** flowText plus, per item, the offsets its `text` occupies in the flow — the .docx writer
 *  maps a placement on the flow back to the runs it covers through this table. */
export function flowLayout<T extends Pick<DocxItem, 'text' | 'para' | 'pre'>>(items: T[]): { text: string; spans: Array<{ s: number; e: number; item: T }> } {
  let out = '';
  let last: number | undefined;
  const spans: Array<{ s: number; e: number; item: T }> = [];
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

/** The channels the main flow leaves out of this document, for the scope line. A
 *  tracked deletion contributes 'deleted'; anything outside the body contributes its
 *  part's kind (a deletion inside a footer contributes both). */
export function droppedChannels(items: DocxItem[]): string[] {
  const out = new Set<string>();
  for (const i of items) {
    if (inMainFlow(i)) continue;
    if (i.rev === 'del') out.add('deleted');
    if (i.kind !== 'body') out.add(i.kind);
  }
  return [...out];
}
export interface DocxResult {
  items: DocxItem[];
  inventory: { scanned: string[]; structural: string[]; binaryFlagged: string[]; unrecognized: string[]; invalid: string[] };
  complete: boolean;
  warnings: string[];
}

async function inflateRaw(u8: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([u8 as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface ZipReader {
  names: string[];
  read(name: string): Promise<Uint8Array | null>;
}

export async function readZip(buf: Uint8Array): Promise<ZipReader> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip (no end-of-central-directory)');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const entries = new Map<string, { method: number; csize: number; lho: number }>();
  const td = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('bad central directory');
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const cmtLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = td.decode(buf.subarray(off + 46, off + 46 + nameLen));
    entries.set(name, { method, csize, lho });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return {
    names: [...entries.keys()],
    async read(name: string): Promise<Uint8Array | null> {
      const e = entries.get(name);
      if (!e) return null;
      const nameLen = dv.getUint16(e.lho + 26, true);
      const extraLen = dv.getUint16(e.lho + 28, true);
      const start = e.lho + 30 + nameLen + extraLen;
      const raw = buf.subarray(start, start + e.csize);
      if (e.method === 0) return raw;
      if (e.method === 8) return inflateRaw(raw);
      throw new Error(`unsupported zip method ${e.method} for ${name}`);
    },
  };
}

export const PARSER_OPTIONS = {
  preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '',
  alwaysCreateTextNode: true, trimValues: false,
  // text stays text: the parser's default turns "007123" into 7123 and "0x1A" into 26 —
  // a case number or a UK mobile ("07700 900123" has a space, "07700900123" does not)
  // would come back altered (found 2026-09-13 while writing the .docx writer)
  parseTagValue: false, parseAttributeValue: false,
  // numeric character references decode to their characters (a real header carried
  // `&#xA;` inside attribute values, 2026-09-13); without this the parser keeps the
  // reference as literal text and the writer's re-escape would corrupt it. The option's
  // other effect, named HTML entities, cannot occur in well-formed OOXML.
  htmlEntities: true,
} as const;
const parser = new XMLParser(PARSER_OPTIONS);
/** elements whose text content is document text: WordprocessingML runs, DrawingML runs
 *  (text boxes, SmartArt, chart titles), chart data (c:v — category labels and values; cx:v and
 *  cx:pt in an Office 2016 chart), property values, and an equation's runs (m:t). An equation
 *  was read by nothing until 2026-09-23: "EBITDA of Kestrel" typed in Word's equation editor
 *  shipped in the .docx while the gate passed it. */
const TEXT_TAGS = new Set(['w:t', 'w:delText', 'a:t', 'c:v', 'cx:v', 'cx:pt', 'vt:lpwstr', 'vt:lpstr', 'm:t']);
/** field instructions: a HYPERLINK's mailto: target, a MERGEFIELD's name, a REF — text
 *  Word never shows, still in the file */
const FIELD_TAGS = new Set(['w:instrText', 'w:delInstrText']);
/** text that lives in ATTRIBUTES, not text nodes — each becomes an item of its own
 *  channel, one per attribute, `attr` naming the attribute so a writer can put it back */
export const ATTR_TEXT: Record<string, { attrs: string[]; kind: string }> = {
  'wp:docPr': { attrs: ['title', 'descr'], kind: 'alt-text' },
  'a:cNvPr': { attrs: ['title', 'descr'], kind: 'alt-text' },
  'pic:cNvPr': { attrs: ['title', 'descr'], kind: 'alt-text' },
  'v:shape': { attrs: ['alt', 'title'], kind: 'alt-text' },
  'w:fldSimple': { attrs: ['w:instr'], kind: 'field' },
  'w:hyperlink': { attrs: ['w:tooltip'], kind: 'link' },
  // content controls: the alias/tag a template author typed, and every entry of a
  // drop-down list — the entries not chosen are not on the page and still in the file
  'w:alias': { attrs: ['w:val'], kind: 'control' },
  'w:tag': { attrs: ['w:val'], kind: 'control' },
  'w:listItem': { attrs: ['w:displayText', 'w:value'], kind: 'control' },
  // a legacy form-field drop-down (FORMDROPDOWN) keeps its entries in w:ffData
  'w:listEntry': { attrs: ['w:val'], kind: 'control' },
  // settings.xml document variables (mail-merge state, macro scratch values)
  'w:docVar': { attrs: ['w:val'], kind: 'variable' },
  // people.xml: the names behind every comment and tracked change
  'w15:person': { attrs: ['w15:author'], kind: 'people' },
  // the person's directory identity: "S::name@firm.example::guid" (fixture, 2026-09-13)
  'w15:presenceInfo': { attrs: ['w15:userId'], kind: 'people' },
  // documenttasks: Word's assigned to-dos — who assigned what to whom, with the title
  't:Attribution': { attrs: ['userName', 'userId'], kind: 'task' },
  't:Assign': { attrs: ['userName', 'userId'], kind: 'task' },
  't:SetTitle': { attrs: ['title'], kind: 'task' },
  // an Office 2016 chart's data column is named on its level (the column's header in the
  // chart's sheet): held the file unread until 2026-09-23, now read and masked with the chart
  'cx:lvl': { attrs: ['name'], kind: 'chart' },
};
const td = new TextDecoder();

/** a run's rPr carries w:vanish switched on: invisible on screen. w:val is ST_OnOff, where
 *  "false", "0" and "off" all switch it off; reading "off" as on dropped a run Word shows
 *  ("does not consent" shipped as "does consent", 2026-09-23) */
export function hasVanish(children: any[]): boolean {
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
export function rowRevision(children: any[]): 'ins' | 'del' | undefined {
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

/** `para` is the paragraph the item sits in; `seq` hands out numbers that never repeat, so
 *  a text box (paragraphs of its own, anchored INSIDE a paragraph) cannot share a number
 *  with the paragraph that continues after it. `live`: what of `pending` the live text wrote —
 *  a space run, a tab, a break or a no-break hyphen outside a tracked deletion (takePending) */
interface WalkState { para: number; seq: number; pending: string; live?: string; gap?: boolean; wp?: number; sym?: WalkItem }
/** `pending` handed to what comes next as what stands before it. A tracked deletion's item or
 *  symbol takes it all, and what the live text wrote into it stays pending for the live text:
 *  given to the deletion alone, the space in "Paid Margaret Tan" + " " + a deleted "within 30
 *  days" + an inserted "promptly" left the live reading, and the .txt shipped "Paid Margaret
 *  Tanpromptly", which no row matches at a word's edge, under a plan that said verified while
 *  the .docx masked the name (W7F-1). None of the 21 real files but one has a deletion, and in
 *  it no reading changed. A deletion's own space or tab still reads into the live text, as it
 *  always has: it only adds a break. */
function takePending(state: WalkState, rev: unknown): void {
  if (rev === 'del') { state.pending = state.live ?? ''; return; }
  state.pending = '';
  state.live = '';
}
/** a gap the walk reads before the next item: `pending` gains it, and `live` too outside a deletion */
function addPending(state: WalkState, ctx: WalkCtx, s: string): void {
  state.pending += s;
  if (ctx.flags.rev !== 'del') state.live = (state.live ?? '') + s;
}
/** `parent`: the element whose children are being walked, `tag` its name; `math`: see WalkItem;
 *  `zone`: the stretch of an equation the element prints in (MATH_APART); `inBox`: inside a text
 *  box; `unshown`: inside a phantom that does not show (WalkItem.unshown) */
interface WalkCtx { capture: boolean; inText: boolean; flags: Record<string, any>; inProps: boolean; elem?: Record<string, unknown>; parent?: Record<string, unknown>; tag?: string; math?: Record<string, unknown>; zone?: Record<string, unknown>; inBox?: boolean; unshown?: boolean }
/** A phantom (m:phant) whose m:phantPr/m:show is off prints nothing of its argument: "Kes" + a
 *  phantom + "trel" reads "Kestrel" on the page, and read with the phantom's text between them
 *  the name shipped (W5R-7, 2026-09-23). */
function phantomUnshown(kids: any[]): boolean {
  const pr = (kids || []).find((k: any) => 'm:phantPr' in k);
  const show = pr ? (pr['m:phantPr'] as any[]).find((k: any) => 'm:show' in k) : undefined;
  const v = show ? String((show[':@'] || {})['m:val'] ?? 'on') : 'on';
  return v === '0' || v === 'off' || v === 'false';
}

/** The arguments an equation prints apart from what stands beside them, by the structure that
 *  holds them: a script above or below its base (m:sSub, m:sSup, m:sSubSup, m:sPre), a numerator
 *  over its denominator, a radical's degree and what stands under its sign, an n-ary operator's
 *  limits, a function's argument after its name, a limit under or over its base, a matrix's cells
 *  and an equation array's lines. Each starts a zone of its own (WalkItem.math); the base a script
 *  hangs on stays in line with the text before it. Every other structure — a box, a border box,
 *  a bar, an accent, a group character, a delimiter empty or filled, a phantom — prints its
 *  argument in line with what stands beside it, and the argument stays in the zone around it.
 *  Keyed by the element directly holding each run until 2026-09-23, every one of those split a
 *  zone: "Kes" + a boxed "trel" shipped in the .docx and the .txt under a gate that passed, and
 *  the finish stood (INT-9). */
const MATH_APART: Record<string, Set<string>> = {
  'm:sSub': new Set(['m:sub']), 'm:sSup': new Set(['m:sup']), 'm:sSubSup': new Set(['m:sub', 'm:sup']), 'm:sPre': new Set(['m:sub', 'm:sup']),
  'm:f': new Set(['m:num', 'm:den']), 'm:rad': new Set(['m:deg', 'm:e']), 'm:nary': new Set(['m:sub', 'm:sup']), 'm:func': new Set(['m:e']),
  'm:limLow': new Set(['m:lim']), 'm:limUpp': new Set(['m:lim']), 'm:mr': new Set(['m:e']), 'm:eqArr': new Set(['m:e']),
};

/** Fonts whose codes draw pictures, not letters: a check box (Wingdings F0FE) or an arrow is a
 *  w:sym, and none is text. */
const DINGBAT_FONT = /^(?:Wingdings(?: [23])?|Webdings|(?:ITC )?Zapf ?Dingbats|Marlett|MS Outlook|Bookshelf Symbol \d+|MT Extra|Monotype Sorts|MS Reference Specialty)$/i;
/** What a w:sym draws, as text: '' for a picture. A symbol font's codes are written F000–F0FF,
 *  the font's own 0–255. Symbol draws Greek and mathematics there, and its 0–9 are digits; any
 *  other font's character is text as it stands, F0xx read as its own 0–255. Word writes a w:sym
 *  for what Insert Symbol puts in, and a converter or a generator writes one for any character.
 *  Until 2026-09-24 the walker read none: "6123" + a w:sym "4" + "567" read "6123567" while Word
 *  drew 61234567, and the .docx shipped it whole under a passing check (W-LEAK-4). Symbol's
 *  Greek capitals look like Latin ones (Τ Α Ν) and are read as nothing, as before. */
export function symText(font: string, char: string): string {
  if (!/^[0-9A-Fa-f]{1,6}$/.test(char)) return '';
  const code = parseInt(char, 16);
  const low = code >= 0xf000 && code <= 0xf0ff ? code - 0xf000 : code;
  const f = font.trim();
  if (DINGBAT_FONT.test(f)) return '';
  if (/^Symbol$/i.test(f)) return low >= 0x30 && low <= 0x39 ? String.fromCharCode(low) : '';
  if (low < 0x20 || (low >= 0x7f && low < 0xa0) || (low >= 0xd800 && low <= 0xdfff) || low > 0x10ffff) return '';
  return String.fromCodePoint(low);
}
/** A part written in UTF-16: a byte-order mark, or "<" written as two bytes one of them zero.
 *  XML allows it and Word reads it; this app decodes every part as UTF-8, where it reads as no
 *  XML at all, and was refused as "Malformed XML" until 2026-09-24 (W-LEAK-8). */
export const utf16Part = (u: Uint8Array): boolean => u.length >= 2 && ((u[0] === 0xff && u[1] === 0xfe) || (u[0] === 0xfe && u[1] === 0xff) || (u[0] === 0x3c && u[1] === 0) || (u[0] === 0 && u[1] === 0x3c));
/** A symbol's character that no run's text follows in its paragraph is an item of its own, at
 *  the paragraph's end: `pending` reaches the reading only in front of a next run, and a new
 *  paragraph empties it, so "Margaret Ta" + a w:sym "n" ending the paragraph read "Margaret Ta"
 *  in the .txt, which no row matches, under a plan that said verified. So is one that a run or a
 *  symbol of the other flow follows (a tracked deletion's, or the live text's), which the walk
 *  reads out before it: until 2026-09-24 a deleted "a" between "Margaret T" and "an" read
 *  "Margaret Taan" in the live text, and a live "2" before a deletion read "Ref 61345". A
 *  whitespace before the symbol goes with it, and what the live text wrote there stays for the
 *  live text too (takePending): "Paid Margaret Tan" + " " + a deleted "§" + "and Lee." read
 *  "Paid Margaret Tanand Lee." live, and the .txt shipped the name (W7F-1).
 *  None of the 21 real files has a w:sym. Its node is the w:sym, which the writer never edits:
 *  a part with such a symbol holds (docxWrite, the w:sym check). */
function symEnd(state: WalkState, out: WalkItem[]) {
  const it = state.sym;
  state.sym = undefined;
  if (!it || !state.pending.trim()) return;
  const lead = /^\s*/.exec(state.pending)![0];
  it.text = state.pending.slice(lead.length);
  if (lead) it.pre = lead;
  takePending(state, it.rev);
  out.push(it);
}

function walk(nodes: any[], ctx: WalkCtx, out: WalkItem[], state: WalkState) {
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
        if (ctx.flags.kind === 'field') { if (text.trim()) out.push({ text, ...ctx.flags, node, elem: ctx.elem } as WalkItem); continue; }
        // a whitespace-only run is the gap between its neighbours, not an item (inter-
        // element whitespace of a captureAll part is not even that)
        if (!text.trim()) { if (ctx.inText) addPending(state, ctx, text); continue; }
        // outside a run (a captureAll part: dc:creator, a custom-XML field) each element's
        // text is a value of its own. On one line they fused — custom properties "Kestrel"
        // and "Margaret Tan" read "KestrelMargaret Tan", where neither name has a word
        // boundary, so the mask placed nothing and the .docx writer's gate passed both
        const item: WalkItem = { text, ...ctx.flags, node, elem: ctx.elem, para: ctx.inText ? state.para : ++state.seq } as WalkItem;
        if (ctx.math) item.math = ctx.math;
        if (state.wp) item.wp = state.wp;
        if (ctx.inBox) item.inBox = true;
        if (ctx.unshown) item.unshown = true;
        // an equation's runs render with nothing between them, and a name typed across two of
        // them ("Harrow" "Leung") reads as one word no row matches; each is read as a word of its
        // own. The space is in the reading only — the writer never writes `pre` back.
        if (state.gap) {
          state.gap = false;
          const prev = out[out.length - 1];
          if (!state.pending && prev && prev.para === item.para && !/\s$/.test(prev.text)) { state.pending = ' '; item.gap = true; }
        }
        if (state.sym && (state.sym.rev === 'del') !== (item.rev === 'del')) symEnd(state, out);
        if (state.pending) { item.pre = state.pending; takePending(state, item.rev); state.sym = undefined; }
        out.push(item);
        continue;
      }
      const at = ATTR_TEXT[key];
      if (at) {
        const seen = new Set<string>();
        for (const a of at.attrs) {
          const v = attrs[a];
          if (!v || !String(v).trim() || seen.has(v)) continue;
          seen.add(v);
          out.push({ text: String(v), kind: at.kind, attr: a, node } as WalkItem);
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
          state.sym = { text: '', ...ctx.flags, node, para: state.para } as WalkItem;
          if (state.wp) state.sym.wp = state.wp;
          if (ctx.inBox) state.sym.inBox = true;
        }
      }
      const zone = key === 'm:oMath' || MATH_APART[ctx.tag ?? '']?.has(key) ? node : ctx.zone;
      const next: WalkCtx = { capture: ctx.capture, inText: false, flags: { ...ctx.flags }, inProps: ctx.inProps || /Pr$/.test(key) || key === 'w:tabs', parent: node, tag: key, zone, math: key === 'm:r' ? zone ?? ctx.parent : ctx.math, inBox: ctx.inBox || key === 'w:txbxContent', unshown: ctx.unshown || (key === 'm:phant' && phantomUnshown(node[key])) };
      // revision marks are a FLAG on the run, like `hidden` — never a change of channel.
      // A move is a deletion where the text left and an insertion where it arrived; a
      // row-level mark (w:trPr) covers every cell of the row.
      if (key === 'w:del' || key === 'w:moveFrom') { next.flags.rev = 'del'; next.flags.author = attrs['w:author'] || next.flags.author; }
      if (key === 'w:ins' || key === 'w:moveTo') { next.flags.rev = 'ins'; next.flags.author = attrs['w:author'] || next.flags.author; }
      if (key === 'w:tr') { const rr = rowRevision(node[key]); if (rr) next.flags.rev = rr; }
      if (key === 'w:r' && hasVanish(node[key])) next.flags.hidden = true;
      // a chart's numeric cache holds doubles, not text (see DocxItem.num)
      if (key === 'c:numCache' || key === 'c:numLit' || key === 'cx:numDim') next.flags.num = true;
      if (TEXT_TAGS.has(key)) { next.capture = true; next.inText = true; next.elem = node; }
      if (FIELD_TAGS.has(key)) { next.capture = true; next.inText = true; next.flags.kind = 'field'; next.elem = node; }
      let kids = node[key];
      // Word writes a text box twice — mc:Choice (DrawingML) and mc:Fallback (VML) carry
      // the same runs. Reading both would list every text box twice; read the Choice and
      // only in its absence the Fallback. (The writer removes the Fallback outright.)
      if (key === 'mc:AlternateContent') {
        const choice = (kids as any[]).filter((k) => 'mc:Choice' in k);
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

/** Parse one XML part and walk it: the tree (fast-xml-parser preserveOrder) and the items
 *  in document order, each pointing at its text node. The .docx writer uses this to edit
 *  exactly what the walker read; extractDocx uses it and drops the node references. */
export function walkPart(xml: string, captureAll = false): { tree: any[]; items: WalkItem[] } {
  const tree = parser.parse(xml);
  const items: WalkItem[] = [];
  const state: WalkState = { para: 0, seq: 0, pending: '' };
  walk(tree, { capture: captureAll, inText: false, flags: {}, inProps: false }, items, state);
  symEnd(state, items);
  return { tree, items };
}

/** Walk an already-parsed (and possibly edited) tree — the .docx writer's second look at
 *  a part after its structural pass. */
export function walkTree(tree: any[], captureAll = false): WalkItem[] {
  const items: WalkItem[] = [];
  const state: WalkState = { para: 0, seq: 0, pending: '' };
  walk(tree, { capture: captureAll, inText: false, flags: {}, inProps: false }, items, state);
  symEnd(state, items);
  return items;
}

/** The relationships part beside a document part: every TargetMode="External" target is
 *  text the reader never sees — a mailto: behind a name, the path of the template the
 *  file was made from, the address of a linked data source. */
export function externalTargets(xml: string): string[] {
  const out: string[] = [];
  (function find(nodes: any[]) {
    for (const node of nodes) {
      const attrs = node[':@'] || {};
      if (node['Relationship'] && attrs.TargetMode === 'External' && attrs.Target) out.push(String(attrs.Target));
      for (const k of Object.keys(node)) if (k !== ':@' && k !== '#text') find(node[k]);
    }
  })(parser.parse(xml));
  return out;
}

function extractComments(xml: Uint8Array) {
  const tree = parser.parse(td.decode(xml));
  const out: any[] = [];
  (function find(nodes: any[]) {
    for (const node of nodes) {
      if (node['w:comment']) {
        const author = (node[':@'] || {})['w:author'] || 'unknown';
        const texts: WalkItem[] = [];
        const state: WalkState = { para: 0, seq: 0, pending: '' };
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

export const RULES: Array<{ re: RegExp; kind: string; captureAll?: boolean; rels?: boolean }> = [
  { re: /^word\/document\.xml$/, kind: 'body' },
  { re: /^word\/header\d+\.xml$/, kind: 'header' },
  { re: /^word\/footer\d+\.xml$/, kind: 'footer' },
  { re: /^word\/footnotes\.xml$/, kind: 'footnote' },
  { re: /^word\/endnotes\.xml$/, kind: 'endnote' },
  { re: /^word\/comments\.xml$/, kind: 'comments' },
  { re: /^word\/glossary\/document\.xml$/, kind: 'glossary' },
  { re: /^word\/charts\/chart\d+\.xml$/, kind: 'chart' },
  // an Office 2016 chart (waterfall, treemap, funnel …), and a text box drawn on a chart (Chart
  // Tools > Insert > Text Box, the chart's user shapes): chart text like any other, listed as
  // unrecognized until 2026-09-23 and so read by nothing
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
// a certificate, not text: listed as unrecognized it made the reading incomplete for a part the
// writer removes with the macros
const BINARY_RE = /^(word\/(vbaProject\.bin|vbaProjectSignature(?:Agile|V3)?\.bin|embeddings\/|media\/|fonts\/|activeX\/)|docProps\/thumbnail)/;
// intelligence.xml holds Editor word hashes, LabelInfo.xml the sensitivity-label ids: no
// readable text (checked on the 2026-09-13 trial files), listed as structure. Anchored at both
// ends, and a folder of relationships only for its .rels parts: open at the end,
// word/styles.xml.bak, word/theme/theme1.xml.orig and word/charts/_rels/notes.xml were each
// listed as Word's own and the reading called complete (W5R-8, W-FID-7, 2026-09-23).
export const STRUCTURAL_RE = /^(?:\[Content_Types\]\.xml|_rels\/[^/]*\.rels|word\/(?:glossary\/)?(?:styles\.xml|stylesWithEffects\.xml|fontTable\.xml|webSettings\.xml|theme\/theme\d+\.xml|theme\/themeOverride\d+\.xml|numbering\.xml|settings\.xml)|word\/glossary\/_rels\/[^/]*\.rels|word\/comments(?:Extended|Ids|Extensible)\.xml|word\/intelligence\.xml|docMetadata\/LabelInfo\.xml|word\/charts\/(?:style|colors)\d+\.xml|word\/charts\/_rels\/[^/]*\.rels|word\/drawings\/_rels\/[^/]*\.rels|word\/diagrams\/(?:layout|quickStyle|colors)\d+\.xml|word\/diagrams\/_rels\/[^/]*\.rels|customXml\/itemProps\d+\.xml|customXml\/_rels\/[^/]*\.rels)$/;

export async function extractDocx(buf: Uint8Array): Promise<DocxResult> {
  const zip = await readZip(buf);
  const items: DocxItem[] = [];
  const inventory = { scanned: [] as string[], structural: [] as string[], binaryFlagged: [] as string[], unrecognized: [] as string[], invalid: [] as string[] };
  // refused as the rest are, and said truly: Word reads these (utf16Part)
  const wide = new Set<string>();

  for (const name of zip.names) {
    if (name.endsWith('/')) continue;
    const rule = RULES.find((r) => r.re.test(name));
    if (rule) {
      const data = await zip.read(name);
      if (!data) continue;
      // fast-xml-parser parses truncated/corrupt XML best-effort and silently drops
      // text — validate first so a malformed part is refused loudly, never half-read.
      const xml = td.decode(data);
      if (XMLValidator.validate(xml) !== true) {
        inventory.invalid.push(name);
        if (utf16Part(data)) wide.add(name);
        continue;
      }
      inventory.scanned.push(name);
      if (rule.rels) {
        items.push(...externalTargets(xml).map((t) => ({ part: name, kind: 'link', text: t })));
      } else if (rule.kind === 'comments') {
        items.push(...extractComments(data).map((x) => ({ part: name, ...x })));
      } else {
        for (const w of walkPart(xml, !!rule.captureAll).items) {
          const { node: _node, elem: _elem, math: _math, gap: _gap, unshown: _unshown, ...rest } = w;
          items.push({ part: name, ...rest, kind: rest.kind || rule.kind });
        }
      }
    } else if (BINARY_RE.test(name)) inventory.binaryFlagged.push(name);
    else if (STRUCTURAL_RE.test(name)) inventory.structural.push(name);
    else inventory.unrecognized.push(name);
  }

  return {
    items: items.filter((i) => i.text && i.text.trim()),
    inventory,
    complete: inventory.unrecognized.length === 0 && inventory.invalid.length === 0,
    warnings: [
      ...inventory.invalid.map((p) => wide.has(p) ? `Written in UTF-16, which Word reads and this app does not — part refused, not read: ${p}` : `Malformed XML — part refused, not read: ${p}`),
      ...inventory.binaryFlagged.map((p) => `Embedded binary present, not scanned: ${p}`),
      ...inventory.unrecognized.map((p) => `Unrecognized part not scanned: ${p}`),
    ],
  };
}
