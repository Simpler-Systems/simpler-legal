import { useEffect, useState } from 'react';
import { inTauri, modelCheck, type ModelStatus } from '../lib/tauri';
import { engineCopy, type EnginePhase } from '../lib/engineStatus';
import { loadProtectedTerms, saveProtectedTerms } from '../lib/protected';
import { loadPractice, savePractice, type Practice } from '../lib/practice';
import { loadProfile, saveProfile, PROFILES, type EngineProfile } from '../lib/profile';
import { PRACTICES } from '../lib/floorTables.mjs';
import { ModelUrl } from './Setup';

export default function Settings({ onShowSetup, engine, onRetry, onPracticeChange }: { onShowSetup: () => void; engine: EnginePhase; onRetry: () => void; onPracticeChange?: (p: Practice) => void }) {
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [terms, setTerms] = useState<string[]>(() => loadProtectedTerms());
  const [draft, setDraft] = useState('');
  // the practice: which jurisdiction's safety-net table runs after the frozen one
  // (lib/floorTables.mjs). Live, unlike the v0.2 controls beside it.
  const [practice, setPractice] = useState<Practice>(() => loadPractice());
  const choosePractice = (p: Practice) => { setPractice(savePractice(p)); onPracticeChange?.(p); };
  const practiceNote = PRACTICES.find((x) => x.id === practice)?.note ?? '';
  // the doctrine: how the frozen engine itself treats company names and cited cases.
  // A different axis from the practice above — see lib/profile.ts.
  const [profile, setProfile] = useState<EngineProfile>(() => loadProfile());
  const chooseProfile = (p: EngineProfile) => setProfile(saveProfile(p));
  const profileRow = PROFILES.find((x) => x.id === profile) ?? PROFILES[0];
  const addTerm = () => {
    const t = draft.trim();
    if (!t) return;
    setTerms(saveProtectedTerms([...terms, t]));
    setDraft('');
  };
  const dropTerm = (t: string) => setTerms(saveProtectedTerms(terms.filter((x) => x !== t)));
  // Whether the model file has been looked for: `model` null said "not found" both before the
  // check answered and when it failed, though nothing had been looked at (wf7 S6-M1).
  const [modelState, setModelState] = useState<'checking' | 'failed' | 'done'>('checking');
  const gotModel = (m: ModelStatus | null) => { setModel(m); setModelState('done'); };
  useEffect(() => {
    let alive = true;
    modelCheck(false).then((m) => { if (alive) gotModel(m); }, () => { if (alive) setModelState('failed'); });
    return () => { alive = false; };
  }, []);

  // These controls ship at v0.2 — rendered disabled so nothing LOOKS live
  // while doing nothing (QA finding: dead controls erode every other claim).
  const seg = (options: string[], on: number) => (
    <span className="seg" data-inert title="Arrives at v0.2 — not wired yet">
      {options.map((o, i) => <button key={o} data-on={i === on || undefined} disabled style={{ cursor: 'default' }}>{o}</button>)}
    </span>
  );
  const v02 = <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--mut)' }}>— controls arrive at v0.2</span>;

  // Status renders from the SAME phase as the rail and the Drop banner — one
  // truth source (lib/engineStatus), never a second probe with its own story.
  const ec = engineCopy(engine, inTauri);
  // Retry also looks for the model file again: the Model file line was read once when this
  // screen opened, so a file copied in as it instructs stayed "not found" beside a Status line
  // that had found it.
  const retry = () => {
    onRetry();
    if (inTauri) modelCheck(false).then(gotModel, () => { /* the last status stands */ });
  };
  const engineLine = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: ec.tone === 'go' ? 'var(--go)' : ec.tone === 'red' ? 'var(--red)' : 'var(--amber)', fontWeight: 600 }}>{ec.settings}</span>
      {ec.retry && <button className="btn-plain" onClick={retry}>Retry</button>}
    </span>
  );

  // Retry is drawn only in the phases engineCopy gives it (offline, nomodel, a stopped run). A
  // service already answering (App.tsx runBoot) is 'ready' whatever model_check found, so a
  // hand-started one on a model file outside these folders told the lawyer to press a Retry button
  // that was not on the screen (wf7 S6-M1). Otherwise the app looks for the file each time it
  // boots with no service answering.
  const again = ec.retry ? 'press Retry beside Status' : 'restart the app, which looks for it each time it has to start the engine itself';
  const modelLine = !inTauri
    ? <span>handled automatically in the developer preview</span>
    : model?.found
      ? <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{model.path}</span>
      : modelState === 'checking'
        ? <span style={{ color: 'var(--mut)' }}>looking…</span>
        : modelState === 'failed'
          ? <span style={{ color: 'var(--amber)' }}>could not be checked: the app’s search for the model file did not answer. To look again, {again}.</span>
          // This said "the app will tell you how to get it on first run", and nothing in this
          // version does: it has no download (Setup says so), so a lawyer waited for a prompt
          // that never came. The way through is the one the app actually has: the file, by
          // hand, in a folder model_check searches (main.rs search_dirs), then a fresh look.
          : <span style={{ color: 'var(--amber)' }}>not found. This version cannot download it: get gemma-4-E2B_q4_0-it.gguf from Google's address under Download below, then copy it (3.35 GB; it must match the SHA-256 pin above) {model?.searched?.length ? `into one of the folders it looks in (${model.searched.join(' · ')})` : 'into a folder of your choosing and start the app with SIMPLER_MODEL_PATH set to that folder'}, then {again}.</span>;

  // The hash claim is DATA, not a sentence (audit B3): this line said "checked against
  // Google's original before it ever runs" in every build, including the browser
  // preview that cannot see the file and a packaged build whose model_check(false)
  // had not hashed anything. It now says exactly what this build has and has not done.
  const [checking, setChecking] = useState(false);
  const checkNow = async () => {
    setChecking(true);
    try { gotModel(await modelCheck(true)); } catch { /* the last status stands */ } finally { setChecking(false); }
  };
  const fp = <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)' }}>(SHA-256 pin 3646B4C1…55E6FD)</span>;
  const modelClaim = !inTauri
    ? <span>Google Gemma 4, pinned by SHA-256 {fp}. This preview cannot see the model file, so it has not checked it — the launcher refuses a file that does not match the pin, and <code>node locate-model.mjs --verify</code> prints the check.</span>
    : !model?.found
      ? <span>Google Gemma 4, pinned by SHA-256 {fp} — {modelState === 'done' ? 'no model file found' : 'no model file looked at yet'}, so nothing has been checked.</span>
      : model.verified === true
        ? <span style={{ color: 'var(--go)' }}>Google Gemma 4 — this file matches the pin {fp}: hash-checked by this build.</span>
        : model.verified === false
          ? <span style={{ color: 'var(--held)' }}>Google Gemma 4 — this file does NOT match the pin {fp} and will not be used.{model.error ? ` (${model.error})` : ''}</span>
          : <span>Google Gemma 4, pinned by SHA-256 {fp} — found, but <b>not hash-checked by this build yet</b>.{model.error ? ` Last check failed: ${model.error}.` : ''} <button className="btn-plain" onClick={checkNow} disabled={checking}>{checking ? 'Checking…' : 'Check now (~15 s)'}</button></span>;

  return (
    <section className="screen wide">
      <h1>Settings</h1>
      <div className="sub">Everything here stays on this computer. No account, no sync — and no privacy switches to hunt for, because nothing phones home.</div>
      <div className="setgrid">
        <div className="setcard sg-protected">
          <h3>Protected terms <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--mut)' }}>— always redacted, model or no model</span></h3>
          <div className="srow" style={{ color: 'var(--mut)', fontSize: 12, display: 'block' }}>
            Codenames, matter numbers, deal names — the strings that are confidential because of what they
            mean inside your firm, not because of what they look like. No detector can infer that, so you
            declare them once here and every document you process masks them. They are matched exactly, as
            whole words, and they still apply when the AI engine is switched off.
          </div>
          <div className="srow" style={{ gap: 8 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTerm(); } }}
              placeholder="Project Lantern" aria-label="Add a protected term"
              style={{ flex: 1, minWidth: 0, font: 'inherit', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--ink)' }} />
            <button className="btn-plain" onClick={addTerm} disabled={!draft.trim()}>Add</button>
          </div>
          {terms.length > 0 ? (
            <div className="srow" style={{ flexWrap: 'wrap', gap: 6 }}>
              {terms.map((t) => (
                <span key={t} className="chipf" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'default', background: 'var(--w-protected)', borderColor: 'var(--c-protected)', color: 'var(--ink)' }}>
                  {t}
                  <button onClick={() => dropTerm(t)} title={`Remove “${t}”`} aria-label={`Remove ${t}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mut)', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          ) : (
            <div className="srow" style={{ color: 'var(--faint)', fontSize: 12 }}>None yet — anything you add is stored on this machine only.</div>
          )}
        </div>
        <div className="setcard sg-redact">
          <h3>Redaction <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--mut)' }}>— these documents and the practice are live; the rest becomes adjustable in v0.2</span></h3>
          <div className="srow"><span className="k">These documents</span>
            <span className="seg" role="radiogroup" aria-label="These documents">
              {PROFILES.map((p) => (
                <button key={p.id} role="radio" aria-checked={profile === p.id} data-on={profile === p.id || undefined} onClick={() => chooseProfile(p.id)}>{p.label}</button>
              ))}
            </span>
          </div>
          <div className="srow" style={{ color: 'var(--mut)', fontSize: 12, display: 'block' }}>
            What the engine treats as this matter&rsquo;s own identity. On this setting {profileRow.note}. Measured: {profileRow.measured}.
            {profile === 'firm' && ' Needs the local engine — if it isn’t running, the document still opens for manual redaction and the receipt says this doctrine did not run.'}
          </div>
          <div className="srow"><span className="k">Practice</span>
            <span className="seg" role="radiogroup" aria-label="Practice">
              {PRACTICES.map((p) => (
                <button key={p.id} role="radio" aria-checked={practice === p.id} data-on={practice === p.id || undefined} onClick={() => choosePractice(p.id as Practice)}>{p.label}</button>
              ))}
            </span>
          </div>
          <div className="srow" style={{ color: 'var(--mut)', fontSize: 12, display: 'block' }}>
            Which safety-net table runs after the frozen one. The frozen table always runs; the practice table reads only what it left readable: {practiceNote}. The receipt names the tables that ran.
          </div>
          <div className="srow"><span className="k">Save to</span>{seg(['Next to original', 'A fixed folder…'], 0)}</div>
          <div className="srow"><span className="k">Read-throughs</span>{seg(['1', '2', '3'], 1)}</div>
          <div className="srow" style={{ color: 'var(--mut)', fontSize: 12 }}>How many times the document is re-read for anything missed — more is slower and safer.</div>
        </div>
        <div className="setcard sg-engine">
          <h3>Engine <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--mut)' }}>— the AI that finds the names</span></h3>
          <div className="srow"><span className="k">AI model</span>{modelClaim}</div>
          <div className="srow"><span className="k">Model file</span>{modelLine}</div>
          <div className="srow"><span className="k">Download</span><div>Google publishes the file at this address. This app does not download it and never opens the address: click it to select it, then copy it into your browser. <ModelUrl /></div></div>
          <div className="srow"><span className="k">Status</span>{engineLine}</div>
          <div className="logpane">{`Reads your document in several passes, then double-checks its own work.
It only talks to itself, inside this computer — your documents are never logged or sent anywhere.`}</div>
          <div className="srow" style={{ marginTop: 6, gap: 14 }}>
            <button className="btn-quiet" style={{ textDecoration: 'underline' }} onClick={onShowSetup}>View first-run setup</button>
          </div>
        </div>
        <div className="setcard sg-history">
          <h3>History {v02}</h3>
          <div className="srow"><span className="k">Keep history</span>{seg(['On', 'Off'], 0)}</div>
          <div className="srow"><span className="k">Stored</span><span>on this machine only · this session</span></div>
        </div>
        <div className="setcard sg-appear">
          <h3>Appearance {v02}</h3>
          <div className="srow"><span className="k">Theme</span>{seg(['Light', 'Dark', 'System'], 0)}</div>
          <div className="srow" style={{ color: 'var(--mut)', fontSize: 12 }}>Light is what ships today. Dark arrives at v0.2 and will darken the app around your document — the document itself always stays white paper.</div>
        </div>
      </div>
    </section>
  );
}
