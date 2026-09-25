// ENGINE B3 — the surface-shape suspicion scorer (owner design, 2026-07-21:
// certain letter-shapes raise the likelihood a surviving token is PII — run a
// final focused sweep over exactly those survivors if not already classified).
//
// Deterministic features score every token/phrase that SURVIVED Engines A+B;
// high-suspicion survivors get ONE focused classify call each. Every feature
// is pinned to the named miss that motivated it (per-feature provenance in
// the FEATURES table — the ledger law). Verify-or-refuse and the footprint
// floor still gate admission downstream; B3 can nominate, never mask by
// itself. Zero model cost for the scorer; the shortlist is dozens, not
// hundreds (~0.5s per call ⇒ single-digit % wall-time on a typical document).
import { baseName } from './anonymize.mjs'

/** Feature registry: [name, weight, motivatingMiss, testFn(token, ctx)].
 *  Weights are coarse by design (this is a shortlist builder, not a model) —
 *  threshold 2 means "two independent shape signals, or one decisive one". */
const CORP_SUFFIX = /(?:^|\s)(?:corp|inc|llc|llp|ltd|plc|gmbh|pte|bhd|sdn|co)\.?$/i
const NAME_PARTICLE = /(?:^(?:Mc|O')|(?:berg|stein|owitz|escu|opoulos|ssen)$)/
const DIGIT_HYBRID = /^[A-Za-z]{2,10}-\d{2,6}$|^[A-Z]{2}\d{4,8}(?:-\d{1,4})*$/
const FILEISH = /^[a-z0-9_-]{4,40}\.(?:htm|html|pdf|docx?|xlsx?)$/i
const HONORIFIC_BEFORE = /(?:Mr|Ms|Mrs|Dr|Prof|Sir|Dame|Mdm)\.?\s*$/
const TITLE_OF_BEFORE = /(?:CEO|CFO|CTO|COO|President|Chairman|Director|founder)\s+of\s*$/i
const CAMEL_RESIDUE = /^[a-z]+[A-Z][A-Za-z]+$/

export const FEATURES = [
  ['corp-suffix', 2, 'r3: "ps acquisition sub corp." (lowercase-styled entity, capitalization-blind)', (tok) => CORP_SUFFIX.test(tok)],
  ['name-particle', 1, 'design prior: Mc-/O\'-/−berg surname morphology', (tok) => NAME_PARTICLE.test(tok.split(/\s+/).pop() ?? '')],
  ['digit-hybrid', 2, 'r2/r4: equipment serials "Aurora-0204", "SE060622-001"', (tok) => tok.split(/\s+/).some((w) => DIGIT_HYBRID.test(w))],
  ['file-ish', 2, 'r1/r4: filing filenames outside the rail patterns', (tok) => FILEISH.test(tok)],
  ['honorific-adjacent', 2, 'r4: surviving capitalized token after Mr/Ms/Dr', (tok, ctx) => /^[A-Z]/.test(tok) && HONORIFIC_BEFORE.test(ctx.before)],
  ['title-of-adjacent', 1, 'design prior: "CEO of ___" survivor', (tok, ctx) => /^[A-Z]/.test(tok) && TITLE_OF_BEFORE.test(ctx.before)],
  ['mask-adjacent-cap', 1, 'design prior: capitalized survivor hard against an existing mask tag', (tok, ctx) => /^[A-Z]/.test(tok) && /\[(?:Person|Company|Brand|Address|Email|Phone|Id)\d+\]\s*$/.test(ctx.before)],
  ['camel-residue', 1, 'r2: camel tokens surviving outside XBRL member shapes', (tok) => tok.split(/\s+/).some((w) => CAMEL_RESIDUE.test(w))],
]

const SKIP = /^\[(?:Person|Company|Brand|Address|Email|Phone|Id)\d+\]$|^\[(?:email|nric|card|phone|number)\]$/

/** Score surviving tokens/phrases of an ALREADY-MASKED text. Returns the
 *  suspicion shortlist: [{span, score, features, ctx}] above threshold. */
export function suspicionShortlist(maskedText, { threshold = 2, maxCandidates = 60 } = {}) {
  const out = new Map()
  const re = /[A-Za-z0-9][A-Za-z0-9.'’_\/-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.'’_\/-]*){0,3}/g
  // token-window walk: score unigrams and short phrases at each position
  const tokRe = /[A-Za-z0-9][A-Za-z0-9.'’_\/-]*/g
  let m
  while ((m = tokRe.exec(maskedText))) {
    const tok = m[0]
    if (SKIP.test(tok) || tok.length < 3) continue
    const before = maskedText.slice(Math.max(0, m.index - 24), m.index)
    const after = maskedText.slice(m.index + tok.length, m.index + tok.length + 24)
    const ctx = { before, after }
    let score = 0
    const hits = []
    for (const [name, weight, , fn] of FEATURES) {
      if (fn(tok, ctx)) {
        score += weight
        hits.push(name)
      }
    }
    if (score >= threshold) {
      const base = baseName(tok)
      if (!base) continue
      const key = base.toLowerCase()
      const prev = out.get(key)
      if (!prev || score > prev.score) {
        out.set(key, { span: base, score, features: hits, ctx: (before + tok + after).replace(/\s+/g, ' ') })
      }
    }
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, maxCandidates)
}

/** B3 pass: shortlist → one focused classify each → entries for the table.
 *  Uses the SAME frozen classify contract as the rails (one enum judgment,
 *  sentence context); admission still passes the footprint floor downstream. */
export async function suspicionPass(maskedText, complete, { CLASSIFY_SYSTEM, CLASSIFY_GRAMMAR, threshold = 2 } = {}) {
  const shortlist = suspicionShortlist(maskedText, { threshold })
  const entries = []
  // ADDITIVE (2026-07-22): non-identity verdicts kept for the review's
  // "model cleared — you confirm" tier; masking behavior unchanged.
  const rejects = []
  const stats = { shortlisted: shortlist.length, calls: 0, failedCalls: 0, admitted: 0, byFeature: {} }
  const IDENTITY = new Set(['person', 'company', 'brand', 'address'])
  for (const c of shortlist) {
    // pure-ID shapes admit deterministically (a serial is not a judgment call)
    if (c.features.includes('digit-hybrid') || c.features.includes('file-ish')) {
      entries.push({ span: c.span, cls: 'ID', src: 'b3:' + c.features.join('+') })
      stats.admitted++
      for (const f of c.features) stats.byFeature[f] = (stats.byFeature[f] ?? 0) + 1
      continue
    }
    let raw
    try {
      raw = await complete(CLASSIFY_SYSTEM, `Context: "...${c.ctx}..."\nTerm: "${c.span}"`, { grammar: CLASSIFY_GRAMMAR, maxTokens: 6 })
    } catch {
      stats.failedCalls++
      continue
    }
    stats.calls++
    const v = (raw || '').trim().toLowerCase()
    if (IDENTITY.has(v)) {
      entries.push({ span: c.span, cls: v.toUpperCase(), src: 'b3:' + c.features.join('+') })
      stats.admitted++
      for (const f of c.features) stats.byFeature[f] = (stats.byFeature[f] ?? 0) + 1
    } else {
      rejects.push({ span: c.span, verdict: v || 'unclassified', features: c.features })
    }
  }
  return { entries, rejects, stats, complete: stats.failedCalls === 0 }
}
