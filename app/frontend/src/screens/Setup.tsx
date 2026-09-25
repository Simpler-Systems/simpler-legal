// Where Google publishes the one model file the app accepts: the file by its revision, because the
// same name on that repository's main branch is a different file (THIRD_PARTY_NOTICES.md). It is
// shown as text to copy and never requested; tools/site-claims.mjs fails the build's claims when
// the app's code holds any other https:// address, or uses this one other than as {MODEL_URL}.
export const MODEL_URL = 'https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/69536a21d70340464240401ba38223d805f6a709/gemma-4-E2B_q4_0-it.gguf';

/** the address as selectable text: one click selects all of it */
export function ModelUrl() {
  return <div style={{ fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.5, userSelect: 'all', WebkitUserSelect: 'all', wordBreak: 'break-all', padding: '6px 8px', margin: '6px 0', border: '1px solid var(--border)', borderRadius: 6, textAlign: 'left' }}>{MODEL_URL}</div>;
}

export default function Setup({ onDone }: { onDone: () => void }) {
  return (
    <section className="screen" style={{ width: '100%', maxWidth: 'none' }}>
      <div className="setupcard">
        <div style={{ marginBottom: 12 }}><img src="/favicon.svg" width={32} height={32} style={{ borderRadius: 8 }} alt="" /></div>
        <h2>One-time setup</h2>
        <p>Simpler Legal needs one model file (3.35 GB — 3,349,514,112 bytes — pinned by SHA-256). It does not download it — the button below is inert. Google publishes the file on Hugging Face; download it yourself from this address (click it to select it, then copy it into your browser):</p>
        <ModelUrl />
        <p>Most browsers save it to your Downloads folder, one of the folders the app looks in; Settings → Engine lists them all and says whether it found the file. The file of the same name on that repository's main branch is a later upload with a different SHA-256, which the app refuses.</p>
        <div className="pbar"><i style={{ width: '0%' }} /></div>
        <div className="wzstat">This version (0.1.0) has no one-click download — it looks for an existing copy of the pinned model on this computer, and Settings → Engine says whether it found one. The launcher refuses a file whose hash does not match the pin; whether this build has checked it is stated under Settings → Engine.</div>
        <div className="sha">gemma-4-E2B · 3646B4C147CD…AA455E6FD</div>
        <div style={{ marginTop: 18, display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
          <button className="btn-red" disabled style={{ opacity: 0.5, cursor: 'default' }}>Download &amp; verify</button>
          <button className="btn-quiet" style={{ textDecoration: 'underline' }} onClick={onDone}>Back to the app</button>
        </div>
        <div className="postnote" style={{ textAlign: 'center', color: 'var(--mut)' }}>Saw a blue “Windows protected your PC” note when you installed? SmartScreen was telling you the truth: version 0.1.0 is <b>not code-signed</b>, so there is no publisher for Windows to recognise. The source it is built from is at github.com/Simpler-Systems/simpler-legal, where you can read what you are running and build it yourself.</div>
      </div>
    </section>
  );
}
