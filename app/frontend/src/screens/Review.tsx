import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entity, QFile } from '../lib/store';
import { remask, spanMatches, protectedMatches, placeSpans, occurrencesOutside, wordContains, isFloorRow, FLOOR_WORD, type Claim, type FloorHit } from '../lib/engine';
import { engineIdentity } from '../lib/engineStatus';
import { reviewTally, tallyLine, TALLY_TITLE, FINISH_LABEL, finishTitle, decideRows, restoreRows, withdrawRow, widenRow, unwidenRow, mintHandKey, liveSuspects, modelJudged, withMaskedPieces, rowIn, headLine, type RowFilter, type Widened } from '../lib/review';
import { exportOf, finishHold } from '../lib/attest';
import { loadPractice } from '../lib/practice';
import { loadProtectedTerms } from '../lib/protected';
import { CAT_LABEL, CAT_ORDER, CAT_VAR, SP_CLASS, TAG_PREFIX } from '../lib/categories';
import type { DocxItem } from '../lib/extract/docx';
import { sideRowsOf, sideUnreadHead, andList } from '../lib/side';

/** [Person1] / [PERSON-1] → "Person 1" for human eyes; the stored tag never changes. */
export const fmtTag = (tag: string) => tag.replace(/^\[|\]$/g, '').replace(/^([A-Za-z]+)-?(\d+)$/, '$1 $2');

/** "Needs a look" is now a live verdict, not a permanent stain: pending rows
 *  carry the amber dash until a human confirms/ignores them, then it clears. */
export const needsLook = (e: Entity) => e.status === 'pending';

/** Why is this row pending? Mechanism-honest reasons only. */
export function pendingReason(e: Entity, all: Entity[]): string {
  if (e.junk) return 'looks like standard boilerplate — probably fine to leave readable';
  if (all.some((o) => o.key !== e.key && o.tag === e.tag && o.text.toLowerCase().includes(e.text.toLowerCase()) && !o.text.includes(e.text)))
    return 'case mismatch with a confirmed name';
  if (e.prov === 'second sweep') return 'found only on the second read — the wide sweep missed it';
  // never credit a running engine for a decision it wasn't part of
  return 'needs your decision';
}

// category labels, colours and tag prefixes live in lib/categories.ts — one vocabulary for every screen
// Status filters (guided-review model): what matters is what's DECIDED, not
// which subsystem found it — provenance lives in each row's tooltip. "Redacted" and
// "Readable" are labelled by what the rows DO in the export, not by who settled them, and
// count the way the header does (lib/review.ts rowIn): a pending name is masked while it
// waits, so it sits under both "Needs review" and "Redacted". Filtering it out of
// "Redacted" said it was readable.
const STATUS_FILTERS: ReadonlyArray<readonly [RowFilter, string]> = [['all', 'Show all'], ['pending', 'Needs review'], ['masked', 'Redacted'], ['readable', 'Readable']];
const statusOf = (e: Entity): 'pending' | 'confirmed' | 'ignored' =>
  e.status === 'pending' ? 'pending' : e.dead ? 'ignored' : 'confirmed';
const ADD_CATS = [['person', 'Person'], ['org', 'Company'], ['loc', 'Place'], ['id', 'ID / number'], ['contact', 'Phone / email']] as const;

/** what a forensic row IS: the channel it came from plus the mark on the run — never a
 *  made-up kind. The walker's kind is the part; `rev`/`hidden` are flags on the run. */
const forensicWord = (i: DocxItem) => {
  const where = i.kind === 'body' ? '' : ` in ${i.kind}`;
  if (i.hidden) return `hidden text${where}`;
  if (i.rev === 'del') return `tracked deletion${where}`;
  if (i.rev === 'ins') return `tracked insertion${where}`;
  return i.kind;
};
/** rows shown before the fold in the rail's forensic lists — the rest stay reachable */
const SHOW_FIRST = 12;

interface Props {
  file: QFile | null;
  onUpdate: (id: string, fn: (e: Entity[]) => Entity[]) => void;
  onContinue: () => void;
  onBack?: () => void;
  onToast: (msg: string, undo?: () => void) => void;
  onUndo: () => void;
}

interface Ghost { text: string; verdict: string; occ: number }

function PaperWithSpans({ text, entities, ghosts = [], claims, floorHits, selKey, onPick, onGhost, onDragEdge, preview }: {
  text: string; entities: Entity[]; ghosts?: Ghost[];
  /** the export's own claims over this text (Remask.claims) and its safety-net matches
   *  (Remask.floorHits): each character is drawn under the row whose tag the export writes over
   *  it — a stretch the placement below gives to no row, to a row left readable, or to another
   *  row, as a piece of the row that masks it (withMaskedPieces) */
  claims?: Claim[];
  floorHits?: FloorHit[];
  selKey: string | null;
  onPick: (k: string) => void; onGhost?: (g: Ghost, ev: React.MouseEvent) => void;
  /** grab a highlight's left/right edge to extend the redaction by hand */
  onDragEdge?: (e: Entity, side: 'l' | 'r', start: number, end: number, ev: React.PointerEvent) => void;
  /** live range being dragged, drawn over whatever else is there */
  preview?: { start: number; end: number } | null;
}) {
  // the SAME placement the export mask uses, offset-annotated: what is
  // highlighted is what gets replaced, and every part knows where it sits
  const nodes = useMemo(() => withMaskedPieces(text, placeSpans(text, entities, ghosts), claims, entities, floorHits), [text, entities, ghosts, claims, floorHits]);
  const shown = useMemo(() => {
    if (!preview) return nodes.map((p) => ({ ...p, pv: false }));
    const out: Array<(typeof nodes)[number] & { pv: boolean }> = [];
    for (const p of nodes) {
      const s = Math.max(p.start, preview.start), e = Math.min(p.end, preview.end);
      if (s >= e) { out.push({ ...p, pv: false }); continue; }
      if (s > p.start) out.push({ ...p, t: text.slice(p.start, s), end: s, pv: false });
      out.push({ ...p, t: text.slice(s, e), start: s, end: e, pv: true });
      if (e < p.end) out.push({ ...p, t: text.slice(e, p.end), start: e, pv: false });
    }
    return out;
  }, [nodes, preview, text]);

  return (
    <div className="doc" style={{ whiteSpace: 'pre-wrap' }}>
      {shown.map((p, i) => p.e ? (
        <span key={i} data-o={p.start} className={`sp ${SP_CLASS[p.e.cat]}${p.pv ? ' sp-pv' : ''}`}
          data-hot={p.e.key === selKey || undefined} data-dead={p.e.dead || undefined}
          data-unsure={(!p.e.dead && needsLook(p.e)) || undefined}
          data-ext={onDragEdge && !p.e.dead && !isFloorRow(p.e) ? '' : undefined}
          title={isFloorRow(p.e)
            ? `${p.e.tag} — ${FLOOR_WORD[p.e.tag] ?? 'safety-net'} pattern${p.e.dead ? ', switched off for this text' : ''}`
            : needsLook(p.e) ? `${fmtTag(p.e.tag)} — worth a look: ${p.e.junk ? 'flagged as possible boilerplate' : 'only caught on the second read'}` : fmtTag(p.e.tag)}
          onClick={() => onPick(p.e!.key)}>
          {/* a safety-net row is a pattern match, not a span you can widen — no handles. A part
              the export cuts (another row's claim or a safety-net match inside it) keeps a
              handle only at its own outer edge, and a drag widens the WHOLE part: the new row
              text is doc.slice(start, end), so a piece's own offsets would shrink the row. */}
          {onDragEdge && !p.e.dead && !isFloorRow(p.e) && (!p.span || p.start === p.span[0]) && (
            <i className="sph sph-l" title="Drag to take in the words before this"
              onClick={(ev) => ev.stopPropagation()}
              onPointerDown={(ev) => onDragEdge(p.e!, 'l', p.span?.[0] ?? p.start, p.span?.[1] ?? p.end, ev)} />
          )}
          {p.t}
          {onDragEdge && !p.e.dead && !isFloorRow(p.e) && (!p.span || p.end === p.span[1]) && (
            <i className="sph sph-r" title="Drag to take in the words after this"
              onClick={(ev) => ev.stopPropagation()}
              onPointerDown={(ev) => onDragEdge(p.e!, 'r', p.span?.[0] ?? p.start, p.span?.[1] ?? p.end, ev)} />
          )}
        </span>
      ) : p.pc ? (
        // words the export masks under a row other than the one drawn here, or under none: the
        // rest of a shorter name beside a longer one, the first two words of a name, a kept
        // row's words inside another row's claim, or a safety-net match under a row left
        // readable. Its row, not a handle: click opens the row that decides them.
        <span key={i} data-o={p.start} data-piece="" className={`sp ${SP_CLASS[p.pc.row?.cat ?? (!p.pc.floor ? 'term' : p.pc.tag === '[email]' || p.pc.tag === '[phone]' ? 'contact' : 'id')]}${p.pv ? ' sp-pv' : ''}`}
          data-hot={(p.pc.row && p.pc.row.key === selKey) || undefined}
          title={p.pc.floor
            ? `${p.pc.tag} — masked in the export by the ${FLOOR_WORD[p.pc.tag] ?? 'safety-net'} pattern${p.pc.row ? '; open that row to change it' : ''}`
            : p.pc.row
              ? `${fmtTag(p.pc.row.tag)} — masked in the export as part of “${p.pc.row.text}”; open that row to change it`
              : 'Masked in the export under a row this table no longer lists'}
          onClick={() => p.pc!.row && onPick(p.pc!.row.key)}>{p.t}</span>
      ) : p.g ? (
        <span key={i} data-o={p.start} className={`sp sp-ghost${p.pv ? ' sp-pv' : ''}`}
          title={modelJudged(p.g) ? `Model looked at this and said “${p.g.verdict}” — click to redact it anyway` : 'The model gave this no class, so nothing was decided about it — click to redact it'}
          onClick={(ev) => onGhost?.(p.g!, ev)}>{p.t}</span>
      ) : <span key={i} data-o={p.start} className={p.pv ? 'sp-pv' : undefined}>{p.t}</span>)}
    </div>
  );
}

/** document offset under the pointer, via the caret API + the data-o anchors */
function offsetFromPoint(x: number, y: number): number | null {
  const d = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null, off = 0;
  if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
  else if (d.caretPositionFromPoint) { const r = d.caretPositionFromPoint(x, y); if (r) { node = r.offsetNode; off = r.offset; } }
  if (!node) return null;
  const el = node.nodeType === 3 ? (node as Text).parentElement : (node as HTMLElement);
  const host = el?.closest('[data-o]') as HTMLElement | null;
  if (!host) return null;
  const base = Number(host.dataset.o);
  if (!Number.isFinite(base)) return null;
  if (node.nodeType !== 3) return base;
  // sum the text-node lengths inside host that precede the caret's node
  let acc = 0, found = false;
  const walk = (n: Node): void => {
    if (found) return;
    if (n === node) { acc += off; found = true; return; }
    if (n.nodeType === 3) { acc += (n as Text).length; return; }
    for (const c of Array.from(n.childNodes)) { walk(c); if (found) return; }
  };
  walk(host);
  return base + acc;
}

/** snap outward to whole words — a redaction never ends mid-word */
const rightEdgeAt = (doc: string, i: number) => {
  let j = Math.min(Math.max(i, 0), doc.length);
  while (j < doc.length && /\S/.test(doc[j])) j++;
  while (j > 0 && /\s/.test(doc[j - 1])) j--;
  return j;
};
const leftEdgeAt = (doc: string, i: number) => {
  let j = Math.min(Math.max(i, 0), doc.length);
  while (j > 0 && /\S/.test(doc[j - 1])) j--;
  while (j < doc.length && /\s/.test(doc[j])) j++;
  return j;
};

/** The right pane of the split: the document as it would export RIGHT NOW —
 *  kept entities as tag chips, discarded ones back to plain text. */
function RedactedPaper({ red, entities, floorHits, selKey, onPick }: { red: string; entities: Entity[]; floorHits: FloorHit[]; selKey: string | null; onPick: (k: string) => void }) {
  const byTag = useMemo(() => {
    const m = new Map<string, Entity>();
    for (const e of entities) if (!e.dead && !isFloorRow(e) && !m.has(e.tag)) m.set(e.tag, e);
    return m;
  }, [entities]);
  // The n-th [phone] in the export is the n-th non-exempt phone hit: one floor rule per
  // tag, matches in text order — so a safety-net chip can point at its own row.
  const floorRowAt = useMemo(() => {
    const rows = new Map<string, Entity>();
    for (const e of entities) if (isFloorRow(e)) rows.set(e.text.trim().toLowerCase(), e);
    const perTag = new Map<string, Array<Entity | null>>();
    for (const h of floorHits) {
      if (h.exempt) continue;
      const list = perTag.get(h.tag) ?? [];
      list.push(rows.get(h.text.trim().toLowerCase()) ?? null);
      perTag.set(h.tag, list);
    }
    return perTag;
  }, [entities, floorHits]);
  const parts = useMemo(() => red.split(/(\[[A-Za-z]+-?\d+\]|\[(?:email|nric|card|phone|number)\])/g), [red]);
  const nth: Record<string, number> = {};
  return (
    <div className="doc" style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((p, i) => {
        const e = byTag.get(p);
        if (e) {
          return <span key={i} className={`tagpiece ${SP_CLASS[e.cat]}`} data-hot={e.key === selKey || undefined}
            style={e.key === selKey ? { outline: '1.5px solid var(--red)' } : undefined}
            onClick={() => onPick(e.key)} role="button" title={e.text}>{fmtTag(p)}</span>;
        }
        if (/^\[(?:email|nric|card|phone|number)\]$/.test(p)) {
          const n = (nth[p] = (nth[p] ?? 0) + 1);
          const fe = floorRowAt.get(p)?.[n - 1] ?? null;
          return <span key={i} className={`tagpiece ${fe ? SP_CLASS[fe.cat] : 'sp-id'}`} data-hot={(fe && fe.key === selKey) || undefined}
            style={fe && fe.key === selKey ? { outline: '1.5px solid var(--red)' } : undefined}
            onClick={fe ? () => onPick(fe.key) : undefined} role={fe ? 'button' : undefined}
            title={`${fe ? `${fe.text} — ` : ''}${FLOOR_WORD[p] ?? 'safety-net'}, masked by the safety-net pattern`}>{p.replace(/[[\]]/g, '')}</span>;
        }
        return <span key={i}>{p}</span>;
      })}
    </div>
  );
}

export default function Review({ file, onUpdate, onContinue, onBack, onToast, onUndo }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const [prov, setProv] = useState<RowFilter>('all');
  const [pick, setPick] = useState<{ text: string; x: number; y: number; occ: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  // below ~1200px the split panes crush to unreadable columns — default single
  const [view, setView] = useState<'original' | 'split' | 'redacted'>(
    () => (typeof window !== 'undefined' && window.innerWidth < 1200 ? 'original' : 'split'),
  );
  const [foldFor, setFoldFor] = useState<{ key: string } | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  // A press of finish that did not finish (lib/attest.ts finishHold): the saved .docx would
  // show readable what this screen masks. Kept with the table it was measured over and shown
  // only while that table is on screen — the mark made to answer it clears it, and the next
  // press measures again — so it never describes a table the lawyer has since changed.
  const [held, setHeld] = useState<{ note: string; entities: Entity[] } | null>(null);
  const leftPane = useRef<HTMLDivElement>(null);
  const rightPane = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const entities = file?.entities || [];
  const heldNote = held && held.entities === entities ? held.note : null;
  // model-cleared candidates still awaiting a human verdict (confirmed ones
  // become entities via addSpan and drop out of this list automatically)
  const suspectsLive = liveSuspects(file?.suspects, entities);
  // split by what the model answered: a class that is not an identity is a judgment, anything
  // else is not, and the list, the finish title and the receipt say which (lib/review.ts modelJudged)
  const judgedLive = suspectsLive.filter(modelJudged);
  const unjudgedLive = suspectsLive.filter((s) => !modelJudged(s));
  const visible = entities.filter((e) =>
    rowIn(e, prov) &&
    (!query.trim() || e.text.toLowerCase().includes(query.trim().toLowerCase())));
  // the export preview, live: recomputed whenever a row is kept/discarded/folded. Through
  // lib/attest.ts exportOf, the measurement a finished file's recheck has just made of this
  // same table: one remask of a 61k-word document is 200–330 ms, and this saves the second.
  const rm = useMemo(() => (file?.text ? exportOf(file.text, entities, loadPractice()) : null), [file?.text, entities]);
  const red = rm?.text ?? file?.text ?? '';
  // numbered tags shared by two rows = a fold; safety-net rows share a tag by design
  const tagCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entities) if (!e.dead && !isFloorRow(e)) m.set(e.tag, (m.get(e.tag) || 0) + 1);
    return m;
  }, [entities]);

  // selection follows everywhere: picking an entity (row, highlight, or tag
  // chip) scrolls its first occurrence into view in both panes and the rail
  useEffect(() => {
    if (!sel) return;
    syncing.current = true; // don't fight the proportional sync
    document.querySelectorAll('.rev-pane').forEach((p) => {
      p.querySelector('[data-hot]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    document.querySelector('.erow[data-sel]')?.scrollIntoView({ block: 'nearest' });
    window.setTimeout(() => { syncing.current = false; }, 600);
  }, [sel]);

  // proportional scroll-sync between the two panes
  // Coalesced to ONE sync per frame. Reading scrollHeight and then writing
  // scrollTop forces a synchronous reflow; doing that on every scroll event of
  // a 7,700-word document thrashes layout badly enough to freeze the renderer
  // (measured on a real 49 KB agreement). A burst of wheel events now collapses
  // into a single frame's work.
  const syncRaf = useRef(0);
  const syncScroll = (from: 'l' | 'r') => {
    if (syncing.current || syncRaf.current) return;
    syncRaf.current = requestAnimationFrame(() => {
      syncRaf.current = 0;
      const a = from === 'l' ? leftPane.current : rightPane.current;
      const b = from === 'l' ? rightPane.current : leftPane.current;
      if (!a || !b) return;
      syncing.current = true;
      const ratio = a.scrollTop / Math.max(1, a.scrollHeight - a.clientHeight);
      b.scrollTop = ratio * (b.scrollHeight - b.clientHeight);
      requestAnimationFrame(() => { syncing.current = false; });
    });
  };
  useEffect(() => () => { if (syncRaf.current) cancelAnimationFrame(syncRaf.current); }, []);

  // Findings in DOCUMENT order — a long document needs a way to walk what was
  // found without hunting the page for coloured marks. This is the ONE order on
  // the screen: the ◂ ▸ walker, the arrow keys and the guided queue all read it.
  // Three cursors used to write one `sel` across two orderings, so the readout
  // lost its place whenever the lawyer moved by a means it wasn't watching.
  // A row left visible STAYS in the walk — it is still marked in the document,
  // and dropping it knocked the counter off its place the instant a verdict
  // landed (see findingIdx below).
  const docOrder = useMemo(() => {
    if (!file?.text || !entities.length) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of placeSpans(file.text, entities)) {
      if (p.e && !seen.has(p.e.key)) { seen.add(p.e.key); out.push(p.e.key); }
    }
    return out;
  }, [file?.text, entities]);
  const docRank = useMemo(() => new Map(docOrder.map((k, i) => [k, i] as const)), [docOrder]);
  /** any set of rows in document order; a row the text never places sorts last, keeping its rail order */
  const inDocOrder = (es: Entity[]) => es
    .map((e, i) => ({ e, r: docRank.get(e.key) ?? docOrder.length + i }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.e);
  // The readout printed "41 findings" — no place at all — the moment `sel` left
  // the walk, which is any row the document text does not place. It now holds
  // the last place it knew instead of throwing it away.
  const lastIdx = useRef(-1);
  const selIdx = sel ? docOrder.indexOf(sel) : -1;
  if (selIdx >= 0) lastIdx.current = selIdx;
  else if (lastIdx.current >= docOrder.length) lastIdx.current = docOrder.length - 1;
  const findingIdx = selIdx >= 0 ? selIdx : lastIdx.current;
  const stepFinding = (dir: 1 | -1) => {
    if (!docOrder.length) return;
    const n = findingIdx < 0 ? (dir === 1 ? 0 : docOrder.length - 1) : (findingIdx + dir + docOrder.length) % docOrder.length;
    setSel(docOrder[n]);
  };
  const groups = useMemo(() => {
    const g = new Map<string, Entity[]>();
    for (const e of visible) {
      const label = CAT_LABEL[e.cat];
      if (!g.has(label)) g.set(label, []);
      g.get(label)!.push(e);
    }
    return CAT_ORDER.filter((l) => g.has(l)).map((l) => [l, g.get(l)!] as const);
  }, [visible]);

  // What the keyboard walks and acts on: the rows actually on screen, in document
  // order. The arrows used to walk every row the filter allowed — category-grouped
  // rail order, COLLAPSED groups included — so an arrow press stepped into a folded
  // group and the highlight vanished from both panes for several presses.
  const walkRows = inDocOrder(groups.filter(([label]) => !collapsed.has(label)).flatMap(([, es]) => es));
  // The pending queue in document order: the guided card walks the document top
  // to bottom, the same direction as the panes and the arrows.
  const pendingList = inDocOrder(entities.filter((e) => e.status === 'pending'));
  // What a human decided, what stands as the machine marked it, what is waiting — never
  // "N of N reviewed". That count was `entities.length - pendingList.length`, which credited
  // the lawyer with reading every row the engine was sure of (lib/review.ts has the measure).
  const tally = reviewTally(entities);
  // The guided card follows the selection. It was hard-wired to pendingList[0]:
  // a lawyer clicked a name, watched it outline red in BOTH panes, pressed I to
  // leave it readable — and the app left a DIFFERENT name readable, one scrolled
  // off the top of the rail. C over-redacts; I is a leak into the exported file.
  const guided = entities.find((e) => e.key === sel && e.status === 'pending') ?? pendingList[0] ?? null;
  // The row a bare-key verdict lands on: the selected one, outlined red in both
  // panes, and the guided card's row only when NOTHING is selected — the one case
  // where the screen names the row the keys will hit before they hit it.
  const keyTarget = sel ?? guided?.key ?? null;
  const selEnt = sel ? entities.find((e) => e.key === sel) ?? null : null;
  // a selection the rail is not showing: the filter, the search box or a folded group
  const selHidden = !!sel && !walkRows.some((x) => x.key === sel);

  useEffect(() => {
    if (!file) return;
    const h = (e: KeyboardEvent) => {
      // Word muscle memory must never mutate the redaction. Before this guard,
      // Ctrl+I (italic) hit the `ignore` branch and left the guided name
      // READABLE, Ctrl+D toggled a redaction off, Ctrl+U undid the last
      // decision and Ctrl+F opened the fold picker — silent un-redaction on the
      // one screen that is supposed to be the gate. Shortcuts here are bare keys
      // only; the browser keeps its own.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/input|textarea/i.test((e.target as HTMLElement).tagName)) return;
      const idx = walkRows.findIndex((x) => x.key === sel);
      // an arrow with nothing to walk leaves the selection where it is: clearing
      // it would blank the highlight in both panes for a press that did nothing
      if ((e.key === 'ArrowDown' || e.key === 'j') && walkRows.length) { e.preventDefault(); setSel(walkRows[Math.min(idx + 1, walkRows.length - 1)].key); }
      if ((e.key === 'ArrowUp' || e.key === 'k') && walkRows.length) { e.preventDefault(); setSel(walkRows[Math.max(idx - 1, 0)].key); }
      // ONE rule for all four verdict keys: they act on the SELECTED row and on no
      // other. C and I used to fall through to the guided card instead, so a lawyer
      // who clicked a name and pressed I left a DIFFERENT name readable in the
      // export. D and F were bounded by the rail's filter and simply died when it
      // hid the row — a key that does nothing and says nothing reads as "this name
      // cannot be decided" rather than "this list is not showing it". A hidden
      // selection now refuses out loud and gives the way back to it.
      if (selHidden && ['c', 'C', 'i', 'I', 'd', 'D', 'x', 'f', 'F'].includes(e.key)) {
        e.preventDefault();
        onToast(`${selEnt ? `“${selEnt.text}” is` : 'The selected row is'} outlined in the document, but this list is not showing it — clear the status filter or the search box, or open its group, to decide it here.`);
        return;
      }
      if ((e.key === 'd' || e.key === 'D' || e.key === 'x') && sel) { e.preventDefault(); toggle(sel); }
      if ((e.key === 'f' || e.key === 'F') && sel) { e.preventDefault(); setFoldFor((f) => (f?.key === sel ? null : { key: sel })); }
      if ((e.key === 'c' || e.key === 'C') && keyTarget) { e.preventDefault(); decide(keyTarget, 'confirm'); }
      if ((e.key === 'i' || e.key === 'I') && keyTarget) { e.preventDefault(); decide(keyTarget, 'ignore'); }
      if (e.key === 'u' || e.key === 'U') { e.preventDefault(); onUndo(); }
      if (e.key === 'Escape') { setPick(null); setAdding(false); setFoldFor(null); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (!file) {
    return <section className="screen"><h1>Review</h1><p className="sub">Nothing selected — pick a file from the queue.</p></section>;
  }

  // The three review verdicts. Every one is undoable via the toast stack, and every one
  // records the row as decided — the tally and the receipt count THAT, never the engine's
  // confidence. Every other verdict path below does the same through decideRows or widenRow,
  // and each undo puts back exactly what was there (restoreRows, withdrawRow), `decided`
  // included. No row is rewritten inline in an onUpdate: test/review-honesty.mjs fails on one.
  const decide = (key: string, verdict: 'confirm' | 'ignore' | 'restore') => {
    const ent = entities.find((e) => e.key === key);
    if (!ent) return;
    const patch: Partial<Entity> = verdict === 'confirm'
      ? { dead: false, status: 'confirmed' }
      : verdict === 'ignore'
        ? { dead: true, status: 'ignored' }
        : { dead: false, status: 'confirmed' };
    onUpdate(file.id, (es) => decideRows(es, [key], patch));
    // The panes walk the document with the lawyer: a decided row hands the cursor
    // to the next row still waiting, so the next keystroke lands on the name that
    // is now outlined in both panes. Only a verdict from the cursor moves it — a
    // Confirm clicked on a row far down the rail must not drag the panes away
    // from where the lawyer is reading.
    if (ent.status === 'pending' && (key === sel || key === guided?.key)) {
      const i = pendingList.findIndex((e) => e.key === key);
      const rest = [...pendingList.slice(i + 1), ...pendingList.slice(0, i)];
      setSel(rest[0]?.key ?? key);
    }
    const undo = () => onUpdate(file.id, (es) => restoreRows(es, [ent]));
    if (isFloorRow(ent)) {
      onToast(verdict === 'ignore'
        ? `“${ent.text}” will stay VISIBLE — the safety-net pattern is switched off for this text`
        : `“${ent.text}” masked again by the safety-net pattern as ${ent.tag}`, undo);
    } else if (verdict === 'ignore' && !ent.junk) {
      // measured, not guessed: once this row is off, does the safety-net pattern still
      // cover the text? Then the export keeps a tag there and a safety-net row appears.
      const after = remask(file.text || '', entities.map((e) => (e.key === key ? { ...e, ...patch } : e)));
      const k = ent.text.trim().toLowerCase();
      const netted = after.divergence ? null : after.floorHits.find((h) => !h.exempt && h.text.trim().toLowerCase() === k) ?? null;
      onToast(netted
        ? `“${ent.text}” is off your list — but the safety-net pattern still masks it as ${netted.tag}; a safety-net row now shows that, and ignoring it too leaves the text readable`
        : `“${ent.text}” will stay VISIBLE in the export`, undo);
    } else if (verdict === 'ignore') {
      onToast(`“${ent.text}” ignored — boilerplate stays readable`, undo);
    } else {
      onToast(`“${ent.text}” confirmed — redacts as ${fmtTag(ent.tag)}`, undo);
    }
  };

  // legacy toggle semantics for the D shortcut: pending/confirmed → ignore, ignored → restore
  const toggle = (key: string) => {
    const ent = entities.find((e) => e.key === key);
    if (!ent) return;
    decide(key, ent.dead ? 'restore' : 'ignore');
  };

  const redactAsOther = (key: string, cat: Entity['cat']) => {
    const ent = entities.find((e) => e.key === key);
    if (!ent) return;
    const CLS: Record<string, string> = { person: 'PERSON', org: 'COMPANY', loc: 'ADDRESS', id: 'ID', contact: 'PHONE', term: 'ID' };
    onUpdate(file.id, (es) => decideRows(es, [key], { cat, cls: CLS[cat], dead: false, status: 'confirmed' }));
    // it had no undo at all: the one verdict in the guided card U could not take back
    onToast(`“${ent.text}” confirmed as ${cat === 'org' ? 'company' : cat}`,
      () => onUpdate(file.id, (es) => restoreRows(es, [ent])));
  };

  // The split-fix path (F15: the engine splits surface forms — "John Smith" +
  // a bare "Smith" arrive as two rows; folding is the human's safe merge).
  const fold = (childKey: string, targetKey: string) => {
    const child = entities.find((e) => e.key === childKey);
    const target = entities.find((e) => e.key === targetKey);
    if (!child || !target || child.tag === target.tag) return;
    // "Same as" is the strongest confirm there is — this is that person, redact it as them —
    // so it settles a pending row too, instead of leaving it locked in the queue with a new
    // tag. The undo used to put back the tag alone, so a folded boilerplate row stayed
    // masked after U; it now restores the row whole.
    onUpdate(file.id, (es) => decideRows(es, [childKey], { tag: target.tag, dead: false, status: 'confirmed' }));
    onToast(`“${child.text}” now masks as ${fmtTag(target.tag)} — same identity, one tag`,
      () => onUpdate(file.id, (es) => restoreRows(es, [child])));
    setFoldFor(null);
  };

  const unfold = (key: string) => {
    const ent = entities.find((e) => e.key === key);
    if (!ent) return;
    const prefix = ent.tag.match(/^\[([A-Za-z]+)-?\d+\]$/)?.[1] || 'Term';
    // past the names found only outside the body too, which the saved .docx masks under their
    // own tags (lib/side.ts): one tag, one name, in every part of the file
    const n = Math.max(0, ...[...entities, ...sideRowsOf(file)].map((e) => { const m = e.tag.match(new RegExp(`^\\[${prefix}(\\d+)\\]$`)); return m ? +m[1] : 0; })) + 1;
    const tag = `[${prefix}${n}]`;
    // a decision about WHO this is, not about whether to redact it: a pending row stays in
    // the queue (reviewTally counts it as waiting) until it is confirmed or left readable
    onUpdate(file.id, (es) => decideRows(es, [key], { tag }));
    onToast(`“${ent.text}” unfolded — now its own ${fmtTag(tag)}`,
      () => onUpdate(file.id, (es) => restoreRows(es, [ent])));
    setFoldFor(null);
  };

  // The miss-fix path: no OOS score is 100%, so what the engine missed must be
  // addable on the spot — selection or typed, one category click, undoable.
  const addSpan = (text: string, cat: Entity['cat']) => {
    const clean = text.trim();
    if (!clean || !file) return;
    // a safety-net row never blocks a hand-added one: the table's numbered tag is the
    // reversible redaction, and once it covers the text the floor row retires itself
    const existing = entities.find((e) => !isFloorRow(e) && e.text.toLowerCase() === clean.toLowerCase());
    if (existing) {
      if (existing.dead) {
        // Selecting a discarded name and redacting it is a confirm. It set `dead` alone, so a
        // boilerplate suspect brought back this way stayed pending and kept the finish locked.
        onUpdate(file.id, (es) => decideRows(es, [existing.key], { dead: false, status: 'confirmed' }));
        onToast(`“${existing.text}” was discarded — restored instead`,
          () => onUpdate(file.id, (es) => restoreRows(es, [existing])));
      } else {
        setSel(existing.key);
        onToast(`“${existing.text}” is already in the table`);
      }
    } else {
      // real match count with the engine's boundary guard — a span that
      // matches nothing must be refused, not floored to "1 occurrence"
      const occ = spanMatches(file.text || '', clean);
      if (occ === 0) {
        onToast(`“${clean.length > 40 ? clean.slice(0, 40) + '…' : clean}” doesn’t appear as its own words in this document — nothing would be masked. (Text inside a longer marked name is already covered.)`);
        setPick(null); setAdding(false); setAddText('');
        return;
      }
      const prefix = TAG_PREFIX[cat];
      const n = Math.max(0, ...[...entities, ...sideRowsOf(file)].map((e) => { const m = e.tag.match(new RegExp(`^\\[${prefix}(\\d+)\\]$`)); return m ? +m[1] : 0; })) + 1;
      // the key is read off the table, never a per-mount counter (lib/review.ts mintHandKey)
      const ent: Entity = { key: mintHandKey(entities, 'u'), text: clean, tag: `[${prefix}${n}]`, cat, prov: 'added by you', occ, status: 'confirmed', decided: true };
      onUpdate(file.id, (es) => [...es, ent]);
      setSel(ent.key);
      onToast(`Redacted “${clean}” — ${occ} occurrence${occ === 1 ? '' : 's'} masked`, () => onUpdate(file.id, (es) => withdrawRow(es, ent)));
    }
    setPick(null);
    setAdding(false);
    setAddText('');
    window.getSelection()?.removeAllRanges();
  };

  // ── drag-to-extend ────────────────────────────────────────────────────────
  // Three-part names (Lim Bo Seng, Lee Kuan Yew) are the engine's classic
  // partial catch: it takes "Lim" and leaves "Bo Seng" readable — or worse,
  // finds them separately and the export reads "[Person1] [Person1]". Grabbing
  // either edge of a highlight and pulling fixes it in one gesture: the span
  // grows word by word, anything it swallows folds into the SAME tag, and the
  // short form keeps its own row if it still stands alone elsewhere (never
  // unmask silently).
  const dragRef = useRef<{ side: 'l' | 'r'; start: number; end: number; origStart: number; origEnd: number } | null>(null);
  const [ext, setExt] = useState<{ start: number; end: number } | null>(null);

  const extendSpan = (e: Entity, newText: string) => {
    if (!file?.text) return;
    const doc = file.text;
    // A row under Protected terms is placed tolerantly (every apostrophe, dash and invisible
    // character), and both counts must be taken the way it is placed. Counted with the
    // footprint, a protected "O’Brien" widened where the lone one was written "O'Brien" found
    // it nowhere, the short form lost its row, and the export held on a term with no row.
    const tol = e.cat === 'protected' && !isFloorRow(e);
    const occNew = tol ? protectedMatches(doc, newText) : spanMatches(doc, newText);
    if (occNew === 0) { onToast(`“${newText}” doesn’t appear as its own words — nothing changed.`); return; }
    const alone = occurrencesOutside(doc, e.text, newText, tol);
    const swallowed = entities.filter((x) => x.key !== e.key && !x.dead && x.tag !== e.tag && wordContains(newText, x.text));
    const swallowedKeys = swallowed.map((s) => s.key);
    const keep = mintHandKey(entities, 'x');
    // The widened row and every row the drag swallowed are the lawyer's decision; the short
    // form kept where it stands alone is the engine's row as it was (lib/review.ts widenRow).
    onUpdate(file.id, (es) => widenRow(es, e.key, newText, occNew, alone, swallowedKeys, keep));
    setSel(e.key);
    const folded = swallowed.length ? ` · ${swallowed.length} overlapping item${swallowed.length === 1 ? '' : 's'} folded into ${fmtTag(e.tag)}` : '';
    const kept = alone > 0 ? ` · “${e.text}” still masked where it stands alone (${alone})` : '';
    // the undo takes back this drag and nothing else (lib/review.ts unwidenRow)
    const widened: Widened = { was: e, text: newText, occ: occNew, kept: alone > 0 ? keep : null, swallowed };
    onToast(`Extended to “${newText}” — ${occNew} occurrence${occNew === 1 ? '' : 's'}${folded}${kept}`,
      () => onUpdate(file.id, (es) => unwidenRow(es, widened)));
  };

  const beginExtend = (e: Entity, side: 'l' | 'r', start: number, end: number, ev: React.PointerEvent) => {
    if (!file?.text) return;
    ev.preventDefault();
    ev.stopPropagation();
    const doc = file.text;
    dragRef.current = { side, start, end, origStart: start, origEnd: end };
    setExt({ start, end });
    const move = (m: PointerEvent) => {
      const d = dragRef.current;
      const o = offsetFromPoint(m.clientX, m.clientY);
      if (!d || o === null) return;
      if (d.side === 'r') d.end = Math.max(d.origEnd, Math.min(rightEdgeAt(doc, o), d.origStart + 160));
      else d.start = Math.min(d.origStart, Math.max(leftEdgeAt(doc, o), d.origEnd - 160));
      setExt({ start: d.start, end: d.end });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      const d = dragRef.current;
      dragRef.current = null;
      setExt(null);
      if (!d) return;
      const newText = doc.slice(d.start, d.end).trim();
      if (newText && newText !== e.text) extendSpan(e, newText);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const onPaneMouseUp = () => {
    if (dragRef.current) return; // a drag is not a selection
    const s = window.getSelection();
    const text = s?.toString().trim() || '';
    if (!s || !text || text.length < 2 || text.length > 120 || !file.entities) { setPick(null); return; }
    const rect = s.getRangeAt(0).getBoundingClientRect();
    const occ = Math.max(1, (file.text || '').toLowerCase().split(text.toLowerCase()).length - 1);
    setPick({ text, x: rect.left + rect.width / 2, y: rect.top, occ });
  };

  const bulkJunk = () => {
    const rows = entities.filter((e) => e.junk && e.status === 'pending');
    if (!rows.length) return;
    const keys = rows.map((e) => e.key);
    // one press, but a human verdict on every row the button counts
    onUpdate(file.id, (es) => decideRows(es, keys, { dead: true, status: 'ignored' }));
    onToast(`${rows.length} boilerplate item(s) ignored — they stay readable`, () => onUpdate(file.id, (es) => restoreRows(es, rows)));
  };

  // real files without entities: forensic-finds view (engine-free truth from the walkers)
  // revision marks are FLAGS on a run (i.rev), never a kind — a tracked insertion in a
  // header is a header run with rev:'ins', and lands here as exactly that
  const forensic = file.docx ? file.docx.items.filter((i) => i.rev || ['comment', 'alt-text'].includes(i.kind) || i.hidden) : [];
  const props = file.docx ? file.docx.items.filter((i) => i.part.startsWith('docProps/')) : [];
  const partsScanned = file.docx ? file.docx.inventory.scanned.length : null;
  const pdfFinds = file.pdf ? [
    ...file.pdf.metaFinds.map((m) => ({ label: m.key.toLowerCase(), value: m.value })),
    ...file.pdf.annotations.filter((a) => a.value).map((a) => ({ label: a.field ? `form: ${a.field}` : a.subtype.toLowerCase(), value: String(a.value) })),
  ] : [];
  const junkCount = entities.filter((e) => e.junk && e.status === 'pending').length;
  // which engine actually produced this table (null = none ran). Not a hook —
  // it sits below the early return on purpose.
  const eng = engineIdentity(file.engineStats);

  const forensicRow = (i: DocxItem, n: number) => (
    <div key={n} className="erow" style={{ cursor: 'default' }}>
      <span className="edot" style={{ background: 'var(--amber)' }} />
      <span className="etext" title={i.text}>{i.text.slice(0, 34)}</span>
      <span className="eprov">{forensicWord(i)}{i.author ? ` · ${i.author}` : ''}</span>
    </div>
  );
  const pdfRow = (x: { label: string; value: string }, n: number) => (
    <div key={n} className="erow" style={{ cursor: 'default' }}>
      <span className="edot" style={{ background: 'var(--amber)' }} />
      <span className="etext" title={x.value}>{x.value.slice(0, 34)}</span>
      <span className="eprov">{x.label}</span>
    </div>
  );

  // reading-truth blocks (forensics, metadata, warnings) — shown for real files in
  // both the corridor and the plain reading view
  const infoBlocks = (
    <>
      {!file.sample && (
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 12 }}>
          {file.words?.toLocaleString()} words of body text{file.docx ? ` · ${partsScanned} document parts scanned` : file.pdf ? ` · ${file.pdf.summary}` : ''}.
        </div>
      )}
      {forensic.length > 0 && <>
        <div className="egroup">Forensic finds — no AI involved <span className="cnt">{forensic.length}</span></div>
        {forensic.slice(0, SHOW_FIRST).map((i, n) => forensicRow(i, n))}
        {forensic.length > SHOW_FIRST && (
          // the count above says N; the list used to stop at 12 and say nothing (audit B6)
          <details style={{ margin: '2px 0 4px' }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ink2)' }}>{forensic.length - SHOW_FIRST} more not shown above — open to see all {forensic.length}</summary>
            {forensic.slice(SHOW_FIRST).map((i, n) => forensicRow(i, SHOW_FIRST + n))}
          </details>
        )}
        <div style={{ fontSize: 12, color: 'var(--mut)', margin: '8px 0 12px' }}>Tracked changes, comment authors and hidden text — the leaks conversion tools drop silently. One row per text run as Word stored it, so a sentence Word split into runs shows as several rows.</div>
      </>}
      {props.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 12 }}>
          Document properties carry {props.length} value(s) — including author/company names most people never see.
        </div>
      )}
      {pdfFinds.length > 0 && <>
        <div className="egroup">Metadata & form values — no AI involved <span className="cnt">{pdfFinds.length}</span></div>
        {pdfFinds.slice(0, SHOW_FIRST).map((x, n) => pdfRow(x, n))}
        {pdfFinds.length > SHOW_FIRST && (
          <details style={{ margin: '2px 0 4px' }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ink2)' }}>{pdfFinds.length - SHOW_FIRST} more not shown above — open to see all {pdfFinds.length}</summary>
            {pdfFinds.slice(SHOW_FIRST).map((x, n) => pdfRow(x, SHOW_FIRST + n))}
          </details>
        )}
        <div style={{ fontSize: 12, color: 'var(--mut)', margin: '8px 0 12px' }}>Author fields and filled form values travel with the file — the leaks a copy-paste never shows.</div>
      </>}
      {(file.warnings?.length || 0) > 0 && <>
        <div className="egroup">Warnings <span className="cnt">{file.warnings!.length}</span></div>
        {file.warnings!.map((w, i) => <div key={i} style={{ fontSize: 12.5, color: 'var(--amber)', marginBottom: 6 }}>⚠ {w}</div>)}
      </>}
    </>
  );

  return (
    <section className="screen" style={{ width: '100%', maxWidth: 'none', padding: 0, height: 'calc(100vh - 48px)' }}>
      <div className="rev-wrap">
        <div className="rev-paperpane" onMouseUp={onPaneMouseUp}>
          {file.entities && entities.length > 0 && (
            <div className="viewbar">
              {onBack && <button className="chipf" onClick={onBack} title="Back to the queue">← Drop</button>}
              <span className="viewseg" role="tablist" aria-label="Document view">
                <button role="tab" aria-selected={view === 'original'} data-on={view === 'original' || undefined} onClick={() => setView('original')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
                  Original
                </button>
                <button role="tab" aria-selected={view === 'split'} data-on={view === 'split' || undefined} onClick={() => setView('split')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="8" height="16" rx="1.5" /><rect x="13" y="4" width="8" height="16" rx="1.5" /></svg>
                  Side by side
                </button>
                <button role="tab" aria-selected={view === 'redacted'} data-on={view === 'redacted' || undefined} onClick={() => setView('redacted')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="3" width="14" height="18" rx="2" /><rect x="8" y="7.5" width="8" height="2.6" rx="0.8" fill="currentColor" stroke="none" /><rect x="8" y="12" width="6" height="2.6" rx="0.8" fill="currentColor" stroke="none" /><path d="M8 17h5" /></svg>
                  Redacted
                </button>
              </span>
              {docOrder.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 10 }} title="Walk the findings in document order — a long document is not scannable by eye">
                  <button className="chipf" onClick={() => stepFinding(-1)} aria-label="Previous finding">◂</button>
                  <span style={{ fontSize: 12, color: 'var(--mut)', fontVariantNumeric: 'tabular-nums', minWidth: 74, textAlign: 'center' }}>
                    {findingIdx < 0 ? `${docOrder.length} finding${docOrder.length === 1 ? '' : 's'}` : `${findingIdx + 1} of ${docOrder.length}`}
                  </span>
                  <button className="chipf" onClick={() => stepFinding(1)} aria-label="Next finding">▸</button>
                </span>
              )}
              <span className="legend" style={{ marginLeft: 'auto' }}>
                <i style={{ background: 'var(--w-person)', borderColor: 'var(--c-person)' }} />person
                <i style={{ background: 'var(--w-org)', borderColor: 'var(--c-org)' }} />company
                <i style={{ background: 'var(--w-loc)', borderColor: 'var(--c-loc)' }} />place
                <i style={{ background: 'var(--w-id)', borderColor: 'var(--c-id)' }} />ID·phone
                <i className="lg-dash" />needs review
              </span>
            </div>
          )}
          <div className="rev-papers">
            {view !== 'redacted' && (
              <div className="rev-pane" ref={leftPane} onScroll={() => view === 'split' && syncScroll('l')}
                onCopy={() => onToast('Heads up — you copied from the ORIGINAL: the names are still in it. The safe copy lives on the Export screen.')}>
                <div className="panehead">Original — click a highlight, drag its edges to extend, select text to add</div>
                <div className="paper" style={{ minHeight: '70vh' }}>
                  {file.entities ? (
                    <PaperWithSpans text={file.text || ''} entities={entities} ghosts={suspectsLive} claims={rm && !rm.divergence ? rm.claims : undefined} floorHits={rm && !rm.divergence ? rm.floorHits : undefined} selKey={sel} onPick={setSel}
                      onDragEdge={beginExtend} preview={ext}
                      onGhost={(g, ev) => {
                        const rect = (ev.target as HTMLElement).getBoundingClientRect();
                        setPick({ text: g.text, x: rect.left + rect.width / 2, y: rect.top, occ: g.occ });
                      }} />
                  ) : (
                    <div className="doc" style={{ whiteSpace: 'pre-wrap' }}>{(file.text || '').slice(0, 12000) || 'No body text extracted.'}</div>
                  )}
                </div>
              </div>
            )}
            {view !== 'original' && file.entities && entities.length > 0 && (
              <div className="rev-pane" ref={rightPane} onScroll={() => view === 'split' && syncScroll('r')}>
                <div className="panehead">Redacted — exactly what exports right now</div>
                <div className="paper" style={{ minHeight: '70vh' }}>
                  <RedactedPaper red={red} entities={entities} floorHits={rm?.floorHits ?? []} selKey={sel} onPick={setSel} />
                </div>
              </div>
            )}
          </div>
          {pick && (
            <div className="addpop" style={{ left: pick.x, top: pick.y - 52 }} onMouseUp={(e) => e.stopPropagation()}>
              <b title={pick.text}>{pick.text.length > 26 ? pick.text.slice(0, 26) + '…' : pick.text}</b>
              <span className="occ">×{pick.occ}</span>
              <span className="catchips">
                {ADD_CATS.map(([cat, label]) => (
                  <button key={cat} className="catchip" onClick={() => addSpan(pick.text, cat as Entity['cat'])}>
                    <i style={{ background: CAT_VAR[cat] }} />{label}
                  </button>
                ))}
              </span>
            </div>
          )}
        </div>
        <div className="rev-rail">
          {file.docx && (
            <div className="cover">
              <span>Coverage</span>
              <span className="segs">{Array.from({ length: partsScanned || 0 }, (_, i) => <i key={i} />)}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{partsScanned} parts{file.docx.inventory.binaryFlagged.length ? ` · ${file.docx.inventory.binaryFlagged.length} not scanned` : ''}</span>
            </div>
          )}

          {file.entities ? (
            <>
              {/* Review was the only screen in the corridor that showed fixture
                  findings as if the engine had produced them — while the rail
                  said the engine wasn't running. Drop, Export and History all
                  carry a sample marker; this one didn't. */}
              {file.sample && (
                <div className="vrow" style={{ color: 'var(--amber)', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ lineHeight: 1.45, fontSize: 12.5 }}>
                    <b>Sample document.</b> These findings are a fixed demo list, not an engine run — the flow is real, the results are canned.
                  </span>
                </div>
              )}
              {/* A finish that a later change took off (lib/attest.ts recheckFinish): what
                  did it, and what it left readable that was masked when the lawyer finished.
                  At the top, because Export and Compare now hold this file, and the list below
                  looks exactly as it did the moment before. */}
              {file.reopened && (
                <div className="vrow" role="status" style={{ color: 'var(--amber)', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ lineHeight: 1.45, fontSize: 12.5 }}>
                    <b>Changed since you finished — finish again.</b> {file.reopened}
                  </span>
                </div>
              )}
              <div className="revhead">
                <b>{entities.length} {entities.length === 1 ? 'entity' : 'entities'}</b>
                {/* "redacted", not "confirmed": every row the engine is sure of arrives in this
                    state, and "42 confirmed" on a document nobody has read says a person did it.
                    Counted by what the export does, pending names included (lib/review.ts headLine). */}
                <span>{headLine(entities)}</span>
              </div>
              {!file.sample && (
                <div style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--mut)', margin: '-4px 0 9px' }}>
                  {eng
                    ? <>Found by <b style={{ color: eng.frozen ? 'var(--ink2)' : 'var(--amber)' }}>{eng.short}</b>{eng.detail ? ` — ${eng.detail}` : ''} · name self-reported by the engine</>
                    : 'No engine run is recorded for this document — nothing in this table came from the frozen pipeline or the in-app core.'}
                </div>
              )}
              {/* A doctrine the lawyer SET and the run did not honour. This is the screen
                  where they decide, so it cannot wait for the receipt — and it is amber
                  rather than a passing grey line because the thing it describes is a class
                  of identifier that may still be readable in what they are about to send. */}
              {!file.sample && typeof (file.engineStats as Record<string, unknown> | undefined)?.profileNote === 'string' && (
                <div style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--amber)', margin: '-4px 0 9px' }}>
                  {String((file.engineStats as Record<string, unknown>).profileNote)}
                </div>
              )}
              <div className="pills">
                {STATUS_FILTERS.map(([v, label]) => {
                  const n = entities.filter((e) => rowIn(e, v)).length;
                  if (n === 0 && v !== 'all') return null;
                  return (
                    <button key={v} className="chipf" data-on={prov === v || undefined} onClick={() => setProv(v)}>
                      {label} {n}
                    </button>
                  );
                })}
              </div>
              {guided && (
                <div className="guided">
                  <div className="ghead">Guided review <span className="cnt">{pendingList.length} to go</span></div>
                  <b className="gname">{guided.text}</b>
                  <div className="gsnippet">{(() => {
                    const t = file.text || '';
                    // exact-case occurrence first — for a "case mismatch" row the
                    // lowercase print IS the evidence being reviewed
                    let i = t.indexOf(guided.text);
                    if (i < 0) i = t.toLowerCase().indexOf(guided.text.toLowerCase());
                    if (i < 0) return null;
                    // word-boundary trims: never open or close on a chopped word
                    const from = Math.max(0, i - 56);
                    const end = i + guided.text.length;
                    const left = from === 0 ? t.slice(0, i) : t.slice(from, i).replace(/^\S+\s+/, '');
                    const rawR = t.slice(end, end + 56);
                    const right = end + 56 >= t.length ? rawR : rawR.replace(/\s+\S+$/, '');
                    return <>{from > 0 && '…'}{left}<mark>{t.slice(i, end)}</mark>{right}{end + 56 < t.length && '…'}</>;
                  })()}</div>
                  <div className="greason">{pendingReason(guided, entities)}</div>
                  <div className="gactions">
                    <button className="btn-red gconfirm" onClick={() => decide(guided.key, 'confirm')}>Confirm — redact as {fmtTag(guided.tag)}</button>
                    <button className="btn-plain" onClick={() => decide(guided.key, 'ignore')}>Not sensitive — leave readable</button>
                    <button className="btn-plain" onClick={() => setConfirmFor((c) => (c === 'g:' + guided.key ? null : 'g:' + guided.key))}>Redact as other…</button>
                  </div>
                  {confirmFor === 'g:' + guided.key && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                      {ADD_CATS.map(([cat, label]) => (
                        <button key={cat} className="catchip" onClick={() => { redactAsOther(guided.key, cat as Entity['cat']); setConfirmFor(null); }}>
                          <i style={{ background: CAT_VAR[cat] }} />{label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* The card and the keys name the same row in every case but two:
                      a selection that is already decided, and a selection this list
                      is not showing. The keys follow the selection, so the card says
                      when they are not aimed at it rather than letting a keystroke
                      land out of sight. */}
                  <div className="ghint">
                    {selHidden
                      ? <>The selected row is not in this list. <kbd>C</kbd> and <kbd>I</kbd> say so rather than decide it — the buttons above still work.</>
                      : keyTarget !== guided.key
                        ? <>Another row is selected. <kbd>C</kbd> and <kbd>I</kbd> act on that one — use the buttons above for this one.</>
                        : <><kbd>C</kbd> confirm · <kbd>I</kbd> leave readable</>}
                  </div>
                </div>
              )}
              <input className="railsearch" placeholder="Search entities…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {groups.map(([label, es]) => (
                <div key={label}>
                  <div className="egroup egroup-btn" role="button" onClick={() => setCollapsed((c) => { const n = new Set(c); n.has(label) ? n.delete(label) : n.add(label); return n; })}>
                    <span className="chev">{collapsed.has(label) ? '▸' : '▾'}</span>
                    {label} <span className="cnt">{es.length}</span>
                    {es.some((e) => e.status === 'pending') && (
                      <button className="eact econfirm" style={{ opacity: 1, marginLeft: 'auto' }}
                        onClick={(ev) => { ev.stopPropagation(); es.filter((e) => e.status === 'pending').forEach((e) => decide(e.key, 'confirm')); }}>
                        Confirm all {es.filter((e) => e.status === 'pending').length}
                      </button>
                    )}
                  </div>
                  {!collapsed.has(label) && es.map((e) => (
                    <div key={e.key} className="erow" style={{ position: 'relative' }} data-sel={sel === e.key || undefined} data-dead={e.dead || undefined}
                      data-pending={e.status === 'pending' || undefined} onClick={() => setSel(e.key)}>
                      <span className="edot" style={{ background: CAT_VAR[e.cat] }} />
                      {needsLook(e) && !e.dead && <span className="equest" title={e.junk ? 'Flagged as possible boilerplate — is it actually identifying?' : 'Only caught on the second read — the wide sweep missed it'}>?</span>}
                      <span className="etext" title={`${e.text} · ${isFloorRow(e) ? 'safety-net pattern' : e.prov}`}>{e.text}</span>
                      <span className="etag" data-shared={(!isFloorRow(e) && (tagCount.get(e.tag) || 0) > 1) || undefined}
                        title={isFloorRow(e) ? 'Safety-net tag — one tag for every value of its kind' : (tagCount.get(e.tag) || 0) > 1 ? 'Folded — shares this tag with another row' : e.prov}>{fmtTag(e.tag)}</span>
                      <span className="eocc">×{e.occ}</span>
                      {/* the engine's separate read of the parts outside the body found this
                          name there too (lib/engine.ts joinSide) — the ×count is the body's */}
                      {e.found?.length ? <span className="eprov">also in {andList(e.found)}</span> : null}
                      <span className="eacts">
                        {!isFloorRow(e) && (
                          <button className="eact efold" title="Tell the app this is the same person or thing as another entry — they share one tag — F"
                            onClick={(ev) => { ev.stopPropagation(); setSel(e.key); setFoldFor((f) => (f?.key === e.key ? null : { key: e.key })); }}>Same as…</button>
                        )}
                        {e.status === 'pending' && (
                          <button className="eact econfirm" onClick={(ev) => { ev.stopPropagation(); decide(e.key, 'confirm'); }}>Confirm</button>
                        )}
                        <button className="eact"
                          onClick={(ev) => { ev.stopPropagation(); decide(e.key, statusOf(e) === 'ignored' ? 'restore' : 'ignore'); }}>
                          {statusOf(e) === 'ignored' ? (e.junk ? 'Restore' : 'Redact again') : (e.junk ? 'Ignore' : 'Leave visible')}
                        </button>
                      </span>
                      {foldFor?.key === e.key && !isFloorRow(e) && (
                        <div className="foldmenu" style={{ right: 6, top: '100%' }} onClick={(ev) => ev.stopPropagation()}>
                          <h5>“{e.text}” is the same as…</h5>
                          {entities.filter((t) => t.cat === e.cat && !t.dead && !isFloorRow(t) && t.tag !== e.tag && t.key !== e.key).map((t) => (
                            <button key={t.key} onClick={() => fold(e.key, t.key)}>
                              <span className="edot" style={{ background: CAT_VAR[t.cat] }} />{t.text}
                              <span className="etag" style={{ marginLeft: 'auto' }}>{fmtTag(t.tag)}</span>
                            </button>
                          ))}
                          {entities.some((t) => t.key !== e.key && t.tag === e.tag) && (
                            <button onClick={() => unfold(e.key)}>↩ Unfold — give “{e.text}” its own tag</button>
                          )}
                          {entities.filter((t) => t.cat === e.cat && !t.dead && !isFloorRow(t) && t.tag !== e.tag && t.key !== e.key).length === 0 && !entities.some((t) => t.key !== e.key && t.tag === e.tag) && (
                            <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--mut)' }}>No other {CAT_LABEL[e.cat]?.toLowerCase() || 'entities'} to fold into.</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {([
                [judgedLive, 'Model cleared — you confirm', 'The engine looked at these and judged them not identifying. It isn’t 100% — you get the final word. They carry gray dashes in the document.'],
                // An empty answer is a failed call since wf5 S5L-2 and never reaches this list;
                // what does is an answer that names none of the classes the model was given.
                [unjudgedLive, 'No class from the model — you decide', 'The model’s answer for these was none of the classes it was asked to choose from, so nothing was decided about them. You decide. They carry gray dashes in the document.'],
              ] as const).map(([list, head, note]) => list.length > 0 && (
                <div key={head}>
                  <div className="egroup">{head} <span className="cnt">{list.length}</span></div>
                  <div className="suspnote">{note}</div>
                  {list.map((s) => (
                    <div key={s.text} className="erow" style={{ position: 'relative' }}>
                      <span className="edot" style={{ background: 'var(--faint)' }} />
                      <span className="etext" title={s.text}>{s.text}</span>
                      <span className="etag">{modelJudged(s) ? `model: ${s.verdict}` : 'model: no class'}</span>
                      <span className="eocc">×{s.occ}</span>
                      <button className="eact" style={{ opacity: 1 }}
                        onClick={(ev) => { ev.stopPropagation(); setConfirmFor((c) => (c === s.text ? null : s.text)); }}>Redact…</button>
                      {confirmFor === s.text && (
                        <div className="foldmenu" style={{ right: 6, top: '100%' }} onClick={(ev) => ev.stopPropagation()}>
                          <h5>Redact “{s.text}” as…</h5>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '4px 8px' }}>
                            {ADD_CATS.map(([cat, label]) => (
                              <button key={cat} className="catchip" onClick={() => { addSpan(s.text, cat as Entity['cat']); setConfirmFor(null); }}>
                                <i style={{ background: CAT_VAR[cat] }} />{label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {/* The names the engine's separate read of the headers, footers, footnotes,
                  endnotes, charts and SmartArt found and the body does not carry
                  (lib/engine.ts joinSide). They are not rows of this table — the table is what
                  the body carries — and the .docx writer masks with them (docxMaskTable). */}
              {!file.sample && sideRowsOf(file).length > 0 && (
                <div>
                  <div className="egroup">Found only outside the body <span className="cnt">{sideRowsOf(file).length}</span></div>
                  <div className="suspnote">The engine found these in the text the saved .docx carries outside its body. The body does not carry them, so they are not in the table above, the copied text or the .txt; the saved .docx masks each of them wherever it carries it. They cannot be left readable from here.</div>
                  {sideRowsOf(file).map((e) => (
                    <div key={e.key} className="erow" style={{ cursor: 'default' }}>
                      <span className="edot" style={{ background: CAT_VAR[e.cat] }} />
                      <span className="etext" title={e.text}>{e.text}</span>
                      <span className="etag">{fmtTag(e.tag)}</span>
                      <span className="eocc">×{e.occ}</span>
                      <span className="eprov">in {andList(e.found ?? [])}</span>
                    </div>
                  ))}
                </div>
              )}
              {!file.sample && file.side?.state === 'unread' && (
                <div className="vrow" role="status" style={{ color: 'var(--amber)', alignItems: 'flex-start', margin: '8px 0' }}>
                  <span style={{ lineHeight: 1.45, fontSize: 12.5 }}>
                    <b>{sideUnreadHead(file.side)}</b> {file.side.why}. Export holds the saved .docx; the copied text and the .txt are the body alone.{file.side.detail ? ` The engine said: ${file.side.detail}` : ''}
                  </span>
                </div>
              )}
              <div className="railbtns">
                {junkCount > 0 && <button className="chipf" onClick={bulkJunk}>Ignore all boilerplate ({junkCount})</button>}
                <button className="chipf" data-on={adding || undefined} onClick={() => setAdding((a) => !a)}>Add something it missed…</button>
              </div>
              {adding && (
                <div className="addform">
                  <input autoFocus placeholder="Exact text to redact — or just select it in the document" value={addText}
                    onChange={(e) => setAddText(e.target.value)} />
                  <span className="catchips">
                    {ADD_CATS.map(([cat, label]) => (
                      <button key={cat} className="catchip" disabled={!addText.trim()} onClick={() => addSpan(addText, cat as Entity['cat'])}>
                        <i style={{ background: CAT_VAR[cat] }} />{label}
                      </button>
                    ))}
                  </span>
                </div>
              )}
              {/* This line read as one loop — move, then decide — while C and I in
                  fact decided a row the arrows never touched. It now says which row
                  they land on, because that is the whole of the fix. */}
              <div className="kbdhint">Keys act on the selected row — <kbd>C</kbd> confirm · <kbd>I</kbd> leave readable · <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>D</kbd> ignore / restore · <kbd>F</kbd> same-as · <kbd>U</kbd> undo</div>
              {!file.sample && entities.length === 0 && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--ink2)', marginTop: 10 }}>
                  <b style={{ color: 'var(--ink)' }}>Nothing is marked on this document.</b>{' '}
                  If the engine was offline when it was read, select text in the document to redact
                  manually — or drop the file again to run the engine on it.
                </div>
              )}
              <div style={{ marginTop: 14 }}>{infoBlocks}</div>
              {/* beside the button that was pressed: what finishing would have vouched for
                  that this screen does not show, and what clears it */}
              {heldNote && (
                <div className="vrow" role="alert" style={{ color: 'var(--amber)', alignItems: 'flex-start', margin: '10px 0 0' }}>
                  <span style={{ lineHeight: 1.45, fontSize: 12.5 }}>
                    <b>Not finished.</b> {heldNote}
                  </span>
                </div>
              )}
              <div className="railbtns railfoot">
                <span className="tally" title={TALLY_TITLE}>{tallyLine(tally, suspectsLive.length)}</span>
                {/* A blocked action must offer the way through, not a dead click.
                    This used to be `disabled`: the lawyer pressed it, nothing
                    happened, and the route (the guided card, off-screen up the
                    rail) was only in a tooltip. Now it takes them there.
                    With nothing pending, pressing it is the lawyer's attestation that
                    they have read the document and its marks — Export, Compare and the
                    receipt all release on it — so the label and the title say that, and
                    say how many marks go out exactly as the machine made them. It said
                    "Everything reviewed — good to go" over a table nobody had opened. */}
                <button className={pendingList.length > 0 ? 'btn-red' : 'btn-go'}
                  title={pendingList.length > 0 ? `${pendingList.length} item(s) still need your decision — this takes you to the next one` : finishTitle(tally, judgedLive.length, unjudgedLive.length, file.kind === 'docx')}
                  onClick={() => {
                    if (pendingList.length > 0) {
                      // the guided card IS the queue — bring it back into view
                      // rather than selecting, which would fight the selection
                      // effect's own scrolling.
                      // The toast says which keys to press, and the keys follow the
                      // selection (keyTarget). With a settled row selected, "I to leave
                      // readable" left THAT row readable, not the card's. So when the keys
                      // are not already on the card, the selection is cleared, which
                      // hands them to it, and the toast names the row they will hit.
                      const onCard = !!guided && keyTarget === guided.key && !selHidden;
                      const next = onCard ? guided! : pendingList[0];
                      if (!onCard) setSel(null);
                      document.querySelector('.guided')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                      onToast(`${pendingList.length} still need your decision — the guided card at the top of the list walks them one at a time, starting with “${next.text}”. C confirms it, I leaves it readable.`);
                      return;
                    }
                    // finishing attests to the export; a .docx whose saved body would show
                    // readable what this screen masks is not finished, and the note says why
                    const hold = file ? finishHold(file, loadPractice(), loadProtectedTerms()) : null;
                    if (hold) { setHeld({ note: hold, entities }); return; }
                    setHeld(null);
                    onContinue();
                  }}>
                  {pendingList.length > 0 ? `${pendingList.length} pending — review first` : FINISH_LABEL}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="egroup">What was read <span className="cnt">real extraction</span></div>
              <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginBottom: 12 }}>
                {/* audit 2026-07-25: this line used to claim headers surface below. They
                    do not — only comments, tracked changes, alt-text and hidden text do.
                    Claims must match code in this house, so the claim narrows. */}
                {file.words?.toLocaleString()} words of body text{file.docx ? ` · ${partsScanned} document parts scanned (comments, tracked changes and hidden text surface below)` : file.pdf ? ` · ${file.pdf.summary}` : ''}.
              </div>
              {infoBlocks}
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--ink2)', marginTop: 10 }}>
                <b style={{ color: 'var(--ink)' }}>No entity table for this file</b> — it was held
                before detection could run. Fix the hold reason shown in the queue and drop it again.
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
