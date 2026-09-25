//! model_watch.rs — the prompt stop when the model server a run was checked against exits.
//!
//! What this file no longer does, and why (F3-R1, 2026-09-23). It used to be the only guard on
//! the frozen chain's own connections to the model port: it read the kernel's listener table
//! every 20 ms and hung the run up when the holder changed. That is polling, and polling can
//! only shorten the window it cannot close: a process that bound the port beside a live holder,
//! or took it the moment the holder exited, could be handed a connection, and the chunk of the
//! document on it, inside one interval, and the "0 requests reached the new holder in 4 of 4
//! runs" behind it was a sample, not a proof. That guard is now relay.rs: every connection the
//! chain makes goes through the app, and no byte is written on it until the kernel's CONNECTION
//! table says its far end is the checked process. Nothing here decides whether text may be sent.
//!
//! What it still does: the relay can refuse only a connection it is asked to make. A model
//! server that exits in the middle of a completion is seen by the relay at the chain's next
//! connection; waiting on the process handle sees it at once, so the run is stopped where it
//! stands rather than a request later. It is a wait on one handle and one event, no polling.
//!
//! Windows only, like port_owner.rs.

#![cfg(target_os = "windows")]

use crate::port_owner::created_of;
use std::thread::JoinHandle;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::System::Threading::{
    CreateEventW, OpenProcess, SetEvent, WaitForMultipleObjects, WaitForSingleObject, INFINITE,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
};

struct Handle(HANDLE);
// SAFETY: a process or event handle is a kernel object reference, usable from any thread; each
// is waited on or signalled only, and closed once, by its Drop.
unsafe impl Send for Handle {}
unsafe impl Sync for Handle {}
impl Drop for Handle {
    fn drop(&mut self) {
        // SAFETY: a handle this module opened and nothing else closes.
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

pub struct Watch {
    stop: std::sync::Arc<Handle>,
    thread: Option<JoinHandle<bool>>,
}

/// Wait for process `pid`, created at `created`, to exit; `on_exit` runs once, on its own
/// thread, if it does before `finish`.
/// Err: it had already exited (or its pid now names another process), so the run should not
/// start. Ok with no thread: this app may not wait on it; the relay's per-connection check still
/// holds, only the prompt stop is lost, and the caller is told nothing different.
pub fn on_exit(pid: u32, created: u64, on_exit: impl FnOnce(String) + Send + 'static) -> Result<Watch, String> {
    // SAFETY: a manual-reset event, unsignalled, unnamed; closed by the Handle guard.
    let stop = std::sync::Arc::new(Handle(
        unsafe { CreateEventW(None, true, false, PCWSTR::null()) }.map_err(|e| format!("CreateEventW: {e}"))?,
    ));
    // SAFETY: a wait-and-query handle, closed by the Handle guard.
    let Ok(h) = (unsafe { OpenProcess(PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }) else {
        return Ok(Watch { stop, thread: None });
    };
    let proc = Handle(h);
    // Read AFTER the handle is open: an open handle keeps the pid from being reused, so a match
    // means the handle is the process that was checked, and a mismatch means it had gone.
    // A process object outlives its process while anyone holds a handle to it (this app's Child
    // does, for the model it spawned), so an exit is read off the handle as well.
    // SAFETY: the open process handle; a zero timeout only asks whether it is signalled.
    if created_of(pid) != created || unsafe { WaitForSingleObject(proc.0, 0) } == WAIT_OBJECT_0 {
        return Err(format!("the model server that was checked (pid {pid}) had already exited"));
    }
    let s = stop.clone();
    let thread = std::thread::spawn(move || {
        // the whole guards move in (a closure naming only `.0` would capture the raw handles,
        // which are not Send, and the guard would close them on this thread's parent)
        let (proc, s) = (proc, s);
        let both = [proc.0, s.0];
        // SAFETY: both handles are open (owned by `proc` and `s`) and have SYNCHRONIZE.
        let r = unsafe { WaitForMultipleObjects(&both, false, INFINITE) };
        if r == WAIT_OBJECT_0 {
            on_exit(format!("the model server that was checked (pid {pid}) exited"));
            return true;
        }
        false
    });
    Ok(Watch { stop, thread: Some(thread) })
}

impl Watch {
    /// Stop waiting. true when the process exited while this watched.
    pub fn finish(mut self) -> bool {
        self.halt()
    }

    fn halt(&mut self) -> bool {
        // SAFETY: the live event handle.
        unsafe {
            let _ = SetEvent(self.stop.0);
        }
        self.thread.take().map(|t| t.join().unwrap_or(false)).unwrap_or(false)
    }
}

impl Drop for Watch {
    fn drop(&mut self) {
        self.halt();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    fn sleeper() -> std::process::Child {
        std::process::Command::new("ping")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .expect("ping.exe")
    }

    #[test]
    fn an_exit_is_seen_at_once_without_polling() {
        let mut c = sleeper();
        let (pid, created) = (c.id(), created_of(c.id()));
        let (tx, rx) = mpsc::channel();
        let w = on_exit(pid, created, move |why| tx.send(why).unwrap()).unwrap();
        let t = Instant::now();
        c.kill().unwrap();
        let why = rx.recv_timeout(Duration::from_secs(5)).expect("the exit was not seen");
        assert!(t.elapsed() < Duration::from_millis(1000), "seen after {:?}", t.elapsed());
        assert!(why.contains(&format!("pid {pid}")), "{why}");
        assert!(w.finish());
        let _ = c.wait();
    }

    #[test]
    fn control_a_process_that_lives_trips_nothing() {
        let mut c = sleeper();
        let (tx, rx) = mpsc::channel::<String>();
        let w = on_exit(c.id(), created_of(c.id()), move |why| tx.send(why).unwrap()).unwrap();
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err(), "tripped on a live process");
        assert!(!w.finish(), "finish reports an exit that did not happen");
        let _ = c.kill();
        let _ = c.wait();
        // and finish stopped the wait: the exit after it runs nothing
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err());
    }

    #[test]
    fn a_process_that_already_exited_is_refused_up_front() {
        let mut c = sleeper();
        let (pid, created) = (c.id(), created_of(c.id()));
        c.kill().unwrap();
        let _ = c.wait();
        // `c` still holds its handle, so the process object is there with its old creation time:
        // only the handle's signalled state says it has gone
        let e = on_exit(pid, created, |_| {}).err().expect("a watch on a process that had exited");
        assert!(e.contains("had already exited"), "{e}");
        drop(c);
    }
}
