import type { QFile } from '../lib/store';

export default function History({ files, onReopen, onStart }: { files: QFile[]; onReopen: (id: string) => void; onStart: () => void }) {
  const rows = files.filter((f) => f.state !== 'reading');
  return (
    <section className="screen">
      <h1>History</h1>
      <div className="sub">Every redaction stays on this machine — files, decisions, receipts. This session's activity is below; history doesn't persist between sessions. What is kept between them is your protected-terms list, two settings, Practice and These documents (Settings → Redaction), and the local engine's two logs of its last start (legal-llama-server.log and legal-serve.log, in %LOCALAPPDATA%\Simpler AI\logs), which are rewritten each time it starts. If the app ever has to end itself after its window has closed, it adds a line saying when to legal-app-exit.log in the same folder, kept until that file passes 256 KB. When the frozen local engine runs a document it writes working copies — the unredacted document and its key — to a scratch folder and deletes them at the end of the run; a run cut short by closing the app, or one whose working copy the engine could not remove (that document’s receipt then says so), leaves them there until the engine next starts, which removes them first. The in-app core writes nothing to disk.</div>
      {rows.length === 0 && (
        <div className="setcard" style={{ maxWidth: 560 }}>
          <div className="srow" style={{ gap: 10, alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mut)" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
            <b>Nothing yet this session</b>
          </div>
          <div className="srow" style={{ color: 'var(--ink2)' }}>Drop a document or try the sample NDA — every run lands here with its counts and its receipt.</div>
          <div className="srow"><button className="btn-plain" style={{ textDecoration: 'underline' }} onClick={onStart}>Go to Redact</button></div>
        </div>
      )}
      {rows.map((f) => {
        // A finish that came off after the lawyer pressed it (lib/attest.ts recheckFinish): the
        // row said the counts and nothing else, so a file Export now holds read as finished here.
        // The cause is the record’s own words for the change (“Changing the always-redact list
        // in Settings”, “Your undo”); the note in f.reopened names the words that would be
        // readable and is shown in the review, not on a list of every file of the session.
        const off = f.state === 'ready' && !f.reviewed && !!f.reopened;
        return (
        <div key={f.id} className="hrow" data-held-row={f.state === 'held' || f.state === 'error' || undefined} onClick={() => f.state === 'ready' && onReopen(f.id)}>
          <span className="fbadge">{f.badge}</span>
          <span className="hname">{f.name}</span>
          <span className="hmeta" style={f.state !== 'ready' || off ? { color: 'var(--amber)', fontWeight: 600, whiteSpace: 'normal' } : undefined}>
            {f.state !== 'ready' ? `⚠ ${f.reason || f.statusLabel}`
              : off ? `⚠ Changed since you finished: ${f.reopen?.cause ? `${f.reopen.cause} took your finish off` : 'your finish came off'}. ${f.sample ? 'Reopen the review and finish again.' : 'Export holds this document until you reopen the review and finish again.'}`
              : (f.meta || f.statusLabel)}
          </span>
          {f.state === 'ready' && (
            <span className="hlinks"><button onClick={(e) => { e.stopPropagation(); onReopen(f.id); }}>Reopen review</button></span>
          )}
        </div>
        );
      })}
      <div className="postnote" style={{ color: 'var(--mut)' }}>Run logs record what happened — counts and stages — never what was found. Document content is never logged.</div>
    </section>
  );
}
