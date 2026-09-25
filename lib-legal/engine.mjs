// v1-legal — the legal fork of simpler-red's engine. Version of record: v1-legal.1
//
// Architecture: v1 (simpler-red, imported frozen — NEVER modified) produces the base strip and
// entity table; the legal delta is deterministic post-rails, each landed as a measured arm on
// the TAB dev slice (see BENCHMARK.md):
//   L1   recall rails: application numbers, dates, amounts, ages
//   L1b  bare years
//   L2   institutional KEEP-restore (courts, governments, ministries survive — checkability)
// Fail-closed inherits from v1: if any v1 model layer fails, complete:false and no output.
// The rails themselves are pure functions and cannot fail open.

import {
  L1_RULES_NO_CODE, L1C_RULES, L3_RULES, L4_RULES, L6_RULES, applyL1bGuarded,
  applyRulesProtected, applyL8, applyL9, applyL9Wide, applyAppNumbersGuarded,
  restoreInstitutional, restoreOfficialPersons, INSTITUTIONAL_WIDE_RE,
  institutionalGlossAliases, protectedRanges,
} from './legal-rails.mjs'
import { restoreByPolicy } from './router.mjs'

export const VERSION = 'v1-legal.8' // .7 + umbrella-label policy restore (echr+gov+court)

const { anonymizeTwoEngine } = await import('../lib-core/engineB.mjs')

// Stack of record (measured on the TAB dev slice, see BENCHMARK.md):
//   L1  app numbers / dates / amounts / ages     L1b  bare years
//   L3  uncurrencied sums, sentence durations    L4   nationality expressions (global list)
//   L2  blunt institutional restore — chosen over the context-aware variant (v2): +4.6
//       NO_MASK for −1.0 QUASI on the slice, and it needs no ECHR caption formula, so it
//       behaves identically on US/SG documents.
export const RESTORE_POLICY = { 'echr-organ': true, government: true, court: true, company: false, other: false }

export async function anonymizeLegal(text, complete, opts = {}) {
  const base = await anonymizeTwoEngine(text, complete)
  if (!base.complete) return { ...base, version: VERSION } // fail-closed passthrough
  // all recall rails run under the public-body span lock (protected ranges), so no rail can
  // carve the inside out of "Izmir Administrative Court"; years get the statute guard
  // the document teaches its own institutional vocabulary (gloss rule) — language-agnostic
  const aliases = institutionalGlossAliases(text)
  let masked = base.masked
  const railAdded = []
  const cg = applyAppNumbersGuarded(masked) // own app numbers mask; precedent cites survive
  masked = cg.text
  railAdded.push(...cg.added)
  for (const rules of [L1_RULES_NO_CODE, L1C_RULES, L3_RULES, L4_RULES, L6_RULES]) {
    const r = applyRulesProtected(masked, rules, protectedRanges(masked, aliases))
    masked = r.text
    railAdded.push(...r.added)
  }
  const l1b = applyL1bGuarded(masked)
  masked = l1b.text
  railAdded.push(...l1b.added)
  for (const fn of [applyL8, applyL9, applyL9Wide]) {
    const r = fn(masked, aliases)
    masked = r.text
    railAdded.push(...r.added)
  }
  // restore stage: umbrella-label policy (wave-1 race winner: echr-organ+government+court
  // restored, company/other stay masked — company-restores measurably leak DIRECT).
  // Labels come from the router seat when a live `complete` is available; the keyword
  // restore is the deterministic fallback so the engine never depends on the model for
  // fail-closed behavior.
  let l2
  if (opts.labels) {
    const lp = restoreByPolicy(masked, base.table, opts.labels, RESTORE_POLICY)
    l2 = { text: restoreOfficialPersons(lp.text, base.table, text).text, restored: lp.restored }
  } else {
    const l2pre = restoreInstitutional(masked, base.table, INSTITUTIONAL_WIDE_RE, aliases)
    l2 = { text: restoreOfficialPersons(l2pre.text, base.table, text).text, restored: l2pre.restored }
  }
  return {
    ...base,
    version: VERSION,
    masked: l2.text,
    // reviewer sees EVERY mask: v1's table plus the rail-added spans, restores flagged
    table: [
      ...base.table,
      ...railAdded.map((a) => ({ span: a.span, cls: a.cls.toUpperCase(), src: 'legal-rail', tag: `[${a.cls}]` })),
    ],
    legalDelta: { railAdded, institutionalRestored: l2.restored },
  }
}
