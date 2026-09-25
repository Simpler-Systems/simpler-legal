// The single IPC chokepoint (design rule: every road out of the webview is
// auditable in this one file). In the Tauri window everything goes through
// Rust commands — the webview's CSP allows no network. In a plain browser
// (dev server, headless E2E) the same calls fall back to 127.0.0.1 directly;
// either way nothing ever leaves the machine.
//
// Staying on the machine is not the same as reaching the right process (LAUNCH.md §2.4,
// site-audit L7). In the app, engine.rs establishes who holds each port before any text is
// sent, and this file records what it found (noteEngineTrust) so every surface can say it.
// A page in a plain browser cannot ask who holds a port: it uses the engine service only
// when it was given that service's token (VITE_SIMPLER_LEGAL_TOKEN, below) and the model
// server on 49400 unchecked, which the Settings line states.
import { Channel, invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { netNote } from './netmeter';
import { coreCallSent, HAND_SERVICE, handSuffix, LEFT_ON_DISK_SAID, noteEngineTrust, noteRunFailed, noteRunStopped, noteServicePort, resetEngineTrust, type CoreRun, type Origin } from './engineStatus';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Developer-preview settings, read from Vite's env. DEV-gated so a production build that
// happened to run with them set compiles the branch away rather than shipping the value, and
// wrapped because a plain esbuild bundle (the tests under test/) has no import.meta.env.
function devToken(): string | undefined {
  try {
    if (!import.meta.env.DEV) return undefined;
    const v = import.meta.env.VITE_SIMPLER_LEGAL_TOKEN;
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  } catch { return undefined; }
}
function devLegalPort(): number | undefined {
  try {
    if (!import.meta.env.DEV) return undefined;
    const p = Number(import.meta.env.VITE_SIMPLER_LEGAL_PORT);
    return Number.isInteger(p) && p > 0 && p < 65536 ? p : undefined;
  } catch { return undefined; }
}

/** The local model server's port — the frozen serving port (tools/launch-server.cmd,
 *  FREEZE.md). Inherited as 49331 from red's app until 2026-09-13, when nothing had
 *  ever served that here. In the app, src-tauri/src/engine.rs spawns the launcher on
 *  this port (server_start) and probes it (server_status); in a plain browser the same
 *  port is probed directly. */
export const LOCAL_PORT = 49400;

/** `verified` is null until a hash was actually computed — never a default `true`;
 *  `error` carries the reason when a requested check could not run (unreadable file). */
export interface ModelStatus { found: boolean; path: string | null; verified: boolean | null; searched: string[]; error?: string }
/** `healthy` means answering AND trusted: engine.rs reports a model server it refuses as
 *  unhealthy with the reason in `refused`. `origin`: who started the one it will use. */
export interface ServerStatus { running: boolean; healthy: boolean; port: number; origin?: Origin | null; refused?: string | null; notes?: string[]; adapterSpawned?: boolean }

/** A Tauri command rejects with whatever its Rust error serialises to: a bare string for most,
 *  an object for strip_proxy. `(e as Error).message` read `undefined` off the string, and
 *  lib/engine.ts printed "Legal service failed (undefined)" for every refusal engine.rs made
 *  (measured 2026-09-23). Every rejection this file passes on is an Error with the words. */
function errText(e: unknown): string {
  if (typeof e === 'string') return e;
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === 'string' && m ? m : String(e);
}
/** An Origin read off a rejection; anything else claims nothing. */
const originOf = (x: unknown): Origin | null => (x === 'app' || x === 'hand' ? x : null);
const sleep =(ms: number) => new Promise((r) => setTimeout(r, ms));
function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args).catch((e: unknown) => { throw new Error(errText(e)); });
}

/** What engine.rs found about the model server, onto the record the status copy reads. */
function noteModel(s: ServerStatus): ServerStatus {
  if (inTauri) noteEngineTrust({ model: s.origin ?? null, modelRefused: s.refused ?? null, notes: s.notes ?? [] });
  return s;
}

export interface CompleteOpts { grammar?: string; maxTokens?: number }

/** engine.rs CoreReply: the text, and the model process that received the request. `error` is
 *  set when its answer is unusable (no answer text in a 200, or text the server does not say it finished), cut short, or never came
 *  once the request was on its way; either way the process named received the text. A rejected call (the catch below) is one that sent nothing.
 *  `created` is a string because a FILETIME is above 2^53. */
export interface CoreReply { text: string; error: string | null; model: Origin; pid: number; created: string }

/** One in-app-core model call. `run` is the record of the document it is for (engineStatus
 *  CoreRun): every process that answered goes on it, so that document's receipt names the model
 *  server that read it, not the one the status checks last saw. */
export async function completeLocal(system: string, user: string, opts: CompleteOpts = {}, run?: CoreRun): Promise<string> {
  if (inTauri) {
    const done = coreCallSent(run);
    let r: CoreReply;
    try {
      r = await call<CoreReply>('complete_local', {
        system,
        user,
        grammar: opts.grammar ?? null,
        maxTokens: opts.maxTokens ?? null,
      });
    } catch (e) {
      done(null);
      throw e;
    }
    done(r, !r.error);
    if (r.error) throw new Error(r.error);
    return r.text;
  }
  // counted before the call, so a refused connection is still on the record
  netNote(`http://127.0.0.1:${LOCAL_PORT}/v1/chat/completions`);
  const res = await fetch(`http://127.0.0.1:${LOCAL_PORT}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      max_tokens: opts.maxTokens ?? 400,
      stream: false,
      ...(opts.grammar ? { grammar: opts.grammar } : {}),
    }),
  });
  if (!res.ok) throw new Error(`local model http ${res.status}`);
  const v = await res.json().catch(() => null);
  const t = v?.choices?.[0]?.message?.content;
  // engine.rs complete_within's rule: every prompt the core sends asks for NONE when there is
  // nothing, so no answer text is a failed call, never "nothing found" (wf5 S5L-2)
  const why = v?.choices?.[0]?.finish_reason;
  if (typeof t !== 'string' || !t.trim()) {
    throw new Error(v === null ? 'local model json: the answer is not JSON' : `local model: answered HTTP 200 with no answer text${typeof why === 'string' ? ` (finish_reason "${why}")` : ''}`);
  }
  // and only an answer the server says it finished is read. Text that stops early is part of an
  // answer, which the core would read as all there is: names past the cut went out readable,
  // with every layer marked complete (wf5 S3R-1). Refusing "length" alone left every other early
  // end, and a server that names none, read as whole (wf6 SL-2). A page cannot ask which process
  // answered, so the words name the port.
  if (why !== 'stop') {
    const where = `after the request had been sent to the model server on 127.0.0.1:${LOCAL_PORT}`;
    throw new Error(why === 'length'
      ? `local model: the answer was cut off at its token limit (finish_reason "length"), ${where}`
      : `local model: the answer did not say it was finished (${typeof why === 'string' ? `finish_reason "${why.slice(0, 40)}"` : 'no finish_reason'}), so it was not read, ${where}`);
  }
  return t;
}

async function browserHealth(): Promise<ServerStatus> {
  try {
    netNote(`http://127.0.0.1:${LOCAL_PORT}/health`);
    const r = await fetch(`http://127.0.0.1:${LOCAL_PORT}/health`);
    return { running: false, healthy: r.ok, port: LOCAL_PORT };
  } catch {
    return { running: false, healthy: false, port: LOCAL_PORT };
  }
}

export async function modelCheck(verify = false): Promise<ModelStatus | null> {
  if (!inTauri) return null;
  return call<ModelStatus>('model_check', { verify });
}

export async function serverStart(): Promise<ServerStatus> {
  if (!inTauri) return browserHealth();
  return noteModel(await call<ServerStatus>('server_start'));
}

export async function serverStatus(): Promise<ServerStatus> {
  if (!inTauri) return browserHealth();
  return noteModel(await call<ServerStatus>('server_status'));
}

/** Bring the engine up and wait until it answers. Resolves true when healthy,
 *  false when it never came up (fail-loud upstream, never silently). */
let enginePromise: Promise<boolean> | null = null;
/** The app has asked for the engine to be started at least once. Before that, a missing
 *  engine service is the boot still under way, and legalServiceHealth leaves it alone. */
let bootAsked = false;
/** forget the cached boot attempt so Retry can try again from scratch */
export function resetEngine() { enginePromise = null; bootAsked = false; resetEngineTrust(); }
/** The boot in flight has found the model server not yet answering and is waiting for it, and
 *  who wants to hear that. A per-document ensureEngine that starts or joins such a wait passes
 *  `onStarting`, so the rail stops saying ready while a restarted model loads: it used to stay
 *  green through the whole reload, because only the first boot ever set the phase. */
let bootPending = false;
let bootWaiting = false;
/** which boot the two flags describe: resetEngine drops a boot that may still be polling */
let bootGen = 0;
const onWait = new Set<() => void>();
function tellWaiting() {
  bootWaiting = true;
  for (const f of onWait) { try { f(); } catch { /* a listener's failure is not the boot's */ } }
  onWait.clear();
}
export function ensureEngine(maxMs?: number, onStarting?: () => void): Promise<boolean> {
  // In the app, the sidecar may legitimately need a minute to load 3 GB of
  // weights. In a plain browser nothing can be spawned — a dead port is a
  // dead port, so probe immediately and admit it in seconds, not minutes.
  const deadlineMs = maxMs ?? (inTauri ? 90_000 : 4_000);
  bootAsked = true;
  if (!enginePromise) {
    const gen = ++bootGen;
    bootPending = true;
    bootWaiting = false;
    enginePromise = (async () => {
      try {
        const s = await serverStart();
        // a port held by a process the app will not use does not free itself; waiting out
        // the 90 s would only delay the sentence that says so
        if (s.refused) { enginePromise = null; return false; }
      } catch (e) {
        // engine.rs rejects with the reason in words (a model file that fails the pin, an
        // install directory that is not writable); it used to be discarded here
        noteEngineTrust({ failed: errText(e) });
        enginePromise = null;
        return false;
      }
      const deadline = Date.now() + deadlineMs;
      for (;;) {
        const s = await serverStatus();
        if (s.healthy) return true;
        if (s.refused) break;
        if (Date.now() >= deadline) break;
        if (!bootWaiting && gen === bootGen) tellWaiting();
        await new Promise((r) => setTimeout(r, 1500));
      }
      enginePromise = null; // allow a retry on the next drop
      return false;
    })().finally(() => { if (gen === bootGen) { bootPending = false; bootWaiting = false; onWait.clear(); } });
  }
  if (onStarting && bootPending) {
    if (bootWaiting) onStarting();
    else onWait.add(onStarting);
  }
  return enginePromise;
}

/** The legal engine service (serve-legal.mjs) — the FROZEN v1-legal pack pipeline behind
 *  localhost. Same one-road-out rule: this file is the only place that knows the port.
 *  In the app the webview CSP (default-src 'self') blocks direct fetch, so the two calls
 *  below go through engine.rs (legal_service_health, strip_proxy) — same wire format,
 *  same rules, the NDJSON lines arriving on a Channel instead of a body stream.
 *  Dev/browser mode speaks to the port directly; VITE_SIMPLER_LEGAL_PORT moves it there
 *  only (a service started by hand on another port), never in the app. */
export const LEGAL_SERVICE_PORT = (!inTauri && devLegalPort()) || 1436;
noteServicePort(LEGAL_SERVICE_PORT);

/** `service` / `model`: who started each (engine.rs Origin); absent on the browser path,
 *  which cannot tell. `notes`: what the user should know about the model server in use. */
export interface LegalServiceHealth { ok: boolean; llama: boolean; engine: string; service?: Origin; model?: Origin | null; notes?: string[] }

// ── the browser path's half of the handshake (serve-legal.mjs gate 4, engine.rs's twin) ──
// Only when this page was given the service's token. The proof is checked before anything is
// posted, and it must name this port, so a relay from another port does not pass. Two fetches
// may use two connections, so the window between proof and post that engine.rs closes (one
// socket) stays open here: a developer-preview limit, stated rather than papered over.
const PROOF_CONTEXT = 'simpler-legal-service/1';
const hexOf = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
async function browserHello(token: string): Promise<{ engine: string; llamaOk: boolean }> {
  const base = `http://127.0.0.1:${LEGAL_SERVICE_PORT}`;
  const nonce = hexOf(crypto.getRandomValues(new Uint8Array(32)).buffer);
  netNote(`${base}/hello`);
  const r = await fetch(`${base}/hello`, { headers: { 'x-simpler-challenge': nonce }, signal: AbortSignal.timeout(4000) });
  const refused = (why: string) => new Error(`The program on 127.0.0.1:${LEGAL_SERVICE_PORT} ${why}, so this page sent it nothing. Restart the engine service and set VITE_SIMPLER_LEGAL_TOKEN from its token file (serve-legal.mjs header).`);
  if (!r.ok) throw refused(`answered the handshake with HTTP ${r.status}`);
  const v = await r.json().catch(() => null) as { payload?: unknown; proof?: unknown } | null;
  if (!v || typeof v.payload !== 'string' || typeof v.proof !== 'string') throw refused('gave no proof');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = hexOf(await crypto.subtle.sign('HMAC', key, enc.encode(`${PROOF_CONTEXT}\n${nonce}\n${v.payload}`)));
  if (v.proof !== want) throw refused('could not prove it holds the token this page was given');
  const p = JSON.parse(v.payload) as { v?: number; service?: string; port?: number; engine?: string; llamaOk?: boolean };
  if (p.v !== 1 || p.service !== 'serve-legal' || p.port !== LEGAL_SERVICE_PORT) throw refused(`proved a payload that does not describe the engine service on port ${LEGAL_SERVICE_PORT}`);
  return { engine: String(p.engine ?? ''), llamaOk: p.llamaOk === true };
}
export interface LegalRow { span: string; cls: string; src: string; tag: string }
/** scratchRemoved: the service states, on the result line itself, whether the per-run
 *  working tree (unredacted document + span-to-tag key) is actually gone. False is also
 *  accompanied by an {error} line, and both paths below read each on its own: the error line
 *  can arrive after the Tauri path has stopped listening. */
export interface LegalStripResult { genre: string; engine: string; final: string; alignOk: boolean; rows: LegalRow[]; scratchRemoved?: boolean; profile?: string }

/** A result line that says its working copy is still there fails the run, in words
 *  LEFT_ON_DISK_SAID matches, so the document's receipt carries the disk mark. */
const LEFT_ON_RESULT_LINE = 'working files were left on disk (the engine service said so on its result line)';
/** A result line without the fields engine.ts maps threw there, after this file had returned,
 *  and the fallback receipted the document "not reachable" when the service had read all of it
 *  (wf5 S3R-5). Only a broken or foreign service sends one; serve-legal.mjs always sends rows. */
const UNREADABLE_RESULT = 'legal service: its result line is not one this app can read';
/** The engine names serve-legal.mjs sends, which engineIdentity states. Any other went on the
 *  receipt as sent: 'in-app-core' made a frozen run's receipt say the pipeline was not
 *  reachable for this document, and '' made it say no engine run is recorded (wf6 SL-3). */
const FROZEN_ENGINES: ReadonlySet<unknown> = new Set(['v1-legal-frozen', 'v1-legal-frozen+firm']);
function resultReadable(r: LegalStripResult): boolean {
  return FROZEN_ENGINES.has(r.engine) && typeof r.final === 'string' && Array.isArray(r.rows)
    && r.rows.every((x) => !!x && typeof x.span === 'string' && typeof x.tag === 'string' && typeof x.cls === 'string');
}

/** null = do not use the service: absent, its model is down, or it was refused — and a refusal
 *  is recorded (noteEngineTrust) in engine.rs's words, so the screens can say why the in-app
 *  core is doing the work. */
async function askService(): Promise<LegalServiceHealth | null> {
  // counted on the record: the request is made by Rust, to this address (the handshake)
  netNote(`http://127.0.0.1:${LEGAL_SERVICE_PORT}/hello`);
  try {
    const h = await invoke<LegalServiceHealth | null>('legal_service_health');
    noteEngineTrust(h
      ? { service: h.service ?? null, serviceRefused: null, model: h.model ?? null, modelRefused: null, notes: h.notes ?? [] }
      : { service: null, serviceRefused: null });
    return h;
  } catch (e) {
    noteEngineTrust({ service: null, serviceRefused: errText(e) });
    return null;
  }
}

/** Once the engine has been booted, a service that is missing or refused is asked about again
 *  on every document, not left as it was at boot. Before this, the app's own service was
 *  never started again after the port it wanted came free (another copy of the app closed,
 *  or engine.rs stopped it mid-run), the model server the screen called "started outside
 *  this app" stayed so named after that process had gone, and a refusal told the lawyer to
 *  press a Retry button the ready state does not render (measured 2026-09-23). serverStart
 *  starts only what is missing and re-reads who holds the model port; a model server that is
 *  not ready drops the cached boot, so the next ensureEngine waits for it instead of
 *  answering true from a boot that is no longer the state of the machine. */
async function healService(): Promise<LegalServiceHealth | null> {
  let s: ServerStatus;
  try { s = await serverStart(); } catch (e) {
    noteEngineTrust({ failed: errText(e) });
    enginePromise = null;
    return null;
  }
  if (!s.healthy) { enginePromise = null; return null; }
  if (!s.adapterSpawned) return null;
  // a service this call started needs about a second to listen; while it boots it can answer
  // 503 or not at all, so the last answer inside the window is the one recorded
  const until = Date.now() + 8_000;
  while (Date.now() < until) {
    await sleep(250);
    const h = await askService();
    if (h) return h;
  }
  return null;
}

export async function legalServiceHealth(): Promise<LegalServiceHealth | null> {
  if (inTauri) {
    const h = await askService();
    return h || !bootAsked ? h : healService();
  }
  const token = devToken();
  if (!token) {
    // /health carries no document text and needs no token; it is asked only so a service
    // this page cannot use is SAID, rather than skipped in silence
    netNote(`http://127.0.0.1:${LEGAL_SERVICE_PORT}/health`);
    try {
      const r = await fetch(`http://127.0.0.1:${LEGAL_SERVICE_PORT}/health`, { signal: AbortSignal.timeout(1500) });
      noteEngineTrust({
        service: null,
        serviceRefused: r.ok
          ? `An engine service answers on 127.0.0.1:${LEGAL_SERVICE_PORT}, but this page was not given its token (VITE_SIMPLER_LEGAL_TOKEN), so it cannot send it documents; the in-app core does the work. The serve-legal.mjs header says how to set it.`
          : null,
      });
    } catch { noteEngineTrust({ service: null, serviceRefused: null }); }
    return null;
  }
  try {
    const p = await browserHello(token);
    // Recorded as in use only when it will be used: noting the service before this check put
    // "Documents go to an engine service started by hand" on screen while every document went
    // to the in-app core, because the service's model server was not answering.
    if (!p.llamaOk) {
      noteEngineTrust({
        service: null,
        serviceRefused: `The engine service on 127.0.0.1:${LEGAL_SERVICE_PORT} proved it holds this page's token, but its model server is not answering, so the in-app core does the work. Start the model server (tools/launch-server.cmd); the page asks again with each document.`,
      });
      return null;
    }
    noteEngineTrust({ service: 'hand', serviceRefused: null });
    return { ok: true, llama: true, engine: p.engine, service: 'hand', model: null };
  } catch (e) {
    const msg = errText(e);
    // nothing listening is absence, not a refusal
    noteEngineTrust({ service: null, serviceRefused: /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg) ? null : msg });
    return null;
  }
}

/** One NDJSON line from the service: {stage} while it works, {done,…} once, or {error}. */
type StripLine = { stage?: string; done?: boolean; error?: string } & Partial<LegalStripResult>;

/** Stream the frozen pipeline; onStage gets each NDJSON stage line. Throws on
 *  service error lines (fail-loud — the caller decides about the fallback).
 *
 *  `profile` is the doctrine the v2 sweep stage runs under (lib/profile.ts). It is OMITTED
 *  from the request when it is the default, so the default path sends the byte-identical
 *  body it sent before this argument existed — the adapter then applies its own
 *  PROFILE_DEFAULT and nothing about the proven path is changed by this plumbing. An
 *  unknown profile is a 400 from the adapter, never a silent fallback to the other
 *  doctrine, and that 400 arrives here as a throw. */
export async function stripLegalService(text: string, onStage: (stage: string) => void, profile?: string): Promise<LegalStripResult> {
  netNote(`http://127.0.0.1:${LEGAL_SERVICE_PORT}/strip`);
  const ask = profile && profile !== 'auto' ? profile : undefined;
  noteRunStopped(text, false);
  if (inTauri) {
    // engine.rs strip_proxy relays every line the service writes, in order, on this channel;
    // the rules are the browser path's below: an error line throws, the done line is the result.
    let done: LegalStripResult | null = null;
    let failed: string | null = null;
    // Kept apart from `failed`: a stage that threw and then could not clean up sends the disk
    // line and then its own, and the last line used to overwrite the disk words, so the receipt
    // said only that the pipeline failed (wf5 S3R-2).
    let disk = false;
    const onEvent = new Channel<StripLine>();
    onEvent.onmessage = (o) => {
      if (o.error) { const w = String(o.error); failed ??= w; disk ||= LEFT_ON_DISK_SAID.test(w); }
      else if (o.done) done = o as LegalStripResult;
      else if (o.stage) onStage(String(o.stage));
    };
    // engine.rs proves the service on the same connection the text then travels on, and says
    // who started the service and the model server behind it
    let meta: { service: Origin; model: Origin };
    try {
      meta = await invoke<{ service: Origin; model: Origin }>('strip_proxy', { text, profile: ask ?? null, onEvent });
    } catch (e) {
      // engine.rs rejects with {message, incident?, reached, service, model}; an incident (the
      // run was stopped partway: the model server it was checked against exited or stopped
      // being the one answering) is kept twice. On the engine-wide record in engine.rs's words,
      // for the screen, because the caller goes on to the in-app core and the only other trace
      // was a 60-character progress line; and against THIS document's text, so the in-app
      // core's result for it is stamped RUN_STOPPED (engine.ts, inAppCoreStamp) and its own
      // receipt says why the core read it. A result line that had already arrived does not
      // survive an incident. A failure after the document went out (`reached`) is kept against
      // the document the same way (RUN_FAILED): its receipt said "not reachable".
      //
      // Either way the disk mark goes with it: the service's disk line, relayed before the stream
      // broke or the run was stopped, and engine.rs's own `leftOnDisk` (its sweep after stopping
      // the service it started). Both were dropped here, so a document whose unredacted copy and
      // key were still on disk was receipted without the words (wf6 SL-1, SL-4). So was a result
      // line's own scratchRemoved:false, when the rejection came after it (wf6 S3-2): the
      // service's word on its result line is the same statement as its disk line. The channel
      // and the rejection travel apart, so a disk line in flight is waited for, up to 200 ms.
      // service-lifecycle.mjs holds both ends: a line landing 150 ms after the rejection keeps
      // its mark (a 50 ms wait lost it there), and a failure with no line is not held past 1 s.
      // The wait costs only runs that already failed after the document went out, and ends as
      // soon as the line has landed.
      const message = errText(e);
      const o = (e && typeof e === 'object' ? e : {}) as { incident?: unknown; reached?: unknown; service?: unknown; model?: unknown; leftOnDisk?: unknown; cutOff?: unknown };
      const after = typeof o.incident === 'string' || o.reached === true;
      const resultSaid = () => (done as LegalStripResult | null)?.scratchRemoved === false;
      for (let i = 0; after && i < 4 && !disk && !resultSaid(); i++) await sleep(50);
      const who = { service: originOf(o.service), model: originOf(o.model), leftOnDisk: disk || resultSaid() || o.leftOnDisk === true };
      if (typeof o.incident === 'string') {
        // engine.rs cutOff: the run was stopped because one of the model's answers was not whole
        // (relay.rs, ruling 15), which the rail and the stopped document's receipt name apart
        // from a change of model server
        const cut = o.cutOff === true;
        noteEngineTrust({ incident: message, incidentCut: cut });
        noteRunStopped(text, true, { ...who, cut });
      } else if (o.reached === true) {
        noteRunFailed(text, who);
      }
      throw new Error(message);
    }
    // the last channel message and the invoke's own resolution travel separately — let the
    // channel drain before deciding the stream ended without a result
    for (let i = 0; i < 40 && !done && !failed; i++) await sleep(50);
    const got = done as LegalStripResult | null;
    // The drain stops at the done line, so a disk line sent after it can land once this has
    // decided; the service's own word on the result line does not depend on that order (wf5
    // S3R-3).
    if (got?.scratchRemoved === false) { disk = true; failed ??= LEFT_ON_RESULT_LINE; }
    if (got && !failed && !resultReadable(got)) failed = UNREADABLE_RESULT;
    if (failed || !got) {
      // strip_proxy resolves only once the stream it read has ended, so this service was sent
      // the whole document. An {error} line threw here and dropped `meta`, the one record of
      // who read it (wf5 S5L-1).
      noteRunFailed(text, { ...meta, leftOnDisk: disk });
      throw new Error(failed ?? 'legal service stream ended without a result');
    }
    return { ...got, engine: `${got.engine}${handSuffix(meta?.service, meta?.model)}` };
  }
  // Browser: with the service's token (developer preview), prove it first and present the
  // token. Without one the request is the plain one below; a service that holds the token
  // gate answers it 401, and legalServiceHealth has already routed documents to the in-app
  // core and said why, so this path is reached only by a caller that skipped that check.
  const token = devToken();
  if (token) await browserHello(token);
  const res = await fetch(`http://127.0.0.1:${LEGAL_SERVICE_PORT}/strip`, {
    method: 'POST',
    headers: token ? { 'content-type': 'application/json', authorization: `Bearer ${token}` } : { 'content-type': 'application/json' },
    body: JSON.stringify(ask ? { text, profile: ask } : { text }),
  });
  // A response came back, so the service read the request and the document in it: a failure
  // from here on is marked against this document, as on the Tauri path. A page reaches a
  // service only with its token, which only a service started by hand gives out.
  const sent = (why: string) => { noteRunFailed(text, { service: token ? 'hand' : null, leftOnDisk: LEFT_ON_DISK_SAID.test(why) }); return new Error(why); };
  if (!res.ok || !res.body) {
    // Carry the service's own words, as the Rust path already does. The one 4xx this can
    // produce is an unknown profile, and the adapter's message names what it accepts —
    // "legal service http 400" alone would strand that on the far side of the wire.
    const said = await res.text().catch(() => '');
    throw sent(`legal service http ${res.status}${said ? `: ${said.slice(0, 400)}` : ''}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let done: LegalStripResult | null = null;
  try {
    for (;;) {
      const { value, done: eof } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const o = JSON.parse(line);
        if (o.error) throw new Error(o.error);
        if (o.done) done = o as LegalStripResult;
        else if (o.stage) onStage(o.stage);
      }
      if (eof) break;
    }
  } catch (e) {
    // A result line with scratchRemoved:false, then a broken stream: the service's word on
    // the result line is the disk statement, and the break's own words dropped it (wf6 S3-2).
    throw sent((done as LegalStripResult | null)?.scratchRemoved === false ? LEFT_ON_RESULT_LINE : errText(e));
  }
  if (!done) throw sent('legal service stream ended without a result');
  if (done.scratchRemoved === false) throw sent(LEFT_ON_RESULT_LINE);
  if (!resultReadable(done)) throw sent(UNREADABLE_RESULT);
  // a service this page reaches with a token is one a developer started: the app never
  // gives a page its token. The page cannot tell who started the model server, so the id
  // claims nothing about it; the Settings line says it is used unchecked.
  return token ? { ...done, engine: `${done.engine}${HAND_SERVICE}` } : done;
}

/** Save via the OS dialog in the app; plain browser falls back to a download.
 *  Returns the chosen path (null = user cancelled).
 *
 *  CONTRACT on `defaultName`, carried by every caller: it must not contain any part of
 *  the source document's own filename. This is the one road to disk, so whatever arrives
 *  here is what the Save dialog offers and what the browser download is called — and a
 *  firm's matter file is named after its client, so `${original}.redacted.txt` shipped
 *  the client's name on a document whose body had just been redacted (screens/Export.tsx,
 *  the filename-channel comment above `docCode`). The names are built there, from a code
 *  over the document's text; this file does not and cannot check that, because it never
 *  sees the document. */
export async function saveTextFile(defaultName: string, contents: string, title?: string): Promise<string | null> {
  if (inTauri) {
    const path = await save({ defaultPath: defaultName, title });
    if (!path) return null;
    await call('write_text_file', { path, contents });
    return path;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contents], { type: 'text/plain' }));
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(a.href);
  return defaultName;
}

/** The binary twin of saveTextFile — the redacted .docx. The bytes cross the bridge as
 *  base64 to the Rust write_binary_file; the browser fallback is the same download road,
 *  and `defaultName` is under the same contract as saveTextFile's above. */
export async function saveBinaryFile(defaultName: string, bytes: Uint8Array, title?: string, mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'): Promise<string | null> {
  if (inTauri) {
    const path = await save({ defaultPath: defaultName, title });
    if (!path) return null;
    await call('write_binary_file', { path, base64: toBase64(bytes) });
    return path;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(a.href);
  return defaultName;
}

function toBase64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000)));
  return btoa(s);
}
