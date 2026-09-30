import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QFile } from '../lib/store';
import { buildLibrary } from '../../../../related.mjs';

/** A file joins the library once the app has read its text: waiting for the engine, being
 *  redacted, or done. A held file does not — the Redact lane has said it cannot use it, and
 *  ranking it here would treat it as read. */
const readable = (f: QFile) => !!f.text && (f.state === 'queued' || f.state === 'stripping' || f.state === 'ready');

interface Props { files: QFile[]; onGoToDrop: () => void }

/** Related cases, over the documents added this session. The ranking is related.mjs — the same
 *  code that builds the example library — run here, in memory, on each document's text; the
 *  map (public/synergy.html) receives the result by postMessage and keeps nothing. The example
 *  library of published opinions stays one click away, labelled as the example it is. */
export default function Related({ files, onGoToDrop }: Props) {
  const [lib, setLib] = useState<'mine' | 'example'>('mine');
  const docs = files.filter(readable);
  const held = files.filter((f) => f.state === 'held').length;
  const reading = files.filter((f) => f.state === 'reading').length;

  // Rebuilt when the SET of documents changes, not on every status tick of a redaction in
  // progress: a rebuild remounts the map and would drop the document you had open.
  const key = docs.map((f) => f.id).join('\n');
  const built = useMemo(() => {
    if (docs.length < 2) return null;
    const graph = buildLibrary(docs.map((f) => ({ id: f.id, name: f.name, text: f.text || '' })));
    const texts: Record<string, string> = {};
    for (const f of docs) texts[f.id] = f.text || '';
    // the map opens on the newest document: the one that just arrived on your desk
    return { graph, texts, subject: docs[docs.length - 1].id };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The map is handed its library twice over: when it says it is ready, and when the frame
  // finishes loading. Either alone can lose the race with this component's effect; the map
  // takes the first and ignores the second.
  const frame = useRef<HTMLIFrameElement>(null);
  const send = useCallback(() => {
    const w = frame.current?.contentWindow;
    if (!w || !built) return;
    // a custom-scheme webview can report its origin as "null", which postMessage refuses as a
    // target; the frame is identified by its window either way
    const target = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*';
    w.postMessage({ type: 'related:data', ...built }, target);
  }, [built]);
  useEffect(() => {
    if (lib !== 'mine' || !built) return;
    const onMessage = (ev: MessageEvent) => {
      if (ev.source === frame.current?.contentWindow && ev.data?.type === 'related:ready') send();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [lib, built, send]);

  const docWord = (n: number) => `${n} document${n === 1 ? '' : 's'}`;
  const aside = [
    held ? `${held} held file${held === 1 ? ' is' : 's are'} not included` : '',
    reading ? `${reading} still being read` : '',
  ].filter(Boolean).join(' · ');

  if (lib === 'mine' && !built) {
    return (
      <section className="screen">
        <h1>Related cases</h1>
        <div className="sub">
          How the documents you add connect: which cite one another, which rely on the same
          authorities, and which read alike. It runs on this machine, over this session’s documents.
        </div>
        <div className="setcard" style={{ maxWidth: 560 }}>
          <div className="srow" style={{ gap: 10, alignItems: 'center' }}>
            <b>{docs.length === 0 ? 'Nothing to relate yet' : 'One document so far'}</b>
          </div>
          <div className="srow" style={{ color: 'var(--ink2)' }}>
            {docs.length === 0
              ? 'Add two or more documents and each is ranked against the others here.'
              : `${docs[0].name} is read. Add another and this shows how they connect.`}
            {aside && <span style={{ color: 'var(--mut)' }}> {aside[0].toUpperCase() + aside.slice(1)}.</span>}
          </div>
          <div className="srow" style={{ gap: 16 }}>
            <button className="btn-plain" onClick={onGoToDrop}>Go to Drop</button>
            <button className="btn-plain" style={{ border: 'none', textDecoration: 'underline' }} onClick={() => setLib('example')}>
              See it on the example library
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid var(--hair)', background: 'var(--paper)' }}>
        <div className="seg" role="group" aria-label="Which library the map shows">
          <button data-on={lib === 'mine' || undefined} aria-pressed={lib === 'mine'} onClick={() => setLib('mine')}>
            Your documents · {docs.length}
          </button>
          <button data-on={lib === 'example' || undefined} aria-pressed={lib === 'example'} onClick={() => setLib('example')}>
            Example library
          </button>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
          {lib === 'example'
            ? 'Published US federal appellate opinions that ship with the app, there to show how this works. None of your documents are in it.'
            : `${docWord(docs.length)} from this session, ranked against each other on this machine.`}
          {lib === 'mine' && aside && <span style={{ color: 'var(--mut)' }}> {aside[0].toUpperCase() + aside.slice(1)}.</span>}
        </span>
      </div>
      {/* allow=fullscreen is what lets the map's own Full screen button cover the monitor.
          Without it requestFullscreen is refused inside the frame and the map falls back to
          covering only the iframe — the rail would stay put. */}
      {lib === 'mine'
        ? <iframe key={key} ref={frame} src='/synergy.html?theme=light&embed=1&lib=mine' title='Related cases: your documents'
            allow='fullscreen' onLoad={send}
            style={{ width: '100%', flex: 1, minHeight: 0, display: 'block', border: 'none', background: 'var(--table)' }} />
        : <iframe key='example' src='/synergy.html?theme=light&embed=1&case=c1-fourth-amendment-new.txt' title='Related cases: example library'
            allow='fullscreen'
            style={{ width: '100%', flex: 1, minHeight: 0, display: 'block', border: 'none', background: 'var(--table)' }} />}
    </div>
  );
}
