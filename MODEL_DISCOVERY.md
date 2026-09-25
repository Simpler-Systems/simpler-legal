# MODEL_DISCOVERY.md — the family model-sharing convention (2026-07-24)

**Problem (owner):** every vertical (-red, -legal, -med, -capital, -tax, -harness) runs
the same vanilla E2B. Six apps must never make a user download a 3 GB model six times —
each app must FIND a model already on the machine.

**Status:** convention of record for -legal and -capital (implemented here:
`locate-model.mjs`); adoption by -red/-med/-harness/-tax is by deliberate cherry-pick
(BACKPORT_RED.md entry filed). The convention canonicalizes what already exists — the
shared dir below predates this doc and already holds the family estate.

## The canonical shared dir (already real)

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Simpler AI\models\` |
| macOS | `~/Library/Application Support/Simpler AI/models/` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/simpler-ai/models/` |

Rules: **downloads always land here** (the next vertical then finds them for free); apps
READ from anywhere but WRITE only here; a model found elsewhere is hardlinked in when on
the same volume (zero bytes copied) and referenced in place otherwise. Never duplicate.

## Identity is the hash, never the filename

A file named like the model is not the model. The catalog pins content:

| id | file | bytes | sha256 |
|---|---|---|---|
| **gemma-4-E2B_q4_0-it** (the E2B, all verticals) | `gemma-4-E2B_q4_0-it.gguf` | 3,349,514,112 | `3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd` |

(Also present in the estate, unpinned until their owning repos pin them: the E2B mmproj,
whisper `ggml-large-v3-turbo-q5_0`, `nomic-embed-text-v1.5`, paddleocr.)

Fail-closed: sha mismatch = NOT the model, regardless of name. A size-matched but
unverified candidate may run only with an explicit `unverified` status surfaced to the
user (the UI-truth law) — verification is one `--verify` away (~15 s for 3 GB).

## The search order (bounded — see the privacy rule)

1. `SIMPLER_MODEL_PATH` env / explicit app config — the user's word outranks discovery.
2. The canonical shared dir.
3. Legacy per-app dirs (each vertical's own `models/` from before the convention).
4. Known ecosystem caches, shallowly: HF hub cache (`~/.cache/huggingface/hub`,
   `%USERPROFILE%\.cache\huggingface\hub`), LM Studio (`~/.lmstudio/models`,
   `~/.cache/lm-studio/models`), GPT4All (`%LOCALAPPDATA%\nomic.ai\GPT4All`,
   `~/.local/share/nomic.ai/GPT4All`), Jan (`~/jan/models`), Ollama blobs
   (`~/.ollama/models/blobs`, `%USERPROFILE%\.ollama\models\blobs` — hash-named files,
   matched by size then sha).
5. `~/Downloads` and `~/models`, TOP LEVEL ONLY.

**The privacy rule: no full-disk crawl, ever.** A redaction product that background-scans
the user's desktop has broken its own thesis. Discovery visits the bounded list above and
nothing else; past that, the answer is a file picker the USER points at a model. This is a
brand law, not an implementation detail.

## Implementation

`locate-model.mjs` (this repo + -capital): dependency-free Node resolver + CLI.

```
node locate-model.mjs                 # scan + report candidates (size-matched fast path)
node locate-model.mjs --verify        # sha256 the best candidate against the catalog pin
node locate-model.mjs --link          # hardlink an off-canonical find into the shared dir
```

API: `locateModel({ id }) -> { best, candidates[] }`, each candidate
`{ path, bytes, sizeMatch, source, verified }`. The Tauri shells' `model_check` command
(currently a scaffold in every vertical) implements THIS search order when the Rust organs
port from -harness; `tauri.ts`'s `ModelStatus.searched` field is already the right shape.
The shipped launchers (`tools/launch-server.cmd`, `tools/launch-server.sh`) resolve the
model through this resolver — `node locate-model.mjs --path` prints the best candidate's
path and nothing else, exiting 2 (silently) when there is none or when a checked sha did
not match.
