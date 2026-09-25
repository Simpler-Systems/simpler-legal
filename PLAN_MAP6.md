# PLAN_MAP6 — six measured upgrades to the synergy map

Written 2026-07-22, before any phase landed. Source: leaders survey (EDHREC lift move, Shepard's
treatment, Connected Papers, PMC-Patients, Ravel/CARA post-mortems, Litmaps consolidation).
House rules apply: accept criteria stated BEFORE the change; refutations get recorded, not
deleted; every constant printed at build time with the distribution that justifies it.
Lane: `graph.mjs`, `synergy-viewer.html`, this file, CLAUDE.md. The PII/strip lane belongs to
the other terminal — untouched here.

## Phase A — yardstick first (eval harness)               [status: pending]

`node graph.mjs eval`. Baselines recorded before any tuning change:
- Regression axes: per-type intra-topic (from build), new-case synergy top-1/top-5 intra,
  all-node synergy top-1 intra. Topic labels carry known flaws (negligence misfile) — stated.
- Cross-signal axis (PMC-Patients adapted): direct held-out-cites eval is too sparse here
  (2 in-corpus cites), so interim ground truth = strong authority-coupling pairs (weight >= p75
  of coupled pairs); measure whether TEXT alone ranks a doc's true coupling partners above a
  seeded-random baseline (MRR, recall@10). Text and authority are computed independently, so
  one may judge the other.
- Held-out-cites eval stub: activates (loudly) when in-corpus cites edges >= 30 — i.e. on a
  citation-dense real corpus. Until then prints SKIPPED with the reason.

Gate: harness runs green; numbers in this file; committed before Phase B.

## Phase B — lift correction (hub penalty)                [status: pending]

Measured failure this fixes: anchors polluting commander lists (insurance new case top-1 =
Pipitone, a defamation hub; the Sol Ring problem). Change: in `buildSynergy`, correct text and
authority components by the candidate's corpus-mean for that component — two variants, `lift`
(divide by mean) and `sub` (subtract mean, floor 0) — vs `max` (current). Cites stays raw: a
direct cite is never generic. Lists become asymmetric (a hub sees normal partners; partners
see the hub penalized) — intended.

Accept: best variant must beat `max` on new-case top-1 intra (currently 7/10), tie-broken by
all-node top-1 intra. If neither beats it, revert and record the refutation here.

## Phase C — Bluebook signal rails (citation valence)     [status: pending]

Signals are a formal grammar preceding cites — rails, not judgments (MODEL_TUNING.md). Extract
support (see / see also / accord / e.g. / citing / quoting), neutral (cf. / compare), contrary
(but see / but cf. / contra), negative-treatment (overruled by / abrogated by / superseded by /
distinguished in / rejected by — treatment attaches to the PREVIOUS cite run; the following
cite is the treating case). Association window is bounded and stated; precision measured by
hand-checking a printed 30-sample against source text. Opposition flag on authority edges where
the two docs treat a shared authority with conflicting classes.

Gate: sample precision reported; coverage + class distribution printed (truncated-text caveat:
coverage is a lower bound); opposition count measured.

## Phase D — commander panel upgrades                     [status: pending]

- D1 (Connected Papers): split panel into "earlier — authorities" / "later — applications" by
  the commander's date; undated group fails loud at the end, never guessed.
- D2 (CARA): "authorities to check" — high-IDF authorities cited by >=2 of the commander's
  top-12 neighbors that the commander does NOT cite, scored n×IDF, top 5, computed at build
  time and exported per node.

Gate: rebuild green; verified rendered in browser (screenshots, light + dark), panel sections
present with sane content.

## Phase E — held constraints                             [status: pending]

- E1 (Ravel): all-pairs synergy is O(N²). Stated constant SYNERGY_ALLPAIRS_MAX = 2000; build
  warns loudly beyond it, pointing here. Recall-then-rerank (cites/authority partners + top-M
  text via inverted index) gets built when a corpus actually approaches the trigger — not
  speculatively. Panel shows top-12 either way; UI contract unchanged.
- E2 (Litmaps): factor synergy so the commander can be a SEED SET (a multi-document matter),
  max-per-member blend, seeds excluded from results. Selftest on real corpus docs (no synthetic
  set exists in this repo). Measured claims about matter-anchoring wait for the private-matter
  corpus shape (next-move 3) — mechanics only for now.

## Measured results (filled per phase)

### Phase A (2026-07-22) — baselines recorded

- new-case synergy top-1 intra **6/10**, top-5 **26/50**; all-node top-1 **76/99** (chance ≈ 9%).
  NOTE: the commander-mode commit and CLAUDE.md previously said 7/10 from a hand count — the
  harness corrected it to 6/10 (miscounted trade-secret as a hit). CLAUDE.md fixed; the wrong
  number stands in the old commit message as a record of why hand counts don't close checks.
- cross-signal: text ranks strong-coupling partners (gt = coupling >= p75 = 4.94, 24 queries)
  at **MRR 0.609 / recall@10 0.715** vs seeded-random **0.104 / 0.077** — text and authority
  strongly agree while being computed from disjoint evidence; the eval axis is meaningful.
- held-out-cites: SKIPPED (2 in-corpus cites edges < 30) — stub prints its activation rule.

### Phase B (2026-07-22) — hub correction ACCEPTED, mode = lift

| mode | new top-1 | new top-5 | all top-1 | appearance gini | Pipitone appearances |
|------|-----------|-----------|-----------|-----------------|----------------------|
| max  | 6/10      | 26/50     | 76/99     | 0.271           | 38                   |
| lift | 6/10      | **30/50** | **79/99** | 0.185           | 25                   |
| sub  | 6/10      | 30/50     | 79/99     | 0.140           | 17                   |

Pre-stated rule: beat max on new-case top-1, tie-break all-node top-1 → correction accepted
(top-1 tied, tiebreak + top-5 clearly won). lift vs sub tied on every stated axis; chose
**lift** because sub compresses scores (~0.5 top-1s, weak panel discrimination) and lift is
the space leader's own measured migration (EDHREC). sub remains a recorded candidate.
Negligence new-case top-1 is no longer a hub grab (was United States v. Washington, a
fourth-amendment hub; now an asylum case — still off-topic per labels, but that label is the
known misfile). Insurance top-1 Pipitone survives all modes: genuinely high text similarity,
not fixable by hub correction alone. max-mode numbers under the refactor exactly reproduce the
Phase A baselines (regression check passed). Viewer verified rendered under lift (Stroman
top-8 all fourth-amendment, scores 1.835→0.911).

### Phase C (2026-07-22) — signal rails landed, precision measured

- Coverage: **519/1418 cite runs signalled** (36.6% — lower bound, truncated text): support 493,
  neutral 20, contrary 5, treatment 1.
- Precision: seeded 30-sample hand-checked — **30/30 correct associations** (string cites,
  `Id.; see X`, parenthetical `(quoting …)` all handled). Rare classes checked EXHAUSTIVELY,
  all correct — including the one treatment hit, which is real legal history: Jones v. United
  States, 362 U.S. 257, overruled by United States v. Salvucci, 448 U.S. 83 (extracted from
  c1-fourth-amendment-doc3 with correct target/treating attribution).
- Opposition edges: **0/99 authority** on this corpus — expected: cross-topic public opinions
  rarely take opposing stances on the same shared authority (support dominates 493/519). The
  mechanism is built and measured; it should light up on brief-shaped private corpora where
  parties argue against each other. Not a refutation — a scope statement.

### Phase D (2026-07-22) — panel upgrades landed

- D2 missing authorities: 86/99 nodes get suggestions. A cert-disposition rail was added when
  the first suggestions surfaced junk (Stroman's list offered "522 U.S. 1061" — a cert denial):
  runs preceded by "cert. denied/granted/dismissed" (including the "— U.S. —, 118 S.Ct. 721"
  unassigned-reporter placeholder form, found by chasing one surviving suggestion to source
  text) are flagged; authorities that are cert-only corpus-wide are excluded. After the rail,
  Stroman's suggestions are clean and relevant (Tugwell, 125 F.3d 600 — an abandonment case).
- D1 temporal split: verified rendered — Stroman (2007): 11 "earlier / same year — authorities",
  1 "later — applications" (Levesque v. Doocy, 2009), global ranks preserved, year tags shown,
  undated fails loud by design (none on this corpus).
- Verified in browser, dark AND light themes. One infra note: the viewer must be reloaded with
  cache-busting when served without cache headers — stale-page screenshots look like "change
  didn't land".

### Phase E (2026-07-22) — constraints held, mechanics landed

- E1: SYNERGY_ALLPAIRS_MAX = 2000 stated in code; build warns loudly past it pointing here.
  Recall-then-rerank NOT built (no corpus near the trigger — no speculative work).
- E2: `synergyForSeeds(docs, cdf, seedIds)` — max-per-member merge, seeds excluded, `via`
  recorded, scope stated in code (merged from truncated member lists, not a full recompute).
  `node graph.mjs selftest` PASS 8/8 on real corpus docs. Matter-anchoring measured claims
  remain blocked on next-move 3 (private-matter corpus shape), as planned.

## Plan status: all six lessons landed or held (2026-07-22)

A yardstick, B lift (accepted), C signal rails (measured), D panel (verified rendered),
E constraints (stated + selftested). Full regression at close: eval unchanged from Phase B
acceptance numbers; selftest 8/8.
