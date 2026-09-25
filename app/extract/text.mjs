// simpler.legal — W3 extraction layer, plain-text family (.txt .md .csv .log).
// Deceptively simple; the real work is encodings and structure preservation:
// BOM detection (UTF-8/16LE/16BE), line-ending preservation, and the guarantee that
// in-place span masking keeps a CSV structurally valid (same row/column shape).

// UTF-16 with no BOM: one byte of every ASCII pair is zero. Read as UTF-8 it is "J\0a\0n\0e",
// every character valid, so a name reaches the rules and the engine with a NUL between each
// letter and no name rule matches it. The same test as the app's text.ts; Latin script only —
// CJK UTF-16 has few zero bytes and fails UTF-8, which is held, the safe side.
function utf16NoBom(buf) {
  const n = Math.min(buf.length, 4096) & ~1;
  if (n < 4) return null;
  let even = 0, odd = 0;
  for (let i = 0; i < n; i += 2) { if (buf[i] === 0) even++; if (buf[i + 1] === 0) odd++; }
  const pairs = n / 2;
  if (odd > pairs * 0.3 && even < pairs * 0.05) return 'utf-16le';
  if (even > pairs * 0.3 && odd < pairs * 0.05) return 'utf-16be';
  return null;
}

// Decoded with TextDecoder, as text.ts decodes, so the two cannot differ on a stray odd byte
// (Buffer.swap16 throws on one; TextDecoder writes U+FFFD, as the app does).
export function readText(buf) {
  let encoding = 'utf-8', offset = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) { encoding = 'utf-8'; offset = 3; }
  else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) { encoding = 'utf-16le'; offset = 2; }
  else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) { encoding = 'utf-16be'; offset = 2; }
  else encoding = utf16NoBom(buf) || 'utf-8';
  const text = new TextDecoder(encoding).decode(buf.subarray(offset));
  const eol = text.includes('\r\n') ? 'crlf' : 'lf';
  return { text, encoding, bom: offset > 0, eol };
}

// In-place span masking (the shape the engine produces): replace [start,end) ranges with tags.
// Longest-first, non-overlapping — mirrors the engine's document-wide propagation contract.
export function maskSpans(text, spans) {
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const s of sorted) out = out.slice(0, s.start) + s.tag + out.slice(s.end);
  return out;
}

// Structural check for CSV: same row count, same column count per row, quoting intact.
export function csvShape(text) {
  const rows = text.replace(/\r\n/g, '\n').split('\n').filter(r => r.length);
  return rows.map(r => {
    let cols = 1, inQ = false;
    for (let i = 0; i < r.length; i++) {
      if (r[i] === '"') inQ = !inQ;
      else if (r[i] === ',' && !inQ) cols++;
    }
    return cols;
  });
}
