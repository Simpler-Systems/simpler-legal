#!/usr/bin/env node
// Converts a stripped-output directory into the official evaluation.py input format:
// { doc_id: [[start,end], ...] } — masked spans as ORIGINAL-text character offsets.
// Recovery is a diff-walk: masked text = original with spans replaced by [Tag] tokens, so
// walking both strings and re-anchoring after each tag recovers the exact masked regions.
// Fail-loud: any doc where re-anchoring fails is reported and EXCLUDED (never guessed).
//   node to-official.mjs --stripped <dir> --split dev --out <file.json>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const argv = process.argv.slice(2)
const flagVal = (n, d) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const STRIPPED = flagVal('--stripped', null)
const SPLIT = flagVal('--split', 'dev')
const OUT = flagVal('--out', 'pii-bench/official-masked.json')
const TAG_RE = /^\[[A-Za-z]+\d*\]/

const { foldFullwidth } = await import('./lib-core/anonymize.mjs')
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isWs = (c) => /\s/.test(c)

const gold = new Map(JSON.parse(readFileSync(join(ROOT, 'raw', 'tab', `echr_${SPLIT}.json`), 'utf8')).map((d) => [d.doc_id, d.text]))
const result = {}
let failed = []
for (const f of readdirSync(STRIPPED).filter((x) => x.endsWith('.txt'))) {
  const id = f.replace('.txt', '')
  const rawOrig = gold.get(id)
  if (!rawOrig) continue
  // v1 masks over the FOLDED doc; offsets in folded == offsets in raw (fold is 1:1 per char)
  const orig = foldFullwidth(rawOrig)
  const masked = readFileSync(join(STRIPPED, f), 'utf8')
  const spans = []
  let i = 0, j = 0, ok = true, guard = 0
  while (j < masked.length && i < orig.length) {
    if (++guard > 200000) { ok = false; break }
    if (isWs(orig[i]) && isWs(masked[j])) {
      // consume whole whitespace runs on both sides (lengths may differ)
      while (i < orig.length && isWs(orig[i])) i++
      while (j < masked.length && isWs(masked[j])) j++
      continue
    }
    if (orig[i] === masked[j]) { i++; j++; continue }
    const tagM = TAG_RE.exec(masked.slice(j))
    if (!tagM) { ok = false; break }
    const spanStart = i
    j += tagM[0].length
    // consume any glue (whitespace/short punctuation) and further consecutive tags — they
    // all fold into one masked region
    let extended = true
    while (extended) {
      extended = false
      while (j < masked.length && isWs(masked[j])) { j++; extended = true }
      const again = TAG_RE.exec(masked.slice(j))
      if (again) { j += again[0].length; extended = true }
    }
    if (j >= masked.length) { spans.push([spanStart, orig.length]); i = orig.length; break }
    // re-anchor: next stable run (up to next tag), whitespace-run tolerant
    let anchorEnd = masked.indexOf('[', j)
    if (anchorEnd === -1) anchorEnd = masked.length
    const anchor = masked.slice(j, Math.min(j + 40, anchorEnd))
    const re = new RegExp(escRe(anchor).replace(/(\s|\\\s)+/g, '\\s+'))
    const m = re.exec(orig.slice(i))
    if (!m) { ok = false; break }
    const found = i + m.index
    if (found > spanStart) spans.push([spanStart, found])
    i = found
  }
  if (!ok) { failed.push(id); continue }
  // merge adjacent/overlapping spans
  spans.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    if (last && s[0] <= last[1] + 1) last[1] = Math.max(last[1], s[1])
    else merged.push([...s])
  }
  result[id] = merged
}
writeFileSync(join(ROOT, OUT), JSON.stringify(result))
console.log(`converted ${Object.keys(result).length} docs -> ${OUT}${failed.length ? `   FAILED re-anchor (excluded): ${failed.join(',')}` : ''}`)
if (failed.length > 3) process.exit(2)
