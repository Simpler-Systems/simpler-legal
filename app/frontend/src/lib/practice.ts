// THE PRACTICE SETTING — which jurisdiction's floor table runs after the frozen one
// (lib/floorTables.mjs). Stored on this machine only, like the protected terms; read by
// engine.ts remask() on every call, so no surface can mask with a different table than
// the export writes.

import { DEFAULT_PRACTICE, isPractice } from './floorTables.mjs';

export type Practice = 'sg' | 'us' | 'uk';

const KEY = 'simpler-legal.practice';

export function loadPractice(): Practice {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    return raw && isPractice(raw) ? (raw as Practice) : (DEFAULT_PRACTICE as Practice);
  } catch {
    return DEFAULT_PRACTICE as Practice;
  }
}

export function savePractice(p: Practice): Practice {
  const next: Practice = isPractice(p) ? p : (DEFAULT_PRACTICE as Practice);
  try { localStorage.setItem(KEY, next); } catch { /* private mode: the session default stands */ }
  return next;
}
