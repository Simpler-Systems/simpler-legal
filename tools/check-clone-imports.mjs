#!/usr/bin/env node
// CLONE IMPORTS — every relative import in a TRACKED file must resolve to a TRACKED file.
//
//   node tools/check-clone-imports.mjs
//
// This gate exists because the same defect broke the clone twice, and both times it was found
// by a human noticing rather than by anything in the tree:
//   157997f  "The clone was broken: 13 imports in tracked files resolved to files that were
//            never committed"
//   42fda0b  "The second thing a clone could not do: app/extract resolves its dependencies
//            through a symlink git cannot carry"
// Both were fixed by adding the missing files. Neither added a check, so the third occurrence
// was always going to happen the same way — and it did: on 2026-09-22 a doctrine-profile
// setting landed as app/frontend/src/lib/profile.ts, imported by two TRACKED files
// (lib/engine.ts, screens/Settings.tsx) while itself untracked. Nothing in the repo noticed.
// `npm run verify` was 6/6 green, `tsc --noEmit` clean and the app built — because all three
// read the WORKING TREE, where the file is present. A clone gets the imports and not the file.
//
// WHY THIS IS THE RIGHT COMPARISON. The authoring machine cannot see this class by running
// anything, because every tool it runs resolves against the working tree. The only way to see
// it is to ask a different question: not "does this resolve?" but "does this resolve to
// something a stranger would receive?". That is a question about `git ls-files`, so this gate
// asks it directly rather than simulating a clone.
//
// FAIL-LOUD, and with the remedy: an unresolved import prints the importer, the specifier, the
// candidate paths that were tried, and — when the target exists but is untracked — the exact
// `git add` that fixes it. That last case is the common one and is a one-word fix, so saying
// "unresolved" without saying "it is right there, untracked" would waste the reader's time.
//
// SCOPE, stated because a gate that overstates itself is the thing this repo keeps fixing:
// this reads RELATIVE IMPORT specifiers only, and three kinds of file dependency are outside
// it by construction:
//   · bare package specifiers — a question about node_modules and lockfiles, which is a
//     different check (`npm run setup` and the extract gate's own `need()` cover their half);
//   · paths built at run time, since this parses and never executes;
//   · a path passed to a CHILD PROCESS rather than imported. tools/verify.mjs reaches every
//     gate that way, including this one — `cmd: ['node', ['tools/check-clone-imports.mjs']]`
//     is a string in an array, so an untracked gate script would break a clone's `npm run
//     verify` and NOT be reported here. That is a real hole in this gate and naming it is
//     cheaper than a version of it that guesses which string literals are paths.
// Nothing above is a reason to skip the check; they are the edges a reader should not assume
// are covered.
//
// RUST, since 2026-09-23. `mod x;` in a Rust file is a file dependency exactly as an import is:
// cargo reads x.rs (or x/mod.rs, or the #[path = "…"] file) and a clone without it does not
// build. The app's Rust side gained four such modules in one round, one of them untracked, and
// this gate read no .rs file at all. Followed: `mod x;` with any attributes and visibility, in
// a crate root or mod.rs (x.rs / x/mod.rs beside it) or any other file f.rs (f/x.rs /
// f/x/mod.rs), and #[path = "…"], relative to the declaring file's folder. Not followed: a
// `mod x;` inside an inline `mod a { … }` (its folder is a/, and nothing in this tree does it),
// a path given only through #[cfg_attr(…, path = …)], and include!/include_str! of a file.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });

// `--rev <commit>` audits a COMMIT instead of the working tree: the file list comes from that
// commit's tree and each file's content from that commit, so nothing on disk is read or touched.
//
// It does NOT reproduce the two historical breakages, and the reason is worth stating because it
// is the whole point of the default mode. Checked: `git show 157997f^:app/frontend/src/lib/engine.ts`
// contains zero references to `./practice` or `./floorTables.mjs` — the imports and the files
// they name arrived in the SAME commit, so that commit's tree was self-consistent and `--rev
// 157997f^` correctly passes. The defect its message describes lived between the working tree and
// the index: the engine.ts ON DISK had imports the commit did not carry. That is a state no
// revision can hold, which is why the default mode — working-tree content against `git ls-files`
// — is the one that catches this class, and why it caught it again on 2026-09-22.
// `--rev` earns its keep elsewhere: it audits what a cloner of any given commit actually receives.
const revArg = process.argv.indexOf('--rev');
const REV = revArg >= 0 ? process.argv[revArg + 1] : null;

const norm = (p) => p.replace(/\\/g, '/');
const tracked = new Set(
  (REV
    ? git('ls-tree', '-r', '--name-only', '-z', REV)
    : git('ls-files', '-z')
  ).split('\0').filter(Boolean).map(norm),
);
const isTracked = (abs) => tracked.has(norm(relative(ROOT, abs)));
// At a revision the working tree is irrelevant: "does this file exist" is a question about the
// commit's tree, and reading content means reading the blob, not the disk.
const fileExists = (abs) => (REV ? tracked.has(norm(relative(ROOT, abs))) : existsSync(abs) && statSync(abs).isFile());
const readSource = (rel) => (REV ? git('show', `${REV}:${norm(rel)}`) : readFileSync(join(ROOT, rel), 'utf8'));

// The files we READ. Only tracked sources matter: an untracked file importing an untracked file
// is not a clone defect, it is work in progress.
const SOURCE = /\.(mjs|cjs|js|jsx|ts|tsx|rs)$/;
const RUST = /\.rs$/;
const sources = [...tracked].filter((p) => SOURCE.test(p) && !p.includes('node_modules'));
if (!sources.length) { console.error(`no tracked source files found${REV ? ` at ${REV}` : ''} — refusing to report a pass over an empty check`); process.exit(3); }

// Specifier shapes that create a real file dependency. The last one is not an import at all —
// Vite turns `new URL('./x.ts', import.meta.url)` into a bundled asset, so a missing target
// breaks the build exactly as an import would (lib/engine.ts builds its strip worker this way).
const PATTERNS = [
  { re: /\bimport\s+[^'"();]*?\bfrom\s*['"]([^'"]+)['"]/g, fileOnly: false },
  { re: /\bexport\s+[^'"();]*?\bfrom\s*['"]([^'"]+)['"]/g, fileOnly: false },
  { re: /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, fileOnly: false },
  { re: /\bimport\s*['"]([^'"]+)['"]/g, fileOnly: false },
  { re: /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, fileOnly: false },
  // `fileOnly`: a new URL() specifier is only a FILE dependency when it names a file. The same
  // form is also how this repo derives directories — tools/verify.mjs and tools/make-icons.mjs
  // both do `new URL('..', import.meta.url)` to find the repo root — and a directory is not
  // something git tracks, so treating those as unresolved imports is a false positive. An
  // extension is the distinguishing mark, and it is the one Vite itself needs to bundle.
  { re: /\bnew\s+URL\s*\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g, fileOnly: true },
];

// TypeScript lets an import omit the extension, and lets './dir' mean './dir/index.ts'. A
// specifier ending .js may also be TS's rewritten form of a .ts file, so both are candidates.
const EXTS = ['', '.ts', '.tsx', '.d.ts', '.mjs', '.cjs', '.js', '.jsx', '.json'];
const INDEX = ['index.ts', 'index.tsx', 'index.mjs', 'index.js', 'index.json'];

// Blank out comments before scanning. This gate parses text rather than an AST, so without
// this it reads EXAMPLE code in prose as a real dependency — it caught its own header comment
// on first run, which in a repo that explains every rule in long comments is not a rare event
// but the normal one. The walk is string-aware in both directions: a `//` inside a string is
// not a comment ('https://…', a regex of path separators), and an apostrophe inside a comment
// ("git cannot carry") must not open a string and swallow the rest of the file. Comment bodies
// are replaced space-for-space so nothing downstream shifts.
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && d === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      let lit = c; i++;
      while (i < n) {
        if (src[i] === '\\') { lit += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        lit += src[i];
        if (src[i] === q) { i++; break; }
        // an unterminated single/double quote ends at the newline rather than running away
        if (q !== '`' && src[i] === '\n') { i++; break; }
        i++;
      }
      // A string whose body holds a quote character is DATA, never a specifier: no module path
      // contains a quote. Its body is blanked, newlines kept, because a test that hands esbuild
      // an entry written as "export * from './tauri';" is otherwise read as importing ./tauri
      // from the test's own folder (measured 2026-09-23 on service-auth.mjs and
      // service-lifecycle.mjs, whose entries resolve against src/lib, not test/).
      const body = lit.slice(1, lit.endsWith(q) && lit.length > 1 ? -1 : undefined);
      out += /['"`]/.test(body) ? lit[0] + body.replace(/[^\n]/g, ' ') + lit.slice(1 + body.length) : lit;
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** Every relative specifier in a source, comments removed and duplicates collapsed. Extracted
 *  so `--selftest` can exercise the one part of this gate with any real risk in it: the regexes
 *  and the comment walk. Resolution itself is filesystem/git lookup and is exercised by the
 *  gate's own run. */
export function specifiersIn(src) {
  const clean = stripComments(src);
  const seen = new Set();
  const out = [];
  for (const { re, fileOnly } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(clean))) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue; // bare package — not this gate's question
      if (fileOnly && !/\.[a-z0-9]+$/i.test(spec)) continue; // a directory, not an asset
      if (seen.has(spec)) continue;
      seen.add(spec);
      out.push(spec);
    }
  }
  return out;
}

// Rust's own lexical rules, because the JS walk above misreads Rust: a lifetime ('a, 'static)
// opens a JS string, and Rust block comments nest. Comments are blanked; string and char
// literal bodies are blanked too (a test that writes "mod x;" into a string is not declaring
// a module), except the string of a #[path = "…"] attribute, which is the one string here
// that IS a file name.
function stripRust(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && d === '*') {
      let depth = 0;
      do {
        if (src[i] === '/' && src[i + 1] === '*') { depth++; out += '  '; i += 2; continue; }
        if (src[i] === '*' && src[i + 1] === '/') { depth--; out += '  '; i += 2; continue; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      } while (i < n && depth > 0);
      continue;
    }
    // raw strings r"…", r#"…"#, br#"…"#: no escapes, closed by the quote and as many #s
    const raw = /^b?r(#*)"/.exec(src.slice(i, i + 260));
    if (raw && !/[A-Za-z0-9_]/.test(src[i - 1] ?? '')) {
      const close = '"' + raw[1];
      const end = src.indexOf(close, i + raw[0].length);
      const stop = end < 0 ? n : end + close.length;
      out += raw[0] + blank(src.slice(i + raw[0].length, stop - close.length)) + src.slice(Math.max(i + raw[0].length, stop - close.length), stop);
      i = stop;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      const body = src.slice(i + 1, j);
      const keep = /#\[\s*path\s*=\s*$/.test(out);
      out += '"' + (keep ? body : blank(body)) + (j < n ? '"' : '');
      i = j + 1;
      continue;
    }
    if (c === "'") {
      // a char literal ('x', '\n', '\'', '\u{1F600}') or a lifetime ('a, 'static): only the
      // literal is blanked; a lifetime is one quote and an identifier
      const ch = /^'(\\(u\{[0-9a-fA-F]{1,6}\}|x[0-9a-fA-F]{2}|.)|[^\\'\n])'/.exec(src.slice(i, i + 14));
      if (ch) { out += "'" + blank(ch[0].slice(1, -1)) + "'"; i += ch[0].length; continue; }
      out += c; i++;
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** Every out-of-line module a Rust source declares: {name} for `mod name;`, {name, path} when
 *  a #[path = "…"] attribute names the file. Inline `mod name { … }` is not a file and is
 *  skipped by the `;`. */
export function rustModsIn(src) {
  const clean = stripRust(src);
  const out = [];
  const re = /((?:#\[[^\]]*\]\s*)*)(?:pub(?:\s*\([^)]*\))?\s+)?\bmod\s+(?:r#)?([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
  let m;
  while ((m = re.exec(clean))) {
    const path = /#\[\s*path\s*=\s*"([^"]*)"\s*\]/.exec(m[1]);
    out.push(path ? { name: m[2], path: path[1] } : { name: m[2] });
  }
  return out;
}

/** Where cargo looks for `mod name;` declared in `file`. A crate root (main.rs, lib.rs, build.rs,
 *  a file directly in bin/, tests/, examples/ or benches/) and a mod.rs declare into their own
 *  folder; any other f.rs declares into f/. */
function rustCandidates(mod, file) {
  const dir = dirname(file);
  if (mod.path !== undefined) return [resolve(dir, mod.path)];
  const stem = file.replace(/^.*[\\/]/, '').replace(/\.rs$/, '');
  const root = ['main', 'lib', 'mod', 'build'].includes(stem) || /(^|[\\/])(bin|tests|examples|benches)$/.test(dir);
  const base = root ? dir : join(dir, stem);
  return [join(base, `${mod.name}.rs`), join(base, mod.name, 'mod.rs')];
}

if (process.argv.includes('--selftest')) {
  // Each case is a defect this gate either had or would have had. A gate nobody has watched
  // fail is an assertion nobody has tested, and both failure branches here were first observed
  // by accident — on profile.ts, and on this file's own header comment.
  //
  // The cases live in a JSON file rather than in this source, and that is itself one of the
  // findings. This gate scans TEXT, so a fixture written here as a string containing
  // `import x from …` is indistinguishable from a real import: when they were inline the gate
  // reported nine unresolved imports against ITSELF. JSON is not in SOURCE, so the data is
  // inert. The `new URL` below is deliberately the kind this gate does follow, so the fixture
  // file is covered by the same rule as everything else — if it is ever left untracked, a
  // clone gets a gate whose --selftest cannot run, and this gate says so.
  const CASES = JSON.parse(readFileSync(new URL('./clone-imports.cases.json', import.meta.url), 'utf8')).cases;
  if (!Array.isArray(CASES) || CASES.length < 15) { console.error('selftest fixtures missing or truncated — refusing to report a pass'); process.exit(3); }
  let pass = 0, fail = 0;
  for (const [name, src, want, lang] of CASES) {
    // a Rust case ("rs") lists its modules as mod:<name>, or path:<file> for a #[path] one
    const got = lang === 'rs' ? rustModsIn(src).map((m) => (m.path !== undefined ? `path:${m.path}` : `mod:${m.name}`)) : specifiersIn(src);
    const ok = got.length === want.length && want.every((w) => got.includes(w));
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}\n         want [${want}]  got [${got}]`); }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

function candidates(spec, fromDir) {
  const base = resolve(fromDir, spec);
  const out = [];
  for (const e of EXTS) out.push(base + e);
  if (/\.js$/.test(base)) out.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'));
  if (/\.mjs$/.test(base)) out.push(base.replace(/\.mjs$/, '.mts'));
  for (const i of INDEX) out.push(join(base, i));
  return out;
}

const problems = [];
let checked = 0;
let specs = 0;

for (const rel of sources) {
  const abs = join(ROOT, rel);
  if (!REV && !existsSync(abs)) {
    // tracked but absent from the working tree — a different defect, and a real one
    problems.push({ importer: rel, spec: '(the file itself)', kind: 'tracked-file-missing', tried: [] });
    continue;
  }
  checked++;
  const dir = dirname(abs);
  if (RUST.test(rel)) {
    for (const mod of rustModsIn(readSource(rel))) {
      specs++;
      const spec = mod.path !== undefined ? `#[path = "${mod.path}"] mod ${mod.name};` : `mod ${mod.name};`;
      const tried = rustCandidates(mod, abs);
      const hit = tried.find(fileExists);
      if (!hit) problems.push({ importer: rel, spec, kind: 'missing', tried });
      else if (!isTracked(hit)) problems.push({ importer: rel, spec, kind: 'untracked', target: relative(ROOT, hit).replace(/\\/g, '/'), tried: [] });
    }
    continue;
  }
  // ONE extractor — the same function `--selftest` exercises. This loop used to carry its own
  // copy of the pattern walk, which meant 15/15 green could sit on top of a gate that scanned
  // by different rules than the ones under test. A selftest that does not test the shipped path
  // is decoration.
  for (const spec of specifiersIn(readSource(rel))) {
    specs++;
    const tried = candidates(spec, dir);
    const hit = tried.find(fileExists);
    if (!hit) {
      problems.push({ importer: rel, spec, kind: 'missing', tried: tried.slice(0, 4) });
    } else if (!isTracked(hit)) {
      problems.push({ importer: rel, spec, kind: 'untracked', target: relative(ROOT, hit).replace(/\\/g, '/'), tried: [] });
    }
  }
}

console.log(`clone-imports${REV ? ` @ ${REV}` : ''}: ${checked} tracked source files, ${specs} relative specifiers and Rust mod declarations`);

if (!problems.length) {
  console.log('PASS — every relative import and Rust mod declaration in a tracked file resolves to a tracked file');
  process.exit(0);
}

const untracked = problems.filter((p) => p.kind === 'untracked');
const missing = problems.filter((p) => p.kind !== 'untracked');

if (untracked.length) {
  console.error(`\nFAIL — ${untracked.length} import(s) in TRACKED files resolve to files git does not carry.`);
  console.error('A clone receives the import and not the file, so it cannot build. This is the');
  console.error('defect of 157997f and 42fda0b, and it is invisible to every other check in this');
  console.error('tree because they all resolve against the working tree, where the file is present.\n');
  for (const p of untracked) console.error(`  ${p.importer}\n    imports ${p.spec}  ->  ${p.target}   (UNTRACKED)`);
  const add = [...new Set(untracked.map((p) => p.target))];
  console.error(`\n  Fix:  git add ${add.join(' ')}`);
}

if (missing.length) {
  console.error(`\nFAIL — ${missing.length} import(s) resolve to nothing at all.`);
  for (const p of missing) {
    console.error(`  ${p.importer}\n    imports ${p.spec}`);
    if (p.tried.length) console.error(`    tried: ${p.tried.map((t) => relative(ROOT, t).replace(/\\/g, '/')).join(', ')}`);
  }
}

console.error(`\nNOT CLONE-SAFE — ${problems.length} problem(s)`);
process.exit(1);
