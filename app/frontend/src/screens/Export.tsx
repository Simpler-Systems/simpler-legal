import { useEffect, useMemo, useState } from 'react';
import type { QFile } from '../lib/store';
// Every gate, the text the buttons copy and the mask the .docx writer gets come from ONE call,
// exportPlan (lib/engine.ts), which the tests drive; this screen does not import the mask or
// the list checks that feed it, so it cannot compose a second, untested version of them.
import { exportPlan, isFloorRow, FLOOR_WORD, floorTablesLabel, survivingFragments, fragmentTerms, tagsBlanked, TAG_BLANK, channelWritten, exportCode, termKey, escapeWay, unfinishedSaid, type ListHold, type MaskedAnyway } from '../lib/engine';
// the text the saved .docx carries outside its body, and the engine's own read of it (owner
// ruling 27): what each surface below says of it is read off file.side, one state for all
import { sideScope, sideReceipt, sideRowsOf, SIDE_KINDS } from '../lib/side';
import { droppedChannels } from '../lib/extract/docx';
import { loadProtectedTerms } from '../lib/protected';
import { loadPractice } from '../lib/practice';
import { writeRedactedDocx, savedFlowText, type WriteReport } from '../lib/extract/docxWrite';
import type { NetWindow } from '../lib/netmeter';
import { saveTextFile, saveBinaryFile } from '../lib/tauri';
import { engineIdentity } from '../lib/engineStatus';
import { FINISH_LABEL, receiptReviewLine } from '../lib/review';

interface Props {
  file: QFile | null;
  onReview?: () => void;
  onBack?: () => void;
  onHome?: () => void;
  /** next unreviewed document, if any — enables corridor chaining */
  onNext?: (() => void) | null;
  /** give these declared terms rows in this file's table (App: withProtectedTerms) */
  onMaskTerms?: (terms: string[]) => void;
}

export default function Export({ file, onReview, onBack, onHome, onNext, onMaskTerms }: Props) {
  const [saved, setSaved] = useState<string | null>(null);
  /** the .docx writer's account of what it wrote (or why it held), for the line under the dock */
  const [docxNote, setDocxNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [docxBusy, setDocxBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** the declared terms a hold's button has been pressed for on this page, by termKey — one
   *  still held after its press gets no button again (`stuckKeys`, below) */
  const [pressed, setPressed] = useState<{ id: string | undefined; keys: string[] }>({ id: undefined, keys: [] });

  // ONE read of the settings every artefact on this page depends on — the always-redact list
  // and the practice table — taken when the page opens on a document. Until 2026-09-23 the
  // name key and the receipt read the list when the page drew and the .docx read it again
  // when its button was pressed, so a list edited in between gave a .docx masked with one
  // list beside a key and a receipt describing another. Leaving for Settings and coming
  // back remounts this screen, which is when a changed list is read again.
  const [snap, setSnap] = useState(() => ({ id: file?.id, terms: loadProtectedTerms(), practice: loadPractice() }));
  if (snap.id !== file?.id) setSnap({ id: file?.id, terms: loadProtectedTerms(), practice: loadPractice() });

  // ONE mask computation feeds the bytes AND every number on this page. Until audit
  // B2 the counts came from the table alone while the bytes also carried the
  // structured floor's tags — the funnel said "identical to the original" over a
  // file with seven [phone]/[number] tags in it. The plan also carries every release gate
  // and the .docx writer's table, over the one read of the list above.
  const plan = useMemo(
    () => (file?.entities ? exportPlan(file, snap.terms, snap.practice) : null),
    // keyed on the fields the plan reads, not the file object: a new plan re-runs the .docx dry run
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [file?.text, file?.entities, file?.sample, file?.reviewed, file?.engineComplete, file?.kind, file?.bytes, file?.side, snap],
  );
  const rm = plan?.rm ?? null;
  const red = plan?.red ?? '';
  // The code every saved artefact is named after: random, drawn once per redaction shown on
  // this page (engine.ts exportCode) — THE FILENAME CHANNEL, below, has the two measurements
  // that decided it. Held in state, never recomputed from anything, so every file saved from
  // this page carries the same one; a changed redaction draws a new one.
  const [codeOf, setCodeOf] = useState<{ red: string; code: string } | null>(null);
  let codeError: string | null = null;
  if (!codeOf || codeOf.red !== red) {
    try { setCodeOf({ red, code: exportCode() }); } catch (e: any) { codeError = String(e?.message || e); }
  }
  const docCode = codeOf && codeOf.red === red ? codeOf.code : '';

  // The saved .docx is WRITTEN when this page opens — a dry run, whose bytes are the ones the
  // button saves. The name key and the receipt list the always-redact tags this report says
  // the file carries (engine.ts channelWritten), so all three describe one run of the writer
  // over one read of the list.
  const docxSave = !!file && file.kind === 'docx' && !!file.bytes;
  const docxTable = plan?.docx ?? null;
  const [dry, setDry] = useState<{ table: unknown; report: WriteReport | null; error: string | null } | null>(null);
  // A .docx whose body an engine read and whose text outside the body it did not (engine.ts
  // exportPlan `docxHeld`, lib/side.ts sideHeld) is held the way the writer holds one: its
  // report keeps no bytes and says why, so the button, the key, the fragment check and the
  // line under the dock all read it as held, by the one road they already read a hold by.
  const sideHold = plan?.docxHeld ?? null;
  const sideDetail = sideHold && file?.side?.detail ? ` The engine said: ${file.side.detail}` : '';
  useEffect(() => {
    if (!docxTable || !file?.bytes) return;
    let live = true;
    writeRedactedDocx(file.bytes, { mask: docxTable.mask })
      .then((report) => { if (live) setDry({ table: docxTable, report: sideHold ? { ...report, bytes: null, held: `${sideHold}${sideDetail}${report.held ? ` ${report.held}` : ''}` } : report, error: null }); })
      .catch((e: any) => { if (live) setDry({ table: docxTable, report: null, error: String(e?.message || e) }); });
    return () => { live = false; };
  }, [docxTable, file?.bytes, sideHold, sideDetail]);
  const dryNow = dry && dry.table === docxTable ? dry : null;
  /** the dry run wrote a file the button can save */
  const docxReady = !!dryNow && !dryNow.error && !!dryNow.report?.bytes;
  // The fragment check (engine.ts survivingFragments): the pieces of kept names and of the
  // always-redact list's terms (fragmentTerms) the export still carries, flagged and never held.
  // Asked of the export's readable words (plan.readable: a kept "Card Phone Ltd" found "Card" in
  // the "[card]" the mask wrote) and, for a .docx the dry run wrote, of every other part it saves
  // — the header, the footer, the notes — as the writer saves them (savedFlowText), their tags
  // blanked the same way. Asked of the body alone until owner ruling 21's second pass, a header
  // "prepared for Mr Kierkegaard" and a footer "DMS\Clients\Kierkegaard\memo-v3.docx" beside a
  // kept "Søren Kierkegaard" were saved beside "no fragments of listed names survive"
  // (F1-HDR-FTR); and with the table's rows alone, a listed term with no row (F5-TERMS). A hook
  // above the early returns, since the check reads the whole body in one pass and the page
  // renders on every button it draws.
  const fragments = useMemo(() => {
    if (!plan || !file?.entities) return [];
    const saved = docxTable && dryNow?.report?.bytes ? dryNow.report.flows.filter((f) => f.kind !== 'body') : [];
    const others = saved.flatMap((f) => { const t = docxTable ? savedFlowText(f, docxTable.mask) : null; return t === null || !docxTable ? [] : [tagsBlanked(t, docxTable.table)]; });
    // the names the engine found only outside the body are masked names too (lib/side.ts): a
    // "Ms Marsh" in the body beside a letterhead's "Delia Marsh" is a piece of one
    return survivingFragments([plan.readable, ...others].join(`\n${TAG_BLANK}\n`), [...file.entities.filter((e) => !e.dead && !isFloorRow(e)), ...sideRowsOf(file)], fragmentTerms(file.entities, snap.terms));
  }, [plan, dryNow, docxTable, file?.entities, file?.side, snap.terms]);
  // What that check read, said wherever its result is (owner ruling 21): the receipt said "no
  // fragments of listed names survive" of every export, where the check reads words of text
  // only — the body as the copy and the .txt write it and, once the dry run wrote a .docx, that
  // file's other text parts, not its body and not its code — and never inside a plain word of
  // letters. The floors are FRAGMENT_SHORT, FRAGMENT_IN_TOKEN and the four-digit bound in
  // survivingFragments. FRAGMENT_STOP is skipped even where it is a surname, and fragHow names
  // it: with a row "Della Street", "Ms Street" in the copy is not flagged; a particle is not on
  // it ("The Van" is flagged for "Dick Van Dyke"); "Title, designator or particle" named neither
  // the codes nor Bank, Road, Street, Place and Avenue (D1J-F2, D1L-3, driven 2026-09-25). The
  // writer masks a watermark, a signature line's signer and a list's number text in place
  // (ATTR_MASK), outside report.flows, so the check never sees them: a header watermark "PREPARED
  // FOR MR KIERKEGAARD" beside a masked "Soren Kierkegaard" saved under "no partial name found"
  // where "every part … that holds text" said it was read (D1J-F1). survivingFragments reads a token
  // as an address, a handle or a tag only on a plain @ or # (its in-token test), so a full-width
  // "＠" or "＃" is prose to it and a piece of four or five letters there is not flagged (D1L-4).
  const fragDocx = !!(docxTable && dryNow?.report?.bytes);
  const fragWhere = fragDocx
    ? 'the copied text and the .txt, and the text of every other part of the saved .docx (a header, a footer, a note, a chart, SmartArt), as it saves them, but not text Word keeps as a setting in the code of the file (a watermark, the signer a signature line suggests, the text a list prints beside each number)'
    : 'the copied text and the .txt';
  const fragHow = 'each word of a row you masked or of a listed term, and each part of one joined by an apostrophe, a hyphen or a dot, save a word it skips as too common to stand for a name alone, even where it is a surname: a title such as Mr or Dr, a designator such as Inc, LLC or Group, a two-letter code such as US, UK, NA or SA, the words the, and, for and of, and Bank, Road, Street, Place and Avenue; each from four letters, from two where the name and the copy both write it with an upper-case first letter, or from four digits; found where a word breaks (a space, a punctuation mark, a digit, a superscript, an upper-case letter after a small one), through escapes, and from four letters inside an address, a path, or a handle or a tag written with a plain @ or #; never inside a plain word of letters';

  const divergence = rm?.divergence ?? null;
  const tablePlacements = rm?.placements.length ?? 0;
  const floorTags = rm ? rm.floorHits.filter((h) => !h.exempt).length : 0;
  const collapsed = rm?.collapsed ?? 0;
  const occ = tablePlacements + floorTags;

  if (!file || !file.entities || !plan) {
    return (
      <section className="screen">
        <h1>Export</h1>
        <p className="sub">Export opens after a review — drop a document and clear its entity table first.</p>
      </section>
    );
  }

  // Defense in depth: navigation is gated in App, but the screen itself also
  // refuses an unreviewed real file — the review IS the product's safety case.
  //
  // A file whose finish a later change took off (lib/attest.ts recheckFinish) HAS been
  // reviewed, and its note says what the change left readable. Until 2026-09-23 this screen
  // gave that lawyer the never-reviewed hold below and sent them to read the whole document
  // and its marks again, while the change that did it went unnamed here.
  if (!file.sample && !file.reviewed && file.reopened) {
    return (
      <section className="screen">
        <h1>Export</h1>
        <div className="sub">The review is the gate — nothing exports without your yes.</div>
        <div className="vrow" role="status" style={{ color: 'var(--amber)', alignItems: 'flex-start' }}><span style={{ lineHeight: 1.5 }}>⚠ <b>Changed since you finished — finish again.</b> {file.reopened} Open the review — the same note stands at the top of it — and press “{FINISH_LABEL}” at the foot of the list once what it names is settled.</span></div>
        {onReview && <div style={{ marginTop: 14 }}><button className="btn-red" onClick={onReview}>Open the review</button></div>}
      </section>
    );
  }
  if (!file.sample && !file.reviewed) {
    return (
      <section className="screen">
        <h1>Export</h1>
        <div className="sub">The review is the gate — nothing exports without your yes.</div>
        <div className="vrow" style={{ color: 'var(--amber)' }}>⚠ This document hasn’t been reviewed. Open the review, decide anything waiting on you, read the document and its marks, then press “{FINISH_LABEL}” at the foot of the list.</div>
        {onReview && <div style={{ marginTop: 14 }}><button className="btn-red" onClick={onReview}>Open the review</button></div>}
      </section>
    );
  }

  const kept = file.entities.filter((e) => !e.dead);
  const discarded = file.entities.filter((e) => e.dead);
  const floorRows = kept.filter(isFloorRow);
  const tableRows = kept.filter((e) => !isFloorRow(e));
  const floorTotal = file.entities.filter(isFloorRow).length;
  // "left visible" is MEASURED against the bytes, never assumed from the verdict: a
  // row you left readable can still be masked by the safety-net pattern (the receipt
  // used to list a phone as "left visible by your explicit decision" while the
  // export held [phone] where it stood). Only a discarded span that survives is
  // readable. What masks the others is read off the export's accounting (engine.ts
  // MaskedAnyway): all of them used to be put down to the safety-net pattern.
  const { stillIn, maskedAnyway } = plan;
  const junkVisible = stillIn.filter((e) => e.junk);
  const nameVisible = stillIn.filter((e) => !e.junk);
  // rows left readable that the export masks only IN PART: some of their words go with a name
  // kept masked, and the rest ship readable as the lawyer chose (engine.ts MaskedAnyway.partly)
  const partlyIn = maskedAnyway.filter((m) => m.by?.partly).map((m) => m.e);
  // THE FILENAME CHANNEL (2026-09-23). Every artefact on this page used to be named
  // `${file.name minus its extension}.redacted.txt`, and a firm's matter files are named
  // after the client: "Re Kowalczyk (minor) - care proceedings - statement of A Nowak.docx"
  // came out as "Re Kowalczyk (minor) - care proceedings - statement of A Nowak.redacted.txt".
  // The engine masked the body and the app then wrote the client's name, the child's name
  // and the cause of action on the envelope — the one field of a redacted document that no
  // redaction ever reads, and the field a mail client shows before anyone opens anything.
  // For this product that is the normal case, not an edge case.
  //
  // What replaces it still has to work in a Save dialog. A solicitor has to tell one
  // export from another in a folder, so the name carries a code: 7 base-36 characters,
  // RANDOM (engine.ts exportCode), drawn as `docCode` at the top of this component.
  //
  // Random because every code computed from the document was an oracle. The first version
  // hashed the original text (FNV-1a, 32 bits), on the reasoning that recomputing it "needs
  // the original document". It does not: the recipient holds the redacted copy, which is the
  // original with a few spans replaced by tags, so they can fill the tags with guesses, hash
  // each attempt, and compare. An adversarial pass on 2026-09-23 recovered both names of a
  // two-name cover letter from 4.5 million first-name × surname guesses in 18 seconds,
  // working only from the redacted .txt and the receipt. A code over the filename fails the
  // same way (the confirm-a-guess class WITHHELD.md refuses). The second version hashed the
  // redacted TEXT, on the reasoning that a recipient already holds it — true of the .txt and
  // false of the .docx, which removes what the text of record keeps: hidden runs and the
  // results of DOCPROPERTY/AUTHOR fields. From redacted-<code>.docx alone, a pass the same
  // day filled a "Our ref:" field result and a hidden "no less than 285,000" back in and
  // confirmed both — KOW/4471 and the client's settlement floor — in 406,909 guesses and
  // 273 ms. A random code is a function of nothing, so there is nothing to confirm.
  //
  // The cost, stated rather than hidden: the code names one visit to this page, not the
  // document. Every file saved from here carries the same code, so a receipt pairs with its
  // copy; change a decision in the review and the page draws a new code; export the same
  // redaction on another day and it gets another code and lands beside the first.
  //
  // The name is not hidden from the lawyer, only from the artefacts: it is printed on this
  // screen beside the codes (above the dock) and recorded in the JSON name key, the file
  // that is never meant to leave this machine.
  // ONE place builds the default names, so the line above the dock can print the names the
  // buttons actually pass instead of a restatement of them — the same rule the pass list
  // follows a few lines down (a canned restatement was the defect there too).
  const outName = (kind: string, ext: string) => `${kind}-${docCode}.${ext}`;

  // Verify-by-extraction, for real: every kept span re-checked against the
  // actual export bytes; PLUS the honest edge — fragments of kept names that
  // survive (bare "Hastings" when "Hastings Holdings Ltd" is kept). Fragments
  // are checked for the table's rows only — the safety-net rows are numbers.
  const { survivors, verified, incomplete, nothingKept, holds } = plan;
  // the fragments are `fragments`, asked above the early returns

  // The release gates (fail-closed), all decided in exportPlan: incomplete engine run, failed
  // extraction check, an export that would blank nothing while entities are marked, a mask
  // whose accounting did not reproduce the frozen core's own bytes, a declared term the export
  // would carry readable — and, decided here because the code is this page's own state, no
  // code to name the files by.
  const exportBlocked = plan.blocked || !docCode;
  // the declared terms the page is held on, by why (engine.ts listHolds) — each kind is told
  // apart on screen, because the third and the fourth override a choice the lawyer made
  const holdTerms = (why: ListHold['why']) => holds.filter((h) => h.why === why).map((h) => h.term);
  const heldNoRow = holdTerms('no-row');
  const heldForm = holdTerms('other-form');
  const heldVisible = holdTerms('left-visible');
  const heldInside = holds.filter((h) => h.why === 'inside');
  // A button is offered only where pressing it clears its hold. exportPlan asks that of a copy
  // of the table before the page draws (engine.ts pressLifts); and a term still held in any
  // render after its button was pressed gets no button again, whatever the plan said — five
  // causes of a press that changed nothing were found on one day (2026-09-23), and a lawyer
  // pressing a button that does nothing, again and again, is told nothing by it. Both kinds get
  // the statement of what to do instead (the held row below the others).
  const pressedKeys = pressed.id === file.id ? pressed.keys : [];
  const stuckKeys = new Set([...plan.stuck, ...holds.map((h) => h.term).filter((t) => pressedKeys.includes(termKey(t)))].map(termKey));
  const stuck = holds.filter((h) => stuckKeys.has(termKey(h.term))).map((h) => h.term);
  // a stuck term written only with a percent-escape that writes no character: "find it in the
  // document" does not find "René Tan" in "Ren%E9%20Tan", so the row says where it stands (P1-F5)
  const stuckEsc = holds.filter((h) => h.esc && stuckKeys.has(termKey(h.term)));
  const pressable = (terms: string[]) => terms.filter((t) => !stuckKeys.has(termKey(t)));
  const maskTerms = (terms: string[]) => {
    setPressed((p) => ({ id: file.id, keys: [...(p.id === file.id ? p.keys : []), ...terms.map(termKey)] }));
    onMaskTerms?.(terms);
  };
  // What a row left readable IS, in the words a hold uses for it: a term standing inside a phone
  // number or an address the lawyer left readable was said to stand inside "a name", and its
  // button read "Mask it inside that name" over a number (2026-09-23). By the row's own tag or
  // category, never guessed from its text.
  const nounOf = (text: string) => {
    const e = (file.entities ?? []).find((x) => x.dead && x.text === text);
    if (!e) return 'name';
    if (isFloorRow(e)) return e.tag === '[email]' ? 'address' : 'number';
    return e.cat === 'id' ? 'number' : e.cat === 'loc' ? 'address' : e.cat === 'contact' ? (e.cls === 'EMAIL' ? 'address' : 'number') : 'name';
  };
  /** "a name" / "names" / "a number and names" … for the rows `names`, with the demonstrative */
  const kindOf = (names: string[]) => {
    const ks = [...new Set(names.map(nounOf))];
    const plural = (k: string) => `${k}${k === 'address' ? 'es' : 's'}`;
    const art = (k: string) => (/^[aeiou]/.test(k) ? `an ${k}` : `a ${k}`);
    if (names.length === 1) return { a: art(ks[0]), that: `that ${ks[0]}`, the: `the ${ks[0]}`, it: 'it stays', one: true };
    const w = ks.length === 1 ? plural(ks[0]) : ks.map(plural).join(' and ');
    return { a: w, that: `those ${w}`, the: `the ${w}`, it: 'them stay', one: false };
  };
  // what the button does to a name the lawyer left readable, said before it is pressed: it masks
  // the term inside that name and leaves the rest of it readable (engine.ts ListHold.inside)
  const insideOf = (terms: string[]) => holds.filter((h) => terms.includes(h.term) && h.inside.length);
  const insideSaid = (terms: string[]) => {
    const hs = insideOf(pressable(terms));
    if (!hs.length) return null;
    const names = [...new Set(hs.flatMap((h) => h.inside))];
    const kd = kindOf(names);
    return <>{' '}Where {hs.length === 1 ? 'it stands' : 'they stand'} inside {kd.a} you left readable in the review — {hs.map((h) => <span key={h.term}><b>{h.term}</b> in <b>{h.inside.map((n) => `“${n}”`).join(', ')}</b>{' '}</span>)}— the button masks {hs.length === 1 ? 'it' : 'them'} there too, and the rest of {kd.that} {kd.one ? 'stays' : 'stay'} readable as you chose.</>;
  };
  // A term readable only IN PART (engine.ts ListHold.partly): where it stands, a name kept masked
  // or the safety-net pattern covers some of its words and the export carries the others. The
  // hold said "the copied text and the .txt would carry it readable" of "Tan Wei Ling" when they
  // would carry "Wei Ling"; each such term is marked where it is named, and the mark explained.
  const partlyKeys = new Set(holds.filter((h) => h.partly).map((h) => termKey(h.term)));
  const termSaid = (t: string) => (partlyKeys.has(termKey(t)) ? `${t} (in part)` : t);
  const partlySaid = (terms: string[]) => {
    const n = terms.filter((t) => partlyKeys.has(termKey(t))).length;
    if (!n) return null;
    return <>{' '}“In part”: where {n === 1 ? 'that term stands' : 'those terms stand'}, the export masks some of {n === 1 ? 'its' : 'their'} words — inside a name you kept masked, or by the safety-net pattern — and carries the rest readable; the list asks for all of {n === 1 ? 'it' : 'them'}.</>;
  };
  // a row the lawyer left readable while it sat under Protected terms, whose term is on the
  // list now: the review decided it with the list in view, so it governs — and the page says so
  const listKeys = new Set(snap.terms.map(termKey));
  const onList = (e: typeof stillIn[number]) => !e.junk && e.cat === 'protected' && listKeys.has(termKey(e.text));
  const listedVisible = nameVisible.filter(onList);
  // the same choice where a name kept masked covers some of the term's words and the rest ship
  // (partlyIn): the term is still on the list and still readable, in part. The key listed it as
  // "in part" with no mark and the receipt's count left it out (2026-09-23), so a key read later
  // said the list had no term in the copy.
  const listedPartly = partlyIn.filter(onList);
  const listedLeft = [...listedVisible, ...listedPartly];

  const failedLayers = file.completeBy ? Object.entries(file.completeBy).filter(([, ok]) => !ok).map(([k]) => k) : [];
  // why the run did not finish, and whether a new drop can change it (engine.ts unfinishedSaid):
  // after the frozen pipeline's tag alignment fails, "Re-drop the document to try again" sent the
  // lawyer round a loop that gives the same result (LAUNCH.md 4.11)
  const unfinished = unfinishedSaid(file.completeBy);

  // WHICH engine produced this table. The sample is excluded: its rows are a
  // fixed fixture list, not an engine run (see the sample warning below).
  const eng = file.sample ? null : engineIdentity(file.engineStats);
  // where the rows came from when no engine ran — counted, not assumed ("every row is one you
  // added by hand" was false the moment the safety-net pattern or the protected-term list
  // contributed a row)
  const originParts = (() => {
    const all = file.entities;
    const manual = all.filter((e) => e.prov === 'added by you').length;
    const floor = all.filter(isFloorRow).length;
    const prot = all.filter((e) => e.cat === 'protected' && !isFloorRow(e)).length;
    const rest = all.length - manual - floor - prot;
    return [
      manual ? `${manual} added by hand` : '',
      floor ? `${floor} from the safety-net pattern` : '',
      prot ? `${prot} protected term${prot === 1 ? '' : 's'}` : '',
      rest ? `${rest} of unrecorded origin` : '',
    ].filter(Boolean);
  })();
  // The pass list is a RECORD, not a restatement. The frozen pipeline's stages
  // are the ones it actually streamed (lib/engine.ts collects them); the in-app
  // core's layers are the keys of its own completeBy verdict. Neither is typed
  // out here — printing a canned list for whichever engine ran was the defect.
  const CORE_LAYER: Record<string, string> = {
    span: 'wide sweep', rails: 'name rails', battery: 'structural battery',
    residue: 'residue sweep', suspicion: 'suspicion scorer',
  };
  const coreLayers = file.completeBy ? Object.keys(file.completeBy).map((k) => CORE_LAYER[k] || k) : [];
  const passesLine = file.sample
    ? 'passes: fixed demo set — no engine ran'
    // `eng.frozen`, not an id equality: the firm doctrine reports itself as
    // 'v1-legal-frozen+firm', and an exact-match test printed the IN-APP CORE's pass list
    // on the receipt of a run the frozen service had streamed. The question this branch
    // asks is "did the service run", and `frozen` is that question.
    : eng?.frozen
      ? `passes: ${eng.stages.length ? eng.stages.join(' → ') : 'not recorded for this run'} (the stages the engine service streamed) — ${file.engineComplete ? 'tag alignment verified' : 'INCOMPLETE: tag alignment failed'}`
      : eng?.inAppCore
        ? `passes: ${coreLayers.join(' + ') || 'not recorded'} — ${file.engineComplete ? 'all complete' : `INCOMPLETE (${failedLayers.join(', ')})`}`
        : 'passes: none — no engine run is recorded for this document; this table is manual review only';

  // The doctrine the engine actually ran under, in the same idiom as the practice line
  // above. Three states, and the middle one is the reason this line exists at all: a
  // lawyer who set "Our own matter files" and got a fallback run has a document the
  // setting did not touch, and the receipt is the surface that outlives the banner.
  const stats = file.sample ? undefined : (file.engineStats as Record<string, unknown> | undefined);
  const ranProfile = typeof stats?.profileRan === 'string' ? (stats.profileRan as string) : null;
  const askedProfile = typeof stats?.profileAsked === 'string' ? (stats.profileAsked as string) : null;
  const profileLine = file.sample
    ? null
    : typeof stats?.profileNote === 'string'
      ? `document doctrine: NOT APPLIED — ${stats.profileNote}`
      : ranProfile === 'firm'
        ? 'document doctrine: your own matter files — company and brand names never released, reported case citations kept readable (set under Settings → Redaction → These documents)'
        : ranProfile === 'auto'
          ? 'document doctrine: general documents — the frozen default (set under Settings → Redaction → These documents)'
          : askedProfile
            ? `document doctrine: you chose “${askedProfile}”, and this run recorded no doctrine — treat it as not applied`
            : null;

  // Rows left readable that the export masks anyway, by what masks them (engine.ts
  // MaskedAnyway), one cause each: where a row is covered more than one way the first of
  // ANYWAY_ORDER is named. The receipt gets the counts only. A row masked anyway is a name the
  // export does NOT carry, and until 2026-09-23 the receipt printed it ("masked anyway by the
  // safety-net pattern: Kestrel"), handing the provider the client's name the copy withheld.
  // The names left visible are counted too, though the copy carries them: a name there beside
  // the list line below ("1 declared term is readable in this export because you left its
  // row visible") told the provider which readable word is on the firm's always-redact list,
  // the one thing about it the copy does not say. The Export screen names them.
  // The kept name is placed by how ITS OWN MATCH meets the row left readable (engine.ts
  // MaskedAnyway): 'within' — it holds it whole; 'part' — it stands inside it (the declared
  // "Kestrel" masked inside a "Kestrel Holdings Ltd" left readable, engine.ts ListHold.inside);
  // 'overlap' — the two share words and neither holds the other. Chosen by LENGTH until
  // 2026-09-23, a kept "Tan Wei Ling" was "a shorter name inside" a "Mrs Margaret Tan" left
  // readable, which it only shares "Tan" with; and the name was the placement's text, so a
  // remainder "Wei Ling" of a kept "Tan Wei Ling" was "another row of the same name".
  // Whether any of the row still ships is said apart from the cause (partlyIn), in the key too.
  const ANYWAY_ORDER = ['list', 'same', 'within', 'part', 'overlap', 'floor', 'absent', 'unmeasured'] as const;
  type Anyway = typeof ANYWAY_ORDER[number];
  const anywayOf = ({ by }: MaskedAnyway): Anyway => (!by ? 'unmeasured' : by.list ? 'list' : by.same ? 'same' : by.within.length ? 'within' : by.part.length ? 'part' : by.overlap.length ? 'overlap' : by.floor ? 'floor' : 'absent');
  const anyway = ANYWAY_ORDER.map((k) => ({ k, rows: maskedAnyway.filter((m) => anywayOf(m) === k) })).filter((g) => g.rows.length);
  const ANYWAY_COUNT: Record<Anyway, string> = {
    list: 'by another row of the same term on the always-redact list', same: 'by another row of the same name, kept masked',
    within: 'by a longer name kept masked', part: 'by a shorter name kept masked inside it', overlap: 'by a name kept masked that shares words with it',
    floor: 'by the safety-net pattern', absent: 'not found in the text as written', unmeasured: 'cause not measured',
  };
  const discardLine = discarded.length === 0
    ? 'nothing left visible'
    : `${stillIn.length} left visible${stillIn.length ? ` — ${junkVisible.length} boilerplate${nameVisible.length ? `, ${nameVisible.length} by your explicit decision, not named here` : ''}` : ''}${maskedAnyway.length ? ` · ${maskedAnyway.length} you left readable ${maskedAnyway.length === 1 ? 'is' : 'are'} masked anyway, not named here (${anyway.map((g) => `${g.rows.length} ${ANYWAY_COUNT[g.k]}`).join(', ')})${partlyIn.length ? `, ${maskedAnyway.length === 1 ? 'only' : `${partlyIn.length} of them only`} in part, the rest readable` : ''}` : ''}`;

  // SCOPE (container audit, 2026-07-25; revised 2026-09-16 when the .docx save
  // landed): the TEXT exports are rebuilt plain text and re-emit no container, which
  // is why no comment, tracked deletion or document property can ride along inside
  // them. That is no longer true of every button on this page — the .docx save writes
  // a container — so each sentence below names the path it describes. The flip side
  // holds for both: neither file is a substitute for the document, the formatted
  // original still sits on disk with all of it intact. Say both halves, and name the
  // channels this specific document actually has rather than a generic list.
  // the one main-flow predicate the store uses (lib/extract/docx.ts inMainFlow), so
  // this line can never name a channel the text of record actually includes
  const droppedKinds = file.docx ? droppedChannels(file.docx.items) : [];
  const KIND_WORD: Record<string, string> = {
    body: 'body text', deleted: 'tracked deletions', comment: 'comments', header: 'headers', footer: 'footers',
    footnote: 'footnotes', endnote: 'endnotes', properties: 'document properties',
    'alt-text': 'image alt-text', glossary: 'glossary entries', customXml: 'custom XML data',
    field: 'field codes', link: 'link targets', control: 'content-control entries', variable: 'document variables',
    people: 'reviewer names', task: 'assigned tasks', chart: 'chart text', diagram: 'SmartArt text',
    // the writer's two channels with no flow (docxWrite.ts ChannelReport): a tag written into a
    // style's or a font's name was reported as "1 in layout", and a part the writer does not know
    // as "other" — words that name nothing in Word
    layout: 'style, list, theme and font names', other: 'parts this writer does not know',
  };
  const droppedWords = droppedKinds.map((k) => KIND_WORD[k] || k);
  // The .docx save writes a REAL Word container (lib/extract/docxWrite.ts), so
  // "text only, nothing can hide inside it" is true of the clipboard and the .txt and
  // false of that file. `docxSave`, at the top of this component, is the predicate the
  // .docx button renders on, so no sentence here can outlive the path it describes.
  //
  // The always-redact list's rows the saved .docx actually CARRIES, and the parts it wrote
  // them into — read off the dry run's report (engine.ts channelWritten), so a key never
  // lists a term from the firm-wide list that this file does not contain (other clients'
  // codenames in this client's key), and never misses one the file does. A held .docx
  // carries nothing, and so lists nothing.
  const written = dryNow?.report?.bytes && docxTable ? channelWritten(docxTable.channel, dryNow.report.channels) : [];
  const channelRows = written.map((w) => w.e);
  // those the body export still carries, read off it by the plan (engine.ts bodyReadable): a
  // term run together inside a spelling of it left readable under Protected terms holds nothing,
  // and "none of it is readable in the copied text or the .txt" was printed over a .txt that
  // carried it (P1-F2, 2026-09-24)
  const channelReadable = channelRows.filter((e) => docxTable?.bodyReadable.includes(e.text));
  const writtenClear = written.filter((w) => !channelReadable.includes(w.e));
  const partsIn = (kinds: string[]) => { const w = [...new Set(kinds)].map((k) => KIND_WORD[k] || k); return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : w[0] ?? ''; };
  const channelWhere = partsIn(written.flatMap((w) => w.kinds));
  const clearWhere = partsIn(writtenClear.flatMap((w) => w.kinds));
  // the names the engine found only outside the body (lib/side.ts) whose tags the saved .docx
  // carries, read off the same dry run: the key reverses them as it reverses the table, and a
  // held .docx carries none of them, so lists none
  const sideWritten = dryNow?.report?.bytes && docxTable ? channelWritten(sideRowsOf(file), dryNow.report.channels) : [];
  const sideRows = sideWritten.map((w) => w.e);
  const sideWhere = partsIn(sideWritten.flatMap((w) => w.kinds));
  // the rows it minted over a choice to leave the term readable made before it was on the list
  // (engine.ts docxMaskTable `over`): the page says which choice the .docx went past, and where.
  // Not on a held page, as the receipt's line is not: nothing is saved from it, and while the
  // body export still carries a form of the term the .docx writes that row into the body as
  // well, so the note named "body text" among "the parts … the review never showed"
  // (2026-09-23). Once the hold is settled the note stands, and it is then true.
  const overWritten = docxTable && !holds.length ? written.filter((w) => docxTable.over.includes(w.e)) : [];
  const overClear = overWritten.filter((w) => writtenClear.includes(w));
  // the name key and the receipt wait for the dry run: until it reports, nobody knows which
  // of the list's tags the .docx carries
  const keyPending = docxSave && !!docxTable && !dryNow;
  const keyWait = keyPending || !docCode;
  const keyWaitWhy = !docCode ? 'No code to name the file by — see the checks above' : keyPending ? 'Waiting for the .docx check — the key lists the tags that file carries' : undefined;
  // The receipt describes an export and travels with it. While the list holds the page there
  // is no export to describe, and a receipt saved then said both that a declared term was
  // readable in the .txt and that none of it was (2026-09-23). The name key stays available:
  // it never leaves this machine, and a lawyer clearing the hold may want it.
  const receiptWait = keyWait || holds.length > 0;
  const receiptWhy = holds.length ? 'Held — a term on your always-redact list is readable in this export; there is no export yet for a receipt to describe' : keyWaitWhy;
  // What that writer actually does, read off lib/extract/docxWrite.ts rather than the
  // button's old title: KEEP_FIELD leaves page/TOC/numbering, STYLEREF, NOTEREF/PAGEREF and
  // SYMBOL fields live, and REMOVE_FIELD takes with what it showed an author, a user, a file
  // name, a template, a property (TITLE, SUBJECT, KEYWORDS, COMMENTS, DOCPROPERTY, INFO) and
  // text brought in from another file (INCLUDETEXT, INCLUDEPICTURE, LINK, DDE, IMPORT,
  // DATABASE). The sentence named only the first two until 2026-09-23, and its "other fields
  // ... written out as the text they showed" told a lawyer a TITLE field's text was in the
  // copy (P1T-3). renameRef renames every bookmark the author made; CORE_KEEP/APP_KEEP leave
  // the dates and four app flags plus the security level; LAYOUT_RE parts are walked and
  // renamed, not copied. The run-together reading is
  // refFind's, with RUN_FLOOR the floor owner ruling (1) has the receipt state: placeFlow and
  // maskValue mask it in text, and readOutput holds on it in the markup, where nsDecl, mcList
  // and qnameRead read declarations, compatibility lists and element and attribute names,
  // save KNOWN_NS. The word breaks are compactOf's cuts, every one: "an upper-case letter" read
  // as a break at each capital, and a row "Li Wu" is not found in "LIWUCORP", which has none
  // (P1T-6). In text textHolds (owner ruling 8) counts a find only at two breaks, before an
  // ending on a capitalised last word of three letters, at a LONG_FORM, or from RUN_FLOOR in a
  // JOINER token; "anywhere inside a word" with one short-word exception said "kestrelholdings"
  // was found in text, where it ships from the .docx and the .txt alike (measured 2026-09-24).
  // The digits reach (DIGIT_SEP, ruling 9) and pctRuns (ruling 10) are stated with where each
  // stops, because each widens what is masked and each edge ships: DIGIT_SEP (ruling 19b) takes
  // one \p{Zs} space or a tab, any \p{Pd} dash, ".", "/", U+2212, the middle dots U+00B7,
  // U+2024, U+2027, U+22C5, U+2E31, U+30FB and U+FF65, the bullets U+2022 and U+2219, and " - "
  // and ") " with a plain space only, so "3192,6819", "3192_6819", "3192  6819", a range
  // "3192 – 6819", "[3192] 6819", a no-break space in " - " or ") ", and the look-alikes it does
  // not list (U+2044, U+3002, U+FE52, U+2053, U+2796, U+02D7, U+25E6, U+25CF, U+2023, U+2028)
  // ship from both exports; "a dot" and "a bullet" said more than it takes (D1J-F3, D1L-2,
  // driven 2026-09-25); a reference by number is read with or without its semicolon and one by name only with
  // it, "&nbsp" aside (19d), so "&eacute Tan", "&NBSP;" (no name HTML defines) and "&amp;eacute;"
  // ship; a line break is read through only inside an escape or a gateway's wrapping in a link
  // with a scheme or "www." (LINK_BROKEN, ruling 17), so "Marg" / "aret%20Tan" ships, and never
  // where the next line starts with ">" as a quoted reply's does (BR and LINK_BROKEN take no quote
  // prefix: D1L-1, driven 2026-09-25, both exports ship verified). Each was
  // driven through the writer and the .txt on 2026-09-24 (D1, round 7), both exports alike. A
  // LONG_FORM find masks the whole written-out word (19a). The "does not do" list is what still
  // ships from the writer so driven: letters spaced apart or in brackets ("⒜", which symbolRead
  // leaves a symbol, as NFKD writes it "(a)"), a hyphen or a line break inside a word, a letter
  // symText reads as nothing (Symbol's Greek, some of it shaped as Latin letters are), an invisible
  // mark inside a word (U+200E, U+200F, U+202A to U+202E, U+2061 to U+2064, U+2066 to U+2069 and
  // U+180E ship from both exports; REF_INVISIBLE reads through U+00AD, U+200B to U+200D, U+2060
  // and U+FEFF only: D1J-F4, driven 2026-09-25), and a name
  // split across equation parts. The ligature came off when refFold took NFKD (19c). Its examples are
  // words no one is named by where that can be chosen ("XYZReport", "LIWUCORP", "Jpan", and
  // "draft", which was "marsh" until a row "Delia Marsh" put its own surname on the receipt): the
  // receipt carries no word of a name on 18g's tables, and "capital" and "Margaret Tan" failed
  // that. It cannot promise so of every table (it names Office, Corp and Inc), and it.html says
  // so (site-claims pins it). The limits are readOutput's modes: a value MACHINE or VOCAB
  // accepts, and a theme's script code (W-FID-4), is read 'run' and its mask hits count from six
  // characters, but for a row of two to five digits that is the whole value (SHORT_DIGITS,
  // ruling 19g), which holds save in an Office attribute or an officeMeasure element; the net's
  // hits on a MACHINE value between the tags of an Office element count where they take the whole
  // value (WHOLE_NET, 19f), so "<w14:x>123456789</w14:x>" holds and a telephone number in
  // wp:posOffset ships (measured 2026-09-24, D1 round 7); the safety-net
  // pattern counts on a 'text' reading, a font, a style, a number format's literals, a part
  // in `foreign`, and (ruling 11) attrNet and elemNet: an add-in's attribute or element text,
  // an unprefixed attribute on a w: element, and xml:/xsi:/xlink:/dc: outside ATTR_OWN. An
  // attribute nsOfName puts in an Office namespace (w:tel, w14:tel, tel on v:shape) is not
  // read, and "+65 6123 4567" there ships (measured 2026-09-24), so the sentence names it. An
  // unknown part is kept on the writer's `typed` rule, stated as the rule: typedValue reads
  // what schemaRest leaves of an address on SCHEMA's hosts word by word as an attribute's
  // value; between tags a small-letter surname after "http://purl.org/matters/" now holds
  // (scope-probe, 2026-09-24), and "kept between tags too" would tell the lawyer it ships.
  // Until the writer read past the host the sentence said "whatever follows", which 18t fails. Its markup is judged by
  // markupTyped, nameCode and listTyped, and an author or initials attribute holds (W-FID-1,
  // W-FID-8, W5R-5); the sentence said the part's element and attribute names were "kept
  // whatever they say" after that stopped being true, and 18t fails that too. The round-4
  // sentence said that namespace declarations and compatibility lists were not read, that a
  // run-together name was not looked for in text a reader sees, and that an unknown part
  // could keep a watermark's text — each false once the writer changed (W6-4, owner ruling 1,
  // W4-F1), and pinned in protected-terms 18t so it cannot come back. It travels with the
  // copy, so it may understate the writer and must never overstate the check.
  const docxScope = 'The redacted .docx is not text only: it is the original Word container rewritten in place. Formatting kept; tracked deletions removed and tracked insertions accepted; comments and the list of reviewers, hidden text, images, embedded files and objects, embedded fonts, macros and add-ins, alt-text (of images, shapes, text boxes and tables), link targets, custom properties and custom XML removed; shape names replaced with neutral ones, and every bookmark the author made renamed bm1, bm2 …; document properties removed apart from the created and modified dates, the language, the revision count and five Word-internal flags; page-number, table-of-contents and numbering fields (and a field that repeats a heading, refers to a page or a note, or shows a symbol) still live, a field that shows who wrote or last saved the file (or the user\'s name, initials or address), its file name or folder, its template or any of its properties (a title, a subject, keywords, comments) removed with what it showed, as is a field that brings in text, a picture or data from another file or program, and other fields (a cross-reference to text, a date, a merge field) written out as the text they showed; the style, list, theme and font parts kept, with a name in them renamed where it carries something masked; ' + sideScope(file.side, false) + '. In the text the writer masks and in the check below, a name from this table or your always-redact list is found with its words apart, as the table writes it, and also with nothing between them, in any case ("KestrelCapital", "kestrelcapital.com"): where it starts and ends at a place a word breaks (a space or a punctuation mark, where letters meet digits, where an upper-case letter follows a small one, either side of the last of a run of upper-case letters that a small letter follows, as "XYZReport" breaks after "XYZ" and "ISPs" only before its s, and either side of a Chinese, Japanese or Korean character; a word all in upper case, such as "LIWUCORP", has no break inside it, so a name of fewer than six letters is not found in it), and, from six letters and digits, anywhere inside a word, in the file\'s code. In the text a reader sees, where a find is masked rather than held, it is found only where such a break marks both its ends; at its end also before an ending s or es and then a break, when the name\'s last word has three letters or more and is written there with an upper-case first letter (es only after a name that ends in s, x, z, ch or sh); with the short designator it ends in written out (Co, Corp or Inc as Company, Corporation or Incorporated), where the whole word is masked with the name, so "XYZ Corporation" is written as the tag; and, from six letters and digits, inside a token that is not a word of prose (one with a digit in it, one with a dot, a slash, a backslash, a colon, an @, a # or an underscore between two letters or digits, or one that starts with an @ or a #, as a web or e-mail address, a path, a handle or a tag is written). Save for that designator, it is never found there inside a word of letters alone where nothing marks both its ends, so a name run into such a word is left readable and the check does not find it either; and a name found at a break or before an ending may stand inside a longer name, and is masked there. Six is a floor set by measurement: from fewer letters, a name read inside a word struck other words far more often. A name of digits alone is looked for this way only from six digits. From six, it is found wherever its digits stand together, inside a longer number, an account number or a reference too, and in the text a reader sees also across one mark that groups them: a space (any character Unicode counts as a space) or a tab, a full stop, a middle dot or the bullet ("•"), a slash, a hyphen or a dash (any character Unicode counts as a dash), the minus sign, a hyphen with a plain space either side (" - "), or a round closing bracket and one plain space after the first group, as an area code is written; grouped any other way (a comma, an underscore, a colon, two spaces, a line break, an en dash, an em dash or a slash with a space either side, as " – " writes a range, a square bracket, a no-break space beside a bracket or a hyphen, or a mark that only looks like one of those, such as a fraction slash, an ideographic or small full stop, a swung dash, a heavy minus sign, or a white, black or triangular bullet), it is not found, and the check does not find it either. A percent-escape, as a web address writes a space ("%20") or a letter, an escape escaped again ("%2520"), a "%u" escape, a character reference by number, with its semicolon or without it ("&#32;", "&#32"), or by a name HTML defines, with its semicolon ("&nbsp;", "&eacute;"; "&nbsp" without it too, but not another name without it, "&eacute", nor a name HTML does not define, "&NBSP;", nor a reference escaped again, "&amp;eacute;") and the escapes in a link a mail gateway rewrote (Proofpoint\'s) are read as the characters they write, in the text and in the file\'s code, and in the text a reader sees also across a line break a mail program\'s wrap put inside an escape or inside the gateway\'s own wrapping of the link, where the link starts with a scheme ("https:") or "www.": a name written with them is masked in the text a reader sees, the escapes with it, and holds the file in its code; an escape that writes no character, where a name could stand, holds the file. A line break so put is not read across where the line after it starts with a quote mark (">"), as each line of a quoted reply does, so a name broken there is not found, and the check does not find it either. The copied text and the .txt are held on such an escape too, written with "%" or as a mail gateway rewrote it (Proofpoint\'s "*E9" or "-E9"), save where a mail program\'s wrap put a line break just before such an escape or inside the escape after it: there neither the .docx nor the copied text and the .txt is held, and the name in the link ships readable. The app then reads the .docx it wrote — every part, each part\'s name, the text between its tags, every attribute value, the names of its elements and attributes, and the namespaces it declares or lists — and holds the file if such a name, other than one you chose to leave readable, is still readable in any of it, or the safety-net pattern still finds something it reads. A name in the file\'s own code that the writer neither masks nor renames (an attribute an add-in wrote, a namespace, an element\'s name) holds the file, and the hold says where. What that check does not do: in the parts Word writes, it does not read the name of an element or attribute under a namespace Office\'s file formats define, whatever that name says, or of an attribute with no prefix on one of Office\'s elements other than Word\'s own text markup (w:); it does not read the addresses those formats define, Word\'s built-in style names or the standard fonts; it does not read a name written with its letters spaced apart or each in brackets ("⒜⒝⒞"), with a hyphen inside one of its words (as text copied from a PDF keeps a line\'s break in "Hold-ings"), with a line break inside one of its words (as a mail program\'s wrap can put one in a link), or with an invisible mark that sets the direction or format of text inside one of its words (a left-to-right or right-to-left mark, as text pasted from a right-to-left document can carry; a zero-width space, joiner or non-joiner, a word joiner and a soft hyphen are read through), in the text a reader sees; it does not read a letter written as a symbol (Word\'s w:sym) in the Symbol font, which Word draws as a Greek letter, several of them shaped as Latin upper-case letters are, where a letter, a digit or an @ written as a symbol in a font that draws letters holds the file; and it does not find a name split between separate parts of an equation (a fraction\'s top and bottom, a base and its script, two cells of a matrix). Outside a part this writer does not know, in a number, a date, an id, a single code word that starts with a small letter (as Word writes "rId3" or "upperRoman"), a theme\'s four-letter code for a script ("Jpan", "Cyrl") or the name Word gives a watermark\'s shape, it counts a name only from six letters and digits, so a shorter one there is not found, alone or run together, save in a relationship\'s id that is not Word\'s "rId" and a number, and save a name of two to five digits that is the whole of such a value, which holds the file but in an attribute under one of Office\'s own prefixes or with no prefix on another of Office\'s elements, or in a drawing\'s position, size or share of the page; and the safety-net pattern reads the text between tags, the attribute values Word shows (a watermark, a form field\'s help text, a signature line), a font\'s or a style\'s name, a number format\'s printed text, an e-mail address in an attribute and, in every part, a value an add-in wrote: an attribute in a namespace Office\'s file formats do not define (an add-in\'s own, one with no prefix on an element of Word\'s own text markup, or one that XML, XML Schema, XLink or Dublin Core does not define under its prefix), the text of an element in such a namespace, and the address an add-in declares for its namespace. A telephone, card or identity number or an e-mail address found there holds the file. It reads no other value that is only a number, a date, an id or a code word, so such a number written into an attribute under one of Office\'s own prefixes, or with no prefix on another of Office\'s elements, is not found; written as digits alone between the tags of an element under one of Office\'s own namespaces that the writer does not mask as text, it holds the file where the pattern takes the whole of it (<w14:x>123456789</w14:x>), save in a drawing\'s position, size or share of the page (wp:posOffset), which the pattern does not read. A part this writer does not know is kept only when every value between its tags and in its attributes is a number, a date, an id, true or false, a single code word that carries no name as read above, such as "rId3" or "en-US" (in an attribute, also a plain lower-case word such as "note", or such words run together, as in "upperRoman"), the address a namespace declaration gives, an address on a host the file formats\' own addresses use (schemas.openxmlformats.org, schemas.microsoft.com, purl.org or www.w3.org, or a urn that begins schemas-microsoft-com: or microsoft.com/office/) whose every word after the host, but the words and version numbers the format\'s own addresses are made of, is a number, a date, an id, true or false or a code word as an attribute may hold one (so, in an attribute, "http://purl.org/matters/draft" is kept and "http://purl.org/matters/Draft" is not; between its tags a plain small-letter word there, or such words run together, holds the file, as it does standing alone), a name the writer renames wherever it stands (a font, a theme, a colour, a bookmark, a link to a place in the document, a form field\'s name, a chart\'s cell reference, a style Word defines), or a number format whose only printed characters are symbols; and only when the name of every element and attribute in it either belongs to a namespace Office\'s file formats define, where it is kept whatever it says, or is made of code words as an attribute may hold one, between its underscores, dots and hyphens (so <addin:note> is kept and <addin:Client> is not), when every prefix, on a name, in a namespace declaration or in a compatibility list, is the one Office writes for its namespace or such a code word, and when no attribute in it records an author or initials. Anything else in it, or a number the safety-net pattern masks anywhere in it, holds the file; what is kept is read by the check for the names above, run together or not (a name of digits alone under six digits only where it is the whole of a value, so a five-digit matter number inside a longer value there is not found), and its values by the safety-net pattern.';
  // This line goes into the RECEIPT, which travels with the redacted copy, so it says
  // "the original document" where it used to say the original's filename: a scope
  // sentence does not need the name to make its claim, and the name is the client's
  // (see the filename-channel comment above `docCode`). The on-screen twin of this
  // sentence, further down, still prints the name in full — that screen is the
  // lawyer's own machine, and there the name is the useful part.
  const scopeLine = file.docx
    ? `scope: the copied text and the saved .txt are BODY TEXT ONLY, rebuilt as plain text${droppedWords.length ? `; ${droppedWords.join(', ')} were read but are NOT in them` : ''}. The original document on your disk is unchanged and still contains them.${docxSave ? ` ${docxScope}` : ''}`
    : file.pdf
      ? `scope: PAGE TEXT ONLY, rebuilt as plain text — PDF metadata, annotations and any embedded files are NOT in this file. The original document on your disk is unchanged and still contains them.`
      : `scope: the document's text, rebuilt as a new plain-text file — no part of the original file is carried over.`;

  // The network window measured across THIS document's engine run. undefined =
  // no engine ran, and the receipt says "not measured" rather than printing a 0
  // that nothing counted. The two off-machine counts are never summed: one fetch
  // through lib/tauri.ts appears in both.
  const nr = file.sample ? undefined : file.netRun;
  const netOffAny = !!nr && (nr.offIssued > 0 || nr.offObserved > 0);
  // a destination list says how many it left out and whether the record behind it
  // was cut (audit B8: the old list was sliced at 24 and said nothing about it)
  const hostList = (w: NetWindow) => `${w.hosts.join(', ')}${w.hostsDropped ? ` and ${w.hostsDropped} more not listed` : ''}${w.hostsComplete ? '' : ' (record incomplete: the event log hit its cap)'}`;
  const netLine = !nr
    ? `network during this run: not measured — no engine run is recorded for this document`
    : netOffAny
      ? `network during this run: OFF-MACHINE — ${nr.offIssued} attempted at the app's own call site, ${nr.offObserved} recorded in this window's timeline${nr.hosts.length ? ` · destinations: ${hostList(nr)}` : ' · destinations not recorded'}`
      : nr.measured
        ? `network during this run: 0 requests off this machine (none at the app's call site, none in this window's timeline) · ${nr.localIssued} request(s) issued by the app on this machine · ${nr.localObserved} resource(s) recorded in this window's timeline${nr.hosts.length ? ` · destinations: ${hostList(nr)}` : ''}`
        : `network during this run: 0 requests off this machine at the app's own call site — this browser gave no resource timeline, so anything loaded outside that call site was NOT counted`;

  const receipt = [
    `Simpler Legal — redaction receipt`,
    // The receipt travels WITH the redacted copy to the model provider — it is an
    // exported artefact, not a local note — so it names the code and withholds the
    // filename for the same reason the .txt does. It still identifies the document: the
    // code is on every artefact of this export and in the name key that stays here.
    `file: redacted-${docCode} — the original filename is withheld from this receipt, which travels with the redacted copy; a firm's matter file is named after its client. Both name keys, which stay on this machine, record the original name against this code.`,
    `${kept.length} kept (${floorRows.length} by the safety-net pattern) · ${stillIn.length} left visible · ${occ} tags placed (${tablePlacements} from the table, ${floorTags} by the safety-net pattern; ${collapsed} adjacent duplicate${collapsed === 1 ? '' : 's'} merged)`,
    `safety-net tables: ${rm ? floorTablesLabel(rm.practice) : 'not run'} — set under Settings → Redaction → Practice`,
    ...(profileLine ? [profileLine] : []),
    discardLine,
    // how much of the table a human decided, and how many model-cleared candidates went out
    // readable without a decision — counts only, because this line travels
    receiptReviewLine(file.entities, !!file.reviewed, !!file.sample, file.suspects),
    divergence
      ? `mask check: FAILED — ${divergence}; the export is held and the counts above are unmeasured`
      : `mask check: the tag accounting above reproduced the frozen core's own mask byte for byte`,
    passesLine,
    scopeLine,
    // what the engine's separate read of the text outside the body did, in counts and places
    // only (lib/side.ts sideReceipt): a name found only in a letterhead is one the copy does
    // not carry, and this file travels with the copy
    ...(docxSave ? [sideReceipt(file.side, stats?.genre)].filter((l): l is string => !!l) : []),
    // the writer's own sentence for each thing the .docx lost whole or had renamed whatever it
    // said (docxWrite.ts notes, read off the dry run the receipt waits for): the recipient of
    // the copy is owed them as much as the lawyer who saved it. Printed as the writer wrote
    // them. This screen once rewrote the note on a part the writer does not know, matching the
    // writer's sentence by pattern; the writer changed the sentence, the pattern matched
    // nothing, and the rewrite said nothing while it still stood here. What a note may claim
    // of the check is the writer's to make true, where the check is (protected-terms 18t).
    ...(docxSave && dryNow?.report?.bytes && dryNow.report.notes.length ? [`redacted .docx: ${dryNow.report.notes.join(' ')}`] : []),
    // counts and never the terms: these lines travel, and the terms are the firm's secrets.
    // The first is why the page is held (the receipt button is held with it, so a saved
    // receipt never carries it beside the second); the second is read off the .docx the writer
    // made, and its last clause is what the list hold (engine.ts listHolds) checked — which is
    // why it is printed only when that check found nothing.
    ...(holds.length ? [`always-redact list: ${holds.length} declared term${holds.length === 1 ? ' is' : 's are'} readable in this export and not answered for by its table — every export is held until ${holds.length === 1 ? 'it is' : 'they are'} masked`] : []),
    // "with no row in the table" was true of these rows until a floor row, or a row left
    // readable before the list, could stand behind one (engine.ts docxMaskTable)
    // the rows the body export still carries are counted apart, read off it (P1-F2)
    ...(channelReadable.length && !holds.length ? [`always-redact list: ${channelReadable.length} declared term${channelReadable.length === 1 ? ' is' : 's are'} readable in the copied text and the .txt, written run together in a spelling you left readable under Protected terms in the review, and masked by the saved .docx with a row of the list's own, so the text exports and the .docx differ there`] : []),
    ...(writtenClear.length && !holds.length ? [`always-redact list: ${writtenClear.length} declared term${writtenClear.length === 1 ? ' is' : 's are'} masked by the saved .docx with a row of the list's own, in its ${clearWhere}${overClear.length ? ` (${overClear.length} of them left readable in the review before ${overClear.length === 1 ? 'it was' : 'they were'} on the list, a choice about the body, the one part the review shows)` : ''}; none of ${writtenClear.length === 1 ? 'it' : 'them'} is readable in the copied text or the .txt`] : []),
    ...(listedLeft.length ? [`always-redact list: ${listedLeft.length} declared term${listedLeft.length === 1 ? ' is' : 's are'} readable in this export${listedPartly.length ? (listedLeft.length === 1 ? ' (in part)' : ` (${listedPartly.length} of them in part)`) : ''} because you left ${listedLeft.length === 1 ? 'its row' : 'their rows'} visible in the review, where ${listedLeft.length === 1 ? 'it was' : 'they were'} marked as ${listedLeft.length === 1 ? 'a term' : 'terms'} from the list`] : []),
    verified ? `verify-by-extraction: none of the listed spans appear in the export` : `verify-by-extraction: FAILED — ${survivors.length} span(s) survived`,
    // counted, never listed: a piece printed here stands beside the words "partial name" in a
    // file that travels with the copy, which says of "Hastings" in the text that it is part
    // of a name the copy masks. The Export screen lists them.
    `${fragments.length ? `fragment check: ${fragments.length} partial name(s) of listed names may survive — not named here; the Export screen lists them.` : 'fragment check: no partial name of a listed name found.'} Read: ${fragWhere}, for ${fragHow}`,
    file.sample
      ? `engine: none — the sample's rows are a fixed demo set`
      : eng
        ? `engine: ${eng.label}${eng.detail ? ` — ${eng.detail}` : ''}`
        : `engine: none recorded — no engine ran for this document`,
    netLine,
    `network scope: counted inside this window only — its own requests and the scripts, styles, images and frames the browser loaded for it. Requests made from inside the app's background workers (PDF reading, the redaction worker), WebSocket connections, other processes, and any work handed to the app's Rust side are NOT in this count.`,
  ].join('\n');

  // The name key lists EVERY redaction in the file. The table's tags reverse
  // one-to-one; the safety-net pattern's tags are one per kind ([phone] for every
  // phone), so those lines say what was masked and how often — they cannot say
  // which [phone] is which.
  const FLOOR_NOTE = 'Safety-net pattern (structured floor) — ONE tag per kind; these lines cannot be reversed by tag alone';
  // the parts are the ones the writer reported writing these tags into, not a fixed list
  // ("headers, footers and footnotes" was printed over a watermark and a chart title too)
  const CHANNEL_NOTE = `Always-redact list — these tags appear only in the saved .docx (in its ${channelWhere}); the copied text and the .txt do not carry them`;
  // the engine's separate read of the text outside the body, and the parts the writer reported
  // writing these tags into; a tag a row of the body shares is in the copied text too
  const SIDE_NOTE = `Found by the engine only outside the body — the saved .docx is masked with these (its ${sideWhere} carry their tags); the copied text and the .txt are made from the body, where the app did not find them`;
  // The rows the lawyer left readable, named — in the key only (owner ruling, 2026-09-23). The
  // key never leaves this machine, and a lawyer answering for the copy later has to be able to
  // say which names it carries on purpose; the receipt, which travels, counts them and names
  // none (discardLine). stillIn, not every row switched off: a row the export masks anyway is
  // not readable, and a key that listed it as readable would be wrong about the copy.
  // A row the export masks only IN PART ships some of its words, as the lawyer chose, and a key
  // that listed only the rows readable whole said nothing of "Mrs Margaret" in "Mrs Margaret
  // [Person2]" (2026-09-23). Those are listed too, marked "in part".
  const LEFT_NOTE = 'these carry no tag: each is readable in the export, as the document writes it, at least once — whole, or where marked "in part", in the words a name you kept masked does not cover';
  const leftMarks = (e: typeof stillIn[number]) => [...(e.junk ? ['boilerplate'] : []), ...(listedLeft.includes(e) ? ['on your always-redact list'] : [])];
  const cheat = [
    // Which matter this key reverses. The saved files are named by code alone (THE FILENAME
    // CHANNEL, above), so a key saved only as .txt used to have no way to say what it
    // belongs to. The source name is safe here and nowhere else: this is the DO-NOT-SEND
    // file, and every name it reverses is already in it.
    `# document: ${docCode}`,
    `# source: ${file.name}`,
    '',
    ...tableRows.map((e) => `${e.tag}\t${e.text}`),
    ...(channelRows.length ? ['', `# ${CHANNEL_NOTE}`, ...channelRows.map((e) => `${e.tag}\t${e.text}`)] : []),
    ...(sideRows.length ? ['', `# ${SIDE_NOTE}`, ...sideRows.map((e) => `${e.tag}\t${e.text}\t${(e.found ?? []).join(', ')}`)] : []),
    ...(floorRows.length ? ['', `# ${FLOOR_NOTE}`, ...floorRows.map((e) => `${e.tag}\t${e.text}\t×${e.occ}`)] : []),
    ...(stillIn.length || partlyIn.length ? ['', '# Left readable by your decision', `# ${LEFT_NOTE}`, ...stillIn.map((e) => [e.text, ...leftMarks(e)].join('\t')), ...partlyIn.map((e) => [e.text, 'in part', ...leftMarks(e)].join('\t'))] : []),
  ].join('\n');
  const keyJson = JSON.stringify(
    {
      WARNING: 'This is the re-identification key. NEVER ship it with the redacted document.',
      // The name key is the one artefact that must never leave this machine — it exists to
      // reverse the redaction, and it lists every name in full — so the original filename
      // belongs HERE and nowhere else on the export path. `document` is the code the saved
      // artefacts are named after, and this pair is the whole map: it is what turns
      // redacted-<code>.txt back into the matter it came from.
      document: docCode,
      source: file.name,
      entities: tableRows.map((e) => ({ tag: e.tag, original: e.text, cls: e.cls ?? e.cat, src: e.src ?? e.prov })),
      ...(channelRows.length ? { channelNote: CHANNEL_NOTE, channel: channelRows.map((e) => ({ tag: e.tag, original: e.text })) } : {}),
      ...(sideRows.length ? { outsideBodyNote: SIDE_NOTE, outsideBody: sideRows.map((e) => ({ tag: e.tag, original: e.text, cls: e.cls ?? e.cat, foundIn: e.found ?? [] })) } : {}),
      floorNote: FLOOR_NOTE,
      floor: floorRows.map((e) => ({ tag: e.tag, original: e.text, occ: e.occ, kind: FLOOR_WORD[e.tag] ?? e.tag })),
      leftReadableNote: `Left readable by your decision — ${LEFT_NOTE}`,
      leftReadable: [...stillIn, ...partlyIn].map((e) => ({ original: e.text, cls: e.cls ?? e.cat, ...(partlyIn.includes(e) ? { inPart: true } : {}), ...(e.junk ? { boilerplate: true } : {}), ...(listedLeft.includes(e) ? { onAlwaysRedactList: true } : {}) })),
      floorTables: rm ? floorTablesLabel(rm.practice) : 'not run',
      counts: { tagsInFile: occ, fromTable: tablePlacements, fromFloor: floorTags, adjacentDuplicatesMerged: collapsed },
    },
    null, 2,
  );

  const doSave = async (name: string, contents: string, title?: string) => {
    setSaveError(null);
    try {
      const path = await saveTextFile(name, contents, title);
      if (path) setSaved(path);
    } catch (e: any) {
      // disk full, permission denied, path gone — say so, never silently nothing.
      // No advice is appended: the app cannot know which folder would work.
      setSaveError(`Couldn’t save the file: ${e?.message || e}`);
    }
  };

  // The redacted .docx: the original package rewritten in place by lib/extract/docxWrite
  // with THIS table (the same remask that made the text above), then re-walked; a leak
  // in the re-walk holds the file and the reason is printed here, not swallowed.
  const docxSummary = (r: WriteReport) => {
    const ch = Object.entries(r.channels).filter(([, v]) => v.masked).map(([k, v]) => `${v.masked} in ${KIND_WORD[k] || k}`);
    const rm = r.removed;
    const gone = [
      rm.deletions ? `${rm.deletions} tracked deletion${rm.deletions === 1 ? '' : 's'}` : '',
      rm.insertionsUnwrapped ? `${rm.insertionsUnwrapped} insertion${rm.insertionsUnwrapped === 1 ? '' : 's'} accepted` : '',
      rm.comments ? `${rm.comments} comment mark${rm.comments === 1 ? '' : 's'}` : '',
      rm.hiddenRuns ? `${rm.hiddenRuns} hidden run${rm.hiddenRuns === 1 ? '' : 's'}` : '',
      rm.fieldsUnlinked + rm.fieldsRemoved ? `${rm.fieldsUnlinked + rm.fieldsRemoved} field code${rm.fieldsUnlinked + rm.fieldsRemoved === 1 ? '' : 's'}` : '',
      rm.hyperlinks + rm.externalLinks ? `${rm.hyperlinks + rm.externalLinks} link target${rm.hyperlinks + rm.externalLinks === 1 ? '' : 's'}` : '',
      rm.controls ? `${rm.controls} content control${rm.controls === 1 ? '' : 's'}` : '',
      rm.images ? `${rm.images} image${rm.images === 1 ? '' : 's'} (not read)` : '',
      rm.objects ? `${rm.objects} embedded object${rm.objects === 1 ? '' : 's'}` : '',
      rm.altTexts ? `${rm.altTexts} alt-text${rm.altTexts === 1 ? '' : 's'}` : '',
      rm.names ? `${rm.names} shape or bookmark name${rm.names === 1 ? '' : 's'} (replaced)` : '',
      rm.styles ? `${rm.styles} style name${rm.styles === 1 ? '' : 's'} (renamed)` : '',
      rm.shapeCopies ? `${rm.shapeCopies} hidden cop${rm.shapeCopies === 1 ? 'y' : 'ies'} of a drawn shape` : '',
      rm.properties ? `${rm.properties} document propert${rm.properties === 1 ? 'y' : 'ies'}` : '',
      rm.chartValuesZeroed ? `${rm.chartValuesZeroed} chart value${rm.chartValuesZeroed === 1 ? '' : 's'} set to 0 (a number that placed)` : '',
    ].filter(Boolean);
    const outside = Object.keys(r.channels).filter((k) => !['body', 'properties', 'variable'].includes(k) && r.channels[k].chars > 0);
    // the parts whose text the engine read in its request apart from the body (lib/side.ts
    // sideOf sends each of these flows); style, list, theme and font names, and a part this
    // writer does not know, are never sent
    const readApart = file.side?.state === 'read' ? outside.filter((k) => SIDE_KINDS.includes(k)) : [];
    const unread = outside.filter((k) => !readApart.includes(k)).map((k) => KIND_WORD[k] || k);
    // r.notes is the writer's own sentence for each thing it removed whole or renamed whatever it
    // said (docxWrite.ts, step 8), printed as written. This line used to read the one warning
    // that said a chart kept its worksheet names; the writer stopped emitting it when it began
    // renaming them, and the page then said nothing about any of it.
    return `Saved the redacted .docx — ${ch.length ? ch.join(', ') : 'no tags'} written; removed ${gone.length ? gone.join(', ') : 'nothing'}; ${r.parts.dropped.length} part${r.parts.dropped.length === 1 ? '' : 's'} dropped; re-walk of the output: ${r.gate.parts} parts, ${r.gate.items} text items, and the check described above found nothing from this table readable in them.${readApart.length ? ` ${partsIn(readApart)} were read by the engine in a request of their own, apart from the body, and masked with this table, the names it found only there, your always-redact list and the safety-net pattern.` : ''}${unread.length ? ` ${unread.join(', ')} were NOT read by the engine — masked with this table, ${sideRowsOf(file).length ? 'the names it found only outside the body, ' : ''}your always-redact list and the safety-net pattern only.` : ''}${r.notes.length ? ` ${r.notes.join(' ')}` : ''}`;
  };
  const saveDocx = async () => {
    if (!file.bytes || !file.entities || !dryNow) return;
    setSaveError(null);
    setDocxNote(null);
    setDocxBusy(true);
    try {
      // the dry run's bytes: this table PLUS the always-redact list as read when the page
      // opened — the one export path whose container has parts outside the body (engine.ts
      // docxMaskTable says why the list rides here only), and the run the key describes
      if (dryNow.error) throw new Error(dryNow.error);
      const r = dryNow.report!;
      if (!r.bytes) { setDocxNote({ ok: false, text: `The redacted .docx was NOT written — ${r.held}` }); return; }
      const path = await saveBinaryFile(outName('redacted', 'docx'), r.bytes, 'Save the redacted .docx');
      if (path) { setSaved(path); setDocxNote({ ok: true, text: docxSummary(r) }); }
    } catch (e: any) {
      setSaveError(`Couldn’t write the redacted .docx: ${e?.message || e}`);
    } finally {
      setDocxBusy(false);
    }
  };

  // one clipboard road for the redacted text and both name keys — `what` names
  // the artefact in the confirmation, so "copied ✓" never floats free of its button
  const copyText = async (text: string, what: string) => {
    setSaveError(null);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API refused (focus/permission) — fall back to the old road
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch {
        setSaveError(`Couldn’t reach the clipboard for the ${what} — use its save button instead.`);
        return;
      }
    }
    setCopied(what);
    window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500);
  };

  return (
    <section className="screen">
      {onBack && <button className="btn-quiet backlink" onClick={onBack}>← Back to review</button>}
      <h1>Export</h1>
      <div className="sub">The redacted copy is the only file meant to leave this computer. The key that reverses it stays here — the two must never travel together.</div>

      <div className="funnel"><b>{file.entities.length} found{floorTotal ? ` (${floorTotal} by the safety-net pattern)` : ''}. You redacted {kept.length} of them — {occ} tag{occ === 1 ? '' : 's'} in this file.{discarded.length > 0 ? ` ${stillIn.length} left readable${maskedAnyway.length ? `, ${maskedAnyway.length} masked anyway` : ''}.` : ''}</b></div>
      {/* the old wording ("every name on your list is gone") contradicted the
          funnel's own "left visible" count one line above it */}
      <div className="vrow"><span className="ck">{verified ? '✓' : '✗'}</span> Double-checked: {verified
        ? `every name you chose to redact is gone from this copy${stillIn.length > 0 ? ` — the ${stillIn.length} you left readable ${stillIn.length === 1 ? 'is' : 'are'} still in it, on purpose` : ''}${maskedAnyway.length > 0 ? ` — ${maskedAnyway.length} you left readable ${maskedAnyway.length === 1 ? 'is' : 'are'} masked anyway, by what is said below` : ''}`
        // named, with the way through: a count alone held the file and left the lawyer to guess
        // which of the rows they kept was the one the mask missed
        : `${survivors.length === 1 ? 'a row' : `${survivors.length} rows`} you chose to redact ${survivors.length === 1 ? 'is' : 'are'} still readable in this copy, whole or in part — ${survivors.map((e) => e.text).join(', ')} — so the export is held. In Review, find ${survivors.length === 1 ? 'it' : 'each one'} in the document, select the whole word ${survivors.length === 1 ? 'it is' : 'each is'} written into and redact it.`
          // a search for the name does not find it written with a broken escape (engine.ts escaped)
          + (plan.escaped ? ` ${escapeWay(plan.escaped.name, plan.escaped.esc)}` : '')}</div>
      {fragments.length > 0 && (
        <div className="vrow" style={{ color: 'var(--amber)' }}>⚠ Partial names may survive: <b>{fragments.join(', ')}</b> — read the redacted copy once before sending. The check read {fragWhere}, for {fragHow}. It can only vouch for names on the list.</div>
      )}
      {!file.sample && (
        <div className="vrow">
          <span className="ck" style={{ color: eng ? 'var(--go)' : 'var(--mut)' }}>{eng ? '✓' : '·'}</span>
          {eng
            ? <span>Found by <b>{eng.short}</b>{eng.detail ? ` — ${eng.detail}` : ''} — the engine names itself; the app does not verify the pack behind it.</span>
            : <span>No engine run is recorded for this document — no row in this table came from an engine: {originParts.join(', ') || 'the table is empty'}.</span>}
        </div>
      )}
      {!file.sample && (
        !nr ? (
          <div className="vrow" style={{ color: 'var(--mut)' }}><span className="ck" style={{ color: 'var(--mut)' }}>·</span> Network during this run: not measured — no engine run is recorded for this document.</div>
        ) : netOffAny ? (
          <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>
            <span style={{ lineHeight: 1.5 }}>✗ Something went off this machine during this run: {nr.offIssued} attempted at the app’s own call site, {nr.offObserved} recorded in this window’s timeline{nr.hosts.length ? ` — ${hostList(nr)}` : ' — destinations not recorded'}.</span>
          </div>
        ) : nr.measured ? (
          <div className="vrow" style={{ alignItems: 'flex-start' }}>
            <span style={{ lineHeight: 1.5 }}><span className="ck">✓</span> Nothing left this machine during this document’s run — {nr.localObserved} resource(s) loaded locally{nr.hosts.length ? ` (${hostList(nr)})` : ''}. Counted inside this window: it cannot see the app’s background workers, other processes, or the Rust side.</span>
          </div>
        ) : (
          <div className="vrow" style={{ color: 'var(--amber)', alignItems: 'flex-start' }}>
            <span style={{ lineHeight: 1.5 }}>⚠ Network during this run: 0 requests off this machine at the app’s own call site — but this browser gave no resource timeline, so anything loaded outside that call site was not counted.</span>
          </div>
        )
      )}
      {(file.docx || file.pdf) && (
        // one flex child: .vrow is display:flex, so loose inline tags would each
        // become a column (found in the UX walkthrough — it rendered as a jumble)
        <div className="vrow" style={{ color: 'var(--amber)', alignItems: 'flex-start' }}>
          <span style={{ lineHeight: 1.5 }}>
            ⚠ <b>Copy redacted text</b> and <b>Save as file…</b> give you <b>text only</b>, typed out fresh, so nothing can hide inside them.
            {droppedWords.length
              ? ` The ${droppedWords.join(', ')} in this document were read and are not in them.`
              : file.pdf
                ? ' PDF metadata, annotations and any embedded files are not in them.'
                : ' The parts of this document outside its body text are not in them.'}
            {/* the receipt's docxScope, said to the lawyer: the same claims and the same limits
                on the check, and no claim the receipt does not make */}
            {docxSave && <> <b>Save redacted .docx…</b> writes a real Word container, so that sentence does not cover it. It keeps the formatting. It removes tracked deletions and accepts tracked insertions as plain text, and it removes comments and the list of reviewers, hidden text, images, embedded files and objects, embedded fonts, macros and add-ins, alt-text, link targets, custom properties, custom XML and every document property that carries a name, a path or a statistic, leaving the created and modified dates, the language, the revision count and five Word-internal flags. Shape names are replaced with neutral ones, and every bookmark the author made is renamed bm1, bm2 …. Page-number, table-of-contents and numbering fields stay live, as does a field that repeats a heading, refers to a page or a note, or shows a symbol. A field that shows who wrote or last saved the file (or the user’s name, initials or address), its file name or folder, its template or any of its properties (a title, a subject, keywords, comments) goes with what it showed, as does a field that brings in text, a picture or data from another file or program; other fields (a cross-reference to text, a date, a merge field) are written out as the text they showed. The style, list, theme and font parts stay, with a name in them renamed where it carries something masked. {sideScope(file.side, true)}. In the text it masks and in the check below, a name from your table or your always-redact list is found with its words apart, as your table writes it, and also with nothing between them, in any case (“KestrelCapital”, “kestrelcapital.com”): where it starts and ends at a place a word breaks (a space or a punctuation mark, where letters meet digits, where an upper-case letter follows a small one, either side of the last of a run of upper-case letters that a small letter follows, as “XYZReport” breaks after “XYZ” and “ISPs” only before its s, and either side of a Chinese, Japanese or Korean character; a word all in upper case, such as “LIWUCORP”, has no break inside it, so a name of fewer than six letters is not found in it), and, from six letters and digits, anywhere inside a word, in the file’s code. In the text a reader sees, where a find is masked rather than held, it is found only where such a break marks both its ends; at its end also before an ending s or es and then a break, when the name’s last word has three letters or more and is written there with an upper-case first letter (es only after a name that ends in s, x, z, ch or sh); with the short designator it ends in written out (Co, Corp or Inc as Company, Corporation or Incorporated), where the whole word is masked with the name, so “XYZ Corporation” is written as the tag; and, from six letters and digits, inside a token that is not a word of prose (one with a digit in it, one with a dot, a slash, a backslash, a colon, an @, a # or an underscore between two letters or digits, or one that starts with an @ or a #, as a web or e-mail address, a path, a handle or a tag is written). Save for that designator, it is never found there inside a word of letters alone where nothing marks both its ends, so a name run into such a word is left readable and the check does not find it either; and a name found at a break or before an ending may stand inside a longer name, and is masked there. Six is a floor set by measurement: from fewer letters, a name read inside a word struck other words far more often. A name of digits alone is looked for this way only from six digits. From six, it is found wherever its digits stand together, inside a longer number, an account number or a reference too, and in the text a reader sees also across one mark that groups them: a space (any character Unicode counts as a space) or a tab, a full stop, a middle dot or the bullet (“•”), a slash, a hyphen or a dash (any character Unicode counts as a dash), the minus sign, a hyphen with a plain space either side (“ - ”), or a round closing bracket and one plain space after the first group, as an area code is written; grouped any other way (a comma, an underscore, a colon, two spaces, a line break, an en dash, an em dash or a slash with a space either side, as “ – ” writes a range, a square bracket, a no-break space beside a bracket or a hyphen, or a mark that only looks like one of those, such as a fraction slash, an ideographic or small full stop, a swung dash, a heavy minus sign, or a white, black or triangular bullet), it is not found, and the check does not find it either. A percent-escape, as a web address writes a space (“%20”) or a letter, an escape escaped again (“%2520”), a “%u” escape, a character reference by number, with its semicolon or without it (“&amp;#32;”, “&amp;#32”), or by a name HTML defines, with its semicolon (“&amp;nbsp;”, “&amp;eacute;”; “&amp;nbsp” without it too, but not another name without it, “&amp;eacute”, nor a name HTML does not define, “&amp;NBSP;”, nor a reference escaped again, “&amp;amp;eacute;”) and the escapes in a link a mail gateway rewrote (Proofpoint’s) are read as the characters they write, in the text and in the file’s code, and in the text a reader sees also across a line break a mail program’s wrap put inside an escape or inside the gateway’s own wrapping of the link, where the link starts with a scheme (“https:”) or “www.”: a name written with them is masked in the text a reader sees, the escapes with it, and holds the file in its code; an escape that writes no character, where a name could stand, holds the file. A line break so put is not read across where the line after it starts with a quote mark (“&gt;”), as each line of a quoted reply does, so a name broken there is not found, and the check does not find it either. The copied text and the .txt are held on such an escape too, written with “%” or as a mail gateway rewrote it (Proofpoint’s “*E9” or “-E9”), save where a mail program’s wrap put a line break just before such an escape or inside the escape after it: there neither the .docx nor the copied text and the .txt is held, and the name in the link ships readable. The app then reads the .docx it wrote — every part, each part’s name, the text between its tags, every attribute value, the names of its elements and attributes, and the namespaces it declares or lists — and holds the file if such a name, other than one you chose to leave readable, is still readable in any of it, or the safety-net pattern still finds something it reads. A name in the file’s own code that the writer neither masks nor renames (an attribute an add-in wrote, a namespace, an element’s name) holds the file, and the hold says where. What that check does not do: in the parts Word writes, it does not read the name of an element or attribute under a namespace Office’s file formats define, whatever that name says, or of an attribute with no prefix on one of Office’s elements other than Word’s own text markup (w:); it does not read the addresses those formats define, Word’s built-in style names or the standard fonts; it does not read a name written with its letters spaced apart or each in brackets (“⒜⒝⒞”), with a hyphen inside one of its words (as text copied from a PDF keeps a line’s break in “Hold-ings”), with a line break inside one of its words (as a mail program’s wrap can put one in a link), or with an invisible mark that sets the direction or format of text inside one of its words (a left-to-right or right-to-left mark, as text pasted from a right-to-left document can carry; a zero-width space, joiner or non-joiner, a word joiner and a soft hyphen are read through), in the text a reader sees; it does not read a letter written as a symbol (Word’s w:sym) in the Symbol font, which Word draws as a Greek letter, several of them shaped as Latin upper-case letters are, where a letter, a digit or an @ written as a symbol in a font that draws letters holds the file; and it does not find a name split between separate parts of an equation (a fraction’s top and bottom, a base and its script, two cells of a matrix). Outside a part this writer does not know, in a number, a date, an id, a single code word that starts with a small letter (as Word writes “rId3” or “upperRoman”), a theme’s four-letter code for a script (“Jpan”, “Cyrl”) or the name Word gives a watermark’s shape, it counts a name only from six letters and digits, so a shorter one there is not found, alone or run together, save in a relationship’s id that is not Word’s “rId” and a number, and save a name of two to five digits that is the whole of such a value, which holds the file but in an attribute under one of Office’s own prefixes or with no prefix on another of Office’s elements, or in a drawing’s position, size or share of the page; and the safety-net pattern reads the text between tags, the attribute values Word shows (a watermark, a form field’s help text, a signature line), a font’s or a style’s name, a number format’s printed text, an e-mail address in an attribute and, in every part, a value an add-in wrote: an attribute in a namespace Office’s file formats do not define (an add-in’s own, one with no prefix on an element of Word’s own text markup, or one that XML, XML Schema, XLink or Dublin Core does not define under its prefix), the text of an element in such a namespace, and the address an add-in declares for its namespace. A telephone, card or identity number or an e-mail address found there holds the file. It reads no other value that is only a number, a date, an id or a code word, so such a number written into an attribute under one of Office’s own prefixes, or with no prefix on another of Office’s elements, is not found; written as digits alone between the tags of an element under one of Office’s own namespaces that the writer does not mask as text, it holds the file where the pattern takes the whole of it ({'<w14:x>123456789</w14:x>'}), save in a drawing’s position, size or share of the page (wp:posOffset), which the pattern does not read. A part this writer does not know is kept only when every value between its tags and in its attributes is a number, a date, an id, true or false, a single code word that carries no name as read above, such as “rId3” or “en-US” (in an attribute, also a plain lower-case word such as “note”, or such words run together, as in “upperRoman”), the address a namespace declaration gives, an address on a host the file formats’ own addresses use (schemas.openxmlformats.org, schemas.microsoft.com, purl.org or www.w3.org, or a urn that begins schemas-microsoft-com: or microsoft.com/office/) whose every word after the host, but the words and version numbers the format’s own addresses are made of, is a number, a date, an id, true or false or a code word as an attribute may hold one (so, in an attribute, “http://purl.org/matters/draft” is kept and “http://purl.org/matters/Draft” is not; between its tags a plain small-letter word there, or such words run together, holds the file, as it does standing alone), a name the writer renames wherever it stands (a font, a theme, a colour, a bookmark, a link to a place in the document, a form field’s name, a chart’s cell reference, a style Word defines), or a number format whose only printed characters are symbols; and only when the name of every element and attribute in it either belongs to a namespace Office’s file formats define, where it is kept whatever it says, or is made of code words as an attribute may hold one, between its underscores, dots and hyphens (so {'<addin:note>'} is kept and {'<addin:Client>'} is not), when every prefix, on a name, in a namespace declaration or in a compatibility list, is the one Office writes for its namespace or such a code word, and when no attribute in it records an author or initials. Anything else in it, or a number the safety-net pattern masks anywhere in it, holds the file; what is kept is read by the check for the names above, run together or not (a name of digits alone under six digits only where it is the whole of a value, so a five-digit matter number inside a longer value there is not found), and its values by the safety-net pattern. Open it in Word once before you send it.</>}
            {' '}The original <b>{file.name}</b> on your disk is untouched and still contains everything.{' '}
            <b>Send a redacted copy, never the original.</b>
          </span>
        </div>
      )}
      {nameVisible.length > 0 && (
        <div className="vrow" style={{ color: 'var(--amber)', alignItems: 'flex-start' }}><span style={{ lineHeight: 1.5 }}>⚠ You chose to leave {nameVisible.length} visible: <b>{nameVisible.map((e) => e.text).join(', ')}</b>{listedVisible.length > 0 && <>. {listedVisible.length === 1 ? 'One is a term' : `${listedVisible.length} are terms`} on your always-redact list, left readable while {listedVisible.length === 1 ? 'it sat' : 'they sat'} under Protected terms: <b>{listedVisible.map((e) => e.text).join(', ')}</b>. That choice stands for this document only.</>}</span></div>
      )}
      {maskedAnyway.length > 0 && (
        <div className="vrow" style={{ color: 'var(--amber)', alignItems: 'flex-start' }}><span style={{ lineHeight: 1.5 }}>⚠ {maskedAnyway.length} you left readable {maskedAnyway.length === 1 ? 'is' : 'are'} masked anyway.{anyway.map(({ k, rows }) => {
          const names = rows.map((m) => m.e.text).join(', ');
          const said = k === 'list' ? <>By another row of the same term on your always-redact list, which masks it in every form: <b>{names}</b>. To leave one readable, leave every row of that term visible.</>
            : k === 'same' ? <>By another row of the same name that you kept masked: <b>{names}</b>. To leave one readable, leave that row visible too.</>
            : k === 'within' ? <>By a longer name you kept masked, as part of it or as its short form: <b>{rows.map((m) => `${m.e.text} (by “${m.by!.within.join('”, “')}”)`).join(', ')}</b>. To leave one readable, narrow or leave visible the name that covers it.</>
            : k === 'part' ? <>By a shorter name you kept masked that stands inside it: <b>{rows.map((m) => `${m.e.text} (by “${m.by!.part.join('”, “')}”)`).join(', ')}</b>. To leave all of one readable, leave the name inside it visible too, or take it off the always-redact list in Settings if it is on it.</>
            : k === 'overlap' ? <>By a name you kept masked that shares words with it, neither holding the other: <b>{rows.map((m) => `${m.e.text} (by “${m.by!.overlap.join('”, “')}”)`).join(', ')}</b>. The words they share go with the name you kept; to leave all of one readable, leave that name visible too.</>
            : k === 'floor' ? <>By the safety-net pattern: <b>{names}</b>. To leave one readable, ignore the safety-net row that covers it in the review as well.</>
            : k === 'absent' ? <>Not found in the text as written, so there is nothing of {rows.length === 1 ? 'it' : 'them'} to leave readable: <b>{names}</b>.</>
            : <>What masks {rows.length === 1 ? 'it' : 'them'} is not measured, because the mask accounting failed (below): <b>{names}</b>.</>;
          return <span key={k}> {said}</span>;
        })}{partlyIn.length > 0 && <> Masked only in part — the rest of {partlyIn.length === 1 ? 'it is' : 'each is'} readable in the export, as you chose, and the name key lists {partlyIn.length === 1 ? 'it' : 'them'} with the rows left readable: <b>{partlyIn.map((e) => e.text).join(', ')}</b>.{listedPartly.length > 0 && <> {listedPartly.length === 1 ? (partlyIn.length === 1 ? 'It is a term' : 'One is a term') : `${listedPartly.length} are terms`} on your always-redact list, left readable while {listedPartly.length === 1 ? 'it sat' : 'they sat'} under Protected terms: <b>{listedPartly.map((e) => e.text).join(', ')}</b>. That choice stands for this document only.</>}</>}</span></div>
      )}
      {file.sample && <div className="vrow" style={{ color: 'var(--amber)' }}>⚠ Sample document — entities come from the demo set</div>}
      {incomplete && <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>✗ The engine run did not finish — {unfinished.why} — so the export is held. {unfinished.again ? 'Dropping the document again runs the engine on it again from the start.' : 'Dropping the same document again is not expected to change this: the frozen pipeline reads the same text the same way.'}</div>}
      {nothingKept && <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>✗ Nothing is kept — this export would leave every found name visible. Go back to the review and redact them again first.</div>}
      {heldNoRow.length > 0 && (
        <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>
          <span style={{ lineHeight: 1.5 }}>
            ✗ {heldNoRow.length === 1 ? 'A term' : `${heldNoRow.length} terms`} on your always-redact list {heldNoRow.length === 1 ? 'is' : 'are'} readable in this document and {heldNoRow.length === 1 ? 'has' : 'have'} no row in its table: <b>{heldNoRow.map(termSaid).join(', ')}</b>. Either the list gained {heldNoRow.length === 1 ? 'it' : 'them'} after this document was read, or {heldNoRow.length === 1 ? 'its row was' : 'their rows were'} widened or removed in the review; the copied text and the .txt would carry {heldNoRow.length === 1 ? 'it' : 'them'} readable. The export is held.
            {partlySaid(heldNoRow)}
            {insideSaid(heldNoRow)}
            {onMaskTerms && pressable(heldNoRow).length > 0 && <>{' '}<button className="btn-quiet" style={{ textDecoration: 'underline' }} onClick={() => maskTerms(pressable(heldNoRow))}>Mask {pressable(heldNoRow).length === 1 ? 'it' : 'them'} in this document</button></>}
          </span>
        </div>
      )}
      {heldForm.length > 0 && (
        <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>
          <span style={{ lineHeight: 1.5 }}>
            ✗ {heldForm.length === 1 ? 'A term' : `${heldForm.length} terms`} on your always-redact list {heldForm.length === 1 ? 'is' : 'are'} masked where this document’s table has {heldForm.length === 1 ? 'it' : 'them'}, and still readable where this document writes {heldForm.length === 1 ? 'it' : 'them'} another way — the other apostrophe, a non-breaking or soft hyphen, different spacing: <b>{heldForm.map(termSaid).join(', ')}</b>. A term on the list when a document is read is masked in every form{pressable(heldForm).length > 0 ? '; the button does that here' : ''}. The export is held.
            {partlySaid(heldForm)}
            {insideSaid(heldForm)}
            {onMaskTerms && pressable(heldForm).length > 0 && <>{' '}<button className="btn-quiet" style={{ textDecoration: 'underline' }} onClick={() => maskTerms(pressable(heldForm))}>Mask {pressable(heldForm).length === 1 ? 'it' : 'them'} in every form</button></>}
          </span>
        </div>
      )}
      {heldVisible.length > 0 && (
        <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>
          <span style={{ lineHeight: 1.5 }}>
            ✗ You left {heldVisible.length === 1 ? 'a term' : `${heldVisible.length} terms`} readable in the review that {heldVisible.length === 1 ? 'is' : 'are'} on your always-redact list: <b>{heldVisible.map(termSaid).join(', ')}</b>. {heldVisible.length === 1 ? 'It was' : 'They were'} not under Protected terms when you made that choice, so the choice is not taken as one about the list, and the export is held rather than decide it for you.{pressable(heldVisible).length > 0 && <> The button masks {heldVisible.length === 1 ? 'it' : 'them'} in every form, and so masks the {heldVisible.length === 1 ? 'row' : 'rows'} you left readable too.</>}
            {partlySaid(heldVisible)}
            {insideSaid(heldVisible)}
            {onMaskTerms && pressable(heldVisible).length > 0 && <>{' '}<button className="btn-quiet" style={{ textDecoration: 'underline' }} onClick={() => maskTerms(pressable(heldVisible))}>Mask {pressable(heldVisible).length === 1 ? 'it' : 'them'} in this document</button>.</>}
            {/* "mask it first" names the button; with none on the page the held row below says what to do */}
            {pressable(heldVisible).length > 0 && <>{' '}To keep {heldVisible.length === 1 ? 'it' : 'them'} readable here, mask {heldVisible.length === 1 ? 'it' : 'them'} first, then in the review choose Leave visible on every row of {heldVisible.length === 1 ? 'it' : 'them'}, now under Protected terms, and press “{FINISH_LABEL}” again.</>}
          </span>
        </div>
      )}
      {heldInside.length > 0 && (() => {
        const names = [...new Set(heldInside.flatMap((h) => h.inside))];
        const one = heldInside.length === 1;
        const kd = kindOf(names);
        const go = pressable(heldInside.map((h) => h.term));
        return (
          <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>
            <span style={{ lineHeight: 1.5 }}>
              ✗ {one ? 'A term' : `${heldInside.length} terms`} on your always-redact list {one ? 'is' : 'are'} readable in this document only inside {kd.a} you left readable in the review: {heldInside.map((h, i) => <span key={h.term}>{i ? ', ' : ''}<b>{termSaid(h.term)}</b> in <b>{h.inside.map((n) => `“${n}”`).join(', ')}</b></span>)}. That choice was about {kd.the}, not about {one ? 'a term' : 'terms'} on your list, so it is not taken as one, and the export is held rather than decide it for you.{go.length > 0 && <> The button masks {one ? 'the term' : 'the terms'} inside {kd.that}, and the rest of {kd.it} readable as you chose.</>} To keep {kd.the} readable whole, take {one ? 'the term' : 'the terms'} off the always-redact list in Settings; coming back to this page reads the list again.
              {partlySaid(heldInside.map((h) => h.term))}
              {onMaskTerms && go.length > 0 && <>{' '}<button className="btn-quiet" style={{ textDecoration: 'underline' }} onClick={() => maskTerms(go)}>Mask {go.length === 1 ? 'it' : 'them'} inside {kd.that}</button></>}
            </span>
          </div>
        );
      })()}
      {stuck.length > 0 && (
        <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>
          <span style={{ lineHeight: 1.5 }}>
            ✗ Masking {stuck.length === 1 ? 'it' : 'them'} as a term from this page would leave {stuck.length === 1 ? 'it' : 'them'} readable, so this page offers no button for <b>{stuck.join(', ')}</b>. What you can do: open the review, find {stuck.length === 1 ? 'it' : 'each one'} in the document, select the whole word {stuck.length === 1 ? 'it is' : 'each is'} written into and redact it; or take {stuck.length === 1 ? 'it' : 'them'} off the always-redact list in Settings, which leaves {stuck.length === 1 ? 'it' : 'them'} readable in this document. Coming back to this page reads the table and the list again.
            {stuckEsc.map((h) => ` ${escapeWay(h.term, h.esc!)}`).join('')}
            {onReview &&<>{' '}<button className="btn-quiet" style={{ textDecoration: 'underline' }} onClick={onReview}>Open the review</button></>}
          </span>
        </div>
      )}
      {overWritten.length > 0 && (
        <div className="vrow" style={{ color: 'var(--amber)', alignItems: 'flex-start' }}>
          <span style={{ lineHeight: 1.5 }}>
            ⚠ You left {overWritten.length === 1 ? 'a term' : `${overWritten.length} terms`} on your always-redact list readable in the review before {overWritten.length === 1 ? 'it was' : 'they were'} on the list: <b>{overWritten.map((w) => `${w.e.text} (masked in the .docx’s ${partsIn(w.kinds)})`).join(', ')}</b>. That choice was about the body, the one part of the document the review shows, and the copied text and the .txt, which are made from the body alone, stand as the review left them. The saved .docx masks {overWritten.length === 1 ? 'it' : 'them'} in the parts named, which the review never showed. To leave {overWritten.length === 1 ? 'it' : 'them'} readable there too, take {overWritten.length === 1 ? 'it' : 'them'} off the always-redact list in Settings; coming back to this page reads the list again.
          </span>
        </div>
      )}
      {codeError && <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>✗ No code could be drawn to name the saved files ({codeError}), so the export is held rather than named after anything in the document.</div>}
      {divergence && <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>✗ The mask accounting failed: {divergence}. The export is held and no count on this page is measured. Re-drop the document; if this repeats, the fault is in the app, not in your review.</div>}
      {file.entities.length === 0 && red === file.text && <div className="vrow" style={{ color: 'var(--amber)' }}>⚠ Nothing is marked yet — this export is byte-identical to the original document</div>}

      <div className="paperlet">
        <h4>Receipt</h4>
        <div className="rrow"><b>{kept.length} kept</b><span>{tableRows.length} from the table · {floorRows.length} by the safety-net pattern · {occ} tag{occ === 1 ? '' : 's'} placed ({tablePlacements} from the table, {floorTags} safety-net{collapsed ? `, ${collapsed} adjacent duplicate${collapsed === 1 ? '' : 's'} merged` : ''})</span></div>
        <div className="rrow"><b>{stillIn.length} left visible</b><span>{discarded.length ? `${junkVisible.length} boilerplate${nameVisible.length ? ` · ${nameVisible.length} by your explicit decision` : ''}${maskedAnyway.length ? ` · ${maskedAnyway.length} masked anyway` : ''}` : 'everything found stays redacted'}</span></div>
        <div className="rrow"><b>{verified ? 'Verified' : 'NOT verified'}</b><span>export re-checked by extraction; original file untouched</span></div>
        <div className="rrow"><b>Engine</b><span>{file.sample ? 'none — fixed demo set' : eng ? `${eng.short}${eng.detail ? ` · ${eng.detail}` : ''} · self-reported` : `none recorded — ${originParts.join(', ') || 'empty table'}`}</span></div>
        <div className="rrow"><b>Network</b><span>{!nr
          ? 'not measured for this document'
          : netOffAny
            ? 'OFF-MACHINE request(s) recorded — see above'
            : nr.measured
              ? `0 off this machine during this run · ${nr.localObserved} loaded locally`
              : '0 off-machine at the app’s call site · window timeline unavailable'}</span></div>
        <div style={{ marginTop: 8 }}>
          <button className="btn-quiet" style={{ textDecoration: 'underline' }} disabled={receiptWait} title={receiptWhy} onClick={() => doSave(outName('receipt', 'txt'), receipt)}>Export receipt</button>
        </div>
      </div>

      {/* The filename channel, in plain words, immediately above the buttons that open the
          Save dialog — a lawyer who is told this AFTER the dialog has already saved the
          name. The names here are built by the same outName() the buttons pass, so this
          line cannot drift from what the dialog actually offers. The original name is
          printed HERE because this screen is on the lawyer's own machine: it is the one
          place where showing it costs nothing and where they need it to know which
          document they are about to send. */}
      <div className="vrow" style={{ color: 'var(--mut)', alignItems: 'flex-start' }}>
        <span style={{ lineHeight: 1.5 }}>
          <span className="ck" style={{ color: 'var(--mut)' }}>·</span> The saved files are offered as <b>{outName('redacted', 'txt')}</b>, {docxSave && <><b>{outName('redacted', 'docx')}</b>, </>}<b>{outName('receipt', 'txt')}</b> and the two name keys, <b>{outName('DO-NOT-SEND-namekey', 'txt')}</b> and <b>{outName('DO-NOT-SEND-namekey', 'json')}</b> — named after this document’s code, not after <b>{file.name}</b>, because a matter file is named after its client and a filename is the one part of a document that redaction never reaches. The code is random, drawn when this page opened and taken from nothing in the document, so it tells a recipient nothing; every file saved from this page carries it, a changed redaction gets a new one, and both name keys record the original name against it. If you rename a file, keep the client’s name out of the name of anything you send.
        </span>
      </div>

      <div className="exportdock" style={{ justifyContent: 'flex-start', gap: 10, alignItems: 'center' }}>
        <button className="btn-red" disabled={exportBlocked} title={exportBlocked ? 'Held — see the checks above' : 'Copy the redacted text — ready to paste into any AI'}
          onClick={() => copyText(red, 'redacted text')}>{copied === 'redacted text' ? 'Copied ✓ — paste it anywhere' : 'Copy redacted text'}</button>
        <button className="btn-plain" disabled={exportBlocked} title={exportBlocked ? 'Held — see the checks above' : undefined}
          onClick={() => doSave(outName('redacted', 'txt'), red, 'Save the redacted copy')}>Save as file…</button>
        {docxSave && (
          <button className="btn-plain" disabled={exportBlocked || docxBusy || !dryNow || !docxReady} title={exportBlocked ? 'Held — see the checks above' : !dryNow ? 'Writing and re-checking the .docx…' : !docxReady ? 'The .docx was not written — the reason is below these buttons' : 'The original Word file rewritten with this table: formatting kept; tracked deletions, comments, hidden text, images and most document properties removed; tracked insertions accepted; page-number and table-of-contents fields stay live; ' + (file.side?.state === 'read'
            ? 'headers, footers and footnotes are masked with this table, the names the engine found only there, your always-redact list and the safety-net pattern'
            : file.side?.state === 'none'
              ? 'headers, footers and footnotes, where it has any, are masked with this table, your always-redact list and the safety-net pattern'
              : 'headers, footers and footnotes are masked with this table, your always-redact list and the safety-net pattern only')}
            onClick={saveDocx}>{docxBusy ? 'Saving…' : !dryNow ? 'Checking the .docx…' : !docxReady ? '.docx held — see why below' : 'Save redacted .docx…'}</button>
        )}
      </div>
      {/* A dry run that wrote nothing says so before any press, in the words the press would
          print: the button stayed open over a held run until 2026-09-24, and the reason and its
          way through came only after the lawyer pressed a save that could not happen. */}
      {docxSave && dryNow && !docxReady && <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>{'✗ '}{dryNow.error ? `Couldn’t write the redacted .docx: ${dryNow.error}` : `The redacted .docx was NOT written — ${dryNow.report?.held}`}</div>}
      {docxNote && <div className="vrow" style={docxNote.ok ? { color: 'var(--go)' } : { color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>{docxNote.ok ? '✓ ' : '✗ '}{docxNote.text}</div>}

      {/* One artefact, one name. This used to be called a "cheat sheet" — the
          friendliest label in the app on the file that reverses every redaction
          — while the JSON it writes calls itself "the re-identification key".
          Named referent first, danger before the buttons, DO-NOT-SEND on disk. */}
      <div className="keynote" style={{ marginTop: 14 }}>
        <b>⚠</b>
        <span>
          <b>The two name keys below list every redaction in this document.</b> The table's tags reverse
          one-to-one; the safety-net lines are one tag per kind and cannot be reversed by tag alone. Keep
          them on this computer — never attach either one to the redacted copy.{' '}
          <button className="btn-quiet" style={{ textDecoration: 'underline' }} disabled={keyWait} title={keyWaitWhy} onClick={() => doSave(outName('DO-NOT-SEND-namekey', 'txt'), cheat, 'Save the name key (keep private)')}>Name key (.txt)</button>
          {' ('}<button className="btn-quiet" style={{ textDecoration: 'underline' }} disabled={keyWait} title={keyWaitWhy} onClick={() => copyText(cheat, 'name key (.txt)')}>{copied === 'name key (.txt)' ? 'copied ✓' : 'copy'}</button>{')'}
          {' · '}
          <button className="btn-quiet" style={{ textDecoration: 'underline' }} disabled={keyWait} title={keyWaitWhy} onClick={() => doSave(outName('DO-NOT-SEND-namekey', 'json'), keyJson, 'Save the name key (keep private)')}>Name key (.json)</button>
          {' ('}<button className="btn-quiet" style={{ textDecoration: 'underline' }} disabled={keyWait} title={keyWaitWhy} onClick={() => copyText(keyJson, 'name key (.json)')}>{copied === 'name key (.json)' ? 'copied ✓' : 'copy'}</button>{')'}
          {' '}Tags apply to this document only — Person 1 here is not Person 1 anywhere else.
        </span>
      </div>

      {saved && <div className="vrow" style={{ color: 'var(--go)' }}>Saved: {saved}</div>}
      {saveError && <div className="vrow" style={{ color: 'var(--held)', background: 'var(--held-wash)', borderLeft: '3px solid var(--held)', borderRadius: 6, padding: '7px 10px', alignItems: 'flex-start' }}>✗ {saveError}</div>}
      <div style={{ marginTop: 10, display: 'flex', gap: 16 }}>
        {onNext && <button className="btn-quiet" style={{ textDecoration: 'underline' }} onClick={onNext}>Next document to review →</button>}
        {onHome && (
          <button className="btn-quiet" style={{ textDecoration: 'underline' }} onClick={onHome}>
            {saved ? 'Done — start another document →' : '← Back to the queue'}
          </button>
        )}
      </div>

      {/* the upsell that used to close this paragraph made a claim the app
          cannot check (it does not know what anyone subscribes to) — and it was
          the only marketing sentence in the product, on the safety screen */}
      <div className="postnote">Next: paste the redacted text into the AI you already use — ChatGPT, Claude, Copilot, Gemini. If the reply mentions {tableRows[0]?.tag || '[Person1]'}, keep the name key beside you; there's no auto-unmask, by design.</div>
      <div className="postnote" style={{ color: 'var(--mut)' }}>One thing only you can do: read the redacted copy once — if nothing there names anyone, it's ready to paste.</div>
    </section>
  );
}
