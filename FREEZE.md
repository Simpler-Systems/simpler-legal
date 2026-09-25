# FREEZE.md — v1-legal engine freeze (2026-07-24, owner ruling)

**Frozen means: no more walk-forward rounds unless a receipt breaks.** Doctrine changes
only by committed-script projection + owner ruling. The engine, rails, sweeps, profiles,
and instruments below are the version of record. Unfreeze conditions: a DIRECT leak in the
frozen configuration on real paper, or owner order.

*The commit hashes and tags this file cites name commits of the development history, which is
not published. `README.md`, "The git history", says why.*

## The frozen configuration (exact, per genre)

Server: llama-server via `tools/launch-server.cmd` (Windows) or `tools/launch-server.sh`
(POSIX) ONLY + probe-one-completion (assert non-empty) before any run. Those two scripts
carry the frozen serving flags — port 49400, ctx-size 8192, parallel 1, jinja, thinking
disabled — and locate the hash-pinned E2B via `locate-model.mjs` (the model and the
llama.cpp build are not repo assets). Scope note: every board here was produced on
Windows via the `.cmd`; the POSIX script hands llama-server identical argv but has no
board of its own. The llama.cpp backend is not itself frozen — BENCHMARK.md's provenance
records CPU serving for the v1/TAB baseline era, while the launcher of record points at a
CUDA build; the flags above are the frozen part. Substrate: `strip-batch.mjs --mode full`
(red v1 core, vendored byte-identical in `lib-core/`). *[the packaged app's transport around
this changed 2026-09-23; the argv did not — see "Transport changes, not configuration
changes"]*

**Product / EDGAR-shaped documents** (the product path):
```
apply-v2.mjs  --profile product --model --arms cite,rails,fs7,bizdate
apply-lq.mjs  --lq 1 --skip JOB
```
**Courts** (validation genre — owner recommendation on record):
```
apply-v2.mjs  --profile product --model --arms cite,rails,fs7,bizdate
apply-ln.mjs  --ln 0,1,2,3 --deglue --tables <substrate-tables>
apply-lq.mjs  --lq 1,2 --skip EMPLOYER,JOB
```
Gold doctrine: `derive-product-gold.mjs` P0–P0k (dates/amounts, companies/titles,
occupations, court artifacts, format shapes, geography, cultural figures — all
identity-anchor doctrine, all committed script). Scorer: word-bounded v2, selftest 8/8.

## Proven claims and their receipts

| Claim | Receipt |
|---|---|
| ~~**EDGAR: FOUR consecutive fresh-paper rounds, zero DIRECT leaks (60 unseen agreements)**~~ *[wrong — see Corrections C1]* | ~~ROUND4/5/6/7 boards~~; r7: 100.0/100%, NM 74.9 |
| *(C1, 2026-09-23)* **EDGAR: four consecutive fresh draws, zero DIRECT leaks in the redacted text (46 unseen documents — rounds 5, 6, 7 and the pure-OOS probe)** | ROUND5/6/7 + PUREOOS boards. 43 of the 46 carry a DIRECT gold span; 3 carry none and cannot leak. Rounds 5–7 each ran the engine as it stood at that round; of these 46, only the pure-OOS probe (n=1) ran this frozen configuration |
| *(C1, 2026-09-23)* **EDGAR round 4, the first draw under the current gold and scorer: 3 DIRECT spans leaked, all in 1 of its 15 documents — published as drawn** | ROUND4 board, 96.6 / gate 93%; the leaking file is `edgar-r4-13.txt`, gatePass false |
| **Analytical utility 0.968** (blind Opus Q&A, original vs masked, 121/125 EQUIVALENT) *[scope — see C3]* | `b4c7818`, pii-bench/utility-bench/ |
| **UK transfer: courts pack byte-unchanged → zero leaks** *[scope — see C4]* | ukprobe boards |
| **SGHCF pseudonym axis: parties' codes preserved; cited codes 14/14 (LN0 debut, scored)** | ROUND7 board + scheme fix `aa95438` *[receipt — see C5]* |
| **Release-side machinery: both known unmask-breaks closed, raced** | `6d0ce6e` + R8FIX board (both released names re-masked; zero collateral) |
| **Gold ceiling: 88.8%** (independent relabel agreement — the instrument's own limit) *[wrong — see C6]* | pii-bench/gold-ceiling/ |
| **Every leak ever found is named, mechanism-diagnosed, and either fixed-and-raced or on the shelf below** | ROUND4–7.md |
| **PURE-OOS (post-freeze receipt): 2026-filed doc, pre-registered rule, stripped via the LIVE adapter — 100.0 / gate 100%, NM 78.1 (campaign best), AND a 3-lens adversarial panel (name/identifier/inference) failed to refute: clean, zero findings** *[three parts wrong — see C2]* | PUREOOS-firstcontact board + `pureoos-manifest.json` |

## Courts status at freeze (honest)

Round-7 as drawn: DIRECT 97.7 / gate 84%; after the raced release-side fixes (in-sample):
98.3 / 84% — every remaining leaked span is a named add-side class on the shelf. Courts
DIRECT is NOT converged (each fresh draw surfaces 1–2 novel classes; that is the genre's
long tail, not instability). Courts documents are public; the genre's role is scientific
credibility, not product privacy. The restore machinery (the risky, subtractive half) has
no known unmask path after FS8b-2/FS10a; the add-only stack has never broken a gate by
construction.

## The shelf (open, named, deliberately not blocking freeze)

1. SG vehicle-plate rail + "bearing number" nomination (3 spans, sghcf-r7-01).
2. Initials-with-suffix alias ([initials + numeric suffix]).
3. Bare foreign single-name residue ([single given name]).
4. Counsel-name doctrine — owner question on record (real courts print counsel; round-7
   gold labeled counsel DIRECT; the counsel-name leak was double-fault).
5. Gold scheme note: bare definite role references ("the lieutenant") when the named
   person is separately labeled.
6. Courts QUASI grind (39–44 vs 88.8 ceiling) — compliance profile territory, deferred by
   strategy (the export-to-AI profile's bar is utility, measured at 0.968). *[the 88.8 is not
   a QUASI ceiling — see C6]*
6b. **The caption block and the "Re:" line** (2026-09-15) — after the firm profile, 8 of the
   11 remaining survivors over 20 filings sit in the first-page caption or a `Re:` subject
   line. *[7, not 8 — see C9]* Three named causes, each small: the docket rail is case-sensitive on the `cv`
   segment (`1:25-CV-08297` survives where `1:25-cv-08297` masks), a docket glued with no
   space (`,1:22-cv-10855(`) defeats the word-boundary rail, and no rail covers the
   arbitration `NN-NNNNN` shape. Separately, `usCaptionPartyRegions` reads a usable party
   list on only 7 of 20 documents — nothing on settlement agreements, `In re` bankruptcy
   captions and `§`-delimited Texas captions, and junk on several others. It did not cost
   privacy in that round because the COMPANY-never-released rule carries the load.
7. ~~Product wiring: app engine adapter~~ **CLOSED 2026-07-24** — `serve-legal.mjs` hosts
   this frozen configuration behind localhost:1436 (same committed scripts, genre router
   120/120 on rounds 5–7); app wired through the one-road-out chokepoint with honest
   fallback. **Live-proven**: product leg 18 s and courts leg 126 s end-to-end, mask
   geometry byte-identical to the frozen batch finals on both (residual drift = alias
   numbering + one Brand↔Company near-tie label, both classes mask — privacy-equivalent).
   Remaining app-shell work: the Tauri Rust organs port (packaged mode), dev/browser
   complete.

## Profiles added AFTER the freeze (additive; the frozen argv above is unchanged)

**`--profile firm` (2026-09-15)** — a third profile on `apply-v2.mjs`, reachable only when
a caller asks for it by name. It exists because the out-of-sample round of 2026-09-14
(OPS_LEDGER) measured the frozen configuration on a law firm's own shapes and found the
doctrine inverted on two points: on a firm's paper the party ORGANISATION is the matter's
identity, and precedent citations are the reason the file is being sent to a model at all.
Product doctrine releases the first and eats the second.

Firm inherits every product mechanic through a `BASE` constant and changes three things:
COMPANY and BRAND rows are never released; the US caption, party acronyms, and every
substrate row are propagated case-insensitively; and `citationKeepSpans` RELEASES reporter
citations after every sweep, skipping any citation that shares an identity token with this
matter's own parties. The identity set comes from `matterIdentityTokens`, which drops any
entity appearing ONLY inside citation shapes — without that cut the v1 core's COMPANY tag on
a cited case name makes every citation veto its own release (measured: 6 of 52 on one brief).

**Measured, 21 public filings in a firm's shapes, 20 scorable, 296 hand-listed identifiers**
(full boards and per-survivor mechanisms: OPS_LEDGER 2026-09-15):

| over both draws | frozen (product/courts) | firm |
|---|---|---|
| identifiers still readable | 27 | **11** |
| readable occurrences (of 1,444) | 45 | **11** |
| documents with a readable identifier | 14/20 | **8/20** |
| reporter citations kept | 9/82 (11%) | **46/82 (56%)** |
| email / phone / GUID left anywhere | 0 | 0 |

Both directions moved at once, because the two defects had one root: the engine could not
tell a party from a precedent. 96 released citation spans were audited for the dangerous
direction (a release running past its citation into prose); 0 flagged.

Not yet earned: firm has no sealed gold and no round board. It is a measured improvement on
hand-listed identifiers over 20 documents, not a fifth walk-forward round.

**The frozen profiles are unchanged, and that is a measured statement, not an argument.**
The pre-edit `apply-v2.mjs` and the edited one were run over the same eight round-7
documents under `--profile product` and `--profile courts`, deterministic mode, same argv:
outputs byte-identical, 8/8 files, both profiles. With `PROFILE='product'`, `BASE` equals
`PROFILE` and the firm flag is false, so no branch changes.

`serve-legal.mjs` (host, never frozen) exposes it as an explicit opt-in: `--profile firm`
as a server default, or `{profile:"firm"}` per request. The genre router is untouched —
genre still selects the LN and LQ stages; firm changes one argument of the v2 stage only.
An unknown profile is a 400, not a silent fallback to the other doctrine.

## Round-over-round record (first contact, each vs its own sealed gold)

*[Round 4 courts is not first contact — see C7]*

| Round | Courts DIRECT/gate | EDGAR DIRECT/gate |
|---|---|---|
| 4 | 98.9 / 92% | 96.6 / 93% |
| 5 | 99.4 / 92% | **100 / 100%** |
| 6 | 98.5 / 92% | **100 / 100%** |
| 7 | 97.7 / 84% | **100 / 100%** |

## Corrections (2026-09-23)

This file is the version of record, so nothing above is rewritten. Each wrong sentence stays
where it was, marked, and is quoted and corrected here with the file or commit that shows
it. None of these touches the frozen configuration; they correct what was claimed about it.

**C1 — the EDGAR zero-leak claim.** Quoted: *"EDGAR: FOUR consecutive fresh-paper rounds,
zero DIRECT leaks (60 unseen agreements) | ROUND4/5/6/7 boards"*. Round 4 is in that count
and it leaked: 3 DIRECT spans, all in `edgar-r4-13.txt`, `gatePass: false`
(`pii-bench/runs/ROUND4-edgar-firstcontact.json`, 96.6 / gate 93.3%). The clean run is rounds
5, 6, 7 and the pure-OOS probe: 46 documents, 184 DIRECT gold spans, 0 leaked, tallied from
the `perDoc` rows of the four boards. Three of the 46 (`edgar-r5-01`, `edgar-r5-15`,
`edgar-r6-09`) carry no DIRECT gold span and could not have leaked. Three limits the original
row did not state:
- Rounds 5–7 each ran the engine as it stood at that round (fix-sets FS7, FS8, FS9 —
  `BENCHMARK.md`). Round 7 was drawn (`a2df071`) before the last fixes (`6d0ce6e`) and the
  freeze commit (`04f3c5d`). Of the 46, only the pure-OOS probe, one document, met fresh
  paper with the configuration frozen here. The frozen configuration has since met 20
  scorable public filings in a law firm's shapes (2026-09-14/15, "Profiles added AFTER the
  freeze" above, the "frozen (product/courts)" column): hand-listed identifiers, no sealed
  gold, and an identifier left readable in 14 of the 20. *[incomplete — see C8]*
- Round 4 is the first draw under the current gold and scorer, not the first draw. Rounds 1–2
  ran earlier under the TAB-doctrine gold and scorer v1 and are not comparable
  (`ROUND5.md`, round-over-round table).
- Every leak number here is measured on plain text. It says nothing about a `.docx`'s or a
  PDF's other channels (`BENCHMARK.md`, "Scope of every leak claim").

On 2026-09-22 an uncommitted working-tree edit rewrote this row in place with no record here.
It was never committed: git shows the row unchanged since the freeze commit (`04f3c5d`). The
original is kept above, struck through, and the corrected rows beside it are marked C1.

**C2 — the pure-OOS receipt.** Quoted: *"PURE-OOS (post-freeze receipt): 2026-filed doc,
pre-registered rule, stripped via the LIVE adapter — … AND a 3-lens adversarial panel
(name/identifier/inference) failed to refute: clean, zero findings"*.
- *Post-freeze.* The document was filed on 2026-01-21 (`pii-bench/pureoos-manifest.json`),
  six months before the freeze and before this project's day zero (2026-07-19, `CLAUDE.md`).
  What post-dates the freeze is the draw (`e25637d`, 2026-07-24 18:24 +0800) and the run; the
  freeze commit is `04f3c5d`, 10:31 the same day. The document is unseen because it was in
  no earlier draw, not because it was written later.
- *Pre-registered.* The rule (`build-pureoos.mjs`) and its result (the manifest) first appear
  together, in `e25637d`. Git holds no earlier registration. The rounds are the same:
  `build-round4.mjs`, `build-round6.mjs` and `build-round7.mjs` first appear in their draw
  commits (`ddf83c6`, `81fe4c8`, `a2df071`), and round 5's builder and manifest first appear
  in `11bc737`, a fix-verification commit. For rounds 6 and 7 the recipe is in the round
  write-up committed about 80 seconds before the draw (`4ecee03` → `81fe4c8`, `c72b7d7` →
  `a2df071`). None of this is pre-registration in the sense a methodologist means.
- *The panel.* Its only trace is the message of commit `48adcd9`. No prompt, output or
  finding is committed anywhere in the tree, so it is not a receipt and is withdrawn.
- The receipt this row cites, `pii-bench/pureoos-manifest.json`, still says both in its
  `protocol` line ("rule pre-registered", "scored + adversarially leak-hunted"). The
  manifest is left as drawn; those two phrases in it are withdrawn with the row.

What stands: the gold was sealed at `324d84a` (18:26) before the board at `48adcd9` (18:31),
and the board (`PUREOOS-firstcontact.json`) reads 100.0 / gate 100%, QUASI 47.1, NM 78.1, with
3 DIRECT spans in the gold and none readable. NM 78.1 is the highest of the EDGAR
first-contact boards (74.2, 72.3, 66.3, 74.9), on one document. That it was stripped through
the live adapter is recorded in the manifest's `protocol` line and the commit message; the
board records only its stripped directory.

**C3 — utility 0.968.** Quoted: *"Analytical utility 0.968 (blind Opus Q&A, original vs
masked, 121/125 EQUIVALENT)"*. The figure is right; its place among the frozen engine's
claims is not. The masked copies are round-4 paper stripped by the round-4 engine
(`pii-bench/utility-bench/harness-v1.js:20-21` reads `raw/stripped/r4-*-FINAL`), before the
freeze. The two analysts each read one side, but the judge is told which answer came from
the redacted copy and that placeholder-for-name substitutions count as equivalent (`:46`),
and the question writer was told not to ask anything whose answer is a name, date, address
or other identity (`:26`). The 4 DIVERGENT verdicts are all on `edgar-r4-04`; the result file
keeps three reasons, two of which say the original-side answer was empty and one that it
missed the question (`v1-round4-result.json`).

**C4 — UK transfer.** Quoted: *"UK transfer: courts pack byte-unchanged → zero leaks"*. The
board was scored 2026-07-23T17:14Z (`UKPROBE-firstcontact.json`; commit `eb3329d`), before
the round-6 and round-7 fix-sets (`692de46`, `ae154ac`) and the freeze. "Byte-unchanged"
means not changed for the UK: the pack was the one standing that night, not the one frozen
here, and `pii-bench/runs/` holds no UK board for the frozen configuration. The board reads
100.0 / gate 100%, QUASI 40.0, NM 54.2.

**C5 — 14/14 cited codes.** Quoted receipt: *"ROUND7 board + scheme fix `aa95438`"*. The
round-7 board carries DIRECT, QUASI and NM per document and in aggregate; no cited-code count.
The 14/14 is recorded in `ROUND7.md:60`. The Family Court gold behind it is withheld
(`WITHHELD.md` §3), so it cannot be recomputed from this repository.

**C6 — the gold ceiling.** Quoted: *"Gold ceiling: 88.8% (independent relabel agreement — the
instrument's own limit)"*. It was not a relabel. `pii-bench/gold-ceiling/build-ceiling-sample.mjs`
drew 240 entities (120 courts, 120 EDGAR) from `pii-bench/oos-labels-product` — the product
gold of the 100-document development set — and skipped every DIRECT entity; the key holds
203 NO_MASK and 37 QUASI calls. Eight agents gave one MASK/KEEP verdict per entity without
seeing the gold (`verdicts.json`: "Cold re-adjudication of 240 QUASI/NO_MASK gold calls",
`agentCount` 8). `node pii-bench/gold-ceiling/score-ceiling.mjs` prints 213/240 = 88.8%
(courts 107/120 = 89.2%, EDGAR 106/120 = 88.3%). What it does not show:
- anything about the DIRECT labels, which were not sampled;
- a ceiling on QUASI recall (shelf item 6 sets one against the other): it is an agreement
  rate on mask-or-keep calls, and with 203 of 240 calls KEEP, answering KEEP every time
  would agree on 203 (84.6%);
- a limit for the round boards: it was measured on 2026-07-23 (`a266114`), before P0f
  (`694b4c4`) and the projections after it, which the round-4 instrument-v2 board and the
  rounds 5–7 boards are scored under. It was not re-measured under them.

**C7 — round-over-round, round 4 courts.** Quoted: the heading *"first contact, each vs its
own sealed gold"* over the row *"4 | 98.9 / 92% | 96.6 / 93%"*. The courts figure is the
instrument-v2 board (`ROUND4-courts-instrumentv2.json`), rescored after engine contact under
P0f (`694b4c4`), which stopped counting the court's own anonymisation codes, correctly kept by
the engine, as leaks. Round 4 courts as drawn is 87.9 / 76% (`ROUND4-courts-firstcontact.json`).
`ROUND4.md` publishes both. The EDGAR figure is first contact; P0f changes nothing there.

**C8 — what the frozen configuration has run on since the freeze.** Quoted (C1, above): *"The
frozen configuration has since met 20 scorable public filings in a law firm's shapes"*. Before
those filings it ran on 26 `.docx` files from gov.uk on 2026-09-13, in the app's first
real-document trial through the packaged app's engine organs: 24 results, 2 refused
`ALIGN-FAILED`, 54.6 min (`OPS_LEDGER.md` 2026-09-13, step 3, which records the engine as
frozen throughout). That entry says a survivor scan was run on the 24 and records no result,
and no result is recorded anywhere else in the tree. That run carries no leak figure and none
is claimed for it. C4 stands as written: `pii-bench/runs/` holds no UK board for the frozen
configuration, and no UK judgment has been scored under it.

**C9 — shelf 6b, the caption-block count.** Quoted: *"after the firm profile, 8 of the 11
remaining survivors over 20 filings sit in the first-page caption or a `Re:` subject line"*.
The file of record says 7: *"Four of the five draw-1 survivors and all three draw-2 dockets
sit in the same two places"* (`OPS_LEDGER.md` 2026-09-15, "What still survives, by
mechanism — all 11"), and its table places none of the other four in a caption or a `Re:` line: `IBLLC` is
mid-sentence, and the district attorney's office and the two fee amounts are listed by what
they are, with no caption or `Re:` mechanism.
The three named causes in 6b are unchanged.

**C10 — the transport note's count of edited frozen files, and the command it gave.** Quoted
("Transport changes", below): *"Two frozen files carry an uncommitted comment-only edit that
drops a name `WITHHELD.md` §3 withholds: `apply-v2.mjs` (two comment lines) and
`lib-legal/sweeps.mjs` (one)"*, verified by a `git diff HEAD` of those two files. Three frozen
files carry that edit: `derive-product-gold.mjs`, the gold doctrine named above, has one
comment line changed the same way. `git diff HEAD --numstat -- apply-v2.mjs
derive-product-gold.mjs lib-legal/sweeps.mjs` reads 2/2, 1/1 and 1/1, and no other file under
`lib-core/` or `lib-legal/`, no `apply-*` script, `strip-batch.mjs` or `tools/launch-server.*`
differs from HEAD. The command the note gave prints the removed lines, and with them the name;
it is struck through above. This one shows the same thing without printing a line: it counts
the changed lines that are not comment lines, and prints 0 (8 lines changed, 2026-09-23):
```
git diff HEAD -U0 -- apply-v2.mjs derive-product-gold.mjs lib-legal/sweeps.mjs | grep -E '^[-+][^-+]' | grep -cvE '^[-+][[:space:]]*(//|\*|/\*)'
```
What the edit does not reach, counted on 2026-09-23. Each command below takes the name in `$T`
(the owner has it; this file does not) and prints paths and counts only, never the name:
- **Git history, over twelve paths, not three** *[and three commit messages and the reflog,
  which neither command below reads — see C12; and Family Court text in two more run boards,
  two pages' history, a round write-up as tagged and a fourth commit message — see C13]*. `git grep -c -w "$T" HEAD` finds it in the
  three files above. The tag `v1-legal-frozen`, which is an ancestor of `master`, holds it in
  twelve (`git grep -c -w "$T" v1-legal-frozen`): those three; `ROUND4.md`;
  `sghcf-r4-05.json` in `pii-bench/round4-gold/`, `pii-bench/round4-gold-product/` and
  `pii-bench/round4-labels/`; and five run boards in `pii-bench/runs/`
  (`ROUND4-courts-firstcontact.json`, `ROUND4-courts-instrumentv2.json`,
  `R5FIX-insample-courts.json`, `R5FIX-insample-courts-v2.json`,
  `R5FIX-insample-courts-v3.json`). `git log --all -S"$T" --format= --name-only | sort -u`
  lists the same twelve. The same history also holds the gold as span text, the Family Court
  annotations among it (`README.md`, "Data statement").
- **This tree's build output.** `app/src-tauri/target/release/engine/` carries it three times
  (`apply-v2.mjs` 2, `lib-legal/sweeps.mjs` 1:
  `grep -rcw --include="*.mjs" "$T" app/src-tauri/target/release/engine`). The app built
  into `target/release` loads its engine from that folder (`engine.rs`, `engine_root`).
- **The distributable tree** (`../simpler-legal-app`, beside this repository; `OPS_LEDGER.md`
  step 6) carries it six times: three in its own `apply-v2.mjs` and `lib-legal/sweeps.mjs`,
  whose files predate the edit, and three in its `app/src-tauri/target/release/engine/`.
- **Both built installers**, `app/src-tauri/target/release/bundle/nsis/simpler.legal_0.1.0_x64-setup.exe`
  in this tree and in the distributable tree, both built 2026-09-13, before the edit: each
  carries it three times, in `engine\apply-v2.mjs` and `engine\lib-legal\sweeps.mjs`
  (extracted with 7-Zip and counted the same way).

So before a push of `master` or ~~the tag~~ *[there are two tags; either one — see C11]*,
or a handover of the repository, the distributable
tree or either installer: the history is to be rewritten over all twelve paths and the gold's
span text *[and the three commit messages, with the reflog expired — see C12]*, the
distributable tree re-assembled with `tools/make-download-tree.mjs`, and both
installers rebuilt. How the history is rewritten is an owner decision. `git remote -v` printed
nothing on 2026-09-23.

**C11 (2026-09-24) — C10 names one tag; the repository has two.** Quoted (C10): *"So before a
push of `master` or the tag"*. `git tag -l` prints `v1-legal-FROZEN-v12` (`c062b2c`,
2026-07-22) and `v1-legal-frozen` (`04f3c5d`, 2026-07-24). Both are ancestors of `master` and of
`f2c22eb`, the commit that turned the gold into offsets (`git merge-base --is-ancestor <tag>
f2c22eb` succeeds for each). Counted on 2026-09-24: `git grep -c -w "$T" v1-legal-FROZEN-v12`
prints nothing, so that tag does not hold the name C10 is about, and it holds none of the 80
Family Court label files; but it holds 100 gold files with their span text (7,378
annotations), 25 of them the files of Singapore judgments in `pii-bench/oos-labels/` (3,213
annotations, 371 DIRECT), whose source text is not redistributed (`README.md`, "Data
statement"). A rewrite of `master` and `v1-legal-frozen` that leaves `v1-legal-FROZEN-v12` in
place still publishes that gold with `git push --tags`, `--mirror` or a copy of `.git`. So the
rewrite C10 calls for covers every tag: each is deleted or re-cut on the rewritten history, ~~and
afterwards `for t in $(git tag -l); do git merge-base --is-ancestor "$t" f2c22eb && echo "$t"; done`
prints no tag, and C10's `git log --all -S"$T" --format= --name-only` prints no path. Neither
command checks span text; nothing committed counts it, so that check is the owner's to run
with the rewrite~~. *[The tag check passes a rewrite that left a tag behind, and neither
command reads commit messages — see C12 for the checks that replace them.]*

**C12 (2026-09-24) — C11's after-rewrite check cannot fail, and C10 and C11 miss the commit
messages.** Quoted (C11): *"afterwards `for t in $(git tag -l); do git merge-base
--is-ancestor "$t" f2c22eb && echo "$t"; done` prints no tag"*. A rewrite and a garbage
collection remove `f2c22eb` itself, so every `merge-base` in that loop fails with "fatal: Not
a valid object name" and nothing is printed, whether the tags were re-cut or left in place.
Reproduced in a scratch repository shaped like this one (a tag on a commit holding span
text, then an offsets commit, then `master` squashed to a fresh root with the tag left alone,
then `git reflog expire --expire=now --all` and `git gc --prune=now`): the loop printed
nothing, and `git show <tag>:gold.json` still printed the span text. The check is struck
through above.

Quoted (C10): *"Git history, over twelve paths, not three"*. The name is also in the messages
of three commits: `git log --all --format=%B | grep -ciw "$T"` prints 3, and
`git log --all -i --grep="$T" --format=%h` prints `11bc737`, `ca307d6` and `694b4c4` (all
2026-07-23, all ancestors of `master` and of `v1-legal-frozen`, none of
`v1-legal-FROZEN-v12`). `git grep` and `git log -S` read file contents only, so neither
command C10 gives sees them, and a rewrite that filters paths keeps every commit's message.
The reflog repeats the messages: `.git/logs/HEAD` and `.git/logs/refs/heads/master` each
carry the name three times (`grep -rIlciw "$T" .git --exclude-dir=objects` lists only those
two files). Neither tag's own message carries it, and there are no notes and no stash
(counted 2026-09-24).

So the rewrite also replaces those three messages (or squashes past them), and before a push
or any copy of `.git` leaves: `git reflog expire --expire=now --all` and
`git gc --prune=now`. Afterwards each of these must print nothing, and any "fatal" from them
counts as a failure, not a pass:
```
git log --all --format=%h -S'"span_text"' -- pii-bench
for t in $(git tag -l); do git grep -q '"span_text"' "$t" -- pii-bench && echo "$t"; done
git log --all -S"$T" --format=%h
git log --all --format=%B | grep -iw "$T" | wc -l | grep -v '^0$'
git for-each-ref refs/tags --format='%(contents)' | grep -ciw "$T" | grep -v '^0$'
grep -rIlw -i "$T" .git --exclude-dir=objects
```
The first two read content, not ancestry, under `pii-bench/`, where the gold lives (this
file quotes the string, so the whole tree would never read clean): at HEAD no
file there carries `"span_text"` (`gold-ceiling/build-ceiling-sample.mjs` mentions it without
the quotes), and on 2026-09-24 the first listed 10 commits and the second both tags.
The third to sixth never print the name; they print a hash, a count or a path.
*[These six can all print nothing while Family Court text is still in the history: they read
the key `"span_text"` and one name, and the text also stands in run boards, in two pages'
history, in ROUND7.md as tagged and in a fourth commit message — see C13.]*

**C13 (2026-09-24) — C12's checks, and C10's inventory, miss Family Court text held outside
`span_text`.** Quoted (C12): *"Afterwards each of these must print nothing"*. The first two
checks look for the key `"span_text"`, the other four for the one round-4 name in `$T`. The
history holds identifying text from the Family Court judgments (the DIRECT annotations of the
80 label files `v1-legal-frozen` holds) in places none of the six reaches. Counted on
2026-09-24 by scripts that print indices, counts and paths only, never a span:
- **Run boards.** Before `90a82d7` (2026-07-26) a board recorded each leaked span as its text,
  in the `leakedSpans` array of a `perDoc` row, written across lines, with no `"span_text"`
  key. At `v1-legal-frozen`, seven boards carry Family Court text that way, 39 strings in
  all, every one a span that its own judgment's label files annotate DIRECT: 12 PERSON (6 of
  them one to three characters long) and 27 CODE (4 of them three characters long); 27 of the
  39 are also marked NO_MASK in another of that judgment's label files. Five of
  the seven are among C10's twelve paths (`ROUND4-courts-firstcontact.json` 28 strings,
  `ROUND4-courts-instrumentv2.json` and the three `R5FIX-insample-courts*.json` 1 each); two
  are not: `R8FIX-insample-courts.json` (3) and `ROUND7-courts-firstcontact.json` (4). Across
  every ref, 35 versions of boards in 16 commits hold leaked spans as text. Boards record
  `{category, length, digest}` only from `90a82d7` on; that commit is an ancestor of `master`
  and of `f2c22eb` and of neither tag.
- **Two pages.** A three-word PERSON DIRECT span of `sghcf-r7-01`, and CODE DIRECT spans of
  the same judgment, stood in `app/frontend/public/benchmark.html` (from `072cc77`) and
  `site/research.html` (from `5864e87`), both 2026-07-24, until `90a82d7` removed them.
  Neither path is among C10's twelve, and neither commit is an ancestor of `v1-legal-frozen`;
  both are ancestors of `master`.
- **A round write-up.** `ROUND7.md` as added in `c8f2e68` (2026-07-24, an ancestor of
  `master`, of `v1-legal-frozen` and of `f2c22eb`, not of `v1-legal-FROZEN-v12`) carries three
  CODE DIRECT spans of `sghcf-r7-01` (9, 8 and 8 characters, none with the court's `XX`) on its
  line 71, until `90a82d7` removed them. It is not among C10's twelve paths and carries neither
  the key nor the name C12 searches.
- **A fourth commit message.** `6d0ce6e` (2026-07-24, an ancestor of `master`, of
  `v1-legal-frozen` and of `f2c22eb`) carries that PERSON span in its message. It does not
  carry `$T`, so C12's fourth check passes it (`git show -s --format=%B 6d0ce6e | grep -ciw
  "$T"` prints 0). No tag message carries Family Court text.
- **The reflog.** `.git/logs/HEAD` and `.git/logs/refs/heads/master` each carry that span
  once, besides the name C12 counts.

What does not reach this far: at HEAD, the only Family Court DIRECT text of eight characters or
more is the name in the three frozen files C10 names; and none of the tracked files as they
stand in the working tree carries any of it.

The checks that replace C12's, as far as a check can. Before the rewrite, write the Family Court
DIRECT spans of eight characters or more, less the ones the court itself masked with `XX`, to a
file `$P` outside the repository; this prints 69 lines from `v1-legal-frozen` and must be run
before the rewrite removes the tag:
```
node -e "const x=(c)=>require('child_process').execSync(c,{maxBuffer:1<<28}).toString();const s=new Set();for(const p of x('git ls-tree -r --name-only v1-legal-frozen -- pii-bench').split('\n').filter((p)=>/sghcf-[^/]*[.]json$/.test(p)))for(const e of JSON.parse(x('git show v1-legal-frozen:'+p)).entities||[])if(e.identifier_type==='DIRECT'&&e.span_text&&e.span_text.length>=8&&!/XX/.test(e.span_text))s.add(e.span_text);console.log([...s].join('\n'))" > "$P"
```
An empty or short `$P` makes every check below print nothing, which reads as a pass: `grep
-f` with an empty pattern file matches no line, and the command above leaves an empty `$P` when
the tag is already gone or it is run outside the repository. So before any check, this must
print nothing; a `$P` of any other length is a failure, not a pass:
```
test "$(grep -c . "$P")" -eq 69 || echo "FAIL: \$P has $(grep -c . "$P") lines, expected 69"
```
After the rewrite, the reflog expiry and the garbage collection, each of these must print
nothing, and any "fatal" counts as a failure. The figure after each is what it printed on
2026-09-24:
```
git log --all --format=%B | grep -cFf "$P" | grep -v '^0$'                                  # 4
git for-each-ref refs/tags --format='%(contents)' | grep -cFf "$P" | grep -v '^0$'          # nothing
git log --all -p --format= | grep -cFf "$P" | grep -v '^0$'                                 # 515
grep -rIlFf "$P" .git --exclude-dir=objects                                                 # 2 paths
node -e "const x=(c)=>require('child_process').execSync(c,{maxBuffer:1<<28}).toString();for(const c of x('git rev-list --all -- pii-bench/runs').split('\n').filter(Boolean))for(const p of x('git show --format= --name-only '+c+' -- pii-bench/runs').split('\n').filter((p)=>p.endsWith('.json'))){let j;try{j=JSON.parse(x('git show '+c+':'+p))}catch{continue}if((j.perDoc||[]).some((r)=>(r.leakedSpans||[]).some((s)=>typeof s==='string')))console.log(c.slice(0,7)+' '+p)}"   # 35 lines
```
C12's six still run beside these. What these cannot show: 30 of the 130 distinct Family Court
DIRECT spans are shorter than eight characters and are left out of `$P`, because text that
short also stands in ordinary files (a one-character span and a six-character one match the
app's own test fixtures, `app/extract/make-fixture-scan.mjs`); and `git log -p` shows no text
for a binary file. The one rewrite measured against all of it is a squash of `master` to a
single root whose tree is the working tree as it stood on 2026-09-24, with both tags deleted
or re-cut on it; a root at HEAD would keep the name in three files (C10). `$P` is the list the
rewrite exists to remove: it is never committed or sent, and it is deleted after the checks.

**C14 (2026-09-24) — the relay no longer passes every answer straight through.** Quoted
("Transport changes", below): *"The request body is copied as framed and the response is
copied back"*, and *"Inference inputs and outputs are unchanged by construction"*. Under owner
ruling 15 (`relay.rs`, module header), the relay reads whole, before forwarding a byte of it,
each non-streamed chat-completions answer to a call allowed 300 tokens or more or with no
limit set (the chain's extraction and residue calls; `WHOLE_FROM`). If that answer does not
end on `finish_reason` `"stop"` with text in it, the run is stopped as a model change stops
it: the frozen result for that document is refused and the app's own core reads it. A call
that gets no answer at all (an HTTP error status, an answer that broke off, a connection
closed with the call open, the chain's own 45-second abort) stops the run on any
chat-completions call. The 4-token and 6-token calls are forwarded as they arrive,
`finish_reason` unread. The reason, from the same header: the frozen chain reads
`choices[0].message.content` and never `finish_reason`, and every stage after the first counts
a failed call and goes on, so a cut-off or lost answer left names untagged under a run that
reported complete. An answer that passes is forwarded as the model framed it, byte for byte
(`relay.rs`, the comment in `a_long_calls_answer_is_read_through_its_framing`). So the
inference is unchanged, but what the app does with a document is not: an answer the chain
would once have used is now a refusal of the frozen result. The relay's tests for it are
`an_answer_that_did_not_finish_on_a_long_call_stops_the_run_and_is_not_forwarded`,
`a_call_that_gets_no_whole_answer_stops_the_run`,
`a_pipeline_that_hangs_up_on_an_open_call_stops_the_run` and
`each_answer_on_a_connection_is_read_by_its_own_calls_rule`; they were not run for this entry.
How often a live run trips on this is not measured.

**C15 (2026-09-24) — a document's result waits for its calls, and each run has its own port on
the relay.** Quoted ("Transport changes", below): *"The adapter's `--llama` and
`SIMPLER_LLAMA_PORT` name the relay's port"*. Under owner ruling 20 two things changed, neither
an inference setting. First, `RunGuard::finish` (`relay.rs`), which decides whether the frozen
result for a document may be used, no longer answers at once: it waits up to twice
`HANG_UP_GRACE` (500 ms, `relay.rs`) for that run's calls to be answered or cut, and a call
still open after that stops the run, so the frozen result is refused and the app's own core
reads the document. The reason, from the comment on `finish`: the chain gives up on a call at
45 s, writes the document without it and ends the stream, and the relay read that hang-up as
a lost call only `HANG_UP_GRACE` later, so the verdict read at once was that nothing was
wrong, the frozen output was used with what that call was there to find left readable, and
the stop landed on the next document instead. Second, each document's `/strip` now names its
own run's port on the relay as `llamaPort` (`engine.rs`, `strip_body`); until this change it
named the relay's shared port, on which every call counts toward every run active, so under
the wait one document's open call would hold another's finish (the comment on that test). The adapter's `--llama` and `SIMPLER_LLAMA_PORT`
still name the shared port, which `/health` and the service's own checks use
(`serve-legal.mjs`, header "The model port, per run"). The app's words for such a document say
its result was not used, never that the run stopped partway (`engine.rs`, `incident_words`).
The tests are `a_documents_result_is_read_only_when_none_of_its_calls_is_open` and
`a_call_open_on_one_documents_run_neither_holds_nor_trips_another` (`relay.rs`) and
`a_documents_strip_sends_its_own_runs_port_as_the_model` (`engine.rs`); `cargo test` in
`app/src-tauri`, run by `tools/verify.mjs`'s `rust-unit` gate for this entry on 2026-09-24 on
Windows, passed. None of them runs the frozen chain against a live model server. How often a live run is refused on this is not measured. The wait adds
nothing where no call of the run is open when its result arrives (`wait_settled` returns at
once), and at most one second where one is.

## Transport changes, not configuration changes (2026-09-23)

What changed is how the packaged app reaches the model server and what that server exposes
besides inference. The frozen argv above, the launcher (`tools/launch-server.cmd`, unchanged
in git) and every stage's arguments did not change, and no executable line of the chain's
scripts changed. ~~Two frozen files carry an uncommitted comment-only edit that drops a name
`WITHHELD.md` §3 withholds: `apply-v2.mjs` (two comment lines) and `lib-legal/sweeps.mjs`
(one) — `git diff HEAD -- apply-v2.mjs lib-legal/sweeps.mjs`.~~ *[three files, not two, and
that command prints the name it says was dropped — do not run it; see C10]*
- The chain's model calls go through a relay inside the app (`app/src-tauri/src/relay.rs`).
  The adapter's `--llama` and `SIMPLER_LLAMA_PORT` name the relay's port, and the relay
  forwards to the model on 49400 only after Windows names the checked model process as the
  owner of that connection's far end. It forwards `GET /health` and
  `POST /v1/chat/completions` only, one at a time, with `Host` rewritten, the client's
  `Authorization` removed and this launch's key added. The request body is copied as framed
  and the response is copied back. *[Since 2026-09-24 an answer to a long call is read whole
  first and can stop the run instead — see C14. Since 2026-09-24 each document's stages reach
  the relay on a port of that run's own, and its result waits for its calls — see C15.]*
- The model server the app starts is given `LLAMA_ARG_ENDPOINT_SLOTS=0` (no `/slots` page),
  `LLAMA_API_KEY` (a key made at each launch) and `LLAMA_LOG_VERBOSITY=3` through its
  environment, and twelve `LLAMA_ARG_*` / `LLAMA_LOG_FILE` settings are removed if the user's
  environment set them (`engine.rs`, `spawn_launcher`). llama.cpp reads an environment name
  only where the argv does not set the same thing, and the frozen argv sets none of these.
- Every process the app starts has the proxy variables removed and `--use-env-proxy` taken
  out of `NODE_OPTIONS` (`engine.rs`, `scrub_proxy`); `serve-legal.mjs`, which is not frozen,
  refuses to start by hand when Node is told to use the proxy for its calls
  (`NODE_USE_ENV_PROXY` or `--use-env-proxy`, with `HTTP_PROXY` set and `127.0.0.1` not
  in `NO_PROXY`; `proxyHazard`). Without that switch Node does not use the proxy variables,
  and the service starts.

Inference inputs and outputs are unchanged by construction: the body the chain sends is the
body the model receives, and none of the settings above is an inference setting. *[What the
app does with an answer is no longer unchanged: one that did not finish now refuses the frozen
result — see C14; one whose call is still open when the result arrives, too — see C15.]*
Evidence:
`relay.rs` test `forwards_with_the_key_its_own_host_and_none_of_the_clients_credentials` (the
body arrives byte for byte) and `engine.rs` test
`a_proxy_in_the_environment_carries_nothing_after_the_scrub` (`cargo test` in
`app/src-tauri`); `app/frontend/test/service-lifecycle.mjs` law 7. Not shown yet: no run of
the frozen chain through the relay against a live model server is recorded, and the key and
`/slots` settings were not run against a live server by the change that added them (`engine.rs`,
the comment above `LLAMA_API_KEY`). The app checks on the running server that a request
without the key is refused and that `/slots` cannot be read without it, and says so in
Settings if either check fails (`model_notes`). While the key is in force, the unkeyed
`/slots` probe gets 401 whether or not the endpoint is off, so the slots setting itself is
not observed. A byte-identical comparison of the chain's
output with and without the relay would be the receipt, and it has not been made.
