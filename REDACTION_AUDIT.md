# REDACTION_AUDIT.md — do our holes match what real redactors redact?

**Date 2026-07-23. Question (owner): "find any public documents both raw and redacted, see how
much we are covering."** Method: measure real-world redaction practice from public documents,
classify every redaction site, map each family against the engine's current class set
("holes"). Full data + per-doc provenance URLs: `pii-bench/redaction-audit.json`; scripts:
`audit-redactions/`. Fetched corpora land in `raw/redaction-audit/` (gitignored, rebuildable).

## Three real-world redaction doctrines, measured

### 1. Party-made redactions — 34 EDGAR exhibits with CT legends, 4,374 real `[***]` sites

What lawyers redact when *they* choose (confidential-treatment exhibits, the product's genre):

| Family | Sites | Share | Engine verdict |
|---|---|---|---|
| entire_provision (whole clauses/annexes) | 1,012 | 23.1% | **BUSINESS — no span hole can exist** |
| table_block (pricing/spec tables) | 864 | 19.8% | BUSINESS — no hole |
| technical_product (compounds, specs, targets) | 782 | 17.9% | BUSINESS — no hole |
| pricing_fee ($, %, royalties) | 682 | 15.6% | PII-shaped — HAVE (Amount rails) |
| date_duration | 596 | 13.6% | PII-shaped — HAVE (L1/L1b) |
| contact_address (notice blocks) | 134 | 3.1% | HAVE (battery) |
| milestone_event | 89 | 2.0% | BUSINESS — no hole |
| entity_counterparty | 52 | 1.2% | HAVE (policy-dependent) |
| quantity_volume | 42 | 1.0% | PARTIAL |
| bank_account | 41 | 0.9% | HAVE |
| person_name | 27 | 0.6% | HAVE |
| defined_term_name / territory / unclear | 53 | 1.2% | mixed |

**Split: ~35% PII-shaped (every family has an engine hole) / ~64% business-confidential
(trade-secret axis — no PII class covers it, by design) / 0.8% unclear.** The 35% is a floor:
some whole-line masses are label-valued contact/bank fields.

### 2. Court-made redactions — 3,060 F.3d opinions (24 CAP volumes)

Published federal opinions redact by **pseudonym and initials, not black boxes**: Doe
pseudonyms in 50 docs (149 hits), confidential-informant references in 88 docs (327), minors'
initials conventions in ~15 docs, literal `[REDACTED]` blocks in exactly 1 doc. Partial-SSN
conventions (`XXX-XX-1234`) appear in 0 opinions — FRCP 5.2 redaction lives in district
filings, not appellate prose. Engine coverage: pseudonymization is exactly red's
bundle-alias model; initials-shaped parties are the FS1/SG-code territory. Covered in shape.

### 3. Court anonymization at its strictest — 8 SGHCF (Family Division) judgments, letter-coded parties

What the most privacy-protective real redactors keep vs code (per-doc inventory in the JSON):

- **Coded:** the family's persons (`WJZ`, `[H]`, `[W]`, `[SB]`) **and person-anchored
  entities** — `[W Holdings]` (wife's company), `[School A]`/`[School B]`, `[the Disputed
  Property]`.
- **Kept, wholesale:** full dates (142 in one judgment), ages, occupations, unrelated company
  names, money amounts, medical conditions, nationalities, professionals' real names
  (counsel, doctors).

This is the FS2 working doctrine — "companies/dates/amounts survive unless person-anchored" —
practiced verbatim by real courts in the strictest genre. TAB's gold (mask dates,
occupations, nationalities as QUASI) is the outlier doctrine, specific to its
publish-an-ECtHR-judgment game.

## Raw/redacted true pairs: 0 verified (honest null)

Probe v2 (two proper-noun phrases + ≥15 anchor-aligned sites required) found no unredacted
twin among 22 candidates; v1's two apparent twins were false pairs (generic recital match, 0
aligned) and were rejected. Named follow-up sources if span-level pair ground truth is wanted:
CT-expiry refilings, agreements filed by both public counterparties, staged unsealing in
litigation (e.g. initially-sealed dockets later unsealed).

## Implications for the engine (the fundamentals answer)

1. **The PII hole-set is right and complete in shape** — every PII-shaped family real
   redactors use has an engine class; no missing PII hole surfaced in 4,374 sites across
   three practices.
2. **The majority of party-redaction mass is a different axis entirely**: business-confidential
   (whole provisions, tables, technical identity). That is a document/clause-level
   classification gate on the export path — a sibling to the privilege gate — NOT new span
   holes. Do not try to rail it.
3. **The pending dates/amounts ruling now has real-world evidence**: courts at every
   protectiveness level keep dates/amounts except person-anchored ones. TAB's mask-everything
   doctrine should stay a TAB-scorer setting, not product doctrine.
4. **Conventions we don't speak yet** (small, railable): partial redaction (`XXX-XX-1234`,
   last-4 account), pseudonym-preservation (incoming docs may already carry `[H]`, `Doe`,
   `[School A]` — the engine must keep them, not re-mask), initials-coded party captions.

## Container-channel audit (2026-07-25)

**Verdict on "rebuild, don't overlay", corrected 2026-09-22: the text export rebuilds; the
`.docx` export rewrites the original package, and its safety rests on a re-check, not on
impossibility.** The sentence this section used to rest on — "no zip writer exists in the
tree" — is false. `app/frontend/src/lib/extract/docxWrite.ts` is a zip writer (`writeZip()`),
reachable from a live button on the Export screen (`writeRedactedDocx`, imported by
`screens/Export.tsx`).

The text half of the old argument stands. That payload is `remask(file.text, entities)`
written via a plain-text Blob; the original `.docx`/`.pdf` bytes are read once at ingest and
never written, patched or re-emitted, so a comment, tracked deletion or `docProps` author
cannot ride inside it. Structural, not statistical.

The `.docx` export is the other case. It reads the original bytes, rewrites in place every
part the walker reads as text, masks or renames the names the style, list, theme, font,
settings and chart parts carry, and emits a new archive. Removed: comments and the list of
reviewers, tracked deletions (insertions accepted), every reviewer's name and initials,
hidden text, images, embedded objects and files, embedded fonts, macros and add-ins,
alt-text, external link targets, custom properties and custom XML, building blocks, the
sensitivity-label record, a chart's print header and footer, hyperlink and picture
relationships nothing uses, every processing instruction but the XML declaration and Office's
own `<?mso-contentType?>` marker (`MSO_MARKER`), anything in an XML declaration but its
version, encoding and standalone flag (`DECL`), the first-page thumbnail, and every document
property except the created and modified dates, the language, the revision count and five
Word-internal flags (`DROP_KINDS`, `CORE_KEEP`, `APP_KEEP`, `built`, `docxWrite.ts`). Headers
(with any watermark), footers, footnotes, endnotes, chart and SmartArt text are kept and
masked, since 2026-09-25 with the names the engine found in them too (gap 1). A fail-closed re-walk of the OUTPUT (`readOutput`, `docxWrite.ts`) reads every part of
it — its name (percent-decoded as well), element text, every attribute value, every
relationship target, the names of its elements and attributes, and the namespaces it declares
or lists (`xmlns`, `mc:`), save the addresses and names Office's file formats define — for the
names the mask places, found with their words apart or run together (in the file's code
inside a longer word from six letters and digits, `RUN_FLOOR`, save that in text a reader sees
a name is never read inside a plain word of letters: there it counts at word breaks, before an
`s` or `es` ending, and from six inside a token with a digit, `.`, `/`, `\`, `:`, `@`, `#` or
`_` in it or an `@` or a `#` before it, owner rulings 8 and 18, `textHolds`; a designator
spelled out masked whole with the name, ruling 19a, `LONG_FORM`; a row of six digits or more
wherever its digits stand together, and in text a reader sees across one grouping mark of the
set `DIGIT_SEP` names, rulings 9 and 19; percent-escapes, escapes escaped again, `%u`
escapes, character references by HTML's whole table and by number (up to seven decimal or six
hex digits) with or without the semicolon, ligatures and letters in a circle or a square read
as the characters they write, rulings 10 and 19); it reads the text a reader sees, the attribute values
Word shows and every value of a part the writer does not know with the safety-net pattern too.
It holds the file — `bytes` is null and `held` says why — if anything still places a span, or
if the output carries a part nothing can read as text that the writer does not know to remove.
The re-walk checks against the same mask the writer used, so its reach is that mask's reach.
See gaps 1 and 2.

The `.txt` and the `.docx` are not claimed to mask alike (owner ruling 13). The `.txt` and
the clipboard copy are the body alone, masked by the engine's plan and checked by it
(`exportPlan`, `engine.ts`); the `.docx` is every part, masked run by run by the writer and
checked by its re-walk. They read different text with different code, and each item in gap 2
says which exports it was probed through. The measured case of their disagreeing on the same
body is W7F-1 (gap 2, closed 2026-09-24): the `.txt` shipped a name the `.docx` masked.

After the mask, a fragment check (owner ruling 21, `survivingFragments`, `engine.ts`) looks
through the copied text and the `.txt`, and once the `.docx` is written through that file's
other text parts (not its body, not its code), for a piece of a name it masked or of an
always-redact term: each word of it, and each part of a word joined by an apostrophe, a
hyphen or a dot, from four letters, from two where the row and the export both write it with a
capital, or from four digits; found at word breaks, through escapes, before a plural `s`
where the export writes the piece with its capital (as the mask reads an ending), and from
four letters inside an address, a path, or a handle or tag written with the plain `@` or `#`;
never elsewhere inside a plain word of letters. In a tag or handle written with a fullwidth,
small or look-alike sign that the mask reads as `#` or `@` (`＃`, `﹟`, `♯`, `＠`, `﹫`) it
reads a piece only from six letters (`RUN_FLOOR`), since its second pass looks only at a token
with a digit or an ASCII sign; behind `⌗` or `⋕`, which neither the mask nor the check reads as a sign, it reads none.
Beside a row `Anna Wong`, `#wongfamily` flags `wong` and `﹟wongfamily` is not flagged; beside
`Jane Porter`, `﹟porterfamily` flags `porter` and `⌗porterfamily` is not flagged. The mask
leaves all four, as it leaves `Mr Kierkegaard` beside `Søren Kierkegaard`: it does not mask one
word of a two-word row alone (probed 2026-09-25). It flags and never holds: the
Export screen names each piece and what the check read, and the receipt counts them. Probed
on 2026-09-24 with rows `Søren Kierkegaard` and `Margaret Tan`: `Mr Tan replied.` flags `Tan`,
`Kierkegaard12` and `q=Dr.%20Kierkegaard` flag `Kierkegaard`, `the Kierkegaards` flags
`Kierkegaard` and `two Tans` flags `Tan`, and `supporter Kierkegaardian`, `the tan leather`
and `two tans` flag nothing. Its rate of flags that name no
one, on a firm's own files, is not measured.

Since 2026-09-23 the Export screen's statement of what the `.docx` removes and keeps
(`Export.tsx`, `docxScope`, and the paragraph under the save button) describes this writer.
As read at the end of 2026-09-24, after rulings 8 to 19 (it was rewritten for rulings 17 to 19
while this file was being corrected), it states: how a name is found run together, with
the floor of six letters and digits inside a word in the file's code, and that in text a reader
sees it is never found inside a word of letters alone, so a name run into such a word is left
readable and the check does not find it either; that a name found at a break may stand inside a
longer name and is masked there, and that a designator spelled out (`XYZ Corporation`) is
masked with the name; that a token with a `#` in it or a `#` before it is read as one with an
`@`; which marks grouping a row's digits are read across and which are not (a comma, an
underscore, a colon, two spaces, or an en dash, an em dash or a slash with a space either
side); how a percent-escape, an escape escaped again, a `%u` escape, a character reference
(HTML's names with their semicolon, `&nbsp` without it too but no other name, a number with
or without it) and a Proofpoint link's escapes are read, in text a reader sees also across a
mail program's line break inside an escape or inside the gateway's wrapping, where the link
starts with a scheme or `www.`; that the copied text and the `.txt` are held on such an escape
too, written with `%` or as Proofpoint rewrote it (`*E9`, `-E9`); that the check reads part
names, text, every attribute value, element and attribute names and declared or listed
namespaces, but not the names of elements and attributes under a namespace Office's file
formats define, nor, in text a reader sees, a name letter-spaced, written in letters each in
brackets, or with a hyphen or a line break inside one of its words, nor a letter drawn with
`w:sym` from the Symbol font, nor a name split between separate parts of an equation; which
values the safety-net pattern reads (an add-in's attribute and element text among them), that
a number written into an attribute under one of Office's own prefixes is not found, and that
one written as digits alone between the tags of an element under one of Office's namespaces
holds the file where the pattern takes the whole of it, save in a drawing's position or size;
that outside a part the writer does not know a single code word that starts with a small
letter carries a name only from six letters and digits, save a row of two to five digits that
is the whole of a value where such a row is read; and exactly when a part the writer does not
know is kept, including that a plain lower-case word or such words run together are kept in its
attributes, and that between its tags a small-letter word after an address on one of Office's
hosts holds the file. Read again on 2026-09-25, after round 7 landed, it names each limit this
section found it silent or wrong on the day before (gap 2): a quoted or indented next line under
a wrapped link, a wrap just before or inside a `-E9` or `*E9` escape (where neither export is
held), and a line break among the groupings it does not read; and a reference by number with
leading zeros is now read. Its dash clause, "any character Unicode counts as a dash", reaches
two characters further than the code: the superscript and subscript minus (`⁻`, `₋`), which
Unicode counts as dashes, are not read (open). Its account of the fragment check (`fragHow`)
names the plain `@` and `#` of a handle or a tag and the words it skips as too common, and says
nothing of a piece before a plural `s`, which the check also flags (above). The clause that listed "a
number format or a watermark's text" as kept in such a part is gone. The writer's notes
(`report.notes`) are on the receipt, as the `redacted .docx:` line, and on the saved line,
word for word; the note on a kept unknown part lists what the check of the copy read and no
longer says it read "all of it" (`docx-parts.mjs` law 51).

**The highest-severity finding is a WORKFLOW leak, not a container leak.** The export is a
`.txt`. It is useful to paste into a frontier model and useless to file or serve, so the
user is tempted to send the untouched original, which still carries everything. FIXED
2026-07-25: the Export screen and receipt now state, per document, that the export is
text-only, name the channels that document actually has which are NOT in it, and say the
original on disk is unchanged — "send this file, never the original."

Superseded in part 2026-09-22: there is also a `.docx` export now (above), and `flowText`
no longer joins runs with a space — runs concatenate as they stand and paragraphs are lines
(`flowText`, `lib/extract/docx.ts`). The finding as written describes the text export,
which is still text-only.

**Open gaps (ranked; none of these can ever be caught by pii-bench, whose inputs are
already strings):**

1. Written into the output, masked from a table that could not see them — headers, footers,
   footnotes, endnotes, chart and SmartArt text, and a watermark's text. CLOSED 2026-09-25
   where an engine read the body (owner ruling 27); still open where none did (below).

   As it stood from 2026-09-23: the `.docx` writer kept them in the output file and masked
   them with the review table, the user's always-redact list and the safety-net pattern only,
   because the engine read the body alone (`lib/store.ts` sends it
   `flowText(d.items.filter(inMainFlow))` and nothing else), and the output re-walk checked
   against that same mask. So a person named ONLY in a header, footer or footnote — never in
   the body, and not on the always-redact list — was not in the table, was not masked, and the
   gate passed. A footer can carry "Privileged — Smith v. Jones, Matter 2024-0417".

   Now the text the saved file carries outside its body, read off the writer's own record of
   what it writes (`docxMarks`, `attest.ts`, read by `sideOf`, `lib/side.ts`), goes to the same
   engine in a second request of its own, after the body's. The body's request is byte for
   byte what it was (`app/frontend/test/doctrine-profile.mjs` law 5, which counts the requests
   and compares the first with the body). What the second finds is used as names only
   (`joinSide`, `engine.ts`): a name the body also carries joins the review table as a row of
   the body; a name found only outside the body is kept apart, listed on the Review screen
   with where it was found, and masked by the writer wherever the saved file carries it
   (`docxMaskTable`). The copied text and the `.txt` are the body alone and carry none of
   those. `app/frontend/test/docx-parts.mjs` law 84 writes one file with a letterhead naming
   the client, a watermark, a first-page header, an even-page header, a later section's
   header, a footer reading "Client-Matter: Okonkwo / 12345.001", a footnote naming a witness,
   an endnote, a chart title naming a company and a SmartArt org chart of two names: given the
   engine's rows for that text, all eleven names are tags in the parts that carry them. Its
   CONTROL, with no engine read of that text, writes all eleven readable and the gate passes
   the file — the defect as it stood. The engine itself is not run by that law; law 5 of
   `doctrine-profile.mjs` runs the app's request code against a stand-in service.

   Fail closed: when an engine read the body and did not read that text — the request failed,
   the in-app core's run of it did not finish, the frozen pipeline's redacted text of it did
   not align with it, or the list of those texts could not be made at the drop — the `.docx`
   is held with the reason, and the copied text and the `.txt` are not held on that ground
   (`sideHeld`, `lib/side.ts`). `doctrine-profile.mjs` law 5 runs the failed request, the
   unaligned read (with a CONTROL that ships the footer's client when the alignment check is
   taken out) and a request never sent (with a CONTROL); `docx-parts.mjs` law 84 runs the list
   that could not be made. The in-app core's unfinished run of that text is not run by a test.
   A text with
   no letter and no digit once a list's `%1` is taken out ("(%1).", a bullet) is not sent
   (law 84).

   Second pass, 2026-09-25, on how the frozen pipeline's rows come back. The service reads its
   rows off the pipeline's masked text aligned with the text sent (`rowsFromFinal`,
   `serve-legal.mjs`, over the frozen `alignTags`, `lib-legal/regions.mjs`), and `alignTags`
   folds two tags into one region when fewer than four characters that are not white space
   stand between them. `app/frontend/test/docx-parts.mjs` law 85 runs the real `alignTags` and
   the real `rowsFromFinal`; the pipeline's model is not run, and each listed name is tagged
   where the text carries it, as the pipeline tags a name it finds.
   - The texts of different places were joined by a blank line, so a name ending one (a
     first-page header's "Partner: Rhiannon Blake") and a name beginning the next (the default
     header's "Brightline Holdings Ltd") came back as one row that stands in neither text, and
     the second name shipped readable in the saved `.docx` under a gate that passed and a
     receipt that said it was masked. Closed: the texts are joined with a line of four `#`s
     (`SIDE_JOIN`, `lib/side.ts`), which no region takes in, and a row that crosses that line
     anyway is cut there, each piece a row of its own under a tag of its own (`sideRowsCut`,
     `engine.ts`). Law 85 runs five such pairs (two headers, a header and a footer, two
     footers, a header ending with a matter reference and a footer beginning with the client,
     an endnote and a chart title): every name is masked. CONTROL, with the blank line back: in
     each of the five a name ships readable and the gate passes. CONTROL, with the cut taken
     out, over a row that crosses the line: the second header's client ships readable.
   - Two texts of ONE place are still one text, as the part's flow is: a name ending one
     footnote and a name beginning the next come back as one row under one tag, and are masked
     in that part as one (law 85). A run of names a comma apart folds the same way, in the
     body as outside it. Outside the body the fold is one row, and the receipt, which counts
     rows, counts it as one: a footnote listing fourteen people is "People 1" (law 85).
   - A region over 200 characters was skipped by `rowsFromFinal` with the run still reported
     aligned, so what the pipeline masked there came back as no row, and the copied text, the
     `.txt` and the saved `.docx` carried it readable. That applied to the body as much as to
     the text outside it. Closed: every region is a row. Law 85: fourteen names a comma apart
     fold into one region of 201 characters, and none is readable in the footnote of the saved
     `.docx`, in the body or in the `.txt`; CONTROL, with the skip put back, all fourteen are
     readable in the saved `.docx`'s footnote and in the body's `.txt`. Measured over the frozen pipeline's own outputs in `raw/stripped` (306
     runs aligned against their drawn originals): 6 regions over 200 characters, in 3
     documents; in 4 of the 6 runs, from 2 documents, the region's longest line stood readable
     in the app's `.txt`, and in none with every region a row. Such a row masks the whole
     region: over-wide, not under.
   - A name the body carries only inside a folded row of the body's own ("Lim Wei Sheng" and
     "Farah Osman" on consecutive lines, one region) and a part outside it carries alone was
     listed "found only outside the body", under a second tag. It now joins the review table
     under that row's tag where the two are the same kind (`joinSide`); law 85 (an endnote), with a CONTROL
     that lists it apart under a second tag when that join is taken out.
   - A row's span ran to where the pipeline's own text resumes, so it carried the white space
     after the name, and the tag took that space: the copied text and the `.txt` read
     "[Person1]of 3 March." Each span is now cut to its letters' reach (`mapLegalOutcome`,
     `engine.ts`); law 85, with a CONTROL that reads "[Person1]of" again. Over the same 306
     runs: 20,347 rows ended in white space; a tag run into the letter or digit after it stood
     119,045 times in the app's `.txt` before and 1,912 times after (the count takes any letter
     or digit after a tag, so a name's own plural counts), and no run's mask diverged either
     way. The frozen chain's own rendered output carries the same glue (80,032 in those runs,
     `OPS_LEDGER.md` 2026-09-13); the app's exports are not made from it.
   - When the pipeline read that text and its masked text did not align, every surface said
     no engine read it. It now says the engine read it and the app could not use the read:
     the hold, the receipt, both scope sentences and the Review screen
     (`doctrine-profile.mjs` law 5, with a CONTROL that brings back "NOT read").
   - The receipt said "it found N names" of a footer's client, direct line and matter
     reference, and "masked with them as well" of none. It now counts by the review table's
     headings ("People 1, IDs & contact 1") and says nothing found as nothing
     (`doctrine-profile.mjs` law 5; `docx-parts.mjs` law 85, with a CONTROL that takes the
     count by heading out).

   Measured 2026-09-25 over the owner's 21 real `.docx` (counts only; one of the 21 is the
   public `app/extract/fixture.docx`): 8 of the 21 have text to send outside the body, median
   70.5 characters, maximum 5,419 (a 5,029-character footer); by channel, a header in 4 files
   (median 36, maximum 96), a footer in 7 (median 9, maximum 5,029), a chart in 2, the
   footnotes in 2, the endnotes in 1, a diagram in 1, a list's number text in 3 (1 character
   each). None of the 21 made `docxMarks` throw or come back empty over such text. Before the
   no-letter rule, 16 of the 21 had text to send, 8 of them only a list's number text.

   Still open:
   - When no engine read the body (the engine was offline, or its run failed), nothing is
     sent, and those parts are masked as before, with the table, the list and the pattern
     only. Every surface says so (`sideScope`, `sideReceipt`).
   - A name found only outside the body cannot be left readable, or corrected, from the
     Review screen; it is masked in every part of the saved file that carries it.
   - Rows the second run's model double-check cleared, and rows the in-app core marks as
     boilerplate, are dropped rather than listed.
   - Not sent, because the writer does not keep them as text a reader sees: style, list,
     theme and font names, bookmarks, field instructions, a part's name. A name there is
     masked by the table (the names found outside the body included), renamed, or holds the
     file, as before. A text an add-in wrote, which the writer holds on rather than masks, is
     not sent either.
   - When the frozen pipeline's redacted text of that text does not align with it, the `.docx`
     is held and dropping it again is not expected to change that (the pipeline reads the same
     text the same way). For bodies that happened to 2 of 26 on 2026-09-13 (`OPS_LEDGER.md`);
     it has not been measured for this text, and no live run of the second request has been
     made on this tree. The surfaces say the engine read that text and its read could not be
     used, not that no engine read it.
   - The line of four `#`s between places has not been sent to the pipeline's model on this
     tree. Law 85 shows what the alignment makes of it when the pipeline's masked text keeps
     the line as it was sent. If the pipeline rewrote the line, its masked text would not
     align with the text sent, and the `.docx` would be held as above.
   - Not closed in lane H (frozen code): `alignTags` stops after 400,000 steps. A text it
     cannot align within them is skipped by the frozen pipeline (`apply-v2.mjs`, which writes
     no output for a file whose alignment fails), the service answers that the pipeline wrote
     no output, and the app reads the body with the in-app core instead (`stripDocument`,
     `engine.ts`), which the receipt names. One of the owner's 21 files, a body of 579,663
     characters, is such a text (lane H attack, 2026-09-25, counts only); a synthetic text of
     450,000 characters fails and one of 400,000 aligns. That path is read from the code and
     was not run with such a file. Raising the guard is a change to `lib-legal/regions.mjs`,
     which is frozen: the owner's call.
   - The second request goes to the pipeline's own genre routing; the body's genre is not
     passed to it. The receipt says so when the two were routed differently.
2. Places the output re-walk reads and still passes. Until 2026-09-23 this gap was "layout
   parts copied unread": the style, numbering, theme, font and settings parts were copied
   byte for byte, and a declared term shipped in a list's numbering text, a style, theme or
   font name, a body paragraph's `w:pStyle`, a caption label, a chart trendline name and the
   sensitivity-label record (`docMetadata/LabelInfo.xml`, which carries the firm's Microsoft
   365 tenant ID) under a passing gate. Closed that day: the re-walk reads every part of the
   output — element text, every attribute value, part names and relationship targets — and
   those places are masked, renamed with every reference, or removed with a note
   (`docxWrite.ts`, header comment and `readOutput`; `app/frontend/test/docx-parts.mjs` laws
   1–17, each fix with a control that fails without it).

   Found against that writer the same day, and closed later that day. Each was reproduced
   first through `exportPlan` and `writeRedactedDocx` (the Export screen's calls), and each
   has a `docx-parts.mjs` law whose control ships the name when the fix is taken out:
   - an equation whose runs split a name inside the word (`Kes` + `trel`, or a tracked edit
     inside it): the writer and the gate read an equation's runs joined, as Word draws them
     (laws 26 and 40);
   - a name glued inside a value that is not a bare identifier — a style alias list
     (`B1,KestrelBody`), a VML connector's reference to a shape (`#KestrelBox`), an internal
     link relationship left behind when its link was unwrapped (`#KestrelSchedule`): every
     name in such a value is read, and the value is renamed, re-pointed or dropped (laws 27,
     31 and 42). A part named with such a name (`word/KestrelNotes.xml`) holds the file: the
     part keeps its name, and the hold says that anyone who opens the copy as a zip can read
     it (law 27);
   - in an XML part the writer does not know: a name nobody reviewed, in an attribute
     (`acme:client="Jonas Whitfield"`) or as a lower-case word between the tags
     (`whitfield`); and a declared term or a table row written run together with a capital, a
     digit or a separator at the join (`KestrelHoldings Ltd`,
     `sites/KestrelHoldings/Shared Documents`, `matters/KestrelSPA/v3`, `MargaretTan, partner`,
     `kestrelAcquisition`, `kestrel2024`, `kestrel_holdings`), or written whole in lower case
     (`margarettan`, `harrowleung`). Each now holds the file (laws 28 and 36). All in lower case
     and joined to other letters, in an attribute, it did not until the second fix below.
     The note for a part it keeps no longer says the part "holds no text anyone typed"; it
     says what kinds of value are in it, and since the second fix below, what the check of
     the copy read (law 51);
   - a chart's print header or footer written with Excel's codes (`&CKestrel Confidential`):
     removed, with a note (law 30);
   - a processing instruction carrying a name: removed and counted on the receipt (law 37);
   - a Social Security number in a number format escaped one character at a time, or split
     across quoted runs: read as the format prints it, and masked (law 39).

   Found against that writer the same day, and closed later that day (the writer's comments,
   `docxWrite.ts`; `docx-parts.mjs` laws 45–57; the suite, laws 1–83, 399 checks passing on
   2026-09-24). Each was
   reproduced again on 2026-09-24 through `exportPlan` and `writeRedactedDocx`, and was masked,
   renamed, removed or held the file:
   - a name from the table or the always-redact list split inside the word across an
     equation's box, bar or accent (`Kes` + a box holding `trel`; `Marga` + a bar over
     `ret Tan`): masked. What an equation prints in line with its neighbours is read with
     them, and what it prints apart (a subscript, the parts of a fraction, a limit) stays apart
     (laws 45 and 54);
   - a Social Security number in a number format's currency section (`[$123-45-6789] 0`), which
     Word prints: masked (law 48); a name nobody reviewed there, in a part the writer does not
     know (`[$Jonas Whitfield] 0`): holds the file (law 47);
   - a processing instruction shaped like Word's marker (`<?mso-KestrelHoldings?>`): removed.
     Only `<?mso-contentType?>`, whole, is kept (`MSO_MARKER`, law 50);
   - in a part the writer does not know, a name as the name of an element or attribute
     (`<acme:MargaretTan/>`, `acme:MargaretTan="1"`): holds the file (laws 49 and 55);
   - a name run together in a header or the body (`HarrowLeung`, with `Harrow Leung` on the
     always-redact list): masked (law 46);
   - a name of six letters and digits or more run together lower-case first or all in lower
     case, in an attribute an add-in wrote in either kind of part (`margaretTan`,
     `kestrelholdings`, `margarettanllp`): holds the file; in a style's id and name or a
     font's name: renamed;
   - in a part the writer does not know, a name nobody declared run together or as a path
     between its tags (`jonasWhitfield`, `clients/Whitfield_Crane`), save a lower-case word
     after an address on a host Office's own addresses use (closed 2026-09-24, below), and a number written
     without separators (`+14155550123` between its tags, `123456789` in an attribute): holds
     the file (law 47).

   Closed on 2026-09-24 under owner rulings 8 to 12, each probed that day through the same
   calls (docx-parts laws 58–67, 365 checks passing at the time):
   - a name from the table or the always-redact list written with `%20`, `&nbsp;` or `&#32;`
     between its words in text a reader sees, as a pasted SharePoint or document-system path or
     text copied out of a web page writes it: masked in the `.docx` and in the `.txt`, the
     escapes with it (ruling 10, `pctRuns`); so is one written with an escape escaped again
     (`%2520`) or a `%u` escape, and an escape that writes no character where a name could
     stand holds the `.docx` (`pctHidden`), in a part's name as anywhere else;
   - the over-masks of the short-word rule (below): with a find in text a reader sees never
     counted inside a plain word of letters (ruling 8, `textHolds`), `Tan` is not masked in
     `Tang`, `Ong Wei Ming` not in `Wong Wei Ming`, `Porter` not in `reporter`;
   - a row of six digits or more inside a longer number, an IBAN, a wire or DMS reference or a
     matter number with a prefix, where the safety-net pattern, which reads a number whole,
     masked none of them (SEAM-DIGITS-RUN): found wherever its digits stand together, and in
     text a reader sees across one space, dot, slash, hyphen or dash that groups them (ruling 9,
     law 59). Word's own ids are not exempt: a row whose digits stand in one of Word's own
     values (`100000`, a theme's gradient stop) holds the file that carries it;
   - a number the safety-net pattern masks, in an attribute an add-in wrote on a body paragraph
     (`acme:tel="2125550147"`) or in its element's text (`<acme:tel>2125550147</acme:tel>`), in
     an attribute with no prefix on one of Word's own elements (`<w:p tel="2125550147">`), or
     under a prefix XML, XML Schema, XLink or Dublin Core does not define for it: holds the file
     (ruling 11, `attrNet`, `elemNet`, laws 61 and 66). A name as such an unprefixed
     attribute's name (`<w:p MargaretTan="1">`) holds it too (ruling 12);
   - a small-letter word after an address on a host Office's own addresses use, between the
     tags of a part the writer does not know (`http://purl.org/matters/whitfield`,
     `http://schemas.microsoft.com/office/whitfield`): holds the file (ruling 12, law 63); in an
     attribute it is kept, as a plain lower-case word is there (open, below);
   - a hand-built part whose XML declaration names another encoding (`encoding="Kestrel"`): held,
     or read as UTF-8 when it names an ASCII-compatible encoding and every byte of the part is
     plain ASCII, and a part written in UTF-16: held (law 62); a letter, a digit or an `@` Word
     draws with `w:sym` from a font other than Symbol or a picture font, and a digit it draws
     from Symbol: read with the words around it, and the writer holds on it (law 65). A letter
     from Symbol is not (open, below).

   Closed later on 2026-09-24 under owner rulings 17 to 19, each held by a docx-parts law
   (64, 68–83; the suite 399 checks passing) through `writeRedactedDocx` and, for most, the `.txt`,
   and those the text exports carry probed that day through `exportPlan` (the `.txt` and the
   clipboard copy) as well:
   - a link rewritten by Proofpoint's gateway that writes a byte that is no character where a
     name stands, for a row `René Tan`: v2 as `-E9`
     (`https://urldefense.proofpoint.com/v2/url?u=https-3A__dms.example.com_Ren-E9-20Tan_brief…`),
     v3 as `*E9` (`https://urldefense.com/v3/__https://dms.example.com/Ren*E9*20Tan/…`). The
     `.docx` already held the file on either; the `.txt` and the clipboard copy carried it
     under an export that reported itself verified, because `exportPlan` asked `pctHidden` only
     where the readable text held a `%`. `engine.ts` now asks the writer's own test,
     `hasEscape`, and both text exports are blocked on either link written on one line, as on
     `Ren%E9%20Tan` (docx-parts law 64 holds `hasEscape` on the v3 link; `protected-terms.mjs`
     runs the text export on it). Wrapped just before or inside that escape, neither they nor
     the `.docx` are held (open, below);
   - a Proofpoint link a mail program wrapped over a bare line break, in LF or CRLF (nothing
     written at the start of the next line), inside its address, its path, an escape (`-25` /
     `20`) or v3's `__;`, and every place of a link on `urldefense.us`: with an LF, the name in
     it shipped from the body and the `.txt` at 47 of 100 places a break can stand in a v2 link
     and 34 of 77 in a v3 one, under a verified plan; 38 and 25 of them are now masked (law
     79), and the 9 in each inside the name's own letters still ship (open, below), as does a
     link wrapped in a quoted reply or onto an indented line (open, below);
   - a tag (ruling 18): `#kestrelcapitaldeal` beside rows `Kestrel Capital` and `Kestrel`
     shipped where `@kestrelholdings` was masked; `#` now joins a token and starts one as `@`
     does (`JOINER`, `HANDLE`; `#kestrelholdings` reads `#[Company1]holdings`; the small `#`
     and `@` and the music sharp, `﹟`, `﹫` and `♯` (`symbolRead`), and the fullwidth `＃` and
     `＠` are each read as one, law 82; other look-alikes, `⌗` and `⋕`, are not, and
     `⌗kestrelcapitaldeal` ships from the `.docx` and the `.txt`, probed 2026-09-24). The
     cost the ruling accepts: a plain word a
     `#` starts is read as a tag, so `#supporters` reads `#sup[Person1]s` for a row `Porter`
     (law 68);
   - a designator spelled out (ruling 19a): `Hickson Corporation` for a row `Hickson Corp` went
     out as `[Company1]oration`; the word is now masked whole (`LONG_FORM`, `RefFind.long`,
     which `engine.ts` reads; law 69);
   - a row of digits grouped by an em dash, a minus sign, a tab, a middle dot, the bullet `•`
     or `∙`, a space that is one of Unicode's space separators, ` - ` or a closing bracket and a
     space (ruling 19, `DIGIT_SEP`; laws 70 and 81): masked in text a reader sees;
   - a ligature (`ﬃ`), a letter in a circle or a square, `&nbsp` without its semicolon, any
     name in HTML's table with its semicolon (`&hairsp;`, `htmlEntities.ts`) and a reference by
     number without its semicolon (`&#160`): read as what they write (laws 71, 72, 80, 82);
   - a run of capitals before a plural `s` (ruling 19e): `MRIs` was read as `MR` + `Is`, and a
     row `M.R.` was masked in it 14 times in one opinion here; `ISPs` now breaks only before its
     `s` (law 73);
   - in a part Word writes, a number the safety-net pattern masks standing as the whole text of
     an element under one of Office's own prefixes (`<w14:x>123456789</w14:x>`, ruling 19f), and
     a row of two to five digits that is the whole of a value an add-in wrote or of a value in a
     part the writer does not know (a five-digit matter number, ruling 19g): held (law 74). A
     drawing's position and size are not read for it (law 78). Office's own attributes are not
     read for either (open, below);
   - a space or a tab before a tracked deletion (W7F-1): the walker gave it to the deletion, so
     `Paid Margaret Tan` + a space + a deleted `within 30 days` + an inserted `promptly` read
     `Tanpromptly` in the text the review and the `.txt` are made from, and the `.txt` shipped
     the name under a verified plan while the `.docx`, written run by run, masked it; a symbol
     drawn with `w:sym` in a tracked deletion, or ending a text box's or a comment's paragraph,
     was read into the wrong flow or not at all (`Margaret Taan`). Both now read as Word shows
     them (laws 76 and 77).

   Open on 2026-09-24, each probed that day through the same calls and shipping an identifier
   under a gate of 0 leaks:
   - a name from the table or the always-redact list run into a plain word of letters in text
     a reader sees: `kestrelholdings` for a row `Kestrel`,
     `Margaret Tanand Harrow Leung` for `Margaret Tan`, `counsel foranna tan` for `Anna Tan`, in
     the `.docx` and the `.txt`, each verified. Owner ruling 8 chose this: a reader cannot tell
     `kestrelholdings` from `Porterfield` by any of its characters, and a mask read inside
     plain words told the model false things. The Export screen states it (`docxScope`);
   - a name letter-spaced in text a reader sees, as a letterhead taken out of a PDF can read
     (`P R O J E C T   L A N T E R N`), in the `.docx` and the `.txt`, each verified; the
     Export screen says the check does not read it. On the text export a no-break, thin or
     zero-width space, a soft hyphen, a tab and a line break between the words were each masked
     (2026-09-24);
   - a name with a hyphen inside one of its words (`Hold-ings`, as text copied from a PDF keeps
     a line's break) or written in letters each in brackets (`⒜`): shipped from the `.txt`
     under a verified plan and from the `.docx` (body, header, footnote) under a gate of 0
     leaks; the Export screen says the check does not read either;
   - a line break inside a name's own letters in a link a mail program wrapped (`Marg` /
     `aret-2520Tan`), and a link with no scheme or `www.` split inside an escape: read as
     written, in a link as in prose, and shipped from the `.txt` under a verified plan and from
     the `.docx` under a gate of 0 leaks (law 79 states the first as the remainder, 9 places a
     link). The Export screen states both;
   - a Proofpoint link wrapped in a quoted reply or onto an indented line (the next line starts
     `>`, `> `, `>> `, two spaces or a tab): no break is read across then, and the name in it
     shipped from the `.docx` under a gate of 0 leaks and from the `.txt` under a verified plan,
     LF and CRLF, at 72 of 100 places in a v2 link and 70 of 77 in a v3 one with `> ` (47 and
     34 with a bare `>`, as before law 79). The fragment check flags the name at each of those
     places in the `.txt` (probed 2026-09-25; it does not read the `.docx` body). The Export
     screen names this since 2026-09-25;
   - a Proofpoint link that writes a byte that is no character (`-E9`, `*E9`), wrapped just
     before that escape or inside the escape after it: neither held nor masked, at 3 places a
     link besides the 4 inside the name's letters (7 of 97 places in a v2 link and 7 of 85 in a
     v3 one in all), from the `.txt` and the copied text under a verified plan, LF and CRLF, and
     from the `.docx` (a line break in Word) under a gate of 0 leaks (probed at every place
     2026-09-25). The Export screen names this since 2026-09-25;
   - a row of digits grouped any other way than `DIGIT_SEP` reads: among those a line break (a
     mail program's wrap, a line break or a new paragraph in Word), a comma, an underscore, a
     colon, a semicolon, an apostrophe, a plus sign, two spaces, a line separator, a mark with a
     space on one side only (`3192- 6819`), an en dash, an em dash or a slash with a space
     either side (`3192 – 6819`), a closing bracket with no space after it, the fraction and
     division slashes (`⁄`, `∕`) and other bullets (`◦`, `‣`, `⁃`), which is not found; a name
     written with an HTML reference that is not read (`Ren&eacute Tan`, a name without its
     semicolon other than `&nbsp`; `&NBSP;`, a name HTML does not define): shipped from the `.txt` under
     a verified plan and from the `.docx` under a gate of 0 leaks (each in the body; the comma,
     colon, two-space and spaced-dash groupings and both references in a header and a footnote
     too). The
     Export screen's grouping sentence was rewritten on 2026-09-25; its dash clause, "any
     character Unicode counts as a dash", reaches further than the code, which does not read the
     superscript and subscript minus (`⁻`, `₋`). A reference by number with leading zeros
     (`Margaret&#00000032;Tan`) is read since 2026-09-25;
   - a letter Word draws with `w:sym` from the Symbol font inside a name (`M` + Symbol's `Α` +
     `RGARET TAN`, which Word draws as what reads `MARGARET TAN`): Symbol's letters are Greek,
     several of whose capitals look Latin, and `symText` (`docx.ts`) reads them as nothing, so
     the text exports carry nothing there, the writer's check does not find the name, and the
     `.docx` ships under a verified plan. Owner ruling 19 left it open this round; the Export
     screen states it since its rewrite late on 2026-09-24;
   - a table row shorter than six letters inside a code word that starts with a small letter,
     whole or run together (`lee`, `leefile`, `leeFile` for a row `Lee`), as the value of an
     attribute an add-in wrote on a body paragraph, or as a style's id and name or a font's name
     written all in lower case (`leeheading`, `leesans`): in such a code word a name counts only
     from six letters and digits (`RUN_FLOOR`). Written with its capital (`LeeHeading`,
     `LeeSans`, `leeHeading`) the style or font is renamed. The Export screen states the floor
     (`docxScope`), and `app/frontend/test/protected-terms.mjs` asserts the add-in case ships
     (as a five-letter row inside `kiranfile`);
   - a number the safety-net pattern masks in the body, written into an attribute under one of
     Office's own prefixes or with no prefix on an Office element other than Word's own text
     markup (`w:tel` or `w14:tel` on a paragraph, `tel` on a `v:shape`): the pattern does not
     read Office's own values, of which every file Word saves carries thousands that read to it
     as numbers (a z-index, a paragraph id). Owner ruling 19 left these attributes open this
     round and closed the same number as the whole text of such an element (above). The Export
     screen states it;
   - in a part the writer does not know, a name nobody declared, as an attribute value written
     all in lower case or run together lower-case first (`acme:client="whitfield"`,
     `acme:client="jonasWhitfield"`): a plain lower-case word, or such words run together, is
     kept there as code (`docxScope`). Written with a capital or a space (`Whitfield`,
     `jonas whitfield`) it holds the file. As the name of an element in one of Office's
     namespaces (`<w:JonasWhitfield/>`) it ships too: such a name is "kept whatever it says"
     (`docxScope`; asserted by `protected-terms.mjs`);
   - in a file built by hand, since Word writes none of these: a name from the table as the name
     of an element in Word's own namespace in a part the writer knows (`<w:MargaretTan/>` in the
     body). The attribute of that shape holds (above); the element was not changed, and the
     Export screen says names under Office's namespaces are not read;
   - a name written only inside an equation whose runs split it. The walker reads an
     equation's runs with a space between them (`docx.ts`, the `m:r` gap), so the engine is
     given "Marga ret Tan" and does not find it; without the space, a name written as two
     runs would read "MargaretTan" and be missed the other way. A name already in the table
     or on the always-redact list is masked there, split across plain runs or across a box,
     bar or accent (laws 26 and 45). A name found nowhere else is the reach of gap 1.

   False masks, in every export, from word breaks and the ending the rule keeps (each probed on
   2026-09-24). The largest: the plural, written with its capital, of a row that is also an
   ordinary word. `The United States` reads `The United [Org1]s` for a row `State` (511 times
   over the 99 opinions, counted 2026-09-24), `The Laws of Singapore` reads `The [Person1]s of
   Singapore` for a row `Law`, `Officers of the firm` reads `[Person1]s of the firm` for a row
   `Officer`, each under a verified export; the small-letter plural (`laws`, `officers`) is left
   as it is (`textHolds`). For a client whose surname is an ordinary word (Law, Price, Young),
   inside a fixed phrase the tag can be read back to the name, and the model is told a party is
   named where none is. A row found at a break inside a longer name: `McDonald` reads
   `Mc[Person1]` for a row `Donald`; where a run of capitals meets a small letter, `ISPs` was
   read as `IS` and `Ps` until ruling 19e (closed, above). An ending written in capitals:
   `IRAS`, another agency, reads `[Org1]S` for a row `IRA`, 30 times in the 21 real `.docx`
   files (`docxWrite.ts`, the comment on `textHolds`). A plain word a `#` starts is read as a
   tag (`#supporters` reads `#sup[Person1]s` for a row `Porter`; ruling 18's stated cost). With
   TAB's 12,805 names of people and organisations as a table over the 99 opinions of this
   repository, finds inside a plain word of letters went from 2,237 to 13 under ruling 8 (nine
   at a run of capitals, four at an ending in capitals), and from 13 to 5 under ruling 19 (one
   at a run of capitals, four at an ending in capitals; measured 2026-09-24 on `docxWrite.ts`
   before and after that ruling: 36 finds gone over the 99 opinions and 209 over the 21 real
   `.docx` files' text, none added); the plurals above are counted apart from those 5. None leaves the name as it was written; each changes what
   the model reads, and in a fixed phrase the plural can be read back to the name. The over-masks this list gave before ruling 8 (`Margaret Tan`
   inside `Margaret Tang` leaving `[Person1]g`, `Ong Wei Ming` inside `Wong Wei Ming`, `Porter`
   inside `supporter`) are closed (above).

   Not a leak, and not reachable from the app: `writeRedactedDocx` takes a
   `keepImages` option that the Export screen never passes (`Export.tsx`), so the app always
   removes pictures. For a caller that does keep them, a picture in SVG form is now copied
   without its processing instructions, its comments, its document type declaration or
   anything in its XML declaration but the version, encoding and standalone flag, and the
   receipt counts each; one that declares entities of its own holds the file, and the hold
   says how to replace it (laws 50 and 52). Until 2026-09-23 such a picture held the file as
   "a fault in the app".
   Closed the same day, and not leaks: a signed macro project's signatures are removed with
   it (law 32); a caption label, list or name already numbered `Label1`, `List1` or `Name1`
   keeps its number, and a renamed one takes the next (law 33); the bookmark note says only
   what the kept links do, and a link to a place in the document that is written out as text
   is counted (law 34); and a run marked `w:vanish w:val="off"`, which Word shows, is kept —
   it was removed as hidden text, so "The claimant does not consent to the order" shipped as
   "The claimant does consent to the order" (law 44).
3. Closed 2026-09-23 — bookmark names the rename did not reach (a declared term of digits
   alone, `Acct447122109983`; a name glued in one case, `KESTRELSPA`). Every bookmark the
   author made is now renamed `bm1`, `bm2` … in document order, a hidden one `_bm1` …,
   whatever it says; Word's own `_Toc`, `_Ref` and `_Hlk` bookmarks with their digits, and
   `_GoBack`, keep their names. Links, page references and contents entries follow the
   rename (`WORD_BOOKMARK`, `docxWrite.ts`; `docx-parts.mjs` law 13, which renames the
   names above and checks every reference resolves).
4. `docProps` values are surfaced in review as a COUNT only; the actual
   author/company/lastModifiedBy strings are never displayed and cannot be added to the table.
   The `.docx` export keeps only the created and modified dates, the language, the revision
   count and five Word-internal flags (`CORE_KEEP` and `APP_KEEP`,
   `docxWrite.ts`) and removes custom properties whole; the text exports carry none
   of them. The original on disk keeps
   all of them.
5. Read but not shown as rows: external relationship targets (mailto:, UNC paths), field
   codes (`w:instrText`) and `word/settings.xml` document variables are now read by the walker
   (`docx.ts`: `externalTargets`, `FIELD_TAGS`, `w:docVar`) and named on the Export screen as
   channels the text export does not carry. Never read: the rest of `word/settings.xml`
   (attachedTemplate firm path, mailMerge sources, rsids) and `docProps/thumbnail.*` (a
   rendered image of the unredacted first page; review counts it only among the parts "not
   scanned"). The `.docx` export removes link targets,
   drops attachedTemplate, the attached schemas, mailMerge, rsids and docVars
   (`SETTINGS_DROP`, `docxWrite.ts`) and the thumbnail, and its re-walk reads everything
   left in `settings.xml`. It removes identity fields (AUTHOR, FILENAME, INCLUDETEXT and the
   like), keeps page-number, table-of-contents, sequence and list-numbering fields live, and of
   the cross-references only the page, footnote and style ones (PAGEREF, NOTEREF, STYLEREF); a
   text cross-reference (REF, what Insert > Cross-reference makes for a heading or paragraph's
   text) is unlinked with the rest: the instruction goes and the displayed text stays as plain
   text, masked with its part, and will not update (`KEEP_FIELD` / `REMOVE_FIELD`,
   `docxWrite.ts`).
6. PDF: XMP packet (`dc:creator`, `xmpMM:History` with prior filenames/editors), Custom
   `/Info` keys, `/OpenAction` JavaScript, and the CONTENTS of embedded attachments.
   (`app/extract/pdf.mjs` header comment corrected 2026-07-25 — it claimed XMP was swept.)
   None of these enters the text export, which is the only export a PDF has; they stay in the
   original on disk, and the Export scope line says so.
7. Forensic finds are read-only rows: no "add this to the redaction table" affordance.

Closed (was gap 6 before the 2026-09-23 renumbering, "no test asserts the EXPORT
contract"): `app/extract/test.mjs` now runs the `.docx` writer over the fixture and asserts that no planted string survives in
the raw bytes of any output part, and `app/frontend/test/protected-terms.mjs` checks the
writer's output for declared terms, and since 2026-09-23 `app/frontend/test/docx-parts.mjs`
plants terms in every part and attribute the old gaps 2 and 3 named, and in each place of
gap 2 closed later that day. All three test with a mask that names the planted strings, so
none can catch gap 1. Of the places gap 2 lists as open on 2026-09-24, `protected-terms.mjs`
plants three and asserts that they ship, as limits the Export screen states (a five-letter row
in a lower-case code word in an add-in's attribute; a plain lower-case word, and one after a
`purl.org` address, in an attribute of a part the writer does not know; and a name in Word's
own namespace in such a part, 18t), and asserts that two places closed that day hold the file
(a telephone number in an add-in's attribute, and a lower-case word after a `purl.org` address
between the tags of such a part); none plants the others. `docx-parts.mjs` law 58 holds the
plain-word cases of ruling 8 (`kestrelholdings` left readable, `@kestrelholdings` masked), and
`app/frontend/test/copy-claims.mjs` law 9 holds every statement of the run-together floor in
this file, `README.md` and `BENCHMARK.md` to the rule `docxWrite.ts` keeps in text a reader
sees: never inside a plain word of letters. Since ruling 18, `docx-parts.mjs` law 68 holds a
`#` as law 58 holds an `@`, and asserts the cost the ruling accepts (`#supporters`); law 79
asserts that a line break inside a name's own letters in a link is read as written. None of
the 83 plants a name hyphenated inside a word or written in bracketed letters.

Also corrected 2026-07-25: the review pane claimed "headers, comments and properties
surface below". Headers do not surface. The claim now matches the code.
