#!/usr/bin/env node
// Rebuilds the current-best post-pass output from the GPU v1-plain substrate (the fast loop's
// regeneration step — model-free, seconds). Single source of truth for the stack order.
//   node build-legal8.mjs [--out raw/stripped/tab-dev-all-v1legal8-post]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('.', import.meta.url))
process.chdir(ROOT)
const R = await import('./lib-legal/legal-rails.mjs')
const { restoreByPolicy } = await import('./lib-legal/router.mjs')
const argv = process.argv.slice(2)
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'raw/stripped/tab-dev-all-v1legal8-post'

const labels = new Map(Object.entries(JSON.parse(readFileSync('pii-bench/umbrella-labels.json', 'utf8')).labels))
const POLICY = { 'echr-organ': true, government: true, court: true, company: false, other: false }
const SRC = 'raw/stripped/tab-dev-all-v1plain-gpu'
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.txt'))) {
  const tbl = JSON.parse(readFileSync(`${SRC}-tables/${f}.json`, 'utf8'))
  const orig = readFileSync(`raw/tab-docs/dev/${f}`, 'utf8')
  const aliases = R.institutionalGlossAliases(orig)
  let t = readFileSync(`${SRC}/${f}`, 'utf8')
  t = R.applyAppNumbersGuarded(t).text
  for (const rules of [R.L1_RULES_NO_CODE, R.L1C_RULES, R.L3_RULES, R.L4_RULES, R.L6_RULES])
    t = R.applyRulesProtected(t, rules, R.protectedRanges(t, aliases)).text
  t = R.applyL1bGuarded(t).text
  t = R.applyL8(t, aliases).text
  t = R.applyL9(t, aliases).text
  t = R.applyL9Wide(t, aliases).text
  t = R.foldOwnCaseCites(t)
  t = restoreByPolicy(t, tbl, labels, POLICY).text
  t = R.restoreOfficialPersons(t, tbl, orig).text
  writeFileSync(`${OUT}/${f}`, t)
}
console.log('rebuilt ->', OUT)
