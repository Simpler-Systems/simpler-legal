#!/usr/bin/env node
// Extract TAB dev/test docs to plain files for the strip loop, and pick the deterministic
// 25-doc dev slice (every 5th by sorted doc_id) used as the fast tuning iteration set.
//   node tab-extract.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
for (const split of ['dev', 'test']) {
  const docs = JSON.parse(readFileSync(join(ROOT, 'raw', 'tab', `echr_${split}.json`), 'utf8'))
  const dir = join(ROOT, 'raw', 'tab-docs', split)
  mkdirSync(dir, { recursive: true })
  for (const d of docs) writeFileSync(join(dir, `${d.doc_id}.txt`), d.text)
  console.log(`${split}: ${docs.length} docs -> raw/tab-docs/${split}`)
  if (split === 'dev') {
    const ids = docs.map((d) => d.doc_id).sort()
    const slice = ids.filter((_, i) => i % 5 === 0)
    writeFileSync(join(ROOT, 'pii-bench', 'tab-slice25.json'), JSON.stringify(slice.map((id) => `${id}.txt`), null, 1))
    console.log(`slice: ${slice.length} docs -> pii-bench/tab-slice25.json`)
  }
}
