# ROUND6.md — walk-forward round 6 (2026-07-24)

Owner order (2026-07-23): close the four named engine items —
(1) Yong/Derek courts leaks, (2) LN3 never raced, (3) QUASI/NM grind, (4) anchor-precision
redesign. Fix-set built, raced in-sample, then fresh paper per the walk-forward law.

## The fix-set (committed before any race)

- **FS8a — quoted-nickname rail** (Derek): bare quoted capitalized token after a name run
  (`[name run + quoted given name]`) is an alias; propagated document-wide as Person regions.
- **FS8b — party-collision veto** (Yong): LN2/LN3 releases sharing a name token with any
  masked party/alias (caption, defined alias, quoted nickname) stay masked. Fail-closed:
  the judge "Yong CJ" loses his surname because the appellant's associate was "Yong" — the
  gate outranks preservation by law.
- **FS8c — bizdate arm** (anchor precision v2, replacing rejected lcstrict): dates/amounts
  inside contract-boilerplate context ("effective as of", "shall commence", "no later
  than"…) are business by construction — never L-C candidates, zero model calls spent.
- **P0h — projection completion**: ordinal-day dates ("31 st day of December, 2008"), paren
  multipliers ("three (3) times", "(24)"), compound spelled durations ("six months and one
  day"), bare spelled numbers, mixed fractions, `N-day/month/year` forms. +1213 flips on
  round-5 gold (vs 1195 pre-P0h).
- **SG register-code extension**: RA/OC/SOP(/AA)/AA prefixes + bare "Suit N of YYYY".
- One infra bug en route: FS8c declared after `collect` (TDZ), chain died on doc 1 —
  fixed, parse-checked, relaunched. Zero results lost.

## In-sample race (round-5 docs vs P0h gold — NOT fresh paper)

| Pack | DIRECT | gate | QUASI | NM |
|---|---|---|---|---|
| Courts (25) | **100.0** | **100%** | 40.0 | 58.3 |
| EDGAR (15) | **100.0** | **100%** | 32.8 | 73.2 |

First all-clean courts board of the campaign. Caveats stated: in-sample (the fixes were
built FROM these docs); QUASI/NM are on the regenerated P0h gold, not one-variable
comparable to round-5 board numbers (DIRECT gates are — P0h only flips QUASI→NO_MASK).

## Per-item verdicts (in-sample)

1. **Yong closed** — zero occurrences in finals; FS8b masks the colliding judge surname
   fail-closed, as designed.
2. **Derek closed** — zero occurrences across all 25 courts finals (FS8a).
3. **LN3 first race: honest null** — 3 candidates nominated total (all SG), model refused
   all, and the round-5 US docs contain no counsel-block headers at all (opinion-body
   extracts). Gate-safe by construction; stays in the roster awaiting a draw with counsel
   matter.
4. **bizdate works** — EDGAR L-C candidate calls collapsed from round-5's hundreds/doc to
   single digits; QUASI 32.8 / NM 73.2 with the gate clean.

## Fresh paper (the exam — published as drawn)

Draw recipe (zero overlap with oos/round4/round5): 15 edgar-r6 (fresh queries:
"indemnification agreement", "non-competition agreement") · 10 us-r6 (next unused
ascending F.3d) · 10 sg-r6 (eLitigation 2021 SGHC — fresh year) · 5 sghcf-r6 (2022 SGHCF
letter-coded). Gold sealed blind BEFORE engine contact (wall `32ffc52`: 80-agent Opus
swarm 80/80 journal-verified, 4113 entities after fail-closed merge + doctrine
projection), server probed, one race, boards as drawn.

| Pack | DIRECT | gate | QUASI | NM |
|---|---|---|---|---|
| Courts (25) | **98.5** | 92% (23/25) | **44.4** | 56.0 |
| EDGAR (15) | **100.0** | **100%** | **68.9** | 66.3 |

### Exam verdicts

1. **EDGAR: SECOND consecutive fresh-paper round at zero DIRECT leaks** — 30 unseen
   agreements across rounds 5–6, zero DIRECT leaks. The product genre's leak story holds.
   *[Corrected 2026-09-22 — originally "THIRD consecutive … 45 unseen agreements across
   rounds 4–6". Round 4 leaked 3 DIRECT spans in `edgar-r4-13.txt` (`gatePass:false`), so it
   is not part of the run and every ordinal after it shifts by one.]*
2. **The FS8 fixes held forward** (the walk-forward law's own test): zero recurrence of
   any round-5 leak class — no initials-alias, quoted-nickname, party-collision, firm-name,
   or caption miss came back on fresh paper.
3. **bizdate + P0h transferred**: EDGAR QUASI 29.5 → **68.9** round-over-round (different
   draw + P0h-projected gold, so not one-variable — but the direction and size are real);
   L-C candidate volume stayed collapsed on fresh agreements.
4. **Courts: 2 fresh leak classes, 5 spans total** (the round-7 list):
   - **Account-fragment aliases** (sg-r6-05: [four 4-digit account tails] — "account number ending
     in NNNN", then used as defined aliases: "the [tail] account" ×11). Genuine engine gap;
     deterministic rail shape, add-only, gate-safe by construction.
   - **"Mendelssohn"** (sg-r6-02: the judge's flourish "Mendelssohn's 'Wedding March'
     needs no introduction"). CONTESTED LABEL: the scheme's DIRECT is defined as
     identifying a *private individual*; a composer dead since 1847 in a cultural
     reference arguably is not one. As drawn = leak (courts 98.5/92%); under a reviewed
     label courts would read 99.7/96%. Per round-4 precedent, any change is a
     committed-script projection for owner review — the board above stays as drawn.
5. **SGHCF: gate clean (5/5, zero readable-name leaks) — but an instrument find**: cited
   anonymized-case codes (`TYS v TYT [2017] …`) are systematically re-masked by the v1
   substrate and never restored, in BOTH rounds (r5 finals: 9/27 kept; r6: 5/9), and BOTH
   rounds' gold labelers missed them (they read as citations — a shared blind spot), so no
   board ever counted them. ROUND5.md's "zero errors in either direction" was true only
   over labeled entities. Round-7 items: deterministic cited-code KEEP rail (anon-court
   docs only, strict `XX v YY [` shape) + the blind spot added to the auditor prompt.

## Round-over-round (first-contact numbers, each vs its own sealed gold)

| Round | Genre | DIRECT/gate | QUASI | NM |
|---|---|---|---|---|
| 4 (packs, product gold) | courts / EDGAR | 98.9 / 92% · 96.6 / 93% | 30.2 · 33.8 | 56.6 · 74.2 |
| 5 (FS7+P0g) | courts / EDGAR | 99.4 / 92% · 100 / 100% | 39.4 · 29.5 | 58.2 · 72.3 |
| 6 (FS8+P0h+LN3+bizdate) | courts / EDGAR | 98.5 / 92% · **100 / 100%** | **44.4** · **68.9** | 56.0 · 66.3 |

Courts DIRECT wobbles round-to-round because each fresh draw surfaces one new leak class
(that is the design); EDGAR has converged. NM shifts partly reflect P0h changing the
NO_MASK denominator composition.

## Round-7 list (named, in order)

1. Account-fragment alias rail (add-only, deterministic — the sg-r6-05 class).
2. Cited-code KEEP rail + auditor-prompt blind-spot fix (the SGHCF instrument find).
3. Mendelssohn class: historical/cultural-figure label doctrine — owner ruling or
   committed-script projection.
4. Standing owner rulings unchanged: geography doctrine, occupations-noun boundary.
