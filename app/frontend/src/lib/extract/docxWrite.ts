// The redacted .docx: the ORIGINAL package, rewritten in place (2026-09-13, Step 4).
//
// Every text part the walker reads (docx.ts) is parsed, stripped of what a reader never
// sees (tracked changes, hidden runs, comments, field codes, content-control plumbing,
// alt-text, macros, embedded objects, custom XML, properties), then its readable flow —
// the SAME string flowText() gives the store, so an offset in one is an offset in the
// other — is masked by the mask function the Export screen hands in (remask over the
// review table). A placement is written back into the runs it covers: the tag replaces
// the covered text of the first run, the covered text of every later run is removed.
//
// Fail-closed at every point that could otherwise fail quietly: an unreadable or
// malformed part, a mask that could not certify itself (divergence), a part whose
// masked flow the writer could not reproduce byte for byte, or a leak in the re-walk
// of the OUTPUT (every channel masked again must place nothing) — each of these holds
// the file: `bytes` is null and `held` says why. Nothing here calls the engine. The caller
// hands in one mask for every part: the body's findings, the names the engine found only in
// the headers, footers, footnotes, endnotes, charts and SmartArt when it read that text in a
// request of its own (lib/side.ts, owner ruling 27), the user's always-redact list and the
// structured floor (engine.ts docxMaskTable folds them together). Whether the engine read
// that text, and why not when it did not, is the caller's to say (Export.tsx sideScope).
//
// The gate reads EVERY part of the output, not only the parts the walker lists (2026-09-23).
// Until then the style, numbering, theme, font and settings parts, and every attribute the
// walker does not list, were copied or kept unread: a declared term shipped in a character
// style's name, a table style, a header's paragraph style, a list's number text, a chart's
// trendline, a theme or font name and the sensitivity-label record while the gate reported
// nothing. Now every element's text, every attribute value, every part name and every
// relationship target of the output is read against the same mask; the realistic places a
// name lives in those parts are masked or renamed on the way out; and a part nothing can
// read as text (a font, an embedded workbook, an object) is removed with a note the receipt
// states, or holds the file by name.
//
// Every string handed to the mask is FULLWIDTH-FOLDED first (lib-core foldFullwidth, the
// function the engine runs before it reads a word): the table's spans were found in folded
// text, so a flow masked raw never matches a name typed with a CJK IME in full-width mode.
// Until 2026-09-23 the writer masked the raw flow, and "ＫＥＳＴＲＥＬ" shipped readable in
// the body and header of the .docx while the .txt masked it and the gate, masking raw too,
// passed the file. The fold is one UTF-16 unit for one, so the placements it yields sit at
// the same offsets in the raw runs, and only the covered characters change.
import { XMLBuilder, XMLValidator } from 'fast-xml-parser';
import { foldFullwidth } from '../../../../../lib-core/anonymize.mjs';
import { HTML_ENTITY } from './htmlEntities';
import { readZip, walkPart, walkTree, flowLayout, hasVanish, rowRevision, utf16Part, symText, RULES, type WalkItem } from './docx';

const fold = (s: string): string => foldFullwidth(s) as string;

export interface MaskInterval { s: number; e: number; tag: string }
/** structurally what engine.ts remask() returns; the writer never imports the engine */
export interface MaskResult {
  text: string;
  placements: MaskInterval[];
  floorHits: Array<MaskInterval & { exempt: boolean }>;
  divergence: string | null;
}
/** `names`: the spans the mask's table places (engine.ts exportPlan attaches them), read against
 *  an identifier with nothing between its words (refCarries). A mask without them is read
 *  through the mask alone. */
export type MaskFn = ((text: string) => MaskResult) & { names?: readonly string[] };

export interface WriteOptions {
  mask: MaskFn;
  /** images and embedded pictures are binary the walker cannot read — a scanned page,
   *  a signature. Default false: they are removed and counted. */
  keepImages?: boolean;
}

/** `tags`: every distinct tag actually WRITTEN into this channel's output — the name keys
 *  list a tag the .docx carries from here, and never from a search of their own. Channel
 *  'layout' is the style, numbering, theme, font and settings-like parts (masked in their
 *  attributes, no flow); 'other' is a part the writer does not know, read by the gate and
 *  never masked. */
export interface ChannelReport { parts: number; items: number; masked: number; chars: number; tags: string[] }
export interface WriteReport {
  /** the redacted package, or null when held */
  bytes: Uint8Array | null;
  /** why the file is held (null when bytes is present) */
  held: string | null;
  parts: { written: string[]; copied: string[]; dropped: string[] };
  /** per walker channel of the OUTPUT: parts, text items, tags written, chars of flow */
  channels: Record<string, ChannelReport>;
  removed: {
    deletions: number; insertionsUnwrapped: number; hiddenRuns: number; comments: number;
    fieldsUnlinked: number; fieldsRemoved: number; fieldsKept: number; hyperlinks: number;
    controls: number; images: number; objects: number; altTexts: number; externalLinks: number;
    revisionMarks: number; permissions: number; settings: number; properties: number; danglingRefs: number;
    /** chart numeric values replaced by 0 because the number itself placed (an ID or a
     *  phone number plotted as a value) — a tag cannot live inside a double */
    chartValuesZeroed: number;
    /** shape names replaced by a neutral "Object N" (a DrawingML name, or a VML shape's id),
     *  and the bookmarks the author made renamed bm1, bm2 … (with the internal links and kept
     *  fields that point at them) */
    names: number;
    /** a VML shape's hidden second copy of itself (o:gfxdata): not an embedded object, and
     *  counted apart so the receipt's "embedded objects" counts what the author inserted */
    shapeCopies: number;
    /** styles renamed "Redacted style N" because the name, the id or an alias placed, with
     *  every paragraph, run, table, list and field that uses them */
    styles: number;
  };
  /** the re-walk of the output: parts read (every one), text items and attribute values read,
   *  and what leaked */
  gate: { parts: number; items: number; values: number; leaks: string[] };
  /** what was removed whole and why, one plain sentence per kind the file had — for the
   *  receipt: a lawyer sending the copy is owed the sentence, not a part name */
  notes: string[];
  warnings: string[];
  /** every flow the writer masked, as it masked it (WriterFlow): what a finish measures a saved
   *  flow by (savedFlowText), under any table, without writing the file again */
  flows: WriterFlow[];
}

/** One flow as the writer masks it. `record` is the part's readable text as the document of
 *  record has it — the hidden runs and the results of the fields the writer removes still in
 *  it — folded; `pieces` are the stretches of it the saved file keeps, in order, each with the
 *  spacing and paragraph the saved file gives it. The table is placed over `record` and the
 *  pieces are what ships of it (placeFlow). */
export interface FlowPiece { s: number; e: number; pre?: string; para?: number }
export interface WriterFlow { part: string; kind: string; record: string; pieces: FlowPiece[] }

type XNode = Record<string, any>;
const tagOf = (n: XNode): string | undefined => { for (const k in n) if (k !== ':@') return k; return undefined; };

// ---------- what a field instruction means for the output ----------
/** fields whose instruction carries no text of the author's and whose result must stay live */
export const KEEP_FIELD = /^\s*(PAGE|NUMPAGES|SECTIONPAGES|SECTION|TOC|SEQ|STYLEREF|NOTEREF|PAGEREF|SYMBOL|LISTNUM|AUTONUM|AUTONUMLGL|AUTONUMOUT)\b/i;
/** fields whose cached RESULT is identity or external content: result goes too */
/** a HYPERLINK field that jumps to a bookmark (\l "Schedule_2"): unlinked like every HYPERLINK,
 *  and counted, because the copy's link no longer goes anywhere */
const INTERNAL_LINK = /^\s*HYPERLINK\b.*?(?:^|\s)\\l(?=[\s"]|$)/is;
const REMOVE_FIELD = /^\s*(AUTHOR|USERNAME|USERINITIALS|USERADDRESS|LASTSAVEDBY|FILENAME|TEMPLATE|DOCPROPERTY|INFO|COMMENTS|KEYWORDS|SUBJECT|TITLE|INCLUDEPICTURE|INCLUDETEXT|LINK|DDE|DDEAUTO|IMPORT|DATABASE|RD)\b/i;
// everything else (HYPERLINK, MERGEFIELD, REF, DATE, =, FORMTEXT, …) is UNLINKED: the
// instruction goes, the result stays as plain text and is masked with the flow

/** elements that are revision plumbing, comment anchors, permission ranges, or the
 *  attribute-text carriers the walker lists as control/variable/people/task channels. The
 *  custom-XML revision ranges carry the reviewer's name in w:author like any tracked change. */
const DROP_TAGS = new Set([
  'w:moveFromRangeStart', 'w:moveFromRangeEnd', 'w:moveToRangeStart', 'w:moveToRangeEnd',
  'w:commentRangeStart', 'w:commentRangeEnd',
  'w:rPrChange', 'w:pPrChange', 'w:sectPrChange', 'w:tblPrChange', 'w:tblPrExChange', 'w:trPrChange',
  'w:tcPrChange', 'w:tblGridChange', 'w:numberingChange', 'w:cellIns', 'w:cellDel', 'w:cellMerge',
  'w:customXmlInsRangeStart', 'w:customXmlInsRangeEnd', 'w:customXmlDelRangeStart', 'w:customXmlDelRangeEnd',
  'w:customXmlMoveFromRangeStart', 'w:customXmlMoveFromRangeEnd', 'w:customXmlMoveToRangeStart', 'w:customXmlMoveToRangeEnd',
  'w:alias', 'w:tag', 'w:listItem', 'w:listEntry', 'w:docVar', 'w15:person', 't:Attribution', 't:Assign', 't:SetTitle',
]);
const PERM_TAGS = new Set(['w:permStart', 'w:permEnd']);
/** attribute alt-text on drawings and VML shapes: blanked, never masked (the engine never read
 *  it). Every non-visual-properties element carries it, whatever its prefix: wp:docPr and the
 *  a:/pic: pair were listed until 2026-09-23, and a text box's wps:cNvPr (and a group's wpg:)
 *  shipped its description readable under a receipt that said alt-text was removed. A VML shape
 *  carries it on whichever shape element Word wrote (v:rect and v:oval as well as v:shape), and
 *  a DrawingML click-link carries a tooltip. */
const NV_PROPS = /^[\w]+:(cNvPr|docPr)$/;
const VML_ALT = ['alt', 'title', 'o:title'];
const altAttrsOf = (tag: string): string[] | undefined =>
  NV_PROPS.test(tag) ? ['title', 'descr'] : tag.startsWith('v:') ? VML_ALT : tag === 'a:hlinkClick' || tag === 'a:hlinkHover' ? ['tooltip'] : undefined;
/** a VML shape's link and a picture's ORIGINAL path ("file:///C:/Users/<name>/…/Kestrel logo.png"):
 *  removed like a relationship's external target */
const VML_LINK = ['href', 'o:href', 'target', 'src'];
/** Table alt-text (Table Properties > Alt Text) is an ELEMENT with a required w:val, so it
 *  goes whole rather than leaving an attribute-less element Word would call damaged. */
const TABLE_ALT = new Set(['w:tblCaption', 'w:tblDescription']);
/** A shape's name is what the Selection Pane lists — "Picture 3" by default, "Kestrel logo"
 *  once someone renames it, and for a picture its source file name. The engine never read it,
 *  so it is not masked but replaced, like alt-text; the name is required, so it becomes a
 *  neutral one rather than going. */
const neutralName = (attrs: Record<string, string>) => `Object ${attrs.id ?? ''}`.trim();
/** Bookmark names: every one the AUTHOR made is renamed, in document order, bm1, bm2 … (a
 *  hidden one, whose name starts with an underscore, _bm1 …), and every internal link, form
 *  field and kept field instruction that points at it follows. Until 2026-09-23 a name was
 *  renamed only when it read as something the table masks, and each review found another way
 *  a name is written that the reading missed: glued words, a capital inside a word, a matter
 *  number that is digits alone. A bookmark name is never on the page and a neutral one costs a
 *  reader nothing, so no name is read to decide.
 *
 *  The names Word generates itself — a table of contents (_Toc), a cross-reference (_Ref), a
 *  heading link (_Hlk), the last edit (_GoBack) — are a fixed prefix and random digits, hold
 *  no one's name and are what the contents' PAGEREF fields point at; they keep their names.
 *  The gate blanks them, and the neutral names, before the safety-net pattern reads a field:
 *  " PAGEREF _Toc462382735 \h " read as "_Toc[phone]" and held every document with a table of
 *  contents (measured 2026-09-23). Read without regard to case, as Word matches a link to its
 *  bookmark: a link written "_TOC462382735" to the bookmark "_Toc462382735" was renamed _bm1
 *  while the bookmark kept its name, and the link pointed nowhere. */
export const WORD_BOOKMARK = /^_(?:(?:Toc|Ref|Hlk)\d+|GoBack)$/i;
export const NEUTRAL_REF = /^_?bm\d+$/;
/** The other names a kept field carries, renamed like a bookmark and for the same reason — a
 *  reading of the name never decides whether it ships: a caption label (SEQ's counter, "Exhibit"
 *  in "Exhibit 3", the label Insert Caption offers) becomes Label1, Label2 …, and a list
 *  definition's name (LISTNUM's list) List1, List2 …. Neither is on the page: the numbers are.
 *  Word's own labels and lists keep their names. Until 2026-09-23 " SEQ Kestrel_Exhibit " and a
 *  list named after the client held the file with no way through: Word shows neither name. */
export const NEUTRAL_NAME = /^(?:List|Label)\d+$/;
const WORD_LABEL = /^(?:Figure|Table|Equation)$/i;
const WORD_LIST = /^(?:LegalDefault|NumberDefault|OutlineDefault)$/i;
const SETTINGS_DROP = new Set(['w:docVars', 'w:rsids', 'w:mailMerge', 'w:attachedTemplate', 'w:attachedSchema', 'w:saveThroughXslt', 'w:trackRevisions', 'w:revisionView', 'w:documentProtection', 'w:writeProtection', 'sl:schemaLibrary']);
const CORE_KEEP = new Set(['dcterms:created', 'dcterms:modified', 'dc:language', 'cp:revision']);
// app.xml keeps its boolean flags only: Company/Manager/Template/HLinks name people and
// paths, the statistics (Words, Characters, TotalTime …) describe the ORIGINAL — and a
// seven-digit character count reads as a phone number to the floor — and even
// "Microsoft Office Word" is text a table row can claim (trial file 10 was held on a
// row reading "Office", stress file 12 on a character count, 2026-09-13)
const APP_KEEP = new Set(['DocSecurity', 'ScaleCrop', 'LinksUpToDate', 'SharedDoc', 'HyperlinksChanged']);
/** attributes that name a relationship; an element pointing at a dropped one goes */
export const R_ATTRS = ['r:id', 'r:embed', 'r:link', 'r:href', 'r:pict', 'r:dm', 'r:lo', 'r:qs', 'r:cs'];
const PICTURE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

/** Parts that go whole, each with the sentence the receipt states for it. A part nothing can
 *  read as text is here unless it is a picture the user chose to keep: a font file's name table
 *  records who made it, an embedded workbook holds the chart's unredacted source data, and an
 *  object can be any file at all. Fonts were kept until 2026-09-23 and copied unread. */
const DROP_KINDS: Array<{ re: RegExp; note: string }> = [
  { re: /^word\/(comments(Extended|Ids|Extensible)?\.xml|people\.xml)$/, note: 'Comments and the list of people who reviewed the file were removed, and every tracked change was accepted or taken out, so no reviewer\'s name or initials is in the copy.' },
  { re: /^(customXml\/|docProps\/custom\.xml$)/, note: 'Custom properties and custom XML were removed: they hold what a document-management system files the document under (client, matter, author), and no engine read them.' },
  { re: /^word\/glossary\//, note: 'Building blocks saved inside the file (Quick Parts, AutoText, cover pages) were removed: they are not part of the document and can carry another matter\'s text.' },
  // the sentence depends on what the files belonged to (embedNote)
  { re: /^word\/embeddings\//, note: 'Embedded files were removed.' },
  { re: /^word\/fonts\//, note: 'Fonts embedded in the file were removed; where the recipient does not have one, Word shows a substitute. A font file cannot be read for names, and its own name table records who made it.' },
  { re: /^docMetadata\//, note: 'The sensitivity-label record was removed: it carries the firm\'s Microsoft 365 tenant ID. The recipient\'s Office will not show the label.' },
  // a signed macro project carries its signature beside it (vbaProjectSignature.bin, and the
  // Agile and V3 forms newer Office writes): the signer's certificate names a person or the
  // firm, and it held the file as "a part nothing can read" with the macros already gone
  { re: /^(word\/(vbaProject\.bin|vbaProjectSignature(?:Agile|V3)?\.bin|vbaData\.xml|activeX\/|customizations\.xml|attachedToolbars\.bin|webextensions\/)|customUI\/)/, note: 'Macros, ActiveX controls, toolbar customizations and add-ins were removed.' },
  { re: /^word\/(intelligence\d*\.xml|documenttasks\/)/, note: 'Word\'s Editor data and assigned tasks were removed.' },
  { re: /^word\/printerSettings\//, note: 'The saved printer settings were removed: they name the printer and can carry a user name.' },
  { re: /^word\/recipientData\.xml$/, note: 'The mail-merge recipient list was removed.' },
  { re: /^word\/ink\//, note: 'Ink (handwriting drawn in Word) was removed, as a picture is.' },
  { re: /^_xmlsignatures\//, note: 'Digital signatures were removed: a signature cannot survive a change to the file.' },
  { re: /^docProps\/thumbnail\./, note: 'The preview picture of the first page was removed.' },
  // what an older Office left of earlier saves: no relationship points at it and Word never
  // shows it, and it held the file as "a part nothing can read" with advice to delete an
  // object that does not exist (2026-09-23)
  { re: /^\[trash\]\//, note: 'Leftover pieces of earlier saves, which Word keeps inside the file and never shows, were removed.' },
];
/** What the embedded files belonged to decides what the recipient loses: a chart keeps its
 *  values and loses Edit Data; an object inserted into the text is gone from the page. One
 *  sentence said "the spreadsheet behind each chart" over a file whose only embedding was a
 *  worksheet pasted as an object (2026-09-23). */
function embedNote(owners: Set<'chart' | 'object'>): string {
  const chart = owners.has('chart'), object = owners.has('object');
  const what = chart && object
    ? 'the spreadsheet behind each chart (the charts still show their values, but Edit Data will not open), and each object inserted into the text (Insert > Object: a worksheet, a document, any file), which is gone from the page'
    : chart ? 'the spreadsheet behind each chart: the charts still show their values, but Edit Data will not open'
      : object ? 'each object inserted into the text (Insert > Object: a worksheet, a document, any file) is gone from the page, and nothing stands where it stood'
        : 'nothing in the document pointed at them';
  return `Embedded files were removed: ${what}. Nothing here can read inside an embedded file.`;
}
export const MEDIA_RE = /^word\/(theme\/)?media\//;
/** parts with no flow, masked in their attributes and read whole by the gate. A chart's theme
 *  override is a theme. */
export const LAYOUT_RE = /^(word\/(styles|stylesWithEffects|fontTable|webSettings|numbering)\.xml|word\/theme\/(theme|themeOverride)\d+\.xml|word\/charts\/(style|colors)\d+\.xml|word\/diagrams\/(layout|quickStyle|colors)\d+\.xml)$/;
const MAIN_TYPES = new Set([
  'application/vnd.ms-word.document.macroEnabled.main+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml',
  'application/vnd.ms-word.template.macroEnabledTemplate.main+xml',
]);
const DOCUMENT_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

// ---------- text in attributes and in elements the walker does not list ----------
/** 'text': masked like a run, by the table and the safety-net pattern. 'name': the value is
 *  also syntax Word parses (a number format), so the table's rows only. 'ident': a name Word
 *  looks up by its whole spelling (a font, a theme, a colour), replaced whole by a neutral one
 *  when any reading of it places (identValue). */
export type Mode = 'text' | 'name' | 'ident';
export const FACE: Record<string, [Mode, string]> = { typeface: ['ident', 'a font name'] };
export const F: [Mode, string] = ['ident', 'a font name'];
/** Text an author typed, or a reader sees, in an ATTRIBUTE: masked in place. Each was kept
 *  unread until 2026-09-23 and each can carry a client's or the firm's name: a watermark
 *  ("PROJECT KESTREL – STRICTLY CONFIDENTIAL", Design > Watermark > Custom text, printed across
 *  every page), a list's number text ("Kestrel Schedule %1."), a form field's help text, a
 *  theme or a font named after the firm, a number format that quotes a name ('"Kestrel "#,##0').
 *  Masked, not blanked, because the rest of the value is what the page needs. The second entry
 *  is how a hold names the place. A VML shape's style is CSS and is read declaration by
 *  declaration (vmlStyle); a caption label is renamed with the field that counts it (labelName). */
export const ATTR_MASK: Record<string, Record<string, [Mode, string]>> = {
  'v:textpath': { string: ['text', 'a watermark'] },
  'w:lvlText': { 'w:val': ['text', 'a list\'s number text'] },
  'w:helpText': { 'w:val': ['text', 'a form field\'s help text'] },
  'w:statusText': { 'w:val': ['text', 'a form field\'s status-bar text'] },
  'w:default': { 'w:val': ['text', 'a form field\'s default text'] },
  'a:theme': { name: ['ident', 'a theme name'] }, 'a:clrScheme': { name: ['ident', 'a theme name'] },
  'a:fontScheme': { name: ['ident', 'a theme name'] }, 'a:fmtScheme': { name: ['ident', 'a theme name'] },
  'thm15:themeFamily': { name: ['ident', 'a theme name'] }, 'a:custClr': { name: ['ident', 'a colour name'] },
  'a:latin': FACE, 'a:ea': FACE, 'a:cs': FACE, 'a:font': FACE, 'a:sym': FACE, 'a:buFont': FACE,
  'w:rFonts': { 'w:ascii': F, 'w:hAnsi': F, 'w:cs': F, 'w:eastAsia': F },
  'w:font': { 'w:name': F }, 'w:altName': { 'w:val': F }, 'w:sym': { 'w:font': F }, 'm:mathFont': { 'm:val': F },
  'c:numFmt': { formatCode: ['name', 'a number format'] },
  'cx:numFmt': { formatCode: ['name', 'a number format'] },
  // an Office 2016 chart's data column is named on its level (the walker lists it: docx.ts
  // ATTR_TEXT); a party's name there held the file with no way through in Word (W5-7)
  'cx:lvl': { formatCode: ['name', 'a number format'], name: ['text', 'a chart\'s data column name'] },
  // Insert > Signature Line: the signer's name, title and address, printed under the line
  'o:signatureline': { 'o:suggestedsigner': ['text', 'a signature line'], 'o:suggestedsigner2': ['text', 'a signature line'], 'o:suggestedsigneremail': ['text', 'a signature line'], 'o:signinginstructions': ['text', 'a signature line'] },
  'dgm:title': { val: ['text', 'a SmartArt layout\'s title'] }, 'dgm:desc': { val: ['text', 'a SmartArt layout\'s description'] },
};
/** chart text held as an element's text that the walker does not list: a trendline's name is
 *  printed in the legend, a data label's separator between its parts, a number format's quoted
 *  literal beside every value */
export const ELEM_MASK: Record<string, [Mode, string]> = {
  'c:name': ['text', 'a trendline name'], 'c:separator': ['text', 'a data-label separator'], 'c:formatCode': ['name', 'a number format'],
};
/** elements whose w:val is a style id */
export const STYLE_REFS = new Set(['w:pStyle', 'w:rStyle', 'w:tblStyle', 'w:basedOn', 'w:next', 'w:link', 'w:numStyleLink', 'w:styleLink', 'w:defaultTableStyle', 'w:clickAndTypeStyle']);

/** Fonts that come with Windows, macOS or Office (the theme's script fonts among them), the
 *  theme's references to its own fonts (+mj-lt, +mn-ea …) and Office's theme names: what every
 *  reader's machine already has, never the firm's or a client's. A row reads like one often
 *  enough — "Roman" and "Georgia" are surnames — and until 2026-09-23 "Times New Roman" was
 *  masked into "Times New [Person2]", a font no machine has, on every run it set. A name not
 *  listed here that places is renamed, which costs the recipient a substitute font. */
export const STANDARD_FONT = new RegExp(`^(?:${[
  '\\+(?:mj|mn)-(?:lt|ea|cs)',
  'Office(?: Theme)?', 'Office \\d{4}(?: ?- ?\\d{4})?(?: Theme)?', 'Office Classic(?: 2)?',
  'Agency FB', 'Aharoni', 'Algerian', 'Andalus', 'Angsana(?:UPC| New)', 'Aparajita', 'Aptos(?: Display| Narrow| Serif| Mono| Black| ExtraBold| Light| SemiBold)?',
  'Arabic Typesetting', 'Arial(?: Black| Narrow| Rounded MT Bold| Unicode MS)?', 'Bahnschrift(?: (?:Light|SemiLight|SemiBold|Condensed|SemiCondensed)){0,2}', 'Batang(?:Che)?', 'Baskerville(?: Old Face)?',
  'Bell MT', 'Bierstadt', 'Book Antiqua', 'Bookman Old Style', 'Browallia(?:UPC| New)', 'Calibri(?: Light)?', 'Californian FB', 'Cambria(?: Math)?', 'Candara(?: Light)?',
  'Cascadia (?:Code|Mono)', 'Century(?: Gothic| Schoolbook)?', 'Comic Sans MS', 'Consolas', 'Constantia', 'Cooper Black', 'Copperplate Gothic(?: Bold| Light)?', 'Corbel(?: Light)?',
  'Cordia(?:UPC| New)', 'Courier(?: New)?', 'DaunPenh', 'David', 'DengXian(?: Light)?', 'DFKai-SB', 'DilleniaUPC', 'DokChampa', 'Dotum(?:Che)?', 'Ebrima', 'Estrangelo Edessa',
  'EucrosiaUPC', 'Euphemia', 'FangSong', 'Franklin Gothic(?: Book| Demi| Demi Cond| Heavy| Medium| Medium Cond)?', 'FrankRuehl', 'FreesiaUPC', 'Gabriola', 'Gadugi', 'Garamond',
  'Gautami', 'Georgia', 'Gill Sans(?: MT)?', 'Gisha', 'Grandview(?: Display)?', 'Gulim(?:Che)?', 'Gungsuh(?:Che)?', 'Helvetica(?: Neue)?', 'HoloLens MDL2 Assets', 'Impact',
  'Ink Free', 'IrisUPC', 'Iskoola Pota', 'JasmineUPC', 'Javanese Text', 'KaiTi', 'Kalinga', 'Kartika', 'Khmer UI', 'KodchiangUPC', 'Kokila', 'Lao UI', 'Latha', 'Leelawadee(?: UI)?(?: Semilight)?',
  'Levenim MT', 'LilyUPC', 'Lucida (?:Bright|Console|Fax|Grande|Handwriting|Sans|Sans Typewriter|Sans Unicode)', 'Malgun Gothic(?: Semilight)?', 'Mangal', 'Marlett', 'Meiryo(?: UI)?',
  'Microsoft (?:Himalaya|JhengHei(?: UI)?(?: Light)?|New Tai Lue|PhagsPa|Sans Serif|Tai Le|Uighur|YaHei(?: UI)?(?: Light)?|Yi Baiti)', 'MingLiU(?:-ExtB|_HKSCS(?:-ExtB)?)?',
  'Miriam(?: Fixed)?', 'Mongolian Baiti', 'MoolBoran', 'MS (?:Gothic|Mincho|PGothic|PMincho|Reference Sans Serif|Reference Specialty|UI Gothic)', 'MT Extra', 'MV Boli', 'Myanmar Text',
  'Narkisim', 'Nirmala UI(?: Semilight)?', 'NSimSun', 'Nyala', 'Palatino(?: Linotype)?', 'Perpetua', 'Plantagenet Cherokee', 'PMingLiU(?:-ExtB)?', 'Raavi', 'Rockwell(?: Condensed)?', 'Rod',
  'Sakkal Majalla', 'Seaford(?: Display)?', 'Segoe (?:Fluent Icons|MDL2 Assets|Print|Script|UI(?: Black| Emoji| Historic| Light| Semibold| Semilight| Symbol| Variable)?)', 'Shonar Bangla', 'Shruti',
  'SimHei', 'Simplified Arabic(?: Fixed)?', 'SimSun(?:-ExtB)?', 'Sitka(?: Banner| Display| Heading| Small| Subheading| Text)?', 'Skeena(?: Display)?', 'Sylfaen', 'Symbol', 'Tahoma',
  'Tenorite(?: Display)?', 'Times(?: New Roman)?', 'Traditional Arabic', 'Trebuchet MS', 'Tunga', 'Tw Cen MT(?: Condensed)?', 'Urdu Typesetting', 'Utsaah', 'Vani', 'Verdana', 'Vijaya',
  'Vrinda', 'Webdings', 'Wingdings(?: [23])?', 'Yu Gothic(?: UI)?(?: Light| Medium| Semibold| Semilight)?', 'Yu Mincho(?: Demibold| Light)?',
  'ＭＳ (?:ゴシック|明朝|Ｐゴシック|Ｐ明朝)', '游(?:ゴシック|明朝)(?: Light)?', '宋体', '新宋体', '黑体', '楷体', '仿宋', '等线(?: Light)?', '微软雅黑', '新細明體', '細明體', '標楷體', '微軟正黑體',
  '맑은 고딕', '바탕', '굴림', '돋움', '궁서',
].join('|')})$`, 'i');
/** the neutral names identValue gives: a later reading of the output must not take them for
 *  the author's own, and a file saved twice must not receive the same one for two names */
export const NEUTRAL_IDENT = /^Redacted (?:font|theme|colour) \d+$/;
const IDENT_NOUN: Record<string, string> = { 'a font name': 'font', 'a theme name': 'theme', 'a colour name': 'colour' };

/** Word's built-in style names, as w:name writes them (Word matches them without regard to
 *  case). A built-in style is Word's vocabulary, not the author's: "Strong", "Title" and "Quote"
 *  read as surnames and common words, and until 2026-09-23 a row "Strong", or an alias the author
 *  gave "Heading 1", renamed the built-in "Redacted style N" in the recipient's Styles pane. Its
 *  name never places; an alias that places goes on its own. */
export const BUILTIN_STYLE = new RegExp(`^(?:${[
  'Normal(?: \\(Web\\)| Indent| Table)?', '(?:heading|toc|index) [1-9]', 'Title', 'Subtitle', '(?:Intense )?Quote', 'Caption', 'TOC Heading', 'header', 'footer',
  '(?:footnote|endnote) (?:text|reference)', 'annotation (?:text|reference|subject)', 'Comment (?:Text|Reference|Subject)', 'Balloon Text', '(?:page|line) number', 'macro', 'Macro Text',
  'toa heading', 'table of (?:authorities|figures)', 'envelope (?:address|return)', 'index heading', 'Hyperlink', 'FollowedHyperlink', 'Strong', 'Emphasis', 'Default Paragraph Font',
  'No List', 'No Spacing', 'List Paragraph', 'Placeholder Text', 'Revision', '(?:Subtle|Intense) (?:Emphasis|Reference)', 'Book Title', 'Bibliography', 'Plain Text', 'Block Text',
  'Salutation', 'Signature', 'Closing', 'Date', 'E-mail Signature', 'Message Header', 'Note Heading', 'Document Map', 'Mention', 'Hashtag', 'Unresolved Mention', 'Smart (?:Hyperlink|Link)',
  'List(?: Bullet| Number| Continue)?(?: [2-5])?', 'Body Text(?: [23]| Indent(?: [23])?| First Indent(?: 2)?)?', 'Outline List [1-3]',
  'HTML (?:Top of Form|Bottom of Form|Acronym|Address|Cite|Code|Definition|Keyboard|Preformatted|Sample|Typewriter|Variable)',
  'Table (?:Grid(?: Light)?|Normal|Theme|Contemporary|Elegant|Professional|(?:Simple|Colorful|3D effects) [1-3]|Classic [1-4]|Columns [1-5]|(?:Grid|List) [1-8]|Subtle [12]|Web [1-3])',
  'Plain Table [1-5]', '(?:Grid|List) Table [1-7](?: Light| Dark| Colorful)?(?: Accent [1-6])?',
  '(?:Light|Colorful) (?:Shading|List|Grid)(?: Accent [1-6])?', 'Medium (?:Shading|List|Grid) [1-3](?: Accent [1-6])?', 'Dark List(?: Accent [1-6])?',
].join('|')})$`, 'i');
/** A built-in style's id is its name without spaces ("heading 1" → Heading1); an id that is not
 *  is read like any other */
export const idOfName = (id: string, name: string) => id.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** A VML shape's id is its name in the Selection Pane ("Text Box 2", or "Kestrel logo" once
 *  renamed); Word's own are these. Any other is renamed _x0000_sN, with the references that
 *  name it (a text box's story flowing on, a shape's type, an OLE object's shape): an id held
 *  the file with no way through until 2026-09-23. */
/** a chart's print header and footer, in a chart and in an Office 2016 chart (chartEx) */
const CHART_HF = /^cx?:headerFooter$/;
const VML_MACHINE_ID = /^(?:_x0000_[a-z]\d+|PowerPlusWaterMarkObject\d+|WordPictureWatermark\d+)$/;
/** the VML elements that point at shapes by id (a connector's or callout's rule, o:r, and its
 *  o:proxy; a diagram's relation table, o:rel), and the attributes that do the pointing.
 *  o:rel was missing: its idsrc/iddest held the file with no way through (2026-09-23). */
const VML_RULE = new Set(['o:r', 'o:proxy', 'o:rel']);
const VML_RULE_REFS = ['idref', 'idsrc', 'iddest', 'idcntr'];

/** where a chart keeps a formula (cell references) and a pivot chart the table it came from */
export const FORMULA_TAGS = new Set(['c:f', 'c15:f', 'c15:sqref', 'cx:f']);
const NEUTRAL_PIVOT = /^\[Book1\.xlsx\]Sheet1!PivotTable\d+$/;

// ---------- XML out: exact escaping, nothing else touched ----------
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// an attribute keeps its line breaks and tabs only as character references (attribute-
// value normalization turns a literal newline into a space on the next parse)
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;').replace(/\t/g, '&#x9;');
const builder = new XMLBuilder({
  preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', suppressEmptyNode: true, format: false,
  processEntities: false,
  tagValueProcessor: (_n, v) => escText(String(v)),
  attributeValueProcessor: (_n, v) => escAttr(String(v)),
});
const td = new TextDecoder();
const te = new TextEncoder();

/** A processing instruction is a note a program leaves in a part for itself: Word neither shows
 *  nor needs one, and `<?dms client="Kestrel Holdings"?>` in the body shipped under a gate that
 *  skipped every one (W5-3, 2026-09-23). The XML declaration stays, and so does the one bare
 *  marker of Microsoft's own that Office reads (`<?mso-contentType?>` heads a SharePoint
 *  customXml item) with nothing after its name; every other one goes, counted. The marker is
 *  matched whole: as any "mso-" and letters, `<?mso-KestrelHoldings?>` was kept (INT-23, W6-3),
 *  and the gate reads a kept one's name all the same. The parser keeps a PI's attribute-shaped
 *  data and drops the rest, so a PI with no attributes left here carries nothing but its name. */
const MSO_MARKER = /^\?mso-contentType$/;
const keptInstruction = (tag: string, n: XNode) => tag === '?xml' || (MSO_MARKER.test(tag) && !Object.keys(n[':@'] || {}).length);
/** The XML declaration as XML defines it: a version, an encoding and a standalone, nothing else.
 *  The parser takes whatever else stands in one as attributes and the builder wrote them back,
 *  so <?xml version="1.0" … client="Margaret Tan"?> shipped the name on a part's first line
 *  under a gate that stepped over the declaration (W5R-3, 2026-09-23). What else it carries
 *  goes, and so does one of the three with a value XML does not allow; Word writes
 *  version="1.0" encoding="UTF-8" standalone="yes". The encoding is a closed list, the two
 *  every XML reader must read (XML 1.0 §4.3.3) in any case; every one of the 740 declarations in
 *  the 21 real files says UTF-8 or utf-8. Any name was allowed until 2026-09-24, so
 *  encoding="Margaret-Tan" shipped on a part's first line (W3-6); a part that declares another
 *  holds before anything is written (declEncoding), since this app reads every part as UTF-8.
 *  The copy is written in UTF-8 and its declarations say so: "UTF-16" was kept as written until
 *  2026-09-24 over bytes that are UTF-8, which XML calls a fatal error (W-FID-ENC-UTF16). */
const DECL: Record<string, RegExp> = { version: /^1\.\d+$/, encoding: /^UTF-8$/i, standalone: /^(?:yes|no)$/ };
export const declExtra = (n: XNode): string[] => { const a = (n[':@'] || {}) as Record<string, string>; return Object.keys(a).filter((k) => !Object.prototype.hasOwnProperty.call(DECL, k) || !DECL[k].test(String(a[k]))); };
/** What a part's declaration may say it is written in, when its bytes decoded as UTF-8. UTF-8
 *  is read as written. A part truly written in UTF-16 starts with a byte-order mark or a zero
 *  byte and holds before this (utf16Part), so one that decoded as UTF-8 and says UTF-16 is UTF-8
 *  whatever its first line says. A code page that writes plain ASCII as ASCII (US-ASCII,
 *  ISO-8859-x, Windows-125x) reads the same as UTF-8 over a part with no byte above 127, and only
 *  there: until 2026-09-24 such a part held, and the hold said its text might not have been read
 *  as written, which was false for it (W-FID-ENC-ASCII). Each is written as UTF-8 (built). */
const READ_UTF8 = /^(?:UTF-?8|UTF-16(?:LE|BE)?)$/i;
const ASCII_SAME = /^(?:US-ASCII|ASCII|ANSI_X3\.4-1968|ISO[-_]?646(?:-US)?|ISO[-_]?8859-(?:[1-9]|1[0-6])|latin-?(?:[1-9]|10)|windows-125\d|cp-?125\d|cp819|IBM819)$/i;
/** the encoding a part's XML declaration names when this app cannot say it read the part as
 *  written, or null: a name neither READ_UTF8 nor ASCII_SAME knows, and one of ASCII_SAME's over
 *  a part holding a byte above 127 (read in `bytes` when given, else in the text) */
export function declEncoding(xml: string, bytes?: Uint8Array): string | null {
  const d = /^﻿?\s*<\?xml\s([^?]*)\?>/.exec(xml);
  const e = d && /(?:^|\s)encoding\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(d[1]);
  if (!e) return null;
  const v = e[1] ?? e[2];
  if (READ_UTF8.test(v)) return null;
  return ASCII_SAME.test(v) && (bytes ? bytes.every((b) => b < 0x80) : !/[^\x00-\x7f]/.test(xml)) ? null : v;
}
/** Every part is built through here, the relationships and the list of parts too, which the
 *  structural pass never sees. `declared`: the declarations that carried more than XML allows. */
function built(tree: XNode[], shared: { instructions: number; declared?: number }): Uint8Array {
  const strip = (nodes: XNode[]): XNode[] => nodes.filter((n) => {
    const t = tagOf(n);
    if (!t || t === '#text') return true;
    if (t === '?xml') {
      // an encoding declEncoding let through is written as what the copy is, not counted as
      // something the declaration carried past what XML allows
      const a0 = n[':@'] as Record<string, string> | undefined;
      if (a0 && a0.encoding != null && !DECL.encoding.test(String(a0.encoding)) && (READ_UTF8.test(String(a0.encoding)) || ASCII_SAME.test(String(a0.encoding)))) n[':@'] = { ...a0, encoding: 'UTF-8' };
      const extra = declExtra(n);
      if (extra.length) { const a = { ...(n[':@'] as Record<string, string>) }; for (const k of extra) delete a[k]; n[':@'] = a; shared.declared = (shared.declared ?? 0) + 1; }
      return true;
    }
    if (t.startsWith('?')) { if (keptInstruction(t, n)) return true; shared.instructions++; return false; }
    if (Array.isArray(n[t])) n[t] = strip(n[t]);
    return true;
  });
  return te.encode(builder.build(strip(tree)));
}

/** How many values (a text, an attribute) differ between two parsed trees of one shape, or -1
 *  when their shapes differ: what the receipt says the writer changed in a part it kept. */
function valuesChanged(a: XNode[], b: XNode[]): number {
  if (a.length !== b.length) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const t = tagOf(a[i]);
    if (t !== tagOf(b[i])) return -1;
    if (!t) continue;
    if (t === '#text') { if (String(a[i]['#text']) !== String(b[i]['#text'])) n++; continue; }
    const x: Record<string, unknown> = a[i][':@'] || {}, y: Record<string, unknown> = b[i][':@'] || {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (x[k] !== y[k]) n++;
    const ka = Array.isArray(a[i][t]), kb = Array.isArray(b[i][t]);
    if (ka !== kb) return -1;
    if (ka) { const m = valuesChanged(a[i][t], b[i][t]); if (m < 0) return -1; n += m; }
  }
  return n;
}

// ---------- zip out ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflateRaw(u8: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([u8 as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
/** a plain zip: deflate where it helps, stored otherwise; fixed timestamp (1980-01-01,
 *  the zip epoch) so the archive carries no clock of its own */
export async function writeZip(entries: Array<{ name: string; data: Uint8Array }>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = te.encode(e.name);
    const crc = crc32(e.data);
    const deflated = await deflateRaw(e.data);
    const method = deflated.length < e.data.length ? 8 : 0;
    const payload = method === 8 ? deflated : e.data;
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, payload.length, true); lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    lh.set(name, 30);
    chunks.push(lh, payload);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, payload.length, true); cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
    ch.set(name, 46);
    centrals.push(ch);
    offset += lh.length + payload.length;
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
  const all = [...chunks, ...centrals, eocd];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

// ---------- reading a name where it has no spaces ----------
/** Where an identifier is cut into words when nothing separates them: a small letter before
 *  a capital, a run of capitals before a capitalised word, letters against digits. */
export const REF_CUT = /(?<=\p{Ll})(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})|(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/u;
/** between two readings of a name: no row's match crosses it (a footprint joins its words
 *  with whitespace only, and "|" is not a letter a match could glue to), and no rule of the
 *  safety-net pattern takes a line break and a bar as a separator */
export const REF_JOIN = '\n|\n';
/** The words an identifier holds with nothing between them, each reading on its own line of
 *  one string, or '' when the name has no such cut.
 *
 *  An identifier (a style id, a field's word, a SEQ counter's name) cannot hold a space, and an
 *  underscore is only one way round that: "ProjectKestrel", "KestrelSPA" and "Kestrel2" shipped
 *  unchanged as bookmark names under a passing gate (2026-09-23), because a row's match will not
 *  start or stop inside a word and in each of them "Kestrel" runs straight into the next one.
 *  Every stretch between two cuts is read standing alone, with its inner cuts closed and opened,
 *  so "McDonald" in McDonaldClaim is found as typed and "Project Kestrel" in ProjectKestrelSPA
 *  as spaced.
 *
 *  Read for the table's rows (placements) only, never the safety-net pattern: the pattern's
 *  numbers are read on the name as written, and cut out of it "Schedule123456789" becomes a
 *  long number that would hold every reference to that schedule. */
export function refWords(name: string): string {
  const words = name.split(/_+/).filter(Boolean);
  if (!words.some((w) => REF_CUT.test(w))) return '';
  // atoms, each marked with whether an underscore stood before it
  const atoms: Array<{ t: string; gap: boolean }> = [];
  for (const w of words) w.split(REF_CUT).forEach((t, i) => atoms.push({ t, gap: i === 0 }));
  // a stretch runs to at most 12 atoms: a bookmark name is at most 40 characters in Word, and
  // an identifier another tool wrote can be longer without making the readings grow as its square
  const out = new Set<string>();
  for (let i = 0; i < atoms.length; i++) {
    let closed = atoms[i].t;
    let open = atoms[i].t;
    out.add(closed);
    for (let j = i + 1; j < Math.min(atoms.length, i + 12); j++) {
      closed += (atoms[j].gap ? ' ' : '') + atoms[j].t;
      open += ' ' + atoms[j].t;
      out.add(closed);
      out.add(open);
    }
  }
  return [...out].join(REF_JOIN);
}

// A name read with nothing between ITS OWN words either. refWords re-inserts the spaces an
// identifier cannot hold, but a row's match still needs the name's punctuation and its cuts
// where the row has them, and an identifier drops both: "Harrow-Leung LLP" is typed HarrowLeung
// or Harrow_Leung_SPA, "O'Brien Kessler" OBrienKessler, "BlackRock Capital" and "JPMorgan
// Chase" carry a capital inside a word, which the cuts split and a row's match will not
// rejoin, and "KPMG" in KPMGreport was cut KPM|Greport. Each shipped as a bookmark name under a
// gate that passed (2026-09-23). Here a name and each of the table's names are both reduced to
// their letters and digits, lower case, accents off, and the name carries a row when the
// row's letters stand in it between two places a word can break: where a separator was, a
// small letter before a capital, letters against digits, a CJK letter against anything, and
// on both sides of the last capital of a run of capitals before a small letter (KPMG|report,
// ABC|Corp). A row therefore never matches inside a word ("Tan" in Standard_terms), and an
// all-capitals name has no inner breaks ("TAN" is not in "STANDARD").
export const REF_CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;
export const REF_INVISIBLE = /[­​-‍⁠﻿]/g;
export interface RefName { name: string; c: string; cuts?: Set<number> }

// ---------- percent-escapes ----------
// A name whose spaces, apostrophes or letters are written as percent-escapes is the same name
// (owner ruling 10, 2026-09-24): a SharePoint or DMS link pasted into a memo writes a client's
// folder ".../Margaret%20Tan%20Matter/brief.docx", and read as written the row "Margaret Tan"
// stood in it nowhere — the body, the .txt and both clipboards shipped it under a passing check
// (W3-3), and so did a namespace an add-in declared with the name in its address (W3-2).
/** each run of escapes in `s`, decoded as UTF-8 one character at a time: a character's bytes
 *  that decode give it, at the escapes that wrote it; a byte that starts no character, or a
 *  character cut short, stays as written ("%E9", three characters, each at its own place) and
 *  the bytes after it are read again on their own — decoded as a whole run, one such byte left
 *  "Margaret%20%E2Tan" undecoded entire (W3-5). Kept as written rather than dropped, since a
 *  percent sign typed before a word is not an escape: "100%Bedrock" dropped "%Be" and no longer
 *  read "Bedrock". `bad`: where each such byte stands, as written (pctHidden).
 *
 *  An escape of an escape is read through: a mail gateway that rewrites links (Safe Links,
 *  Barracuda) escapes the percent sign of each escape again, and "Margaret%2520Tan" — which a
 *  reader, and a model, reads as the name it wraps — shipped from the body, the .txt and a part
 *  as written while "Margaret%20Tan" was masked (W-LEAK-1). "%25" before two hex digits is read
 *  as the escape it writes, as many times over as it is written. So is %uXXXX, the escape an
 *  old script writes a character past Latin-1 in ("Micha%u0142"), and a character reference
 *  typed out as text, as a page's source pasted into a memo writes it ("Margaret&#32;Tan",
 *  "Allen &amp; Overy", "Ren&eacute; Tan") (W-LEAK-7): each is the character a reader takes it
 *  for. A name is any HTML defines (HTML_ENTITY, the whole of the standard's table): a hand list
 *  of 34 read "&nbsp;" and missed "&hairsp;", "&ZeroWidthSpace;", "&middot;", "&minus;" and the
 *  rest, and a client's name or a declared number written with one shipped from every part and
 *  the .txt (WL-3). A reference to no character, or a name HTML does not define, stays as
 *  written, and only a percent-escape counts as a byte that is no character (`bad`): owner ruling
 *  10 is about those, and "&foo;" is as likely a word between an ampersand and a semicolon; so
 *  does "&NBSP;", which no browser reads. A reference by number is read with its semicolon left
 *  off too, where its digits end, as a browser reads it: "Margaret&#160Tan" shipped from every
 *  part and the .txt (WL-4). "&nbsp" is read as a space with its semicolon left off (owner ruling
 *  19d), as a browser reads it: "Margaret&nbspTan" shipped from the body and the .txt. No other
 *  name is read without its semicolon: the ruling names the one a page's source writes between
 *  the words of a name. Measured before each landed: TAB's names and the caption parties over the
 *  99 opinions and the 21 real files' text, the same finds with it and without it; none of the
 *  1,268 TAB judgments and 99 opinions writes a named reference or a numeric one without its
 *  semicolon. */
const PCT_RUN = /(?:%(?:25)*(?:[uU][0-9A-Fa-f]{4}|[0-9A-Fa-f]{2})|&#(?:0*\d{1,7}|[xX]0*[0-9A-Fa-f]{1,6});?|&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+/g;
/** one escape of a run, where it stands: a byte (%XX, however often its percent sign is escaped
 *  again), a UTF-16 unit (%uXXXX), a character reference by number or by name. A number is read
 *  past any leading zeros, as HTML reads it: read to its seventh digit only, "&#00000032;" was no
 *  escape here and "Margaret&#00000032;Tan" shipped from the .txt under a verified plan. */
const PCT_ONE = /%(?:25)*(?:[uU]([0-9A-Fa-f]{4})|([0-9A-Fa-f]{2}))|&#(?:0*(\d{1,7})|[xX]0*([0-9A-Fa-f]{1,6}));?|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)/y;
/** A line break a mail client's wrap puts in a link, at 76 columns, in Windows' CRLF or in LF: it
 *  lands anywhere, inside an escape ("Margaret%2" and "0Tan" on two lines) as in a gateway's own
 *  address, and a reader reads the link as one line. With a break inside "%20", inside the
 *  "urldefense.com/v3/__" or the "__;" that wraps a link, or a CRLF anywhere in one, a client's
 *  folder name shipped from the body and the .txt of 47 of 100 places a wrap can land in a v2
 *  link, 34 of 77 in a v3 link, and every place in one saved with CRLF (WL-1, WL-2; owner ruling
 *  17). Read across a break only in a link (LINK_BROKEN): in prose, "5%" at a line's end and "21"
 *  starting the next are two things, and read as one escape the digits were gone. A break inside
 *  a name's own letters ("Marg" and "aret%20Tan") is not read across, in a link or out of one. */
const BR = '(?:\\r?\\n)?';
/** `lit` with a line break allowed between any two of its characters */
const brokenLit = (lit: string) => [...lit].map((c) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join(BR);
/** a link, from its scheme or "www." to the space after it, over the line breaks in it; one that
 *  holds a break is read by PCT_RUN_BR */
const LINK_BROKEN = /(?:\b[A-Za-z][A-Za-z0-9+.-]*:\/\/|\bwww\.)(?:[^\s<>"]|\r?\n(?=[^\s<>"]))+/g;
const HX = '[0-9A-Fa-f]';
const PCT_BR_SRC = `%${BR}(?:2${BR}5${BR})*(?:[uU]${BR}(${HX}${BR}${HX}${BR}${HX}${BR}${HX})|(${HX}${BR}${HX}))`;
/** PCT_RUN and PCT_ONE with a percent-escape read over a line break inside it (BR); a character
 *  reference is read as PCT_ONE reads it */
const PCT_RUN_BR = new RegExp(`(?:${PCT_BR_SRC.replace(/\((?!\?)/g, '(?:')}|&#(?:0*\\d{1,7}|[xX]0*[0-9A-Fa-f]{1,6});?|&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+`, 'g');
const PCT_ONE_BR = new RegExp(`${PCT_BR_SRC}|&#(?:0*(\\d{1,7})|[xX]0*([0-9A-Fa-f]{1,6}));?|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)`, 'y');
/** What a name HTML defines writes, or null. The table replaced a hand list of 34 names and a
 *  letter composed with an accent's name ("E" + "cedil"), which read 93 names HTML does not
 *  define ("&Ecedil;", which a browser prints as written) and 3 that it does as other characters
 *  ("&sdot;" is HTML's dot operator, not "ṡ"). */
function entity(n: string): string | null {
  return HTML_ENTITY.get(n) ?? null;
}
/** Proofpoint writes the escapes of the link it wraps in characters of its own: v2 writes each
 *  "%" of the original as "-" (and each "/" as "_") in its u= value, and v3 moves some of the
 *  original's characters into a base64 list after "__;" and writes a "*" where each stood, the
 *  "%" of each escape among them. A reader reads the name through either ("Margaret-2520Tan",
 *  "Margaret*20Tan"), and with Safe Links and Barracuda read (W-LEAK-1) these two still shipped a
 *  client's folder name from the body and the .txt of a link copied out of a mail. Inside such a
 *  link only, "-" before two hex digits and a "*" the list says was a "%" are read as the "%" they
 *  write (gatewayWritten), one character for one, so every offset stands. A "*" run ("**B") that
 *  moves several characters at once is kept as written. A line break is read through anywhere in
 *  the gateway's own address, its "__;" and its list, and inside an escape (BR, WL-2), and the
 *  US government's host, urldefense.us, as the other two (WL-8). */
const PP_HEAD = `${brokenLit('urldefense')}(?:${BR}${brokenLit('.proofpoint')})?${BR}\\.${BR}(?:${brokenLit('com')}|${brokenLit('us')})${BR}`;
const PP_V2 = new RegExp(`${PP_HEAD}${brokenLit('/v2/url?u=')}((?:[^&\\s]|\\r?\\n(?=[^&\\s]))+)`, 'gi');
const PP_V3 = new RegExp(`(${PP_HEAD}${brokenLit('/v3/__')})((?:\\S|\\r?\\n(?=\\S))+?)${brokenLit('__;')}((?:[A-Za-z0-9_-]|\\r?\\n(?=[A-Za-z0-9_-]))*)`, 'gi');
const PP_RUNS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PP_HOST = new RegExp(brokenLit('urldefense'), 'i');
function gatewayWritten(s: string): string {
  if (!PP_HOST.test(s)) return s;
  const out = s.split('');
  const past = (j: number) => { while (s[j] === '\n' || (s[j] === '\r' && s[j + 1] === '\n')) j++; return j; };
  for (const m of s.matchAll(PP_V2)) {
    const v = m.index! + m[0].length - m[1].length, e = v + m[1].length;
    for (let i = v; i + 2 < e; i++) {
      if (s[i] !== '-') continue;
      const h1 = past(i + 1), h2 = past(h1 + 1);
      if (h2 < e && /^[0-9A-Fa-f]$/.test(s[h1]) && /^[0-9A-Fa-f]$/.test(s[h2])) out[i] = '%';
    }
  }
  for (const m of s.matchAll(PP_V3)) {
    let moved: string[];
    try {
      const b64 = m[3].replace(/\r?\n/g, '').replace(/-/g, '+').replace(/_/g, '/');
      moved = [...new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0)))];
    } catch { continue; }
    const b = m.index! + m[1].length;
    for (let i = b, k = 0; i < b + m[2].length; i++) {
      if (s[i] !== '*') continue;
      if (s[i + 1] === '*') { const L = PP_RUNS.indexOf(s[i + 2]) + 2, run = moved.slice(k, k + L); k += L; if (L >= 2 && L <= 3 && run.length === L && run.every((x) => x.length === 1 && x !== '*')) for (let j = 0; j < 3; j++) out[i + j] = j < 3 - L ? '\u200B' : run[j - (3 - L)]; i += 2; continue; }
      { const c = moved[k++]; if (c !== undefined && c.length === 1 && c !== '*') out[i] = c; }
    }
  }
  return out.join('');
}
/** Whether `s` can hold an escape as pctHidden reads one: a "%" as written, or a gateway's link
 *  that writes it another way. The cheap test before pctHidden: a caller that tests for a "%"
 *  alone lets "Ren*E9*20Tan" in a Proofpoint v3 link through, which the writer holds on. */
export function hasEscape(s: string): boolean {
  return s.includes('%') || PP_HOST.test(s);
}
interface PctRun { s: number; e: number; units: Array<[string, number, number]>; bad: Array<[number, number]> }
/** `s` as written, or gatewayWritten's view of it, which each caller takes once: a v3 list is read
 *  in order, and read again over the view it would give its "%" to the wrong "*" */
function pctRuns(s: string): PctRun[] {
  const out: PctRun[] = [];
  // the runs as written, and in a link a line break broke (LINK_BROKEN) the runs read over it
  let found: Array<{ s0: number; e0: number; one: RegExp }> = [...s.matchAll(PCT_RUN)].map((m) => ({ s0: m.index!, e0: m.index! + m[0].length, one: PCT_ONE }));
  if (s.includes('\n') && s.includes('%')) {
    const links = [...s.matchAll(LINK_BROKEN)].filter((m) => m[0].includes('\n')).map((m) => [m.index!, m.index! + m[0].length]);
    if (links.length) {
      const inLink = (i: number) => links.some(([a, b]) => i >= a && i < b);
      const read = found.filter((r) => !inLink(r.s0));
      for (const [a, b] of links) for (const m of s.slice(a, b).matchAll(PCT_RUN_BR)) read.push({ s0: a + m.index!, e0: a + m.index! + m[0].length, one: PCT_ONE_BR });
      read.sort((x, y) => x.s0 - y.s0);
      found = [];
      for (const r of read) if (!found.length || r.s0 >= found[found.length - 1].e0) found.push(r);
    }
  }
  for (const { s0, e0, one } of found) {
    // each escape of the run: a byte, or a character (a unit of %u, a reference), or text as written
    // `text`: what a name HTML defines as more than one character writes ("&fjlig;" is "fj")
    const esc: Array<{ a: number; b: number; byte?: number; cp?: number; u?: boolean; text?: string }> = [];
    one.lastIndex = s0;
    while (one.lastIndex < e0) {
      const a = one.lastIndex, x = one.exec(s);
      if (!x) break;
      const b = one.lastIndex;
      if (x[2] !== undefined) esc.push({ a, b, byte: parseInt(x[2].replace(/\r?\n/g, ''), 16) });
      else if (x[1] !== undefined) esc.push({ a, b, cp: parseInt(x[1].replace(/\r?\n/g, ''), 16), u: true });
      else if (x[3] !== undefined || x[4] !== undefined) {
        const cp = x[3] !== undefined ? parseInt(x[3], 10) : parseInt(x[4], 16);
        esc.push(cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp < 0xe000) ? { a, b, cp } : { a, b });
      } else { const ch = entity(x[5] ?? x[6]); esc.push(ch === null ? { a, b } : [...ch].length === 1 ? { a, b, cp: ch.codePointAt(0)! } : { a, b, text: ch }); }
    }
    const units: Array<[string, number, number]> = [], bad: Array<[number, number]> = [];
    const asWritten = (a: number, b: number) => { for (let x = a; x < b; x++) units.push([s[x], x, x + 1]); };
    let t = 0;
    while (t < esc.length) {
      const x = esc[t];
      if (x.byte === undefined) {
        if (x.text !== undefined) { for (const c of x.text) units.push([c, x.a, x.b]); t++; continue; }
        if (x.cp === undefined) { asWritten(x.a, x.b); t++; continue; }
        let cp = x.cp, end = x.b, used = 1;
        // a pair of %u units is one character past the BMP; a unit of a pair alone is none
        const lo = esc[t + 1];
        if (x.u && cp >= 0xd800 && cp < 0xdc00 && lo?.u && lo.cp! >= 0xdc00 && lo.cp! < 0xe000) { cp = 0x10000 + ((cp - 0xd800) << 10) + (lo.cp! - 0xdc00); end = lo.b; used = 2; }
        if (cp >= 0xd800 && cp < 0xe000) { bad.push([x.a, x.b]); asWritten(x.a, x.b); t++; continue; }
        units.push([String.fromCodePoint(cp), x.a, end]);
        t += used;
        continue;
      }
      const b0 = x.byte;
      const need = b0 < 0x80 ? 0 : b0 >= 0xc2 && b0 < 0xe0 ? 1 : b0 >= 0xe0 && b0 < 0xf0 ? 2 : b0 >= 0xf0 && b0 < 0xf5 ? 3 : -1;
      let cp = need > 0 ? b0 & (0x3f >> need) : b0, j = t + 1, ok = need >= 0;
      for (let k = 0; ok && k < need; k++, j++) {
        const b = esc[j]?.byte;
        if (b === undefined || (b & 0xc0) !== 0x80) ok = false; else cp = (cp << 6) | (b & 0x3f);
      }
      // an overlong form, a surrogate, or past U+10FFFF is no character either
      if (ok && ((need === 2 && (cp < 0x800 || (cp >= 0xd800 && cp < 0xe000))) || (need === 3 && (cp < 0x10000 || cp > 0x10ffff)))) ok = false;
      if (!ok) { bad.push([x.a, x.b]); asWritten(x.a, x.b); t++; continue; }
      units.push([String.fromCodePoint(cp), x.a, esc[j - 1].b]);
      t = j;
    }
    out.push({ s: s0, e: e0, units, bad });
  }
  return out;
}
/** `s` with each percent-escape read as the character it writes (pctRuns), and where each
 *  character of the view came from in `s` (`at[i]` to `end[i]`), or null when `s` has none. For
 *  a reading of names that is not refFind's (engine.ts's own passes over the text a reader sees):
 *  a span [a, b) of the view stands at [at[a], end[b - 1]) of `s`, the escapes that wrote it
 *  included. */
export function pctView(s: string): { text: string; at: number[]; end: number[] } | null {
  if (!/[%&]/.test(s) && !PP_HOST.test(s)) return null;
  const runs = pctRuns(gatewayWritten(s));
  if (!runs.length) return null;
  let text = '';
  const at: number[] = [], end: number[] = [];
  const put = (t: string, a: number, b: number) => { text += t; for (let x = 0; x < t.length; x++) { at.push(a); end.push(b); } };
  let p = 0;
  for (const r of runs) {
    for (let i = p; i < r.s; i++) put(s[i], i, i + 1);
    for (const [ch, a, b] of r.units) put(ch, a, b);
    p = r.e;
  }
  for (let i = p; i < s.length; i++) put(s[i], i, i + 1);
  return { text, at, end };
}
/** A value's percent-escapes, each read as the character it writes (pctRuns). A part's name as
 *  the package means it: OPC writes a part name percent-encoded — in the zip, in
 *  [Content_Types].xml and in a relationship's target — so "word/Margaret%20Tan.xml" is the part
 *  "word/Margaret Tan.xml", and read as written the name was not found: a row "Margaret Tan"
 *  shipped as a part's name, and as a picture's (W5R-1, 2026-09-23). */
export function pctDecoded(s: string): string {
  return pctView(s)?.text ?? s;
}
/** An attribute's value that writes a character as a %u escape or a character reference, read
 *  decoded as a name besides (a plain %XX is asked on its own): "&#32;", "&eacute;", and "&nbsp"
 *  and a reference by number without its semicolon (owner ruling 19d, WL-4), which pctDecoded
 *  reads as the character each writes. Exported so the attestation asks of the same values
 *  (attest.ts). */
export const REF_ESCAPE = /%[uU][0-9A-Fa-f]{4}|&#\d|&#[xX][0-9A-Fa-f]|&#?[0-9A-Za-z]+;|&nbsp/;
/** The first escape in `s` that writes no character where a name of the table would be found
 *  (refFind, `how`) were the byte one of the name's letters, or nothing — or null. "Ren%E9 Tan"
 *  (é written the Latin-1 way, as a page saved by an older program writes it) is not a row "René
 *  Tan" to any reading, and nothing can say which letter the byte meant; such a value holds
 *  (owner ruling 10, 2026-09-24). Only where a name could stand: a percent sign typed before a
 *  word ("100%Bedrock") is read as written and found, and a byte beside no name is no one's.
 *  A name written the Latin-1 way has such a byte for each letter past ASCII ("H%E9l%E8ne",
 *  "Jos%E9 Mar%EDa"): read one byte at a time, the other stood as written in the name, so no
 *  reading found it and both shipped (W-LEAK-2). Where two or more stand near one another they
 *  are read together, each as one of the name's letters or as nothing. */
export function pctHidden(s: string, names: RefName[], how: 'all' | 'run' | 'text' = 'all'): { esc: string; at: number; name: string } | null {
  if (!names.length) return null;
  // read in gatewayWritten's view, one character for one, so every place below is a place of `s`
  const g = gatewayWritten(s);
  if (!g.includes('%')) return null;
  const runs = pctRuns(g);
  const bad = runs.flatMap((r) => r.bad);
  if (!bad.length) return null;
  const most = Math.max(...names.map((n) => n.c.length));
  // a letter written as an escape is three characters as written, or more (an escape escaped
  // again, "%25E9"; a reference, "&#233;"), and a name has separators
  let wide = 3;
  for (const r of runs) for (const [, a, b] of r.units) if (b - a > wide) wide = b - a;
  for (const [a, b] of bad) if (b - a > wide) wide = b - a;
  const reach = (wide + 1) * most + 16;
  for (const [b, w] of bad) {
    const lo = Math.max(0, b - reach), hi = Math.min(s.length, w + reach), p = b - lo;
    const before = compactOf(g.slice(lo, b), false, true).c, after = compactOf(g.slice(w, hi), false, true).c;
    for (const n of names) {
      const c = n.c;
      for (let i = 0; i < c.length; i++) {
        if (!before.endsWith(c.slice(0, i))) continue;
        // the byte as c[i], or as nothing between c[i - 1] and c[i]; then read as the value is
        for (const x of i > 0 ? [c[i], ''] : [c[i]]) {
          if (!after.startsWith(c.slice(i + x.length))) continue;
          const t = g.slice(lo, b) + x + g.slice(w, hi);
          if (refFind(t, [n], how, false, true, true).some((f) => f.s <= p - (x ? 0 : 1) && f.e > p)) return { esc: s.slice(b, w), at: b, name: n.name };
        }
      }
    }
  }
  if (bad.length < 2) return null;
  // Together: the stretch around each byte with every such byte in it as one wild letter (WILD),
  // matched against each name with a wild letter standing for one of its letters or, inside it,
  // for nothing (`can`, from the end back); the one reading that prefers a letter is then read as
  // the value is (refFind), and counts where it covers a byte
  const WILD = 'ǂ';
  for (const [b0, w0] of bad) {
    let lo = Math.max(0, b0 - reach), hi = Math.min(s.length, w0 + reach);
    for (const [a, z] of bad) { if (a < lo && z > lo) lo = a; if (a < hi && z > hi) hi = z; }
    const here = bad.filter(([a, z]) => a >= lo && z <= hi);
    if (here.length < 2) continue;
    let t0 = '', q = lo;
    for (const [a, z] of here) { t0 += g.slice(q, a) + WILD; q = z; }
    const k = compactOf(t0 + g.slice(q, hi), false, true).c;
    const wi: number[] = [];
    for (let x = 0, j = 0; x < k.length; x++) wi.push(k[x] === WILD ? j++ : -1);
    for (const n of names) {
      const c = n.c, K = k.length, C = c.length;
      // can[ti * (C + 1) + ci]: k from ti on can be read as c from ci on
      const can = new Uint8Array((K + 1) * (C + 1));
      for (let ti = K; ti >= 0; ti--) for (let ci = C; ci >= 0; ci--) {
        can[ti * (C + 1) + ci] = ci === C ? 1 : ti === K ? 0
          : k[ti] === WILD ? can[(ti + 1) * (C + 1) + ci + 1] | (ci > 0 ? can[(ti + 1) * (C + 1) + ci] : 0)
            : k[ti] === c[ci] ? can[(ti + 1) * (C + 1) + ci + 1] : 0;
      }
      for (let st = 0; st < K; st++) {
        if (!can[st * (C + 1)]) continue;
        const got = new Map<number, string>();
        for (let ti = st, ci = 0; ci < C; ti++) {
          if (k[ti] !== WILD) { ci++; continue; }
          if (can[(ti + 1) * (C + 1) + ci + 1]) got.set(wi[ti], c[ci++]); else got.set(wi[ti], '');
        }
        // a name is read through such bytes only where most of it is written out: a run of
        // eighteen of them before "Porter" read as a row "Tan", three wild letters and none written
        const wild = [...got.values()].filter(Boolean).length;
        if (!got.size || C - wild < 2 * wild) continue;
        let t = '', at = lo;
        const put: Array<[number, string]> = [];
        here.forEach(([a, z], j) => { t += g.slice(at, a); if (got.has(j)) { put.push([t.length, got.get(j)!]); t += got.get(j)!; } else t += g.slice(a, z); at = z; });
        t += g.slice(at, hi);
        const f = refFind(t, [n], how, false, true, true).find((f) => put.some(([p, x]) => f.s <= p - (x ? 0 : 1) && f.e > p));
        if (!f) continue;
        const j = here.findIndex((_, j) => got.has(j));
        return { esc: s.slice(here[j][0], here[j][1]), at: here[j][0], name: n.name };
      }
    }
  }
  return null;
}

/** `seps`: the cuts that stand where a separator was (a space, a hyphen, an underscore), in
 *  order; `from`/`to`: with `map`, the stretch of `s` each character of `c` came from; `np`: 1 for
 *  each character of `c` that stands in a token that is not a word of prose (JOINER); `cap`: 1 for
 *  each that was written as a capital; `dsep`: the separators that are one DIGIT_SEP between two
 *  digits. */
interface Compact { c: string; cuts: Set<number>; seps: number[]; from: number[]; to: number[]; np: Uint8Array; cap: Uint8Array; dsep: Set<number> }
/** What groups the digits of one number as it is written: one space of any width (Unicode's
 *  space separators: no-break, thin, figure, en, em, hair, medium, ideographic, Ogham's) or a tab,
 *  a dot, a slash, a hyphen or a dash of any length (Unicode's dash punctuation, the two- and
 *  three-em dashes and the small forms among it), a minus sign, or a middle dot or a bullet
 *  (U+00B7, U+2022, U+2024, U+2027, U+2219, U+22C5, U+2E31, U+30FB, U+FF65), alone between two
 *  digits — "3192 6819", "3192-6819", "3192—6819", "4417.902.01", "12/345678" — or a hyphen with
 *  a space each side, or a closing bracket and a space ("3192 - 6819", "(3192) 6819"). A row of
 *  digits is found across it in text a reader sees (refFind 'text'), where it was found only
 *  written whole: a declared account number written grouped shipped from the body and the .txt
 *  (W-LEAK-6); written with an em dash, a tab or a minus sign it shipped after that (owner ruling
 *  19b); and written with a medium or an Ogham space, a two-em or a small dash, a hyphenation
 *  point or a katakana middle dot it shipped after that, under this comment's "any width" and
 *  "any length" (WL-5). The mask covers the digits and what stands between them, so "(3192)
 *  6819" goes out "([ID1]". Not a comma, which lists numbers as often as it groups one ("Nos.
 *  123,456"), not an underscore, and not two separators together: "3192  6819" and "3192 – 6819"
 *  ship, the second being how a range is written ("paragraphs 15 – 25", 8 times in 5 of TAB's
 *  judgments). Measured before each widening landed, with each of the 146 runs of six digits or
 *  more in the 99 opinions and the 21 real files' text a row: 478 finds before and after, and
 *  none of the 21 files held; none of the 1,268 TAB judgments and 99 opinions writes one of the
 *  separators WL-5 added between two digits. */
export const DIGIT_SEP = /^(?:[\t\p{Zs}\p{Pd}./·•․‧−∙⋅⸱・･]| - |\) )$/u;
/** a base character and the marks on it, composed together: the one place NFC can join two */
const CLUSTER = /\P{M}\p{M}*|\p{M}+/gu;
/** A token — what stands between two spaces as written — that is not a word of prose: one that
 *  carries a digit, or a dot, a slash, a backslash, a colon, an @, an underscore or a # with a
 *  letter or a digit on both sides of it ("www.kestrelcorp.com", "kestrel_capital",
 *  "porter2024"), where a name is found inside a word from RUN_FLOOR (refFind 'text', owner
 *  ruling 8). A sentence's full stop or colon has nothing after it in its token, and
 *  "_reporter_" (emphasis typed by hand) has nothing before its first underscore, so neither
 *  makes a word something other than prose. An @ or a # that a token starts with does (HANDLE):
 *  "@kestrelholdings" is a handle and "#kestrelcapitaldeal" a tag, and read as prose each shipped
 *  a row whole where "kestrelholdings@gmail.com" masked it (the #: P1-F6, owner ruling 18).
 *  Measured before each landed: 50 tokens of the 99 opinions and the 21 real files' text start
 *  with an @; 38 start with a # and 17 carry one after a letter, all code in one file
 *  ("#define", "com.example#GetData"); TAB's 12,805 names as a table were found in none of them.
 *  The cost the ruling accepts: a plain word a # starts is read as a tag too, and "#supporters"
 *  beside a row "Porter" goes out "#sup[Person1]s". */
const JOINER = /[./\\:@_#]/;
/** what a token starts with that makes it no word of prose however it goes on: a handle, a tag */
const HANDLE = /^[@#]$/;
/** One letter or digit as refFind compares it (compactOf): in small letters with its marks taken
 *  off, and a character Unicode writes as another form of letters and digits (its compatibility
 *  decomposition, NFKD) read as those — a ligature ("ﬁ" is "fi", "Griﬃths" the row "Griffiths"),
 *  a letter in a mathematical alphabet, a superscript digit. A form that holds anything else stays
 *  as it is ("½" is "1⁄2", which no reader takes for twelve). Can be more than one letter, or none
 *  (a half-width sound mark is a mark), so compactOf maps each back to the character it came
 *  from. Until owner ruling 19c the fold was NFD alone, which leaves "ﬃ" one letter, and "Mr
 *  Griﬃths" shipped from the body and the .txt beside a row "Griffiths". Measured before it
 *  landed: TAB's names and the caption parties over the 99 opinions and the 21 real files' text,
 *  the same finds with it and without it. Plain ASCII is its own small letter, asked first: two
 *  normalisations a character are most of what reading a 2.5 MB file's text costs. Exported for
 *  a reader that must compare as refFind does. */
export function refFold(ch: string): string {
  if (ch.charCodeAt(0) < 0x80) return ch.toLowerCase();
  const k = ch.normalize('NFKD');
  const src = k !== ch.normalize('NFD') && /^[\p{L}\p{N}\p{M}]+$/u.test(k) ? k : ch;
  return src.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}
/** A character Unicode files as a symbol that a reader reads as a letter or as a tag's mark, as
 *  compactOf reads it. A letter drawn in a circle or a square ("ⓜⓐⓡⓖⓐⓡⓔⓣ", "🄺🄴🅂🅃🅁🄴🄻", and the
 *  filled forms a fancy-text tool writes, "🅼🅰🆁🅶"): each was a separator, since refFold is asked
 *  only of a letter or a digit, and a name written in them shipped from every place and the .txt
 *  (WL-6). The filled forms have no compatibility decomposition and are counted from their
 *  block's start. A letter in brackets ("⒜", "(a)" to NFKD) stays a symbol, as "½" stays. The
 *  small number sign and commercial at of CJK text and the music sharp ("﹟", "﹫", "♯"), which
 *  foldFullwidth does not reach: "﹟kestrelcapitaldeal" and "♯kestrelcapitaldeal" were read as
 *  prose and shipped beside a row "Kestrel Capital" where "#kestrelcapitaldeal" was masked
 *  (WL-7, W7F-3; owner ruling 18). Measured before it landed: none of the 1,268 TAB judgments
 *  and 99 opinions writes one of these characters. */
function symbolRead(ch: string): string {
  const u = ch.codePointAt(0)!;
  if (u < 0x24b6) return ch;
  if (u <= 0x24e9 || (u >= 0x1f130 && u <= 0x1f149)) return ch.normalize('NFKD');
  if (u >= 0x1f150 && u <= 0x1f169) return String.fromCharCode(0x41 + u - 0x1f150);
  if (u >= 0x1f170 && u <= 0x1f189) return String.fromCharCode(0x41 + u - 0x1f170);
  return u === 0xfe5f || u === 0x266f ? '#' : u === 0xfe6b ? '@' : ch;
}
function compactOf(s: string, map: boolean, viewed = false): Compact {
  // read in gatewayWritten's view, one character for one (it only ever writes a "%" where an
  // escape was written some other way), unless `s` is that view already
  const f = viewed ? fold(s) : gatewayWritten(fold(s));
  const chars: string[] = [], at: number[] = [], end: number[] = [], space: boolean[] = [];
  // a run of percent-escapes is read as the characters it writes, at the escapes that wrote it,
  // and so is a character reference typed out as text where no percent sign stands (pctRuns
  // reads both wherever one does)
  const runs = f.includes('%') ? pctRuns(f) : [];
  const refs = !runs.length && !f.includes('%') && f.includes('&') ? pctRuns(f) : runs;
  let r = 0;
  const push = (ch: string, a: number, b: number, sp: boolean) => { chars.push(symbolRead(ch)); space.push(sp); if (map) { at.push(a); end.push(b); } };
  for (const m of f.matchAll(CLUSTER)) {
    const i = m.index!;
    if (refs.length) {
      while (r < refs.length && refs[r].e <= i) r++;
      if (r < refs.length && i >= refs[r].s) {
        // a line break inside an escape no character comes of, kept as written, ends a token as
        // one outside it does (PCT_RUN_BR)
        if (i === refs[r].s) for (const [ch, a, b] of refs[r].units) { const u = ch.replace(REF_INVISIBLE, ''); if (u) push(u, a, b, b - a === 1 && /\s/.test(u)); }
        continue;
      }
    }
    const cl = m[0].replace(REF_INVISIBLE, '');
    if (!cl) continue;
    for (const ch of cl.normalize('NFC')) push(ch, i, i + m[0].length, /\s/.test(ch));
  }
  const is = (re: RegExp) => (x: string | undefined) => x !== undefined && re.test(x);
  const L = is(/\p{L}/u), N = is(/\p{N}/u), Lu = is(/\p{Lu}/u), Ll = is(/\p{Ll}/u), cjk = is(REF_CJK);
  const cuts = new Set<number>([0]);
  const seps: number[] = [];
  const from: number[] = [], to: number[] = [];
  const npAt: number[] = [];
  const cap: number[] = [], dsep = new Set<number>();
  // what stands since the last letter or digit, and whether that was a digit (DIGIT_SEP)
  let gap = '', lastN = false;
  let c = '';
  // the token being read: where it starts in `c`, whether a letter or digit stood in it yet, a
  // joiner after one, and whether it is prose
  let tok = 0, seen = false, joined = false, np = false;
  const close = () => { if (np) npAt.push(tok, c.length); tok = c.length; seen = joined = np = false; };
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i], p = chars[i - 1];
    if (space[i]) close();
    if (!L(ch) && !N(ch)) {
      if ((seen && JOINER.test(ch)) || (!seen && HANDLE.test(ch))) joined = true;
      if (!/\p{M}/u.test(ch)) { cuts.add(c.length); if (seps[seps.length - 1] !== c.length) seps.push(c.length); }
      if (!/\p{M}/u.test(ch)) gap += ch;
      continue;
    }
    if (N(ch) && lastN && DIGIT_SEP.test(gap)) dsep.add(c.length);
    gap = '';
    lastN = N(ch);
    if (joined || N(ch)) np = true;
    seen = true;
    // a run of capitals with a plural s after it and nothing more is one word before its s
    // (owner ruling 19e): read with a break before its last capital, "MRIs" was "MR" + "Is",
    // and a row "M.R." — a party named by initials — was masked in it at 14 places in one opinion
    const plural = chars[i + 1] === 's' && !L(chars[i + 2]) && !N(chars[i + 2]);
    if ((L(p) || N(p)) && ((Ll(p) && Lu(ch)) || (L(p) && N(ch)) || (N(p) && L(ch)) || cjk(p) || cjk(ch)
      || (Lu(p) && Lu(ch) && Ll(chars[i + 1]) && !plural) || (Lu(chars[i - 2]) && Lu(p) && Ll(ch)))) cuts.add(c.length);
    const low = refFold(ch);
    c += low;
    for (let x = 0; x < low.length; x++) cap.push(x === 0 && Lu(ch) ? 1 : 0);
    if (map) for (let x = 0; x < low.length; x++) { from.push(at[i]); to.push(end[i]); }
  }
  close();
  cuts.add(c.length);
  const npOut = new Uint8Array(c.length);
  for (let k = 0; k < npAt.length; k += 2) npOut.fill(1, npAt[k], npAt[k + 1]);
  return { c, cuts, seps, from, to, np: npOut, cap: Uint8Array.from(cap), dsep };
}
export function refCompact(s: string): { c: string; cuts: Set<number> } {
  const { c, cuts } = compactOf(s, false);
  return { c, cuts };
}
/** Whether `token` (what stands between two spaces as written) is no word of prose — JOINER, a
 *  digit, or a handle's or a tag's first character — so that refFind 'text' finds a name inside
 *  it from RUN_FLOOR. compactOf's own reading, for a caller that must agree with it (engine.ts). */
export function nonProseToken(token: string): boolean {
  return compactOf(token, false).np.includes(1);
}
/** The mask's names, compacted. One letter is too little to read a name by; a SHORT name of
 *  digits alone is left to the rows' own matching, which keeps numbers apart: compacted, a
 *  "Table_1_3" counter and a "Heading13" style both carry 13, and a row "13" (a child's age)
 *  held the file over them (measured 2026-09-23). From six digits a row of digits is a number
 *  someone declared — a matter or an account — and is looked for like a name: until 2026-09-23
 *  every row of digits was left out here, and a bookmark carrying a declared matter number was
 *  neither renamed nor held (A23-2). */
export const refNames = (mask: MaskFn): RefName[] => [...new Set(mask.names ?? [])].map((name) => { const { c, cuts } = refCompact(name); return { name, c, cuts }; }).filter((n) => n.c.length >= 2 && (/\p{L}/u.test(n.c) || n.c.length >= 6));

/** From how many letters and digits a name of the table is found run together with what stands
 *  beside it, with no place a word breaks at either end: "kestrelholdings", "KestrelCapitalFund",
 *  "margarettanfile". Below it a name is found only between two places a word can break (the
 *  reading above), since inside a word a short name is mostly another word: measured over the 21
 *  real .docx files with the 9,454 distinct names of people and organisations TAB's annotators
 *  marked in 1,268 real judgments standing in for a table (none of them these files' parties, so
 *  every find is a false one), a name read this way stood in a value, a part's name or an element
 *  or attribute name in 17 of the 21 files from four characters and in 15 from five, six or seven
 *  — in each of the 15 only "customs" inside Word's own attribute name w:customStyle, which is not
 *  read (a name of the file format's own vocabulary), and in one file a font's name, which is
 *  renamed rather than held. In text, where a find is masked and never held, the 99 opinions of
 *  this repository held 662 finds from four characters and 116 from six (65 of them "contra" in
 *  "contract"): a table of 20 names masks inside a word in 1.4% of them from four, 0.26% from
 *  six. Six is also where a row counts in a number or a code word (MACHINE), so the receipt
 *  states one number. A row of digits alone is found this way too, wherever its digits stand
 *  together (owner ruling 9, 2026-09-24): a client number declared as a row stood inside an
 *  IBAN, a wire or DMS reference and a matter number with a prefix, and the safety-net pattern,
 *  which reads a number whole, masked none of them (SEAM-DIGITS-RUN). Word's own generated ids
 *  (w14:paraId, w:rsid…, bookmark, comment and numbering ids) are read for it as every other
 *  value is: with the 36 runs of six digits or more in the 21 real files' own text (5 files) as
 *  rows, none of them held its file, so none is exempt (the ruling's measure). A row whose
 *  digits stand in one of Word's own values holds the file that carries it: "100000" (a
 *  theme's gradient stop), "114300" (a drawing's margin), "000000" (black). Owner ruling (1),
 *  2026-09-23: a confirmed row or a listed term run together ships from no value in any part. */
export const RUN_FLOOR = 6;
const nameCuts = (n: RefName): Set<number> => (n.cuts ??= refCompact(n.name).cuts);
/** One place a name of the table stands in a value, at the value's own offsets (`s`, `e`: the
 *  characters that make it, the separators inside it included). */
export interface RefFind { s: number; e: number; name: string; long?: number }
/** the one designator a party's name is written short in and its word written whole: "Hickson
 *  Corp" is the party in "Hickson Corporation", "Ford Motor Co" in "Ford Motor Company" */
const LONG_FORM: Record<string, string> = { co: 'company', corp: 'corporation', inc: 'incorporated' };
/** Where a name stands in text a reader sees (refFind 'text'), owner ruling 8 (2026-09-24): a
 *  party's name masked inside an ordinary word tells the model something false about who did
 *  what ("Mr [Person1], a sup[Person1] of the im[Person1]"; "W[Person1] gave evidence after
 *  [Person1]"), and a name left readable inside a web address or a handle discloses it; where
 *  the two conflict the leak rule wins. So a find counts where each of its ends is a place a
 *  word breaks (compactOf: a separator, letters meeting digits, a small letter meeting a
 *  capital — "AcmeHoldings", "KestrelLLP" — or a name's words run together, owner ruling 1);
 *  at its end also before an English ending of the closed list, s or es and then a break ("the
 *  Tans", "the Joneses"; a possessive is already bounded by its apostrophe), es only after a
 *  name that takes it (-s, -x, -z, -ch, -sh), since "Lines" is not the Lins, and either only
 *  after a name whose last word has three letters or more, since "H.A." is not in "has" nor "LO"
 *  in "Los", and is written with its capital, since "the officers" are not the Officers (a row
 *  "Officer", "Court" or "Agent" was masked in every officers, courts and agents of a text until
 *  2026-09-24, W-FID-ENDING-NOUNS); and, from RUN_FLOOR, at either end inside a token that is not a word of prose
 *  (JOINER: "www.kestrelcorp.com", "kestrel_capital", "porter2024", "@kestrelholdings", "#kestrelcapitaldeal"). Never
 *  inside a plain word of letters: a row "Tan" is not in "Tang", "Ong Wei Ming" not in "Wong Wei
 *  Ming", "Porter" not in "supporter", "reporter" or "Porterfield", and "Kestrel" not in
 *  "kestrelholdings" — which a reader cannot tell from "Porterfield" by any of its characters. Until 2026-09-24 a find inside
 *  a word counted from RUN_FLOOR while the word ran on by fewer than three letters (W3-1, W3-4).
 *  Measured with TAB's 12,805 names of people and organisations as a table over the 99 opinions
 *  of this repository (none of them a party there): finds inside a word 3,584 → 2,805, inside a
 *  plain word of letters 2,237 → 13 (nine where a run of capitals ends before a small letter,
 *  "ISPs" read as "IS" + "Ps", a break compactOf made until owner ruling 19e; four an ending in
 *  capitals, "ILCS"), and → 5 once a run of capitals before a plural s was one word: 36 finds
 *  fewer in the opinions (a row "M.R." or "Mr" in "MRIs", 14 places each) and 209 in the 21 files,
 *  none added and no caption party's lost; the ending adds 1,445, nearly all a common noun's plural ("State" in "United States",
 *  1,140), and in the 21 real .docx files a row "IRA" is masked in "IRAS", another agency's name,
 *  30 times. With each opinion's own caption parties as its rows no find of a party was lost and
 *  29 plurals are newly masked ("the Bragas", "the Smoaks'"); docx-parts.mjs law 58 holds the
 *  ruling's cases. The capital took 791 of the ending's finds out of the opinions and 328 out of
 *  the 21 files, every one a plural in small letters ("officers" 106 times, "courts" 101,
 *  "agents" 274), and none of a caption party's. One exception is kept from the old rule: the designator a party's name is
 *  written short in and its word written whole (LONG_FORM), where the word run on is the name's
 *  own word ("Hickson Corp" in "Hickson Corporation": without it the repository's opinions left
 *  21 captions' parties readable; the mask covers the word whole, longTo), and only after the name's first word, since a row "Co" is not
 *  in "company". Not in 'all' or 'run': there a find holds the file, and a false hold is the safe
 *  way to be wrong. */
function textHolds(k: Compact, at: number, len: number, n: RefName, loose: boolean): boolean {
  const e = at + len;
  if (!k.cuts.has(at) && !(loose && k.np[at])) return false;
  if (k.cuts.has(e) || (loose && k.np[e - 1])) return true;
  const c = k.c;
  const own = [...nameCuts(n)].filter((x) => x < len);
  const last = own.length ? Math.max(...own) : 0;
  const tail = n.c.slice(last);
  if (/^\p{L}{3,}$/u.test(tail) && k.cap[at + last]) {
    if (c.charCodeAt(e) === 115 /* s */ && k.cuts.has(e + 1)) return true;
    if (c.startsWith('es', e) && k.cuts.has(e + 2) && /(?:s|x|z|ch|sh)$/.test(tail)) return true;
  }
  return longTo(k, at, len, n) > 0;
}
/** Where in `k.c` the designator a find at `at` carries written whole ends (LONG_FORM), or 0. The
 *  find is the name as written short, and the mask covers the word written whole with it
 *  (RefFind.long, owner ruling 19a): masked short, "Hickson Corporation" went out as
 *  "[Company1]oration", which told the model a party's name and left it half a word. */
function longTo(k: Compact, at: number, len: number, n: RefName): number {
  const own = [...nameCuts(n)].filter((x) => x < len);
  const last = own.length ? Math.max(...own) : 0;
  const tail = n.c.slice(last);
  const long = last > 0 ? LONG_FORM[tail] : undefined;
  return long && k.c.startsWith(long, at + last) && k.cuts.has(at + last + long.length) ? at + last + long.length : 0;
}
/** Where the table's names stand in `s` with nothing between their words: 'all' reads both ways
 *  — between two places a word can break (refCompact), and from RUN_FLOOR characters anywhere in
 *  a word, so long as every separator inside the find stands where the name's own words break
 *  ("Mark Estrella" does not carry "Kestrel", "Kestrel-CapitalFund" carries "Kestrel Capital");
 *  'run' the second way only; 'text' for text a reader sees, where two words are two words (read
 *  as 'all', "a new man" carried a row "Newman" and x with subscript i a row "Xi", W4-F5) and a
 *  name inside a word is found only where textHolds says. A percent-escape is read as the
 *  character it writes, at the escapes that wrote it, in every mode (pctRuns, owner ruling 10):
 *  "Margaret%20Tan" in a pasted link is the row "Margaret Tan", and a find there covers the
 *  escapes as written. A written tag, blanked with █ by the caller, is a
 *  wall: nothing is found across it ("Kestrel [Org2] Capital" does not carry "Kestrel Capital").
 *  So is REF_JOIN, between two values one call reads (readAll, identReadings): read as a
 *  separator, "Margaret" and "Tan", two values of a part, carried the row "Margaret Tan" once the
 *  mask itself placed names this way (engine.ts, 2026-09-23). `first`: stop at the first find;
 *  `map`: say where each one stands (otherwise `s` and `e` are 0); `viewed`: `s` is already
 *  gatewayWritten's view of what was written (pctHidden), so a Proofpoint link is not read twice. */
export function refFind(s: string, names: RefName[], how: 'all' | 'run' | 'text' = 'all', first = false, map = true, viewed = false): RefFind[] {
  const out: RefFind[] = [];
  if (!names.length || !s) return out;
  // a row of digits alone as much as one with a letter in it (owner ruling 9, RUN_FLOOR)
  const loose = (n: RefName) => n.c.length >= RUN_FLOOR && (/\p{L}/u.test(n.c) || /^\p{N}+$/u.test(n.c));
  const want = how === 'run' ? names.filter(loose) : names;
  if (!want.length) return out;
  const stretches: Array<{ t: string; at: number }> = [];
  let from = 0;
  for (const piece of s.split(REF_JOIN)) {
    for (const m of piece.matchAll(/[^█]+/gu)) stretches.push({ t: m[0], at: from + m.index! });
    from += piece.length + REF_JOIN.length;
  }
  for (const st of stretches) {
    const k = compactOf(st.t, map, viewed);
    const base = st.at;
    for (const n of want) {
      const len = n.c.length;
      const runs = loose(n);
      // every separator inside the find stands where the name's own words break, found by
      // binary search: a body can hold a hundred thousand; in text a reader sees, a row of
      // digits is found across the one character that groups a number's digits (DIGIT_SEP)
      const grouped = how === 'text' && /^\p{N}+$/u.test(n.c);
      const ownSeps = (at: number) => {
        let lo = 0, hi = k.seps.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (k.seps[mid] <= at) lo = mid + 1; else hi = mid; }
        const own = nameCuts(n);
        for (let q = lo; q < k.seps.length && k.seps[q] < at + len; q++) if (!own.has(k.seps[q] - at) && !(grouped && k.dsep.has(k.seps[q]))) return false;
        return true;
      };
      for (let at = k.c.indexOf(n.c); at >= 0; at = k.c.indexOf(n.c, at + 1)) {
        let ok: boolean;
        if (how === 'text') ok = ownSeps(at) && textHolds(k, at, len, n, runs);
        else {
          ok = how === 'all' && k.cuts.has(at) && k.cuts.has(at + len);
          if (!ok && runs) ok = ownSeps(at);
        }
        if (!ok) continue;
        const to = map && how === 'text' && !k.cuts.has(at + len) ? longTo(k, at, len, n) : 0;
        if (!map) out.push({ s: 0, e: 0, name: n.name });
        else if (to) out.push({ s: base + k.from[at], e: base + k.to[at + len - 1], name: n.name, long: base + k.to[to - 1] });
        else out.push({ s: base + k.from[at], e: base + k.to[at + len - 1], name: n.name });
        if (first) return out;
      }
    }
  }
  return out;
}
/** the first of `names` a value carries (refFind, both ways), or null */
export function refCarries(ref: string, names: RefName[]): string | null {
  return refFind(ref, names, 'all', true, false)[0]?.name ?? null;
}
/** the first of `names` a number, an id or a code word carries run together, from RUN_FLOOR
 *  characters (refFind 'run'), or null: "upperRoman" is Word's own word and does not carry a row
 *  "Roman", and "kestrelholdings" carries "Kestrel" */
export function runCarries(ref: string, names: RefName[]): string | null {
  return refFind(ref, names, 'run', true, false)[0]?.name ?? null;
}
/** An identifier is letters, digits and underscores (a style id, a field's word, a shape's
 *  spid). Anything else — a path, a URI, a CSS string — is read as written and with its
 *  underscores as spaces; only an identifier is cut into its words. */
export const IDENT = /^[\p{L}\p{N}_]{1,80}$/u;
/** The value as written, with its underscores as spaces, and each identifier in it cut into its
 *  words: the whole value when it is one, or each identifier a list, a path or a spaced value
 *  holds. Until 2026-09-23 only a value that was one identifier was cut, and "B1,KestrelBody" (a
 *  style's aliases), "word/KestrelNotes.xml" (a part's name) and "KestrelHoldings Ltd" shipped
 *  the name under a gate that passed (W3-B). */
export function identReadings(v: string): string[] {
  const out = [v];
  if (v.includes('_')) out.push(v.replace(/_/g, ' '));
  if (IDENT.test(v)) { const w = refWords(v); if (w) out.push(w); }
  else for (const tok of new Set(v.match(/[\p{L}\p{N}_]+/gu) ?? [])) { if (tok.length > 80) continue; const w = refWords(tok); if (w) out.push(w); }
  return out;
}
/** A row's placement inside an identifier counts unless it is digits alone and short: "13"
 *  (a child's age) stands in Heading13 and Clause_1_3 and names neither. */
export const countsInIdent = (reading: string, h: { s: number; e: number }) => {
  const d = reading.slice(h.s, h.e).replace(/[^\p{L}\p{N}]/gu, '');
  return /\p{L}/u.test(d) || d.length >= 6;
};
/** Values Word writes for itself: numbers and measures, hex ids (a paragraph id, a font
 *  signature), GUIDs, dates. The safety-net pattern is not run on them — a z-index of 251659264
 *  is a [number] to it, a paragraph id of 61234567 a [phone], a GUID's digits a [card] (measured
 *  2026-09-23), and every file Word saves carries thousands — and a row of the table counts on
 *  them only from six characters. */
export const MACHINE = /^(?:[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?:%|pt|px|in|cm|mm|pc|em|emu|fd|f)?|(?=[0-9A-Fa-f]*\d)[0-9A-Fa-f]+|\{?[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}?|\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[-+]\d{2}:?\d{2})?)?)$/;
/** A GUID, whole: the one value of a part the writer does not know that the safety-net pattern
 *  is not run on (owner ruling 2). It is 32 hex digits a program drew at random, and two of its
 *  groups that happen to be digits alone read as a telephone number ("{0F1E2D3C-4B5A-6978-8796-
 *  A5B4C3D2E1F0}" is "[phone]" to it, and the empty GUID two "[card]"s): 162 of 5,000 random
 *  GUIDs under each of us, uk, sg and au (3.2%; 2026-09-23), so a part holding twenty held about
 *  one time in two, at random and on a value no one can see or retype in Word. No one types a
 *  number into a GUID. */
export const GUID_VALUE = /^\{?[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}?$/;
/** Every value of a part the writer does not know, folded, as the safety net reads it (owner
 *  ruling 2, 2026-09-23): a telephone, card, account or identity number an add-in keeps as a code
 *  ("61234567", "S1234567D") was kept as a number under a note that said so. Its text, its
 *  attribute values and the addresses it declares, a schema address past the format's own words
 *  (schemaRest); not a GUID (GUID_VALUE), a namespace the format defines, or a processing
 *  instruction. The writer holds the part on a safety-net hit in any of them; the finish reads
 *  a saved part the same way, so a change of practice that lets one through is seen. */
export function unknownPartValues(tree: XNode[]): string[] {
  const all: string[] = [];
  // each value as written and, where it has escapes, as they read (pctDecoded, owner ruling 10):
  // "tel%3A6123%204567" is a telephone number to no reading as written
  const out = { push: (v: string) => { all.push(v); if (/[%&]/.test(v)) { const d = pctDecoded(v); if (d !== v) all.push(d); } } };
  const name = (q: string) => { if (/\d/.test(q)) { const r = netName(q); if (r.trim()) out.push(fold(r)); } };
  const visit = (nodes: XNode[]) => {
    for (const x of nodes) {
      const t = tagOf(x);
      if (!t || t.startsWith('?')) continue;
      if (t === '#text') { const v = String(x['#text']).trim(); if (v && !GUID_VALUE.test(v)) out.push(fold(v)); continue; }
      name(t);
      for (const [k, v] of Object.entries((x[':@'] || {}) as Record<string, string>)) {
        name(k);
        const r = schemaRest(String(v));
        const val = r === null ? String(v) : r;
        if (val.trim() && !KNOWN_NS.has(val) && !GUID_VALUE.test(val.trim())) out.push(fold(val));
        // a compatibility list is names, read as a name is
        if (MC_LISTS.has(k.slice(k.indexOf(':') + 1)) || k === 'Requires') name(String(v));
      }
      visit(x[t]);
    }
  };
  visit(tree);
  return all;
}
/** A name in the markup, or a part's name, as the safety net can read it: a GUID blanked (no
 *  one types a number into one), each separator a space, and a space where letters meet
 *  digits. As written, "tel_61234567" reads as a number but "x2125550147", "ssn123-45-6789"
 *  and "acme:n123-45-6789" do not, and each shipped as an element's, an attribute's or a
 *  part's name in a part the writer does not know (W5R-6, 2026-09-23). Not a picture's name:
 *  "image20240101123456.png" read this way is a card number. */
export function netName(v: string): string {
  return v.replace(/\{?[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}?/g, ' ')
    .replace(/[_:/.]+/g, ' ')
    .replace(/(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/gu, ' ');
}
/** an attribute holding an address is read by the whole mask, the safety-net pattern's email
 *  rule included, whatever its element */
export const EMAILISH = /[^\s@<>"]+@[^\s@<>"]+\.[A-Za-z]{2,}/;

/** One reading's hits, in its own offsets. `floor`: the safety-net pattern's, not a row's. */
interface Hit { s: number; e: number; tag: string; floor: boolean }
/** readings joined per call: a call's fixed cost is paid once per chunk, not once per value */
const CHUNK = 1 << 18;
/** Mask many readings in few calls: joined with REF_JOIN, masked once per chunk, the hits handed
 *  back to the reading they fall in. A file carries tens of thousands of attribute values; read
 *  one call each, the gate cost more than the write. */
function readAll(mask: MaskFn, readings: string[]): { hits: Hit[][]; divergence: string | null } {
  const hits: Hit[][] = readings.map(() => []);
  let i = 0;
  while (i < readings.length) {
    let text = '';
    const starts: number[] = [];
    const idx: number[] = [];
    for (; i < readings.length && (!idx.length || text.length + readings[i].length < CHUNK); i++) {
      if (idx.length) text += REF_JOIN;
      starts.push(text.length);
      idx.push(i);
      text += readings[i];
    }
    const m = mask(text);
    if (m.divergence) return { hits, divergence: m.divergence };
    const put = (iv: MaskInterval, floor: boolean) => {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= iv.s) lo = mid; else hi = mid - 1; }
      const r = idx[lo];
      hits[r].push({ s: iv.s - starts[lo], e: Math.min(iv.e - starts[lo], readings[r].length), tag: iv.tag, floor });
    };
    for (const p of m.placements) put(p, false);
    for (const f of m.floorHits) if (!f.exempt) put(f, true);
  }
  return { hits, divergence: null };
}

// ---------- styles ----------
/** Style renames, found before any part is written: a paragraph in a header and the style it
 *  names in styles.xml must land on the same new id. `ids` is keyed as written (Word matches a
 *  style id exactly), `names` lower case (a TOC's \t switch and STYLEREF name a style by its
 *  name, and Word matches those without regard to case). */
interface StyleMap { ids: Map<string, string>; names: Map<string, string>; dropAliases: Set<string> }
/** A style is renamed "Redacted style N" (id RedactedStyleN) when its name, its id or its
 *  aliases place, or its id or name carries one of the table's names (refCarries): a character
 *  style "Kestrel Emphasis", a table style "HarrowLeungGrid" or a header's paragraph style
 *  named after the client shipped in every paragraph that used it until 2026-09-23. A style
 *  nothing places keeps its name, so the recipient's Styles pane still reads "Heading 1". The
 *  aliases of a renamed style go (they are alternative names, and optional). A latent-style
 *  exception that names nothing defined and places is renamed the same way.
 *
 *  A built-in style (BUILTIN_STYLE) is never renamed for its name, nor for an id that is that
 *  name without spaces; an alias of one that places goes on its own (dropAliases, by id).
 *  `renamed` counts the styles defined in the file, once each: it read 0 when a latent-style
 *  entry of the same name came first. */
function scanStyles(trees: XNode[][], mask: MaskFn, names: RefName[]): { map: StyleMap; renamed: number; given: string[]; idOnly: number; divergence: string | null } {
  const map: StyleMap = { ids: new Map(), names: new Map(), dropAliases: new Set() };
  const entries: Array<{ id?: string; name?: string; aliases?: string }> = [];
  const visit = (nodes: XNode[]) => {
    for (const n of nodes) {
      const t = tagOf(n);
      if (!t || t === '#text') continue;
      const a = n[':@'] || {};
      if (t === 'w:style') {
        const kids = n[t] as XNode[];
        const val = (k: string) => { const c = kids.find((x) => k in x); return c ? String((c[':@'] || {})['w:val'] ?? '') : undefined; };
        entries.push({ id: a['w:styleId'] !== undefined ? String(a['w:styleId']) : undefined, name: val('w:name'), aliases: val('w:aliases') });
        continue;
      }
      if (t === 'w:lsdException' && a['w:name'] && !BUILTIN_STYLE.test(String(a['w:name']).trim())) { entries.push({ name: String(a['w:name']) }); continue; }
      visit(n[t]);
    }
  };
  trees.forEach(visit);
  const builtin = (e: { name?: string }) => !!e.name && BUILTIN_STYLE.test(e.name.trim());
  // what of an entry is read: a built-in's name and its own id are Word's words
  const readsName = (e: { name?: string }) => !builtin(e);
  const readsId = (e: { id?: string; name?: string }) => e.id !== undefined && !(builtin(e) && idOfName(e.id, e.name!));
  const readings: string[] = [];
  // `floor`: the safety-net pattern counts on this reading — a name or an alias as typed, and an
  // id as written and with its underscores as spaces: an author types an id as surely as a name,
  // and "Memo_123-45-6789" shipped a Social Security number in every paragraph that used the
  // style (P2, 2026-09-23). Never on the id cut into words, where "Schedule123456789" would read
  // as a long number.
  const owner: Array<{ k: number; text: boolean; floor: boolean; alias: boolean }> = [];
  const add = (k: number, v: string | undefined, text: boolean, alias = false) => {
    if (!v || !v.trim()) return;
    const f = fold(v);
    if (text) { readings.push(f); owner.push({ k, text: true, floor: true, alias }); }
    identReadings(f).forEach((r, j) => { readings.push(r); owner.push({ k, text: false, floor: styleFloor(j, f), alias }); });
  };
  // a style's aliases are a list ("B1,KestrelBody"), each alias a name of its own
  const aliasesOf = (e: { aliases?: string }) => (e.aliases ?? '').split(/[,;]/).map((a) => a.trim()).filter(Boolean);
  entries.forEach((e, k) => {
    if (readsName(e)) add(k, e.name, true);
    if (readsId(e)) add(k, e.id, false);
    for (const a of aliasesOf(e)) add(k, a, true, true);
  });
  const { hits, divergence } = readAll(mask, readings);
  if (divergence) return { map, renamed: 0, given: [], idOnly: 0, divergence };
  const places = new Set<number>();
  const alias = (k: number) => { const e = entries[k]; if (builtin(e)) { if (e.id !== undefined) map.dropAliases.add(e.id); } else places.add(k); };
  hits.forEach((h, i) => {
    const o = owner[i];
    if (!h.some((x) => (x.floor ? o.floor : o.text || countsInIdent(readings[i], x)))) return;
    if (o.alias) alias(o.k); else places.add(o.k);
  });
  entries.forEach((e, k) => {
    if ((readsId(e) && refCarries(e.id!, names)) || (readsName(e) && e.name && refCarries(e.name, names))) places.add(k);
    if (aliasesOf(e).some((a) => refCarries(a, names))) alias(k);
  });
  const taken = new Set(entries.flatMap((e) => [e.id, e.name]).filter((x): x is string => !!x).map((x) => x.toLowerCase()));
  let n = 0;
  const defined = new Set<number>();
  // what Word shows for each style renamed: its new name, or the new id of a style with no name
  const shown = new Map<number, string>();
  for (const k of [...places].sort((a, b) => a - b)) {
    const e = entries[k];
    // a built-in renamed for its id alone keeps its name
    const key = readsName(e) ? e.name?.toLowerCase() : undefined;
    // the same style again (styles.xml and stylesWithEffects.xml carry the same definitions)
    const had = (e.id !== undefined && map.ids.get(e.id)) || (key !== undefined && map.names.get(key));
    let num: number;
    if (had) num = Number(/(\d+)$/.exec(had)![1]);
    else { do n++; while (taken.has(`redactedstyle${n}`) || taken.has(`redacted style ${n}`)); num = n; }
    if (e.id !== undefined) { map.ids.set(e.id, `RedactedStyle${num}`); defined.add(num); }
    if (key !== undefined) { map.names.set(key, `Redacted style ${num}`); if (e.id !== undefined) shown.set(num, `Redacted style ${num}`); }
    else if (e.id !== undefined && !builtin(e) && !shown.has(num)) shown.set(num, `RedactedStyle${num}`);
  }
  // `given`: the names the copy carries, for the receipt — a template that already has "Redacted
  // style 1" puts the first new one at 2, and a note that said 1 named the wrong style (W5-4).
  // `idOnly`: a style of Word's own renamed for its id alone keeps its name, and a note that
  // named "Redacted style 1" for it named a style the copy does not have (W-FID-6, 2026-09-23).
  const given = [...shown].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
  return { map, renamed: defined.size, given, idOnly: [...defined].filter((d) => !shown.has(d)).length, divergence: null };
}

// ---------- the structural pass ----------
/** Renames shared by every part: a link in the body and the bookmark it points at in a header,
 *  a LISTNUM field and the list it counts in numbering.xml, a font in the theme and on a run,
 *  must land on the same new name whichever part is written first. */
interface Shared {
  /** bookmark renames, keyed lowercase: Word matches a link to its bookmark without regard to case */
  renames: Map<string, string>;
  /** the bookmarks renamed where they stand, keyed lowercase: a link to a name no bookmark has
   *  is renamed too, and is not a bookmark the author made */
  marks: Set<string>;
  /** list definition names (List1 …) and caption labels (Label1 …), keyed lowercase, a label
   *  with its spaces as underscores as SEQ writes it */
  lists: Map<string, string>;
  labels: Map<string, string>;
  /** a chart formula's sheets (Sheet1 …) and named ranges (Name1 …), keyed lowercase */
  sheets: Map<string, string>;
  ranges: Map<string, string>;
  pivots: Map<string, string>;
  /** formulas and pivot sources that changed */
  formulas: number;
  /** VML shape ids renamed, and the number the next one takes (above every _x0000_ id in the file) */
  vml: Map<string, string>;
  vmlNext: number;
  /** font, theme and colour names: kind + folded lower-case name → the neutral name, or '' when
   *  nothing of it places */
  idents: Map<string, string>;
  identTaken: Set<string>;
  /** REF fields written out as the text they showed */
  refsUnlinked: number;
  /** internal links written as a field (HYPERLINK \l), written out as the text they showed:
   *  they no longer jump anywhere, and the receipt says so rather than that every link still
   *  points at its bookmark */
  linksUnlinked: number;
  /** the neutral names the file already carries (Label3, List1, Name2, PivotTable1), as written:
   *  a copy redacted before keeps them, so a new name starts at the first one free. Numbered
   *  from 1 regardless, "Exhibit" became a second Label1 and the table of exhibits counted two
   *  labels' captions as one (W3-G, 2026-09-23). */
  taken: Set<string>;
  /** charts whose print header and footer went (c:headerFooter) */
  chartHeaders: number;
  /** processing instructions removed (built) */
  instructions: number;
  /** XML declarations that carried more than a version, an encoding and a standalone (built) */
  declared?: number;
  /** comments and empty document type declarations removed from a kept SVG */
  comments?: number;
}
/** The next neutral name of a kind (Label, List, Name, PivotTable) the file does not already carry. */
function neutralNext(kind: string, st: PartState): string {
  let n = 1;
  while (st.shared.taken.has(`${kind}${n}`)) n++;
  st.shared.taken.add(`${kind}${n}`);
  return `${kind}${n}`;
}
interface PartState {
  part: string;
  keepImages: boolean;
  droppedIds: Set<string>;
  removed: WriteReport['removed'];
  warnings: string[];
  mask: MaskFn;
  /** the table's names, compacted (refNames): an identifier is read for them with nothing between its words */
  names: RefName[];
  shared: Shared;
  styles: StyleMap;
  /** masked attribute values, shared by every part: a font name is written on thousands of runs */
  memo: Map<string, { out: string; tags: string[] }>;
  /** tags written into this part's attributes and element text outside the flow */
  tags: Set<string>;
  written: number;
  /** set when a value could not be masked with certainty; the part is then held */
  held: string | null;
}

/** the label a number format is read by, in the writer (maskValue) and the gate (readAs) */
export const NUMBER_FORMAT = 'a number format';
/** Whether the safety-net pattern counts on the `j`th of a style's identReadings of `id`: the
 *  value as written, and with its underscores as spaces. Never on the id cut into words, where
 *  "Schedule123456789" reads as a long number. One rule for the rename (scanStyles) and the
 *  gate, so the two cannot disagree on what a style id may carry. */
export const styleFloor = (j: number, id: string): boolean => j === 0 || (j === 1 && id.includes('_'));
/** The stretches of a number format Word prints as written, each as [start, end): a quoted
 *  literal ("Kestrel ") and a character after a backslash. */
export function formatLiterals(code: string): Array<[number, number]> {
  return [...code.matchAll(/"[^"]*"?|\\[\s\S]/g)].map((m) => [m.index!, m.index! + m[0].length] as [number, number]);
}
/** the characters Excel prints in a number format as they stand, with no quotes or backslash */
const FORMAT_BARE = new Set([...'$-+/():!^&\'~{}<>= ']);
/** One stretch a number format prints: its text, and for each character its offset in the code
 *  and how it stood there — inside quotes ('q'), after a backslash ('e'), bare ('b') or as a
 *  currency section's symbol ('c', formatCurrency). */
export interface FormatRun { text: string; at: number[]; how: Array<'q' | 'e' | 'b' | 'c'> }
/** A currency section, [$symbol-locale]: Excel prints the symbol beside every value and reads
 *  the locale after the first hyphen (a hex LCID such as 409 or F800, "x-sysdate", a language
 *  tag). The symbol is typed text like a quoted literal — "[$Kestrel-409] 0" prints "Kestrel"
 *  beside each value — and every bracket was skipped as syntax until 2026-09-23 (INT-23,
 *  W6-2). The stretch of the code the symbol stands at, or null for a section that prints
 *  nothing; a section whose locale does not read as one is printed whole, so a doubt reads more
 *  text, never less. `j`: the index of its closing bracket. */
const FORMAT_LOCALE = /^(?:[0-9A-Fa-f]{1,8}|x-[a-z\d]+|[a-z]{2,3}(?:-[A-Za-z\d]{2,8})*)$/;
export function formatCurrency(code: string, i: number, j: number): [number, number] | null {
  const inner = code.slice(i + 2, j);
  const d = inner.indexOf('-');
  const end = d >= 0 && FORMAT_LOCALE.test(inner.slice(d + 1)) ? i + 2 + d : j;
  return end > i + 2 ? [i + 2, end] : null;
}
/** A number format read as it prints: each stretch of literals that stand together — quoted
 *  runs, characters after a backslash and the characters Excel prints bare — joined into the
 *  text it shows. Excel stores a custom format's literals escaped one character at a time
 *  (\1\2\3\-\4\5…) or in several quoted runs ("123"-"45"-…), and read as written, or one quoted
 *  run or escape at a time (formatLiterals), no pattern finds the number: "123-45-6789" in a data
 *  label's format shipped under US practice with the gate passing (W4-F2, W5-5, 2026-09-23). A
 *  currency section's symbol prints in line with the literals around it (formatCurrency). A
 *  code character (0 # ? . , % d m y h s E @ …), any other [bracket] (a colour, a condition, an
 *  elapsed time), a _ or * with the character after it, or a section's ; ends a stretch. */
export function formatRuns(code: string): FormatRun[] {
  const runs: FormatRun[] = [];
  let cur: FormatRun | null = null;
  const put = (i: number, how: FormatRun['how'][number]) => { const r = (cur ??= { text: '', at: [], how: [] }); r.text += code[i]; r.at.push(i); r.how.push(how); };
  for (let i = 0; i < code.length;) {
    const c = code[i];
    if (c === '"') { let j = i + 1; for (; j < code.length && code[j] !== '"'; j++) put(j, 'q'); i = j + 1; continue; }
    if (c === '\\' && i + 1 < code.length) { put(i + 1, 'e'); i += 2; continue; }
    if (FORMAT_BARE.has(c)) { put(i, 'b'); i++; continue; }
    if (c === '[' && code[i + 1] === '$') {
      const j = code.indexOf(']', i);
      const end = j < 0 ? code.length : j;
      const sym = formatCurrency(code, i, end);
      if (sym) for (let x = sym[0]; x < sym[1]; x++) put(x, 'c');
      i = end + 1;
      continue;
    }
    if (cur) runs.push(cur);
    cur = null;
    if (c === '[') { const j = code.indexOf(']', i); i = j < 0 ? code.length : j + 1; continue; }
    i += c === '_' || c === '*' ? 2 : 1;
  }
  if (cur) runs.push(cur);
  return runs;
}
/** A number format masked where it prints: the table's rows over the code as written (a row can
 *  stand anywhere in it), and the rows and the safety-net pattern over each stretch it prints
 *  (formatRuns). A hit is written over every character it covers, backslashes and inner quotes
 *  included, as a literal the code around it still parses: inside the quotes it stood in, or in
 *  quotes of its own ('\1\2\3\-…\9 0' → '"[ssn]" 0'). */
function maskFormat(value: string, flow: string, st: PartState): { out: string; tags: string[] } | null {
  const runs = formatRuns(flow);
  const { hits, divergence } = readAll(st.mask, [flow, ...runs.map((r) => r.text)]);
  if (divergence) { st.held ??= `the mask could not certify a number format in ${st.part}: ${divergence}`; return null; }
  // whether each character of the code stands inside quotes
  const inq: boolean[] = [];
  for (let i = 0, q = false; i < flow.length; i++) {
    if (!q && flow[i] === '\\') { inq[i] = false; inq[++i] = false; continue; }
    if (flow[i] === '"') { inq[i] = false; q = !q; continue; }
    inq[i] = q;
  }
  const ivs: Array<{ s: number; e: number; tag: string }> = hits[0].filter((h) => !h.floor && h.e > h.s).map((h) => ({ s: h.s, e: h.e, tag: h.tag }));
  const inCode = (r: FormatRun, s: number, e: number) => ({ s: r.at[s] - (r.how[s] === 'e' ? 1 : 0), e: r.at[e - 1] + 1 });
  runs.forEach((r, k) => {
    for (const h of hits[k + 1]) if (h.e > h.s) ivs.push({ ...inCode(r, h.s, h.e), tag: h.tag });
  });
  // the table's names run together, in the code as written and where it prints (refFind)
  const run = runTags([...refSpans(flow, st.names), ...runs.flatMap((r) => refSpans(r.text, st.names).map((f) => ({ ...inCode(r, f.s, f.e), name: f.name })))], st.mask);
  if (typeof run === 'string') { st.held ??= `${run} (${NUMBER_FORMAT} in ${st.part})`; return null; }
  ivs.push(...run.ivs);
  if (!ivs.length) return { out: value, tags: [] };
  // A hit in a currency section takes the section whole: a quoted literal cannot stand inside
  // its brackets, and a section left with its symbol cut is a code Excel refuses. The locale
  // goes with it, and the value prints in the reader's own.
  const sections: Array<[number, number]> = [];
  for (let i = 0, q = false; i < flow.length; i++) {
    if (flow[i] === '"') { q = !q; continue; }
    if (q) continue;
    if (flow[i] === '\\') { i++; continue; }
    if (flow[i] !== '[') continue;
    const j = flow.indexOf(']', i);
    const e = j < 0 ? flow.length : j + 1;
    if (flow[i + 1] === '$') sections.push([i, e]);
    i = e - 1;
  }
  for (const iv of ivs) for (const [s, e] of sections) if (iv.s < e && iv.e > s) { iv.s = Math.min(iv.s, s); iv.e = Math.max(iv.e, e); }
  const merged: typeof ivs = [];
  for (const iv of ivs.sort((a, b) => a.s - b.s || b.e - a.e)) {
    const prev = merged[merged.length - 1];
    if (prev && iv.s < prev.e) { prev.e = Math.max(prev.e, iv.e); continue; }
    merged.push({ ...iv });
  }
  let out = '', pos = 0;
  for (const iv of merged) { out += value.slice(pos, iv.s) + (inq[iv.s] ? '' : '"') + iv.tag + (inq[iv.e - 1] ? '' : '"'); pos = iv.e; }
  return { out: out + value.slice(pos), tags: withTags(merged, run.tags) };
}

/** Mask text that lives outside the flow — an attribute, or the text of an element the walker
 *  does not list — in place. `mode` 'name' takes the table's rows only (the value is also
 *  syntax); 'text' takes the safety-net pattern too and must reproduce the mask's own text. */
function maskValue(value: string, mode: Mode, what: string, st: PartState): string {
  const key = `${mode}\u0000${what === NUMBER_FORMAT ? 'f' : ''}\u0000${value}`;
  let done = st.memo.get(key);
  if (!done) {
    const flow = fold(value);
    // a number format's literals are printed beside every value as the author typed them
    // ('"123-45-6789" 0' shipped a Social Security number under US practice, P2 2026-09-23), so
    // the safety-net pattern reads them as they print; the rest of the code is Word's syntax
    if (mode === 'name' && what === NUMBER_FORMAT) {
      const f = maskFormat(value, flow, st);
      if (!f) return value;
      done = f;
    } else {
      const m = st.mask(flow);
      if (m.divergence) { st.held ??= `the mask could not certify ${what} in ${st.part}: ${m.divergence}`; return value; }
      const ivs = mergedIntervals(mode === 'text' ? m : { ...m, floorHits: [] });
      if (mode === 'text' && applyIntervals(flow, ivs) !== m.text) { st.held ??= `the writer could not reproduce the masked text of ${what} in ${st.part} from its placements`; return value; }
      // the table's names run together ("KESTRELCAPITAL" across a watermark), where the mask
      // placed nothing: each stretch it placed is a wall (refFind)
      let blanked = flow;
      for (const iv of ivs) blanked = blanked.slice(0, iv.s) + '█'.repeat(iv.e - iv.s) + blanked.slice(iv.e);
      const run = runTags(refSpans(blanked, st.names, mode === 'text' ? 'text' : 'all'), st.mask);
      if (typeof run === 'string') { st.held ??= `${run} (${what} in ${st.part})`; return value; }
      const all = run.ivs.length ? foldIntervals([...ivs, ...run.ivs]) : ivs;
      done = { out: applyIntervals(value, all), tags: withTags(all, run.tags) };
    }
    st.memo.set(key, done);
  }
  for (const t of done.tags) st.tags.add(t);
  st.written += done.tags.length;
  return done.out;
}

/** A font, theme or colour name: Word finds the font by its whole spelling, so a tag inside it
 *  is as broken as a neutral name and says less. Replaced whole by "Redacted font N" (theme,
 *  colour) when the name as written places, or a reading of it as an identifier does, or it
 *  carries one of the table's names with nothing between its words — "KestrelSans",
 *  "HarrowLeung" shipped as a theme, a font and a custom colour under a passing gate until
 *  2026-09-23. One map for every part, so the theme, the font table and every run that names
 *  the font agree. */
function identValue(value: string, what: string, st: PartState): string {
  const v = value.trim();
  if (!v || STANDARD_FONT.test(v) || NEUTRAL_IDENT.test(v)) return value;
  const noun = IDENT_NOUN[what] ?? 'name';
  const f = fold(v);
  const key = `${noun}\u0000${f.toLowerCase()}`;
  let to = st.shared.idents.get(key);
  if (to === undefined) {
    const readings = identReadings(f);
    const { hits, divergence } = readAll(st.mask, readings);
    if (divergence) { st.held ??= `the mask could not certify ${what} in ${st.part}: ${divergence}`; return value; }
    const places = hits.some((h, i) => h.some((x) => (i === 0 ? true : !x.floor && countsInIdent(readings[i], x)))) || !!refCarries(f, st.names);
    to = '';
    if (places) {
      let n = 1;
      while (st.shared.identTaken.has(`${noun} ${n}`)) n++;
      st.shared.identTaken.add(`${noun} ${n}`);
      to = `Redacted ${noun} ${n}`;
    }
    st.shared.idents.set(key, to);
  }
  return to || value;
}

/** A VML shape's id, or a reference to one: renamed _x0000_sN unless Word wrote it (VML_MACHINE_ID).
 *  Keyed as written: VML matches ids exactly. */
function vmlId(id: string, st: PartState): string {
  if (!id || VML_MACHINE_ID.test(id)) return id;
  let to = st.shared.vml.get(id);
  if (!to) { to = `_x0000_s${++st.shared.vmlNext}`; st.shared.vml.set(id, to); st.removed.names++; }
  return to;
}
/** A VML shape's style is CSS, and Word reads the shape's place out of it
 *  ("mso-position-horizontal-relative:page"): it is never masked as text, where a row "Page" (a
 *  surname) rewrote that into "[Person3]" and the shape lost its anchor, or held every v:rect
 *  (2026-09-23). Two properties hold a name: font-family (a watermark's font) is a font name,
 *  mso-next-textbox (the box a story flows on into) a shape's id. The rest is Word's. */
function vmlStyle(style: string, st: PartState): string {
  return style.split(';').map((decl) => {
    const c = decl.indexOf(':');
    if (c < 0) return decl;
    const prop = decl.slice(0, c).trim().toLowerCase();
    const head = decl.slice(0, c + 1), val = decl.slice(c + 1);
    if (prop === 'font-family') return head + val.split(',').map((fam) => {
      const q = /^(\s*)(["']?)(.*?)\2(\s*)$/s.exec(fam)!;
      return q[1] + q[2] + identValue(q[3], 'a font name', st) + q[2] + q[4];
    }).join(',');
    if (prop === 'mso-next-textbox') {
      const m = /^(\s*#)(.*?)(\s*)$/s.exec(val);
      if (m) return head + m[1] + vmlId(m[2], st) + m[3];
    }
    return decl;
  }).join(';');
}

/** a caption label (Insert Caption's list, w:caption) or a SEQ field's counter, which is the
 *  label with its spaces as underscores */
function labelName(name: string, st: PartState): string {
  const v = name.trim();
  if (!v || WORD_LABEL.test(v) || NEUTRAL_NAME.test(v)) return name;
  const k = v.replace(/ /g, '_').toLowerCase();
  let to = st.shared.labels.get(k);
  if (!to) { to = neutralNext('Label', st); st.shared.labels.set(k, to); }
  return to;
}
function listName(name: string, st: PartState): string {
  const v = name.trim();
  if (!v || WORD_LIST.test(v) || NEUTRAL_NAME.test(v)) return name;
  const k = v.toLowerCase();
  let to = st.shared.lists.get(k);
  if (!to) { to = neutralNext('List', st); st.shared.lists.set(k, to); }
  return to;
}

/** `mark`: the name stands on a bookmark itself (w:bookmarkStart), which is what the receipt counts */
function renameRef(name: string, st: PartState, mark = false): string {
  if (!name || WORD_BOOKMARK.test(name)) return name;
  const k = name.toLowerCase();
  let to = st.shared.renames.get(k);
  if (!to) {
    to = `${name.startsWith('_') ? '_' : ''}bm${st.shared.renames.size + 1}`;
    st.shared.renames.set(k, to);
  }
  if (mark && !st.shared.marks.has(k)) { st.shared.marks.add(k); st.removed.names++; }
  return to;
}

// ---------- a chart's formulas ----------
/** A formula's pieces: a quoted sheet name, a bracketed book or column, a string, a word
 *  (a sheet, a name, a cell, a function), and single characters between them. */
const FORMULA_TOKEN = /'(?:[^']|'')*'?|\[[^\]]*\]?|"(?:[^"]|"")*"?|[^\s'"!(),;:[\]]+|[\s\S]/g;
const CELL = /^\$?[A-Za-z]{1,3}\$?\d{1,7}$/;
const NEUTRAL_FORMULA_WORD = /^(?:Sheet|Name)\d+$/;
/** What a formula's word is when it is not a name: a cell, a column or row of a range, an
 *  error, a number, a truth value, a function. `prev`, `next`: the pieces on either side. */
function formulaKeeps(w: string, prev: string | undefined, next: string | undefined): boolean {
  return CELL.test(w) || /^#/.test(w) || /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?%?$/.test(w) || /^(?:TRUE|FALSE)$/i.test(w)
    || ((prev === ':' || next === ':') && /^\$?(?:[A-Za-z]{1,3}|\d{1,7})$/.test(w))
    || (next === '(' && /^[A-Z][A-Z\d.]*$/.test(w));
}
/** Walk a formula and hand each sheet prefix and each name to `sheet` / `name`; returns the
 *  formula rebuilt from what they return. */
function formulaMap(f: string, sheet: (raw: string) => string, name: (raw: string) => string): string {
  const toks = f.match(FORMULA_TOKEN) ?? [];
  const sig = (i: number, d: number) => { for (let j = i + d; j >= 0 && j < toks.length; j += d) if (!/^\s+$/.test(toks[j])) return toks[j]; return undefined; };
  const out: string[] = [];
  const word = (t: string | undefined) => t !== undefined && /^[^#\s!(),;:"'[\]]/.test(t);
  let book = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    // a sheet prefix: Data!, 'Kestrel Data'!, [1]Data!, [Kestrel.xlsx]Data!, '[Kestrel.xlsx]Data'!
    // — the book is part of the sheet's name here, and goes with it
    if (t[0] === '[' && word(toks[i + 1]) && toks[i + 2] === '!') { book = t; continue; }
    if (toks[i + 1] === '!' && (t[0] === "'" || word(t))) {
      const bare = t[0] === "'" ? t.slice(1, -1).replace(/''/g, "'") : t;
      out.push(sheet(book + bare));
      book = '';
      continue;
    }
    if (t[0] === '[') { out.push(/^\[\d+\]$/.test(t) ? t : `[${name(t.slice(1, -1))}]`); continue; }
    if (t[0] === '"') { out.push('""'); continue; }
    if (t[0] === "'") { out.push(name(t.slice(1, -1).replace(/''/g, "'"))); continue; }
    if (/^[\s!(),;:]$/.test(t) || /^\s+$/.test(t)) { out.push(t); continue; }
    out.push(formulaKeeps(t, sig(i, -1), sig(i, 1)) ? t : name(t));
  }
  return out.join('');
}
/** A chart's cell references name the workbook that was embedded in the file, its sheets and
 *  its named ranges ("'Kestrel model'!$B$2:$B$9", "[Kestrel.xlsx]Data!Revenue"). The workbook
 *  goes with the embedded files, so the references point nowhere and each name in them is text
 *  no one reviewed: every sheet becomes Sheet1, Sheet2 …, every named range Name1, Name2 …, and
 *  the cells stay as written. Until 2026-09-23 a sheet name that placed held the file with no
 *  way through, one that did not was printed among the receipt's warnings, and a range's or a
 *  book's name was not read at all. */
function neutralFormula(f: string, st: PartState): string {
  const sheet = (raw: string) => {
    const k = raw.toLowerCase();
    let to = st.shared.sheets.get(k);
    if (!to) { to = `Sheet${st.shared.sheets.size + 1}`; st.shared.sheets.set(k, to); }
    return to;
  };
  const name = (raw: string) => {
    if (NEUTRAL_FORMULA_WORD.test(raw)) return raw;
    const k = raw.toLowerCase();
    let to = st.shared.ranges.get(k);
    if (!to) { to = neutralNext('Name', st); st.shared.ranges.set(k, to); }
    return to;
  };
  const out = formulaMap(f, sheet, name);
  if (out !== f) st.shared.formulas++;
  return out;
}
/** the gate's reading of a formula: every sheet and name in it that is not a neutral one */
function formulaForeign(f: string): string[] {
  const bad: string[] = [];
  formulaMap(f, (raw) => { if (!/^Sheet\d+$/.test(raw)) bad.push(raw); return raw; }, (raw) => { if (!NEUTRAL_FORMULA_WORD.test(raw)) bad.push(raw); return raw; });
  return bad;
}

/** An element taken away with its content kept (a tracked insertion, a content control, a
 *  hyperlink, an unlinked field) hands its namespace declarations to that content. A w:ins that
 *  declared xmlns:w14 over a w14: element left the prefix undeclared once unwrapped, and Word
 *  calls such a file damaged (2026-09-23). */
function unwrap(kids: XNode[], ...holders: Array<Record<string, string> | undefined>): XNode[] {
  const decl: Array<[string, string]> = [];
  for (const h of holders) if (h) for (const k in h) if (/^xmlns(:|$)/.test(k)) decl.push([k, h[k]]);
  if (!decl.length) return kids;
  for (const c of kids) {
    const t = tagOf(c);
    if (!t || t === '#text') continue;
    const a = (c[':@'] = c[':@'] || {});
    for (const [k, v] of decl) if (!(k in a)) a[k] = v;
  }
  return kids;
}

/** A KEPT field's instruction with every bookmark it points at renamed as the bookmark was
 *  (PAGEREF and NOTEREF name one first; a TOC's \b takes one; SEQ may name one after its
 *  label), every style it names renamed as the style was (a TOC's \t list, STYLEREF), every
 *  caption label as the label was (SEQ's counter, a TOC's \c and \a) and the list LISTNUM
 *  counts in as the list was. A table of contents therefore still finds its headings, a table
 *  of exhibits its captions and a page reference its page. REF and HYPERLINK \l are not kept
 *  fields (KEEP_FIELD): they are unlinked, and the bookmark name goes with the instruction.
 *  The rest of the instruction is left as written; the gate reads it. */
function rewriteInstr(instr: string, st: PartState): string {
  const toks = [...instr.matchAll(/"([^"]*)"|[^\s"]+/g)];
  if (!toks.length) return instr;
  const code = toks[0][0].toUpperCase();
  const edits: Array<[number, number, string]> = [];
  const valueOf = (t: RegExpMatchArray) => (t[1] !== undefined ? { s: t.index! + 1, v: t[1] } : { s: t.index!, v: t[0] });
  const ref = (t: RegExpMatchArray | undefined) => {
    if (!t || t[0].startsWith('\\')) return;
    const { s, v } = valueOf(t);
    const to = renameRef(v, st);
    if (to !== v) edits.push([s, s + v.length, to]);
  };
  const styleName = (v: string) => {
    const lead = /^\s*/.exec(v)![0], trail = /\s*$/.exec(v)![0];
    const to = st.styles.names.get(v.trim().toLowerCase());
    return to ? lead + to + trail : v;
  };
  const styles = (t: RegExpMatchArray | undefined, list: boolean) => {
    if (!t || t[0].startsWith('\\')) return;
    const { s, v } = valueOf(t);
    // \t "Style,1,Other Style,2": names and levels, separated by the list separator of the
    // author's locale (a comma or a semicolon)
    const to = list ? v.split(/([,;])/).map((p, i) => (i % 4 === 0 ? styleName(p) : p)).join('') : styleName(v);
    if (to !== v) edits.push([s, s + v.length, to]);
  };
  const named = (t: RegExpMatchArray | undefined, rename: (v: string, st: PartState) => string) => {
    if (!t || t[0].startsWith('\\')) return;
    const { s, v } = valueOf(t);
    const to = rename(v, st);
    if (to !== v) edits.push([s, s + v.length, to]);
  };
  if (code === 'PAGEREF' || code === 'NOTEREF') ref(toks[1]);
  if (code === 'STYLEREF') styles(toks[1], false);
  if (code === 'SEQ') { named(toks[1], labelName); if (toks[1] && !toks[1][0].startsWith('\\')) ref(toks[2]); }
  if (code === 'LISTNUM') named(toks[1], listName);
  for (let i = 1; i < toks.length - 1; i++) {
    const sw = toks[i][0];
    if (code === 'TOC' && sw === '\\b') ref(toks[i + 1]);
    if (code === 'TOC' && sw === '\\t') styles(toks[i + 1], true);
    if (code === 'TOC' && (sw === '\\c' || sw === '\\a')) named(toks[i + 1], labelName);
  }
  let out = instr;
  for (const [s, e, to] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + to + out.slice(e);
  return out;
}

function findDesc(nodes: XNode[], tag: string, depth = 8): XNode | null {
  if (depth < 0) return null;
  for (const n of nodes) {
    const t = tagOf(n);
    if (!t || t === '#text') continue;
    if (t === tag) return n;
    const r = findDesc(n[t], tag, depth - 1);
    if (r) return r;
  }
  return null;
}
function isPictureDrawing(kids: XNode[]): boolean {
  const gd = findDesc(kids, 'a:graphicData');
  return !!gd && String((gd[':@'] || {}).uri || '') === PICTURE_URI;
}

/** `parent`: the element this list sits in — a w:name is a style's name under w:style, a form
 *  field's bookmark under w:ffData and a list definition's name under w:abstractNum */
function structural(list: XNode[], st: PartState, parent = ''): XNode[] {
  const out: XNode[] = [];
  for (const n of list) {
    const tag = tagOf(n);
    if (!tag || tag === '#text') { out.push(n); continue; }
    const attrs: Record<string, string> | undefined = n[':@'];
    if (attrs) for (const k of Object.keys(attrs)) if (k.startsWith('w:rsid')) delete attrs[k];
    if (DROP_TAGS.has(tag)) { st.removed.revisionMarks++; continue; }
    // A chart's print header and footer print only when Excel prints the chart on its own page;
    // Word never shows them. Excel writes them with its codes glued to the text ("&CKestrel
    // Confidential", "&L&"Calibri,Bold"Kestrel"), where no name has a word boundary: masked in
    // place, "&CKestrel" shipped under a passing gate (W3-D, 2026-09-23). They go whole.
    if (CHART_HF.test(tag)) { st.shared.chartHeaders++; continue; }
    if (PERM_TAGS.has(tag)) { st.removed.permissions++; continue; }
    // tracked changes: a deletion (or the origin of a move) goes with its text, an
    // insertion (or the destination of a move) becomes plain text
    if (tag === 'w:del' || tag === 'w:moveFrom') { st.removed.deletions++; continue; }
    if (tag === 'w:ins' || tag === 'w:moveTo') { st.removed.insertionsUnwrapped++; out.push(...structural(unwrap(n[tag], attrs), st, parent)); continue; }
    if (tag === 'w:tr' && rowRevision(n[tag]) === 'del') { st.removed.deletions++; continue; }
    if (tag === 'w:r') {
      if (hasVanish(n[tag])) { st.removed.hiddenRuns++; continue; }
      if ((n[tag] as XNode[]).some((c) => 'w:commentReference' in c)) { st.removed.comments++; continue; }
    }
    // a content control is its content; the alias, tag, list entries, placeholder and
    // data binding in w:sdtPr are the template author's, not the page's
    if (tag === 'w:sdt') {
      st.removed.controls++;
      const content = (n[tag] as XNode[]).find((c) => 'w:sdtContent' in c);
      if (content) out.push(...structural(unwrap(content['w:sdtContent'], attrs, content[':@']), st, parent));
      continue;
    }
    if (tag === 'w:hyperlink') {
      if (attrs && attrs['r:id']) { st.removed.hyperlinks++; out.push(...structural(unwrap(n[tag], attrs), st, parent)); continue; }
      if (attrs && attrs['w:tooltip']) { delete attrs['w:tooltip']; st.removed.altTexts++; }
      // a place in ANOTHER document ("Kestrel SPA v3.docx#Schedule 2") on an internal link
      if (attrs && attrs['w:docLocation']) { delete attrs['w:docLocation']; st.removed.hyperlinks++; }
    }
    if (tag === 'w:smartTag' || tag === 'w:customXml') {
      out.push(...structural(unwrap((n[tag] as XNode[]).filter((c) => !('w:smartTagPr' in c) && !('w:customXmlPr' in c)), attrs), st, parent));
      continue;
    }
    // A field's hidden data: base64 Word keeps beside a field (a form field's settings, an old
    // hyperlink's target — an e-mail address among them) that nothing reads as text. It went with
    // a complex field's instruction runs, and an unlinked simple field moved it into the
    // paragraph, where it shipped under a passing gate (2026-09-23).
    if (tag === 'w:fldData') { st.removed.externalLinks++; continue; }
    if (tag === 'w:fldSimple') {
      const instr = (attrs && attrs['w:instr']) || '';
      if (KEEP_FIELD.test(instr)) { st.removed.fieldsKept++; attrs!['w:instr'] = rewriteInstr(instr, st); }
      else if (REMOVE_FIELD.test(instr)) { st.removed.fieldsRemoved++; continue; }
      else {
        st.removed.fieldsUnlinked++;
        if (/^\s*REF\b/i.test(instr)) st.shared.refsUnlinked++;
        if (INTERNAL_LINK.test(instr)) st.shared.linksUnlinked++;
        out.push(...structural(unwrap(n[tag], attrs), st, parent));
        continue;
      }
    }
    // Word writes a text box twice (mc:Choice DrawingML, mc:Fallback VML); one copy
    if (tag === 'mc:AlternateContent') {
      const kids = n[tag] as XNode[];
      if (kids.some((k) => 'mc:Choice' in k)) n[tag] = kids.filter((k) => !('mc:Fallback' in k));
    }
    if (tag === 'w:object') { st.removed.objects++; continue; }
    if (!st.keepImages) {
      if (tag === 'w:drawing' && isPictureDrawing(n[tag])) { st.removed.images++; continue; }
      if (tag === 'pic:pic') { st.removed.images++; continue; }
      if (tag === 'w:pict' && findDesc(n[tag], 'v:imagedata')) { st.removed.images++; continue; }
      // a picture bullet goes whole, with the levels' pointers to it: the level then shows
      // its own bullet character, where an empty w:numPicBullet is a damaged file to Word
      if (tag === 'w:numPicBullet') { st.removed.images++; continue; }
      if (tag === 'w:lvlPicBulletId') continue;
    }
    if (TABLE_ALT.has(tag)) { st.removed.altTexts++; continue; }
    if (attrs) {
      const alt = altAttrsOf(tag);
      if (alt) for (const a of alt) if (a in attrs) { delete attrs[a]; st.removed.altTexts++; }
      if (tag.startsWith('v:')) for (const a of VML_LINK) if (a in attrs) { delete attrs[a]; st.removed.externalLinks++; }
      // a VML shape's o:gfxdata is the whole shape again, zipped and base64-encoded — its text
      // box text included — where nothing can read it
      if ('o:gfxdata' in attrs) { delete attrs['o:gfxdata']; st.removed.shapeCopies++; }
      if (NV_PROPS.test(tag) && attrs.name && attrs.name !== neutralName(attrs)) { attrs.name = neutralName(attrs); st.removed.names++; }
      if (tag.startsWith('v:')) {
        if (attrs.id) attrs.id = vmlId(attrs.id, st);
        if (attrs['o:spid']) attrs['o:spid'] = vmlId(attrs['o:spid'], st);
        if (attrs.type?.startsWith('#')) attrs.type = `#${vmlId(attrs.type.slice(1), st)}`;
        if (attrs.style) attrs.style = vmlStyle(attrs.style, st);
      }
      if (tag === 'o:OLEObject' && attrs.ShapeID) attrs.ShapeID = vmlId(attrs.ShapeID, st);
      // a connector's or a callout's rule names the shapes it joins by their ids ("#KestrelBox"):
      // renamed with the shapes, or the rule points at a shape that is no longer there and the
      // client's name ships in it (W3-B, 2026-09-23)
      if (VML_RULE.has(tag)) for (const k of VML_RULE_REFS) if (attrs[k]) { const m = /^(#?)(.*)$/s.exec(attrs[k])!; attrs[k] = m[1] + vmlId(m[2], st); }
      const am = ATTR_MASK[tag];
      if (am) for (const k in am) if (attrs[k] && attrs[k].trim()) attrs[k] = am[k][0] === 'ident' ? identValue(attrs[k], am[k][1], st) : maskValue(attrs[k], am[k][0], am[k][1], st);
      if (STYLE_REFS.has(tag) && attrs['w:val'] !== undefined) { const to = st.styles.ids.get(attrs['w:val']); if (to) attrs['w:val'] = to; }
      if (tag === 'w:lsdException' && attrs['w:name']) { const to = st.styles.names.get(attrs['w:name'].toLowerCase()); if (to) attrs['w:name'] = to; }
      if (tag === 'w:bookmarkStart' && attrs['w:name']) attrs['w:name'] = renameRef(attrs['w:name'], st, true);
      if (tag === 'w:hyperlink' && attrs['w:anchor']) attrs['w:anchor'] = renameRef(attrs['w:anchor'], st);
      if (tag === 'w:name' && attrs['w:val']) {
        if (parent === 'w:ffData') attrs['w:val'] = renameRef(attrs['w:val'], st);
        else if (parent === 'w:abstractNum') attrs['w:val'] = listName(attrs['w:val'], st);
      }
      if (tag === 'w:caption' && attrs['w:name']) attrs['w:name'] = labelName(attrs['w:name'], st);
      if (tag === 'w:autoCaption' && attrs['w:caption']) attrs['w:caption'] = labelName(attrs['w:caption'], st);
    }
    if (tag === 'w:style' && attrs) {
      const kids = n[tag] as XNode[];
      const nameEl = kids.find((c) => 'w:name' in c);
      const name = nameEl ? String((nameEl[':@'] || {})['w:val'] ?? '') : '';
      const id = attrs['w:styleId'];
      const toId = id !== undefined ? st.styles.ids.get(id) : undefined;
      const toName = st.styles.names.get(name.toLowerCase());
      if (toId || toName || (id !== undefined && st.styles.dropAliases.has(id))) {
        if (toId) attrs['w:styleId'] = toId;
        if (nameEl && toName) nameEl[':@']['w:val'] = toName;
        n[tag] = kids.filter((c) => !('w:aliases' in c));
      }
    }
    // a pivot chart's source names the workbook, the sheet and the pivot table
    if (tag === 'c:name' && parent === 'c:pivotSource') {
      for (const c of n[tag] as XNode[]) if ('#text' in c && !NEUTRAL_PIVOT.test(String(c['#text']))) {
        const was = String(c['#text']);
        let to = st.shared.pivots.get(was);
        if (!to) { to = `[Book1.xlsx]Sheet1!${neutralNext('PivotTable', st)}`; st.shared.pivots.set(was, to); st.shared.formulas++; }
        c['#text'] = to;
      }
      out.push(n);
      continue;
    }
    if (FORMULA_TAGS.has(tag)) for (const c of n[tag] as XNode[]) if ('#text' in c) c['#text'] = neutralFormula(String(c['#text']), st);
    const em = ELEM_MASK[tag];
    if (em) for (const c of n[tag] as XNode[]) if ('#text' in c && String(c['#text']).trim()) c['#text'] = maskValue(String(c['#text']), em[0], em[1], st);
    if (st.part === 'word/settings.xml' && SETTINGS_DROP.has(tag)) { st.removed.settings++; continue; }
    if (attrs && st.droppedIds.size) {
      let dangling = false;
      for (const k of R_ATTRS) if (attrs[k] && st.droppedIds.has(attrs[k])) dangling = true;
      if (dangling) { st.removed.danglingRefs++; continue; }
    }
    n[tag] = structural(n[tag], st, tag);
    out.push(n);
  }
  return out;
}

/** complex fields: begin … instrText … separate … result … end, nestable, spanning
 *  paragraphs. Kept fields stay whole, their instruction rewritten for the renamed bookmarks
 *  and styles (into its first instrText; Word splits an instruction across runs anywhere, and
 *  " PAGEREF " + "Kestrel" + "SPA \h " is one name); removed fields go whole; unlinked fields
 *  keep their result runs only. A field left open at the end of the part goes whole. */
function fieldPass(tree: XNode[], st: PartState): void {
  interface Frame { instr: string; sep: boolean; own: XNode[]; all: XNode[]; texts: XNode[] }
  const stack: Frame[] = [];
  const remove = new Set<XNode>();
  const decide = (f: Frame) => {
    if (KEEP_FIELD.test(f.instr)) {
      st.removed.fieldsKept++;
      const to = rewriteInstr(f.instr, st);
      if (to !== f.instr) {
        f.texts.forEach((el, i) => {
          const t = tagOf(el)!;
          el[t] = i === 0 ? [{ '#text': to }] : [];
          if (i === 0) (el[':@'] = el[':@'] || {})['xml:space'] = 'preserve';
        });
      }
      return;
    }
    if (REMOVE_FIELD.test(f.instr) || !f.sep) { st.removed.fieldsRemoved++; for (const r of f.all) remove.add(r); return; }
    st.removed.fieldsUnlinked++;
    if (/^\s*REF\b/i.test(f.instr)) st.shared.refsUnlinked++;
    if (INTERNAL_LINK.test(f.instr)) st.shared.linksUnlinked++;
    for (const r of f.own) remove.add(r);
  };
  const visit = (nodes: XNode[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      if (!tag || tag === '#text') continue;
      if (tag === 'w:r') {
        const kids = n[tag] as XNode[];
        let marker = false;
        for (const c of kids) {
          const ct = tagOf(c);
          if (ct === 'w:fldChar') {
            const type = String(((c[':@'] || {})['w:fldCharType']) || '');
            marker = true;
            if (type === 'begin') stack.push({ instr: '', sep: false, own: [n], all: [n], texts: [] });
            else if (type === 'separate') { const top = stack[stack.length - 1]; if (top) { top.sep = true; top.own.push(n); top.all.push(n); } }
            else if (type === 'end') {
              const f = stack.pop();
              if (!f) { st.warnings.push(`${st.part}: field end without begin — run removed`); remove.add(n); continue; }
              f.own.push(n); f.all.push(n);
              decide(f);
              const parent = stack[stack.length - 1];
              if (parent) { parent.all.push(...f.all); if (!parent.sep) parent.own.push(...f.all); }
            }
          } else if (ct === 'w:instrText' || ct === 'w:delInstrText') {
            marker = true;
            const top = stack[stack.length - 1];
            const text = (c[ct] as XNode[]).map((x) => ('#text' in x ? String(x['#text']) : '')).join('');
            if (top) { top.instr += text; top.texts.push(c); if (!top.own.includes(n)) { top.own.push(n); top.all.push(n); } }
            else { st.warnings.push(`${st.part}: field instruction outside a field — run removed`); remove.add(n); }
          }
        }
        if (!marker) {
          const top = stack[stack.length - 1];
          if (top) { top.all.push(n); if (!top.sep) top.own.push(n); }
        }
        continue;
      }
      visit(n[tag]);
    }
  };
  visit(tree);
  while (stack.length) {
    const f = stack.pop()!;
    st.warnings.push(`${st.part}: field left open — removed whole`);
    st.removed.fieldsRemoved++;
    for (const r of f.all) remove.add(r);
  }
  if (!remove.size) return;
  const prune = (nodes: XNode[]): XNode[] => {
    const out: XNode[] = [];
    for (const n of nodes) {
      if (remove.has(n)) continue;
      const tag = tagOf(n);
      if (tag && tag !== '#text') n[tag] = prune(n[tag]);
      out.push(n);
    }
    return out;
  };
  const pruned = prune(tree);
  tree.length = 0;
  tree.push(...pruned);
}

/** Each complex field's whole instruction, its instrText runs joined, for the gate. Word
 *  splits an instruction across runs anywhere, and read run by run " PAGEREF Kes" and
 *  "trelSPA \h " carry no name: with fieldPass's rewrite turned off, a PAGEREF to a bookmark
 *  named after the client shipped under a gate that passed (docx-parts.mjs law 13). */
export function joinedInstructions(nodes: XNode[], out: string[] = [], stack: Array<{ s: string; done: boolean }> = []): string[] {
  for (const n of nodes) {
    const tag = tagOf(n);
    if (!tag || tag === '#text') continue;
    if (tag === 'w:fldChar') {
      const type = String((n[':@'] || {})['w:fldCharType'] || '');
      const top = stack[stack.length - 1];
      if (type === 'begin') stack.push({ s: '', done: false });
      else if ((type === 'separate' || type === 'end') && top) {
        if (!top.done) { out.push(top.s); top.done = true; }
        if (type === 'end') stack.pop();
      }
      continue;
    }
    if (tag === 'w:instrText' || tag === 'w:delInstrText') {
      const top = stack[stack.length - 1];
      if (top && !top.done) top.s += (n[tag] as XNode[]).map((x) => ('#text' in x ? String(x['#text']) : '')).join('');
      continue;
    }
    joinedInstructions(n[tag] as XNode[], out, stack);
  }
  return out;
}


// ---------- the masking pass ----------
/** the flow of a part's text items: paragraph-aware (flowLayout), and an item outside
 *  any paragraph (a property value, a chart literal) is a line of its own */
function partFlow(items: WalkItem[]) {
  const textItems = items.filter((i) => !i.attr && i.kind !== 'field' && !i.num);
  let synthetic = -1;
  const shaped = textItems.map((i) => (i.para === undefined ? { ...i, para: synthetic-- } : i));
  return flowLayout(shaped);
}

/** A chart's numeric cache value is a double, and Word writes it with every digit it
 *  has: 4.4 is stored as "4.4000000000000004", whose sixteen trailing digits read as a
 *  card number to any digit rule. The number is checked as the NUMBER it is — its
 *  shortest form — so a float artefact places nothing and an ID or phone number
 *  plotted as a value still does. A value that is not a finite number is checked as
 *  the text it is. */
export function numericForm(text: string): string {
  const t = text.trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return text;
  const v = Number(t);
  return Number.isFinite(v) ? String(v) : text;
}

/** Where in `s` each of the table's names stands run together (refFind, both ways), at the
 *  offsets of the characters that make it. Located by carrying each compacted character back to
 *  the stretch of `s` it came from; until 2026-09-23 every prefix of `s` was compacted, which cost
 *  its length squared, and a value past 256 characters held its part unread. */
export const refSpans = (s: string, names: RefName[], how: 'all' | 'text' = 'all'): RefFind[] => refFind(s, names, how);

/** The tags the mask writes for each name found run together, or null with the reason: a name
 *  is written as what the mask makes of it standing alone, the tag its row places everywhere. */
function runTags(found: RefFind[], mask: MaskFn): { ivs: MaskInterval[]; tags: string[] } | string {
  const ivs: MaskInterval[] = [];
  const tags: string[] = [];
  const said = new Map<string, MaskResult>();
  for (const f of found) {
    let n = said.get(f.name);
    if (!n) { n = mask(fold(f.name)); said.set(f.name, n); }
    if (n.divergence || !n.placements.length) return `the mask could not say what to write for a name of the table run together with the text beside it${n.divergence ? `: ${n.divergence}` : ''}`;
    ivs.push({ s: f.s, e: f.long ?? f.e, tag: n.text });
    tags.push(...mergedIntervals(n).map((iv) => iv.tag));
  }
  return { ivs, tags };
}
/** the tags a value's intervals write, and each tag of a name found run together that none of
 *  them is (a mask that makes "[Org1] Fund" of a name places "[Org1]", which the gate blanks) */
const withTags = (ivs: MaskInterval[], more: string[]): string[] => { const t = ivs.map((iv) => iv.tag); return [...t, ...new Set(more.filter((x) => !t.includes(x)))]; };
/** intervals folded into one where they overlap, the first one's tag kept */
function foldIntervals(all: MaskInterval[]): MaskInterval[] {
  const ivs: MaskInterval[] = [];
  for (const iv of [...all].sort((a, b) => a.s - b.s || b.e - a.e)) {
    const prev = ivs[ivs.length - 1];
    if (prev && iv.s < prev.e) { prev.e = Math.max(prev.e, iv.e); continue; }
    ivs.push({ ...iv });
  }
  return ivs;
}
/** An equation's runs, one group per stretch that renders side by side: consecutive runs of a
 *  paragraph standing in the same element (WalkItem.math — the equation, or one argument of it).
 *  The equation editor renders its runs with nothing between them, and Word starts a new run
 *  wherever the formatting changes or a tracked change lands, inside a word as readily as
 *  between two. A run is an equation's by its m:r, not by what holds its text: a w:t there
 *  ("Kes" in normal text, then "trel" in m:t) broke the group and the name shipped (W5-6,
 *  2026-09-23). A base and its subscript are not side by side: joined, x with subscript i read
 *  as "xi" and a row "Xi" masked the formula the review showed readable (W4-F5).
 *
 *  An equation's own line (m:oMath, not an argument printed apart) also runs on into the text
 *  and the equation beside it where nothing stands between them on the page (WalkItem `gap`: the
 *  space the reading puts before an equation's run is not the page's), and a phantom that does not
 *  show (`unshown`) is not there: "Kes" typed as text before an equation "trel", two equations
 *  "Kes" and "trel" side by side, and "Kes" + a phantom not shown + "trel" each shipped the name
 *  under a gate that passed (W5R-7, 2026-09-23). A stretch with no equation in it is the flow's,
 *  read by placeFlow. */
export function mathZones(items: WalkItem[]): WalkItem[][] {
  const zones: WalkItem[][] = [];
  const line = (m?: Record<string, unknown>) => !m || 'm:oMath' in m;
  let cur: WalkItem[] | null = null, math = false, prev: WalkItem | null = null;
  const close = () => { if (cur && math) zones.push(cur); cur = null; math = false; };
  for (const i of items) {
    if (i.attr || i.kind === 'field' || i.num || i.unshown) continue;
    const on = !!cur && !!prev && prev.para === i.para && (
      (!!i.math && prev.math === i.math)
      || (!(i.pre && !i.gap) && !/\s$/.test(prev.text) && !/^\s/.test(i.text) && line(prev.math) && line(i.math) && (!!i.math || !!prev.math || math)));
    if (on) cur!.push(i); else { close(); cur = [i]; }
    if (i.math) math = true;
    prev = i;
  }
  close();
  return zones;
}
/** How a zone is read for the table's names: an equation's runs alone keep no spaces, so a name
 *  is found anywhere in them ('all'); a zone that takes in a run of the text is read as text is
 *  ('text'), since that run's words are spaced as the page spaces them and a fragment of a name
 *  inside one of its words is prose, not the name (refFind). */
export const zoneRead = (zone: WalkItem[]): 'all' | 'text' => (zone.every((i) => i.math) ? 'all' : 'text');
/** the runs of an equation joined as the equation renders them, each at its offsets */
export function zoneText(zone: WalkItem[]): { text: string; spans: Array<{ s: number; e: number; item: WalkItem }> } {
  let text = '';
  const spans = zone.map((item) => { const s = text.length; text += item.text; return { s, e: text.length, item }; });
  return { text, spans };
}
/** An equation (m:t), masked as it renders: its runs joined with nothing between them, by the
 *  whole mask and for the table's names with nothing between their words (the equation editor
 *  keeps no spaces in a name: "Harrow Leung" typed there is one run, HarrowLeung), a name found
 *  replaced by what the mask makes of the name, across the runs it spans. Read run by run,
 *  "Kes" + "trel" (the formatting changed mid-word), "Kestr" + a tracked "el" and "Marga" +
 *  "ret Tan" each shipped the name under a gate that passed (W3-A, 2026-09-23). `blank`: the
 *  tags already written, which no row may be read inside. */
function maskMath(items: WalkItem[], st: PartState, blank: Set<string> = st.tags): void {
  const written = [...new Set([...blank, ...st.tags])].filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const tagRe = written.length ? new RegExp(written.join('|'), 'g') : null;
  for (const zone of mathZones(items)) {
    const { text, spans } = zoneText(zone);
    if (!text.trim()) continue;
    const view = tagRe ? fold(text).replace(tagRe, (t) => '█'.repeat(t.length)) : fold(text);
    const m = st.mask(view);
    if (m.divergence) { st.held ??= `the mask could not certify an equation in ${st.part}: ${m.divergence}`; return; }
    const all: MaskInterval[] = mergedIntervals(m);
    if (applyIntervals(view, all) !== m.text) { st.held ??= `the writer could not reproduce the masked text of an equation in ${st.part} from its placements`; return; }
    const tags = all.map((iv) => iv.tag);
    const run = runTags(refSpans(view, st.names, zoneRead(zone)), st.mask);
    if (typeof run === 'string') { st.held ??= `${run} (an equation in ${st.part})`; return; }
    all.push(...run.ivs);
    tags.push(...run.tags);
    if (!all.length) continue;
    const ivs = foldIntervals(all);
    st.written += rewriteRuns(spans, ivs, new Set());
    for (const t of tags) st.tags.add(t);
  }
}

function mergedIntervals(m: MaskResult): MaskInterval[] {
  const all: MaskInterval[] = [...m.placements, ...m.floorHits.filter((h) => !h.exempt)].sort((a, b) => a.s - b.s || b.e - a.e);
  const out: MaskInterval[] = [];
  for (const iv of all) {
    const prev = out[out.length - 1];
    if (prev && iv.s < prev.e) { if (iv.e > prev.e) prev.e = iv.e; continue; }
    out.push({ s: iv.s, e: iv.e, tag: iv.tag });
  }
  return out;
}
function applyIntervals(text: string, ivs: MaskInterval[]): string {
  let out = '';
  let pos = 0;
  for (const iv of ivs) { out += text.slice(pos, iv.s) + iv.tag; pos = iv.e; }
  return out + text.slice(pos);
}

/** rewrite the runs under `spans` so that the flow reads `applyIntervals(text, ivs)`:
 *  the tag lands in the first run the interval covers, the covered rest is removed.
 *  An interval can begin in the spacing between runs (a table row reading " 16" with
 *  the space in a run of its own — trial file 11, 2026-09-13); its tag then opens the
 *  first run it reaches, so covered text never goes without its tag. Returns how many
 *  tags it wrote and adds each one to `tagsWritten` (the name key lists a tag from there);
 *  an interval that covered spacing only writes none. */
function rewriteRuns(spans: Array<{ s: number; e: number; item: WalkItem }>, ivs: MaskInterval[], tagsWritten: Set<string>, tagged = new Set<MaskInterval>()): number {
  let k = 0;
  let written = 0;
  for (const sp of spans) {
    while (k < ivs.length && ivs[k].e <= sp.s) k++;
    let j = k;
    if (j >= ivs.length || ivs[j].s >= sp.e) continue;
    const text = sp.item.text;
    let out = '';
    let cursor = sp.s;
    while (j < ivs.length && ivs[j].s < sp.e) {
      const iv = ivs[j];
      const from = Math.max(iv.s, sp.s);
      out += text.slice(cursor - sp.s, from - sp.s);
      if (!tagged.has(iv)) { out += iv.tag; tagged.add(iv); tagsWritten.add(iv.tag); written++; }
      cursor = Math.min(iv.e, sp.e);
      if (iv.e > sp.e) break;
      j++;
    }
    out += text.slice(cursor - sp.s);
    sp.item.node['#text'] = out;
    const elem = sp.item.elem;
    const etag = elem ? tagOf(elem) : undefined;
    if (elem && etag && (etag.startsWith('w:') || etag === 'm:t')) {
      const a = (elem[':@'] = (elem[':@'] || {}) as Record<string, string>);
      a['xml:space'] = 'preserve';
    }
    sp.item.text = out;
  }
  return written;
}

/** Mask a flow over the document of record, then strip it: the table's rows are placed over
 *  `record` (folded, hidden runs and removed fields' results still in it) and written into the
 *  `pieces` that ship, each at its offsets in `record`. A name the author broke with hidden
 *  text — "John " + hidden "Michael " + "Smith", confirmed as "John Michael Smith" — is placed
 *  whole there and ships as its tag. Until 2026-09-23 the writer stripped first and masked what
 *  was left: "John Smith" matched no row, and the saved .docx named the claimant while the .txt
 *  and the review masked him.
 *
 *  Then the flow as it now reads is masked once more, the tags just written blanked: the strip
 *  can also JOIN what the record kept apart ("Kes" + hidden "x" + "trel"), and that second pass
 *  is what the writer did alone before. It only adds tags.
 *
 *  Last, the flow as it now reads is searched for the table's names run together with what
 *  stands beside them (refFind), every tag written blanked, and each is written over with what
 *  the mask makes of the name alone. A row's match starts and stops at a word's edge, so
 *  "KestrelCapital" in a footer, "MargaretTan" in a heading and "kestrelholdings" in the body
 *  shipped readable under a gate that passed (owner ruling 1, 2026-09-23). A separate step, after
 *  both passes, so that each pass stays what the finish measure rebuilds from its placements
 *  (attest.ts recordAt); it asks the mask only for a name it finds. `spacing`: placements that
 *  covered nothing but spacing, where no run could take the tag (a placement over stripped text
 *  needs none). A result that is not null in `held` holds the part. */
function placeFlow(record: string, pieces: Array<{ s: number; e: number; item: WalkItem }>, mask: MaskFn, written: Set<string>): { held: string | null; tags: string[]; runs: number; spacing: number } {
  const res = { held: null as string | null, tags: [] as string[], runs: 0, spacing: 0 };
  /** the masked text, or null with `res.held` set */
  const pass = (text: string, spans: Array<{ s: number; e: number; item: WalkItem }>): string | null => {
    const m = mask(text);
    if (m.divergence) { res.held = `the mask could not certify it: ${m.divergence}`; return null; }
    const ivs = mergedIntervals(m);
    if (!ivs.length) return text;
    if (applyIntervals(text, ivs) !== m.text) { res.held = 'the writer could not reproduce its masked text from the placements'; return null; }
    const tagged = new Set<MaskInterval>();
    res.runs += rewriteRuns(spans, ivs, written, tagged);
    for (const iv of ivs) {
      res.tags.push(iv.tag);
      if (!tagged.has(iv) && !text.slice(iv.s, iv.e).trim()) res.spacing++;
    }
    return m.text;
  };
  const blank = (text: string) => {
    const placed = [...new Set(res.tags)].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return placed.length ? text.replace(new RegExp(placed.join('|'), 'g'), (t) => '█'.repeat(t.length)) : text;
  };
  const masked = pass(record, pieces);
  if (masked === null) return res;
  const now = flowLayout(pieces.map((p) => p.item));
  const text = fold(now.text);
  // nothing was stripped, or nothing that joined: the saved flow is the masked record, and a
  // second pass over a 60k-word body would double what masking it costs
  if (text !== masked && pass(blank(text), now.spans) === null) return res;
  const names = refNames(mask);
  if (!names.length) return res;
  const last = flowLayout(pieces.map((p) => p.item));
  const run = runTags(refSpans(blank(fold(last.text)), names, 'text'), mask);
  if (typeof run === 'string') { res.held = run; return res; }
  if (!run.ivs.length) return res;
  const ivs = foldIntervals(run.ivs);
  res.runs += rewriteRuns(last.spans, ivs, written, new Set());
  res.tags.push(...ivs.map((iv) => iv.tag), ...run.tags);
  return res;
}

/** What a flow of the saved .docx reads under `mask`, folded — the writer's own placement
 *  (placeFlow) over its record, without the file: null when the mask cannot certify it, which
 *  is a file the writer would hold. */
export function savedFlowText(flow: WriterFlow, mask: MaskFn): string | null {
  const pieces = flow.pieces.map((p) => ({ s: p.s, e: p.e, item: { text: flow.record.slice(p.s, p.e), pre: p.pre, para: p.para, node: {} } as WalkItem }));
  if (placeFlow(flow.record, pieces, mask, new Set()).held) return null;
  return fold(flowLayout(pieces.map((p) => p.item)).text);
}

// ---------- relationships and content types ----------
function normalizePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base ? base.split('/') : [];
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}
/** `word/_rels/document.xml.rels` → owner `word/document.xml`, base `word` */
function relsOwner(rels: string): { owner: string; base: string } {
  const m = /^(.*?)_rels\/(.+)\.rels$/.exec(rels);
  if (!m) return { owner: '', base: '' };
  const base = m[1].replace(/\/$/, '');
  return { owner: m[2] === '' ? '' : (base ? `${base}/${m[2]}` : m[2]), base };
}


/** content types of a package: overrides by part name, defaults by extension */
interface Types { part: Map<string, string>; ext: Map<string, string> }
function contentTypes(nodes: XNode[]): Types {
  const t: Types = { part: new Map(), ext: new Map() };
  for (const c of nodes) {
    const a = c[':@'] || {};
    if ('Override' in c) t.part.set(String(a.PartName || '').replace(/^\//, ''), String(a.ContentType || ''));
    else if ('Default' in c) t.ext.set(String(a.Extension || '').toLowerCase(), String(a.ContentType || ''));
  }
  return t;
}
/** a part is read as XML when its name or its content type says it is */
const isXml = (n: string, t: Types) =>
  /\.(xml|rels|vml)$/i.test(n) || /xml/i.test(t.part.get(n) ?? t.ext.get((/\.([^./]+)$/.exec(n)?.[1] ?? '').toLowerCase()) ?? '');

// ---------- the gate ----------
/** 'text': the whole mask. 'words': refWords' readings, the table's rows only. 'name': an
 *  identifier or a value that is also syntax, read in its identReadings for the table's rows
 *  only. 'machine': a value Word writes for itself, for rows of six characters and more.
 *  'ident': a font, theme or colour name, or an equation's run — as identValue reads it: as
 *  written by the whole mask, its other readings by the rows, and for the table's names with
 *  nothing between their words. 'style': a style's name or id, read as a 'name' unless it is
 *  Word's own (BUILTIN_STYLE, and the id of a built-in style that is its name). */
type ReadMode = 'text' | 'words' | 'name' | 'machine' | 'ident' | 'style' | 'format';
/** a number format is read as a 'format': a 'name' whose quoted literals the safety-net pattern
 *  reads too, as the writer masks it (maskValue) */
const readAs = (m: [Mode, string]): ReadMode => (m[1] === NUMBER_FORMAT ? 'format' : m[0]);
/** Word's own vocabulary, read like a machine value: a schema enumeration — one lower-case
 *  word, or words run together with a small letter first ("page", "upperRoman", "tan" the
 *  colour, "rId4") — a language tag, a media type, and the ids Word gives a watermark and a
 *  VML shape. Rows match without regard to case, and read as names these held every file with
 *  a page break on a row "Page" (a surname) and every watermarked file on a row "Mark"
 *  (docx-parts.mjs, law 16). */
export const VOCAB = /^(?:[a-z][a-z\d]*(?:[A-Z][a-z\d]*)*|[a-z]{2,3}(?:-[A-Za-z\d]{2,8})+|[a-z]+\/[\w.+-]+|(?:PowerPlusWaterMarkObject|WordPictureWatermark)\d+|_x0000_[a-z]\d+)$/;
/** a language tag as Word writes one (language, then a script, then a region: "en-US",
 *  "zh-Hant-TW", "es-419"), and a media type under a registered top type — what the pre-check
 *  of a part the writer does not know takes for VOCAB's two looser shapes (W-FID-2) */
export const LANG_TAG = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/;
export const MEDIA_TYPE = /^(?:application|audio|font|image|message|model|multipart|text|video)\/[\w.+-]+$/;
/** A theme's a:font@script is a script's four-letter code ("Hans", "Thai", "Arab"; ISO 15924),
 *  thirty-odd in every theme Office writes: read as a name, a row "Hans" (a given name) or "Thai"
 *  held every file with a theme, with nothing in Word to change (W-FID-4, 2026-09-23; 9 holds
 *  over 3 real files for rows Hans, Thai and Arab, 0 after). Read as Word's own value is, it
 *  never meets a row of fewer than six. */
export const fontScript = (tag: string, k: string, t: string): boolean => tag === 'a:font' && k === 'script' && /^[A-Z][a-z]{3}$/.test(t);
/** The hosts the file format's own addresses stand on: every part names
 *  "http://schemas.microsoft.com/office/…" and "urn:schemas-microsoft-com:office:office", and a
 *  row "Microsoft" (a party) or "Office" (the row that held trial file 10) placed on them in
 *  every file (law 16). Only the address of a namespace the format defines is exempt whole
 *  (KNOWN_NS); on these hosts anything else is read past the words the format's addresses are
 *  made of (schemaRest). Until 2026-09-23 a value was exempt by its host alone, and
 *  "http://purl.org/matters/Margaret Tan" in an attribute shipped under a passing gate (D13R-4). */
export const SCHEMA = /^(?:https?:\/\/(?:schemas\.(?:openxmlformats\.org|microsoft\.com)|purl\.org|www\.w3\.org)\/|urn:(?:schemas-microsoft-com:|microsoft\.com\/office\/))/i;
/** the attributes that are XML's own syntax rather than a value: a namespace declaration, and a
 *  markup-compatibility list (MC_LISTS) — each read by what it declares or lists (readOutput) */
export const SYNTAX_ATTR = /^(xmlns(:|$)|mc:)/;
/** The namespaces of the file format and of the Office programs that write it, each with the
 *  prefixes Office writes for it — gathered from the declarations of the 21 real .docx files
 *  the writer is measured on (2026-09-23), with the ones ECMA-376 and Office define for the
 *  parts it keeps. A name in one of these is Word's word: "w:tab", "Relationship@Target" and
 *  "wps:wsp" are not read, where a row "Target" (a party) would hold every file. A prefix Office
 *  does not write for the namespace is read ("xmlns:kestrel=…wordprocessingml…"), and so is
 *  every name, prefix and address in a namespace not listed here. */
const NS_KNOWN: Array<[string, string]> = [
  ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'r'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/math', 'm'],
  ['http://schemas.openxmlformats.org/markup-compatibility/2006', 'mc ve'],
  ['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'wp'],
  ['http://schemas.openxmlformats.org/drawingml/2006/main', 'a'],
  ['http://schemas.openxmlformats.org/drawingml/2006/picture', 'pic'],
  ['http://schemas.openxmlformats.org/drawingml/2006/chart', 'c'],
  ['http://schemas.openxmlformats.org/drawingml/2006/chartDrawing', 'cdr'],
  ['http://schemas.openxmlformats.org/drawingml/2006/diagram', 'dgm'],
  ['http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas', 'lc'],
  ['http://schemas.openxmlformats.org/drawingml/2006/compatibility', 'comp'],
  ['http://schemas.openxmlformats.org/schemaLibrary/2006/main', 'sl'],
  ['http://schemas.openxmlformats.org/package/2006/content-types', ''],
  ['http://schemas.openxmlformats.org/package/2006/relationships', ''],
  ['http://schemas.openxmlformats.org/package/2006/metadata/core-properties', 'cp'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/extended-properties', 'ep'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/custom-properties', 'op'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes', 'vt'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/bibliography', 'b'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/customXml', 'ds'],
  ['urn:schemas-microsoft-com:office:office', 'o'],
  ['urn:schemas-microsoft-com:vml', 'v'],
  ['urn:schemas-microsoft-com:office:word', 'w10'],
  ['urn:schemas-microsoft-com:office:excel', 'x'],
  ['urn:schemas-microsoft-com:office:powerpoint', 'pvml'],
  ['urn:schemas-microsoft-com:mac:vml', 'mv'],
  ['http://purl.org/dc/elements/1.1/', 'dc'],
  ['http://purl.org/dc/terms/', 'dcterms'],
  ['http://purl.org/dc/dcmitype/', 'dcmitype'],
  ['http://www.w3.org/2001/XMLSchema-instance', 'xsi'],
  ['http://www.w3.org/2001/XMLSchema', 'xsd xs'],
  ['http://www.w3.org/XML/1998/namespace', 'xml'],
  ['http://www.w3.org/2000/svg', 'svg'],
  ['http://www.w3.org/1999/xlink', 'xlink'],
  ['http://schemas.microsoft.com/office/word/2006/wordml', 'wne'],
  // arto here and ask below are declared on the body of "1. START HERE.docx": ask:sd is a random
  // seed Word writes for a hand-drawn outline, up to ten digits, which the safety net would read
  // as a telephone number in an add-in's attribute (attrNet) were ask not listed
  ['http://schemas.microsoft.com/office/word/2006/arto', 'arto'],
  ['http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas', 'wpc'],
  ['http://schemas.microsoft.com/office/word/2010/wordprocessingGroup', 'wpg'],
  ['http://schemas.microsoft.com/office/word/2010/wordprocessingShape', 'wps'],
  ['http://schemas.microsoft.com/office/word/2010/wordprocessingInk', 'wpi'],
  ['http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing', 'wp14'],
  ['http://schemas.microsoft.com/office/word/2010/wordml', 'w14'],
  ['http://schemas.microsoft.com/office/word/2012/wordml', 'w15'],
  ['http://schemas.microsoft.com/office/word/2018/wordml', 'w16'],
  ['http://schemas.microsoft.com/office/word/2018/wordml/cex', 'w16cex'],
  ['http://schemas.microsoft.com/office/word/2016/wordml/cid', 'w16cid'],
  ['http://schemas.microsoft.com/office/word/2015/wordml/symex', 'w16se'],
  ['http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash', 'w16sdtdh'],
  ['http://schemas.microsoft.com/office/word/2023/wordml/word16du', 'w16du'],
  ['http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock', 'w16sdtfl'],
  ['http://schemas.microsoft.com/office/drawing/2007/8/2/chart', 'c14'],
  ['http://schemas.microsoft.com/office/drawing/2010/main', 'a14'],
  ['http://schemas.microsoft.com/office/drawing/2010/diagram', 'dgm14'],
  ['http://schemas.microsoft.com/office/drawing/2012/main', 'a15'],
  ['http://schemas.microsoft.com/office/drawing/2012/chart', 'c15'],
  ['http://schemas.microsoft.com/office/drawing/2014/main', 'a16'],
  ['http://schemas.microsoft.com/office/drawing/2014/chart', 'c16'],
  ['http://schemas.microsoft.com/office/drawing/2015/06/chart', 'c16r2'],
  ['http://schemas.microsoft.com/office/drawing/2017/03/chart', 'c16r3'],
  ['http://schemas.microsoft.com/office/drawing/2014/chartex', 'cx'],
  ['http://schemas.microsoft.com/office/drawing/2015/9/8/chartex', 'cx1'],
  ['http://schemas.microsoft.com/office/drawing/2015/10/21/chartex', 'cx2'],
  ['http://schemas.microsoft.com/office/drawing/2016/5/9/chartex', 'cx3'],
  ['http://schemas.microsoft.com/office/drawing/2016/5/10/chartex', 'cx4'],
  ['http://schemas.microsoft.com/office/drawing/2016/5/11/chartex', 'cx5'],
  ['http://schemas.microsoft.com/office/drawing/2016/5/12/chartex', 'cx6'],
  ['http://schemas.microsoft.com/office/drawing/2016/5/13/chartex', 'cx7'],
  ['http://schemas.microsoft.com/office/drawing/2016/5/14/chartex', 'cx8'],
  ['http://schemas.microsoft.com/office/drawing/2008/diagram', 'dsp'],
  ['http://schemas.microsoft.com/office/drawing/2016/ink', 'aink'],
  ['http://schemas.microsoft.com/office/drawing/2017/model3d', 'am3d'],
  ['http://schemas.microsoft.com/office/drawing/2018/sketchyshapes', 'ask'],
  ['http://schemas.microsoft.com/office/drawing/2016/SVG/main', 'asvg'],
  ['http://schemas.microsoft.com/office/thememl/2012/main', 'thm15'],
  ['http://schemas.microsoft.com/office/mac/office/2008/main', 'mo'],
  ['http://schemas.microsoft.com/office/2019/extlst', 'oel'],
  ['http://schemas.microsoft.com/office/comments/2020/reactions', 'cr'],
  ['http://schemas.microsoft.com/office/tasks/2019/documenttasks', 't'],
  ['http://schemas.microsoft.com/office/webextensions/webextension/2010/11', 'we'],
  ['http://schemas.microsoft.com/office/webextensions/taskpanes/2010/11', 'wetp'],
];
/** namespace address → the prefixes Office writes for it ('' — the default namespace — always) */
export const KNOWN_NS: ReadonlyMap<string, ReadonlySet<string>> = new Map(NS_KNOWN.map(([uri, p]) => [uri, new Set(['', ...p.split(' ').filter(Boolean)])]));
/** the markup-compatibility namespace, and its attributes that list prefixes or qualified names */
export const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
export const MC_LISTS = new Set(['Ignorable', 'ProcessContent', 'MustUnderstand', 'PreserveElements', 'PreserveAttributes']);
const WML_MAIN = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
/** The namespace an element's or an attribute's name is in: its prefix's, as declared on the way
 *  down (`scope`, '' the default), or, for an attribute with no prefix, its element's
 *  (`elemUri`) — DrawingML, VML and the package's own parts write their attributes that way.
 *  WordprocessingML does not: every attribute it defines carries its prefix (w:val,
 *  w14:paraId), so one with none on a w: element is no one's vocabulary, and <w:p
 *  MargaretTan="1"> or <w:p tel="61234567"> shipped from the body unread (W3-7, owner ruling 12,
 *  2026-09-24). Measured before it landed: no element of the 21 real files carries one, so it
 *  holds none of them. xml: is bound by XML itself and declared nowhere. */
export function nsOfName(q: string, scope: ReadonlyMap<string, string>, elemUri?: string): string | undefined {
  const c = q.indexOf(':');
  if (c > 0) { const p = q.slice(0, c); return p === 'xml' ? 'http://www.w3.org/XML/1998/namespace' : scope.get(p); }
  if (elemUri === WML_MAIN) return undefined;
  return elemUri !== undefined ? elemUri : scope.get('');
}
/** Whether an attribute's value is read by the safety-net pattern in a part Word writes: one in a
 *  namespace the file format and Office's programs do not define (KNOWN_NS) — an add-in's own,
 *  or one declared nowhere — is an add-in's value, and a telephone, card, account or identity
 *  number typed into it ("acme:tel", "acme:no") shipped from a part the writer knows under a
 *  receipt that said numbers were read (P23-3, owner ruling 11, 2026-09-24). Office's own are
 *  not: a z-index of 251659264 or a paragraph id of 61234567 is a number to that pattern, and
 *  every file Word saves carries thousands (MACHINE). In a part the writer does not know every
 *  value is read that way already (unknownPartValues).
 *  Nor is one of the few attributes XML itself, XML Schema, XLink or Dublin Core and the package's
 *  property vocabularies define (ATTR_OWN): outside those short lists a name under one of their
 *  prefixes is no one's vocabulary, and xml:tel="2125550147" or dc:no="…" shipped from the body
 *  under the same receipt (W-LEAK-5). Measured before it landed: the 21 real files carry
 *  xml:space (1,874), xsi:type (39) and xsi:nil (13) and no other, so it holds none of them. */
export function attrNet(k: string, scope: ReadonlyMap<string, string>, elemUri?: string): boolean {
  const uri = nsOfName(k, scope, elemUri) ?? '';
  const c = k.indexOf(':');
  const own = c > 0 ? ATTR_OWN.get(uri) : undefined;
  if (own && !own.has(k.slice(c + 1))) return true;
  return !KNOWN_NS.has(uri);
}
/** the attributes a namespace of KNOWN_NS with a closed vocabulary of them defines, by address;
 *  one of these namespaces that defines elements only has none */
const ATTR_OWN: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['http://www.w3.org/XML/1998/namespace', ['lang', 'space', 'base', 'id']],
  ['http://www.w3.org/2001/XMLSchema-instance', ['type', 'nil', 'schemaLocation', 'noNamespaceSchemaLocation']],
  ['http://www.w3.org/1999/xlink', ['href', 'type', 'role', 'arcrole', 'title', 'show', 'actuate', 'label', 'from', 'to']],
  ['http://purl.org/dc/elements/1.1/', []], ['http://purl.org/dc/terms/', []], ['http://purl.org/dc/dcmitype/', []],
  ['http://schemas.openxmlformats.org/package/2006/metadata/core-properties', []],
  ['http://schemas.openxmlformats.org/officeDocument/2006/extended-properties', []],
  ['http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes', []],
].map(([uri, own]) => [uri as string, new Set(own as string[])]));
/** Whether an element's text is read by the safety-net pattern in a part Word writes: the text of
 *  an add-in's own element, in a namespace KNOWN_NS does not list, as an add-in's attribute is
 *  (attrNet, owner ruling 11). <acme:tel>2125550147</acme:tel> in the body, a header or the
 *  list of styles shipped under a receipt that said numbers were read, where acme:tel="…" on the
 *  same paragraph held (W-LEAK-3). */
export function elemNet(tag: string, scope: ReadonlyMap<string, string>): boolean {
  return !!tag && !KNOWN_NS.has(nsOfName(tag, scope) ?? '');
}
/** The elements whose text is a number Word works out for itself — a drawing's position
 *  (wp:posOffset, in EMUs) and its size and position as a share of the page (wp14:pct…) — by
 *  namespace address and local name. Read as an Office element no Word writes is (WHOLE_NET,
 *  SHORT_DIGITS), a picture 44,450 EMUs from its anchor held a real file on a row "44450",
 *  saying the name was readable in the body and to find it in Word, where no search shows it
 *  (W7F-2). Over the 21 real files these carry 3,155 positions (37 of five digits) and 36
 *  shares; every other element outside the page's text whose text is digits alone is a
 *  property the walker reads (cp:revision), a chart's value or cell reference, or in what the
 *  writer drops (app.xml's statistics, custom XML). Their text is read as an Office
 *  attribute's is, a row of digits counting from six characters. */
const OFFICE_MEASURE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', new Set(['posOffset'])],
  ['http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing', new Set(['pctWidth', 'pctHeight', 'pctPosHOffset', 'pctPosVOffset'])],
]);
export function officeMeasure(tag: string, scope: ReadonlyMap<string, string>): boolean {
  const c = tag.indexOf(':');
  return !!OFFICE_MEASURE.get(nsOfName(tag, scope) ?? '')?.has(c > 0 ? tag.slice(c + 1) : tag);
}
/** The words the format's addresses are made of on its own hosts: each path word of a KNOWN_NS
 *  address, a relationship's type (…/relationships/styles) and a SmartArt definition's id
 *  (urn:microsoft.com/office/officeart/2005/8/layout/default). Read as names, "officeDocument"
 *  cut into its words holds every file on a row "Office". */
const SCHEMA_WORDS = new Set([
  ...NS_KNOWN.flatMap(([uri]) => uri.replace(/^[a-z]+:(\/\/[^/]+)?/i, '').split(/[/:]/)),
  ...('officeDocument styles stylesWithEffects fontTable theme themeOverride settings webSettings header footer numbering footnotes endnotes comments '
    + 'commentsExtended commentsIds commentsExtensible people image hyperlink chart chartEx chartUserShapes chartStyle chartColorStyle package oleObject control '
    + 'customXml customXmlProps glossaryDocument diagramData diagramLayout diagramQuickStyle diagramColors diagramDrawing font printerSettings '
    + 'subDocument aFChunk attachedTemplate mailMergeHeaderSource mailMergeSource mailMergeRecipientData recipientData vbaProject wordVbaData '
    + 'keyMapCustomizations vbaProjectSignature vbaProjectSignatureAgile vbaProjectSignatureV3 core-properties extended-properties custom-properties '
    + 'metadata thumbnail digital-signature origin signature certificate video audio media ink model3d webextension webextensiontaskpanes taskpanes '
    + 'documenttasks tasks classificationlabels sensitivitylabels labelinfo activeXControl activeXControlBinary graphicFrameDoc hdphoto svgImage '
    + 'legacyDocTextInfo intelligence intelligence2 customData userCustomization smarttags relationships office word drawing officeart layout quickstyle colors default').split(' '),
].filter((w) => w && !/^\d+$/.test(w)));
/** The media types of the file format's own parts and of the pictures, sounds and fonts Office
 *  keeps, as [Content_Types].xml lists them: Word's vocabulary, never read run together — every
 *  file names "vnd.openxmlformats-officedocument…", which carries a row "Office". A vendor's
 *  own type ("application/vnd.acme.notes+xml") is read. */
export const OWN_MEDIA = /^(?:application\/(?:vnd\.(?:openxmlformats-|ms-)[\w.+-]+|xml|octet-stream|pdf|rdf\+xml|inkml\+xml|x-font(?:data|-ttf|-otf)?|x-emf|x-wmf|x-msmetafile)|image\/(?:png|jpeg|jpg|gif|tiff|bmp|x-emf|x-wmf|emf|wmf|svg\+xml|vnd\.ms-photo|webp|x-icon|x-pict|pict|heic|avif|jxr|x-png)|(?:audio|video)\/(?:mpeg|mp4|mp3|x-wav|wav|x-ms-wma|x-ms-wmv|x-ms-asf|quicktime|ogg|webm|x-msvideo|midi|aac|x-m4a|unknown)|model\/gltf(?:-binary|\+json)|font\/(?:ttf|otf|woff2?))$/i;
/** The words the media types of Office's own parts are made of, as [Content_Types].xml lists
 *  them: the format's vocabulary, as a namespace address's path words are (SCHEMA_WORDS). Read as
 *  names, every file held on a row "Package" ("…openxmlformats-package.relationships+xml", at a
 *  word's edges), and on a row "Office" or "Format" once the mask placed names run together
 *  (engine.ts, 2026-09-23). Each word of the 40 media types in the 21 real files is here. */
const MEDIA_WORDS = new Set([
  ...[...SCHEMA_WORDS].map((w) => w.toLowerCase()),
  ...('application image audio video model font vnd ms x openxmlformats officedocument wordprocessingml spreadsheetml presentationml drawingml '
    + 'package core extended custom properties customxmlproperties relationships main document template macroenabled glossary sheet '
    + 'obfuscatedfont diagramstyle xml octet stream pdf rdf inkml fontdata ttf otf woff woff2 emf wmf msmetafile png jpeg jpg gif tiff bmp '
    + 'svg photo webp icon pict heic avif jxr mpeg mp4 mp3 wav wma wmv asf quicktime ogg webm msvideo midi aac m4a unknown gltf binary json').split(' '),
]);
/** What of a media type is read: null for one Office does not write (a vendor's own,
 *  "application/vnd.acme.notes+xml"), which is read whole; for one it does (OWN_MEDIA), the
 *  value with every word of MEDIA_WORDS blanked with █, or '' when nothing else is left — so
 *  "application/vnd.openxmlformats-officedocument.kestrel+xml" still reads "kestrel". */
export function mediaRest(v: string): string | null {
  if (!OWN_MEDIA.test(v.trim())) return null;
  const rest = v.replace(/[\p{L}\p{N}]+/gu, (w) => (MEDIA_WORDS.has(w.toLowerCase()) ? '█'.repeat(w.length) : w));
  return /[\p{L}\p{N}]/u.test(rest) ? rest : '';
}
/** What of a value on the format's own hosts (SCHEMA) is read: '' for the address of a namespace
 *  the format defines, and otherwise the value with every word the format's addresses are made
 *  of, and every number of a version or a date (four digits or fewer: "2006", "2015/9/8"),
 *  blanked with █ — "http://purl.org/matters/Margaret Tan" reads "matters/Margaret Tan"; a
 *  relationship's type reads nothing. Null for a value on any other host, which is read whole.
 *  A longer number is read: every number was blanked until 2026-09-24, and
 *  "http://purl.org/acme/61234567" (a telephone number in an add-in's address) and a client's
 *  matter number declared as a row shipped under a passing gate (P23-4; owner rulings 9, 11). */
export function schemaRest(v: string): string | null {
  const host = SCHEMA.exec(v);
  if (!host) return null;
  if (KNOWN_NS.has(v)) return '';
  const rest = v.slice(host[0].length).replace(/[^/:#]+/g, (seg) => (SCHEMA_WORDS.has(seg) || /^\d{1,4}$/.test(seg) ? '█'.repeat(seg.length) : seg));
  return /[\p{L}\p{N}]/u.test(rest) ? '█'.repeat(host[0].length) + rest : '';
}
/** attributes whose value is a style's id or name: renamed by the writer, read as names */
export const styleAttr = (tag: string, attr: string, parent: string) =>
  (attr === 'w:val' && (STYLE_REFS.has(tag) || (tag === 'w:name' && parent === 'w:style'))) || (tag === 'w:style' && attr === 'w:styleId') || (tag === 'w:lsdException' && attr === 'w:name');
/** the kinds of walker item the output must not carry at all */
const FORBIDDEN = new Set(['comment', 'link', 'control', 'variable', 'people', 'task', 'customXml', 'glossary']);
/** attributes that must hold a neutral bookmark name, and what a hold calls them */
export const refKind = (tag: string, attr: string, parent: string): string | null =>
  tag === 'w:bookmarkStart' && attr === 'w:name' ? 'bookmark'
    : tag === 'w:hyperlink' && attr === 'w:anchor' ? 'internal link'
      : tag === 'w:name' && parent === 'w:ffData' && attr === 'w:val' ? 'form field' : null;

/** A hit that is the whole of the value it was read in, the spaces around it aside. WHOLE_NET:
 *  the text of an element the safety net does not read (elemNet: one in a namespace Office
 *  defines), where it is a value a machine reads (MACHINE: a number, an id, a date), is read by
 *  the safety-net pattern where the pattern takes the whole of it, and the file holds:
 *  "<w14:x>123456789</w14:x>" — an element no Word writes, under Word's own prefix — shipped a
 *  number the pattern masks in the body (D1 NF4, owner ruling 19f). Measured before it landed:
 *  the 21 real files under the us, uk, sg and au nets held on none, before and after. Exported,
 *  with SHORT_DIGITS, for the attestation, which counts the same hits (attest.ts). */
export const allOf = (r: string, h: { s: number; e: number }): boolean => !r.slice(0, h.s).trim() && !r.slice(h.e).trim();
/** SHORT_DIGITS: a row of digits under RUN_FLOOR (a five-digit matter number) found in a value a
 *  machine reads counts where it is the whole value, and the file holds: an add-in's
 *  acme:matter="44179" shipped beside a row "44179" (D1 NF5, owner ruling 19g). In a value the
 *  safety net reads (an add-in's attribute or element, a part the writer does not know) and in
 *  an element's text but a drawing's position or share (officeMeasure); not in the attributes of
 *  Office's own elements, where with each file's own runs of two to five digits as rows it held 4
 *  of the 21 real files more on Word's sizes and spacing ("w:sz 20", "w:spacing 200") and added
 *  them to the holds of 8 others. Those rows were the files' text: with each file's own drawing
 *  positions of two to five digits as rows, 2 of the 3 files carrying one held until
 *  officeMeasure, and none since. Anywhere else a hit in such a value counts from six characters.
 *  From two digits, as refNames reads a name from two characters (a row of one digit is masked in
 *  text a reader sees, and ships from such a value): read from one, a row "7" held a file on an
 *  add-in's acme:matter="7" and on Word's own <w14:x>7</w14:x>. With each one-digit number of the
 *  21 real files' text a row, 14 of them hold on their document properties with the bound and
 *  without it (W7F-5). */
export const SHORT_DIGITS = /^\p{N}{2,5}$/u;

/** The re-walk of the OUTPUT, every part of it, each parsed once: the walker's items (flows
 *  per part, field instructions, chart values, the attribute text it lists) and then the whole
 *  tree — every element's text the walker did not take and every attribute value — and every
 *  part name, all read against the mask in a few batched calls. A part that is not XML is a
 *  leak unless it is a picture the user chose to keep. */
async function readOutput(bytes: Uint8Array, mask: MaskFn, names: RefName[], tagsUsed: Set<string>, keepImages: boolean, gate: WriteReport['gate'], records: Map<string, WriterFlow> = new Map()): Promise<void> {
  const leaks = gate.leaks;
  const zip = await readZip(bytes);
  const parts = zip.names.filter((n) => !n.endsWith('/'));
  // A written tag is blanked before the check — a table row reading "Person" must not
  // find itself inside "[Person6]". Blanked with a block, not a space: with a space the
  // words on either side of a removed name join into a phrase ("designated [Org1] teams"
  // read as "designated teams", a row of its own — trial file 02, 2026-09-13).
  const tagRe = tagsUsed.size ? new RegExp([...tagsUsed].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
  const bracketed = [...tagsUsed].every((t) => t.startsWith('['));
  const clean = (s: string) => (tagRe && (!bracketed || s.includes('[')) ? s.replace(tagRe, (t) => '█'.repeat(t.length)) : s);
  // A value is read once however often it recurs, and a leak names every place it stands:
  // the custom properties and the custom XML both carrying "Kestrel\nMargaret Tan" were
  // reported as the first alone, so the hold sent the lawyer to fix one of two places
  const owners: Array<{ label: string; mode: ReadMode; value: string; also: string[]; more: number; floor: boolean; whole: boolean }> = [];
  const seen = new Map<string, number>();
  /** each written flow that has a record, for the backstop at the end */
  const saved: Array<{ part: string; text: string; spans: Array<{ s: number; e: number }> }> = [];
  /** the parts the writer does not know, where every value is read for the table's names run together */
  const foreign = new Set<string>();
  /** `floor`: the safety-net pattern counts on the value as written, whatever its mode — a
   *  value of a part the writer does not know (owner ruling 2); `whole`: it counts where it takes
   *  the whole value (WHOLE_NET) */
  const want = (label: string, value: string, mode: ReadMode, floor = false, whole = false) => {
    if (!value.trim()) return;
    if (floor && GUID_VALUE.test(value.trim())) floor = false;
    const k = `${mode}\u0000${floor ? 'f' : whole ? 'w' : ''}\u0000${value}`;
    const at = seen.get(k);
    if (at !== undefined) {
      const o = owners[at];
      if (label !== o.label && !o.also.includes(label)) { if (o.also.length < 3) o.also.push(label); else o.more++; }
      return;
    }
    seen.set(k, owners.length);
    owners.push({ label, mode, value, also: [], more: 0, floor, whole: whole && !floor });
  };
  // A value that carries one of the table's names with nothing between its words (refFind):
  // 'all' both ways, 'run' from RUN_FLOOR characters only (a value Word writes for itself). A
  // written tag is a wall, and a long value (a body) is quoted where the name stands.
  // A percent-escape that writes no character where a name of the table would stand holds too
  // (pctHidden, owner ruling 10): no reading can say which letter the byte meant.
  const refRead = new Map<string, { name: string; shown: string; esc?: string } | null>();
  const checkRef = (label: string, ref: string, how: 'all' | 'run' | 'text' = 'all') => {
    const key = `${how}\u0000${ref}`;
    let f = refRead.get(key);
    if (f === undefined) {
      const v = clean(ref);
      const at = refFind(v, names, how, true, v.length > 80)[0];
      const shown = (s: number, e: number) => (v.length > 80 ? `…${v.slice(Math.max(0, s - 18), s)}«${v.slice(s, e)}»${v.slice(e, e + 18)}…`.replace(/\s+/g, ' ') : ref);
      const hid = at ? null : pctHidden(v, names, how);
      f = at ? { name: at.name, shown: shown(at.s, at.e) } : hid ? { name: hid.name, shown: shown(hid.at, hid.at + hid.esc.length), esc: hid.esc } : null;
      refRead.set(key, f);
    }
    if (f?.esc) leaks.push(`${label}: "${f.shown}" has a percent-escape that is no character (${f.esc}) where "${f.name}" could stand`);
    else if (f) leaks.push(`${label}: "${f.shown}" still carries "${f.name}"`);
  };
  // A name in the markup — an element's, an attribute's, a namespace prefix — is read as a
  // name unless it is the format's own: in a namespace KNOWN_NS lists, under a prefix Office
  // writes for it (whose local names are Word's vocabulary, not read: a row "Target" would hold
  // every file on Relationship@Target). Until 2026-09-23 no name in the markup was read, and
  // <acme:MargaretTan/>, xmlns:margaretTan=… and mc:Ignorable="kestrelcapital" shipped in a
  // part the receipt said was read (INT-23, W6-4). `elemUri`: an attribute with no prefix is in
  // its element's vocabulary.
  // `net`, in a part the writer does not know: the name is read by the safety net as well, as
  // written and as netName reads it (W5R-6), and a name under a namespace the format defines is
  // read too — Word never wrote that part, so its names are not Word's vocabulary, and
  // <w:KestrelCapital/> there shipped under a gate that read no name in Office's namespaces
  // (W5R-2, 2026-09-23). In a part Word writes they stay unread: a row "Target" would hold
  // every file on Relationship@Target. A name outside Office's vocabulary — an add-in's element
  // or attribute, a prefix a compatibility list names that Office does not write, a namespace an
  // add-in declares — is an add-in's in any part, and is read by the safety net there as its
  // values are (owner ruling 11): <acme:t61234567/>, xmlns:acme="urn:acme:tel:61234567" and
  // mc:Ignorable="t61234567" shipped from the body under a receipt that said numbers were read
  // (W-LEAK-5, W-FID-NSDECL-NET).
  const readName = (label: string, v: string, net = false) => {
    want(label, v, 'name', net);
    checkRef(label, v);
    if (net && /\d/.test(v)) want(label, netName(v), 'name', true);
  };
  const nsOf = nsOfName;
  const qnameRead = (label: string, q: string, scope: Map<string, string>, elemUri?: string, net = false) => {
    const c = q.indexOf(':');
    const p = c > 0 ? q.slice(0, c) : '';
    if (p === 'xml' || p === 'xmlns' || q === 'xmlns') return;
    const uri = nsOf(q, scope, elemUri);
    const own = uri !== undefined ? KNOWN_NS.get(uri) : undefined;
    if (own) { if (p && !own.has(p)) readName(label, p, net); if (net) readName(label, q.slice(c + 1), net); return; }
    // an add-in's own name, by the safety net too, in any part (W-LEAK-5)
    readName(label, q, true);
  };
  // a compatibility list (mc:Ignorable="w14 w15", mc:ProcessContent="w14:foo", Requires="wps"):
  // each prefix it names read as a prefix is, and a name under one Office does not write read whole
  const mcList = (label: string, v: string, scope: Map<string, string>, net = false) => {
    for (const tok of v.split(/\s+/)) {
      if (!tok) continue;
      const c = tok.indexOf(':');
      const p = c >= 0 ? tok.slice(0, c) : tok;
      const uri = scope.get(p);
      if (uri !== undefined && KNOWN_NS.get(uri)?.has(p)) { if (net && c >= 0) readName(label, tok.slice(c + 1), net); continue; }
      readName(label, tok, true);
    }
  };
  // a namespace declaration: its prefix unless Office writes it for that namespace, and its
  // address unless the format defines it (on the format's own hosts, what schemaRest leaves),
  // as written and with its escapes read (pctDecoded): "urn:acme:Margaret%20Tan" declared by an
  // add-in shipped under a passing gate (W3-2, 2026-09-24)
  const nsDecl = (label: string, k: string, v: string, net = false) => {
    const p = k === 'xmlns' ? '' : k.slice(6);
    const own = KNOWN_NS.get(v);
    if (p && !own?.has(p)) readName(label, p, net);
    if (own) return;
    for (const a of new Set([v, pctDecoded(v)])) readName(label, schemaRest(a) ?? a, net);
  };
  // A kept field's instruction names things the way an identifier does, with underscores for
  // spaces: " SEQ Project_Kestrel \* ARABIC " shipped readable under a passing gate
  // (2026-09-23), since "Project Kestrel" needs a space to match. Read both ways, and each word
  // cut into its words (refWords). Word's own words are blanked first — the field's code, its
  // switches and a format switch's word (\* MERGEFORMAT) — and so are Word's bookmark names and
  // the neutral ones the writer gives, which are digits after a fixed prefix: " PAGEREF
  // _Toc462382735 \h " read as "_Toc[phone]", and " PAGE " as a row "Page" (a surname), in
  // every file with a table of contents or a page number (docx-parts.mjs, laws 14 and 16).
  // `whole`: the instruction entire (a simple field's, or a complex field's runs joined), where
  // the names the writer renames whatever they say are checked for their neutral form; a piece
  // of an instruction Word split across runs cannot be.
  const field = (label: string, text: string, whole = false) => {
    const own = text.split('');
    const toks = [...text.matchAll(/"[^"]*"|[^\s"]+/g)];
    if (whole && toks.length) {
      const code = toks[0][0].toUpperCase();
      const arg = (t: RegExpMatchArray | undefined) => (t && !t[0].startsWith('\\') ? t[0].replace(/^"|"$/g, '') : null);
      const must = (v: string | null, ok: RegExp, what: string) => { if (v !== null && v.trim() && !NEUTRAL_NAME.test(v.trim()) && !ok.test(v.trim())) leaks.push(`${label}: ${what} is still named "${v}"`); };
      if (code === 'SEQ') must(arg(toks[1]), WORD_LABEL, 'a caption label');
      if (code === 'LISTNUM') must(arg(toks[1]), WORD_LIST, 'a list');
      if (code === 'TOC') toks.forEach((t, i) => { if (t[0] === '\\c' || t[0] === '\\a') must(arg(toks[i + 1]), WORD_LABEL, 'a caption label'); });
    }
    toks.forEach((t, i) => {
      if ((i === 0 && KEEP_FIELD.test(t[0])) || t[0].startsWith('\\') || (i > 0 && toks[i - 1][0] === '\\*' && /^[A-Za-z]+$/.test(t[0]))) {
        for (let k = t.index!; k < t.index! + t[0].length; k++) own[k] = '█';
      }
    });
    const blanked = own.join('').replace(/[\p{L}\p{N}_]+/gu, (tok) => (WORD_BOOKMARK.test(tok) || NEUTRAL_REF.test(tok) || NEUTRAL_NAME.test(tok) ? '█'.repeat(tok.length) : tok));
    want(label, blanked, 'text');
    if (blanked.includes('_')) want(label, blanked.replace(/_/g, ' '), 'text');
    for (const tok of blanked.match(/[\p{L}\p{N}_]+/gu) ?? []) {
      const words = refWords(tok);
      if (words) want(`${label}, "${tok}" read as words`, words, 'words');
      checkRef(label, tok);
    }
  };
  let types: Types = { part: new Map(), ext: new Map() };
  {
    const data = await zip.read('[Content_Types].xml');
    const xml = data ? td.decode(data) : '';
    const root = data && XMLValidator.validate(xml) === true ? walkPart(xml).tree.find((x) => 'Types' in x) : undefined;
    if (root) types = contentTypes(root['Types']);
    else leaks.push('[Content_Types].xml is missing or unreadable');
  }
  // The structural facts first (what must be gone, what must be neutral), then every value
  // queued for the mask. A watermark, a table's alt-text, a text box's description, a renamed
  // shape, a bookmark named after the client, a reviewer's name on a revision the writer
  // missed: each shipped at least once under a gate that re-walked only what the walker lists.
  // `ns`: the prefixes declared on the way down, each with its namespace ('' the default). A
  // prefix used where none is declared is a file Word calls damaged, and XMLValidator does not
  // check namespaces.
  const audit = (part: string, nodes: XNode[], covered: Set<unknown>, coveredAttrs: Map<unknown, Set<string>>, parent: string, gp: string, ns: Map<string, string>) => {
    // a value of a part the writer does not know is read by the safety-net pattern too (owner
    // ruling 2); a picture's (an SVG's path data) is not, where a card rule reads its digits
    const net = foreign.has(part) && !MEDIA_RE.test(part);
    for (const node of nodes) {
      const tag = tagOf(node);
      if (!tag) continue;
      if (tag.startsWith('?')) {
        if (!keptInstruction(tag, node)) leaks.push(`${part}: a processing instruction is still present`);
        else if (tag === '?xml') { if (declExtra(node).length) leaks.push(`${part}: the XML declaration still carries more than its version, encoding and standalone (${declExtra(node).join(', ')})`); }
        else want(`${part} a processing instruction's name`, tag.slice(1), 'machine');
        continue;
      }
      if (tag === '#text') {
        if (covered.has(node)) continue;
        const v = String(node['#text']);
        if (!v.trim()) continue;
        gate.items++;
        const t = v.trim();
        // the names the writer renames whatever they say, checked for their neutral form
        if (FORMULA_TAGS.has(parent)) { for (const b of formulaForeign(v)) leaks.push(`${part}: a chart's cell reference still names "${b}"`); continue; }
        if (parent === 'c:name' && gp === 'c:pivotSource') { if (!NEUTRAL_PIVOT.test(t)) leaks.push(`${part}: a pivot chart still names its source "${t}"`); continue; }
        if (parent === 'w:fldData') { leaks.push(`${part}: a field's hidden data (w:fldData) is still present`); continue; }
        if (/^cx?:(odd|even|first)(Header|Footer)$/.test(parent)) { leaks.push(`${part}: a chart's print header or footer (c:headerFooter) is still present`); continue; }
        const em = ELEM_MASK[parent];
        const mode: ReadMode = em ? readAs(em) : MACHINE.test(t) || VOCAB.test(t) ? 'machine' : 'text';
        // an add-in's own element's text is read by the safety net in any part (elemNet), and
        // Office's own where it is a value Word writes for itself, whole (WHOLE_NET), save a
        // number Word works out (officeMeasure)
        want(`${part} ${em ? em[1] : `<${parent}> text`}`, v, mode, net || (!MEDIA_RE.test(part) && elemNet(parent, ns)), mode === 'machine' && !MEDIA_RE.test(part) && !officeMeasure(parent, ns));
        if (foreign.has(part)) checkRef(`${part} <${parent}> text`, t);
        continue;
      }
      const a: Record<string, string> = node[':@'] || {};
      let here = ns;
      for (const k in a) if (k === 'xmlns' || k.startsWith('xmlns:')) { if (here === ns) here = new Map(ns); here.set(k === 'xmlns' ? '' : k.slice(6), String(a[k])); }
      const undeclared = (q: string) => { const c = q.indexOf(':'); const p = c > 0 ? q.slice(0, c) : ''; return p && p !== 'xml' && p !== 'xmlns' && !here.has(p) ? p : ''; };
      const up = undeclared(tag);
      if (up) leaks.push(`${part}: <${tag}> uses the prefix "${up}" with no namespace declared for it`);
      const elemUri = nsOf(tag, here);
      qnameRead(`${part} the name of an element <${tag}>`, tag, here, undefined, net);
      const walked = coveredAttrs.get(node);
      if (TABLE_ALT.has(tag)) leaks.push(`${part}: table alt-text still present`);
      if (tag === 'w:fldData') leaks.push(`${part}: a field's hidden data (w:fldData) is still present`);
      if (CHART_HF.test(tag)) leaks.push(`${part}: a chart's print header or footer (c:headerFooter) is still present`);
      if (NV_PROPS.test(tag) && a.name && a.name !== neutralName(a)) leaks.push(`${part}: a shape is still named "${a.name}"`);
      const alt = altAttrsOf(tag);
      for (const k in a) {
        const v = String(a[k]);
        gate.values++;
        const ua = undeclared(k);
        if (ua) leaks.push(`${part}: <${tag}> has an attribute with the prefix "${ua}" and no namespace declared for it`);
        // XML's own syntax, read by what it declares or lists; an attribute that only looks like
        // it (mc:client on a prefix bound to another namespace) is an attribute like any other
        if (SYNTAX_ATTR.test(k)) {
          if (k === 'xmlns' || k.startsWith('xmlns:')) { nsDecl(`${part} a namespace declaration (${tag}@${k})`, k, v, true); continue; }
          if (nsOf(k, here) === MC_NS && MC_LISTS.has(k.slice(k.indexOf(':') + 1))) { mcList(`${part} a compatibility list (${tag}@${k})`, v, here, net); continue; }
        }
        if (k === 'Requires' && elemUri === MC_NS) { mcList(`${part} a compatibility list (${tag}@${k})`, v, here, net); continue; }
        qnameRead(`${part} the name of an attribute ${tag}@${k}`, k, here, elemUri, net);
        // an add-in's own attribute, in any part, is read by the safety-net pattern (attrNet)
        const vnet = net || attrNet(k, here, elemUri);
        // a value that names a part, as the package means it (pctDecoded)
        if (/%[0-9A-Fa-f]{2}/.test(v)) { const d = pctDecoded(v); if (d !== v) { want(`${part} ${tag}@${k}`, d, 'name', vnet); checkRef(`${part} ${tag}@${k}`, d); } }
        // and one written with %uXXXX or a character reference only (pctRuns, W-LEAK-7)
        else if (REF_ESCAPE.test(v)) { const d = pctDecoded(v); if (d !== v) { want(`${part} ${tag}@${k}`, d, 'name', vnet); checkRef(`${part} ${tag}@${k}`, d); } }
        if (alt?.includes(k)) { if (v) leaks.push(`${part}: alt-text still present on a ${tag} (@${k})`); continue; }
        if (tag.startsWith('v:') && VML_LINK.includes(k)) { leaks.push(`${part}: a link or a file's path is still on a ${tag} (@${k})`); continue; }
        // Word's reviewer, by an attribute in a namespace the format defines; the same local name
        // in an add-in's namespace is that add-in's value, read below as any other is. Held as the
        // app's own fault, acme:author sent the lawyer to report a bug with no way through
        // (W5R-5, 2026-09-23).
        if (/(^|:)(author|initials)$/.test(k) && KNOWN_NS.has(nsOf(k, here, elemUri) ?? '')) { leaks.push(`${part}: a reviewer's name or initials is still on a ${tag} (@${k})`); continue; }
        if (k === 'o:gfxdata') { leaks.push(`${part}: a hidden copy of a shape (@o:gfxdata) is still present`); continue; }
        if (tag === 'Relationship' && k === 'TargetMode' && v === 'External') leaks.push(`${part}: an external link is still in the relationships`);
        const ref = refKind(tag, k, parent);
        if (ref) { if (v && !WORD_BOOKMARK.test(v) && !NEUTRAL_REF.test(v)) leaks.push(`${part}: a ${ref} is still named "${v}"`); continue; }
        // a link's relationship into this document names a bookmark, which the writer renames
        if (tag === 'Relationship' && k === 'Target' && v.startsWith('#') && a.TargetMode !== 'External') { const b = v.slice(1); if (b && !WORD_BOOKMARK.test(b) && !NEUTRAL_REF.test(b)) leaks.push(`${part}: a link to a bookmark is still named "${v}"`); continue; }
        if (tag === 'w:name' && parent === 'w:abstractNum' && k === 'w:val') { if (v.trim() && !NEUTRAL_NAME.test(v.trim()) && !WORD_LIST.test(v.trim())) leaks.push(`${part}: a list is still named "${v}"`); continue; }
        if ((tag === 'w:caption' && k === 'w:name') || (tag === 'w:autoCaption' && k === 'w:caption')) { if (v.trim() && !NEUTRAL_NAME.test(v.trim()) && !WORD_LABEL.test(v.trim())) leaks.push(`${part}: a caption label is still named "${v}"`); continue; }
        if ((tag.startsWith('v:') && (k === 'id' || k === 'o:spid')) || (tag === 'o:OLEObject' && k === 'ShapeID')) { if (v && !VML_MACHINE_ID.test(v)) leaks.push(`${part}: a drawn shape is still named "${v}"`); continue; }
        if (VML_RULE.has(tag) && VML_RULE_REFS.includes(k)) { if (v && !VML_MACHINE_ID.test(v.replace(/^#/, ''))) leaks.push(`${part}: a connector still names a drawn shape "${v}"`); continue; }
        if (tag.startsWith('v:') && k === 'style') {
          // CSS, declaration by declaration (vmlStyle): the property names are Word's
          for (const decl of v.split(';')) {
            const c = decl.indexOf(':');
            if (c < 0) continue;
            const prop = decl.slice(0, c).trim().toLowerCase(), val = decl.slice(c + 1).trim();
            if (!val) continue;
            if (prop === 'font-family') { for (const fam of val.split(',')) want(`${part} a font name`, fam.trim().replace(/^(["'])(.*)\1$/s, '$2'), 'ident'); continue; }
            if (prop === 'mso-next-textbox') { if (!VML_MACHINE_ID.test(val.replace(/^#/, ''))) leaks.push(`${part}: a text box still names the next one "${val}"`); continue; }
            want(`${part} ${tag}@style ${prop}`, val, MACHINE.test(val) || VOCAB.test(val) ? 'machine' : 'name');
          }
          continue;
        }
        // read already, as the walker's item
        if (walked?.has(k)) continue;
        // an address on the format's own hosts, and a media type Office writes: what schemaRest
        // and mediaRest leave of it, as a name
        const rest = k === 'ContentType' && part === '[Content_Types].xml' ? mediaRest(v) : schemaRest(v);
        if (rest !== null) { if (rest) { want(`${part} ${tag}@${k}`, rest, 'name', vnet); checkRef(`${part} ${tag}@${k}`, rest); } continue; }
        const am = ATTR_MASK[tag]?.[k];
        const t = v.trim();
        // A code word ("rId4", "upperRoman") is read for a row only as the table writes it, so a
        // name run together in one ("margaretTan", "kestrelAcquisition") is found by nothing
        // there. In a part the writer does not know every value is also read for the table's
        // names run together (refCarries), and so is a relationship's id anywhere but Word's own
        // rIdN: each of these shipped under a passing gate (W5-2, 2026-09-23). Not every code
        // word in a part Word writes: "upperRoman" carries a row "Roman" (a surname) by the
        // same reading, in every file with a list numbered that way.
        if (foreign.has(part) || (((tag === 'Relationship' && k === 'Id') || R_ATTRS.includes(k)) && !/^rId\d+$/.test(t))) checkRef(`${part} ${tag}@${k}`, t);
        // a theme's script code is Word's own value (fontScript, W-FID-4)
        const script = fontScript(tag, k, t);
        want(`${part} ${am ? am[1] : `${tag}@${k}`}`, v, am ? readAs(am) : styleAttr(tag, k, parent) || (tag === 'w:aliases' && parent === 'w:style') ? 'style' : EMAILISH.test(v) ? 'text' : script || MACHINE.test(t) || VOCAB.test(t) ? 'machine' : 'name', vnet);
      }
      audit(part, node[tag], covered, coveredAttrs, tag, parent, here);
    }
  };
  // the styles that are Word's own, by id (BUILTIN_STYLE): a paragraph that uses "Heading1" is
  // not read for a row "Heading"
  const builtinIds = new Set<string>();
  for (const n of ['word/styles.xml', 'word/stylesWithEffects.xml']) {
    const data = parts.includes(n) ? await zip.read(n) : null;
    const xml = data ? td.decode(data) : '';
    if (!xml || XMLValidator.validate(xml) !== true) continue;
    const visit = (nodes: XNode[]) => {
      for (const node of nodes) {
        const t = tagOf(node);
        if (!t || t === '#text') continue;
        if (t === 'w:style') {
          const id = (node[':@'] || {})['w:styleId'];
          const nm = (node[t] as XNode[]).find((c) => 'w:name' in c);
          const name = nm ? String((nm[':@'] || {})['w:val'] ?? '') : '';
          if (id !== undefined && BUILTIN_STYLE.test(name.trim()) && idOfName(String(id), name)) builtinIds.add(String(id));
          continue;
        }
        visit(node[t]);
      }
    };
    visit(walkPart(xml).tree);
  }
  for (const n of parts) {
    gate.parts++;
    want(`the part name ${n}`, n, 'name');
    const decoded = pctDecoded(n);
    if (decoded !== n) { want(`the part name ${n}`, decoded, 'name'); checkRef(`the part name ${n}`, decoded); }
    if (DROP_KINDS.some((d) => d.re.test(n))) leaks.push(`${n}: a part the writer removes is in the output`);
    if (!isXml(n, types)) { if (!(keepImages && MEDIA_RE.test(n))) leaks.push(`${n}: a part nothing can read as text is in the output`); continue; }
    const xml = td.decode((await zip.read(n))!);
    if (XMLValidator.validate(xml) !== true) { leaks.push(`${n}: not well-formed XML`); continue; }
    // the parser hands the audit neither, so they are looked for as written: every part the
    // writer builds has none, and a kept SVG has them removed (W5R-9)
    if (/<!--|<!DOCTYPE/i.test(xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, ''))) leaks.push(`${n}: a comment or a document type declaration is still present`);
    const rule = RULES.find((r) => r.re.test(n) && !r.rels);
    // a part the writer does not know (writeRedactedDocx, step 1)
    if (!rule && n !== '[Content_Types].xml' && !/\.rels$/.test(n) && !LAYOUT_RE.test(n)) foreign.add(n);
    // its name, by the safety net as written and as netName reads a name (W5R-6); not a
    // picture's (netName)
    if (foreign.has(n)) { want(`the part name ${n}`, decoded, 'name', true); if (/\d/.test(decoded)) want(`the part name ${n}`, netName(decoded), 'name', true); }
    const { tree, items } = walkPart(xml, !!rule?.captureAll);
    const covered = new Set<unknown>();
    const coveredAttrs = new Map<unknown, Set<string>>();
    const flow: WalkItem[] = [];
    for (const i of items) {
      covered.add(i.node);
      if (i.attr) coveredAttrs.set(i.node, (coveredAttrs.get(i.node) ?? new Set<string>()).add(i.attr));
      gate.items++;
      if (i.rev) leaks.push(`${n}: tracked change still present`);
      if (i.hidden) leaks.push(`${n}: hidden run still present`);
      if (i.kind && FORBIDDEN.has(i.kind)) leaks.push(`${n}: ${i.kind} text still present`);
      if (i.attr) { if (i.kind === 'field') field(`${n} field @${i.attr}`, i.text, true); else want(`${n} ${i.kind} @${i.attr}`, i.text, 'text'); }
      else if (i.kind === 'field') field(`${n} field code`, i.text);
      else if (i.num) want(`${n} chart value`, numericForm(i.text), 'text');
      else {
        flow.push(i);
        if (i.math) want(`${n} an equation`, i.text, 'ident');
      }
    }
    // an equation as it renders, its runs joined (maskMath)
    for (const zone of mathZones(flow)) if (zone.length > 1) want(`${n} an equation`, zoneText(zone).text, zoneRead(zone) === 'all' ? 'ident' : 'text');
    if (flow.length) {
      let synthetic = -1;
      const lay = flowLayout(flow.map((i) => (i.para === undefined ? { ...i, para: synthetic-- } : i)));
      const text = lay.text;
      want(n, text, 'text');
      if (records.has(n)) saved.push({ part: n, text, spans: lay.spans.map((sp) => ({ s: sp.s, e: sp.e })) });
    }
    for (const s of joinedInstructions(tree)) field(`${n} field code`, s, true);
    audit(n, tree, covered, coveredAttrs, '', '', new Map());
  }
  // every reading of every value, in a few calls
  const readings: string[] = [];
  const ro: number[] = [];
  // the value as written, where an 'ident' reading takes the whole mask
  // where on each reading the safety-net pattern counts: the whole of a font's name as written,
  // a style's name or id as written and with its underscores as spaces (scanStyles), and a number
  // format's quoted literals (maskValue); null where it never does
  const floorAt: Array<Array<[number, number]> | null> = [];
  owners.forEach((o, k) => {
    if (o.mode === 'ident' && (STANDARD_FONT.test(o.value.trim()) || NEUTRAL_IDENT.test(o.value.trim()))) return;
    if (o.mode === 'style' && (BUILTIN_STYLE.test(o.value.trim()) || builtinIds.has(o.value))) return;
    const v = clean(fold(o.value));
    const all = o.mode === 'name' || o.mode === 'style' || o.mode === 'ident' || o.mode === 'format' ? identReadings(v) : [v];
    all.forEach((r, j) => {
      if (!r.trim()) return;
      readings.push(r);
      ro.push(k);
      const whole: Array<[number, number]> = [[0, r.length]];
      floorAt.push(o.floor && j === 0 ? whole : o.mode === 'ident' ? (j === 0 ? whole : null)
        : o.mode === 'style' ? (styleFloor(j, v) ? whole : null)
          : o.mode === 'format' ? (j === 0 ? formatLiterals(r) : null) : null);
    });
    // a number format as it prints, each stretch of it whole (formatRuns, maskFormat)
    if (o.mode === 'format') for (const run of formatRuns(v)) if (run.text.trim()) { readings.push(run.text); ro.push(k); floorAt.push([[0, run.text.length]]); }
    // every value that names something, read for the table's names with nothing between their
    // words: one identifier, or each a list, a path or a spaced value holds (refCarries cuts at
    // every separator), where only a value that was one identifier was until 2026-09-23 (W3-B)
    if (o.mode === 'name' || o.mode === 'style' || o.mode === 'ident' || o.mode === 'format') checkRef(o.label, o.value);
    // and every other value (owner ruling 1, 2026-09-23): text a reader sees as the writer masks
    // it (refFind 'text': placeFlow, maskValue); a value Word writes for itself run together from
    // RUN_FLOOR characters ("kestrelholdings"), save the file format's own media types, where
    // "officedocument" carries a row "Office" in every file's list of parts
    else if (o.mode === 'text') checkRef(o.label, o.value, 'text');
    else if (o.mode === 'machine' && !OWN_MEDIA.test(o.value.trim())) checkRef(o.label, o.value, 'run');
  });
  const { hits, divergence } = readAll(mask, readings);
  if (divergence) { leaks.push(`mask divergence — ${divergence}`); return; }
  // a leak is named with the text that stayed readable and a little of what stands
  // around it — the user is deciding whether to send this file, and "4 spans" is not a
  // decision anyone can make. The context stops where the reading does: a name read as its
  // words is several readings on one string, and the others are not what the file says.
  const found = new Map<number, string[]>();
  hits.forEach((hs, i) => {
    if (!hs.length) return;
    const o = owners[ro[i]];
    const r = readings[i];
    const lit = floorAt[i];
    const keep = hs.filter((h) => (o.mode === 'text' || (o.mode === 'ident' && lit) ? true
      : h.floor ? (!!lit && lit.some(([s, e]) => h.s >= s && h.e <= e)) || (o.whole && allOf(r, h))
        : o.mode === 'machine' ? h.e - h.s >= 6 || ((o.floor || o.whole) && allOf(r, h) && SHORT_DIGITS.test(r.slice(h.s, h.e))) : countsInIdent(r, h)));
    if (!keep.length) return;
    const l = found.get(ro[i]) || [];
    for (const h of keep.sort((a, b) => a.s - b.s)) {
      const j = r.lastIndexOf(REF_JOIN, h.s - 1), k = r.indexOf(REF_JOIN, h.e);
      const lo = Math.max(h.s - 18, j < 0 ? 0 : j + REF_JOIN.length), hi = Math.min(h.e + 18, k < 0 ? r.length : k);
      l.push(`"${r.slice(lo, h.s).replace(/\s+/g, ' ')}«${r.slice(h.s, h.e)}»${r.slice(h.e, hi).replace(/\s+/g, ' ')}"`);
    }
    found.set(ro[i], l);
  });
  for (const [k, l] of found) {
    const o = owners[k];
    const also = o.also.length ? ` (the same in ${o.also.join('; ')}${o.more ? ` and ${o.more} more place${o.more > 1 ? 's' : ''}` : ''})` : '';
    leaks.push(`${o.label}${also}: ${l.length} span(s) still readable — ${l.slice(0, 3).join(', ')}`);
  }
  recordBackstop(saved, records, mask, clean, leaks);
}

const NAME_WORD = /[\p{L}\p{N}]+/gu;
/** The backstop to placeFlow. A name the author broke with hidden text or a removed field's
 *  result reads, once stripped, as PART of a row ("John Smith" of "John Michael Smith"), and no
 *  reading of the output places a part of a row: the gate above passed the saved .docx naming
 *  the claimant (P2-PATHS-2, 2026-09-23). So each written flow is set against its record: the
 *  record masked by the same mask, and every word of the table's names counted readable in
 *  each. The writer only ever takes text out of the record and puts tags in, so a flow it
 *  wrote right never reads a word of a name more often than its masked record does. Counted,
 *  not matched in the row's order, so a word the strip leaves alone ("John" with "Smith"
 *  removed, or with a second name between them) is caught as surely as the pair.
 *
 *  A count that rises is only the trigger. "Mr " + "Smith" + a hidden "son" reads "Smithson"
 *  in the record, which is no word of the row "John Smith", and "Smith" in the copy: one more
 *  "smith" than the record, where the review masked nothing — the count alone held that copy
 *  and told the lawyer a word of the client's name stood where the review masked it, which was
 *  false (W4-F3, 2026-09-23). So each such word is then placed: its characters are carried
 *  back to the record through the pieces the writer kept (WriterFlow), and the file holds when
 *  the word lands inside a stretch the mask places on the record (the review masked it there),
 *  when its characters are not one stretch of the record (the strip joined it: "Jo" + a hidden
 *  "x" + "hn"), or when it cannot be carried back at all. A run the copy leaves out is found by
 *  matching each saved run's untagged text, in order, inside a kept piece; where the same text
 *  could be more than one piece, both the first and the last reading are tried and either one
 *  landing on a masked stretch holds — a doubt resolves toward holding, never toward shipping.
 *
 *  A hold names the part and the row by its tag and category, never the word: the reason is
 *  shown and logged, and it must not carry what the copy exists to take out. Costs one mask
 *  of each record in which a word of the table's names stands readable in the written flow,
 *  and one walk of that flow's runs where a count rose. */
function recordBackstop(saved: Array<{ part: string; text: string; spans: Array<{ s: number; e: number }> }>, records: Map<string, WriterFlow>, mask: MaskFn, clean: (s: string) => string, leaks: string[]): void {
  const table = [...new Set(mask.names ?? [])];
  if (!saved.length || !table.length) return;
  const byWord = new Map<string, number[]>();
  table.forEach((nm, k) => { for (const w of fold(nm).toLowerCase().match(NAME_WORD) ?? []) if (w.length >= 2) byWord.set(w, [...(byWord.get(w) ?? []), k]); });
  const count = (s: string) => {
    const m = new Map<string, number>();
    for (const w of s.toLowerCase().match(NAME_WORD) ?? []) if (byWord.has(w)) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  };
  const todo = saved.map((s) => {
    const flow = records.get(s.part)!;
    const read = clean(fold(s.text));
    return { part: s.part, flow, record: flow.record, read, spans: s.spans, got: count(read) };
  }).filter((t) => t.got.size);
  if (!todo.length) return;
  const { hits, divergence } = readAll(mask, todo.map((t) => t.record));
  if (divergence) { leaks.push(`mask divergence — ${divergence}`); return; }
  const gained: Array<{ part: string; masked: Set<number>; joined: Set<number> }> = [];
  todo.forEach((t, i) => {
    let masked = '', pos = 0;
    for (const h of [...hits[i]].sort((a, b) => a.s - b.s)) {
      if (h.e <= pos) continue;
      const s = Math.max(h.s, pos);
      masked += t.record.slice(pos, s) + '█'.repeat(h.e - s);
      pos = h.e;
    }
    const had = count(masked + t.record.slice(pos));
    const rose = new Set<string>();
    for (const [w, n] of t.got) if (n > (had.get(w) ?? 0)) rose.add(w);
    if (!rose.size) return;
    const inHit = (a: number, b: number) => hits[i].some((h) => h.s < b && a < h.e);
    const maps = [placeSaved(t.read, t.spans, t.flow, false), placeSaved(t.read, t.spans, t.flow, true)];
    const inHitRows = new Set<number>(), joinedRows = new Set<number>();
    for (const m of t.read.matchAll(NAME_WORD)) {
      const w = m[0].toLowerCase();
      if (!rose.has(w)) continue;
      const a = m.index!, len = m[0].length;
      // 'masked': the review masked it there; 'joined': the review never read this word, the
      // copy made it out of text on either side of what it left out
      let why: 'masked' | 'joined' | null = null;
      for (const at of maps) {
        const r = at[a];
        let whole = r >= 0;
        for (let x = 1; whole && x < len; x++) whole = at[a + x] === r + x;
        if (!whole) why ??= 'joined';
        else if (inHit(r, r + len)) why = 'masked';
      }
      if (why) for (const k of byWord.get(w)!) (why === 'masked' ? inHitRows : joinedRows).add(k);
    }
    if (inHitRows.size || joinedRows.size) gained.push({ part: t.part, masked: inHitRows, joined: joinedRows });
  });
  if (!gained.length) return;
  // the row's tag, as the mask writes it: the review table shows the lawyer the same one
  const all = [...new Set(gained.flatMap((g) => [...g.masked, ...g.joined]))];
  const tagged = readAll(mask, all.map((k) => fold(table[k])));
  const tagOfRow = new Map<number, string>();
  all.forEach((k, i) => { const h = tagged.hits[i].find((x) => !x.floor); if (h) tagOfRow.set(k, h.tag); });
  const named = (ks: Set<number>) => {
    const rows = [...new Set([...ks].map((k) => {
      const tag = tagOfRow.get(k);
      const cat = tag ? /^\[?([\p{L}]+)/u.exec(tag)?.[1]?.toLowerCase() : undefined;
      return tag ? `a ${cat ?? 'masked'} row (${tag})` : 'a row of the table';
    }))];
    return `${rows.slice(0, 3).join(', ')}${rows.length > 3 ? ` and ${rows.length - 3} more` : ''}`;
  };
  for (const g of gained) {
    if (g.masked.size) leaks.push(`${g.part}: a word of ${named(g.masked)} stands readable in the copy where the reviewed text masks it — hidden text, or text the copy leaves out, sits inside the name`);
    if (g.joined.size) leaks.push(`${g.part}: a word of ${named(g.joined)} stands readable in the copy where the reviewed text does not read it — the copy joins the text on either side of hidden text, or of text it leaves out, into that word`);
  }
}

/** Where each character of a saved flow stands in its record, for recordBackstop; -1 where it
 *  cannot be carried back. `read` is the saved flow, folded, its written tags blanked (█); its
 *  runs are `spans`. Each run is matched, in order, to a kept piece whose record text holds the
 *  run's untagged stretches in the same order: the writer only takes text out of a piece and
 *  puts a tag in its place. A piece whose run was emptied, or left as spacing, has no run in the
 *  saved flow and is passed over. `last` matches from the end, taking the last piece and the
 *  last place that fit; a run no piece fits keeps -1, and so holds. */
function placeSaved(read: string, spans: Array<{ s: number; e: number }>, flow: WriterFlow, last: boolean): Int32Array {
  const at = new Int32Array(read.length).fill(-1);
  const { pieces, record } = flow;
  /** where each untagged stretch of the run stands in the piece's record text, or null */
  const fit = (segs: Array<[number, string]>, rec: string): number[] | null => {
    const where: number[] = new Array(segs.length);
    if (!last) {
      let from = 0;
      for (let k = 0; k < segs.length; k++) {
        const x = rec.indexOf(segs[k][1], from);
        if (x < 0) return null;
        where[k] = x;
        from = x + segs[k][1].length;
      }
    } else {
      let to = rec.length;
      for (let k = segs.length - 1; k >= 0; k--) {
        const x = to - segs[k][1].length < 0 ? -1 : rec.lastIndexOf(segs[k][1], to - segs[k][1].length);
        if (x < 0) return null;
        where[k] = x;
        to = x;
      }
    }
    return where;
  };
  const order = spans.map((_, j) => j);
  if (last) order.reverse();
  const step = last ? -1 : 1;
  let p = last ? pieces.length - 1 : 0;
  for (const j of order) {
    const sp = spans[j];
    const segs: Array<[number, string]> = [...read.slice(sp.s, sp.e).matchAll(/[^█]+/g)].map((m) => [m.index!, m[0]]);
    for (let q = p; q >= 0 && q < pieces.length; q += step) {
      const where = fit(segs, record.slice(pieces[q].s, pieces[q].e));
      if (!where) continue;
      segs.forEach(([off, seg], k) => { for (let x = 0; x < seg.length; x++) at[sp.s + off + x] = pieces[q].s + where[k] + x; });
      p = q + step;
      break;
    }
  }
  return at;
}

// ---------- what a hold says ----------
/** where a leak stands, in the words a lawyer uses for the document */
const PLACE: Array<[RegExp, string]> = [
  [/^the part name /, 'the name of a part inside the file'],
  [/^mask divergence/, 'the check of the copy'],
  [/\.rels\b/, 'the file\'s internal links'],
  [/^\[Content_Types\]/, 'the file\'s list of parts'],
  [/^word\/document\.xml/, 'the body'],
  [/^word\/header\d*\.xml/, 'a header'],
  [/^word\/footer\d*\.xml/, 'a footer'],
  [/^word\/footnotes\.xml/, 'the footnotes'],
  [/^word\/endnotes\.xml/, 'the endnotes'],
  [/^word\/(styles|stylesWithEffects)\.xml/, 'the list of styles'],
  [/^word\/numbering\.xml/, 'the list numbering'],
  [/^word\/theme\//, 'the theme'],
  [/^word\/fontTable\.xml/, 'the list of fonts'],
  [/^word\/(settings|webSettings)\.xml/, 'the document settings'],
  [/^word\/charts\//, 'a chart'],
  [/^word\/drawings\//, 'a text box drawn on a chart'],
  [/^word\/diagrams\//, 'a SmartArt graphic'],
  [/^docProps\//, 'the document properties'],
];
/** what the writer removes or renames whatever the table says: found in the output, it is the
 *  writer that failed, and nothing the lawyer does to the file is the way through */
const FAULT = /not well-formed XML|no namespace declared|mask divergence|tracked change still present|hidden run still present| text still present|a part the writer removes is in the output|a part nothing can read as text is in the output|is missing or unreadable|alt-text still present|reviewer's name|hidden copy of a shape|a link or a file's path|external link is still|hidden data \(w:fldData\)|print header or footer \(c:headerFooter\)|is still named|still names|processing instruction is still|XML declaration still carries|a comment or a document type declaration is still/;
/** A held file's reason, in plain words first — where in the document, and what the lawyer can
 *  do — and then what the check found, for whoever has to look closer. Until 2026-09-23 a hold
 *  said only "the re-walk of the output found: word/numbering.xml w:abstractNum … «Kestrel»",
 *  which names neither the place in Word nor a way through. */
function heldMessage(leaks: string[]): string {
  const u = [...new Set(leaks)];
  const where = (l: string) => PLACE.find(([re]) => re.test(l))?.[1] ?? 'a part of the file this app does not know';
  const list = (xs: string[]) => { const w = [...new Set(xs)]; return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : w[0]; };
  const fault = u.filter((l) => FAULT.test(l));
  const readable = u.filter((l) => !FAULT.test(l));
  const said: string[] = [];
  if (readable.length) {
    said.push(`text your table masks is still readable in ${list(readable.map(where))}.`);
    if (readable.some((l) => /field/.test(l))) said.push('In Word, press Alt+F9 to show the field codes and take the name out of the field, or click in the field and press Ctrl+Shift+F9 to make it plain text.');
    if (readable.some((l) => /w:(pStyle|rStyle|tblStyle|styleId|basedOn|next|link|aliases|lsdException)|style name/.test(l))) said.push('Rename the style in Word (Styles pane: right-click it, Modify), or give that text another style.');
    // a part's name is on no page: the only way to it in Word is the object the part belongs to
    if (readable.some((l) => /^the part name |@PartName:|Relationship@Target: "(?!#)/.test(l))) said.push('A part inside the file is named with it: Word never shows that name, but anyone who opens the copy as a zip file can read it. Such a part belongs to an add-in or to the program that made the file, and Word keeps it as it is named; delete the object it belongs to in Word, if there is one.');
    // an rId is found and retyped nowhere in Word; the only way out is a new container
    if (readable.some((l) => /Relationship@Id:|@r:(?:id|embed|link|href|pict|dm|lo|qs|cs):/.test(l))) said.push('An id inside the file that links one of its parts to another carries it: Word never shows that id, so it cannot be found or retyped in Word.');
    // a name in the markup is on no page either (readOutput qnameRead, nsDecl, mcList)
    if (readable.some((l) => /the name of an (?:element|attribute) |a namespace declaration \(|a compatibility list \(|a processing instruction's name/.test(l))) said.push('The file\'s own code carries it — the name of an element or an attribute, or a namespace an add-in declares: Word never shows it, and it belongs to an add-in or to the program that made the file. Delete the object or content it belongs to in Word, if there is one.');
    // a value in the code (an attribute's, the text of an element Word does not print) is reached
    // by no Find, and "find the text in Word" alone sent the lawyer looking for an add-in's
    // record in a paragraph and "<w14:x> 44179" in the body (W7F-2): where every leak is one, the
    // last sentence does not say it; a style's name, an id and a percent-escape have sentences of
    // their own
    const code = (l: string) => /^\S+ (?:[\w.-]+:)?[\w.-]+@(?:[\w.-]+:)?[\w.-]+(?::| \()|^\S+ <[^\s>]+> text(?::| \()/.test(l)
      && !/Relationship@(?:Id|Target):|@r:(?:id|embed|link|href|pict|dm|lo|qs|cs):|@PartName:|has a percent-escape that is no character|w:(?:style|pStyle|rStyle|tblStyle|basedOn|next|link|aliases|lsdException|name)@/.test(l);
    if (readable.some(code)) said.push('It stands in a value in the file\'s own code — an attribute, or the text of an element Word does not print, such as an add-in\'s record — which Word\'s Find does not reach: delete the object or content it belongs to in Word, if there is one.');
    // Retyped where it is on a page; a part's name, or a value in the file's code (an attribute's,
    // an element's in a part Word does not write), is found in Word nowhere, and "find the address
    // and retype it" sent the lawyer looking for what no search shows (W-FID-PCT-WAYOUT)
    const pct = readable.filter((l) => /has a percent-escape that is no character/.test(l));
    const onPage = (l: string) => !/^the part name /.test(l) && !/^[^"]*[@<]/.test(l);
    if (pct.some(onPage)) said.push('A web address or a file\'s path there writes a letter as a percent-escape (such as %E9) that stands for no character, where a name of your table could be, and nothing can say which letter it meant. Find the address and retype it with the letter written out, or delete it.');
    if (pct.some((l) => !onPage(l))) said.push('A value inside the file that Word never shows — the name of a part, or a value in the file\'s own code — writes a letter as a percent-escape (such as %E9) that stands for no character, where a name of your table could be, and nothing can say which letter it meant; it cannot be found or retyped in Word. Delete the object it belongs to in Word, if there is one.');
    if (readable.some((l) => /where the reviewed text (masks|does not read) it/.test(l))) said.push('A name there has hidden text or a field\'s result inside it, which the copy leaves out, and what is left of the name is not masked. In Word, press Ctrl+Shift+8 to show hidden text and delete it or make it visible (Font, clear Hidden); press Alt+F9 to show field codes and take the field out of the name.');
    said.push(readable.every(code) ? 'Otherwise copy the document\'s text into a new blank document; save, and drop that copy here.' : 'Otherwise find the text in Word and delete or retype it, or copy the document\'s text into a new blank document; save, and drop that copy here.');
  }
  if (fault.length) said.push(`${readable.length ? 'Separately, the' : 'the'} app failed to remove or rewrite something it always removes or rewrites (in ${list(fault.map(where))}): a fault in the app, not in your file.`);
  return `${said.join(' ')} What the check found: ${u.slice(0, 6).join('; ')}${u.length > 6 ? ` (+${u.length - 6} more)` : ''}`;
}

// ---------- the writer ----------
export async function writeRedactedDocx(original: Uint8Array, opts: WriteOptions): Promise<WriteReport> {
  const keepImages = !!opts.keepImages;
  const report: WriteReport = {
    bytes: null, held: null,
    parts: { written: [], copied: [], dropped: [] },
    channels: {},
    removed: { deletions: 0, insertionsUnwrapped: 0, hiddenRuns: 0, comments: 0, fieldsUnlinked: 0, fieldsRemoved: 0, fieldsKept: 0, hyperlinks: 0, controls: 0, images: 0, objects: 0, altTexts: 0, externalLinks: 0, revisionMarks: 0, permissions: 0, settings: 0, properties: 0, danglingRefs: 0, chartValuesZeroed: 0, names: 0, shapeCopies: 0, styles: 0 },
    gate: { parts: 0, items: 0, values: 0, leaks: [] },
    notes: [],
    warnings: [],
    flows: [],
  };
  const hold = (why: string): WriteReport => { report.held = why; report.bytes = null; return report; };

  let zip;
  try { zip = await readZip(original); } catch (e) { return hold(`not a .docx package: ${(e as Error).message}`); }
  const names = zip.names.filter((n) => !n.endsWith('/'));
  if (!names.includes('word/document.xml') || !names.includes('[Content_Types].xml')) return hold('not a Word package (no word/document.xml)');

  // A part written in UTF-16 reads as no XML at all decoded as UTF-8, and it held as "malformed"
  // until 2026-09-24, which is false about a file Word opens (W-LEAK-8). Re-saved by Word, every
  // part is written in UTF-8.
  const utf16Held = (n: string) => hold(`${n} is written in UTF-16, which Word reads and this app does not: it reads every part as UTF-8, so nothing can say what the part holds, and the copy cannot carry it. Open the file in Word and save it again (Word writes every part in UTF-8), or copy the document's text into a new blank document; save, and drop that copy here.`);

  // 0. content types first: they say which parts are XML
  const ctBytes = (await zip.read('[Content_Types].xml'))!;
  if (utf16Part(ctBytes)) return utf16Held('[Content_Types].xml');
  const ctXml = td.decode(ctBytes);
  if (XMLValidator.validate(ctXml) !== true) return hold('malformed [Content_Types].xml');
  const ctTree = walkPart(ctXml).tree;
  const ctRoot = ctTree.find((x) => 'Types' in x);
  if (!ctRoot) return hold('no Types element in [Content_Types].xml');
  const types = contentTypes(ctRoot['Types']);

  // 1. which parts go, which stay
  const dropped = new Set<string>();
  const dropNotes = new Set<string>();
  for (const n of names) {
    const kind = DROP_KINDS.find((d) => d.re.test(n));
    if (kind) { dropped.add(n); dropNotes.add(kind.note); } else if (!keepImages && MEDIA_RE.test(n)) dropped.add(n);
  }
  for (const n of names) {
    if (!/\.rels$/.test(n)) continue;
    const { owner } = relsOwner(n);
    if (owner && dropped.has(owner)) dropped.add(n);
  }
  const kept = names.filter((n) => !dropped.has(n));
  const textRule = (n: string) => RULES.find((r) => r.re.test(n) && !r.rels);
  // A part the writer does not know is READ, not refused out of hand: kept if it is XML and
  // holds nothing anyone typed, and read to the last character by the gate. One that holds
  // text holds the file (step 3); one that is not XML — nothing can read it — holds too, after
  // the relationships, so a document imported as HTML or RTF is told to be saved once in Word
  // rather than to delete an object.
  const unknown = new Set<string>();
  const unreadable: string[] = [];
  for (const n of kept) {
    if (n === '[Content_Types].xml' || /\.rels$/.test(n) || LAYOUT_RE.test(n) || (keepImages && MEDIA_RE.test(n)) || textRule(n)) continue;
    if (!isXml(n, types)) unreadable.push(n); else unknown.add(n);
  }

  // 2. relationships: external targets go, targets that are dropped parts go; the
  //    owner part is told which ids it may no longer reference
  const droppedIds = new Map<string, Set<string>>();
  const relsTrees = new Map<string, { tree: XNode[]; root: XNode; owner: string; base: string }>();
  const embedOwners = new Set<'chart' | 'object'>();
  for (const n of kept) {
    if (!/\.rels$/.test(n)) continue;
    const u = (await zip.read(n))!;
    if (utf16Part(u)) return utf16Held(n);
    const xml = td.decode(u);
    if (XMLValidator.validate(xml) !== true) return hold(`malformed relationships part: ${n}`);
    const { owner, base } = relsOwner(n);
    const ids = new Set<string>();
    const { tree } = walkPart(xml);
    const root = tree.find((x) => 'Relationships' in x);
    if (!root) return hold(`no Relationships element in ${n}`);
    const keptRels: XNode[] = [];
    for (const r of root['Relationships'] as XNode[]) {
      if (!('Relationship' in r)) { keptRels.push(r); continue; }
      const a = r[':@'] || {};
      if (a.TargetMode === 'External') { report.removed.externalLinks++; ids.add(String(a.Id)); continue; }
      const target = normalizePath(base, String(a.Target || ''));
      // an altChunk is another document (HTML, RTF, a .docx) that Word merges into the text
      // only when it opens the file: the flow the writer masks does not contain it yet
      if (/\/aFChunk$/.test(String(a.Type || ''))) return hold(`this file imports another document (${target}) that Word merges into the text only when it opens the file, and nothing here reads it. Open the file in Word and save it once — the import becomes ordinary text — then drop the saved copy here.`);
      if (dropped.has(target)) {
        if (/^word\/embeddings\//.test(target)) embedOwners.add(/^word\/charts\//.test(owner) ? 'chart' : 'object');
        ids.add(String(a.Id));
        continue;
      }
      keptRels.push(r);
    }
    root['Relationships'] = keptRels;
    droppedIds.set(owner, ids);
    relsTrees.set(n, { tree, root, owner, base });
  }
  if (unreadable.length) return hold(`${unreadable[0]} is a part nothing here can read as text, and not a picture, font or embedded file the writer knows to remove, so nothing can say what it holds. Open the file in Word, delete the object it belongs to (or copy the document's text into a new blank document), save it, and drop that copy here.`);

  // 3. every part to write, read once. The neutral names the writer gives start above any the
  //    file already carries (a copy redacted before and redacted again), and a part the writer
  //    does not know is looked at for text before anything is written.
  const texts = new Map<string, string>();
  let vmlNext = 0;
  const identTaken = new Set<string>();
  const neutralTaken = new Set<string>();
  const encodingHeld = (n: string, e: string) => hold(ASCII_SAME.test(e)
    ? `${n} says on its first line (the XML declaration) that it is written in the encoding "${e}", and it holds a character beyond plain ASCII, which that encoding writes differently from UTF-8, the one this app reads every part in: nothing can say its text was read as it was written, so the copy cannot carry it. Open the file in Word and save it again (Word writes UTF-8), or copy the document's text into a new blank document; save, and drop that copy here.`
    : `${n} says on its first line (the XML declaration) that it is written in the encoding "${e}", which is not one Word or XML writes (UTF-8 or UTF-16), and this app reads every part as UTF-8: nothing can say its text was read as it was written, so the copy cannot carry it. Open the file in Word and save it again (Word writes UTF-8), or copy the document's text into a new blank document; save, and drop that copy here.`);
  for (const n of kept) {
    if (n === '[Content_Types].xml' || /\.rels$/.test(n) || MEDIA_RE.test(n)) {
      // read from their own first line only (and their bytes, for a code page that writes ASCII
      // as ASCII): the list of parts and the relationships are read whole elsewhere, and a
      // picture is XML only when it is an SVG
      if (MEDIA_RE.test(n) && !isXml(n, types)) continue;
      const u = (await zip.read(n))!;
      if (utf16Part(u)) return utf16Held(n);
      const e = declEncoding(td.decode(u.subarray(0, 512)), u);
      if (e !== null) return encodingHeld(n, e);
      continue;
    }
    const u = (await zip.read(n))!;
    if (utf16Part(u)) return utf16Held(n);
    const xml = td.decode(u);
    const e = declEncoding(xml);
    if (e !== null) return encodingHeld(n, e);
    if (XMLValidator.validate(xml) !== true) return hold(`malformed XML part, not written: ${n}`);
    // A letter, a digit or an @ drawn by a w:sym (symText) reads with the words around it, and no
    // mask reaches inside the element: before the walker read it, "6123" + a w:sym "4" + "567"
    // shipped whole as Word draws it, 61234567, under a passing check (W-LEAK-4). The 21 real
    // files carry no w:sym; a symbol font's picture or sign (a Wingdings check box) is kept.
    for (const m of xml.matchAll(/<w:sym\b([^>]*)>/g)) {
      const at = (k: string) => { const v = new RegExp(`\\s${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(m[1]); return v ? (v[1] ?? v[2]) : ''; };
      const font = at('w:font'), ch = symText(font, at('w:char'));
      if (/[\p{L}\p{N}@]/u.test(ch)) return hold(`${n}, ${PLACE.find(([re]) => re.test(n))?.[1] ?? 'a part of the file this app does not know'}, has the character "${ch}" written as a symbol (Word's w:sym${font ? `, in the font "${font}"` : ''}) rather than as typed text, and nothing here can mask a character written that way, so a name or a number it belongs to could go out whole. In Word, delete that character and type it again, or copy the document's text into a new blank document; save, and drop that copy here.`);
    }
    texts.set(n, xml);
    for (const m of xml.matchAll(/_x0000_[a-z](\d+)/g)) vmlNext = Math.max(vmlNext, Number(m[1]));
    for (const m of xml.matchAll(/Redacted (font|theme|colour) (\d+)/gi)) identTaken.add(`${m[1].toLowerCase()} ${m[2]}`);
    // a neutral name the writer keeps as it stands: a pivot source only in the whole neutral
    // form, since "[Kestrel.xlsx]Fees!PivotTable1" is replaced and frees its number
    for (const m of xml.matchAll(/(?<![\p{L}\p{N}_])(?:Label|List|Name)[1-9]\d*(?![\p{L}\p{N}_])|(?<=\[Book1\.xlsx\]Sheet1!)PivotTable[1-9]\d*(?![\p{L}\p{N}_])/gu)) neutralTaken.add(m[0]);
  }
  const parsed = new Map<string, XNode[]>();
  // An unknown part with text in it: nothing masked it and no engine read it, so the table's
  // names are the least of what it can carry — a client's name no one listed ships as written.
  // Until 2026-09-23 such a part was kept whenever the table placed nothing in it.
  // It is read where the gate reads it, in its attributes as well as between its tags: an
  // add-in's <acme:note acme:client="Jonas Whitfield"/> was kept under a receipt that said the
  // part held no text anyone typed, and a name no row holds is one the gate cannot find (W3-C).
  // Code is what a part is allowed: numbers, dates, ids, a single code word in an attribute
  // ("note", "rId3", "en-US"); between tags a plain lower-case word is not code — "whitfield"
  // shipped as one — save XML's own true and false. A code word that carries one of the table's
  // names run together is not code: "kestrelAcquisition" and "margaretTan" were kept, and read by
  // the gate as code words, which it reads for a row only as the table writes it (W5-2).
  // What the writer renames wherever it stands is allowed too — a font's, a theme's or a colour's
  // name (renamed when it places), a bookmark, a chart's cell reference, a style Word defines —
  // but text Word shows a reader is typed wherever it stands: a signer's name, a watermark, a
  // trendline's name, help text, a style's name, a number format's literal. The writer masks
  // those in place by the table, and in a part no one reviewed a name the table lacks shipped
  // under a note that said the part held no text anyone typed (W4-F1, 2026-09-23).
  const tableNames = refNames(opts.mask);
  // A code word here is VOCAB's shape narrowed to what Word writes in it: a media type under a
  // registered top type and a language tag of language, script and region. VOCAB alone passed
  // "clients/Whitfield.Jonas" as a media type and "mr-Jonas-Smith" as a language tag, and both
  // were kept (W-FID-2, 2026-09-23). The gate keeps VOCAB whole: there it chooses how a value
  // is read, not whether the part may be kept.
  const vocabWord = (v: string) => VOCAB.test(v) && (v.includes('/') ? MEDIA_TYPE.test(v) : !v.includes('-') || LANG_TAG.test(v));
  const code = (v: string) => (MACHINE.test(v) || vocabWord(v)) && !refCarries(v, tableNames);
  const WORDY = /[\p{L}\p{N}]/u;
  // a built-in style by its name, or by its id, which is the name without its spaces
  const builtinStyle = (v: string) => BUILTIN_STYLE.test(v) || BUILTIN_STYLE.test(v.replace(/(?<=\p{Ll})(?=[\p{Lu}\p{N}])/gu, ' '));
  /** `how`: what ATTR_MASK or ELEM_MASK makes of the value, where it names it */
  const typedValue = (v: string, how: [Mode, string] | undefined, between: boolean): boolean => {
    if (!WORDY.test(v)) return false;
    // An address on the format's own hosts is judged by what schemaRest leaves of it, word by
    // word as a code word is: taken whole as an address, "http://purl.org/matters/Jonas
    // Whitfield" was kept under a note that said the part held only numbers, ids and code words
    // (D13R-1, 2026-09-23). The address of a namespace the format defines leaves nothing. Between
    // its tags each word is judged as a value between tags is: "http://purl.org/matters/marsh"
    // there was kept where "…/Marsh" held (R-between, owner ruling 12, 2026-09-24; measured
    // before it landed, no part of the 21 real files is held by it).
    const rest = schemaRest(v);
    if (rest !== null) return rest.split(/[█/:#?&=]+/u).some((seg) => WORDY.test(seg) && typedValue(seg, undefined, between));
    if (how?.[0] === 'ident') return false;
    if (how?.[1] === NUMBER_FORMAT) return formatRuns(v).some((r) => WORDY.test(r.text));
    if (how) return true;
    // between tags, words run together as a code word is ("jonasWhitfield") are typed as a plain
    // lower-case word is: that is how a name is keyed where no one expects it read (W-FID-2)
    return !(code(v) && !(between && /^[a-z]+(?:[A-Z][a-z]+)*$/.test(v))) && !/^(?:true|false)$/.test(v);
  };
  // A name in the part's markup is judged as the gate reads it (readOutput: qnameRead, nsDecl,
  // mcList): an element's or an attribute's name in a namespace the format defines, under a
  // prefix Office writes for it, is Word's word and left to the gate; any other prefix, name or
  // entry of a compatibility list is judged as a code word is. Until 2026-09-23 no name was
  // judged, and every attribute spelled mc:… was passed on its spelling whatever its prefix
  // stood for: <acme:JonasWhitfield/> and mc:client="Jonas Whitfield" (mc bound to an add-in's
  // namespace, or to the real one on an attribute that is not a list) were kept under a note
  // that said the part held only code (W-FID-1, W-FID-8). The cost: an add-in's part whose
  // markup names start with a capital (<acme:Client/>) holds, as a name there would; none of the
  // 21 real files keeps a part this writer does not know (they are dropped or known).
  // Left open, and stated on the receipt and in the note below: a name no one reviewed, under a
  // namespace Office's formats define (<w:JonasWhitfield/> in such a part), is kept whatever it
  // says; the gate reads it for the table's names and for the safety net. Judged as a code word,
  // Office's older PascalCase names (mc:AlternateContent, o:OLEObject) would hold too.
  // a name is judged piece by piece between its separators ("client_id", "note-ref")
  const nameCode = (w: string) => w.split(/[_.-]+/).every((x) => !x || code(x));
  const nsAt = (q: string, scope: Map<string, string>, elemUri?: string) => { const c = q.indexOf(':'); return c > 0 ? scope.get(q.slice(0, c)) : elemUri !== undefined ? elemUri : scope.get(''); };
  const markupTyped = (q: string, scope: Map<string, string>, elemUri?: string): boolean => {
    const c = q.indexOf(':');
    const p = c > 0 ? q.slice(0, c) : '';
    if (p === 'xml' || p === 'xmlns' || q === 'xmlns') return false;
    const uri = nsAt(q, scope, elemUri);
    const own = uri !== undefined ? KNOWN_NS.get(uri) : undefined;
    if (own) return !!p && !own.has(p) && !nameCode(p);
    return (!!p && !nameCode(p)) || !nameCode(q.slice(c + 1));
  };
  const listTyped = (v: string, scope: Map<string, string>) => v.split(/\s+/).some((tok) => {
    if (!tok) return false;
    const c = tok.indexOf(':');
    const p = c >= 0 ? tok.slice(0, c) : tok;
    const uri = scope.get(p);
    if (uri !== undefined && KNOWN_NS.get(uri)?.has(p)) return false;
    return tok.split(':').some((w) => w !== '*' && !nameCode(w));
  });
  const typed = (nodes: XNode[], parent = '', scope: Map<string, string> = new Map()): boolean => nodes.some((x) => {
    const t = tagOf(x);
    if (!t || t.startsWith('?')) return false;
    if (t === '#text') { const v = String(x['#text']).trim(); return !FORMULA_TAGS.has(parent) && typedValue(v, ELEM_MASK[parent], true); }
    const a: Record<string, string> = x[':@'] || {};
    let here = scope;
    for (const k in a) if (k === 'xmlns' || k.startsWith('xmlns:')) { if (here === scope) here = new Map(scope); here.set(k === 'xmlns' ? '' : k.slice(6), String(a[k])); }
    if (markupTyped(t, here)) return true;
    const elemUri = nsAt(t, here);
    for (const k in a) {
      const v = String(a[k]).trim();
      // a declaration's prefix is a name; its address the gate reads (nsDecl)
      if (k === 'xmlns' || k.startsWith('xmlns:')) { const p = k.slice(6); if (p && !KNOWN_NS.get(String(a[k]))?.has(p) && !nameCode(p)) return true; continue; }
      const ck = k.indexOf(':');
      if ((ck > 0 && here.get(k.slice(0, ck)) === MC_NS && MC_LISTS.has(k.slice(ck + 1))) || (k === 'Requires' && elemUri === MC_NS)) { if (listTyped(v, here)) return true; continue; }
      if (markupTyped(k, here, elemUri)) return true;
      // whoever wrote or reviewed, by whatever handle: a person, not code (W5R-5)
      if (v && /(^|:)(author|initials)$/.test(k)) return true;
      if (!v || refKind(t, k, parent)) continue;
      if (styleAttr(t, k, parent) ? WORDY.test(v) && !builtinStyle(v) && !code(v) : typedValue(v, ATTR_MASK[t]?.[k], false)) return true;
    }
    return typed(x[t], t, here);
  });
  // A number, too, where the body would mask it (owner ruling 2): each value unknownPartValues
  // gives is read by the whole mask as it reads the body, and a safety-net hit holds the part. A
  // table's name there holds at the gate, which names it.
  const numbers = unknownPartValues;
  /** what the safety net found, in the words a hold uses: it masks e-mail addresses as well as
   *  numbers, and a hold that said an add-in's contact="m.tan@kestrelcapital.com" was a number
   *  sent the lawyer looking for digits the value does not have (W-FID-ADDIN-EMAIL-MSG) */
  const floorWhat = (hs: Hit[]) => (hs.find((x) => x.floor)?.tag === '[email]' ? 'an e-mail address, which the safety net masks in the text' : 'a number the safety net masks in the text (a telephone, card, account or identity number)');
  const WAY_OUT = 'Such a part usually belongs to an add-in, or to an object inserted into the document. Open the file in Word and delete that object, or replace it with a picture of itself (copy it, then Paste Special > Picture), or copy the document\'s text into a new blank document; save, and drop that copy here.';
  /** each kept unknown part as it came in, for the note that says what was changed in it */
  const unknownAsRead = new Map<string, string>();
  for (const n of unknown) {
    const tree = walkPart(texts.get(n)!).tree;
    // its own name, as the package means it (pctDecoded), for a number the safety net masks;
    // for the table's names the gate reads it (owner ruling 3). Not judged as a code word: Office's
    // own parts are named with capitals (docMetadata/LabelInfo.xml), and one Office adds after
    // this writer was measured would hold every file that carries it.
    const own = pctDecoded(n);
    if (typed(tree)) return hold(`${n}, a part of the file this app does not know, holds text: nothing here masked it and no one reviewed it, so the copy cannot carry it. ${WAY_OUT}`);
    const { hits, divergence } = readAll(opts.mask, [...numbers(tree), ...(/\d/.test(own) ? [fold(netName(own))] : [])]);
    if (divergence) return hold(`the mask could not certify ${n}, a part of the file this app does not know: ${divergence}`);
    if (hits.some((h) => h.some((x) => x.floor))) return hold(`${n}, a part of the file this app does not know, holds ${floorWhat(hits.find((h) => h.some((x) => x.floor))!)}: nothing here masked it and no one reviewed it, so the copy cannot carry it. ${WAY_OUT}`);
    parsed.set(n, tree);
    unknownAsRead.set(n, texts.get(n)!);
  }
  // An add-in's own attribute in a part Word writes is read the same way (attrNet, owner ruling
  // 11): "<w:p acme:tel="61234567">" shipped from the body under a receipt that said numbers were
  // read (P23-3). Only a part that declares a namespace KNOWN_NS does not list can carry one, or
  // one that puts an attribute with no prefix on a w: element (nsOfName, W3-7), so only such a
  // part is parsed here; the gate reads every part, whatever prefix its elements are under.
  // The hold names the attribute, never the value: the reason is shown and logged, and must not
  // carry the number the copy exists to take out (law 47). The text of an add-in's own element
  // is read the same way (elemNet, W-LEAK-3), and so is a name the XML vocabularies close their
  // attributes to (attrNet, ATTR_OWN), which any part can carry.
  const NS_DECL = /\sxmlns(?::[\w.-]+)?\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const W_BARE = /<w:[\w.-]+\s(?:[^<>]*?\s)?(?!xmlns[\s=])[A-Za-z_][\w.-]*\s*=/;
  const CLOSED = /\s(?:xml:(?!(?:lang|space|base|id)\s*=)|xsi:(?!(?:type|nil|schemaLocation|noNamespaceSchemaLocation)\s*=)|xlink:(?!(?:href|type|role|arcrole|title|show|actuate|label|from|to)\s*=)|(?:dc|dcterms|dcmitype|cp|ep|vt):)[\w.-]+\s*=/;
  for (const [n, xml] of texts) {
    if (unknown.has(n) || (![...xml.matchAll(NS_DECL)].some((d) => !KNOWN_NS.has(d[1] ?? d[2])) && !W_BARE.test(xml) && !CLOSED.test(xml))) continue;
    const vals: string[] = [], where: string[] = [];
    const visit = (nodes: XNode[], scope: Map<string, string>) => {
      for (const x of nodes) {
        const t = tagOf(x);
        if (!t || t === '#text' || t.startsWith('?')) continue;
        const a: Record<string, string> = x[':@'] || {};
        let here = scope;
        for (const k in a) if (k === 'xmlns' || k.startsWith('xmlns:')) { if (here === scope) here = new Map(scope); here.set(k === 'xmlns' ? '' : k.slice(6), String(a[k])); }
        const elemUri = nsOfName(t, here);
        const put = (v: string, what: string) => {
          if (!v.trim() || GUID_VALUE.test(v.trim())) return;
          vals.push(fold(v)); where.push(what);
          const d = pctDecoded(v);
          if (d !== v) { vals.push(fold(d)); where.push(what); }
        };
        for (const k in a) {
          if (k === 'xmlns' || k.startsWith('xmlns:') || !attrNet(k, here, elemUri)) continue;
          put(String(a[k]), `the attribute ${t}@${k}`);
        }
        if (elemNet(t, here)) for (const y of x[t] as XNode[]) if (tagOf(y) === '#text') put(String(y['#text']), `the text of the element <${t}>`);
        visit(x[t], here);
      }
    };
    visit(walkPart(xml).tree, new Map());
    if (!vals.length) continue;
    const { hits, divergence } = readAll(opts.mask, vals);
    if (divergence) return hold(`the mask could not certify ${n}: ${divergence}`);
    const at = hits.findIndex((h) => h.some((x) => x.floor));
    if (at >= 0) return hold(`${n} holds, in a value an add-in wrote into it (${where[at]}), ${floorWhat(hits[at])}: nothing here masks a value of an add-in's, and no one reviewed it, so the copy cannot carry it. Open the file in Word and delete the object that value belongs to, or copy the document's text into a new blank document; save, and drop that copy here.`);
  }

  // 4. styles, before any part: a paragraph in a header and the style it names must land on
  //    the same new id
  for (const n of ['word/styles.xml', 'word/stylesWithEffects.xml']) if (texts.has(n)) parsed.set(n, walkPart(texts.get(n)!).tree);
  const scan = scanStyles(['word/styles.xml', 'word/stylesWithEffects.xml'].filter((n) => parsed.has(n)).map((n) => parsed.get(n)!), opts.mask, tableNames);
  if (scan.divergence) return hold(`the mask could not certify the style names: ${scan.divergence}`);
  report.removed.styles = scan.renamed;

  // 5. every kept part: structural pass, fields, flow, mask, rewrite. The body goes first,
  //    so its bookmarks are numbered in the order a reader meets them.
  const tagsUsed = new Set<string>();
  const shared: Shared = {
    renames: new Map(), marks: new Set(), lists: new Map(), labels: new Map(), sheets: new Map(), ranges: new Map(), pivots: new Map(), formulas: 0,
    vml: new Map(), vmlNext, idents: new Map(), identTaken, refsUnlinked: 0, linksUnlinked: 0, taken: neutralTaken, chartHeaders: 0, instructions: 0,
  };
  const memo = new Map<string, { out: string; tags: string[] }>();
  const outParts = new Map<string, Uint8Array>();
  // every value each written part carries, so a relationship to a picture or a link the part no
  // longer shows can go (5b)
  const values = new Map<string, Set<string>>();
  for (const n of ['word/document.xml', ...kept.filter((x) => x !== 'word/document.xml')]) {
    if (dropped.has(n) || /\.rels$/.test(n) || n === '[Content_Types].xml' || MEDIA_RE.test(n)) continue;
    const rule = textRule(n);
    const fresh = parsed.has(n) ? null : walkPart(texts.get(n)!, !!rule?.captureAll);
    const tree = parsed.get(n) ?? fresh!.tree;
    texts.delete(n);
    // the flow as the document of record has it, before anything is stripped (placeFlow): the
    // same text the store keeps for the body, with its offsets
    const record = rule && !rule.captureAll ? partFlow((fresh ? fresh.items : walkTree(tree)).filter((i) => i.rev !== 'del')) : null;
    const st: PartState = { part: n, keepImages, droppedIds: droppedIds.get(n) || new Set(), removed: report.removed, warnings: report.warnings, mask: opts.mask, names: tableNames, shared, styles: scan.map, memo, tags: new Set(), written: 0, held: null };
    const edited = structural(tree, st);
    if (st.held) return hold(st.held);
    const kind = rule ? rule.kind : unknown.has(n) ? 'other' : 'layout';
    const ch = (report.channels[kind] = report.channels[kind] || { parts: 0, items: 0, masked: 0, chars: 0, tags: [] });
    ch.parts++;
    let masked = 0;
    const written = new Set<string>();
    if (rule) {
      if (n === 'docProps/core.xml' || n === 'docProps/app.xml') {
        const rootTag = n.endsWith('core.xml') ? 'cp:coreProperties' : 'Properties';
        const root = edited.find((x) => rootTag in x);
        if (root) {
          const before = (root[rootTag] as XNode[]).length;
          root[rootTag] = (root[rootTag] as XNode[]).filter((c) => {
            const t = tagOf(c);
            if (!t || t === '#text') return false;
            return n.endsWith('core.xml') ? CORE_KEEP.has(t) : APP_KEEP.has(t);
          });
          report.removed.properties += before - (root[rootTag] as XNode[]).length;
        }
      }
      fieldPass(edited, st);
      const items = walkTree(edited, !!rule.captureAll);
      if (!rule.captureAll && record) {
        const layout = partFlow(items);
        ch.items += layout.spans.length;
        ch.chars += layout.text.length;
        // each run that ships, at its offsets in the record: the structural pass and the field
        // pass keep the text nodes they keep, so a run is found by its node. One not found, or
        // found out of order, is a run the writer cannot place a name over, and holds the part.
        const at = new Map<unknown, { s: number; e: number }>();
        for (const sp of record.spans) at.set(sp.item.node, sp);
        const pieces: Array<{ s: number; e: number; item: WalkItem }> = [];
        for (const sp of layout.spans) {
          const r = at.get(sp.item.node);
          if (!r || (pieces.length && r.s < pieces[pieces.length - 1].e) || record.text.slice(r.s, r.e) !== sp.item.text) return hold(`the writer could not find a run of ${n} in the text of record, so it cannot say what the table masks in it`);
          pieces.push({ s: r.s, e: r.e, item: sp.item });
        }
        // the FOLDED record is what is masked and compared; the runs keep their raw text
        // everywhere a tag does not land (see the fold note at the head of this file)
        const flow = fold(record.text);
        report.flows.push({ part: n, kind: rule.kind, record: flow, pieces: pieces.map((p) => ({ s: p.s, e: p.e, pre: p.item.pre, para: p.item.para })) });
        if (flow.trim()) {
          const placed = placeFlow(flow, pieces, opts.mask, written);
          if (placed.held) return hold(`${n}: ${placed.held}`);
          for (const t of placed.tags) tagsUsed.add(t);
          masked += placed.runs;
          if (placed.spacing) report.warnings.push(`${n}: ${placed.spacing} placement(s) covered spacing only — nothing to write`);
        }
        maskMath(items, st, tagsUsed);
        if (st.held) return hold(st.held);
        // chart numeric values: each checked as the number it is; one that places is
        // replaced by 0 (a tag cannot live inside a double) and said so in the receipt
        const zeroed: string[] = [];
        for (const i of items) {
          if (!i.num || i.attr) continue;
          ch.items++;
          const form = numericForm(fold(i.text));
          const m = opts.mask(form);
          if (m.divergence) return hold(`the mask could not certify a chart value in ${n}: ${m.divergence}`);
          const ivs = mergedIntervals(m);
          if (!ivs.length) continue;
          for (const iv of ivs) tagsUsed.add(iv.tag);
          zeroed.push(`${form} → ${ivs.map((iv) => iv.tag).join('')}`);
          i.node['#text'] = '0';
          i.text = '0';
          report.removed.chartValuesZeroed++;
          masked++;
        }
        if (zeroed.length) report.warnings.push(`${n}: ${zeroed.length} chart value(s) replaced by 0 — ${zeroed.slice(0, 3).join(', ')}${zeroed.length > 3 ? ` (+${zeroed.length - 3} more)` : ''}`);
      } else {
        ch.items += items.length;
      }
    }
    masked += st.written;
    for (const t of st.tags) { written.add(t); tagsUsed.add(t); }
    ch.masked += masked;
    ch.tags = [...new Set([...ch.tags, ...written])];
    {
      const vs = new Set<string>();
      const collect = (nodes: XNode[]) => { for (const x of nodes) { const t = tagOf(x); if (!t || t === '#text') continue; for (const v of Object.values(x[':@'] || {})) vs.add(String(v)); collect(x[t]); } };
      collect(edited);
      values.set(n, vs);
    }
    // well-formedness is the gate's to check, on the bytes that ship
    outParts.set(n, built(edited, shared));
    report.parts.written.push(n);
  }

  // 5b. relationships out, and the pictures they point at. With pictures kept, a picture the
  //     page no longer shows — in a tracked deletion, a hidden run, a removed field or an
  //     object's preview — went with its drawing but not with the file until 2026-09-23: its
  //     relationship stayed, so the image shipped inside the package, where anyone who unzips
  //     the copy can see it. A relationship to a picture no kept element names goes, and a
  //     picture no relationship points at goes too.
  //     A link is the same: a hyperlink the writer unwrapped left its relationship behind, and an
  //     internal one ("#KestrelSchedule", no TargetMode) shipped the bookmark's old name in the
  //     file's links while every bookmark was renamed (W3-E, 2026-09-23). A link's relationship
  //     no kept element names goes; one still named (a shape's click-link) points at the
  //     bookmark's new name.
  const referenced = new Set<string>();
  const relState = { shared, removed: report.removed } as PartState;
  for (const [, r] of relsTrees) {
    const used = values.get(r.owner);
    if (used) r.root['Relationships'] = (r.root['Relationships'] as XNode[]).filter((x) => !('Relationship' in x) || !/\/(image|hyperlink)$/.test(String((x[':@'] || {}).Type || '')) || used.has(String((x[':@'] || {}).Id)));
    for (const x of r.root['Relationships'] as XNode[]) {
      if (!('Relationship' in x)) continue;
      const a = x[':@'] || {};
      if (a.TargetMode !== 'External' && String(a.Target || '').startsWith('#')) { a.Target = `#${renameRef(String(a.Target).slice(1), relState)}`; continue; }
      referenced.add(normalizePath(r.base, String(a.Target || '')));
    }
  }
  for (const n of kept) {
    if (!MEDIA_RE.test(n) || dropped.has(n)) continue;
    if (!referenced.has(n)) { dropped.add(n); continue; }
    const data = (await zip.read(n))!;
    // A picture that is XML (an SVG) is copied byte for byte but for its processing
    // instructions: <?xml-stylesheet href="…"?> names a file, and the gate holds on any it
    // finds as the app's own fault — which a kept SVG carrying one was, with nothing wrong in
    // the file (INT-23, W6-5, 2026-09-23). Removed as built() removes them, and counted;
    // CDATA is stepped over, so nothing inside it is taken for one. What the parser never hands
    // the gate goes too: a comment (<!-- drawn for Margaret Tan -->), a document type
    // declaration with nothing declared in it, and what the XML declaration carries past its
    // version, encoding and standalone (declExtra) — each shipped unread (W5R-9, 2026-09-23). A
    // document type that declares entities holds: the picture may use them, and removed they
    // leave it broken, while kept the gate never reads what they say.
    if (isXml(n, types)) {
      const xml = td.decode(data);
      if (/<!DOCTYPE[^>[]*\[/i.test(xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, ''))) return hold(`${n}, a picture drawn as code (an SVG), declares entities of its own, which this app does not read, so the copy cannot carry it. In Word, right-click the picture, choose Save as Picture and save it as a PNG, then Change Picture to that file; save, and drop that copy here.`);
      const out = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\?([\s\S]*?)\?>/gi, (m, pi: string | undefined, at: number) => {
        if (m.startsWith('<![CDATA[')) return m;
        if (pi === undefined) { shared.comments = (shared.comments ?? 0) + 1; return ''; }
        if (at === 0 && /^xml\s/.test(pi)) {
          const node: XNode = { '?xml': [], ':@': Object.fromEntries([...pi.slice(3).matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => [a[1], a[2] ?? a[3]])) };
          const a = node[':@'] as Record<string, string>;
          // written as what the copy is, as built() writes it
          const recoded = a.encoding != null && !DECL.encoding.test(a.encoding) && (READ_UTF8.test(a.encoding) || ASCII_SAME.test(a.encoding));
          if (recoded) a.encoding = 'UTF-8';
          const extra = declExtra(node);
          if (!extra.length && !recoded) return m;
          if (extra.length) shared.declared = (shared.declared ?? 0) + 1;
          // XML requires the version; Word writes 1.0
          if (!('version' in a) || extra.includes('version')) a.version = '1.0';
          return `<?xml${['version', 'encoding', 'standalone'].filter((k) => k === 'version' || (k in a && !extra.includes(k))).map((k) => ` ${k}="${a[k]}"`).join('')}?>`;
        }
        shared.instructions++;
        return '';
      });
      outParts.set(n, out === xml ? data : te.encode(out));
    } else outParts.set(n, data);
    report.parts.copied.push(n);
  }
  for (const [n, r] of relsTrees) if (!dropped.has(n)) outParts.set(n, built(r.tree, shared));

  // 6. content types: overrides of dropped parts go; the main part is a plain document
  ctRoot['Types'] = (ctRoot['Types'] as XNode[]).filter((c) => {
    if (!('Override' in c)) return true;
    const a = c[':@'] || {};
    const part = String(a.PartName || '').replace(/^\//, '');
    if (dropped.has(part)) return false;
    if (MAIN_TYPES.has(String(a.ContentType))) a.ContentType = DOCUMENT_MAIN;
    return true;
  });
  outParts.set('[Content_Types].xml', built(ctTree, shared));
  report.parts.dropped = names.filter((n) => dropped.has(n));

  // 7. the package, [Content_Types].xml first, then everything in the original order
  const order = ['[Content_Types].xml', ...names.filter((n) => n !== '[Content_Types].xml' && outParts.has(n))];
  const bytes = await writeZip(order.map((n) => ({ name: n, data: outParts.get(n)! })));

  // 8. the gate: the OUTPUT read again, every part of it — nothing may place
  await readOutput(bytes, opts.mask, tableNames, tagsUsed, keepImages, report.gate, new Map(report.flows.map((f) => [f.part, f])));
  const leaks = report.gate.leaks;
  if (leaks.length) return hold(heldMessage(leaks));

  // what the receipt states: each kind of part removed whole, each renaming, each part kept
  // that the writer does not know
  const plural = (k: number, one: string, many: string) => (k === 1 ? one : many);
  report.notes.push(...DROP_KINDS.filter((d) => dropNotes.has(d.note)).map((d) => (d.re.test('word/embeddings/') ? embedNote(embedOwners) : d.note)));
  // the names a note gives are the ones the copy carries: a copy redacted before keeps its
  // Label1, so a new label is Label2, and a link to a missing bookmark can take bm1 first
  const listed = (to: string[]) => (to.length > 3 ? `${to.slice(0, 2).join(', ')} …` : to.length > 1 ? `${to.slice(0, -1).join(', ')} and ${to[to.length - 1]}` : to[0]);
  const k = shared.marks.size;
  if (k) report.notes.push(`${plural(k, 'The bookmark', `All ${k} bookmarks`)} the author made ${plural(k, 'was', 'were')} renamed ${listed([...shared.marks].map((m) => shared.renames.get(m)!))}, whatever ${plural(k, 'it was', 'they were')} called; the links, page references and contents entries the copy keeps point at the new ${plural(k, 'name', 'names')}.`);
  const r = shared.refsUnlinked;
  if (r) report.notes.push(`${plural(r, 'A cross-reference', `${r} cross-references`)} (a REF field) ${plural(r, 'was', 'were')} written out as the text ${plural(r, 'it', 'they')} showed, and will not update in the copy.`);
  // a link inside the document written as a field ({ HYPERLINK \l "Schedule_2" }) is unlinked
  // like any field the writer does not keep: the note above does not cover it, and until
  // 2026-09-23 it said every internal link still pointed at its bookmark (W3-H)
  const u = shared.linksUnlinked;
  if (u) report.notes.push(`${plural(u, 'A link to a place in the document', `${u} links to places in the document`)} (a HYPERLINK field) ${plural(u, 'was', 'were')} written out as the text ${plural(u, 'it', 'they')} showed, and will not jump there in the copy.`);
  const quoted = (xs: string[]) => listed(xs.map((x) => `"${x}"`));
  const sg = scan.given.length;
  if (sg) report.notes.push(`${sg === 1 ? 'A style whose' : `${sg} styles whose`} name carried something masked ${sg === 1 ? 'was' : 'were'} renamed ${quoted(scan.given)}; the text keeps ${sg === 1 ? 'its' : 'their'} formatting.`);
  if (scan.idOnly) report.notes.push(`${plural(scan.idOnly, 'A style of Word\'s own whose id', `${scan.idOnly} styles of Word's own whose ids`)} (the name the file's code gives ${plural(scan.idOnly, 'it', 'them')}, which Word does not show) carried something masked ${plural(scan.idOnly, 'was', 'were')} given a new id; ${plural(scan.idOnly, 'its name is', 'their names are')} Word's and unchanged, and the text keeps ${plural(scan.idOnly, 'its', 'their')} formatting.`);
  const l = shared.lists.size;
  if (l) report.notes.push(`${plural(l, 'A list definition\'s name', `${l} list definitions' names`)}, which Word never shows, ${plural(l, 'was', 'were')} renamed ${listed([...shared.lists.values()])}, whatever ${plural(l, 'it was', 'they were')}; the numbering on the page is unchanged.`);
  const c = shared.labels.size;
  if (c) report.notes.push(`${plural(c, 'A caption label', `${c} caption labels`)} (the word a caption is numbered by, such as "Exhibit") ${plural(c, 'was', 'were')} renamed ${listed([...shared.labels.values()])} in the fields that count ${plural(c, 'it', 'them')}, whatever ${plural(c, 'it was', 'they were')}; the captions on the page are unchanged.`);
  // the names as given: a file that already carries "Redacted font 1" gets "Redacted font 2"
  const nouns = new Map<string, string[]>();
  for (const [key, to] of shared.idents) if (to) { const noun = key.split('\u0000')[0]; nouns.set(noun, [...(nouns.get(noun) ?? []), to]); }
  for (const [noun, given] of nouns) {
    const n = given.length;
    given.sort((a, b) => Number(/\d+$/.exec(a)![0]) - Number(/\d+$/.exec(b)![0]));
    report.notes.push(`${plural(n, `A ${noun} name`, `${n} ${noun} names`)} that carried something masked ${plural(n, 'was', 'were')} renamed ${quoted(given)}${noun === 'font' ? '; where the recipient has no font of that name, Word shows a substitute' : noun === 'colour' ? '; the colours are unchanged' : '; the look of the document is unchanged'}.`);
  }
  const pi = shared.instructions;
  if (pi) report.notes.push(`${plural(pi, 'A processing instruction', `${pi} processing instructions`)} (a note a program leaves in the file's code for itself, which Word neither shows nor uses) ${plural(pi, 'was', 'were')} removed.`);
  const cm = shared.comments ?? 0;
  if (cm) report.notes.push(`${plural(cm, 'A note', `${cm} notes`)} in the code of a picture drawn as code (an SVG) — a comment, or a document type declaration that declared nothing — which no one sees, ${plural(cm, 'was', 'were')} removed.`);
  const dx = shared.declared ?? 0;
  if (dx) report.notes.push(`${plural(dx, 'The first line of a part', `The first line of ${dx} parts`)} (the XML declaration, which says only which version of XML and which encoding the part uses) carried more than that, which was removed.`);
  const h = shared.chartHeaders;
  if (h) report.notes.push(`${plural(h, 'A chart\'s print header and footer', `${h} charts' print headers and footers`)}, which Excel prints only when it prints the chart on its own page and Word never shows, were removed.`);
  if (shared.formulas) {
    const what = [
      shared.sheets.size ? `its sheets ${listed([...shared.sheets.values()])}` : '',
      shared.ranges.size ? `its named ranges ${listed([...shared.ranges.values()])}` : '',
      shared.pivots.size ? `its pivot tables ${listed([...shared.pivots.values()].map((p) => p.slice(p.indexOf('!') + 1)))}` : '',
    ].filter(Boolean);
    report.notes.push(what.length
      ? `The charts' cell references now call the workbook ${what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what[what.length - 1]}` : what[0]}, whatever they were called: the workbook they pointed into was removed with the embedded files, and its names are text no one reviewed.`
      : 'The charts\' cell references had the text quoted in them removed: the workbook they pointed into was removed with the embedded files, and that text is text no one reviewed.');
  }
  // What the note says was kept is measured, not assumed: the part as it came in (built by the
  // same builder, so only the writer's edits differ) against the part as it ships. Until
  // 2026-09-23 it counted the tags the structural pass wrote and said "masked", and a font
  // renamed in the part was not counted at all. The note says what kinds of value are there,
  // never that nothing in the part was typed: a number kept as written can be one someone typed
  // that the safety net does not know (a matter number), and the note travels to the recipient
  // on the receipt. The receipt prints it word for word (INT-6), so what it says the check reads
  // is what readOutput reads in such a part: every value and every name in its markup, Office's
  // names included (W5R-2), and the part's own name decoded (W5R-1), by checkRef 'all' and by
  // the safety net as written and as netName reads a name (W5R-6); and what it says the part
  // holds is what the pre-check allowed, its markup's names included (W-FID-8). Its words are
  // plain ones: "a code word that starts with a capital" put the word of a row "Kestrel Capital"
  // on a receipt that must carry none (protected-terms 18g).
  // The parser hands the builder no comment and no document type declaration, so a part rebuilt
  // from its tree loses both, and valuesChanged, which compares two built trees, cannot see it:
  // "<!-- drawn for Margaret Tan -->" left a part the note said was kept "as it was"
  // (SEAM-UNKNOWN-PART-COMMENT). They are counted as written, a CDATA section's text and a
  // processing instruction's aside; a processing instruction removed has its own note above, and
  // the part is then not "as it was" either.
  const CODE_TOKEN = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>/gi;
  const instructionsIn = (x: string) => (x.match(CODE_TOKEN) ?? []).filter((t) => t.startsWith('<?') && !/^<\?xml\s/i.test(t)).length;
  for (const [n, xml] of unknownAsRead) {
    const out = outParts.get(n);
    if (!out) continue;
    const outXml = td.decode(out);
    const m = valuesChanged(walkPart(td.decode(built(walkPart(xml).tree, { instructions: 0 }))).tree, walkPart(outXml).tree);
    const notes = (xml.match(CODE_TOKEN) ?? []).filter((t) => t.startsWith('<!--') || /^<!DOCTYPE/i.test(t)).length;
    const code = notes + Math.max(0, instructionsIn(xml) - instructionsIn(outXml));
    const kept = m === 0 ? (code ? ', every value in it as it was' : ' as it was')
      : m > 0 ? `, with ${plural(m, 'one of them', `${m} of them`)} renamed as the writer renames ${plural(m, 'it', 'them')} wherever ${plural(m, 'it stands', 'they stand')}`
        : ', with what the writer changes wherever it stands changed in it too';
    const removed = notes ? ` ${plural(notes, 'A note', `${notes} notes`)} in its code — a comment, or a document type declaration — which no one sees, ${plural(notes, 'was', 'were')} removed.` : '';
    report.notes.push(`${n} is a part this writer does not know. Between its tags and in its attributes are only numbers, dates, ids, single code words, names Word looks up (a font, a theme, a colour, a style, a number format whose only printed characters are symbols) and addresses on the hosts Office's file formats use with only code words after the host, besides the namespaces it declares, and the names in its code outside the namespaces Office's file formats define are code words too, so it was kept${kept}.${removed} The check of the copy read its text, its attribute values, the names of its elements and attributes but XML's own, the namespaces it declares or lists but those Office's file formats define, and its own name, for the names your table masks and for what the safety net masks. In each of these it finds a name of your table of two characters or more with a letter in it, or of six digits or more, run together with other characters where the word breaks at both ends of the name — at a space, a punctuation mark or another symbol, where letters meet digits, where a capital follows a small letter, either side of the last of a run of capitals that a small letter follows (as "XYZReport" breaks after "XYZ"; "ISPs" breaks only before its s), and either side of a Chinese, Japanese or Korean character; a word all in capitals or all in small letters has no break inside it — and anywhere inside a word from ${RUN_FLOOR} letters and digits, so a shorter name inside a word is not found; a name of two to five digits alone is found only where it is the whole of a value.`);
  }
  report.bytes = bytes;
  return report;
}
