#!/usr/bin/env node
// Mine COURT-made redaction/anonymization conventions from (a) the 24 local F.3d CAP volumes
// and (b) the 25 local SG judgments. Pure local, no network. Output: JSON + console summary.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// derived from this file's location, not the author's machine
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const RAW = join(ROOT, 'raw')

// ---------- (a) F.3d: what do federal courts redact/pseudonymize, and how ----------
const CONVENTIONS = [
  ['redacted_block', /\[(?:REDACTED|Redacted|SEALED|Sealed)\]|\(REDACTED\)/g],
  ['ssn_partial', /\b(?:XXX-XX-\d{4}|\d{3}-\d{2}-XXXX|xxx-xx-\d{4})\b/g],
  ['account_partial', /\b(?:x{4,}|X{4,}|\*{4,})\d{2,4}\b|\bending (?:in )?\d{4}\b/g],
  ['doe_pseudonym', /\b(?:John|Jane|Richard|Baby|Mother|Father) Doe\b|\bDoes? [0-9IVX]+\b/g],
  ['minor_initials', /\b[A-Z]\.\s?[A-Z]\.(?:[A-Z]\.)?,? (?:a|the) (?:minor|juvenile|child|infant)\b/g],
  ['in_re_initials', /\bIn re [A-Z]\.\s?[A-Z]\.(?:[A-Z]\.)?\b/g],
  ['confidential_informant', /\bconfidential informants?\b|\bCI-\d+\b|\binformant(?:'s)? (?:name|identity)\b/g],
  ['asterisk_omission', /\*\s?\*\s?\*/g], // usually quotation ellipsis in opinions — counted for contrast
  ['juvenile_initials_caption', /\bUnited States v\. [A-Z]\.[A-Z]\.\b|\bv\. [A-Z]\.[A-Z]\., (?:a|the) juvenile\b/g],
]

function* walkJson(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) yield* walkJson(p)
    else if (e.endsWith('.json') && !e.includes('Metadata')) yield p
  }
}

const f3d = { volumes: 0, cases: 0, byConvention: {}, docsWith: {}, samples: {} }
for (const c of CONVENTIONS) {
  f3d.byConvention[c[0]] = 0
  f3d.docsWith[c[0]] = 0
  f3d.samples[c[0]] = []
}
const vols = readdirSync(RAW).filter((d) => /^f3d-\d+$/.test(d)).sort()
for (const vol of vols) {
  f3d.volumes++
  for (const file of walkJson(join(RAW, vol))) {
    let j
    try { j = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
    const text = (j.casebody?.opinions || []).map((o) => o.text || '').join('\n\n')
    if (text.length < 500) continue
    f3d.cases++
    for (const [name, re] of CONVENTIONS) {
      re.lastIndex = 0
      const ms = [...text.matchAll(re)]
      if (!ms.length) continue
      f3d.byConvention[name] += ms.length
      f3d.docsWith[name]++
      if (f3d.samples[name].length < 6) {
        const m = ms[0]
        const ctx = text.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70).replace(/\s+/g, ' ')
        f3d.samples[name].push({ case: j.name_abbreviation || '', ctx })
      }
    }
  }
}

// ---------- (b) SG: in court-anonymized judgments, what does the court KEEP ----------
const KEEP_SURFACES = [
  ['full_dates', /\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/g],
  ['ages', /\b(?:aged?|age of) \d{1,2}\b|\b\d{1,2} years? (?:old|of age)\b/g],
  ['occupations', /\b(?:teacher|driver|manager|director|engineer|nurse|doctor|surgeon|accountant|technician|supervisor|cleaner|hawker|contractor|banker|lecturer|professor|police officer|civil servant|businessman|salesman|clerk|odd-job)\b/gi],
  ['company_names', /\b[A-Z][\w&'’.-]*(?:\s+[A-Z][\w&'’.-]*){0,4}\s+(?:Pte\.?\s+Ltd|Pte\s+Limited|LLP|LLC)\b/g],
  ['sg_addresses', /\b(?:Blk|Block)\s?\d{1,4}[A-Z]?\b|#\d{2}-\d{2,4}\b|\bSingapore \d{6}\b/g],
  ['nric', /\b[STFG]\d{7}[A-Z]\b/g],
  ['phones', /\+65\s?\d{4}\s?\d{4}|\b[689]\d{3}\s?\d{4}\b/g],
  ['money', /\bS?\$\s?[\d,]+(?:\.\d\d)?\b/g],
  ['medical', /\b(?:schizophrenia|depression|cancer|HIV|diabetes|dementia|psychiatric|autism|bipolar)\b/gi],
]

const sg = { docs: 0, anonymized: [], named: [], keepInventory: {} }
for (const [k] of KEEP_SURFACES) sg.keepInventory[k] = { docs: 0, count: 0, samples: [] }
const oosDir = join(RAW, 'oos')
for (const f of readdirSync(oosDir).filter((f) => f.startsWith('sg-judgment'))) {
  const text = readFileSync(join(oosDir, f), 'utf8')
  sg.docs++
  const head = text.slice(0, 3000)
  // anonymized if caption/party zone shows 1-3 letter party codes or "v [A-Z]{1,3}" title
  const anon =
    /\n\s*[A-Z]{1,3}\s*\n/.test(head.replace(/\r/g, '')) &&
    (/\b(?:Between|And)\b/.test(head) || /\b[A-Z]{2,3} v [A-Z]{2,3}\b/.test(head)) &&
    !/\bPublic Prosecutor\b.{0,40}\bv\b/.test(head.slice(0, 400))
  const anon2 = /\b[A-Z]{2,3} v [A-Z]{2,3}\b/.test(head) || /referred to (?:herein )?as ["“][A-Z]{1,3}["”]/.test(text)
  if (anon || anon2) {
    sg.anonymized.push(f)
    for (const [k, re] of KEEP_SURFACES) {
      re.lastIndex = 0
      const ms = [...text.matchAll(re)]
      if (!ms.length) continue
      sg.keepInventory[k].docs++
      sg.keepInventory[k].count += ms.length
      if (sg.keepInventory[k].samples.length < 5)
        sg.keepInventory[k].samples.push(`${f}: ${ms[0][0]}`)
    }
  } else sg.named.push(f)
}

const out = { f3d, sg }
// output lands beside this script, where its consumer (aggregate-audit.mjs) reads it
writeFileSync(join(fileURLToPath(new URL('.', import.meta.url)), 'court-conventions.json'), JSON.stringify(out, null, 1))

console.log(`F.3d: ${f3d.cases} cases scanned across ${f3d.volumes} volumes`)
for (const [name] of CONVENTIONS)
  console.log(`  ${name.padEnd(28)} ${String(f3d.docsWith[name]).padStart(5)} docs  ${String(f3d.byConvention[name]).padStart(6)} hits`)
console.log(`\nSG: ${sg.docs} docs — ${sg.anonymized.length} court-anonymized (${sg.anonymized.join(', ')})`)
for (const [k] of KEEP_SURFACES) {
  const v = sg.keepInventory[k]
  console.log(`  kept ${k.padEnd(16)} in ${v.docs}/${sg.anonymized.length} anon docs (${v.count} hits)  e.g. ${v.samples[0] || '-'}`)
}
