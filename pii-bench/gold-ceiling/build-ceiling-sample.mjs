#!/usr/bin/env node
// Gold-ceiling check: draw 240 QUASI/NO_MASK entities (120 courts, 120 EDGAR) with Â±200-char
// context. Blind sample (no labels) + separate key. Deterministic draw (every Nth).
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveGold } from '../../gold-path.mjs'
// derived from this file's location, not the author's machine; outputs land
// beside it so the sample and its key are committed together
const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]+$/, '')
const ROOT = `${HERE}/../..`
const GOLD = resolveGold('pii-bench/oos-labels-product', ROOT)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pool = { courts: [], edgar: [] }
for (const f of readdirSync(GOLD).filter((x) => x.endsWith('.json'))) {
  const doc = f.replace('.json', '.txt')
  if (!existsSync(`${ROOT}/raw/oos/${doc}`)) continue
  const genre = f.startsWith('edgar') ? 'edgar' : 'courts'
  const orig = readFileSync(`${ROOT}/raw/oos/${doc}`, 'utf8')
  const gold = JSON.parse(readFileSync(`${GOLD}/${f}`, 'utf8'))
  for (const e of gold.entities) {
    if (e.identifier_type === 'DIRECT') continue
    const re = new RegExp(esc(e.span_text).replace(/\s+/g, '\\s+'))
    const m = re.exec(orig)
    if (!m) continue
    const ctx = orig.slice(Math.max(0, m.index - 200), m.index) + 'âŸ¦' + m[0] + 'âŸ§' + orig.slice(m.index + m[0].length, m.index + m[0].length + 200)
    // The blind sample is committed, so it records WHERE the span is, not what
    // it says — same reason the gold does (gold-offsets.mjs). The judge run that
    // produced verdicts.json read `context`, which is held locally only; the
    // published 88.8% needs neither field.
    pool[genre].push({ doc, off: m.index, len: m[0].length, category: e.category, gold: e.identifier_type, _context: ctx.replace(/\s+/g, ' ') })
  }
}
const sample = []
for (const g of ['courts', 'edgar']) {
  const step = Math.floor(pool[g].length / 120)
  for (let i = 0; i < 120; i++) sample.push({ id: `${g}-${i}`, ...pool[g][i * step] })
}
writeFileSync(`${HERE}/ceiling-blind.json`, JSON.stringify(sample.map(({ gold, _context, ...rest }) => rest), null, 1))
writeFileSync(`${HERE}/ceiling-key.json`, JSON.stringify(sample.map(({ id, gold }) => ({ id, gold }))))
// the judge's input, with context — local only, never committed
writeFileSync(`${ROOT}/raw/ceiling-blind-withcontext.json`, JSON.stringify(sample.map(({ gold, _context, ...rest }) => ({ ...rest, context: _context })), null, 1))
console.log(`sample: ${sample.length} entities (pool courts ${pool.courts.length}, edgar ${pool.edgar.length})`)
console.log('gold mix:', JSON.stringify(sample.reduce((a, e) => ((a[e.gold] = (a[e.gold] || 0) + 1), a), {})))
