#!/bin/sh
# ── launch-server.sh — THE FROZEN SERVER LAUNCHER (POSIX) ─────────────────────
#
# POSIX peer of launch-server.cmd. FREEZE.md names this pair as the ONLY way the
# model half of the frozen v1-legal configuration may be served. The flags below
# are part of the frozen configuration: ctx-size, parallel, jinja and the
# thinking-disabled chat template all shaped the measured boards. Do not
# "improve" them — changing a flag invalidates every model-half receipt in
# BENCHMARK.md.
#
# Honest scope note: every board in BENCHMARK.md was produced on Windows via the
# .cmd. The argv this script hands llama-server is identical, but no receipt in
# this repo was produced on Linux or macOS.
#
# Model (pinned by CONTENT, never by filename — MODEL_DISCOVERY.md):
#   gemma-4-E2B_q4_0-it.gguf   3,349,514,112 bytes
#   sha256 3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd
#   Verify yours:  node locate-model.mjs --verify
#
# The model is NOT a repo asset (*.gguf is gitignored) and neither is the
# llama.cpp build. Both are located on your machine at run time.
#
# Overrides, all optional:
#   SIMPLER_LLAMA_PORT  serving port           (default 49400 — the frozen port)
#   SIMPLER_LLAMA_BIN   llama-server binary    (default: llama-server on PATH)
#   SIMPLER_MODEL_GGUF  explicit model path    (default: node locate-model.mjs)
#
#   sh tools/launch-server.sh
#
# Then probe one completion (assert non-empty) before any run — FREEZE.md.
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

PORT=${SIMPLER_LLAMA_PORT:-49400}
BIN=${SIMPLER_LLAMA_BIN:-llama-server}
MODEL=${SIMPLER_MODEL_GGUF:-}
CHECK='explicit path via SIMPLER_MODEL_GGUF, NOT hash-checked'

if [ -z "$MODEL" ]; then
  # --path --verify prints the best candidate and nothing else, and exits 2 when there
  # is none OR when its sha256 does not match the pin above (fail-closed). The hash
  # takes about 15 s on the 3.3 GB file; without it "pinned by content" was a comment,
  # not a check (audit B3, 2026-09-13: --path alone accepted any file of the right name
  # or size). stderr is suppressed so a missing model reads as the guidance below.
  MODEL=$(node "$DIR/../locate-model.mjs" --path --verify 2>/dev/null) || MODEL=''
  CHECK='sha256 verified against the pin'
fi

if [ -z "$MODEL" ]; then
  cat >&2 <<'EOF'

  No model found. The E2B is not shipped with this repo (3.3 GB).
  A copy whose sha256 does not match the pin is refused and reads as not found.
  Look for one already on this machine, and see which candidates fail the hash:
      node locate-model.mjs --verify
  Or point at one explicitly (that path is NOT hash-checked):
      export SIMPLER_MODEL_GGUF=/path/to/gemma-4-E2B_q4_0-it.gguf

EOF
  exit 2
fi

echo "llama-server  port $PORT  model $MODEL  ($CHECK)"
exec "$BIN" --model "$MODEL" --port "$PORT" --host 127.0.0.1 --ctx-size 8192 --parallel 1 --jinja --chat-template-kwargs '{"enable_thinking":false}'
