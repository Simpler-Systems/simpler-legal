# pii-bench — gold standard + OOS sets for the PII-engine fork re-tests

Real, publicly available documents only — no synthetic text (owner ruling 2026-07-21, matching
how simpler-red's own test set was built), every document traceable to a public URL.

## The protocol (owner-specified, 2026-07-21)

1. **TAB** — tune the forked engine against the gold-annotated corpus.
2. **OOS batch 1 (50 docs)** — score the tuned engine out-of-sample; note the scores.
3. **OOS batch 2 (next 50)** — score again; a drop from batch 1 means the tuning overfit.
4. **Full 100 rerun** — the regression gate for the whole thing.

Batches 1 and 2 are stratified identically (~12 US opinions + ~13 SG judgments + ~25 EDGAR
exhibits each, alternating assignment by density rank) so step 2→3 measures generalization,
not a genre shift. Build: `node build-oos.mjs` → text in `raw/oos/` (gitignored,
rebuildable), committed record in `oos-manifest.json` (per-doc source URL, word count,
PII-proxy density, sha256 prefix — verifiable end to end).

## Gold labels — scorer-only (`oos-labels/`)

TAB-taxonomy labels for the 100 OOS docs, produced by dual independent Sonnet labelers +
adjudicator per doc (per-doc `agreement` = inter-labeler Jaccard, the machine analog of TAB's
annotator disagreement). **The E2B engine must NEVER see these files** — not in its prompt, not
in its tuning data, not in its context. They exist solely to cross-reference the engine's
output at scoring time. Any doc whose labeling failed is replaced with a fresh doc from the
same source (owner rule), never patched by hand into the engine's view.

**Measured** (2026-07-21, disk-validated): 7,378 entities — 687 DIRECT / 2,801 QUASI / 3,890
NO_MASK; confidential: HEALTH 118, ETHNIC 12, SEX 8, BELIEF 2, POLITICS 2. Batches balanced:
3,652 vs 3,726 entities. Inter-labeler agreement min 0 / median 0.595 / max 1 (9 docs < 0.3 —
the contested tail, same shape as TAB's human annotators). Label noise measured via an
accidental full replication (see OPS_LEDGER.md): corpus totals stable across passes (−0.3%),
per-doc counts swing ±25% — so **aggregate engine scores are decision-grade; single-doc scores
are not**. Full breakdown: `oos-labels/_summary.json`.

## Verifiable sources (all public, no auth)

| Set | What | Link |
|---|---|---|
| TAB | 1,268 annotated ECtHR judgments (MIT) | <https://github.com/NorskRegnesentral/text-anonymization-benchmark> · paper <https://arxiv.org/abs/2202.00443> |
| us-opinion | Full-length F.3d opinions, public domain | <https://static.case.law/> (per-doc: volume zip + member path + CAP id in manifest) |
| sg-judgment | Singapore High Court judgments | <https://www.elitigation.sg/gd> (per-doc judgment URL in manifest) |
| edgar-ex10 | SEC EX-10 exhibits (lawyer-drafted agreements) | <https://www.sec.gov/edgar/search/> · <https://www.sec.gov/Archives/edgar/> (per-doc exhibit URL in manifest) |

## TAB — Text Anonymization Benchmark

**The gold standard for legal-text anonymization.** 1,268 real European Court of Human Rights
judgments, hand-annotated (Pilán et al. 2022, *Computational Linguistics* 48(4)) with every
piece of personal information and — the part plain NER benchmarks lack — whether each mention
must be masked to prevent re-identification of the protected person.

- Source: `github.com/NorskRegnesentral/text-anonymization-benchmark`, MIT license,
  pinned at commit `558e09e` (2026-01-19). Rebuild: `node build-pii-bench.mjs` (data lands in
  `raw/tab/`, gitignored; stats in `tab-stats.json` are the committed record).
- **Measured** (2026-07-21): train/dev/test = 1,014/127/127 docs; words min/median/max
  185/916/5,144; 155,006 annotated mentions.
  - Semantic categories: DATETIME 53,668 · ORG 40,695 · PERSON 24,322 · LOC 9,982 · DEM 8,683 ·
    MISC 7,044 · CODE 6,471 · QUANTITY 4,141
  - Identifier types: QUASI 98,244 · NO_MASK 50,023 · DIRECT 6,739
  - Confidential attributes: HEALTH 2,320 · POLITICS 1,039 · ETHNIC 806 · BELIEF 655 · SEX 516
- `raw/tab/evaluation.py` is the **official scorer** — entity-level recall on masked spans,
  weighted precision, etc. Use it, don't reimplement it.

## How this feeds the red fork

The re-test contract for the legal PII fork, in this house's terms (fail-closed, fail-loud):

1. **DIRECT identifiers: recall 1.0 or refuse.** A single leaked direct identifier is a failed
   export, not a partial score. (verify-or-refuse, MODEL_TUNING.md)
2. **QUASI identifiers: scored, policy-thresholded.** TAB's annotations define which
   quasi-identifier combinations re-identify; the export policy decides the floor.
3. **NO_MASK is the precision check** — a stripper that nukes every date and org is not a
   win; TAB penalizes over-masking through its weighted precision.
4. **Confidential attributes (HEALTH…) map to the med fork** — same scheme, shared law.

## Hard set — stress-checked, not volume-collected

Docs earn their place for measured reasons (`node build-pii-bench.mjs hardness` →
`hard-set.json`, top 150). Components, min-max normalized and weighted:

- **annotator disagreement ×3** — 1 − char-Jaccard of maskable spans between TAB's own trained
  annotators. **Measured: 274 multi-annotator docs; median disagreement 0.273, max 0.756** —
  humans contest over a quarter of maskable characters on the median hard doc. Verified genuine
  (top doc 001-99180: both annotators dense — 28 vs 26 maskable mentions — yet barely
  overlapping spans), not one-annotator-slacked artifacts.
- **trapShare ×2** — identical surface text masked in one context, NO_MASK in another; kills
  pure pattern-matchers in both the recall and precision directions.
- **multiFormShare ×2** — entities recurring under ≥2 surface forms (miss one form = leak).
- **quasi density ×1, length ×1.**

Single-annotator docs score 0 on disagreement, so the hard set overweights dev/test — which are
the official evaluation splits anyway.

## Known gaps (stated, not hidden)

- TAB docs span 185–5,144 words — shorter than red's business test set (1k–78k words). Long-doc
  behavior needs supplementing: full-length CAP opinions (we already have the builder; the spike
  corpus is truncated) reach the tens of thousands of words.
- ECtHR judgments are court opinions, not firm-internal memos/letters. Real public candidates
  for firm-shaped text: RECAP/PACER filings (briefs, declarations), SEC EDGAR exhibits
  (contracts with real names, addresses, signature blocks). Deferred until the red fork exists.
- ECHR citation format ("no. 12345/89") does not match US reporter rails — TAB docs exercise
  the PII layer, not the citation-graph layer.
