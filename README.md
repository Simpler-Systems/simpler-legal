# Simpler Legal

**A local-first redaction engine for legal documents, and the measurement record behind it.**
Drop in an agreement, a judgment, a matter file — get back a copy with the identities replaced
by placeholders, plus a reviewable table of every span the engine touched and why. The blanked
copy is what you paste into a frontier model; the original and the key never leave the machine.

**Free for anyone to use.** Apache-2.0: a lawyer, a law firm, an in-house team or anyone else
may use it, change it and pass it on, commercially or not, at no cost ([`LICENSE`](LICENSE)).
It is made by Simpler Terminal Value Systems Pte Ltd in Singapore. Questions and support go to
`support@simpler.asia`; a security problem goes privately through GitHub
([`SECURITY.md`](SECURITY.md)).

Who it is for: the lawyer or in-house team that wants to put real paper in front of a cloud
model without handing over the people in it, and the reviewer who has to be able to check that
decision afterwards. The engine runs locally against a stock, hash-pinned Gemma E2B. Nothing in
this tree downloads the model: you fetch it yourself (step 1 below) and the app finds it on disk
by its hash. What does touch the network is explicit: the corpus, benchmark and audit builders
re-fetching public source documents from their archives. Redaction itself talks to 127.0.0.1
and nothing else: the app removes proxy settings from every process it starts, and an engine
service started by hand refuses to run when Node is told to send its calls through a proxy
(see "Running the app").

**Get it.** The Windows installer is on
[GitHub Releases](https://github.com/Simpler-Systems/simpler-legal/releases/latest). It is not
code-signed, so SmartScreen warns before it runs. The model is a separate 3.35 GB download that
you fetch yourself: step 1 of [Running the app](#running-the-app).

**The engine is frozen.** [`FREEZE.md`](FREEZE.md) is the version of record — the exact
per-genre configuration, the claims with their receipts, the honest status of the genre that
has *not* converged, and the named open shelf. The frozen argv has not changed since. One
opt-in doctrine was added after the freeze, `--profile firm` (2026-09-15): the app runs it only
when Settings → Redaction → These documents is set to "Our own matter files", never by
default, and the frozen profiles' output was measured byte-identical before and after that edit (`FREEZE.md`,
"Profiles added AFTER the freeze"; `app/frontend/src/lib/profile.ts`).

*simpler.legal — the legal vertical of the simpler family.*

## The claim, scoped exactly

**46 unseen EDGAR-shaped business documents across four consecutive fresh draws — rounds 5, 6, 7
and the post-freeze pure-OOS probe — with zero DIRECT identity leaks.** The draw before them,
round 4 — the first under the current gold and scorer — leaked 3 DIRECT spans in 1 of its 15
documents and is published as drawn. (Rounds 1–2 ran earlier under an older gold and scorer and
are not comparable; `ROUND5.md` shows them.) Three of the 46 carry no DIRECT gold span at all,
so 43 of them had an identity to leak and did not. Rounds 5–7 each ran the engine as it stood
at that round; of the 46, only the pure-OOS probe, one document, ran the frozen configuration
(`FREEZE.md`, Corrections C1). The frozen configuration has since met 20 scorable public
filings in a law firm's own shapes, checked against hand-listed identifiers rather than sealed
gold. No person on the hand list (individual parties and counsel included), no email and no
phone was left readable. 27 of its 296 identifiers were, in 14 of the 20: party companies'
names among them (in a caption, a `Re:` line, a settlement), a law firm's name, other
organisation and business names, docket and case numbers, an address fragment and money
amounts (table below; `OPS_LEDGER.md` 2026-09-14, finding 2, and 2026-09-15). Judges and
other public officials were not counted, and on papers routed as court judgments the engine
releases, by design, a name it reads as a judge's (LN2) or as counsel's on a counsel line
(`…, for the plaintiff`, LN3), and the name of a court or public body acting officially (LN1)
(`apply-ln.mjs`, run with `--ln 0,1,2,3` on that route).
Before those, it ran on 26 `.docx` files from gov.uk in the app's first real-document trial
(2026-09-13: 24 results, 2 refused); a survivor scan was run on the 24 and its result was not
recorded, so that run carries no leak figure (`OPS_LEDGER.md` 2026-09-13, step 3; `FREEZE.md`
C8).

The scope of that sentence, stated as [`BENCHMARK.md`](BENCHMARK.md) scopes it (container
audit, 2026-07-25): every DIRECT / QUASI / NO_MASK number in this repository is measured on
**plain text**. The benchmark's inputs are strings and the scored pipeline starts after a
document has already become one. So the claim reads exactly: **zero DIRECT identity leaks in the
redacted text, measured on text inputs.** On the same 46 documents 245 of 503 quasi-identifiers
(amounts, dates, places, organisations) stayed readable (`perDoc` rows of the four boards). It says nothing about container channels — a
`.docx`'s comments, tracked deletions, headers/footers or `docProps` author fields, or a PDF's
XMP, annotations and embedded files. No scorer here can catch those, because they never enter
the artefact being scored.

What answers container channels depends on which export you take. The clipboard copy and the
saved `.txt` **rebuild rather than overlay**: the payload is `remask(text, entities)` over the
body text — a new string written as plain text, and the original container is read once at
ingest and never re-emitted into them. The `.docx` export is a different mechanism. There
**is** a zip writer in this tree — `writeZip()` in `app/frontend/src/lib/extract/docxWrite.ts`,
reachable from a button on the Export screen — and it rewrites the original package rather than
building a new one. It removes tracked deletions (insertions are accepted), comments, hidden
text, images, embedded objects, macros, alt-text, external link targets, custom XML, the
thumbnail, and every document property except the created and modified dates, the language,
the revision count and five Word-internal flags. Since 2026-09-23 it also removes the list of
reviewers and every reviewer's name and initials, embedded fonts, building blocks (Quick Parts,
AutoText), the sensitivity-label record, which carries the firm's Microsoft 365 tenant ID, a
chart's print header and footer, a macro project's signatures, hyperlink and picture
relationships nothing uses, and every processing instruction but the XML declaration and
Office's own `<?mso-contentType?>` marker, and it writes each part's XML
declaration with only its version, encoding and standalone flag (`docxWrite.ts`, `MSO_MARKER`
and `DECL`). It gives shapes neutral names; renames every bookmark the author made `bm1`,
`bm2` … (Word's own `_Toc`, `_Ref`, `_Hlk` and `_GoBack` keep theirs), caption labels and list
names `Label1`, `List1` … (Word's own keep theirs, and a number the file already uses is
skipped), and chart sheet and range references `Sheet1`, `Name1` …, without reading them
first; renames a style, font, theme or colour name that carries something masked, a style's
other names included ("Redacted style N"), with every reference to it; and masks
list-numbering text, watermark text, a chart's trendline name and the text a number format
prints, in place. An equation is masked as Word draws it: what it prints in line with its
neighbours (a box, a bar, an accent, brackets) is read with them, and what it prints apart (a
subscript, a fraction's parts, a limit) stays apart; a name that hidden text or a removed field
splits is masked as the reviewed text reads it. It
**keeps** headers (with any watermark), footers, footnotes, endnotes, chart and SmartArt text,
and the engine reads that text in a request of its own after the body's (`lib/side.ts`). A name
it finds there that the body also carries joins the review table. A name it finds only there is
masked wherever the saved .docx carries it and is listed on the Review screen; the copied text
and the .txt are the body alone. If the body was read and that text was not, or its read could
not be used, the saved .docx is held with the reason (`sideHeld`). The file's safety then rests on a fail-closed re-walk
of the package it just wrote: every part of it — its name (also read with its percent-escapes
decoded), its element text, every attribute value, the names of its elements and attributes,
and the namespaces it declares or lists, save the addresses and names Office's file formats
define — is read for the names the mask places, and the text a reader sees, the attribute
values Word shows and every value of a part the writer does not know are read by the
safety-net pattern too; if anything still places, the bytes are dropped and the file is held
with the reason. A name from your table or always-redact list is looked
for with its words apart and also run together, in any case: where both its ends fall at a
word break, and, from six letters and digits (`RUN_FLOOR`), inside a longer word in the file's
code, save that in text a reader sees it is never read inside a plain word of letters (owner
ruling 8, 2026-09-24; `textHolds`). There it is masked where a word breaks at both its ends (a
space or a punctuation mark, letters meeting digits, a small letter meeting a capital), before
an `s` or `es` ending when its last word has three letters or more and is written with its
capital (`the Tans`), and, from six, inside a token that is not a word of prose: one with a
digit, `.`, `/`, `\`, `:`, `@`, `#` or `_` in it, or one an `@` or a `#` starts
(`www.kestrelcorp.com`, `porter2024`, `@kestrelholdings`, and since owner ruling 18 of
2026-09-24 `#kestrelholdings`, which is masked `#[Company1]holdings`; `JOINER` and `HANDLE`,
`docxWrite.ts`; docx-parts law 68). The cost ruling 18 accepts: a plain word a `#` starts is
read as a tag too, so `#supporters` reads `#sup[Person1]s` for a row `Porter` (probed
2026-09-24). A name written with the designator it ends in spelled out is masked whole with it
(`Hickson Corporation` for a row `Hickson Corp` reads `[Company1]`, not `[Company1]oration`;
ruling 19a, `LONG_FORM`, law 69). So `kestrelholdings` for a row `Kestrel` and `Margaret
Tanand` for a row `Margaret Tan` ship whole, from the `.docx` and from the `.txt` (probed
2026-09-24): a reader cannot tell `kestrelholdings` from `Porterfield` by any of its letters,
and a mask read inside plain words told the model false things (`Porter` masked inside
`supporter`). A row of six digits or more is found wherever its digits stand together, inside a
longer number, an IBAN or a reference, and in text a reader sees across one mark that groups
them: a space (one of Unicode's space separators) or a tab, a dot, the slash `/`, a hyphen or
dash of any kind, a minus sign, a middle dot, the bullet `•` or `∙`, ` - `, or a closing
bracket and a space (ruling 9, widened by ruling 19; `DIGIT_SEP`, laws 70 and 81). Grouped any
other way it is not found, in the `.txt` or by the writer, which reads the same
`DIGIT_SEP`, and both exports ship it under a verified plan and a gate of 0 leaks (probed
2026-09-24): among those a line break (a mail program's wrap, or a line break or a new
paragraph in Word, `3192` above `6819`), a comma, an underscore, a colon, a semicolon, an apostrophe, a plus sign,
two spaces, a line separator, a mark with a space on one side only (`3192- 6819`, `3192.
6819`), an en dash, an em dash or a slash with a space either side (`3192 – 6819`), a closing
bracket with no space after it (`(3192)6819`), the fraction and division slashes (`⁄`, `∕`) and
other bullets (`◦`, `‣`, `⁃`). Word's own ids are read for it like every other
value, so a row whose digits stand in one of Word's own values (`100000`, a theme's gradient
stop) holds the file that carries it. A percent-escape, an escape escaped again (`%2520`), a
`%u` escape, an HTML character reference (`&#32;`, `&nbsp;`) and the escapes in a link
Proofpoint rewrote are read as the characters they write (ruling 10): a name written with them
is masked in text a reader sees and holds the file in its code, and an escape that writes no
character where a name could stand holds the file. Since ruling 19 a character reference is
read by HTML's whole table of names with its semicolon (`htmlEntities.ts`), and by number,
of up to seven decimal or six hex digits after any leading zeros, as HTML reads it, with its
semicolon or without it (`&#00000032;` is a space, read since 2026-09-25); `&nbsp` is read without its
semicolon, no other name is (`Ren&eacute Tan` for a row `René Tan` ships, probed 2026-09-24),
and neither is a name HTML does not define (`&NBSP;`). A ligature (`ﬃ`) and a letter in a
circle or a square are read as the letters they write; a letter in brackets (`⒜`) is not (laws 71, 72, 80 and 82). A
part nothing can read as text, and that the writer does not know to remove, holds the file by
name, and an XML part the writer does not know is kept only when what it holds reads as code
— between its tags, in its attributes and in the names in its markup — and no number in it is
one the safety-net pattern masks in the body (`readOutput`, `docxWrite.ts`;
`app/frontend/test/docx-parts.mjs`, laws 1–83, 399 checks passing on 2026-09-24, each fix with
a control that fails without it). That is a re-check against the same mask, not an
impossibility, and it has the mask's reach: a person the engine did not find, in the body or in
the text outside it, and who is not on your always-redact list, is not masked, and the re-walk
passes.

It also has holes. The ones this file listed on 2026-09-23 were closed that day (the writer's
comments, `docxWrite.ts`; docx-parts laws 45–57), and each was reproduced on 2026-09-24 as
masked, renamed, removed or holding the file: a name split across an equation's box, bar or
accent; a Social Security number in a number format's currency section; a name in a
`<?mso-…?>` instruction, or as the name of an element or attribute; a name run together in a
header or a footer (`HarrowLeung`), or, from six letters and digits, run together lower-case
first or all in lower case in an attribute, a style's name or a font's name (`margaretTan`,
`kestrelholdings`); and, in an XML part the writer does not know, a name nobody declared run
together or as a path between its tags (`jonasWhitfield`, `clients/Whitfield_Crane`), save on
the hosts Office's own addresses use (below), and a number written without separators.
More were closed on 2026-09-24 under owner rulings 9 to 12 (docx-parts laws 59–67), and each
was probed that day as masked or holding the file: a name written with `%20`, `&nbsp;` or
`&#32;` between its words in text a reader sees (masked in the `.docx` and in the `.txt`), or
with an escape escaped again or a `%u` escape; an escape that writes no character where a name
could stand (held); a number the safety-net pattern masks in an attribute or the text of an
element an add-in wrote into a part Word writes (`acme:tel="2125550147"`,
`<acme:tel>2125550147</acme:tel>`), or in an attribute with no prefix on one of Word's own
elements (`<w:p tel="2125550147">`), and a name as such an attribute's name
(`<w:p MargaretTan="1">`), all held; a lower-case word after an address on a host Office's own
addresses use, between the tags of a part the writer does not know
(`http://purl.org/matters/whitfield`, `http://schemas.microsoft.com/office/whitfield`, held); a
part whose XML declaration names another encoding (read when it names US-ASCII, an ISO-8859
or a windows-125x encoding and every byte of it is plain ASCII, held otherwise) or that is
written in UTF-16 (held); a letter, a digit or an `@` Word draws with `w:sym` from a font
other than Symbol or a picture font, and a digit from Symbol (held); and a row of digits alone
inside a longer number, an IBAN or a matter reference (masked in text, held in code).
Later on 2026-09-24, under owner rulings 17 to 19, each held by a docx-parts law (64, 68–83) that
runs the `.docx` writer and, for most, the `.txt` too, and those the `.txt` carries probed that
day through the `.txt` and the copied text as well (`exportPlan`, `engine.ts`): a tag (`#kestrelholdings`, masked); a designator spelled out (`Hickson
Corporation`, masked whole); a number grouped by an em dash, a minus sign, a tab or ` - `
(masked); a ligature, `&nbsp` without its semicolon, `&hairsp;` and `&#160` (masked); a link
rewritten by Proofpoint's gateway that writes, where a name stands, a byte that is no character
— v2 `-E9` (`…_Ren-E9-20Tan_…`), v3 `*E9` (`…/Ren*E9*20Tan/…`), for a row `René Tan` — which
the `.docx` writer already held and which the `.txt` and the copied text carried under an
export that reported itself verified, because `engine.ts` asked after such an escape only
where a `%` was written: they are now held too (`hasEscape`, `engine.ts`; docx-parts law 64;
`protected-terms.mjs`); wrapped by a mail program, the name in such a link still ships from the
text exports and from the `.docx` at 7 of 97 places in a v2 link and 7 of 85 in a v3 one,
inside the name's letters or just before or inside the escape after it (open, below); a
Proofpoint link a mail program wrapped over a line, in LF or CRLF, with nothing
written at the start of the next line, inside its address, its path or an escape, and a link on
Proofpoint's `urldefense.us` host (masked; before, with an LF, the name in such a link shipped
from 47 of 100 places a break can stand in a v2 link and 34 of 77 in a v3 one; 38 and 25 of
those are now masked, and the 9 in each that fall inside the name's own letters still ship,
open below; law 79); a space or a tab before a tracked deletion, which
the text the review and the `.txt` are made from dropped, so `Paid Margaret Tan` + a deletion
+ `promptly` read `Tanpromptly` and the `.txt` shipped the name while the `.docx` masked it
(law 77); a symbol Word draws with `w:sym` inside a tracked deletion, or ending a text box's
paragraph or a comment's, which the text read into the wrong flow or not at all (`Margaret
Taan`; the `.docx` held on each, law 76); and, in a part Word writes, a number the safety-net pattern masks standing as the
whole text of an element under one of Office's own prefixes (`<w14:x>123456789</w14:x>`), and
a row of two to five digits that is the whole of a value an add-in wrote or of a value in a
part the writer does not know (held; law 74).
Open on 2026-09-24, each shipping an identifier under a gate of 0 leaks (probed that day):
- a name from your table or always-redact list run into a plain word of letters in text a
  reader sees (`kestrelholdings` for a row `Kestrel`, `Margaret Tanand Harrow Leung` for
  `Margaret Tan`, `counsel foranna tan` for `Anna Tan`), from the `.docx` and the `.txt`:
  owner ruling 8 chose this over masking inside ordinary words, and the Export screen says so;
- a line break inside the name's own letters in a link a mail program wrapped
  (`Marg` / `aret-2520Tan`), and a link with no `https://` or `www.` split inside an escape:
  the break is read as written there, in a link as in prose (law 79), from the `.docx` and
  the `.txt`;
- a Proofpoint link wrapped in a quoted reply or onto an indented line (the next line starts
  `>`, `> `, `>> `, two spaces or a tab): no break is read across then, and the name in it
  shipped from the `.docx` under a gate of 0 leaks and from the `.txt` under a verified plan at
  72 of 100 places in a v2 link and 70 of 77 in a v3 one with `> ` (47 and 34 with a bare
  `>`), LF and CRLF (probed 2026-09-24); the fragment check flags the name at each of those
  places in the `.txt` (probed 2026-09-25; it does not read the `.docx` body);
- a Proofpoint link that writes a byte that is no character (`-E9`, `*E9`), wrapped just
  before that escape or inside the escape after it: neither held nor masked, at 3 places a
  link besides the 4 inside the name's letters, from the `.txt` and the copied text under a
  verified plan (LF and CRLF) and from the `.docx` under a gate of 0 leaks (a line break in
  Word) (the text exports probed 2026-09-24, the `.docx` at every place 2026-09-25);
- a number of digits alone grouped any other way than `DIGIT_SEP` reads (above: a line break,
  a comma, an underscore, a colon, two spaces, a spaced en or em dash, a fraction slash, a
  bullet other than `•` and `∙`, among others), and a name written with an HTML reference HTML's
  table names only with its semicolon but written without it (`Ren&eacute Tan`) or not in
  HTML's table (`&NBSP;`), from the `.docx` and the `.txt`;
- a name letter-spaced in text a reader sees, as a letterhead taken out of a PDF can read
  (`P R O J E C T   L A N T E R N`), from the `.docx` and the `.txt`; the Export screen says the
  check does not read it;
- a name with a hyphen inside one of its words (`Hold-ings`, as text copied from a PDF keeps a
  line's break) or written in letters each in brackets (`⒜`), from the `.docx` and the `.txt`
  (probed 2026-09-24); the Export screen says the check does not read either;
- a letter Word draws with `w:sym` from the Symbol font, inside a name (`M` + Symbol's `Α` +
  `RGARET TAN`, which Word draws as what reads `MARGARET TAN`): Symbol's letters are Greek,
  several of whose capitals look Latin, and the walker reads them as nothing (`symText`,
  `docx.ts`), so the text exports carry nothing where it stands, the writer's check does not
  find the name, and the `.docx` ships it as Word draws it (owner ruling 19 left it open this
  round; the Export screen now states it);
- in a part Word writes: a number the safety-net pattern masks, in an attribute under one of
  Office's own prefixes or with no prefix on an Office element other than Word's own (`w:tel`
  or `w14:tel` on a paragraph, `tel` on a `v:shape`), because that pattern does not read
  Office's own values, of which every file Word saves carries thousands that read as numbers to
  it (`attrNet`; owner ruling 19 left Office's own attributes out this round, and closed the
  same number standing as the whole text of such an element, above); a name from your table
  shorter than six letters inside a code word that
  starts with a small letter, in an add-in's attribute (`lee`, `leefile`, `leeFile` for a row
  `Lee`) or as a style's id or name or a font's name written all in lower case (`leeheading`,
  `leesans`), where the capitalised forms (`LeeHeading`, `LeeSans`) are renamed; and a name
  from your table as the name of an element in Word's own namespace (`<w:MargaretTan/>`),
  which Word never writes. The Export screen states each of these limits;
- in an XML part the writer does not know, a name nobody declared, as an attribute value
  written all in lower case or run together lower-case first (`acme:client="whitfield"`,
  `acme:client="jonasWhitfield"`; written with a capital or a space, `Whitfield` or
  `jonas whitfield`, it holds the file), or as the name of an element in one of Office's
  namespaces (`<w:JonasWhitfield/>`). The Export screen states both.

The over-masks this file listed on 2026-09-23 are gone under ruling 8: a row `Tan` is no
longer masked inside `Tang`, `Ong Wei Ming` inside `Wong Wei Ming`, or `Porter` inside
`reporter` and `supporter`. Three kinds of false mask remain in text a reader sees, in every
export, from word breaks and the ending the rule keeps. The largest: the plural, written with
its capital, of a row that is also an ordinary word — `The United States` reads `The United
[Org1]s` for a row `State` (511 times over the 99 opinions), `The Laws of Singapore` reads `The
[Person1]s of Singapore` for a row `Law`, and `Officers of the firm` reads `[Person1]s of the
firm` for a row `Officer`, each under an export that reports itself verified (probed
2026-09-24); a small-letter plural (`laws`, `officers`) is left as it is. A surname that is an
ordinary word (Law, Price, Young) is the case to watch: inside a fixed phrase the tag can be
read back to the name, and the model is told a party is named where none is. Then a row found
at a break inside a longer name (`McDonald` reads `Mc[Person1]` for a row `Donald`); a run of
capitals before a plural `s` is read as one word since ruling 19 (`ISPs` is no longer read as
`IS` and `Ps`, and `MRIs` no longer masks a row `M.R.` inside it, which one opinion here did 14
times; law 73); and an ending written in capitals (`IRAS`, another agency, reads `[Org1]S`
for a row `IRA`, 30 times in the 21 real `.docx` files). A `#` that starts a plain word makes
a tag of it (`#supporters`, above). With TAB's 12,805 names of people and organisations as a
table over this repository's 99 opinions, 5 finds inside a plain word of letters remain, one at
a run of capitals and four at an ending written in capitals, down from 13 before ruling 19 and
2,237 before ruling 8 (`textHolds`; measured 2026-09-24 on the code before and after ruling 19,
36 finds gone and none added); the plurals are counted apart from those 5. All of these are
listed, with their evidence, in [`REDACTION_AUDIT.md`](REDACTION_AUDIT.md) gap 2. The Export
screen describes this writer and the text exports' checks in its own words; the receipt carries
the writer's own notes on what it removed, renamed and kept, word for word (`Export.tsx`,
`docxScope`). Read again on 2026-09-25, after round 7 landed, it names each limit this
paragraph found it silent or wrong on the day before: a quoted or indented line under a wrapped
link, a wrap just before or inside a `-E9` or `*E9` escape (where neither export is held), and
a line break among the groupings it does not read; and a reference by number with leading
zeros is now read. Its dash clause, "any character Unicode counts as a dash", reaches two
characters further than the code: the superscript and subscript minus (`⁻`, `₋`), which Unicode
counts as dashes, are not read (open). What it says the fragment check reads (`fragHow`) names
the plain `@` and `#` of a handle or a tag and the words it skips as too common; it does not
say the check also reads a piece before a plural `s` where the copy writes it with an
upper-case first letter, so the check flags more than it says (below).
The `.txt` and the `.docx` are not claimed to mask alike (owner ruling 13). They are made from
different text by different code: the `.txt` and the copied text are the body alone, masked by
the engine's plan (`exportPlan`, `engine.ts`), and the `.docx` is every part of the file,
masked run by run by the writer and re-walked (`docxWrite.ts`). Each item above says which
exports it was probed through, and until W7F-1 was fixed (law 77) the same body masked a name in
the `.docx` that the `.txt` shipped.
After the mask, the app also looks through the export for a piece of a name it masked or of a
term on your always-redact list — a surname alone (`Mr Tan replied.` beside a row `Margaret
Tan`), one part of a hyphenated or apostrophised name — and names each piece it finds on the
Export screen, and counts them in the receipt; it flags and never holds (`survivingFragments`,
`engine.ts`; owner ruling 21, 2026-09-24). It reads the copied text and the `.txt` and, once the `.docx` is
written, that file's other text parts (a header, a footer, a note, a chart, SmartArt), not the
`.docx` body and not its code; it reads a piece under four letters only where the row and the
export both write it with a capital, and never inside a plain word of letters save before a
plural `s` where the export writes the piece with its capital, as the mask reads an ending
(`the Kierkegaards` flags `Kierkegaard` and `two Tans` flags `Tan`; `Kierkegaardian` is not
flagged for a row `Søren Kierkegaard`, nor `the tan leather` or `two tans` for `Margaret Tan`;
probed 2026-09-24). Inside an address, a path, a handle or a tag it reads a piece from four
letters where the token has the plain `@` or `#`, and from six where it has a fullwidth, small
or look-alike sign (`＃`, `﹟`, `♯`, `＠`, `﹫`); behind `⌗` or `⋕` it reads none. So beside a
row `Anna Wong`, `#wongfamily` flags `wong` and `﹟wongfamily` is not flagged; beside a row
`Jane Porter`, `﹟porterfamily` flags `porter` and `⌗porterfamily` is not flagged. The mask
leaves all four: it does not mask one word of a two-word row alone, in a tag or in prose
(probed 2026-09-25; `RUN_FLOOR`, `docxWrite.ts`; the second pass of `survivingFragments` looks
only at a token with a digit or an ASCII sign). The Export screen says what it read, beside its
result, and does not name the plural or the sign. How often it flags
a piece that names no one, on a firm's own files, is not measured.
The honest costs: the text exports are text, not a formatted document; the `.docx` export
carries what is still open of gap 1 (a name outside the body the engine did not find, or
where no engine read the body) and the open holes of gap 2. Either way the original file still sits
on your disk carrying everything — which the Export screen states per document, naming the
channels that document actually has. Open gaps are ranked in
[`REDACTION_AUDIT.md`](REDACTION_AUDIT.md).

### The rest of the record, in one table

Every row traces to a committed board or directory, except the firm-paper row and the
family-court row, which rest on committed write-ups only. The full narrative is in
[`BENCHMARK.md`](BENCHMARK.md) and [`ROUND4.md`](ROUND4.md)–[`ROUND7.md`](ROUND7.md).

| What was measured | Result | Where it lives |
|---|---|---|
| EDGAR business paper, first contact with sealed gold, rounds 4→7 | 96.6 / 93% → **100 / 100%** three rounds running | `pii-bench/runs/ROUND{4..7}-edgar-firstcontact.json` |
| Post-freeze pure-OOS probe — one exhibit filed 2026-01-21, drawn and run after the freeze by a fixed rule committed together with its result | 100.0 / gate 100% (3 DIRECT spans, none readable), QUASI 47.1, NM 78.1 — the best NM of any EDGAR first-contact board, on one document | `PUREOOS-firstcontact.json`, `pii-bench/pureoos-manifest.json` — its `protocol` line still says "rule pre-registered" and "adversarially leak-hunted"; both are withdrawn (`FREEZE.md` C2) |
| The frozen configuration on a law firm's own shapes — 21 public court filings (briefs, complaints, settlements, a demand letter, engagement letters, declarations, letter motions, expert papers), 20 scorable, drawn after the freeze; one labeler's hand list of 296 identifiers, no sealed gold, not a walk-forward round | No person on the hand list (individual parties and counsel included), no email and no phone left readable. Identifiers left readable: 27 of 296 (45 of 1,444 occurrences), in **14 of 20** documents — party companies' names among them, a law firm's name, other organisation and business names, docket and case numbers, an address fragment, money amounts. Judges and other public officials were not counted, and the courts stages release by design a name read as a judge's or as counsel's on a counsel line, and a court's or public body's name. Reporter citations kept readable: 9 of 82 | `FREEZE.md` "Profiles added AFTER the freeze"; `OPS_LEDGER.md` 2026-09-14 and 2026-09-15 (the documents themselves are not in the tree) |
| Analytical utility — on round-4 paper masked by the pre-freeze engine, do an analyst reading the original and one reading the masked copy give the same substance? The judge is told which answer is which; questions whose answer is an identity are excluded | **0.968** (121/125 answers EQUIVALENT, 0 partial, 24/25 documents at 1.00) | `pii-bench/utility-bench/` |
| UK transfer probe — the courts pack as it stood before the round-6 and round-7 fixes, unchanged for the UK, on 10 UK judgments; not re-run under the frozen configuration | 100.0 / gate 100% | `UKPROBE-firstcontact.json` |
| Singapore family-court pseudonym axis — cited party codes must survive | 14/14 preserved and scored; recorded in the write-up only, because the Family Court gold is withheld (`WITHHELD.md` §3) | [`ROUND7.md`](ROUND7.md) |
| Courts, round 7 as drawn — **not** converged | 97.7 / gate 84%; 8 leaked spans (335 of 343 masked) in 5 classes, every one diagnosed to mechanism the same session — the two release-side breaks fixed and re-run on the same documents, three classes on the open shelf, one a contested gold label | [`ROUND7.md`](ROUND7.md), `FREEZE.md` shelf |
| The gold's own consistency — 240 QUASI and NO_MASK (mask-or-keep) calls from the development set's gold (120 courts, 120 business; DIRECT not sampled) re-judged blind by 8 agents | **88.8%** agree (213/240). 203 of the 240 are keep calls, so answering keep every time would agree on 84.6%. Measured before the gold revisions the round boards are scored under | `pii-bench/gold-ceiling/` (`node pii-bench/gold-ceiling/score-ceiling.mjs`) |
| Case-similarity retrieval spike (a separate lane; see below) | mean p@5 0.620, top-case 6/10 against ~0.10 chance | `out/eval.json` after `node pipeline.mjs eval` |

Two things that table deliberately does not say. It does not say the courts genre is solved —
courts DIRECT is not converged, each fresh draw surfaces one or two novel classes, and
`FREEZE.md` names every one of them. And it does not claim inference-proofing: the masked copy
preserves dates, amounts, places and business facts on purpose, because that is what you want
the cloud model to reason about, so a sufficiently distinctive profile can sometimes be
re-identified from preserved context alone. The claim is that identities are withheld, not that
inference is impossible.

## Running the app

Two modes. The **packaged app** is built from the sanitised distributable tree that
`tools/make-download-tree.mjs` assembles beside this repository (the app, the frozen engine's
serving half, a llama.cpp server build and a Node runtime — nothing of the lab: no corpus,
benchmark, gold or fetched judgments; its `NOTICE` is derived from its own contents by
`tools/derive-notice.mjs`, which fails when a line names a missing file or a third-party file
has no line). It installs per user and starts the frozen engine itself when it opens —
`node.exe`, `engine/` and `llama/` sit beside the app, and the shell spawns the frozen launcher
and `serve-legal.mjs`, each in its own kill-on-close Windows job object, so closing or crashing
the app takes both down (`app/src-tauri/src/engine.rs`). Before any document text leaves the
app it establishes who is listening, because a loopback port belongs to the machine, not to a
user: the engine service on 1436 must answer a fresh challenge keyed to a token made at launch,
on the same connection that then carries the document (`service_auth.rs`); the model port's
holder is read from Windows' TCP table — the app's own launcher is used, a server under your
own account only after the model file it reports matches the pin, another account's is
refused (`port_owner.rs`). That decides which process may be sent text; each connection that
carries text is then checked on its own. The frozen chain reaches the model only through a
relay inside the app, which writes nothing on a connection until Windows names the checked
process as the owner of its far end, and a run stops if that process changes or exits
(`relay.rs`, `model_watch.rs`); the app's own model calls take the same check. The relay also
reads whole, before passing it on, each answer to a call of the chain's allowed 300 tokens or
more (its extraction and residue calls): one cut off at the model's token limit, or ended any
other way than finished with text in it, stops the run, and so does any model call that gets
no answer at all. The frozen result for that document is then refused and the app's own core
reads it, which refuses the same answers (`relay.rs` header, owner ruling 15, 2026-09-24;
`FREEZE.md` C14), because the frozen chain reads a cut-off list as the whole list. How often a
live run trips on it is not measured. Since owner ruling 20 (2026-09-24) the relay decides
whether a document's frozen result may be used only after that run's calls have settled: it
waits up to one second (twice `HANG_UP_GRACE`) for a call still open, and a call open after
that refuses the result, because the chain gives up on a call at 45 seconds and writes the
document without it, and the verdict read at once had let that result through and stopped the
next document instead. Each document's run reaches the relay on a port of its own, so one
document's open call neither holds nor refuses another's (`relay.rs`, `RunGuard::finish`;
`engine.rs`, `strip_body`; `FREEZE.md` C15). The app then says the frozen pipeline's result for
that document was not used, never that the run stopped partway (`engine.rs`,
`incident_words`). The model
server the app starts is given a key made at each launch and its `/slots` page switched off,
through its environment because the launcher's argv is frozen; only the relay and the app's
own calls hold the key, so a web page open on the same computer can neither send the model
text nor read what it was last sent. The app checks on the running server that a request without the key is refused and that
`/slots` cannot be read without it, and says so in Settings if either check fails — while the
key is in force a `/slots` probe cannot tell "switched off" from "behind the key"; the change that added them was not run against a live
model server (`engine.rs`, `spawn_launcher` and `model_notes`). All of it is plain HTTP to
127.0.0.1, and a proxy setting cannot reroute it. The app's own calls use raw sockets, which
have no proxy setting. Every process it starts has `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`
and `NODE_USE_ENV_PROXY` removed and `--use-env-proxy` taken out of `NODE_OPTIONS`
(`engine.rs`, `scrub_proxy`), because with either switch set the bundled Node sends even
127.0.0.1 through the proxy, and `NO_PROXY=localhost` does not stop it (measured 2026-09-23,
Node v22.22.3). Evidence: `cargo test` in `app/src-tauri`
(`a_proxy_in_the_environment_carries_nothing_after_the_scrub`) and
`app/frontend/test/service-lifecycle.mjs` law 7. The installer for version 0.1.0 is offered at
[GitHub Releases](https://github.com/Simpler-Systems/simpler-legal/releases/latest). **It is not
code-signed**, so Windows SmartScreen warns before it runs ("Windows protected your PC"; More
info, then Run anyway). The 0.1.0 installer, `simpler.legal_0.1.0_x64-setup.exe`, is 39,909,063
bytes with SHA-256 `7c79cd9014f4d640f1067e88aaba892977e1f5735546c2ba63013aa49fa8e606`. The
`.sha256` file beside it on the release says the same, and
`certutil -hashfile simpler.legal_0.1.0_x64-setup.exe SHA256` prints the hash of your copy. A
match shows that the file is the one published here. It does not show who made it, because the
installer is not signed. To build it yourself, from a clone or from that tree, follow
[`BUILDING.md`](BUILDING.md). It has only ever been installed on the machine that built it — a
clean Windows profile has not been tested. The model is not in the installer: the app locates a local
copy by hash (step 1 below) and says so in Settings.

Settings → Redaction → **Practice** picks the second safety-net table that runs after the
frozen Singapore one (Singapore only; US: SSN, EIN, phone; UK: National Insurance number, NHS
number, mobile). The second table only adds masks to what the Singapore one leaves, and the
export receipt names the tables that ran. Switching practice swaps the second table, so it can
take away the previous one's masks: a document finished before the switch whose export that
exposes loses its finish and is held until it is reviewed again (`app/frontend/src/App.tsx`
`onPracticeChange`, `lib/attest.ts`).

The **dev/browser mode** is the part that can be independently checked, and runs from this
repository. Requires Node ≥ 20, a llama.cpp build, and the model.

1. **Get the model, and verify it by hash.** `gemma-4-E2B_q4_0-it.gguf` — stock Google QAT
   weights, 3,349,514,112 bytes, sha256
   `3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd`. Google publishes it on
   Hugging Face under Apache-2.0. Download it from this address, which names the file by its
   revision:

   <https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/69536a21d70340464240401ba38223d805f6a709/gemma-4-E2B_q4_0-it.gguf>

   Not from that repository's main branch: the file of the same name there is a later upload
   with a different sha256, which the app refuses ([`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
   has the record). Neither this repository nor the installer carries the file, and the app does
   not download it. Save it in `%APPDATA%\Simpler AI\models` or leave it in Downloads; both are
   searched. If it is already on the machine for
   another simpler vertical, the resolver will find it — see [`MODEL_DISCOVERY.md`](MODEL_DISCOVERY.md)
   for the bounded search order (there is no full-disk crawl; that is a brand law here).
   ```
   node locate-model.mjs --verify     # sha256 the best candidate against the pinned catalog
   ```
2. **Start the local model server** — port 49400, with the frozen serving flags:
   ```
   tools\launch-server.cmd            # Windows
   tools/launch-server.sh             # POSIX
   ```
   After `node tools\fetch-deps.mjs` ([`BUILDING.md`](BUILDING.md) step 3) the server is
   `llama-cuda\llama-server.exe`, which is not on PATH, and the launcher runs `llama-server`
   from PATH unless `SIMPLER_LLAMA_BIN` names another (`tools/launch-server.cmd:35`). From the
   repository root, before the launcher: `set "SIMPLER_LLAMA_BIN=%CD%\llama-cuda\llama-server.exe"`.
   The launcher does not choose a GPU. `llama-cuda\llama-server.exe --list-devices` lists the
   Vulkan devices; where `Vulkan0` is an integrated GPU, first `set GGML_VK_VISIBLE_DEVICES=<n>`
   with the discrete one's number. On the machine the numbers here were measured on, `Vulkan0`
   is an AMD Radeon 890M, and the launcher run without that variable exited 127
   (`OPS_LEDGER.md`, the launch miss of 2026-09-13); the packaged app makes the same pick itself
   (`engine.rs`, `vulkan_pick`).
   Started this way the server has no key, and llama.cpp serves `/slots` by default, where any
   web page open on the computer can read the last text the model was given. Set
   `LLAMA_ARG_ENDPOINT_SLOTS=0` in the shell before starting it (`engine.rs`, `model_notes`,
   which gives the same advice on screen when the packaged app finds `/slots` open).
3. **Start the engine adapter** — the frozen pipeline behind one localhost endpoint:
   ```
   node serve-legal.mjs --port 1436 --llama 49400
   ```
   It fails loud: if the model upstream is unhealthy it returns 503 *before* doing any work, and
   the app falls back to its in-webview core and says so on screen. The frozen configuration is
   never imitated without its model. It accepts a document only from a caller holding this
   launch's token, which it writes to `%LOCALAPPDATA%\Simpler AI\run\legal-service-1436.token`
   (`~/.config/simpler-ai/run/` elsewhere) and removes when it exits normally
   (`serve-legal.mjs` header). If `NODE_USE_ENV_PROXY`, or `--use-env-proxy` in `NODE_OPTIONS`,
   is set together with a proxy, it refuses to start and names the setting: its model calls,
   each carrying part of a document, would go through the proxy. Unset it, or add `127.0.0.1`
   to `NO_PROXY` (`serve-legal.mjs`, `proxyHazard`; `service-lifecycle.mjs` law 7).
4. **Start the app, handing it that token:**
   ```
   $env:VITE_SIMPLER_LEGAL_TOKEN = (Get-Content "$env:LOCALAPPDATA\Simpler AI\run\legal-service-1436.token")   # PowerShell
   export VITE_SIMPLER_LEGAL_TOKEN="$(cat ~/.config/simpler-ai/run/legal-service-1436.token)"               # POSIX
   cd app/frontend && npm install && npm run dev     # http://127.0.0.1:1435
   ```
   Without the token the page sends the service nothing, the in-app core does the work, and the
   page says why. A page in a plain browser cannot ask Windows who holds the model port, so in
   this mode the model server is used unchecked, and Settings says so (`lib/tauri.ts`).

Inside: drop a document (.txt, .md, .docx, .pdf; an email file, or a file whose text carries an
email's headers or encoded content such as base64, a quoted-printable body, two or more
plain letters or digits written as percent-escapes in one run, a `%` and two hex digits for
each (a lone `%20` between plain words is not one), or two or more letters of a script other
than Latin so escaped outside a link or a path, is held with the reason and the way through. A
link a mail gateway rewrote (Safe Links, Proofpoint, Barracuda) is judged by the link it
carries, on one line and printed across rows; Mimecast's carries only a code its own server
resolves, and nothing in it decodes. Printed across rows (never on one line in these runs),
some links are still held with nothing encoded in them, and that remainder is open. Each count
is one random draw of links and moves between draws (lane I's harnesses, re-run on 2026-09-24
against `detect.ts` as it stood before that day's last intake changes, below, three of which
— the carried link, the hash route and the value glued to a word — record that no print of an
ordinary link under any gateway was held that was not held before, and the other two only
what they left as it was: monospace prints and attachments keeping their reasons, and encoded
bodies held as before): a Zoom invitation with a pre-2022 passcode under a gateway,
in 385 to 727 of 3,000 prints over four draws; and, of 1,737 prints of each link over two or
three draws, a Zoom recording's share link in 145 to 146 unwrapped, 414 under Proofpoint v3
and 0 to 36 under Safe Links, a HubSpot tracked link in 69 unwrapped, 117 under Proofpoint v3
and 0 or 579 under Barracuda, a Microsoft sign-in link in 6 to 17 unwrapped and 33 under
Proofpoint v3, a Teams meeting link under Proofpoint v2 in 20 or 21, and 26 or fewer for each
of a few more (a Lexis, SharePoint or PACER link under Proofpoint v2, a NetDocuments or
`kad.arbitr.ru` link under Safe Links); over every link kind, 835 and 1,437 of 321,345 prints
in two full draws. Changed later on 2026-09-24, as `detect.ts` records each at its rule, with
what each leaves open: a link that carries another link with its scheme (`?url=https://…`),
printed across rows with the client's address in base64 in the carried link's path (1,822 of
3,990 prints passed; none now); a hash-routed app's link (`…/#/reset/…`), held at 983 of
2,660 prints, now at 2,654 (the 6 that still pass, carrying the address, are open); a value
glued to a word by `_` or `-` where the word has two-letter humps or a version (`userIdV1`)
or a small letter before capitals (`iOS`), 42 of 120 shapes passing, now none; a link printed
in a proportional font, which 433 of 1,020 prints held with the wrong reason (an
attachment's), now 24 (still held, with that reason); and a log exhibit's `key=value` lines
cut at a fixed column, held as a quoted-printable body at 480 and 231 of 840 prints, now 0
and 33 (the 33, whose values are all digits, are still held). The cost of reading a
value past its word is recorded there too: an id whose own word decodes to text by chance is
held as it would be standing alone, 21 in 100,000 `DOC-` ids of twenty capitals and digits
and 9 in 100,000 `req_` ids. Not every encoding is caught: ASCII85 passes unread, and so does a name
with plain letters escaped one at a time between readable ones, or with accented letters
escaped — `lib/extract/detect.ts`, its header, `percentHold` and its list of what is not
refused),
review the entity table before anything leaves, export the masked text. There is also a compare
lane (independent diff of two versions), a find lane (deterministic entity index across
processed documents), protected terms (your own lexicon — declare "Project Lantern" once and
every document read after that masks it, model or no model, in the text exports and in the
saved `.docx`, whose re-walk reads every part — except the places listed as open in
`REDACTION_AUDIT.md` gap 2, among them the term run into a plain word of letters (`Kestrel`
in `kestrelholdings`) or letter-spaced, which the `.docx` and the `.txt` both carry under a
verified export; a document read before you declared it is held at Export
while the term is still readable in it, with a button to mask it), and a related-cases map
backed by the retrieval lane below.

## Reproducing the numbers, in order

The order matters. The scorer reads original documents from `raw/`, and `raw/` is **not in this
repository** — the source documents are not ours to redistribute. Run the scorer before you
rebuild and you get a missing-directory error, not a number.

**Step 0 — make the scorer prove itself first.** No model, no corpus, a few seconds:

```
node score-pii.mjs selftest        # null / oracle / over-masker stand-ins, 8/8 verdicts
```

**Step 1 — rebuild the corpus.** Source documents are **not redistributed**; each builder
re-fetches them from their public URLs into `raw/` (gitignored) and writes its manifest:

```
node build-corpus.mjs              # FIRST: downloads the CAP F.3d volumes -> raw/f3d-*/
                                   #   and re-derives corpus/ + newcases/. The US legs of
                                   #   every round below read from those volumes.
node build-pii-bench.mjs           # TAB, from the pinned upstream commit  -> raw/tab/
node build-oos.mjs                 # the 100-doc out-of-sample set         -> raw/oos/
node build-round4.mjs              # the four walk-forward rounds          -> raw/round4/ .. raw/round7/
node build-round5.mjs
node build-round6.mjs
node build-round7.mjs
node build-ukprobe.mjs             # the UK transfer probe                 -> raw/ukprobe/
node build-pureoos.mjs             # the post-freeze n=1 probe             -> raw/pureoos/

node gold-offsets.mjs hydrate      # THEN: the gold. At HEAD it is offsets, not span text
                                   #   (the git history is not yet: "Data statement") --
                                   #   a redaction tool should not publish an index of the
                                   #   people it protects. This slices the spans back out of
                                   #   the corpus you just rebuilt, into raw/gold-hydrated/.
                                   #   Every command below resolves there automatically, and
                                   #   fails loudly naming this step if you skip it.
```

Two checks that the substitution costs nothing, both re-runnable — but only on a tree that still
holds the verbatim gold: `node gold-offsets.mjs verify`, which compares the hydrated gold against
the verbatim gold entity by entity, and `node gold-offsets-equiv.mjs`, which re-scores 14
configurations under both golds and diffs the full board JSON. The verbatim span text is not
published here, so in this tree every set skips and `verify` has nothing to compare against. The
79,052 entities at 0 mismatches is a receipt from the authoring machine, not a number a reader
can reproduce from what ships. What is *not* published, and the one number that consequently does
not fully reproduce, is set out in [`WITHHELD.md`](WITHHELD.md).

Be aware of what these scripts are: they re-run the **acquisition protocol**, not a replay of a
fixed URL list, and each one **rewrites its own manifest in place** as it draws. The court legs
enumerate deterministically from the CAP volumes and the eLitigation/Find Case Law id ranges,
but the EDGAR legs query SEC full-text search live, so a rebuild at a later date may not draw
the identical set. `git checkout pii-bench/` restores the pinned manifests.

**Step 2 — prove your rebuild is the corpus the boards were scored against.** Every manifest
carries a per-document `sha256_16` over the extracted text as scored:

```
node backfill-manifest-sha.mjs --check     # exits 3 on any drift or missing document
```

On the machine of record this reads `verified: 171 documents · missing: 0 · drift: 0` across
the round 4–7, ukprobe and pureoos manifests. If your rebuild does not match, it is a different
corpus and the boards do not apply to it — which is the whole point of the check.

**Step 3 — strip.** Either run the frozen chain (needs the model server from the app section
above; the exact per-genre argv is in [`FREEZE.md`](FREEZE.md)), or point the scorer at
whatever tool you want to measure. The scorer is engine-free: it consumes originals + a
directory of stripped outputs with the same filenames + the gold labels, and it is the only
thing in the tree that reads both sides.

**Step 4 — score.**

```
node score-pii.mjs --stripped <dir> --batch all --name recheck \
  --labels pii-bench/round7-gold-product \
  --docs raw/round7 \
  --manifest pii-bench/round7-manifest.json
```

DIRECT recall is fail-closed and gated (any document with ≥1 DIRECT leak is a failed export),
QUASI is reported and policy-thresholded, NO_MASK preservation is the over-masking check, and
gold spans that are not literally present in the original are counted as unmatchable and
reported rather than silently dropped. Swap `--labels/--docs/--manifest` for another round, and
know which gold you are scoring against. Every first-contact board was scored against gold
sealed before the engine saw that round's paper, but the committed gold for rounds 4, 5 and 6
is the gold as re-projected after contact: round 4 by P0f and P0g (`694b4c4`, `ca307d6`), round
5 by P0h (`692de46`), round 6 by P0i/P0j (`ae154ac`). Rescoring those rounds from what ships
therefore does not give their first-contact QUASI and NM columns, nor the courts DIRECT of
round 4 as drawn (P0f cut its courts DIRECT labels by 60 net, the courts' own pseudonyms —
`FREEZE.md` C7) or of round 6 (P0j cut one). The DIRECT label count of every
EDGAR document is the same at its seal and after every projection. Most projection moves
loosened the gold, quasi-identifier to keep-readable; P0i/P0j also moved two round-6 EDGAR
location labels the other way, keep-readable to quasi-identifier (`edgar-r6-14`,
`edgar-r6-15`), so masking them now scores as a quasi-identifier caught rather than as
over-masking. Round 7's gold, and the UK
and pure-OOS gold, were not changed after contact.

**The other lane.** Redaction is what gets a matter safely to a frontier model; case similarity
is what decides which matter to send. That second lane is deterministic, model-free, and runs
against the 99 public-domain opinions committed here (89 in `corpus/`, 10 held out in
`newcases/` as "a new matter lands on the desk"):

```
node pipeline.mjs index && node pipeline.mjs eval        # -> out/eval.json
node graph.mjs build                                     # -> out/graph.json, out/synergy.html
node sync-viewer.mjs                                     # build + copy into app/frontend/public/ (what the app serves)
node graph.mjs selftest                                  # 12/12, plus the facets guard
```

`eval` prints `mean p@5: 0.620   top-case accuracy: 6/10` against a ~0.10 chance baseline, with
zero tuning — the vocabulary-free TF-IDF layer only. `graph.mjs build` turns the same corpus
into a typed-edge web (direct citations, IDF-weighted shared authority, text similarity): 99
nodes, 307 edges, 100% coverage. Ground truth here is keyword topic labels, which is weaker
than lawyer-authored similarity pairs — treat those two numbers as a floor, not a claim.

## What ships, and what rebuilds

| Ships in the repository | Rebuilt on your machine |
|---|---|
| The engine and its rails (`lib-core/`, `lib-legal/`), the adapter (`serve-legal.mjs`), the frozen apply-chain scripts | The model weights: not rebuilt, downloaded by you from Google's Hugging Face repository (step 1 of "Running the app"), hash-pinned |
| The scorer (`score-pii.mjs`), the gold as offsets (`pii-bench/*-offsets/`), every published board (`pii-bench/runs/`) | The llama.cpp build |
| | The gold's span text (`gold-offsets.mjs hydrate` — see [`WITHHELD.md`](WITHHELD.md)) |
| Every corpus manifest — per-document public URL, word count and `sha256_16` | Every benchmark document (`raw/`, from those URLs) |
| The measurement record: `BENCHMARK.md`, `FREEZE.md`, `ROUND4–7.md`, `OPS_LEDGER.md`, `REDACTION_AUDIT.md` | `out/` (graph, eval, viewer) |
| The retrieval corpus itself — 89 + 10 public-domain F.3d opinions as text | The app bundle (`npm install && npm run dev`) |
| The app source (`app/frontend/`) and the public site (`site/`) | |

## The frozen engine, and what would unfreeze it

Frozen means no more walk-forward rounds. Doctrine changes only by committed-script projection
plus an owner ruling; the rails, sweeps, profiles and instruments in `FREEZE.md` are the version
of record. **Two things unfreeze it: a DIRECT leak in the frozen configuration on real paper, or
an owner order.** Nothing else — not a better idea, not a worse-looking QUASI column.

The shelf is open and named rather than quietly closed: a Singapore vehicle-plate rail, an
initials-with-suffix alias class, a bare foreign single-name residue, an unresolved
counsel-name doctrine question, a gold-scheme note about bare role references, and the courts
QUASI grind (39–44 on rounds 5–7 — compliance-profile territory, deferred by strategy, because
the export-to-AI profile's bar is utility and utility is measured at 0.968; the 88.8% gold
agreement it was set against is not a QUASI ceiling, `FREEZE.md` C6), and — the newest, and the
only one found on a law firm's own paper — the first-page caption block and the `Re:` line,
where 7 of the 11 identifiers the firm profile still leaves readable over 20 filings sit
(`OPS_LEDGER.md` 2026-09-15, "What still survives"; `FREEZE.md` shelf 6b and C9). All seven are in `FREEZE.md` with their evidence.

## Repo map

| what | where |
|---|---|
| The frozen configuration, the receipts, the shelf | [`FREEZE.md`](FREEZE.md) |
| Every measured number of record, with its rebuild path | [`BENCHMARK.md`](BENCHMARK.md) |
| The walk-forward rounds, and every leaked span named and diagnosed | [`ROUND4.md`](ROUND4.md) · [`ROUND5.md`](ROUND5.md) · [`ROUND6.md`](ROUND6.md) · [`ROUND7.md`](ROUND7.md) |
| The engine adapter — the frozen chain behind one localhost endpoint | `serve-legal.mjs` |
| Vendored red v1 core (byte-identical) + the legal rails | `lib-core/` · `lib-legal/` |
| The scorer, and the boards it produced | `score-pii.mjs` · `pii-bench/runs/` |
| Gold labels, manifests, the gold-ceiling and utility benchmarks | `pii-bench/` (protocol in [`pii-bench/README.md`](pii-bench/README.md)) |
| Container-channel gaps, ranked and open | [`REDACTION_AUDIT.md`](REDACTION_AUDIT.md) |
| Infrastructure misses with measured rates | [`OPS_LEDGER.md`](OPS_LEDGER.md) |
| Case similarity + the typed-edge synergy graph | `pipeline.mjs` · `graph.mjs` |
| The desktop app source | `app/frontend/` |
| Building the installer from a clone | [`BUILDING.md`](BUILDING.md) |
| Security reports; where the app connects and what it keeps | [`SECURITY.md`](SECURITY.md) · [`PRIVACY.md`](PRIVACY.md) |
| Third-party licence texts, and what is known of the terms of the Microsoft files that come with none | [`licenses/`](licenses/) · [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) |
| Where a small local model may and may not sit in this vertical | [`MODEL_TUNING.md`](MODEL_TUNING.md) · [`ENGINE_PREP.md`](ENGINE_PREP.md) |

## Data statement

Which sources ship here as text, which as annotations, and which as URLs only. The table is
true of the tree at HEAD. It is not yet true of the git history, which is set out below the
table.

| Source | Terms | What is in this repository |
|---|---|---|
| Caselaw Access Project (F.3d opinions) | public domain | **Text.** 89 `corpus/` + 10 `newcases/` opinions, truncated at ~16k chars, per-document provenance in `sources.json` and each file's header. The full-length opinions used in the benchmark rounds are **URLs only** (volume zip + CAP id in the manifests). |
| TAB — Text Anonymization Benchmark (Norsk Regnesentral) | MIT | **Annotations and statistics only** (`pii-bench/tab-stats.json`, document ids). The corpus is re-downloaded from the pinned upstream commit `558e09e`. |
| SEC EDGAR exhibits | US government public records | **URLs only** (per-document exhibit URL + `sha256_16` in the round manifests). Text re-fetches. |
| Singapore judgments (eLitigation) | public portal, **not redistributable** | **URLs and our own annotations only**, and no annotations for the Family Court set ([`WITHHELD.md`](WITHHELD.md) §3) — owner ruling, matching simpler-red. `.gitignore` carries belt-and-braces patterns for stray `sg-*` files. |
| UK judgments (National Archives, Find Case Law) | Open Justice Licence | **URLs only**, in `pii-bench/ukprobe-manifest.json`. Text re-fetches. |
| Our gold labels for the OOS, round, probe and utility corpora | ours — covered by this repository's Apache-2.0 licence | **Annotations only** — spans as character offsets, categories and identifier types, no source text. |
| Gemma 4 E2B weights | Apache-2.0 (Google's model card; [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)) | **Not here at all.** Hash-pinned, located at runtime, never a repo asset. |

**The git history.** This repository starts at v0.1.0, with one commit. Its files are the
development tree's as they stood on 2026-09-25, except five working notes that `.gitattributes`
marks `export-ignore`: the coding assistant's instructions file (`CLAUDE.md`) and four session
notes and checklists of July 2026. A record here that cites one of them cites a file that is
not published. The history before that commit is not
published, because it holds what the table above says is not published:
- the gold as span text, from before the gold became offsets, including 80 Family Court
  annotation files and the annotations of 25 Singapore judgments;
- Family Court text outside the gold: in run boards, in earlier versions of two pages and of a
  round write-up, and in four commit messages;
- the name `WITHHELD.md` §3 withholds, in twelve files and three commit messages.

`FREEZE.md` C10 to C13 count each of these. The commit hashes and the two tags that
`FREEZE.md`, `BENCHMARK.md` and the other records cite, `v1-legal-frozen` and
`v1-legal-FROZEN-v12` among them, name commits of that unpublished history. The records
themselves are here, and so are the engine's files as they stand at this commit. Before the push,
`FREEZE.md` C12's six checks and C13's five were run over this repository, and each printed
nothing. C13's list holds the Family Court DIRECT spans of eight characters or more. Shorter
spans are not in it.

## Contact

Simpler Terminal Value Systems Pte Ltd, Singapore. `support@simpler.asia` reaches the
maintainer. A security problem goes through GitHub's private report first, as
[`SECURITY.md`](SECURITY.md) says, not in a public issue.

## Licence

**Code: Apache-2.0** — © 2026 Simpler Terminal Value Systems Pte Ltd (Singapore). Anyone may
use, change and redistribute it under those terms, commercially or not. See
[`LICENSE`](LICENSE) and
[`NOTICE`](NOTICE). Third-party data and model terms are enumerated in `NOTICE` and in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md); the third-party licences are not ours to
relicense, and the non-redistributable sources above are the reason `raw/` is gitignored rather
than committed. The installer carries more than a clone: llama.cpp (with the web page its
server carries), the LLVM OpenMP runtime beside it, Node.js, the Visual C++ runtime, the Rust
crates and the Microsoft WebView2 loader linked into the app, the npm packages its window is
bundled from, and the parts of the setup program itself. [`licenses/`](licenses/), which the
installer copies into a `licenses` folder beside the app, holds their licence texts, and for
the three Microsoft runtime files that come with no licence text, a note of where each comes
from and what Microsoft says about redistributing them (`licenses/msvc-runtime.txt`);
[`licenses/README.md`](licenses/README.md) gives the source and sha256 of each file.
`node tools/derive-notice.mjs` fails when one of them is missing, differs from its recorded
sha256, or was generated from a different lockfile or for a different `llama-server.exe`.
`bundle.licenseFile` in `app/src-tauri/tauri.conf.json` names
`app/src-tauri/installer-licence.txt` as the installer's licence page: `LICENSE`, Apache-2.0,
byte for byte, followed by a section with the terms Microsoft requires users to accept for the
three Visual C++ runtime files in the llama folder. There is no separate end-user licence for
this product's own code. `node tools/derive-notice.mjs` also fails when that page does not
begin with `LICENSE`'s exact bytes, or when its section names a file that is not in the llama
folder or leaves one of the three out.

## Security and privacy

Report a security problem privately, through the repository's Security tab:
<https://github.com/Simpler-Systems/simpler-legal/security/advisories/new>. Not in a public issue,
and never with a client's document attached. If you cannot use GitHub, write to
`support@simpler.asia`. [`SECURITY.md`](SECURITY.md) says what is in scope. [`PRIVACY.md`](PRIVACY.md) says where the app connects, what it keeps on disk and for
how long, and what uninstalling removes.

## Contributing

What is welcome: **a reproducing document or a failing scorer case**, made from a public or
invented document and never from a client's. A miss found that way is
worth more than any feature here — it is exactly the input the walk-forward protocol was built
to eat, and it is one of the two things that can unfreeze the engine. If what you have found is
a *leak* in the privacy sense — a way unredacted content or the entity key can escape — please
report it privately as [`SECURITY.md`](SECURITY.md) says, rather than in a public issue, and do
not attach the document. The same goes for a miss you can only show with a client's text:
report it privately and describe the kind of name or number and how it was written.

Feature requests and integrations will generally be closed with thanks. This vertical is
deliberately narrow, and it is measured; widening it costs measurement.
