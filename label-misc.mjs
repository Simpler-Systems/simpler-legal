#!/usr/bin/env node
// Wave 2 — MISC router: code nominates SURVIVING distinctive tokens from the current best
// stack's output (capitalized unknowns + acronyms not inside protected ranges, not states,
// not common English); Gemma labels each once with a MISC umbrella contract; policies race
// off the cache. node label-misc.mjs [--port 49400]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const PORT = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : (process.env.SIMPLER_LLAMA_PORT ?? '49400')
const R = await import('./lib-legal/legal-rails.mjs')
const { restoreByPolicy } = await import('./lib-legal/router.mjs')
const labels = new Map(Object.entries(JSON.parse(readFileSync(join(ROOT, 'pii-bench', 'umbrella-labels.json'), 'utf8')).labels))
const POLICY = { 'echr-organ': true, government: true, court: true, company: false, other: false }

export const MISC_GRAMMAR = 'root ::= "benefit-scheme" | "acronym-org" | "political-religious" | "product-brand" | "legal-term" | "other"'
export const MISC_SYSTEM = `You label what a distinctive term refers to inside a legal judgment about a private person. Answer with exactly one word:
  benefit-scheme      - a named welfare benefit, allowance, pension or insurance scheme the person received
  acronym-org         - an acronym or short code naming an organization, programme or scheme
  political-religious - a political ideology, movement, party, religion or ethnic-political term tied to the person
  product-brand       - a product, vehicle or brand name connected to the person or the events
  legal-term          - a named law, act, legal doctrine, offence or procedural term
  other               - none of the above
Answer with the single label only.`

async function complete(system, user, opts = {}) {
  const body = { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0, max_tokens: opts.maxTokens ?? 8, stream: false }
  if (opts.grammar) body.grammar = opts.grammar
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`http ${r.status}`)
  return (await r.json()).choices?.[0]?.message?.content ?? ''
}

// build current-best output per doc, then nominate survivors
const STOPCAP = new Set(('The A An In On At By For It He She They We I This That Court Government Article Articles Section Convention Protocol Act Law January February March April May June July August September October November December Mr Mrs Ms Dr Judge President State Kingdom Republic United European Human Rights Chamber Registry Commission Committee Council Ministry Police Appeal Supreme High Administrative Criminal Civil Justice General Secretary Director Officer Grand Divisional' ).split(/\s+/))
const SRC = join(ROOT, 'raw', 'stripped', 'tab-dev-all-v1plain-gpu')
const cands = new Map()
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.txt'))) {
  const tbl = JSON.parse(readFileSync(`${SRC}-tables/${f}.json`, 'utf8'))
  const orig = readFileSync(join(ROOT, 'raw', 'tab-docs', 'dev', f), 'utf8')
  const aliases = R.institutionalGlossAliases(orig)
  let t = readFileSync(join(SRC, f), 'utf8')
  t = R.applyAppNumbersGuarded(t).text
  for (const rules of [R.L1_RULES_NO_CODE, R.L1C_RULES, R.L3_RULES, R.L4_RULES, R.L6_RULES])
    t = R.applyRulesProtected(t, rules, R.protectedRanges(t, aliases)).text
  t = R.applyL1bGuarded(t).text
  t = R.applyL8(t, aliases).text
  t = R.applyL9(t, aliases).text
  t = R.applyL9Wide(t, aliases).text
  t = restoreByPolicy(t, tbl, labels, POLICY).text
  const ranges = R.protectedRanges(t, aliases)
  // nominate: ALLCAPS 2-6 chars, or Capitalized tokens not stop/state/month, surviving in text
  for (const m of t.matchAll(/\b(?:[A-Z]{2,6}|[A-Z][a-z][\w'’-]{2,})\b/g)) {
    const tok = m[0]
    if (STOPCAP.has(tok) || R.STATES[tok] || tok.startsWith('[')) continue
    if (R.inProtected(ranges, m.index, m.index + tok.length)) continue
    const k = tok.toLowerCase()
    if (!cands.has(k)) {
      const i = m.index
      cands.set(k, { span: tok, ctx: t.slice(Math.max(0, i - 90), i + tok.length + 90).replace(/\s+/g, ' ') })
    }
  }
}
console.log(`wave-2 MISC candidates (unique, corpus-wide): ${cands.size}`)
const list = [...cands.values()]
const lanes = [[], [], [], []]
list.forEach((c, i) => lanes[i % 4].push(c))
const t0 = Date.now()
const out = {}
let calls = 0, failed = 0
await Promise.all(
  lanes.map(async (lane) => {
    for (const c of lane) {
      try {
        const raw = await complete(MISC_SYSTEM, `Context: "...${c.ctx}..."\nTerm: "${c.span}"`, { grammar: MISC_GRAMMAR })
        calls++
        const v = (raw || '').trim().toLowerCase()
        out[c.span.toLowerCase()] = v
      } catch {
        failed++
      }
    }
  }),
)
const dist = {}
for (const v of Object.values(out)) dist[v] = (dist[v] || 0) + 1
console.log(`labeled ${calls} in ${Math.round((Date.now() - t0) / 1000)}s (${failed} failed)  dist: ${JSON.stringify(dist)}`)
writeFileSync(join(ROOT, 'pii-bench', 'misc-labels.json'), JSON.stringify({ labeledAt: new Date().toISOString(), backend: 'cuda-b10081', count: calls, failed, distribution: dist, labels: out }, null, 1))
console.log('wrote pii-bench/misc-labels.json')
if (failed > 0) process.exit(2)
