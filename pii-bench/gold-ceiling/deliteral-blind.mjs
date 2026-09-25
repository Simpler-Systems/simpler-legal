// One-shot: replace the verbatim `span` in ceiling-blind.json with an offset into
// the local corpus. The 88.8% agreement never read `span` — only `id` and `gold`
// — so this costs nothing but the sample-disagreement printout, which
// score-ceiling.mjs now hydrates locally when raw/oos is present.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = `${HERE}../../`
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const entries = JSON.parse(readFileSync(`${HERE}ceiling-blind.json`, 'utf8'))
let located = 0, lost = 0
const out = entries.map((e) => {
  const { span, ...rest } = e
  const p = `${ROOT}raw/oos/${e.doc}`
  if (!existsSync(p)) { lost++; return { ...rest, len: span.length } }
  const doc = readFileSync(p, 'utf8')
  const m = new RegExp(esc(span).replace(/\s+/g, '\\s+'), 'g').exec(doc)
  if (!m) { lost++; return { ...rest, len: span.length } }
  located++
  return { ...rest, off: m.index, len: m[0].length }
})
writeFileSync(`${HERE}ceiling-blind.json`, JSON.stringify(out, null, 1))
console.log(`ceiling-blind: ${located} located by offset, ${lost} length-only`)
