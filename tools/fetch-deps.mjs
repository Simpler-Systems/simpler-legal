#!/usr/bin/env node
// FETCH-DEPS — obtains the build inputs this repository does not carry, checks every byte
// against a pinned sha256, and places them where the Tauri build reads them.
//
//   node tools/fetch-deps.mjs                   fetch what is absent, verify it, place it
//   node tools/fetch-deps.mjs --check           verify what is in place: no network, writes nothing
//   node tools/fetch-deps.mjs --from <dir>      read the six downloads from <dir>, not the network
//   node tools/fetch-deps.mjs --any-vc-runtime  accept a Microsoft-signed Visual C++ runtime whose
//                                               bytes are not the pinned ones (see VCRT below)
//
// WHAT IT PLACES. All of it is gitignored (.gitignore, "model weights and vendored binaries"):
//
//   app/src-tauri/binaries/node-x86_64-pc-windows-msvc.exe
//       The official Node.js v22.22.3 Windows x64 binary. tauri.conf.json bundle.externalBin
//       names it, and tauri-build refuses to compile without it, so `cargo check` in a fresh
//       clone fails until it is here (LAUNCH.md 6.6). Checked against the pin below AND against
//       the release's own SHASUMS256.txt. The pin is the sha256 of the sidecar the owner's
//       installers were built with (measured 2026-09-25): the two are the same bytes.
//   app/src-tauri/binaries/LICENSE-node.txt
//       Node's LICENSE at tag v22.22.3, with CRLF line ends: byte for byte the LICENSE inside
//       node-v22.22.3-win-x64.zip, which is what make-download-tree.mjs and derive-notice.mjs
//       expect at that path.
//   llama-cuda/
//       llama.cpp build b9222 (commit 9a532ae4b), the Windows Vulkan x64 release asset. The 22
//       files the app uses from it (llama-server.exe and 21 DLLs) are extracted from the release
//       zip; its other 20 programs, and its libomp140.x86_64.dll, are left out. Measured
//       2026-09-25: all 22 are byte-identical to the owner's llama-cuda/ ('version: 9222
//       (9a532ae4b)', built with Clang 19.1.5). Beside them: libomp140.x86_64.dll from LLVM's
//       OpenMP runtime (OMP below), llama.cpp's LICENSE at tag b9222, and the Microsoft Visual
//       C++ runtime (VCRT below).
//
// OMP. The 14 ggml-cpu-*.dll files import libomp140.x86_64.dll in their normal import table,
// so they do not load without a file of that name. The copy in llama.cpp's zip (sha256
// 9ab1cb78…, 634,936 bytes) is Microsoft's build, byte-identical to Visual Studio's
// VC\Redist\MSVC\14.44.35112\debug_nonredist\x64\Microsoft.VC143.OpenMP.LLVM copy, and
// Microsoft does not allow debug_nonredist to be distributed (licenses/msvc-runtime.txt,
// section 2). What is placed instead is Library/bin/libomp.dll from conda-forge's llvm-openmp
// 22.1.8 package (Apache-2.0 WITH LLVM-exception; licenses/llvm-openmp-LICENSE.txt), renamed
// to the name the ggml DLLs import. A .conda file is a zip holding two zstd-compressed tars,
// read here with zlib.zstdDecompressSync (present in Node v22.22.3, the version BUILDING.md
// names); a Node without it is told so, and the run stops before it downloads anything. The
// package's own licence file is checked against licenses/llvm-openmp-LICENSE.txt, so the text
// the installer carries is the text the package carries.
//
// VCRT. llama-server.exe and its DLLs import MSVCP140.dll, VCRUNTIME140.dll and
// VCRUNTIME140_1.dll, and the release zip does not carry them. The owner's llama-cuda/ holds
// the copies from Visual Studio 2022 Build Tools 17.14 (VC\Redist\MSVC\14.44.35112, file
// version 14.44.35211.0); those bytes are the pins. Microsoft publishes no download of the
// loose DLLs, so they are copied from the Visual Studio installation on this machine (which
// the Rust MSVC toolchain needs anyway), found with vswhere. A copy whose bytes match the pins
// is taken. Any other copy is refused unless --any-vc-runtime is given, and then only after
// Windows confirms a valid Authenticode signature by Microsoft Corporation; the run prints its
// version and hashes, because an installer built with it differs from the owner's in those
// three files.
//
// FAIL-CLOSED. Everything is fetched and checked before anything is written. Any hash that
// does not match its pin exits 1 with nothing placed. A file already in place that does not
// match its pin is refused, never overwritten: move it aside and run again. A file in
// llama-cuda/ that is not on the list is refused too, because tauri.conf.json bundles that
// whole folder into the installer as llama/.
//
// No npm dependency: node's own fetch, crypto and zlib. A zip is read through its central
// directory with inflateRawSync; a tar through its 512-byte headers.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';

const { inflateRawSync } = zlib;

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ── the pins ─────────────────────────────────────────────────────────────────
// `name` is the file --from expects in its folder.
const NODE = {
  version: 'v22.22.3',
  url: 'https://nodejs.org/dist/v22.22.3/win-x64/node.exe', name: 'node.exe',
  shasums: 'https://nodejs.org/dist/v22.22.3/SHASUMS256.txt', shasumsName: 'SHASUMS256.txt',
  shasumsLine: 'win-x64/node.exe',
  sha256: '780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b', size: 86969160,
  dest: 'app/src-tauri/binaries/node-x86_64-pc-windows-msvc.exe',
};
const NODE_LICENSE = {
  url: 'https://raw.githubusercontent.com/nodejs/node/v22.22.3/LICENSE', name: 'node-v22.22.3-LICENSE',
  // as the repository serves it (LF), then as node-v22.22.3-win-x64.zip holds it (CRLF)
  fetchedSha256: 'c738ae413cf561f174e34f6961f8ca458aae2369a73640dda6234c629b98bcc4', fetchedSize: 145485,
  sha256: '8cc9bb466b19fc7e7cc99d03e9df1132021fda8b01eea2624c58bb372dbef576', size: 148217,
  dest: 'app/src-tauri/binaries/LICENSE-node.txt',
};
const LLAMA = {
  build: 'b9222', commit: '9a532ae4bab1b164052ce60a738f78538b421c66', version: 'version: 9222 (9a532ae4b)',
  url: 'https://github.com/ggml-org/llama.cpp/releases/download/b9222/llama-b9222-bin-win-vulkan-x64.zip',
  name: 'llama-b9222-bin-win-vulkan-x64.zip',
  // equal to the digest GitHub publishes for this asset (api.github.com releases/tags/b9222)
  sha256: '71d896955c0ae3576f6fd147f4ca197aa6a839ed7693651c14fe74014cef954e', size: 32674762,
  dir: 'llama-cuda',
  files: [
    ['ggml.dll',                    '2995b01e97c336d53fce51ef3e42a200a13b5a3338fdcd317992e9df94b24df3', 96768],
    ['ggml-base.dll',               '1c5168bab302e850479b83e9adacc351aff8d80a7bb9b49f148e2c284241b632', 780800],
    ['ggml-cpu-alderlake.dll',      '58b891df413acc1c1e18e563307eb31c1fa09d6b1081cb796571c60e8a7e62fc', 1137152],
    ['ggml-cpu-cannonlake.dll',     '7bba583112588a5264b8156639a09f4e3e04e0e97db7d49cfad2c9e9e922a7b3', 1375744],
    ['ggml-cpu-cascadelake.dll',    '0f9efe492b112ffbce9e73a9915ba179bcf445f2787face9993e23a367f34d8b', 1361920],
    ['ggml-cpu-cooperlake.dll',     '04101428a381a60e1e0711f439aa728d6ccd6c6e429bcc79a4ea2196a5a75669', 1362432],
    ['ggml-cpu-haswell.dll',        '8c21c2a5da0fa899d6cac865cfe60ce951e8786bd07a89181d9d27854b182cbb', 1142272],
    ['ggml-cpu-icelake.dll',        '40ea2826d9f2aa1dd7b8bde7e7b20c696f511c2a2b471e7b8675c1c43da739db', 1368576],
    ['ggml-cpu-ivybridge.dll',      '3aad1ce26c6b6b17c76dc584703b6ad48928c016d04fd0a7a6db9fa7394e2dcc', 1036288],
    ['ggml-cpu-piledriver.dll',     '5a791c843f749b3cd547c9d284e3a9b44eb398d75c299a54460cbe353dba4eb3', 1037824],
    ['ggml-cpu-sandybridge.dll',    'f05d04ebb2e138a75e715d2fb4606257911f0a4996af0dd9422bca349f112666', 1016320],
    ['ggml-cpu-sapphirerapids.dll', 'b060fe3f2766d09e7ffd1a95c1ca9e881e55059c535c0824e1b4123270c4d2e7', 1637888],
    ['ggml-cpu-skylakex.dll',       '2050ca900a28ce58cc84be39646c357de248bf6dabd9db0c302876777059a3d2', 1369088],
    ['ggml-cpu-sse42.dll',          '78bb7579a2caeffb83a11282deecc78811156d3af4b3395439a8fde1e5466b01', 856064],
    ['ggml-cpu-x64.dll',            '46b13f1c3a50b35b959fc074da43f62b94b1829d58de2d36844969f66db8f481', 847872],
    ['ggml-cpu-zen4.dll',           'e1d5d64c6f1a64029d33798d5c9743aaa9829256de633c65441f7b0e6bc3bad7', 1369600],
    ['ggml-rpc.dll',                '253c9a4d40b80d22796157d6043813732247eb676655b36ff00c7b739d0f32d7', 149504],
    ['ggml-vulkan.dll',             '16aeb25db76922074408a028b3167fb7fb1ddca1f54c9f91c413e603fa7002d6', 57475584],
    ['llama.dll',                   '64adca3571a679acf920be08b2f31e30d3d0d12df6229f04872f73627700133b', 2468352],
    ['llama-common.dll',            'a2fac5854c48367f0d588401adc0280419fdc0f5d9f995d34513e4db9b990dc7', 7999488],
    ['llama-server.exe',            '0323cc4d64d5e2b2644b7589ea2175ee3551a7e591613be40b998179f8a5ec2b', 12082176],
    ['mtmd.dll',                    'd99188c0102df9a38c1b386a6e6a3a4eb305741eeb0b9c00170d544300dad157', 1269248],
  ],
};
const LLAMA_LICENSE = {
  url: 'https://raw.githubusercontent.com/ggml-org/llama.cpp/b9222/LICENSE', name: 'llama.cpp-b9222-LICENSE',
  sha256: '94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d', size: 1078,
  dest: 'llama-cuda/LICENSE',
};
// conda-forge's llvm-openmp 22.1.8, build h4fa8253_3: recipe conda-forge/openmp-feedstock at
// 7b529585913eb257eef73d51d201357f2562f9d6, from the llvm-project llvmorg-22.1.8 source zip
// (sha256 d06ea5796b0979733f454b3e3120d2db501008f20a4ef04c1619713feaba3758)
const OMP = {
  package: 'llvm-openmp 22.1.8 (conda-forge, build h4fa8253_3)',
  url: 'https://conda.anaconda.org/conda-forge/win-64/llvm-openmp-22.1.8-h4fa8253_3.conda',
  name: 'llvm-openmp-22.1.8-h4fa8253_3.conda',
  // equal to the sha256 the anaconda.org API publishes for this file
  sha256: '36951e53e6e6f75d390d04bdd460ecd055ef7c4e2167bfdc12e310efe936378a', size: 348928,
  pkgTar: 'pkg-llvm-openmp-22.1.8-h4fa8253_3.tar.zst', entry: 'Library/bin/libomp.dll',
  file: ['libomp140.x86_64.dll', 'a64c9f8ab95efcad73679113425a6c8ae770ca77db89c87f4821db44415a76c4', 671232],
  // the package's licence file, byte for byte the tracked copy the installer carries
  infoTar: 'info-llvm-openmp-22.1.8-h4fa8253_3.tar.zst', licenseEntry: 'info/licenses/openmp/LICENSE.TXT',
  license: ['licenses/llvm-openmp-LICENSE.txt', 'fdad1758a9e1f9d5a81e18879b3406772115edc92c24bfa36b70c654f325e8e4', 19741],
};
// the sha256 of the libomp140.x86_64.dll in llama.cpp's zip, Microsoft's build: named so that a
// folder still holding it is told why it is refused
const OMP_MICROSOFT = '9ab1cb787e52b2a36133899c01c1db1f876067d1471cd224ead85f40a8152b99';
const VCRT = {
  version: '14.44.35211.0', redist: '14.44.35112',
  files: [
    ['msvcp140.dll',       '0f885b509a685d2bbfa652fed26b5fb31d88fbdab0a978c641d1c7b8aa460aa9', 557728],
    ['vcruntime140.dll',   'd5e4d9a3e835fa679450145d6a7d94e36573a509317111904d9b3712c30d9066', 124544],
    ['vcruntime140_1.dll', '1f2d41c4aa5db0bc33ebf7b66d72943a817d7ce6cbe880502a9403823633093f', 49792],
  ],
};

// ── arguments ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const ANY_VCRT = args.includes('--any-vc-runtime');
const fromAt = args.indexOf('--from');
const FROM = fromAt >= 0 ? args[fromAt + 1] : null;
const known = new Set(['--check', '--any-vc-runtime', '--from']);
const stray = args.filter((a, i) => !known.has(a) && !(fromAt >= 0 && i === fromAt + 1));
if (stray.length || (fromAt >= 0 && (!FROM || FROM.startsWith('--')))) {
  console.error('usage: node tools/fetch-deps.mjs [--check] [--from <dir>] [--any-vc-runtime]');
  process.exit(2);
}
if (process.platform !== 'win32') {
  console.error('fetch-deps places Windows binaries, and the app builds on Windows only (tauri.conf.json bundle.targets is ["nsis"])');
  process.exit(2);
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const short = (h) => h.slice(0, 16);
const abs = (rel) => join(ROOT, ...rel.split('/'));

// ── what is in place ─────────────────────────────────────────────────────────
const targets = [
  { rel: NODE.dest, sha: NODE.sha256, size: NODE.size, source: 'node' },
  { rel: NODE_LICENSE.dest, sha: NODE_LICENSE.sha256, size: NODE_LICENSE.size, source: 'node-license' },
  ...LLAMA.files.map(([n, sha, size]) => ({ rel: `${LLAMA.dir}/${n}`, sha, size, source: 'llama-zip', entry: n })),
  { rel: `${LLAMA.dir}/${OMP.file[0]}`, sha: OMP.file[1], size: OMP.file[2], source: 'omp', entry: OMP.entry },
  { rel: LLAMA_LICENSE.dest, sha: LLAMA_LICENSE.sha256, size: LLAMA_LICENSE.size, source: 'llama-license' },
  ...VCRT.files.map(([n, sha, size]) => ({ rel: `${LLAMA.dir}/${n}`, sha, size, source: 'vcrt', entry: n })),
];

// Windows' own Authenticode check, through Windows PowerShell (present on every Windows).
function microsoftSigned(path) {
  const q = path.replace(/'/g, "''");
  const ps = `$s = Get-AuthenticodeSignature -LiteralPath '${q}'; $v = (Get-Item -LiteralPath '${q}').VersionInfo.FileVersion; Write-Output ('{0}|{1}|{2}' -f $s.Status, $s.SignerCertificate.Subject, $v)`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  const [status = '', subject = '', version = ''] = (r.stdout || '').trim().split('|');
  return { ok: status === 'Valid' && /(^|,\s*)O=Microsoft Corporation(,|$)/.test(subject), status: status || `powershell failed: ${(r.stderr || r.error?.message || '').trim()}`, subject, version };
}

const fail = [];
const inPlace = new Map(); // rel -> 'ok' | 'ok-unpinned' | 'absent'
for (const t of targets) {
  const p = abs(t.rel);
  if (!existsSync(p)) { inPlace.set(t.rel, 'absent'); continue; }
  const b = readFileSync(p);
  const h = sha256(b);
  if (b.length === t.size && h === t.sha) { inPlace.set(t.rel, 'ok'); continue; }
  if (t.source === 'vcrt' && ANY_VCRT) {
    const s = microsoftSigned(p);
    if (s.ok) { inPlace.set(t.rel, 'ok-unpinned'); t.note = `unpinned, file version ${s.version}, sha256 ${h}`; continue; }
    fail.push(`${t.rel} is in place, is not the pinned file, and is not signed by Microsoft (${s.status})`);
    continue;
  }
  // the zip's own libomp140.x86_64.dll is Microsoft's build, which may not be redistributed
  if (t.source === 'omp' && h === OMP_MICROSOFT) {
    fail.push(`${t.rel} is Microsoft's build of the OpenMP runtime (sha256 ${h}), the copy llama.cpp's zip carries and Microsoft does not allow to be redistributed (licenses/msvc-runtime.txt, section 2). Move it aside and run again: the run places ${OMP.package}'s instead.`);
    continue;
  }
  fail.push(`${t.rel} is in place and does not match its pin (sha256 ${h}, ${b.length} bytes; pinned ${t.sha}, ${t.size} bytes). Move it aside and run again; this script never overwrites.`);
}
// the OpenMP runtime's licence text is tracked in git, not fetched; the installer carries it
{
  const [rel, sha, size] = OMP.license;
  if (!existsSync(abs(rel))) fail.push(`${rel} is missing: it is the licence text of ${LLAMA.dir}/${OMP.file[0]}, and git carries it`);
  else {
    const b = readFileSync(abs(rel));
    if (b.length !== size || sha256(b) !== sha) fail.push(`${rel} does not match its pin (sha256 ${sha256(b)}, ${b.length} bytes; pinned ${sha}, ${size} bytes): it must be ${OMP.package}'s ${OMP.licenseEntry}, byte for byte`);
  }
}
const listed = new Set(targets.filter((t) => t.rel.startsWith(LLAMA.dir + '/')).map((t) => t.rel.slice(LLAMA.dir.length + 1)));
if (existsSync(abs(LLAMA.dir))) {
  for (const n of readdirSync(abs(LLAMA.dir))) {
    if (!listed.has(n)) fail.push(`${LLAMA.dir}/${n} is not part of the pinned build; tauri.conf.json bundles the whole folder into the installer as llama/, so move it out`);
  }
}
if (fail.length) {
  console.error('REFUSED, nothing placed:\n  - ' + fail.join('\n  - '));
  process.exit(1);
}

// ── run the two programs and read their version lines ─────────────────────────
function versions() {
  const out = [];
  const n = spawnSync(abs(NODE.dest), ['--version'], { encoding: 'utf8' });
  const nv = (n.stdout || '').trim();
  out.push({ what: NODE.dest, got: nv || `did not run: ${(n.stderr || n.error?.message || '').trim()}`, ok: nv === NODE.version });
  const l = spawnSync(abs(`${LLAMA.dir}/llama-server.exe`), ['--version'], { encoding: 'utf8' });
  const lv = /version:\s*\d+\s*\([0-9a-f]+\)/.exec((l.stdout || '') + (l.stderr || ''));
  const cc = /built with (.+)/.exec((l.stdout || '') + (l.stderr || ''));
  out.push({ what: `${LLAMA.dir}/llama-server.exe`, got: lv ? `${lv[0]}${cc ? `, built with ${cc[1].trim()}` : ''}` : `did not run (exit ${l.status}): ${((l.stderr || '') + (l.error?.message || '')).trim().split('\n').pop()}`, ok: !!lv && lv[0] === LLAMA.version });
  return out;
}
function report(placed) {
  for (const t of targets) {
    const st = placed.has(t.rel) ? 'placed' : inPlace.get(t.rel) === 'absent' ? 'ABSENT' : 'in place';
    console.log(`${st.padEnd(9)} ${t.rel.padEnd(56)} ${t.note ?? `sha256 ${short(t.sha)}… matches the pin`}`);
  }
  const v = versions();
  for (const x of v) console.log(`${x.ok ? 'runs' : 'FAIL'}      ${x.what.padEnd(56)} ${x.got}`);
  return v.every((x) => x.ok);
}
// the Visual C++ runtime files taken by --any-vc-runtime: verified by signature, not by pin
function unpinned() {
  const n = targets.filter((t) => inPlace.get(t.rel) === 'ok-unpinned' || t.note?.startsWith('UNPINNED')).length;
  return n ? ` (${n} of them the Visual C++ runtime, accepted by Microsoft's signature and not by pin)` : '';
}

const absent = targets.filter((t) => inPlace.get(t.rel) === 'absent');
if (CHECK) {
  if (absent.length) {
    console.error(`CHECK FAILED: ${absent.length} of ${targets.length} files are absent:\n  - ${absent.map((t) => t.rel).join('\n  - ')}\nrun: node tools/fetch-deps.mjs`);
    process.exit(1);
  }
  const ran = report(new Set());
  console.log(`\n${targets.length} of ${targets.length} files in place and verified${unpinned()}${ran ? '' : '; a program did not report its pinned version'}`);
  process.exit(ran ? 0 : 1);
}
if (!absent.length) {
  const ran = report(new Set());
  console.log(`\nnothing to fetch: all ${targets.length} files are in place and verified${unpinned()}`);
  process.exit(ran ? 0 : 1);
}

// ── fetch and verify, in memory ────────────────────────────────────────────────
// the OpenMP runtime comes in a .conda package, whose tars are zstd-compressed: a Node whose
// zlib cannot read zstd is told so before anything is downloaded
if (absent.some((t) => t.source === 'omp') && typeof zlib.zstdDecompressSync !== 'function') {
  console.error(`REFUSED, nothing placed: ${absent.find((t) => t.source === 'omp').rel} comes from ${OMP.name}, whose contents are zstd-compressed, `
    + `and this Node (${process.version}, ${process.execPath}) has no zlib.zstdDecompressSync. Run the script with a Node 22 that has it: `
    + 'v22.22.3, the version BUILDING.md names and the one this script places as the app\'s sidecar, does.');
  process.exit(1);
}
// --from: every download the absent files need must be in the folder, all named at once
if (FROM) {
  const sources = new Set(absent.map((t) => t.source));
  const wanted = [
    ...(sources.has('node') ? [[NODE.url, NODE.name], [NODE.shasums, NODE.shasumsName]] : []),
    ...(sources.has('node-license') ? [[NODE_LICENSE.url, NODE_LICENSE.name]] : []),
    ...(sources.has('llama-zip') ? [[LLAMA.url, LLAMA.name]] : []),
    ...(sources.has('omp') ? [[OMP.url, OMP.name]] : []),
    ...(sources.has('llama-license') ? [[LLAMA_LICENSE.url, LLAMA_LICENSE.name]] : []),
  ];
  const lacking = wanted.filter(([, name]) => !existsSync(join(resolve(FROM), name)));
  if (lacking.length) {
    console.error(`REFUSED, nothing placed: ${lacking.length} of the ${wanted.length} downloads this run needs are not in ${resolve(FROM)}:\n`
      + lacking.map(([url, name]) => `  - save ${url}\n    as ${join(resolve(FROM), name)}`).join('\n'));
    process.exit(1);
  }
}
async function obtain(url, name, mb) {
  if (FROM) {
    const p = join(resolve(FROM), name);
    if (!existsSync(p)) throw new Error(`${p} is absent: download ${url} and save it under that name`);
    console.log(`reading   ${p}`);
    return readFileSync(p);
  }
  console.log(`fetching  ${url}${mb ? ` (${mb} MB)` : ''}`);
  let r;
  try {
    r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20 * 60_000) });
  } catch (e) {
    throw new Error(`${url}: ${e.cause?.message ?? e.message}. Behind a proxy or offline: download it by hand, save it as <dir>\\${name}, and run with --from <dir>`);
  }
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
function pinned(label, buf, sha, size) {
  const h = sha256(buf);
  if (h !== sha || buf.length !== size) throw new Error(`${label}: sha256 ${h} (${buf.length} bytes) does not match the pin ${sha} (${size} bytes)`);
  return h;
}
// the zip's central directory: name -> inflated bytes, for the names asked for
function unzip(buf, want) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip: no end-of-central-directory record');
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip central directory is damaged');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nl);
    p += 46 + nl + xl + cl;
    if (!want.has(name)) continue;
    if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error(`zip entry ${name}: damaged local header`);
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(start, start + csize);
    if (method === 8) out.set(name, inflateRawSync(raw));
    else if (method === 0) out.set(name, Buffer.from(raw));
    else throw new Error(`zip entry ${name}: compression method ${method} is not read here`);
  }
  return out;
}
// a tar's regular files: name -> bytes, for the names asked for. POSIX ustar, with pax path
// records (what conda-build writes) and GNU long names.
function untar(buf, want) {
  const out = new Map();
  let longName = null, paxPath = null;
  for (let p = 0; p + 512 <= buf.length;) {
    const h = buf.subarray(p, p + 512);
    if (h.every((x) => x === 0)) break;
    const field = (o, n) => { const s = h.subarray(o, o + n); const z = s.indexOf(0); return s.toString('utf8', 0, z < 0 ? n : z); };
    const size = parseInt(field(124, 12).trim() || '0', 8);
    if (!Number.isSafeInteger(size)) throw new Error(`tar header at byte ${p}: unreadable size`);
    const type = h[156] ? String.fromCharCode(h[156]) : '0';
    const body = buf.subarray(p + 512, p + 512 + size);
    if (body.length !== size) throw new Error(`tar entry at byte ${p} is cut short`);
    p += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = body.toString('utf8').replace(/\0[\s\S]*$/, ''); continue; }
    if (type === 'x') { const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8')); paxPath = m ? m[1] : null; continue; }
    if (type === 'g') continue;
    const prefix = h.toString('latin1', 257, 263) === 'ustar\0' ? field(345, 155) : '';
    const name = longName ?? paxPath ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = paxPath = null;
    if (type === '0' && want.has(name)) out.set(name, Buffer.from(body));
  }
  return out;
}
function cmpVersion(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}
// every VC\Redist\MSVC\<version>\x64\Microsoft.VC*.CRT folder of every Visual Studio install
function vcrtFolders() {
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const vswhere = join(pf86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!existsSync(vswhere)) return { folders: [], why: `vswhere.exe is not at ${vswhere}: no Visual Studio installation was found` };
  const r = spawnSync(vswhere, ['-all', '-products', '*', '-prerelease', '-property', 'installationPath'], { encoding: 'utf8' });
  const folders = [];
  for (const inst of (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    const base = join(inst, 'VC', 'Redist', 'MSVC');
    if (!existsSync(base)) continue;
    for (const ver of readdirSync(base).filter((v) => /^\d+\.\d+\.\d+$/.test(v))) {
      const x64 = join(base, ver, 'x64');
      if (!existsSync(x64)) continue;
      for (const crt of readdirSync(x64).filter((c) => /^Microsoft\.VC\d+\.CRT$/.test(c))) folders.push({ ver, dir: join(x64, crt) });
    }
  }
  folders.sort((a, b) => cmpVersion(b.ver, a.ver));
  return { folders, why: folders.length ? '' : 'no Visual Studio installation has a VC\\Redist\\MSVC\\<version>\\x64\\Microsoft.VC*.CRT folder (install the "Desktop development with C++" workload)' };
}

const got = new Map(); // rel -> Buffer, verified
const errors = [];
const need = (source) => absent.filter((t) => t.source === source);
async function step(label, fn) { try { await fn(); } catch (e) { errors.push(`${label}: ${e.message}`); } }

await step('Node.js', async () => {
  if (!need('node').length) return;
  const exe = await obtain(NODE.url, NODE.name, Math.round(NODE.size / 1048576));
  pinned(NODE.dest, exe, NODE.sha256, NODE.size);
  const sums = (await obtain(NODE.shasums, NODE.shasumsName)).toString('utf8');
  const line = sums.split('\n').map((l) => l.trim().split(/\s+/)).find((f) => f[1] === NODE.shasumsLine);
  if (!line) throw new Error(`SHASUMS256.txt has no line for ${NODE.shasumsLine}`);
  if (line[0] !== NODE.sha256) throw new Error(`SHASUMS256.txt says ${line[0]} for ${NODE.shasumsLine}; the pin is ${NODE.sha256}`);
  got.set(NODE.dest, exe);
});
await step('Node.js LICENSE', async () => {
  if (!need('node-license').length) return;
  const lf = await obtain(NODE_LICENSE.url, NODE_LICENSE.name);
  pinned(`${NODE_LICENSE.url}`, lf, NODE_LICENSE.fetchedSha256, NODE_LICENSE.fetchedSize);
  if (lf.includes(13)) throw new Error('the fetched LICENSE already has CR line ends');
  const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'), 'utf8');
  pinned(NODE_LICENSE.dest, crlf, NODE_LICENSE.sha256, NODE_LICENSE.size);
  got.set(NODE_LICENSE.dest, crlf);
});
await step('llama.cpp', async () => {
  const want = need('llama-zip');
  if (!want.length) return;
  const zip = await obtain(LLAMA.url, LLAMA.name, Math.round(LLAMA.size / 1048576));
  pinned(LLAMA.name, zip, LLAMA.sha256, LLAMA.size);
  const files = unzip(zip, new Set(want.map((t) => t.entry)));
  for (const t of want) {
    const b = files.get(t.entry);
    if (!b) throw new Error(`${LLAMA.name} has no entry ${t.entry}`);
    pinned(`${t.rel} (from ${LLAMA.name})`, b, t.sha, t.size);
    got.set(t.rel, b);
  }
});
await step('LLVM OpenMP runtime', async () => {
  const want = need('omp');
  if (!want.length) return;
  const conda = await obtain(OMP.url, OMP.name);
  pinned(OMP.name, conda, OMP.sha256, OMP.size);
  const inner = unzip(conda, new Set([OMP.pkgTar, OMP.infoTar]));
  const tarOf = (name) => {
    const zst = inner.get(name);
    if (!zst) throw new Error(`${OMP.name} has no entry ${name}`);
    return zlib.zstdDecompressSync(zst);
  };
  const dll = untar(tarOf(OMP.pkgTar), new Set([OMP.entry])).get(OMP.entry);
  if (!dll) throw new Error(`${OMP.name} has no ${OMP.entry} in ${OMP.pkgTar}`);
  const [, sha, size] = OMP.file;
  pinned(`${OMP.entry} (from ${OMP.name})`, dll, sha, size);
  // the package's licence must be the text licenses/ carries for it
  const lic = untar(tarOf(OMP.infoTar), new Set([OMP.licenseEntry])).get(OMP.licenseEntry);
  if (!lic) throw new Error(`${OMP.name} has no ${OMP.licenseEntry} in ${OMP.infoTar}`);
  const [licRel, licSha, licSize] = OMP.license;
  pinned(`${OMP.licenseEntry} (from ${OMP.name})`, lic, licSha, licSize);
  if (!existsSync(abs(licRel)) || !readFileSync(abs(licRel)).equals(lic)) throw new Error(`${licRel} is absent or is not the package's ${OMP.licenseEntry}; the installer would carry a licence text that is not this runtime's`);
  for (const t of want) { got.set(t.rel, dll); t.note = `sha256 ${short(sha)}… matches the pin (${OMP.entry} from ${OMP.package})`; }
});
await step('llama.cpp LICENSE', async () => {
  if (!need('llama-license').length) return;
  const b = await obtain(LLAMA_LICENSE.url, LLAMA_LICENSE.name);
  pinned(LLAMA_LICENSE.url, b, LLAMA_LICENSE.sha256, LLAMA_LICENSE.size);
  got.set(LLAMA_LICENSE.dest, b);
});
await step('Visual C++ runtime', async () => {
  const want = need('vcrt');
  if (!want.length) return;
  const { folders, why } = vcrtFolders();
  if (!folders.length) throw new Error(why);
  const read = folders.map((f) => ({ ...f, bytes: new Map(want.map((t) => [t.entry, existsSync(join(f.dir, t.entry)) ? readFileSync(join(f.dir, t.entry)) : null])) }));
  const exact = read.find((f) => want.every((t) => { const b = f.bytes.get(t.entry); return b && b.length === t.size && sha256(b) === t.sha; }));
  if (exact) {
    for (const t of want) { got.set(t.rel, exact.bytes.get(t.entry)); t.note = `sha256 ${short(t.sha)}… matches the pin (from ${exact.dir})`; }
    return;
  }
  const found = read.map((f) => `${f.dir}`).join('; ');
  if (!ANY_VCRT) {
    throw new Error(`no Visual Studio installation here holds the pinned runtime (file version ${VCRT.version}, from the redist folder ${VCRT.redist}). Found: ${found}. `
      + 'Run again with --any-vc-runtime to take the newest one after a Microsoft signature check; the installer you build will then differ from the pinned build in these three files.');
  }
  const pick = read.find((f) => want.every((t) => f.bytes.get(t.entry)));
  if (!pick) throw new Error(`no Visual Studio redist folder holds all of ${want.map((t) => t.entry).join(', ')}. Found: ${found}`);
  for (const t of want) {
    const b = pick.bytes.get(t.entry);
    got.set(t.rel, b);
    if (b.length === t.size && sha256(b) === t.sha) { t.note = `sha256 ${short(t.sha)}… matches the pin (from ${pick.dir})`; continue; }
    const s = microsoftSigned(join(pick.dir, t.entry));
    if (!s.ok) throw new Error(`${join(pick.dir, t.entry)} is not validly signed by Microsoft Corporation (${s.status} ${s.subject})`);
    t.note = `UNPINNED: file version ${s.version}, sha256 ${sha256(b)}, signed by Microsoft (from ${pick.dir})`;
  }
});

if (errors.length) {
  console.error('\nREFUSED, nothing placed:\n  - ' + errors.join('\n  - '));
  process.exit(1);
}
const missing = absent.filter((t) => !got.has(t.rel));
if (missing.length) { console.error(`internal: ${missing.map((t) => t.rel).join(', ')} verified by nothing`); process.exit(1); }

// ── place: write every file beside its target, then rename them all ────────────
const partial = (rel) => abs(rel) + '.fetch-partial';
try {
  for (const [rel, b] of got) { mkdirSync(dirname(abs(rel)), { recursive: true }); writeFileSync(partial(rel), b); }
  for (const rel of got.keys()) renameSync(partial(rel), abs(rel));
} catch (e) {
  for (const rel of got.keys()) rmSync(partial(rel), { force: true });
  console.error(`could not write: ${e.message}`);
  process.exit(1);
}
for (const rel of got.keys()) {
  const t = targets.find((x) => x.rel === rel);
  const b = readFileSync(abs(rel));
  if (!t.note?.startsWith('UNPINNED') && (sha256(b) !== t.sha || statSync(abs(rel)).size !== t.size)) {
    console.error(`${rel} does not read back as written`); process.exit(1);
  }
}
const ran = report(new Set(got.keys()));
console.log(`\n${got.size} placed, ${targets.length - got.size} already in place; ${targets.length} files verified${unpinned()}${ran ? '' : '; a program did not report its pinned version'}`);
process.exit(ran ? 0 : 1);
