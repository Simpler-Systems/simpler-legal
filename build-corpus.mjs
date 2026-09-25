#!/usr/bin/env node
// Build the legal corpus from the Caselaw Access Project static archive (public domain,
// no auth): https://static.case.law — F.3d volumes, full opinion text.
// Pool cases from a spread of volumes, assign each to at most ONE of 10 legal topics by
// keyword signal, keep 10 per topic: 9 -> corpus/, 1 -> newcases/. Topic = ground-truth cluster.
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const RAW = join(ROOT, 'raw')
const VOLUMES = [
  100, 180, 260, 340, 420, 500, 560, 620, 680, 740, 800, 850,
  210, 300, 380, 460, 540, 590, 650, 710, 770, 820, 880, 895,
]

const TOPICS = [
  { slug: 'fourth-amendment', all: [[/fourth amendment/g, 3], [/suppress/g, 2]] },
  { slug: 'title-vii', all: [[/title vii/g, 3], [/discriminat/g, 3]] },
  { slug: 'patent', all: [[/patent/g, 8], [/infring/g, 2]] },
  { slug: 'bankruptcy', all: [[/bankruptc/g, 6], [/debtor/g, 3]] },
  { slug: 'asylum', all: [[/asylum/g, 4], [/persecut/g, 2]] },
  { slug: 'insurance', all: [[/insur/g, 8], [/coverage|policy/g, 5]] },
  { slug: 'negligence', all: [[/negligen/g, 5], [/injur/g, 3]] },
  { slug: 'contract', all: [[/breach of contract/g, 2], [/contract/g, 8]] },
  { slug: 'defamation', all: [[/defamat|libel|slander/g, 4]] },
  { slug: 'trade-secret', all: [[/trade secret/g, 3]] },
]

const hits = (text, re) => (text.match(re) || []).length
function classify(text) {
  let best = null
  for (const t of TOPICS) {
    let ok = true
    let strength = 0
    for (const [re, min] of t.all) {
      const h = hits(text, re)
      if (h < min) {
        ok = false
        break
      }
      strength += h / min
    }
    if (ok && (!best || strength > best.strength)) best = { slug: t.slug, strength }
  }
  return best?.slug ?? null
}

function* walkJson(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) yield* walkJson(p)
    else if (e.endsWith('.json') && !e.includes('Metadata')) yield p
  }
}

async function ensureVolume(vol) {
  const dir = join(RAW, `f3d-${vol}`)
  if (existsSync(dir)) return dir
  const zipPath = join(RAW, `f3d-${vol}.zip`)
  if (!existsSync(zipPath)) {
    console.log(`downloading f3d vol ${vol}...`)
    const r = await fetch(`https://static.case.law/f3d/${vol}.zip`)
    if (!r.ok) throw new Error(`HTTP ${r.status} for volume ${vol}`)
    writeFileSync(zipPath, Buffer.from(await r.arrayBuffer()))
  }
  mkdirSync(dir, { recursive: true })
  const res = spawnSync('C:\\Windows\\System32\\tar.exe', ['-xf', zipPath, '-C', dir], {
    stdio: 'inherit',
  })
  if (res.status !== 0) throw new Error(`tar failed for volume ${vol}`)
  return dir
}

mkdirSync(RAW, { recursive: true })
const byTopic = Object.fromEntries(TOPICS.map((t) => [t.slug, []]))
const need = () => TOPICS.filter((t) => byTopic[t.slug].length < 10).map((t) => t.slug)

for (const vol of VOLUMES) {
  if (!need().length) break
  const dir = await ensureVolume(vol)
  let scanned = 0
  for (const file of walkJson(dir)) {
    let j
    try {
      j = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    const ops = j.casebody?.opinions || []
    let text = ops.map((o) => o.text || '').join('\n\n').trim()
    if (text.length < 3000) continue
    scanned++
    const slug = classify(text.toLowerCase())
    if (!slug || byTopic[slug].length >= 10) continue
    if (text.length > 16000) text = text.slice(0, 16000) + '\n\n[truncated for spike corpus]'
    byTopic[slug].push({
      caseName: j.name_abbreviation || j.name || 'Unknown',
      court: j.court?.name || '',
      date: j.decision_date || '',
      cite: j.citations?.[0]?.cite || '',
      capId: j.id,
      text,
    })
  }
  console.log(
    `vol ${vol}: scanned ${scanned} usable cases; still need: ${need().join(', ') || 'none'}`,
  )
}

const manifest = []
let clusterId = 0
for (const t of TOPICS) {
  clusterId++
  const docs = byTopic[t.slug]
  docs.forEach((d, i) => {
    const isHoldout = i === 9
    const file = isHoldout
      ? join(ROOT, 'newcases', `c${clusterId}-${t.slug}-new.txt`)
      : join(ROOT, 'corpus', `c${clusterId}-${t.slug}-doc${i + 1}.txt`)
    const header = `Case: ${d.caseName}\nCourt: ${d.court}\nDate: ${d.date}\nCitation: ${d.cite}\nSource: Caselaw Access Project (public domain), CAP id ${d.capId}\n\n`
    writeFileSync(file, header + d.text)
    manifest.push({
      file: file.slice(ROOT.length),
      caseName: d.caseName,
      court: d.court,
      date: d.date,
      cite: d.cite,
      cluster: clusterId,
    })
  })
  console.log(
    `c${clusterId} ${t.slug.padEnd(17)} ${Math.min(docs.length, 9)} corpus + ${docs.length >= 10 ? 1 : 0} holdout${docs.length < 10 ? '  << SHORT' : ''}`,
  )
}
writeFileSync(join(ROOT, 'sources.json'), JSON.stringify(manifest, null, 2))
console.log(`Total: ${manifest.length} docs. Wrote sources.json`)
