#!/usr/bin/env node
// Twin probe v2: find TRUE raw/redacted pairs. Probe with distinctive proper-noun phrases
// (not boilerplate recitals); verify a candidate twin by TWO independent phrase hits AND
// successful anchor alignment of >=15 redaction sites before accepting.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BASE = join(HERE, 'redacted')
const RED = join(BASE, 'redacted')
const TWIN = join(BASE, 'raw-twin2')
mkdirSync(TWIN, { recursive: true })
const manifest = JSON.parse(readFileSync(join(BASE, 'manifest.json'), 'utf8'))
const UA = 'simpler-legal research (support@simpler.asia)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (s) => s.replace(/\s+/g, ' ').trim()

const MARK_RE = /\[\s?\*{1,8}\s?\]|\[(?:REDACTED|Redacted|OMITTED|Omitted|CONFIDENTIAL)\]|\*{2,8}/g
const countMarks = (t) => (t.match(MARK_RE) || []).length

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

function probePhrases(text) {
  const lines = text.split('\n').map((l) => l.trim())
  const good = []
  for (const l of lines) {
    if (l.length < 60 || l.length > 170) continue
    MARK_RE.lastIndex = 0
    if (MARK_RE.test(l)) continue
    const proper = (l.match(/\b[A-Z][a-z]{2,}\b/g) || []).length
    const generic = /this agreement|hereby|hereunder|witnesseth|in witness/i.test(l)
    if (proper >= 3 && !generic) good.push(l)
  }
  if (good.length < 2) return null
  const a = good[Math.floor(good.length * 0.2)]
  const b = good[Math.floor(good.length * 0.65)]
  return [norm(a).split(' ').slice(0, 12).join(' '), norm(b).split(' ').slice(0, 12).join(' ')]
}

function alignSites(red, raw) {
  const rawN = norm(raw)
  const sites = []
  MARK_RE.lastIndex = 0
  for (const m of red.matchAll(MARK_RE)) sites.push({ i: m.index, len: m[0].length })
  let aligned = 0
  const recovered = []
  for (const s of sites) {
    const aL = norm(red.slice(Math.max(0, s.i - 80), s.i)).slice(-55)
    const aR = norm(red.slice(s.i + s.len, s.i + s.len + 80)).slice(0, 55)
    if (aL.length < 20 || aR.length < 20) continue
    const iL = rawN.indexOf(aL)
    if (iL === -1) continue
    const iR = rawN.indexOf(aR, iL + aL.length)
    if (iR === -1 || iR - (iL + aL.length) > 400) continue
    const content = rawN.slice(iL + aL.length, iR).trim()
    if (!content) continue
    aligned++
    if (recovered.length < 400) recovered.push(content)
  }
  return { totalSites: sites.length, aligned, recovered }
}

const results = []
for (const e of manifest.slice(0, 22)) {
  const red = readFileSync(join(RED, e.file), 'utf8')
  const phrases = probePhrases(red)
  if (!phrases) continue
  let found = null
  for (const ph of phrases) {
    let hits
    try {
      const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${ph}"`)}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) })
      await sleep(250)
      if (!r.ok) continue
      hits = (await r.json()).hits?.hits || []
    } catch { continue }
    for (const h of hits.slice(0, 4)) {
      const [acc, file] = h._id.split(':')
      if (acc === e.accession) continue
      const cik = String(+h._source.ciks[0])
      const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${file}`
      let cand
      try {
        const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) })
        await sleep(200)
        if (!r.ok) continue
        cand = stripHtml(await r.text())
      } catch { continue }
      const candN = norm(cand)
      if (!candN.includes(phrases[0].slice(0, 55)) || !candN.includes(phrases[1].slice(0, 55))) continue
      if (countMarks(cand) > Math.max(2, countMarks(red) * 0.1)) continue
      const al = alignSites(red, cand)
      if (al.aligned >= 15) {
        found = { url, acc, company: h._source.display_names?.[0] || cik, ...al, cand }
        break
      }
    }
    if (found) break
  }
  if (found) {
    writeFileSync(join(TWIN, e.file), found.cand)
    results.push({ file: e.file, redCompany: e.company, twinCompany: found.company, twinUrl: found.url, totalSites: found.totalSites, aligned: found.aligned, recovered: found.recovered })
    console.log(`PAIR ${e.file}: ${e.company} -> twin @ ${found.company}  aligned ${found.aligned}/${found.totalSites}`)
  }
}
writeFileSync(join(BASE, 'pairs2.json'), JSON.stringify(results.map(({ recovered, ...r }) => ({ ...r, recoveredCount: recovered.length })), null, 1))
writeFileSync(join(BASE, 'pairs2-recovered.json'), JSON.stringify(results.map((r) => ({ file: r.file, recovered: r.recovered })), null, 1))
console.log(`done: ${results.length} verified pairs`)
