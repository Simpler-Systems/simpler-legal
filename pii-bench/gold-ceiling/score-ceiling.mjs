#!/usr/bin/env node
// Diff the cold verdicts against the gold key; agreement = the instrument ceiling proxy.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// Reads the three artefacts committed beside it. It used to read a blind-run
// output out of a one-off scratch directory on the author's machine, which made
// the 88.8% ceiling — cited in BENCHMARK.md, FREEZE.md and the public benchmark
// page — impossible for anyone else to recompute. `node score-ceiling.mjs` now
// reproduces it from the repo alone.
const HERE = fileURLToPath(new URL('.', import.meta.url))
const out = JSON.parse(readFileSync(`${HERE}/verdicts.json`, 'utf8')).result
const key = new Map(JSON.parse(readFileSync(`${HERE}/ceiling-key.json`, 'utf8')).map((e) => [e.id, e.gold]))
const blind = new Map(JSON.parse(readFileSync(`${HERE}/ceiling-blind.json`, 'utf8')).map((e) => [e.id, e]))
const M = { QUASI: 'MASK', NO_MASK: 'KEEP' }
const quote = (b) => {
  if (b.off == null) return `<${b.len} chars>`
  const p = `${HERE}../../raw/oos/${b.doc}`
  if (!existsSync(p)) return `<${b.len} chars — rebuild the corpus to see it>`
  return `"${readFileSync(p, 'utf8').slice(b.off, b.off + b.len).slice(0, 40)}"`
}
let agree = 0, total = 0
const conf = { 'gold-MASK/judge-KEEP': [], 'gold-KEEP/judge-MASK': [] }
const perGenre = { courts: { a: 0, t: 0 }, edgar: { a: 0, t: 0 } }
for (const v of out.verdicts) {
  const g = key.get(v.id)
  if (!g) continue
  total++
  const genre = v.id.startsWith('courts') ? 'courts' : 'edgar'
  perGenre[genre].t++
  if (M[g] === v.verdict) { agree++; perGenre[genre].a++ }
  else {
    const b = blind.get(v.id)
    const bucket = M[g] === 'MASK' ? 'gold-MASK/judge-KEEP' : 'gold-KEEP/judge-MASK'
    // ceiling-blind.json carries offsets, not text — see deliteral-blind.mjs.
    // Show the disputed span when this machine holds the corpus; otherwise show
    // its class and length, which is what the disagreement analysis turns on.
    if (conf[bucket].length < 12) conf[bucket].push(`${v.id} [${b.category}] ${quote(b)}`)
  }
}
console.log(`agreement: ${agree}/${total} = ${((agree / total) * 100).toFixed(1)}%`)
for (const g of ['courts', 'edgar']) console.log(`  ${g}: ${perGenre[g].a}/${perGenre[g].t} = ${((perGenre[g].a / perGenre[g].t) * 100).toFixed(1)}%`)
for (const [k, v] of Object.entries(conf)) { console.log(`\n${k} (${v.length} shown):`); for (const x of v) console.log('  ' + x) }
