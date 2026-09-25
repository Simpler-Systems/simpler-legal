# What this repository does not publish, and why

What ships here is the rest of what a reader needs to reproduce the numbers in
`BENCHMARK.md` and `FREEZE.md`: the rebuild scripts and manifests, the gold, the scorer
and every board. The engine's output does not ship for any round — it lives in `raw/`,
which is gitignored — so a board is reproduced by re-running the engine at that round's
commit, with the model, and scoring what it writes, not by re-scoring a committed file.
Beyond that, the exceptions those files state: the courts rows (§3 below); the
first-contact boards of rounds 4–6, whose gold ships only as re-projected after contact,
so that of their columns only EDGAR DIRECT recomputes as first scored (`BENCHMARK.md`,
"Which gold ships"); and the firm-paper figures, whose filings, engine output and
hand check are not in the tree. Three categories of *content* are deliberately not. This file is the
record of what they are, why, and what it costs a reader.

The principle throughout: a redaction tool must not publish the identifiers it
was built to protect. Where reproducibility and that rule appeared to conflict,
we looked for a design where they don't. Twice we found one. Once we didn't, and
took the loss rather than the shortcut.

---

## 1. Source documents — rebuilt, not redistributed

`raw/` is gitignored. The benchmark corpora are fetched from their public
sources at build time:

| Set | Source | Rebuild |
|---|---|---|
| oos (100) | SEC EDGAR, US courts, SG eLitigation | `node build-oos.mjs` |
| round4–7 (160) | same | `node build-round4.mjs` … `build-round7.mjs` |
| ukprobe (10) | Find Case Law (Open Justice Licence) | `node build-ukprobe.mjs` |
| pureoos (1) | SEC EDGAR (one EX-10 exhibit) | `node build-pureoos.mjs` |
| corpus/newcases (99) | Caselaw Access Project | committed — public domain |

Singapore judgments are published by the courts but may not be republished by
us (owner ruling, 2026-07-23). Every manifest carries the URL and a `sha256_16`
per document, so a rebuilt corpus can be proven byte-identical to the one the
boards were scored against. If it isn't, the tooling says so and stops.

**Cost to a reader:** a network fetch before the first score. Nothing else.

## 2. Gold span text — replaced by offsets

The gold labels are the ground truth that makes every published board
falsifiable. They also held, in plain text, ~79,000 annotated spans, thousands
of them tagged `DIRECT` — the label meaning *this directly identifies a private
individual*. Publishing that is publishing a machine-readable index of the
people the tool exists to protect.

It turned out to cost nothing to fix. `score-pii.mjs` never uses span text as
*data*: it uses it twice as a *search needle*, against documents the reader
already holds locally. So the published gold says where a span is, not what it
says:

```json
{ "category": "PERSON", "identifier_type": "DIRECT", "off": 41207, "len": 15 }
```

`node gold-offsets.mjs hydrate` slices the text back out of your corpus copy
into `raw/gold-hydrated/` (gitignored), and every tool resolves there
automatically — the commands printed in `BENCHMARK.md` and the round writeups
are unchanged and still work.

**Proof this is lossless.** Both checks below are receipts from the authoring machine,
which still held the verbatim gold. Neither is re-runnable *here*: this repository does
not publish the verbatim span text, so on a clone every set skips, nothing is compared,
and both commands now say so and exit 3 rather than printing a pass over an empty
comparison. Run them on a tree that still holds the verbatim gold and they do the work
described.

- `node gold-offsets.mjs verify` — 79,052 entities, 0 label mismatches, 0
  occurrence-count differences.
- `node gold-offsets-equiv.mjs` — runs `score-pii.mjs` against real stripped
  output under both the verbatim and hydrated gold across 14 configurations
  covering every genre, corpus and round behind a published claim, and diffs the
  full board JSON. 14/14 byte-identical.

The verbatim files were deleted only after both passed. They were deleted from
the tree, not from its history: the commits before `f2c22eb`, both tags among
them, still hold gold span text (§3).

**Cost to a reader:** one extra command.

## 3. SGHCF annotations — withheld outright

The 80 label files for the Singapore Family Court documents (`sghcf-*`, 40 gold
+ 40 raw labeller passes) are not published in any form, not even as offsets.
That is true of the tree at HEAD. The commits before `f2c22eb`, the tag
`v1-legal-frozen` among them, still hold all 80, 75 of them with span text (the
other 5 are empty entity lists); the earlier tag `v1-legal-FROZEN-v12` holds none of
the 80, but it holds other gold with its span text, Singapore judgments' among it.
The same history carries a name from one of these judgments, one the court's
anonymisation missed, in twelve paths and in the messages of three commits, and the
repository's reflog repeats those messages. Text from these judgments also stands where
no search for that name or for the gold's `"span_text"` key reaches it: leaked spans
written out in full in seven run boards of `v1-legal-frozen` (two of them outside those
twelve paths), earlier versions of `app/frontend/public/benchmark.html` and
`site/research.html`, `ROUND7.md` as `v1-legal-frozen` holds it, the message of a fourth
commit, and the same reflog (counted 2026-09-24, `FREEZE.md` C13). The history — files and commit messages both — is to be
rewritten, and the reflog expired, before `master` or either tag is pushed or the
repository handed over (`README.md`, "Data statement"; `FREEZE.md` C10 to C13).

Offsets do not solve this one, and it is worth being exact about why, because
the reason is not the obvious one. **Nothing here is sealed.** These judgments
are public at `elitigation.sg`, and the identifiers our gold marks — including
the vehicle registration plates — sit in the public text. We hold them
legitimately.

The problem is that the Singapore court *affirmatively anonymised* these parties
— they are reported as `VNW v VNX` — and our gold is an index of precisely where
that anonymisation did not reach. That is the entire reason the set exists: it
is the hardest stress genre we have, a real document where real de-identification
was attempted and left residue. Publishing the index would hand out a defeat-list
for another institution's privacy measure. An offset list bound by manifest to a
citation is that defeat-list whether or not it carries the strings; the harm is
**aggregation**, not disclosure. It turns identifiers scattered across 11,000
words into a short machine-readable list.

The US and UK sets differ in kind, not degree. Those courts and regulators name
their parties deliberately; indexing them re-publishes nothing anyone tried to
withhold.

**Cost to a reader — the real one.** The courts-genre boards cannot be fully
reproduced. `score-pii.mjs` marks those documents `withheld`, excludes them from
the aggregate, and prints the scope:

```
SCOPE: 5 of 40 documents excluded — their gold is withheld from the public
       repository (see WITHHELD.md). This board measures the remaining 20 and is
       therefore NARROWER than the published one. Compare like for like.
```

The 20 is 40 − 15 − 5: a courts board lists the round's 15 EDGAR documents too, and
their outputs sit in the EDGAR run, so the same scorer run also prints
`MISSING OUTPUTS: 15 <- run is INVALID`. The committed courts boards carry the same 15 in
`missingOutputs` (`ROUND4`–`ROUND7-courts-firstcontact.json`); on a courts board that line
means the EDGAR documents are scored on their own board, not that the courts figure is short.

So a reader recomputes the courts numbers over the 20 non-SGHCF court documents and gets a
different figure from ours — by design, and announced rather than hidden. The
gold behind the UK, pure-OOS and round-7 EDGAR boards ships complete. For rounds
4–6 the committed gold is the gold re-projected after contact: it leaves every
EDGAR DIRECT label unchanged, and it does not give back those rounds' other
first-contact columns (`BENCHMARK.md`, "Which gold ships").

We think an unreproducible row is the better failure. The alternative was
publishing the file.

---

## What is NOT withheld

Stated positively, so the boundary is unambiguous. All of this ships and is
checkable: every manifest with per-document URLs and hashes; the offsets gold
for all other sets; every run board in `pii-bench/runs/`; the frozen
configuration and the exact commands; the scorer, its selftest, and the
equivalence harness above; the gold-ceiling sample, key and verdicts behind the
88.8% figure; and every miss, by class, with its diagnosis.

Run boards at HEAD record leaked spans as `{category, length, digest}` rather than text
(since `90a82d7`, 2026-07-26; the boards before it, still in the history, hold the text) —
diagnosable, countable, and matchable against your own re-run, never readable.
`SIMPLER_LEAK_TEXT=1` restores plaintext for local debugging; a board produced
that way must not be committed.
