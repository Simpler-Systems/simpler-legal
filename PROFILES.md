# PROFILES.md — doctrine as configuration (the family's product architecture)

**Phase 0, 2026-07-23.** The engine core stays frozen; **doctrine profiles version
independently.** One detection engine, per-context mask/keep/generalize policy — this is not a
scoring patch, it is the mechanism every simpler vertical ships on (named as such per the
1a review: HIPAA Safe Harbor mandates masking dates, ages >89, geography below state — i.e.
the .med profile will look like TAB's ruler, while .legal's court-validated doctrine is its
near-opposite. Same engine, different profile).

| Profile | Doctrine | Validated by | Instrument |
|---|---|---|---|
| `tab-scorer` | dates/amounts/durations masked wholesale | TAB's ECtHR-publication game | `pii-bench/oos-labels/` (swarm gold as labeled) |
| `product` (.legal) | keep unless **identity-anchored** (born/DOB/death/passport/NRIC/salary-class); companies keep unless person-anchored (FS3 guards) | REDACTION_AUDIT.md: 8 SGHCF judgments, F.3d practice, EDGAR filer practice | `pii-bench/oos-labels-product/` (doctrine projection of the same gold — `derive-product-gold.mjs`) |
| `hipaa` (.med, future) | mask dates except year, ages >89, geo below state | HIPAA Safe Harbor §164.514(b)(2) | (that vertical's corpus) |

Rules of the mechanism:

1. **The engine never reads gold; profiles never add detection.** A profile only decides the
   fate of what the engine already found: mask, keep, or (future) generalize.
2. **Every profile has its matching gold instrument** — scoring profile A against profile B's
   gold measures doctrine disagreement, not quality (measured: the P0 flip scored against
   TAB-doctrine gold read as a 52-point QUASI "crash" that was actually composition).
3. **DIRECT is profile-invariant.** No profile may downgrade a DIRECT entity; the gate law
   binds every profile identically.
4. **Projections are committed scripts, not hand edits** — `derive-product-gold.mjs` is the
   template: same annotations, doctrine applied mechanically, examples printed, counts logged.

Implementation of record: `apply-p0.mjs --profile tab-scorer|product` (tab-scorer proven
byte-identical to the FS4 stack on both genres before the split landed). Migrates into
`lib-legal/engine.mjs` RESTORE_POLICY when the OOS applicator and the TAB tower merge.

## Packs — the region×type architecture (owner thesis 2026-07-23, measured basis)

**One frozen core + declarative packs, never N forks.** The overnight racing *discovered*
per-genre engines empirically: arms adopted on one genre and rejected on the other (FS6
rails courts-only; LN restore courts-only; LQ2 zero-contribution on EDGAR; LQc guards
EDGAR-required). The adopted stacks already diverge — courts = V2C+LN+LQb, EDGAR = V2C+LQc —
and cross-region contamination is measured, not hypothetical (ECHR keep-vocab "wilson"
unmasked a US defendant).

A pack = four file-shaped things per region×type: (1) rail set, (2) grown vocabularies,
(3) doctrine profile, (4) adopted sweep roster. The core (region engine, walker, table,
sweep machinery, gate law, scorer) ships once; a walker fix lands once. Each pack carries
its own ratchet bench.

Missing component: **the router** — incoming doc → pack. Structural detection first
(`[2024] SGHC` headers, F.3d captions, EX-10 legends, ECHR application numbers), narrow E2B
classify sweep for ambiguous docs. Round 4 examines packs, not "the engine": fresh SG docs
vs the SG-courts pack, fresh agreements vs the EDGAR pack; cross-pack transfer is a
measured question.

## The post-AI bar (owner thesis, 2026-07-23)

Presidio/TAB comparisons benchmark PRE-AI redaction (human readers under NDA). This product
redacts FOR a post-AI workflow: the doc's purpose after redaction is frontier-model analysis.
Therefore: (1) the protected class is contextual — "who must not learn what": client identity
in litigation, DEAL identity in M&A (a deal-room pack masks counterparty names old strippers
would keep — the company IS the insider-tradeable secret); (2) the true metric is
**analytical utility**: frontier-model Q&A agreement on masked-vs-original documents at zero
identity leakage, enabled by structure preservation — red's consistent alias table
([Acquirer]/[Target]) and generalization (dates→relative timeline, amounts→magnitude).
Presidio/TAB stay as credibility anchors, not goals. Planned instruments: deal-room pack;
utility benchmark (blind Q&A harness over original/masked pairs).

## Rulings log

- **2026-07-24 (owner): per-country packs; top 3 = SG, US, UK.** No abstract
  Commonwealth-core product — individual country packs, shipped per jurisdiction. SG and US
  are walk-forward-proven (rounds 1–5); UK enters via a measured transfer probe (courts pack
  unchanged on UK judgments) before any UK-specific rails. Commonwealth structural heritage
  (neutral citations, X v Y captions, J/LJ titles, initials-anonymization in family courts)
  is the transfer hypothesis — measured, never assumed.

- **P0 (2026-07-23, owner "ok try it out"):** dates/amounts/durations keep unless
  identity-anchored. Applied engine + gold projection.
- **P0b/P0c (2026-07-23, owner asked for recommendation; recommended and applied):** party
  companies and bare role titles keep unless person-anchored — gold projection (157 orgs, 58
  titles; person-named firms like "[personal name] Pte Ltd" correctly stay maskable) + engine:
  BRAND rows join the company-keep, person-token veto uses clean person rows only (junk
  classify rows had poisoned it). Regression to FS4 byte-exact in tab-scorer; DIRECT gates
  held everywhere.
- **Deliberately NOT flipped: occupations** ("disc jockey", "sole director and shareholder").
  Audit shows courts keep them, but they describe the protected person — one variable at a
  time; future arm with the audit evidence attached.
- **PENDING OWNER: courts genre status.** Recommendation on record: validation genre (DIRECT
  hardening + citation doctrine only; no preservation-90 campaign) until a
  publication-workflow buyer (judiciary/publisher) is named. EDGAR-shaped flow carries the
  bar attempt.
- **P0i (2026-07-24, owner "run it" on recommendation): geography keeps unless
  person-anchored.** The identity-anchor principle applied to LOC: jurisdictional machinery
  (governing-law states, incorporation states, venues, counties) → NO_MASK; person-anchored
  places (residences, personal locales) stay QUASI. Refined in the same session by
  spot-check BEFORE first race: street addresses and their components (zips, notice-block
  city lines) are NOT jurisdictional geography — address-shape + notice-context guards keep
  them QUASI fail-closed (a notice-block address can be an executive's home). Measured on
  round-6 gold: 90 flips, 173 kept.
- **P0j (2026-07-24, owner "run it"): cultural-work creators are not private individuals.**
  The Mendelssohn class. ULTRA-NARROW, the only projection permitted to touch DIRECT: every
  occurrence must be possessive directly followed by an opening quote, and the name must
  share no token with any other PERSON entity in the doc. Round-6 gold: exactly 1 flip
  (Mendelssohn) across 40 docs — as narrow as designed.
- **P0k (2026-07-24, owner "run it"): occupations-noun boundary = person-attachment.** An
  occupation appositive to a specific individual is the entity class (QUASI in compliance
  profile, keep in product per P0e); a generic-noun occupation (statutory language,
  hypotheticals, "an employer must…") is not an entity at all. Product gold unchanged this
  round (P0e already covers it) — this ruling governs the compliance profile and labeling
  hygiene from round 7 forward.
- **2026-07-24 (owner): license is Apache-2.0** — supersedes the MIT-everywhere ruling.
  Same disruption thesis, now with the express patent grant and NOTICE discipline Apache
  brings. LICENSE + NOTICE at repo root; TAB and other third-party terms unchanged.
