// Check a built simpler-legal.exe for two things a release must not carry, each searched as
// UTF-8 and as UTF-16LE (Rust's w!() literals are stored that way, and an ASCII search misses
// them):
//   - the exit-fault test code's names (exit_guard.rs, built only with --features exit-fault);
//   - the builder's user folder (BUILDING.md §5, the --remap-path-prefix line).
// Prints the counts, never the text around them. Exit code 1 when either count is not 0.
//   node tools/exe-strings.mjs <exe>...
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FAULT_NAMES = ['simpler-exit-fault', 'SIMPLER_EXIT_FAULT', 'SIMPLER_EXIT_NO_NET', 'SIMPLER_EXIT_NO_NUDGE', 'exit-fault: '];

export function exeStrings(path, user = process.env.USERNAME || process.env.USER || '') {
  const b = readFileSync(path);
  const count = (needles) => needles
    .flatMap((s) => [Buffer.from(s, 'utf8'), Buffer.from(s, 'utf16le')])
    .reduce((n, needle) => { let i = -1; while ((i = b.indexOf(needle, i + 1)) !== -1) n++; return n; }, 0);
  const u = user.trim();
  return {
    fault: count(FAULT_NAMES),
    user: u ? count(['Users\\' + u, 'Users/' + u, 'users\\' + u.toLowerCase(), 'home/' + u]) : 0,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node tools/exe-strings.mjs <exe>...'); process.exit(2); }
  let bad = 0;
  for (const f of files) {
    const n = exeStrings(f);
    console.log(`${f}: ${n.fault} exit-fault names, ${n.user} user-folder paths`);
    if (n.fault || n.user) bad++;
  }
  process.exit(bad ? 1 : 0);
}
