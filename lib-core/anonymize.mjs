// simpler-red core — the document stripper.
//
// Two INDEPENDENT layers, each measured at 100% on the founding benchmark
// (bench/EVIDENCE_2026-07-19.md, round 4), unioned into one entity table:
//
//   layer 1 — the span pass: 500-char word-boundary chunks through the local
//             model ("list every identifying span, verbatim"); every nominated
//             span must occur in its chunk or it is REFUSED (fail-closed).
//   layer 2 — the rails: deterministic candidate nomination in code (defined-
//             term quotes, capitalized runs, address shapes, ®/™ marks); the
//             model only CLASSIFIES each unique candidate through a forced
//             GBNF enum. Recall is a property of code; the model does judgment.
//
// The entity table lives in CODE ONLY — never in a prompt (the measured −24pt
// lesson: prompt-carried state poisons discovery). Masking is deterministic,
// document-wide, longest-span-first, followed by the structured floor (kept in
// lockstep with simpler-harness pii_floor.rs / privacy.ts).
//
// The model transport is injected: `complete(system, user, opts) -> string`.
// Nothing in this module performs I/O; nothing here can leak a byte.

// ── the deterministic structured floor (lockstep: harness PII_RULES) ────────
export const FLOOR_RULES = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/\b[STFGM] ?\d{7} ?[A-Z]\b/gi, '[nric]'],
  [/\b(?:\d[ .-]?){13,16}\b/g, '[card]'],
  [/(?:\+?65[\s-]?)?[689]\d{3}[\s-]?\d{4}\b/g, '[phone]'],
  [/\b\d{9,16}\b/g, '[number]'],
]
export function floorMask(text) {
  let out = text || ''
  for (const [re, tok] of FLOOR_RULES) out = out.replace(re, tok)
  return out
}
/** Fold fullwidth ASCII (CJK/SEA IME output) to halfwidth so the floor's ASCII
 *  classes match — mirror of the harness foldFullwidth. */
export function foldFullwidth(text) {
  return (text || '').replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
}

// ── shared text utilities ───────────────────────────────────────────────────
export const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Canonical form a table entry is stored and masked by: marks and edge
 *  punctuation stripped, whitespace collapsed. Masking by base name is what
 *  catches "CASITE ®" when the model saw "CASITE®" (measured leak, round 1). */
export const baseName = (s) =>
  (s || '')
    .replace(/[®™]/g, '')
    .replace(/^[\s("'\[]+|[\s)"',.;:\]]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Word-boundary chunking. A chunk edge NEVER lands inside a word — the
 *  round-2 fragment class ("raco", "SITE": a mid-word cut whose fragment then
 *  verifies as "verbatim in chunk") is structurally impossible. */
export function makeChunks(text, size = 500, overlap = 100) {
  const chunks = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(i + size, text.length)
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end)
      if (nl > i + size - Math.min(400, size / 2)) {
        end = nl + 1
      } else {
        // walk back to whitespace so no word is cut
        let e = end
        while (e > i + 1 && /\S/.test(text[e - 1]) && /\S/.test(text[e])) e--
        if (e > i + 1) end = e
      }
    }
    chunks.push({ start: i, end, text: text.slice(i, end) })
    if (end >= text.length) break
    i = Math.max(end - overlap, i + 1)
  }
  return chunks
}

// ── layer 1: the span pass ──────────────────────────────────────────────────
/** FROZEN prompt contract (test-pinned). Never tuned per document. */
export const EXTRACT_SYSTEM = `You extract identifying spans from a chunk of a business document. List EVERY span that reveals who the document is about:
  PERSON  - a person's name
  COMPANY - a company or organization name
  BRAND   - a product or brand name
  ADDRESS - a street address
  EMAIL   - an email address
  PHONE   - a phone or fax number
  ID      - an ID, account or registration number
Copy each span EXACTLY as it appears in the text, character for character. One per line, format CLASS: span
Do not list generic words, defined role terms (the Company, the Agreement, the Members), place names on their own, dates, or money amounts. List each distinct name once even if it repeats.
If there are none, output exactly: NONE
Output only the list, nothing else.`

export function parseSpans(raw) {
  const out = []
  for (const line of (raw || '').split('\n')) {
    const m = line.match(/^\s*[-*]?\s*(PERSON|COMPANY|BRAND|ADDRESS|EMAIL|PHONE|ID)\s*[:\-]\s*(.+?)\s*$/i)
    if (m) out.push({ cls: m[1].toUpperCase(), span: m[2].replace(/^["'`]|["'`]$/g, '').trim() })
  }
  return out
}

/** A nominated span must occur in its chunk (verbatim, then punctuation-
 *  trimmed, then whitespace-normalized) or it is refused — no hallucinated
 *  mask can ever enter the table. */
export function verifySpan(span, chunkText) {
  if (chunkText.includes(span)) return { ok: true, kind: 'verbatim', span }
  const trimmed = baseName(span)
  if (!trimmed) return { ok: false, kind: 'failed', span }
  if (chunkText.includes(trimmed)) return { ok: true, kind: 'trimmed', span: trimmed }
  const m = chunkText.match(new RegExp(trimmed.split(/\s+/).map(escRe).join('\\s+')))
  if (m) return { ok: true, kind: 'ws-normalized', span: m[0] }
  return { ok: false, kind: 'failed', span }
}

export async function spanPass(text, complete, opts = {}) {
  const { chunkChars = 500, overlap = 100 } = opts
  const chunks = makeChunks(text, chunkChars, overlap)
  const entries = []
  const seen = new Set()
  const stats = { calls: 0, failedCalls: 0, verifyFailed: 0 }
  for (const c of chunks) {
    let raw
    try {
      raw = await complete(EXTRACT_SYSTEM, `TEXT CHUNK:\n${c.text}`, { maxTokens: 400 })
    } catch {
      stats.failedCalls++
      continue
    }
    stats.calls++
    for (const n of parseSpans(raw)) {
      const v = verifySpan(n.span, c.text)
      if (!v.ok) {
        stats.verifyFailed++
        continue
      }
      const base = baseName(v.span)
      if (!base || base.length < 2) continue
      const key = base.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ span: base, cls: n.cls, src: 'span' })
    }
  }
  return { entries, stats, complete: stats.failedCalls === 0 }
}

// ── layer 2: the rails ──────────────────────────────────────────────────────
/** Contracts define their parties in their own grammar: X ("Shorthand"). */
export function railDefinedTerms(text) {
  const out = new Set()
  const re = /\(\s*(?:the\s+)?["“]([A-Z][A-Za-z0-9 .&/'’-]{1,40}?)["”]\s*\)/g
  let m
  while ((m = re.exec(text))) out.add(m[1].trim())
  return [...out]
}
/** Address shapes are specifiable — never ask a model what a regex decides.
 *  Two guards, both measured (round 4 + external review): the trailing \b
 *  stops "Business Pl" matching inside "Business Plan", and the leading
 *  (?<![\d.]) stops a decimal fraction donating its digit as a house number
 *  ("Section 4.6 Business Place" is not "6 Business Place"). */
export function railAddresses(text) {
  const out = new Set()
  const re = /(?<![\d.])\d{1,5}\s+(?:[A-Z][A-Za-z.]*\s+){1,4}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Highway|Hwy\.?|Drive|Dr\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Way|Court|Ct\.?|Place|Pl\.?)\b(?:,\s*[A-Z][A-Za-z]+(?:,\s*[A-Z][A-Za-z]+)?)?/g
  let m
  while ((m = re.exec(text))) out.add(m[0].trim())
  return [...out]
}
/** A ®/™ mark IS the brand classifier — zero model involvement. Tolerates a
 *  space before the mark ("CASITE ®", a measured leak shape). */
export function railMarks(text) {
  const out = new Set()
  const re = /((?:[A-Z][A-Za-z'’-]*[ ]?){1,3})\s?[®™]/g
  let m
  while ((m = re.exec(text))) {
    const b = baseName(m[1])
    if (b) out.add(b)
  }
  return [...out]
}

const ABBREV = new Set(['inc', 'ltd', 'corp', 'co', 'llc', 'llp', 'jr', 'sr', 'st', 'ave', 'rd', 'dr', 'no', 'mr', 'mrs', 'ms', 'esq', 'pte', 'sdn', 'bhd'])
/** A trailing '.' is sentence punctuation (strip + break the run) unless the
 *  token is an initial (K.), multi-dot (L.L.C.), or a known abbreviation
 *  (Inc.). The round-3 conviction: without this, runs glue across sentences. */
export function tokenCore(w) {
  if (!w.endsWith('.')) return { core: w, breakAfter: false }
  const bare = w.slice(0, -1)
  const dots = (w.match(/\./g) || []).length
  if ([...bare].length === 1 || dots >= 2 || ABBREV.has(bare.toLowerCase())) return { core: w, breakAfter: false }
  return { core: bare, breakAfter: true }
}

const STOP_SINGLE = new Set(
  'The This That These Those There Any Each Every All No Not If In On At By To For Of And Or A An As It Its He She They We Upon Such Section Sections Paragraph Paragraphs Exhibit Exhibits Article Schedule Form Act Rules State President Managers Manager Member Members Party Parties Agreement Company Interest Interests Date Dollars Attention Facsimile Supplier Buyer'.split(' '),
)
/** ALLCAPS tokens that are regulators, standards, degrees, titles, or market
 *  plumbing — never identities, never worth a classify call. Lowercased keys. */
const STOP_ACRO = new Set(
  ('sec irs fasb gaap xbrl ifrs edgar pcaob coso sox fda epa doj ftc gst cpf iras acra mom moh ica ura hdb ' +
    'usa us uk eu un who oecd nato asean ' +
    'ceo cfo cto coo cio evp svp avp vp gm hr pr ir esq esg ipo llc llp inc ltd corp co plc pte sdn bhd ' +
    'mba phd md jd ba bs bss ma ms msc bsc cpa cfa ' +
    'nyse amex otc otcbb sgx lse asx ' + // NOT nasdaq — a measured identity (customer/partner in the 79k bench), classify decides it
    'usd sgd eur gbp jpy cny rmb ' +
    'the and for not all any but new was are can may per via off out non due item part note none ').split(/\s+/).filter(Boolean),
)
/** Capitalized runs — UNICODE-aware (hardening campaign: the ASCII walker
 *  fragmented "NGUYỄN" on Ễ). Connectors of/and/for/the plus name particles
 *  (van/der/bin/al/de/da) allowed inside; a gap must be pure whitespace,
 *  ≤3 chars, and NOT a blank line (the round-3 conviction: "\n\n" glued
 *  signature names to the exhibit index). Leading stopwords trim off multi-
 *  token runs ("By Virginia…"). Single tokens qualify when ALL-CAPS≥4,
 *  camelCase (TurboShine / iMeridian), or document-frequent (≥3), and not
 *  stoplisted. */
export function railCapRuns(text) {
  const raw = []
  const re = /[\p{L}0-9][\p{L}0-9.&/'’-]*/gu
  let m
  while ((m = re.exec(text))) raw.push({ w: m[0], start: m.index, end: m.index + m[0].length })
  const words = raw.map((t) => {
    const { core, breakAfter } = tokenCore(t.w)
    return { w: t.w, core, start: t.start, end: t.start + core.length, breakAfter }
  })
  const isCap = (w) => /^\p{Lu}/u.test(w)
  const isConn = (w) => /^(of|and|for|the|van|der|bin|binte|al|de|da)$/i.test(w) && w === w.toLowerCase()
  const freq = new Map()
  for (const t of words) freq.set(t.core, (freq.get(t.core) || 0) + 1)
  const okGap = (a, b) => {
    const gap = text.slice(a.start + a.w.length, b.start)
    return /^\s*$/.test(gap) && gap.length <= 3 && !gap.includes('\n\n')
  }
  const cands = new Map()
  // digit-leading names (round-2: "8x8" was invisible to the walker) become
  // STANDALONE candidates — never run members (a connector must not glue
  // "8x8 and Talend" into one span). Ordinals (21st) and SEC form types
  // (10-K) stay out.
  const isDigitName = (w) => /^\d[\dA-Za-z.-]*$/.test(w) && /[A-Za-z]/.test(w) && !/^\d+(?:st|nd|rd|th)$/i.test(w) && !/^\d+-?[KQF]$/i.test(w)
  for (const t of words) {
    if (isDigitName(t.core) && !STOP_SINGLE.has(t.core)) cands.set(t.core, (cands.get(t.core) || 0) + 1)
  }
  let i = 0
  while (i < words.length) {
    if (!isCap(words[i].core)) {
      i++
      continue
    }
    let j = i
    let last = i
    while (j + 1 < words.length && !words[j].breakAfter) {
      if (!okGap(words[j], words[j + 1])) break
      if (isCap(words[j + 1].core)) {
        j++
        last = j
      } else if (isConn(words[j + 1].core) && j + 2 < words.length && !words[j + 1].breakAfter && isCap(words[j + 2].core) && okGap(words[j + 1], words[j + 2])) {
        j += 2
        last = j
      } else break
    }
    let runWords = words.slice(i, last + 1)
    // sentence-leading stopwords ("By Virginia…", "The Company") are not part
    // of the name — trim them; a run that shrinks to one token falls through
    // to the single-token rules (so "The Company" dies entirely as junk).
    while (runWords.length > 1 && STOP_SINGLE.has(runWords[0].core)) runWords = runWords.slice(1)
    const span = text.slice(runWords[0].start, runWords[runWords.length - 1].end)
    if (runWords.length >= 2) cands.set(span, (cands.get(span) || 0) + 1)
    else {
      const w = runWords[0].core
      const chars = [...w]
      // ALLCAPS floor is 3 (was 4): the 79k bench leaked "EOL", a bare
      // three-letter initialism used as the registrant's alias. Judgment
      // stays with classify; STOP_ACRO keeps regulator/standard/degree
      // acronyms from ever costing a model call.
      const allCaps = chars.length >= 3 && w === w.toUpperCase() && /\p{Lu}/u.test(w) && !STOP_ACRO.has(w.toLowerCase())
      const camel = /^\p{Lu}\p{Ll}+\p{Lu}/u.test(w) || /^i\p{Lu}/u.test(w)
      if (!STOP_SINGLE.has(w) && chars.length >= 3 && (allCaps || camel || (freq.get(w) || 0) >= 3)) cands.set(w, (cands.get(w) || 0) + 1)
    }
    i = last + 1
  }
  return cands
}

/** FROZEN classify contract (test-pinned). The GBNF grammar forces the enum. */
export const CLASSIFY_SYSTEM = `You classify what a quoted term refers to inside a business document. Answer with exactly one word:
person - a human individual's name
company - a company, bank, firm, or organization name
brand - a product or brand name
address - a street address
place - a city, state, country, or region name on its own
date - a date or year
generic - a common word, legal term, defined role word, document word, or anything else`
export const CLASSIFY_GRAMMAR = 'root ::= "person" | "company" | "brand" | "address" | "place" | "date" | "generic"'
const IDENTITY_CLASSES = new Set(['person', 'company', 'brand', 'address'])

/** Pure nomination — code only, no model. Exported so the benchmark can pin
 *  rails coverage of ground truth as a UNIT TEST (recall as a code property). */
export function nominate(text) {
  const auto = []
  const seenAuto = new Set()
  const admitAuto = (span, cls, rail) => {
    const b = baseName(span)
    if (!b || seenAuto.has(b.toLowerCase())) return
    seenAuto.add(b.toLowerCase())
    auto.push({ span: b, cls, src: rail })
  }
  for (const a of railAddresses(text)) admitAuto(a, 'ADDRESS', 'rail:address')
  for (const b of railMarks(text)) admitAuto(b, 'BRAND', 'rail:mark')
  const candSet = new Map()
  const addCand = (span, count) => {
    const base = baseName(span)
    if (!base || base.length < 3) return
    const key = base.toLowerCase()
    if (seenAuto.has(key)) return
    const cur = candSet.get(key)
    if (cur) cur.count += count
    else candSet.set(key, { span: base, count })
  }
  for (const [span, count] of railCapRuns(text)) addCand(span, count)
  for (const d of railDefinedTerms(text)) addCand(d, 5)
  const candidates = [...candSet.values()].sort((a, b) => b.count - a.count)
  return { auto, candidates }
}

export async function railsPass(text, complete) {
  const { auto, candidates } = nominate(text)
  const entries = [...auto]
  // ADDITIVE (2026-07-22, review-suspects): candidates the model looked at and
  // judged NON-identity are kept, not dropped — the review surfaces them as
  // "model cleared — you confirm". Never affects masking; behavior unchanged.
  const rejects = []
  const stats = { autoAdmitted: auto.length, candidates: candidates.length, calls: 0, failedCalls: 0 }
  for (const c of candidates) {
    const m = new RegExp(c.span.split(/\s+/).map(escRe).join('\\s+'), 'i').exec(text)
    const ctx = m ? text.slice(Math.max(0, m.index - 100), Math.min(text.length, m.index + m[0].length + 100)).replace(/\s+/g, ' ') : ''
    let raw
    try {
      raw = await complete(CLASSIFY_SYSTEM, `Context: "...${ctx}..."\nTerm: "${c.span}"`, { grammar: CLASSIFY_GRAMMAR, maxTokens: 6 })
    } catch {
      stats.failedCalls++
      continue
    }
    stats.calls++
    const v = (raw || '').trim().toLowerCase()
    if (IDENTITY_CLASSES.has(v)) entries.push({ span: c.span, cls: v.toUpperCase(), src: 'rail:classify' })
    else rejects.push({ span: c.span, verdict: v || 'unclassified' })
  }
  return { entries, rejects, stats, complete: stats.failedCalls === 0 }
}

// ── union, table, masking ───────────────────────────────────────────────────
/** The FOOTPRINT FLOOR (2026-07-20, the tiny-footprint cascade): a span that
 *  passes verbatim verification can still be junk — at 79k-word scale the
 *  model nominated "he", "other" and bare digits, and document-wide masking
 *  shredded the output ("the" → t[…] 3,497 times). Occurrence is not sanity.
 *  buildTable is the single choke point every path funnels through (span pass,
 *  classify rails, battery, residue), so the floor lives here: minimum length
 *  3, bare digits need 5+ (a tabled "8" or "2022" is a document-wide disaster;
 *  real short IDs ride phrase- or shape-anchored rails instead), and closed-
 *  class words never qualify no matter what nominated them. */
const FOOTPRINT_STOP = new Set(
  ('he she it its his her hers him they them their theirs we us our ours you your yours i me my mine ' +
    'the a an and or of in on at to for with from by as is are was were be been being this that these those ' +
    'other others another some any all each both into out over under more most less not no yes but if then than such per via').split(' '),
)
export function isAdmissibleFootprint(span) {
  const s = (span || '').trim()
  if (s.length < 3) return false
  if (/^\d+$/.test(s) && s.length < 5) return false
  if (!/\s/.test(s) && FOOTPRINT_STOP.has(s.toLowerCase())) return false
  return true
}
export function buildTable(entryLists) {
  const table = []
  const classCount = {}
  const seen = new Set()
  for (const entries of entryLists)
    for (const e of entries) {
      if (!isAdmissibleFootprint(e.span)) continue
      const key = e.span.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      classCount[e.cls] = (classCount[e.cls] || 0) + 1
      table.push({ ...e, tag: `[${e.cls.charAt(0) + e.cls.slice(1).toLowerCase()}${classCount[e.cls]}]` })
    }
  return table
}

/** Proper-prefix propagation (round-2 OCR lesson: one bare "LUCKY MC" print
 *  survived while "Lucky Mc Uranium Corporation" was masked). A caught
 *  PERSON/COMPANY span of 3+ tokens ALSO masks by its leading two proper
 *  tokens — the short form a document naturally falls back to. Over-masking
 *  is the safe direction; the prefix rides the parent's tag so the review
 *  table stays one row per identity. */
const PREFIX_STOP = new Set(['the', 'a', 'an', 'of', 'and', 'for', 'de', 'la', 'first', 'new', 'united'])
export function propagateProperPrefixes(table) {
  const have = new Set(table.map((e) => e.span.toLowerCase()))
  const extra = []
  for (const e of table) {
    if (e.cls !== 'COMPANY' && e.cls !== 'PERSON') continue
    const tokens = e.span.split(/\s+/)
    if (tokens.length < 3) continue
    const [a, b] = tokens
    if (!/^[\p{Lu}\d]/u.test(a) || !/^[\p{Lu}\d]/u.test(b)) continue
    if (PREFIX_STOP.has(a.toLowerCase()) || PREFIX_STOP.has(b.toLowerCase())) continue
    const prefix = `${a} ${b}`.replace(/[,.]+$/, '')
    if (!isAdmissibleFootprint(prefix) || have.has(prefix.toLowerCase())) continue
    have.add(prefix.toLowerCase())
    extra.push({ span: prefix, cls: e.cls, src: `prefix:${e.src}`, tag: e.tag })
  }
  return [...table, ...extra]
}

/** Deterministic document-wide masking: longest span first (sub-spans cannot
 *  fragment longer entities), case-insensitive, whitespace-tolerant, then the
 *  structured floor over the result. */
/** Boundary guards (2026-07-20): a footprint only matches where it is not
 *  glued to more letters/digits on either side — "Brio" must never fire
 *  inside "Briology", and the cascade's fragment-mangling class
 *  ("CHEMOTHERAPY" losing its "he") is structurally impossible. Identity
 *  content INSIDE machine tokens is the XBRL member rail's job, not
 *  substring luck. One deliberate loosening rides along, measured on the
 *  79k bench: after an honorific's period the whitespace is OPTIONAL, so a
 *  table entry "Ms. Nand" also masks the document's glued "Ms.Nand" print. */
const HONORIFIC_DOT = /^(?:Mr|Ms|Mrs|Dr|Prof|Mdm|Messrs)\.$/i
export function footprintRegex(span, flags = 'gi') {
  const tokens = span.split(/\s+/)
  const body = tokens
    .map((t, i) => escRe(t) + (i < tokens.length - 1 ? (HONORIFIC_DOT.test(t) ? '\\s*' : '\\s+') : ''))
    .join('')
  const pre = /^[\p{L}\p{N}]/u.test(span) ? '(?<![\\p{L}\\p{N}])' : ''
  const post = /[\p{L}\p{N}]$/u.test(span) ? '(?![\\p{L}\\p{N}])' : ''
  return new RegExp(pre + body + post, flags + 'u')
}
export function maskWithTable(text, table) {
  const spans = [...table].sort((a, b) => b.span.length - a.span.length)
  let out = text
  for (const s of spans) {
    out = out.replace(footprintRegex(s.span), s.tag)
  }
  return floorMask(out)
}

/** A span nominated FROM masked text that is itself a mask artifact — a tag,
 *  or a tag's bare inner word — must never enter the table. */
const MASK_TAG_RE = /\[(?:Person|Company|Brand|Address|Email|Phone|Id)\d+\]|\[(?:email|nric|card|phone|number)\]/i
const BARE_TAG_RE = /^(?:Person|Company|Brand|Address|Email|Phone|Id)\d+$/i
export const isMaskArtifact = (span) => MASK_TAG_RE.test(span) || BARE_TAG_RE.test(span)

/**
 * The whole pipeline: span pass ∪ rails → one table → deterministic mask →
 * floor. `complete(system, user, {grammar?, maxTokens?})` is the only way a
 * model is reached. Returns { masked, table, complete, stats }. `complete` is
 * the release gate: when false, a caller MUST NOT treat the document as fully
 * stripped (a model call failed somewhere) — hold the release, fail closed.
 *
 * `passes` (owner e2e, 2026-07-19): each pass after the first re-runs BOTH
 * layers over the current MASKED text — the residue of pass 1 stands against a
 * quieter document, so a second pass is a self-cleaning sweep. Every pass's
 * finds join the ONE table; the final mask is always applied to the ORIGINAL.
 */
export async function anonymizeDocument(text, complete, opts = {}) {
  const { passes = 1, ...rest } = opts
  const doc = foldFullwidth(text || '')
  const entryLists = []
  const passStats = []
  let ok = true
  let current = doc
  for (let p = 0; p < passes; p++) {
    const span = await spanPass(current, complete, rest)
    const rails = await railsPass(current, complete)
    ok = ok && span.complete && rails.complete
    const fresh = [...span.entries, ...rails.entries].filter((e) => !isMaskArtifact(e.span))
    entryLists.push(fresh)
    passStats.push({ span: span.stats, rails: rails.stats, found: fresh.length })
    current = maskWithTable(doc, buildTable(entryLists))
  }
  const table = buildTable(entryLists)
  return {
    masked: maskWithTable(doc, table),
    table,
    complete: ok,
    stats: { passes: passStats, tableSize: table.length },
  }
}
