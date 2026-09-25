# BACKPORT_RED.md — legal-campaign findings relevant to simpler-red (2026-07-24)

Red is frozen, shipped, and meeting its bar — nothing here lands except through red's own
bench ratchet + fresh-doc walk-forward, in the owner's red terminal, one variable at a time.
This is the evidence-pointed worklist, three tiers.

## Tier 1 — adopt now (instrument, zero engine risk)

**The utility benchmark.** Red's product is the export-to-AI path; "does a frontier model
extract the same substance from the masked doc?" is red's true metric. Harness:
`pii-bench/utility-bench/harness-v1.js` (question-writer → two blind analysts → judge;
placeholder-substitution legitimate). Legal's first number: **0.968** on 25 original/masked
pairs (`b4c7818`). Run over red's bench corpus as-is. If aggressive company-masking costs
utility, that becomes a MEASURED v2 argument.

**Scorer audit: the substring-phantom bug.** Legal's scorer v1 counted substring occurrences
— "Bo" leaked inside "Board", "Sim" inside "Similarly" — phantom verdicts polluting every
short-span result until word-bounding (`357c84a`). If red's occurrence counting shares the
pattern, historical short-span verdicts deserve a rescore.

## Tier 2 — v1.1 candidate rails (name-shapes, not legal-shapes; each from a measured leak)

| Rail | Leak that produced it | Where |
|---|---|---|
| Initials aliases verify as SUBSEQUENCE of name initials | "Richard Michael Baldock (RB)" — R[M]B; contains-check missed it | `legal-rails.mjs isInitialSubseq` (`ca307d6`) |
| Firm-name partner lists mask whole + surnames propagate | "Dornbush, Schaeffer, Strongin & Venglia, LLP" leaked 3 surnames | `firmNameListRegions` (`ca307d6`) — business docs are FULL of these |
| Kinship apposition | "Langston's son, Bo, consulting…" | `kinshipNameRegions` (FS5) |
| Quoted spelling variants | `spell … "Erick."` | `quotedVariantRegions` (FS5) |
| Parenthesized defined aliases (derived-from-name only) | `Daniel Sim ("Sim")` | `definedAliasRegions` (FS5) |

Plausibly living in red's residual ~5% OOS; prove on red's next fresh batch, never by
re-scoring old rounds.

## Tier 3 — do NOT port (solves problems red doesn't have)

Keep/restore machinery, doctrine projections, LN restore sweeps, de-glue (only needed for
SUBTRACTIVE ops — red is add-only and therefore gate-safe by construction), profiles/packs
(relevant only when red serves multiple contexts = red v2's shape, owner's timeline).

## Standing lesson both engines share

Add-only model sweeps are gate-safe by construction; subtractive ones need entity-granular
regions + structural guards. Red is entirely add-only — its architecture was on the right
side of this law before the law was written down.

## Model discovery convention (2026-07-24, owner: "search user desktop for models — never re-download 3GB")

**Tier 1 for every vertical + red + harness.** MODEL_DISCOVERY.md + locate-model.mjs:
canonical shared dir = the already-real `%APPDATA%\Simpler AI\models\`; identity by sha256
pin (E2B pinned: `3646b4c1…`, 3,349,514,112 bytes); bounded search order (env -> canonical
-> legacy per-app -> HF/LM-Studio/GPT4All/Jan/Ollama caches -> Downloads top-level);
hardlink-into-canonical, never copy; downloads only into canonical; **no full-disk crawl
ever (brand law)**. The Tauri `model_check` scaffold in every app implements this order
when the harness organs port; `ModelStatus.searched` is already the right shape.
