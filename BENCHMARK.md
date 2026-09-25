# BENCHMARK.md — measured data points of record

Every number in this file was measured, not estimated. Each section names its file of record;
if this file and a file of record disagree, the file of record wins. Rebuild paths are given for
every figure. What a clone can recompute from them, and what it cannot, is in `WITHHELD.md`:
the courts gold is withheld from the tree at HEAD (the history still holds it: `README.md`,
"Data statement"), and the engine's outputs are not committed, so a board is
reproduced by re-running its round's engine, not re-scored. License: Apache-2.0 (see LICENSE + NOTICE; third-party data noted
at the bottom).

## Scope of every leak claim in this file (container audit, 2026-07-25)

Every DIRECT/QUASI/NO_MASK number below is measured on **plain text**: the benchmark's
inputs are strings (`raw/*`), and the scored pipeline starts after a document has already
become one. So a leak claim here reads exactly: **zero DIRECT identity leaks in the
redacted text of the draws it names, measured on text inputs.** They say nothing about
container channels — a `.docx`'s comments, tracked deletions, headers/footers, or
`docProps` author fields, or a PDF's XMP, annotations and embedded files. No scorer here
can ever catch those, because they never enter the artifact being scored.

What answers that separately is structural on one export path and a re-check on the other.
A **text** export (the clipboard copy and the saved `.txt`) rebuilds rather than overlays:
the payload is `remask(text, entities)` over the body text — a new string written as plain
text, so a comment or tracked deletion cannot ride along inside it, by construction. When the
frozen pipeline read the document, those entities are read off its redacted text
(`rowsFromFinal`, `serve-legal.mjs`), and the scores below are of that redacted text, not of
the app's rebuild. Until 2026-09-25 a region of the pipeline's text over 200 characters gave no
entity: over 306 pipeline outputs in `raw/stripped`, each aligned against the document it was
drawn from, in 4 runs from 2 documents a line the
pipeline masked stood readable in the app's `.txt`, and in none since (`REDACTION_AUDIT.md`,
open gap 1, second pass; `app/frontend/test/docx-parts.mjs` law 85). The
honest cost: that export is text, not a formatted document, so the original file still sits
on disk carrying everything — which the Export screen states, per document, naming the
channels that document actually has.

The **.docx** export does not work that way. It rewrites the original package:
`app/frontend/src/lib/extract/docxWrite.ts` is a zip writer (`writeZip()`), reachable
from a button on the Export screen (`writeRedactedDocx`, imported by `screens/Export.tsx`). It
removes tracked deletions (insertions are accepted), comments and every reviewer's name and
initials, hidden text, images, embedded objects and files, embedded fonts, macros, alt-text,
external link targets, custom properties and custom XML, building blocks, the
sensitivity-label record and every document property except the created and modified dates,
the language, the revision count and five Word-internal flags (`DROP_KINDS`, `CORE_KEEP`,
`APP_KEEP`). It gives shapes neutral names, renames every bookmark the author made, and masks
or renames the names that style, list, theme, font, settings and chart parts carry. It
**keeps** headers (with any watermark), footers, footnotes, endnotes, chart and SmartArt text,
and masks them with the review table, the names the engine found only in them, the
always-redact list and the safety-net pattern. Since 2026-09-25 (owner ruling 27) that text
goes to the engine in a second request of its own, after the body's, which is unchanged
(`app/frontend/src/lib/side.ts`; `app/frontend/test/doctrine-profile.mjs` law 5); what the
engine finds there is used as names only (`joinSide`, `engine.ts`). When the engine read the
body and not that text, the `.docx` is held; when no engine read the body, nothing is sent and
those parts are masked with the table, the list and the pattern only, as before. None of the
numbers below measures that second request: they are scored on the body's plain text. The
file's safety rests on a fail-closed re-walk of the OUTPUT (`readOutput`,
`docxWrite.ts`): every part — its name, element text, every attribute value, relationship
targets, the names of its elements and attributes and the namespaces it declares or lists,
save the addresses and names Office's file formats define — is read for the names the mask
places, with its words apart or run together (in the file's code inside a longer word from six
letters and digits, `RUN_FLOOR`, save that in text a reader sees a name is never read inside a
plain word of letters: there it counts at word breaks, before an `s` or `es` ending, and from
six inside a token with a digit, `.`, `/`, `\`, `:`, `@`, `#` or `_` in it or an `@` or a `#`
before it; owner rulings 8 and 18, 2026-09-24, `textHolds`), and if anything still places,
`bytes` is set to null and the file is held with the reason.
That is a re-check against the same mask, not an impossibility, and it has the mask's reach: a
person named ONLY in a header, footer or footnote, whom the engine did not find there (or where
no engine read the body), and not on the always-redact list, is not masked, and the gate
passes. Until 2026-09-25 that was every such person: the engine read the body alone
(`app/frontend/test/docx-parts.mjs` law 84, whose CONTROL is that case). Until 2026-09-23 the style, numbering, theme and
settings parts were copied unread and a declared term shipped in them under a passing gate.
That is closed, and so are the places found the same day where the re-walk read and still
passed: a name split inside a word by an equation's runs, one glued inside a style alias list,
a part's name, a connector's reference or an orphaned link relationship, a name nobody
reviewed in an attribute, or as a lower-case word between the tags, of a part the writer does
not know, and a chart's print header (`app/frontend/test/docx-parts.mjs`, laws 25–44, each with a control that fails
without the fix). The places this file listed as open on 2026-09-23 — an equation split
across a box, bar or accent; a number format's currency section; a name run together in text
a reader sees, in an attribute or in a style's or font's name; element and attribute names,
and unseparated numbers, in a part the writer does not know — were closed that day (laws
45–57). Closed on 2026-09-24 under owner rulings 8 to 12 (laws 58–67): a name written with `%20`, `&nbsp;` or `&#32;` between its words in text a
reader sees, masked in the `.docx` and in the `.txt`; a row of six digits or more inside a
longer number or a reference; a number the safety-net pattern masks in an add-in's attribute
or element text, or in an attribute with no prefix on one of Word's own elements; a
lower-case word after an address on a host Office's own addresses use, between the tags of a
part the writer does not know; a hand-built encoding or UTF-16 part; a letter, a digit or an
`@` drawn with `w:sym` from a font other than Symbol or a picture font, and a digit from Symbol;
and the over-masks that
put `Tan` inside `Tang` and `Porter` inside `supporter`. Closed later on 2026-09-24 under owner
rulings 17 to 19 (laws 68–83, and law 64 for `hasEscape`; laws 1–83, 399 checks passing that
day), each held by one of those laws: a Proofpoint link that writes a byte that is no
character where a name stands (v2 `-E9`, v3 `*E9`), which held the `.docx` but shipped in the
`.txt` and the copied text under a verified export until `engine.ts` asked `hasEscape` (both
text exports are now blocked on it save where a mail program's wrap falls inside the name or
just before or inside that escape, open below); a Proofpoint link wrapped
over a bare line break in LF or CRLF, save inside the name's own letters (with an LF, 47 of
100 places in a v2 link and 34 of 77 in a v3 one shipped; 38 and 25 are now masked), and one
on `urldefense.us`; a tag (`#kestrelholdings`, at the cost of `#supporters` reading
`#sup[Person1]s` for a row `Porter`); a designator spelled out (`Hickson Corporation`); digits
grouped by an em dash, a minus sign, a tab or ` - ` (`DIGIT_SEP`); a ligature, a letter in a circle or a
square, HTML's whole table of references and `&nbsp` or a number without the semicolon; `MRIs`
and `ISPs` read as one word before the `s`; a number the safety-net pattern masks as the whole
text of an element under Office's prefix (`<w14:x>`), and a row of two to five digits as the
whole of an add-in's or an unknown part's value; and a space before a tracked deletion that the
`.txt` dropped (`Tanpromptly`). Open on 2026-09-24, each probed that
day: a name run into a plain word of letters (`kestrelholdings`, `Margaret Tanand`),
letter-spaced, hyphenated inside a word (`Hold-ings`) or in bracketed letters in text a reader
sees, a line break inside a name's own letters in a wrapped link, a Proofpoint link wrapped in
a quoted reply or onto an indented line (the next line starts `>` or `> ` or is indented; 72
of 100 places in a v2 link and 70 of 77 in a v3 one with `> `), digits grouped by a line
break, a comma, an underscore, a colon, two spaces, a spaced en or em dash, a fraction slash or
a bullet other than `•` and `∙`, among the marks `DIGIT_SEP` does not read, `&eacute` without
its semicolon, `&NBSP;` and, until 2026-09-25, a reference by number of more than seven digits (each shipped from
the `.txt` under a verified export and from the `.docx` under a gate of 0 leaks; the run-together
name by ruling 8); a Proofpoint link that writes a byte that is no character (`-E9`, `*E9`),
wrapped just before or inside that escape, which neither the `.txt` and the copied text nor
the `.docx` hold or mask, at 3 places a link besides the 4 inside the name's letters (7 of 97
in a v2 link and 7 of 85 in a v3 one; the `.docx` probed 2026-09-25); a
Symbol-font letter drawn with `w:sym` inside a name (Symbol's Greek `Α` in
`MARGARET`), which the walker reads as nothing, so the `.docx` ships it; a name
shorter than six letters inside a code word that starts with a small letter, in an add-in's
attribute (`lee`, `leeFile`) or as a style's id or name or a font's name written all in lower
case (`leeheading`, `leesans`; the capitalised forms are renamed); a number the safety-net
pattern masks, in an attribute under one of Office's own prefixes (`w:tel`, `w14:tel`); a name
nobody declared as an attribute value in a part the writer does not know, written all in lower
case or run together lower-case first (`acme:client="whitfield"`,
`acme:client="jonasWhitfield"`; written with a capital or a space it holds the file), or as an
Office-namespace element name there; a name from the table as the name of a `w:` element in a
hand-built file; and false masks at word breaks and the ending the rule keeps, the largest a
capitalised plural of a row that is also an ordinary word (`United States` reads `United
[Org1]s` for a row `State`, 511 times over the 99 opinions), then `McDonald` read as
`Mc[Person1]` for a row `Donald` and `IRAS` as `[Org1]S` for a row `IRA`. They are listed, with the rest of
the open container gaps, in
`REDACTION_AUDIT.md` gap 2. The `.txt` and the `.docx` are not claimed to mask alike (owner
ruling 13): the `.txt` is the body masked by the engine's plan, the `.docx` every part masked by
the writer, and each item above says which it was probed through.

## Retrieval spike (2026-07-19)

99 real F.3d opinions (89 corpus + 10 held-out queries), 10 keyword-labeled topics,
vocabulary-free TF-IDF only, zero tuning. File of record: `out/eval.json`
(`node pipeline.mjs eval`).

| metric | value | chance |
|---|---|---|
| mean p@5 | **0.620** | ~0.10 |
| top-case accuracy | **6/10** | ~0.10 |

## Synergy graph (2026-07-21)

Corpus as a typed-edge web; all edges mechanical. File of record: `out/graph.json`
(`node graph.mjs build`; interactive viewer `out/synergy.html`).

| metric | value |
|---|---|
| nodes / edges | 99 / **307** (cites 2 · shared-authority 99 · text-similarity 206) |
| coverage | **100%** of nodes have ≥1 edge |
| strength gini | **0.256** |
| intra-topic, weighted (chance 9.1%) | cites **100%** · authority **55.3%** · text **73.8%** |
| IDF effect on authority edges | intra-topic 45.5% unweighted → **55.3%** weighted |

Parallel citations (e.g. `477 U.S. 317, 322-23, 106 S.Ct. 2548`) are union-found into single
authorities, pincite gaps included; procedural boilerplate (Anderson/Celotex) is IDF-downweighted,
not dropped.

## TAB — gold standard for legal-text anonymization (downloaded 2026-07-21)

1,268 real ECtHR judgments, hand-annotated (Pilán et al. 2022). Pinned commit `558e09e`, MIT.
File of record: `pii-bench/tab-stats.json` (`node build-pii-bench.mjs`).

- Splits 1,014 / 127 / 127 (train/dev/test); words min/median/max **185 / 916 / 5,144**;
  **155,006** annotated mentions.
- Categories: DATETIME 53,668 · ORG 40,695 · PERSON 24,322 · LOC 9,982 · DEM 8,683 ·
  MISC 7,044 · CODE 6,471 · QUANTITY 4,141.
- Identifier types: QUASI **98,244** · NO_MASK **50,023** · DIRECT **6,739**.
- Confidential: HEALTH 2,320 · POLITICS 1,039 · ETHNIC 806 · BELIEF 655 · SEX 516.

**Hard set** (`node build-pii-bench.mjs hardness` → `pii-bench/hard-set.json`, top 150): 274
multi-annotator docs; inter-annotator disagreement (1 − char-Jaccard of maskable spans)
median **0.273**, max **0.756** — trained humans contest over a quarter of maskable characters
on the median hard doc.

## OOS set — 100 real public documents (2026-07-21)

Three sources, stress-selected (~2× over-collected, densest by mechanical PII-surface proxy
kept). File of record: `pii-bench/oos-manifest.json` (`node build-oos.mjs`); per-doc public URL
+ sha256 prefix for every document. Text lives in `raw/oos/` (gitignored, rebuildable).

- 25 full-length F.3d opinions (CAP, 2,798 candidates from 24 volumes, spike-corpus cases
  excluded) · 25 Singapore High Court judgments (eLitigation) · 50 SEC EDGAR EX-10 exhibits
  (max 2 per company).
- Words **1,012–38,440**. Batches stratified identically: density medians **60.3 / 60.1**.

## Gold labels (2026-07-21) — scorer-only

Dual independent Sonnet labelers + adjudicator per doc, TAB taxonomy, spans verified against
document text. File of record: `pii-bench/oos-labels/_summary.json`. **The E2B engine must
never see these labels** — they exist to cross-reference engine output.

- **7,378 entities**: DIRECT **687** · QUASI **2,801** · NO_MASK **3,890**; confidential
  HEALTH 118 · ETHNIC 12 · SEX 8 · BELIEF 2 · POLITICS 2. Batch balance 3,652 / 3,726.
- Inter-labeler agreement min 0 / median **0.595** / max 1; 9 docs < 0.3 (the contested tail).
- **Label noise, measured by an accidental replication** (a workflow resume meant to re-run
  one dead labeler re-ran 298 of the 301 agents fresh; `OPS_LEDGER.md`, 2026-07-21): corpus
  totals moved **−0.3%**; per-doc entity counts swung up to **±25%**. The 88.8% gold
  agreement below is a different, smaller measurement, not this replication. Scoring rule: aggregate
  scores per batch are decision-grade; single-doc scores are one noisy sample.

## Evaluation protocol (owner-specified)

1. Tune the PII-engine fork against TAB (official `evaluation.py` scorer).
2. Score out-of-sample against OOS batch 1 (50 docs); note scores.
3. Score against OOS batch 2 (next 50); a drop exposes overfitting to batch 1.
4. Rerun against the full 100 — the regression gate.

Contract: DIRECT recall 1.0 or refuse the export; QUASI policy-thresholded; NO_MASK is the
over-masking (precision) check.

## v1-legal tuning (2026-07-21/22, in progress — TAB dev slice, 26 docs)

**Owner acceptance bar (2026-07-22): DIRECT recall 100% · QUASI recall ≥90% · NO_MASK
preservation ≥90%.** The bar applies to checkpoint-grade runs (full dev, then the sealed test
split at freeze), not slice iterations. Position against it as of the bar being set:
100 / 73.2 / 76.5 (v1-legal.2) — gaps of ~17 QUASI and ~14 preservation points. For scale:
90% QUASI is at the fine-tuned-Longformer ceiling (91.6), and part of the NO_MASK gap sits on
the annotator-contested ORG boundary — whether 90/90 clears TAB's own human-disagreement floor
is itself a thing to measure, not assume.

Engine v1 = simpler-red locked 2026-07-21 (vanilla Gemma E2B, sha-verified, CPU serving —
Vulkan broken on both local devices). Files of record: `pii-bench/runs/v1-*.json`. Scorer:
`score-tab.mjs` (entity-survival, union-of-annotators gold); official `evaluation.py` reserved
for checkpoint/freeze.

| arm | DIRECT recall | gate | QUASI recall | NO_MASK preservation |
|---|---|---|---|---|
| v1 baseline (unmodified, full mode) | 91.9% | 84.6% | 30.0% | 68.8% |
| + L1 recall rails (post-pass, no model) | **100%** | **100%** | **68.0%** | 66.7% |
| v1-legal.2 (gazetteer, L3/L4, blunt restore) | 100% | 100% | 73.2% | 76.5% |
| v1-legal.4 (statute guard, L1c, L6, wide restore, public-body span lock) | **100%** | **100%** | **76.1%** | **79.9%** |

**Measured architecture verdicts** (all runs in `pii-bench/runs/`): native legal first-pass
contract — rejected (100/73.8/79.0, under-finds legal classes ~5× vs narrow sweeps, 2×
runtime); Engine C 4-class residue sweep — parked (three veto rounds ended +2.1 QUASI /
−3.0 preservation vs then-baseline); kinship rails (bare and relational) — rejected (the
kinship seam is annotator-contested); protected-ranges span lock — adopted (score-neutral
vs context sniffing, structurally composes). **Noise-floor ceiling, computed from gold:**
only 24/1,392 forms conflict across slice docs → form-level policy ceiling QUASI ≤98.4%,
preservation ≤96.5% — the 100/90/90 bar is below the ceiling; the remaining gap is
uncaught content, not annotator noise.

**Provenance**: engine v1 = simpler-red as locked by owner 2026-07-21 (consumed as a library,
never modified); model = `gemma-4-E2B_q4_0-it.gguf` sha256
`3646B4C147CD235A44D91DF1546D3B7D8E29B547DBE4E1F80856419AA455E6FD` (stock Google QAT pin,
verified before first token); serving = llama.cpp server, CPU, temperature 0, ctx 8192,
red's documented flags. Iteration set = deterministic 26-doc dev slice
(`pii-bench/tab-slice25.json`, every 5th sorted doc_id); test split sealed until freeze.

**v1 baseline leak taxonomy** (entity-level, distinct surface forms, union of annotators):

| category | QUASI leaked/total | NO_MASK over-masked/total |
|---|---|---|
| DATETIME | 539/548 | 3/29 |
| QUANTITY | 73/77 | 0/10 |
| DEM | 67/79 | 9/45 |
| MISC | 52/56 | 6/73 |
| LOC | 44/50 | 0/15 |
| ORG | 40/134 | **82/146** |
| CODE | 27/77 | — |
| PERSON | **1/184** | 1/6 |

DIRECT leaks: 5 — `1520/06`, `33488/96`, `27267/95`, `50015/99` (ECtHR application numbers,
one regex shape) + `18 March 1996` (full date). The QUASI columns are dominated by classes
v1's frozen contract deliberately excludes for business documents (dates, money, demographics)
— scope gap, not quality gap.

**After L1** (`lib-legal/legal-rails.mjs`: app-number + date + amount + age regex rails as a
deterministic post-pass; arm measurement needs zero model re-runs): DIRECT leaks 0; residual
QUASI — DATETIME 124/548 (bare years → arm L1b), DEM 67/79 + MISC 52/56 + LOC 44/50
(gazetteer/model classes), QUANTITY 56/77 (uncurrencied amounts, durations); NO_MASK ORG
over-masking unchanged at 82/146 (→ arm L2 KEEP-restore). Cost of L1: NO_MASK DATETIME
3→10 of 29 over-masked (the −2.1pt).

## The walk-forward campaign (2026-07-23/24) — fresh-paper rounds under sealed gold

The instrument matured mid-campaign and every change is itself measured: **scorer v2**
word-bounds occurrence counting (v1 counted substrings — "Bo" leaked inside "Board",
phantom leaks in every short-span verdict; baselines rescored). **Doctrine became
configuration**: committed-script gold projections P0–P0k (dates/amounts, companies/titles,
occupations, court artifacts, format shapes, geography, cultural figures — one principle:
the identity-anchor test). **Gold agreement measured, 88.8%** (`pii-bench/gold-ceiling/`,
`node pii-bench/gold-ceiling/score-ceiling.mjs` → 213/240; courts 107/120, EDGAR 106/120):
eight agents re-judged 240 QUASI and NO_MASK calls drawn from the development set's product
gold (`oos-labels-product`), one mask-or-keep verdict each, without seeing the gold. It is
not a full relabel and not a ceiling on QUASI recall. No DIRECT call was sampled. 203 of the
240 calls are KEEP, so answering KEEP every time would agree on 84.6%. It was measured
2026-07-23 (`a266114`), before P0f and the projections after it, and not re-measured under
them (`FREEZE.md`, Corrections C6). Law: blind swarm gold sealed by commit BEFORE engine
contact, one variable per arm, DIRECT gate inviolable, boards published as drawn.

**Which gold ships.** Every first-contact board below was scored against its round's gold as
sealed before contact. The gold committed now is not that gold for rounds 4, 5 and 6: after
contact, round 4's was re-projected by P0f and P0g (`694b4c4`, `ca307d6`), round 5's by P0h
(`692de46`) and round 6's by P0i/P0j (`ae154ac`). Counted per document and identifier type at
each commit, P0f cut round 4's courts DIRECT labels by 60 net (the courts' own pseudonyms, C7),
P0j cut one courts DIRECT label in round 6, and P0i/P0j moved two round-6 EDGAR location labels
from NO_MASK to QUASI (`edgar-r6-14`, `edgar-r6-15`); every other move was QUASI to NO_MASK.
Compared label by label (span text and identifier type, per document), no EDGAR DIRECT label
changed at any step. The
in-sample races in `ROUND6.md` and `ROUND7.md` are scored on the projected gold and say so.
Round 7's gold, and the UK and pure-OOS gold, were not changed after contact (the conversion to
offsets in `f2c22eb` excepted). So rescoring rounds 4–6 from the committed gold does not
reproduce their first-contact QUASI and NM columns, nor the DIRECT of round 4 courts as drawn
or of round 6 courts.

**First-contact boards** (each round vs its OWN sealed gold; files
`pii-bench/runs/ROUND*-firstcontact.json`). Round 4 is the first draw under the current gold
and scorer; rounds 1–2 ran under the earlier gold and scorer v1 and are not comparable
(`ROUND5.md`). Each round ran the engine as it stood at that round; none of rounds 4–7 ran
the configuration later frozen (`FREEZE.md`, Corrections C1).

| Round (fix-set) | Courts DIRECT/gate | Courts QUASI/NM | EDGAR DIRECT/gate | EDGAR QUASI/NM |
|---|---|---|---|---|
| 4 (packs, product gold), as drawn | 87.9 / 76% | 30.3 / 56.8 | 96.6 / 93% | 33.8 / 74.2 |
| 4, courts rescored under P0f (instrument v2) | 98.9 / 92% | 30.2 / 56.6 | — | — |
| 5 (FS7+P0g) | 99.4 / 92% | 39.4 / 58.2 | **100 / 100%** | 29.5 / 72.3 |
| 6 (FS8+P0h) | 98.5 / 92% | 44.4 / 56.0 | **100 / 100%** | 68.9 / 66.3 |
| 7 (FS9/LN0/P0i–j) | 97.7 / 84% | 39.5 / 55.1 | **100 / 100%** | 43.4 / 74.9 |

Every courts leak ever drawn is named and mechanism-diagnosed (ROUND4–7.md); fixes are
tested on the NEXT round's fresh paper. That test held on round 6 for every round-5 class
(`ROUND6.md`). On round 7 it held only where captions parse (`ROUND7.md`, verdicts 3 and 4).
A numbered multi-party caption left the party-collision veto added after round 5 empty, so a
judge sharing a party's surname was released. An initials alias with a numeric suffix, a
variant of the round-4 initials-alias class, also leaked. Round 7 courts leaked 8 DIRECT spans
of 343 (`ROUND7-courts-firstcontact.json`). **UK transfer probe**: the courts pack, not changed for the UK, on 10 UK
judgments → **100.0 / gate 100%**, QUASI 40.0, NM 54.2 (`UKPROBE-firstcontact.json`). Scope:
scored 2026-07-23 (commit `eb3329d`), before the round-6 and round-7 fix-sets and the freeze;
it is the only UK board, and no UK judgment has been scored under the frozen configuration
(`FREEZE.md`, Corrections C4). The frozen configuration did run on 26 `.docx` files from gov.uk
on 2026-09-13 (24 results, 2 refused), in the app's first real-document trial; a survivor
scan was run on the 24 and its result was not recorded (`OPS_LEDGER.md` 2026-09-13, step 3;
`FREEZE.md` C8). **SGHCF pseudonym axis**: parties' court codes preserved; the
cited-code class was re-masked AND invisible to gold in BOTH r5/r6 (shared labeler blind
spot — an instrument find), fixed by the LN0 rail + the r7 scheme rule: **14/14 cited codes
preserved** on r7 fresh paper, as recorded in `ROUND7.md`. The round-7 board carries no
cited-code count, and the Family Court gold behind the figure is withheld (`WITHHELD.md` §3),
so it cannot be recomputed from this repository.

## Utility benchmark — the post-AI metric (2026-07-23)

Does a frontier model extract the same legal substance from the masked document as from
the original? 25 round-4 pairs × 5 analytical questions; two Opus analysts, each reading one
side only (one the original, one the masked copy); an Opus judge on substance-equivalence.
**Aggregate utility 0.968** — 121/125 EQUIVALENT, 0 partial; 24/25 docs at 1.00. Files:
`pii-bench/utility-bench/`. Scope, from `harness-v1.js`:
- the masked copies are round-4 paper stripped by the round-4 engine (`:20-21` reads
  `raw/stripped/r4-*-FINAL`), before the freeze;
- the question writer was told not to ask anything whose answer is a name, date, address or
  other identity (`:26`), so the metric measures the substance that survives, not what
  masking removes;
- the judge is not blind: it is told which answer came from the redacted copy and that a
  placeholder standing for a name counts as equivalent (`:46`).

The 4 DIVERGENT verdicts are all on one document, `edgar-r4-04`. The result file keeps three
reasons: two say the original-side answer was empty, one that it missed the question
(`v1-round4-result.json`). Published as drawn.

## The freeze + the pure-OOS receipt (2026-07-24)

**v1-legal frozen** (`FREEZE.md` = version of record, tag `v1-legal-frozen`): frozen
per-genre configuration, claims-with-receipts table, honest courts status, the open shelf.
The engine adapter (`serve-legal.mjs`) hosts the frozen chain behind localhost; genre
router measured **120/120** on rounds 5–7; live E2E mask geometry **byte-identical** to
the frozen batch finals on both genre legs (residual drift = alias numbering + one
near-tie class label; both classes mask).

**PURE-OOS probe** (n=1): an EX-10 filed on 2026-01-21 — before the freeze, and unseen
because it was in no earlier draw — drawn by a fresh query after the freeze (`e25637d`,
2026-07-24 18:24 +0800; freeze commit `04f3c5d`, 10:31). The draw rule (`build-pureoos.mjs`)
was committed together with the draw, not before it; git holds no earlier registration.
Blind gold sealed first (`324d84a`, 18:26), board after (`48adcd9`, 18:31). The manifest's
`protocol` line records that it was stripped through the live adapter. The same line also says
"rule pre-registered" and "adversarially leak-hunted"; the manifest is left as drawn, and both
phrases are withdrawn (`FREEZE.md` C2). Board **100.0 / gate
100% / QUASI 47.1 / NM 78.1** (`PUREOOS-firstcontact.json`, `pureoos-manifest.json`): 3
DIRECT spans in the gold, none readable. NM 78.1 is the highest of the EDGAR first-contact
boards, on one document. An adversarial review panel is mentioned in the message of commit
`48adcd9` only; nothing of it is committed, so it is not claimed here (`FREEZE.md`,
Corrections C2).

**The product-genre claim as of 2026-07-24: 46 unseen EDGAR-shaped business documents
across four consecutive fresh draws — rounds 5, 6, 7 and the pure-OOS probe — with zero
DIRECT identity leaks in the redacted text. Round 4, the first draw under the current gold
and scorer, leaked 3 DIRECT spans in 1 of its 15 documents and is published as drawn.**

Scope: rounds 5–7 each ran the engine as it stood at that round; of the 46, only the pure-OOS
probe, one document, ran the frozen configuration (`FREEZE.md`, Corrections C1). The 46 documents
carry 184 DIRECT gold spans, none leaked, tallied from the `perDoc` rows of the four boards.
Three of the 46 carry no DIRECT gold span at all (`edgar-r5-01`, `edgar-r5-15`,
`edgar-r6-09`) and cannot leak by construction; 43 had a DIRECT span to leak and did not.
The claim is DIRECT only: over the same 46 documents 245 of 503 QUASI spans (amounts, dates,
places, organisations) stayed readable.
Round 4's three leaked spans are all in one file, `edgar-r4-13.txt`, whose gate did not
pass. The earlier form of this claim said 61 documents across rounds 4–7 + pure-OOS with
zero leaks: that count folded round 4's 15 documents into a zero-leak run they are not
part of.

## The frozen configuration on a law firm's own shapes (2026-09-14/15)

The only checked multi-document run of the frozen configuration on fresh paper since the
freeze, and the only one on paper a lawyer writes. (The frozen configuration also ran on 26
gov.uk `.docx` files on 2026-09-13; no result of that run's survivor scan was recorded — see
the UK probe paragraph above.) Files of record: `OPS_LEDGER.md` 2026-09-14 and
2026-09-15, and `FREEZE.md` "Profiles added AFTER the freeze"; the filings, the engine output
and the hand check are not in the tree. 21 public court filings from CourtListener RECAP, in
two draws (nine, then twelve never seen by any round): briefs, complaints, an answer,
settlement agreements, a demand letter, engagement letters and a retention application,
declarations, letter motions, an expert report and an expert designation, a bankruptcy fee
statement. 20 are scorable (one is an image scan with an empty body). There is
no sealed gold: one labeler (an agent) listed the identifiers in each original by hand, 296 of
them over 1,444 occurrences, and each was counted whole-word and case-insensitive in the
engine's output. Judges and other officials are not in the count. On papers routed as court
judgments the engine releases by design a name it reads as a judge's (`apply-ln.mjs` LN2) or as
counsel's on a counsel line (`…, for the plaintiff`, LN3), and the name of a court or public
body acting officially (LN1); the count says nothing about judges.

| frozen configuration, both draws | |
|---|---|
| identifiers still readable | 27 of 296 |
| readable occurrences | 45 of 1,444 |
| documents with a readable identifier | **14 / 20** |
| reporter citations kept readable | 9 / 82 (11%) |
| email / phone / GUID left anywhere | 0 |

No person in the hand lists was left readable. What stayed readable was organisation, firm and
business names — party companies' names among them — docket and case numbers, an address
fragment and money amounts; in the first
draw, at an organisation's first mention in a caption, a `Re:` line or a defined-term
parenthetical, or inside a rail's glue (`OPS_LEDGER.md` 2026-09-14, finding 2). The opt-in
`--profile firm`, built from the first draw's misses, reads 11 / 11 / 8 of 20 / 46 of 82 on the
same yardstick; `FREEZE.md` states it as "a measured improvement on hand-listed identifiers
over 20 documents, not a fifth walk-forward round".

## Ops (OPS_LEDGER.md is the file of record)

- Swarm corpse rate: **1 / 599** agent executions (0.17%) — one transient auth death, masked
  by a "0 failed" summary; caught by journal started-vs-results counting.
- Workflow resume: **3 / 301** cache hits where ~299 were expected — treat resume as
  potentially full-cost until verified small.

## Third-party data

| Source | License / status | Redistributed here? |
|---|---|---|
| TAB (Norsk Regnesentral) | MIT | stats + doc ids only; corpus re-downloaded by pinned commit |
| Caselaw Access Project | public domain | corpus excerpts committed with per-doc provenance |
| SEC EDGAR | US government public records | manifest URLs only; text re-downloaded |
| SG eLitigation judgments | public portal | **not redistributed** in the tree at HEAD — URLs + our annotations only; commits before `f2c22eb` hold the gold as span text and are not to be published until the history is rewritten (`README.md`, "Data statement") |
