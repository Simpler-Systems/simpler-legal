#!/usr/bin/env node
// simpler-med / simpler-legal spike pipeline (identical file in both repos).
// Software spine only — no model calls. Two similarity layers:
//   1. TF-IDF cosine over raw text: vocabulary-free, works on ANY practice's documents.
//   2. Facet overlap (weighted Jaccard) from clusters.json vocabulary: precision overlay,
//      only active where a curated vocabulary exists. Grown per practice in the real product.
// Hybrid score = 0.5*cosine + 0.5*facet when both sides have facets, else cosine alone.
//
// Commands (append `--set synthetic` to target the synthetic sub-corpus; `--no-facets` for
// pure TF-IDF ablation):
//   node pipeline.mjs index
//   node pipeline.mjs match <file>
//   node pipeline.mjs eval
//   node pipeline.mjs dossier <file>

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  if (i >= 0) argv.splice(i, 1)
  return i >= 0
}
const flagVal = (name) => {
  const i = argv.indexOf(name)
  if (i >= 0) {
    const v = argv[i + 1]
    argv.splice(i, 2)
    return v
  }
  return null
}
const SET = flagVal('--set') || '.'
const NO_FACETS = flag('--no-facets')
const DIR = (sub) => join(ROOT, SET, sub)

// ---- facet vocabulary (optional; clusters.json may not exist, e.g. legal) ----
const WEIGHTS = { sym: 3, dx: 2, rx: 1 }
const vocab = new Map()
if (existsSync(join(ROOT, 'clusters.json')) && !NO_FACETS) {
  const spec = JSON.parse(readFileSync(join(ROOT, 'clusters.json'), 'utf8'))
  const add = (tag, terms, w) => {
    if (!vocab.has(tag)) vocab.set(tag, { terms: new Set(), w })
    for (const t of terms) vocab.get(tag).terms.add(t.toLowerCase())
  }
  for (const c of spec.clusters) {
    for (const s of c.symptoms) add(`sym:${s.canon}`, s.terms, WEIGHTS.sym)
    add(`dx:${c.dx.canon}`, c.dx.terms, WEIGHTS.dx)
    for (const r of c.rx) add(`rx:${r.canon}`, r.terms, WEIGHTS.rx)
  }
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const matchers = [...vocab.entries()].map(([tag, v]) => ({
  tag,
  w: v.w,
  res: [...v.terms].map((t) => new RegExp(`\\b${esc(t)}\\b`, 'i')),
}))

// ---- TF-IDF layer ----
const STOP = new Set(
  ('the a an and or but if then of to in on at by for with from as is are was were be been being ' +
    'this that these those it its he she his her they them their we you your i not no nor so such ' +
    'do does did done have has had having will would shall should can could may might must than ' +
    'there here when where which who whom what why how all any both each few more most other some ' +
    'own same too very just also into over under again further once about against between through ' +
    'during before after above below up down out off only because while until upon within without ' +
    'per said one two three patient history normal noted well see').split(/\s+/),
)
const tokenize = (text) => {
  const out = []
  for (const m of text.toLowerCase().matchAll(/[a-z][a-z']{2,}/g)) {
    if (!STOP.has(m[0])) out.push(m[0])
  }
  return out
}
function tfVector(tokens) {
  const counts = new Map()
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1)
  return counts
}
function buildIdf(docs) {
  const df = new Map()
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1)
  const N = docs.length
  const idf = new Map()
  for (const [t, n] of df) idf.set(t, Math.log((N + 1) / (n + 1)) + 1)
  return idf
}
function weight(d, idf) {
  const v = new Map()
  let norm = 0
  for (const [t, c] of d.tf) {
    const w = (1 + Math.log(c)) * (idf.get(t) || 1)
    v.set(t, w)
    norm += w * w
  }
  d.vec = v
  d.norm = Math.sqrt(norm) || 1
}
function cosine(a, b) {
  const [small, big] = a.vec.size <= b.vec.size ? [a, b] : [b, a]
  let dot = 0
  for (const [t, w] of small.vec) {
    const w2 = big.vec.get(t)
    if (w2) dot += w * w2
  }
  return dot / (a.norm * b.norm)
}

// ---- parsing ----
function extractTags(text) {
  const tags = new Set()
  for (const m of matchers) if (m.res.some((re) => re.test(text))) tags.add(m.tag)
  return tags
}
function parseDoc(text, file) {
  const g = (re) => {
    const m = text.match(re)
    return m ? m[1].trim() : null
  }
  const name = (g(/^Patient\s*:\s*(.+)$/im) || '').replace(/\s*\(.*\)\s*$/, '') || null
  return {
    file: basename(file),
    name,
    label: name || g(/^(?:Case|Sample)\s*:\s*(.+)$/im) || basename(file),
    nric: g(/\b([STFG]\d{7}[A-Z])\b/),
    dob: g(/^DOB\s*:\s*(.+)$/im),
    date: g(/^Date\s*:\s*(.+)$/im),
    cluster: Number((basename(file).match(/^c(\d+)-/) || [])[1] || 0),
    tags: extractTags(text),
    tf: tfVector(tokenize(text)),
    text,
  }
}
function loadCorpus() {
  const dir = DIR('corpus')
  const docs = readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => parseDoc(readFileSync(join(dir, f), 'utf8'), f))
  const idf = buildIdf(docs)
  for (const d of docs) weight(d, idf)
  return { docs, idf }
}
function loadQuery(p, idf) {
  const full = isAbsolute(p) ? p : join(ROOT, p)
  const q = parseDoc(readFileSync(full, 'utf8'), full)
  weight(q, idf)
  return q
}

// ---- cases (a "case" = a patient when names exist, else the single document) ----
function casesOf(docs) {
  const by = new Map()
  for (const d of docs) {
    const key = (d.name || d.file).toLowerCase()
    if (!by.has(key)) by.set(key, { name: d.label, dob: d.dob, nric: d.nric, docs: [] })
    by.get(key).docs.push(d)
  }
  for (const p of by.values()) p.docs.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return by
}
const tagList = (tags, kind) =>
  [...tags].filter((t) => t.startsWith(kind + ':')).map((t) => t.slice(kind.length + 1))
function trajectoryLines(p) {
  const lines = []
  let prevRx = null
  for (const d of p.docs) {
    const rx = new Set(tagList(d.tags, 'rx'))
    const dx = tagList(d.tags, 'dx').join(', ')
    let delta = ''
    if (prevRx && rx.size) {
      const added = [...rx].filter((t) => !prevRx.has(t))
      if (added.length) delta = `   << CHANGED: +${added.join(', +')}`
    }
    lines.push(
      `    ${d.date || '-'}  [${d.file}]  dx: ${dx || '-'}  rx: ${[...rx].join(', ') || '-'}${delta}`,
    )
    if (rx.size) prevRx = rx
  }
  return lines
}

// ---- similarity ----
function facetJaccard(a, b) {
  let inter = 0
  let union = 0
  for (const t of new Set([...a.tags, ...b.tags])) {
    const w = vocab.get(t).w
    union += w
    if (a.tags.has(t) && b.tags.has(t)) inter += w
  }
  return union ? inter / union : 0
}
function score(q, d) {
  const cos = cosine(q, d)
  if (q.tags.size && d.tags.size) return 0.5 * cos + 0.5 * facetJaccard(q, d)
  return cos
}
function rank(q, docs) {
  const scored = docs.map((d) => ({ d, s: score(q, d) })).sort((a, b) => b.s - a.s)
  const by = casesOf(docs)
  const seen = new Set()
  const cases = []
  for (const { d, s } of scored) {
    const key = (d.name || d.file).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cases.push({ case: by.get(key), best: d, score: s })
    if (cases.length >= 5) break
  }
  return { scored, cases }
}
const shared = (q, d) => [...q.tags].filter((t) => d.tags.has(t))
const topTerms = (q, d, n = 6) => {
  const pairs = []
  for (const [t, w] of q.vec) {
    const w2 = d.vec.get(t)
    if (w2) pairs.push([t, w * w2])
  }
  return pairs
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t)
}

// ---- commands ----
function cmdIndex() {
  const { docs } = loadCorpus()
  const by = casesOf(docs)
  console.log(`Indexed ${docs.length} documents -> ${by.size} cases (set: ${SET})`)
  const tagged = docs.filter((d) => d.tags.size).length
  console.log(`Facet layer: ${vocab.size} vocabulary tags; ${tagged}/${docs.length} docs carry >=1 facet`)
  if (!existsSync(DIR('out'))) mkdirSync(DIR('out'), { recursive: true })
  writeFileSync(
    join(DIR('out'), 'casebook.json'),
    JSON.stringify(
      docs.map((d) => ({ file: d.file, label: d.label, cluster: d.cluster, tags: [...d.tags] })),
      null,
      2,
    ),
  )
  console.log(`Wrote ${join(SET, 'out', 'casebook.json')}`)
}

function runMatch(file) {
  const { docs, idf } = loadCorpus()
  const q = loadQuery(file, idf)
  return { q, docs, ...rank(q, docs) }
}
function cmdMatch(file) {
  const { q, cases } = runMatch(file)
  console.log(`NEW CASE: ${q.file}  (${q.label})`)
  if (q.tags.size) console.log(`  facets: ${[...q.tags].join(', ')}`)
  console.log(`\nTop 5 similar cases:`)
  for (const [i, r] of cases.entries()) {
    const why = shared(q, r.best)
    console.log(`\n${i + 1}. ${r.case.name}   score ${r.score.toFixed(3)}`)
    console.log(
      `   matched on: ${why.length ? why.join(', ') : 'text similarity: ' + topTerms(q, r.best).join(', ')}`,
    )
    for (const l of trajectoryLines(r.case)) console.log(l)
  }
}

function cmdEval() {
  const { docs, idf } = loadCorpus()
  const dir = DIR('newcases')
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt'))
  const rows = []
  for (const f of files) {
    const q = loadQuery(join(dir, f), idf)
    const { scored, cases } = rank(q, docs)
    const top5 = scored.slice(0, 5)
    const p5 = top5.filter((r) => r.d.cluster === q.cluster).length / 5
    rows.push({
      query: f,
      cluster: q.cluster,
      p5,
      top1Hit: (cases[0]?.best.cluster ?? 0) === q.cluster,
      top5Docs: top5.map((r) => `${r.d.file}:${r.s.toFixed(2)}`),
    })
  }
  rows.sort((a, b) => a.cluster - b.cluster)
  console.log(`facet layer: ${vocab.size ? 'ON' : 'OFF (pure TF-IDF)'}   set: ${SET}`)
  console.log('query                          p@5    top-case-correct')
  for (const r of rows) {
    console.log(
      `${r.query.padEnd(31)}${r.p5.toFixed(2).padEnd(7)}${r.top1Hit ? 'YES' : 'NO   <- ' + r.top5Docs[0]}`,
    )
  }
  const meanP5 = rows.reduce((a, r) => a + r.p5, 0) / (rows.length || 1)
  const acc = rows.filter((r) => r.top1Hit).length
  console.log(`\nmean p@5: ${meanP5.toFixed(3)}   top-case accuracy: ${acc}/${rows.length}`)
  if (!existsSync(DIR('out'))) mkdirSync(DIR('out'), { recursive: true })
  writeFileSync(join(DIR('out'), 'eval.json'), JSON.stringify(rows, null, 2))
}

// ---- dossier ----
const SKIP_TOKENS = new Set(['bin', 'binte', 'binti', 's/o', 'd/o'])
function buildAliasMap(names) {
  const map = new Map()
  let i = 0
  for (const n of names) if (n) map.set(n, `Patient ${String.fromCharCode(65 + i++)}`)
  return map
}
function stripPII(text, aliasMap) {
  let out = text
  for (const [name, alias] of aliasMap) {
    out = out.replace(new RegExp(esc(name), 'gi'), alias)
    for (const tok of name.split(/\s+/)) {
      if (tok.length < 3 || SKIP_TOKENS.has(tok.toLowerCase())) continue
      out = out.replace(new RegExp(`\\b${esc(tok)}\\b`, 'g'), alias.replace('Patient ', 'Pt-'))
    }
  }
  return out
    .replace(/\b[STFG]\d{7}[A-Z]\b/g, '[ID]')
    .replace(/^DOB\s*:.*$/gim, 'DOB: [REDACTED]')
    .replace(/\b[89]\d{3}\s?\d{4}\b/g, '[PHONE]')
}
function cmdDossier(file) {
  const { q, docs, cases } = runMatch(file)
  const aliasMap = buildAliasMap([q.name, ...cases.map((r) => (r.best.name ? r.case.name : null))])
  const alias = (r) => (r.best.name ? aliasMap.get(r.case.name) : r.case.name)
  const lines = []
  lines.push(`# Case dossier - ${q.file}`)
  lines.push('')
  lines.push(
    `Scope: the ${cases.length} most similar cases retrieved from a corpus of ${docs.length} documents (hybrid text+facet similarity). This dossier contains ONLY what was retrieved - it is not a complete view of the corpus. Identifiers pseudonymized where present; the alias map stays local.`,
  )
  lines.push('')
  lines.push(`## New case (${aliasMap.get(q.name) || q.label})`)
  lines.push('')
  lines.push('```')
  lines.push(stripPII(q.text, aliasMap).trim())
  lines.push('```')
  for (const [i, r] of cases.entries()) {
    lines.push('')
    lines.push(`## Similar case ${i + 1}: ${alias(r)}   (match ${r.score.toFixed(3)})`)
    lines.push('')
    const why = shared(q, r.best)
    lines.push(
      `Matched on: ${why.length ? why.join(', ') : 'text similarity: ' + topTerms(q, r.best).join(', ')}`,
    )
    lines.push('')
    lines.push('Trajectory:')
    for (const l of trajectoryLines(r.case)) lines.push(r.best.name ? l.replace(r.case.name, alias(r)) : l)
    if (i < 3) {
      lines.push('')
      lines.push('Source documents (sanitized):')
      for (const d of r.case.docs) {
        lines.push('')
        lines.push('```')
        lines.push(stripPII(d.text, aliasMap).trim())
        lines.push('```')
      }
    }
  }
  if (!existsSync(DIR('out'))) mkdirSync(DIR('out'), { recursive: true })
  const stem = basename(file, '.txt')
  writeFileSync(join(DIR('out'), `dossier-${stem}.md`), lines.join('\n'))
  writeFileSync(
    join(DIR('out'), `dossier-${stem}.map.json`),
    JSON.stringify(Object.fromEntries([...aliasMap].map(([k, v]) => [v, k])), null, 2),
  )
  console.log(`Wrote ${join(SET, 'out', `dossier-${stem}.md`)} (+ local alias map)`)
}

// ---- main ----
const [cmd, arg] = argv
if (cmd === 'index') cmdIndex()
else if (cmd === 'match' && arg) cmdMatch(arg)
else if (cmd === 'eval') cmdEval()
else if (cmd === 'dossier' && arg) cmdDossier(arg)
else {
  console.log('usage: node pipeline.mjs [--set synthetic] [--no-facets] index | match <file> | eval | dossier <file>')
  process.exit(1)
}
