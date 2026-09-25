// simpler.legal — the Tauri shell. The frontend is app/frontend (React + Vite;
// tauri.conf.json frontendDist = ../frontend/dist) — app/ui/index.html is an older
// design mock kept for reference and is NOT loaded.
//
// What this shell implements (audit B9, 2026-09-13 — until then it registered NO
// commands, so every `invoke` the frontend made failed in the packaged app):
//   write_text_file  — the one road to disk behind lib/tauri.ts saveTextFile
//   model_check      — the bounded model search + optional sha256 (locate-model.mjs's twin)
// and, since the organs port later the same day (engine.rs — FREEZE.md shelf item 7):
//   server_start / server_status      — the frozen launcher + the adapter, each spawned under
//                                       a kill-on-close job object (job_object.rs)
//   legal_service_health / strip_proxy — the adapter (127.0.0.1:1436) reached from Rust,
//                                       so the webview CSP stays default-src 'self'; it
//                                       proves itself first (service_auth.rs), and its chain
//                                       reaches the model only through relay.rs, which checks
//                                       every connection's far end before writing to it; a
//                                       model that exits mid-run stops the run (model_watch.rs)
//   complete_local                     — the in-webview core's model call, sent only on a
//                                       connection whose far end is the model server
//                                       port_owner.rs vouched for (relay::connect_verified);
//                                       the answer names that process, for the receipt
// Every command is mirrored in lib/tauri.ts, the single IPC chokepoint.
// Not a command: window_icon.rs gives the window the exe's icon at the size the display asks
// for, because Tauri's own is the 16px frame stretched (the blurry taskbar icon, 2026-09-25).
// Not a command either: exit_guard.rs, which ends the process after its window is gone even
// when tao's event loop does not finish (2 of 8 closes on 2026-09-25 left the engine running).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engine;
mod exit_guard;
#[cfg(target_os = "windows")]
mod job_object;
#[cfg(target_os = "windows")]
mod model_watch;
#[cfg(target_os = "windows")]
mod port_owner;
#[cfg(target_os = "windows")]
mod relay;
mod service_auth;
#[cfg(target_os = "windows")]
mod window_icon;

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// The pinned model — the SAME three numbers as locate-model.mjs CATALOG and the
/// launchers' headers. Pinned by content: the name is a hint, the hash is the check.
/// engine.rs checks a model server this app did not start, and an explicit
/// SIMPLER_MODEL_GGUF, against the same pin before any text is sent to it.
const MODEL_FILE: &str = "gemma-4-E2B_q4_0-it.gguf";
pub(crate) const MODEL_BYTES: u64 = 3_349_514_112;
pub(crate) const MODEL_SHA256: &str = "3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd";

/// Mirrors lib/tauri.ts ModelStatus. `verified` is None until a hash was computed —
/// never a default true; `error` says why a requested hash could not run.
#[derive(Serialize)]
struct ModelStatus {
    found: bool,
    path: Option<String>,
    verified: Option<bool>,
    searched: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// The frontend's one road to disk: the dialog plugin picks the path (user consent is
/// the dialog itself), this writes the bytes. Nothing else in the app writes files.
/// Sync, and so is its twin: a sync command runs on the UI thread, which also delivers the
/// close, so no close can start while a write runs (exit_guard.rs has no save guard for that
/// reason). Making either `async` would need one.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents.as_bytes()).map_err(|e| format!("{}: {}", path, e))
}

/// The binary twin, for the redacted .docx (lib/tauri.ts saveBinaryFile). The bytes
/// cross the IPC bridge as standard base64; the decoder below refuses anything that is
/// not exactly that, so a mangled payload fails here and never becomes a file.
#[tauri::command]
fn write_binary_file(path: String, base64: String) -> Result<(), String> {
    let bytes = decode_base64(&base64).map_err(|e| format!("{}: {}", path, e))?;
    std::fs::write(&path, bytes).map_err(|e| format!("{}: {}", path, e))
}

fn decode_base64(s: &str) -> Result<Vec<u8>, String> {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut table = [255u8; 256];
    for (i, c) in ALPHABET.iter().enumerate() {
        table[*c as usize] = i as u8;
    }
    let input: Vec<u8> = s.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if input.len() % 4 != 0 {
        return Err("bad base64 length".into());
    }
    let mut out = Vec::with_capacity(input.len() / 4 * 3);
    for chunk in input.chunks(4) {
        let pad = chunk.iter().rev().take_while(|b| **b == b'=').count();
        if pad > 2 {
            return Err("bad base64 padding".into());
        }
        let mut acc: u32 = 0;
        for (i, b) in chunk.iter().enumerate() {
            let v = if *b == b'=' && i >= 4 - pad { 0 } else { table[*b as usize] };
            if v == 255 {
                return Err("bad base64 character".into());
            }
            acc = (acc << 6) | v as u32;
        }
        out.push((acc >> 16) as u8);
        if pad < 2 {
            out.push((acc >> 8) as u8);
        }
        if pad < 1 {
            out.push(acc as u8);
        }
    }
    Ok(out)
}

fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

/// Ordered and bounded — the list in locate-model.mjs searchDirs(), no full-disk crawl
/// (a redaction product does not scan the desktop; past this list the user points a
/// file picker).
fn search_dirs() -> Vec<(String, PathBuf)> {
    let mut dirs: Vec<(String, PathBuf)> = Vec::new();
    if let Some(p) = std::env::var_os("SIMPLER_MODEL_PATH") {
        dirs.push(("env:SIMPLER_MODEL_PATH".into(), PathBuf::from(p)));
    }
    let Some(home) = home() else { return dirs; };
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Roaming"));
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Local"));
    let xdg = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".local").join("share"));
    let canonical = if cfg!(target_os = "windows") {
        appdata.join("Simpler AI").join("models")
    } else if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support").join("Simpler AI").join("models")
    } else {
        xdg.join("simpler-ai").join("models")
    };
    dirs.push(("canonical".into(), canonical));
    // legacy per-app dirs (pre-convention installs of any vertical)
    for v in ["simpler-red", "simpler-legal", "simpler-med", "simpler-capital", "simpler-tax", "simpler-harness"] {
        dirs.push((format!("legacy:{v}"), local.join(v).join("models")));
        dirs.push((format!("legacy:{v}"), appdata.join(v).join("models")));
    }
    // ecosystem caches, shallow
    dirs.push(("hf-cache".into(), home.join(".cache").join("huggingface").join("hub")));
    dirs.push(("lmstudio".into(), home.join(".lmstudio").join("models")));
    dirs.push(("lmstudio".into(), home.join(".cache").join("lm-studio").join("models")));
    dirs.push(("gpt4all".into(), local.join("nomic.ai").join("GPT4All")));
    dirs.push(("gpt4all".into(), xdg.join("nomic.ai").join("GPT4All")));
    dirs.push(("jan".into(), home.join("jan").join("models")));
    dirs.push(("ollama-blobs".into(), home.join(".ollama").join("models").join("blobs")));
    dirs.push(("user".into(), home.join("Downloads")));
    dirs.push(("user".into(), home.join("models")));
    dirs
}

/// files at most 2 levels deep (HF / LM Studio nest one dir per repo), never deeper
fn files_in(dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return; };
    for e in rd.flatten() {
        let p = e.path();
        match e.file_type() {
            Ok(t) if t.is_file() => out.push(p),
            Ok(t) if t.is_dir() && depth < 2 => files_in(&p, depth + 1, out),
            _ => {}
        }
    }
}

struct Candidate {
    path: PathBuf,
    size_match: bool,
    name_match: bool,
    canonical: bool,
}

/// streamed, 1 MiB at a time — the file is 3.3 GB and must never be read whole
pub(crate) fn sha256_of(path: &Path) -> std::io::Result<String> {
    let mut f = std::fs::File::open(path)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}

/// `node locate-model.mjs [--verify]`, in Rust: name-or-size candidates from the
/// bounded list (blob stores match by size, others by name), best = canonical first,
/// then name+size, then size. With `verify` the best candidate is hashed; a hash that
/// could not be computed is reported as an error, not as unverified.
#[tauri::command]
fn model_check(verify: bool) -> ModelStatus {
    let dirs = search_dirs();
    let searched: Vec<String> = dirs.iter().map(|(_, d)| d.display().to_string()).collect();
    let mut cands: Vec<Candidate> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let want = MODEL_FILE.to_lowercase();
    for (label, dir) in &dirs {
        let mut files = Vec::new();
        files_in(dir, 0, &mut files);
        for p in files {
            let key = p.to_string_lossy().to_lowercase();
            if seen.contains(&key) {
                continue;
            }
            let Ok(md) = std::fs::metadata(&p) else { continue; };
            let name_match = key.ends_with(&want);
            let size_match = md.len() == MODEL_BYTES;
            if !name_match && !size_match {
                continue;
            }
            seen.insert(key);
            cands.push(Candidate { path: p, size_match, name_match, canonical: label == "canonical" });
        }
    }
    cands.sort_by(|a, b| {
        b.canonical
            .cmp(&a.canonical)
            .then((b.size_match && b.name_match).cmp(&(a.size_match && a.name_match)))
            .then(b.size_match.cmp(&a.size_match))
    });
    let Some(best) = cands.first() else {
        return ModelStatus { found: false, path: None, verified: None, searched, error: None };
    };
    let (verified, error) = if verify {
        match sha256_of(&best.path) {
            Ok(h) => (Some(h == MODEL_SHA256), None),
            Err(e) => (None, Some(format!("could not hash {}: {}", best.path.display(), e))),
        }
    } else {
        (None, None)
    };
    ModelStatus { found: true, path: Some(best.path.display().to_string()), verified, searched, error }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(engine::EngineState::default())
        .setup(|_app| {
            #[cfg(target_os = "windows")]
            if let Some(w) = _app.get_webview_window("main") {
                match w.hwnd() {
                    Ok(h) => {
                        window_icon::apply(h.0);
                        exit_guard::fault::install();
                        exit_guard::start(h.0, _app.state::<engine::EngineState>().inner().clone());
                    }
                    Err(e) => eprintln!("window icon and exit watchdog: no window handle ({e})"),
                }
            }
            Ok(())
        })
        // A move to a display at another scale, or a change of scale, asks for other sizes.
        .on_window_event(|_window, _event| {
            #[cfg(target_os = "windows")]
            if let tauri::WindowEvent::ScaleFactorChanged { .. } = _event {
                if let Ok(h) = _window.hwnd() {
                    window_icon::apply(h.0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            write_binary_file,
            model_check,
            engine::server_start,
            engine::server_status,
            engine::legal_service_health,
            engine::complete_local,
            engine::strip_proxy
        ])
        .build(tauri::generate_context!())
        .expect("error while building simpler.legal")
        // The close is the one moment the app can delete what a killed adapter leaves on disk: the
        // job kills the adapter mid-run, and a killed process runs no cleanup (LAUNCH.md §2.5).
        .run(|app, event| match event {
            // tauri-runtime-wry 2.11.4 (lib.rs:4310-4322) sends this once the last window is gone,
            // then sets ControlFlow::Exit. RunEvent::Exit also needs tao to paint once more, and on
            // 2026-09-25 it twice never did: the engine outlived the window (exit_guard.rs). This
            // app has one window and never prevents an exit, so this means exit: the engine goes
            // now, and tao is sent what re-arms that paint. If prevent_exit, a close listener, a
            // tray or a second window is ever added, this must move behind that decision.
            tauri::RunEvent::ExitRequested { api, .. } => {
                exit_guard::requested();
                if exit_guard::fault::prevent() {
                    api.prevent_exit();
                    return;
                }
                exit_guard::fault::eat_next_paint();
                engine::shutdown(&app.state::<engine::EngineState>());
                exit_guard::nudge(app);
            }
            // A no-op after ExitRequested (shutdown runs once); the only teardown on WM_ENDSESSION,
            // which ends the loop without ExitRequested (tao event_loop.rs:2384-2388).
            tauri::RunEvent::Exit => {
                exit_guard::loop_finished();
                engine::shutdown(&app.state::<engine::EngineState>());
            }
            _ => {}
        });
}
