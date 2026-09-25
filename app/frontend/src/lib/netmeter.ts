// The network record, MEASURED — the app-layer replacement for a hardcoded 0.
//
// Two counts, kept SEPARATE for the whole life of the number, because neither
// alone is honest and adding them double-counts:
//   issued   — every request the app's one road out (lib/tauri.ts) attempted,
//              counted BEFORE the fetch, so a refused connection still shows.
//   observed — every resource the WINDOW loaded (scripts, styles, images, the
//              page's own fetches), from the browser's Resource Timing record —
//              roads the chokepoint never sees.
// A single fetch made through lib/tauri.ts appears in BOTH. Summing them would
// print "2 requests" for one request, in an artifact whose whole purpose is that
// its integers can be checked. So every surface prints the two numbers side by
// side and says which is which.
//
// SCOPE, stated here and repeated in every UI surface that prints these. This is
// what THIS WINDOW did, and only that. It does NOT see:
//   · requests made from inside a Web Worker — pdf.js fetches its cMaps and
//     standard fonts from its own worker (lib/extract/pdf.ts), and in dev the
//     strip worker fetches its lib-core module graph. Worker subresources land
//     in the WORKER's timeline, not this one.
//   · WebSocket or EventSource connections — never in Resource Timing at all
//     (Vite's own HMR socket is invisible here).
//   · other processes, and in the packaged app anything handed to the Rust side.
//   · a same-origin request that REDIRECTS off-machine — Resource Timing records
//     it under the original same-origin URL.
// Fail-loud: if Resource Timing is unavailable, `observing` is false and the UI
// must say "not measured", never "0".
// No new dependencies — PerformanceObserver is a platform API.

export type NetClass = 'app' | 'loopback' | 'offmachine';

export interface NetCounts {
  issued: Record<NetClass, number>;
  observed: Record<NetClass, number>;
  /** distinct destinations, "host:port", first-seen order (cap HOST_CAP) */
  hosts: string[];
  /** requests whose destination is NOT in `hosts` because the cap was hit — the
   *  list is then incomplete, and every surface that prints it must say so */
  unlistedRequests: number;
  /** false when Resource Timing gave us nothing — the UI must say so */
  observing: boolean;
  /** index into the event log, for netSince — not for display */
  seq: number;
}

/** the counts across one span of work (one document's engine run) */
export interface NetWindow {
  /** off-machine requests the app's own call site attempted during the span */
  offIssued: number;
  /** off-machine entries this window's timeline recorded during the span */
  offObserved: number;
  /** on-machine requests the app itself issued during the span */
  localIssued: number;
  /** on-machine resources this window loaded during the span */
  localObserved: number;
  /** destinations recorded during THIS span (not sliced off a global list), cap HOST_CAP */
  hosts: string[];
  /** distinct destinations in the span beyond the listed ones — 0 means `hosts` is all of them */
  hostsDropped: number;
  /** false = the event log hit its cap, so the span's record itself is incomplete */
  hostsComplete: boolean;
  /** false = the window timeline was unavailable; only `issued` was counted */
  measured: boolean;
}

/** true when anything went, or tried to go, off this machine in the span */
export const netOffAlarm = (w: NetWindow) => w.offIssued > 0 || w.offObserved > 0;

const zero = (): Record<NetClass, number> => ({ app: 0, loopback: 0, offmachine: 0 });
const issued = zero();
const observed = zero();
// Destination lists are capped for memory, and the cap is REPORTED: past it the
// count of unlisted requests climbs, and the UI prints it (audit B8 — the old cap
// of 24 sliced silently, so a run that touched 30 hosts listed 24 and said nothing).
const HOST_CAP = 256;
const hosts: string[] = [];
let unlistedRequests = 0;
let observing = false;

// Per-event log, so a window can report ITS OWN destinations rather than a slice
// of a global first-seen list (which gave document 1 every host and documents
// 2..n none). Bounded: past the cap we stop appending and say so, rather than
// trimming from the front and silently invalidating every outstanding mark.
interface NetEvent { cls: NetClass; where: string }
const EVENT_CAP = 4000;
const events: NetEvent[] = [];
let eventsTruncated = false;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1', '0:0:0:0:0:0:0:1']);

/** Conservative on purpose (fail-closed): anything we cannot prove is on this
 *  machine counts as off it. There is deliberately no same-origin shortcut — a
 *  page served from a non-loopback origin would classify as off-machine, which
 *  is the honest answer. A name that merely RESOLVES to loopback is not trusted
 *  either: we classify by what is written, which is what a reader can check. */
export function classify(url: string): { cls: NetClass; where: string } {
  if (/^(blob|data|about|javascript):/i.test(url)) return { cls: 'app', where: 'in-page' };
  let u: URL;
  try { u = new URL(url, location.href); } catch { return { cls: 'offmachine', where: `unparseable: ${url.slice(0, 40)}` }; }
  // Tauri's own IPC/asset protocols are in-process, not network
  if (u.protocol === 'tauri:' || u.protocol === 'ipc:' || u.protocol === 'asset:') return { cls: 'app', where: u.protocol };
  if (/^(ipc|asset|tauri)\.localhost$/i.test(u.hostname)) return { cls: 'app', where: u.hostname };
  const where = u.port ? `${u.hostname}:${u.port}` : u.hostname;
  if (LOOPBACK.has(u.hostname) || /\.localhost$/i.test(u.hostname)) return { cls: 'loopback', where };
  return { cls: 'offmachine', where };
}

function record(cls: NetClass, where: string) {
  if (where && !hosts.includes(where)) {
    if (hosts.length < HOST_CAP) hosts.push(where);
    else unlistedRequests++;
  }
  if (events.length < EVENT_CAP) events.push({ cls, where });
  else eventsTruncated = true;
}

/** Called by lib/tauri.ts before every fetch — the chokepoint's own count. */
export function netNote(url: string) {
  const { cls, where } = classify(url);
  issued[cls]++;
  record(cls, where);
}

/** Install the window-wide observer. Call once, from main.tsx, before the app. */
export function startNetMeter() {
  if (observing || typeof PerformanceObserver === 'undefined') return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const { cls, where } = classify(e.name);
        observed[cls]++;
        record(cls, where);
      }
    });
    // buffered:true delivers entries recorded before this line ran, and an
    // observer is not subject to the 250-entry resource buffer cap
    po.observe({ type: 'resource', buffered: true });
    observing = true;
  } catch { observing = false; }
}

export function netSnapshot(): NetCounts {
  return { issued: { ...issued }, observed: { ...observed }, hosts: [...hosts], unlistedRequests, observing, seq: events.length };
}

/** Open a window. Pair with netSince(). */
export function netMark(): NetCounts { return netSnapshot(); }

export function netSince(m: NetCounts): NetWindow {
  const s = netSnapshot();
  const span = events.slice(m.seq, s.seq);
  const where: string[] = [];
  for (const e of span) if (e.where && !where.includes(e.where)) where.push(e.where);
  return {
    offIssued: s.issued.offmachine - m.issued.offmachine,
    offObserved: s.observed.offmachine - m.observed.offmachine,
    localIssued: (s.issued.loopback - m.issued.loopback) + (s.issued.app - m.issued.app),
    localObserved: (s.observed.loopback - m.observed.loopback) + (s.observed.app - m.observed.app),
    hosts: where.slice(0, HOST_CAP),
    hostsDropped: Math.max(0, where.length - HOST_CAP),
    hostsComplete: !eventsTruncated,
    measured: s.observing,
  };
}
