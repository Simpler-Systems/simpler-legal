#!/usr/bin/env node
// Downloads the Text Anonymization Benchmark (TAB) — the gold-standard corpus for legal-text
// anonymization — and measures it. Same doctrine as build-corpus.mjs: raw data lands in raw/
// (gitignored, re-downloadable), provenance + measured stats are committed under pii-bench/.
//
// TAB: 1,268 real ECtHR judgments, hand-annotated with the personal information that must be
// masked to prevent re-identification (Pilán et al. 2022, Computational Linguistics 48(4)).
// Source: github.com/NorskRegnesentral/text-anonymization-benchmark (MIT).
// Role here: ground truth for re-tests of the PII engine fork (simpler-red -> legal), and real
// public documents dense in personal data standing in for private matter files.
//
//   node build-pii-bench.mjs            download (if missing) + measure -> pii-bench/tab-stats.json
//   node build-pii-bench.mjs --force    re-download even if present
//   node build-pii-bench.mjs hardness   stress-check: rank docs by intrinsic difficulty ->
//                                       pii-bench/hard-set.json (no engine involved; hardness
//                                       comes from the documents and from annotator disagreement)

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const COMMIT = '558e09e26d6b36f5f78440074e6a233946d98bd9' // pinned 2026-01-19
const BASE = `https://raw.githubusercontent.com/NorskRegnesentral/text-anonymization-benchmark/${COMMIT}`
const FILES = ['LICENSE.txt', 'README.md', 'guidelines.md', 'evaluation.py', 'echr_train.json', 'echr_dev.json', 'echr_test.json']
const RAW = join(ROOT, 'raw', 'tab')
const OUT = join(ROOT, 'pii-bench')
const FORCE = process.argv.includes('--force')

async function download() {
  mkdirSync(RAW, { recursive: true })
  for (const f of FILES) {
    const dest = join(RAW, f)
    if (existsSync(dest) && statSync(dest).size > 0 && !FORCE) {
      console.log(`have ${f} (${(statSync(dest).size / 1e6).toFixed(1)} MB)`)
      continue
    }
    process.stdout.write(`fetching ${f} ... `)
    const res = await fetch(`${BASE}/${f}`)
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`) // fail loud, fail closed
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error(`${f}: empty response`)
    writeFileSync(dest, buf)
    console.log(`${(buf.length / 1e6).toFixed(1)} MB`)
  }
}

function measure() {
  const stats = { source: `${BASE}`, commit: COMMIT, license: 'MIT (Norsk Regnesentral)', fetchedAt: new Date().toISOString(), splits: {} }
  const catTotals = {}
  const idTypeTotals = {}
  const confTotals = {}
  let allWords = []
  for (const split of ['train', 'dev', 'test']) {
    const docs = JSON.parse(readFileSync(join(RAW, `echr_${split}.json`), 'utf8'))
    const words = docs.map((d) => d.text.split(/\s+/).length).sort((a, b) => a - b)
    allWords = allWords.concat(words)
    let mentions = 0
    let annotators = new Set()
    for (const d of docs) {
      for (const [ann, a] of Object.entries(d.annotations || {})) {
        annotators.add(ann)
        for (const m of a.entity_mentions || []) {
          mentions++
          catTotals[m.entity_type] = (catTotals[m.entity_type] || 0) + 1
          idTypeTotals[m.identifier_type] = (idTypeTotals[m.identifier_type] || 0) + 1
          if (m.confidential_status && m.confidential_status !== 'NOT_CONFIDENTIAL')
            confTotals[m.confidential_status] = (confTotals[m.confidential_status] || 0) + 1
        }
      }
    }
    stats.splits[split] = {
      docs: docs.length,
      words: { min: words[0], median: words[Math.floor(words.length / 2)], max: words[words.length - 1] },
      mentions,
      annotatorsPerCorpus: annotators.size,
    }
    console.log(`${split.padEnd(6)} ${String(docs.length).padStart(5)} docs   words min/median/max ${words[0]}/${words[Math.floor(words.length / 2)]}/${words[words.length - 1]}   ${mentions} annotated mentions`)
  }
  allWords.sort((a, b) => a - b)
  stats.words = { min: allWords[0], median: allWords[Math.floor(allWords.length / 2)], max: allWords[allWords.length - 1] }
  stats.semanticCategories = catTotals
  stats.identifierTypes = idTypeTotals
  stats.confidentialStatuses = confTotals
  console.log(`\nsemantic categories: ${Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  ')}`)
  console.log(`identifier types:    ${Object.entries(idTypeTotals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  ')}`)
  console.log(`confidential:        ${Object.entries(confTotals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  ')}`)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'tab-stats.json'), JSON.stringify(stats, null, 2))
  console.log(`\nwrote pii-bench/tab-stats.json`)
}

// ---- hardness stress-check ----
// A doc earns its place in the hard set for measurable reasons, not volume:
//   disagreement   two trained annotators disagreed on what must be masked (char-Jaccard of
//                  their DIRECT+QUASI spans) — human-measured ambiguity, the strongest
//                  engine-free hardness signal; dev/test are multi-annotator
//   formVariety    entities recurring under several surface forms — miss one form = leak
//   trapShare      the same surface text masked in one place and NO_MASK in another —
//                  context-dependence; pure pattern-matchers fail these both ways
//   quasiDensity   re-identification via accumulation of quasi-identifiers, not direct hits
//   length         long-doc percentile (recall decay over distance)
const maskable = (m) => m.identifier_type === 'DIRECT' || m.identifier_type === 'QUASI'
function charSet(mentions) {
  const s = new Set()
  for (const m of mentions) if (maskable(m)) for (let i = m.start_offset; i < m.end_offset; i++) s.add(i)
  return s
}
function jaccard(a, b) {
  if (!a.size && !b.size) return 1
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}
function docFeatures(d, split) {
  const anns = Object.values(d.annotations || {})
  const words = d.text.split(/\s+/).length
  // disagreement over all annotator pairs
  let disagreement = null
  if (anns.length >= 2) {
    const sets = anns.map((a) => charSet(a.entity_mentions || []))
    const js = []
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) js.push(jaccard(sets[i], sets[j]))
    disagreement = 1 - js.reduce((x, y) => x + y, 0) / js.length
  }
  // remaining features from the densest annotation
  const best = anns.reduce((a, b) => ((b.entity_mentions || []).length > (a.entity_mentions || []).length ? b : a), anns[0] || { entity_mentions: [] })
  const ms = best.entity_mentions || []
  const byEntity = new Map()
  for (const m of ms) {
    if (!maskable(m)) continue
    if (!byEntity.has(m.entity_id)) byEntity.set(m.entity_id, new Set())
    byEntity.get(m.entity_id).add(m.span_text.toLowerCase().trim())
  }
  const multiForm = [...byEntity.values()].filter((s) => s.size >= 2).length
  const maskedTexts = new Set(ms.filter(maskable).map((m) => m.span_text.toLowerCase().trim()))
  const noMask = ms.filter((m) => m.identifier_type === 'NO_MASK')
  const traps = noMask.filter((m) => maskedTexts.has(m.span_text.toLowerCase().trim())).length
  return {
    doc_id: d.doc_id,
    split,
    words,
    annotators: anns.length,
    direct: ms.filter((m) => m.identifier_type === 'DIRECT').length,
    quasiPer100w: +((ms.filter((m) => m.identifier_type === 'QUASI').length / words) * 100).toFixed(2),
    multiFormShare: byEntity.size ? +(multiForm / byEntity.size).toFixed(3) : 0,
    trapShare: noMask.length ? +(traps / noMask.length).toFixed(3) : 0,
    disagreement: disagreement === null ? null : +disagreement.toFixed(3),
  }
}
function cmdHardness() {
  const feats = []
  for (const split of ['train', 'dev', 'test']) {
    const docs = JSON.parse(readFileSync(join(RAW, `echr_${split}.json`), 'utf8'))
    for (const d of docs) feats.push(docFeatures(d, split))
  }
  // min-max normalize each component over the corpus; weight; sum
  const WEIGHTS = { disagreement: 3, trapShare: 2, multiFormShare: 2, quasiPer100w: 1, words: 1 }
  const norm = {}
  for (const k of Object.keys(WEIGHTS)) {
    const vals = feats.map((f) => f[k]).filter((v) => v !== null)
    const [lo, hi] = [Math.min(...vals), Math.max(...vals)]
    norm[k] = (v) => (v === null ? 0 : (v - lo) / (hi - lo || 1))
  }
  for (const f of feats) {
    f.hardness = +Object.entries(WEIGHTS)
      .reduce((s, [k, w]) => s + w * norm[k](f[k]), 0)
      .toFixed(3)
  }
  feats.sort((a, b) => b.hardness - a.hardness)
  const multi = feats.filter((f) => f.disagreement !== null)
  console.log(`docs: ${feats.length} (${multi.length} multi-annotator)`)
  console.log(`disagreement (multi-annotator): min ${Math.min(...multi.map((f) => f.disagreement)).toFixed(3)}  median ${multi.map((f) => f.disagreement).sort((a, b) => a - b)[Math.floor(multi.length / 2)].toFixed(3)}  max ${Math.max(...multi.map((f) => f.disagreement)).toFixed(3)}`)
  console.log(`\ntop 10 hardest:`)
  for (const f of feats.slice(0, 10))
    console.log(
      `  ${f.hardness}  ${f.doc_id} (${f.split})  words ${f.words}  disagree ${f.disagreement ?? '-'}  traps ${f.trapShare}  multiForm ${f.multiFormShare}  quasi/100w ${f.quasiPer100w}`,
    )
  const out = {
    method:
      'Engine-free stress ranking. Components min-max normalized over all 1,268 docs, weighted: ' +
      'annotator disagreement x3 (1 - char-Jaccard of maskable spans between annotators; multi-annotator docs only), ' +
      'trapShare x2 (same surface text masked here, NO_MASK there), multiFormShare x2 (entities with >=2 surface forms), ' +
      'quasi density x1, length x1. Single-annotator docs score 0 on disagreement - the hard set therefore ' +
      'overweights dev/test, which are the official evaluation splits anyway.',
    weights: WEIGHTS,
    hardSet: feats.slice(0, 150),
  }
  writeFileSync(join(OUT, 'hard-set.json'), JSON.stringify(out, null, 1))
  console.log(`\nwrote pii-bench/hard-set.json (top 150)`)
}

if (process.argv[2] === 'hardness') cmdHardness()
else {
  await download()
  measure()
}
