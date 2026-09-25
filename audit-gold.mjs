#!/usr/bin/env node
// T1 — F8 obligation (red's law: "trust no single labeling pass"). Deterministic
// identity-shape sweep over the OOS-100 documents, diffed against the Sonnet-swarm gold
// labels. LLM labeler misses are systematic, not random (red F8: one blind class, and a
// targeted audit converges) — this finds our swarm's shared blind class BEFORE any engine is
// scored against these labels. Output: pii-bench/gold-audit.json + console triage summary.
//   node audit-gold.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveGold } from './gold-path.mjs'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const DOCS = join(ROOT, 'raw', 'oos')
const LABELS = resolveGold('pii-bench/oos-labels', ROOT)

// identity-shape battery (deterministic; the same rail families red audits with)
const SHAPES = [
  ['email', /\b[\w.+-]+@[\w-]+\.\w{2,}\b/g],
  ['ssn', /\b\d{3}-\d{2}-\d{4}\b/g],
  ['nric', /\b[STFG]\d{7}[A-Z]\b/g],
  ['us-phone', /\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/g],
  ['sg-phone', /\+65\s?[689]\d{3}\s?\d{4}\b/g],
  ['long-id', /\b\d{7,12}[A-Z]?\b/g],
  ['url', /\bhttps?:\/\/[^\s)>,]+|www\.[^\s)>,]+/g],
  ['zip-addr', /\b[A-Z][a-z]+,\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g],
]

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const files = readdirSync(DOCS).filter((f) => f.endsWith('.txt'))
const perShape = {}
let totalHits = 0
let totalUncovered = 0
const samples = {}
// triage view: the corpus is local, so show the hit when we can, its shape when we can't
const show = (s) => {
  const p = join(DOCS, s.file)
  if (!existsSync(p)) return `<${s.len} chars>`
  return JSON.stringify(readFileSync(p, 'utf8').slice(s.off, s.off + s.len))
}
for (const f of files) {
  const text = readFileSync(join(DOCS, f), 'utf8')
  const bodyStart = text.indexOf('\n\n') + 2 // skip provenance header (not labeled)
  const body = text.slice(bodyStart)
  let gold
  try {
    gold = JSON.parse(readFileSync(join(LABELS, f.replace('.txt', '.json')), 'utf8'))
  } catch {
    continue
  }
  const goldSpans = gold.entities.map((e) => e.span_text.toLowerCase())
  const covered = (hit) => {
    const h = hit.toLowerCase()
    return goldSpans.some((g) => g.includes(h) || h.includes(g))
  }
  for (const [name, re] of SHAPES) {
    for (const m of body.matchAll(re)) {
      totalHits++
      if (covered(m[0])) continue
      totalUncovered++
      perShape[name] = (perShape[name] || 0) + 1
      ;(samples[name] ??= [])
      // gold-audit.json is committed, so samples record WHERE the uncovered hit
      // is, not what it says — same rule as the run boards and the gold itself.
      // Triage locally with --show, which reads your own corpus copy.
      if (samples[name].length < 8) samples[name].push({ file: f, off: bodyStart + m.index, len: m[0].length })
    }
  }
}
console.log(`identity-shape hits across OOS-100 bodies: ${totalHits}   NOT covered by gold: ${totalUncovered}`)
for (const [name, n] of Object.entries(perShape).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name.padEnd(10)} ${String(n).padStart(5)}   e.g. ${samples[name].slice(0, 3).map(show).join('  ')}`)
}
writeFileSync(
  join(ROOT, 'pii-bench', 'gold-audit.json'),
  JSON.stringify({ auditedAt: new Date().toISOString(), method: 'deterministic identity-shape sweep vs gold span containment (red F8 pattern)', totalHits, totalUncovered, perShape, samples }, null, 1),
)
console.log('wrote pii-bench/gold-audit.json — uncovered hits are LABEL-AUDIT candidates (triage before trusting OOS scores), not automatic gold additions')
