// make-download-tree.mjs — assembles the distributable tree: a sanitised sibling of this
// repository holding the app, the frozen engine's serving half, the llama.cpp server build
// and the Node runtime the app starts the engine with — and nothing of the lab (no corpus,
// no benchmark, no gold, no fetched judgments, no corpus-building scripts). Everything copied
// is named in the list below; a file in the destination that this list does not produce
// fails the run (a stale tree is not a clean tree).
//
//   node tools/make-download-tree.mjs --dest <dir> [--node-license <path>]
//
// Afterwards tools/derive-notice.mjs writes and checks the tree's NOTICE. The tree ships the
// llama.cpp build and the Node runtime, which a clone of the repository does not, so its
// NOTICE is derived from its own contents, never copied from the repository's.
//
// The licence texts of both come from licenses/, where the repository tracks them with their
// source and sha256 (licenses/README.md). The run fails when the llama-server or Node binary
// it is about to ship is not the version those texts were taken for, and when a LICENSE file
// already beside either one says something else. --node-license names such a file to compare
// (fetch-deps.mjs places Node's at app/src-tauri/binaries/LICENSE-node.txt, with CRLF ends);
// it is compared, line endings aside, and the text the tree gets is licenses/node-LICENSE.txt.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = flag('--dest') && resolve(flag('--dest'));
if (!DEST) { console.error('usage: node tools/make-download-tree.mjs --dest <dir>'); process.exit(2); }
if (DEST === SRC || DEST.startsWith(SRC + '\\') || DEST.startsWith(SRC + '/')) { console.error('the destination must be outside the repository'); process.exit(2); }
const NODE_LICENSE_GIVEN = flag('--node-license');
const LIC = { llama: 'licenses/llama.cpp-LICENSE.txt', node: 'licenses/node-LICENSE.txt', readme: 'licenses/README.md' };
const fail = [];

// ── the list ────────────────────────────────────────────────────────────────
const FILES = [
  'LICENSE', 'FREEZE.md', 'MODEL_DISCOVERY.md', 'SECURITY.md', 'PRIVACY.md',
  // the frozen engine's serving half: exactly what app/src-tauri/tauri.conf.json bundles
  'serve-legal.mjs', 'strip-batch.mjs', 'apply-v2.mjs', 'apply-ln.mjs', 'apply-lq.mjs', 'locate-model.mjs',
  'tools/launch-server.cmd', 'tools/launch-server.sh', 'tools/derive-notice.mjs',
  'pii-bench/vocab-quasi.json', 'pii-bench/vocab-keep.json',
  'app/frontend/index.html', 'app/frontend/package-lock.json', 'app/frontend/tsconfig.json', 'app/frontend/vite.config.ts',
  'app/src-tauri/build.rs', 'app/src-tauri/Cargo.toml', 'app/src-tauri/Cargo.lock', 'app/src-tauri/tauri.conf.json',
  // the installer's licence page (bundle.licenseFile): LICENSE, then the section on the
  // Microsoft files in llama-cuda/; tools/derive-notice.mjs checks it in the tree too
  'app/src-tauri/installer-licence.txt',
  'app/src-tauri/binaries/node-x86_64-pc-windows-msvc.exe',
];
const DIRS = [
  'lib-core', 'lib-legal',
  'app/frontend/public', 'app/frontend/src', 'app/frontend/test',
  'app/src-tauri/capabilities', 'app/src-tauri/icons', 'app/src-tauri/src',
  'llama-cuda',
  // the licence texts the installer carries (tauri.conf.json bundles this folder as licenses/)
  'licenses',
];
// generated here, not copied
const GENERATED = ['app/frontend/package.json', 'llama-cuda/LICENSE', 'app/src-tauri/binaries/LICENSE-node.txt', 'README.md', 'THIRD_PARTY_NOTICES.md', 'NOTICE'];
// never copied out of a directory; and, in the destination, never counted as stale
const SKIP_DIR = new Set(['node_modules', 'dist', 'target', '.vite', 'gen', 'raw', '_serve']);
const skipFile = (name) => /\.(log|tsbuildinfo)$/.test(name);

// ── preconditions ───────────────────────────────────────────────────────────
for (const f of FILES) if (!existsSync(join(SRC, f))) fail.push(`missing in the repository: ${f}`);
for (const d of DIRS) if (!existsSync(join(SRC, d))) fail.push(`missing in the repository: ${d}/`);
for (const f of Object.values(LIC)) if (!existsSync(join(SRC, f))) fail.push(`missing in the repository: ${f}`);
if (NODE_LICENSE_GIVEN && !existsSync(NODE_LICENSE_GIVEN)) fail.push(`--node-license: no file at ${NODE_LICENSE_GIVEN}`);
// the Cases lane reads the 99 public-domain opinions from public/cases/, which sync-viewer.mjs
// copies out of corpus/ and newcases/ — the tree carries the copies, never the corpus folders
const opinions = ['corpus', 'newcases'].flatMap((d) => readdirSync(join(SRC, d)).filter((f) => f.endsWith('.txt')));
const cases = existsSync(join(SRC, 'app/frontend/public/cases')) ? readdirSync(join(SRC, 'app/frontend/public/cases')).filter((f) => f.endsWith('.txt')) : [];
if (cases.length !== opinions.length) fail.push(`app/frontend/public/cases holds ${cases.length} opinions, the corpus ${opinions.length} — run node sync-viewer.mjs first`);
if (!existsSync(join(SRC, 'app/frontend/public/synergy.html'))) fail.push('app/frontend/public/synergy.html missing — run node sync-viewer.mjs first');
const llamaFiles = readdirSync(join(SRC, 'llama-cuda'));
if (!llamaFiles.includes('llama-server.exe') || !llamaFiles.includes('ggml-vulkan.dll')) fail.push('llama-cuda/ is not a llama-server Vulkan build');
// libomp140.x86_64.dll must be the LLVM OpenMP runtime tools/fetch-deps.mjs pins (conda-forge's
// llvm-openmp), never the copy in llama.cpp's zip, which is Microsoft's build and may not be
// redistributed (licenses/msvc-runtime.txt, section 2); the notices below say it is LLVM's
const OMP_NAME = 'libomp140.x86_64.dll';
const ompPin = (/file: \['libomp140\.x86_64\.dll', '([0-9a-f]{64})'/.exec(existsSync(join(SRC, 'tools/fetch-deps.mjs')) ? readFileSync(join(SRC, 'tools/fetch-deps.mjs'), 'utf8') : '') ?? [])[1];
if (!ompPin) fail.push(`tools/fetch-deps.mjs no longer pins ${OMP_NAME}; the tree's notices would name an OpenMP runtime nothing checks`);
else if (!llamaFiles.includes(OMP_NAME)) fail.push(`llama-cuda/${OMP_NAME} is missing; the ggml-cpu libraries do not load without it (run node tools/fetch-deps.mjs)`);
else {
  const h = createHash('sha256').update(readFileSync(join(SRC, 'llama-cuda', OMP_NAME))).digest('hex');
  if (h !== ompPin) fail.push(`llama-cuda/${OMP_NAME} has sha256 ${h}, not the LLVM OpenMP runtime tools/fetch-deps.mjs pins (${ompPin})${h === '9ab1cb787e52b2a36133899c01c1db1f876067d1471cd224ead85f40a8152b99' ? ': it is Microsoft\'s build from llama.cpp\'s zip, which may not be redistributed' : ''}; move it aside and run node tools/fetch-deps.mjs`);
}
if (fail.length) { console.error('FAIL:\n  - ' + fail.join('\n  - ')); process.exit(1); }

// the versions the notices state are read from the binaries that ship, not typed in
// llama-server prints its version line on stderr
const llamaVersion = (() => { const r = spawnSync(join(SRC, 'llama-cuda/llama-server.exe'), ['--version'], { encoding: 'utf8' }); return (r.stdout || '') + (r.stderr || ''); })();
const llamaBuild = /version:\s*(\d+)\s*\(([0-9a-f]+)\)/.exec(llamaVersion);
const llamaCompiler = /built with (.+)/.exec(llamaVersion);
if (!llamaBuild) { console.error('could not read the llama-server build number from --version:\n' + llamaVersion); process.exit(1); }
const nodeVersion = execFileSync(join(SRC, 'app/src-tauri/binaries/node-x86_64-pc-windows-msvc.exe'), ['--version'], { encoding: 'utf8' }).trim();
// the versions licenses/README.md says its llama.cpp and Node texts were taken for
const licReadme = readFileSync(join(SRC, LIC.readme), 'utf8');
const wantLlama = /build (\d+) \(commit `([0-9a-f]+)`\)/.exec(licReadme);
const wantNode = /The Node\.js runtime, (v\d+\.\d+\.\d+)/.exec(licReadme);
if (!wantLlama || !wantNode) fail.push(`${LIC.readme} no longer states the llama.cpp build and Node version its texts were taken for`);
else {
  if (llamaBuild[1] !== wantLlama[1] || !wantLlama[2].startsWith(llamaBuild[2])) fail.push(`llama-cuda/llama-server.exe is build ${llamaBuild[1]} (${llamaBuild[2]}); the llama.cpp licence texts in licenses/ are for build ${wantLlama[1]} (${wantLlama[2]})`);
  if (nodeVersion !== wantNode[1]) fail.push(`the Node sidecar is ${nodeVersion}; licenses/node-LICENSE.txt is Node ${wantNode[1]}'s`);
}
const lf = (s) => s.replace(/\r\n/g, '\n');
const llamaLicenseText = readFileSync(join(SRC, LIC.llama), 'utf8');
const nodeLicenseText = readFileSync(join(SRC, LIC.node), 'utf8');
if (!/Node\.js is licensed for use as follows/.test(nodeLicenseText)) fail.push(`${LIC.node} does not read like Node's LICENSE file`);
if (existsSync(join(SRC, 'llama-cuda/LICENSE')) && lf(readFileSync(join(SRC, 'llama-cuda/LICENSE'), 'utf8')) !== lf(llamaLicenseText)) fail.push(`llama-cuda/LICENSE differs from ${LIC.llama}`);
if (NODE_LICENSE_GIVEN && lf(readFileSync(NODE_LICENSE_GIVEN, 'utf8')) !== lf(nodeLicenseText)) fail.push(`${NODE_LICENSE_GIVEN} differs from ${LIC.node}`);
if (fail.length) { console.error('FAIL:\n  - ' + fail.join('\n  - ')); process.exit(1); }

// ── copy ────────────────────────────────────────────────────────────────────
const produced = new Set();
const rel = (p) => p.slice(DEST.length + 1).replace(/\\/g, '/');
mkdirSync(DEST, { recursive: true });
for (const f of FILES) {
  mkdirSync(dirname(join(DEST, f)), { recursive: true });
  copyFileSync(join(SRC, f), join(DEST, f));
  produced.add(f);
}
for (const d of DIRS) {
  cpSync(join(SRC, d), join(DEST, d), {
    recursive: true,
    filter: (src) => { const name = src.slice(src.lastIndexOf('\\') + 1).slice(src.lastIndexOf('/') + 1); return !SKIP_DIR.has(name) && !skipFile(name); },
  });
}
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP_DIR.has(name)) walk(p); }
    else if (DIRS.some((d) => rel(p).startsWith(d + '/')) && existsSync(join(SRC, rel(p)))) produced.add(rel(p));
  }
})(DEST);

// ── generated files ─────────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(SRC, 'app/frontend/package.json'), 'utf8'));
// predev/prebuild run sync-viewer.mjs, which copies out of corpus/ — folders this tree does
// not have. The copies it makes (public/cases, public/synergy.html) are already here.
delete pkg.scripts.predev;
delete pkg.scripts.prebuild;
writeFileSync(join(DEST, 'app/frontend/package.json'), JSON.stringify(pkg, null, 2) + '\n');

// until 2026-09-25 this was a typed-in MIT text dated 2023-2024; build 9222's own LICENSE
// says 2023-2026, and the tree now gets that file's bytes
writeFileSync(join(DEST, 'llama-cuda/LICENSE'), llamaLicenseText);
writeFileSync(join(DEST, 'app/src-tauri/binaries/LICENSE-node.txt'), nodeLicenseText);

const dlls = llamaFiles.filter((f) => f.endsWith('.dll'));
// the DLLs that came from llama.cpp's release zip: not LLVM's libomp, not the Visual C++ runtime
const zipDlls = dlls.filter((f) => f !== OMP_NAME && !/^(msvcp140|vcruntime140|vcruntime140_1)\.dll$/i.test(f));
const plex = readdirSync(join(SRC, 'app/frontend/public/fonts')).filter((f) => f.endsWith('.woff2'));
const count = (dir, re) => readdirSync(join(SRC, dir)).filter((f) => re.test(f)).length;
writeFileSync(join(DEST, 'THIRD_PARTY_NOTICES.md'), `# Third-party notices — the distributable tree

The **code** in this tree is Apache-2.0 licensed (see \`LICENSE\` and \`NOTICE\`, © 2026 Simpler
Terminal Value Systems Pte Ltd). \`NOTICE\` is derived from this tree's contents by
\`tools/derive-notice.mjs\`, which also checks every path and count stated below against the
tree. This tree is assembled from the development repository by that repository's
\`make-download-tree.mjs\` from an explicit list; the components below are what that list brings
along. The licence texts the installer carries are in \`licenses/\`, and
\`licenses/README.md\` gives the source and sha256 of each.

## The model weights — Google Gemma 4 E2B (not in this tree)

The app accepts one model file, \`gemma-4-E2B_q4_0-it.gguf\`, sha256
\`3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd\`, 3,349,514,112 bytes
(\`app/src-tauri/src/main.rs\`), and refuses a file whose sha256 differs, whatever it is named.
Google publishes it on Hugging Face; this URL names the exact file by revision:

<https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/69536a21d70340464240401ba38223d805f6a709/gemma-4-E2B_q4_0-it.gguf>

The file of the same name on that repository's main branch has been a different file since
2026-07-17, and the app refuses it. The model card states its licence as Apache-2.0
(<https://ai.google.dev/gemma/docs/gemma_4_license>). **The weights are not redistributed
here** and not in the installer: the app looks for a copy the user already has, by sha256
(\`locate-model.mjs\`, \`MODEL_DISCOVERY.md\`), and does not download it.

## The inference server — llama.cpp (ships here)

\`llama-cuda/\` holds a stock llama.cpp Windows release build — \`llama-server.exe\` and its
${zipDlls.length} DLLs, build ${llamaBuild[1]} (${llamaBuild[2]}), ${llamaCompiler ? llamaCompiler[1].trim() : 'compiler not stated'} — from
[github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp), **MIT**, © The ggml
authors. The licence text is at \`llama-cuda/LICENSE\` and \`licenses/llama.cpp-LICENSE.txt\`
(the same bytes: that build's own LICENSE). Compiled into its libraries, with the texts the
build embeds in \`llama-common.dll\`: nlohmann/json (\`licenses/llama.cpp-jsonhpp-LICENSE.txt\`),
cpp-httplib (\`licenses/llama.cpp-cpp-httplib-LICENSE.txt\`) and BoringSSL
(\`licenses/llama.cpp-BoringSSL-LICENSE.txt\`). \`llama-server.exe\` also carries a web page built
from npm packages in the tools/ui folder of llama.cpp's repository; their licence texts are in
\`licenses/llama.cpp-webui-npm-packages.txt\`, which records the sha256 of the server it was
taken from. The folder name is historical: the build is the
Vulkan one (\`ggml-vulkan.dll\`; there is no CUDA library in it), and the app's configuration
(\`app/src-tauri/tauri.conf.json\`) bundles the folder as \`llama/\` beside the app. The packaged
app starts it only through the frozen launcher \`tools/launch-server.cmd\`.

Beside that build, \`libomp140.x86_64.dll\` is the LLVM project's OpenMP runtime, which the
ggml-cpu libraries import: the libomp.dll of the conda-forge package llvm-openmp
22.1.8 (build h4fa8253_3), under the file name they import. **Apache-2.0 with LLVM
Exceptions**; the text is \`licenses/llvm-openmp-LICENSE.txt\`. llama.cpp's own release zip
carries a file of that name too, but it is Microsoft's build, which Microsoft does not allow to
be redistributed, and it is not in this tree (\`licenses/msvc-runtime.txt\`, section 2).

Also beside it: the Microsoft Visual C++ runtime (\`msvcp140.dll\`, \`vcruntime140.dll\`,
\`vcruntime140_1.dll\`), Microsoft's, under Microsoft's terms and not Apache-2.0.
\`licenses/msvc-runtime.txt\` says where each comes from and quotes what Microsoft says about
redistributing them. Microsoft's terms require the people who install them to accept terms that
protect them, so the installer's licence page (\`app/src-tauri/installer-licence.txt\`) is
\`LICENSE\` followed by a section with those terms; there is no end-user licence for this
product's own code.

## The Node.js runtime (ships here)

\`app/src-tauri/binaries/node-x86_64-pc-windows-msvc.exe\` is the unmodified official Node.js
${nodeVersion} Windows x64 binary. The packaged app bundles it as \`node.exe\` beside itself (a
Tauri sidecar) and uses it for one thing: running the frozen engine's adapter
(\`serve-legal.mjs\`) and the stages it spawns. **MIT**, © Node.js contributors, together with
the licences of the components Node bundles (V8, OpenSSL, ICU, zlib, libuv, …; npm is not
shipped) — all in \`licenses/node-LICENSE.txt\` (Node's LICENSE at tag ${nodeVersion}), copied
here as \`app/src-tauri/binaries/LICENSE-node.txt\`.

## Compiled into the app — Rust crates and npm packages

\`licenses/rust-crates.txt\` and \`licenses/npm-packages.txt\` hold the licence texts of the Rust
crates the app's executable links and the npm packages its window's code is bundled from,
generated from \`app/src-tauri/Cargo.lock\` and \`app/frontend/package-lock.json\`. Each records
the sha256 of its lockfile, and \`tools/derive-notice.mjs\` fails when they no longer match.
The crates under MPL-2.0 are used unmodified; each one's source is published on crates.io at
the version listed.

The executable also links a prebuilt library: Microsoft's WebView2 loader,
\`WebView2LoaderStatic.lib\`, which the \`webview2-com-sys\` crate carries and its build links in.
It is byte-identical to the copy in the NuGet package Microsoft.Web.WebView2 1.0.3650.58, whose
licence (BSD-style, © Microsoft Corporation) is \`licenses/Microsoft.Web.WebView2-LICENSE.txt\`
and whose notices file is \`licenses/Microsoft.Web.WebView2-NOTICE.txt\`.

## The setup program — NSIS and Tauri's plug-in

The installer is built by Tauri's bundler from NSIS 3.11 (\`licenses/NSIS-COPYING.txt\`) and
carries Tauri's \`nsis_tauri_utils.dll\` plug-in (\`licenses/nsis_tauri_utils-LICENSE_MIT.txt\`,
\`licenses/nsis_tauri_utils-LICENSE_APACHE-2.0.txt\`).

## Web fonts — IBM Plex (ships here)

IBM Plex latin subsets, © 2017 IBM Corp. with Reserved Font Name "Plex", under the
**SIL Open Font License 1.1**. Self-hosted so the app makes no external font request.
\`app/frontend/public/fonts/\` — ${plex.length} \`.woff2\` (${plex.map((f) => f.replace(/^IBMPlex|-Latin1\.woff2$/g, '')).join(', ')});
the full OFL-1.1 text ships beside them as \`app/frontend/public/fonts/LICENSE.txt\`, a verbatim
copy of upstream [IBM/plex LICENSE.txt](https://github.com/IBM/plex/blob/master/LICENSE.txt).
Referenced from \`app/frontend/src/styles/fonts.css\`.

## PDF rendering — pdf.js and its vendored data files (data files ship here)

PDF text extraction uses **pdf.js** (\`pdfjs-dist\`, **Apache-2.0**, © Mozilla Foundation and
contributors, [github.com/mozilla/pdf.js](https://github.com/mozilla/pdf.js)), an npm
dependency fetched at build time and bundled into the app window's code (its licence text is
in \`licenses/npm-packages.txt\`) — no pdf.js source is in this tree. Its **runtime data files
are** here, so that the app resolves CJK encodings and standard fonts locally instead of
fetching them:

| Vendored under \`app/frontend/public/pdfjs/\` | Count | Terms | License text in tree |
|---|---|---|---|
| \`cmaps/*.bcmap\` — Adobe CMap resources | ${count('app/frontend/public/pdfjs/cmaps', /\.bcmap$/)} | BSD-3-Clause, © 1990-2009 Adobe Systems Incorporated | [\`cmaps/LICENSE\`](app/frontend/public/pdfjs/cmaps/LICENSE) |
| \`standard_fonts/Foxit*.pfb\` — Foxit base-14 substitutes | ${count('app/frontend/public/pdfjs/standard_fonts', /^Foxit.*\.pfb$/)} | BSD-3-Clause, © 2014 PDFium Authors | [\`standard_fonts/LICENSE_FOXIT\`](app/frontend/public/pdfjs/standard_fonts/LICENSE_FOXIT) |
| \`standard_fonts/LiberationSans-*.ttf\` | ${count('app/frontend/public/pdfjs/standard_fonts', /^LiberationSans-.*\.ttf$/)} | SIL OFL 1.1, © 2012 Red Hat, Inc.; digitized data © 2010 Google Corporation | [\`standard_fonts/LICENSE_LIBERATION\`](app/frontend/public/pdfjs/standard_fonts/LICENSE_LIBERATION) |

Those three LICENSE files came from the pdf.js distribution and are shipped unmodified.

## Public-domain opinions the Cases lane reads (ship here)

\`app/frontend/public/cases/\` — ${cases.length} full-length F.3d opinions from the
**Caselaw Access Project** static archive (<https://static.case.law/>), **public domain**. Each
file carries its court, date, citation and CAP id in its header. They are byte copies of the
development repository's corpus; the corpus folders themselves, the corpus-building scripts
and the provenance manifest are not in this tree.

## What is deliberately NOT in this tree

- **No OCR.** The app has no OCR path; tesseract.js and its language data are not here.
- **No benchmark, gold or fetched judgments.** The TAB benchmark (Norsk Regnesentral, MIT),
  SEC EDGAR filings, Singapore eLitigation judgments and UK Find Case Law judgments that the
  engine was measured on are not here, nor are our annotations over them. Of the repository's
  \`pii-bench/\` only the two vocabulary files the frozen engine reads at run time
  (\`pii-bench/vocab-quasi.json\`, \`pii-bench/vocab-keep.json\`) are here.
- **No website.** The site, its fonts and its images are not here.

## Everything else

Development tools (Vite, TypeScript, the Tauri CLI and the rest of each \`devDependencies\`
list) build the app but are not part of it; they carry their own licences in the usual way.

If you find something in this tree that is not accounted for above, that is a bug — please
open an issue.
`);

writeFileSync(join(DEST, 'README.md'), `# simpler.legal — the distributable tree

This folder is what the desktop app is built from: the app (\`app/\`), the frozen v1-legal
engine's serving half (\`serve-legal.mjs\`, \`strip-batch.mjs\`, \`apply-*.mjs\`,
\`locate-model.mjs\`, \`lib-core/\`, \`lib-legal/\`, the two vocabulary files under \`pii-bench/\`
and the launchers under \`tools/\` — see \`FREEZE.md\`), a llama.cpp server build
(\`llama-cuda/\`) and the Node runtime the app starts the engine with
(\`app/src-tauri/binaries/\`). It is assembled from the development repository by that
repository's \`tools/make-download-tree.mjs\` from an explicit list; nothing of the lab —
corpora, benchmarks, gold, fetched judgments, corpus-building scripts — is here.

## Build

    cd app/frontend
    npm ci
    npm run build
    cd ..
    frontend/node_modules/.bin/tauri build

(The Tauri CLI looks for \`src-tauri/\` below the folder it runs in, so the last step runs from
\`app/\`, not from \`app/frontend/\`; the app's configuration has no build hook, so the frontend
build is the explicit step before it.) The installer lands in
\`app/src-tauri/target/release/bundle/nsis/\`. It installs per user
(no administrator prompt) and bundles, beside the app: \`node.exe\`, \`engine/\` (the files named
above), \`llama/\` (the llama.cpp build) and \`licenses/\` (the licence texts it carries).

Rust writes the source path of each crate it compiles into \`simpler-legal.exe\`, and the path of a
crate from crates.io is inside your user folder. To keep your Windows user name out of the
program, run this in the same \`cmd\` window before the last step:

    set "CARGO_ENCODED_RUSTFLAGS=--remap-path-prefix=%USERPROFILE%=~"

The installer is not code-signed, so Windows SmartScreen warns before it runs.

## What the app needs at run time

The Gemma model weights are not in this tree and not in the installer, and the app does not
download them. Google publishes the one file the app accepts
(\`gemma-4-E2B_q4_0-it.gguf\`, 3,349,514,112 bytes, sha256
\`3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd\`) at

    https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/69536a21d70340464240401ba38223d805f6a709/gemma-4-E2B_q4_0-it.gguf

The app locates a local copy by content hash (\`MODEL_DISCOVERY.md\`) and refuses any file
whose hash does not match; Settings shows what it found.

## Licence, notices, security, privacy

The code is Apache-2.0 (\`LICENSE\`). \`NOTICE\` is derived from this tree's contents by
\`tools/derive-notice.mjs\` — every line names files that are here, every third-party file has
a line, and the run fails when either stops being true (\`node tools/derive-notice.mjs\`
checks; \`--write\` regenerates). \`THIRD_PARTY_NOTICES.md\` is the fuller accounting, and
\`licenses/\` holds the licence texts the installer carries. \`SECURITY.md\` says how to report
a vulnerability; \`PRIVACY.md\` says what the app sends where and what it stores.
`);
for (const g of GENERATED) produced.add(g);

// ── stale entries: anything in the destination this run did not produce ─────
// Build output is skipped here as the copy skips it: BUILDING.md section 6's `npm run build`
// writes app/frontend/tsconfig.tsbuildinfo, and a second run over that tree failed on it.
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP_DIR.has(name)) walk(p); }
    else if (!produced.has(rel(p)) && !skipFile(name)) fail.push(`stale in the destination (not on the list): ${rel(p)}`);
  }
})(DEST);
if (fail.length) { console.error('FAIL:\n  - ' + fail.join('\n  - ')); process.exit(1); }

// ── the tree's NOTICE, derived from what is there ─────────────────────────────
const r = execFileSync(process.execPath, [join(DEST, 'tools/derive-notice.mjs'), '--root', DEST, '--write'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
process.stdout.write(r);
console.log(`\ntree written: ${DEST} — ${produced.size} files (${FILES.length} listed files, ${DIRS.length} directories, ${GENERATED.length} generated)`);
console.log(`llama-server build ${llamaBuild[1]} (${llamaBuild[2]}); Node ${nodeVersion}; ${cases.length} opinions; ${dlls.length} DLLs`);
