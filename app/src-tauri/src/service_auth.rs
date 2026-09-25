//! service_auth.rs — how the app knows the engine service on 127.0.0.1:1436 is its own before
//! any document text leaves this process (LAUNCH.md §2.4, site-audit L7). The other half is
//! serve-legal.mjs (/hello, and the bearer check on /strip); lib/tauri.ts speaks the same
//! protocol for the browser dev mode. The three change together or not at all.
//!
//! Loopback ports belong to the machine, not to a user. On a shared Windows host (RDS,
//! Citrix) another user's process can bind 1436 before this app does, and until 2026-09-23
//! the app sent every dropped document, unredacted, to whatever answered there. Now:
//!   1. open ONE connection;
//!   2. GET /hello with a fresh 32-byte challenge; the service answers with
//!      HMAC-SHA256(token, context \n challenge \n payload), which only a holder of the token
//!      can compute: the token this app handed the adapter it spawned, or the token a
//!      hand-started adapter wrote under the user's own profile (the developer flow);
//!   3. only then, on the SAME connection, POST /strip with the token as a bearer credential.
//! A TCP connection cannot change hands, so the process that proved itself is the process
//! that receives the document. Two connections would reopen the window between check and send.
//!
//! std + sha2 + serde_json only, so a scratch harness can compile this file by itself and
//! drive it against a real adapter.

use sha2::{Digest, Sha256};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};

/// Must equal serve-legal.mjs PROOF_CONTEXT.
pub const CONTEXT: &str = "simpler-legal-service/1";

/// RFC 2104 over sha2, which is already a dependency (the model pin). 64 is SHA-256's block.
pub fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; 32] {
    let mut k = [0u8; 64];
    if key.len() > 64 {
        k[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }
    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(msg);
    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner.finalize());
    outer.finalize().into()
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Constant time over equal lengths; the lengths themselves are not secret here.
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub fn proof(token: &str, nonce: &str, payload: &str) -> String {
    hex(&hmac_sha256(token.as_bytes(), format!("{CONTEXT}\n{nonce}\n{payload}").as_bytes()))
}

/// What a service that proved itself reported, and which candidate token it proved.
pub struct Hello {
    pub which: usize,
    pub engine: String,
    /// The model port the service was started with. Read, not used: every run is told the
    /// relay's port instead (`llama_per_run`), so this names only where its /health probe goes.
    #[allow(dead_code)]
    pub llama_port: u16,
    pub llama_ok: bool,
    /// The service's own pid, inside the proof. engine.rs checks it holds the port, so the relay
    /// can admit a hand-started service's chain stages by their parent (relay.rs).
    pub pid: u32,
    /// The service takes the model port per request (`llamaPort` in the /strip body), which is
    /// how the app routes a run's model calls through its per-connection check. A service
    /// without it would send them straight to the model port, where nothing checks who answers.
    pub llama_per_run: bool,
}

struct Head {
    status: u16,
    length: Option<u64>,
    chunked: bool,
}

/// One HTTP/1.1 connection to 127.0.0.1:port, kept open across /hello and /strip.
pub struct Conn {
    port: u16,
    w: TcpStream,
    r: BufReader<TcpStream>,
    /// A request body has started to go out on this connection (Conn::body_sent).
    sent: bool,
}

/// Ok(None): nothing accepted the connection. On Windows a connect to a closed loopback port
/// is retried for about 2 s and then reports TimedOut, not ConnectionRefused (measured
/// 2026-09-23: 2.17 s, "connection timed out"), so both mean absent. Either way nothing was
/// sent. Any other connect failure is an error.
pub fn connect(port: u16) -> io::Result<Option<Conn>> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let w = match TcpStream::connect_timeout(&addr, Duration::from_secs(2)) {
        Ok(s) => s,
        Err(e) if matches!(e.kind(), io::ErrorKind::ConnectionRefused | io::ErrorKind::TimedOut) => return Ok(None),
        Err(e) => return Err(e),
    };
    w.set_write_timeout(Some(Duration::from_secs(30)))?;
    w.set_read_timeout(Some(Duration::from_secs(5)))?;
    let r = BufReader::new(w.try_clone()?);
    Ok(Some(Conn { port, w, r, sent: false }))
}

/// A Conn over a socket that is already connected (and, for the model, already verified by
/// relay.rs), with `read` bounding each read.
pub fn over(port: u16, w: TcpStream, read: Duration) -> io::Result<Conn> {
    w.set_write_timeout(Some(Duration::from_secs(30)))?;
    w.set_read_timeout(Some(read))?;
    let r = BufReader::new(w.try_clone()?);
    Ok(Conn { port, w, r, sent: false })
}

/// Interim (1xx) heads read before the answer's own. HTTP/1.1 sends at most one 100 Continue
/// per request, and neither llama-server nor serve-legal.mjs sends any; eight is room to spare.
const MAX_INTERIM: u32 = 8;

/// A bound on a whole exchange, where a per-read timeout bounds only each read: a peer that
/// trickles a byte at a time resets it forever. Past `total` the socket is shut down, which
/// fails the read in progress at once; `passed` then says that was why. Dropping it first
/// cancels it.
pub struct Deadline {
    _cancel: std::sync::mpsc::Sender<()>,
    passed: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl Deadline {
    pub fn passed(&self) -> bool {
        self.passed.load(std::sync::atomic::Ordering::SeqCst)
    }
}

/// Shut `s` (a handle on the connection, from try_clone) down once `total` has gone by, unless
/// the Deadline is dropped first.
pub fn hang_up_after(s: TcpStream, total: Duration) -> Deadline {
    let (cancel, wait) = std::sync::mpsc::channel::<()>();
    let passed = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = passed.clone();
    std::thread::spawn(move || {
        if let Err(std::sync::mpsc::RecvTimeoutError::Timeout) = wait.recv_timeout(total) {
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
            let _ = s.shutdown(std::net::Shutdown::Both);
        }
    });
    Deadline { _cancel: cancel, passed }
}

/// One CRLF-terminated line, at most `cap` bytes: a peer that never sends a newline cannot
/// grow this without bound.
fn line(r: &mut impl BufRead, cap: u64) -> io::Result<String> {
    let mut buf = Vec::new();
    r.take(cap).read_until(b'\n', &mut buf)?;
    if buf.last() != Some(&b'\n') {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "HTTP line too long or connection closed"));
    }
    Ok(String::from_utf8_lossy(&buf).trim_end_matches(['\r', '\n']).to_string())
}

/// Chunked transfer coding, which Node uses for a streamed response of unknown length.
struct Chunked<R: BufRead> {
    inner: R,
    left: u64,
    done: bool,
}

impl<R: BufRead> Read for Chunked<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.done || buf.is_empty() {
            return Ok(0);
        }
        if self.left == 0 {
            let size = line(&mut self.inner, 1024)?;
            let hex = size.split(';').next().unwrap_or("").trim();
            let n = u64::from_str_radix(hex, 16)
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, format!("bad chunk size {hex:?}")))?;
            if n == 0 {
                while !line(&mut self.inner, 8192)?.is_empty() {} // trailers, then the blank line
                self.done = true;
                return Ok(0);
            }
            self.left = n;
        }
        let want = buf.len().min(self.left.min(usize::MAX as u64) as usize);
        let got = self.inner.read(&mut buf[..want])?;
        if got == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "connection closed inside a chunk"));
        }
        self.left -= got as u64;
        if self.left == 0 && !line(&mut self.inner, 2)?.is_empty() {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "chunk not followed by CRLF"));
        }
        Ok(got)
    }
}

/// A request on `w`: its head, then its body. `sent` is set once the head is out and before the
/// first byte of a non-empty body, not after the last: a write that fails partway has still put
/// part of the document on the wire (Conn::body_sent). Apart from Conn so a test can fail the
/// write partway, which no real loopback peer does on Windows.
fn send_on(w: &mut impl Write, sent: &mut bool, head: &str, body: &[u8]) -> io::Result<()> {
    w.write_all(head.as_bytes())?;
    *sent |= !body.is_empty();
    w.write_all(body)?;
    w.flush()
}

impl Conn {
    /// A second handle on this connection's socket, so another thread can shut it down: the
    /// read in post_lines then fails at once, and the service sees its caller hang up, which
    /// stops its chain (serve-legal.mjs). engine.rs shuts it down when the relay trips the run
    /// (relay.rs begin_run) or the checked model server exits (model_watch.rs).
    pub fn hangup_handle(&self) -> io::Result<TcpStream> {
        self.w.try_clone()
    }

    fn send(&mut self, head: &str, body: &[u8]) -> io::Result<()> {
        send_on(&mut self.w, &mut self.sent, head, body)
    }

    /// Whether any request body (for /strip, the document) has started to go out on this
    /// connection, whatever came back. engine.rs reads it after a failed run: a service that
    /// received the document and then failed is a different thing to tell the lawyer than one
    /// that was never reached, and a hand-started one that read it must be named (wf5 S5L-1).
    pub fn body_sent(&self) -> bool {
        self.sent
    }

    fn head(&mut self) -> Result<Head, String> {
        // A 1xx head is followed by the real one. Counted, because each one resets the per-read
        // timeout: a peer that sent "100 Continue" once a second held complete_local 20 s and
        // counting, with no bound but the peer's patience (wf5 S5L-3).
        let mut interim = 0;
        loop {
            let status_line = line(&mut self.r, 8192).map_err(|e| format!("no HTTP response ({e})"))?;
            let status = status_line
                .strip_prefix("HTTP/1.")
                .and_then(|s| s.get(2..))
                .and_then(|s| s.split_whitespace().next())
                .and_then(|s| s.parse::<u16>().ok())
                .ok_or_else(|| format!("not an HTTP response: {:?}", status_line.chars().take(60).collect::<String>()))?;
            let (mut length, mut chunked) = (None, false);
            for _ in 0..100 {
                let h = line(&mut self.r, 8192).map_err(|e| format!("bad HTTP header ({e})"))?;
                if h.is_empty() {
                    break;
                }
                if let Some((k, v)) = h.split_once(':') {
                    let (k, v) = (k.trim().to_ascii_lowercase(), v.trim());
                    if k == "content-length" {
                        length = v.parse::<u64>().ok();
                    } else if k == "transfer-encoding" && v.to_ascii_lowercase().contains("chunked") {
                        chunked = true;
                    }
                }
            }
            if (100..200).contains(&status) {
                interim += 1;
                if interim > MAX_INTERIM {
                    return Err(format!("more than {MAX_INTERIM} interim (HTTP 1xx) responses and no answer"));
                }
                continue; // an interim response; the real one follows
            }
            return Ok(Head { status, length, chunked });
        }
    }

    /// The body as a reader, framed by the response head and never more than `cap` bytes.
    fn body<'a>(&'a mut self, h: &Head, cap: u64) -> Box<dyn BufRead + 'a> {
        if h.chunked {
            Box::new(BufReader::new(Chunked { inner: &mut self.r, left: 0, done: false }.take(cap)))
        } else if let Some(n) = h.length {
            Box::new((&mut self.r).take(n.min(cap)))
        } else {
            Box::new((&mut self.r).take(cap)) // framed by the peer closing the connection
        }
    }

    fn body_text(&mut self, h: &Head, cap: u64) -> Result<String, String> {
        let mut b = Vec::new();
        self.body(h, cap).read_to_end(&mut b).map_err(|e| format!("reading the response: {e}"))?;
        // A closed connection reads as the end of the body. Short of its Content-Length it is a
        // cut answer, not a whole one: a model server that died mid-answer, or a connection shut
        // at complete_local's deadline, was read as an answer ("NONE" from a body cut 400 bytes
        // short, wf5 S5L-3).
        if let Some(n) = h.length.filter(|&n| n <= cap && (b.len() as u64) < n) {
            return Err(format!("the connection closed after {} of the answer's {n} bytes", b.len()));
        }
        Ok(String::from_utf8_lossy(&b).into_owned())
    }

    /// Step 2. `nonce` is 64 lowercase hex from the OS generator; `candidates` are the tokens a
    /// service this app may use could hold. Err is the reason, in words, that the process on
    /// the port is NOT one of them — the caller names the port and refuses it.
    pub fn hello(&mut self, nonce: &str, candidates: &[&str]) -> Result<Hello, String> {
        let req = format!(
            "GET /hello HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nX-Simpler-Challenge: {nonce}\r\nConnection: keep-alive\r\n\r\n",
            self.port
        );
        self.send(&req, b"").map_err(|e| format!("it closed the connection ({e})"))?;
        let h = self.head()?;
        let text = self.body_text(&h, 64 * 1024)?;
        if h.status != 200 {
            return Err(format!(
                "it answered the handshake with HTTP {} — not this app's engine service, or one older than the handshake",
                h.status
            ));
        }
        let v: serde_json::Value =
            serde_json::from_str(&text).map_err(|_| "its answer to the handshake is not JSON".to_string())?;
        let (Some(payload), Some(given)) = (v["payload"].as_str(), v["proof"].as_str()) else {
            return Err("its answer to the handshake carries no proof".into());
        };
        let which = candidates
            .iter()
            .position(|t| ct_eq(proof(t, nonce, payload).as_bytes(), given.as_bytes()))
            .ok_or_else(|| "it could not prove it holds this app's token".to_string())?;
        let p: serde_json::Value =
            serde_json::from_str(payload).map_err(|_| "its proven payload is not JSON".to_string())?;
        // The port inside the proof, not the one we dialled: a proof relayed from a service on
        // another port names that port and fails here.
        if p["v"].as_u64() != Some(1) || p["service"].as_str() != Some("serve-legal") || p["port"].as_u64() != Some(self.port as u64) {
            return Err(format!("its proven payload does not describe the engine service on port {}", self.port));
        }
        Ok(Hello {
            which,
            engine: p["engine"].as_str().unwrap_or("").to_string(),
            llama_port: p["llama"].as_u64().and_then(|n| u16::try_from(n).ok()).unwrap_or(0),
            llama_ok: p["llamaOk"].as_bool().unwrap_or(false),
            pid: p["pid"].as_u64().and_then(|n| u32::try_from(n).ok()).unwrap_or(0),
            llama_per_run: p["llamaPerRun"].as_bool() == Some(true),
        })
    }

    /// One POST on this connection, the whole answer read into memory (at most `cap` bytes).
    /// complete_local's road to the model: `over` wraps a socket relay.rs has already verified,
    /// so the request goes on the connection whose far end was checked, and on no other.
    /// `extra` is further header lines, each ending in CRLF.
    pub fn post(&mut self, path: &str, extra: &str, body: &str, cap: u64) -> Result<(u16, String), String> {
        let head = format!(
            "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n{extra}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            self.port,
            body.len()
        );
        self.send(&head, body.as_bytes()).map_err(|e| format!("the connection closed ({e})"))?;
        let h = self.head()?;
        let text = self.body_text(&h, cap)?;
        Ok((h.status, text))
    }

    /// Step 3, on the connection `hello` proved. Every NDJSON line goes to `on_line` in order.
    /// A non-200 comes back as the error with the service's own words (its fail-loud 503 when
    /// the model is offline, its 400 naming the doctrines it accepts). `stall` bounds each read
    /// and `total` the whole stream: the adapter bounds every stage itself (30 min each) and
    /// always ends the stream, so these are the fail-loud bound for a hung upstream.
    pub fn post_lines(
        &mut self,
        path: &str,
        bearer: &str,
        body: &str,
        stall: Duration,
        total: Duration,
        mut on_line: impl FnMut(serde_json::Value) -> Result<(), String>,
    ) -> Result<usize, String> {
        let head = format!(
            "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAuthorization: Bearer {bearer}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            self.port,
            body.len()
        );
        self.send(&head, body.as_bytes()).map_err(|e| format!("legal service: {e}"))?;
        // On `r`, the handle every read goes through. `r` is a try_clone of `w`, and on Windows a
        // read timeout set on one handle after the clone does not reach the other: set on `w`, as
        // it was until 2026-09-25, connect()'s 5 s stayed on `r` and cut every /strip stream
        // about 5 s in with os error 10060, so the built app finished 0 of 65 real documents
        // through the engine (launch workflow lane R). Test: a_stream_is_read_under_its_own_stall.
        let _ = self.r.get_ref().set_read_timeout(Some(stall));
        let h = self.head().map_err(|e| format!("legal service: {e}"))?;
        if h.status != 200 {
            let t = self.body_text(&h, 64 * 1024).unwrap_or_default();
            return Err(format!("legal service http {}: {}", h.status, t.chars().take(400).collect::<String>()));
        }
        let started = Instant::now();
        let mut lines = 0usize;
        // the done line carries the whole redacted document: 1 GiB, not a small default cap
        for l in self.body(&h, 1 << 30).lines() {
            let l = l.map_err(|e| format!("legal service stream: {e}"))?;
            if started.elapsed() > total {
                return Err(format!("legal service stream: still running after {} min; abandoned", total.as_secs() / 60));
            }
            let l = l.trim();
            if l.is_empty() {
                continue;
            }
            let v: serde_json::Value =
                serde_json::from_str(l).map_err(|e| format!("legal service sent a non-JSON line: {e}"))?;
            lines += 1;
            on_line(v)?;
        }
        if lines == 0 {
            return Err("legal service stream ended without a line".into());
        }
        Ok(lines)
    }
}

// Scratch servers take their ports through port_owner.rs's picker (SCRATCH), so these tests do not
// compile in the stand-alone harness the header mentions; the code above still does.
#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn from_hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    /// RFC 4231 test cases 2 and 6: a short key, and a key longer than the block, which takes the
    /// hash-the-key-first branch. serve-legal.mjs uses node:crypto's HMAC, so a home-made HMAC
    /// that drifted from the RFC would fail every handshake; these vectors pin it to the RFC.
    #[test]
    fn hmac_matches_rfc_4231() {
        assert_eq!(
            hex(&hmac_sha256(b"Jefe", b"what do ya want for nothing?")),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        let long = [0xaau8; 131];
        assert_eq!(
            hex(&hmac_sha256(&long, b"Test Using Larger Than Block-Size Key - Hash Key First")),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        );
        // CONTROL: one byte of key changed changes the MAC, so the vectors are not matched by a
        // function that ignores its key
        assert_ne!(
            hex(&hmac_sha256(b"Jefd", b"what do ya want for nothing?")),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        assert!(ct_eq(&from_hex("00ff"), &[0, 255]) && !ct_eq(b"ab", b"ac") && !ct_eq(b"ab", b"abc"));
    }

    /// Reads one request (head, and a Content-Length body) off the stub's side of a connection.
    fn read_request(r: &mut BufReader<TcpStream>) -> (String, String) {
        let mut head = String::new();
        let mut len = 0usize;
        loop {
            let l = line(r, 8192).expect("request line");
            if l.is_empty() {
                break;
            }
            if let Some(v) = l.to_ascii_lowercase().strip_prefix("content-length:") {
                len = v.trim().parse().unwrap();
            }
            head.push_str(&l);
            head.push('\n');
        }
        let mut body = vec![0u8; len];
        r.read_exact(&mut body).unwrap();
        (head, String::from_utf8(body).unwrap())
    }

    /// A stand-in for serve-legal.mjs's /hello: proves `payload(port)` with `token`.
    fn hello_stub(token: &'static str, payload: impl Fn(u16) -> String + Send + 'static) -> (u16, std::thread::JoinHandle<()>) {
        let l = crate::port_owner::scratch_listener();
        let port = l.local_addr().unwrap().port();
        let t = std::thread::spawn(move || {
            let (s, _) = l.accept().unwrap();
            let mut r = BufReader::new(s.try_clone().unwrap());
            let (head, _) = read_request(&mut r);
            let nonce = head
                .lines()
                .find_map(|h| h.strip_prefix("X-Simpler-Challenge: "))
                .expect("the challenge header")
                .to_string();
            let p = payload(port);
            let body = serde_json::json!({ "payload": p, "proof": proof(token, &nonce, &p) }).to_string();
            let mut w = s;
            let _ = write!(w, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}", body.len());
        });
        (port, t)
    }

    fn payload(port: u16, per_run: bool) -> String {
        let mut p = serde_json::json!({
            "v": 1, "service": "serve-legal", "engine": "v1-legal", "port": port,
            "llama": 49400, "llamaOk": true, "pid": 4242,
        });
        if per_run {
            p["llamaPerRun"] = serde_json::Value::Bool(true);
        }
        p.to_string()
    }

    const NONCE: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    #[test]
    fn hello_accepts_a_proof_by_a_candidate_token_and_reads_its_payload() {
        let (port, t) = hello_stub("tok-b", |p| payload(p, true));
        let mut c = connect(port).unwrap().expect("the stub");
        let h = c.hello(NONCE, &["tok-a", "tok-b"]).expect("a valid proof");
        assert_eq!((h.which, h.pid, h.llama_port, h.llama_ok, h.llama_per_run), (1, 4242, 49400, true, true));
        t.join().unwrap();
        // CONTROL: the same service without the per-run capability reads as without it, which is
        // what engine.rs refuses (a service that would dial the model port itself)
        let (port, t) = hello_stub("tok-b", |p| payload(p, false));
        let h = connect(port).unwrap().unwrap().hello(NONCE, &["tok-b"]).unwrap();
        assert!(!h.llama_per_run);
        t.join().unwrap();
    }

    #[test]
    fn hello_refuses_a_service_without_the_token() {
        let (port, t) = hello_stub("someone-elses", |p| payload(p, true));
        let e = connect(port).unwrap().unwrap().hello(NONCE, &["tok-a"]).err().expect("a refusal");
        assert!(e.contains("could not prove"), "{e}");
        t.join().unwrap();
    }

    #[test]
    fn hello_refuses_a_proof_relayed_from_another_port() {
        // a squatter on this port that forwards the challenge to the real service elsewhere gets
        // a valid proof of a payload naming THAT port
        let (port, t) = hello_stub("tok-a", |p| payload(p + 1, true));
        let e = connect(port).unwrap().unwrap().hello(NONCE, &["tok-a"]).err().expect("a refusal");
        assert!(e.contains(&format!("port {port}")), "{e}");
        t.join().unwrap();
    }

    /// A one-shot stub: answers the first request with `reply`, hands back what it received.
    fn serve(reply: &'static str) -> (u16, std::thread::JoinHandle<(String, String)>) {
        let l: TcpListener = crate::port_owner::scratch_listener();
        let port = l.local_addr().unwrap().port();
        let t = std::thread::spawn(move || {
            let (s, _) = l.accept().unwrap();
            let mut r = BufReader::new(s.try_clone().unwrap());
            let got = read_request(&mut r);
            let mut w = s;
            w.write_all(reply.as_bytes()).unwrap();
            got
        });
        (port, t)
    }

    #[test]
    fn post_lines_reads_a_chunked_ndjson_stream_line_by_line() {
        let reply = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n\
                     6\r\n{\"a\":1\r\n4\r\n}\n{\"\r\n7\r\nb\":2}\n\n\r\n0\r\n\r\n";
        let (port, t) = serve(reply);
        let mut c = connect(port).unwrap().unwrap();
        let mut seen = Vec::new();
        let n = c
            .post_lines("/strip", "BEARER", "{\"text\":\"x\"}", Duration::from_secs(5), Duration::from_secs(60), |v| {
                seen.push(v);
                Ok(())
            })
            .unwrap();
        assert_eq!(n, 2);
        assert_eq!(seen, vec![serde_json::json!({"a":1}), serde_json::json!({"b":2})]);
        let (head, body) = t.join().unwrap();
        assert!(head.contains("Authorization: Bearer BEARER"), "{head}");
        assert_eq!(body, "{\"text\":\"x\"}");
    }

    #[test]
    fn post_lines_returns_the_services_own_refusal() {
        // CONTROL for the stream test: a non-200 is an error with the service's words, not an
        // empty stream read as success
        let reply = "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 17\r\n\r\nmodel not running";
        let (port, t) = serve(reply);
        let e = connect(port)
            .unwrap()
            .unwrap()
            .post_lines("/strip", "B", "{}", Duration::from_secs(5), Duration::from_secs(60), |_| Ok(()))
            .err()
            .expect("a refusal");
        assert!(e.contains("503") && e.contains("model not running"), "{e}");
        t.join().unwrap();
    }

    /// A stand-in whose answer starts `after` the request arrives: /strip streams its first
    /// line only once the pipeline's first stage is done, seconds after the document went in.
    fn serve_after(after: Duration, reply: &'static str) -> (u16, std::thread::JoinHandle<()>) {
        let l: TcpListener = crate::port_owner::scratch_listener();
        let port = l.local_addr().unwrap().port();
        let t = std::thread::spawn(move || {
            let (s, _) = l.accept().unwrap();
            let mut r = BufReader::new(s.try_clone().unwrap());
            read_request(&mut r);
            std::thread::sleep(after);
            let mut w = s;
            let _ = w.write_all(reply.as_bytes());
        });
        (port, t)
    }

    /// post_lines's stall is the bound on its reads, not connect()'s 5 s. It was set on the
    /// write handle, which the reads never go through, and every real document through the built
    /// app was cut about 5 s in (2026-09-25). A stall of 5 s here could not tell the two apart,
    /// which is how the stream test above passed all along.
    #[test]
    fn a_stream_is_read_under_its_own_stall() {
        let reply = "HTTP/1.1 200 OK
Content-Length: 13

{\"done\":true}";
        let (port, t) = serve_after(Duration::from_millis(6000), reply);
        let mut c = connect(port).unwrap().unwrap();
        let r = c.post_lines("/strip", "B", "{}", Duration::from_secs(30), Duration::from_secs(60), |_| Ok(()));
        assert_eq!(r, Ok(1), "an answer 6 s in, under a 30 s stall");
        t.join().unwrap();
        // CONTROL: the stall also cuts SHORTER than 5 s, so it is the stall that bounds the read
        let (port, t) = serve_after(Duration::from_millis(3000), reply);
        let mut c = connect(port).unwrap().unwrap();
        let started = Instant::now();
        let r = c.post_lines("/strip", "B", "{}", Duration::from_secs(1), Duration::from_secs(60), |_| Ok(()));
        assert!(r.is_err() && started.elapsed() < Duration::from_millis(2500), "an answer 3 s in, under a 1 s stall: {r:?} after {:?}", started.elapsed());
        t.join().unwrap();
    }

    #[test]
    fn post_over_a_connected_socket_sends_on_that_socket() {
        let reply = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok";
        let (port, t) = serve(reply);
        let s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let mut c = over(port, s, Duration::from_secs(5)).unwrap();
        let (status, text) = c.post("/v1/chat/completions", "Authorization: Bearer K\r\n", "{\"m\":1}", 1024).unwrap();
        assert_eq!((status, text.as_str()), (200, "ok"));
        let (head, body) = t.join().unwrap();
        assert!(head.starts_with("POST /v1/chat/completions HTTP/1.1\n"), "{head}");
        assert!(head.contains("Authorization: Bearer K"), "{head}");
        assert_eq!(body, "{\"m\":1}");
    }

    /// An answer cut short of its Content-Length is not an answer: the closed connection read as
    /// the end of the body, and `{"…":"NONE"}` cut 400 bytes short came back as the model's
    /// "nothing found" (wf5 S5L-3, run-attack A2). CONTROL: post_over_a_connected_socket above,
    /// whose body is exactly its length.
    #[test]
    fn an_answer_cut_short_of_its_length_is_refused() {
        let (port, t) = serve("HTTP/1.1 200 OK\r\nContent-Length: 40\r\n\r\nNONE");
        let mut c = over(port, TcpStream::connect(("127.0.0.1", port)).unwrap(), Duration::from_secs(5)).unwrap();
        let r = c.post("/v1/chat/completions", "", "{}", 1024);
        t.join().unwrap();
        // the closed connection is the cut. One run in about 45 failed an assertion that took
        // only the length words; its message was not captured. The likely cause: the stand-in
        // closes with the request unread, which Windows sends as a reset, and a reset is refused
        // with the socket's words. Either refusal is right; what must never pass is an Ok.
        assert!(r.as_ref().is_err_and(|e| e.contains("after 4 of the answer's 40 bytes") || e.contains("reading the response")), "{r:?}");
    }

    /// A writer that takes `room` bytes and then fails as a reset connection does.
    struct Cut {
        room: usize,
    }
    impl Write for Cut {
        fn write(&mut self, b: &[u8]) -> io::Result<usize> {
            if self.room == 0 {
                return Err(io::Error::new(io::ErrorKind::ConnectionReset, "reset by the peer"));
            }
            let n = b.len().min(self.room);
            self.room -= n;
            Ok(n)
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    /// A connection that fails partway through the body has had the document start to reach the
    /// peer: body_sent says so though the write failed. Set only once the body was all written,
    /// it read false, and engine.rs receipted a service that read part of the document "not
    /// reachable" (wf5 S3R-4, mutant R3, which passed the whole suite). A writer stands in for
    /// the socket because Windows takes a 256 MB loopback write whole, so no real peer that
    /// hangs up mid-body makes the write itself fail (measured 2026-09-23: a peer that read the
    /// head and 1 KB of a 64 MB body and closed, and one that read nothing for 4 s, both left
    /// the write Ok and failed only the read that followed).
    #[test]
    fn a_body_cut_off_mid_write_still_counts_as_sent() {
        let (head, body) = ("POST /strip HTTP/1.1\r\n\r\n", br#"{"text":"CLIENT-MARKER"}"#);
        let mut sent = false;
        let r = send_on(&mut Cut { room: head.len() + 5 }, &mut sent, head, body);
        assert!(r.is_err() && sent, "a body cut after 5 bytes: {r:?}, sent {sent}");
        // CONTROL: a connection that could not carry the head sent no body, and a request with
        // no body sent none, so the pass above is about the body and not about being called
        let mut sent = false;
        assert!(send_on(&mut Cut { room: 5 }, &mut sent, head, body).is_err() && !sent, "the head failed, and nothing of the body went");
        let mut sent = false;
        assert!(send_on(&mut Cut { room: 1 << 20 }, &mut sent, head, b"").is_ok() && !sent, "a request with no body");
        let mut sent = false;
        assert!(send_on(&mut Cut { room: 1 << 20 }, &mut sent, head, body).is_ok() && sent, "a whole body");
    }

    /// A peer that answers with interim heads and never a final one is refused once it has sent
    /// more than any HTTP/1.1 server sends: each one reset the per-read timeout, so a model
    /// server doing that once a second held a call open without bound (wf5 S5L-3).
    #[test]
    fn interim_responses_are_counted_and_an_endless_run_of_them_is_refused() {
        let ask = |interim: usize| {
            let reply = format!("{}HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok", "HTTP/1.1 100 Continue\r\n\r\n".repeat(interim));
            let (port, t) = serve(Box::leak(reply.into_boxed_str()));
            let mut c = over(port, TcpStream::connect(("127.0.0.1", port)).unwrap(), Duration::from_secs(5)).unwrap();
            let r = c.post("/v1/chat/completions", "", "{}", 1024);
            t.join().unwrap();
            (r, c.body_sent())
        };
        let (endless, sent) = ask(MAX_INTERIM as usize + 1);
        assert!(endless.as_ref().is_err_and(|e| e.contains("interim")), "{endless:?}");
        assert!(sent, "the request body went out before the answer was refused");
        // CONTROL: the interim heads a real server may send are skipped and the answer read
        assert_eq!(ask(2).0, Ok((200, "ok".to_string())));
        assert_eq!(ask(MAX_INTERIM as usize).0, Ok((200, "ok".to_string())));
    }
}
