// SERVICE LIFECYCLE — the engine service and the app after the handshake: who may reach the
// service without saying where from, whose files a second launch may touch, what stops a run,
// and what the screen and the receipt say about the processes a document went to.
// Run from app/frontend:   node test/service-lifecycle.mjs
//
// Each law below was a measured defect on 2026-09-23 (second pass on site-audit L7):
//   1. A PAGE'S NO-CORS REQUEST IS REFUSED. A <script src> GET carries no Origin, so the Origin
//      gate let it through: /health answered 200 to any web page and made the service probe its
//      model server. It carries Sec-Fetch-Site, which a page cannot forge.
//   2. A SECOND LAUNCH ON A BUSY PORT TOUCHES NOTHING. It used to sweep the running service's
//      working trees and rewrite its token file before finding the port taken, then delete the
//      file on exit: the running service's document failed mid-run ("doc=GONE") and the app
//      could no longer prove the service it was using.
//   3. A SERVICE SWEEPS ONLY ITS OWN PORT'S TREES. The sweep at boot removed every tree under
//      _serve, including those of a service running on another port.
//   4. A CALLER THAT HANGS UP STOPS THE RUN. engine.rs hangs up when its relay refuses a
//      connection mid-run or the checked model server exits. The service carried on: a process
//      that took the model port received the next 29 requests, each carrying a chunk of the
//      document. (The relay itself is proved by `cargo test` in app/src-tauri, relay.rs.)
//   5. THE RECEIPT SAYS WHICH PROCESS WAS STARTED OUTSIDE THE APP. One suffix for "the service
//      or its model server" made the receipt say the service was started outside the app when
//      only the model server was, and "by hand" of a model server the app cannot know was.
//   6. THE SCREEN KEEPS WHAT IT KNOWS. A refused service hid that the model server was started
//      outside the app; the model check was described as more than it is; a service whose
//      model was down was reported in use; the receipt named port 1436 whatever port was used;
//      a Rust rejection read "undefined"; a refusal said "press Retry" where no Retry renders,
//      and nothing ever started the app's own service again once its port came free.
//   7. A PROXY IN THE ENVIRONMENT STOPS A HAND-STARTED SERVICE AT BOOT. Node 22 sends fetch()
//      to 127.0.0.1 through HTTP_PROXY when NODE_USE_ENV_PROXY=1 or NODE_OPTIONS holds
//      --use-env-proxy, and the stages inherit the service's environment: every chunk of the
//      document would have passed through the proxy. (The app's own spawns remove these
//      variables: engine.rs scrub_proxy, proved by `cargo test`.)
//   8. THE MODEL PORT IS CHOSEN PER RUN. /strip's llamaPort sends that run's health check and
//      stages to the app's relay; a malformed one is refused before anything runs, and /hello
//      says llamaPerRun so the app can refuse a copy that would ignore it.
//   9. THE RECEIPT SAYS WHAT HAPPENED TO THIS DOCUMENT. A stopped run was recorded per engine:
//      the stopped document's receipt said "not reachable", a later clean document sat under a
//      red "this document" banner, the ready phase rendered no Retry for the "until Retry" it
//      promised, an in-app-core id with a suffix made the receipt say no engine ran (F3-R3),
//      and a frozen run on an outside model server was certified as the frozen configuration
//      although two of its settings were never checked (F3-R4).
//  10. THE IN-APP CORE'S RECEIPT NAMES WHO ANSWERED IT. Its model server came from the
//      engine-wide record, which the status checks write and which lags a change of holder:
//      after a stopped run the core's calls went to whichever checked process held the port,
//      and its receipt still named the app's own model (wf4 S-local-1). A stopped document's
//      receipt said the core "then read the whole document" when every one of its calls had
//      been refused (wf4 S-local-3). A request the model server read and never answered named
//      no process at all (wf4 S3-3).
// Every refusal has a CONTROL with the one thing changed. Ports 14380-14389, whatever is free;
// never 1436 or 49400. Every process and server started here is stopped before exit.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { connect, createServer as tcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const repo = join(here, '..', '..', '..');
const lib = join(here, '..', 'src', 'lib');
const url = (p) => 'file:///' + p.replace(/\\/g, '/');
const tmp = mkdtempSync(join(tmpdir(), 'service-lifecycle-'));
const root = join(tmp, 'root');
const profile = join(tmp, 'profile');
mkdirSync(root, { recursive: true });
mkdirSync(profile, { recursive: true });
cpSync(join(repo, 'serve-legal.mjs'), join(root, 'serve-legal.mjs'));
cpSync(join(repo, 'lib-core'), join(root, 'lib-core'), { recursive: true });
cpSync(join(repo, 'lib-legal'), join(root, 'lib-legal'), { recursive: true });
// The first stage, in the temp root only. STAGE_MODE (inherited from the service's environment):
//   wait   hold the document for STAGE_DELAY_MS, then say whether it is still there
//   calls  make STAGE_CALLS model requests STAGE_GAP_MS apart, as the real stage does per chunk
// then exit non-zero, which the service relays as its error line.
writeFileSync(join(root, 'strip-batch.mjs'), [
  "import { existsSync, readFileSync } from 'node:fs';",
  "import { join } from 'node:path';",
  "import { createHash } from 'node:crypto';",
  "const a = process.argv.slice(2); const src = a[a.indexOf('--srcdir') + 1]; const port = a[a.indexOf('--port') + 1];",
  "const f = join(src, 'doc.txt'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));",
  "const mode = process.env.STAGE_MODE || '';",
  // echo: what the chain would read, as a hash of doc.txt's bytes and a count of U+FFFD in it
  "if (mode === 'echo') { const b = readFileSync(f); process.stderr.write(`ECHO sha=${createHash('sha256').update(b).digest('hex')} fffd=${(b.toString('utf8').match(/\\uFFFD/g) || []).length}`); process.exit(3); }",
  // astral: a stage whose stderr puts an emoji across unit 800 of the service's error line
  "if (mode === 'astral') { process.stderr.write('x'.repeat(781) + '\\u{1F600}'); process.exit(3); }",
  "if (mode === 'wait') await sleep(Number(process.env.STAGE_DELAY_MS || 0));",
  "let calls = 0;",
  "if (mode === 'calls') for (let i = 0; i < Number(process.env.STAGE_CALLS || 0); i++) {",
  "  await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: readFileSync(f, 'utf8') }] }) }).catch(() => {});",
  "  calls++; await sleep(Number(process.env.STAGE_GAP_MS || 0));",
  "}",
  "console.error(`STAGE_SAW doc=${existsSync(f) ? readFileSync(f, 'utf8').length : 'GONE'} calls=${calls}`);",
  'process.exit(3);',
].join('\n'));
const SERVE = join(root, 'raw', 'stripped', '_serve');
const trees = () => (existsSync(SERVE) ? readdirSync(SERVE) : []);

let pass = 0, fail = 0;
const check = (ok, what, got) => { console.log((ok ? 'PASS ' : 'FAIL ') + what + (ok || got === undefined ? '' : `\n     got: ${typeof got === 'string' ? got : JSON.stringify(got)}`.slice(0, 900))); ok ? pass++ : fail++; };
const closers = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePorts(n) {
  const got = [];
  for (let p = 14380; p <= 14389 && got.length < n; p++) {
    const ok = await new Promise((r) => { const s = tcpServer(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))); });
    if (ok) got.push(p);
  }
  if (got.length < n) throw new Error(`service-lifecycle: needs ${n} free ports in 14380-14389, found ${got.length} (${got.join(', ')}); free some and rerun`);
  return got;
}

function raw(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const q = request({ host: '127.0.0.1', port, method, path, headers, agent: false }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    q.on('error', (e) => resolve({ status: 0, headers: {}, body: String(e.message) }));
    if (body !== undefined) q.write(body);
    q.end();
  });
}

function startAdapter(port, llamaPort, env, extra = [], script = 'serve-legal.mjs') {
  const e = { ...process.env, ...env };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete e[k];
  const child = spawn(process.execPath, [script, '--port', String(port), '--llama', String(llamaPort), ...extra], { cwd: root, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const exited = new Promise((r) => child.on('exit', (code) => r(code)));
  closers.push(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; } });
  return { child, log: () => log, exited };
}
async function waitFor(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(50); }
  return false;
}
function fakeModel(port, healthy = true) {
  const hits = { health: 0, completions: 0 };
  const srv = createServer((req, res) => {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => {
      if (req.url === '/health') { hits.health++; res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' }); return res.end(healthy ? '{"status":"ok"}' : '{"status":"loading"}'); }
      hits.completions++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '' } }] }));
    });
  });
  closers.push(() => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); }));
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(hits)));
}
const withProfile = async (fn) => {
  const saved = { L: process.env.LOCALAPPDATA, X: process.env.XDG_CONFIG_HOME };
  process.env.LOCALAPPDATA = profile; process.env.XDG_CONFIG_HOME = profile;
  try { return await fn(); } finally {
    if (saved.L === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = saved.L;
    if (saved.X === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = saved.X;
  }
};

// ── bundles of the app's own modules (the service-auth.mjs pattern) ─────────────────────────
const nm = join(tmp, 'node_modules');
for (const [pkg, file, body] of [
  ['@tauri-apps/api', 'core.js', 'export class Channel { constructor(){ this.onmessage = () => {} } }\nexport function invoke(cmd, args){ if (!globalThis.__invoke) throw new Error("invoke() reached on the browser path"); return globalThis.__invoke(cmd, args) }\n'],
  ['@tauri-apps/plugin-dialog', 'index.js', 'export function save(){ throw new Error("save() reached") }\n'],
]) {
  const d = join(nm, ...pkg.split('/'));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, file), body);
  writeFileSync(join(d, 'package.json'), JSON.stringify(pkg === '@tauri-apps/api' ? { name: pkg, type: 'module', exports: { './core': './core.js' } } : { name: pkg, type: 'module', main: file }));
}
writeFileSync(join(tmp, 'package.json'), JSON.stringify({ type: 'module' }));
const stubs = { '@tauri-apps/api/core': join(nm, '@tauri-apps', 'api', 'core.js'), '@tauri-apps/plugin-dialog': join(nm, '@tauri-apps', 'plugin-dialog', 'index.js') };
const entry = "export * from './tauri';\nexport { engineTrust, engineCopy, engineIdentity, noteEngineTrust, inAppCoreId, inAppCoreStamp, coreRun, coreCallSent, noteRunStopped, noteRunFailed, handSuffix, HAND_SERVICE, HAND_MODEL, HAND_STARTED, RUN_STOPPED, RUN_CUT, RUN_FAILED, RUN_HAND_SERVICE, RUN_HAND_MODEL, LEFT_ON_DISK, LEFT_ON_DISK_SAID, MODEL_CHANGED } from './engineStatus';\n";
async function bundle(name, env) {
  const outfile = join(tmp, `${name}.mjs`);
  const define = { 'import.meta.env.DEV': 'true' };
  for (const [k, v] of Object.entries(env)) define[`import.meta.env.${k}`] = JSON.stringify(v);
  await build({ stdin: { contents: entry, resolveDir: lib, loader: 'ts', sourcefile: 'entry.ts' }, bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent', absWorkingDir: tmp, alias: stubs, define });
  return outfile;
}
async function tauriBundle(name) {
  globalThis.window = { __TAURI_INTERNALS__: {} };
  try { return await import(url(await bundle(name, {}))); } finally { delete globalThis.window; }
}

try {
  const [LP, DP, AP, BP, CP, HP, PP, L2] = await freePorts(8);
  const T = randomBytes(32).toString('hex');
  const TEXT = 'The appellant, Jane Roe, of 12 Elm Street, appeals the order of the district court.';
  const model = await fakeModel(LP);
  await fakeModel(DP, false); // a model server that answers /health 503: loading, or down

  // ── law 1: no Origin, but a browser's Sec-Fetch-Site ─────────────────────────────────────
  {
    const a = startAdapter(AP, LP, { SIMPLER_LEGAL_TOKEN: T }, ['--no-token-file']);
    check(await waitFor(() => /pipeline on/.test(a.log())), `a service is up on scratch port ${AP}`, a.log());
    for (const site of ['cross-site', 'same-site', 'cross-origin-garbage']) {
      const before = model.health;
      const rs = [
        await raw(AP, { path: '/health', headers: { 'sec-fetch-site': site } }),
        await raw(AP, { path: '/hello', headers: { 'sec-fetch-site': site, 'x-simpler-challenge': 'ab'.repeat(32) } }),
        await raw(AP, { method: 'POST', path: '/strip', headers: { 'sec-fetch-site': site, 'content-type': 'text/plain', authorization: `Bearer ${T}` }, body: JSON.stringify({ text: TEXT }) }),
      ];
      check(rs.every((r) => r.status === 403 && /Sec-Fetch-Site/.test(r.body) && !('access-control-allow-origin' in r.headers)) && model.health === before && trees().length === 0,
        `no Origin, Sec-Fetch-Site ${site}: /health, /hello and /strip (with the token) all 403, and the service does not probe its model`, rs.map((r) => `${r.status} ${r.body.slice(0, 90)}`));
    }
    for (const [what, headers] of [['no Sec-Fetch-Site (engine.rs, curl)', {}], ['Sec-Fetch-Site none (typed in the address bar)', { 'sec-fetch-site': 'none' }], ['Sec-Fetch-Site same-origin', { 'sec-fetch-site': 'same-origin' }], ['the dev origin with Sec-Fetch-Site cross-site', { origin: 'http://localhost:1435', 'sec-fetch-site': 'cross-site' }]]) {
      const r = await raw(AP, { path: '/health', headers });
      check(r.status === 200, `CONTROL: ${what} is served`, `${r.status} ${r.body.slice(0, 120)}`);
    }
    a.child.kill(); await a.exited;
  }

  // ── law 2: a second launch on a busy port ────────────────────────────────────────────────
  const { tokenFile, isOwnTree, treePrefix } = await import(url(join(root, 'serve-legal.mjs')));
  const handEnv = { SIMPLER_LEGAL_TOKEN: undefined, LOCALAPPDATA: profile, XDG_CONFIG_HOME: profile, STAGE_MODE: 'wait', STAGE_DELAY_MS: '2500' };
  const tf = await withProfile(() => tokenFile(BP));
  const first = startAdapter(BP, LP, handEnv);
  check(await waitFor(() => /pipeline on/.test(first.log())), 'a hand-started service is up and has written its token file', first.log());
  const ft = existsSync(tf) ? readFileSync(tf, 'utf8').trim() : '';
  {
    const run = raw(BP, { method: 'POST', path: '/strip', headers: { 'content-type': 'application/json', authorization: `Bearer ${ft}` }, body: JSON.stringify({ text: TEXT }) });
    check(await waitFor(() => trees().some((n) => n.startsWith(treePrefix(BP)))), 'its run holds a working tree named for its port', trees());
    const second = startAdapter(BP, LP, handEnv);
    const code = await Promise.race([second.exited, sleep(8000).then(() => 'still running')]);
    check(code === 2 && /already in use/.test(second.log()) && !/boot sweep|token is in/.test(second.log()),
      'a second launch on the same port exits 2, saying the port is in use, before sweeping or writing anything', { code, log: second.log().slice(0, 300) });
    const after = existsSync(tf) ? readFileSync(tf, 'utf8').trim() : 'ABSENT';
    check(after === ft, "the running service's token file is still its own", { before: ft.slice(0, 8), after: after.slice(0, 8) });
    const r = await run;
    check(r.status === 200 && new RegExp(`STAGE_SAW doc=${TEXT.length}\\b`).test(r.body), "and its in-flight document was not swept from under it (it was, measured: doc=GONE)", r.body.slice(0, 300));
    const again = await raw(BP, { method: 'POST', path: '/strip', headers: { 'content-type': 'application/json', authorization: `Bearer ${after}` }, body: JSON.stringify({ text: TEXT }) });
    check(again.status === 200 && /STAGE_SAW doc=/.test(again.body), 'CONTROL: the first service still serves the token in the file', again.body.slice(0, 200));
  }

  // ── law 3: a service on another port sweeps only its own trees ───────────────────────────
  {
    check(isOwnTree(`${treePrefix(CP)}x-1`, CP) && isOwnTree('mud7x-1', CP) && !isOwnTree(`${treePrefix(BP)}x-1`, CP) && !isOwnTree(`p${CP}0-x`, CP),
      'isOwnTree: its own port prefix and legacy unprefixed names are its own; another port, including one that starts with the same digits, is not');
    const run = raw(BP, { method: 'POST', path: '/strip', headers: { 'content-type': 'application/json', authorization: `Bearer ${ft}` }, body: JSON.stringify({ text: TEXT }) });
    check(await waitFor(() => trees().some((n) => n.startsWith(treePrefix(BP)))), 'the first service is mid-run again', trees());
    mkdirSync(join(SERVE, `${treePrefix(CP)}stale-1`), { recursive: true });
    mkdirSync(join(SERVE, 'legacy-stale-1'), { recursive: true });
    const other = startAdapter(CP, LP, { SIMPLER_LEGAL_TOKEN: T }, ['--no-token-file']);
    check(await waitFor(() => /pipeline on/.test(other.log())), `a service on another port (${CP}) boots`, other.log());
    const left = trees();
    check(left.some((n) => n.startsWith(treePrefix(BP))), "its boot sweep leaves the other port's in-flight tree alone", left);
    check(!left.includes(`${treePrefix(CP)}stale-1`) && !left.includes('legacy-stale-1'), 'CONTROL: it does remove a stale tree of its own port, and a legacy unprefixed one', left);
    const r = await run;
    check(new RegExp(`STAGE_SAW doc=${TEXT.length}\\b`).test(r.body), 'and the other service finishes with its document intact', r.body.slice(0, 200));
    other.child.kill(); await other.exited;
  }
  first.child.kill(); await first.exited;

  // ── law 4: a caller that hangs up stops the run ──────────────────────────────────────────
  {
    const env = { SIMPLER_LEGAL_TOKEN: T, STAGE_MODE: 'calls', STAGE_CALLS: '40', STAGE_GAP_MS: '40' };
    const h = startAdapter(HP, LP, env, ['--no-token-file']);
    check(await waitFor(() => /pipeline on/.test(h.log())), `a service is up on ${HP} with a stage that calls the model 40 times`, h.log());
    const body = JSON.stringify({ text: TEXT });
    const base = model.completions;
    const q = request({ host: '127.0.0.1', port: HP, method: 'POST', path: '/strip', agent: false, headers: { 'content-type': 'application/json', authorization: `Bearer ${T}`, 'content-length': Buffer.byteLength(body) } });
    q.on('error', () => {});
    q.on('response', (res) => res.on('data', () => {}).on('error', () => {}));
    q.end(body);
    await waitFor(() => model.completions - base >= 3, 10000);
    q.destroy();
    const atHangup = model.completions - base;
    await sleep(1500);
    const after = model.completions - base;
    check(atHangup >= 3 && after - atHangup <= 1 && /caller closed the connection; stopping the chain/.test(h.log()),
      `hanging up after ${atHangup} model calls stops the stage: ${after - atHangup} more reached the model (at most the one in flight)`, { atHangup, after, log: h.log().slice(-300) });
    check(await waitFor(() => !trees().some((n) => n.startsWith(treePrefix(HP))), 3000), 'and the run removed its working tree', trees());
    const base2 = model.completions;
    const full = await raw(HP, { method: 'POST', path: '/strip', headers: { 'content-type': 'application/json', authorization: `Bearer ${T}` }, body });
    check(model.completions - base2 === 40 && /STAGE_SAW doc=\d+ calls=40/.test(full.body), 'CONTROL: a caller that stays makes all 40 calls', { calls: model.completions - base2, body: full.body.slice(0, 200) });
    h.child.kill(); await h.exited;
  }

  // ── law 7: a proxy in the environment ────────────────────────────────────────────────────
  {
    const { proxyHazard } = await import(url(join(root, 'serve-legal.mjs')));
    const proxyHits = { n: 0 };
    const proxy = createServer((req, res) => { proxyHits.n++; res.writeHead(502); res.end(); });
    proxy.on('connect', (req, sock) => { proxyHits.n++; sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); });
    await new Promise((r) => proxy.listen(PP, '127.0.0.1', r));
    closers.push(() => new Promise((r) => { proxy.closeAllConnections?.(); proxy.close(r); }));
    const P = `http://127.0.0.1:${PP}`;
    // Built from nothing proxy-related (Windows env names are case-insensitive, so a plain
    // delete of one spelling can leave the other)
    const bare = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k) && k.toUpperCase() !== 'NODE_OPTIONS' && k.toUpperCase() !== 'SIMPLER_LEGAL_TOKEN'));
    const boot = (env) => {
      const child = spawn(process.execPath, ['serve-legal.mjs', '--port', String(AP), '--llama', String(LP), '--no-token-file'], { cwd: root, env: { ...bare, SIMPLER_LEGAL_TOKEN: T, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '';
      child.stdout.on('data', (d) => (log += d));
      child.stderr.on('data', (d) => (log += d));
      const exited = new Promise((r) => child.on('exit', (code) => r(code)));
      closers.push(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; } });
      return { child, log: () => log, exited };
    };

    // the hazard is real on this machine's Node: the stage itself, run with these settings,
    // sends its model call to the proxy. Without this the refusals below could be refusing
    // something harmless.
    const docDir = join(tmp, 'proxy-doc');
    mkdirSync(docDir, { recursive: true });
    writeFileSync(join(docDir, 'doc.txt'), TEXT);
    const direct = (env) => new Promise((r) => {
      const c = spawn(process.execPath, ['strip-batch.mjs', '--srcdir', docDir, '--port', String(LP)], { cwd: root, env: { ...bare, STAGE_MODE: 'calls', STAGE_CALLS: '1', ...env }, stdio: 'ignore' });
      c.on('exit', () => r());
    });
    let p0 = proxyHits.n, m0 = model.completions;
    await direct({ NODE_USE_ENV_PROXY: '1', HTTP_PROXY: P });
    check(proxyHits.n - p0 >= 1 && model.completions === m0,
      `CONTROL (node ${process.version}): a stage run with NODE_USE_ENV_PROXY=1 and HTTP_PROXY sends its model call, with the document, to the proxy and not to the model`, { proxy: proxyHits.n - p0, model: model.completions - m0 });
    p0 = proxyHits.n; m0 = model.completions;
    await direct({});
    check(proxyHits.n === p0 && model.completions - m0 === 1, 'CONTROL: without them the same stage reaches the model', { proxy: proxyHits.n - p0, model: model.completions - m0 });

    for (const [what, env, says] of [
      ['NODE_USE_ENV_PROXY=1 with HTTP_PROXY', { NODE_USE_ENV_PROXY: '1', HTTP_PROXY: P }, /NODE_USE_ENV_PROXY="1" with HTTP_PROXY set/],
      ['--use-env-proxy in NODE_OPTIONS with http_proxy', { NODE_OPTIONS: '--use-env-proxy', http_proxy: P }, /--use-env-proxy in NODE_OPTIONS with (HTTP_PROXY|http_proxy) set/],
    ]) {
      p0 = proxyHits.n;
      const s = boot(env);
      const code = await Promise.race([s.exited, sleep(8000).then(() => 'still running')]);
      const probe = await raw(AP, { path: '/health' });
      check(code === 2 && /refusing to start/.test(s.log()) && says.test(s.log()) && /add 127\.0\.0\.1 to NO_PROXY/.test(s.log()) && !s.log().includes(P) && probe.status === 0 && proxyHits.n === p0,
        `a hand-started service with ${what} refuses to start, says which setting and the way through, does not print the proxy's address, never listens, and the proxy hears nothing`, { code, log: s.log().slice(0, 400), probe: probe.status, proxy: proxyHits.n - p0 });
    }
    {
      p0 = proxyHits.n; m0 = model.completions;
      const s = boot({ NODE_USE_ENV_PROXY: '1', HTTP_PROXY: P, NO_PROXY: '127.0.0.1', STAGE_MODE: 'calls', STAGE_CALLS: '2', STAGE_GAP_MS: '0' });
      check(await waitFor(() => /pipeline on/.test(s.log())), 'CONTROL: the same settings with 127.0.0.1 in NO_PROXY boot', s.log());
      const r = await raw(AP, { method: 'POST', path: '/strip', headers: { 'content-type': 'application/json', authorization: `Bearer ${T}` }, body: JSON.stringify({ text: TEXT }) });
      check(/STAGE_SAW doc=\d+ calls=2/.test(r.body) && model.completions - m0 === 2 && proxyHits.n === p0,
        'and its run reaches the model directly, the proxy hearing nothing', { body: r.body.slice(0, 200), model: model.completions - m0, proxy: proxyHits.n - p0 });
      s.child.kill(); await s.exited;
    }
    const H = (env, argv = []) => proxyHazard(env, argv);
    const table = [
      [{}, null], [{ NODE_USE_ENV_PROXY: '1' }, null], [{ HTTP_PROXY: P }, null],
      [{ HTTPS_PROXY: P, NODE_USE_ENV_PROXY: '1' }, null], [{ ALL_PROXY: P, NODE_USE_ENV_PROXY: '1' }, null],
      [{ HTTP_PROXY: P, NODE_USE_ENV_PROXY: '0' }, null], [{ HTTP_PROXY: P, NODE_USE_ENV_PROXY: '' }, null],
      [{ HTTP_PROXY: P, NODE_USE_ENV_PROXY: '1', NO_PROXY: '*' }, null], [{ HTTP_PROXY: P, NODE_USE_ENV_PROXY: '1', no_proxy: 'example.com, 127.0.0.1' }, null],
      [{ HTTP_PROXY: P, NODE_OPTIONS: '--max-old-space-size=4096 --no-use-env-proxy' }, null],
      [{ HTTP_PROXY: P, NODE_USE_ENV_PROXY: '1', NO_PROXY: 'localhost' }, 'hazard'], [{ HTTP_PROXY: P, NODE_USE_ENV_PROXY: '1', NO_PROXY: '127.0.0.0/8' }, 'hazard'],
      [{ HTTP_PROXY: P, NODE_USE_ENV_PROXY: 'true' }, 'hazard'], [{ http_proxy: P, NODE_OPTIONS: '--max-old-space-size=4096 --use-env-proxy' }, 'hazard'],
      [{ HTTP_PROXY: P, NODE_OPTIONS: '--use_env_proxy' }, 'hazard'],
    ];
    const wrong = table.filter(([env, want]) => (H(env) === null ? null : 'hazard') !== want).map(([env, want]) => ({ env, want, got: H(env) }));
    const argvHazard = H({ HTTP_PROXY: P }, ['--use-env-proxy']);
    check(wrong.length === 0 && argvHazard !== null && H({ HTTP_PROXY: P }, ['--inspect']) === null,
      `proxyHazard follows the measured table (${table.length} rows: the switch, the carrier, and the NO_PROXY entries Node 22 honours), and --use-env-proxy on the service's own command line`, { wrong, argvHazard });
  }

  // ── law 8: the model port, per run ───────────────────────────────────────────────────────
  {
    const second = await fakeModel(L2);
    const s = startAdapter(AP, LP, { SIMPLER_LEGAL_TOKEN: T, STAGE_MODE: 'calls', STAGE_CALLS: '2', STAGE_GAP_MS: '0' }, ['--no-token-file']);
    check(await waitFor(() => /pipeline on/.test(s.log())), `a service on ${AP} whose --llama is ${LP}`, s.log());
    const post = (body) => raw(AP, { method: 'POST', path: '/strip', headers: { 'content-type': 'application/json', authorization: `Bearer ${T}` }, body: JSON.stringify(body) });
    let a0 = model.completions, b0 = second.completions, h0 = second.health;
    const r = await post({ text: TEXT, llamaPort: L2 });
    check(/STAGE_SAW doc=\d+ calls=2/.test(r.body) && second.completions - b0 === 2 && second.health - h0 >= 1 && model.completions === a0,
      `llamaPort ${L2}: the run's health check and its stage go to that port, and nothing to --llama`, { body: r.body.slice(0, 160), l2: second.completions - b0, l2health: second.health - h0, llama: model.completions - a0 });
    for (const bad of [0, 65536, 1.5, String(L2), null, -1]) {
      a0 = model.completions; b0 = second.completions; h0 = second.health;
      const t0 = trees().length;
      const x = await post({ text: TEXT, llamaPort: bad });
      check(x.status === 400 && /llamaPort must be a whole number from 1 to 65535/.test(x.body) && /nothing was run/.test(x.body) && model.completions === a0 && second.completions === b0 && second.health === h0 && trees().length === t0,
        `llamaPort ${JSON.stringify(bad)} is refused (400) before anything runs or any model is asked`, `${x.status} ${x.body.slice(0, 160)}`);
    }
    const down = await post({ text: TEXT, llamaPort: DP });
    check(down.status === 503 && /model offline/.test(down.body), 'a llamaPort whose model server is not ready gets the same 503 as the default port', `${down.status} ${down.body.slice(0, 120)}`);
    a0 = model.completions; b0 = second.completions;
    const d = await post({ text: TEXT });
    check(/calls=2/.test(d.body) && model.completions - a0 === 2 && second.completions === b0, 'CONTROL: without llamaPort the run uses --llama, as before', { llama: model.completions - a0, l2: second.completions - b0 });
    s.child.kill(); await s.exited;
  }

  // ── wf6 SL-1: the service's error line, cut inside a surrogate pair ──────────────────────
  // JSON.stringify writes a lone high surrogate as \ud83d, which serde_json refuses: engine.rs
  // then failed the run on that line and the disk line before it lost its mark on the receipt.
  {
    const { cut } = await import(url(join(root, 'serve-legal.mjs')));
    check(cut('ab\u{1F600}', 3) === 'ab' && cut('ab\u{1F600}', 4) === 'ab\u{1F600}' && cut('abc', 2) === 'ab' && cut('', 5) === '',
      'cut() drops a high surrogate left alone at the end, and nothing else (CONTROL: the whole pair, and plain text, stay)');
    const s = startAdapter(AP, LP, { SIMPLER_LEGAL_TOKEN: T, STAGE_MODE: 'astral' }, ['--no-token-file']);
    check(await waitFor(() => /pipeline on/.test(s.log())), `a service on ${AP} whose first stage writes an emoji across unit 800`, s.log());
    const r = await raw(AP, { method: 'POST', path: '/strip', headers: { 'content-type': 'application/json', authorization: `Bearer ${T}` }, body: JSON.stringify({ text: TEXT }) });
    const errLine = r.body.split('\n').find((l) => /"error"/.test(l)) || '';
    const lone = /\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f][0-9a-f]{2})/i;
    const uncut = ('substrate failed: ' + 'x'.repeat(781) + '\u{1F600}').slice(0, 800);
    check(/[\uD800-\uDBFF]$/.test(uncut) && /"substrate failed: x{781}"/.test(errLine) && !lone.test(r.body),
      'the error line is cut on a whole character, so it carries no lone \\ud83d (CONTROL: a plain 800-unit slice of the same words ends in one)', errLine.slice(-80));
    s.child.kill(); await s.exited;
  }

  // ── wf6 S3-1: a request body split inside a character ────────────────────────────────────
  // Each TCP read was decoded on its own, so a character whose bytes a read boundary split
  // became U+FFFD in doc.txt: the chain tagged a name that is not in the original, and its row
  // could not be placed back. Every byte offset inside three names is a separate request, sent
  // as two writes 40 ms apart so the service reads them apart. The stage prints a hash of the
  // doc.txt it was given.
  {
    const NAMES = ['José Núñez', '王小明', 'Zoë 🌸 Ng'];
    const sendSplit = (port, bytes, at) => new Promise((resolve) => {
      const sock = connect(port, '127.0.0.1');
      sock.setNoDelay(true);
      let got = '';
      sock.on('data', (d) => (got += d));
      sock.on('end', () => resolve(got));
      sock.on('error', (e) => resolve(`SOCKET ERROR ${e.message}`));
      sock.on('connect', () => {
        const head = `POST /strip HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${T}\r\nContent-Type: application/json\r\nContent-Length: ${bytes.length}\r\nConnection: close\r\n\r\n`;
        sock.write(Buffer.concat([Buffer.from(head), bytes.subarray(0, at)]));
        setTimeout(() => sock.write(bytes.subarray(at)), 40);
      });
    });
    const sweep = async (port) => {
      const out = { requests: 0, fffd: 0, shaMismatch: 0, unread: 0, first: null };
      for (const name of NAMES) {
        const text = `The appellant, ${name}, appeals.`;
        const bytes = Buffer.from(JSON.stringify({ text }));
        const want = createHash('sha256').update(Buffer.from(text)).digest('hex');
        const start = bytes.indexOf(Buffer.from(name));
        for (let at = start + 1; at < start + Buffer.byteLength(name); at++) {
          out.requests++;
          const r = await sendSplit(port, bytes, at);
          const m = r.match(/ECHO sha=([0-9a-f]{64}) fffd=(\d+)/);
          if (!m) { out.unread++; out.first ??= r.slice(-300); continue; }
          out.fffd += Number(m[2]);
          if (m[1] !== want) out.shaMismatch++;
        }
      }
      return out;
    };
    const s = startAdapter(AP, LP, { SIMPLER_LEGAL_TOKEN: T, STAGE_MODE: 'echo' }, ['--no-token-file']);
    check(await waitFor(() => /pipeline on/.test(s.log())), `a service on ${AP} whose first stage reports the document it was given`, s.log());
    const fixed = await sweep(AP);
    s.child.kill(); await s.exited;
    check(fixed.requests === NAMES.reduce((n, x) => n + Buffer.byteLength(x) - 1, 0) && fixed.requests === 31 && fixed.unread === 0 && fixed.fffd === 0 && fixed.shaMismatch === 0,
      'S3-1: a body split at every byte offset inside an accented, a CJK and an emoji name reaches the chain byte for byte (measured before: U+FFFD for every split inside a character)', fixed);
    // CONTROL: the same service with its one decoding line taken out, from the same temp root
    const src = readFileSync(join(root, 'serve-legal.mjs'), 'utf8');
    const mutant = src.replace("    req.setEncoding('utf8')\n", '');
    writeFileSync(join(root, 'serve-legal-no-decode.mjs'), mutant);
    const m = startAdapter(AP, LP, { SIMPLER_LEGAL_TOKEN: T, STAGE_MODE: 'echo' }, ['--no-token-file'], 'serve-legal-no-decode.mjs');
    check(mutant !== src && await waitFor(() => /pipeline on/.test(m.log())), 'CONTROL: the service without its stream decoding boots', m.log());
    const broken = await sweep(AP);
    m.child.kill(); await m.exited;
    console.log(`     measured without the decoding: ${broken.shaMismatch}/${broken.requests} splits changed the document, ${broken.fffd} U+FFFD`);
    check(broken.unread === 0 && broken.fffd > 0 && broken.shaMismatch > 0,
      'CONTROL: without it the same splits put U+FFFD in the document the chain reads, so the pass above is about the decoding', broken);
  }

  // ── law 6, browser path: a proven service whose model is down is not "in use" ────────────
  {
    const down = startAdapter(AP, DP, { SIMPLER_LEGAL_TOKEN: T }, ['--no-token-file']);
    check(await waitFor(() => /pipeline on/.test(down.log())), 'a service whose model server answers 503', down.log());
    const page = await import(url(await bundle('page-down', { VITE_SIMPLER_LEGAL_TOKEN: T, VITE_SIMPLER_LEGAL_PORT: String(AP) })));
    const h = await page.legalServiceHealth();
    const t = page.engineTrust();
    check(h === null && t.service === null && /model server is not answering/.test(t.serviceRefused || ''),
      'browser: a service that proves itself but whose model is down is not recorded as in use, and the page says why', { h, t });
    const c = page.engineCopy('ready', false);
    check(!/Documents go to an engine service started by hand/.test(c.settings) && c.rail !== 'Engine ready · started by hand', 'and the screen does not say documents go to it', c);
    down.child.kill(); await down.exited;
    const up = startAdapter(AP, LP, { SIMPLER_LEGAL_TOKEN: T }, ['--no-token-file']);
    check(await waitFor(() => /pipeline on/.test(up.log())), 'the same service with its model up', up.log());
    const h2 = await page.legalServiceHealth();
    check(h2 && h2.service === 'hand' && page.engineTrust().service === 'hand' && page.engineTrust().serviceRefused === null, 'CONTROL: with its model up it is used, and named started by hand', page.engineTrust());
    const id = page.engineIdentity({ engine: `v1-legal-frozen${page.HAND_SERVICE}` });
    check(id.label.includes(`127.0.0.1:${AP}`) && !id.label.includes('127.0.0.1:1436'), `the receipt names the port the page used (${AP}), not 1436`, id.label);
    up.child.kill(); await up.exited;
  }

  // ── law 5: the receipt, per origin (Tauri path) ──────────────────────────────────────────
  const app = await tauriBundle('tauri-receipt');
  {
    const strip = (meta) => async (cmd, args) => {
      if (cmd !== 'strip_proxy') throw new Error(`unexpected ${cmd}`);
      args.onEvent.onmessage({ stage: 'substrate' });
      args.onEvent.onmessage({ done: true, genre: 'courts', engine: 'v1-legal-frozen', final: 'x', alignOk: true, rows: [] });
      return meta;
    };
    const run = async (meta) => { globalThis.__invoke = strip(meta); const r = await app.stripLegalService(TEXT, () => {}); return { r, id: app.engineIdentity({ engine: r.engine, genre: 'courts' }) }; };
    const s = await run({ service: 'hand', model: 'app' });
    check(s.r.engine === `v1-legal-frozen${app.HAND_SERVICE}` && s.id.handService && !s.id.handModel && s.id.short === 'the frozen v1-legal pipeline (started by hand)' && /started by hand, outside this app/.test(s.id.label) && !/model server/.test(s.id.label),
      'service started by hand, model the app\'s: the receipt says the service, and says nothing of the model server', s);
    const m = await run({ service: 'app', model: 'hand' });
    check(m.r.engine === `v1-legal-frozen${app.HAND_MODEL}` && m.id.handModel && !m.id.handService && /which this app started; its model server was started outside this app/.test(m.id.label) && !/by hand/.test(m.id.label + m.id.short + m.id.detail),
      'model server started outside the app, service the app\'s: the receipt says the service is the app\'s, and never "by hand" of the model (measured before: "the engine service … was started outside this app")', m);
    check(/does not certify this run as the frozen configuration/.test(m.id.label) && /--jinja and thinking-off settings were not checked/.test(m.id.detail) && m.id.frozen,
      'law 9 (F3-R4): a frozen run on an outside model server is not certified as the frozen configuration on its receipt, and says which settings went unchecked (it still counts as a run of the frozen service)', m.id);
    const b = await run({ service: 'hand', model: 'hand' });
    check(b.r.engine === `v1-legal-frozen${app.HAND_SERVICE}${app.HAND_MODEL}` && b.id.handService && b.id.handModel && /service was started by hand, outside this app, and its model server was also started outside this app/.test(b.id.label),
      'both: the receipt names each', b.id.label);
    const o = await run({ service: 'app', model: 'app' });
    check(o.r.engine === 'v1-legal-frozen' && !o.id.handStarted && o.id.label === 'v1-legal — the frozen pack pipeline, as reported by the local engine service on 127.0.0.1:1436' && o.id.detail === 'genre routed: courts',
      "CONTROL: the app's own service and model leave the id and the label as they were", o.id);
    check(!/certify/.test(s.id.label) && !/certify/.test(o.id.label), 'CONTROL: with the app\'s own model server the receipt carries no certification caveat', { s: s.id.label, o: o.id.label });
    const legacy = app.engineIdentity({ engine: `v1-legal-frozen${app.HAND_STARTED}` });
    check(legacy.handStarted && !legacy.handService && !legacy.handModel && /that service or its model server was started outside this app/.test(legacy.label),
      'a receipt stored before the split still reads, claiming only what it established', legacy);
    const core = app.engineIdentity({ engine: `in-app-core${app.HAND_MODEL}` });
    check(core.handModel && !core.frozen && /using a model server started outside this app/.test(core.label), 'an in-app-core id carrying the model suffix is read as the in-app core on an outside model server', core);
    const rec = (...answers) => { const r = app.coreRun(); for (const a of answers) app.coreCallSent(r)(a); return r; };
    check(app.inAppCoreId(rec({ model: 'hand', pid: 7, created: '1' })) === `in-app-core${app.HAND_MODEL}` && app.inAppCoreId(rec({ model: 'app', pid: 5, created: '1' })) === 'in-app-core' && app.inAppCoreId(rec()) === 'in-app-core',
      'inAppCoreId stamps the suffix only when an outside model server answered (CONTROL: the app\'s own, and none at all)');
  }

  // ── law 6, Tauri path: rejections, incidents, the copy ───────────────────────────────────
  {
    globalThis.__invoke = async (cmd) => { if (cmd === 'strip_proxy') throw 'legal service: nothing is listening on 127.0.0.1:1436'; throw new Error(`unexpected ${cmd}`); };
    let err = null;
    try { await app.stripLegalService(TEXT, () => {}); } catch (e) { err = e; }
    check(err instanceof Error && err.message === 'legal service: nothing is listening on 127.0.0.1:1436' && app.engineTrust().incident === null,
      "a string rejection from Rust reaches the caller as an Error with the words (measured before: 'Legal service failed (undefined)'), and is not an incident", { err: String(err?.message), incident: app.engineTrust().incident });
    globalThis.__invoke = async (cmd) => { if (cmd === 'complete_local') throw 'local model: nothing is serving on 127.0.0.1:49400 yet'; throw new Error(`unexpected ${cmd}`); };
    err = null;
    try { await app.completeLocal('s', 'u'); } catch (e) { err = e; }
    check(err instanceof Error && /nothing is serving/.test(err.message), 'and so does every other command', String(err?.message));
    // engine.rs's words for a stopped run, in the shape incident_words() builds them: a pid and
    // a path, which may go on screen and must never reach a receipt
    const why = 'the model server on port 49400 was checked as process 6, and this connection was answered by process 7, not by the model server that was checked (pid 6)';
    const words = `The frozen pipeline was stopped partway through a document: ${why}. The app checks every connection to the model server before any text is sent on it, so none of that document was sent to a process the app had not checked. The in-app core redacts that document instead; its row and its receipt say so. Port 49400 is now held by C:\\Users\\someone\\squat.exe (pid 7, your own account, not started by this app). If you did not restart the model server yourself, tell your IT team: a program on this computer took the port the model server uses.`;
    const stop = async (text) => {
      globalThis.__invoke = async (cmd) => { if (cmd === 'strip_proxy') throw { message: words, incident: why }; throw new Error(`unexpected ${cmd}`); };
      try { await app.stripLegalService(text, () => {}); return null; } catch (e) { return e; } finally { delete globalThis.__invoke; }
    };
    const clean = async (text) => {
      globalThis.__invoke = async (cmd, args) => {
        if (cmd !== 'strip_proxy') throw new Error(`unexpected ${cmd}`);
        args.onEvent.onmessage({ done: true, genre: 'courts', engine: 'v1-legal-frozen', final: 'x', alignOk: true, rows: [] });
        return { service: 'app', model: 'app' };
      };
      try { return await app.stripLegalService(text, () => {}); } finally { delete globalThis.__invoke; }
    };
    const DOC_A = 'Memo re Jane Roe v. Acme: the settlement figure is confidential.';
    const DOC_B = 'Letter to John Doe of 4 Oak Lane about the lease renewal.';
    app.noteEngineTrust({ model: 'app' });
    err = await stop(DOC_A);
    check(err instanceof Error && err.message === words && app.engineTrust().incident === words, 'an incident rejection is an Error with the words, and stays on the record for the screen', { err: String(err?.message), t: app.engineTrust().incident });
    const c = app.engineCopy('ready', true);
    check(c.tone === 'red' && c.rail === 'Run stopped · model port changed' && c.drop.includes(words) && c.settings.includes(words) && c.retry === true,
      'the screen says it in red in the ready state the in-app core then works in, and renders the Retry its "until Retry" promises (measured before: no Retry in the ready phase)', c);
    check(!/this document/.test(words) && !/this document/.test(c.drop),
      'the screen words, which stay up while other documents run, say "a document", not "this document" (measured before: a later clean document sat under "this document")', c.drop);

    // per document: the in-app core's result for DOC_A is stamped, and only DOC_A's
    const stampA = app.inAppCoreStamp(DOC_A);
    const idA = app.engineIdentity({ engine: stampA.engine });
    check(stampA.engine === `in-app-core${app.RUN_STOPPED}` && idA.inAppCore && idA.runStopped && /stopped partway through this document/.test(idA.detail) && /frozen pipeline stopped partway/.test(idA.short),
      "the stopped document's own receipt and row say its frozen run was stopped partway and the in-app core read it (measured before: 'not reachable for this document')", idA);
    check(![idA.label, idA.short, idA.detail].some((x) => /pid|squat|\\|process 7|49400/.test(x)),
      'and the receipt carries fixed words, never the incident text with its process ids and path', idA);
    const stampB = app.inAppCoreStamp(DOC_B);
    const idB = app.engineIdentity({ engine: stampB.engine });
    check(stampB.engine === 'in-app-core' && !idB.runStopped && /not reachable for this document/.test(idB.detail),
      'CONTROL: another document read by the in-app core while the incident is on screen is not marked stopped', idB);
    check(app.inAppCoreStamp(DOC_A).engine === 'in-app-core', 'the note is spent by the stamp: a later in-app-core run of the same text is not marked');
    const WIDE = 'Ｊａｎｅ Ｒｏｅ, ACCOUNT ７７１２';
    await stop(WIDE);
    check(app.inAppCoreStamp('Jane Roe, ACCOUNT 7712').engine === `in-app-core${app.RUN_STOPPED}`, 'a document sent with full-width characters is matched by its folded text, which is what the in-app core returns');
    await stop(DOC_A);
    await clean(DOC_A);
    check(app.inAppCoreStamp(DOC_A).engine === 'in-app-core', 'CONTROL: a document stopped once and then run clean by the frozen pipeline is not marked on a later fallback');
    // the in-app core's calls for the stopped document, as engine.rs complete_local answers them
    const coreCalls = async (n, run, answer) => {
      globalThis.__invoke = async (cmd) => { if (cmd !== 'complete_local') throw new Error(`unexpected ${cmd}`); if (typeof answer === 'string') throw answer; return answer; };
      try { for (let k = 0; k < n; k++) { try { await app.completeLocal('s', 'u', {}, run); } catch { /* counted on the record */ } } } finally { delete globalThis.__invoke; }
    };
    await stop(DOC_B);
    const runB = app.coreRun();
    await coreCalls(3, runB, { text: 'ok', error: null, model: 'hand', pid: 7, created: '134031000000000001' });
    const both = app.engineIdentity(app.inAppCoreStamp(DOC_B, { complete: true, run: runB }));
    check(both.runStopped && both.handModel && /stopped partway/.test(both.short) && /model server started outside this app/.test(both.short) && /then read the whole document/.test(both.detail),
      'the in-app core on an outside model server carries both marks (measured before: its receipt said nothing of the outside model server)', both);
    // S-local-3: every one of the core's calls was refused, and the core said it did not finish
    await stop(DOC_A);
    const runA = app.coreRun();
    await coreCalls(3, runA, 'local model: port 49400 is answered by process 7, not by the model server that was checked');
    const cut = app.engineIdentity(app.inAppCoreStamp(DOC_A, { complete: false, run: runA }));
    check(cut.runStopped && !cut.handModel && /did not finish it/.test(cut.detail) && !/whole document/.test(cut.detail) && runA.failed === 3,
      'a stopped document whose in-app core did not finish says so, and names no model server, since none answered (measured before: "the in-app core then read the whole document")', cut);

    // wf5 S5L-1: a frozen run that was SENT the document and then failed. strip_proxy resolves
    // with who started the service and its model only after the stream it read has ended, so
    // an {error} line means that service read the whole document. Measured before: the error
    // line threw and dropped that record, and the receipt said "the frozen legal pipeline was
    // not reachable for this document" of a run on a hand-started service that had read it.
    const ends = async (text, lines, meta) => {
      globalThis.__invoke = async (cmd, args) => {
        if (cmd !== 'strip_proxy') throw new Error(`unexpected ${cmd}`);
        args.onEvent.onmessage({ stage: 'substrate' });
        for (const l of lines) args.onEvent.onmessage(l);
        return meta;
      };
      try { await app.stripLegalService(text, () => {}); return null; } catch (e) { return e; } finally { delete globalThis.__invoke; }
    };
    const rejects = async (text, why) => {
      globalThis.__invoke = async (cmd) => { if (cmd === 'strip_proxy') throw why; throw new Error(`unexpected ${cmd}`); };
      try { await app.stripLegalService(text, () => {}); return null; } catch (e) { return e; } finally { delete globalThis.__invoke; }
    };
    const said = (text) => { const s = app.inAppCoreStamp(text).engine; return { s, id: app.engineIdentity({ engine: s }) }; };
    const NOT_REACHED = /not reachable for this document/;
    err = await ends(DOC_A, [{ error: 'lq stage exited 1' }], { service: 'hand', model: 'app' });
    const f1 = said(DOC_A);
    check(err instanceof Error && err.message === 'lq stage exited 1' && f1.s === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}` && f1.id.runFailed && f1.id.runHandService && !f1.id.runStopped
      && /this document was sent to the frozen legal pipeline \(its engine service was started by hand, outside this app\), which returned no result the app could use/.test(f1.id.detail)
      && !NOT_REACHED.test(f1.id.detail) && /frozen pipeline failed on it/.test(f1.id.short) && /engine service started by hand/.test(f1.id.short),
      'S5L-1: an error line from a service started by hand, after it was sent the document, is on the receipt as sent-and-failed and names who started it (measured before: "not reachable for this document")', { err: String(err?.message), f1 });
    // serve-legal.mjs's own words when its working copy could not be deleted; the folder they
    // name sits under the user's profile, and a receipt that travels with the copy must not
    // carry it
    const DISK = 'working files were left on disk (named in the engine service\'s output: legal-serve.log when the app started it, else the window it runs in) — C:\\Users\\someone\\simpler-legal\\raw\\stripped\\_serve\\p1436-17-3 holds the unredacted document and the span-to-tag key';
    err = await ends(DOC_B, [{ error: DISK }], { service: 'app', model: 'hand' });
    const f2 = said(DOC_B);
    check(f2.s === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_MODEL}${app.LEFT_ON_DISK}` && f2.id.leftOnDisk && /left on this computer’s disk/.test(f2.id.detail) && /working copy left on disk/.test(f2.id.short)
      && /model server it ran against was started outside this app/.test(f2.id.detail) && /model server started outside this app/.test(f2.id.short) && !f2.id.runHandService,
      "S5L-1: a run whose service reported its working copy left on disk says so on that document's receipt, and names the outside model server it ran on", f2);
    check(![f2.id.label, f2.id.short, f2.id.detail].some((x) => /someone|_serve|p1436|\\/.test(x)), 'and says it in fixed words, never the folder the service named', f2.id);
    err = await ends(DOC_A, [], { service: 'hand', model: 'hand' });
    const f3 = said(DOC_A);
    check(err instanceof Error && /ended without a result/.test(err.message) && f3.s === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}${app.RUN_HAND_MODEL}` && !f3.id.leftOnDisk && !/disk/.test(f3.id.detail),
      'a stream that ended with no result line is sent-and-failed too, and a failure with no disk words claims nothing about the disk (CONTROL for the disk mark)', { err: String(err?.message), f3 });
    err = await rejects(DOC_B, { message: 'legal service: the stream broke: connection reset', reached: true, service: 'hand', model: 'app' });
    const f4 = said(DOC_B);
    check(err instanceof Error && err.message === 'legal service: the stream broke: connection reset' && f4.s === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}` && !NOT_REACHED.test(f4.id.detail) && app.engineTrust().incident === words,
      "S5L-1: a rejection engine.rs marks reached (the document had been written to the service) is sent-and-failed, and is not an incident", { err: String(err?.message), f4 });
    await rejects(DOC_A, { message: 'legal service: the service on port 1436 did not prove it holds the token', reached: false, service: null, model: null });
    const f5 = said(DOC_A);
    await rejects(DOC_B, 'legal service: nothing is listening on 127.0.0.1:1436');
    const f6 = said(DOC_B);
    check(f5.s === 'in-app-core' && NOT_REACHED.test(f5.id.detail) && !f5.id.runFailed && f6.s === 'in-app-core' && NOT_REACHED.test(f6.id.detail),
      'CONTROL: a rejection before the document went out (reached false, or a bare string) still reads "not reachable", which is then true', { f5, f6 });
    await ends(DOC_A, [{ error: 'lq stage exited 1' }], { service: 'hand', model: 'app' });
    await clean(DOC_A);
    check(said(DOC_A).s === 'in-app-core', 'CONTROL: a failed run followed by a clean one leaves no mark on a later fallback');
    await rejects(DOC_B, { message: words, incident: why, reached: true, service: 'hand', model: 'app' });
    const f7 = said(DOC_B);
    check(f7.s === `in-app-core${app.RUN_STOPPED}${app.RUN_HAND_SERVICE}` && f7.id.runStopped && !f7.id.runFailed && /the frozen legal pipeline \(its engine service was started by hand, outside this app\) was stopped partway/.test(f7.id.detail),
      'a stopped run names who started the service it went to; stopped is not also counted as failed', f7);

    // wf5 S3R-2: a stage that threw and then could not clean up. serve-legal.mjs's finally sends
    // the disk line, then the handler's catch sends the stage's own; the last line overwrote the
    // first, and the receipt said only that the pipeline failed.
    err = await ends(DOC_A, [{ error: DISK }, { error: 'lq stage exited 1' }], { service: 'app', model: 'app' });
    const g1 = said(DOC_A);
    await ends(DOC_B, [{ error: 'lq stage exited 1' }, { error: DISK }], { service: 'app', model: 'app' });
    const g1r = said(DOC_B);
    check(err instanceof Error && app.LEFT_ON_DISK_SAID.test(err.message) && g1.s === `in-app-core${app.RUN_FAILED}${app.LEFT_ON_DISK}` && g1.id.leftOnDisk && g1r.s === g1.s,
      'S3R-2: a stage failure and a cleanup failure on one run keep the disk mark, in either order, and the first line is the one shown (measured before: "in-app-core@run-failed", no disk words)', { err: String(err?.message), g1: g1.s, g1r: g1r.s });
    await ends(DOC_A, [{ error: 'lq stage exited 1' }, { error: 'lq stage exited 2' }], { service: 'app', model: 'app' });
    const g1c = said(DOC_A);
    check(g1c.s === `in-app-core${app.RUN_FAILED}` && !g1c.id.leftOnDisk, 'CONTROL: two failures neither of which is the disk line claim nothing about the disk', g1c.s);

    // wf6 SL-1 / SL-4: the disk mark when strip_proxy REJECTS after the disk line (a stream cut
    // after it, a line serde_json refused, a stop), in flight or already landed, and engine.rs's
    // own leftOnDisk after it stopped the service it started. Each was receipted without it.
    const rejectsAfter = async (text, lines, why, lateMs = null) => {
      globalThis.__invoke = async (cmd, args) => {
        if (cmd !== 'strip_proxy') throw new Error(`unexpected ${cmd}`);
        args.onEvent.onmessage({ stage: 'substrate' });
        for (const l of lines) { if (lateMs === null) args.onEvent.onmessage(l); else setTimeout(() => args.onEvent.onmessage(l), lateMs); }
        throw why;
      };
      try { await app.stripLegalService(text, () => {}); return null; } catch (e) { return e; } finally { delete globalThis.__invoke; }
    };
    const BROKE = { message: 'legal service sent a non-JSON line: unexpected end of hex escape at line 1 column 830', reached: true, service: 'hand', model: 'app' };
    const STOP = { message: words, incident: why, reached: true, service: 'hand', model: 'app' };
    const h = {};
    await rejectsAfter(DOC_A, [{ error: DISK }], BROKE); h.failed = said(DOC_A);
    await rejectsAfter(DOC_B, [{ error: DISK }], STOP); h.stopped = said(DOC_B);
    await rejectsAfter(DOC_A, [{ error: DISK }], BROKE, 20); h.failedLate = said(DOC_A);
    await rejectsAfter(DOC_B, [], { ...STOP, service: 'app', leftOnDisk: true }); h.swept = said(DOC_B);
    check(h.failed.s === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}${app.LEFT_ON_DISK}` && h.failedLate.s === h.failed.s && /left on this computer’s disk/.test(h.failed.id.detail),
      'SL-1: a disk line followed by a rejection that marks the run reached keeps the disk mark, landed or still in flight (measured before: "in-app-core@run-failed@run-hand-service")', { failed: h.failed.s, late: h.failedLate.s });
    check(h.stopped.s === `in-app-core${app.RUN_STOPPED}${app.RUN_HAND_SERVICE}${app.LEFT_ON_DISK}` && h.stopped.id.runStopped && h.stopped.id.leftOnDisk
      && /left on this computer’s disk when the run was stopped/.test(h.stopped.id.detail) && /working copy left on disk/.test(h.stopped.id.short),
      'SL-1: a disk line followed by a stop keeps the mark, and the stopped receipt says it (measured before: "in-app-core@run-stopped@run-hand-service", no disk words)', h.stopped);
    check(h.swept.s === `in-app-core${app.RUN_STOPPED}${app.LEFT_ON_DISK}` && /when the run was stopped/.test(h.swept.id.detail)
      && ![h.swept.id.label, h.swept.id.short, h.swept.id.detail].some((x) => /someone|_serve|p1436|\\|console names/.test(x)),
      "SL-4: engine.rs's leftOnDisk on a stop (its sweep of the service it started left the tree) is on the receipt, in fixed words that name no folder and no console", h.swept);
    await rejectsAfter(DOC_A, [], { ...STOP, leftOnDisk: false }); h.stopClean = said(DOC_A);
    await rejectsAfter(DOC_B, [{ error: 'lq stage exited 1' }], BROKE); h.brokeClean = said(DOC_B);
    check(h.stopClean.s === `in-app-core${app.RUN_STOPPED}${app.RUN_HAND_SERVICE}` && !/disk/.test(h.stopClean.id.detail) && h.brokeClean.s === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}`,
      'CONTROL: a stop with leftOnDisk false, and a rejection after a stage line that is not the disk line, claim nothing about the disk', { stop: h.stopClean.s, broke: h.brokeClean.s });

    // wf6 S3-2: a result line with scratchRemoved:false, then a rejection (a stream that broke
    // after it, or a stop). The service's word on its result line was read only when the invoke
    // resolved, so the rejection dropped it and the receipt said nothing of the disk.
    const DONE_LEFT = { done: true, genre: 'courts', engine: 'v1-legal-frozen', final: 'x', alignOk: true, rows: [], scratchRemoved: false };
    const s32 = {};
    await rejectsAfter(DOC_A, [DONE_LEFT], BROKE); s32.broke = said(DOC_A).s;
    await rejectsAfter(DOC_B, [DONE_LEFT], STOP); s32.stop = said(DOC_B).s;
    await rejectsAfter(DOC_A, [DONE_LEFT], BROKE, 20); s32.brokeLate = said(DOC_A).s;
    await rejectsAfter(DOC_B, [{ ...DONE_LEFT, scratchRemoved: true }], BROKE); s32.kept = said(DOC_B).s;
    check(s32.broke === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}${app.LEFT_ON_DISK}` && s32.brokeLate === s32.broke && s32.stop === `in-app-core${app.RUN_STOPPED}${app.RUN_HAND_SERVICE}${app.LEFT_ON_DISK}`,
      'S3-2: a result line saying scratchRemoved:false keeps the disk mark when strip_proxy then rejects, broken or stopped, landed or in flight (measured before: "in-app-core@run-failed@run-hand-service")', s32);
    check(s32.kept === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}`, 'CONTROL: scratchRemoved:true before the same rejection claims nothing about the disk', s32.kept);

    // wf6 S3-4: how long a rejection waits for a disk line still in flight. Both ends are held:
    // a line 150 ms behind the rejection keeps its mark, and a failure with no line is not held
    // for a second. CONTROL: a line 600 ms behind is past the wait, so the first check is about
    // the wait's length and not a line that always lands in time.
    const t0 = Date.now();
    await rejectsAfter(DOC_A, [{ error: DISK }], BROKE, 150); const at150 = said(DOC_A).s;
    await rejectsAfter(DOC_B, [], BROKE); const noLine = Date.now() - t0;
    said(DOC_B);
    await rejectsAfter(DOC_A, [{ error: DISK }], BROKE, 600); const at600 = said(DOC_A).s;
    await sleep(700);
    check(at150 === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}${app.LEFT_ON_DISK}` && noLine < 1000,
      'S3-4: a disk line landing 150 ms after the rejection keeps its mark, and the wait for one costs a failed run under a second', { at150, ms: noLine });
    check(at600 === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}`, 'CONTROL: a line 600 ms behind is past the wait', at600);

    // wf7 S-teeth-7-5: the bound itself. The 150 ms line above also lands inside a wait of three
    // sleeps, so a wait cut to 150 ms passed, and real timers on Windows' clock cannot tell a
    // line at 185 ms from one at 200. On a virtual clock (every setTimeout run in the order it
    // falls due, none waited out) the answer is exact: a line due 195 ms after the rejection is
    // kept and one due at 205 ms is not, so the wait is 200 ms to within one 50 ms step either way.
    const onVirtualClock = async (run) => {
      const real = globalThis.setTimeout;
      const q = []; let now = 0, seq = 0, finished = false, out, err;
      globalThis.setTimeout = (fn, ms = 0, ...a) => {
        q.push({ at: now + Math.max(0, Number(ms) || 0), seq: seq++, fn: () => fn(...a) });
        return { ref() { return this; }, unref() { return this; }, hasRef() { return false; } };
      };
      const turn = () => new Promise((r) => setImmediate(r));
      try {
        run().then((v) => { out = v; finished = true; }, (e) => { err = e; finished = true; });
        for (let i = 0; i < 10000 && !finished; i++) {
          await turn(); await turn();
          if (finished || !q.length) continue;
          q.sort((x, y) => x.at - y.at || x.seq - y.seq);
          const t = q.shift(); now = t.at; t.fn();
        }
      } finally { globalThis.setTimeout = real; }
      if (!finished) throw new Error('virtual clock: the run did not finish');
      if (err) throw err;
      return out;
    };
    const lateBy = (ms) => onVirtualClock(async () => { await rejectsAfter(DOC_A, [{ error: DISK }], BROKE, ms); return said(DOC_A).s; });
    const v = { 195: await lateBy(195), 205: await lateBy(205), 0: await lateBy(0) };
    check(v[195] === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}${app.LEFT_ON_DISK}` && v[0] === v[195],
      'S3-4 (wf7 S-teeth-7-5): on a virtual clock a disk line due 195 ms after the rejection keeps its mark (a 150 ms wait, which passed the real-time check, loses it)', v);
    check(v[205] === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}`, 'CONTROL: one due at 205 ms is past the wait, so the check above is about its length', v[205]);

    // ruling 15: a stop because an answer was not whole is named as that, on the rail and on the
    // stopped document's receipt, and not as a change of model server (relay.rs CUT_OFF,
    // engine.rs StripError.cutOff)
    const CUT_WHY = "the model's answer to one of the frozen pipeline's calls was not a whole one — it was cut off at the model's token limit (finish_reason \"length\") on a call allowed 400 tokens";
    const CUT = { message: `The frozen pipeline's result for a document was not used: ${CUT_WHY}.`, incident: CUT_WHY, reached: true, service: 'app', model: 'app', leftOnDisk: false, cutOff: true };
    await rejectsAfter(DOC_A, [], CUT);
    const cutId = said(DOC_A);
    const cutRail = app.engineCopy('ready', true);
    check(cutId.s === `in-app-core${app.RUN_STOPPED}${app.RUN_CUT}` && cutId.id.runStopped && cutId.id.runCut
      && /one of the model’s answers to it was missing, cut off, or did not say it had finished/.test(cutId.id.detail) && /left untagged what that call was there to find/.test(cutId.id.detail)
      && !/exited or stopped being the one answering/.test(cutId.id.detail) && /a model answer was missing or cut off/.test(cutId.id.short) && cutRail.rail === 'Result not used · answer incomplete' && cutRail.tone === 'red',
      'ruling 15: a run stopped for a cut answer says so on its row, its receipt and the rail (measured before: "the model server … exited or stopped being the one answering on its port")', { s: cutId.s, id: cutId.id, rail: cutRail.rail });
    check(![cutId.id.label, cutId.id.short, cutId.id.detail].some((x) => /400 tokens|finish_reason/.test(x)), 'and the receipt says it in fixed words, not the relay\'s', cutId.id.detail);
    // wf8 S7A-1: the relay can refuse a run at its end, after the pipeline read the whole document
    // (ruling 20: a call still open when the result arrived), so the cut words say the result was
    // not used and never that the run stopped partway, which legal-serve.log contradicts
    check(cutId.id.detail.startsWith('the app did not use the result of the frozen legal pipeline for this document, because one of the model’s answers')
      && /^the in-app core \(frozen pipeline result not used: a model answer was missing or cut off\)$/.test(cutId.id.short)
      && ![cutId.id.detail, cutId.id.short, cutRail.rail].some((x) => /stopped partway|Run stopped/.test(x)),
      'wf8 S7A-1: a cut says the frozen result was not used, on the receipt, the row and the rail (measured before: "was stopped partway through this document" of a run legal-serve.log records as completed)', { detail: cutId.id.detail, short: cutId.id.short, rail: cutRail.rail });
    // wf7 S6-F1 / S6-F2: the relay also stops a run for a call that got no answer (an HTTP error,
    // an answer that broke off, a call the chain gave up on). The receipt said "cut off at its
    // token limit" of every cut stop, which is false of those; it names the class now.
    const LOST_WHY = "the model's answer to one of the frozen pipeline's calls was not a whole one — the model server answered HTTP 500, so the stage had no answer to read, on a call allowed 4 tokens";
    await rejectsAfter(DOC_B, [], { ...CUT, message: `The frozen pipeline's result for a document was not used: ${LOST_WHY}.`, incident: LOST_WHY });
    const lostId = said(DOC_B);
    check(lostId.s === cutId.s && lostId.id.detail === cutId.id.detail && !/token limit/.test(lostId.id.detail) && /missing/.test(lostId.id.detail) && app.engineCopy('ready', true).rail === 'Result not used · answer incomplete',
      'wf7 S6-F1: a stop for a call that got no answer has the same fixed words, and they do not say "token limit" (measured before: "was cut off at its token limit or did not say it had finished")', lostId.id.detail);
    await rejectsAfter(DOC_B, [], STOP);
    const portId = said(DOC_B);
    check(portId.s === `in-app-core${app.RUN_STOPPED}${app.RUN_HAND_SERVICE}` && !portId.id.runCut && /exited or stopped being the one answering/.test(portId.id.detail) && /stopped partway through this document/.test(portId.id.detail) && app.engineCopy('ready', true).rail === 'Run stopped · model port changed',
      'CONTROL: a stop for a change of model server keeps its own words and rail, and clears the cut from the rail', { s: portId.s, rail: app.engineCopy('ready', true).rail });

    // ruling 16 (SEAM-ENGINE-CONSOLE): the disk words say where the folder is named, true for
    // each origin. They said "the engine console names the folder" of every run, and the app
    // starts its service with no window.
    const WINDOW = /the engine service printed the folder in the window it was started from/;
    const LOG = /the engine’s log names the folder: legal-serve\.log, in the logs folder the History screen gives, which is rewritten each time the app starts the service; that start removes the folder or names it there again/;
    const disks = { failedApp: f2.id.detail, failedHand: h.failed.id.detail, stoppedHand: h.stopped.id.detail, stoppedApp: h.swept.id.detail };
    check(LOG.test(disks.failedApp) && LOG.test(disks.stoppedApp) && !WINDOW.test(disks.failedApp) && !WINDOW.test(disks.stoppedApp),
      "ruling 16: a service this app started is sent to legal-serve.log, which is where its lines go", { failedApp: disks.failedApp, stoppedApp: disks.stoppedApp });
    check(WINDOW.test(disks.failedHand) && WINDOW.test(disks.stoppedHand) && !LOG.test(disks.failedHand) && !LOG.test(disks.stoppedHand),
      'ruling 16: a service started by hand is sent to the window it runs in, which is where its lines go', { failedHand: disks.failedHand, stoppedHand: disks.stoppedHand });
    check(Object.values(disks).every((d) => !/console/.test(d) && !/[A-Z]:\\|%[A-Z]+%|_serve|p1436/.test(d)),
      'and no disk words name a console, or any path (ruling 6)', disks);

    // wf5 S3R-3: the service's own word on its result line. The drain stops at the done line, so
    // a disk line that lands after the invoke resolves was dropped and the frozen result used.
    const DONE = { done: true, genre: 'courts', engine: 'v1-legal-frozen', final: 'x', alignOk: true, rows: [] };
    err = await ends(DOC_B, [{ ...DONE, scratchRemoved: false }], { service: 'app', model: 'app' });
    const g2 = said(DOC_B);
    globalThis.__invoke = async (cmd, args) => {
      if (cmd !== 'strip_proxy') throw new Error(`unexpected ${cmd}`);
      args.onEvent.onmessage({ ...DONE, scratchRemoved: false });
      setTimeout(() => args.onEvent.onmessage({ error: DISK }), 20);
      return { service: 'hand', model: 'app' };
    };
    let late = null;
    try { await app.stripLegalService(DOC_A, () => {}); } catch (e) { late = e; } finally { delete globalThis.__invoke; }
    const g2r = said(DOC_A);
    check(err instanceof Error && app.LEFT_ON_DISK_SAID.test(err.message) && g2.s === `in-app-core${app.RUN_FAILED}${app.LEFT_ON_DISK}`
      && late instanceof Error && g2r.s === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}${app.LEFT_ON_DISK}`,
      'S3R-3: a result line with scratchRemoved:false fails the run with the disk mark, with no error line and with one that lands after the invoke resolved (measured before: the result used, "v1-legal-frozen")', { err: String(err?.message), g2: g2.s, late: String(late?.message), g2r: g2r.s });
    const kept = await ends(DOC_B, [{ ...DONE, scratchRemoved: true }], { service: 'app', model: 'app' });
    check(kept === null && said(DOC_B).s === 'in-app-core', 'CONTROL: scratchRemoved:true is the frozen result, with no mark left behind');

    // wf5 S3R-5: a result line the app cannot map threw in engine.ts, after this file had
    // returned, and the fallback said "not reachable" of a service that had read the document
    const shapes = {
      'no rows': { done: true, engine: 'v1-legal-frozen', final: 'x' }, 'rows not a list': { ...DONE, rows: 'none' }, 'a row without its span': { ...DONE, rows: [{ tag: '[P1]', cls: 'PERSON' }] }, 'no final text': { ...DONE, final: null },
      // wf6 S-teeth-4: a tag-less row put "undefined" where the name was in the sent document; a
      // null row threw before the run was marked
      'a row without its tag': { ...DONE, rows: [{ span: 'Jane Roe', cls: 'PERSON' }] }, 'a row without its class': { ...DONE, rows: [{ span: 'Jane Roe', tag: '[P1]' }] }, 'a null row': { ...DONE, rows: [null] },
      // wf6 SL-3: the engine's self-reported name went on the receipt unchecked
      'no engine name': { done: true, genre: 'courts', final: 'x', alignOk: true, rows: [] }, 'engine "in-app-core"': { ...DONE, engine: 'in-app-core' }, 'engine ""': { ...DONE, engine: '' },
      'engine "in-app-core@run-stopped"': { ...DONE, engine: 'in-app-core@run-stopped' }, 'engine "v1-legal-frozen@hand-service"': { ...DONE, engine: 'v1-legal-frozen@hand-service' },
    };
    const bad = {};
    for (const [k, line] of Object.entries(shapes)) {
      const e = await ends(DOC_A, [line], { service: 'hand', model: 'app' });
      const s = said(DOC_A);
      bad[k] = { e: String(e?.message), s: s.s, nr: NOT_REACHED.test(s.id.detail) };
    }
    check(Object.values(bad).every((b) => /not one this app can read/.test(b.e) && b.s === `in-app-core${app.RUN_FAILED}${app.RUN_HAND_SERVICE}` && !b.nr),
      'S3R-5: a result line without the fields the app maps is refused here and receipted sent-and-failed, naming the hand-started service (measured before: "not reachable for this document")', bad);
    const good = await clean(DOC_B);
    check(Array.isArray(good?.rows) && said(DOC_B).s === 'in-app-core', 'CONTROL: a well-formed result line is the result', good);
    globalThis.__invoke = async (cmd, args) => { args.onEvent.onmessage({ ...DONE, engine: 'v1-legal-frozen+firm', rows: [{ span: 'Jane Roe', tag: '[Person 1]', cls: 'PERSON', src: 'legal-pipeline' }] }); return { service: 'hand', model: 'app' }; };
    let firmRun = null;
    try { firmRun = await app.stripLegalService(DOC_B, () => {}); } catch (e) { firmRun = { engine: `THREW ${e.message}` }; } finally { delete globalThis.__invoke; }
    check(firmRun?.engine === `v1-legal-frozen+firm${app.HAND_SERVICE}` && app.engineIdentity({ engine: firmRun.engine }).frozen && said(DOC_B).s === 'in-app-core',
      'CONTROL: the firm doctrine\'s engine name, with a full row, is the result and is stated as the frozen pipeline on a hand-started service', firmRun?.engine);
    // the regex the disk mark hangs on must match the words serve-legal.mjs actually sends
    const serve = readFileSync(join(here, '..', '..', '..', 'serve-legal.mjs'), 'utf8');
    const diskLine = (serve.match(/send\(\{ error: `([^`]*left on disk[^`]*)`/) || [])[1] ?? '';
    check(diskLine && app.LEFT_ON_DISK_SAID.test(diskLine) && !app.LEFT_ON_DISK_SAID.test('legal service stream ended without a result') && !app.LEFT_ON_DISK_SAID.test('lq stage exited 1'),
      "LEFT_ON_DISK_SAID matches serve-legal.mjs's own error line, and no other failure (CONTROL)", diskLine || 'no such send() in serve-legal.mjs');
    // ruling 16: the service's own line says where its folder is named, true for either origin
    // (its discard() lines go to legal-serve.log when the app started it, to its window when a
    // person did), and never "the engine console", which the app-started service does not have
    check(/\(named in the engine service's output: legal-serve\.log when the app started it, else the window it runs in\) — \$\{dir\}/.test(diskLine) && !/console/.test(diskLine),
      "ruling 16: serve-legal.mjs's disk line names legal-serve.log and the window, not a console", diskLine);
    // wf6 S3-3: the Rust half of the stop's disk mark, by source (cargo test proves the behaviour:
    // a_stopped_run_keeps_the_sweeps_report_and_sweeps_only_what_the_app_started,
    // the_sweeps_look_where_the_service_writes, a_folder_the_sweep_cannot_list_counts_as_a_tree_left)
    const rsSrc = readFileSync(join(repo, 'app', 'src-tauri', 'src', 'engine.rs'), 'utf8');
    const rsFn = (name) => { const i = rsSrc.indexOf(`fn ${name}(`); return i < 0 ? '' : rsSrc.slice(i, rsSrc.indexOf('\n}\n', i)); };
    // 2026-09-25: a run whose stream the app never read ends with guard.finish_unread() (relay.rs),
    // a read one with guard.finish(); both results go through the one stopped_run with the sweep
    const stripSrc = rsFn('strip_proxy');
    check(/let finished = if ran\.is_ok\(\) \{ guard\.finish\(\) \} else \{ guard\.finish_unread\(\) \};/.test(stripSrc)
      && /finished\.map\(\|why\| stopped_run\(why, service, sweep_adapter_trees\)\)/.test(stripSrc) && /serve_dir\(&root\)/.test(rsFn('sweep_adapter_trees')) && /serve_dir\(root\)/.test(rsFn('sweep_stale_once'))
      && /legal-serve\.log/.test(rsFn('sweep_adapter_trees')),
      'S3-3: strip_proxy records its stop through stopped_run with the sweep, and both sweeps look in serve_dir and log to legal-serve.log', { strip: rsFn('strip_proxy').length, sweep: rsFn('sweep_adapter_trees') });

    // F3-R3: Export's pass line, evaluated from its own source, on every in-app-core id
    const ex = readFileSync(join(here, '..', 'src', 'screens', 'Export.tsx'), 'utf8');
    const at = ex.indexOf('const passesLine = ');
    const expr = at < 0 ? '' : ex.slice(at + 'const passesLine = '.length, ex.indexOf(";\n", at));
    const passes = (id) => {
      const eng = app.engineIdentity({ engine: id });
      return new Function('file', 'eng', 'coreLayers', 'failedLayers', `return (${expr});`)({ sample: false, engineComplete: true }, eng, ['wide sweep', 'name rails'], []);
    };
    const lines = Object.fromEntries(['in-app-core', `in-app-core${app.HAND_MODEL}`, `in-app-core${app.RUN_STOPPED}`, `in-app-core${app.HAND_MODEL}${app.RUN_STOPPED}`, `in-app-core${app.MODEL_CHANGED}`, `in-app-core${app.HAND_MODEL}${app.MODEL_CHANGED}${app.RUN_STOPPED}`].map((id) => [id, expr ? passes(id) : 'NO EXPR']));
    check(Object.values(lines).every((l) => l === 'passes: wide sweep + name rails — all complete'),
      "Export's pass line reads every in-app-core id as the in-app core's passes (measured before: 'passes: none — no engine run is recorded' for in-app-core@hand-model)", lines);
    check(expr && /^passes: none — no engine run/.test(passes('some-other-engine')), 'CONTROL: an engine the app does not know still gets the no-engine pass line', expr ? passes('some-other-engine') : 'no passesLine found in Export.tsx');

    const base = { service: 'app', serviceRefused: null, model: 'app', modelRefused: null, failed: null, notes: [], incident: null };
    const go = app.engineCopy('ready', true, base);
    check(go.tone === 'go' && go.drop === null && go.retry === false, 'CONTROL: with no incident the steady state is unchanged, and renders no Retry', go);
    check(app.engineCopy('offline', true, base).retry && app.engineCopy('nomodel', true, base).retry && !app.engineCopy('starting', true, base).retry && !app.engineCopy('ready', false, { ...base, incident: words }).retry,
      'Retry renders for offline and nomodel as before, and not while starting (nor in the developer preview, which records no incidents)');
    const refusal = 'Port 1436, where the frozen legal pipeline runs, is held by y.exe.';
    const rh = app.engineCopy('ready', true, { ...base, service: null, serviceRefused: refusal, model: 'hand' });
    check(rh.rail === 'Engine ready · in-app core only' && rh.drop.startsWith(refusal) && /model server started outside this app/.test(rh.drop) && /model server started outside this app/.test(rh.settings),
      'a refused service no longer hides that the in-app core uses a model server started outside the app', rh);
    const ra = app.engineCopy('ready', true, { ...base, service: null, serviceRefused: refusal });
    check(ra.drop === refusal, 'CONTROL: with the app\'s own model server the refusal stands alone', ra);
    const mh = app.engineCopy('ready', true, { ...base, model: 'hand' });
    check(/model file it says it serves matched the pin/.test(mh.settings) && /frozen context size and slot count/.test(mh.settings) && /were not checked/.test(mh.settings) && !/the model file it serves matched/.test(mh.settings) && mh.rail === 'Engine ready · outside model server',
      'an outside model server is described by what was checked, and what was not', mh);
    const mr = app.engineCopy('ready', true, { ...base, modelRefused: 'Port 49400 … is held by z.exe.' });
    check(mr.tone === 'red' && mr.rail === 'Model server refused', 'a model server refused while the phase is ready is said in red', mr);
  }

  // ── wf5 S5L-1 / S5L-2, browser path (fetch stubbed; nothing listens) ────────────────────
  {
    const page = await import(url(await bundle('page-fetch', {})));
    const real = globalThis.fetch;
    const answer = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const tryCore = async (f) => { globalThis.fetch = f; try { return await page.completeLocal('s', 'u'); } catch (e) { return e; } finally { globalThis.fetch = real; } };
    const noText = [
      ['content ""', { choices: [{ message: { content: '' }, finish_reason: 'length' }] }],
      ['content blank', { choices: [{ message: { content: '  \n' } }] }],
      ['content null', { choices: [{ message: { content: null } }] }],
      ['no message', { choices: [{}] }],
      ['no choices', {}],
    ];
    const got = {};
    for (const [k, body] of noText) { const r = await tryCore(answer(200, body)); got[k] = r instanceof Error ? r.message : `RETURNED ${JSON.stringify(r)}`; }
    check(Object.values(got).every((m) => /^local model: answered HTTP 200 with no answer text/.test(m)) && /finish_reason "length"/.test(got['content ""']),
      'S5L-2 browser: a 200 carrying no answer text is a failed call, never an empty answer the core reads as "nothing found" (measured before: every one returned "")', got);
    const nj = await tryCore(answer(200, 'not json'));
    check(nj instanceof Error && /not JSON/.test(nj.message), 'S5L-2 browser: a 200 whose body is not JSON is a failed call', String(nj?.message ?? nj));
    const ok = [await tryCore(answer(200, { choices: [{ message: { content: 'NONE' }, finish_reason: 'stop' }] })), await tryCore(answer(200, { choices: [{ message: { content: 'Jane Roe' }, finish_reason: 'stop' }] }))];
    check(ok[0] === 'NONE' && ok[1] === 'Jane Roe', 'CONTROL: "NONE", the prompts\' own word for nothing found, and a real answer are returned as they are', ok);
    // wf5 S3R-1: text that stops at the token limit. A model that wrote its reasoning into
    // content, and an entity list cut at max_tokens, were each read as the whole answer.
    const cut = {};
    for (const [k, content] of [['thinking in content', '<think>\nThe user wants me to extract identifying spans. First, there is'], ['list cut short', 'PERSON: Jane Roe\nPERSON: Tob']]) {
      const r = await tryCore(answer(200, { choices: [{ message: { content }, finish_reason: 'length' }] }));
      cut[k] = r instanceof Error ? r.message : `RETURNED ${JSON.stringify(r)}`;
    }
    check(Object.values(cut).every((m) => /^local model: the answer was cut off at its token limit \(finish_reason "length"\)/.test(m) && /127\.0\.0\.1:49400/.test(m)),
      'S3R-1 browser: non-blank text cut off at the token limit is a failed call that names where it was sent (measured before: returned as the answer)', cut);
    const stop = await tryCore(answer(200, { choices: [{ message: { content: 'NONE' }, finish_reason: 'stop' }] }));
    check(stop === 'NONE', 'CONTROL: "NONE" with finish_reason "stop" is the answer', stop instanceof Error ? stop.message : stop);
    // wf6 SL-2: any other early end, and none named, were read as the whole answer
    const early = {};
    for (const [k, why] of [['content_filter', 'content_filter'], ['tool_calls', 'tool_calls'], ['abort', 'abort'], ['"Length"', 'Length'], ['null', null], ['absent', undefined]]) {
      const choice = { message: { content: 'PERSON: Jane Roe\nPERSON: Tob' } };
      if (why !== undefined) choice.finish_reason = why;
      const r = await tryCore(answer(200, { choices: [choice] }));
      early[k] = r instanceof Error ? r.message : `RETURNED ${JSON.stringify(r)}`;
    }
    check(Object.entries(early).every(([k, m]) => /^local model: the answer did not say it was finished \(/.test(m) && /127\.0\.0\.1:49400/.test(m)
      && (k === 'null' || k === 'absent' ? /no finish_reason/.test(m) : m.includes(`finish_reason "${k.replace(/"/g, '')}"`))),
      'SL-2 browser: text under any finish_reason but "stop", or none, is a failed call that says which and names where it was sent (measured before: each returned as the answer)', early);

    const DOC = 'Brief for Richard Roe, 88 Birch Road, appellee.';
    const tryStrip = async (f) => { globalThis.fetch = f; try { await page.stripLegalService(DOC, () => {}); return null; } catch (e) { return e; } finally { globalThis.fetch = real; } };
    const lines = (...ls) => async () => new Response(ls.map((l) => JSON.stringify(l)).join('\n') + '\n', { status: 200 });
    const b1 = await tryStrip(lines({ stage: 'substrate' }, { error: 'lq stage exited 1' }));
    const s1 = page.inAppCoreStamp(DOC).engine;
    const b2 = await tryStrip(answer(500, 'boom'));
    const s2 = page.inAppCoreStamp(DOC).engine;
    const b3 = await tryStrip(lines({ stage: 'substrate' }));
    const s3 = page.inAppCoreStamp(DOC).engine;
    check(b1 instanceof Error && b2 instanceof Error && b3 instanceof Error && [s1, s2, s3].every((s) => s === `in-app-core${page.RUN_FAILED}`),
      'S5L-1 browser: an error line, an HTTP error and a stream with no result line all came back from a service that read the request, and each is marked sent-and-failed (no token, so no claim of who started it)', { s1, s2, s3 });
    // S3R-2 / S3R-3 / S3R-5 on this path: both disk words, the result line's own word, and a
    // result line the app cannot map
    const DISK_B = 'working files were left on disk (named in the engine service\'s output: legal-serve.log when the app started it, else the window it runs in) — C:\\Users\\someone\\simpler-legal\\raw\\stripped\\_serve\\p1436-17-3 holds the unredacted document and the span-to-tag key';
    const RES = { done: true, genre: 'courts', engine: 'v1-legal-frozen', final: 'x', alignOk: true, rows: [] };
    const b5 = await tryStrip(lines({ stage: 'substrate' }, { error: DISK_B }, { error: 'lq stage exited 1' }));
    const s5 = page.inAppCoreStamp(DOC).engine;
    const b6 = await tryStrip(lines({ stage: 'substrate' }, { ...RES, scratchRemoved: false }));
    const s6 = page.inAppCoreStamp(DOC).engine;
    const b7 = await tryStrip(lines({ stage: 'substrate' }, { done: true, engine: 'v1-legal-frozen', final: 'x' }));
    const s7 = page.inAppCoreStamp(DOC).engine;
    check(b5 instanceof Error && b6 instanceof Error && s5 === `in-app-core${page.RUN_FAILED}${page.LEFT_ON_DISK}` && s6 === s5,
      'S3R-2/S3R-3 browser: the disk line before a stage line, and a result line with scratchRemoved:false, each carry the disk mark', { s5, s6, b6: String(b6?.message) });
    check(b7 instanceof Error && /not one this app can read/.test(b7.message) && s7 === `in-app-core${page.RUN_FAILED}`,
      'S3R-5 browser: a result line without rows is refused here and receipted sent-and-failed (measured before: "not reachable")', { s7, b7: String(b7?.message) });
    const b8 = await tryStrip(lines({ stage: 'substrate' }, { ...RES, scratchRemoved: true }));
    check(b8 === null && page.inAppCoreStamp(DOC).engine === 'in-app-core', 'CONTROL: a well-formed result line with scratchRemoved:true is the result', String(b8?.message ?? b8));
    const b9 = await tryStrip(lines({ stage: 'substrate' }, { ...RES, engine: 'in-app-core' }));
    const s9 = page.inAppCoreStamp(DOC).engine;
    check(b9 instanceof Error && /not one this app can read/.test(b9.message) && s9 === `in-app-core${page.RUN_FAILED}`,
      'SL-3 browser: a result line naming an engine the app does not state is refused and receipted sent-and-failed', { s9, b9: String(b9?.message) });
    // wf6 S3-2, browser: a result line with scratchRemoved:false, then the stream breaks. The
    // break's own words were thrown, and the result line's disk word went with them.
    const breaksAfter = (line) => async () => {
      let n = 0;
      return new Response(new ReadableStream({
        pull(c) { if (n++ === 0) c.enqueue(new TextEncoder().encode(`${JSON.stringify({ stage: 'substrate' })}\n${JSON.stringify(line)}\n`)); else c.error(new TypeError('network error: connection reset')); },
      }), { status: 200 });
    };
    const b10 = await tryStrip(breaksAfter({ ...RES, scratchRemoved: false }));
    const s10 = page.inAppCoreStamp(DOC).engine;
    const b11 = await tryStrip(breaksAfter({ ...RES, scratchRemoved: true }));
    const s11 = page.inAppCoreStamp(DOC).engine;
    check(b10 instanceof Error && page.LEFT_ON_DISK_SAID.test(b10.message) && s10 === `in-app-core${page.RUN_FAILED}${page.LEFT_ON_DISK}`,
      'S3-2 browser: a result line with scratchRemoved:false and then a broken stream keeps the disk mark (measured before: "in-app-core@run-failed", the break\'s words only)', { s10, b10: String(b10?.message) });
    check(b11 instanceof Error && /connection reset/.test(b11.message) && s11 === `in-app-core${page.RUN_FAILED}`,
      'CONTROL: scratchRemoved:true and the same break is a failed run with the break\'s words, and nothing about the disk', { s11, b11: String(b11?.message) });
    const b4 = await tryStrip(async () => { throw new TypeError('fetch failed'); });
    const s4 = page.inAppCoreStamp(DOC).engine;
    check(b4 instanceof Error && s4 === 'in-app-core' && /not reachable/.test(page.engineIdentity({ engine: s4 }).detail),
      'CONTROL: a fetch that never connected leaves the document "not reachable", which is then true', { s4, e: String(b4?.message) });
  }

  // ── law 10: the in-app core's receipt names the processes that answered it ────────────────
  {
    const FT = '134031000000000001'; // a FILETIME is above 2^53: engine.rs sends it as a string
    const reply = (model, pid, created = FT, error = null) => ({ text: 'ok', error, model, pid, created });
    // complete_local answered per call from `plan`, by the call's `user` text: a CoreReply, or
    // a string engine.rs rejects with
    const serve = (plan) => { globalThis.__invoke = async (cmd, args) => { if (cmd !== 'complete_local') throw new Error(`unexpected ${cmd}`); const r = typeof plan === 'function' ? plan(args) : plan; if (typeof r === 'string') throw r; return r; }; };
    const calls = async (n, run, user = 'u') => { const out = []; for (let k = 0; k < n; k++) { try { out.push(await app.completeLocal('s', user, {}, run)); } catch (e) { out.push(e); } } return out; };
    const DOC = 'Note to file: Richard Roe called about the Acme escrow.';
    const seen = (r) => ({ answered: [...r.answered], failed: r.failed, pending: r.pending });

    // the status record says the app's own model; the core's calls were answered by another process
    app.noteEngineTrust({ model: 'app' });
    let run = app.coreRun();
    serve(reply('hand', 7));
    await calls(3, run);
    let st = app.inAppCoreStamp(DOC, { complete: true, run });
    let id = app.engineIdentity(st);
    check(st.engine === `in-app-core${app.HAND_MODEL}` && id.handModel && !id.modelChanged && /model server started outside this app/.test(id.label) && app.engineTrust().model === 'app',
      "the in-app core's receipt names the model server that answered its calls, not the one the status record last saw (measured before: in-app-core, the app's own, while every call went to an outside process)", { st, trust: app.engineTrust().model });
    app.noteEngineTrust({ model: 'hand' });
    run = app.coreRun();
    serve(reply('app', 5));
    await calls(2, run);
    st = app.inAppCoreStamp(DOC, { complete: true, run });
    check(st.engine === 'in-app-core', "CONTROL: answered by the app's own model server, the receipt says so whatever the status record says", st);
    app.noteEngineTrust({ model: 'app' });

    // more than one process answered: said on the receipt
    run = app.coreRun();
    serve(({ user }) => user === 'first' ? reply('app', 5) : reply('hand', 7));
    await calls(1, run, 'first');
    await calls(1, run, 'second');
    st = app.inAppCoreStamp(DOC, { complete: true, run });
    id = app.engineIdentity(st);
    check(st.engine === `in-app-core${app.HAND_MODEL}${app.MODEL_CHANGED}` && id.modelChanged && id.handModel && /model server changed partway/.test(id.short) && /more than one model server process answered/.test(id.detail) && /at least one of them was started outside this app/.test(id.detail) && /changed while it read this document/.test(id.label),
      'a document whose core calls were answered by two model server processes says so, and that one of them was started outside this app', id);
    run = app.coreRun();
    serve(({ user }) => user === 'first' ? reply('app', 5) : reply('app', 5, '134031000000000999'));
    await calls(1, run, 'first');
    await calls(1, run, 'second');
    st = app.inAppCoreStamp(DOC, { run });
    check(st.engine === `in-app-core${app.MODEL_CHANGED}` && !app.engineIdentity(st).handModel,
      'the same pid with another creation time is another process: the model server changed, though both were the app\'s', st);
    run = app.coreRun();
    serve(reply('app', 5));
    await calls(4, run);
    check(app.inAppCoreStamp(DOC, { run }).engine === 'in-app-core', 'CONTROL: four answers from one process are one model server');

    // nothing answered: nothing is claimed
    run = app.coreRun();
    serve('local model: port 49400 is answered by process 7, not by the model server that was checked');
    const errs = await calls(3, run);
    st = app.inAppCoreStamp(DOC, { complete: false, run });
    check(errs.every((e) => e instanceof Error) && st.engine === 'in-app-core' && st.coreComplete === false && run.failed === 3 && run.answered.size === 0 && run.pending === 0,
      'calls refused before any text was sent name no model server, and are counted as failed', { st, run: seen(run) });

    // an answer the core cannot use: the text still reached that process
    run = app.coreRun();
    serve(reply('hand', 9, FT, 'local model http 500: boom'));
    const [e500] = await calls(1, run);
    st = app.inAppCoreStamp(DOC, { run });
    check(e500 instanceof Error && e500.message === 'local model http 500: boom' && st.engine === `in-app-core${app.HAND_MODEL}` && run.failed === 1,
      "an unusable answer reaches the caller as an Error in engine.rs's words, and the process that received the text is still on the receipt", { e: String(e500?.message), st, run: seen(run) });
    // none at all once the request was on its way (a model server that crashed mid-request):
    // engine.rs now replies naming the process, where it rejected naming none (wf4 S3-3; the Rust
    // half is cargo test every_reply_after_the_request_went_out_names_the_process_that_received_it)
    run = app.coreRun();
    const LOST = 'local model: no HTTP response (HTTP line too long or connection closed), after the request had been sent to process 9';
    serve(reply('hand', 9, FT, LOST));
    const [eLost] = await calls(1, run);
    st = app.inAppCoreStamp(DOC, { complete: false, run });
    check(eLost instanceof Error && eLost.message === LOST && st.engine === `in-app-core${app.HAND_MODEL}` && run.failed === 1 && st.coreComplete === false,
      'a request the model server read and never answered keeps that process on the receipt, counted as failed (engine.rs used to reject here, and a rejection records no process)', { e: String(eLost?.message), st, run: seen(run) });

    // one record per document: two documents read at once do not share
    const runA = app.coreRun(), runB = app.coreRun();
    serve(({ user }) => user === 'A' ? reply('hand', 7) : reply('app', 5));
    await Promise.all([calls(2, runA, 'A'), calls(2, runB, 'B')]);
    const sA = app.inAppCoreStamp(DOC, { run: runA }).engine, sB = app.inAppCoreStamp(DOC, { run: runB }).engine, sShared = app.inAppCoreStamp(DOC).engine;
    check(sA === `in-app-core${app.HAND_MODEL}` && sB === 'in-app-core' && sShared === 'in-app-core',
      "two documents read at once each name only the model server that answered their own calls, and the shared record is left alone (CONTROL: document B's own model server)", { sA, sB, sShared });

    // a caller that keeps no record: the shared one, cleared only with no call in flight
    let release = null;
    serve(({ user }) => user === 'slow' ? new Promise((r) => { release = () => r(reply('app', 5)); }) : reply('hand', 7));
    await calls(1, undefined, 'fast');
    const slow = app.completeLocal('s', 'slow');
    const mid = app.inAppCoreStamp(DOC).engine;
    release();
    await slow;
    const after = app.inAppCoreStamp(DOC).engine;
    const next = app.inAppCoreStamp(DOC).engine;
    check(mid === `in-app-core${app.HAND_MODEL}` && after === `in-app-core${app.HAND_MODEL}${app.MODEL_CHANGED}` && next === 'in-app-core',
      'with no record passed, a stamp taken while a call is in flight keeps every answer for the next stamp, and one taken with none in flight starts clean (CONTROL: the stamp after)', { mid, after, next });
    delete globalThis.__invoke;

    // whether the core finished: the stamp carries its verdict, and the words follow it
    const detail = (v) => app.engineIdentity({ engine: `in-app-core${app.RUN_STOPPED}`, ...(v === undefined ? {} : { coreComplete: v }) }).detail;
    check(/then read the whole document/.test(detail(true)), 'a stopped document the in-app core finished says it read the whole document', detail(true));
    check(/did not finish it/.test(detail(false)) && /incomplete/.test(detail(false)) && !/whole document/.test(detail(false)),
      'one it did not finish says so, and never that it read the whole document (measured before: "then read the whole document" with every call refused)', detail(false));
    check(/took the document over/.test(detail(undefined)) && !/whole document|did not finish/.test(detail(undefined)),
      'CONTROL: a receipt stored before the verdict was kept claims neither', detail(undefined));
    const noVerdict = app.inAppCoreStamp(DOC);
    check(app.inAppCoreStamp(DOC, { complete: true }).coreComplete === true && app.inAppCoreStamp(DOC, { complete: false }).coreComplete === false && !('coreComplete' in noVerdict),
      'the stamp carries the verdict it is given, and adds no field when given none', noVerdict);
  }

  // ── law 6: the port comes free, and the app's own service is started again ────────────────
  {
    const heal = await tauriBundle('tauri-heal');
    const REF = 'Port 1436, where the frozen legal pipeline runs, is held by C:\\app\\simpler-legal.exe (pid 9, your own account, not started by this app), and it could not prove it holds this app\'s token.';
    const calls = [];
    let world = 'other-copy';
    const n = (c) => calls.filter((x) => x === c).length;
    const status = (over) => ({ running: true, healthy: true, port: 49400, origin: 'app', refused: null, notes: [], adapterSpawned: false, ...over });
    globalThis.__invoke = async (cmd) => {
      calls.push(cmd);
      if (cmd === 'legal_service_health') {
        if (world === 'other-copy') throw REF;
        if (world === 'loading') return null;
        return n('server_start') >= 3 ? { ok: true, llama: true, engine: 'v1-legal-frozen', port: 1436, service: 'app', model: 'app', notes: [] } : null;
      }
      if (cmd === 'server_start') return world === 'other-copy' ? status({ origin: 'hand' }) : world === 'loading' ? status({ healthy: false, origin: null }) : status({ adapterSpawned: true });
      if (cmd === 'server_status') return world === 'loading' ? status({ healthy: false, origin: null }) : status({ origin: world === 'other-copy' ? 'hand' : 'app' });
      throw new Error(`unexpected ${cmd}`);
    };
    const h0 = await heal.legalServiceHealth();
    check(h0 === null && n('server_start') === 0, 'CONTROL: before the boot has asked for the engine, a missing service is left to the boot', calls);
    // the model server here answers without a key: one started by hand. Another copy's answers
    // only with its key and is refused before this point (engine.rs verify_hand_model).
    check(await heal.ensureEngine() === true && heal.engineTrust().model === 'hand', 'boot: the model server was started outside this app, and is used as such', heal.engineTrust());
    const h1 = await heal.legalServiceHealth();
    const c1 = heal.engineCopy('ready', true);
    check(h1 === null && n('server_start') === 2 && heal.engineTrust().serviceRefused === REF && c1.drop.startsWith(REF) && /model server started outside this app/.test(c1.drop),
      'while the other copy holds the port, each document asks again, and the screen keeps both facts: the refusal, and whose model server the in-app core uses', { calls, drop: c1.drop });
    world = 'free';
    const h2 = await heal.legalServiceHealth();
    const t2 = heal.engineTrust();
    check(h2 && h2.service === 'app' && t2.model === 'app' && t2.serviceRefused === null && heal.engineCopy('ready', true).tone === 'go',
      "once the other copy has closed, the next document starts the app's own service and uses it, and the model server is no longer called outside (measured before: never started again, and 'hand' until restart)", { h2, t2, calls });
    const before = n('server_start');
    check(await heal.ensureEngine() === true && n('server_start') === before, 'CONTROL: a healthy engine is not restarted by ensureEngine');
    world = 'loading';
    await heal.legalServiceHealth();
    const mid = n('server_start');
    const ok = await heal.ensureEngine(500);
    check(ok === false && n('server_start') === mid + 1, 'a model server found not ready drops the cached boot, so the next ensureEngine waits for it instead of answering true', { ok, calls: calls.slice(-6) });
    let told = 0;
    const late = heal.ensureEngine(2000, () => told++);
    let joined = 0;
    await sleep(300);
    const again = heal.ensureEngine(2000, () => joined++);
    const [okLate, okAgain] = await Promise.all([late, again]);
    check(okLate === false && okAgain === false && told === 1 && joined === 1,
      "a per-document ensureEngine that has to wait for a loading model server says so, once per caller, including one that joins the wait (App's rail then shows starting; measured before: green through the reload)", { okLate, okAgain, told, joined });
    world = 'free';
    let quiet = 0;
    check(await heal.ensureEngine(2000, () => quiet++) === true && quiet === 0, 'CONTROL: a model server that answers at once is never reported as starting', { quiet });
    delete globalThis.__invoke;
  }

  // ── the words of record: a refusal shown where no Retry renders does not say "press Retry" ──
  {
    const rs = readFileSync(join(repo, 'app', 'src-tauri', 'src', 'engine.rs'), 'utf8');
    const fnBody = (name) => { const i = rs.indexOf(`fn ${name}(`); return i < 0 ? '' : rs.slice(i, rs.indexOf('\n}\n', i)); };
    const ar = fnBody('adapter_refusal'), am = fnBody('adapter_model');
    check(ar && am && !/press Retry/.test(ar) && /checks the port again each time you add a document/.test(ar) && /asks again each time you add one/.test(am),
      'engine.rs: the service refusals (shown in the ready state) name what happens instead of a Retry button', { ar: ar.slice(-400) });
    check(/press Retry/.test(fnBody('verify_hand_model')), 'CONTROL: a model refusal, shown in the offline state that renders Retry, still says it');
    const vh = fnBody('verify_hand_model');
    check(/401 \| 403 =>/.test(vh) && /another open copy of simpler\.legal/.test(vh) && /Close the other copy of simpler\.legal/.test(vh) && !/401[^\n]*=> return Ok\(None\)/.test(vh),
      "engine.rs: a model server that answers /props only with a key is refused in words that name the other copy and the way through, not waited on as loading (measured before: a second copy said 'starting' until its 90 s ran out; cargo test proves the behaviour)", vh.slice(0, 900));
    const es = readFileSync(join(lib, 'engine.ts'), 'utf8');
    check(/inAppCoreStamp\(doc, \{ complete: m\.complete(, run)? \}\)/.test(es),
      "engine.ts stamps the in-app core's own verdict on its result, which the receipt's words follow", (es.match(/inAppCoreStamp\([^)]*\)/g) || []).join(' | '));
    const iw = fnBody('incident_words');
    check(iw && /partway through a document/.test(iw) && !/this document/.test(iw),
      'engine.rs: the incident words, which stay on screen while later documents run, say "a document" (the stopped one is named on its own row and receipt)', iw.slice(0, 500));
    // wf7 S6-M1: Settings' model-file line. "press Retry beside Status" is said only where
    // engineCopy draws Retry (ec.retry): a service already answering is 'ready' whatever the model
    // search found, and the line told the lawyer to press a button that was not there. Nor does
    // it say "not found" before the search has answered, or when it failed.
    const settingsLaw = (src) => {
      const line = src.slice(src.indexOf('const modelLine'), src.indexOf('const [checking'));
      return (src.match(/press Retry beside Status/g) || []).length === 1
        && /const again = ec\.retry \? 'press Retry beside Status' : '[^']+';/.test(src)
        && /then \{again\}\.<\/span>/.test(line) && !/then press Retry/.test(line)
        && line.indexOf("modelState === 'checking'") >= 0 && line.indexOf("modelState === 'failed'") >= 0
        && line.indexOf("modelState === 'failed'") < line.indexOf('not found. This version cannot download it')
        && /\{ec\.retry && <button[^>]*onClick=\{retry\}>Retry<\/button>\}/.test(src)
        && /modelCheck\(false\)\.then\(\(m\) => \{ if \(alive\) gotModel\(m\); \}, \(\) => \{ if \(alive\) setModelState\('failed'\); \}\)/.test(src);
    };
    const st = readFileSync(join(here, '..', 'src', 'screens', 'Settings.tsx'), 'utf8');
    check(settingsLaw(st), 'Settings: the model-file line says "press Retry beside Status" only when Retry is drawn, and says "not found" only after the search answered (measured before: always "then press Retry beside Status", and "not found" while nothing had been looked at)');
    check(!settingsLaw(st.replace('then {again}.</span>', 'then press Retry beside Status.</span>')) && !settingsLaw(st.replace("modelState === 'failed'", "modelState === 'never'")),
      'CONTROL: the round-6 line (Retry unconditional) and one that reaches "not found" when the search failed each fail the law');
    check(!settingsLaw(st.replace("setModelState('failed'); }", "setModelState('done'); }")) && !settingsLaw(st.replace('{ec.retry && <button', '{false && <button')),
      'CONTROL: a failed search recorded as done, and a Retry button drawn on anything but ec.retry, each fail the law');
  }
} catch (e) {
  check(false, `harness error: ${e && e.stack ? e.stack : e}`);
} finally {
  delete globalThis.__invoke;
  for (const c of closers.reverse()) { try { await c(); } catch { /* already stopped */ } }
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a handle the OS has not released yet; the folder is under the temp dir */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
