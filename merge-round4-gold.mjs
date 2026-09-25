#!/usr/bin/env node
// ROUND 4 gold merge: labeler pass + adversarial audit pass -> one gold file per doc
// (pii-bench/round4-gold/). Dedup by (span_text, identifier_type severity: DIRECT >
// QUASI > NO_MASK wins on conflict — fail-closed toward masking). Occurrence counts
// recomputed against the original (label noise stays visible to the scorer as unmatchable).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveGold, resolveGoldOut } from './gold-path.mjs'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const argv2 = process.argv.slice(2); const flag2 = (n, d) => (argv2.includes(n) ? argv2[argv2.indexOf(n) + 1] : d); const SRC = resolveGold(flag2('--src', 'pii-bench/round4-labels'), ROOT)
const DST = resolveGoldOut(flag2('--dst', 'pii-bench/round4-gold'), ROOT)
mkdirSync(DST, { recursive: true })
const SEV = { DIRECT: 3, QUASI: 2, NO_MASK: 1 }
let docs = 0, fromLabel = 0, fromAudit = 0, conflicts = 0
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.json') && !x.includes('-audit'))) {
  const label = JSON.parse(readFileSync(join(SRC, f), 'utf8')).entities || []
  let audit = []
  try { audit = JSON.parse(readFileSync(join(SRC, f.replace('.json', '-audit.json')), 'utf8')).entities || [] } catch {}
  const byKey = new Map()
  for (const [src, list] of [['label', label], ['audit', audit]]) {
    for (const e of list) {
      // field-name normalization: some labeler generations write label/count for
      // identifier_type/occurrences (measured: UK probe batch)
      if (e.label && !e.identifier_type) e.identifier_type = e.label
      if (e.count && !e.occurrences) e.occurrences = e.count
      if (!e.span_text || !e.identifier_type || !SEV[e.identifier_type]) continue
      const key = e.span_text.trim()
      if (!key) continue
      const prev = byKey.get(key)
      if (!prev) {
        byKey.set(key, { span_text: key, category: e.category || 'MISC', identifier_type: e.identifier_type, occurrences: e.occurrences || 1 })
        if (src === 'audit') fromAudit++
        else fromLabel++
      } else if (SEV[e.identifier_type] > SEV[prev.identifier_type]) {
        prev.identifier_type = e.identifier_type
        conflicts++
      }
    }
  }
  writeFileSync(join(DST, f), JSON.stringify({ entities: [...byKey.values()] }, null, 1))
  docs++
}
console.log(`merged ${docs} docs -> ${DST} | label entities ${fromLabel} | audit additions ${fromAudit} | severity conflicts (masked wins) ${conflicts}`)
