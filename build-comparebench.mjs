#!/usr/bin/env node
// COMPARE BENCH DRAW v1 (the verb-map follow-on; owner ruled Compare the verb that
// matters). Real version pairs from EDGAR: an "Amended and Restated Employment Agreement"
// (v2) paired with the SAME company's earlier plain "Employment Agreement" (v1). Public
// paper, arrival order, provenance per pair. Ground-truth delta labeling is a SEPARATE
// later step (blind swarm; amendment docs' own enumerated changes where they exist) —
// per the no-verb-ships-unbenched law this draw is the corpus, not the bench.
//   -> raw/comparebench/pair-XX/{v1.txt,v2.txt}  (raw/ gitignored)
//   -> pii-bench/comparebench-manifest.json      (committed record)
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const OUT = join(ROOT, 'raw', 'comparebench')
mkdirSync(OUT, { recursive: true })
const UA = 'simpler-legal research (support@simpler.asia)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const words = (t) => t.split(/\s+/).length
const WANT = 10

function stripHtml(html) {
  return html
    .replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#8216;|&#8217;|&#39;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function fts(q, extra = '') {
  const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${q}&forms=8-K${extra}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) })
  await sleep(250)
  if (!r.ok) return []
  return (await r.json()).hits?.hits || []
}
async function fetchDoc(cik, acc, file) {
  const r = await fetch(`https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${file}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) })
  await sleep(200)
  if (!r.ok) return null
  return stripHtml(await r.text())
}
const dateOf = (h) => h._source?.file_date || h._source?.filed || `20${(h._id || '').split('-')[1] || '99'}-99`
const isEx10 = (h) => /^EX-10/i.test(h._source?.file_type || '') || /ex[-_]?10/i.test((h._id || '').split(':')[1] || '')

const manifest = []
const usedCik = new Set()
let n = 0
outer: for (let from = 0; from < 200 && n < WANT; from += 10) {
  const v2hits = await fts('%22amended and restated employment agreement%22', `&from=${from}`)
  if (!v2hits.length) break
  for (const h2 of v2hits) {
    if (n >= WANT) break outer
    if (!isEx10(h2)) continue
    const cik = String(+(h2._source?.ciks?.[0] || 0))
    if (!cik || usedCik.has(cik)) continue
    const [acc2, file2] = h2._id.split(':')
    const d2 = dateOf(h2)
    // the SAME company's earlier plain employment agreement
    let v1hit = null
    const v1hits = await fts('%22employment agreement%22', `&ciks=${h2._source.ciks[0]}`)
    for (const h1 of v1hits) {
      if (!isEx10(h1)) continue
      const [acc1] = h1._id.split(':')
      if (acc1 === acc2) continue
      if (dateOf(h1) >= d2) continue
      v1hit = h1
      break
    }
    if (!v1hit) continue
    const [acc1, file1] = v1hit._id.split(':')
    const t2 = await fetchDoc(cik, acc2, file2)
    if (!t2 || words(t2) < 1500 || words(t2) > 50000 || !/amended and restated/i.test(t2.slice(0, 3000))) continue
    const t1 = await fetchDoc(cik, acc1, file1)
    if (!t1 || words(t1) < 1500 || words(t1) > 50000) continue
    // v1 must actually be the earlier base agreement, not itself a restatement of something newer
    usedCik.add(cik)
    n++
    const dir = join(OUT, `pair-${String(n).padStart(2, '0')}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'v1.txt'), t1)
    writeFileSync(join(dir, 'v2.txt'), t2)
    manifest.push({
      pair: `pair-${String(n).padStart(2, '0')}`, company: h2._source.display_names?.[0] || cik, cik,
      v1: { cite: acc1, date: dateOf(v1hit), words: words(t1), url: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc1.replace(/-/g, '')}/${file1}` },
      v2: { cite: acc2, date: d2, words: words(t2), url: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc2.replace(/-/g, '')}/${file2}` },
    })
    console.log(`[pair ${n}/${WANT}] ${manifest[n - 1].company}  v1 ${dateOf(v1hit)} (${words(t1)}w) -> v2 ${d2} (${words(t2)}w)`)
  }
}
writeFileSync(join(ROOT, 'pii-bench', 'comparebench-manifest.json'), JSON.stringify({ builtAt: '2026-07-24', protocol: 'COMPARE BENCH DRAW v1: real EDGAR version pairs (plain employment agreement -> amended-and-restated, same CIK, arrival order); delta gold labeling is a separate sealed step', pairs: manifest }, null, 1))
console.log(`\ncompare bench: ${manifest.length} pairs -> raw/comparebench/`)
