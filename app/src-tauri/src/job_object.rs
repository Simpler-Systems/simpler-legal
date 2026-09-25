// Windows Job Object glue for child lifecycle — ported from simpler-harness
// src-tauri/src/job_object.rs (the family's measured fix; `assign_pid` dropped,
// nothing here spawns a browser).
//
// The problem: when the app exe closes (clean exit, crash, force-kill), children
// spawned via `std::process::Command` orphan and keep running. llama-server holds
// ~3 GB and the adapter keeps port 1436, so across a few restart cycles the user's
// Task Manager fills with zombies — and a second app instance can never bind.
//
// The fix: at first spawn we create a Win32 Job Object with
// JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE. Every spawned child is assigned to one via
// AssignProcessToJobObject; processes a member creates join the job too (cmd.exe's
// llama-server, node's four chain stages). When this process exits the OS closes
// the last handle to the job and kills everything still in it. No bookkeeping, no
// PID file — the kernel cleans up, even after a hard crash. The app's exit hook
// (engine::shutdown) calls terminate_all() first only so it can then delete the
// adapter's working files, which a killed adapter cannot delete itself (LAUNCH.md §2.5);
// contains() is port_owner.rs's test for "a process this app started".
//
// Two jobs, one per child, so the adapter and the chain stages it runs can be stopped on
// their own: engine.rs does that the moment the model server a run was checked against
// changes (relay.rs, model_watch.rs), and the model server the app started is not collateral
// of that. The adapter's job is also relay.rs's admission test: only a process in it may send
// text through the relay to the model.
//
// Known gap, stated: a grandchild started between our spawn() and assign_child()
// is not covered. The launcher spends its first ~15 s hashing the model before it
// starts llama-server, so the window is theoretical there; it is not closed.
//
// On non-Windows platforms this module is absent (engine.rs compiles the calls out).

#![cfg(target_os = "windows")]

use std::os::windows::io::AsRawHandle;
use std::process::Child;
use std::sync::OnceLock;

use windows::Win32::Foundation::{BOOL, HANDLE};
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, IsProcessInJob, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

/// `HANDLE` (a `*mut c_void`) is not `Send`/`Sync` by default. The access pattern is
/// safe by construction: created exactly once, immutable for the process lifetime,
/// and every later use is AssignProcessToJobObject, which Win32 documents as
/// thread-safe for this usage.
#[derive(Copy, Clone)]
struct JobHandle(HANDLE);
// SAFETY: see the note above — one creation, no mutation, thread-safe consumer.
unsafe impl Send for JobHandle {}
unsafe impl Sync for JobHandle {}

/// Which job a child goes in.
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum Kind {
    /// tools/launch-server.cmd and the llama-server it starts
    Model = 0,
    /// serve-legal.mjs and the chain stages it runs
    Adapter = 1,
}

/// `None` means the initializer ran and failed — logged once, later assigns skipped
/// (the spawn itself still succeeds; it just loses the cleanup guarantee).
static JOBS: [OnceLock<Option<JobHandle>>; 2] = [OnceLock::new(), OnceLock::new()];

fn create_job() -> Option<JobHandle> {
    // SAFETY: CreateJobObjectW with NULL attrs / NULL name returns a new anonymous job
    // handle we own for the rest of the process lifetime. It is intentionally never
    // closed — the OS closing the last handle at exit is what triggers KILL_ON_JOB_CLOSE.
    let job = unsafe { CreateJobObjectW(None, None) };
    let handle = match job {
        Ok(h) if !h.is_invalid() => h,
        Ok(_) => {
            eprintln!("[simpler.legal] CreateJobObjectW returned an invalid handle");
            return None;
        }
        Err(e) => {
            eprintln!("[simpler.legal] CreateJobObjectW failed: {e}");
            return None;
        }
    };

    let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

    // SAFETY: &info is of the matching info class; the size is that struct's size.
    let res = unsafe {
        SetInformationJobObject(
            handle,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if let Err(e) = res {
        // Without KILL_ON_JOB_CLOSE the job is useless to us; report init failure rather
        // than hand callers a false sense of cleanup.
        eprintln!("[simpler.legal] SetInformationJobObject failed: {e}");
        return None;
    }

    eprintln!("[simpler.legal] job object created (kill-on-close)");
    Some(JobHandle(handle))
}

/// Assign a freshly spawned child to its job so it dies with us. Lazily creates the job on
/// first call. Safe from any thread. Returns whether the child is now in the job: false
/// means it runs without the cleanup guarantee, and port_owner.rs cannot see it as this
/// app's (engine.rs records the launcher then, and falls back to its parent pid).
pub fn assign_child(kind: Kind, child: &Child) -> bool {
    let job = match JOBS[kind as usize].get_or_init(create_job) {
        Some(j) => *j,
        None => return false,
    };

    let child_handle = HANDLE(child.as_raw_handle() as _);
    // SAFETY: child_handle is a live process handle owned by `Child` until drop; job.0
    // is the live job handle from create_job.
    let res = unsafe { AssignProcessToJobObject(job.0, child_handle) };
    if let Err(e) = res {
        // Most likely: the child is already in a job that forbids nesting (some
        // debuggers / launchers). Non-fatal — the child runs, without auto-cleanup.
        eprintln!(
            "[simpler.legal] AssignProcessToJobObject failed (pid {}): {e}",
            child.id()
        );
        return false;
    }
    true
}

/// Whether `process` is in one of this app's jobs — port_owner.rs's test for "a process this
/// app started". None: no job exists (nothing was spawned yet, or the job could not be made),
/// or the question could not be asked; both read as "not ours".
pub fn contains(process: HANDLE) -> Option<bool> {
    let mut asked = false;
    for slot in &JOBS {
        let Some(Some(job)) = slot.get() else { continue };
        let mut inside = BOOL(0);
        // SAFETY: `process` is a live handle with PROCESS_QUERY_LIMITED_INFORMATION; job.0 is
        // the live job handle.
        if unsafe { IsProcessInJob(process, job.0, &mut inside) }.is_err() {
            continue;
        }
        if inside.as_bool() {
            return Some(true);
        }
        asked = true;
    }
    asked.then_some(false)
}

/// Whether `process` is in this app's job of one kind. relay.rs admits a connection to the model
/// only from the adapter's job: a process in the MODEL job (the launcher's cmd.exe, llama-server)
/// has no business sending text to the model, so "any job of ours" is too wide a test there.
/// None: that job does not exist yet, or the question could not be asked.
pub fn contains_kind(kind: Kind, process: HANDLE) -> Option<bool> {
    let Some(Some(job)) = JOBS[kind as usize].get() else { return None };
    let mut inside = BOOL(0);
    // SAFETY: `process` is a live handle with PROCESS_QUERY_LIMITED_INFORMATION; job.0 is the
    // live job handle.
    unsafe { IsProcessInJob(process, job.0, &mut inside) }.ok()?;
    Some(inside.as_bool())
}

/// Kill everything in one job now. The job stays usable: the next child assigned to it is
/// covered as before. Returns whether there was a job to terminate.
pub fn terminate(kind: Kind) -> bool {
    let Some(Some(job)) = JOBS[kind as usize].get() else { return false };
    // SAFETY: the live job handle; terminating an empty job is a no-op.
    match unsafe { TerminateJobObject(job.0, 1) } {
        Ok(()) => true,
        Err(e) => {
            eprintln!("[simpler.legal] TerminateJobObject({kind:?}) failed: {e}");
            false
        }
    }
}

/// Kill everything in both jobs now, rather than when the OS closes the handles at exit, so
/// the app's exit hook can clean up after the adapter once nothing holds its files open.
pub fn terminate_all() -> bool {
    let a = terminate(Kind::Adapter);
    let m = terminate(Kind::Model);
    a || m
}
