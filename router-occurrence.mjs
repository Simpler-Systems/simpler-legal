#!/usr/bin/env node
// PER-OCCURRENCE relevance router — the frontier-shift experiment. The per-doc router
// measured +5.6 QUASI / −9.7 NM because one label per (doc,span) cannot express "mask
// 'London' in the applicant's address, keep it in 'Court of Appeal, London'". This router
// judges EVERY SURVIVING OCCURRENCE with its own local context, the mention highlighted.
// Coordinates: original text throughout — survivors = occurrences outside the v1-legal.9
// region offsets; personal-judged occurrences become NEW regions (mask-only => DIRECT
// cannot regress). Labels cached; policies race model-free.
//   node router-occurrence.mjs [--port 49400]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('.', import.meta.url))
process.chdir(ROOT)
const R = await import('./lib-legal/legal-rails.mjs')
const { foldFullwidth } = await import('./lib-core/anonymize.mjs')
const PORT = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : (process.env.SIMPLER_LLAMA_PORT ?? '49400')

const GRAMMAR = 'root ::= "personal" | "institutional"'
const SYSTEM = `You judge ONE highlighted mention (marked «like this») inside a legal judgment. Decide whether THIS mention, in THIS sentence, helps identify or characterize the PRIVATE INDIVIDUALS of the case, or whether it is part of the institutional and legal machinery. Answer with exactly one word:
  personal      - this mention describes the private person(s): where they lived, worked or were treated, their nationality or community, a benefit they received, an organization from their own life, an object or place from the events that happened to them
  institutional - this mention is legal machinery: part of a court or authority name, a deciding or administering body, a law or legal concept, a procedural reference, a place merely naming the seat of proceedings
Answer with the single label only.`

async function complete(system, user, opts = {}) {
  const body = { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0, max_tokens: opts.maxTokens ?? 6, stream: false }
  if (opts.grammar) body.grammar = opts.grammar
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`http ${r.status}`)
  return (await r.json()).choices?.[0]?.message?.content ?? ''
}

const STOPCAP = new Set(('The A An In On At By For It He She They We I This That When Where While After Before However Moreover Furthermore Accordingly Article Articles Section Sections Court Courts Government Convention Protocol Act Law Laws Rule Rules Chamber Registry Commission Committee Council Ministry Police Appeal Supreme High Administrative Criminal Civil Justice General Secretary Director President Officer Grand Divisional State States Kingdom Republic United European Human Rights Judge Judges Mr Mrs Ms Dr January February March April May June July August September October November December Strasbourg Europe Judgment Decision Application Applications Series Reports paragraph Paragraph No Nos Lords Lord House Session Division Bench Queen King Crown Order Chapter Part Schedule Annex').split(/\s+/))
const DEMONYMS = new Set(Object.values(R.STATES))
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const offsets = JSON.parse(readFileSync('pii-bench/official-masked-v1legal9.json', 'utf8'))
const goldDocs = new Map(JSON.parse(readFileSync('raw/tab/echr_dev.json', 'utf8')).map((d) => [d.doc_id, d.text]))
const covered = (regs, s, e) => regs.some(([a, b]) => s < b && e > a)

const perDoc = {}
let total = 0
for (const f of readdirSync('raw/stripped/tab-dev-all-v1legal9').filter((x) => x.endsWith('.txt'))) {
  const id = f.replace('.txt', '')
  const orig = foldFullwidth(goldDocs.get(id))
  const regs = offsets[id] || []
  const occ = []
  const seenSpan = new Map() // span -> count cap
  for (const m of orig.matchAll(/\b[A-ZÀ-Þ][a-zà-ÿ'’-]{2,}(?:\s+[A-ZÀ-Þ][a-zà-ÿ'’-]{2,}){0,2}\b|\b[A-Z]{2,6}\b/g)) {
    const span = m[0]
    const head = span.split(/\s+/)[0]
    if (STOPCAP.has(head) || STOPCAP.has(span) || R.STATES[span]) continue
    const s = m.index, e = m.index + span.length
    if (covered(regs, s, e)) continue
    const n = seenSpan.get(span.toLowerCase()) || 0
    if (n >= 8) continue // cap per span per doc
    seenSpan.set(span.toLowerCase(), n + 1)
    const kind = DEMONYMS.has(span) ? 'dem' : /^[A-Z]{2,6}$/.test(span) ? 'acr' : 'cap'
    const ctx = (orig.slice(Math.max(0, s - 85), s) + '«' + span + '»' + orig.slice(e, e + 85)).replace(/\s+/g, ' ')
    occ.push({ span, start: s, end: e, kind, ctx })
  }
  perDoc[id] = occ
  total += occ.length
}
console.log(`surviving occurrences to judge: ${total} across 127 docs`)

const t0 = Date.now()
const entries = Object.entries(perDoc)
const lanes = [[], [], [], []]
entries.forEach((e, i) => lanes[i % 4].push(e))
const out = {}
let failed = 0, done = 0
await Promise.all(
  lanes.map(async (lane) => {
    for (const [id, occs] of lane) {
      out[id] = []
      for (const o of occs) {
        try {
          const raw = await complete(SYSTEM, `Passage: "...${o.ctx}..."\nJudge the mention marked «...».`, { grammar: GRAMMAR })
          out[id].push({ span: o.span, start: o.start, end: o.end, kind: o.kind, label: (raw || '').trim().toLowerCase() })
        } catch { failed++ }
        if (++done % 1000 === 0) console.log(`${done}/${total} (${Math.round((Date.now() - t0) / 1000)}s)`)
      }
    }
  }),
)
const dist = {}
for (const l of Object.values(out)) for (const o of l) dist[o.label + ':' + o.kind] = (dist[o.label + ':' + o.kind] || 0) + 1
console.log(`labeled ${done} in ${Math.round((Date.now() - t0) / 1000)}s (${failed} failed)  dist: ${JSON.stringify(dist)}`)
writeFileSync('pii-bench/occurrence-labels.json', JSON.stringify({ labeledAt: new Date().toISOString(), backend: 'cuda-b10081', total: done, failed, distribution: dist, perDoc: out }, null, 1))
console.log('wrote pii-bench/occurrence-labels.json')
if (failed > 0) process.exit(2)
