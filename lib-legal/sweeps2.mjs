// ENGINE_V2_SWEEPS.md §split (owner proposal 2026-07-23): QUASI and NO_MASK are each TWO
// kinds of judgment — split into two scoped sweeps apiece rather than one wide call.
// UNWIRED until the v2 board lands (no mid-run engine changes); wiring goes into apply-v2
// behind --sweep flags so each races as its own arm.
//
// Safety asymmetry (the gate law): LQ1/LQ2 are ADD-ONLY like L-B — gate-safe by
// construction. LN1/LN2 SUBTRACT (restore-side) and therefore: never touch Person/Code-
// tagged regions, obey the defined-term ban + person-token veto, and LN2 may only CONFIRM
// candidates the title-context regexes nominated — the model never creates a restore.
import { verifySpan, makeChunks } from '../lib-core/anonymize.mjs'

// ── LQ1: person-attribute sweep (the lowercase-phrase QUASI mass: "sole director and
// shareholder", "disc jockey", "flight risk", "university studies") ────────────────────────
const LQ1_SYSTEM = `You extract phrases from a legal document chunk that describe WHO a person is. List every phrase stating a person's:
  JOB     - occupation, profession or business role
  KIN     - family relationship (his wife, eldest son, stepfather)
  EDU     - education or qualifications
  GROUP   - ethnicity, nationality, language, religion or political ties
  HEALTH  - medical or psychiatric condition
  STATUS  - legal or financial status (bankrupt, convicted, on bail, unemployed)
Copy each phrase EXACTLY as written, one per line, format CLASS: phrase
Do not list: names, companies, courts, dates, money, places, or generic court roles (the applicant, counsel, the accused).
If none, output exactly: NONE
Output only the list.`

// ── LQ2: person-linked named places/institutions (the capitalized QUASI mass: "Metta
// School", "Bullion Park condominium", "Loyang Tua Pek Kong temple", "Power 102") ──────────
const LQ2_SYSTEM = `You extract NAMED places and organizations from a person's private life mentioned in a legal document chunk:
  SCHOOL   - a school, college or university a person attended
  HOME     - a named building, condominium or estate where a person lives
  WORSHIP  - a temple, church or mosque a person attends
  MEDICAL  - a hospital or clinic where a person was treated
  EMPLOYER - a workplace or business where a person works
Copy each name EXACTLY as written, one per line, format CLASS: name
Do not list: courts, government bodies, law firms, party companies in the dispute, countries or well-known cities.
If none, output exactly: NONE
Output only the list.`

const LQ_STOP = new Set(['none', 'applicant', 'counsel', 'accused', 'defendant', 'plaintiff', 'claimant', 'respondent', 'court', 'judge'])

async function chunkedListSweep(system, classesRe, text, complete, opts = {}) {
  const { chunkChars = 500, overlap = 100 } = opts
  const stats = { calls: 0, failed: 0, nominated: 0, verified: 0 }
  const found = []
  const seen = new Set()
  for (const c of makeChunks(text, chunkChars, overlap)) {
    let raw
    try {
      raw = await complete(system, `DOCUMENT CHUNK:\n${c.text}`, { maxTokens: 300 })
      stats.calls++
    } catch {
      stats.failed++
      continue
    }
    for (const line of (raw || '').split('\n')) {
      const m = line.match(classesRe)
      if (!m) continue
      stats.nominated++
      const span = m[2].replace(/^["'`“”]|["'`“”]$/g, '').replace(/[.,;]$/, '').trim()
      if (span.length < 3 || span.length > 60 || /\[/.test(span) || LQ_STOP.has(span.toLowerCase())) continue
      const v = verifySpan(span, c.text)
      if (!v.ok) continue
      const key = `${m[1].toUpperCase()}|${v.span.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      stats.verified++
      found.push({ cls: m[1].toUpperCase(), span: v.span })
    }
  }
  return { found, stats, complete: stats.failed === 0 }
}

export const sweepLQ1Attributes = (text, complete, opts) =>
  chunkedListSweep(LQ1_SYSTEM, /^\s*[-*]?\s*(JOB|KIN|EDU|GROUP|HEALTH|STATUS)\s*[:\-]\s*(.+?)\s*$/i, text, complete, opts)
export const sweepLQ2Places = (text, complete, opts) =>
  chunkedListSweep(LQ2_SYSTEM, /^\s*[-*]?\s*(SCHOOL|HOME|WORSHIP|MEDICAL|EMPLOYER)\s*[:\-]\s*(.+?)\s*$/i, text, complete, opts)

// ── LN1: institutional-restore judgment (per masked ORG candidate; SUBTRACT — guarded) ─────
const LN1_SYSTEM = `You judge one organization name from a legal document, marked >>>like this<<<.
Question: is it a court, government body, public authority, regulator, or public institution acting in its OFFICIAL capacity in this text?
Private companies, businesses, and organizations that are parties to the dispute are NOT official institutions.
Answer with exactly one word: YES or NO.`

// ── LN2: official-person restore judgment (per REGEX-NOMINATED masked PERSON) ──────────────
const LN2_SYSTEM = `You judge one person's name from a legal document, marked >>>like this<<<.
Question: is this person named ONLY as a judge, judicial officer, court registrar, or acting counsel/solicitor in this text?
Parties, witnesses, victims, employees, and family members are NOT judicial officers - answer NO for them.
Answer with exactly one word: YES or NO.`

async function windowJudgeSweep(system, orig, candidates, complete) {
  // candidates: [{key, indexes:[...]}] — judge per unique key on up to 2 windows; a single
  // YES qualifies. Fail-closed: a failed call is a NO (the mask stays).
  const stats = { calls: 0, failed: 0, yes: 0 }
  const verdicts = new Map()
  for (const c of candidates) {
    let yes = false
    for (const i of c.indexes.slice(0, 2)) {
      const win =
        orig.slice(Math.max(0, i - 160), i) + '>>>' + orig.slice(i, i + c.len) + '<<<' + orig.slice(i + c.len, i + c.len + 160)
      let raw
      try {
        raw = await complete(system, win.replace(/\s+/g, ' '), { maxTokens: 4 })
        stats.calls++
      } catch {
        stats.failed++
        continue
      }
      if (/^\s*YES/i.test(raw)) { yes = true; break }
    }
    if (yes) stats.yes++
    verdicts.set(c.key, yes)
  }
  return { verdicts, stats, complete: stats.failed === 0 }
}

export const sweepLN1Institutional = (orig, candidates, complete) => windowJudgeSweep(LN1_SYSTEM, orig, candidates, complete)
export const sweepLN2Official = (orig, candidates, complete) => windowJudgeSweep(LN2_SYSTEM, orig, candidates, complete)

// ── LN3: counsel confirmation (candidates come ONLY from deterministic counsel-line
// extraction — the loose corridor broke the gate; the model confirms, never nominates) ─────
const LN3_SYSTEM = `You judge one person's name from a legal document, marked >>>like this<<<.
Question: is this person named ONLY as a lawyer, counsel or solicitor REPRESENTING a party in the case?
Parties themselves, witnesses, judges, and solicitors who are being sued or disciplined are NOT representing counsel - answer NO for them.
Answer with exactly one word: YES or NO.`
export const sweepLN3Counsel = (orig, candidates, complete) => windowJudgeSweep(LN3_SYSTEM, orig, candidates, complete)
