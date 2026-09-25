// Format routing by magic bytes, not extension trust. app/extract/detect.mjs, the node copy
// app/extract's tests route with (no shipped path runs it), is generated from this file (`node
// test/intake-refusal.mjs --sync-mirror`, from app/frontend) and the intake gate fails while the
// two differ: a hand-kept copy fell a whole round behind, without the email or encoded-content rules.
import { readText } from './text';
import { flowLayout, inMainFlow, type DocxItem } from './docx';

export type Route =
  | { format: string; route: 'docx-walker' | 'pdf-walker' | 'text' }
  | { format: string; route: 'refuse'; reason: string };

// An email dropped here used to fall through to the plain-text lane with no warning, and
// that is a leak, not a gap: the same message carries its body twice — once as text/plain,
// once base64-encoded — plus base64 attachments. The engine masked the name it could read
// and never touched the encoded copy, which decodes back to the name, the DOB and the NI
// number in the file the lawyer sends out. The export check missed it because
// engine.ts spanSurvives() matches literal text, so it reported the export clean.
// Writing the MIME walker is the real fix and it is days; until then this refuses.

// An OLE directory names its streams in UTF-16LE; every Outlook message has "__substg1.0_"
// streams and no Word file does. Without this a .msg saved under another name was told to
// "open it in Word".
const MSG_STREAM = [...'__substg1.0_'].flatMap((c) => [c.charCodeAt(0), 0]);
function hasMsgStreams(buf: Uint8Array): boolean {
  outer: for (let i = 0; i + MSG_STREAM.length <= buf.length; i++) {
    for (let k = 0; k < MSG_STREAM.length; k++) if (buf[i + k] !== MSG_STREAM[k]) continue outer;
    return true;
  }
  return false;
}

// ========== Intake content rules ==========================================================
//
// What a text holds that the engine cannot read, decided on the DECODED text (readText, the
// same decode the text lane uses), anywhere in the file.
//
// The rule is the lawyer's, not the format's: a document whose text holds encoded content —
// a base64 attachment, a quoted-printable word split across a soft line break, an encoded mail
// header — is refused, because the engine masks what it can read and ships the rest. A frontier
// model decodes base64 in one step, so an encoded attachment that leaves unmasked is a leak,
// and the export check cannot see it either (engine.ts spanSurvives() matches literal text).
//
// Each rule has a near-miss it must let through, pinned in test/intake-refusal.mjs, with a
// false-refusal scan over every real text in the repo. What each near-miss is, and why:
//   - a hex digest (SHA-256 in an escrow or software-licence exhibit) is ACCEPTED: it is a one-way
//     fingerprint and nothing decodes from it. Hex that decodes to readable text is refused.
//   - a base64 digest, alone or one per line (SHA-256 padded, SHA-384 unpadded at 64), and a
//     key id are ACCEPTED for the same reason; a token that decodes to readable text is refused,
//     because that is a name carried where the engine cannot see it.
//   - a blockchain address or content id (Bitcoin, Monero, Solana, IPFS in base58; Ethereum as
//     0x-hex) is ACCEPTED: it is public, readable as written, and a forfeiture complaint or a
//     ransomware coverage brief is made of them.
//   - a link's query string ("?uri=CELEX:32016R0679", "?sort=DESC", "?e=F1a…") is ACCEPTED: "=E9"
//     only means a letter in a quoted-printable body, and a link is not one. A click id past 88
//     characters in a query or a link's path (a gclid, an Outlook Safe Links record, a HubSpot
//     tracked link) is judged by what it decodes to, not by its length, and so is each segment of
//     a path; a browser's escape of an accented letter ("%C3%89") is ACCEPTED. A link a mail gateway
//     rewrote (Safe Links, Proofpoint, Barracuda) is judged by the link it carries, on one line as
//     that link would be on its own. Printed across rows it is close to that, not the same: in an
//     email printed at 60–130 columns with the link cut at the margin, court, EDGAR, DocuSign,
//     Teams and SharePoint links were held 0 of 3,195 unwrapped, 0–1 of 3,195 under Proofpoint
//     v2 (a Teams link), 0 under v3 and Barracuda, and 0–4 of 3,195 under Safe Links, across two
//     random draws; a Teams link alone, cut at 30–130, 3 of 3,000; a Teams link under Proofpoint v2 cut at 30–130, 0 of 798 as v2 writes
//     "/" ("_") and 6 to 11 of 798 where it is written "-2F" (a row opening out of step that reads
//     as text by chance). A Zoom invitation with a pre-2022 passcode, printed under a gateway, is
//     held far more often (404 to 727 of 3,000 hard-cut prints): that remainder is older than this
//     reading and is open. So is a Zoom recording's share link and a HubSpot tracked link printed
//     across rows, with or without a gateway: 147 and 69 of 1,737 prints unwrapped, 414 and 117
//     under Proofpoint v3, whose value is the link as written.
//   - an IBAN or EORI number whose country code is two hex letters ("DE", "EE") is ACCEPTED.
//   - a column of record ids sharing a prefix (Stripe, Salesforce, Google Drive) is ACCEPTED;
//     so are a key=token log line and hex written "FFh", which are not quoted-printable.
//   - a PEM block (certificate, key) is REFUSED: a certificate names its subject and their email
//     address in DER a model decodes in one step, and a private key is a credential. The way
//     through costs the lawyer one deletion.
//   - a TO:/FROM:/RE: memo and Outlook's own "Save As → Text" (From:/Sent:/To:/Subject:) are
//     ACCEPTED: the mail rule keys on headers only a mail transport writes, and Save As → Text
//     is the way through Drop.tsx gives for emails. So are documents that QUOTE transport lines
//     without the message's own From or Date — a forensic declaration's "in relevant part", a
//     CAN-SPAM opinion's Received lines, an ESI slip sheet's Message-ID field.

/** `kind`: encoded content whose words differ from an attachment's — inside a link, letters
 *  written as percent-escapes, quoted-printable email encoding, or an encoded email header word.
 *  A PDF page's refusal (pdf.ts) names it from this, so the three formats say the same thing
 *  about the same content. */
export interface Hold { format: string; line: number; reason: string; kind?: 'link' | 'percent' | 'qp' | 'header' }

/** Where a hold is, in the words the refusal uses: "This file" and "line" for a dropped text,
 *  "This document’s footer" and "paragraph" for a part of a Word file. `at` names the place
 *  itself when a line of the text is not what the lawyer can find (a Word paragraph). */
interface Where { what: string; unit: string; at?: (line: number) => string }
const FILE: Where = { what: 'This file', unit: 'line' };

// The same line breaks every rule splits on (\r\n, \r, \n): a file saved with bare CRs used to
// be told "line 1" for a hold on line 3.
const EOL = /\r\n|\r|\n/;
const lineAt = (text: string, index: number): number => {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) n++;
  }
  return n;
};

// ---------- mail header block, anywhere in the text ----------------------------------------

// Headers only a mail transport writes, each with the shape its value takes, because the name
// alone occurs in prose ("Received: from counsel on 5 May"). Content-Type and
// Content-Disposition are left out on purpose: an API specification quoted in a contract
// exhibit carries both, and it is not an email.
const TRANSPORT: Record<string, RegExp> = {
  'mime-version': /^1\.0\b/,
  'content-transfer-encoding': /^(?:base64|quoted-printable|7bit|8bit|binary)\b/i,
  'message-id': /^<[^<>\s@]+@[^<>\s]+>/,
  // SMTP's own trace: "from HOST … by HOST with ESMTPS id X; DATE". "from … by …" alone is an
  // evidence log ("Received: from Det. J. Smith by Evidence Tech. M. Jones") or a
  // correspondence register ("from the Claimant's solicitors by DX").
  'received': /^(?:from|by)\s+\S+[\s\S]*?(?:\bwith\s+\w*(?:SMTP|LMTP|MAPI|HTTP)\w*|\bid\s+[\w.-]*\d[\w.-]*|;\s*(?:[A-Z][a-z]{2},\s*)?\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4})/i,
  'return-path': /^<[^<>\s]*>/,
  'delivered-to': /^\S+@\S+/,
  'dkim-signature': /\bv=1\s*;/,
};
const HEADER = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*:[ \t]*(.*)$/;

/** The first line of a mail header block anywhere in the text, or 0. A block is two or more
 *  consecutive header lines (folded continuations included) that are a message's own header:
 *  two different transport headers with the shape their values take, plus the From or Date
 *  every message carries (RFC 5322 §3.6) — or a Content-Transfer-Encoding of base64 or
 *  quoted-printable, which announces an encoded part on its own. A document that quotes
 *  transport lines "in relevant part" (a forensic declaration, a CAN-SPAM opinion, an ESI slip
 *  sheet with a Message-ID field) is not a message and goes through; its lines are readable.
 *  Reading the whole text, not an opening window, is what closes the round-2 bypasses: a blank
 *  line or a forwarded-message line above the headers, a cover note above a pasted message, a
 *  header block past the first 4 KB. A "> " quote prefix is read through, because a message
 *  quoted in a reply is still a message. */
export function mailHeaderLine(text: string): number {
  const lines = text.split(EOL);
  let start = -1, count = 0, name = '', value = '';
  let transport = new Set<string>(), origin = false, encodedPart = false;
  const close = () => {
    const v = value.trim();
    if (name && TRANSPORT[name] && TRANSPORT[name].test(v)) {
      transport.add(name);
      if (name === 'content-transfer-encoding' && /^(?:base64|quoted-printable)\b/i.test(v)) encodedPart = true;
    }
    if (name === 'from' || name === 'date') origin = true;
    name = ''; value = '';
  };
  for (let i = 0; i <= lines.length; i++) {
    const raw = i < lines.length ? lines[i] : '';
    const bare = raw.replace(/^[ \t]*(?:>[ \t]?)+/, '');
    const h = bare.match(HEADER);
    if (h && !/^[ \t]/.test(bare)) {
      close();
      if (start < 0) { start = i; count = 0; transport = new Set(); origin = false; encodedPart = false; }
      count++;
      name = h[1].toLowerCase(); value = h[2];
      continue;
    }
    if (start >= 0 && /^[ \t]+\S/.test(bare)) { value += ' ' + bare.trim(); continue; } // folded
    if (start >= 0) {
      close();
      if (count >= 2 && (encodedPart || (transport.size >= 2 && origin))) return start + 1;
      start = -1;
    }
  }
  return 0;
}

// ---------- decoding probes ---------------------------------------------------------------

/** Does this byte string read as text? Used on what a base64 or hex token decodes to: a digest
 *  or key decodes to noise, an encoded name decodes to letters. UTF-16LE (every odd byte zero)
 *  is read through, since Windows encodes text that way. */
function readsAsText(bytes: Uint8Array): boolean {
  let b = bytes;
  if (b.length >= 8) {
    let z = 0;
    for (let i = 1; i < b.length; i += 2) if (b[i] === 0) z++;
    if (z >= (b.length / 2) * 0.9) b = b.filter((_, i) => i % 2 === 0);
  }
  if (b.length < 8) return false;
  let s: string;
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch {
    // Latin-1 text is mostly ASCII; a digest's bytes are high half the time.
    if (b.filter((x) => x >= 0x80).length > b.length * 0.2) return false;
    // ISO-8859-1 by hand: TextDecoder('latin1') is windows-1252, which reads 0x80–0x9F as
    // letters ("ˆ", "Š"), so an Outlook Safe Link's "%7C638856642265233166" read as text.
    s = String.fromCharCode(...b);
  }
  let ok = 0, letters = 0, n = 0;
  for (const ch of s) {
    n++;
    const c = ch.codePointAt(0)!;
    const letter = /\p{L}/u.test(ch);
    if (c === 9 || c === 10 || c === 13 || (c >= 0x20 && c < 0x7f) || (c >= 0xa0 && letter)) ok++;
    if (letter) letters++;
  }
  // "Jane Roe, DOB 01/02/1980, NI QQ123456C" is 42% letters; a quarter is the floor.
  if (ok / n < 0.95 || letters / n < 0.25) return false;
  // Under 24 characters the decode is judged by its shape. An 18–20 character identifier (an
  // LEI, a Salesforce id) decodes to printable junk ("PRRd^F\1.0"G") about once in 2,000, and a
  // privilege log carries hundreds; glued opinion text ("andNancyReynolds") decoded to ASCII
  // junk around one Hangul syllable that random bytes happened to form. Text is two Latin words
  // of three letters or more ("Jane Roe QQ123456C"), two letters running together in another
  // script (a name in Cyrillic, Greek, CJK), or words and numbers written the way a person
  // writes them.
  if (n >= 24) return true;
  if ((s.match(/[A-Za-zÀ-ɏ]{3,}/g) || []).length >= 2 || /[^\P{L}\u0000-ɏ]{2,}/u.test(s)) return true;
  // Words and numbers: letters and digits in runs, joined by spaces or the punctuation a
  // reference is written with, and either a space among them ("NI QQ123456C", "SW1A 1AA
  // London") or a word of two letters or more beside a number ("Roe/4471X", "id=Roe&no=4471").
  // Without this, round 3's two-word rule let an NI number or a surname and matter number
  // through in a portal link or a recovered string. An unbroken run ("QQ123456C", "Roe4471X")
  // still passes: that is what an identifier's junk looks like when it looks like anything.
  // Measured 2026-09-23 at 50,000 draws a class, paired: no more LEIs refused, one more
  // Salesforce id, three more random 8–11 byte hex serials; over the 5,114 real texts, nothing
  // more, as dropped or with every space removed. A tab or "|" is not a joint: with them, an F.3d
  // opinion with its spaces removed held on "afriendofAlmeida", which decodes to letters around
  // both, so its page would have been dropped.
  // What wraps a phrase is taken off its ends first — an opening bracket, brace or quote, and a
  // closing one or a stop — and a double quote is a joint: anchored on a letter or digit at
  // both ends, "(NI QQ123456C)", "NI QQ123456C!" and a short JWT payload {"sub":"QQ123456C"}
  // were judged "not text" and went out encoded. Any symbol at the ends, and braces as joints,
  // refused two of the LEIs and one of the Salesforce ids pinned in the test: an identifier's
  // junk is full of "{", "#" and ">".
  const t = s.trim().replace(/^[(\[{"']+\s*/, '').replace(/\s*[)\]}"'.,;:!?]+$/, '');
  if (!/^[\p{L}\p{N}]+(?:[ .,;:/#'"()&=_@+!?-]+[\p{L}\p{N}]+)+$/u.test(t)) return false;
  const parts = t.split(/[ .,;:/#'"()&=_@+!?-]+/);
  return t.includes(' ') || (parts.some((w) => /^\p{L}{2,}$/u.test(w)) && parts.some((w) => /\p{N}/u.test(w)));
}

function b64Bytes(token: string): Uint8Array | null {
  // One character past a whole quantum is dropped, as a lenient decoder drops it: atob refuses
  // the run outright, so a name with one stray letter after it went through undecoded.
  const t = token.length % 4 === 1 && !token.endsWith('=') ? token.slice(0, -1) : token;
  try {
    const bin = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

function hexBytes(token: string): Uint8Array {
  const out = new Uint8Array(token.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(token.substr(i * 2, 2), 16);
  return out;
}

// RFC 4648 base32 (capitals and 2–7, or all small letters): TOTP secrets, some portals' and
// transfer tools' ids. Every base32 token is valid base64 too, and read that way a name decodes
// to junk, so "Jane Roe QQ123456C" in base32 went through until it had a decode of its own.
const BASE32 = /^(?:[A-Z2-7]+|[a-z2-7]+)$/;
function b32Bytes(token: string): Uint8Array | null {
  if ([1, 3, 6].includes(token.length % 8)) return null;
  const out: number[] = [];
  let acc = 0, bits = 0;
  for (const ch of token.toUpperCase()) {
    acc = ((acc << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch)) & 0xfff;
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
  }
  return new Uint8Array(out);
}

// Outlook Safe Links carry Microsoft's own record in "data=", base64 between "%7C" separators:
// Mailflow|{"EmptyMapi":true,"V":"0.0.0000","P":"Win32","AN":"Mail","WT":2}. It reads as text
// and names no one (the link's real target is readable in "url="); Microsoft 365 rewrites
// every link in a firm's received mail this way, so a memo with a copied link was refused.
// Only these keys, with short values, are the record.
//
// A printout cuts the record wherever the row ends: the email printed to PDF, which is how most
// emails become exhibits. The row that starts at "TWFpbGZs…" decodes to the record's head cut
// short, and the next row, when it starts on a whole quantum, to its tail; read as text, a
// one-page memo was held as having "no readable text" (INT-4), and 108 of 162 widths from 50 to
// 130 held one row. So a piece of the record passes too: whole pairs as above, and at a cut end
// only a piece of Microsoft's own key names and values. A cut record carries no more than a
// whole one, and a record whose value is "Jane Roe QQ123456C" is refused whole or cut, because
// a space is in no value this accepts.
const SL_KEYS = ['EmptyMapi', 'V', 'P', 'AN', 'WT', 'F'], SL_VALUES = ['"0.0.0000"', '"Win32"', '"Mail"', 'true', 'false'];
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** every non-empty piece of each word that a cut at its start ('tail') or its end ('head') leaves */
const cutPieces = (words: string[], keep: 'head' | 'tail', min = 1) => words.flatMap((w) => [...w].map((_, i) => (keep === 'head' ? w.slice(0, i + 1) : w.slice(i))).filter((p) => p.length >= min)).map(reEsc).join('|');
const SL_VALUE = '(?:true|false|\\d{1,4}|"[\\w.]{0,16}")';
const SL_PAIR = `"(?:${SL_KEYS.join('|')})":${SL_VALUE}`;
const SL_KEYED = SL_KEYS.map((k) => `"${k}":`);
const SAFE_LINKS = new RegExp(
  // cut at its start: the end of "Mailflow|{", down to the "{" alone, of a key and its value, or
  // of a value. "Mailflow|" is nine bytes, three whole quanta, so a printed row very often opens
  // at the "{": with "|{" as the shortest cut, 21 of 1,296 real records printed at widths 50–130
  // were held. A "{" admits nothing the same row one character later (a pair) does not: what
  // follows must still be Microsoft's keys and values, and every named record stays held.
  `^(?:${cutPieces(['Mailflow|{'], 'tail', 1)}|(?:${cutPieces(SL_KEYED, 'tail')})${SL_VALUE}|${cutPieces(SL_VALUES, 'tail')}|\\d{1,4})?` +
  `(?:,?${SL_PAIR})*,?` +
  // cut at its end: the start of a key, or a key and the start of a value
  `(?:\\}|${cutPieces(SL_KEYED, 'head')}|(?:${SL_KEYED.map(reEsc).join('|')})(?:${cutPieces(SL_VALUES, 'head')}|\\d{1,4}))?$`,
);
/** The token is a Safe Links record, whole or a piece of one. A row that starts part-way into a
 *  quantum decodes out of step, and one over 88 characters is refused by its shape before it is
 *  decoded, so the three other starts are tried; each is still judged by SAFE_LINKS. `min`: the
 *  fewest bytes a piece may decode to, below which a few bytes of junk can match by chance. */
function safeLinksPiece(core: string, min = 8): boolean {
  if (core.length > 216) return false;
  for (let d = 0; d < 4; d++) {
    const b = b64Bytes(core.slice(d));
    if (!b || b.length < min) return false;
    if (SAFE_LINKS.test(String.fromCharCode(...b))) return true;
    // a decode that reads as text in step is judged as text, not realigned into a record
    if (d === 0 && readsAsText(b)) return false;
  }
  return false;
}

// ---------- base64 -------------------------------------------------------------------------

// A SHA-512 digest is 88 base64 characters, the longest fingerprint a document quotes. Past
// that a token is room for content: a data: URI image, an attachment written on one line.
const DIGEST_MAX = 88;
// In a link's query string, a value past 88 is judged by what it decodes to, up to this: a click
// id is 60–200 characters (a Google Ads gclid 92, a Safe Links record 100, a Bing ck/a value
// 158), an attachment is kilobytes. By shape alone each was refused as "an email attachment".
// A value that decodes to a zlib or gzip stream is still refused: that is a compressed document
// (a diagram tool's share link), which a model with a code tool unpacks. A path token in a link
// that has a scheme is read the same way (a HubSpot tracked link); a fragment ("#pako:…"), and a
// link's continuation printed on the next row, are judged by shape as before.
const LINK_VALUE_MAX = 512;
// 2 KB of hex is an embedded file (an RTF picture, a hex dump), not a list of fingerprints.
const HEX_BLOB = 4096;
// Base58 (Bitcoin, Monero, Solana, IPFS) leaves out 0, O, I, l, "+" and "/". A real base64 run
// of 89 characters lacks all six about 1.6 times in 10,000; a Monero address is 95.
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const HEX = /^(?:0x)?[0-9A-Fa-f]+$/;

const charClass = (c: number) => (c >= 65 && c <= 90 ? 1 : c >= 97 && c <= 122 ? 2 : c >= 48 && c <= 57 ? 3 : 4);

/** Encoder output, not words run together. A PDF whose text layer has no space characters
 *  reads as "ThisAgreementismadeandentered…", base64-alphabet for a whole line. Base64 changes
 *  between capital, small letter, digit and symbol at about two adjacent pairs in three; words
 *  change only where a word starts. Measured: random base64 runs of 89+ characters change at
 *  0.47 or more (0.50 at the 0.1% quantile of 4,000 draws); with every space removed from 5,088
 *  real legal texts, the highest run that has a digit and 20–80% capitals changes at 0.356
 *  (a Singapore judgment's "HC/OC233/2022andHC/SUM147/2023…", an opinion's "BASIC4"). */
function encoderShaped(s: string): boolean {
  const upper = (s.match(/[A-Z]/g) || []).length, lower = (s.match(/[a-z]/g) || []).length;
  const share = upper / Math.max(1, upper + lower);
  if (!/[0-9+/_-]/.test(s) || share < 0.2 || share > 0.8) return false;
  let changes = 0;
  for (let i = 1; i < s.length; i++) if (charClass(s.charCodeAt(i)) !== charClass(s.charCodeAt(i - 1))) changes++;
  return changes / Math.max(1, s.length - 1) >= 0.42;
}

/** What one base64-alphabet token (a whole line, or a run inside a line) carries. `query`: the
 *  token is in a link's query string. */
function tokenVerdict(tok: string, inner = false, query = false): 'text' | 'blob' | null {
  const core = tok.replace(/=+$/, '');
  if (HEX.test(core)) {
    const hex = core.replace(/^0x/, '');
    if (hex.length >= HEX_BLOB) return 'blob';
    // All digits is a number (an account, a Bates range), never hex: read as hex, about one
    // 16-digit number in a hundred decodes to printable bytes. So is a country code whose two
    // letters are hex letters ahead of digits alone: a German or Estonian IBAN or a German EORI
    // number read as hex was held about once in 250 draws, and the verdict is fixed by the
    // number, so every settlement agreement and invoice carrying that client's account was held.
    if (!/[A-Fa-f]/.test(hex) || !/[0-9]/.test(hex) || /^(?:AD|AE|AF|BA|BB|BD|BE|BF|CA|CD|CF|DE|EC|EE)\d{12,}$/.test(hex)) return null;
    return hex.length >= 16 && hex.length % 2 === 0 && readsAsText(hexBytes(hex)) ? 'text' : null;
  }
  if (BASE32.test(core) && /[2-7]/.test(core)) {
    const b = b32Bytes(core);
    if (b && readsAsText(b)) return 'text';
  }
  // before the length rule: a row that carries all 100 characters of the current record is past
  // 88, and on a printout its row has no "?" to mark it as a link's query
  if (safeLinksPiece(core)) return null;
  const long = core.length > DIGEST_MAX && !BASE58.test(core) && encoderShaped(core);
  if (long && !(query && core.length <= LINK_VALUE_MAX)) return 'blob';
  const bytes = b64Bytes(core);
  if (!bytes) return long ? 'blob' : null;
  if (long && ((bytes[0] === 0x1f && bytes[1] === 0x8b) || (bytes[0] === 0x78 && ((bytes[0] << 8) | bytes[1]) % 31 === 0))) return 'blob';
  // Zoom's pre-2022 passcode (…?pwd=SXFxYk1QM2Jn…) is base64 of a padded base64 string of 16
  // random bytes. The inner string is letters and digits, so it "reads as text"; what it
  // carries is judged instead. A name encoded twice is still refused. A link cut one
  // character short (a brief that dropped the final "9" of "…Z09") leaves the inner string
  // 23 characters ending in one "=": a truncated "==", accepted because the recursion still
  // judges the inner payload, so the widening passes random bytes only, never a name.
  if (!inner) {
    const once = new TextDecoder('latin1').decode(bytes);
    const padded = once.length % 4 === 0 || (once.length % 4 === 3 && /[^=]=$/.test(once));
    if (once.length >= 16 && padded && /^[A-Za-z0-9+/_-]+={1,2}$/.test(once)) return tokenVerdict(once, true);
    // A hex id or a UUID written in base64 (LinkedIn's otpToken, a "?ref=" id), with a counter or
    // two after it (",1,1", "_012"), is judged as the hex it spells: read as text, the hex digits
    // are letters and numbers, and 1,992 of 2,000 otpToken links were held. Hex that spells a name
    // is still refused, an odd length read in both steps: one stray digit either end must not
    // turn a name into "not text".
    const hexId = once.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}|[0-9a-f]{16,}|[0-9A-F]{16,})(?:[,;:|_]\d{1,4})*$/);
    // A printed row's piece of one ("0495d-607f-43ad-93c7-a95fe…", or its last group alone,
    // "64d3ebf8add3", a Teams meeting id cut by the row end) is judged the same way, in both
    // steps: read as text it held a printed Teams invitation at 362 of 7,100 prints, about four in
    // five at 67, 71, 75 and 79 columns, and the last group's "ebf" and "add" read as two words.
    const piece = !hexId && /^[0-9a-f-]{8,36}$/.test(once) && 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.includes(once.replace(/[0-9a-f]/g, 'x'));
    if (piece) { const h = once.replace(/-/g, ''); return readsAsText(hexBytes(h)) || readsAsText(hexBytes(h.slice(1))) ? 'text' : null; }
    if (hexId) { const h = hexId[1].replace(/-/g, ''); return readsAsText(hexBytes(h)) || (h.length % 2 === 1 && readsAsText(hexBytes(h.slice(1)))) ? 'text' : null; }
  }
  return readsAsText(bytes) ? 'text' : null;
}

// The word a value is glued to by "_" or "-" ("session_", "v1-", "DOC-", "magicLink_"): one case after
// its first letter, or camel-cased words.
// Any run of the alphabet before a "-" in a random token matched "[A-Za-z][A-Za-z0-9]{1,15}", and
// the rest, read out of step, decoded to text by chance: a Proofpoint v3 signature
// ("…vXobZq0Wz5O-WChSdnd54…") held 2 of 107,115 printed ordinary links.
const PREFIX = /^(?=[A-Za-z0-9]{2,16}[_-])(?:[A-Za-z][a-z0-9]+|[A-Z][A-Z0-9]+|[A-Za-z][a-z]+(?:[A-Z][a-z]{2,})+[0-9]{0,2})[_-]/;
// The words read past are wider than PREFIX's: camel humps of two letters and a version after them
// ("userIdV1", "magicLinkV2"), and a small letter before capitals ("iOS"). Without those, 42 of 120
// such shapes carrying the client's address or record passed; with them none, and the holds on
// 101,000 printed Proofpoint v3 signatures, 200,000 random tokens and 164,280 printed ordinary
// links under every gateway were the same, print for print.
const DEEP_WORD = String.raw`(?:[a-z]|[A-Za-z][a-z0-9]{1,31}|[A-Z][A-Z0-9]{1,15}|[A-Za-z][a-z]+(?:[A-Z][a-z]+)+(?:[A-Z]?[0-9]{1,2})?|[A-Z]{2,}[a-z]{2,}|[a-z]{2,}[A-Z][A-Z0-9]{0,2}|[a-z][A-Z][a-z]{2,}|[a-z][A-Z]{2,3})`;
const deeperHeads = (tok: string): number[] => { const out: number[] = []; for (let k = 1; k <= 4; k++) { const h = tok.match(new RegExp(`^(?:${DEEP_WORD}[_-]){${k}}`)); if (!h || h[0].length > 48) break; out.push(h[0].length); } return out; };

// A word, a number or an initial-capped name, with "-", "_" and "/" as joints: not an encoding.
const wordShaped = (s: string) => s.split(/[-_/]/).every((w) => /^(?:[A-Z]?[a-z]*|[A-Z]*|[0-9]*)$/.test(w));

/** Some segment of a link's path, read from its own first character, is encoded content: whole,
 *  and from past a word glued to it by "_" or "-" ("/r/session_amFuZS5y…/"), as base64Hold reads
 *  a token. */
function pathSegmentHold(path: string): boolean {
  return path.split('/').some((whole) => {
    const pre = whole.match(PREFIX);
    const rest = pre && !/(?:-[0-9A-F]{2}.*){2}/.test(whole) ? whole.slice(pre[0].length) : '';
    // a word of whole quanta leaves the value in step inside the segment: only the value is read
    const inStep = rest.replace(/=+$/, '').length >= 16 && !wordShaped(rest.replace(/=+$/, '')) && pre![0].length % 4 === 0;
    const deep = !/(?:-[0-9A-F]{2}.*){2}/.test(whole) ? deeperHeads(whole).map((h) => whole.slice(h)) : [];
    return [...(inStep ? [] : [whole]), ...(rest ? [rest] : []), ...deep].some((seg) => { const c = seg.replace(/=+$/, ''); return c.length >= 16 && !wordShaped(c) && tokenVerdict(seg, false, true) !== null; });
  });
}

/** A line that can belong to a wrapped block: the base64 alphabet (standard or URL-safe) once
 *  up to two stray spaces are taken out, as a decoder skips them. A MIME boundary ("--zz"), a
 *  rule of dashes and 0x-hex are not. `word` says the line is words ("Jane Roe", "Exhibit"). */
function blockLine(line: string): { s: string; word: boolean } | null {
  const parts = line.split(/[ \t]+/).filter(Boolean);
  if (!parts.length || parts.length > 3) return null;
  const s = parts.join('');
  // up to six "=": base32 pads to a multiple of eight
  if (!/^[A-Za-z0-9+/_-]+={0,6}$/.test(s) || !/[A-Za-z0-9]/.test(s) || s.startsWith('--') || /^0x[0-9A-Fa-f]+$/.test(s)) return null;
  return { s, word: parts.every((p) => wordShaped(p.replace(/=+$/, ''))) };
}

/** Consecutive alphabet lines that are one encoder's output, not a list of tokens. */
function wrappedBlock(block: Array<{ s: string; word: boolean }>): boolean {
  if (block.length < 2) return false;
  const run = block.map((b) => b.s);
  const joined = run.join('');
  // Read as one stream, the block decodes to text: a name, at any width it was wrapped at.
  // Twelve-column lines are each under the token rule's 16, and each decodes to a fragment.
  // A word line touching the block ("Attachment" above it, "Regards" under it) is left off, or
  // it would shift every character after it out of step.
  const from = block.findIndex((b) => !b.word);
  const to = block.length - [...block].reverse().findIndex((b) => !b.word);
  const stream = from < 0 ? '' : run.slice(from, to).join('');
  if (stream.length >= 16) {
    const core = stream.replace(/=+$/, '');
    const bytes = b64Bytes(core);
    // two rows of a printed Safe Link can both be nothing but the record
    if (bytes && readsAsText(bytes) && !safeLinksPiece(core)) return true;
    const b32 = BASE32.test(core) && /[2-7]/.test(core) ? b32Bytes(core) : null;
    if (b32 && readsAsText(b32)) return true;
  }
  // A SHA-512 digest broken over two lines of a narrow PDF column is 88 characters.
  if (joined.length <= DIGEST_MAX) return false;
  // A padded line before the last is a list of digests, one per line, each ending in "=".
  if (run.slice(0, -1).some((l) => l.endsWith('='))) return false;
  if (BASE58.test(joined) || HEX.test(joined) || !encoderShaped(joined)) return false;
  // A column of record ids shares its prefix: Stripe "ch_", Salesforce "001", Google Drive "1".
  // Sixteen of them were refused as an attachment (a response to a request for production, a
  // chargeback schedule), where the ids are the document. An encoder's lines share a first
  // character by chance once in 64 per line: eight lines, about once in 4 × 10¹².
  if (run.length >= 8 && run.every((l) => l[0] === run[0][0])) return false;
  const width = run[0].length, last = run[run.length - 1];
  if (run.slice(0, -1).every((l) => l.length === width) && last.length <= width) {
    // A column of short equal values with a total under it ("Jan 2024" … "Total") has this
    // shape; no encoder wraps under 60, and a binary part wrapped under 16 is not refused.
    if (width < 16) return false;
    // An encoder fills every line to its width (MIME 76, PEM 64) and ends short or padded.
    if (last.length < width || last.endsWith('=')) return true;
    // No tail: equal-length lines are also a list of unpadded digests (SHA-384 is 64
    // characters, three to an escrow schedule). Sixteen unlabelled fingerprints in a row is a
    // dump, not a schedule; an attachment whose size is an exact multiple of the line and
    // under sixteen lines (912 bytes at MIME's width) is the cost.
    return run.length >= 16;
  }
  // Uneven lines: a block a mail client or an editor re-wrapped (74 / 2 / 74 / 2 under a
  // "> " prefix, or hand-edited widths). Three lines, twice a digest's length, and half the
  // lines 40 or longer, so a 64-character digest over a 44-character one, or a table column
  // of short values, is not taken for it.
  return run.length >= 3 && joined.length > 2 * DIGEST_MAX && run.filter((l) => l.length >= 40).length * 2 >= run.length;
}

/** Where encoded content starts, and whether it is a value inside a link (a hold on a link must
 *  not send the lawyer to save an attachment that does not exist), or null. */
interface EncodedAt { line: number; link: boolean }

function base64Hold(text: string): EncodedAt | null {
  // Content that names its own encoding: a data: URI (an image or a file inline in Markdown or
  // HTML-derived text), and attachments encoded some other way, by their own opening line.
  const other = text.match(/data:[\w.+-]+\/[\w.+-]+(?:;[\w.+-]+=[\w.+-]+)*;base64,[A-Za-z0-9+/]{16,}|^=ybegin\s+(?:part=\d+\s+)?line=\d+\s+size=\d+\s+name=|^begin(?:-base64)?\s+[0-7]{3,4}\s+\S[^\r\n]*(?:\r\n|\r|\n)[!-`]{2,}/m);
  if (other) return { line: lineAt(text, other.index!), link: false };
  // A "> " quote prefix is read through, as the mail rule reads it: an attachment quoted in a
  // reply is 76-character lines that each decode to binary, which the token rule below passes.
  const lines = text.split(EOL).map((l) => l.replace(/^[ \t]*(?:>[ \t]?)+/, '').trim());
  // 1. Wrapped blocks, whatever width they were wrapped at: a binary attachment decodes to
  // noise line by line, so only the block's shape can refuse it.
  for (let i = 0; i < lines.length;) {
    if (blockLine(lines[i]) === null) { i++; continue; }
    const run: Array<{ s: string; word: boolean }> = [];
    let j = i;
    for (; j < lines.length; j++) {
      const b = blockLine(lines[j]);
      if (!b) break;
      run.push(b);
    }
    // from the block's first encoded line: a signature ("Kind regards" / "Jane Partner") or a
    // table's cell labels above it are word lines of the same run, and the lawyer sent to them
    // found nothing to delete
    if (wrappedBlock(run)) {
      const k = i + Math.max(0, run.findIndex((b) => !b.word));
      // A link's value printed across two or more full rows is a block of this shape too, and was
      // told to "save the attachment": 78 of 162 prints of an unsubscribe link's "?data=" value.
      // It is a link's when the rows above it continue, with no space at any row end, up to a
      // row whose last word is a link; a block under a row that ends in a space, a signature or a
      // MIME part's headers keeps the attachment reason.
      const src = text.split(EOL).map((l) => l.replace(/^[ \t]*(?:>[ \t]?)+/, ''));
      let link = false;
      // The row above must be as wide as the block only where the block's full rows are an
      // encoder's: all one width, and two or more of them or MIME's or PEM's width. A link printed
      // in a proportional font (Outlook or a browser printing to PDF) fills each row to the page
      // in points, so its rows differ in characters, and the row carrying the link's start was
      // never as wide: 433 of 1,020 such prints of three links carrying the client's address were
      // told to save an attachment. With this, 24. Monospace prints keep the link reason (972 of
      // 972), and attachments under a link row at 60, 64, 72 and 76 columns keep theirs.
      const full = src.slice(k, j - 1);
      const encoderRows = full.length > 0 && full.every((l) => l.length === full[0].length) && (full.length >= 2 || full[0].length === 64 || full[0].length === 76);
      for (let u = k - 1; u >= 0 && u >= k - 64 && /\S$/.test(src[u]) && (!encoderRows || Math.abs(src[k - 1].length - src[k].length) <= 1); u--) {
        if (/:\/\/|^www\.|[?&][\w.%-]*=/.test(src[u].split(/\s/).pop()!)) { link = true; break; }
        if (/\s/.test(src[u].trim())) break;
      }
      return { line: k + 1, link };
    }
    i = j;
  }
  // 2. Tokens anywhere: one run of the alphabet (standard or URL-safe), 16+ characters. "=" is
  // not a boundary before a token, so a query parameter ("?ref=SmFuZSBS…") is read too. A link's
  // percent-escapes are undone where they stand for the alphabet ("%2B", "%2F", "%3D") and are a
  // boundary otherwise: Safe Links' "%7C638856…" was read as a token starting "7C638856…".
  // Padding may stand before a "/" (a value that is one segment of a link's path): with the
  // lookahead alone, "reset/amFuZS5yb2VAY2xpZW50LmNvbQ==/7f3a…" held no token at all. Or before
  // Proofpoint v3's closing "__", which ends the link it carries.
  const tokens = /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{16,}(?:={0,6}(?![A-Za-z0-9+/=_-])|={1,6}(?=\/|__))/g;
  const raw = text.split(EOL);
  // An escape a row end cut in two ("…Unknown%7" / "CTWFpb…") is put back together on the first
  // row, in a link (another escape, "://", "?" or "=" in the same token): read as it stood, the
  // "C" opened the next row's value one character out of step.
  for (let r = 0; r + 1 < raw.length; r++) {
    const cut = raw[r].match(/(\S*)%([0-9A-Fa-f]?)$/);
    if (!cut || !/%[0-9A-Fa-f]{2}|:\/\/|[?=]/.test(cut[1])) continue;
    const need = 2 - cut[2].length;
    if (!new RegExp(`^[0-9A-Fa-f]{${need}}`).test(raw[r + 1])) continue;
    raw[r] += raw[r + 1].slice(0, need);
    raw[r + 1] = raw[r + 1].slice(need);
  }
  // Proofpoint v3's "__;" closes the link it carries and is a boundary: "_" is in the URL-safe
  // alphabet, so a Zoom passcode ended "…Zz09__" and decoded out of step, and every v3-wrapped
  // Zoom invitation was held.
  const rows = raw.map((row) => row.replace(/%(?:2B|2F|3D)/gi, (e) => decodeURIComponent(e)).replace(/%[0-9A-Fa-f]{2}/g, '%..').replace(/__;/g, '!!;'));
  // whether the row's last word is a link: its own "://" or query, or a row with no space in it
  // that continues a link the row above ended in
  // `joinedTo`: the last row a join has read the start of; a row that is all one value inside
  // it was judged with the rows before it, and read again from its own start it is out of step
  // `linkPath`: the row's last word is still in the path of a link with a scheme or "www." (no
  // "?" or "#" yet, a hash route's "#/" aside), carried across the rows it is printed on
  // `linkQuery`: the row's last word is in a link's query string (a "?" and no "#" since), carried
  // the same way. A continuation row has no "?" of its own, and a gateway's key past 88 characters
  // on it (Barracuda's "c=", Proofpoint v2's "m=") was judged by its shape as an attachment: 616 of
  // 2,272 printed Barracuda-wrapped court and EDGAR links were held.
  // `v2Head`: the first characters of the link the row's last word is in, joined across the rows
  // it is printed on, so a Proofpoint v2 link is known as one on the rows below when a narrow
  // print cuts its host
  // `linkWord`: the row's last word joined with the rows above it that it continues (its last
  // 2,048 characters). A redirect that carries its target with the scheme as written ("?q=https://
  // …", "?url=https://…") has that target's path after its own "?", and the address in base64
  // there was read on one line (`inner`) but not across rows: 1,822 of 3,990 prints of five such
  // redirects passed. Read from the word's last "://", the target's path is carried as a path to
  // its first "?", "&", "=" or "#", and none pass. 328,560 printed ordinary links, under every gateway
  // and carried by those redirects: no print held that was not held before.
  let linkCarry = false, joinedTo = -1, linkPath = false, linkQuery = false, v2Head = '', v2Owe = 0, linkWord = '';
  const V2 = /urldefense(?:\.proofpoint)?\.com\/v2\/url\?u=/i;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const last = row.split(/\s/).pop()!;
    const firstEnd = row.search(/\s|$/);
    // the row's first word continues a v2 link; its last word is in one
    const wasV2 = linkCarry && V2.test(v2Head);
    v2Head = (linkCarry && firstEnd === row.length ? v2Head + row : last).slice(0, 256);
    const isV2 = V2.test(v2Head);
    // how many hex digits of a v2 escape the row above left for this row to open with
    const owe = wasV2 ? v2Owe : 0;
    const cutEsc = row.match(/-([0-9A-F]?)$/);
    v2Owe = isV2 && cutEsc ? 2 - cutEsc[1].length : 0;
    const carried: boolean = linkCarry && !/\s/.test(row);
    const inLinkWord: boolean = /:\/\/|^www\.|[?&][\w.%-]*=/.test(last) || carried;
    const pathCarried: boolean = carried && linkPath;
    const queryCarried: boolean = linkCarry && linkQuery && /^\S/.test(row);
    // the link word the row's first word continues, for `inner` below
    const headBefore = linkCarry && /^\S/.test(row) ? linkWord : '';
    linkQuery = inLinkWord && (/\?[^#]*$/.test(last) || (carried && linkQuery && !last.includes('#')));
    linkWord = (carried ? linkWord + row : last).slice(-2048);
    const scheme = linkWord.lastIndexOf('://');
    linkPath = inLinkWord && (scheme > 0 && /[?&=]/.test(linkWord.slice(0, scheme)) ? !/[?&=]|#(?!!?\/)/.test(linkWord.slice(scheme)) : (carried ? linkPath : /:\/\/|^www\./.test(last)) && !/\?|#(?!!?\/)/.test(last));
    linkCarry = inLinkWord && !/\s$/.test(row);
    for (const m of row.matchAll(tokens)) {
      // A word is not an encoding: base64 of text is mixed case with digits. Without this an OCR
      // typo in a Third Circuit opinion ("Ujnsubstantiated") decoded to twelve bytes that happen
      // to be valid UTF-8, and the opinion was refused.
      if (wordShaped(m[0])) continue;
      const before = row.slice(0, m.index!).split(/\s/).pop()!;
      // in a query string: a "?" before it in the same link, and no "#" between. A path token in
      // a link with a scheme is judged the same way: a HubSpot tracked link's path token is past
      // 88 characters and was refused by its shape as an attachment. A fragment ("#pako:…") is not.
      const query = /\?[^#]*$|:\/\/[^#]*$/.test(before) || (queryCarried && !/\s/.test(row.slice(0, m.index!)) && !before.includes('#'));
      // Proofpoint v2 writes the carried link's own escapes as "-25" and a hex pair ("%40" is
      // "-2540"), and "-" is in the URL-safe alphabet. A printed Teams invitation's row that opens
      // in the meeting id ran on into "-2540thread" as one token, read as text: 61 of 3,195 printed
      // v2-wrapped links held, 59 of them the 355 Teams ones. A token that carries such an escape is
      // read in pieces at each v2 escape, where the carried link's own "%" ended the run; the link
      // as a whole is still read, decoded, by the gateway reading. Read in pieces at every "-XX",
      // a Proofpoint v2-wrapped pre-2022 Zoom invitation printed across rows was held at 29 more
      // of 202 widths, a row opening out of step inside the passcode.
      // `inV2`: the token is in a link known to be v2 (its host earlier in the word, or read
      // across the rows above), where a "-" is always an escape ("-5F" is the carried link's "_"),
      // never a word's joint: a row "meeting-5FNzUwY2I2…" read from past "meeting-" was out of step
      // by the escape and held 4 more of 1,737 printed Teams links at 35–38 columns.
      const inV2 = (wasV2 && m.index! < firstEnd) || V2.test(before);
      // an escape the row end cut in two ("…ZTRj-2" / "540thread") is dropped from both rows: left
      // on, "-2" closed the meeting id's piece and read it as text
      let tok = m[0];
      if (inV2 && m.index === 0 && owe) tok = tok.replace(new RegExp(`^[0-9A-F]{${owe}}`), '');
      if (inV2 && m.index! + m[0].length === row.length) tok = tok.replace(/-[0-9A-F]?$/, '');
      const v2 = /-25[0-9A-F]{2}/.test(m[0]) ? tok.split(/-[0-9A-F]{2}/).filter((p) => p.length >= 16 && !wordShaped(p)) : null;
      // A value glued to a word by "_" or "-" ("session_", "meeting_", "token-"): both are in the
      // URL-safe alphabet, so the word is read as the value's head and the rest decodes out of
      // step. A magic, unsubscribe or verification link carrying the client's address this way
      // passed 102 of 120 shapes, and Teams writes its meeting id so ("19%3ameeting_…"). So the
      // value is read again from past the joint. A Proofpoint v2 value ("u=https-3A__…-2D…") is
      // escapes written with "-", not a word and a value, and is left to the gateway reading.
      // Where the word is whole quanta ("ing_", "meeting_"), the value decodes in step inside the
      // token as well, after the word's few bytes, and only the value is read: read whole, three
      // bytes ahead of a Teams meeting id (a UUID in base64, judged as the hex it spells) made it
      // "text", and a Teams link printed at 56 columns ("…19%3ameet" / "ing_OGJi…") was held 87
      // times in 100. The cost is the bare id's: an id after a word whose own characters decode to
      // text by chance is held as it is standing alone, 21 in 100,000 "DOC-" ids of twenty capitals
      // and digits and 9 in 100,000 "req_" ids, every one of them held without its word too.
      const pre = m[0].match(PREFIX);
      const rest = pre && !inV2 && !/(?:-[0-9A-F]{2}.*){2}/.test(m[0]) ? m[0].slice(pre[0].length) : '';
      const glued = rest.length >= 16 && !wordShaped(rest);
      if (!(glued && pre![0].length % 4 === 0) && (v2 ? v2.some((p) => tokenVerdict(p, false, query)) : tokenVerdict(m[0], false, query))) return { line: r + 1, link: query || carried || /:\/\/|^www\.|[?&][\w.%-]*=/.test(before) };
      if (glued && tokenVerdict(rest, false, query)) return { line: r + 1, link: query || carried || /:\/\/|^www\.|[?&][\w.%-]*=/.test(before) };
      if (!inV2 && !/(?:-[0-9A-F]{2}.*){2}/.test(m[0])) for (const h of deeperHeads(m[0])) { const x = m[0].slice(h); if (x.length >= 16 && !wordShaped(x.replace(/=+$/, '')) && tokenVerdict(x, false, query)) return { line: r + 1, link: query || carried || /:\/\/|^www\.|[?&][\w.%-]*=/.test(before) }; }
      // A value that is one segment of a link's path is read from its own first character: read
      // with the segments before it ("unsubscribe/amFuZS5y…") it decodes out of step, and a
      // mailer's unsubscribe or reset link carrying the recipient's address in base64 passed 500
      // of 500 draws while the same value after "?u=" was held 500 of 500. Measured over Drive,
      // SharePoint, Dropbox, Loom, GitHub, Medium, Notion and Figma links: 0 of 500 each held.
      // `inner`: the token is in the path of a link carried inside another link's value ("?url=
      // https%3A%2F%2F…/unsubscribe/amFu…"), as a mail gateway or a redirector writes it. The "?"
      // before it is the outer link's, and read as a query it passed 300 of 300 Safe Links- and
      // Barracuda-wrapped addresses.
      // Read on the link word joined across rows for a token in the row's first word: a row that
      // opens inside the carried link's host ("ple.com/reset/amFu…" under "…?url=https://portal.exam")
      // has no "://" of its own.
      const inner = /(?::|%\.\.)\/\/[^\s?&#=]*$/.test((m.index! < firstEnd ? headBefore : '') + before);
      // `route`: the token is in a hash-routed app's path ("…/#/reset/amFu…", "#!/"), which is a path
      // written after a "#". Read as a fragment, the client's address in base64 there passed on
      // one line, and was held at 983 of 2,660 prints of four such links; read as a path, at 2,654.
      // Hash-routed practice links (Clio, iManage, Relativity, a court docket, SPA ids) and ordinary
      // links under every gateway: no print held that was not held before.
      const route = /#!?\/[^?#]*$/.test(before) || (/#!?$/.test(before) && m[0].startsWith('/'));
      if ((inner || route || !/\?[^#]*$|#/.test(before)) && m[0].includes('/') && (/:\/\/|^www\./.test(before + m[0]) || inner || pathCarried) && pathSegmentHold(m[0])) return { line: r + 1, link: true };
    }
    // A link printed across rows (an email printed to PDF) is cut wherever the row ends, and the
    // rest of its value opens the next row, where it decodes out of step unless the cut fell on a
    // whole quantum. Judged row by row, a name in a link's value went through at most widths: a
    // Safe Links-shaped record carrying a name at 22 of 81 widths from 50 to 130. So a value that
    // runs to the row's end inside a longer token (after "=", "/", an escape: not a word after a
    // space) is read on with the rows that continue it, and refused if that decodes to text.
    // Only in a link: a column of record ids, one per row, is not one value, and read on as one
    // the sixteen Google Drive ids in law 3 were refused.
    const tail = inLinkWord && row.match(/(?:^|(?<=[^\sA-Za-z0-9+/_-]))[A-Za-z0-9+/_-]+$/);
    if (!tail || !rows[r + 1] || (r <= joinedTo && tail.index === 0)) continue;
    const pieces = [tail[0]];
    for (let k = r + 1; k < rows.length; k++) {
      const next = rows[k].match(/^[A-Za-z0-9+/_-]+={0,2}/);
      // a word opening the next line is the next sentence: with "We" read on, a Zoom passcode on
      // the last row of its line decoded to text
      if (!next || wordShaped(next[0].replace(/=+$/, ''))) break;
      pieces.push(next[0]);
      if (next[0].length < rows[k].length || next[0].endsWith('=')) break;
    }
    const joined = pieces.join('');
    joinedTo = r + pieces.length - 1;
    // Judged as a link's value is: by what it decodes to, up to LINK_VALUE_MAX. A Safe Links
    // record whose every row is Microsoft's own keys and values passes even when the rows do not
    // join up: a page printed past its margin loses the characters between them (a memo at 110
    // columns of 9-point Courier lost four a row, and the record read '"P"9n32"'). A name or an
    // extra key in any row fails that row's test, so this lets through nothing but the record.
    // The last row may open with the record's last few characters ("yfQ%3D…"): five or fewer
    // decode to three bytes at most, under the 16-character floor every other token is read at.
    const slRow = (x: string, i: number) => { const v = x.replace(/=+$/, ''); return (i > 0 && i === pieces.length - 1 && v.length <= 5) || safeLinksPiece(v, 4); };
    if (pieces.length > 1 && !wordShaped(joined.replace(/=+$/, '')) && tokenVerdict(joined, false, true) && !pieces.every(slRow)) return { line: r + 1, link: true };
    // a path printed across rows: each of its segments from its own start, as on one row
    if (pieces.length > 1 && linkPath && pathSegmentHold(joined)) return { line: r + 1, link: true };
    // The same loss puts the next row out of step with the value it continues, and read from its
    // own first character it is junk, so whatever that row carries decodes to nothing either
    // way: a Safe Links-shaped record whose "AN" was a name went through a 9-point memo at 8
    // widths of 81 (108 to 123 columns), one with an extra key carrying a name at 13. A value
    // one row of which is a piece of the record, and whose rows do not join up into the record,
    // is the record printed past its margin, so every row of it must be a piece of the record;
    // the first may be the record's opening cut short ("TWFpbGZ", "Mailf"). (Read out of step as
    // a rule for every link, each row from its second to fourth character, it held Bing results
    // at 101 widths of 101 and Teams invitations at 28.)
    const opening = (x: string, i: number) => { const b = i === 0 && b64Bytes(x); return !!b && b.length > 0 && 'Mailflow|{'.startsWith(String.fromCharCode(...b)); };
    if (pieces.length > 1 && pieces.some((x) => x.length >= 16 && safeLinksPiece(x.replace(/=+$/, ''), 4)) && !safeLinksPiece(joined.replace(/=+$/, '')) && !pieces.every((x, i) => opening(x, i) || slRow(x, i))) return { line: r + 1, link: true };
  }
  return null;
}

// ---------- a link a mail gateway rewrote ---------------------------------------------------

// A mail gateway rewrites every link in the mail it lets through and carries the original inside
// its own: Microsoft Safe Links in "url=", Proofpoint v1 and v2 in "u=" (v2 writes "%" as "-" and
// "/" as "_"), Proofpoint v3 between "__" markers with some characters moved into a base64 list
// after "__;", Barracuda in "a=". A mailer puts the recipient's address in the original's path or
// query, in base64 or in percent-escapes, and inside the gateway's value it is escaped once more
// ("%253D", "%256A", "-3D"), which the rules above read as escaped punctuation: a percent-escaped
// address and every Proofpoint v2 link went through, and printed across rows a Safe Links- or
// Barracuda-wrapped address went through at most widths. So the original is taken out, its rows
// joined, and read as a link of its own. Any other link whose value is a whole escaped link
// ("?u=https%3A%2F%2F…", as FireEye, Trend Micro, Symantec and a search engine's redirect write
// it) is read the same way. Mimecast carries no original: its link is an opaque code only
// Mimecast's server resolves, so nothing in the text decodes to the address.
// The generic shape's query does not run on across another "://": in a word joined from rows with
// no space (a mail-flow export, a link a row) it ran from the first row's link to the escaped one
// thousands of characters on, and the carried link fell past the GATEWAY_MAX read.
const GATEWAY = /https?:\/\/(?:[\w-]+\.)*(?:safelinks\.protection\.outlook\.com\/|urldefense(?:\.proofpoint)?\.com\/v[123]\/|linkprotect\.cudasvc\.com\/url\?|[\w-]+(?::\d+)?\/(?:(?!:\/\/)[^\s?#])*\?(?:(?:(?!:\/\/)[^\s#])*?&)?[\w.-]+=https?%3A%2F%2F)/gi;
const GATEWAY_MAX = 8192;

/** Every well-formed escape decoded, one malformed byte left as written. */
function unescapePct(s: string): string {
  return s.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try { return decodeURIComponent(run); } catch { return run.replace(/%([0-9A-Fa-f]{2})/g, (e, h) => (parseInt(h, 16) < 0x80 ? String.fromCharCode(parseInt(h, 16)) : e)); }
  });
}

/** The link a gateway's link carries, decoded once, or null when it is not one this knows.
 *  `printed`: the link was read on across rows. */
function gatewayInner(link: string, printed = false): string | null {
  // The value runs to the next "&". A page printed past its margin loses each row's last few
  // characters, the "&" among them, and the gateway's next key and value run on into the carried
  // link: a Safe Link to an SEC release read on into its own "data=" record, out of step, and a
  // memo printed at 117 and 120 columns was held. The carried link is escaped whole ("=" is
  // "%3D", "-3D" in v2), so a bare "=" is the gateway's next key, whose name (`next`) is dropped.
  const upTo = (u: string, next: string) => { const eq = u.indexOf('='); return eq < 0 ? u : u.slice(0, eq).replace(new RegExp(`${next}$`), ''); };
  const v = (key: string, next: string) => { const u = (link.match(new RegExp(`[?&]${key}=([^&\\s]*)`)) || [])[1]; return u && upTo(u, next); };
  // At 125 columns the loss took "data=" too, and the record's "%7C" fields ran on into the
  // carried link. Printed, a Safe Link's value is read to its first "%7C". The only other source of
  // one is a bare "|" in the original link; printed across rows, what follows that is read only as
  // the Safe Link's own query, where a base64 value holds and a twice-escaped address does not.
  // The gateway is the one the link opens with. Read anywhere in the slice, which runs 8,192
  // characters on across a no-space export's rows, a Google redirect carrying an escaped address
  // took the next row's Proofpoint, Safe Links or Barracuda link as its own and read that one's
  // value instead: the address went through (3 of 3 vendors), and a hold named the wrong row.
  const own = (re: RegExp) => new RegExp(String.raw`^https?:\/\/(?:[\w-]+\.)*` + re.source, 'i').test(link);
  if (own(/safelinks\.protection\.outlook\.com\//)) { const u = v('url', 'data'); return u ? unescapePct(printed ? u.replace(/%7C[\s\S]*$/i, '') : u) : null; }
  if (own(/linkprotect\.cudasvc\.com\//)) { const u = v('a', 'c'); return u ? unescapePct(u) : null; }
  if (own(/urldefense(?:\.proofpoint)?\.com\/v1\//)) { const u = v('u', 'k'); return u ? unescapePct(u) : null; }
  if (own(/urldefense(?:\.proofpoint)?\.com\/v2\//)) { const u = v('u', 'd'); return u ? unescapePct(u.replace(/-/g, '%').replace(/_/g, '/')) : null; }
  // to the "__;" that opens the list, not the first "__": a path can carry one ("/my__file")
  const v3 = own(/urldefense(?:\.proofpoint)?\.com\/v3\//) && (link.match(/\/v3\/__(.+?)__;([A-Za-z0-9_-]*)/) || link.match(/\/v3\/__(.+?)__/));
  if (!v3) { const u = link.match(/[?&][\w.-]+=(https?%3A%2F%2F[^&\s]*)/i); return u ? unescapePct(upTo(u[1], '')) : null; }
  // Each "*" stands for the next character of the list, and "**" and a letter for a run of them
  // (two for "A", three for "B" …); a list that does not decode leaves the "*" as written.
  let moved = '';
  try { moved = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob((v3[2] || '').replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - ((v3[2] || '').length % 4)) % 4)), (c) => c.charCodeAt(0))); } catch { /* left as "*" */ }
  const runs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let at = 0;
  return unescapePct(v3[1]).replace(/\*(\*.)?/g, (t) => {
    const n = t.length === 1 ? 1 : runs.indexOf(t[2]) + 2;
    if (!moved || n < 1 || at + n > moved.length) return t;
    at += n;
    return moved.slice(at - n, at);
  });
}

/** The line a gateway-rewritten link carrying encoded content starts on, or 0. Each word is read
 *  whole, and a row's last word on across the rows it is printed on: continued by the next row's
 *  first word, and by the rows after while each is one unbroken word. A narrow printout cuts the
 *  gateway's own host in two ("…safelinks.prot" / "ection.outlook.com"), so the host is looked
 *  for in the word as joined, not in any one row. */
function gatewayHold(text: string, depth = 0): number {
  const rows = text.split(EOL);
  // the last row whose first word a join has read
  let joinedThrough = -1;
  for (let r = 0; r < rows.length; r++) {
    const words = [...rows[r].matchAll(/\S+/g)];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      // The rest of a word the row above reached its end in, which was read from its start there.
      // Only where that join reached this row: it stops at GATEWAY_MAX, and in an export with no
      // space in any row (a message-trace or DLP export, a link a row) every row past the first
      // 8,192 characters was skipped and never read. A Proofpoint-wrapped address on row 121
      // went through; with one space a row it was held.
      if (i === 0 && w.index === 0 && r > 0 && /\S$/.test(rows[r - 1]) && r <= joinedThrough) continue;
      let word = w[0], cut = 0;
      // where each row's piece starts in the joined word, so a hold names the row its link opens
      // on: joined to the prose word above it ("…click" / "https://urldefense…"), a hold named
      // the prose line, and in a .docx the paragraph above the link
      const starts: Array<[number, number]> = [[0, r]];
      if (w.index! + word.length === rows[r].length) {
        for (let k = r + 1; k < rows.length && word.length < GATEWAY_MAX; k++) {
          const next = rows[k].match(/^\S+/);
          if (!next) break;
          joinedThrough = k;
          starts.push([word.length, k]);
          word += next[0];
          if (next[0].length < rows[k].length) { cut = word.length - next[0].length; break; }
        }
      }
      // A link that ends at a row's end has the next row's first word glued to it ("…Q%3D%3D" /
      // "Thank you."), and the carried value ends in "==Thank", which no token reading takes: with
      // the gateway's value last (FireEye's "u="), 77 of 101 widths let a padded base64 address
      // through. So where the row ends in padding, which only a value's end carries, the word is
      // read again without that first word. Cut anywhere else, the piece dropped is as often the
      // link's own last row, and a Zoom passcode cut short was held at 119 more of 1,260 widths.
      const prose = cut > 0 && (/(?:=|%3D|-3D)$/i.test(word.slice(0, cut)) || /^[A-Za-z][a-z]+[.,;:!?)]*$/.test(word.slice(cut)));
      for (const whole of prose ? [word, word.slice(0, cut)] : [word]) {
        for (const g of whole.matchAll(GATEWAY)) {
          const inner = gatewayInner(whole.slice(g.index!, g.index! + GATEWAY_MAX), whole.length > w[0].length);
          if (inner && (base64Hold(inner) || percentHold(inner) || (depth < 2 && gatewayHold(inner, depth + 1)))) return starts.filter(([s]) => s <= g.index!).pop()![1] + 1;
        }
      }
    }
  }
  return 0;
}

/** The line of a run of percent-escapes that spells a name the engine cannot read, or 0.
 *  Two readings, both of what the run decodes to:
 *  - an ASCII letter or digit, two or more in one run: a URL encoder never escapes a letter
 *    (RFC 3986 §2.3), so "%4A%61%6E%65%20%52%6F%65" is "Jane Roe" written where the engine cannot
 *    read it. This holds wherever the run stands.
 *  - two or more letters of a script other than Latin, outside a link or a path: "%D0%98%D0%B2%D0%B0%D0%BD"
 *    is "Иван". Inside a link it is how every browser writes Cyrillic, Greek, Chinese or Arabic
 *    (a Russian Wikipedia citation, a Chinese court portal search), and a held link there would
 *    refuse every such citation: read everywhere, the rule held each of four such links on one
 *    line and at 81 widths of 81 printed across rows. A link includes one printed across rows,
 *    read back to the line its first row opens (`inWrappedLink`); without that, the same links
 *    were held at 36 to 81 widths of 81. Latin letters are not read, so an accented letter in a
 *    link ("Conseil_d%27%C3%89tat" on Légifrance) or outside one passes, and the name beside it
 *    is readable.
 *  A run printed across rows is read as one: a row end falls between escapes. A row end inside
 *  one escape ("%E" / "7%8E") leaves continuation bytes at the start of the next piece and an
 *  incomplete letter at the end of the last, which are dropped rather than refused whole.
 *  Measured (owner ruling (5): only at no measured cost): 0 of 5,113 real texts held, as before;
 *  the paired-id classes (5,000 each) held exactly as before, none carrying a "%"; an escaped
 *  Cyrillic or Chinese name outside a link held on one line and at 81 widths of 81. A
 *  two-letter name printed after a link on the same line held at 69 widths of 81: at the rest a
 *  row end falls inside one of its escapes, and each piece decodes to one letter. */
/** The run stands inside percentages written with nothing between them ("25%50%75%"), as a PDF
 *  text layer or a converter glues a pricing grid's, a vesting schedule's or a cap table's cells:
 *  every number closed by its own "%", on one row, a number before the run. Read as escapes,
 *  "%50%75" is "Pu", and 33,600 of 150,000 glued "a%b%c%" rows were held and told to rewrite the
 *  grid as letters. An escaped name is not this shape unless each of its escapes is two decimal
 *  digits, a digit stands before it and a "%" closes it. */
function percentGrid(text: string, start: number, end: number): boolean {
  if (/[\r\n]/.test(text.slice(start, end))) return false;
  const num = (i: number) => /\d/.test(text[i] ?? '');
  let s = start, e = end;
  while (s > 0 && (num(s - 1) || (/[.,]/.test(text[s - 1]) && num(s - 2)))) s--;
  while (e < text.length && (num(e) || text[e] === '%' || (/[.,]/.test(text[e]) && num(e + 1)))) e++;
  return s < start && /^(?:\d+(?:[.,]\d+)*%){2,}$/.test(text.slice(s, e));
}

function percentHold(text: string): number {
  for (const m of text.matchAll(/(?:%[0-9A-Fa-f]{2})+(?:\r?\n(?:%[0-9A-Fa-f]{2})+)*/g)) {
    const run = m[0].replace(/\s/g, '');
    if (percentGrid(text, m.index!, m.index! + m[0].length)) continue;
    const alnum = run.match(/%(?:3[0-9]|4[1-9A-Fa-f]|5[0-9Aa]|6[1-9A-Fa-f]|7[0-9Aa])/g);
    if (alnum && alnum.length >= 2) return lineAt(text, m.index!);
    if (inWrappedLink(text, m.index!)) continue;
    let bytes = run.slice(1).split('%').map((h) => parseInt(h, 16));
    while (bytes.length && bytes[0] >= 0x80 && bytes[0] < 0xc0) bytes = bytes.slice(1);
    for (let k = bytes.length - 1; k >= 0 && k >= bytes.length - 4; k--) {
      if (bytes[k] < 0x80) break;
      if (bytes[k] >= 0xc0) { if (bytes.length - k < (bytes[k] >= 0xf0 ? 4 : bytes[k] >= 0xe0 ? 3 : 2)) bytes = bytes.slice(0, k); break; }
    }
    let letters: string;
    try { letters = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch { continue; }
    if ((letters.match(/\p{L}/gu) ?? []).filter((c) => !/\p{Script=Latin}/u.test(c)).length >= 2) return lineAt(text, m.index!);
  }
  return 0;
}

// ---------- quoted-printable ---------------------------------------------------------------

/** The whitespace-delimited token around `index` is a link: a scheme, "www.", or a "?"/"&"
 *  before this point (a query string). "=E9" means a letter only in a quoted-printable body,
 *  and a quoted-printable body writes the "=" of a link as "=3D". */
function inLink(text: string, index: number): boolean {
  let s = index, e = index;
  while (s > 0 && !/\s/.test(text[s - 1])) s--;
  while (e < text.length && !/\s/.test(text[e])) e++;
  return /:\/\/|www\./i.test(text.slice(s, e)) || /[?&]/.test(text.slice(s, index + 1));
}

/** `inLink`, or the word around `index` is the rest of a link printed across rows: joined to
 *  the last word of each line above that it continues (a line that ends in a space ends the
 *  chain), it has a scheme, "www.", a query key, or a domain and path ("ru.wikipedia.org/wiki/"
 *  cited with no scheme). A name escaped outside any link opens no such chain and is still
 *  read; one printed with no space straight after a link at a row end reads as the link's
 *  last row, which a page cannot tell apart.
 *  Or a path: the run's own segment opens after a "/". A server's access log writes the request
 *  path with no host ("GET /ru/%D0%BD%D0%BE…"), an IIS log its cs-uri-stem, a SharePoint audit
 *  export a file name after "Shared Documents/"; each is an exhibit in a breach or trade-secret
 *  matter, and each was held as "an email attachment" once the non-Latin reading was added. Only
 *  that "/" counts, reached going back over the segment (`pathBefore`): read as any "/" earlier in
 *  the joined word, a date or "and/or" ending the row above, a CSV row's "9/22/2026," or
 *  "Ref:HC/2026/101," let an escaped Cyrillic or Chinese name through. */
function inWrappedLink(text: string, index: number): boolean {
  if (inLink(text, index)) return true;
  let b = index, e = index;
  while (b > 0 && !/\s/.test(text[b - 1])) b--;
  while (e < text.length && !/\s/.test(text[e])) e++;
  let word = text.slice(b, e);
  while (b > 0 && (text[b - 1] === '\n' || text[b - 1] === '\r')) {
    let x = b - 1;
    if (text[x] === '\n' && text[x - 1] === '\r') x--;
    let a = x;
    while (a > 0 && !/\s/.test(text[a - 1])) a--;
    if (a === x) break;
    word = text.slice(a, x) + word;
    b = a;
  }
  return /:\/\/|www\.|[?&][\w.%-]*=|[a-z0-9-]+\.[a-z]{2,}\//i.test(word) || pathBefore(text, index);
}

/** A "/" opens the segment the run at `index` is in: reached going back with no space, ";" or
 *  bare "," on the way, and across a row end only where the row above ends in the "/" itself or in
 *  an escape the row end cut ("%E" / "7%8E"). A path printed across rows breaks there; a date row
 *  ("22/09/2026") above an escaped name ends in a digit. Still held, because nothing in the text
 *  tells them from a CSV cell's boundary: a file name with a bare "," or ";" in it ("合同,草案.docx",
 *  "report;отчет.pdf"), at every width where the escape after it is read. */
function pathBefore(text: string, index: number): boolean {
  for (let i = index; i > 0;) {
    const c = text[i - 1];
    if (c === '/') return true;
    if (c === '\n' || c === '\r') {
      let x = i - 1;
      if (text[x] === '\n' && text[x - 1] === '\r') x--;
      if (!/(?:\/|%[0-9A-Fa-f]{0,2})$/.test(text.slice(Math.max(0, x - 3), x))) return false;
      i = x;
      continue;
    }
    if (/[\s;]/.test(c)) return false;
    // A "," is inside the segment only in the two shapes a name's own comma takes in a path —
    // Wikipedia's ",_" ("Толстой,_Лев_Николаевич") and an escaped space after it (",%20") — and
    // only where the stretch back to the "/" already carries an escape. Read as a boundary
    // everywhere, a server log requesting that page was held at every width. A bare "," still
    // ends the segment, as a CSV cell's does ("/srv/share/report.pdf,", "HC/2026/101,").
    if (c === ',' && !(/^(?:_|%20)/.test(text.slice(i, i + 3)) && /\/[^\s/;.]*%[0-9A-Fa-f]{2}[^\s/;.]*$/.test(text.slice(Math.max(0, i - 1 - 2048), i - 1)))) return false;
    i--;
  }
  return false;
}

/** The line of a quoted-printable escape that stands for a letter inside a word, or 0. */
function qpLetterLine(text: string): number {
  for (const m of text.matchAll(/([A-Za-z]?)((?:=[0-9A-F]{2})+)([A-Za-z]?)/g)) {
    const [, before, esc, after] = m;
    if (!before && !after) continue;
    const bytes = esc.split('=').filter(Boolean).map((h) => parseInt(h, 16));
    // No encoder escapes an ASCII letter: "x=6AG" in a NYSCEF link reads as "xjG", not a name.
    if (bytes.every((b) => b < 0x80)) continue;
    let ch = '';
    if (bytes.length > 1) {
      // A UTF-8 sequence (Ren=C3=A9e) is an encoder's and nothing else's; at a word's edge
      // too (Jos=C3=A9, =C3=89lise).
      try { const s = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); if (/^\p{L}+$/u.test(s)) ch = s; } catch { /* not UTF-8 */ }
    } else if (before && after && bytes[0] >= 0xdf && bytes[0] !== 0xf7) {
      // One Latin-1 byte counts only as a small letter between letters (Ren=E9e). A capital
      // is how an all-caps formula or log reads — "NET=DEBT", "ACTION=DELETE" — so "JOS=C9"
      // is the price of not refusing those.
      ch = String.fromCharCode(bytes[0]);
    }
    if (!ch) continue;
    // A small letter then a capital is a key and a value run together ("sort=DESC",
    // "EBITDA=EBIT+DA", "status=FAILED"), not a word an encoder split.
    if (/\p{Ll}\p{Lu}/u.test(before + ch + after)) continue;
    if (inLink(text, m.index!)) continue;
    // Hex written with an "h" suffix, as firmware and x86 references write a byte ("status
    // value=FFh", "ACK=FAh", "opcode=E8h"): a patent claim and an expert report were refused.
    const end = m.index! + m[0].length;
    if (bytes.length === 1 && after === 'h' && !/\p{L}/u.test(text[end] || '')) continue;
    // A key whose value runs on as a base64 token, as a log line writes it ("session=EDzdoYI8…"
    // read as "n" + "=ED" + "z"): about one breach-report log line in 350 was refused. The value
    // after the two hex digits carries a capital, a digit or "+/"; a word an encoder split
    // ("St=E9phanie") is small letters.
    let s = m.index!, e = end;
    while (s > 0 && !/\s/.test(text[s - 1])) s--;
    while (e < text.length && !/\s/.test(text[e])) e++;
    const kv = text.slice(s, e).match(/^[A-Za-z_][\w.-]*=[0-9A-F]{2}([A-Za-z0-9+/]{6,})={0,2}[.,;:)]?$/);
    if (bytes.length === 1 && kv && /[A-Z0-9+/]/.test(kv[1])) continue;
    return lineAt(text, m.index!);
  }
  return 0;
}

/** The line of a quoted-printable soft break inside a word, or 0: a prose line (it has a space)
 *  ending in a non-space and "=", with the word going on at the start of the next line. An
 *  encoder breaks a line at its limit (76 with the "="), and mid-word only when the word will
 *  not fit, so the broken line is 60 characters or more: a formula wrapped after "AP=" in a
 *  pricing schedule is shorter. A name broken as "Mar=" / "garet" is not in the text as the
 *  model names it, so the span fails lib-core verifySpan() and stays readable. */
function qpSoftBreakLine(text: string): number {
  const lines = text.split(EOL);
  for (let i = 0; i + 1 < lines.length; i++) {
    const l = lines[i];
    if (l.length < 60 || l.length > 76 || !/[^\s=]=$/.test(l) || !/\S[ \t]+\S/.test(l) || !/^\S/.test(lines[i + 1])) continue;
    // A link wrapped after its query key ("…/view?id=" / "123456789").
    const last = l.slice(l.search(/\S+$/));
    if (/:\/\/|www\./i.test(last) || /[?&][A-Za-z_][\w.-]*=$/.test(last)) continue;
    // An encoder writes every "=" in the text as "=3D", so a line with an "=" that two hex digits
    // do not follow is not quoted-printable, and its "=" at the end is a key's: a firewall or app
    // log exhibit cut at a fixed column (key=value pairs) was held at 480 and 231 of 840 prints
    // and sent to a mail program. With this, 0 and 33 (the 33 rows whose values are all digits,
    // which read as hex). Encoded bodies at 76 columns, accented names or ASCII only, and HTML
    // parts with "=3D" attributes: held as before, 1,000 of 1,000.
    if (/=(?![0-9A-Fa-f]{2})./.test(l.slice(0, -1))) continue;
    // A base64 digest's padding: SHA-256 and SHA-1 in base64 end in one "=", so a labelled
    // digest at the end of a 60–76 character line, with anything under it (a signature line,
    // the next go.sum entry, the next row of a PDF hash log), was refused as email encoding. An
    // encoder breaks after a word's fragment ("Mar="), not after a 20-character run that is a
    // whole base64 quantum decoding to bytes; the token rule judges the run itself.
    const run = (last.match(/[A-Za-z0-9+/_-]{19,}=$/) || [''])[0];
    if (run && run.length % 4 === 0 && !wordShaped(run.slice(0, -1)) && !tokenVerdict(run)) continue;
    return i + 1;
  }
  return 0;
}

// ---------- the rules, in the order a reason is chosen --------------------------------------

export const MAIL_LIMIT =
  'an email can carry base64-encoded parts this app can’t read, so it can’t certify the export. Open the message, save the body as text or PDF, and drop that and each attachment on its own.';

/** The first reason this decoded text must not reach the engine, or null. */
export function contentHold(text: string, where: Where = FILE): Hold | null {
  const { what, unit } = where;
  const at = (n: number) => (where.at ? where.at(n) : `${unit} ${n}`);
  // An armoured block names what it is, so the refusal can too.
  // A specification that shows the marker over "…" carries nothing, so a base64 line or an
  // armour header must follow it.
  const pem = text.match(/^-----BEGIN ([A-Z0-9 ]+)-----[ \t\r]*\n(?:[A-Za-z-]+:[^\n]*\n|[ \t\r]*\n)*[A-Za-z0-9+/]{16,}/m);
  if (pem) {
    const line = lineAt(text, pem.index!);
    const label = pem[1].toLowerCase().replace(/ block$/, '');
    const why = /PRIVATE/.test(pem[1]) ? 'a private key is a credential' : 'a certificate or a PGP key names its holder and their email address';
    return { format: 'pem', line, reason: `${what} contains an encoded ${label} block (${at(line)}) that this app cannot read, so it cannot mask what is inside it — ${why}. Delete the block, or replace it with a note such as “[certificate omitted]”, and drop the file again.` };
  }
  const mail = mailHeaderLine(text);
  if (mail) return { format: 'email', line: mail, reason: `${what} contains an email’s headers (from ${at(mail)}), the lines a mail program writes when it saves a message. An email can carry base64-encoded parts this app can’t read, so it can’t certify the export. If this is a saved email, open it, save the body as text or PDF, and drop that and each attachment on its own. If the headers are only quoted in a document, delete those lines and drop the file again.` };
  // A value inside a link has its own reason: nothing is attached, and "save the attachment" sent
  // the lawyer holding a printed newsletter looking for one.
  const linkReason = (line: number) => `${what} contains encoded content inside a link (from ${at(line)}): part of the link’s address is written in an encoding this app cannot read, so it cannot mask a name or an email address it carries. Delete the link, or replace it with the words it shows, and drop the file again.`;
  const b64 = base64Hold(text);
  if (b64) return b64.link ? { format: 'encoded', line: b64.line, reason: linkReason(b64.line), kind: 'link' } : { format: 'encoded', line: b64.line, reason: `${what} contains encoded content (from ${at(b64.line)}), such as an email attachment, that this app cannot read, so it cannot mask what is inside. Save the attachment as its own file and drop that; if the encoded block is not needed, delete it and drop the file again.` };
  const gate = gatewayHold(text);
  if (gate) return { format: 'encoded', line: gate, reason: linkReason(gate), kind: 'link' };
  // Its own reason: nothing is attached, and "save the attachment" sent the lawyer looking for one.
  const pct = percentHold(text);
  if (pct) return { format: 'encoded', line: pct, reason: `${what} contains percent-encoded content (from ${at(pct)}): letters written as “%” and two hex digits, which this app cannot read, so it cannot mask a name they spell. Replace them with the letters they stand for, or delete them, and drop the file again.`, kind: 'percent' };
  // RFC 2047: a header word carried as =?utf-8?B?…?= or =?utf-8?Q?…?=. A mail program writes a
  // sender's name this way whenever it has an accent in it.
  const word = text.match(/=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=/);
  if (word) {
    const line = lineAt(text, word.index!);
    return { format: 'encoded', line, reason: `${what} contains encoded email header text (${at(line)}) — a name written as =?utf-8?B?…?= cannot be read by this app, so it cannot mask it. Open the message in your mail program, save it as text, and drop that.`, kind: 'header' };
  }
  const soft = qpSoftBreakLine(text);
  if (soft) return { format: 'encoded', line: soft, reason: `${what} contains quoted-printable email encoding (${at(soft)}), which breaks words across lines with “=”, so a name can escape the mask. Open the message in your mail program, save it as text, and drop that.`, kind: 'qp' };
  const qp = qpLetterLine(text);
  if (qp) return { format: 'encoded', line: qp, reason: `${what} contains quoted-printable email encoding (${at(qp)}) — a letter written as “=E9” splits the word it is in, so a name can escape the mask. Open the message in your mail program, save it as text, and drop that.`, kind: 'qp' };
  return null;
}

// ---------- a Word file, channel by channel -------------------------------------------------

// The channels the .docx writer keeps in the saved file and masks (Export.tsx docxScope):
// everything else — link targets, alt-text, comments, properties, field codes, hidden text,
// tracked deletions — it removes, so a hyperlink to EUR-Lex or a Zoom invite never ships and
// must not hold the file. test/intake-refusal.mjs pins this set against docxWrite.ts FORBIDDEN.
// Hidden text is the one removal that does not settle it: the saved .docx loses it, but in the
// body it is in the text of record (docx.ts inMainFlow), which the engine, the .txt and the
// copied text read. Skipped there, a base64 attachment formatted as hidden text was queued and
// went out in the .txt readable to any model that decodes it (INT-1, through ingestFile).
export const DOCX_SAVED_CHANNELS: Record<string, string> = {
  body: 'main text', header: 'header', footer: 'footer', footnote: 'footnote text', endnote: 'endnote text', chart: 'chart text', diagram: 'SmartArt text',
};

/** The first reason a Word file's saved text must not reach the engine or the export, or null.
 *  Each part is read on its own, so the paragraph a refusal names is one the lawyer can find.
 *  That number is Word's, not a line of the flow: every paragraph of the part counts, empty
 *  ones too, and a line break (Shift+Enter) inside one does not. Counted in lines, a letter
 *  whose address block is five lines joined by breaks was told "paragraph 9" for its fifth
 *  paragraph, and one spaced with empty paragraphs "paragraph 5" for its ninth. In the notes,
 *  a chart and SmartArt the count starts at the first paragraph with text, past Word's own
 *  separator paragraphs at the top of footnotes.xml. */
export function docxContentHold(items: DocxItem[]): Hold | null {
  const parts = new Map<string, DocxItem[]>();
  for (const i of items) {
    // Hidden text outside the text of record is in neither export: the writer removes it, and
    // the engine, the .txt and the copied text read the body alone.
    if (!(i.kind in DOCX_SAVED_CHANNELS) || i.attr || (i.hidden && !inMainFlow(i)) || i.rev === 'del') continue;
    if (!parts.has(i.part)) parts.set(i.part, []);
    parts.get(i.part)!.push(i);
  }
  const order = [...parts.values()].sort((a, b) => Number(b[0].kind === 'body') - Number(a[0].kind === 'body'));
  for (const list of order) {
    const kind = list[0].kind;
    // Word's paragraph number (docx.ts `wp`: a text box's own paragraphs not counted), or where a
    // part has none (a chart, SmartArt) the flow's own count. By the flow's count a block in a
    // sidebar sent the lawyer to "paragraph 3" of a letter whose third paragraph was "Regards".
    const num = (i: DocxItem) => i.wp ?? i.para;
    const base = kind === 'body' || kind === 'header' || kind === 'footer' ? 0 : (num(list[0]) ?? 1) - 1;
    const paragraphs = (items: DocxItem[]) => {
      const { text, spans } = flowLayout(items);
      const itemAt = (line: number) => {
        let n = 1, i = 0;
        for (; i < text.length && n < line; i++) {
          const c = text.charCodeAt(i);
          if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) n++;
        }
        return (spans.find((x) => x.e > i) ?? spans[spans.length - 1])?.item;
      };
      const paragraph = (line: number) => {
        const item = itemAt(line), n = item && num(item);
        return n !== undefined ? n - base : line;
      };
      return { text, itemAt, paragraph };
    };
    const { text, itemAt, paragraph } = paragraphs(list);
    // Word's count includes a paragraph whose every run is hidden text, which Word does not show:
    // in a template carrying two hidden drafting notes, the block the lawyer saw as the third
    // paragraph was reported as the fifth, with nothing to say why.
    const hiddenOnly = (n: number) => {
      const own = list.filter((i) => num(i) !== undefined && num(i)! - base < n);
      const by = new Map<number, boolean>();
      for (const i of own) by.set(num(i)!, (by.get(num(i)!) ?? true) && !!i.hidden);
      return [...by.values()].some(Boolean);
    };
    const place = (line: number) => {
      const n = paragraph(line);
      return `${itemAt(line)?.inBox ? 'a text box in ' : ''}paragraph ${n}, counting empty paragraphs${hiddenOnly(n) ? ' and paragraphs of hidden text' : ''}`;
    };
    const hold = contentHold(text, { what: `This document’s ${DOCX_SAVED_CHANNELS[kind]}`, unit: 'paragraph', at: place });
    if (!hold) continue;
    // Word does not show hidden text, so a reason that names only the paragraph sends the lawyer
    // to a paragraph with nothing in it to delete. The hold is the hidden text's when the visible
    // text alone holds nowhere, or first holds at another paragraph: judged only by "does the
    // visible text hold at all", a hidden block above a second, visible one lost the note.
    let hidden = false;
    if (list.some((i) => i.hidden)) {
      const seen = paragraphs(list.filter((i) => !i.hidden)), again = contentHold(seen.text);
      hidden = !again || seen.paragraph(again.line) !== paragraph(hold.line);
    }
    const counted = hiddenOnly(paragraph(hold.line));
    const note = hidden ? ' The encoded content is hidden text, which Word does not show: Home → Show/Hide ¶ (Ctrl+Shift+8) shows it.'
      : counted ? ' Word does not show hidden text: Home → Show/Hide ¶ (Ctrl+Shift+8) shows the hidden paragraphs counted here.' : '';
    return { ...hold, line: paragraph(hold.line), reason: hold.reason + note };
  }
  return null;
}

// ========== Routing =========================================================================

const TEXT_EXT = ['txt', 'md', 'csv', 'log'];

export function detectFormat(buf: Uint8Array, filename = ''): Route {
  const ext = (filename.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

  // The zip signatures in full (local file header, empty archive, spanned archive): "PK" alone
  // is a memo that opens "PKK", a note on "PKF audit findings", a CSV whose first column is PK.
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && ((buf[2] === 3 && buf[3] === 4) || (buf[2] === 5 && buf[3] === 6) || (buf[2] === 7 && buf[3] === 8))) {
    if (ext === 'docx' || ext === '') return { format: 'docx', route: 'docx-walker' };
    if (ext === 'xlsx') return { format: 'xlsx', route: 'refuse', reason: 'Spreadsheets aren’t supported yet — save each sheet as CSV (structure and formulas are lost).' };
    if (ext === 'pptx') return { format: 'pptx', route: 'refuse', reason: 'Slide decks aren’t supported yet — File → Export → outline text (images and charts don’t survive).' };
    return { format: 'zip', route: 'refuse', reason: 'Zip archive — drop the documents inside it instead.' };
  }
  if (buf.length >= 5 && String.fromCharCode(...buf.subarray(0, 5)) === '%PDF-') {
    return { format: 'pdf', route: 'pdf-walker' };
  }
  if (buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) {
    if (ext === 'msg' || hasMsgStreams(buf)) return { format: 'msg', route: 'refuse', reason: 'Outlook .msg isn’t supported yet — in Outlook: File → Save As → Text, and save each attachment as its own file.' };
    return { format: 'doc-legacy', route: 'refuse', reason: 'Legacy Word format (1997–2003) — open it in Word and Save As → .docx, then drop that.' };
  }
  // TNEF (winmail.dat): Outlook's rich-text wrapper, the message and every attachment packed in
  // one binary stream. Renamed .txt it skipped the NUL probe below and walked into the text lane.
  if (buf.length >= 4 && buf[0] === 0x78 && buf[1] === 0x9f && buf[2] === 0x3e && buf[3] === 0x22) {
    return { format: 'tnef', route: 'refuse', reason: 'This is an Outlook winmail.dat bundle — the message and its attachments packed in a form this app can’t read. Ask the sender to resend in plain text or HTML, or open it with a winmail.dat viewer, save each attachment as its own file, and drop those.' };
  }
  // RTF writes an accented letter as \'e9 and a picture as a hex blob: "Ren\'e9e" is a name no
  // rule reads. It is also the body format inside TNEF.
  const head = String.fromCharCode(...buf.subarray(0, 16)).replace(/^\xEF\xBB\xBF/, '').replace(/^\s+/, '');
  if (head.startsWith('{\\rtf')) {
    return { format: 'rtf', route: 'refuse', reason: 'Rich Text (.rtf) isn’t supported yet — it encodes accented letters and pictures in a form this app can’t read. Open it in Word and Save As → .docx, then drop that.' };
  }
  // Email, by extension AND by content, decided before the text lane or a renamed file walks
  // straight in. A file named as mail is refused by its extension. Anything else meets the
  // content rules above (contentHold) on its whole decoded text: a message's header block, a
  // base64, uuencoded, yEnc or quoted-printable part, or an encoded header word is refused
  // whatever the file is named. Round 2's four header-sniff bypasses (a blank line above the
  // headers, a forwarded-message line above them, a UTF-16LE Save As, an .emlx length prefix)
  // and a header block past the first 4 KB are held by it, because it reads the whole text
  // rather than an opening window (test/intake-refusal.mjs runs the round-2 sniff on the same
  // shapes).
  //
  // What it does not claim: an email with no transport headers and no encoded part — pasted
  // from Outlook's reading pane, or saved by File → Save As → Text — is readable text and goes
  // through, as it should; that is the way through the refusal offers. A document that quotes
  // transport lines without the message's own From or Date goes through too (mailHeaderLine).
  // Not refused either: a base64 part shorter than 16 characters; a one-line part of 88
  // characters or fewer (about 66 bytes) that decodes to binary, or up to 512 in a link's query
  // string or in the path of a link with a scheme, unless it is a zlib or gzip stream; a binary part wrapped under 16 columns, which no
  // encoder writes; a wrapped binary part of under 16 full lines whose size is an exact
  // multiple of the line (one in 57 at MIME's width), which is a list of digests by its shape;
  // a wrapped binary part of eight lines or more that all open with the same character (about
  // once in 4 × 10¹²), which is a column of ids by its shape; a short decode written as one
  // unbroken run ("QQ123456C"); a Latin-1 escape of a capital letter ("JOS=C9"); percent-escaped
  // letters of a non-Latin script inside a link or a path, accented Latin letters anywhere, or plain
  // letters escaped one at a time with readable letters between them (a run must hold two to be read);
  // whole-number percentages run together ("25%50%75%"), which read as escaped letters; encodings
  // other than base64, base32, hex, quoted-printable, percent-escapes, uuencode and yEnc
  // (ASCII85, for one). A "we catch renamed emails" line on any user-facing surface must
  // carry those exceptions.
  if (['eml', 'mbox', 'mbx', 'emlx'].includes(ext)) return { format: ext, route: 'refuse', reason: `Email files aren’t supported yet — ${MAIL_LIMIT}` };
  if (['mht', 'mhtml'].includes(ext)) return { format: ext, route: 'refuse', reason: 'Web archives (.mht) aren’t supported yet — they carry their pictures and attachments base64-encoded, which this app can’t read. Open it in a browser or Word, save it as text or .docx, and drop that.' };

  const probe = buf.subarray(0, 1024);
  if (!TEXT_EXT.includes(ext) && probe.includes(0)) {
    return { format: 'binary', route: 'refuse', reason: `Can’t read this file type${ext ? ' (.' + ext + ')' : ''} yet.` };
  }
  // The same decode the text lane uses (store.ts readText), so the rule reads what the engine
  // would be handed: a UTF-16 Save As, with or without a BOM, is read as the text it is.
  const hold = contentHold(readText(buf).text);
  if (hold) return { format: hold.format, route: 'refuse', reason: hold.reason };
  return { format: TEXT_EXT.includes(ext) ? ext : 'text', route: 'text' };
}
