#!/usr/bin/env node
// Fast-loop TAB scorer: entity-level survival cross-reference against TAB's own gold
// annotations, same metric structure as score-pii.mjs (DIRECT recall, QUASI recall, NO_MASK
// preservation). This is the iteration metric; the OFFICIAL number at checkpoint/freeze time
// comes from raw/tab/evaluation.py (token-level, POS-aware) — this scorer never replaces it.
// Gold = union of all annotators' mentions per doc (strictest recall target).
//
//   node score-tab.mjs --stripped <dir> [--split dev|test] [--name <run>]

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
// A run records where its stripped files were as a path under this repository when they are in it,
// so a receipt never carries the machine's own folder (the selftest passes an absolute path).
const shownDir = (d) => { const r = relative(ROOT, d); return isAbsolute(d) && r && !r.startsWith('..') && !isAbsolute(r) ? r.split(sep).join('/') : d }
const argv = process.argv.slice(2)
const flagVal = (n, d) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const STRIPPED = flagVal('--stripped', null)
const SPLIT = flagVal('--split', 'dev')
const NAME = flagVal('--name', `tab-${SPLIT}-${Date.now()}`)
if (!STRIPPED) {
  console.log('usage: node score-tab.mjs --stripped <dir> [--split dev|test] [--name <run>]')
  process.exit(1)
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const countOcc = (text, span) => (text.match(new RegExp(esc(span).replace(/\s+/g, '\\s+'), 'g')) || []).length

const gold = new Map(
  JSON.parse(readFileSync(join(ROOT, 'raw', 'tab', `echr_${SPLIT}.json`), 'utf8')).map((d) => [d.doc_id, d]),
)
const strippedFiles = readdirSync(STRIPPED).filter((f) => f.endsWith('.txt'))
const rows = []
for (const f of strippedFiles) {
  const id = f.replace('.txt', '')
  const doc = gold.get(id)
  if (!doc) continue
  const stripped = readFileSync(join(STRIPPED, f), 'utf8')
  // union of distinct surface forms across annotators, strictest identifier_type per form
  // (DIRECT > QUASI > NO_MASK)
  const rank = { DIRECT: 2, QUASI: 1, NO_MASK: 0 }
  const forms = new Map()
  for (const a of Object.values(doc.annotations || {})) {
    for (const m of a.entity_mentions || []) {
      const key = m.span_text.toLowerCase().trim()
      if (!key) continue
      const prev = forms.get(key)
      if (!prev || rank[m.identifier_type] > rank[prev.identifier_type]) forms.set(key, m)
    }
  }
  const r = { file: f, direct: { total: 0, leaked: 0 }, quasi: { total: 0, leaked: 0 }, no_mask: { total: 0, preserved: 0 }, unmatchable: 0 }
  for (const m of forms.values()) {
    if (!countOcc(doc.text, m.span_text)) { r.unmatchable++; continue }
    const remaining = countOcc(stripped, m.span_text)
    if (m.identifier_type === 'NO_MASK') {
      r.no_mask.total++
      if (remaining > 0) r.no_mask.preserved++
    } else {
      const b = m.identifier_type === 'DIRECT' ? r.direct : r.quasi
      b.total++
      if (remaining > 0) b.leaked++
    }
  }
  r.gatePass = r.direct.leaked === 0
  rows.push(r)
}
const sum = (f) => rows.reduce((s, r) => s + f(r), 0)
const agg = {
  docs: rows.length,
  directRecall: 1 - sum((r) => r.direct.leaked) / (sum((r) => r.direct.total) || 1),
  quasiRecall: 1 - sum((r) => r.quasi.leaked) / (sum((r) => r.quasi.total) || 1),
  noMaskPreservation: sum((r) => r.no_mask.preserved) / (sum((r) => r.no_mask.total) || 1),
  gatePassRate: rows.filter((r) => r.gatePass).length / (rows.length || 1),
  unmatchable: sum((r) => r.unmatchable),
}
const pct = (x) => (100 * x).toFixed(1) + '%'
console.log(`run: ${NAME}   split: ${SPLIT}   docs scored: ${agg.docs}`)
console.log(`DIRECT recall:        ${pct(agg.directRecall)}   (gate ${pct(agg.gatePassRate)})`)
console.log(`QUASI recall:         ${pct(agg.quasiRecall)}`)
console.log(`NO_MASK preservation: ${pct(agg.noMaskPreservation)}`)
console.log(`unmatchable: ${agg.unmatchable}`)
mkdirSync(join(ROOT, 'pii-bench', 'runs'), { recursive: true })
writeFileSync(join(ROOT, 'pii-bench', 'runs', `${NAME}.json`), JSON.stringify({ name: NAME, split: SPLIT, strippedDir: STRIPPED && shownDir(STRIPPED), scoredAt: new Date().toISOString(), aggregate: agg, perDoc: rows }, null, 1))
console.log(`wrote pii-bench/runs/${NAME}.json`)
