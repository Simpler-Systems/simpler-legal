#!/usr/bin/env node
// ROUND 7 — fresh paper for the FS9/LN0/P0i/P0j fix-set (walk-forward law). 40 docs,
// arrival order, zero overlap with oos/round4/round5/round6:
//   15 edgar-r7   fresh queries: "severance agreement", "letter agreement"
//   10 us-r7      CAP F.3d unused cases (ascending volumes, exclusions incl. round6)
//   10 sg-r7      eLitigation 2020 SGHC (fresh year — oos 2024, r4 2023, r5 2022, r6 2021)
//    5 sghcf-r7   2021 SGHCF letter-coded (pseudonym-preservation; cited-code scoring debut)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const OUT = join(ROOT, 'raw', 'round7')
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

const manifest = []
const MANIFESTS = ['oos-manifest.json', 'round4-manifest.json', 'round5-manifest.json', 'round6-manifest.json']

async function collectEdgar() {
  const used = new Set()
  for (const m of MANIFESTS) {
    for (const d of JSON.parse(readFileSync(join(ROOT, 'pii-bench', m), 'utf8')).docs) if (d.cite) used.add(d.cite)
  }
  const perCik = new Map()
  let n = 0
  for (const q of ['%22severance agreement%22', '%22letter agreement%22']) {
    for (let from = 0; from < 120 && n < 15; from += 10) {
      let hits
      try {
        const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${q}&forms=8-K&from=${from}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) })
        await sleep(220)
        if (!r.ok) break
        hits = (await r.json()).hits?.hits || []
      } catch { break }
      if (!hits.length) break
      for (const h of hits) {
        if (n >= 15) break
        const [acc, file] = h._id.split(':')
        const ft = h._source?.file_type || ''
        if (!/^EX-10/i.test(ft) && !/ex[-_]?10/i.test(file)) continue
        if (used.has(acc)) continue
        const cik = String(+h._source.ciks[0])
        if ((perCik.get(cik) || 0) >= 1) continue
        let text
        try {
          const r = await fetch(`https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${file}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) })
          await sleep(180)
          if (!r.ok) continue
          text = stripHtml(await r.text())
        } catch { continue }
        const w = words(text)
        if (w < 1000 || w > 60000) continue
        perCik.set(cik, 1)
        n++
        const name = `edgar-r7-${String(n).padStart(2, '0')}.txt`
        writeFileSync(join(OUT, name), text)
        manifest.push({ file: name, source: 'edgar-r7', title: h._source.display_names?.[0] || cik, cite: acc, url: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${file}`, words: w })
        console.log(`[edgar ${n}/15] ${name} ${w}w`)
      }
    }
  }
}

function* walkJson(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) yield* walkJson(p)
    else if (e.endsWith('.json') && !e.includes('Metadata')) yield p
  }
}
// raw/ is gitignored — the lab bench is rebuilt, never committed. On a fresh clone the
// CAP volumes this round draws from simply are not there, so say so instead of throwing
// an ENOENT stack at the reader.
function f3dVolumes() {
  const RAWDIR = join(ROOT, 'raw')
  const vols = existsSync(RAWDIR)
    ? readdirSync(RAWDIR).filter((d) => /^f3d-\d+$/.test(d)).sort()
    : []
  if (!vols.length) {
    console.error(
      `\nNo CAP F.3d volumes found in raw/ (raw/ is gitignored — it is rebuilt, not committed).\n` +
      `This round draws its US docs from those volumes. Build them first:\n\n` +
      `    node build-corpus.mjs\n\n` +
      `That downloads the F.3d volumes from static.case.law into raw/f3d-*/.\n`)
    process.exit(1)
  }
  return vols
}

function collectUS() {
  const usedNames = new Set(JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')).map((s) => s.caseName))
  for (const m of MANIFESTS) {
    for (const d of JSON.parse(readFileSync(join(ROOT, 'pii-bench', m), 'utf8')).docs) if (d.title) usedNames.add(d.title)
  }
  let n = 0
  const vols = f3dVolumes()
  outer: for (const vol of vols) {
    for (const file of walkJson(join(ROOT, 'raw', vol))) {
      if (n >= 10) break outer
      let j
      try { j = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
      const text = (j.casebody?.opinions || []).map((o) => o.text || '').join('\n\n').trim()
      const w = words(text)
      if (w < 2000 || w > 40000 || usedNames.has(j.name_abbreviation)) continue
      usedNames.add(j.name_abbreviation)
      n++
      const name = `us-r7-${String(n).padStart(2, '0')}.txt`
      writeFileSync(join(OUT, name), `Title: ${j.name_abbreviation}\nSource: static.case.law (${vol}, CAP id ${j.id})\n\n${text}`)
      manifest.push({ file: name, source: 'us-r7', title: j.name_abbreviation, cite: j.citations?.[0]?.cite || '', url: `https://static.case.law/f3d/${vol.slice(4)}.zip (CAP id ${j.id})`, words: w })
      console.log(`[us ${n}/10] ${name} ${w}w ${j.name_abbreviation}`)
    }
  }
}

async function collectSG(prefix, year, court, want, startN = 1) {
  let n = 0, misses = 0
  for (let i = startN; i <= 300 && n < want && misses < 40; i++) {
    const id = `${year}_${court}_${i}`
    try {
      const r = await fetch(`https://www.elitigation.sg/gd/s/${id}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) })
      await sleep(300)
      if (!r.ok) { misses++; continue }
      const html = await r.text()
      if (html.length < 30000) { misses++; continue }
      misses = 0
      const text = stripHtml(html)
      const w = words(text)
      if (w < 1500 || w > 45000) continue
      if (prefix === 'sghcf-r7' && !text.match(/\b([A-Z]{1,4})\s+v\s+([A-Z]{1,4})\b/)) continue
      n++
      const name = `${prefix}-${String(n).padStart(2, '0')}.txt`
      writeFileSync(join(OUT, name), text)
      manifest.push({ file: name, source: prefix, title: `[${year}] ${court} ${i}`, cite: `[${year}] ${court} ${i}`, url: `https://www.elitigation.sg/gd/s/${id}`, words: w })
      console.log(`[${prefix} ${n}/${want}] ${name} ${w}w`)
    } catch { misses++ }
  }
}

await collectEdgar()
collectUS()
await collectSG('sg-r7', 2020, 'SGHC', 10)
await collectSG('sghcf-r7', 2021, 'SGHCF', 5)
writeFileSync(join(ROOT, 'pii-bench', 'round7-manifest.json'), JSON.stringify({ builtAt: '2026-07-24', protocol: 'ROUND 7: FS9/LN0/P0i/P0j fix-set first-contact; gold scheme closes the cited-code blind spot; blind swarm gold BEFORE engine; published as drawn; arrival order', docs: manifest }, null, 1))
console.log(`\nround 7: ${manifest.length} docs -> raw/round7/`)
