# ROUND4.md — the fresh-paper exam (2026-07-23, first contact, published as drawn)

40 never-seen docs (manifest `pii-bench/round4-manifest.json`), gold sealed by blind
80-agent swarm + adversarial audit BEFORE engine contact (wall commit `2d3540b`), packs
applied once, scored once. Instrument note: the exam found a gold defect (below); both
boards published — as-drawn and instrument-v2 — per the scorer-v2 precedent.

## Boards

| Pack | Instrument | DIRECT | gate | QUASI | NM |
|---|---|---|---|---|---|
| Courts (25: US+SG+SGHCF) | as drawn | 87.9 | 76% | 30.3 | 56.8 |
| Courts | **instrument-v2 (P0f)** | **98.9** | **92%** | 30.2 | 56.6 |
| EDGAR (15 agreements) | as drawn = v2 (no anon docs) | **96.6** | **93.3%** | 33.8 | **74.2** |

## The instrument defect the exam caught (P0f)

The SGHCF pseudonym-preservation stress set worked exactly as designed — in both directions.
The engine correctly PRESERVED the courts' own anonymization ([G], [K], C1, WJZ, pre-masked
NRICs `XXX-XXX-19-6`) — and the gold, labeled under raw-doc instructions ("initials codes
are DIRECT"), scored that correct behavior as leakage: 95 court artifacts across 5 docs.
P0f (committed projection rule): in a court-anonymized document the court's decisions are
the doctrine — artifact-shaped spans preserve; NAME-shaped spans stay DIRECT because a real
name in an anonymized judgment is the court's miss and exactly what the engine must catch.

## Real DIRECT leaks (the round-5 fix list, every one named)

- `[given name]` (sghcf-r4-05) — a real name surviving inside a court-anonymized judgment; the
  most important real miss of the round.
- `RB` (sg-r4-06) — initials alias the R2 rail didn't derive.
- `Schaeffer`, `Strongin`, `Venglia` (edgar-r4-13) — multiple individuals in one separation
  agreement; v1 substrate under-tabled them.

DIRECT verdict at instrument-v2: courts 98.9 / EDGAR 96.6 on first contact — vs red's
walk-forward round-1 precedent of 84.6 on an easier game. Preservation transferred within
sight of in-sample (EDGAR 74.2 vs 64.0 in-sample — BETTER on fresh paper; courts 56.6 vs
47.7 — also better; the packs under-fit, they did not over-fit).

## QUASI 30 — decomposed (720 missed)

The mass is NOT primarily engine failure:
1. **Projection format gaps (~450)**: `Jul. 20, 2021` (abbreviated month + period),
   `thirty (30) days` (spelled+parenthesized), `21-day` (hyphenated), `1,250,000 shares`
   (quantity units beyond time/currency) — all unanchored business forms the P0 doctrine
   already flips; the SHAPES list doesn't cover these variants yet. P0g projection
   completion, mechanical.
2. **The un-ruled geography doctrine (~90)**: `California`, `Nevada`, governing-law states,
   venue cities. Owner ruling needed: agreements boilerplate geography = keep? person
   residence = quasi?
3. **Labeler net-width (~60)**: `iPad`, `in-house counsel` — adjudicate at P0g.
4. The remainder is real engine QUASI tail (codes `21 ST CV 26571`, N102-class project
   names) — round-5 rails.

## Verdict

The exam did its job: DIRECT machinery generalizes (98.9/96.6 first contact, both packs,
leaks named and few), preservation generalizes (better than in-sample), the QUASI number is
mostly instrument-vs-doctrine and the exam surfaced BOTH remaining doctrine holes
(geography; labeling-scheme genre-awareness) plus a short real fix list. Round 5 = P0g
projection completion + geography ruling + the three leak fixes + QUASI-tail rails, proven
on round-5 paper per the walk-forward law.
