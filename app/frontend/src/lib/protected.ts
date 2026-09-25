// PROTECTED TERMS — the user-supplied lexicon layer.
//
// "Project Lantern" is confidential because of what it MEANS inside a firm, not
// because of what it looks like: no entity classifier can infer institutional
// sensitivity, and no amount of engine tuning closes that gap. So the user
// declares the strings, and the app masks them deterministically — add-only,
// gate-safe by construction, and applied whether or not the model ran.
//
// Storage is this machine only (localStorage), like everything else here.

const KEY = 'simpler-legal.protected-terms';

const clean = (list: unknown): string[] => {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim();
    if (!t || t.length > 120) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
};

export function loadProtectedTerms(): string[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    return clean(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function saveProtectedTerms(list: string[]): string[] {
  const next = clean(list);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep the session copy */ }
  return next;
}
