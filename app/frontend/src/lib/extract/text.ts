// Plain-text family (.txt .md .csv .log): BOM/encoding detection. Browser port (TextDecoder).

// UTF-16 with no BOM: one byte of every ASCII pair is zero. Decoded as UTF-8 it reads as
// "J\0a\0n\0e", every character valid, so the unreadable-encoding hold never fires and the
// engine is handed a name with a NUL between each letter. Latin script only — CJK UTF-16 has few zero bytes, fails UTF-8 and is
// held as an unreadable encoding, which is the safe side.
function utf16NoBom(buf: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const n = Math.min(buf.length, 4096) & ~1;
  if (n < 4) return null;
  let even = 0, odd = 0;
  for (let i = 0; i < n; i += 2) { if (buf[i] === 0) even++; if (buf[i + 1] === 0) odd++; }
  const pairs = n / 2;
  if (odd > pairs * 0.3 && even < pairs * 0.05) return 'utf-16le';
  if (even > pairs * 0.3 && odd < pairs * 0.05) return 'utf-16be';
  return null;
}

export function readText(buf: Uint8Array): { text: string; encoding: string; bom: boolean; eol: 'crlf' | 'lf' } {
  let encoding = 'utf-8', offset = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) { encoding = 'utf-8'; offset = 3; }
  else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) { encoding = 'utf-16le'; offset = 2; }
  else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) { encoding = 'utf-16be'; offset = 2; }
  else encoding = utf16NoBom(buf) || 'utf-8';
  const text = new TextDecoder(encoding).decode(buf.subarray(offset));
  const eol = text.includes('\r\n') ? 'crlf' : 'lf';
  return { text, encoding, bom: offset > 0, eol };
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}
