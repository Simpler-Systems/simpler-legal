#!/usr/bin/env node
// BACKFILL sha256_16 INTO THE ROUND MANIFESTS.
//
// Why this exists: oos-manifest.json has always carried a per-document
// sha256_16 (build-oos.mjs), but the round4–7, ukprobe, pureoos and
// comparebench manifests never did. Without it a rebuilt corpus cannot be
// proven byte-identical to the one the boards were scored against — and every
// downstream design that addresses documents by OFFSET (the publish-safe gold
// format) has no anchor.
//
// The corpus lives only in raw/, which is gitignored and exists on exactly one
// machine. This script pins it while that is still true. Run once; the pins are
// then committed and the local copies become disposable.
//
//   node backfill-manifest-sha.mjs            # write
//   node backfill-manifest-sha.mjs --check    # verify only, exit 3 on drift
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const CHECK = process.argv.includes('--check')
const sha = (t) => createHash('sha256').update(t).digest('hex').slice(0, 16)

// manifest -> the raw/ directory its `file` entries live in
const SETS = [
  ['pii-bench/round4-manifest.json', 'raw/round4'],
  ['pii-bench/round5-manifest.json', 'raw/round5'],
  ['pii-bench/round6-manifest.json', 'raw/round6'],
  ['pii-bench/round7-manifest.json', 'raw/round7'],
  ['pii-bench/ukprobe-manifest.json', 'raw/ukprobe'],
  ['pii-bench/pureoos-manifest.json', 'raw/pureoos'],
]

let wrote = 0, pinned = 0, missing = 0, drift = 0
for (const [mp, dir] of SETS) {
  const p = join(ROOT, mp)
  if (!existsSync(p)) { console.error(`SKIP  ${mp} — not found`); continue }
  const m = JSON.parse(readFileSync(p, 'utf8'))
  const docs = m.docs || []
  let touched = 0
  for (const d of docs) {
    const f = join(ROOT, dir, basename(d.file))
    if (!existsSync(f)) { console.error(`MISS  ${dir}/${basename(d.file)} — cannot pin`); missing++; continue }
    const got = sha(readFileSync(f, 'utf8'))
    if (d.sha256_16 && d.sha256_16 !== got) { console.error(`DRIFT ${d.file}: manifest ${d.sha256_16} vs disk ${got}`); drift++; continue }
    if (d.sha256_16 === got) { pinned++; continue }
    if (!CHECK) { d.sha256_16 = got; touched++ }
    pinned++
  }
  if (touched && !CHECK) {
    // pins are a provenance claim: record when and against what they were taken
    m.shaPinnedAt = m.shaPinnedAt || new Date().toISOString().slice(0, 10)
    m.shaNote = 'sha256_16 = first 16 hex of sha256 over the extracted text as scored. A rebuild that does not match these was not the corpus these boards measured.'
    writeFileSync(p, JSON.stringify(m, null, 1))
    wrote++
  }
  console.log(`${CHECK ? 'check' : 'pin  '} ${mp.padEnd(38)} ${docs.length} docs${touched ? ` · ${touched} newly pinned` : ''}`)
}
console.log(`\n${CHECK ? 'verified' : 'pinned'}: ${pinned} documents · manifests written: ${wrote} · missing: ${missing} · drift: ${drift}`)
if (drift || missing) { console.error('FAIL — corpus does not match the manifests'); process.exit(3) }
