# ENGINE_PREP.md — ready-state for the Gemma E2B / red-fork arrival

**Version naming (owner, 2026-07-21): red's locked general engine is `v1`; the
legal-tuned fork is `v1-legal`.** v1 itself is never modified — v1-legal is v1 plus a legal
delta (KEEP-rails, legal enum, constants re-measured on legal text), every change justified by
a named leak class in the v1 baseline taxonomy and measured one variable at a time. Run names
in `pii-bench/runs/` carry the version (`v1-…` / `v1-legal-…`).

Written 2026-07-21 while red testing runs in the owner's other terminal. Everything here is
engine-free prep; nothing in this repo touches simpler-red's code or the model. Sources are
cited to red's own measured docs (`red:bench/EVIDENCE_2026-07-19.md`, `red:CLAUDE.md`,
`red:lib/anonymize.mjs`).

## What red actually measured (correction of record)

The owner's recollection was "prompt matters most to the Gemma 4 E2B." Red's evidence says
something sharper — worth carrying precisely because the legal fork will face the same
temptation:

1. **CORRECTED 2026-07-22 per red's F1/F12** (my earlier retelling here repeated red's own
   round-2 mis-attribution): the recall jump was FIRST credited to chunk-size reduction; the
   controlled round-3 isolation showed chunk size was NOT the lever — **removing the
   carry-list (prompt-carried state) was: −24 points when present.** Red's F2 adds: the
   window floor below 500 chars is flat (700/500/350/200 → ~100/100/98.7/100) and the cliff
   is only ABOVE 500. Consequences here: no residue chunk sweeps needed (500 stands, never
   go above), and the owner's "prompt matters most" memory is partially vindicated — it was
   prompt-STATE that mattered most, destructively.
2. Where the prompt DOES matter, it matters as a **frozen contract**: red ships exactly two
   model prompts (the span-extraction contract `EXTRACT_SYSTEM`, and a GBNF-forced classify
   enum), both test-pinned, never tuned per document.
3. **State never rides in a prompt** — the measured **−24pt** carry-list lesson: feeding
   previously-found entities into later chunks' prompts poisoned discovery. Propagation is
   code's job.
4. **Verbatim verify is free recall insurance**: every nominated span must occur in its chunk
   (verbatim → punctuation-trimmed → whitespace-normalized) or it is refused — hallucinated
   masks cannot enter the entity table.
5. Production shape: **500-char word-boundary span pass UNION deterministic rails**, one
   entity table, base-name masking, structured floor, fail-closed on any failed model call.
   Two independent layers, each measured at 100% recall on the founding bench.

## Legal-fork divergences to test on arrival (hypotheses, not conclusions)

- **The KEEP-rail is legal's novel problem.** Precedent case names ("Anderson v. Liberty
  Lobby, Inc.") are PERSON-shaped text that must SURVIVE stripping — masking them destroys
  checkability (citations are rails, MODEL_TUNING.md). Red's enum has no concept of
  "precedent citation." Predicted #1 failure mode of an unmodified red on legal text:
  over-masking case names and reporter cites. Our gold set is built to measure exactly this:
  **3,890 NO_MASK entities** feed the `NO_MASK preservation` metric in `score-pii.mjs`.
  Candidate rail: the citation regexes in `graph.mjs` (reporter cites, `X v. Y` captions
  followed by a reporter cite) nominate KEEP-spans deterministically — the mark IS the
  classifier, same doctrine as red's ®/™ rule.
- **SG floor rules**: NRIC (`[STFG]\d{7}[A-Z]`), UEN, +65 phones join the structured floor —
  deterministic, no model involved. The 25 SG judgments in the OOS set are the test.
- **Enum classes**: legal wants party/witness/counsel/judge distinctions (TAB treats public
  officials acting publicly as NO_MASK; our gold labels follow TAB). Draft enum to A/B:
  `person-party / person-witness / person-official / company / address / id / date-personal /
  citation-KEEP / generic`.
- **Chunk size is per-vertical, re-measured, never imported** (same law as vocabularies).
  Red's 500 was measured on one US contract. Legal opinions are citation-dense; SG judgments
  are numbered-paragraph structured. Rerun red's chunk sweep (their `ab-runner3.mjs` pattern)
  on 3-5 OOS docs before freezing the legal constant.
- **Prompt contract candidates** (to freeze AFTER measurement, red's process): (a) red's
  `EXTRACT_SYSTEM` verbatim as baseline; (b) + one line excluding legal citations and case
  names of precedent; (c) + legal role terms in the do-not-list clause (the Court, Plaintiff,
  Appellant — legal's "the Company" equivalents). One variable per arm, scored by
  `score-pii.mjs` on batch 1 only (batch 2 stays untouched until tuning freezes — the
  protocol's whole point).

## What is already in place (verified today)

| piece | state |
|---|---|
| `score-pii.mjs` | **selftest 8/8** — null/oracle/over-masker stand-ins get correct verdicts; DIRECT gate, QUASI recall, NO_MASK preservation, unmatchable-span accounting |
| `pii-bench/batches.json` | engine-side doc paths only (51+49); labels never travel with it |
| Gold labels | 7,378 entities, scorer-only, label-noise bounds known (aggregate-only scoring) |
| TAB + official scorer | downloaded, pinned; `evaluation.py` needs `numpy pandas spacy tqdm intervaltree` (Python 3.13.14 present, deps NOT installed yet — install when TAB tuning starts) |
| Run records | `pii-bench/runs/<name>.json`, one per scoring pass, self-describing |

## The scaling ladder (owner policy, 2026-07-22: never bet hours on an ungated config)

Model-hours are only ever spent one rung above where the config last passed a gate:

| gate | scale | what it protects against | cost |
|---|---|---|---|
| G0 smoke | 1 doc | broken config (crash, incomplete, garbage output) | ~2 min |
| G1 carriers | 3–8 class-carrier docs | arms that don't move their target class | ~2–5 min |
| G2 slice | 26 docs, aggregate | slice-scale regressions; promotion to engine | seconds (rails) / ~25 min (model) |
| G3 checkpoint | 127 dev docs | slice overfitting | free for rails vs the substrate; ~2h for model-side |
| G4 freeze | sealed test split, official scorer | — | once, ever |

**Gates read aggregates, never single-doc scores.** Per-doc scores are quantized small-sample
noise (a doc with 3 NO_MASK forms can only score 0/33/67/100) and measured unstable (±25%
entity counts between identical passes; per-doc agreement flipped 1.0→0 across replications).
A 1-doc gate is a MECHANICAL smoke test — did it run, did it fail closed, is the output sane —
never a 100/90/90 test.

**The substrate exception**: the frozen-v1 pass over a doc set is config-INDEPENDENT of all
legal-layer tuning (v1 is locked; 4 exact-to-the-digit replications on record). Buying
substrate is never a config bet — every rails config afterward measures against it for free.
Config risk lives only in model-side arms (new contracts, chunk changes), and those ride the
ladder from G0.

## The switch-day checklist

1. Point the red fork at `pii-bench/batches.json` batch 1; write stripped outputs to a dir.
2. `node score-pii.mjs --stripped <dir> --batch 1 --name <engine-version>-b1`.
3. Iterate prompt/rails/chunk arms on batch 1 ONLY. Freeze.
4. Score batch 2 once. A drop vs batch 1 = overfit; back to step 3 with batch 2 quarantined again.
5. `--batch all` rerun = the regression gate. Record all three run files in BENCHMARK.md.
