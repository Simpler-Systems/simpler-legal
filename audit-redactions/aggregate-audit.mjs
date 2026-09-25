#!/usr/bin/env node
// Merge all redaction-audit pieces into pii-bench/redaction-audit.json (committed record).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BASE = join(HERE, 'redacted')
// derived from this file's location — never the author's machine
const REPO = join(HERE, '..')

const v2 = JSON.parse(readFileSync(join(HERE, 'redaction-audit-v2.json'), 'utf8'))
const conventions = JSON.parse(readFileSync(join(HERE, 'court-conventions.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(BASE, 'manifest.json'), 'utf8'))
const sgManifest = JSON.parse(readFileSync(join(BASE, 'sg-anon', 'manifest.json'), 'utf8'))
const pairs = existsSync(join(BASE, 'pairs2.json')) ? JSON.parse(readFileSync(join(BASE, 'pairs2.json'), 'utf8')) : []
const recovered = existsSync(join(BASE, 'pairs2-recovered.json')) ? JSON.parse(readFileSync(join(BASE, 'pairs2-recovered.json'), 'utf8')) : []

// SG-anon: pseudonym placeholders + kept surfaces per doc
const sgAnon = []
const KEEP = [
  ['full_dates', /\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/g],
  ['ages', /\b(?:aged?|age of) \d{1,2}\b|\b\d{1,2} years? (?:old|of age)\b/g],
  ['occupations', /\b(?:teacher|driver|manager|director|engineer|nurse|doctor|surgeon|accountant|technician|supervisor|cleaner|hawker|contractor|banker|lecturer|professor|police officer|civil servant|businessman|salesman|clerk|housewife|odd-job)\b/gi],
  ['company_names_kept', /\b[A-Z][\w&'’.-]*(?:\s+[A-Z][\w&'’.-]*){0,4}\s+(?:Pte\.?\s?Ltd|LLP|LLC)\b/g],
  ['money', /\bS?\$\s?[\d,]+(?:\.\d\d)?\b/g],
  ['medical', /\b(?:schizophrenia|depression|cancer|HIV|diabetes|dementia|psychiatric|autism|bipolar|adhd)\b/gi],
  ['nationalities', /\b(?:Singaporean|Malaysian|Indonesian|Indian|Chinese|Filipino|Thai|Vietnamese)\b/g],
  ['professional_names_kept', /\b(?:Mr|Mrs|Ms|Mdm|Dr)\s+[A-Z][a-z]+\b/g],
]
for (const m of sgManifest) {
  const t = readFileSync(join(BASE, 'sg-anon', m.file), 'utf8')
  const row = { file: m.file, id: m.id, url: m.url, words: m.words, caption: m.caption.replace(/\s+/g, ' '), pseudonyms: {}, kept: {} }
  const counts = {}
  for (const b of t.matchAll(/\[[^\]\n]{1,40}\]/g)) counts[b[0]] = (counts[b[0]] || 0) + 1
  row.pseudonyms = Object.fromEntries(Object.entries(counts).filter(([k, v]) => v >= 2 && !/^\[\d+\]$|^\[\d{4}\]$/.test(k) && !/SGHCF|SGHC|SGCA|SLR|WLR|Family Law|Civil|para/.test(k)))
  for (const [k, re] of KEEP) {
    re.lastIndex = 0
    const ms = [...t.matchAll(re)]
    if (ms.length) row.kept[k] = { n: ms.length, eg: ms[0][0] }
  }
  sgAnon.push(row)
}

// pair-recovered content shapes
const CONTENT_SHAPES = [
  ['money', /^[\s$€£]*(?:US\$|S\$|\$|€|£)?\s?[\d,]+(?:\.\d+)?\s?(?:million|billion|thousand)?[\s.]*$/i],
  ['percent', /^[\s]*[\d.,]+\s?(?:%|percent)[\s.]*$/i],
  ['bare_number', /^[\s]*[\d,.]+[\s.]*$/],
  ['date', /^(?:.{0,20}(?:january|february|march|april|may|june|july|august|september|october|november|december).{0,20}|\d{1,2}\/\d{1,2}\/\d{2,4})$/i],
  ['duration', /^\s*\(?\d*\)?\s?(?:calendar |business )?(?:days?|months?|years?|weeks?)\s*$/i],
  ['name_shaped', /^[\s"']*(?:[A-Z][\w.'’-]+\s?){1,4}[\s"']*$/],
  ['id_code', /^[\s]*[A-Z0-9][A-Z0-9-]{4,}[\s]*$/],
]
function shapeOf(c) {
  c = c.replace(/\s+/g, ' ').trim()
  if (c.length > 300) return 'long_passage'
  for (const [name, re] of CONTENT_SHAPES) if (re.test(c)) return name
  if (/[A-Z][a-z]/.test(c) && c.split(' ').length <= 6) return 'short_phrase'
  return 'other_text'
}
const pairShapes = recovered.map((r) => {
  const shapes = {}
  const eg = {}
  for (const c of r.recovered) {
    const s = shapeOf(c)
    shapes[s] = (shapes[s] || 0) + 1
    if (!eg[s]) eg[s] = c.slice(0, 70)
  }
  return { file: r.file, n: r.recovered.length, shapes, examples: eg }
})

const audit = {
  date: '2026-07-23',
  question: 'Do our engine classes (holes) match what real-world redactors actually redact?',
  method: {
    edgar: '34 EDGAR exhibits carrying CT-redaction legends fetched via SEC full-text search; every inline redaction marker classified adjacency-first, then table-run/heading, then ±200-char cues',
    f3d: `${conventions.f3d.cases} F.3d opinions (24 local CAP volumes) scanned for court redaction/pseudonymization conventions`,
    sgAnon: '8 SGHCF (Family Division) judgments with letter-coded parties fetched from eLitigation; pseudonym placeholders and KEPT identity surfaces inventoried',
    pairs: 'true raw/redacted twins verified by two proper-noun probe phrases + >=15 anchor-aligned sites; redacted content recovered from the raw twin and shape-classified',
  },
  edgar: { docs: v2.docs, totalSites: v2.total, families: v2.families, samples: Object.fromEntries(Object.entries(v2.samples).map(([k, v]) => [k, v.slice(0, 3)])) },
  edgarManifest: manifest.map(({ file, url, company, date, accession, sites, words }) => ({ file, url, company, date, accession, sites, words })),
  f3dConventions: { cases: conventions.f3d.cases, docsWith: conventions.f3d.docsWith, hits: conventions.f3d.byConvention, samples: Object.fromEntries(Object.entries(conventions.f3d.samples).map(([k, v]) => [k, v.slice(0, 2)])) },
  sgAnonymized: sgAnon,
  pairs: { verified: pairs, contentShapes: pairShapes },
  headline: {
    edgarSplit: 'PII-shaped 35.1% / business-confidential 64.0% / unclear 0.8% of 4374 sites',
    sgDoctrine: 'family courts code persons AND person-anchored entities ([W Holdings], [School A], [the Disputed Property]); keep dates, ages, occupations, unrelated companies, money, medical terms, professional names',
    f3dDoctrine: 'published opinions redact via pseudonyms (Doe, 50 docs) & minors initials (15 docs) & CI references (88 docs), not black-box blocks (1 doc)',
  },
}
writeFileSync(join(REPO, 'pii-bench', 'redaction-audit.json'), JSON.stringify(audit, null, 1))
console.log('written pii-bench/redaction-audit.json')
console.log('pairs:', pairs.length, 'pairShapes:', JSON.stringify(pairShapes.map((p) => ({ f: p.file, n: p.n, shapes: p.shapes }))))
