import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ingestFile, filesFromDrop, sampleFile, awaitingEngine, hasUnsavedWork, notRunYetNote, unreadableReason, type QFile, type Entity } from './lib/store';
import { stripDocument, protectedEntities, withProtectedTerms, syncFloorRows } from './lib/engine';
import { finishFile, recheckFinish, withFloorRows } from './lib/attest';
import { sideNotRun } from './lib/side';
import { pushUndo, takeUndo, dropFile, undoneNote, NOTHING_TO_UNDO, ALREADY_UNDONE, type UndoEntry } from './lib/undo';
import { loadPractice, type Practice } from './lib/practice';
import { practiceLabel } from './lib/floorTables.mjs';
import { foldFullwidth } from '../../../lib-core/anonymize.mjs';
import { loadProtectedTerms } from './lib/protected';
import { inTauri, ensureEngine, resetEngine, modelCheck, legalServiceHealth, LOCAL_PORT, LEGAL_SERVICE_PORT, type ModelStatus } from './lib/tauri';
import { engineCopy, engineIdentity, type EnginePhase } from './lib/engineStatus';
import { netSnapshot, netMark, netSince, type NetCounts } from './lib/netmeter';
import Drop from './screens/Drop';
import Compare from './screens/Compare';
import Find from './screens/Find';
import Review from './screens/Review';
import Export from './screens/Export';
import History from './screens/History';
import Settings from './screens/Settings';
import About from './screens/About';
import Setup from './screens/Setup';
export type Lane = 'redact' | 'compare' | 'find' | 'map' | 'history' | 'settings' | 'about' | 'setup';

/** Every table the app holds carries the structured floor's rows (lib/engine.ts
 *  syncFloorRows): the floor places tags in the export whatever the table says, so the
 *  table must show them — every write to `entities` goes through here. Through
 *  lib/attest.ts withFloorRows, which makes the export once for the sync, the recheck and
 *  Review's preview together. */
const withFloor = (f: QFile, p: Practice = loadPractice()): QFile => (f.text && f.entities ? { ...f, entities: withFloorRows(f.text, f.entities, p) } : f);
export type Step = 1 | 2 | 3;

/** A toast, and — when it reports a change the lawyer can take back — the undo entry it
 *  offers and the file that entry belongs to. */
interface Toast { id: number; msg: string; undoId?: number; fileId?: string }

export interface AppState {
  files: QFile[];
  activeId: string | null;
  toast: Toast | null;
}

const NAV_ICONS = {
  redact: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M9 13h6M9 17h4" /></svg>,
  history: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 0 0 5 12" /></svg>,
  about: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>,
};

/** the cause a finish taken off by the always-redact list is named by */
const LIST_CAUSE = 'Changing the always-redact list in Settings';

export default function App() {
  const [lane, setLane] = useState<Lane>('redact');
  const [step, setStep] = useState<Step>(1);
  const [maxStep, setMaxStep] = useState<Step>(1);
  const [netlogOpen, setNetlogOpen] = useState(false);
  const [files, setFiles] = useState<QFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [engine, setEngine] = useState<EnginePhase>('checking');
  const [model, setModel] = useState<ModelStatus | null>(null);
  // The egress pill is a LIVE reading, not a literal — re-read the meter on a
  // slow tick and again whenever the dialog is opened. A number that never
  // changes is indistinguishable from a hardcoded one.
  const [net, setNet] = useState<NetCounts>(() => netSnapshot());
  useEffect(() => {
    const t = window.setInterval(() => setNet(netSnapshot()), 2000);
    return () => window.clearInterval(t);
  }, []);
  const toastSeq = useRef(0);

  // Engine boot: model pin → sidecar up → healthy. Every outcome is shown in
  // the rail footer; a dead engine degrades to manual redaction, never a
  // crash — and the failure state carries a Retry, not just a sentence.
  const runBoot = useCallback(async () => {
    setEngine('checking');
    // the legal engine service (frozen pack pipeline) carries its own model upstream —
    // when it answers, the engine IS ready; the sidecar path is the fallback boot
    const svc = await legalServiceHealth();
    if (svc) { setEngine('ready'); return; }
    const m = await modelCheck(false).catch(() => null);
    setModel(m);
    if (inTauri && m && !m.found) { setEngine('nomodel'); return; }
    setEngine('starting');
    const ok = await ensureEngine();
    setEngine(ok ? 'ready' : 'offline');
  }, []);
  useEffect(() => { runBoot(); }, [runBoot]);
  const retryEngine = useCallback(() => { resetEngine(); runBoot(); }, [runBoot]);

  const active = useMemo(() => files.find((f) => f.id === activeId) || null, [files, activeId]);

  // Demo/testing deep-link: ?sample loads the sample NDA; ?sample=review|export
  // jumps there. The ref keeps the effect idempotent under StrictMode's double
  // invocation — both passes must reuse ONE sample instance or activeId dangles.
  const sampleRef = useRef<QFile | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('sample');
    if (q === null) return;
    if (!sampleRef.current) sampleRef.current = withFloor(sampleFile());
    const s = sampleRef.current;
    setFiles((fs) => (fs.some((f) => f.id === s.id) ? fs : [...fs, s]));
    setActiveId(s.id);
    if (q === 'review') { setMaxStep(2); setStep(2); }
    if (q === 'export') { setMaxStep(3); setStep(3); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Undo survives the toast: every destructive action pushes onto a stack that
  // U / the Undo button takes from — the toast is a shortcut, not the storage.
  // Each entry carries the file it was made in, and an undo reaches only the file whose
  // review is on screen (lib/undo.ts has the rule and the measured defect it replaces).
  const undoStack = useRef<UndoEntry[]>([]);
  const toastTimer = useRef<number>(0);
  const dismissLater = useCallback((id: number, ms: number) => {
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), ms);
  }, []);
  const showToast = useCallback((msg: string, undo?: { fileId: string; run: () => void }) => {
    const id = ++toastSeq.current;
    if (undo) undoStack.current = pushUndo(undoStack.current, { id, fileId: undo.fileId, what: msg, run: undo.run });
    setToast({ id, msg, undoId: undo ? id : undefined, fileId: undo?.fileId });
    dismissLater(id, 10000);
  }, [dismissLater]);

  // An undo running right now: the table write it makes is named as one on the Review
  // screen if it takes a finish off (updateEntities reads this synchronously, while the
  // entry's own onUpdate call is on the stack).
  const undoing = useRef(false);
  /** Undo the latest change made in `fileId` — or, from a toast's button, that toast's own
   *  change — and say what was undone. Nothing is ever undone in another file. */
  const undoIn = useCallback((fileId: string, entryId?: number) => {
    const { entry, rest } = takeUndo(undoStack.current, fileId, entryId);
    if (!entry) { showToast(entryId !== undefined ? ALREADY_UNDONE : NOTHING_TO_UNDO); return; }
    undoStack.current = rest;
    undoing.current = true;
    try { entry.run(); } finally { undoing.current = false; }
    showToast(undoneNote(entry));
  }, [showToast]);

  // A review in progress is real work — never let a close swallow it silently.
  // The predicate lives in lib/store (hasUnsavedWork) because it used to count
  // entity rows only: a document queued for the engine, or in the middle of a
  // twenty-minute strip, held no rows yet, so closing the window during the
  // longest work in the app cost the whole run without a word.
  const hasWorkRef = useRef(false);
  useEffect(() => {
    hasWorkRef.current = hasUnsavedWork(files);
  }, [files]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (hasWorkRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // the netlog is keyboard-first too: Escape closes it
  useEffect(() => {
    if (!netlogOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setNetlogOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [netlogOpen]);

  // The strip: real files run the real pipeline, one at a time (the local
  // server is --parallel 1). Fail-closed: an incomplete run keeps its export
  // held; an unreachable engine degrades to the manual-redaction corridor.
  const patchFile = useCallback((id: string, patch: Partial<QFile>) => {
    setFiles((fs) => fs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const stripInto = useCallback(async (f: QFile) => {
    patchFile(f.id, { state: 'stripping', statusLabel: 'Waiting for the local engine…' });
    // The network window for THIS document's run opens before the health probes,
    // so the probes are inside the number the receipt prints. Resource-timing
    // entries land a task or two after a fetch settles, so the window closes on a
    // short delay — and it is AWAITED, because addFiles runs documents in
    // sequence and an un-awaited timer would let document N+1's probes land
    // inside document N's window.
    const mark = netMark();
    const closeNet = () => new Promise<void>((resolve) => {
      window.setTimeout(() => { patchFile(f.id, { netRun: netSince(mark) }); resolve(); }, 250);
    });
    // the legal service (frozen pack pipeline) carries its own model upstream — when it's
    // healthy the in-webview sidecar is not required
    const svc = await legalServiceHealth();
    // The rail follows what this document found: a model server restarted since the boot is
    // said to be starting while it loads, and one that never came back is said to be offline.
    const up = svc ? true : await ensureEngine(undefined, () => setEngine('starting'));
    setEngine((p) => (up ? 'ready' : p === 'nomodel' ? 'nomodel' : 'offline'));
    if (!up) {
      // The engine being down does NOT mean nothing can be redacted: the
      // protected lexicon is deterministic, and an empty table still unlocks
      // manual select-to-redact (the offline banner promises exactly that —
      // before this, entities stayed undefined and the promise was empty).
      // The text of record is FOLDED here as on the engine path (mapLegalOutcome, the worker):
      // the .docx writer masks folded flows, so a term typed in full-width in a document read
      // offline was masked in the .docx and left readable in the .txt (2026-09-23).
      const doc = foldFullwidth(f.text || '') as string;
      const prot = protectedEntities(doc, loadProtectedTerms());
      patchFile(f.id, {
        state: 'ready',
        text: doc,
        entities: syncFloorRows(doc, prot),
        // no engine read the body, so none reads the text outside it either (lib/side.ts)
        side: sideNotRun(f.side, 'the engine was offline'),
        // "Read" alone was the word a waiting row used to show, and it is the one
        // word this row must not lean on: the engine did NOT redact this document.
        statusLabel: prot.length
          ? `Read, not redacted — engine offline; ${prot.length} protected term${prot.length === 1 ? '' : 's'} masked, select text to redact more`
          : 'Read, not redacted — engine offline; select text to redact manually',
      });
      return;
    }
    try {
      patchFile(f.id, { statusLabel: 'Redacting — reading the document…', stripPct: 2 });
      // a .docx's text outside the body goes to the same engine after the body, in a request of
      // its own (lib/side.ts); r.side is what became of it
      const r = await stripDocument(f.text!, (label, pct) => patchFile(f.id, { statusLabel: label, stripPct: pct }), undefined, f.side);
      patchFile(f.id, {
        state: 'ready',
        text: r.doc,
        entities: syncFloorRows(r.doc, r.entities),
        ...(r.side ? { side: r.side } : {}),
        suspects: r.suspects,
        masked: r.masked,
        engineComplete: r.complete,
        completeBy: r.completeBy,
        engineStats: r.stats,
        statusLabel: r.complete
          ? `Redacted by ${engineIdentity(r.stats)?.short ?? 'an unnamed engine'} — ${r.entities.length} entities found`
          : `Redacted by ${engineIdentity(r.stats)?.short ?? 'an unnamed engine'} — INCOMPLETE: a step failed; export is held`,
      });
      await closeNet();
      if (r.complete) showToast(`${f.name} redacted — ${r.entities.length} entities ready for your review`);
    } catch (e: any) {
      // folded, and with the always-redact list applied, as on the offline path above: until
      // 2026-09-23 an engine error left the list out of the table entirely, and the declared
      // terms went out readable in the copied text and the .txt
      const doc = foldFullwidth(f.text || '') as string;
      patchFile(f.id, { state: 'ready', text: doc, entities: syncFloorRows(doc, withProtectedTerms(doc, f.entities || [], loadProtectedTerms())), side: sideNotRun(f.side, 'the engine run failed'), statusLabel: 'Read, not redacted — engine error; select text to redact manually', warnings: [...(f.warnings || []), `Engine: ${e?.message || e}`] });
      // an engine run was attempted, so its window is a real measurement
      await closeNet();
    }
  }, [patchFile]);

  const addFiles = useCallback(async (list: File[]) => {
    const stripped: QFile[] = [];
    for (const f of list) {
      const placeholder: QFile = { id: 'p' + Math.random(), name: f.name, badge: (f.name.split('.').pop() || 'file').toUpperCase().slice(0, 4), state: 'reading', sizeLabel: '', statusLabel: 'Reading…' };
      setFiles((fs) => [...fs, placeholder]);
      let done: QFile;
      try {
        done = await ingestFile(f);
      } catch (e: any) {
        done = { ...placeholder, state: 'error', statusLabel: 'Held', reason: unreadableReason(e) };
      }
      // A readable file leaves ingestFile 'queued' — waiting for the loop below and
      // nothing else. If it somehow arrived queued with no text to hand the engine
      // it could never leave that state, so the impossible case is held out loud
      // rather than left spinning under a "Waiting" label forever.
      if (done.state === 'queued' && (!done.text || done.sample)) {
        done = { ...done, state: 'held', statusLabel: 'Held', reason: 'Held — the text could not be handed to the engine; drop the file again.' };
      }
      setFiles((fs) => fs.map((x) => (x.id === placeholder.id ? done : x)));
      // Queued BEFORE the strip loop starts, not as each file's turn comes up:
      // files 2..N used to sit at 'ready' — done-dot, "Read", a live Review button
      // — for the minutes it took the engine to reach them.
      if (done.state === 'queued') stripped.push(done);
    }
    for (let i = 0; i < stripped.length; i++) {
      try {
        await stripInto(stripped[i]);
      } catch (e: any) {
        // Nothing below stripInto's own catch should reach here, but if the loop
        // ever fell over, every file behind it would wait for a run that is no
        // longer coming. They are held with the reason instead.
        const why = `Held — the redaction run stopped: ${e?.message || e}. Drop the file again to retry it.`;
        for (const rest of stripped.slice(i)) patchFile(rest.id, { state: 'held', statusLabel: 'Held', reason: why });
        break;
      }
    }
  }, [stripInto, patchFile]);

  const onDrop = useCallback(async (dt: DataTransfer) => {
    try {
      const { files: list, failures } = await filesFromDrop(dt);
      if (failures.length) showToast(`${failures.length} item(s) couldn’t be read from the drop: ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''}`);
      if (list.length) await addFiles(list);
    } catch (e: any) {
      showToast(`That drop couldn’t be read: ${e?.message || e}`);
    }
  }, [addFiles, showToast]);

  const addSample = useCallback(() => {
    const s = withFloor(sampleFile());
    setFiles((fs) => [...fs, s]);
    setActiveId(s.id);
  }, []);

  // Every road into review passes through here — the queue, History, Find, the
  // export gate. A file the engine has not finished carries an EMPTY table, and
  // an empty table reads exactly like a document the engine read and cleared, so
  // the road stays closed until the run lands. The refusal says where the file
  // is in line; a blocked action must offer the way through, not a dead click.
  const openReview = useCallback((id: string) => {
    const f = files.find((x) => x.id === id);
    if (f && awaitingEngine(f)) { showToast(notRunYetNote(files, f)); return; }
    setActiveId(id);
    setMaxStep((m) => (m < 2 ? 2 : m));
    setStep(2);
  }, [files, showToast]);

  // Finishing records what it attests to — the export as it stands under this table, this
  // practice and, for a .docx, this always-redact list (lib/attest.ts) — so a later change
  // can be measured against it.
  const markReviewed = useCallback((id: string) => {
    setFiles((fs) => fs.map((f) => (f.id === id ? finishFile(f, loadPractice(), loadProtectedTerms()) : f)));
  }, []);

  // THE GATE (BLUEPRINT law: nothing exports without your review). Export is
  // reachable only for a reviewed file — any other road lands on Review.
  const openExport = useCallback((id?: string) => {
    const target = files.find((f) => f.id === (id ?? activeId));
    if (!target) return;
    // The engine comes before the review, and the review before the export — a
    // file still waiting for its run has nothing to export but the original.
    if (awaitingEngine(target)) { showToast(notRunYetNote(files, target)); return; }
    setActiveId(target.id);
    if (!target.sample && !target.reviewed) {
      setMaxStep((m) => (m < 2 ? 2 : m));
      setStep(2);
      showToast(target.reopened
        ? 'This document changed after you finished its review. The note at the top of its review says what; finish again and it exports.'
        : 'Review comes first — nothing exports without your yes.');
      return;
    }
    setMaxStep(3);
    setStep(3);
  }, [files, activeId, showToast]);

  // Every table write passes the finish through recheckFinish: a change that leaves
  // readable anything masked when the lawyer finished takes the finish off and says what on
  // the Review screen; one that only masks more (Export's "Mask it in this document") leaves
  // it standing. Without it, a row left visible after finishing exported readable under
  // "finished by you".
  const updateEntities = useCallback((id: string, fn: (e: Entity[]) => Entity[], cause?: string) => {
    const why = cause ?? (undoing.current ? 'Your undo' : 'A change made after you finished');
    const p = loadPractice(), terms = loadProtectedTerms();
    setFiles((fs) => fs.map((f) => (f.id === id && f.entities
      ? recheckFinish(f, withFloor({ ...f, entities: fn(f.entities) }, p), p, terms, why)
      : f)));
  }, []);

  // What the files were last measured under while Settings is open: the practice and the
  // always-redact list as they stood when the lawyer came in, or at the last practice switch.
  // Settings saves the list without telling App, so a list edited and then a practice switched
  // in one visit reach onPracticeChange together — and measured together, a term taken off the
  // list took the finish off under "Switching the practice to …" (2026-09-23).
  const measuredIn = useRef<{ practice: Practice; terms: string[] } | null>(null);

  // A practice change re-runs the safety net over every table, and can take rows away: an
  // SSN masked under United States is readable under Singapore, and its row leaves the
  // table, so Export's own checks cannot see it. Measured per file, like any table write —
  // after the list edits made before it, measured under the practice they were made under, so
  // each change is named for what it left readable itself.
  const onPracticeChange = useCallback(() => {
    const p = loadPractice(), terms = loadProtectedTerms();
    const why = `Switching the practice to ${practiceLabel(p)}`;
    const was = measuredIn.current;
    const listed = !!was && was.terms.join('\n') !== terms.join('\n');
    setFiles((fs) => fs.map((f) => {
      const g = listed ? recheckFinish(f, f, was!.practice, terms, LIST_CAUSE) : f;
      return recheckFinish(g, withFloor(g, p), p, terms, why);
    }));
    if (was) measuredIn.current = { practice: p, terms };
  }, []);

  // The always-redact list changes the saved .docx without touching any table: the writer
  // masks headers, footers and watermarks with it, so a term taken off the list after
  // finishing left "PROJECT KESTREL" readable in a .docx header under "finished by you"
  // (2026-09-23). Settings saves the list without telling App, so every finished file is
  // measured again as the lawyer leaves Settings — before anything else is painted, and so
  // before Export or Compare can be reached. Only a .docx can come off here: the text export
  // does not read the list (a declared term it carries readable is a hold on Export instead).
  const lastLane = useRef<Lane>(lane);
  useLayoutEffect(() => {
    const left = lastLane.current === 'settings' && lane !== 'settings';
    lastLane.current = lane;
    if (lane === 'settings' && !measuredIn.current) measuredIn.current = { practice: loadPractice(), terms: loadProtectedTerms() };
    if (!left) return;
    measuredIn.current = null;
    const p = loadPractice(), terms = loadProtectedTerms();
    setFiles((fs) => fs.map((f) => recheckFinish(f, f, p, terms, LIST_CAUSE)));
  }, [lane]);

  // A finish that comes off while its review is not on screen — a practice change in
  // Settings, the late-terms button on Export — is announced where the lawyer is. On the
  // review itself the note at the top of the list says it, with what became readable; this
  // toast names only the file, because it can appear with a screen shared. Keyed on the
  // reopen itself, not the note: the note is measured again on every later write, and a
  // note that now says nothing is readable must not raise a toast saying something is.
  const seenReopen = useRef(new Map<string, QFile['reopen']>());
  const reviewOnScreen = lane === 'redact' && step === 2 ? activeId : null;
  useEffect(() => {
    const fresh: QFile[] = [];
    for (const f of files) {
      if (f.reopen && seenReopen.current.get(f.id) !== f.reopen && f.id !== reviewOnScreen) fresh.push(f);
      seenReopen.current.set(f.id, f.reopen);
    }
    if (fresh.length === 1) showToast(`“${fresh[0].name}” changed after you finished its review: something masked then would now be readable. Open its review to see what, and finish again.`);
    else if (fresh.length > 1) showToast(`${fresh.length} documents changed after you finished them: something masked then would now be readable in each (${fresh.map((f) => f.name).join(', ')}). Open each review to see what, and finish again.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const removeFile = useCallback((id: string) => {
    setFiles((fs) => fs.filter((f) => f.id !== id));
    undoStack.current = dropFile(undoStack.current, id);
    // never leave the stepper asserting work on a file that no longer exists
    if (id === activeId) { setActiveId(null); setStep(1); setMaxStep(1); }
  }, [activeId]);

  // Engine copy: one map, every surface (rail, Drop banner, Settings) — never
  // re-derived per screen (the 2026-07-24 three-surfaces-two-stories audit).
  const ecopy = engineCopy(engine, inTauri);
  // The two off-machine counts are never summed: one fetch through lib/tauri.ts
  // lands in BOTH (netNote synchronously, Resource Timing on completion), so
  // adding them would print 2 for one request. "Unavailable" is an alarm state
  // too — never a green 0 we did not measure.
  const netOffIssued = net.issued.offmachine;
  const netOffObserved = net.observed.offmachine;
  const netAlarm = netOffIssued > 0 || netOffObserved > 0 || !net.observing;
  const netOffAny = netOffIssued > 0 || netOffObserved > 0;
  const netLocalObserved = net.observed.loopback + net.observed.app;
  const netLocalIssued = net.issued.loopback + net.issued.app;

  const goStep = (n: Step) => { if (n <= maxStep) setStep(n); };
  // Rail items are HOME buttons: Redact always lands on the queue page —
  // never strands the user wherever the stepper happened to be.
  const laneBtn = (l: Lane, label: string, icon: React.ReactNode, count?: number, hint?: string) => (
    <button className="nav-row" data-on={lane === l || undefined} title={hint}
      onClick={() => { setLane(l); if (l === 'redact') setStep(1); }}>
      {icon}{label}{count !== undefined && count > 0 && <span className="nav-count">{count}</span>}
    </button>
  );

  return (
    <div className="shell" onClick={() => netlogOpen && setNetlogOpen(false)}>
      <aside className="rail">
        <div className="brand" role="button" title="Home" style={{ cursor: 'pointer' }}
          onClick={() => { setLane('redact'); setStep(1); }}>
          <img src="/favicon.svg" width={42} height={42} style={{ borderRadius: 10 }} alt="" />
          <div className="brandstack" aria-label="Simpler Legal">
            <b>Simpler</b>
            <b>Legal</b>
          </div>
        </div>
        <div className="navlbl">Work</div>
        {laneBtn('redact', 'Redact', NAV_ICONS.redact, files.length)}
        {laneBtn('compare', 'Compare', <svg width={16} height={16} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={1.7} strokeLinecap='round' strokeLinejoin='round'><path d='M9.5 4H5.5a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 5.5 20h4M14.5 4h4A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-4' /><path d='M12 2.5v19' strokeDasharray='2 2.6' /></svg>)}
        {laneBtn('find', 'Find', <svg width={16} height={16} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={1.7} strokeLinecap='round'><circle cx={10.5} cy={10.5} r={6.5} /><path d='M15.4 15.4 20.5 20.5' /></svg>)}
        {laneBtn('map', 'Related cases', <svg width={15} height={15} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={1.8} strokeLinecap='round'><circle cx={6} cy={6} r={2.4}/><circle cx={18} cy={8} r={2.4}/><circle cx={12} cy={18} r={2.4}/><path d='M8 7l7.6 1M7 8l4 8M17 10l-4 6'/></svg>, undefined,
          'Which opinions in the shipped library connect to a given case — and why')}
        {laneBtn('history', 'History', NAV_ICONS.history)}
        {/* Recent removed (queue-page audit): it mirrored the queue rows
            without adding actions — History owns "what did I work on". */}
        {/* System pins to the bottom — a power user's Recent list must never
            push Settings/About around (owner call, 2026-07-23) */}
        <div className="navlbl" style={{ marginTop: 'auto' }}>System</div>
        {laneBtn('settings', 'Settings', NAV_ICONS.settings)}
        {laneBtn('about', 'About', NAV_ICONS.about)}
        <div className="rail-foot" style={{ marginTop: 0 }}>
          <div className="foot-card">
            <div className="frow">
              <span className="fdot" style={{ background: ecopy.tone === 'go' ? 'var(--go)' : ecopy.tone === 'red' ? 'var(--red)' : 'var(--amber)' }} />
              <span className="ftext">{ecopy.rail}</span>
              {ecopy.retry && (
                <button className="fretry" onClick={retryEngine}>Retry</button>
              )}
            </div>
            <div className="frow">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ flex: 'none', color: 'var(--mut)' }}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              <span className="ftext" style={{ color: netAlarm ? 'var(--amber)' : 'var(--mut)' }}>
                {!net.observing
                  ? 'Network record unavailable — see the pill'
                  : netOffAny
                    ? 'Network activity recorded — see the pill'
                    : 'Nothing has left this machine this session'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <nav className="steps" style={{ visibility: lane === 'redact' ? 'visible' : 'hidden' }}>
            {([['Drop', 1], ['Review', 2], ['Export', 3]] as Array<[string, Step]>).map(([label, n]) => (
              <button key={n} className="stepq"
                data-state={n < step ? 'done' : n === step ? 'active' : ''}
                data-locked={n > maxStep || undefined}
                onClick={() => goStep(n)}>
                <span className="ring" />{label}
              </button>
            ))}
          </nav>
          <button className="egress" data-fetch={netAlarm || undefined} style={{ position: 'absolute', right: 20 }} aria-expanded={netlogOpen}
            onClick={(e) => { e.stopPropagation(); setNet(netSnapshot()); setNetlogOpen((o) => !o); }}>
            <span className="dot" />
            {!net.observing
              ? 'network record unavailable'
              : netOffAny
                ? 'OFF-MACHINE REQUEST RECORDED — open the record'
                : '0 requests off this machine'}
          </button>
          {netlogOpen && (
            <div className="netlog" role="dialog" aria-label="Network record — what this window did" onClick={(e) => e.stopPropagation()}>
              <h4>Network record — what this window did</h4>
              <div className="nl-row"><span className="t">Off machine</span>
                <span style={{ color: !netAlarm ? 'var(--go)' : 'var(--amber)', fontWeight: 600 }}>
                  {!net.observing
                    ? 'not measured — this browser gave no resource timeline'
                    : netOffAny
                      ? `${netOffIssued} attempted at the app’s own call site · ${netOffObserved} recorded in this window’s timeline — see the destinations below`
                      : '0 requests — none at the app’s call site, none in this window’s timeline'}
                </span></div>
              <div className="nl-row"><span className="t">On machine</span>
                <span>{netLocalIssued} request{netLocalIssued === 1 ? '' : 's'} issued by the app itself · {netLocalObserved} resource{netLocalObserved === 1 ? '' : 's'} recorded in this window’s timeline. The two overlap — the app’s own fetches appear in both.</span></div>
              <div className="nl-row"><span className="t">Destinations</span>
                <span style={{ wordBreak: 'break-all' }}>{net.hosts.length ? `${net.hosts.join(' · ')}${net.unlistedRequests ? ` · and ${net.unlistedRequests} request${net.unlistedRequests === 1 ? '' : 's'} to destinations not listed (the list holds 256)` : ''}` : 'none recorded yet'}</span></div>
              <div className="nl-row"><span className="t">Model</span><span>{model?.found ? `Reusing local weights — ${model.path}` : inTauri ? `Not found yet — place ${'gemma-4-E2B_q4_0-it.gguf'} in a models folder (this version cannot download it; Settings says where to copy it)` : 'Dev server session — model status shows in the app window'}</span></div>
              <div className="nl-row"><span className="t">Engine ports</span><span>127.0.0.1:{LEGAL_SERVICE_PORT} (the frozen legal pipeline) and 127.0.0.1:{LOCAL_PORT} (the local model) — loopback addresses, which cannot leave this machine</span></div>
              <div className="note">Scope: this counts what <b>this window</b> did — its own requests, and the scripts, styles, images and frames the browser loaded for the page. It does <b>not</b> see requests made from inside the app’s background workers (PDF reading, the redaction worker), nor WebSocket connections, nor other processes, nor work handed to the app’s Rust side. It is a record of this window, not a system-wide monitor. The check that does not depend on this app is airplane mode, or any network monitor.</div>
            </div>
          )}
        </header>

        <main className="content">
          {lane === 'redact' && step === 1 && (
            <Drop files={files} onDropFiles={onDrop} onBrowse={addFiles} onSample={addSample}
              onReview={openReview} onRemove={removeFile} onExport={openExport} onShowNetlog={() => setNetlogOpen(true)}
              net={{ observing: net.observing, offAny: netOffAny }}
              engineNote={ecopy.drop}
              engineFailed={engine === 'offline' || engine === 'nomodel'}
              onRetryEngine={retryEngine} />
          )}
          {lane === 'redact' && step === 2 && (
            <Review file={active} onUpdate={updateEntities}
              onContinue={() => { if (active) { markReviewed(active.id); setActiveId(active.id); setMaxStep(3); setStep(3); } }}
              onBack={() => setStep(1)}
              // Review renders the active file only, so every undo it hands over belongs to
              // that file, and U reaches that file's changes and no other's
              onToast={(msg, undo) => showToast(msg, undo && active ? { fileId: active.id, run: undo } : undefined)}
              onUndo={() => { if (active) undoIn(active.id); }} />
          )}
          {lane === 'redact' && step === 3 && (() => {
            const next = files.find((f) => f.id !== active?.id && !f.sample && f.entities && f.entities.length > 0 && !f.reviewed);
            return (
              <Export file={active} onReview={() => active && openReview(active.id)}
                onBack={() => setStep(2)} onHome={() => setStep(1)}
                onNext={next ? () => openReview(next.id) : null}
                // the terms an Export hold names (engine.ts listHolds) — withProtectedTerms leaves
                // the table as it would be had they been declared before the drop: a row of the
                // term moves under Protected terms in place, a safety-net row is replaced by a
                // protected row, and one left readable outside Protected terms is masked again,
                // so a review decision can be revived here. One left readable under Protected
                // terms stays as it is: that choice was made with the list in view
                onMaskTerms={(terms) => active && updateEntities(active.id, (ents) => withProtectedTerms(active.text || '', ents, terms), 'Masking the always-redact terms in this document')} />
            );
          })()}
          {lane === 'compare' && <Compare files={files} onGoToDrop={() => { setLane('redact'); setStep(1); }} />}
          {lane === 'find' && <Find files={files} onOpenFile={(id) => { setLane('redact'); openReview(id); }} onGoToDrop={() => { setLane('redact'); setStep(1); }} />}
          {/* allow=fullscreen is what lets the map's own Full screen button cover the
              monitor. Without it requestFullscreen is refused inside the frame and the
              map falls back to covering only the iframe — this rail would stay put. */}
          {lane === 'map' && <iframe src='/synergy.html?theme=light&embed=1&case=c1-fourth-amendment-new.txt' title='Related cases'
            allow='fullscreen'
            style={{ width: '100%', flex: 1, minHeight: 0, display: 'block', border: 'none', background: 'var(--table)' }} />}
          {lane === 'history' && <History files={files} onReopen={(id) => { setLane('redact'); openReview(id); }} onStart={() => { setLane('redact'); setStep(1); }} />}
          {lane === 'settings' && <Settings onShowSetup={() => setLane('setup')} engine={engine} onRetry={retryEngine} onPracticeChange={onPracticeChange} />}
          {lane === 'about' && <About />}
          {lane === 'setup' && <Setup onDone={() => setLane('redact')} />}
        </main>
      </div>

      {toast && (
        <div className="toast" data-on role="status"
          onMouseEnter={() => window.clearTimeout(toastTimer.current)}
          onMouseLeave={() => dismissLater(toast.id, 4000)}>
          <span>{toast.msg}</span>
          {/* The button undoes the change this toast reports, and only while that file's
              review is the screen: a toast outlives a step to another file, and its button
              reaching back into the file just left is the defect the per-file stack fixes. */}
          {toast.undoId !== undefined && toast.fileId === reviewOnScreen && (
            <button className="undo" onClick={() => undoIn(toast.fileId!, toast.undoId)}>Undo</button>
          )}
        </div>
      )}
    </div>
  );
}
