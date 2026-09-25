# Third-party notices

The **code** in this repository is Apache-2.0 licensed (see `LICENSE` and `NOTICE`,
© 2026 Simpler Terminal Value Systems Pte Ltd). The components below are **not** covered by that
licence, or are material we do not own. Every path named here in backticks is checked against
the tree by `tools/derive-notice.mjs` (`git ls-files`), which fails when one is missing or a
stated count is wrong.

The Windows installer carries more than a clone does. What it carries, and the licence text of
each part, is in `licenses/`; `licenses/README.md` gives the source and sha256 of every file
there.

## The model weights — Google Gemma 4 E2B

The app accepts one model file: `gemma-4-E2B_q4_0-it.gguf`, sha256
`3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd`, 3,349,514,112 bytes
(`MODEL_SHA256` and `MODEL_BYTES` in `app/src-tauri/src/main.rs`). It refuses a file whose
sha256 differs, whatever it is named.

**Where to get it.** Google publishes the file on Hugging Face in the repository
[google/gemma-4-E2B-it-qat-q4_0-gguf](https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf).
This URL names the exact file by revision:

<https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/69536a21d70340464240401ba38223d805f6a709/gemma-4-E2B_q4_0-it.gguf>

Checked on 2026-09-25: a HEAD request to that URL answers `X-Repo-Commit`
`69536a21d70340464240401ba38223d805f6a709`, `X-Linked-Size` 3349514112 and `X-Linked-ETag`
equal to the sha256 above, and Hugging Face's file listing for that revision gives the same
size and LFS sha256. The same file is at the repository's first revision, `1894d1fc0a19`
(2026-06-05). The repository is not gated; the download needs no account.

**Do not take the file from the repository's main branch.** Since revision `9a257f15132b`
(2026-07-15, "Update metadata (tokenizer.chat_template)") the file of the same name has been a
different file: sha256 `25194efbf8a53268241e5ffa6d5490edc08b3faaa6ead24478c8b025a986d556`,
3,349,515,840 bytes, until revision `347eef722ec7` (2026-07-17, "Upload validated QAT GGUF
checkpoint (280 sequence length, corrected vocabulary)"), and since then sha256
`fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634`, 3,349,516,256 bytes, which
is what main serves (checked 2026-09-25 by a HEAD request at each of the repository's six
revisions). The app refuses both, because neither sha256 is the one the app is pinned to.

**Licence: Apache-2.0.** The model card (`README.md` at revision `69536a21`) states
`license: apache-2.0` and `license_link: https://ai.google.dev/gemma/docs/gemma_4_license`;
that page, read on 2026-09-25, is the text of the Apache License 2.0. Google's Gemma Terms of
Use (<https://ai.google.dev/gemma/terms>) say they apply to the models listed in their appendix
and send Gemma 4 to the Gemma 4 licence. Until 2026-09-25 this file said the weights were under
the Gemma Terms of Use; that was wrong for Gemma 4.

**What that asks of this product: nothing.** The weights are not redistributed: `.gitignore`
excludes `*.gguf`, the installer does not carry them, and the app looks for a copy the user
already has, by sha256 (`locate-model.mjs`, `MODEL_DISCOVERY.md`). The conditions in section 4
of the Apache License attach to redistribution, and naming Google's URL is not
redistribution. The Hugging Face repository holds no NOTICE file (its files at that revision
are `.gitattributes`, `README.md`, `gemma-4-E2B-it-mmproj.gguf` and the model file), so there
is no notice text for the app to show. Anyone who redistributes the file takes on section 4
themselves.

## The inference server — llama.cpp (installed, not in a clone)

The installer carries a llama.cpp build as `llama\`: every file in `llama-cuda/` when the
installer is built. `.gitignore` excludes that folder, so a clone does not carry it; BUILDING.md
says how to fill it. 22 of its files are `llama-server.exe` and its libraries, taken unchanged
from llama.cpp's own Windows release zip for build b9222 (commit `9a532ae4b`),
`llama-b9222-bin-win-vulkan-x64.zip`, which holds 43 files. Beside them are the OpenMP runtime
`libomp140.x86_64.dll`, which is not the zip's copy (below); three files of the Visual C++
runtime, which are not in that zip and were added from Visual Studio 2022 Build Tools; and,
when the folder was filled as BUILDING.md says, llama.cpp's `LICENSE`.

- llama.cpp, © The ggml authors, MIT: `licenses/llama.cpp-LICENSE.txt`.
- Compiled into its libraries, each with the text the build embeds in `llama-common.dll`:
  nlohmann/json (MIT, `licenses/llama.cpp-jsonhpp-LICENSE.txt`), cpp-httplib (MIT,
  `licenses/llama.cpp-cpp-httplib-LICENSE.txt`) and BoringSSL (Apache-2.0 with notes on its
  support code, `licenses/llama.cpp-BoringSSL-LICENSE.txt`).
- Also compiled in: stb_image and miniaudio (into `mtmd.dll`) and subprocess.h (into
  `llama-server.exe`), each dedicated to the public domain under the Unlicense, with MIT or MIT
  No Attribution as the alternative. They ask for no notice, and none is included.
- `llama-server.exe` carries a web page (`index.html`, `bundle.js`, `bundle.css`,
  `loading.html`) built from npm packages in the tools/ui folder of llama.cpp's repository.
  Their licence texts are in `licenses/llama.cpp-webui-npm-packages.txt`, generated by
  `node tools/derive-notice.mjs --webui` from a rebuild of that page that came out
  byte-identical to the copy inside the server. The file records the server's sha256, and a
  check fails when the server beside it differs.
- `libomp140.x86_64.dll` is the LLVM project's OpenMP runtime as conda-forge builds it:
  Library/bin/libomp.dll from the package llvm-openmp 22.1.8 (build `h4fa8253_3`), shipped
  under the name the 14 ggml-cpu libraries import. Apache-2.0 with LLVM Exceptions:
  `licenses/llvm-openmp-LICENSE.txt`. The release zip's own `libomp140.x86_64.dll` is not
  shipped. It is Microsoft's build, byte-identical to the copy in a Visual Studio folder that
  Microsoft does not allow to be redistributed (`debug_nonredist`); `licenses/msvc-runtime.txt`
  quotes Microsoft and gives both files' sha256. Until 2026-09-25 that copy was in the folder.
  On 2026-09-25 `llama-server.exe` answered 4 of 4 deterministic requests byte-identically
  with either copy. The same day the app, with LLVM's copy, stripped 24 of the 45 EDGAR
  documents of launch rounds 5–7 byte-identically to the same engine run with Microsoft's
  copy; the other 21 were not run (`OPS_LEDGER.md`, 2026-09-25).
- Three of those files were built by Microsoft and come with no licence text of their own: the
  Visual C++ runtime (`msvcp140.dll`, `vcruntime140.dll`, `vcruntime140_1.dll`).
  `licenses/msvc-runtime.txt` says where each comes from and quotes Microsoft's terms for
  redistributing them. Those terms require whoever installs them to agree to terms that protect
  them at least as much as Microsoft's own, so the installer's licence page is `LICENSE`,
  unchanged, followed by a short section on these three files that the user accepts by
  installing (`app/src-tauri/installer-licence.txt`, which `bundle.licenseFile` in
  `app/src-tauri/tauri.conf.json` names). `LICENSE` itself stays the Apache-2.0 text, and
  there is no end-user licence for this product's own code.

## The JavaScript runtime — Node.js (installed, not in a clone)

The installer carries Node.js v22.22.3 as `node.exe`, which runs the redaction engine. MIT,
© Node.js contributors, followed by the licences of the components Node includes:
`licenses/node-LICENSE.txt`, a copy of `LICENSE` at tag `v22.22.3`. A clone does not carry the
runtime; `.gitignore` excludes the folder the build takes it from.

## Compiled into the app — Rust crates and npm packages

The app's executable links Rust crates, and its window's code is bundled from npm packages.
Their licence texts are generated from the lockfiles by `node tools/derive-notice.mjs --deps`
and installed with the app:

- `licenses/rust-crates.txt`, from `app/src-tauri/Cargo.lock`: every crate the executable links
  for 64-bit Windows, with its version, the licence its `Cargo.toml` states and the licence
  files its published package carries.
- `licenses/npm-packages.txt`, from `app/frontend/package-lock.json`: every production package,
  in the same form, and the bundler, Vite, whose build adds modules of its own to the window's
  code (a module-preload polyfill and CommonJS helpers).

The executable also links a prebuilt library: Microsoft's WebView2 loader,
`WebView2LoaderStatic.lib`, which the `webview2-com-sys` crate carries and its build links in.
It is byte-identical to the copy in the NuGet package Microsoft.Web.WebView2 1.0.3650.58, whose
licence (BSD-style, © Microsoft Corporation) is `licenses/Microsoft.Web.WebView2-LICENSE.txt`
and whose notices file is `licenses/Microsoft.Web.WebView2-NOTICE.txt`. `--deps` fails when a
linked crate carries any other prebuilt library, or a different copy of that one.

Each file records the sha256 of the lockfile it was written from, and `tools/derive-notice.mjs`
fails once that lockfile changes. Each line gives the licence; most are MIT, Apache-2.0 or a
choice of the two, and the rest include Unicode-3.0, BSD-3-Clause, Zlib and MPL-2.0. The crates under MPL-2.0 (on
2026-09-25: `cssparser`, `dtoa-short`, `option-ext` and `selectors`) are used unmodified; the
source of each is published on crates.io at the version the file lists, for example
<https://crates.io/crates/cssparser/0.36.0>. For section 3.2 of the MPL: the source of every
MPL-2.0 crate linked into the app is available on crates.io, at the exact version
`app/src-tauri/Cargo.lock` records. Some published packages carry no licence file at
all (nine crates and one npm package on 2026-09-25); the files say which, with the licence
each states and where its source is.

## The setup program — NSIS and Tauri's plug-in

The setup program is built by Tauri's bundler from NSIS 3.11 and carries Tauri's
`nsis_tauri_utils.dll` plug-in (v0.5.3).

- NSIS: zlib/libpng, with the bzip2 licence and the Common Public License 1.0 for its
  compression modules: `licenses/NSIS-COPYING.txt`.
- `nsis_tauri_utils.dll`, © Tauri Programme within The Commons Conservancy, MIT or
  Apache-2.0: `licenses/nsis_tauri_utils-LICENSE_MIT.txt` and
  `licenses/nsis_tauri_utils-LICENSE_APACHE-2.0.txt`.

## Web fonts — IBM Plex

IBM Plex latin subsets, © 2017 IBM Corp. with Reserved Font Name "Plex", under the
**SIL Open Font License 1.1**. Self-hosted so neither the site nor the app makes an external
font request. The full OFL-1.1 text ships beside each copy, as OFL §2 requires:

| Copy | Files | Count | Licence text |
|---|---|---|---|
| Website | `site/assets/fonts/*.woff2` (Sans Regular/Text/Medium/SemiBold, Serif SemiBold + SemiBoldItalic, Mono Regular) | 7 | [`site/assets/fonts/LICENSE.txt`](site/assets/fonts/LICENSE.txt) |
| Desktop app | `app/frontend/public/fonts/*.woff2` (the website's seven, plus Serif Regular and Italic) | 9 | [`app/frontend/public/fonts/LICENSE.txt`](app/frontend/public/fonts/LICENSE.txt) |

Both files are verbatim copies of upstream
[`IBM/plex/LICENSE.txt`](https://github.com/IBM/plex/blob/master/LICENSE.txt).
Referenced from `site/fonts.css` and `app/frontend/src/styles/fonts.css`.

The four IBM Plex Serif files in `app/frontend/public/fonts/` are byte-identical to the files
of the same names in the folder fonts/split/woff2 of the npm package `@ibm/plex-serif` 2.0.0
(<https://registry.npmjs.org/@ibm/plex-serif/-/plex-serif-2.0.0.tgz>, tarball SHA-256
`91725e9b2d2928fa26cced4b64b06791c11b089846d021fb925345ebd461f2a7`; source repository
[github.com/IBM/plex](https://github.com/IBM/plex), gitHead `434af578549afcfdabd281f386e0ff7314fd20b0`).
File SHA-256:

| File | SHA-256 |
|---|---|
| `IBMPlexSerif-Regular-Latin1.woff2` | `324a502545695a3e8dd9e9d9273ec56e3aa2a729689807756b9439e2c7a48071` |
| `IBMPlexSerif-Italic-Latin1.woff2` | `1bceb36acfb5828f10ef9462de2003b0da6c53781faff4a942d426378d9fd975` |
| `IBMPlexSerif-SemiBold-Latin1.woff2` | `c1487f9484cc8f04c656f7f074724154a04fdefd2ce7ffeab653f517bb4d366d` |
| `IBMPlexSerif-SemiBoldItalic-Latin1.woff2` | `4d9138c807282b0d22b2421ba2f739f0690fe627fe3b68580adc1e3190da4d2d` |

## PDF rendering — pdf.js and its vendored data files

PDF text extraction uses **pdf.js** (`pdfjs-dist` 6.2.108 in `app/frontend/package-lock.json`,
**Apache-2.0**, © Mozilla Foundation and contributors,
[github.com/mozilla/pdf.js](https://github.com/mozilla/pdf.js)). The library is an npm
dependency, bundled into the app window's code; its licence text is in
`licenses/npm-packages.txt`. No pdf.js source is vendored in this repository. Its **runtime
data files are** vendored, so that the app resolves CJK encodings and standard fonts locally
instead of fetching them from a CDN:

| Vendored under `app/frontend/public/pdfjs/` | Count | Terms | Licence text in tree |
|---|---|---|---|
| `cmaps/*.bcmap` — Adobe CMap resources | 168 | BSD-3-Clause, © 1990-2009 Adobe Systems Incorporated | [`cmaps/LICENSE`](app/frontend/public/pdfjs/cmaps/LICENSE) |
| `standard_fonts/Foxit*.pfb` — Foxit base-14 substitutes | 10 | BSD-3-Clause, © 2014 PDFium Authors | [`standard_fonts/LICENSE_FOXIT`](app/frontend/public/pdfjs/standard_fonts/LICENSE_FOXIT) |
| `standard_fonts/LiberationSans-*.ttf` | 4 | SIL OFL 1.1, © 2012 Red Hat, Inc.; digitized data © 2010 Google Corporation | [`standard_fonts/LICENSE_LIBERATION`](app/frontend/public/pdfjs/standard_fonts/LICENSE_LIBERATION) |

Those three LICENSE files came from the pdf.js distribution and are shipped unmodified.

## OCR — Tesseract (developer tooling only)

The app has no OCR path. `tesseract.js` 7.0.0 (Apache-2.0) is an npm dependency of the
extraction tooling under `app/extract/` only (`test-ocr.mjs`, run by hand as `npm run test:ocr`
there), and it fetches Tesseract's English language data itself at run time. That data file,
`eng.traineddata` (© the tesseract-ocr authors, **Apache License 2.0**,
[github.com/tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata)), is
**not tracked** — `.gitignore` excludes `*.traineddata` — so it ships with neither a clone nor
the desktop app. (Until 2026-09-13 this file said the opposite; `tools/derive-notice.mjs` now
checks every path claimed here against the tree.)

## Benchmark corpora — what ships and what does not

**Documents we redistribute:**

- `corpus/` (89) + `newcases/` (10) — 99 full-length F.3d opinions from the
  **Caselaw Access Project** static archive (<https://static.case.law/>), **public domain**.
  Each file carries its court, date, citation and CAP id in its header; `sources.json` and
  `build-corpus.mjs` record provenance and rebuild them.

**Documents we do NOT redistribute** (manifests carry the per-document URLs; the fetchers
rebuild the text, sha-verified, from the public source):

- **TAB — Text Anonymization Benchmark**, 1,268 annotated ECtHR judgments, **MIT**,
  Norsk Regnesentral (Pilán et al. 2022, *Computational Linguistics* 48(4)) —
  <https://github.com/NorskRegnesentral/text-anonymization-benchmark> ·
  paper <https://arxiv.org/abs/2202.00443>. Pinned at commit
  `558e09e26d6b36f5f78440074e6a233946d98bd9`. `node build-pii-bench.mjs` fetches the corpus,
  TAB's own `LICENSE.txt` and its official scorer (`evaluation.py`) into `raw/tab/`, which is
  gitignored; only our measured stats (`pii-bench/tab-stats.json`) are committed.
- **SEC EDGAR** filings and exhibits — US government public records
  (<https://www.sec.gov/edgar/search/>). Fetched by `build-oos.mjs` /
  `audit-redactions/fetch-redacted-edgar.mjs` into gitignored `raw/`.
- **Singapore eLitigation** judgments (<https://www.elitigation.sg/gd>) — **not redistributed**,
  by owner ruling 2026-07-23 matching simpler-red. `.gitignore` carries explicit rules against
  stray copies; `audit-redactions/fetch-sghcf.mjs` refetches from the public URLs.
- **UK judgments** from The National Archives' *Find Case Law*
  (<https://caselaw.nationalarchives.gov.uk/>) under the
  [Open Justice Licence](https://caselaw.nationalarchives.gov.uk/open-justice-licence);
  attribution is retained per-document in `pii-bench/ukprobe-manifest.json` and the text is
  rebuilt by `build-ukprobe.mjs` into gitignored `raw/`.

**Our own annotations.** The gold labels and adjudications under `pii-bench/` (`*-labels/`,
`*-gold*/`, the manifests and the run records) are our work,
© 2026 Simpler Terminal Value Systems Pte Ltd,
and are covered by this repository's Apache-2.0 licence. They are *annotations over* the
documents above; the underlying documents keep their own terms, and a label file is not a
licence to redistribute the text it points at.

## Everything else

The other development tools (TypeScript, the Tauri CLI and the rest of each `devDependencies`
list) build the app, and a scratch build of the window on 2026-09-25 carried no code of theirs;
they carry their own licences in the usual way. Vite is the exception above: its build adds
modules of its own to the window's code, so it is listed in `licenses/npm-packages.txt`.

Screenshots, the OG card, the favicon and all site copy under `site/` are our own work.

If you find something in this repository that is not accounted for above, that is a bug —
please open an issue.
