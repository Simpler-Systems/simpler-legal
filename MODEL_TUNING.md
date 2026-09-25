# MODEL_TUNING.md — how this family makes a stock Gemma E2B perform (legal edition)

**What "tuning" means here — the binding frame.** Family law (harness `BLUEPRINT.md`, carried
by every sibling): **vanilla models only** — stock Google weights, hash-verifiable
(`gemma-4-E2B_q4_0-it.gguf`, sha256 `3646B4C147CD235A44D91DF1546D3B7D8E29B547DBE4E1F80856419AA455E6FD`),
and ALL adaptation is **inference-time**. Nobody fine-tunes. Everything below is what actually
moved the business-side numbers from ~85% to a ratcheted 100% on 53 labeled documents
(simpler-red hardening campaign, 2026-07-19) and a measured 95.80% exhaustive on 79k words of
raw SEC filing (2026-07-20) — with the receipts in `simpler-red/bench/`. If a future owner
ruling ever wants weight-level tuning, that is a doctrine change to the vanilla law, decided
there, not here.

## The one sentence

**The E2B is an executor, never a thinker: every model call is a tiny, scoped, grammar-caged
judgment inside a deterministic software spine, and every claim it makes is verified in code
before it takes effect.**

This is the vertical's thesis — *the app gathers, the frontier model makes sense, the lawyer
judges* — applied one level down: locally, the software gathers, the E2B executes
micro-judgments, the code judges the E2B.

## The measured mechanics (use these numbers as the starting point, then re-measure)

1. **Window: 500 characters, 100 overlap, word-boundary-safe.** Measured breaking point, not
   taste — recall walked off a cliff between 1,400 and 500 on the business corpus; the sweep
   is in `simpler-red/bench/EVIDENCE_2026-07-19.md`. Document length becomes irrelevant to
   correctness (throughput measured FLAT at ~0.75–0.84 min/1k words to 79k on bare CPU —
   relevant here, because legal documents are long: a full appellate record dwarfs a 10-K).
2. **State lives in code, never in a prompt.** The single most expensive lesson: feeding the
   model a carry-list of "what you found so far" cost **−24 recall points** (controlled A/B,
   round 3). Global memory is a code-side table; the model only ever sees the current window.
3. **Grammar-caged output.** Classification calls run under a GBNF enum grammar — the model
   physically cannot answer outside the schema. Load-bearing server flags: `--jinja
   --chat-template-kwargs {"enable_thinking":false} --ctx-size 8192 --parallel 1`, temp 0,
   hard token caps per task (extraction 400, classify 6, residue 300).
4. **Verify-or-refuse.** Every model nomination must occur verbatim in its source window or it
   is discarded. No hallucinated output can take effect. **2026-07-20 amendment, learned the
   hard way at 79k scale: occurrence is not sanity** — the model once nominated "he" and bare
   digits, which *do* occur, and shredded the document. Verification needs a floor (minimum
   footprint length, stopword rejection) as well as an occurrence check.
5. **Rails first, model second.** Anything regex-able NEVER costs a model call and never gets
   a chance to be misjudged. In law this is a gift: **citations, docket numbers, and case
   captions are the most regular strings in any professional domain** — `___ F.3d ___`,
   `No. 1:20-cv-01234`, `v.` captions are rails, not judgments. Every measured leak family
   becomes a new rail — **recall becomes a code property** — and the bench ratchet
   (`bench:all` exits red on any core leak) makes it monotonic.
6. **Two-engine shape for anything protective.** Engine A wide-sweeps the original; Engine B
   is a specialist that reads only A's OUTPUT and hunts a checklist compiled from measured
   misses. The checklist is the tuning — it grows from evidence, not intuition.
7. **Untrusted input is fenced.** Document text entering a prompt is wrapped with an injection
   guard (the harness `bullets.rs` pattern); the model's instructions are frozen strings
   pinned by tests, never concatenated user data.

## The discipline that IS the tuning

None of the numbers above came from prompt-fiddling. The loop that produced them:

1. **Build the eval corpus before the engine.** Hand-labeled ground truth, every labeled
   string mechanically verified verbatim against the source (a paraphrased label is a defect).
2. **Score exhaustively, not by spot-checks.** Spot recall said 14/14 while exhaustive
   labeling of the same document found 95.80% and a document-shredding defect. Spot checks
   buy comfort; exhaustive labeling buys the right to a claim.
3. **Audit the ground truth adversarially.** Model labelers missed 60/262 entities in one
   systematic blind spot (institutions inside biographical sentences — a shape law is FULL of)
   until a regex sweep + hand triage caught them. Trust no single labeling pass.
4. **Publish the misses.** Every miss is named and becomes either a rail, a checklist entry,
   or a documented scope boundary. Refuted predictions stay in the record with their reasons.
5. **Ratchet.** Once a family is caught, a red bench blocks any change that reintroduces it.

## Where the E2B slots into simpler-legal (and where it must not)

Per the ratified thesis, nothing local thinks. The model's legitimate seats, in build order:

1. **The export stripper for PRIVATE matter files (first and most important).** The legal PII
   posture is split: published judgments are already public — strip nothing; the firm's
   private matter files are the sensitive half — red guards those on export. The LEGAL rails
   battery: docket/case numbers, court file references, party names in captions (`X v. Y` is
   a structural rail that HANDS the engine both party names), firm names (LLP/LLC suffixes),
   judge honorifics ("The Honorable …", "J.", "C.J."), client-matter billing numbers, bates
   stamps. The E2B's judgment residue: uncaptioned party references, witnesses, unstructured
   names. Red's reversible bundle pseudonymization (same alias across every filing of a
   matter, map stays local) is what keeps a multi-document dossier coherent.
2. **Facet extraction as enum-classify.** Causes of action, procedural postures,
   jurisdictions, remedies — mapped by the E2B against the CORPUS-GROWN vocabulary (owner
   ruling: never imported; measured on the med side, an imported vocab scored worse than raw
   TF-IDF). The model maps a passage to a facet or refuses; it never invents. Gate: the
   lawyer-labeled similarity pairs (next-moves #2) exist first, so the layer is eval-gated
   from day one.
3. **Citation normalization on ingest** — regex-first (rails catch the shapes), the E2B only
   for mangled/OCR'd citations under verify-or-refuse. The citation graph (`cites_to`) is a
   similarity axis medicine doesn't have; keep its extraction deterministic so the graph is
   trustworthy.

Non-seats, permanently: legal advice, outcome prediction, argument drafting presented as the
app's judgment, any string that reads as counsel. Trajectories (procedural histories), not
verdicts — same boundary as medicine's SaMD line.

## Order of operations for this vertical's model wave

Eval corpus (lawyer-labeled) → legal rails battery with pinned tests → E2B judgment layer
behind verify-or-refuse + footprint floor → exhaustive-labeled bench + ratchet → only then
wire into the dossier path. Engines without callers are the v1 disease; nothing merges unwired.
The donor evidence for every step: `simpler-red/bench/` (corpus, stress suites, hardening
report, scale bench with the tiny-footprint cascade), harness `_ai/ANONYMIZER_AB_2026-07-19.md`
(the A/B history), harness `_ai/RED_SCALE_2026-07-20.md` (the exhaustive measurement and its
two corrections of record).
