#!/usr/bin/env node
// LQ RACE (TASKS_OVERNIGHT #4) — add-only QUASI sweeps as a POST-PROCESSOR: run LQ1
// (person-attributes) / LQ2 (person-linked places) over the ORIGINAL, then mask verified
// spans' word-bounded occurrences in the rendered output. Add-only => DIRECT-gate-safe.
//   node apply-lq.mjs --orig raw/oos --in raw/stripped/ussg50-LN12 --out raw/stripped/ussg50-LQ --lq 1,2 [--files ...]
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('.', import.meta.url))
process.chdir(ROOT)
const S = await import('./lib-legal/sweeps.mjs')
const S2 = await import('./lib-legal/sweeps2.mjs')
const { foldFullwidth } = await import('./lib-core/anonymize.mjs')
const argv = process.argv.slice(2)
const val = (n) => argv[argv.indexOf(n) + 1]
const ORIG = val('--orig'), IN = val('--in'), OUT = val('--out')
const LQ = new Set((argv.includes('--lq') ? val('--lq') : '1,2').split(','))
// LQb: classes excluded from masking (first race: EMPLOYER masked keep-doctrine companies —
// courts −4.5 NM, EDGAR −8.9 NM; workplace names are company-keep territory, not QUASI)
const SKIP = new Set((argv.includes('--skip') ? val('--skip') : '').split(',').filter(Boolean))
const ONLY = argv.includes('--files') ? new Set(val('--files').split(',')) : null
const PORT = argv.includes('--port') ? val('--port') : (process.env.SIMPLER_LLAMA_PORT ?? '49400')
mkdirSync(OUT, { recursive: true })
const complete = S.makeComplete(PORT)
const h = await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json()).catch(() => null)
if (!h || h.status !== 'ok') { console.error('no healthy model — refusing'); process.exit(1) }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const TAG_FOR = { JOB: '[Job]', KIN: '[Dem]', EDU: '[Dem]', GROUP: '[Dem]', HEALTH: '[Dem]', STATUS: '[Dem]', SCHOOL: '[Place]', HOME: '[Place]', WORSHIP: '[Place]', MEDICAL: '[Place]', EMPLOYER: '[Place]' }
// never mask via LQ: generic legal-role/institution words the sweeps sometimes over-nominate
const LQ_VETO = /^(?:director|president|chairman|secretary|treasurer|manager|officer|executive|counsel|judge|justice|solicitor|advocate|lawyer|attorney|liquidator|trustee|receiver|auditor|witness|expert)s?$/i
// LQc structural guards (EDGAR diagnosis: 92 destroyed NM entities in 3 named classes):
// (a) phrases carrying corporate/defined-term words destroy company-keep doctrine
const LQ_CORPY = /\b(?:Compan(?:y|ies)|Corporation|Corp|Inc|LLC|LLP|Ltd|Employer|Employee|Agreement|Plan|Board|Base Salary|Bonus|Term)\b/
// (b) bare/compound title phrases are NM under P0b (Chairman of the Board of Directors)
const LQ_TITLE_PHRASE = /^(?:the\s+)?(?:Chairman|Chairwoman|President|Chief\s+\w+\s+Officer|CEO|CFO|COO|CTO|Executive|Officer|Director|Secretary|Treasurer|(?:Senior\s+|Executive\s+)?Vice\s+President)(?:\s+(?:and|of|the|Board|Directors?|CEO|President|Chairman))*$/i
// (c) generic-class kin/health/status words are clause boilerplate, not identity
const LQ_GENERIC = /\b(?:child(?:ren)?|family|relatives?|dependents?|death|disabilit(?:y|ies)|disabled|illness|accident|impairment|estate|spouse'?s? estate)\b/i
const GENERIC_CLASSES = new Set(['KIN', 'HEALTH', 'STATUS'])

const runLog = { engine: 'lq-post', lq: [...LQ].join(','), docs: [] }
for (const f of readdirSync(IN).filter((x) => x.endsWith('.txt') && (!ONLY || ONLY.has(x)))) {
  const t0 = Date.now()
  const orig = foldFullwidth(readFileSync(`${ORIG}/${f}`, 'utf8'))
  let out = readFileSync(`${IN}/${f}`, 'utf8')
  const found = []
  let s1 = null, s2 = null
  if (LQ.has('1')) { const r = await S2.sweepLQ1Attributes(orig, complete); s1 = r.stats; found.push(...r.found) }
  if (LQ.has('2')) { const r = await S2.sweepLQ2Places(orig, complete); s2 = r.stats; found.push(...r.found) }
  let masked = 0
  for (const { cls, span } of found) {
    if (SKIP.has(cls) || LQ_VETO.test(span.trim())) continue
    if (LQ_CORPY.test(span) || LQ_TITLE_PHRASE.test(span.trim())) continue
    if (GENERIC_CLASSES.has(cls) && LQ_GENERIC.test(span)) continue
    const tag = TAG_FOR[cls] || '[Dem]'
    const re = new RegExp(`\\b${esc(span).replace(/\s+/g, '\\s+')}\\b`, 'g')
    out = out.replace(re, () => { masked++; return tag })
  }
  writeFileSync(`${OUT}/${f}`, out)
  runLog.docs.push({ file: f, secs: Math.round((Date.now() - t0) / 1000), lq1: s1, lq2: s2, spans: found.length, masked })
  console.log(`${f}  ${Math.round((Date.now() - t0) / 1000)}s  spans ${found.length}  masked ${masked}${s1 ? `  LQ1 ${s1.calls}c/${s1.verified}v` : ''}${s2 ? `  LQ2 ${s2.calls}c/${s2.verified}v` : ''}`)
  if ((s1?.failed || 0) + (s2?.failed || 0) > 0) {
    const hh = await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json()).catch(() => null)
    if (!hh || hh.status !== 'ok') { writeFileSync(`${OUT}/_lqrun.json`, JSON.stringify(runLog, null, 1)); console.error('SERVER DIED — aborting'); process.exit(3) }
  }
}
writeFileSync(`${OUT}/_lqrun.json`, JSON.stringify(runLog, null, 1))
console.log(`LQ post-pass -> ${OUT}`)
