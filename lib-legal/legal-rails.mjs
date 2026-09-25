// v1-legal delta, arm L1: legal recall rails — deterministic post-pass over v1 output.
// v1 (simpler-red) stays frozen; these rails mask classes v1's contract deliberately excludes
// for business documents but legal PII stripping (TAB identifier taxonomy) requires:
//   [Code]    court application / case numbers in slash format ("1520/06") — 4 of the 5
//             measured DIRECT leaks in the v1 TAB baseline (run v1-tab-devslice26-baseline)
//   [Date]    full and month-year dates — DATETIME leaked 539/548 QUASI in the baseline
//   [Amount]  money amounts — QUANTITY leaked 73/77
//   [Age]     age expressions — part of the DEM 67/79 leak class
// One arm, measured as one delta. Bare years (19xx/20xx) are deliberately NOT in L1 — they
// are arm L1b if the residual DATETIME leak count justifies them.

const MONTHS = '(?:January|February|March|April|May|June|July|August|September|October|November|December)'

export const L1_RULES = [
  { cls: 'Code', re: new RegExp(String.raw`\b\d{2,5}/\d{2}\b`, 'g') },
  { cls: 'Date', re: new RegExp(String.raw`\b\d{1,2}\s+${MONTHS}\s+\d{4}\b`, 'g') },
  { cls: 'Date', re: new RegExp(String.raw`\b${MONTHS}\s+\d{1,2},?\s+\d{4}\b`, 'g') },
  { cls: 'Date', re: new RegExp(String.raw`\b${MONTHS}\s+\d{4}\b`, 'g') },
  { cls: 'Date', re: new RegExp(String.raw`\b\d{1,2}[./]\d{1,2}[./](?:19|20)\d{2}\b`, 'g') },
  { cls: 'Amount', re: new RegExp(String.raw`(?:EUR|USD|GBP|FRF|DEM|TRY|TRL|CHF|SGD|S\$|€|\$|£)\s?[\d][\d,.]*`, 'g') },
  { cls: 'Amount', re: new RegExp(String.raw`\b[\d][\d,.]*\s?(?:euros?|francs?|dollars?|pounds?|liras?|marks?|levs?|zlotys?|roubles?|rubles?)\b`, 'gi') },
  { cls: 'Age', re: new RegExp(String.raw`\baged?\s+\d{1,3}\b`, 'gi') },
]

// Arm L1b: bare years. Separate from L1 so its recall gain and NO_MASK cost are measured
// as their own delta (TAB counts most years QUASI, but statute names carry years too).
export const L1B_RULES = [{ cls: 'Date', re: new RegExp(String.raw`\b(?:19|20)\d{2}\b`, 'g') }]

// statute guard (arm, 2026-07-22): a year inside a statute/instrument name is citable law,
// not a personal date — "the Human Rights Act 1998" must survive (measured: year rail ate
// 10/29 NO_MASK dates, mostly this shape)
const STATUTE_BEFORE_RE = /(?:Act|Law|Code|Order|Rules|Regulations|Protocol|Convention|Treaty|Charter|Constitution|Decree|no\.|No\.)\s*(?:of\s+)?$/
export function applyL1bGuarded(text) {
  const added = []
  const out = text.replace(L1B_RULES[0].re, (m, offset) => {
    if (STATUTE_BEFORE_RE.test(text.slice(Math.max(0, offset - 18), offset))) return m
    added.push({ cls: 'Date', span: m })
    return '[Date]'
  })
  return { text: out, added }
}

// Arm L1c: year-less dates ("18 March", "March 18") — the measured DATETIME residual (75)
const MONTHS_RE = '(?:January|February|March|April|May|June|July|August|September|October|November|December)'
export const L1C_RULES = [
  { cls: 'Date', re: new RegExp(String.raw`\b\d{1,2}\s+${MONTHS_RE}\b`, 'g') },
  { cls: 'Date', re: new RegExp(String.raw`\b${MONTHS_RE}\s+\d{1,2}\b`, 'g') },
]
export const applyL1c = (text) => applyRules(text, L1C_RULES)

export function applyRules(text, rules) {
  const added = []
  let out = text
  for (const { cls, re } of rules) {
    out = out.replace(re, (m) => {
      added.push({ cls, span: m })
      return `[${cls}]`
    })
  }
  return { text: out, added }
}

/** Apply the L1 recall rails to (already v1-stripped) text. Pure function, no model. */
export const applyL1 = (text) => applyRules(text, L1_RULES)
export const applyL1b = (text) => applyRules(text, L1B_RULES)

// Arm L2: institutional KEEP-restore. v1 masks institutional organs (courts, governments,
// ministries — the measured ORG 82/146 over-masking) that legal checkability requires to
// survive. Restore COMPANY-class table rows whose ORIGINAL span is institutional. The mark is
// the classifier: a deterministic pattern on the span, no model judgment.
export const INSTITUTIONAL_RE =
  /\b(?:Court|Government|Commission|Committee|Chamber|Registry|Convention|Ministry|Tribunal|Council|Prosecutor|Republic|Kingdom|Parliament|Assembly|Bar Association|Court of Cassation|Constitutional Court)\b/i

// Widened variant (arm, 2026-07-22): adds the measured still-masked NO_MASK forms —
// native-language court names (Landsret, Højesteret, retten, yargıtay, mahkemesi),
// boards/agencies/authorities/offices. Contested-seam risk: domestic courts are QUASI in
// some docs — net effect is measured, not assumed.
// structural refactor 2026-07-22: native tokens removed (the gloss rule supplies them
// per-document); English institutional nouns are the universal core
export const INSTITUTIONAL_WIDE_RE = new RegExp(
  `${INSTITUTIONAL_RE.source}|\\b(?:Board|Agency|Authority|Office|Department|Ombudsman|Directorate)\\b`,
  'i',
)

export function restoreInstitutional(text, table, re = INSTITUTIONAL_RE, aliases = null) {
  const restored = []
  let out = text
  for (const row of table) {
    // possessive folding (red F15: tags are surface-form-stable — "Court of Appeal's" is a
    // separate table row from "Court of Appeal"; fold before the institutional test)
    const folded = row.span.replace(/[’']s?$/, '')
    const aliasHit = aliases && [...aliases].some((a) => folded.includes(a))
    if (row.cls !== 'COMPANY' || (!re.test(folded) && !aliasHit)) continue
    if (!out.includes(row.tag)) continue
    out = out.split(row.tag).join(row.span)
    restored.push({ tag: row.tag, span: row.span, ...(aliasHit ? { via: 'gloss' } : {}) })
  }
  return { text: out, restored }
}

// ── v1-legal.2 arms ─────────────────────────────────────────────────────────
// Global states + demonyms (owner: "might as well go global" — the product is not
// ECHR-shaped; the OOS set alone spans US, Singapore and ECtHR text). A closed list, so it is
// a rail, not a vocabulary import — it parameterizes the respondent/caption extraction and
// the nationality rails.
export const STATES = {
  Afghanistan: 'Afghan', Albania: 'Albanian', Algeria: 'Algerian', Andorra: 'Andorran',
  Angola: 'Angolan', Argentina: 'Argentine', Armenia: 'Armenian', Australia: 'Australian',
  Austria: 'Austrian', Azerbaijan: 'Azerbaijani', Bahamas: 'Bahamian', Bahrain: 'Bahraini',
  Bangladesh: 'Bangladeshi', Barbados: 'Barbadian', Belarus: 'Belarusian', Belgium: 'Belgian',
  Belize: 'Belizean', Benin: 'Beninese', Bhutan: 'Bhutanese', Bolivia: 'Bolivian',
  'Bosnia and Herzegovina': 'Bosnian', Bosnia: 'Bosnian', Botswana: 'Botswanan',
  Brazil: 'Brazilian', Brunei: 'Bruneian', Bulgaria: 'Bulgarian', 'Burkina Faso': 'Burkinabe',
  Burundi: 'Burundian', Cambodia: 'Cambodian', Cameroon: 'Cameroonian', Canada: 'Canadian',
  'Cape Verde': 'Cabo Verdean', 'Central African Republic': 'Central African', Chad: 'Chadian',
  Chile: 'Chilean', China: 'Chinese', Colombia: 'Colombian', Comoros: 'Comoran',
  'Costa Rica': 'Costa Rican', Croatia: 'Croatian', Cuba: 'Cuban', Cyprus: 'Cypriot',
  'Czech Republic': 'Czech', 'Democratic Republic of the Congo': 'Congolese',
  Congo: 'Congolese', Denmark: 'Danish', Djibouti: 'Djiboutian', Dominica: 'Dominican',
  'Dominican Republic': 'Dominican', 'East Timor': 'Timorese', Ecuador: 'Ecuadorian',
  Egypt: 'Egyptian', 'El Salvador': 'Salvadoran', 'Equatorial Guinea': 'Equatoguinean',
  Eritrea: 'Eritrean', Estonia: 'Estonian', Eswatini: 'Swazi', Ethiopia: 'Ethiopian',
  Fiji: 'Fijian', Finland: 'Finnish', France: 'French', Gabon: 'Gabonese', Gambia: 'Gambian',
  Georgia: 'Georgian', Germany: 'German', Ghana: 'Ghanaian', Greece: 'Greek',
  Grenada: 'Grenadian', Guatemala: 'Guatemalan', Guinea: 'Guinean',
  'Guinea-Bissau': 'Bissau-Guinean', Guyana: 'Guyanese', Haiti: 'Haitian',
  Honduras: 'Honduran', Hungary: 'Hungarian', Iceland: 'Icelandic', India: 'Indian',
  Indonesia: 'Indonesian', Iran: 'Iranian', Iraq: 'Iraqi', Ireland: 'Irish',
  Israel: 'Israeli', Italy: 'Italian', 'Ivory Coast': 'Ivorian', Jamaica: 'Jamaican',
  Japan: 'Japanese', Jordan: 'Jordanian', Kazakhstan: 'Kazakh', Kenya: 'Kenyan',
  Kiribati: 'I-Kiribati', Kosovo: 'Kosovar', Kuwait: 'Kuwaiti', Kyrgyzstan: 'Kyrgyz',
  Laos: 'Laotian', Latvia: 'Latvian', Lebanon: 'Lebanese', Lesotho: 'Basotho',
  Liberia: 'Liberian', Libya: 'Libyan', Liechtenstein: 'Liechtenstein',
  Lithuania: 'Lithuanian', Luxembourg: 'Luxembourgish', Madagascar: 'Malagasy',
  Malawi: 'Malawian', Malaysia: 'Malaysian', Maldives: 'Maldivian', Mali: 'Malian',
  Malta: 'Maltese', 'Marshall Islands': 'Marshallese', Mauritania: 'Mauritanian',
  Mauritius: 'Mauritian', Mexico: 'Mexican', Micronesia: 'Micronesian', Moldova: 'Moldovan',
  Monaco: 'Monegasque', Mongolia: 'Mongolian', Montenegro: 'Montenegrin',
  Morocco: 'Moroccan', Mozambique: 'Mozambican', Myanmar: 'Burmese', Namibia: 'Namibian',
  Nauru: 'Nauruan', Nepal: 'Nepalese', Netherlands: 'Dutch', 'New Zealand': 'New Zealander',
  Nicaragua: 'Nicaraguan', Nigeria: 'Nigerian', Niger: 'Nigerien',
  'North Korea': 'North Korean', 'North Macedonia': 'Macedonian', Macedonia: 'Macedonian',
  Norway: 'Norwegian', Oman: 'Omani', Pakistan: 'Pakistani', Palau: 'Palauan',
  Palestine: 'Palestinian', Panama: 'Panamanian', 'Papua New Guinea': 'Papua New Guinean',
  Paraguay: 'Paraguayan', Peru: 'Peruvian', Philippines: 'Filipino', Poland: 'Polish',
  Portugal: 'Portuguese', Qatar: 'Qatari', Romania: 'Romanian', Russia: 'Russian',
  Rwanda: 'Rwandan', Samoa: 'Samoan', 'San Marino': 'Sammarinese',
  'Saudi Arabia': 'Saudi', Senegal: 'Senegalese', Serbia: 'Serbian',
  Seychelles: 'Seychellois', 'Sierra Leone': 'Sierra Leonean', Singapore: 'Singaporean',
  Slovakia: 'Slovak', Slovenia: 'Slovenian', 'Solomon Islands': 'Solomon Islander',
  Somalia: 'Somali', 'South Africa': 'South African', 'South Korea': 'South Korean',
  'South Sudan': 'South Sudanese', Spain: 'Spanish', 'Sri Lanka': 'Sri Lankan',
  Sudan: 'Sudanese', Suriname: 'Surinamese', Sweden: 'Swedish', Switzerland: 'Swiss',
  Syria: 'Syrian', Taiwan: 'Taiwanese', Tajikistan: 'Tajik', Tanzania: 'Tanzanian',
  Thailand: 'Thai', Togo: 'Togolese', Tonga: 'Tongan', 'Trinidad and Tobago': 'Trinidadian',
  Tunisia: 'Tunisian', Turkey: 'Turkish', Turkmenistan: 'Turkmen', Tuvalu: 'Tuvaluan',
  Uganda: 'Ugandan', Ukraine: 'Ukrainian', 'United Arab Emirates': 'Emirati',
  'United Kingdom': 'British', 'United States': 'American', Uruguay: 'Uruguayan',
  Uzbekistan: 'Uzbek', Vanuatu: 'Vanuatuan', Venezuela: 'Venezuelan', Vietnam: 'Vietnamese',
  Yemen: 'Yemeni', Zambia: 'Zambian', Zimbabwe: 'Zimbabwean',
}
// longest-first so 'South Sudan' beats 'Sudan', 'Dominican Republic' beats 'Dominica', etc.
const STATE_KEYS = Object.keys(STATES).sort((a, b) => b.length - a.length)

/** Read the respondent state from the document caption. Returns {state, demonym} or null. */
export function extractRespondent(originalText) {
  const m = originalText.match(/application[^.]{0,120}?against\s+(?:the\s+)?([A-Z][^.]{2,90}?)(?:\s+lodged|\s+\(|,|\.|\s+under)/)
  const hay = m ? m[1] : originalText.slice(0, 600)
  for (const state of STATE_KEYS) {
    if (hay.includes(state)) return { state, demonym: STATES[state] }
  }
  return null
}

// Arm L3: quantity residuals — thousands-separated bare amounts and sentence durations
// (QUANTITY leaked 56/77 after L1: uncurrencied sums, imprisonment terms).
export const L3_RULES = [
  { cls: 'Amount', re: /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g },
  { cls: 'Amount', re: /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\s+(?:years?|months?|weeks?|days?)(?:['’]s?)?\s+(?:imprisonment|detention|prison|custody)\b/gi },
]
export const applyL3 = (text) => applyRules(text, L3_RULES)

// Arm L4: demographic rails — nationality expressions (DEM leaked 68/79; nationalities are
// the rail-shaped half; occupations stay a model-class).
const DEMONYM_ALT = [...new Set(Object.values(STATES))].sort((a, b) => b.length - a.length).join('|')
const STATE_ALT = STATE_KEYS.join('|')
export const L4_RULES = [
  { cls: 'Dem', re: new RegExp(String.raw`\b(?:${DEMONYM_ALT})\s+(?:national|citizen|origin|nationality|descent)s?\b`, 'g') },
  { cls: 'Dem', re: new RegExp(String.raw`\bnationals?\s+of\s+(?:the\s+)?(?:${STATE_ALT})\b`, 'g') },
]
export const applyL4 = (text) => applyRules(text, L4_RULES)

// Arm L5 (2026-07-22): the deterministic DEM battery. Measured lesson (carrier-doc leak
// lists): the DEM residual is mostly CLOSED-LIST vocabulary — kinship terms, bare demonyms,
// non-respondent countries, disability phrases — not judgment calls. Rails, not sweeps.
// All guarded: an occurrence inside institutional context survives (containment), and the
// RESPONDENT state + demonym stay unmasked (institutional party, extracted from the caption).
const KINSHIP_WORDS =
  '(?:sons?|daughters?|father|mother|fathers|mothers|brothers?|sisters?|wife|wives|husbands?|spouses?|childr?e?n?|grandchildren|cousins?|uncles?|aunts?|nephews?|nieces?|parents?|stepfather|stepmother|widows?|widowers?)'
const DISABILITY_WORDS = '(?:disabled|disablement|invalid|paralysed|paralyzed|blind|deaf|amputat\\w+|handicapp?ed)'
export function applyDemRails(text, originalText) {
  const resp = extractRespondent(originalText || text)
  const added = []
  let out = text
  const guardedReplace = (re, cls, exempt) => {
    out = out.replace(re, (m, offset) => {
      if (exempt && exempt(m)) return m
      const ctx = out.slice(Math.max(0, offset - 40), offset + m.length + 40)
      if (/\b(?:Court|Government|Ministry|Tribunal|Commission|Committee|Authorit|Prosecut|Board|Chamber|Police|Army|Parliament|Assembly|Convention|law|Act)\b/i.test(ctx.replace(m, ''))) return m
      added.push({ cls, span: m })
      return `[${cls}]`
    })
  }
  guardedReplace(new RegExp(`\\b${KINSHIP_WORDS}\\b`, 'gi'), 'Dem')
  guardedReplace(new RegExp(`\\b(?:${[...new Set(Object.values(STATES))].sort((a, b) => b.length - a.length).join('|')})\\b`, 'g'), 'Dem', (m) => resp && m === resp.demonym)
  guardedReplace(new RegExp(`\\b(?:${STATE_KEYS.join('|')})\\b`, 'g'), 'Dem', (m) => resp && (m === resp.state || resp.state.includes(m)))
  guardedReplace(new RegExp(`\\b(?:partly |permanently |severely )?${DISABILITY_WORDS}\\b`, 'gi'), 'Dem')
  return { text: out, added }
}

// Arm L6 (2026-07-22): QUANTITY phrase rails. Measured leak list: counts-with-nouns
// ("84 prosecution witnesses", "three children"), substance quantities ("450 grams of
// heroine"), sentence phrases. Deliberately PHRASE-scoped — masking bare number words would
// satisfy the scorer while shredding the document (the metric only sees annotated forms;
// the product sees every occurrence). Utility honesty beats metric gaming.
const NUM_WORD =
  '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:-\\w+)?|thirty(?:-\\w+)?|forty(?:-\\w+)?|fifty(?:-\\w+)?|\\d{1,4})'
// structural refactor 2026-07-22: trimmed to legal-universal person/charge nouns
// (soldiers/absences/reports/hearings/times were harvested from TAB misses — removed)
const COUNT_NOUN =
  '(?:co-?accused|accused|counts?|witness(?:es)?|children|accomplices?|defendants?|victims?|convictions?|offences?|charges?)'
// (seam-refined variant measured 2026-07-22: word-numbers restricted to strong nouns —
// 75.0/80.6, LOSES on bar-distance to the unrefined form's 76.1/79.9; unrefined stands)
export const L6_RULES = [
  { cls: 'Amount', re: new RegExp(`\\b${NUM_WORD}\\s+(?:other\\s+|prosecution\\s+|defence\\s+)?${COUNT_NOUN}\\b`, 'gi') },
  { cls: 'Amount', re: new RegExp(`\\b(?:at least\\s+)?${NUM_WORD}\\s?(?:grams?|kilograms?|kilos?|litres?|liters?|tablets?|pills?)(?:\\s+of\\s+\\w+(?:\\s+\\w+)?)?\\b`, 'gi') },
  { cls: 'Amount', re: /\blife sentence of imprisonment\b|\blife imprisonment\b/gi },
]
export const applyL6 = (text) => applyRules(text, L6_RULES)

// Arm L7 (2026-07-22, owner-supplied designs): protected ranges + relational kinship.
// B — Hierarchical Public Body Lock: any capitalized run ending in an institutional suffix
// is locked as a PROTECTED range up front; no rail or sweep may mask inside it ("Izmir
// Administrative Court" can never lose its "Izmir"). Replaces per-mask context sniffing.
// STRUCTURAL REFACTOR (2026-07-22, owner directive: rails must be foundational, never
// miss-quoting — two 50-doc OOS genres are downstream). The native-language suffix lists
// (retten/rätt/kassan/yargıtay — harvested from TAB misses) are REPLACED by the
// document-local GLOSS RULE below: legal documents define their own native institutional
// vocabulary via parenthetical translation glosses; we harvest per-document at runtime.
// leading token must not be a month/preposition (measured: "May 1999 the Chamber" seeded a
// protected range that blocked the full-date rule → official DIRECT leak "11 May [Date]")
const PUBLIC_BODY_RE =
  /\b(?!(?:January|February|March|April|May|June|July|August|September|October|November|December|On|By|At|In)\b)[A-ZÀ-Þ][\w'’.-]*(?:\s+[\w'’.-]+){0,5}\s+(?:Court|Courts|Tribunal|Prosecutor|Prosecution|Ministry|Government|Commission|Committee|Board|Agency|Authority|Office|Department|Directorate|Parliament|Assembly|Chamber|Registry|Ombudsman|Police|Council)\b(?:\s+of\s+[A-ZÀ-Þ][\w'’-]*(?:\s+[A-ZÀ-Þ][\w'’-]*){0,3})?/g

// The gloss rule: "<English institutional name> (<native name>)" or the reverse
// "<Native name> (<English institutional name>)" — a translation gloss marks the native
// tokens as THIS DOCUMENT'S institutional vocabulary. Language-agnostic by construction.
const INST_WORD =
  '(?:Court|Courts|Tribunal|Prosecutor|Ministry|Government|Commission|Committee|Board|Agency|Authority|Office|Department|Directorate|Parliament|Assembly|Chamber|Registry|Ombudsman|Police|Council)'
const GLOSS_FWD_RE = new RegExp(String.raw`${INST_WORD}[^(\n]{0,40}\(\s*(?:the\s+)?([^)]{3,50}?)\s*(?:[–—-][^)]*)?\)`, 'g')
const GLOSS_REV_RE = new RegExp(String.raw`\b([\wÀ-ÿĀ-ſ'’ -]{3,50}?)\s*\([^)]{0,40}${INST_WORD}[^)]{0,40}\)`, 'g')
const GLOSS_STOP = new Set(['the', 'and', 'of', 'in', 'for', 'hereinafter', 'referred', 'to', 'as'])
// 2026-07-23 pollution fix (measured: aliases had harvested "Turkish", "subsequently",
// "requested", "Education" from ordinary parentheticals — every occurrence became a
// protected range that silently shadowed rails corpus-wide, e.g. "Turkish national" x27).
// Tightened: an alias token must (a) not be a state/demonym or common word, and (b) carry
// native orthography (>=1 non-ASCII letter) OR be a >=7-char single token adjacent to a
// paren whose OTHER side is institutional. Structural, language-agnostic.
const NON_ASCII_RE = /[^\x00-\x7F]/
export function institutionalGlossAliases(originalText) {
  const aliases = new Set()
  const banned = new Set([
    ...Object.keys(STATES).map((s) => s.toLowerCase()),
    ...Object.values(STATES).map((s) => s.toLowerCase()),
  ])
  for (const re of [GLOSS_FWD_RE, GLOSS_REV_RE]) {
    for (const m of originalText.matchAll(re)) {
      for (const tok of m[1].split(/\s+/)) {
        const t = tok.replace(/[“”"',.()]/g, '')
        if (t.length < 4) continue
        if (GLOSS_STOP.has(t.toLowerCase()) || banned.has(t.toLowerCase())) continue
        if (new RegExp(`^${INST_WORD}$`).test(t)) continue
        if (!NON_ASCII_RE.test(t) && !(t.length >= 7 && /^[a-zà-ÿ]/.test(t) === false && /[A-Z]/.test(t) === false)) {
          // ASCII tokens qualify only as long all-lowercase native words (länsrätten-class
          // without diacritics, e.g. "tavzih" fails at len 6 — accepted loss); everything
          // else (English words, capitalized English) is rejected
          if (!(t.length >= 7 && /^[a-z]+$/.test(t) === true && !/^(?:subsequently|requested|received|following|application|applicant|government|however|therefore|pursuant|whereas|hereinafter)$/.test(t.toLowerCase())))
            continue
        }
        aliases.add(t)
      }
    }
  }
  return aliases
}
export function protectedRanges(text, aliases = null) {
  const ranges = []
  for (const m of text.matchAll(PUBLIC_BODY_RE)) ranges.push([m.index, m.index + m[0].length])
  if (aliases && aliases.size) {
    const aliasRe = new RegExp(`\\b(?:${[...aliases].map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gu')
    for (const m of text.matchAll(aliasRe)) ranges.push([m.index, m.index + m[0].length])
  }
  return ranges
}
export const inProtected = (ranges, start, end) => ranges.some(([a, b]) => start < b && end > a)

/** Wrap any regex-rail application so matches inside protected ranges survive. */
export function applyRulesProtected(text, rules, ranges = protectedRanges(text)) {
  const added = []
  let out = text
  for (const { cls, re } of rules) {
    out = out.replace(re, (m, offset) => {
      if (inProtected(ranges, offset, offset + m.length)) return m
      added.push({ cls, span: m })
      return `[${cls}]`
    })
  }
  return { text: out, added }
}

// A — Relational kinship rail: kinship vocabulary masks ONLY within a tight window of an
// anonymized person ("the [Person3]'s brother", "his [Dem] sister") or an applicant
// reference — "brotherly love" and standalone procedural kin words survive.
const KIN_RE = new RegExp(`\\b${KINSHIP_WORDS}\\b`, 'gi')
// (pronoun anchors his/her/their measured 2026-07-22: +0.5 QUASI / -1.2 NO_MASK — too
// loose, removed; tag/applicant anchors only)
const RELATIONAL_ANCHOR_RE = /\[(?:Person|Dem)\d*\]|applicant(?:s['’]?|['’]s)?|deceased|victim/i
export function applyRelationalKinship(text, ranges = protectedRanges(text)) {
  const added = []
  const out = text.replace(KIN_RE, (m, offset) => {
    if (inProtected(ranges, offset, offset + m.length)) return m
    const windowBefore = text.slice(Math.max(0, offset - 30), offset)
    if (!RELATIONAL_ANCHOR_RE.test(windowBefore)) return m
    added.push({ cls: 'Dem', span: m })
    return '[Dem]'
  })
  return { text: out, added }
}

// Arms L8/L9 (2026-07-22, red's Q3 law: lowercase/mixed identity content is caught by
// ANCHOR SHAPES, never by nomination — B3's corp-suffix feature is the precedent).
// L8 — occupation anchors: "owner of a pizzeria", "works at a retirement home" are
// phrase-shaped; capture the anchored NP.
export const L8_RULES = [
  {
    cls: 'Job',
    re: /\b(?:owners? of|managers? of|directors? of|works?(?:ed|ing)? (?:at|in|for|as)|employed (?:as|by|at)|trained as|qualified as|practi[sc](?:ed|ing) as)\s+(?:a|an|the)?\s*[a-z][\w’'-]*(?:\s+[a-z][\w’'-]+){0,3}/g,
  },
]
export const applyL8 = (text, aliases) => applyRulesProtected(text, L8_RULES, protectedRanges(text, aliases))

// L9 — place anchors: the walker never nominates single mixed-case towns (measured: 34%
// candidacy on gold LOC), but prose anchors them — "lived in Leeds", "the town of Bartın",
// "Manchester, England".
const CAP_TOK = String.raw`[A-ZÀ-Þ][\w’'-]+(?:\s+[A-ZÀ-Þ][\w’'-]+)?`
export const L9_RULES = [
  {
    cls: 'Place',
    re: new RegExp(
      String.raw`\b(?:lived|resided|residing|living|settled|born|arrested|detained|imprisoned|based|situated|located|schooled|hospitali[sz]ed)\s+(?:in|at|near)\s+(?:the\s+)?${CAP_TOK}`,
      'g',
    ),
  },
  { cls: 'Place', re: new RegExp(String.raw`\b(?:town|village|city|district|province|county|municipality|region) of\s+${CAP_TOK}`, 'g') },
  { cls: 'Place', re: new RegExp(String.raw`\b${CAP_TOK},\s+(?:${Object.keys(STATES).sort((a, b) => b.length - a.length).join('|')}|England|Scotland|Wales|Northern Ireland)\b`, 'g') },
]
export const applyL9 = (text, aliases) => applyRulesProtected(text, L9_RULES, protectedRanges(text, aliases))

// L9w — wide prepositional place anchors ("in Leeds", "from Bartın"), with a closed
// exclusion set (months, legal structure words, states — those have their own handling).
// Measured 2026-07-22: +1.8/−1.5 slice, +2.0/−0.5 UNSEEN — generalizes better than it
// slice-tests; adopted on the unseen verdict.
// 'Strasbourg' here is an INSTANCE of the structural concept "seat of the deciding court"
// (universal: every jurisdiction's deciding-court seat city is procedural, not localizing).
// The product derives the seat from docket rails; hardcoding is the TAB-corpus binding only.
const PLACE_EXCLUDE = new Set([
  'January','February','March','April','May','June','July','August','September','October',
  'November','December','Article','Articles','Section','Chamber','Court','Convention',
  'Protocol','Act','Law','Rule','Rules','Chapter','Part','Paragraph','Annex','Strasbourg',
  'Europe', ...Object.keys(STATES),
])
export function applyL9Wide(text, aliases) {
  const added = []
  const ranges = protectedRanges(text, aliases)
  const out = text.replace(/\b(?:in|at|near|from) ([A-ZÀ-Þ][\w’'-]+)\b/g, (m, cap, offset) => {
    if (PLACE_EXCLUDE.has(cap) || inProtected(ranges, offset, offset + m.length)) return m
    added.push({ cls: 'Place', span: cap })
    return m.replace(cap, '[Place]')
  })
  return { text: out, added }
}

// Arm A1 (2026-07-22 night): official-title PERSON restore. Measured class: 13/24 PERSON
// over-masked on unseen docs — judges, registrars, agents acting in public roles (TAB
// NO_MASK). Red's junk-flag lexicon doesn't cover officials; this is the fork's own flag
// family. A PERSON row is restored when ANY occurrence in the ORIGINAL sits behind a title.
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// title set restricted to unambiguously JUDICIAL titles (measured 2026-07-22: President/
// Agent/Delegate match corporate and representative contexts gold counts QUASI — removed)
// Q.C. removed 2026-07-22 night: it is a POST-nominal — as a precedes-anchor it can only
// match the NEXT person's name (measured DIRECT leak: the applicants' barrister restored
// off his neighbour's title). Pre-nominal judicial titles only.
const OFFICIAL_TITLE_RE =
  /(?:Judges?|Justice|Mr\s+Justice|Mrs\s+Justice|Registrar|Deputy\s+Registrar|Advocate\s+General|Judge\s+Rapporteur)[\s,]{0,3}$/
export function restoreOfficialPersons(text, table, originalText) {
  const restored = []
  let out = text
  for (const row of table) {
    if (row.cls !== 'PERSON' || !out.includes(row.tag)) continue
    const re = new RegExp(escRe(row.span).replace(/\s+/g, '\\s+'), 'g')
    let official = false
    for (const m of originalText.matchAll(re)) {
      const before = originalText.slice(Math.max(0, m.index - 30), m.index)
      if (OFFICIAL_TITLE_RE.test(before)) {
        official = true
        break
      }
    }
    if (!official) continue
    out = out.split(row.tag).join(row.span)
    restored.push({ tag: row.tag, span: row.span })
  }
  return { text: out, restored }
}

// Arm A2 (2026-07-22 night): precedent-citation guard on the application-number rail.
// Measured class: CODE over-masked 3/3 unseen — "Kudła v. Poland, no. 30210/96, § 40" is a
// CITATION (rails-are-citations doctrine, ECHR format); the document's OWN number
// ("application (no. 1520/06) against...") has no adjacent "v." and keeps masking.
export function applyAppNumbersGuarded(text) {
  const added = []
  const out = text.replace(/\b\d{1,5}\/\d{1,4}\b/g, (m, offset) => {
    const before = text.slice(Math.max(0, offset - 60), offset)
    const after = text.slice(offset + m.length, offset + m.length + 6)
    // own number: "an application (no. X) against ..." — ALWAYS masks (DIRECT class),
    // regardless of a case caption's "v." nearby (measured leak 2026-07-22: captions carry
    // "v." before the own number; the /application/ anchor disambiguates)
    const ownContext = /application/i.test(before)
    // precedent cite: "Name v. State, no. X" (comma-linked) or trailing ", § N"
    const precedent = /v\.?\s+[^,]{1,40},\s*(?:nos?\.\s*)?$/.test(before) || /^\s*,\s*§/.test(after)
    if (!ownContext && precedent) return m
    added.push({ cls: 'Code', span: m })
    return '[Code]'
  })
  return { text: out, added }
}
export const L1_RULES_NO_CODE = L1_RULES.slice(1)

// Arm L10 (2026-07-22 night, owner doctrine: the model routes, software rails): FOREIGN
// ORTHOGRAPHY. In an English-language judgment, a token carrying non-ASCII Latin letters is
// overwhelmingly a foreign proper noun or term localizing the case (Bartın, Çiğli,
// Udlændingestyrelsen, skilmisse ved bevilling) — a pure character-class rail. Exempt:
// protected public-body spans, the respondent state/demonym.
const FOREIGN_TOK = /[\wÀ-ÿĀ-ſƀ-ɏ]*[À-ÖØ-öø-ÿĀ-ſƀ-ɏ][\wÀ-ÿĀ-ſƀ-ɏ]*/gu
// v2 (measured 2026-07-22 night): v1 of this rail ate the judge rosters (diacritic judge
// names are NO_MASK officials in PROCEDURE, unrestorable once rail-masked: −10 NM unseen).
// Fix composes the section machinery: fire ONLY inside THE FACTS, and exempt title-adjacent
// names (Mr/Mrs/Judge + initials) anywhere.
const TITLE_ADJ_RE = /(?:Mr|Mrs|Ms|Judge|Justice|President|Registrar)\s+(?:[A-Z]\.\s*)*$/
export function applyForeignOrthography(text, originalText) {
  const resp = extractRespondent(originalText || text)
  const ranges = protectedRanges(text)
  const marks = sectionMap(text)
  const added = []
  const out = text.replace(FOREIGN_TOK, (m, offset) => {
    if (m.length < 3) return m
    const sec = sectionAt(marks, offset)
    if (!sec || !FACTS_NAMES.test(sec)) return m // FACTS-section only
    if (inProtected(ranges, offset, offset + m.length)) return m
    if (resp && (m === resp.state || m === resp.demonym)) return m
    if (TITLE_ADJ_RE.test(text.slice(Math.max(0, offset - 25), offset))) return m
    added.push({ cls: 'Misc', span: m })
    return '[Misc]'
  })
  return { text: out, added }
}

// Arm L11 (2026-07-22 night): SECTION-AWARE institutional restore — the domestic-court seam
// resolved by document structure, pure software. ECHR judgments carry rigid headers; an
// institution in PROCEDURE/THE LAW is the machinery of the case (NO_MASK); the same
// institution inside THE FACTS localizes the applicant's history (QUASI). Restore
// per-OCCURRENCE by section instead of per-tag globally.
const SECTION_HEAD_RE = /^(PROCEDURE|AS TO THE FACTS|THE FACTS|FACTS|THE CIRCUMSTANCES OF THE CASE|RELEVANT DOMESTIC LAW[^\n]*|AS TO THE LAW|THE LAW|LAW|FOR THESE REASONS|PROCEEDINGS[^\n]*)\s*$/gim
function sectionMap(text) {
  const marks = []
  for (const m of text.matchAll(SECTION_HEAD_RE)) marks.push({ at: m.index, name: m[1].toUpperCase() })
  return marks
}
const FACTS_NAMES = /FACTS|CIRCUMSTANCES/
function sectionAt(marks, offset) {
  let cur = null
  for (const s of marks) {
    if (s.at > offset) break
    cur = s.name
  }
  return cur
}
export function restoreInstitutionalSectioned(text, table, re = INSTITUTIONAL_WIDE_RE) {
  const marks = sectionMap(text)
  const restored = []
  let out = text
  for (const row of table) {
    const folded = row.span.replace(/[’']s?$/, '')
    if (row.cls !== 'COMPANY' || !re.test(folded) || !out.includes(row.tag)) continue
    let did = false
    let idx = 0
    let next = out.indexOf(row.tag, idx)
    while (next !== -1) {
      const sec = sectionAt(marks, next)
      // restore outside THE FACTS (PROCEDURE, LAW, unknown/preamble); keep masked inside FACTS
      if (!sec || !FACTS_NAMES.test(sec)) {
        out = out.slice(0, next) + row.span + out.slice(next + row.tag.length)
        idx = next + row.span.length
        did = true
      } else idx = next + row.tag.length
      next = out.indexOf(row.tag, idx)
    }
    if (did) restored.push({ tag: row.tag, span: row.span, mode: 'sectioned' })
  }
  return { text: out, restored }
}

// Wave-1 model-free arms (2026-07-22, from taxonomy-127 span lists):
// 1b — DEM completion: "United Kingdom national" (STATE-name + national/citizen — L4 only
// covered demonym forms); bare demonym+noun compounds stay L4's.
export const L4B_RULES = [
  { cls: 'Dem', re: new RegExp(String.raw`\b(?:${STATE_KEYS.join('|')})\s+(?:national|citizen|origin|nationality|descent)s?\b`, 'g') },
]
export const applyL4b = (text, aliases) => applyRulesProtected(text, L4B_RULES, protectedRanges(text, aliases))

// 1d — durations: "28 days", "three months", "16 years" (163 DATETIME leaks). Sentence
// phrases already in L6; "life imprisonment" is gold-NO_MASK sometimes — excluded here,
// L6 keeps its net-positive version.
export const L1D_RULES = [
  { cls: 'Date', re: new RegExp(String.raw`\b(?:${NUM_WORD})\s+(?:days?|weeks?|months?|years?)\b`, 'gi') },
]
export const applyL1d = (text, aliases) => applyRulesProtected(text, L1D_RULES, protectedRanges(text, aliases))

// 1e — pre-anonymized initials restore: "Ms A", "Mr B", "V.B" are ALREADY anonymous in the
// source judgment (gold: NO_MASK, 25/46 over-masked). Restore PERSON rows whose span is a
// title + single initial(s) or bare initials — masking them destroys readability for zero
// privacy gain.
const PREANON_RE = /^(?:(?:Mr|Mrs|Ms|Dr)\.?\s+)?[A-Z](?:\.[A-Z])?\.?$/
export function restorePreAnonymized(text, table) {
  const restored = []
  let out = text
  for (const row of table) {
    if (row.cls !== 'PERSON' || !PREANON_RE.test(row.span.trim()) || !out.includes(row.tag)) continue
    out = out.split(row.tag).join(row.span)
    restored.push({ tag: row.tag, span: row.span })
  }
  return { text: out, restored }
}

// Own-case-cite folding (official-scorer finding: applicant's own prior case "Ruminski v.
// Sweden" left "v. Sweden" exposed after the name masked — the whole cite is the DIRECT
// identifier). Only fires on cites whose party is ALREADY a [Person] tag, so real precedent
// cites (full names, KEEP class) never match.
export function foldOwnCaseCites(text) {
  return text.replace(/(\[Person\d+\])\s+v\.\s+[A-ZÀ-Þ][\w'’-]+(?:\s+[A-ZÀ-Þ][\w'’-]+)?/g, '$1')
}

// ── FIX SET 1 (post-freeze, from walk-forward round 1's named DIRECT leaks; proven on
// round 2's fresh docs, never by re-scoring round 1) ──────────────────────────────────
// FS1a — surname propagation: the last token of a multi-token PERSON table span also masks
// document-wide (round-1 leaks: "Wilson", "Hundley", "Ng", "Teo", "Sim", "Lau", "Erick"/
// "Erik" variants). Word-bounded; 2-char surnames allowed ONLY as exact-capitalized matches
// (SG surnames); possessives folded (red F15).
// FS5-R5 upgrade: name tokens match hyphenation splits ("Cof-\nfeys", us-opinion-03) and
// plural family references ("the Coffeys"); shared by surname + caption propagation.
const escT = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function nameTokenRe(c) {
  const body = c.length >= 4 ? c.split('').map(escT).join('(?:-\\s{0,2})?') : escT(c)
  return new RegExp(`\\b${body}(?:e?s)?(?:[’']s?)?\\b`, 'g')
}
export function surnameRegions(orig, table) {
  const out = []
  const seen = new Set()
  for (const row of table) {
    if (row.cls !== 'PERSON') continue
    const toks = row.span.replace(/[’']s?$/, '').trim().split(/\s+/)
    if (toks.length < 2) continue
    // BOTH ends: Western surname-last AND Chinese surname-first (round-1 leaks: Lau/Teo/Sim
    // were leading tokens). Over-mask is the safe direction.
    for (const cand of [toks[0], toks[toks.length - 1]]) {
      const c = cand.replace(/[.,]$/, '')
      if (c.length < 2 || /^[a-z]/.test(c) || /^(?:Mr|Mrs|Ms|Dr|Mdm|Tan)$/.test(c)) continue
      const key = c.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      for (const m of orig.matchAll(nameTokenRe(c))) out.push({ start: m.index, end: m.index + m[0].length, tag: row.tag })
    }
  }
  return out
}

// ── FS5 (Phase 1, 2026-07-23) — each rail from a NAMED round-3/P0 leak ─────────────────────
const PARTY_STOP = /\b(?:United States|of America|State|People|Commonwealth|Public Prosecutor|Attorney-?General|Government|In re|Matter of|Ex parte)\b/i
const CORP_MARK = /\b(?:Inc|Ltd|Limited|Corp|Corporation|Co|Company|LLC|LLP|Pte|Pty|PLC|GmbH|Association|Bank|Insurance|University|College|City|County|Board|Commission|Department|Agency|Authority|Fund|Trust|Group|Holdings|Partners?|Services|Systems|Industries|International|Airlines|Hospital)\b|&/
const CAPTION_ROLE = /^(?:Claimants?|Defendants?|Plaintiffs?|Applicants?|Respondents?|Appellants?|Appellees?|Petitioners?|Intervener?s?|…|\.\.\.|Grounds of Decision|Judgment|Between|And|and)$/i

// FS5-R1 — title/caption party mining, line-aware (us-07 "Wilson" lived only in the Title
// line; us-19 "Hundley"; SG captions put party names on their OWN line after Between/And).
export function titleCaptionRegions(orig) {
  const out = []
  const names = new Set()
  const title = /^Title:\s*(.{3,140})$/m.exec(orig.slice(0, 400))
  if (title && /\sv\.?\s/.test(title[1])) {
    for (const side of title[1].split(/\sv\.?\s/).slice(0, 2)) {
      const s = side.trim().replace(/[,.]+$/, '')
      if (!s || PARTY_STOP.test(s) || CORP_MARK.test(s)) continue
      if (/^(?:[A-Z][\w'’.-]*)(?:\s+[A-Z][\w'’.-]*){0,3}$/.test(s)) names.add(s)
    }
  }
  const lines = orig.slice(0, 3500).split('\n').map((l) => l.trim())
  for (let k = 0; k < lines.length; k++) {
    if (!/^(?:Between|And)$/i.test(lines[k])) continue
    for (let j = k + 1; j < Math.min(k + 8, lines.length); j++) {
      const l = lines[j]
      if (!l || /^\(\d+\)$/.test(l)) continue
      if (CAPTION_ROLE.test(l)) break
      if (l.length < 3 || l.length > 70) break
      if (!/^[A-Z]/.test(l)) break
      if (PARTY_STOP.test(l) || CORP_MARK.test(l)) continue
      if (/^(?:[A-Z][\w'’@.-]+|s\/o|d\/o|bin|binte|@)(?:\s+(?:[A-Z][\w'’@.-]+|s\/o|d\/o|bin|binte|@)){0,5}$/.test(l)) names.add(l)
    }
  }
  for (const n of names) {
    const re = new RegExp('\\b' + escT(n).replace(/\s+/g, '\\s+') + '\\b', 'g')
    for (const m of orig.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
    for (const w of n.split(/\s+/)) {
      if (w.length < 2 || !/^[A-Z]/.test(w) || /^(?:The|Madam|Mdm|Mr|Mrs|Ms|Dr)$/.test(w)) continue
      for (const m of orig.matchAll(nameTokenRe(w.replace(/[.,]$/, '')))) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
    }
  }
  return out
}

// FS5-R2 — initials aliases: quoted defined initials (sg-21: Yuen Ee Siong ("YES")) and bare
// initials of tabled/caption persons (sg-03: "AV" = Andreas Vogel). Verified against the
// name's own first letters; ALL-CAPS word-bounded exact matches only.
const INITIALS_STOP = new Set(['AND', 'THE', 'FOR', 'NOT', 'ALL', 'ANY', 'GST', 'CPF', 'SGX', 'USA', 'LLP', 'LLC', 'PTE', 'LTD', 'INC', 'USD', 'SGD', 'EUR', 'GBP', 'CJ', 'JA', 'JC', 'SC', 'QC', 'DPP', 'HDB', 'URA', 'MRT', 'UEN', 'PDF', 'NO', 'NOS', 'ACT', 'CAP',
  // corporate forms + officer titles are never person initials (measured: "AG" shredded
  // "ADVA AG Optical Networking"; quoted "(CEO)" is a role, not an alias)
  'AG', 'SE', 'NV', 'BV', 'SA', 'AB', 'OY', 'PLC', 'CEO', 'CFO', 'COO', 'CTO', 'EVP', 'SVP', 'VP', 'GC', 'HR', 'IT', 'IP', 'PC', 'PA'])
// FS7 (round-5): alias letters verify as a SUBSEQUENCE of the name's initials, not a
// substring — "Richard Michael Baldock (“RB”)" derives RB from R[M]B (round-4 leak).
export const isInitialSubseq = (needle, hay) => {
  let i = 0
  for (const c of hay) if (c === needle[i]) i++
  return i >= needle.length
}
export function aliasInitialRegions(orig, table) {
  const out = []
  const aliases = new Set()
  for (const m of orig.matchAll(/[(]\s*[“"‘']([A-Z]{2,4})[”"’'][\s)]/g)) {
    const a = m[1]
    if (INITIALS_STOP.has(a)) continue
    const win = orig.slice(Math.max(0, m.index - 100), m.index)
    const runs = win.match(/(?:[A-Z][\w'’-]+\s+){1,4}[A-Z][\w'’-]+/g) || []
    if (runs.some((r) => isInitialSubseq(a, r.split(/\s+/).map((w) => w[0]).join('').toUpperCase()))) aliases.add(a)
  }
  for (const row of table) {
    if (row.cls !== 'PERSON') continue
    const toks = row.span.trim().split(/\s+/).filter((w) => /^[A-Z]/.test(w))
    if (toks.length < 2 || toks.length > 4) continue
    const ini = toks.map((w) => w[0]).join('').toUpperCase()
    if (ini.length >= 2 && ini.length <= 3 && !INITIALS_STOP.has(ini) && new RegExp(`\\b${ini}\\b`).test(orig)) aliases.add(ini)
  }
  for (const a of aliases) {
    for (const m of orig.matchAll(new RegExp(`\\b${a}\\b`, 'g'))) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
  }
  return out
}
// FS7b — person-named firm surname lists (round-4 leak: "c/o Dornbush, Schaeffer, Strongin
// & Venglia, LLP"): the name-partner list of a firm masks whole + each surname propagates.
export function firmNameListRegions(orig) {
  const out = []
  for (const m of orig.matchAll(/\b([A-Z][\w'’-]+(?:\s*,\s*[A-Z][\w'’-]+)+\s*&\s*[A-Z][\w'’-]+)\s*,?\s*(?:LLP|L\.L\.P\.|LLC|PLLC|P\.C\.|PA\b)/g)) {
    out.push({ start: m.index, end: m.index + m[1].length, tag: '[Person]' })
    for (const w of m[1].split(/[\s,&]+/)) {
      if (w.length < 3 || !/^[A-Z]/.test(w)) continue
      for (const t of orig.matchAll(nameTokenRe(w))) out.push({ start: t.index, end: t.index + t[0].length, tag: '[Person]' })
    }
  }
  return out
}
// FS7a support — anonymized-doc detection (content-based; duplicated from the projection
// deliberately: engine and gold must never share code paths)
export const isAnonCourtDoc = (orig) => /\b[A-Z]{1,4}\s+v\s+[A-Z]{1,4}\b/.test(orig.slice(0, 1500)) && (/\[[A-Z][A-Za-z0-9 ]{0,18}\]/.test(orig) || /X{3}/.test(orig))
export const ANON_NAME_STOP = new Set(['The', 'This', 'That', 'These', 'Those', 'Court', 'Judge', 'Justice', 'Wife', 'Husband', 'Child', 'Children', 'Father', 'Mother', 'Order', 'Orders', 'Act', 'Section', 'Family', 'Division', 'Singapore', 'High', 'Appeal', 'Counsel', 'Plaintiff', 'Defendant', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Affidavit', 'Agreement', 'Matrimonial', 'Assets', 'Consent', 'Summons', 'Notice', 'Rules', 'Chapter', 'Part', 'Article', 'Exhibit', 'Annex', 'Schedule', 'God', 'Christmas', 'Chinese', 'English', 'Malay', 'Indian'])
// FS7c — flip-class shapes for the P0g formats (abbrev dates, spelled(paren) durations,
// share counts): candidates for the anchor decision, keeps unless personal.
export const L11_RULES = [
  { cls: 'Date', re: /\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}\b/g },
  { cls: 'Date', re: /\b[a-z]+\s*\(\d+\)\s*(?:calendar\s+|business\s+)?(?:days?|months?|years?|weeks?)\b/gi },
  { cls: 'Date', re: /\b\d{1,3}-day\b/gi },
  { cls: 'Amount', re: /\b[\d,]{4,}\s+shares?\b/gi },
]

// FS5-R3 — quoted name variants (us-15: `spell Leschuk's first name "Erick."`).
export function quotedVariantRegions(orig) {
  const out = []
  const toks = new Set()
  for (const m of orig.matchAll(/(?:names?|spell(?:ed|s|ing)?|known\s+as|a\/k\/a|aka|alias|referred\s+to\s+as)\s*[,:]?\s*[“"‘']([A-Z][\w'’-]{1,20})[.,]?[”"’']/gi)) toks.add(m[1])
  for (const t of toks) {
    for (const m of orig.matchAll(nameTokenRe(t))) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
  }
  return out
}

// FS5-R4 — kinship-apposition names (us-10: "Langston's son, Bo, consulting contracts").
export function kinshipNameRegions(orig) {
  const out = []
  const toks = new Set()
  for (const m of orig.matchAll(/\b(?:sons?|daughters?|wife|husband|brothers?|sisters?|mother|father|nephews?|nieces?|cousins?|grandsons?|granddaughters?)\s*,\s*([A-Z][\w'’-]{1,15})\s*,/g)) toks.add(m[1])
  for (const t of toks) {
    for (const m of orig.matchAll(nameTokenRe(t))) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
  }
  return out
}

// FS5-R7 — own-case cites by party match (us-19: "See Hundley v. Rite Aid …, 529 S.E.2d 45"
// where Rite Aid is THIS case's title party). A cite whose opponent is a document party makes
// the other side a party-linked person: mask it + the trailing reporter cite. Precedent cites
// (neither side a party) are untouched.
export function ownCaseCiteRegions(orig) {
  const parties = new Set()
  const title = /^Title:\s*(.{3,140})$/m.exec(orig.slice(0, 400))
  if (title && /\sv\.?\s/.test(title[1]))
    for (const side of title[1].split(/\sv\.?\s/).slice(0, 2)) {
      const s = side.trim().replace(/[,.]+$/, '')
      if (s && !PARTY_STOP.test(s)) parties.add(s)
    }
  const out = []
  for (const p of parties) {
    const key = p.split(/\s+/).slice(0, 2).map(escT).join('\\s+')
    for (const dir of [
      new RegExp(`\\b([A-Z][\\w'’.-]+(?:\\s+[A-Z][\\w'’.-]+){0,3})\\s+v\\.?\\s+${key}`, 'g'),
      new RegExp(`\\b${key}[\\w'’., -]{0,40}?\\s+v\\.?\\s+([A-Z][\\w'’.-]+(?:\\s+[A-Z][\\w'’.-]+){0,3})`, 'g'),
    ]) {
      for (const m of orig.matchAll(dir)) {
        const other = m[1].replace(/[,.]+$/, '')
        if (PARTY_STOP.test(other) || CORP_MARK.test(other)) continue
        for (const w of other.split(/\s+/)) {
          if (w.length < 3 || !/^[A-Z]/.test(w)) continue
          for (const t of orig.matchAll(nameTokenRe(w.replace(/[.,]$/, '')))) out.push({ start: t.index, end: t.index + t[0].length, tag: '[Person]' })
        }
        const tail = /^[\s,]*\d{1,4}\s+[A-Z][A-Za-z0-9. ]{0,16}?\d{1,5}\s*(?:\([^)\n]{0,45}\))?/.exec(orig.slice(m.index + m[0].length, m.index + m[0].length + 90))
        if (tail) out.push({ start: m.index, end: m.index + m[0].length + tail[0].length, tag: '[Person]' })
      }
    }
  }
  return out
}

// FS5-R6 — parenthesized defined aliases: `Daniel Sim (“Sim”)`, `Ng Heng Hong (“Ng”)`
// (sg-22). The alias of a masked thing must mask with it — person-named aliases always;
// company aliases too, because a defined-term company is exactly what the FS3 keep-guard
// vetoes from restore (the alias would otherwise leak the masked company).
export function definedAliasRegions(orig) {
  const out = []
  const aliases = new Set()
  for (const m of orig.matchAll(/([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.@-]+|\s+(?:s\/o|d\/o|bin|binte)\s+[A-Z][\w'’.-]+){0,4})\s*\(\s*[“"‘']((?:the\s+)?[A-Z][\w'’ .&-]{1,25}?)[”"’']\s*\)/g)) {
    const alias = m[2].replace(/^the\s+/i, '').trim()
    if (alias.length < 2 || INITIALS_STOP.has(alias.toUpperCase())) continue
    if (/^(?:Agreement|Act|Court|Convention|Company|Contract|Parties|Party|Rules?|Judgment|Defendant|Plaintiff|Claimant|Respondent|Applicant|Appellant|Executive|Employee|Employer|Board|Bank|Landlord|Tenant|Buyer|Seller|Vendor|Purchaser|Licensee|Licensor|Guarantor|Borrower|Lender|Trustee|Owner|Operator|Manager|Contractor|Consultant|Supplier|Customer|Distributor|Group|Holder|Investor|Member|Partner|Shareholder|Subsidiary|Affiliate|Government|State|Region|City|Effective Date|Closing Date|Term)$/i.test(alias)) continue
    // alias must derive from the name (token subset or initials) — otherwise it's a generic
    // defined term, not an identity alias
    const nameToks = m[1].split(/\s+/).map((w) => w.replace(/[.,]$/, ''))
    const aliasToks = alias.split(/\s+/)
    const fromName = aliasToks.every((a) => nameToks.some((n) => n.toLowerCase() === a.toLowerCase())) ||
      isInitialSubseq(alias.replace(/\s+/g, '').toUpperCase(), nameToks.map((w) => w[0]).join('').toUpperCase())
    if (fromName) aliases.add(alias)
  }
  for (const a of aliases) {
    const re = new RegExp(`\\b${escT(a).replace(/\s+/g, '\\s+')}(?:[’']s?)?\\b`, 'g')
    for (const m of orig.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
  }
  return out
}

// FS6 (overnight 2026-07-23) — deterministic rails for the stay-QUASI digit mass from the
// v2 decomposition: person-linked case registers (DAC-922467-2019), age/duration forms.
export const L10_RULES = [
  { cls: 'Code', re: /\b[A-Z]{2,4}[- ]\d{5,7}[- ]\d{4}\b/g },
  { cls: 'Dem', re: /\bin (?:his|her|their) (?:(?:early|mid|late) )?\d0s\b/gi },
  { cls: 'Dem', re: /\b(?:almost|about|around|nearly|over|under)?\s?\d{1,3} years? (?:old|of age)\b/gi },
  { cls: 'Dem', re: /\b\d{1,2} (?:weeks?|months?) and \d{1,2} days?\b/gi },
]

// FS8a (round-6, "Derek" leak) — bare quoted nicknames: a quoted capitalized token directly
// after a name run (`Chan Chee Yong "Derek"`) is an alias; no parens, no "known as" keyword.
export function quotedNicknameRegions(orig) {
  const out = []
  const toks = new Set()
  for (const m of orig.matchAll(/[A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){1,4}\s+[“"']([A-Z][a-z]{2,15})[”"']/g)) {
    if (ANON_NAME_STOP.has(m[1])) continue
    toks.add(m[1])
  }
  for (const t of toks) {
    for (const m of orig.matchAll(nameTokenRe(t))) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
  }
  return out
}

// FS9a (round-7, sg-r6-05 leak class) — account-number fragments: "account number ending
// in 4885" nominates the fragment, which then propagates document-wide because courts use
// it as a defined alias ("the 4885 account" ×11). Add-only masking — gate-safe by
// construction. Fragment must be 3–6 digits and be nominated by the ending-in phrase;
// bare-number propagation risk is over-masking only, never a leak.
export function accountFragmentRegions(orig) {
  const out = []
  const frags = new Set()
  for (const m of orig.matchAll(/\baccounts?(?:\s+(?:number|nos?\.?))?\s+ending\s+(?:in|with)\s+(\d{3,6})\b/gi)) frags.add(m[1])
  for (const f of frags) {
    const re = new RegExp('\\b' + f + '\\b', 'g')
    for (const m of orig.matchAll(re)) out.push({ start: m.index, end: m.index + f.length, tag: '[Id]' })
  }
  return out
}

// FS5-Q1 — kinship phrases are QUASI (P0 decomposition: "his wife", "his son").
export function kinshipPhraseRegions(orig) {
  const out = []
  for (const m of orig.matchAll(/\b(?:his|her|their)\s+(?:wife|husband|sons?|daughters?|mother|father|brothers?|sisters?|uncles?|aunts?|nieces?|nephews?|cousins?|grandmother|grandfather|widow|fiancée?)\b/gi))
    out.push({ start: m.index, end: m.index + m[0].length, tag: '[Dem]' })
  return out
}

// FS5-Q2 — SG dialects/languages/religions are DEM-class QUASI ("Hokkien", "Taoist deity").
export function dialectReligionRegions(orig) {
  const out = []
  for (const m of orig.matchAll(/\b(?:Hokkien|Teochew|Cantonese|Hainanese|Hakka|Peranakan|Taoist|Buddhist|Hindu|Sikh|Roman Catholic|Methodist|Anglican)\b/g))
    out.push({ start: m.index, end: m.index + m[0].length, tag: '[Dem]' })
  return out
}

// FS5-Q3 — occupations in person context (P0 decomposition: "disc jockey", "lecturer in
// law"); bare titles stay readable (P0b keeps "Director" as a title).
export function occupationContextRegions(orig) {
  const out = []
  const OCC = /\b(?:(?:was|is|as|being)\s+(?:a|an|the)\s+|(?:work(?:s|ed|ing)?|employ(?:ed|s)?|serv(?:es|ed|ing)?)\s+as\s+(?:a|an|the)?\s*)((?:[a-z][\w-]*\s+){0,3}(?:jockey|accountant|teacher|driver|manager|nurse|engineer|cleaner|hawker|clerk|surgeon|technician|lecturer|professor|banker|contractor|salesman|businessman|shareholder|homemaker|housewife))\b/gi
  for (const m of orig.matchAll(OCC)) {
    const s = m.index + m[0].length - m[1].length
    out.push({ start: s, end: s + m[1].length, tag: '[Job]' })
  }
  return out
}
// FS1b — SG party/case codes: anonymization initials ("AV") and register codes ("OA 6",
// "HC/SUM 123") in the caption zone become document-wide masks.
export function sgPartyCodeRegions(orig) {
  const out = []
  const zone = orig.slice(0, 2000)
  const codes = new Set()
  for (const m of zone.matchAll(/\b(?:Between|And|and)\s+((?:[A-Z]{1,3})(?:\s+[A-Z]{1,3})?)\s*(?:\n|…|\()/g)) {
    const c = m[1].trim()
    if (!/^(?:AND|THE|FOR|SGX|GST|CPF)$/.test(c)) codes.add(c)
  }
  for (const m of orig.matchAll(/\b(?:OA|OS|SUM|HC\/SUM|CA\/OA|AD\/OA|DC|MC|MA|CR|CC|RA|OC|SOP(?:\/AA)?|AA)\s?\d{1,5}\b|\bSuit\s+\d{1,5}\s+of\s+\d{4}\b/g)) codes.add(m[0])
  for (const c of codes) {
    const re = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'g')
    for (const m of orig.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Code]' })
  }
  return out
}
// FS1c — genre-wide official titles (restore side; round-1 NM 20.3 diagnosis: the title set
// spoke only ECHR): US and SG judicial forms added.
export const OFFICIAL_TITLE_WIDE_RE =
  /(?:Judges?|Justice|Mr\s+Justice|Mrs\s+Justice|Registrar|Deputy\s+Registrar|Advocate\s+General|Judge\s+Rapporteur|Circuit\s+Judge|District\s+Judge|Chief\s+Justice|Senior\s+Judge|Magistrate|Justice\s+of\s+Appeal|Judicial\s+Commissioner|The\s+Honou?rable)[\s,]{0,3}$/

// Arm L2b: context-aware KEEP-restore, replacing L2's blunt pattern. Measured lesson
// (run v1legal1-e2e, ORG analysis): L2 wrongly restored domestic courts/ministries (QUASI —
// they localize the applicant) while ECHR organs and respondent-state forms are the NO_MASK
// mass. Restore ONLY: Convention organs, and Government/state forms of the extracted
// respondent. Domestic institutions stay masked.
const ECHR_ORGAN_RE =
  /\b(?:European Court of Human Rights|European Commission of Human Rights|Grand Chamber|Committee of Ministers|the Convention|the Court|the Commission|the Chamber|the Registry)\b/
export function restoreInstitutionalV2(text, table, originalText) {
  const resp = extractRespondent(originalText)
  const restored = []
  let out = text
  for (const row of table) {
    if (row.cls !== 'COMPANY' || !out.includes(row.tag)) continue
    const s = row.span
    const isOrgan = ECHR_ORGAN_RE.test(s)
    const isRespondent =
      resp &&
      (s.includes(resp.state) ||
        s === `${resp.demonym} Government` ||
        s === `the ${resp.demonym} Government` ||
        /^(?:the\s+)?Government$/.test(s))
    if (!isOrgan && !isRespondent) continue
    out = out.split(row.tag).join(s)
    restored.push({ tag: row.tag, span: s, why: isOrgan ? 'organ' : 'respondent' })
  }
  return { text: out, restored }
}

// FS4 — caption party mining (round-3 courts DIRECT gap: gold-only names v1 never tabled).
// SG: "Between <Name> ... And <Name>"; US: "<NAME>, Plaintiff/Defendant/Appellant/Appellee".
// Extracted parties mask document-wide + both-end name tokens propagate (surname rail law).
export function captionPartyRegions(orig) {
  const out = []
  const zone = orig.slice(0, 3000)
  const names = new Set()
  for (const m of zone.matchAll(/\b(?:Between|And)\s+((?:[A-Z][\w'’@.-]+)(?:\s+(?:[A-Z][\w'’@.-]+|s\/o|d\/o|bin|binte|@)){1,6})\s*(?:…|\.\.\.|\n|,|\()/g)) names.add(m[1].trim())
  for (const m of zone.matchAll(/\b((?:[A-Z][\w'’.-]+)(?:\s+[A-Z][\w'’.-]+){1,4}),\s*(?:Plaintiffs?|Defendants?|Appellants?|Appellees?|Petitioners?|Respondents?)\b/g)) names.add(m[1].trim())
  const escC = (s) => s.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')
  const toks = new Set()
  for (const n of names) {
    if (/\b(?:Public Prosecutor|Attorney|United States|State|Government)\b/.test(n)) continue
    for (const w of n.split(/\s+/)) if (w.length >= 2 && /^[A-Z]/.test(w) && !/^(?:The|And|Between)$/.test(w)) toks.add(w)
    const re = new RegExp('\\b' + escC(n).replace(/\s+/g, '\\s+') + '\\b', 'g')
    for (const m of orig.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
  }
  for (const w of toks) {
    const re = new RegExp('\\b' + escC(w) + '(?:[’\x27]s)?\\b', 'g')
    for (const m of orig.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Person]' })
  }
  return out
}

// ══ FIRM-PAPER RAILS (2026-09-15, owner-ordered firm-genre round) ═══════════════════════════
// Measured on nine public RECAP filings in a firm's shapes (OPS_LEDGER 2026-09-14): every
// person, email, phone and address block masked, but party ORGANISATION names survived at
// their FIRST mention — a caption, a "Re:" line, a defined-term parenthetical — and a brief
// lost 37 of its 45 precedent citations. Those are the same doctrine question answered the
// wrong way round for a law firm's own paper: in an EDGAR contract the counterparty is public
// and precedent is scarce, so companies keep; in a firm's file the party's NAME is the
// matter's identity, and the precedent is the reason to send the file to a model at all.
// Used ONLY by --profile firm (the citation rail also by --arms citekeep). Every frozen
// profile is untouched by construction: none of these functions is called without those flags.

const REPORTER_RE = String.raw`(?:F\.\s?(?:2d|3d|4th)|F\.\s?App['’]x|F\.\s?Supp\.(?:\s?2d|\s?3d)?|U\.\s?S\.|S\.\s?Ct\.|L\.\s?Ed\.(?:\s?2d)?|A\.(?:2d|3d)|N\.E\.(?:2d|3d)|N\.W\.(?:2d|3d)|N\.Y\.S\.(?:2d|3d)|P\.(?:2d|3d)|S\.E\.(?:2d|3d)|S\.W\.(?:2d|3d)|So\.(?:\s?2d|\s?3d)?|B\.R\.|Fed\.\s?Cl\.|T\.C\.|WL|LEXIS)`
// the reporter triple itself: "598 F.3d 30", "2008 WL 4891229", "761 F.3d at 276"
const CITE_CORE = String.raw`\d{1,4}[ \t\n]+${REPORTER_RE}[ \t\n]+(?:at[ \t\n]+)?\*?\d{1,7}`
// a party-name token inside a citation: capitalised, an initialism, or a small connector.
// Requiring a capital on every token is the fail-closed guard — it is what stops a backward
// walk from swallowing running prose ("agreed to arbitrate”); Tellium Inc. v. …") into a
// span this rail RELEASES.
const CITE_TOKEN = String.raw`(?:[A-Z][\w&'’.-]{0,30}|of|the|and|de|van|von|ex|rel\.|&)[,]?`
const CITE_NAME = String.raw`${CITE_TOKEN}(?:[ \t\n]+${CITE_TOKEN}){0,9}`
const CITE_DOCKET = String.raw`(?:Nos?\.[ \t\n]*[^,\n]{1,45},[ \t\n]*)?`
const CITE_TAIL = String.raw`(?:,[ \t\n]*\*?\d{1,5}(?:[ \t\n]*[-–][ \t\n]*\d{1,5})?)?(?:,?[ \t\n]*at[ \t\n]+\*?\d{1,4}(?:[ \t\n]*[-–][ \t\n]*\d{1,4})?)?(?:[ \t\n]*\([^)\n]{0,70}\))?`
export const FULL_CITE_RE = new RegExp(String.raw`\b(${CITE_NAME})[ \t\n]+v\.?[ \t\n]+(${CITE_NAME})[ \t\n]*${CITE_DOCKET}(${CITE_CORE})${CITE_TAIL}`, 'g')
// short form: "Abbar, 761 F.3d at 276" — released ONLY if that name also appears in a FULL
// citation in the same document (a known cited case), which is the fail-closed guard here.
export const SHORT_CITE_RE = new RegExp(String.raw`\b([A-Z][\w'’-]{2,25}),[ \t\n]+(${CITE_CORE})${CITE_TAIL}`, 'g')

// tokens that carry no identity and so never trigger the shared-token guard
const CITE_TOKEN_STOP = new Set(['inc', 'inc.', 'ltd', 'ltd.', 'llc', 'llp', 'plc', 'pte', 'pty', 'corp', 'corp.', 'co', 'co.', 'company', 'companies', 'group', 'holdings', 'holding', 'trust', 'fund', 'funds', 'bank', 'banks', 'the', 'and', 'of', 'et', 'al', 'al.', 'no', 'nos', 'united', 'states', 'america', 'american', 'court', 'courts', 'city', 'county', 'board', 'commission', 'department', 'district', 'sec', 'sec.', 'securities', 'partners', 'partnership', 'associates', 'services', 'service', 'systems', 'international', 'global', 'markets', 'market', 'capital', 'management', 'industries', 'enterprises', 'solutions', 'technologies', 'products', 'limited', 'incorporated', 'firm', 'law', 'legal'])
const identityToks = (s) => s.split(/[^A-Za-z0-9'’]+/).map((t) => t.toLowerCase().replace(/[’']s$/, '')).filter((t) => t.length >= 3 && !CITE_TOKEN_STOP.has(t))

/** This matter's own identity tokens, normalised the same way the citation rail normalises a
 *  cited case name — so the two sides of the shared-token guard can never disagree. */
export const identityTokensOf = (strings) => new Set(strings.flatMap((s) => identityToks(String(s || ''))))

/**
 * The identity set, built so it cannot eat its own tail.
 *
 * Measured 2026-09-15 (first firm round, doc 01): feeding every substrate COMPANY/BRAND/PERSON
 * row into the shared-token guard released 6 citations out of 52. The reason is circular and
 * total: the v1 core tags a cited case name as a COMPANY, so "Citigroup Glob. Markets, Inc."
 * enters the identity set and then vetoes the release of the very citation it came from. Every
 * citation kills itself; the rail scores as if it were off.
 *
 * The cut is the one a lawyer would make. An entity that appears ONLY inside citation shapes is
 * precedent. An entity that appears even ONCE in running text — a caption, a party line, a
 * sentence — is this matter, and every citation sharing a token with it stays masked. So
 * "Interactive Brokers" (in the caption AND in a cited case) remains identity and
 * `Interactive Brokers LLC v. Delaporte` is NOT released, while "Citigroup" (nowhere but the
 * table of authorities) is not identity and its citations release. Fail-closed: presence
 * anywhere outside a citation keeps an entity in the identity set.
 *
 * @param {string} orig      the unmasked document
 * @param {string[]} names   candidate identity strings (caption parties, substrate entity spans)
 * @returns {Set<string>}    identity tokens, precedent-only names removed
 */
export function matterIdentityTokens(orig, names) {
  const cites = citationKeepSpans(orig, new Set()) // no guard: every citation SHAPE in the document
  const inCite = (i, j) => cites.some(([s, e]) => i >= s && j <= e)
  const kept = []
  for (const raw of names) {
    const name = String(raw || '').trim()
    if (name.length < 3) continue
    let re
    try { re = new RegExp('(?<![A-Za-z0-9])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '(?![A-Za-z0-9])', 'gi') } catch { continue }
    let total = 0, outside = 0
    for (const m of orig.matchAll(re)) { total++; if (!inCite(m.index, m.index + m[0].length)) outside++ }
    // Never seen in the document at all: keep it (a caption name the reader gave us, or a
    // substrate span whose exact text we cannot re-find). Silence is not evidence of precedent.
    if (total === 0 || outside > 0) kept.push(name)
  }
  return identityTokensOf(kept)
}

/**
 * Spans of PRECEDENT citation that must survive: "<case name> v. <case name>, <reporter cite>"
 * and its short form. `identityTokens` is the set of this matter's own party-name tokens —
 * a citation sharing one of them (your own client's earlier case) is identity, not precedent,
 * and is NOT released. Returns merged [start,end] pairs. Deterministic, no model.
 */
export function citationKeepSpans(orig, identityTokens = new Set()) {
  const spans = []
  const fullNames = new Set()
  const shares = (s) => identityToks(s).some((t) => identityTokens.has(t))
  FULL_CITE_RE.lastIndex = 0
  for (const m of orig.matchAll(FULL_CITE_RE)) {
    if (shares(m[1]) || shares(m[2])) continue
    for (const side of [m[1], m[2]]) for (const t of side.split(/[ \t\n]+/)) {
      const w = t.replace(/[,.]+$/, '')
      if (w.length >= 3 && /^[A-Z]/.test(w)) fullNames.add(w)
    }
    spans.push([m.index, m.index + m[0].length])
  }
  SHORT_CITE_RE.lastIndex = 0
  for (const m of orig.matchAll(SHORT_CITE_RE)) {
    const nm = m[1].replace(/[,.]+$/, '')
    if (!fullNames.has(nm) || shares(nm)) continue
    spans.push([m.index, m.index + m[0].length])
  }
  spans.sort((a, b) => a[0] - b[0])
  const out = []
  for (const s of spans) {
    const last = out[out.length - 1]
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1])
    else out.push([...s])
  }
  return out
}

/**
 * Split-at-boundary release (the de-glue law, ported from apply-ln's LN0): a masked region
 * that crosses a keep span releases ONLY its intersection with that span; everything outside
 * stays masked under the region's own tag. Returns {regions, released}.
 */
export function releaseInsideSpans(regions, keepSpans) {
  if (!keepSpans.length) return { regions, released: 0 }
  const out = []
  let released = 0
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
    if (hit) released++
    for (const [s, e] of segs) if (e > s) out.push({ ...r, start: s, end: e })
  }
  return { regions: out, released }
}

// ── the US federal caption: party names on their own lines, the role on the next ───────────
// "INTERACTIVE BROKERS LLC, a\nConnecticut limited liability company,\nPlaintiff,"
// "MEWBOURNE OIL COMPANY, )\n)\nPlaintiff, )"      "Re: BKX Services Inc. et al v. HDR …"
const CAPTION_ROLE_LINE = /^[\s)(|]*(?:Plaintiffs?|Defendants?|Petitioners?|Respondents?|Appellants?|Appellees?|Claimants?|Debtors?(?:[- ]in[- ]Possession)?|Movants?|Applicants?|Intervenors?|Counter-?(?:Plaintiffs?|Defendants?|Claimants?)|Cross-?(?:Plaintiffs?|Defendants?)|Third-?Party (?:Plaintiffs?|Defendants?))[\s,.;:)(|]*$/i
const CAPTION_VENUE_RE = /\b(?:UNITED STATES|DISTRICT COURT|DISTRICT OF|IN THE|FOR THE|SUPERIOR COURT|BANKRUPTCY COURT|COURT OF|COUNTY OF|STATE OF|COMMONWEALTH OF|Case No|Civil Action|Adversary|Chapter \d|Judge|Magistrate|Honorable|Hon\.)\b|^[Xx\-_=*\s.)(|]{4,}$|^\s*v\.?\s*$/i
const CAPTION_DESCRIPTOR_RE = /,\s*(?:a|an|the)\s+[a-z][^,]{0,60}$/i

function cleanCaptionLine(line) {
  let s = (line || '').replace(/[)(|]+/g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^\d{1,2}[.)]\s*/, '').replace(/[,;:.\s]+$/, '')
  s = s.replace(/\s*,?\s*et\s+al\.?$/i, '').replace(CAPTION_DESCRIPTOR_RE, '')
  s = s.replace(/[,;:.\s]+$/, '')
  if (s.length < 3 || s.length > 70) return null
  if (CAPTION_VENUE_RE.test(s)) return null
  if (!/^[A-Z0-9]/.test(s)) return null
  if (!/[A-Za-z]{2}/.test(s)) return null
  return s
}

/**
 * Party names read from a US federal caption or a "Re:" line, masked at EVERY occurrence
 * (case-insensitively — the caption prints them in capitals and the body in title case, which
 * is exactly how "INTERACTIVE BROKERS LLC" survived a document whose every other mention of
 * the same company was masked). Also returns the names, for the acronym rail.
 */
export function usCaptionPartyRegions(orig) {
  const zone = orig.slice(0, 4000)
  const lines = zone.split('\n')
  const names = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (!CAPTION_ROLE_LINE.test(lines[i])) continue
    for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
      const cand = cleanCaptionLine(lines[j])
      if (cand) { names.add(cand); break }
    }
  }
  for (const m of zone.matchAll(/^[ \t]*Re:[ \t]*(.{3,160}?)[ \t]*$/gm)) {
    const parts = m[1].split(/\s+v\.?\s+/)
    for (const p of parts.length > 1 ? parts : []) {
      const cand = cleanCaptionLine(p)
      if (cand) names.add(cand)
    }
  }
  const out = []
  const escR = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const lowerWords = new Set((orig.match(/\b[a-z]{3,}\b/g) || []).map((w) => w.toLowerCase()))
  for (const n of names) {
    for (const form of new Set([n, n.replace(new RegExp(String.raw`[,\s]+(?:${'Inc|Ltd|Limited|Corp|Corporation|Co|Company|LLC|L\\.L\\.C|LLP|PLC|Pte|Pty|GmbH|N\\.V|B\\.V|S\\.A'})\.?$`, 'i'), '').trim()])) {
      if (form.length < 3) continue
      const re = new RegExp(String.raw`\b${escR(form).replace(/\s+/g, '\\s+')}(?:[’']s)?\b`, 'gi')
      for (const m of orig.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Company]' })
    }
    // distinctive single tokens ("Mewbourne", "BKX", "Cadence") propagate; a token that also
    // lives in the document as an ordinary lowercase word ("interactive", "comic") does not —
    // otherwise the rail eats English prose and buys no privacy.
    for (const w of n.split(/\s+/)) {
      const t = w.replace(/[^A-Za-z0-9'’]/g, '')
      if (t.length < 3 || !/^[A-Z]/.test(t)) continue
      if (CITE_TOKEN_STOP.has(t.toLowerCase()) || lowerWords.has(t.toLowerCase())) continue
      for (const m of orig.matchAll(new RegExp(String.raw`\b${escR(t)}(?:[’']s)?\b`, 'g'))) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Company]' })
    }
  }
  return { regions: out, names: [...names] }
}

const ACRONYM_STOP = new Set(['ECF', 'USDC', 'CMECF', 'LLC', 'LLP', 'PLC', 'INC', 'LTD', 'PTE', 'PTY', 'CIV', 'USC', 'CFR', 'FRCP', 'FRE', 'USA', 'PDF', 'AND', 'THE', 'FOR', 'NOT', 'ALL', 'ANY', 'PER', 'SEE', 'NEW', 'YORK', 'CPL', 'JD', 'ESQ', 'PLLC', 'NO', 'NOS', 'PAGE', 'CASE', 'DOC', 'EXHIBIT', 'ORDER', 'DATED', 'FILED', 'SDNY', 'EDNY', 'NDNY', 'WDNY', 'CACD', 'CDCA', 'TXWD', 'WDOK', 'OKWD', 'FLSB', 'USDJ', 'USMJ', 'IT', 'IS', 'SO', 'OF', 'IN', 'ON', 'AT', 'BY', 'TO', 'RE'])

/**
 * Party acronyms and tickers: an ALL-CAPS token whose letters are a subsequence of a party
 * name's letters ("IBKR" inside "interactivebrokers", "IBLLC" inside "interactivebrokersllc").
 * Two occurrences minimum, court/procedural acronyms excluded. This is the class that let a
 * ticker stand in a document whose party name was otherwise masked everywhere.
 */
export function partyAcronymRegions(orig, partyNames) {
  const letters = partyNames.map((n) => n.toLowerCase().replace(/[^a-z]/g, '')).filter((s) => s.length >= 4)
  if (!letters.length) return []
  const freq = new Map()
  for (const m of orig.matchAll(/\b[A-Z][A-Z0-9]{2,7}\b/g)) freq.set(m[0], (freq.get(m[0]) || 0) + 1)
  const out = []
  for (const [tok, n] of freq) {
    if (n < 2 || ACRONYM_STOP.has(tok)) continue
    const need = tok.toLowerCase().replace(/[^a-z]/g, '')
    if (need.length < 3) continue
    if (!letters.some((hay) => isInitialSubseq(need.toUpperCase(), hay.toUpperCase()))) continue
    for (const m of orig.matchAll(new RegExp(String.raw`\b${tok}(?:[’']s)?\b`, 'g'))) out.push({ start: m.index, end: m.index + m[0].length, tag: '[Company]' })
  }
  return out
}

/**
 * Every occurrence of every entity the substrate already named, matched case-insensitively
 * and through possessives. The substrate tags the occurrences it found; a caption that prints
 * the same company in capitals is a different string and was left standing.
 */
export function entityOccurrenceRegions(orig, table, classes = ['COMPANY', 'BRAND', 'PERSON']) {
  const out = []
  const want = new Set(classes)
  const seen = new Set()
  const escR = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const row of table) {
    if (!want.has(row.cls)) continue
    const span = String(row.span || '').replace(/[’']s?$/, '').trim().replace(/[,;:.\s]+$/, '')
    if (span.length < 3) continue
    const key = span.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const re = new RegExp(String.raw`\b${escR(span).replace(/\s+/g, '\\s+')}(?:[’']s)?\b`, 'gi')
    for (const m of orig.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, tag: row.tag })
  }
  return out
}