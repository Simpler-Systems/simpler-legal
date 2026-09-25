# ENGINE_V2_SWEEPS.md — the legal engine, built model-native (owner ruling 2026-07-23)

**The architecture law (owner, verbatim intent):** the E2B is IN every engine — A, B, C — and
the point is for it to do a DIFFERENT job per sweep, because its attention maxes out per pass:
it can only do a narrow scope well, never everything. One small model, many scoped sweeps.
That is why v1 runs it three times (A wide-extract on the original · B residue on the
redacted output · C judgment on flagged candidates).

**The diagnosis this fixes:** the legal fork added a whole new game — QUASI recall +
keep-doctrine + preservation — and gave the E2B ZERO new sweeps for it. Every legal layer
(P0 doctrine, FS1–FS5 rails) is deterministic post-processing on a frozen v1 substrate. The
one attempt to serve the new game widened Engine A's contract instead of adding a sweep
(native arm: swap 3 classes in the SAME pass) and was measured-rejected at 5× under-find —
which is not evidence the model can't play; it is evidence that scope-per-sweep was already
maxed. Sweeps get added, never widened.

## The v2 sweep stack

| Sweep | Reads | E2B's narrow job | Deterministic partner |
|---|---|---|---|
| A (red, frozen) | original | crisp identity spans (PERSON/COMPANY/ADDRESS/ID), ~85-word fresh windows | name rails, structural battery |
| B (red, frozen) | A's redacted output | leftover contact/ID classes | regex battery |
| C (red, frozen) | flagged candidates | junk/keep classify | suspicion rails |
| legal rails + doctrine | original + A/B/C table | — | FS1–FS5 rails, P0 profiles, projections |
| **L-C (new)** | doctrine candidates | **person-anchor judgment**: is this date/amount PERSONAL (birth/death/ID/family/salary) or business/procedural? YES/NO per unique candidate, ±160-char window | keyword anchor regex is the fail-closed fallback |
| **L-B (new)** | the FINISHED legal output | **legal residue**: unmasked names/surnames, initials aliases, person-tied numbers that survived everything | verify-or-refuse + stoplists; can only ADD masks → DIRECT-gate-safe by construction |

Laws carried forward, unchanged: fresh context per call (no accumulation — measured lever),
narrow enum contracts, verbatim verify-or-refuse, fail-closed (`complete:false` on a dead
layer; deterministic fallbacks), doctrine stays configuration (PROFILES.md), the engine never
reads gold.

## Cost model

L-C: judge per UNIQUE candidate text (≤2 occurrence windows) ≈ 30–80 calls/doc.
L-B: re-chunk the final output at 500/100 ≈ 20–60 calls/doc. Total ≈ one extra Engine-A-scale
pass per document. Implementation: `lib-legal/sweeps.mjs` + `apply-v2.mjs --model` (without
`--model` it degrades exactly to the FS5d deterministic stack).

## The 2+2 split (owner proposal 2026-07-23, built in `lib-legal/sweeps2.mjs`, unwired)

QUASI and NO_MASK are each TWO kinds of judgment — one wide call per axis would repeat the
native-arm scope overload. Split, grounded in the P0 miss decomposition:

| Sweep | Mass it serves (measured) | Direction | Gate safety |
|---|---|---|---|
| LQ1 person-attributes (JOB/KIN/EDU/GROUP/HEALTH/STATUS) | ~160 lowercase-phrase QUASI misses | add-only | safe by construction |
| LQ2 person-linked places (SCHOOL/HOME/WORSHIP/MEDICAL/EMPLOYER) | ~80 capitalized QUASI misses | add-only | safe by construction |
| LN1 institutional judgment (masked ORG → official? YES/NO) | courts 675 destroyed ORG keeps | SUBTRACT | never Person/Code tags; defined-term ban; person-token veto |
| LN2 official-person judgment (masked PERSON → judge/counsel? YES/NO) | courts 616 destroyed PERSON keeps | SUBTRACT | model may only CONFIRM regex-nominated title candidates |

Case codes / durations (has-digits mass) stay railable — no model calls where regex is exact.
Cost ≈ 2× the current v2 bill (~4–7 min/doc typical on GPU; single-doc interactive stays
minutes — the overnight cost is the 100-doc × N-arms benchmark discipline, not the engine).
Wiring: `apply-v2.mjs --sweep lq1,lq2,ln1,ln2` after the v2 board lands; each sweep races as
its own arm on a 10-doc slice first, one variable at a time.

## Measurement

Raced like every arm: same scorer (v2, word-bounded), same product gold, in-sample first,
proven on round-4 fresh docs per walk-forward law. v1-legal stays frozen as the tab-scorer
instrument; its TAB numbers stand.
