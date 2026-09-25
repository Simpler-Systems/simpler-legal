import { useMemo, useState } from 'react';
import type { Entity, QFile } from '../lib/store';
import { catLabel, catColor } from '../lib/categories';
import { isFloorRow } from '../lib/engine';

/** Long lists are for narrowing, not scrolling — the cap is stated, never silent. */
const SHOWN = 200;

interface Hit { fileId: string; fileName: string; occ: number }
interface Group { key: string; text: string; cat: Entity['cat']; hits: Hit[]; occ: number }

interface Props { files: QFile[]; onOpenFile: (id: string) => void; onGoToDrop: () => void }

export default function Find({ files, onOpenFile, onGoToDrop }: Props) {
  const [query, setQuery] = useState('');

  // The index: one row per distinct entity text (case-insensitive), carrying
  // every document it was found in. Deterministic table build — no scoring.
  const { groups, docsIndexed, unindexed, origin } = useMemo(() => {
    const acc = new Map<string, { forms: Map<string, number>; cats: Map<string, number>; hits: Map<string, Hit> }>();
    const docs = new Set<string>();
    let noTable = 0;
    // where the rows came from, COUNTED — the subtitle used to credit "the engine" for
    // every row, including the sample's canned list and rows typed in by hand (audit B7)
    const origin = { engine: 0, sample: 0, protected: 0, floor: 0, manual: 0 };
    for (const f of files) {
      const ents = f.entities;
      if (!ents || ents.length === 0) { if (f.state === 'ready') noTable++; continue; }
      docs.add(f.id);
      for (const e of ents) {
        if (f.sample) origin.sample++;
        else if (isFloorRow(e)) origin.floor++;
        else if (e.cat === 'protected') origin.protected++;
        else if (e.prov === 'added by you') origin.manual++;
        else origin.engine++;
        const key = e.text.toLowerCase();
        let g = acc.get(key);
        if (!g) { g = { forms: new Map(), cats: new Map(), hits: new Map() }; acc.set(key, g); }
        g.forms.set(e.text, (g.forms.get(e.text) || 0) + e.occ);
        g.cats.set(e.cat, (g.cats.get(e.cat) || 0) + 1);
        const hit = g.hits.get(f.id);
        if (hit) hit.occ += e.occ;
        else g.hits.set(f.id, { fileId: f.id, fileName: f.name, occ: e.occ });
      }
    }
    const top = <T,>(m: Map<T, number>, fallback: T): T => {
      let best = fallback; let n = -1;
      for (const [k, v] of m) if (v > n) { best = k; n = v; }
      return best;
    };
    const out: Group[] = [];
    for (const [key, g] of acc) {
      const hits = [...g.hits.values()].sort((a, b) => b.occ - a.occ || a.fileName.localeCompare(b.fileName));
      out.push({
        key,
        text: top(g.forms, key),
        cat: top(g.cats, 'term') as Entity['cat'],
        hits,
        occ: hits.reduce((a, h) => a + h.occ, 0),
      });
    }
    out.sort((a, b) => b.hits.length - a.hits.length || b.occ - a.occ || a.text.localeCompare(b.text));
    return { groups: out, docsIndexed: docs.size, unindexed: noTable, origin };
  }, [files]);

  const originLine = (() => {
    const parts: string[] = [];
    if (origin.engine) parts.push(`${origin.engine} marked by the engine`);
    if (origin.protected) parts.push(`${origin.protected} from your protected terms`);
    if (origin.floor) parts.push(`${origin.floor} placed by the safety-net pattern`);
    if (origin.manual) parts.push(`${origin.manual} added by hand in a review`);
    if (origin.sample) parts.push(`${origin.sample} from the sample document's fixed demo list`);
    if (!parts.length) return 'Nothing has been marked on this machine yet.';
    return `The index is built from the rows in each document's review: ${parts.join(', ')}${origin.engine === 0 ? ' — no engine marked any of them' : ''}.`;
  })();

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () => (!q ? groups : groups.filter((g) => g.key.includes(q) || g.hits.some((h) => h.fileName.toLowerCase().includes(q)))),
    [groups, q],
  );

  const docWord = (n: number) => `${n} document${n === 1 ? '' : 's'}`;

  return (
    <section className="screen">
      <h1>Find across documents</h1>
      <div className="sub">
        Which of your documents mention a name, a company, or a number. {originLine}
      </div>

      {files.length === 0 ? (
        <div className="setcard" style={{ maxWidth: 560 }}>
          <div className="srow" style={{ gap: 10, alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mut)" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></svg>
            <b>Nothing indexed yet</b>
          </div>
          <div className="srow" style={{ color: 'var(--ink2)' }}>
            Find lists documents after they have been read and redacted here. Drop a file — or the
            sample NDA — and it joins the index for the rest of the session.
          </div>
          <div className="srow"><button className="btn-plain" style={{ textDecoration: 'underline' }} onClick={onGoToDrop}>Go to Drop</button></div>
        </div>
      ) : groups.length === 0 ? (
        <div className="setcard" style={{ maxWidth: 560 }}>
          <div className="srow" style={{ gap: 10, alignItems: 'center' }}>
            <b>{docWord(files.length)} here, none with an entity table</b>
          </div>
          <div className="srow" style={{ color: 'var(--ink2)' }}>
            Nothing was marked on them — either the engine was offline when they were read, or it
            found nothing. Drop them again with the engine running and they will appear here.
          </div>
          <div className="srow"><button className="btn-plain" style={{ textDecoration: 'underline' }} onClick={onGoToDrop}>Go to Drop</button></div>
        </div>
      ) : (
        <>
          <input
            className="railsearch"
            style={{ fontSize: 14, padding: '10px 12px', margin: '0 0 10px' }}
            autoFocus
            type="search"
            aria-label="Search every document you have processed"
            placeholder="Search every document you’ve processed — a name, a company, a number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setQuery(''); } }}
          />

          <div style={{ fontSize: 13, color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>
            {groups.length.toLocaleString()} distinct {groups.length === 1 ? 'entity' : 'entities'} indexed
            across {docWord(docsIndexed)}, on this machine.
            {unindexed > 0 && <span style={{ color: 'var(--mut)' }}> {docWord(unindexed)} carry no entity table and are not in the index.</span>}
          </div>

          {results.length === 0 ? (
            <div className="setcard" style={{ maxWidth: 560, marginTop: 18 }}>
              <div className="srow"><b>Nothing matches “{query.trim()}” in the {docWord(docsIndexed)} indexed so far.</b></div>
              <div className="srow" style={{ color: 'var(--ink2)' }}>
                This matches the exact text marked in a review. A shorter fragment of the name may find it.
              </div>
            </div>
          ) : (
            <>
              <div className="seclbl">
                {q ? 'Matches' : 'Everything indexed'}
                <span className="cnt">
                  {results.length.toLocaleString()} {results.length === 1 ? 'entity' : 'entities'}
                  {results.length > SHOWN ? ` · showing the first ${SHOWN}` : ''}
                </span>
              </div>

              {results.slice(0, SHOWN).map((g) => {
                const multi = g.hits.length > 1;
                return (
                  <div key={g.key} style={{ borderTop: '1px solid var(--hair)', padding: '13px 2px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <b style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{g.text}</b>
                      <span className="catchip" style={{ cursor: 'default' }}>
                        <i style={{ background: catColor(g.cat) }} />{catLabel(g.cat)}
                      </span>
                      <span style={{ fontSize: 12.5, color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={multi ? { color: 'var(--amber)', fontWeight: 600 } : undefined}>in {docWord(g.hits.length)}</span>
                        {' · '}{g.occ.toLocaleString()} mention{g.occ === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {g.hits.map((h) => (
                        <button key={h.fileId} className="chipf" title={`Open ${h.fileName}`} onClick={() => onOpenFile(h.fileId)}>
                          {h.fileName} <span style={{ color: 'var(--mut)' }}>×{h.occ}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {results.length > SHOWN && (
                <div className="undernote" style={{ textAlign: 'left' }}>
                  {(results.length - SHOWN).toLocaleString()} more are indexed but not drawn — type more of the name to narrow the list.
                </div>
              )}
            </>
          )}
        </>
      )}

      <div className="postnote" style={{ color: 'var(--mut)' }}>
        This is a literal index, not a search engine: it matches the exact text marked in each
        document's review — by the engine, the safety-net pattern, your protected terms or your own
        hand — including rows you chose to leave visible. A party referred to only by a nickname, an
        initial, or a spelling nothing marked will not appear here, and nothing on this screen judges
        whether two spellings are the same person.
      </div>
    </section>
  );
}
