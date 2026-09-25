//! port_owner.rs — who holds a loopback port, and who owns each end of one loopback connection,
//! from the kernel's TCP tables. A process cannot misreport either, which is why they are used
//! for the model server (site-audit L7, F3-R1).
//!
//! llama-server has no way to prove itself to the app. Its --api-key authenticates the CLIENT
//! to the server, which is the wrong direction. So engine.rs decides by who owns the socket:
//!   Ours      in this app's kill-on-close job: the launcher this app spawned, or a child of it
//!   SameUser  your own Windows account, outside the job: started by hand, or by another copy
//!             of the app. engine.rs checks the model file it serves against the pin first.
//!   Foreign   another account, SYSTEM, or a process this app may not inspect. Refused.
//! This protects against another account on the same machine (a shared RDS or Citrix host)
//! that binds the port first. It does not protect against code running as you: that code
//! can already read your files and this app's memory, and no local check changes that.
//!
//! A reading of the LISTENER table is true when it is taken: between it and the connection that
//! follows, the holder can exit and another process can bind the port, or bind beside it. So the
//! question every road that carries text asks is not "who listens" but "who owns the far end of
//! THIS connection": `conn_owner` reads the CONNECTION table for the exact 4-tuple of a socket
//! that is already connected, and relay.rs sends nothing on a connection until that owner is the
//! model process that was checked. A TCP connection cannot change hands, so the answer holds for
//! every byte the connection carries.
//!
//! Windows only; on other platforms engine.rs refuses the model port instead of guessing.

#![cfg(target_os = "windows")]

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use windows::Win32::Foundation::{CloseHandle, ERROR_INSUFFICIENT_BUFFER, FILETIME, HANDLE};
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCPROW_OWNER_PID, TCP_TABLE_CLASS, TCP_TABLE_OWNER_PID_CONNECTIONS,
    TCP_TABLE_OWNER_PID_LISTENER,
};
use windows::Win32::Security::{EqualSid, GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    GetCurrentProcess, GetProcessTimes, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW,
    PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};

const AF_INET: u32 = 2;
const AF_INET6: u32 = 23;
/// MIB_TCP_STATE: rows in these states belong to no live socket (TIME_WAIT rows report pid 0).
const STATE_CLOSED: u32 = 1;
const STATE_TIME_WAIT: u32 = 11;
const STATE_DELETE_TCB: u32 = 12;

pub enum Owner {
    Ours { created: u64 },
    SameUser { pid: u32, created: u64, image: String },
    Foreign { pid: u32, image: Option<String> },
}

impl Owner {
    /// One line naming the holder, for a refusal the user reads.
    pub fn describe(&self) -> String {
        match self {
            Owner::Ours { .. } => "a process this app started".into(),
            Owner::SameUser { pid, image, .. } => format!("{image} (pid {pid}, your own account, not started by this app)"),
            Owner::Foreign { pid, image: Some(i) } => format!("{i} (pid {pid}, not your Windows account)"),
            Owner::Foreign { pid, image: None } => {
                format!("process {pid}, which this app may not inspect (another Windows account, SYSTEM, or an elevated process)")
            }
        }
    }
}

/// One row of a TCP table: local end, remote end, state, owning pid. IPv4-mapped IPv6
/// addresses (a dual-stack socket's view of a 127.0.0.1 connection) are read as IPv4, so one
/// comparison covers both tables.
struct Row {
    local: SocketAddr,
    remote: SocketAddr,
    state: u32,
    pid: u32,
}

fn v6(bytes: [u8; 16]) -> IpAddr {
    let a = Ipv6Addr::from(bytes);
    match a.to_ipv4_mapped() {
        Some(v4) => IpAddr::V4(v4),
        None => IpAddr::V6(a),
    }
}

/// The port is in network byte order in the low 16 bits of a u32.
fn port_of(raw: u32) -> u16 {
    u16::from_be(raw as u16)
}

fn rows(af: u32, class: TCP_TABLE_CLASS) -> Result<Vec<Row>, String> {
    let buf = tcp_table(af, class)?;
    let base = buf.as_ptr() as *const u8;
    let mut out = Vec::new();
    // SAFETY: GetExtendedTcpTable filled `buf` with a MIB_TCP(6)TABLE_OWNER_PID: a u32 row
    // count followed by that many rows. Rows start at offset 4 (both row types are u32-aligned),
    // and the count is bounded by the byte length before any row is read.
    unsafe {
        let n = *(base as *const u32) as usize;
        let rows = base.add(4);
        if af == AF_INET {
            let size = std::mem::size_of::<MIB_TCPROW_OWNER_PID>();
            if 4 + n * size > buf.len() * 4 {
                return Err("the TCP table came back shorter than its row count".into());
            }
            for r in std::slice::from_raw_parts(rows as *const MIB_TCPROW_OWNER_PID, n) {
                // dwLocalAddr holds the address bytes in network order, as they sit in memory
                out.push(Row {
                    local: SocketAddr::new(IpAddr::V4(Ipv4Addr::from(r.dwLocalAddr.to_ne_bytes())), port_of(r.dwLocalPort)),
                    remote: SocketAddr::new(IpAddr::V4(Ipv4Addr::from(r.dwRemoteAddr.to_ne_bytes())), port_of(r.dwRemotePort)),
                    state: r.dwState,
                    pid: r.dwOwningPid,
                });
            }
        } else {
            let size = std::mem::size_of::<MIB_TCP6ROW_OWNER_PID>();
            if 4 + n * size > buf.len() * 4 {
                return Err("the TCP6 table came back shorter than its row count".into());
            }
            for r in std::slice::from_raw_parts(rows as *const MIB_TCP6ROW_OWNER_PID, n) {
                out.push(Row {
                    local: SocketAddr::new(v6(r.ucLocalAddr), port_of(r.dwLocalPort)),
                    remote: SocketAddr::new(v6(r.ucRemoteAddr), port_of(r.dwRemotePort)),
                    state: r.dwState,
                    pid: r.dwOwningPid,
                });
            }
        }
    }
    Ok(out)
}

/// Every process with a socket listening on `port`, IPv4 and IPv6, any local address. All of
/// them, not only 127.0.0.1: a dual-stack or wildcard listener can take a 127.0.0.1
/// connection too, and a false alarm here costs a Retry, where a miss costs a document.
pub fn listeners(port: u16) -> Result<Vec<u32>, String> {
    let mut pids = Vec::new();
    for af in [AF_INET, AF_INET6] {
        pids.extend(rows(af, TCP_TABLE_OWNER_PID_LISTENER)?.into_iter().filter(|r| r.local.port() == port).map(|r| r.pid));
    }
    pids.sort_unstable();
    pids.dedup();
    Ok(pids)
}

/// Who owns the socket whose local end is `local` and whose remote end is `remote`, among the
/// live connections (IPv4 and IPv6 tables; an IPv4-mapped row counts as IPv4). Called with a
/// connected socket's own addresses swapped, it names the process on the OTHER end of that
/// socket: for an outgoing connection, the process that accepted it; for an accepted one, the
/// process that dialled. A connection still in the listener's accept queue is already owned by
/// the listener's process (measured by the tests below).
///
/// Ok(None): no live row has that 4-tuple (yet: a row can trail connect() by a moment, so the
/// caller asks again briefly before it gives up). Err: two live rows claim it, which a working
/// TCP stack never shows; the caller treats that as a refusal, not a guess.
pub fn conn_owner(local: SocketAddr, remote: SocketAddr) -> Result<Option<u32>, String> {
    let mut found: Vec<u32> = Vec::new();
    for af in [AF_INET, AF_INET6] {
        for r in rows(af, TCP_TABLE_OWNER_PID_CONNECTIONS)? {
            if r.local == local && r.remote == remote && !matches!(r.state, STATE_CLOSED | STATE_TIME_WAIT | STATE_DELETE_TCB) {
                found.push(r.pid);
            }
        }
    }
    found.sort_unstable();
    found.dedup();
    match found.as_slice() {
        [] => Ok(None),
        [pid] => Ok(Some(*pid)),
        many => Err(format!("Windows lists {} processes on one connection ({local} to {remote})", many.len())),
    }
}

/// A Vec<u32> so the table is u32-aligned, as the row structs require.
fn tcp_table(af: u32, class: TCP_TABLE_CLASS) -> Result<Vec<u32>, String> {
    let mut size = 0u32;
    // the table can grow between the sizing call and the filling call; three tries
    for _ in 0..3 {
        let mut buf = vec![0u32; (size as usize).div_ceil(4).max(1)];
        let bytes = (buf.len() * 4) as u32;
        size = bytes;
        // SAFETY: `buf` is `size` bytes of writable, u32-aligned memory; the call writes at
        // most `size` bytes and reports the size it needs when that is not enough.
        let rc = unsafe { GetExtendedTcpTable(Some(buf.as_mut_ptr().cast()), &mut size, false, af, class, 0) };
        if rc == 0 {
            return Ok(buf);
        }
        if rc != ERROR_INSUFFICIENT_BUFFER.0 {
            return Err(format!("GetExtendedTcpTable failed ({rc})"));
        }
    }
    Err("GetExtendedTcpTable kept growing; could not read who holds the port".into())
}

struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        // SAFETY: a handle this module opened and nothing else closes.
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

/// A process token's TOKEN_USER, in the buffer Windows wrote it to. The SID it points at lives
/// later in the same heap buffer, which moving the Vec does not move, so the pointer stays
/// valid for as long as the Vec is alive and unmodified.
fn token_user(process: HANDLE) -> Option<Vec<u64>> {
    let mut tok = HANDLE::default();
    // SAFETY: `process` is a live handle with query rights; `tok` receives a handle we close.
    unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut tok) }.ok()?;
    let tok = Handle(tok);
    let mut need = 0u32;
    // SAFETY: the sizing call; it fails with ERROR_INSUFFICIENT_BUFFER and sets `need`.
    let _ = unsafe { GetTokenInformation(tok.0, TokenUser, None, 0, &mut need) };
    if need == 0 {
        return None;
    }
    let mut buf = vec![0u64; (need as usize).div_ceil(8)];
    // SAFETY: `buf` is at least `need` bytes and 8-aligned, as TOKEN_USER (a pointer) needs.
    unsafe { GetTokenInformation(tok.0, TokenUser, Some(buf.as_mut_ptr().cast()), need, &mut need) }.ok()?;
    Some(buf)
}

fn same_user(a: &[u64], b: &[u64]) -> bool {
    // SAFETY: each slice is a live buffer that GetTokenInformation(TokenUser) filled, so its
    // head is a TOKEN_USER whose Sid points into the same buffer.
    unsafe {
        let sa = (*(a.as_ptr() as *const TOKEN_USER)).User.Sid;
        let sb = (*(b.as_ptr() as *const TOKEN_USER)).User.Sid;
        EqualSid(sa, sb).is_ok()
    }
}

fn image(process: HANDLE) -> Option<String> {
    let mut buf = vec![0u16; 1024];
    let mut len = buf.len() as u32;
    // SAFETY: `buf` holds `len` u16s; the call writes at most that many and updates `len`.
    unsafe {
        QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len)
    }
    .ok()?;
    Some(String::from_utf16_lossy(&buf[..len as usize]))
}

fn created(process: HANDLE) -> u64 {
    let (mut c, mut e, mut k, mut u) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
    // SAFETY: four out-parameters on the stack; `process` has query rights.
    match unsafe { GetProcessTimes(process, &mut c, &mut e, &mut k, &mut u) } {
        Ok(()) => ((c.dwHighDateTime as u64) << 32) | c.dwLowDateTime as u64,
        Err(_) => 0,
    }
}

/// When `pid` was created (FILETIME ticks), 0 when this app may not ask (or it has exited).
/// With the pid it names one process: a pid can be reused, a (pid, created) pair cannot.
pub fn created_of(pid: u32) -> u64 {
    // SAFETY: a query-only handle, closed by the Handle guard.
    match unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) } {
        Ok(h) => created(Handle(h).0),
        Err(_) => 0,
    }
}

/// The pid that created `pid`, from a process snapshot. Only meaningful together with creation
/// times: Windows reuses pids, so the caller checks the parent is still the process it means.
pub fn parent_of(pid: u32) -> Option<u32> {
    // SAFETY: a snapshot handle we close; the entry's dwSize is set before the first call, as
    // Process32FirstW requires.
    unsafe {
        let snap = Handle(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?);
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        Process32FirstW(snap.0, &mut e).ok()?;
        loop {
            if e.th32ProcessID == pid {
                return Some(e.th32ParentProcessID);
            }
            Process32NextW(snap.0, &mut e).ok()?;
        }
    }
}

/// Whether `pid` is in this app's job of that kind: relay.rs's admission test for "the engine
/// service this app started, or a chain stage it ran". False on any failure to find out.
pub fn in_job(kind: crate::job_object::Kind, pid: u32) -> bool {
    // SAFETY: a query-only handle, closed by the Handle guard.
    let Ok(h) = (unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }) else { return false };
    let h = Handle(h);
    crate::job_object::contains_kind(kind, h.0) == Some(true)
}

/// Which of the three a listening process is. Every failure to find out is Foreign: the one
/// answer that sends nothing.
pub fn classify(pid: u32) -> Owner {
    if pid == 0 || pid == 4 {
        return Owner::Foreign { pid, image: Some("the Windows kernel (System)".into()) };
    }
    // SAFETY: a query-only handle, closed by the Handle guard.
    let Ok(h) = (unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }) else {
        return Owner::Foreign { pid, image: None };
    };
    let h = Handle(h);
    if crate::job_object::contains(h.0) == Some(true) {
        return Owner::Ours { created: created(h.0) };
    }
    let img = image(h.0);
    // SAFETY: the pseudo-handle for this process needs no closing.
    let me = token_user(unsafe { GetCurrentProcess() });
    let them = token_user(h.0);
    match (me, them) {
        (Some(a), Some(b)) if same_user(&a, &b) => {
            Owner::SameUser { pid, created: created(h.0), image: img.unwrap_or_else(|| format!("process {pid}")) }
        }
        _ => Owner::Foreign { pid, image: img },
    }
}

/// The Rust suite's own scratch ports. The registered gates have theirs: doctrine-profile.mjs
/// 14370-14379, service-lifecycle.mjs 14380-14389, service-auth.mjs 14390-14399. The suite used
/// 14340-14379 until 2026-09-23, over doctrine-profile's, with one port to spare: two ports
/// held elsewhere failed a test (wf5 S3R-7, measured 2 runs of 2). Listeners this process holds
/// take LISTEN; ports released for a child to bind take RELEASE, apart, so a suite that has
/// run its listeners past the range still finds one for a child.
#[cfg(test)]
const LISTEN: std::ops::RangeInclusive<u16> = 14340..=14364;
#[cfg(test)]
const RELEASE: std::ops::RangeInclusive<u16> = 14365..=14369;

/// A listener on a free port of `range`, taking the next from `next` and skipping busy ones and
/// released ones. Once a lap finds none free, the OS picks one (127.0.0.1:0); any it picks that
/// is 1436, 49400 (inside Windows' dynamic range), a registered gate's or a released one is held
/// aside and another taken. The suite binds more listeners than LISTEN has ports (measured
/// 2026-09-23: with the OS's pick turned off, 6 tests of 46 failed for want of a port), so the
/// pick is routine, not a last resort; a range that ran out used to fail the suite at random
/// whenever a gate's service was up beside it.
#[cfg(test)]
fn scratch_on(range: &std::ops::RangeInclusive<u16>, next: &std::sync::atomic::AtomicU16) -> std::net::TcpListener {
    let (lo, n) = (*range.start(), range.len() as u16);
    let is_released = |p: u16| released().lock().unwrap_or_else(|e| e.into_inner()).contains(&p);
    for _ in 0..n {
        let p = lo + next.fetch_add(1, std::sync::atomic::Ordering::SeqCst) % n;
        if is_released(p) {
            continue;
        }
        if let Ok(l) = std::net::TcpListener::bind(("127.0.0.1", p)) {
            return l;
        }
    }
    let offer = || {
        let l = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("the OS gives out a loopback port");
        let p = l.local_addr().unwrap().port();
        (l, p)
    };
    first_usable(64, offer, is_released)
        .unwrap_or_else(|| panic!("no free port in {lo}-{} and none the OS offered was usable for a scratch server; free some and rerun", lo + n - 1))
}

/// Whether a port the OS offered may carry a scratch server: never the app's engine service
/// (1436) or model server (49400), never a registered gate's range, never one released to a
/// child. 49400 is inside Windows' dynamic range, so of these it is the one the OS can offer.
#[cfg(test)]
fn scratch_usable(p: u16, released: impl Fn(u16) -> bool) -> bool {
    !(p == 1436 || p == 49400 || (14340..=14399).contains(&p) || released(p))
}

/// The first of up to `tries` offers whose port is usable. The refused ones are held until then,
/// so the OS cannot hand the same one back.
#[cfg(test)]
fn first_usable<T>(tries: usize, mut offer: impl FnMut() -> (T, u16), released: impl Fn(u16) -> bool) -> Option<T> {
    let mut aside = Vec::new();
    for _ in 0..tries {
        let (x, p) = offer();
        if scratch_usable(p, &released) {
            return Some(x);
        }
        aside.push(x);
    }
    None
}

/// A listener for a stand-in in this process. Tests run on parallel threads, so each takes the
/// next port from one counter.
#[cfg(test)]
pub(crate) fn scratch_listener() -> std::net::TcpListener {
    static NEXT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(0);
    scratch_on(&LISTEN, &NEXT)
}

/// Ports scratch_port released, kept from every later pick for the rest of the run. RELEASE
/// keeps them from LISTEN's counter, and this keeps them from the OS's pick and from RELEASE's
/// own counter when it wraps. When both shared one counter, a released port was bound again by
/// another test's listener in this process: a child's listener exited,
/// the CONTROL "nothing accepts there now" found this process accepting, and its `answering`
/// connection arrived at the proxy test's stand-in as an empty request. With two servers more
/// than the suite has today, relay's the_model_end_is_named_by_the_process_that_accepted_it
/// failed 3 runs of 3 without this and passed 3 of 3 with it (measured 2026-09-23, wf5).
#[cfg(test)]
fn released() -> &'static std::sync::Mutex<std::collections::HashSet<u16>> {
    static R: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<u16>>> = std::sync::OnceLock::new();
    R.get_or_init(Default::default)
}

/// A free port of RELEASE, released for another process to bind. No later pick in this run
/// takes it (released()).
#[cfg(test)]
pub(crate) fn scratch_port() -> u16 {
    static NEXT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(0);
    let l = scratch_on(&RELEASE, &NEXT);
    let p = l.local_addr().unwrap().port();
    released().lock().unwrap_or_else(|e| e.into_inner()).insert(p);
    p
}

/// A listener on `ip`:`port` in ANOTHER process (a PowerShell child), returned once the listener
/// table shows it. One process holding both ends of every connection is how a test passes when
/// the code asks the kernel about the wrong end: the answer is the same process either way.
/// Single quotes only inside the script: a double quote is re-escaped on the way to
/// powershell.exe, and the script would not be the one written here.
#[cfg(test)]
pub(crate) fn child_listener(ip: &str, port: u16) -> std::process::Child {
    let script = format!(
        "$l = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Parse('{ip}'), {port}); $l.Start(); Start-Sleep -Seconds 40"
    );
    let mut child = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("powershell is needed for this test");
    for _ in 0..300 {
        if listeners(port).unwrap_or_default().contains(&child.id()) {
            return child;
        }
        if let Ok(Some(st)) = child.try_wait() {
            panic!("the child meant to listen on {ip}:{port} exited first ({st})");
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
    panic!("the child did not listen on {ip}:{port} within 15 s");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpStream;

    /// The ports a scratch server may take, and the layout of the suite's own. Every exclusion
    /// and the LISTEN/RELEASE split could be dropped with the suite green (wf6 S-teeth-3): a
    /// stand-in on 49400 sits on the model server's port, and a range moved back over
    /// 14370-14379 fails doctrine-profile only when the two run at once, which verify never does.
    #[test]
    fn a_scratch_server_never_takes_the_apps_ports_or_a_gates() {
        let none = |_: u16| false;
        for p in [1436, 49400, 14340, 14369, 14370, 14379, 14380, 14399] {
            assert!(!scratch_usable(p, none), "{p} was taken for a scratch server");
        }
        assert!(!scratch_usable(50123, |p| p == 50123), "a port released to a child was taken again");
        // CONTROL: ports next to each excluded one, and the same port unreleased, are usable
        for p in [1435, 1437, 49399, 49401, 14339, 14400, 50123] {
            assert!(scratch_usable(p, none), "{p} was refused");
        }
        // the refused offers are passed over, not returned, and each is held until the pick
        let mut offers = [1436u16, 49400, 14375, 50123, 50124].into_iter();
        let mut n = 0;
        let got = first_usable(8, || { n += 1; let p = offers.next().unwrap(); (p, p) }, none);
        assert_eq!((got, n), (Some(50123), 4));
        let mut only_bad = [49400u16; 3].into_iter();
        assert_eq!(first_usable(3, || { let p = only_bad.next().unwrap(); (p, p) }, none), None, "CONTROL: nothing usable is None, not the last offer");
        assert!(*LISTEN.start() >= 14340 && *LISTEN.end() < *RELEASE.start() && *RELEASE.end() <= 14369, "the suite's ranges: LISTEN {LISTEN:?}, RELEASE {RELEASE:?}");
        let p = scratch_port();
        assert!(RELEASE.contains(&p) || scratch_usable(p, none), "scratch_port gave {p}");
    }

    #[test]
    fn listeners_names_the_process_that_listens_and_only_on_its_port() {
        let l = scratch_listener();
        let port = l.local_addr().unwrap().port();
        let me = std::process::id();
        assert!(listeners(port).unwrap().contains(&me), "our own listener on {port} is listed as ours");
        drop(l);
        // CONTROL: the same port with nothing listening lists nobody, so the pass above is about
        // the listener and not a table that always contains us
        assert!(!listeners(port).unwrap().contains(&me), "a closed port still lists us");
    }

    #[test]
    fn conn_owner_names_each_end_of_one_connection() {
        let l = scratch_listener();
        let addr = l.local_addr().unwrap();
        let me = std::process::id();
        let c = TcpStream::connect(addr).unwrap();
        let (local, peer) = (c.local_addr().unwrap(), c.peer_addr().unwrap());
        // not yet accepted: the connection sits in the listener's queue, and is already its own
        assert_eq!(conn_owner(peer, local).unwrap(), Some(me), "the server end, before accept()");
        let (_s, _) = l.accept().unwrap();
        assert_eq!(conn_owner(peer, local).unwrap(), Some(me), "the server end, after accept()");
        assert_eq!(conn_owner(local, peer).unwrap(), Some(me), "the client end");
        // CONTROL: a 4-tuple with one port changed names nobody, so the lookup matches the exact
        // connection and not merely the port
        let wrong = SocketAddr::new(local.ip(), local.port().wrapping_add(1));
        assert_eq!(conn_owner(peer, wrong).unwrap(), None);
    }

    #[test]
    fn conn_owner_names_another_process_as_another_process() {
        // a child process that dials our listener: the client end is the child's, not ours
        let l = scratch_listener();
        let port = l.local_addr().unwrap().port();
        let mut child = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!("$c = New-Object Net.Sockets.TcpClient('127.0.0.1', {port}); Start-Sleep -Seconds 20"),
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .expect("powershell is needed for this test");
        l.set_nonblocking(false).unwrap();
        let (s, _) = l.accept().unwrap();
        let (local, peer) = (s.local_addr().unwrap(), s.peer_addr().unwrap());
        let owner = conn_owner(peer, local).unwrap();
        let _ = child.kill();
        let _ = child.wait();
        assert_eq!(owner, Some(child.id()), "the dialling end belongs to the child");
        assert_ne!(owner, Some(std::process::id()), "CONTROL: and not to this process");
    }
}
