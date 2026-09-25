//! engine.rs — the engine organs for packaged mode: FREEZE.md shelf item 7 ("the Tauri
//! Rust organs port"), the product gap main.rs's header named as still open on 2026-09-13.
//!
//! Shape ported from simpler-harness (local_server.rs: spawn, the tri-state health probe,
//! the completion transport; job_object.rs: the kill-on-close job). What is deliberately
//! NOT ported: the harness composes its own llama-server argv and picks flags per device.
//! Here FREEZE.md line 10 makes tools/launch-server.cmd the ONLY way the model half is
//! served, so this file spawns that launcher as-is — environment only, never argv — and
//! the adapter serve-legal.mjs, which hosts the frozen chain. Both children, and every
//! grandchild (llama-server under cmd.exe, the four chain stages under node), sit in
//! kill-on-close job objects, one per child, so closing or crashing the app takes them down
//! and the adapter's can be stopped alone.
//!
//! Five commands, mirrored one-for-one in lib/tauri.ts (the single IPC chokepoint):
//!   server_start          spawn whatever is not already running; returns server_status
//!   server_status         the model server: {running, healthy, port, origin, refused, notes}
//!   legal_service_health  the adapter, once it has proved itself: {ok, llama, engine, port,
//!                         service, model, notes}; null when absent; an error when refused
//!   complete_local        one non-streaming chat completion (the in-webview core's calls),
//!                         and which model process answered it
//!   strip_proxy           POST /strip on the adapter; every NDJSON line relayed on a Channel
//! All of it speaks to 127.0.0.1 only; the webview CSP stays default-src 'self'.
//!
//! WHO GETS THE DOCUMENT (LAUNCH.md §2.4, site-audit L7). Loopback ports belong to the
//! machine, not to a user: on a shared Windows host (RDS, Citrix) another account can bind
//! 1436 or 49400 first and would receive the unredacted document; and a model server that was
//! already answering would be used without the launcher's model hash ever running. So nothing
//! leaves this process until the receiver has been established:
//!   adapter (1436)  must answer a fresh challenge with HMAC(token, …) — service_auth.rs.
//!                   The token is 32 random bytes made here at launch and handed to the
//!                   adapter this app spawns in its environment (never argv), or the token a
//!                   hand-started adapter wrote to the user's own profile (the developer
//!                   flow). The challenge and the document travel on ONE connection.
//!   model (49400)   llama-server cannot prove anything, so the kernel's TCP table says who
//!                   holds the port (port_owner.rs): this app's job, used as is; your own
//!                   account, used only after the model file it reports has matched the pin
//!                   and it reports the frozen context size and slot count; anyone else,
//!                   refused. That decides WHICH process may be sent text. Every connection
//!                   that carries text is then checked on its own: the chain's stages reach
//!                   the model only through relay.rs, and complete_local through the same
//!                   connect_verified, which write nothing on a connection until the kernel
//!                   names the checked process as the owner of its far end. strip_proxy
//!                   holds a run to the process it was checked against and stops it if that
//!                   changes or exits (relay.rs, model_watch.rs).
//!   the model key   the model server this app starts gets a per-launch LLAMA_API_KEY and
//!                   /slots off, through its environment (the launcher's argv is frozen).
//!                   Only relay.rs and complete_local hold the key, so a web page open on
//!                   this computer can neither send the model text nor read what it was sent.
//!   proxies         every child starts with the proxy variables removed and Node's
//!                   --use-env-proxy taken out of NODE_OPTIONS (scrub_proxy), so no setting
//!                   in the user's environment can route the chain's model calls elsewhere.
//! Every refusal names the port, who holds it where Windows says, and the way through. A
//! service or model this app did not start is used, but never silently: `origin: "hand"` goes
//! to the screen, and a strip it served carries which of the two onto the receipt.
//!
//! Layout the packaged app expects (tauri.conf.json bundle.externalBin + bundle.resources):
//!   <exe dir>/node.exe   the Node runtime (sidecar "binaries/node", triple suffix stripped)
//!   <exe dir>/engine/    serve-legal.mjs, strip-batch.mjs, apply-{v2,ln,lq}.mjs,
//!                        locate-model.mjs, lib-core/, lib-legal/, pii-bench/vocab-*.json,
//!                        tools/launch-server.cmd. raw/ is CREATED here at run time: the
//!                        frozen strip-batch.mjs resolves its scratch as
//!                        join(ROOT,'raw','stripped',…), so the install dir must be writable
//!                        — NSIS installMode currentUser, and server_start checks first.
//!   <exe dir>/llama/     a llama.cpp build (llama-server.exe + its DLLs)
//! Dev tree (cargo run under app/src-tauri/target): the engine root is the first ancestor of
//! the exe holding serve-legal.mjs, node is `node` on PATH, llama-server is
//! <root>/llama-cuda/llama-server.exe (the slot the launcher's header names) or PATH.

use crate::service_auth::{self, Conn, Hello};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;

/// The frozen serving port (tools/launch-server.cmd) and the adapter's (serve-legal.mjs).
pub const LLAMA_PORT: u16 = 49400;
pub const LEGAL_PORT: u16 = 1436;

#[derive(Default)]
struct Children {
    launcher: Option<Child>,
    adapter: Option<Child>,
}

/// Managed by tauri::Builder; the Arc lets the blocking work run off the async runtime.
#[derive(Default, Clone)]
pub struct EngineState(Arc<Mutex<Children>>);

/// Who started the process on the other end. Mirrors lib/tauri.ts Origin.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    /// this app, this launch
    App,
    /// not this app: started by hand (the developer flow), or by another copy of the app
    Hand,
}

/// Mirrors lib/tauri.ts ServerStatus. `healthy` now also means "may be sent text": a model
/// server that answers but was refused is `healthy: false` with the reason in `refused`.
/// `adapter_spawned`: this call started the engine service, so lib/tauri.ts waits the moment
/// it needs to come up before it decides the frozen pipeline is not there.
#[derive(Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub healthy: bool,
    pub port: u16,
    pub origin: Option<Origin>,
    pub refused: Option<String>,
    pub notes: Vec<String>,
    #[serde(rename = "adapterSpawned")]
    pub adapter_spawned: bool,
}

/// Mirrors lib/tauri.ts LegalServiceHealth (plus the port, which the adapter reports).
#[derive(Serialize)]
pub struct LegalHealth {
    pub ok: bool,
    pub llama: bool,
    pub engine: String,
    pub port: u16,
    pub service: Origin,
    pub model: Origin,
    pub notes: Vec<String>,
}

/// What strip_proxy returns once the stream has ended: who served the run, for the receipt.
#[derive(Serialize)]
pub struct StripMeta {
    pub service: Origin,
    pub model: Origin,
}

/// strip_proxy's error. `incident` is set only when a run was stopped partway because the
/// model server it was checked against changed or exited (relay.rs, model_watch.rs), so
/// lib/tauri.ts can mark THIS document's receipt and keep the words on screen after the
/// in-app core has taken it over, instead of losing them in a progress line.
///
/// `reached`: the document had started to go out to the engine service when the run failed,
/// and `service` / `model` say who started that service and the model server its run was held
/// to. Without them a run that received the whole document and then failed was receipted "the
/// frozen legal pipeline was not reachable", word for word the receipt of one that was never
/// dialled, and a service started by hand that read the document was named nowhere (wf5 S5L-1).
#[derive(Serialize)]
pub struct StripError {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incident: Option<String>,
    pub reached: bool,
    pub service: Option<Origin>,
    pub model: Option<Origin>,
    /// A run stopped on the service this app started: the app terminated that service, which
    /// ran no cleanup, and its own sweep then found this run's working tree (the unredacted
    /// document and its span-to-tag key) still on disk. That was said only by eprintln, which a
    /// release build has nowhere to show, and the receipt said nothing (wf6 SL-4).
    #[serde(rename = "leftOnDisk")]
    pub left_on_disk: bool,
    /// The run was stopped because one of the model's answers to it was not a whole one (relay.rs
    /// CUT_OFF), not because the model server changed: the receipt says which (owner ruling 15).
    #[serde(rename = "cutOff")]
    pub cut_off: bool,
}

impl From<String> for StripError {
    fn from(message: String) -> Self {
        StripError { message, incident: None, reached: false, service: None, model: None, left_on_disk: false, cut_off: false }
    }
}

/// Set when this app spawned the adapter, so the exit hook knows the working tree is its to
/// clean (engine::shutdown).
static ADAPTER_SPAWNED: AtomicBool = AtomicBool::new(false);

/// The adapter this app spawned, by pid and creation time: relay.rs admits it and its direct
/// children even when Windows would not put it in the adapter job (a parent job that forbids
/// nesting), because otherwise every model call of the chain would be refused and its result
/// would carry sweeps that never ran.
#[cfg(windows)]
fn spawned_adapter() -> &'static Mutex<Option<(u32, u64)>> {
    static A: OnceLock<Mutex<Option<(u32, u64)>>> = OnceLock::new();
    A.get_or_init(Default::default)
}

// What the relay replaced, stated because the old words overclaimed. Until 2026-09-23 a run
// was guarded by reading the listener table every 20 ms (WATCH_EVERY). Its record, "the
// process that took the port received 0 requests in 4 of 4 runs", was four samples of a race,
// not a bound: a process that bound the port beside a live holder, or took it inside one
// interval, could be handed a connection with a chunk of the document on it, and nothing
// measured how often. relay.rs checks every connection before a byte is written on it, which
// needs no interval; model_watch.rs now only waits on the checked process's exit.

/// The relay the frozen chain reaches the model through, started once per launch.
#[cfg(windows)]
fn relay() -> Result<&'static crate::relay::Relay, String> {
    static R: OnceLock<Result<crate::relay::Relay, String>> = OnceLock::new();
    R.get_or_init(|| {
        crate::relay::Relay::start(EnginePolicy).map_err(|e| {
            format!("The app could not open the loopback port its engine reaches the model through ({e}), so it started no engine service and sent nothing.")
        })
    })
    .as_ref()
    .map_err(Clone::clone)
}

/// What relay.rs asks of this file.
#[cfg(windows)]
struct EnginePolicy;

#[cfg(windows)]
impl crate::relay::Policy for EnginePolicy {
    fn admit(&self, pid: u32) -> Result<(), String> {
        if crate::port_owner::in_job(crate::job_object::Kind::Adapter, pid) {
            return Ok(());
        }
        if let Some(root) = spawned_adapter().lock().ok().and_then(|g| *g) {
            if crate::relay::in_tree(pid, root) {
                return Ok(());
            }
        }
        Err(format!("process {pid} is not the engine service this app started, nor a stage it ran"))
    }

    fn target(&self) -> Result<crate::relay::Target, String> {
        model_target(LLAMA_PORT)
    }
}

/// The model process that may be sent text now, named for relay.rs; the key only for the one
/// this app started, which is the only one that was given it.
#[cfg(windows)]
fn model_target(port: u16) -> Result<crate::relay::Target, String> {
    model_target_of(port).map(|(t, _)| t)
}

/// model_target, and who started that process, for complete_local's answer.
#[cfg(windows)]
fn model_target_of(port: u16) -> Result<(crate::relay::Target, Origin), String> {
    let v = trusted_model(port)?.ok_or_else(|| format!("nothing is serving on 127.0.0.1:{port} yet"))?;
    let key = match v.origin {
        Origin::App => Some(model_key()?.to_string()),
        Origin::Hand => None,
    };
    Ok((crate::relay::Target { port, pid: v.pid, created: v.created, key }, v.origin))
}

/// The launcher, when Windows would not put it in the model job (a parent job that forbids
/// nesting). port_owner.rs then sees its llama-server as "your own account, not this app",
/// and the screen would say a model server this app started was started outside it. So its
/// pid and creation time are kept, and a same-account holder whose parent is that launcher,
/// created after it while it still runs, is this app's.
#[cfg(windows)]
fn unjobbed_launcher() -> &'static Mutex<Option<(u32, u64)>> {
    static L: OnceLock<Mutex<Option<(u32, u64)>>> = OnceLock::new();
    L.get_or_init(Default::default)
}

// ── where things are ──────────────────────────────────────────────────────────

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}

/// SIMPLER_ENGINE_ROOT, else <exe dir>/engine (packaged), else the first ancestor of the
/// exe that holds serve-legal.mjs (dev tree). Fail-loud with the paths that were tried.
fn engine_root() -> Result<PathBuf, String> {
    if let Some(p) = std::env::var_os("SIMPLER_ENGINE_ROOT") {
        let p = PathBuf::from(p);
        return if p.join("serve-legal.mjs").is_file() {
            Ok(p)
        } else {
            Err(format!("SIMPLER_ENGINE_ROOT={} holds no serve-legal.mjs", p.display()))
        };
    }
    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    if let Some(dir) = exe.parent() {
        let packaged = dir.join("engine");
        if packaged.join("serve-legal.mjs").is_file() {
            return Ok(packaged);
        }
    }
    for a in exe.ancestors() {
        if a.join("serve-legal.mjs").is_file() {
            return Ok(a.to_path_buf());
        }
    }
    Err(format!(
        "engine not found: no engine/serve-legal.mjs beside {} and no ancestor directory holds serve-legal.mjs",
        exe.display()
    ))
}

/// SIMPLER_NODE, else the sidecar beside the exe, else `node` on PATH (dev tree).
fn node_bin() -> PathBuf {
    if let Some(p) = std::env::var_os("SIMPLER_NODE") {
        return PathBuf::from(p);
    }
    if let Some(d) = exe_dir() {
        let s = d.join(format!("node{}", std::env::consts::EXE_SUFFIX));
        if s.is_file() {
            return s;
        }
    }
    PathBuf::from("node")
}

/// SIMPLER_LLAMA_BIN, else <exe dir>/llama/llama-server (bundled build), else
/// <root>/llama-cuda/llama-server (the launcher header's local-build slot). None means the
/// launcher's own default applies: `llama-server` on PATH.
fn llama_bin(root: &Path) -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("SIMPLER_LLAMA_BIN") {
        return Some(PathBuf::from(p));
    }
    let name = format!("llama-server{}", std::env::consts::EXE_SUFFIX);
    let mut cands = Vec::new();
    if let Some(d) = exe_dir() {
        cands.push(d.join("llama").join(&name));
    }
    cands.push(root.join("llama-cuda").join(&name));
    cands.into_iter().find(|c| c.is_file())
}

/// Where the engine's children log: %LOCALAPPDATA%\Simpler AI\logs\<name>.log, truncated per
/// start. Not the family's roaming %APPDATA%: a roaming profile is copied to a file server at
/// sign-out, and these logs said who the user is. Measured 2026-09-23 on the roaming
/// legal-llama-server.log of a real run (347 lines): the Windows account name appeared twice,
/// both inside the model's path (the launcher's echo line and llama-server's load line), and no
/// document text at llama-server's default verbosity, which spawn_launcher pins. legal-serve.log
/// (1 line) named no one, but its discard failures print the engine path, which holds the
/// profile on a per-user install. So each line is also redacted on the way in (redact below).
pub(crate) fn log_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).or_else(|| {
            std::env::var_os("USERPROFILE").map(|h| PathBuf::from(h).join("AppData").join("Local"))
        })?;
        Some(local.join("Simpler AI").join("logs"))
    } else {
        let state = std::env::var_os("XDG_STATE_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("state")))?;
        Some(state.join("simpler-ai").join("logs"))
    }
}

/// Emptied, then held in append mode: the sweep after a stop appends its own line to
/// legal-serve.log (append_log) while this handle may still be draining the stopped service's
/// pipe. At a cursor of its own, this handle's next write would land over that line, the one
/// line that names the folder a run left on disk.
fn log_file(name: &str) -> Option<std::fs::File> {
    let base = log_dir()?;
    std::fs::create_dir_all(&base).ok()?;
    let path = base.join(format!("{name}.log"));
    drop(std::fs::OpenOptions::new().create(true).write(true).truncate(true).open(&path).ok()?);
    std::fs::OpenOptions::new().append(true).open(&path).ok()
}

/// The profile path in the three spellings a log line uses (backslashes, forward slashes, and
/// JSON's doubled backslashes) becomes %USERPROFILE%, and the bare account name %USERNAME%.
/// Names shorter than 3 characters are left alone: replacing "ab" everywhere would unreadably
/// mangle the log and hide little. Longest first, so the path wins over the name inside it.
fn redaction_patterns(profile: Option<&str>, user: Option<&str>) -> Vec<(Vec<u8>, &'static [u8])> {
    let mut out: Vec<(Vec<u8>, &'static [u8])> = Vec::new();
    if let Some(p) = profile.filter(|p| p.len() >= 3) {
        let back = p.replace('/', "\\");
        for f in [back.replace('\\', "\\\\"), p.replace('\\', "/"), back] {
            out.push((f.into_bytes(), b"%USERPROFILE%"));
        }
    }
    if let Some(u) = user.filter(|u| u.len() >= 3) {
        out.push((u.as_bytes().to_vec(), b"%USERNAME%"));
    }
    out.sort_by_key(|(p, _)| std::cmp::Reverse(p.len()));
    out.dedup_by(|a, b| a.0.eq_ignore_ascii_case(&b.0));
    out
}

fn redactions() -> &'static [(Vec<u8>, &'static [u8])] {
    static R: OnceLock<Vec<(Vec<u8>, &'static [u8])>> = OnceLock::new();
    R.get_or_init(|| {
        let profile = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(|s| s.to_string_lossy().into_owned());
        let user = std::env::var_os(if cfg!(windows) { "USERNAME" } else { "USER" }).map(|s| s.to_string_lossy().into_owned());
        redaction_patterns(profile.as_deref(), user.as_deref())
    })
}

/// Every pattern replaced, ASCII case-insensitively (Windows paths are). Matched as UTF-8, which
/// is what llama-server and Node write; cmd.exe's own echo line is written in the console code
/// page, so an account name outside ASCII can survive in that one line (not measured: the
/// account measured is ASCII).
fn redact(line: &[u8], pats: &[(Vec<u8>, &'static [u8])]) -> Vec<u8> {
    let mut out = Vec::with_capacity(line.len());
    let mut i = 0;
    'next: while i < line.len() {
        for (p, r) in pats {
            if !p.is_empty() && line.len() - i >= p.len() && line[i..i + p.len()].eq_ignore_ascii_case(p) {
                out.extend_from_slice(r);
                i += p.len();
                continue 'next;
            }
        }
        out.push(line[i]);
        i += 1;
    }
    out
}

/// Pipes the child's output when its log could be opened (pump_logs takes it after spawn), and
/// sends it nowhere otherwise.
fn attach_logs(cmd: &mut Command, name: &str) -> Option<std::fs::File> {
    cmd.stdin(Stdio::null());
    match log_file(name) {
        Some(f) => {
            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
            Some(f)
        }
        None => {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
            None
        }
    }
}

/// One thread per pipe, line by line through redact() into the log. The pipe is drained even
/// when a write fails: a child blocked on a full pipe would stall the model server on its own
/// log. A line over 64 KiB is written in pieces, and a name split across two pieces survives.
fn pump_logs(child: &mut Child, log: Option<std::fs::File>) {
    let Some(log) = log else { return };
    let file = Arc::new(Mutex::new(log));
    let mut srcs: Vec<Box<dyn Read + Send>> = Vec::new();
    if let Some(s) = child.stdout.take() {
        srcs.push(Box::new(s));
    }
    if let Some(s) = child.stderr.take() {
        srcs.push(Box::new(s));
    }
    for src in srcs {
        let file = file.clone();
        std::thread::spawn(move || {
            use std::io::BufRead;
            let mut r = std::io::BufReader::new(src);
            let mut line = Vec::new();
            loop {
                line.clear();
                match (&mut r).take(64 * 1024).read_until(b'\n', &mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let out = redact(&line, redactions());
                        if let Ok(mut f) = file.lock() {
                            let _ = f.write_all(&out);
                        }
                    }
                }
            }
        });
    }
}

/// Node 22 sends fetch() through HTTP_PROXY / HTTPS_PROXY when NODE_USE_ENV_PROXY=1 or
/// --use-env-proxy is given (measured 2026-09-23, Node v22.22.3). The chain's model calls are
/// plain http to 127.0.0.1, and NO_PROXY=localhost does not exempt 127.0.0.1 (measured), so on a
/// managed machine with both set, every chunk of every document would go to the proxy in
/// cleartext. The app's children get none of it. serve-legal.mjs refuses to start on the same
/// condition, for a service started by hand. Names on Windows are case-insensitive, so the
/// lower-case entries matter elsewhere only.
const PROXY_VARS: [&str; 7] =
    ["NODE_USE_ENV_PROXY", "HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"];

fn scrub_proxy(cmd: &mut Command) {
    for v in PROXY_VARS {
        cmd.env_remove(v);
    }
    if let Some(o) = std::env::var_os("NODE_OPTIONS") {
        match node_options_without_env_proxy(&o.to_string_lossy()) {
            Some(rest) if rest.trim().is_empty() => {
                cmd.env_remove("NODE_OPTIONS");
            }
            Some(rest) => {
                cmd.env("NODE_OPTIONS", rest);
            }
            None => {}
        }
    }
}

/// NODE_OPTIONS without --use-env-proxy (or --use-env-proxy=…, or the _ spelling Node also
/// accepts). Split as Node splits it: on whitespace, with "double quotes" holding a token
/// together and \ escaping inside them. None: nothing to remove. The other options are kept
/// exactly as written.
fn node_options_without_env_proxy(s: &str) -> Option<String> {
    let mut tokens: Vec<(String, String)> = Vec::new(); // (as written, as Node reads it)
    let (mut raw, mut val) = (String::new(), String::new());
    let (mut quoted, mut escaped, mut any) = (false, false, false);
    for c in s.chars() {
        if escaped {
            raw.push(c);
            val.push(c);
            escaped = false;
            continue;
        }
        match c {
            '\\' if quoted => {
                raw.push(c);
                escaped = true;
            }
            '"' => {
                raw.push(c);
                quoted = !quoted;
                any = true;
            }
            c if c.is_whitespace() && !quoted => {
                if any {
                    tokens.push((std::mem::take(&mut raw), std::mem::take(&mut val)));
                    any = false;
                }
            }
            c => {
                raw.push(c);
                val.push(c);
                any = true;
            }
        }
    }
    if any {
        tokens.push((raw, val));
    }
    let is_flag = |v: &str| {
        let v = v.replace('_', "-");
        v == "--use-env-proxy" || v.starts_with("--use-env-proxy=")
    };
    let before = tokens.len();
    tokens.retain(|(_, v)| !is_flag(v));
    (tokens.len() != before).then(|| tokens.into_iter().map(|(r, _)| r).collect::<Vec<_>>().join(" "))
}

fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}

/// The sidecar's directory goes FIRST on the children's PATH, so the launcher's own
/// `node "%~dp0..\locate-model.mjs"` (its line 46) and the adapter's execFile('node', …)
/// resolve to the bundled runtime. In the dev tree node_bin() is bare `node` (no parent
/// directory) and PATH is left alone.
fn child_path(node: &Path) -> Option<std::ffi::OsString> {
    let dir = node.parent()?;
    if dir.as_os_str().is_empty() {
        return None;
    }
    let mut paths = vec![dir.to_path_buf()];
    if let Some(cur) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&cur));
    }
    std::env::join_paths(paths).ok()
}

// ── the per-launch token ──────────────────────────────────────────────────────

/// n bytes from the OS generator. Err, never a weaker fallback: a guessable token is the
/// defect this whole layer exists to close.
fn random_bytes<const N: usize>() -> Result<[u8; N], String> {
    let mut b = [0u8; N];
    #[cfg(windows)]
    {
        use windows::Win32::Security::Cryptography::{BCryptGenRandom, BCRYPT_ALG_HANDLE, BCRYPT_USE_SYSTEM_PREFERRED_RNG};
        // SAFETY: `b` is a live, writable buffer; a null algorithm handle with
        // USE_SYSTEM_PREFERRED_RNG is the documented way to ask for the system generator.
        let st = unsafe { BCryptGenRandom(BCRYPT_ALG_HANDLE::default(), &mut b, BCRYPT_USE_SYSTEM_PREFERRED_RNG) };
        if st.0 < 0 {
            return Err(format!("BCryptGenRandom failed (NTSTATUS {:#x})", st.0));
        }
    }
    #[cfg(not(windows))]
    {
        std::fs::File::open("/dev/urandom")
            .and_then(|mut f| f.read_exact(&mut b))
            .map_err(|e| format!("/dev/urandom: {e}"))?;
    }
    Ok(b)
}

/// This launch's token: made once, held in this process, given only to the adapter this app
/// spawns. 64 hex characters, inside serve-legal.mjs TOKEN_RE.
fn app_token() -> Result<&'static str, String> {
    static TOKEN: OnceLock<Result<String, String>> = OnceLock::new();
    TOKEN
        .get_or_init(|| random_bytes::<32>().map(|b| service_auth::hex(&b)))
        .as_deref()
        .map_err(|e| format!("no secure random source for the engine token: {e}"))
}

/// The model server's key for this launch, given to the model this app starts as
/// LLAMA_API_KEY. Held in this process only: relay.rs and complete_local add it to what they
/// forward, so neither the chain's stages nor a web page open on this computer has it, and
/// without it llama-server answers a completion request with 401. A second value, not the
/// adapter's token: the chain's stages inherit their environment from the adapter, and the
/// adapter's token must never reach them (serve-legal.mjs removes it).
fn model_key() -> Result<&'static str, String> {
    static KEY: OnceLock<Result<String, String>> = OnceLock::new();
    KEY.get_or_init(|| random_bytes::<32>().map(|b| service_auth::hex(&b)))
        .as_deref()
        .map_err(|e| format!("no secure random source for the model server's key: {e}"))
}

/// Mirrors serve-legal.mjs tokenFile(): %LOCALAPPDATA%\Simpler AI\run\legal-service-<port>.token
/// (LOCALAPPDATA because a roaming profile copies APPDATA to a file server at sign-out).
fn token_file(port: u16) -> Option<PathBuf> {
    let name = format!("legal-service-{port}.token");
    if cfg!(windows) {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).or_else(|| {
            std::env::var_os("USERPROFILE").map(|h| PathBuf::from(h).join("AppData").join("Local"))
        })?;
        Some(local.join("Simpler AI").join("run").join(name))
    } else {
        let cfg = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
        Some(cfg.join("simpler-ai").join("run").join(name))
    }
}

fn token_shape_ok(t: &str) -> bool {
    (32..=256).contains(&t.len()) && t.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// The token a hand-started adapter left under the user's own profile, if there is one.
fn hand_token(port: u16) -> Option<String> {
    let t = std::fs::read_to_string(token_file(port)?).ok()?;
    let t = t.trim().to_string();
    token_shape_ok(&t).then_some(t)
}

// ── the GPU pick (ported from the harness, environment-only here) ─────────────

/// Discrete/fast GPU test. The skip list runs FIRST: "AMD Radeon(TM) 890M Graphics"
/// contains "Radeon" but is integrated — and on this family's machines its Vulkan driver
/// lacks an extension llama.cpp needs (createDevice: ErrorExtensionNotPresent, measured
/// 2026-09-13 with the launcher of record), so left visible it stops the model loading.
fn is_good_gpu(name: &str) -> bool {
    let up = name.to_ascii_uppercase();
    for m in ["UHD GRAPHICS", "IRIS XE", "VEGA"] {
        if up.contains(m) {
            return false;
        }
    }
    if up.contains("RADEON") && up.contains("GRAPHICS") && !up.contains("RADEON RX") && !up.contains("RADEON PRO") {
        return false;
    }
    ["NVIDIA", "RTX", "GEFORCE", "RADEON RX", "RADEON PRO", "INTEL ARC"].iter().any(|m| up.contains(m))
}

/// One `--list-devices` line: "  Vulkan1: NVIDIA ... (7956 MiB, 7188 MiB free)".
fn parse_device_line(line: &str) -> Option<(String, String, u64)> {
    let trimmed = line.trim();
    let colon = trimmed.find(':')?;
    let id = trimmed[..colon].trim().to_string();
    if id.is_empty() || id.eq_ignore_ascii_case("CPU") {
        return None;
    }
    let rest = trimmed[colon + 1..].trim();
    let (name, free) = match rest.rfind('(') {
        Some(paren) => {
            let inside = &rest[paren + 1..rest.len().saturating_sub(1)];
            let mut free = 0u64;
            for chunk in inside.split(',') {
                if let Some(n) = chunk.trim().strip_suffix("MiB free") {
                    if let Ok(v) = n.trim().parse::<u64>() {
                        free = v;
                        break;
                    }
                }
            }
            (rest[..paren].trim().to_string(), free)
        }
        None => (rest.to_string(), 0),
    };
    if name.is_empty() {
        return None;
    }
    Some((id, name, free))
}

/// Ask the build which devices it sees and pick the discrete one with the most free
/// memory. The pick is handed to llama-server as GGML_VK_VISIBLE_DEVICES — environment,
/// so the launcher's frozen argv line stays byte-identical. None = leave the build to its
/// own enumeration (a CUDA build, or no discrete GPU).
fn vulkan_pick(llama: &Path) -> Option<String> {
    let mut cmd = Command::new(llama);
    cmd.arg("--list-devices").stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null());
    // The pick goes back to the launcher as GGML_VK_VISIBLE_DEVICES, which indexes the physical
    // list. One already in this process's environment renumbers the listing: with =1 set, the
    // NVIDIA card lists as Vulkan0, and GGML_VK_VISIBLE_DEVICES=0 is the integrated GPU, where
    // the frozen server dies (measured 2026-09-25 with the bundled llama-server, lane R).
    cmd.env_remove("GGML_VK_VISIBLE_DEVICES");
    scrub_proxy(&mut cmd);
    no_window(&mut cmd);
    let out = cmd.output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut good: Vec<(String, String, u64)> =
        text.lines().filter_map(parse_device_line).filter(|(_, n, _)| is_good_gpu(n)).collect();
    good.sort_by_key(|g| std::cmp::Reverse(g.2));
    let (id, name, free) = good.into_iter().next()?;
    let idx = id.strip_prefix("Vulkan")?.to_string();
    eprintln!("[simpler.legal] gpu pick: {id} ({name}, {free} MiB free) -> GGML_VK_VISIBLE_DEVICES={idx}");
    Some(idx)
}

// ── spawning ──────────────────────────────────────────────────────────────────

/// The launcher skips its own hash when SIMPLER_MODEL_GGUF is set ("NOT hash-checked", its
/// header). The app inherits the user's environment and passes it on, so the check the
/// launcher skips runs here first. About 15 s on the 3.3 GB file, the same cost the launcher
/// pays on its default path.
fn check_explicit_model() -> Result<(), String> {
    let Some(p) = std::env::var_os("SIMPLER_MODEL_GGUF") else { return Ok(()) };
    let p = PathBuf::from(p);
    let refuse = |why: String| {
        format!(
            "SIMPLER_MODEL_GGUF points at {}, which {why}. The app will not start the model with it. Unset SIMPLER_MODEL_GGUF to let the launcher find the pinned file, or point it at a copy that matches (node locate-model.mjs --verify lists them).",
            p.display()
        )
    };
    let size = std::fs::metadata(&p).map_err(|e| refuse(format!("cannot be read ({e})")))?.len();
    if size != crate::MODEL_BYTES {
        return Err(refuse(format!("is {size} bytes, not the pinned model's {}", crate::MODEL_BYTES)));
    }
    let h = crate::sha256_of(&p).map_err(|e| refuse(format!("could not be hashed ({e})")))?;
    if h != crate::MODEL_SHA256 {
        return Err(refuse(format!("has sha256 {h}, not the pin {}", crate::MODEL_SHA256)));
    }
    Ok(())
}

fn spawn_launcher(root: &Path, node: &Path) -> Result<Child, String> {
    let launcher = root.join("tools").join("launch-server.cmd");
    if !launcher.is_file() {
        return Err(format!("launcher missing: {}", launcher.display()));
    }
    check_explicit_model()?;
    let mut cmd = Command::new("cmd");
    cmd.arg("/c").arg(&launcher).current_dir(root);
    if let Some(p) = child_path(node) {
        cmd.env("PATH", p);
    }
    // The port this file probes, whatever the user's own environment says.
    cmd.env("SIMPLER_LLAMA_PORT", LLAMA_PORT.to_string());
    // The environment is the only lever: the launcher's argv is frozen, and llama.cpp reads
    // these names only when the argv does not set the same thing (the argv sets model, port,
    // host, ctx-size, parallel, jinja and the template switch, none of the ones below). Names
    // from `llama-server --help` of the bundled build (9222), which lists each one's env form.
    //
    // /slots: served by default, and in upstream llama.cpp each slot's entry carries its last
    // prompt and output; it answers any Origin, so a web page open while the app runs could
    // read the last piece of a document the model was given. Off here (--no-slots).
    cmd.env("LLAMA_ARG_ENDPOINT_SLOTS", "0");
    // Every endpoint but /health and /models then needs this launch's key (--api-key). Only
    // relay.rs and complete_local hold it, so a page that reaches the port can neither send it
    // text nor read an answer. model_notes() checks both on the live server and puts on screen
    // any it finds not in force; neither has been run against a live server by this lane.
    cmd.env("LLAMA_API_KEY", model_key()?);
    // The verbosity at which the log was measured to hold no document text (log_dir); a user's
    // LLAMA_LOG_VERBOSITY=4 would put request bodies in it. The rest would widen the model
    // server beyond what the frozen chain uses, or move its log, if the user's environment set
    // them: POST /props (changes settings), /metrics, the tool and MCP-proxy switches, a reused
    // port, a path prefix, a static root, TLS files and a host.
    cmd.env("LLAMA_LOG_VERBOSITY", "3");
    for v in [
        "LLAMA_LOG_FILE",
        "LLAMA_ARG_ENDPOINT_PROPS",
        "LLAMA_ARG_ENDPOINT_METRICS",
        "LLAMA_ARG_TOOLS",
        "LLAMA_ARG_UI_MCP_PROXY",
        "LLAMA_ARG_WEBUI_MCP_PROXY",
        "LLAMA_ARG_REUSE_PORT",
        "LLAMA_ARG_API_PREFIX",
        "LLAMA_ARG_STATIC_PATH",
        "LLAMA_ARG_SSL_KEY_FILE",
        "LLAMA_ARG_SSL_CERT_FILE",
        "LLAMA_ARG_HOST",
        // The settings that make the model server reach another computer: RPC hands the
        // model's work to remote servers, and the rest download a model, a projector or a
        // draft model. The frozen chain reads the model file in place and uses none of them.
        "LLAMA_ARG_RPC",
        "LLAMA_ARG_HF_REPO",
        "LLAMA_ARG_HF_FILE",
        "LLAMA_ARG_HF_REPO_V",
        "LLAMA_ARG_HF_FILE_V",
        "LLAMA_ARG_MODEL_URL",
        "LLAMA_ARG_MMPROJ_URL",
        "LLAMA_ARG_DOCKER_REPO",
        "LLAMA_ARG_SPEC_DRAFT_HF_REPO",
        "HF_TOKEN",
    ] {
        cmd.env_remove(v);
    }
    // llama.cpp's --offline, which its help describes as preventing network access: a download
    // setting the list above does not name is refused too. Not yet run against a live server.
    cmd.env("LLAMA_OFFLINE", "1");
    scrub_proxy(&mut cmd);
    match llama_bin(root) {
        Some(bin) => {
            if let Some(idx) = vulkan_pick(&bin) {
                cmd.env("GGML_VK_VISIBLE_DEVICES", idx);
            }
            cmd.env("SIMPLER_LLAMA_BIN", &bin);
        }
        None => eprintln!("[simpler.legal] no bundled llama-server; the launcher's default (llama-server on PATH) applies"),
    }
    let log = attach_logs(&mut cmd, "legal-llama-server");
    no_window(&mut cmd);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("launcher spawn failed ({}): {e}", launcher.display()))?;
    pump_logs(&mut child, log);
    #[cfg(windows)]
    {
        let jobbed = crate::job_object::assign_child(crate::job_object::Kind::Model, &child);
        let pid = child.id();
        if let Ok(mut g) = unjobbed_launcher().lock() {
            *g = (!jobbed).then(|| (pid, crate::port_owner::created_of(pid)));
        }
    }
    Ok(child)
}

/// The token goes in the environment, not argv: any process on the machine can read another
/// process's command line, while its environment is readable by the same account only.
/// --no-token-file keeps it off disk; serve-legal.mjs removes it from its own environment
/// before the chain's stages inherit it. Its model port is the relay's (relay.rs), in argv and
/// in SIMPLER_LLAMA_PORT, so neither the service nor a stage that falls back to the environment
/// can reach the model port without the per-connection check; each /strip names it again.
fn spawn_adapter(root: &Path, node: &Path, llama: u16) -> Result<Child, String> {
    let token = app_token()?;
    let mut cmd = Command::new(node);
    cmd.arg("serve-legal.mjs")
        .arg("--port")
        .arg(LEGAL_PORT.to_string())
        .arg("--llama")
        .arg(llama.to_string())
        .arg("--no-token-file")
        .env("SIMPLER_LEGAL_TOKEN", token)
        .env("SIMPLER_LLAMA_PORT", llama.to_string())
        .current_dir(root);
    if let Some(p) = child_path(node) {
        cmd.env("PATH", p);
    }
    scrub_proxy(&mut cmd);
    let log = attach_logs(&mut cmd, "legal-serve");
    no_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| {
        format!("adapter spawn failed ({} serve-legal.mjs in {}): {e}", node.display(), root.display())
    })?;
    pump_logs(&mut child, log);
    #[cfg(windows)]
    {
        crate::job_object::assign_child(crate::job_object::Kind::Adapter, &child);
        let pid = child.id();
        if let Ok(mut g) = spawned_adapter().lock() {
            *g = Some((pid, crate::port_owner::created_of(pid)));
        }
    }
    ADAPTER_SPAWNED.store(true, Ordering::SeqCst);
    Ok(child)
}

// ── liveness (tri-state — a port that answers is not a model that loaded) ─────

#[derive(PartialEq, Eq, Clone, Copy)]
enum Health {
    /// /health 200 — ready.
    Ready,
    /// Connected but not 200 (llama-server binds early and 503s while loading; the
    /// adapter 503s while its upstream is down).
    Loading,
    /// Nothing answered.
    Down,
}

/// Raw HTTP/1.0 GET over a short-timeout TcpStream (the harness's probe, keeping the body
/// so a JSON answer can be read). Never panics. For probes only: nothing here carries
/// document text, and the Host carries the port because serve-legal.mjs refuses any other.
fn http_get(port: u16, path: &str) -> (Health, u16, String) {
    http_probe(port, "GET", path, "")
}

/// http_get with a method and a body. The body is a fixed probe, never document text.
fn http_probe(port: u16, method: &str, path: &str, body: &str) -> (Health, u16, String) {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(s) = TcpStream::connect_timeout(&addr, Duration::from_secs(2)) else {
        return (Health::Down, 0, String::new());
    };
    http_on(s, port, method, path, body)
}

/// One probe request on a socket already connected, whoever connected it: http_probe, or
/// probe_model on a connection whose far end has been checked.
fn http_on(mut s: TcpStream, port: u16, method: &str, path: &str, body: &str) -> (Health, u16, String) {
    let _ = s.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = s.set_write_timeout(Some(Duration::from_secs(2)));
    let framing = if method == "GET" {
        String::new()
    } else {
        format!("Content-Type: application/json\r\nContent-Length: {}\r\n", body.len())
    };
    let req = format!("{method} {path} HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\n{framing}Connection: close\r\n\r\n{body}");
    if s.write_all(req.as_bytes()).is_err() {
        return (Health::Down, 0, String::new());
    }
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        match s.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(_) => break, // timeout: keep whatever arrived
        }
    }
    if buf.is_empty() {
        return (Health::Down, 0, String::new());
    }
    let text = String::from_utf8_lossy(&buf).into_owned();
    let status = text
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    let body = text.split_once("\r\n\r\n").map(|(_, b)| b.to_string()).unwrap_or_default();
    (if status == 200 { Health::Ready } else { Health::Loading }, status, body)
}

fn alive(child: &mut Option<Child>) -> bool {
    match child {
        Some(c) => matches!(c.try_wait(), Ok(None)),
        None => false,
    }
}

// ── the model server: who holds the port, and is it the pinned model ──────────

/// A listening process, as port_owner.rs saw it.
enum Holder {
    Ours { pid: u32, created: u64 },
    Hand { pid: u32, created: u64, image: String },
}

/// Ok(None): nothing accepts a connection to 127.0.0.1:`port`. Err: something holds the port
/// that this app will not send text to; the message says who and what to do.
///
/// The holder is the process that ACCEPTS a connection to 127.0.0.1:port (relay.rs answering),
/// which is the address every road to the model dials. Until 2026-09-23 it was whichever
/// same-account listener the table listed last, on any address: a process of your own account
/// listening on [::1]:49400, which is handed none of those connections, displaced this app's
/// own model server, and the /props probe meant for it went over 127.0.0.1 to this app's keyed
/// model, came back 401, and was read as "still loading". The app waited on a model it had
/// started, with nothing on screen to say why (wf4 S-local-2). A listener of another account on
/// ANY address is still refused before that: a wildcard socket can be handed a connection
/// too, and a false alarm there costs a Retry where a miss costs a document.
#[cfg(windows)]
fn model_holder(port: u16) -> Result<Option<Holder>, String> {
    use crate::port_owner::{classify, listeners, Owner};
    let refuse = |owner: &Owner| {
        format!(
            "Port {port}, where this app's model runs, is held by {}. This app did not start it, so it sent it nothing. Close that program, or ask whoever runs it to, then press Retry. If it belongs to someone else signed in to this computer, tell your IT team: a program can wait on this port to receive documents.",
            owner.describe()
        )
    };
    let pids = listeners(port).map_err(|e| format!("Could not read who holds port {port} ({e}), so nothing was sent to it."))?;
    for &pid in &pids {
        let owner = classify(pid);
        if matches!(owner, Owner::Foreign { .. }) {
            return Err(refuse(&owner));
        }
    }
    if pids.is_empty() {
        return Ok(None);
    }
    // A port some listener holds but nothing accepts on at 127.0.0.1 costs about 2 s here, the
    // time a refused loopback connection takes (relay.rs answering); a model server that
    // accepts costs well under a millisecond.
    let answers = crate::relay::answering(port, Duration::from_secs(4)).map_err(|e| {
        format!("Could not tell which process answers on port {port} ({e}), so nothing was sent to it. Press Retry.")
    })?;
    let Some(pid) = answers else { return Ok(None) };
    Ok(Some(match classify(pid) {
        Owner::Ours { created } => Holder::Ours { pid, created },
        Owner::SameUser { pid, created, .. } if from_unjobbed_launcher(pid, created) => Holder::Ours { pid, created },
        Owner::SameUser { pid, created, image } => Holder::Hand { pid, created, image },
        owner => return Err(refuse(&owner)),
    }))
}

/// See unjobbed_launcher(). The launcher's own creation time is read again: while it runs its
/// pid cannot be reused, so a match means the parent named in the snapshot is that launcher.
#[cfg(windows)]
fn from_unjobbed_launcher(pid: u32, created: u64) -> bool {
    launched_by(unjobbed_launcher().lock().ok().and_then(|g| *g), pid, created)
}

/// from_unjobbed_launcher's rule for a given launcher, which a test can name without setting the
/// static (setting it would race the tests whose own children hold ports). Each clause is load-
/// bearing: without the parent, any process of your account created after the launcher and
/// holding the port while it runs would be taken for this app's model, skip the pin check and be
/// given the key (wf5 S-teeth-6).
#[cfg(windows)]
fn launched_by(launcher: Option<(u32, u64)>, pid: u32, created: u64) -> bool {
    let Some((lp, lc)) = launcher else { return false };
    lc != 0 && created >= lc && crate::port_owner::parent_of(pid) == Some(lp) && crate::port_owner::created_of(lp) == lc
}

#[cfg(not(windows))]
fn model_holder(port: u16) -> Result<Option<Holder>, String> {
    if http_get(port, "/health").0 == Health::Down {
        return Ok(None);
    }
    Err(format!(
        "Something answers on port {port}, and this build can check who holds a port only on Windows, so it sent it nothing."
    ))
}

/// A model server's verdict, kept per process (pid + start time, so a reused pid is a new
/// entry). The pin check reads 3.3 GB, and complete_local runs once per chunk of a document.
#[derive(Clone)]
struct Verdict {
    origin: Origin,
    refused: Option<String>,
    notes: Vec<String>,
    /// The process the verdict is about: what relay.rs holds every connection to.
    #[cfg_attr(not(windows), allow(dead_code))]
    pid: u32,
    #[cfg_attr(not(windows), allow(dead_code))]
    created: u64,
}

fn verdicts() -> &'static Mutex<HashMap<(u16, u32, u64), Verdict>> {
    static V: OnceLock<Mutex<HashMap<(u16, u32, u64), Verdict>>> = OnceLock::new();
    V.get_or_init(Default::default)
}

/// One probe of the model process `pid` (created at `created`) on `port`, on a connection
/// relay.rs connect_verified has checked, so what it reads is that process's answer and not
/// another listener's: an unchecked probe is how a [::1] holder's /props landed on this app's
/// own model (model_holder). None: the far end was not that process, so the port changed hands
/// after model_holder read it; nothing was sent, nothing is cached, and the next question asks
/// again. Otherwise the status (0: nothing came back) and the body. The body sent is a fixed
/// probe, never document text.
#[cfg(windows)]
fn probe_model(port: u16, pid: u32, created: u64, method: &str, path: &str, body: &str) -> Option<(u16, String)> {
    let t = crate::relay::Target { port, pid, created, key: None };
    match crate::relay::connect_verified(&t, Duration::from_secs(2)) {
        Ok(s) => {
            let (_, status, body) = http_on(s, port, method, path, body);
            Some((status, body))
        }
        Err(why) => {
            eprintln!("[simpler.legal] model probe {path}: {why}; asking again");
            None
        }
    }
}

/// model_holder never names a holder here, so this is never reached.
#[cfg(not(windows))]
fn probe_model(_port: u16, _pid: u32, _created: u64, _method: &str, _path: &str, _body: &str) -> Option<(u16, String)> {
    None
}

/// What a trusted model server exposes that the user should know about. None: the probe
/// could not tell yet (the server is still loading), so nothing is cached. For the one this
/// app started, whether the settings spawn_launcher gave it are in force: its key (a
/// completion request without it must get 401) and /slots off. Neither probe sends text.
fn model_notes(port: u16, pid: u32, created: u64, origin: Origin) -> Option<Vec<String>> {
    let mut notes = Vec::new();
    match probe_model(port, pid, created, "GET", "/slots", "")?.0 {
        200 => notes.push(format!(
            "The model server on port {port} publishes the last text it was given at /slots, and any web page open on this computer can read it while the server runs. Close other browser tabs while you work, or restart it with LLAMA_ARG_ENDPOINT_SLOTS=0 set."
        )),
        0 | 503 => return None,
        _ => {} // 401: behind the key; 404/501: the endpoint is off
    }
    if origin == Origin::App {
        match probe_model(port, pid, created, "POST", "/v1/chat/completions", "{}")?.0 {
            401 => {} // the key is in force
            0 | 503 => return None,
            s => notes.push(format!(
                "The model server this app started on port {port} answered a request that did not carry this launch's key (HTTP {s}), so any program or web page on this computer can send it text and read its answers. Your documents still go only to it, checked on every connection. Restart the app; if this stays, the bundled llama-server did not take LLAMA_API_KEY, and whoever maintains your installation should know."
            )),
        }
    }
    Some(notes)
}

/// The two serving settings from tools/launch-server.cmd's frozen line that llama-server's
/// /props reports. The other two on that line, --jinja and the chat-template switch that turns
/// the model's thinking off, are not in /props, and the screen says they were not checked.
const FROZEN_CTX: u64 = 8192;
const FROZEN_SLOTS: u64 = 1;

/// Your own account's model server, not this app's: used only once the model file it says it
/// serves matches the pin and it reports the frozen context size and slot count. This
/// establishes WHICH MODEL answers, with which of the frozen settings could be read, not that
/// the process is honest; a process running as you could lie about its path, and could as
/// easily read your documents off disk, so that is outside what any local check can decide.
/// A different context size or slot count is refused rather than noted: the frozen results
/// were measured at 8192 tokens in one slot, and a smaller window or a split one changes what
/// each chunk of the document is read against.
///
/// Judged from the /props answer (`status`, `body`) that trusted_model read on a verified
/// connection. Only a 503 (llama-server loading its model) or no answer means "ask again".
/// Every other status was read as loading until 2026-09-23, and one of them is a steady state:
/// the model server of another open copy of this app answers everything but /health with 401,
/// because that copy gave it a key. A second copy waited on it forever and said "Not running,
/// Retry starts it again", which it did not (wf4 S-truth-2).
fn verify_hand_model(port: u16, image: &str, status: u16, body: &str) -> Result<Option<()>, String> {
    let refuse = |why: String| {
        format!(
            "The model server on port {port} is {image}, started outside this app, and {why}. This app sent it nothing. Close it and press Retry to let the app start its own, or start it with tools\\launch-server.cmd, which checks the model file first and serves it with the frozen settings."
        )
    };
    match status {
        200 => {}
        0 | 503 => return Ok(None), // loading, or nothing came back yet: ask again on the next poll
        401 | 403 => {
            return Err(format!(
                "The model server on port {port} is {image}, started outside this app, and it answers only a caller that holds its key. The model server of another open copy of simpler.legal does that (each copy gives its own a key no other program has), and so does one started by hand with --api-key. The app cannot ask it which model it serves, so it sent it nothing. Close the other copy of simpler.legal, or stop that model server, and press Retry: this copy then starts its own."
            ))
        }
        s => return Err(refuse(format!("it answered HTTP {s} when asked which model it serves (/props), so the app cannot check it against the pin"))),
    }
    let v: serde_json::Value =
        serde_json::from_str(body).map_err(|_| refuse("its /props answer is not JSON, so the app cannot tell which model it serves".into()))?;
    let ctx = v["default_generation_settings"]["n_ctx"].as_u64().or_else(|| v["n_ctx"].as_u64());
    let slots = v["total_slots"].as_u64();
    match (ctx, slots) {
        (Some(FROZEN_CTX), Some(FROZEN_SLOTS)) => {}
        (Some(c), Some(s)) => {
            return Err(refuse(format!(
                "it serves a context of {c} tokens in {s} slot(s), not the {FROZEN_CTX} tokens in {FROZEN_SLOTS} slot the frozen engine was measured with"
            )))
        }
        _ => {
            return Err(refuse(
                "it does not report its context size and slot count, so the app cannot tell it runs with the frozen settings".into(),
            ))
        }
    }
    let Some(path) = v["model_path"].as_str().filter(|s| !s.is_empty()) else {
        return Err(refuse("it does not say which model file it serves, so the app cannot check it against the pin".into()));
    };
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err(refuse(format!("it names its model file by a relative path ({path}), which the app cannot resolve to check against the pin")));
    }
    let size = std::fs::metadata(&p).map_err(|e| refuse(format!("its model file {path} cannot be read ({e})")))?.len();
    if size != crate::MODEL_BYTES {
        return Err(refuse(format!("its model file {path} is {size} bytes, not the pinned model's {}", crate::MODEL_BYTES)));
    }
    let sum = crate::sha256_of(&p).map_err(|e| refuse(format!("its model file {path} could not be hashed ({e})")))?;
    if sum != crate::MODEL_SHA256 {
        return Err(refuse(format!("its model file {path} has sha256 {sum}, not the pin {}", crate::MODEL_SHA256)));
    }
    Ok(Some(()))
}

/// The one question every road to the model asks before sending text. Ok(None): nothing is
/// serving there yet (absent, or loading). Ok(Some): may be sent text, and who started it.
/// Err: refused, in words.
fn trusted_model(port: u16) -> Result<Option<Verdict>, String> {
    let Some(holder) = model_holder(port)? else { return Ok(None) };
    trusted_holder(port, &holder)
}

/// trusted_model for the holder model_holder named. Every probe goes to THAT process (pid and
/// creation time) on a connection checked before a byte is written, so a verdict cached for it
/// is its own answer and not whichever listener took the port since.
fn trusted_holder(port: u16, holder: &Holder) -> Result<Option<Verdict>, String> {
    let (key, origin, image) = match holder {
        Holder::Ours { pid, created } => ((port, *pid, *created), Origin::App, String::new()),
        Holder::Hand { pid, created, image } => ((port, *pid, *created), Origin::Hand, image.clone()),
    };
    let (_, pid, created) = key;
    if let Some(v) = verdicts().lock().ok().and_then(|m| m.get(&key).cloned()) {
        return match v.refused {
            Some(r) => Err(r),
            None => Ok(Some(v)),
        };
    }
    if origin == Origin::Hand {
        let Some((status, props)) = probe_model(port, pid, created, "GET", "/props", "") else { return Ok(None) };
        match verify_hand_model(port, &image, status, &props) {
            Ok(None) => return Ok(None),
            Ok(Some(())) => {}
            Err(r) => {
                if let Ok(mut m) = verdicts().lock() {
                    m.insert(key, Verdict { origin, refused: Some(r.clone()), notes: Vec::new(), pid, created });
                }
                return Err(r);
            }
        }
    }
    let Some(notes) = model_notes(port, pid, created, origin) else { return Ok(None) };
    let v = Verdict { origin, refused: None, notes, pid, created };
    if let Ok(mut m) = verdicts().lock() {
        m.insert(key, v.clone());
    }
    Ok(Some(v))
}

fn status_now(children: &mut Children) -> ServerStatus {
    let (h, _, _) = http_get(LLAMA_PORT, "/health");
    let mut s = ServerStatus {
        running: alive(&mut children.launcher) || h != Health::Down,
        healthy: false,
        port: LLAMA_PORT,
        origin: None,
        refused: None,
        notes: Vec::new(),
        adapter_spawned: false,
    };
    if h == Health::Ready {
        match trusted_model(LLAMA_PORT) {
            Ok(Some(v)) => {
                s.healthy = true;
                s.origin = Some(v.origin);
                s.notes = v.notes;
            }
            Ok(None) => {}
            Err(r) => s.refused = Some(r),
        }
    }
    s
}

// ── the adapter: it proves itself, then it gets the document ──────────────────

/// A process on `port` that is not a service this app may use: named, with the way through.
/// The way through is not a Retry button: this refusal is shown while the in-app core works,
/// a state that renders none, and a button that is not there is a dead end. lib/tauri.ts asks
/// again on every document, and starts this app's own service once the port is free.
fn adapter_refusal(port: u16, why: &str) -> String {
    #[cfg(windows)]
    let who = crate::port_owner::listeners(port)
        .ok()
        .and_then(|p| p.first().copied())
        .map(|pid| crate::port_owner::classify(pid).describe())
        .unwrap_or_else(|| "a process this app could not identify".into());
    #[cfg(not(windows))]
    let who = "a process this app could not identify".to_string();
    format!(
        "Port {port}, where the frozen legal pipeline runs, is held by {who}, and {why}. This app sent it nothing, and reads documents with the in-app core instead. If that is an engine service you started by hand, restart it (node serve-legal.mjs) so it writes a fresh token file; if it is another copy of simpler.legal, close that copy; otherwise close whatever holds the port. The app checks the port again each time you add a document, and uses the frozen pipeline once it may."
    )
}

enum Adapter {
    Absent,
    Proven { conn: Conn, hello: Hello, token: String, origin: Origin },
    Refused(String),
}

/// Open one connection to the adapter and have it prove itself.
fn open_adapter(port: u16) -> Adapter {
    let mut conn = match service_auth::connect(port) {
        Ok(Some(c)) => c,
        Ok(None) => return Adapter::Absent,
        Err(e) => return Adapter::Refused(adapter_refusal(port, &format!("it could not be reached ({e})"))),
    };
    let nonce = match random_bytes::<32>() {
        Ok(b) => service_auth::hex(&b),
        Err(e) => return Adapter::Refused(format!("No secure random source for the engine handshake ({e}); nothing was sent to port {port}.")),
    };
    let mut cands: Vec<(String, Origin)> = Vec::new();
    if let Ok(t) = app_token() {
        cands.push((t.to_string(), Origin::App));
    }
    if let Some(t) = hand_token(port) {
        cands.push((t, Origin::Hand));
    }
    let refs: Vec<&str> = cands.iter().map(|(t, _)| t.as_str()).collect();
    match conn.hello(&nonce, &refs) {
        // A service that proved itself but cannot take the model port per run would send the
        // document's chunks straight to the model port, where nothing checks who answers each
        // connection. It is refused like a stranger, in words that say how to get past it.
        Ok(hello) if !hello.llama_per_run => Adapter::Refused(adapter_refusal(
            port,
            "it is from an earlier version that sends documents to the model port without the check this version makes on every connection, so it was not used",
        )),
        Ok(hello) => {
            let (token, origin) = cands.swap_remove(hello.which);
            Adapter::Proven { conn, hello, token, origin }
        }
        Err(why) => Adapter::Refused(adapter_refusal(port, &why)),
    }
}

/// The adapter proved itself; now the model its chain will reach. Every model call of the run
/// goes through relay.rs to the frozen port, whatever model port the service itself was started
/// with, so the frozen port answers the same question as the in-app core's.
fn adapter_model(_hello: &Hello) -> Result<Option<Verdict>, String> {
    trusted_model(LLAMA_PORT).map_err(|r| {
        format!("The engine service on port {LEGAL_PORT} proved itself, but it would send your document on to its model server, and: {r} Until then the in-app core reads documents, and the app asks again each time you add one.")
    })
}

/// A hand-started service's own process, by the pid inside its proof: its chain's stages are
/// admitted to the relay as its children (relay.rs in_tree). The pid must hold the service's
/// port, so a proof names the process that received the challenge.
#[cfg(windows)]
fn hand_service_tree(hello: &Hello) -> Result<(u32, u64), String> {
    let pid = hello.pid;
    let holds = crate::port_owner::listeners(LEGAL_PORT).map(|p| pid != 0 && p.contains(&pid)).unwrap_or(false);
    let created = crate::port_owner::created_of(pid);
    if !holds || created == 0 {
        return Err(format!(
            "legal service: the engine service on port {LEGAL_PORT} names process {pid} in its proof, which does not hold that port, so its chain could not be told apart from any other program. Nothing was sent. Restart it (node serve-legal.mjs)."
        ));
    }
    Ok((pid, created))
}

// ── the commands ──────────────────────────────────────────────────────────────

/// Spawn what is not already running. Whatever already holds a port is checked, not
/// assumed: a model server this app may not use fails the start with the reason; an
/// adapter it may not use is left alone (legal_service_health says why) because the
/// in-app core can still use a trusted model.
fn start_blocking(state: &EngineState) -> Result<ServerStatus, String> {
    let root = engine_root()?;
    let node = node_bin();
    #[cfg(windows)]
    let llama = relay()?.port();
    #[cfg(not(windows))]
    let llama = LLAMA_PORT;
    let mut ch = state.0.lock().map_err(|e| format!("engine state poisoned: {e}"))?;
    sweep_stale_once(&root);
    let scratch = root.join("raw");
    std::fs::create_dir_all(&scratch).map_err(|e| {
        format!(
            "engine directory is not writable ({}): {e} — the frozen chain keeps its per-run scratch under raw/ there",
            scratch.display()
        )
    })?;
    if !alive(&mut ch.launcher) {
        match model_holder(LLAMA_PORT) {
            Ok(None) => ch.launcher = Some(spawn_launcher(&root, &node)?),
            Ok(Some(_)) => {}
            // A refusal, not a failure: the screen says "Model server refused" in red. The
            // adapter is not started either, since its chain would send text to that port.
            Err(r) => {
                let mut s = status_now(&mut ch);
                s.refused = Some(r);
                return Ok(s);
            }
        }
    }
    let mut spawned = false;
    if !alive(&mut ch.adapter) {
        if let Adapter::Absent = open_adapter(LEGAL_PORT) {
            ch.adapter = Some(spawn_adapter(&root, &node, llama)?);
            spawned = true;
        }
    }
    let mut s = status_now(&mut ch);
    s.adapter_spawned = spawned;
    Ok(s)
}

fn task_err(e: tauri::Error) -> String {
    format!("engine task: {e}")
}

#[tauri::command]
pub async fn server_start(state: tauri::State<'_, EngineState>) -> Result<ServerStatus, String> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || start_blocking(&st)).await.map_err(task_err)?
}

#[tauri::command]
pub async fn server_status(state: tauri::State<'_, EngineState>) -> Result<ServerStatus, String> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut ch = st.0.lock().map_err(|e| format!("engine state poisoned: {e}"))?;
        Ok(status_now(&mut ch))
    })
    .await
    .map_err(task_err)?
}

/// null: no adapter, or one whose model is not up (the old /health semantics). Err: a process
/// holds the port that this app will not send documents to, or the adapter's model server was
/// refused — lib/tauri.ts puts the words on screen.
#[tauri::command]
pub async fn legal_service_health() -> Result<Option<LegalHealth>, String> {
    tauri::async_runtime::spawn_blocking(|| match open_adapter(LEGAL_PORT) {
        Adapter::Absent => Ok(None),
        Adapter::Refused(r) => Err(r),
        Adapter::Proven { hello, origin, .. } => {
            if !hello.llama_ok {
                return Ok(None);
            }
            let Some(model) = adapter_model(&hello)? else { return Ok(None) };
            Ok(Some(LegalHealth {
                ok: true,
                llama: true,
                engine: hello.engine,
                port: LEGAL_PORT,
                service: origin,
                model: model.origin,
                notes: model.notes,
            }))
        }
    })
    .await
    .map_err(task_err)?
}

/// The in-webview core's one model call, as lib/tauri.ts completeLocal shapes it for the
/// browser path: temperature 0, max_tokens default 400, optional GBNF grammar. The model is
/// asked for on every call (the verdict is cached per process), and the request goes on a
/// connection relay.rs's connect_verified has checked: the far end of THAT connection is the
/// process the verdict is about, or nothing is written.
///
/// Raw HTTP on that socket, not an HTTP client library: the socket that was checked has to be
/// the socket that carries the text, and a client with its own connection pool and proxy
/// settings would choose its own. This used ureq until 2026-09-23, which read ALL_PROXY /
/// HTTPS_PROXY / HTTP_PROXY by default with no exemption for 127.0.0.1 and tunnelled through
/// the proxy in cleartext; `.proxy(None)` held that shut. A raw socket has no proxy setting to
/// forget, and the crate is gone from the build.
///
/// The answer names the process that produced it. The in-app core's receipt used to name its
/// model from the engine-wide record, which is written by the status checks and lags a change
/// of holder: after a run was stopped, the core's calls went to whichever checked process held
/// the port by then, while its receipt still said this app's own model (wf4 S-local-1). Now
/// lib/tauri.ts keeps, per document, every process that answered, and the receipt is built
/// from that. An answer the core cannot use (not HTTP 200, not JSON, no answer text in it, none
/// within ANSWER_WITHIN, or none at all once the request was on its way) still names its process and carries the words in `error`: the text
/// reached that process all the same, and an Err would carry only the words. A model server
/// started by hand that crashed mid-request read a chunk of the document and was named nowhere
/// (wf4 S3-3). Err is kept for what fails before a byte is written.
#[tauri::command]
pub async fn complete_local(
    system: String,
    user: String,
    grammar: Option<String>,
    max_tokens: Option<u32>,
) -> Result<CoreReply, String> {
    tauri::async_runtime::spawn_blocking(move || complete_on(LLAMA_PORT, system, user, grammar, max_tokens))
        .await
        .map_err(task_err)?
}

/// How long one completion may take from the first byte of its request to the last of its
/// answer. The per-read timeout (300 s) bounds a silent server: llama-server sends nothing until
/// it has generated the whole answer. It did not bound a server that sends something every so
/// often and never an answer (wf5 S5L-3); this does, with a minute over the silent bound.
const ANSWER_WITHIN: Duration = Duration::from_secs(360);

/// complete_local's work, on `port` (a scratch port in the tests, which need no tauri runtime).
fn complete_on(port: u16, system: String, user: String, grammar: Option<String>, max_tokens: Option<u32>) -> Result<CoreReply, String> {
    complete_within(port, system, user, grammar, max_tokens, ANSWER_WITHIN)
}

/// complete_on with the whole-answer bound given, so a test need not wait six minutes for it.
///
/// A 200 without answer text, or with an answer the server does not say it finished
/// (finish_reason other than "stop"), is an error, not an answer. Every prompt the in-app core
/// sends says what to answer when there is nothing to find ("output exactly: NONE"), and its
/// classify pass is grammar-bound to one word, so "" is never an answer the core asked for. It
/// is what a thinking model returns when it spends max_tokens inside reasoning_content (content
/// null or ""), and a server that answers `{}` or `{"choices":[]}` says the same thing. Read as
/// "", the core counted each such chunk as read with nothing in it: the document came back
/// complete with every layer true, an empty table and three names readable (wf5 S5L-2).
fn complete_within(
    port: u16,
    system: String,
    user: String,
    grammar: Option<String>,
    max_tokens: Option<u32>,
    within: Duration,
) -> Result<CoreReply, String> {
    let mut req = serde_json::json!({
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "temperature": 0,
        "max_tokens": max_tokens.unwrap_or(400),
        "stream": false
    });
    if let Some(g) = grammar {
        req["grammar"] = serde_json::Value::String(g);
    }
    let a = complete_verified_on(port, &req.to_string(), within)?;
    let read = match a.reply {
        Err(e) => Err(e),
        Ok((200, body)) => match serde_json::from_str::<serde_json::Value>(&body) {
            Err(e) => Err(format!("local model json: {e}")),
            Ok(v) => match (v["choices"][0]["message"]["content"].as_str(), v["choices"][0]["finish_reason"].as_str()) {
                // Only an answer the server says it finished is read. Text that stops early is
                // part of an answer, and the core reads what it holds as all there is: a model
                // that wrote its reasoning into content, or an entity list cut at max_tokens,
                // marked the document complete on every layer with names the answer never
                // reached still readable (wf5 S3R-1). Refusing "length" alone left every other
                // early end, and a server that names none, read as whole (wf6 SL-2). The pinned
                // llama-server ends a whole answer with "stop", and the core's calls leave room
                // to spare (a 500-character chunk against 400 tokens, a 900-character one
                // against 300, a grammar-bound one-word classify).
                (Some(t), Some("stop")) if !t.trim().is_empty() => Ok(t.to_string()),
                (Some(t), Some("length")) if !t.trim().is_empty() => Err(format!(
                    "local model: the answer was cut off at its token limit (finish_reason \"length\"), after the request had been sent to process {}",
                    a.pid
                )),
                (Some(t), why) if !t.trim().is_empty() => Err(format!(
                    "local model: the answer did not say it was finished ({}), so it was not read, after the request had been sent to process {}",
                    why.map(|r| format!("finish_reason \"{}\"", r.chars().take(40).collect::<String>())).unwrap_or_else(|| "no finish_reason".into()),
                    a.pid
                )),
                _ => Err(format!(
                    "local model: answered HTTP 200 with no answer text{}, after the request had been sent to process {}",
                    v["choices"][0]["finish_reason"].as_str().map(|r| format!(" (finish_reason \"{r}\")")).unwrap_or_default(),
                    a.pid
                )),
            },
        },
        Ok((status, body)) => Err(format!("local model http {status}: {}", body.chars().take(300).collect::<String>())),
    };
    let (text, error) = match read {
        Ok(t) => (t, None),
        Err(e) => (String::new(), Some(e)),
    };
    Ok(CoreReply { text, error, model: a.origin, pid: a.pid, created: a.created.to_string() })
}

/// complete_local's answer: the text, and the model process that produced it (lib/tauri.ts
/// CoreReply). `created` is a string: a FILETIME is above 2^53, where a JS number rounds.
#[derive(Serialize)]
pub struct CoreReply {
    pub text: String,
    /// why the answer is unusable, when it is; the process named here received the text anyway
    pub error: Option<String>,
    pub model: Origin,
    pub pid: u32,
    pub created: String,
}

/// What one completion came back with, and from which process. `reply` is Err when the
/// request was on its way to that process and no whole answer came back: sent in part or in
/// full, then the connection closed, or the head or body could not be read.
#[cfg_attr(not(windows), allow(dead_code))]
struct Answered {
    reply: Result<(u16, String), String>,
    origin: Origin,
    pid: u32,
    created: u64,
}

/// One completion on a verified connection. The key goes only to the model this app started.
/// Err only while nothing has been written: no process may be sent text, the connection's far
/// end is not the one checked, or the socket could not be set up. From the first byte of the
/// request on, every failure is an Answered naming the process.
#[cfg(windows)]
fn complete_verified_on(port: u16, body: &str, within: Duration) -> Result<Answered, String> {
    let (t, origin) = model_target_of(port).map_err(|e| format!("local model: {e}"))?;
    let s = crate::relay::connect_verified(&t, Duration::from_secs(2))
        .map_err(|why| format!("local model: {why}. Nothing was sent to it."))?;
    let hang = s.try_clone().map_err(|e| format!("local model: {e}. Nothing was sent to it."))?;
    let mut c = service_auth::over(port, s, Duration::from_secs(300)).map_err(|e| format!("local model: {e}. Nothing was sent to it."))?;
    let auth = t.key.as_ref().map(|k| format!("Authorization: Bearer {k}\r\n")).unwrap_or_default();
    let deadline = service_auth::hang_up_after(hang, within);
    let posted = c.post("/v1/chat/completions", &auth, body, 64 << 20);
    // Checked on success too: an answer framed by the connection closing reads as whole when it
    // was the deadline that closed it.
    let reply = match posted {
        _ if deadline.passed() => Err(format!("no whole answer within {} s", within.as_secs())),
        r => r,
    }
    .map_err(|e| format!("local model: {e}, after the request had been sent to process {}", t.pid));
    Ok(Answered { reply, origin, pid: t.pid, created: t.created })
}

/// Without the kernel's connection table there is no per-connection check, so no text is sent.
#[cfg(not(windows))]
fn complete_verified_on(port: u16, _body: &str, _within: Duration) -> Result<Answered, String> {
    Err(format!(
        "local model: this build can check who answers a connection only on Windows, so it sent nothing to 127.0.0.1:{port}."
    ))
}

/// POST /strip on the adapter and relay every NDJSON line — {stage}, {done,…}, {error} — as
/// one Channel message each, in order, so lib/tauri.ts applies the same rules as its browser
/// path (error line throws; done line resolves). A non-200 is returned as the error with the
/// adapter's body (its fail-loud "model offline" 503 included). Returns who served the run.
///
/// The run is held to the model process it was checked against (relay.rs begin_run). Every
/// model call of the chain goes through the relay, which writes nothing on a connection whose
/// far end is not that process. When the process changes or exits (model_watch.rs) the run is
/// stopped: the connection is hung up, which makes the adapter kill its running stage, and an
/// adapter this app started is terminated outright. The run then fails as an incident even if
/// its result line had already arrived, because a refused model call leaves a sweep that did
/// not run, and the frozen result would not be the frozen engine's.
#[tauri::command]
pub async fn strip_proxy(
    text: String,
    profile: Option<String>,
    on_event: Channel<serde_json::Value>,
) -> Result<StripMeta, StripError> {
    tauri::async_runtime::spawn_blocking(move || -> Result<StripMeta, StripError> {
        // Without the kernel's connection table there is no per-connection check, and the
        // chain would dial the model port unchecked: nothing is sent.
        #[cfg(not(windows))]
        {
            let _ = (&text, &profile, &on_event);
            return Err(StripError::from(
                "legal service: this build can check who answers a connection only on Windows, so the frozen pipeline was not used and nothing was sent to it.".to_string(),
            ));
        }
        #[cfg(windows)]
        {
            let relay = relay()?;
            // The profile field is only ever SENT when the caller asked for a non-default
            // doctrine. Relayed verbatim and not validated here on purpose: the adapter owns
            // the list and answers an unknown one with a 400 naming what it accepts, which the
            // status check carries back with its message intact. Validating in two places is
            // how the two lists drift apart.
            let p = prove_for_strip()?;
            let (mut conn, token, service, model) = (p.conn, p.token, p.service, p.model);
            let hang = conn.hangup_handle().map_err(|e| {
                format!("legal service: the app could not keep a handle on its connection ({e}), so it could not stop the run if the model server changed; nothing was sent.")
            })?;
            let stop_adapter = service == Origin::App;
            let guard = relay.begin_run(p.target.clone(), p.tree, move |why| {
                eprintln!("[simpler.legal] stopping the frozen chain: {why}");
                let _ = hang.shutdown(std::net::Shutdown::Both);
                if stop_adapter {
                    crate::job_object::terminate(crate::job_object::Kind::Adapter);
                }
            })
            .map_err(|why| format!("legal service: {why}"))?;
            let body = strip_body(&text, profile.as_deref(), &guard);
            let watch = crate::model_watch::on_exit(p.target.pid, p.target.created, guard.tripper()).map_err(|why| {
                format!("legal service: {why} after the app checked it; nothing was sent. Add the document again.")
            })?;
            // the adapter bounds every stage itself (30 min each) and always ends the stream:
            // a read may wait out one whole stage, and the 2 h cap is the fail-loud bound for
            // a hung upstream
            let ran = conn.post_lines("/strip", &token, &body, Duration::from_secs(35 * 60), Duration::from_secs(2 * 60 * 60), |v| {
                on_event.send(v).map_err(|e| format!("channel: {e}"))
            });
            watch.finish();
            // Read after the run is deregistered: a trip recorded at any point up to here,
            // including one whose hang-up is what ended post_lines, is seen, and nothing can
            // trip it after. The words are recorded before the hang-up (relay.rs Run::trip). A
            // stream the app could not read ends unread: no result was used, so ruling 20's
            // wait and its "result arrived" words do not apply (relay.rs finish_unread).
            let finished = if ran.is_ok() { guard.finish() } else { guard.finish_unread() };
            let stopped = finished.map(|why| stopped_run(why, service, sweep_adapter_trees));
            after_run(ran, stopped, &conn, service, model)
        }
    })
    .await
    .map_err(task_err)?
}

/// The body of one document's /strip. llamaPort is this run's own port on the relay: a
/// hand-started service was started with the model port itself, and this is what routes its run
/// through the check (open_adapter refuses a service that cannot take it); and each call on it is
/// known to be this document's, so its finish waits for its own calls and no other's (relay.rs
/// begin_run, owner ruling 20). It takes the run's guard and not a port so the shared port cannot
/// be put here by mistake: that line sat inline, driven by no test (wf8 S7T-6).
#[cfg(windows)]
fn strip_body(text: &str, profile: Option<&str>, guard: &crate::relay::RunGuard) -> String {
    let mut body = serde_json::json!({ "text": text, "llamaPort": guard.port() });
    if let Some(p) = profile.filter(|p| !matches!(*p, "" | "auto")) {
        body["profile"] = serde_json::Value::String(p.to_string());
    }
    body.to_string()
}

/// strip_proxy's answer once its stream has ended: `ran` is how the stream went, `stopped` the
/// words and reason when the run was stopped partway (engine.rs incident_words, relay.rs), and
/// `conn` the connection the document went out on. Apart so the tests reach it without a
/// service, a relay and a model server; three reverts of the rule below passed the whole suite
/// while it sat inline (wf5 S3R-4).
///
/// Every failure after the document started to go out carries `reached` and who started the
/// service and its model, read off the connection itself, not a copy taken earlier. Without
/// them the receipt said "the frozen legal pipeline was not reachable for this document" of a
/// service that had read all of it, and a service started by hand was named nowhere (wf5
/// S5L-1). A result line that arrived before a stop does not survive it: a refused model call
/// leaves a sweep that did not run.
#[cfg(windows)]
fn after_run(
    ran: Result<usize, String>,
    stopped: Option<Stopped>,
    conn: &Conn,
    service: Origin,
    model: Origin,
) -> Result<StripMeta, StripError> {
    let reached = conn.body_sent();
    if let Some(s) = stopped {
        return Err(StripError {
            message: s.words,
            incident: Some(s.why),
            reached,
            service: Some(service),
            model: Some(model),
            left_on_disk: s.left_on_disk,
            cut_off: s.cut_off,
        });
    }
    match ran {
        Err(message) => Err(StripError { message, incident: None, reached, service: Some(service), model: Some(model), left_on_disk: false, cut_off: false }),
        Ok(_) => Ok(StripMeta { service, model }),
    }
}

/// A run stopped partway: the words for the screen (incident_words), the reason (relay.rs),
/// whether the app's sweep after terminating the service it started left that run's tree on disk,
/// and whether the reason was an answer that was not whole rather than a change of model server.
#[cfg(windows)]
struct Stopped {
    words: String,
    why: String,
    left_on_disk: bool,
    cut_off: bool,
}

/// strip_proxy's record of a stopped run. Only the service this app started is swept: the app
/// terminated it, so it ran no cleanup and its tree holds this document; a service started by
/// hand is still running and owns its tree, and sweeping that would take a document from under a
/// live run. Apart from strip_proxy so both halves are tested: a sweep whose report was dropped,
/// and one run for the other origin, each passed the whole suite while this sat inline (wf6
/// S3-3, mutants MA1 and MA2).
#[cfg(windows)]
fn stopped_run(why: String, service: Origin, sweep: impl FnOnce() -> bool) -> Stopped {
    let left_on_disk = service == Origin::App && sweep();
    let cut_off = why.starts_with(crate::relay::CUT_OFF);
    Stopped { words: incident_words(LLAMA_PORT, &why, cut_off), why, left_on_disk, cut_off }
}

/// What the lawyer is told when a run was stopped because the model server changed or exited.
/// On screen only (lib/tauri.ts): it names processes and ports, and the receipt that travels
/// with the redacted copy carries only that the run was stopped and why in general terms.
/// Until 2026-09-23 the second sentence said part of the document "may have reached" a new
/// holder: under the 20 ms watch that was true. Now every connection is checked before a byte
/// is written on it (relay.rs), so the words say what did happen, and what to do about a
/// program that took the port. It stays on screen after that document has gone by, so it says
/// "a document": which one is said on its own row and receipt (engineStatus.ts RUN_STOPPED).
///
/// A run stopped for an answer that was not whole (`cut_off`, relay.rs CUT_OFF) gets its own
/// words: the port sentence below would send the lawyer to the IT team about a program taking a
/// port when the model server that answered was the one checked. They say the result was not
/// used, not that the pipeline was stopped partway: the run can be refused at its end, after the
/// pipeline has read the whole document, when a call was still open as its result arrived
/// (relay.rs RunGuard::finish), and "stopped partway" then contradicted legal-serve.log, which
/// records that run as completed (wf8 S7A-1). The last sentence names how long the calls took,
/// because a call the chain gave up on at 45 s is a completed one in the model server's log
/// (wf8 S7A-2).
#[cfg(windows)]
fn incident_words(port: u16, why: &str, cut_off: bool) -> String {
    if cut_off {
        return format!(
            "The frozen pipeline's result for a document was not used: {why}. The pipeline reads a cut-off answer as all there is and goes on past a missing one, which leaves untagged whatever that call was there to find. The in-app core redacts that document instead; its row and its receipt say so. If this happens on every document, check that the model server runs with thinking off, as the frozen configuration does, and what its own log records for those calls, including how long each took: the pipeline gives up on a call after 45 seconds."
        );
    }
    let now: Option<String> = match crate::port_owner::listeners(port) {
        Ok(p) if p.is_empty() => None,
        Ok(p) => Some(p.iter().map(|pid| crate::port_owner::classify(*pid).describe()).collect::<Vec<_>>().join("; ")),
        Err(e) => Some(format!("a process the app could not identify ({e})")),
    };
    let head = format!(
        "The frozen pipeline was stopped partway through a document: {why}. The app checks every connection to the model server before any text is sent on it, so none of that document was sent to a process the app had not checked. The in-app core redacts that document instead; its row and its receipt say so."
    );
    match now {
        None => format!("{head} Nothing holds port {port} now; the frozen pipeline is used again once the model server is back."),
        Some(who) => format!(
            "{head} Port {port} is now held by {who}. If you did not restart the model server yourself, tell your IT team: a program on this computer took the port the model server uses."
        ),
    }
}

/// A proven connection, ready for the document, and the model process the run is held to. The
/// model check can take ~15 s the first time it meets a hand-started model server (the pin
/// check), longer than the adapter keeps an idle connection open (Node's 5 s keep-alive), so
/// when it was slow the adapter is asked to prove itself again on a fresh connection, and must
/// be the same process.
#[cfg(windows)]
struct Proven {
    conn: Conn,
    token: String,
    service: Origin,
    model: Origin,
    /// the model process every connection of this run must reach (relay.rs)
    target: crate::relay::Target,
    /// a hand-started service's process, whose stages the relay admits during this run; None
    /// for the service this app started, which the relay admits by its job
    tree: Option<(u32, u64)>,
}

#[cfg(windows)]
fn prove_for_strip() -> Result<Proven, String> {
    let started = Instant::now();
    let (conn, hello, token, service) = match open_adapter(LEGAL_PORT) {
        Adapter::Proven { conn, hello, token, origin } => (conn, hello, token, origin),
        Adapter::Refused(r) => return Err(r),
        Adapter::Absent => return Err(format!("legal service: nothing is listening on 127.0.0.1:{LEGAL_PORT}")),
    };
    let tree = match service {
        Origin::App => None,
        Origin::Hand => Some(hand_service_tree(&hello)?),
    };
    let model = adapter_model(&hello)?
        .ok_or_else(|| format!("legal service: its model server on port {LLAMA_PORT} is not serving yet"))?;
    let target = model_target(LLAMA_PORT)?;
    if target.pid != model.pid || target.created != model.created {
        return Err(format!("legal service: the model server on port {LLAMA_PORT} changed while it was being checked; nothing was sent. Try again."));
    }
    let done = |conn, token, service| Proven { conn, token, service, model: model.origin, target: target.clone(), tree };
    if started.elapsed() < Duration::from_secs(2) {
        return Ok(done(conn, token, service));
    }
    drop(conn);
    match open_adapter(LEGAL_PORT) {
        Adapter::Proven { conn, hello: again, token, origin } if again.pid == hello.pid && origin == service => {
            Ok(done(conn, token, origin))
        }
        Adapter::Proven { .. } => Err(format!("legal service: the service on port {LEGAL_PORT} changed while its model was being checked; nothing was sent. Try again.")),
        Adapter::Refused(r) => Err(r),
        Adapter::Absent => Err(format!("legal service: the service on port {LEGAL_PORT} went away; nothing was sent")),
    }
}

/// RunEvent::Exit (main.rs). The job kills the adapter mid-run when the app closes, and a
/// killed process runs no cleanup, so the per-run working tree — the unredacted document and
/// the span-to-tag key — stayed on disk until the adapter's next boot sweep (LAUNCH.md §2.5).
/// Killing the job here first, then deleting, closes that for every ordinary close. Only when
/// this app spawned the adapter: a hand-started one owns its tree and sweeps it itself. A
/// crash or a forced kill of the app skips this hook; the adapter's boot sweep is then what
/// removes the tree, at the next start.
///
/// Runs once per process, from whichever comes first: RunEvent::ExitRequested (main.rs), which
/// the close delivers even when tao's loop never finishes; RunEvent::Exit (main.rs), the only
/// one on WM_ENDSESSION; or the exit watchdog (exit_guard.rs). A caller that arrives while it
/// runs waits for it to finish, so nothing ends the process mid-kill or mid-sweep, except the
/// watchdog, which bounds that wait (shutdown_finished).
pub fn shutdown(state: &EngineState) {
    run_once(&SHUTDOWN, || shutdown_now(state));
}

/// Once, plus two flags a watcher can read without joining the wait: `started` is set before
/// the teardown's first act (terminate_all, lock-free), `finished` after its last.
pub(crate) struct RunOnce {
    once: std::sync::Once,
    started: AtomicBool,
    finished: AtomicBool,
}

impl RunOnce {
    pub(crate) const fn new() -> Self {
        RunOnce { once: std::sync::Once::new(), started: AtomicBool::new(false), finished: AtomicBool::new(false) }
    }
}

static SHUTDOWN: RunOnce = RunOnce::new();

/// call_once_force, not call_once: a teardown that panicked is tried again by the next caller.
fn run_once(r: &RunOnce, f: impl FnOnce()) {
    r.once.call_once_force(|_| {
        r.started.store(true, Ordering::SeqCst);
        f();
        r.finished.store(true, Ordering::SeqCst);
    });
}

pub(crate) fn shutdown_started() -> bool {
    SHUTDOWN.started.load(Ordering::SeqCst)
}

pub(crate) fn shutdown_finished() -> bool {
    SHUTDOWN.finished.load(Ordering::SeqCst)
}

/// For the exit watchdog when a teardown under way has not finished in its bound: the jobs are
/// already terminated (shutdown_now's first act), so the adapter is dead and its tree is free to
/// delete; sweep_trees_in tolerates a remover running beside it. Only when this app spawned it;
/// the answer says whether it swept, for the watchdog's line.
pub(crate) fn sweep_if_spawned() -> bool {
    let spawned = ADAPTER_SPAWNED.load(Ordering::SeqCst);
    if spawned {
        sweep_adapter_trees();
    }
    spawned
}

fn shutdown_now(state: &EngineState) {
    #[cfg(windows)]
    crate::job_object::terminate_all();
    if let Ok(mut guard) = state.0.lock() {
        let ch = &mut *guard;
        for c in [ch.adapter.as_mut(), ch.launcher.as_mut()].into_iter().flatten() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
    if ADAPTER_SPAWNED.load(Ordering::SeqCst) {
        sweep_adapter_trees();
    }
}

/// Delete the working trees of the adapter this app runs on LEGAL_PORT, once it is dead. Only
/// its own: serve-legal.mjs names every tree after its port (p1436-…), and a service started by
/// hand on another port is mid-run on trees this app has no business deleting. Trees without a
/// port prefix are from a build before that naming, and belong to whichever adapter ran here.
/// True when any of them is still there afterwards (strip_proxy puts that on the receipt).
///
/// What it could not remove is also written to legal-serve.log, the service's own log. The
/// receipt points there (engineStatus.ts LEFT_ON_DISK): this app is built without a console, so
/// an eprintln alone named the folder to no one (SEAM-ENGINE-CONSOLE). The service's next start
/// rewrites that log, and its boot sweep then tries the folder again and names it again if it
/// is still there.
fn sweep_adapter_trees() -> bool {
    let Ok(root) = engine_root() else { return false };
    let log = log_dir().map(|d| d.join("legal-serve.log"));
    sweep_trees_in(&serve_dir(&root), LEGAL_PORT, log.as_deref())
}

/// Where serve-legal.mjs keeps its run trees (its SERVE), under the engine root. One function for
/// both sweeps, and a test holds it to the service's own line: a sweep pointed at another folder
/// passed every test (wf6 S3-3, mutant MA3), and would report "nothing left" over a folder it
/// never looked in.
fn serve_dir(root: &Path) -> PathBuf {
    root.join("raw").join("stripped").join("_serve")
}

/// One line appended to a log this app writes, redacted like the children's lines (pump_logs).
/// Best-effort: a log that cannot be opened loses the line, which eprintln still carries.
pub(crate) fn append_log(log: &Path, line: &str) {
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(log) {
        let _ = f.write_all(&redact(format!("{line}\n").as_bytes(), redactions()));
    }
}

/// sweep_adapter_trees on a folder, port and log given, so a test can hold a tree open under a
/// folder of its own. A folder that cannot be listed for any reason but its absence counts as a
/// tree left: the receipt then says the working copy may be on disk, the direction that costs a
/// lawyer a look rather than a false assurance.
fn sweep_trees_in(serve: &Path, port: u16, log: Option<&Path>) -> bool {
    let say = |line: String| {
        eprintln!("{line}");
        if let Some(l) = log {
            append_log(l, &line);
        }
    };
    let rd = match std::fs::read_dir(serve) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return false,
        Err(e) => {
            say(format!(
                "[simpler.legal] COULD NOT LIST {} after stopping the engine service ({e}) — a run tree in it may hold an unredacted document and its span-to-tag key; the engine's next start tries again, or look there by hand",
                serve.display()
            ));
            return true;
        }
    };
    let ours = format!("p{port}-");
    let mut left = false;
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if !name.starts_with(&ours) && port_prefixed(&name) {
            continue;
        }
        let p = e.path();
        // a terminated child can hold a handle for a moment after it is gone; the adapter's
        // own discard() retries the same way (8 x 150 ms)
        for _ in 0..8 {
            if std::fs::remove_dir_all(&p).is_ok() || !p.exists() {
                break;
            }
            std::thread::sleep(Duration::from_millis(150));
        }
        if p.exists() {
            left = true;
            say(format!(
                "[simpler.legal] COULD NOT REMOVE {} after stopping the engine service — it holds an unredacted document and its span-to-tag key; the engine's next start removes it, or delete it by hand",
                p.display()
            ));
        }
    }
    left
}

/// serve-legal.mjs isOwnTree's other half: a name that starts `p<digits>-` belongs to the
/// service on that port.
fn port_prefixed(name: &str) -> bool {
    tree_port_digits(name).is_some()
}

fn tree_port_digits(name: &str) -> Option<&str> {
    let rest = name.strip_prefix('p')?;
    let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
    (digits > 0 && rest.as_bytes().get(digits) == Some(&b'-')).then(|| &rest[..digits])
}

static SWEPT: AtomicBool = AtomicBool::new(false);

/// Once per launch, before anything is spawned (LAUNCH.md §2.5, the residual): what an earlier
/// run of this app family left behind when it was killed before it could clean up. Only names
/// this family writes, and only when nothing is using them:
///   <engine>\raw\stripped\_serve\p<N>-…   a run tree of the service on port N (serve-legal.mjs
///                                          treePrefix), when nothing listens on N; one without
///                                          a port prefix (an older build's) when nothing
///                                          listens on 1436. Each holds an unredacted document
///                                          and its span-to-tag key.
///   %LOCALAPPDATA%\Simpler AI\run\legal-service-<N>.token         when nothing listens on N
///   %LOCALAPPDATA%\Simpler AI\run\legal-service-<N>.token.<pid>   a write that never finished
///                                          (serve-legal.mjs writeTokenFile), when <pid> is gone
///   %APPDATA%\Simpler AI\logs\legal-llama-server.log and legal-serve.log   this app's logs
///                                          before they moved (log_dir); those two names only,
///                                          since the family's other apps log in that folder.
/// A service's own boot sweep removes its port's trees; this covers a port no service comes
/// back to. When the port table cannot be read, nothing is deleted. A service writes its
/// token file only once it holds its port, so a live service's file is never taken for stale.
fn sweep_stale_once(root: &Path) {
    if SWEPT.swap(true, Ordering::SeqCst) {
        return;
    }
    #[cfg(windows)]
    {
        let idle = |port: u16| idle_by(crate::port_owner::listeners(port));
        let gone = |pid: u32| gone_by(crate::port_owner::created_of(pid), crate::port_owner::parent_of(pid));
        let serve = serve_dir(root);
        let run = token_file(LEGAL_PORT).and_then(|f| f.parent().map(Path::to_path_buf));
        sweep_stale_in(&serve, run.as_deref(), idle, gone);
        if let Some(roaming) = std::env::var_os("APPDATA") {
            let logs = PathBuf::from(roaming).join("Simpler AI").join("logs");
            for n in ["legal-llama-server.log", "legal-serve.log"] {
                let _ = std::fs::remove_file(logs.join(n));
            }
        }
    }
    #[cfg(not(windows))]
    let _ = root;
}

/// A port is idle only when the listener table was read and lists nobody on it. When it cannot
/// be read, nothing is taken for stale.
fn idle_by(listening: Result<Vec<u32>, String>) -> bool {
    listening.map(|p| p.is_empty()).unwrap_or(false)
}

/// A pid is gone only when it has no creation time AND no row in the process snapshot: a
/// process this app may not inspect (another account, elevated) has the first and not the
/// second, and its half-written token file is not ours to delete.
fn gone_by(created: u64, parent: Option<u32>) -> bool {
    created == 0 && parent.is_none()
}

/// The stale sweep's rule over the run trees in `serve` and the token files in `run`, apart from
/// the two questions it asks of the machine (`idle`, `gone`), so a test can run it on a folder of
/// its own with answers it chooses. Returns what it removed.
fn sweep_stale_in(serve: &Path, run: Option<&Path>, idle: impl Fn(u16) -> bool, gone: impl Fn(u32) -> bool) -> Vec<PathBuf> {
    let mut removed = Vec::new();
    for e in std::fs::read_dir(serve).into_iter().flatten().flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let port = match tree_port_digits(&name) {
            Some(d) => d.parse::<u16>().ok(),
            None => Some(LEGAL_PORT),
        };
        if port.is_some_and(&idle) {
            let p = e.path();
            let gone_now = std::fs::remove_dir_all(&p).is_ok() || !p.exists();
            eprintln!(
                "[simpler.legal] stale sweep: {} {} (a run tree left by an engine service that was stopped before it could clean up)",
                if gone_now { "removed" } else { "COULD NOT REMOVE" },
                p.display()
            );
            if gone_now {
                removed.push(p);
            }
        }
    }
    let Some(run) = run else { return removed };
    for e in std::fs::read_dir(run).into_iter().flatten().flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let Some((port, tail)) = name.strip_prefix("legal-service-").and_then(|r| r.split_once(".token")) else { continue };
        let Some(port) = port.bytes().all(|b| b.is_ascii_digit()).then(|| port.parse::<u16>().ok()).flatten() else {
            continue;
        };
        let stale = match tail {
            "" => idle(port),
            t => t.strip_prefix('.').filter(|p| p.bytes().all(|b| b.is_ascii_digit())).and_then(|p| p.parse::<u32>().ok()).is_some_and(&gone),
        };
        if stale && std::fs::remove_file(e.path()).is_ok() {
            eprintln!("[simpler.legal] stale sweep: removed {} (no engine service holds its port)", e.path().display());
            removed.push(e.path());
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_teardown_runs_once_and_a_late_caller_waits_for_it() {
        let r = RunOnce::new();
        let runs = std::sync::atomic::AtomicUsize::new(0);
        let done = AtomicBool::new(false);
        std::thread::scope(|s| {
            s.spawn(|| {
                run_once(&r, || {
                    runs.fetch_add(1, Ordering::SeqCst);
                    std::thread::sleep(Duration::from_millis(300));
                    done.store(true, Ordering::SeqCst);
                })
            });
            while !r.started.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(5));
            }
            assert!(!r.finished.load(Ordering::SeqCst));
            run_once(&r, || {
                runs.fetch_add(1, Ordering::SeqCst);
            });
            assert!(done.load(Ordering::SeqCst), "a second caller returned while the teardown was still running");
            assert!(r.finished.load(Ordering::SeqCst));
        });
        assert_eq!(runs.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_teardown_that_panicked_is_tried_again() {
        let r = RunOnce::new();
        let first = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_once(&r, || panic!("first try"))));
        assert!(first.is_err());
        assert!(r.started.load(Ordering::SeqCst) && !r.finished.load(Ordering::SeqCst));
        let mut again = false;
        run_once(&r, || again = true);
        assert!(again && r.finished.load(Ordering::SeqCst));
    }

    #[cfg(windows)]
    #[test]
    fn shutdown_kills_a_live_child_and_a_second_shutdown_does_nothing() {
        let child = Command::new("ping")
            .args(["-n", "30", "127.0.0.1"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("ping");
        let state = EngineState(Arc::new(Mutex::new(Children { launcher: None, adapter: Some(child) })));
        let r = RunOnce::new();
        let t0 = Instant::now();
        run_once(&r, || shutdown_now(&state));
        assert!(t0.elapsed() < Duration::from_secs(10));
        let exited = state.0.lock().unwrap().adapter.as_mut().unwrap().try_wait().unwrap();
        assert!(exited.is_some(), "the child outlived shutdown");
        let mut again = false;
        run_once(&r, || again = true);
        assert!(!again);
    }

    #[test]
    fn node_options_loses_the_proxy_flag_and_keeps_everything_else() {
        let f = node_options_without_env_proxy;
        assert_eq!(f("--use-env-proxy").as_deref(), Some(""));
        assert_eq!(f("--max-old-space-size=4096 --use-env-proxy --trace-warnings").as_deref(), Some("--max-old-space-size=4096 --trace-warnings"));
        assert_eq!(f("--use_env_proxy").as_deref(), Some(""));
        assert_eq!(f("--use-env-proxy=1 --inspect").as_deref(), Some("--inspect"));
        assert_eq!(f("\"--use-env-proxy\"").as_deref(), Some(""));
        assert_eq!(f("--require \"C:\\\\My Tools\\\\hook.js\" --use-env-proxy").as_deref(), Some("--require \"C:\\\\My Tools\\\\hook.js\""));
        // CONTROL: without the flag nothing is rewritten, including the look-alikes
        assert_eq!(f("--max-old-space-size=4096 --trace-warnings"), None);
        assert_eq!(f("--no-use-env-proxy"), None);
        assert_eq!(f("--require \"a --use-env-proxy b\""), None);
        assert_eq!(f(""), None);
    }

    /// The hazard, and the scrub, on the real Node: a fetch to a 127.0.0.1 target with a proxy in
    /// the environment and NODE_USE_ENV_PROXY=1. Without the scrub the proxy receives the request
    /// (with its body, the stand-in for a document); with it the target does.
    #[cfg(windows)]
    #[test]
    fn a_proxy_in_the_environment_carries_nothing_after_the_scrub() {
        use std::io::BufRead;
        let node = match Command::new("node").arg("--version").output() {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
            _ => return eprintln!("SKIP: node is not on PATH"),
        };
        // A request line and its Content-Length body, as "LINE | BODY".
        fn read_req(r: &mut impl BufRead) -> String {
            let mut first = String::new();
            let _ = r.read_line(&mut first);
            let mut len = 0usize;
            loop {
                let mut h = String::new();
                if r.read_line(&mut h).unwrap_or(0) == 0 || h.trim().is_empty() {
                    break;
                }
                if let Some(v) = h.to_ascii_lowercase().strip_prefix("content-length:") {
                    len = v.trim().parse().unwrap_or(0);
                }
            }
            let mut body = vec![0u8; len];
            let _ = r.read_exact(&mut body);
            format!("{} | {}", first.trim(), String::from_utf8_lossy(&body))
        }
        // A stand-in server that also acts as a proxy: Node 22 tunnels even plain http through
        // CONNECT (measured: "CONNECT 127.0.0.1:<port> HTTP/1.1"), so it opens the tunnel and
        // reads what Node sends inside it, which is what a real proxy could read.
        let listen = || {
            let l = crate::port_owner::scratch_listener();
            let port = l.local_addr().unwrap().port();
            let (tx, rx) = std::sync::mpsc::channel::<String>();
            std::thread::spawn(move || {
                for c in l.incoming() {
                    let Ok(c) = c else { break };
                    let _ = c.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut r = std::io::BufReader::new(c.try_clone().unwrap());
                    let mut seen = read_req(&mut r);
                    if seen.starts_with("CONNECT ") {
                        let _ = (&c).write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n");
                        seen = format!("{seen} || {}", read_req(&mut r));
                    }
                    let _ = (&c).write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
                    let _ = tx.send(seen);
                }
            });
            (port, rx)
        };
        // `flag`: turn the proxy on with node's --use-env-proxy, which is on the command line where
        // no scrub reaches. Then HTTP_PROXY is the only thing left to scrub, so this is the run
        // that fails if the scrub keeps it; the variable form passes on NODE_USE_ENV_PROXY alone.
        let run = |scrub: bool, flag: bool| {
            let (proxy, at_proxy) = listen();
            let (target, at_target) = listen();
            let mut cmd = Command::new("node");
            if flag {
                cmd.arg("--use-env-proxy");
            }
            cmd.arg("-e")
                .arg(format!(
                    "fetch('http://127.0.0.1:{target}/v1/chat/completions', {{ method: 'POST', body: 'DOC' }}).then(r => r.text()).then(() => process.exit(0), () => process.exit(3))"
                ))
                .env("HTTP_PROXY", format!("http://127.0.0.1:{proxy}"))
                .env("NODE_USE_ENV_PROXY", "1")
                .env_remove("NO_PROXY")
                .env_remove("no_proxy")
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            if scrub {
                scrub_proxy(&mut cmd);
            }
            let _ = cmd.status();
            let t = Duration::from_millis(300);
            (at_proxy.recv_timeout(t).ok(), at_target.recv_timeout(t).ok())
        };
        for flag in [false, true] {
            let (via_proxy, direct) = run(false, flag);
            assert!(
                via_proxy.as_deref().is_some_and(|l| l.ends_with("POST /v1/chat/completions HTTP/1.1 | DOC")) && direct.is_none(),
                "CONTROL on node {node} (flag {flag}): unscrubbed, the proxy should have read the request and its body ({via_proxy:?}, target {direct:?})"
            );
            let (via_proxy, direct) = run(true, flag);
            assert_eq!(via_proxy, None, "after the scrub the proxy received the request (flag {flag})");
            assert_eq!(direct.as_deref(), Some("POST /v1/chat/completions HTTP/1.1 | DOC"), "flag {flag}");
        }
    }

    #[test]
    fn logs_lose_the_profile_path_and_the_account_name() {
        let pats = redaction_patterns(Some("C:\\Users\\Jane.Doe"), Some("Jane.Doe"));
        let r = |s: &str| String::from_utf8(redact(s.as_bytes(), &pats)).unwrap();
        assert_eq!(r("model C:\\Users\\Jane.Doe\\models\\m.gguf\n"), "model %USERPROFILE%\\models\\m.gguf\n");
        assert_eq!(r("load c:/users/jane.doe/models/m.gguf"), "load %USERPROFILE%/models/m.gguf");
        assert_eq!(r("{\"path\":\"C:\\\\Users\\\\Jane.Doe\\\\x\"}"), "{\"path\":\"%USERPROFILE%\\\\x\"}");
        assert_eq!(r("D:\\share\\JANE.DOE\\notes"), "D:\\share\\%USERNAME%\\notes");
        // CONTROL: a line with neither is written as it came, byte for byte
        assert_eq!(r("srv  load_model: loading model 'm.gguf'\n"), "srv  load_model: loading model 'm.gguf'\n");
        // and a two-letter account name is not scattered through the log
        assert!(redaction_patterns(None, Some("ab")).is_empty());
    }

    #[test]
    fn stale_tree_names_are_read_by_port() {
        assert_eq!(tree_port_digits("p1436-lxyz-1"), Some("1436"));
        assert_eq!(tree_port_digits("p14370-a"), Some("14370"));
        // CONTROL: names that are not a port's tree
        assert_eq!(tree_port_digits("lxyz-1"), None);
        assert_eq!(tree_port_digits("p-1"), None);
        assert_eq!(tree_port_digits("px1436-1"), None);
    }

    /// The stale sweep deletes an unredacted document and its span-to-tag key, so what it may
    /// delete is pinned on a folder of the test's own, with the two answers it asks the machine
    /// for chosen here. Until 2026-09-23 the rule sat inline and untested: a sweep that deleted
    /// every tree, or every token file, whatever held its port, left the suite green (wf4
    /// S-truth-7, mutations M13 and M14).
    #[test]
    fn the_stale_sweep_takes_only_what_nothing_holds() {
        let base = std::env::temp_dir().join(format!("simpler-legal-sweep-test-{}-{}", std::process::id(), line!()));
        let _ = std::fs::remove_dir_all(&base);
        let (serve, run) = (base.join("_serve"), base.join("run"));
        for d in ["p14371-a", "p1436-b", "lxyz-1", "p14372-c"] {
            std::fs::create_dir_all(serve.join(d).join("inner")).unwrap();
        }
        std::fs::create_dir_all(&run).unwrap();
        let files = [
            "legal-service-14371.token",
            "legal-service-1436.token",
            "legal-service-14371.token.4242",
            "legal-service-14371.token.777",
            "legal-service-x.token",
            "legal-service-14371.tokenX",
            "other.token",
        ];
        for f in files {
            std::fs::write(run.join(f), "t").unwrap();
        }
        // 14371 is idle, every other port is held; pid 4242 is gone, every other pid lives
        let removed = sweep_stale_in(&serve, Some(&run), |p| p == 14371, |pid| pid == 4242);
        let left = |d: &Path| {
            let mut v: Vec<String> = std::fs::read_dir(d).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
            v.sort();
            v
        };
        let (trees, tokens) = (left(&serve), left(&run));
        // CONTROL: with every port idle and every pid gone, the unprefixed tree (an older build's,
        // judged by 1436) and the rest of the family's names go too; the names that are not the
        // family's stay
        let again = sweep_stale_in(&serve, Some(&run), |_| true, |_| true);
        let (trees2, tokens2) = (left(&serve), left(&run));
        let _ = std::fs::remove_dir_all(&base);
        assert_eq!(trees, ["lxyz-1", "p1436-b", "p14372-c"], "only the tree of the idle port is removed");
        assert_eq!(
            tokens,
            ["legal-service-1436.token", "legal-service-14371.token.777", "legal-service-14371.tokenX", "legal-service-x.token", "other.token"],
            "only the idle port's token file and the gone writer's half-written one are removed"
        );
        assert_eq!(removed.len(), 3);
        assert!(trees2.is_empty(), "{trees2:?}");
        assert_eq!(tokens2, ["legal-service-14371.tokenX", "legal-service-x.token", "other.token"]);
        assert_eq!(again.len(), 5);
    }

    #[test]
    fn a_port_is_idle_and_a_pid_gone_only_when_the_machine_says_so() {
        assert!(idle_by(Ok(vec![])));
        assert!(!idle_by(Ok(vec![7])));
        assert!(!idle_by(Err("the table could not be read".into())), "an unreadable table deletes nothing");
        assert!(gone_by(0, None));
        assert!(!gone_by(0, Some(4)), "a process this app may not inspect is not gone");
        assert!(!gone_by(133_000_000_000_000_000, Some(4)));
        #[cfg(windows)]
        {
            let me = std::process::id();
            assert!(!gone_by(crate::port_owner::created_of(me), crate::port_owner::parent_of(me)), "this live process is not gone");
        }
    }

    /// What /props says decides a hand-started model server. Only a 503 (llama-server loading)
    /// or no answer means "ask again"; a 401 is a steady state, the model server of another open
    /// copy of this app, and was read as loading, forever (wf4 S-truth-2).
    #[test]
    fn a_model_server_that_answers_props_only_with_a_key_is_refused_in_words() {
        let img = "C:\\x\\llama-server.exe";
        let keyed = verify_hand_model(14371, img, 401, "{\"error\":{\"code\":401}}").unwrap_err();
        assert!(keyed.contains("another open copy of simpler.legal") && keyed.contains("press Retry") && keyed.contains(img), "{keyed}");
        assert!(verify_hand_model(14371, img, 403, "").unwrap_err().contains("holds its key"));
        let other = verify_hand_model(14371, img, 404, "not found").unwrap_err();
        assert!(other.contains("HTTP 404") && other.contains("press Retry"), "{other}");
        // CONTROL: loading, and nothing back yet, are still "ask again"
        assert_eq!(verify_hand_model(14371, img, 503, "{\"error\":\"Loading model\"}"), Ok(None));
        assert_eq!(verify_hand_model(14371, img, 0, ""), Ok(None));
    }

    /// A stand-in for another copy's model server, in this process (your own account, not this
    /// app's job, as the other copy's model server is to this one): /health 200 and every other
    /// path `rest`, as llama-server answers with --api-key set (401) or while loading (503).
    /// Also reports the request line of every connection that sent one.
    #[cfg(windows)]
    fn stand_in(rest: &'static str) -> (u16, std::sync::mpsc::Receiver<String>) {
        use std::io::BufRead;
        let l = crate::port_owner::scratch_listener();
        let port = l.local_addr().unwrap().port();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            for c in l.incoming() {
                let Ok(c) = c else { break };
                let _ = c.set_read_timeout(Some(Duration::from_secs(5)));
                let mut r = std::io::BufReader::new(c.try_clone().unwrap());
                let mut first = String::new();
                if r.read_line(&mut first).unwrap_or(0) == 0 {
                    continue; // a connection that sent nothing: `answering`, or a refused probe
                }
                loop {
                    let mut h = String::new();
                    if r.read_line(&mut h).unwrap_or(0) == 0 || h.trim().is_empty() {
                        break;
                    }
                }
                let _ = tx.send(first.trim().to_string());
                let code = if first.starts_with("GET /health ") { "200 OK" } else { rest };
                let _ = (&c).write_all(format!("HTTP/1.1 {code}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}").as_bytes());
            }
        });
        (port, rx)
    }

    /// A probe of the model goes only on a connection whose far end is the process named: here
    /// the listener is this process, and a probe addressed to another live process sends nothing.
    /// An unchecked probe is how a [::1] holder's /props reached this app's own model (wf4
    /// S-local-2).
    #[cfg(windows)]
    #[test]
    fn a_probe_is_sent_only_to_the_process_it_names() {
        let (port, seen) = stand_in("401 Unauthorized");
        let mut other = Command::new("ping").args(["-n", "30", "127.0.0.1"]).stdout(Stdio::null()).spawn().expect("ping.exe");
        let not_it = probe_model(port, other.id(), crate::port_owner::created_of(other.id()), "GET", "/props", "");
        let _ = other.kill();
        let _ = other.wait();
        assert_eq!(not_it, None, "a probe addressed to another process was answered");
        assert!(seen.recv_timeout(Duration::from_millis(500)).is_err(), "the listener received a request meant for another process");
        // CONTROL: addressed to the process that listens, it is sent and answered
        let me = std::process::id();
        assert_eq!(probe_model(port, me, crate::port_owner::created_of(me), "GET", "/props", "").map(|(s, _)| s), Some(401));
        assert_eq!(seen.recv_timeout(Duration::from_secs(5)).unwrap(), "GET /props HTTP/1.0");
    }

    #[cfg(windows)]
    #[test]
    fn a_second_copy_is_told_why_and_not_left_waiting() {
        let (keyed, _) = stand_in("401 Unauthorized");
        let r = trusted_model(keyed);
        assert!(matches!(&r, Err(e) if e.contains("another open copy of simpler.legal")), "{:?}", r.as_ref().err());
        assert!(model_target(keyed).unwrap_err().contains("another open copy"), "complete_local and the relay are refused in the same words");
        // CONTROL: the same stand-in answering 503 (loading) is waited on, and nothing is cached
        let (loading, _) = stand_in("503 Service Unavailable");
        assert!(matches!(trusted_model(loading), Ok(None)));
        assert!(model_target(loading).unwrap_err().contains("nothing is serving"));
    }

    /// A model server in this process that reads each request whole (head and body), then sends
    /// what `reply` returns for its request line, or hangs up without a byte when it returns None:
    /// a llama-server that died mid-request. Reports (request line, Authorization, body).
    #[cfg(windows)]
    fn model_stand_in(
        mut reply: impl FnMut(&str) -> Option<String> + Send + 'static,
    ) -> (u16, std::sync::mpsc::Receiver<(String, String, String)>) {
        let l = crate::port_owner::scratch_listener();
        let port = l.local_addr().unwrap().port();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            for c in l.incoming() {
                let Ok(c) = c else { break };
                let Some((line, auth, body)) = read_model_request(&c) else {
                    continue; // `answering`, or a connection connect_verified refused
                };
                let answer = reply(&line);
                let _ = tx.send((line, auth, body));
                match answer {
                    Some(a) => {
                        let _ = (&c).write_all(a.as_bytes());
                    }
                    None => {
                        let _ = c.shutdown(std::net::Shutdown::Both);
                    }
                }
            }
        });
        (port, rx)
    }

    /// One request read whole off `c`: (request line, Authorization, body). None for a
    /// connection that sent nothing.
    #[cfg(windows)]
    fn read_model_request(c: &TcpStream) -> Option<(String, String, String)> {
        use std::io::BufRead;
        let _ = c.set_read_timeout(Some(Duration::from_secs(5)));
        let mut r = std::io::BufReader::new(c.try_clone().unwrap());
        let mut first = String::new();
        if r.read_line(&mut first).unwrap_or(0) == 0 {
            return None;
        }
        let (mut len, mut auth) = (0usize, String::new());
        loop {
            let mut h = String::new();
            if r.read_line(&mut h).unwrap_or(0) == 0 || h.trim().is_empty() {
                break;
            }
            let (k, v) = h.split_once(':').unwrap_or((h.as_str(), ""));
            match k.trim().to_ascii_lowercase().as_str() {
                "content-length" => len = v.trim().parse().unwrap_or(0),
                "authorization" => auth = v.trim().to_string(),
                _ => {}
            }
        }
        let mut body = vec![0u8; len];
        let _ = r.read_exact(&mut body);
        Some((first.trim().to_string(), auth, String::from_utf8_lossy(&body).into_owned()))
    }

    #[cfg(windows)]
    fn http(code: &str, body: &str) -> String {
        format!("HTTP/1.1 {code}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
    }

    /// The verdict trusted_model caches for this process on `port` once it has checked it. No
    /// stand-in can serve the pinned 3.3 GB model file, so the pin check is what is skipped.
    #[cfg(windows)]
    fn seed_verdict(port: u16, origin: Origin) -> (u32, u64) {
        let me = std::process::id();
        let created = crate::port_owner::created_of(me);
        verdicts().lock().unwrap().insert((port, me, created), Verdict { origin, refused: None, notes: Vec::new(), pid: me, created });
        (me, created)
    }

    #[cfg(windows)]
    const ANSWERED: &str = r#"{"choices":[{"finish_reason":"stop","message":{"content":"answered"}}]}"#;

    /// The in-app core's reply names the process that received the request whatever came back:
    /// an answer, an answer the core cannot use, or nothing after the request was read. That last
    /// was an Err naming no process, so a model server started outside this app that crashed
    /// mid-request received a chunk of the document and Review never said so (wf4 S3-3). Also
    /// the Rust half of wf4 S-local-1: a reply naming this app's model, or no process, for an
    /// outside one failed nothing before this (S3-4). The stand-in is this process, outside the
    /// app's jobs, which is what a model server started by hand is.
    #[cfg(windows)]
    #[test]
    fn every_reply_after_the_request_went_out_names_the_process_that_received_it() {
        let mut n = 0;
        let (port, seen) = model_stand_in(move |_| {
            n += 1;
            match n {
                1 => None,
                2 => Some(http("500 Internal Server Error", "{}")),
                _ => Some(http("200 OK", ANSWERED)),
            }
        });
        let (me, created) = seed_verdict(port, Origin::Hand);
        let (t, origin) = model_target_of(port).unwrap();
        assert_eq!((origin, t.pid, t.key.as_deref()), (Origin::Hand, me, None), "an outside model server is named, and is not given this launch's key");
        let ask = || complete_on(port, "system".into(), "CLIENT-MARKER a chunk of the document".into(), None, None);
        let named = |r: &CoreReply| r.model == Origin::Hand && r.pid == me && r.created == created.to_string();

        let lost = ask().expect("a request the model server read and never answered came back as an Err, naming no process");
        let (line, auth, body) = seen.recv_timeout(Duration::from_secs(5)).expect("the stand-in received the request");
        assert!(line.starts_with("POST /v1/chat/completions ") && body.contains("CLIENT-MARKER") && auth.is_empty(), "{line} | auth {auth:?}");
        assert!(named(&lost) && lost.text.is_empty(), "the lost answer names pid {} ({:?}), not this process {me}", lost.pid, lost.model);
        assert!(lost.error.as_deref().is_some_and(|e| e.contains(&format!("sent to process {me}"))), "{:?}", lost.error);

        // CONTROL: an answer the core cannot use, and one it can, name the same process
        let bad = ask().unwrap();
        assert!(named(&bad) && bad.error.as_deref().is_some_and(|e| e.contains("http 500")), "{:?}", bad.error);
        let good = ask().unwrap();
        assert!(named(&good) && good.error.is_none() && good.text == "answered", "{:?}", good.error);
        seen.recv_timeout(Duration::from_secs(5)).and(seen.recv_timeout(Duration::from_secs(5))).unwrap();

        // CONTROL: Hand above is read from the verdict, not assumed. The same process, checked as
        // the model this app started, is named as the app's and alone is sent this launch's key.
        seed_verdict(port, Origin::App);
        let key = model_key().unwrap();
        assert_eq!(model_target_of(port).map(|(t, o)| (o, t.key)), Ok((Origin::App, Some(key.to_string()))));
        let app = ask().unwrap();
        let (_, auth, _) = seen.recv_timeout(Duration::from_secs(5)).expect("the stand-in received the request");
        assert_eq!(auth, format!("Bearer {key}"));
        assert!(app.model == Origin::App && app.pid == me && app.created == created.to_string() && app.error.is_none(), "{:?} {}", app.model, app.pid);

        // CONTROL: a process that may not be sent text is sent nothing, and Err is right there
        verdicts().lock().unwrap().insert(
            (port, me, created),
            Verdict { origin: Origin::Hand, refused: Some("refused for the test".into()), notes: Vec::new(), pid: me, created },
        );
        assert_eq!(ask().err().as_deref(), Some("local model: refused for the test"));
        assert!(seen.recv_timeout(Duration::from_millis(500)).is_err(), "a refused model server was sent the request");
        verdicts().lock().unwrap().remove(&(port, me, created));
    }

    /// The /props verdict and the /slots note are read only from the process model_holder named,
    /// on a connection checked before a byte is written. Here the port answers as this process
    /// and the holder named is another, which is the port changing hands after model_holder read
    /// it. probe_model's own test holds its body; this holds that trusted_model uses it, since an
    /// unchecked /props at the call site cached one process's verdict from another's answer with
    /// every test green (wf4 S3-5).
    #[cfg(windows)]
    #[test]
    fn a_verdict_is_read_only_from_the_process_it_is_about() {
        const PROPS: &str = r#"{"default_generation_settings":{"n_ctx":8192},"total_slots":1,"model_path":"C:\\simpler-legal-test\\no-such-model.gguf"}"#;
        let (port, seen) = model_stand_in(|line| {
            Some(if line.starts_with("GET /props ") { http("200 OK", PROPS) } else { http("404 Not Found", "{}") })
        });
        let image = "C:\\x\\llama-server.exe".to_string();
        let mut other = Command::new("ping").args(["-n", "30", "127.0.0.1"]).stdout(Stdio::null()).spawn().expect("ping.exe");
        let (op, oc) = (other.id(), crate::port_owner::created_of(other.id()));
        let hand = trusted_holder(port, &Holder::Hand { pid: op, created: oc, image: image.clone() });
        let ours = trusted_holder(port, &Holder::Ours { pid: op, created: oc });
        let _ = other.kill();
        let _ = other.wait();
        assert!(matches!(hand, Ok(None)), "a model server started outside this app: {:?}", hand.err());
        assert!(matches!(ours, Ok(None)), "this app's model server: {:?}", ours.err());
        let asked = seen.recv_timeout(Duration::from_millis(500));
        assert!(asked.is_err(), "the listener was asked {asked:?} about another process");
        // CONTROL: named as the process that listens, /props is asked and its answer judged
        let me = std::process::id();
        let created = crate::port_owner::created_of(me);
        let mine = trusted_holder(port, &Holder::Hand { pid: me, created, image: image.clone() });
        assert_eq!(seen.recv_timeout(Duration::from_secs(5)).map(|(l, _, _)| l), Ok("GET /props HTTP/1.0".to_string()));
        assert!(matches!(&mine, Err(e) if e.contains("no-such-model.gguf")), "{:?}", mine.as_ref().err());
        verdicts().lock().unwrap().remove(&(port, me, created));
        // The cache is keyed by process, not by port: the verdict on the process that held the
        // port before (the ping, here as this app's own model) is not the next holder's. Looked up
        // by port alone, this process came back as this app's model, and would have been given
        // the key and its old notes on screen (wf5 S-teeth-5).
        verdicts().lock().unwrap().insert((port, op, oc), Verdict { origin: Origin::App, refused: None, notes: Vec::new(), pid: op, created: oc });
        let next = trusted_holder(port, &Holder::Hand { pid: me, created, image });
        verdicts().lock().unwrap().remove(&(port, op, oc));
        verdicts().lock().unwrap().remove(&(port, me, created));
        assert!(matches!(&next, Err(e) if e.contains("no-such-model.gguf")), "{:?}", next.as_ref().map(|v| v.as_ref().map(|v| (v.pid, v.origin))));
        assert_eq!(seen.recv_timeout(Duration::from_secs(5)).map(|(l, _, _)| l), Ok("GET /props HTTP/1.0".to_string()), "the new holder is asked afresh");
    }

    /// The warning that this app's own model server takes text without this launch's key. It is
    /// said only of the model server this app started (the one given a key), from a completion
    /// request sent without one: 401 means the key is in force, anything else is said. No test
    /// reached this probe before (wf5 S-teeth-4): the one App-origin call named another process
    /// and stopped at /slots.
    #[cfg(windows)]
    #[test]
    fn a_keyless_answer_from_the_apps_model_server_is_said_on_screen() {
        use std::sync::atomic::AtomicBool;
        let keyed = Arc::new(AtomicBool::new(false));
        let k = keyed.clone();
        let (port, seen) = model_stand_in(move |line| {
            Some(if line.starts_with("POST /v1/chat/completions ") {
                if k.load(Ordering::SeqCst) { http("401 Unauthorized", "{}") } else { http("200 OK", ANSWERED) }
            } else {
                http("404 Not Found", "{}")
            })
        });
        let me = std::process::id();
        let created = crate::port_owner::created_of(me);
        let open = model_notes(port, me, created, Origin::App).expect("a verdict");
        assert!(open.len() == 1 && open[0].contains("did not carry this launch's key") && open[0].contains("HTTP 200"), "{open:?}");
        let (slots, _, _) = seen.recv_timeout(Duration::from_secs(5)).unwrap();
        let (post, auth, body) = seen.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(slots.starts_with("GET /slots ") && post.starts_with("POST /v1/chat/completions ") && auth.is_empty() && body == "{}", "{slots} | {post} | {auth:?} | {body}");
        // CONTROL: the same server once it holds the key says nothing
        keyed.store(true, Ordering::SeqCst);
        assert_eq!(model_notes(port, me, created, Origin::App), Some(Vec::new()));
        seen.recv_timeout(Duration::from_secs(5)).and(seen.recv_timeout(Duration::from_secs(5))).unwrap();
        // CONTROL: a model server started outside this app was given no key, and is not asked
        keyed.store(false, Ordering::SeqCst);
        assert_eq!(model_notes(port, me, created, Origin::Hand), Some(Vec::new()));
        assert!(seen.recv_timeout(Duration::from_secs(5)).is_ok_and(|(l, _, _)| l.starts_with("GET /slots ")));
        assert!(seen.recv_timeout(Duration::from_millis(500)).is_err(), "a model server started outside this app was sent the key probe");
    }

    /// The request goes only to the process the verdict names, whoever answers on the port. Every
    /// complete_on case above uses one process as both the listener and the verdict, where a
    /// check that is skipped cannot be told from one that passes; with the per-connection check
    /// replaced by a plain connect, or checked against whoever answers now, all 36 tests passed
    /// and a chunk of the document went to a process the reply did not name (wf5 S-teeth-1).
    #[cfg(windows)]
    #[test]
    fn complete_local_sends_only_to_the_process_the_verdict_names() {
        let (port, seen) = model_stand_in(|_| Some(http("200 OK", ANSWERED)));
        let me = std::process::id();
        let created = crate::port_owner::created_of(me);
        let mut other = Command::new("ping").args(["-n", "30", "127.0.0.1"]).stdout(Stdio::null()).spawn().expect("ping.exe");
        let (op, oc) = (other.id(), crate::port_owner::created_of(other.id()));
        // model_holder names this process (it answers on the port); its verdict is the ping's
        verdicts().lock().unwrap().insert((port, me, created), Verdict { origin: Origin::Hand, refused: None, notes: Vec::new(), pid: op, created: oc });
        let r = complete_on(port, "system".into(), "CLIENT-MARKER".into(), None, None);
        let _ = other.kill();
        let _ = other.wait();
        let got = seen.recv_timeout(Duration::from_millis(500));
        assert!(got.is_err(), "the listener received {got:?} though the verdict named process {op}");
        let e = r.err().expect("a reply came back from a process the verdict did not name");
        assert!(e.contains("Nothing was sent") && e.contains(&format!("answered by process {me}")), "{e}");
        // CONTROL: the verdict naming the process that answers, the request goes and is answered
        verdicts().lock().unwrap().insert((port, me, created), Verdict { origin: Origin::Hand, refused: None, notes: Vec::new(), pid: me, created });
        let ok = complete_on(port, "system".into(), "CLIENT-MARKER".into(), None, None);
        verdicts().lock().unwrap().remove(&(port, me, created));
        let ok = ok.unwrap();
        assert!(ok.pid == me && ok.error.is_none() && ok.text == "answered", "{:?}", ok.error);
        assert!(seen.recv_timeout(Duration::from_secs(5)).unwrap().2.contains("CLIENT-MARKER"));
    }

    /// A 200 with no answer text is an error naming the process, never an empty answer: the core
    /// read "" as a chunk with nothing to redact, and a document came back complete with its
    /// names readable (wf5 S5L-2, S-teeth-2). Every prompt the core sends asks for NONE when
    /// there is nothing, and its classify pass is grammar-bound, so "" is never an answer to it.
    #[cfg(windows)]
    #[test]
    fn an_answer_with_no_text_is_not_read_as_nothing_found() {
        const NO_TEXT: [&str; 6] = [
            r#"{"choices":[{"index":0,"finish_reason":"length","message":{"role":"assistant","content":null,"reasoning_content":"The user wants a list of"}}]}"#,
            r#"{"choices":[{"index":0,"finish_reason":"length","message":{"role":"assistant","content":"","reasoning_content":"The user wants a list of"}}]}"#,
            r#"{"choices":[{"finish_reason":"stop","message":{"content":" \n"}}]}"#,
            "{}",
            r#"{"choices":[]}"#,
            r#"{"error":{"code":500,"message":"boom"}}"#,
        ];
        // Text that stops at the token limit (wf5 S3R-1): a model that wrote its reasoning into
        // content, and an entity list cut at max_tokens. Both were read as the whole answer.
        const CUT: [&str; 2] = [
            r#"{"choices":[{"index":0,"finish_reason":"length","message":{"role":"assistant","content":"<think>\nThe user wants me to extract identifying spans. First, there is"}}]}"#,
            r#"{"choices":[{"index":0,"finish_reason":"length","message":{"role":"assistant","content":"PERSON: Jane Roe\nPERSON: Tob"}}]}"#,
        ];
        // Text the server does not say it finished, under any other word or none (wf6 SL-2): each
        // was read as the whole answer while only "length" was refused.
        const EARLY: [(&str, &str); 5] = [
            (r#"{"choices":[{"finish_reason":"content_filter","message":{"content":"PERSON: Jane Roe\nPERSON: Tob"}}]}"#, r#"finish_reason "content_filter""#),
            (r#"{"choices":[{"finish_reason":"tool_calls","message":{"content":"PERSON: Jane Roe\nPERSON: Tob"}}]}"#, r#"finish_reason "tool_calls""#),
            (r#"{"choices":[{"finish_reason":"Length","message":{"content":"PERSON: Jane Roe\nPERSON: Tob"}}]}"#, r#"finish_reason "Length""#),
            (r#"{"choices":[{"finish_reason":null,"message":{"content":"PERSON: Jane Roe\nPERSON: Tob"}}]}"#, "no finish_reason"),
            (r#"{"choices":[{"message":{"content":"PERSON: Jane Roe\nPERSON: Tob"}}]}"#, "no finish_reason"),
        ];
        const NONE_FOUND: &str = r#"{"choices":[{"finish_reason":"stop","message":{"content":"NONE"}}]}"#;
        let bodies: Vec<&'static str> =
            NO_TEXT.iter().chain(CUT.iter()).copied().chain(EARLY.iter().map(|(b, _)| *b)).chain(["not json", NONE_FOUND, ANSWERED]).collect();
        let mut n = 0;
        let (port, seen) = model_stand_in(move |_| {
            n += 1;
            Some(http("200 OK", bodies[(n - 1).min(bodies.len() - 1)]))
        });
        let (me, created) = seed_verdict(port, Origin::Hand);
        let ask = || complete_on(port, "system".into(), "CLIENT-MARKER".into(), None, None).expect("the request went out");
        let named = |r: &CoreReply| r.model == Origin::Hand && r.pid == me && r.created == created.to_string();
        for (i, body) in NO_TEXT.iter().enumerate() {
            let r = ask();
            let e = r.error.as_deref().unwrap_or("NO ERROR");
            assert!(named(&r) && r.text.is_empty() && e.contains("no answer text") && e.contains(&format!("sent to process {me}")), "{body} -> text {:?}, {e}", r.text);
            if i < 2 {
                assert!(e.contains("finish_reason \"length\""), "{e}");
            }
        }
        for body in CUT {
            let r = ask();
            let e = r.error.as_deref().unwrap_or("NO ERROR");
            assert!(named(&r) && r.text.is_empty() && e.contains("cut off at its token limit") && e.contains(&format!("sent to process {me}")), "{body} -> text {:?}, {e}", r.text);
        }
        for (body, says) in EARLY {
            let r = ask();
            let e = r.error.as_deref().unwrap_or("NO ERROR");
            assert!(named(&r) && r.text.is_empty() && e.contains("did not say it was finished") && e.contains(says) && e.contains(&format!("sent to process {me}")), "{body} -> text {:?}, {e}", r.text);
        }
        let garbled = ask();
        assert!(named(&garbled) && garbled.error.as_deref().is_some_and(|e| e.contains("local model json")), "{:?}", garbled.error);
        // CONTROL: the core's own word for nothing found, and a real answer, are answers
        let none = ask();
        assert!(named(&none) && none.error.is_none() && none.text == "NONE", "{:?}", none.error);
        let good = ask();
        assert!(named(&good) && good.error.is_none() && good.text == "answered", "{:?}", good.error);
        verdicts().lock().unwrap().remove(&(port, me, created));
        assert_eq!(std::iter::from_fn(|| seen.recv_timeout(Duration::from_millis(500)).ok()).count(), NO_TEXT.len() + CUT.len() + EARLY.len() + 3, "every request reached the stand-in");
    }

    /// A Conn to a stand-in that reads what it is sent and hangs up without answering: with
    /// `send`, a /strip request whose body went out whole; without, nothing written at all.
    #[cfg(windows)]
    fn conn_after(send: bool) -> Conn {
        use std::io::Read;
        let l = crate::port_owner::scratch_listener();
        let port = l.local_addr().unwrap().port();
        let t = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let _ = s.set_read_timeout(Some(Duration::from_millis(if send { 5000 } else { 300 })));
            let mut b = [0u8; 4096];
            let _ = s.read(&mut b);
        });
        let mut c = service_auth::connect(port).unwrap().expect("the stand-in");
        if send {
            let r = c.post_lines("/strip", "B", r#"{"text":"CLIENT-MARKER"}"#, Duration::from_secs(5), Duration::from_secs(60), |_| Ok(()));
            assert!(r.is_err(), "the stand-in answers nothing");
        }
        t.join().unwrap();
        c
    }

    /// A run that failed or was stopped after the document went out says so (`reached`) and
    /// names who started the service and its model, read off the connection the document went
    /// out on. Each of three reverts of this rule (the error built from the message alone,
    /// `reached` taken as false, the connection's flag set only once the body was all written)
    /// passed the whole suite while the rule sat inline in strip_proxy (wf5 S3R-4). The receipt
    /// then said "not reachable for this document" of a service that had read all of it.
    #[cfg(windows)]
    #[test]
    fn a_run_that_fails_after_the_document_went_out_says_so_and_names_who_read_it() {
        let sent = conn_after(true);
        let e = after_run(Err("lq stage exited 1".into()), None, &sent, Origin::Hand, Origin::App).err().expect("a failed stream is an error");
        assert!(e.reached && e.incident.is_none() && e.message == "lq stage exited 1", "{}", e.message);
        assert!(e.service == Some(Origin::Hand) && e.model == Some(Origin::App), "who started the service and its model is named");
        assert!(!e.left_on_disk, "a failed stream claims nothing about the disk here: the service's own line says it");
        let stop = |left_on_disk| Some(Stopped { words: "the words".into(), why: "the reason".into(), left_on_disk, cut_off: false });
        let e = after_run(Ok(4), stop(false), &sent, Origin::App, Origin::Hand)
            .err()
            .expect("a result line that arrived before a stop does not survive it");
        assert!(e.reached && e.incident.as_deref() == Some("the reason") && e.message == "the words", "{}", e.message);
        assert!(e.service == Some(Origin::App) && e.model == Some(Origin::Hand) && !e.left_on_disk);
        // A stop whose sweep left the tree says so, under the name lib/tauri.ts reads (wf6 SL-4);
        // the stop above, whose sweep did not, is its CONTROL.
        let e = after_run(Err("legal service: the connection was closed".into()), stop(true), &sent, Origin::App, Origin::App).err().expect("a stop");
        let wire = serde_json::to_value(&e).unwrap();
        assert!(e.left_on_disk && wire["leftOnDisk"] == true && wire["incident"] == "the reason", "{wire}");
        // A stop for an answer that was not whole reaches lib/tauri.ts marked so (ruling 15); the
        // stops above, which were not, are its CONTROL on the same wire field. Dropping it here
        // passed every test (wf7 S-teeth-7-3, mutant EX1), and the rail would have said the model
        // port changed.
        assert!(wire["cutOff"] == false, "{wire}");
        let cut = Some(Stopped { words: "the words".into(), why: "the reason".into(), left_on_disk: false, cut_off: true });
        let e = after_run(Ok(4), cut, &sent, Origin::App, Origin::App).err().expect("a stop");
        assert!(e.cut_off && serde_json::to_value(&e).unwrap()["cutOff"] == true, "a cut answer's stop lost its mark on the way out");
        // CONTROL: a stream that ended with its result is the run, and names the two apart: the
        // same origin for both let a swap of them pass the suite (wf6 S-teeth-2)
        let ok = after_run(Ok(4), None, &sent, Origin::App, Origin::Hand).ok().expect("a clean run");
        assert!(ok.service == Origin::App && ok.model == Origin::Hand);
        let ok = after_run(Ok(4), None, &sent, Origin::Hand, Origin::App).ok().expect("a clean run");
        assert!(ok.service == Origin::Hand && ok.model == Origin::App);
        // CONTROL: a connection that carried nothing is not reached, whoever was proven on it,
        // so the pass above is about the connection and not a flag that is always set
        let idle = conn_after(false);
        let e = after_run(Err("legal service: it closed the connection".into()), None, &idle, Origin::Hand, Origin::App).err().expect("an error");
        assert!(!e.reached && e.service == Some(Origin::Hand), "a connection that carried no body is not reached");
    }

    /// The sweep after a stop says whether this run's tree survived it: a handle held past its
    /// retries (an antivirus scan of the just-written doc.txt) left the unredacted document and
    /// its key on disk with only an eprintln to say so (wf6 SL-4). Another port's tree is not
    /// its to take, and is not counted.
    #[cfg(windows)]
    #[test]
    fn a_tree_the_sweep_could_not_remove_is_reported() {
        use std::os::windows::fs::OpenOptionsExt;
        let base = std::env::temp_dir().join(format!("simpler-legal-sweep-test-{}-{}", std::process::id(), line!()));
        let _ = std::fs::remove_dir_all(&base);
        let (mine, other) = (base.join("p1436-run-1"), base.join("p14371-run-1"));
        for d in [&mine, &other] {
            std::fs::create_dir_all(d).unwrap();
            std::fs::write(d.join("doc.txt"), "CLIENT-MARKER").unwrap();
        }
        let log = base.with_extension("log");
        let _ = std::fs::remove_file(&log);
        let held = std::fs::OpenOptions::new().read(true).share_mode(0).open(mine.join("doc.txt")).unwrap();
        let left = sweep_trees_in(&base, 1436, Some(&log));
        let still = mine.join("doc.txt").exists();
        let logged = std::fs::read_to_string(&log).unwrap_or_default();
        drop(held);
        // CONTROL: the handle gone, the same sweep removes the tree, says nothing was left and
        // writes nothing
        let after = sweep_trees_in(&base, 1436, Some(&log));
        let logged_after = std::fs::read_to_string(&log).unwrap_or_default();
        let gone = !mine.exists();
        let others = other.exists();
        let absent = sweep_trees_in(&base.join("no-such-folder"), 1436, Some(&log));
        let _ = std::fs::remove_dir_all(&base);
        let _ = std::fs::remove_file(&log);
        assert!(still && left, "a tree held open survived the sweep (on disk {still}) and the sweep said {left}");
        assert!(gone && !after, "released, the tree is removed ({gone}) and nothing is reported left ({after})");
        assert!(others, "another port's tree is not this sweep's to remove");
        assert!(!absent, "CONTROL: no folder at all is no tree left");
        // The receipt sends the lawyer to legal-serve.log for the folder (engineStatus.ts
        // LEFT_ON_DISK); a line only on stderr named it to no one in a build without a console
        // (SEAM-ENGINE-CONSOLE). Redaction may rewrite the profile part of the path, so the
        // run's own folder name is what is looked for.
        assert!(
            logged.contains("COULD NOT REMOVE") && logged.contains("p1436-run-1") && !logged.contains("p14371"),
            "the tree left is named in the log: {logged:?}"
        );
        assert_eq!(logged_after, logged, "CONTROL: a sweep that removed everything adds no line");
        // The log the receipt sends a lawyer to carries no profile path or account name: a
        // sweep line written unredacted passed every test (wf7 S-teeth-7-6, mutant EX2). The
        // CONTROL is the folder itself, whose path does carry the profile, so the pass is the
        // redaction's and not a path that never had it.
        let profile = std::env::var("USERPROFILE").unwrap_or_default().to_ascii_lowercase();
        assert!(profile.len() > 3 && base.to_string_lossy().to_ascii_lowercase().starts_with(&profile), "CONTROL: the test folder sits under the profile: {base:?}");
        assert!(!logged.to_ascii_lowercase().contains(&profile), "the sweep's log line names the profile folder: {logged:?}");
    }

    /// A folder the sweep cannot list is reported as a tree left, and named in the log: a sweep
    /// that read "cannot list" as "nothing there" passed every test (wf6 S3-3, mutant MA5) and
    /// would tell the lawyer the working copy was removed without having looked.
    #[cfg(windows)]
    #[test]
    fn a_folder_the_sweep_cannot_list_counts_as_a_tree_left() {
        let base = std::env::temp_dir().join(format!("simpler-legal-sweep-test-{}-{}", std::process::id(), line!()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        // a file where the folder should be: read_dir fails, and not with NotFound
        let not_a_folder = base.join("_serve");
        std::fs::write(&not_a_folder, "x").unwrap();
        let log = base.join("legal-serve.log");
        let left = sweep_trees_in(&not_a_folder, 1436, Some(&log));
        let logged = std::fs::read_to_string(&log).unwrap_or_default();
        // CONTROL: the same path as an empty folder is nothing left, and nothing logged
        std::fs::remove_file(&not_a_folder).unwrap();
        std::fs::create_dir(&not_a_folder).unwrap();
        let _ = std::fs::remove_file(&log);
        let empty = sweep_trees_in(&not_a_folder, 1436, Some(&log));
        let logged_empty = std::fs::read_to_string(&log).unwrap_or_default();
        let _ = std::fs::remove_dir_all(&base);
        assert!(left, "a folder that cannot be listed may hold a tree, and is reported as one");
        assert!(logged.contains("COULD NOT LIST") && logged.contains("_serve"), "and is named in the log: {logged:?}");
        assert!(!empty && logged_empty.is_empty(), "CONTROL: an empty folder is nothing left ({empty}) and logs nothing ({logged_empty:?})");
    }

    /// The folder both sweeps look in is the one serve-legal.mjs writes its run trees to. A sweep
    /// pointed elsewhere passed every test (wf6 S3-3, mutant MA3) and would say "nothing left"
    /// over a folder it never opened. The service's own line is read from the file, so a move
    /// on either side fails here.
    #[cfg(windows)]
    #[test]
    fn the_sweeps_look_where_the_service_writes() {
        let root = Path::new("R");
        assert_eq!(serve_dir(root), root.join("raw").join("stripped").join("_serve"));
        let serve = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("serve-legal.mjs");
        let src = std::fs::read_to_string(&serve).expect("serve-legal.mjs beside the app");
        assert!(
            src.contains("const SERVE = join(ROOT, 'raw', 'stripped', '_serve')"),
            "serve-legal.mjs no longer writes its run trees to raw/stripped/_serve: move serve_dir with it"
        );
    }

    /// strip_proxy's stop record (stopped_run): the sweep runs for a service this app started
    /// and its report is kept; a hand-started service is never swept (it is still running and
    /// owns its tree). An answer cut off is told apart from a model change by the relay's own
    /// prefix, and gets words that do not send the lawyer to IT about a port. Each half passed
    /// the whole suite as a mutant while this sat inline in strip_proxy (wf6 S3-3, MA1 and MA2).
    #[cfg(windows)]
    #[test]
    fn a_stopped_run_keeps_the_sweeps_report_and_sweeps_only_what_the_app_started() {
        use std::cell::Cell;
        let swept = Cell::new(0);
        let sweep = |left: bool| {
            let s = &swept;
            move || {
                s.set(s.get() + 1);
                left
            }
        };
        let model_change = "the model server on port 49400 changed (process 1 exited)".to_string();
        let s = stopped_run(model_change.clone(), Origin::App, sweep(true));
        assert!(s.left_on_disk && swept.get() == 1, "an app-started service is swept and a tree left is kept");
        // CONTROL: the same origin whose sweep removed everything is not reported left
        let s = stopped_run(model_change.clone(), Origin::App, sweep(false));
        assert!(!s.left_on_disk && swept.get() == 2);
        let s = stopped_run(model_change.clone(), Origin::Hand, sweep(true));
        assert!(!s.left_on_disk && swept.get() == 2, "a hand-started service's tree is never swept (sweeps {})", swept.get());
        assert!(!s.cut_off && s.words.contains("checks every connection") && s.why == model_change, "{}", s.words);
        let cut = format!("{} — it was cut off at the model's token limit (finish_reason \"length\") on a call allowed 400 tokens", crate::relay::CUT_OFF);
        let s = stopped_run(cut.clone(), Origin::App, sweep(false));
        assert!(s.cut_off && s.why == cut, "the relay's CUT_OFF prefix marks the stop as a cut answer");
        assert!(
            s.words.contains("untagged") && !s.words.contains("IT team") && !s.words.contains("took the port"),
            "a cut answer is not a port incident: {}",
            s.words
        );
        // A cut can be found at the run's end, after the pipeline read the whole document
        // (relay.rs RunGuard::finish), so the words say the result was not used and never that
        // the run stopped partway, which legal-serve.log would contradict (wf8 S7A-1); and a call
        // given up on at 45 s is a completed one in the model's log, so they say how long (S7A-2).
        assert!(s.words.starts_with(&format!("The frozen pipeline's result for a document was not used: {cut}.")) && !s.words.contains("partway"), "{}", s.words);
        assert!(s.words.contains("how long each took: the pipeline gives up on a call after 45 seconds"), "{}", s.words);
        // CONTROL: a change of model server is found while the run is going, and keeps its words
        let changed = stopped_run(model_change.clone(), Origin::Hand, sweep(false));
        assert!(changed.words.starts_with(&format!("The frozen pipeline was stopped partway through a document: {model_change}.")), "{}", changed.words);
        let wire = serde_json::to_value(StripError {
            message: s.words,
            incident: Some(s.why),
            reached: true,
            service: Some(Origin::App),
            model: Some(Origin::App),
            left_on_disk: s.left_on_disk,
            cut_off: s.cut_off,
        })
        .unwrap();
        assert!(wire["cutOff"] == true, "lib/tauri.ts reads the cut under this name: {wire}");
    }

    /// A document's /strip names its own run's port on the relay as the model, never the shared
    /// one: on the shared port every call counts toward every run active, and one document's
    /// open call would hold another's finish (owner ruling 20, wf8 S7T-6).
    #[cfg(windows)]
    #[test]
    fn a_documents_strip_sends_its_own_runs_port_as_the_model() {
        struct Nobody;
        impl crate::relay::Policy for Nobody {
            fn admit(&self, pid: u32) -> Result<(), String> {
                Err(format!("process {pid} is not admitted in this test"))
            }
            fn target(&self) -> Result<crate::relay::Target, String> {
                Err("no model in this test".into())
            }
        }
        let relay = crate::relay::Relay::start(Nobody).unwrap();
        let pin = crate::relay::Target { port: 1, pid: 1, created: 1, key: None };
        let guard = relay.begin_run(pin, None, |_| {}).unwrap();
        let body = |profile: Option<&str>| serde_json::from_str::<serde_json::Value>(&strip_body("Jane Roe met Tobias Grant.", profile, &guard)).unwrap();
        let v = body(Some("deal-room"));
        assert!(guard.port() != 0 && guard.port() != relay.port(), "the run has no port of its own: {} (shared {})", guard.port(), relay.port());
        assert_eq!(v["llamaPort"], guard.port(), "{v}");
        assert_eq!((v["text"].as_str(), v["profile"].as_str()), (Some("Jane Roe met Tobias Grant."), Some("deal-room")), "{v}");
        // CONTROL: the default doctrine is never sent as a profile
        for p in [None, Some(""), Some("auto")] {
            let v = body(p);
            assert!(v.get("profile").is_none() && v["llamaPort"] == guard.port(), "{p:?}: {v}");
        }
    }

    /// A model server that keeps sending and never finishes an answer is given up on, and the
    /// reply still names it. Each byte reset the per-read timeout, so a server that trickled one
    /// held the call, and the document, open for as long as it liked (wf5 S5L-3).
    #[cfg(windows)]
    #[test]
    fn an_answer_that_never_finishes_is_given_up_on_and_names_the_process() {
        let l = crate::port_owner::scratch_listener();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let mut asked = 0;
            for c in l.incoming() {
                let Ok(mut c) = c else { break };
                if read_model_request(&c).is_none() {
                    continue;
                }
                asked += 1;
                // 1: a body with a length, never reaching it. 2: a body ended by the connection
                // closing, whose bytes are already a whole "NONE" answer and then trickle
                // whitespace. When this app's own hang-up is what closes it, the body only LOOKS
                // whole; read as the answer, it is "nothing found" from a server that never
                // finished (measured: with the deadline read only on a failure, the suite passed
                // with case 1 alone; case 2 fails it).
                if asked <= 2 {
                    let head: &[u8] = if asked == 1 {
                        b"HTTP/1.1 200 OK\r\nContent-Length: 1000\r\n\r\n{"
                    } else {
                        b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"content\":\"NONE\"}}]}"
                    };
                    let _ = c.write_all(head);
                    while c.write_all(b" ").is_ok() {
                        std::thread::sleep(Duration::from_millis(200));
                    }
                } else {
                    let _ = c.write_all(http("200 OK", ANSWERED).as_bytes());
                    break;
                }
            }
        });
        let (me, created) = seed_verdict(port, Origin::Hand);
        for which in ["a body short of its length", "a close-delimited body cut by the hang-up"] {
            let (tx, rx) = std::sync::mpsc::channel();
            let t0 = Instant::now();
            std::thread::spawn(move || {
                let _ = tx.send(complete_within(port, "system".into(), "CLIENT-MARKER".into(), None, None, Duration::from_secs(2)));
            });
            let r = rx.recv_timeout(Duration::from_secs(15)).expect("a trickling answer held the call past its bound").expect("the request went out");
            assert!(t0.elapsed() < Duration::from_secs(10), "{which}: {:?}", t0.elapsed());
            let e = r.error.as_deref().unwrap_or("NO ERROR");
            assert!(r.pid == me && r.model == Origin::Hand && e.contains("no whole answer within 2 s") && e.contains(&format!("sent to process {me}")), "{which}: {e} (text {:?})", r.text);
        }
        // CONTROL: an answer inside the bound is read, and the bound does not cut it
        let ok = complete_within(port, "system".into(), "CLIENT-MARKER".into(), None, None, Duration::from_secs(2));
        verdicts().lock().unwrap().remove(&(port, me, created));
        let ok = ok.unwrap();
        assert!(ok.error.is_none() && ok.text == "answered", "{:?}", ok.error);
    }

    /// Which same-account process an unjobbed launcher started: its own child, created after it,
    /// while it runs. The parent clause had no test (wf5 S-teeth-6): without it, a process that is
    /// not the launcher's child but was created after it is taken for this app's model.
    #[cfg(windows)]
    #[test]
    fn only_the_launchers_own_child_is_this_apps_model() {
        use crate::port_owner::created_of;
        let me = std::process::id();
        let spawn = || Command::new("ping").args(["-n", "30", "127.0.0.1"]).stdout(Stdio::null()).spawn().expect("ping.exe");
        let (mut a, mut b) = (spawn(), spawn());
        let (ap, ac, bp, bc) = (a.id(), created_of(a.id()), b.id(), created_of(b.id()));
        let child = launched_by(Some((me, created_of(me))), bp, bc);
        // CONTROL: b was created after a and is a live process of your account, but a did not start it
        let not_its = launched_by(Some((ap, ac)), bp, bc);
        let stale = launched_by(Some((me, created_of(me) + 1)), bp, bc);
        let none = launched_by(None, bp, bc);
        for c in [&mut a, &mut b] {
            let _ = c.kill();
            let _ = c.wait();
        }
        assert!(ac != 0 && bc >= ac, "the two pings were read ({ac}, {bc})");
        assert!(child, "a child of the launcher, created after it, is the launcher's");
        assert!(!not_its, "a process the launcher did not start was taken for its child");
        assert!(!stale && !none, "a launcher that is not the process recorded, or none at all, starts nothing");
    }

    /// Which listener is the model server: the one that accepts a connection to 127.0.0.1, in
    /// either order of the two processes. The listener table lists both, sorted by pid, and the
    /// old choice (the last same-account listener) was right in one order only (wf4 S-local-2).
    #[cfg(windows)]
    #[test]
    fn the_holder_is_the_process_that_answers_on_127_0_0_1() {
        use crate::port_owner::{child_listener, scratch_port};
        let me = std::process::id();
        let holder = |port: u16| match model_holder(port) {
            Ok(Some(Holder::Hand { pid, .. })) => Ok(pid),
            Ok(Some(Holder::Ours { pid, .. })) => Err(format!("Ours {pid}")),
            Ok(None) => Err("None".into()),
            Err(e) => Err(e),
        };
        // this process on 127.0.0.1, a child on [::1]
        let a = scratch_port();
        let _v4 = std::net::TcpListener::bind(("127.0.0.1", a)).unwrap();
        let mut beside = child_listener("::1", a);
        let (listed_a, got_a) = (crate::port_owner::listeners(a).unwrap(), holder(a));
        let _ = beside.kill();
        let _ = beside.wait();
        // a child on 127.0.0.1, this process on [::1]
        let b = scratch_port();
        let mut answering = child_listener("127.0.0.1", b);
        let _v6 = std::net::TcpListener::bind(("::1", b)).unwrap();
        let (listed_b, got_b, child_b) = (crate::port_owner::listeners(b).unwrap(), holder(b), answering.id());
        let _ = answering.kill();
        let _ = answering.wait();
        assert_eq!(listed_a.len(), 2, "CONTROL: both listeners are in the table ({listed_a:?})");
        assert_eq!(got_a, Ok(me), "127.0.0.1 is this process's; the [::1] child was chosen");
        assert_eq!(listed_b.len(), 2, "CONTROL: both listeners are in the table ({listed_b:?})");
        assert_eq!(got_b, Ok(child_b), "127.0.0.1 is the child's; this process on [::1] was chosen");
        // and a port where only [::1] listens has no model server for this app to use
        assert!(matches!(model_holder(b), Ok(None)), "only [::1] holds the port now");
    }
}
