/// <reference lib="webworker" />
// The strip runs OFF the UI thread. The worker owns the engine; the model is
// still reached only through the main thread's tauri.ts chokepoint — every
// completion crosses back as an RPC message, so the wire-audit story is
// unchanged: one file, one road out.
import { anonymizeTwoEngine } from '../../../../lib-core/engineB.mjs';
import { foldFullwidth, makeChunks, nominate } from '../../../../lib-core/anonymize.mjs';

interface CompleteReq { type: 'complete-req'; reqId: number; system: string; user: string; opts: Record<string, unknown> }
interface Pending { res: (s: string) => void; rej: (e: Error) => void }

let reqSeq = 0;
const pending = new Map<number, Pending>();
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (ev: MessageEvent) => {
  const m = ev.data;
  if (m.type === 'complete-res') {
    const p = pending.get(m.reqId);
    if (p) {
      pending.delete(m.reqId);
      m.error ? p.rej(new Error(m.error)) : p.res(m.result);
    }
    return;
  }
  if (m.type === 'strip') {
    const complete = (system: string, user: string, opts?: Record<string, unknown>) =>
      new Promise<string>((res, rej) => {
        const reqId = ++reqSeq;
        pending.set(reqId, { res, rej });
        post({ type: 'complete-req', reqId, system, user, opts: opts ?? {} } satisfies CompleteReq);
      });
    let calls = 0;
    const counted = (s: string, u: string, o?: Record<string, unknown>) => {
      calls++;
      if (calls === 1 || calls % 5 === 0) post({ type: 'progress', calls });
      return complete(s, u, o);
    };
    try {
      const doc: string = foldFullwidth(m.text);
      // The work plan, computed before the first model call: span chunks and
      // rail candidates are knowable up front; residue chunks approximated on
      // the original length; suspicion gets a small allowance. This is what
      // makes the progress bar a fraction instead of a guess.
      const spanChunks = makeChunks(doc, 500, 100).length;
      const railCandidates = nominate(doc).candidates.length;
      const residueChunks = makeChunks(doc, 900, 100).length;
      post({ type: 'plan', estTotal: spanChunks + railCandidates + residueChunks + 8 });
      const r = await anonymizeTwoEngine(doc, counted, {
        onPhase: (p: { phase: string; found?: number }) => post({ type: 'phase', ...p, calls }),
      });
      post({ type: 'done', doc, table: r.table, rejected: r.rejected ?? [], masked: r.masked, complete: r.complete, completeBy: r.completeBy, stats: r.stats });
    } catch (e: any) {
      post({ type: 'error', message: String(e?.message || e) });
    }
  }
};
