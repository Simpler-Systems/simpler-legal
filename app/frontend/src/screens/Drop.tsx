import { useEffect, useRef, useState } from 'react';
import { queueNote, queuePosition, type QFile } from '../lib/store';
import { DOCX_SAVE_NOTE } from '../lib/review';

interface Props {
  files: QFile[];
  onDropFiles: (dt: DataTransfer) => void;
  onBrowse: (files: File[]) => void;
  onSample: () => void;
  onReview: (id: string) => void;
  onRemove: (id: string) => void;
  onExport: (id?: string) => void;
  onShowNetlog: () => void;
  /** the live network reading, from lib/netmeter via App — never a literal */
  net: { observing: boolean; offAny: boolean };
  /** shown while the local engine is still warming — drops queue, nothing blocks */
  engineNote?: string | null;
  /** true when the engine failed (offline / no model) — renders as a banner with Retry */
  engineFailed?: boolean;
  onRetryEngine?: () => void;
}

/* A held row grows to hold its reason on a line of its own: the row is a fixed-height flex
   line (shell.css .q-row), and a reason with a way through runs to two or three lines. */
const HELD_ROW: React.CSSProperties = { height: 'auto', minHeight: 48, flexWrap: 'wrap', rowGap: 4, paddingTop: 10, paddingBottom: 10 };
const HELD_WHY: React.CSSProperties = { flexBasis: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink2)' };

/* The drop visual is a demo, not a decoration (show-don't-claim): a fan of the three
   accepted document types, and the center sheet performs the product on a slow loop —
   a line of text gets marked (red outline, pending) then inked (applied). Red stays
   redaction-semantics; applied redaction is ink, per the spec. */
const DropVisual = () => (
  <div className="dv" aria-hidden="true">
    <div className="dv-sheet dv-side dv-l">
      <span className="dv-badge" data-t="txt">TXT</span>
      <span className="dv-line" /><span className="dv-line dv-short" /><span className="dv-line" /><span className="dv-line" />
    </div>
    <div className="dv-sheet dv-c">
      <span className="dv-badge" data-t="pdf">PDF</span>
      <span className="dv-line" />
      <span className="dv-line dv-redact dv-d1" />
      <span className="dv-line" />
      <span className="dv-line dv-redact dv-d2 dv-short" />
      <span className="dv-line dv-short" />
    </div>
    <div className="dv-sheet dv-side dv-r">
      <span className="dv-badge" data-t="docx">DOCX</span>
      <span className="dv-line dv-short" /><span className="dv-line" /><span className="dv-line" /><span className="dv-line dv-short" />
    </div>
  </div>
);

export default function Drop({ files, onDropFiles, onBrowse, onSample, onReview, onRemove, onExport, onShowNetlog, net, engineNote, engineFailed, onRetryEngine }: Props) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = files.filter((f) => f.state === 'ready').length;
  // Counted separately from "ready" on purpose: the engine runs one document at a
  // time, so on a multi-file drop most of the queue is waiting, and a header that
  // called them ready was the first place the app said so.
  const waiting = files.filter((f) => f.state === 'queued' || f.state === 'stripping').length;
  const held = files.filter((f) => f.state === 'held' || f.state === 'error').length;
  const hasQueue = files.length > 0;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); inputRef.current?.click(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); onDropFiles(e.dataTransfer); },
  };

  return (
    <section className="screen wide">
      <input ref={inputRef} type="file" multiple hidden
        accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => { if (e.target.files?.length) onBrowse(Array.from(e.target.files)); e.target.value = ''; }} />

      <h1>{hasQueue ? 'Documents' : 'Drop a document to redact'}</h1>
      <div className="sub">{hasQueue
        ? 'Drop more anytime — everything found waits for your review before anything exports.'
        : 'Read locally in seconds — you review everything it finds before anything is exported.'}</div>
      {engineNote && (
        engineFailed ? (
          <div className="enginebanner" role="alert">
            <span className="eb-icon">⚠</span>
            <span className="eb-text">{engineNote}</span>
            {onRetryEngine && <button className="btn-plain eb-retry" onClick={onRetryEngine}>Retry engine</button>}
          </div>
        ) : (
          <div className="sub" style={{ color: 'var(--amber)', marginTop: 2 }}>{engineNote}</div>
        )
      )}

      {hasQueue ? (
        <div className="dropslim" {...dropHandlers} data-over={over || undefined} onClick={() => inputRef.current?.click()}>
          <span className="dv-miniwrap" aria-hidden="true"><DropVisual /></span>
          <span>Drop more files or folders — or <u>browse</u></span>
        </div>
      ) : (
        <div className="dropcard" {...dropHandlers} data-over={over || undefined} onClick={() => inputRef.current?.click()}>
          <DropVisual />
          <h2>Drop files or folders here</h2>
          <div className="fmts">PDF, Word (.docx), or plain text</div>
          <button className="btn-browse" type="button">Browse files</button>
          <div className="kbdline">or press <kbd>Ctrl</kbd>+<kbd>O</kbd> to browse</div>
          <div className="dropfoot" onClick={(e) => e.stopPropagation()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            {!net.observing
              ? 'Read on this machine. The network record is unavailable in this browser — open it to see what is and is not counted.'
              : net.offAny
                ? 'Read on this machine — but an off-machine request has been recorded this session. Open the record.'
                : 'Read on this machine. Nothing has left it this session — the record next to this line is the measurement, not a promise.'}
            <button className="btn-quiet" onClick={onShowNetlog}>See the network record</button>
          </div>
        </div>
      )}

      {!hasQueue && (
        <>
          <div className="seclbl" style={{ marginTop: 22 }}>What happens next</div>
          <div className="nextstrip">
            <span className="stepbit"><span className="n">1</span><span><b>Drop</b> — read instantly; scanned pages are set aside, never silently skipped</span></span>
            <span className="stepbit"><span className="n">2</span><span><b>Review</b> — everything found, in one table, approved by you</span></span>
            <span className="stepbit"><span className="n">3</span><span><b>Export</b> — only the redacted copy ever leaves</span></span>
          </div>

          <div className="seclbl" style={{ marginTop: 24 }}>Start somewhere safe</div>
          <button className="starter" onClick={onSample}>
            <span className="fbadge">NDA</span>
            <b>Try it on a sample NDA</b>
            <span className="fmeta">1 page · 14 entities · the whole flow, no real data</span>
            <span className="btn-ghost">Try the sample</span>
          </button>
          <div className="undernote" style={{ textAlign: 'left' }}>
            Scanned pages are held for now — reading them needs OCR, which ships later.
          </div>
        </>
      )}

      {hasQueue && (
        <>
          <div className="seclbl">Queue <span className="cnt">{ready} ready{waiting ? ` · ${waiting} waiting for the engine` : ''}{held ? ` · ${held} held` : ''}</span></div>
          {files.map((f) => (
            <div key={f.id} className="q-row" data-held={f.state === 'held' || f.state === 'error' || undefined}
              style={((f.state === 'held' || f.state === 'error') && f.reason) || (f.state === 'ready' && !f.reviewed && f.reopened) ? HELD_ROW : undefined}>
              <span className="fbadge" data-t={f.badge.toLowerCase()}>{f.badge}</span>
              <span className="fname" title={f.name}>{f.name}</span>
              {f.meta && <span className="fmeta">{f.meta}</span>}
              <span className="well" style={f.state === 'stripping' ? { flex: 1, minWidth: 200 } : { width: 'auto', minWidth: 200 }}>
                {f.state === 'reading' && (<><span className="scanbar" role="progressbar" aria-label="Reading file"><i style={{ width: '55%' }} /></span><span style={{ whiteSpace: 'nowrap' }}>Reading…</span></>)}
                {/* Deliberately no status dot and no Review button. This row used to
                    render as 'ready': a done-dot, the word "Read", and a live Review
                    button — the row a finished, genuinely clean document draws. The
                    lawyer opened it, read "Nothing is marked on this document", and
                    the file would have exported with every name still in it. The wait
                    is in the words because the row has no other way to say it. */}
                {f.state === 'queued' && (
                  <span style={{ whiteSpace: 'nowrap', color: 'var(--mut)' }}>{queueNote(queuePosition(files, f.id))}</span>
                )}
                {f.state === 'stripping' && (
                  <span className="stripwell">
                    <span className="striptop">
                      <span className="pctlbl">{f.stripPct ?? 0}%</span>
                      <span className="striplabel">{f.statusLabel}</span>
                    </span>
                    <span className="stripbar" role="progressbar" aria-valuenow={f.stripPct ?? 0} aria-valuemin={0} aria-valuemax={100}>
                      <i style={{ width: `${Math.max(2, f.stripPct ?? 2)}%` }} />
                    </span>
                  </span>
                )}
                {f.state === 'ready' && (<>
                  <span className="ringi" data-s={f.entities && f.entities.length > 0 ? 'rev' : 'done'} />
                  <span style={{ whiteSpace: 'nowrap' }}>{f.sample ? `${f.entities?.length ?? 0} entities (sample)` : f.statusLabel}</span>
                  {/* The chip is the finish attestation and nothing else. It used to show on
                      the sample the moment it was added — "Reviewed ✓" on a document nobody
                      had opened. The sample still exports without a review (the Export
                      button below keeps that); it no longer says it had one. */}
                  {f.reviewed && f.entities && f.entities.length > 0 && <span className="revchip" title={`You finished the review of this document. Rows you did not change stand as they were marked automatically — the receipt counts both.${f.kind === 'docx' ? ` ${DOCX_SAVE_NOTE}` : ''}`}>Reviewed ✓</span>}
                  {/* A finish a later change took off (lib/attest.ts recheckFinish). Without
                      a word here the row read like a file never opened, and the reason sat
                      only on its Review screen; the chip says it in words, and the note below
                      the row says what changed and what would be readable. Amber: Export
                      holds the file until it is finished again. */}
                  {!f.reviewed && f.reopened && <span className="revchip" style={{ color: 'var(--amber)', background: 'var(--amber-wash)', borderColor: 'var(--amber)' }}>Changed since you finished</span>}
                  <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => onReview(f.id)}>Review</button>
                  {(f.reviewed || f.sample) && f.entities && f.entities.length > 0 && (
                    <button className="btn-ghost" onClick={() => onExport(f.id)}>Export</button>
                  )}
                </>)}
                {(f.state === 'held' || f.state === 'error') && <span className="heldlbl">⚠ Held</span>}
              </span>
              <button className="rm" title="Remove" aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.id)}>✕</button>
              {/* The whole reason, in the row. It sat in a hover title behind "⚠ Held" unless it was
                  under 46 characters, and every reason the intake gives with a way through is longer
                  (the encoded-block, main-text and link holds all are): on the screen where the file
                  was dropped the lawyer read "Held" and nothing else, a title never shows on touch,
                  and it is not an accessible name. */}
              {(f.state === 'held' || f.state === 'error') && f.reason && <div className="heldwhy" style={HELD_WHY}>{f.reason.replace(/^Held — /, '')}</div>}
              {/* The same for a finish a later change took off: the note was only this chip's
                  hover title, so the one sentence that names the change, what the copy would
                  now show readable and how to finish again never reached a touch screen or a
                  screen reader, and the row said only "Changed since you finished". */}
              {f.state === 'ready' && !f.reviewed && f.reopened && <div className="heldwhy" style={HELD_WHY}>{f.reopened}</div>}
            </div>
          ))}
          <details className="why">
            <summary>Why files get held — and the honest workarounds</summary>
            <p>Scanned or image-only pages have no text to read; we hold them rather than silently miss what's in the pixels. Spreadsheets: save each sheet as CSV. Slide decks: File → Export → outline text. Emails: in Outlook, File → Save As → Text. Legacy .doc: re-save as .docx. A file carrying encoded content — an email attachment pasted in as a block of base64, a certificate or key, a saved email's headers — is held too: a model can decode what this app cannot read, so it cannot mask what is inside. The hold names the line or page; save an attachment as its own file and drop that, or delete the block and drop the file again. Conversions lose images, charts, comments and hidden tabs — if the sensitive bits might live there, wait for native support.</p>
          </details>
          <div className="undernote" style={{ textAlign: 'left' }}>
            {engineFailed
              ? 'Reading is instant and local. While the engine is offline, open a document and select text to redact it manually — the export works the same.'
              : 'Reading is instant and local. Redaction runs one document at a time — the rest of a drop waits its turn. How long it takes depends on the computer: on a laptop graphics card (RTX 4060), nine court filings, 161,051 characters in all, took 10.7 minutes (642.6 seconds), about 4 seconds per 1,000 characters; the four it treated as court judgments took 3.6 to 7.8 seconds per 1,000. No timing without a graphics card has a recorded run.'}
          </div>
        </>
      )}
    </section>
  );
}
