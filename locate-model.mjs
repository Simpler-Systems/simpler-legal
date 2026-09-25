#!/usr/bin/env node
// locate-model.mjs — the family model resolver (MODEL_DISCOVERY.md is the spec).
// Finds the shared E2B (or any cataloged model) already on the user's machine so no
// vertical ever re-downloads 3 GB. Bounded search only — NO full-disk crawl (privacy
// rule: a redaction product does not scan the desktop; past the known list, the user
// points a file picker).
//
//   node locate-model.mjs [--id gemma-4-E2B_q4_0-it] [--verify] [--link] [--json|--path]
//
// Dependency-free; usable as a module: locateModel({ id, verify }) -> { best, candidates }
import { readdirSync, statSync, linkSync, existsSync, createReadStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'

export const CATALOG = {
  'gemma-4-E2B_q4_0-it': {
    file: 'gemma-4-E2B_q4_0-it.gguf',
    bytes: 3349514112,
    sha256: '3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd',
  },
}

const HOME = homedir()
const APPDATA = process.env.APPDATA || join(HOME, 'AppData', 'Roaming')
const LOCALAPPDATA = process.env.LOCALAPPDATA || join(HOME, 'AppData', 'Local')
const XDG = process.env.XDG_DATA_HOME || join(HOME, '.local', 'share')

export function canonicalDir() {
  if (process.platform === 'win32') return join(APPDATA, 'Simpler AI', 'models')
  if (process.platform === 'darwin') return join(HOME, 'Library', 'Application Support', 'Simpler AI', 'models')
  return join(XDG, 'simpler-ai', 'models')
}

// Ordered, bounded, top-level-only. Each entry: [source-label, dir]
function searchDirs() {
  const dirs = []
  if (process.env.SIMPLER_MODEL_PATH) dirs.push(['env:SIMPLER_MODEL_PATH', process.env.SIMPLER_MODEL_PATH])
  dirs.push(['canonical', canonicalDir()])
  // legacy per-app dirs (pre-convention installs of any vertical)
  for (const v of ['simpler-red', 'simpler-legal', 'simpler-med', 'simpler-capital', 'simpler-tax', 'simpler-harness']) {
    dirs.push([`legacy:${v}`, join(LOCALAPPDATA, v, 'models')])
    dirs.push([`legacy:${v}`, join(APPDATA, v, 'models')])
  }
  // ecosystem caches, shallow
  dirs.push(['hf-cache', join(HOME, '.cache', 'huggingface', 'hub')])
  dirs.push(['lmstudio', join(HOME, '.lmstudio', 'models')])
  dirs.push(['lmstudio', join(HOME, '.cache', 'lm-studio', 'models')])
  dirs.push(['gpt4all', join(LOCALAPPDATA, 'nomic.ai', 'GPT4All')])
  dirs.push(['gpt4all', join(XDG, 'nomic.ai', 'GPT4All')])
  dirs.push(['jan', join(HOME, 'jan', 'models')])
  dirs.push(['ollama-blobs', join(HOME, '.ollama', 'models', 'blobs')])
  dirs.push(['user', join(HOME, 'Downloads')])
  dirs.push(['user', join(HOME, 'models')])
  return dirs
}

// list files max 2 levels deep (HF/LM-Studio nest one dir per repo), never deeper
function* filesIn(dir, depth = 0) {
  let names
  try { names = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of names) {
    const p = join(dir, e.name)
    if (e.isFile()) yield p
    else if (e.isDirectory() && depth < 2) yield* filesIn(p, depth + 1)
  }
}

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
}

export async function locateModel({ id = 'gemma-4-E2B_q4_0-it', verify = false } = {}) {
  const want = CATALOG[id]
  if (!want) throw new Error(`unknown model id ${id} — pin it in CATALOG first`)
  const candidates = []
  const seen = new Set()
  for (const [source, dir] of searchDirs()) {
    for (const p of filesIn(dir)) {
      if (seen.has(p.toLowerCase())) continue
      let st
      try { st = statSync(p) } catch { continue }
      const nameHit = p.toLowerCase().endsWith(want.file.toLowerCase())
      const sizeHit = st.size === want.bytes
      if (!nameHit && !sizeHit) continue // blob stores (ollama) match by size; others by name
      seen.add(p.toLowerCase())
      candidates.push({ path: p, bytes: st.size, sizeMatch: sizeHit, nameMatch: nameHit, source, verified: null })
    }
  }
  // best: canonical first, then size+name, then size only
  candidates.sort((a, b) =>
    (b.source === 'canonical') - (a.source === 'canonical') ||
    (b.sizeMatch && b.nameMatch) - (a.sizeMatch && a.nameMatch) ||
    b.sizeMatch - a.sizeMatch)
  const best = candidates[0] || null
  if (best && verify) best.verified = (await sha256File(best.path)) === want.sha256
  return { id, want, best, candidates }
}

export function linkIntoCanonical(candidate, want) {
  const dst = join(canonicalDir(), want.file)
  if (existsSync(dst)) return { linked: false, why: 'canonical copy already exists', dst }
  try {
    linkSync(candidate.path, dst)
    return { linked: true, dst }
  } catch (e) {
    return { linked: false, why: `hardlink failed (${e.code}) — different volume? reference in place instead`, dst }
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
if (isMain) {
  const argv = process.argv.slice(2)
  const flag = (n) => argv.includes(n)
  const val = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
  const r = await locateModel({ id: val('--id', 'gemma-4-E2B_q4_0-it'), verify: flag('--verify') })
  if (flag('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(r.best ? 0 : 2) }
  // --path: the best candidate's path on stdout and NOTHING else, so a shell can
  // capture it (tools/launch-server.{cmd,sh} do). Fail-closed: no candidate, or a
  // candidate whose sha was checked and did not match, prints nothing and exits 2.
  if (flag('--path')) {
    if (!r.best || r.best.verified === false) process.exit(2)
    console.log(r.best.path)
    process.exit(0)
  }
  console.log(`model: ${r.id} (${(r.want.bytes / 1e9).toFixed(2)} GB, sha ${r.want.sha256.slice(0, 12)}…)`)
  if (!r.candidates.length) { console.log('NOT FOUND in any bounded location — the app should offer download-to-canonical or a file picker'); process.exit(2) }
  for (const c of r.candidates) {
    console.log(`  [${c.source}] ${c.path}  size:${c.sizeMatch ? 'match' : 'MISMATCH(' + c.bytes + ')'}${c.verified === null ? '' : c.verified ? '  sha:VERIFIED' : '  sha:MISMATCH'}`)
  }
  const b = r.best
  console.log(`best: ${b.path}${b.verified === true ? ' (verified)' : b.verified === false ? ' (SHA MISMATCH — refuse)' : ' (unverified — run --verify)'}`)
  if (flag('--link') && b.source !== 'canonical' && b.verified !== false) {
    const l = linkIntoCanonical(b, r.want)
    console.log(l.linked ? `hardlinked -> ${l.dst}` : `no link: ${l.why}`)
  }
}
