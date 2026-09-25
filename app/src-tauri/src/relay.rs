//! relay.rs — the only road from the frozen chain to the model server, and the check that makes
//! it safe: no byte of a document is written on a connection until the kernel says the far end
//! of THAT connection is the model process the app checked (F3-R1, 2026-09-23).
//!
//! Why a relay. The frozen chain (strip-batch, apply-v2/ln/lq, through lib-legal/sweeps.mjs)
//! dials the model port itself with Node's fetch, and it may not be edited (FREEZE.md). The app
//! used to check who LISTENED on the port and then let the chain dial it. A reading of the
//! listener table is true only when it is taken: a process that binds the port beside the
//! holder, or takes it the moment the holder exits, is handed the next connection and the chunk
//! of the document on it. The guard before this one (model_watch.rs reading the table every
//! 20 ms) shortened that window and could not close it. Now the chain is pointed at this relay
//! (the adapter's --llama, SIMPLER_LLAMA_PORT, and the per-run `llamaPort` of /strip), and for
//! every connection the chain makes:
//!   1. admission: the kernel's CONNECTION table names the process at the client end. It must
//!      be the engine service this app started or a stage it ran (engine.rs's Policy), or, during
//!      a run on a hand-started service, that service or a direct child of it created after it.
//!      Anyone else (another account, a web page in a browser) is refused and nothing is sent;
//!   2. the relay asks engine.rs which model process passes the check NOW. During a run it must
//!      be the process the run started against; if it is not, the run is stopped (tripped) and
//!      the connection refused, so the chain's result is never accepted as the frozen output;
//!   3. the relay opens its OWN connection to the model port and looks up, for that exact
//!      4-tuple, who owns the server end. Only if it is the checked process, by pid and creation
//!      time, is anything written on it. A TCP connection cannot change hands, so the answer
//!      holds for every byte the connection carries: a squatter gets a connection with nothing
//!      on it, and the run stops;
//!   4. requests are forwarded one at a time and only GET /health and POST /v1/chat/completions,
//!      the two the frozen chain makes (grep of lib-legal, lib-core and the four stages), with
//!      Host rewritten, any Authorization the client sent removed, and the per-launch model key
//!      added when the model is the one this app started (engine.rs gives it LLAMA_API_KEY). So
//!      the key is held by this process alone: not by the chain, not by a web page.
//! complete_local uses step 3 directly (connect_verified), and so do engine.rs's probes of the
//! model (/props, /slots, the key check), after `answering` has named the process that accepts a
//! connection to 127.0.0.1 on that port.
//!
//! The relay's ports (its shared one and each run's own) are the chain's road to the model, so a
//! second socket on one would be the squatter this file exists to stop, moved one hop. Each is
//! bound with SO_EXCLUSIVEADDRUSE, the
//! documented guarantee. Measured 2026-09-23 on Windows 11 26200, every pairing: a second bind on
//! 127.0.0.1 and the same port is refused whether the first socket set nothing (WSAEADDRINUSE;
//! WSAEACCES with SO_REUSEADDR) or SO_EXCLUSIVEADDRUSE; it succeeds only beside a first socket
//! that itself set SO_REUSEADDR. A listener on 0.0.0.0 and the same port binds beside any of them;
//! TCP hands a connection to 127.0.0.1 to the listener bound to that exact address, which is the
//! documented rule and was not measured here (a test binding 0.0.0.0 can raise a firewall prompt).
//!
//! The model is checked per CONNECTION, not per request. A request on a connection already
//! verified can only reach the process verified, whatever happens to the port meanwhile, and a
//! model that exits in the middle of a run is seen at once by model_watch.rs. The relay reads
//! what it forwards to find where one request or answer ends, and for one thing more (below); it
//! keeps and logs none of it.
//!
//! An answer cut off is never read as a whole one (owner ruling 15, 2026-09-24). The chain reads
//! `choices[0].message.content` and never looks at finish_reason (strip-batch.mjs complete,
//! lib-legal/sweeps.mjs makeComplete, both frozen), so an extraction answer cut at its token
//! limit ("PERSON: Jane Roe\nPERSON: Tob") or spent on reasoning (content "", measured in
//! OPS_LEDGER.md 2026-07-23) was read as all there was, and every name after the cut went
//! untagged under a run that reported complete. So each non-streamed chat-completions answer to
//! a call allowed WHOLE_FROM tokens or more (the extraction and residue calls; no limit set counts
//! as more) is read whole before a byte of it is forwarded, and one that does not end on
//! finish_reason "stop" with text in it trips the run as a model change does: the frozen result is
//! refused and the in-app core, which refuses the same answers (engine.rs complete_within), reads
//! the document.
//!
//! A call that gets no answer at all is the same loss. Only the substrate (strip-batch) throws on
//! a failed call. Every sweep after it catches the failure, counts it and goes on (sweeps.mjs,
//! sweeps2.mjs: `catch { stats.failed++; continue }`), and apply-v2 and apply-lq write the
//! document before they look at the count and then stop only if /health fails as well. So an
//! HTTP error, an answer that broke off, a connection closed with a call unanswered, or the
//! chain's own 45 s abort left the document without that call's findings under a run that
//! reported complete. Measured on the real stages against a stand-in model (wf7 S6-F1, S6-F2,
//! S-teeth-7-1): a name only the residue sweep found, a given name a court missed (a 4-token
//! probe) and a health condition (the LQ sweep) each came back readable. So any of those, on any
//! chat-completions call, trips the run. The 4-token YES/NO probes and 6-token classify and
//! router calls are otherwise forwarded as they arrive, finish_reason unread, until a live run
//! measures how often they end on "length". GET /health is forwarded as it comes, whatever its
//! status: a 503 while the model loads is normal, and a stage that cannot read it stops itself.
//!
//! A document's result is read only when none of its calls is still open (owner ruling 20). Each
//! run has a port of its own, given to the chain as that run's llamaPort, so every call is known
//! to be one run's; the run counts its calls from the moment one's head arrives until it is
//! passed on whole or its cut is recorded, and RunGuard::finish waits for that count, bounded,
//! before it reads the verdict. A cut trips the run its call belongs to and no other.
//!
//! Windows only, like port_owner.rs.

#![cfg(target_os = "windows")]

use crate::port_owner::{conn_owner, created_of, parent_of};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex, MutexGuard};
use std::time::Duration;

/// Every trip for an answer that was not a whole one starts with these words, so engine.rs can
/// tell it from a model change (incident_words) and lib/tauri.ts can put it on the receipt.
pub const CUT_OFF: &str = "the model's answer to one of the frozen pipeline's calls was not a whole one";

/// A model process that passed engine.rs's check. A pid can be reused; a (pid, creation time)
/// pair names one process.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
    pub port: u16,
    pub pid: u32,
    pub created: u64,
    /// The per-launch key, for the model this app started only; a hand-started model was not
    /// given it and is not sent it.
    pub key: Option<String>,
}

impl Target {
    pub fn same_process(&self, o: &Target) -> bool {
        self.port == o.port && self.pid == o.pid && self.created == o.created
    }
}

/// What engine.rs decides for the relay. Both answers are in words, so a refusal can say why.
pub trait Policy: Send + Sync + 'static {
    /// May process `pid` send text to the model through the relay?
    fn admit(&self, pid: u32) -> Result<(), String>;
    /// The model process that passes the check now.
    fn target(&self) -> Result<Target, String>;
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    // a panic on another relay thread must not stop the check on this one
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// The owner of the socket at `local` connected to `remote`. The row of a connection just made
/// can lag connect() by a moment, so a missing row is asked for again, briefly.
fn owner_of(local: SocketAddr, remote: SocketAddr) -> Result<Option<u32>, String> {
    for i in 0..5 {
        if let Some(p) = conn_owner(local, remote)? {
            return Ok(Some(p));
        }
        if i < 4 {
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    Ok(None)
}

/// Connect to the model port and return the socket only if the kernel names the checked process
/// as the owner of its server end. On Err nothing has been written and the socket is closed.
pub fn connect_verified(t: &Target, timeout: Duration) -> Result<TcpStream, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], t.port));
    let s = TcpStream::connect_timeout(&addr, timeout)
        .map_err(|e| format!("nothing accepted a connection on 127.0.0.1:{} ({e})", t.port))?;
    let (local, peer) = match (s.local_addr(), s.peer_addr()) {
        (Ok(l), Ok(p)) => (l, p),
        _ => return Err(format!("the connection to 127.0.0.1:{} closed before it could be checked", t.port)),
    };
    // the server end: its local address is our peer, its remote is our local
    match far_end_refusal(owner_of(peer, local), t, created_of) {
        None => Ok(s),
        Some(why) => {
            let _ = s.shutdown(Shutdown::Both);
            Err(why)
        }
    }
}

/// connect_verified's decision, apart from the socket, so every arm is tested with the answer
/// it is about. Only the first arm lets text go. The last two are reached only at the edge (the
/// kernel's table has no row for the 4-tuple, or it could not be read), and until 2026-09-23
/// either could be turned into an acceptance with every test green (wf5 S-teeth-3): text would
/// then be written on a connection whose receiving process nobody knows.
fn far_end_refusal(owner: Result<Option<u32>, String>, t: &Target, created_of: impl Fn(u32) -> u64) -> Option<String> {
    match owner {
        Ok(Some(p)) if p == t.pid && created_of(p) == t.created => None,
        Ok(Some(p)) if p == t.pid => Some(format!(
            "the model server that was checked (pid {}) has exited and its pid now names another process",
            t.pid
        )),
        Ok(Some(p)) => Some(format!(
            "the connection to port {} was answered by process {p}, not by the model server that was checked (pid {})",
            t.port, t.pid
        )),
        Ok(None) => Some(format!("the kernel names no process at the far end of the connection to port {}", t.port)),
        Err(e) => Some(format!("the far end of the connection to port {} could not be looked up ({e})", t.port)),
    }
}

/// The process that accepts a connection to 127.0.0.1:`port` now, by the kernel's owner of the
/// server end of one connection made to ask. That is the process every road to the model
/// reaches, since connect_verified dials the same address; a listener beside it on [::1] or on
/// another address is handed none of those connections. Ok(None): nothing accepts there.
/// Nothing is written on the connection.
///
/// A refusal takes about 2 s to arrive (measured 2026-09-23, Windows 11 26200: std's connect to
/// a loopback port nobody listens on returned WSAECONNREFUSED after 2,034 ms, because Windows
/// sends the SYN again after each reset), so `timeout` must be longer than that, or a port
/// nobody accepts on reads as a timeout, which is an error here.
pub fn answering(port: u16, timeout: Duration) -> Result<Option<u32>, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let s = match TcpStream::connect_timeout(&addr, timeout) {
        Ok(s) => s,
        Err(e) if e.kind() == io::ErrorKind::ConnectionRefused => return Ok(None),
        Err(e) => return Err(format!("a connection to 127.0.0.1:{port} failed ({e})")),
    };
    let who = match (s.local_addr(), s.peer_addr()) {
        (Ok(local), Ok(peer)) => owner_of(peer, local),
        _ => Err(format!("the connection to 127.0.0.1:{port} closed before it could be looked up")),
    };
    let _ = s.shutdown(Shutdown::Both);
    match who? {
        Some(pid) => Ok(Some(pid)),
        None => Err(format!("the kernel names no process at the far end of a connection to 127.0.0.1:{port}")),
    }
}

/// A listener on 127.0.0.1:`port` (0: the system chooses) that no other socket may share.
pub fn exclusive_listener(port: u16) -> io::Result<TcpListener> {
    raw_listener([127, 0, 0, 1], port, Some(windows::Win32::Networking::WinSock::SO_EXCLUSIVEADDRUSE))
}

/// std's TcpListener::bind cannot set an option before bind, and SO_EXCLUSIVEADDRUSE only works
/// set before it, so the socket is made here and handed to std once bound. Not inheritable: a
/// child spawned later must not hold the relay's listening socket.
fn raw_listener(ip: [u8; 4], port: u16, option: Option<i32>) -> io::Result<TcpListener> {
    use std::os::windows::io::FromRawSocket;
    use windows::Win32::Networking::WinSock::{
        bind, listen, setsockopt, WSASocketW, WSAStartup, AF_INET, IPPROTO_TCP, SOCKADDR, SOCKADDR_IN, SOCK_STREAM,
        SOL_SOCKET, WSADATA, WSA_FLAG_NO_HANDLE_INHERIT, WSA_FLAG_OVERLAPPED,
    };
    // SAFETY: WSAStartup is reference-counted and std has usually called it already; the socket
    // is owned by `l` from the line it is made, so every early return below closes it; the
    // address is a correctly sized SOCKADDR_IN.
    unsafe {
        let mut data = WSADATA::default();
        let _ = WSAStartup(0x202, &mut data);
        let s = WSASocketW(
            AF_INET.0 as i32,
            SOCK_STREAM.0,
            IPPROTO_TCP.0,
            None,
            0,
            WSA_FLAG_OVERLAPPED | WSA_FLAG_NO_HANDLE_INHERIT,
        )
        .map_err(io::Error::other)?;
        let l = TcpListener::from_raw_socket(s.0 as u64);
        if let Some(option) = option {
            if setsockopt(s, SOL_SOCKET, option, Some(&1i32.to_ne_bytes())) != 0 {
                return Err(io::Error::last_os_error());
            }
        }
        let mut a = SOCKADDR_IN::default();
        a.sin_family = AF_INET;
        a.sin_port = port.to_be();
        a.sin_addr.S_un.S_addr = u32::from_ne_bytes(ip);
        if bind(s, &a as *const SOCKADDR_IN as *const SOCKADDR, std::mem::size_of::<SOCKADDR_IN>() as i32) != 0 {
            return Err(io::Error::last_os_error());
        }
        if listen(s, 128) != 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(l)
    }
}

type OnTrip = Box<dyn FnOnce(&str) + Send>;

/// One document's run of the frozen chain.
struct Run {
    tripped: Mutex<Option<String>>,
    on_trip: Mutex<Option<OnTrip>>,
    /// A hand-started service's (pid, creation time): it and its direct children are admitted
    /// while this run lasts.
    tree: Option<(u32, u64)>,
    /// This run's calls to the model that have been sent and not yet settled: passed on whole,
    /// or cut and the cut recorded. RunGuard::finish reads the verdict only once this is 0.
    open: Mutex<usize>,
    settled: Condvar,
    /// The run is over: its own port (begin_run) takes no more connections.
    over: AtomicBool,
}

impl Run {
    fn new(tree: Option<(u32, u64)>, on_trip: OnTrip) -> Run {
        Run { tripped: Mutex::new(None), on_trip: Mutex::new(Some(on_trip)), tree, open: Mutex::new(0), settled: Condvar::new(), over: AtomicBool::new(false) }
    }

    fn trip(&self, why: &str) {
        // Recorded BEFORE on_trip acts: on_trip hangs up the run, and the caller reads this the
        // moment the hang-up reaches it, so the reason has to be there first.
        {
            let mut t = lock(&self.tripped);
            if t.is_none() {
                *t = Some(why.to_string());
            }
        }
        // a finish waiting on this run's open calls has its verdict now
        {
            let _open = lock(&self.open);
            self.settled.notify_all();
        }
        let f = lock(&self.on_trip).take();
        if let Some(f) = f {
            f(why);
        }
    }

    fn call_sent(&self) {
        *lock(&self.open) += 1;
    }

    fn call_settled(&self) {
        let mut n = lock(&self.open);
        *n = n.saturating_sub(1);
        self.settled.notify_all();
    }

    /// Wait up to `bound` for every call of this run to settle, or for a trip. How many are
    /// still open when it returns.
    fn wait_settled(&self, bound: Duration) -> usize {
        let n = lock(&self.open);
        let (n, _) = self
            .settled
            .wait_timeout_while(n, bound, |n| *n > 0 && lock(&self.tripped).is_none())
            .unwrap_or_else(|e| e.into_inner());
        *n
    }
}

#[derive(Default)]
struct Runs {
    /// The model process every active run started against.
    pin: Option<Target>,
    active: Vec<Arc<Run>>,
}

struct Shared {
    policy: Box<dyn Policy>,
    runs: Mutex<Runs>,
}

impl Shared {
    fn trip_all(&self, why: &str) {
        let active = lock(&self.runs).active.clone();
        for r in active {
            r.trip(why);
        }
    }

    fn admit(&self, pid: u32) -> Result<(), String> {
        let refused = match self.policy.admit(pid) {
            Ok(()) => return Ok(()),
            Err(why) => why,
        };
        let trees: Vec<(u32, u64)> = lock(&self.runs).active.iter().filter_map(|r| r.tree).collect();
        if trees.into_iter().any(|t| in_tree(pid, t)) {
            return Ok(());
        }
        Err(refused)
    }

    /// The target now, held to the pin while a run is active: any difference trips every run.
    fn target(&self) -> Result<Target, String> {
        let now = self.policy.target();
        let pin = lock(&self.runs).pin.clone();
        let why = match (pin, now) {
            (None, now) => return now,
            (Some(p), Ok(t)) if t.same_process(&p) => return Ok(t),
            (Some(p), Ok(t)) => format!(
                "the model server on port {} changed: process {} passes the check there now, not the one checked when this document's run started (pid {})",
                p.port, t.pid, p.pid
            ),
            (Some(p), Err(e)) => format!("the model server that was checked (pid {}) no longer passes the check: {e}", p.pid),
        };
        self.trip_all(&why);
        Err(why)
    }
}

/// `pid` is the root, or a direct child of it created after it, and the root is still the
/// process the run was proved against. The chain's stages are direct children of the service
/// (serve-legal.mjs execFile('node', …)), so nothing deeper is needed.
pub fn in_tree(pid: u32, (root, root_created): (u32, u64)) -> bool {
    if root == 0 || root_created == 0 || created_of(root) != root_created {
        return false;
    }
    if pid == root {
        return true;
    }
    parent_of(pid) == Some(root) && created_of(pid) >= root_created
}

/// An exclusive loopback listener as Relay::start says, for the shared port and each run's own.
fn off_engine_ports() -> io::Result<TcpListener> {
    for _ in 0..8 {
        let l = exclusive_listener(0)?;
        let port = l.local_addr()?.port();
        if port != crate::engine::LLAMA_PORT && port != crate::engine::LEGAL_PORT {
            return Ok(l);
        }
    }
    Err(io::Error::other("the system kept choosing a port this app's engine uses"))
}

/// Every connection on `l`, each on its own thread. `run`: `l` is that run's own port, which
/// stops taking connections once the run is over (RunGuard::release wakes it to see that).
fn accept(l: TcpListener, sh: Arc<Shared>, run: Option<Arc<Run>>) {
    for c in l.incoming() {
        if run.as_ref().is_some_and(|r| r.over.load(Ordering::SeqCst)) {
            return;
        }
        match c {
            Ok(c) => {
                let (sh, run) = (sh.clone(), run.clone());
                std::thread::spawn(move || handle(&sh, c, run));
            }
            Err(e) => {
                eprintln!("[simpler.legal] relay: accept failed: {e}");
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }
}

pub struct Relay {
    port: u16,
    shared: Arc<Shared>,
}

impl Relay {
    /// On an ephemeral loopback port that is not one of the ports this app's engine uses (49400
    /// lies inside Windows' dynamic range, so the system can hand it out).
    pub fn start(policy: impl Policy) -> io::Result<Relay> {
        Ok(Self::serve(off_engine_ports()?, policy))
    }

    pub fn serve(l: TcpListener, policy: impl Policy) -> Relay {
        let port = l.local_addr().map(|a| a.port()).unwrap_or(0);
        let shared = Arc::new(Shared { policy: Box::new(policy), runs: Mutex::new(Runs::default()) });
        let sh = shared.clone();
        std::thread::spawn(move || accept(l, sh, None));
        Relay { port, shared }
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Register a run pinned to `pin`, the model process it was checked against. `tree` admits a
    /// hand-started service's processes for as long as the run lasts. `on_trip` runs once, the
    /// first time the run is tripped. Err: a run still active was started against a different
    /// model process, which means the model changed under it; that run is tripped, and this one
    /// is refused, because stopping that run stops the service this one would use.
    ///
    /// The run gets a port of its own (RunGuard::port), which the chain is given as this run's
    /// llamaPort, so each call is known to be this run's and no other's: a call left open by one
    /// document never holds another's finish, and a cut on it trips only the document it
    /// belongs to (owner ruling 20, wf7 S3R-1). The shared port stays for the service's own
    /// /health and for anything that does not take llamaPort; a call there counts toward every
    /// run active when it was sent.
    pub fn begin_run(
        &self,
        pin: Target,
        tree: Option<(u32, u64)>,
        on_trip: impl FnOnce(&str) + Send + 'static,
    ) -> Result<RunGuard, String> {
        let mut runs = lock(&self.shared.runs);
        if let Some(p) = runs.pin.clone() {
            if !p.same_process(&pin) {
                drop(runs);
                let why = format!(
                    "the model server on port {} changed while a document was being read: process {} passes the check there now, not the one checked when that run started (pid {})",
                    p.port, pin.pid, p.pid
                );
                self.shared.trip_all(&why);
                return Err(format!("{why}. That run was stopped; add this document again"));
            }
        }
        runs.pin = Some(pin);
        let run = Arc::new(Run::new(tree, Box::new(on_trip)));
        runs.active.push(run.clone());
        drop(runs);
        // deregistered by the guard's drop if its port cannot be opened
        let mut guard = RunGuard { shared: self.shared.clone(), run: run.clone(), released: false, port: 0 };
        let l = off_engine_ports().map_err(|e| {
            format!("the app could not open a loopback port for this document's run ({e}), so nothing was sent")
        })?;
        guard.port = l.local_addr().map(|a| a.port()).unwrap_or(0);
        let sh = self.shared.clone();
        std::thread::spawn(move || accept(l, sh, Some(run)));
        Ok(guard)
    }
}

pub struct RunGuard {
    shared: Arc<Shared>,
    run: Arc<Run>,
    released: bool,
    port: u16,
}

impl RunGuard {
    /// The port this run's chain reaches the model through: the llamaPort of its /strip.
    pub fn port(&self) -> u16 {
        self.port
    }

    /// Trips every active run: model_watch.rs's call when the checked process exits.
    pub fn tripper(&self) -> impl FnOnce(String) + Send + 'static {
        let sh = self.shared.clone();
        move |why: String| sh.trip_all(&why)
    }

    /// End the run. Some(why): it was tripped, and its result must not be used. Read after the
    /// run is deregistered, so nothing can trip it once this has answered None.
    ///
    /// Not before its calls have settled (owner ruling 20). The chain gives up on a call at 45 s,
    /// writes the document without it and ends the stream; the relay reads that hang-up as a lost
    /// call only HANG_UP_GRACE later. Read at once, the verdict was None, the frozen output was
    /// used with what the call was there to find left readable (a health condition, measured on
    /// the real stages, wf7 S3R-1), and the trip landed on the next document instead. So this
    /// waits up to twice the grace for a call still open to be passed on or cut, and a call
    /// still open after that trips the run here.
    pub fn finish(mut self) -> Option<String> {
        let open = self.run.wait_settled(HANG_UP_GRACE * 2);
        if open > 0 {
            self.run.trip(&format!("{CUT_OFF} — {open} of its calls to the model still had no answer when the pipeline's result for the document arrived"));
        }
        self.release();
        lock(&self.run.tripped).clone()
    }

    /// End a run whose result the app never read, because its own read of the stream failed
    /// (post_lines Err). Ruling 20 guards a result read while a call is open, and none was read,
    /// so this neither waits for the calls nor trips the run for one still open. finish() did,
    /// and after an app-side read timeout it told the lawyer the pipeline's result "arrived" and
    /// stopped the adapter (3 of 65 runs through the built app, 2026-09-25, launch lane R). The
    /// adapter needs no stopping here: the app hangs up, and the service stops its chain when its
    /// caller hangs up (serve-legal.mjs). A trip already recorded, such as the one whose hang-up
    /// ended the read, is still returned: its words are recorded before the hang-up (Run::trip).
    pub fn finish_unread(mut self) -> Option<String> {
        self.release();
        lock(&self.run.tripped).clone()
    }

    fn release(&mut self) {
        if std::mem::replace(&mut self.released, true) {
            return;
        }
        {
            let mut runs = lock(&self.shared.runs);
            runs.active.retain(|r| !Arc::ptr_eq(r, &self.run));
            if runs.active.is_empty() {
                runs.pin = None;
            }
        }
        lock(&self.run.on_trip).take();
        // The run's port closes: its accept loop is woken by one connection it drops unread.
        // A stage of this run still dialling after this is refused by the closed port.
        self.run.over.store(true, Ordering::SeqCst);
        if self.port != 0 {
            let _ = TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], self.port)), Duration::from_secs(1));
        }
    }
}

impl Drop for RunGuard {
    fn drop(&mut self) {
        self.release();
    }
}

// ── one connection ───────────────────────────────────────────────────────────────────────────

const HEAD_CAP: usize = 64 * 1024;
const MAX_HEADERS: usize = 100;
/// One completion request carries one window of a document; 64 MiB is far above any the chain
/// sends and bounds what a client can make the relay stream.
const BODY_CAP: u64 = 64 << 20;

struct Req {
    method: String,
    target: String,
    version: String,
    headers: Vec<(String, String)>,
}

enum Framing {
    Length(u64),
    Chunked,
}

fn tchar(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b)
}

/// One line of a request head, CRLF or LF ended. None: the connection closed before a byte.
fn head_line(r: &mut impl BufRead, budget: &mut usize) -> Result<Option<String>, String> {
    let mut buf = Vec::new();
    r.take(*budget as u64).read_until(b'\n', &mut buf).map_err(|e| format!("reading the request: {e}"))?;
    *budget = budget.saturating_sub(buf.len());
    if buf.is_empty() {
        return Ok(None);
    }
    if buf.last() != Some(&b'\n') {
        return Err("a request head that is too long or cut off".into());
    }
    buf.pop();
    if buf.last() == Some(&b'\r') {
        buf.pop();
    }
    if buf.contains(&b'\r') || buf.contains(&0) {
        return Err("a bare CR or NUL inside a request head".into());
    }
    String::from_utf8(buf).map(Some).map_err(|_| "a request head that is not UTF-8".into())
}

fn read_head(r: &mut impl BufRead) -> Result<Option<Req>, String> {
    let mut budget = HEAD_CAP;
    let start = loop {
        match head_line(r, &mut budget)? {
            None => return Ok(None),
            Some(l) if l.is_empty() => continue, // RFC 9112 §2.2: an empty line before a request
            Some(l) => break l,
        }
    };
    let mut parts = start.split(' ');
    let (Some(method), Some(target), Some(version), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else {
        return Err("a malformed request line".into());
    };
    let mut headers = Vec::new();
    loop {
        let l = head_line(r, &mut budget)?.ok_or("the connection closed inside a request head")?;
        if l.is_empty() {
            break;
        }
        if headers.len() == MAX_HEADERS {
            return Err(format!("more than {MAX_HEADERS} header lines"));
        }
        let (k, v) = l.split_once(':').ok_or("a header line without a colon")?;
        if k.is_empty() || !k.bytes().all(tchar) {
            return Err("a malformed or folded header line".into());
        }
        headers.push((k.to_string(), v.trim_matches([' ', '\t']).to_string()));
    }
    Ok(Some(Req { method: method.into(), target: target.into(), version: version.into(), headers }))
}

impl Req {
    fn values(&self, name: &str) -> Vec<&str> {
        self.headers.iter().filter(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str()).collect()
    }

    /// Whether this request may be carried, and how its body is framed. Err: (status, words).
    fn check(&self) -> Result<Framing, (u16, String)> {
        if self.version != "HTTP/1.1" && self.version != "HTTP/1.0" {
            return Err((400, format!("refused: {} is not HTTP/1.x", self.version.chars().take(20).collect::<String>())));
        }
        if !matches!((self.method.as_str(), self.target.as_str()), ("GET", "/health") | ("POST", "/v1/chat/completions")) {
            return Err((
                403,
                format!(
                    "refused: {} {} — this port carries only GET /health and POST /v1/chat/completions, the two requests the frozen pipeline makes of the model server",
                    self.method.chars().take(16).collect::<String>(),
                    self.target.chars().take(80).collect::<String>()
                ),
            ));
        }
        // Framing decides where this request ends and the next begins, so anything two readers
        // could frame two ways is refused rather than guessed (RFC 9112 §6.3).
        let (cls, tes) = (self.values("content-length"), self.values("transfer-encoding"));
        if !tes.is_empty() {
            if !cls.is_empty() {
                return Err((400, "refused: both Content-Length and Transfer-Encoding".into()));
            }
            if tes.len() != 1 || !tes[0].eq_ignore_ascii_case("chunked") {
                return Err((400, "refused: a transfer coding other than chunked".into()));
            }
            return Ok(Framing::Chunked);
        }
        let Some(first) = cls.first() else { return Ok(Framing::Length(0)) };
        if cls.iter().any(|v| v != first) || first.is_empty() || !first.bytes().all(|b| b.is_ascii_digit()) {
            return Err((400, "refused: a missing, malformed or repeated-and-different Content-Length".into()));
        }
        match first.parse::<u64>() {
            Ok(n) if n <= BODY_CAP => Ok(Framing::Length(n)),
            _ => Err((413, format!("refused: a body over {} MiB", BODY_CAP >> 20))),
        }
    }
}

/// One request's body, read whole from the client before anything of it is written upstream: its
/// token limit decides how the answer is read (answer_rule), and that has to be settled before
/// the answer can arrive. Chunked is decoded; trailers are dropped, since nothing the chain sends
/// needs them. A client that hangs up inside a body now sends the model none of it.
fn read_body(framing: &Framing, cr: &mut impl BufRead) -> Result<Vec<u8>, String> {
    let io = |e: io::Error| format!("reading the request: {e}");
    let mut body = Vec::new();
    match *framing {
        Framing::Length(n) => {
            if Read::take(&mut *cr, n).read_to_end(&mut body).map_err(io)? as u64 != n {
                return Err("the client closed the connection inside a request body".into());
            }
        }
        Framing::Chunked => loop {
            let mut budget = 1024;
            let size = head_line(cr, &mut budget)?.ok_or("the connection closed inside a chunked body")?;
            let hex = size.split(';').next().unwrap_or("").trim();
            let n = u64::from_str_radix(hex, 16).map_err(|_| format!("a bad chunk size {hex:?}"))?;
            if (body.len() as u64).saturating_add(n) > BODY_CAP {
                return Err(format!("a body over {} MiB", BODY_CAP >> 20));
            }
            if n == 0 {
                let mut budget = HEAD_CAP;
                while !head_line(cr, &mut budget)?.ok_or("the connection closed inside a chunked body")?.is_empty() {}
                break;
            }
            if Read::take(&mut *cr, n).read_to_end(&mut body).map_err(io)? as u64 != n {
                return Err("the client closed the connection inside a chunk".into());
            }
            let mut budget = 2;
            if !head_line(cr, &mut budget)?.ok_or("the connection closed inside a chunked body")?.is_empty() {
                return Err("a chunk not followed by CRLF".into());
            }
        },
    }
    Ok(body)
}

/// Write one request to the verified upstream: the head rebuilt, the body as read (read_body),
/// one chunk when it came chunked. Accept-Encoding is set to identity: an answer the relay has to
/// read must not come back compressed, and one that does anyway is not read as whole.
fn send_request(req: &Req, chunked: bool, body: &[u8], up: &mut TcpStream, t: &Target) -> Result<(), String> {
    let io = |e: io::Error| format!("forwarding: {e}");
    let mut head = format!("{} {} {}\r\n", req.method, req.target, req.version);
    for (k, v) in &req.headers {
        let lower = k.to_ascii_lowercase();
        if matches!(lower.as_str(), "host" | "authorization" | "proxy-authorization" | "x-api-key" | "proxy-connection" | "accept-encoding") {
            continue;
        }
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str(&format!("Host: 127.0.0.1:{}\r\n", t.port));
    if let Some(k) = &t.key {
        head.push_str(&format!("Authorization: Bearer {k}\r\n"));
    }
    head.push_str("Accept-Encoding: identity\r\n\r\n");
    up.write_all(head.as_bytes()).map_err(io)?;
    if chunked {
        if !body.is_empty() {
            up.write_all(format!("{:x}\r\n", body.len()).as_bytes()).map_err(io)?;
            up.write_all(body).map_err(io)?;
            up.write_all(b"\r\n").map_err(io)?;
        }
        up.write_all(b"0\r\n\r\n").map_err(io)?;
    } else {
        up.write_all(body).map_err(io)?;
    }
    up.flush().map_err(io)
}

// ── answers ──────────────────────────────────────────────────────────────────────────────────

/// The frozen chain asks for 400 tokens on its extraction calls and 300 on its residue calls; its
/// YES/NO probes ask for 4 and its classify and router calls for 6 (grep of lib-legal and
/// lib-core for maxTokens). A call allowed this many or more is one whose answer is a list the
/// chain reads as all there is.
const WHOLE_FROM: u64 = 300;
/// The largest answer read whole before it is forwarded; one extraction answer is a few KiB.
const ANSWER_CAP: u64 = 16 << 20;

/// How the answer to one forwarded request is relayed, in the order the requests went out
/// (HTTP/1.1 answers in order on one connection).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Answer {
    /// GET /health: forwarded as it arrives, whatever its status
    Pass,
    /// a chat-completions call allowed fewer than WHOLE_FROM tokens (its limit): forwarded as it
    /// arrives with finish_reason unread (ruling 15), and the run tripped if no 2xx answer reaches
    /// the chain whole
    Probe(u64),
    /// read whole, and forwarded only when it says it finished; the token limit the call set
    Whole(Option<u64>),
}

impl Answer {
    /// A call to the model: the chain counts its loss and goes on without it.
    fn is_call(self) -> bool {
        !matches!(self, Answer::Pass)
    }

    fn on(self) -> String {
        match self {
            Answer::Probe(n) | Answer::Whole(Some(n)) => format!("a call allowed {n} tokens"),
            Answer::Whole(None) => "a call that set no token limit".into(),
            Answer::Pass => "a health check".into(),
        }
    }
}

fn is_chat(req: &Req) -> bool {
    req.method == "POST" && req.target == "/v1/chat/completions"
}

/// A chat-completions call is let through unread only when it sets a token limit, and every
/// limit it sets is a whole number under WHOLE_FROM. Two names for the limit take the larger
/// (llama-server reads more than one); -1 (no limit), a body that is not JSON, or none set are
/// read whole.
fn answer_rule(req: &Req, body: &[u8]) -> Answer {
    if !is_chat(req) {
        return Answer::Pass;
    }
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(body) else { return Answer::Whole(None) };
    let mut limit: Option<u64> = None;
    for k in ["max_tokens", "max_completion_tokens", "n_predict"] {
        match v.get(k) {
            None | Some(serde_json::Value::Null) => {}
            Some(x) => match x.as_u64() {
                Some(n) => limit = Some(limit.map_or(n, |l| l.max(n))),
                None => return Answer::Whole(None),
            },
        }
    }
    match limit {
        Some(n) if n < WHOLE_FROM => Answer::Probe(n),
        l => Answer::Whole(l),
    }
}

/// Why an answer the chain would read as whole is not one, or None. A status other than 2xx is no
/// answer: the chain throws on it (`if (!r.ok) throw`, both complete functions), and every stage
/// after the substrate counts the throw and writes the document without that call's findings
/// (relay.rs header). An answer that ends on "stop" with no text is read by the chain as "nothing
/// found", as `?? ''` makes a missing one. Only `choices[0]` is read, because that is all the
/// chain reads.
fn not_whole(status: u16, coding: Option<&str>, body: &[u8], limit: Option<u64>) -> Option<String> {
    let on = Answer::Whole(limit).on();
    if !(200..300).contains(&status) {
        return Some(format!("the model server answered HTTP {status}, so the stage had no answer to read, on {on}"));
    }
    if let Some(c) = coding.filter(|c| !c.is_empty() && !c.eq_ignore_ascii_case("identity")) {
        return Some(format!(
            "it came back with content-encoding {:?}, which the relay does not decode, so nothing showed it was finished",
            c.chars().take(40).collect::<String>()
        ));
    }
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(body) else {
        return Some("it was not JSON, so nothing showed it was finished".into());
    };
    let text = v["choices"][0]["message"]["content"].as_str().is_some_and(|t| !t.trim().is_empty());
    match v["choices"][0]["finish_reason"].as_str() {
        Some("stop") if text => None,
        Some("stop") => Some(format!("it ended on \"stop\" with no answer text, on {on}")),
        Some("length") => Some(format!("it was cut off at the model's token limit (finish_reason \"length\") on {on}")),
        Some(r) => Some(format!("it ended with finish_reason {:?}, not \"stop\", on {on}", r.chars().take(40).collect::<String>())),
        None => Some(format!("it named no finish_reason, so nothing showed it was finished, on {on}")),
    }
}

enum Body {
    None,
    Length(u64),
    Chunked,
    /// framed by the server closing the connection
    Close,
}

struct AnswerHead {
    status: u16,
    lines: Vec<String>,
    coding: Option<String>,
    body: Body,
}

impl AnswerHead {
    fn bytes(&self) -> Vec<u8> {
        format!("{}\r\n\r\n", self.lines.join("\r\n")).into_bytes()
    }
}

/// One answer head from the model server (RFC 9112 §6.3 for where its body ends). None: the
/// server closed the connection between answers.
fn read_answer_head(r: &mut impl BufRead) -> Result<Option<AnswerHead>, String> {
    let mut budget = HEAD_CAP;
    let Some(start) = head_line(r, &mut budget)? else { return Ok(None) };
    let status = match (start.starts_with("HTTP/1."), start.split(' ').nth(1)) {
        (true, Some(s)) if s.len() == 3 && s.bytes().all(|b| b.is_ascii_digit()) => s.parse::<u16>().unwrap_or(0),
        _ => return Err("the model server sent a malformed status line".into()),
    };
    let (mut lines, mut cls, mut tes, mut coding) = (vec![start], Vec::new(), Vec::new(), None);
    loop {
        let l = head_line(r, &mut budget)?.ok_or("the model server closed the connection inside an answer head")?;
        if l.is_empty() {
            break;
        }
        if lines.len() > MAX_HEADERS {
            return Err(format!("the model server sent more than {MAX_HEADERS} header lines"));
        }
        let (k, v) = l.split_once(':').ok_or("the model server sent a header line without a colon")?;
        let v = v.trim_matches([' ', '\t']);
        if k.eq_ignore_ascii_case("content-length") {
            cls.push(v.to_string());
        } else if k.eq_ignore_ascii_case("transfer-encoding") {
            tes.push(v.to_ascii_lowercase());
        } else if k.eq_ignore_ascii_case("content-encoding") {
            coding = Some(v.to_string());
        }
        lines.push(l);
    }
    let body = if (100..200).contains(&status) || status == 204 || status == 304 {
        Body::None
    } else if !tes.is_empty() {
        if tes.join(",").rsplit(',').next().map(str::trim) == Some("chunked") {
            Body::Chunked
        } else {
            Body::Close
        }
    } else if let Some(first) = cls.first() {
        if cls.iter().any(|v| v != first) || first.is_empty() || !first.bytes().all(|b| b.is_ascii_digit()) {
            return Err("the model server sent a malformed or repeated-and-different Content-Length".into());
        }
        Body::Length(first.parse().map_err(|_| "the model server sent a Content-Length out of range")?)
    } else {
        Body::Close
    };
    Ok(Some(AnswerHead { status, lines, coding, body }))
}

/// Writes to `out` and keeps a copy of what it wrote when asked. `failed`: a write to `out` is
/// what went wrong, not a read from the model server.
struct Tee<'a, W: Write> {
    out: &'a mut W,
    kept: Option<&'a mut Vec<u8>>,
    failed: bool,
}

impl<W: Write> Write for Tee<'_, W> {
    fn write(&mut self, b: &[u8]) -> io::Result<usize> {
        let n = self.out.write(b).inspect_err(|_| self.failed = true)?;
        if let Some(k) = self.kept.as_deref_mut() {
            k.extend_from_slice(&b[..n]);
        }
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.out.flush().inspect_err(|_| self.failed = true)
    }
}

enum BodyErr {
    /// over the cap given
    Large,
    /// the model server's side: the answer broke off, or was framed wrongly
    Broken(String),
    /// the chain's side: a whole answer could not be written to it (it had hung up). Kept apart
    /// so the reason does not send the lawyer to a model log that shows nothing wrong (wf7 S3R-4).
    Write(String),
}

/// The reason for an answer the chain could not be written, in the one set of words every write
/// site uses. It names the chain's own limit, because that is the usual cause and what the
/// "thinking off" advice on screen addresses: a model answering a few hundred ms past the 45 s
/// abort was reported as a bare Windows socket error (wf8 S7A-2), while the same model a little
/// later read "the pipeline hung up … its own 45-second limit".
fn unpassed(e: impl std::fmt::Display) -> String {
    format!("it could not be passed on: the pipeline had hung up on that call, at its own 45-second limit on a call or with its process ending ({e})")
}

/// The chain's end of one connection, as the answer thread writes to it. Once the chain has been
/// sent anything on a connection, a hang-up it makes afterwards (seen by the request thread,
/// Calls::hang_up) ends what is written to it: an answer on its way then did not reach it whole,
/// and one that comes later reaches nobody, so the call is lost as it is. Without this, a probe
/// answer whose head reached the chain before its 45 s abort and whose body came after was
/// written into the closed socket; a first write there succeeds, so the call was counted
/// delivered and the run was not tripped (wf8 S7A-4, measured: not tripped on a graceful close,
/// which is how undici's abort closes).
///
/// A hang-up before the chain has been sent a byte is left to the writes themselves: the chain's
/// socket is closed, never half-closed (undici), so an answer's head draws a reset and a later
/// write of it fails on that (measured, round 7: 40 of 40 answers that reached this relay 0 to
/// 360 ms after a graceful close tripped the run on os error 10053, at 4 and 400 tokens; the 12
/// that arrived before the close were passed on and not tripped). Refusing those too would
/// refuse every answer to a client that half-closes and still reads, which is how the tests
/// below send most requests. A few µs remain between the hang-up reaching the kernel and the
/// request thread recording it.
struct ToChain<'a, W: Write> {
    out: &'a mut W,
    calls: &'a Calls,
    /// Set at the connection's first write: whether the chain had not hung up by then
    armed: Option<bool>,
}

impl<W: Write> Write for ToChain<'_, W> {
    fn write(&mut self, b: &[u8]) -> io::Result<usize> {
        let hung_up = self.calls.hung_up();
        if *self.armed.get_or_insert(!hung_up) && hung_up {
            return Err(io::Error::other("the relay had seen it close its end"));
        }
        self.out.write(b)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.out.flush()
    }
}

/// io::copy through a Tee, its error told apart by which side failed.
fn tee_copy<W: Write>(r: &mut dyn Read, out: &mut W, kept: Option<&mut Vec<u8>>) -> Result<u64, BodyErr> {
    let mut tee = Tee { out, kept, failed: false };
    io::copy(r, &mut tee).map_err(|e| if tee.failed { BodyErr::Write(e.to_string()) } else { BodyErr::Broken(format!("relaying an answer: {e}")) })
}

/// An answer's body from `r` to `out` as framed, and, decoded, into `data` when given one. Over
/// `cap` bytes is Large, whatever has been written by then.
fn copy_body<W: Write>(r: &mut impl BufRead, body: &Body, out: &mut W, mut data: Option<&mut Vec<u8>>, cap: u64) -> Result<(), BodyErr> {
    let wrote = |e: io::Error| BodyErr::Write(e.to_string());
    let short = || BodyErr::Broken("the model server closed the connection inside an answer".into());
    match *body {
        Body::None => Ok(()),
        Body::Length(n) => {
            if n > cap {
                return Err(BodyErr::Large);
            }
            let got = tee_copy(&mut Read::take(&mut *r, n), out, data)?;
            if got == n { Ok(()) } else { Err(short()) }
        }
        Body::Close => {
            let got = tee_copy(&mut Read::take(&mut *r, cap.saturating_add(1)), out, data)?;
            if got > cap { Err(BodyErr::Large) } else { Ok(()) }
        }
        Body::Chunked => {
            let bad = |e: String| BodyErr::Broken(e);
            let mut total = 0u64;
            loop {
                let mut budget = 1024;
                let size = head_line(r, &mut budget).map_err(bad)?.ok_or_else(short)?;
                let hex = size.split(';').next().unwrap_or("").trim();
                let n = u64::from_str_radix(hex, 16).map_err(|_| BodyErr::Broken(format!("the model server sent a bad chunk size {hex:?}")))?;
                total = total.saturating_add(n);
                if total > cap {
                    return Err(BodyErr::Large);
                }
                out.write_all(format!("{n:x}\r\n").as_bytes()).map_err(wrote)?;
                if n == 0 {
                    let mut budget = HEAD_CAP;
                    loop {
                        let l = head_line(r, &mut budget).map_err(bad)?.ok_or_else(short)?;
                        out.write_all(format!("{l}\r\n").as_bytes()).map_err(wrote)?;
                        if l.is_empty() {
                            return Ok(());
                        }
                    }
                }
                let got = tee_copy(&mut Read::take(&mut *r, n), &mut *out, data.as_deref_mut())?;
                if got != n {
                    return Err(short());
                }
                let mut budget = 2;
                if !head_line(r, &mut budget).map_err(bad)?.ok_or_else(short)?.is_empty() {
                    return Err(BodyErr::Broken("the model server sent a chunk not followed by CRLF".into()));
                }
                out.write_all(b"\r\n").map_err(wrote)?;
            }
        }
    }
}

/// How the answers on one connection ended.
enum Ended {
    /// the model server closed the connection, between answers or to end one
    Closed,
    /// a call's answer did not reach the chain as a whole one (not_whole, or it broke off, or it
    /// could not be passed on); nothing more of it is forwarded
    Cut(String),
    Broken(String),
    /// an interim (1xx) head could not be written to the chain, before its answer's rule was
    /// read: with a call open it is that call lost on the chain's side, not the model server's
    /// connection breaking, which is what these words said (wf8 S7A-3)
    Unpassed(String),
}

/// What the two threads of one connection share about its calls to the model. The answer thread
/// sets `ended` under this lock before it reads `open`, and a request's rule is queued under the
/// same lock only while `ended` is false, so a call on a connection that closes is counted
/// unanswered by one side or the other and never by neither.
struct Calls {
    /// the run whose own port this connection came in on; None: the shared port
    run: Option<Arc<Run>>,
    state: Mutex<CallState>,
    cv: Condvar,
}

#[derive(Default)]
struct CallState {
    /// the answer thread has stopped relaying answers
    ended: bool,
    /// calls sent whose answers have not yet been passed on whole, oldest first, each with the
    /// runs it counts toward (Run::open)
    open: VecDeque<Vec<Arc<Run>>>,
    /// the chain has closed its end (ToChain)
    hung_up: bool,
}

impl Calls {
    fn new(run: Option<Arc<Run>>) -> Calls {
        Calls { run, state: Mutex::new(CallState::default()), cv: Condvar::new() }
    }

    /// The runs a call or a cut on this connection belongs to now: its own run, or on the shared
    /// port every run active.
    fn runs(&self, sh: &Shared) -> Vec<Arc<Run>> {
        match &self.run {
            Some(r) => vec![r.clone()],
            None => lock(&sh.runs).active.clone(),
        }
    }

    /// Queue a request's rule for the answer thread. false: that thread has stopped, and this
    /// request would get no answer.
    fn queue(&self, sh: &Shared, rules: &mpsc::Sender<Answer>, rule: Answer) -> bool {
        let mut s = lock(&self.state);
        if s.ended || rules.send(rule).is_err() {
            return false;
        }
        if rule.is_call() {
            let runs = self.runs(sh);
            runs.iter().for_each(|r| r.call_sent());
            s.open.push_back(runs);
        }
        true
    }

    fn answered(&self) {
        let mut s = lock(&self.state);
        if let Some(runs) = s.open.pop_front() {
            runs.iter().for_each(|r| r.call_settled());
        }
        self.cv.notify_all();
    }

    /// The answer thread has stopped: how many calls it left unanswered. They stay counted
    /// against their runs until settle(), after any cut for them is recorded, so a finish
    /// never sees them settled before the trip they stand for.
    fn end(&self) -> usize {
        let mut s = lock(&self.state);
        s.ended = true;
        self.cv.notify_all();
        s.open.len()
    }

    fn settle(&self) {
        let mut s = lock(&self.state);
        for runs in s.open.drain(..) {
            runs.iter().for_each(|r| r.call_settled());
        }
    }

    /// The runs a cut on this connection trips: those of its open calls, or, with none open,
    /// those it belongs to now.
    fn cut_runs(&self, sh: &Shared) -> Vec<Arc<Run>> {
        let mut out: Vec<Arc<Run>> = Vec::new();
        for r in lock(&self.state).open.iter().flatten() {
            if !out.iter().any(|o| Arc::ptr_eq(o, r)) {
                out.push(r.clone());
            }
        }
        if out.is_empty() {
            out = self.runs(sh);
        }
        out
    }

    /// The chain has closed its end: recorded before the grace is waited out, so an answer it
    /// was receiving is written no further (ToChain).
    fn hang_up(&self) {
        lock(&self.state).hung_up = true;
    }

    fn hung_up(&self) -> bool {
        lock(&self.state).hung_up
    }

    /// The chain hung up. true: a call was still unanswered `grace` later, with the answer
    /// thread still relaying (when it has stopped, it counts what it left, in end()).
    fn abandoned(&self, grace: Duration) -> bool {
        let s = lock(&self.state);
        let (s, _) = self.cv.wait_timeout_while(s, grace, |s| !s.open.is_empty() && !s.ended).unwrap_or_else(|e| e.into_inner());
        !s.open.is_empty() && !s.ended
    }
}

/// How long an answer already on its way is given to be passed on after the chain hangs up. The
/// chain's fetch (undici) never half-closes a request it is waiting on, so a hang-up with a call
/// unanswered is the chain giving up on that call (its own 45 s abort, or its process ending);
/// the grace covers only an answer the chain had read before it closed, whose count this relay had
/// not yet taken down. A model still writing an answer 45 s in does not finish inside it, and if
/// one did, writing it into the closed socket fails and the call is cut, not counted delivered
/// (ToChain's note has the measure).
const HANG_UP_GRACE: Duration = Duration::from_millis(500);

/// Every answer on one connection, from the model server to the client, each relayed as the
/// `rules` entry for its request says (sent by handle() once the request's body is read, before
/// the request is written upstream, so the rule is always there before its answer can be). A
/// call's answer that does not reach the chain whole, for whatever reason, is Cut: the chain
/// counts it failed and goes on without it (the header).
fn relay_answers(up: &mut impl BufRead, client: &mut impl Write, rules: &mpsc::Receiver<Answer>, calls: &Calls) -> Ended {
    let client = &mut ToChain { out: client, calls, armed: None };
    loop {
        let head = match read_answer_head(up) {
            Ok(Some(h)) => h,
            Ok(None) => return Ended::Closed,
            Err(e) => return Ended::Broken(e),
        };
        if (100..200).contains(&head.status) {
            if let Err(e) = client.write_all(&head.bytes()) {
                return Ended::Unpassed(unpassed(e));
            }
            continue;
        }
        let Ok(rule) = rules.recv() else { return Ended::Broken("the model server sent an answer to no request".into()) };
        let body = |e: BodyErr| match e {
            BodyErr::Large => format!("it was over {} MiB, too large to read for whether it was finished", ANSWER_CAP >> 20),
            BodyErr::Broken(e) => format!("it broke off before it was whole ({e})"),
            BodyErr::Write(e) => unpassed(e),
        };
        let passed: Result<(), String> = match rule {
            Answer::Pass | Answer::Probe(_) => {
                if rule.is_call() && !(200..300).contains(&head.status) {
                    return Ended::Cut(format!("the model server answered HTTP {}, so the stage had no answer to read, on {}", head.status, rule.on()));
                }
                client
                    .write_all(&head.bytes())
                    .map_err(unpassed)
                    .and_then(|()| copy_body(up, &head.body, &mut *client, None, u64::MAX).map_err(body))
            }
            Answer::Whole(limit) => {
                let (mut raw, mut data) = (Vec::new(), Vec::new());
                if let Err(e) = copy_body(up, &head.body, &mut raw, Some(&mut data), ANSWER_CAP) {
                    return Ended::Cut(format!("{}, on {}", body(e), rule.on()));
                }
                if let Some(why) = not_whole(head.status, head.coding.as_deref(), &data, limit) {
                    return Ended::Cut(why);
                }
                client.write_all(&head.bytes()).and_then(|_| client.write_all(&raw)).map_err(unpassed)
            }
        }
        .and_then(|()| client.flush().map_err(unpassed));
        match passed {
            Ok(()) if rule.is_call() => calls.answered(),
            Ok(()) => {}
            Err(why) if rule.is_call() => return Ended::Cut(format!("{why}, on {}", rule.on())),
            Err(why) => return Ended::Broken(format!("relaying an answer: {why}")),
        }
        if matches!(head.body, Body::Close) {
            return Ended::Closed;
        }
    }
}

/// Answer and close. The rest of the request is read and dropped first: closing a socket with
/// unread data resets it, and the client would lose these words.
fn respond(c: &TcpStream, status: u16, words: &str) {
    let reason = match status {
        400 => "Bad Request",
        403 => "Forbidden",
        413 => "Payload Too Large",
        _ => "Bad Gateway",
    };
    let body = format!("{words}\n");
    let mut w = c;
    let _ = write!(
        w,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = w.flush();
    let _ = c.shutdown(Shutdown::Write);
    let _ = c.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = io::copy(&mut c.take(1 << 20), &mut io::sink());
}

fn abort(a: &TcpStream, b: &TcpStream) {
    let _ = a.shutdown(Shutdown::Both);
    let _ = b.shutdown(Shutdown::Both);
}

fn handle(sh: &Arc<Shared>, client: TcpStream, run: Option<Arc<Run>>) {
    let _ = client.set_nodelay(true);
    let (Ok(local), Ok(peer)) = (client.local_addr(), client.peer_addr()) else { return };
    // 1. admission, by the kernel's owner of the client's end of this connection
    let who = match owner_of(peer, local) {
        Ok(Some(p)) => p,
        Ok(None) => return respond(&client, 403, "refused: the kernel names no process at your end of this connection"),
        Err(e) => return respond(&client, 403, &format!("refused: your end of this connection could not be looked up ({e})")),
    };
    if let Err(why) = sh.admit(who) {
        eprintln!("[simpler.legal] relay: refused process {who}: {why}");
        return respond(&client, 403, &format!("refused: {why}"));
    }
    // A bound on an idle keep-alive connection's thread, above any single completion: the
    // chain aborts each model call at 45 s and the adapter each stage at 30 min.
    let _ = client.set_read_timeout(Some(Duration::from_secs(30 * 60)));
    let Ok(cr) = client.try_clone() else { return };
    let mut cr = BufReader::with_capacity(HEAD_CAP, cr);
    let first = match read_head(&mut cr) {
        Ok(Some(r)) => r,
        Ok(None) => return,
        Err(e) => return respond(&client, 400, &format!("refused: {e}")),
    };
    let framing = match first.check() {
        Ok(f) => f,
        Err((status, words)) => return respond(&client, status, &words),
    };
    // 2. which model process, held to the run's pin
    let target = match sh.target() {
        Ok(t) => t,
        Err(why) => return respond(&client, 502, &why),
    };
    // 3. our own connection to it, verified before a byte is written
    let up = match connect_verified(&target, Duration::from_secs(5)) {
        Ok(s) => s,
        Err(why) => {
            sh.trip_all(&why);
            return respond(&client, 502, &why);
        }
    };
    let (Ok(up_r), Ok(up_end), Ok(cw)) = (up.try_clone(), up.try_clone(), client.try_clone()) else { return abort(&up, &client) };
    let (rules, rules_rx) = mpsc::channel::<Answer>();
    let calls = Arc::new(Calls::new(run));
    // tripped BEFORE the hang-up, as for a model change (Run::trip): the caller reads the reason
    // the moment the hang-up reaches it. Only the runs this connection's calls belong to: a cut
    // that landed on every active run tripped the next document for the last one's lost call
    // (wf7 S3R-1).
    let cut = |sh: &Shared, calls: &Calls, why: String| {
        let why = format!("{CUT_OFF} — {why}");
        eprintln!("[simpler.legal] relay: {why}");
        for r in calls.cut_runs(sh) {
            r.trip(&why);
        }
    };
    let (sh_answers, calls_a) = (sh.clone(), calls.clone());
    std::thread::spawn(move || {
        let mut cw = cw;
        let end = relay_answers(&mut BufReader::with_capacity(HEAD_CAP, up_r), &mut cw, &rules_rx, &calls_a);
        let open = calls_a.end();
        match end {
            Ended::Cut(why) => {
                cut(&sh_answers, &calls_a, why);
                abort(&up_end, &cw);
            }
            // a call sent and never answered: the chain's fetch fails and the stage goes on without it
            Ended::Closed if open > 0 => {
                cut(&sh_answers, &calls_a, format!("the model server closed the connection with {open} of the pipeline's calls unanswered"));
                abort(&up_end, &cw);
            }
            Ended::Broken(e) if open > 0 => {
                cut(&sh_answers, &calls_a, format!("the connection to the model server broke with {open} of the pipeline's calls unanswered ({e})"));
                abort(&up_end, &cw);
            }
            Ended::Unpassed(why) if open > 0 => {
                cut(&sh_answers, &calls_a, why);
                abort(&up_end, &cw);
            }
            Ended::Unpassed(why) => {
                eprintln!("[simpler.legal] relay: {why}");
                abort(&up_end, &cw);
            }
            Ended::Closed => {
                let _ = cw.shutdown(Shutdown::Write);
            }
            Ended::Broken(e) => {
                eprintln!("[simpler.legal] relay: {e}");
                abort(&up_end, &cw);
            }
        }
        // after any cut above: a finish must never see these calls settled before their trip
        calls_a.settle();
    });
    // 4. requests, one at a time, each checked; a bad one after the first ends the connection
    // (a response may be in flight on it, so no words can be written into it)
    let mut up_w = up;
    let (mut req, mut framing) = (first, framing);
    loop {
        // A call is open from its head, not only once it is queued: a hang-up inside its body is
        // a lost call too, and the finish waits for its cut like any other.
        let receiving = if is_chat(&req) { calls.runs(sh) } else { Vec::new() };
        receiving.iter().for_each(|r| r.call_sent());
        let received = || receiving.iter().for_each(|r| r.call_settled());
        let body = match read_body(&framing, &mut cr) {
            Ok(b) => b,
            Err(e) => {
                if is_chat(&req) {
                    cut(sh, &calls, format!("the pipeline hung up partway through sending one of its calls ({e})"));
                } else {
                    eprintln!("[simpler.legal] relay: {e}");
                }
                received();
                return abort(&up_w, &client);
            }
        };
        // the rule goes before the request, so it is queued before its answer can arrive
        let rule = answer_rule(&req, &body);
        if !calls.queue(sh, &rules, rule) {
            if rule.is_call() {
                cut(sh, &calls, format!("the model server had closed the connection before {} could be sent", rule.on()));
            }
            received();
            return abort(&up_w, &client);
        }
        received();
        if let Err(e) = send_request(&req, matches!(framing, Framing::Chunked), &body, &mut up_w, &target) {
            // the call is counted open: the answer thread finds it unanswered once this abort
            // reaches it, and trips the run
            eprintln!("[simpler.legal] relay: {e}");
            return abort(&up_w, &client);
        }
        let next = read_head(&mut cr);
        if matches!(next, Ok(None) | Err(_)) {
            calls.hang_up();
        }
        if matches!(next, Ok(None) | Err(_)) && calls.abandoned(HANG_UP_GRACE) {
            cut(sh, &calls, "the pipeline hung up before the answer to one of its calls reached it (its own 45-second limit on a call, or its process ending)".into());
            return abort(&up_w, &client);
        }
        match next {
            Ok(Some(r)) => match r.check() {
                Ok(f) => (req, framing) = (r, f),
                Err((_, words)) => {
                    eprintln!("[simpler.legal] relay: {words}");
                    return abort(&up_w, &client);
                }
            },
            Ok(None) => {
                let _ = up_w.shutdown(Shutdown::Write);
                return;
            }
            Err(e) => {
                eprintln!("[simpler.legal] relay: {e}");
                return abort(&up_w, &client);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::port_owner::{child_listener, scratch_listener, scratch_port};
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::mpsc;

    /// Whom the stand-in policy admits: nobody, everybody, only direct children of this test
    /// process, or only this test process. The last two tell the client's end of a connection
    /// from the relay's own, which in these tests is this process.
    const NOBODY: u8 = 0;
    const ANYONE: u8 = 1;
    const MY_CHILDREN: u8 = 2;
    const ONLY_ME: u8 = 3;

    struct TestPolicy {
        admit: AtomicU8,
        target: Mutex<Result<Target, String>>,
    }

    impl Policy for Arc<TestPolicy> {
        fn admit(&self, pid: u32) -> Result<(), String> {
            let me = std::process::id();
            let ok = match self.admit.load(Ordering::SeqCst) {
                ANYONE => true,
                MY_CHILDREN => pid != me && parent_of(pid) == Some(me),
                ONLY_ME => pid == me,
                _ => false,
            };
            if ok {
                Ok(())
            } else {
                Err(format!("process {pid} is not the engine service this app started"))
            }
        }
        fn target(&self) -> Result<Target, String> {
            lock(&self.target).clone()
        }
    }

    fn me(port: u16, key: Option<&str>) -> Target {
        let pid = std::process::id();
        Target { port, pid, created: created_of(pid), key: key.map(String::from) }
    }

    /// Another live process, to stand for "a process that is not the one listening".
    fn other() -> std::process::Child {
        std::process::Command::new("ping")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .expect("ping.exe")
    }

    /// One connection as the stand-in model saw it: every byte, and the requests in them.
    struct Seen {
        raw: Vec<u8>,
        reqs: Vec<(String, Vec<u8>)>,
    }

    /// Complete requests in `b`, parsed independently of the relay's own parser (a test that
    /// used the code under test to read its output would pass by construction).
    fn parse_all(b: &[u8]) -> Vec<(String, Vec<u8>)> {
        let find = |from: usize, pat: &[u8]| b[from..].windows(pat.len()).position(|w| w == pat).map(|i| from + i);
        let mut out = Vec::new();
        let mut at = 0;
        while let Some(end) = find(at, b"\r\n\r\n") {
            let head = String::from_utf8_lossy(&b[at..end]).into_owned();
            let lower = head.to_ascii_lowercase();
            let mut p = end + 4;
            let body = if lower.contains("transfer-encoding: chunked") {
                let mut body = Vec::new();
                loop {
                    let Some(nl) = find(p, b"\r\n") else { return out };
                    // a size line may carry an extension (`5;ext=1`); one that is not hex ends the parse
                    let size = std::str::from_utf8(&b[p..nl]).unwrap_or("").split(';').next().unwrap_or("");
                    let Ok(n) = usize::from_str_radix(size.trim(), 16) else { return out };
                    p = nl + 2;
                    if n == 0 {
                        if b.len() < p + 2 {
                            return out;
                        }
                        p += 2;
                        break;
                    }
                    if b.len() < p + n + 2 {
                        return out;
                    }
                    body.extend_from_slice(&b[p..p + n]);
                    p += n + 2;
                }
                body
            } else {
                let n = lower
                    .lines()
                    .find_map(|l| l.strip_prefix("content-length:"))
                    .map(|v| v.trim().parse::<usize>().unwrap())
                    .unwrap_or(0);
                if b.len() < p + n {
                    return out;
                }
                p += n;
                b[p - n..p].to_vec()
            };
            out.push((head, body));
            at = p;
        }
        out
    }

    /// A whole answer: what every stand-in model below says unless a test gives it other words.
    const WHOLE: &str = r#"{"choices":[{"finish_reason":"stop","message":{"content":"ok"}}]}"#;

    /// How a call the chain hung up on is reported, word for word up to the socket's own error
    /// (unpassed): the chain's side and its limit, never the model's answer breaking off.
    const UNPASSED: &str = "it could not be passed on: the pipeline had hung up on that call, at its own 45-second limit on a call or with its process ending (";

    fn http_200(body: &str) -> String {
        format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}", body.len())
    }

    /// A stand-in model server in this process: answers every request with a whole answer, and
    /// reports each connection when it closes.
    fn model() -> (u16, mpsc::Receiver<Seen>) {
        model_saying(http_200(WHOLE))
    }

    /// The same, answering every request with `answer`, a whole HTTP response.
    fn model_saying(answer: String) -> (u16, mpsc::Receiver<Seen>) {
        model_then(answer, Duration::ZERO, false)
    }

    /// A stand-in that writes `answer` (any bytes, "" for none) `delay` after each request, and
    /// with `close` shuts the connection once it has: a model server that failed partway.
    fn model_then(answer: String, delay: Duration, close: bool) -> (u16, mpsc::Receiver<Seen>) {
        let l = scratch_listener();
        let port = l.local_addr().unwrap().port();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for c in l.incoming() {
                let Ok(mut c) = c else { break };
                let tx = tx.clone();
                let answer = answer.clone();
                std::thread::spawn(move || {
                    let _ = c.set_read_timeout(Some(Duration::from_secs(5)));
                    let (mut raw, mut answered, mut buf) = (Vec::new(), 0, [0u8; 65536]);
                    'conn: loop {
                        match c.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => raw.extend_from_slice(&buf[..n]),
                        }
                        let reqs = parse_all(&raw);
                        while answered < reqs.len() {
                            std::thread::sleep(delay);
                            let _ = c.write_all(answer.as_bytes());
                            answered += 1;
                            if close {
                                let _ = c.shutdown(Shutdown::Both);
                                break 'conn;
                            }
                        }
                    }
                    let reqs = parse_all(&raw);
                    let _ = tx.send(Seen { raw, reqs });
                });
            }
        });
        (port, rx)
    }

    fn relay(admit: bool, target: Result<Target, String>) -> (Relay, Arc<TestPolicy>) {
        let p = Arc::new(TestPolicy { admit: AtomicU8::new(if admit { ANYONE } else { NOBODY }), target: Mutex::new(target) });
        (Relay::serve(scratch_listener(), p.clone()), p)
    }

    /// A direct child of this process (PowerShell) dials the relay on `port` and sends GET
    /// /health, as a chain stage dials it from the service; returns the status line it read.
    /// Single quotes only: a double quote inside a Windows argument is re-escaped on the way to
    /// powershell.exe, and the request would not be the one written here.
    fn child_asks(port: u16) -> String {
        let script = format!(
            "$n = [string][char]13 + [char]10; $c = New-Object Net.Sockets.TcpClient('127.0.0.1', {port}); \
             $s = $c.GetStream(); $b = [Text.Encoding]::ASCII.GetBytes('GET /health HTTP/1.1' + $n + 'Host: x' + $n + $n); \
             $s.Write($b, 0, $b.Length); $c.Client.Shutdown(1); $r = New-Object IO.StreamReader($s); $r.ReadLine()"
        );
        let out = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output()
            .expect("powershell is needed for this test");
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    /// How a test's client ends its side of a connection.
    #[derive(Clone, Copy, PartialEq)]
    enum Client {
        /// reads the answers to every whole request it sent, then closes, as the chain's fetch
        /// does; with no whole request in what it sent, it hangs up at once
        Reads,
        /// half-closes right after sending, and reads what still comes: the chain hanging up
        /// with its calls open (HANG_UP_GRACE)
        HangsUp,
        /// keeps its end open and reads until the relay closes the connection
        StaysOpen,
    }

    /// Send `req` through the relay and read the answers to it (Client::Reads).
    fn ask(relay: &Relay, req: &[u8]) -> String {
        ask_as(relay, req, Client::Reads)
    }

    /// A client that half-closed and went on reading once stood in for every request here. The
    /// relay reads that half-close as the chain hanging up, and since wf8 S7A-4 stops writing an
    /// answer the chain was being sent when it hung up (ToChain): the test that sends two
    /// requests together then failed in 2 of the round's 19 mutant runs, both on mutants that
    /// do not touch it, whenever the first answer began before the relay read the half-close.
    /// So a client that wants its answers reads them before it closes.
    fn ask_as(relay: &Relay, req: &[u8], how: Client) -> String {
        let mut c = TcpStream::connect(("127.0.0.1", relay.port())).unwrap();
        c.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
        let _ = c.write_all(req);
        let want = parse_all(req).len();
        let mut out = Vec::new();
        if how == Client::Reads && want > 0 {
            let mut buf = [0u8; 65536];
            while parse_all(&out).len() < want {
                match c.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => out.extend_from_slice(&buf[..n]),
                }
            }
            return String::from_utf8_lossy(&out).into_owned();
        }
        if how != Client::StaysOpen {
            let _ = c.shutdown(Shutdown::Write);
        }
        let _ = c.read_to_end(&mut out);
        String::from_utf8_lossy(&out).into_owned()
    }

    const POST: &[u8] = b"POST /v1/chat/completions HTTP/1.1\r\nHost: attacker.example\r\nAuthorization: Bearer the-clients-own\r\nX-Api-Key: also-the-clients\r\nAccept-Encoding: gzip, deflate, br\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"q\":\"doc\"}";

    #[test]
    fn forwards_with_the_key_its_own_host_and_none_of_the_clients_credentials() {
        let (mport, seen) = model();
        let (r, p) = relay(true, Ok(me(mport, Some("KEY-1"))));
        let back = ask(&r, POST);
        assert!(back.starts_with("HTTP/1.1 200") && back.ends_with(WHOLE), "{back}");
        let s = seen.recv_timeout(Duration::from_secs(5)).expect("the model got the connection");
        assert_eq!(s.reqs.len(), 1);
        let (head, body) = &s.reqs[0];
        assert!(head.contains(&format!("\r\nHost: 127.0.0.1:{mport}\r\n")), "{head}");
        assert_eq!(head.matches("Authorization").count(), 1, "{head}");
        assert!(head.contains("\r\nAuthorization: Bearer KEY-1"), "{head}");
        assert!(!head.contains("attacker") && !head.contains("clients-own") && !head.contains("X-Api-Key"), "{head}");
        // an answer the relay has to read must come back uncompressed
        assert!(head.contains("\r\nAccept-Encoding: identity") && !head.contains("gzip"), "{head}");
        assert_eq!(body, b"{\"q\":\"doc\"}");
        // CONTROL: a model this app did not start is sent no key, and still none of the client's
        *lock(&p.target) = Ok(me(mport, None));
        assert!(ask(&r, POST).starts_with("HTTP/1.1 200"));
        let (head, _) = &seen.recv_timeout(Duration::from_secs(5)).unwrap().reqs[0];
        assert!(!head.contains("Authorization"), "{head}");
    }

    #[test]
    fn a_client_it_may_not_admit_is_refused_and_the_model_is_sent_nothing() {
        let (mport, seen) = model();
        let (r, p) = relay(false, Ok(me(mport, Some("KEY-2"))));
        let back = ask(&r, POST);
        assert!(back.starts_with("HTTP/1.1 403") && back.contains("is not the engine service"), "{back}");
        assert!(seen.recv_timeout(Duration::from_millis(500)).is_err(), "the model was dialled for a refused client");
        // CONTROL: the same request from an admitted client reaches the model
        p.admit.store(ANYONE, Ordering::SeqCst);
        assert!(ask(&r, POST).starts_with("HTTP/1.1 200"));
        assert_eq!(seen.recv_timeout(Duration::from_secs(5)).unwrap().reqs.len(), 1);
    }

    #[test]
    fn a_squatter_on_the_model_port_gets_a_connection_with_nothing_on_it() {
        // The stand-in listens in THIS process, but the check passed a different process: to the
        // relay this listener is a squatter that holds the port.
        let (mport, seen) = model();
        let mut checked = other();
        let t = Target { port: mport, pid: checked.id(), created: created_of(checked.id()), key: Some("KEY-3".into()) };
        let (r, _) = relay(true, Ok(t.clone()));
        let (tx, tripped) = mpsc::channel();
        let run = r.begin_run(t.clone(), None, move |why| tx.send(why.to_string()).unwrap()).unwrap();
        let back = ask(&r, POST);
        assert!(back.starts_with("HTTP/1.1 502"), "{back}");
        assert!(back.contains(&format!("answered by process {}", std::process::id())), "{back}");
        let s = seen.recv_timeout(Duration::from_secs(5)).expect("the relay's own connection");
        assert!(s.raw.is_empty(), "{} bytes reached a process that was not checked", s.raw.len());
        let why = tripped.recv_timeout(Duration::from_secs(5)).expect("the run was not tripped");
        assert!(why.contains(&format!("pid {}", t.pid)), "{why}");
        assert_eq!(run.finish().as_deref(), Some(why.as_str()));
        let _ = checked.kill();
        let _ = checked.wait();
        // CONTROL: the process that does listen, named by pid AND creation time, is forwarded to,
        // and a run against it finishes untripped
        let right = me(mport, Some("KEY-3"));
        let (r, _) = relay(true, Ok(right.clone()));
        let run = r.begin_run(right.clone(), None, |_| panic!("tripped")).unwrap();
        assert!(ask(&r, POST).starts_with("HTTP/1.1 200"));
        assert!(!seen.recv_timeout(Duration::from_secs(5)).unwrap().raw.is_empty());
        assert_eq!(run.finish(), None);
        // and the creation time is part of the name: the right pid with another creation time
        // is refused before a byte
        let stale = Target { created: right.created.wrapping_sub(1), ..right };
        assert!(connect_verified(&stale, Duration::from_secs(2)).unwrap_err().contains("has exited"));
        assert!(seen.recv_timeout(Duration::from_secs(5)).unwrap().raw.is_empty());
    }

    #[test]
    fn a_model_that_changes_mid_run_stops_the_run_before_anything_is_sent() {
        let (mport, seen) = model();
        let first = me(mport, Some("KEY-4"));
        let (r, p) = relay(true, Ok(first.clone()));
        let (tx, tripped) = mpsc::channel();
        let run = r.begin_run(first.clone(), None, move |why| tx.send(why.to_string()).unwrap()).unwrap();
        assert!(ask(&r, POST).starts_with("HTTP/1.1 200"), "CONTROL: the pinned model is reached");
        assert_eq!(seen.recv_timeout(Duration::from_secs(5)).unwrap().reqs.len(), 1);
        // the check now passes a different process on the same port
        let mut next = other();
        *lock(&p.target) = Ok(Target { pid: next.id(), created: created_of(next.id()), ..first.clone() });
        let back = ask(&r, POST);
        assert!(back.starts_with("HTTP/1.1 502") && back.contains("changed"), "{back}");
        assert!(seen.recv_timeout(Duration::from_millis(500)).is_err(), "the model port was dialled after the change");
        let why = tripped.recv_timeout(Duration::from_secs(5)).expect("the run was not tripped");
        assert!(why.contains(&format!("pid {}", first.pid)), "{why}");
        // a second run pinned to the new process, while the first is active, is refused
        let second = Target { pid: next.id(), created: created_of(next.id()), ..first.clone() };
        assert!(r.begin_run(second.clone(), None, |_| {}).err().unwrap().contains("add this document again"));
        assert_eq!(run.finish().as_deref(), Some(why.as_str()));
        // once the first run is over the pin is gone, and a run against the new process may start
        assert!(r.begin_run(second, None, |_| {}).is_ok());
        let _ = next.kill();
        let _ = next.wait();
    }

    #[test]
    fn only_the_two_requests_the_chain_makes_are_carried() {
        let (mport, seen) = model();
        let (r, _) = relay(true, Ok(me(mport, Some("KEY-5"))));
        let reqs: [&[u8]; 4] = [
            &b"GET /slots HTTP/1.1\r\nHost: x\r\n\r\n"[..],
            b"POST /slots/0?action=save HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n",
            b"POST /v1/chat/completions?x=1 HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n",
            b"GET /props HTTP/1.1\r\nHost: x\r\n\r\n",
        ];
        for req in reqs {
            let back = ask(&r, req);
            assert!(back.starts_with("HTTP/1.1 403"), "{back}");
        }
        assert!(seen.recv_timeout(Duration::from_millis(500)).is_err(), "a refused request dialled the model");
        // CONTROL: /health is carried
        assert!(ask(&r, b"GET /health HTTP/1.1\r\nHost: x\r\n\r\n").starts_with("HTTP/1.1 200"));
        assert_eq!(seen.recv_timeout(Duration::from_secs(5)).unwrap().reqs[0].0.lines().next(), Some("GET /health HTTP/1.1"));
    }

    #[test]
    fn framing_keeps_requests_apart_and_refuses_what_could_be_read_two_ways() {
        let (mport, seen) = model();
        let (r, _) = relay(true, Ok(me(mport, None)));
        // a chunked POST then a GET on one keep-alive connection: both arrive, the body whole
        let two = b"POST /v1/chat/completions HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n\
                    5;ext=1\r\nhello\r\n6\r\n world\r\n0\r\n\r\n\
                    GET /health HTTP/1.1\r\nHost: x\r\n\r\n";
        let back = ask(&r, two);
        assert_eq!(back.matches("HTTP/1.1 200").count(), 2, "{back}");
        let s = seen.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(s.reqs.len(), 2);
        assert_eq!(s.reqs[0].1, b"hello world");
        assert!(s.reqs[1].0.starts_with("GET /health"));
        // what two readers could frame differently is refused before the model is dialled
        let reqs: [&[u8]; 4] = [
            &b"POST /v1/chat/completions HTTP/1.1\r\nHost: x\r\nContent-Length: 3\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n"[..],
            b"POST /v1/chat/completions HTTP/1.1\r\nHost: x\r\nContent-Length: 3\r\nContent-Length: 4\r\n\r\nabcd",
            b"POST /v1/chat/completions HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: gzip, chunked\r\n\r\n0\r\n\r\n",
            b"POST /v1/chat/completions HTTP/1.1\r\nHost: x\r\n Folded: y\r\nContent-Length: 0\r\n\r\n",
        ];
        for req in reqs {
            let back = ask(&r, req);
            assert!(back.starts_with("HTTP/1.1 400"), "{back}");
        }
        assert!(seen.recv_timeout(Duration::from_millis(500)).is_err(), "an ambiguous request dialled the model");
    }

    /// A chat-completions call with `max_tokens`, as the chain's complete() sends it.
    fn call(max_tokens: &str) -> Vec<u8> {
        let body = format!(r#"{{"messages":[{{"role":"user","content":"Jane Roe met Tobias Grant."}}],"temperature":0,"max_tokens":{max_tokens},"stream":false}}"#);
        format!("POST /v1/chat/completions HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}", body.len()).into_bytes()
    }

    /// An extraction answer that stops after "Tob", under `finish` (None: no finish_reason).
    fn cut_answer(finish: Option<&str>) -> String {
        let f = finish.map(|f| format!(r#""finish_reason":"{f}","#)).unwrap_or_default();
        http_200(&format!(r#"{{"choices":[{{{f}"message":{{"content":"PERSON: Jane Roe\nPERSON: Tob"}}}}]}}"#))
    }

    /// `req` through a relay during a run, to a model that answers `answer`: what the client got
    /// back, and why the run was tripped (None: it was not).
    fn through_a_run(answer: String, req: &[u8]) -> (String, Option<String>) {
        through_a_run_on(model_saying(answer), req, Client::Reads)
    }

    /// The same against a stand-in given (model_then), the client half-closing or not (ask_as).
    fn through_a_run_on((mport, seen): (u16, mpsc::Receiver<Seen>), req: &[u8], how: Client) -> (String, Option<String>) {
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t, None, |_| {}).unwrap();
        let back = ask_as(&r, req, how);
        assert!(seen.recv_timeout(Duration::from_secs(10)).is_ok(), "the model was asked");
        // the answer thread trips after the client has what it will get; give it its turn
        std::thread::sleep(Duration::from_millis(100));
        (back, run.finish())
    }

    /// Owner ruling 15 (SEAM-FROZEN-LENGTH). The chain reads an answer's content and never its
    /// finish_reason, so "PERSON: Jane Roe\nPERSON: Tob" cut at 400 tokens was read as the whole
    /// list, and every name after the cut went untagged under a run that said it was complete.
    #[test]
    fn an_answer_that_did_not_finish_on_a_long_call_stops_the_run_and_is_not_forwarded() {
        for (finish, max, says) in [
            (Some("length"), "400", r#"cut off at the model's token limit (finish_reason "length") on a call allowed 400 tokens"#),
            (Some("length"), "300", "a call allowed 300 tokens"),
            (Some("content_filter"), "400", r#"finish_reason "content_filter", not "stop""#),
            (None, "400", "named no finish_reason"),
            (Some("length"), "-1", "a call that set no token limit"),
        ] {
            let (back, tripped) = through_a_run(cut_answer(finish), &call(max));
            let why = tripped.unwrap_or_else(|| panic!("{finish:?} on max_tokens {max} did not trip the run; the client got {back}"));
            assert!(why.starts_with(CUT_OFF) && why.contains(says), "{why}");
            assert!(!back.contains("Jane Roe") && !back.contains("HTTP/1.1 200"), "a cut answer reached the chain: {back}");
        }
        // CONTROL: the same call answered whole is forwarded and trips nothing
        let (back, tripped) = through_a_run(http_200(WHOLE), &call("400"));
        assert!(tripped.is_none() && back.starts_with("HTTP/1.1 200") && back.ends_with(WHOLE), "{tripped:?} {back}");
        // CONTROL: a 4-token YES/NO probe that ends on "length" is forwarded as it stands (the
        // ruling holds the probes until a live run measures them), and so is a 299-token call
        for max in ["4", "6", "299"] {
            let (back, tripped) = through_a_run(cut_answer(Some("length")), &call(max));
            assert!(tripped.is_none() && back.starts_with("HTTP/1.1 200") && back.contains("PERSON: Tob"), "max_tokens {max}: {tripped:?} {back}");
        }
    }

    /// The other ways an answer can come back on a long call: chunked (read through its framing,
    /// and forwarded whole when whole), compressed (not read, so not whole), not JSON, and an HTTP
    /// error. This test held an HTTP 500 forwarded untripped, on the word that the stage writes no
    /// output; the residue and LQ sweeps count the throw and write the document without that
    /// call's findings (wf7 S-teeth-7-1).
    #[test]
    fn a_long_calls_answer_is_read_through_its_framing() {
        let chunked = |body: &str| {
            let (a, b) = body.split_at(body.len() / 2);
            format!("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n{a}\r\n{:x}\r\n{b}\r\n0\r\n\r\n", a.len(), b.len())
        };
        // the answer goes on as the model framed it, byte for byte: the decode is only for the check
        let (back, tripped) = through_a_run(chunked(WHOLE), &call("400"));
        assert!(tripped.is_none() && back == chunked(WHOLE), "{tripped:?} {back}");
        let cut = r#"{"choices":[{"finish_reason":"length","message":{"content":"PERSON: Tob"}}]}"#;
        let (_, tripped) = through_a_run(chunked(cut), &call("400"));
        assert!(tripped.is_some_and(|w| w.contains(r#"finish_reason "length""#)), "a chunked cut answer was read as whole");
        let gz = format!("HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: {}\r\n\r\n{WHOLE}", WHOLE.len());
        let (_, tripped) = through_a_run(gz, &call("400"));
        assert!(tripped.is_some_and(|w| w.contains("content-encoding \"gzip\"")), "a compressed answer was read as whole");
        let notjson = "HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nboom".to_string();
        let (back, tripped) = through_a_run(notjson.clone(), &call("400"));
        assert!(tripped.is_some_and(|w| w.starts_with(CUT_OFF) && w.contains("not JSON")) && !back.contains("boom"), "a 200 that is not JSON was read as whole: {back}");
        let err = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 4\r\n\r\nboom".to_string();
        let (back, tripped) = through_a_run(err.clone(), &call("300"));
        assert!(
            tripped.as_deref().is_some_and(|w| w.starts_with(CUT_OFF) && w.contains("answered HTTP 500") && w.contains("a call allowed 300 tokens")) && !back.contains("boom"),
            "an HTTP error on a residue call went to the chain untripped: {tripped:?} {back}"
        );
        // CONTROL: the same 500 to GET /health is forwarded and trips nothing (a model still
        // loading answers 503 there, and a stage that cannot read it stops itself); the same
        // non-JSON 200 to a 4-token probe is forwarded, its content unread (ruling 15)
        let (back, tripped) = through_a_run(err, b"GET /health HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(tripped.is_none() && back.starts_with("HTTP/1.1 500") && back.ends_with("boom"), "{tripped:?} {back}");
        let (back, tripped) = through_a_run(notjson, &call("4"));
        assert!(tripped.is_none() && back.ends_with("boom"), "{tripped:?} {back}");
    }

    /// A call that gets no whole answer at all, on any path the chain can lose it by. Every sweep
    /// after the substrate catches the failure, counts it and writes the document without it, and
    /// apply-v2 goes on while /health is ok: measured on the real stages against a stand-in, a
    /// name only the residue call found and a given name only the 4-token FS7a probe confirmed
    /// each came back readable under a v1-legal-frozen run with no error (wf7 S6-F1, S6-F2).
    #[test]
    fn a_call_that_gets_no_whole_answer_stops_the_run() {
        let short = |status: &str| {
            let body = r#"{"choices":[{"finish_reason":"stop","message":{"content":"NAME: Tobias Grant"}}]}"#;
            format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\n\r\n{}", body.len(), &body[..20])
        };
        let empty = http_200(r#"{"choices":[{"finish_reason":"stop","message":{"content":"  "}}]}"#);
        let health = b"GET /health HTTP/1.1\r\nHost: x\r\n\r\n".to_vec();
        let now = Duration::ZERO;
        for (name, stand_in, req, says) in [
            ("a probe answered HTTP 500", model_saying("HTTP/1.1 500 Internal Server Error\r\nContent-Length: 4\r\n\r\nboom".into()), call("4"), "the model server answered HTTP 500, so the stage had no answer to read, on a call allowed 4 tokens"),
            ("a probe answered HTTP 503", model_saying("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n".into()), call("6"), "the model server answered HTTP 503"),
            ("a residue answer that broke off", model_then(short("200 OK"), now, true), call("300"), "it broke off before it was whole"),
            ("a probe answer that broke off", model_then(short("200 OK"), now, true), call("4"), "it broke off before it was whole"),
            ("\"stop\" with no text", model_saying(empty), call("300"), r#"it ended on "stop" with no answer text, on a call allowed 300 tokens"#),
            ("the model server closed without answering", model_then(String::new(), now, true), call("400"), "the model server closed the connection with 1 of the pipeline's calls unanswered"),
            ("the probe's server closed without answering", model_then(String::new(), now, true), call("4"), "the model server closed the connection with 1 of the pipeline's calls unanswered"),
        ] {
            let (back, tripped) = through_a_run_on(stand_in, &req, Client::StaysOpen);
            let why = tripped.unwrap_or_else(|| panic!("{name}: the run was not tripped; the chain got {back:?}"));
            // the reason itself, not only a trip: an answer that broke off is also a call left
            // unanswered, which trips on its own (Calls), in words that say less about what happened
            assert!(why.starts_with(&format!("{CUT_OFF} — {says}")), "{name}: {why}");
            // a probe's head is passed on as it comes, so only the answer's text is looked for
            assert!(!back.contains("Tobias") && !back.contains("\"content\""), "{name}: the chain was handed an answer: {back:?}");
        }
        // CONTROL: the same broken and unanswered shapes on GET /health trip nothing, so the
        // trips above are about a call being lost and not about any connection that ends badly
        for (name, stand_in) in [("a broken health answer", model_then(short("200 OK"), now, true)), ("a health check never answered", model_then(String::new(), now, true))] {
            let (back, tripped) = through_a_run_on(stand_in, &health, Client::StaysOpen);
            assert!(tripped.is_none(), "{name} tripped the run: {tripped:?} {back:?}");
        }
        // CONTROL: a whole answer to the same probe on a connection the client keeps open trips
        // nothing
        let (back, tripped) = through_a_run_on(model_then(http_200(WHOLE), now, true), &call("4"), Client::StaysOpen);
        assert!(tripped.is_none() && back.ends_with(WHOLE), "{tripped:?} {back:?}");
    }

    /// The chain reset its end while the answer was on its way (a process killed, a socket
    /// destroyed): the answer arrives inside HANG_UP_GRACE and cannot be written. The call is
    /// lost, and the reason says it could not be passed on.
    #[test]
    fn an_answer_that_cannot_be_passed_on_stops_the_run() {
        use std::os::windows::io::AsRawSocket;
        use windows::Win32::Networking::WinSock::{setsockopt, LINGER, SOCKET, SOL_SOCKET, SO_LINGER};
        let reset_after = |r: &Relay, req: &[u8]| {
            let mut c = TcpStream::connect(("127.0.0.1", r.port())).unwrap();
            c.write_all(req).unwrap();
            std::thread::sleep(Duration::from_millis(120)); // past admission (up to 50 ms of owner lookups) and the request going upstream
            let l = LINGER { l_onoff: 1, l_linger: 0 };
            // SAFETY: a live socket owned by `c`; the bytes are the LINGER struct SO_LINGER reads
            let rc = unsafe {
                let b = std::slice::from_raw_parts(&l as *const LINGER as *const u8, std::mem::size_of::<LINGER>());
                setsockopt(SOCKET(c.as_raw_socket() as usize), SOL_SOCKET, SO_LINGER, Some(b))
            };
            assert_eq!(rc, 0, "SO_LINGER");
            drop(c); // closed with linger 0: a reset
        };
        let health = b"GET /health HTTP/1.1\r\nHost: x\r\n\r\n".to_vec();
        for (req, trips) in [(call("400"), true), (call("4"), true), (health, false)] {
            let (mport, seen) = model_then(http_200(WHOLE), Duration::from_millis(300), false);
            let t = me(mport, None);
            let (r, _) = relay(true, Ok(t.clone()));
            let run = r.begin_run(t, None, |_| {}).unwrap();
            reset_after(&r, &req);
            assert!(seen.recv_timeout(Duration::from_secs(10)).is_ok(), "the model was asked");
            std::thread::sleep(Duration::from_millis(100));
            let tripped = run.finish();
            if trips {
                let why = tripped.unwrap_or_else(|| panic!("an answer that could not reach the chain did not trip the run"));
                assert!(why.starts_with(&format!("{CUT_OFF} — {UNPASSED}")), "{why}");
            } else {
                // CONTROL: the same reset during a health check is no lost call
                assert!(tripped.is_none(), "{tripped:?}");
            }
        }
    }

    /// The chain gives up on a call at 45 s (makeComplete's AbortSignal.timeout) and counts it
    /// failed. A relay that went on passing the answer along wrote it into a closed socket, and
    /// a first write there succeeds, so nothing on the answer side saw the loss.
    #[test]
    fn a_pipeline_that_hangs_up_on_an_open_call_stops_the_run() {
        // 700 ms: past HANG_UP_GRACE, and near enough that a grace grown past 700 ms fails here
        // (at 1500 ms a grace of 1400 ms passed this whole suite, wf7 S3R-3)
        let slow = |answer: String| model_then(answer, Duration::from_millis(700), false);
        let (back, tripped) = through_a_run_on(slow(http_200(WHOLE)), &call("400"), Client::HangsUp);
        let why = tripped.unwrap_or_else(|| panic!("a call the pipeline hung up on did not trip the run: {back:?}"));
        assert!(why.starts_with(CUT_OFF) && why.contains("hung up before the answer to one of its calls reached it"), "{why}");
        let (_, tripped) = through_a_run_on(slow(http_200(WHOLE)), &call("4"), Client::HangsUp);
        assert!(tripped.is_some(), "a probe the pipeline hung up on did not trip the run");
        // CONTROL: the same hang-up with an answer that comes inside HANG_UP_GRACE is an answer
        // delivered (the chain read it and closed), and a hang-up during a slow health check is
        // not a lost call
        let (back, tripped) = through_a_run_on(model_then(http_200(WHOLE), Duration::from_millis(50), false), &call("400"), Client::HangsUp);
        assert!(tripped.is_none() && back.ends_with(WHOLE), "{tripped:?} {back:?}");
        let (_, tripped) = through_a_run_on(slow(http_200(r#"{"status":"ok"}"#)), b"GET /health HTTP/1.1\r\nHost: x\r\n\r\n", Client::HangsUp);
        assert!(tripped.is_none(), "{tripped:?}");
        // a hang-up inside the call's own body: the model is sent none of it, and the run stops
        let mut partial = call("400");
        partial.truncate(partial.len() - 10);
        let (mport, seen) = model();
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t, None, |_| {}).unwrap();
        ask(&r, &partial);
        assert!(seen.recv_timeout(Duration::from_secs(5)).unwrap().raw.is_empty(), "part of a call reached the model");
        let why = run.finish().unwrap_or_else(|| panic!("a call the pipeline hung up on mid-body did not trip the run"));
        assert!(why.starts_with(&format!("{CUT_OFF} — the pipeline hung up partway through sending one of its calls")), "{why}");
    }

    /// On one keep-alive connection each answer is read by its own request's rule: a probe's cut
    /// answer passes and the long call after it, answered whole, passes too; the other way round,
    /// the long call's cut answer trips the run although the probe before it was fine.
    #[test]
    fn each_answer_on_a_connection_is_read_by_its_own_calls_rule() {
        let two = |a: &[u8], b: &[u8]| [a, b].concat();
        let (back, tripped) = through_a_run(cut_answer(Some("length")), &two(&call("4"), &call("4")));
        assert!(tripped.is_none() && back.matches("HTTP/1.1 200").count() == 2, "{tripped:?} {back}");
        let (back, tripped) = through_a_run(cut_answer(Some("length")), &two(&call("4"), &call("400")));
        assert!(tripped.is_some() && back.matches("HTTP/1.1 200").count() == 1, "the probe's answer is forwarded and the long call's is not: {tripped:?} {back}");
        // the rule is read from the body the model is sent, so which call is long does not
        // depend on where the relay's reads fall
        assert_eq!(answer_rule(&Req { method: "POST".into(), target: "/v1/chat/completions".into(), version: "HTTP/1.1".into(), headers: vec![] }, br#"{"max_tokens":4,"n_predict":512}"#), Answer::Whole(Some(512)), "two limits: the larger");
        assert_eq!(answer_rule(&Req { method: "GET".into(), target: "/health".into(), version: "HTTP/1.1".into(), headers: vec![] }, b""), Answer::Pass);
        let chat = Req { method: "POST".into(), target: "/v1/chat/completions".into(), version: "HTTP/1.1".into(), headers: vec![] };
        assert_eq!(answer_rule(&chat, br#"{"max_tokens":4}"#), Answer::Probe(4), "a short check is a call whose loss trips, read as it comes");
    }

    /// A stand-in that says on `got` when each request has arrived whole, writes `head` at once
    /// and `body` `delay` later: a model still working after the chain has what it will read.
    fn model_signalling(head: String, body: String, delay: Duration) -> (u16, mpsc::Receiver<()>) {
        let l = scratch_listener();
        let port = l.local_addr().unwrap().port();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for c in l.incoming() {
                let Ok(mut c) = c else { break };
                let (tx, head, body) = (tx.clone(), head.clone(), body.clone());
                std::thread::spawn(move || {
                    let _ = c.set_read_timeout(Some(Duration::from_secs(10)));
                    let (mut raw, mut answered, mut buf) = (Vec::new(), 0, [0u8; 65536]);
                    loop {
                        match c.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => raw.extend_from_slice(&buf[..n]),
                        }
                        while answered < parse_all(&raw).len() {
                            let _ = tx.send(());
                            let _ = c.write_all(head.as_bytes());
                            std::thread::sleep(delay);
                            let _ = c.write_all(body.as_bytes());
                            answered += 1;
                        }
                    }
                });
            }
        });
        (port, rx)
    }

    /// A client on `port` that has sent `req` and keeps its end open, as the chain's fetch does.
    fn dial(port: u16, req: &[u8]) -> TcpStream {
        let mut c = TcpStream::connect(("127.0.0.1", port)).unwrap();
        c.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
        c.write_all(req).unwrap();
        c
    }

    /// A run the app stopped reading (its stream read failed) with a call still open: no result
    /// was read, so nothing is tripped and nothing waits, and the call, cut after the run ended,
    /// lands on no run. The words finish() gives this shape say the result "arrived".
    #[test]
    fn a_run_whose_stream_the_app_never_read_is_not_tripped_for_its_open_call() {
        let (mport, got) = model_signalling(String::new(), http_200(WHOLE), Duration::from_millis(3000));
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t.clone(), None, |_| panic!("the adapter was stopped for a run whose result nobody read")).unwrap();
        let c = dial(run.port(), &call("4"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        let t0 = std::time::Instant::now();
        assert_eq!(run.finish_unread(), None);
        assert!(t0.elapsed() < Duration::from_millis(200), "it waited {:?} for calls nobody will read", t0.elapsed());
        drop(c);
        // CONTROL: the same shape read as a result trips, in ruling 20's words
        let run = r.begin_run(t.clone(), None, |_| {}).unwrap();
        let c = dial(run.port(), &call("4"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        assert_eq!(run.finish(), Some(format!("{CUT_OFF} — 1 of its calls to the model still had no answer when the pipeline's result for the document arrived")));
        drop(c);
        // and a trip recorded before the read failed is still returned
        let (tx, tripped) = mpsc::channel();
        let run = r.begin_run(t.clone(), None, move |why| tx.send(why.to_string()).unwrap()).unwrap();
        run.tripper()("the model server changed".to_string());
        let why = tripped.recv_timeout(Duration::from_secs(5)).expect("the run was tripped");
        assert_eq!(run.finish_unread().as_deref(), Some(why.as_str()));
    }

    /// Owner ruling 20 (wf7 S3R-1). The chain gives up on a call at 45 s, writes the document
    /// without it and ends the stream; the relay reads the hang-up as a lost call HANG_UP_GRACE
    /// later. finish() read at once answered None: measured end to end on the real stages, the
    /// frozen result was used with a health condition LQ1 was there to find left readable, and the
    /// trip landed on the next document.
    #[test]
    fn a_documents_result_is_read_only_when_none_of_its_calls_is_open() {
        let late = |ms: u64| model_signalling(String::new(), http_200(WHOLE), Duration::from_millis(ms));
        let (mport, got) = late(3000);
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        // the client closed with its call open and finish() called the same moment
        let run = r.begin_run(t.clone(), None, |_| {}).unwrap();
        let c = dial(run.port(), &call("400"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        drop(c);
        let why = run.finish().unwrap_or_else(|| panic!("a result read while its last call was open was used"));
        assert!(why.starts_with(&format!("{CUT_OFF} — the pipeline hung up before the answer to one of its calls reached it")), "{why}");
        // a call still open when the bound runs out trips the run in words of its own
        let run = r.begin_run(t.clone(), None, |_| {}).unwrap();
        let c = dial(run.port(), &call("4"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        let t0 = std::time::Instant::now();
        let why = run.finish();
        let waited = t0.elapsed();
        assert_eq!(why, Some(format!("{CUT_OFF} — 1 of its calls to the model still had no answer when the pipeline's result for the document arrived")));
        // the bound is twice the grace: measured 1003-1008 ms, so 200 ms of slack for a loaded
        // machine; at 500 ms a bound grown to 1.4 s passed (wf8 S7T-5)
        assert!(waited >= HANG_UP_GRACE * 2 - Duration::from_millis(50) && waited < HANG_UP_GRACE * 2 + Duration::from_millis(200), "waited {waited:?}");
        drop(c);
        // CONTROL: a call answered inside the wait is a call delivered, and finish waited for it
        let (mport, got) = late(300);
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t, None, |_| {}).unwrap();
        let mut c = dial(run.port(), &call("400"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        let t0 = std::time::Instant::now();
        assert_eq!(run.finish(), None);
        assert!(t0.elapsed() >= Duration::from_millis(200), "finish did not wait for the open call: {:?}", t0.elapsed());
        let mut back = vec![0u8; 4096];
        let n = c.read(&mut back).unwrap();
        assert!(String::from_utf8_lossy(&back[..n]).ends_with(WHOLE));
    }

    /// Each document's calls come on its own run's port, so one document's open call neither
    /// holds another's finish nor trips it: a cut that landed on every active run tripped the
    /// next document for the last one's lost call (wf7 S3R-1).
    #[test]
    fn a_call_open_on_one_documents_run_neither_holds_nor_trips_another() {
        let boom = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 4\r\n\r\nboom".to_string();
        let (mport, got) = model_signalling(String::new(), boom, Duration::from_millis(1800));
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let tripper = || {
            let (tx, rx) = mpsc::channel::<String>();
            (move |why: &str| drop(tx.send(why.to_string())), rx)
        };
        let a = r.begin_run(t.clone(), None, |_| {}).unwrap();
        let (on_b, b_tripped) = tripper();
        let b = r.begin_run(t.clone(), None, on_b).unwrap();
        let a_port = a.port();
        assert_ne!(a_port, b.port());
        let c = dial(a_port, &call("400"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        let t0 = std::time::Instant::now();
        assert_eq!(b.finish(), None);
        assert!(t0.elapsed() < Duration::from_millis(200), "a's open call held b's finish for {:?}", t0.elapsed());
        assert!(a.finish().is_some(), "a's result was read with its call open");
        // the next document starts while a's call is still open; the model then fails it, and the
        // cut is a's
        let (on_next, next_tripped) = tripper();
        let next = r.begin_run(t.clone(), None, on_next).unwrap();
        std::thread::sleep(Duration::from_millis(1800 + 400).saturating_sub(t0.elapsed()));
        assert!(next_tripped.try_recv().is_err() && b_tripped.try_recv().is_err(), "a's lost call tripped another document");
        assert_eq!(next.finish(), None);
        drop(c);
        // a's port is closed with its run: a stage still dialling it is never forwarded
        let late = TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], a_port)), Duration::from_secs(3));
        assert!(late.is_err(), "a finished run's port still takes connections");
    }

    /// Two cuts round 6 added that no test held (wf7 S3R-3, mutants NEW1 and NEW2): each one lost
    /// leaves a failed call counted and the frozen result used (wf7 S6-F1).
    #[test]
    fn a_call_the_model_server_can_no_longer_answer_stops_the_run() {
        // the model answers one call and closes; the chain then sends another on the same connection
        let (mport, seen) = model_then(http_200(WHOLE), Duration::ZERO, true);
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t, None, |_| {}).unwrap();
        let mut c = dial(run.port(), &call("4"));
        let mut first = Vec::new();
        // the relay ends its side once the answer thread has stopped: the second call comes after
        let _ = c.read_to_end(&mut first);
        assert!(String::from_utf8_lossy(&first).ends_with(WHOLE), "CONTROL: the first call was answered");
        let _ = c.write_all(&call("400"));
        assert!(seen.recv_timeout(Duration::from_secs(5)).is_ok());
        std::thread::sleep(Duration::from_millis(100));
        let why = run.finish().unwrap_or_else(|| panic!("a call sent after the model server closed did not trip the run"));
        assert_eq!(why, format!("{CUT_OFF} — the model server had closed the connection before a call allowed 400 tokens could be sent"));
        drop(c);
        // an answer head that cannot be read, with the call open
        let (back, tripped) = through_a_run_on(model_saying("HTTP/1.1 2x0 OK\r\n\r\n".into()), &call("400"), Client::StaysOpen);
        let why = tripped.unwrap_or_else(|| panic!("a malformed answer head with a call open did not trip the run: {back:?}"));
        assert_eq!(why, format!("{CUT_OFF} — the connection to the model server broke with 1 of the pipeline's calls unanswered (the model server sent a malformed status line)"));
        // CONTROL: the same malformed head to GET /health is no lost call
        let (_, tripped) = through_a_run_on(model_saying("HTTP/1.1 2x0 OK\r\n\r\n".into()), b"GET /health HTTP/1.1\r\nHost: x\r\n\r\n", Client::StaysOpen);
        assert!(tripped.is_none(), "{tripped:?}");
    }

    /// A probe's answer is passed on as it comes, so its head can reach the chain and its body
    /// then fail to: the chain had hung up. That is the pipeline's side, and the reason says so;
    /// it said "it broke off before it was whole", which sends the lawyer to a model log that
    /// shows a complete answer (wf7 S3R-4). The model's side breaking off keeps its own words.
    #[test]
    fn an_answer_the_chain_hung_up_on_is_not_called_the_models_breaking_off() {
        use std::os::windows::io::AsRawSocket;
        use windows::Win32::Networking::WinSock::{setsockopt, LINGER, SOCKET, SOL_SOCKET, SO_LINGER};
        let head = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n", WHOLE.len());
        let (mport, got) = model_signalling(head, WHOLE.to_string(), Duration::from_millis(250));
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t, None, |_| {}).unwrap();
        let mut c = dial(run.port(), &call("4"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        let mut back = Vec::new();
        let mut buf = [0u8; 1024];
        while !back.windows(4).any(|w| w == b"\r\n\r\n") {
            let n = c.read(&mut buf).unwrap();
            assert!(n > 0, "the head never came");
            back.extend_from_slice(&buf[..n]);
        }
        let l = LINGER { l_onoff: 1, l_linger: 0 };
        // SAFETY: a live socket owned by `c`; the bytes are the LINGER struct SO_LINGER reads
        let rc = unsafe {
            let b = std::slice::from_raw_parts(&l as *const LINGER as *const u8, std::mem::size_of::<LINGER>());
            setsockopt(SOCKET(c.as_raw_socket() as usize), SOL_SOCKET, SO_LINGER, Some(b))
        };
        assert_eq!(rc, 0, "SO_LINGER");
        drop(c); // a reset, after the head and before the body
        let why = run.finish().unwrap_or_else(|| panic!("a probe answer that could not reach the chain did not trip the run"));
        assert!(why.starts_with(&format!("{CUT_OFF} — {UNPASSED}")) && why.ends_with(", on a call allowed 4 tokens"), "{why}");
        assert!(!why.contains("broke off"), "{why}");
    }

    /// Close `c` with linger 0: a reset, as a killed process or a destroyed socket leaves it.
    fn reset(c: TcpStream) {
        use std::os::windows::io::AsRawSocket;
        use windows::Win32::Networking::WinSock::{setsockopt, LINGER, SOCKET, SOL_SOCKET, SO_LINGER};
        let l = LINGER { l_onoff: 1, l_linger: 0 };
        // SAFETY: a live socket owned by `c`; the bytes are the LINGER struct SO_LINGER reads
        let rc = unsafe {
            let b = std::slice::from_raw_parts(&l as *const LINGER as *const u8, std::mem::size_of::<LINGER>());
            setsockopt(SOCKET(c.as_raw_socket() as usize), SOL_SOCKET, SO_LINGER, Some(b))
        };
        assert_eq!(rc, 0, "SO_LINGER");
        drop(c);
    }

    /// Read from `c` until `bytes` have come or the head is whole (`bytes` 0).
    fn read_until(c: &mut TcpStream, bytes: usize) -> Vec<u8> {
        let (mut back, mut buf) = (Vec::new(), [0u8; 1024]);
        while if bytes == 0 { !back.windows(4).any(|w| w == b"\r\n\r\n") } else { back.len() < bytes } {
            let n = c.read(&mut buf).unwrap();
            assert!(n > 0, "the connection closed after {} bytes", back.len());
            back.extend_from_slice(&buf[..n]);
        }
        back
    }

    /// The chain's 45 s abort can land between a probe answer's head and its body: undici closes
    /// the socket gracefully, a first write into it succeeds, and the call was counted delivered
    /// with the run untripped although the chain had counted it failed (wf8 S7A-4). The reason
    /// names the chain's limit and not only the socket's error (wf8 S7A-2).
    #[test]
    fn an_answer_the_chain_was_receiving_when_it_hung_up_is_a_lost_call() {
        let head = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n", WHOLE.len());
        let (mport, got) = model_signalling(head.clone(), WHOLE.to_string(), Duration::from_millis(250));
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t.clone(), None, |_| {}).unwrap();
        let mut c = dial(run.port(), &call("4"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        read_until(&mut c, 0);
        drop(c); // graceful: nothing unread, so a FIN and not a reset
        let why = run.finish();
        let refused = format!("{CUT_OFF} — {UNPASSED}the relay had seen it close its end), on a call allowed 4 tokens");
        assert_eq!(why.as_deref(), Some(refused.as_str()));
        // A keep-alive connection that has carried a whole answer, whose next call the chain
        // gives up on before any of its answer comes: nothing more is written to it. Left to the
        // writes, this read as a bare socket error, or not at all when the answer is one write.
        let (lport, later) = model_signalling(String::new(), http_200(WHOLE), Duration::from_millis(250));
        let lt = me(lport, None);
        let (lr, _) = relay(true, Ok(lt.clone()));
        let run = lr.begin_run(lt, None, |_| {}).unwrap();
        let mut c = dial(run.port(), &call("4"));
        later.recv_timeout(Duration::from_secs(5)).expect("the model has the first call");
        read_until(&mut c, http_200(WHOLE).len());
        c.write_all(&call("4")).unwrap();
        later.recv_timeout(Duration::from_secs(5)).expect("the model has the second call");
        drop(c); // graceful: nothing of the second answer has come
        assert_eq!(run.finish().as_deref(), Some(refused.as_str()));
        // CONTROL: the chain reads the whole answer, then closes, before the relay has taken the
        // call's count down: a call delivered
        let run = r.begin_run(t, None, |_| {}).unwrap();
        let mut c = dial(run.port(), &call("4"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        let back = read_until(&mut c, head.len() + WHOLE.len());
        drop(c);
        assert_eq!(run.finish(), None);
        assert!(String::from_utf8_lossy(&back).ends_with(WHOLE));
    }

    /// An interim head (100 Continue) that cannot be written to the chain because it has hung up
    /// is its call lost on the chain's side; it read "the connection to the model server broke",
    /// which sends the lawyer to a model log that shows nothing wrong (wf8 S7A-3).
    #[test]
    fn an_interim_head_the_chain_could_not_be_sent_is_not_the_model_servers_breaking() {
        let answer = format!("HTTP/1.1 100 Continue\r\n\r\n{}", http_200(WHOLE));
        for (req, trips) in [(call("400"), true), (b"GET /health HTTP/1.1\r\nHost: x\r\n\r\n".to_vec(), false)] {
            let (mport, got) = model_signalling(String::new(), answer.clone(), Duration::from_millis(250));
            let t = me(mport, None);
            let (r, _) = relay(true, Ok(t.clone()));
            let run = r.begin_run(t, None, |_| {}).unwrap();
            let c = dial(run.port(), &req);
            got.recv_timeout(Duration::from_secs(5)).expect("the model has the request");
            reset(c);
            let why = run.finish();
            if trips {
                let why = why.unwrap_or_else(|| panic!("a call whose interim head could not reach the chain did not trip the run"));
                assert!(why.starts_with(&format!("{CUT_OFF} — {UNPASSED}")) && !why.contains("model server broke"), "{why}");
            } else {
                // CONTROL: the same on a health check is no lost call
                assert!(why.is_none(), "{why:?}");
            }
        }
    }

    /// The chunked path writes its framing to the chain itself (copy_body), apart from the Tee:
    /// a chunked probe answer the chain hung up on read "it broke off before it was whole" with
    /// that write's error mapped back to the model's side, and every test stayed green (wf8
    /// S7T-3). llama-server frames its answers with Content-Length; a proxy in between may not.
    #[test]
    fn a_chunked_answer_the_chain_hung_up_on_is_not_called_the_models_breaking_off() {
        let head = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n".to_string();
        let (mport, got) = model_signalling(head, format!("{:x}\r\n{WHOLE}\r\n0\r\n\r\n", WHOLE.len()), Duration::from_millis(250));
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t, None, |_| {}).unwrap();
        let mut c = dial(run.port(), &call("4"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        read_until(&mut c, 0);
        reset(c);
        let why = run.finish().unwrap_or_else(|| panic!("a chunked probe answer that could not reach the chain did not trip the run"));
        assert!(why.starts_with(&format!("{CUT_OFF} — {UNPASSED}")) && why.ends_with(", on a call allowed 4 tokens") && !why.contains("broke off"), "{why}");
    }

    /// A call is open from its head, not only once its body is in and it is queued: the chain
    /// can end its stream with a call's body still arriving, and a finish that read the verdict
    /// then answered None with every test green (wf8 S7T-1).
    #[test]
    fn a_call_whose_body_is_still_arriving_holds_the_finish() {
        let (mport, _got) = model_signalling(String::new(), http_200(WHOLE), Duration::ZERO);
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t, None, |_| {}).unwrap();
        let mut partial = call("400");
        partial.truncate(partial.len() - 10);
        let c = dial(run.port(), &partial);
        // past admission (up to 50 ms of owner lookups), the model check and the head being read
        std::thread::sleep(Duration::from_millis(400));
        let why = run.finish();
        drop(c);
        assert_eq!(why, Some(format!("{CUT_OFF} — 1 of its calls to the model still had no answer when the pipeline's result for the document arrived")));
    }

    /// On the shared port a call counts toward every run active when it was sent, and its cut
    /// trips those runs, not the ones active when the cut comes. A cut sent to the runs active
    /// then, or calls settled before their cut is recorded (which leaves the cut with no open
    /// call to read its runs from), each tripped the next document for the last one's lost call,
    /// with every test green: on a run's own port the two are the same run (wf8 S7T-2).
    #[test]
    fn a_shared_port_cut_lands_on_the_run_its_call_was_sent_in() {
        let boom = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 4\r\n\r\nboom".to_string();
        let (mport, got) = model_signalling(String::new(), boom, Duration::from_millis(1800));
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let (tx, a_tripped) = mpsc::channel::<String>();
        let a = r.begin_run(t.clone(), None, move |why| drop(tx.send(why.to_string()))).unwrap();
        let c = dial(r.port(), &call("400"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        let t0 = std::time::Instant::now();
        assert!(a.finish().is_some(), "a's result was read with its call open");
        assert!(a_tripped.try_recv().is_ok(), "CONTROL: a's finish tripped a");
        let (tx, b_tripped) = mpsc::channel::<String>();
        let b = r.begin_run(t, None, move |why| drop(tx.send(why.to_string()))).unwrap();
        // past the model's HTTP 500 for a's call at 1.8 s
        std::thread::sleep(Duration::from_millis(1800 + 500).saturating_sub(t0.elapsed()));
        let (on_b, b_said) = (b_tripped.try_recv().ok(), b.finish());
        drop(c);
        assert!(on_b.is_none() && b_said.is_none(), "a's lost call tripped the next document: {on_b:?} {b_said:?}");
    }

    /// A finish returns when its last call settles or its run is tripped, not at the bound. Each
    /// wake-up (the settle's, the trip's, and the wait's reading of the trip) could be deleted
    /// with every test green, and every such finish then sat out the full second (wf8 S7T-4).
    #[test]
    fn a_finish_returns_when_its_call_settles_or_its_run_trips() {
        let (mport, got) = model_signalling(String::new(), http_200(WHOLE), Duration::from_millis(300));
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t, None, |_| {}).unwrap();
        let mut c = dial(run.port(), &call("400"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        let t0 = std::time::Instant::now();
        assert_eq!(run.finish(), None);
        let waited = t0.elapsed();
        let mut back = vec![0u8; 4096];
        let _ = c.read(&mut back);
        assert!(waited < Duration::from_millis(800), "finish returned {waited:?} after a call answered at about 300 ms");
        // a trip while a call is open ends the wait (model_watch.rs's tripper: the model exited)
        let (mport, got) = model_signalling(String::new(), http_200(WHOLE), Duration::from_millis(5000));
        let t = me(mport, None);
        let (r, _) = relay(true, Ok(t.clone()));
        let run = r.begin_run(t, None, |_| {}).unwrap();
        let c = dial(run.port(), &call("400"));
        got.recv_timeout(Duration::from_secs(5)).expect("the model has the call");
        let trip = run.tripper();
        let waiting = std::thread::spawn(move || run.finish());
        std::thread::sleep(Duration::from_millis(150));
        let at = std::time::Instant::now();
        trip("the model server that was checked exited".into());
        let why = waiting.join().unwrap();
        let after = at.elapsed();
        drop(c);
        assert_eq!(why.as_deref(), Some("the model server that was checked exited"));
        assert!(after < Duration::from_millis(400), "a tripped run's finish returned {after:?} after the trip");
    }

    #[test]
    fn a_hand_started_services_children_are_admitted_only_during_its_run() {
        let (mport, seen) = model();
        let (r, _) = relay(false, Ok(me(mport, None)));
        // During a live run, a process that is not a child of the run's service is refused: the
        // run's tree is another live process (ping), and the PowerShell child that dials is this
        // process's, not ping's. Without this, a tree test that admitted any process while the
        // service lived, or any process while any hand-started run was active, passed every
        // other assertion here (wf4 S-truth-4, mutations M7 and M8).
        let mut stranger_root = other();
        let root = (stranger_root.id(), created_of(stranger_root.id()));
        let run = r.begin_run(me(mport, None), Some(root), |_| panic!("tripped")).unwrap();
        let back = child_asks(r.port());
        assert_eq!(run.finish(), None);
        let _ = stranger_root.kill();
        let _ = stranger_root.wait();
        assert!(back.starts_with("HTTP/1.1 403"), "a process outside the run's tree was admitted: {back}");
        assert!(seen.recv_timeout(Duration::from_millis(500)).is_err(), "the model was dialled for it");
        // the service's own direct child, during its run, is admitted
        let me_ = std::process::id();
        let run = r.begin_run(me(mport, None), Some((me_, created_of(me_))), |_| panic!("tripped")).unwrap();
        assert_eq!(child_asks(r.port()), "HTTP/1.1 200 OK");
        assert_eq!(seen.recv_timeout(Duration::from_secs(5)).unwrap().reqs.len(), 1);
        assert_eq!(run.finish(), None);
        // CONTROL: the same child after the run is over is refused, and the model is not dialled
        assert!(child_asks(r.port()).starts_with("HTTP/1.1 403"));
        assert!(seen.recv_timeout(Duration::from_millis(500)).is_err());
    }

    /// in_tree itself, on live processes: the root, its direct children created after it, and
    /// nothing else.
    #[test]
    fn a_tree_is_its_root_and_the_roots_direct_children() {
        let me_ = std::process::id();
        let mine = (me_, created_of(me_));
        let mut child = other();
        let mut unrelated = other();
        let c = child.id();
        let verdicts = (
            in_tree(me_, mine),
            in_tree(c, mine),
            in_tree(c, (unrelated.id(), created_of(unrelated.id()))),
            in_tree(c, (me_, mine.1.wrapping_add(1))),
        );
        for p in [&mut child, &mut unrelated] {
            let _ = p.kill();
            let _ = p.wait();
        }
        assert!(verdicts.0, "the root is in its own tree");
        assert!(verdicts.1, "a direct child created after the root is in it");
        assert!(!verdicts.2, "a live process is not in the tree of a root that is not its parent");
        assert!(!verdicts.3, "a root whose creation time does not match is no longer that root, and admits nothing");
    }

    /// Admission asks who owns the CLIENT's end of the connection. In every other test the client
    /// and the relay are one process, so asking about the relay's own end gave the same answer
    /// and passed (wf4 S-truth-5, mutation M4); here the client is a child.
    #[test]
    fn admission_names_the_process_at_the_clients_end_not_the_relays() {
        let (mport, seen) = model();
        let (r, p) = relay(false, Ok(me(mport, None)));
        p.admit.store(MY_CHILDREN, Ordering::SeqCst);
        assert_eq!(child_asks(r.port()), "HTTP/1.1 200 OK", "the child is the client, and the policy admits it");
        assert_eq!(seen.recv_timeout(Duration::from_secs(5)).unwrap().reqs.len(), 1);
        // CONTROL: a policy that admits only this process (the relay's own end) refuses the child
        p.admit.store(ONLY_ME, Ordering::SeqCst);
        assert!(child_asks(r.port()).starts_with("HTTP/1.1 403"));
        assert!(seen.recv_timeout(Duration::from_millis(500)).is_err(), "the model was dialled for a refused client");
    }

    /// connect_verified asks who owns the SERVER end of its connection. With the stand-in model in
    /// this process, asking about its own end named the same process and passed (wf4 S-truth-5,
    /// mutation M3); here the model's listener is a child's. `answering` asks the same question
    /// without a target.
    #[test]
    fn the_model_end_is_named_by_the_process_that_accepted_it() {
        let port = scratch_port();
        let mut child = child_listener("127.0.0.1", port);
        let c = child.id();
        let theirs = Target { port, pid: c, created: created_of(c), key: None };
        let me_ = std::process::id();
        let mine = Target { pid: me_, created: created_of(me_), ..theirs.clone() };
        let (ok, refused, asked) =
            (connect_verified(&theirs, Duration::from_secs(2)), connect_verified(&mine, Duration::from_secs(2)), answering(port, Duration::from_secs(4)));
        let _ = child.kill();
        let _ = child.wait();
        assert!(ok.is_ok(), "the child that accepted was refused: {:?}", ok.err());
        let why = refused.expect_err("a target naming this process was accepted on a connection the child accepted");
        assert!(why.contains(&format!("answered by process {c}")), "{why}");
        assert_eq!(asked, Ok(Some(c)), "answering on port {port} did not name the child (pid {c})");
        // CONTROL: once the child is gone nothing accepts there, and `answering` says so. This
        // test failed once in about 70 suite runs with other suites running on the machine, and
        // neither which assert failed nor what it read was recorded (wf8 S7T-7). Each now says
        // what it read, and this one looks a second time, 200 ms later, before it fails.
        let gone = match answering(port, Duration::from_secs(4)) {
            Ok(None) => Ok(None),
            first => {
                eprintln!("the_model_end_is_named_by_the_process_that_accepted_it: port {port} after child {c} exited read {first:?}; asking again");
                std::thread::sleep(Duration::from_millis(200));
                answering(port, Duration::from_secs(4))
            }
        };
        assert_eq!(gone, Ok(None), "port {port} still answered after child {c} exited");
    }

    /// Every answer the kernel can give about the far end, and only one lets text go. The two
    /// edge arms (no row for the connection; the table unreadable) have no live-socket test that
    /// reaches them, and either could be turned into an acceptance with every test green (wf5
    /// S-teeth-3). The first three arms are also driven on live sockets above, which is the
    /// CONTROL that this function is what connect_verified decides by.
    #[test]
    fn only_the_checked_process_at_the_far_end_lets_text_go() {
        let t = Target { port: 49400, pid: 6, created: 60, key: None };
        let born = |p: u32| p as u64 * 10; // pid 6 was created at 60, as checked
        assert_eq!(far_end_refusal(Ok(Some(6)), &t, born), None, "the checked process, by pid and creation time");
        let why = |owner: Result<Option<u32>, String>, born: &dyn Fn(u32) -> u64| far_end_refusal(owner, &t, born).unwrap_or_else(|| "ACCEPTED".into());
        assert!(why(Ok(Some(6)), &|_| 61).contains("has exited"), "a reused pid");
        assert!(why(Ok(Some(7)), &born).contains("answered by process 7"), "another process");
        assert!(why(Ok(None), &born).contains("names no process"), "no row for the connection");
        assert!(why(Err("table unreadable".into()), &born).contains("could not be looked up (table unreadable)"), "the table could not be read");
    }

    /// The relay's port is the chain's road to the model, so a second socket on it would be the
    /// squatter this file exists to stop, moved one hop. Measured 2026-09-23 (Windows 11 26200,
    /// every pairing, recorded in the header): a same-address bind beside the relay's listener is
    /// refused with or without SO_REUSEADDR.
    #[test]
    fn no_second_socket_binds_the_relays_address() {
        use windows::Win32::Networking::WinSock::SO_REUSEADDR;
        let free = scratch_port;
        let p = free();
        let ours = exclusive_listener(p).expect("the exclusive bind");
        // The refusals below hold for a first socket that set nothing as well (the measurement in
        // the header), so on their own they pass with the option gone (wf4 S-truth-6, mutation
        // M10). The option is read back from the socket.
        assert!(exclusive(&ours), "the relay's listener does not carry SO_EXCLUSIVEADDRUSE");
        assert!(!exclusive(&raw_listener([127, 0, 0, 1], 0, None).unwrap()), "CONTROL: a plain socket reads back without it");
        let plain = raw_listener([127, 0, 0, 1], p, None);
        let reuse = raw_listener([127, 0, 0, 1], p, Some(SO_REUSEADDR));
        assert_eq!(plain.err().and_then(|e| e.raw_os_error()), Some(10048), "WSAEADDRINUSE for a plain second bind");
        assert_eq!(reuse.err().and_then(|e| e.raw_os_error()), Some(10013), "WSAEACCES for a SO_REUSEADDR second bind");
        drop(ours);
        // CONTROL: the helper can bind a second socket on one address when the first opted in to
        // sharing (the model port's case, if its server sets SO_REUSEADDR), so the refusals above
        // are the relay's listener's doing
        let q = free();
        let _shared = raw_listener([127, 0, 0, 1], q, Some(SO_REUSEADDR)).unwrap();
        assert!(raw_listener([127, 0, 0, 1], q, Some(SO_REUSEADDR)).is_ok(), "two opted-in sockets could not share");
    }

    /// SO_EXCLUSIVEADDRUSE as the socket reports it (getsockopt).
    fn exclusive(l: &TcpListener) -> bool {
        use std::os::windows::io::AsRawSocket;
        use windows::Win32::Networking::WinSock::{getsockopt, SOCKET, SOL_SOCKET, SO_EXCLUSIVEADDRUSE};
        let (mut v, mut len) = (0i32, std::mem::size_of::<i32>() as i32);
        // SAFETY: a live socket owned by `l`; `v` is the 4-byte BOOL the option reads into.
        let rc = unsafe {
            getsockopt(
                SOCKET(l.as_raw_socket() as usize),
                SOL_SOCKET,
                SO_EXCLUSIVEADDRUSE,
                windows::core::PSTR(&mut v as *mut i32 as *mut u8),
                &mut len,
            )
        };
        assert_eq!(rc, 0, "getsockopt(SO_EXCLUSIVEADDRUSE) failed: {}", io::Error::last_os_error());
        v != 0
    }
}
