#!/usr/bin/env node
// Scorer for the PII-engine OOS protocol (steps 2-4 in BENCHMARK.md). Engine-free: consumes
// original docs + a directory of STRIPPED outputs (same filenames) + gold labels, and scores by
// cross-reference. The engine never sees the labels; this scorer is the only thing that reads
// both sides.
//
// Metrics (entity-level, fail-closed):
//   DIRECT recall        an entity leaks if ANY occurrence of its span_text survives in the
//                        stripped output. Gate: a doc with >=1 DIRECT leak is a FAILED export.
//   QUASI recall         same rule, reported separately (policy-thresholded, not gated).
//   NO_MASK preservation the over-masking check: NO_MASK surfaces SHOULD survive.
//   unmatchable          gold spans not literally present in the original doc (label noise) —
//                        excluded from scoring, counted and reported, never silently dropped.
//
// Usage:
//   node score-pii.mjs --stripped <dir> [--batch 1|2|all] [--name <run-name>]
//   node score-pii.mjs selftest        verify the scorer against three mechanical stand-ins
//                                      (null / oracle / over-masker) built from gold labels.
//                                      The stand-ins are scorer test fixtures, NOT strippers.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, basename, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { resolveGold } from './gold-path.mjs'

/** short digest for board records — diagnosable and matchable, not readable */
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12)

const ROOT = fileURLToPath(new URL('.', import.meta.url))
// A run records where its stripped files were as a path under this repository when they are in it,
// so a receipt never carries the machine's own folder (the selftest passes an absolute path).
const shownDir = (d) => { const r = relative(ROOT, d); return isAbsolute(d) && r && !r.startsWith('..') && !isAbsolute(r) ? r.split(sep).join('/') : d }
const RUNS = join(ROOT, 'pii-bench', 'runs')
const argv = process.argv.slice(2)
const flagVal = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : null
}
// P0: --labels selects the gold instrument (default: TAB-doctrine swarm gold; the product
// profile scores against pii-bench/oos-labels-product, the doctrine projection of the same gold)
//
// 2026-07-28: the published gold carries offsets, not text (gold-offsets.mjs).
// Every command in BENCHMARK.md and the round writeups still names the original
// pii-bench/<set> path, so resolve it: literal path first, then the hydrated
// tree, then fail loud with the one command that fixes it. Nothing documented
// had to change, and a clone that has not hydrated is told exactly that rather
// than throwing ENOENT on its first gold file.
const LABELS = resolveGold(flagVal('--labels') || 'pii-bench/oos-labels', ROOT)
// round-4: --docs selects the originals dir (default: the oos corpus); --manifest the doc list
const DOCS = join(ROOT, flagVal('--docs') || 'raw/oos')
const MANIFEST = flagVal('--manifest') || 'pii-bench/oos-manifest.json'

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// occurrences of a span in text: literal match, whitespace-tolerant (strippers may reflow).
// v2 (FS5, 2026-07-23): WORD-BOUNDED at word-char edges — the substring instrument scored
// phantom leaks ("Bo" inside "Board", "Sim" inside "Similarly", "AV" inside "[Address"),
// which polluted every short-span verdict since round 1. Instrument change: runs scored
// before this line carry the old semantics; cross-version comparisons say so.
const countOcc = (text, span) => {
  const core = esc(span).replace(/\s+/g, '\\s+')
  const re = new RegExp((/^\w/.test(span) ? '\\b' : '') + core + (/\w$/.test(span) ? '\\b' : ''), 'g')
  return (text.match(re) || []).length
}

function loadBatch(which) {
  const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8'))
  return manifest.docs
    .filter((d) => which === 'all' || d.batch === Number(which))
    .map((d) => basename(d.file))
}

function scoreDoc(file, strippedDir) {
  const original = readFileSync(join(DOCS, file), 'utf8')
  const strippedPath = join(strippedDir, file)
  if (!existsSync(strippedPath)) return { file, missing: true } // fail loud, not silently skip
  const stripped = readFileSync(strippedPath, 'utf8')
  // Gold for the SGHCF documents is withheld from the public repository (the
  // reason is written out in gold-offsets.mjs). Those rows drop out of the
  // board and say so, rather than crashing a stranger's clone or — worse —
  // silently shrinking the denominator. Any board with withheld > 0 is a
  // narrower measurement than ours and reports its own scope.
  const goldPath = join(LABELS, file.replace('.txt', '.json'))
  if (!existsSync(goldPath)) return { file, missing: false, withheld: true }
  const gold = JSON.parse(readFileSync(goldPath, 'utf8'))
  const r = { file, missing: false, direct: { total: 0, leaked: 0 }, quasi: { total: 0, leaked: 0 }, no_mask: { total: 0, preserved: 0 }, unmatchable: 0, leakedSpans: [] }
  for (const e of gold.entities) {
    const inOriginal = countOcc(original, e.span_text)
    if (!inOriginal) { r.unmatchable++; continue }
    const remaining = countOcc(stripped, e.span_text)
    if (e.identifier_type === 'NO_MASK') {
      r.no_mask.total++
      if (remaining > 0) r.no_mask.preserved++
    } else {
      const bucket = e.identifier_type === 'DIRECT' ? r.direct : r.quasi
      bucket.total++
      if (remaining > 0) {
        bucket.leaked++
        // A leaked span is, by definition, an identity the engine failed to
        // mask. Boards are committed and published, so they record the CLASS
        // and a short digest — enough to diagnose, count and match against a
        // local rerun, never enough to name the person. Set SIMPLER_LEAK_TEXT=1
        // for a local debugging run; never commit a board produced that way.
        if (e.identifier_type === 'DIRECT') {
          r.leakedSpans.push(process.env.SIMPLER_LEAK_TEXT
            ? e.span_text.slice(0, 60)
            : { cat: e.category || '?', len: e.span_text.length, id: sha16(e.span_text) })
        }
      }
    }
  }
  r.gatePass = r.direct.leaked === 0
  return r
}

function aggregate(rows) {
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0)
  const scored = rows.filter((r) => !r.missing && !r.withheld)
  const withheld = rows.filter((r) => r.withheld).map((r) => r.file)
  return {
    docs: rows.length,
    scoredDocs: scored.length,
    ...(withheld.length ? { withheldGold: withheld } : {}),
    missingOutputs: rows.filter((r) => r.missing).map((r) => r.file),
    directRecall: 1 - sum((r) => r.direct?.leaked || 0) / (sum((r) => r.direct?.total || 0) || 1),
    quasiRecall: 1 - sum((r) => r.quasi?.leaked || 0) / (sum((r) => r.quasi?.total || 0) || 1),
    noMaskPreservation: sum((r) => r.no_mask?.preserved || 0) / (sum((r) => r.no_mask?.total || 0) || 1),
    gatePassRate: scored.filter((r) => r.gatePass).length / (scored.length || 1),
    unmatchable: sum((r) => r.unmatchable || 0),
  }
}

function runScore(strippedDir, batch, name, filesOverride) {
  const files = filesOverride || loadBatch(batch)
  const rows = files.map((f) => scoreDoc(f, strippedDir))
  const agg = aggregate(rows)
  const pct = (x) => (100 * x).toFixed(1) + '%'
  console.log(`run: ${name}   batch: ${batch}   docs: ${agg.docs}${agg.missingOutputs.length ? `   MISSING OUTPUTS: ${agg.missingOutputs.length} <- run is INVALID` : ''}`)
  if (agg.withheldGold?.length) {
    console.log(`SCOPE: ${agg.withheldGold.length} of ${agg.docs} documents excluded — their gold is withheld from the public`)
    console.log(`       repository (see WITHHELD.md). This board measures the remaining ${agg.scoredDocs} and is`)
    console.log(`       therefore NARROWER than the published one. Compare like for like.`)
  }
  console.log(`DIRECT recall:        ${pct(agg.directRecall)}   (gate: ${pct(agg.gatePassRate)} of docs pass with zero DIRECT leaks)`)
  console.log(`QUASI recall:         ${pct(agg.quasiRecall)}`)
  console.log(`NO_MASK preservation: ${pct(agg.noMaskPreservation)}   (over-masking check)`)
  console.log(`unmatchable gold spans excluded: ${agg.unmatchable} (label noise; see BENCHMARK.md)`)
  mkdirSync(RUNS, { recursive: true })
  const out = { name, batch, strippedDir: shownDir(strippedDir), scoredAt: new Date().toISOString(), aggregate: agg, perDoc: rows }
  const path = join(RUNS, `${name}.json`)
  // The selftest's three runs are tracked receipts that `npm run verify` regenerates on every
  // pass. Re-stamping an identical result dirtied three tracked files per run and buried a real
  // change to the scorer's verdicts in timestamp churn, so an unchanged result keeps its stamp.
  if (batch === 'selftest' && existsSync(path)) {
    let prior = null
    try { prior = JSON.parse(readFileSync(path, 'utf8')) } catch {}
    if (prior && JSON.stringify({ ...prior, scoredAt: null }) === JSON.stringify({ ...out, scoredAt: null })) {
      console.log(`unchanged pii-bench/runs/${name}.json (scored ${prior.scoredAt})`)
      return agg
    }
  }
  writeFileSync(path, JSON.stringify(out, null, 1))
  console.log(`wrote pii-bench/runs/${name}.json`)
  return agg
}

// ---- selftest: three mechanical stand-ins prove the scorer's verdicts, not any stripper ----
function selftest() {
  const files = loadBatch('all').slice(0, 6) // 6 docs is enough to exercise every metric
  const base = join(ROOT, 'raw', 'scorer-selftest')
  const variants = { null: (t) => t, oracle: null, overmask: null }
  for (const v of Object.keys(variants)) mkdirSync(join(base, v), { recursive: true })
  for (const f of files) {
    const original = readFileSync(join(DOCS, f), 'utf8')
    const gold = JSON.parse(readFileSync(join(LABELS, f.replace('.txt', '.json')), 'utf8'))
    const maskAll = (text, types) => {
      let out = text
      for (const e of gold.entities) {
        if (!types.includes(e.identifier_type)) continue
        out = out.replace(new RegExp(esc(e.span_text).replace(/\s+/g, '\\s+'), 'g'), '[MASKED]')
      }
      return out
    }
    writeFileSync(join(base, 'null', f), original)
    writeFileSync(join(base, 'oracle', f), maskAll(original, ['DIRECT', 'QUASI']))
    writeFileSync(join(base, 'overmask', f), maskAll(original, ['DIRECT', 'QUASI', 'NO_MASK']))
  }
  const checks = []
  const expect = (label, cond, detail) => {
    checks.push([label, cond])
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  <- ' + detail}`)
  }
  console.log('--- null stripper (copies input) ---')
  const n = runScore(join(base, 'null'), 'selftest', 'selftest-null', files)
  console.log('--- oracle stripper (masks every gold maskable span) ---')
  const o = runScore(join(base, 'oracle'), 'selftest', 'selftest-oracle', files)
  console.log('--- over-masker (masks NO_MASK too) ---')
  const m = runScore(join(base, 'overmask'), 'selftest', 'selftest-overmask', files)
  console.log('--- verdicts ---')
  expect('null: DIRECT recall ~0', n.directRecall < 0.05, `got ${n.directRecall}`)
  expect('null: gate pass rate 0', n.gatePassRate === 0, `got ${n.gatePassRate}`)
  expect('null: NO_MASK preserved ~1', n.noMaskPreservation > 0.95, `got ${n.noMaskPreservation}`)
  expect('oracle: DIRECT recall 1.0', o.directRecall === 1, `got ${o.directRecall}`)
  expect('oracle: QUASI recall 1.0', o.quasiRecall === 1, `got ${o.quasiRecall}`)
  expect('oracle: gate pass rate 1.0', o.gatePassRate === 1, `got ${o.gatePassRate}`)
  expect('overmask: DIRECT recall 1.0', m.directRecall === 1, `got ${m.directRecall}`)
  expect('overmask: NO_MASK preservation ~0', m.noMaskPreservation < 0.05, `got ${m.noMaskPreservation}`)
  const failed = checks.filter(([, c]) => !c)
  if (failed.length) {
    console.error(`\nSELFTEST FAILED: ${failed.length}/${checks.length} checks — the scorer cannot be trusted`)
    process.exit(1)
  }
  console.log(`\nSELFTEST PASSED: ${checks.length}/${checks.length} — scorer verdicts verified`)
}

const [cmd] = argv
if (cmd === 'selftest') selftest()
else if (flagVal('--stripped')) {
  runScore(flagVal('--stripped'), flagVal('--batch') || 'all', flagVal('--name') || `run-${Date.now()}`)
} else {
  console.log('usage: node score-pii.mjs --stripped <dir> [--batch 1|2|all] [--name <run>]')
  console.log('       node score-pii.mjs selftest')
  process.exit(1)
}
