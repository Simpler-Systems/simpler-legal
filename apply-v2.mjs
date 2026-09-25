#!/usr/bin/env node
// ENGINE V2 — the model-native legal stack (ENGINE_V2_SWEEPS.md, owner ruling 2026-07-23).
// = the FS5d deterministic stack + the two NEW E2B sweeps:
//   L-C  person-anchor judgment: unique date/amount candidates judged PERSONAL vs business
//        (keyword regex stays as the high-precision fast path and the fail-closed fallback)
//   L-B  legal residue: the E2B reads the FINISHED output and nominates surviving identity
//        (names, aliases, person-tied numbers); verify-or-refuse; can only ADD masks.
// Without --model this degrades EXACTLY to the FS5d deterministic behavior.
//   node apply-v2.mjs --orig raw/oos --sub raw/stripped/ussg50-v1plain --out raw/stripped/ussg50-V2 --profile product --model [--port 49400] [--files a.txt,b.txt]
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('.', import.meta.url))
process.chdir(ROOT)
const R = await import('./lib-legal/legal-rails.mjs')
const { alignTags, mergeRegions, render } = await import('./lib-legal/regions.mjs')
const { foldFullwidth } = await import('./lib-core/anonymize.mjs')
const S = await import('./lib-legal/sweeps.mjs')
const argv = process.argv.slice(2)
const val = (n) => argv[argv.indexOf(n) + 1]
const ORIG = val('--orig'), SUB = val('--sub'), OUT = val('--out')
const PROFILE = argv.includes('--profile') ? val('--profile') : 'product'
// FIRM PROFILE (2026-09-15, owner-ordered firm-genre round; receipt: OPS_LEDGER 2026-09-14).
// A law firm's own paper inverts two product rulings: the party ORGANISATION is the matter's
// identity (so companies do NOT keep), and precedent citations are the reason the file is
// going to a model at all (so they DO keep). Firm inherits every other product mechanic
// through BASE, which is why `product` and `courts` come out byte-identical: with
// PROFILE='product', BASE === PROFILE and FIRM === false, so not one branch below changes.
const FIRM = PROFILE === 'firm'
const BASE = FIRM ? 'product' : PROFILE
const KEEPCITE = FIRM || argv.includes('--arms') && (val('--arms') || '').split(',').includes('citekeep')
const MODEL = argv.includes('--model')
const PORT = argv.includes('--port') ? val('--port') : (process.env.SIMPLER_LLAMA_PORT ?? '49400')
const ONLY = argv.includes('--files') ? new Set(val('--files').split(',')) : null
// overnight arms (TASKS_OVERNIGHT.md): cite = L-B cite-shield + L-C neutral-cite-year guard;
// prop = anchored propagation restricted to full dates/amounts (month-year repeats destroyed
// 158 courts DATETIME keeps); rails = FS6 L10 pack. Off = banked v2 behavior, byte-for-byte.
const ARMS = new Set((argv.includes('--arms') ? val('--arms') : '').split(',').filter(Boolean))
mkdirSync(OUT, { recursive: true })
const complete = MODEL ? S.makeComplete(PORT) : null
if (MODEL) {
  const h = await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json()).catch(() => null)
  if (!h || h.status !== 'ok') { console.error(`no healthy model on :${PORT} — refusing --model run`); process.exit(1) }
}

const IDENTITY_ANCHOR_RE = /\b(?:born|births?|date of birth|d\.?\s?o\.?\s?b\.?|died|date of death|passport|identity card|nric|social security|salary|salaries|wages?|remuneration)\b/i
const QSHAPE_RE = /^(?:\d|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b)|\b(?:days?|months?|years?|weeks?|hearings?|anniversar)/i
const TITLE_VOCAB_RE = /^(?:the\s+)?(?:board|chief\s+\w+\s+officer|ceo|cfo|coo|director|president|chairman|secretary|treasurer|manager|officer)s?$/i
const maskVocabAll = JSON.parse(readFileSync('pii-bench/vocab-quasi.json', 'utf8')).terms
const maskVocab = BASE === 'product' ? maskVocabAll.filter((t) => !QSHAPE_RE.test(t) && !TITLE_VOCAB_RE.test(t)) : maskVocabAll
const keepVocab = new Set(JSON.parse(readFileSync('pii-bench/vocab-keep.json', 'utf8')).terms)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const reOf = (k) => new RegExp(`\\b${esc(k).replace(/\s+/g, '\\s+')}\\b`, 'gi')
const maskRes = maskVocab.map(reOf)
const OFFICIAL_TITLE_RE = /(?:Judges?|Justice|Mr\s+Justice|Mrs\s+Justice|Registrar|Deputy\s+Registrar|Advocate\s+General|Judge\s+Rapporteur)[\s,]{0,3}$/
const STATUTE_BEFORE_RE = /(?:Act|Law|Code|Order|Rules|Regulations|Protocol|Convention|Treaty|Charter|Constitution|Decree|no\.|No\.)\s*(?:of\s+)?$/
const MONTH_BEFORE_RE = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*$|\d{1,2}[./-]\s?$/i
const norm = (s) => s.toLowerCase().trim().replace(/\s+/g, ' ')

const runLog = { engine: 'v2-sweeps', profile: PROFILE, model: MODEL, port: PORT, docs: [] }
let fails = []
for (const f of readdirSync(SUB).filter((x) => x.endsWith('.txt') && (!ONLY || ONLY.has(x)))) {
  const t0 = Date.now()
  const rawOrig = readFileSync(`${ORIG}/${f}`, 'utf8')
  const orig = foldFullwidth(rawOrig)
  const masked = readFileSync(`${SUB}/${f}`, 'utf8')
  const tbl = JSON.parse(readFileSync(`${SUB}-tables/${f}.json`, 'utf8'))
  const aliases = R.institutionalGlossAliases(orig)
  const prot = R.protectedRanges(orig, aliases)
  // FIRM setup. The caption is read first because everything else keys off it: the party names
  // decide which citations may be released (a cited case sharing an identity token with THIS
  // matter is not precedent, it is the matter) and which acronyms are party shorthand.
  const caption = FIRM ? R.usCaptionPartyRegions(orig) : { regions: [], names: [] }
  // matterIdentityTokens, not identityTokensOf: the substrate tags cited case names as COMPANY
  // rows, so passing the raw table in makes every citation veto its own release (measured
  // 2026-09-15: 6 of 52 released on doc 01). A name seen only inside citations is precedent.
  const identityTokens = FIRM
    ? R.matterIdentityTokens(orig, [...caption.names, ...tbl.filter((x) => x.cls === 'COMPANY' || x.cls === 'BRAND' || x.cls === 'PERSON').map((x) => x.span)])
    : new Set()
  // CITEKEEP: the deterministic precedent rail. v1 eats citations as COMPANY/PERSON/ID rows and
  // nothing downstream releases them — CITE_SHIELD only blocks ADDITIONS. Measured 2026-09-14:
  // a brief went in with 45 reporter citations and came out with 8. These spans are released
  // after every sweep (releaseAll below) and protected from every sweep (prot) at the same time.
  const citeKeep = KEEPCITE ? R.citationKeepSpans(orig, identityTokens) : []
  for (const s of citeKeep) prot.push(s)
  const CITE_SHIELD = /[\[(]\d{4}[\])]\s*\d*\s*[A-Z][A-Za-z .]{0,14}\d+|\b[A-Z][\w&.'’ -]{2,40}\s+v\.?\s+[A-Z][\w&.'’ -]{2,40}\b|\bSuit No\s?\d+ of \d{4}/g
  { const ptoks = new Set(tbl.filter(x=>x.cls==='PERSON').flatMap(x=>x.span.split(/\s+/).map(w=>w.toLowerCase()).filter(w=>w.length>=3))); for (const m of orig.matchAll(CITE_SHIELD)) { const words = m[0].toLowerCase().split(/[^a-zà-ÿ'’-]+/); if (!words.some(w=>ptoks.has(w))) prot.push([m.index, m.index + m[0].length]) } }
  const aligned = alignTags(orig, masked)
  if (!aligned.ok) { fails.push(f + ':' + aligned.why); continue }
  const rowByTag = new Map(tbl.map((r) => [r.tag, r]))
  const eligible = (tag) => {
    const row = rowByTag.get(tag)
    if (!row) return false
    const folded = row.span.replace(/[’']s?$/, '')
    if (row.cls === 'COMPANY' || (BASE === 'product' && row.cls === 'BRAND')) {
      if (row.cls === 'BRAND' && BASE !== 'product') return false
      // FIRM: the party organisation IS the matter. On a firm's own paper the company name is
      // the single identifier a reader needs to know whose file this is, so no COMPANY or BRAND
      // row is ever released — not even one that never appears as a defined term. Measured
      // 2026-09-14: 8 of 9 filings leaked at least one party organisation at first mention.
      if (FIRM) return false
      const defRe = new RegExp('[(“"‘\x27]\\s*(?:the\\s+)?' + esc(row.span.replace(/^the\s+/i,'')) + '\\s*[”"’\x27)]', 'i')
      if (defRe.test(orig)) return false
      const prows = tbl.filter((x) => x.cls === 'PERSON')
      const src = BASE === 'product' ? prows.filter((x) => x.span.split(/\s+/).length <= 4 && !/\b(?:of|and)\b/i.test(x.span)) : prows
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
  for (const r of aligned.regions) { // surname continuation (us-19)
    if (!(r.tags || [r.tag]).some((t) => (t || '').startsWith('[Person'))) continue
    const tail = /^\s?([A-ZÀ-Þ][\w'’-]{2,})\s+v\.?\s/.exec(orig.slice(r.end, r.end + 40))
    if (tail) for (const m of orig.matchAll(R.nameTokenRe(tail[1]))) regions.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
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
  // ── flip families: candidates for the doctrine decision ──────────────────────────────────
  const FLIP = BASE === 'product' ? new Set([R.L1_RULES_NO_CODE, R.L1C_RULES, R.L3_RULES, R.L6_RULES, R.L11_RULES]) : new Set()
  // P0e: occupations are keeps under product doctrine — L8 (occupation-of rails) off
  // FS7c: L11 flip-class formats (abbrev dates, paren durations, share counts) join
  const RULE_SETS = [R.L1_RULES_NO_CODE, R.L1C_RULES, R.L3_RULES, R.L4_RULES, R.L6_RULES, R.L8_RULES, R.L9_RULES, R.L11_RULES].filter((rs) => !(BASE === 'product' && rs === R.L8_RULES))
  // FS8c (arm bizdate) — declared BEFORE collect (TDZ): boilerplate-context dates are
  // business by construction — never candidates, no L-C call spent
  const BIZ_CTX_RE2 = /\b(?:effective (?:as of|date)|dated (?:as of )?this|agreement dated|term of this|shall (?:commence|expire|terminate)|fiscal (?:year|quarter)|maturity|renewal|no later than|on or before|notice period|payable (?:on|in|within)|due (?:date|on)|vesting|anniversary of the)\b/i
  const bizCtx2 = (i, len) => BIZ_CTX_RE2.test(orig.slice(Math.max(0, i - 70), i + len + 70))
  const flipCands = new Map() // text -> {text, indexes}
  const collect = (m) => {
    if (ARMS.has('bizdate') && bizCtx2(m.index, m[0].length)) return // FS8c: business by construction
    const e = flipCands.get(m[0]) || { text: m[0], indexes: [] }
    e.indexes.push(m.index)
    flipCands.set(m[0], e)
  }
  for (const rules of RULE_SETS) {
    for (const { re } of rules) {
      if (!FLIP.has(rules)) { add(re); continue }
      for (const m of orig.matchAll(re)) { if (!inProt(m.index, m.index + m[0].length)) collect(m) }
    }
  }
  const inNeutralCite = (i, len) => /[\[(]/.test(orig[i - 1] || '') && /[\])]/.test(orig[i + len] || '')
  for (const m of orig.matchAll(/\b(?:19|20)\d{2}\b/g)) {
    if (STATUTE_BEFORE_RE.test(orig.slice(Math.max(0, m.index - 18), m.index))) continue
    // arm cite: bracketed years are citation machinery ([2018] 4 SLR 331), never candidates
    if (ARMS.has('cite') && inNeutralCite(m.index, 4)) continue
    if (BASE === 'product') collect(m)
    else regions.push({ start: m.index, end: m.index + m[0].length, tag: '[X]' })
  }
  if (ARMS.has('rails')) for (const { re } of R.L10_RULES) add(re)
  // decide candidates: regex fast-path + (model mode) L-C judgment
  const regexAnchor = (c) => c.indexes.some((i) => IDENTITY_ANCHOR_RE.test(orig.slice(Math.max(0, i - 70), i + c.text.length + 70)))
  let lcStats = null
  let verdicts
  if (BASE === 'product') {
    if (MODEL) {
      const lc = await S.sweepLCAnchor(orig, [...flipCands.values()], complete, regexAnchor, { unanimous: ARMS.has('lcstrict') })
      verdicts = lc.verdicts
      lcStats = lc.stats
    } else {
      verdicts = new Map([...flipCands.values()].map((c) => [c.text, regexAnchor(c)]))
    }
    const FULL_DATE_RE = /^\d{1,2}\s+[A-Z][a-z]+\s+\d{4}$|^[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}$|^\d{1,2}[./]\d{1,2}[./](?:19|20)\d{2}$/
    for (const c of flipCands.values()) {
      if (!verdicts.get(c.text)) continue
      const isYear = /^(?:19|20)\d\d$/.test(c.text)
      if (c.text.length < 6 && !isYear) continue
      if (!isYear && !/\d{4}|[$€£]|\b(?:million|billion|thousand)\b/i.test(c.text) && c.text.length < 6) continue
      // arm prop: only FULL dates and currency amounts propagate to every occurrence;
      // month-year and bare-year forms mask at their YES site only (measured: "February
      // 2022" propagation destroyed 158 courts DATETIME keeps)
      const propagates = !ARMS.has('prop') || FULL_DATE_RE.test(c.text) || /[$€£]|\b(?:million|billion|thousand)\b/i.test(c.text)
      let sites = c.indexes
      if (!propagates) {
        // mask the anchored occurrences only; if the YES came from the model (no regex
        // anchor anywhere), mask the windows it actually judged (first two sites)
        const anchoredSites = c.indexes.filter((i) => IDENTITY_ANCHOR_RE.test(orig.slice(Math.max(0, i - 70), i + c.text.length + 70)))
        sites = anchoredSites.length ? anchoredSites : c.indexes.slice(0, 2)
      }
      for (const i of sites) {
        if (isYear && MONTH_BEFORE_RE.test(orig.slice(Math.max(0, i - 20), i))) continue
        if (ARMS.has('cite') && isYear && inNeutralCite(i, 4)) continue
        regions.push({ start: i, end: i + c.text.length, tag: '[X]' })
      }
    }
  }
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
  for (const r of R.titleCaptionRegions(orig)) regions.push(r)
  for (const r of R.aliasInitialRegions(orig, tbl)) regions.push(r)
  for (const r of R.quotedVariantRegions(orig)) regions.push(r)
  for (const r of R.quotedNicknameRegions(orig)) regions.push(r) // FS8a
  for (const r of R.accountFragmentRegions(orig)) regions.push(r) // FS9a
  for (const r of R.kinshipNameRegions(orig)) regions.push(r)
  for (const r of R.definedAliasRegions(orig)) regions.push(r)
  for (const r of R.ownCaseCiteRegions(orig)) regions.push(r)
  for (const r of R.firmNameListRegions(orig)) regions.push(r) // FS7b
  for (const r of R.kinshipPhraseRegions(orig)) regions.push(r)
  for (const r of R.dialectReligionRegions(orig)) regions.push(r)
  if (BASE !== 'product') for (const r of R.occupationContextRegions(orig)) regions.push(r) // P0e
  if (FIRM) {
    for (const r of caption.regions) regions.push(r)                                   // the caption parties, every occurrence
    for (const r of R.partyAcronymRegions(orig, caption.names)) regions.push(r)         // IBKR for Interactive Brokers
    for (const r of R.entityOccurrenceRegions(orig, tbl)) regions.push(r)               // case-insensitive propagation of every substrate row
  }
  if (BASE === 'product') {
    // own-case reporter-cite folding v2 — ported from apply-p0; dropped in the v2 clone and
    // measured immediately as the us-19 cite leak. A cite trailing a masked person (optionally
    // through "v. <opponent>,") folds into the mask.
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
  const personish = (r) => (r.tags || [r.tag]).some((t) => /^\[(?:Person|Code)/.test(t || ''))
  // One render law, applied at all three render points (initial, post-L-B, post-FS7a). The
  // citation release runs LAST, after merge, so a sweep that fires later in the file cannot
  // re-bury a citation that an earlier pass released. Split-at-boundary: a region straddling a
  // keep span loses only its intersection, so "Smith, 410 U.S. 113" releases the cite and keeps
  // the party. With KEEPCITE off, citeKeep is empty and this is mergeRegions+render unchanged.
  let citesReleased = 0
  const renderNow = () => {
    let m = mergeRegions(regions).filter((r) => personish(r) || !keepVocab.has(norm(orig.slice(r.start, r.end))))
    if (citeKeep.length) { const rel = R.releaseInsideSpans(m, citeKeep); m = rel.regions; citesReleased = rel.released }
    return [m, render(orig, m)]
  }
  let [merged, out] = renderNow()
  // ── L-B: legal residue sweep over the FINISHED output (model mode; add-only) ─────────────
  let lbStats = null
  if (MODEL) {
    const lb = await S.sweepLBResidue(out, complete)
    lbStats = lb.stats
    if (lb.spans.length) {
      for (const span of lb.spans) {
        const toks = span.split(/\s+/)
        const re = toks.length === 1 ? R.nameTokenRe(span) : new RegExp(`\\b${esc(span).replace(/\s+/g, '\\s+')}\\b`, 'g')
        // arm cite: residue occurrences inside shielded citations stay (Hammond Suddard
        // Solicitors v Agrichem is precedent, not identity); occurrences outside still mask
        for (const m of orig.matchAll(re)) {
          if (ARMS.has('cite') && inProt(m.index, m.index + m[0].length)) continue
          regions.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
        }
      }
      ;[merged, out] = renderNow()
    }
  }
  // ── FS7a: anonymized-doc name confirmation (round-4 given-name class; add-only) ───────────────────
  let faStats = null
  if (MODEL && ARMS.has('fs7') && R.isAnonCourtDoc(orig)) {
    const freq = new Map()
    for (const m of orig.matchAll(/\b[A-Z][a-z]{2,}\b/g)) {
      const w = m[0]
      if (R.ANON_NAME_STOP.has(w)) continue
      const e = freq.get(w) || { text: w, index: m.index, n: 0 }
      e.n++
      freq.set(w, e)
    }
    // freq >= 1 (the round-4 name appears once), and candidates PRIORITIZED before the cap —
    // document-order capping cut her (measured): possessive occurrences (X's = strong name
    // signal) first, then frequency
    const cands = [...freq.values()]
      .filter((c) => c.n >= 1 && out.includes(c.text))
      .map((c) => ({ ...c, prio: (new RegExp(`\\b${c.text}[’']s\\b`).test(orig) ? 2 : 0) + (c.n >= 2 ? 1 : 0) }))
      .sort((a, b) => b.prio - a.prio)
      .slice(0, 60)
    const fa = await S.sweepAnonNames(orig, cands, complete)
    faStats = { ...fa.stats, cands: cands.length }
    if (fa.names.length) {
      for (const name of fa.names) {
        for (const m of orig.matchAll(R.nameTokenRe(name))) regions.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
      }
      ;[merged, out] = renderNow()
    }
  }
  writeFileSync(`${OUT}/${f}`, out)
  const secs = Math.round((Date.now() - t0) / 1000)
  runLog.docs.push({ file: f, secs, lc: lcStats, lb: lbStats, fa: faStats, lbSpans: lbStats ? lbStats.verified : 0, ...(FIRM || citeKeep.length ? { firm: { parties: caption.names, citeSpans: citeKeep.length, citesReleased } } : {}) })
  console.log(`${f}  ${secs}s${lcStats ? `  L-C ${lcStats.calls} calls/${lcStats.yes} yes` : ''}${lbStats ? `  L-B ${lbStats.calls} calls/${lbStats.verified} verified` : ''}${citeKeep.length ? `  cite-keep ${citeKeep.length} spans/${citesReleased} released` : ''}${FIRM && caption.names.length ? `  parties ${caption.names.length}` : ''}`)
  // fail-LOUD, not fail-quiet (OPS_LEDGER 2026-07-23): if sweep calls failed, re-check the
  // server; a dead server aborts the run instead of silently writing degraded outputs.
  if (MODEL && ((lcStats?.failed || 0) > 0 || (lbStats?.failed || 0) > 0)) {
    const h = await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json()).catch(() => null)
    if (!h || h.status !== 'ok') {
      writeFileSync(`${OUT}/_v2run.json`, JSON.stringify(runLog, null, 1))
      console.error(`SERVER DIED mid-run after ${runLog.docs.length} docs — aborting (degraded output ${f} was written; rerun it)`)
      process.exit(3)
    }
  }
}
writeFileSync(`${OUT}/_v2run.json`, JSON.stringify(runLog, null, 1))
console.log(`applied v2${MODEL ? '+model' : ' (deterministic)'} ${PROFILE} -> ${OUT}${fails.length ? '  ALIGN-FAILED: ' + fails.join(',') : ''}`)
