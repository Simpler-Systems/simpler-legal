# OPS_LEDGER — infrastructure misses get named

Same policy as the harness family's BOM-character and 10-minute-cap entries: when
infrastructure fails, the failure gets a dated entry with a measured rate — not a shrug.
Corpses are counted from the journal, never inferred from summaries. This matters more as
swarms scale: the med labeling run will be bigger than legal's, and per-agent failure rates
compound with swarm size.

*A path that starts `scratchpad/` names a working file of the development sessions. Those
files are not in this repository.*

**Standing check after every swarm run:** count `started` vs `result` entries in the run's
`journal.jsonl`. Any gap = one entry here, with the rate. A "0 failed" summary does not close
the check; only the journal does.

---

## 2026-07-21 — oos-gold-labeling swarm: 1 dead agent / 301 (0.33%), masked by the summary

- **Run**: `wf_dee4329a-09d` (dual Sonnet labelers + adjudicator × 100 OOS docs, 301 agents,
  21.6M subagent tokens, ~81 min).
- **Corpse**: `label-A:us-opinion-08.txt` died on a transient auth error ("Not logged in")
  mid-run; the other 300 agents were unaffected.
- **The miss that matters**: the workflow's own summary reported **100/100 labeled, 0
  failed** — the adjudicator for that doc silently proceeded with one labeler and wrote
  `labelers: 2` into the gold file. Summary reassured; journal (301 started / 300 results)
  held the truth. Detection discipline: trust disk and journal counts over return payloads.
- **Repair**: workflow resume-from-cache re-ran exactly the dead labeler + its adjudicator
  (298 agents replayed from cache). Gold file for us-opinion-08 regenerated dual-labeler.
- **Watch-item for the med run**: at 0.33%/agent, a 1,000-agent swarm expects ~3 corpses.
  If a future run shows materially more than that rate, the auth/transport layer gets
  investigated before the run's outputs are trusted. Adjudicator prompts should also carry a
  "state how many labeler inputs you actually received" field so the gold files can't
  overreport their own provenance again.

## 2026-07-21 — workflow resume: 3/301 cache hits (~1%) where ~299 were expected

- **Run**: resume of `wf_dee4329a-09d` to repair the one dead labeler. Expectation: ~2 fresh
  agents, rest replayed from cache. **Measured** (journal: 599 started / 598 results, i.e. 298
  new starts; run-1's corpse remains the only started-without-result): 298 agents re-ran fresh,
  3 cache hits, 22.85M further subagent tokens, ~83 min. Treat workflow resume as
  potentially full-cost until cache-hit behavior is verified on a small run first — budget the
  med swarm accordingly.
- **Run-2 corpses: 0.** Combined corpse rate: 1/599 agent executions (0.17%).
- **Accidental replication, measured**: two full independent labeling passes over identical
  docs. Corpus-level: 7,402 → 7,378 entities (−0.3%), DIRECT 696 → 687 (−1.3%), median
  inter-labeler agreement 0.609 → 0.595 — stable. Per-doc: entity counts swing up to ±25%
  (us-opinion-03: 147 → 111) and per-doc agreement is noisy across runs (one doc went 1.0 → 0,
  another 0 → 1.0). Lesson for scoring: corpus-level label statistics are trustworthy;
  single-doc label sets are one sample of a distribution, so per-doc engine scores carry
  label noise and only aggregate scores are decision-grade.
- **Summary-vs-disk drift again**: run-2 return payload claimed 7,372 entities; the written
  files hold 7,378. Same rule as entry 1: the disk is the record; summaries are advisory.
- **Disposition**: run-2 files are the gold set (every doc dual-labeler, adjudicated,
  span-verified). Run-1 outputs survive only in the run journal + conversation record.

## 2026-07-22 — machine sleep killed the llama-server + substrate run at 22/101

- **What happened**: laptop display-off/sleep while unattended killed both background
  processes (server + the 101-doc frozen-v1 substrate run). Not operator action. simpler-red's
  own long runs survive this because red bakes a keep-awake into its monitors; our runs had
  no such guard.
- **Cost**: none to correctness (fail-closed per doc: 22 completed docs banked with tables,
  zero partial writes), ~79 docs of model time deferred. Resume list written
  (`pii-bench/tab-dev-rest-remaining.json`) — restart is one command, no rework.
- **Mitigation (standing)**: long model runs on this box get a keep-awake — either red's
  mechanism or `powercfg /change standby-timeout-ac 0` for the run's duration — checked
  BEFORE launch, same class of pre-flight as the server health check.
- **Second occurrence (2026-07-22 night)**: server + fresh .7 checkpoint killed again at
  25/127 while owner slept — lid-close suspected (red Q6: lid overrides all timers; AC idle
  timer already 0). Mitigation now deployed within session authority: a process-scoped
  `SetThreadExecutionState(ES_CONTINUOUS|ES_SYSTEM_REQUIRED)` keep-awake guard runs beside
  long jobs (the documented Windows API for programs holding the system awake — temporary,
  dies with the process, not a settings change). HONEST LIMIT: this does not survive
  lid-close on most laptops; if the run dies a third time, the fix is physical (lid open /
  external power policy), owner-side. Fail-closed banking again lost zero completed docs.
- **ROOT CAUSE RESOLVED (2026-07-23, owner report)**: the machine **crashed and Windows
  auto-updated** overnight — a forced update reboot, which no power timer, keep-awake API,
  or lid policy can survive. All three kills + the guard's death are one cause. Standing
  mitigation for future overnight runs: check `Get-WindowsUpdate`-pending state (or defer
  active hours) before multi-hour launches; fail-closed banking remains the real protection
  (three kills + one crash, zero completed docs lost, resume always one command).
- **Silver lining, measured**: the 22 banked docs served as a first-contact mini-checkpoint —
  v1-legal.4 on never-seen docs: DIRECT 100/gate 100 (perfect transfer), NO_MASK 79.5 (holds),
  QUASI 68.6 (−7.5 vs slice — decomposed to COVERAGE DEBT, not rail overfit: existing rails
  transfer at full strength; the unseen docs are ~2× heavier in the four uncaught classes).

## 2026-07-23 — GPU server death mid-run; engine degraded silently (v2 first full run)
Server on :49400 (inherited from a prior session) died after doc 10/100; sweeps' per-call
try/catch swallowed every failure, so 40 docs were written with ZERO model calls while
looking like v2 outputs — caught only by started-vs-results accounting in _v2run.json
(10 model-complete vs 40 with 0 calls). Fixes: (a) apply-v2 now health-checks after any doc
with failed calls and ABORTS (exit 3) instead of degrading; (b) server lifecycle owned by
the run session, not inherited. Rate: 40/100 docs (40%) silently degraded before the check.

## 2026-07-23 — thinking-mode regression on ad-hoc server relaunch (v2 recovery chain stall)
The recovery relaunch passed the pinned flags via PowerShell Start-Process; the
chat-template-kwargs JSON quoting mangled in transit and the server came up WITH thinking
enabled — every L-C YES/NO probe burned its 4-token budget on reasoning_content and returned
EMPTY content (finish_reason: length). The chain "ran" at ~0 docs/hour: model up, GPU busy,
zero verdicts. Caught by probing the completion endpoint directly (health said ok — health
is NOT a contract check). Fixes: (a) a committed launcher script is now the ONLY launch
path, quoting frozen in the file (it lived at raw/tools/launch-server-49400.cmd at the time
of this incident; shipped as tools/launch-server.cmd + .sh on 2026-07-25, when raw/ being
gitignored was found to mean the frozen launcher never reached a clone at all);
(b) lesson: after any server (re)launch, probe ONE
completion and assert content is non-empty before starting a run. Rate: 1 of 1 ad-hoc
relaunches produced a silently broken server.

## 2026-09-12 — shell layers ate the backslashes: a regex that parsed, ran, and matched nothing

Same family as the two entries above (quoting mangled in transit, thing comes up silently
broken), one layer deeper: this time the corruption was INSIDE a source file that then
shipped into the build.

- **What happened**: `PARTIAL_SCOPE` in `facets.mjs` — the regex that decides whether an
  appeal was decided only *in part* — was authored through a Bash-heredoc → Python string
  chain. Each layer consumed one backslash, so all **10 of 10** word-boundary escapes on
  that line arrived as literal **backspace bytes (0x08)**. The regex still PARSED and still
  RAN. It matched nothing.
- **Consequence**: `c3-patent-new.txt` — a judgment the court **affirmed in part and reversed
  in part** — classified as `stands` and painted **green** on the map, i.e. the viewer told a
  litigator at a glance that a half-reversed decision had been upheld. 1 case of 99 wrong;
  the worst possible failure mode for this feature, because the output looked confident.
- **Detection**: not by any test. By noticing that WIDENING the regex moved the
  classification the wrong way, then dumping `PARTIAL_SCOPE.source` through a temporary
  export. A regex that silently matches nothing has no symptom until you compare it against
  a case whose answer you already know.
- **Repair**: the line was rewritten from a node **script file** created with the Write tool
  — zero shell layers between the intended bytes and the disk. All files edited in that
  session were then scanned: `facets.mjs` only, one line, 10 bytes.
- **Guard (shipped, and proved to fire)**: `graph.mjs selftest` now (a) scans `facets.mjs`
  for stray control bytes and fails the build naming the count, and (b) asserts
  `outcomeClass` reaches all three values on five fixed sentence shapes, including the
  hyphenated `affirmed-in-part and reversed-in-part` spelling that was the original miss.
  Verified by injecting one 0x08 back into the file: exit 1, named failure. Selftest 12/12,
  facets guard corpus 40/40.
- **Second defect found while chasing the first** (a real logic bug, not a transport one):
  `operativeVerbHits` dropped `reversed` from *"the judgment is affirmed-in-part and
  reversed-in-part"* — only the first participle sits adjacent to its `is`, so the
  coordinated second one failed the passive rail. Fixed with same-sentence `and`/`or`
  coordination tracking; guard case added. Blast radius measured: 1 case reclassified,
  0 extracted spans changed, 0 other verb sets changed.
- **Standing rule**: source text containing backslashes, regexes, or CSS **is never authored
  through a shell heredoc or a nested string layer** on this box — it is written to a file by
  a file tool, or emitted by a node script that was itself written by a file tool. Every such
  script ends by refusing to write if its output contains control bytes (the pattern is in
  `scratchpad/outcome-ui.mjs` and its siblings). Rate: 1 of 1 regex lines authored through a
  shell→Python chain arrived corrupt, at 100% of its escapes.

## 2026-09-12 — the taskbar shipped a logo the app no longer used, and nothing could have noticed

Reported as "the logo is still super low fidelity on the task bar" — the second time, so the
first attempt had not touched the cause. It turned out to be three faults stacked, and only
the third was the one I had been looking for.

**Fault 1 — `icon.ico` contained two different drawings.** Every entry at 48px and below held
an older revision of the mark (heavier cross, no tail, a different kite silhouette); only 64px
and above held the current logo. The taskbar draws 24-48px, so the taskbar had been showing a
logo the app stopped using. `32x32.png`, `Square30x30Logo.png` and `Square44x44Logo.png`
carried the same stale drawing.

Detection was not by looking — at 36px both revisions are a yellow diamond with a dark X, and
the difference reads as "a bit soft". It was by measuring one quantity that resampling cannot
change: at 48px the tail is 2.53 device px wide, far too wide for any filter to erase, yet the
48px entry had **0 gold pixels in the bottom 14% of the square** and the 64px entry had 35.
A file whose lower half has a tail and whose upper half does not is not a rendering artefact.

**Fault 2 — the size this machine actually asks for was absent.** Windows requests the taskbar
icon at 24px at 100% DPI, 30 at 125%, **36 at 150%**, 42 at 175%, 48 at 200%. The old file held
16, 20, 24, 32, 40, 48, 64, 96, 128, 256 — no 30, no 36, no 42. This box runs at 150%
(`AppliedDPI=144`), so Windows was rescaling a neighbour by a non-integer factor, on top of a
bitmap that was already the wrong drawing. The reporter's own display was the worst-served
case in the file, which is why it kept looking wrong after a fix aimed at 24px.

**Fault 3 — sub-pixel features.** Measured against the 168-unit viewBox, the current drawing's
cross stroke lands at 0.81px at 16px and 1.22px at 24px, and the tail at 0.84px and 1.27px. A
sub-pixel feature does not render thin, it renders as a grey smear: at 16px the cross never
reached its own navy at all (darkest luminance 67, against a stroke navy of 45 and a gold of
172). So the obvious repair — regenerate the icons from the current SVG — would have made the
taskbar **worse**, dropping cross weight from the stale art's 30-35% of the kite to 17-23%.
That is the trap this entry exists to record: the naive fix scores as a fix and ships a
regression.

**Repair.** `build-icons.mjs` at the repo root rasterizes a per-size rendition rather than
downscaling one master, under one stated rule: no feature may be thinner than
`FLOOR(N) = 1 + 0.035N` device pixels at icon size N, and where the drawing already exceeds
that it is used untouched. The cross is thickened via stroke-width, the tail by stroking it in
its own gold; nothing is moved, rescaled or recoloured. The rule is a no-op from 64px up —
which is exactly where the stale-art boundary sat, so nothing above 64px changed. The tail is
dropped below 30px, stated rather than hidden: reaching the floor there needs a boost of more
than a third (1.45x at 24px, 1.85x at 16px) and renders as a blob fused to the kite's lower
tip. Sizes now 16, 20, 24, 30, 32, 36, 40, 42, 48, 64, 96, 128, 256.

**Verified**: 13 frames read back by the WPF ICO decoder (GDI+ `System.Drawing.Icon` mangles
PNG-payload entries and misreports the 256px frame — it does so for the OLD file too, so it is
not a usable check here); pixels land verbatim on `#D4AF37` and `#16324F` at 24px; tail ink 0
below 30px and non-zero at 30+ at every size, i.e. one drawing throughout; 64/96/128/256
unchanged within 0.1pt of their previous heft.

**The guard**: `node build-icons.mjs check` regenerates in memory and byte-compares against
what is on disk, exit 1 on any mismatch. Proved to fire by restoring the stale `32x32.png` —
"1 of 17 icon files do not match favicon.svg", exit 1 — and to pass once restored. The
generator also refuses to run at all if `favicon.svg` stops matching the geometry it knows how
to re-render, rather than silently emitting last year's shapes.

**Standing rule**: a binary asset derived from a source file in this repo gets a generator and
a `check` mode, or it will eventually stop matching its source and no one will find out from
looking at it. Three of the sixteen icon files had silently diverged and the app had shipped
that way.

**Not fixed**: `app/src-tauri/icons/android/**`, `ios/**` and `icon.icns` are outside this
generator. Checked rather than assumed — at 162px and 192px the android launchers do carry the
current drawing, so they are not stale the way `icon.ico` was; what they lack is the floor
rule, so their own small sizes have fault 3 and not faults 1 or 2. Neither platform is a
target in `tauri.conf.json`, and android launchers need a different composition anyway
(foreground layer with safe-area padding, plus a round variant). Named here so the limit of
what was repaired is on the record.

**Incomplete (2026-09-25).** The running window used only the first frame of the file, which
was the 16px one, so this repair never reached the taskbar button. See the 2026-09-25 taskbar
entry below.

(An earlier draft of this entry asserted android was stale. It is not — the 49px launcher has
no tail for the same sub-pixel reason every 49px rendition does not, which is exactly the
confusion fault 1 was hiding behind. The tail test only discriminates above ~64px.)

## 2026-09-13 — the engine service wrote the unredacted document and its key, and deleted neither

The History screen said: *"nothing is written to disk except your exports."* `serve-legal.mjs`
had been writing, per request, `raw/stripped/_serve/<id>/` containing the UNREDACTED document
(`doc.txt`), the part-masked intermediates, and `sub-tables/doc.txt.json` — the span -> tag
key, i.e. the one file that un-redacts the output. A grep for `rm(|rmSync|unlink` across the
file returned nothing. Three trees from **2026-07-24** were still on disk on 2026-09-13, fifty
days later:

| tree | files | raw doc | key |
|---|---|---|---|
| `mryr7b9f-1` | 8 / 59K | 8,669 bytes — EDGAR EX-10.2, an ITW severance letter | 28 spans |
| `mryr9kqz-2` | 10 / 156K | 26,230 bytes — `[2021] SGHCF 3` | 62 spans |
| `mryspuy1-3` | 8 / 215K | 50,117 bytes — EDGAR EX-10.1 | 68 spans |

The middle one is a Singapore eLitigation judgment — non-redistributable, and the very family
this repo deliberately withholds from the shipped gold. `raw/` is gitignored and nothing under
it was ever tracked, so this never reached a commit; it was local disk, indefinitely.

**Why the files exist at all.** The frozen chain is a chain of COMMITTED SCRIPTS that read and
write FILES; running it without re-implementing it — the entire point, byte-identity by
construction — means the document has to land on disk. `strip-batch.mjs` reads
`--srcdir/--files`; every `apply-*` stage reads the stage before it; `apply-v2/ln/lq` all take
`--orig <dir>` and re-read the original at every stage, so it cannot even be deleted early.
The files are not the defect. Never deleting them was.

**Why it was not moved to `os.tmpdir()`.** `strip-batch.mjs` resolves its output as
`join(ROOT,'raw','stripped',OUT)` and is FROZEN (`FREEZE.md`), so `--out` cannot name an
absolute path and the tree cannot move without editing a frozen file. It stays where it was,
and deletion is what makes it safe rather than the address. `serve-legal.mjs` itself is not in
the freeze scope — the freeze names the engine, rails, sweeps, profiles, instruments,
`strip-batch.mjs`, `apply-*.mjs`, `locate-model.mjs` and the launch scripts; the adapter that
hosts them is not among them.

**The repair.** Three layers, because the first two each have a case they cannot cover:

1. `strip()` is wrapped in `try/finally`; the tree is discarded whether the run returned,
   threw, or the client hung up mid-stream.
2. `discard()` retries (Windows refuses the unlink while a child holds a handle) and then
   CHECKS with `existsSync`. An rm that failed quietly is the original defect with extra
   steps, so both failure branches name the directory and say what is in it.
3. A **boot sweep** removes anything under `_serve` before the port opens. This is the
   guarantee — it is the one path a killed process cannot skip.

The `done` line now carries `scratchRemoved`, and a failed removal also emits an `{error}`
line: the app refuses the result and falls back to the in-webview core, which writes nothing.
A field the client could silently ignore would have reproduced the defect one layer up.

**The Windows finding that changed the design.** The first version leaned on a `SIGINT/SIGTERM`
sweep. Measured, on this box: a signal sent to a child by another process runs **no handler at
all** — `SIGTERM`, `SIGINT`, `SIGBREAK` and `SIGHUP` each terminate through `TerminateProcess`
with `exitCode` null and `signalCode` set, and not even the `process.on('exit')` hook fires.
The shutdown sweep is therefore a courtesy for a console Ctrl-C and for POSIX hosts, and the
test that asserted it now asserts the opposite: the tree SURVIVES a hard kill, and the next
boot is what removes it.

**Verified**, 15/15 then 8/8 against the real service, no mocks inside the module (llama
stubbed so the chain will run):

- boot sweep removed the three real trees, 3/3, and said so — this is also the deletion the
  owner authorised, performed by the fix itself rather than by hand;
- a run that THROWS (`substrate failed: … INCOMPLETE — no output written (fail-closed)`)
  leaves nothing behind;
- a hard-killed service leaves its tree, and the next boot removes it 1/1;
- a directory locked by another process's CWD makes `discard()` return **false**, name the
  path, and say it holds the unredacted document and the span-to-tag key — the fail-loud path
  exercised, not assumed (it was the branch that used to print only the errno, found by the
  test, fixed);
- a run that SUCCEEDS returns `scratchRemoved: true` with `_serve` empty.

**The residue, named rather than papered over**: a service hard-killed and never started
again leaves one tree until the next boot. Sweeping periodically does not help — inside a
live process the `finally` already covers it — and sweeping from outside the service would put
the guarantee in a second place. It is one tree, and the next run removes it.

**Observed while verifying, not fixed here**: the frozen chain's spans absorb trailing
newlines, so `EX-10.2\n\nExhibit 10.2\n -> [Id1]` glues the following line onto the tag
(`[Id1]August 8, 2013`, `[Address1]Dear Ron:`). Same symptom family as the app-layer
corruption under B2 below, but a different layer — this one is inside the freeze.

### The blocker register (2026-09-12 audit `ww4bvl3p2`, 44 agents started / 44 results / 0 empty / 0 errors)

Recorded here because until now B2, B5 and B9 existed only in conversation, which the standing
rule forbids. B1 is closed by this entry; B2–B9 are closed by the entry that follows it
(2026-09-13, "eight blockers"), each with its measured check.

- **B2 `export-byte-divergence`** — the structured floor (`engine.ts:289`, `maskWithTable(out, [])`,
  and `lib-core/anonymize.mjs:434-441` ending in `floorMask(out)`) is invisible to every
  counting, key and scope surface, producing four shipped falsehoods and text corruption
  (`card [card]on the day`, `9[phone]`).
- **B3** — Settings claims the model is "checked against Google's original before it ever runs";
  `main.rs` is 13 lines with no `invoke_handler` and no hashing crate, and the launch script
  omits `--verify`, so the fail-closed guard cannot fire.
- **B4** — Compare pairs a deletion with an unrelated insertion positionally and prints
  "0 added · 0 removed".
- **B5 `unredacted-channels`** — tracked insertions in header/footer/footnote/endnote/glossary
  are promoted into the exported body under a warning computed from the same broken
  classification.
- **B6** — the forensic list prints a true count, renders 12 rows, and marks no remainder.
- **B7** — Find credits the engine for rows no engine produced; protected terms render
  "Uncategorised".
- **B8** — network Destinations truncates at 24 silently, only when it matters.
- **B9 `packaged-mode`** — the packaged app cannot write any file and blames the user's folder;
  `capabilities/` is absent and there is no dialog plugin.

The audit's own scope caveat: **both engine ports were dead for every lane it ran**, so entity
detection was never observed running. Nothing above is a claim about detection quality.

## 2026-09-13 — eight blockers B2–B9 closed; two defects found by the verification itself

Uncommitted working tree, local only. Every claim below has the check that produced it; the
scratch suites live in the session scratchpad (`b2-remask.mjs`, `b4-compare.mjs`,
`b8-netmeter.mjs`, `drive-b2b9.mjs`, `drive-b6.mjs`, `many-comments.mjs`) and are reproducible
from the commands named. Started-vs-results: 9 checks run, 9 results, 0 empty.

**B2 — the structured floor is accounted for** (`app/frontend/src/lib/engine.ts` `remask`,
`applyFloor`, `syncFloorRows`; consumers Review/Export/Find/App). The floor pass now runs
twice: a reference run that must equal `collapseAdjacentTags` + lib-core `floorMask` byte for
byte (or the export is HELD with `divergence` set and every count zeroed), and the shipping run
on the identical match set with exemptions (a dead floor row) and two emission repairs. Floor
rows appear in the table as safety-net rows (`src: structured-floor`, one tag per kind), the
receipt counts them separately, the name key lists them under a note that they cannot be
reversed by tag alone. `b2-remask.mjs` **51/51**: the sample NDA is byte-identical to the
audit-era path; fuzz 3000 random texts × tables: 0 divergences, placements + hits rebuild the
bytes 3000/3000, tags-in-bytes = placements + floor tags 3000/3000, 0 tokens readable that the
frozen core hid, 1445 byte-identical, 1555 differ only on a named repair (card rule swallowed
its separator 667, stray digit before `[phone]` 811, long run the core split into
`[number][phone]` 77), 0 unexplained. Browser (`drive-b2b9.mjs`, sample NDA): "Leave visible"
on the table's phone row → toast names the safety-net pattern, a `[phone]` safety-net row
appears, the redacted pane shows `[phone]`; "Leave visible" on that row → the number is readable;
Export reads *15 found (1 by the safety-net pattern). You redacted 11 of them — 13 tags in this
file. 3 left readable, 1 masked anyway* and the receipt *13 tags placed (12 from the table, 1
safety-net)*.

**Two defects the suite found in my own B2 code before it shipped, both fixed:**
- a run of THREE or more identical adjacent tags (`A B C` all `[Person1]`) tripped the
  fail-loud hold — the merge condition compared the run head's end with the cursor, so the
  chain broke after the first pair and the inline merge no longer reproduced the regex's
  pass-after-pass fold. Fixed by growing the head placement's `e` through the run; runs of
  3/4/5/9 now fold to one placement with n−1 merged, equal to the regex, no hold.
- forward digit absorption (digits AFTER a match joining the tag) could swallow the start of
  the core's next email match (`lim@example.com123@x.com`: core `[email][email]`, app would
  have printed `[email]@x.com`) — masking LESS than the frozen core. Removed: nothing is
  absorbed after a match. Every digit rule ends on `\b` so none can be followed by a digit;
  only the email rule can, and `[email]123` is now emitted exactly as the core emits it.

**B3 — the model claim is measured, not asserted.** Settings → Engine has four states
(browser preview: cannot see the file, says so and names the launcher's check; not found;
verified with the pin; hash mismatch → "will not be used") plus a "Check now (~15 s)" button
bound to `model_check(true)`. Both launchers run `node locate-model.mjs --path --verify`
and exit 2 on a mismatch; **the llama-server invocation lines are byte-unchanged** (git diff
shows only the `echo` lines gained the check word — FREEZE.md names the launchers, and the
frozen part is that argv). Measured: `node locate-model.mjs --path --verify` → prints the
canonical path, exit 0, **9.06 s** on this machine (the "~15 s" in the button label is an
upper estimate; left as is).

**B4 — Compare no longer strikes through an unrelated paragraph.** Positional del/ins
pairing is gated on word-bag Dice similarity ≥ 0.5 (`PAIR_MIN`); below it the pair is listed
as removed + added, and a rewrite prints "N% of its words kept". `b4-compare.mjs` **13/13**:
rewrite stays a rewrite, unrelated same-slot → `removed added` with `0 changed`, mixed run →
`changed removed added`, Dice exactly 0.5 is a rewrite and 0.25 is split, fuzz 400: no
`changed` block below the gate, counts always add up.

**B5 — no channel is promoted into the body.** The walker emits `kind` = part channel only
with `rev`/`hidden` as flags; the store's page text is `inMainFlow` (body, not a deletion);
`customXml/` is its own channel. `node app/extract/test.mjs` **ALL GREEN** (11 scanned · 6
structural · 2 binary-flagged · 0 unrecognized, 25 items); `b5-ts.mjs` 23/23 (TS walker,
prior session). Browser (`drive-b6.mjs`, a docx with a customXml part): the Export scope
line reads *tracked deletions, image alt-text, comments, custom XML data were read and are
not in it*.

**B6 — the forensic list marks its remainder.** First 12 rows, then a `<details>` fold.
Browser, a docx with 19 forensic items (15 comments + del + ins + hidden + alt-text, walker
count 19): summary reads *7 more not shown above — open to see all 19*, 7 rows inside the fold.

**B7 — Find credits nobody it should not.** `lib/categories.ts` is the one label table
(includes `protected` → "Protected terms"); Find's index counts origin per row and states
it. Browser, sample NDA: *15 from the sample document's fixed demo list — no engine marked
any of them*.

**B8 — the destination list says when it is cut.** `HOST_CAP` 256 (was 24, silent);
`unlistedRequests`, `hostsDropped`, `hostsComplete` are reported by every surface that
prints the list. `b8-netmeter.mjs` **10/10**: 300 hosts → 256 listed + 44 dropped, a later
30-host window lists all 30, the 4000-event cap flips `hostsComplete`. Browser: the network
record renders (0 off-machine; 3 loopback destinations).

**B9 — the packaged shell has commands.** `main.rs` registers `write_text_file` and
`model_check` (bounded search mirroring `locate-model.mjs`, streamed SHA-256, `error` when
a hash cannot run), `tauri-plugin-dialog` is initialised, `capabilities/default.json` grants
`core:default` + `dialog:allow-save` only. `cargo check` **exit 0 in 52 s**. NOT measured: a
packaged build (`bundle.active: false`, no `tauri build` was run) and therefore no packaged
save was exercised; `server_start`/`server_status`/`complete_local` remain unimplemented, so
the packaged engine is still offline — FREEZE.md shelf item 7, unchanged by this entry.

**Also corrected while verifying:** Export's *every row in this table is one you added by
hand* (printed when no engine run is recorded) was false the moment a safety-net row existed;
it now counts origins (browser: *no row in this table came from an engine: 1 from the
safety-net pattern*).

**Toolchain results for the batch:** `tsc --noEmit` exit 0; `graph.mjs selftest` 12/12 +
facets 40/40 + verbatim 99 files; `build-icons.mjs check` 17/17; both browser drives 0 page
errors (5 console `ERR_CONNECTION_REFUSED` = the engine port is down in this preview, expected).

**Observed, not fixed here:**
- inside the freeze: `+65 6438 2210-987654321` → the card rule (runs before phone) eats
  `2210-987654321` as `[card]` and leaves `+65 6438` readable; `lim@example.com123` leaves
  `123` readable. Both are the frozen core's bytes; the app reproduces them (separator
  repaired) and does not mask less.
- a run of more than 256 identical adjacent tags folds fully inline but the frozen regex
  (8 passes) would not — that would trip the fail-loud hold, by design.
- the walker emits one item per `w:t` run and the store joins runs with a space; forensic
  rows are per run (B6 counts runs, and says so in its footnote).
- Playwright's pre-hover hit test reports the tag chip over the hover-revealed row buttons
  (`.eacts` is `pointer-events:none` until `:hover`/`:focus-within`); drives must
  `dispatchEvent('click')`. A person hovers first; keyboard reaches them via focus-within.
- carried: the `app/extract/eng.traineddata` line in `NOTICE`/`THIRD_PARTY_NOTICES.md` is
  still false; the sanitised distributable tree does not exist yet.

## 2026-09-13 — steps 1–6: Rust organs, real-document trial, .docx out, practice floors, the distributable tree

Owner order: "ok go all steps 1-6". Nothing committed, nothing pushed. Engine frozen
throughout (`FREEZE.md`): no engine, rail, sweep, profile, instrument or launcher argv line
was touched; `serve-legal.mjs` (the adapter, not frozen) was. Assumptions I made under that
order, stated here because nobody confirmed them: the Node-sidecar recommendation for the
Rust organs is treated as accepted; the Vulkan llama.cpp build sits in the `llama-cuda/`
slot (folder name historical; no CUDA library is in it); Word COM is a STAND-IN for a
person opening the files; the app's native Save dialogs were completed programmatically;
a clean Windows profile cannot be tested from this machine.

**Step 1 — a packaged build exists (dev tree).** Tauri 2.11.5 / wry 0.55.1 / rfd 0.16.0,
nsis `installMode: currentUser` → `%LOCALAPPDATA%\simpler.legal\` (`simpler-legal.exe`,
`node.exe`, `engine/` 22 files, `llama/` 27 files, `uninstall.exe`). Built from the dev
tree first; superseded by the Step 6 build below.

**Step 2 — Rust organs port (shelf item 7).** `server_start` / `server_status` /
`complete_local` / `strip_proxy` in `app/src-tauri/src/engine.rs`; the shell spawns the
launcher and `serve-legal.mjs` as a Node sidecar under one job object
(`job_object.rs`), so the engine dies with the app. **Kill check: 4/4 earlier in the
session on the dev build; today 2/2 on the INSTALLED app** — 11 of 11 descendants gone
each time (6 msedgewebview2, cmd + conhost + llama-server, node + conhost) after
`Stop-Process` (TerminateProcess, no clean shutdown), llama-server count 0, ports 49400
and 1436 both closed. Three processes I did not start were left alone and are still
running: vite 31964, a stray `serve-legal.mjs --port 1437` 33724, WINWORD 56340.
Re-run of the 06/08 batch through the ported organs: `ALIGN-FAILED: doc.txt:no-tag`,
**2 of 26 refused (7.7%)** — the adapter's silent-skip chain now fails loud instead of
returning an unaligned document; those two are the count, not a rate to extrapolate.

**Step 3 — real-document trial (26 govuk + 14 LibreOffice files, scratchpad only, none
copied into the repo).** Walker: Word-only body tokens **4,356 → 92**; complete documents
**19/26 → 26/26**; unrecognized parts **9 → 0**; parser defects found and fixed on the
way. Engine batch: **started 26 · results 24 · errors 2 · 54.6 min** (the two errors are
the `ALIGN-FAILED` refusals above). Survivor scan run on the 24. Writer trial **26/26 +
14/14** packages written; Word stand-in **26/26 + 14/14 opened**. Observed, not fixed:
Word's `SaveAs2` hung under COM (worked around by dumping stories instead of saving);
one BOM defect; the gate raised false holds; a float artefact in chart values
(`4.4000000000000004` is what the XML holds, not a rounding of ours).

**Step 4 — redacted .docx out.** Writer `app/frontend/src/lib/extract/docxWrite.ts` +
gate. Fixture rebuilt: **32,182 bytes · 30 parts**; `node app/extract/test.mjs` ALL
GREEN — receipt insertionsUnwrapped 5, revisionMarks 4; gate **12 parts / 40 items / 0
leaks**; output 9,627 bytes (`DOCX_TEST_OUT` chooses where it lands). Word stand-in:
the synthetic INPUT fixture is refused by Word (`.docx` and `.docm`, also with
binaries/chart/diagram removed — the defect is in the planted XML, not investigated
further); the writer's OUTPUT opens: 10 stories, 0 revisions, 0 comments, 0 fields, 0
content controls, 1 table, 1 shape, 2 inline shapes, 1 footnote, 1 endnote. INS-glue
artefact: the store joins runs with a space, so in this fixture labels glue onto names
(`Ravi Pillai TABLE-CELL`) and the engine's spans over-extend across them — masking
MORE, never less.
**In the packaged app (Step 6 build), through the REAL native dialogs:** "Save redacted
.docx…" → `write_binary_file` → **9,625 bytes**, twice, byte-identical; the page note
reads *Saved the redacted .docx — 6 in body, 1 in headers, 1 in footers, 2 in chart text
written; removed 1 tracked deletion, 5 insertions accepted, 1 comment mark, 1 hidden
run, 3 field codes, 2 link targets, 1 content control, 1 image (not read), 1 alt-text, 8
document properties, 1 chart value set to 0; 11 parts dropped; re-walk of the output: 12
parts, 37 text items, nothing readable from this table*. Independent re-walk here (Node
walker): 19 parts, 12 scanned, 37 items, 0 unrecognized, 0 invalid; **6 tags in the main
flow** (`[Company3] [X] [Person6]×2 [Person9] [Phone1]`); planted secret markers in any
walked item **0**. **Planted NAMES still readable: 2 in the main flow (`Intraco
Corporation`, inside the accepted tracked insertion) and 11 in some walked item**
(headers/footers/footnotes/endnotes/chart/diagram: Hastings, Tomas Berglund, Hifn, Anand
Krishnan, Rosa Delgado, Mei Ling Chua, Farah Osman, Kwame Mensah, Acme Bakery) — the
frozen engine's table for this fixture holds 7 entities and none of these; the writer
masks the unread channels with the table and the safety-net only, and the note says so.
The text export shows the same two misses (`Intraco Corporation`, `Acme Bakery` readable).
This is engine recall on a synthetic product-genre fixture; the engine is frozen and
nothing here changes it. Receipt: *7 found · 7 kept · 6 tags placed · 0 left visible*
— one table entity has no placement in the export text (not investigated).

**Step 5 — jurisdiction floors.** Practice tables (`practice.ts`, `floorTables.mjs`;
Settings → Redaction → Practice: SG only / US: SSN, EIN, phone / UK: NI number, NHS
number, mobile; can only add masks; the receipt names the tables). `npm run
test:floor-tables` **57/57** (also 57/57 inside the distributable tree); fuzz **3000 / 0
/ 0 / 0**; scored against TAB (**1,580,410 words**): 1 nominee on gold. Defect found and
fixed: the UK mobile rule opened with `\b\+44`, which never matches (`\b` before `+`).

**Step 6 — the distributable tree.** `tools/make-download-tree.mjs --dest
../simpler-legal-app` assembles it from an explicit list (refuses a
destination inside the repo; fails on any missing input, on a `public/cases` count ≠
corpus+newcases, on stale files in the destination): **453 files · 186 MB**; after the
build 458 on disk (the build adds `app/src-tauri/gen/schemas/` ×4 and
`tsconfig.tsbuildinfo`). `tools/derive-notice.mjs` DERIVES `NOTICE` from the tree it
runs in and checks every path claimed in `THIRD_PARTY_NOTICES.md` against that tree
(unknown npm/crate dependency → fail; forbidden patterns → fail; unaccounted
third-party-looking binary → fail). Dev tree: 1,597 files; Plex 14, CMaps 168, Foxit 10,
Liberation 4, CAP 99, 17 software lines; exit 0 after `--write`. Distributable tree: 14
software lines, exit 0 before and after the build. **Defect closed: the
`app/extract/eng.traineddata` line was false** (no OCR path in the app; tesseract.js is
developer tooling under `app/extract/`; the file is not tracked) — `THIRD_PARTY_NOTICES.md`
now says so and dates the correction. Build from the tree: `npm ci && npm run build` in
`app/frontend`, then `frontend/node_modules/.bin/tauri build` FROM `app/` — the Tauri CLI
only searches below its cwd for `tauri.conf.json` and there is no build hook; release build
**3 m 21 s**; installer `simpler.legal_0.1.0_x64-setup.exe` **39,620,806 bytes**; silent
install; installed `simpler-legal.exe` = the tree's build plus Tauri's 3-byte bundle-type
patch at offset 10222888 (same size 12,714,496); `node.exe`, `llama-server.exe` and the
engine files hash-identical to the tree. Installed app, fresh launch, driven over CDP
with nothing stubbed: engine up on its own (`server_status` healthy on 49400;
`legal_service_health` ok · llama · `v1-legal-frozen` · 1436); the fixture strips
through `strip_proxy` in **4.1 s, 7 entities**; "Copy redacted text" 313 chars; "Save as
file…" through the real dialog → `write_text_file` → **315 bytes, byte-identical to the
copied text, no BOM, LF only**, twice; `.docx` as in Step 4; **0 page errors** across
three drives. `README.md` states the two modes and that the installer has only ever been
installed on the machine that built it.

**Driving the native dialogs — what did not work, then what did.**
`window.__TAURI_INTERNALS__.invoke` is `writable:false, configurable:false` in this build
(the object itself is non-configurable on `window`), so a JS stub of the dialog plugin is
impossible; the dialogs had to be answered for real. They are `#32770` CHILDREN of the
main `Tauri Window` element in UI Automation, not desktop-root children; unanswered ones
stack (five were open at one point, main window enabled=False) and are cleared by killing
the app. The managed UIA client exposes the File name box (control id 1001) and the Save
button (control id 1) as pattern-less panes. A `WM_SETTEXT` to the box changed it on
screen but the dialog then saved under its DEFAULT name into its current folder — the
app's working directory, i.e. the repo root: `fixture.redacted.txt` and
`fixture.redacted.docx` landed there and were moved to the scratchpad by hand (git status
clean of them). Typing the path as `WM_CHAR` messages to the edit handle after `EM_SETSEL`,
then `BM_CLICK` to the button handle: **2/2 text and 2/2 .docx saves landed where typed**,
byte-identical to the first pair. No keystrokes were ever sent to the foreground window.

**Observed, not fixed here:**
- the strip-status regex in the second driver picked the previous queue row's final label
  at 0.0 s when the fixture was already in the queue; the 4.1 s figure is from a drive with
  an empty queue (first launch after install and again after the relaunch, 0 finished rows).
- a stray `.wf-args.json` (workflow arguments from the 2026-09-12 facets audit) is untracked
  in the repo root; not mine to delete, not part of any tree.
- the engine batch's two `ALIGN-FAILED` documents were not re-run by hand.
- one background invocation of the Word stand-in (started 16:52) never wrote a byte to its
  output and was killed by the system at about 19:40 for low memory (3.7 GB of 31.1 GB
  free at that moment). The Step 3 Word figures come from the runs that completed and left
  their summaries on disk: inputs `word-real` 26/26 (17:19) and `word-stress` 14/14 (17:20),
  writer outputs `word-out-real2` 26/26 (18:07) and `word-out-stress2` 14/14 (18:16); the
  earlier partial runs `word-out-real` (24) and `word-out-stress` (13 of 17) are superseded.
  A `WINWORD.EXE` (pid 56340) that started at 17:18:19, during the first of those runs, is
  still running at 137 MB; it was not stopped, because I cannot prove I started it.
- a clean Windows profile has not been tested; every measurement above is from the machine
  that built the installer, with the strays named in Step 2 running alongside.

## 2026-09-14 — nine public filings in a firm's shapes through the frozen engine: 9 started / 9 results / 0 errors; no person survived; four things the EDGAR and judgment receipts could not show

**Why this run.** `pii-bench/README.md` records firm-internal memos and letters as the unmeasured
genre and names RECAP filings as the public source. The owner ordered a draw: "find a few documents
OOS, and run them through." Every receipt in `FREEZE.md` is on contracts or judgments; this is the
first receipt on paper a lawyer writes.

**The draw.** CourtListener v4 RECAP search, anonymous (`type=r`, `available_only=on`), eleven shape
queries (declaration, brief, complaint, demand letter, settlement, deposition, attorney declaration,
discovery responses, letter motion, engagement letter, expert report): 472 candidate PDFs. Nine
picked by shape, one each, from nine different dockets and seven courts. All nine are public court
filings served by `storage.courtlistener.com`; the PDFs, the extracted text, the engine output and the
hand check live in the session scratchpad under `oos-firm/` and nothing from them is in this tree
(the tree's hygiene rule: identifiers stay out of the published surfaces). The RECAP paths, which
carry no names and re-derive the draw:

| # | shape | RECAP document | pages | words to the engine |
|---|---|---|---|---|
| 01 | memorandum of law for a preliminary injunction, S.D.N.Y. | `nysd.669739.7.0` | 18 | 4,787 |
| 02 | complaint, individual plaintiff, W.D. Tex. (a scan) | `txwd.1172918238.1.0` | 19 | 190 |
| 03 | demand letter, exhibit to a complaint, S.D.N.Y. | `nysd.659615.1.2` | 4 | 1,048 |
| 04 | settlement agreement and release, S.D.N.Y. | `nysd.647153.23.0` | 8 | 3,469 |
| 05 | attorney declaration for a fee motion, D. Colo. | `cod.243666.74.3` | 4 | 747 |
| 06 | law-firm engagement letter, exhibit, C.D. Cal. | `cacd.980117.9.1` | 11 (1 refused) | 6,720 |
| 07 | law-firm engagement letter, exhibit, Bankr. S.D. Fla. | `flsb.814478.161.4` | 4 | 1,633 |
| 08 | attorney letter motion to the judge, S.D.N.Y. | `nysd.668997.31.0` | 2 | 669 |
| 09 | expert report, exhibit, W.D. Okla. | `okwd.125622.53.1` | 23 | 5,275 |

**The path is the product's path.** PDF to text through the app's own reader (`app/extract/pdf.mjs`,
per-page scan-detect and garble-detect), text to the adapter (`serve-legal.mjs` on 1436), adapter to
the frozen chain (`strip-batch` then `apply-v2` for product or `apply-ln` for courts, then
`apply-lq`) on a `llama-server` started by `tools/launch-server.cmd` on 49400, frozen argv, probe
completion non-empty before the first document. Batch driver `engine-batch.mjs` (scratchpad),
started-vs-results counted by the driver, not by a summary.

**Infrastructure miss, launch: 1 failed / 2 launches.** The launcher as written exited 127:
Vulkan enumerated the AMD Radeon 890M as device 0 and `vk::PhysicalDevice::createDevice` failed
with `ErrorExtensionNotPresent`, then `vkCreateBuffer: Invalid device` (`llama-6.log`). Relaunched
with the environment variable `GGML_VK_VISIBLE_DEVICES=1`, same argv, same launcher: "Vulkan0 :
NVIDIA GeForce RTX 4060", model loaded, probe "OK" (`llama-7.log`). The launcher is frozen and does
not set the variable; the launching shell has to. Working set of the server grew from 1.6 GB at
probe to 5.2 GB after the ninth document, with 3.6 GB of RAM free at that point (8.8 GB after
the server was stopped).

**The run: started 9 · results 9 · errors 0 · align OK 9/9 · 10.7 min · 161,051 chars**
(UTC 2026-09-13 18:39:48 to 18:50:31; about 2.6 s per 1,000 chars end to end).

| # | chars | genre routed | rows | seconds | tags in FINAL |
|---|---|---|---|---|---|
| 01 | 31,373 | courts | 170 | 112.1 | 390 |
| 02 | 1,281 | product | 1 | 3.8 | 19 |
| 03 | 6,497 | product | 29 | 19.8 | 40 |
| 04 | 23,562 | product | 43 | 50.4 | 132 |
| 05 | 4,850 | courts | 49 | 32.3 | 72 |
| 06 | 43,090 | product | 97 | 92.5 | 363 |
| 07 | 9,865 | product | 31 | 25.2 | 89 |
| 08 | 4,358 | courts | 30 | 24.3 | 37 |
| 09 | 36,175 | courts | 294 | 282.2 | 580 |

**The check.** One labeler (the agent), no gold. For each original I read the text and listed every
identifier by hand: people, party organisations and law firms, street addresses, emails, phones,
case, docket, registration and envelope numbers. 125 identifiers, 614 occurrences over the nine.
Each is counted whole-word and case-insensitive in the original and in the engine's FINAL
(`oos-check.mjs`, `oos-firm/check.json`), and a mechanical sweep for anything email-, phone-,
docket- or GUID-shaped and for surviving capitalised word pairs ran over every FINAL (`oos-score.mjs`,
`oos-firm/score.json`). Four documents routed courts, five product. This is one draw of nine; it
is a receipt for these shapes and nothing else.

**Finding 1, the container, not the engine: a stamped scan passes scan-detect.** Document 02 is
a 19-page image scan of a complaint. Every page carries the CM/ECF header as real text, so
scan-detect passed 19 of 19 pages as `ok` at about 10 words a page. The engine received 190 words
of stamps, returned 1 row, and the docket number stayed readable 19 of 19 times. Delivered through
the app, that file would export as "redacted" containing none of the complaint and all of the case
number. Rate: 19/19 image pages accepted (100%) on this shape. Not the engine's miss; the reader's.

**Finding 2, the engine on a firm's paper: 12 of 125 identifiers readable at least once, 41 of
614 occurrences; without the scan 11 of 124 and 22 of 595.** Eight of nine documents have at
least one. Not one of the 41 people in the hand list survived at any occurrence; none of the 7
emails; none of the 10 phone numbers; the mechanical sweep found no email, phone or GUID in any
FINAL. What survived, by kind (spans and counts in `check.json`):

- the brief (01): the plaintiff company's name in the caption (1 of 5 mentions), its ticker
  (2 of 2), its defined-term abbreviation (10 of 59), and the FINRA arbitration number (1 of 1);
  the defendant, the court docket, all counsel, both firm addresses, all phones and emails masked;
- the scan (02): the docket number, 19 of 19 (Finding 1);
- the demand letter (03): the name of the defendant's website (2 of 2) and the street number
  and floor of opposing counsel's address, the rest of that address masked (1 of 1);
- the settlement (04): the defendant company's name (1 of 1); all seventeen plaintiffs, the
  principal, the DocuSign envelope id and the docket masked;
- the fee declaration (05): the numeric part of the case number once (1 of 5), the judge
  initials that follow it masked as a person;
- the engagement letter (06): a defined term for the client's business (1 of 2);
- the engagement letter (07): nothing;
- the letter motion (08): the plaintiff company's name in the Re: line (1 of 2);
- the expert report (09): the retaining law firm's name (1 of 1), a ranch name (3 of 3) and a
  prior-testimony case number.

The shape of the misses is one shape: organisation names at their first mention, in a caption,
a Re: line or a defined-term parenthetical, and identifiers that sit inside a rail's glue. People
are masked everywhere.

**Finding 3, the engine over the other way: the citation KEEP rail does not hold on a brief.**
The brief cites 45 reporter citations (volume, reporter, page). Eight survive intact. Reporter
mentions fall from 49 to 6; Westlaw numbers become `[Id24]` and once `[Phone1]`; the FINAL carries
57 `[Id]` tags. The case names inside citations are masked inconsistently: three kept, four
replaced by `[Company]`. The courts profile was tuned on judgments, where the citation rail was
measured; a brief is a citation-dense document of a different shape, and the rail was never
measured on it. A frontier model reading this FINAL cannot check a single authority.

**Finding 4, over-masking that costs utility without protecting anyone.** Role words tagged as
parties: "Plaintiff" is `[Person28]`, "Plaintiffs" `[Person12]`, "Defendants" `[Company8]`. Rails
glue dates and words into tags: `[Email1] 2, 2026`, `April [Id6]`, `[Person1]3, 2026`,
`Phone: ([Phone1]July 7, 2024`, `[X]York, New York`, `[X]Rule 7.1(c)`. `[X]` is the residual-glue
tag `apply-ln` and the p0 rails emit for the unclassified remainder of a split region; the nine
FINALs carry 119 of them. All of it is safe-side. All of it is text a lawyer would have to repair
by hand before the file is worth sending.

**Observed, not fixed here:**
- the launcher needs `GGML_VK_VISIBLE_DEVICES=1` on this machine and does not set it; the
  launcher is frozen, so the note lives here and in the agent's memory, not in the file;
- scan-detect needs a rule for pages whose only text is the stamp region; `app/extract` is not
  frozen, but that is a product change, not this run's;
- the citation rail on briefs, the role-word tags and the date glue are engine behaviour and the
  engine is frozen; the receipt is recorded, no round is opened;
- the background launcher task reported exit 127 a second time after the server was stopped
  by hand at the end of the run; that is the wrapper's exit, not a third launch;
- `WINWORD.EXE` pid 56340, left running by the 2026-09-13 entry, was gone by the end of this
  session; nothing here stopped it. The stray `serve-legal.mjs` on 1437 (pid 33724) and the
  vite dev server (pid 31964) are still running and were not touched.

## 2026-09-15 — the firm-genre round: three defects named on 2026-09-14, two fixed and measured, one partly. 21 filings, 20 scorable, 4 batches + 1 rerun, 41 started / 37 results / 4 refused upstream

The 2026-09-14 out-of-sample round left three named defects. This entry closes the first two
and measures the third. Nothing frozen changed, and that is a byte statement, not an argument.

### 1. The stamped scan — FIXED, and it had been hiding a second page

The reader passed a page whose only text is the court's e-filing stamp. A 19-page scanned
complaint scored as a clean extraction at ~10 stamp words a page, and the app would have
called the result "redacted".

New rail in BOTH readers (`app/extract/pdf.mjs` and the browser port
`app/frontend/src/lib/extract/pdf.ts`, identical law): a page is refused when one painted
image covers ≥90% of the page AND fewer than 15 words sit outside the top and bottom 12%
margin bands. Thresholds measured, not chosen: scanned pages paint one image at 100% of the
page; letterhead and photo images on real text pages measured 1–31%.

Geometry: a CTM stack walk over the operator list (`save`/`restore`/`transform`,
`paintImageXObject` and its inline/mask/repeat variants), page box from `page.view`, and a
rotation-aware baseline (`transform[5]`, or `[4]` at 90/270).

| | before | after |
|---|---|---|
| doc 02, a scanned complaint | 19/19 pages "ok" | 19/19 refused |
| doc 04, a settlement | 8/8 "ok" | page 7 refused |
| the nine, total | 93 pages, 2 refused | 93 pages, 21 refused |

Doc 04 page 7 is the part that matters: nobody had noticed it. It is a full-page image that
had been contributing 10 stamp words to a document otherwise read correctly.

Fixtures and tests: `make-fixture-scan.mjs` now emits three PDFs from one JPEG — image-only,
image + e-filing stamp + Bates number, and a letterhead page (120x40 logo over 78 words) as
the must-stay-ok control. `test-pdf.mjs` asserts the stamped scan is refused with the margin-
stamp diagnosis, that its word count is >0 (the refusal is about WHERE the words are, not
whether there are any), that the stamp text is not passed downstream, and that the letterhead
page stays ok with full text and `complete === true`. ALL GREEN; `npx tsc -b` exit 0.

### 2 and 3. Matter identity and the citation rail — a new `--profile firm`, measured both ways

The other two defects are one doctrine disagreement. On a firm's own paper the party
ORGANISATION is the matter's identity, and precedent citations are the reason the file is
being sent to a model at all. Product doctrine releases the first and eats the second.

`--profile firm` on `apply-v2.mjs`, plus `--arms citekeep`. Firm inherits every product
mechanic through a new `BASE` constant and changes three things: COMPANY and BRAND rows are
never released; the US caption, party acronyms and every substrate row propagate
case-insensitively; and `citationKeepSpans` RELEASES reporter citations after every sweep,
under a split-at-boundary law ported from LN0 so a region straddling a citation loses only
its intersection.

**The frozen configuration is unchanged, proven by bytes.** Pre-edit and post-edit
`apply-v2.mjs`, same eight round-7 documents, deterministic, `--profile product` and
`--profile courts`: outputs byte-identical, 8/8, both profiles, and re-proven after the guard
fix below. With `PROFILE='product'`, `BASE === PROFILE` and the firm flag is false, so not one
branch changes.

`serve-legal.mjs` (host, never frozen) exposes it as an opt-in only: `--profile firm` as a
server default or `{profile:"firm"}` per request. The genre router is untouched — genre still
picks the LN and LQ stages; firm changes one argument of the v2 stage. An unknown profile is a
400 with the accepted values named, never a silent fallback to the other doctrine.

### The guard ate its own tail — found by measurement, not by reading

First firm run: identity improved, citations did not move at all. The cause is circular and
total. The shared-token guard was fed every substrate COMPANY/BRAND/PERSON row, and the v1
core tags a CITED CASE NAME as a COMPANY. So "Citigroup Glob. Markets, Inc." entered the
identity set and then vetoed release of the very citation it came from. Every citation killed
itself; the rail scored as if it were switched off — 6 releases out of 52 on doc 01.

`matterIdentityTokens` makes the cut a lawyer would make: an entity appearing ONLY inside
citation shapes is precedent; an entity appearing even once in running text is this matter.
Fail-closed — presence anywhere outside a citation keeps an entity in the identity set, and an
entity whose exact text cannot be re-found is kept, because silence is not evidence.

Measured on doc 01: releases 6 → 27, while `interactive`, `brokers`, `wong` and `stephanie`
all REMAIN identity, so `Interactive Brokers LLC v. Delaporte` is still masked. That is the
test that matters: the matter's own case in the table of authorities does not release.

### The boards

Same yardstick both ways: a hand list of the identifiers I read in each original, counted
whole-word and case-insensitive in the FINAL. Judges and other public officials are scored
separately and never enter the direct-identifier count.

**Draw 1** — the nine of 2026-09-14, re-extracted with the fixed reader (doc 02 now yields an
empty body and is not scorable, so 8 documents, 159,707 chars).

| | frozen (auto) | firm |
|---|---|---|
| direct identifiers checked | 124 | 124 |
| still readable | 11 | **5** |
| readable occurrences (of 594) | 22 | **5** |
| documents with a readable identifier | 7/8 | **4/8** |
| reporter citations kept | 9/55 (16%) | **37/55 (67%)** |
| email / phone / GUID left anywhere | 0 | 0 |

**Draw 2** — twelve fresh RECAP filings never seen by any round (221,877 chars): two briefs,
two complaints, an answer, a settlement, a declaration, a retention application, an expert
designation, a letter motion, an amicus declaration, a bankruptcy fee statement.

| | frozen (auto) | firm |
|---|---|---|
| direct identifiers checked | 172 | 172 |
| still readable | 16 | **6** |
| readable occurrences (of 850) | 23 | **6** |
| documents with a readable identifier | 7/12 | **4/12** |
| reporter citations kept | 0/27 (0%) | **9/27 (33%)** |
| email / phone / GUID left anywhere | 0 | 0 |

**Both draws, 20 documents, 296 hand-listed identifiers, 1,444 occurrences:**

| | frozen | firm |
|---|---|---|
| identifiers still readable | 27 | **11** |
| readable occurrences | 45 | **11** |
| documents with a readable identifier | 14/20 | **8/20** |
| reporter citations kept | 9/82 (11%) | **46/82 (56%)** |

Both directions moved at once. That is the claim worth keeping: privacy and utility were not
traded against each other here, because the two defects had the same root — the engine could
not tell a party from a precedent, and fixing that improves both sides.

Second-draw receipt for the FROZEN engine, stated separately because it stands on its own: on
twelve unseen firm-shaped filings, zero of the emails and zero of the phone numbers survived,
and every failure was an organisation name, a firm name, a docket number or a money amount.

### What still survives, by mechanism — all 11

Four of the five draw-1 survivors and all three draw-2 dockets sit in the same two places:
**the first-page caption block and the "Re:" subject line.**

| survivor | document | mechanism |
|---|---|---|
| `1:25-CV-08297` | 11 | the docket rail is CASE-SENSITIVE on the `cv` segment; masked 11/12 times as `cv`, survives once as `CV` in the caption |
| `2:24-CV-7532` | 20 | same uppercase `CV`, in a `Re:` line |
| `1:22-cv-10855` | 17 | glued with no space: `,1:22-cv-10855(` defeats the word-boundary rail |
| `25-cv-01391` | 05 | caption glue: `Civil Action No. 25-cv-01391-[Person]` — the judge-initial suffix masked, the number not |
| `BKX Services` | 08 | the `Re:` line, the one occurrence outside the caption |
| `26-01225` | 01 | an ARBITRATION case number; no rail covers the `NN-NNNNN` shape |
| `1700 Broadway` | 03 | address split: the street number and name survive, `[Address5]` follows immediately |
| `IBLLC` | 01 | 1 of 59 occurrences, mid-sentence; 58 masked |
| `New York County District Attorney` | 17 | a government office, not private identity — arguably correct, listed anyway |
| `98,262.00`, `1,738.00` | 22 | a retainer and a filing fee on a bankruptcy fee statement |

The caption block is now the named blocker, not "matter identity" in general.

### The citation rail was audited for the dangerous direction

`citationKeepSpans` RELEASES text, so a span running past its citation into prose is a leak,
not a cosmetic defect. Every released span across both draws was printed and audited three
ways: did it run into a following sentence, does it carry any identity token of this matter's
parties, does it still read as a citation alone. **96 released spans over 20 documents, 0
flagged.** The first pass flagged 6; all 6 were my test's own abbreviation heuristic firing on
`Glob. Markets`, `Mkts. Inc.` and `Colo. June`, and the test now carries an abbreviation list
built by reading each span it fired on.

### Started vs results — counted, never summarized away

| run | started | results | refused/errors |
|---|---|---|---|
| draw-1 re-extraction (fixed reader) | 9 | 9 | 0 (1 yields an empty body: all 19 pages refused) |
| A · draw 1, frozen | 9 | 8 | 1 empty body |
| B · draw 1, firm (pre-fix guard) | 9 | 8 | 1 empty body — SUPERSEDED by the rerun |
| C · draw 2, frozen | 12 | 12 | 0 |
| D · draw 2, firm | 12 | 12 | 0 |
| rerun · draw 1, firm (fixed guard) | 9 | 8 | 1 empty body |

Wall clock: A 18.7 min, B 23.2 min, C 24.3 min, D 19.3 min, rerun 11.2 min.

### Infrastructure misses

1. **The launcher's default binary is not on PATH for a non-interactive launch.**
   `tools/launch-server.cmd` defaults `SIMPLER_LLAMA_BIN` to bare `llama-server`; under
   `Start-Process` that fails with `'"llama-server"' is not recognized`. Rate: 1 failed launch
   of 2 attempts. Fix: set `SIMPLER_LLAMA_BIN` to the `llama-cuda\llama-server.exe` path. The
   launcher is frozen and was not edited.
2. **A failed launch leaves a process alive but not listening.** A llama-server from an earlier
   attempt was still running at ~28 MB working set with nothing bound to 49400. Check the
   listening port, not the process list.
3. **`/health` is still not a contract check.** It returned `{"status":"ok"}` while the raw
   `/completion` endpoint returned empty content. The probe has to hit
   `/v1/chat/completions` — the endpoint `makeComplete` actually calls — and assert non-empty.
4. **A shell heredoc could not carry this entry.** Same as 2026-09-14: written with the Write
   tool to the scratchpad and appended under a line-count guard.

### Observed, not fixed here

- The caption rail reads a usable party list on 7 of 20 documents. On the rest it returns
  nothing (settlement agreements, `In re` bankruptcy captions, `§`-delimited Texas captions)
  or returns junk (`"Motion Cut-off"`, `"Collective Plaintiffs, and the Class"`,
  `"Connecticut limited liability company"`). It did not cost privacy in this round — the
  COMPANY-never-released rule carries the load — but it is why the caption block is still
  where identity survives.
- Draw 2 doc 06's page 1 remains garbled (broken font mapping) and is correctly refused.
- The processes named in the 2026-09-14 entry were left alone. One llama-server this session
  started and left dead was stopped; the vite dev server (pid 31964) and the stray
  `serve-legal.mjs` on 1437 (pid 33724) were not touched.

## 2026-09-24 — launch rounds 5 and 6: a laptop crash, two usage limits, a resume that re-ran finished work, retries that reported half a pass, and a relay that forwarded failed calls

Counted from each run's `journal.jsonl` (times +0800):

| run | what | started | results | started, no result |
|---|---|---|---|---|
| `wf_0512f499-68c` | round 5 | 52 | 40 | 11 — its integration and a 10-agent attack wave after it, killed by a laptop crash |
| `wf_4e66b4fc-0dc` | round 5's integration, run again on its own (04:17–05:28) | 2 | 2 | 0 |
| `wf_4fa01ea9-5c2` | round 6, first run, then an aborted resume | 12 | 1 | 11 |
| `wf_e5137565-81d` | round 6, relaunched | 41 | 39 | 0 — two keys started twice |

1. **Round 5: a laptop crash.** Every lane had reported; the integration and the attack wave
   after it had just started. The integration was run again alone. The attack wave was not:
   round 6 attacked every lane afresh. One key (`D1:attack:journalist`) had started twice
   before the crash, with one result.
2. **Round 6's first run: the account's five-hour usage limit, 06:27, 47 minutes in.** Seven
   agents started and one reported (`S:fix`). The W, P1, P2 and I first passes died with their
   edits half-applied in the tree, and S's two attackers died with them.
3. **The resume re-ran the finished agent.** A workflow resume serves from cache only the
   longest unchanged prefix of `agent()` calls. The resume notes changed the first call's
   prompt, so every call after it ran live, `S:fix` included: 0 cache hits of 1 possible. It
   was stopped after about two minutes, and the transcripts showed no edits. The round was
   relaunched fresh, with S's finished report passed in as done. Same lesson as the
   2026-07-21 entry, now with its mechanism: editing any prompt costs every call after it.
4. **The relaunch hit the limit too (11:21 and 11:26), and the runtime's retries reported
   half a pass.** `W:refix` and `I:refix` died on "You've hit your session limit" and were
   restarted at 11:30 from their original prompts. The dead attempts had made 80 (W) and 52
   (I) edits to repo files. The restarts made 9 and 2, and reported only their own. The
   rechecks and the claims lanes read those reports, so most of the two passes' changes
   were never named to an attacker. The integration's gates did run over them, on the
   combined tree (`verify` 18/18). Detection: after any usage-limit event, look for keys
   started twice in the journal and digest the dead attempt's transcript. A retried
   agent's report covers only its own attempt. Round 7's W and I attackers are aimed at
   those edits.
5. **A scratch tree lost its links.** Between round 6's integration and the orchestrator's
   re-run, the integration scratch tree lost its `node_modules` junctions, its `raw/`
   junction and `app/extract/eng.traineddata`. The cause was not established. The first
   run of the combined set failed 29 of its 30 gate and harness runs in milliseconds, on
   `Cannot find module` or a missing esbuild (copy-claims, which needs neither, passed).
   The second passed every gate but skipped intake-refusal's 12 corpus sweeps (635 passed,
   12 skipped, where 654/0 is the count with `raw/` present). Both were read as
   infrastructure, not results. A gate run where everything fails the same way in
   milliseconds, or where the count drops with skips, is not a result.
6. **wf7 S6-F1/F2/S-teeth-7-1 (lane S, round 6).** The relay forwarded failed, empty or
   abandoned model calls, and the frozen chain swallows them, so results were used with
   names missed. Now every call without a whole answer trips the run. Live false-trip rate
   unmeasured (LAUNCH §11.17).

## 2026-09-25 — launch round 7: a second laptop crash, a resume that re-ran ten finished attackers, gates read mid-edit, and a test anchor routed seven times and applied none

Counted from each run's `journal.jsonl` (times +0800):

| run | what | started | results | started, no result |
|---|---|---|---|---|
| `wf_f892fc24-5d1` | round 7 (2026-09-24 15:31 – 21:43), then an aborted resume (2026-09-25 01:09 – 01:10) | 42 | 30 | 12: D1's and D2's second passes, killed by the crash, and the resume's 10 attackers, whose keys had already reported and which were stopped |
| `wf_ec4fcab0-1db` | round 7's continuation (01:14 – 03:04): D1's and D2's second passes, then the integration | 4 | 4 | 0 |

1. **Round 7: a laptop crash at 21:43.** All five code lanes and D3 had finished their fix,
   attack and second pass. D1 and D2 had finished their fix and both attacks. D1's and D2's
   second passes died without reporting, and the integration never started. D1's dead
   attempt had edited no repo file. D2's had made 24 edits: README.md 9, REDACTION_AUDIT.md 8,
   BENCHMARK.md 2 and `app/frontend/test/copy-claims.mjs` 5. The continuation's D2 was told of
   them by count and file and pointed at the dead attempt's transcript, and it reported both
   attempts' edits as one pass.
2. **The resume re-ran ten finished attackers.** With the script unchanged, the resume served
   the five code-lane first passes from cache. All ten code-lane attackers then started live
   again, although each key had already reported. The concurrent lanes' calls reach the cache
   in a different order on replay than in the run, and the cache serves only the longest
   unchanged prefix of calls in order. The resume was stopped after about fifty seconds, and
   the ten transcripts showed no edits to repo files. **Rule: never resume a workflow whose
   lanes run concurrently.** Rebuild the finished results from the journal (first result per
   label wins), and hand-author a continuation that runs only what was left.
3. **Gates read mid-edit.** D3 ran `tools/verify.mjs` at 20:25–20:42 while D1 and D2 were still
   editing, and wrote "13 passed, 5 failed" into LAUNCH.md and CLAUDE.md. Two of those five
   were artefacts of files caught half-saved: a protected-terms SyntaxError at 20:41:37 and a
   site-claims failure at 20:41:27. D3's second run, at 21:29, did not finish before the crash.
   The integration's single run on the settled tree (2026-09-25 02:31:56–02:41:06) gave 15 of
   18, and the run after the landing (03:31:35–03:43:53) gave 18 of 18. A gate count taken while another lane is saving describes no tree. Take it once the
   lanes that own the files have reported, or not at all.
4. **A cross-lane fix routed seven times and applied none.** W widened the named-reference
   pattern in `docxWrite.ts`. That left a CONTROL anchor stale in `protected-terms.mjs:479`
   and `compare-refusal.mjs:840`, and both gates stopped at bundle time: 375 + 5 checks never
   ran. Seven reports routed the exact fix (W.refix.NF3, D1.fix.NF0/NF1, D2.fix.NF0,
   D3.fix.NF0, P2.fix.NF1, P2.refix.NF7). No lane owned both test files at the moment it was
   seen, so no lane applied it. The integration's scratch set did (`nbsp-anchors`).
   **Rule:** a re-aim of a test anchor that a code lane's own change broke belongs to that
   lane, whoever owns the test file; the brief must say so.
5. **Harness flake, fixed.** A relay half-close race failed 2 of 19 of lane S's mutant runs.
   It was fixed by `Client::Reads`, and 0 of 19 failed after (S.refix.NF3).
6. **Scratch-rule breaches, no effect.** S used bash and python heredocs and D1 a `node -`
   heredoc. The integration used a python heredoc, which hung and was stopped, and one
   `node -e` with backslashes, which failed with a SyntaxError. None changed a tracked file.
   The integration's verify waited for a sibling verify (PID 46240) to exit first.

## 2026-09-25 — the taskbar icon, third report: every frame was right and the window used one

Reported with a screenshot: "same issue as last time, low fidelity app nav bar icon". The
2026-09-12 entry above repaired every frame of `icon.ico`. None of those frames except the
first ever reached the running window.

**Cause.** Tauri builds the window's icon from the FIRST entry of `icon.ico` only
(tauri-codegen 2.6.3, `src/image.rs:57`, `icon_dir.entries()[0]`). tao then sets that one image
as both `ICON_SMALL` and `ICON_BIG`. `build-icons.mjs` wrote the frames smallest first, so the
window's icon was the 16px frame, and the taskbar at 150% (36px) stretched it 2.25 times. The
per-DPI frames of 2026-09-12 serve Explorer, shortcuts and the installer, which pick a frame
by size. The window does not pick.

**Why the 2026-09-12 check missed it.** It verified the file (frames decoded, pixels on the
tokens) and not the surface reported, which was the taskbar button of the running app.

**simpler-harness** has no blur and no icon code. Its `icon.ico`, written by `tauri icon`,
lists 32, 16, 24, 48, 64, 256, so its window gets 32px, and 32 to 36 is a small stretch.
The owner pointed there.

**Repair, two parts.**
- `app/src-tauri/src/window_icon.rs` loads the exe's own icon resource (32512, which
  tauri-build embeds from `icon.ico`) at `SM_CXICON` and `SM_CXSMICON` for the window's DPI
  (48 and 24 at 150%) and sets both with `WM_SETICON`. `main.rs` calls it in `setup` and again
  on `ScaleFactorChanged`. On any failure it writes to stderr and the window keeps Tauri's
  icon.
- `build-icons.mjs` now writes 32 first, the harness's order, as the fallback. The file holds
  the same 13 frames: every frame is byte-identical to the one it replaced, only the directory
  order differs. `node build-icons.mjs check`: 17 of 17.

**Verified.** `cargo check` is clean. `Cargo.lock` is unchanged, because the three additions
are features of the windows crate already in use. `LoadImageW(exe, 32512, IMAGE_ICON, n, n)`
returned the drawn n-px frame at 10 of 10 sizes from 16 to 64, with 0 differing pixels
(scratchpad `icon/resource-check.ps1`, against the 2026-09-13 release exe, whose frames are the
same bytes). No file pins the old `icon.ico` hash.

**Verified on the running window, 2026-09-25, 150% (dpi 144).** `WM_GETICON` read back what
each build's window hands Windows (scratchpad `wf10/icon-check.ps1`):
- The fixed release build (this tree, `cargo build --release --features
  tauri/custom-protocol`): `ICON_SMALL` 24×24 and `ICON_BIG` 48×48, which are the sizes the
  shell asks for at this DPI (`SM_CXSMICON` 24, `SM_CXICON` 48).
- CONTROL, HEAD `78ac47b` built the same way (lane R's scratch tree, 16px first, no
  `window_icon.rs`): `ICON_SMALL` 16×16 and no `ICON_BIG`.
- The taskbar was captured with the capturing process DPI-aware, which the black-frame probe
  above was not. The button is 36px at 150%. Zoomed side by side (`wf10/taskbar-before-after.png`),
  HEAD's kite is smeared and its tail is gone, and the fixed build's kite has sharp edges and its tail.

**Still not measured.** Which of the two icons the Windows 11 taskbar draws from, and whether
it scales 48 down to 36 or reloads 36 from the resource. The installed build (NSIS, Start menu
shortcut, a pinned button) is checked at the installer smoke test.

**Standing rule.** A display defect is verified on the surface where it was reported (here,
what the window hands Windows, read back with `WM_GETICON`, and the taskbar itself), not on
the asset upstream of it.

## 2026-09-25 — the launch workflow, and the first live pass through the fixed app: 24 of 45 documents, then the session's memory reaper killed the driver

Counted from the journal (times +0800):

| run | what | started | results | started, no result |
|---|---|---|---|---|
| `wf_fc82a3a3-f39` | launch lanes and integration (04:24 – 08:27) | 10 | 10 | 0 |
| background agent | libomp licensing and the installer's licence page (rulings A, B) | 1 | 1 | 0 |

1. **The live pass.** The fixed release build (`cargo build --release --features
   tauri/custom-protocol` of this tree, with LLVM's `libomp140.x86_64.dll` in `llama-cuda/`)
   was run by lane R's CDP driver (scratchpad `wf9/R/driver.mjs`, `--restart-adapter`) over
   the 45 EDGAR documents of rounds 5–7, from 08:45 to 09:08. Each of the 24 that ran came back
   `ok`, `done=true`, with no error lines, in 12 s to 106 s. All 24 finals are byte-identical to
   lane R's pass-3 finals: the same frozen chain started by hand, with Microsoft's libomp
   (`wf10/compare.mjs`). CONTROLs: pass 3 against itself gives 45 of 45, and HEAD's app run
   (pass 2) gives 0 of 45. Pass 3 leaked 0 of 181 DIRECT spans, so these 24 carry 0 leaks by
   identity. HEAD's app finished 0 of 65.
2. **Killed at 24.** The system reached 3.1–3.5 GB free of 31.1 GB. The largest process was the
   app's `llama-server` at 5.3 GB, and the rest were editors, a browser and other Claude
   sessions. Claude Code's low-memory reaper then killed the background shell holding the
   driver, sometime between 09:08:21 and 09:09. The reaper's notice says not to restart it
   without the owner, so the 21 documents left (`edgar-r6-10` to `r6-15` and all of round 7)
   were not run.
3. **An app that did not exit.** At 09:09 the service logged that the caller closed the
   connection on the document in flight (`edgar-r6-10`). The driver's death alone does not do
   that: in a controlled test with the driver killed mid-document, the strip ran on. The first
   `WM_CLOSE` left the window up. A second one closed it and the WebView2 processes went. The
   app process stayed, with no window and with `llama-server`, the service and the launcher
   still listening. `RunEvent::Exit` evidently never ran, because its first act,
   `terminate_all`, kills all three. It was killed by hand, and the kill-on-close jobs took
   the three down with it. Nothing was left under `raw/stripped/_serve`.
   **Not reproduced** in four controlled closes of the same build (`wf10/close-test.ps1`,
   `wf10/close-midrun.ps1`): idle, idle minimized, mid-document, and driver killed
   mid-document then closed. Each exited 0.5 s after `WM_CLOSE`, with all three engine
   processes gone, no port listening and nothing on disk. The one condition that was not
   repeated is the memory pressure. Open in `LAUNCH.md`.
4. **A log lost.** The service and llama-server rewrite their logs in `%LOCALAPPDATA%\Simpler
   AI\logs` each time they start. The close tests' restarts therefore wrote over the live
   pass's 16 MB llama-server log, and with it the per-call `finish_reason` counts that
   `LAUNCH.md` §11.17 asks for.
5. **Rules.**
   - Before a live pass through the app, record free RAM, and do not start below 10 GB.
   - Copy the logs out before anything restarts the engine.
   - A pass the reaper stops is resumed from a list of only the documents that have no
     receipt. The finished ones are never re-run.

## 2026-09-25 — the v0.1.0 installer: one document run below the 10 GB rule, a counter that searched for `$T`, and a tree script that could not run twice

No workflow ran. Every step was a command in the main session, and each finished with a result.

1. **The 10 GB rule, not kept.** The smoke test put one document (`edgar-r5-13`) through the
   installed app with 5.5 GB free. The rule above asks for 10 GB. The other programs on the
   machine held most of the rest (Cursor 4.7 GB, Chrome 4.1 GB), and they are the owner's to
   close.
   - The run was held in the foreground, with a monitor that reported free memory under 4.5 GB.
   - Free memory fell to 3.3 GB, the level at which the reaper killed the 45-document pass.
     The document finished in 80.6 s and the app was closed at once.
   - Nothing was killed. That is one short document, and it does not show the rule is too
     strict.
2. **A counter that searched for `$T`.** `scratchpad/wf10/c13-dirs.mjs` counts C13's `$P` spans
   and the withheld name over plain folders. Its first version ran grep through `execSync`
   without a shell, which on Windows is cmd.exe. So `"$T"` was never expanded, and grep searched
   for the literal string `$T`, a common name in minified JavaScript.
   - It reported 14 files "carrying the name" in `dist\`, 12 of them fonts and cmaps.
   - The CONTROL caught it. It plants a file holding the name, and the grep did not find that
     file. The fix runs grep through Git's bash.
   - A count with no planted positive can pass or fail for a reason that has nothing to do
     with what it counts.
3. **`make-download-tree.mjs` could not run twice.** Its copy skips `*.tsbuildinfo` and `*.log`,
   but its stale-file walk did not. `BUILDING.md` §6's own `npm run build` writes
   `app/frontend/tsconfig.tsbuildinfo` into the tree, so a second run over a built tree failed.
   The walk now skips what the copy skips. CONTROL: a stray `app/frontend/stray.txt` still
   fails it.
4. **A path the Bash tool rewrote.** `--dest ..\simpler-legal-app` reached node as
   `..simpler-legal-app`, a path inside the repository. The script's own guard refused it
   ("the destination must be outside the repository"). Forward slashes pass through unchanged.

## 2026-09-25 — before the push: the builder's user folder inside the program, and in three records

No workflow ran for these. A read-only review before the push (`wf_4dc897bd-1ca`, 6 started, 6 reported) found
them, and each was then measured in the main session.

1. **The builder's user folder in `simpler-legal.exe`.** The v0.1.0 tree's program held the
   path of the builder's Windows user folder 311 times, 304 of them under `.cargo\registry\`.
   Rust writes the source location of every place a crate can panic into the program, and a
   crates.io crate's source sits in the cargo home, inside the user folder. No gate reads the
   program's bytes for it. The C13 counter looks for spans and the withheld name, not for a
   user name.
   - The fix is a build flag, not a code change: `BUILDING.md` §5 and §6 now set
     `CARGO_ENCODED_RUSTFLAGS=--remap-path-prefix=%USERPROFILE%=~`. Cargo's `trim-paths` would
     do the same, but it is not stable in cargo 1.95; it fails with "feature `trim-paths` is
     required".
   - Measured on a test crate that uses `serde_json`: 3 occurrences without the flag, 0 with
     it, and the locations read `~\.cargo\registry\…`.
2. **A scorer that recorded where it ran.** `score-pii.mjs` and `score-tab.mjs` wrote the
   stripped files' folder into every run record as an absolute path, so the three committed
   selftest records named the development machine's user folder. They now write a path under
   the repository when the folder is inside it. The selftest records were regenerated, and the
   selftest passes 8 of 8.
3. **Absolute paths in the records.** `FREEZE.md`, `LAUNCH.md` and this ledger named the
   download tree and the public repository by their full paths on the development machine.
   They now name them relative to this repository (`../simpler-legal-app`,
   `../simpler-legal-public`).
4. **The gate run was killed at 10 of 18.** `node tools/verify.mjs` over this entry's tree was
   stopped by Claude Code's low-memory reaper after 10 gates, all of which had passed
   (`extract` through `docx-parts`). Free memory was 4.0 GB just after. Another Claude session
   on the same machine was running its own test suites at the time. The run was not restarted
   without the owner, as the reaper's notice asks.

## 2026-09-25 — the other 21 documents through the rebuilt installer, one at a time, and the app that did not exit, reproduced

No workflow ran for the documents. The main session drove them with lane R's CDP driver
(scratchpad `wf9/R/driver.mjs`) through the v0.1.0 installer rebuilt with the path remap
(SHA-256 `162854c8…1432`), installed over the morning's copy.

1. **The 21, all `ok`.** `edgar-r6-10` to `r6-15` and `edgar-r7-01` to `r7-15`, 12:22 to 13:03
   local: `done=true`, `alignOk`, engine `v1-legal-frozen`, no error lines, 30 s to 253 s each
   (median 76 s). All 21 finals are byte-identical to lane R's pass-3 finals, the frozen chain
   started by hand (1 of the 21 also matches its round's own FINAL; the rounds ran earlier
   engines). With the morning's 24, **45 of 45** documents of rounds 5–7 have now gone through
   the real app, each byte-identical to a chain that leaked 0 of 181 DIRECT spans.
2. **Below the 10 GB rule, twice.** The owner closed Chrome, but the machine still had 5.8 GB
   free at the first launch and 6.0 GB at the second. Cursor held 10.7 GB committed, Claude
   sessions 4.6 GB, another session's test run 1.5–2 GB, and Chrome's background processes 2.6 GB.
   - The first 9 ran in chunks of 2–4 in the foreground, with a wrapper that stops the driver
     under 1.5 GB free (`wf10/live21/run-chunk.mjs`). The lowest free memory fell with each
     chunk: 2.67, 2.13, then 1.99 GB. Commit then stood at 50.0 of 51.2 GB. The run was
     paused, and the app was closed; it exited in 0.8 s.
   - The page file is system-managed, with 17.3 GB free on C:, so the commit limit could have
     grown. The pause was still the right call: a laptop crash twice in this record had no
     settled cause.
   - The other 12 ran one at a time (`wf10/live21/run-singles.mjs`). Before each: 2.5 GB free
     and 2 GB of commit headroom, or stop. The lowest free during any of them was 2.19 GB. None
     was stopped.
3. **A log lost again.** Before the relaunch only the app's own stdout and stderr were copied
   out. The engine's logs live in `%LOCALAPPDATA%\Simpler AI\logs`, and the relaunch rewrote
   them, so the first session's llama-server log is gone. The rule above names the logs. It
   does not name the folder. **The folder is `%LOCALAPPDATA%\Simpler AI\logs`.** The second
   session's logs were copied out before anything restarted (`wf10/noexit/engine-logs`).
4. **The app that did not exit, reproduced.** This time the memory pressure was not caused by a
   killed driver.
   - After the 12, the window had been minimized for about 20 minutes, with 2.2–3.1 GB free.
   - At 13:04 a `WM_CLOSE` to the visible main window was ignored. Twenty seconds later the
     window was there and not hung: `IsHungAppWindow` was false, a `WM_NULL` was answered, and
     the page answered DevTools with no dialog open.
   - A second `WM_CLOSE` destroyed the window in 0.24 s. The process stayed, with
     `llama-server` and the service listening, so `RunEvent::Exit` never ran.
   - The thread with the most CPU was in a `Sleep` (wait reason `ExecutionDelay`), not in a
     message wait.
   - A full dump of the stuck process was written (`wf10/noexit/`, 98 MB), then it was killed.
     The kill-on-close jobs took the engine down in 1.1 s, and `_serve` was empty.
   - Counting today's closes of this build: 2 of 8 failed this way, the 09:09 close and this
     one. The other six exited within a second: the four controlled closes, the installer's
     smoke test, and the pause after 9 documents.

## 2026-09-25 — the app that did not exit: the mechanism, the fix, and seven close arms

The root-cause workflow `wf_84bbf023-0bd`: 7 agents started, 7 results.

1. **The mechanism, from the dump.** The dump of the 13:04 process (`wf10/noexit/`) shows tao's
   runner in `HandlingMainEvents` with `ControlFlow` at `ExitWithCode`, and no `WM_PAINT`
   pending.
   - tauri-runtime-wry 2.11.4 sends `ExitRequested` when the last window is destroyed. It then
     sets `Exit` (lib.rs:4310-4322).
   - tao 0.35.3 breaks its loop only from `Idle`. Only a `WM_PAINT` to its thread target reaches
     `Idle` (event_loop.rs:255-288, 2331-2350). None came.
   - So `RunEvent::Exit` never arrived. It was the app's only teardown, so the engine ran on.
   - What took the paint is not identified. Hypothesis: a `PeekMessage(PM_NOREMOVE)` in
     WebView2 or COM teardown. tao's own comment (2421-2425) says that call removes an
     internal-paint `WM_PAINT`. The fix does not depend on knowing.
   - **Not explained and not fixed: the ignored first close.** A window that stays up is seen,
     and a second click closes it. An engine running with no window was seen by no one.
2. **The fix** (`exit_guard.rs`, new; `main.rs`; `engine.rs`):
   - **Teardown at `ExitRequested`.** The dump proves `ExitRequested` arrived. `engine::shutdown`
     now runs once, whoever calls it first. A late caller waits for it to finish.
   - **The nudge.** A thread then posts no-op tasks to tao: first at 100 ms, then every 250 ms,
     at most 40. Each re-arms the internal paint.
   - **The watchdog.** It starts at setup and polls `IsWindow` on the main window, so nothing in
     tao arms it. Once the window has been gone 5 s, it finishes the teardown. If a teardown is
     already under way, it waits for it, 20 s at most, then sweeps the adapter's trees. It
     writes one line to `%LOCALAPPDATA%\Simpler AI\logs\legal-app-exit.log`, then ends the
     process with code 3.
   - **The log.** Only the watchdog writes to it: when it fires, or when it cannot start. The
     lines hold times and states only. The file is emptied at start once it passes 256 KiB.
     The first version also wrote a line on every close, so the firing rate could be counted
     against the closes. The review below took that out (item 7).
   - **No guard for a save in flight.** The two write commands are sync, so they run on the UI
     thread, which also delivers the close. A close cannot start while one runs (the design
     skeptic's finding; the comment on `write_text_file` says so).
3. **Seven close arms, on a test build.** The build is `--features exit-fault`. The fault is a
   message-only window that takes the paint the same way, on demand. Each arm launched the app,
   waited for the engine (3 processes), then posted one `WM_CLOSE`
   (`wf10/exitfix/arm.ps1`, outputs in `wf10/exitfix/arms/`).

   | arm | fault | nudge | watchdog | result |
   |---|---|---|---|---|
   | plain ×2 | none | on | on | exit 0 in 0.08-0.17 s, engine gone |
   | A0 | paint taken | off | off | **hung** 30 s, then killed; the fault reproduces the stall |
   | A1 | paint taken | on | off | exit 0 in 0.23 s |
   | A2 | paint taken | off | on | exit 3 at 5.26 s, engine gone, log line written |
   | A3 | exit prevented | on | off | **hung, engine alive**: the 13:04 symptom |
   | A4 | exit prevented | on | on | exit 3 at 5.32 s; the watchdog ran the teardown itself |
   | A5 | paint taken | on | on | exit 0 in 0.15 s |

   - In every arm the paint was taken, as the log's `peeked WM_PAINT: true` shows. A0 and A3
     are the controls: without the part under test, the process does not end.
   - In A0 the engine was already down while the process hung, because the teardown now runs at
     `ExitRequested`.
4. **The check that the test code never ships.** `tools/exe-strings.mjs` counts, in the program,
   the fault's names and the builder's user folder, each as UTF-8 and as UTF-16LE.
   It exits 1 on either, and the scratchpad's `installer-check.mjs` now runs it too.
   - CONTROLs: the fault build's exe gives 7 fault names and the plain one gives 0. The window
     class name is stored as UTF-16LE only: 0 ASCII copies, 1 UTF-16. An ASCII search would
     have passed it, as the design skeptic said.
   - For the user folder, the first v0.1.0 installer's exe (`09fdb410…`, before the path remap)
     gives 316 paths, and the rebuilt ones give 0.
   - **A check that first passed vacuously.** A bash heredoc turned a doubled backslash into a
     single one in the search's template literal. The literal then escaped its own `$`, so it
     looked for the text `Users${u}` and found 0 in the old exe too. That control caught it
     before any record used the figure. The same collapse hit three later edits made through
     the shell, and each was caught on reading the result back. Text with backslashes now goes
     through the editor, not the shell.
5. **Tests.** `cargo test` 80 of 80: 70, plus 3 for the run-once teardown (one with a real child
   process) and 7 for the watchdog, nudge and log date. `node tools/verify.mjs`: 18 of 18, in
   three foreground batches. The first batch's `clone-imports` failed on the new file, which was
   not yet in git; the gate named the fix, and it passed after `git add`.
6. **Departures.**
   - Both builds and all seven arms ran with 5.7-7.7 GB free, below the 10 GB rule. Each arm
     refused to start under 4.5 GB free or 5 GB of commit headroom, and none was refused.
   - PowerShell 5.1 leaves `$PSScriptRoot` empty in a parameter default, so the first four
     arms wrote their outputs to `C:\arms`. They were moved to the scratchpad, and the script
     was fixed.
   - The engine logs of the morning's installed-app session were copied out before the first
     arm (`wf10/exitfix/pre-arms-logs`), and each arm's logs after it.
7. **The review before commit.** Workflow `wf_b6f6bdfd-0fa`: 12 agents started, 12 results.
   Three reviewers each read the diff from one angle: races, the Tauri and tao facts, and the
   tests and the log. Each of their 9 findings went to a skeptic told to refute it. 7 held,
   which come to 5 distinct defects, all fixed:
   - **Major: an undisclosed log that recorded use.** Every close appended a dated line to
     `legal-app-exit.log`. History, `PRIVACY.md` and `site/it.html` all say only the two engine
     logs are kept, and that they are rewritten.
     - Now only the watchdog writes there, and all three surfaces name the file with its real
       retention.
     - `copy-claims` §7 read only `attach_logs`, so it passed with the file named nowhere. It
       now collects every `.join("….log")` in the crate. It also checks that `requested()`
       writes nothing, and it has a CONTROL: the History line without the exit-log clause fails.
   - **Minor: a guard that could not fail.** The tests' "ran twice" guards panicked on the
     detached teardown thread, where a panic fails nothing. They now record the call and assert
     on the test thread.
   - **Minor: a control with no timing assertion.** It passed with the teardown run inline,
     with no bound. It now asserts the bound.
     - Mutants: making the net run a teardown already under way fails 2 tests. Failing the
       teardown thread's spawn, which makes the net run it inline for 3 s, fails the control's
       bound. Both were restored byte for byte.
   - **Minor: a false sweep claim.** The timed-out line said the trees were swept when this app
     had not spawned the adapter. `sweep_if_spawned` now says whether it swept, and the line
     follows.
   - **Minor: a false comment.** The nudge's comment said a closed loop makes the post fail. In
     tao 0.35.3 no post fails before the process ends. Comment and test name corrected.
   - **Refuted: no test calls `shutdown()` itself.** A coverage gap, not a defect.
   - **Refuted: the watchdog cannot bound the UI thread's teardown.** `IsWindow` stays true
     until `WM_DESTROY` returns, so the watchdog is not armed yet. Arming it earlier would let it
     end the process mid-teardown, which the design avoids, and the wait is the one HEAD's
     `Exit` arm already had. The `TEARDOWN_WAIT` comment now lists everything `start_blocking`
     holds the lock through, and says this.
   - **Re-run on the reviewed code:**
     - A0 hung; A2 ended with code 3 at 5.34 s; A4 with code 3 at 5.21 s, the watchdog running
       the teardown; A5 with code 0 at 0.23 s.
     - A plain close exited 0 in 0.08 s and left `legal-app-exit.log` unchanged.
     - The test arms' lines were then copied to `wf10/exitfix/` and the file removed from the
       owner's log folder.

## 2026-09-25 — the installer of record: a check that failed on a marker it should have known, the 10 GB rule not kept again, and the gates on the tree of the public cut

No workflow ran. Every step was a command in the main session, and each finished with a result.
`LAUNCH.md`, "The installer of record", has the figures.

1. **A check that failed on a known difference.** `scratchpad/wf10/installer-check.mjs`
   compared `simpler-legal.exe` byte for byte with the tree's. Tauri's bundler always rewrites
   the bundle-type marker (`UNK` to `NSS`), so every run printed FAIL, this morning's included.
   Each time the difference was read by hand and found to be the 3 marker bytes.
   - The check now accepts exactly that marker. It puts `NSS` into the tree's copy and requires
     the rest to be equal, byte for byte.
   - CONTROL: the first v0.1.0 installer fails it three times: `NOTICE`, the exe beyond the
     marker, and 316 user-folder paths.
   - A check whose FAIL is expected is a check nobody reads.
2. **The 10 GB rule, not kept again.**
   - The installed app ran one document (`edgar-r5-13`). Free memory was 5.2–5.5 GB before
     the launch, and 3.23 GB, with 3.63 GB of commit headroom, once the engine was up. The
     lowest free during the run was 2.45 GB. The owner's programs held the rest.
   - `scratchpad/wf10/run-one.mjs` refuses to start a document under 2.5 GB free or 2 GB of
     headroom, and stops the driver under 1.5 GB. It refused nothing and stopped nothing.
   - The gates ran with 4.4–6.2 GB free.
   - The engine logs were copied out before the launch (`wf10/pre-install4-logs`) and after
     the close (`wf10/installed4-logs`).
3. **The backslash trap, once more.** A `node -e` in Git Bash that built the C13 target list
   lost a `\` and failed as a syntax error. That failure was loud, unlike the vacuous pass
   in the entry above. The list is now `scratchpad/wf10/c13-targets.mjs`, written through the
   editor.
4. **The gates on the tree of the public cut.** The exit fix's 18 of 18 were run before the
   review's fixes. So `node tools/verify.mjs` ran again, in three foreground batches of six
   (16:22–16:32), on the tree that was then committed and cut. The result was 18 of 18, and no
   tracked file changed.
