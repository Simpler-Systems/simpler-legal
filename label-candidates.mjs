#!/usr/bin/env node
// Wave-1 umbrella labeling: collect every unique institutional candidate across the 127-doc
// v1-plain substrate, label each ONCE via the router contract (GBNF single word), cache to
// pii-bench/umbrella-labels.json. Policies then race model-free off the cache forever.
//   node label-candidates.mjs [--port 49400]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectCandidates, labelCandidates } from './lib-legal/router.mjs'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const PORT = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : (process.env.SIMPLER_LLAMA_PORT ?? '49400')
const SRC = join(ROOT, 'raw', 'stripped', 'tab-dev-all-v1plain-gpu')

async function complete(system, user, opts = {}) {
  const body = {
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0,
    max_tokens: opts.maxTokens ?? 6,
    stream: false,
  }
  if (opts.grammar) body.grammar = opts.grammar
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`http ${r.status}`)
  return (await r.json()).choices?.[0]?.message?.content ?? ''
}

// global dedup across the corpus (red's lesson: classify once per UNIQUE candidate)
const globalCands = new Map()
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.txt'))) {
  const tbl = JSON.parse(readFileSync(`${SRC}-tables/${f}.json`, 'utf8'))
  const orig = readFileSync(join(ROOT, 'raw', 'tab-docs', 'dev', f), 'utf8')
  for (const c of collectCandidates(tbl, orig)) {
    const k = c.span.toLowerCase().replace(/[’']s?$/, '')
    if (!globalCands.has(k)) globalCands.set(k, c)
  }
}
console.log(`unique institutional candidates across 127 docs: ${globalCands.size}`)

// label in 4 concurrent lanes (the server has 4 slots)
const cands = [...globalCands.values()]
const lanes = [[], [], [], []]
cands.forEach((c, i) => lanes[i % 4].push(c))
const t0 = Date.now()
const results = await Promise.all(lanes.map((lane) => labelCandidates(lane, complete)))
const labels = {}
let failed = 0
for (const r of results) {
  for (const [k, v] of r.labels) labels[k] = v
  failed += r.stats.failedCalls
}
const secs = Math.round((Date.now() - t0) / 1000)
const dist = {}
for (const v of Object.values(labels)) dist[v] = (dist[v] || 0) + 1
console.log(`labeled ${Object.keys(labels).length}/${cands.length} in ${secs}s (${failed} failed calls)`)
console.log('distribution:', JSON.stringify(dist))
writeFileSync(
  join(ROOT, 'pii-bench', 'umbrella-labels.json'),
  JSON.stringify({ labeledAt: new Date().toISOString(), backend: 'cuda-b10081', port: PORT, count: Object.keys(labels).length, failedCalls: failed, distribution: dist, labels }, null, 1),
)
console.log('wrote pii-bench/umbrella-labels.json')
if (failed > 0) process.exit(2) // fail-loud: incomplete label set is stated, not hidden
