#!/usr/bin/env node
// Per-doc relevance router (the doc-relative classes: LOC/DEM/ORG/MISC survivors).
// Code nominates SURVIVING distinctive spans per document from the v1-legal.9 rendered
// output; Gemma answers ONE word per (doc, span): is it tied to the protected person(s) in
// THIS document, or part of the institutional/legal machinery? Mask-only (DIRECT cannot
// regress). Labels cached per doc for model-free policy racing.
//   node router-relevance.mjs [--port 49400]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('.', import.meta.url))
process.chdir(ROOT)
const R = await import('./lib-legal/legal-rails.mjs')
const PORT = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : (process.env.SIMPLER_LLAMA_PORT ?? '49400')

export const REL_GRAMMAR = 'root ::= "personal" | "institutional"'
export const REL_SYSTEM = `You judge whether a term in a legal judgment helps identify or characterize the PRIVATE INDIVIDUALS in the case (the applicant, victims, witnesses, their families), or whether it belongs to the institutional and legal machinery of the proceedings. Answer with exactly one word:
  personal      - the term describes the private person(s): where they lived or worked, their nationality or group, a benefit or scheme they received, an organization they belonged to, an object or place from the events of their life
  institutional - the term is part of the legal machinery: a court, government body acting as a party or decision-maker, a law or legal concept, a procedural term, a place merely hosting proceedings
Answer with the single label only.`

async function complete(system, user, opts = {}) {
  const body = { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0, max_tokens: opts.maxTokens ?? 6, stream: false }
  if (opts.grammar) body.grammar = opts.grammar
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`http ${r.status}`)
  return (await r.json()).choices?.[0]?.message?.content ?? ''
}

const STOPCAP = new Set(('The A An In On At By For It He She They We I This That When Where While After Before However Moreover Furthermore Accordingly Article Articles Section Sections Court Courts Government Convention Protocol Act Law Laws Rule Rules Chamber Registry Commission Committee Council Ministry Police Appeal Supreme High Administrative Criminal Civil Justice General Secretary Director President Officer Grand Divisional State States Kingdom Republic United European Human Rights Judge Judges Mr Mrs Ms Dr January February March April May June July August September October November December Strasbourg Europe Judgment Decision Application Applications Series Reports paragraph Paragraph No Nos').split(/\s+/))
const DEMONYMS = new Set(Object.values(R.STATES))
const SRC = 'raw/stripped/tab-dev-all-v1legal9'
const perDoc = {}
let total = 0
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.txt'))) {
  const rendered = readFileSync(`${SRC}/${f}`, 'utf8')
  const cands = new Map()
  // (a) surviving capitalized runs (1-3 tokens), (b) ALLCAPS acronyms, (c) bare demonyms
  for (const m of rendered.matchAll(/\b[A-ZÀ-Þ][a-zà-ÿ'’-]{2,}(?:\s+[A-ZÀ-Þ][a-zà-ÿ'’-]{2,}){0,2}\b|\b[A-Z]{2,6}\b/g)) {
    const span = m[0]
    const head = span.split(/\s+/)[0]
    if (span.startsWith('[') || STOPCAP.has(head) || STOPCAP.has(span)) continue
    if (R.STATES[span]) continue // states-as-parties are the seam, already policy-governed
    const k = span.toLowerCase()
    if (cands.has(k)) continue
    const isDemonym = DEMONYMS.has(span)
    const ctx = rendered.slice(Math.max(0, m.index - 90), m.index + span.length + 90).replace(/\s+/g, ' ')
    cands.set(k, { span, ctx, kind: isDemonym ? 'dem' : /^[A-Z]{2,6}$/.test(span) ? 'acr' : 'cap' })
  }
  perDoc[f] = [...cands.values()]
  total += perDoc[f].length
}
console.log(`per-doc relevance candidates: ${total} across 127 docs`)

const t0 = Date.now()
const entries = Object.entries(perDoc)
const lanes = [[], [], [], []]
entries.forEach((e, i) => lanes[i % 4].push(e))
const out = {}
let failed = 0
await Promise.all(
  lanes.map(async (lane) => {
    for (const [f, cands] of lane) {
      out[f] = {}
      for (const c of cands) {
        try {
          const raw = await complete(REL_SYSTEM, `Context: "...${c.ctx}..."\nTerm: "${c.span}"`, { grammar: REL_GRAMMAR })
          out[f][c.span] = { label: (raw || '').trim().toLowerCase(), kind: c.kind }
        } catch { failed++ }
      }
    }
  }),
)
const dist = {}
for (const d of Object.values(out)) for (const v of Object.values(d)) dist[v.label + ':' + v.kind] = (dist[v.label + ':' + v.kind] || 0) + 1
console.log(`labeled in ${Math.round((Date.now() - t0) / 1000)}s (${failed} failed)  dist: ${JSON.stringify(dist)}`)
writeFileSync('pii-bench/relevance-labels.json', JSON.stringify({ labeledAt: new Date().toISOString(), backend: 'cuda-b10081', failed, distribution: dist, perDoc: out }, null, 1))
console.log('wrote pii-bench/relevance-labels.json')
if (failed > 0) process.exit(2)
