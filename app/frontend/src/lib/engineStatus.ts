// Engine status — the ONE copy map every surface renders from (rail footer,
// Drop banner, Settings). The 2026-07-24 audit found three surfaces telling
// two different stories ("starting…" in the rail, "not running" in Settings);
// the cure is structural: one phase, one map, no per-screen re-derivations.
import { foldFullwidth } from '../../../../lib-core/anonymize.mjs';

export type EnginePhase = 'checking' | 'starting' | 'ready' | 'offline' | 'nomodel';
export type EngineTone = 'go' | 'amber' | 'red';

export interface EngineCopy {
  rail: string;
  /** Drop-screen banner line; null = say nothing (steady states need no banner) */
  drop: string | null;
  settings: string;
  tone: EngineTone;
  /** Render a Retry control with this copy. The rail and Settings gate on it rather than each
   *  re-deriving it from the phase: the incident below is said in the ready phase, and a gate
   *  of offline-or-nomodel left its "until Retry" with no Retry to press (measured 2026-09-23).
   *  The Drop banner keeps its offline-or-nomodel gate, because the same flag there also says
   *  "while the engine is offline", which in the ready phase would be false. A refused service
   *  in the ready phase gets none, by an earlier design: the next document asks again
   *  (lib/tauri.ts healService). */
  retry: boolean;
}

/** Who started a process the app sends documents to. 'app': this app, this launch.
 *  'hand': not this app — the developer flow (tools/launch-server.*, node serve-legal.mjs),
 *  or another copy of the app. Mirrors engine.rs Origin. */
export type Origin = 'app' | 'hand';

/** Appended by lib/tauri.ts to a run's engine id, one per process started outside this app,
 *  so the receipt carries WHICH (engineIdentity reads them back). An id suffix rather than a
 *  new field because the id is what already reaches every surface: engine.ts copies it into
 *  stats.engine, and Review and Export render from that.
 *
 *  Two, not one: a single suffix for "the service or its model server" made the receipt say
 *  the engine service was started outside the app when only the model server was (measured
 *  on the Tauri path, 2026-09-23). And only the service is "by hand": the app knows that from
 *  the token file under the user's profile, which only a hand-started service writes. A model
 *  server outside the app may equally be another copy of the app's, so its receipt says
 *  "started outside this app" and nothing about how. */
export const HAND_SERVICE = '@hand-service';
export const HAND_MODEL = '@hand-model';
/** The single suffix receipts carried before the split. Still read, never written: a record
 *  made then says "the service or its model server", which is all it established. */
export const HAND_STARTED = '@hand-started';

/** On the in-app core's id for a document whose frozen-pipeline run the app stopped partway
 *  (engine.rs strip_proxy: the model server the run was checked against exited, or stopped
 *  being the one answering on its port). Per DOCUMENT: the incident used to live only on the
 *  engine-wide record, so the stopped document's receipt said "not reachable" and a later clean
 *  document was shown under a red banner that said "this document" (measured 2026-09-23). */
export const RUN_STOPPED = '@run-stopped';
/** With RUN_STOPPED: the run was stopped because one of the model's answers to the frozen
 *  chain did not reach it whole (engine.rs relay.rs CUT_OFF: cut at its token limit, no word that
 *  it was finished, an HTTP error, an answer that broke off, or a call left unanswered), not
 *  because the model server changed. Without it the stopped sentence said "the model server …
 *  exited or stopped being the one answering on its port" of every stop, which after a cut answer
 *  sends the lawyer after a port problem that did not happen. */
export const RUN_CUT = '@run-cut';

/** On the in-app core's id for a document the frozen pipeline was sent and returned no result
 *  the app could use: an error line, a non-200, or a connection that closed, after the document
 *  had started to go out (engine.rs StripError.reached). Its receipt said "the frozen legal
 *  pipeline was not reachable", word for word the receipt of a run that never dialled, and a
 *  service started by hand that read the whole document was named nowhere (wf5 S5L-1). */
export const RUN_FAILED = '@run-failed';
/** With RUN_STOPPED or RUN_FAILED: who started the processes that frozen run went to. Kept apart
 *  from HAND_SERVICE / HAND_MODEL, which on an in-app-core id say who answered the CORE's calls:
 *  the frozen run's model server and the core's can be different processes. */
export const RUN_HAND_SERVICE = '@run-hand-service';
export const RUN_HAND_MODEL = '@run-hand-model';
/** With RUN_FAILED or RUN_STOPPED: the frozen run's working copy of this document and its
 *  span-to-tag key were left on disk, said by the engine service (serve-legal.mjs, the run's
 *  finally) or found by engine.rs's sweep after it stopped the service it started. The first was
 *  shown only in a progress label cut to 60 characters; the second only on a console a release
 *  build does not have, and a stopped run's receipt said nothing of either (wf6 SL-1, SL-4). */
export const LEFT_ON_DISK = '@left-on-disk';
/** serve-legal.mjs's words for that, which lib/tauri.ts keys on (service-lifecycle.mjs holds the
 *  two together). */
export const LEFT_ON_DISK_SAID = /working files were left on disk/;

/** On the in-app core's id when its model calls for one document were answered by more than
 *  one model server process (engine.rs complete_local names the process behind each answer).
 *  Each was checked on its own connection before any text was sent on it; the receipt says the
 *  model server changed partway rather than naming one of them. */
export const MODEL_CHANGED = '@model-changed';

/** The suffix for a run, in a fixed order so the id is stable. */
export function handSuffix(service: Origin | null | undefined, model: Origin | null | undefined): string {
  return `${service === 'hand' ? HAND_SERVICE : ''}${model === 'hand' ? HAND_MODEL : ''}`;
}

/** The engine service's port, for the words on the receipt. lib/tauri.ts sets it from
 *  LEGAL_SERVICE_PORT, which a developer preview can move; a label that always said 1436
 *  named a port the run did not use. */
let servicePort = 1436;
export function noteServicePort(p: number) { if (Number.isInteger(p) && p > 0 && p < 65536) servicePort = p; }

/** Who answered one in-app-core run's model calls. engine.rs complete_local names the process
 *  behind every answer, by pid and creation time (a pid can be reused), and lib/tauri.ts records
 *  it here. The receipt used to take the model's origin from the engine-wide record instead,
 *  which the status checks write and which lags a change of holder: after a stopped run the
 *  core's calls went to whichever checked process held the port by then, while its receipt
 *  still named this app's own model (wf4 S-local-1). The browser path records nothing, because
 *  a page cannot ask who answered; its receipt claims nothing about the model server, as before.
 */
export interface CoreRun {
  /** each process that answered, by `${pid}:${created}`, and who started it */
  answered: Map<string, Origin>;
  /** calls that came back without a usable answer: refused before any text was sent, failed,
   *  or answered with something the core cannot read (that process is in `answered` too) */
  failed: number;
  /** calls sent and not yet back */
  pending: number;
}
export function coreRun(): CoreRun { return { answered: new Map(), failed: 0, pending: 0 }; }

/** What complete_local says about the process that answered (lib/tauri.ts CoreReply). */
export interface CoreAnswer { model: Origin; pid: number; created: string }

// The record for calls whose caller passed no CoreRun. It holds every call since the last stamp
// taken with none in flight. Exact for one document at a time only if every document that used
// it was stamped: one whose strip failed after some of its calls were answered is never stamped,
// and leaves those answers for the next document's receipt (wf4 S3-2). Two documents read at
// once share it: each receipt can then name a model server that only the other document's calls
// reached, and a stamp taken between two calls of the other run clears that run's earlier
// answers. A caller that keeps one CoreRun per document (engine.ts stripText) has none of these.
const sharedRun = coreRun();

/** lib/tauri.ts, as a complete_local call goes out: the function it calls once with how that
 *  call came back: the process that received the text, or null when none did, and whether the
 *  answer was usable. An origin other than 'app' is recorded as 'hand', the side that claims
 *  less. */
export function coreCallSent(run?: CoreRun): (answer: CoreAnswer | null, ok?: boolean) => void {
  const rec = run ?? sharedRun;
  rec.pending++;
  let settled = false;
  return (answer, ok = answer !== null) => {
    if (settled) return;
    settled = true;
    rec.pending--;
    if (answer) rec.answered.set(`${answer.pid}:${answer.created}`, answer.model === 'app' ? 'app' : 'hand');
    if (!ok) rec.failed++;
  };
}

/** The id of an in-app-core run, from who answered its calls: HAND_MODEL when any answer came
 *  from a model server started outside this app, MODEL_CHANGED when more than one process
 *  answered. An empty record claims neither: no model server read any of the document. */
export function inAppCoreId(rec: CoreRun): string {
  const origins = [...rec.answered.values()];
  return `in-app-core${origins.includes('hand') ? HAND_MODEL : ''}${rec.answered.size > 1 ? MODEL_CHANGED : ''}`;
}

/** What happened to one document's frozen-pipeline run before the in-app core took it over, and
 *  who started the processes that run went to (null: not known, and nothing is claimed). */
export interface FrozenRun { how: 'stopped' | 'failed'; service: Origin | null; model: Origin | null; leftOnDisk: boolean; cut?: boolean }

// Documents whose frozen-pipeline run was stopped or failed after the document went out, until
// the in-app core's result for each is stamped. Keyed by a hash of the folded text, which is
// what both ends hold: lib/tauri.ts has the text it sent, engine.ts's in-app core returns it
// folded (strip.worker.ts). A hash, so no second copy of a document sits here; a collision
// would put the sentence on another document's receipt, the safe direction. Capped because a
// run whose fallback then failed is never stamped.
const runs: Array<[string, FrozenRun]> = [];
function docKey(text: string): string {
  const t = foldFullwidth(text) as string;
  let h1 = 0xdeadbeef ^ t.length, h2 = 0x41c6ce57 ^ t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${t.length}:${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
}
function takeRun(text: string): FrozenRun | null {
  const k = docKey(text);
  const i = runs.findIndex(([key]) => key === k);
  return i >= 0 ? runs.splice(i, 1)[0][1] : null;
}
/** lib/tauri.ts, per frozen-pipeline attempt: what became of it, or null at the start of every
 *  attempt, so a document that later runs clean is not marked. */
export function noteFrozenRun(text: string, run: FrozenRun | null) {
  takeRun(text);
  if (run) { runs.push([docKey(text), run]); if (runs.length > 8) runs.shift(); }
}
/** `true` when engine.rs stopped the run partway; `false` at the start of every attempt. `cut`:
 *  it stopped it because an answer was not whole (RUN_CUT). */
export function noteRunStopped(text: string, wasStopped: boolean, who: { service?: Origin | null; model?: Origin | null; leftOnDisk?: boolean; cut?: boolean } = {}) {
  noteFrozenRun(text, wasStopped ? { how: 'stopped', service: who.service ?? null, model: who.model ?? null, leftOnDisk: who.leftOnDisk === true, cut: who.cut === true } : null);
}
/** The frozen pipeline was sent `text` and returned no result the app could use. */
export function noteRunFailed(text: string, o: { service?: Origin | null; model?: Origin | null; leftOnDisk?: boolean } = {}) {
  noteFrozenRun(text, { how: 'failed', service: o.service ?? null, model: o.model ?? null, leftOnDisk: o.leftOnDisk === true });
}
/** The engine fields engine.ts stamps on an in-app-core result for `doc`: which model server
 *  processes answered that core's calls (`run`, or the shared record when the caller keeps
 *  none), whether it read this document because the frozen pipeline was stopped partway
 *  through it or was sent it and failed, and who started that run's processes, and whether it
 *  finished (`complete`, the core's own verdict, as `coreComplete`: the stopped sentence said
 *  "then read the whole document" when every one of its model calls had been refused, wf4
 *  S-local-3). Read once: the stamp consumes the note, and the shared record when no call is in
 *  flight. */
export function inAppCoreStamp(doc: string, o: { complete?: boolean; run?: CoreRun } = {}): { engine: string; coreComplete?: boolean } {
  const f = takeRun(doc);
  const frozen = f
    ? `${f.how === 'stopped' ? `${RUN_STOPPED}${f.cut ? RUN_CUT : ''}` : RUN_FAILED}${f.service === 'hand' ? RUN_HAND_SERVICE : ''}${f.model === 'hand' ? RUN_HAND_MODEL : ''}${f.leftOnDisk ? LEFT_ON_DISK : ''}`
    : '';
  const engine = `${inAppCoreId(o.run ?? sharedRun)}${frozen}`;
  if (!o.run && sharedRun.pending === 0) { sharedRun.answered.clear(); sharedRun.failed = 0; }
  return typeof o.complete === 'boolean' ? { engine, coreComplete: o.complete } : { engine };
}

/** What the app has established about the processes it would send a document to
 *  (LAUNCH.md §2.4, site-audit L7). Written by lib/tauri.ts after each check engine.rs makes;
 *  read by engineCopy, so the rail, the Drop banner and Settings say the same thing. The
 *  strings are engine.rs's own refusals, which name the port, the holder and the way through. */
export interface EngineTrust {
  /** the engine service on 127.0.0.1:1436 proved itself; who started it */
  service: Origin | null;
  /** why the app will not send documents to what answers on the engine service's port */
  serviceRefused: string | null;
  /** the model server this app will send text to; who started it */
  model: Origin | null;
  /** why the app will not send text to what holds the model port */
  modelRefused: string | null;
  /** why the engine did not come up, in the words of the step that failed */
  failed: string | null;
  /** things the user should know about a model server that IS used (e.g. /slots exposure) */
  notes: string[];
  /** a frozen-pipeline run was stopped partway (engine.rs strip_proxy: the model server it was
   *  checked against exited or stopped being the one answering), in engine.rs's words, which
   *  may name a process and its path and so are shown on screen only, never put on a receipt.
   *  Kept until Retry (engineCopy renders one with it) or a restart. Engine-wide by nature, so
   *  the words say "a document": the document it concerns carries RUN_STOPPED on its own
   *  receipt and row. */
  incident: string | null;
  /** the incident was an answer that was not whole (RUN_CUT), not a change of model server: the
   *  rail named "model port changed" for both. Optional so a caller that records no incident
   *  need not say; absent reads as false. */
  incidentCut?: boolean;
}

const UNKNOWN: EngineTrust = { service: null, serviceRefused: null, model: null, modelRefused: null, failed: null, notes: [], incident: null, incidentCut: false };
let trust: EngineTrust = UNKNOWN;
export function engineTrust(): EngineTrust { return trust; }
export function noteEngineTrust(p: Partial<EngineTrust>) { trust = { ...trust, ...p }; }
/** Retry starts from nothing: an old refusal must not outlive the process it was about. */
export function resetEngineTrust() { trust = UNKNOWN; }

/** Which engine actually produced a document's table. The frozen pack pipeline
 *  names itself in its /strip result (serve-legal.mjs sends engine 'v1-legal-frozen');
 *  the in-webview core is stamped 'in-app-core' by the app layer in lib/engine.ts
 *  because the vendored core returns counts and no name. null = no engine run is
 *  recorded — which the UI must SAY, not paper over.
 *
 *  SELF-REPORTED, and every surface says so. Since 2026-09-23 the app establishes WHO
 *  answered on the engine service's port — the service it started, or one started by hand that
 *  holds the user's own token file (HAND_SERVICE) — and whether its model server was its own
 *  (HAND_MODEL), but the pack behind that service still names itself: a JSON field the app
 *  does not verify. FREEZE.md is the provenance, not this string. */
export interface EngineIdentity {
  id: string;
  /** full name, for the receipt and the review header */
  label: string;
  /** queue-row length */
  short: string;
  /** what else was measured about this run (genre, why the fallback) */
  detail: string;
  /** the stages the run actually streamed, in order — [] when none were recorded */
  stages: string[];
  /** always true today: nothing here is verified by the app */
  selfReported: boolean;
  /** claims to be the FREEZE.md configuration of record (its own word for it) */
  frozen: boolean;
  /** the service or its model server was started outside this app (either suffix) */
  handStarted: boolean;
  /** the engine service was started by hand, outside this app (HAND_SERVICE) */
  handService: boolean;
  /** the model server was started outside this app (HAND_MODEL) */
  handModel: boolean;
  /** the in-app core read this document. Surfaces test this, never the id: with its suffixes
   *  the id is not 'in-app-core', and an equality test printed "no engine run is recorded"
   *  on the receipt of a document the core had swept (F3-R3). */
  inAppCore: boolean;
  /** the frozen pipeline was stopped partway through THIS document and the in-app core read
   *  it (RUN_STOPPED) */
  runStopped: boolean;
  /** with runStopped: its result was refused because one of the model's answers was not whole
   *  (RUN_CUT), found during the run or at its end, after the pipeline had read all of it */
  runCut: boolean;
  /** the frozen pipeline was sent THIS document and returned no result the app could use, and
   *  the in-app core read it (RUN_FAILED) */
  runFailed: boolean;
  /** the frozen run this document went to was on an engine service started by hand
   *  (RUN_HAND_SERVICE), or a model server started outside this app (RUN_HAND_MODEL) */
  runHandService: boolean;
  runHandModel: boolean;
  /** that frozen run's working copy of this document was left on disk, said by the engine service
   *  or found by the app when it stopped the run (LEFT_ON_DISK) */
  leftOnDisk: boolean;
  /** more than one model server process answered the in-app core's calls for this document
   *  (MODEL_CHANGED) */
  modelChanged: boolean;
}

/** The id without its suffixes, and which were there. Read from the end in any order, so an
 *  id a later build writes differently still parses; the legacy suffix sets neither flag. */
function parseHand(id: string) {
  let base = id;
  const got = { service: false, model: false, legacy: false, stopped: false, cut: false, changed: false, failed: false, runService: false, runModel: false, leftOnDisk: false };
  for (let more = true; more;) {
    more = false;
    for (const [suffix, key] of [[HAND_SERVICE, 'service'], [HAND_MODEL, 'model'], [HAND_STARTED, 'legacy'], [RUN_STOPPED, 'stopped'], [RUN_CUT, 'cut'], [MODEL_CHANGED, 'changed'],
      [RUN_FAILED, 'failed'], [RUN_HAND_SERVICE, 'runService'], [RUN_HAND_MODEL, 'runModel'], [LEFT_ON_DISK, 'leftOnDisk']] as const) {
      if (base.endsWith(suffix)) { base = base.slice(0, -suffix.length); got[key] = true; more = true; }
    }
  }
  return { base, ...got };
}

export function engineIdentity(stats?: Record<string, unknown>): EngineIdentity | null {
  const id = stats && typeof stats.engine === 'string' ? stats.engine : null;
  if (!id) return null;
  const stages = stats && Array.isArray(stats.stages) ? (stats.stages as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const parsed = parseHand(id);
  const { base } = parsed;
  const hand = parsed.service || parsed.model || parsed.legacy;
  const core = base === 'in-app-core';
  const flags = {
    handStarted: hand, handService: parsed.service, handModel: parsed.model,
    inAppCore: core, runStopped: core && parsed.stopped, runCut: core && parsed.stopped && parsed.cut, runFailed: core && parsed.failed && !parsed.stopped,
    runHandService: core && parsed.runService, runHandModel: core && parsed.runModel, leftOnDisk: core && parsed.leftOnDisk,
    modelChanged: core && parsed.changed,
  };
  // The firm doctrine reports itself as 'v1-legal-frozen+firm' (serve-legal.mjs). It IS the
  // frozen pack — firm changes one argument of the v2 sweep stage and FREEZE.md proves the
  // frozen profiles byte-identical either way — so an exact-match-only test here would have
  // told the lawyer `frozen: false` on the receipt of a run that was frozen. Matching the
  // prefix and naming the doctrine separately is the honest reading: same pack, stated
  // doctrine, and the review header and export receipt both say which one ran.
  if (base === 'v1-legal-frozen' || base === 'v1-legal-frozen+firm') {
    const firm = base === 'v1-legal-frozen+firm';
    const genre = typeof stats!.genre === 'string' ? (stats!.genre as string) : null;
    const doctrine = firm ? 'firm doctrine (your own matter files)' : null;
    // Said on every surface that names the engine: a run on a service or model the app did not
    // start is the developer flow, and a receipt that read like the packaged app's would
    // claim a provenance the app did not establish. Each process is named for what the app
    // established about it, and no more (HAND_SERVICE above).
    const s = parsed.service, m = parsed.model;
    const where = `the local engine service on 127.0.0.1:${servicePort}`;
    const origin = s && m
      ? `${where}; that service was started by hand, outside this app, and its model server was also started outside this app`
      : s ? `${where}, which was started by hand, outside this app`
      : m ? `${where}, which this app started; its model server was started outside this app`
      : parsed.legacy ? `${where}; that service or its model server was started outside this app`
      : where;
    const short = s && m ? ' (service and model server started outside this app)'
      : s ? ' (started by hand)'
      : m ? ' (model server started outside this app)'
      : parsed.legacy ? ' (started outside this app)'
      : '';
    const handNotes = [
      s ? 'engine service started by hand, outside this app' : null,
      m ? 'model server started outside this app; its --jinja and thinking-off settings were not checked' : null,
      parsed.legacy && !s && !m ? 'engine service or its model server started outside this app' : null,
    ];
    // A model server the app did not start was checked for the pinned model file, the context
    // size and the slot count; its chat-template settings cannot be read from outside
    // (HAND_MODEL_HOW). Thinking left on can spend the token budget and return fewer spans, so
    // the receipt says the run is not certified as the configuration FREEZE.md proves. `frozen`
    // stays true: it answers "did the frozen service run" (Export's pass line), which it did.
    const uncertified = m ? '. The app could not check that model server’s --jinja and thinking-off settings, so it does not certify this run as the frozen configuration' : '';
    return {
      id,
      label: `v1-legal — the frozen pack pipeline${firm ? ', firm doctrine' : ''}, as reported by ${origin}${uncertified}`,
      short: `${firm ? 'the frozen v1-legal pipeline, firm doctrine' : 'the frozen v1-legal pipeline'}${short}`,
      detail: [genre ? `genre routed: ${genre}` : null, doctrine, ...handNotes].filter(Boolean).join(' · '),
      stages,
      selfReported: true,
      frozen: true,
      ...flags,
    };
  }
  if (base === 'in-app-core') {
    const m = parsed.model, stop = parsed.stopped, changed = parsed.changed;
    // Whether the core finished, by its own verdict (engine.ts stamps it). Absent from a record
    // made before it was kept, which then claims neither: that sentence said "then read the
    // whole document" whether or not any of the core's model calls had been answered.
    const done = stats && typeof stats.coreComplete === 'boolean' ? stats.coreComplete : null;
    const took = done === true ? 'and the in-app core then read the whole document'
      : done === false ? 'and the in-app core took the document over but did not finish it: some of its model calls were refused or failed, so its table for this document is incomplete'
      : 'and the in-app core took the document over';
    // Why the core, for THIS document. The stopped sentence is fixed words, never engine.rs's
    // incident text: that names a process and its path, which a receipt must not carry. So are
    // the failed one's: the service's error line can name a folder under the user's profile.
    // "Not reachable" is said only when the document never went out: it was said of a run that
    // had read the whole document, on a service started by hand, and failed (wf5 S5L-1).
    const failed = !stop && parsed.failed;
    const ranOn = [
      parsed.runService ? 'its engine service was started by hand, outside this app' : null,
      parsed.runModel ? 'the model server it ran against was started outside this app' : null,
    ].filter(Boolean);
    const who = ranOn.length ? ` (${ranOn.join('; ')})` : '';
    // A cut answer (RUN_CUT) is a different stop: the model server was the checked one, and one
    // of the chain's calls got no whole answer from it. The chain reads a cut answer as all there
    // is and goes on past a missing one, leaving untagged what that call was there to find
    // (ruling 15). These words said "cut off at its token limit" of every such stop; since the
    // relay also stops a run for an HTTP error, an answer that broke off and a call the chain
    // gave up on (wf7 S6-F1, S6-F2), they name the class and not one member of it. They say the
    // result was not used, never that the run was stopped partway: the relay can refuse a run at
    // its end, after the pipeline read the whole document, when one of its calls was still open
    // as the result arrived (ruling 20), and this receipt then contradicted legal-serve.log,
    // which records that run as completed (wf8 S7A-1).
    const why = stop && parsed.cut
      ? `the app did not use the result of the frozen legal pipeline${who} for this document, because one of the model’s answers to it was missing, cut off, or did not say it had finished, which would have left untagged what that call was there to find, ${took}`
      : stop
      ? `the frozen legal pipeline${who} was stopped partway through this document because the model server it was checked against exited or stopped being the one answering on its port; the app checks every connection to the model server before any text is sent on it, so no part of this document went to a process the app had not checked, ${took}`
      : failed
        ? `this document was sent to the frozen legal pipeline${who}, which returned no result the app could use, ${took}`
        : 'the frozen legal pipeline was not reachable for this document';
    // Two sentences because two things can know it: after a stop the engine service may not have
    // been the one to say so (engine.rs found the tree when it stopped the service it started).
    // Where the folder is named depends on who started the service, and the words say which,
    // in fixed words with no path in them (ruling 6: the receipt travels with the copy; History
    // is where the logs folder is spelled out). This said "the engine console names the
    // folder" of every run (SEAM-ENGINE-CONSOLE): the app starts its service with no window, so
    // for the packaged app there was no console. What does name it: a service the app started
    // writes its lines to legal-serve.log (engine.rs pump_logs; its sweep after a stop appends
    // there too, engine.rs sweep_trees_in), a file the service's next start rewrites, and its
    // boot sweep then removes the folder or names it again. A service started by hand prints
    // them in the window it runs in. On a run that was sent the document, not-hand is the
    // app's own: engine.rs names the service on every such run, and a page reaches a service
    // only with the token a hand-started one gives out.
    const named = parsed.runService
      ? 'the engine service printed the folder in the window it was started from'
      : 'the engine’s log names the folder: legal-serve.log, in the logs folder the History screen gives, which is rewritten each time the app starts the service; that start removes the folder or names it there again';
    const disk = !parsed.leftOnDisk ? null
      : failed ? 'the engine service reported that its working copy of this document, and the key from its tags back to the original words, were left on this computer’s disk; ' + named + ', and the service tries again to remove it each time it starts'
      : stop ? 'the frozen run’s working copy of this document, and the key from its tags back to the original words, were left on this computer’s disk when the run was stopped; ' + named + ', and the engine service tries again to remove them each time it starts'
      : null;
    const moved = changed
      ? `the model server answering the in-app core changed while it read this document: more than one model server process answered its calls, each checked on its own connection before any text was sent on it${m ? ', and at least one of them was started outside this app' : ''}`
      : null;
    const tags = [
      stop ? (parsed.cut ? 'frozen pipeline result not used: a model answer was missing or cut off' : 'frozen pipeline stopped partway') : failed ? 'frozen pipeline failed on it' : null,
      parsed.runService ? 'engine service started by hand' : null,
      changed ? 'model server changed partway' : null,
      m || parsed.runModel ? 'model server started outside this app' : null,
      disk ? 'working copy left on disk' : null,
    ].filter(Boolean);
    return {
      id,
      label: `in-app core — the fallback that runs inside this window${changed ? ', whose model server changed while it read this document' : m ? ', using a model server started outside this app' : ''}`,
      short: `the in-app core${tags.length ? ` (${tags.join('; ')})` : ''}`,
      detail: [why, disk, moved ?? (m ? 'model server started outside this app' : null)].filter(Boolean).join(' · '),
      stages,
      selfReported: true,
      frozen: false,
      ...flags,
    };
  }
  return { id, label: `${id} (name self-reported by the engine)`, short: id, detail: '', stages, selfReported: true, frozen: false, ...flags };
}

/** How the app established a model server it did not start, in the words the screen uses.
 *  The model file is the one the server REPORTS: a process running as you could name another,
 *  which is outside what a local check decides (engine.rs verify_hand_model). Two of the four
 *  frozen serving flags are not in anything llama-server reports, and are said to be unchecked
 *  rather than left for the reader to assume. */
const HAND_MODEL_HOW = 'a model server started outside this app, which the app used only after the model file it says it serves matched the pin and it reported the frozen context size and slot count (its chat-template settings, --jinja and thinking off, cannot be read from outside and were not checked)';

/** The Tauri 'ready' copy before any incident is laid over it. Order is severity: a model
 *  server the app will not send text to, then a service it will not use, then processes it
 *  uses but did not start, then notes. Each later state keeps what the earlier ones would drop:
 *  a refused service does not hide that the in-app core's model server was started elsewhere. */
function readyCopy(t: EngineTrust, notes: string): Omit<EngineCopy, 'retry'> {
  if (t.modelRefused) {
    return { rail: 'Model server refused', drop: t.modelRefused, settings: `Not sending text to the model server — ${t.modelRefused}${notes}`, tone: 'red' };
  }
  const handModel = t.model === 'hand' ? ` The in-app core uses ${HAND_MODEL_HOW}.` : '';
  if (t.serviceRefused) {
    return { rail: 'Engine ready · in-app core only', drop: `${t.serviceRefused}${handModel}`, settings: `Running on the in-app core. ${t.serviceRefused}${handModel}${notes}`, tone: 'amber' };
  }
  const hand = [
    t.service === 'hand' ? 'an engine service started by hand, outside this app, which proved it holds the token file under your own profile' : null,
    t.model === 'hand' ? HAND_MODEL_HOW : null,
  ].filter(Boolean);
  if (hand.length) {
    const said = `Using ${hand.join(', and ')}. Documents the frozen pipeline redacts carry this on their receipt.`;
    // Said where the service is described, not on the drop line. The app cannot stop a service
    // it did not start (it is in none of the app's kill-on-close jobs), and the token file it
    // proved itself with stays readable for as long as it runs.
    const outlives = t.service === 'hand'
      ? ' Closing this app does not stop that service: it keeps running until it is stopped where it was started (Ctrl+C in its window), and until then any program running as you can read its token file and send it text.'
      : '';
    return { rail: t.service === 'hand' ? 'Engine ready · started by hand' : 'Engine ready · outside model server', drop: said, settings: `Running — ${said}${outlives}${notes}`, tone: 'amber' };
  }
  if (t.notes.length) {
    return { rail: 'Engine ready · 127.0.0.1', drop: t.notes.join(' '), settings: `Running — working entirely inside this computer.${notes}`, tone: 'amber' };
  }
  return { rail: 'Engine ready · 127.0.0.1', drop: null, settings: 'Running — working entirely inside this computer', tone: 'go' };
}

/** `t` defaults to what lib/tauri.ts last recorded; passed explicitly by tests. */
export function engineCopy(phase: EnginePhase, inTauri: boolean, t: EngineTrust = engineTrust()): EngineCopy {
  const retry = phase === 'offline' || phase === 'nomodel' || (phase === 'ready' && inTauri && t.incident !== null);
  return { ...phaseCopy(phase, inTauri, t), retry };
}

function phaseCopy(phase: EnginePhase, inTauri: boolean, t: EngineTrust): Omit<EngineCopy, 'retry'> {
  const notes = t.notes.length ? ` ${t.notes.join(' ')}` : '';
  switch (phase) {
    case 'checking':
      return { rail: 'Checking engine…', drop: null, settings: 'Checking…', tone: 'amber' };
    case 'starting':
      return inTauri
        ? { rail: 'Engine starting…', drop: 'The local engine is starting — drops are read now and redacted the moment it’s ready.', settings: 'Starting — loading the model…', tone: 'amber' }
        : { rail: 'Looking for the engine…', drop: 'Looking for the local engine…', settings: 'Looking for a local model server…', tone: 'amber' };
    case 'ready': {
      if (!inTauri) {
        // A page cannot ask the kernel who holds a port, so in the developer preview the model
        // server on 127.0.0.1:49400 is used unchecked, and the engine service only when this
        // page was given its token. The packaged app checks both before it sends anything.
        const hand = t.service === 'hand'
          ? ' Documents go to an engine service started by hand, which proved it holds the token this page was given; their receipts say so.'
          : '';
        return {
          rail: t.service === 'hand' ? 'Engine ready · started by hand' : 'Engine ready · 127.0.0.1',
          drop: t.serviceRefused,
          settings: `Running — developer preview: this page cannot check which program answers on 127.0.0.1; the packaged app does before it sends anything.${hand}${t.serviceRefused ? ` ${t.serviceRefused}` : ''}`,
          tone: 'amber',
        };
      }
      const c = readyCopy(t, notes);
      // A stopped run is said on top of whatever the engine is doing now, in red, until Retry
      // (rendered with it: engineCopy) or a restart: the document went on to the in-app core,
      // and a steady green rail would tell the lawyer nothing happened to it. Which document is
      // on that document's own row and receipt (RUN_STOPPED); these words say "a document".
      return t.incident
        ? { rail: t.incidentCut ? 'Result not used · answer incomplete' : 'Run stopped · model port changed', drop: c.drop ? `${t.incident} ${c.drop}` : t.incident, settings: `${c.settings} ${t.incident}`, tone: 'red' }
        : c;
    }
    case 'offline': {
      const why = t.modelRefused ?? t.failed;
      if (inTauri && why) {
        return {
          rail: t.modelRefused ? 'Model server refused' : 'Engine offline',
          drop: `The local engine didn’t come up: ${why} Automatic detection is off; documents open for manual redaction.`,
          settings: `Not running — ${why} Retry starts it again; documents open for manual redaction meanwhile`,
          tone: t.modelRefused ? 'red' : 'amber',
        };
      }
      return inTauri
        ? { rail: 'Engine offline', drop: 'The local engine didn’t come up — automatic detection is off. Documents open for manual redaction.', settings: 'Not running — Retry starts it again; documents open for manual redaction meanwhile', tone: 'amber' }
        : { rail: 'Engine offline', drop: 'The local engine isn’t running — automatic detection is off. Documents open for manual redaction.', settings: 'Not running (developer preview — start the local model server, then Retry)', tone: 'amber' };
    }
    case 'nomodel':
      return { rail: 'Model not found', drop: 'Model not found — automatic detection is off. Documents open for manual redaction.', settings: 'Not running — the model file is missing (see the Model file row)', tone: 'red' };
  }
}
