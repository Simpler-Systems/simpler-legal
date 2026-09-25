@echo off
REM ===========================================================================
REM  launch-server.cmd - THE FROZEN SERVER LAUNCHER (Windows)
REM
REM  (ASCII only, deliberately: cmd.exe mis-parses REM lines containing
REM  non-ASCII bytes under some console codepages. Do not add em-dashes here.)
REM
REM  FREEZE.md names this script as the ONLY way the model half of the frozen
REM  v1-legal configuration may be served. The flags below are part of the
REM  frozen configuration: ctx-size, parallel, jinja and the thinking-disabled
REM  chat template all shaped the measured boards. Do not "improve" them -
REM  changing a flag invalidates every model-half receipt in BENCHMARK.md.
REM
REM  Model, pinned by CONTENT and never by filename (MODEL_DISCOVERY.md):
REM    gemma-4-E2B_q4_0-it.gguf   3,349,514,112 bytes
REM    sha256 3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd
REM    Verify yours:  node locate-model.mjs --verify
REM
REM  Neither the model (*.gguf) nor the llama.cpp build (llama-cuda/) is a repo
REM  asset - both are gitignored and located on your machine at run time.
REM
REM  Overrides, all optional:
REM    SIMPLER_LLAMA_PORT   serving port        (default 49400, the frozen port)
REM    SIMPLER_LLAMA_BIN    llama-server binary (default: llama-server on PATH)
REM    SIMPLER_MODEL_GGUF   explicit model path (default: node locate-model.mjs)
REM
REM    tools\launch-server.cmd
REM
REM  Then probe ONE completion and assert the content is non-empty before any
REM  run - health is not a contract check (OPS_LEDGER.md, 2026-07-23).
REM ===========================================================================
setlocal

if "%SIMPLER_LLAMA_PORT%"=="" set "SIMPLER_LLAMA_PORT=49400"
if "%SIMPLER_LLAMA_BIN%"=="" set "SIMPLER_LLAMA_BIN=llama-server"

if "%SIMPLER_MODEL_GGUF%"=="" goto :locate
set "SIMPLER_MODEL_CHECK=explicit path via SIMPLER_MODEL_GGUF, NOT hash-checked"
goto :have_model
:locate
REM --path --verify prints the best candidate and nothing else, and exits 2 when there
REM is none OR when its sha256 does not match the pin above (fail-closed). The hash
REM takes about 15 s on the 3.3 GB file; without it "pinned by content" was a comment,
REM not a check (audit B3, 2026-09-13: --path alone accepted any file of the right name
REM or size). stderr is suppressed so a missing model reads as the guidance below.
for /f "usebackq delims=" %%i in (`node "%~dp0..\locate-model.mjs" --path --verify 2^>nul`) do set "SIMPLER_MODEL_GGUF=%%i"
set "SIMPLER_MODEL_CHECK=sha256 verified against the pin"
:have_model

if "%SIMPLER_MODEL_GGUF%"=="" (
  echo.
  echo   No model found. The E2B is not shipped with this repo ^(3.3 GB^).
  echo   A copy whose sha256 does not match the pin is refused and reads as not found.
  echo   Look for one already on this machine, and see which candidates fail the hash:
  echo       node locate-model.mjs --verify
  echo   Or point at one explicitly ^(that path is NOT hash-checked^):
  echo       set "SIMPLER_MODEL_GGUF=C:\path\to\gemma-4-E2B_q4_0-it.gguf"
  echo.
  exit /b 2
)

echo llama-server  port %SIMPLER_LLAMA_PORT%  model %SIMPLER_MODEL_GGUF%  (%SIMPLER_MODEL_CHECK%)
"%SIMPLER_LLAMA_BIN%" --model "%SIMPLER_MODEL_GGUF%" --port %SIMPLER_LLAMA_PORT% --host 127.0.0.1 --ctx-size 8192 --parallel 1 --jinja --chat-template-kwargs "{\"enable_thinking\":false}"
