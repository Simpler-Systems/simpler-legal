// THE DOCTRINE PROFILE — which doctrine the frozen v2 sweep stage runs under. Stored on
// this machine only, like the practice setting and the protected terms; read by engine.ts
// stripDocument() on every call, so no surface can strip under a different doctrine than
// the receipt names.
//
// This is a DIFFERENT AXIS from lib/practice.ts. Practice picks which jurisdiction's
// safety-net table runs AFTER the frozen engine. This picks how the frozen engine itself
// treats two classes, and it changes exactly one argument of one stage (FREEZE.md,
// "Profiles added AFTER the freeze"). Both can be set; neither implies the other.
//
// Default is 'auto' and must stay 'auto'. The firm doctrine is a measured improvement on
// hand-listed identifiers over 20 documents — it has no sealed gold and no walk-forward
// round board, which is why FREEZE.md makes it reachable "only when a caller asks for it
// by name". A default is not asking for it by name.

export type EngineProfile = 'auto' | 'firm';

const KEY = 'simpler-legal.profile';

export const DEFAULT_PROFILE: EngineProfile = 'auto';

export function isEngineProfile(v: unknown): v is EngineProfile {
  return v === 'auto' || v === 'firm';
}

export function loadProfile(): EngineProfile {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    return isEngineProfile(raw) ? raw : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(p: EngineProfile): EngineProfile {
  const next: EngineProfile = isEngineProfile(p) ? p : DEFAULT_PROFILE;
  try { localStorage.setItem(KEY, next); } catch { /* private mode: the session default stands */ }
  return next;
}

/** The two doctrines in the words of the thing they change, not in engine vocabulary.
 *  `measured` is the receipt line for each: what was actually run, and over what. */
export const PROFILES: { id: EngineProfile; label: string; note: string; measured: string }[] = [
  {
    id: 'auto',
    label: 'General documents',
    note: 'a company name is released when it is not the document\u2019s own identity, and cited cases are masked with everything else',
    // Scoped because the 46 are business agreements and 45 of them ran the engine as it stood
    // before the freeze; an unscoped line read as 46 documents of any kind on this setting.
    // DIRECT only: on the same 46 boards 245 of 503 quasi-identifiers stayed readable
    // (pii-bench/runs ROUND5/6/7-edgar-firstcontact + PUREOOS, perDoc), so "zero identity
    // leaks" without the qualifier is false on the one card where a lawyer picks what to trust.
    measured: 'zero DIRECT-identifier leaks (names, emails, numbers that identify someone on their own) over 46 unseen business agreements in four consecutive draws (3 of the 46 carry no DIRECT identifier, so 43 had one to leak); 245 of their 503 quasi-identifiers (amounts, dates, places, organisations) stayed readable — 45 ran the engine before the freeze, one ran it frozen (FREEZE.md, C1). Frozen, on 20 public filings in a firm’s shapes: readable identifiers 27, documents with one 14/20, citations kept 11% — hand-listed, not sealed gold',
  },
  {
    id: 'firm',
    label: 'Our own matter files',
    // "Never released" was the whole note until 2026-09-24 (D2L-5), but the citation rail
    // releases every party name inside a citation it keeps, and its guard compares words: a
    // citation stays masked when it shares one with a party this document names outside its
    // citations, and generic corporate words and words under three letters are not compared
    // (CITE_TOKEN_STOP and identityToks, lib-legal/legal-rails.mjs). So a client named only in
    // such words ("Global Capital Partners LLC", "IB LLC") has nothing to compare, and its own
    // earlier case was released in a probe of the rail. The note says so rather than promise.
    note: 'company and brand names are not released outside a reported case citation \u2014 on a firm\u2019s paper the party organisation IS the matter \u2014 and reported case citations are kept readable, the names of their parties included, because they are usually why the file is going to a model at all. A citation stays masked when a word of its parties\u2019 names is also a word of a party this document names outside its citations; generic words such as Global, Group, American or LLC, and words under three letters, are not compared, so a client whose name is made only of such words can have its own earlier case left readable',
    measured: '21 public filings in a firm\u2019s shapes, 20 scorable: readable identifiers 27 \u2192 11, documents with one 14/20 \u2192 8/20, citations kept 11% \u2192 56%. Hand-listed identifiers, not a sealed walk-forward round \u2014 see FREEZE.md',
  },
];

export function profileLabel(p: EngineProfile): string {
  return PROFILES.find((x) => x.id === p)?.label ?? p;
}
