// Engine C — the legal residue pass (arm L5). Red's two-run architecture extended one seat:
// Engine A sweeps broad, Engine B hunts business residue (phones/IDs/addresses — its contract
// literally says "Ignore dates, money amounts"), and Engine C hunts what the LEGAL taxonomy
// measured both of them missing on TAB: places, occupations, group identities, personal
// affiliations (LOC 45/50, DEM 68/79, MISC 51/56 leaked after v1-legal.2's rails).
// Same law as red: frozen contract, chunked pass over ALREADY-MASKED text (Engine C never
// sees a direct identifier), verbatim verify (no hallucinated span can enter), fail-closed.

import { makeChunks, verifySpan, baseName, escRe } from '../lib-core/anonymize.mjs'

/** FROZEN contract (test-pinned once measured). Targets = the measured legal miss classes. */
export const LEGAL_RESIDUE_SYSTEM = `The document below is a legal document that has already had names, dates, amounts and ID numbers masked (tags like [Person1], [Date], [Amount]). Your ONLY job is to list REMAINING strings that could help identify the individual people involved in the case:
  PLACE - towns, cities, villages, districts, neighbourhoods, streets or named facilities
  JOB   - occupations, job titles or professional roles of the people involved
  GROUP - nationalities, ethnic groups, religions or political affiliations of the people involved
  ORG   - employers, schools, unions, associations or businesses tied to a person
Copy each string EXACTLY as it appears in the text, character for character. One per line, format CLASS: string
Do not list: names of courts, laws, treaties, legal doctrines or precedent cases; article or section numbers; the Government, the State or other institutional parties; masked tags themselves; countries acting as parties to the case; generic words.
If nothing remains, output exactly: NONE
Output only the list, nothing else.`

function parseResidue(raw, classes = ['PLACE', 'JOB', 'GROUP', 'ORG']) {
  const out = []
  const re = new RegExp(`^\\s*[-*]?\\s*(${classes.join('|')})\\s*[:\\-]\\s*(.+?)\\s*$`, 'i')
  for (const line of (raw || '').split('\n')) {
    const m = line.match(re)
    if (m) out.push({ cls: m[1].toUpperCase(), span: m[2].replace(/^["'`]|["'`]$/g, '').trim() })
  }
  return out
}

// ── single-class sweeps (owner directive 2026-07-22: each call focuses on one thing;
// accuracy over runtime). Measured basis: the narrow 4-class contract out-found the wide
// 7-class first pass ~5x on identical docs — so the narrowest possible contract per class.
export const CLASS_SWEEPS = {
  JOB: `The legal document below already has names, dates, amounts and ID numbers masked (tags like [Person1], [Date]). Your ONLY job: list every OCCUPATION, JOB TITLE or PROFESSIONAL ROLE that describes one of the people in the case (the applicant, victims, witnesses, family members).
Copy each one EXACTLY as it appears, one per line, format JOB: string
Do not list: judges, lawyers, prosecutors or court staff doing their jobs in the proceedings; generic words like applicant or witness; anything already masked.
If none remain, output exactly: NONE
Output only the list, nothing else.`,
  PLACE: `The legal document below already has names, dates, amounts and ID numbers masked (tags like [Person1], [Date]). Your ONLY job: list every TOWN, VILLAGE, DISTRICT, NEIGHBOURHOOD, STREET or NAMED FACILITY that helps locate the people in the case (where they lived, worked, were arrested, detained or treated).
Copy each one EXACTLY as it appears, one per line, format PLACE: string
Do not list: countries; courts or government institutions; places inside institution names (write the town alone only if it appears alone); anything already masked.
If none remain, output exactly: NONE
Output only the list, nothing else.`,
  GROUP: `The legal document below already has names, dates, amounts and ID numbers masked (tags like [Person1], [Date]). Your ONLY job: list every NATIONALITY, ETHNIC GROUP, RELIGION, LANGUAGE COMMUNITY or POLITICAL AFFILIATION attributed to the people in the case.
Copy each one EXACTLY as it appears, one per line, format GROUP: string
Do not list: states acting as parties to the case; institutional bodies; anything already masked.
If none remain, output exactly: NONE
Output only the list, nothing else.`,
}

export async function classSweep(cls, maskedText, complete, opts = {}) {
  return legalResiduePass(maskedText, complete, { ...opts, system: CLASS_SWEEPS[cls], classes: [cls] })
}

const isMaskArtifact = (s) => /^\[?[A-Z][a-z]+\d*\]?$/.test(s) && /\[(?:Person|Company|Brand|Address|Code|Date|Amount|Dem|Place|Job|Group|Org)\d*\]/.test(`[${s.replace(/^\[|\]$/g, '')}]`)

// KEEP-veto rail (measured: without it Engine C ate 60 NO_MASK spans on the slice —
// courts, ministries, role terms, one full sentence). The model nominates; these rails veto.
// The prompt contract stays FROZEN — the veto is code, per the software-as-rails law.
import { INSTITUTIONAL_RE, STATES } from './legal-rails.mjs'
const ROLE_VETO_RE =
  /^(?:the\s+)?(?:lawyers?|counsel|solicitors?|barristers?|advocates?|attorneys?|judges?|prosecutors?|public prosecutor|registrars?|section registrar|agents?|co-agents?|officers?|commanders?|soldiers?|police(?:men|man)?|guards?|prisoners?|refugees?|applicants?|witness(?:es)?|experts?|doctors?|nurses?|teachers?|drivers?|workers?|employees?|servants?|officials?|clerks?|army|navy|board|defence lawyers?|medical experts?)\b[\s\S]{0,20}$/i
const COUNTRY_SET = new Set(Object.keys(STATES).map((s) => s.toLowerCase()))
const DEMONYM_SET = new Set(Object.values(STATES).map((s) => s.toLowerCase()))
const TAG_WORD_RE = /^(?:Person|Company|Brand|Address|Code|Date|Amount|Dem|Place|Job|Group|Org)\d*$/
const KINSHIP_RE = /^(?:the\s+|his\s+|her\s+|their\s+)?(?:spouses?|wife|wives|husbands?|fathers?|mothers?|sons?|daughters?|brothers?|sisters?|parents?|children|child|cousins?|uncles?|aunts?|grandparents?|relatives?|family)$/i
const COURT_OFFICIAL_RE = /\b(?:judges?|counsel|prosecutors?|registrars?|advocates?|solicitors?|barristers?|magistrates?|adviso?rs?|agents?|co-agents?|representatives?|delegates?)\b/i
export function keepVeto(span) {
  if (span.split(/\s+/).length > 6) return 'footprint' // sentence fragments are never spans
  if (TAG_WORD_RE.test(span)) return 'tag-word' // the model nominating our own mask tags
  if (KINSHIP_RE.test(span)) return 'kinship' // generic kinship terms are role words
  if (COURT_OFFICIAL_RE.test(span)) return 'court-official' // unanchored: catches "elected judge"
  if (INSTITUTIONAL_RE.test(span)) return 'institutional'
  if (ROLE_VETO_RE.test(span)) return 'role-term'
  const bare = span.toLowerCase().replace(/^the\s+/, '')
  if (COUNTRY_SET.has(bare)) return 'country'
  // demonym ALONE is vetoed ("Turkish" — collateral eats "Turkish Government"); the truly
  // identifying form "Turkish national" is already caught deterministically by rail L4
  if (DEMONYM_SET.has(bare)) return 'demonym-alone'
  return null
}

// containment guard: never mask an occurrence that sits inside institutional context —
// masking "Izmir" must not destroy "Izmir Administrative Court" (measured collateral class)
const CONTEXT_KEEP_RE =
  /\b(?:Court|Government|Ministry|Tribunal|Commission|Committee|Authorit|Prosecut|Board|Chamber|Police|Army|Hospital|Parliament|Assembly)/i
export function contextKept(fullText, index, spanLen, window = 40) {
  const ctx = fullText.slice(Math.max(0, index - window), index + spanLen + window)
  return CONTEXT_KEEP_RE.test(ctx)
}

export async function legalResiduePass(maskedText, complete, opts = {}) {
  const { chunkChars = 500, overlap = 100, system = LEGAL_RESIDUE_SYSTEM, classes = undefined } = opts
  const chunks = makeChunks(maskedText, chunkChars, overlap)
  const entries = []
  const seen = new Set()
  const stats = { calls: 0, failedCalls: 0, verifyFailed: 0 }
  for (const c of chunks) {
    let raw
    try {
      raw = await complete(system, `DOCUMENT (already partially masked):\n${c.text}`, { maxTokens: 300 })
    } catch {
      stats.failedCalls++
      continue
    }
    stats.calls++
    for (const n of parseResidue(raw, classes)) {
      const v = verifySpan(n.span, c.text)
      if (!v.ok) {
        stats.verifyFailed++
        continue
      }
      const base = baseName(v.span)
      if (!base || base.length < 3 || /^\[/.test(base)) continue
      const veto = keepVeto(base)
      if (veto) {
        stats.vetoed = (stats.vetoed || 0) + 1
        continue
      }
      const key = base.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ span: base, cls: n.cls, src: 'engineC:legal-residue' })
    }
  }
  // mask every found span globally, word-bounded, numbered per class — EXCEPT occurrences
  // inside institutional context (containment guard)
  let out = maskedText
  const counters = {}
  const table = []
  for (const e of entries) {
    const re = new RegExp(`\\b${escRe(e.span).replace(/\s+/g, '\\s+')}\\b`, 'g')
    let masked = 0
    out = out.replace(re, (m, offset) => {
      if (contextKept(out, offset, m.length)) {
        stats.contextKept = (stats.contextKept || 0) + 1
        return m
      }
      masked++
      return `__PENDING_${e.cls}__`
    })
    if (masked > 0) {
      const n = (counters[e.cls] = (counters[e.cls] || 0) + 1)
      const tag = `[${e.cls.charAt(0) + e.cls.slice(1).toLowerCase()}${n}]`
      out = out.split(`__PENDING_${e.cls}__`).join(tag)
      table.push({ span: e.span, cls: e.cls, src: e.src, tag })
    } else {
      out = out.split(`__PENDING_${e.cls}__`).join(e.span)
    }
  }
  return { text: out, entries: table, nominations: entries, stats, complete: stats.failedCalls === 0 }
}
