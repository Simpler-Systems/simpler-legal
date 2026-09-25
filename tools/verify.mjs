#!/usr/bin/env node
// VERIFY — the one gate that runs everything runnable in this tree.
//
//   npm run verify
//
// Before this existed, simpler-legal had six working test entry points and no way to run
// them together: four under app/extract (behind its own `npm test`), two under
// app/frontend (one wired to a script, one not), and three selftests reachable only by
// remembering their argv. A clone could be green on every suite it happened to run and
// still ship a regression in the one nobody remembered.
//
// BOUNDARY-AWARE, the way simpler-red's suite is. Some gates read inputs that are
// deliberately NOT in this repository: the TAB benchmark is non-redistributable, and
// `raw/` is gitignored because it is rebuilt, not shipped. Those gates SKIP, and every
// skip prints the reason and the command that makes it runnable. A skip is never counted
// as a pass, and the summary states the three numbers separately.
//
// FAIL-LOUD: any gate that runs and exits non-zero fails the whole run, its output is
// reprinted under its name, and this process exits 1.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const has = (...p) => existsSync(join(ROOT, ...p));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// gold-path.mjs:11 resolveGold() looks in the literal path first, then in the hydrated tree,
// because the PUBLISHED gold is offsets-only. Its miss path calls process.exit(2), so it
// cannot be used as a predicate; this is the same two-step, and it must stay the same two-step.
const goldPresent = (spec) => has(spec) || has('raw', 'gold-hydrated', spec.split('/').pop());

// `need` is checked BEFORE the gate runs. It returns a reason string to skip, or null to run.
const GATES = [
  {
    name: 'extract',
    what: 'docx forensic walker + writer, pdf, text family, format detection',
    cmd: [npm, ['--prefix', 'app/extract', 'test']],
    // app/extract declares its own dependencies and its own lockfile. On the authoring
    // machine app/extract/node_modules is a SYMLINK to app/frontend's, which saves a
    // duplicate install and which git does not carry — so this must check what node will
    // actually resolve rather than what happens to be installed next door. Node walks UP
    // from app/extract and never looks sideways into app/frontend.
    need: () => (has('app', 'extract', 'node_modules')
      ? null
      : 'app/extract/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'floor-tables',
    what: 'the frozen structured floor vs the practice tables, plus 3000 fuzz runs',
    cmd: [npm, ['--prefix', 'app/frontend', 'run', 'test:floor-tables']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'doctrine-profile',
    what: 'the firm doctrine from the Settings control to the wire, the three surfaces that report it, and a .docx\'s text outside its body sent in a request of its own with the body\'s request unchanged',
    cmd: [npm, ['--prefix', 'app/frontend', 'run', 'test:doctrine-profile']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'protected-terms',
    what: 'the user-declared lexicon: no invented prefixes, never masking less once declared, and a declared term masked in a letterhead the body does not carry',
    cmd: [npm, ['--prefix', 'app/frontend', 'run', 'test:protected-terms']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'review-honesty',
    what: 'the review counts what a human decided, never engine confidence; a pending name stays masked until decided',
    // Run by path, not through an npm script: it needs only esbuild, which node resolves from
    // app/frontend/node_modules by walking up from the test's own folder.
    cmd: [process.execPath, ['app/frontend/test/review-honesty.mjs']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'finish-attestation',
    what: 'finishing is an attestation over the export as it stood: a later change that leaves anything readable takes it off, undo never crosses files',
    cmd: [process.execPath, ['app/frontend/test/finish-attestation.mjs']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'compare-refusal',
    what: 'the Compare clipboard is a second export path and never an easier one: Export\'s holds, keyed on the file, with the way through',
    cmd: [process.execPath, ['app/frontend/test/compare-refusal.mjs']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'service-auth',
    what: 'the engine service answers only the app: foreign origins, bad Host headers and a missing or wrong per-launch secret are refused',
    // Starts serve-legal.mjs on free scratch ports in 14390-14399 (never 1436 or 49400), stops
    // everything it started and deletes its temp copy, so it runs beside a live app.
    cmd: [process.execPath, ['app/frontend/test/service-auth.mjs']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'service-lifecycle',
    what: 'what may reach the engine service, what a second launch may touch, what stops a run, and what the receipt says about who started each process',
    // scratch ports 14380-14389, same discipline as service-auth
    cmd: [process.execPath, ['app/frontend/test/service-lifecycle.mjs']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'docx-parts',
    what: 'the saved .docx: every part and attribute read by the gate, layout names renamed, author bookmarks renamed, unreadable parts dropped or held, and a name the engine found only outside the body masked where it stands',
    cmd: [process.execPath, ['app/frontend/test/docx-parts.mjs']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'intake-refusal',
    what: 'saved email and encoded content (base64, quoted-printable, TNEF, .msg) refused at the drop in every lane, and the repo\'s own texts not refused',
    cmd: [process.execPath, ['app/frontend/test/intake-refusal.mjs']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'copy-claims',
    what: 'the product copy that states what the app does, pinned to the code that does it',
    cmd: [process.execPath, ['app/frontend/test/copy-claims.mjs']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'drop-holds',
    what: 'a file the drop holds says why in its own row, with the way through, for every cause its pages give',
    cmd: [process.execPath, ['app/frontend/test/drop-holds.mjs']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'site-claims',
    what: 'the public site\'s sentences held to the code that does what they say, each blind spot named exactly while it still ships',
    // Bundles the real engine and writer from app/frontend/src into the OS temp folder, so it
    // needs esbuild from app/frontend/node_modules like the frontend gates above.
    cmd: [process.execPath, ['tools/site-claims.mjs']],
    need: () => (has('app', 'frontend', 'node_modules')
      ? null
      : 'app/frontend/node_modules is absent; run `npm run setup`'),
  },
  {
    name: 'rust-unit',
    what: 'the Rust half: model-port ownership, the per-connection relay check, service auth, the stale-scratch sweep',
    cmd: ['cargo', ['test', '--offline', '--manifest-path', 'app/src-tauri/Cargo.toml']],
    // tauri's build script refuses to compile without the Node sidecar or llama-cuda/ (both
    // gitignored; `node tools/fetch-deps.mjs` places them, BUILDING.md step 3).
    need: () => (spawnSync('cargo', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).status !== 0
      ? 'cargo is not on PATH; install the Rust toolchain (rustup)'
      : !has('app', 'src-tauri', 'binaries') || !has('llama-cuda')
        ? 'the Node sidecar (app/src-tauri/binaries) or llama-cuda/ is absent, and tauri\'s build script stops without either; run `node tools/fetch-deps.mjs`'
        : null),
  },
  {
    name: 'clone-imports',
    what: 'every relative import in a tracked file resolves to a file git actually carries',
    cmd: ['node', ['tools/check-clone-imports.mjs']],
    // No `need`: this gate reads git metadata and tracked sources only. It requires no install,
    // which is the point — it is the one check that is about what a STRANGER receives, so it must
    // run in a tree where nothing has been set up yet.
    need: () => null,
  },
  {
    name: 'graph',
    what: 'seed-set mechanics, the facets disposition guard, every emitted span verbatim',
    cmd: [process.execPath, ['graph.mjs', 'selftest']],
    need: () => (has('corpus') ? null : 'corpus/ is absent; run `node build-corpus.mjs`'),
  },
  // No separate `facets` gate: facets.mjs is a module, not a CLI, so `node facets.mjs
  // selftest` prints nothing and exits 0 — a gate that cannot fail is worse than no gate.
  // Its guard is `selftestFacets()`, which the graph gate above already runs and reports.
  {
    name: 'score-pii',
    what: 'the PII scorer verified against a null, an oracle and an overmasking stand-in',
    cmd: [process.execPath, ['score-pii.mjs', 'selftest']],
    // TAB is non-redistributable and raw/ is gitignored, so this gate is absent in a clone
    // BY DESIGN. It is the only gate here that reads a corpus this repository cannot ship.
    need: () => (has('raw', 'oos')
      ? (goldPresent('pii-bench/oos-labels')
        ? null
        : 'the gold is offsets-only in this tree; run `node gold-offsets.mjs hydrate`')
      : 'raw/oos is absent (TAB is non-redistributable, raw/ is gitignored); run `node build-oos.mjs`'),
  },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const run = only.length ? GATES.filter((g) => only.includes(g.name)) : GATES;
if (only.length && run.length !== only.length) {
  const bad = only.filter((n) => !GATES.some((g) => g.name === n));
  console.error(`no such gate: ${bad.join(', ')}\nhave: ${GATES.map((g) => g.name).join(', ')}`);
  process.exit(2);
}

const started = run.length;
const results = [];
for (const g of run) {
  const skip = g.need();
  if (skip) { console.log(`SKIP  ${g.name.padEnd(16)} ${skip}`); results.push({ g, state: 'skip' }); continue; }
  const t0 = process.hrtime.bigint();
  // shell:true on Windows ONLY because npm ships as npm.cmd, and since Node 20 spawning a
  // .cmd without a shell fails EINVAL. Every argv below is a fixed literal with no spaces or
  // shell metacharacters; nothing here interpolates user input, and nothing should start to.
  const r = spawnSync(g.cmd[0], g.cmd[1], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  if (r.error) { console.log(`FAIL  ${g.name.padEnd(16)} could not start: ${r.error.message}`); results.push({ g, state: 'fail', out }); continue; }
  const ok = r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${g.name.padEnd(16)} ${g.what}  (${ms.toFixed(0)} ms)`);
  results.push({ g, state: ok ? 'pass' : 'fail', out });
}

const failed = results.filter((r) => r.state === 'fail');
for (const f of failed) {
  console.log(`\n───── ${f.g.name} ─────\n${f.out.trimEnd()}`);
}

// started-vs-results, counted every run: a summary must never be the thing that closes this check
const pass = results.filter((r) => r.state === 'pass').length;
const skipped = results.filter((r) => r.state === 'skip').length;
console.log(`\n${started} gates started, ${pass} passed, ${skipped} skipped, ${failed.length} failed`);
if (pass + skipped + failed.length !== started) {
  console.log('ACCOUNTING FAILURE: results do not add up to gates started');
  process.exit(1);
}
process.exit(failed.length === 0 ? 0 : 1);
