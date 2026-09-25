// ENGINE_V2_SWEEPS.md — the two NEW legal sweeps. One small model, many scoped passes:
// each sweep gives the E2B a single narrow job with fresh ~500-char windows, enum output,
// and verbatim verify-or-refuse. Both sweeps fail closed to deterministic behavior.
import { verifySpan, makeChunks } from '../lib-core/anonymize.mjs'

export function makeComplete(port = process.env.SIMPLER_LLAMA_PORT ?? 49400) {
  return async function complete(system, user, opts = {}) {
    const body = {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      max_tokens: opts.maxTokens ?? 400,
      stream: false,
    }
    const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    })
    if (!r.ok) throw new Error(`local model http ${r.status}`)
    return (await r.json()).choices?.[0]?.message?.content ?? ''
  }
}

// ── L-C: person-anchor judgment (doctrine seat) ────────────────────────────────────────────
// The product doctrine keeps dates/amounts unless they are PERSONAL. The keyword regex is
// high-precision/low-recall; the E2B judges the rest, one unique candidate at a time.
const ANCHOR_SYSTEM = `You judge one highlighted value from a legal document, marked >>>like this<<<.
Question: is the value PERSONAL data about a specific individual - their birth, death, age, identity or account number, family event, or personal salary?
Business and procedural values are NOT personal: contract dates, effective dates, deadlines, court dates, prices, fees, payments between companies, case years.
Answer with exactly one word: YES or NO.`

export async function sweepLCAnchor(orig, candidates, complete, regexFallback, opts = {}) {
  // candidates: [{text, indexes:[i,...]}] — judge per unique text on up to 2 windows.
  // opts.unanimous (L-C precision arm): YES requires ALL judged windows to agree — the
  // any-of-2 rule let one ambiguous window mask business dates doc-wide (measured: 109
  // EDGAR + 158 courts destroyed DATETIME keeps traced to false YES).
  const stats = { calls: 0, failed: 0, yes: 0 }
  const verdicts = new Map()
  for (const c of candidates) {
    if (regexFallback(c)) { verdicts.set(c.text, true); stats.yes++; continue } // regex-YES is final (high precision)
    const votes = []
    for (const i of c.indexes.slice(0, 2)) {
      const w0 = Math.max(0, i - 160)
      const win = orig.slice(w0, i) + '>>>' + orig.slice(i, i + c.text.length) + '<<<' + orig.slice(i + c.text.length, i + c.text.length + 160)
      let raw
      try {
        raw = await complete(ANCHOR_SYSTEM, win.replace(/\s+/g, ' '), { maxTokens: 4 })
        stats.calls++
      } catch {
        stats.failed++
        continue
      }
      votes.push(/^\s*YES/i.test(raw))
      if (!opts.unanimous && votes[votes.length - 1]) break
    }
    const yes = votes.length > 0 && (opts.unanimous ? votes.every(Boolean) : votes.some(Boolean))
    if (yes) stats.yes++
    verdicts.set(c.text, yes)
  }
  return { verdicts, stats, complete: stats.failed === 0 }
}

// ── FS7a: anon-doc name confirmation (round-4 leak — a real given name the court
// itself missed inside an anonymized judgment). Deterministic candidate collection
// (capitalized, frequent, non-stoplist tokens in letter-coded docs); the E2B only CONFIRMS.
// Add-only => gate-safe.
const ANON_NAME_SYSTEM = `You judge one highlighted word from an anonymized court judgment, marked >>>like this<<<.
Question: is the highlighted word a person - a given name or surname of an actual individual?
Hints: a possessive form (>>>Word<<<'s house, >>>Word<<<'s account) usually marks a person. Court pseudonym codes (WJZ, C1), places, companies, months, legal terms, and ordinary English words are NOT persons.
Answer with exactly one word: YES or NO.`
export async function sweepAnonNames(orig, candidates, complete) {
  const stats = { calls: 0, failed: 0, yes: 0 }
  const names = []
  for (const c of candidates) {
    let raw
    try {
      const i = c.index
      const win = orig.slice(Math.max(0, i - 120), i) + '>>>' + orig.slice(i, i + c.text.length) + '<<<' + orig.slice(i + c.text.length, i + c.text.length + 120)
      raw = await complete(ANON_NAME_SYSTEM, win.replace(/\s+/g, ' '), { maxTokens: 4 })
      stats.calls++
    } catch {
      stats.failed++
      continue
    }
    if (/^\s*YES/i.test(raw)) { stats.yes++; names.push(c.text) }
  }
  return { names, stats, complete: stats.failed === 0 }
}

// ── L-B: legal residue sweep (reads the FINISHED output; can only ADD masks) ───────────────
const RESIDUE_SYSTEM = `The legal document below has had identifying names masked with tags like [Person1], [Company2], [X].
Your ONLY job is to list strings that STILL identify a person:
  NAME  - an unmasked personal name or surname
  ALIAS - initials or a short code standing for a person (like "YES" or "AV")
  ID    - a personal identification or file number tied to a person
Copy each string EXACTLY as it appears, one per line, format CLASS: string
Ignore: courts, judges and their titles, laws, statutes, precedent case citations, company names, dates, money, places, role words (the applicant, the Executive, Plaintiff).
If none remain, output exactly: NONE
Output only the list.`

const LB_STOP = new Set(['court', 'justice', 'judge', 'plaintiff', 'defendant', 'appellant', 'appellee', 'claimant', 'respondent', 'applicant', 'executive', 'company', 'agreement', 'exhibit', 'section', 'article', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'see', 'id', 'ibid', 'supra', 'states', 'united'])

export async function sweepLBResidue(maskedText, complete, opts = {}) {
  const { chunkChars = 500, overlap = 100 } = opts
  const chunks = makeChunks(maskedText, chunkChars, overlap)
  const stats = { calls: 0, failed: 0, nominated: 0, verified: 0 }
  const spans = new Set()
  for (const c of chunks) {
    if (!/[A-Z]/.test(c.text)) continue
    let raw
    try {
      raw = await complete(RESIDUE_SYSTEM, `DOCUMENT CHUNK:\n${c.text}`, { maxTokens: 300 })
      stats.calls++
    } catch {
      stats.failed++
      continue
    }
    for (const line of (raw || '').split('\n')) {
      const m = line.match(/^\s*[-*]?\s*(NAME|ALIAS|ID)\s*[:\-]\s*(.+?)\s*$/i)
      if (!m) continue
      stats.nominated++
      const span = m[2].replace(/^["'`“”]|["'`“”]$/g, '').replace(/[.,;]$/, '').trim()
      if (span.length < 2 || span.length > 40) continue
      if (/\[/.test(span)) continue // tags are not residue
      if (LB_STOP.has(span.toLowerCase())) continue
      if (!/[A-Z]/.test(span)) continue
      const v = verifySpan(span, c.text)
      if (!v.ok) continue
      stats.verified++
      spans.add(v.span)
    }
  }
  return { spans: [...spans], stats, complete: stats.failed === 0 }
}
