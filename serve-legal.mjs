#!/usr/bin/env node
// serve-legal.mjs — THE ENGINE ADAPTER. The frozen v1-legal pipeline (FREEZE.md is the
// version of record) behind one localhost endpoint the app can speak. The service runs the
// SAME committed scripts the walk-forward rounds ran — byte-identity with the frozen chain
// is by construction, not by re-implementation. The engine stays frozen; this file only
// hosts it.
//
//   node serve-legal.mjs [--port 1436] [--llama 49400] [--no-token-file]
//
//   GET  /health          -> { ok, llama, engine }
//   GET  /hello           x-simpler-challenge: <64 hex>  -> { payload, proof }
//                         the service proving itself to the app (below); no document text
//   POST /strip {text, filename?, profile?, llamaPort?}   profile: "auto" (default) | "firm"
//        llamaPort: the model port for THIS run's stages (default --llama); see "The model
//        port" below
//        authorization: Bearer <this launch's token> — refused with 401 before the body is read
//        -> NDJSON stream: {stage} lines, then {done, genre, final, rows}
//        -> 503 before any work if the llama upstream is unhealthy (fail-loud; the app
//           falls back to its in-webview core and SAYS SO — no silent degradation, and
//           the frozen config is never imitated without its model)
//
// Who may talk to this service, and how the app knows it is talking to THIS one (LAUNCH.md
// §2.4, site-audit L7, 2026-09-23). Until then it answered every caller with
// access-control-allow-origin '*' and checked neither Host nor any credential. Measured on a
// scratch port: a cross-origin page's text/plain POST — a "simple" request, so no browser
// sends a preflight — was written to disk, started the chain, and the page could read the
// stream back, stage errors and the absolute install path included; Host: attacker.example
// (DNS rebinding) was served the same. Four gates now, in this order:
//   1. Host must be 127.0.0.1:<port> or localhost:<port>. A page that reaches 127.0.0.1
//      through a DNS name it controls sends that name here, and is refused.
//   2. Origin, when a browser sends one, must be the dev server's: http://localhost:1435 or
//      http://127.0.0.1:1435 (app/frontend/vite.config.ts, strictPort). The packaged app
//      sends none: every request it makes comes from engine.rs, and its webview's CSP
//      (default-src 'self') cannot reach this port. The Tauri webview origins are NOT on the
//      list on purpose: http://tauri.localhost is the origin of every Tauri 2 app on
//      Windows, so allowing it would admit other vendors' windows and nothing of ours.
//      A page's no-cors GET (<script src>, <img src>) carries NO Origin, so this gate alone
//      let any website learn from a load/error event that this service runs and whether its
//      model is loaded, and make it probe the model port (measured 2026-09-23: GET /health
//      from a <script> on another site, 200, one model call). Such a request does carry
//      Sec-Fetch-Site (Chromium, Edge, Firefox 90+, Safari 16.4+), so a request that says it
//      came from another site and names no allowed Origin is refused too. A browser too old
//      to send Sec-Fetch-Site still gets that answer from /health; /hello and /strip refuse
//      it regardless (a custom header and a bearer, neither of which a no-cors request can
//      carry).
//   3. POST /strip, the one endpoint that carries or returns document text, needs this
//      launch's token as a bearer credential.
//   4. GET /hello runs the other way. The caller sends a random challenge, and the answer is
//      HMAC-SHA256(token, challenge + what this service is), which only a holder of the token
//      can compute. engine.rs sends /hello and then /strip on the SAME connection, so the
//      process that proved itself is the process that receives the document. A process that
//      took the port first (another user's, on a shared RDS or Citrix host, or a stale one)
//      cannot answer, and the app refuses it in plain words and sends it nothing.
//
// The token. SIMPLER_LEGAL_TOKEN when set — the app sets it when it spawns this, together
// with --no-token-file, so the token exists only in the two processes' memory. Otherwise 32
// random bytes, new every launch, written to tokenFile(port) below: a file under the user's
// own profile (%LOCALAPPDATA%\Simpler AI\run\legal-service-<port>.token on Windows), which is
// how the app reaches a service it did not start, the developer flow. The app says on
// screen when it is doing that, and the receipt says it too. The file is written only once
// this process holds the port: a second `node serve-legal.mjs` on a port already in use used
// to overwrite the running service's token, then delete it on its way out, and the app then
// refused the service that was working (measured 2026-09-23). The file is removed at exit
// while it still holds this launch's token; a hard-killed process leaves it behind, holding a
// token no running process answers to, and the next launch on that port overwrites it.
//   Browser dev mode (npm run dev, a plain browser): the page has to send the same token.
//   Hand it to vite before it starts, from the file — PowerShell:
//     $env:VITE_SIMPLER_LEGAL_TOKEN = (Get-Content "$env:LOCALAPPDATA\Simpler AI\run\legal-service-1436.token")
//   or fix one value for both processes (SIMPLER_LEGAL_TOKEN for this, VITE_SIMPLER_LEGAL_TOKEN
//   for vite) so restarting this does not mean restarting vite. Anything the dev server
//   serves can read that value; it is a developer convenience, not the app's road.
//
// Scratch on disk — stated here because the app says it out loud (History screen):
//   The frozen chain is a chain of COMMITTED SCRIPTS that read and write FILES. Running it
//   without re-implementing it — which is the whole point, byte-identity by construction —
//   means the document has to land on disk: strip-batch.mjs reads --srcdir/--files, and every
//   apply-* stage reads the stage before it. So each /strip request gets its own
//   raw/stripped/_serve/<id>/, holding the UNREDACTED document, the part-masked
//   intermediates, and sub-tables/doc.txt.json — the span -> tag key, i.e. the one file that
//   un-redacts the output.
//   That tree is removed in a `finally` when the run ends, whether it returned or threw, and
//   the removal is VERIFIED: an rm that quietly failed is the original defect (until
//   2026-09-13 nothing deleted these at all, and three trees from 2026-07-24 were still on
//   disk while the UI said "nothing is written to disk except your exports"). Whatever an
//   earlier process left behind — crash, kill, power loss — is swept AT BOOT, once this
//   process holds the port and before it serves its first request. A tree is named for the
//   port its service listens on (p<port>-…), and a boot sweeps only its own port's trees:
//   holding the port is what proves no live process is using them, and a second service on
//   another port (the developer's, beside the app's) must not delete a document mid-run.
//   The SIGINT/SIGTERM sweep is a courtesy on top: on Windows a signal from another
//   process runs no handler at all (measured), so the boot sweep is the guarantee.
//   A run whose caller hangs up is stopped: the running stage is killed and the next is not
//   started. engine.rs hangs up when its relay refuses a connection mid-run (the model server
//   it checked is no longer the one answering) or that server exits, and this is what keeps
//   the rest of the document from being offered to whatever holds the port next.
//
// The model port, per run (2026-09-23). The chain's stages reach the model at
// http://127.0.0.1:<--port> (frozen). The app no longer lets them dial the model server
// directly: it runs a relay inside the app that checks, on EVERY connection, which process is
// answering on the model port before a byte of the document goes to it (engine.rs, relay.rs).
// Before that the app checked the model once per document and then trusted the port for the
// whole run; a process that took the port mid-run received the rest (measured: 29 requests).
// So /strip takes llamaPort, and this run's health check and all four stages use it. The app
// sends a relay port opened for that run alone (relay.rs begin_run): it is how the relay knows
// which document a call belongs to, so a document's result is read only once its own calls
// are settled and a lost call stops that document and no other. A service the app starts is
// also given the relay's shared port as --llama; a
// service started by hand keeps its own --llama for /health and /hello, and the app sends
// llamaPort on every run. /hello says llamaPerRun: true so the app can refuse an older copy
// of this file, which would ignore llamaPort and send the document straight to the port.
//
// Proxies (2026-09-23). Node 22.22.3 sends fetch() through HTTP_PROXY when NODE_USE_ENV_PROXY=1
// or NODE_OPTIONS holds --use-env-proxy — to 127.0.0.1 too, as a CONNECT tunnel the proxy
// could open and read (measured). The stages inherit this process's environment, so under
// those settings every chunk of the document would pass through the proxy. The app removes
// them when it starts this service; a service started by hand with them set refuses to start
// (proxyHazard below), and says which setting to remove.
//   The ADDRESS is not a choice: strip-batch.mjs resolves --out as
//   join(ROOT,'raw','stripped',OUT) and is FROZEN (FREEZE.md), so this cannot move to
//   os.tmpdir() without editing a frozen file. raw/ is gitignored, so nothing here reaches a
//   commit. Deletion is what makes it safe, not the location.
//
// Genre router (deterministic, the packs' missing component, v1):
//   courts  = anonymized-court doc (isAnonCourtDoc) OR neutral citation ([2021] SGHC 123,
//             F.3d/F.Supp) OR case caption/judgment markers in the head
//   product = everything else (EDGAR-shaped business paper — the product genre)
// Frozen per-genre stages (FREEZE.md):
//   product: v2(cite,rails,fs7,bizdate) -> lq(1, skip JOB)
//   courts:  v2(same) -> ln(0,1,2,3 deglue+tables) -> lq(1,2, skip EMPLOYER,JOB)
// Profile "firm" changes exactly ONE argument of that chain — the v2 stage runs --profile firm
// instead of --profile product. Genre still picks the stages; the LN and LQ argv are untouched.
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync, renameSync, chmodSync, statSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { homedir } from 'node:os'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
const PORT = +flag('--port', '1436')
const LLAMA = flag('--llama', process.env.SIMPLER_LLAMA_PORT ?? '49400')
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href

// ── the token and the four gates (header: "Who may talk to this service") ───────────────
// engine.rs and lib/tauri.ts compute the same proof; the three are one protocol.
export const PROOF_CONTEXT = 'simpler-legal-service/1'
export const TOKEN_RE = /^[A-Za-z0-9_-]{32,256}$/
export const DEV_ORIGINS = new Set(['http://localhost:1435', 'http://127.0.0.1:1435'])

// %LOCALAPPDATA%, not %APPDATA%: a domain roaming profile copies %APPDATA% to a file server at
// sign-out, and a token has no business on a file server. engine.rs token_file() mirrors this.
export function tokenFile(port) {
  const base = process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Simpler AI')
    : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'simpler-ai')
  return join(base, 'run', `legal-service-${port}.token`)
}

export function proofFor(token, nonce, payload) {
  return createHmac('sha256', token).update(`${PROOF_CONTEXT}\n${nonce}\n${payload}`).digest('hex')
}

export function hostAllowed(host, port) {
  const h = String(host || '').toLowerCase()
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`
}

// Hashing both sides first gives timingSafeEqual two equal lengths, so a wrong guess of any
// length costs the same time as any other.
export function bearerMatches(header, token) {
  const m = /^Bearer ([A-Za-z0-9_-]{1,256})$/.exec(String(header || ''))
  if (!m) return false
  return timingSafeEqual(createHash('sha256').update(m[1]).digest(), createHash('sha256').update(token).digest())
}

const envToken = process.env.SIMPLER_LEGAL_TOKEN
// Out of this process's environment before anything is spawned: the chain's four stages
// inherit process.env and have no use for it.
delete process.env.SIMPLER_LEGAL_TOKEN
if (isMain && envToken !== undefined && !TOKEN_RE.test(envToken)) {
  console.error('serve-legal: SIMPLER_LEGAL_TOKEN is set but is not 32-256 characters of A-Z a-z 0-9 _ - ; refusing to start with a guessable or garbled token. Unset it to get a random one.')
  process.exit(2)
}
// Measured on Node 22.22.3 with a stand-in proxy and a stand-in model on 127.0.0.1:
//   switch   NODE_USE_ENV_PROXY=1, or --use-env-proxy in NODE_OPTIONS -> proxied;
//            "0", "", "true" -> direct. Any value but "" and "0" counts here, because a later
//            Node may read "true" and refusing a harmless setting costs one sentence.
//   carrier  HTTP_PROXY / http_proxy -> proxied; HTTPS_PROXY or ALL_PROXY alone -> direct
//            (the model calls are http://).
//   NO_PROXY "*" and "127.0.0.1" -> direct; "localhost", "127.0.0.0/8" and "127.0.0.1:9" ->
//            proxied. Only "*" or a bare "127.0.0.1" entry is taken as an exemption.
// --use-env-proxy on this process's own command line affects its /health calls only (a child
// does not inherit execArgv) and is refused too: it is the same instruction.
// Returns why, in words, or null.
export function proxyHazard(env = process.env, execArgv = process.execArgv) {
  const get = (k) => env[k] ?? env[k.toLowerCase()]
  const flagIn = (s) => /(^|[\s"])--use[-_]env[-_]proxy(?=$|[\s"=])/.test(String(s ?? ''))
  const sw = get('NODE_USE_ENV_PROXY')
  const on = sw !== undefined && sw !== '' && sw !== '0' ? `NODE_USE_ENV_PROXY=${JSON.stringify(String(sw).slice(0, 20))}`
    : flagIn(get('NODE_OPTIONS')) ? '--use-env-proxy in NODE_OPTIONS'
    : (execArgv || []).some(flagIn) ? '--use-env-proxy on its command line'
    : null
  if (!on) return null
  const carrier = ['HTTP_PROXY', 'http_proxy'].find((k) => env[k] !== undefined && env[k] !== '')
  if (!carrier) return null
  const exempt = [get('NO_PROXY'), env.no_proxy].filter(Boolean).join(',').split(/[\s,]+/).map((e) => e.trim().toLowerCase())
  if (exempt.includes('*') || exempt.includes('127.0.0.1')) return null
  return `${on} with ${carrier} set`
}
const HAZARD = isMain ? proxyHazard() : null
if (HAZARD) {
  // The proxy's address is not printed: it can carry a user name and password.
  console.error(`serve-legal: refusing to start — ${HAZARD} would send the frozen chain's requests to the model server, each carrying part of a document, through that proxy (Node sends even 127.0.0.1 through it). Start this service without NODE_USE_ENV_PROXY and without --use-env-proxy, or add 127.0.0.1 to NO_PROXY. The app removes these settings when it starts the service itself.`)
  process.exit(2)
}
const TOKEN = envToken ?? randomBytes(32).toString('hex')
const TOKEN_FROM_ENV = envToken !== undefined
// FIRM PROFILE — opt-in, never inferred (2026-09-15). The genre router below is UNTOUCHED: it
// still decides product-vs-courts, which is what picks the LN and LQ stages. Firm overrides one
// thing only, the profile the v2 sweep stage runs under, because the doctrine difference is a
// fact about WHOSE paper this is and no text feature can tell you that. A published judgment
// and a firm's brief about it look alike; only the person holding the file knows which it is.
// Server default via --profile firm; per-request via {profile:'firm'} in the POST body.
const PROFILE_DEFAULT = flag('--profile', 'auto') === 'firm' ? 'firm' : 'auto'

// Every per-request working tree lives under this one directory, so a single readdir finds
// all of them — including any a dead process left behind.
const SERVE = join(ROOT, 'raw', 'stripped', '_serve')

// Remove one working tree and PROVE it is gone. Windows refuses the unlink while a child
// still holds a handle, so retry; then check, because an rm that failed quietly is precisely
// the leak this function exists to close. Returns whether the directory is actually gone.
export function discard(dir, why) {
  // Both failure branches say WHAT is still there, not just that an rm failed. EBUSY is the
  // ordinary Windows outcome and was the branch that used to print only the errno.
  const holds = 'it holds the unredacted document and the span-to-tag key. Delete it by hand.'
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
  } catch (e) {
    console.error(`serve-legal: COULD NOT REMOVE ${dir} (${why}) — ${holds} (${e.message})`)
    return false
  }
  if (existsSync(dir)) {
    console.error(`serve-legal: ${dir} STILL EXISTS after rm (${why}) — ${holds}`)
    return false
  }
  return true
}

// This port's trees, and any tree named before trees carried a port (a bare <time>-<seq>).
// engine.rs shutdown() applies the same rule to the app's own port.
export const treePrefix = (port) => `p${port}-`
export const isOwnTree = (name, port) => name.startsWith(treePrefix(port)) || !/^p\d+-/.test(name)

// Anything of this port's under _serve at boot (or at shutdown) belongs to a process that died
// before its finally ran. Says what it removed; says nothing when there was nothing to remove.
export function sweepStale(why) {
  let names = []
  try { names = existsSync(SERVE) ? readdirSync(SERVE).filter((n) => isOwnTree(n, PORT)) : [] } catch { return 0 }
  if (!names.length) return 0
  let gone = 0
  for (const n of names) if (discard(join(SERVE, n), why)) gone++
  console.log(`serve-legal: ${why} — removed ${gone}/${names.length} working ${names.length === 1 ? 'tree' : 'trees'} left by an earlier run`)
  return gone
}

const R = await import('./lib-legal/legal-rails.mjs')
const { alignTags } = await import('./lib-legal/regions.mjs')
const { foldFullwidth } = await import('./lib-core/anonymize.mjs')

const COURT_HEAD_RE = /\[\d{4}\]\s+SG(?:HC|CA|HCF|DC)|F\.\s?(?:2d|3d|Supp)|\bIN THE (?:UNITED STATES|HIGH COURT|COURT OF APPEAL)|grounds of decision|judgment reserved|^Title:\s.+\sv[.\s]/im
export function routeGenre(text) {
  if (R.isAnonCourtDoc(text)) return 'courts'
  if (COURT_HEAD_RE.test(text.slice(0, 2500))) return 'courts'
  return 'product'
}

const CLS_OF_TAG = [
  [/^\[Person/, 'PERSON'], [/^\[(?:Company|Brand|Firm)/, 'COMPANY'], [/^\[Address/, 'ADDRESS'],
  [/^\[Phone/, 'PHONE'], [/^\[Email/, 'EMAIL'], [/^\[(?:Id|Code)/, 'ID'], [/^\[Url/, 'URL'],
  // legal's QUASI mass gets its own review group instead of drowning in "over-matches"
  [/^\[(?:Date|Amount|Quantity|Dem|Age|Duration)/, 'DETAIL'], [/^\[(?:Place|Loc)/, 'LOC'],
]
// The rows the app is handed: one per tag of each region the pipeline's output aligns to in the
// text. Exported for app/frontend/test/docx-parts.mjs law 85, which runs it as it stands.
//
// Every region is a row, whatever its length. Until 2026-09-25 a region over 200 characters was
// skipped with the run still reported aligned, so what the pipeline masked there went back to the
// app as no row at all, and the copied text, the .txt and the saved .docx carried it readable
// while the pipeline's own output did not (H-ATK-2). alignTags folds tags with fewer than four
// characters that are not white space between them into one region, so a list of names does
// that: 14 names in one comma list made one region of 201 characters, and a footnote listing who
// attended shipped all 14 names readable. Measured 2026-09-25 over the frozen pipeline's own
// outputs in raw/stripped (17 FINAL folders, 306 runs aligned): 6 regions over 200 characters, in
// 3 distinct documents, 235 to 275 characters, each skipped until now; in 4 of the 6 runs (2
// documents) the region's longest line stood readable in the app's .txt, and in none with every
// region a row. Such a row masks the whole region under its
// first tag, as the regions this skip kept already did: over-wide, which is alignTags's own safe
// direction.
export function rowsFromFinal(orig, final) {
  const a = alignTags(orig, final)
  if (!a.ok) return { ok: false, why: a.why, rows: [] }
  const seen = new Map()
  for (const r of a.regions) {
    for (const tag of r.tags || [r.tag]) {
      const span = orig.slice(r.start, r.end)
      if (!span.trim()) continue
      const key = span.toLowerCase() + '|' + tag
      if (seen.has(key)) continue
      const cls = (CLS_OF_TAG.find(([re]) => re.test(tag || '')) || [null, 'TERM'])[1]
      seen.set(key, { span, cls, src: 'legal-pipeline', tag: tag || '[X]' })
    }
  }
  return { ok: true, rows: [...seen.values()] }
}

async function llamaHealthy(port = LLAMA) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })
    return r.ok && (await r.json()).status === 'ok'
  } catch { return false }
}

// The first `n` UTF-16 units of `s`, less a high surrogate left alone at the end. JSON.stringify
// writes that half as \ud83d, which serde_json refuses as a whole line: engine.rs then failed the
// run on that line and the disk line before it lost its mark (wf6 SL-1, measured with an emoji at
// unit 800 of a stage's stderr).
export const cut = (s, n) => { const t = String(s).slice(0, n); return /[\uD800-\uDBFF]$/.test(t) ? t.slice(0, -1) : t }

// `onSpawn` gets the stage's process, so a run whose caller has gone can kill it (strip below).
function run(args, label, expect, onSpawn) {
  return new Promise((resolve, reject) => {
    const cp = execFile('node', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${label} failed: ${cut(stderr || err.message, 800)}`))
      // A stage can exit 0 having written nothing for this document — apply-v2 skips a
      // document whose substrate output does not align with the original and says so on
      // stdout only (2026-09-13: 2 of 26 trial documents, which surfaced as an ENOENT on
      // FINAL/doc.txt at the end of the run, three stages later). The stage's own last
      // lines are the reason, and they travel with the error.
      if (expect && !existsSync(expect)) {
        const tail = (s) => cut(String(s || '').trim().split('\n').slice(-3).join(' | '), 800)
        return reject(new Error(`${label} wrote no output for this document — stage said: ${tail(stdout) || '(nothing on stdout)'}${stderr ? ' — stderr: ' + tail(stderr) : ''}`))
      }
      resolve(stdout)
    })
    onSpawn?.(cp)
  })
}

let seq = 0
async function strip(text, res, profile = PROFILE_DEFAULT, llama = LLAMA) {
  const LP = String(llama) // this run's model port (header: "The model port, per run")
  const id = `${treePrefix(PORT)}${Date.now().toString(36)}-${++seq}`
  const dir = join(SERVE, id)
  mkdirSync(dir, { recursive: true })
  const send = (o) => { try { res.write(JSON.stringify(o) + '\n') } catch { /* client hung up; the finally still runs */ } }
  // The caller hanging up stops the run. engine.rs hangs up when its relay refuses a connection
  // mid-run or the checked model server exits. Until 2026-09-23 the run went on regardless:
  // measured, a process that took the model port after the 4th completion received the next 29
  // requests, each carrying a chunk of the document. 'close' before the response has ended is the
  // hang-up; the stage is killed where it stands and no further stage starts.
  let stage = null
  let gone = false
  const hangUp = () => {
    if (res.writableEnded || gone) return
    gone = true
    console.error(`serve-legal: run ${id} — the caller closed the connection; stopping the chain`)
    try { stage?.kill() } catch { /* already exited */ }
  }
  res.on('close', hangUp)
  const stageRun = (args, label, expect) => {
    if (gone) return Promise.reject(new Error(`${label} not started: the caller closed the connection`))
    return run(args, label, expect, (cp) => { stage = cp; if (gone) cp.kill() })
  }
  let result = null
  try {
    const f = 'doc.txt'
    writeFileSync(join(dir, f), text)
    const rel = (p) => `_serve/${id}/${p}` // strip-batch/apply out dirs are relative to raw/stripped
    const genre = routeGenre(text)
    const v2Profile = profile === 'firm' ? 'firm' : 'product'
    send({ stage: 'substrate', genre, profile })
    await stageRun(['strip-batch.mjs', '--srcdir', dir, '--files', f, '--out', rel('sub'), '--mode', 'full', '--port', LP], 'substrate', join(dir, 'sub', f))
    send({ stage: 'sweeps' })
    await stageRun(['apply-v2.mjs', '--orig', dir, '--sub', `raw/stripped/${rel('sub')}`, '--out', `raw/stripped/${rel('v2')}`,
      '--profile', v2Profile, '--model', '--arms', 'cite,rails,fs7,bizdate', '--files', f, '--port', LP], 'sweeps', join(dir, 'v2', f))
    let cur = rel('v2')
    if (genre === 'courts') {
      send({ stage: 'restore' })
      await stageRun(['apply-ln.mjs', '--orig', dir, '--in', `raw/stripped/${cur}`, '--out', `raw/stripped/${rel('ln')}`,
        '--ln', '0,1,2,3', '--deglue', '--tables', `raw/stripped/${rel('sub')}-tables`, '--port', LP], 'restore', join(dir, 'ln', f))
      cur = rel('ln')
    }
    send({ stage: 'quasi' })
    const lqArgs = genre === 'courts' ? ['--lq', '1,2', '--skip', 'EMPLOYER,JOB'] : ['--lq', '1', '--skip', 'JOB']
    await stageRun(['apply-lq.mjs', '--orig', dir, '--in', `raw/stripped/${cur}`, '--out', `raw/stripped/${rel('FINAL')}`, ...lqArgs, '--port', LP], 'quasi', join(dir, 'FINAL', f))
    const final = readFileSync(join(dir, 'FINAL', f), 'utf8')
    const orig = foldFullwidth(text)
    const t = rowsFromFinal(orig, final)
    // Held, not sent — the `done` line has to be able to state whether the working files
    // are gone, and they are not gone until the finally below has run.
    result = { done: true, genre, profile, engine: profile === 'firm' ? 'v1-legal-frozen+firm' : 'v1-legal-frozen', final, alignOk: t.ok, rows: t.rows }
  } finally {
    // This tree holds the unredacted document and sub-tables/doc.txt.json, the span-to-tag
    // key. It goes whether the run returned, threw, or the client hung up mid-stream.
    const removed = discard(dir, `run ${id}`)
    if (result) send({ ...result, scratchRemoved: removed })
    // Fail-loud, not a field the client can ignore: a run that could not clean up after
    // itself has broken the promise the History screen makes, so its result is refused and
    // the app falls back to the in-webview core, which writes nothing.
    // The parenthesis is what the lawyer reads: engine.ts shows the first 60 characters of this
    // line, and the folder comes after them. "See the engine console" was false for a service
    // the app started: it runs with no window, and discard()'s lines above go to legal-serve.log
    // (engine.rs attach_logs), which is rewritten each time the service starts.
    if (!removed) send({ error: `working files were left on disk (named in the engine service's output: legal-serve.log when the app started it, else the window it runs in) — ${dir} holds the unredacted document and the span-to-tag key` })
  }
}

// Written for a hand-started service only (the app passes --no-token-file and the token in
// the environment). POSIX gets 0700/0600 and the mode is checked, because a pre-existing
// directory keeps its old mode; on Windows the file inherits the profile directory's ACL
// (the user, SYSTEM and Administrators).
function writeTokenFile() {
  const f = tokenFile(PORT)
  mkdirSync(dirname(f), { recursive: true, mode: 0o700 })
  const tmp = `${f}.${process.pid}`
  writeFileSync(tmp, TOKEN + '\n', { mode: 0o600 })
  renameSync(tmp, f)
  if (process.platform !== 'win32') {
    chmodSync(f, 0o600)
    if (statSync(f).mode & 0o077) throw new Error(`${f} is readable by other accounts after chmod 600`)
  }
  return f
}
// Only while it is still ours: a newer launch on the same port has overwritten it.
function removeTokenFile(f) {
  try { if (readFileSync(f, 'utf8').trim() === TOKEN) unlinkSync(f) } catch { /* already gone */ }
}

// A tree under _serve at boot means a previous process died before its finally ran. THE BOOT
// SWEEP IS THE GUARANTEE — it is the one path a killed process cannot skip.
//
// It runs, with the token file and the exit hooks, only once this process holds the port
// (the listen callback below). Holding the port is what makes this port's trees and token
// file this process's to touch: a second launch on a busy port used to sweep the running
// service's in-flight tree (its document then failed mid-run, "doc=GONE") and replace its
// token file, then its exit hook deleted the file (measured 2026-09-23). It now exits on
// EADDRINUSE having touched neither. `booted` refuses the rare request that could arrive
// before the sweep has run.
//
// The shutdown handlers are best-effort, and measured rather than assumed: on Windows,
// no signal sent by another process runs a handler at all. SIGTERM, SIGINT, SIGBREAK and
// SIGHUP from child.kill() each terminate through TerminateProcess with exitCode null, and
// not even the 'exit' hook fires (2026-09-13). They do work for a console Ctrl-C and on every
// POSIX host, so they stay — but nothing here may depend on them, which is why the sweep at
// boot exists and why the residual case (hard-killed and never restarted) is named in
// OPS_LEDGER.md instead of being papered over.
let booted = false
function boot() {
  mkdirSync(SERVE, { recursive: true })
  sweepStale('boot sweep')
  let tokenPath = null
  if (!argv.includes('--no-token-file')) {
    try {
      tokenPath = writeTokenFile()
    } catch (e) {
      console.error(`serve-legal: could not write the token file (${e.message}); refusing to start — the app would have no way to tell this service from any other process on the port`)
      process.exit(2)
    }
  }
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
    try { process.on(sig, () => { sweepStale(`${sig} sweep`); process.exit(0) }) } catch { /* signal unknown here */ }
  }
  process.on('exit', () => { sweepStale('exit sweep'); if (tokenPath) removeTokenFile(tokenPath) })
  console.log(tokenPath
    ? `serve-legal: this launch's token is in ${tokenPath} (under your own profile) — the app reads it to use a service it did not start, and says so on screen. Closing the app does not stop this service: it runs, and the file stays readable to any program running as you, until you stop it here (Ctrl+C), which removes the file`
    : `serve-legal: token ${TOKEN_FROM_ENV ? 'supplied by the launching process' : 'held in memory only'}; no token file written`)
  booted = true
}

function refuse(res, status, error) {
  res.writeHead(status, { 'content-type': 'application/json', connection: 'close' })
  res.end(JSON.stringify({ error }))
}

const server = isMain ? createServer(async (req, res) => {
  if (!booted) return refuse(res, 503, 'starting — try again in a moment')
  // Gate 1 — Host. Before anything else, including the preflight, so a rebinding page learns
  // nothing about what is listening here.
  if (!hostAllowed(req.headers.host, PORT)) {
    return refuse(res, 403, `refused: Host ${JSON.stringify(String(req.headers.host ?? '(none)').slice(0, 80))} is not 127.0.0.1:${PORT} or localhost:${PORT} — this service answers requests addressed to this machine by address only`)
  }
  // Gate 2 — Origin, and the site a browser says the request came from. A browser cannot
  // forge either. Origin is sent on every CORS request, and is absent from a page's no-cors
  // GET (<script src>, <img src>); that request still says Sec-Fetch-Site. Absent both, the
  // caller is not a page: engine.rs, curl, node, or a browser too old to send the header
  // (header note above). "same-origin" would be a page this service served, and it serves
  // none; "none" is an address typed into the browser's own bar.
  const origin = req.headers.origin
  const site = req.headers['sec-fetch-site']
  res.setHeader('vary', 'origin')
  if (origin !== undefined) {
    if (!DEV_ORIGINS.has(origin)) {
      return refuse(res, 403, `refused: requests from ${JSON.stringify(String(origin).slice(0, 80))} are not accepted — this service answers the simpler.legal app and its dev server only`)
    }
    res.setHeader('access-control-allow-origin', origin)
  } else if (site !== undefined && site !== 'same-origin' && site !== 'none') {
    return refuse(res, 403, `refused: a request from another site (Sec-Fetch-Site: ${JSON.stringify(String(site).slice(0, 20))}) with no Origin — this service answers the simpler.legal app and its dev server only`)
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-headers': 'content-type, authorization, x-simpler-challenge',
      'access-control-allow-methods': 'GET, POST',
      'access-control-max-age': '600',
    })
    return res.end()
  }
  // Gate 4 — the service proves itself. No document text either way; the payload is what the
  // app needs to decide whether to go on: which engine, which port it answers on (so a proof
  // relayed from a service on another port does not pass), and which model port it will use.
  if (req.method === 'GET' && req.url === '/hello') {
    const nonce = String(req.headers['x-simpler-challenge'] ?? '')
    if (!/^[0-9a-f]{64}$/.test(nonce)) return refuse(res, 400, 'x-simpler-challenge must be 64 lowercase hex characters')
    const llamaOk = await llamaHealthy()
    const payload = JSON.stringify({ v: 1, service: 'serve-legal', engine: 'v1-legal-frozen', port: PORT, llama: +LLAMA, llamaOk, pid: process.pid, llamaPerRun: true })
    const body = JSON.stringify({ payload, proof: proofFor(TOKEN, nonce, payload) })
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
    return res.end(body)
  }
  if (req.method === 'GET' && req.url === '/health') {
    const ok = await llamaHealthy()
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ok, llama: ok, engine: 'v1-legal-frozen', port: PORT, profile: PROFILE_DEFAULT, profiles: ['auto', 'firm'] }))
  }
  if (req.method === 'POST' && req.url === '/strip') {
    // Gate 3 — checked on the headers, so a caller without the token never gets a byte of its
    // body buffered, let alone written to disk.
    if (!bearerMatches(req.headers.authorization, TOKEN)) {
      return refuse(res, 401, `refused: /strip needs this launch's token (authorization: Bearer …). The simpler.legal app supplies it; a hand-started service keeps it in ${tokenFile(PORT)}`)
    }
    // Decoded as one stream, not read by read. `body += c` decoded each TCP read on its own, so
    // a character whose bytes a read boundary split became U+FFFD in the text the chain tagged:
    // a row that cannot be placed in the original floors at ×1 and ships readable under
    // "verified" (wf6 S3-1, measured: 53 in a 2.1 MB Chinese document, 4 in a 767 KB English one
    // with curly quotes, 2 for one é split across two writes).
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (c) => { body += c; if (body.length > 40 * 1024 * 1024) req.destroy() })
    req.on('end', async () => {
      try {
        const { text, profile, llamaPort } = JSON.parse(body)
        if (!text || typeof text !== 'string') { res.writeHead(400); return res.end('{"error":"no text"}') }
        // Fail-closed on an unknown profile rather than silently running the default: a caller
        // that asked for a doctrine the server does not have must be told, not quietly given
        // the other one.
        if (profile !== undefined && profile !== 'auto' && profile !== 'firm') { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: `unknown profile ${JSON.stringify(String(profile).slice(0, 40))} — this server accepts "auto" or "firm"` })) }
        // Fail-closed like profile: a caller that named a model port and got the default would
        // have its document sent where it did not check.
        if (llamaPort !== undefined && !(Number.isInteger(llamaPort) && llamaPort >= 1 && llamaPort <= 65535)) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: `llamaPort must be a whole number from 1 to 65535, not ${JSON.stringify(llamaPort).slice(0, 40)} — nothing was run` })) }
        const llama = llamaPort ?? +LLAMA
        if (!(await llamaHealthy(llama))) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'model offline — frozen pipeline refuses to run without it (fail-loud); use the in-app core' })) }
        res.writeHead(200, { 'content-type': 'application/x-ndjson' })
        await strip(text, res, profile || PROFILE_DEFAULT, llama)
        res.end()
      } catch (e) {
        try { res.write(JSON.stringify({ error: cut(e.message || e, 800) }) + '\n'); res.end() } catch {}
      }
    })
    return
  }
  res.writeHead(404); res.end()
}) : null

if (server) {
  // Registered before listen, so a busy port is a sentence and exit 2 rather than an unhandled
  // 'error' stack — and it fires before boot(), so nothing of the running service is touched.
  server.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE'
      ? `serve-legal: 127.0.0.1:${PORT} is already in use — another engine service (or another program) holds it. This process exits without touching that service's token file or working files. Stop the other one first, or start this one with --port <another port>.`
      : `serve-legal: could not listen on 127.0.0.1:${PORT} (${e.message})`)
    process.exit(2)
  })
  server.listen(PORT, '127.0.0.1', () => {
    boot()
    console.log(`serve-legal: frozen v1-legal pipeline on 127.0.0.1:${PORT} (llama upstream :${LLAMA})`)
  })
}
