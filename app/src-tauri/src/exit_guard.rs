//! The process ends after its window is gone, even when tao's event loop does not finish.
//!
//! 2026-09-25 (OPS_LEDGER): 2 of 8 closes that day left the process running with no window,
//! and with it the model server (4.6 GB) and the adapter. A full dump of one showed that
//! tauri-runtime-wry had set ControlFlow::Exit (lib.rs:4310-4322), but tao breaks its loop only
//! from Idle, and only a WM_PAINT to its thread target reaches Idle (tao-0.35.3
//! event_loop.rs:255-288, 2331-2350). None came, so RunEvent::Exit, then the app's only
//! teardown, never ran.
//!
//! Two parts, both wired in main.rs:
//! - `nudge`, after ExitRequested: no-op tasks posted to tao from a thread of its own. Each
//!   re-arms the thread target's internal paint (event_loop.rs:2394-2398), so the loop reaches
//!   Idle and breaks as it does in a good close.
//! - `start`, at setup: a watchdog that polls IsWindow on the main window. Nothing in tao arms
//!   it. Once the window has been gone for GRACE and the process is still here, it finishes the
//!   engine teardown or waits a bounded time for the one under way, writes what it did to
//!   legal-app-exit.log, and ends the process with NET_EXIT_CODE.
//!
//! legal-app-exit.log is written only when the watchdog fires or cannot start, never on an
//! ordinary close: a line per close would be a record of when the app was used, kept on the
//! lawyer's machine (review wf_b6f6bdfd-0fa). History.tsx, PRIVACY.md and site/it.html name it,
//! and copy-claims holds History to every log name in this crate.
//!
//! No guard for a save in flight: write_text_file and write_binary_file are sync commands, so
//! they run on the UI thread, which also delivers the close. A close cannot start while one
//! runs (main.rs). Moving them to `async` would need a guard here.
use crate::engine::{self, EngineState};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering::SeqCst};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// A good close ends the process 0.5-1.1 s after the window goes (OPS_LEDGER 2026-09-25).
pub const GRACE: Duration = Duration::from_secs(5);
/// For a teardown under way. It waits on the engine lock, which start_blocking holds while it
/// starts the engine: probes of up to 4 s and 2 s + 3 s (engine.rs model_holder, http_probe),
/// the GPU listing (vulkan_pick, no timeout of its own) and, with SIMPLER_MODEL_GGUF set, a hash
/// of the model. The UI thread's own teardown at ExitRequested is not bounded by this: the
/// window is not gone (IsWindow) until it returns, and cutting it short is what this avoids.
const TEARDOWN_WAIT: Duration = Duration::from_secs(20);
const POLL: Duration = Duration::from_millis(250);
/// Not 0, so a harness can tell that the net ended the process. Nothing a user sees.
pub const NET_EXIT_CODE: u32 = 3;
/// A line each time the watchdog fires. Emptied at start past this.
const LOG_CAP: u64 = 256 * 1024;

static EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);
static LOOP_FINISHED: AtomicBool = AtomicBool::new(false);
static NUDGING: AtomicBool = AtomicBool::new(false);
static NUDGES: AtomicUsize = AtomicUsize::new(0);

fn log_path() -> Option<PathBuf> {
    engine::log_dir().map(|d| d.join("legal-app-exit.log"))
}

/// One dated line to legal-app-exit.log, for what must not go unseen: the watchdog fired, or
/// could not start. The app has no console (main.rs windows_subsystem), so a line that only went
/// to stderr would say nothing to anyone (SEAM-ENGINE-CONSOLE).
fn note(line: &str) {
    let line = format!("{} {line}", utc(now_secs()));
    eprintln!("[simpler.legal] {line}");
    if let Some(p) = log_path() {
        if let Some(d) = p.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        engine::append_log(&p, &line);
    }
}

fn trim(log: &Path) {
    if std::fs::metadata(log).map(|m| m.len() > LOG_CAP).unwrap_or(false) {
        let _ = std::fs::remove_file(log);
    }
}

/// RunEvent::ExitRequested, UI thread, before the teardown. Stderr only (see the module note);
/// the watchdog's line says whether this came.
pub fn requested() {
    EXIT_REQUESTED.store(true, SeqCst);
    eprintln!("[simpler.legal] {} close: exit requested", utc(now_secs()));
}

/// RunEvent::Exit: tao's loop finished.
pub fn loop_finished() {
    LOOP_FINISHED.store(true, SeqCst);
}

/// Setup, UI thread, with the main window's handle. Starts the watchdog. A thread that cannot be
/// started is said at start, when the close it would have covered has not happened yet.
pub fn start(hwnd: *mut std::ffi::c_void, state: EngineState) {
    if let Some(p) = log_path() {
        trim(&p);
    }
    if fault::no_net() {
        note("exit watchdog: off (SIMPLER_EXIT_NO_NET, test build)");
        return;
    }
    let h = hwnd as isize;
    let spawned = std::thread::Builder::new().name("exit-watchdog".into()).spawn(move || {
        wait_until_gone(|| is_window(h), POLL);
        std::thread::sleep(GRACE);
        let teardown_state = state.clone();
        let outcome = net(
            TEARDOWN_WAIT,
            engine::shutdown_started,
            engine::shutdown_finished,
            move || engine::shutdown(&teardown_state),
            engine::sweep_if_spawned,
        );
        note(&format!(
            "exit watchdog: the process was still running {}s after its window closed (exit requested: {}; event loop finished: {}; nudges posted: {}); engine teardown {}; ending the process with code {NET_EXIT_CODE}",
            GRACE.as_secs(),
            yes(EXIT_REQUESTED.load(SeqCst)),
            yes(LOOP_FINISHED.load(SeqCst)),
            NUDGES.load(SeqCst),
            outcome.says(),
        ));
        end_process(NET_EXIT_CODE);
    });
    if let Err(e) = spawned {
        note(&format!("exit watchdog: COULD NOT START ({e}); a close whose event loop does not finish will leave the engine running"));
    }
}

fn yes(b: bool) -> &'static str {
    if b { "yes" } else { "no" }
}

#[cfg(windows)]
fn is_window(h: isize) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::IsWindow;
    // SAFETY: IsWindow takes any value and answers whether it names a window.
    unsafe { IsWindow(HWND(h as *mut std::ffi::c_void)) }.as_bool()
}

#[cfg(not(windows))]
fn is_window(_h: isize) -> bool {
    true
}

fn wait_until_gone(is_window: impl Fn() -> bool, every: Duration) {
    while is_window() {
        std::thread::sleep(every);
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Teardown {
    /// by the UI thread before the watchdog looked
    AlreadyDone,
    /// under way when the watchdog looked, and finished within its wait
    FinishedWithin,
    /// not begun when the watchdog looked; the watchdog began it and it finished
    RunByNet,
    /// not finished within TEARDOWN_WAIT; `swept` when this app had spawned the adapter and its
    /// trees were swept anyway (the jobs were terminated first, by the teardown's first act)
    TimedOut { swept: bool },
}

impl Teardown {
    fn says(&self) -> &'static str {
        match self {
            Teardown::AlreadyDone => "had finished",
            Teardown::FinishedWithin => "finished while the watchdog waited",
            Teardown::RunByNet => "had not begun; the watchdog ran it",
            Teardown::TimedOut { swept: true } => "TIMED OUT; the watchdog swept the adapter's run trees (legal-serve.log names any left)",
            Teardown::TimedOut { swept: false } => "TIMED OUT; this app had not started the adapter, so there were no run trees of its own to sweep",
        }
    }
}

/// What the watchdog does once the window has been gone for GRACE. Apart from the process so a
/// test can drive it. The teardown runs on a thread of its own so that its wait is bounded; a
/// thread that cannot be started runs it here, unbounded, rather than cutting it short.
fn net(
    wait: Duration,
    started: impl Fn() -> bool,
    finished: impl Fn() -> bool,
    teardown: impl FnOnce() + Send + 'static,
    sweep: impl FnOnce() -> bool,
) -> Teardown {
    if finished() {
        return Teardown::AlreadyDone;
    }
    let ran_it = !started();
    if ran_it {
        let slot = std::sync::Arc::new(std::sync::Mutex::new(Some(teardown)));
        let theirs = slot.clone();
        let spawned = std::thread::Builder::new().name("exit-teardown".into()).spawn(move || {
            if let Some(f) = theirs.lock().ok().and_then(|mut g| g.take()) {
                f();
            }
        });
        if spawned.is_err() {
            if let Some(f) = slot.lock().ok().and_then(|mut g| g.take()) {
                f();
            }
        }
    }
    let end = Instant::now() + wait;
    while !finished() {
        if Instant::now() >= end {
            return Teardown::TimedOut { swept: sweep() };
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    if ran_it { Teardown::RunByNet } else { Teardown::FinishedWithin }
}

/// TerminateProcess, not process::exit: no DLL detach or atexit work that could wait on a lock
/// the stuck UI thread holds. The teardown has already run or been bounded.
fn end_process(code: u32) -> ! {
    #[cfg(windows)]
    {
        use windows::Win32::System::Threading::{GetCurrentProcess, TerminateProcess};
        // SAFETY: the pseudo-handle of this process.
        let _ = unsafe { TerminateProcess(GetCurrentProcess(), code) };
    }
    std::process::exit(code as i32)
}

/// After ExitRequested. A task posted to tao re-arms its thread target's internal paint (tao
/// event_loop.rs:2394-2398); that WM_PAINT takes the runner to Idle, where Exit breaks the loop.
/// Posted from a thread of its own, because run_on_main_thread runs the task inline on the main
/// thread (tauri-runtime-wry lib.rs:235-255) and re-arms nothing. Not AppHandle::exit: its
/// failure path is process::exit on the calling thread (tauri app.rs:574-580). Repeated,
/// because whatever took the paint once can take it again. Ends with the process: after a good
/// close tao's EventLoop::run calls process::exit (tao-0.35.3 platform_impl/windows/
/// event_loop.rs:224-230), and after a stall the watchdog ends it; otherwise after `max` posts.
/// A post fails only once tao's thread target is destroyed, which only its EventLoop's Drop
/// does (486-491) and run() never reaches, so the stop on a failed post is a guard only.
pub fn nudge<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if fault::no_nudge() || NUDGING.swap(true, SeqCst) {
        return;
    }
    let app = app.clone();
    let spawned = std::thread::Builder::new().name("exit-nudge".into()).spawn(move || {
        nudge_loop(Duration::from_millis(100), POLL, 40, || app.run_on_main_thread(|| {}).is_ok(), &NUDGES);
    });
    if let Err(e) = spawned {
        note(&format!("exit nudge: could not start ({e}); the watchdog ends the process if the event loop does not finish"));
    }
}

fn nudge_loop(first: Duration, every: Duration, max: usize, mut post: impl FnMut() -> bool, posted: &AtomicUsize) {
    std::thread::sleep(first);
    for _ in 0..max {
        if !post() {
            return;
        }
        posted.fetch_add(1, SeqCst);
        std::thread::sleep(every);
    }
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// UTC, ISO 8601, to the second. No date crate: Hinnant's days-to-civil.
fn utc(secs: u64) -> String {
    let z = (secs / 86_400) as i64 + 719_468;
    let rem = secs % 86_400;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

#[cfg(not(all(windows, feature = "exit-fault")))]
pub mod fault {
    pub fn install() {}
    pub fn prevent() -> bool {
        false
    }
    pub fn no_net() -> bool {
        false
    }
    pub fn no_nudge() -> bool {
        false
    }
    pub fn eat_next_paint() {}
}

/// Test builds only (`--features exit-fault`); the installer's check refuses an exe that carries
/// any of these names. SIMPLER_EXIT_FAULT = eat-paint | prevent; SIMPLER_EXIT_NO_NET and
/// SIMPLER_EXIT_NO_NUDGE turn off either half.
#[cfg(all(windows, feature = "exit-fault"))]
pub mod fault {
    use std::sync::atomic::{AtomicIsize, Ordering::SeqCst};
    use windows::core::w;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, PeekMessageW, PostMessageW, RegisterClassW, HWND_MESSAGE, MSG, PM_NOREMOVE,
        WINDOW_EX_STYLE, WINDOW_STYLE, WM_APP, WM_PAINT, WNDCLASSW,
    };
    const WM_EAT_PAINT: u32 = WM_APP + 0x51;
    static EATER: AtomicIsize = AtomicIsize::new(0);

    fn set(k: &str) -> bool {
        std::env::var_os(k).is_some()
    }
    fn mode() -> String {
        std::env::var("SIMPLER_EXIT_FAULT").unwrap_or_default()
    }
    pub fn prevent() -> bool {
        mode() == "prevent"
    }
    pub fn no_net() -> bool {
        set("SIMPLER_EXIT_NO_NET")
    }
    pub fn no_nudge() -> bool {
        set("SIMPLER_EXIT_NO_NUDGE")
    }

    /// Setup, UI thread: a message-only window tao does not own, so a message to it re-arms
    /// nothing in tao.
    pub fn install() {
        if mode() != "eat-paint" {
            return;
        }
        // SAFETY: plain Win32 window creation on the UI thread; the class outlives the window.
        unsafe {
            let Ok(hinst) = GetModuleHandleW(None) else { return };
            let wc = WNDCLASSW {
                lpfnWndProc: Some(eater),
                hInstance: hinst.into(),
                lpszClassName: w!("simpler-exit-fault"),
                ..Default::default()
            };
            RegisterClassW(&wc);
            if let Ok(h) = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("simpler-exit-fault"),
                None,
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                None,
                hinst,
                None,
            ) {
                EATER.store(h.0 as isize, SeqCst);
            }
        }
        super::note("exit-fault: eat-paint installed (test build)");
    }

    /// ExitRequested runs inside WM_DESTROY, before Exit is set and before WM_NCDESTROY re-arms
    /// the paint (tao event_loop.rs:945-950). A posted message is retrieved before any WM_PAINT,
    /// so the eater runs after the last re-arm and ahead of the paint: the foreign consumer
    /// hypothesised for 2026-09-25, on demand.
    pub fn eat_next_paint() {
        let h = EATER.load(SeqCst);
        if h != 0 {
            // SAFETY: a window this thread created.
            let _ = unsafe { PostMessageW(HWND(h as _), WM_EAT_PAINT, WPARAM(0), LPARAM(0)) };
        }
    }

    unsafe extern "system" fn eater(h: HWND, m: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
        if m == WM_EAT_PAINT {
            let mut msg = MSG::default();
            // tao event_loop.rs:2421-2425: PM_NOREMOVE on an internal-paint WM_PAINT removes it.
            let got = PeekMessageW(&mut msg, None, WM_PAINT, WM_PAINT, PM_NOREMOVE).as_bool();
            super::note(&format!("exit-fault: peeked WM_PAINT: {got}"));
            return LRESULT(0);
        }
        DefWindowProcW(h, m, wp, lp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn utc_matches_known_instants() {
        assert_eq!(utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(utc(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(utc(1_700_000_000), "2023-11-14T22:13:20Z");
        assert_eq!(utc(4_102_444_799), "2099-12-31T23:59:59Z");
    }

    #[test]
    fn the_watchdog_arms_only_once_the_window_is_gone() {
        let calls = AtomicUsize::new(0);
        wait_until_gone(|| calls.fetch_add(1, SeqCst) < 3, Duration::from_millis(1));
        assert_eq!(calls.load(SeqCst), 4);
    }

    #[test]
    fn a_finished_teardown_is_left_alone() {
        let ran = Arc::new(AtomicBool::new(false));
        let r = ran.clone();
        let out = net(Duration::from_millis(200), || true, || true, move || r.store(true, SeqCst), || panic!("swept"));
        assert_eq!(out, Teardown::AlreadyDone);
        assert!(!ran.load(SeqCst));
    }

    #[test]
    fn a_teardown_nobody_began_is_run_by_the_net() {
        let done = Arc::new(AtomicBool::new(false));
        let d = done.clone();
        let out = net(
            Duration::from_secs(5),
            || false,
            || done.load(SeqCst),
            move || {
                std::thread::sleep(Duration::from_millis(100));
                d.store(true, SeqCst);
            },
            || panic!("swept"),
        );
        assert_eq!(out, Teardown::RunByNet);
    }

    /// A teardown the net must not run is recorded, not panicked on: net() runs a teardown on a
    /// detached thread, where a panic would fail nothing (review wf_b6f6bdfd-0fa).
    fn must_not_run() -> (Arc<AtomicBool>, impl FnOnce() + Send + 'static) {
        let ran = Arc::new(AtomicBool::new(false));
        let r = ran.clone();
        (ran, move || r.store(true, SeqCst))
    }

    #[test]
    fn a_teardown_under_way_is_waited_for_and_not_run_twice() {
        let done = Arc::new(AtomicBool::new(false));
        let d = done.clone();
        let t = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(150));
            d.store(true, SeqCst);
        });
        let (ran, teardown) = must_not_run();
        let out = net(Duration::from_secs(5), || true, || done.load(SeqCst), teardown, || panic!("swept"));
        t.join().unwrap();
        assert_eq!(out, Teardown::FinishedWithin);
        assert!(!ran.load(SeqCst), "the net ran a teardown that was already under way");
    }

    #[test]
    fn a_stuck_teardown_is_bounded_and_the_trees_are_swept() {
        let swept = AtomicBool::new(false);
        let (ran, teardown) = must_not_run();
        let t0 = Instant::now();
        let out = net(Duration::from_millis(300), || true, || false, teardown, || {
            swept.store(true, SeqCst);
            true
        });
        assert_eq!(out, Teardown::TimedOut { swept: true });
        assert!(swept.load(SeqCst));
        assert!(t0.elapsed() < Duration::from_secs(2));
        assert!(!ran.load(SeqCst), "the net ran a teardown that was already under way");
        // an app that never spawned the adapter has nothing to sweep, and the line says so
        let out = net(Duration::from_millis(100), || true, || false, || {}, || false);
        assert_eq!(out, Teardown::TimedOut { swept: false });
        assert!(Teardown::TimedOut { swept: false }.says().contains("no run trees"));
        // CONTROL: the same stuck teardown, begun by the net, is also bounded; run inline it
        // would take the whole 3 s
        let t1 = Instant::now();
        let out = net(Duration::from_millis(300), || false, || false, || std::thread::sleep(Duration::from_secs(3)), || true);
        assert_eq!(out, Teardown::TimedOut { swept: true });
        assert!(t1.elapsed() < Duration::from_secs(2), "a teardown the net began was not bounded");
    }

    #[test]
    fn the_nudge_stops_at_a_failed_post_or_at_max_and_counts_what_it_posted() {
        let (n, posted) = (AtomicUsize::new(0), AtomicUsize::new(0));
        nudge_loop(Duration::ZERO, Duration::ZERO, 40, || n.fetch_add(1, SeqCst) < 3, &posted);
        assert_eq!(posted.load(SeqCst), 3);
        assert_eq!(n.load(SeqCst), 4);
        // CONTROL: posts that never fail stop at `max`
        let posted = AtomicUsize::new(0);
        nudge_loop(Duration::ZERO, Duration::ZERO, 40, || true, &posted);
        assert_eq!(posted.load(SeqCst), 40);
    }
}
