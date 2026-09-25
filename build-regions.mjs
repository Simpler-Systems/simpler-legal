#!/usr/bin/env node
// v1-legal.9 — the region-based rebuild of the adopted stack (corruption-free by
// construction). Pipeline: alignTags(v1 substrate) -> tag regions; rails ADD regions via
// regex over the ORIGINAL; restores REMOVE tag regions per-occurrence; render + offsets.
//   node build-regions.mjs [--out raw/stripped/tab-dev-all-v1legal9] [--offsets pii-bench/official-masked-v1legal9.json]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('.', import.meta.url))
process.chdir(ROOT)
const R = await import('./lib-legal/legal-rails.mjs')
const { alignTags, mergeRegions, render, toOffsets } = await import('./lib-legal/regions.mjs')
const { foldFullwidth } = await import('./lib-core/anonymize.mjs')

const argv = process.argv.slice(2)
const val = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
const OUT = val('--out', 'raw/stripped/tab-dev-all-v1legal9')
const OFFS = val('--offsets', 'pii-bench/official-masked-v1legal9.json')

const labels = new Map(Object.entries(JSON.parse(readFileSync('pii-bench/umbrella-labels.json', 'utf8')).labels))
const POLICY = { 'echr-organ': true, government: true, court: true, company: false, other: false }
const SRC = 'raw/stripped/tab-dev-all-v1plain-gpu'
const OFFICIAL_TITLE_RE = /(?:Judges?|Justice|Mr\s+Justice|Mrs\s+Justice|Registrar|Deputy\s+Registrar|Advocate\s+General|Judge\s+Rapporteur)[\s,]{0,3}$/
const STATUTE_BEFORE_RE = /(?:Act|Law|Code|Order|Rules|Regulations|Protocol|Convention|Treaty|Charter|Constitution|Decree|no\.|No\.)\s*(?:of\s+)?$/
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

mkdirSync(OUT, { recursive: true })
const allOffsets = {}
let failed = []
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.txt'))) {
  const id = f.replace('.txt', '')
  const rawOrig = readFileSync(`raw/tab-docs/dev/${f}`, 'utf8')
  const orig = foldFullwidth(rawOrig)
  const masked = readFileSync(`${SRC}/${f}`, 'utf8')
  const tbl = JSON.parse(readFileSync(`${SRC}-tables/${f}.json`, 'utf8'))
  const aliases = R.institutionalGlossAliases(orig)
  const prot = R.protectedRanges(orig, aliases)

  const aligned = alignTags(orig, masked)
  if (!aligned.ok) { failed.push(id + ':' + aligned.why); continue }

  // map each tag region to its table rows (by tag string)
  const rowByTag = new Map(tbl.map((r) => [r.tag, r]))
  const spanKey = (s) => s.toLowerCase().replace(/[’']s?$/, '')

  // RESTORE decision per tag region: remove the region if EVERY tag in it is restore-eligible
  const eligible = (tag) => {
    const row = rowByTag.get(tag)
    if (!row) return false
    if (row.cls === 'COMPANY') {
      const l = labels.get(spanKey(row.span)) || 'other'
      return POLICY[l]
    }
    if (row.cls === 'PERSON') {
      // official-person restore: any occurrence in orig behind a judicial title
      const re = new RegExp(escRe(row.span).replace(/\s+/g, '\\s+'), 'g')
      for (const m of orig.matchAll(re)) {
        if (OFFICIAL_TITLE_RE.test(orig.slice(Math.max(0, m.index - 30), m.index))) return true
      }
      return false
    }
    return false
  }
  let regions = aligned.regions.filter((r) => !(r.tags || [r.tag]).every(eligible))

  // own-case-cite folding, BOTH directions (a cite whose party is already masked is the
  // applicant's own case — the whole citation is the DIRECT identifier):
  //   before: "(R. v. " / "X v. " crown-style prefixes
  //   after:  " v. State", law-report tails "[1998] 2 All ER 155", closing paren
  for (const r of regions) {
    if (!(r.tags || [r.tag]).some((t) => (t || '').startsWith('[Person'))) continue
    const beforeM = /(?:\(\s*)?(?:R|Rex|Regina)?\.?\s*v\.\s*$/.exec(orig.slice(Math.max(0, r.start - 12), r.start))
    if (beforeM && beforeM[0].includes('v.')) r.start -= beforeM[0].length
    let after = orig.slice(r.end, r.end + 60)
    const vState = /^\s*v\.\s+[A-ZÀ-Þ][\w'’-]+(?:\s+[A-ZÀ-Þ][\w'’-]+)?/.exec(after)
    if (vState) { r.end += vState[0].length; after = orig.slice(r.end, r.end + 60) }
    const report = /^\s*[\[(]\d{4}[\])]\s*\d*\s*[A-Z][A-Za-z .]{0,12}\d+(?:\s*\))?/.exec(after)
    if (report) r.end += report[0].length
  }

  // RAILS as region-adders over the original
  const inProt = (s, e) => R.inProtected(prot, s, e)
  // unprotected=true for digit-led rails: protection saves institutional WORDS, never
  // numbers — a case number inside "...Court (file nos. X)" must still mask (measured
  // DIRECT leak 2004/351)
  const add = (re, cls, guard, unprotected = false) => {
    for (const m of orig.matchAll(re)) {
      if (!unprotected && inProt(m.index, m.index + m[0].length)) continue
      if (guard && !guard(m)) continue
      regions.push({ start: m.index, end: m.index + m[0].length, tag: `[${cls}]` })
    }
  }
  // app numbers (own vs precedent-cite guard)
  add(/\b\d{1,5}\/\d{1,4}\b/g, 'Code', (m) => {
    const before = orig.slice(Math.max(0, m.index - 60), m.index)
    const after = orig.slice(m.index + m[0].length, m.index + m[0].length + 6)
    const own = /application/i.test(before)
    const precedent = /v\.?\s+[^,]{1,40},\s*(?:nos?\.\s*)?$/.test(before) || /^\s*,\s*§/.test(after)
    return own || !precedent
  }, true)
  for (const rules of [R.L1_RULES_NO_CODE, R.L1C_RULES, R.L3_RULES, R.L4_RULES, R.L6_RULES, R.L8_RULES, R.L9_RULES])
    for (const { cls, re } of rules) add(re, cls)
  // years with statute guard (unprotected: digits are never institutional words)
  add(/\b(?:19|20)\d{2}\b/g, 'Date', (m) => !STATUTE_BEFORE_RE.test(orig.slice(Math.max(0, m.index - 18), m.index)), true)
  // wide prepositional places (exclusion set lives in the rail module's export)
  {
    const r9 = R.applyL9Wide(orig, aliases) // returns added spans — reuse its logic for WHICH spans
    for (const a of r9.added) {
      // find occurrences of the captured place token, prepositional context re-checked
      const re = new RegExp(`\\b(?:in|at|near|from) (${escRe(a.span)})\\b`, 'g')
      for (const m of orig.matchAll(re)) {
        const s = m.index + m[0].length - m[1].length
        if (!inProt(s, s + m[1].length)) regions.push({ start: s, end: s + m[1].length, tag: '[Place]' })
      }
    }
  }

  const merged = mergeRegions(regions)
  writeFileSync(`${OUT}/${f}`, render(orig, merged))
  allOffsets[id] = toOffsets(merged)
}
writeFileSync(OFFS, JSON.stringify(allOffsets))
console.log(`built ${Object.keys(allOffsets).length}/127 -> ${OUT}; offsets -> ${OFFS}${failed.length ? '; FAILED: ' + failed.join(',') : ''}`)
