// Build the synergy viewer and put it where the app actually loads it from.
//
// graph.mjs writes out/synergy.html, and out/ is gitignored (.gitignore:21).
// app/frontend/public/synergy.html is what the app serves, and nothing produced
// it — it was a hand copy. So an edit to synergy-viewer.html could look applied,
// pass a standalone check, and still not ship. This closes that gap:
//
//   node sync-viewer.mjs
//
// Run it after any edit to synergy-viewer.html, and commit BOTH files.
import { execFileSync } from 'node:child_process'
import { copyFileSync, statSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
const SRC = join(ROOT, 'out', 'synergy.html')
const DST = join(ROOT, 'app', 'frontend', 'public', 'synergy.html')

execFileSync(process.execPath, [join(ROOT, 'graph.mjs'), 'build'], { stdio: 'inherit' })
copyFileSync(SRC, DST)
console.log(`synced ${statSync(DST).size} bytes -> app/frontend/public/synergy.html`)

// The viewer's "Read the opinion" fetches cases/<file>. Those files are the
// corpus itself, so they are copied rather than regenerated — the bytes a reader
// opens in the app are the bytes graph.mjs indexed, not a second rendering of
// them. Every node in the graph must resolve to one, and the copy FAILS rather
// than skipping: a case that opens to "did not load" in a shipped build is the
// exact failure this step exists to prevent.
const GRAPH = JSON.parse(readFileSync(join(ROOT, 'out', 'graph.json'), 'utf8'))
const CASEDIRS = ['corpus', 'newcases']
const CASEOUT = [join(ROOT, 'app', 'frontend', 'public', 'cases'), join(ROOT, 'out', 'cases')]

for (const d of CASEOUT) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }) }

const missing = []
let copied = 0, bytes = 0
for (const node of GRAPH.nodes) {
  const src = CASEDIRS.map((d) => join(ROOT, d, node.file)).find((p) => existsSync(p))
  if (!src) { missing.push(node.file); continue }
  for (const d of CASEOUT) copyFileSync(src, join(d, node.file))
  copied++
  bytes += statSync(src).size
}
if (missing.length) {
  console.error(`
FAIL: ${missing.length} of ${GRAPH.nodes.length} cases have no source file:`)
  for (const f of missing.slice(0, 10)) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`synced ${copied}/${GRAPH.nodes.length} opinions (${(bytes / 1024).toFixed(0)} KB) -> public/cases/ and out/cases/`)
