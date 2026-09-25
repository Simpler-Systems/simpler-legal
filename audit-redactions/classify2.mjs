#!/usr/bin/env node
// v2 classifier: adjacency-first (high precision), then table-run/heading logic, then wide
// window cues. Goal: an honest split of real redaction sites into PII-shaped (engine-coverable)
// vs business-confidential (no PII class covers it), with the unclear tail small.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BASE = join(HERE, 'redacted')
const RED = join(BASE, 'redacted')
const manifest = JSON.parse(readFileSync(join(BASE, 'manifest.json'), 'utf8'))

const MARK_RE = /\[\s?\*{1,8}\s?\]|\[(?:REDACTED|Redacted|OMITTED|Omitted|CONFIDENTIAL)\]|\*{2,8}/g
function markerSites(text) {
  const sites = []
  for (const m of text.matchAll(MARK_RE)) {
    const i = m.index
    const lineStart = text.lastIndexOf('\n', i) + 1
    const lineEndRaw = text.indexOf('\n', i)
    const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw
    const line = text.slice(lineStart, lineEnd)
    const bare = !m[0].startsWith('[')
    const alone = line.replace(MARK_RE, '').replace(/[\s.,;:]+/g, '') === ''
    if (bare && !alone) {
      const before = text.slice(Math.max(lineStart, i - 35), i)
      const after = text.slice(i + m[0].length, Math.min(lineEnd, i + m[0].length + 35))
      if (!/\w/.test(before) || !/\w/.test(after)) continue
    }
    if (bare && alone) continue // bare *** separator line
    sites.push({ i, len: m[0].length, m: m[0], lineStart, lineEnd, alone })
  }
  return sites
}

const WINDOW_FAMS = [
  ['bank_account', /\baccount\b|wire instruction|routing|iban|swift\b/],
  ['contact_address', /\battention\b|\battn\b|\be-?mail\b|@|\bfacsimile\b|\bfax\b|telephone|\bphone\b|notices? (?:to|shall)/],
  ['person_name', /\bname of (?:the )?(?:individual|employee|officer|person)|\bmr\.|\bms\.|\bdr\.|\bsignature|\bby: /],
  ['pricing_fee', /\$|\bus\$|\bprice|\bpricing|\bfees?\b|\broyalt|\bdiscount|\brebate|\brates?\b|\bper (?:unit|share|dose|ton|gram)|\bpayments?\b|\bcompensation|\binvoice|\bcosts?\b|\bpercent|%|\bmargin\b|\bpurchase price|\bamounts?\b/],
  ['quantity_volume', /\bquantit|\bvolume|\bunits\b|\bsupply\b|\bcapacity\b|\bminimum (?:order|purchase)|\bforecast|\bbatch(?:es)?\b|\bkg\b|\btons?\b|\bnumber of\b/],
  ['milestone_event', /\bmilestone|\bphase\s(?:i{1,3}|[1-3])\b|\bclinical stud|\bclinical trial|\bnda\b|\bfda\b|\bapproval\b|\blaunch\b|\benrollment/],
  ['date_duration', /\bdated?\b|\bdays?\b|\bmonths?\b|\byears?\b|\banniversar|\bterm\b|\bperiod\b|\bdeadline|\bexpir|\buntil\b|\bprior to\b|\bwithin\b/],
  ['technical_product', /\bproducts?\b|\bcompound|\bmolecule|\btargets?\b|\bspecifications?\b|\bformula|\btechnolog|\bprocess\b|\bpatent|\bantibod|\bdrugs?\b|\bdevices?\b|\bsoftware|\balgorithm|\bapi\b|\bfield\b|\bindication|\bassay|\bcell line|\bmaterials?\b|\bequipment|\bdeliverables?\b|\bservices?\b|\bstudy\b|\bprotocol/],
  ['entity_counterparty', /\bcustomers?\b|\bsuppliers?\b|\bvendors?\b|\blicens(?:ees?|ors?)\b|\bdistributor|\bpartners?\b|\bthird part|\bmanufacturer|\bcontractors?\b|\bsubsidiar|\baffiliates?\b|\bcompany\b|\bcorporation\b/],
  ['territory_place', /\bterritor|\bcountr|\bregions?\b|\bjurisdiction|\bstates?\b|\bfacilit/],
]

function classifySite(text, s, sites, k) {
  const beforeTight = text.slice(Math.max(0, s.i - 14), s.i)
  const afterTight = text.slice(s.i + s.len, s.i + s.len + 22)
  // 1) adjacency (high precision)
  if (/(?:US|S|C)?\$\s?$|€\s?$|£\s?$/.test(beforeTight)) return 'pricing_fee'
  if (/^\s?%|^\s?percent/i.test(afterTight)) return 'pricing_fee'
  if (/^\s?(?:calendar |business )?(?:days?|months?|years?|weeks?)\b/i.test(afterTight)) return 'date_duration'
  if (/dated(?: as of)?\s?$|date[:,]?\s?$|\bas of\s?$|\buntil\s?$|\bby\s?$/i.test(beforeTight)) return 'date_duration'
  const label = text.slice(Math.max(0, s.i - 30), s.i)
  if (/(?:attention|attn\.?|e-?mail|facsimile|fax\.?|telephone|phone|tel\.?|address(?:es)?|att\.?|c\/o)[:\s]*$/i.test(label)) return 'contact_address'
  if (/(?:account holder|account no\.?|account number|bank|iban|bic|swift|routing)[:\s]*$/i.test(label)) return 'bank_account'
  if (/(?:name|signature|signed by|by)[:\s]*$/i.test(label) && /^\s?(?:title|name|date|signature)/i.test(text.slice(s.i + s.len, s.i + s.len + 40))) return 'person_name'
  if (/(?:schedule|exhibit|annex|appendix|section)\s?$/i.test(beforeTight)) return 'doc_reference'
  if (/[("“]\s?$/.test(beforeTight) && /^\s?["”]?\s?\)/.test(afterTight)) return 'defined_term_name'
  if (/^\s?(?:mg|mcg|kg|g|ml|units?|doses?|vials?|batches?)\b/i.test(afterTight)) return 'quantity_volume'
  // 2) whole-line/provision redaction
  if (s.alone) return 'entire_provision'
  // 3) table runs: >=3 markers within a 220-char neighborhood -> classify by nearest heading
  const near = sites.filter((o, j) => j !== k && Math.abs(o.i - s.i) < 220).length
  if (near >= 2) {
    const headZone = text.slice(Math.max(0, s.i - 900), s.i)
    const lines = headZone.split('\n').map((l) => l.trim()).filter((l) => l.length > 2 && l.length < 90)
    const heading = [...lines].reverse().find((l) => /^[A-Z0-9][A-Za-z0-9 .,&/()%$-]{2,80}$/.test(l) && !MARK_RE.test(l) && (/[A-Z]{2}|^[A-Z][a-z]+ [A-Z]/.test(l) || /price|fee|schedule|product|milestone|royalt/i.test(l)))
    const h = (heading || '').toLowerCase()
    if (/price|fee|cost|rate|royalt|payment|\$|discount/.test(h)) return 'pricing_fee'
    if (/product|compound|specification|material|item|description|deliverable/.test(h)) return 'technical_product'
    if (/date|timeline|schedule of|term/.test(h)) return 'date_duration'
    if (/milestone/.test(h)) return 'milestone_event'
    if (/quantit|volume|units|supply/.test(h)) return 'table_block'
    return 'table_block'
  }
  // 4) window cues, ±200
  const ctx = text.slice(Math.max(0, s.i - 200), s.i + s.len + 200).toLowerCase()
  for (const [name, re] of WINDOW_FAMS) if (re.test(ctx)) return name
  return 'other_unclear'
}

// verdicts: is the family PII-shaped (an engine class exists) or business-confidential?
const HOLES = {
  bank_account: ['PII', 'HAVE'],
  contact_address: ['PII', 'HAVE'],
  person_name: ['PII', 'HAVE'],
  entity_counterparty: ['PII', 'HAVE (policy-dependent)'],
  territory_place: ['PII', 'HAVE'],
  date_duration: ['PII', 'HAVE'],
  pricing_fee: ['PII', 'HAVE (Amount rails; doctrine pending)'],
  quantity_volume: ['BUSINESS', 'PARTIAL'],
  defined_term_name: ['BUSINESS', 'PARTIAL (defined-term rail exists for persons)'],
  milestone_event: ['BUSINESS', 'NO-HOLE'],
  technical_product: ['BUSINESS', 'NO-HOLE'],
  doc_reference: ['BUSINESS', 'NO-HOLE'],
  table_block: ['BUSINESS', 'NO-HOLE'],
  entire_provision: ['BUSINESS', 'NO-HOLE'],
  other_unclear: ['?', '?'],
}

const agg = {}
const samples = {}
let total = 0
for (const e of manifest) {
  const text = readFileSync(join(RED, e.file), 'utf8')
  const sites = markerSites(text)
  total += sites.length
  sites.forEach((s, k) => {
    const fam = classifySite(text, s, sites, k)
    agg[fam] = (agg[fam] || 0) + 1
    samples[fam] = samples[fam] || []
    if (samples[fam].length < 6) {
      const ctx = text.slice(Math.max(0, s.i - 80), s.i + s.len + 80).replace(/\s+/g, ' ')
      samples[fam].push(`${e.file}: …${ctx}…`)
    }
  })
}

console.log(`EDGAR party-redactions: ${manifest.length} exhibits, ${total} sites`)
const order = Object.entries(agg).sort((a, b) => b[1] - a[1])
for (const [fam, n] of order)
  console.log(`  ${fam.padEnd(20)} ${String(n).padStart(5)}  ${(((n / total) * 100).toFixed(1) + '%').padStart(6)}   ${HOLES[fam][0].padEnd(8)} ${HOLES[fam][1]}`)
const pii = order.filter(([f]) => HOLES[f][0] === 'PII').reduce((a, [, n]) => a + n, 0)
const biz = order.filter(([f]) => HOLES[f][0] === 'BUSINESS').reduce((a, [, n]) => a + n, 0)
const unk = total - pii - biz
console.log(`\nsplit: PII-shaped ${((pii / total) * 100).toFixed(1)}%  business-confidential ${((biz / total) * 100).toFixed(1)}%  unclear ${((unk / total) * 100).toFixed(1)}%`)
writeFileSync(join(HERE, 'redaction-audit-v2.json'), JSON.stringify({ docs: manifest.length, total, families: agg, samples }, null, 1))
for (const fam of ['other_unclear', 'table_block', 'entire_provision']) {
  console.log(`\n--- ${fam} samples:`)
  for (const s of (samples[fam] || []).slice(0, 4)) console.log('  ' + s.slice(0, 200))
}
