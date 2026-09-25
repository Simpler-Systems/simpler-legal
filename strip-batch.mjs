#!/usr/bin/env node
// Drives simpler-red's shipped two-engine stripper over an OOS batch, unmodified — the
// baseline run of the protocol (ENGINE_PREP.md). Red's repo is consumed as a library and
// never modified. Labels are never read here: this side of the wall sees documents only.
//
//   node strip-batch.mjs --batch 1 --out red-baseline-full-b1 [--mode full|quick] [--port 49400]
//   node strip-batch.mjs --files us-opinion-02.txt --out smoke [--mode full]
//
// Outputs: raw/stripped/<out>/<file>            masked doc (same filename -> score-pii.mjs)
//          raw/stripped/<out>-tables/<file>.json  entity table (diagnosis; NOT the key dir name
//                                                red uses — tables stay local like everything)
//          raw/stripped/<out>/_run.json          per-doc timing + completeBy + failures
// Fail-closed per doc: an incomplete strip writes NO masked file (the scorer then flags the
// missing output and the run is invalid until explained).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const { anonymizeTwoEngine, anonymizeQuick } = await import('./lib-core/engineB.mjs')
const { anonymizeLegal, VERSION: LEGAL_VERSION } = await import('./lib-legal/engine.mjs')

const argv = process.argv.slice(2)
const flagVal = (n, d) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
// 49400 is the frozen serving port (FREEZE.md, tools/launch-server.{cmd,sh}).
// Precedence: --port flag > SIMPLER_LLAMA_PORT env > the frozen default.
const PORT = flagVal('--port', process.env.SIMPLER_LLAMA_PORT ?? '49400')
const MODE = flagVal('--mode', 'full')
const ENGINE = flagVal('--engine', 'v1') // v1 | v1-legal
const OUT = flagVal('--out', null)
if (!OUT) {
  console.error('need --out <run-dir-name>')
  process.exit(1)
}
const SRCDIR = flagVal('--srcdir', join(ROOT, 'raw', 'oos'))
const files = flagVal('--files', null)
  ? flagVal('--files').split(',')
  : flagVal('--list', null)
    ? JSON.parse(readFileSync(flagVal('--list'), 'utf8'))
    : JSON.parse(readFileSync(join(ROOT, 'pii-bench', 'batches.json'), 'utf8'))[`batch${flagVal('--batch', '1')}`].map((p) => p.split('/').pop())

async function complete(system, user, opts = {}) {
  const body = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0,
    max_tokens: opts.maxTokens ?? 400,
    stream: false,
  }
  if (opts.grammar) body.grammar = opts.grammar
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`local model http ${r.status}`)
  return (await r.json()).choices?.[0]?.message?.content ?? ''
}

const outDir = join(ROOT, 'raw', 'stripped', OUT)
const tblDir = join(ROOT, 'raw', 'stripped', `${OUT}-tables`)
mkdirSync(outDir, { recursive: true })
mkdirSync(tblDir, { recursive: true })

const health = await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json()).catch(() => null)
if (!health || health.status !== 'ok') {
  console.error(`no healthy model on :${PORT} — refusing to run`)
  process.exit(1)
}

const run = { engine: ENGINE === 'v1-legal' ? LEGAL_VERSION : 'v1', mode: MODE, port: PORT, startedAt: new Date().toISOString(), docs: [] }
for (const [i, f] of files.entries()) {
  const raw = readFileSync(join(SRCDIR, f), 'utf8')
  const t0 = Date.now()
  let r
  try {
    r = ENGINE === 'v1-legal' ? await anonymizeLegal(raw, complete) : MODE === 'quick' ? await anonymizeQuick(raw, complete) : await anonymizeTwoEngine(raw, complete)
  } catch (err) {
    run.docs.push({ file: f, ok: false, error: String(err).slice(0, 200) })
    console.error(`[${i + 1}/${files.length}] ${f}  THREW: ${String(err).slice(0, 120)}`)
    continue
  }
  const secs = Math.round((Date.now() - t0) / 1000)
  if (!r.complete) {
    run.docs.push({ file: f, ok: false, completeBy: r.completeBy, secs })
    console.error(`[${i + 1}/${files.length}] ${f}  INCOMPLETE (${secs}s) — no output written (fail-closed)`)
    continue
  }
  writeFileSync(join(outDir, f), r.masked)
  writeFileSync(join(tblDir, `${f}.json`), JSON.stringify(r.table, null, 1))
  run.docs.push({ file: f, ok: true, secs, tableRows: r.table.length })
  console.log(`[${i + 1}/${files.length}] ${f}  ok  ${secs}s  ${r.table.length} table rows`)
  // incremental: a killed run keeps its metadata (sleep-kill lesson, OPS_LEDGER 2026-07-22)
  writeFileSync(join(outDir, '_run.json'), JSON.stringify(run, null, 1))
}
run.finishedAt = new Date().toISOString()
run.ok = run.docs.filter((d) => d.ok).length
writeFileSync(join(outDir, '_run.json'), JSON.stringify(run, null, 1))
console.log(`\ndone: ${run.ok}/${files.length} complete -> raw/stripped/${OUT}`)
if (run.ok < files.length) process.exit(2)
