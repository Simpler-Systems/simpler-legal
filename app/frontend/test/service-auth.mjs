// SERVICE AUTH — who may talk to the engine service, and how the app knows who it is
// talking to (LAUNCH.md §2.4, site-audit L7).
// Run from app/frontend:   node test/service-auth.mjs
//
// Measured before the fix (2026-09-23, same harness shape): the service answered every origin
// with `access-control-allow-origin: *`; a text/plain POST /strip from https://attacker.example
// — a "simple" request, so no preflight — had its document written to disk and the chain
// started, and the response gave away the absolute path of the working tree; a request with
// Host: attacker.example was served, so DNS rebinding reached it; and nothing the app did
// could tell the service it started from any other program holding 127.0.0.1:1436.
//
// This starts the REAL serve-legal.mjs, copied with lib-core and lib-legal into a temp root so
// its boot sweep and per-run working tree touch only that folder, on free ports in
// 14390-14399, against a fake model server that counts every request. The chain's first stage
// is replaced IN THE TEMP ROOT by a probe that reports what it received and exits, so a run
// that gets past the gates is visible without a model. It is driven three ways:
//   raw HTTP, as a hostile page or a rebinding hostname would send it;
//   the app's own browser path — lib/tauri.ts bundled with esbuild as test/protected-terms.mjs
//     does — with fetch wrapped in a model of what a browser adds (Origin) and enforces
//     (preflight, access-control-allow-origin);
//   the app's Tauri path, with invoke() stubbed to what engine.rs returns. The Rust half of
//     that path (service_auth.rs, port_owner.rs) needs a built binary and is not run here.
//
// The laws, and what each costs when it breaks:
//   1. A PAGE FROM ANOTHER ORIGIN GETS NOTHING — no allow-origin header, no document written,
//      no model call. Includes http://tauri.localhost, which every Tauri app shares, and the
//      opaque origin "null". Cost: any web page open on the lawyer's machine can submit text
//      to the service and read what comes back.
//   2. ONLY THIS MACHINE'S ADDRESS. Host must be 127.0.0.1:<port> or localhost:<port>.
//      Cost: DNS rebinding makes a remote hostname same-origin with the service.
//   3. NO TOKEN, NO DOCUMENT. /strip without this launch's bearer is a 401 before the body is
//      read; the refusal names where a hand-started service keeps the token.
//   4. THE SERVICE PROVES ITSELF FIRST. /hello answers an HMAC of the caller's nonce and a
//      payload naming its own port; the app checks both before it posts. A wrong token, and a
//      relay from another port, get no document. The payload also says llamaPerRun: engine.rs
//      refuses a service without it (an older copy would send the chain's model calls straight
//      to the model port, around the app's per-connection check, relay.rs).
//   5. THE APP'S OWN REQUEST SUCCEEDS, and a run on a service the app did not start says so
//      on its receipt (engineStatus HAND_SERVICE, HAND_MODEL). The default strings are unchanged.
//   6. THE TOKEN STAYS OUT OF THE CHAIN. The four stages inherit the service's environment;
//      the token is removed from it at boot, before any of them is spawned.
// Each refusal has a CONTROL that sends the same request with the one thing changed, so a
// pass means the gate refused for the stated reason and not because the request was broken.
// Every process and server started here is stopped before exit. Exit 1 on any FAIL.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { connect, createServer as tcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const repo = join(here, '..', '..', '..');
const lib = join(here, '..', 'src', 'lib');
const url = (p) => 'file:///' + p.replace(/\\/g, '/');
const tmp = mkdtempSync(join(tmpdir(), 'service-auth-'));
const root = join(tmp, 'root');
const profile = join(tmp, 'profile');
mkdirSync(root, { recursive: true });
mkdirSync(profile, { recursive: true });
cpSync(join(repo, 'serve-legal.mjs'), join(root, 'serve-legal.mjs'));
cpSync(join(repo, 'lib-core'), join(root, 'lib-core'), { recursive: true });
cpSync(join(repo, 'lib-legal'), join(root, 'lib-legal'), { recursive: true });
// The first stage, in the temp root only: what it received, then a non-zero exit, which the
// service relays as its error line.
writeFileSync(join(root, 'strip-batch.mjs'), [
  "import { existsSync, readFileSync } from 'node:fs';",
  "import { join } from 'node:path';",
  "const a = process.argv.slice(2); const src = a[a.indexOf('--srcdir') + 1];",
  "const f = join(src, 'doc.txt');",
  "console.error(`STAGE_SAW token=${process.env.SIMPLER_LEGAL_TOKEN === undefined ? 'absent' : 'PRESENT'} doc=${existsSync(f) ? readFileSync(f, 'utf8').length : -1}`);",
  'process.exit(3);',
].join('\n'));
const SERVE = join(root, 'raw', 'stripped', '_serve');
const serveEmpty = () => !existsSync(SERVE) || readdirSync(SERVE).length === 0;

let pass = 0, fail = 0;
const check = (ok, what, got) => { console.log((ok ? 'PASS ' : 'FAIL ') + what + (ok || got === undefined ? '' : `\n     got: ${typeof got === 'string' ? got : JSON.stringify(got)}`.slice(0, 900))); ok ? pass++ : fail++; };
const closers = [];

// Ports: 14390-14399 only, whatever is free. Never 1436 or 49400, which belong to a running app.
async function freePorts(n) {
  const got = [];
  for (let p = 14390; p <= 14399 && got.length < n; p++) {
    const ok = await new Promise((r) => { const s = tcpServer(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))); });
    if (ok) got.push(p);
  }
  if (got.length < n) throw new Error(`service-auth: needs ${n} free ports in 14390-14399, found ${got.length} (${got.join(', ')}); free some and rerun`);
  return got;
}

function raw(port, { method = 'GET', path = '/', headers = {}, body, setHost = true } = {}) {
  return new Promise((resolve) => {
    const q = request({ host: '127.0.0.1', port, method, path, headers, setHost, agent: false }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    q.on('error', (e) => resolve({ status: 0, headers: {}, body: String(e.message) }));
    if (body !== undefined) q.write(body);
    q.end();
  });
}

function startAdapter(port, llamaPort, env, extra = []) {
  const e = { ...process.env, ...env };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete e[k];
  const child = spawn(process.execPath, ['serve-legal.mjs', '--port', String(port), '--llama', String(llamaPort), ...extra], { cwd: root, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const exited = new Promise((r) => child.on('exit', (code) => r(code)));
  closers.push(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; } });
  return { child, log: () => log, exited };
}
async function waitFor(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
}

// A browser, reduced to the two things these gates depend on: it adds Origin, and it enforces
// CORS (a preflight for any non-simple request; no allow-origin on the response = the page
// sees a network error, never the status). Every request is logged for the assertions.
const realFetch = globalThis.fetch;
const SIMPLE_CT = new Set(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']);
function pageFetch(origin, log) {
  return async (target, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const unsafe = Object.keys(headers)
      .filter((k) => !(k === 'content-type' && SIMPLE_CT.has(headers[k].split(';')[0].trim().toLowerCase())))
      .filter((k) => !['accept', 'accept-language', 'content-language'].includes(k))
      .sort();
    const blocked = (why) => { log.push({ method, url: String(target), blocked: why }); throw new TypeError('Failed to fetch'); };
    if (!['GET', 'HEAD', 'POST'].includes(method) || unsafe.length) {
      const pf = await realFetch(target, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': method, ...(unsafe.length ? { 'access-control-request-headers': unsafe.join(',') } : {}) } });
      const allowed = (pf.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map((s) => s.trim());
      if (!pf.ok || pf.headers.get('access-control-allow-origin') !== origin || unsafe.some((h) => !allowed.includes(h))) blocked(`preflight ${pf.status}`);
    }
    const r = await realFetch(target, { ...init, headers: { ...headers, origin } });
    log.push({ method, url: String(target), status: r.status, auth: 'authorization' in headers });
    const acao = r.headers.get('access-control-allow-origin');
    if (acao !== origin && acao !== '*') blocked(`no allow-origin on ${r.status}`);
    return r;
  };
}

// ── bundles of the app's own modules ──────────────────────────────────────────────────────
const nm = join(tmp, 'node_modules');
for (const [pkg, file, body] of [
  // invoke() goes to whatever the Tauri-path case installs; on the browser path it is unset,
  // and reaching it throws, so a browser case cannot pass on the Tauri branch by accident.
  ['@tauri-apps/api', 'core.js', 'export class Channel { constructor(){ this.onmessage = () => {} } }\nexport function invoke(cmd, args){ if (!globalThis.__invoke) throw new Error("invoke() reached on the browser path"); return globalThis.__invoke(cmd, args) }\n'],
  ['@tauri-apps/plugin-dialog', 'index.js', 'export function save(){ throw new Error("save() reached") }\n'],
]) {
  const d = join(nm, ...pkg.split('/'));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, file), body);
  writeFileSync(join(d, 'package.json'), JSON.stringify(pkg === '@tauri-apps/api' ? { name: pkg, type: 'module', exports: { './core': './core.js' } } : { name: pkg, type: 'module', main: file }));
}
writeFileSync(join(tmp, 'package.json'), JSON.stringify({ type: 'module' }));
// By alias, not by node_modules lookup: the entry resolves from src/lib, which finds the real
// packages in app/frontend/node_modules first, and the real invoke() needs a Tauri window.
const stubs = { '@tauri-apps/api/core': join(nm, '@tauri-apps', 'api', 'core.js'), '@tauri-apps/plugin-dialog': join(nm, '@tauri-apps', 'plugin-dialog', 'index.js') };
// One entry exposing tauri.ts and the engineStatus instance it writes to (each bundle has its own).
const entry = "export * from './tauri';\nexport { engineTrust, engineCopy, engineIdentity, inAppCoreStamp, HAND_SERVICE, HAND_MODEL, RUN_FAILED, RUN_HAND_SERVICE } from './engineStatus';\n";
async function bundle(name, env) {
  const outfile = join(tmp, `${name}.mjs`);
  const define = { 'import.meta.env.DEV': 'true' };
  for (const [k, v] of Object.entries(env)) define[`import.meta.env.${k}`] = JSON.stringify(v);
  await build({ stdin: { contents: entry, resolveDir: lib, loader: 'ts', sourcefile: 'entry.ts' }, bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent', absWorkingDir: tmp, alias: stubs, define });
  return outfile;
}

try {
  const [LP, AP, HP, RP, BP] = await freePorts(5);
  const T = randomBytes(32).toString('hex');
  const WRONG = randomBytes(32).toString('hex');
  const TEXT = 'The appellant, Jane Roe, of 12 Elm Street, appeals the order of the district court.';
  const nonce = () => randomBytes(32).toString('hex');
  const hmac = (tok, n, payload) => createHmac('sha256', tok).update(`simpler-legal-service/1\n${n}\n${payload}`).digest('hex');

  // the fake model server: /health ok, everything counted
  let llamaHits = 0;
  const llama = createServer((req, res) => { llamaHits++; res.writeHead(req.url === '/health' ? 200 : 404, { 'content-type': 'application/json' }); res.end('{"status":"ok"}'); });
  await new Promise((r) => llama.listen(LP, '127.0.0.1', r));
  closers.push(() => new Promise((r) => llama.close(r)));

  const a = startAdapter(AP, LP, { SIMPLER_LEGAL_TOKEN: T }, ['--no-token-file']);
  check(await waitFor(() => /pipeline on/.test(a.log())), `the service is up on scratch port ${AP} with a launch token`, a.log());
  const H = `127.0.0.1:${AP}`;

  // ── law 1: another origin ──────────────────────────────────────────────────────────────
  for (const origin of ['https://attacker.example', 'http://tauri.localhost', 'https://tauri.localhost', 'null', 'http://localhost:1436']) {
    const before = llamaHits;
    const pf = await raw(AP, { method: 'OPTIONS', path: '/strip', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,authorization' } });
    const post = await raw(AP, { method: 'POST', path: '/strip', headers: { origin, 'content-type': 'text/plain' }, body: JSON.stringify({ text: TEXT }) });
    // even holding the token, a page from another origin is refused: the origin gate comes first
    const withTok = await raw(AP, { method: 'POST', path: '/strip', headers: { origin, 'content-type': 'text/plain', authorization: `Bearer ${T}` }, body: JSON.stringify({ text: TEXT }) });
    const hello = await raw(AP, { path: '/hello', headers: { origin, 'x-simpler-challenge': nonce() } });
    const ok = [pf, post, withTok, hello].every((r) => r.status === 403 && !('access-control-allow-origin' in r.headers));
    check(ok && llamaHits === before && serveEmpty() && !/_serve|stripped/.test(post.body + withTok.body),
      `origin ${origin}: preflight, simple POST, POST with the token and /hello all 403, no allow-origin, no model call, nothing written`,
      { pf: pf.status, post: post.status, withTok: withTok.status, hello: hello.status, acao: pf.headers['access-control-allow-origin'], llama: llamaHits - before, serve: existsSync(SERVE) ? readdirSync(SERVE) : null });
  }
  for (const origin of ['http://localhost:1435', 'http://127.0.0.1:1435']) {
    const pf = await raw(AP, { method: 'OPTIONS', path: '/strip', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
    check(pf.status === 204 && pf.headers['access-control-allow-origin'] === origin && /origin/i.test(pf.headers.vary || '') && /authorization/.test(pf.headers['access-control-allow-headers'] || '') && /x-simpler-challenge/.test(pf.headers['access-control-allow-headers'] || ''),
      `CONTROL: the dev server's origin ${origin} gets its own origin echoed (not *), with Vary: origin`, { status: pf.status, headers: pf.headers });
  }

  // ── law 2: Host ────────────────────────────────────────────────────────────────────────
  for (const host of ['attacker.example', `attacker.example:${AP}`, '127.0.0.1', `127.0.0.1:${AP + 1}`, `LOCALHOST.attacker.example:${AP}`]) {
    const before = llamaHits;
    const rs = [
      await raw(AP, { path: '/health', headers: { host } }),
      await raw(AP, { path: '/hello', headers: { host, 'x-simpler-challenge': nonce() } }),
      await raw(AP, { method: 'POST', path: '/strip', headers: { host, 'content-type': 'application/json', authorization: `Bearer ${T}` }, body: JSON.stringify({ text: TEXT }) }),
    ];
    check(rs.every((r) => r.status === 403 && /is not 127\.0\.0\.1:/.test(r.body)) && llamaHits === before && serveEmpty(),
      `Host ${host}: /health, /hello and /strip (with the right token) all 403 before anything runs`, rs.map((r) => `${r.status} ${r.body.slice(0, 80)}`));
  }
  const noHost = await raw(AP, { path: '/health', setHost: false });
  check(noHost.status === 403 || noHost.status === 400, 'no Host header at all is refused', `${noHost.status} ${noHost.body.slice(0, 120)}`);
  for (const host of [H, `localhost:${AP}`]) {
    const r = await raw(AP, { path: '/health', headers: { host } });
    check(r.status === 200, `CONTROL: Host ${host} is served`, `${r.status} ${r.body.slice(0, 120)}`);
  }

  // ── law 3: the bearer ──────────────────────────────────────────────────────────────────
  for (const [what, authorization] of [['no authorization', undefined], ['a wrong token', `Bearer ${WRONG}`], ['the token without "Bearer "', T], ['a token prefix', `Bearer ${T.slice(0, 32)}`], ['the token as Basic', `Basic ${T}`]]) {
    const before = llamaHits;
    const headers = { 'content-type': 'application/json' };
    if (authorization) headers.authorization = authorization;
    const r = await raw(AP, { method: 'POST', path: '/strip', headers, body: JSON.stringify({ text: TEXT }) });
    check(r.status === 401 && /needs this launch's token/.test(r.body) && llamaHits === before && serveEmpty(),
      `/strip with ${what}: 401 before the body is read, no model call, nothing written`, `${r.status} ${r.body.slice(0, 160)}`);
  }
  {
    const r = await raw(AP, { method: 'POST', path: '/strip', headers: { 'content-type': 'application/json', authorization: `Bearer ${T}` }, body: JSON.stringify({ text: TEXT }) });
    check(r.status === 200 && /"stage":"substrate"/.test(r.body) && new RegExp(`STAGE_SAW token=absent doc=${TEXT.length}\\b`).test(r.body),
      'CONTROL: the right bearer reaches the chain, and the first stage received the whole document', r.body.slice(0, 400));
    check(!/STAGE_SAW token=PRESENT/.test(r.body), 'law 6: the stage did not inherit the token from the service environment', r.body.slice(0, 300));
    check(serveEmpty(), 'the per-run working tree is gone after the run', existsSync(SERVE) ? readdirSync(SERVE) : null);
  }

  // ── law 4: the handshake, checked by node:crypto independently of the service's own code ──
  {
    const bad = await raw(AP, { path: '/hello', headers: { 'x-simpler-challenge': 'abc' } });
    check(bad.status === 400, 'a malformed challenge is refused (400)', `${bad.status} ${bad.body}`);
    const n = nonce();
    const r = await raw(AP, { path: '/hello', headers: { 'x-simpler-challenge': n } });
    const v = JSON.parse(r.body || '{}');
    const p = JSON.parse(v.payload || '{}');
    check(r.status === 200 && v.proof === hmac(T, n, v.payload) && p.v === 1 && p.service === 'serve-legal' && p.port === AP && p.llama === LP && p.llamaOk === true && p.llamaPerRun === true && Number.isInteger(p.pid) && p.pid > 0,
      '/hello: HMAC-SHA256(token, context + nonce + payload), naming this port, the model port, its pid, and llamaPerRun', r.body.slice(0, 300));
    check(v.proof !== hmac(WRONG, n, v.payload), 'CONTROL: the same proof does not verify under another token');
    check(!/"text"|doc\.txt|_serve/.test(r.body), '/hello carries no document text and no path', r.body.slice(0, 300));
  }

  // ── law 5: the app's own browser path (lib/tauri.ts) ───────────────────────────────────
  const ORIGIN = 'http://localhost:1435';
  const withToken = await import(url(await bundle('with-token', { VITE_SIMPLER_LEGAL_TOKEN: T, VITE_SIMPLER_LEGAL_PORT: String(AP) })));
  const noToken = await import(url(await bundle('no-token', { VITE_SIMPLER_LEGAL_PORT: String(AP) })));
  const wrongToken = await import(url(await bundle('wrong-token', { VITE_SIMPLER_LEGAL_TOKEN: WRONG, VITE_SIMPLER_LEGAL_PORT: String(AP) })));
  const viaRelay = await import(url(await bundle('via-relay', { VITE_SIMPLER_LEGAL_TOKEN: T, VITE_SIMPLER_LEGAL_PORT: String(RP) })));
  const prod = await import(url(await (async () => {
    // a production build as `vite build` makes one: DEV false, minified (its default), with the
    // token present in the environment it was built in
    const outfile = join(tmp, 'prod.mjs');
    await build({ stdin: { contents: entry, resolveDir: lib, loader: 'ts', sourcefile: 'entry.ts' }, bundle: true, minify: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent', absWorkingDir: tmp, alias: stubs, define: { 'import.meta.env.DEV': 'false', 'import.meta.env.VITE_SIMPLER_LEGAL_TOKEN': JSON.stringify(T), 'import.meta.env.VITE_SIMPLER_LEGAL_PORT': JSON.stringify(String(AP)) } });
    return outfile;
  })()));
  check(withToken.LEGAL_SERVICE_PORT === AP && prod.LEGAL_SERVICE_PORT === 1436,
    'VITE_SIMPLER_LEGAL_PORT moves the port in a dev build only; a production build keeps 1436', [withToken.LEGAL_SERVICE_PORT, prod.LEGAL_SERVICE_PORT]);
  check(!readFileSync(join(tmp, 'prod.mjs'), 'utf8').includes(T), 'a production build does not carry the token even when it was set at build time');

  {
    const log = [];
    globalThis.fetch = pageFetch(ORIGIN, log);
    const h = await withToken.legalServiceHealth();
    check(h && h.ok && h.engine === 'v1-legal-frozen' && h.service === 'hand' && withToken.engineTrust().service === 'hand' && withToken.engineTrust().serviceRefused === null,
      'with the token: the page proves the service before using it, and records it as started by hand', { h, trust: withToken.engineTrust() });
    const c = withToken.engineCopy('ready', false);
    check(c.rail === 'Engine ready · started by hand' && /started by hand/.test(c.settings) && c.tone === 'amber', 'and the rail and Settings say so', c);
    const stages = [];
    let err = null;
    const before = log.length;
    try { await withToken.stripLegalService(TEXT, (s) => stages.push(s)); } catch (e) { err = String(e.message); }
    const sent = log.slice(before);
    check(stages.join() === 'substrate' && /STAGE_SAW token=absent/.test(err || '') && sent.some((x) => x.method === 'POST' && /\/strip$/.test(x.url) && x.auth && x.status === 200) && sent.some((x) => /\/hello$/.test(x.url) && x.status === 200),
      "the app's own request succeeds: preflight passes, /hello proves, the bearer is sent, the chain runs", { stages, err, sent });
    check(serveEmpty(), 'and its working tree is gone after the run');
    // The stage's exit is the service's error line, after it read the document. A page reaches a
    // service only with its token, which only a service started by hand gives out, so the
    // receipt names it (wf6 S-teeth-6: dropping that claim passed every gate).
    const stamp = withToken.inAppCoreStamp(TEXT).engine;
    check(stamp === `in-app-core${withToken.RUN_FAILED}${withToken.RUN_HAND_SERVICE}`,
      'and that failed run is on the document\'s receipt as sent-and-failed on a service started by hand', stamp);
  }
  {
    const log = [];
    globalThis.fetch = pageFetch(ORIGIN, log);
    const before = llamaHits;
    const h = await noToken.legalServiceHealth();
    const t = noToken.engineTrust();
    check(h === null && /VITE_SIMPLER_LEGAL_TOKEN/.test(t.serviceRefused || ''), 'without the token: the page does not use the service, and says why', { h, t });
    const c = noToken.engineCopy('ready', false);
    check(c.drop === t.serviceRefused && c.tone === 'amber', 'and the Drop banner carries that sentence', c);
    let err = null;
    const hitsBeforeStrip = llamaHits;
    try { await noToken.stripLegalService(TEXT, () => {}); } catch (e) { err = String(e.message); }
    check(/legal service http 401: .*needs this launch's token/.test(err || '') && llamaHits === hitsBeforeStrip && serveEmpty(),
      'a caller that skips the health check anyway gets the 401 in the service\'s words, and nothing runs', { err, llama: llamaHits - before });
    const stamp = noToken.inAppCoreStamp(TEXT).engine;
    check(stamp === `in-app-core${noToken.RUN_FAILED}`, 'CONTROL: without the token the page claims nothing about who started the service', stamp);
  }
  {
    const log = [];
    globalThis.fetch = pageFetch(ORIGIN, log);
    const h = await wrongToken.legalServiceHealth();
    const t = wrongToken.engineTrust();
    check(h === null && /could not prove it holds the token/.test(t.serviceRefused || ''), 'with a wrong token: the service is refused by name', { h, t });
    let err = null;
    try { await wrongToken.stripLegalService(TEXT, () => {}); } catch (e) { err = String(e.message); }
    check(/could not prove/.test(err || '') && !log.some((x) => x.method === 'POST'), 'and no /strip is sent: the document never leaves the page', { err, log });
  }
  {
    // a relay on another port that rewrites Host, so every gate on the far side passes
    const srv = tcpServer((c) => {
      const up = connect(AP, '127.0.0.1');
      c.on('data', (d) => up.write(Buffer.from(d.toString('latin1').split(`127.0.0.1:${RP}`).join(`127.0.0.1:${AP}`), 'latin1')));
      up.pipe(c);
      c.on('error', () => up.destroy()); up.on('error', () => c.destroy()); c.on('close', () => up.destroy());
    });
    await new Promise((r) => srv.listen(RP, '127.0.0.1', r));
    closers.push(() => new Promise((r) => srv.close(r)));
    const log = [];
    globalThis.fetch = pageFetch(ORIGIN, log);
    let err = null;
    try { await viaRelay.stripLegalService(TEXT, () => {}); } catch (e) { err = String(e.message); }
    check(new RegExp(`does not describe the engine service on port ${RP}`).test(err || '') && !log.some((x) => x.method === 'POST'),
      'a relay from another port with a VALID proof is refused by the port inside the payload; nothing is posted', { err, log });
  }
  globalThis.fetch = realFetch;

  // ── law 5, the Tauri path: what lib/tauri.ts does with engine.rs's answers ─────────────
  globalThis.window = { __TAURI_INTERNALS__: {} };
  const app = await import(url(await bundle('tauri', {})));
  delete globalThis.window;
  {
    const refusal = 'Port 1436, where the frozen legal pipeline runs, is held by evil.exe (pid 4242, not your Windows account), and it could not prove it holds this app\'s token.';
    globalThis.__invoke = async (cmd) => { if (cmd === 'legal_service_health') throw refusal; throw new Error(`unexpected ${cmd}`); };
    const h = await app.legalServiceHealth();
    check(h === null && app.engineTrust().serviceRefused === refusal, "Tauri: engine.rs's refusal is recorded in its own words", app.engineTrust());
    const c = app.engineCopy('ready', true);
    check(c.rail === 'Engine ready · in-app core only' && c.drop === refusal && c.tone === 'amber', 'and the rail says the in-app core is doing the work', c);

    globalThis.__invoke = async (cmd) => { if (cmd === 'legal_service_health') return { ok: true, llama: true, engine: 'v1-legal-frozen', port: 1436, service: 'hand', model: 'app', notes: [] }; throw new Error(`unexpected ${cmd}`); };
    await app.legalServiceHealth();
    const c2 = app.engineCopy('ready', true);
    check(app.engineTrust().service === 'hand' && app.engineTrust().serviceRefused === null && c2.rail === 'Engine ready · started by hand' && /token file under your own profile/.test(c2.settings),
      'Tauri: a hand-started service is named on screen, with how the app established it', c2);
    check(/Closing this app does not stop that service/.test(c2.settings) && /any program running as you can read its token file/.test(c2.settings) && !/Closing this app/.test(c2.drop),
      'Settings says a hand-started service outlives the app with its token readable, which the app cannot stop (wf4 S.notfixed); the drop line stays short', c2);
    const own = app.engineCopy('ready', true, { ...app.engineTrust(), service: 'app', model: 'hand' });
    check(!/Closing this app/.test(own.settings) && /outside this app/.test(own.settings),
      "CONTROL: a service the app started is stopped with it, and its copy does not say otherwise (the outside model server is still named)", own);

    const strip = (meta) => async (cmd, args) => {
      if (cmd !== 'strip_proxy') throw new Error(`unexpected ${cmd}`);
      args.onEvent.onmessage({ stage: 'substrate' });
      args.onEvent.onmessage({ done: true, genre: 'courts', engine: 'v1-legal-frozen', final: 'x', alignOk: true, rows: [] });
      return meta;
    };
    globalThis.__invoke = strip({ service: 'hand', model: 'app' });
    const r1 = await app.stripLegalService(TEXT, () => {});
    const id1 = app.engineIdentity({ engine: r1.engine, genre: 'courts' });
    check(r1.engine === `v1-legal-frozen${app.HAND_SERVICE}` && id1.handStarted && id1.frozen && id1.short === 'the frozen v1-legal pipeline (started by hand)' && /started by hand, outside this app/.test(id1.label) && /outside this app/.test(id1.detail),
      "Tauri: a run on a hand-started service carries it onto the receipt's engine identity", { r1: r1.engine, id1 });
    // which process, per origin, is service-lifecycle.mjs law 5; here only that it is carried
    globalThis.__invoke = strip({ service: 'app', model: 'hand' });
    check((await app.stripLegalService(TEXT, () => {})).engine === `v1-legal-frozen${app.HAND_MODEL}`, 'and so does a run whose MODEL server was started outside the app');
    globalThis.__invoke = strip({ service: 'app', model: 'app' });
    const r0 = await app.stripLegalService(TEXT, () => {});
    const id0 = app.engineIdentity({ engine: r0.engine, genre: 'courts' });
    check(r0.engine === 'v1-legal-frozen' && !id0.handStarted && id0.short === 'the frozen v1-legal pipeline' && id0.detail === 'genre routed: courts' && !/by hand|outside this app/.test(id0.label),
      "CONTROL: the app's own service and model leave the engine id and every string as they were", { r0: r0.engine, id0 });
    delete globalThis.__invoke;

    const base = { service: null, serviceRefused: null, model: null, modelRefused: null, failed: null, notes: [] };
    const go = app.engineCopy('ready', true, { ...base, service: 'app', model: 'app' });
    check(go.tone === 'go' && go.rail === 'Engine ready · 127.0.0.1' && go.drop === null && go.settings === 'Running — working entirely inside this computer',
      'CONTROL: the steady state copy is unchanged when both processes are the app\'s own', go);
    const red = app.engineCopy('offline', true, { ...base, modelRefused: 'Port 49400, where this app\'s model runs, is held by x.' });
    check(red.rail === 'Model server refused' && red.tone === 'red' && /held by x/.test(red.drop), 'a refused model server is red, with the reason', red);
    const off = app.engineCopy('offline', true, base);
    check(off.rail === 'Engine offline' && off.drop === 'The local engine didn’t come up — automatic detection is off. Documents open for manual redaction.',
      'CONTROL: the plain offline copy is unchanged', off);
  }

  // ── the hand-started flow: token file under the user's own profile ─────────────────────
  {
    const env = { SIMPLER_LEGAL_TOKEN: undefined, LOCALAPPDATA: profile, XDG_CONFIG_HOME: profile };
    const h = startAdapter(HP, LP, env);
    check(await waitFor(() => /pipeline on/.test(h.log())), 'a hand-started service comes up without a token in its environment', h.log());
    const { tokenFile } = await import(url(join(root, 'serve-legal.mjs')));
    const saved = { L: process.env.LOCALAPPDATA, X: process.env.XDG_CONFIG_HOME };
    process.env.LOCALAPPDATA = profile; process.env.XDG_CONFIG_HOME = profile;
    const tf = tokenFile(HP);
    if (saved.L === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = saved.L;
    if (saved.X === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = saved.X;
    const ft = existsSync(tf) ? readFileSync(tf, 'utf8').trim() : '';
    check(/^[0-9a-f]{64}$/.test(ft) && tf.startsWith(profile), 'it writes a 64-hex token file under the (redirected) user profile', { tf, ft: ft.length });
    if (process.platform !== 'win32' && existsSync(tf)) check((statSync(tf).mode & 0o077) === 0, 'readable by this account only (0600)', (statSync(tf).mode & 0o777).toString(8));
    const miss = await raw(HP, { method: 'POST', path: '/strip', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: TEXT }) });
    check(miss.status === 401 && miss.body.includes(JSON.stringify(tf).slice(1, -1)), 'its 401 names where the token is, which is the way through', miss.body.slice(0, 300));
    const ok = await raw(HP, { method: 'POST', path: '/strip', headers: { 'content-type': 'application/json', authorization: `Bearer ${ft}` }, body: JSON.stringify({ text: TEXT }) });
    check(ok.status === 200 && /STAGE_SAW token=absent/.test(ok.body), 'CONTROL: the token from the file opens /strip', ok.body.slice(0, 300));
  }

  // ── a token the service will not accept is refused at boot, not used ───────────────────
  for (const [what, tok] of [['empty', ''], ['short', 'abc123'], ['spaced', `${T.slice(0, 40)} ${T.slice(40)}`]]) {
    const b = startAdapter(BP, LP, { SIMPLER_LEGAL_TOKEN: tok }, ['--no-token-file']);
    const code = await Promise.race([b.exited, new Promise((r) => setTimeout(() => r('still running'), 8000))]);
    check(code === 2 && /refusing to start/.test(b.log()), `${what === 'empty' ? 'an' : 'a'} ${what} SIMPLER_LEGAL_TOKEN stops the service at boot (exit 2), with the rule in words`, { code, log: b.log().slice(0, 200) });
  }
} catch (e) {
  check(false, `harness error: ${e && e.stack ? e.stack : e}`);
} finally {
  globalThis.fetch = realFetch;
  for (const c of closers.reverse()) { try { await c(); } catch { /* already stopped */ } }
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a handle the OS has not released yet; the folder is under the temp dir */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
