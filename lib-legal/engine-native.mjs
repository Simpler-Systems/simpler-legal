// v1-legal NATIVE-CONTRACT ARM (architecture experiment, 2026-07-22): instead of the tower
// (business first pass + post-rails + Engine C), the FIRST pass gets a legal contract.
// Rationale under test: the measured QUASI gap is scope exclusion — v1's Engine A is told
// "do not list place names, dates, money"; this arm tells a first pass to look.
// Design constraints carried from red's measured lessons:
//   - enum stays at SEVEN classes (attention-density parity with red's prompt): the business
//     trio BRAND/EMAIL/PHONE (all deterministically rail-covered) swaps for PLACE/JOB/GROUP
//   - assembly is byte-faithful to anonymizeTwoEngine otherwise (rails, battery, residue,
//     suspicion, footprint floor, prefix propagation) — ONE variable: the contract
//   - Engine C's measured protections apply to the new judgment classes at admission:
//     keepVeto (institutions, role terms, countries, lone demonyms, footprints) and the
//     containment guard at masking time
// If this arm loses to the tower on the slice, it is recorded measured-rejected and the
// tower stands. If it wins, v1-legal.3 is the native engine.

import {
  foldFullwidth, makeChunks, verifySpan, baseName, escRe, maskWithTable, buildTable,
  propagateProperPrefixes, railsPass, CLASSIFY_SYSTEM, CLASSIFY_GRAMMAR, isAdmissibleFootprint,
} from '../lib-core/anonymize.mjs'
import { structuralBattery, flagJunkSuspects } from '../lib-core/rails.mjs'
import { suspicionPass } from '../lib-core/suspicion.mjs'
import { residuePass, CONFIG } from '../lib-core/engineB.mjs'
import { applyL1, applyL1b, applyL3, applyL4, restoreInstitutional } from './legal-rails.mjs'
import { keepVeto, contextKept } from './legal-residue.mjs'

export const NATIVE_VERSION = 'v1-legal.native-A'

/** FROZEN candidate contract — seven classes, legal do-not-list. */
export const EXTRACT_SYSTEM_LEGAL = `You extract identifying spans from a chunk of a legal document. List EVERY span that reveals who the people in the case are:
  PERSON  - a person's name
  COMPANY - a company or organization name
  PLACE   - a town, village, district, street or named facility
  JOB     - a person's occupation, job title or professional role
  GROUP   - a nationality, ethnic group, religion or political affiliation
  ADDRESS - a street address
  ID      - an ID, account, case or registration number
Copy each span EXACTLY as it appears in the text, character for character. One per line, format CLASS: span
Do not list: names of courts, laws, treaties or precedent cases; article or section numbers; institutional parties (the Government, the Court, the State); dates or money amounts; generic role words (the applicant, counsel, the judge). List each distinct name once even if it repeats.
If there are none, output exactly: NONE
Output only the list, nothing else.`

const CORE = new Set(['PERSON', 'COMPANY', 'ADDRESS', 'ID'])
const LEGAL = new Set(['PLACE', 'JOB', 'GROUP'])

function parseLegalSpans(raw) {
  const out = []
  for (const line of (raw || '').split('\n')) {
    const m = line.match(/^\s*[-*]?\s*(PERSON|COMPANY|PLACE|JOB|GROUP|ADDRESS|ID)\s*[:\-]\s*(.+?)\s*$/i)
    if (m) out.push({ cls: m[1].toUpperCase(), span: m[2].replace(/^["'`]|["'`]$/g, '').trim() })
  }
  return out
}

export async function legalSpanPass(text, complete, opts = {}) {
  const { chunkChars = CONFIG.SPAN_CHUNK_CHARS ?? 500, overlap = CONFIG.SPAN_OVERLAP ?? 100 } = opts
  const chunks = makeChunks(text, chunkChars, overlap)
  const core = []
  const legal = []
  const seen = new Set()
  const stats = { calls: 0, failedCalls: 0, verifyFailed: 0, vetoed: 0 }
  for (const c of chunks) {
    let raw
    try {
      raw = await complete(EXTRACT_SYSTEM_LEGAL, `TEXT CHUNK:\n${c.text}`, { maxTokens: 400 })
    } catch {
      stats.failedCalls++
      continue
    }
    stats.calls++
    for (const n of parseLegalSpans(raw)) {
      const v = verifySpan(n.span, c.text)
      if (!v.ok) {
        stats.verifyFailed++
        continue
      }
      const base = baseName(v.span)
      if (!base || !isAdmissibleFootprint(base)) continue
      const key = `${n.cls}|${base.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      if (LEGAL.has(n.cls)) {
        if (keepVeto(base)) {
          stats.vetoed++
          continue
        }
        legal.push({ span: base, cls: n.cls, src: 'spanA-legal' })
      } else if (CORE.has(n.cls)) {
        core.push({ span: base, cls: n.cls, src: 'span' })
      }
    }
  }
  return { core, legal, stats, complete: stats.failedCalls === 0 }
}

// containment-guarded masking for the judgment classes (measured collateral lesson)
function guardedMask(text, entries) {
  let out = text
  const counters = {}
  const table = []
  const have = new Set()
  for (const e of entries) {
    const key = e.span.toLowerCase()
    if (have.has(key)) continue
    have.add(key)
    const re = new RegExp(`\\b${escRe(e.span).replace(/\s+/g, '\\s+')}\\b`, 'g')
    let masked = 0
    out = out.replace(re, (m, offset) => {
      if (contextKept(out, offset, m.length)) return m
      masked++
      return `__PL_${e.cls}__`
    })
    if (masked > 0) {
      const n = (counters[e.cls] = (counters[e.cls] || 0) + 1)
      const tag = `[${e.cls.charAt(0) + e.cls.slice(1).toLowerCase()}${n}]`
      out = out.split(`__PL_${e.cls}__`).join(tag)
      table.push({ span: e.span, cls: e.cls, src: e.src, tag })
    } else out = out.split(`__PL_${e.cls}__`).join(e.span)
  }
  return { text: out, table }
}

const notArtifact = (e) => !/\[(?:Person|Company|Brand|Address|Code|Date|Amount|Place|Job|Group|Org|Dem)\d*\]/i.test(e.span)

export async function anonymizeLegalNative(text, complete, opts = {}) {
  const doc = foldFullwidth(text || '')
  // A: legal-contract wide sweep + name rails + battery (assembly mirrors anonymizeTwoEngine)
  const span = await legalSpanPass(doc, complete, opts)
  const rails = await railsPass(doc, complete)
  const aBattery = structuralBattery(doc)
  const aClean = [...span.core, ...rails.entries, ...aBattery].filter(notArtifact)
  const maskedA = maskWithTable(doc, buildTable([aClean]))
  const b1 = structuralBattery(maskedA, { tagTails: true }).filter(notArtifact)
  const maskedAB1 = maskWithTable(doc, buildTable([aClean, b1]))
  const residue = await residuePass(maskedAB1, complete, opts)
  const residueClean = residue.entries.filter(notArtifact)
  const maskedAB2 = maskWithTable(doc, buildTable([aClean, b1, residueClean]))
  const b3 = await suspicionPass(maskedAB2, complete, { CLASSIFY_SYSTEM, CLASSIFY_GRAMMAR })
  const table = flagJunkSuspects(buildTable([aClean, b1, residueClean, b3.entries.filter(notArtifact)]))
  const maskTable = propagateProperPrefixes(table)
  let masked = maskWithTable(doc, maskTable)
  // legal judgment classes: containment-guarded masking
  const legalMasked = guardedMask(masked, span.legal)
  masked = legalMasked.text
  // legal rails + institutional restore (identical to the tower's post-layer)
  masked = applyL1(masked).text
  masked = applyL1b(masked).text
  masked = applyL3(masked).text
  masked = applyL4(masked).text
  masked = restoreInstitutional(masked, table).text
  const completeBy = { span: span.complete, rails: rails.complete, battery: true, residue: residue.complete, suspicion: b3.complete }
  return {
    masked,
    table: [...table, ...legalMasked.table],
    complete: completeBy.span && completeBy.rails && completeBy.residue && completeBy.suspicion,
    completeBy,
    version: NATIVE_VERSION,
    stats: { spanStats: span.stats, legalFound: span.legal.length, tableSize: table.length + legalMasked.table.length },
  }
}
