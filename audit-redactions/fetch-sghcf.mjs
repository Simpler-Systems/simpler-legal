#!/usr/bin/env node
// Fetch genuinely court-anonymized SG judgments (Family Division, letter-coded parties)
// from eLitigation. Keep only docs whose caption party is a 1-4 letter code.
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const OUT = join(HERE, 'redacted', 'sg-anon')
mkdirSync(OUT, { recursive: true })
const UA = 'simpler-legal research (support@simpler.asia)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

const kept = []
let misses = 0
for (let n = 1; n <= 120 && kept.length < 8 && misses < 30; n++) {
  const id = `2024_SGHCF_${n}`
  try {
    const res = await fetch(`https://www.elitigation.sg/gd/s/${id}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) })
    await sleep(300)
    if (!res.ok) { misses++; continue }
    const html = await res.text()
    if (html.length < 25000) { misses++; continue }
    const text = stripHtml(html)
    // anonymized caption: title "XX v XY" with 1-4 letter parties, or Between-zone letter code
    const title = (text.match(/\b([A-Z]{1,4})\s+v\s+([A-Z]{1,4})\b/) || [])
    const bi = text.search(/\bBetween\b/)
    const bParty = bi >= 0 ? (text.slice(bi, bi + 200).split('\n').map((s) => s.trim()).filter(Boolean)[1] || '') : ''
    const anon = (title[1] && title[2]) || /^[A-Z]{1,4}$/.test(bParty)
    if (!anon) { misses = 0; continue }
    misses = 0
    const name = `sg-anon-${String(kept.length + 1).padStart(2, '0')}.txt`
    writeFileSync(join(OUT, name), text)
    kept.push({ file: name, id, url: `https://www.elitigation.sg/gd/s/${id}`, caption: title[0] || bParty, words: text.split(/\s+/).length })
    console.log(`${name}  ${kept[kept.length - 1].caption}  ${kept[kept.length - 1].words}w  (${id})`)
  } catch { misses++ }
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(kept, null, 1))
console.log(`done: ${kept.length} anonymized SGHCF judgments`)
