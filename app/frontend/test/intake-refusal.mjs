// INTAKE REFUSAL — what the drop refuses before the engine is handed a word of it.
// Run from app/frontend:   node test/intake-refusal.mjs
//
// Follows test/protected-terms.mjs: esbuild the REAL modules (src/lib/extract/detect.ts, whose
// contentHold() reads the text that text.ts decodes) and drive detectFormat(), the call
// store.ts ingestFile makes before anything is read, and docxContentHold(), the one it makes
// after the Word walk. Then store.ts itself is bundled and handed the same files.
//
// LAUNCH.md §2.3 was NO-GO on 2026-09-22: an email reached the plain-text lane, the engine
// masked the name it could read, and the base64 copy of the same body — the name, the DOB and
// the NI number — went out in the export. The export check could not see it: spanSurvives()
// matches literal text. A frontier model decodes base64 in one step.
//
// The laws, and what each one costs when it breaks:
//
//   1. A SAVED EMAIL IS REFUSED WHATEVER IT IS NAMED OR WRAPPED IN: by extension, by an
//      Outlook .msg's own streams, by TNEF's magic, and by a transport header block ANYWHERE in
//      the decoded text — after a blank line, under a forwarded-message line or a cover note,
//      past the first 4 KB, quoted in a reply, saved as UTF-16 with or without a BOM.
//      Cost: the round-2 adversarial pass got a name, a DOB and an NI number through the old
//      opening-window sniff in four of these shapes.
//
//   2. ENCODED CONTENT IS REFUSED WHETHER OR NOT IT LOOKS LIKE AN EMAIL: a wrapped base64 block,
//      a long base64 run, a short base64 or hex token that decodes to readable text, a PEM
//      block, an encoded mail-header word, a quoted-printable soft break inside a word or a
//      quoted-printable letter escape. Cost: the attachment, or a name split as "Mar=" /
//      "garet", leaves unmasked behind a clean export check.
//
//   3. WHAT A LAWYER WOULD NOT CALL ENCODED GOES THROUGH: a TO:/FROM:/RE: memo, Outlook's own
//      Save As → Text (the way through the email refusal gives), an opinion quoting From:/To:
//      lines, a hex or base64 digest in an exhibit, a long number, a formula, glued PDF prose.
//      Cost: every false refusal is a document the lawyer cannot use, and a refusal that fires
//      on ordinary text teaches them to route around the app.
//
//   4. EVERY REFUSAL SAYS WHY AND OFFERS THE WAY THROUGH, and never quotes the document.
//
//   5. FALSE REFUSALS ARE MEASURED over every real text on disk: the 99 opinions and the repo's
//      own documents always; the TAB judgments, the EDGAR contracts and the CAP volumes when
//      the gitignored raw/ tree is present (each skip says so and is not a pass).
//
//   6. THE DROP HOLDS WHAT THE RULES HOLD: store.ts ingestFile, bundled as the app ships it,
//      holds a Word file whose body (hidden text included) or footer carries a base64 block,
//      queues a printed memo carrying a Safe Link, and keeps a refused PDF page's "[page N is
//      not included …]" line. Cost: a rule the drop never calls is a green test over a file
//      that ships the block; the CONTROL unwires the call and sees it ship.
//
//   7. THE NODE COPY OF THE RULES IS THE APP'S: app/extract/detect.mjs is generated from
//      detect.ts, must match it byte for byte, and is asked every case above; app/extract's
//      node tests (test-text.mjs) route with it. No shipped path runs it: the app routes with
//      detect.ts, and app/extract's run.mjs and run-pdf.mjs are development walkers that apply
//      no intake rule, are not in the installer's resources and have no package bin. Cost: the
//      hand copy it replaced sent every saved email but an OLE .msg, and every base64 block, to
//      the text lane, and the node tests read that as what the app does.
//
// Each law has a CONTROL: the near-miss that must pass, and for law 1 the round-2 sniff
// recreated from its source, run on the same shapes, so a green run shows these shapes are the
// ones that got through before. Exit 1 on any FAIL.
import { build } from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const repo = join(here, '..', '..', '..');
const dir = mkdtempSync(join(tmpdir(), 'intake-refusal-'));
const url = (p) => 'file:///' + p.replace(/\\/g, '/');
const bundle = async (name, entry) => {
  const out = join(dir, name + '.mjs');
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(url(out));
};
const { detectFormat } = await bundle('detect', join(here, '..', 'src', 'lib', 'extract', 'detect.ts'));
const { readText } = await bundle('text', join(here, '..', 'src', 'lib', 'extract', 'text.ts'));
const { contentHold, docxContentHold, DOCX_SAVED_CHANNELS } = await import(url(join(dir, 'detect.mjs')));
const { extractDocx, flowText } = await bundle('docx', join(here, '..', 'src', 'lib', 'extract', 'docx.ts'));

// app/extract/detect.mjs, the node copy of the rules, is detect.ts transpiled (comments kept)
// with text.ts's readText inlined: the rules must decode what the app decodes, so they take the
// app's own reader (app/extract/text.mjs is held to it in the UTF-16 checks below). Kept by
// hand, it fell a round behind with none of the email or encoded-content rules. `--sync-mirror`
// writes it; every run compares it.
const MIRROR = join(repo, 'app', 'extract', 'detect.mjs');
function mirrorSource() {
  const ts = createRequire(join(here, '..', 'package.json'))('typescript');
  const tr = (src) => ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false, newLine: ts.NewLineKind.LineFeed } }).outputText;
  const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const det = lf(join(here, '..', 'src', 'lib', 'extract', 'detect.ts')), txt = lf(join(here, '..', 'src', 'lib', 'extract', 'text.ts'));
  const imports = (det.match(/^import .*$/gm) || []).join('\n');
  if (imports !== "import { readText } from './text';\nimport { flowLayout, inMainFlow, type DocxItem } from './docx';") throw new Error(`intake-refusal: detect.ts imports changed — give the mirror in app/extract the same, then update mirrorSource() here:\n${imports}`);
  const cut = txt.indexOf('export function wordCount');
  if (cut < 0) throw new Error('intake-refusal: text.ts no longer ends with wordCount — update mirrorSource()');
  return [
    '// GENERATED — do not edit. The node copy of app/frontend/src/lib/extract/detect.ts that',
    '// app/extract\'s node tests route with, transpiled from it with readText from text.ts inlined,',
    '// so they route and refuse what the app does. No shipped path imports it: the app routes with',
    '// detect.ts, and run.mjs and run-pdf.mjs here apply no intake rule. Regenerate from app/frontend with',
    '//   node test/intake-refusal.mjs --sync-mirror',
    '// That test fails while this file differs from a fresh transpile. The reasoning behind each',
    '// rule is in the comments carried over from the source.',
    "import { flowLayout, inMainFlow } from './docx.mjs';",
    '',
    tr(txt.slice(0, cut)).replace(/^export function readText/m, 'function readText').trimEnd(),
    '',
    tr(det.replace(/^import .*\n/gm, '')).trimEnd(),
    '',
  ].join('\n');
}
if (process.argv.includes('--sync-mirror')) { writeFileSync(MIRROR, mirrorSource()); console.log(`wrote ${MIRROR}`); }
let mirror = null, mirrorError = '';
try { mirror = await import(url(MIRROR)); } catch (e) { mirrorError = String(e?.message || e); }
const mirrorLacks = ['detectFormat', 'docxContentHold'].filter((f) => mirror && typeof mirror[f] !== 'function');
if (mirrorLacks.length) { mirrorError = `it does not export ${mirrorLacks.join(' or ')}: an older copy, regenerate it`; mirror = null; }
const parityMiss = [];
let parityRuns = 0;

let pass = 0, fail = 0, skip = 0;
const check = (ok, what, detail = '') => { console.log((ok ? '  PASS  ' : '  FAIL  ') + what + (detail ? '\n          ' + detail : '')); ok ? pass++ : fail++; };
const skipped = (what, why) => { console.log('  SKIP  ' + what + '\n          ' + why); skip++; };

const utf8 = (s) => new TextEncoder().encode(s);
const utf16le = (s, bom) => {
  const b = new Uint8Array((bom ? 2 : 0) + s.length * 2);
  let o = 0;
  if (bom) { b[0] = 0xff; b[1] = 0xfe; o = 2; }
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[o + 2 * i] = c & 0xff; b[o + 2 * i + 1] = c >> 8; }
  return b;
};
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const wrap = (s, n = 76) => s.match(new RegExp(`.{1,${n}}`, 'g')).join('\r\n');

// The document everything below hides: fictitious, the shape round 2 used.
const SECRET = 'Jane Roe, DOB 01/02/1980, NI QQ123456C, 14 Wisteria Lane, Greendale. Our client instructs us to settle for the sum discussed on the call; please treat this as privileged.';
// A small attachment: the same letter three times over, base64 at 76 columns as MIME writes it.
const ATTACH = wrap(b64((SECRET + '\n').repeat(3)));
const EMAIL = [
  'Return-Path: <partner@firm.example>',
  'Received: from mail.firm.example (mail.firm.example [192.0.2.10])',
  '\tby mx.client.example with ESMTPS id 4f3a2b; Tue, 22 Sep 2026 09:14:03 +0100',
  'Message-ID: <20260922091403.4f3a2b@firm.example>',
  'MIME-Version: 1.0',
  'From: A Partner <partner@firm.example>',
  'To: General Counsel <gc@client.example>',
  'Subject: Settlement',
  'Content-Type: multipart/mixed; boundary="zz"',
  '',
  '--zz',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Please see the attached letter.',
  '--zz',
  'Content-Type: application/octet-stream; name="letter.txt"',
  'Content-Transfer-Encoding: base64',
  '',
  ATTACH,
  '--zz--',
  '',
].join('\r\n');

/** detect.ts's verdict; the node mirror is asked the same and any difference is kept for §4 */
const route = (bytes, name) => {
  const r = detectFormat(bytes, name);
  if (mirror) {
    parityRuns++;
    const m = mirror.detectFormat(bytes, name);
    if (m.route !== r.route || m.format !== r.format || m.reason !== r.reason) parityMiss.push(`${name}: app ${r.route}/${r.format}, mirror ${m.route}/${m.format}`);
  }
  return r;
};
const refused = (r) => r.route === 'refuse';
/** a refusal reason offers a way through ("drop", "save", "delete", "open", "resend") */
const wayThrough = (r) => /\b(drop|save|delete|open|resend)\b/i.test(r.reason || '');
/** a refusal reason never carries the document's own words */
const quotesDoc = (r) => /Jane|Roe|QQ123456C|Wisteria|Greendale|Margaret|Ren(é|=)|SmFu/.test(r.reason || '');
function refuses(bytes, name, what, expect) {
  const r = route(bytes, name);
  const ok = refused(r) && (!expect || expect.test(r.reason)) && wayThrough(r) && !quotesDoc(r);
  check(ok, what, ok ? `${r.format}: ${r.reason.slice(0, 120)}…` : `got route=${r.route} format=${r.format} reason=${r.reason || '(none)'}`);
  return r;
}
function passes(bytes, name, what) {
  const r = route(bytes, name);
  check(r.route === 'text', what, r.route === 'text' ? '' : `refused as ${r.format}: ${r.reason}`);
}

// The round-2 sniff, recreated from its source (detect.ts before this law): the opening 4 KB,
// a UTF-8 BOM skipped, a "From " line skipped, and the first non-header line ends the look.
const MAIL_HEADERS_R2 = /^(?:mime-version|content-transfer-encoding|message-id|received|return-path|delivered-to|dkim-signature)$/;
function round2Sniff(buf) {
  const at = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0;
  const lines = String.fromCharCode(...buf.subarray(at, at + 4096)).replace(/\r\n/g, '\n').split('\n');
  let i = /^From \S/.test(lines[0] || '') ? 1 : 0;
  let mail = false;
  for (; i < lines.length; i++) {
    if (lines[i] === '') break;
    if (/^[ \t]/.test(lines[i])) continue;
    const name = lines[i].match(/^([A-Za-z][A-Za-z0-9-]*):/);
    if (!name) return false;
    if (MAIL_HEADERS_R2.test(name[1].toLowerCase())) mail = true;
  }
  return mail;
}

console.log('\n1. A saved email is refused whatever it is named or wrapped in');
const COVER = 'Dear colleague,\r\n\r\nBelow is the message from opposing counsel that I mentioned. Please review before our call.\r\n\r\nRegards,\r\nA Partner\r\n\r\n';
const SHAPES = [
  ['.eml by extension', utf8(EMAIL), 'message.eml'],
  ['.mbox by extension', utf8('From partner@firm.example Tue Sep 22 09:14:03 2026\n' + EMAIL), 'archive.mbox'],
  ['mbox with no extension (Thunderbird names it "Inbox")', utf8('From partner@firm.example Tue Sep 22 09:14:03 2026\n' + EMAIL), 'Inbox'],
  ['.emlx length prefix, renamed .txt', utf8(`${EMAIL.length}\n` + EMAIL), 'message.txt'],
  ['leading blank line above the headers', utf8('\r\n' + EMAIL), 'message.txt'],
  ['forwarded-message line above the headers', utf8('---------- Forwarded message ---------\r\n' + EMAIL), 'message.txt'],
  ['pasted into a .txt after a cover note', utf8(COVER + EMAIL), 'note.txt'],
  ['header block past the first 4 KB', utf8(COVER.repeat(30) + EMAIL), 'note.txt'],
  ['quoted in a reply with "> " prefixes', utf8('Thanks, see below.\r\n\r\n' + EMAIL.split('\r\n').map((l) => '> ' + l).join('\r\n')), 'reply.txt'],
  ['UTF-16LE Save As, with a BOM', utf16le(EMAIL, true), 'message.txt'],
  ['UTF-16LE Save As, no BOM', utf16le(EMAIL, false), 'message.txt'],
  ['MIME part headers only (the top block cut off)', utf8(EMAIL.slice(EMAIL.indexOf('--zz\r\nContent-Type: application'))), 'part.txt'],
];
// The reason must be the mail reason: the attachment inside EMAIL would be refused by the
// base64 rule anyway, and a pass on that would say nothing about the header rule.
const MAIL_REASON = /an email’s headers|Email files/;
for (const [what, bytes, name] of SHAPES) refuses(bytes, name, what, MAIL_REASON);
// With no encoded part at all, the header block is the only thing that can refuse it.
const PLAIN = EMAIL.slice(0, EMAIL.indexOf('Content-Type: multipart')) + 'Content-Type: text/plain; charset=us-ascii\r\nContent-Transfer-Encoding: 7bit\r\n\r\n' + SECRET + '\r\n';
{
  const r = refuses(utf8(COVER + PLAIN), 'note.txt', 'a 7bit email with no encoded part, pasted after a cover note', MAIL_REASON);
  // Round 3 (OR-3): the reason said every email "carries base64-encoded parts" and named only
  // "open the message" — false for this one, and no way through for a document that quotes one.
  check(/can carry base64/.test(r.reason || '') && !/carries base64/.test(r.reason || '') && /quoted in a document, delete those lines/.test(r.reason || ''), 'the header reason says an email CAN carry encoded parts and names both ways through', r.reason);
}

console.log('\n   CONTROL: the round-2 sniff on the same shapes — the ones it let through are the ones this law closes');
const R2_MISSED = ['leading blank line above the headers', 'forwarded-message line above the headers', 'pasted into a .txt after a cover note', 'header block past the first 4 KB', 'quoted in a reply with "> " prefixes', 'UTF-16LE Save As, with a BOM', 'UTF-16LE Save As, no BOM', 'MIME part headers only (the top block cut off)', '.emlx length prefix, renamed .txt'];
for (const [what, bytes] of SHAPES.filter(([w]) => R2_MISSED.includes(w))) {
  check(!round2Sniff(bytes), `round-2 sniff misses: ${what}`);
}

console.log('\n   Container formats, by their own bytes');
const ole = (streams) => {
  const b = new Uint8Array(2048);
  b.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  let o = 1024;
  for (const s of streams) { for (const c of s) { b[o++] = c.charCodeAt(0); b[o++] = 0; } o += 64 - ((o - 1024) % 64); }
  return b;
};
refuses(ole(['Root Entry', '__substg1.0_0037001F', '__properties_version1.0']), 'message.msg', 'Outlook .msg by extension', /Outlook/);
refuses(ole(['Root Entry', '__substg1.0_0037001F', '__properties_version1.0']), 'message.doc', 'Outlook .msg renamed .doc is told it is a message, not "open it in Word"', /Outlook/);
{
  const r = route(ole(['Root Entry', 'WordDocument', '1Table']), 'brief.doc');
  check(refused(r) && /Legacy Word/.test(r.reason), 'CONTROL: a real legacy .doc still gets the Word way through', r.reason);
}
const TNEF = new Uint8Array([0x78, 0x9f, 0x3e, 0x22, 0x01, 0x00, 0x01, 0x06, 0x90, 0x08, 0x00, ...utf8('attached letter text ' + SECRET)]);
refuses(TNEF, 'winmail.dat', 'winmail.dat (TNEF)', /winmail/);
refuses(TNEF, 'winmail.txt', 'winmail.dat renamed .txt — it used to skip the NUL probe into the text lane', /winmail/);
refuses(utf8('{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Times;}}\\f0 Dear Ren\\\'e9e Roe,\\par Our client instructs us.}'), 'letter.rtf', 'Rich Text (.rtf)', /Rich Text/);
refuses(utf8('{\\rtf1\\ansi Dear Ren\\\'e9e Roe}'), 'letter.txt', 'Rich Text renamed .txt', /Rich Text/);
refuses(utf8(EMAIL), 'page.mht', 'web archive (.mht)', /\.mht/);

console.log('\n   CONTROL: mail-shaped text that is not a saved email goes through');
passes(utf8('MEMORANDUM\r\nTO: File\r\nFROM: A Partner\r\nDATE: 22 September 2026\r\nRE: Roe settlement\r\n\r\nThe client instructs us to settle.\r\n'), 'memo.txt', 'a TO:/FROM:/DATE:/RE: memo');
passes(utf8('From:\tA Partner\r\nSent:\tTuesday, 22 September 2026 09:14\r\nTo:\tGeneral Counsel\r\nSubject:\tSettlement\r\n\r\nPlease see the attached letter.\r\n'), 'message.txt', 'Outlook File → Save As → Text (the way through the email refusal gives)');
passes(utf8('The district court admitted the email, which read in full:\n\nFrom: John Smith\nTo: Mary Jones\nSubject: the shipment\n\nWe cannot deliver by Friday.\n\nReceived: from the clerk on May 5, the exhibit was sealed.\n'), 'opinion.txt', 'an opinion quoting From:/To:/Subject: lines, and a "Received: from" in prose');
passes(utf8('The message carried the header MIME-Version: 1.0 and nothing else of note.\n'), 'opinion.txt', 'one transport header named in prose (a block needs two lines)');
// Round 3 (OR-3): documents that QUOTE transport lines were refused as "a saved email whatever
// it is named". Ruled as a lawyer would: a message's own header carries its From or Date
// (RFC 5322 requires both) and two different transport headers; an excerpt "in relevant part",
// a slip sheet's Message-ID field, an evidence log's "Received: from … by …" does not, and every
// line of it is readable text the engine masks.
passes(utf8('DECLARATION OF FORENSIC EXAMINER\n\n1. I examined the native file of Exhibit 12. Its transport header reads, in relevant part:\n\nReceived: from mail-sor-f41.google.com (mail-sor-f41.google.com. [209.85.220.41])\n        by mx.google.com with SMTPS id a1sor123456qkb.7.2021.03.04.10.15.22\nMessage-ID: <CAF3xYz0abc123@mail.gmail.com>\nMIME-Version: 1.0\n\n2. The Received line shows the message entered Google\'s network at 10:15:22 UTC.\n'), 'declaration.txt', 'a forensic declaration quoting Received / Message-ID / MIME-Version "in relevant part"');
passes(utf8('Each message bore routing information falsified in the same way, e.g.:\nReceived: from unknown (HELO mail.example.net) by mx.plaintiff.example with SMTP; 4 Mar 2006\nReceived: from [10.0.0.5] by mail.example.net id 4f3a2b\nThe district court found the headers "materially misleading" under 15 U.S.C. § 7704(a)(1).\n'), 'opinion.txt', 'a CAN-SPAM opinion quoting two Received lines');
passes(utf8('The government authenticated the email through its header, which the agent read to the jury:\nMessage-ID: <20190304101522.1234@corp-mail.example.com>\nDate: Mon, 4 Mar 2019 10:15:22 -0500\nFrom: J. Doe <jdoe@corp-mail.example.com>\nThat evidence was sufficient under Rule 901(b)(4).\n'), 'opinion.txt', 'an FRE 901 opinion quoting Message-ID / Date / From (one transport header)');
passes(utf8('PRODUCTION SLIP SHEET\nBegBates: ACME-0001234\nEndBates: ACME-0001236\nCustodian: Roe, Jane\nDateSent: 03/04/2021\nMessage-ID: <DM6PR11MB43210ABC@DM6PR11MB4321.namprd11.prod.outlook.com>\nMD5Hash: 9e107d9d372bb6826bd81d3542a419d6\n'), 'slipsheet.txt', 'an ESI slip sheet with a Message-ID field');
passes(utf8('EVIDENCE CHAIN OF CUSTODY\nItem: Laptop, S/N 7X2K9L3\nReceived: from Det. J. Smith by Evidence Tech. M. Jones\nDate: 03/14/2026 14:22\n'), 'custody.txt', 'a chain-of-custody log ("Received: from Det. J. Smith by Evidence Tech. M. Jones")');
passes(utf8('Date: 12 March 2026\nReceived: from the Claimant\'s solicitors by DX\nAction: acknowledge within 14 days\n'), 'register.txt', 'a correspondence register');
// Round 4 (OR-3, no teeth in round 3): the documents above hold at most one kind of transport
// header, so none reached the Received line's SMTP shape. This one has a second (Message-ID)
// and the From and Date: only the shape of its Received line — an evidence log's "from X by Y",
// no SMTP verb, id or date stamp — keeps it from being called a saved email.
passes(utf8('FORENSIC REPORT\n\nThe native header of Exhibit 12 reads, in relevant part:\n\nReceived: from Det. Smith by Evidence Tech. Jones\nMessage-ID: <CAF3xYz0abc123@mail.gmail.com>\nFrom: J. Doe <jdoe@corp.example>\nDate: Mon, 4 Mar 2019 10:15:22 -0500\n\nThe examiner testified the chain was intact.\n'), 'report.txt', 'a forensic report quoting an evidence-log Received line with Message-ID, From and Date');
refuses(utf8('The examiner quoted the whole header:\n\nReceived: from mail.firm.example by mx.client.example with ESMTPS id 4f3a2b; Tue, 22 Sep 2026 09:14:03 +0100\nMessage-ID: <20260922091403.4f3a2b@firm.example>\nFrom: A Partner <partner@firm.example>\nDate: Tue, 22 Sep 2026 09:14:03 +0100\n\nEnd of quotation.\n'), 'declaration.txt', 'CONTROL: a whole message header quoted in a document is still refused, with the delete-the-lines way through', /quoted in a document, delete those lines/);

console.log('\n2. Encoded content is refused whether or not it looks like an email');
refuses(utf8('Exhibit C\r\n\r\n' + ATTACH + '\r\n'), 'exhibit.txt', 'a bare wrapped base64 block, no headers anywhere', /encoded content/);
// A binary attachment (a compressed PDF, a .docx): every line decodes to noise, so only the
// block's shape can refuse it. Deterministic bytes, so the run is the same every time.
const BIN = new Uint8Array(900).map((_, i) => (i * 131 + 17 * (i >> 3)) & 0xff);
const BIN_B64 = wrap(Buffer.from(BIN).toString('base64'));
refuses(utf8('Exhibit C\r\n\r\n' + BIN_B64 + '\r\n'), 'exhibit.txt', 'a bare wrapped base64 block of binary (an attachment that decodes to noise)', /encoded content/);
refuses(utf8('See below.\r\n\r\n' + BIN_B64.split('\r\n').map((l) => '> ' + l).join('\r\n') + '\r\n'), 'reply.txt', 'the same block quoted in a reply with "> " prefixes and no headers', /encoded content/);
refuses(utf8('Attachment follows: ' + b64((SECRET + ' ').repeat(2)) + ' end.'), 'note.txt', 'a long base64 run inside a prose line', /encoded content/);
refuses(utf8('Short part:\r\n\r\n' + b64('Jane Roe QQ123456C') + '\r\n'), 'part.txt', 'a short base64 part (24 chars) that decodes to a name — under round 2\'s 40-char line rule', /encoded content/);
refuses(utf8('See ![scan](data:image/png;base64,' + Buffer.alloc(300, 7).toString('base64').replace(/B/g, 'k9') + ')'), 'notes.md', 'an image embedded as a data: URI', /encoded content/);
refuses(utf8('Portal link: https://portal.example/view?ref=' + b64('client=Jane Roe;matter=4471') + '\n'), 'links.txt', 'a query parameter carrying a base64 name', /encoded content/);
const jwt = ['{"alg":"HS256"}', '{"sub":"Jane Roe","email":"jroe@client.example"}'].map((s) => Buffer.from(s).toString('base64url')).join('.') + '.c2lnbmF0dXJl';
refuses(utf8('Bearer token in the incident log: ' + jwt + '\n'), 'incident.txt', 'a JWT whose payload names a person', /encoded content/);
refuses(utf8('Recovered string: ' + Buffer.from('Jane Roe QQ123456C').toString('hex') + '\n'), 'forensic.txt', 'hex that decodes to a name', /encoded content/);
// Round 4 (INT-5): under 24 characters round 3 asked for two words of three letters or more, and
// an NI number, or a surname and a matter number, went out encoded in a portal link or a
// recovered string. A decode that short is judged by its shape: words and numbers with a space
// between them, or a word beside a number, is text. The CONTROLs below the pass list are the
// identifiers the shape still lets through.
const hex = (s) => Buffer.from(s).toString('hex');
refuses(utf8('See the portal https://portal.example.com/matter?ref=' + b64('NI QQ123456C') + ' for the file.\n'), 'links.txt', 'a 16-character base64 token that decodes to a labelled NI number', /encoded content/);
refuses(utf8('See the portal https://portal.example.com/matter?ref=' + b64('J Roe QQ123456C') + ' for the file.\n'), 'links.txt', 'a 20-character base64 token that decodes to an initial, a surname and an NI number', /encoded content/);
refuses(utf8('Recovered string: ' + hex('Roe 4471X') + '\n'), 'forensic.txt', 'an 18-character hex string that decodes to a surname and a matter number', /encoded content/);
refuses(utf8('Recovered string: ' + hex('Roe/4471X') + '\n'), 'forensic.txt', 'the same with no space: a surname beside a number', /encoded content/);
refuses(utf8('See the portal https://portal.example.com/matter?ref=' + b64('id=Roe&no=4471') + '\n'), 'links.txt', 'a query string carrying a surname and a number, base64-encoded (20 characters)', /encoded content/);
// Round 5 (INT-EVADE-1): the shape rule was anchored on a letter or digit at both ends, so the
// same payloads in brackets, in quotes or with a "!" went through. The LEI and Salesforce
// CONTROLs below are what a wider trim (every symbol at the ends, braces as joints) refuses.
const bu = (s) => Buffer.from(s).toString('base64url');
for (const p of ['(NI QQ123456C)', '"NI QQ123456C"', 'NI QQ123456C!', '(J Roe 4471X)']) {
  refuses(utf8('See the portal https://portal.example.com/matter?ref=' + b64(p) + ' for the file.\n'), 'links.txt', `a base64 token in a link that decodes to ${p}`, /encoded content/);
}
refuses(utf8('Recovered string: ' + hex('(Roe 4471X)') + '\n'), 'forensic.txt', 'hex that decodes to a surname and a number in brackets', /encoded content/);
refuses(utf8('Recovered string: ' + hex('Roe 4471X?') + '\n'), 'forensic.txt', 'hex that decodes to a surname and a number with a "?"', /encoded content/);
refuses(utf8('Bearer token in the incident log: ' + [bu('{"alg":"HS256"}'), bu('{"sub":"QQ123456C"}'), 'c2lnbmF0dXJl'].join('.') + '\n'), 'incident.txt', 'a short JWT whose payload is {"sub": an NI number} (under 24 characters)', /encoded content/);
// Round 5 (INT-EVADE-2): the app decoded base64 and hex only. Base32 is valid base64, so a name
// in base32 decoded as junk; a percent-escaped letter is a name no rule read.
const b32 = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '', out = ''; for (const x of Buffer.from(s)) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out + '='.repeat((8 - (out.length % 8)) % 8); };
refuses(utf8('Transfer reference: ' + b32('Jane Roe QQ123456C') + '\n'), 'mft.txt', 'a base32 token that decodes to a name and an NI number', /encoded content/);
refuses(utf8('Exhibit C\r\n\r\n' + wrap(b32((SECRET + '\n').repeat(2))) + '\r\n'), 'exhibit.txt', 'a base32 block wrapped at 76 columns that decodes to the letter', /encoded content/);
refuses(utf8('Exhibit C\r\n\r\n' + wrap(b32('Our client Jane Roe, NI QQ123456C.'), 8) + '\r\n'), 'exhibit.txt', 'the same name in base32 wrapped at 8 columns (every line under the token rule\'s 16)', /encoded content/);
// A link's percent-escapes: a "%22" before a token was read as its first two characters, which
// put the decode out of step, and a "%2B" inside one cut it in two.
refuses(utf8('Portal: https://portal.example.com/view?ref=%22' + b64('Jane Roe QQ123456C') + '%22\n'), 'links.txt', 'a base64 name between percent-escaped quotes in a link', /encoded content/);
{
  const v = b64('Jane Roe >>> QQ123456C');
  check(v.includes('+'), 'CONTROL setup: the base64 of the name carries a "+"', v);
  refuses(utf8('Portal: https://portal.example.com/view?ref=' + encodeURIComponent(v) + '\n'), 'links.txt', 'a base64 name in a link with its "+" written "%2B"', /encoded content/);
}
refuses(utf8('Search: https://portal.example.com/find?q=%4A%61%6E%65%20%52%6F%65&matter=4471\n'), 'links.txt', 'a link whose query is "Jane Roe" with every letter percent-escaped', /encoded content/);
refuses(utf8('Recovered: %4A%61%6E%65%20%52%6F%65%2C%20%4E%49%20%51%51%31%32%33%34%35%36%43\n'), 'forensic.txt', 'percent-escaped letters outside a link', /encoded content/);
const CERT = '-----BEGIN CERTIFICATE-----\n' + wrap(b64('0\x82 subject CN=Jane Roe, emailAddress=jroe@client.example, O=Client Ltd ' + 'x'.repeat(200)), 64).replace(/\r/g, '') + '\n-----END CERTIFICATE-----\n';
refuses(utf8('EXHIBIT D — SIGNING CERTIFICATE\n\nThe Licensor shall sign each release with the following certificate:\n\n' + CERT), 'licence.txt', 'a PEM certificate block in a contract exhibit', /certificate/);
refuses(utf8('-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,3F17F5316E2BAC89\n\n' + wrap(b64('k'.repeat(120)), 64).replace(/\r/g, '') + '\n-----END RSA PRIVATE KEY-----\n'), 'key.txt', 'a PEM private key with armour headers, told a private key is a credential', /rsa private key block .*a private key is a credential/);
// Round 5 (REASON-WORDING): the firm's own PGP key on a letterhead was "an encoded pgp public
// key block block" and "a credential".
refuses(utf8('A. Partner, Firm LLP\n-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n' + wrap(b64('k'.repeat(120)), 64).replace(/\r/g, '') + '\n-----END PGP PUBLIC KEY BLOCK-----\n'), 'letterhead.txt', 'a PGP public key block, named once and not called a credential', /an encoded pgp public key block \(line 2\) .*names its holder(?!.*credential)/);
refuses(utf8('From: =?utf-8?B?' + b64('Renée Roe') + '?= <rroe@client.example>\n\nThanks.\n'), 'header.txt', 'an RFC 2047 encoded header word (B)', /encoded email header/);
refuses(utf8('Subject: =?iso-8859-1?Q?Ren=E9e_Roe_settlement?=\n'), 'header.txt', 'an RFC 2047 encoded header word (Q)', /encoded email header/);
// An encoder breaks at its line limit, so the broken line is a long one (66 characters here).
refuses(utf8('Dear colleague, please find attached the witness statement of Mar=\r\ngaret Roe, which should be read with the exhibit.\r\n'), 'body.txt', 'a quoted-printable soft break splitting a name ("Mar=" / "garet")', /quoted-printable/);
refuses(utf8('The claimant, Ren=C3=A9e Roe, instructs us.\n'), 'body.txt', 'a quoted-printable UTF-8 letter escape inside a name', /quoted-printable/);
refuses(utf8('The claimant, Ren=E9e Roe, instructs us.\n'), 'body.txt', 'a quoted-printable Latin-1 letter escape inside a name', /quoted-printable/);
refuses(utf8('Our client, Jos=C3=A9 Roe, and =C3=89lise Roe instruct us.\n'), 'body.txt', 'a quoted-printable UTF-8 escape at a word\'s edge ("Jos=C3=A9", "=C3=89lise")', /quoted-printable/);
// Round 3 (F-I-2): encodings that got past the block rule's width and alphabet.
const wrapN = (s, n) => s.match(new RegExp(`.{1,${n}}`, 'g')).join('\r\n');
const BIN_RAW = Buffer.from(BIN).toString('base64');
refuses(utf8('Exhibit\r\n\r\n' + wrapN(Buffer.from(BIN).toString('base64url'), 76) + '\r\n'), 'e.txt', 'a binary attachment in the URL-safe alphabet (-_) at 76', /encoded content/);
refuses(utf8('Exhibit\r\n\r\n' + wrapN(BIN_RAW, 76).split('\r\n').map((l) => l.slice(0, 20) + ' ' + l.slice(20)).join('\r\n') + '\r\n'), 'e.txt', 'a binary attachment with a space injected in every line', /encoded content/);
{
  const out = []; const w = [70, 72, 74, 68];
  for (let i = 0, k = 0; i < BIN_RAW.length; k++) { out.push(BIN_RAW.slice(i, i + w[k % 4])); i += w[k % 4]; }
  refuses(utf8('Exhibit\r\n\r\n' + out.join('\r\n') + '\r\n'), 'e.txt', 'a binary attachment re-wrapped at uneven widths (68–74)', /encoded content/);
}
refuses(utf8('Exhibit\r\n\r\n' + wrapN(BIN_RAW, 20) + '\r\n'), 'e.txt', 'a binary attachment wrapped at 20 columns, no short last line', /encoded content/);
refuses(utf8('Exhibit\r\n\r\n' + wrapN(b64('Dear Sir,\nOur client Jane Roe (DOB 01/02/1980, NI QQ123456C) instructs us to settle.\n'), 12) + '\r\n'), 'e.txt', 'a name wrapped at 12 columns (every line under the token rule\'s 16)', /encoded content/);
refuses(utf8('Attachment\r\n' + wrapN(b64('Our client Jane Roe, NI QQ123456C.'), 12) + '\r\nRegards\r\n'), 'e.txt', 'the same at 12 columns with a word line touching it above and below', /encoded content/);
{
  const body = Buffer.from((SECRET + '\n').repeat(2), 'utf8');
  let y = `=ybegin line=128 size=${body.length} name=letter.txt\n`, line = '';
  for (const b of body) { let e = (b + 42) & 0xff; if (e === 0 || e === 10 || e === 13 || e === 0x3d) { line += '='; e = (e + 64) & 0xff; } line += String.fromCharCode(e); if (line.length >= 128) { y += line + '\n'; line = ''; } }
  refuses(utf8('Exhibit\r\n\r\n' + y + line + `\n=yend size=${body.length}\n`), 'e.txt', 'a yEnc attachment (=ybegin … =yend)', /encoded content/);
  let uu = 'begin 644 letter.txt\n';
  for (let i = 0; i < body.length; i += 45) {
    const c = body.subarray(i, i + 45);
    let l = String.fromCharCode(c.length + 32);
    for (let j = 0; j < c.length; j += 3) { const [b0, b1 = 0, b2 = 0] = [c[j], c[j + 1], c[j + 2]]; l += String.fromCharCode(((b0 >> 2) & 63) + 32, (((b0 << 4) | (b1 >> 4)) & 63) + 32, (((b1 << 2) | (b2 >> 6)) & 63) + 32, (b2 & 63) + 32); }
    uu += l + '\n';
  }
  refuses(utf8('Exhibit\n\n' + uu + '`\nend\n'), 'e.txt', 'a uuencoded attachment (begin 644 … end)', /encoded content/);
}
// Round 3 (OR-2): a name base64-encoded twice is still a name.
refuses(utf8('Portal link: https://portal.example/view?ref=' + b64(b64('client=Jane Roe;matter=4471')) + '\n'), 'links.txt', 'a name base64-encoded twice', /encoded content/);
// Round 3 (OR-10): a file saved with bare CRs is told the right line.
{
  const r = route(utf8('First line.\rSecond line.\rThe claimant, Ren=E9e Roe, instructs us.\r'), 'mac.txt');
  check(refused(r) && /\(line 3\)/.test(r.reason), 'a CR-only file is told line 3, not line 1', r.reason);
  const r2 = route(utf8('First line.\r\nSecond line.\r\nThe claimant, Ren=E9e Roe, instructs us.\r\n'), 'win.txt');
  check(refused(r2) && /\(line 3\)/.test(r2.reason), 'CONTROL: the same file with CRLF is told line 3', r2.reason);
}

console.log('\n   CONTROL: what a lawyer would not call encoded goes through');
const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
passes(utf8(`SCHEDULE 2 — ESCROW DEPOSIT\n\nSHA-256 of the deposit archive:\n${sha}\n\nSHA-1: da39a3ee5e6b4b0d3255bfef95601890afd80709\nMD5: d41d8cd98f00b204e9800998ecf8427e\n`), 'escrow.txt', 'hex digests in a software-escrow schedule');
passes(utf8(`Deposit manifest:\n${sha}\n${'9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'}\n${'60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbf9f15b4c6e8a8'}\n`), 'escrow.txt', 'a list of hex digests one per line');
passes(utf8('Integrity value (base64): 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=\n'), 'escrow.txt', 'a base64 SHA-256 digest (44 chars, decodes to binary)');
// Round 5 (OR-QP-DIGEST): the line above passed only because it was the file's last. With a
// line under it, its padding "=" read as a quoted-printable soft break; so did a go.sum pair and
// the rows of a PDF hash log. The "Mar=" / "garet" refusal in law 2 is the CONTROL.
passes(utf8('Integrity value (base64): 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=\nVerified by: A. Examiner, 22 September 2026\n'), 'escrow.txt', 'the same digest line with a signature line under it');
passes(utf8('golang.org/x/text v0.14.0 h1:ScX5w1eTa3QqT8oi6+ziP7dTV1S2+ALU0bI+0zXKWiQ=\ngolang.org/x/text v0.14.0/go.mod h1:18ZOQIKpY8NJVqYksKHtTdi31H5itFRjB5/qKTNYzSU=\n'), 'compliance.txt', 'two go.sum lines quoted in an open-source compliance report');
passes(utf8('HASH VERIFICATION LOG\nACME-0001001 Board minutes 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=\nACME-0001002 Board minutes n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=\nACME-0001003 Resolutions 2jmj7l5rSw0yVb/vlWAYkK/YBwk=\n'), 'hashlog.txt', 'a hash log whose rows end in base64 SHA-256 and SHA-1 digests, as a PDF table reads');
passes(utf8('Digests:\n47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=\nn4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=\n'), 'escrow.txt', 'a list of base64 digests one per line (each padded, so not a wrapped block)');
passes(utf8('Account 4111111111111111 and Bates range ABC0001234567-ABC0001234999; transaction id 0x71C7656EC7ab88b098defB751B7401B5f6d8976F.\n'), 'numbers.txt', 'long numbers, a Bates range and a wallet address');
passes(utf8('The Licensor shall supply a certificate in the form:\n\n-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----\n'), 'spec.txt', 'a specification that shows the PEM markers with no content');
passes(utf8('Logos may be supplied inline as data:image/png;base64,… or as a separate file.\n'), 'spec.md', 'a specification that names the data: URI form with no payload');
passes(utf8('Let Y=AB+C, where A=FE and x=3D is not a letter. The total =\nthe sum of the parts.\n'), 'formula.txt', 'formulas with "=" and hex-looking pairs, and a line ending in " ="');
passes(utf8('Id. at 691 (internal quotations omitted). Ujnsubstantiated allegations of retaliation do not suffice.\n'), 'opinion.txt', 'an OCR typo that is base64-alphabet and 16 letters long');
passes(utf8('ThisAgreementismadeandenteredintoasofthedatelastsignedbelowbyandbetweentheLicensorandtheLicenseeeachaparty\n'), 'glued.txt', 'glued prose from a PDF text layer with no spaces (over 88 characters)');
// The 16 letters "afriendofAlmeida", glued in an F.3d opinion (f3d-710/0437-01), decode to
// letters either side of a "|" and a tab. The short-decode rule reads only a space as the
// joint that makes words and numbers a reference; with tab and "|" as joints this page held.
passes(utf8('Thegovernmentcalledthedefendant’sneighbor,afriendofAlmeida,whotestifiedthathesawthevanthatnight.\n'), 'opinion.txt', 'CONTROL: a glued token that decodes to letters around a tab and a "|"');
passes(utf8('See https://www.sec.gov/Archives/edgar/data/926282/000119312523089517/d418992dex103.htm and C:/Users/Clerk/Documents/Exhibits/Final/Signed/2026/September/Agreement.pdf\n'), 'links.txt', 'long URLs and file paths');
// Round 3 (OR-1): the letter-escape rule read every "key=VALUE" as "=E9". A link's query
// string and an all-caps formula or log line are not quoted-printable.
passes(utf8('MEMORANDUM\nRE: Data subject access request\n\nArticle 15 of the GDPR (Regulation (EU) 2016/679, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) gives the data subject a right of access. See also https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A62018CJ0311.\n'), 'memo.txt', 'a GDPR memo citing EUR-Lex by CELEX number');
passes(utf8('The 2025 proxy statement is at https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=DEF+14A&dateb=&owner=include&count=40.\n'), 'memo.txt', 'an EDGAR search link with "&type=DEF+14A"');
passes(utf8('Results sorted at https://www.example.gov/search?sort=DESC&page=2 and https://www.example.gov/search?court=FED&db=CASES.\n'), 'memo.txt', 'query strings "?sort=DESC", "?court=FED&db=CASES"');
passes(utf8('Draft: https://firm.sharepoint.com/:w:/s/Litigation/EaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefghi?e=F1aXyz and NYSCEF https://iapps.courts.state.ny.us/nyscef/ViewDocument?docIndex=x=6AGq1bOmp0sgR8tfzC\n'), 'links.txt', 'a SharePoint link ending "?e=F1a…" and a link carrying "x=6AG"');
passes(utf8('"Leverage Ratio" means Total Debt / EBITDA, where EBITDA=EBIT+DA and NET=DEBT-CASH for the Test Period.\n'), 'credit.txt', 'formulas written tight: "EBITDA=EBIT+DA", "NET=DEBT-CASH"');
passes(utf8('2026-03-04T10:15:22Z user=jroe action=DELETE object=Mailbox/Inbox/Settlement status=FAILED reason=HOLD\n'), 'hold-audit.log', 'a litigation-hold audit log line ("action=DELETE … status=FAILED")');
// Round 5 (QP-LETTER-NON-EMAIL): a key whose value is a base64 token ("session=F3xp…" read as
// "n" + "=F3" + "x"), about one log line in 350, and hex with an "h" suffix.
passes(utf8('2026-03-04T10:15:22Z event=token.issue user=jroe client=portal session=F3xpiuwBJubPc5yeMMxbao result=SUCCESS\n'), 'breach.log', 'a breach-report log line whose session value is a base64 token');
passes(utf8('The controller writes the status value=FFh when the flash is erased, and the loader patches opcode=E8h at offset 0x40.\nClaim 7: wherein the handshake byte ACK=FAh is returned within 10 ms.\n'), 'report.txt', 'a firmware report and a patent claim writing bytes as "FFh", "E8h", "FAh"');
refuses(utf8('Our client, St=E9phanie Roe, instructs us.\n'), 'body.txt', 'CONTROL: a quoted-printable letter in a name shaped like a key and value ("St=E9phanie")', /quoted-printable/);
refuses(utf8('Our client, Beno=EEt Roe, instructs us.\n'), 'body.txt', 'CONTROL: a quoted-printable letter before a small "t", not an "h" suffix', /quoted-printable/);
// Round 5 (LONG-LINK-TOKEN): a value over 88 characters in a link was refused by its shape
// alone as "an email attachment". Inside a link it is judged by what it decodes to.
{
  const mailflow = (json) => Buffer.from('Mailflow|' + json).toString('base64').replace(/=/g, '%3D');
  const safe = (m) => `https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.sec.gov%2Fnewsroom%2Fpress-releases%2F2026-101&data=05%7C02%7Cjsmith%40firm.example%7C4f1c2d3e5a6b7c8d9e0f1a2b3c4d5e6f%7C72f988bf86f141af91ab2d7cd011db47%7C1%7C0%7C638624123456789012%7CUnknown%7C${m}%7C0%7C%7C%7C&sdata=q2Xf8nV0wYk3sT9bLr4cJm7pZ1eHd6uGa5iKo0NyQwE%3D&reserved=0`;
  const NEW = mailflow('{"EmptyMapi":true,"V":"0.0.0000","P":"Win32","AN":"Mail","WT":2}');
  passes(utf8(`From:\tGeneral Counsel\r\nSent:\tTuesday, 22 September 2026 09:14\r\nTo:\tA Partner\r\nSubject:\tSEC release\r\n\r\nPlease see the SEC's release<${safe(NEW)}> and call me.\r\n`), 'message.txt', 'Outlook Save As → Text of a message carrying a current Safe Link (100-character record)');
  passes(utf8(`MEMORANDUM\nRE: SEC sweep\n\nThe client forwarded the release: ${safe(mailflow('{"V":"0.0.0000","P":"Win32","AN":"Mail","WT":2}'))}\n`), 'memo.txt', 'a memo carrying an older Safe Link');
  passes(utf8('The advertisement linked to https://www.acme-supplements.example/products/immune-boost?utm_source=google&utm_medium=cpc&gclid=Cj0KCQjwqs3rBRCdARIsADe1pfTtjpg2JYpxy4SmYAHBQsOxcsnYFxGzTj4MmJcqB2QE2-dxIoKIsQoaAhS9EALw_wcB (last visited Sept. 22, 2026).\n'), 'memo.txt', 'a false-advertising memo citing a landing page with a Google Ads gclid (92 characters)');
  const bingP = '5d8b1f0c2e3a4b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c' + Buffer.from('&imts=1707862400&iguid=1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d&insid=5208').toString('base64').replace(/=+$/, '');
  passes(utf8('Search result: https://www.bing.com/ck/a?!&&p=' + bingP + '&ptn=3&ver=2&hsh=3&fclid=1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d&u=a1aHR0cHM6Ly93d3cuZXhhbXBsZS5jb20v&ntb=1\n'), 'memo.txt', 'a memo with a Bing result link (158-character value)');
  refuses(utf8(`The client forwarded the release: ${safe(mailflow('{"V":"0.0.0000","P":"Jane Roe QQ123456C","AN":"Mail","WT":2}'))}\n`), 'memo.txt', 'CONTROL: a Safe Links-shaped record whose value is a name and an NI number', /encoded content/);
  // Round 6 (INT-4): printed, the link wraps, and a row can start at the record and end inside
  // it. The rule before this round knew only the whole record and held 108 of these 162 memos; a one-page
  // printout was told it had no readable text. Every width 50–130, both records.
  const rowsAt = (s, w) => s.match(new RegExp(`.{1,${w}}`, 'g'));
  const memoOf = (rows) => utf8(['MEMORANDUM', 'RE: SEC enforcement sweep', 'The client forwarded the release:', ...rows, 'We should review it before the call.'].join('\n') + '\n');
  const OLD = mailflow('{"V":"0.0.0000","P":"Win32","AN":"Mail","WT":2}');
  const wrappedHeld = [];
  for (const m of [NEW, OLD]) for (let w = 50; w <= 130; w++) if (refused(route(memoOf(rowsAt(safe(m), w)), 'memo.txt'))) wrappedHeld.push(`${m === NEW ? 'current' : 'older'} record at ${w}`);
  check(wrappedHeld.length === 0, `a memo carrying a Safe Link printed across rows passes at every width 50–130, both records (${wrappedHeld.length} of 162 held)`, wrappedHeld.slice(0, 8).join(', '));
  // CONTROL: the exemption is Microsoft's own keys and values, cut or whole. A record carrying a
  // name in any of its values, or an extra key, is refused at every width; the rule before let 8 to 22
  // of each 81 through once the rows were cut, and the rows are joined now to see the whole value.
  const NAMED = [
    ['P is a name and an NI number', mailflow('{"V":"0.0.0000","P":"Jane Roe QQ123456C","AN":"Mail","WT":2}')],
    ['AN is a name', mailflow('{"EmptyMapi":true,"V":"0.0.0000","P":"Win32","AN":"Jane Roe","WT":2}')],
    ['V is a name and a DOB', mailflow('{"V":"Jane Roe 01/02/1980","P":"Win32","AN":"Mail","WT":2}')],
    ['an extra key carries a name', mailflow('{"EmptyMapi":true,"V":"0.0.0000","P":"Win32","AN":"Mail","WT":2,"N":"Jane Roe"}')],
  ];
  for (const [what, m] of NAMED) {
    const through = [];
    for (let w = 50; w <= 130; w++) if (!refused(route(memoOf(rowsAt(safe(m), w)), 'memo.txt'))) through.push(w);
    check(through.length === 0, `CONTROL: a Safe Links-shaped record where ${what}, printed across rows, is refused at every width 50–130 (${81 - through.length} of 81)`, through.length ? `through at ${through.join(', ')}` : '');
  }
  // A row that ends inside an escape ("…%7" / "C…") put the next row a character out of step,
  // and the named record went through at 66 and 88. Those widths are pinned by name.
  const cutAt = [];
  for (let w = 50; w <= 130; w++) if (rowsAt(safe(NAMED[0][1]), w).slice(0, -1).some((r) => /%[0-9A-F]?$/.test(r))) cutAt.push(w);
  check(cutAt.length > 0 && cutAt.every((w) => refused(route(memoOf(rowsAt(safe(NAMED[0][1]), w)), 'memo.txt'))), `CONTROL: at the widths where a row ends inside an escape (${cutAt.join(', ')}), the named record is refused`);
  // CONTROL: joining a value across rows is what refuses a base64 name in an ordinary link that
  // the print cut into pieces too short to read. The rule before let 8 to 17 of each 101 through.
  for (const [what, v] of [['a name and an NI number', b64('Jane Roe QQ123456C')], ['the letter', b64(SECRET)]]) {
    const through = [];
    for (let w = 30; w <= 130; w++) if (!refused(route(memoOf(rowsAt(`Portal link: https://portal.example.com/matter/view?ref=${v}&lang=en`, w)), 'memo.txt'))) through.push(w);
    check(through.length === 0, `CONTROL: a portal link whose value is base64 of ${what}, printed across rows, is refused at every width 30–130`, through.length ? `through at ${through.join(', ')}` : '');
  }
  refuses(utf8('Portal link: https://portal.example/view?ref=' + b64(SECRET) + '\n'), 'links.txt', 'CONTROL: a link value over 88 characters that decodes to the letter', /encoded content/);
  refuses(utf8('Portal link: https://portal.example/view?blob=' + Buffer.from(BIN.subarray(0, 600)).toString('base64') + '\n'), 'links.txt', 'CONTROL: a link value past 512 characters is judged by its shape and refused', /encoded content/);
  const { deflateSync } = await import('node:zlib');
  const packed = deflateSync(Buffer.from('graph TD; A[Jane Roe, NI QQ123456C] --> B[Settlement 4471]; B --> C[Opposing counsel]; C --> D[Mediator]; D --> A;')).toString('base64');
  refuses(utf8('Diagram: https://diagram.example/view?data=' + packed + '\n'), 'memo.txt', 'CONTROL: a link query value that is a zlib-compressed document', /encoded content/);
  refuses(utf8('Diagram: https://mermaid.live/edit#pako:' + Buffer.from(BIN.subarray(0, 120)).toString('base64url') + '\n'), 'memo.txt', 'CONTROL: a long value in a link fragment ("#pako:…") is judged by its shape and refused', /encoded content/);
  // Round 7 (I-OVR-2): "Mailflow|" is three whole quanta, so a printed row often opens at the
  // record's own "{". With "|{" the shortest cut the rule knew, 21 of 1,296 real records were held
  // once the older link format ("data=04%7C01…%7C3000") or a lead on the link's first row was
  // printed; the sweep above, current format from column 0, held none. Both formats and both
  // starts, every width 50–130, and the named records at the same geometry as the CONTROL.
  const older = (m) => `https://eur02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.bailii.org%2Few%2Fcases%2FEWCA%2FCiv%2F2026%2F101.html&data=04%7C01%7Cjsmith%40firm.example%7C4f1c2d3e5a6b7c8d9e0f1a2b3c4d5e6f%7C72f988bf86f141af91ab2d7cd011db47%7C0%7C0%7C637624123456789012%7CUnknown%7C${m}%7C3000&sdata=q2Xf8nV0wYk3sT9bLr4cJm7pZ1eHd6uGa5iKo0NyQwE%3D&reserved=0`;
  const printed = (fmt, lead, m, w) => memoOf(rowsAt(`${lead}${fmt(m)}${lead ? '>' : ''}`, w));
  const geometries = [];
  for (const fmt of [safe, older]) for (const lead of ['', 'Please see the SEC release<']) for (let w = 50; w <= 130; w++) geometries.push([fmt, lead, w]);
  const realHeld = [];
  for (const m of [NEW, OLD]) for (const [fmt, lead, w] of geometries) if (refused(route(printed(fmt, lead, m, w), 'memo.txt'))) realHeld.push(`${fmt === safe ? 'current' : 'older'} link, ${lead ? 'lead' : 'column 0'}, ${m === NEW ? 'current' : 'older'} record at ${w}`);
  check(realHeld.length === 0, `a Safe Link printed across rows passes in both link formats, from column 0 and after a lead, both records, every width 50–130 (${realHeld.length} of ${geometries.length * 2} held)`, realHeld.slice(0, 6).join('; '));
  const namedThrough = [];
  for (const [what, m] of NAMED) for (const [fmt, lead, w] of geometries) if (!refused(route(printed(fmt, lead, m, w), 'memo.txt'))) namedThrough.push(`${what}: ${fmt === safe ? 'current' : 'older'} link, ${lead ? 'lead' : 'column 0'}, ${w}`);
  check(namedThrough.length === 0, `CONTROL: at the same ${geometries.length} geometries each, a Safe Links-shaped record carrying a name or an extra key is refused (${NAMED.length * geometries.length - namedThrough.length} of ${NAMED.length * geometries.length})`, namedThrough.slice(0, 6).join('; '));
  // Round 7 (I-OVR-6): a path token in a link with a scheme is judged by what it decodes to, up to
  // 512 characters, as a query value is. A HubSpot tracked link, on one line as Outlook's Save As →
  // Text writes it, was refused by its shape as "an email attachment".
  const hubspot = 'https://d15K2Z04.na1.hubspotlinks.com/Ctc/L1+113/d15K2Z04/VVZsLb8Qpf_1W8Ncp0h1NWZ6KW5bgZKF55Lkq3N7YcfLm3lScJW6N1vHY6lZ3kbW3R5xsp8LZxxwW6vrzb74lqy4VW5HxBgJ93tTJ8W2bjn-k5XRBNBW7LdKgK7xG7bLW2k5bzJ6bf43MW3ktD5L8PJ7cXN5gnrxlwFTdvW2Zzl3S8DqWrGW3T5B3n7NV4RKW6WSP2c2rBY7_W7RVg4V6sWZg1W7mZxcS4h8X2MW8z8wlZ4w5NTzN3n2ZhtqtG1-W1tlxXN3Wn8xtW82_2xh4-SxYyW3QMLZj4k4zyKW8Pym5n2bSYQjf4_sPPv04';
  passes(utf8(`From:\tAcme Newsletter\r\nSent:\tTuesday, 22 September 2026 09:14\r\nTo:\tA Partner\r\nSubject:\tThis week\r\n\r\nRead the update<${hubspot}>.\r\n`), 'message.txt', 'Outlook Save As → Text of a newsletter carrying a HubSpot tracked link (a path token past 88 characters)');
  refuses(utf8('Portal: https://portal.example/c/' + Buffer.from(BIN.subarray(0, 600)).toString('base64') + '\n'), 'links.txt', 'CONTROL: a path value past 512 characters is judged by its shape and refused', /encoded content/);
  refuses(utf8('Diagram: https://diagram.example/v/' + packed + '\n'), 'memo.txt', 'CONTROL: a path value that is a zlib-compressed document is refused', /encoded content/);
  refuses(utf8('Portal: https://portal.example/c/' + b64(SECRET) + '\n'), 'links.txt', 'CONTROL: a path value over 88 characters that decodes to the letter is refused', /encoded content/);
  // Round 7 (I-OVR-5): LinkedIn's otpToken is base64 of a hex id and ",1,1"; a "?ref=" id is
  // base64 of a UUID. Read as text the hex digits are letters and numbers, and 1,992 of 2,000
  // otpToken links were held. Judged as the hex they spell, a name in hex is still refused.
  const otp = (hex) => Buffer.from(hex + ',1,1').toString('base64').replace(/=/g, '%3D');
  passes(utf8(`Reply<https://www.linkedin.com/comm/messaging/?trk=eml-reply&otpToken=${otp('150119e0112dcccfb32404ed461ae4b58acbd8429ba88c6478ca700f6445b58bff2d3e491ca95e9e64ff2e7bf0a24042a166ce84fad820826')}>\n`), 'message.txt', 'a LinkedIn InMail link carrying an otpToken (base64 of a hex id and ",1,1")');
  passes(utf8(`Open the document<https://portal.example/doc?ref=${b64('7d3f9a2c-4b1e-4c8d-a0f2-9e6b5c3d1a7f')}>\n`), 'message.txt', 'a link whose "?ref=" is base64 of a UUID');
  refuses(utf8(`Open<https://portal.example/doc?ref=${b64(Buffer.from('Jane Roe QQ123456C').toString('hex'))}>\n`), 'message.txt', 'CONTROL: base64 of the hex of a name and an NI number', /encoded content/);
  refuses(utf8(`Open<https://portal.example/doc?ref=${b64('0' + Buffer.from('Jane Roe QQ123456C').toString('hex'))}>\n`), 'message.txt', 'CONTROL: the same with one stray hex digit in front, read out of step', /encoded content/);
  refuses(utf8(`Open<https://portal.example/doc?ref=${b64('7d3f9a2c-4b1e-4c8d-a0f2-9e6b5c3d1a7f,Jane Roe')}>\n`), 'message.txt', 'CONTROL: base64 of a UUID with a name after it', /encoded content/);
}
// Round 7 (I-OVR-1): a mailer's unsubscribe or reset link carries the recipient's address in
// base64 as one segment of its PATH. Read with the segments before it, the value decoded out of
// step and passed 500 of 500 draws; the same value after "?u=" was held 500 of 500. A padded
// value before a "/" held no token at all. Each segment is read from its own start now, on one
// line and printed across rows.
{
  const rowsAt = (s, w) => s.match(new RegExp(`.{1,${w}}`, 'g')).join('\n');
  const LEAKS = [
    ['an unsubscribe link carrying the recipient address in its path', `https://news.lawfirm.example/unsubscribe/${b64('jane.roe@clientco.com')}`],
    ['a reset link whose padded path segment is the address', `https://portal.example.com/reset/${b64('jane.roe@client.com')}/7f3a9c21`],
    ['a portal link whose path segment is a name, matter and DOB', `https://clientportal.example.com/docs/${b64('client=Jane Roe;matter=4471;dob=01/02/1980')}`],
  ];
  check(/==$/.test(b64('jane.roe@client.com')), 'setup: the reset link\'s address is padded "=="');
  for (const [what, link] of LEAKS) {
    refuses(utf8(`To stop receiving these, visit ${link} .\n`), 'notice.txt', what, /encoded content/);
    const through = [];
    for (let w = 30; w <= 130; w++) if (!contentHold(`To stop receiving these, visit\n${rowsAt(link, w)}\nThank you.`)) through.push(w);
    check(through.length === 0, `${what}, printed across rows, is refused at every width 30–130`, through.length ? `through at ${through.join(', ')}` : '');
  }
  // CONTROL: links whose path segments are ids, hashes and slugs, which decode to bytes.
  const IDS = [
    ['a Google Drive file link', 'https://drive.google.com/file/d/1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwX/view?usp=sharing'],
    ['a SharePoint personal sharing link', 'https://firm-my.sharepoint.com/:w:/g/personal/jroe_firm_com/EQx7Tn3kLp9Rv2Wm5Yz8Ab4Cd6Ef0Gh1Ij2Kl3Mn4Op5Qr?e=a1B2c3'],
    ['a Dropbox link', 'https://www.dropbox.com/scl/fi/k3j9x2m7q1w8e5r4t6y0u/Exhibit-A.pdf?rlkey=a8s7d6f5g4h3j2k1l0z9x8c7v&dl=0'],
    ['a GitHub commit', 'https://github.com/acme/app/commit/9f3e2d1c0b4a5968778695a4b3c2d1e0f9a8b7c6'],
    ['a Loom share', 'https://www.loom.com/share/4f1c2d3e5a6b7c8d9e0f1a2b3c4d5e6f'],
    ['a Figma file', 'https://www.figma.com/file/Xy7Qw3Er9Ty1Ui5Op2As8D/Settlement-Timeline?node-id=0%3A1'],
    ['a CDN asset under a content hash', `https://cdn.example.net/assets/${Buffer.from(BIN.subarray(40, 88)).toString('base64url')}/image.png`],
  ];
  for (const [what, link] of IDS) {
    passes(utf8(`See ${link} for details.\n`), 'memo.txt', `CONTROL: ${what}`);
    const held = [];
    for (let w = 30; w <= 130; w++) if (contentHold(`See\n${rowsAt(link, w)}\nfor details.`)) held.push(w);
    check(held.length === 0, `CONTROL: ${what}, printed across rows, passes at every width 30–130`, held.length ? `held at ${held.join(', ')}` : '');
  }
}
// Owner ruling 17 (I3-WRAP): a mail gateway rewrites every link in the mail it lets through and
// carries the original inside its own. The same unsubscribe or reset link, rewritten by Safe
// Links, Proofpoint v2 or Barracuda, passed 300 of 300 draws on one line, and printed across rows
// it passed at most widths. Each gateway, each address, on one line and at every width 30–130,
// with the next row's prose on its own row and glued to the link's last row. The CONTROL is
// detect.ts with this round's reading taken out (`inner`, the gateway reading, Proofpoint v3's
// "__" ends), which lets the one-line case through wherever the gateway re-escapes the value, so
// a green run shows these are the shapes that got through. Mimecast carries no original: its
// link is an opaque code only Mimecast's server resolves, so the address can only be in the
// original printed beside it ("text<link>"), which the unwrapped rules already read; its CONTROL
// shows that, and that the Mimecast link alone passes.
const DETECT_TS = join(here, '..', 'src', 'lib', 'extract', 'detect.ts');
const editDetect = (swaps) => swaps.reduce((c, [a, b]) => {
  if (!c.includes(a)) throw new Error(`intake-refusal: detect.ts no longer contains ${JSON.stringify(a)} — update this CONTROL's swap`);
  return c.replace(a, () => b);
}, readFileSync(DETECT_TS, 'utf8'));
const detectVariant = async (name, swaps) => {
  const out = join(dir, name + '.mjs');
  await build({ stdin: { contents: editDetect(swaps), resolveDir: dirname(DETECT_TS), loader: 'ts', sourcefile: 'detect.ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(url(out));
};
const INNER_OFF = [String.raw`const inner = /(?::|%\.\.)\/\/[^\s?&#=]*$/.test((m.index! < firstEnd ? headBefore : '') + before);`, 'const inner = false;'];
const WRAP_OFF = [
  INNER_OFF,
  ['const gate = gatewayHold(text);', 'const gate = 0;'],
  [String.raw`|={1,6}(?=\/|__))/g;`, String.raw`|={1,6}(?=\/))/g;`],
  [".replace(/__;/g, '!!;')", ''],
];
const pctAll = (s) => [...Buffer.from(s)].map((x) => '%' + x.toString(16).toUpperCase().padStart(2, '0')).join('');
const SAFE_RECORD = Buffer.from('Mailflow|{"EmptyMapi":true,"V":"0.0.0000","P":"Win32","AN":"Mail","WT":2}').toString('base64').replace(/=/g, '%3D');
// [name, rewrite, how many of the three addresses pass on one line without this round's reading]
const GATEWAYS = [
  ['Microsoft Safe Links', (u) => `https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(u)}&data=05%7C02%7Cjsmith%40firm.example%7C4f1c2d3e5a6b7c8d9e0f1a2b3c4d5e6f%7C72f988bf86f141af91ab2d7cd011db47%7C1%7C0%7C638624123456789012%7CUnknown%7C${SAFE_RECORD}%7C0%7C%7C%7C&sdata=q2Xf8nV0wYk3sT9bLr4cJm7pZ1eHd6uGa5iKo0NyQwE%3D&reserved=0`, 3],
  ['Proofpoint v2', (u) => `https://urldefense.proofpoint.com/v2/url?u=${encodeURIComponent(u).replace(/%/g, '-').replace(/\//g, '_')}&d=DwMFaQ&c=euGZstcaTDllvimEN8b7jXrwqOf-v5A_CdpgnVfiiMM&r=Xw3Kq9pT7bLr4cJm7pZ1eHd6uGa5iKo0NyQwEabc&m=q2Xf8nV0wYk3sT9bLr4cJm7pZ1eHd6uGa5iKo0N&s=ncHpFc1K8i3JxOvbnD4ZAcEU1MNnLnx4WqlpYAoLjgw&e=`, 3],
  // v3 writes the original as it stands, so only the padded address before its closing "__" got through
  ['Proofpoint v3', (u) => `https://urldefense.com/v3/__${u}__;!!BhdT!ncHpFc1K8i3JxOvbnD4ZAcEU1MNnLnx4WqlpYAoLjgwoqFSUCtWzYiFSw3xlrVmNTfqL8lB0bP8a8A$`, 1],
  ['Barracuda', (u) => `https://linkprotect.cudasvc.com/url?a=${encodeURIComponent(u).replace(/%[0-9A-F]{2}/g, (x) => x.toLowerCase())}&c=E,1,4f1C2d3E5a6B7c8D9e0F1a2B3c4D5e6F&typo=1`, 3],
  ['a gateway writing the whole link escaped after "u=" (FireEye)', (u) => `https://protect2.fireeye.com/v1/url?k=4f1c2d3e-5a6b7c8d&q=1&e=9e0f1a2b&u=${encodeURIComponent(u)}`, 3],
  ['Mimecast, printed beside the original', (u) => `${u}<https://protect-us.mimecast.com/s/Xy7Qw3Er9Ty1Ui5Op2As?domain=${new URL(u).host}>`, 0],
];
const WRAPPED = [
  ['the address base64 in the path', `https://news.lawfirm.example/unsubscribe/${b64('jane.roe@clientco.com')}`],
  ['the address base64 in the path, padded', `https://portal.example.com/reset/${b64('jane.roe@client.com')}`],
  ['the address percent-escaped in the query', `https://news.lawfirm.example/unsubscribe?e=${pctAll('jane.roe@clientco.com')}`],
];
const wrapOff = await detectVariant('detect-wrap-off', WRAP_OFF);
const innerOff = await detectVariant('detect-inner-off', [INNER_OFF]);
{
  const rowsAt = (s, w) => s.match(new RegExp(`.{1,${w}}`, 'g')).join('\n');
  const printed = (link) => { const t = []; for (let w = 30; w <= 130; w++) t.push([w, `To stop receiving these, visit\n${rowsAt(link, w)}\nThank you.`], [w, `To stop receiving these, visit\n${rowsAt(link, w)} Thank you.`]); return t; };
  for (const [gw, rewrite, offPass] of GATEWAYS) {
    let through = 0;
    for (const [what, u] of WRAPPED) {
      const link = rewrite(u);
      // a percent-escaped address a gateway leaves as written (v3, the original beside Mimecast's
      // link) is held by the percent rule, whose reason names the escapes
      const r = refuses(utf8(`To stop receiving these, visit ${link} .\n`), 'notice.txt', `${gw}: ${what}`, /encoded content inside a link|percent-encoded content/);
      check(!/attachment/.test(r.reason || ''), `${gw}: ${what} — the reason does not send the lawyer to an attachment`, r.reason);
      const missed = printed(link).filter(([, t]) => !contentHold(t)).map(([w]) => w);
      check(missed.length === 0, `${gw}: ${what}, printed across rows, is held at every width 30–130, prose on the next row or on the link's last row`, missed.length ? `through at ${[...new Set(missed)].join(', ')}` : '');
      if (!wrapOff.contentHold(`To stop receiving these, visit ${link} .`)) through++;
    }
    check(through === offPass, `CONTROL: ${gw} — without this round's reading, ${offPass} of the 3 addresses pass on one line${offPass ? '' : ' (the original beside the link is read as an unwrapped link)'}`, `${through} of 3 passed`);
  }
  // CONTROL: ordinary links a gateway rewrote pass on one line, and across rows the reading adds no
  // hold the rules before it did not already make. A Zoom passcode printed across rows is held at
  // some widths whether or not a gateway wrapped it (a row's piece of it decodes to base64 text):
  // that is stated, not closed here.
  const ORDINARY = [
    ['an SEC release', 'https://www.sec.gov/newsroom/press-releases/2026-101'],
    ['a EUR-Lex CELEX link', 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679'],
    ['a Russian Wikipedia link', `https://ru.wikipedia.org/wiki/${encodeURIComponent('Конституция_Российской_Федерации')}`],
    ['a Google Drive file link', 'https://drive.google.com/file/d/1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwX/view?usp=sharing'],
    ['a pre-2022 Zoom invitation', 'https://us02web.zoom.us/j/84512345678?pwd=SXFxYk1QM2JnS3pGWEJ3K1ZGdUtKZz09'],
  ];
  for (const [gw, rewrite] of GATEWAYS) for (const [what, u] of ORDINARY) {
    const link = rewrite(u);
    passes(utf8(`Please see ${link} and call me.\n`), 'message.txt', `CONTROL: ${gw} carrying ${what}`);
    const rows = printed(link), held = rows.filter(([, t]) => contentHold(t)), added = held.filter(([, t]) => !wrapOff.contentHold(t));
    check(added.length === 0, `CONTROL: ${gw} carrying ${what}, printed across rows: no hold the rules before this reading did not make (${held.length} of ${rows.length} held${held.length ? ', all of them before it too' : ''})`, added.length ? `new holds at ${[...new Set(added.map(([w]) => w))].join(', ')}` : '');
  }
  // A Safe Link printed past the page's margin loses each row's last characters, the "&" before
  // its "data=" record among them, and read on into that record the carried link held a memo at
  // 117, 120 and 125 columns. The rows as a 9-point Courier page keeps them (105 or 106 of each);
  // the CONTROL is the same geometry carrying a name in the record, held by the rules above.
  {
    const safe = GATEWAYS[0][1]('https://www.sec.gov/newsroom/press-releases/2026-101');
    const named = safe.replace(SAFE_RECORD, Buffer.from('Mailflow|{"V":"0.0.0000","P":"Jane Roe QQ123456C","AN":"Mail","WT":2}').toString('base64').replace(/=/g, '%3D'));
    const margin = (link, w, keep) => `MEMORANDUM\nThe client forwarded the release:\n${link.match(new RegExp(`.{1,${w}}`, 'g')).map((r) => r.slice(0, keep)).join('\n')}\nWe should review it before the call.`;
    const held = [], through = [];
    for (let w = 107; w <= 130; w++) for (const keep of [105, 106]) {
      if (contentHold(margin(safe, w, keep))) held.push(`${w}/${keep}`);
      if (!contentHold(margin(named, w, keep))) through.push(`${w}/${keep}`);
    }
    check(held.length === 0, 'a Safe Link to an SEC release printed past the margin (rows of 107–130 cut to 105 or 106) passes', held.join(', '));
    check(through.length === 0, 'CONTROL: the same printout whose record carries a name is held at every one of those widths', through.join(', '));
  }
  // `inner` on its own: a redirect that carries the link unescaped ("?q=https://…"), as Google's
  // and many trackers' do. The "?" before the path is the outer link's; read as a query value the
  // address passed. An archived page's link is the same shape and is read the same way: the one
  // real text in the repo carrying a link inside a link (a CAP opinion's web.archive.org cite) passes.
  const google = `See https://www.google.com/url?q=https://news.lawfirm.example/unsubscribe/${b64('jane.roe@clientco.com')}&sa=D&source=editors .\n`;
  refuses(utf8(google), 'notice.txt', 'a redirect carrying the unsubscribe link unescaped after "?q="', /encoded content inside a link/);
  check(!innerOff.contentHold(google), 'CONTROL: with `inner` taken out, the same redirect passes');
  // I-UNREP-1: the same redirects printed across rows. The carried link's path is read on from the
  // word's last "://" to its first "?", "&", "=" or "#", and `inner` on the word joined across
  // rows; read row by row, a Gmail-style "q=" wrap passed at 40 of 101 widths and a "url=" redirect
  // at 56.
  const joinOff = await detectVariant('detect-inner-path-row-by-row', [
    [String.raw`linkPath = inLinkWord && (scheme > 0 && /[?&=]/.test(linkWord.slice(0, scheme)) ? !/[?&=]|#(?!!?\/)/.test(linkWord.slice(scheme)) : (carried ? linkPath : /:\/\/|^www\./.test(last)) && !/\?|#(?!!?\/)/.test(last));`, String.raw`linkPath = inLinkWord && (carried ? linkPath : /:\/\/|^www\./.test(last)) && !/\?|#(?!!?\/)/.test(last);`],
    [String.raw`.test((m.index! < firstEnd ? headBefore : '') + before);`, '.test(before);'],
  ]);
  const unsubPath = `https://news.lawfirm.example/unsubscribe/${Buffer.from('jane.roe@clientco.com').toString('base64url')}`;
  for (const [what, L] of [['a Gmail-style "q=" wrap', `https://www.google.com/url?q=${unsubPath}&source=gmail&ust=1717400000000000&usg=AOvVaw1a2B3c4D5e6F7g8H9i0J`], ['a "url=" redirect', `https://www.linkedin.com/redir/redirect?url=${unsubPath}&urlhash=aB3x&trk=public_profile`]]) {
    const notice = (w) => `From: News <news@example.com>\nSubject: Weekly briefing\n\nTo manage your subscription, visit\n${rowsAt(L, w)}\nThank you.`;
    const missedW = [], offMissed = [];
    for (let w = 30; w <= 130; w++) { if (!contentHold(notice(w))) missedW.push(w); if (!joinOff.contentHold(notice(w))) offMissed.push(w); }
    check(missedW.length === 0, `${what} carrying the unsubscribe link as written, the address base64 in its path, printed at 30–130: held at every width`, `passes at ${missedW.join(', ')}`);
    check(offMissed.length > 30, `CONTROL: read row by row, it passes at ${offMissed.length} of 101 widths`);
  }
  // the same redirects carrying an ordinary link, printed across rows: nothing held
  for (const L of [`https://www.google.com/url?q=https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm&source=gmail&ust=1717400000000000&usg=AOvVaw1a2B3c4D5e6F7g8H9i0J`, `https://www.linkedin.com/redir/redirect?url=https://www.courtlistener.com/opinion/4589123/smith-v-jones/&urlhash=aB3x&trk=public_profile`]) {
    const held = []; for (let w = 30; w <= 130; w++) if (contentHold(`Please see\n${rowsAt(L, w)}\nThank you.`)) held.push(w);
    check(held.length === 0, `CONTROL: ${L.slice(8, 30)}… carrying an ordinary link as written, printed at 30–130: none held`, `held at ${held.join(', ')}`);
  }
  passes(utf8('Manual, ch. 3 (2012), https://web.archive.org/web/20120410201053/https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/Downloads/bp102c03.pdf (last visited Sept. 22, 2026).\n'), 'opinion.txt', 'CONTROL: an archived page cited through web.archive.org');
  check(!contentHold('Unsubscribe<https://protect-us.mimecast.com/s/Xy7Qw3Er9Ty1Ui5Op2As?domain=news.lawfirm.example> .'), 'CONTROL: a Mimecast link on its own (an opaque code) passes');
}
// I3-REASON: a hold on a value inside a link names the link. "Save the attachment as its own
// file" sent the lawyer holding a printed newsletter looking for one.
{
  const tracker = `Read the alert<https://click.newsletter-mail.example/abcdefghij0123456789abcdefghij/${Buffer.from('https://portal.example/matter/Jane-Roe-4471').toString('base64url')}>\n`;
  const t = refuses(utf8(tracker), 'newsletter.txt', 'a tracked link whose path value is an encoded address', /encoded content inside a link/);
  check(!/attachment/.test(t.reason || '') && /Delete the link, or replace it with the words it shows/.test(t.reason || ''), 'its reason names the link and never an attachment', t.reason);
  const q = refuses(utf8(`Portal https://portal.example/view?ref=${b64('client=Jane Roe;matter=4471')}\n`), 'links.txt', 'a query value that decodes to a name', /encoded content inside a link/);
  check(!/attachment/.test(q.reason || ''), 'its reason never says attachment', q.reason);
  const block = refuses(utf8('Exhibit\n' + wrap(b64((SECRET + '\n').repeat(3))).replace(/\r/g, '') + '\n'), 'reply.txt', 'CONTROL: a pasted attachment keeps the attachment reason', /such as an email attachment/);
  check(!/inside a link/.test(block.reason || ''), 'CONTROL: and does not call it a link', block.reason);
}
// Round 7 (I-OVR-4): a German or Estonian IBAN, or a German EORI number, is two hex letters and
// digits. Read as hex, about one in 250 decoded to "text" and was refused as an attachment, and
// the verdict is fixed by the number: every document carrying that client's account was held.
{
  let seed = 20260923;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
  const iban = (cc, bban) => {
    const num = (bban + cc + '00').replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    let r = 0;
    for (const d of num) r = (r * 10 + Number(d)) % 97;
    return `${cc}${String(98 - r).padStart(2, '0')}${bban}`;
  };
  passes(utf8('Payment to account DE27377020617179497641 within 14 days.\n'), 'settlement.txt', 'a settlement clause carrying a German IBAN that read as hex decodes to "text"');
  const held = [];
  for (let i = 0; i < 2000; i++) for (const n of [iban('DE', digits(18)), iban('EE', digits(16)), 'DE' + digits(15)]) if (refused(route(utf8(`Pay to ${n} by 30 September.\n`), 'invoice.txt'))) held.push(n);
  check(held.length === 0, 'German and Estonian IBANs and German EORI numbers, 2,000 of each: none refused', held.slice(0, 4).join(', '));
  refuses(utf8(`Recovered string: DE${Buffer.from('Jane Roe QQ123456C').toString('hex')}\n`), 'forensic.txt', 'CONTROL: "DE" ahead of the hex of a name, which is not digits alone', /encoded content/);
  refuses(utf8(`Recovered string: ${Buffer.from('Jane Roe QQ123456C').toString('hex').toUpperCase()}\n`), 'forensic.txt', 'CONTROL: the hex of a name in capitals', /encoded content/);
}
// Round 7 (I-OVR-7): a wrapped block's line is its first encoded line. The run of alphabet lines
// includes the word lines above it (a signature, a table's labels), and the lawyer sent to
// "line 1" found "Kind regards".
{
  const sig = refuses(utf8(['Kind regards', 'Jane Partner', 'Firm LLP', ATTACH.replace(/\r/g, ''), 'End.'].join('\n') + '\n'), 'reply.txt', 'a signature above a pasted attachment', /encoded content/);
  check(/\(from line 4\)/.test(sig.reason || ''), 'the hold names line 4, where the block starts, not the signature above it', sig.reason);
  const bare = refuses(utf8(ATTACH.replace(/\r/g, '') + '\nEnd.\n'), 'reply.txt', 'CONTROL: the block with nothing above it', /encoded content/);
  check(/\(from line 1\)/.test(bare.reason || ''), 'CONTROL: that hold names line 1', bare.reason);
}
// A base64 name with one stray character after it: atob refuses a run one past a whole quantum,
// and the name went through undecoded.
refuses(utf8('Reference: ' + b64('Jane Roe QQ123456C') + 'x\n'), 'note.txt', 'a base64 name with one stray character after it', /encoded content/);
// Round 3 (OR-7): a hard-wrapped link or formula that breaks after "=".
passes(utf8('2 See Docket, available at https://ecf.example.uscourts.gov/doc1/view?id=\n123456789 (sealed).\n'), 'brief.txt', 'a footnote URL wrapped after "id="');
passes(utf8('The Adjusted Price for each Unit shall be computed as AP=\nBP x (CPI1 / CPI0), rounded to the nearest cent.\n'), 'schedule.txt', 'a pricing formula wrapped after "AP="');
// Round 3 (OR-2): Zoom's pre-2022 passcode is base64 of base64 of 16 random bytes.
passes(utf8('PLEASE TAKE NOTICE that the deposition will be taken remotely.\n\nJoin Zoom Meeting\nhttps://us02web.zoom.us/j/84512345678?pwd=SXFxYk1QM2JnS3pGWEJ3K1ZGdUtKZz09\nMeeting ID: 845 1234 5678\n'), 'notice.txt', 'a remote-deposition notice with a pre-2022 Zoom link');
// A brief that cut the passcode one character short ("…Z0", not "…Z09"): the inner string is
// 23 characters ending in one "=". Measured before the fix: that page was dropped as encoded.
passes(utf8('PLEASE TAKE NOTICE that the deposition of Jane Roe will be taken remotely.\nJoin Zoom Meeting: https://us02web.zoom.us/j/84512345678?pwd=SXFxYk1QM2JnS3pGWEJ3K1ZGdUtKZz0\nMeeting ID: 845 1234 5678\n'), 'notice.txt', 'a Zoom link whose passcode was cut one character short');
{
  // CONTROL: the same cut applied to a name encoded twice. The widened check recurses, and the
  // inner string still decodes to the name.
  const inner = b64('client=Jane Roe;matter=4471X');
  check(/[^=]==$/.test(inner), 'CONTROL setup: the inner string ends in "=="', inner);
  refuses(utf8('Portal link: https://portal.example/view?ref=' + b64(inner.slice(0, -1)).replace(/=+$/, '') + '\n'), 'links.txt', 'CONTROL: a name encoded twice, cut one character short like the Zoom link', /encoded content/);
}
// Round 3 (OR-4): public blockchain identifiers and unpadded digest lists.
passes(utf8('The ransom note demanded payment to 44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A (Monero).\n'), 'brief.txt', 'a Monero address inline (95 characters of base58)');
passes(utf8('ATTACHMENT A — DEFENDANT PROPERTY\n\n0x71C7656EC7ab88b098defB751B7401B5f6d8976F\n0x8589427373D6D84E98730D7795D8f6f8731FDA16\n0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b\n0x722122dF12D4e14e13Ac3b6895a86e84145b6967\n'), 'complaint.txt', 'four checksummed Ethereum addresses, one per line');
passes(utf8('ATTACHMENT B\n\n7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV1\n9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\nHN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH\n'), 'complaint.txt', 'three Solana addresses, one per line');
passes(utf8('Token metadata:\nQmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG\nQmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o\n'), 'complaint.txt', 'two IPFS content ids, one per line');
// Round 4 (OR-4): longer lists. Each 95-character Monero line is refused by the long-token rule
// without its base58 test; as a block, equal-width lines with no tail pass either way.
passes(utf8('ATTACHMENT A — DEFENDANT CRYPTOCURRENCY\n\n41XfH3KgWpWEAcYbNVgmKh7CRy7E4pyRCzmjEDqBmeM1ijgihkqjwJ9crmVQEdWA2PaFQoZwLBvoEbeqh2ZYXnwmWhsvJRJ\n49hTQwYoRNbnotdR2otcUjb4e4Xv9Pe72RRGZBzKErTYQr9a1UQENiZyVven7XGijFFYPt6j8bKDBNKu1JE96gcz8xfahEC\n48uQk1kUcrozCCrTznJuDQ1hbb8JiRNq9eUMMsbzvRYdxqPuJN3bvzdUpdLacdGzAnDkF8eD92KcW9BrkuU2HJk5X58gZBc\n'), 'complaint.txt', 'three Monero-shaped addresses, one per line (95 characters of base58 each)');
passes(utf8('ATTACHMENT B\n\n7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV1\n9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\nHN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH\n5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj\n'), 'complaint.txt', 'four Solana addresses, one per line');
// The block rule's own base58 test decides only when the last line is shorter, which is an
// encoder's tail: Solana addresses run 32 to 44 characters, and a Bitcoin address closes a list
// of Monero ones. Measured 2026-09-23: with that test removed, both of these are refused as an
// encoded block and every list above still passes, so these are the two that pin it.
passes(utf8('ATTACHMENT A — DEFENDANT CRYPTOCURRENCY\n\n41XfH3KgWpWEAcYbNVgmKh7CRy7E4pyRCzmjEDqBmeM1ijgihkqjwJ9crmVQEdWA2PaFQoZwLBvoEbeqh2ZYXnwmWhsvJRJ\n49hTQwYoRNbnotdR2otcUjb4e4Xv9Pe72RRGZBzKErTYQr9a1UQENiZyVven7XGijFFYPt6j8bKDBNKu1JE96gcz8xfahEC\n1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\n'), 'complaint.txt', 'two Monero addresses and a Bitcoin address, one per line (the last line shorter)');
passes(utf8('ATTACHMENT B\n\n7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV1\n9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\nHN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH\nW2EeyrMKEuUSeuZSwXJagsUZjynXUKjtXTD7GK2p3Ps\n'), 'complaint.txt', 'four Solana addresses, the last one 43 characters');
{
  const { createHash } = await import('node:crypto');
  const s384 = (s) => createHash('sha384').update(s).digest('base64');
  passes(utf8(`SCHEDULE 3 — DEPOSIT MATERIALS\n\nSHA-384 (base64) of each deposit archive:\n${s384('release-1.0.tar')}\n${s384('release-1.1.tar')}\n${s384('release-2.0.tar')}\n`), 'escrow.txt', 'three SHA-384 digests one per line (64 characters, no padding)');
  // CONTROL: the same 64-column shape with an encoder's short last line, and the no-tail
  // shape at sixteen lines, are one encoder's output.
  refuses(utf8('Body:\n\n' + wrapN(Buffer.from(BIN.subarray(0, 700)).toString('base64'), 64).replace(/\r/g, '') + '\n'), 'e.txt', 'CONTROL: a 64-column binary block with a short last line (a PEM body with no markers)', /encoded content/);
  refuses(utf8('Body:\n\n' + wrapN(Buffer.from(BIN.subarray(0, 48 * 16)).toString('base64'), 64).replace(/\r/g, '') + '\n'), 'e.txt', 'CONTROL: sixteen full 64-column lines with no tail (768 bytes)', /encoded content/);
}
// Round 3 (OR-9): glued PDF prose with digits and names — see the spaces-removed scan in law 5.
passes(utf8('In1979,GUSdevelopedasoftwareprogramcalledCHAMPIONPACKERforJoseLopez.CHAMPIONPACKERwaswritteninBASIC4\nOrderofCourtnumberedHC/ORC1595/2023inHC/OC233/2022andHC/SUM147/2023dated3April2023filed11April2023\n'), 'glued.txt', 'glued real paragraphs with digits, names and case numbers');
// Round 4 (INT-5): the identifiers the short-decode rule exists for. Each of these LEI- and
// Salesforce-shaped ids decodes, as base64, to 15 or 13 printable bytes the first pass read as
// text and refused; the last two decode to junk around a space ("…<, tw`"), which is not a
// phrase. A privilege log or a settlement schedule carries hundreds of them.
passes(utf8('SCHEDULE 4 — COUNTERPARTIES\nLEI T3VBR8TDO0BWIXA1VA03\nLEI 0DFLP1NQZVZOQEJ3K310\nLEI MWN7IP5U6VF7KVJILM50\n'), 'schedule.txt', 'LEI-shaped identifiers whose base64 decode is printable junk');
passes(utf8('PRIVILEGE LOG\n1. Account 001Hfix8PG1ufSbsdY — email to counsel, withheld.\n2. Account 001b62l2azwsIHR3YA — draft agreement, withheld.\n3. Account 001kR3kmctYgVWkjPm — note of call, withheld.\n'), 'privlog.txt', 'Salesforce record ids in a privilege log, two decoding to junk around a space');
// Round 5 (INT-EVADE-2): base32 and percent-encoding near-misses. Google Authenticator's own
// example secret is base32 of bytes that are not text; a Légifrance link escapes an apostrophe
// and an accented capital, as every browser writes them.
passes(utf8('Two-factor enrolment: secret JBSWY3DPEHPK3PXP, issued to the custodian on 3 March.\n'), 'forensic.txt', 'a base32 TOTP secret that decodes to bytes, not text');
passes(utf8('See https://www.legifrance.gouv.fr/juri/id/CETATEXT000046123456?q=Conseil%20d%27%C3%89tat and https://fr.wikipedia.org/wiki/Conseil_d%27%C3%89tat_(France).\n'), 'memo.txt', 'links with percent-escaped spaces, apostrophes and accented letters');
// Owner ruling (5): percent-escaped UTF-8. "%D0%98%D0%B2…" is a Cyrillic name no rule read; it
// is held outside a link. Inside one it is how every browser writes a non-Latin citation, and it
// passes, including a link printed across rows and one cited without a scheme.
{
  const enc = encodeURIComponent;
  const rowsAt = (s, w) => s.match(new RegExp(`.{1,${w}}`, 'g')).join('\n');
  const widths = Array.from({ length: 81 }, (_, i) => 30 + i);
  const HOLD = [
    ['a Cyrillic name percent-escaped outside a link', `Claimant: ${enc('Иван Петров')}, DOB 01/02/1980.`],
    ['a Cyrillic name percent-escaped and glued to its label', `Claimant:${enc('Иван_Петров')}; DOB 01/02/1980.`],
    ['a Chinese name percent-escaped outside a link', `Party: ${enc('王伟')} (the respondent).`],
    // CONTROL for the path reading below: ASCII letters escaped are held wherever they stand
    ['a name in ASCII escapes in a log\'s request path', 'GET /users/%4A%61%6E%65%20%52%6F%65 HTTP/1.1'],
  ];
  for (const [what, s] of HOLD) {
    // nothing is attached: "save the attachment" sent the lawyer looking for one
    refuses(utf8(s + '\n'), 'forensic.txt', what, /^This file contains percent-encoded content \(from line 1\): (?!.*attachment)/);
    const missed = widths.filter((w) => !contentHold(rowsAt(s, w)));
    check(missed.length === 0, `${what}, printed across rows at every width 30–110, is held`, missed.length ? `passed at ${missed.join(', ')}` : '');
  }
  const PASS = [
    ['a Russian Wikipedia link', `See https://ru.wikipedia.org/wiki/${enc('Конституция_Российской_Федерации')} (last visited Sept. 22, 2026).`],
    ['a Greek statute portal link', `Source: https://www.kodiko.gr/nomologia/${enc('Άρειος_Πάγος')}/2019`],
    ['a Chinese court portal search link', `https://wenshu.court.gov.cn/website/wenshu/181217BMTKHNT2W0/index.html?s21=${enc('合同纠纷')}`],
    ['an Arabic Wikipedia link', `https://ar.wikipedia.org/wiki/${enc('القانون_المدني')}`],
    ['a Russian Wikipedia link cited without a scheme', `Available at ru.wikipedia.org/wiki/${enc('Конституция_Российской_Федерации')}.`],
    ['a French link with two adjacent accents ("créé")', `https://www.legifrance.gouv.fr/recherche?q=${enc('créé')}`],
    ['an escaped en dash in a file name', 'Produced as Exhibit%20A%20%E2%80%93%20Supply%20Agreement.pdf on 3 March.'],
    // Round 7 (I-OVR-3): a path with no host. Logs are exhibits in breach and trade-secret
    // matters, and each of these was held as "an email attachment" once the rule was added.
    ['an Apache access-log line with a Cyrillic request path', '203.0.113.5 - - [22/Sep/2026:09:14:03 +0000] "GET /ru/%D0%BD%D0%BE%D0%B2%D0%BE%D1%81%D1%82%D0%B8/ HTTP/1.1" 200 5123'],
    ['an IIS W3C log line (cs-uri-stem) with a Chinese file name', '2026-09-22 09:14:03 W3SVC1 10.0.0.5 GET /files/%E5%90%88%E5%90%8C.pdf - 443 - 203.0.113.5 Mozilla/5.0 200 0 0 15'],
    ['a SharePoint audit export row with a Chinese file name', 'FileAccessed,jroe@client.example,Shared Documents/%E5%90%88%E5%90%8C%E8%8D%89%E6%A1%88.docx,2026-09-22T09:14:03Z'],
    ['a Squid proxy log line with a Greek path', '1695373443.123 203.0.113.5 TCP_MISS/200 5123 GET /el/%CE%B5%CE%B9%CE%B4%CE%AE%CF%83%CE%B5%CE%B9%CF%82 - DIRECT/198.51.100.7 text/html'],
  ];
  for (const [what, s] of PASS) {
    passes(utf8(s + '\n'), 'memo.txt', what);
    const held = widths.filter((w) => contentHold(rowsAt(s, w)));
    check(held.length === 0, `${what}, printed across rows at every width 30–110, passes`, held.length ? `held at ${held.join(', ')}` : '');
  }
}
// I3-SLASH: the path reading above counted any "/" earlier in the joined word, so a date or
// "and/or" ending the row above, a CSV row's first field or a court reference let an escaped
// Cyrillic or Chinese name through. Only the "/" that opens the run's own segment counts now. The
// CONTROL is the rule as it was, which passes each of them.
{
  const rowsAt = (s, w) => s.match(new RegExp(`.{1,${w}}`, 'g')).join('\n');
  const IVANOV = '%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2', WANG = '%E7%8E%8B%E5%B0%8F%E6%98%8E';
  const anySlash = await detectVariant('detect-any-slash', [['|| pathBefore(text, index);', "|| text.slice(b, index).includes('/');"]]);
  const SLASH = [
    ['an escaped name opening the row under a date', `The release was signed on 22/09/2026\n${IVANOV} (claimant) and returned.`],
    ['an escaped name opening the row under "and/or"', `The claimant and/or\n${IVANOV} shall indemnify.`],
    ['an escaped Chinese name in the cell under a date', `Date\nApplicant\n22/09/2026\n${WANG}`],
    ['an escaped name in a CSV row whose first field is a date', `Date,User,Action\n9/22/2026,${IVANOV},FileAccessed`],
    ['an escaped name after a court reference and a comma', `Ref:HC/2026/101,${IVANOV} signed.`],
  ];
  for (const [what, s] of SLASH) {
    refuses(utf8(s + '\n'), 'forensic.txt', what, /^This file contains percent-encoded content \(from line \d+\): (?!.*attachment)/);
    const missed = Array.from({ length: 81 }, (_, i) => 30 + i).filter((w) => !contentHold(rowsAt(s, w)));
    check(missed.length === 0, `${what}, printed across rows at every width 30–110, is held`, missed.length ? `passed at ${missed.join(', ')}` : '');
    check(!anySlash.contentHold(s), `CONTROL: reading any "/" in the joined word, ${what} passes`);
  }
}
// I3-PCTGRID: whole-number percentages run together, as a PDF text layer glues a pricing grid's,
// a vesting schedule's or a cap table's cells, read as escaped letters ("%50%75" is "Pu"): 33,600
// of 150,000 glued "a%b%c%" rows were held, and told to rewrite the grid as letters. The CONTROL is
// the rule without the grid reading; letters escaped after a letter or a boundary still hold.
{
  const noGrid = await detectVariant('detect-no-grid', [['    if (percentGrid(text, m.index!, m.index! + m[0].length)) continue;\n', '']]);
  const GRID = [
    ['a pricing grid glued by the text layer', 'Pricing Level Consolidated Leverage Ratio Applicable Rate\nLevel I <1.00:1.00 25%50%75%'],
    ['a vesting schedule glued', 'Vesting: 25%33%42% on each anniversary'],
    ['an ownership table glued', 'Holder A 12%30%45% (fully diluted)'],
    ['a fee grid ending at 100%', 'Tiers 25%50%75%100% of the base fee'],
  ];
  for (const [what, s] of GRID) {
    passes(utf8(s + '\n'), 'exhibit.txt', what);
    check(!!noGrid.contentHold(s), `CONTROL: without the grid reading, ${what} is held`);
  }
  let held = 0, n = 0;
  for (let a = 1; a <= 100; a++) for (let b = 1; b <= 100; b++) for (const c of [5, 50, 100]) { n++; if (contentHold(`Rates ${a}%${b}%${c}%`)) held++; }
  check(held === 0, `glued "a%b%c%" percentages, ${n.toLocaleString('en')} rows: none held`, `${held} held`);
  refuses(utf8('Client: %4A%61%6E%65%20%52%6F%65\n'), 'note.txt', 'CONTROL: a name in ASCII escapes after a space is still held', /percent-encoded/);
  refuses(utf8('Account 4471%50%65%74%65 signed\n'), 'note.txt', 'CONTROL: a name in decimal-digit escapes after a number, with no "%" closing it, is still held', /percent-encoded/);
  refuses(utf8('Ref 12%4A%61%6E%65%\n'), 'note.txt', 'CONTROL: a name escaped after a number with a letter escape is still held', /percent-encoded/);
}
// Round 7, second pass: what the attackers found in the first pass's reading. Each fix has a
// CONTROL that is detect.ts with that one fix taken out, run on the same text.
const CUT = (s, w) => s.match(new RegExp(`.{1,${w}}`, 'g')).join('\n');
const wordRows = (text, w) => text.split('\n').map((para) => {
  const out = []; let line = '';
  for (let wd of para.split(' ')) {
    if (line && line.length + 1 + wd.length <= w) { line += ' ' + wd; continue; }
    if (line) { out.push(line); line = ''; }
    while (wd.length > w) { out.push(wd.slice(0, w)); wd = wd.slice(w); }
    line = wd;
  }
  out.push(line);
  return out.join('\n');
}).join('\n');
let seed2 = 20260924;
const rnd2 = () => (seed2 = (seed2 * 1103515245 + 12345) % 2147483648) / 2147483648;
const bytes2 = (n) => Buffer.from(Array.from({ length: n }, () => Math.floor(rnd2() * 256)));
const uuid2 = () => { const h = bytes2(16).toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
// I-OVR-7: gatewayHold skipped a row's first word as "read by the join from the row above", but the
// join stops at GATEWAY_MAX, so in an export with no space in any row (a message trace: timestamp,
// sender, recipient, link) every row past the first 8,192 characters was never read. And the
// generic gateway shape's query ran on across the rows' own links, so a FireEye link near a join's
// end fell past the read.
{
  const row = (i) => `2026-09-22T09:${String(i % 60).padStart(2, '0')}:03Z,noreply@pacer.example,jsmith@firm.example,https://ecf.nysd.uscourts.gov/doc1/127${10000000 + i}?caseid=5${i}&de_seq_num=${i}`;
  const trace = (link, at) => ['ts,from,to,url', ...Array.from({ length: at - 1 }, (_, i) => row(i + 1)), `2026-09-22T10:00:00Z,news@lawfirm.example,jsmith@firm.example,${link}`, ...Array.from({ length: 5 }, (_, i) => row(1000 + i))].join('\n') + '\n';
  const rowSkip = await detectVariant('detect-row-skip', [[' && r <= joinedThrough) continue;', ') continue;']]);
  const crossOn = await detectVariant('detect-cross-on', [[String.raw`(?:(?:(?!:\/\/)[^\s#])*?&)?`, String.raw`(?:[^\s#]*?&)?`]]);
  let through = 0;
  for (const [gw, rewrite] of GATEWAYS.filter(([g]) => /Proofpoint v2|Barracuda|FireEye/.test(g))) for (const [what, u] of [WRAPPED[0], WRAPPED[2]]) for (const at of [121, 401]) {
    const t = trace(rewrite(u), at);
    const r = refuses(utf8(t), 'trace.csv', `a no-space message-trace export, ${gw} carrying ${what} on row ${at + 1}`, /encoded content inside a link|percent-encoded content/);
    check(new RegExp(`\\(from line ${at + 1}\\)`).test(r.reason || ''), `  its hold names row ${at + 1}, the link's own row`, r.reason);
    if (!rowSkip.contentHold(t)) through++;
  }
  check(through === 8, 'CONTROL: skipping every row the row above ran into, 8 of those 12 pass (Proofpoint v2 both ways, Barracuda and FireEye with the escaped query)', `${through} of 12 passed`);
  // the link's row is at + 1: rows 63 and 124, the two rows that passed with the query running on
  for (const at of [62, 123]) {
    const t = trace(GATEWAYS[4][1](WRAPPED[2][1]), at);
    refuses(utf8(t), 'trace.csv', `a no-space message-trace export, FireEye carrying the escaped query on row ${at + 1}, where a join's read ends`, /encoded content inside a link/);
    check(!crossOn.contentHold(t), `CONTROL: with the generic gateway's query running on across other links, the same export passes (row ${at + 1})`);
  }
  // CONTROL: every row read from its own start adds no hold on an ordinary export
  for (const [gw, rewrite] of GATEWAYS.slice(0, 5)) {
    const t = Array.from({ length: 300 }, (_, i) => `2026-09-22T09:14:03Z,noreply@sec.example,jsmith@firm.example,${rewrite(`https://www.sec.gov/newsroom/press-releases/2024-${i}`)}`).join('\n') + '\n';
    passes(utf8(t), 'trace.csv', `CONTROL: a 300-row no-space export with a ${gw} link to an SEC release on every row`);
  }
}
// I-OVR-4: a gateway hold named the row where the joined word starts. A link opening its own line
// under prose was joined to the prose line's last word ("…click"), and the lawyer was sent to the
// prose line, in a .docx to the paragraph above the link.
const LINE_OFF = await detectVariant('detect-line-off', [['return starts.filter(([s]) => s <= g.index!).pop()![1] + 1;', 'return r + 1;']]);
const underProse = (link) => `Dear Counsel,\n\nThe client forwarded the notice. To stop receiving these emails, click\n${link}\n\nRegards,\n`;
{
  for (const [gw, u] of [[GATEWAYS[1], WRAPPED[0][1]], [GATEWAYS[0], WRAPPED[2][1]]]) {
    const t = underProse(gw[1](u));
    const r = refuses(utf8(t), 'notice.txt', `${gw[0]}: a link opening its own line under a prose line`, /encoded content inside a link/);
    check(/\(from line 4\)/.test(r.reason || ''), '  the hold names line 4, the link\'s line', r.reason);
    check(/\(from line 3\)/.test(LINE_OFF.contentHold(t)?.reason || ''), 'CONTROL: named by where the joined word starts, the hold says line 3, the prose');
  }
}
// Found while measuring I-OVR-4 and I-OVR-7: gatewayInner looked for the vendor's host anywhere in
// the 8,192-character slice, and in a no-space export the slice runs on into the next rows' links. A
// Google redirect carrying an escaped address, with any vendor's ordinary link on the next row, was
// read as that vendor's link and its value taken instead: the address went through for all three
// vendors, and a vendor link under Google rows was named at the first Google row.
{
  const hostAnywhere = await detectVariant('detect-host-anywhere', [[String.raw`new RegExp(String.raw` + '`' + String.raw`^https?:\/\/(?:[\w-]+\.)*` + '`' + ' + re.source', 'new RegExp(re.source']]);
  const google = (u) => `https://www.google.com/url?q=${encodeURIComponent(u)}&sa=D`;
  const row = (l) => `2026-09-22T09:14:03Z,noreply@x.example,jsmith@firm.example,${l}`;
  const SEC = 'https://www.sec.gov/newsroom/press-releases/2024-107';
  // each vendor's host is checked on its own, Proofpoint v1 and v3 among them
  const v1 = ['Proofpoint v1', (u) => `https://urldefense.proofpoint.com/v1/url?u=${encodeURIComponent(u)}&k=oIvRg1%2BdGAgOoM1BIlLLqw%3D%3D%0A&r=Xw3Kq9pT7bLr4cJm7pZ1eHd6uGa5iKo0NyQwEabc&m=q2Xf8nV0wYk3sT9bLr4cJm7pZ1eHd6uGa5iKo0N&s=ncHpFc1K8i3JxOvbnD4ZAcEU1MNnLnx4WqlpYAoLjgw`];
  for (const [gw, rewrite] of [...GATEWAYS.filter(([g]) => /Safe Links|Proofpoint v[23]|Barracuda/.test(g)), v1]) {
    const t = ['ts,from,to,url', row(google(WRAPPED[2][1])), row(rewrite(SEC))].join('\n') + '\n';
    const r = refuses(utf8(t), 'trace.csv', `a Google redirect carrying ${WRAPPED[2][0]}, with a ${gw} link to an SEC release on the next row`, /encoded content inside a link|percent-encoded content/);
    check(/\(from line 2\)/.test(r.reason || ''), '  its hold names line 2, the Google link\'s row', r.reason);
    check(!hostAnywhere.contentHold(t), `CONTROL: with the vendor's host looked for anywhere in the slice, the same export passes (${gw})`);
  }
  const t = ['ts,from,to,url', row(google(SEC + '?a=1')), row(google(SEC + '?a=2')), row(GATEWAYS[1][1](WRAPPED[0][1])), row(google(SEC))].join('\n') + '\n';
  check(/\(from line 4\)/.test(contentHold(t)?.reason || ''), `Google rows above a ${GATEWAYS[1][0]} link carrying ${WRAPPED[0][0]}: the hold names line 4, the link's row`, contentHold(t)?.reason);
  check(!/\(from line 4\)/.test(hostAnywhere.contentHold(t)?.reason || ''), 'CONTROL: with the host looked for anywhere, the hold names a Google row above it', hostAnywhere.contentHold(t)?.reason);
}
// I-OVR-2: a printed link's continuation row has no "?" of its own, so a gateway's long key on it
// (Barracuda's "c=", about 110 characters in real mail) was judged by shape as an attachment: a
// quarter of printed Barracuda-wrapped court and EDGAR links were held, a quarter of those told to
// save an attachment. The fixtures above use a 20-character "c=". The row is read as the query it
// continues; a value that decodes to a name is still held there.
{
  const qOff = await detectVariant('detect-query-carry-off', [[String.raw` || (queryCarried && !/\s/.test(row.slice(0, m.index!)) && !before.includes('#'))`, '']]);
  const barracuda = (u, c) => `https://linkprotect.cudasvc.com/url?a=${encodeURIComponent(u).replace(/%[0-9A-F]{2}/g, (x) => x.toLowerCase())}&c=E,1,${c},&typo=1`;
  const body = (L) => `Counsel,\n\nPlease see the notice of electronic filing at ${L} and let me know if you have any questions before the hearing.\n\nBest regards,\nJane Partner`;
  const LINKS = ['https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm', 'https://www.bailii.org/ew/cases/EWCA/Civ/2023/1234.html', 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679', 'https://www.courtlistener.com/opinion/4589123/smith-v-jones/'];
  let n = 0, held = 0, off = 0, offAttach = 0;
  for (const L of LINKS) for (let k = 0; k < 3; k++) {
    const text = body(barracuda(L, bytes2(82).toString('base64url')));
    for (let w = 60; w <= 130; w++) {
      const t = wordRows(text, w); n++;
      if (contentHold(t)) held++;
      const o = qOff.contentHold(t);
      if (o) { off++; if (/attachment/.test(o.reason)) offAttach++; }
    }
  }
  check(held === 0, `Barracuda-wrapped EDGAR, BAILII, EUR-Lex and CourtListener links with a real-length "c=", printed at 60–130 columns: none of ${n} held`, `${held} held`);
  check(off > n / 10 && offAttach > 0, `CONTROL: judging the continuation row by its shape holds ${off} of ${n}, ${offAttach} of them as an attachment`);
  const named = `https://portal.example.com/view?ref=${b64('client=Jane Roe;matter=4471;dob=01/02/1980;ni=QQ123456C;address=14 Wisteria Lane, Greendale')}&lang=en`;
  for (const [what, link] of [['on its own', named], ['wrapped by Barracuda', GATEWAYS[3][1](named)]]) {
    const missed = [];
    for (let w = 30; w <= 130; w++) for (const t of [`To view it, visit\n${CUT(link, w)}\nThank you.`, `To view it, visit\n${CUT(link, w)} Thank you.`, wordRows(`To view it, visit ${link} Thank you.`, w)]) if (!contentHold(t)) missed.push(w);
    check(missed.length === 0, `CONTROL: a query value past 88 characters that decodes to a name, ${what}, printed across rows at 30–130, is held at every width`, `through at ${[...new Set(missed)].join(', ')}`);
  }
}
// I-OVR-3: a link's encoded value printed across two or more full rows is a wrapped block by its
// shape, and the block rule always named an attachment. The rows above it continue a link.
{
  const reasonOff = await detectVariant('detect-block-reason-off', [['      return { line: k + 1, link };', '      return { line: k + 1, link: false };']]);
  const link = `https://news.example.com/u?data=${Buffer.from(JSON.stringify({ e: 'jane.roe@clientco.com', list: 'litigation-weekly', src: 'newsletter', ts: 1695373443 })).toString('base64url')}`;
  const body = `Dear Counsel,\n\nThe client forwarded the account notice below. The link in it reads:\n${link}\nPlease advise whether this is responsive.\n\nRegards,\nJane Partner`;
  const tally = { link: 0, attachment: 0, pass: 0 }; let offAttach = 0;
  for (let w = 30; w <= 110; w++) for (const t of [CUT(body, w), wordRows(body, w)]) {
    const h = contentHold(t);
    tally[!h ? 'pass' : /inside a link/.test(h.reason) ? 'link' : 'attachment']++;
    if (/attachment/.test(reasonOff.contentHold(t)?.reason || '')) offAttach++;
  }
  check(tally.link === 162, 'an unsubscribe link whose "?data=" value decodes to the client\'s address, printed at 30–110 two ways: held at all 162 prints, every one with the link\'s reason', JSON.stringify(tally));
  check(offAttach > 0, `CONTROL: with the block rule naming an attachment always, ${offAttach} of those prints say "save the attachment"`);
  const att = b64('%PDF-1.4 ' + 'Jane Roe, 14 Wisteria Lane, Greendale. '.repeat(20)).match(/.{1,76}/g).join('\n');
  for (const [what, s] of [['a MIME part under its headers', `Content-Type: application/pdf\nContent-Disposition: attachment\n\n${att}\n`], ['a block under a link row that ends in a space', `See https://portal.example.com/view?id=1 \n${att}\n`], ['a block under a signature', `Regards,\nJane Partner\n${att}\n`]]) {
    const h = contentHold(s);
    check(!!h && /such as an email attachment/.test(h.reason) && !/inside a link/.test(h.reason), `CONTROL: ${what} keeps the attachment reason`, h?.reason ?? 'not held');
  }
}
// I-OVR-6: "_" and "-" are in the URL-safe alphabet, so a word glued to a value by them was read as
// the value's head and the rest decoded out of step: a magic, unsubscribe or verification link
// carrying the client's address as "session_<base64>" passed 102 of 120 shapes. Read again from
// past the joint. Teams writes its meeting id this way, which the UUID-piece reading below keeps
// from being held.
{
  const preOff = await detectVariant('detect-prefix-off', [
    ["      const rest = pre && !inV2 && !/(?:-[0-9A-F]{2}.*){2}/.test(m[0]) ? m[0].slice(pre[0].length) : '';", "      const rest = '';"],
    ['    const pre = whole.match(PREFIX);', '    const pre = null;'],
    ['    const deep = !/(?:-[0-9A-F]{2}.*){2}/.test(whole) ? deeperHeads(whole).map((h) => whole.slice(h)) : [];', '    const deep: string[] = [];'],
    ["      if (!inV2 && !/(?:-[0-9A-F]{2}.*){2}/.test(m[0])) for (const h of deeperHeads(m[0])) {", '      if (false) for (const h of deeperHeads(m[0])) {'],
  ]);
  const VALS = ['jane.roe@clientco.com', JSON.stringify({ email: 'jane.roe@clientco.com', name: 'Jane Roe' })];
  let n = 0, missed = [], off = 0;
  for (const v of VALS) for (const p of ['v1', 'usr', 'sess', 'token', 'client', 'session', 'meeting', 'magiclink', 'unsubscribe', 'verification']) for (const j of ['_', '-']) {
    const tok = `${p}${j}${Buffer.from(v).toString('base64url')}`;
    for (const s of [`Open https://portal.example.com/view?s=${tok} today.`, `Open https://portal.example.com/r/${tok}/confirm today.`, `Reference ${tok} was logged.`]) {
      n++;
      if (!contentHold(s)) missed.push(s.slice(0, 50));
      if (!preOff.contentHold(s)) off++;
    }
  }
  check(missed.length === 0, `the client's address or record in base64url glued to a word by "_" or "-" (10 words, both joints, in a query, a path and prose): all ${n} held`, missed.slice(0, 3).join(' | '));
  check(off === 102, `CONTROL: read only with the word as the value's head, ${off} of ${n} pass`);
  // CONTROL: identifiers with a word before a joint are not held
  const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const r62 = (k) => Array.from({ length: k }, () => ALNUM[Math.floor(rnd2() * 62)]).join('');
  const ids = [];
  for (let i = 0; i < 300; i++) ids.push(`pi_${r62(24)}`, `ghp_${r62(36)}`, `sess-${r62(32)}`, `req_${r62(20)}`, `usr_${bytes2(24).toString('base64url')}`);
  const idsHeld = ids.filter((id) => contentHold(`Logged ${id} at 09:14.`));
  check(idsHeld.length === 0, `CONTROL: ${ids.length.toLocaleString('en')} prefixed ids (Stripe, GitHub, a session cookie, a request id, random bytes after "usr_"): none held`, idsHeld.slice(0, 3).join(', '));
  // The word is one case after its first letter, or camel-cased: read as any run of the alphabet
  // before a "-", a Proofpoint v3 signature cut at a row ("TFRomvXobZq0Wz5O-WChSdnd54…") held
  // 2 of 107,115 printed ordinary links, the rest decoding to text by chance.
  const anyWord = await detectVariant('detect-prefix-any-run', [[String.raw`const PREFIX = /^(?=[A-Za-z0-9]{2,16}[_-])(?:[A-Za-z][a-z0-9]+|[A-Z][A-Z0-9]+|[A-Za-z][a-z]+(?:[A-Z][a-z]{2,})+[0-9]{0,2})[_-]/;`, 'const PREFIX = /^[A-Za-z][A-Za-z0-9]{1,15}[_-]/;']]);
  const v3sec = 'https://urldefense.com/v3/__https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm__;!!XTUM7ng2!rXZcjbv7HBWQwQhma3YlTFRomvXobZq0Wz5O-WChSdnd54SxWZfRYK3GdwYcHBVofzkvwccaut2EQuNy$';
  for (const [w, text] of [[34, `Subject: Smith v. Jones - production\n\nThe cover letter is here<${v3sec}>\n\nThanks,\nJane`], [30, `${v3sec}\nPlease confirm receipt.`]]) {
    passes(utf8(CUT(text, w) + '\n'), 'mail.txt', `a Proofpoint v3 link to an EDGAR filing, printed at ${w} columns`);
    check(!!anyWord.contentHold(CUT(text, w)), `CONTROL: with any run of the alphabet read as a word, it is held at ${w}`);
  }
  // A word of whole quanta leaves the value in step inside the token, and only the value is read:
  // read whole, the word's three bytes ahead of a Teams meeting id made it text, and a Teams link
  // printed at 56 columns ("…19%3ameet" / "ing_OGJi…") was held 87 times in 100.
  const wholeToo = await detectVariant('detect-prefix-whole-too', [['if (!(glued && pre![0].length % 4 === 0) && (v2 ?', 'if ((v2 ?']]);
  let t56 = 0, t56off = 0;
  for (let i = 0; i < 100; i++) {
    const t = CUT(`Join<https://teams.microsoft.com/l/meetup-join/19%3ameeting_${b64(uuid2()).replace(/=+$/, '')}%40thread.v2/0?context=%7b%22Tid%22%3a%22${uuid2()}%22%2c%22Oid%22%3a%22${uuid2()}%22%7d>`, 56) + '\n';
    if (contentHold(t)) t56++; if (wholeToo.contentHold(t)) t56off++;
  }
  check(t56 === 0, `100 Teams links printed at 56 columns ("…meet" / "ing_<meeting id>"): none held`, `${t56} held`);
  check(t56off > 50, `CONTROL: read whole as well, ${t56off} of 100 are held`);
  refuses(utf8(`Open https://portal.example.com/view?s=ing_${Buffer.from(VALS[0]).toString('base64url')} today.\n`), 'mail.txt', 'CONTROL: the client\'s address after a four-letter word of whole quanta ("ing_") is held, read from past the joint', /encoded content inside a link/);
  for (const p of ['magicLink', 'DOC', 'Token']) for (const j of ['_', '-']) refuses(utf8(`Open https://portal.example.com/view?s=${p}${j}${Buffer.from(VALS[0]).toString('base64url')} today.\n`), 'mail.txt', `the client's address in base64url after "${p}${j}"`, /encoded content inside a link/);
}
// Readings round 6's second pass added that nothing here depended on: taken out one at a time on a
// scratch tree (2026-09-24), each left every check above passing. Each is pinned by an input it
// decides, with that reading taken out as the CONTROL.
{
  const E = 'jane.roe@clientco.com';
  const e = encodeURIComponent;
  const memo = (L) => `Counsel,\n\nPlease see ${L} and let me know.\n\nRegards,\nJane\n`;
  // its own draws, so the laws after this block see the meetings they were measured on
  let seed3 = 20260924;
  const uuid3 = () => { const h = Buffer.from(Array.from({ length: 16 }, () => Math.floor((seed3 = (seed3 * 1103515245 + 12345) % 2147483648) / 2147483648 * 256))).toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
  // A word of two joints ("user_session_", "reset-password-") is read past each word, up to four.
  // Read past the first joint only, the value decodes out of step.
  const deepOff = await detectVariant('detect-deep-off', [["      if (!inV2 && !/(?:-[0-9A-F]{2}.*){2}/.test(m[0])) for (const h of deeperHeads(m[0])) {", '      if (false) for (const h of deeperHeads(m[0])) {']]);
  const pathDeepOff = await detectVariant('detect-path-deep-off', [['    const deep = !/(?:-[0-9A-F]{2}.*){2}/.test(whole) ? deeperHeads(whole).map((h) => whole.slice(h)) : [];', '    const deep: string[] = [];']]);
  const missed = []; let n = 0, offQ = 0, offP = 0;
  for (const w of ['user_session', 'magic_link', 'email_verify', 'reset-password']) for (const j of ['_', '-']) {
    const tok = `${w}${j}${Buffer.from(E).toString('base64url')}`;
    for (const [where, s] of [['query', `Open https://portal.example.com/view?s=${tok} today.`], ['prose', `Reference ${tok} was logged.`], ['path', `Open https://portal.example.com/r/${tok}/confirm today.`]]) {
      n++;
      if (!contentHold(s)) missed.push(s.slice(0, 60));
      if (where === 'path' ? !pathDeepOff.contentHold(s) : !deepOff.contentHold(s)) where === 'path' ? offP++ : offQ++;
    }
  }
  check(missed.length === 0, `the client's address glued to a word of two joints (4 words, both joints, in a query, prose and a link's path): all ${n} held`, missed.slice(0, 2).join(' | '));
  check(offQ === 16, `CONTROL: a token read past its first joint only, ${offQ} of the 16 in a query or prose pass`);
  check(offP === 8, `CONTROL: a path segment read past its first joint only, ${offP} of the 8 in a path pass`);
  // A path word of whole quanta ("doc_", "ing-") leaves the id after it in step inside the segment,
  // and only the id is read, as base64Hold reads a token: read whole as well, the word's three
  // bytes ahead of a UUID written in base64 made it text.
  const pathWhole = await detectVariant('detect-path-whole-too', [['[...(inStep ? [] : [whole]),', '[whole,']]);
  let pn = 0, ph = 0, pw = 0;
  for (let i = 0; i < 100; i++) for (const w of ['doc_', 'ing-', 'session_']) {
    const s = `Open https://portal.example.com/r/${w}${b64(uuid3()).replace(/=+$/, '')}/view today.`;
    pn++; if (contentHold(s)) ph++; if (pathWhole.contentHold(s)) pw++;
  }
  check(ph === 0, `${pn} links whose path carries a UUID in base64 after "doc_", "ing-" or "session_": none held`, `${ph} held`);
  check(pw > 10, `CONTROL: the segment read whole as well, ${pw} of ${pn} are held`);
  // A UUID's piece of odd length is read in both steps: "e-4a61-6e65-2052-6f65" spells a name from
  // its second digit, and read from its first only it is "not text".
  const oddOff = await detectVariant('detect-uuid-piece-one-step', [[" || readsAsText(hexBytes(h.slice(1))) ? 'text' : null; }\n    if (hexId)", " ? 'text' : null; }\n    if (hexId)"]]);
  const odd = `Ref ${b64('e-4a61-6e65-2052-6f65')} logged.\n`;
  refuses(utf8(odd), 'note.txt', 'a name spelled as hex in the shape of a UUID piece, one stray digit ahead of it, in base64', /encoded content/);
  check(!oddOff.contentHold(odd), 'CONTROL: that piece read in one step only passes');
  // In a Proofpoint v2 link a "-" is an escape on the host's own row too, not a word's joint: read
  // from past "v1-" ("x.v1-2DNTI3…"), a UUID in base64 decodes out of step and was held.
  const v2Real = (u) => GATEWAYS[1][1]('').replace('u=&', `u=${e(u).replace(/[-_]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%2F/g, '/').replace(/%/g, '-').replace(/\//g, '_')}&`);
  const hostRowOff = await detectVariant('detect-v2-host-row-off', [['const inV2 = (wasV2 && m.index! < firstEnd) || V2.test(before);', 'const inV2 = (wasV2 && m.index! < firstEnd);']]);
  const idLink = memo(v2Real(`https://portal.example.com/r/x.v1-${b64('52732b27-69a9-4eec-a2db-b58ab09fd67b')}.y/view`));
  for (const w of [106, 107]) {
    passes(utf8(CUT(idLink, w)), 'mail.txt', `a Proofpoint v2 link whose path carries a UUID in base64 after "v1-", printed at ${w} columns`);
    check(!!hostRowOff.contentHold(CUT(idLink, w)), `CONTROL: with "-" read as a joint on the host's row, it is held at ${w}`);
  }
  // A v2 escape the row end cut ("…-3" / "Dam…") is owed by the next row, which opens with the rest
  // of it: read with that digit, the value is out of step. The GATEWAYS fixture leaves a Teams
  // link's own "_" bare, as the escape-aware spelling above does not; this is where the two part.
  const oweOff = await detectVariant('detect-v2-owe-off', [["      if (inV2 && m.index === 0 && owe) tok = tok.replace(new RegExp(`^[0-9A-F]{${owe}}`), '');\n", '']]);
  let tn = 0, th = 0, to = 0, tadd = 0;
  for (let i = 0; i < 20; i++) {
    const text = memo(GATEWAYS[1][1](`https://teams.microsoft.com/l/meetup-join/19%3ameeting_${b64(uuid3()).replace(/=+$/, '')}%40thread.v2/0?context=%7b%22Tid%22%3a%22${uuid3()}%22%2c%22Oid%22%3a%22${uuid3()}%22%7d`));
    for (let w = 30; w <= 130; w++) { const t = CUT(text, w); tn++; const a = !!contentHold(t), o = !!oweOff.contentHold(t); if (a) th++; if (o) to++; if (a && !o) tadd++; }
  }
  check(tadd === 0, `Teams links in the Proofpoint v2 fixture, 20 meetings cut at 30–130: dropping the owed digits adds no held print (${th} of ${tn} held)`, `${tadd} added`);
  check(to > th, `CONTROL: read with the owed digits, ${to} of ${tn} are held`);
  // A block of encoded lines is a link's value printed across rows only when the row above it is as
  // wide as the block's first row and carries no space; "Portal: <link>" with prose before it, or a
  // prose row as wide as the block, is text the block was pasted under.
  const att = b64('%PDF-1.4 ' + 'Jane Roe, 14 Wisteria Lane, Greendale. '.repeat(20)).match(/.{1,76}/g).join('\n');
  const widthOff = await detectVariant('detect-block-width-off', [[' && (!encoderRows || Math.abs(src[k - 1].length - src[k].length) <= 1); u--) {', '; u--) {']]);
  const spaceOff = await detectVariant('detect-block-space-off', [[String.raw`        if (/\s/.test(src[u].trim())) break;` + '\n', '']]);
  const prose76 = 'The statement below was pasted from the portal by the client this morning, as';
  for (const [what, s, off] of [['under "Portal: <link>", prose before the link on its row', `Please see the attached statement. Portal: https://portal.example.com/statements?id=4471\n${att}\n`, widthOff], ['under a prose row as wide as the block, under a link row', `See https://portal.example.com/statements?id=4471\n${prose76.slice(0, 76)}\n${att}\n`, spaceOff]]) {
    const h = contentHold(s);
    check(!!h && /such as an email attachment/.test(h.reason) && !/inside a link/.test(h.reason), `an attachment's block ${what} keeps the attachment reason`, h?.reason ?? 'not held');
    check(/inside a link/.test(off.contentHold(s)?.reason || ''), `CONTROL: without that test, the block ${what} is called a link's value`);
  }
  // A "," is inside a path segment only as ",_" or ",%20": a bare "," after a segment that carries
  // an escape still ends it, as a CSV cell's does, and the escaped name in the next cell is held.
  const shapeOff = await detectVariant('detect-comma-any-shape', [[String.raw`/^(?:_|%20)/.test(text.slice(i, i + 3)) && `, '']]);
  const cell = `Path,Owner\n/srv/${e('Документы')},%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2\n`;
  refuses(utf8(cell), 'export.csv', 'an escaped name in the CSV cell after an escaped folder name and a bare ","', /percent-encoded content/);
  check(!shapeOff.contentHold(cell), 'CONTROL: with any "," after an escaped segment read as inside it, the name passes');
  // I3-1 and I3-2: the generic gateway shape's path may not run on across "://". In a no-space
  // export it ran from an EDGAR link rows above into a FireEye link carrying the escaped address,
  // took that value for its own, and the address passed.
  const pathRunOn = await detectVariant('detect-gateway-path-run-on', [[String.raw`[\w-]+(?::\d+)?\/(?:(?!:\/\/)[^\s?#])*\?`, String.raw`[\w-]+(?::\d+)?\/[^\s?#]*\?`]]);
  const fire = (u) => GATEWAYS[4][1](u);
  const edgar = (i) => `2026-09-22T09:${String(i % 60).padStart(2, '0')}:03Z,noreply@sec.example,jsmith@firm.example,https://www.sec.gov/Archives/edgar/data/320193/0000320193230001${String(i % 100).padStart(2, '0')}/aapl-20230930.htm`;
  for (const at of [57, 114]) {
    const rows = ['ts,from,to,url'];
    for (let i = 1; i < at; i++) rows.push(edgar(i));
    rows.push(`2026-09-22T10:00:00Z,news@lawfirm.example,jsmith@firm.example,${fire(WRAPPED[2][1])}`);
    for (let i = 0; i < 5; i++) rows.push(edgar(1000 + i));
    const t = rows.join('\n') + '\n';
    const r = refuses(utf8(t), 'message-trace.csv', `a no-space export of EDGAR links with a FireEye link carrying the escaped address on row ${at + 1}`, /encoded content inside a link|percent-encoded content/);
    check(new RegExp(`\\(from line ${at + 1}\\)`).test(r.reason || ''), `  its hold names row ${at + 1}`, r.reason);
    check(!pathRunOn.contentHold(t), `CONTROL: with the path running on across "://", the same export passes (row ${at + 1})`);
  }
  const list = `Dear Counsel,\n\nThe two links the client forwarded:\n${edgar(1).split(',').pop()}\n${fire(WRAPPED[2][1])}\n\nRegards,\nJane Partner\n`;
  check(/\(from line 5\)/.test(contentHold(list)?.reason || ''), 'a FireEye link carrying the escaped address under an EDGAR link, one per line: the hold names line 5, the FireEye link', contentHold(list)?.reason);
  check(!/\(from line 5\)/.test(pathRunOn.contentHold(list)?.reason || ''), 'CONTROL: with the path running on, it names another line', pathRunOn.contentHold(list)?.reason);
  // A link's query ends at "#": a fragment printed on the rows below is not read as the query, and
  // a long encoded fragment is judged by its shape there as on one line. Read as the query, the
  // rows after the "#" row passed at more widths.
  const q = 'UT7Qd5Yd53b3U9O2W8_LjVPaDyythlGOTi3iXhn9XzX-dWOKU5I0dw';
  const bin = (k) => Buffer.from(Array.from({ length: k }, (_, i) => (i * 97 + 13) % 256)).toString('base64');
  for (const [what, L, swapTo, gain] of [
    ['a fragment after "#section-", the "#" on a row above', `https://portal.example.com/view?a=${q}#section-${bin(240)}`, ['(carried && linkQuery && !last.includes(\'#\'))', '(carried && linkQuery)'], 10],
    ['a fragment whose "#" opens a continuation row', `https://portal.example.com/view?a=${q}#${bin(120)}`, [String.raw` && !/\s/.test(row.slice(0, m.index!)) && !before.includes('#'));`, String.raw` && !/\s/.test(row.slice(0, m.index!)));`], 5],
  ]) {
    const off = await detectVariant(`detect-fragment-as-query-${gain}`, [swapTo]);
    let held = 0, offHeld = 0, offOnly = 0;
    for (let w = 30; w <= 130; w++) { const t = CUT(memo(L), w); const a = !!contentHold(t), o = !!off.contentHold(t); if (a) held++; if (o) offHeld++; if (o && !a) offOnly++; }
    check(!!contentHold(memo(L)) && held - offHeld === gain && offOnly === 0, `${what}: held on one line, and printed at 30–130 held at ${held} widths`, `${held} held, ${offHeld} as the query, ${offOnly} held only as the query`);
    check(offHeld < held, `CONTROL: read as the query, held at ${offHeld}`);
  }
  // A spaced row under a row that ends in a query is prose, not the query carried on: a 120-character
  // base64 token there is judged by its shape.
  const spaceIn = await detectVariant('detect-query-carry-past-space', [[String.raw` || (queryCarried && !/\s/.test(row.slice(0, m.index!)) && !before.includes('#'))`, String.raw` || (queryCarried && !before.includes('#'))`]]);
  const note = `See https://portal.example.com/a?x=1&y=BT8HGiU1Zx9Z\nNote ${bin(90)} end\n`;
  refuses(utf8(note), 'note.txt', 'a 120-character base64 token in prose on the row under a link that ends in its query', /encoded content/);
  check(!spaceIn.contentHold(note), 'CONTROL: read as the query carried on, it passes');
  // I3-3: words before the joint that are mixed case ("magicLinkV2_", "iOS-", "userIdV1_") are read
  // past as well. With only PREFIX's shapes and the narrower deep words, they passed.
  const narrowDeep = await detectVariant('detect-deep-word-narrow', [[String.raw`|[A-Za-z][a-z]+(?:[A-Z][a-z]+)+(?:[A-Z]?[0-9]{1,2})?|[A-Z]{2,}[a-z]{2,}|[a-z]{2,}[A-Z][A-Z0-9]{0,2}|[a-z][A-Z][a-z]{2,}|[a-z][A-Z]{2,3})`, String.raw`|[A-Za-z][a-z]+(?:[A-Z][a-z]{2,})+[0-9]{0,2}|[A-Z]{2,}[a-z]{2,}|[a-z]{2,}[A-Z][A-Z0-9]{0,2}|[a-z][A-Z][a-z]{2,})`]]);
  const mixed = []; let mn = 0, mOff = 0;
  for (const w of ['magicLinkV2', 'iOS', 'userIdV1']) for (const j of ['_', '-']) for (const v of [E, JSON.stringify({ email: E, name: 'Jane Roe' })]) {
    const tok = `${w}${j}${Buffer.from(v).toString('base64url')}`;
    for (const s of [`Open https://portal.example.com/view?s=${tok} today.`, `Open https://portal.example.com/r/${tok}/confirm today.`, `Reference ${tok} was logged.`]) { mn++; if (!contentHold(s)) mixed.push(s.slice(0, 60)); if (!narrowDeep.contentHold(s)) mOff++; }
  }
  check(mixed.length === 0, `the client's address or record glued to a mixed-case word ("magicLinkV2", "iOS", "userIdV1"; both joints, in a query, a path and prose): all ${mn} held`, mixed.slice(0, 2).join(' | '));
  check(mOff > 0, `CONTROL: with the narrower words, ${mOff} of ${mn} pass`);
  // A hash-routed app's link carries its path after "#/" or "#!/", and the path is read segment by
  // segment there as after the host.
  const noRoute = await detectVariant('detect-hash-route-off', [["const route = /#!?\\/[^?#]*$/.test(before) || (/#!?$/.test(before) && m[0].startsWith('/'));", 'const route = false;'], ['&& !/\\?|#(?!!?\\/)/.test(last));', '&& !/[?#]/.test(last));'], ['!/[?&=]|#(?!!?\\/)/.test(linkWord.slice(scheme))', '!/[?&=#]/.test(linkWord.slice(scheme))']]);
  for (const L of [`https://portal.example.com/#/reset/${b64(E)}`, `https://portal.example.com/#!/unsubscribe/${Buffer.from(JSON.stringify({ email: E, name: 'Jane Roe' })).toString('base64url')}/confirm`]) {
    refuses(utf8(memo(L)), 'mail.txt', `a hash-routed link carrying the client's address in its path (${L.slice(26, 42)}…)`, /encoded content inside a link/);
    const missedW = [], offMissed = [];
    for (let w = 30; w <= 130; w++) { const t = CUT(memo(L), w); if (!contentHold(t)) missedW.push(w); if (!noRoute.contentHold(t)) offMissed.push(w); }
    // The two widths that pass cut the row at the "#" itself, and the rest of the link shares its row
    // with prose: a row with a space is not read as carrying the link on, here as for any path.
    check(missedW.length <= 2, `  and printed at 30–130: held at ${101 - missedW.length} widths (at most 2 pass: the row cut at the "#")`, `passes at ${missedW.join(', ')}`);
    check(offMissed.length > 50, `CONTROL: read as a fragment, it passes at ${offMissed.length} of 101 widths`);
  }
  for (const L of [`https://app.clio.com/nc/#/matters/4829301/documents`, `https://firm.relativity.one/Relativity/#/workspace/1234567/document/7654321`, `https://app.example.com/#/documents/${uuid3()}`, `https://app.example.com/#!/file/${Buffer.from(uuid3()).toString('hex').slice(0, 32)}/view`])
    passes(utf8(memo(L)), 'mail.txt', `CONTROL: a hash-routed practice link (${L.slice(8, 40)}…)`);
  // F1: a link's value printed in a proportional font (Outlook or a browser printing to PDF) fills
  // each row to the page in points, so the row carrying the link's start is never as wide as the
  // rows under it; the width test is for an encoder's block, whose full rows are one width.
  const HELV = { ' ': 278, i: 222, j: 222, l: 222, f: 278, t: 278, r: 333, I: 278, '/': 278, ':': 278, '.': 278, ',': 278, '-': 333, c: 500, k: 500, s: 500, v: 500, x: 500, y: 500, z: 500, J: 500, m: 833, w: 722, M: 833, W: 944, '@': 1015, '%': 889, '+': 584, '=': 584, '&': 667, C: 722, D: 722, H: 722, N: 722, R: 722, U: 722, G: 778, O: 778, Q: 778, F: 611, T: 611, Z: 611, L: 556, A: 667, B: 667, E: 667, K: 667, P: 667, S: 667, V: 667, X: 667, Y: 667 };
  const pts = (s) => [...s].reduce((a, c) => a + (HELV[c] ?? 556), 0);
  const propPrint = (text, max) => text.split('\n').map((para) => {
    const out = []; let line = '';
    for (const word of para.split(' ')) {
      if (line && pts(line + ' ' + word) <= max) { line += ' ' + word; continue; }
      if (line && pts(word) <= max) { out.push(line); line = word; continue; }
      let cur = line;
      for (const c of line ? ' ' + word : word) { if (pts(cur + c) > max) { out.push(cur); cur = c === ' ' ? '' : c; } else cur += c; }
      line = cur;
    }
    out.push(line);
    return out.join('\n');
  }).join('\n');
  const rec = JSON.stringify({ email: E, name: 'Jane Roe', list: 'client-alerts', ts: 1727136000, src: 'newsletter-2024-09' });
  const unsub = `Dear Counsel,\n\nPlease find below the notice we received.\n\nTo stop receiving these emails, click https://news.lawfirm.example/unsubscribe?data=${b64(rec)}\n\nKind regards,\nJane Partner`;
  const rowsAlways = await detectVariant('detect-block-width-always', [[' && (!encoderRows || Math.abs(src[k - 1].length - src[k].length) <= 1); u--) {', ' && Math.abs(src[k - 1].length - src[k].length) <= 1; u--) {']]);
  let pn2 = 0, att2 = 0, attOff = 0;
  for (const pt of [9, 10, 11, 12]) for (let inch = 5.5; inch <= 7.5; inch += 0.25) {
    const t = propPrint(unsub, (inch * 72 / pt) * 1000);
    pn2++;
    if (!/inside a link/.test(contentHold(t)?.reason || '')) att2++;
    if (/such as an email attachment/.test(rowsAlways.contentHold(t)?.reason || '')) attOff++;
  }
  check(att2 <= 2, `an unsubscribe link carrying the client's record, printed in Helvetica at 9–12 points on 5.5–7.5 inch rows: held as a link at ${pn2 - att2} of ${pn2} (at most 2 not)`, `${att2} not`);
  check(attOff > pn2 / 2, `CONTROL: with the row above held to the block's width whatever the block's rows, ${attOff} of ${pn2} are told to save an attachment`);
  // an encoder's block at a width other than MIME's or PEM's keeps the attachment reason under a link row
  const rowsMime = await detectVariant('detect-block-width-mime-only', [["(full.length >= 2 || full[0].length === 64 || full[0].length === 76)", '(full[0].length === 64 || full[0].length === 76)']]);
  for (const w of [60, 72]) {
    const s = `Please see the attached statement. Portal: https://portal.example.com/statements?id=4471\n${att.replace(/\n/g, '').match(new RegExp(`.{1,${w}}`, 'g')).join('\n')}\n`;
    check(/such as an email attachment/.test(contentHold(s)?.reason || ''), `an attachment's block wrapped at ${w} under "Portal: <link>" keeps the attachment reason`, contentHold(s)?.reason);
    check(/inside a link/.test(rowsMime.contentHold(s)?.reason || ''), `CONTROL: with the width test kept for 64 and 76 only, the block at ${w} is called a link's value`);
  }
}
// F4: a key=value log exhibit (a firewall's traffic log) printed at a fixed column is not
// quoted-printable: an encoder writes every "=" as "=3D", and each row carries an "=" that two hex
// digits do not follow. Its "=" at a row's end was read as a soft break.
{
  let seed4 = 20260925;
  const r4 = (a, b) => a + Math.floor((seed4 = (seed4 * 1103515245 + 12345) % 2147483648) / 2147483648 * (b - a));
  const fw = () => `date=2024-03-${r4(10, 29)} time=${r4(10, 23)}:${r4(10, 59)}:${r4(10, 59)} devname="FW-HQ01" devid="FG100E4Q${r4(10000000, 99999999)}" type="traffic" subtype="forward" level="notice" srcip=10.${r4(0, 255)}.${r4(0, 255)}.${r4(1, 254)} srcport=${r4(1024, 65535)} srcintf="port${r4(1, 9)}" dstip=10.${r4(0, 255)}.${r4(0, 255)}.${r4(1, 254)} dstport=445 dstintf="wan1" proto=6 action="close" policyid=${r4(1, 99)} service="SMB" sentbyte=${r4(100, 99999)} rcvdbyte=${r4(100, 99999)}`;
  const qpOff = await detectVariant('detect-qp-any-equals', [[String.raw`    if (/=(?![0-9A-Fa-f]{2})./.test(l.slice(0, -1))) continue;` + '\n', '']]);
  let ln = 0, lh = 0, lOff = 0;
  for (let d = 0; d < 10; d++) {
    const ex = ['EXHIBIT 14 — FIREWALL LOG EXCERPT (produced by Defendant, Bates DEF-0004412)', ...Array.from({ length: 12 }, fw), 'Certified true copy.'].join('\n');
    for (let w = 60; w <= 80; w++) { const t = CUT(ex, w); ln++; if (contentHold(t)) lh++; if (/quoted-printable/.test(qpOff.contentHold(t)?.reason || '')) lOff++; }
  }
  check(lh === 0, `a firewall log exhibit cut at 60–80 columns (10 exhibits of 12 rows): none of ${ln} held`, `${lh} held`);
  check(lOff > ln / 4, `CONTROL: with any line ending in "=" read as a soft break, ${lOff} of ${ln} are held as quoted-printable email`);
  refuses(utf8('The parties agree that NET=3DGROSS less fees, and that the escrow agent wil=\nl release the funds to Margaret on completion.\n'), 'message.txt', 'CONTROL: a soft break on a line whose own "=" is written "=3D"', /quoted-printable/);
}
// I-OVR-5: a printed Teams invitation's row can open or end inside the meeting id, a UUID in base64,
// and a row's piece of it read as text ("0495d-607f-43ad-…", or the last group's "ebf" and "add").
// Judged as the hex it spells, as a whole UUID already is.
{
  const uuidOff = await detectVariant('detect-uuid-piece-off', [['    if (piece) {', '    if (false) {']]);
  const invite = (L) => `Jane Partner is inviting you to a scheduled Microsoft Teams meeting.\n\nSmith v. Jones - meet and confer\n\n${'_'.repeat(80)}\nMicrosoft Teams meeting\nJoin on your computer, mobile app or room device\nClick here to join the meeting<${L}>\nMeeting ID: 245 187 334 561\nPasscode: 7Hq2Zp\n${'_'.repeat(80)}`;
  let n = 0, held = 0, off = 0;
  for (let i = 0; i < 40; i++) {
    const text = invite(`https://teams.microsoft.com/l/meetup-join/19%3ameeting_${b64(uuid2()).replace(/=+$/, '')}%40thread.v2/0?context=%7b%22Tid%22%3a%22${uuid2()}%22%2c%22Oid%22%3a%22${uuid2()}%22%7d`);
    for (let w = 60; w <= 130; w++) { const t = wordRows(text, w); n++; if (contentHold(t)) held++; if (uuidOff.contentHold(t)) off++; }
  }
  check(held <= 1, `printed Teams invitations, 40 meetings at 60–130 columns: ${held} of ${n} held (at most 1: a row that opens out of step decodes to text by chance)`);
  check(off > 50, `CONTROL: reading a piece of the meeting id as text, ${off} of ${n} are held`);
  // CONTROL: a name spelled as UUID-shaped hex, in a link's value printed across rows, is still held
  const hex = Buffer.from('Jane Roe QQ123456').toString('hex');
  const named = `https://portal.example.com/join?ref=${b64(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`).replace(/=+$/, '')}&x=1`;
  refuses(utf8(`Join here: ${named} today.\n`), 'invite.txt', 'CONTROL: a name spelled as UUID-shaped hex in base64 in a link', /encoded content inside a link/);
  // Under Proofpoint v2 the meeting id runs on into "-2540thread" ("%40" written with "-", which
  // is in the URL-safe alphabet): 59 of 355 printed v2-wrapped Teams links were held. A token that
  // carries a v2 escape of a "%" is read in pieces at each v2 escape.
  const v2Off = await detectVariant('detect-v2-split-off', [['const v2 = /-25[0-9A-F]{2}/.test(m[0]) ?', 'const v2 = false ?']]);
  // as Proofpoint v2 writes it: the carried link's "-" and "_" escaped ("-2D", "-5F") and its "/" as
  // "_". The GATEWAYS fixture leaves "meeting_" as it stands, which a real v2 value never does.
  const v2Real = (u) => GATEWAYS[1][1]('').replace('u=&', `u=${encodeURIComponent(u).replace(/[-_]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%2F/g, '/').replace(/%/g, '-').replace(/\//g, '_')}&`);
  const body = (L) => `Counsel,\n\nPlease join at ${L} and let me know if you have any questions before the hearing.\n\nBest regards,\nJane Partner`;
  let vn = 0, vheld = 0, voff = 0;
  for (let i = 0; i < 10; i++) {
    const text = body(v2Real(`https://teams.microsoft.com/l/meetup-join/19%3ameeting_${b64(uuid2()).replace(/=+$/, '')}%40thread.v2/0?context=%7b%22Tid%22%3a%22${uuid2()}%22%2c%22Oid%22%3a%22${uuid2()}%22%7d`));
    for (let w = 60; w <= 130; w++) { const t = wordRows(text, w); vn++; if (contentHold(t)) vheld++; if (v2Off.contentHold(t)) voff++; }
  }
  check(vheld === 0, `printed Proofpoint v2-wrapped Teams links, 10 meetings at 60–130 columns: none of ${vn} held`, `${vheld} held`);
  check(voff > 0, `CONTROL: reading the v2 value as one token, ${voff} of ${vn} are held`);
  // Cut at a narrow margin a row can open "meeting-5FNzUw…": read from past "meeting-" it is out of
  // step by the escape. Known as v2 by the host earlier in the word or read across the rows above,
  // a "-" there is an escape, not a word's joint. Measured: 4 of 1,737 printed Teams links held at
  // 35–38 columns before. The link below is one of them. It is still held at a few other widths
  // (a row opening out of step inside the meeting id reads as text by chance): 5 to 6 of 101 in
  // these layouts, the remainder stated in detect.ts; this reading removes widths and adds none.
  const hostOff = await detectVariant('detect-v2-host-off', [['const inV2 = (wasV2 && m.index! < firstEnd) || V2.test(before);', 'const inV2 = false;']]);
  const teamsV2 = 'https://urldefense.proofpoint.com/v2/url?u=https-3A-2F-2Fteams.microsoft.com-2Fl-2Fmeetup-2Djoin-2F19-253ameeting-5FNzUwY2I2MjUtNTdjMy00ZGIyLWIyYzEtZGIxOWQzMDAwYTU5-2540thread.v2-2F0-3Fcontext-3D-257b-2522Tid-2522-253a-25221e18e8a3-2Db9ef-2D4f1c-2D903b-2D2c7a17692c5d-2522-252c-2522Oid-2522-253a-2522097e0d7a-2Da205-2D43e2-2D88f1-2Dffe56308adfe-2522-257d&d=DwMFaQ&c=5pfEEdiqsYn2av-9D8H_pL8fp3ROISV4dQ18iHEic_4&r=xu0emr5vLYe2UkV6sS07B3rG8nngu1gFZiW6a0psAs0&m=VRAOGTA0esThZ4UJuXL0blFUVgOaQZf3-Axc2jqxweotHXWuFkuefeIncwzYXiT1&s=yLGw6rmtui2LRX9j13tuok8yQerilzVZIRTfvl1NFY0&e=';
  let added = [], removed = [];
  for (const pre of ['Please see the notice of electronic filing at ', 'Join: ', '']) for (let w = 30; w <= 130; w++) {
    const t = `Counsel,\n\n${CUT(`${pre}${teamsV2} and let me know.`, w)}\n\nRegards,\nJane\n`;
    const a = !!contentHold(t), o = !!hostOff.contentHold(t);
    if (a && !o) added.push(w); if (o && !a) removed.push(w);
  }
  check(added.length === 0, 'a Proofpoint v2-wrapped Teams link cut at 30–130 in three layouts: reading its "-" as an escape adds no held width', `added at ${added.join(', ')}`);
  check(removed.length >= 3, `CONTROL: read from past "meeting-", it is held at ${removed.length} more widths (${removed.join(', ')})`);
  // CONTROL: the client's address, in each encoding, in a v2-wrapped link that carries its own
  // escapes (so the value has "-25" escapes in it), is held one line and at every width 30–130
  const ENC = { base64: (s) => b64(s), base64url: (s) => Buffer.from(s).toString('base64url'), hex: (s) => Buffer.from(s).toString('hex'), 'percent-escapes': pctAll };
  for (const [ek, e] of Object.entries(ENC)) for (const wrap of [v2Real, GATEWAYS[1][1]]) {
    const link = wrap(`https://news.lawfirm.example/unsubscribe?e=${e('jane.roe@clientco.com')}&src=a%40b`);
    const missed = [];
    for (let w = 30; w <= 130; w++) for (const t of [CUT(body(link), w), wordRows(body(link), w)]) if (!contentHold(t)) missed.push(w);
    check(!!contentHold(body(link)) && missed.length === 0, `CONTROL: the client's address in ${ek}, in a Proofpoint v2 link with its own "%40" (${wrap === v2Real ? 'as v2 writes it' : 'the GATEWAYS fixture'}), is held one line and printed at every width 30–130`, `through at ${[...new Set(missed)].join(', ')}`);
  }
}
// I-OVR-1: I3-SLASH ended a path segment at any "," — but a Wikipedia title writes a name's comma
// as ",_" ("Толстой,_Лев_Николаевич") and a file name's as ",%20", so a server log requesting that
// page was held at every width. A "," is inside the segment in those two shapes, when the stretch
// back to the "/" already carries an escape; a bare "," still ends it, as a CSV cell's does.
{
  const e = encodeURIComponent;
  const commaOff = await detectVariant('detect-comma-off', [[String.raw`    if (/[\s;]/.test(c)) return false;`, String.raw`    if (/[\s,;]/.test(c)) return false;`]]);
  for (const [what, s] of [
    ['an Apache log line requesting a Russian Wikipedia person page ("Surname,_Given")', `203.0.113.5 - - [22/Sep/2026:09:14:03 +0000] "GET /wiki/${e('Толстой')},_${e('Лев_Николаевич')} HTTP/1.1" 200 5123 "-" "Mozilla/5.0"`],
    ['a browser-history export line with a file name "Договор, ред. 2.docx"', `2026-09-22 09:14:03 GET /disk/${e('Документы')}/${e('Договор')},%20${e('ред')}.%202.docx 200`],
  ]) {
    passes(utf8(s + '\n'), 'log.txt', what);
    check(!!commaOff.contentHold(s), `CONTROL: with every "," ending the segment, ${what} is held`);
  }
  const IVANOV = '%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2', WANG = '%E7%8E%8B%E5%B0%8F%E6%98%8E';
  for (const s of [`Role,Name\nPlaintiff/Defendant,${IVANOV}`, `Party;Name\nclaimant/appellant;${WANG}`, `Matter,Contact\nHC/2026/101,${IVANOV},${WANG}`, `Path,Owner\n/srv/share/report.pdf,${IVANOV}`, `Path,Owner\n/srv/share/${e('отчет')}.pdf,${IVANOV}`, `Path,Owner\n/srv/share/${e('отчет')}.pdf,_${IVANOV}`, `Path,Owner,Note\n/srv/${e('合同')}.docx,${WANG},_`]) {
    refuses(utf8(s + '\n'), 'export.csv', `CONTROL: an escaped name in the CSV cell after a path or reference cell (${JSON.stringify(s.split('\n')[1].slice(0, 28))}…)`, /percent-encoded content/);
    // Hard-cut across rows, the fix loses no width. Two of these seven already passed at some widths
    // before it and still do, the same widths with or without it: the CJK name cut so that no row
    // holds two whole escaped letters ("claimant/appellant;" at 30, 32, 33, 35, 36; the ".docx,"
    // cell at 39–46, six widths). That is the per-row reading of I3-PCTGRID, not the comma.
    const W = Array.from({ length: 81 }, (_, i) => 30 + i);
    const missed = W.filter((w) => !contentHold(CUT(s, w)));
    const offMissed = new Set(W.filter((w) => !commaOff.contentHold(CUT(s, w))));
    const lost = missed.filter((w) => !offMissed.has(w));
    check(lost.length === 0 && missed.length <= 6, `  and printed across rows at 30–110: no width lost to the fix (${missed.length} pass, as they did with every "," ending the segment)`, lost.length ? `lost at ${lost.join(', ')}` : `passed at ${missed.join(', ')}`);
  }
}
// Round 5 (ID-COLUMN-BLOCK): a column of sixteen equal-width record ids, no tail, was refused as
// an attachment. The ids share their prefix; an encoder's lines do not. The sixteen-line
// 64-column CONTROL above stays refused.
{
  let x = 7;
  const r62 = (n, set = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') => Array.from({ length: n }, () => set[((x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 16) % set.length]).join('');
  const col = (gen) => 'Ids produced in response to Request No. 14:\n' + Array.from({ length: 16 }, gen).join('\n') + '\n';
  passes(utf8(col(() => 'ch_3' + r62(23))), 'rfp.txt', 'sixteen Stripe charge ids, one per line');
  passes(utf8(col(() => '1' + r62(32, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'))), 'rfp.txt', 'sixteen Google Drive file ids, one per line');
  passes(utf8(col(() => '0015g0000' + r62(9))), 'rfp.txt', 'sixteen Salesforce Account ids from one org, one per line');
}
passes(utf8('Payment schedule\nJan 2024\nFeb 2024\nMar 2024\nApr 2024\nMay 2024\nJun 2024\nJul 2024\nAug 2024\nSep 2024\nOct 2024\nNov 2024\nDec 2024\nJan 2025\nFeb 2025\nMar 2025\nTotal\n'), 'table.txt', 'a table column of short equal values with a total under it');
// Round 3 (OR-8): "PK" is a zip only with the rest of its signature.
passes(utf8('PKK members who return face persecution; the tribunal found the appellant credible.\n'), 'memo.txt', 'a memo whose first word is "PKK"');
passes(utf8('PK,Name,Matter\n1,Roe,4471\n'), 'export.csv', 'a CSV whose first column is PK');
passes(utf8('PKF audit findings, 2025.\n'), 'notes.md', 'a note starting "PKF"');
{
  const r = route(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]), 'bundle.zip');
  check(refused(r) && r.format === 'zip', 'CONTROL: a real zip signature (PK 03 04) is still a zip', r.reason);
  const fx = join(repo, 'app', 'extract', 'fixture.docx');
  if (existsSync(fx)) { const d = route(new Uint8Array(readFileSync(fx)), 'fixture.docx'); check(d.route === 'docx-walker', 'CONTROL: fixture.docx still routes to the Word walker'); }
}

console.log('\n   The text lane decodes a UTF-16 Save As as the text it is');
{
  const t = readText(utf16le('Jane Roe instructs us.', false));
  check(t.encoding === 'utf-16le' && t.text === 'Jane Roe instructs us.', 'a UTF-16LE file with no BOM decodes without NULs', JSON.stringify(t.text));
  const r = route(utf16le('The client instructs us to settle.\r\n', false), 'note.txt');
  check(r.route === 'text', 'CONTROL: a UTF-16LE memo with no BOM still reads as text');
  const u = readText(utf8('Plain UTF-8 text, nothing else.'));
  check(u.encoding === 'utf-8', 'CONTROL: UTF-8 is not mistaken for UTF-16');
  // app/extract/text.mjs is the node reader test-text.mjs drives. Without the BOM-less read it
  // handed "J\0a\0n\0e" to whatever read it next; it is asked the app's question on every shape.
  const nodeText = await import(url(join(repo, 'app', 'extract', 'text.mjs')));
  const be = (s, bom) => { const le = utf16le(s, false), b = new Uint8Array((bom ? 2 : 0) + le.length); if (bom) { b[0] = 0xfe; b[1] = 0xff; } for (let i = 0; i < le.length; i += 2) { b[(bom ? 2 : 0) + i] = le[i + 1]; b[(bom ? 3 : 1) + i] = le[i]; } return b; };
  const odd = utf16le('Jane Roe instructs us.', false).subarray(0, 43);
  const shapes = [
    ['UTF-16LE, no BOM', utf16le('Jane Roe instructs us.\r\n', false), 'utf-16le'],
    ['UTF-16BE, no BOM', be('Jane Roe instructs us.\r\n', false), 'utf-16be'],
    ['UTF-16LE with a BOM', utf16le('Jane Roe instructs us.', true), 'utf-16le'],
    ['UTF-16BE with a BOM', be('Jane Roe instructs us.', true), 'utf-16be'],
    ['UTF-16LE, no BOM, cut at an odd byte', odd, 'utf-16le'],
    ['UTF-8 with a BOM', new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Jane Roe instructs us.')]), 'utf-8'],
    ['UTF-8', utf8('Plain UTF-8 text, Renée Roe.'), 'utf-8'],
  ];
  for (const [what, bytes, enc] of shapes) {
    const a = readText(bytes);
    let n; try { n = nodeText.readText(bytes); } catch (e) { n = { error: e.message }; }
    check(a.encoding === enc && !a.text.includes('\0') && JSON.stringify(n) === JSON.stringify(a), `${what}: text.ts and app/extract/text.mjs both read ${enc}, the same text, no NULs`, `app ${JSON.stringify(a)} · node ${JSON.stringify(n)}`);
  }
}

console.log('\n   The PDF lane applies the same rule per page, and a refused page ships no text');
{
  const src = readFileSync(join(here, '..', 'src', 'lib', 'extract', 'pdf.ts'), 'utf8');
  check(/import \{ contentHold, type Hold \} from '\.\/detect'/.test(src) && /const hold = contentHold\(text\);\s*\n\s*if \(hold\) \{ const h = pageHold\(hold, riders\); status = `refused: /.test(src), 'pdf.ts refuses a page whose text contentHold() holds');
  check(/text: status === 'ok' \? text : ''/.test(src), 'a refused page carries no text into the engine or the export');
}

console.log('\n   A Word file: the channels the writer saves are held, the ones it removes are not (docxContentHold)');
{
  // A stored-zip .docx built by hand, read by the REAL extractDocx().
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc32 = (b) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
  const zip = (files) => {
    const loc = [], cen = []; let off = 0;
    for (const [name, content] of files) {
      const data = Buffer.from(content), nm = Buffer.from(name), crc = crc32(data);
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
      const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
      loc.push(lh, nm, data); cen.push(ch, nm); off += 30 + nm.length + data.length;
    }
    const cd = Buffer.concat(cen), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
    return new Uint8Array(Buffer.concat([...loc, cd, end]));
  };
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main', C = 'http://schemas.openxmlformats.org/drawingml/2006/chart', DGM = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
  const paras = (ps) => ps.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('');
  // `raw`: body XML after the paragraphs (a tracked change); `parts`: [name, root, inner XML]
  const docx = ({ body, link, footer, raw = '', parts = [] }) => zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>'],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${paras(body)}${raw}${link ? `<w:p><w:hyperlink r:id="rId9"><w:r><w:t>${link.label}</w:t></w:r></w:hyperlink></w:p>` : ''}</w:body></w:document>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${link ? `<Relationship Id="rId9" Type="${R}/hyperlink" Target="${link.url.replace(/&/g, '&amp;')}" TargetMode="External"/>` : ''}</Relationships>`],
    ...(footer ? [['word/footer1.xml', `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="${W}">${paras(footer)}</w:ftr>`]] : []),
    ...parts.map(([name, root, inner]) => [name, `<?xml version="1.0" encoding="UTF-8"?><${root} xmlns:w="${W}" xmlns:a="${A}" xmlns:c="${C}" xmlns:dgm="${DGM}">${inner}</${root}>`]),
  ]);
  const hold = async (spec) => {
    const items = (await extractDocx(docx(spec))).items, h = docxContentHold(items);
    if (mirror) {
      parityRuns++;
      const m = mirror.docxContentHold(items);
      if (JSON.stringify(m) !== JSON.stringify(h)) parityMiss.push(`a Word file: app ${h ? h.format : 'not held'}, mirror ${m ? m.format : 'not held'}`);
    }
    return h;
  };
  const B64_LINES = wrap(b64((SECRET + '\n').repeat(3))).split('\r\n');
  // Round 3 (OR-5): the wiring first proposed for store.ts read EVERY channel, so a hyperlink's
  // target — which the writer removes and no export carries — held the whole file.
  const eur = await hold({ body: ['MEMORANDUM', 'The right of access is in'], link: { label: 'Regulation (EU) 2016/679', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679' } });
  check(!eur, 'a memo whose words are hyperlinked to a EUR-Lex CELEX link is not held', eur?.reason);
  const zoom = await hold({ body: ['NOTICE OF REMOTE DEPOSITION', 'To attend,'], link: { label: 'Join Zoom Meeting', url: 'https://us02web.zoom.us/j/84512345678?pwd=SXFxYk1QM2JnS3pGWEJ3K1ZGdUtKZz09' } });
  check(!zoom, 'a notice whose "Join Zoom Meeting" is hyperlinked is not held', zoom?.reason);
  const linkB64 = await hold({ body: ['See the portal.'], link: { label: 'portal', url: 'https://portal.example/view?ref=' + b64('client=Jane Roe;matter=4471') } });
  check(!linkB64, 'a link TARGET carrying a base64 name is not held: the writer removes link targets (Export.tsx docxScope)', linkB64?.reason);
  // F-I-1: the rule fires on what the saved file carries.
  const body = await hold({ body: ['Please file the attached.', ...B64_LINES] });
  check(!!body && /main text/.test(body.reason) && /paragraph 2/.test(body.reason) && !quotesDoc(body), 'a base64 block pasted into the body is held, naming the main text and the paragraph', body?.reason);
  const foot = await hold({ body: ['An ordinary letter.'], footer: ['Ref:', ...B64_LINES] });
  check(!!foot && /footer/.test(foot.reason), 'a base64 block in a footer (kept in the saved .docx) is held, naming the footer', foot?.reason);
  const pem = await hold({ body: ['EXHIBIT D', ...CERT.trim().split('\n')] });
  check(!!pem && pem.format === 'pem', 'a PEM certificate in a Word exhibit is held');
  const plain = await hold({ body: ['MEMORANDUM', 'The client instructs us to settle.'], footer: ['Page 1'] });
  check(!plain, 'CONTROL: a plain memo with a footer is not held', plain?.reason);
  // Round 4 (DOCX-CHANNELS-NOT-PINNED): every channel the writer keeps, one at a time. Round 3
  // dropped each of these from DOCX_SAVED_CHANNELS in turn and the test stayed green, so an
  // attachment pasted into a header, a footnote or a chart would have shipped unheld.
  const wParas = (lines) => lines.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join('');
  const aParas = (lines) => lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join('');
  const CHANNELS = [
    ['header', 'word/header1.xml', 'w:hdr', wParas(['Ref:', ...B64_LINES]), /header/],
    ['footnote', 'word/footnotes.xml', 'w:footnotes', `<w:footnote w:id="1">${wParas(['1 See the message below.', ...B64_LINES])}</w:footnote>`, /footnote text/],
    ['endnote', 'word/endnotes.xml', 'w:endnotes', `<w:endnote w:id="1">${wParas(['i Source:', ...B64_LINES])}</w:endnote>`, /endnote text/],
    ['chart', 'word/charts/chart1.xml', 'c:chartSpace', `<c:chart><c:title><c:tx><c:rich>${aParas(['Payments', ...B64_LINES])}</c:rich></c:tx></c:title></c:chart>`, /chart text/],
    ['diagram', 'word/diagrams/data1.xml', 'dgm:dataModel', `<dgm:ptLst><dgm:pt modelId="1"><dgm:t>${aParas(['Step 1', ...B64_LINES])}</dgm:t></dgm:pt></dgm:ptLst>`, /SmartArt text/],
  ];
  for (const [kind, name, root, inner, says] of CHANNELS) {
    const h = await hold({ body: ['An ordinary letter.'], parts: [[name, root, inner]] });
    check(!!h && h.format === 'encoded' && says.test(h.reason) && !quotesDoc(h), `a base64 block in the ${kind} channel (${name}) is held, naming it`, h?.reason ?? 'not held');
  }
  // A tracked insertion is text the writer keeps and unwraps into the saved file, so it is read.
  // A tracked deletion is removed by the writer and is in no export. Hidden text is removed by
  // the writer too, but in the body it is in the text of record (docx.ts inMainFlow) that the
  // engine, the .txt and the copied text read, so there it is read (INT-1).
  const tracked = (tag) => `<w:${tag} w:id="7" w:author="Reviewer" w:date="2026-09-22T09:00:00Z">${B64_LINES.map((l) => `<w:r><w:${tag === 'del' ? 'delText' : 't'}>${l}</w:${tag === 'del' ? 'delText' : 't'}></w:r>`).join('<w:r><w:br/></w:r>')}</w:${tag}>`;
  const ins = await hold({ body: ['Please file the attached.'], raw: `<w:p>${tracked('ins')}</w:p>` });
  check(!!ins && /main text/.test(ins.reason), 'a base64 block inside a tracked insertion is held', ins?.reason ?? 'not held');
  const del = await hold({ body: ['Please file the attached.'], raw: `<w:p>${tracked('del')}</w:p>` });
  check(!del, 'CONTROL: the same block inside a tracked deletion (removed by the writer) is not held', del?.reason);
  const hiddenParas = (lines) => lines.map((l) => `<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>${l}</w:t></w:r></w:p>`).join('');
  const hid = await hold({ body: ['Please file the attached.'], raw: hiddenParas(B64_LINES) });
  check(!!hid && /main text/.test(hid.reason) && /\(from paragraph 2,/.test(hid.reason) && /hidden text, which Word does not show: Home → Show\/Hide ¶/.test(hid.reason) && !quotesDoc(hid),
    'the same block as hidden text in the body is held, and the reason says it is hidden and how to show it: the writer removes it, but the text of record the engine and the .txt read carries it', hid?.reason ?? 'not held');
  check(!!body && !/hidden text/.test(body.reason), 'CONTROL: a visible block\'s reason does not call it hidden', body?.reason);
  const hidWords = await hold({ body: ['Please file the attached.'], raw: hiddenParas(['Note to file: check the date with the client before sending.']) });
  check(!hidWords, 'CONTROL: hidden words in the body that are not encoded are not held', hidWords?.reason);
  const hidFoot = await hold({ body: ['An ordinary letter.'], parts: [['word/footer1.xml', 'w:ftr', hiddenParas(['Ref:', ...B64_LINES])]] });
  check(!hidFoot, 'CONTROL: the same block as hidden text in a footer is not held: the writer removes it and the text of record is the body alone', hidFoot?.reason);
  // Round 5 (DOCX-PARAGRAPH-NUMBER): the paragraph a hold names is Word's. Counted in lines of
  // the flow, the first letter was told "paragraph 9" and the second "paragraph 5". The body case
  // above ("paragraph 2", no breaks and no empty paragraphs) reads the same either way.
  const brPara = (lines) => `<w:p><w:r>${lines.map((l, i) => `${i ? '<w:br/>' : ''}<w:t>${l}</w:t>`).join('')}</w:r></w:p>`;
  const addr = await hold({ body: [], raw: brPara(['Ms J Client', '1 High Street', 'Greendale', 'GR1 1AA', 'United Kingdom']) + wParas(['Dear Ms Client,', 'Please see the message below.', 'It was forwarded to us.', ...B64_LINES]) });
  check(!!addr && /\(from paragraph 5, counting empty paragraphs\)/.test(addr.reason) && addr.line === 5, 'a letter whose address block is five lines joined by line breaks: the hold names paragraph 5, where the block starts', addr?.reason ?? 'not held');
  const spaced = await hold({ body: [], raw: wParas(['Dear Ms Client,']) + '<w:p/>' + wParas(['Our advice follows.']) + '<w:p/>' + wParas(['The message is below.']) + '<w:p/>' + wParas(['It was forwarded to us.']) + '<w:p/>' + wParas(B64_LINES) });
  check(!!spaced && /\(from paragraph 9, counting empty paragraphs\)/.test(spaced.reason), 'a letter spaced with empty paragraphs: the hold names paragraph 9, where the block starts', spaced?.reason ?? 'not held');
  // Round 6 (INT-22): a text box's own paragraphs were counted, so a block in a sidebar anchored in
  // paragraph 2 was "paragraph 3" — the letter's "Regards". The hold names the box and the
  // paragraph it is anchored in (docx.ts `wp`, `inBox`).
  const box = (lines) => `<w:p><w:r><w:t>Anchor text.</w:t></w:r><w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml"><v:textbox><w:txbxContent>${wParas(lines)}</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`;
  const inBox = await hold({ body: ['Please file the attached.'], raw: box(B64_LINES) + wParas(['Regards']) });
  check(!!inBox && /\(from a text box in paragraph 2, counting empty paragraphs\)/.test(inBox.reason) && inBox.line === 2 && !quotesDoc(inBox), 'a block in a text box anchored in paragraph 2: the hold names the text box and paragraph 2, not "paragraph 3"', inBox?.reason ?? 'not held');
  const afterBox = await hold({ body: ['Please file the attached.'], raw: box(['Sidebar: see the schedule.', 'Two lines of it.']) + wParas(['The message is below.', ...B64_LINES]) });
  check(!!afterBox && /\(from paragraph 4, counting empty paragraphs\)/.test(afterBox.reason) && !/text box/.test(afterBox.reason), 'CONTROL: a block after a two-paragraph text box is paragraph 4, where Word puts it, and is not called a text box', afterBox?.reason ?? 'not held');
  // Round 7 (I-EVADE-3): the hidden-text note belongs to the paragraph the hold names. Judged by
  // "does the visible text hold anywhere", a hidden block above a second, visible one was named
  // with no note, and the lawyer went to a paragraph Word shows as empty.
  const hidThenVis = await hold({ body: ['Please file the attached.'], raw: hiddenParas(B64_LINES) + wParas(['The copy we can see:', ...B64_LINES]) });
  check(!!hidThenVis && hidThenVis.line === 2 && /The encoded content is hidden text, which Word does not show/.test(hidThenVis.reason), 'a hidden block above a visible one: the hold names paragraph 2 and says it is hidden text', hidThenVis?.reason ?? 'not held');
  const visThenHid = await hold({ body: ['Please file the attached.', ...B64_LINES], raw: hiddenParas(['Hidden copy:', ...B64_LINES]) });
  check(!!visThenHid && visThenHid.line === 2 && !/hidden text/.test(visThenHid.reason), 'CONTROL: a visible block above a hidden one: the hold names the visible block and does not call it hidden', visThenHid?.reason ?? 'not held');
  // Round 7 (I-OVR-8): Word's paragraph count includes paragraphs of hidden text, which Word does
  // not show. A template with two hidden drafting notes sent the lawyer to "paragraph 5" for the
  // third paragraph they could see, with nothing to say why.
  const drafting = await hold({ body: [], raw: wParas(['Dear Ms Client,']) + hiddenParas(['Drafting note: confirm the date.', 'Drafting note: check the figure.']) + wParas(['Please see the message below.', ...B64_LINES]) });
  check(!!drafting && drafting.line === 5 && /\(from paragraph 5, counting empty paragraphs and paragraphs of hidden text\)/.test(drafting.reason) && /Show\/Hide ¶ \(Ctrl\+Shift\+8\) shows the hidden paragraphs counted here/.test(drafting.reason) && !/The encoded content is hidden text/.test(drafting.reason),
    'a block below two hidden drafting notes: the hold says its count includes paragraphs of hidden text and how to show them', drafting?.reason ?? 'not held');
  const noNotes = await hold({ body: [], raw: wParas(['Dear Ms Client,', 'Please see the message below.', ...B64_LINES]) });
  check(!!noNotes && /\(from paragraph 3, counting empty paragraphs\)/.test(noNotes.reason) && !/hidden/.test(noNotes.reason), 'CONTROL: the same letter without the notes names paragraph 3 and says nothing of hidden text', noNotes?.reason ?? 'not held');
  // Round 7 (I-OVR-7): a block in a table cell below cell labels ("Item", "Detail", "Attachment")
  // was named by the first label, three paragraphs above it.
  const cell = (ps) => `<w:tc>${wParas(ps)}</w:tc>`;
  const table = await hold({ body: ['Dear Sir,'], raw: `<w:tbl><w:tr>${cell(['Item'])}${cell(['Detail'])}</w:tr><w:tr>${cell(['Attachment'])}${cell(B64_LINES)}</w:tr></w:tbl>` + wParas(['Yours faithfully,']) });
  check(!!table && table.line === 5 && /\(from paragraph 5, counting empty paragraphs\)/.test(table.reason), 'a block in a table cell below cell labels: the hold names paragraph 5, its first line, not the "Item" label', table?.reason ?? 'not held');
  // Round 7, second pass (I-OVR-4): a gateway link in its own paragraph under a prose paragraph was
  // named by the paragraph above it.
  {
    const spec = { body: ['Dear Counsel,', '', 'The client forwarded the notice. To stop receiving these emails, click', GATEWAYS[1][1](WRAPPED[0][1]).replace(/&/g, '&amp;'), '', 'Regards,'] };
    const g = await hold(spec);
    check(!!g && /inside a link \(from paragraph 4, counting empty paragraphs\)/.test(g.reason), 'a Proofpoint link in paragraph 4 under a prose paragraph: the hold names paragraph 4', g?.reason ?? 'not held');
    const o = LINE_OFF.docxContentHold((await extractDocx(docx(spec))).items);
    check(/\(from paragraph 3,/.test(o?.reason || ''), 'CONTROL: named by where the joined word starts, the hold says paragraph 3, the prose', o?.reason ?? 'not held');
  }
  const sep = '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>';
  const fn = await hold({ body: ['An ordinary letter.'], parts: [['word/footnotes.xml', 'w:footnotes', `${sep}<w:footnote w:id="1">${wParas(['1 See the message below.', ...B64_LINES])}</w:footnote>`]] });
  check(!!fn && /footnote text contains .*\(from paragraph 2,/.test(fn.reason), 'a footnote block after Word\'s two separator footnotes: paragraph 2 of the footnote text, not 4', fn?.reason ?? 'not held');
  // The saved channels are exactly the ones the writer keeps: none of what it removes.
  const wsrc = readFileSync(join(here, '..', 'src', 'lib', 'extract', 'docxWrite.ts'), 'utf8');
  const forbidden = (wsrc.match(/const FORBIDDEN = new Set\(\[([^\]]*)\]\)/) || [])[1];
  const removed = forbidden ? [...forbidden.matchAll(/'([^']+)'/g)].map((m) => m[1]) : null;
  check(!!removed && removed.every((k) => !(k in DOCX_SAVED_CHANNELS)), 'DOCX_SAVED_CHANNELS holds none of the kinds docxWrite.ts FORBIDDEN removes', removed ? removed.filter((k) => k in DOCX_SAVED_CHANNELS).join(', ') : 'FORBIDDEN not found in docxWrite.ts');

  console.log('\n   The drop itself: store.ts ingestFile, the call Drop makes, on the same files');
  // Everything above calls the rules directly. Round 3 wrote docxContentHold and tested it while
  // nothing called it: a base64 block in a .docx body went to the engine and into both exports.
  // So the real store.ts is bundled and driven here, with only pdf.ts's two browser imports (a
  // Vite "?url" worker and the browser build) swapped for pdfjs's node build, loaded from where
  // it is installed. A second bundle has the wiring taken out, and must ship what the first holds.
  const req = createRequire(join(here, '..', 'package.json'));
  const pdfjsUrl = pathToFileURL(req.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;
  const workerUrl = pathToFileURL(req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const fontsDir = join(dirname(req.resolve('pdfjs-dist/package.json')), 'standard_fonts').replace(/\\/g, '/') + '/';
  const swap = (c, a, b, file) => { if (!c.includes(a)) throw new Error(`intake-refusal: ${file} no longer contains ${JSON.stringify(a)} — update the swap in this test`); return c.replace(a, () => b); };
  // `detectSwaps`: detect.ts as a CONTROL edits it, for store.ts and pdf.ts alike
  // `pdfSwaps`: pdf.ts as a CONTROL edits it
  const storeBundle = async (name, unwire, detectSwaps = null, pdfSwaps = []) => {
    const out = join(dir, name + '.mjs');
    const plugin = { name: 'node-pdf', setup(b) {
      b.onResolve({ filter: /^file:/ }, (a) => ({ path: a.path, external: true }));
      if (detectSwaps) b.onLoad({ filter: /extract[\\/]detect\.ts$/ }, () => ({ contents: editDetect(detectSwaps), loader: 'ts', resolveDir: dirname(DETECT_TS) }));
      b.onLoad({ filter: /extract[\\/]pdf\.ts$/ }, (a) => {
        let c = readFileSync(a.path, 'utf8');
        c = swap(c, "import * as pdfjs from 'pdfjs-dist';", `import * as pdfjs from ${JSON.stringify(pdfjsUrl)};`, 'pdf.ts');
        c = swap(c, "import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';", `const workerUrl = ${JSON.stringify(workerUrl)};`, 'pdf.ts');
        c = c.replace("standardFontDataUrl: '/pdfjs/standard_fonts/'", () => `standardFontDataUrl: ${JSON.stringify(fontsDir)}`);
        for (const [x, y] of pdfSwaps) c = swap(c, x, y, 'pdf.ts');
        return { contents: c, loader: 'ts', resolveDir: dirname(a.path) };
      });
      if (unwire) b.onLoad({ filter: /lib[\\/]store\.ts$/ }, (a) => {
        let c = readFileSync(a.path, 'utf8');
        c = swap(c, 'const encoded = docxContentHold(d.items);', 'const encoded = null as { reason: string } | null;', 'store.ts');
        c = swap(c, 'text: pdfText(p),', "text: p.pages.filter((x) => x.status === 'ok').map((x) => x.text).join('\\n\\n'),", 'store.ts');
        return { contents: c, loader: 'ts', resolveDir: dirname(a.path) };
      });
    } };
    await build({ entryPoints: [join(here, '..', 'src', 'lib', 'store.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent', plugins: [plugin], define: { 'import.meta.env.DEV': 'false' } });
    return import(url(out));
  };
  const store = await storeBundle('store', false), bare = await storeBundle('store-unwired', true);
  // A PDF built by hand: page 2 is an exhibit carrying the same 76-column base64 block.
  const pdfOf = (pages) => {
    const objs = [], font = 3 + pages.length * 2;
    objs.push('<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
    for (const lines of pages) {
      // a line given as { raw } is drawn by the content-stream operators it holds
      const content = 'BT /F1 9 Tf 40 760 Td ' + lines.map((l, i) => `${i ? '0 -12 Td ' : ''}${typeof l === 'string' ? `(${l.replace(/[()\\]/g, '\\$&')}) Tj` : l.raw}`).join('\n') + ' ET';
      objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${objs.length + 2} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    }
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
    let s = '%PDF-1.4\n';
    const off = objs.map((o, i) => { const at = s.length; s += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
    const x = s.length;
    s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
    return Buffer.from(s, 'latin1');
  };
  const marker = B64_LINES[1];
  const drop = (S, bytes, name) => S.ingestFile(new File([bytes], name));
  const shipped = (f) => typeof f.text === 'string' && f.text.includes(marker);
  const inBody = docx({ body: ['Please find the forwarded message below.', ...B64_LINES, 'Regards'] });
  const inFooter = docx({ body: ['An ordinary letter.'], footer: ['Ref:', ...B64_LINES] });
  const plainDocx = docx({ body: ['MEMORANDUM', 'The client instructs us to settle.'], footer: ['Page 1'] });
  const exhibitPdf = pdfOf([['SETTLEMENT AGREEMENT', 'The parties agree as follows.'], ['Exhibit C', ...B64_LINES], ['Signed by the parties.']]);
  {
    const f = await drop(store, inBody, 'letter.docx');
    check(f.state === 'held' && /main text/.test(f.reason || '') && !shipped(f) && !quotesDoc(f), 'a .docx with a base64 block in the body is held at the drop and its text never reaches the engine', `state=${f.state} reason=${f.reason}`);
    const g = await drop(store, inFooter, 'letter.docx');
    check(g.state === 'held' && /footer/.test(g.reason || '') && !quotesDoc(g), 'a .docx with a base64 block in the footer is held at the drop, naming the footer', `state=${g.state} reason=${g.reason}`);
    const p = await drop(store, plainDocx, 'memo.docx');
    check(p.state === 'queued' && /The client instructs us to settle\./.test(p.text || ''), 'CONTROL: a plain .docx is queued for the engine with its text', `state=${p.state} reason=${p.reason}`);
    const d = await drop(store, exhibitPdf, 'agreement.pdf');
    check(d.state === 'queued' && (d.text || '').includes('[page 2 is not included: this app could not read it]') && !shipped(d) && /The parties agree/.test(d.text || '') && /Signed by the parties/.test(d.text || ''),
      'a PDF whose page 2 is a base64 exhibit is queued without that page, and its text says page 2 is not included', `state=${d.state} text=${JSON.stringify(d.text)}`);
  }
  {
    // F-PDF-WORDS: a PDF page's hold names the content in the words the .txt and .docx holds use
    // ("inside a link", "letters written as “%”…"), says its line count skips blank space (a .txt
    // counts empty lines, a Word file empty paragraphs), and offers "to include it" only where
    // another page went through. It called a link's value a block to delete, landed a lawyer
    // counting down the page one line short, and told a one-page file how to include the page.
    const LINK = `https://news.lawfirm.example/unsubscribe?e=${b64('jane.roe@clientco.com')}`;
    const rows = ['MEMORANDUM', '', 'To stop receiving these, click', LINK, 'Thank you.'];
    const ONE = 'Held — page 1 holds encoded content inside a link, which this app cannot read, from line 3 of the page (counting only lines with text on them) — delete the link in the source, or replace it with the words it shows, and export the PDF again';
    const PAGE2 = 'Page 2 refused: encoded content inside a link, which this app cannot read, from line 3 of the page (counting only lines with text on them) — the page is left out; delete the link in the source, or replace it with the words it shows, and export the PDF again to include it';
    const PCT = 'Held — page 1 holds encoded content (letters written as “%” and two hex digits), which this app cannot read, from line 2 of the page (counting only lines with text on them) — replace those letters in the source with the letters they stand for, or delete them, and export the PDF again';
    const onePdf = pdfOf([rows]), threePdf = pdfOf([['SETTLEMENT AGREEMENT', 'The parties agree as follows.'], rows, ['Signed by the parties.']]);
    const pctPdf = pdfOf([['MEMORANDUM', 'Contact %4A%61%6E%65%20%52%6F%65 before the hearing.']]);
    const words = async (S) => ({ one: (await drop(S, onePdf, 'memo.pdf')).reason, three: (await drop(S, threePdf, 'agreement.pdf')).warnings || [], pct: (await drop(S, pctPdf, 'memo.pdf')).reason });
    const w = await words(store);
    check(w.one === ONE && !quotesDoc({ reason: w.one }), 'a one-page PDF with a link carrying an encoded address under a blank row: held in the .txt\'s words, naming line 3 and saying blank space is not counted, with no "to include it"', w.one);
    const txt = (await drop(store, utf8(rows.join('\n') + '\n'), 'memo.txt')).reason || '';
    check(/inside a link \(from line 4\)/.test(txt), '  the same rows as a .txt name line 4, counting the empty line — the count the PDF\'s words set apart', txt);
    check(w.three.includes(PAGE2), 'a three-page PDF whose page 2 carries it: page 2 is left out, and its warning says how to include it', w.three.join(' | '));
    check(w.pct === PCT, 'a one-page PDF with a name written as percent-escapes: held in the .txt\'s words for them, with their way through', w.pct);
    const OLD = "if (hold) status = `refused: ${hold.format === 'email' ? 'an email’s headers (a printed message source)' : hold.format === 'pem' ? 'an encoded certificate or key block, which this app cannot read,' : 'encoded content, which this app cannot read,'} on line ${hold.line} of the page — the page is left out; delete that block from the source and export the PDF again to include it`;";
    const was = await words(await storeBundle('store-pdf-words-was', false, null, [['if (hold) { const h = pageHold(hold, riders); status = `refused: ${h.says}`; ways.set(n, h.way); }', OLD]]));
    check(w.one !== was.one && /holds encoded content, which this app cannot read, on line 3 of the page — delete that block .* to include it$/.test(was.one || '') && was.pct !== PCT,
      'CONTROL: pdf.ts as it was holds both files as "encoded content … on line 3 of the page … to include it", with no link and no count named', `${was.one} | ${was.pct}`);
    const always = await words(await storeBundle('store-pdf-include-always', false, null, [["pages.some((p) => p.status === 'ok') ? ' to include it' : ''", "' to include it'"]]));
    check(always.one === ONE + ' to include it', 'CONTROL: with "to include it" said whatever the other pages did, the one-page file is told how to include its page', always.one);
    const never = await words(await storeBundle('store-pdf-include-never', false, null, [["pages.some((p) => p.status === 'ok') ? ' to include it' : ''", "''"]]));
    check(!never.three.includes(PAGE2) && never.three.includes(PAGE2.replace(/ to include it$/, '')), 'CONTROL: with it never said, page 2\'s warning in the three-page file no longer says what exporting again is for', never.three.join(' | '));
    const noKind = await words(await storeBundle('store-pdf-no-kind', false, [[", reason: linkReason(b64.line), kind: 'link' }", ', reason: linkReason(b64.line) }']]));
    check(noKind.one === ONE.replace(' inside a link', '').replace('delete the link in the source, or replace it with the words it shows, and export', 'delete that block from the source and export'), 'CONTROL: with detect.ts not naming the link, the PDF calls it a block to delete', noKind.one);
    // A printed message source's quoted-printable text or encoded header word is named as the .txt
    // names it, with the mail program as the way through. As "encoded content … delete that block",
    // a lawyer was sent to delete the line that carries the client's name.
    const mail = 'open the message in your mail program and print it to PDF again from there';
    const MAILS = [
      ['a letter written as "=C3=A9"', ['MEMORANDUM', 'Dear Ren=C3=A9e Roe,', 'Please find the draft.'], `Held — page 1 holds encoded content (quoted-printable email encoding, which splits words with “=”), which this app cannot read, from line 2 of the page (counting only lines with text on them) — ${mail}`],
      ['a header word written as =?utf-8?B?…?=', ['Forwarded message', 'From: =?utf-8?B?SmFuZSBSb2U=?= <j@clientco.example>', 'Please call me.'], `Held — page 1 holds encoded content (email header text written as =?utf-8?…?=), which this app cannot read, from line 2 of the page (counting only lines with text on them) — ${mail}`],
    ];
    const noMail = await storeBundle('store-pdf-no-mail-kind', false, [[", kind: 'header' };", ' };'], [", kind: 'qp' };\n  const qp = qpLetterLine(text);", ' };\n  const qp = qpLetterLine(text);'], [", so a name can escape the mask. Open the message in your mail program, save it as text, and drop that.`, kind: 'qp' };\n  return null;", ", so a name can escape the mask. Open the message in your mail program, save it as text, and drop that.` };\n  return null;"]]);
    for (const [what, rows, want] of MAILS) {
      const got = (await drop(store, pdfOf([rows]), 'message.pdf')).reason;
      check(got === want && !quotesDoc({ reason: got }), `a one-page PDF with ${what}: held in the .txt's words for it, with the mail program as the way through`, got);
      const off = (await drop(noMail, pdfOf([rows]), 'message.pdf')).reason || '';
      check(/holds encoded content, which this app cannot read, from line 2 .* delete that block from the source/.test(off), `CONTROL: with detect.ts not naming it, ${what} is a block to delete`, off);
    }
    // A footnote marker raised off its line (5 units at 9 points, as a word processor raises one)
    // is its own line to pdf.js, and the text keeps it so; the hold's count does not.
    const marked = pdfOf([['MEMORANDUM', { raw: '(See the notice.) Tj 5 Ts (1) Tj 0 Ts' }, LINK]]);
    const fn = (await drop(store, marked, 'memo.pdf')).reason || '';
    check(/inside a link, which this app cannot read, from line 3 of the page/.test(fn), 'a PDF whose link is under a line carrying a raised footnote marker: the hold names line 3, the marker counted with its line', fn);
    const counted = await storeBundle('store-pdf-riders-counted', false, null, [['const line = Math.max(1, hold.line - riders.slice(0, hold.line - 1).filter(Boolean).length);', 'const line = hold.line;']]);
    const fnOff = (await drop(counted, marked, 'memo.pdf')).reason || '';
    check(/from line 4 of the page/.test(fnOff), 'CONTROL: with the marker counted as a line, it names line 4', fnOff);
    const twoLines = pdfOf([['MEMORANDUM', 'See the notice.', '1', LINK]]);
    check(/from line 4 of the page/.test((await drop(store, twoLines, 'memo.pdf')).reason || ''), 'CONTROL: a "1" on a line of its own, 12 units down, is counted');
  }
  {
    // Round 6 (INT-1): hidden text was skipped in every part. In the body it is in the text of
    // record (docx.ts inMainFlow), which is what the engine reads and the .txt and the copied
    // text carry, so a base64 block formatted hidden went out in both. The writer removes hidden
    // runs in every part, and the text of record is the body alone, so a hidden block in a
    // footer is in neither export — the drop queues it, and both halves are shown here.
    const hiddenBody = docx({ body: ['Please find the forwarded message below.'], raw: hiddenParas(B64_LINES) + paras(['Regards']) });
    const hiddenFooter = docx({ body: ['An ordinary letter.'], parts: [['word/footer1.xml', 'w:ftr', hiddenParas(['Ref:', ...B64_LINES])]] });
    const f = await drop(store, hiddenBody, 'letter.docx');
    check(f.state === 'held' && /main text/.test(f.reason || '') && /hidden text/.test(f.reason || '') && !shipped(f) && !quotesDoc(f), 'a .docx with a base64 block as hidden text in the body is held at the drop, and says the block is hidden', `state=${f.state} reason=${f.reason}`);
    const b = await drop(bare, hiddenBody, 'letter.docx');
    check(b.state === 'queued' && shipped(b), 'CONTROL: unwired, the same .docx is queued and its hidden block is in the text the engine reads', `state=${b.state}`);
    const g = await drop(store, hiddenFooter, 'letter.docx');
    check(g.state === 'queued' && !shipped(g) && /An ordinary letter\./.test(g.text || ''), 'CONTROL: a .docx whose hidden block is in the footer is queued, and the block is not in the text of record', `state=${g.state} reason=${g.reason}`);
    const { writeRedactedDocx } = await bundle('docxWrite', join(here, '..', 'src', 'lib', 'extract', 'docxWrite.ts'));
    const same = (t) => ({ text: t, placements: [], floorHits: [], divergence: null });
    const w = await writeRedactedDocx(hiddenFooter, { mask: same });
    const out = w.bytes ? (await extractDocx(w.bytes)).items : null;
    check(!!out && w.removed.hiddenRuns > 0 && !out.some((i) => i.text.includes(marker)), 'CONTROL: the .docx the writer saves from it carries no part of the hidden footer block (every part read, hidden runs removed)', `held=${w.held} hiddenRuns=${w.removed?.hiddenRuns} carries=${out?.some((i) => i.text.includes(marker))}`);
  }
  {
    // Round 6 (INT-4), the file the finding was reproduced on: a one-page memo printed with a
    // Safe Link wrapped at 90, 110 and 130 characters was held as "no readable text". Past about
    // 106 characters a row of 9-point Courier runs off the page and pdf.js reads none of what is
    // off it, so at 110, 117 and 120 the rows of the record do not join up: those pin the
    // row-by-row reading, and the named CONTROL that it still refuses.
    const mailflow = (json) => Buffer.from('Mailflow|' + json).toString('base64').replace(/=/g, '%3D');
    const safe = (m) => `https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.sec.gov%2Fnewsroom%2Fpress-releases%2F2026-101&data=05%7C02%7Cjsmith%40firm.example%7C4f1c2d3e5a6b7c8d9e0f1a2b3c4d5e6f%7C72f988bf86f141af91ab2d7cd011db47%7C1%7C0%7C638624123456789012%7CUnknown%7C${m}%7C0%7C%7C%7C&sdata=q2Xf8nV0wYk3sT9bLr4cJm7pZ1eHd6uGa5iKo0NyQwE%3D&reserved=0`;
    const memo = (link, w) => pdfOf([['MEMORANDUM', 'RE: SEC enforcement sweep', 'The client forwarded the release:', ...link.match(new RegExp(`.{1,${w}}`, 'g')), 'We should review it before the call.']]);
    const real = safe(mailflow('{"EmptyMapi":true,"V":"0.0.0000","P":"Win32","AN":"Mail","WT":2}'));
    const named = safe(mailflow('{"V":"0.0.0000","P":"Jane Roe QQ123456C","AN":"Mail","WT":2}'));
    for (const w of [90, 110, 117, 120, 130]) {
      const m = await drop(store, memo(real, w), 'memo.pdf');
      check(m.state === 'queued' && /We should review it before the call\./.test(m.text || '') && /safelinks/.test(m.text || ''), `a one-page memo printout with a Safe Link wrapped at ${w} characters is queued with its text (S-${w})`, `state=${m.state} reason=${m.reason}`);
      const n = await drop(store, memo(named, w), 'memo.pdf');
      check(n.state === 'held' && !quotesDoc(n), `CONTROL: the same printout whose Safe Links-shaped record carries a name and an NI number is held (S-${w})`, `state=${n.state} text=${JSON.stringify((n.text || '').slice(0, 80))}`);
    }
  }
  {
    // Owner ruling 17 (I3-WRAP) at the drop: each gateway's link, as a .txt on one line and across
    // rows, as a .docx pasted on one line and one paragraph per printed row, and as a printed PDF.
    // The CONTROL drops the same files on store.ts built with this round's reading taken out of
    // detect.ts, and the link reaches the engine whole. The rows are cut at the first width from 50
    // where that CONTROL lets the link through (a 9-point Courier row runs off the page past about
    // 106). Mimecast's own link carries nothing, and the original beside it holds either way.
    const wrapOffStore = await storeBundle('store-wrap-off', false, WRAP_OFF);
    const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cut = (s, w) => s.match(new RegExp(`.{1,${w}}`, 'g'));
    const carries = (f, link) => (f.text || '').replace(/\s/g, '').includes(link);
    const AT = [WRAPPED[0], WRAPPED[0], WRAPPED[1], WRAPPED[2], WRAPPED[2], WRAPPED[0]];
    for (const [i, [gw, rewrite, offPass]] of GATEWAYS.entries()) {
      const [what, u] = AT[i], link = rewrite(u);
      const rowsText = (w) => `To stop receiving these, visit\n${cut(link, w).join('\n')}\nThank you.\n`;
      let w = 50;
      while (w < 100 && wrapOff.contentHold(rowsText(w))) w++;
      const files = [
        ['notice.txt', utf8(`To stop receiving these, visit ${link} .\n`), 'a .txt, on one line'],
        ['notice.txt', utf8(rowsText(w)), `a .txt, across rows at ${w}`],
        ['notice.docx', docx({ body: ['To stop receiving these, visit', xml(link), 'Thank you.'] }), 'a .docx, on one line'],
        ['notice.docx', docx({ body: ['To stop receiving these, visit', ...cut(link, w).map(xml), 'Thank you.'] }), `a .docx, one paragraph per row at ${w}`],
        ['notice.pdf', pdfOf([['To stop receiving these, visit', ...cut(link, w), 'Thank you.']]), `a printed PDF, rows at ${w}`],
      ];
      for (const [name, bytes, how] of files) {
        const f = await drop(store, bytes, name);
        check(f.state === 'held' && !carries(f, link) && !quotesDoc(f), `${gw}, ${what}: ${how}, is held at the drop`, `state=${f.state} reason=${f.reason}`);
        const c = await drop(wrapOffStore, bytes, name);
        if (offPass) check(c.state === 'queued' && carries(c, link), `CONTROL: without this round's reading the same ${how.replace(/^a /, '')} is queued with the link in the text the engine reads`, `state=${c.state} reason=${c.reason}`);
        else check(c.state === 'held', `CONTROL: without this round's reading the same ${how.replace(/^a /, '')} is still held: the address is in the original printed beside Mimecast's link`, `state=${c.state}`);
      }
    }
  }
  {
    const f = await drop(bare, inBody, 'letter.docx');
    check(f.state === 'queued' && shipped(f), 'CONTROL: store.ts with the docxContentHold call taken out queues the same .docx and hands the block to the engine', `state=${f.state}`);
    const d = await drop(bare, exhibitPdf, 'agreement.pdf');
    check(d.state === 'queued' && !/page 2 is not included/.test(d.text || ''), 'CONTROL: store.ts without pdfText drops page 2 with no line saying so', JSON.stringify(d.text));
  }
}

console.log('\n3. False refusals over every real text on disk');
const scan = [];
const txtDir = (d) => (existsSync(join(repo, d)) ? readdirSync(join(repo, d), { recursive: true }).filter((f) => /\.(txt|md)$/.test(f)).map((f) => ({ id: `${d}/${f}`.replace(/\\/g, '/'), name: String(f), bytes: readFileSync(join(repo, d, f)) })) : null);
scan.push(['the 99 opinions (corpus/, newcases/)', [...(txtDir('corpus') || []), ...(txtDir('newcases') || [])], true]);
scan.push(['the repo\'s own documents (*.md at the root, pii-bench/README.md)', [...readdirSync(repo).filter((f) => f.endsWith('.md')), 'pii-bench/README.md'].filter((f) => existsSync(join(repo, f))).map((f) => ({ id: f, name: f, bytes: readFileSync(join(repo, f)) })), true]);
for (const [d, what] of [['raw/oos', 'EDGAR material contracts (OOS draw)'], ['raw/round4', 'round-4 draw'], ['raw/round5', 'round-5 draw'], ['raw/round6', 'round-6 draw'], ['raw/round7', 'round-7 draw'], ['raw/pureoos', 'pure-OOS probe'], ['raw/ukprobe', 'UK probe'], ['raw/comparebench', 'compare bench'], ['raw/tab-docs', 'TAB documents as files'], ['raw/redaction-audit', 'redaction audit']]) {
  scan.push([`${what} (${d})`, txtDir(d), false]);
}
{
  const docs = [];
  for (const f of ['echr_train.json', 'echr_dev.json', 'echr_test.json']) {
    const p = join(repo, 'raw', 'tab', f);
    if (existsSync(p)) for (const d of JSON.parse(readFileSync(p, 'utf8'))) docs.push({ id: 'tab/' + d.doc_id, name: d.doc_id + '.txt', bytes: utf8(d.text) });
  }
  scan.push(['TAB: ECtHR judgments (raw/tab)', docs.length ? docs : null, false]);
}
{
  const docs = [];
  if (existsSync(join(repo, 'raw'))) {
    for (const v of readdirSync(join(repo, 'raw')).filter((d) => /^f3d-\d+$/.test(d))) {
      const jd = join(repo, 'raw', v, 'json');
      if (!existsSync(jd)) continue;
      for (const f of readdirSync(jd)) {
        const j = JSON.parse(readFileSync(join(jd, f), 'utf8'));
        const text = [j.casebody?.head_matter || '', ...(j.casebody?.opinions || []).map((o) => o.text || '')].join('\n\n');
        if (text.trim()) docs.push({ id: `${v}/${f}`, name: f.replace(/\.json$/, '.txt'), bytes: utf8(text) });
      }
    }
  }
  scan.push(['CAP F.3d opinions (raw/f3d-*/json)', docs.length ? docs : null, false]);
}
let seen = 0, held = 0;
for (const [what, docs, tracked] of scan) {
  if (!docs || !docs.length) { skipped(what, tracked ? 'expected in the repository and missing' : 'raw/ is gitignored; `node build-corpus.mjs` and the pii-bench builders recreate it'); if (tracked) fail++; continue; }
  // the mirror reads the tracked texts too; the raw/ buckets are thousands and it is the same code
  const hits = docs.map((d) => [d, (tracked ? route : detectFormat)(d.bytes, d.name)]).filter(([, r]) => refused(r));
  seen += docs.length; held += hits.length;
  check(hits.length === 0, `${what}: ${hits.length} of ${docs.length} refused`, hits.slice(0, 10).map(([d, r]) => `${d.id} — ${r.format}: ${r.reason.slice(0, 90)}`).join('\n          '));
}
{
  // The .docx fixture, through the walker, every channel: the rule store.ts would apply.
  const p = join(repo, 'app', 'extract', 'fixture.docx');
  if (!existsSync(p)) check(false, 'app/extract/fixture.docx is tracked and missing');
  else {
    const d = await extractDocx(new Uint8Array(readFileSync(p)));
    const h = contentHold(flowText(d.items));
    check(!h, 'app/extract/fixture.docx, every channel: not held', h ? h.reason : '');
    seen++; if (h) held++;
  }
}
console.log(`\n   false refusals: ${held} of ${seen} real texts (${(100 * held / Math.max(1, seen)).toFixed(2)}%)`);

// Round 3 (OR-9): a PDF whose text layer has no space glyphs reads as prose glued into one
// run per sentence, and pdf.ts drops a page contentHold holds. The same real texts with every
// space removed, through contentHold as pdf.ts applies it: the opinions, the repo's documents
// and the EDGAR draws, where round 3 found the holds. Glued whole, a CAP volume is thousands
// of 16+ character tokens and the TAB and CAP buckets take 40 s, so they are left to a
// one-off sweep: on 2026-09-23 TAB 0 of 1,268 and CAP 4 of 3,093 held, each a glued run of
// words ("MichaelMcCreanor", "SeeAluminumBrick") whose 12 bytes decode to two short Latin-1
// or CJK "words". Exempting tokens made of glued words clears them and lets through 0.9% of
// names base64-encoded in 12 bytes (0.25% at 15), so the page is dropped, with its reason.
{
  let gSeen = 0, gHeld = 0;
  for (const [what, docs] of scan) {
    if (!docs || !docs.length || /^TAB|^CAP|redaction audit|compare bench/.test(what)) continue;
    const hits = docs.map((d) => [d, contentHold(Buffer.from(d.bytes).toString('utf8').replace(/[ \t]+/g, ''))]).filter(([, h]) => h);
    gSeen += docs.length; gHeld += hits.length;
    check(hits.length === 0, `spaces removed — ${what}: ${hits.length} of ${docs.length} held`, hits.slice(0, 5).map(([d, h]) => `${d.id} line ${h.line}: ${h.format}`).join('\n          '));
  }
  console.log(`\n   glued (no-space) text layers held: ${gHeld} of ${gSeen}`);
}

console.log('\n4. The node copy of the rules gives the app\'s verdict (app/extract/detect.mjs)');
check(!!mirror, 'the mirror loads', mirrorError);
{
  let onDisk = '';
  try { onDisk = readFileSync(MIRROR, 'utf8').replace(/\r\n/g, '\n'); } catch { /* reported below */ }
  check(onDisk === mirrorSource(), 'the mirror is detect.ts as it stands, not an older copy',
    onDisk === mirrorSource() ? '' : 'regenerate it: node test/intake-refusal.mjs --sync-mirror (from app/frontend)');
}
check(parityRuns > 0 && parityMiss.length === 0, `the mirror gave the app's verdict on every case above (${parityRuns} asked)`,
  parityMiss.slice(0, 5).join('\n          ') + (parityMiss.length > 5 ? `\n          … and ${parityMiss.length - 5} more` : ''));

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped${skip ? ' (a skip is not a pass)' : ''}`);
process.exit(fail ? 1 : 0);
