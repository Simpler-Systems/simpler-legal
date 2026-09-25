#!/usr/bin/env node
// PURE-OOS PROBE (owner, 2026-07-24): ONE document, maximally out-of-sample — filed in
// 2026 (post-dates every engine decision including the freeze), fresh query never used in
// any round, zero accession overlap with oos/r4/r5/r6/r7/comparebench. Rule stated before
// drawing; first qualifying hit wins (arrival order, n=1). The strip runs through the
// LIVE serve-legal adapter — the test covers the delivery vehicle, not just the engine.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const OUT = join(ROOT, 'raw', 'pureoos')
mkdirSync(OUT, { recursive: true })
const UA = 'simpler-legal research (support@simpler.asia)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const words = (t) => t.split(/\s+/).length

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

const used = new Set()
for (const m of ['oos-manifest.json', 'round4-manifest.json', 'round5-manifest.json', 'round6-manifest.json', 'round7-manifest.json']) {
  for (const d of JSON.parse(readFileSync(join(ROOT, 'pii-bench', m), 'utf8')).docs) if (d.cite) used.add(d.cite)
}
for (const p of JSON.parse(readFileSync(join(ROOT, 'pii-bench', 'comparebench-manifest.json'), 'utf8')).pairs) { used.add(p.v1.cite); used.add(p.v2.cite) }

let got = null
outer: for (let from = 0; from < 60 && !got; from += 10) {
  const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=%22transition agreement%22&forms=8-K&startdt=2026-01-01&enddt=2026-07-24&from=${from}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) })
  await sleep(250)
  if (!r.ok) break
  for (const h of (await r.json()).hits?.hits || []) {
    const [acc, file] = h._id.split(':')
    const ft = h._source?.file_type || ''
    if (!/^EX-10/i.test(ft) && !/ex[-_]?10/i.test(file)) continue
    if (used.has(acc)) continue
    const cik = String(+h._source.ciks[0])
    const rr = await fetch(`https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${file}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) })
    await sleep(200)
    if (!rr.ok) continue
    const text = stripHtml(await rr.text())
    const w = words(text)
    if (w < 1500 || w > 40000) continue
    writeFileSync(join(OUT, 'pureoos-01.txt'), text)
    got = { file: 'pureoos-01.txt', source: 'pureoos', title: h._source.display_names?.[0] || cik, cite: acc, filed: h._source?.file_date || '2026', url: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${file}`, words: w }
    console.log(`DRAWN: ${got.title}  filed ${got.filed}  ${w}w  ${acc}`)
    break outer
  }
}
if (!got) { console.error('no qualifying 2026 hit'); process.exit(2) }
writeFileSync(join(ROOT, 'pii-bench', 'pureoos-manifest.json'), JSON.stringify({ builtAt: '2026-07-24', protocol: 'PURE-OOS n=1: 2026-filed EX-10, fresh query (transition agreement), first qualifying hit, rule pre-registered; blind gold BEFORE strip; strip via LIVE serve-legal adapter; scored + adversarially leak-hunted; published as drawn', docs: [got] }, null, 1))
console.log('manifest written')
