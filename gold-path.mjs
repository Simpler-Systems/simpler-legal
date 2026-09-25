// Where the gold lives, for every tool that reads it.
//
// The published gold is offsets-only (see gold-offsets.mjs). Commands documented
// in BENCHMARK.md and the round writeups still name the original
// pii-bench/<set> paths, so those paths keep resolving: literal directory first
// if this machine has one, then the hydrated tree, then a loud failure naming
// the single command that fixes it.
import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'

export function resolveGold(spec, root) {
  const literal = join(root, spec)
  if (existsSync(literal)) return literal
  const hydrated = join(root, 'raw', 'gold-hydrated', basename(spec))
  if (existsSync(hydrated)) return hydrated
  console.error(`gold not found: ${spec}`)
  console.error('The published gold is offsets-only. Rebuild the corpus, then:  node gold-offsets.mjs hydrate')
  process.exit(2)
}

// Where a script that DERIVES gold should write it. Derived gold carries span
// text, so it belongs in the hydrated tree (gitignored) rather than back in
// pii-bench/, where re-running a projection would quietly restore the verbatim
// files this repository exists to not publish.
export function resolveGoldOut(spec, root) {
  const literal = join(root, spec)
  if (existsSync(literal)) return literal
  return join(root, 'raw', 'gold-hydrated', basename(spec))
}
