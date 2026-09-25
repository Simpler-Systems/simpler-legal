#!/usr/bin/env node
// LN RACE (TASKS_OVERNIGHT #3) — restore-side sweeps as a POST-PROCESSOR over a finished
// run dir (no full-stack rerun): align output -> nominate -> E2B judge -> release -> render.
//   LN1 masked ORG-ish regions:  "court/government/public institution acting officially?"
//   LN2 masked PERSON regions with judicial/counsel context (REGEX-NOMINATED only):
//        "named only as judge/registrar/counsel?" — model confirms, never creates.
// Releases of an approved official ALSO release their propagated surname-token regions
// (arm-1 lesson: without this the refund is pennies), guarded: a token shared with any
// non-approved person region is NOT released.
// Gate safety: LN1 never touches Person/Code-tagged regions; defined-term ban upstream
// stands (defRe-matched spans are never candidates); fail-closed — failed call = stays masked.
//   node apply-ln.mjs --orig raw/oos --in raw/stripped/ussg50-A3 --out raw/stripped/ussg50-LN --model [--ln 1,2] [--files ...]
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('.', import.meta.url))
process.chdir(ROOT)
const R = await import('./lib-legal/legal-rails.mjs')
const { alignTags, render } = await import('./lib-legal/regions.mjs')
const { foldFullwidth } = await import('./lib-core/anonymize.mjs')
const S2 = await import('./lib-legal/sweeps2.mjs')
const S = await import('./lib-legal/sweeps.mjs')
const argv = process.argv.slice(2)
const val = (n) => argv[argv.indexOf(n) + 1]
const ORIG = val('--orig'), IN = val('--in'), OUT = val('--out')
const LN = new Set((argv.includes('--ln') ? val('--ln') : '1,2').split(','))
// DE-GLUE (sequencing memo step 2; overnight's clearest structural finding): glued tag runs
// ("Judge PREGERSON\nNOONAN, Circuit Judge:\nRobert K. Dils" as ONE region) cap the restore
// machinery — a correct YES on a multi-entity region releases its passengers. The walker
// cannot know intra-run boundaries; the v1 TABLE can: each tag's row.span is searched inside
// the region's original text, entity sub-regions split out, residual glue stays masked [X].
// Tags without table rows (rail tags) stay unsplit — unsplit is the safe direction.
const TABLES = argv.includes('--tables') ? val('--tables') : null
const DEGLUE = argv.includes('--deglue')
const ONLY = argv.includes('--files') ? new Set(val('--files').split(',')) : null
const PORT = argv.includes('--port') ? val('--port') : (process.env.SIMPLER_LLAMA_PORT ?? '49400')
mkdirSync(OUT, { recursive: true })
const complete = S.makeComplete(PORT)
const h = await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json()).catch(() => null)
if (!h || h.status !== 'ok') { console.error('no healthy model — refusing'); process.exit(1) }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const BEFORE_TITLE_RE = R.OFFICIAL_TITLE_WIDE_RE
const AFTER_TITLE_RE = /^\s?,?\s{0,2}(?:JCA|JA|JC|J|CJ|SC)\b|^\s?\((?:instructed|for the (?:claimant|defendant|appellant|respondent|plaintiff|applicant|prosecution))/
const COUNSEL_BEFORE_RE = /\b(?:Mr|Ms|Mrs|Mdm|Dr)\s?$/

const runLog = { engine: 'ln-post', ln: [...LN].join(','), docs: [] }
for (const f of readdirSync(IN).filter((x) => x.endsWith('.txt') && (!ONLY || ONLY.has(x)))) {
  const t0 = Date.now()
  const orig = foldFullwidth(readFileSync(`${ORIG}/${f}`, 'utf8'))
  const masked = readFileSync(`${IN}/${f}`, 'utf8')
  const aligned = alignTags(orig, masked)
  if (!aligned.ok) { console.error(`${f} align-failed: ${aligned.why}`); continue }
  let regions = aligned.regions
  let deglued = 0
  if (DEGLUE && TABLES) {
    let tblRows = []
    try { tblRows = JSON.parse(readFileSync(`${TABLES}/${f}.json`, 'utf8')) } catch {}
    const rowByTag = new Map(tblRows.map((r) => [r.tag, r]))
    const out2 = []
    for (const r of regions) {
      const tags = r.tags || [r.tag]
      if (tags.length < 2) { out2.push(r); continue }
      const slice = orig.slice(r.start, r.end)
      const cuts = []
      let searchFrom = 0
      let allFound = true
      for (const tag of tags) {
        const row = rowByTag.get(tag)
        if (!row) { allFound = false; continue }
        const re = new RegExp(esc(row.span).replace(/\s+/g, '\\s+'))
        const m = re.exec(slice.slice(searchFrom))
        if (!m) { allFound = false; continue }
        const s = searchFrom + m.index
        cuts.push({ start: r.start + s, end: r.start + s + m[0].length, tag })
        searchFrom = s + m[0].length
      }
      if (!cuts.length) { out2.push(r); continue }
      // entity sub-regions + residual glue segments (residual stays masked as [X])
      deglued++
      let pos = r.start
      for (const c of cuts) {
        if (c.start > pos) out2.push({ start: pos, end: c.start, tag: '[X]' })
        out2.push({ start: c.start, end: c.end, tag: c.tag })
        pos = c.end
      }
      if (pos < r.end) out2.push({ start: pos, end: r.end, tag: allFound ? '[X]' : (tags.find((t) => !rowByTag.get(t)) || '[X]') })
    }
    regions = out2
  }
  const text = (r) => orig.slice(r.start, r.end)
  const tagsOf = (r) => r.tags || [r.tag]
  const isPerson = (r) => tagsOf(r).some((t) => /^\[Person/.test(t || ''))
  const isCode = (r) => tagsOf(r).some((t) => /^\[(?:Code|Id)/.test(t || ''))
  // ---- LN2: judicial/counsel persons (regex-nominated, model-confirmed) ----
  const released = new Set()
  // ---- LN0 (round-7, SGHCF instrument find): cited-code KEEP rail — deterministic, no
  // model call. In court-anonymized docs the v1 substrate re-masks cited anonymized-case
  // codes ("TYS v TYT [2017] …": r5 finals kept 9/27, r6 5/9); those codes ARE the court's
  // anonymization (P0f doctrine) and leak nothing by construction. Release any region fully
  // inside the strict shape ALL-CAPS{1,4} v ALL-CAPS{1,4} followed by a bracket cite. The
  // bracket-cite lookahead is the fail-closed guard: an uppercased REAL-name caption run
  // ("TAN AH KOW v LIM AH LEE") never matches because the cite doesn't directly follow.
  let ln0Released = 0
  if (LN.has('0') && R.isAnonCourtDoc(orig)) {
    const keepSpans = []
    for (const m of orig.matchAll(/\b[A-Z]{1,4}\s+v\s+[A-Z]{1,4}(?=\s*\[)/g)) keepSpans.push([m.index, m.index + m[0].length])
    // Split-at-boundary (release granularity must match entity granularity — the de-glue
    // law): a glued region crossing the keep span ("JBB v JBA [2015]… (" JBB")" glued by
    // alias propagation) releases ONLY its intersection with the span; residue outside
    // stays masked under the region's own tag.
    const out3 = []
    for (const r of regions) {
      let segs = [[r.start, r.end]]
      let hit = false
      for (const [a, b] of keepSpans) {
        const next = []
        for (const [s, e] of segs) {
          if (e <= a || s >= b) { next.push([s, e]); continue }
          hit = true
          if (s < a) next.push([s, a])
          if (e > b) next.push([b, e])
        }
        segs = next
      }
      if (hit) ln0Released++
      for (const [s, e] of segs) out3.push({ ...r, start: s, end: e })
    }
    regions = out3
  }
  // FS8b (round-6, "Yong CJ" leak): a released official sharing a name token with a MASKED
  // party or alias stays masked — fail-closed on surname collisions (the party was "Yong
  // Hock Guan Dennis (Yong)"; the cited judge "Yong CJ" was correctly identified and
  // released, and the shared surname surfaced). Party tokens: caption parties + defined
  // aliases + quoted nicknames.
  const partyCollisionToks = new Set()
  {
    const TITLE_WORDS = /^(?:jca|ja|jc|j|cj|sc|mr|mrs|ms|mdm|justice|judge)$/
    for (const fn of ['titleCaptionRegions', 'definedAliasRegions', 'quotedNicknameRegions', 'captionPartyRegions']) {
      if (typeof R[fn] !== 'function') continue
      for (const r of R[fn](orig)) {
        for (const w of orig.slice(r.start, r.end).toLowerCase().split(/[^a-zà-ÿ'’-]+/)) {
          if (w.length >= 3 && !TITLE_WORDS.test(w)) partyCollisionToks.add(w)
        }
      }
    }
    // FS8b-2 (round-7 "Tan Siong Thye" gate break): numbered multi-party captions
    // ("Between … And (1) FB Industries (2) Lee Buck Huang (3) Tan Boo Kong … Defendants")
    // defeat the caption rails, leaving the veto with zero tokens. Parse the
    // Between…Defendants block directly; over-collection is fail-closed (extra vetoes only
    // keep masks on).
    const capBlock = /\bBetween\b([\s\S]{0,800}?)\b(?:Defendants?|Respondents?)\b/.exec(orig.slice(0, 3000))
    if (capBlock) {
      for (const w of capBlock[1].toLowerCase().split(/[^a-zà-ÿ'’-]+/)) {
        if (w.length >= 3 && !TITLE_WORDS.test(w)) partyCollisionToks.add(w)
      }
    }
  }
  let ln2Stats = null
  if (LN.has('2')) {
    const cands = []
    const seen = new Set()
    for (const [k, r] of regions.entries()) {
      if (!isPerson(r) || isCode(r)) continue
      const t = text(r).trim()
      if (t.length < 3) continue
      const before = orig.slice(Math.max(0, r.start - 40), r.start)
      const after = orig.slice(r.end, r.end + 60)
      // v1 masks titles INSIDE the person span ("Belinda Ang Saw Ean JCA", "Mr Justice X") —
      // nominate on the region text itself as well as surrounding context (LN2-fix: the
      // context-only version nominated 0 of 814 person regions)
      const IN_SUFFIX_RE = /\b(?:JCA|JA|JC|CJ|J|SC)\s*[),.\]”]?\s*$/
      const IN_PREFIX_RE = /^(?:Mr|Mrs|Ms|Mdm)?\s?(?:Justice|Judge|Judicial Commissioner|Registrar|District Judge|Magistrate)\b/i
      // LN2c: judicial markers ONLY — the counsel corridor nominated party-side people
      // ("Bob McLemore", respondent solicitors) and the model's official-vs-party precision
      // cannot carry that ambiguity (gate broke twice). Counsel restore needs its own
      // deterministic evidence, not a model guess.
      const nominated =
        IN_SUFFIX_RE.test(t) || IN_PREFIX_RE.test(t) ||
        BEFORE_TITLE_RE.test(before) || AFTER_TITLE_RE.test(after)
      if (!nominated) continue
      // LN2d release-shape guard: glue runs holding a judicial marker PLUS party/case
      // content ("Judge PREGERSON\nNOONAN...: Robert K. Dils", "Suit No 545 ... Hoo Sheau
      // Peng J") must never release whole — only clean name shapes are candidates.
      if (/[\n\r\d—–:;]/.test(t) || t.split(/\s+/).length > 6) continue
      // FS8b: party-collision veto — fail-closed when the official shares a token with a
      // masked party/alias
      if (t.toLowerCase().split(/\s+/).some((w) => w.length >= 3 && partyCollisionToks.has(w))) continue
      const key = t.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      cands.push({ key, indexes: [r.start], len: r.end - r.start, regionIdx: k })
    }
    const j = await S2.sweepLN2Official(orig, cands, complete)
    ln2Stats = { ...j.stats, cands: cands.length }
    const approvedTokens = new Set()
    const partyTokens = new Set()
    for (const c of cands) {
      if (j.verdicts.get(c.key)) {
        for (const k2 of regions.keys()) {
          if (text(regions[k2]).trim().toLowerCase() === c.key && isPerson(regions[k2])) released.add(k2)
        }
        for (const w of c.key.replace(/\b(?:jca|ja|jc|cj|j|sc|mr|mrs|ms|mdm|justice|judge)\b/g, ' ').split(/\s+/)) if (w.length >= 3) approvedTokens.add(w)
      }
    }
    for (const [k, r] of regions.entries()) {
      if (released.has(k) || !isPerson(r)) continue
      for (const w of text(r).toLowerCase().split(/\s+/)) if (w.length >= 3) partyTokens.add(w)
    }
    // release propagated single-token regions of approved officials (token not shared w/ party)
    for (const [k, r] of regions.entries()) {
      if (released.has(k) || !isPerson(r)) continue
      const t = text(r).toLowerCase().replace(/[’']s$/, '')
      if (!/\s/.test(t) && approvedTokens.has(t) && !partyTokens.has(t)) released.add(k)
    }
  }
  // ---- LN3: counsel-line rail (deterministic nomination + model confirm) ----
  let ln3Stats = null
  if (LN.has('3')) {
    const COUNSEL_LINE_RES = [
      // SG: "Kanagavijayan Nadarajan (Kana & Co) for the claimant"
      /(?:^|\n|;\s*)(?:M[rs]s?\.?\s+|Mdm\s+|Dr\s+)?([A-Z][\w'.-]+(?:\s+[A-Z][\w'.@-]+|\s+(?:s\/o|d\/o|bin|binte)\s+[A-Z][\w'.-]+){0,4})(?:\s+SC)?\s*\([^()\n]{2,60}\)\s+for\s+the\s+(?:claimants?|defendants?|plaintiffs?|respondents?|appellants?|applicants?|prosecution)/gi,
      // US: "John A. Smith, Chicago, IL, for Plaintiff-Appellant"
      /(?:^|\n)([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){1,3})\s*(?:,\s*[A-Z][\w .,-]{2,40})?,\s+for\s+(?:the\s+)?[\w-]*(?:plaintiffs?|defendants?|appell(?:ants?|ees?)|petitioners?|respondents?)/gi,
    ]
    // party veto: counsel candidates sharing a name token with a caption party are refused
    const partyToks = new Set()
    const title = /^Title:\s*(.{3,140})$/m.exec(orig.slice(0, 400))
    if (title) for (const w of title[1].split(/\s+/)) if (/^[A-Z]/.test(w) && w.length >= 3) partyToks.add(w.toLowerCase().replace(/[.,]$/, ''))
    const names = new Set()
    for (const re of COUNSEL_LINE_RES) {
      for (const m of orig.matchAll(re)) {
        const n = m[1].trim()
        if (n.split(/\s+/).some((w) => partyToks.has(w.toLowerCase().replace(/[.,]$/, '')))) continue
        if (n.toLowerCase().split(/\s+/).some((w) => w.length >= 3 && partyCollisionToks.has(w))) continue // FS8b
        names.add(n)
      }
    }
    const cands = []
    for (const n of names) {
      const i = orig.indexOf(n)
      if (i >= 0) cands.push({ key: n.toLowerCase(), indexes: [i], len: n.length })
    }
    const j = await S2.sweepLN3Counsel(orig, cands, complete)
    ln3Stats = { ...j.stats, cands: cands.length }
    for (const c of cands) {
      if (!j.verdicts.get(c.key)) continue
      const nameToks = c.key.split(/\s+/).filter((w) => w.length >= 3)
      for (const [k2, r2] of regions.entries()) {
        if (released.has(k2) || !isPerson(r2)) continue
        const t2 = text(r2).trim().toLowerCase()
        if (/[\n\r\d—–:;]/.test(t2) || t2.split(/\s+/).length > 6) continue // clean-name shape law
        const t2toks = t2.split(/\s+/)
        if (t2 === c.key || (t2toks.length >= 1 && t2toks.every((w) => nameToks.includes(w)))) released.add(k2)
      }
    }
  }
  // ---- LN1: institutional orgs (never Person/Code) ----
  let ln1Stats = null
  if (LN.has('1')) {
    // person-token veto (FS3 law; its absence broke the gate on first race: released
    // "United States v. Wilson" glue-runs and "Violet Oon Inc Pte Ltd"). Plural-folded:
    // "the Coffeys" must match person token "Coffey".
    const normTok = (w) => w.toLowerCase().replace(/[’']s$/, '').replace(/(?<=[a-z]{3})e?s$/, '')
    const personToks = new Set()
    for (const r of regions) {
      if (!isPerson(r)) continue
      for (const w of text(r).split(/\s+/)) if (w.length >= 3 && /^[A-ZÀ-Þ]/.test(w)) personToks.add(normTok(w))
    }
    const cands = []
    const seen = new Set()
    for (const [k, r] of regions.entries()) {
      if (isPerson(r) || isCode(r) || released.has(k)) continue
      const t = text(r)
      if (!/[A-Z][a-z]/.test(t) || /\d/.test(t)) continue
      // FS10a (round-7 "Chettiar" gate break): v1 glue can fuse a counsel PERSON with a
      // firm under one Company tag, defeating the person guards. Parens or M/s in a
      // candidate = glue/firm-listing — refuse. A candidate whose right context is a
      // counsel-line tail ("… for the plaintiff") is party-side by construction — refuse.
      if (/[()]/.test(t) || /\bM\/s\b/i.test(t)) continue
      if (/^\s*(?:\([^)]{0,60}\))?\s*for the (?:plaintiffs?|defendants?|claimants?|appellants?|respondents?|applicants?|prosecution)\b/i.test(orig.slice(r.end, r.end + 80))) continue
      const toks = t.split(/\s+/)
      if (toks.length > 7 || t.length < 4) continue
      if (toks.some((w) => w.length >= 3 && personToks.has(normTok(w)))) continue
      const defRe = new RegExp('[(“"‘\x27]\\s*(?:the\\s+)?' + esc(t.replace(/^the\s+/i, '')) + '\\s*[”"’\x27)]', 'i')
      if (defRe.test(orig)) continue
      const key = t.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      cands.push({ key, indexes: [r.start], len: r.end - r.start })
    }
    const j = await S2.sweepLN1Institutional(orig, cands, complete)
    ln1Stats = { ...j.stats, cands: cands.length }
    for (const [k, r] of regions.entries()) {
      if (isPerson(r) || isCode(r)) continue
      if (j.verdicts.get(text(r).toLowerCase())) released.add(k)
    }
  }
  // LNf: a released official takes adjacent PURE-TITLE glue with them — de-glue parks
  // suffixes in residual [X], so "Vincent Hoong J" stayed destroyed with "Vincent Hoong"
  // released (measured: 389 releases, aggregate flat). Titles are NM by doctrine.
  const TITLE_GLUE_RE = /^[\s,.()\[\]]*(?:JCA|JA|JC|CJ|J|SC|Justice|Judge|Circuit Judge|District Judge|Judicial Commissioner|Registrar)?[\s,.:()\[\]]*$/
  let grew = true
  while (grew) {
    grew = false
    for (const [k, r] of regions.entries()) {
      if (released.has(k) || !TITLE_GLUE_RE.test(text(r))) continue
      const nearReleased = [...released].some((k2) => {
        const o = regions[k2]
        return Math.abs(r.start - o.end) <= 2 || Math.abs(o.start - r.end) <= 2
      })
      if (nearReleased) { released.add(k); grew = true }
    }
  }
  const kept = regions.filter((_, k) => !released.has(k))
  writeFileSync(`${OUT}/${f}`, render(orig, kept))
  runLog.docs.push({ file: f, secs: Math.round((Date.now() - t0) / 1000), regions: regions.length, released: released.size, ln0: ln0Released, ln1: ln1Stats, ln2: ln2Stats, ln3: ln3Stats })
  console.log(`${f}  ${Math.round((Date.now() - t0) / 1000)}s  released ${released.size}/${regions.length}${ln0Released ? `  LN0 ${ln0Released}r` : ''}${ln2Stats ? `  LN2 ${ln2Stats.cands}c/${ln2Stats.yes}y` : ''}${ln3Stats ? `  LN3 ${ln3Stats.cands}c/${ln3Stats.yes}y` : ''}${ln1Stats ? `  LN1 ${ln1Stats.cands}c/${ln1Stats.yes}y` : ''}`)
  if ((ln1Stats?.failed || 0) + (ln2Stats?.failed || 0) + (ln3Stats?.failed || 0) > 0) {
    const hh = await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json()).catch(() => null)
    if (!hh || hh.status !== 'ok') { writeFileSync(`${OUT}/_lnrun.json`, JSON.stringify(runLog, null, 1)); console.error('SERVER DIED — aborting'); process.exit(3) }
  }
}
writeFileSync(`${OUT}/_lnrun.json`, JSON.stringify(runLog, null, 1))
console.log(`LN post-pass -> ${OUT}`)
