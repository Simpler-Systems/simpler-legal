#!/usr/bin/env node
// Fetch real REDACTED exhibits from SEC EDGAR (confidential-treatment legends), and for a
// subset probe full-text search for an UNREDACTED twin of the same agreement (other-party
// filing or post-CT refiling). Output: scratchpad redacted/{redacted,raw-twin}/*.txt + manifest.
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const OUT = join(HERE, 'redacted')
const RED = join(OUT, 'redacted')
const TWIN = join(OUT, 'raw-twin')
mkdirSync(RED, { recursive: true })
mkdirSync(TWIN, { recursive: true })

const UA = 'simpler-legal research (support@simpler.asia)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fetchJ = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) })
  await sleep(220)
  if (!r.ok) throw new Error(`http ${r.status}`)
  return r.json()
}
const fetchT = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) })
  await sleep(180)
  if (!r.ok) throw new Error(`http ${r.status}`)
  return r.text()
}

function stripHtml(html) {
  return html
    .replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#8216;|&#8217;|&#39;/g, "'")
    .replace(/&#821[12];|&#151;|&mdash;/g, '—').replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim()
}

// inline redaction markers (bare *** must sit inside a sentence, not a separator line)
const MARK_RE = /\[\s?\*{1,8}\s?\]|\[(?:REDACTED|Redacted|OMITTED|Omitted|CONFIDENTIAL)\]|\*{2,8}/g
function markerSites(text) {
  const sites = []
  for (const m of text.matchAll(MARK_RE)) {
    const i = m.index
    const lineStart = text.lastIndexOf('\n', i) + 1
    const lineEnd = (text.indexOf('\n', i) + 1 || text.length + 1) - 1
    const line = text.slice(lineStart, lineEnd)
    const bare = !m[0].startsWith('[')
    if (bare) {
      // separator/emphasis guard: need word chars within 35 chars on BOTH sides in the same line
      const before = text.slice(Math.max(lineStart, i - 35), i)
      const after = text.slice(i + m[0].length, Math.min(lineEnd, i + m[0].length + 35))
      if (!/\w/.test(before) || !/\w/.test(after)) continue
      if (/^\s*[*\s]+\s*$/.test(line)) continue
    }
    sites.push({ i, m: m[0] })
  }
  return sites
}

const LEGENDS = [
  '"Certain identified information has been excluded"', // post-2019 Reg S-K 601(b) legend
  '"Portions of this exhibit have been omitted"', // classic CT-order legend
]
const seen = new Set()
const manifest = []
const TARGET = 34

for (const legend of LEGENDS) {
  const q = encodeURIComponent(legend)
  for (let from = 0; from < 120 && manifest.length < TARGET; from += 10) {
    let hits
    try {
      hits = (await fetchJ(`https://efts.sec.gov/LATEST/search-index?q=${q}&from=${from}`)).hits?.hits || []
    } catch (e) {
      console.error(`FTS page failed (${legend} from=${from}): ${e.message}`)
      break
    }
    if (!hits.length) break
    for (const h of hits) {
      if (manifest.length >= TARGET) break
      const [acc, file] = h._id.split(':')
      const ft = h._source?.file_type || ''
      if (!/^EX-10|^EX-2/i.test(ft) && !/ex[-_.]?10/i.test(file)) continue
      if (seen.has(acc)) continue
      const cik = String(+h._source.ciks[0])
      const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${file}`
      let text
      try {
        text = stripHtml(await fetchT(url))
      } catch { continue }
      const w = text.split(/\s+/).length
      if (w < 800 || w > 90000) continue
      const sites = markerSites(text)
      if (sites.length < 3) continue // legend present but exhibit not meaningfully redacted
      seen.add(acc)
      const name = `red-${String(manifest.length + 1).padStart(2, '0')}.txt`
      writeFileSync(join(RED, name), text)
      manifest.push({
        file: name, url, company: h._source.display_names?.[0] || cik, date: h._source.file_date || '',
        form: h._source.root_forms?.[0] || h._source.file_type || '', accession: acc, legend, words: w, sites: sites.length,
      })
      console.log(`[${manifest.length}/${TARGET}] ${name}  ${sites.length} sites  ${w}w  ${manifest[manifest.length - 1].company}`)
    }
  }
}

// ---- twin probe: same agreement filed elsewhere without redaction ----
const { readFileSync } = await import('node:fs')
let twins = 0
for (const e of manifest.slice(0, 24)) {
  const text = readFileSync(join(RED, e.file), 'utf8')
  // distinctive probe: first recital-ish line >70 chars with no marker and >=8 words
  const line = text.split('\n').find(
    (l) => l.length > 70 && l.length < 400 && /agreement|AGREEMENT/i.test(l) && /\b(?:between|among|by and)\b/i.test(l) && !MARK_RE.test(l),
  )
  if (!line) continue
  const phrase = line.trim().split(/\s+/).slice(0, 10).join(' ')
  let hits
  try {
    hits = (await fetchJ(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${phrase}"`)}`)).hits?.hits || []
  } catch { continue }
  for (const h of hits) {
    const [acc, file] = h._id.split(':')
    if (acc === e.accession) continue
    const cik = String(+h._source.ciks[0])
    const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${file}`
    let cand
    try {
      cand = stripHtml(await fetchT(url))
    } catch { continue }
    if (!cand.includes(phrase.slice(0, 60))) continue
    const candSites = markerSites(cand)
    const ratio = cand.length / text.length
    if (candSites.length <= Math.max(1, e.sites * 0.1) && ratio > 0.85 && ratio < 2.2) {
      writeFileSync(join(TWIN, e.file), cand)
      e.twinUrl = url
      e.twinAccession = acc
      e.twinCompany = h._source.display_names?.[0] || cik
      e.twinSites = candSites.length
      twins++
      console.log(`  TWIN for ${e.file}: ${e.twinCompany} (${candSites.length} sites vs ${e.sites})`)
      break
    }
  }
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
console.log(`\ndone: ${manifest.length} redacted docs, ${twins} raw twins -> ${OUT}`)
