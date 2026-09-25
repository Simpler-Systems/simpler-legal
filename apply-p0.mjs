#!/usr/bin/env node
// PHASE 0 — THE PROFILE SPLIT (2026-07-23, owner: "ok try it out").
// One engine, two doctrines, selected by --profile:
//   tab-scorer  byte-identical to the FS4 stack (apply-fs2.mjs): dates/amounts/durations
//               masked wholesale — TAB's doctrine, kept for scoring against TAB-shaped gold.
//   product     the court-validated doctrine (REDACTION_AUDIT.md): dates, amounts, ages and
//               durations SURVIVE unless identity-anchored (born/birth/DOB/death/passport/
//               NRIC/salary-class anchors). Companies already survive via the FS3 guards.
//               Nationalities (L4), occupations (L8), places (L9) stay masked — separate
//               arms, not part of this ruling.
// Evidence for the ruling: 8 SGHCF anonymized judgments keep dates (142 in one doc), ages,
// money wholesale while letter-coding persons and person-anchored entities; F.3d and EDGAR
// practice agrees. TAB is the outlier doctrine and keeps its own profile.
//   node apply-p0.mjs --orig raw/oos --sub raw/stripped/ussg50-v1plain --out raw/stripped/ussg50-P0 --profile product
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
const PROFILE = argv.includes('--profile') ? val('--profile') : 'tab-scorer'
if (!['tab-scorer', 'product'].includes(PROFILE)) { console.error('unknown profile'); process.exit(1) }
mkdirSync(OUT, { recursive: true })

// identity anchors: the ONLY reasons a date/amount/duration is masked under product doctrine
const IDENTITY_ANCHOR_RE = /\b(?:born|births?|date of birth|d\.?\s?o\.?\s?b\.?|died|date of death|passport|identity card|nric|social security|salary|salaries|wages?|remuneration)\b/i
// vocab terms that are date/quantity-shaped (dev-grown for TAB; product doctrine keeps them)
const QSHAPE_RE = /^(?:\d|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b)|\b(?:days?|months?|years?|weeks?|hearings?|anniversar)/i

const maskVocabAll = JSON.parse(readFileSync('pii-bench/vocab-quasi.json', 'utf8')).terms
// product also drops ECHR-vocab terms that collide with the P0b title/board keep-doctrine
// (measured, FS5c: "the Board", "Chief Executive Officer" NO_MASK entities destroyed)
const TITLE_VOCAB_RE = /^(?:the\s+)?(?:board|chief\s+\w+\s+officer|ceo|cfo|coo|director|president|chairman|secretary|treasurer|manager|officer)s?$/i
const maskVocab = PROFILE === 'product' ? maskVocabAll.filter((t) => !QSHAPE_RE.test(t) && !TITLE_VOCAB_RE.test(t)) : maskVocabAll
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
  const CITE_SHIELD = /[\[(]\d{4}[\])]\s*\d*\s*[A-Z][A-Za-z .]{0,14}\d+|\b[A-Z][\w&.'’ -]{2,40}\s+v\.?\s+[A-Z][\w&.'’ -]{2,40}\b|\bSuit No\s?\d+ of \d{4}/g
  { const ptoks = new Set(tbl.filter(x=>x.cls==='PERSON').flatMap(x=>x.span.split(/\s+/).map(w=>w.toLowerCase()).filter(w=>w.length>=3))); for (const m of orig.matchAll(CITE_SHIELD)) { const words = m[0].toLowerCase().split(/[^a-zà-ÿ'’-]+/); if (!words.some(w=>ptoks.has(w))) prot.push([m.index, m.index + m[0].length]) } }
  const aligned = alignTags(orig, masked)
  if (!aligned.ok) { fails.push(f + ':' + aligned.why); continue }
  const rowByTag = new Map(tbl.map((r) => [r.tag, r]))
  const eligible = (tag) => {
    const row = rowByTag.get(tag)
    if (!row) return false
    const folded = row.span.replace(/[’']s?$/, '')
    // P0c (product): BRAND rows are company-class too (red's business game tags suffix-less
    // companies as BRAND), and the person-token veto uses CLEAN person rows only — junk
    // classify rows like "Chief Executive Officer of Millennium Cell" (cls PERSON) otherwise
    // poison the token set and veto the company's own restore. tab-scorer keeps FS3 byte-exact.
    if (row.cls === 'COMPANY' || (PROFILE === 'product' && row.cls === 'BRAND')) {
      if (row.cls === 'BRAND' && PROFILE !== 'product') return false
      const defRe = new RegExp('[(“"‘\x27]\\s*(?:the\\s+)?' + esc(row.span.replace(/^the\s+/i,'')) + '\\s*[”"’\x27)]', 'i')
      if (defRe.test(orig)) return false
      const prows = tbl.filter((x) => x.cls === 'PERSON')
      const src = PROFILE === 'product' ? prows.filter((x) => x.span.split(/\s+/).length <= 4 && !/\b(?:of|and)\b/i.test(x.span)) : prows
      const ptoks = new Set(src.flatMap((x) => x.span.split(/\s+/).map((w) => w.toLowerCase())))
      return !folded.toLowerCase().split(/\s+/).some((w) => w.length >= 3 && ptoks.has(w))
    }
    if (row.cls === 'PERSON') {
      const re = new RegExp(esc(row.span).replace(/\s+/g, '\\s+'), 'g')
      const AFTER_TITLE_RE = /^[,:]?s*(?:Circuit|District|Chief|Senior|Presiding)?s*(?:Judge|Justice|J.|JJ.?|C.?J.|JA|JC)/
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
  // FS5c — surname continuation: v1 sometimes masks only the FIRST name, leaving
  // "[Person20] Hundley v. …" (us-opinion-19). A capitalized token directly after a person
  // region, in own-case position (before "v."), is the person's surname: propagate doc-wide.
  for (const r of aligned.regions) {
    if (!(r.tags || [r.tag]).some((t) => (t || '').startsWith('[Person'))) continue
    const tail = /^\s?([A-ZÀ-Þ][\w'’-]{2,})\s+v\.?\s/.exec(orig.slice(r.end, r.end + 40))
    if (tail) for (const m of orig.matchAll(R.nameTokenRe(tail[1]))) regions.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
  }
  const inProt = (s, e) => R.inProtected(prot, s, e)
  // product doctrine: a date/amount/duration region fires ONLY when identity-anchored (±70).
  // FS5: anchored TEXTS propagate doc-wide (the occurrence-vs-entity asymmetry: a DOB masked
  // at its anchor but surviving verbatim elsewhere scored as an entity leak).
  const anchoredTexts = new Set()
  const anchored = (m) => {
    const hit = IDENTITY_ANCHOR_RE.test(orig.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70))
    if (hit) anchoredTexts.add(m[0])
    return hit
  }
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
  const FLIP = PROFILE === 'product' ? new Set([R.L1_RULES_NO_CODE, R.L1C_RULES, R.L3_RULES, R.L6_RULES]) : new Set()
  for (const rules of [R.L1_RULES_NO_CODE, R.L1C_RULES, R.L3_RULES, R.L4_RULES, R.L6_RULES, R.L8_RULES, R.L9_RULES])
    for (const { re } of rules) add(re, FLIP.has(rules) ? anchored : undefined)
  add(/\b(?:19|20)\d{2}\b/g, (m) => !STATUTE_BEFORE_RE.test(orig.slice(Math.max(0, m.index - 18), m.index)) && (PROFILE !== 'product' || anchored(m)), true)
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
  for (const r of R.captionPartyRegions(orig)) regions.push(r)
  // FS5 DIRECT rails — profile-invariant per the gate law
  for (const r of R.titleCaptionRegions(orig)) regions.push(r)
  for (const r of R.aliasInitialRegions(orig, tbl)) regions.push(r)
  for (const r of R.quotedVariantRegions(orig)) regions.push(r)
  for (const r of R.kinshipNameRegions(orig)) regions.push(r)
  for (const r of R.definedAliasRegions(orig)) regions.push(r)
  for (const r of R.ownCaseCiteRegions(orig)) regions.push(r)
  // FS5 QUASI rails
  for (const r of R.kinshipPhraseRegions(orig)) regions.push(r)
  for (const r of R.dialectReligionRegions(orig)) regions.push(r)
  for (const r of R.occupationContextRegions(orig)) regions.push(r)
  // FS5 anchored-text propagation (product): every occurrence of an identity-anchored
  // date/amount masks, not just the anchored one
  if (PROFILE === 'product') {
    const MONTH_BEFORE_RE = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*$|\d{1,2}[./-]\s?$/i
    for (const t of anchoredTexts) {
      const isYear = /^(?:19|20)\d\d$/.test(t)
      // only MAXIMAL forms propagate: full dates (contain a year) and amounts (currency /
      // magnitude). "January 1" (month-day fragment) propagating shredded every
      // "January 1, 2010" NO_MASK date as a subspan (measured, FS5c: 68 destroyed).
      if (t.length < 6 && !isYear) continue
      if (!isYear && !/\d{4}|[$€£]|\b(?:million|billion|thousand)\b/i.test(t)) continue
      const re = new RegExp(`\\b${esc(t).replace(/\s+/g, '\\s+')}\\b`, 'g')
      for (const m of orig.matchAll(re)) {
        if (isYear && MONTH_BEFORE_RE.test(orig.slice(Math.max(0, m.index - 20), m.index))) continue
        if (!inProt(m.index, m.index + m[0].length)) regions.push({ start: m.index, end: m.index + m[0].length, tag: '[X]' })
      }
    }
  }
  if (PROFILE === 'product') {
    // own-case reporter-cite folding v2 (product only; tab-scorer's year rail covered this by
    // accident — us-opinion-19 "Hundley v. Rite Aid ..., 529 S.E.2d 45 (S.C.Ct.App.2000)").
    // A cite directly trailing a masked person (optionally through "v. <opponent>,") IS the
    // person's own case — DIRECT. Precedent cites never sit on a masked person, and stay.
    const US_CITE_RE = /^\s*,?\s*\d{1,4}\s+[A-Z][A-Za-z0-9. ]{0,16}?\d{1,5}\s*(?:\([^)\n]{0,45}\))?/
    for (const r of regions) {
      if (!(r.tags || [r.tag]).some((t) => (t || '').startsWith('[Person'))) continue
      let end2 = r.end
      let after = orig.slice(end2, end2 + 130)
      const vs2 = /^\s*v\.?\s+[A-ZÀ-Þ][\w&.,'’ -]{0,60}?(?=,\s*\d{1,4}\s+[A-Z])/.exec(after)
      if (vs2) { end2 += vs2[0].length; after = orig.slice(end2, end2 + 90) }
      const rc = US_CITE_RE.exec(after)
      if (rc && /^\s*,?\s*\d/.test(after)) r.end = end2 + rc[0].length
    }
  }
  for (const re of maskRes) { re.lastIndex = 0; for (const m of orig.matchAll(re)) regions.push({ start: m.index, end: m.index + m[0].length, tag: '[X]' }) }
  // FS5b: keep-vocab may NEVER override a Person/Code-tagged region (gate law). Measured
  // kill chain: ECHR-grown keep vocab contains "wilson" (Wilson v. UK is ECtHR precedent) and
  // silently unmasked every FS5 Wilson region on us-opinion-07 — gloss-pollution, keep-side.
  const personish = (r) => (r.tags || [r.tag]).some((t) => /^\[(?:Person|Code)/.test(t || ''))
  let merged = mergeRegions(regions).filter((r) => personish(r) || !keepVocab.has(norm(orig.slice(r.start, r.end))))
  writeFileSync(`${OUT}/${f}`, render(orig, merged))
}
console.log(`applied ${PROFILE} profile -> ${OUT}${fails.length ? '  ALIGN-FAILED: ' + fails.join(',') : ''}`)
