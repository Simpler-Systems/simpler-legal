// DOCTRINE PROFILE — the firm doctrine's path from the Settings control to the wire, and
// the three places it has to tell the truth about itself.
// Run from app/frontend:   node test/doctrine-profile.mjs
//
// Follows test/protected-terms.mjs: esbuild the REAL modules and drive what the app
// exports, never a copy of the logic. The /strip endpoint is stubbed — the adapter needs a
// model this tree does not ship — but everything under test is the app's own code, and the
// stub answers exactly as serve-legal.mjs does, including its 400 on an unknown profile.
//
// `--profile firm` existed in serve-legal.mjs from 2026-09-15 and NOTHING in the app could
// ask for it: no mention of "profile" anywhere in app/frontend or app/src-tauri. FREEZE.md
// measures it at 27 readable identifiers to 11, and 14 of 20 documents to 8 of 20, on a
// firm's own paper. This file pins the plumbing that closed that gap, and four laws:
//
//   1. THE DEFAULT PATH IS UNCHANGED. The request body for the default doctrine is byte
//      identical to the one sent before the argument existed. The claims in FREEZE.md are
//      about that path; plumbing a new option must not quietly alter it. An explicit
//      'auto' also sends nothing, because 'auto' is the adapter's default, not a request.
//
//   2. A FIRM RUN IS REPORTED AS FROZEN. The firm doctrine names itself
//      'v1-legal-frozen+firm', and it IS the frozen pack — FREEZE.md proves the frozen
//      profiles byte-identical either way. An exact-match test on 'v1-legal-frozen' (which
//      is what shipped, in engineStatus.ts AND again in Export.tsx) told the lawyer
//      `frozen: false` on the receipt of a run that was frozen, and printed the in-app
//      core's pass list for a run the frozen service had streamed.
//      Cost: the receipt states the wrong provenance for the engine that did the work.
//
//   3. AN UNHONOURED SETTING IS SAID, NOT INFERRED. The in-app core has no doctrine
//      argument, so a fallback under 'firm' did not do what the lawyer asked. That has to
//      be carried on the outcome and named on the surfaces, because the alternative is a
//      document whose company names are readable and a screen that looks like every other
//      successful run. This is the repo's fail-closed rule applied to a setting.
//
//   4. THE RECEIPT REPORTS WHAT RAN, NOT WHAT WAS ASKED. profileRan comes off the
//      service's own done line. If the setting and the run ever disagree, the surface that
//      is evidence of anything is the one that did the work.
//
//   5. A .DOCX'S TEXT OUTSIDE ITS BODY IS READ IN A REQUEST OF ITS OWN (owner ruling 27). The
//      engine read the body alone, so a client in the letterhead or a matter name in the footer,
//      named nowhere in the body, shipped readable in the saved .docx. The headers, footers and
//      the rest now go to the same engine after the body, in a second request; the body's
//      request is byte-identical with or without it, which is what keeps FREEZE.md's claims
//      about that request; its names are renumbered past the body's so no tag means two
//      people; and a second request that fails, or whose frozen-pipeline alignment fails, holds
//      the .docx and never sends the body to the in-app core.
//
// Every law is followed by a CONTROL that re-creates the broken version and asserts the
// check would catch it, so a green run means the assertions have teeth. Exit 1 on any FAIL.
import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as tcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const src = (...p) => join(here, '..', 'src', ...p);
const dir = mkdtempSync(join(tmpdir(), 'doctrine-profile-'));
const url = (p) => 'file:///' + p.replace(/\\/g, '/');

// tauri.ts imports @tauri-apps at module scope; in a plain browser it takes the fetch path,
// which is the path under test. Stub the packages so the bundle resolves, and make every
// export throw: if the browser branch ever reaches for invoke(), this test says so loudly
// rather than passing on a path it did not exercise. The stubs are an esbuild ALIAS: as a
// nodePaths fallback they were never used, because esbuild finds the real packages in
// app/frontend/node_modules first, so the throwing invoke() was not the one bundled.
for (const [pkg, file, body] of [
  ['@tauri-apps/api', 'core.js', 'export class Channel { constructor(){ this.onmessage = () => {} } }\nexport function invoke(){ throw new Error("invoke() reached on the browser path") }\n'],
  ['@tauri-apps/plugin-dialog', 'index.js', 'export function save(){ throw new Error("save() reached") }\n'],
]) {
  const d = join(dir, 'node_modules', ...pkg.split('/'));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, file), body);
  writeFileSync(join(d, 'package.json'), JSON.stringify(
    pkg === '@tauri-apps/api' ? { name: pkg, type: 'module', exports: { './core': './core.js' } } : { name: pkg, type: 'module', main: file }));
}
writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
const stubs = {
  '@tauri-apps/api/core': join(dir, 'node_modules', '@tauri-apps', 'api', 'core.js'),
  '@tauri-apps/plugin-dialog': join(dir, 'node_modules', '@tauri-apps', 'plugin-dialog', 'index.js'),
};

// The stub adapter listens on a scratch port, never 127.0.0.1:1436: that is the running app's
// engine service, and binding it made this gate fail (EADDRINUSE) whenever the app was open,
// or, with the app closed, left the gate holding the port the app wanted. tauri.ts moves its
// port only in a dev build (VITE_SIMPLER_LEGAL_PORT behind import.meta.env.DEV), so the
// bundles are built with those two defined, as vite defines them.
async function freePort(lo, hi) {
  for (let p = lo; p <= hi; p++) {
    const ok = await new Promise((r) => { const t = tcpServer(); t.once('error', () => r(false)); t.listen(p, '127.0.0.1', () => t.close(() => r(true))); });
    if (ok) return p;
  }
  throw new Error(`doctrine-profile: no free port in ${lo}-${hi}; free one and rerun`);
}
const PORT = await freePort(14370, 14379);
const define = { 'import.meta.env.DEV': 'true', 'import.meta.env.VITE_SIMPLER_LEGAL_PORT': JSON.stringify(String(PORT)) };

const out = {};
for (const [name, entry] of [['tauri', src('lib', 'tauri.ts')], ['status', src('lib', 'engineStatus.ts')], ['engine', src('lib', 'engine.ts')], ['profile', src('lib', 'profile.ts')]]) {
  out[name] = join(dir, `${name}.mjs`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out[name], logLevel: 'silent', absWorkingDir: dir, alias: stubs, define });
}

const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
// engine.ts's fallback runs the strip in a Web Worker. Stubbed to the protocol engine.ts
// actually speaks ({type:'strip'} in, {type:'done'} out) so the FALLBACK BRANCH is real —
// it is the branch, the stats and the note that are under test, not the core's own work.
globalThis.Worker = class {
  constructor() { this.onmessage = null; this.onerror = null; }
  postMessage(m) {
    if (m.type !== 'strip') return;
    setTimeout(() => this.onmessage?.({ data: { type: 'done', doc: m.text, table: [], rejected: [], masked: m.text, complete: true, completeBy: { span: true }, stats: { chunks: 1 } } }), 0);
  }
  terminate() {}
};

const { stripLegalService, LEGAL_SERVICE_PORT } = await import(url(out.tauri));
const { engineIdentity } = await import(url(out.status));
const { stripDocument, mapLegalOutcome } = await import(url(out.engine));
const { loadProfile, saveProfile, DEFAULT_PROFILE, PROFILES } = await import(url(out.profile));

let pass = 0, fail = 0;
const check = (ok, what, detail = '') => { console.log((ok ? '  PASS  ' : '  FAIL  ') + what + (detail ? '\n          ' + detail : '')); ok ? pass++ : fail++; };

check(LEGAL_SERVICE_PORT === PORT && PORT !== 1436, `the app's own code addresses the stub on scratch port ${PORT}, not 1436`, `LEGAL_SERVICE_PORT ${LEGAL_SERVICE_PORT}`);
// CONTROL: what was bundled is the stub that throws, so the browser path below cannot pass by
// quietly reaching the Tauri one
check(readFileSync(out.tauri, 'utf8').includes('invoke() reached on the browser path'), 'the bundle carries the throwing @tauri-apps stubs, not the real packages');

// The stub adapter, answering as serve-legal.mjs does. `seen` records the RAW body so the
// default-path claim below is about bytes rather than about a parsed shape.
const seen = [];
// law 5's answers: the /hello handshake a page with a token asks for before it sends a document
// (tauri.ts browserHello), and `answer`, which may replace the done line for a given text
const HELLO_TOKEN = 'doctrine-profile-law5';
let answer = null;
const srv = createServer((req, res) => {
  if (req.url === '/hello') {
    const payload = JSON.stringify({ v: 1, service: 'serve-legal', port: LEGAL_SERVICE_PORT, engine: 'v1-legal-frozen', llamaOk: true });
    const proof = createHmac('sha256', HELLO_TOKEN).update(`simpler-legal-service/1\n${req.headers['x-simpler-challenge']}\n${payload}`).digest('hex');
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ payload, proof }));
  }
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    let parsed; try { parsed = JSON.parse(b); } catch { parsed = {}; }
    seen.push({ raw: b, parsed, url: req.url, method: req.method });
    const own = answer?.(parsed);
    if (own) {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(JSON.stringify({ stage: 'substrate', genre: 'edgar', profile: 'auto' }) + '\n');
      return res.end(JSON.stringify(own) + '\n');
    }
    if (parsed.profile !== undefined && parsed.profile !== 'auto' && parsed.profile !== 'firm') {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: `unknown profile ${JSON.stringify(String(parsed.profile).slice(0, 40))} — this server accepts "auto" or "firm"` }));
    }
    const p = parsed.profile || 'auto';
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(JSON.stringify({ stage: 'substrate', genre: 'edgar', profile: p }) + '\n');
    res.end(JSON.stringify({ done: true, genre: 'edgar', profile: p, engine: p === 'firm' ? 'v1-legal-frozen+firm' : 'v1-legal-frozen', final: 'masked', alignOk: true, rows: [] }) + '\n');
  });
});
await new Promise((r) => srv.listen(LEGAL_SERVICE_PORT, '127.0.0.1', r));

// ── LAW 1: the default path sends what it always sent ──
console.log('\n— law 1: plumbing an option must not alter the proven path —');
{
  seen.length = 0;
  const r = await stripLegalService('hello', () => {});
  check(seen[0].raw === JSON.stringify({ text: 'hello' }),
    'the default body is byte-identical to the pre-change one', `sent ${seen[0].raw}`);
  check(r.profile === 'auto', "and the service reports it ran 'auto'", `got ${r.profile}`);

  seen.length = 0;
  await stripLegalService('hello', () => {}, 'auto');
  check(seen[0].raw === JSON.stringify({ text: 'hello' }),
    "an explicit 'auto' also sends no profile field — it is the default, not a request", `sent ${seen[0].raw}`);

  seen.length = 0;
  const f = await stripLegalService('hello', () => {}, 'firm');
  check(seen[0].parsed.profile === 'firm', "and 'firm' DOES reach the wire", `sent ${seen[0].raw}`);
  check(f.engine === 'v1-legal-frozen+firm', 'the firm run names itself on its done line', `got ${f.engine}`);

  // CONTROL — an unknown doctrine must fail loud, carrying the service's own words. The
  // browser branch used to throw a bare "legal service http 400" and strand the message.
  let msg = null;
  try { await stripLegalService('hello', () => {}, 'bogus'); } catch (e) { msg = e.message; }
  check(msg !== null, 'an unknown doctrine throws rather than silently running the other one');
  check(msg !== null && /accepts/.test(msg), "and the throw carries the adapter's own message", `got ${msg}`);
}

// ── LAW 2: a firm run is the frozen pack, and every surface must agree ──
console.log('\n— law 2: the firm doctrine IS the frozen pack —');
{
  const firm = engineIdentity({ engine: 'v1-legal-frozen+firm', genre: 'edgar', stages: ['substrate', 'sweeps'] });
  check(firm.frozen === true, 'a firm run is reported frozen', `got frozen=${firm.frozen}`);
  check(/firm doctrine/.test(firm.label) && /firm doctrine/.test(firm.short),
    'and the doctrine is named, not hidden inside the word "frozen"', firm.short);
  check(firm.detail.includes('edgar') && firm.detail.includes('firm doctrine'),
    'the detail carries both the genre and the doctrine', firm.detail);

  const auto = engineIdentity({ engine: 'v1-legal-frozen', genre: 'courts', stages: [] });
  check(auto.frozen === true && auto.short === 'the frozen v1-legal pipeline',
    'the default identity is untouched', auto.short);
  check(auto.detail === 'genre routed: courts', 'including its detail line', auto.detail);

  // CONTROL — `frozen` must still be a real claim. If it were true for everything the law
  // above would pass while meaning nothing.
  check(engineIdentity({ engine: 'in-app-core' }).frozen === false, 'the in-app core is still NOT frozen');
  check(engineIdentity({ engine: 'something-else' }).frozen === false, 'and neither is an engine nobody recognises');
  check(engineIdentity({}) === null, 'no engine field is null, not a default');
}

// ── LAW 5: the text outside a .docx's body, in a request of its own ──
console.log('\n— law 5: a .docx\'s headers and footers go to the engine apart from its body, and the body\'s request is unchanged —');
{
  // the engine and side modules as a page given the service's token builds them, so
  // stripDocument takes the service path (tauri.ts devToken, browserHello); `mutations`
  // rewrite engine.ts on the way in, each required to find its text
  let n5 = 0;
  const bundle5 = async (entry, mutations = []) => {
    const outfile = join(dir, `law5-${n5++}.mjs`);
    await build({
      entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent', absWorkingDir: dir, alias: stubs,
      define: { ...define, 'import.meta.env.VITE_SIMPLER_LEGAL_TOKEN': JSON.stringify(HELLO_TOKEN) },
      plugins: [{ name: 'mutate', setup(b) {
        b.onLoad({ filter: /lib[\\/]engine\.ts$/ }, (args) => {
          let s = readFileSync(args.path, 'utf8');
          for (const [from, to] of mutations) {
            if (!s.includes(from)) throw new Error(`CONTROL anchor not found in engine.ts: ${from}`);
            s = s.split(from).join(to);
          }
          return { contents: s, loader: 'ts' };
        });
      } }],
    });
    return import(url(outfile));
  };
  const E5 = await bundle5(src('lib', 'engine.ts'));
  const { sideOf, sideReceipt, sideScope, sideUnreadHead, SIDE_JOIN } = await bundle5(src('lib', 'side.ts'));

  // a letter: the body names the other side's solicitor; the letterhead names the client, and
  // the footer the client-matter number, and neither is named in the body
  const BODY = 'Dear Sirs, we act for our client in this matter. We refer to your letter to Margaret Tan of 3 March.';
  const HEAD = 'PRIVILEGED & CONFIDENTIAL — Prepared for Brightline Holdings Ltd';
  const FOOT = 'Client-Matter: Okonkwo / 12345.001';
  const flow = (part, text, where) => ({ part, text, kind: 'flow', read: 'text', where, pieces: [] });
  const side = sideOf([flow('word/document.xml', BODY, 'the body of the saved .docx'), flow('word/header1.xml', HEAD, 'a header'), flow('word/footer1.xml', FOOT, 'a footer')]);
  check(side.state === 'waiting' && SIDE_JOIN === '\n\n####\n\n' && side.text === `${HEAD}${SIDE_JOIN}${FOOT}` && !side.text.includes('Dear Sirs'),
    'what is sent is the header and the footer, a line of four #s between (lib/side.ts SIDE_JOIN), and none of the body', JSON.stringify(side.text));

  const row = (span, cls, tag) => ({ span, cls, src: 'legal-pipeline', tag });
  const done = (rows, alignOk = true) => ({ done: true, genre: 'edgar', profile: 'auto', engine: 'v1-legal-frozen', final: 'masked', alignOk, rows });
  // the service's numbering is its own per request: the footer's client is its [Person1] too
  const SIDE_ROWS = [row('Brightline Holdings Ltd', 'COMPANY', '[Company1]'), row('Okonkwo', 'PERSON', '[Person1]')];
  let sideAnswer = () => done(SIDE_ROWS);
  answer = (p) => (p.text === BODY ? done([row('Margaret Tan', 'PERSON', '[Person1]')]) : p.text === side.text ? sideAnswer() : null);

  // the documents sent: POST /strip bodies, not the health and handshake calls around them
  const run = async (E = E5, s = side) => { seen.length = 0; const o = await E.stripDocument(BODY, () => {}, 'auto', s ?? undefined); return { o, sent: seen.filter((x) => x.method === 'POST' && x.url === '/strip').map((x) => x.raw) }; };
  const plan = (o, s = o.side) => E5.exportPlan({ kind: 'docx', text: BODY, entities: o.entities, reviewed: true, engineComplete: o.complete, bytes: new Uint8Array(1), side: s }, [], 'us');

  const alone = await run(E5, null);
  const both = await run();
  check(alone.sent.length === 1 && both.sent.length === 2 && both.sent[0] === alone.sent[0] && both.sent[0] === JSON.stringify({ text: BODY }),
    'the body\'s request is byte-identical with the text outside it and without, and that text goes in a second request', `${alone.sent.length} request(s) without it · ${both.sent.length} with it`);
  check(both.sent[1] === JSON.stringify({ text: side.text }), 'the second request carries that text alone', both.sent[1]?.slice(0, 120));
  const o = both.o;
  const rows = o.side?.rows ?? [];
  const by = (t) => rows.find((e) => e.text === t);
  check(String(o.stats.engine).startsWith('v1-legal-frozen') && o.entities.map((e) => e.text).join('|') === 'Margaret Tan' && o.side?.state === 'read',
    'the table is the body\'s — the names found only outside it are not rows of it — and the side read is recorded as read', `${o.entities.map((e) => e.text)} · ${o.side?.state}`);
  check(by('Brightline Holdings Ltd')?.tag === '[Company1]' && by('Brightline Holdings Ltd')?.found?.join() === 'a header'
    && by('Okonkwo')?.tag === '[Person2]' && by('Okonkwo')?.found?.join() === 'a footer',
    'each name found only outside the body says where it was found, and the footer\'s client is [Person2], past the body\'s [Person1]', rows.map((e) => `${e.text} ${e.tag} ${e.found}`).join(' | '));
  check(SIDE_ROWS[1].tag === o.entities[0].tag, 'CONTROL: the service tagged the footer\'s client [Person1], the tag of Margaret Tan in the body, so the renumbering is what keeps one tag one person');
  const p = plan(o);
  const head = p.docx.mask(HEAD).text, foot = p.docx.mask(FOOT).text;
  check(p.docxHeld === null && !/Brightline|Okonkwo/.test(head + foot) && head.includes('[Company1]') && foot.includes('[Person2]'),
    'the saved .docx is not held, and its mask writes the letterhead\'s client and the footer\'s client as their tags', `${head} · ${foot}`);
  // H-ATK-4: the receipt counted every side row a "name" (a footer's direct line and matter
  // reference are not), and said "masked with them as well" of none
  const said = sideReceipt(o.side) ?? '';
  const saidNone = sideReceipt({ ...o.side, rows: [] }) ?? '';
  check(/it found 2 things to mask there that the app did not find in the body \(People 1, Organizations 1\), and the saved \.docx is masked with them as well/.test(said) && !/\bnames?\b/.test(said)
    && /it found nothing to mask there that the app did not find in the body — /.test(saidNone) && !/masked with/.test(saidNone),
    'the receipt counts what it found outside the body by the review table\'s headings, and says nothing found as nothing', `${said} ‖ ${saidNone}`);
  const bare = plan(alone.o, side);
  check(p.red === bare.red && !p.red.includes('[Company1]') && p.red.includes('[Person1]'),
    'the copied text and the .txt are the body\'s, the same with the side read as without it', p.red);
  const unread = plan(alone.o, { ...side, state: 'read', rows: [] });
  check(/Brightline/.test(unread.docx.mask(HEAD).text) && /Okonkwo/.test(unread.docx.mask(FOOT).text),
    'CONTROL: with the table and no side rows, as the writer masked before, both clients ship readable in the saved .docx', unread.docx.mask(FOOT).text);

  // the second request fails: the frozen run of the body stands, and the .docx is held
  sideAnswer = () => ({ error: 'model server on 127.0.0.1:1436 (C:\\Users\\me\\llama-server.exe) did not answer' });
  const failed = (await run()).o;
  const fp = plan(failed);
  check(String(failed.stats.engine).startsWith('v1-legal-frozen') && failed.side?.state === 'unread' && failed.side.again === true
    && failed.side.why === 'the request that sent it to the engine failed' && /did not answer/.test(failed.side.detail ?? ''),
    'a second request that fails leaves the frozen run of the body standing, and the text outside it unread, with the engine\'s words kept for the screen', JSON.stringify(failed.side && { state: failed.side.state, why: failed.side.why, detail: failed.side.detail }));
  check(/^the engine did not read the text the saved \.docx carries outside its body: the request that sent it to the engine failed\. The \.docx is held/.test(fp.docxHeld ?? '') && !/llama-server|C:\\/.test(fp.docxHeld ?? '') && !fp.blocked,
    'the .docx is held with a reason that names no process or path, and the copied text and the .txt are not held on that ground', fp.docxHeld);

  // the frozen pipeline's alignment of the second request fails: its rows are empty
  sideAnswer = () => done([], false);
  const cut = (await run()).o;
  check(cut.side?.state === 'unread' && cut.side.again === false && plan(cut).docxHeld !== null,
    'a second request whose alignment failed is not read — its rows are empty — and the .docx is held', JSON.stringify(cut.side && { state: cut.side.state, why: cut.side.why }));
  const E5a = await bundle5(src('lib', 'engine.ts'), [['      if (!o.complete) return { entities: body.entities, side: { ...side, state: \'unread\', again: false, ran: true, why: SIDE_ALIGN } };\n', '']]);
  const ca = (await run(E5a)).o;
  check(ca.side?.state === 'read' && plan(ca).docxHeld === null && /Okonkwo/.test(plan(ca).docx.mask(FOOT).text),
    'CONTROL: with the alignment check off, it is "read" with no name found, the .docx is not held, and the footer\'s client ships', plan(ca).docx.mask(FOOT).text);
  // H-ATK-3: that text WAS sent and the engine DID read it; every surface said "NOT read by an
  // engine". It says the read could not be used, and never that no engine read it.
  const cutSaid = [plan(cut).docxHeld ?? '', sideReceipt(cut.side) ?? '', sideScope(cut.side, false), sideScope(cut.side, true), sideUnreadHead(cut.side)];
  check(cut.side?.ran === true
    && /^the app could not use the engine’s read of the text the saved \.docx carries outside its body: the frozen legal pipeline read it/.test(cutSaid[0])
    && /^outside the body: read by the engine, but the read could not be used — the frozen legal pipeline read it/.test(cutSaid[1])
    && /could not use the engine’s read of them — so the \.docx is held$/.test(cutSaid[2]) && /could not use the engine’s read of them/.test(cutSaid[3])
    && cutSaid[4] === 'Outside the body read, but its read could not be used.'
    && !cutSaid.some((s) => /NOT read|did not read|no engine read|not read\./.test(s)),
    'a second request the engine read and whose read could not be used is said so on the hold, the receipt, both scope sentences and the Review, and none of them says no engine read it', cutSaid.join(' ‖ '));
  check(!failed.side?.ran && /^outside the body: NOT read by an engine — the request that sent it to the engine failed/.test(sideReceipt(failed.side) ?? '') && sideUnreadHead(failed.side) === 'Outside the body not read.',
    'a second request that failed is still said not read, on the receipt and the Review', sideReceipt(failed.side));
  const E5n = await bundle5(src('lib', 'engine.ts'), [['again: false, ran: true, why: SIDE_ALIGN', 'again: false, why: SIDE_ALIGN']]);
  const cn = (await run(E5n)).o;
  check(/^outside the body: NOT read by an engine/.test(sideReceipt(cn.side) ?? '') && /^the engine did not read the text/.test(plan(cn).docxHeld ?? ''),
    'CONTROL: with `ran` not set where the alignment fails, the receipt and the hold say again that no engine read the text the engine read', sideReceipt(cn.side));

  // a body run that did not finish sends nothing more
  sideAnswer = () => done(SIDE_ROWS);
  const bodyCut = answer;
  answer = (q) => (q.text === BODY ? done([row('Margaret Tan', 'PERSON', '[Person1]')], false) : bodyCut(q));
  const un = await run();
  answer = bodyCut;
  check(un.sent.length === 1 && un.o.side?.state === 'not-run' && plan(un.o).docxHeld === null,
    'a body run that did not finish sends the text outside it nowhere, and says so (the export is held on the body\'s own ground)', `${un.sent.length} requests · ${un.o.side?.state} · ${un.o.side?.why}`);

  // CONTROL: the second request taken out
  const E5r = await bundle5(src('lib', 'engine.ts'), [["const s = await readSide(side, o, 'service', onProgress, share, profile);", 'const s = { entities: o.entities, side };']]);
  const none = await run(E5r);
  check(none.sent.length === 1 && none.o.side?.state === 'waiting' && /has not been sent to an engine, so the \.docx is held/.test(plan(none.o).docxHeld ?? ''),
    'CONTROL: with the second request taken out, one request goes, the text outside the body stays unsent, and the .docx is held rather than saved with its clients readable', plan(none.o).docxHeld);
  answer = null;
}

// ── LAW 3: a doctrine the run did not honour is stated ──
console.log('\n— law 3: the fallback did not do what was asked, and says so —');
{
  srv.close();
  await new Promise((r) => srv.on('close', r));
  // nothing is listening now: this is the real fallback branch, reached the real way

  const firm = await stripDocument('Acme Holdings Ltd v. Bernard Whitfield.', () => {}, 'firm');
  check(firm.stats.engine === 'in-app-core', 'the fallback ran the in-app core', String(firm.stats.engine));
  check(firm.stats.profileAsked === 'firm', 'the doctrine the lawyer chose is recorded', String(firm.stats.profileAsked));
  check(firm.stats.profileRan === null, 'and the doctrine that ran is recorded as none', String(firm.stats.profileRan));
  const note = String(firm.stats.profileNote);
  check(note.includes('Our own matter files'), 'the note names the setting in the words the Settings card used', note);
  check(/did not run/i.test(note), 'says plainly that it did not run', note);
  check(/readable/i.test(note), 'and names the CONSEQUENCE, not just the mechanism', note);

  // CONTROL — the note must not appear when nothing was promised, or it becomes noise that
  // gets ignored on the one run where it matters.
  const auto = await stripDocument('Acme Holdings Ltd v. Bernard Whitfield.', () => {}, 'auto');
  check(auto.stats.profileNote === undefined, 'the default fallback adds no note', String(auto.stats.profileNote));
  check(auto.stats.profileAsked === undefined, 'and claims no doctrine was asked for');
}

// ── LAW 4: the receipt reports the run, not the request ──
console.log('\n— law 4: profileRan comes off the service, not off the setting —');
{
  const ran = mapLegalOutcome('x', { genre: 'edgar', engine: 'v1-legal-frozen+firm', final: 'm', alignOk: true, rows: [], profile: 'firm' });
  check(ran.stats.profileRan === 'firm', "a service reporting 'firm' is recorded as firm", String(ran.stats.profileRan));
  // CONTROL — a service that reports nothing must yield null rather than the setting we
  // sent. Echoing the request back would make the receipt self-confirming.
  const silent = mapLegalOutcome('x', { genre: 'edgar', engine: 'v1-legal-frozen', final: 'm', alignOk: true, rows: [] });
  check(silent.stats.profileRan === null, 'a service reporting no doctrine yields null, not a guess', String(silent.stats.profileRan));
}

// ── the setting itself ──
console.log('\n— the stored setting —');
{
  store.clear();
  check(loadProfile() === 'auto', "an unset profile loads 'auto'", loadProfile());
  check(DEFAULT_PROFILE === 'auto',
    "the default is 'auto' — FREEZE.md makes firm reachable only when a caller asks for it by name, and a default is not asking",
    DEFAULT_PROFILE);
  check(saveProfile('firm') === 'firm' && loadProfile() === 'firm', 'firm round-trips through storage');
  check(saveProfile('nonsense') === 'auto' && loadProfile() === 'auto',
    'and an unrecognised value falls back to the default rather than being stored');
  check(PROFILES.length === 2 && PROFILES.every((p) => p.label && p.note && p.measured),
    'every doctrine on the Settings card carries a label, what it changes, and what was measured');
  // CONTROL — the firm card must not claim a walk-forward round it does not have.
  const firmRow = PROFILES.find((p) => p.id === 'firm');
  check(/not a sealed walk-forward round|FREEZE/.test(firmRow.measured),
    'and the firm card says what it is NOT backed by', firmRow.measured);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
