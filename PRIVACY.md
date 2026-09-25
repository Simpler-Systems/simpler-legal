# Privacy

Simpler Legal is a desktop app for Windows that redacts documents on your own computer. This
file says what the app sends, to where, and what it keeps on disk. It describes the code in
this repository at version 0.1.0 and names the file each statement rests on (paths in the
source repository, github.com/Simpler-Systems/simpler-legal). No packet
capture of the packaged app, its installer or the WebView2 runtime it runs in is on record;
what is below is read from the code and the installer's configuration.

## What reaches us

Nothing. The app has no account, no telemetry or usage analytics, no crash reporting, no
update check and no updater (`app/src-tauri/Cargo.toml` and `app/frontend/package.json` list
no such component). Simpler Terminal Value Systems Pte Ltd runs no server the app talks to,
and receives no personal data from it: not your documents, not the names you add, not the key
from tags back to names, not the redacted copies.

## Where the app connects

Only to 127.0.0.1, the computer's own loopback address:

- port 1436, the engine service (`serve-legal.mjs`, run by the `node.exe` the installer
  carries);
- port 49400, the model server (llama.cpp's `llama-server.exe`, which the installer carries);
- loopback ports the system assigns while the app runs, where the app's relay carries the
  engine's requests to the model server (`app/src-tauri/src/relay.rs`).

Every request the app's window makes is written to 127.0.0.1, and its Content-Security-Policy
(`default-src 'self'`, in `app/src-tauri/tauri.conf.json`) lets the window load only from the
app itself. Outside comments, the app's TypeScript and Rust code holds one `https://` address:
where Google publishes the model file, which Setup and Settings show as text for you to copy
(`MODEL_URL` in `app/frontend/src/screens/Setup.tsx`). The app never requests it.
`tools/site-claims.mjs` fails when the app's code requests anything other than 127.0.0.1,
holds another `https://` address outside a comment line, or uses that one other than as text
on a screen.

Every process the app starts has `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and
`NODE_USE_ENV_PROXY` removed from its environment, and `--use-env-proxy` taken out of
`NODE_OPTIONS` (`scrub_proxy` in `app/src-tauri/src/engine.rs`).

The model server the app starts is started with llama.cpp's own settings that would make it
connect to another computer removed from its environment: `LLAMA_ARG_RPC`, which sends the
model's work to other computers, the settings that download a model (`LLAMA_ARG_HF_REPO`,
`LLAMA_ARG_MODEL_URL` and others like them) and `HF_TOKEN`. It is also started with
`LLAMA_OFFLINE=1`, which llama.cpp's help describes as preventing network access
(`spawn_launcher` in `app/src-tauri/src/engine.rs`). That has not yet been run against a live
model server.

## Connections that are not the app's

- **Installing WebView2.** The app draws its window with Microsoft's WebView2 runtime, which
  Windows 11 includes. The installer leaves the WebView2 setting at Tauri's default: if the
  runtime is missing from the computer, the installer downloads Microsoft's WebView2 installer
  from `https://go.microsoft.com/fwlink/p/?LinkId=2124703` and runs it without a prompt. If the
  runtime is there, the installer does not connect. This is read from Tauri's installer
  template and the configuration; no install has been captured. What WebView2 itself sends is
  Microsoft's and has not been measured.
- **Getting the model.** The app does not download the model. You download
  `gemma-4-E2B_q4_0-it.gguf` yourself from Google's Hugging Face repository, in your browser;
  that request is between you and Hugging Face, under their terms. The app then finds the file
  on disk and checks its SHA-256 before it uses it.
- **What you do with the redacted copy.** Sending the redacted copy to an AI service, or to
  anyone, is something you do outside the app. The copy button puts text on the Windows
  clipboard, where Windows' own clipboard settings apply.
- **The website.** simpler.legal is a static page. Its one request to another site is the
  home page asking `api.github.com` for the repository's star count. Where the site is
  hosted, and what that host records, is not set in this repository.

## What is kept on your computer

| What | Where | For how long |
|---|---|---|
| Your always-redact list (it can hold client names) and two settings, Practice and These documents | The app's web storage, in WebView2's data folder under `%LOCALAPPDATA%\legal.simpler.app` (`protected.ts`, `practice.ts`, `profile.ts` in `app/frontend/src/lib/`) | Until you change them or delete that folder |
| Working copies while the engine runs a document: the unredacted text and the key from tags back to names | `engine\raw\stripped\_serve\` in the install folder, by default `%LOCALAPPDATA%\simpler.legal` (`serve-legal.mjs`; `serve_dir` in `engine.rs`) | Deleted when the run ends. If the app or the service is killed, until the next start of the app or of a service on that port, which removes them first (`sweep_stale_once` in `engine.rs`); the app's sweep deletes nothing when it cannot read which ports are in use. When a run could not remove them, the screen and the receipt say so |
| Two logs: `legal-serve.log` (the engine service's status lines) and `legal-llama-server.log` (llama.cpp's console output) | `%LOCALAPPDATA%\Simpler AI\logs\` (`log_dir` in `engine.rs`) | Rewritten each time the app starts the service or the model server |
| `legal-app-exit.log`: a line with the time, written only when the app has to end itself after its window has closed (its event loop did not finish), saying what it did to stop the engine. No document text and no paths | The same folder (`exit_guard.rs`) | Kept until the file passes 256 KB, then deleted at the app's next start. An ordinary close writes nothing to it |
| A token file, only for an engine service you start by hand with `node serve-legal.mjs` | `%LOCALAPPDATA%\Simpler AI\run\legal-service-<port>.token` | Removed when that service exits normally, or by the app's next start once nothing listens on that port; the service the app starts keeps its token in memory and writes no file (`--no-token-file` in `engine.rs`) |
| The model file | Wherever you saved it; the app reads it in place | Until you delete it |
| Redacted copies, receipts and name keys you save | Wherever you choose in the Save dialog | Until you delete them |

The app keeps no document history between sessions (`app/frontend/src/screens/History.tsx`).
The app's in-app engine, its fallback, writes nothing to disk.

The two engine logs, and the exit log, have your Windows profile path and account name (three characters or longer)
replaced with `%USERPROFILE%` and `%USERNAME%` in each line (`redact` in `engine.rs`). In one
measured model-server log (347 lines) the account name appeared only inside the model's path
and no document text appeared; the logs have not been checked under every setting, and an
account name with non-ASCII letters can survive in the launcher's own line (not tested).
Earlier builds kept these logs in `%APPDATA%\Simpler AI\logs`; the app deletes those two files
when it starts.

To find the model the app lists a fixed set of folders (`search_dirs` in
`app/src-tauri/src/main.rs`: the folder named in `SIMPLER_MODEL_PATH`,
`%APPDATA%\Simpler AI\models`, your Downloads folder, `~\models`, and the model folders of
Hugging Face, LM Studio, GPT4All, Jan and Ollama, among others). It reads the names and sizes
of the files there, no more than two folders down, and hashes only the file it picks. It never
searches the whole disk.

## Uninstalling

Windows' uninstaller for the app removes the program files. If you tick its box to delete the
application data, it also deletes `%APPDATA%\legal.simpler.app` and
`%LOCALAPPDATA%\legal.simpler.app`, which holds the always-redact list and the two settings.
It does not delete `%LOCALAPPDATA%\Simpler AI\` (the logs, and any token file), the model
file, the files you saved, or working copies left in the install folder by a run that was
killed and never followed by another start; delete those yourself. This is read from Tauri's
installer template; no uninstall has been captured.
