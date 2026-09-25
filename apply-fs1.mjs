#!/usr/bin/env node
// FIX-SET-1 CANDIDATE (post-freeze; frozen v12 + FS1a surnames + FS1b SG codes + FS1c wide titles) applied to an arbitrary genre: originals + v1 substrate ->
// region pipeline -> rendered output. No tuning, no new rails — the freeze is the freeze.
// Restore stage uses the engine's documented deterministic fallback (keyword institutional
// + official-person restore) when no umbrella-label cache exists for the corpus, plus the
// frozen keep-vocabulary exact-region restores. Mask vocabulary applies word-bounded.
//   node apply-frozen.mjs --orig raw/oos --sub raw/stripped/ussg50-v1plain --out raw/stripped/ussg50-frozen
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('.', import.meta.url))
process.chdir(ROOT)
const R = await import('./lib-legal/legal-rails.mjs')
const { alignTags, mergeRegions, render } = await import('./lib-legal/regions.mjs')
const { foldFullwidth } = await import('./lib-core/anonymize.mjs')
const argv = process.argv.slice(2)
const val = (n) => argv[argv.indexOf(n) + 1]
const ORIG = val('--orig'), SUB = val('--sub'), OUT = val('--out')
mkdirSync(OUT, { recursive: true })

const maskVocab = JSON.parse(readFileSync('pii-bench/vocab-quasi.json', 'utf8')).terms
const keepVocab = new Set(JSON.parse(readFileSync('pii-bench/vocab-keep.json', 'utf8')).terms)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const reOf = (k) => new RegExp(`\\b${esc(k).replace(/\s+/g, '\\s+')}\\b`, 'gi')
const maskRes = maskVocab.map(reOf)
const OFFICIAL_TITLE_RE = /(?:Judges?|Justice|Mr\s+Justice|Mrs\s+Justice|Registrar|Deputy\s+Registrar|Advocate\s+General|Judge\s+Rapporteur)[\s,]{0,3}$/
const STATUTE_BEFORE_RE = /(?:Act|Law|Code|Order|Rules|Regulations|Protocol|Convention|Treaty|Charter|Constitution|Decree|no\.|No\.)\s*(?:of\s+)?$/
const norm = (s) => s.toLowerCase().trim().replace(/\s+/g, ' ')

let fails = []
for (const f of readdirSync(SUB).filter((x) => x.endsWith('.txt'))) {
  const rawOrig = readFileSync(`${ORIG}/${f}`, 'utf8')
  const orig = foldFullwidth(rawOrig)
  const masked = readFileSync(`${SUB}/${f}`, 'utf8')
  const tbl = JSON.parse(readFileSync(`${SUB}-tables/${f}.json`, 'utf8'))
  const aliases = R.institutionalGlossAliases(orig)
  const prot = R.protectedRanges(orig, aliases)
  const aligned = alignTags(orig, masked)
  if (!aligned.ok) { fails.push(f + ':' + aligned.why); continue }
  const rowByTag = new Map(tbl.map((r) => [r.tag, r]))
  // deterministic restore-eligibility (frozen fallback): institutional keyword COMPANY rows,
  // official-titled PERSON rows
  const eligible = (tag) => {
    const row = rowByTag.get(tag)
    if (!row) return false
    const folded = row.span.replace(/[’']s?$/, '')
    if (row.cls === 'COMPANY') return R.INSTITUTIONAL_WIDE_RE.test(folded) || [...aliases].some((a) => folded.includes(a))
    if (row.cls === 'PERSON') {
      const re = new RegExp(esc(row.span).replace(/\s+/g, '\\s+'), 'g')
      const AFTER_TITLE_RE = /^[,:]?s*(?:Circuit|District|Chief|Senior|Presiding)?s*(?:Judge|Justice|J.|JJ.?|C.?J.|JA|JC)/
      for (const m of orig.matchAll(re)) { if (OFFICIAL_TITLE_RE.test(orig.slice(Math.max(0, m.index - 30), m.index))) return true; if (AFTER_TITLE_RE.test(orig.slice(m.index + m[0].length, m.index + m[0].length + 30))) return true }
    }
    return false
  }
  let regions = aligned.regions.filter((r) => !(r.tags || [r.tag]).every(eligible))
  for (const r of regions) { // own-case-cite folding
    if (!(r.tags || [r.tag]).some((t) => (t || '').startsWith('[Person'))) continue
    const bm = /(?:\(\s*)?(?:R|Rex|Regina)?\.?\s*v\.\s*$/.exec(orig.slice(Math.max(0, r.start - 12), r.start))
    if (bm && bm[0].includes('v.')) r.start -= bm[0].length
    let after = orig.slice(r.end, r.end + 60)
    const vs = /^\s*v\.\s+[A-ZÀ-Þ][\w'’-]+(?:\s+[A-ZÀ-Þ][\w'’-]+)?/.exec(after)
    if (vs) { r.end += vs[0].length; after = orig.slice(r.end, r.end + 60) }
    const rep = /^\s*[\[(]\d{4}[\])]\s*\d*\s*[A-Z][A-Za-z .]{0,12}\d+(?:\s*\))?/.exec(after)
    if (rep) r.end += rep[0].length
  }
  const inProt = (s, e) => R.inProtected(prot, s, e)
  const add = (re, guard, unprotected = false) => {
    for (const m of orig.matchAll(re)) {
      if (!unprotected && inProt(m.index, m.index + m[0].length)) continue
      if (guard && !guard(m)) continue
      regions.push({ start: m.index, end: m.index + m[0].length, tag: '[X]' })
    }
  }
  add(/\b\d{1,5}\/\d{1,4}\b/g, (m) => {
    const b = orig.slice(Math.max(0, m.index - 60), m.index), a = orig.slice(m.index + m[0].length, m.index + m[0].length + 6)
    return /application/i.test(b) || !(/v\.?\s+[^,]{1,40},\s*(?:nos?\.\s*)?$/.test(b) || /^\s*,\s*§/.test(a))
  }, true)
  for (const rules of [R.L1_RULES_NO_CODE, R.L1C_RULES, R.L3_RULES, R.L4_RULES, R.L6_RULES, R.L8_RULES, R.L9_RULES])
    for (const { re } of rules) add(re)
  add(/\b(?:19|20)\d{2}\b/g, (m) => !STATUTE_BEFORE_RE.test(orig.slice(Math.max(0, m.index - 18), m.index)), true)
  const r9 = R.applyL9Wide(orig, aliases)
  for (const a of r9.added) {
    const re = new RegExp(`\\b(?:in|at|near|from) (${esc(a.span)})\\b`, 'g')
    for (const m of orig.matchAll(re)) {
      const s = m.index + m[0].length - m[1].length
      if (!inProt(s, s + m[1].length)) regions.push({ start: s, end: s + m[1].length, tag: '[X]' })
    }
  }
  for (const r of R.surnameRegions(orig, tbl)) regions.push(r)
  for (const r of R.sgPartyCodeRegions(orig)) regions.push(r)
  for (const re of maskRes) { re.lastIndex = 0; for (const m of orig.matchAll(re)) regions.push({ start: m.index, end: m.index + m[0].length, tag: '[X]' }) }
  // frozen keep-vocab exact-region restores
  let merged = mergeRegions(regions).filter((r) => !keepVocab.has(norm(orig.slice(r.start, r.end))))
  writeFileSync(`${OUT}/${f}`, render(orig, merged))
}
console.log(`applied frozen stack -> ${OUT}${fails.length ? '  ALIGN-FAILED: ' + fails.join(',') : ''}`)
