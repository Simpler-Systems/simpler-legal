#!/usr/bin/env node
// PHASE 0 — GOLD DOCTRINE PROJECTION. The swarm gold (pii-bench/oos-labels/) was labeled
// under the inherited TAB doctrine: dates/amounts/durations = QUASI. The product doctrine
// (court-validated, REDACTION_AUDIT.md) keeps them unless identity-anchored. This script is
// the doctrine PROJECTION of the same annotations, not a re-labeling: a QUASI entity whose
// span is date/amount/duration/age/year-shaped moves to NO_MASK unless any occurrence in the
// original sits within ±70 chars of an identity anchor (born/birth/DOB/death/passport/NRIC/
// salary-class). DIRECT entities are NEVER touched. Output: pii-bench/oos-labels-product/.
// Both instruments stay live: TAB-doctrine gold scores the tab-scorer profile, product gold
// scores the product profile. Same wall as ever: the engine never reads either.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveGold, resolveGoldOut } from './gold-path.mjs'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
// round-4: same projection, parameterized paths (defaults = the oos instrument, unchanged)
const argv = process.argv.slice(2)
const flag = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
const SRC = resolveGold(flag('--src', 'pii-bench/oos-labels'), ROOT)
const DST = resolveGoldOut(flag('--dst', 'pii-bench/oos-labels-product'), ROOT)
const DOCS = join(ROOT, flag('--docs', 'raw/oos'))
mkdirSync(DST, { recursive: true })

const IDENTITY_ANCHOR_RE = /\b(?:born|births?|date of birth|d\.?\s?o\.?\s?b\.?|died|date of death|passport|identity card|nric|social security|salary|salaries|wages?|remuneration)\b/i
const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)'
const SPELLED = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)'
const SHAPES = [
  new RegExp(`^\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\w*\\s+\\d{4}$`, 'i'),
  new RegExp(`^${MONTH}\\w*\\s+\\d{1,2},?\\s+\\d{4}$`, 'i'),
  new RegExp(`^${MONTH}\\w*\\s+\\d{4}$`, 'i'),
  new RegExp(`^${MONTH}\\w*$`, 'i'),
  /^\d{1,2}[./]\d{1,2}[./](?:19|20)\d{2}$/,
  /^(?:19|20)\d{2}$/,
  /^(?:EUR|USD|GBP|SGD|S\$|US\$|€|\$|£)\s?[\d][\d,. ]*(?:million|billion)?$/i,
  /^[\d][\d,.]*\s?(?:euros?|dollars?|pounds?|francs?|liras?|marks?|cents?)$/i,
  /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/,
  new RegExp(`^(?:approximately\\s+|about\\s+|some\\s+)?(?:\\d+|${SPELLED})(?:[\\s-]${SPELLED})*\\s+(?:calendar\\s+|business\\s+)?(?:days?|months?|years?|weeks?|hours?|hearings?|occasions?|times)$`, 'i'),
  /^aged?\s+\d{1,3}$/i,
  /^\d{1,3}\s+years?\s+(?:old|of\s+age)$/i,
  /^\d+(?:\.\d+)?\s?%$/,
  // P0d (2026-07-23 overnight): projection completion — forms the P0 shape list missed,
  // exposed by the v2 decomposition. Same doctrine, wider shapes.
  /^\d{1,2}\.\s?(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s?\d{4}$/,
  new RegExp(`^\\d{1,2}(?:,\\s?\\d{1,2})*(?:\\s+and\\s+\\d{1,2})?\\s+${MONTH}\\w*\\s+\\d{4}$`, 'i'),
  /^(?:early|mid|late)[- ]\d{4}$/i,
  /^\d{1,2}[.:]\d{2}\s?(?:am|pm)$/i,
  /^(?:S?\$|US\$|EUR|€)?\s?[\d.,]+(?:\.\d+)?\s?(?:%|per\s?cent)?\s+(?:per|an)\s+(?:hour|day|week|month|annum|year)$/i,
  /^EUR\s?[\d.,]+,?-?$/,
  /^(?:(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Fifteen|Twenty|Thirty|Forty|Fifty|Sixty|Seventy|Eighty|Ninety|Hundred|Thousand|Million|Billion|and)\s+)+Dollars?$/i,
  // P0g (round-5): format variants round 4 exposed — same doctrine, wider shapes
  /^(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}$/i,
  new RegExp(`^${MONTH}\\w*[.,]\\s*\\d{4}$`, 'i'),
  /^[a-z]+[- ]?\(?\d+\)?[- ]?(?:calendar\s+|business\s+)?(?:days?|months?|years?|weeks?)(?:\s+period)?$/i,
  /^\d{1,3}-day(?:\s+(?:period|notice|revocation\s+period))?$/i,
  /^[\d,]+\s+shares?$/i,
  /^[a-z][a-z\s-]*\(\d[\d,]*\)\s+shares?$/i,
  /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/,
  // P0h (round-6): ordinal-day dates, paren multipliers, compound spelled durations, bare
  // spelled numbers, mixed fractions — the round-5 QUASI format tail
  new RegExp(`^\\d{1,2}\\s?(?:st|nd|rd|th)?\\s+day of\\s+${MONTH}\\w*,?\\s+\\d{4}$`, 'i'),
  /^[a-z]+\s*\(\d+\)\s*times?$/i,
  /^\(\d{1,4}\)$/,
  /^\d\s+\d\s*\/\s*\d$/,
  new RegExp(`^${SPELLED}(?:[\\s-]${SPELLED})*\\s+(?:days?|months?|years?|weeks?)\\s+and\\s+${SPELLED}(?:[\\s-]${SPELLED})*\\s+(?:days?|months?|years?|weeks?|day)$`, 'i'),
  new RegExp(`^${SPELLED}(?:[\\s-]${SPELLED})?$`, 'i'),
  /^\d{1,3}-(?:day|month|year|week)(?:\s+(?:period|term|notice))?$/i,
]
const isFlipShape = (s) => SHAPES.some((re) => re.test(s.trim()))

// P0b (owner: "what do you recommend?" -> recommended and applied): party companies and bare
// role titles follow the same doctrine. ORG QUASI -> NO_MASK unless person-anchored (shares a
// name token with a PERSON entity in the doc — the engine's FS3 guard, mirrored). Bare-title
// QUASI (non-PERSON category) -> NO_MASK unless the original uses it as a quoted defined term
// (the "Executive" pattern; those are PERSON|DIRECT anyway and DIRECT is never touched).
// Occupations ("disc jockey") deliberately STAY QUASI — audit notes courts keep them, but they
// describe the protected person; future arm, one variable at a time.
const CORP_STOP = new Set(['inc', 'ltd', 'llc', 'llp', 'corp', 'corporation', 'company', 'holdings', 'group', 'the', 'and', 'pte', 'limited', 'gmbh', 'plc', 'co'])
// P0e (owner "run it", 2026-07-23): occupations follow practiced court doctrine — SGHCF
// keeps them wholesale (223 hits/19 of 25 anonymized docs, REDACTION_AUDIT.md) even for
// letter-coded parties. Occupation/role-shaped QUASI -> NO_MASK, both bare ("disc jockey",
// "certified public accountant") and unit-scoped titles ("President of European Operations",
// "Head of Listed Derivatives (Asia)").
const OCC_WORD = '(?:jockey|accountant|teacher|driver|manager|director|engineer|nurse|doctor|surgeon|technician|supervisor|cleaner|hawker|contractor|banker|lecturer|professor|clerk|shareholder|businessman|salesman|homemaker|housewife|liquidator|trustee|auditor|solicitor|advocate|consultant|analyst|broker|dealer|trader|officer|secretary|president|chairman|executive|head|partner)'
const OCC_SHAPES = [
  new RegExp(`^(?:an?\\s+|the\\s+|sole\\s+|senior\\s+|junior\\s+|chief\\s+|certified\\s+|public\\s+)*(?:[a-z][\\w-]*\\s+){0,3}${OCC_WORD}s?$`, 'i'),
  new RegExp(`^(?:President|Head|Chief|Director|Manager|Chairman)\\s+of\\s+[\\w()& ,-]{3,50}$`, 'i'),
]
const isOccupation = (s) => OCC_SHAPES.some((re) => re.test(s.trim()))
const TITLE_RE = /^(?:Director|President|Chairman|Chairwoman|Chairperson|Chief\s+\w+\s+Officer|CEO|CFO|COO|CTO|General Counsel|Secretary|Treasurer|(?:Senior\s+|Executive\s+)?Vice\s+President|VP|Managing Director|Officer|Manager)s?$/i
// P0f (owner "fix the gold", round-4 instrument defect): in a COURT-ANONYMIZED document
// (letter-coded caption), the court's anonymization decisions ARE the doctrine. Its
// artifacts — pseudonym codes ([G], WJZ, C1), pre-masked IDs (XXX-XXX-19-6), bare number
// fragments the court left — are preserve-class, NOT identities: masking them damages the
// court's anonymization chain, and the round-4 labelers (correctly instructed for RAW docs)
// marked them DIRECT. Name-shaped spans STAY DIRECT — a real name in an anonymized judgment
// is the court's miss and exactly what the engine must catch (measured on round 4; the name itself is not reprinted — WITHHELD.md §3).
const ANON_DOC_RE = /\b[A-Z]{1,4}\s+v\s+[A-Z]{1,4}\b/
const isAnonDoc = (orig) => ANON_DOC_RE.test(orig.slice(0, 1500)) && (/\[[A-Z][A-Za-z0-9 ]{0,18}\]/.test(orig) || /X{3}/.test(orig))
const COURT_ARTIFACT_SHAPES = [
  /^\[[^\]]{1,20}\]$/, // bracketed codes: [G], [W Holdings]
  /^[A-Z]{1,4}\d{0,2}$/, // letter codes: WJZ, C1, B
  /^[X\d\s()/-]*X{2,}[X\d\s()/-]*[A-Z]?$/, // pre-masked IDs: XXX425, XXX-XXX-19-6, XXXXXXX29W (NRIC checksum letter)
  /^\(?-?\d{1,5}\)?$/, // bare number fragments the court left: 232, (-0001)
]
const isCourtArtifact = (s) => COURT_ARTIFACT_SHAPES.some((re) => re.test(s.trim()))
// P0i (round-7 owner ruling, "run it" 2026-07-24): geography follows the ratified
// identity-anchor principle. LOC QUASI -> NO_MASK unless any occurrence sits within ±90
// chars of a personal-life anchor (residence/origin context). Jurisdictional machinery
// (governing-law states, incorporation, venues) is business context, not identity.
// Fail-closed: unmatchable spans and ambiguous anchors stay QUASI. DIRECT (full personal
// addresses) never touched by this block.
const GEO_PERSON_ANCHOR_RE = /\b(?:lives?|lived|living|resides?|resided|residing|residence|home|homes|flat|apartment|condominium|address(?:es|ed)?|moved (?:to|into)|born in|native of|grew up|domiciled|hometown|stay(?:s|ed|ing)? (?:at|in)|matrimonial)\b/i
// P0i address guard (caught in the projection spot-check before first race): street
// addresses and their components (zips, city lines inside notice blocks) are NOT
// jurisdictional geography — a notice-block address can be an executive's home. Any
// address-shaped span, or a span whose occurrence sits near a street-address shape or a
// notice-block marker, stays QUASI. Fail-closed both ways.
const ADDRESS_SHAPE_RE = /\b\d{1,5}\s+[A-Z][\w.' ]*(?:Avenue|Ave\.?|Street|St\.?|Road|Rd\.?|Drive|Dr\.?|Way|Boulevard|Blvd\.?|Lane|Ln\.?|Route|Court|Place|Plaza|Terrace|Highway|Hwy\.?|Suite|Floor)\b|\b\d{5}(?:-\d{4})?\b|\bSuite\s+\d/i
const NOTICE_CTX_RE = /\bnotices?\b|\bif to\b|\bmailing address\b|\baddressed to\b/i
// P0j (round-7 owner ruling): a person named ONLY as creator of a cited cultural work
// ("Mendelssohn's "Wedding March"") is not a private individual. ULTRA-NARROW and the only
// projection permitted to touch DIRECT: every occurrence must be possessive directly
// followed by an opening quote, and the name must share no token with any other PERSON
// entity in the doc. Real SGHCF practice keeps these (REDACTION_AUDIT.md).
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let files = 0, flipped = 0, anchoredKept = 0, total = 0, orgFlipped = 0, orgKept = 0, titleFlipped = 0, occFlipped = 0, geoFlipped = 0, geoKept = 0, culturalFlipped = 0
const examples = { flipped: [], anchoredKept: [], orgKept: [] }
import { existsSync } from 'node:fs'
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.json') && !x.startsWith('_') && existsSync(join(DOCS, x.replace('.json', '.txt'))))) {
  const gold = JSON.parse(readFileSync(join(SRC, f), 'utf8'))
  const orig = readFileSync(join(DOCS, f.replace('.json', '.txt')), 'utf8')
  const personToks = new Set(gold.entities.filter((e) => e.category === 'PERSON').flatMap((e) => e.span_text.toLowerCase().split(/[^a-zà-ÿ'’-]+/).filter((w) => w.length >= 3 && !CORP_STOP.has(w))))
  const anonDoc = isAnonDoc(orig)
  let p0f = 0
  for (const e of gold.entities) {
    total++
    if (anonDoc && e.identifier_type !== 'NO_MASK' && isCourtArtifact(e.span_text)) {
      e.identifier_type = 'NO_MASK'
      e.doctrine_note = 'P0f: court-assigned pseudonym/artifact (preserve the court’s anonymization)'
      p0f++
      continue
    }
    if (e.category === 'PERSON' && e.identifier_type !== 'NO_MASK') {
      const nm = e.span_text.trim()
      if (nm.split(/\s+/).length <= 3 && /^[A-Z]/.test(nm)) {
        const myToks = nm.toLowerCase().split(/[^a-zà-ÿ'’-]+/).filter((w) => w.length >= 3)
        const otherToks = new Set(gold.entities.filter((x) => x !== e && x.category === 'PERSON').flatMap((x) => x.span_text.toLowerCase().split(/[^a-zà-ÿ'’-]+/).filter((w) => w.length >= 3)))
        if (myToks.length && !myToks.some((w) => otherToks.has(w))) {
          const re = new RegExp(esc(nm).replace(/\s+/g, '\\s+'), 'g')
          let n = 0, cultural = 0
          for (const m of orig.matchAll(re)) {
            n++
            if (/^['’]s\s*[“"'‘]/.test(orig.slice(m.index + m[0].length, m.index + m[0].length + 8))) cultural++
          }
          if (n > 0 && n === cultural) {
            e.identifier_type = 'NO_MASK'
            e.doctrine_note = 'P0j projection: cultural-work creator, every occurrence possessive-before-quoted-work'
            culturalFlipped++
            console.log(`  P0j ${f}: ${nm} (${n} occ, all cultural) -> preserve`)
            continue
          }
        }
      }
    }
    if (e.identifier_type !== 'QUASI') continue
    if (e.category === 'LOC') {
      if (ADDRESS_SHAPE_RE.test(e.span_text)) { geoKept++; continue }
      const re = new RegExp(esc(e.span_text).replace(/\s+/g, '\\s+'), 'g')
      let found = false, anchored = false
      for (const m of orig.matchAll(re)) {
        found = true
        const win = orig.slice(Math.max(0, m.index - 120), m.index + m[0].length + 120)
        if (GEO_PERSON_ANCHOR_RE.test(win) || ADDRESS_SHAPE_RE.test(win) || NOTICE_CTX_RE.test(win)) { anchored = true; break }
      }
      if (!found || anchored) { geoKept++; continue }
      e.identifier_type = 'NO_MASK'
      e.doctrine_note = 'P0i projection: jurisdictional geography, no person/address anchor'
      geoFlipped++
      continue
    }
    if (e.category === 'ORG') {
      const toks = e.span_text.toLowerCase().split(/[^a-zà-ÿ'’-]+/).filter((w) => w.length >= 3 && !CORP_STOP.has(w))
      if (toks.some((w) => personToks.has(w))) { orgKept++; if (examples.orgKept.length < 6) examples.orgKept.push(`${f}: ${e.span_text}`); continue }
      e.identifier_type = 'NO_MASK'
      e.doctrine_note = 'P0b projection: party org, no person anchor'
      orgFlipped++
      continue
    }
    if (e.category !== 'PERSON' && isOccupation(e.span_text)) {
      e.identifier_type = 'NO_MASK'
      e.doctrine_note = 'P0e projection: occupation/role (practiced court doctrine)'
      occFlipped++
      continue
    }
    if (e.category !== 'PERSON' && TITLE_RE.test(e.span_text.trim())) {
      const defRe = new RegExp('[(“"‘\x27]\\s*(?:the\\s+)?' + esc(e.span_text.trim()) + '\\s*[”"’\x27)]', 'i')
      if (defRe.test(orig)) { anchoredKept++; continue }
      e.identifier_type = 'NO_MASK'
      e.doctrine_note = 'P0b projection: bare role title'
      titleFlipped++
      continue
    }
    if (!isFlipShape(e.span_text)) continue
    const re = new RegExp(esc(e.span_text).replace(/\s+/g, '\\s+'), 'g')
    let anchored = false
    for (const m of orig.matchAll(re)) {
      if (IDENTITY_ANCHOR_RE.test(orig.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70))) { anchored = true; break }
    }
    if (anchored) {
      anchoredKept++
      if (examples.anchoredKept.length < 8) examples.anchoredKept.push(`${f}: ${e.span_text}`)
      continue
    }
    e.identifier_type = 'NO_MASK'
    e.doctrine_note = 'P0 projection: date/amount shape, no identity anchor'
    flipped++
    if (examples.flipped.length < 8) examples.flipped.push(`${f}: ${e.span_text}`)
  }
  if (p0f > 0) console.log(`  P0f ${f}: ${p0f} court artifacts -> preserve`)
  writeFileSync(join(DST, f), JSON.stringify(gold, null, 1))
  files++
}
console.log(`projected ${files} label files -> pii-bench/oos-labels-product/`)
console.log(`entities ${total} | dates/amounts flipped: ${flipped} | anchored (stay QUASI): ${anchoredKept}`)
console.log(`P0b: ORG flipped: ${orgFlipped} | ORG person-anchored kept: ${orgKept} | titles flipped: ${titleFlipped}`)
console.log(`P0i: LOC flipped: ${geoFlipped} | person-anchored/unmatchable kept: ${geoKept} | P0j cultural: ${culturalFlipped} | P0e occupations: ${occFlipped}`)
console.log('flipped e.g.:', examples.flipped.slice(0, 4).join(' | '))
console.log('org-kept e.g.:', examples.orgKept.join(' | ') || '(none)')
