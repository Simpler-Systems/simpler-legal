# ROUND7.md — walk-forward round 7 (2026-07-24)

Owner ruled all three doctrine recommendations ("run it"): P0i geography, P0j cultural
figures, P0k occupation-noun boundary — plus the two round-6 engine rails. One principle
underneath: **the identity-anchor test** (ratified for dates P0, companies P0b, now
geography/figures/occupations).

## The fix-set (committed `ae154ac`, `bd98ed8` before any race)

- **FS9a account-fragment alias rail** — "account number ending in [account tail]" nominates the
  fragment, propagates document-wide as [Id] ("the [tail] account" ×11). Add-only.
- **LN0 cited-code KEEP rail** — deterministic, anon-court docs only, strict
  `CAPS{1,4} v CAPS{1,4} [` shape (negative control: uppercased real-name captions refuse).
  v2 in the same session: split-at-boundary for glued regions (alias propagation glues
  code+cite+alias; v1 kept 6/9 cited codes, v2 dry-run restored all 3 residuals).
- **P0i geography projection** — jurisdictional machinery keeps (90 flips), person/address
  anchored stays QUASI (173 kept). The spot-check BEFORE first race caught street addresses
  flipping ("1460 Shoreline Way" — plausibly an executive's home in a notice block);
  address-shape + notice-context guards added, fail-closed.
- **P0j cultural-figures projection** — the only projection permitted to touch DIRECT;
  possessive-before-quoted-work on every occurrence + no token shared with any other
  PERSON. Exactly 1 flip in 40 docs (Mendelssohn).
- **P0k occupation-noun boundary** — recorded (compliance profile); product gold unchanged.

## In-sample race (burned round-6 paper vs P0i/P0j gold)

| Pack | DIRECT | gate | QUASI | NM |
|---|---|---|---|---|
| Courts (25) | **100.0** | **100%** | 44.5 | 56.2 |
| EDGAR (15) | **100.0** | **100%** | 72.1 | 64.9 |

Round-6 leak classes verified closed on the finals: all four account fragments masked
everywhere; Mendelssohn kept and correctly scored. Cited-code scratch check: LN0 v1 6/9 →
v2 9/9 on the residual docs (invisible to boards until the round-7 gold scheme fix below).

## Fresh paper (the exam — pre-registered, published as drawn)

*[Corrected 2026-09-23 — "pre-registered" is withdrawn. `build-round7.mjs` first appears in
the draw commit `a2df071`, together with `pii-bench/round7-manifest.json`; git holds no
earlier registration of the rule (`FREEZE.md` C2). "Published as drawn" stands.]*

Draw (zero overlap with oos/r4/r5/r6): 15 edgar-r7 (fresh queries: "severance agreement",
"letter agreement") · 10 us-r7 (next unused ascending F.3d) · 10 sg-r7 (2020 SGHC — fresh
year) · 5 sghcf-r7 (2021 SGHCF letter-coded). Gold scheme upgrade (the round-6 instrument
find): labelers and auditors now explicitly list letter codes INSIDE case citations as
entities (NO_MASK per the genre rule) — closing the shared blind spot so LN0's work is
scored for the first time. Cultural figures stay raw-labeled (P0j projects them — doctrine
lives in the committed script, not the labeling). Blind swarm gold sealed BEFORE engine
contact, one race, boards as drawn.

| Pack | DIRECT | gate | QUASI | NM |
|---|---|---|---|---|
| Courts (25) | 97.7 | 84% (21/25) | 39.5 | 55.1 |
| EDGAR (15) | **100.0** | **100%** | 43.4 | **74.9** |

### Exam verdicts

1. **EDGAR: THIRD consecutive fresh-paper round at zero DIRECT leaks** — 45 unseen
   agreements across rounds 5–7. NM 74.9 is the genre's best.
   *[Corrected 2026-09-22 — originally "FOURTH consecutive … 60 unseen agreements across
   rounds 4–7". Round 4 leaked 3 DIRECT spans in `edgar-r4-13.txt` (`gatePass:false`), so it
   is not part of the run. With the post-freeze pure-OOS probe the published claim is 46
   documents across four consecutive clean draws — see `FREEZE.md` and `README.md`.]*
2. **LN0's first scored outing: 14/14 cited codes preserved** on the fresh SGHCF docs — a
   class losing ~half its instances before the rail, now perfect and finally visible to
   boards (the round-7 scheme fix worked: every SGHCF label lists its code-pairs).
3. **Round-6 fix classes all held** — no account-fragment, nickname, or collision-class
   recurrence where captions parse. FS9a/P0i/P0j behaved exactly as raced.
4. **Courts 97.7/84% — the roughest courts board since round 4, and the most informative.**
   8 leaked spans, 5 classes, ALL diagnosed to mechanism same-session:
   *[Corrected 2026-09-23 — originally "7 leaked spans". The board counts 8 of 343 DIRECT
   spans leaked, 335 masked (`pii-bench/runs/ROUND7-courts-firstcontact.json`, `perDoc`), and
   the list below adds to 8: 2 + 3 + 1 + 1 + 1.]*
   - **Two release-machinery gate breaks** (the priority class — the engine UNMASKED
     correct masks): "Tan" — LN2 released judge [judge name] while defendant 3 was [party name]; the numbered multi-party caption ("Between…(3) [party name]…Defendants")
     defeats every caption rail, leaving FS8b's veto empty. "[three-part personal name]" — v1 glued counsel person + firm under ONE [Company] tag, dodging every
     person guard; LN1 released it as an institution. **Both fixed same-session
     (`6d0ce6e`: FS8b-2 numbered-caption veto tokens, FS10a LN1 glue/counsel-context
     guards), dry-run proven on the exact leak docs; they race on round-8 paper.**
   - **SG vehicle plates** ([three SG vehicle plates, format SXX 0000X] — "bearing number X"): new
     deterministic rail class, add-only, round-8.
   - **[initials + numeric suffix]**: initials-alias with numeric suffix ([personal name]'s 4th affidavit) — alias
     rail extension, round-8.
   - **[single given name]**: bare foreign single name in a footnote minute-sheet reference — L-B residue
     miss, hardest of the five.
   - **"the lieutenant"**: CONTESTED LABEL — a bare definite role reference (the named
     officer is separately labeled and masked) marked DIRECT against the scheme's own
     role-word rule. As drawn = leak; scheme clarification queued for round-8 gold.

## Round-over-round (first-contact numbers, each vs its own sealed gold)

| Round | Genre | DIRECT/gate | QUASI | NM |
|---|---|---|---|---|
| 4 | courts / EDGAR | 98.9 / 92% · 96.6 / 93% | 30.2 · 33.8 | 56.6 · 74.2 |
| 5 (FS7+P0g) | courts / EDGAR | 99.4 / 92% · 100 / 100% | 39.4 · 29.5 | 58.2 · 72.3 |
| 6 (FS8+P0h) | courts / EDGAR | 98.5 / 92% · 100 / 100% | 44.4 · 68.9 | 56.0 · 66.3 |
| 7 (FS9/LN0/P0i-j) | courts / EDGAR | 97.7 / 84% · **100 / 100%** | 39.5 · 43.4 | 55.1 · **74.9** |

*[Corrected 2026-09-23 — the round-4 courts cells are not first contact. They are the
instrument-v2 board (`ROUND4-courts-instrumentv2.json`), rescored after engine contact under
P0f. Round 4 courts as drawn is 87.9 / 76%, QUASI 30.3, NM 56.8
(`ROUND4-courts-firstcontact.json`); `ROUND4.md` publishes both, and `FREEZE.md` C7 corrects
the same row there.]*

The courts wobble is the design working: each fresh draw finds the next caption format,
glue pattern, or ID class, and every class lands named-and-fixed. *[Corrected 2026-09-23 —
every class was named; not every class was fixed. The two release-side breaks were fixed and
dry-run on the same documents (`6d0ce6e`). The vehicle plates, the initials-with-suffix alias
and the bare single name were left for a round 8 that the freeze cancelled, and stand open as
`FREEZE.md` shelf items 1–3; the contested label is shelf item 5.]* EDGAR is converged. QUASI
numbers move with each draw's genre mix (severance/letter agreements differ from
change-in-control) and each round's gold — read the classes, not the aggregate.

## Round-8 list (named, in order)

1. Race FS8b-2 + FS10a on fresh paper (the two committed gate-break fixes).
2. SG vehicle-plate rail + "bearing number" nomination (the 3-span class).
3. Initials-with-suffix alias extension ([initials + numeric suffix] class).
4. Bare-single-name residue ([single given name] class) — L-B prompt or rail territory, measure first.
5. Gold scheme: bare definite role references ("the lieutenant") are NO_MASK when the
   named person is separately labeled; counsel doctrine question for the owner — real
   courts print counsel names (LN3's premise), this round's gold labeled counsel DIRECT
   (the counsel-name leak was double-fault: bad release AND contested label).
6. Standing owner rulings: geography ruled (P0i, done); occupations-noun ruled (P0k, done);
   remaining: counsel-name doctrine (above).
