# Building simpler.legal from source

How to go from a clean clone to the Windows installer, `simpler.legal_0.1.0_x64-setup.exe`.
Every command below except `node tools\verify.mjs` was run as written, in this order, through
Command Prompt (`cmd.exe`), in a fresh clone with an empty cargo home and an empty npm cache.
The Tauri CLI's own copy of NSIS was already on the test machine. Section 8 has the record.

The build is Windows x64 only: `app/src-tauri/tauri.conf.json` sets `bundle.targets` to
`["nsis"]`, so it makes one NSIS installer and no `.msi`. The installer is **not code-signed**;
nothing in this repository signs it.

## 1. Prerequisites

| Tool | Tested with | What needs it |
|---|---|---|
| Git | 2.49.0.windows.1 | the clone |
| Node.js 22, with the npm it ships, and with `zlib.zstdDecompressSync` | v22.22.3, npm 10.9.8 (it has zstd) | `tools/fetch-deps.mjs` (it needs zstd for the OpenMP package, step 3), the npm steps, the frontend build, the gates |
| Visual Studio 2022 Build Tools, workload "Desktop development with C++" (MSVC v143 and a Windows 10/11 SDK) | 17.14.32; MSVC 14.44.35207; SDK 10.0.26100 | the Rust MSVC toolchain links with it; `tools/fetch-deps.mjs` copies the Visual C++ runtime from it (step 3) |
| Rust stable with the MSVC host (`rustup default stable-x86_64-pc-windows-msvc`) | rustc 1.95.0, cargo 1.95.0 | the app shell in `app/src-tauri/` |
| Microsoft Edge WebView2 Runtime | 153.0.4234.48 | running the app, not building it; Windows 11 includes it |

The build downloads from nodejs.org, github.com (with raw.githubusercontent.com and GitHub's
release storage), registry.npmjs.org and crates.io. The first `tauri build` on a machine also
fetches NSIS: the Tauri CLI 2.11.4 that `package-lock.json` installs names
`https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip` and
`nsis_tauri_utils.dll` v0.5.3 from `tauri-apps/nsis-tauri-utils`, each with a SHA-1 (both URLs
were fetched on 2026-09-25 and matched them), and keeps them in `%LOCALAPPDATA%\tauri\NSIS\`.

Use Command Prompt, not PowerShell. Microsoft documents `Restricted` as PowerShell's default
execution policy on Windows client computers (`about_Execution_Policies`), and under it `npm`
typed in PowerShell fails: `powershell -ExecutionPolicy Restricted -Command npm --version`
exits 1 with "npm.ps1 cannot be loaded because running scripts is disabled on this system",
while `npm --version` in Command Prompt prints `10.9.8`.

## 2. Clone

```
git clone https://github.com/Simpler-Systems/simpler-legal.git
cd simpler-legal
```

## 3. Fetch the build inputs the repository does not carry

```
node tools\fetch-deps.mjs
```

Two things the build reads are deliberately not in git (`.gitignore`, "model weights and
vendored binaries"). `tools/fetch-deps.mjs` downloads them, checks every file against a sha256
written into the script, and only then places them. It uses Node's own `fetch`, `crypto` and
`zlib`; it adds no npm dependency.

- `app\src-tauri\binaries\node-x86_64-pc-windows-msvc.exe`: the official Node.js v22.22.3
  Windows x64 binary (`https://nodejs.org/dist/v22.22.3/win-x64/node.exe`), checked against
  the pin and against that release's `SHASUMS256.txt`. The app runs the redaction engine with
  it, and the Tauri build will not compile without it. Beside it, `LICENSE-node.txt`: Node's
  licence at tag v22.22.3, written with CRLF line ends so that it is byte for byte the
  `LICENSE` inside `node-v22.22.3-win-x64.zip`.
- `llama-cuda\`: llama.cpp build b9222 (commit 9a532ae4b), from the release asset
  `llama-b9222-bin-win-vulkan-x64.zip`. The script keeps 22 of its files (`llama-server.exe`
  and 21 DLLs) and leaves out the release's other 20 programs and its `libomp140.x86_64.dll`,
  which is Microsoft's build and may not be redistributed (`licenses/msvc-runtime.txt`,
  section 2). In its place it puts the LLVM project's OpenMP runtime, which the ggml-cpu
  libraries import: `Library/bin/libomp.dll` from conda-forge's package
  `llvm-openmp-22.1.8-h4fa8253_3.conda`, saved as `libomp140.x86_64.dll`. The package's two
  inner archives are zstd-compressed; the script reads them with Node's
  `zlib.zstdDecompressSync`, and if your Node lacks it the script says so and stops before
  downloading anything (v22.22.3 has it). It also checks that the package's licence text is
  byte for byte `licenses/llvm-openmp-LICENSE.txt`. Beside them it puts llama.cpp's `LICENSE`
  at tag b9222, and the Microsoft Visual C++ runtime (`msvcp140.dll`, `vcruntime140.dll`,
  `vcruntime140_1.dll`), which `llama-server.exe` and its DLLs import and the release zip does
  not carry. Microsoft publishes no download of those three files on their own, so the script
  copies them from your Visual Studio installation's `VC\Redist\MSVC` folder.

Then it runs both programs and prints their version lines (`v22.22.3`;
`version: 9222 (9a532ae4b), built with Clang 19.1.5 for Windows x86_64`).

If any hash does not match, it exits 1 and places nothing. It never overwrites: a file already
in place that does not match its pin is refused, and so is any file in `llama-cuda\` that is
not on its list, because `tauri.conf.json` bundles that whole folder into the installer.

The pinned Visual C++ runtime is file version 14.44.35211.0, from Visual Studio 2022 Build
Tools 17.14 (`VC\Redist\MSVC\14.44.35112`). If your Visual Studio holds another version the
script refuses and says so. To take yours, run `node tools\fetch-deps.mjs --any-vc-runtime`: it
then takes the newest redist folder, asks Windows to confirm a valid Authenticode signature by
Microsoft Corporation on each file whose bytes differ from the pin, and prints each such file's
version and sha256. Your installer then differs from the pinned build in those files.

Behind a proxy, or offline: download the six files by hand into one folder, under the names
below, and run `node tools\fetch-deps.mjs --from <that folder>`. The same checks apply, and a
run whose folder lacks a file names every missing one.

| Save | as |
|---|---|
| `https://nodejs.org/dist/v22.22.3/win-x64/node.exe` | `node.exe` |
| `https://nodejs.org/dist/v22.22.3/SHASUMS256.txt` | `SHASUMS256.txt` |
| `https://raw.githubusercontent.com/nodejs/node/v22.22.3/LICENSE` | `node-v22.22.3-LICENSE` |
| `https://github.com/ggml-org/llama.cpp/releases/download/b9222/llama-b9222-bin-win-vulkan-x64.zip` | `llama-b9222-bin-win-vulkan-x64.zip` |
| `https://raw.githubusercontent.com/ggml-org/llama.cpp/b9222/LICENSE` | `llama.cpp-b9222-LICENSE` |
| `https://conda.anaconda.org/conda-forge/win-64/llvm-openmp-22.1.8-h4fa8253_3.conda` | `llvm-openmp-22.1.8-h4fa8253_3.conda` |

`node tools\fetch-deps.mjs --check` checks what is in place against the pins, with no network
and no writes.

## 4. Install the frontend's dependencies and build the frontend

```
npm --prefix app\frontend ci
npm --prefix app\frontend run build
```

`npm ci` installs exactly what `app/frontend/package-lock.json` records. It reports 4
advisories (2 moderate, 2 high), all in build-time packages (`baseline-browser-mapping`,
`browserslist`, `nanoid`, `postcss`); `npm audit --omit=dev` in `app\frontend` reports 0.
On 2026-09-25, `npm audit fix --package-lock-only` cleared all 4. It moved 9 build-time packages
within their ranges and left `package.json` as it was. A scratch build of the download tree
under each lockfile wrote the same 302 files into `dist/`, byte for byte. v0.1.0 keeps the old
lockfile, because `licenses/npm-packages.txt` records its sha256 and the installer was already
built. 0.1.1 takes the new one.

`run build` first runs `prebuild`, which is `node ../../sync-viewer.mjs`: it rebuilds the case
map from `corpus/` and `newcases/` and copies the 99 opinions into
`app/frontend/public/cases/`. Then `tsc -b` and `vite build` write `app/frontend/dist/`, which
is what `tauri.conf.json` bundles. The rebuilt map carries its build time (`builtAt`), so after
this step `git status` shows `app/frontend/public/synergy.html` as modified; nothing else in it
changes.

`app/extract/` is not part of the app. It has its own `package.json` and lockfile and is needed
only for the gates (section 7).

## 5. Build the installer

```
cd app
set CARGO_BUILD_JOBS=4
set "CARGO_ENCODED_RUSTFLAGS=--remap-path-prefix=%USERPROFILE%=~"
frontend\node_modules\.bin\tauri build
```

Run it from `app\`: the Tauri CLI looks for `src-tauri\` below the folder it runs in.
`tauri.conf.json` has no build hook, so step 4's frontend build must come first.

The `--remap-path-prefix` line keeps your user folder out of `simpler-legal.exe`. Rust writes
into the program the source location of every place it can panic. For a crate from crates.io
that location is under your cargo home, inside your user folder, so your Windows user name ends
up in the file. With the line, those locations start `~\.cargo\registry\` instead. Without it,
the v0.1.0 tree's `simpler-legal.exe` held the builder's user folder 311 times, 304 of them
under `.cargo\registry\`. The flag goes in `CARGO_ENCODED_RUSTFLAGS`, not `RUSTFLAGS`, because
`RUSTFLAGS` splits its value at spaces and a user folder's name can have one. Cargo's own
setting for this, `trim-paths`, is not stable in cargo 1.95. The line changes only the text of
those locations, not the code. Cargo compiles everything again when the flags change.

Pass no `--features` to this build. The one feature `Cargo.toml` declares, `exit-fault`, is a
test build's: it lets the close tests take away the event loop's last paint on demand
(`exit_guard.rs`). `node tools\exe-strings.mjs app\src-tauri\target\release\simpler-legal.exe`
counts that feature's names and your user folder in the program, as UTF-8 and UTF-16LE. It must
print 0 and 0, and it exits 1 when it does not.

`CARGO_BUILD_JOBS=4` caps cargo at four compiler processes. Without it cargo starts one per
logical processor. On the 24-thread machine this was tested on, with about 2.5 GB of memory
free, that ran rustc out of memory while compiling the `windows` crate
(`memory allocation of 1044480 bytes failed`, exit code `0xc0000409`). With plenty of free
memory you can leave the line out.

The installer lands in
`app\src-tauri\target\release\bundle\nsis\simpler.legal_0.1.0_x64-setup.exe`. It installs per
user (`bundle.windows.nsis.installMode` is `currentUser`). `bundle.resources` in
`tauri.conf.json` decides what it puts beside the app. The test build of commit `78ac47b`
(section 8), listed with 7-Zip (`7z l simpler.legal_0.1.0_x64-setup.exe`), held
`simpler-legal.exe`, `node.exe`, `engine\` (22 files: the frozen engine's serving scripts,
`lib-core\` and `lib-legal\`) and `llama\` (the 27 files of `llama-cuda\`). Since that build, `bundle.resources` also maps
`LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md` and the `licenses\` folder into `licenses\`,
`bundle.licenseFile` names `installer-licence.txt` (in `app\src-tauri\`) as the installer's
licence page, which is `LICENSE` followed by a section with the terms Microsoft requires for the
three Visual C++ runtime files, `llama-cuda\libomp140.x86_64.dll` is LLVM's build in place of
the zip's Microsoft copy, and `bundle.windows.nsis` names `icons\icon.ico` as the installer's
and the uninstaller's icon. Without that setting NSIS shows its own icon.

The v0.1.0 installer was built on 2026-09-25 from section 6's tree. Besides NSIS's own
plug-ins it holds 70 files:
- `simpler-legal.exe` and `node.exe`;
- `engine\` (22 files), `llama\` (27) and `licenses\` (19).

69 of the 70 are the tree's files byte for byte. `simpler-legal.exe` differs from the tree's copy
in 3 bytes only, Tauri's bundle-type marker: `UNK` on disk, `NSS` in the installer. Its licence
page, read out of the running installer's licence control, is `installer-licence.txt` exactly.
`Get-AuthenticodeSignature` reports `NotSigned` for the installer, `simpler-legal.exe` and
`llama-server.exe`. `node.exe` keeps the OpenJS Foundation's own signature. The installer was
run from disk, not downloaded, so the SmartScreen prompt that a downloaded copy gets was not
observed here.

The model weights are not in the installer. The app finds an existing local copy by its sha256
(`MODEL_DISCOVERY.md`); `README.md` says where the model comes from.

## 6. The sanitised download tree

The packaged app that `README.md` describes is built from a separate tree. The tree holds the
app and the frozen engine's serving half and nothing of the lab (no corpus, benchmark or gold),
with a `NOTICE` derived from its own contents (`tools/make-download-tree.mjs`, header). From the
repository root, after step 4:

```
node tools\make-download-tree.mjs --dest ..\simpler-legal-app --node-license app\src-tauri\binaries\LICENSE-node.txt
cd ..\simpler-legal-app\app\frontend
npm ci
npm run build
cd ..
set CARGO_BUILD_JOBS=4
set "CARGO_ENCODED_RUSTFLAGS=--remap-path-prefix=%USERPROFILE%=~"
frontend\node_modules\.bin\tauri build
```

The destination must be outside the repository. `--node-license` names the licence file step 3
placed. The tree's `package.json` has no `prebuild` (its `public\cases\` is already copied),
the Tauri CLI again runs from the tree's `app\`, and the installer lands in the tree's
`app\src-tauri\target\release\bundle\nsis\`. The script can be run again over a built tree. It
skips build output: the folders `node_modules\`, `dist\`, `target\`, `gen\`, `.vite\`, `raw\`
and `_serve\`, and files ending `.tsbuildinfo` or `.log`. It fails on any other file it did not
write.

## 7. The gates

```
npm run setup
node tools\verify.mjs
```

`npm run setup` runs `npm ci` in both `app\frontend` and `app\extract`. `tools/verify.mjs`
runs every gate it can and skips, with the reason and the command that fixes it, any whose
inputs are absent. A skip is never counted as a pass. What each gate needs, from
`tools/verify.mjs`:

| Gate | Needs |
|---|---|
| `extract` | `app\extract\node_modules` (`npm run setup`) |
| `floor-tables`, `doctrine-profile`, `protected-terms`, `review-honesty`, `finish-attestation`, `compare-refusal`, `docx-parts`, `intake-refusal`, `copy-claims`, `drop-holds`, `site-claims` | `app\frontend\node_modules` |
| `service-auth`, `service-lifecycle` | `app\frontend\node_modules`; they start the engine service on local ports in 14380 to 14399 |
| `rust-unit` | `cargo` on PATH and step 3's files. It runs `cargo test --offline`, so the crates must already be downloaded; step 5 downloads them |
| `clone-imports` | nothing |
| `graph` | `corpus\`, which is in git |
| `score-pii` | `raw\oos\` and the hydrated gold. Neither is in git (`raw\` is gitignored; the gold is kept as offsets, `WITHHELD.md`), so this gate skips in a clone. Its skip names `node build-oos.mjs` and then `node gold-offsets.mjs hydrate`; neither was run for section 8 |

For section 8, `node tools\verify.mjs` itself was not run in the test clone. The gates `extract`,
`clone-imports`, `graph` and `rust-unit` were run one at a time, by the commands `verify.mjs`
gives them.

`cargo check --manifest-path app\src-tauri\Cargo.toml`, from the repository root, passes once
step 3 is done. With `app\src-tauri\binaries\` or `llama-cuda\` missing it exits 101 at the
Tauri build script, which names the missing path ("resource path ... doesn't exist").

## 8. The record of the test build

2026-09-25, Windows 11 Home 10.0.26200, 24 logical processors, 32 GB of memory shared with
other running programs, the tool versions in section 1. The clone was of commit `78ac47b`, with
this file, `tools/fetch-deps.mjs` and the edited `tools/verify.mjs` copied in. A script ran each
command through `cmd.exe /d /c`, timed it and kept its output, with `CARGO_HOME` and
`LOCALAPPDATA` pointed at empty folders. Cargo and npm follow those variables: step 5
downloaded 262 crates, and the npm cache started empty. The Tauri CLI does not follow
`LOCALAPPDATA` for NSIS. It used the copy already in the machine's `%LOCALAPPDATA%\tauri\NSIS\`,
whose `nsis_tauri_utils.dll` matches the SHA-1 the CLI pins. Step 6's tree went to a folder
named `tree2`, not `simpler-legal-app`. Before each cargo step the script waited until Windows
reported at least 4 GB of free commit memory, so that the build would not starve the other
programs. It waited 315 s before step 5. The times below leave that wait out.

| Section | Command | Result | Seconds |
|---|---|---|---|
| 3 | `node tools\fetch-deps.mjs` | 29 files placed, each matching its pin; `v22.22.3`; `version: 9222 (9a532ae4b)` | 11.3 |
| 4 | `npm --prefix app\frontend ci` | 84 packages; 4 advisories | 11.4 |
| 4 | `npm --prefix app\frontend run build` | `dist\` written; `synergy.html` modified (`builtAt` only) | 37.5 |
| 5 | `set CARGO_BUILD_JOBS=4`, `frontend\node_modules\.bin\tauri build` | installer written | 829.9 |
| 7 | `cargo check --manifest-path app\src-tauri\Cargo.toml` | passed | 261.1 |
| 7 | `npm run setup` | 84 + 24 packages | 23.2 |
| 7 | `npm --prefix app/extract test` (gate `extract`) | `ALL GREEN` | 15.7 |
| 7 | `node tools/check-clone-imports.mjs` (gate `clone-imports`) | `PASS` | 4.7 |
| 7 | `node graph.mjs selftest` (gate `graph`) | `PASS 12/12` | 3.0 |
| 7 | `cargo test --offline --manifest-path app/src-tauri/Cargo.toml` (gate `rust-unit`) | 68 passed, 0 failed | 243.0 |
| 3 | `node tools\fetch-deps.mjs --check` | 29 of 29 in place and verified | 1.1 |
| 3 | `node tools\fetch-deps.mjs`, a second time | nothing to fetch | 0.9 |
| 6 | `node tools\make-download-tree.mjs --dest ..\tree2 --node-license ...` | 473 files; the tree's `NOTICE` checks passed | 2.8 |
| 6 | `npm ci` in the tree's `app\frontend` | 84 packages | 6.8 |
| 6 | `npm run build` in the tree's `app\frontend` | `dist\` written | 24.7 |
| 6 | `set CARGO_BUILD_JOBS=4`, `frontend\node_modules\.bin\tauri build` in the tree's `app\` | installer written | 497.4 |

The two installers:

| Built from | Bytes | sha256 |
|---|---|---|
| the clone (section 5) | 39,756,044 | `5bdfef14f3f380a798cd7fa2e5a73d0c96b6619abe5aa3dcf69d2143f691465b` |
| the tree (section 6) | 39,751,018 | `7d615b340c68125de29e18da6ff54030501f1a30885df8ab2a6d33e702157844` |

Both are `NotSigned`. 7-Zip lists the same 57 entries, at the same sizes, in each. The two differ
in bytes, and a rebuild is not expected to reproduce either hash. One difference is
`llama\LICENSE`. In the clone's installer it is llama.cpp's own file at b9222, which reads
"Copyright (c) 2023-2026". In the tree's installer it is the copy that `make-download-tree.mjs`
at `78ac47b` typed in, which reads "2023-2024".

The failures on the way, each followed by a fresh clone:

1. The first `tauri build` ran without `CARGO_BUILD_JOBS`. After 376.6 s, rustc ran out of
   memory compiling the `windows` crate 0.61.3 (`memory allocation of 1044480 bytes failed`,
   exit code `0xc0000409`). By default cargo runs one compiler process per logical processor,
   24 on this machine, and about 2.5 GB of memory was free. Section 5 now sets
   `CARGO_BUILD_JOBS=4`, and section 6 does the same.
2. The second run stopped after step 3 because the timing script could not write its own
   progress file while another program was reading it. BUILDING.md was not at fault. The script
   now retries the write.
3. An earlier draft of this file said the machine's Tauri caches were empty. They were not, as
   described above. The text is corrected.

`cargo check` was also run with each of the two fetched folders moved away in turn. With
`app\src-tauri\binaries\` missing, the Tauri build script says
"resource path `binaries\node-x86_64-pc-windows-msvc.exe` doesn't exist". With `llama-cuda\`
missing, it says "resource path `..\..\llama-cuda` doesn't exist". Both runs exit 101.

`tools/fetch-deps.mjs` was also run against bad input, in scratch folders:

- a corrupted zip given through `--from`: refused, exit 1, nothing placed;
- a file in place whose bytes differ from its pin: refused, and the file was left as it was;
- an extra `llama-cli.exe` in `llama-cuda\`: refused;
- a `vcruntime140.dll` from `System32` (file version 14.51.36247.0) already in `llama-cuda\`:
  refused; accepted with `--any-vc-runtime`, which printed its file version and sha256;
- a Visual Studio runtime that does not match the pins (the pins were altered in a copy of the
  script): refused; with `--any-vc-runtime`, placed, printing the file version, sha256 and
  Microsoft signature of each file that differs from its pin;
- a `--from` folder holding none of the five downloads: refused, naming all five.

The test build above predates the owner's licensing rulings of 2026-09-25. Its `llama\` held the
zip's `libomp140.x86_64.dll`, which is Microsoft's, and its licence page was `LICENSE` alone.
The `tools/fetch-deps.mjs` that fetches LLVM's OpenMP runtime instead was run on 2026-09-25 in
a scratch copy of the repository, not a fresh clone, whose other 26 targets were copied from
this working tree:

- `--check` with Microsoft's `libomp140.x86_64.dll` in place: refused, naming it as Microsoft's
  build, exit 1;
- a run with network: the `.conda`, Node's licence and llama.cpp's licence fetched, 3 placed and
  26 already in place, 29 verified, exit 0; the placed file is byte for byte the package's
  `Library/bin/libomp.dll`;
- `--check` afterwards: 29 of 29 in place and verified; a second run: nothing to fetch;
- `--from` with a folder that lacks the `.conda`: refused, naming it; with it: 1 placed;
- a corrupted `.conda`: refused on its sha256, nothing placed;
- `licenses/llvm-openmp-LICENSE.txt` altered, then removed: refused both times;
- a Node without `zlib.zstdDecompressSync` (simulated by deleting the function before the
  script loads): refused before anything was downloaded.

Not tested:

- a machine without Visual Studio's 14.44.35112 redist folder;
- a machine without an existing NSIS copy;
- installing and running either installer;
- the SmartScreen prompt on a downloaded copy.
