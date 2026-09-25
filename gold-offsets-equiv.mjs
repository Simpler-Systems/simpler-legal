#!/usr/bin/env node
// PROOF GATE for the offsets conversion.
//
// The round-trip check in gold-offsets.mjs verifies spans. This one verifies the
// thing that actually matters: that score-pii.mjs, run against real stripped
// output, produces a byte-identical board whether it reads the verbatim gold or
// the hydrated gold. Every published number is the output of that program, so
// this is the claim, not a proxy for it.
//
// Nothing verbatim gets deleted until this prints EQUIVALENT for every row.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const run = (name, stripped, labels, docs, manifest) => {
  execFileSync(process.execPath, ['score-pii.mjs',
    '--stripped', stripped, '--name', name,
    '--labels', labels, '--docs', docs, '--manifest', manifest,
  ], { cwd: ROOT, stdio: 'pipe' })
  const j = JSON.parse(readFileSync(join(ROOT, 'pii-bench', 'runs', `${name}.json`), 'utf8'))
  delete j.scoredAt; delete j.name
  return j
}

// The verbatim side has to BE the verbatim directory. score-pii.mjs resolves a
// missing pii-bench/<set> to raw/gold-hydrated/<set> (gold-path.mjs:11), so
// handing it the literal path on a tree that holds no verbatim gold scores the
// hydrated gold twice and prints EQUIVALENT having compared a directory with
// itself. This resolver does not fall back: absent is absent, and the row is
// skipped rather than passed.
const resolveGoldStrict = (spec) => (existsSync(join(ROOT, spec)) ? spec : null)

// every genre and every corpus behind a published claim
const MATRIX = [
  ['r4-courts', 'raw/stripped/r4-courts-FINAL', 'round4-gold', 'raw/round4', 'round4'],
  ['r4-edgar', 'raw/stripped/r4-edgar-FINAL', 'round4-gold-product', 'raw/round4', 'round4'],
  ['r5-courts', 'raw/stripped/r5-courts-FINAL', 'round5-gold', 'raw/round5', 'round5'],
  ['r5-edgar', 'raw/stripped/r5-edgar-FINAL', 'round5-gold-product', 'raw/round5', 'round5'],
  // the fix rounds re-score in-sample on the PREVIOUS round's paper, so r6fix
  // reads round5 and r7fix reads round6 — the pairing is the walk-forward law,
  // not a typo
  ['r6fix-courts', 'raw/stripped/r6fix-courts-FINAL', 'round5-gold', 'raw/round5', 'round5'],
  ['r6fix-edgar', 'raw/stripped/r6fix-edgar-FINAL', 'round5-gold-product', 'raw/round5', 'round5'],
  ['r7fix-courts', 'raw/stripped/r7fix-courts-FINAL', 'round6-gold', 'raw/round6', 'round6'],
  ['r7fix-edgar', 'raw/stripped/r7fix-edgar-FINAL', 'round6-gold-product', 'raw/round6', 'round6'],
  ['r7-courts', 'raw/stripped/r7-courts-FINAL', 'round7-gold', 'raw/round7', 'round7'],
  ['r7-edgar', 'raw/stripped/r7-edgar-FINAL', 'round7-gold-product', 'raw/round7', 'round7'],
  ['uk', 'raw/stripped/uk-courts-FINAL', 'ukprobe-gold', 'raw/ukprobe', 'ukprobe'],
  ['pureoos', 'raw/stripped/pureoos-FINAL', 'pureoos-gold-product', 'raw/pureoos', 'pureoos'],
  ['oos-doctrine', 'raw/stripped/ussg50-A3', 'oos-labels', 'raw/oos', 'oos'],
  ['oos-product', 'raw/stripped/edgar50-A3', 'oos-labels-product', 'raw/oos', 'oos'],
]

let pass = 0, fail = 0, skip = 0
for (const [tag, stripped, labels, docs, manifest] of MATRIX) {
  if (!existsSync(join(ROOT, stripped))) { console.log(`SKIP  ${tag} — no ${stripped}`); skip++; continue }
  const hyd = `raw/gold-hydrated/${labels}`
  if (!existsSync(join(ROOT, hyd))) { console.log(`SKIP  ${tag} — not hydrated`); skip++; continue }
  const verbatim = resolveGoldStrict(`pii-bench/${labels}`)
  if (!verbatim) { console.log(`SKIP  ${tag} — no verbatim gold at pii-bench/${labels}, so there is nothing to compare the hydrated gold with`); skip++; continue }
  const mf = `pii-bench/${manifest}-manifest.json`
  const a = run(`_equiv-verbatim`, stripped, verbatim, docs, mf)
  const b = run(`_equiv-hydrated`, stripped, hyd, docs, mf)
  const same = JSON.stringify(a) === JSON.stringify(b)
  const g = a.aggregate
  console.log(`${same ? 'EQUIVALENT' : 'DIFFERS   '} ${tag.padEnd(14)} DIRECT ${(g.directRecall * 100).toFixed(1)}%  QUASI ${(g.quasiRecall * 100).toFixed(1)}%  NO_MASK ${(g.noMaskPreservation * 100).toFixed(1)}%  gate ${(g.gatePassRate * 100).toFixed(0)}%`)
  if (same) pass++
  else {
    fail++
    for (let i = 0; i < a.perDoc.length; i++) {
      if (JSON.stringify(a.perDoc[i]) !== JSON.stringify(b.perDoc[i])) console.log(`   first differing doc: ${a.perDoc[i].file}`)
      if (JSON.stringify(a.perDoc[i]) !== JSON.stringify(b.perDoc[i])) break
    }
  }
}
for (const n of ['_equiv-verbatim', '_equiv-hydrated']) {
  const p = join(ROOT, 'pii-bench', 'runs', `${n}.json`)
  if (existsSync(p)) rmSync(p)
}
console.log(`\n${pass} equivalent · ${fail} differing · ${skip} skipped of ${MATRIX.length}`)
if (fail) { console.error('NOT EQUIVALENT — do not delete the verbatim gold'); process.exit(3) }
if (!pass) { console.error('NOTHING COMPARED — every row skipped, so this run proves nothing'); process.exit(3) }
// Exit non-zero on ANY skip, matching gold-offsets.mjs verify() and this file's own
// contract above: nothing verbatim gets deleted until this prints EQUIVALENT for EVERY
// row. The exit code is what a gate is consumed by — `node gold-offsets-equiv.mjs && rm
// -rf pii-bench/<set>` must not delete gold that no row ever proved reproducible.
if (skip) {
  console.error(`PARTIAL — ${pass} of ${MATRIX.length} rows compared and equivalent; ${skip} not compared, so they prove nothing`)
  process.exit(3)
}
console.log('the hydrated gold reproduces every board exactly')
