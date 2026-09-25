// ENGINE B — the residue specialist, strict-serial (owner architecture,
// measured at 100.00% with Engine A across 53 documents — see
// bench/hardening-2026-07-19/REPORT.md).
//
// The specialist reads ONLY the already-redacted document: B's meaning is
// "what survived A", and every B-find is by definition an A-miss — B's
// find-rate is standing telemetry of what always gets left out.
//   B1 — the deterministic battery (lib/rails.mjs) + tag-adjacent tails.
//   B2 — the scoped residue sweep: a narrow FROZEN model contract over the
//        B1-masked text; its checklist is COMPILED from the eval corpus's
//        measured leak taxonomy. Verify-or-refuse, as everywhere.
// The final mask always applies the union table to the ORIGINAL document.
import {
  foldFullwidth,
  makeChunks,
  verifySpan,
  baseName,
  isMaskArtifact,
  buildTable,
  maskWithTable,
  propagateProperPrefixes,
  spanPass,
  railsPass,
  railCapRuns,
  CLASSIFY_SYSTEM,
  CLASSIFY_GRAMMAR,
} from './anonymize.mjs'
import { structuralBattery, railTagTails, flagJunkSuspects, escRe } from './rails.mjs'
import { suspicionPass } from './suspicion.mjs'

/** Measured constants — bench of record: bench/hardening-2026-07-19/. Change
 *  only with a new bench row. */
export const CONFIG = {
  SPAN_CHUNK_CHARS: 500,
  SPAN_OVERLAP: 100,
  RESIDUE_CHUNK_CHARS: 900,
  RESIDUE_OVERLAP: 100,
  bench: 'bench/hardening-2026-07-19/twoengine-results.json (+ stress2)',
}

/** FROZEN contract for the residue sweep (test-pinned). */
export const RESIDUE_SYSTEM = `The document below has already had person, company and brand names masked (tags like [Person1], [Company2], [Brand1]). Your ONLY job is to list REMAINING identifying strings that were missed:
  PHONE   - phone or fax numbers in ANY format
  ID      - ID, account, registration, license, tax or social-security style numbers; stock tickers; product codes
  ADDRESS - street addresses, or city/state/postal lines, or postal codes attached to a place
  EMAIL   - email addresses
  URL     - web addresses or domains
Copy each string EXACTLY as it appears, one per line, format CLASS: string
Ignore dates, money amounts, percentages, section numbers, page numbers, and defined role words (the Company, the Holder, the Agreement).
If nothing remains, output exactly: NONE
Output only the list, nothing else.`

function parseResidue(raw) {
  const out = []
  for (const line of (raw || '').split('\n')) {
    const m = line.match(/^\s*[-*]?\s*(PHONE|ID|ADDRESS|EMAIL|URL)\s*[:\-]\s*(.+?)\s*$/i)
    if (m) out.push({ cls: m[1].toUpperCase() === 'URL' ? 'ID' : m[1].toUpperCase(), span: m[2].replace(/^["'`]|["'`]$/g, '').trim() })
  }
  return out
}

export async function residuePass(maskedText, complete, opts = {}) {
  const { chunkChars = CONFIG.RESIDUE_CHUNK_CHARS, overlap = CONFIG.RESIDUE_OVERLAP } = opts
  const chunks = makeChunks(maskedText, chunkChars, overlap)
  const entries = []
  const seen = new Set()
  const stats = { calls: 0, failedCalls: 0, verifyFailed: 0 }
  for (const c of chunks) {
    let raw
    try {
      raw = await complete(RESIDUE_SYSTEM, `DOCUMENT (already partially masked):\n${c.text}`, { maxTokens: 300 })
    } catch {
      stats.failedCalls++
      continue
    }
    stats.calls++
    for (const n of parseResidue(raw)) {
      const v = verifySpan(n.span, c.text)
      if (!v.ok) {
        stats.verifyFailed++
        continue
      }
      const base = baseName(v.span)
      if (!base || base.length < 2 || isMaskArtifact(base)) continue
      const key = base.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ span: base, cls: n.cls, src: 'engineB:residue' })
    }
  }
  return { entries, stats, complete: stats.failedCalls === 0 }
}

/**
 * Full strip: Engine A (wide) → Engine B (specialist over A's redacted
 * output). Returns { masked, table, complete, completeBy, stats }. `complete`
 * is the release gate; `completeBy` says WHICH layer failed when it is false
 * (B1 is pure code and cannot fail).
 */
export async function anonymizeTwoEngine(text, complete, opts = {}) {
  // onPhase (optional, M2b app wiring): a pure progress tap — fires at phase
  // boundaries with what each layer found. Never alters behavior; the bench
  // runs with it absent.
  const { onPhase, ...passOpts } = opts
  const doc = foldFullwidth(text || '')
  // ── A: the wide sweep on the original (span + name rails + classify) ──
  onPhase?.({ phase: 'span' })
  const span = await spanPass(doc, complete, { chunkChars: CONFIG.SPAN_CHUNK_CHARS, overlap: CONFIG.SPAN_OVERLAP, ...passOpts })
  onPhase?.({ phase: 'rails', found: span.entries.length })
  const rails = await railsPass(doc, complete)
  // The deterministic battery ALSO sweeps the ORIGINAL (2026-07-20): running
  // it only on redacted text (B1) left a blind spot — a pattern whose middle
  // the model had already masked ("(AMEX:APY)" with AMEX tabled as a company)
  // is invisible to a rail that never saw the original bytes. B1 keeps its
  // seat for the classes that only exist post-mask (tag tails).
  const aBattery = structuralBattery(doc)
  const aClean = [...span.entries, ...rails.entries, ...aBattery].filter((e) => !isMaskArtifact(e.span))
  const maskedA = maskWithTable(doc, buildTable([aClean]))
  // ── B1: deterministic battery on the REDACTED text (incl. tag tails) ──
  const b1 = structuralBattery(maskedA, { tagTails: true }).filter((e) => !isMaskArtifact(e.span))
  const maskedAB1 = maskWithTable(doc, buildTable([aClean, b1]))
  // ── B2: the scoped residue model sweep on the redacted text ──
  onPhase?.({ phase: 'residue', found: aClean.length + b1.length })
  const residue = await residuePass(maskedAB1, complete, passOpts)
  // ── B3: the suspicion scorer (fix set 4) — surface-shape features over
  // what SURVIVED A+B1+B2; only shape-suspicious tokens cost a focused
  // classify. Per-feature admissions land in stats for the ledger. ──
  const maskedAB2 = maskWithTable(doc, buildTable([aClean, b1, residue.entries.filter((e) => !isMaskArtifact(e.span))]))
  onPhase?.({ phase: 'suspicion', found: aClean.length + b1.length + residue.entries.length })
  const b3 = await suspicionPass(maskedAB2, complete, { CLASSIFY_SYSTEM, CLASSIFY_GRAMMAR })
  // prefix propagation (round-2 OCR lesson) — the review table keeps one row
  // per identity; the masking table carries the extra short-form footprints
  const table = flagJunkSuspects(buildTable([aClean, b1, residue.entries.filter((e) => !isMaskArtifact(e.span)), b3.entries.filter((e) => !isMaskArtifact(e.span))]))
  const maskTable = propagateProperPrefixes(table)
  const completeBy = { span: span.complete, rails: rails.complete, battery: true, residue: residue.complete, suspicion: b3.complete }
  // The model-cleared tier (additive): everything a classify looked at and
  // judged non-identity, minus anything that made the table anyway. The review
  // shows these for human confirmation — the honest answer to "not 100%".
  const tabled = new Set(table.map((e) => e.span.toLowerCase()))
  const rejSeen = new Set()
  const rejected = [...(rails.rejects || []), ...(b3.rejects || [])].filter((r) => {
    const k = r.span.toLowerCase()
    if (tabled.has(k) || rejSeen.has(k) || isMaskArtifact(r.span)) return false
    rejSeen.add(k)
    return true
  })
  return {
    masked: maskWithTable(doc, maskTable),
    table,
    rejected,
    complete: completeBy.span && completeBy.rails && completeBy.residue && completeBy.suspicion,
    completeBy,
    stats: {
      aFound: aClean.length,
      b1Found: b1.length,
      residueFound: residue.entries.length,
      b3Found: b3.entries.length,
      b3Stats: b3.stats,
      junkSuspects: table.filter((e) => e.junkSuspect).length,
      tableSize: table.length,
    },
  }
}

/** Quick strip — the deterministic-plus-classify tier (no span pass, no
 *  residue sweep): the name rails + classify plus the structural battery.
 *  Honest label: ONE measured-100% layer plus the battery, not two engines. */
export async function anonymizeQuick(text, complete) {
  const doc = foldFullwidth(text || '')
  const rails = await railsPass(doc, complete)
  const b1 = structuralBattery(doc).filter((e) => !isMaskArtifact(e.span))
  const table = flagJunkSuspects(buildTable([rails.entries.filter((e) => !isMaskArtifact(e.span)), b1]))
  return {
    masked: maskWithTable(doc, table),
    table,
    complete: rails.complete,
    completeBy: { rails: rails.complete, battery: true },
    stats: { tableSize: table.length, junkSuspects: table.filter((e) => e.junkSuspect).length },
  }
}
