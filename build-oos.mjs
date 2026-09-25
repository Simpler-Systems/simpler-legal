#!/usr/bin/env node
// Build the 100-doc out-of-sample (OOS) set for the PII-engine fork re-tests.
// Real, publicly available documents ONLY (owner ruling 2026-07-21) — and stress-selected,
// not volume-collected: we over-collect candidates from each source, rank them by a mechanical
// PII-surface density proxy, and keep the densest. Three sources, three genres:
//   us-opinion  full-length F.3d opinions from local CAP volumes (raw/f3d-*), excluding the 99
//               spike-corpus cases — fixes the long-doc gap (spike corpus is truncated at 16k chars)
//   sg-judgment Singapore High Court judgments from eLitigation (public, unauthenticated) —
//               SG-flavored identifiers (NRIC, UEN, +65 phones, local addresses)
//   edgar-ex10  SEC EDGAR EX-10 exhibits (employment/settlement agreements) — lawyer-drafted,
//               the closest freely available shape to firm-internal documents
// Batches 1 and 2 are stratified IDENTICALLY (~12/13/25 per source) so the protocol
// (TAB-tuned engine -> batch 1 -> batch 2 -> full 100) measures generalization, not genre shift.
// Text lands in raw/oos/ (gitignored, rebuildable); the committed record is
// pii-bench/oos-manifest.json + printed stats.
//
//   node build-oos.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const RAW = join(ROOT, 'raw')
const OOS = join(RAW, 'oos')
const WANT = { 'us-opinion': 25, 'sg-judgment': 25, 'edgar-ex10': 50 }
const OVERCOLLECT = 2 // gather ~2x candidates per source, keep the densest
const UA = 'simpler-legal research (support@simpler.asia)'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const words = (t) => t.split(/\s+/).length
const sha = (t) => createHash('sha256').update(t).digest('hex').slice(0, 16)

// ---- PII-surface density proxy (mechanical; the stress-selection signal) ----
// Not ground truth — a per-1k-words count of surfaces a stripper must reason about.
const PATTERNS = [
  [/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, 1], // capitalized bigrams (person/org name surfaces)
  [/\b[\w.+-]+@[\w-]+\.\w+\b/g, 8], // emails
  [/\b\d{3}-\d{2}-\d{4}\b/g, 10], // SSN-shaped
  [/\b[STFG]\d{7}[A-Z]\b/g, 10], // NRIC-shaped
  [/\b\d{6,10}[A-Z]?\b/g, 2], // long id/account-shaped numbers
  [/\(\d{3}\)\s?\d{3}-\d{4}|\+65\s?\d{4}\s?\d{4}/g, 8], // US / SG phones
  [/\$\s?[\d,]{4,}|S\$\s?[\d,]{4,}/g, 3], // money amounts
  [/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b|\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/g, 2], // full dates
]
function density(text) {
  const w = words(text) / 1000
  let score = 0
  for (const [re, wt] of PATTERNS) score += wt * (text.match(re) || []).length
  return +(score / (w || 1)).toFixed(1)
}

// ---- source 1: full-length CAP opinions from local volumes ----
function* walkJson(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) yield* walkJson(p)
    else if (e.endsWith('.json') && !e.includes('Metadata')) yield p
  }
}
function collectUS() {
  const used = new Set(JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')).map((s) => s.caseName))
  // existsSync first: raw/ is gitignored, so on a fresh clone readdirSync would throw a
  // bare ENOENT before the (correct) message below could ever be reached.
  const vols = existsSync(RAW)
    ? readdirSync(RAW).filter((d) => /^f3d-\d+$/.test(d)).sort()
    : []
  if (!vols.length) {
    console.error(
      `\nNo CAP F.3d volumes found in raw/ (raw/ is gitignored — it is rebuilt, not committed).\n` +
      `Build them first:\n\n    node build-corpus.mjs\n\n` +
      `That downloads the F.3d volumes from static.case.law into raw/f3d-*/.\n`)
    process.exit(1)
  }
  const cands = []
  for (const vol of vols) {
    for (const file of walkJson(join(RAW, vol))) {
      let j
      try { j = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
      const text = (j.casebody?.opinions || []).map((o) => o.text || '').join('\n\n').trim()
      const w = words(text)
      if (w < 1000 || used.has(j.name_abbreviation)) continue
      const volNum = vol.slice(4)
      const rel = file.slice(join(RAW, vol).length + 1).replace(/\\/g, '/')
      cands.push({
        source: 'us-opinion', title: j.name_abbreviation || j.name, cite: j.citations?.[0]?.cite || '',
        court: j.court?.name || '', date: j.decision_date || '',
        url: `https://static.case.law/f3d/${volNum}.zip (member: ${rel}, CAP id ${j.id})`,
        text, words: w, density: density(text),
      })
    }
  }
  // stratify by length so the long tail is represented, then densest first inside each bucket
  const buckets = [[1000, 3000], [3000, 8000], [8000, Infinity]]
  const perBucket = Math.ceil((WANT['us-opinion'] * OVERCOLLECT) / buckets.length)
  const picked = []
  for (const [lo, hi] of buckets) {
    picked.push(...cands.filter((c) => c.words >= lo && c.words < hi).sort((a, b) => b.density - a.density).slice(0, perBucket))
  }
  console.log(`us-opinion: ${cands.length} candidates in ${vols.length} local volumes -> ${picked.length} kept for ranking`)
  return picked
}

// ---- source 2: Singapore High Court judgments (eLitigation, public) ----
const stripHtml = (h) =>
  h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/h\d|\/li|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim()
async function collectSG() {
  const cands = []
  const seen = new Set()
  outer: for (const year of [2024, 2023]) {
    let misses = 0
    for (let n = 1; n <= 400 && misses < 25; n++) {
      if (cands.length >= WANT['sg-judgment'] * OVERCOLLECT) break outer
      const id = `${year}_SGHC_${n}`
      try {
        const res = await fetch(`https://www.elitigation.sg/gd/s/${id}`, { headers: { 'user-agent': UA } })
        await sleep(350)
        if (!res.ok) { misses++; continue }
        const html = await res.text()
        if (html.length < 30000 || !html.includes('SGHC')) { misses++; continue }
        const text = stripHtml(html)
        const w = words(text)
        if (w < 1000) { misses++; continue }
        const title = (html.match(/<title>\s*([^<]+?)\s*<\/title>/i) || [])[1] || id
        if (seen.has(title)) continue
        seen.add(title)
        misses = 0
        cands.push({
          source: 'sg-judgment', title, cite: `[${year}] SGHC ${n}`, court: 'General Division of the High Court of Singapore',
          date: String(year), url: `https://www.elitigation.sg/gd/s/${id}`,
          text, words: w, density: density(text),
        })
        if (cands.length % 10 === 0) console.log(`sg-judgment: ${cands.length} collected...`)
      } catch { misses++ }
    }
  }
  console.log(`sg-judgment: ${cands.length} candidates collected`)
  return cands
}

// ---- source 3: SEC EDGAR EX-10 exhibits (lawyer-drafted agreements) ----
async function collectEDGAR() {
  const cands = []
  const perCik = new Map()
  for (const q of ['%22employment agreement%22', '%22settlement agreement%22']) {
    for (let from = 0; from < 200 && cands.length < WANT['edgar-ex10'] * OVERCOLLECT; from += 10) {
      let hits
      try {
        const res = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${q}&forms=8-K&from=${from}`, { headers: { 'user-agent': UA } })
        await sleep(200)
        if (!res.ok) break
        hits = (await res.json()).hits?.hits || []
      } catch { break }
      if (!hits.length) break
      for (const h of hits) {
        const [acc, file] = h._id.split(':')
        const ft = h._source?.file_type || ''
        if (!/^EX-10/i.test(ft) && !/ex[-_]?10/i.test(file)) continue
        const cik = String(+h._source.ciks[0])
        if ((perCik.get(cik) || 0) >= 2) continue // diversity: max 2 docs per company
        try {
          const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${file}`
          const res = await fetch(url, { headers: { 'user-agent': UA } })
          await sleep(150)
          if (!res.ok) continue
          const text = stripHtml(await res.text())
          const w = words(text)
          if (w < 1000 || w > 78000) continue
          perCik.set(cik, (perCik.get(cik) || 0) + 1)
          cands.push({
            source: 'edgar-ex10', title: `${h._source.display_names?.[0] || cik} — ${ft || file}`,
            cite: acc, court: '', date: h._source.file_date || '',
            url, text, words: w, density: density(text),
          })
          if (cands.length % 10 === 0) console.log(`edgar-ex10: ${cands.length} collected...`)
        } catch { /* skip unfetchable exhibit */ }
      }
    }
  }
  console.log(`edgar-ex10: ${cands.length} candidates collected`)
  return cands
}

// ---- select, batch, write ----
function selectAndWrite(all) {
  mkdirSync(OOS, { recursive: true })
  const manifest = []
  for (const [source, want] of Object.entries(WANT)) {
    const pool = all.filter((c) => c.source === source).sort((a, b) => b.density - a.density)
    if (pool.length < want)
      console.error(`WARN: ${source} shortfall — wanted ${want}, have ${pool.length} (no silent caps: set is INCOMPLETE)`)
    const kept = pool.slice(0, want)
    // alternate batch assignment so both batches carry the same genre mix and density profile
    kept.forEach((c, i) => {
      const batch = i % 2 === 0 ? 1 : 2
      const fname = `${source}-${String(i + 1).padStart(2, '0')}.txt`
      const header =
        `Title: ${c.title}\nSource: ${c.url}\nCite: ${c.cite}\nDate: ${c.date}\nWords: ${c.words}\nPII-proxy-density: ${c.density}\nOOS-batch: ${batch}\n\n`
      writeFileSync(join(OOS, fname), header + c.text)
      manifest.push({
        file: `raw/oos/${fname}`, batch, source, title: c.title, cite: c.cite, date: c.date,
        url: c.url, words: c.words, density: c.density, sha256_16: sha(c.text),
      })
    })
  }
  const b = (n) => manifest.filter((m) => m.batch === n)
  const stat = (list) => {
    const ws = list.map((m) => m.words).sort((x, y) => x - y)
    const ds = list.map((m) => m.density).sort((x, y) => x - y)
    return `${list.length} docs, words ${ws[0]}-${ws[ws.length - 1]} (median ${ws[Math.floor(ws.length / 2)]}), density median ${ds[Math.floor(ds.length / 2)]}`
  }
  console.log(`\nbatch 1: ${stat(b(1))}`)
  console.log(`batch 2: ${stat(b(2))}`)
  for (const s of Object.keys(WANT))
    console.log(`  ${s}: batch1 ${b(1).filter((m) => m.source === s).length} / batch2 ${b(2).filter((m) => m.source === s).length}`)
  writeFileSync(
    join(ROOT, 'pii-bench', 'oos-manifest.json'),
    JSON.stringify({
      builtAt: new Date().toISOString(),
      protocol: 'TAB-tuned engine -> batch 1 (score) -> batch 2 (score) -> full 100 rerun',
      selection: `over-collected ~${OVERCOLLECT}x per source, kept densest by mechanical PII-surface proxy; batches stratified identically by source`,
      datasets: {
        'us-opinion': 'Caselaw Access Project static archive (public domain): https://static.case.law/ — per-doc URL gives volume zip + exact member path + CAP id',
        'sg-judgment': 'Singapore Courts eLitigation free judgments portal: https://www.elitigation.sg/gd — per-doc URL is the judgment page',
        'edgar-ex10': 'SEC EDGAR full-text search https://efts.sec.gov/LATEST/search-index (UI: https://efts.sec.gov/LATEST/search-index?q= via https://www.sec.gov/edgar/search/) + archives https://www.sec.gov/Archives/edgar/ — per-doc URL is the exhibit file',
      },
      docs: manifest,
    }, null, 1),
  )
  console.log(`\nwrote pii-bench/oos-manifest.json (${manifest.length} docs; text in raw/oos/, gitignored)`)
}

const us = collectUS()
const sg = await collectSG()
const ed = await collectEDGAR()
selectAndWrite([...us, ...sg, ...ed])
