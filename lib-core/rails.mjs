// The structural battery — deterministic rails for every identity class whose
// shape is specifiable. Never ask a model what a regex can decide. Every rule
// here traces to a measured leak in bench/hardening-2026-07-19/REPORT.md; the
// two character-class lessons (8-digit SG UEN, the "Washington. DC" period)
// are baked in with their unit pins in test/.
import { baseName, escRe } from './anonymize.mjs'

/** Ranges of email addresses — the URL rail must not eat an email's domain
 *  (the floor masks whole emails; a stolen domain would break that). */
export function emailRangesOf(text) {
  const out = []
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  let m
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length })
  return out
}

export function railUrls(text, emailRanges = emailRangesOf(text)) {
  const out = []
  const re = /(?:https?:\/\/|www\.)[^\s"'<>()]+|\b(?:[a-z0-9][a-z0-9-]*\.)+(?:com(?:\.sg|\.au)?|co\.uk|com|net|org|io|sg|biz)\b/gi
  let m
  while ((m = re.exec(text))) {
    const inEmail = emailRanges.some((r) => m.index >= r.start && m.index < r.end)
    if (!inEmail) out.push(m[0].replace(/[.,;:]+$/, ''))
  }
  return [...new Set(out)]
}

export function railPhones(text) {
  const out = new Set()
  for (const re of [
    /\(\d{3}\)\s?\d{3}[-.\s]\d{4}/g,                 // (202) 274-2000
    /\b\d{3}[-./]\d{3}[-.]\d{4}\b/g,                  // 206-786-0891 · 616/945-2491 · 415.555.0198
    /\+\d{1,3}[\s-]?\d{1,4}(?:[\s-]\d{2,5}){1,4}/g,   // +65 9123 4567 · +44 20 7946 0958
  ]) {
    let m
    while ((m = re.exec(text))) out.add(m[0].trim())
  }
  return [...out]
}

export function railIds(text) {
  const out = new Set()
  for (const re of [
    /\b\d{2}-\d{7}\b/g,        // EIN
    /\b\d{3}-\d{2}-\d{4}\b/g,  // SSN-shaped
    /\b\d{3}-\d{6}\b/g,        // registration numbers (333-189160)
    /\b\d{8,9}[A-Z]\b/g,       // SG UEN — 8-digit pre-2009 ROB + 9-digit ROC (measured: the 8-digit form leaked)
    // tickers — case-tolerant exchange names ("(Nasdaq:ENHT)" printed mixed-case
    // leaked on the 79k bench) and room for dotted symbols ("MJRC.PK" is 7):
    /\((?:NASDAQ|Nasdaq|NYSE|AMEX|SGX|LSE|ASX|OTC[A-Z]*|Pink\s+Sheets)\s*:\s*[A-Z0-9.]{1,8}\)/g,
    // patent identifiers — all three formats printed in the 79k bench docs
    // (63/177,520 leaked while its siblings were caught by model luck):
    /\b\d{2}\/\d{3},\d{3}\b/g,          // US provisional: 62/881,740
    /\bPCT\/[A-Z]{2}\d{4}\/\d{6}\b/g,   // PCT: PCT/US2020/044223
    /\b\d{4}-\d{6}\b/g,                 // JP-style application: 2022-506670
    // PCAOB auditor-registry references — the PHRASE is the rail, so the
    // 3-5 digit ID never has to enter the table as bare digits (the
    // footprint floor forbids those by design):
    /\bPCAOB\s+(?:ID\s+)?(?:No\.?:?\s*)?\d{3,5}\b/gi,
    // ── round-1 OOS additions (bench/oos-walkforward/round-1/RESULT.md) ──
    // SEC file numbers as a phrase ("File No. 0-26071" — the bare 0-26071
    // shape is too collision-prone alone; the phrase is unambiguous):
    /\b(?:Commission\s+)?File\s+(?:No\.?|Number)[:\s]*\d{1,3}-\d{4,6}\b/gi,
    // Israeli company registry numbers (5-1391737-7 — leaked on doc4):
    /\b\d-\d{7}-\d\b/g,
    // court reporter citations of the document's own case (260 F.3d 858):
    /\b\d{1,4}\s+(?:F\.\s?(?:2d|3d|4th)|U\.S\.|S\.\s?Ct\.|F\.\s?Supp\.\s?(?:2d|3d)?)\s+\d{1,5}\b/g,
    // ── round-2 OOS additions (bench/oos-walkforward/round-2/RESULT.md) ──
    // Singapore court citations + matter numbers (three forms leaked while
    // their siblings were caught by model luck — now all are rails):
    /\[\d{4}\]\s+SG[A-Z]{2,4}\s+\d{1,5}\b/g,           // [2026] SGCA 34
    /\b(?:Civil\s+Appeal|Originating\s+(?:Claim|Summons|Application)|Suit|Bill\s+of\s+Costs)\s+No\.?\s+\d{1,5}\s+of\s+\d{4}\b/gi,
    // fix set 4: RA/SUM form codes leaked in round 4 (HC/RA 100/2026);
    // Registrar's-Appeals phrases print with curly apostrophes:
    /\b(?:HC|CA|AD|DC|MC)\/(?:OC|OA|OS|SUM|RA|RAS|SIC|S|CA)\s*\d{1,5}\/\d{4}\b/g,
    /\bRegistrar['’]s\s+Appeals?\s+Nos?\.?\s+\d{1,5}(?:\s+and\s+\d{1,5})?\s+of\s+\d{4}\b/gi,
    // Federal Register / statute citation family (rounds 3-4 misses):
    /\bFR\s+Doc\.\s*\d{4}-\d{4,6}\b/g,
    /\b\d{1,3}\s+FR\s+\d{3,6}\b/g,
    /\b\d{1,3}\s+CFR\s+\d{1,4}(?:\.\d{1,4}(?:-\d{1,3})?)?\b/g,
    /\b\d{1,3}\s+U\.S\.C\.\s+\d{1,6}[a-z]?\b/g,
    /\bPub\.\s*L\.\s*\d{2,3}-\d{1,4}\b/g,
    /\bBILLING\s+CODE\s+[\dA-Z-]{4,12}\b/g,
    /\b\d{1,3}\s+Statutes\s+at\s+Large,?\s+\d{1,5}\b/gi,
    // SEC form types as printed IDs (GT rules them core; previously stoplisted):
    /\bFORM\s+\d{1,2}-[A-Z]{1,3}(?:\/A)?\b/gi,
    // unparenthesized exchange-prefixed tickers (NYSE:WS leaked):
    /\b(?:NYSE|NASDAQ|Nasdaq|AMEX|LSE|SGX|ASX):\s?[A-Z]{1,6}(?:\.[A-Z]{1,3})?\b/g,
    // law-firm matter references (SMC/737066-000002/78768273v3):
    /\b[A-Z]{2,4}\/\d{4,9}-\d{3,9}(?:\/\d{4,12}v\d{1,3})?\b/g,
    // EDGAR DEI document-ID region (ticker-YYYYMMDD — the proxy's machine
    // header leaked spsc-20240404):
    /\b[a-z]{2,6}-\d{8}\b/g,
  ]) {
    let m
    while ((m = re.exec(text))) out.add(m[0])
  }
  return [...out]
}

/** Sourcing/filing header metadata — the DOMINANT round-1 OOS miss family
 *  (7 of 12): corpus source lines ("Source: Caselaw Access Project (public
 *  domain), CAP id 9498207"), EDGAR exhibit headers ("EX-99.1 …
 *  ny20023240x1_ex99-1.htm EXHIBIT 99.1"), accession-number shapes. These
 *  identify the DOCUMENT itself — they out a redacted case/filing in one
 *  string, and they ride every document sourced from a public archive. */
export function railHeaderMeta(text) {
  const out = new Set()
  for (const re of [
    /\bCAP\s+id\s+\d{4,10}\b/g,
    /\bSource:\s*Caselaw\s+Access\s+Project[^\n]{0,40}/g,
    /\bEX(?:HIBIT)?[-\s]?\d{1,3}\.\d{1,2}\b/gi,
    // filing filenames — fix set 4: {6,40}→{2,40} (round 4: "ws-ex99_2.htm"
    // has a two-char stem); also plain-stem exhibit filenames (odii..._8k.htm):
    /\b[a-z0-9_-]{2,40}_?ex[\d_d-]{1,10}\.htm\b/gi,
    /\b[a-z0-9_-]{4,40}_(?:8k|10k|10q|6k|s1|def14a)[a-z0-9]{0,6}\.htm\b/gi,
    /\b\d{10}-\d{2}-\d{6}\b/g,                  // EDGAR accession numbers
  ]) {
    let m
    while ((m = re.exec(text))) out.add(m[0].trim())
  }
  // fix set 4: an admitted "Exhibit N.M" ALSO admits its bare "N.M" print —
  // exhibit-index tables list the number without the word ("Exhibit No.
  // Description  10.1  Employment Agreement…"), and entity-complete scoring
  // fails the entity on that surviving bare print. Over-masking stray
  // section-number lookalikes is the safe direction and junk-flaggable.
  for (const v of [...out]) {
    const m = v.match(/^EX(?:HIBIT)?[-\s]?(\d{1,3}\.\d{1,2})$/i)
    if (m) {
      out.add(m[1])
      out.add(m[1] + '*') // starred index prints ("10.2*")
    }
  }
  return [...out]
}

/** Ampersand firm names — "Benjamin & Ko", "Rosenthal & Rosenthal": two
 *  capitalized tokens joined by & is company-shaped with near-zero false-
 *  positive surface in business prose; auto-admit, extended left/right over
 *  additional capitalized tokens ("Fried, Frank, Harris, Shriver & Jacobson").
 *  (&-encoded prints like "&amp;" are the DOCUMENT's own encoding — matched
 *  as printed via the amp alternation.) */
export function railAmpNames(text) {
  const out = new Set()
  const W = "[A-Z][A-Za-z.'’-]+"
  const re = new RegExp(`\\b(?:${W},?\\s+){1,4}(?:&|&amp;)\\s+${W}(?:\\s+(?:LLP|LLC|L\\.L\\.P\\.|Inc\\.?|Co\\.?|Ltd\\.?|Company|Sons(?:\\s+Limited)?))?`, 'g')
  let m
  while ((m = re.exec(text))) out.add(m[0].trim())
  return [...out]
}

/** Social-platform footer brands — deterministic tiny lexicon; "Follow us on
 *  X, LinkedIn and YouTube" outs the company's channels (round-1 doc5). Only
 *  fires on the platform words themselves; boundary guards do the rest. */
const PLATFORM_BRANDS = ['LinkedIn', 'YouTube', 'Facebook', 'Instagram', 'TikTok', 'WhatsApp', 'Telegram', 'WeChat']
export function railPlatformBrands(text) {
  const out = new Set()
  for (const p of PLATFORM_BRANDS) {
    if (new RegExp(`(?<![A-Za-z0-9])${p}(?![A-Za-z0-9])`).test(text)) out.add(p)
  }
  return [...out]
}

/** Known-name lexicon — round-2's spoken-register lesson: transcript prose
 *  gives classify weak signals, and standards-named brands ("Wi-Fi 7") plus
 *  household companies ("Apple") vote generic. Deterministic, CASE-SENSITIVE,
 *  boundary-guarded; multi-token/numbered standards are unambiguous, and the
 *  famous-company names listed here are never common words in capitalized
 *  position. Word-brands that ARE common capitalized words ("Matter",
 *  "Thread") are deliberately EXCLUDED — they stay a documented residual
 *  class until the known-entities ledger exists (over-masking every "In the
 *  Matter of" would be the wrong trade). */
const KNOWN_NAMES = [
  // numbered/compound tech standards-as-brands:
  /Wi-Fi(?:\s+\d[A-Za-z]?)?/g, /Bluetooth(?:\s+(?:Low\s+Energy|\d(?:\.\d)?))?/g, /\bUWB\b/g, /\bZigbee\b/g, /\bLoRa\b/g,
  // household companies whose bare names classify keeps voting generic:
  /\bApple\b/g, /\bGoogle\b/g, /\bMicrosoft\b/g, /\bAmazon\b/g, /\bNvidia\b/g, /\bIntel\b/g, /\bSamsung\b/g, /\bOracle\b/g, /\bIBM\b/g,
]
export function railKnownNames(text) {
  const out = new Set()
  for (const re of KNOWN_NAMES) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) {
      out.add(m[0].trim())
      if (m.index === re.lastIndex) re.lastIndex++
    }
  }
  return [...out]
}

/** Quoted defined-term organizations — X ("ABBR") where X is a quoted 3+ word
 *  Title-Case phrase: 'the "Technical Design and Advisory Committee"
 *  ("TDAC")'. The classify model votes committee-shaped names "generic"
 *  (round-1 doc2); the STRUCTURE — a quoted long form immediately defining a
 *  short form — is the identity signal, so it auto-admits both forms. */
export function railQuotedDefinedOrgs(text) {
  const out = new Set()
  const re = /["“]([A-Z][A-Za-z0-9&.'’-]*(?:\s+(?:of|and|for|the|[A-Z][A-Za-z0-9&.'’-]*)){2,7})["”]\s*\(\s*["“]([A-Z][A-Za-z0-9]{1,20})["”]\s*\)/g
  let m
  while ((m = re.exec(text))) {
    out.add(m[1].trim())
    out.add(m[2].trim())
  }
  return [...out]
}

/** Custom-taxonomy XBRL member tokens — machine strings that EMBED identity
 *  (SIGN:OsherCapitalPartnersLLCMember names an investor; SIGN:MrJoyceMember
 *  names a person). Standard-taxonomy prefixes are accounting boilerplate and
 *  stay. Masking the WHOLE token is the only clean cut: boundary-guarded
 *  masking (2026-07-20) means prose footprints can no longer nibble at camel
 *  tokens by substring accident, so the rail owns this class outright. */
const XBRL_STANDARD_PREFIXES = new Set(['us-gaap', 'dei', 'srt', 'xbrli', 'iso4217', 'country', 'stpr', 'naics', 'sic', 'currency', 'exch', 'fasb', 'xbrl', 'link', 'xlink'])
export function railXbrlMembers(text) {
  const out = new Set()
  // fix set 4: token body admits dots (round 4 leaked
  // "ATNF:CommonStockParValue0.0001PerShareMember" — the decimal broke the class)
  const re = /\b([A-Za-z][A-Za-z0-9-]*):([A-Za-z0-9.]+(?:Member|Axis|Domain))\b/g
  let m
  while ((m = re.exec(text))) {
    if (!XBRL_STANDARD_PREFIXES.has(m[1].toLowerCase())) out.add(m[0])
  }
  return [...out]
}

/** Signature-block names — "/s/ Antony Koblish" (round-4 family): the /s/
 *  marker IS the person classifier; the print (marker included, spaced or
 *  glued) admits whole so the signature line masks even when the bare name
 *  was caught elsewhere in another form. */
export function railSignatures(text) {
  const out = new Set()
  const re = /\/s\/\s*[A-Z][A-Za-z.'’-]+(?:[ ]+[A-Z][A-Za-z.'’-]+){0,3}/g
  let m
  while ((m = re.exec(text))) out.add(m[0].trim())
  return [...out]
}

/** Institutions — universities, colleges, schools, associations, societies…
 *  Measured on the 79k bench: eight of eleven exhaustive misses were
 *  institution names inside director-bio sentences, nominated by the cap-run
 *  rail but judged "place"/"generic" by the model. Shape is specifiable, so
 *  the judgment is retired: suffix-anchored capitalized runs AUTO-ADMIT.
 *  A ≥2-word proper prefix is emitted as a second footprint ("Sarah Lawrence"
 *  from "Sarah Lawrence College") so sibling phrases ("Sarah Lawrence
 *  Planning Committee") fall with the institution. */
const INST_SUFFIX = '(?:University|College|Institute|Institutes|School|Academy|Association|Society|Foundation|Conservatory|Seminary|Polytechnic)'
export function railInstitutions(text) {
  const out = new Set()
  const word = "[A-Z][A-Za-z&.'’-]+"
  const res = [
    new RegExp(`\\b(?:${word}\\s+){1,4}${INST_SUFFIX}(?:\\s+of\\s+${word}(?:\\s+${word}){0,3})?`, 'g'),
    new RegExp(`\\b${INST_SUFFIX}\\s+of\\s+${word}(?:\\s+${word}){0,3}`, 'g'),
    new RegExp(`\\b(?:${word}\\s+){1,4}(?:Chamber\\s+of\\s+Commerce|Research\\s+Complex)`, 'g'),
  ]
  for (const re of res) {
    let m
    while ((m = re.exec(text))) {
      const span = m[0].trim()
      out.add(span)
      const prefix = span.replace(new RegExp(`\\s+${INST_SUFFIX}.*$`), '').replace(/\s+(?:Chamber\s+of\s+Commerce|Research\s+Complex)$/, '')
      if (prefix !== span && prefix.split(/\s+/).length >= 2) out.add(prefix.trim())
    }
  }
  return [...out]
}

/** Address shapes beyond the engine's basic street rule: ALLCAPS letterheads,
 *  city-[,.]-state-zip lines (real letters typo the comma), Singapore postal
 *  and unit forms, highway addresses. */
export function railAddressesExtended(text) {
  const out = new Set()
  const res = [
    /(?<![\d.])\d{1,5}\s+(?:[A-Z]{2,}[A-Za-z.]*\s+){1,4}(?:STREET|ST\.?|AVENUE|AVE\.?|ROAD|RD\.?|HIGHWAY|HWY\.?|DRIVE|DR\.?|LANE|LN\.?|BOULEVARD|BLVD\.?|WAY|COURT|CT\.?|PLACE|PL\.?)\b(?:,\s*(?:SUITE|STE\.?|UNIT)\s*\d+)?(?:,\s*[A-Z][A-Za-z.]*(?:\s[A-Z][A-Za-z.]*)?)?/g,
    /\b[A-Z][A-Za-z.]+(?:\s[A-Z][A-Za-z.]+)?[,.]\s*(?:[A-Z]{2}|D\.C\.|[A-Z][a-z]+)\s+\d{5}(?:-\d{4})?\b/g,
    /\bSingapore\s+\d{6}\b/g,
    /#\d{2}-\d{2,3}\b/g,
    /(?<![\d.])\d{1,5}\s+(?:Highway|Hwy\.?|Route|Rte\.?)\s+\d{1,3}(?:\s+(?:North|South|East|West|N|S|E|W))?\b/g,
  ]
  for (const re of res) {
    let m
    while ((m = re.exec(text))) out.add(m[0].trim())
  }
  return [...out]
}

/** Tag-adjacent tails — the rail class that only exists on REDACTED text:
 *  "[Company5], Michigan 20015" leaves a fragment hanging next to a mask. The
 *  captured tail is verbatim original text, so the final mask lands cleanly. */
export function railTagTails(maskedText) {
  const out = new Set()
  const re = /\[(?:Person|Company|Brand|Address|Email|Phone|Id)\d+\][,.]?\s*((?:[A-Z][A-Za-z.]*[,.]?\s+){0,2}\d{5,6}(?:-\d{4})?)(?![\d-])/g
  let m
  while ((m = re.exec(maskedText))) {
    const tail = (m[1] || '').trim()
    if (tail) out.add(tail)
  }
  return [...out]
}

/** The whole battery as table entries. Position-independent, zero model. */
export function structuralBattery(text, { tagTails = false } = {}) {
  const entries = []
  const seen = new Set()
  const admit = (span, cls, src) => {
    const b = baseName(span)
    if (!b || seen.has(b.toLowerCase())) return
    seen.add(b.toLowerCase())
    entries.push({ span: b, cls, src })
  }
  const emails = emailRangesOf(text)
  for (const u of railUrls(text, emails)) admit(u, 'ID', 'rail:url')
  for (const p of railPhones(text)) admit(p, 'PHONE', 'rail:phone')
  for (const i of railIds(text)) admit(i, 'ID', 'rail:id')
  for (const x of railXbrlMembers(text)) admit(x, 'ID', 'rail:xbrl-member')
  for (const s of railSignatures(text)) admit(s, 'PERSON', 'rail:signature')
  for (const n of railInstitutions(text)) admit(n, 'COMPANY', 'rail:institution')
  for (const h of railHeaderMeta(text)) admit(h, 'ID', 'rail:header-meta')
  for (const f of railAmpNames(text)) admit(f, 'COMPANY', 'rail:amp-name')
  for (const b of railPlatformBrands(text)) admit(b, 'BRAND', 'rail:platform')
  for (const k of railKnownNames(text)) admit(k, 'BRAND', 'rail:known-name')
  for (const q of railQuotedDefinedOrgs(text)) admit(q, 'COMPANY', 'rail:quoted-org')
  for (const a of railAddressesExtended(text)) admit(a, 'ADDRESS', 'rail:address-ext')
  if (tagTails) for (const t of railTagTails(text)) admit(t, 'ADDRESS', 'rail:tag-tail')
  return entries
}

/** Role-term junk flagging — NON-DESTRUCTIVE. Over-masking is the safe
 *  direction, so nothing is dropped; entries matching the boilerplate lexicon
 *  are FLAGGED so the review surface can group them for one-tap discard and
 *  the bench can measure the junk load. */
const ROLE_TERMS = new Set(
  ['the company', 'company', "company's", 'the agreement', 'agreement', 'the parties', 'party', 'parties', 'the holder', 'holder', 'the members', 'member', 'members', 'president', 'the president', 'director', 'directors', 'director managers', 'director manager', 'executive manager', 'executive managers', 'chief executive officer', 'chief financial officer', 'indemnified party', 'indemnifying party', 'supplier', 'buyer', 'seller', 'landlord', 'tenant', 'effective date', 'business day', 'business days', 'confidential information', 'operating agreement', 'membership interest', 'membership interests'],
)
export function flagJunkSuspects(table) {
  for (const e of table) {
    const k = e.span.toLowerCase().replace(/\s+/g, ' ').replace(/[.'’s]+$/g, '')
    e.junkSuspect = ROLE_TERMS.has(k) || ROLE_TERMS.has(`the ${k}`) || undefined
  }
  return table
}
export { escRe }
