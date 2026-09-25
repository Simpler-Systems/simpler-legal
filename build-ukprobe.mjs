#!/usr/bin/env node
// UK TRANSFER PROBE (owner ruling 2026-07-24: per-country packs, top 3 SG/US/UK).
// 10 UK judgments from The National Archives' Find Case Law (Open Justice Licence,
// attribution retained via per-doc URL): 6 EWHC civil + 4 Family Division (the initials-
// anonymization transfer test). The courts pack runs UNCHANGED — this measures what
// Commonwealth structural heritage buys before any UK rail is written.
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const OUT = join(ROOT, 'raw', 'ukprobe')
mkdirSync(OUT, { recursive: true })
const UA = 'simpler-legal research (support@simpler.asia)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const words = (t) => t.split(/\s+/).length

function stripHtml(html) {
  return html
    .replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h\d|table|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#8216;|&#8217;|&#39;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim()
}

const manifest = []
async function collect(court, prefix, year, want) {
  let n = 0, misses = 0
  for (let i = 1; i <= 400 && n < want && misses < 60; i++) {
    const path = `${court}/${year}/${i}`
    try {
      const r = await fetch(`https://caselaw.nationalarchives.gov.uk/${path}`, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(25000) })
      await sleep(500)
      if (!r.ok) { misses++; continue }
      const html = await r.text()
      if (html.length < 20000) { misses++; continue }
      misses = 0
      const text = stripHtml(html)
      const w = words(text)
      if (w < 2000 || w > 40000) continue
      n++
      const name = `${prefix}-${String(n).padStart(2, '0')}.txt`
      writeFileSync(join(OUT, name), text)
      manifest.push({ file: name, source: prefix, cite: `[${year}] ${court.toUpperCase().replace(/\//g, ' ')} ${i}`, url: `https://caselaw.nationalarchives.gov.uk/${path}`, licence: 'Open Justice Licence', words: w })
      console.log(`[${prefix} ${n}/${want}] ${name} ${w}w`)
    } catch { misses++ }
  }
}
await collect('ewhc/kb', 'uk-civ', 2024, 6)
await collect('ewhc/fam', 'uk-fam', 2024, 4)
writeFileSync(join(ROOT, 'pii-bench', 'ukprobe-manifest.json'), JSON.stringify({ builtAt: '2026-07-24', protocol: 'UK transfer probe: courts pack UNCHANGED; blind gold before engine; published as drawn', docs: manifest }, null, 1))
console.log(`\nuk probe: ${manifest.length} docs -> raw/ukprobe/`)
