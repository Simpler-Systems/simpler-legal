// PROTECTED TERMS — the user-declared lexicon, pinned against the export path.
// Run from app/frontend:   node test/protected-terms.mjs
//
// This file exists because app/frontend has no test runner and the laws below are
// invisible in review: the first two are one word inside an object literal, and all three
// fail SILENTLY in the bytes rather than loudly on screen. It follows test/floor-tables.mjs and bundles
// src/lib/engine.ts with esbuild (a vite dependency, already installed), then drives the
// REAL remask() the app exports rather than a copy of its logic.
//
// The three laws, and what each one costs when it breaks:
//
//   1. A row MINTED from a declared term must not carry 'PERSON' or 'COMPANY'.
//      lib-core's propagateProperPrefixes expands a 3+ proper-token span of those two
//      classes into its leading two tokens, so a declared "Project Lantern Phase Two"
//      would also mask a bare "Project Lantern" the user never typed. That contradicts
//      the Settings card, which promises the term is matched exactly, as whole words.
//      Cost: over-masking, and a false promise on screen.
//
//   2. A row the ENGINE classified must KEEP the engine's class when the user also
//      declares it. Stamping the protected class over a COMPANY or PERSON row DELETES
//      the two-token prefix placement that ships today, so adding a term to the
//      always-redact list would mask LESS than not adding it.
//      Cost: a recall regression on the export path, in the unsafe direction, caused by
//      a privacy feature. This is the one that fails the repo's fail-closed rule.
//
//   3. A declared term the BODY does not contain gets NO row in the entity table — and the
//      saved .docx masks it anyway, in the parts outside the body. The table means "found in
//      this document's body"; every screen reads it that way. The letterhead, where a firm's
//      own name most often lives, is reached by lib/engine.ts docxMaskTable at the one export
//      path that has such parts. Until 2026-09-23 nothing reached it: the header shipped
//      readable and the writer's output leak gate passed clean, because it re-walks with the
//      same table. A one-day fix put a ×0 row in the table instead, and an adversarial pass
//      measured that it silenced two "nothing is marked" warnings, defeated the "nothing
//      kept" release gate, and printed a declared term — with a firm-wide list, possibly
//      another client's codename — into the receipt that travels with the copy.
//      Cost if broken: the always-redact list silently not redacting, behind a green gate;
//      or, the other way, the entity table lying to every screen that reads it.
//
// The laws after those three came from one adversarial pass over the letterhead redesign
// (2026-09-23), each a leak or a false statement it reproduced before the fix:
//
//   4. A declared term matches the way a lawyer reads it: curly or straight apostrophe, any
//      dash, composed or decomposed accents, zero-width and soft-hyphen characters inside it,
//      CJK letters (a ruby reading) glued to it, full-width forms. Cost if broken: the firm's
//      name readable in the letterhead under a green gate.
//   5. "The same term" is one question with one answer (termKey): a no-break space in the
//      table's row must not make the list's term a different one.
//   6. A term declared AFTER the document was read is held, not shipped: the text exports
//      carried it readable while the .docx masked it and the receipt said the text "never
//      contains" it. A row the lawyer left readable holds too when it was not under
//      Protected terms at the time: that decision was made without the list in view. One
//      left readable under Protected terms governs.
//   7. The .docx writer masks or removes what the walker does not read (watermark, table
//      alt-text, shape names, text-box descriptions, bookmark names and the links to them),
//      and the key and receipt list what the writer WROTE, not what a search guessed.
//   8. The writer and its gate mask FOLDED text, as the engine reads it.
//   9. The code the saved files are named by is random: a hash of the redacted text was an
//      oracle for the text the .docx removes.
//  10. The Export screen's own wiring: one read of the list, hooks above the early returns,
//      the sentences that name the list, and no mask or list check of its own (it calls
//      exportPlan) — pinned on the source.
//
// The laws after those came from the second adversarial pass (2026-09-23):
//
//  11. A declared term masks the same whether it was declared before or after the drop.
//      A term the ENGINE had also found was taken as covered, and its row kept the engine's
//      strict match: the straight-apostrophe reply in the body, the letterhead's
//      non-breaking hyphen, a ruby reading glued on, a soft hyphen — each shipped readable
//      in the .txt or the .docx header, with verification green.
//  12. A bookmark name with nothing between its words ("ProjectKestrel", "KestrelSPA",
//      "Kestrel2") is read in its words, by the writer that renames it and by the gate.
//  13. The Export screen itself, rendered (react-dom/server over the real component): every
//      release gate and hold reaches the buttons and the page. Law 10's source pins alone
//      stayed green with the late-term hold or the letterhead table removed from the screen.
//
// The laws after those came from the third adversarial pass (2026-09-23), each a leak or a
// false statement it reproduced against the fixes above:
//
//  14. A declared term the safety-net pattern also catches is masked in every form. Its only
//      row was the floor's, which nothing places: the footer's non-breaking-hyphen form of a
//      declared number shipped readable, and the hold's button upgraded the floor row in place,
//      which masked nothing new — the page stayed held press after press, and then stayed held
//      with the term taken off the list.
//  15. A row left readable before its term was on the list is a decision about the body. With
//      the body's every occurrence inside a longer kept name nothing is held, and the .docx
//      took that row as governing its other parts: the letterhead, the watermark and a
//      "KestrelSPA" bookmark shipped the declared term readable under a green gate.
//  16. The receipt names no row it says is masked. It printed "masked anyway by the
//      safety-net pattern: Kestrel" — a name the copy withheld, in the file that travels with
//      the copy, put down to a pattern that had not touched it.
//  17. A bookmark name is read the way people write a name in one: "BlackRockCapitalSPA",
//      "OBrien_Kessler_SPA", "HarrowLeungSPA", "KPMGreport" each shipped the declared term.
//      Only a name the table places is looked for, and only from where a word starts to
//      where one ends: "Standard" does not carry "Tan".
//  18. The Export screen, run: its effect (the .docx dry run) lands and its buttons are
//      pressed, through a hooks runtime of this file's own. Rendered once with no effects,
//      law 13 could not tell a .docx button that ignored every hold, a hold button that
//      masked nothing, or a copy button that copied the original.
//
// Laws 6 and 13 also carry checks from that pass: a live row beside one left readable before
// the list is held as the choice the button undoes, and the "no row" hold does not claim the
// list changed (a row widened in the review has no row either).
//
// The laws after those came from the fourth pass (2026-09-23):
//
//  19. A row left readable under Protected terms governs whatever safety-net row the table
//      gains beside it. The floor row counted in the question, so the choice stopped
//      counting: the page was held on the form the pattern does not match, and "Mask it in
//      every form" changed nothing, press after press.
//  20. The export's survivors are asked with each row's own match. A protected row the export
//      still carries through a zero-width space passed the engine's footprint as masked.
//
// Laws 13, 14 and 18 carry checks from that pass too: a document whose finish came off says
// what changed and not that it was never reviewed (13); a declared number the safety-net
// pattern catches has one tag in the .txt, the .docx body and its footer — it was [phone] in
// one and [Protected2] in the others (14); a receipt written while the page is held does not
// say the held term is in no text export, and no receipt names a row, a term or a piece of
// one — it printed the names left visible and the partial names beside words that said what
// each one was (18).
//
// The laws after those came from the fifth pass (2026-09-23):
//
//  21. A tag the export wrote is not a word in it. A declared "Phone", "Card" or "Date" was
//      read in the "[phone]", "[card]" and "[Date]" the mask put there: the page was held on a
//      term with no readable occurrence, its button changed nothing press after press, and the
//      page counted "Card" as a listed span still present and a partial name.
//  22. The original and the export are read with one match. A CJK term glued to a Latin one
//      was refused in the original (no row, nothing placed) and read in the export once a tag
//      stood before it — held for good; a zero-width space where the space was in a declared
//      number shipped it readable with no hold, because neither match read it.
//  23. One declared number, one tag. Beside a safety-net row, the .docx gave a declared number
//      a [ProtectedN] of the list's own whenever any row of it was left readable: [nric] in the
//      .txt, [Protected3] in the .docx body and footer, and a note that the .docx went past a
//      choice the .txt had gone past too. Where the pattern's match is wider than the term
//      ("+65 6123 4567", an address holding a declared domain) the .docx body kept "+65" or
//      "j.doe@" readable where the .txt masked the whole.
//
// Laws 18, 19 and 20 carry checks from that pass too: the receipt's boilerplate, verification
// and file lines, and the file's own name, are read for names (18g); the note that the .docx
// went past a choice is not shown for a number the .txt masks too, nor on a held page (18h);
// the reopened page's button opens the review (18i); a row left readable under Protected terms
// governs only while every row of the term is left readable (19); law 20's setup moved off a
// CJK edge, which law 22 now places.
//
// The laws after those came from the sixth pass (2026-09-23):
//
//  24. A kept row's words are masked wherever the row places. Where two kept names meet, the
//      longer row's tag covers its span and the shorter row's uncovered remainder keeps the
//      shorter row's tag — one text in the .txt, the Review preview, the clipboards and every
//      part of the .docx. The shorter row's whole match was dropped: "Wei Ling" of "Tan Wei
//      Ling" shipped readable under a green verification.
//  25. A declared term glued to a number the safety-net pattern takes places where the
//      pattern cuts the number off it. "Call Tan61234567" was held on "Tan" and its button
//      minted a row that placed nothing, press after press. The page offers a button only
//      where pressing it clears the hold, and a term still held after its press gets, in the
//      button's place, what the lawyer can do instead — never the same button again (18k).
//  26. Declaring a term never masks less. A claim inside a wider safety-net match yields to
//      the whole match, under the pattern's tag: "kestrelcapital" declared before the drop
//      gave "j.doe@[Protected2].com" where not declaring it gave "[email]". A match the lawyer
//      left readable keeps the claim, and the choice survives the table's next sync.
//  27. "Left readable" is asked of what a reader of the copy can read, not of the bytes:
//      "Phone" beside the [phone] tag counted as a name left readable.
//
// Laws 18, 20 and 23 carry checks from that pass too: a listed term readable only inside a
// name left readable is held with that reason, and the page says what the press will do to
// the name before it happens (18l); the name key lists the rows left readable, in both files,
// and the receipt still names none (18m); law 20's survivor, now placed by law 25, is run on
// the engine without the cut, and law 23b's CONTROL on the engine without the whole-match rule.
//
// The laws after those came from the seventh pass (2026-09-23):
//
//  28. A kept name glued to a number the safety-net pattern takes places where the pattern cuts
//      the number off it. "Wei Ling Tan98765432" shipped "Tan" under a green verification.
//  29. A listed term readable IN PART is held as one readable whole is, and marked "(in part)".
//      "Tan Wei Ling" listed over a kept "Mrs Margaret Tan" shipped "Wei Ling" with no hold.
//  30. What masks a row left readable is named by what contains what, by the rows' whole
//      matches: never by a placement's text ("the same name") or by length ("a shorter name
//      inside" of two names that only share a word).
//  31. A remainder's tag covers letters and digits, never the punctuation at its edge.
//  32. A declared term that straddles a safety-net match masks every word not declaring it masks.
//  33. A shorter row's remainder keeps its own tag before the longer claim as after it.
//
// Laws 18 and 28 carry checks from the eighth pass (2026-09-23). 28b: a safety-net match that
// reaches INTO a name, not only one that ends at it — an address run into "Anna Tan" took its
// "Anna" and shipped "[email] Tan" on every path under a green verification; a glued edge
// strictly inside a stretch the pattern masks now places the name, kept or declared. 18m: a
// listed term left readable IN PART keeps its list mark in both keys and on the page, and the
// receipt counts it "(in part)". 18u: the writer's notes print word for word, and no note on a
// kept part the writer does not know says the check read all of it while the part carries the
// client's name.
//
// The ninth pass (2026-09-23):
//
//  34. A kept or declared name run together — "KestrelCapital", "kestrelcapital.com", "the
//      Biondos", "Anna Tan12", "Kestrel東京" — is masked under its row's tag on the .txt, the
//      Review preview (and its highlight) and every part of the .docx alike, verified; each
//      shipped in the text exports under a green verification while the .docx writer masked it.
//      A form the lawyer left readable as a row of its own is a wall the rule does not cross.
//      Since the rule an engine row reads every form law 4 lists, so a CONTROL that shows a row
//      on its own match (laws 4, 7, 8, 11, 12, 18, 20, 25, 28) runs on the engine without it
//      (NO_RUN, NR), and the other-form hold is met where a safety-net row answers for the term.
//  18t, said again from the writer as it stands: the check reads the markup too; a name run
//      together is masked in text a reader sees and holds the file in the file's own code, from
//      the floor of six the receipt states (owner ruling 1); each limit the sentence gives is
//      asserted of the writer; the round-4 wording, whole and a limit at a time, is the CONTROL.
//
// The tenth pass (2026-09-23):
//
//  35. A declared term the body writes only run together ("www.kestrelcapital.com",
//      "KestrelCapital-Escrow", "the Biondos", "AnnaTan12") gets a row, and listed after the drop
//      it holds the page, "(in part)" beside a shorter kept row. It had no row and no hold: the
//      text exports carried it while the .docx masked it.
//  36. A kept name run together behind a shorter claim of its own words — its two-word prefix, a
//      shorter kept row — is masked whole on every path ("Mr [Person1]12", "the [Person1]s"), and
//      verification reads the original the same way. The prefix's claim walled the run-together
//      rule off the rest, and "Tan12" shipped green. "Ford Motor Company" is not read into.
//  37. A declared term under the run-together floor, run into an address, is placed by its own
//      glued edge ("Li Wuli.wu@…"): nothing else places it, so that line is pinned apart.
//  38. The note on a doctrine that did not run names a failed run as one, not as an engine
//      never reached, and a cut run's refused result as one, not as a run stopped partway.
//
// The eleventh pass (2026-09-24):
//
//  39. A kept name run past a shorter row the lawyer left readable ("Ms Anna Tan12" beside a
//      left-readable "Anna") is masked on every path, verified, and a declared one listed after
//      the drop holds the page. Every place a row left readable stood was a wall to the
//      run-together reading, so the .txt, the clipboards and the Review preview carried the name
//      under a green verification while the .docx masked it, and the receipt said the .txt did
//      not carry a listed term it carried. A find is now dropped only where it lies wholly inside
//      such a place. The law also pins that containment in the reading of the original (runOpen)
//      and in placement's second pass, the filter that keeps a window's edge from reading a kept
//      "Ong" in "Wong", and the three letters of slack each window carries.
//  40. The engine reads a name inside other characters as the .docx writer does under owner
//      rulings 8, 9 and 10 (2026-09-24), one text on every path, each case with a CONTROL: a
//      client number of six digits or more inside an IBAN, a wire reference and a DMS number
//      is masked, and listed after the drop it holds the page; a row is not read inside a
//      plain word of letters ("Margaret Tang", "Wong Wei Ming", "supporter") and is read before
//      the closed endings ("the Smiths") and inside a token that is not a word of prose; a
//      client's name written with %20 in a pasted SharePoint link is masked as written, and
//      listed after the drop it holds. The Compare clipboard is compare-refusal.mjs's law 21.
//  41. A row left readable hides only its OWN name, each case with a CONTROL: a name the lawyer
//      kept, declared or listed late inside a web address or a firm name left readable
//      ("www.kestrelcapital.com") is masked on every path, or holds; a row left readable that
//      is the late term run together ("KestrelCapital") holds as left visible and the press
//      revives it. A kept name run into an address, a handle or a file name behind a shorter
//      kept row ("kestrel-capitalgroup.com", "@weilingtanlaw") is read through the claim as
//      the writer reads it, and listed late it holds; "Margaret Tanner" is not read into (nor,
//      still, "Ford Motor Company", law 36). A percent-escape that writes no character where a kept
//      name could stand holds the page and says so ("Ren%E9%20Tan"); listed late, it holds
//      with no button. The Compare clipboard is compare-refusal.mjs's law 22.
//  42. The fragment check reads what a reader reads (owner ruling 21, 2026-09-24), each case
//      with a CONTROL: a piece of a listed name glued to a digit or a superscript on a letter's
//      side ("Kierkegaard12", "Kierkegaard¹", "the 2024Kierkegaard memo", "KIERKEGAARD01") or
//      written with escapes ("q=Dr.%20Kierkegaard", a Proofpoint link, "S%C3%B8ren") is
//      counted, and named as the copy writes it; a piece inside a longer word ("supporter",
//      "Porterfield") and a plural or short piece in small letters ("the porters", "the tan
//      leather") are not. The Export page and its receipt are 18z; the Compare clipboard is
//      compare-refusal.mjs's law 23.
//  43. A name run into a token longer than any window runsThrough once stopped at (256
//      characters) is read through the claim as in a short one, on every path, with a CONTROL
//      (P13-SNAP); and 500 claims inside one token are read in a few walks of it, counted in
//      steps, where each claim once walked it end to end (F7-SNAP).
//  44. The second pass's cases (SECOND: owner ruling 18's "#", and 19a–e) are one text on the
//      .txt, the Review preview and the saved .docx body, header and footer, verified, with no
//      fragment counted; listed after the drop and written only that way, each holds the page on
//      its term. Each CONTROL is the ruling as it was, in the copy of docxWrite.ts the engine
//      bundles; 19a's has a second in the engine's own reading ("[Company1]oration").
//  45. The fragment check's second pass (owner ruling 21): a piece split at a hyphen or an
//      apostrophe, folded, hidden by an invisible character or a character reference, run into
//      a domain, handle, hashtag, file name, camel case or kana, under a Proofpoint v3 gateway,
//      with a superscript letter glued on, or of three letters and capitalised, is counted and
//      named as the copy writes it; the export is read as written beside its escapes decoded; a
//      word of an always-redact term with no row is counted. CONTROL: the first pass put back.
//  Law 18 carries the pages of the pass: 18v, a .docx the dry run held is not offered for saving
//  and the reason shows before any press, and a dry run that throws says the writer's error;
//  18w, the late-listed and the declared term of law 39 on the Export page, its copy and its
//  receipt; 18x, the receipt's line on a list row the .docx masks in a spelling the lawyer left
//  readable under Protected terms; 18y, the page's sentence on a percent-escape; 18z, the
//  fragment check's ⚠ and receipt line (law 42), asked of the .docx header and footer and of
//  the always-redact list's terms; 18za, law 44's cases on the Export clipboard and name key.
//
// Law 24's CONTROL is now two: verification reads every place a kept row stands in the original
// as well as the export's words, so the overlap rule as it was holds the page, and only with
// that reading also taken back does it ship green. Law 18 carries the pages of the pass (18o–18t):
// the overlap wording and the key's "in part" rows; the partly hold; a hold inside a number or an
// address; every hold kind after a press that leaves it in place (18k pinned one label of one);
// the term both alone and inside a name; and what the receipt and the page say the check of the
// written .docx reads, each limit asserted of the writer first. 18m pins the .json key's flag.
//
// Law 2 was a live defect on 2026-09-16, measured at 290 of 498 candidate spans across 80
// of the 99 corpus documents before it was caught. simpler-red hit the same trap and pins
// it at test/protected.test.mjs case 2; its lib/protected.mjs:174 carries the same law.
//
// Every claim prints PASS or FAIL. Each law is followed by a CONTROL that re-creates the
// broken version and asserts the check would actually catch it, so a green run means the
// assertions have teeth rather than that they never fire. Exit 1 on any FAIL.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const dir = mkdtempSync(join(tmpdir(), 'protected-terms-'));
const bundle = join(dir, 'engine.mjs');
await build({ entryPoints: [join(here, '..', 'src', 'lib', 'engine.ts')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' });

// the engine bundle touches window/localStorage on import (tauri.ts inTauri, the settings)
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const {
  remask, protectedEntities, withProtectedTerms, docxMaskTable, channelWritten, lateTerms, listHolds, termKey,
  protectedRegex, protectedMatches, rowSurvives, spanMatches, exportCode, exportPlan,
  syncFloorRows, isFloorRow, occurrencesOutside, survivingFragments, spanSurvives, docxMaskNames,
} = await import('file:///' + bundle.replace(/\\/g, '/'));
const core = await import('file:///' + join(here, '..', '..', '..', 'lib-core', 'anonymize.mjs').replace(/\\/g, '/'));
const writerBundle = join(dir, 'docxWrite.mjs');
const walkerBundle = join(dir, 'docx.mjs');
await build({ entryPoints: [join(here, '..', 'src', 'lib', 'extract', 'docxWrite.ts')], bundle: true, platform: 'node', format: 'esm', outfile: writerBundle, logLevel: 'silent' });
await build({ entryPoints: [join(here, '..', 'src', 'lib', 'extract', 'docx.ts')], bundle: true, platform: 'node', format: 'esm', outfile: walkerBundle, logLevel: 'silent' });
const { writeZip, writeRedactedDocx, RUN_FLOOR } = await import('file:///' + writerBundle.replace(/\\/g, '/'));
const { extractDocx, flowText, inMainFlow, readZip } = await import('file:///' + walkerBundle.replace(/\\/g, '/'));
// the Review screen's preview is attest.ts exportOf (Review.tsx), bundled as the app has it
const attestBundle = join(dir, 'attest.mjs');
await build({ entryPoints: [join(here, '..', 'src', 'lib', 'attest.ts')], bundle: true, platform: 'node', format: 'esm', outfile: attestBundle, logLevel: 'silent' });
const { exportOf } = await import('file:///' + attestBundle.replace(/\\/g, '/'));

/** A source file of the app with [from, to] pairs applied, bundled apart, for a CONTROL that
 *  re-creates a rule as it was. Throws when a line is no longer in the source, so a CONTROL can
 *  never pass by testing nothing. `plugins`: the bundle's own (the Export screen's hooks runtime). */
let mutants = 0;
async function mutantOf(entry, pairs, plugins = [], stdin = null) {
  const file = join(dir, `mutant-${++mutants}.mjs`);
  const target = entry.replace(/\\/g, '/').split('/').pop();
  const mutant = { name: 'mutant', setup(b) {
    b.onLoad({ filter: new RegExp(`[\\\\/]${target.replace('.', '\\.')}$`) }, (a) => {
      let s = readFileSync(a.path, 'utf8');
      for (const [from, to] of pairs) {
        if (!s.includes(from)) throw new Error(`protected-terms: a CONTROL's line is no longer in ${target}: ${from}`);
        s = s.replace(from, to);
      }
      return { contents: s, loader: target.endsWith('.tsx') ? 'tsx' : 'ts' };
    });
  } };
  await build({
    ...(stdin ? { stdin } : { entryPoints: [entry] }),
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', outfile: file, logLevel: 'silent', plugins: [mutant, ...plugins],
  });
  return import('file:///' + file.replace(/\\/g, '/'));
}
const engineWith = (pairs) => mutantOf(join(here, '..', 'src', 'lib', 'engine.ts'), pairs);
// the engine as it was, one rule at a time (laws 20, 23 and 24–27)
const OLD_OVERLAP = [['if (!over.length) { claimed.push({ s, e, tag: row.tag }); continue; }', 'if (!over.length) { claimed.push({ s, e, tag: row.tag }); continue; } continue;']];
const NO_CUT = [['row.tol ? protectedSpans(text, row.span, cuts)', 'row.tol ? protectedSpans(text, row.span)']];
const NO_WHOLE_MATCH = [['  if (floor.length) {\n    for (const c of all) {', '  if (false) {\n    for (const c of all) {']];
const NO_OPEN_MATCH = [['if (open.length) r = {', 'if (false) r = {']];
const STILL_IN_BYTES = [['const stillIn = discarded.filter((e) => rowSurvives(readable, e));', 'const stillIn = discarded.filter((e) => rowSurvives(red, e));']];
// the seventh pass (laws 28–33): each rule as it was
const WHOLE_ONLY_VERIFY = [['rowSurvives(readable, e) || (!isFloorRow(e) && runHit.has(e.text)) || (!rm.divergence && !isFloorRow(e) && rowSpans(text, e, cuts).some(([s, t]) => coverage(text, s, t, cut).open))', 'rowSurvives(readable, e)']];
const ENGINE_NO_CUT = [['found = row.tol ? protectedSpans(text, row.span, cuts) : footprintSpans(text, row.span, cuts);', 'found = row.tol ? protectedSpans(text, row.span, cuts) : footprintSpans(text, row.span);']];
// the eighth pass: a glued edge taken only where the pattern's match ends at it (law 28b)
const EDGE_CUT_ONLY = [['const freed = (c: FloorCuts, i: number) => c.has(i) || c.inside(i);', 'const freed = (c: FloorCuts, i: number) => c.has(i);']];
// the tenth pass (law 35): a declared term read as words alone — no row minted for a term the
// body writes only run together, and no hold on one the export carries that way
const LIST_WORDS_ONLY = [
  ['const runs = runAt(text, terms.map((t) => t.trim()));', 'const runs = new Map<string, Array<[number, number]>>();'],
  ['const runRead = byNameOf(runReadings(exported, wantNames, left, true, leftUnderList));', 'const runRead = new Map<string, Array<[number, number]>>();'],
  ['const runBare = o ? byNameOf(runsThrough(', 'const runBare = false ? byNameOf(runsThrough('],
];
// the ninth pass (law 34): the engine without the run-together rule — no name placed where it
// stands run together, and a verification that never asks for one; and the list's half of it
// (LIST_WORDS_ONLY), which came with the tenth pass, so the rule is out everywhere it reads
const NO_RUN = [
  ['const names = runNames([...bySpan.keys()]);', 'const names: RefName[] = [];'],
  ['(!isFloorRow(e) && runHit.has(e.text)) || ', ''],
  ...LIST_WORDS_ONLY,
];
// the tenth pass (law 36): a row read run together only where its claims left the text — no
// second reading through a claim, and no verification of one over the original
const NO_THROUGH = [['    const through = runsThrough(text, names, ', '    const through: RefFind[] = [] || runsThrough(text, names, ']];
const NO_RUN_OPEN = [['  if (!rm.divergence) for (const t of runOpen(', '  if (false) for (const t of runOpen(']];
const HOLDS_READABLE_ONLY = [['const holds = listHolds(readable, entities, terms, { text, rm, practice });', 'const holds = listHolds(readable, entities, terms);']];
const BY_PLACEMENT_TEXT = [['const claims: Claim[] = rm.claims ?? rm.placements.map(', 'const claims: Claim[] = rm.placements.map(']];
const SPACING_TRIM = [['const NAME_CHAR = /^[\\p{L}\\p{N}\\p{M}]/u;\nconst NAME_CHAR_END = /[\\p{L}\\p{N}\\p{M}]$/u;', 'const NAME_CHAR = /^[^\\s\\u00ad\\u200b-\\u200d\\u2060\\ufeff]/u;\nconst NAME_CHAR_END = /[^\\s\\u00ad\\u200b-\\u200d\\u2060\\ufeff]$/u;']];
const NO_STRADDLE = [['const cross = floor.filter((h) => h.s < c.e && h.e > c.s && !(c.s <= h.s && h.e <= c.e));', 'const cross: typeof floor = [];']];
const BY_LENGTH = [['      if (a <= s && end <= b) add(by.within, c.row);\n      else if (s <= a && b <= end) add(by.part, c.row);\n      else add(by.overlap, c.row);', '      if (c.row.length >= end - s) add(by.within, c.row);\n      else add(by.part, c.row);']];
const REST_OTHER_TAG = [['if (c.s > p) rest(p, c.s, row.tag, row.row, [s, e]);', 'if (c.s > p) rest(p, c.s, c.tag, row.row, [s, e]);']];
// the eleventh pass (laws 34 and 39): a find inside a place a row the lawyer left readable
// stands, taken back from each reading — placements (both passes), the export's words, the
// original — and the walls those places were until 2026-09-24
const NO_LEFT_PLACE = [
  ["const finds = refFind(blank, names, 'text').map((f) => (f.long ? { s: f.s, e: f.long, name: f.name } : f)).filter((f) => !inDead(f)).sort(", "const finds = refFind(blank, names, 'text').map((f) => (f.long ? { s: f.s, e: f.long, name: f.name } : f)).sort("],
  ['(f) => coverage(text, f.s, f.e, held).open && !inDead(f));', '(f) => coverage(text, f.s, f.e, held).open);'],
];
const NO_LEFT_READ = [['const dz = left.flatMap((d) => placesOf(d, readableAt(r, d), governs(d)));', 'const dz: LeftPlace[] = [];']];
const NO_LEFT_OPEN = [['(f) => coverage(text, f.s, f.e, cut).open && !inLeft(dz, f, own.get(f.name) ?? [])).map(', '(f) => coverage(text, f.s, f.e, cut).open).map(']];
const LEFT_AS_WALLS = [
  ['const blank = walled(text, walls);', 'const blank = walled(text, [...walls, ...deadAt]);'],
  ['    const through = runsThrough(text, names, held,', '    const through = runsThrough(walled(text, [...deadAt]), names, held,'],
  // the export's words read with no place governing went out unfiltered; as walls, every place
  // walled them (listHolds reads with leftUnderList, so there only the list's rows govern)
  ['  if (!dz.some((p) => p[2])) return refFind(r, names, \'text\', false, map);\n', ''],
  ['  return refFind(r, names, \'text\', false, true).filter((f) => !inLeft(dz, f, own.get(f.name) ?? []));', '  return refFind(walled(r, [...dz]), names, \'text\', false, map);'],
  ['  return new Set(runsThrough(text, names, cut,', '  return new Set(runsThrough(walled(text, [...dz]), names, cut,'],
  ['const runBare = o ? byNameOf(runsThrough(o.text, runNames(want), cut,', 'const runBare = o ? byNameOf(runsThrough(walled(o.text, [...leftAt]), runNames(want), cut,'],
];
// the receipt's line on the list's rows the saved .docx masks, as it was: every one of them
// "none of it is readable in the copied text or the .txt", with nothing read off the export (18x)
const NO_BODY_READABLE = [['const bodyReadable = channel.length ? lateTerms(readable, [], channel.map((e) => e.text)) : [];', 'const bodyReadable: string[] = [];']];
// law 41: a place a row the lawyer left readable, as it was — any find wholly inside it dropped,
// whatever name it is, and every such row counted by the hold, the list's or not
const OLD_CONTAINMENT = [
  ['  return at.some(([a, b, c]) => a <= f.s && f.e <= b && names.includes(c));', '  return at.some(([a, b]) => a <= f.s && f.e <= b);'],
  ["  const c = governs ? refCompact(d.text).c : '';", '  const c = refCompact(d.text).c;'],
];
// law 40: the writer's reading as it was before owner rulings 8, 9 and 10 (2026-09-24), in the
// copy of docxWrite.ts the engine bundles — a row of digits alone read inside no token, a row
// from RUN_FLOOR read anywhere inside a word of prose, a percent-escape read as written
const DIGITS_NOT_LOOSE = [["const loose = (n: RefName) => n.c.length >= RUN_FLOOR && (/\\p{L}/u.test(n.c) || /^\\p{N}+$/u.test(n.c));", "const loose = (n: RefName) => n.c.length >= RUN_FLOOR && /\\p{L}/u.test(n.c);"]];
const INSIDE_PROSE = [
  ['  if (!k.cuts.has(at) && !(loose && k.np[at])) return false;', '  if (!k.cuts.has(at) && !loose) return false;'],
  ['  if (k.cuts.has(e) || (loose && k.np[e - 1])) return true;', '  if (k.cuts.has(e) || loose) return true;'],
];
const PCT_AS_WRITTEN = [["const runs = f.includes('%') ? pctRuns(f) : [];", 'const runs: never[] = [];']];
// and the two readings ruling 8 keeps, taken out: inside a token that is not a word of prose,
// and before the closed ending s
const NP_AS_PROSE = [
  ['  if (!k.cuts.has(at) && !(loose && k.np[at])) return false;', '  if (!k.cuts.has(at)) return false;'],
  ['  if (k.cuts.has(e) || (loose && k.np[e - 1])) return true;', '  if (k.cuts.has(e)) return true;'],
];
const NO_ENDING_S = [['    if (c.charCodeAt(e) === 115 /* s */ && k.cuts.has(e + 1)) return true;\n', '']];
// and ruling 9's floor of six digits taken down to five, for a name and for a row of digits
const FIVE_DIGITS = [['export const RUN_FLOOR = 6;', 'export const RUN_FLOOR = 5;'], ['(/\\p{L}/u.test(n.c) || n.c.length >= 6));', '(/\\p{L}/u.test(n.c) || n.c.length >= 5));']];
const INSIDE_ANYWHERE = [['const allInside = at.every((x) => holds(wr, x).length) && bare.every((x) => holds(wo, x).length);', 'const allInside = at.some((x) => holds(wr, x).length) || bare.some((x) => holds(wo, x).length);']];
// the fragment check as it was (18z, laws 42 and 45): the body of survivingFragments put back in
// place of the live one, which stays in the file under another name so it bundles as it stands.
// At the round's start, each word of four letters or more of a kept row, read at the
// footprint's edges of the export as written (spanSurvives); in ruling 21's first pass, the same
// words read letter-bounded over the export and its escapes decoded (fragmentRegex, viewsOf).
const FRAG_SIG = "export function survivingFragments(exported: string, kept: ReadonlyArray<Pick<Entity, 'text'>>, terms: readonly string[] = []): string[] {";
const fragWas = (pass) => [[FRAG_SIG, [
  FRAG_SIG,
  '  const found = new Set<string>();',
  ...(pass === 'first' ? ['  const views = viewsOf(exported);'] : []),
  '  for (const e of kept) for (const tok of e.text.split(/\\s+/)) {',
  "    const t = tok.replace(/[^\\p{L}\\p{N}]/gu, '');",
  '    if (t.length < 4 || FRAGMENT_STOP.has(t.toLowerCase())) continue;',
  pass === 'first' ? '    const re = fragmentRegex(t);\n    if (views.some((v) => re.test(v))) found.add(t);' : '    if (spanSurvives(exported, t)) found.add(t);',
  '  }',
  '  return [...found];',
  '}',
  "function survivingFragmentsNow(exported: string, kept: ReadonlyArray<Pick<Entity, 'text'>>, terms: readonly string[] = []): string[] {",
].join('\n')]];
const FRAG_ROUND_START = fragWas('start');
const FRAG_FIRST_PASS = fragWas('first');
// runsThrough's windows not taken out to the spaces either side (laws 39, 41, 43): a window is
// opened, and a merged one widened, where its count of letters runs out
const NO_SNAP_PAIRS = [
  ['    wins.push({ a: snapBack(w, lo), b: snapOn(w, hi), i0: i, i1: i + 1 });', '    wins.push({ a: lo, b: hi, i0: i, i1: i + 1 });'],
  ['if (hi > last.b) last.b = snapOn(w, hi);', 'if (hi > last.b) last.b = hi;'],
];
// a short form written long masked short, as before owner ruling 19a, in the engine's two
// readings of a name run together (placements' first pass, runsThrough): law 36, law 44
const SHORT_AS_WAS = [
  [".map((f) => (f.long ? { s: f.s, e: f.long, name: f.name } : f))", ''],
  ['const g = { s: f.s + a, e: (f.long ?? f.e) + a, name: f.name };', 'const g = { s: f.s + a, e: f.e + a, name: f.name };'],
];
// owner rulings 18 and 19 as they were, in the copy of docxWrite.ts the engine bundles (law 44):
// '#' no joiner and no handle; no designator written whole; a number grouped only by a space, a
// dot, a slash or a hyphen; NFD alone; "&nbsp" read only with its semicolon; "ISPs" cut before P
const WRITER = join(here, '..', 'src', 'lib', 'extract', 'docxWrite.ts');
const RULING_WAS = {
  hash: [['const JOINER = /[./\\\\:@_#]/;', 'const JOINER = /[./\\\\:@_]/;'], ['const HANDLE = /^[@#]$/;', 'const HANDLE = /^@$/;']],
  long: [["const LONG_FORM: Record<string, string> = { co: 'company', corp: 'corporation', inc: 'incorporated' };", 'const LONG_FORM: Record<string, string> = {};']],
  dsep: [['if (N(ch) && lastN && DIGIT_SEP.test(gap)) dsep.add(c.length);', 'if (N(ch) && lastN && /^[ ./\\-   ‐-–]$/.test(gap)) dsep.add(c.length);']],
  nfkd: [["  const k = ch.normalize('NFKD');", "  const k = ch.normalize('NFD');"]],
  nbsp: [['&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+/g;', '&[A-Za-z][A-Za-z0-9]{1,31};)+/g;'], ['|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)/y;', '|&(?:(nbsp);|([A-Za-z][A-Za-z0-9]{1,31});)/y;'], ['|&#?[0-9A-Za-z]+;|&nbsp/;', '|&#?[0-9A-Za-z]+;/;'], ["&(?:nbsp;?|[A-Za-z][A-Za-z0-9]{1,31};))+`, 'g');", "&[A-Za-z][A-Za-z0-9]{1,31};)+`, 'g');"], ["|&(?:(nbsp);?|([A-Za-z][A-Za-z0-9]{1,31});)`, 'y');", "|&(?:(nbsp);|([A-Za-z][A-Za-z0-9]{1,31});)`, 'y');"]],
  plural: [['&& Ll(chars[i + 1]) && !plural)', '&& Ll(chars[i + 1]))']],
};
/** the engine bundled with a copy of docxWrite.ts that has `pairs` applied */
const engineWriterWith = (pairs) => mutantOf(WRITER, pairs, [], { contents: `export * from ${JSON.stringify(join(here, '..', 'src', 'lib', 'engine.ts').replace(/\\/g, '/'))};`, resolveDir: join(here, '..'), loader: 'ts' });

let pass = 0, fail = 0;
const check = (ok, what, detail = '') => { console.log((ok ? '  PASS  ' : '  FAIL  ') + what + (detail ? '\n          ' + detail : '')); ok ? pass++ : fail++; };

const PRACTICE = 'us';
const out = (text, entities) => remask(text, entities, PRACTICE).text;
// The engine without the run-together rule (law 34). Since that rule an engine row reads every
// form the .docx writer reads — another apostrophe or hyphen, a soft hyphen, full width, a name
// glued to digits or a CJK letter — so a CONTROL that shows a reading as it was, "the row on its
// own match", has to take the rule out as well, or it shows the rule instead.
const NR = await engineWith(NO_RUN);
const outNoRun = (text, entities) => NR.remask(text, entities, PRACTICE);
/** the same, for a screen bundle: engine.ts loaded with NO_RUN applied */
const engineNoRun = { name: 'engine-no-run', setup(b) {
  b.onLoad({ filter: /[\\/]lib[\\/]engine\.ts$/ }, (a) => {
    let s = readFileSync(a.path, 'utf8');
    for (const [from, to] of NO_RUN) {
      if (!s.includes(from)) throw new Error(`protected-terms: a CONTROL's line is no longer in engine.ts: ${from}`);
      s = s.replace(from, to);
    }
    return { contents: s, loader: 'ts' };
  });
} };
const row = (key, text, tag, cls, cat) => ({ key, text, tag, cat, cls, prov: 'both passes', occ: 1, status: 'confirmed', src: 'span' });
/** a token readable in `b` that `a` hid — null when none. The fail-closed comparator. */
const TAG_RE = /\[[A-Za-z]+-?\d+\]|\[(?:email|nric|card|phone|number|ssn|ein|nino|nhs)\]/g;
const tokens = (s) => { const m = new Map(); for (const t of (s.replace(TAG_RE, ' ').match(/[\p{L}\p{N}]+/gu) ?? [])) m.set(t, (m.get(t) ?? 0) + 1); return m; };
const readableIn = (a, b) => { const o = tokens(a); for (const [t, n] of tokens(b)) if ((o.get(t) ?? 0) < n) return t; return null; };
/** the late-term rule of the first round, for the CONTROLs: a term with ANY row in the table
 *  counts as answered for, whatever that row's match or state */
const round1 = (exported, ents, terms) => terms.filter((t) => !ents.some((e) => termKey(e.text) === termKey(t)) && protectedRegex(t, 'i').test(exported));

// ── .docx packages for the writer laws: the real writeZip, the real writer, the real walker ──
const enc = (x) => new TextEncoder().encode(x);
const dec = (u) => new TextDecoder().decode(u);
const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:v="urn:schemas-microsoft-com:vml"', 'xmlns:o="urn:schemas-microsoft-com:office:office"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
].join(' ');
const para = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const runs = (...ts) => `<w:p>${ts.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join('')}</w:p>`;
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
/** parts: { body, header, footer, comments, core } — inner XML of each; extra: [{ name, xml,
 *  rel?, ct? }], a part with its relationship type and content type, or with neither, as an
 *  add-in leaves one */
async function makeDocx(parts) {
  const over = [], rels = [], files = [];
  const pkgRels = [`<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>`];
  let sect = '';
  if (parts.header != null) {
    over.push('<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>');
    rels.push(`<Relationship Id="rIdH" Type="${REL}/header" Target="header1.xml"/>`);
    files.push({ name: 'word/header1.xml', data: enc(`${decl}<w:hdr ${NS}>${parts.header}</w:hdr>`) });
    sect += '<w:headerReference w:type="default" r:id="rIdH"/>';
  }
  if (parts.footer != null) {
    over.push('<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>');
    rels.push(`<Relationship Id="rIdF" Type="${REL}/footer" Target="footer1.xml"/>`);
    files.push({ name: 'word/footer1.xml', data: enc(`${decl}<w:ftr ${NS}>${parts.footer}</w:ftr>`) });
    sect += '<w:footerReference w:type="default" r:id="rIdF"/>';
  }
  if (parts.comments != null) {
    over.push('<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>');
    rels.push(`<Relationship Id="rIdC" Type="${REL}/comments" Target="comments.xml"/>`);
    files.push({ name: 'word/comments.xml', data: enc(`${decl}<w:comments ${NS}><w:comment w:id="0" w:author="x">${parts.comments}</w:comment></w:comments>`) });
  }
  if (parts.core != null) {
    over.push('<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>');
    pkgRels.push('<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>');
    files.push({ name: 'docProps/core.xml', data: enc(`${decl}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">${parts.core}</cp:coreProperties>`) });
  }
  for (const x of parts.extra ?? []) {
    files.push({ name: x.name, data: enc(`${decl}${x.xml}`) });
    if (x.rel) rels.push(`<Relationship Id="rIdX${files.length}" Type="${x.rel}" Target="${x.name.replace(/^word\//, '')}"/>`);
    if (x.ct) over.push(`<Override PartName="/${x.name}" ContentType="${x.ct}"/>`);
  }
  return writeZip([
    { name: '[Content_Types].xml', data: enc(`${decl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${over.join('')}</Types>`) },
    { name: '_rels/.rels', data: enc(`${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${pkgRels.join('')}</Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: enc(`${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`) },
    { name: 'word/document.xml', data: enc(`${decl}<w:document ${NS}><w:body>${parts.body}<w:sectPr>${sect}</w:sectPr></w:body></w:document>`) },
    ...files,
  ]);
}
/** the store's text of record for a .docx: the main flow, folded as the engine path folds it */
const textOf = async (pkg) => core.foldFullwidth(flowText((await extractDocx(pkg)).items.filter(inMainFlow)));
/** Export.tsx's dry run: the writer given exportPlan's .docx mask, which is what the screen
 *  passes it (law 10 pins that) — plus the output's raw XML, every part, for a search the
 *  walker cannot narrow */
async function writeWith(pkg, entities, terms, mask) {
  const plan = exportPlan({ text: '', entities, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg }, terms, PRACTICE);
  const { table, channel } = plan.docx;
  const report = await writeRedactedDocx(pkg, { mask: mask ?? plan.docx.mask });
  const raw = {};
  if (report.bytes) {
    const zip = await readZip(report.bytes);
    for (const n of zip.names) if (/\.xml$|\.rels$/.test(n)) raw[n] = dec(await zip.read(n));
  }
  return { report, channel, table, raw, all: Object.values(raw).join('\n') };
}

// ── LAW 1: a minted protected row is masked as the span the user typed, and nothing else ──
console.log('\n— law 1: a declared term the engine never found —');
{
  const TEXT = 'Project Lantern Phase Two is the deal. Project Lantern is a different matter entirely.';
  const TERM = 'Project Lantern Phase Two';

  const minted = protectedEntities(TEXT, [TERM]);
  check(minted.length === 1, 'one row is minted for the declared term', `got ${minted.length}`);
  check(minted[0].cls !== 'PERSON' && minted[0].cls !== 'COMPANY',
    `the minted row's cls (${minted[0].cls}) is neither PERSON nor COMPANY`,
    'those two are the only classes propagateProperPrefixes expands');

  const masked = out(TEXT, minted);
  check(!masked.includes(TERM), 'the declared term is masked', masked);
  check(masked.includes('Project Lantern is a different matter'),
    'the bare "Project Lantern" the user never declared is left alone',
    masked);

  // The SECOND guard, at engine.ts:358: placements() defaults a classless row to PERSON, but
  // sends a classless PROTECTED-cat row to PROTECTED_CLS instead. Review's drag-to-extend
  // clones a row by cat and drops cls, so the short form left behind by widening a protected
  // span arrives here with no class of its own. Both guards are load-bearing; this pins the
  // one the mint site does not cover.
  const classless = [{ ...minted[0], cls: undefined }];
  check(out(TEXT, classless).includes('Project Lantern is a different matter'),
    'a classless protected row does not prefix-expand either (placements, not the mint site)',
    out(TEXT, classless));

  // CONTROL: what the pre-fix code COMPUTED for this row. Neither guard existed, so
  // `cls: e.cls ?? 'PERSON'` handed lib-core a PERSON, and the bare prefix was swallowed.
  // Setting PERSON explicitly is the only way to reach that state now that both guards are in.
  const broken = [{ ...minted[0], cls: 'PERSON' }];
  const brokenOut = out(TEXT, broken);
  check(!brokenOut.includes('Project Lantern is a different matter'),
    'CONTROL: as a PERSON the bare prefix IS swallowed, so the two checks above can fail',
    brokenOut);
}

// ── LAW 2: declaring a term the engine found must never mask less than not declaring it ──
console.log('\n— law 2: a declared term the engine ALSO found —');
for (const [label, TEXT, TERM, ent] of [
  ['COMPANY', 'Northwind Trading Company filed today. Northwind Trading is the parent.',
    'Northwind Trading Company', row('c1', 'Northwind Trading Company', '[Company1]', 'COMPANY', 'org')],
  ['PERSON', 'Anna Maria Vitelli signed it. Anna Maria countersigned.',
    'Anna Maria Vitelli', row('p1', 'Anna Maria Vitelli', '[Person1]', 'PERSON', 'person')],
]) {
  const undeclared = out(TEXT, [ent]);
  const declared = out(TEXT, withProtectedTerms(TEXT, [ent], [TERM]));
  const leaked = readableIn(undeclared, declared);
  check(leaked === null,
    `${label}: declaring "${TERM}" masks no less than not declaring it`,
    leaked ? `"${leaked}" is readable once declared but was masked before\n          undeclared: ${undeclared}\n          declared:   ${declared}` : declared);

  // CONTROL: the broken law — stamp the protected class over the engine's own
  const stamped = [{ ...ent, cat: 'protected', cls: 'PROTECTED' }];
  const stampedOut = out(TEXT, stamped);
  check(readableIn(undeclared, stampedOut) !== null,
    `${label}: CONTROL: overwriting the engine class DOES lose masking, so the check above can fail`,
    stampedOut);
}

// ── the rest of the table must not move ──
console.log('\n— a declared term must not disturb any other row —');
{
  const TEXT = 'Northwind Trading Company and Harbour Point Capital Partners signed. Harbour Point Capital is the guarantor.';
  const ents = [
    row('c1', 'Northwind Trading Company', '[Company1]', 'COMPANY', 'org'),
    row('c2', 'Harbour Point Capital Partners', '[Company2]', 'COMPANY', 'org'),
  ];
  const before = out(TEXT, ents);
  const after = out(TEXT, withProtectedTerms(TEXT, ents, ['Northwind Trading Company']));
  const leaked = readableIn(before, after);
  check(leaked === null, 'the row nobody declared is masked identically',
    leaked ? `"${leaked}" became readable\n          before: ${before}\n          after:  ${after}` : after);
}

// ── the declared term is still actually masked, whichever path minted it ──
console.log('\n— a declared term is always masked —');
{
  const TEXT = 'Northwind Trading Company filed today.';
  const ent = row('c1', 'Northwind Trading Company', '[Company1]', 'COMPANY', 'org');
  const folded = withProtectedTerms(TEXT, [ent], ['Northwind Trading Company']);
  check(folded.every((e) => !e.dead), 'the folded row is not discarded');
  check(folded.some((e) => e.cat === 'protected'), 'the folded row is categorised protected');
  check(!out(TEXT, folded).includes('Northwind Trading Company'), 'and it is masked in the bytes');

  const revived = withProtectedTerms(TEXT, [{ ...ent, dead: true, status: 'ignored' }], ['Northwind Trading Company']);
  check(!out(TEXT, revived).includes('Northwind Trading Company'),
    'a row the reviewer had discarded is revived and masked once declared');
}

// ── LAW 3: a term only the letterhead holds gets no table row, and the .docx masks it anyway ──
console.log('\n— law 3: a declared term that lives only in the letterhead —');
{
  const BODY = 'We write on behalf of this firm. Leung Wing-Cheong gave evidence.';
  const TERM = 'Harrow Leung LLP';
  const witness = row('p1', 'Leung Wing-Cheong', '[Person1]', 'PERSON', 'person');

  // 3a — the table means "found in this document's body"
  const rows = protectedEntities(BODY, [TERM]);
  check(rows.length === 0, 'the body-absent term gets NO row in the entity table',
    `got ${JSON.stringify(rows.map((r) => [r.text, r.occ]))}`);

  // 3b — the .docx writer's table carries it
  const table = [witness, row('pr', 'Project Osprey', '[Protected4]', 'PROTECTED', 'protected')];
  const { table: wt, channel } = docxMaskTable(table, [TERM, 'Project Osprey', '  ', TERM]);
  check(channel.length === 1 && channel[0].text === TERM,
    'docxMaskTable mints exactly the missing term, once (a term already in the table, a blank, a duplicate: skipped)',
    JSON.stringify(channel.map((e) => e.text)));
  check(channel[0]?.tag === '[Protected5]', 'its tag continues after the highest [ProtectedN] in the table', String(channel[0]?.tag));
  check(wt.length === table.length + 1 && table.every((e, i) => wt[i] === e), 'the review table rides in front of it unchanged');
  // a row left readable: which decision governs the parts the review never showed depends on
  // whether the list was in view when it was made (law 15 has the leak this split closes)
  const leftUnder = { ...row('h', TERM, '[Protected1]', 'PROTECTED', 'protected'), dead: true };
  check(docxMaskTable([leftUnder], [TERM]).channel.length === 0,
    'a term the reviewer LEFT VISIBLE under Protected terms is not re-minted — that decision was made with the list in view, and governs every part of the file');
  const leftBefore = { ...row('h', TERM, '[Company1]', 'COMPANY', 'org'), dead: true };
  const past = docxMaskTable([leftBefore], [TERM]);
  check(past.channel.length === 1 && past.over.length === 1 && past.over[0] === past.channel[0] && past.table[0] === leftBefore,
    'one left visible under its engine category is: that choice was about the body, the one part the review shows — the row stays as the lawyer left it, and the minted row is reported as `over`, which the page says in words',
    JSON.stringify({ channel: past.channel.map((e) => e.text), over: past.over.map((e) => e.text) }));
  check(docxMaskTable([row('h', TERM, '[Company1]', 'COMPANY', 'org')], [TERM]).over.length === 0 && docxMaskTable([], [TERM]).over.length === 0 && docxMaskTable([], [TERM]).channel.length === 1,
    'CONTROL: `over` is empty for a live row and for a term with no row at all, so the line above is the dead row at work');

  // 3c — the name key lists what the saved file CARRIES: read off the writer's report of the
  // tags it wrote (engine.ts channelWritten), never off a search of our own
  const pkg = await makeDocx({ body: para(BODY), header: para(`${TERM} · Solicitors`) });
  const both = await writeWith(pkg, [], [TERM, 'Kestrel Holdings']);
  const listed = channelWritten(both.channel, both.report.channels).map((w) => w.e.text);
  check(listed.length === 1 && listed[0] === TERM,
    'the key lists the term the saved .docx carries and not the one it does not (another client\'s codename stays out of this key)',
    JSON.stringify(listed));
  check(both.channel.length === 2,
    'CONTROL: the writer\'s table carried both terms, so the line above is a filter at work and not an empty list',
    JSON.stringify(both.channel.map((e) => e.text)));

  // 3d — END TO END, through the real writer and the real walker
  const bodyTable = [...protectedEntities(BODY, [TERM]), witness];
  const through = async (mask) => {
    const r = await writeRedactedDocx(pkg, { mask });
    if (!r.bytes) return { held: r.held };
    const d = await extractDocx(r.bytes);
    return { header: d.items.filter((i) => i.kind === 'header').map((i) => i.text).join(' '), body: flowText(d.items.filter(inMainFlow)), leaks: r.gate.leaks };
  };
  // the mask Export hands the writer: exportPlan's, over the text of record
  const shipped = await through(exportPlan({ text: await textOf(pkg), entities: bodyTable, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg }, [TERM], PRACTICE).docx.mask);
  check(!shipped.held && shipped.header !== '' && !/Harrow|LLP/.test(shipped.header),
    'END TO END: the saved .docx masks the letterhead-only term', JSON.stringify(shipped));
  const bare = await through((t) => remask(t, bodyTable, PRACTICE));
  check(!bare.held && bare.header.includes(TERM) && bare.leaks.length === 0,
    'CONTROL: with the review table alone the header ships readable AND the leak gate passes it clean — the original defect',
    JSON.stringify(bare));
  check(shipped.body === bare.body && !shipped.body.includes('Leung Wing-Cheong'),
    'the body is byte-identical either way — the list reaches only the parts outside the body', `${shipped.body}\n          ${bare.body}`);
}

/** where a needle survives in the raw output XML, case-insensitive, with a little context */
const rawHits = (raw, needle) => Object.entries(raw).flatMap(([part, xml]) => {
  const i = xml.toLowerCase().indexOf(needle.toLowerCase());
  return i < 0 ? [] : [`${part}: …${xml.slice(Math.max(0, i - 50), i + needle.length + 20)}…`];
});

// ── LAW 4: a declared term matches the way a lawyer reads it ──
console.log('\n— law 4: the forms Word and keyboards write for the term the lawyer typed —');
{
  // [what, declared, the document's text, the pieces that must not be readable]
  const cases = [
    ['curly apostrophe in the document, straight typed', "O'Brien Kessler LLP", 'O’Brien Kessler LLP · Solicitors', /Brien|Kessler/],
    ['straight in the document, curly typed (smart quotes)', 'O’Brien Kessler LLP', "O'Brien Kessler LLP · Solicitors", /Brien|Kessler/],
    ['en dash for the hyphen', 'Harrow-Leung LLP', 'Harrow–Leung LLP acts for the vendor.', /Harrow|Leung/],
    ['non-breaking hyphen U+2011', 'Harrow-Leung LLP', 'Harrow‑Leung LLP acts for the vendor.', /Harrow|Leung/],
    ['decomposed accents (e + U+0301)', 'Société Générale', 'Société Générale is the lender.', /Soci|rale/],
    ['zero-width space inside the name', 'Kestrel Holdings', 'Kes​trel Holdings agreed.', /Kes|trel/],
    ['zero-width space beside the space', 'Kestrel Holdings', 'Kestrel​ Holdings agreed.', /Kestrel/],
    ['soft hyphen inside the name', 'Kestrel', 'Kes­trel Holdings agreed.', /Kes|trel/],
    ['a ruby reading glued in front (ケストレル)', 'Kestrel', 'ケストレルKestrel Holdings', /Kestrel/],
    ['Japanese text on both sides', 'Kestrel', '本件はKestrel社の案件です。', /Kestrel/],
    ['full-width letters nobody folded', 'Kestrel', 'ＫＥＳＴＲＥＬ Holdings agreed.', /ＫＥＳＴＲＥＬ/i],
  ];
  let bite = 0, run = 0;
  for (const [label, TERM, TEXT, readable] of cases) {
    const rows = protectedEntities(TEXT, [TERM]);
    const masked = out(TEXT, rows);
    check(rows.length === 1 && !readable.test(masked), `${label}: found and masked`, masked);
    // CONTROL: the same row under the engine's footprint — the match every row had before —
    // with the run-together rule taken out, which now reads these forms for an engine row too
    const engineRow = [{ ...row('x', TERM, '[Company9]', 'PROTECTED', 'org') }];
    if (readable.test(outNoRun(TEXT, engineRow).text)) bite++;
    else console.log(`          (the footprint masks "${label}" as well)`);
    if (!readable.test(out(TEXT, engineRow))) run++;
  }
  check(bite === cases.length, `CONTROL: the engine's footprint leaves all ${cases.length} readable, so each check above can fail`, `${bite} of ${cases.length}`);
  check(run === cases.length, `an engine row masks all ${cases.length} as well, read run together as the .docx writer reads it (law 34)`, `${run} of ${cases.length}`);

  // verify-by-extraction asks the same question the mask answered
  check(rowSurvives('O’Brien signed.', { text: "O'Brien", cat: 'protected' }), 'a kept protected row still standing in a curly form is reported as surviving (the export is held)');
  check(!rowSurvives('O’Brien signed.', { text: "O'Brien", cat: 'org' }), 'CONTROL: the footprint check it replaced for these rows says it is gone');

  // whole words still: a Latin letter or digit on the edge blocks, a CJK letter does not
  check(protectedMatches('Kestrels, xKestrel, Kestrel2, éKestrel', 'Kestrel') === 0, 'a term glued to Latin letters or digits is not matched — "Kestrel" is not inside "Kestrels"');
  check(protectedMatches('ケストレルKestrel', 'Kestrel') === 1, 'CONTROL: the same guard lets a katakana neighbour through, so the zero above is the guard and not a regex that matches nothing');

  // SUPERSET: switching a row to the tolerant match never masks LESS — at every place the
  // footprint matches, the tolerant regex matches too (sticky, at the same index)
  const TERMS = ["O'Brien Kessler LLP", 'Harrow-Leung LLP', 'Société Générale', 'Kestrel', 'Mr. Tan Ah Kow', 'Project Lantern Phase Two', 'A&B (Holdings) Ltd.', '東京商事'];
  const forms = (t) => [t, t.toUpperCase(), t.toLowerCase(), `(${t})`, `${t}'s`, `x${t}`, `${t}x`, `“${t}”`, t.replace(/ /g, '\n'), t.replace(/ /g, '  '), t.replace('Mr. ', 'Mr.'), `本件は${t}の`];
  const texts = TERMS.flatMap(forms).map((f) => `On 3 May ${f} wrote.`);
  const misses = (mk) => {
    const out = [];
    for (const t of TERMS) {
      for (const s of texts) {
        for (const m of s.matchAll(core.footprintRegex(t))) {
          const re = mk(t);
          re.lastIndex = m.index;
          if (!re.test(s)) out.push(`${t} @ ${JSON.stringify(s)}`);
        }
      }
    }
    return out;
  };
  const lost = misses((t) => protectedRegex(t, 'iy'));
  check(lost.length === 0, `the tolerant match covers every footprint match over ${texts.length} texts × ${TERMS.length} terms`, lost.slice(0, 3).join(' | '));
  check(misses((t) => protectedRegex(t, 'y')).length > 0, 'CONTROL: a case-sensitive variant misses some, so the superset check can fail');
}

// ── LAW 5: one identity for a declared term ──
console.log('\n— law 5: "the same term" has one answer (termKey) —');
{
  const pairs = [['Harrow Leung LLP', 'harrow leung llp'], ['O’Brien', "O'Brien"], ['Harrow–Leung', 'Harrow-Leung'], ['Société', 'Société'], ['Kes­trel', 'Kestrel'], ['ＫＥＳＴＲＥＬ', 'Kestrel'], ['  Kestrel   Holdings ', 'Kestrel Holdings']];
  const apart = pairs.filter(([a, b]) => termKey(a) !== termKey(b));
  check(apart.length === 0, `each of ${pairs.length} pairs is one term`, JSON.stringify(apart));
  check(termKey('Kestrel') !== termKey('Kestrels') && termKey('Lantern') !== termKey('Project Lantern'), 'CONTROL: different terms stay different');

  const TERM = 'Harrow Leung LLP';
  const deadRow = { ...row('h', 'Harrow Leung LLP', '[Protected1]', 'PROTECTED', 'protected'), dead: true };
  check(docxMaskTable([deadRow], [TERM]).channel.length === 0,
    'a row the lawyer left visible under Protected terms, written by Word with a no-break space, governs the typed term: the .docx mints no row over the decision');
  check(!new Set([deadRow.text.trim().toLowerCase()]).has(TERM.toLowerCase()),
    'CONTROL: the comparison it replaced (trim + lowercase) calls them two terms — the defect');
  const upgraded = withProtectedTerms('Harrow Leung LLP acts.', [row('h', 'Harrow Leung LLP', '[Company1]', 'COMPANY', 'org')], [TERM]);
  check(upgraded.length === 1 && upgraded[0].cat === 'protected',
    'the engine\'s no-break-space row is upgraded in place, not joined by a second row for the typed term', JSON.stringify(upgraded.map((e) => [e.text, e.cat, e.tag])));
}

// ── LAW 6: a term declared after the document was read ──
console.log('\n— law 6: a declared term with no row is held, not shipped —');
{
  const TEXT = 'Kestrel Holdings agreed the heads of terms. O’Brien will sign for Kestrel.';
  const ents = []; // the table as the strip left it, before either term was on the list
  const TERMS = ['Kestrel', "O'Brien"];
  const red = out(TEXT, ents);
  check(/Kestrel/.test(red) && /Brien/.test(red), 'CONTROL: the text export carries both readable — the leak the hold exists for', red);
  const late = lateTerms(red, ents, TERMS);
  check(late.length === 2, 'both are named late — the curly "O’Brien" included — so every export is held', JSON.stringify(late));
  const fixed = withProtectedTerms(TEXT, ents, late);
  const red2 = out(TEXT, fixed);
  check(!/Kestrel|Brien/.test(red2) && lateTerms(red2, fixed, TERMS).length === 0,
    'masking them in this document (the button: withProtectedTerms over the late terms only) lifts the hold', red2);

  // A row left readable. Which decision governs depends on whether the list was in view when
  // it was made: declared BEFORE the drop, the strip revives the engine's row under Protected
  // terms (withProtectedTerms), so a row the lawyer then leaves readable there was decided
  // against the list; one left readable before the term was declared was not.
  const signer = row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person');
  const deadEng = [signer, { ...row('k', 'Kestrel', '[Company1]', 'COMPANY', 'org'), dead: true, status: 'ignored' }];
  const heldVis = listHolds(out(TEXT, deadEng), deadEng, ['Kestrel']);
  check(heldVis.length === 1 && heldVis[0].why === 'left-visible',
    'a row left readable while it sat under its engine category holds the export once the term is declared, and says that is why', JSON.stringify(heldVis));
  check(round1(out(TEXT, deadEng), deadEng, ['Kestrel']).length === 0,
    'CONTROL: the rule it replaced (any row answers for its term) ships that export with the declared term readable');
  const unmasked = withProtectedTerms(TEXT, deadEng, ['Kestrel']);
  check(!/Kestrel/.test(out(TEXT, unmasked)) && listHolds(out(TEXT, unmasked), unmasked, ['Kestrel']).length === 0,
    'the hold\'s button (withProtectedTerms) revives the row under Protected terms and the hold lifts', out(TEXT, unmasked));
  const before = withProtectedTerms(TEXT, [signer, row('k', 'Kestrel', '[Company1]', 'COMPANY', 'org')], ['Kestrel']);
  const leftUnder = before.map((e) => (e.key === 'k' ? { ...e, dead: true, status: 'ignored' } : e));
  check(leftUnder[1].cat === 'protected' && listHolds(out(TEXT, leftUnder), leftUnder, ['Kestrel']).length === 0 && /Kestrel/.test(out(TEXT, leftUnder)),
    'a row left readable under Protected terms governs: the export carries it and is not held', out(TEXT, leftUnder));

  const W = 'Project Lantern is the deal.';
  const widened = [row('w', 'Project Lantern', '[Protected1]', undefined, 'protected')];
  check(lateTerms(out(W, widened), widened, ['Lantern']).length === 0,
    'a declared "Lantern" inside a masked "Project Lantern" is not readable, so it holds nothing');
  check(protectedMatches(W, 'Lantern') === 1, 'CONTROL: a search of the ORIGINAL finds it — which is why lateTerms reads the export');

  const gap = [row('p', 'Osprey', '[Protected2]', 'PROTECTED', 'protected')];
  const added = withProtectedTerms('Osprey and Kestrel.', gap, ['Kestrel']);
  check(added[1]?.tag === '[Protected3]', 'a late row\'s tag continues after the highest [ProtectedN] in the table', String(added[1]?.tag));
  check(protectedEntities('Kestrel', ['Kestrel'], gap.length)[0].tag === gap[0].tag,
    'CONTROL: numbering from the table\'s length, as before, reuses [Protected2] — one tag for two terms');

  // A live row of the term beside one left readable before the list. The button masks every
  // form, and so undoes that choice: the hold has to say so, not call it another form.
  const OB = "Signed, O’Brien Kessler LLP. Reply to O'Brien Kessler LLP.";
  const OBT = "O'Brien Kessler LLP";
  const sibs = [row('c', 'O’Brien Kessler LLP', '[Company1]', 'COMPANY', 'org'), { ...row('s', OBT, '[Company2]', 'COMPANY', 'org'), dead: true, status: 'ignored' }];
  const sibHold = listHolds(out(OB, sibs), sibs, [OBT]);
  check(sibHold.length === 1 && sibHold[0].why === 'left-visible',
    'a live row beside one left readable before the list is held as the choice the button overrides, not as another form', JSON.stringify(sibHold));
  check(withProtectedTerms(OB, sibs, [OBT]).find((e) => e.key === 's')?.dead === undefined,
    'CONTROL: the button does revive that row — which is what the hold must tell the lawyer before it is pressed');
  // left readable UNDER Protected terms, it stays the lawyer's row
  const underList = [sibs[0], { ...sibs[1], tag: '[Protected1]', cls: 'PROTECTED', cat: 'protected' }];
  const kept = withProtectedTerms(OB, underList, [OBT]);
  check(kept.includes(underList[1]) && kept[0].cat === 'protected' && !kept[0].dead,
    'a row left readable under Protected terms is not revived by the button; the live row beside it is upgraded', JSON.stringify(kept.map((e) => [e.text, e.cat, !!e.dead])));
  check(withProtectedTerms(OB, [sibs[0], { ...underList[1], cat: 'org' }], [OBT]).find((e) => e.key === 's')?.dead === undefined,
    'CONTROL: the same row under its engine category is revived, so the line above is the category at work');
  const through = exportPlan({ text: OB, entities: kept, reviewed: true, engineComplete: true, kind: 'text' }, [OBT], PRACTICE);
  check(!through.blocked && !/Brien/.test(through.red) && through.maskedAnyway.length === 1 && through.maskedAnyway[0].by?.list === true,
    'the export masks it anyway, through the live row that matches every form, and says that is what masks it (law 16)', JSON.stringify(through.maskedAnyway.map((m) => m.by)));

  // Review's drag-to-extend asks how often the short name stands outside the longer one it is
  // widened to; for a protected row the answer has to come from the match that masks it, or
  // the widening goes through silently and the lone form turns up as a "no row" hold on Export
  const W7 = 'O’Brien Kessler LLP signed. O’Brien replied.';
  check(occurrencesOutside(W7, "O'Brien", OBT, true) === 1, 'asked with the tolerant match, the lone curly "O’Brien" outside the firm name is counted');
  check(occurrencesOutside(W7, "O'Brien", OBT) === 0, 'CONTROL: asked with the footprint, the default, it counts none');
}

// ── LAW 7: what the walker does not read, and what the key lists ──
console.log('\n— law 7: watermark, alt-text, names, split runs — and the key lists what was written —');
{
  const TERMS = ['Kestrel', 'Harrow Leung LLP', 'Osprey', 'Lantern'];
  const WPS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
  // Design > Watermark > Custom text, as Word writes it into the header
  const watermark = '<w:p><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1" type="#_x0000_t136" style="position:absolute;rotation:315" fillcolor="silver" stroked="f"><v:textpath style="font-family:&quot;Calibri&quot;" string="KESTREL – STRICTLY CONFIDENTIAL"/></v:shape></w:pict></w:r></w:p>';
  const body =
    para('We write regarding Project Lantern.') +
    '<w:p><w:bookmarkStart w:id="0" w:name="Kestrel_completion"/><w:r><w:t>Completion</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>' +
    '<w:p><w:hyperlink w:anchor="Kestrel_completion"><w:r><w:t>see completion</w:t></w:r></w:hyperlink></w:p>' +
    '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblCaption w:val="Kestrel cap table"/><w:tblDescription w:val="Shareholdings of Kestrel"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Shares</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    `<w:p><w:r><w:drawing><wp:anchor><wp:docPr id="3" name="Kestrel logo" descr="Osprey site plan"/><a:graphic><a:graphicData uri="${WPS}"><wps:wsp><wps:cNvPr id="4" name="Kestrel box" descr="Kestrel crest"/><wps:txbx><w:txbxContent><w:p><w:r><w:t>Heads of terms</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
  const pkg = await makeDocx({
    body,
    header: watermark + runs('Har', 'row Le', 'ung LLP') + para('Kestrel · Solicitors'),
    comments: para('Osprey to confirm'),
    core: '<dc:title>Osprey heads</dc:title>',
  });
  const TEXT = await textOf(pkg);
  // the table after review: the lawyer widened the list's "Lantern" to "Project Lantern"
  const table = [row('w', 'Project Lantern', '[Protected1]', undefined, 'protected')];
  check(lateTerms(out(TEXT, table), table, TERMS).length === 0, 'setup: no declared term is readable in the body export, so nothing here is held for lateness', TEXT);

  const s = await writeWith(pkg, table, TERMS);
  check(!s.report.held && s.report.gate.leaks.length === 0, 'the .docx is written and its gate passes', String(s.report.held));
  const hits = ['Kestrel', 'Harrow', 'Osprey', 'Lantern'].flatMap((n) => rawHits(s.raw, n));
  check(hits.length === 0,
    'no declared term survives ANYWHERE in the output XML: watermark, table alt-text, shape names, text-box description, bookmark and link, split runs, comment, property',
    hits.slice(0, 4).join('\n          '));
  const hdr = s.raw['word/header1.xml'] || '';
  const doc = s.raw['word/document.xml'] || '';
  const wm = /string="([^"]*)"/.exec(hdr)?.[1] ?? '';
  check(/^\[Protected\d+\] – STRICTLY CONFIDENTIAL$/.test(wm), 'the watermark is masked like a run, and the rest of it stays: the recipient still sees STRICTLY CONFIDENTIAL', wm);
  const bm = /w:bookmarkStart[^>]*w:name="([^"]*)"/.exec(doc)?.[1];
  const anchor = /w:hyperlink[^>]*w:anchor="([^"]*)"/.exec(doc)?.[1];
  check(!!bm && bm === anchor, 'the bookmark is renamed and the link still points at it', `${bm} ← ${anchor}`);
  check(/name="Object 3"/.test(doc) && /name="Object 4"/.test(doc) && !/descr=/.test(doc) && !/tblCaption|tblDescription/.test(doc),
    'shape names are neutral, descriptions and table alt-text are gone', doc.slice(doc.indexOf('<w:tbl>'), doc.indexOf('<w:tbl>') + 160));

  const listed = channelWritten(s.channel, s.report.channels);
  const names = listed.map((w) => w.e.text).sort();
  check(JSON.stringify(names) === '["Harrow Leung LLP","Kestrel"]' && listed.every((w) => w.kinds.join() === 'header'),
    'the key lists exactly the two terms the .docx masked, and where: the split-run letterhead in, the removed and the covered ones out',
    JSON.stringify(listed.map((w) => [w.e.text, w.kinds])));
  const items = (await extractDocx(pkg)).items.filter((i) => i.rev !== 'del');
  const searched = s.channel.filter((e) => items.some((i) => spanMatches(i.text, e.text) > 0)).map((e) => e.text);
  check(searched.includes('Osprey') && searched.includes('Lantern') && !searched.includes('Harrow Leung LLP'),
    'CONTROL: the search it replaced listed Osprey (comment, property, alt-text: all REMOVED) and Lantern (inside the masked "Project Lantern"), and missed the split letterhead the .docx did mask',
    JSON.stringify(searched));
  const walked = items.map((i) => i.text).join('\n');
  check(!/STRICTLY|cap table|Shareholdings|Kestrel logo|Kestrel box|Kestrel crest|Kestrel_completion/.test(walked),
    'CONTROL: the walker the gate re-walks with reads none of the watermark, table alt-text, shape names, text-box description or bookmark — only the writer\'s own audit sees them');

  // the audit has teeth: a writer that let the watermark through is held by its own gate
  let dodged = false;
  const flaky = (t) => {
    if (!dodged && t.includes('STRICTLY')) { dodged = true; return { text: t, placements: [], floorHits: [], divergence: null }; }
    return remask(t, s.table, PRACTICE);
  };
  const g = await writeWith(pkg, table, TERMS, flaky);
  check(dodged && !!g.report.held && /watermark/.test(g.report.held),
    'CONTROL: when the structural pass misses the watermark, the gate\'s attribute audit holds the file', String(g.report.held).slice(0, 200));

  // a kept field's instruction spells a name with underscores, as a bookmark does
  const SEQ = ' SEQ Project_Kestrel \\* ARABIC ';
  const seqPkg = await makeDocx({ body: para('Heads of terms.'), header: `<w:p><w:fldSimple w:instr="${SEQ}"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>` });
  const seq = await writeWith(seqPkg, [], ['Project Kestrel']);
  check(!seq.report.held && (seq.raw['word/header1.xml'] || '').includes('w:instr=" SEQ Label1 \\* ARABIC "') && rawHits(seq.raw, 'Kestrel').length === 0,
    'a kept SEQ field named "Project_Kestrel" counts under a neutral label (Label1): the numbering stays live and the name ships nowhere', String(seq.report.held).slice(0, 160));
  check(outNoRun(SEQ, seq.table).placements.length === 0, 'CONTROL: the instruction as written places nothing on the engine as it was, without the run-together rule (law 34), which is how the gate passed it');
}

// ── LAW 8: the writer masks folded text ──
console.log('\n— law 8: the writer and its gate read full-width text as the engine does —');
{
  const eng = [row('c1', 'Kestrel Holdings', '[Company1]', 'COMPANY', 'org')];
  const pkg = await makeDocx({ body: para('Kestrel Holdings agreed.') + para('ＫＥＳＴＲＥＬ ＨＯＬＤＩＮＧＳ countersigned.'), header: para('ＫＥＳＴＲＥＬ ＨＯＬＤＩＮＧＳ · Private') });
  const s = await writeWith(pkg, eng, []);
  const hits = ['ＫＥＳＴＲＥＬ', 'ＨＯＬＤＩＮＧＳ', 'Kestrel'].flatMap((n) => rawHits(s.raw, n));
  check(!s.report.held && hits.length === 0, 'an engine row masks its full-width form in the body and the header of the .docx', s.report.held || hits.join(' | '));
  check(outNoRun('ＫＥＳＴＲＥＬ ＨＯＬＤＩＮＧＳ · Private', eng).text.includes('ＫＥＳＴＲＥＬ'),
    'CONTROL: masking the raw flow, as the writer and its gate did, places nothing on it — on the engine without the run-together rule (law 34), which reads full width too');
}

// ── LAW 9: the code the saved files are named by ──
console.log('\n— law 9: the code is random —');
{
  const codes = Array.from({ length: 200 }, () => exportCode());
  check(codes.every((c) => /^[0-9A-Z]{7}$/.test(c)), 'seven base-36 characters');
  check(new Set(codes).size === codes.length && exportCode.length === 0, 'a fresh code per draw, from no input at all (200 draws, 200 codes)');

  const fnv = (x) => { let h = 0x811c9dc5; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36).toUpperCase().padStart(7, '0'); };
  const pkg = await makeDocx({ body: para('Dear Sirs,') + '<w:p><w:r><w:t xml:space="preserve">Our client will accept </w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t xml:space="preserve">no less than 285,000 </w:t></w:r><w:r><w:t>in full and final settlement.</w:t></w:r></w:p>' });
  const red = out(await textOf(pkg), []);
  const s = await writeWith(pkg, [], []);
  const seen = flowText((await extractDocx(s.report.bytes)).items.filter(inMainFlow));
  const guess = (amt) => fnv(seen.replace('accept in full', `accept no less than ${amt} in full`));
  check(!seen.includes('285,000') && guess('285,000') === fnv(red) && guess('290,000') !== fnv(red),
    'CONTROL: from the .docx alone, the hash of the redacted text the page used to name files by confirms the hidden settlement floor — the oracle the random code removes',
    `.docx body: ${JSON.stringify(seen)}`);
  const src = readFileSync(join(here, '..', 'src', 'screens', 'Export.tsx'), 'utf8');
  const HASHED = /0x811c9dc5|0x01000193/;
  check(!HASHED.test(src) && /exportCode\(\)/.test(src), 'Export.tsx names its files with exportCode() and carries no FNV hash');
  check(HASHED.test(fnv.toString()), 'CONTROL: the detector finds the hash it looks for');
}

// ── LAW 10: the Export screen's wiring ──
console.log('\n— law 10: the Export screen\'s wiring, pinned on its source —');
{
  const src = readFileSync(join(here, '..', 'src', 'screens', 'Export.tsx'), 'utf8');
  const app = readFileSync(join(here, '..', 'src', 'App.tsx'), 'utf8');

  const hooksBelow = (s) => {
    const at = /if \(!file \|\| !file\.entities[^)]*\) \{/.exec(s)?.index ?? -1;
    return at < 0 ? ['no early return found'] : (s.slice(at).match(/\buse(?:Memo|State|Effect|Callback|Ref)\(/g) ?? []);
  };
  check(hooksBelow(src).length === 0, 'no hook sits below the early returns (rules of hooks)', hooksBelow(src).join(', '));
  check(hooksBelow('if (!file || !file.entities) { return null; }\n  const fragments = useMemo(() => f(), [red]);').length === 1,
    'CONTROL: the detector finds the useMemo that sat there');

  const reads = src.split('\n').filter((l) => l.includes('loadProtectedTerms('));
  const oneRead = (lines) => lines.length > 0 && lines.every((l) => /useState\(\(\) =>|setSnap\(/.test(l));
  check(oneRead(reads) && (src.match(/writeRedactedDocx\(/g) ?? []).length === 1,
    'the list is read once, into the page\'s snapshot, and the writer runs once — the dry run the key, the receipt and the button share',
    reads.map((l) => l.trim()).join(' | '));
  check(!oneRead(['      const { table } = docxMaskTable(file.entities, loadProtectedTerms());']),
    'CONTROL: the second read the .docx button used to make fails that check');

  const OMITS = /masked with this table and the safety-net pattern only/;
  check(!OMITS.test(src), 'no sentence says the unread parts are masked "with this table and the safety-net pattern only" — the always-redact list is named with them');
  check(OMITS.test('stay in the file and are masked with this table and the safety-net pattern only, because no engine read them'),
    'CONTROL: the detector matches the on-screen sentence that was there');
  const FIXED = /its headers, footers and footnotes, which no engine read/;
  check(!FIXED.test(src) && /CHANNEL_NOTE = `[^`]*\$\{channelWhere\}/.test(src), 'the key\'s always-redact note names the parts the writer reported, not a fixed three');
  check(FIXED.test('these tags appear only in the saved .docx (its headers, footers and footnotes, which no engine read)'),
    'CONTROL: the detector matches the note that was there');

  const FOLD = /foldFullwidth\(f\.text \|\| ''\)/g;
  const folds = (app.match(FOLD) ?? []).length;
  check(folds === 2 && /withProtectedTerms\(doc, f\.entities \|\| \[\]/.test(app),
    'the offline and engine-error paths fold the text of record and apply the list, as the engine path does', `${folds} folds`);
  check(("const prot = protectedEntities(f.text || '', loadProtectedTerms());".match(FOLD) ?? []).length === 0,
    'CONTROL: the offline line that was there does not count as a fold');

  // The screen composes nothing the tests do not drive: its gates, its text and the .docx
  // writer's mask all come from exportPlan (laws 3, 6, 11 and 13 drive it). Until this, the
  // screen built the hold and the writer's table itself, and this file stayed green with
  // either removed.
  const engineImport = /import \{([^}]*)\} from '\.\.\/lib\/engine';/.exec(src)?.[1] ?? '';
  const OWN = /\b(?:remask|docxMaskTable|lateTerms|listHolds|protectedRegex|withProtectedTerms|placements)\b/;
  check(/\bexportPlan\b/.test(engineImport) && !OWN.test(engineImport), 'Export imports exportPlan and none of the mask or list checks it is made of', engineImport.trim());
  check(OWN.test('remask, isFloorRow, FLOOR_WORD, floorTablesLabel, rowSurvives, survivingFragments, channelWritten, lateTerms, docxMaskTable, exportCode, termKey'),
    'CONTROL: the import the screen had before trips that check');
  const WIRE = /writeRedactedDocx\(file\.bytes, \{ mask: docxTable\.mask \}\)/;
  check(WIRE.test(src) && /const docxTable = plan\?\.docx \?\? null;/.test(src), 'the .docx writer is given exportPlan\'s mask, the one laws 3, 7, 11 and 12 write with');
  check(!WIRE.test('writeRedactedDocx(file.bytes, { mask: (t) => remask(t, file.entities, practice) })'), 'CONTROL: a mask composed on the screen fails that pin');
  // the hold's button, as App answers it: withProtectedTerms over the terms the row names —
  // the call laws 6 and 11 prove leaves the table as the term declared before the drop
  const BUTTON = /onMaskTerms=\{\(terms\) => [^\n]*withProtectedTerms\([^,\n]+, ents, terms\)/;
  check(BUTTON.test(app), 'App answers the hold\'s button with withProtectedTerms over the named terms');
  check(!BUTTON.test("onMaskTerms={(terms) => active && updateEntities(active.id, (ents) => [...ents, ...protectedEntities(active.text || '', terms)])} />"),
    'CONTROL: a button that only minted rows (and left an engine row on its own match) fails that pin');
}

// ── LAW 11: declared before the drop or after it, one mask ──
console.log('\n— law 11: a declared term masks the same whether it was declared before or after the drop —');
{
  const eng = (text) => [row('e', text, '[Company1]', 'COMPANY', 'org')];
  const input = (text, entities, over = {}) => ({ text, entities, reviewed: true, engineComplete: true, kind: 'text', ...over });
  // the text exports: the body writes the term in a second form beside the one the engine found
  const bodyCases = [
    ['a straight-apostrophe reply beside the curly sign-off the engine found', 'Signed, O’Brien Kessler LLP. Please reply to O\'Brien Kessler LLP by Friday.', 'O’Brien Kessler LLP', "O'Brien Kessler LLP", /Brien|Kessler/],
    ['a soft hyphen inside the name, beside the plain form the engine found', 'Kestrel agreed. Kes­trel will sign.', 'Kestrel', 'Kestrel', /Kes|trel/],
  ];
  // Since the run-together rule (law 34) the engine's row reads the second form as the .docx
  // writer reads it, so the term declared after the drop leaves nothing readable and holds
  // nothing. The hold and its button are asked where the second form is still readable: on the
  // engine without that rule, and on a safety-net row below, which the rule does not read.
  for (const [label, TEXT, found, TERM, readable] of bodyCases) {
    const before = exportPlan(input(TEXT, withProtectedTerms(TEXT, eng(found), [TERM])), [TERM], PRACTICE);
    const after = exportPlan(input(TEXT, eng(found)), [TERM], PRACTICE);
    check(!before.blocked && !readable.test(before.red), `${label}: declared before the drop, every form is masked`, before.red);
    check(!after.blocked && !after.holds.length && after.red === before.red,
      `${label}: declared after, the engine's row reads the other form as the .docx writer does — nothing is held, and the export is byte-identical to the term declared before`, `${JSON.stringify(after.holds)} ${after.red}`);
    const was = NR.exportPlan(input(TEXT, eng(found)), [TERM], PRACTICE);
    check(was.blocked && was.holds.length === 1 && was.holds[0].why === 'other-form' && readable.test(was.red),
      `${label}: CONTROL: without the run-together rule the other form is readable, and the export is held and names the other form as why`, `${JSON.stringify(was.holds)} ${was.red}`);
    const pressed = NR.exportPlan(input(TEXT, NR.withProtectedTerms(TEXT, eng(found), was.holds.map((h) => h.term))), [TERM], PRACTICE);
    check(!pressed.blocked && pressed.red === before.red, `${label}: there, the hold's button gives the export byte-identical to the term declared before`, pressed.red);
    check(round1(was.red, eng(found), [TERM]).length === 0 && readable.test(was.red),
      `${label}: CONTROL: the first round's rule held nothing there, and the text export carried the term readable`);
  }
  {
    // the safety-net row answers for a declared number in its plain form; a soft hyphen inside
    // the second one defeats the pattern, and the run-together rule reads no safety-net row
    const anna = row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person');
    const NT = 'Client ref S1234567D is on file. The schedule repeats S1234­567D. Anna Tan signed.';
    const TERM = 'S1234567D';
    const late = syncFloorRows(NT, [anna], PRACTICE);
    const before = exportPlan(input(NT, syncFloorRows(NT, withProtectedTerms(NT, [anna], [TERM], PRACTICE), PRACTICE)), [TERM], PRACTICE);
    const after = exportPlan(input(NT, late), [TERM], PRACTICE);
    check(!before.blocked && !/1234/.test(before.red), 'a soft hyphen inside a declared number the safety-net pattern found in its plain form: declared before the drop, every form is masked', before.red);
    check(after.blocked && after.holds.map((h) => h.why).join() === 'other-form' && after.red.includes('S1234­567D'),
      'declared after, the export is held and names the other form as why', `${JSON.stringify(after.holds)} ${after.red}`);
    const pressed = exportPlan(input(NT, syncFloorRows(NT, withProtectedTerms(NT, late, after.holds.map((h) => h.term), PRACTICE), PRACTICE)), [TERM], PRACTICE);
    check(!pressed.blocked && pressed.red === before.red, 'after the hold\'s button the export is byte-identical to the term declared before', pressed.red);
  }

  // the letterhead: the body carries only the engine's form, the header another
  const headerOf = async (r) => (r.bytes ? (await extractDocx(r.bytes)).items.filter((i) => i.kind === 'header').map((i) => i.text).join(' ') : `held: ${r.held}`);
  const headerCases = [
    ['a non-breaking hyphen (U+2011) in the letterhead', 'Harrow-Leung LLP acts for the vendor.', 'Harrow-Leung LLP', 'Harrow‑Leung LLP · Solicitors', /Harrow|Leung/],
    ['a ruby reading glued to the name in the letterhead', 'Kestrel agreed the terms.', 'Kestrel', 'ケストレルKestrel · 東京事務所', /Kestrel/],
  ];
  for (const [label, BODY, TERM, HEADER, readable] of headerCases) {
    const pkg = await makeDocx({ body: para(BODY), header: para(HEADER) });
    const TEXT = await textOf(pkg);
    const docx = { kind: 'docx', bytes: pkg };
    const before = exportPlan(input(TEXT, withProtectedTerms(TEXT, eng(TERM), [TERM]), docx), [TERM], PRACTICE);
    const after = exportPlan(input(TEXT, eng(TERM), docx), [TERM], PRACTICE);
    check(!after.blocked, `${label}: declared after, the body carries only the form the engine found, so nothing on the page is held`, JSON.stringify(after.holds));
    const hb = await headerOf(await writeRedactedDocx(pkg, { mask: before.docx.mask }));
    const ha = await headerOf(await writeRedactedDocx(pkg, { mask: after.docx.mask }));
    check(!readable.test(ha) && ha === hb, `${label}: the saved .docx masks the letterhead exactly as it does for the term declared before`, `after: ${ha} | before: ${hb}`);
    const old = await writeRedactedDocx(pkg, { mask: (t) => outNoRun(t, eng(TERM)) });
    check(!!old.bytes && readable.test(await headerOf(old)) && old.gate.leaks.length === 0,
      `${label}: CONTROL: with the engine's row left on its own match, as the writer's table had it (the engine without the run-together rule, law 34), the letterhead ships readable and the gate passes it`, await headerOf(old));
  }

  // the writer never edits the review: a row left readable stays exactly as it was (a row
  // minted beside it reaches only the parts the review never showed — law 15), and a floor
  // row is never upgraded (law 14)
  const deadRow = { ...row('k', 'Kestrel', '[Company1]', 'COMPANY', 'org'), dead: true };
  const floorRow = { key: 'floor:x', text: '6123-4567', tag: '[phone]', cat: 'contact', cls: 'PHONE', prov: 'pattern', occ: 1, status: 'confirmed', src: 'structured-floor' };
  const t = docxMaskTable([deadRow, floorRow], ['Kestrel', '6123-4567']).table;
  check(t[0] === deadRow && t[1] === floorRow && t.slice(2).every((e) => e.cat === 'protected' && !e.dead && e.src === undefined),
    'docxMaskTable leaves a row the lawyer left readable, and a safety-net row, exactly as they were — the hold on the page is where that is settled',
    JSON.stringify(t.map((e) => [e.text, e.cat, e.tag, !!e.dead])));
}

// ── LAW 12: bookmark names with nothing between their words ──
console.log('\n— law 12: a bookmark name is read in its words —');
{
  const bm = (id, name, text) => `<w:p><w:bookmarkStart w:id="${id}" w:name="${name}"/><w:r><w:t>${text}</w:t></w:r><w:bookmarkEnd w:id="${id}"/></w:p>`;
  const link = (name, text) => `<w:p><w:hyperlink w:anchor="${name}"><w:r><w:t>${text}</w:t></w:r></w:hyperlink></w:p>`;
  const NAMES = ['KestrelSPA', 'ProjectKestrel', 'Kestrel2'];
  const body = para('Heads of terms.') + NAMES.map((n, i) => bm(i, n, `Clause ${i + 1}`) + link(n, `see clause ${i + 1}`)).join('') + bm(9, 'ClauseTwo', 'Clause two') + link('ClauseTwo', 'see clause two');
  const s = await writeWith(await makeDocx({ body }), [], ['Kestrel']);
  const doc = s.raw['word/document.xml'] || '';
  const marks = [...doc.matchAll(/w:bookmarkStart[^>]*w:name="([^"]*)"/g)].map((m) => m[1]);
  const anchors = [...doc.matchAll(/w:hyperlink[^>]*w:anchor="([^"]*)"/g)].map((m) => m[1]);
  check(!s.report.held && rawHits(s.raw, 'Kestrel').length === 0, `no bookmark or link in the output carries the declared term (${NAMES.join(', ')})`, String(s.report.held) + ' ' + rawHits(s.raw, 'Kestrel').join(' | '));
  check(marks.length === 4 && marks.every((m, i) => m === anchors[i] && m === `bm${i + 1}`),
    'every link still points at its bookmark, and every bookmark the author named is renamed bm1, bm2 … in document order, "ClauseTwo" too', JSON.stringify({ marks, anchors }));
  check(NAMES.every((n) => [n, n.replace(/_/g, ' ')].every((f) => outNoRun(f, s.table).placements.length === 0)),
    'CONTROL: the two readings the writer and the gate made before (as written, underscores as spaces) place nothing on any of them, on the engine without the run-together rule (law 34)');

  const PAGEREF = ' PAGEREF KestrelSPA \\h ';
  const fld = await writeWith(await makeDocx({ body: bm(0, 'KestrelSPA', 'Clause 1') + `<w:p><w:fldSimple w:instr="${PAGEREF}"><w:r><w:t>2</w:t></w:r></w:fldSimple></w:p>` }), [], ['Kestrel']);
  check(!fld.report.held && (fld.raw['word/document.xml'] || '').includes('w:instr=" PAGEREF bm1 \\h "') && rawHits(fld.raw, 'Kestrel').length === 0,
    'a kept PAGEREF to "KestrelSPA" follows the bookmark to its new name: the page reference stays live and carries no name', String(fld.report.held).slice(0, 200));
  check(outNoRun(PAGEREF, fld.table).placements.length === 0, 'CONTROL: the instruction as written places nothing on the engine as it was, without the run-together rule (law 34), which is how the gate passed it');

  // the safety-net pattern reads a name as written, never its cut-out pieces
  // PAGEREF, because the writer keeps it live (a REF is written out as its text, so a REF here
  // would pass whatever the gate did with the name)
  const SCHED = ' PAGEREF Schedule123456789 \\h ';
  const sched = await writeWith(await makeDocx({ body: bm(0, 'Schedule123456789', 'Schedule') + `<w:p><w:fldSimple w:instr="${SCHED}"><w:r><w:t>4</w:t></w:r></w:fldSimple></w:p>` }), [], []);
  const schedDoc = sched.raw['word/document.xml'] || '';
  check(!sched.report.held && /w:name="bm1"/.test(schedDoc) && schedDoc.includes('w:instr=" PAGEREF bm1 \\h "') && !schedDoc.includes('123456789'),
    'a bookmark whose digits are a long number only once cut out of it is renamed like every other, not held, and the page reference to it follows it', String(sched.report.held));
  check(remask('123456789', [], PRACTICE).floorHits.length > 0, 'CONTROL: standing alone, those digits are a long number to the safety-net pattern');
}

// ── LAW 13: the Export screen, rendered ──
console.log('\n— law 13: the Export screen, rendered —');
{
  // react-dom/server over the real component, bundled with React in ONE bundle (two copies of
  // React would fail every hook). Effects do not run here: the .docx dry run never lands, so a
  // .docx page stays on "waiting", which one check below relies on.
  const ssr = join(dir, 'export-ssr.mjs');
  const noPdf = { name: 'no-pdf', setup(b) {
    b.onResolve({ filter: /extract[\\/]pdf$/ }, (args) => ({ path: args.path, namespace: 'no-pdf' }));
    b.onLoad({ filter: /.*/, namespace: 'no-pdf' }, () => ({ contents: 'export function extractPdf() { throw new Error("protected-terms: the PDF reader is stubbed out"); }', loader: 'js' }));
  } };
  // the screen is named by absolute path: a relative specifier in this string reads to
  // tools/check-clone-imports.mjs as an import of test/src/…, which does not exist
  const screen = JSON.stringify(join(here, '..', 'src', 'screens', 'Export.tsx').replace(/\\/g, '/'));
  const review = JSON.stringify(join(here, '..', 'src', 'lib', 'review.ts').replace(/\\/g, '/'));
  await build({
    stdin: { contents: `export { default as Export } from ${screen};\nexport { FINISH_LABEL } from ${review};\nexport { renderToString } from 'react-dom/server';\nexport { createElement } from 'react';`, resolveDir: join(here, '..'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [noPdf], outfile: ssr, logLevel: 'silent',
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const R = await import('file:///' + ssr.replace(/\\/g, '/'));
  let n = 0;
  const doc = (text, entities, over = {}) => ({ id: `ssr${++n}`, name: 'Re Client.txt', kind: 'text', badge: 'TXT', state: 'ready', sizeLabel: '', statusLabel: '', text, reviewed: true, engineComplete: true, entities, ...over });
  const render = (file, terms, extra = {}) => {
    store.set('simpler-legal.protected-terms', JSON.stringify(terms));
    const html = R.renderToString(R.createElement(R.Export, { file, onMaskTerms: () => {}, ...extra })).replace(/<!-- -->/g, '');
    const buttons = new Map([...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map((m) => [m[2], /\sdisabled=""/.test(m[1])]));
    return { text: html.replace(/<[^>]+>/g, ''), buttons, say: [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map((m) => `${/\sdisabled=""/.test(m[1]) ? '(off) ' : ''}${m[2]}`).join(' | ') };
  };
  const SENDS = ['Copy redacted text', 'Save as file…'];
  const open = (r) => SENDS.every((b) => r.buttons.get(b) === false);
  const shut = (r) => SENDS.every((b) => r.buttons.get(b) === true);
  const TEXT = 'Kestrel will acquire the target. Anna Tan signed.';
  const anna = row('p', 'Anna Tan', '[Person1]', 'PERSON', 'person');

  const clear = render(doc(TEXT, [anna]), []);
  check(open(clear) && clear.buttons.get('Export receipt') === false, 'CONTROL: with nothing on the list the copy, the .txt and the receipt are open — each check below can fail', clear.say);

  const late = render(doc(TEXT, [anna]), ['Kestrel']);
  check(shut(late) && late.buttons.get('Export receipt') === true, 'a declared term with no row shuts the copy, the .txt and the receipt', late.say);
  check(/no row in its table: Kestrel/.test(late.text) && late.buttons.get('Mask it in this document') === false,
    'the page names the term, says why, and offers the button that masks it', late.text.slice(late.text.indexOf('✗'), late.text.indexOf('✗') + 200));
  // the table does not record why a term has no row: the list may have gained it, or the
  // lawyer may have widened its row in the review, so the page names both
  const CHANGED = /The list changed/;
  check(/Either the list gained it after this document was read, or its row was widened or removed in the review/.test(late.text) && !CHANGED.test(late.text),
    'the page does not claim the list changed — the table does not record which of the two happened', late.text.slice(late.text.indexOf('✗'), late.text.indexOf('✗') + 260));
  check(CHANGED.test('has no row in its table: Kestrel. The list changed after this document was read, so the copied text and the .txt would carry it readable.'),
    'CONTROL: the detector matches the sentence that was there');

  const OB = 'Signed, O’Brien Kessler LLP. Reply to O\'Brien Kessler LLP.';
  // another form: since law 34 an engine row reads the other apostrophe itself, so the hold is
  // met where the safety-net pattern answers for the term (law 11)
  const NT = 'Client ref S1234567D is on file. The schedule repeats S1234­567D. Anna Tan signed.';
  const form = render(doc(NT, syncFloorRows(NT, [anna], PRACTICE)), ['S1234567D']);
  check(shut(form) && /still readable where this document writes it another way/.test(form.text) && form.buttons.get('Mask it in every form') === false,
    'a term the safety-net pattern found in one form and the body writes in another shuts the export, says so, and offers the button', form.say);
  const obForm = render(doc(OB, [row('o', 'O’Brien Kessler LLP', '[Company1]', 'COMPANY', 'org')]), ["O'Brien Kessler LLP"]);
  check(open(obForm) && !/writes it another way/.test(obForm.text),
    'a term the engine found in one form with the other apostrophe in the body: the row masks both, and the page is open', obForm.say);

  const leftBefore = render(doc(TEXT, [anna, { ...row('k', 'Kestrel', '[Company1]', 'COMPANY', 'org'), dead: true, status: 'ignored' }]), ['Kestrel']);
  check(shut(leftBefore) && /not under Protected terms when you made that choice/.test(leftBefore.text) && leftBefore.buttons.get('Mask it in this document') === false && /choose Leave visible/.test(leftBefore.text),
    'a row left readable before the term was on the list shuts the export, says the choice was not about the list, and gives both ways through', leftBefore.say);

  const leftUnder = render(doc(TEXT, [anna, { ...row('k', 'Kestrel', '[Company1]', 'COMPANY', 'protected'), dead: true, status: 'ignored' }]), ['Kestrel']);
  check(open(leftUnder) && /left readable while it sat under Protected terms: Kestrel/.test(leftUnder.text),
    'a row left readable under Protected terms stands, and the page says it is a term on the list', leftUnder.say);
  check(!/left readable while it sat under Protected terms/.test(leftBefore.text),
    'the page does not say that of a row left readable under its engine category (the check above is the control: the sentence is there when it is true)');

  // a live row of the term beside one left readable before the list: the button undoes that
  // choice, and the page says so before it is pressed
  const sib = render(doc(OB, [row('o', 'O’Brien Kessler LLP', '[Company1]', 'COMPANY', 'org'), { ...row('s', "O'Brien Kessler LLP", '[Company2]', 'COMPANY', 'org'), dead: true, status: 'ignored' }]), ["O'Brien Kessler LLP"]);
  check(shut(sib) && /The button masks it in every form, and so masks the row you left readable too/.test(sib.text) && sib.buttons.get('Mask it in this document') === false,
    'a live row beside one left readable before the list shuts the export and says the button masks the row left readable too', sib.say);
  check(!/still readable where this document writes it another way/.test(sib.text) && /still readable where this document writes it another way/.test(form.text),
    'CONTROL: it is not told as another form, which is how it was held before; the page says that of a term that is one');

  const W = 'Project Lantern is the deal. Anna Tan signed.';
  check(open(render(doc(W, [anna, row('w', 'Project Lantern', '[Protected1]', undefined, 'protected')]), ['Lantern'])),
    'a declared "Lantern" inside a masked "Project Lantern" holds nothing on the page');

  const dx = render(doc(TEXT, [anna], { kind: 'docx', badge: 'DOCX', name: 'Re Client.docx', bytes: await makeDocx({ body: para(TEXT) }) }), []);
  check(dx.buttons.get('Name key (.txt)') === true && dx.buttons.get('Export receipt') === true && clear.buttons.get('Name key (.txt)') === false,
    'a .docx page\'s name key and receipt wait for the writer\'s dry run; a text page\'s do not', dx.say);

  // A finish a later change took off (lib/attest.ts recheckFinish) is not a document nobody
  // reviewed: the page says what changed, in the note the Review screen shows, and how to
  // finish again. It said "This document hasn’t been reviewed" until 2026-09-23.
  const NOTE = 'Undoing “Leave visible” on Anna Tan left “Anna Tan” readable in the export, and it was masked when you finished. Export holds this document until you finish again.';
  const reopenedOk = (r) => /Changed since you finished — finish again\./.test(r.text) && r.text.includes(NOTE) && !/hasn’t been reviewed/.test(r.text)
    && r.text.includes(`press “${R.FINISH_LABEL}”`) && r.buttons.get('Open the review') === false && !r.buttons.has('Copy redacted text');
  const reo = render(doc(TEXT, [anna], { reviewed: false, reopened: NOTE }), [], { onReview: () => {} });
  check(reopenedOk(reo), 'a document whose finish came off says it changed since you finished, prints what changed, names the finish button and offers the review — and no export', reo.text.slice(reo.text.indexOf('⚠'), reo.text.indexOf('⚠') + 320));
  const never = render(doc(TEXT, [anna], { reviewed: false }), [], { onReview: () => {} });
  check(!reopenedOk(never) && /hasn’t been reviewed/.test(never.text) && !/Changed since you finished/.test(never.text),
    'CONTROL: the hold every unreviewed document got, this one included, fails that check — and still stands for a document never finished', never.text.slice(never.text.indexOf('⚠'), never.text.indexOf('⚠') + 120));
}

// ── LAW 14: a declared term whose only row is the safety-net pattern's ──
console.log('\n— law 14: a declared term the safety-net pattern also catches —');
{
  const anna = row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person');
  // App's strip (the list as it stood, then the floor rows) and App's answer to the hold's button
  const strip = (text, terms) => syncFloorRows(text, withProtectedTerms(text, [anna], terms), PRACTICE);
  const press = (text, ents, terms) => syncFloorRows(text, withProtectedTerms(text, ents, terms), PRACTICE);
  const input = (text, entities, over = {}) => ({ text, entities, reviewed: true, engineComplete: true, kind: 'text', ...over });

  // 14a — the .docx: the body writes the number as the pattern reads it, the footer another way
  const footerOf = async (r) => (r.bytes ? (await extractDocx(r.bytes)).items.filter((i) => i.kind === 'footer').map((i) => i.text).join(' ') : `held: ${r.held}`);
  const cases = [
    ['a non-breaking hyphen (U+2011) in the footer', '6123-4567', '6123‑4567'],
    ['a soft hyphen inside it in the footer', 'S1234567D', 'S1234­567D'],
    ['a zero-width space inside it in the footer', 'S1234567D', 'S1234567​D'],
  ];
  for (const [label, TERM, FOOT] of cases) {
    const pkg = await makeDocx({ body: para(`Account ${TERM} was opened. Anna Tan signed.`), footer: para(`Client ref ${FOOT}`) });
    const TEXT = await textOf(pkg);
    const ents = strip(TEXT, []);
    const own = ents.filter((e) => termKey(e.text) === termKey(TERM));
    check(own.length === 1 && isFloorRow(own[0]), `${label}: setup — declared after the drop, the term's only row is the safety-net pattern's`, JSON.stringify(own.map((e) => [e.text, e.src])));
    const plan = exportPlan(input(TEXT, ents, { kind: 'docx', bytes: pkg }), [TERM], PRACTICE);
    const wrote = await writeRedactedDocx(pkg, { mask: plan.docx.mask });
    const foot = await footerOf(wrote);
    check(!plan.blocked && foot.startsWith('Client ref ') && !/\d{3}/.test(foot),
      `${label}: the saved .docx masks it with a row of the list's own`, foot);
    const old = await writeRedactedDocx(pkg, { mask: (t) => remask(t, ents, PRACTICE) });
    check(!!old.bytes && /\d{3}/.test(await footerOf(old)) && old.gate.leaks.length === 0,
      `${label}: CONTROL: with the safety-net row taken as answering for the term, as the writer's table had it, the footer ships readable and the gate passes it`, await footerOf(old));
    // one number, one tag: the row carries the safety-net pattern's tag, so the .txt, the .docx
    // body and the footer say the same of it and the key's safety-net section reverses it
    const tag = own[0].tag;
    const body = wrote.bytes ? flowText((await extractDocx(wrote.bytes)).items.filter(inMainFlow)) : '';
    const oneTag = (txt, bodyOut, footOut) => txt.includes(`Account ${tag} was`) && bodyOut.includes(`Account ${tag} was`) && footOut === `Client ref ${tag}`;
    check(oneTag(plan.red, body, foot) && plan.docx.channel.length === 0,
      `${label}: under the safety-net pattern's ${tag} in the .txt, the .docx body and its footer alike, and not listed as a tag only the .docx carries`, `${plan.red} | ${body} | ${foot}`);
    const mintedOwn = [...ents, { key: 'protch2', text: TERM, tag: '[Protected2]', cat: 'protected', prov: 'pattern', occ: 0, status: 'confirmed', cls: 'PROTECTED' }];
    const two = await writeRedactedDocx(pkg, { mask: (t) => remask(t, mintedOwn, PRACTICE) });
    const twoBody = two.bytes ? flowText((await extractDocx(two.bytes)).items.filter(inMainFlow)) : '';
    check(!oneTag(plan.red, twoBody, await footerOf(two)) && (await footerOf(two)) === 'Client ref [Protected2]',
      `${label}: CONTROL: with a [ProtectedN] of the list's own, as the table had it, the .docx says [Protected2] where the .txt says ${tag}`, `${twoBody} | ${await footerOf(two)}`);
  }

  // 14b — the text page, and the hold's button
  const TERM = '6123-4567';
  const TEXT = 'Call 6123-4567 today. The schedule lists 6123‑4567 again. Anna Tan signed.';
  const f0 = strip(TEXT, []);
  const held = exportPlan(input(TEXT, f0), [TERM], PRACTICE);
  check(held.blocked && held.holds.length === 1 && held.holds[0].why === 'other-form',
    'the page is held: the pattern masks one form and the body writes the other', `${JSON.stringify(held.holds)} ${held.red}`);
  const f1 = press(TEXT, f0, held.holds.map((h) => h.term));
  const pressed = exportPlan(input(TEXT, f1), [TERM], PRACTICE);
  const before = exportPlan(input(TEXT, strip(TEXT, [TERM])), [TERM], PRACTICE);
  check(!pressed.blocked && pressed.red === before.red && !/4567/.test(pressed.red),
    'one press lifts the hold, and the export is byte-identical to the term declared before the drop', `${pressed.red} | ${before.red}`);
  check(!exportPlan(input(TEXT, f1), [], PRACTICE).blocked, 'taken off the list after the press, the page is not held');
  // the tag the button gives a late term in a table that already has a safety-net row: the
  // strip adds floor rows after the list, so a term declared before the drop never counted them
  const T2 = 'Kestrel will call 6123-4567 today. Anna Tan signed.';
  const late = strip(T2, []);
  const p2 = exportPlan(input(T2, press(T2, late, ['Kestrel'])), ['Kestrel'], PRACTICE);
  const b2 = exportPlan(input(T2, strip(T2, ['Kestrel'])), ['Kestrel'], PRACTICE);
  check(late.some(isFloorRow) && !p2.blocked && p2.red === b2.red, 'beside a safety-net row, the button gives the term the tag it gets declared before the drop', `${p2.red} | ${b2.red}`);
  const counted = protectedEntities(T2, ['Kestrel'], late.length)[0].tag;
  check(!b2.red.includes(counted), `CONTROL: numbering past every row of the table, floor rows counted, gives ${counted} — a different .txt for the same term`);
  // CONTROL: the button as it was — the floor row upgraded in place
  const inPlace = f0.map((e) => (isFloorRow(e) && termKey(e.text) === termKey(TERM) ? { ...e, cat: 'protected', cls: e.cls ?? 'PROTECTED' } : e));
  const stuck = exportPlan(input(TEXT, inPlace), [TERM], PRACTICE);
  check(stuck.blocked && stuck.holds.length === 1 && stuck.red.includes('6123‑4567'),
    'CONTROL: upgraded in place, the floor row masks nothing new — the page stays held on the form it held on before the press', JSON.stringify(stuck.holds));
  const upgraded = inPlace.find(isFloorRow);
  check(!rowSurvives(stuck.red, upgraded), 'a safety-net row is asked with the footprint whatever its category — it is not a survivor for a form its pattern never matched');
  check(protectedRegex(upgraded.text, 'i').test(stuck.red),
    'CONTROL: the tolerant question the check asked of it finds that form — the survivor that kept the page held with the term off the list');
}

// ── LAW 15: a choice about the body does not govern the parts the review never showed ──
console.log('\n— law 15: a row left readable before the list, and the letterhead —');
{
  const TERM = 'Kestrel';
  const BODY = 'Kestrel Capital LLP will acquire the target. Kestrel Capital LLP pays on completion.';
  const WM = '<w:p><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1" type="#_x0000_t136" style="position:absolute;rotation:315" fillcolor="silver" stroked="f"><v:textpath style="font-family:&quot;Calibri&quot;" string="KESTREL – STRICTLY CONFIDENTIAL"/></v:shape></w:pict></w:r></w:p>';
  const body = para(BODY) +
    '<w:p><w:bookmarkStart w:id="0" w:name="KestrelSPA"/><w:r><w:t>Completion</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>' +
    '<w:p><w:hyperlink w:anchor="KestrelSPA"><w:r><w:t>see completion</w:t></w:r></w:hyperlink></w:p>';
  const pkg = await makeDocx({ body, header: WM + para('Kestrel · Solicitors') });
  const TEXT = await textOf(pkg);
  const longer = row('c', 'Kestrel Capital LLP', '[Company1]', 'COMPANY', 'org');
  const shows = (raw) => {
    const hdr = raw['word/header1.xml'] || '', doc = raw['word/document.xml'] || '';
    return [/Kestrel ·/.test(hdr) && 'letterhead', /string="KESTREL/.test(hdr) && 'watermark', /"KestrelSPA"/.test(doc) && 'bookmark'].filter(Boolean);
  };
  const tables = [
    ['a row left readable under its engine category', [longer, { ...row('k', TERM, '[Company2]', 'COMPANY', 'org'), dead: true, status: 'ignored' }]],
    ['a suspect that arrived readable and was never decided', [longer, { ...row('k', TERM, '[Company2]', 'COMPANY', 'term'), junk: true, dead: true, status: 'pending' }]],
  ];
  for (const [label, ents] of tables) {
    const plan = exportPlan({ text: TEXT, entities: ents, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg }, [TERM], PRACTICE);
    check(!plan.blocked && !/Kestrel/.test(plan.red), `${label}: setup — every "Kestrel" in the body is inside the kept longer name, so nothing on the page is held`, plan.red);
    const s = await writeWith(pkg, ents, [TERM]);
    check(!s.report.held && rawHits(s.raw, TERM).length === 0,
      `${label}: the saved .docx masks the letterhead, the watermark and the "KestrelSPA" bookmark`, String(s.report.held) + ' ' + rawHits(s.raw, TERM).join(' | '));
    check(plan.docx.over.length === 1 && plan.docx.over[0].text === TERM && channelWritten(plan.docx.over, s.report.channels).length === 1,
      `${label}: and reports the row it minted past that choice, which the page and the receipt say in words (law 18)`, JSON.stringify(plan.docx.over.map((e) => e.text)));
    const bare = await writeWith(pkg, ents, [TERM], (t) => remask(t, ents, PRACTICE));
    check(!bare.report.held && shows(bare.raw).join() === 'letterhead,watermark' && bare.report.gate.leaks.length === 0,
      `${label}: CONTROL: with that row taken as governing the whole file, as the writer's table had it, the letterhead and the watermark ship readable and the gate passes them (the bookmark is renamed whatever the table says)`, JSON.stringify(shows(bare.raw)));
  }
}

// ── LAW 16: what masks a row left readable, and what the receipt may say of it ──
console.log('\n— law 16: a row left readable and masked anyway is put down to what masks it —');
// five rows left readable, each masked by something else; law 18 saves this page's receipt
const ANYWAY_TEXT = "Kestrel Capital LLP will acquire the target. Call 6123-4567 on completion. Osprey signed. O’Brien wrote, and O'Brien replied.";
const anywayRows = () => syncFloorRows(ANYWAY_TEXT, [
  row('c', 'Kestrel Capital LLP', '[Company1]', 'COMPANY', 'org'),
  row('o', 'Osprey', '[Company2]', 'COMPANY', 'org'),
  row('p', 'O’Brien', '[Protected1]', 'PROTECTED', 'protected'),
  { ...row('k', 'Kestrel', '[Company3]', 'COMPANY', 'org'), dead: true, status: 'ignored' },
  { ...row('n', '6123-4567', '[Phone1]', 'PHONE', 'contact'), dead: true, status: 'ignored' },
  { ...row('o2', 'Osprey', '[Company4]', 'COMPANY', 'org'), dead: true, status: 'ignored' },
  { ...row('b', "O'Brien", '[Company5]', 'COMPANY', 'org'), dead: true, status: 'ignored' },
  { ...row('l', 'Lantern Partners', '[Company6]', 'COMPANY', 'org'), dead: true, status: 'ignored' },
], PRACTICE);
{
  const plan = exportPlan({ text: ANYWAY_TEXT, entities: anywayRows(), reviewed: true, engineComplete: true, kind: 'text' }, [], PRACTICE);
  const by = Object.fromEntries(plan.maskedAnyway.map((m) => [m.e.key, m.by]));
  check(!plan.blocked && plan.stillIn.length === 0 && plan.maskedAnyway.length === 5, 'setup: five rows left readable, none of them readable in the export', plan.red);
  check(by.k?.within.join() === 'Kestrel Capital LLP' && !by.k.floor && !by.k.list && !by.k.same, '"Kestrel" is masked by the longer name it sits in, and names it', JSON.stringify(by.k));
  check(by.n?.floor === true && !by.n.list && !by.n.same && by.n.within.length === 0, 'the number is masked by the safety-net pattern', JSON.stringify(by.n));
  check(by.o2?.same === true && !by.o2.floor && by.o2.within.length === 0, 'a second "Osprey" row is masked by the first', JSON.stringify(by.o2));
  check(by.b?.list === true && !by.b.same && !by.b.floor, 'the straight-apostrophe "O\'Brien" is masked by the list\'s row, which matches every form', JSON.stringify(by.b));
  check(!!by.l && !by.l.floor && !by.l.list && !by.l.same && by.l.within.length === 0, 'a name the text does not contain is masked by nothing, and is said to be absent', JSON.stringify(by.l));
  check(plan.maskedAnyway.filter((m) => m.by?.floor).length === 1,
    'CONTROL: the page put all five down to the safety-net pattern; one of them is');
}

// ── LAW 17: bookmark names in the ways people write a name in one ──
console.log('\n— law 17: a bookmark name is read in the ways a name is written with nothing between its words —');
{
  const bm = (id, name, text) => `<w:p><w:bookmarkStart w:id="${id}" w:name="${name}"/><w:r><w:t>${text}</w:t></w:r><w:bookmarkEnd w:id="${id}"/></w:p>`;
  const link = (name, text) => `<w:p><w:hyperlink w:anchor="${name}"><w:r><w:t>${text}</w:t></w:r></w:hyperlink></w:p>`;
  // [the declared term, a bookmark Word lets a lawyer type for it]
  const CASES = [
    ['BlackRock Capital', 'BlackRockCapitalSPA'], ['McDonald Holdings', 'McDonaldHoldings_SPA'], ['JPMorgan Chase', 'JPMorganChase'],
    ['Harrow-Leung', 'Harrow_Leung_SPA'], ['Harrow-Leung', 'HarrowLeungSPA'], ['Harrow-Leung', 'HarrowLeung'],
    ["O'Brien Kessler", 'OBrien_Kessler_SPA'], ["O'Brien Kessler", 'OBrienKessler'],
    ['Société Générale', 'SociétéGénérale'.normalize('NFD')], ['KPMG', 'KPMGreport'], ['ACME', 'ACMEloan'],
  ];
  // names a row or a term sits inside of, but not from the start of a word to its end
  const KEEP = ['Standard_terms', 'STANDARD', 'ClauseTwo'];
  const all = [...CASES.map(([, n]) => n), ...KEEP];
  const pkg = await makeDocx({ body: para('Heads of terms.') + all.map((n, i) => bm(i, n, `Clause ${i + 1}`) + link(n, `see clause ${i + 1}`)).join('') });
  const terms = [...new Set(CASES.map(([t]) => t))];
  const tan = [row('t', 'Tan', '[Person1]', 'PERSON', 'person')];
  const namesIn = (raw) => {
    const doc = raw['word/document.xml'] || '';
    return { marks: [...doc.matchAll(/w:bookmarkStart[^>]*w:name="([^"]*)"/g)].map((m) => m[1]), anchors: [...doc.matchAll(/w:hyperlink[^>]*w:anchor="([^"]*)"/g)].map((m) => m[1]) };
  };
  const s = await writeWith(pkg, tan, terms);
  const { marks, anchors } = namesIn(s.raw);
  const shipped = CASES.filter(([, n]) => marks.includes(n) || anchors.includes(n)).map(([, n]) => n);
  check(!s.report.held && shipped.length === 0, `each of ${CASES.length} bookmark names that carries a declared term is renamed, with its link`, `${s.report.held} ${JSON.stringify(shipped)}`);
  check(marks.length === all.length && marks.every((m, i) => m === anchors[i]) && new Set(marks).size === all.length,
    'every link still points at its bookmark, and no two bookmarks share a name', JSON.stringify({ marks, anchors }));
  check(marks.every((m, i) => m === `bm${i + 1}`) && KEEP.every((n) => !marks.includes(n)), '"Standard_terms", "STANDARD" and "ClauseTwo" are renamed like the rest: no reading of a name decides whether it ships', JSON.stringify(marks.slice(CASES.length)));
  const bare = await writeWith(pkg, tan, terms, (t) => remask(t, s.table, PRACTICE));
  const kept = namesIn(bare.raw).marks;
  const missed = CASES.filter(([, n]) => !kept.includes(n)).map(([, n]) => n);
  check(!bare.report.held && missed.length === CASES.length,
    'the same table on a mask that carries no names renames every one of them all the same: the rename reads nothing', `${bare.report.held} ${JSON.stringify(missed)}`);

  const PAGEREF = ' PAGEREF BlackRockCapitalSPA \\h ';
  const fldPkg = await makeDocx({ body: bm(0, 'BlackRockCapitalSPA', 'Clause 1') + `<w:p><w:fldSimple w:instr="${PAGEREF}"><w:r><w:t>2</w:t></w:r></w:fldSimple></w:p>` });
  const fld = await writeWith(fldPkg, [], ['BlackRock Capital']);
  check(!fld.report.held && (fld.raw['word/document.xml'] || '').includes('w:instr=" PAGEREF bm1 \\h "') && !(fld.raw['word/document.xml'] || '').includes('BlackRockCapitalSPA'),
    'a kept PAGEREF to "BlackRockCapitalSPA" follows the bookmark to its new name, and the file does not carry the name', String(fld.report.held).slice(0, 200));
  const fldBare = await writeWith(fldPkg, [], ['BlackRock Capital'], (t) => remask(t, fld.table, PRACTICE));
  check(!fldBare.report.held && !(fldBare.raw['word/document.xml'] || '').includes('BlackRockCapitalSPA'),
    'without the names the field follows the bookmark all the same', String(fldBare.report.held));

  // a row of digits alone is not read this way: compacted, "Clause_1_3" carries 13
  const numPkg = await makeDocx({ body: bm(0, 'Clause_1_3', 'Clause 1.3') + '<w:p><w:fldSimple w:instr=" PAGEREF Clause_1_3 \\h "><w:r><w:t>2</w:t></w:r></w:fldSimple></w:p>' });
  const age = [row('g', '13', '[Age1]', 'AGE', 'id')];
  const num = await writeWith(numPkg, age, []);
  check(!num.report.held && (num.raw['word/document.xml'] || '').includes('w:name="bm1"') && (num.raw['word/document.xml'] || '').includes('PAGEREF bm1 '),
    'a row of digits alone ("13", a child\'s age) holds nothing: the bookmark "Clause_1_3" is renamed like every other and the page reference follows it', String(num.report.held));
  check(num.table.includes(age[0]) && exportPlan({ text: '', entities: age, reviewed: true, engineComplete: true, kind: 'docx', bytes: numPkg }, [], PRACTICE).docx.mask.names.includes('13'),
    'CONTROL: the row is on the names the mask carries, so the line above is the reader declining it');
}

// ── the second pass's cases (owner rulings 18 and 19, 2026-09-24) ──
// One text each, the rows it is read for, what every path writes, and the ruling as it was for
// its CONTROL (RULING_WAS, in the copy of docxWrite.ts the engine bundles) with what the .txt
// then carries. Read on the Export page, its clipboard and its name key (18za); on the .txt, the
// Review preview and the saved .docx's body, header and footer (law 44); on the Compare
// clipboard, compare-refusal.mjs law 24 carries the same texts. `xml`: the paragraph as Word
// writes it, where the text has a tab or an ampersand. Whitespace is compared as one space: the
// saved .docx keeps the <w:tab/> beside the tag that replaced the digits around it.
const SECOND = [
  { label: 'a kept "Kestrel Capital" run into a hashtag, "#kestrelcapitaldeal" (owner ruling 18)', T: 'Tag #kestrelcapitaldeal today. Kestrel Capital signed.',
    rows: () => [row('kc', 'Kestrel Capital', '[Company1]', 'COMPANY', 'org')], want: 'Tag #[Company1]deal today. [Company1] signed.',
    was: 'hash', ships: /#kestrelcapitaldeal/, why: '"#" read as neither a joiner nor a handle\'s first character, as before ruling 18', late: ['Kestrel Capital', 'Tag #kestrelcapitaldeal today. Jane Roe signed.'] },
  { label: 'a kept "Hickson Corp" written "Hickson Corporation" (19a)', T: 'Hickson Corporation appeals. Hickson Corp signed.',
    rows: () => [row('h', 'Hickson Corp', '[Company1]', 'COMPANY', 'org')], want: '[Company1] appeals. [Company1] signed.',
    was: 'long', ships: /Hickson Corporation/, why: 'no designator read written whole, as before ruling 19a', late: ['Hickson Corp', 'Hickson Corporation appeals. Jane Roe signed.'] },
  { label: 'a kept client number "31926819" grouped by an em dash, a minus sign, a tab and " - ", beside one listed by a comma (19b)',
    T: 'Pay 3192—6819, 3192−6819, 3192\t6819 and 3192 - 6819 now. Nos. 3192,6819 stand. Client 31926819.',
    xml: '<w:p><w:r><w:t xml:space="preserve">Pay 3192—6819, 3192−6819, 3192</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">6819 and 3192 - 6819 now. Nos. 3192,6819 stand. Client 31926819.</w:t></w:r></w:p>',
    rows: () => [row('c', '31926819', '[ID1]', 'ID', 'id')], want: 'Pay [ID1], [ID1], [ID1] and [ID1] now. Nos. 3192,6819 stand. Client [ID1].',
    was: 'dsep', ships: /3192—6819/, why: 'a number grouped only by a space, a dot, a slash or a hyphen, as before ruling 19b', late: ['31926819', 'Pay 3192—6819 now. Jane Roe signed.'] },
  { label: 'a kept "Griﬃths" with the ligature in the row, written plain in the text (19c)', T: 'Mr Griffiths signed. Mr Griffiths paid.',
    rows: () => [row('g', 'Griﬃths', '[Person1]', 'PERSON', 'person')], want: 'Mr [Person1] signed. Mr [Person1] paid.',
    was: 'nfkd', ships: /Mr Griffiths signed/, why: 'the letters folded by NFD alone, as before ruling 19c', late: ['Griﬃths', 'Mr Griffiths signed. Jane Roe signed.'] },
  { label: 'a kept "Margaret Tan" written "Margaret&nbspTan", with no semicolon (19d)', T: 'Client: Margaret&nbspTan. Margaret Tan signed.',
    xml: para('Client: Margaret&amp;nbspTan. Margaret Tan signed.'), rows: () => [row('m', 'Margaret Tan', '[Person1]', 'PERSON', 'person')], want: 'Client: [Person1]. [Person1] signed.',
    was: 'nbsp', ships: /Margaret&nbspTan/, why: '"&nbsp" read only with its semicolon, as before ruling 19d', late: ['Margaret Tan', 'Client: Margaret&nbspTan. Jane Roe signed.', para('Client: Margaret&amp;nbspTan. Jane Roe signed.')] },
  { label: '"ISPs" beside a kept "I.S." (19e)', T: 'The ISPs replied. I.S. signed.',
    rows: () => [row('i', 'I.S.', '[Person1]', 'PERSON', 'person')], want: 'The ISPs replied. [Person1] signed.',
    was: 'plural', ships: /\[Person1\]Ps/, why: '"ISPs" cut before its P, as before ruling 19e' },
];

// ── LAW 18: the Export screen, run ──
console.log('\n— law 18: the Export screen, run: its dry run lands and its buttons are pressed —');
{
  // React is swapped, in this one bundle, for a hooks runtime of this file's own: the screen's
  // three hooks delegate to globalThis.__hooks, and JSX builds plain { type, props } trees. No
  // DOM is needed — a button is read off the tree with its disabled and onClick, and pressed by
  // calling onClick, never while it is disabled. A set-state during render renders again before
  // anything commits, as React does; an effect runs on commit when its dependencies changed;
  // settle() lets the .docx dry run (the real writeRedactedDocx) land and renders what it set.
  const run = join(dir, 'export-run.mjs');
  const noPdf = { name: 'no-pdf', setup(b) {
    b.onResolve({ filter: /extract[\\/]pdf$/ }, (args) => ({ path: args.path, namespace: 'no-pdf' }));
    b.onLoad({ filter: /.*/, namespace: 'no-pdf' }, () => ({ contents: 'export function extractPdf() { throw new Error("protected-terms: the PDF reader is stubbed out"); }', loader: 'js' }));
  } };
  const hooksRuntime = { name: 'hooks-runtime', setup(b) {
    b.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, (args) => ({ path: args.path, namespace: 'hooks-runtime' }));
    b.onLoad({ filter: /.*/, namespace: 'hooks-runtime' }, (args) => ({ loader: 'js', contents: args.path === 'react'
      ? 'export const useState = (i) => globalThis.__hooks.useState(i);\nexport const useMemo = (f, d) => globalThis.__hooks.useMemo(f, d);\nexport const useEffect = (f, d) => globalThis.__hooks.useEffect(f, d);'
      : 'export const Fragment = Symbol.for("protected-terms.fragment");\nexport const jsx = (type, props) => ({ type, props });\nexport const jsxs = jsx;' }));
  } };
  const screen = JSON.stringify(join(here, '..', 'src', 'screens', 'Export.tsx').replace(/\\/g, '/'));
  await build({
    stdin: { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [noPdf, hooksRuntime], outfile: run, logLevel: 'silent',
  });
  const { Export } = await import('file:///' + run.replace(/\\/g, '/'));

  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  /** `component`: the screen as the app has it, or a CONTROL's mutant of it (mutantOf) */
  function mount(props, component = Export) {
    const slots = [];
    let dirty = false, tree = null, cur = props;
    const hooks = (effects) => {
      let i = 0;
      return {
        useState(init) {
          const k = i++;
          if (!slots[k]) slots[k] = { v: typeof init === 'function' ? init() : init };
          const s = slots[k];
          return [s.v, (next) => { const v = typeof next === 'function' ? next(s.v) : next; if (!Object.is(v, s.v)) { s.v = v; dirty = true; } }];
        },
        useMemo(f, deps) { const k = i++; if (slots[k] && same(slots[k].deps, deps)) return slots[k].v; const v = f(); slots[k] = { v, deps }; return v; },
        useEffect(f, deps) { const k = i++; if (!(slots[k] && same(slots[k].deps, deps))) effects.push({ k, f, deps }); },
      };
    };
    const render = () => {
      for (let n = 0; n < 50; n++) {
        const effects = [];
        dirty = false;
        globalThis.__hooks = hooks(effects);
        tree = component(cur);
        if (dirty) continue;
        for (const { k, f, deps } of effects) { slots[k]?.cleanup?.(); slots[k] = { deps, cleanup: f() }; }
        if (!dirty) return;
      }
      throw new Error('protected-terms: the Export screen did not settle in 50 renders');
    };
    render();
    const self = {
      get tree() { return tree; },
      get file() { return cur.file; },
      props(p) { cur = { ...cur, ...p }; render(); },
      flush() { if (dirty) render(); },
      async settle(done) { for (let n = 0; n < 1000 && !done(self); n++) { await new Promise((r) => setTimeout(r, 2)); self.flush(); } },
    };
    return self;
  }
  const flat = (n) => (n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(flat).join('') : flat(n.props?.children));
  const buttonsOf = (n, found = []) => {
    if (Array.isArray(n)) for (const c of n) buttonsOf(c, found);
    else if (n && typeof n === 'object') {
      if (n.type === 'button') found.push({ label: flat(n.props.children), disabled: !!n.props.disabled, onClick: n.props.onClick });
      buttonsOf(n.props?.children, found);
    }
    return found;
  };
  const button = (m, label) => buttonsOf(m.tree).find((b) => b.label === label);
  const press = async (m, label) => { const b = button(m, label); if (!b || b.disabled) return false; await b.onClick(); m.flush(); return true; };

  // the browser surfaces the two send buttons reach
  const clip = [], saved = [];
  let blob = null;
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (t) => { clip.push(t); } } }, configurable: true, writable: true });
  globalThis.document = { createElement: () => ({ style: {}, click() { saved.push({ name: this.download, blob }); } }), body: { appendChild() {} } };
  URL.createObjectURL = (b) => { blob = b; return 'blob:protected-terms'; };
  URL.revokeObjectURL = () => {};
  store.set('simpler-legal.practice', PRACTICE);

  let n = 0;
  // a matter file is named after its client, and 18g reads every receipt for the words of the
  // name: "Re Client" could not be told from the receipt's own sentence about client names
  const NAME = 'Harrowgate Osterley';
  const doc = (text, entities, over = {}) => ({ id: `run${++n}`, name: `${NAME}.txt`, kind: 'text', badge: 'TXT', state: 'ready', sizeLabel: '', statusLabel: '', text, reviewed: true, engineComplete: true, entities, ...over });
  // every page this law opens, for 18f, which reads the receipt of each one
  const pages = [];
  const open = (file, terms, extra = {}, component) => { store.set('simpler-legal.protected-terms', JSON.stringify(terms)); const m = mount({ file, ...extra }, component); pages.push({ m, terms }); return m; };
  const TEXT = 'Kestrel will acquire the target. Anna Tan signed.';
  const anna = row('p', 'Anna Tan', '[Person1]', 'PERSON', 'person');

  // 18a — what the copy and the .txt carry
  const f = doc(TEXT, [anna]);
  const red = exportPlan(f, [], PRACTICE).red;
  const a = open(f, []);
  check(await press(a, 'Copy redacted text') && clip.at(-1) === red, 'Copy redacted text puts the export on the clipboard, byte for byte', JSON.stringify(clip.at(-1)));
  check(await press(a, 'Save as file…') && (await saved.at(-1)?.blob.text()) === red && /^redacted-[0-9A-Z]{7}\.txt$/.test(saved.at(-1).name),
    'Save as file… saves the export, under the code', saved.at(-1)?.name);
  check(red !== TEXT && red.includes('[Person1]') && !red.includes('Anna Tan'), 'CONTROL: the export is not the document, so a button that sent the document fails both checks', red);

  // 18b — each hold's button asks for the terms it names, and App's answer opens the page.
  // Another form: a safety-net row answers for the term (law 11); an engine row reads the other
  // apostrophe itself since law 34.
  const SH = 'Client ref S1234567D is on file. The schedule repeats S1234­567D. Anna Tan signed.';
  const SHT = 'S1234567D';
  const holdCases = [
    ['no row', doc(TEXT, [anna]), ['Kestrel'], 'Mask it in this document'],
    ['another form', doc(SH, syncFloorRows(SH, [anna], PRACTICE)), [SHT], 'Mask it in every form'],
    ['left readable before the list', doc(TEXT, [anna, { ...row('k', 'Kestrel', '[Company1]', 'COMPANY', 'org'), dead: true, status: 'ignored' }]), ['Kestrel'], 'Mask it in this document'],
    // law 25: the term glued to a number the pattern takes
    ['glued to a number', doc('Call Tan61234567 today. Anna Tan signed.', syncFloorRows('Call Tan61234567 today. Anna Tan signed.', [anna], PRACTICE)), ['Tan'], 'Mask it in this document'],
  ];
  for (const [label, file, terms, btn] of holdCases) {
    const calls = [];
    let m = null;
    const onMaskTerms = (ts) => { calls.push(ts); m.props({ file: { ...file, entities: syncFloorRows(file.text, withProtectedTerms(file.text, file.entities, ts), PRACTICE) } }); };
    m = open(file, terms, { onMaskTerms });
    check(button(m, 'Copy redacted text')?.disabled === true && button(m, 'Save as file…')?.disabled === true, `${label}: setup — the page is held`);
    await press(m, btn);
    check(JSON.stringify(calls) === JSON.stringify([terms]), `${label}: "${btn}" asks for exactly the term it names`, JSON.stringify(calls));
    check(button(m, 'Copy redacted text')?.disabled === false && !flat(m.tree).includes('✗'),
      `${label}: answered as App answers it (withProtectedTerms over those terms), the page opens`, buttonsOf(m.tree).map((b) => `${b.disabled ? '(off) ' : ''}${b.label}`).join(' | '));
  }
  check(exportPlan({ ...holdCases[0][1], entities: withProtectedTerms(TEXT, [anna], []) }, ['Kestrel'], PRACTICE).blocked,
    'CONTROL: a button that asked for no terms leaves the page held, so the checks above can fail');

  // 18c — the .docx button obeys the page's holds once its dry run has landed
  const pkg = await makeDocx({ body: para(TEXT) });
  const dxText = await textOf(pkg);
  const dx = (terms) => open(doc(dxText, [anna], { kind: 'docx', badge: 'DOCX', name: `${NAME}.docx`, bytes: pkg }), terms);
  const landed = (m) => !button(m, 'Checking the .docx…');
  const clearDx = dx([]);
  await clearDx.settle(landed);
  check(button(clearDx, 'Save redacted .docx…')?.disabled === false,
    'CONTROL: with nothing held the dry run lands and the .docx button opens — so the one below is shut by the hold, not by a dry run that never came');
  const heldDx = dx(['Kestrel']);
  await heldDx.settle(landed);
  check(landed(heldDx) && button(heldDx, 'Save redacted .docx…')?.disabled === true, 'a page held by the list shuts the .docx button as well, after its dry run has landed');
  check(await press(clearDx, 'Save redacted .docx…') && /^redacted-[0-9A-Z]{7}\.docx$/.test(saved.at(-1).name), 'the .docx button saves, under the code', saved.at(-1)?.name);
  const savedBody = flowText((await extractDocx(new Uint8Array(await saved.at(-1).blob.arrayBuffer()))).items.filter(inMainFlow));
  check(savedBody.includes('[Person1]') && !savedBody.includes('Anna Tan'), 'and what it saves is the redacted .docx', savedBody);

  // 18d — a row left readable before the list, masked by the .docx in the letterhead: the page
  // says so once the dry run lands, and the receipt says it in counts
  const lhPkg = await makeDocx({ body: para('Kestrel Capital LLP will acquire the target. Kestrel Capital LLP pays on completion.'), header: para('Kestrel · Solicitors') });
  const lh = doc(await textOf(lhPkg), [row('c', 'Kestrel Capital LLP', '[Company1]', 'COMPANY', 'org'), { ...row('k', 'Kestrel', '[Company2]', 'COMPANY', 'org'), dead: true, status: 'ignored' }],
    { kind: 'docx', badge: 'DOCX', name: `${NAME}.docx`, bytes: lhPkg });
  const m1 = open(lh, ['Kestrel']);
  const OVER = /You left a term on your always-redact list readable in the review before it was on the list: Kestrel \(masked in the \.docx’s headers\)/;
  check(!OVER.test(flat(m1.tree)), 'CONTROL: until the dry run lands nobody knows where the .docx masked it, and the page does not say');
  await m1.settle(landed);
  check(OVER.test(flat(m1.tree)) && /take it off the always-redact list in Settings/.test(flat(m1.tree)),
    'once it lands, the page says the .docx masks a term the lawyer left readable, where, and how to leave it readable there too', flat(m1.tree).slice(flat(m1.tree).indexOf('⚠ You left a term'), flat(m1.tree).indexOf('⚠ You left a term') + 240));
  check(await press(m1, 'Export receipt'), 'its receipt can be saved');
  const lhReceipt = await saved.at(-1).blob.text();
  check(/1 declared term is masked by the saved \.docx with a row of the list's own, in its headers \(1 of them left readable in the review before it was on the list/.test(lhReceipt) && !/Kestrel/.test(lhReceipt),
    'the receipt says the same in counts and names nothing', lhReceipt.split('\n').filter((l) => /always-redact|masked anyway/.test(l)).join(' / '));

  // 18e — law 16's five rows: the page names each with what masks it; the receipt counts them
  const m16 = open(doc(ANYWAY_TEXT, anywayRows()), []);
  check(await press(m16, 'Export receipt'), 'setup: the receipt of law 16\'s page can be saved');
  const r16 = await saved.at(-1).blob.text();
  const line = r16.split('\n').find((l) => /masked anyway/.test(l)) ?? '';
  const NAMES = /Kestrel|6123|Osprey|Brien|Lantern/;
  check(line === '0 left visible · 5 you left readable are masked anyway, not named here (1 by another row of the same term on the always-redact list, 1 by another row of the same name, kept masked, 1 by a longer name kept masked, 1 by the safety-net pattern, 1 not found in the text as written)' && !NAMES.test(r16),
    'the receipt counts the five by what masks them and names none of them — it travels with the copy', line);
  check(NAMES.test('1 you left readable is masked anyway by the safety-net pattern: Kestrel'), 'CONTROL: the line the receipt printed before trips that check');
  const page = flat(m16.tree);
  check(/By a longer name you kept masked, as part of it or as its short form: Kestrel \(by “Kestrel Capital LLP”\)/.test(page) && /By the safety-net pattern: 6123-4567\./.test(page) && /always-redact list, which masks it in every form: O'Brien\./.test(page),
    'the page, on the lawyer\'s own machine, names each one with what masks it', page.slice(page.indexOf('masked anyway.'), page.indexOf('masked anyway.') + 400));

  // 18f — a receipt written while the page is held. Its button is shut then (receiptWait); the
  // lines are still written so that none contradicts the hold, and the .docx line's last
  // clause, "none of them is readable in the copied text or the .txt", is what the hold found
  // false. Reached through the shut button's own handler: no enabled button gets here.
  const hPkg = await makeDocx({ body: para('Osprey will acquire the target. Anna Tan signed.'), header: para('Kestrel · Solicitors') });
  const HT = ['Kestrel', 'Osprey'];
  const hs = await writeWith(hPkg, [anna], HT);
  check(channelWritten(hs.channel, hs.report.channels).length === 2,
    'setup: the .docx carries two rows of the list\'s own, so the .docx line has something to count', JSON.stringify(Object.fromEntries(Object.entries(hs.report.channels).map(([k, v]) => [k, v.tags]))));
  const mh = open(doc(await textOf(hPkg), [anna], { kind: 'docx', badge: 'DOCX', name: `${NAME}.docx`, bytes: hPkg }), HT);
  await mh.settle(landed);
  const shutReceipt = button(mh, 'Export receipt');
  check(landed(mh) && shutReceipt?.disabled === true && button(mh, 'Copy redacted text')?.disabled === true,
    'setup: held by a declared term the body carries readable, with its dry run landed, the receipt button is shut');
  const k0 = saved.length;
  await shutReceipt.onClick();
  mh.flush();
  const hr = saved.length > k0 ? await saved.at(-1).blob.text() : '';
  const NONE = /none of (?:it|them) is readable in the copied text or the \.txt/;
  check(/always-redact list: 1 declared term is readable in this export/.test(hr) && !NONE.test(hr),
    'written anyway, the receipt says the held term is readable in this export and never, beside it, that none is', hr.split('\n').filter((l) => /always-redact/.test(l)).join(' / '));
  check(NONE.test("always-redact list: 2 declared terms are masked by the saved .docx with a row of the list's own, in its body text and headers; none of them is readable in the copied text or the .txt"),
    'CONTROL: the .docx line as it prints without the hold guard trips that check');

  // 18h — the note that the .docx went past a choice made before the list. A number whose
  // engine row was left readable is masked in the .txt by the safety-net pattern, and the .docx
  // now tags it the same: nothing was gone past, and the page said "You left a term … readable
  // … before it was on the list: S1234567D (masked in the .docx's body text and footers)" of a
  // number the .txt masks too, beside "the copied text and the .txt … stand as the review left
  // them" — which left the number readable. On a held page the note named "body text" among the
  // parts the review never showed.
  const NRIC_F2 = 'S1234567D';
  const f2Pkg = await makeDocx({ body: para(`Account ${NRIC_F2} was opened. Anna Tan signed.`), footer: para('Client ref S1234­567D') });
  const f2Text = await textOf(f2Pkg);
  const f2Ents = syncFloorRows(f2Text, [{ ...row('n', NRIC_F2, '[Id1]', 'ID', 'id'), dead: true, status: 'ignored' }, anna], PRACTICE);
  const f2 = open(doc(f2Text, f2Ents, { kind: 'docx', badge: 'DOCX', name: `${NAME}.docx`, bytes: f2Pkg }), [NRIC_F2]);
  await f2.settle(landed);
  const OVER_ANY = /readable in the review before (?:it was|they were) on the list/;
  check(landed(f2) && !OVER_ANY.test(flat(f2.tree)) && /By the safety-net pattern: S1234567D\./.test(flat(f2.tree)) && button(f2, 'Save redacted .docx…')?.disabled === false && button(f2, 'Copy redacted text')?.disabled === false,
    'a number whose engine row was left readable, then declared: the page puts it down to the safety-net pattern, says nothing of the .docx going past a choice, and both saves are open',
    flat(f2.tree).slice(flat(f2.tree).indexOf('masked anyway.'), flat(f2.tree).indexOf('masked anyway.') + 200));
  check(docxMaskTable(f2Ents.filter((e) => !isFloorRow(e)), [NRIC_F2]).over.length === 1,
    'CONTROL: without the safety-net row\'s tag to take, the table mints a row of the list\'s own over that choice — the row the note named');
  const hvPkg = await makeDocx({ body: para(TEXT), header: para('Kestrel · Solicitors') });
  const hvEnts = [anna, { ...row('k', 'Kestrel', '[Company1]', 'COMPANY', 'org'), dead: true, status: 'ignored' }];
  const hv = open(doc(await textOf(hvPkg), hvEnts, { kind: 'docx', badge: 'DOCX', name: `${NAME}.docx`, bytes: hvPkg }), ['Kestrel']);
  await hv.settle(landed);
  check(landed(hv) && /readable in the review that is on your always-redact list: Kestrel/.test(flat(hv.tree)) && !OVER_ANY.test(flat(hv.tree)),
    'held on a term left readable before the list, the page does not also say the .docx masks it only in parts the review never showed');
  const hvw = await writeWith(hvPkg, hvEnts, ['Kestrel']);
  check(docxMaskTable(hvEnts, ['Kestrel']).over.length === 1 && channelWritten(hvw.channel, hvw.report.channels).some((w) => w.kinds.includes('body')),
    'CONTROL: the table does mint that row over the choice, and the .docx writes it into the body text — what the note would have listed among the parts the review never showed');

  // 18j — the tags the export wrote are not words on the page either (law 21): a declared
  // "Card" beside the "[card]" the safety-net pattern wrote was named as a partial name that
  // may survive, and counted in the receipt as one
  const CARD = 'Mr Card paid 4111 1111 1111 1111 on 3 May. Anna Tan signed.';
  const cardEnts = syncFloorRows(CARD, withProtectedTerms(CARD, [anna], ['Card']), PRACTICE);
  const cardPage = open(doc(CARD, cardEnts), ['Card']);
  check(!/Partial names may survive|listed span\(s\) still present|still readable in this copy, whole or in part/.test(flat(cardPage.tree)) && button(cardPage, 'Copy redacted text')?.disabled === false,
    'a declared "Card" beside the [card] the export wrote: the page names no partial name, counts no span still present, and the copy is open');
  // named as the bytes write it since ruling 21's second pass (P1T-5): the "card" of "[card]"
  check(survivingFragments(exportPlan(cardPage.file, ['Card'], PRACTICE).red, cardEnts.filter((e) => !e.dead && !isFloorRow(e))).join().toLowerCase() === 'card',
    'CONTROL: asked of the export\'s bytes, "Card" is a partial name, which the page printed');

  // 18k — a press that leaves its hold in place (law 25). exportPlan offers a button only where
  // pressing it clears the hold (engine.ts pressLifts), and no case is known today where the two
  // disagree: the page's own guard is for the next one. App answers the press here with the
  // table as it was — as each of the five causes of 2026-09-23 did in effect — and the page must
  // put what the lawyer can do where the button was, and never offer that button again however
  // often it renders.
  const GT = 'Call Tan61234567 today. Anna Tan signed.';
  const gFile = doc(GT, syncFloorRows(GT, [anna], PRACTICE));
  const STUCK = /Masking it as a term from this page would leave it readable, so this page offers no button for Tan\. What you can do: open the review, find it in the document, select the whole word it is written into and redact it; or take it off the always-redact list in Settings/;
  const stuckRun = async (component) => {
    const calls = [];
    let m = null;
    const again = () => m.props({ file: { ...m.file, entities: [...m.file.entities] } });
    m = open(gFile, ['Tan'], { onMaskTerms: (ts) => { calls.push(ts); again(); }, onReview: () => {} }, component);
    const offered = !!button(m, 'Mask it in this document');
    await press(m, 'Mask it in this document');
    const after = !!button(m, 'Mask it in this document');
    again();
    return { offered, calls, after, again: !!button(m, 'Mask it in this document'), said: STUCK.test(flat(m.tree)), review: !!button(m, 'Open the review') };
  };
  const g = await stuckRun();
  check(g.offered && g.calls.length === 1 && !g.after && !g.again && g.said && g.review,
    'a press that leaves its hold in place: the button goes, the page says in its place what the lawyer can do, with "Open the review", and the button does not come back when the page renders again',
    JSON.stringify(g));
  const NO_GUARD = [['const stuckKeys = new Set([...plan.stuck, ...holds.map((h) => h.term).filter((t) => pressedKeys.includes(termKey(t)))].map(termKey));', 'const stuckKeys = new Set([...plan.stuck].map(termKey));']];
  const { Export: Unguarded } = await mutantOf(join(here, '..', 'src', 'screens', 'Export.tsx'), NO_GUARD, [noPdf, hooksRuntime],
    { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' });
  const ug = await stuckRun(Unguarded);
  check(ug.offered && ug.after && ug.again && !ug.said,
    'CONTROL: with the page\'s memory of the press taken out, the same button is back after the press and on every render, and nothing says what to do instead', JSON.stringify(ug));

  // 18l — a listed term readable only inside a name the lawyer left readable (P13-2). The hold
  // gave the reason of a term with no row ("the list gained it … or its row was widened"), which
  // says nothing of the name, and the button then masked part of a name the lawyer had chosen to
  // leave readable without a word about it first.
  const IT = 'Kestrel Holdings Ltd agreed. Anna Tan signed.';
  const iFile = doc(IT, syncFloorRows(IT, [anna, { ...row('k', 'Kestrel Holdings Ltd', '[Company1]', 'COMPANY', 'org'), dead: true, status: 'ignored' }], PRACTICE));
  const iCalls = [];
  let im = null;
  im = open(iFile, ['Kestrel'], { onMaskTerms: (ts) => { iCalls.push(ts); im.props({ file: { ...iFile, entities: syncFloorRows(IT, withProtectedTerms(IT, iFile.entities, ts, PRACTICE), PRACTICE) } }); } });
  const ip = flat(im.tree);
  const INSIDE = /A term on your always-redact list is readable in this document only inside a name you left readable in the review: Kestrel in “Kestrel Holdings Ltd”\. That choice was about the name, not about a term on your list, so it is not taken as one, and the export is held rather than decide it for you\. The button masks the term inside that name, and the rest of it stays readable as you chose\./;
  const OTHER_REASON = /has no row in its table|You left a term readable in the review that is on your always-redact list|still readable where this document writes it another way/;
  check(INSIDE.test(ip) && !OTHER_REASON.test(ip) && !!button(im, 'Mask it inside that name') && button(im, 'Copy redacted text')?.disabled === true,
    'held on a term readable only inside a name left readable: the page gives that reason and no other, and says before the press what the press will do to the name', ip.slice(ip.indexOf('✗'), ip.indexOf('✗') + 420));
  await press(im, 'Mask it inside that name');
  const ip2 = flat(im.tree);
  check(JSON.stringify(iCalls) === '[["Kestrel"]]' && button(im, 'Copy redacted text')?.disabled === false && exportPlan(im.file, ['Kestrel'], PRACTICE).red.endsWith('] Holdings Ltd agreed. [Person1] signed.')
    && /By a shorter name you kept masked that stands inside it: Kestrel Holdings Ltd \(by “Kestrel”\)\./.test(ip2)
    && /Masked only in part — the rest of it is readable in the export, as you chose, and the name key lists it with the rows left readable: Kestrel Holdings Ltd\./.test(ip2),
    'pressed, it did what the page said: the term is masked inside the name, the rest of the name is readable, the page opens and says the name is masked in part', ip2.slice(ip2.indexOf('masked anyway.'), ip2.indexOf('masked anyway.') + 260));
  const NO_INSIDE = [[": allInside ? 'inside' :", ": false ? 'inside' :"]];
  const { Export: NoInside } = await mutantOf(join(here, '..', 'src', 'lib', 'engine.ts'), NO_INSIDE, [noPdf, hooksRuntime],
    { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' });
  const ni = flat(open(iFile, ['Kestrel'], { onMaskTerms: () => {} }, NoInside).tree);
  check(OTHER_REASON.test(ni) && !INSIDE.test(ni),
    'CONTROL: without a reason of its own the hold is a term with no row, and the page says the list gained it or its row was widened — the check above refuses that page', ni.slice(ni.indexOf('✗'), ni.indexOf('✗') + 200));

  // The pages of the seventh pass (18o–18t) open here, before 18g reads the receipt of every
  // page this law opened for a name. A screen with a line put back, for their CONTROLs:
  const screenWith = async (source, pairs) => (await mutantOf(join(here, '..', 'src', ...source.split('/')), pairs, [noPdf, hooksRuntime],
    { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' })).Export;
  const reOf = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fileOf = async (m, label) => { const k = saved.length; await press(m, label); return saved.length > k ? await saved.at(-1).blob.text() : ''; };
  const receiptText = async (m) => {
    const b = button(m, 'Export receipt');
    const k = saved.length;
    if (b) { await b.onClick(); m.flush(); }
    return saved.length > k && /^receipt-/.test(saved.at(-1).name) ? await saved.at(-1).blob.text() : '';
  };

  // 18o — a row left readable that a kept name only shares words with (law 30). The page said
  // "By a longer name you kept masked, as part of it or as its short form: Tan Wei Ling (by “Mrs
  // Margaret Tan”)" — which it is not — and sent the lawyer to unmask the client to fix it, while
  // the copy carried "Wei Ling"; the name key did not list the row among those left readable.
  const OVT = 'Mrs Margaret Tan Wei Ling attended the meeting.';
  const ovFile = doc(OVT, [{ ...row('m', 'Mrs Margaret Tan', '[Person1]', 'PERSON', 'person'), dead: true, status: 'ignored' }, row('t', 'Tan Wei Ling', '[Person2]', 'PERSON', 'person')]);
  const ovm = open(ovFile, []);
  const ovp = flat(ovm.tree);
  const OVERLAP = /By a name you kept masked that shares words with it, neither holding the other: Mrs Margaret Tan \(by “Tan Wei Ling”\)\. The words they share go with the name you kept; to leave all of one readable, leave that name visible too\./;
  const OV_PART = /Masked only in part — the rest of it is readable in the export, as you chose, and the name key lists it with the rows left readable: Mrs Margaret Tan\./;
  const OV_WRONG = /By a shorter name you kept masked that stands inside it|By a longer name you kept masked/;
  check(exportPlan(ovFile, [], PRACTICE).red === 'Mrs Margaret [Person2] attended the meeting.' && OVERLAP.test(ovp) && OV_PART.test(ovp) && !OV_WRONG.test(ovp),
    'a row left readable that a kept name shares a word with: the page says they share words, neither holding the other, and that the rest of the row is readable', ovp.slice(ovp.indexOf('masked anyway.'), ovp.indexOf('masked anyway.') + 360));
  const ovTxt = await fileOf(ovm, 'Name key (.txt)');
  const ovJson = JSON.parse((await fileOf(ovm, 'Name key (.json)')) || '{}');
  const ovR = await receiptText(ovm);
  check(ovTxt.split('\n').includes('Mrs Margaret Tan\tin part') && JSON.stringify(ovJson.leftReadable) === JSON.stringify([{ original: 'Mrs Margaret Tan', cls: 'PERSON', inPart: true }])
    && /1 you left readable is masked anyway, not named here \(1 by a name kept masked that shares words with it\), only in part, the rest readable/.test(ovR),
    'both name keys list it with the rows left readable, marked in part, and the receipt counts it the same way without naming it', `${ovTxt.slice(ovTxt.indexOf('# Left readable'))} · ${JSON.stringify(ovJson.leftReadable)}`);
  const ovLen = flat(open(ovFile, [], {}, await screenWith('lib/engine.ts', BY_LENGTH)).tree);
  check(/By a shorter name you kept masked that stands inside it: Mrs Margaret Tan \(by “Tan Wei Ling”\)/.test(ovLen) && !OVERLAP.test(ovLen),
    'CONTROL: sorted by length, as it was, the page calls "Tan Wei Ling" a shorter name inside "Mrs Margaret Tan" — the check above refuses that page');
  check(exportPlan(ovFile, [], PRACTICE).stillIn.length === 0,
    'CONTROL: the rows the export carries whole are none, so a key built from those alone, as it was, had no section for a row the copy carries in part');

  // 18p — a listed term readable in part is held (law 29), and the page says which part
  const PT = 'Mrs Margaret Tan Wei Ling attended the meeting. Anna Tan signed.';
  const ptRows = [anna, row('m', 'Mrs Margaret Tan', '[Person2]', 'PERSON', 'person')];
  const ptFile = doc(PT, ptRows);
  let ptm = null;
  ptm = open(ptFile, ['Tan Wei Ling'], { onMaskTerms: (ts) => ptm.props({ file: { ...ptm.file, entities: syncFloorRows(PT, withProtectedTerms(PT, ptm.file.entities, ts, PRACTICE), PRACTICE) } }) });
  const ptp = flat(ptm.tree);
  const IN_PART = /“In part”: where that term stands, the export masks some of its words — inside a name you kept masked, or by the safety-net pattern — and carries the rest readable; the list asks for all of it\./;
  check(/no row in its table: Tan Wei Ling \(in part\)\./.test(ptp) && IN_PART.test(ptp) && button(ptm, 'Copy redacted text')?.disabled === true,
    'a term listed after the drop, readable only in part beside a kept name: the page is held, marks the term "in part" and says what that means', ptp.slice(ptp.indexOf('✗'), ptp.indexOf('✗') + 420));
  await press(ptm, 'Mask it in this document');
  const ptBefore = exportPlan(doc(PT, syncFloorRows(PT, withProtectedTerms(PT, ptRows, ['Tan Wei Ling'], PRACTICE), PRACTICE)), ['Tan Wei Ling'], PRACTICE).red;
  check(button(ptm, 'Copy redacted text')?.disabled === false && exportPlan(ptm.file, ['Tan Wei Ling'], PRACTICE).red === ptBefore && !/Wei|Ling/.test(ptBefore),
    'one press opens the page with the export the term gets declared before the drop, and no word of it readable', ptBefore);
  const lvp = flat(open(doc(PT, [...ptRows, { ...row('t', 'Tan Wei Ling', '[Person3]', 'PERSON', 'person'), dead: true, status: 'ignored' }]), ['Tan Wei Ling'], { onMaskTerms: () => {} }).tree);
  check(/You left a term readable in the review that is on your always-redact list: Tan Wei Ling \(in part\)\./.test(lvp) && IN_PART.test(lvp),
    'its row left readable before it was listed: held as left readable, and marked in part', lvp.slice(lvp.indexOf('✗ You left'), lvp.indexOf('✗ You left') + 200));
  const ptWas = open(ptFile, ['Tan Wei Ling'], {}, await screenWith('lib/engine.ts', HOLDS_READABLE_ONLY));
  check(button(ptWas, 'Copy redacted text')?.disabled === false && !/Tan Wei Ling/.test(flat(ptWas.tree).slice(0, flat(ptWas.tree).indexOf('Copy redacted text'))),
    'CONTROL: with the hold asked of the readable words alone, as it was, the page opens and names nothing — the copy would carry "Wei Ling"');

  // 18q — a term inside a number or an address left readable is not said to be inside "a name"
  const NT = 'Call +65 6123 4567 today. Anna Tan signed.';
  const ET = 'Write to j.doe@kestrelcapital.com today. Anna Tan signed.';
  const floorOff = (t) => doc(t, syncFloorRows(t, [anna], PRACTICE).map((e) => (isFloorRow(e) ? { ...e, dead: true, status: 'ignored' } : e)));
  const ntm = open(floorOff(NT), ['6123 4567'], { onMaskTerms: () => {} });
  const ntp = flat(ntm.tree);
  const etp = flat(open(floorOff(ET), ['kestrelcapital'], { onMaskTerms: () => {} }).tree);
  const NAME_WORDS = /inside a name|that name|about the name/;
  check(/only inside a number you left readable in the review: 6123 4567 in “\+65 6123 4567”\. That choice was about the number, not about a term on your list/.test(ntp)
    && /The button masks the term inside that number, and the rest of it stays readable as you chose\./.test(ntp) && !!button(ntm, 'Mask it inside that number') && !NAME_WORDS.test(ntp)
    && /only inside an address you left readable in the review: kestrelcapital in “j\.doe@kestrelcapital\.com”\. That choice was about the address/.test(etp) && !NAME_WORDS.test(etp),
    'a listed term inside a phone number or an address left readable: the hold and its button name a number and an address, never a name', ntp.slice(ntp.indexOf('✗'), ntp.indexOf('✗') + 300));
  const ntName = flat(open(floorOff(NT), ['6123 4567'], { onMaskTerms: () => {} }, await screenWith('screens/Export.tsx', [["if (isFloorRow(e)) return e.tag === '[email]' ? 'address' : 'number';", "if (isFloorRow(e)) return 'name';"]])).tree);
  check(/only inside a name you left readable/.test(ntName) && /that name/.test(ntName), 'CONTROL: with every row called a name, as it was, the page says the number is a name — the check above refuses it');

  // 18r — a press that leaves ANY hold in place (P1T-8). 18k pins the no-row hold's button by
  // its one label; a button that came back under another label ("Mask them …") passed it, and
  // the other three holds were pinned by nothing. Each is pressed with App answering with the
  // table as it was: no button that masks may stand after, and no sentence that describes one.
  const stuckAny = async (f, terms, label, component) => {
    let m = null;
    const again = () => m.props({ file: { ...m.file, entities: [...m.file.entities] } });
    m = open(f, terms, { onMaskTerms: () => again(), onReview: () => {} }, component);
    const before = flat(m.tree);
    const offered = !!button(m, label);
    await press(m, label);
    again();
    const after = flat(m.tree);
    const PROMISE = /The button masks|the button does that here/;
    return { offered, masks: buttonsOf(m.tree).map((b) => b.label).filter((l) => /^Mask /.test(l)), said: new RegExp(`so this page offers no button for ${reOf(terms[0])}\\.`).test(after), review: !!button(m, 'Open the review'), promised: PROMISE.test(before), promise: PROMISE.test(after), label: !!button(m, label) };
  };
  const stuckCases = [
    ['no row', gFile, ['Tan'], 'Mask it in this document', false],
    ['another form', doc(SH, syncFloorRows(SH, [anna], PRACTICE)), [SHT], 'Mask it in every form', true],
    ['left readable before the list', doc(TEXT, [anna, { ...row('k', 'Kestrel', '[Company1]', 'COMPANY', 'org'), dead: true, status: 'ignored' }]), ['Kestrel'], 'Mask it in this document', true],
    ['inside a name left readable', iFile, ['Kestrel'], 'Mask it inside that name', true],
  ];
  for (const [what, f, terms, label, promised] of stuckCases) {
    const r = await stuckAny(f, terms, label);
    check(r.offered && !r.masks.length && r.said && r.review && r.promised === promised && !r.promise,
      `${what}: after a press that leaves the hold in place, no button that masks stands on the page, nothing says a button will, and the page says what the lawyer can do instead`, JSON.stringify(r));
  }
  const X17 = await stuckAny(gFile, ['Tan'], 'Mask it in this document', await screenWith('screens/Export.tsx', [['{onMaskTerms && pressable(heldNoRow).length > 0 && <>', '{onMaskTerms && heldNoRow.length > 0 && <>']]));
  check(X17.masks.join() === 'Mask them in this document' && !X17.label,
    'CONTROL: with the no-row button asked of every held term, as it was, the button is back after the press as "Mask them …" — which 18k\'s look-up by one label missed, and the check above does not', JSON.stringify(X17));
  const X13 = await stuckAny(iFile, ['Kestrel'], 'Mask it inside that name', await screenWith('screens/Export.tsx', [['{go.length > 0 && <> The button masks', '{true && <> The button masks']]));
  check(X13.promise && !X13.masks.length, 'CONTROL: with the inside hold\'s sentence shown whatever its button, it still says "The button masks" with no button on the page — the check above refuses it');

  // 18s — a term that stands on its own AND inside a name left readable (P1T-9): held as a term
  // with no row, and the page says what the press does to the name
  const MXT = 'Kestrel Holdings Ltd agreed. Kestrel paid. Anna Tan signed.';
  const mxFile = doc(MXT, syncFloorRows(MXT, [anna, { ...row('k', 'Kestrel Holdings Ltd', '[Company1]', 'COMPANY', 'org'), dead: true, status: 'ignored' }], PRACTICE));
  const mxHolds = exportPlan(mxFile, ['Kestrel'], PRACTICE).holds;
  const mxp = flat(open(mxFile, ['Kestrel'], { onMaskTerms: () => {} }).tree);
  const MIXED = /has no row in its table: Kestrel\..* Where it stands inside a name you left readable in the review — Kestrel in “Kestrel Holdings Ltd” — the button masks it there too, and the rest of that name stays readable as you chose\./;
  check(JSON.stringify(mxHolds) === '[{"term":"Kestrel","why":"no-row","inside":["Kestrel Holdings Ltd"],"partly":false}]' && MIXED.test(mxp) && !/only inside a name/.test(mxp),
    'a term readable on its own and inside a name left readable: held as a term with no row, never "only inside", and the page says the press masks it inside the name too', mxp.slice(mxp.indexOf('✗'), mxp.indexOf('✗') + 480));
  const mxWas = flat(open(mxFile, ['Kestrel'], { onMaskTerms: () => {} }, await screenWith('lib/engine.ts', INSIDE_ANYWHERE)).tree);
  check(/readable in this document only inside a name you left readable/.test(mxWas) && !MIXED.test(mxWas),
    'CONTROL: with "inside" asked of any one place, the page says a term that also stands alone is readable only inside the name — the check above refuses it');

  // 18t — what the receipt and the page say the check of the written .docx reads, against the
  // writer as it stands. Each claim and each limit is asserted of the writer first, so a writer
  // that one day reads more, or less, fails here and the sentence gets said again. The round-4
  // sentence said a namespace declaration or a compatibility list was not read at all, and that
  // a name run together was not looked for in text a reader sees — both false once the writer
  // read the markup and masked run-together names in text (W6-4, owner ruling 1 of 2026-09-23)
  // — and that a part the writer does not know could keep a watermark's text, which holds it
  // (W4-F1). Both texts are pinned in words that fail on that wording (the CONTROL below).
  const MT = row('mt', 'Margaret Tan', '[Person1]', 'PERSON', 'person');
  const KC = row('kc', 'Kestrel Capital', '[Company1]', 'COMPANY', 'org');
  const ONG = row('o', 'Ong', '[Person2]', 'PERSON', 'person');
  const acme = (xml) => [{ name: 'word/acme.xml', xml }];
  const docxDoc = async (pkg, ents) => doc(await textOf(pkg), ents, { kind: 'docx', badge: 'DOCX', name: `${NAME}.docx`, bytes: pkg, docx: await extractDocx(pkg) });
  const allXml = async (bytes) => { const z = await readZip(bytes); let a = ''; for (const n of z.names) if (/\.xml$|\.rels$/.test(n)) a += dec(await z.read(n)); return a; };
  const SB = 'Margaret Tan signed for Kestrel Capital. Ong agreed.';
  const AX = ' xmlns:acme="urn:acme-addin"';
  const wrote = async (parts, ents = [MT, KC, ONG]) => {
    const pkg = await makeDocx(parts);
    const w = await writeRedactedDocx(pkg, { mask: exportPlan(await docxDoc(pkg, ents), [], PRACTICE).docx.mask });
    return { held: w.held ?? '', out: w.bytes ? await allXml(w.bytes) : null };
  };
  const inBody = (attrs, text = SB) => para(text).replace('<w:p>', `<w:p${attrs}>`);
  // what the writer masks: a name run together in text a reader sees, in any case
  const tx = await wrote({ body: para(`${SB} Paid to KestrelCapital.`), header: para('KestrelCapital · kestrelcapital.com · Ong12') });
  check(tx.out !== null && tx.out.includes('Paid to [Company1].') && tx.out.includes('[Company1] · [Company1].com · [Person2]12') && !/kestrelcapital|ong12/i.test(tx.out),
    'setup: the writer masks a name run together in text a reader sees, in any case, under the row\'s tag — in the body and in a header', tx.out === null ? tx.held : '');
  // what it holds, and says where: the same names in the file's own code
  const inCode = [
    ['an attribute, small letter first', inBody(`${AX} acme:client="margaretTan"`), /w:p@acme:client: "margaretTan" still carries "Margaret Tan"/],
    ['an attribute, capital first', inBody(`${AX} acme:client="MargaretTan"`), /w:p@acme:client: "MargaretTan" still carries "Margaret Tan"/],
    ['a namespace declaration', inBody(' xmlns:acme="urn:kestrelcapital" acme:id="1"'), /a namespace declaration \(w:p@xmlns:acme\)/],
    ['a namespace prefix', inBody(' xmlns:margaretTan="urn:acme-addin" margaretTan:id="1"'), /xmlns:margaretTan|margaretTan:id/],
    ['an element\'s name', inBody(AX).replace('<w:r>', '<acme:KestrelCapital acme:id="1"/><w:r>'), /the name of an element <acme:KestrelCapital>/],
    ['a compatibility list', inBody(' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="kestrelcapital"'), /a compatibility list \(w:p@mc:Ignorable\)/],
  ];
  const notHeld = [];
  for (const [where, body, says] of inCode) { const r = await wrote({ body }); if (r.out !== null || !says.test(r.held)) notHeld.push(`${where}: ${r.out !== null ? 'written' : r.held.slice(r.held.indexOf('What the check found'), r.held.indexOf('What the check found') + 200)}`); }
  check(!notHeld.length,
    'setup: a name run together in the file\'s own code — an attribute, a namespace declaration, a prefix, an element\'s name, a compatibility list — is not masked but holds the file, and the hold says where', notHeld.join(' | '));
  // the limits the sentence states, each asserted of the writer. In a code word that starts with
  // a small letter a name counts from RUN_FLOOR letters and digits: a five-letter row is not
  // found there, a six-letter one is, and the same short name with a capital holds. A telephone
  // number an add-in wrote into a body paragraph's attribute holds the file, and the hold names
  // the attribute; the same number in the text alone is masked and the file written (owner
  // ruling 11 of 2026-09-24 — the sentence said such a number "is not found", true of the
  // writer until it read an add-in's attributes). A part the writer does not know keeps an
  // address on the file format's own hosts in an attribute when each word after the host is one
  // an attribute may hold, a surname in small letters included, and holds on a capital; between
  // its tags it keeps the format's own address words and holds on a plain small-letter word
  // after the host as it does on the capital (owner ruling 12 of 2026-09-24: "…/matters/marsh"
  // between its tags was kept until then). It keeps a plain small-letter word in an attribute
  // and holds on the same word alone between its tags.
  const FIVE = row('f5', 'Kiran', '[Person3]', 'PERSON', 'person');
  const SIX = row('s6', 'Osprey', '[Company2]', 'COMPANY', 'org');
  const lim = {
    ong: await wrote({ body: inBody(`${AX} acme:client="ongFile"`) }),
    Ong: await wrote({ body: inBody(`${AX} acme:client="OngFile"`) }),
    five: await wrote({ body: inBody(`${AX} acme:client="kiranfile"`, 'Kiran met Osprey.') }, [FIVE, SIX]),
    six: await wrote({ body: inBody(`${AX} acme:client="ospreyfile"`, 'Kiran met Osprey.') }, [FIVE, SIX]),
    tel: await wrote({ body: inBody(`${AX} acme:tel="+65 6123 4567"`) + para('Call +65 6123 4567 today.') }),
    telText: await wrote({ body: para(SB) + para('Call +65 6123 4567 today.') }),
    host: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:src="http://purl.org/matters/Delia Marsh"/></acme:root>') }),
    hostLow: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note>http://purl.org/matters/marsh</acme:note></acme:root>') }),
    hostAttr: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:src="http://purl.org/matters/marsh"/></acme:root>') }),
    hostOwn: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note>http://purl.org/dc/elements/1.1/</acme:note></acme:root>') }),
    hostCap: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note>http://purl.org/matters/Marsh</acme:note></acme:root>') }),
    alone: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note>marsh</acme:note></acme:root>') }),
    word: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:kind="note"/></acme:root>') }),
    between: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note>note</acme:note></acme:root>') }),
  };
  check(RUN_FLOOR === 6 && !!lim.ong.out?.includes('acme:client="ongFile"') && lim.Ong.out === null && /w:p@acme:client: "OngFile" still carries "Ong"/.test(lim.Ong.held)
    && !!lim.five.out?.includes('acme:client="kiranfile"') && lim.six.out === null && /w:p@acme:client: "ospreyfile" still carries "Osprey"/.test(lim.six.held),
    'setup: in a code word that starts with a small letter a name counts from six letters and digits — "ongFile", and a five-letter row in "kiranfile", are kept; a six-letter row in "ospreyfile" holds, and so does "OngFile"',
    JSON.stringify({ floor: RUN_FLOOR, ong: !!lim.ong.out, Ong: !!lim.Ong.out, five: !!lim.five.out, six: !!lim.six.out }));
  check(lim.tel.out === null && /\(the attribute w:p@acme:tel\), a number the safety net masks in the text/.test(lim.tel.held)
    && !!lim.telText.out && lim.telText.out.includes('Call ') && !lim.telText.out.includes('6123 4567'),
    'setup: a telephone number in an add-in\'s attribute on a body paragraph holds the file and the hold names the attribute; the same number in the text alone is masked and the file written',
    JSON.stringify({ tel: lim.tel.out === null ? lim.tel.held.slice(-300) : 'written', telText: lim.telText.out === null ? lim.telText.held.slice(-200) : 'written' }));
  const UNKNOWN = /acme\.xml, a part of the file this app does not know, holds text/;
  const kh = (r) => (r.out === null ? (UNKNOWN.test(r.held) ? 'held' : r.held.slice(0, 120)) : 'kept');
  check(!!lim.hostAttr.out?.includes('acme:src="http://purl.org/matters/marsh"') && !!lim.hostOwn.out?.includes('<acme:note>http://purl.org/dc/elements/1.1/</acme:note>')
    && kh(lim.hostLow) === 'held' && kh(lim.hostCap) === 'held' && kh(lim.host) === 'held' && kh(lim.alone) === 'held'
    && !!lim.word.out?.includes('acme:kind="note"') && kh(lim.between) === 'held',
    'setup: a part the writer does not know keeps an address on the file format\'s own hosts whose words after the host are code words in an attribute ("…/matters/marsh") and the format\'s own address words between its tags ("http://purl.org/dc/elements/1.1/"); it holds on "…/matters/marsh" between its tags, as on "…/matters/Marsh" and "…/matters/Delia Marsh"; it keeps a plain small-letter word in an attribute and holds on the same word between its tags',
    JSON.stringify(Object.fromEntries(['hostAttr', 'hostOwn', 'hostLow', 'hostCap', 'host', 'alone', 'word', 'between'].map((k) => [k, kh(lim[k])]))));
  // The fields the sentence names, each asserted of the writer: a property, an author and text
  // brought in from another file go with what they showed; a cross-reference to text, a date and
  // a merge field are written out as the text they showed; the ones it keeps live keep their
  // code. It said "a field that shows who wrote the file or where it is saved" and nothing of
  // the rest, so a lawyer read that a TITLE field's text was in the copy (P1T-3).
  const SHOWN = 'Osprey Merger Memo';
  const fld = (instr) => `${para(SB)}<w:p><w:bookmarkStart w:id="1" w:name="_Ref1"/><w:fldSimple w:instr=" ${instr} "><w:r><w:t>${SHOWN}</w:t></w:r></w:fldSimple><w:bookmarkEnd w:id="1"/></w:p>`;
  const cfld = (instr) => `${para(SB)}<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${SHOWN}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  const fieldsWrong = [];
  for (const f of ['TITLE', 'SUBJECT', 'KEYWORDS', 'COMMENTS', 'DOCPROPERTY Client', 'INFO Title', 'AUTHOR', 'USERNAME', 'LASTSAVEDBY', 'FILENAME', 'TEMPLATE', 'INCLUDETEXT x.docx', 'INCLUDEPICTURE x.png', 'LINK Excel x.xlsx']) {
    for (const [how, body] of [['simple', fld(f)], ['complex', cfld(f)]]) { const r = await wrote({ body }); if (r.out === null || r.out.includes(SHOWN)) fieldsWrong.push(`${f} (${how}): ${r.out === null ? 'held' : 'its text is in the copy'}`); }
  }
  for (const f of ['REF _Ref1', 'DATE', 'MERGEFIELD Client']) { const r = await wrote({ body: fld(f) }); if (r.out === null || !r.out.includes(SHOWN) || r.out.includes(` ${f} `)) fieldsWrong.push(`${f}: ${r.out === null ? 'held' : 'not written out as its text'}`); }
  for (const f of ['PAGE', 'NUMPAGES', 'TOC', 'SEQ Figure', 'STYLEREF Heading1', 'PAGEREF _Ref1', 'NOTEREF _Ref1', 'SYMBOL 183']) { const r = await wrote({ body: fld(f) }); if (r.out === null || !r.out.includes(`w:instr=" ${f} "`)) fieldsWrong.push(`${f}: ${r.out === null ? 'held' : 'not live'}`); }
  check(!fieldsWrong.length,
    'setup: a field that shows a property, an author or the user, the file\'s name or template, or brings in another file goes with what it showed; a cross-reference to text, a date and a merge field are written out as their text; page, contents, numbering, heading, page and note references and symbols stay live',
    fieldsWrong.join(' | '));
  // The word breaks, asserted of the writer in the body it writes: a word all in upper case has
  // no break inside it, so a four-letter row is not found in "LIWUCORP" (P1T-6); "XYZReport"
  // breaks after "XYZ". In text a reader sees a row is never read inside a plain word of
  // letters, apart or run together ("Margaret Tanner", "MargaretTanner"), and is read before a
  // capital ("MargaretTanLLP") and before an ending from the closed list ("MargaretTans"); in
  // the file's code the round-5 reading stands and "MargaretTanner" in an add-in's attribute
  // holds the file (owner ruling 8 of 2026-09-24; "MargaretTanner" in the text was masked
  // "[Person1]ner" until then). The sentence gives no name as its example: the receipt carries
  // no word of a name on its table (18g), and "capital" and "Margaret Tan" in it failed that on
  // this law's own pages.
  const LW = row('lw', 'Li Wu', '[Person4]', 'PERSON', 'person');
  const KP = row('kp', 'XYZ', '[Company3]', 'COMPANY', 'org');
  const brk = {
    caps: await wrote({ body: para('LIWUCORP and TRUSTLIWU paid LiWuCorp. Li Wu signed.') }, [LW]),
    kpmg: await wrote({ body: para('See XYZReport. XYZ signed.') }, [KP]),
    tanner: await wrote({ body: para('Margaret Tanner met Margaret Tan. MargaretTanner wrote. MargaretTanLLP wrote. MargaretTans wrote.') }, [MT]),
    tannerCode: await wrote({ body: inBody(`${AX} acme:client="MargaretTanner"`, 'Margaret Tan signed.') }, [MT]),
  };
  check(!!brk.caps.out?.includes('LIWUCORP and TRUSTLIWU paid [Person4]Corp. [Person4] signed.') && !!brk.kpmg.out?.includes('See [Company3]Report. [Company3] signed.')
    && !!brk.tanner.out?.includes('Margaret Tanner met [Person1]. MargaretTanner wrote. [Person1]LLP wrote. [Person1]s wrote.')
    && brk.tannerCode.out === null && /w:p@acme:client: "MargaretTanner" still carries "Margaret Tan"/.test(brk.tannerCode.held),
    'setup: "LIWUCORP" and "TRUSTLIWU" keep a row "Li Wu" readable where "LiWuCorp" masks it; "XYZReport" breaks after "XYZ"; in the text "Margaret Tanner" and "MargaretTanner" are not read for "Margaret Tan", "MargaretTanLLP" and "MargaretTans" are; "MargaretTanner" in an add-in\'s attribute holds',
    JSON.stringify(Object.fromEntries(Object.entries(brk).map(([k, r]) => [k, r.out === null ? r.held.slice(r.held.indexOf('What the check found'), r.held.indexOf('What the check found') + 120) : (r.out.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).slice(-1)[0]]))));
  // Owner rulings 8, 9, 10 and 11 of 2026-09-24 as the sentence states them, each asserted of
  // the writer in the body it writes. In text a name run into a plain word of letters is
  // written readable and the same name inside an address or a handle is masked; a row of digits
  // is masked inside a longer number and across one separator, and not across a comma; a name
  // written with escapes is masked with them. And the limits it names, each written: letters
  // spaced apart, a name split between an equation's parts, a number under Word's own prefix or
  // with no prefix on a shape, an attribute's name under Word's own namespace. The unprefixed
  // number on a w: element holds (W3-7), so "Office's elements other than Word's own text
  // markup" is the line. The sentence said a run-together name was read "anywhere inside a word"
  // with one short-word exception and that no add-in number was found (both false this round).
  const ACC = row('acc', '31926819', '[ID1]', 'ID', 'id');
  const KS = row('ks', 'Kestrel', '[Company4]', 'COMPANY', 'org');
  const M_NS = ' xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
  const TEL = '+65 6123 4567';
  const XC = row('xc', 'XYZ Corp', '[Company5]', 'COMPANY', 'org');
  const GR = row('gr', 'Griffiths', '[Person6]', 'PERSON', 'person');
  const RT = row('rt', 'Ren\u00e9 Tan', '[Person7]', 'PERSON', 'person');
  // Proofpoint v3 writes "%" as "*" and lists it after "__;" ("JSU" is "%%"): "Ren%E9%20Tan"
  const PP_V3 = 'Profile: https://urldefense.com/v3/__https://old.example.com/people/Ren*E9*20Tan.html__;JSU!!abc$';
  const sc8 = {
    plain: await wrote({ body: para('Paid kestrelcapitalfund via www.kestrelcapitalfund.com and @kestrelcapitalfund.') }),
    digits: await wrote({ body: para('Pay GB29NWBK60161331926819, 3192 6819, 3192-6819 or 3192,6819.') }, [MT, ACC]),
    pct: await wrote({ body: para('Filed at https://dms.example.com/Margaret%20Tan/brief and Margaret&amp;nbsp;Tan.') }),
    spaced: await wrote({ body: para('Signed: M a r g a r e t  T a n.') }),
    eq: await wrote({ body: para('Kestrel signed.') + `<w:p><m:oMath${M_NS}><m:f><m:num><m:r><m:t>Kes</m:t></m:r></m:num><m:den><m:r><m:t>trel</m:t></m:r></m:den></m:f></m:oMath></w:p>` }, [KS]),
    wTel: await wrote({ body: inBody(` w:tel="${TEL}"`) }),
    shapeTel: await wrote({ body: `${para(SB)}<w:p><w:r><w:pict><v:shape id="s1" tel="${TEL}" style="width:10pt;height:10pt"/></w:pict></w:r></w:p>` }),
    bareTel: await wrote({ body: inBody(` tel="${TEL}"`) }),
    wName: await wrote({ body: inBody(' w:MargaretTan="1"') }),
    // the second pass (D1J-1, -3, -4, -6, D1L-2, -3, -5, -7): each limit the sentence now names
    emDash: await wrote({ body: para('Pay 3192\u20146819, 3192\u20136819 or 3192 - 6819.') }, [MT, ACC]),
    longForm: await wrote({ body: para('XYZ Corporation signed. XYZ Corp paid.') }, [XC]),
    hyphen: await wrote({ body: para('Margaret Tan signed. Later Marga-ret Tan agreed.') }),
    lig: await wrote({ body: para('Mr Gri\ufb03ths signed. Mr Griffiths paid.') }, [GR]),
    ligCode: await wrote({ body: inBody(`${AX} acme:owner="Gri\ufb03ths"`, 'Mr Griffiths paid.') }, [GR]),
    ligCodePlain: await wrote({ body: inBody(`${AX} acme:owner="Griffiths"`, 'Mr Griffiths paid.') }, [GR]),
    refs: await wrote({ body: para('Client: Margaret&amp;nbspTan and Margaret&amp;amp;nbsp;Tan.') }),
    w14num: await wrote({ body: `<w:p><w14:x xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">123456789</w14:x><w:r><w:t xml:space="preserve">${SB}</w:t></w:r></w:p>` }),
    addinNum: await wrote({ body: `<w:p><acme:x${AX}>123456789</acme:x><w:r><w:t xml:space="preserve">${SB}</w:t></w:r></w:p>` }),
    unkShort: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:matter="44179"/></acme:root>') }, [MT, KC, ONG, row('m5', '44179', '[ID2]', 'ID', 'id')]),
    unkSix: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:matter="319268"/></acme:root>') }, [MT, KC, ONG, row('m6', '319268', '[ID2]', 'ID', 'id')]),
    draftAttr: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:src="http://purl.org/matters/draft"/></acme:root>') }),
    draftCap: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:src="http://purl.org/matters/Draft"/></acme:root>') }),
    draftLow: await wrote({ body: para(SB), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note>http://purl.org/matters/draft</acme:note></acme:root>') }),
    ppDocx: await wrote({ body: para(PP_V3) }, [RT]),
  };
  const sc8Want = {
    plain: (r) => !!r.out?.includes('Paid kestrelcapitalfund via www.[Company1]fund.com and @[Company1]fund.'),
    digits: (r) => !!r.out?.includes('Pay GB29NWBK601613[ID1], [ID1], [ID1] or 3192,6819.'),
    pct: (r) => !!r.out && !/Margaret|%20Tan|&amp;nbsp;Tan/.test(r.out) && r.out.includes('https://dms.example.com/[Person1]/brief'),
    spaced: (r) => !!r.out?.includes('Signed: M a r g a r e t  T a n.'),
    eq: (r) => !!r.out?.includes('<m:t>Kes</m:t>') && r.out.includes('<m:t>trel</m:t>') && r.out.includes('[Company4] signed.'),
    wTel: (r) => !!r.out?.includes(`w:tel="${TEL}"`),
    shapeTel: (r) => !!r.out?.includes(`tel="${TEL}"`),
    bareTel: (r) => r.out === null && /w:p@tel/.test(r.held),
    wName: (r) => !!r.out?.includes('w:MargaretTan="1"'),
    // owner ruling 19 (lane W, 2026-09-24) moved these five: a number grouped by an em dash or
    // " - " is masked (19b), "XYZ Corporation" is masked whole (19a), the ligature is folded
    // (19c), "&nbsp" with no semicolon is read as a space (19d); and a ligature in code, a number
    // in Word's own w14 markup and a five-digit number in an add-in's part now hold (19f, 19g)
    emDash: (r) => !!r.out?.includes('Pay [ID1], [ID1] or [ID1].'),
    longForm: (r) => !!r.out?.includes('[Company5] signed. [Company5] paid.'),
    hyphen: (r) => !!r.out?.includes('[Person1] signed. Later Marga-ret Tan agreed.'),
    lig: (r) => !!r.out?.includes('Mr [Person6] signed. Mr [Person6] paid.'),
    ligCode: (r) => r.out === null && /acme:owner/.test(r.held),
    ligCodePlain: (r) => r.out === null && /Griffiths/.test(r.held),
    refs: (r) => !!r.out?.includes('Client: [Person1] and Margaret&amp;amp;nbsp;Tan.'),
    w14num: (r) => r.out === null && /w14:x/.test(r.held),
    addinNum: (r) => r.out === null && /<acme:x>/.test(r.held),
    unkShort: (r) => r.out === null,
    unkSix: (r) => r.out === null,
    draftAttr: (r) => !!r.out?.includes('acme:src="http://purl.org/matters/draft"'),
    draftCap: (r) => r.out === null,
    draftLow: (r) => r.out === null,
    ppDocx: (r) => r.out === null,
  };
  const sc8Bad = Object.keys(sc8Want).filter((k) => !sc8Want[k](sc8[k]));
  check(!sc8Bad.length,
    'setup: in text "kestrelcapitalfund" is written readable and the same name in an address and a handle is masked; a row of digits is masked inside an IBAN and across a space or a hyphen, not across a comma; "Margaret%20Tan" and a typed "&nbsp;" are masked with the escapes; letters spaced apart, a name split across a fraction, a number in w:tel or on a shape, and an attribute named w:MargaretTan are written; a number in an unprefixed attribute on a w: element holds',
    JSON.stringify(Object.fromEntries(sc8Bad.map((k) => [k, sc8[k].out === null ? sc8[k].held.slice(0, 200) : (sc8[k].out.match(/<w:body>[\s\S]{0,400}/) ?? [''])[0]]))));
  // the text export on a gateway's bad escape: held where a "%" is written and where a gateway
  // rewrote it, as the writer holds (engine.ts asks the writer's hasEscape; D1J-2)
  const ppTxt = exportPlan(doc(PP_V3, [RT]), [], PRACTICE);
  const pctTxt = exportPlan(doc('Profile: https://old.example.com/people/Ren%E9%20Tan.html', [RT]), [], PRACTICE);
  check(ppTxt.blocked && pctTxt.blocked,
    'setup: the text export holds on "Ren*E9*20Tan" in a Proofpoint link as it holds on "Ren%E9%20Tan"', JSON.stringify({ pp: [ppTxt.verified, ppTxt.blocked], pct: [pctTxt.verified, pctTxt.blocked] }));
  // CONTROL: each new predicate refuses its partner's write, so none is true of any output
  // (a held write is refused by a partner that writes: two holds cannot tell each other apart)
  const SC8_CTL = [['emDash', 'digits'], ['longForm', 'kpmgLike'], ['hyphen', 'lig'], ['lig', 'hyphen'], ['ligCode', 'lig'], ['ligCodePlain', 'lig'], ['refs', 'pct'],
    ['w14num', 'addinNum'], ['addinNum', 'w14num'], ['unkShort', 'draftAttr'], ['unkSix', 'draftAttr'], ['draftAttr', 'draftCap'], ['draftCap', 'draftAttr'], ['draftLow', 'draftAttr'], ['ppDocx', 'pct']];
  const sc8Blind = SC8_CTL.filter(([k, p]) => sc8Want[k](p === 'kpmgLike' ? sc8.hyphen : sc8[p]));
  check(!sc8Blind.length, 'CONTROL: each second-pass setup predicate refuses its partner\'s write', JSON.stringify(sc8Blind));
  // A part the writer does not know, its markup: a name in a namespace Office's formats define is
  // kept whatever it says; any other is kept when each piece of it is a code word, and holds when
  // one is not; a prefix, declared or listed, the same; an author attribute holds (W-FID-1,
  // W-FID-8). The sentence said these names were "kept whatever they say" (INT-16).
  const mk = (xml, extra = '') => acme(`<acme:root xmlns:acme="urn:acme-addin"${extra}>${xml}</acme:root>`);
  const MC = ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
  const names = {
    note: await wrote({ body: para(SB), extra: mk('<acme:note/>') }),
    pieces: await wrote({ body: para(SB), extra: mk('<acme:client_id/>') }),
    Client: await wrote({ body: para(SB), extra: mk('<acme:Client/>') }),
    attrClient: await wrote({ body: para(SB), extra: mk('<acme:note acme:Client="1"/>') }),
    prefix: await wrote({ body: para(SB), extra: acme('<Jonas:root xmlns:Jonas="urn:acme-addin"><Jonas:note/></Jonas:root>') }),
    wordNs: await wrote({ body: para(SB), extra: acme('<w:root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:JonasWhitfield/></w:root>') }),
    listed: await wrote({ body: para(SB), extra: mk('<acme:note/>', `${MC} mc:Ignorable="acme"`) }),
    listedName: await wrote({ body: para(SB), extra: mk('<acme:note/>', `${MC} xmlns:Jonas="urn:j" mc:Ignorable="Jonas"`) }),
    author: await wrote({ body: para(SB), extra: mk('<acme:note acme:author="x"/>') }),
  };
  const want = { note: 'kept', pieces: 'kept', Client: 'held', attrClient: 'held', prefix: 'held', wordNs: 'kept', listed: 'kept', listedName: 'held', author: 'held' };
  check(Object.entries(want).every(([k, v]) => kh(names[k]) === v),
    'setup: in a part the writer does not know, <acme:note> and <acme:client_id> are kept and <acme:Client> holds, so does a name-shaped prefix declared or listed, and an author attribute; a name in Word\'s own namespace is kept whatever it says',
    JSON.stringify(Object.fromEntries(Object.keys(want).map((k) => [k, kh(names[k])]))));
  // a theme's script code is read as a code word is, from six letters: a row "Hans" (a given
  // name) is not found in script="Hans" (W-FID-4)
  const HANS = row('h', 'Hans', '[Person5]', 'PERSON', 'person');
  const THEME = [{ name: 'word/theme/theme1.xml', rel: `${REL}/theme`, ct: 'application/vnd.openxmlformats-officedocument.theme+xml',
    xml: '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Hans" typeface="MS Gothic"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme></a:themeElements></a:theme>' }];
  const script = await wrote({ body: para('Hans signed.'), extra: THEME }, [HANS]);
  check(!!script.out?.includes('script="Hans"') && script.out.includes('[Person5] signed.'),
    'setup: a theme\'s script code "Hans" is kept beside a row "Hans", which the body masks', script.out === null ? script.held.slice(0, 200) : '');
  // the page and its receipt, on a file the writer writes
  const scPkg = await makeDocx({ body: para('Margaret Tan signed for Kestrel Capital.'), header: para('KestrelCapital') });
  const scFile = await docxDoc(scPkg, [MT, KC]);
  const scm = open(scFile, []);
  await scm.settle(landed);
  const scR = await receiptText(scm);
  const scScope = scR.split('\n').find((l) => l.startsWith('scope: ')) ?? '';
  const scNote = scR.split('\n').find((l) => l.startsWith('redacted .docx: ')) ?? '';
  // the round-4 wording, each of its three limits, and each clause the writer has since made
  // false: a break at every capital (P1T-6), a floor with no word it does not read in text, two
  // kinds of removed field (P1T-3), the six-letter limit without a script code (W-FID-4), the
  // unknown part's allowances before its markup was judged (INT-16), a row read anywhere inside
  // a word of the text a reader sees, a telephone number in an add-in's code not found and a
  // small-letter word after an Office host kept between an unknown part's tags (owner rulings 8,
  // 11 and 12 of 2026-09-24: the writer no longer reads the first that way and now holds on the
  // other two, so each fails here until the sentence is said again), a short-word exception
  // that let "kestrelholdings" read as found in text where it ships, and a "does not do" that
  // named Office's names and addresses but not the w:tel number, letters spaced apart or a name
  // split across an equation, all three written (sc8)
  const OLD_SCOPE = /every attribute value —|Two limits on that check|Three limits on that check|only a name of six characters or more is looked for\.|looks only for names of six characters or more\.|every attribute value but a namespace declaration|not read at all, so a name written into one is not found|which it does not read, so a name written into one is not found|not in text written for a reader|only as (?:the|your) table writes it, and only at six characters or more|such as a font, a number format or a watermark['’]s text|the file format['’]s own addresses|, whatever follows,|\(a space, a punctuation mark, an upper-case letter or a digit\)|anywhere inside a word\. Six is a floor|a field that shows who wrote the file or where it is saved|other fields \(a cross-reference, a date|in a number, a date, an id or a single code word|such as ["“]note["”]\)|a namespace declaration or a compatibility list, an address|the names of its elements and attributes are kept whatever they say|anywhere inside a word, save that in the text a reader sees|, and no other attribute value and no value that is only a number|so a telephone number an add-in wrote into the file['’]s code is not found|between its tags too \(so ["“]http:\/\/purl\.org\/matters\/marsh["”] is kept|What that check does not do: it does not read the names and addresses Office|goes on three letters or more beyond it|across one space, dot, slash, hyphen or dash that groups them|a character reference \(["“]&#32;["”], ["“]&nbsp;["”]\) and|\. It is never found there inside a word of letters alone|matters\/marsh["”] is kept and|letters spaced apart in the text a reader sees; and it does not find|run together or not, and its values by the safety-net pattern|another of Office['’]s elements, is not found\.|but not on one a mail gateway rewrote|is written as the tag and ["“]oration["”]|does not read a name written with a ligature|\(a comma, an em dash, a minus sign, a middle dot|nor is one written as digits alone between the tags|only from six digits, so a shorter one standing there|with its semicolon \(["“]&#32;["”], ["“]&nbsp;["”]; not|a space of any kind or a tab, a dot, a slash|a middle dot or a bullet, a hyphen with a space either side/;
  // the receipt in straight quotes, the page in the lawyer's typography
  const typo = (s, page) => (page ? s.replace(/"([^"]*)"/g, '“$1”').replace(/'/g, '’').replace(/\bthe table writes\b/g, 'your table writes') : s);
  const BREAKS_NOW = '(a space or a punctuation mark, where letters meet digits, where an upper-case letter follows a small one, either side of the last of a run of upper-case letters that a small letter follows, as "XYZReport" breaks after "XYZ" and "ISPs" only before its s, and either side of a Chinese, Japanese or Korean character; a word all in upper case, such as "LIWUCORP", has no break inside it, so a name of fewer than six letters is not found in it)';
  const NAMES_NOW = '; and only when the name of every element and attribute in it either belongs to a namespace Office\'s file formats define, where it is kept whatever it says, or is made of code words as an attribute may hold one, between its underscores, dots and hyphens (so <addin:note> is kept and <addin:Client> is not), when every prefix, on a name, in a namespace declaration or in a compatibility list, is the one Office writes for its namespace or such a code word, and when no attribute in it records an author or initials.';
  // owner ruling 8 (text a reader sees), 9 (digits) and 10 (escapes), each as the writer does it
  const TEXT_NOW = 'In the text a reader sees, where a find is masked rather than held, it is found only where such a break marks both its ends; at its end also before an ending s or es and then a break, when the name\'s last word has three letters or more and is written there with an upper-case first letter (es only after a name that ends in s, x, z, ch or sh); with the short designator it ends in written out (Co, Corp or Inc as Company, Corporation or Incorporated), where the whole word is masked with the name, so "XYZ Corporation" is written as the tag; and, from six letters and digits, inside a token that is not a word of prose (one with a digit in it, one with a dot, a slash, a backslash, a colon, an @, a # or an underscore between two letters or digits, or one that starts with an @ or a #, as a web or e-mail address, a path, a handle or a tag is written). Save for that designator, it is never found there inside a word of letters alone where nothing marks both its ends, so a name run into such a word is left readable and the check does not find it either; and a name found at a break or before an ending may stand inside a longer name, and is masked there.';
  const DIGITS_NOW = 'From six, it is found wherever its digits stand together, inside a longer number, an account number or a reference too, and in the text a reader sees also across one mark that groups them: a space (any character Unicode counts as a space) or a tab, a full stop, a middle dot or the bullet ("•"), a slash, a hyphen or a dash (any character Unicode counts as a dash), the minus sign, a hyphen with a plain space either side (" - "), or a round closing bracket and one plain space after the first group, as an area code is written; grouped any other way (a comma, an underscore, a colon, two spaces, a line break, an en dash, an em dash or a slash with a space either side, as " – " writes a range, a square bracket, a no-break space beside a bracket or a hyphen, or a mark that only looks like one of those, such as a fraction slash, an ideographic or small full stop, a swung dash, a heavy minus sign, or a white, black or triangular bullet), it is not found, and the check does not find it either.';
  const PCT_NOW = 'A percent-escape, as a web address writes a space ("%20") or a letter, an escape escaped again ("%2520"), a "%u" escape, a character reference by number, with its semicolon or without it ("&#32;", "&#32"), or by a name HTML defines, with its semicolon ("&nbsp;", "&eacute;"; "&nbsp" without it too, but not another name without it, "&eacute", nor a name HTML does not define, "&NBSP;", nor a reference escaped again, "&amp;eacute;") and the escapes in a link a mail gateway rewrote (Proofpoint\'s) are read as the characters they write, in the text and in the file\'s code, and in the text a reader sees also across a line break a mail program\'s wrap put inside an escape or inside the gateway\'s own wrapping of the link, where the link starts with a scheme ("https:") or "www.": a name written with them is masked in the text a reader sees, the escapes with it, and holds the file in its code; an escape that writes no character, where a name could stand, holds the file. A line break so put is not read across where the line after it starts with a quote mark (">"), as each line of a quoted reply does, so a name broken there is not found, and the check does not find it either. The copied text and the .txt are held on such an escape too, written with "%" or as a mail gateway rewrote it (Proofpoint\'s "*E9" or "-E9"), save where a mail program\'s wrap put a line break just before such an escape or inside the escape after it: there neither the .docx nor the copied text and the .txt is held, and the name in the link ships readable.';
  // what the check does not read, each asserted of the writer above (sc8, names.wordNs)
  const NOT_DO_NOW = 'What that check does not do: in the parts Word writes, it does not read the name of an element or attribute under a namespace Office\'s file formats define, whatever that name says, or of an attribute with no prefix on one of Office\'s elements other than Word\'s own text markup (w:); it does not read the addresses those formats define, Word\'s built-in style names or the standard fonts; it does not read a name written with its letters spaced apart or each in brackets ("⒜⒝⒞"), with a hyphen inside one of its words (as text copied from a PDF keeps a line\'s break in "Hold-ings"), with a line break inside one of its words (as a mail program\'s wrap can put one in a link), or with an invisible mark that sets the direction or format of text inside one of its words (a left-to-right or right-to-left mark, as text pasted from a right-to-left document can carry; a zero-width space, joiner or non-joiner, a word joiner and a soft hyphen are read through), in the text a reader sees; it does not read a letter written as a symbol (Word\'s w:sym) in the Symbol font, which Word draws as a Greek letter, several of them shaped as Latin upper-case letters are, where a letter, a digit or an @ written as a symbol in a font that draws letters holds the file; and it does not find a name split between separate parts of an equation (a fraction\'s top and bottom, a base and its script, two cells of a matrix).';
  // owner ruling 11: what the safety net reads in the file's code, and the number it does not
  const NET_NOW = ', an e-mail address in an attribute and, in every part, a value an add-in wrote: an attribute in a namespace Office\'s file formats do not define (an add-in\'s own, one with no prefix on an element of Word\'s own text markup, or one that XML, XML Schema, XLink or Dublin Core does not define under its prefix), the text of an element in such a namespace, and the address an add-in declares for its namespace. A telephone, card or identity number or an e-mail address found there holds the file. It reads no other value that is only a number, a date, an id or a code word, so such a number written into an attribute under one of Office\'s own prefixes, or with no prefix on another of Office\'s elements, is not found; written as digits alone between the tags of an element under one of Office\'s own namespaces that the writer does not mask as text, it holds the file where the pattern takes the whole of it (<w14:x>123456789</w14:x>), save in a drawing\'s position, size or share of the page (wp:posOffset), which the pattern does not read.';
  // owner ruling 12: kept in an attribute, held between tags (lim.hostAttr, lim.hostLow)
  const HOST_CLAUSE_NOW = '(so, in an attribute, "http://purl.org/matters/draft" is kept and "http://purl.org/matters/Draft" is not; between its tags a plain small-letter word there, or such words run together, holds the file, as it does standing alone)';
  // a kept part is read for a name of digits alone only from six digits (sc8.unkShort)
  const UNK_TAIL_NOW = 'what is kept is read by the check for the names above, run together or not (a name of digits alone under six digits only where it is the whole of a value, so a five-digit matter number inside a longer value there is not found), and its values by the safety-net pattern.';
  // the same clauses as the first pass of 2026-09-24 said them, put back by the CONTROL below
  // a name of two to five digits that is a whole value holds (owner ruling 19g, sc8.unkShort)
  const SIX_CODE_NOW = 'in a number, a date, an id, a single code word that starts with a small letter (as Word writes "rId3" or "upperRoman"), a theme\'s four-letter code for a script ("Jpan", "Cyrl") or the name Word gives a watermark\'s shape, it counts a name only from six letters and digits, so a shorter one there is not found, alone or run together, save in a relationship\'s id that is not Word\'s "rId" and a number, and save a name of two to five digits that is the whole of such a value, which holds the file but in an attribute under one of Office\'s own prefixes or with no prefix on another of Office\'s elements, or in a drawing\'s position, size or share of the page;';
  const PASS1 = {
    text: 'In the text a reader sees, where a find is masked rather than held, it is found only where such a break marks both its ends; at its end also before an ending s or es and then a break, when the name\'s last word has three letters or more and is written there with an upper-case first letter (es only after a name that ends in s, x, z, ch or sh); with the short designator it ends in written out (Co, Corp or Inc as Company, Corporation or Incorporated); and, from six letters and digits, inside a token that is not a word of prose (one with a digit in it, one with a dot, a slash, a backslash, a colon, an @ or an underscore between two letters or digits, or one that starts with an @, as a web or e-mail address, a path or a handle is written). It is never found there inside a word of letters alone where nothing marks both its ends, so a name run into such a word is left readable and the check does not find it either; and a name found at a break or before an ending may stand inside a longer name, and is masked there.',
    digits: 'From six, it is found wherever its digits stand together, inside a longer number, an account number or a reference too, and in the text a reader sees also across one space, dot, slash, hyphen or dash that groups them.',
    pct: 'A percent-escape, as a web address writes a space ("%20") or a letter, an escape escaped again ("%2520"), a "%u" escape, a character reference ("&#32;", "&nbsp;") and the escapes in a link a mail gateway rewrote (Proofpoint\'s) are read as the characters they write, in the text and in the file\'s code: a name written with them is masked in the text a reader sees, the escapes with it, and holds the file in its code; an escape that writes no character, where a name could stand, holds the file.',
    notDo: 'What that check does not do: in the parts Word writes, it does not read the name of an element or attribute under a namespace Office\'s file formats define, whatever that name says, or of an attribute with no prefix on one of Office\'s elements other than Word\'s own text markup (w:); it does not read the addresses those formats define, Word\'s built-in style names or the standard fonts; it does not read a name written with its letters spaced apart in the text a reader sees; and it does not find a name split between separate parts of an equation (a fraction\'s top and bottom, a base and its script, two cells of a matrix).',
    net: ', an e-mail address in an attribute and, in every part, a value an add-in wrote: an attribute in a namespace Office\'s file formats do not define (an add-in\'s own, one with no prefix on an element of Word\'s own text markup, or one that XML, XML Schema, XLink or Dublin Core does not define under its prefix), the text of an element in such a namespace, and the address an add-in declares for its namespace. A telephone, card or identity number or an e-mail address found there holds the file. It reads no other value that is only a number, a date, an id or a code word, so such a number written into an attribute under one of Office\'s own prefixes, or with no prefix on another of Office\'s elements, is not found.',
    host: '(so, in an attribute, "http://purl.org/matters/marsh" is kept and "http://purl.org/matters/Marsh" is not; between its tags a plain small-letter word there, or such words run together, holds the file, as it does standing alone)',
    unkTail: 'what is kept is read by the check for the names above, run together or not, and its values by the safety-net pattern.',
  };
  // the same clauses as the second pass of 2026-09-24 said them, before owner rulings 18 and 19
  // landed in the writer (round 7): each is put back by the CONTROL below
  const PASS2 = {
    breaks: '(a space or a punctuation mark, where letters meet digits, where an upper-case letter follows a small one, either side of the last of a run of upper-case letters that a small letter follows, as "XYZReport" breaks after "XYZ", and either side of a Chinese, Japanese or Korean character; a word all in upper case, such as "LIWUCORP", has no break inside it, so a name of fewer than six letters is not found in it)',
    text: 'In the text a reader sees, where a find is masked rather than held, it is found only where such a break marks both its ends; at its end also before an ending s or es and then a break, when the name\'s last word has three letters or more and is written there with an upper-case first letter (es only after a name that ends in s, x, z, ch or sh); with the short designator it ends in written out (Co, Corp or Inc as Company, Corporation or Incorporated), where only the letters of the name as the table writes it are masked, so "XYZ Corporation" is written as the tag and "oration"; and, from six letters and digits, inside a token that is not a word of prose (one with a digit in it, one with a dot, a slash, a backslash, a colon, an @ or an underscore between two letters or digits, or one that starts with an @, as a web or e-mail address, a path or a handle is written). Save for that designator, it is never found there inside a word of letters alone where nothing marks both its ends, so a name run into such a word is left readable and the check does not find it either; and a name found at a break or before an ending may stand inside a longer name, and is masked there.',
    digits: 'From six, it is found wherever its digits stand together, inside a longer number, an account number or a reference too, and in the text a reader sees also across one space (a plain, a no-break or a thin one), dot, slash, hyphen or en dash that groups them; grouped any other way (a comma, an em dash, a minus sign, a middle dot, a tab, another kind of space, or two characters such as " - "), it is not found, and the check does not find it either.',
    pct: 'A percent-escape, as a web address writes a space ("%20") or a letter, an escape escaped again ("%2520"), a "%u" escape, a character reference written whole, with its semicolon ("&#32;", "&nbsp;"; not "&nbsp" without it, nor one escaped again, "&amp;eacute;") and the escapes in a link a mail gateway rewrote (Proofpoint\'s) are read as the characters they write, in the text and in the file\'s code: a name written with them is masked in the text a reader sees, the escapes with it, and holds the file in its code; an escape that writes no character, where a name could stand, holds the file. The copied text and the .txt are held on such an escape too, written with "%" or as a mail gateway rewrote it (Proofpoint\'s "*E9" or "-E9").',
    notDo: 'What that check does not do: in the parts Word writes, it does not read the name of an element or attribute under a namespace Office\'s file formats define, whatever that name says, or of an attribute with no prefix on one of Office\'s elements other than Word\'s own text markup (w:); it does not read the addresses those formats define, Word\'s built-in style names or the standard fonts; it does not read a name written with its letters spaced apart, or with a hyphen inside one of its words (as text copied from a PDF keeps a line\'s break in "Hold-ings"), in the text a reader sees; it does not read a name written with a ligature, the one character text copied from a PDF often puts for "fi", "ff" or "ffi" ("ﬁ", "ﬀ", "ﬃ"), in the text or in the file\'s code; and it does not find a name split between separate parts of an equation (a fraction\'s top and bottom, a base and its script, two cells of a matrix).',
    net: ', an e-mail address in an attribute and, in every part, a value an add-in wrote: an attribute in a namespace Office\'s file formats do not define (an add-in\'s own, one with no prefix on an element of Word\'s own text markup, or one that XML, XML Schema, XLink or Dublin Core does not define under its prefix), the text of an element in such a namespace, and the address an add-in declares for its namespace. A telephone, card or identity number or an e-mail address found there holds the file. It reads no other value that is only a number, a date, an id or a code word, so such a number written into an attribute under one of Office\'s own prefixes, or with no prefix on another of Office\'s elements, is not found, nor is one written as digits alone between the tags of an element under one of Office\'s own namespaces that the writer does not mask as text (<w14:x>123456789</w14:x>).',
    unkTail: 'what is kept is read by the check for the names above, run together or not (a name of digits alone only from six digits, so a shorter one standing there, as a five-digit matter number may, is not found), and its values by the safety-net pattern.',
    sixCode: 'in a number, a date, an id, a single code word that starts with a small letter (as Word writes "rId3" or "upperRoman"), a theme\'s four-letter code for a script ("Jpan", "Cyrl") or the name Word gives a watermark\'s shape, it counts a name only from six letters and digits, so a shorter one there is not found, alone or run together, save in a relationship\'s id that is not Word\'s "rId" and a number;',
  };
  // the same clauses as round 7's first pass said them (D1, 2026-09-24), before D12 re-derived
  // them from the writer: "a dot" and "a bullet" where U+FE52, U+3002 and U+25E6 ship; no word of
  // a quoted reply's wrapped link, which ships; no invisible direction mark, which ships (D1J-F3,
  // D1L-1, D1J-F4, driven 2026-09-25). Each is put back by the CONTROL below.
  const R7 = {
    digits: 'From six, it is found wherever its digits stand together, inside a longer number, an account number or a reference too, and in the text a reader sees also across one mark that groups them: a space of any kind or a tab, a dot, a slash, a hyphen or a dash of any kind, a minus sign, a middle dot or a bullet, a hyphen with a space either side (" - "), or a closing bracket and a space after the first group; grouped any other way (a comma, an underscore, a colon, two spaces, or an en dash, an em dash or a slash with a space either side, as " – " writes a range), it is not found, and the check does not find it either.',
    pct: 'A percent-escape, as a web address writes a space ("%20") or a letter, an escape escaped again ("%2520"), a "%u" escape, a character reference by number, with its semicolon or without it ("&#32;", "&#32"), or by a name HTML defines, with its semicolon ("&nbsp;", "&eacute;"; "&nbsp" without it too, but not another name without it, "&eacute", nor a name HTML does not define, "&NBSP;", nor a reference escaped again, "&amp;eacute;") and the escapes in a link a mail gateway rewrote (Proofpoint\'s) are read as the characters they write, in the text and in the file\'s code, and in the text a reader sees also across a line break a mail program\'s wrap put inside an escape or inside the gateway\'s own wrapping of the link, where the link starts with a scheme ("https:") or "www.": a name written with them is masked in the text a reader sees, the escapes with it, and holds the file in its code; an escape that writes no character, where a name could stand, holds the file. The copied text and the .txt are held on such an escape too, written with "%" or as a mail gateway rewrote it (Proofpoint\'s "*E9" or "-E9").',
    notDo: 'What that check does not do: in the parts Word writes, it does not read the name of an element or attribute under a namespace Office\'s file formats define, whatever that name says, or of an attribute with no prefix on one of Office\'s elements other than Word\'s own text markup (w:); it does not read the addresses those formats define, Word\'s built-in style names or the standard fonts; it does not read a name written with its letters spaced apart or each in brackets ("⒜⒝⒞"), with a hyphen inside one of its words (as text copied from a PDF keeps a line\'s break in "Hold-ings"), or with a line break inside one of its words (as a mail program\'s wrap can put one in a link), in the text a reader sees; it does not read a letter written as a symbol (Word\'s w:sym) in the Symbol font, which Word draws as a Greek letter, several of them shaped as Latin upper-case letters are, where a letter, a digit or an @ written as a symbol in a font that draws letters holds the file; and it does not find a name split between separate parts of an equation (a fraction\'s top and bottom, a base and its script, two cells of a matrix).',
  };
  const SCOPE_SAYS = [
    `found with its words apart, as the table writes it, and also with nothing between them, in any case ("KestrelCapital", "kestrelcapital.com"): where it starts and ends at a place a word breaks ${BREAKS_NOW}`,
    'Six is a floor set by measurement: from fewer letters, a name read inside a word struck other words far more often. A name of digits alone is looked for this way only from six digits.',
    TEXT_NOW, DIGITS_NOW, PCT_NOW, NET_NOW, HOST_CLAUSE_NOW, UNK_TAIL_NOW,
    'every attribute value, the names of its elements and attributes, and the namespaces it declares or lists — and holds the file if such a name, other than one you chose to leave readable, is still readable in any of it',
    'A name in the file\'s own code that the writer neither masks nor renames (an attribute an add-in wrote, a namespace, an element\'s name) holds the file, and the hold says where.',
    SIX_CODE_NOW,
    'the safety-net pattern reads the text between tags, the attribute values Word shows (a watermark, a form field\'s help text, a signature line), a font\'s or a style\'s name, a number format\'s printed text',
    'purl.org or www.w3.org, or a urn that begins schemas-microsoft-com: or microsoft.com/office/) whose every word after the host, but the words and version numbers the format\'s own addresses are made of, is a number, a date, an id, true or false or a code word as an attribute may hold one',
    NAMES_NOW,
    // what it does not read, and what a part may hold, as pinned words (P1T-5)
    NOT_DO_NOW,
    'such as "rId3" or "en-US" (in an attribute, also a plain lower-case word such as "note", or such words run together, as in "upperRoman"), the address a namespace declaration gives,',
    // the fields, in the words both texts share (P1T-3)
    'a field that repeats a heading, refers to a page or a note, or shows a symbol',
    'field that shows who wrote or last saved the file (or the user\'s name, initials or address), its file name or folder, its template or any of its properties (a title, a subject, keywords, comments)',
    'a field that brings in text, a picture or data from another file or program',
    'other fields (a cross-reference to text, a date, a merge field)',
  ];
  const pinned = (text, page) => SCOPE_SAYS.every((s) => text.includes(typo(s, page))) && !OLD_SCOPE.test(text);
  // on a failure, which pinned words are missing and which false clause stands, so the one who
  // says the sentence again is told what to say it about
  const unpinned = (text, page) => JSON.stringify({ missing: SCOPE_SAYS.filter((s) => !text.includes(typo(s, page))).map((s) => s.slice(0, 90)), stale: [...text.matchAll(new RegExp(OLD_SCOPE.source, 'g'))].map((m) => m[0]) });
  check(pinned(scScope, false),
    'the receipt says what the check reads — the markup too, a name run together in any case from the floor of six, set by measurement — that a name in the file\'s own code holds, and each limit asserted of the writer above', unpinned(scScope, false));
  check(!/anyone typed/.test(scR), 'the receipt carries no note vouching that nothing in a part was typed', scNote);
  const scp = flat(scm.tree);
  check(pinned(scp, true), 'the page says the same, in the lawyer\'s words', unpinned(scp, true));
  await press(scm, 'Save redacted .docx…');
  const scSaved = flat(scm.tree).slice(flat(scm.tree).indexOf('Saved the redacted .docx'));
  check(/and the check described above found nothing from this table readable in them\./.test(scSaved) && !/Nothing in it reads as text anyone typed|nothing readable from this table\./.test(scSaved),
    'saved, the page says what the check found rather than that nothing is readable', scSaved.slice(0, 600));
  // CONTROL: the round-4 sentence as it stood on the receipt and on the page, whole, and the
  // live sentence with any one of its three limits put back
  const R4_RECEIPT = "The redacted .docx is not text only: it is the original Word container rewritten in place. Formatting kept; tracked deletions removed and tracked insertions accepted; comments and the list of reviewers, hidden text, images, embedded files and objects, embedded fonts, macros and add-ins, alt-text (of images, shapes, text boxes and tables), link targets, custom properties and custom XML removed; shape names replaced with neutral ones, and every bookmark the author made renamed bm1, bm2 …; document properties removed apart from the created and modified dates, the language, the revision count and five Word-internal flags; page-number, table-of-contents and numbering fields still live, a field that shows who wrote the file or where it is saved removed with what it showed, and other fields (a cross-reference, a date, a merge field) written out as the text they showed; the style, list, theme and font parts kept, with a name in them renamed where it carries something masked; headers (with any watermark), footers, footnotes, endnotes, chart and SmartArt text kept in the file and masked with this table, your always-redact list and the safety-net pattern only, because no engine read them. The app then reads the .docx it wrote — every part, each part's name, the text between its tags and every attribute value but a namespace declaration or a compatibility list (an xmlns or mc: attribute) — and holds the file if a name from this table or your always-redact list, other than one you chose to leave readable, is still readable in any of it, or the safety-net pattern still finds something in its text. Three limits on that check: a namespace declaration or a compatibility list is not read at all, so a name written into one is not found; a name written with its words run together (\"KestrelCapital\") is looked for in names and codes — a bookmark, style, font or part name, each name in a list of them, a drawn shape's id, a field's code — and not in text written for a reader, such as a header or a footer, where a name is looked for with its words apart, as the table writes it; and in a number, an id or a single code word — which is how the check reads any other value that is one word starting lower-case, as Word writes \"rId3\" or \"upperRoman\" and as \"kestrelCapital\" is written too — a name is looked for only as the table writes it, and only at six characters or more, so a name run together there is not found. A part this writer does not know is kept only when what stands between its tags and in its attributes is numbers, dates, ids, the file format's own addresses, single code words such as \"rId3\" or \"en-US\" (in an attribute, also a plain lower-case word such as \"note\"), and values the writer masks or renames wherever they stand, such as a font, a number format or a watermark's text; anything else in it holds the file, and what is kept is read by the check like any other value.";
  const R4_PAGE = "writes a real Word container, so that sentence does not cover it. It keeps the formatting. It removes tracked deletions and accepts tracked insertions as plain text, and it removes comments and the list of reviewers, hidden text, images, embedded files and objects, embedded fonts, macros and add-ins, alt-text, link targets, custom properties, custom XML and every document property that carries a name, a path or a statistic, leaving the created and modified dates, the language, the revision count and five Word-internal flags. Shape names are replaced with neutral ones, and every bookmark the author made is renamed bm1, bm2 …. Page-number, table-of-contents and numbering fields stay live; a field that shows who wrote the file or where it is saved goes with what it showed, and other fields (a cross-reference, a date, a merge field) are written out as the text they showed. The style, list, theme and font parts stay, with a name in them renamed where it carries something masked. Headers (with any watermark), footers, footnotes, endnotes, chart and SmartArt text stay in the file and are masked with this table, your always-redact list and the safety-net pattern only, because no engine read them. The app then reads the .docx it wrote — every part, each part’s name, the text between its tags and every attribute value but a namespace declaration or a compatibility list (an xmlns or mc: attribute), which it does not read, so a name written into one is not found — and holds the file if a name from your table or your always-redact list, other than one you chose to leave readable, is still readable in any of it, or the safety-net pattern still finds something in its text. It looks for a name written with its words run together (“KestrelCapital”) in names and codes — a bookmark, style, font or part name, each name in a list of them, a drawn shape’s id, a field’s code — and not in text written for a reader, such as a header or a footer, where it looks for the name with its words apart, as your table writes it; and in a number, an id or a single code word — which is how it reads any other value that is one word starting lower-case, as Word writes “rId3” or “upperRoman” and as “kestrelCapital” is written too — it looks for a name only as your table writes it, and only at six characters or more, so a name run together there is not found. A part this writer does not know is kept only when what stands between its tags and in its attributes is numbers, dates, ids, the file format’s own addresses, single code words such as “rId3” or “en-US” (in an attribute, also a plain lower-case word such as “note”), and values the writer masks or renames wherever they stand, such as a font, a number format or a watermark’s text; anything else in it holds the file, and what is kept is read by the check like any other value. Open it in Word once before you send it.";
  const R4_LIMITS = [
    'Three limits on that check: a namespace declaration or a compatibility list is not read at all, so a name written into one is not found;',
    'and not in text written for a reader, such as a header or a footer, where a name is looked for with its words apart, as the table writes it;',
    'a name is looked for only as the table writes it, and only at six characters or more, so a name run together there is not found.',
    'values the writer masks or renames wherever they stand, such as a font, a number format or a watermark\'s text;',
  ];
  check(!pinned(R4_RECEIPT, false) && OLD_SCOPE.test(R4_RECEIPT) && !pinned(R4_PAGE, true) && OLD_SCOPE.test(R4_PAGE)
    && R4_LIMITS.every((l) => R4_RECEIPT.includes(l) && !pinned(`${scScope} ${l}`, false) && !pinned(`${scp} ${typo(l, true)}`, true)),
    'CONTROL: the round-4 sentence fails both pins, on the receipt and on the page, and so does the live sentence with any one of its limits put back');
  // the address clause as it stood before the writer read past the host, put back on both
  const HOST_NOW = / whose every word after the host, but the words and version numbers the format['’]s own addresses are made of, [^(]*\([^)]*\),/;
  check(HOST_NOW.test(scScope) && HOST_NOW.test(scp) && !pinned(scScope.replace(HOST_NOW, ', whatever follows,'), false) && !pinned(scp.replace(HOST_NOW, ', whatever follows,'), true),
    'CONTROL: the clause that kept an address on the format\'s hosts "whatever follows" — true of the writer until it read past the host — fails both pins');
  // each clause said again on 2026-09-23, put back as it stood on both texts: the swap must find
  // the clause it replaces, so a control that finds nothing to swap fails rather than passes
  const putBack = (text, now, was) => (text.includes(now) ? text.replace(now, was) : null);
  const WAS = [
    ['the word breaks', BREAKS_NOW, BREAKS_NOW, '(a space, a punctuation mark, an upper-case letter or a digit), and, from six letters and digits, anywhere inside a word.'],
    ['the fields',
      'page-number, table-of-contents and numbering fields (and a field that repeats a heading, refers to a page or a note, or shows a symbol) still live, a field that shows who wrote or last saved the file (or the user\'s name, initials or address), its file name or folder, its template or any of its properties (a title, a subject, keywords, comments) removed with what it showed, as is a field that brings in text, a picture or data from another file or program, and other fields (a cross-reference to text, a date, a merge field)',
      'Page-number, table-of-contents and numbering fields stay live, as does a field that repeats a heading, refers to a page or a note, or shows a symbol. A field that shows who wrote or last saved the file (or the user\'s name, initials or address), its file name or folder, its template or any of its properties (a title, a subject, keywords, comments) goes with what it showed, as does a field that brings in text, a picture or data from another file or program; other fields (a cross-reference to text, a date, a merge field)',
      ['page-number, table-of-contents and numbering fields still live, a field that shows who wrote the file or where it is saved removed with what it showed, and other fields (a cross-reference, a date, a merge field)',
        'Page-number, table-of-contents and numbering fields stay live; a field that shows who wrote the file or where it is saved goes with what it showed, and other fields (a cross-reference, a date, a merge field)']],
    ['the six-letter limit', 'an id, a single code word that starts with a small letter (as Word writes "rId3" or "upperRoman"), a theme\'s four-letter code for a script ("Jpan", "Cyrl") or the name Word gives a watermark\'s shape,', null, 'an id or a single code word that starts with a small letter (as Word writes "rId3" or "upperRoman"),'],
    ['a part\'s markup', NAMES_NOW, null, '; the names of its elements and attributes are kept whatever they say.'],
    // owner rulings 8 to 12 of 2026-09-24, each clause as it stood before this round
    ['text a reader sees', `in the file's code. ${TEXT_NOW}`, null, 'save that in the text a reader sees, where the name\'s words stand apart, a first or last word of it shorter than six letters is not read inside a longer word that goes on three letters or more beyond it.'],
    ['the digits and the escapes', ` ${DIGITS_NOW} ${PCT_NOW}`, null, ''],
    ['what the check does not do', NOT_DO_NOW, null, 'What that check does not do: it does not read the names and addresses Office\'s file formats define, Word\'s built-in style names or the standard fonts.'],
    ['the safety net\'s reach', NET_NOW, null, ' and an e-mail address in an attribute, and no other attribute value and no value that is only a number, a date, an id or a code word, so a telephone number an add-in wrote into the file\'s code is not found.'],
    ['an address on a host, between tags', ` ${HOST_CLAUSE_NOW}`, null, ', between its tags too (so "http://purl.org/matters/marsh" is kept and "http://purl.org/matters/Marsh" is not)'],
    // the second pass of 2026-09-24 (D1J-1..6, D1L-2, -3, -5, -7): each clause as the first pass said it
    ['the designator\'s tail and the plain-word rule, first pass', TEXT_NOW, null, PASS1.text],
    ['the digit separators, first pass', DIGITS_NOW, null, PASS1.digits],
    ['references and a gateway\'s bad escape, first pass', PCT_NOW, null, PASS1.pct],
    ['a hyphen inside a word and a ligature, first pass', NOT_DO_NOW, null, PASS1.notDo],
    ['digits alone in an Office element, first pass', NET_NOW, null, PASS1.net],
    ['the host example, first pass', HOST_CLAUSE_NOW, null, PASS1.host],
    ['a kept part\'s digits, first pass', UNK_TAIL_NOW, null, PASS1.unkTail],
    // owner rulings 18 and 19 (round 7): each clause as the second pass said it, which the writer
    // has since made false — "ISPs" cut before its P, a designator's tail left readable, no "#",
    // four separators, a reference by number only with its semicolon, the ligature, the number in
    // an Office element, and a short number in a value not found (D1, driven 2026-09-24)
    ['the plural after a run of upper-case letters, second pass', BREAKS_NOW, BREAKS_NOW, PASS2.breaks],
    ['the designator\'s whole word and the #, second pass', TEXT_NOW, null, PASS2.text],
    ['the digit separators, second pass', DIGITS_NOW, null, PASS2.digits],
    ['references, and a link broken across lines, second pass', PCT_NOW, null, PASS2.pct],
    ['the ligature, bracketed letters, a line break and a symbol, second pass', NOT_DO_NOW, null, PASS2.notDo],
    ['digits alone in an Office element, second pass', NET_NOW, null, PASS2.net],
    ['a short number that is a whole value in code, second pass', SIX_CODE_NOW, null, PASS2.sixCode],
    ['a kept part\'s digits, second pass', UNK_TAIL_NOW, null, PASS2.unkTail],
    // round 7's first pass, each clause D12 found said more than the writer does
    ['the digit marks, as a dot and a bullet of any kind, round 7', DIGITS_NOW, null, R7.digits],
    ['no quoted reply\'s wrapped link, round 7', PCT_NOW, null, R7.pct],
    ['no invisible direction or format mark, round 7', NOT_DO_NOW, null, R7.notDo],
  ];
  const notFailed = [];
  for (const [what, nowR, nowP, was] of WAS) {
    const [wasR, wasP] = Array.isArray(was) ? was : [was, was];
    const r = putBack(scScope, nowR, wasR), p = putBack(scp, typo(nowP ?? nowR, true), typo(wasP, true));
    if (r === null || p === null || pinned(r, false) || pinned(p, true)) notFailed.push(`${what}: ${r === null || p === null ? 'clause not found' : 'still pinned'}`);
  }
  check(!notFailed.length, 'CONTROL: the word breaks, the fields, the six-letter limit, the part\'s markup, the reading of text a reader sees, the digits and escapes, what the check does not do, the safety net\'s reach and the host clause, each put back as it stood, each clause of the second pass put back as the first pass said it, and each clause owner rulings 18 and 19 moved put back as the second pass said it, fail both pins', notFailed.join(' | '));

  // 18u — the writer's notes are printed as the writer wrote them, on the receipt and on the
  // page after a save. The screen rewrote the note on a part the writer does not know by
  // matching the writer's sentence; the writer changed the sentence, the pattern matched
  // nothing, and a rewrite that said what the check reads stood here unused (INT-6). What a
  // note claims of the check is the writer's to keep true, and the check below holds it to that.
  // "Kestrel Holdings", not 18t's "Kestrel Capital": the writer's note, printed word for word,
  // says "a code word that starts with a capital", and 18g's scan of every receipt reads words
  const KH = row('kh', 'Kestrel Holdings', '[Company1]', 'COMPANY', 'org');
  const kuPkg = await makeDocx({ body: para('Margaret Tan signed for Kestrel Holdings.'), extra: acme('<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:id="4471" acme:lang="en-US"/></acme:root>') });
  const kuFile = await docxDoc(kuPkg, [MT, KH]);
  const kuW = await writeRedactedDocx(kuPkg, { mask: exportPlan(kuFile, [], PRACTICE).docx.mask });
  const kuNotes = kuW.notes.join(' ');
  const kuPage = async (component) => {
    const m = open(kuFile, [], {}, component);
    await m.settle(landed);
    const r = await receiptText(m);
    await press(m, 'Save redacted .docx…');
    const p = flat(m.tree);
    return { r, saved: p.slice(p.indexOf('Saved the redacted .docx')) };
  };
  const ku = await kuPage();
  check(!!kuW.bytes && kuW.notes.some((n) => n.startsWith('word/acme.xml ')) && ku.r.split('\n').includes(`redacted .docx: ${kuNotes}`) && ku.saved.includes(kuNotes),
    'a part the writer does not know, kept: the receipt and the saved line carry the writer\'s notes word for word', kuNotes);
  // the screen's rewrite as it was: the writer's sentence taken apart and said again in the
  // screen's words, here with one clause added
  const kuWas = await kuPage(await screenWith('screens/Export.tsx', [["dryNow.report.notes.join(' ')", "dryNow.report.notes.map((n) => n.replace(/\\.$/, ', but it finds a name in a single code word only as your table writes it.')).join(' ')"]]));
  check(/redacted \.docx: .*as your table writes it\./.test(kuWas.r) && !kuWas.r.split('\n').includes(`redacted .docx: ${kuNotes}`),
    'CONTROL: a receipt that rewords the writer\'s note, as the screen once did, fails the check above');
  // Printed word for word, a note may claim no more of the check than the check reads. Each
  // place a part the writer does not know can carry a name is written with the client's: a
  // value, a namespace declaration, an element's or an attribute's name, a namespace prefix, a
  // compatibility list. Wherever the writer keeps the part, a note that says the check read all
  // of it is true only if the part it kept carries no name of the table, in any case, with or
  // without the spaces between its words.
  const PLACES = [
    ['a value', '<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:client="margaretTan"/></acme:root>'],
    ['a namespace declaration', '<acme:root xmlns:acme="urn:kestrel-capital:matter-4471"><acme:note acme:id="4471"/></acme:root>'],
    ['a namespace declaration, run together', '<acme:root xmlns:acme="urn:kestrelcapital"><acme:note acme:id="4471"/></acme:root>'],
    ['an element\'s name', '<acme:root xmlns:acme="urn:acme-addin"><acme:KestrelCapital acme:id="4471"/></acme:root>'],
    ['an attribute\'s name', '<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:margaretTan="1"/></acme:root>'],
    ['a namespace prefix', '<margaretTan:root xmlns:margaretTan="urn:acme-addin"><margaretTan:note margaretTan:id="1"/></margaretTan:root>'],
    ['a compatibility list', '<acme:root xmlns:acme="urn:acme-addin" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="kestrelcapital"><acme:note acme:id="1"/></acme:root>'],
  ];
  // The writer keeps none of these parts, so no note can be printed over one: this asserts
  // that, where it once asked whether a kept part's note over-claimed and found nothing kept to
  // ask of, and passed on "kept: none" whatever the note said (P13-INT6).
  const kept = [];
  for (const [where, xml] of PLACES) {
    const pkg = await makeDocx({ body: para('Margaret Tan signed for Kestrel Capital.'), extra: acme(xml) });
    const w = await writeRedactedDocx(pkg, { mask: exportPlan(await docxDoc(pkg, [MT, KC]), [], PRACTICE).docx.mask });
    const z = w.bytes ? await readZip(w.bytes) : null;
    if (z?.names.includes('word/acme.xml')) kept.push(where);
  }
  check(!kept.length,
    'a part the writer does not know that carries the client\'s name in a value, a namespace, an element\'s or attribute\'s name, a prefix or a compatibility list is not kept, so no note is printed over it', `kept: ${kept.join(', ')}`);
  // What the note says of the word breaks, held to what the check does on a part it keeps. A
  // row "Li Wu" in "noteLIWUCORP" — a code word, so the part is kept — is not found, and the
  // note says why: "a word all in capitals or all in small letters has no break inside it".
  // "noteLiWuCorp" breaks at each capital and holds as a part that is not code words. The note said, until the writer's breaks
  // were stated as compactOf makes them, that a word breaks "at an upper-case letter, a digit or
  // a separator", which reads "Li Wu" in "LIWUCORP"; that sentence fails here (CONTROL).
  const LWN = row('lwn', 'Li Wu', '[Person4]', 'PERSON', 'person');
  const lwPart = async (v) => {
    const pkg = await makeDocx({ body: para('Li Wu signed.'), extra: acme(`<acme:root xmlns:acme="urn:acme-addin"><acme:note acme:kind="${v}"/></acme:root>`) });
    return writeRedactedDocx(pkg, { mask: exportPlan(await docxDoc(pkg, [LWN]), [], PRACTICE).docx.mask });
  };
  const lwKept = await lwPart('noteLIWUCORP'), lwHeld = await lwPart('noteLiWuCorp');
  const lwNote = lwKept.notes.find((n) => n.startsWith('word/acme.xml ')) ?? '';
  const breaksTrue = (note) => /a word all in capitals or all in small letters has no break inside it/.test(note) && !/at an upper-case letter, a digit or a separator/.test(note);
  check(!!lwKept.bytes && breaksTrue(lwNote) && !lwHeld.bytes && /^word\/acme\.xml, a part of the file this app does not know, holds text/.test(lwHeld.held ?? ''),
    'a kept part carrying "noteLIWUCORP" beside a row "Li Wu": its note says a word all in capitals has no break inside it, which is why the name was not found; "noteLiWuCorp" holds',
    JSON.stringify({ kept: !!lwKept.bytes, note: lwNote.slice(-420), held: (lwHeld.held ?? 'written').slice(0, 160) }));
  check(!breaksTrue(lwNote.replace(/— at a space[^—]*—/, '— at an upper-case letter, a digit or a separator —')) && /at an upper-case letter, a digit or a separator/.test(lwNote.replace(/— at a space[^—]*—/, '— at an upper-case letter, a digit or a separator —')),
    'CONTROL: the note with the old word breaks put back fails the check above');
  // the term on the list left readable under Protected terms: the written .docx carries it, and
  // the sentence now says it may
  const lvPkg = await makeDocx({ body: para('Kestrel will pay Margaret Tan.'), header: para('Kestrel · Solicitors') });
  const lvDoc = await docxDoc(lvPkg, [{ ...row('lp', 'Kestrel', '[Protected2]', 'PROTECTED', 'protected'), dead: true, status: 'ignored' }, MT]);
  const lvPlan = exportPlan(lvDoc, ['Kestrel'], PRACTICE);
  const lvW = await writeRedactedDocx(lvPkg, { mask: lvPlan.docx.mask });
  check(!lvPlan.blocked && !!lvW.bytes && (await extractDocx(lvW.bytes)).items.some((i) => i.kind === 'header' && /Kestrel/.test(i.text)),
    'a term on the list left readable under Protected terms: the page is not held and the written .docx carries it in the header — the case "other than one you chose to leave readable" states');
  // the saved line's count of the styles the writer renamed, which no page here had written
  const stPkg = await makeDocx({ body: '<w:p><w:pPr><w:pStyle w:val="KestrelBody"/></w:pPr><w:r><w:t xml:space="preserve">Kestrel will pay Margaret Tan.</w:t></w:r></w:p>',
    extra: [{ name: 'word/styles.xml', xml: `<w:styles ${NS}><w:style w:type="paragraph" w:styleId="KestrelBody"><w:name w:val="Kestrel Body"/></w:style></w:styles>`, rel: `${REL}/styles`, ct: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml' }] });
  const stFile = await docxDoc(stPkg, [row('k', 'Kestrel', '[Company1]', 'COMPANY', 'org'), MT]);
  const savedLine = async (component) => { const m = open(stFile, [], {}, component); await m.settle(landed); await press(m, 'Save redacted .docx…'); const t = flat(m.tree); return t.slice(t.indexOf('Saved the redacted .docx')); };
  const stSaved = await savedLine();
  check(/^Saved the redacted \.docx — [^;]*; removed [^;]*1 style name \(renamed\)/.test(stSaved) && /renamed "Redacted style 1"; the text keeps its formatting\./.test(stSaved),
    'saved, the page counts the style the writer renamed among what it removed or renamed, beside the writer\'s note', stSaved.slice(0, 400));
  const stWas = await savedLine(await screenWith('screens/Export.tsx', [['rm.styles ? `${rm.styles} style name', 'false ? `${rm.styles} style name']]));
  check(/^Saved the redacted \.docx/.test(stWas) && !/style name \(renamed\)/.test(stWas), 'CONTROL: with that entry out of the list, the page does not count it — the check above can fail', stWas.slice(0, 200));

  // 18v — a .docx the dry run did not write is not offered. The button read "Save redacted
  // .docx…" and opened on every page nothing else held, so the lawyer learned the file was held
  // only by pressing it (R-saveHeld, 2026-09-24). The dry run's hold now shuts it, relabels it and
  // prints the writer's reason beside it before any press; the copy and the .txt, which that run
  // does not write, stay open.
  const shPkg = await makeDocx({ body: inBody(`${AX} acme:client="margaretTan"`) });
  const shFile = await docxDoc(shPkg, [MT, KC, ONG]);
  const shHeld = (await writeRedactedDocx(shPkg, { mask: exportPlan(shFile, [], PRACTICE).docx.mask })).held ?? '';
  const shm = open(shFile, []);
  await shm.settle(landed);
  const shp = flat(shm.tree);
  check(/w:p@acme:client: "margaretTan" still carries "Margaret Tan"/.test(shHeld) && button(shm, '.docx held — see why below')?.disabled === true && !button(shm, 'Save redacted .docx…')
    && shp.includes(`✗ The redacted .docx was NOT written — ${shHeld}`) && button(shm, 'Copy redacted text')?.disabled === false && button(shm, 'Save as file…')?.disabled === false,
    'a .docx the dry run held: its button is shut and says so, the writer\'s reason is on the page before any press, and the copy and the .txt stay open', shp.slice(shp.indexOf('✗ The redacted'), shp.indexOf('✗ The redacted') + 160));
  const ShWas = await screenWith('screens/Export.tsx', [
    ['disabled={exportBlocked || docxBusy || !dryNow || !docxReady}', 'disabled={exportBlocked || docxBusy || !dryNow}'],
    [": !docxReady ? '.docx held — see why below' ", ''],
    ['{docxSave && dryNow && !docxReady && <div', '{false && <div'],
  ]);
  store.set('simpler-legal.protected-terms', '[]');
  const shw = mount({ file: shFile }, ShWas);
  await shw.settle(landed);
  const shwBefore = flat(shw.tree);
  const shwOpen = button(shw, 'Save redacted .docx…')?.disabled === false;
  await press(shw, 'Save redacted .docx…');
  check(shwOpen && !shwBefore.includes('NOT written') && flat(shw.tree).includes(`✗ The redacted .docx was NOT written — ${shHeld}`),
    'CONTROL: with the button as it was, it opens on a held dry run and the reason shows only once it is pressed — the check above can fail');
  // and a dry run that THROWS rather than holds: the row says the writer's own error. The writer
  // turns every fault of a package it reads into a hold (bytes that are not a zip, not an
  // ArrayBuffer, a mask that throws: each returned `held`, measured 2026-09-24), so the branch is
  // reached here with a writer that throws; unpinned, it could print "NOT written — undefined"
  // with nothing failing (P1-T4)
  const THROWS = 'export async function writeRedactedDocx(';
  const throwing = { name: 'throwing-writer', setup(b) {
    b.onLoad({ filter: /[\\/]docxWrite\.ts$/ }, (a) => {
      const s = readFileSync(a.path, 'utf8');
      if (!s.includes(THROWS)) throw new Error(`protected-terms: a CONTROL's line is no longer in docxWrite.ts: ${THROWS}`);
      return { contents: s.replace(THROWS, "export async function writeRedactedDocx(..._: unknown[]): Promise<never> { throw new Error('the writer ran out of memory'); }\nasync function writeRedactedDocxAsWritten("), loader: 'ts' };
    });
  } };
  const thScreen = async (pairs) => (await mutantOf(join(here, '..', 'src', 'screens', 'Export.tsx'), pairs, [noPdf, hooksRuntime, throwing],
    { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' })).Export;
  const thFile = await docxDoc(await makeDocx({ body: para(TEXT) }), [anna]);
  const thPage = async (component) => { store.set('simpler-legal.protected-terms', '[]'); const m = mount({ file: thFile }, component); await m.settle(landed); return m; };
  const th = await thPage(await thScreen([]));
  const thp = flat(th.tree);
  check(button(th, '.docx held — see why below')?.disabled === true && thp.includes('✗ Couldn’t write the redacted .docx: the writer ran out of memory') && !thp.includes('NOT written')
    && button(th, 'Copy redacted text')?.disabled === false,
    'a dry run that throws: the .docx button is shut, the row says the writer\'s own error, and the copy stays open', thp.slice(thp.indexOf('✗'), thp.indexOf('✗') + 120));
  const thw = flat((await thPage(await thScreen([['{dryNow.error ? `Couldn’t write the redacted .docx: ${dryNow.error}` : `The redacted .docx was NOT written — ${dryNow.report?.held}`}', '{`The redacted .docx was NOT written — ${dryNow.report?.held}`}']]))).tree);
  check(thw.includes('✗ The redacted .docx was NOT written — undefined'),
    'CONTROL: without the error branch, the row reads "NOT written — undefined" — the check above can fail', thw.slice(thw.indexOf('✗'), thw.indexOf('✗') + 80));

  // 18w — law 39 on the page: "Anna Tan" run into a footnote number beside an "Anna" the lawyer
  // left readable. Listed after the drop, the page shipped it — the copy and the .txt carried
  // "Anna Tan12" — under a receipt saying the list's own row masked it in the saved .docx and
  // "none of it is readable in the copied text or the .txt"; declared before, the copy carried it
  // under "none of the listed spans appear in the export" (P13-B1, P13-B2, 2026-09-24).
  const B2 = 'Ms Anna Tan12 stated. Anna agreed. Jane Roe signed.';
  const b2Pkg = await makeDocx({ body: para(B2), header: para(B2) });
  const b2Text = await textOf(b2Pkg);
  const b2Rows = syncFloorRows(b2Text, [{ ...row('a', 'Anna', '[Person2]', 'PERSON', 'person'), dead: true, status: 'ignored' }, row('jr', 'Jane Roe', '[Person1]', 'PERSON', 'person')], PRACTICE);
  const b2Declared = syncFloorRows(b2Text, withProtectedTerms(b2Text, b2Rows, ['Anna Tan'], PRACTICE), PRACTICE);
  const B2_WANT = `Ms ${b2Declared.find((e) => e.text === 'Anna Tan' && !isFloorRow(e))?.tag ?? '(no row)'}12 stated. Anna agreed. [Person1] signed.`;
  /** what a page sends: the copy, the .txt, the saved .docx's body and header, and the receipt */
  const sent = async (m) => {
    const c = clip.length;
    await press(m, 'Copy redacted text');
    const copy = clip.length > c ? clip.at(-1) : null;
    const txt = await fileOf(m, 'Save as file…');
    const k = saved.length;
    await press(m, 'Save redacted .docx…');
    const items = saved.length > k ? (await extractDocx(new Uint8Array(await saved.at(-1).blob.arrayBuffer()))).items : [];
    return { copy, txt, body: flowText(items.filter(inMainFlow)), header: items.filter((i) => i.kind === 'header').map((i) => i.text).join(' '), receipt: await receiptText(m) };
  };
  const VERIFIED = /^verify-by-extraction: none of the listed spans appear in the export$/m;
  const NOT_IN_TXT = /none of it is readable in the copied text or the \.txt/;
  const b2d = open(await docxDoc(b2Pkg, b2Declared), ['Anna Tan']);
  await b2d.settle(landed);
  const b2dOut = await sent(b2d);
  check([b2dOut.copy, b2dOut.txt, b2dOut.body, b2dOut.header].every((x) => x === B2_WANT) && VERIFIED.test(b2dOut.receipt),
    'declared before the drop: the copy, the .txt and the saved .docx\'s body and header are one text with the term masked, and the receipt\'s "none of the listed spans appear" is true', JSON.stringify({ ...b2dOut, receipt: undefined }));
  const b2lFile = await docxDoc(b2Pkg, b2Rows);
  let b2l = null;
  b2l = open(b2lFile, ['Anna Tan'], { onMaskTerms: (ts) => b2l.props({ file: { ...b2lFile, entities: syncFloorRows(b2Text, withProtectedTerms(b2Text, b2Rows, ts, PRACTICE), PRACTICE) } }) });
  await b2l.settle(landed);
  const b2lHeld = flat(b2l.tree);
  const b2lShut = button(b2l, 'Copy redacted text')?.disabled === true && button(b2l, 'Save as file…')?.disabled === true;
  await press(b2l, 'Mask it in this document');
  await b2l.settle(landed);
  const b2lOut = await sent(b2l);
  check(b2lShut && /✗ A term on your always-redact list is readable in this document and has no row in its table: Anna Tan\./.test(b2lHeld)
    && [b2lOut.copy, b2lOut.txt, b2lOut.body, b2lOut.header].every((x) => x === B2_WANT) && VERIFIED.test(b2lOut.receipt) && !NOT_IN_TXT.test(b2lOut.receipt),
    'listed after the drop: the page is held on the term with its button, and pressed, it sends what declaring the term first sent', JSON.stringify({ ...b2lOut, receipt: undefined }));
  // CONTROL: the Export screen on the engine with the places left readable as walls, and the
  // receipt's channel line as it was then (18x reads it off the export now, a second guard that
  // alone turns this page's receipt true)
  const ExportWalls = (await mutantOf(join(here, '..', 'src', 'lib', 'engine.ts'), [...LEFT_AS_WALLS, ...NO_BODY_READABLE], [noPdf, hooksRuntime],
    { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' })).Export;
  const wallsPage = async (file) => { store.set('simpler-legal.protected-terms', JSON.stringify(['Anna Tan'])); const m = mount({ file }, ExportWalls); await m.settle(landed); return sent(m); };
  const wd = await wallsPage(await docxDoc(b2Pkg, b2Declared));
  const wl = await wallsPage(b2lFile);
  check(/Anna Tan12/.test(wd.copy ?? '') && VERIFIED.test(wd.receipt) && /Anna Tan12/.test(wl.copy ?? '') && NOT_IN_TXT.test(wl.receipt),
    'CONTROL: with the walls as they were, both pages copy "Anna Tan12" — declared, under "none of the listed spans appear"; listed late, under "none of it is readable in the copied text or the .txt" — the checks above can fail', `${wd.copy} · ${wl.copy}`);

  // 18x — the receipt's line on the list's rows the saved .docx masks, read off the body export
  // (P1-F2, 2026-09-24). "KestrelCapital" is on the list and left readable under Protected terms
  // in the review; "Kestrel Capital" is on it too. The copy and the .txt carry the spelling the
  // lawyer left readable, the saved .docx masks it with a row of the list's own (owner ruling 13:
  // accepted over-redaction), and nothing is held, since that is the lawyer's choice. The receipt
  // said the list's row masked it in the .docx and "none of it is readable in the copied text or
  // the .txt" over a copy that carried it.
  const XG = 'Wire to KestrelCapital today. Jane Roe signed.';
  const xPkg = await makeDocx({ body: para(XG) });
  const xText = await textOf(xPkg);
  const xRows = withProtectedTerms(xText, [row('jr', 'Jane Roe', '[Person1]', 'PERSON', 'person')], ['KestrelCapital'], PRACTICE).map((e) => (e.cat === 'protected' ? { ...e, dead: true, status: 'ignored' } : e));
  const xFile = await docxDoc(xPkg, xRows);
  const xPage = async (component) => { store.set('simpler-legal.protected-terms', JSON.stringify(['KestrelCapital', 'Kestrel Capital'])); const m = mount({ file: xFile }, component); await m.settle(landed); return sent(m); };
  const DIFFERS = /^always-redact list: 1 declared term is readable in the copied text and the \.txt, written run together in a spelling you left readable under Protected terms in the review, and masked by the saved \.docx with a row of the list's own, so the text exports and the \.docx differ there$/m;
  const xOut = await xPage();
  check(xOut.copy === 'Wire to KestrelCapital today. [Person1] signed.' && xOut.txt === xOut.copy && /^Wire to \[Protected\d+\] today\. \[Person1\] signed\.$/.test(xOut.body)
    && DIFFERS.test(xOut.receipt) && !NOT_IN_TXT.test(xOut.receipt) && VERIFIED.test(xOut.receipt),
    'a list term run together in a spelling left readable under Protected terms: the copy and the .txt carry it, the .docx masks it, and the receipt says the two differ there — never that the .txt does not carry it', JSON.stringify({ ...xOut, receipt: xOut.receipt.split('\n').filter((l) => /^always-redact/.test(l)) }));
  const ExportNoBody = (await mutantOf(join(here, '..', 'src', 'lib', 'engine.ts'), NO_BODY_READABLE, [noPdf, hooksRuntime],
    { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' })).Export;
  const xWas = await xPage(ExportNoBody);
  check(/KestrelCapital/.test(xWas.copy ?? '') && NOT_IN_TXT.test(xWas.receipt) && !DIFFERS.test(xWas.receipt),
    'CONTROL: with the line read off the .docx alone, as it was, the receipt says "none of it is readable in the copied text or the .txt" over a copy carrying "KestrelCapital" — the check above can fail', xWas.copy);

  // 18y — a kept name a percent-escape that writes no character may hide (P1-F5, 2026-09-24):
  // "Ren%E9%20Tan" (é written the Latin-1 way) for a kept "René Tan". The page is held on it, and
  // says where to look, since the review's "find it in the document" does not find the name by
  // its letters there.
  const ESC = 'Filed at https://firm.sharepoint.com/sites/Clients/Ren%E9%20Tan/x.docx today. René Tan signed.';
  const escFile = doc(ESC, [row('r', 'René Tan', '[Person1]', 'PERSON', 'person')]);
  const escPage = (component) => { store.set('simpler-legal.protected-terms', '[]'); return flat(mount({ file: escFile }, component).tree); };
  const ESC_SAYS = '“René Tan” may stand in a web address or a file’s path written with a percent-escape (%E9) that is no character, where nothing can say which letter it meant';
  const ep = escPage();
  const em = mount({ file: escFile });
  check(button(em, 'Copy redacted text')?.disabled === true && button(em, 'Save as file…')?.disabled === true && ep.includes(ESC_SAYS),
    'a kept name a percent-escape may hide: the page is held and names the escape and what to do', ep.slice(ep.indexOf('✗'), ep.indexOf('✗') + 400));
  const epWas = escPage(await screenWith('screens/Export.tsx', [['+ (plan.escaped ? ` ${escapeWay(', '+ (false ? ` ${escapeWay(']]));
  check(!epWas.includes(ESC_SAYS) && epWas.includes('✗'),
    'CONTROL: without the sentence the page is held with nothing on it about the escape — the check above can fail');
  // and listed after the drop with no row: held with no button (no press can mask an escape),
  // and the row that says so names the escape, on a file with no .docx whose writer could
  const lateEsc = doc(ESC.replace('René Tan signed', 'Jane Roe signed'), [row('jr', 'Jane Roe', '[Person1]', 'PERSON', 'person')]);
  const lateEscPage = (component) => { store.set('simpler-legal.protected-terms', JSON.stringify(['René Tan'])); return flat(mount({ file: lateEsc, onMaskTerms: () => {} }, component).tree); };
  const lep = lateEscPage();
  check(/this page offers no button for René Tan\./.test(lep) && lep.includes(ESC_SAYS),
    'a late-listed name written only with such an escape: the row that offers no button names the escape, since the review\'s "find it" does not find the name there', lep.slice(lep.indexOf('✗ Masking'), lep.indexOf('✗ Masking') + 600));
  const lepWas = lateEscPage(await screenWith('screens/Export.tsx', [['{stuckEsc.map((h) =>', '{[].map((h: ListHold) =>']]));
  check(/this page offers no button for René Tan\./.test(lepWas) && !lepWas.includes(ESC_SAYS),
    'CONTROL: without it the row sends the lawyer to find "René Tan" in a document that writes it "Ren%E9%20Tan" — the check above can fail');

  // 18z — the fragment check reads what a reader reads (law 42, owner ruling 21, 2026-09-24).
  // Asked at the footprint's edges of the export as written, a footnote's number beside a
  // surname hid it and an escape in a pasted link wrote it past the check: the page showed no
  // ⚠ and the receipt said no fragment of a listed name survived, with the surname readable in
  // the copy. The page names the piece and the receipt counts it; the copy stays open, since the
  // check flags and holds nothing. These pages are read by 18g's scan with the rest.
  const skRows = () => [row('sk', 'Søren Kierkegaard', '[Person2]', 'PERSON', 'person'), anna];
  const GLUED_PAGES = [
    ['a footnote\'s number after the surname', 'Kierkegaard12 replied. Søren Kierkegaard signed. Anna Tan agreed.', 'Kierkegaard', 'Kierkegaard12 replied.'],
    ['the surname behind %20 in a pasted link', 'See https://dms.example.com/find?q=Dr.%20Kierkegaard now. Søren Kierkegaard signed. Anna Tan agreed.', 'Kierkegaard', 'q=Dr.%20Kierkegaard now.'],
    // named as the copy writes it (P1T-5): searching the copy for "Søren" does not find it
    ['the given name written with escapes in a pasted link', 'See https://dms.example.com/clients/S%C3%B8ren/memo now. Søren Kierkegaard signed. Anna Tan agreed.', 'S%C3%B8ren', '/clients/S%C3%B8ren/memo'],
  ];
  const FragWas = await screenWith('lib/engine.ts', FRAG_ROUND_START);
  const FRAG_SAYS = (piece) => `⚠ Partial names may survive: ${piece} — `;
  const FRAG_COUNTS = /^fragment check: 1 partial name\(s\) of listed names may survive — not named here; the Export screen lists them\. Read: /m;
  // What the check read, said with its result on the receipt and beside the ⚠ (owner ruling 21):
  // the round-6 line said "no fragments of listed names survive" of every export, where the check
  // reads words of text only — never inside a plain word of letters, never the saved .docx's body
  // or its code — and its floors are four letters, two with an upper-case first letter, four digits
  const FRAG_HOW = 'each word of a row you masked or of a listed term, and each part of one joined by an apostrophe, a hyphen or a dot, save a word it skips as too common to stand for a name alone, even where it is a surname: a title such as Mr or Dr, a designator such as Inc, LLC or Group, a two-letter code such as US, UK, NA or SA, the words the, and, for and of, and Bank, Road, Street, Place and Avenue; each from four letters, from two where the name and the copy both write it with an upper-case first letter, or from four digits; found where a word breaks (a space, a punctuation mark, a digit, a superscript, an upper-case letter after a small one), through escapes, and from four letters inside an address, a path, or a handle or a tag written with a plain @ or #; never inside a plain word of letters';
  // round 7's first pass: "a title, a designator or a particle" where a particle is flagged and
  // Bank, Street, Place and the two-letter codes are skipped unsaid (D1J-F2, D1L-3); any handle or
  // tag where a full-width @ or # is prose to it (D1L-4); "every part … that holds text" where a
  // watermark, a signature line's signer and a list's number text are not read (D1J-F1)
  const FRAG_HOW_R7 = 'each word of a row you masked or of a listed term, and each part of one joined by an apostrophe, a hyphen or a dot, but a title, a designator or a particle: from four letters, from two where the name and the copy both write it with an upper-case first letter, or from four digits; found where a word breaks (a space, a punctuation mark, a digit, a superscript, an upper-case letter after a small one), through escapes, and from four letters inside an address, a path, a handle or a tag; never inside a plain word of letters';
  const FRAG_WHERE_TXT = 'the copied text and the .txt';
  const FRAG_WHERE_DOCX = 'the copied text and the .txt, and the text of every other part of the saved .docx (a header, a footer, a note, a chart, SmartArt), as it saves them, but not text Word keeps as a setting in the code of the file (a watermark, the signer a signature line suggests, the text a list prints beside each number)';
  const FRAG_WHERE_DOCX_R7 = 'the copied text and the .txt, and every part of the saved .docx that holds text other than its body (a header, a footer, a note, a chart, SmartArt), as it saves them';
  const fragReads = (line, where) => line.endsWith(` Read: ${where}, for ${FRAG_HOW}`);
  const warnReads = (page, where) => page.includes(`— read the redacted copy once before sending. The check read ${where}, for ${FRAG_HOW}. It can only vouch for names on the list.`);
  const fragReadBad = [];
  for (const [label, T, piece, ships] of GLUED_PAGES) {
    const gf = doc(T, skRows());
    const gp = open(gf, []);
    const page = flat(gp.tree);
    const gr = await receiptText(gp);
    const grl = gr.split('\n').find((l) => l.startsWith('fragment check')) ?? '';
    if (!fragReads(grl, FRAG_WHERE_TXT) || !warnReads(page, FRAG_WHERE_TXT)) fragReadBad.push(`${label}: ${grl.slice(0, 160)}`);
    check(exportPlan(gf, [], PRACTICE).red.includes(ships) && page.includes(FRAG_SAYS(piece)) && FRAG_COUNTS.test(gr) && button(gp, 'Copy redacted text')?.disabled === false,
      `${label}: the copy carries it, the page names "${piece}" as a partial name that may survive, the receipt counts one, and the copy stays open`, `${page.slice(page.indexOf('⚠'), page.indexOf('⚠') + 80)} · ${gr.split('\n').find((l) => l.startsWith('fragment check')) ?? '(no receipt)'}`);
    store.set('simpler-legal.protected-terms', '[]');
    const wm = mount({ file: gf }, FragWas);
    const wr = await receiptText(wm);
    check(!flat(wm.tree).includes('Partial names may survive') && /^fragment check: no partial name of a listed name found\. Read: /m.test(wr),
      `  CONTROL: with the piece read at the footprint's edges of the export as written, as it was, the page shows no ⚠ and the receipt says no fragment survives — the check above can fail`, wr.split('\n').find((l) => l.startsWith('fragment check')) ?? '(no receipt)');
  }
  // and what it asks since ruling 21's second pass: every part the .docx saves, as the writer
  // saves it (F1-HDR-FTR), and the always-redact list's terms beside the table's rows (F5-TERMS).
  // Asked of the body alone, a header "Prepared for Mr Kierkegaard" and a footer's path
  // "DMS\Clients\Kierkegaard\memo-v3.docx" beside a kept "Søren Kierkegaard" were saved under "no
  // fragments of listed names survive"; asked of the rows alone, "Mr Kestrel12" beside a listed
  // "Kestrel Capital Partners" with no row was copied under the same line.
  const fragLine = (r) => r.split('\n').find((l) => l.startsWith('fragment check')) ?? '(no receipt)';
  {
    const BODY = 'Søren Kierkegaard signed. Anna Tan agreed.';
    const hfPkg = await makeDocx({ body: para(BODY), header: para('Prepared for Mr Kierkegaard'), footer: para('DMS\\Clients\\Kierkegaard\\memo-v3.docx') });
    const hfText = await textOf(hfPkg);
    const hfFile = () => doc(hfText, skRows(), { kind: 'docx', badge: 'DOCX', name: `${NAME}.docx`, bytes: hfPkg });
    const hfF = hfFile();
    const hf = open(hfF, []);
    await hf.settle(landed);
    const hfp = flat(hf.tree);
    const hfr = await receiptText(hf);
    if (!fragReads(fragLine(hfr), FRAG_WHERE_DOCX) || !warnReads(hfp, FRAG_WHERE_DOCX)) fragReadBad.push(`the .docx header and footer: ${fragLine(hfr).slice(0, 160)}`);
    check(landed(hf) && hfText === BODY && exportPlan(hfF, [], PRACTICE).red === '[Person2] signed. [Person1] agreed.' && hfp.includes(FRAG_SAYS('Kierkegaard')) && FRAG_COUNTS.test(hfr) && button(hf, 'Save redacted .docx…')?.disabled === false,
      'a .docx whose header and footer carry the surname of a kept "Søren Kierkegaard" its body masks: the page names "Kierkegaard", the receipt counts one, and the .docx stays open', `${hfp.slice(hfp.indexOf('⚠ Partial'), hfp.indexOf('⚠ Partial') + 60)} · ${fragLine(hfr)}`);
    const BodyOnly = await screenWith('screens/Export.tsx', [['[plan.readable, ...others].join(`\\n${TAG_BLANK}\\n`)', 'plan.readable']]);
    store.set('simpler-legal.protected-terms', '[]');
    const hw = mount({ file: hfFile() }, BodyOnly);
    await hw.settle(landed);
    const hwr = await receiptText(hw);
    check(landed(hw) && !flat(hw.tree).includes('Partial names may survive') && /^fragment check: no partial name of a listed name found\. Read: /m.test(hwr),
      '  CONTROL: with the check asked of the body alone, as it was, the page shows no ⚠ and the receipt says no fragment survives — the check above can fail', fragLine(hwr));

    const KT = 'Mr Kestrel12 replied. Anna Tan signed.';
    const KTL = ['Kestrel Capital Partners'];
    const ktF = doc(KT, [anna]);
    const kt = open(ktF, KTL);
    const ktp = flat(kt.tree);
    const ktr = await receiptText(kt);
    if (!fragReads(fragLine(ktr), FRAG_WHERE_TXT) || !warnReads(ktp, FRAG_WHERE_TXT)) fragReadBad.push(`a listed term: ${fragLine(ktr).slice(0, 160)}`);
    check(exportPlan(ktF, KTL, PRACTICE).red === 'Mr Kestrel12 replied. [Person1] signed.' && ktp.includes(FRAG_SAYS('Kestrel')) && FRAG_COUNTS.test(ktr) && button(kt, 'Copy redacted text')?.disabled === false,
      'a word of a term on the always-redact list, the term with no row ("Mr Kestrel12" for "Kestrel Capital Partners"): the page names "Kestrel", the receipt counts one, and the copy stays open', `${ktp.slice(ktp.indexOf('⚠ Partial'), ktp.indexOf('⚠ Partial') + 60)} · ${fragLine(ktr)}`);
    const RowsOnly = await screenWith('screens/Export.tsx', [['fragmentTerms(file.entities, snap.terms)', '[]']]);
    store.set('simpler-legal.protected-terms', JSON.stringify(KTL));
    const kw = mount({ file: doc(KT, [anna]) }, RowsOnly);
    const kwr = await receiptText(kw);
    check(!flat(kw.tree).includes('Partial names may survive') && /^fragment check: no partial name of a listed name found\. Read: /m.test(kwr),
      '  CONTROL: with the check asked of the table\'s rows alone, as it was, the page shows no ⚠ and the receipt says no fragment survives — the check above can fail', fragLine(kwr));
    check(!fragReadBad.length, 'the receipt\'s fragment line and the ⚠ say what the check read — the copied text and the .txt, and of a .docx the dry run wrote its other text parts — with its floors, and that it does not read inside a plain word of letters (owner ruling 21)', fragReadBad.join(' | '));
    const r6 = ['fragment check: no fragments of listed names survive', 'fragment check: 1 partial name(s) of listed names may survive — not named here; the Export screen lists them', fragLine(hfr).replace(FRAG_WHERE_DOCX, FRAG_WHERE_TXT), fragLine(ktr).replace('from four letters, from two', 'from two')];
    const warnR6 = '⚠ Partial names may survive: Kestrel — read the redacted copy once before sending. The check can only vouch for names on the list.';
    check(r6.every((l, i) => !fragReads(l, i === 2 ? FRAG_WHERE_DOCX : FRAG_WHERE_TXT)) && !warnReads(warnR6, FRAG_WHERE_TXT) && !warnReads(hfp, FRAG_WHERE_TXT),
      '  CONTROL: the round-6 lines, a .docx receipt that names the text exports alone, a floor said otherwise, and the round-6 ⚠ each fail the pin above');
    const r7Where = fragLine(hfr).replace(FRAG_WHERE_DOCX, FRAG_WHERE_DOCX_R7), r7How = fragLine(ktr).replace(FRAG_HOW, FRAG_HOW_R7);
    check(fragLine(hfr).includes(FRAG_WHERE_DOCX) && fragLine(ktr).includes(FRAG_HOW) && !fragReads(r7Where, FRAG_WHERE_DOCX) && !fragReads(r7How, FRAG_WHERE_TXT)
      && hfp.includes(FRAG_WHERE_DOCX) && !warnReads(hfp.replace(FRAG_WHERE_DOCX, FRAG_WHERE_DOCX_R7), FRAG_WHERE_DOCX) && !warnReads(ktp.replace(FRAG_HOW, FRAG_HOW_R7), FRAG_WHERE_TXT),
      '  CONTROL: round 7\'s first-pass line, "every part … that holds text" and "a title, a designator or a particle", fails the pin above on the receipt and beside the ⚠');
  }

  // 18za — the second pass's cases (SECOND, owner rulings 18 and 19) on the Export page: the
  // clipboard carries what every path carries (law 44), and the name key reverses every tag it
  // carries. Each CONTROL mounts the page with the ruling as it was, in the copy of docxWrite.ts
  // the page bundles, and the clipboard carries the name.
  for (const c of SECOND) {
    const pkg = await makeDocx({ body: c.xml ?? para(c.T) });
    const TEXT = await textOf(pkg);
    const zf = () => doc(TEXT, syncFloorRows(TEXT, c.rows(), PRACTICE), { kind: 'docx', badge: 'DOCX', name: `${NAME}.docx`, bytes: pkg });
    const zm = open(zf(), []);
    await zm.settle(landed);
    const copied = (await press(zm, 'Copy redacted text')) ? clip.at(-1) : '(copy shut)';
    const key = await fileOf(zm, 'Name key (.txt)');
    const tags = [...new Set(copied.match(/\[[A-Za-z]+\d+\]/g) ?? [])];
    const keyed = tags.every((t) => new RegExp(`^${reOf(t)}\\t`, 'm').test(key));
    check(landed(zm) && copied.replace(/\s+/g, ' ') === c.want && tags.length > 0 && keyed,
      `${c.label}: the Export clipboard carries it masked as every path does, and the name key reverses each tag it carries`, `${JSON.stringify(copied)} · key ${JSON.stringify(key.split('\n').filter((l) => /^\[/.test(l)))}`);
    const Was = await screenWith('lib/extract/docxWrite.ts', RULING_WAS[c.was]);
    store.set('simpler-legal.protected-terms', '[]');
    const wm = mount({ file: zf() }, Was);
    await wm.settle(landed);
    const wc = (await press(wm, 'Copy redacted text')) ? clip.at(-1) : '(copy shut)';
    check(c.ships.test(wc), `  CONTROL: with ${c.why}, the page copies ${c.ships} — the check above can fail`, JSON.stringify(wc));
  }


  // the copy, and a readable word printed on it stands beside what the receipt says of it:
  // "by your explicit decision: S1234567D" beside "1 declared term is readable in this export
  // because you left its row visible" told the provider which readable word is on the firm's
  // always-redact list, and "partial name(s) may survive: Hastings" that "Hastings" is part of
  // a name the copy masks. Every page this law opened is read — a held one through its shut
  // button's handler — and three more that print each kind of name the page shows.
  const vis = open(doc('Anna Tan signed for Osprey. Osprey pays on completion.', [{ ...anna, dead: true, status: 'ignored' }, row('o', 'Osprey', '[Company1]', 'COMPANY', 'org')]), []);
  const frag = open(doc('Hastings Holdings Ltd agreed the price. The deed was signed for Hastings.', [row('h', 'Hastings Holdings Ltd', '[Company1]', 'COMPANY', 'org')]), []);
  const NRIC = 'S1234567D';
  const nText = `Client ref ${NRIC} is on file. The schedule repeats S1234­567D. Anna Tan signed.`;
  const nEnts = syncFloorRows(nText, syncFloorRows(nText, withProtectedTerms(nText, [anna], [NRIC]), PRACTICE).map((e) => (e.cat === 'protected' ? { ...e, dead: true, status: 'ignored' } : e)), PRACTICE);
  const under = open(doc(nText, nEnts), [NRIC]);
  // and the lines the scan did not reach: boilerplate left visible, a verification that failed
  // (its receipt button stays open, so the line is saved), and the file line, which names the
  // document by its code — every page here carries a client's name as its file name
  const junk = open(doc('Harbourmaster provisions apply. Anna Tan signed.', [anna, { ...row('j', 'Harbourmaster provisions', '[Term1]', 'TERM', 'term'), junk: true, dead: true, status: 'ignored' }]), []);
  // a kept engine name glued to a CJK name the list masks: the footprint refuses the glued edge
  // and the export reads "Kestrel" beside the tag, so verification fails (the glue to a number
  // it once used here now places — law 28). Since law 34 the engine reads "Kestrel" run together
  // against the CJK and masks it, so this page is opened on the screen with the engine without
  // that rule: what is read here is what the page prints of a failed verification, and the
  // screen's code is the app's.
  const ExportNoRun = (await mutantOf(join(here, '..', 'src', 'screens', 'Export.tsx'), [], [noPdf, hooksRuntime, engineNoRun],
    { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' })).Export;
  const VF = 'Call Kestrel東京商事 today. Anna Tan signed.';
  const vf = open(doc(VF, syncFloorRows(VF, withProtectedTerms(VF, [anna, row('k', 'Kestrel', '[Company1]', 'COMPANY', 'org')], ['東京商事'], PRACTICE), PRACTICE)), [], {}, ExportNoRun);
  check(/You chose to leave 1 visible: Anna Tan/.test(flat(vis.tree)) && /Partial names may survive: Hastings/.test(flat(frag.tree)) && /left readable while it sat under Protected terms: S1234567D/.test(flat(under.tree))
    && button(vf, 'Export receipt')?.disabled === false && NR.exportPlan(vf.file, [], PRACTICE).survivors.map((e) => e.text).join() === 'Kestrel'
    && exportPlan(vf.file, [], PRACTICE).verified && exportPlan(vf.file, [], PRACTICE).red === 'Call [Company1][Protected3] today. [Person1] signed.',
    'setup: the page, on the lawyer\'s own machine, names the name left visible, the partial name, and the term left readable under Protected terms (law 19); a page whose verification failed still saves its receipt (and on the app\'s engine the same document masks "Kestrel" and verifies)');
  // a failed verification said "1 listed span(s) still present — export held": a count, no
  // name and no way through, on the page of the lawyer who has to find it
  const vfPage = flat(vf.tree);
  check(/Double-checked: a row you chose to redact is still readable in this copy, whole or in part — Kestrel — so the export is held\. In Review, find it in the document, select the whole word it is written into and redact it\./.test(vfPage) && !/listed span\(s\) still present/.test(vfPage),
    'the page names the row that failed verification and gives the way through', vfPage.slice(vfPage.indexOf('Double-checked'), vfPage.indexOf('Double-checked') + 240));
  const { Export: CountOnly } = await mutantOf(join(here, '..', 'src', 'screens', 'Export.tsx'), [["        : `${survivors.length === 1 ? 'a row'", "        : `${survivors.length} listed span(s) still present — export held` || `${survivors.length === 1 ? 'a row'"]], [noPdf, hooksRuntime, engineNoRun],
    { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' });
  const vfWas = flat(mount({ file: vf.file }, CountOnly).tree);
  check(/1 listed span\(s\) still present — export held/.test(vfWas) && !/— Kestrel —/.test(vfWas),
    'CONTROL: with the line as it was, the page counts one span and names neither it nor what to do — the check above refuses it');
  // three letters and up: Tan, Lim and Ong are whole surnames, and at four a receipt that
  // printed "Tan" beside "by your explicit decision" passed the scan
  const words = (s) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3));
  const namesOf = ({ m, terms }) => {
    const ents = m.file.entities ?? [];
    const frags = survivingFragments(exportPlan(m.file, terms, PRACTICE).red, ents.filter((e) => !e.dead && !isFloorRow(e)));
    return [...new Set([...ents.map((e) => e.text), ...terms, ...frags, m.file.name.replace(/\.[^.]+$/, '')].flatMap((s) => [...words(s)]))];
  };
  const named = (receipt, names) => { const w = words(receipt); return names.filter((x) => w.has(x)); };
  const receiptOf = async (m) => {
    const b = button(m, 'Export receipt');
    const k = saved.length;
    if (b) { await b.onClick(); m.flush(); }
    return saved.length > k && /^receipt-/.test(saved.at(-1).name) ? await saved.at(-1).blob.text() : null;
  };
  const read = [];
  for (const p of pages) read.push({ p, r: await receiptOf(p.m), names: namesOf(p) });
  const bad = read.filter((x) => x.r === null || named(x.r, x.names).length);
  check(read.length >= 12 && !bad.length,
    `the receipt of every one of the ${read.length} pages this law opened carries no word of a name on its table, a term on its list or a partial name it found`,
    bad.map((x) => (x.r === null ? 'no receipt' : named(x.r, x.names).join(', '))).join(' / '));
  const rOf = (m) => read.find((x) => x.p.m === m)?.r ?? '';
  check(/1 left visible — 0 boilerplate, 1 by your explicit decision, not named here/.test(rOf(vis)) && /1 by your explicit decision, not named here/.test(rOf(under))
    && /^fragment check: 1 partial name\(s\) of listed names may survive — not named here/m.test(rOf(frag))
    && /1 left visible — 1 boilerplate/.test(rOf(junk)) && /^verify-by-extraction: FAILED — 1 span\(s\) survived$/m.test(rOf(vf)) && /^file: redacted-[0-9A-Z]{7} — /m.test(rOf(vf)),
    'each is still counted', [rOf(vis), rOf(under), rOf(frag), rOf(junk), rOf(vf)].map((r) => r.split('\n').filter((l) => /left visible|fragment check|verify-by/.test(l)).join(' / ')).join(' || '));
  check(/^fragment check: no partial name of a listed name found\. Read: /m.test(rOf(cardPage)) && /^verify-by-extraction: none of the listed spans appear in the export$/m.test(rOf(cardPage)),
    'the receipt of the "Card" page counts no partial name and no span that survived (18j)', rOf(cardPage).split('\n').filter((l) => /fragment check|verify-by/.test(l)).join(' / '));
  const was = [
    [vis, rOf(vis).replace('by your explicit decision, not named here', 'by your explicit decision: Anna Tan')],
    [vis, rOf(vis).replace('by your explicit decision, not named here', 'by your explicit decision: Tan')],
    [under, rOf(under).replace('by your explicit decision, not named here', `by your explicit decision: ${NRIC}`)],
    [frag, rOf(frag).replace(/^fragment check: .*$/m, 'fragment check: 1 partial name(s) may survive: Hastings')],
    [junk, rOf(junk).replace('1 boilerplate', '1 boilerplate: Harbourmaster provisions')],
    [vf, rOf(vf).replace(/^(verify-by-extraction: FAILED — 1 span\(s\) survived)$/m, '$1: Kestrel')],
    [vf, rOf(vf).replace(/^file: (redacted-[0-9A-Z]{7}) — /m, `file: $1 (${NAME}.txt) — `)],
  ];
  check(was.every(([m, r]) => r !== rOf(m) && named(r, namesOf(pages.find((p) => p.m === m))).length > 0),
    'CONTROL: each line as it would print a name — the names left visible, the partial names, the boilerplate left visible, the spans that survived, the file\'s own name — trips the scan');

  // 18m — the name key names the rows the lawyer left readable (owner ruling, 2026-09-23), in
  // both files, and the receipt, which travels, still names none of them. The rows it lists are
  // the ones the export carries readable: "Phone", left readable beside a kept "Phone Lim", is
  // readable nowhere — its one occurrence is inside the kept name, and the only "phone" in the
  // bytes is the [phone] tag — so a key that listed it would be wrong about the copy.
  const KT = 'Anna Tan signed for Osprey. Phone Lim called from 61234567. Harbourmaster provisions apply.';
  const kEnts = syncFloorRows(KT, [{ ...anna, dead: true, status: 'ignored' }, row('o', 'Osprey', '[Company1]', 'COMPANY', 'org'), row('l', 'Phone Lim', '[Person2]', 'PERSON', 'person'),
    { ...row('f', 'Phone', '[Term1]', 'TERM', 'term'), dead: true, status: 'ignored' }, { ...row('j', 'Harbourmaster provisions', '[Term2]', 'TERM', 'term'), junk: true, dead: true, status: 'ignored' }], PRACTICE);
  const km = open(doc(KT, kEnts), []);
  const keyOf = async (m, label) => { const k = saved.length; await press(m, label); return saved.length > k ? await saved.at(-1).blob.text() : ''; };
  const kTxt = await keyOf(km, 'Name key (.txt)');
  const kJson = JSON.parse((await keyOf(km, 'Name key (.json)')) || '{}');
  const section = kTxt.slice(kTxt.indexOf('# Left readable by your decision')).split('\n');
  check(section[0] === '# Left readable by your decision' && section.slice(2).join('|') === 'Anna Tan|Harbourmaster provisions\tboilerplate'
    && JSON.stringify(kJson.leftReadable) === JSON.stringify([{ original: 'Anna Tan', cls: 'PERSON' }, { original: 'Harbourmaster provisions', cls: 'TERM', boilerplate: true }]) && /^Left readable by your decision — /.test(kJson.leftReadableNote),
    'both name keys list the rows left readable, each once, the boilerplate marked — and not "Phone", which the export masks inside "Phone Lim"', JSON.stringify(section) + ' · ' + JSON.stringify(kJson.leftReadable));
  const kReceipt = await receiptOf(km);
  check(!!kReceipt && !named(kReceipt, ['anna', 'harbourmaster', 'provisions']).length && /2 left visible — 1 boilerplate, 1 by your explicit decision, not named here/.test(kReceipt),
    'the receipt of that page counts the two and names neither', (kReceipt ?? '').split('\n').filter((l) => /left visible/.test(l)).join(' / '));
  const underKey = await keyOf(under, 'Name key (.txt)');
  check(underKey.split('\n').includes(`${NRIC}\ton your always-redact list`),
    'a row left readable under Protected terms is marked in the key as on the always-redact list', underKey.slice(underKey.indexOf('# Left readable')));
  const underJson = JSON.parse((await keyOf(under, 'Name key (.json)')) || '{}');
  check((underJson.leftReadable ?? []).some((x) => x.original === NRIC && x.onAlwaysRedactList === true) && !(kJson.leftReadable ?? []).some((x) => 'onAlwaysRedactList' in x),
    'the .json key flags that row as on the always-redact list, and no row left readable that is not', JSON.stringify(underJson.leftReadable));
  const NO_FLAG = [['...(listedLeft.includes(e) ? { onAlwaysRedactList: true } : {})', '...({})']];
  const { Export: NoFlag } = await mutantOf(join(here, '..', 'src', 'screens', 'Export.tsx'), NO_FLAG, [noPdf, hooksRuntime],
    { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' });
  const noFlagJson = JSON.parse((await keyOf(open(doc(nText, nEnts), [NRIC], {}, NoFlag), 'Name key (.json)')) || '{}');
  check((noFlagJson.leftReadable ?? []).some((x) => x.original === NRIC) && !(noFlagJson.leftReadable ?? []).some((x) => x.onAlwaysRedactList),
    'CONTROL: without the flag, the row is listed with nothing to say it is on the list — the check above can fail');
  // A term on the list left readable under Protected terms, whose words a kept name covers in
  // part ("Tan" of "Tan Wei Ling" in "Mrs Margaret Tan Wei Ling"): still on the list, and "Wei
  // Ling" still readable. The key listed it "in part" with no mark and the receipt's count of
  // listed terms left readable left it out, so a key read later said the copy carried none.
  const LP = 'Mrs Margaret Tan Wei Ling attended the meeting. Anna Tan signed.';
  const lpEnts = syncFloorRows(LP, withProtectedTerms(LP, [anna, row('m', 'Mrs Margaret Tan', '[Person2]', 'PERSON', 'person')], ['Tan Wei Ling'], PRACTICE), PRACTICE)
    .map((e) => (e.cat === 'protected' ? { ...e, dead: true, status: 'ignored' } : e));
  const lpPlan = exportPlan(doc(LP, lpEnts), ['Tan Wei Ling'], PRACTICE);
  const lpKey = async (component) => {
    const m = open(doc(LP, lpEnts), ['Tan Wei Ling'], {}, component);
    const txt = await keyOf(m, 'Name key (.txt)');
    return { txt, json: JSON.parse((await keyOf(m, 'Name key (.json)')) || '{}'), receipt: (await receiptOf(m)) ?? '', page: flat(m.tree) };
  };
  const lp = await lpKey();
  const LP_LINE = /always-redact list: 1 declared term is readable in this export \(in part\) because you left its row visible in the review, where it was marked as a term from the list/;
  check(lpPlan.red.includes('Wei Ling attended') && !lpPlan.blocked && lpPlan.maskedAnyway.some((m) => m.e.text === 'Tan Wei Ling' && m.by?.partly),
    'setup: the listed term left readable under Protected terms ships "Wei Ling", masked in part by the kept name, and the page is not held', lpPlan.red);
  check(lp.txt.split('\n').includes('Tan Wei Ling\tin part\ton your always-redact list') && (lp.json.leftReadable ?? []).some((x) => x.original === 'Tan Wei Ling' && x.inPart === true && x.onAlwaysRedactList === true)
    && LP_LINE.test(lp.receipt) && !named(lp.receipt, ['wei', 'ling']).length
    && /It is a term on your always-redact list, left readable while it sat under Protected terms: Tan Wei Ling\./.test(lp.page),
    'a listed term left readable in part keeps its list mark in both keys and on the page, and the receipt counts it, marked "(in part)", naming nothing', `${lp.txt.slice(lp.txt.indexOf('# Left readable'))} · ${lp.receipt.split('\n').filter((l) => /always-redact/.test(l)).join(' / ')}`);
  const { Export: NoPartly } = await mutantOf(join(here, '..', 'src', 'screens', 'Export.tsx'), [['const listedLeft = [...listedVisible, ...listedPartly];', 'const listedLeft = [...listedVisible];']], [noPdf, hooksRuntime],
    { contents: `export { default as Export } from ${screen};`, resolveDir: join(here, '..'), loader: 'ts' });
  const lpWas = await lpKey(NoPartly);
  check(lpWas.txt.split('\n').includes('Tan Wei Ling\tin part') && !(lpWas.json.leftReadable ?? []).some((x) => x.onAlwaysRedactList) && !/always-redact list: 1 declared term/.test(lpWas.receipt),
    'CONTROL: counted from the rows readable whole alone, as it was, the key lists the term in part with no mark and the receipt leaves it out — the check above can fail');
  const everyOff = kEnts.filter((e) => e.dead && !isFloorRow(e)).map((e) => e.text);
  check(everyOff.includes('Phone') && exportPlan(km.file, [], PRACTICE).maskedAnyway.some((m) => m.e.text === 'Phone'),
    'CONTROL: listed from every row switched off, as a key could be, the section would name "Phone", which the export masks — the check above tells the two apart');

  // 18n — what the .docx writer removed whole or renamed, in its own sentences (docxWrite.ts
  // notes), on the page once the file is saved and on the receipt. The page read the one
  // warning the writer stopped emitting when it began renaming a chart's worksheets, and said
  // nothing of any of it: a bookmark renamed, a style renamed, a part it does not know kept.
  const bmPkg = await makeDocx({ body: `<w:p><w:bookmarkStart w:id="0" w:name="Harbour_draft"/><w:r><w:t xml:space="preserve">${TEXT}</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>` });
  const bmFile = doc(await textOf(bmPkg), [anna], { kind: 'docx', badge: 'DOCX', name: `${NAME}.docx`, bytes: bmPkg });
  const bm = open(bmFile, []);
  await bm.settle(landed);
  const BM = 'The bookmark the author made was renamed bm1, whatever it was called';
  const bmReceipt = await receiptOf(bm);
  await press(bm, 'Save redacted .docx…');
  const bmPage = flat(bm.tree);
  check(!!bmReceipt?.split('\n').some((l) => l.startsWith('redacted .docx: ') && l.includes(BM)) && bmPage.includes(BM) && bmPage.includes('1 shape or bookmark name (replaced)'),
    'the writer\'s note is on the receipt and, once the file is saved, on the page, beside what it counted', bmPage.slice(bmPage.indexOf('Saved the redacted .docx'), bmPage.indexOf('Saved the redacted .docx') + 320));
  const bmReport = await writeRedactedDocx(bmPkg, { mask: exportPlan(bmFile, [], PRACTICE).docx.mask });
  check(bmReport.notes.some((n) => n.includes(BM)) && !bmReport.warnings.some((w) => /worksheet name/.test(w)),
    'CONTROL: the warning the page used to read is not in the report, so a page reading it said nothing of the renamed bookmark');

  // 18i — a document whose finish a later change took off: its one button opens the review,
  // where the note that says what changed stands. Mounted apart from `pages` — it has no
  // receipt to read. Sent to the queue instead, the lawyer lands where the note is not.
  store.set('simpler-legal.protected-terms', '[]');
  const went = [];
  const spies = { onReview: () => went.push('review'), onHome: () => went.push('home'), onBack: () => went.push('back') };
  const reopenedDoc = doc(TEXT, [anna], { reviewed: false, reopened: 'A row was changed after you finished: 1 name is now readable.' });
  const reo = mount({ file: reopenedDoc, ...spies });
  check(/Changed since you finished — finish again\./.test(flat(reo.tree)) && buttonsOf(reo.tree).map((b) => b.label).join() === 'Open the review' && await press(reo, 'Open the review') && went.join() === 'review',
    'the reopened page\'s one button, "Open the review", opens the review', JSON.stringify(went));
  const wrong = [];
  const astray = mount({ file: reopenedDoc, ...spies, onReview: () => wrong.push('home') });
  check(await press(astray, 'Open the review') && wrong.join() === 'home', 'CONTROL: a button wired to the queue records "home", which the check above refuses');

  store.delete('simpler-legal.practice');
}

// ── LAW 19: a choice made under Protected terms, and the safety-net row added beside it ──
console.log('\n— law 19: a row left readable under Protected terms governs, whatever safety-net row the table gains beside it —');
{
  const anna = row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person');
  const TERM = 'S1234567D';
  const TEXT = `Client ref ${TERM} is on file. The schedule repeats S1234­567D. Anna Tan signed.`;
  const floor = (ents) => syncFloorRows(TEXT, ents, PRACTICE);
  const input = (entities) => ({ text: TEXT, entities, reviewed: true, engineComplete: true, kind: 'text' });
  // declared before the drop: a protected row, and the floor finds nothing left to match. The
  // lawyer leaves it readable in the review; App syncs the floor rows on that write, and the
  // pattern now matches the plain form.
  const declared = floor(withProtectedTerms(TEXT, [anna], [TERM]));
  const left = floor(declared.map((e) => (e.cat === 'protected' ? { ...e, dead: true, status: 'ignored' } : e)));
  const own = left.filter((e) => termKey(e.text) === termKey(TERM));
  check(!declared.some(isFloorRow) && own.length === 2 && own.some((e) => isFloorRow(e) && !e.dead) && own.some((e) => e.cat === 'protected' && e.dead && !isFloorRow(e)),
    'setup: left readable under Protected terms, the term gains a live safety-net row beside it', JSON.stringify(own.map((e) => [e.tag, e.cat, !!e.dead])));
  const plan = exportPlan(input(left), [TERM], PRACTICE);
  check(!plan.blocked && plan.holds.length === 0 && plan.stillIn.some((e) => e.cat === 'protected' && termKey(e.text) === termKey(TERM)),
    'the choice governs: the page is not held, and counts the term among those the lawyer left readable under Protected terms', `${JSON.stringify(plan.holds)} ${plan.red}`);
  const dm = docxMaskTable(left, [TERM]);
  check(dm.channel.length === 0 && dm.table === left, 'the .docx asks it the same way: nothing is minted over that choice');
  // CONTROLS: the rule as it was, over every row of the term, the safety-net row included
  const leftUnder = (e) => !!e.dead && e.cat === 'protected' && !isFloorRow(e);
  const asWas = (exported, ents, terms) => terms.filter((t) => {
    const rows = ents.filter((e) => termKey(e.text) === termKey(t));
    return !(rows.length && rows.every((e) => e.dead) && rows.some(leftUnder)) && protectedRegex(t, 'i').test(exported);
  });
  check(asWas(plan.red, left, [TERM]).length === 1, 'CONTROL: asked over every row of the term, the safety-net row included, the page is held — on the soft-hyphen form the pattern does not match');
  const pressed = floor(withProtectedTerms(TEXT, left, asWas(plan.red, left, [TERM])));
  check(JSON.stringify(pressed) === JSON.stringify(left) && asWas(exportPlan(input(pressed), [TERM], PRACTICE).red, pressed, [TERM]).length === 1,
    'CONTROL: and "Mask it in every form" leaves that table as it was, so the page stays held press after press', JSON.stringify(pressed.map((e) => [e.tag, !!e.dead])));
}
{
  // The choice governs only while every row of the term is left readable. Beside it here is a
  // live row of the curly-apostrophe form the lawyer added by hand: the .docx takes that row as
  // the term's and masks the straight form with it, so the .txt, which leaves the straight form
  // readable, would not be the .docx. The page is held on it.
  const TERM = "O'Brien Kessler LLP";
  const TEXT = 'Signed, O’Brien Kessler LLP. Reply to O\'Brien Kessler LLP. Anna Tan signed.';
  const ents = [
    row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person'),
    { ...row('p', TERM, '[Protected2]', 'PROTECTED', 'protected'), dead: true, status: 'ignored' },
    { ...row('h', 'O’Brien Kessler LLP', '[Company3]', 'COMPANY', 'org'), prov: 'added by you' },
  ];
  const plan = exportPlan({ text: TEXT, entities: ents, reviewed: true, engineComplete: true, kind: 'text' }, [TERM], PRACTICE);
  const docxBody = remask(TEXT, docxMaskTable(ents, [TERM]).table, PRACTICE).text;
  check(plan.blocked && plan.holds.map((h) => h.why).join() === 'other-form' && plan.red.includes("Reply to O'Brien Kessler LLP") && docxBody.includes('Reply to [Company3]'),
    'a live row of the term beside the one left readable under Protected terms: the .docx masks the straight form, the .txt does not, and the page is held', `${JSON.stringify(plan.holds)} · ${plan.red} · .docx ${docxBody}`);
  const own = ents.filter((e) => termKey(e.text) === termKey(TERM) && !isFloorRow(e));
  const leftUnder = (e) => !!e.dead && e.cat === 'protected' && !isFloorRow(e);
  const governsIfSome = own.some((e) => e.dead) && own.some(leftUnder);
  const governsIfEvery = own.every((e) => e.dead) && own.some(leftUnder);
  check(governsIfSome && !governsIfEvery && protectedRegex(TERM, 'i').test(plan.readable),
    'CONTROL: asked whether SOME row of the term is left readable, not every one, the choice governs, nothing is held, and the .txt ships the straight form the .docx masks');
}

// ── LAW 20: a protected row is asked whether it survived with the match its mask used ──
console.log('\n— law 20: the export\'s survivors are asked with each row\'s own match —');
{
  // A name glued to a number the safety-net pattern takes, with a zero-width space inside the
  // name. The engine's footprint does not match through the zero-width space and calls it
  // masked; the row's own match reads it. Since law 25 the row places where the pattern cuts
  // the number off it, so the export no longer carries it: the survivor check is run on the
  // engine with that cut taken out (NO_CUT), and the run-together rule (law 34), which places
  // it too, where the name stands alone in the export as it did — the check itself,
  // exportPlan's row-by-row reading, is the same code in both. (The setup was
  // "Kestrel東京​商事" until law 22, which placed that one.)
  const TEXT = 'Call Kes​trel61234567 today.';
  const ents = [row('k', 'Kestrel', '[Protected1]', 'PROTECTED', 'protected')];
  const input = { text: TEXT, entities: ents, reviewed: true, engineComplete: true, kind: 'text' };
  const NC = await engineWith([...NO_CUT, ...NO_RUN]);
  const was = NC.exportPlan(input, [], PRACTICE);
  check(was.red.includes('Kes​trel[phone]') && was.survivors.map((e) => e.text).join() === 'Kestrel' && was.blocked && !was.verified,
    'a protected row the export still carries in a form only its own match reads is a survivor, and the export is held', `${was.red} · survivors ${JSON.stringify(was.survivors.map((e) => e.text))}`);
  check(!ents.some((e) => spanSurvives(was.readable, e.text)), 'CONTROL: asked with the engine\'s footprint, as the check once asked every row, nothing survives and the export would ship');
  const plan = exportPlan(input, [], PRACTICE);
  check(plan.red === 'Call [Protected1][phone] today.' && !plan.survivors.length && !plan.blocked,
    'and today the row places where the pattern cuts the number off it: nothing survives, nothing is held (law 25)', plan.red);
}

// ── LAW 21: the tags an export writes are not words in it ──
console.log('\n— law 21: a tag the export wrote is not a readable word —');
{
  // A declared "Phone", "Card" or "Date" was read in the "[phone]", "[card]" and "[Date]" the
  // mask put there: the page was held on a term with no readable occurrence, its button
  // changed nothing press after press, and it said the term had no row or was written
  // another way. A client called Card or Place is a plausible entry on a firm's list.
  const anna = row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person');
  const strip = (text, ents, terms) => syncFloorRows(text, withProtectedTerms(text, ents, terms), PRACTICE);
  const input = (text, entities) => ({ text, entities, reviewed: true, engineComplete: true, kind: 'text' });
  const cases = [
    // [term, text, the engine's rows, the tag the export writes that spells the term]
    ['Phone', 'Call 6123 4567 today. Anna Tan signed.', [anna], '[phone]'],
    ['Card', 'Mr Card paid 4111 1111 1111 1111 on 3 May. Anna Tan signed.', [anna], '[card]'],
    ['Date', 'Signed on 3 May 2024. Anna Tan signed.', [anna, row('d', '3 May 2024', '[Date]', 'DATE', 'date')], '[Date]'],
  ];
  for (const [TERM, TEXT, eng, TAG] of cases) {
    let ents = strip(TEXT, eng, []);
    let plan = exportPlan(input(TEXT, ents), [TERM], PRACTICE);
    // the lawyer presses the hold's button while there is one — "Card" is a word in its text
    for (let i = 0; i < 3 && plan.holds.length; i++) { ents = strip(TEXT, ents, plan.holds.map((h) => h.term)); plan = exportPlan(input(TEXT, ents), [TERM], PRACTICE); }
    const before = exportPlan(input(TEXT, strip(TEXT, eng, [TERM])), [TERM], PRACTICE);
    const kept = ents.filter((e) => !e.dead && !isFloorRow(e));
    check(plan.red.includes(TAG) && !plan.blocked && plan.verified && survivingFragments(plan.readable, kept).length === 0 && before.red === plan.red && !before.blocked,
      `"${TERM}" beside the ${TAG} the export wrote: not held, no survivor, no partial name, and the export is the one declared before the drop`, `${plan.red} · holds ${JSON.stringify(plan.holds)}`);
    check(listHolds(plan.red, ents, [TERM]).length === 1,
      `CONTROL: asked of the export's bytes, as every check was, ${TAG} holds "${TERM}" — press after press`, JSON.stringify(listHolds(plan.red, ents, [TERM])));
  }
  // the fragment check and the survivor check, as Export's page printed them for "Card"
  const TEXT = cases[1][1];
  const ents = strip(TEXT, [anna], ['Card']);
  const plan = exportPlan(input(TEXT, ents), ['Card'], PRACTICE);
  const card = ents.find((e) => e.text === 'Card');
  check(rowSurvives(plan.red, card) && survivingFragments(plan.red, [card]).join().toLowerCase() === 'card' && !rowSurvives(plan.readable, card),
    'CONTROL: asked of the bytes, "Card" survives and is a partial name — the "1 listed span(s) still present" and "Partial names may survive: Card" the page printed');
  // exportReadable keeps what the export leaves readable: the words, a floor row left readable
  const LEFT = 'Call 6123 4567 today. Anna Tan signed.';
  const left = syncFloorRows(LEFT, [anna], PRACTICE).map((e) => (isFloorRow(e) ? { ...e, dead: true, status: 'ignored' } : e));
  const lp = exportPlan(input(LEFT, left), ['6123 4567'], PRACTICE);
  check(lp.readable.includes('6123 4567') && lp.holds.length === 1 && lp.readable.split('\u0000').length === 2,
    'a number whose safety-net row was left readable stays readable in it, and holds the page; only the placed name is blanked', JSON.stringify(lp.readable));
}

// ── LAW 22: the original and the export are read with one match ──
console.log('\n— law 22: a term the export reads is one the original reads —');
{
  const anna = row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person');
  const strip = (text, ents, terms) => syncFloorRows(text, withProtectedTerms(text, ents, terms), PRACTICE);
  const input = (text, entities) => ({ text, entities, reviewed: true, engineComplete: true, kind: 'text' });
  // 22a — a CJK term glued to a Latin one. Guarded on its CJK edge, "東京商事" was refused after
  // the "l" of "Kestrel" in the original — no row, nothing placed — while the export, where
  // "[Protected2]" stood before it, read it: held on a term that was on the list at the drop,
  // "the list gained it" said of it, and a button that changed nothing.
  const TEXT = 'Kestrel東京商事 agreed the price. Anna Tan signed.';
  const LIST = ['Kestrel', '東京商事'];
  const cjk = row('t', '東京商事', '[Company1]', 'COMPANY', 'org');
  for (const [label, eng] of [['no engine row', [anna]], ['the engine found the CJK name too', [anna, cjk]]]) {
    const before = exportPlan(input(TEXT, strip(TEXT, eng, LIST)), LIST, PRACTICE);
    check(!before.blocked && /^\[[A-Za-z]+\d+\]\[[A-Za-z]+\d+\] agreed/.test(before.red), `${label}: declared before the drop, both are masked`, before.red);
    const late = strip(TEXT, eng, []);
    const held = exportPlan(input(TEXT, late), LIST, PRACTICE);
    const pressed = exportPlan(input(TEXT, strip(TEXT, late, held.holds.map((h) => h.term))), LIST, PRACTICE);
    check(held.blocked && !pressed.blocked && pressed.red === before.red, `${label}: declared after, one press masks both, as declared before`, `${JSON.stringify(held.holds)} → ${pressed.red}`);
  }
  check(protectedMatches(TEXT, '東京商事') === 1 && protectedMatches('新東京商事', '東京商事') === 1 && protectedMatches('Tanaka', 'Tan') === 0,
    'a CJK edge asks for no boundary; a Latin edge still does');
  const guarded = new RegExp('(?<!(?![\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}\\p{sc=Hangul}])[\\p{L}\\p{N}])東京商事', 'u');
  check(!guarded.test(TEXT) && guarded.test('[Protected2]東京商事 agreed'),
    'CONTROL: guarded on its CJK edge, the term is refused in the original and read once a tag stands where the Latin name was — the button could never lift that hold');

  // 22b — a zero-width space where the space was ("6123​4567", which renders as 61234567)
  const Z = 'Call 6123​4567 after hours. Anna Tan signed.';
  const T = '6123 4567';
  const zLate = strip(Z, [anna], []);
  const zHeld = exportPlan(input(Z, zLate), [T], PRACTICE);
  check(zHeld.blocked && zHeld.holds.length === 1 && zHeld.red.includes('6123​4567'), 'declared after the drop, the export carries the number in that form and the page is held on it', `${JSON.stringify(zHeld.holds)} ${JSON.stringify(zHeld.red)}`);
  const zBefore = exportPlan(input(Z, strip(Z, [anna], [T])), [T], PRACTICE);
  const zPressed = exportPlan(input(Z, strip(Z, zLate, [T])), [T], PRACTICE);
  check(!zBefore.blocked && !/4567/.test(zBefore.red) && zPressed.red === zBefore.red, 'declared before the drop it is masked, and one press gives the same export', zBefore.red);
  const INV = '\\u00ad\\u200b-\\u200d\\u2060\\ufeff';
  const oldSep = new RegExp(`6123[${INV}]*\\s[\\s${INV}]*4567`, 'u');
  check(!oldSep.test(Z) && !core.FLOOR_RULES.some(([re]) => new RegExp(re.source, re.flags.replace('g', '')).test('6123​4567')),
    'CONTROL: the separator as it was needed a real space, and the safety-net pattern does not read one either — the number shipped readable with no hold');
}

// ── LAW 23: one number, one tag, whatever else the table holds for it ──
console.log('\n— law 23: the .txt and the saved .docx tag a declared number alike —');
{
  const anna = row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person');
  const input = (text, entities, pkg) => ({ text, entities, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg });
  const partsOf = async (r) => {
    if (!r.bytes) return { body: `held: ${r.held}`, footer: '', header: '' };
    const items = (await extractDocx(r.bytes)).items;
    const of = (k) => items.filter((i) => i.kind === k).map((i) => i.text).join(' ');
    return { body: flowText(items.filter(inMainFlow)), footer: of('footer'), header: of('header') };
  };
  const minted = (text, tag) => ({ key: 'protch', text, tag, cat: 'protected', prov: 'pattern', occ: 0, status: 'confirmed', cls: 'PROTECTED' });

  // 23a — the engine's row of the number left readable, the safety-net row beside it, and then
  // the number declared. Any dead row of the term used to send it to a [ProtectedN] of the
  // list's own: the .txt said [nric], the .docx body and footer [Protected3], the name key
  // listed both, and the page told the lawyer the .txt left the number readable.
  for (const [TERM, CLS, CAT, FOOT] of [['S1234567D', 'ID', 'id', 'S1234­567D'], ['6123-4567', 'PHONE', 'contact', '6123‑4567']]) {
    const pkg = await makeDocx({ body: para(`Account ${TERM} was opened. Anna Tan signed.`), footer: para(`Client ref ${FOOT}`) });
    const TEXT = await textOf(pkg);
    const ents = syncFloorRows(TEXT, [{ ...row('n', TERM, '[Id1]', CLS, CAT), dead: true, status: 'ignored' }, anna], PRACTICE);
    const fl = ents.find((e) => isFloorRow(e) && !e.dead);
    check(!!fl && termKey(fl.text) === termKey(TERM), `${TERM}: setup — the engine's row left readable, the safety-net row beside it`, JSON.stringify(ents.map((e) => [e.text, e.tag, !!e.dead])));
    const plan = exportPlan(input(TEXT, ents, pkg), [TERM], PRACTICE);
    const p = await partsOf(await writeRedactedDocx(pkg, { mask: plan.docx.mask }));
    check(!plan.blocked && plan.red.includes(`Account ${fl.tag} was`) && p.body.includes(`Account ${fl.tag} was`) && p.footer === `Client ref ${fl.tag}` && plan.docx.channel.length === 0 && plan.docx.over.length === 0,
      `${TERM}: one tag, ${fl.tag}, in the .txt, the .docx body and its footer, and nothing reported as past the choice`, `${plan.red} | ${p.body} | ${p.footer}`);
    check(plan.maskedAnyway.some((m) => m.e.key === 'n' && m.by?.floor), `${TERM}: the page puts the row left readable down to the safety-net pattern, which masks it in the .txt`);
    const was = await partsOf(await writeRedactedDocx(pkg, { mask: (t) => remask(t, [...ents, minted(TERM, '[Protected3]')], PRACTICE) }));
    check(was.body.includes('Account [Protected3] was') && was.footer === 'Client ref [Protected3]',
      `${TERM}: CONTROL: with a [ProtectedN] of the list's own, as the table had it, the .docx says [Protected3] where the .txt says ${fl.tag}`, `${was.body} | ${was.footer}`);
  }

  // 23b — the pattern's match wider than the term: "+65 6123 4567" for a declared "6123 4567",
  // an address for a declared domain. The term alone placed "Call +65 [Protected2]" where the
  // .txt said "Call [phone]", and inside the address left "j.doe@" readable in the .docx body.
  const wide = [
    ['6123 4567', para('Call +65 6123 4567 today.') + para('Anna Tan countersigned.'), { footer: para('Ref 6123 4567') }, 'Call [phone] today', /\+65|6123/, 'footer', 'Ref [phone]', 'Call +65 [Protected2] today'],
    ['kestrelcapital', para('Write to j.doe@kestrelcapital.com today.') + para('Anna Tan countersigned.'), { header: para('KESTRELCAPITAL · Solicitors') }, 'Write to [email] today', /j\.doe|kestrel/i, 'header', '[Protected2] · Solicitors', 'Write to j.doe@[Protected2].com today'],
  ];
  const NW = await engineWith(NO_WHOLE_MATCH);
  for (const [TERM, body, more, SAYS, LEAK, PART, PART_SAYS, ALONE] of wide) {
    const pkg = await makeDocx({ body, ...more });
    const TEXT = await textOf(pkg);
    const ents = syncFloorRows(TEXT, [anna], PRACTICE);
    check(ents.some((e) => isFloorRow(e) && termKey(e.text) !== termKey(TERM) && protectedRegex(TERM, 'i').test(e.text)), `"${TERM}": setup — the safety-net row's match holds the term and is wider than it`);
    const plan = exportPlan(input(TEXT, ents, pkg), [TERM], PRACTICE);
    const p = await partsOf(await writeRedactedDocx(pkg, { mask: plan.docx.mask }));
    check(!plan.blocked && plan.red.includes(SAYS) && p.body.includes(SAYS) && !LEAK.test(p.body) && p[PART] === PART_SAYS,
      `"${TERM}": the .docx body is the .txt, and the ${PART} is masked`, `${plan.red} | ${p.body} | ${p[PART]}`);
    // the term's own row alone, as the table had it, is masked whole today by the whole-match
    // rule (law 26), so the CONTROL runs it on the engine without that rule
    const alone = await partsOf(await writeRedactedDocx(pkg, { mask: (t) => NW.remask(t, [...ents, minted(TERM, '[Protected2]')], PRACTICE) }));
    check(alone.body.includes(ALONE), `"${TERM}": CONTROL: with the term's own row alone, as the table had it, and no whole-match rule, the .docx body reads "${ALONE}"`, alone.body);
  }

  // 23c — a safety-net row of the term left readable is an exemption: the term does not take
  // the pattern's tag over it, and the .docx row is reported as past that choice
  const N = 'Call 6123 4567 today, or 6123 4567 at night. Anna Tan signed.';
  const nEnts = syncFloorRows(N, [anna], PRACTICE).map((e) => (isFloorRow(e) && e.text.includes(' ') ? { ...e, dead: true, status: 'ignored' } : e));
  const nm = docxMaskTable(nEnts, ['6123 4567']);
  check(nEnts.filter(isFloorRow).length === 2 && nm.channel.length === 1 && nm.over.length === 1 && !nm.table.some((e) => e.key.startsWith('protfl')),
    'a safety-net row of the term left readable: the term gets a row of the list\'s own, reported as past that choice, not the pattern\'s tag', JSON.stringify(nm.table.map((e) => [e.text, e.tag, !!e.dead])));
  const floorTagged = remask(N, [...nEnts, minted('6123 4567', '[phone]')], PRACTICE).text;
  check(!floorTagged.includes('6123 4567') && remask(N, nEnts, PRACTICE).text.includes('6123 4567'),
    'CONTROL: under the pattern\'s tag anyway, the .docx body masks the form the lawyer left readable, which the .txt carries');

  // 23d — a term under the pattern's tag uses no [ProtectedN]: the next term's tag is the one it
  // gets with that number off the list, and declared before the drop
  const A = 'Account S1234567D was opened. Anna Tan signed.';
  const aEnts = syncFloorRows(A, [anna], PRACTICE);
  const both = docxMaskTable(aEnts, ['S1234567D', 'Osprey']);
  const one = docxMaskTable(aEnts, ['Osprey']);
  check(both.table.some((e) => e.text === 'S1234567D' && e.tag === '[nric]') && both.channel.map((e) => e.tag).join() === '[Protected2]' && one.channel.map((e) => e.tag).join() === '[Protected2]',
    'the number takes [nric] and no index: "Osprey" is [Protected2] with the number on the list or off it', JSON.stringify(both.channel.map((e) => [e.text, e.tag])));
  const noFloor = docxMaskTable([anna], ['S1234567D', 'Osprey']);
  check(noFloor.channel.map((e) => e.tag).join() === '[Protected2],[Protected3]',
    'CONTROL: a number that takes a [ProtectedN] of its own uses an index, and "Osprey" is then [Protected3] — the check above tells the two apart');
}

// ── LAW 24: a kept row's words are masked wherever the row places ──
console.log('\n— law 24: the overlap rule — the longer row\'s tag covers its span, the shorter row\'s remainder keeps its own —');
{
  // Two kept names that meet: "Mrs Margaret Tan" and "Tan Wei Ling" in "Mrs Margaret Tan Wei
  // Ling". The longer claimed its span and the shorter row's whole match was dropped, so "Wei
  // Ling" shipped readable in the .txt, the preview, both clipboards and every part of the
  // .docx, under a green verification: the footprint of "Tan Wei Ling" is not in "Wei Ling".
  const T = 'Mrs Margaret Tan Wei Ling attended. Tan Wei Ling signed. Mrs Margaret Tan left.';
  const ents = [row('a', 'Mrs Margaret Tan', '[Person1]', 'PERSON', 'person'), row('b', 'Tan Wei Ling', '[Person2]', 'PERSON', 'person')];
  const WANT = '[Person1] [Person2] attended. [Person2] signed. [Person1] left.';
  const pkg = await makeDocx({ body: para(T), header: para(T), footer: para(T) });
  const TEXT = await textOf(pkg);
  const input = { text: TEXT, entities: ents, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg };
  const plan = exportPlan(input, [], PRACTICE);
  const w = await writeRedactedDocx(pkg, { mask: plan.docx.mask });
  const items = w.bytes ? (await extractDocx(w.bytes)).items : [];
  const of = (k) => items.filter((i) => i.kind === k).map((i) => i.text).join(' ');
  const got = { txt: plan.red, preview: exportOf(TEXT, ents, PRACTICE).text, body: flowText(items.filter(inMainFlow)), header: of('header'), footer: of('footer') };
  check(TEXT === T && Object.values(got).every((x) => x === WANT) && !plan.blocked,
    'the .txt, the Review preview, the .docx body, its header and its footer are one text, and no word of either name is readable in it', JSON.stringify(got));
  check(plan.rm.placements.some((p) => TEXT.slice(p.s, p.e) === 'Wei Ling' && p.tag === '[Person2]'),
    'the shorter row\'s remainder, "Wei Ling", is placed under the shorter row\'s tag');
  const OO = await engineWith(OLD_OVERLAP);
  const was = OO.exportPlan(input, [], PRACTICE);
  check(was.red.startsWith('[Person1] Wei Ling attended') && !was.verified && was.blocked && was.survivors.map((e) => e.text).join() === 'Tan Wei Ling',
    'CONTROL: under the overlap rule as it was, "Wei Ling" is readable — and verification, which also reads every place a kept row stands in the original, fails and holds the page', `${was.red} | ${JSON.stringify(was.survivors.map((e) => e.text))}`);
  const OW = await engineWith([...OLD_OVERLAP, ...WHOLE_ONLY_VERIFY]);
  const wasBoth = OW.exportPlan(input, [], PRACTICE);
  check(wasBoth.red.startsWith('[Person1] Wei Ling attended') && wasBoth.verified && !wasBoth.blocked,
    'CONTROL: with verification reading the export\'s words alone, as it did, the same page passes green — the check above can fail', wasBoth.red);
  // the names the writer reads a bookmark against, asked without an export to plan (attest.ts
  // asks for them this way): the same list exportPlan hands the writer
  const terms = ['Kestrel'];
  check(JSON.stringify(docxMaskNames(ents, terms)) === JSON.stringify(exportPlan({ ...input, entities: ents }, terms, PRACTICE).docx.mask.names) && docxMaskNames(ents, terms).includes('Kestrel'),
    'docxMaskNames gives the names exportPlan hands the .docx writer', JSON.stringify(docxMaskNames(ents, terms)));
}

// ── LAW 25: a declared term glued to a number the pattern takes is masked, and its button works ──
console.log('\n— law 25: where the safety-net pattern cuts a number off a declared term, the term places —');
{
  // "Call Tan61234567 today" with "Tan" on the list. The pattern masks the number and leaves
  // "Tan" standing alone in the export, where the list reads it; the term's own match refused
  // its digit-glued end in the original, so nothing placed it. The page was held and its button
  // minted a row that placed nothing: held press after press (P13-1, 2026-09-23).
  const T = 'Call Tan61234567 today. Anna Tan signed.';
  const anna = row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person');
  const input = (entities) => ({ text: T, entities, reviewed: true, engineComplete: true, kind: 'text' });
  const late = syncFloorRows(T, [anna], PRACTICE);
  const held = exportPlan(input(late), ['Tan'], PRACTICE);
  check(held.blocked && held.holds.map((h) => h.why).join() === 'no-row' && held.stuck.length === 0 && held.red.includes('Call Tan[phone]'),
    'declared after the drop, the term is readable where the pattern cut the number off it: the page is held, and its button is offered because it clears the hold', `${JSON.stringify(held.holds)} · stuck ${JSON.stringify(held.stuck)} · ${held.red}`);
  const pressed = exportPlan(input(syncFloorRows(T, withProtectedTerms(T, late, ['Tan'], PRACTICE), PRACTICE)), ['Tan'], PRACTICE);
  const before = exportPlan(input(syncFloorRows(T, [anna, ...protectedEntities(T, ['Tan'], 1, PRACTICE)], PRACTICE)), ['Tan'], PRACTICE);
  check(!pressed.blocked && /^Call \[Protected\d+\]\[phone\] today\. \[Person1\] signed\.$/.test(pressed.red) && before.red === pressed.red && !before.blocked,
    'one press masks it, and gives the export the term gets declared before the drop', `${pressed.red} · ${before.red}`);
  check(protectedMatches(T, 'Tan', PRACTICE) === 2 && protectedMatches('Call Tan6123 today.', 'Tan', PRACTICE) === 0,
    'the cut counts only where the pattern takes the number: "Tan6123", which it does not take, is no occurrence of "Tan"');
  const NC = await engineWith([...NO_CUT, ...NO_RUN]);
  const ncPressed = NC.exportPlan(input(NC.syncFloorRows(T, NC.withProtectedTerms(T, late, ['Tan'], PRACTICE), PRACTICE)), ['Tan'], PRACTICE);
  check(ncPressed.blocked && ncPressed.red.includes('Call Tan[phone]') && NC.exportPlan(input(late), ['Tan'], PRACTICE).stuck.join() === 'Tan',
    'CONTROL: without the cut, and without the run-together rule (law 34) that now places it too, the press changes nothing and the page stays held — and the plan knows it, so the page offers no button for it (18k)', ncPressed.red);
  // a row the review minted with no class of its own, then declared: it keeps the class
  // placementRows gives it, and with it the two-token prefix placement
  const M = 'Margaret Tan Wei Ling signed. Margaret Tan paid.';
  const hand = { key: 'h', text: 'Margaret Tan Wei Ling', tag: '[Person1]', cat: 'person', prov: 'added by you', occ: 1, status: 'confirmed', src: 'span' };
  const listed = withProtectedTerms(M, [hand], ['Margaret Tan Wei Ling'], PRACTICE);
  check(out(M, [hand]) === '[Person1] signed. [Person1] paid.' && out(M, listed) === out(M, [hand]) && listed.every((e) => e.cat === 'protected'),
    'a hand-marked name declared: the list answers for the row, and "Margaret Tan" stays masked', out(M, listed));
  const OC = await engineWith([["cls: e.cls ?? (e.cat === 'protected' ? PROTECTED_CLS : 'PERSON')", 'cls: e.cls ?? PROTECTED_CLS']]);
  check(OC.remask(M, OC.withProtectedTerms(M, [hand], ['Margaret Tan Wei Ling'], PRACTICE), PRACTICE).text.includes('Margaret Tan paid'),
    'CONTROL: stamped with the protected class, the declared row loses its prefix placement and "Margaret Tan" ships readable — declaring it masked less');
}

// ── LAW 26: declaring a term never masks less ──
console.log('\n— law 26: a claim inside a safety-net match yields to the whole match —');
{
  // "kestrelcapital" declared before the drop gave "j.doe@[Protected2].com": the claim broke the
  // address, the email rule no longer matched, and the mailbox stayed readable — where not
  // declaring it gave "[email]". The .docx side of this is law 23b; this is the table's.
  const anna = row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person');
  const cases = [
    ['kestrelcapital', 'Write to j.doe@kestrelcapital.com today. Anna Tan signed.', 'Write to [email] today. [Person1] signed.', 'j.doe@[Protected2].com'],
    ['6123 4567', 'Call +65 6123 4567 today. Anna Tan signed.', 'Call [phone] today. [Person1] signed.', '+65 [Protected2]'],
  ];
  const NW = await engineWith(NO_WHOLE_MATCH);
  for (const [TERM, T, WANT, WAS] of cases) {
    const input = (entities) => ({ text: T, entities, reviewed: true, engineComplete: true, kind: 'text' });
    const beforeRows = syncFloorRows(T, [anna, ...protectedEntities(T, [TERM], 1, PRACTICE)], PRACTICE);
    const none = exportPlan(input(syncFloorRows(T, [anna], PRACTICE)), [], PRACTICE);
    const before = exportPlan(input(beforeRows), [TERM], PRACTICE);
    const late = exportPlan(input(syncFloorRows(T, [anna], PRACTICE)), [TERM], PRACTICE);
    check(none.red === WANT && before.red === WANT && late.red === WANT && !before.blocked && !late.blocked,
      `"${TERM}": declared before the drop, after it, or not at all, the export is the same, the whole match under the pattern's tag`, `${none.red} | ${before.red} | ${late.red}`);
    check(NW.exportPlan(input(NW.syncFloorRows(T, [anna, ...NW.protectedEntities(T, [TERM], 1, PRACTICE)], PRACTICE)), [TERM], PRACTICE).red.includes(WAS),
      `"${TERM}": CONTROL: without the whole-match rule, declared before the drop, the export carries "${WAS}" — declaring it masked less`);
  }
  // A number declared on its own keeps its own tag (the owner's ruling of 2026-09-23): the rule
  // yields only to a match WIDER than the claim.
  const S = 'Call 6123 4567 today. Anna Tan signed.';
  const alone = exportPlan({ text: S, entities: syncFloorRows(S, [anna, ...protectedEntities(S, ['6123 4567'], 1, PRACTICE)], PRACTICE), reviewed: true, engineComplete: true, kind: 'text' }, ['6123 4567'], PRACTICE);
  check(alone.red === 'Call [Protected2] today. [Person1] signed.', 'a declared number that IS the whole match keeps its [ProtectedN]', alone.red);
  // the address left readable: the term stays masked inside it, and the lawyer's choice survives
  // the table's next sync — the run's own floor pass no longer matches the broken address, and
  // the sync took the row away as a match the pattern no longer makes, so the next export masked
  // the whole address over the choice
  const T = cases[0][1];
  const input = (entities) => ({ text: T, entities, reviewed: true, engineComplete: true, kind: 'text' });
  const chosen = syncFloorRows(T, [anna, ...protectedEntities(T, ['kestrelcapital'], 1, PRACTICE)], PRACTICE).map((e) => (isFloorRow(e) ? { ...e, dead: true, status: 'ignored' } : e));
  const synced = syncFloorRows(T, chosen, PRACTICE);
  const open = exportPlan(input(synced), ['kestrelcapital'], PRACTICE);
  check(synced.some((e) => isFloorRow(e) && e.dead) && open.red === 'Write to j.doe@[Protected2].com today. [Person1] signed.' && !open.blocked,
    'the address left readable: the declared term is masked inside it, and the choice survives the next sync of the table', `${open.red} · ${JSON.stringify(synced.map((e) => [e.text, !!e.dead]))}`);
  const NO = await engineWith(NO_OPEN_MATCH);
  const noSynced = NO.syncFloorRows(T, chosen, PRACTICE);
  check(!noSynced.some((e) => NO.isFloorRow(e) && e.dead) && NO.exportPlan(input(noSynced), ['kestrelcapital'], PRACTICE).red.includes('Write to [email] today'),
    'CONTROL: with the readable match not recorded, the sync drops the lawyer\'s row and the next export masks the address whole, over the choice');
}

// ── LAW 27: "left readable" is asked of what a reader of the copy can read ──
console.log('\n— law 27: a row left readable counts as readable only where the export carries it as a word —');
{
  // "Phone" left readable beside a kept "Phone Lim": its one occurrence is inside the kept name,
  // and the only "phone" in the bytes is the [phone] tag the pattern wrote. Asked of the bytes,
  // it counted as left readable — in the receipt's count, on the page, and in the name key's
  // section of names left readable (P13-5).
  const T = 'Phone Lim called from 61234567. Anna Tan signed.';
  const ents = syncFloorRows(T, [row('l', 'Phone Lim', '[Person1]', 'PERSON', 'person'), { ...row('f', 'Phone', '[Term1]', 'TERM', 'term'), dead: true, status: 'ignored' }, row('a', 'Anna Tan', '[Person2]', 'PERSON', 'person')], PRACTICE);
  const input = { text: T, entities: ents, reviewed: true, engineComplete: true, kind: 'text' };
  const plan = exportPlan(input, [], PRACTICE);
  check(plan.red === '[Person1] called from [phone]. [Person2] signed.' && plan.stillIn.length === 0 && plan.maskedAnyway.some((m) => m.e.text === 'Phone'),
    'a row left readable whose only form in the bytes is a tag the export wrote is not left readable — it is masked anyway, inside the kept name', `${plan.red} · stillIn ${JSON.stringify(plan.stillIn.map((e) => e.text))}`);
  const SB = await engineWith(STILL_IN_BYTES);
  check(SB.exportPlan(input, [], PRACTICE).stillIn.map((e) => e.text).join() === 'Phone',
    'CONTROL: asked of the bytes, as rowSurvives(red, e), "Phone" is counted left readable — read in the [phone] tag');
}

// ── LAW 28: a kept name glued to a number the pattern takes is masked whole ──
console.log('\n— law 28: where the safety-net pattern cuts a number off a kept name, the name places —');
{
  // "Contact Wei Ling Tan98765432": the pattern masks the number and leaves "Tan" standing alone
  // in the export; the kept row's own match refused its digit-glued end, only its two-word
  // prefix placed, and "Tan" shipped under a green verification (OV-4). Declaring "Tan" on a
  // kept "Anna Tan" glued the same way cleared the hold, and "Anna" shipped (OV-3).
  const input = (text, entities) => ({ text, entities, reviewed: true, engineComplete: true, kind: 'text' });
  const WT = 'Contact Wei Ling Tan98765432 for the file. Wei Ling Tan signed.';
  const AT = 'Call Anna Tan61234567 today. Anna Tan signed.';
  const run = (M) => ({
    w: M.exportPlan(input(WT, M.syncFloorRows(WT, [row('w', 'Wei Ling Tan', '[Person1]', 'PERSON', 'person')], PRACTICE)), [], PRACTICE),
    a: M.exportPlan(input(AT, M.syncFloorRows(AT, M.withProtectedTerms(AT, [row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person')], ['Tan'], PRACTICE), PRACTICE)), ['Tan'], PRACTICE),
  });
  const now = run({ exportPlan, syncFloorRows, withProtectedTerms });
  check(now.w.red === 'Contact [Person1][phone] for the file. [Person1] signed.' && now.w.verified && !now.w.blocked,
    'a kept name glued to a number the pattern takes is masked whole, beside the number\'s tag', now.w.red);
  check(now.a.red === 'Call [Person1][phone] today. [Person1] signed.' && !now.a.blocked,
    '"Tan" declared on a kept "Anna Tan" glued the same way: the name is masked whole, and "Anna" does not stand beside the term\'s tag', now.a.red);
  const nc = run(await engineWith([...ENGINE_NO_CUT, ...NO_RUN]));
  check(nc.w.red.includes('[Person1] Tan[phone]') && !nc.w.verified && nc.w.survivors.map((e) => e.text).join() === 'Wei Ling Tan' && nc.a.red.includes('Call Anna [Protected') && nc.a.blocked,
    'CONTROL: without the cut for kept names (and without the run-together rule, law 34, which places the name too), "Tan" and "Anna" are readable — and verification, which reads every place a kept row stands in the original, holds both pages', `${nc.w.red} · ${nc.a.red}`);
  const ncw = run(await engineWith([...ENGINE_NO_CUT, NO_RUN[0], ...WHOLE_ONLY_VERIFY]));
  check(ncw.w.red.includes('[Person1] Tan[phone]') && ncw.w.verified && !ncw.w.blocked && ncw.a.red.includes('Call Anna [Protected') && !ncw.a.blocked,
    'CONTROL: with verification reading the export\'s words alone, as it did, both ship green with the name\'s other words readable — the checks above can fail', `${ncw.w.red} · ${ncw.a.red}`);

  // 28b — a match that reaches INTO the name. The email rule's local part starts at any letter
  // and its last label takes every letter after the dot, so an address run into a name takes
  // the name's first or last letters with it. The cut above was taken only where the match
  // ENDS at the name: the row placed nowhere, the pattern masked the address with the letters
  // it took, and "[email] Tan" shipped on every path under a green verification, which asked
  // the same match (57 of 522 glued cases). Kept on the engine's table and declared on the
  // list alike; every path is read — the .txt (the Export clipboard copies the same text), the
  // Review preview, and the .docx body, header and footer. Compare's clipboard: its law 16.
  const REACH = [
    ['Signed: anna.tan@kestrel.comAnna Tan, partner. Anna Tan left.', ['Anna Tan', '[Person1]', 'PERSON', 'person'], 'Signed: [email] [T], partner. [T] left.'],
    ['Signed: Anna Tananna.tan@kestrel.com, partner. Anna Tan left.', ['Anna Tan', '[Person1]', 'PERSON', 'person'], 'Signed: [T] [email], partner. [T] left.'],
    ['Contact legal@kestrel.comK2 Holdings for the file. K2 Holdings signed.', ['K2 Holdings', '[Company1]', 'COMPANY', 'org'], 'Contact [email][T] for the file. [T] signed.'],
  ];
  const reach = async (M, T, [name, tag, cls, cat], listed) => {
    const pkg = await makeDocx({ body: para(T), header: para(T), footer: para(T) });
    const TEXT = await textOf(pkg);
    const terms = listed ? [name] : [];
    const ents = M.syncFloorRows(TEXT, listed ? M.withProtectedTerms(TEXT, [], terms, PRACTICE) : [row('n', name, tag, cls, cat)], PRACTICE);
    const plan = M.exportPlan({ text: TEXT, entities: ents, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg }, terms, PRACTICE);
    return { TEXT, pkg, ents, plan };
  };
  for (const [T, r, want] of REACH) for (const listed of [false, true]) {
    const { TEXT, pkg, ents, plan } = await reach({ exportPlan, syncFloorRows, withProtectedTerms }, T, r, listed);
    const WANT = want.replaceAll('[T]', listed ? '[Protected1]' : r[1]);
    const w = plan.docx ? await writeRedactedDocx(pkg, { mask: plan.docx.mask }) : { bytes: null };
    const items = w.bytes ? (await extractDocx(w.bytes)).items : [];
    const of = (k) => items.filter((i) => i.kind === k).map((i) => i.text).join(' ');
    const got = { txt: plan.red, preview: exportOf(TEXT, ents, PRACTICE).text, body: flowText(items.filter(inMainFlow)), header: of('header'), footer: of('footer') };
    check(TEXT === T && Object.values(got).every((x) => x === WANT) && plan.verified && !plan.blocked && !plan.holds.length,
      `${listed ? 'declared' : 'kept'} "${r[0]}", an address run into it: every path masks the address and the whole name, one text, verified`, JSON.stringify(got));
  }
  const [RT, RR] = REACH[0];
  const enc28 = await engineWith([...ENGINE_NO_CUT, ...NO_RUN]);
  const rnc = (await reach(enc28, RT, RR, false)).plan;
  check(rnc.red.startsWith('Signed: [email] Tan, partner.') && !rnc.verified && rnc.blocked && rnc.survivors.map((e) => e.text).join() === 'Anna Tan',
    'CONTROL: without the cut for kept names (and without the run-together rule, law 34, which places the name too), "Tan" is readable — and verification, reading where the row stands in the original, holds the page', rnc.red);
  const EC = await engineWith([...EDGE_CUT_ONLY, ...NO_RUN]);
  const rk = (await reach(EC, RT, RR, false)).plan, rl = (await reach(EC, RT, RR, true)).plan;
  check(rk.red.startsWith('Signed: [email] Tan, partner.') && rk.verified && !rk.blocked && rl.red.startsWith('Signed: [email] Tan, partner.') && rl.verified && !rl.blocked && !rl.holds.length,
    'CONTROL: with a glued edge taken only where the match ends at the name, as it was, and without the run-together rule (law 34), the kept and the declared name both ship "Tan" under a green verification — the checks above can fail', `${rk.red} · ${rl.red}`);
}

// ── LAW 29: a listed term readable in part is held ──
console.log('\n— law 29: a listed term readable in part is held, as one readable whole is —');
{
  // "Tan Wei Ling" listed after the drop, over a kept "Mrs Margaret Tan": the kept name's tag
  // covers "Tan", and the copy carried "Wei Ling" with no hold — the hold asked whether the WHOLE
  // term was readable, and it was nowhere — while the .docx, which masks the list, gave
  // "[Person1] [Protected2]" (OV-1). The same with its row left readable before it was listed:
  // the .docx masked it in the body with no hold, and the page said nothing (OV-2).
  const input = (text, entities) => ({ text, entities, reviewed: true, engineComplete: true, kind: 'text' });
  const T = 'Mrs Margaret Tan Wei Ling attended the meeting.';
  const P1 = row('a', 'Mrs Margaret Tan', '[Person1]', 'PERSON', 'person');
  const P2 = row('b', 'Tan Wei Ling', '[Person2]', 'PERSON', 'person');
  const T2 = 'Margaret Tan Wei Ling Holdings signed the deed.';
  const cases = (M) => [
    ['no-row', M.exportPlan(input(T, [P1]), ['Tan Wei Ling'], PRACTICE)],
    ['no-row', M.exportPlan(input(T2, [row('c', 'Margaret Tan', '[Person1]', 'PERSON', 'person')]), ['Tan Wei Ling Holdings'], PRACTICE)],
    ['left-visible', M.exportPlan(input(T, [P1, { ...P2, dead: true, status: 'ignored' }]), ['Tan Wei Ling'], PRACTICE)],
  ];
  for (const [why, p] of cases({ exportPlan })) {
    check(p.blocked && p.holds.length === 1 && p.holds[0].why === why && p.holds[0].partly === true && /Wei Ling/.test(p.red),
      `"${p.holds[0]?.term}", readable in part in "${p.red}": held (${why}), and marked readable in part`, JSON.stringify(p.holds));
  }
  const pressed = exportPlan(input(T, syncFloorRows(T, withProtectedTerms(T, syncFloorRows(T, [P1], PRACTICE), ['Tan Wei Ling'], PRACTICE), PRACTICE)), ['Tan Wei Ling'], PRACTICE);
  const before = exportPlan(input(T, withProtectedTerms(T, [P1], ['Tan Wei Ling'], PRACTICE)), ['Tan Wei Ling'], PRACTICE);
  check(!pressed.blocked && pressed.red === before.red && /^\[Person1\] \[Protected\d+\] attended the meeting\.$/.test(pressed.red),
    'one press gives the export the term gets declared before the drop, with no word of it readable', `${pressed.red} · ${before.red}`);
  const was = cases(await engineWith(HOLDS_READABLE_ONLY));
  check(was.every(([, p]) => !p.blocked && !p.holds.length && /Wei Ling/.test(p.red)),
    'CONTROL: with the hold asked of the readable words alone, as it was, no page is held and each ships "Wei Ling" — the checks above can fail', was.map(([, p]) => p.red).join(' · '));
}

// ── LAW 30: what masks a row left readable is named by what contains what ──
console.log('\n— law 30: a row left readable is put down to the row whose whole match covers it —');
{
  // Read off the placement, a remainder "Wei Ling" of a kept "Tan Wei Ling" was "another row of
  // the same name" over a "Wei Ling" left readable (OV-5); sorted by length, a kept "Tan Wei
  // Ling" was "a shorter name inside" a "Mrs Margaret Tan" left readable, which it only shares
  // "Tan" with, while "Mrs Margaret" shipped (OV-6, P1T-3). 18o is the page.
  const T = 'Mrs Margaret Tan Wei Ling attended the meeting.';
  const input = (entities) => ({ text: T, entities, reviewed: true, engineComplete: true, kind: 'text' });
  const off = (r) => ({ ...r, dead: true, status: 'ignored' });
  const P1 = row('a', 'Mrs Margaret Tan', '[Person1]', 'PERSON', 'person');
  const P2 = row('b', 'Tan Wei Ling', '[Person2]', 'PERSON', 'person');
  const WL = off(row('c', 'Wei Ling', '[Person3]', 'PERSON', 'person'));
  const byOf = (p, text) => p.maskedAnyway.find((m) => m.e.text === text)?.by;
  const s4 = byOf(exportPlan(input([P1, P2, WL]), [], PRACTICE), 'Wei Ling');
  check(!!s4 && JSON.stringify(s4.within) === '["Tan Wei Ling"]' && !s4.same && !s4.partly,
    '"Wei Ling" left readable inside a kept "Tan Wei Ling": masked whole, by the longer name that holds it — not by "the same name, kept elsewhere"', JSON.stringify(s4));
  const s9p = exportPlan(input([off(P1), P2]), [], PRACTICE);
  const s9 = byOf(s9p, 'Mrs Margaret Tan');
  check(s9p.red === 'Mrs Margaret [Person2] attended the meeting.' && !!s9 && JSON.stringify(s9.overlap) === '["Tan Wei Ling"]' && !s9.part.length && !s9.within.length && s9.partly,
    '"Mrs Margaret Tan" left readable beside a kept "Tan Wei Ling": they share "Tan" and neither holds the other — an overlap, masked in part', JSON.stringify(s9));
  const bp = byOf((await engineWith(BY_PLACEMENT_TEXT)).exportPlan(input([P1, P2, WL]), [], PRACTICE), 'Wei Ling');
  check(bp?.same === true && !bp.within.length, 'CONTROL: read off the placement\'s text, as it was, the remainder "Wei Ling" is the same name kept elsewhere — the check above can fail', JSON.stringify(bp));
  const bl = byOf((await engineWith(BY_LENGTH)).exportPlan(input([off(P1), P2]), [], PRACTICE), 'Mrs Margaret Tan');
  check(JSON.stringify(bl?.part) === '["Tan Wei Ling"]' && !bl.overlap.length, 'CONTROL: sorted by length, as it was, "Tan Wei Ling" is a shorter name inside "Mrs Margaret Tan" — the check above can fail', JSON.stringify(bl));
}

// ── LAW 31: a remainder is a name's words, not the punctuation beside them ──
console.log('\n— law 31: a remainder\'s tag covers letters and digits, never the punctuation at its edge —');
{
  // "Mrs Margaret Tan, Wei Ling": the remainder of "Tan, Wei Ling" began at the comma, and the
  // tag took it — "[Person1][Person2]", the two names run together in the copy (OV-8).
  const T = 'Mrs Margaret Tan, Wei Ling attended.';
  const input = { text: T, entities: [row('a', 'Mrs Margaret Tan', '[Person1]', 'PERSON', 'person'), row('b', 'Tan, Wei Ling', '[Person2]', 'PERSON', 'person')], reviewed: true, engineComplete: true, kind: 'text' };
  const now = exportPlan(input, [], PRACTICE).red;
  check(now === '[Person1], [Person2] attended.', 'the comma after the longer name stays in the text, outside both tags', now);
  const was = (await engineWith(SPACING_TRIM)).exportPlan(input, [], PRACTICE).red;
  check(was === '[Person1][Person2] attended.', 'CONTROL: trimmed of spacing alone, as it was, the remainder takes the comma into its tag — the check above can fail', was);
}

// ── LAW 32: a declared term that straddles a safety-net match masks no less ──
console.log('\n— law 32: a declared term that straddles a safety-net match masks every word not declaring it masks —');
{
  // Law 26 set aside a claim strictly inside a match; one that straddled the match's edge was
  // placed, broke the match, and the pattern masked less: "Tel +65 [Protected2]" where not
  // declaring it gave "Tel [phone]", and "Mail [Protected2]@x.com" where not declaring gave
  // "[email]" (OV-9, P1T-6). The match is masked whole under the pattern's tag; the term's words
  // outside it keep the term's tag.
  const anna = row('a', 'Anna Tan', '[Person1]', 'PERSON', 'person');
  const cases = [
    ['6123 4567 ext 12', 'Tel +65 6123 4567 ext 12 for the desk. Anna Tan signed.', 'Tel [phone] [Protected2] for the desk. [Person1] signed.', 'Tel +65 [Protected2]'],
    ['6123 4567', 'Mail 6123 4567@x.com now. Anna Tan signed.', 'Mail [Protected2] [email] now. [Person1] signed.', 'Mail [Protected2]@x.com'],
  ];
  const NS = await engineWith(NO_STRADDLE);
  for (const [TERM, T, WANT, WAS] of cases) {
    const input = (entities) => ({ text: T, entities, reviewed: true, engineComplete: true, kind: 'text' });
    const decl = exportPlan(input(syncFloorRows(T, [anna, ...protectedEntities(T, [TERM], 1, PRACTICE)], PRACTICE)), [TERM], PRACTICE);
    const none = exportPlan(input(syncFloorRows(T, [anna], PRACTICE)), [], PRACTICE);
    check(decl.red === WANT && readableIn(none.red, decl.red) === null && !decl.blocked,
      `"${TERM}" straddling a safety-net match: the match is masked whole under its tag, the term's words outside it under the term's — no word not declaring it masks is readable`, `${decl.red} | ${none.red}`);
    const nsDecl = NS.exportPlan(input(NS.syncFloorRows(T, [anna, ...NS.protectedEntities(T, [TERM], 1, PRACTICE)], PRACTICE)), [TERM], PRACTICE);
    check(nsDecl.red.includes(WAS) && readableIn(none.red, nsDecl.red) !== null,
      `"${TERM}": CONTROL: without the straddle rule, the claim breaks the match and "${WAS}" ships — declaring it masked less`, nsDecl.red);
  }
  // with a second term inside the same address (P1T-9): the address is still masked whole
  const T = 'Mail 6123 4567@kestrel.com now. Anna Tan signed.';
  const terms = ['6123 4567', 'kestrel'];
  const two = (M) => M.exportPlan({ text: T, entities: M.syncFloorRows(T, [anna, ...M.protectedEntities(T, terms, 1, PRACTICE)], PRACTICE), reviewed: true, engineComplete: true, kind: 'text' }, terms, PRACTICE);
  const both = two({ exportPlan, syncFloorRows, protectedEntities });
  check(both.red === 'Mail [Protected2] [email] now. [Person1] signed.' && !both.blocked, 'two declared terms, one straddling an address and one inside it: the address is masked whole', both.red);
  check(two(NS).red.includes('[Protected2]@[Protected3].com'), 'CONTROL: without the straddle rule the two claims break the address between them — the check above can fail', two(NS).red);
}

// ── LAW 33: a remainder before the longer claim keeps its own row's tag ──
console.log('\n— law 33: the shorter row\'s remainder keeps the shorter row\'s tag on either side of the longer claim —');
{
  // Law 24 pins a remainder AFTER the longer claim. Before it, a remainder that took the claim's
  // tag would make two people one: "Mrs Margaret" and "Tan Wei Ling Abdullah" under one tag.
  const T = 'Mrs Margaret Tan Wei Ling Abdullah attended.';
  const ents = [row('m', 'Mrs Margaret Tan', '[Person1]', 'PERSON', 'person'), row('t', 'Tan Wei Ling Abdullah', '[Person2]', 'PERSON', 'person')];
  check(out(T, ents) === '[Person1] [Person2] attended.', '"Mrs Margaret", before the longer claim, keeps "Mrs Margaret Tan"\'s tag', out(T, ents));
  const RO = await engineWith(REST_OTHER_TAG);
  check(RO.remask(T, ents, PRACTICE).text === '[Person2] attended.', 'CONTROL: with the claim\'s tag on the remainder, the two people are one tag — the check above can fail', RO.remask(T, ents, PRACTICE).text);
}

// ── LAW 34: a name run together is masked on every path, as the .docx writer masks it ──
console.log('\n— law 34: a kept or declared name with nothing between it and what stands beside it is masked on every path —');
{
  // A row's match starts and stops at a word's edge. "KestrelCapital", "kestrelcapital.com",
  // "the Biondos", "Anna Tan12" and "Kestrel東京" shipped readable in the .txt, both clipboards
  // and the Review preview under a green verification, while the .docx writer found each run
  // together (refFind) and masked it in the saved file (owner ruling 1, 2026-09-23). The engine
  // reads a row as the writer does, over the text its other claims left, and places what it
  // finds under the row's tag; verification asks the same of the export's words. Compare's
  // clipboard: its law 18.
  const RV = join(dir, 'review-34.mjs');
  await build({ entryPoints: [join(here, '..', 'src', 'lib', 'review.ts')], bundle: true, platform: 'node', format: 'esm', outfile: RV, logLevel: 'silent' });
  const { withMaskedPieces } = await import('file:///' + RV.replace(/\\/g, '/'));
  const { placeSpans } = await import('file:///' + bundle.replace(/\\/g, '/'));
  const RUN = [
    ['Paid to KestrelCapital (kestrelcapital.com) today. Kestrel Capital signed.', ['Kestrel Capital', '[Company1]', 'COMPANY', 'org'], false, 'Paid to [T] ([T].com) today. [T] signed.', /kestrel|capital/i],
    ['Costs against the Biondos. Biondo signed.', ['Biondo', '[Person1]', 'PERSON', 'person'], false, 'Costs against the [T]s. [T] signed.', /Biondo/],
    ['Ref Anna Tan12 filed. Anna Tan signed.', ['Anna Tan', '[Person1]', 'PERSON', 'person'], false, 'Ref [T]12 filed. [T] signed.', /Anna|Tan/],
    ['Kestrel東京 agreed. Kestrel signed.', ['Kestrel', '[Company1]', 'COMPANY', 'org'], false, '[T]東京 agreed. [T] signed.', /Kestrel/],
    ['OspreyPartners LLP agreed. Osprey Partners signed.', ['Osprey Partners'], true, '[T] LLP agreed. [T] signed.', /Osprey|Partners/],
  ];
  const planOf = async (M, T, [name, tag, cls, cat], listed) => {
    const pkg = await makeDocx({ body: para(T), header: para(T), footer: para(T) });
    const TEXT = await textOf(pkg);
    const terms = listed ? [name] : [];
    const ents = M.syncFloorRows(TEXT, listed ? M.withProtectedTerms(TEXT, [], terms, PRACTICE) : [row('n', name, tag, cls, cat)], PRACTICE);
    return { TEXT, pkg, ents, plan: M.exportPlan({ text: TEXT, entities: ents, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg }, terms, PRACTICE) };
  };
  for (const [T, r, listed, want, readable] of RUN) {
    const { TEXT, pkg, ents, plan } = await planOf({ exportPlan, syncFloorRows, withProtectedTerms }, T, r, listed);
    const WANT = want.replaceAll('[T]', listed ? '[Protected1]' : r[1]);
    const w = plan.docx ? await writeRedactedDocx(pkg, { mask: plan.docx.mask }) : { bytes: null };
    const items = w.bytes ? (await extractDocx(w.bytes)).items : [];
    const of = (k) => items.filter((i) => i.kind === k).map((i) => i.text).join(' ');
    const got = { txt: plan.red, preview: exportOf(TEXT, ents, PRACTICE).text, body: flowText(items.filter(inMainFlow)), header: of('header'), footer: of('footer') };
    check(TEXT === T && Object.values(got).every((x) => x === WANT) && plan.verified && !plan.blocked && !plan.holds.length,
      `${listed ? 'declared' : 'kept'} "${r[0]}" in "${T.split('.')[0]}": the .txt, the Review preview and the .docx body, header and footer are one text, verified`, JSON.stringify(got));
    // the Review highlight draws every stretch the export masks, under the row that masks it
    const pane = withMaskedPieces(TEXT, placeSpans(TEXT, ents), plan.rm.claims, ents);
    const drawn = pane.filter((p) => (p.e && !p.e.dead) || p.pc).map((p) => [p.start, p.end]);
    const undrawn = plan.rm.claims.filter((c) => { for (let i = c.s; i < c.e; i++) if (!drawn.some(([a, b]) => a <= i && i < b)) return true; return false; });
    const pieces = pane.filter((p) => p.pc);
    check(!undrawn.length && pieces.every((p) => p.pc.row && ents.includes(p.pc.row) && p.pc.row.text === r[0]),
      `  the Review highlight draws every stretch it masks, each under "${r[0]}"`, JSON.stringify({ undrawn: undrawn.map((c) => TEXT.slice(c.s, c.e)), pieces: pieces.map((p) => [p.t, p.pc.row?.text]) }));
    const was = (await planOf(NR, T, r, listed)).plan;
    check(readable.test(was.red.replace(/\[[A-Za-z]+\d*\]/g, ' ')) && was.verified && !was.blocked,
      `  CONTROL: without the run-together rule the .txt carries the name and verification is green — the check above can fail`, was.red);
  }

  // what the lawyer left readable is a wall: a live row read run together does not mask a form
  // of it the lawyer kept as a row of its own and left readable, and verification does not hold
  // the page over that choice
  const OB = "Signed, O’Brien Kessler LLP. Reply to O'Brien Kessler LLP.";
  const sib = [row('c', 'O’Brien Kessler LLP', '[Company1]', 'COMPANY', 'org'), { ...row('s', "O'Brien Kessler LLP", '[Company2]', 'COMPANY', 'org'), dead: true, status: 'ignored' }];
  const sibIn = { text: OB, entities: sib, reviewed: true, engineComplete: true, kind: 'text' };
  const sp = exportPlan(sibIn, [], PRACTICE);
  check(sp.red === "Signed, [Company1]. Reply to O'Brien Kessler LLP." && sp.verified && !sp.blocked,
    'a form of a live row that the lawyer left readable as a row of its own stays readable, and the page is not held over it', sp.red);
  const NW = (await engineWith(NO_LEFT_PLACE)).exportPlan(sibIn, [], PRACTICE);
  check(NW.red === 'Signed, [Company1]. Reply to [Company1].',
    'CONTROL: without that wall the live row masks the form the lawyer left readable, and nothing on the page says a review decision was undone', NW.red);
  const NV = (await engineWith(NO_LEFT_READ)).exportPlan(sibIn, [], PRACTICE);
  check(!NV.verified && NV.blocked && NV.survivors.map((e) => e.text).join() === 'O’Brien Kessler LLP',
    'CONTROL: without it in verification, the page is held over the lawyer\'s own choice', `${NV.red} · survivors ${JSON.stringify(NV.survivors.map((e) => e.text))}`);
  // where the form the lawyer left readable stands, on the .docx mask (mask.leftAt) for a reader
  // of it. The writer does not read it — its run-together pass reads mask.names alone and masks
  // the form in the saved body, and owner ruling 13 (2026-09-24) accepts that over-redaction —
  // and a reader of it drops only a find of the same name wholly inside a place, never walls it
  // (law 41, P1-T5)
  const asDocx = (ents) => exportPlan({ ...sibIn, entities: ents, kind: 'docx', bytes: new Uint8Array(1) }, [], PRACTICE).docx.mask.leftAt(OB);
  const at = OB.lastIndexOf("O'Brien Kessler LLP");
  check(JSON.stringify(asDocx(sib)) === JSON.stringify([[at, at + "O'Brien Kessler LLP".length]]),
    'the .docx mask says where the form the lawyer left readable stands, and only there', JSON.stringify(asDocx(sib)));
  check(JSON.stringify(asDocx([sib[0], { ...sib[1], dead: false, status: 'confirmed' }])) === '[]',
    'CONTROL: with that row kept masked, the .docx mask walls nothing');
}

// every path one text takes out of the app: the .txt (the Export clipboard copies the same text),
// the Review preview, and the saved .docx body, header and footer (laws 35 and 36)
const everyPath = async (TEXT, pkg, ents, plan) => {
  const w = plan.docx ? await writeRedactedDocx(pkg, { mask: plan.docx.mask }) : { bytes: null };
  const items = w.bytes ? (await extractDocx(w.bytes)).items : [];
  const of = (k) => items.filter((i) => i.kind === k).map((i) => i.text).join(' ');
  return { txt: plan.red, preview: exportOf(TEXT, ents, PRACTICE).text, body: flowText(items.filter(inMainFlow)), header: of('header'), footer: of('footer') };
};
const docOf = async (T) => { const pkg = await makeDocx({ body: para(T), header: para(T), footer: para(T) }); return { pkg, TEXT: await textOf(pkg) }; };
const docxPlan = (M, TEXT, pkg, ents, terms) => M.exportPlan({ text: TEXT, entities: ents, reviewed: true, engineComplete: true, kind: 'docx', bytes: pkg }, terms, PRACTICE);
const untagged = (s) => s.replace(/\[[A-Za-z]+\d*\]/g, ' ');

// ── LAW 35: a declared term the body writes only run together ──
console.log('\n— law 35: a declared term the body writes only run together gets its row, and is held when listed after the drop —');
{
  // The list's row was minted only where the term stands as words, so a term the body writes
  // only run together — "www.kestrelcapital.com", "KestrelCapital-Escrow", "the Biondos",
  // "AnnaTan12" — got none: the .txt, the clipboards and the Review preview carried it readable
  // while the saved .docx masked it with the list's own row, verification green and no hold.
  // Listed after the drop, the hold read the export's words the same way and found nothing to
  // hold (2026-09-23). The row is minted where the term stands run together too (protectedEntities),
  // and the hold reads the export and the original as the mask reads a row. Compare: its law 19.
  const ONLY = [
    ['Visit www.kestrelcapital.com for the data room.', 'Kestrel Capital', 'Visit www.[T].com for the data room.', /kestrel|capital/i],
    ['Wire to account KestrelCapital-Escrow today.', 'Kestrel Capital', 'Wire to account [T]-Escrow today.', /kestrel|capital/i],
    ['The OspreyPartners fund signed.', 'Osprey Partners', 'The [T] fund signed.', /osprey|partners/i],
    ['Costs against the Biondos were awarded.', 'Biondo', 'Costs against the [T]s were awarded.', /biondo/i],
    ['Ref AnnaTan12 filed.', 'Anna Tan', 'Ref [T]12 filed.', /anna|tan/i],
  ];
  const JR = row('jr', 'Jane Roe', '[Person1]', 'PERSON', 'person');
  const LW = await engineWith(LIST_WORDS_ONLY);
  for (const [S, term, want, readable] of ONLY) {
    const { pkg, TEXT } = await docOf(`${S} Jane Roe signed.`);
    const before = syncFloorRows(TEXT, withProtectedTerms(TEXT, [JR], [term], PRACTICE), PRACTICE);
    const own = before.find((e) => e.text === term && e.cat === 'protected' && !isFloorRow(e));
    const plan = docxPlan({ exportPlan }, TEXT, pkg, before, [term]);
    const WANT = `${want} [Person1] signed.`.replaceAll('[T]', own?.tag ?? '(no row)');
    const got = await everyPath(TEXT, pkg, before, plan);
    check(!!own && Object.values(got).every((x) => x === WANT) && plan.verified && !plan.blocked && !plan.holds.length,
      `"${term}" declared before the drop, written "${S.split(' ').find((w) => readable.test(w))}": it gets a row, and the .txt, the Review preview and the .docx body, header and footer are one text, verified`, JSON.stringify(got));
    const wasRows = LW.syncFloorRows(TEXT, LW.withProtectedTerms(TEXT, [JR], [term], PRACTICE), PRACTICE);
    const was = docxPlan(LW, TEXT, pkg, wasRows, [term]);
    check(!wasRows.some((e) => e.text === term) && readable.test(untagged(was.red)) && !was.blocked,
      '  CONTROL: with the term asked as words alone, as it was, no row is minted and the .txt carries it under a page nothing holds — the check above can fail', was.red);
    // listed after the drop: held, the press clears it, and it masks what declaring it first masked
    const late = syncFloorRows(TEXT, [JR], PRACTICE);
    const lp = docxPlan({ exportPlan }, TEXT, pkg, late, [term]);
    const pressed = syncFloorRows(TEXT, withProtectedTerms(TEXT, late, [term], PRACTICE), PRACTICE);
    const pp = docxPlan({ exportPlan }, TEXT, pkg, pressed, [term]);
    check(lp.blocked && lp.holds.length === 1 && lp.holds[0].term === term && lp.holds[0].why === 'no-row' && !lp.holds[0].partly && !lp.stuck.length && !pp.holds.length && !pp.blocked && pp.red === plan.red,
      '  listed after the drop, the page is held on it with a button that clears the hold, and the press masks what declaring it first masked', JSON.stringify({ holds: lp.holds, stuck: lp.stuck, after: pp.red }));
    const lw = docxPlan(LW, TEXT, pkg, LW.syncFloorRows(TEXT, [JR], PRACTICE), [term]);
    check(!lw.holds.length && !lw.blocked && readable.test(untagged(lw.red)),
      '  CONTROL: with the hold asking the export\'s words alone, as it did, nothing is held and the .txt carries the term — the check above can fail', lw.red);
  }
  // readable IN PART: a kept "Anna" places, "Tan12" is left — held and marked "(in part)"
  for (const S of ['Ref AnnaTan12 filed.', 'Ms Anna Tan12 filed.']) {
    const { pkg, TEXT } = await docOf(`${S} Jane Roe signed. Anna agreed.`);
    const late = syncFloorRows(TEXT, [JR, row('an', 'Anna', '[Person2]', 'PERSON', 'person')], PRACTICE);
    const lp = docxPlan({ exportPlan }, TEXT, pkg, late, ['Anna Tan']);
    const pressed = syncFloorRows(TEXT, withProtectedTerms(TEXT, late, ['Anna Tan'], PRACTICE), PRACTICE);
    const pp = docxPlan({ exportPlan }, TEXT, pkg, pressed, ['Anna Tan']);
    const tag = pressed.find((e) => e.text === 'Anna Tan')?.tag ?? '(no row)';
    check(lp.blocked && lp.holds.length === 1 && lp.holds[0].partly && !lp.stuck.length && !pp.blocked && pp.red.startsWith(`${S.split(' ')[0]} ${tag}12 filed.`),
      `"Anna Tan" listed after the drop over a kept "Anna", in "${S}": held as readable in part, and the press masks the whole name`, JSON.stringify({ red: lp.red, holds: lp.holds, after: pp.red }));
    const lw = docxPlan(LW, TEXT, pkg, LW.syncFloorRows(TEXT, [JR, row('an', 'Anna', '[Person2]', 'PERSON', 'person')], PRACTICE), ['Anna Tan']);
    check(!lw.holds.length && !lw.blocked && /\[Person2\] ?Tan12/.test(lw.red),
      '  CONTROL: asked as words alone, "Tan12" ships beside the kept name\'s tag with nothing held — the check above can fail', lw.red);
  }
}

// ── LAW 36: a kept name run together behind a shorter claim of its own words ──
console.log('\n— law 36: a kept name run together behind a shorter claim of its own words is masked whole on every path —');
{
  // The run-together rule (law 34) read a row only where the other claims left the text, so a
  // name whose footprint refused a glued edge while a shorter claim took some of its words was
  // never read whole: its own two-word prefix ("Mr Wei Ling Tan12" → "Mr [Person1] Tan12"), a
  // shorter kept row ("Ms Anna Tan12" beside a kept "Anna"), a CJK reading, a number the lawyer
  // left readable — each shipped on every path, the saved .docx included, with verification
  // green (2026-09-23). The engine now reads the row through the claims, at ends a reader takes
  // the name to stop at, and verification reads the original the same way (runOpen).
  const P = (k, t, tag) => row(k, t, tag, 'PERSON', 'person');
  const C = (k, t, tag) => row(k, t, tag, 'COMPANY', 'org');
  const leftFloor = (M, T, rows, ft) => { const t = M.syncFloorRows(T, rows, PRACTICE); return M.syncFloorRows(T, t.map((e) => (isFloorRow(e) && e.text === ft ? { ...e, dead: true, status: 'ignored' } : e)), PRACTICE); };
  const BEHIND = [
    ['its own prefix, digits glued', 'Mr Wei Ling Tan12 stated. Wei Ling Tan signed.', (M, T) => M.syncFloorRows(T, [P('w', 'Wei Ling Tan', '[Person1]')], PRACTICE), 'Mr [Person1]12 stated. [Person1] signed.', /Tan12/, 'Wei Ling Tan'],
    ['its own prefix, a digit glued', 'Paid to Kestrel Capital Partners2 today. Kestrel Capital Partners signed.', (M, T) => M.syncFloorRows(T, [C('k', 'Kestrel Capital Partners', '[Company1]')], PRACTICE), 'Paid to [Company1]2 today. [Company1] signed.', /Partners2/, 'Kestrel Capital Partners'],
    ['its own prefix, a CJK reading glued', 'Tan Wei Ling陈伟玲 attended. Tan Wei Ling signed.', (M, T) => M.syncFloorRows(T, [P('t', 'Tan Wei Ling', '[Person1]')], PRACTICE), '[Person1]陈伟玲 attended. [Person1] signed.', /Ling陈/, 'Tan Wei Ling'],
    ['its own prefix, a number left readable glued', 'Contact Wei Ling Tan98765432 for the file. Wei Ling Tan signed.', (M, T) => leftFloor(M, T, [P('w', 'Wei Ling Tan', '[Person1]')], '98765432'), 'Contact [Person1]98765432 for the file. [Person1] signed.', /Tan98765432/, 'Wei Ling Tan'],
    ['a shorter kept row, digits glued', 'Ms Anna Tan12 stated. Anna Tan signed. Anna agreed.', (M, T) => M.syncFloorRows(T, [P('at', 'Anna Tan', '[Person1]'), P('a', 'Anna', '[Person2]')], PRACTICE), 'Ms [Person1]12 stated. [Person1] signed. [Person2] agreed.', /Tan12/, 'Anna Tan'],
    ['its own prefix, a plural', 'Costs against the Mary Anne Smiths. Mary Anne Smith signed.', (M, T) => M.syncFloorRows(T, [P('m', 'Mary Anne Smith', '[Person1]')], PRACTICE), 'Costs against the [Person1]s. [Person1] signed.', /Smiths/, 'Mary Anne Smith'],
  ];
  const RV = join(dir, 'review-36.mjs');
  await build({ entryPoints: [join(here, '..', 'src', 'lib', 'review.ts')], bundle: true, platform: 'node', format: 'esm', outfile: RV, logLevel: 'silent' });
  const { withMaskedPieces } = await import('file:///' + RV.replace(/\\/g, '/'));
  const { placeSpans } = await import('file:///' + bundle.replace(/\\/g, '/'));
  const NT = await engineWith(NO_THROUGH);
  const NTO = await engineWith([...NO_THROUGH, ...NO_RUN_OPEN]);
  const BREAKS_ONLY = await engineWith([['      if (endHolds(w, g.s, -1) && endHolds(w, g.e, 1)) { out.push(g); continue; }', '      if (breakAt(w, g.s) && breakAt(w, g.e)) out.push(g);\n      continue;']]);
  for (const [label, T, table, WANT, readable, long] of BEHIND) {
    const { pkg, TEXT } = await docOf(T);
    const ents = table({ syncFloorRows }, TEXT);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, ents, []);
    const got = await everyPath(TEXT, pkg, ents, plan);
    check(TEXT === T && Object.values(got).every((x) => x === WANT) && plan.verified && !plan.blocked,
      `kept "${long}" behind ${label}: the .txt, the Review preview and the .docx body, header and footer are one text, verified`, JSON.stringify(got));
    // the Review highlight draws every stretch the export masks
    const pane = withMaskedPieces(TEXT, placeSpans(TEXT, ents), plan.rm.claims, ents);
    const drawn = pane.filter((p) => (p.e && !p.e.dead) || p.pc).map((p) => [p.start, p.end]);
    const undrawn = plan.rm.claims.filter((c) => { for (let i = c.s; i < c.e; i++) if (!drawn.some(([a, b]) => a <= i && i < b)) return true; return false; });
    check(!undrawn.length, '  the Review highlight draws every stretch the export masks', JSON.stringify(undrawn.map((c) => TEXT.slice(c.s, c.e))));
    const nt = docxPlan(NT, TEXT, pkg, table(NT, TEXT), []);
    const nto = docxPlan(NTO, TEXT, pkg, table(NTO, TEXT), []);
    check(readable.test(untagged(nt.red)) && !nt.verified && nt.blocked && nt.survivors.some((e) => e.text === long) && readable.test(untagged(nto.red)) && nto.verified && !nto.blocked,
      '  CONTROL: read only where the claims left the text, the name\'s rest is readable and verification over the original holds the page; with that verification taken back too, it ships green — the checks above can fail', `${nt.red} · ${nto.red}`);
  }
  const [, ST, stable, , sread] = BEHIND[BEHIND.length - 1];
  const sb = docxPlan(BREAKS_ONLY, ST, null, stable(BREAKS_ONLY, ST), []);
  check(sread.test(untagged(sb.red)) && sb.verified && !sb.blocked,
    'CONTROL: read through a claim between word breaks alone, "the Mary Anne Smiths" ships "Smiths" green — the plural check above can fail', sb.red);
  // What it does not read through a claim, by measurement: a find a longer word carries on past.
  // "Ford Motor Co" reads into "Ford Motor Company" by its short form written long, and read
  // through the placed "Ford Motor" it masked "[Party1]mpany" — and held the page on "[Party1]
  // Company" in 7 of the repository's 98 opinions when verification read it so (exportPlan).
  // Since owner ruling 19a the find ends where the long word does (RefFind.long) and the name
  // is masked whole: masked short, a party's name went out half masked in 9 of the 98 opinions
  // with their caption parties as the table — "[Party1] Company" or "[Party1] Corporation" in 6,
  // "[Party1]oration" in 3 — and masked whole it changes nothing else (placements 2,825 both).
  const FM = 'Ford Motor Company appeals. Ford Motor Co signed.';
  const fmRows = (M) => M.syncFloorRows(FM, [C('f', 'Ford Motor Co', '[Party1]')], PRACTICE);
  const fm = exportPlan({ text: FM, entities: fmRows({ syncFloorRows }), reviewed: true, engineComplete: true, kind: 'text' }, [], PRACTICE);
  check(fm.red === '[Party1] appeals. [Party1] signed.' && fm.verified && !fm.blocked,
    'a kept "Ford Motor Co" beside "Ford Motor Company": the short form written long is masked whole (owner ruling 19a), not "[Party1]mpany" nor "[Party1] Company", and the page is not held', fm.red);
  const SF = await engineWith(SHORT_AS_WAS);
  const sf = SF.exportPlan({ text: FM, entities: fmRows(SF), reviewed: true, engineComplete: true, kind: 'text' }, [], PRACTICE);
  check(sf.red === '[Party1] Company appeals. [Party1] signed.' && sf.verified,
    'CONTROL: with the short form masked short, as before ruling 19a, the .txt reads "[Party1] Company" — the check above can fail', sf.red);
  const AF = await engineWith([...SHORT_AS_WAS, ['      if (endHolds(w, g.s, -1) && endHolds(w, g.e, 1)) { out.push(g); continue; }', '      out.push(g);\n      continue;']]);
  const af = AF.exportPlan({ text: FM, entities: fmRows(AF), reviewed: true, engineComplete: true, kind: 'text' }, [], PRACTICE);
  check(af.red.startsWith('[Party1]mpany'),
    'CONTROL: masked short, and with every find the writer\'s reading takes read through a claim, "Company" is masked "[Party1]mpany" — the ends runsThrough asks are what keep a word from being cut', af.red);
}

// ── LAW 37: a declared term inside a safety-net match ──
console.log('\n— law 37: a declared term shorter than the run-together floor, run into an address, is masked whole on every path —');
{
  // Owner ruling 4 (2026-09-23): a declared term inside a safety-net match is masked, and a
  // glued edge strictly inside a stretch the pattern masks places it (law 28b). Law 28b's names
  // are long enough that the run-together rule places them too, so the line that frees the
  // declared term's own glued edge (protectedSpans) could go with nothing failing. "Li Wu" is
  // under the floor of six: that line is the only thing that places it.
  const LI = [
    ['Signed: Li Wuli.wu@kestrel.com, partner. Li Wu left.', 'Signed: [T] [email], partner. [T] left.', /\bLi\b/],
    ['Contact legal@kestrel.comli wu today. Li Wu left.', 'Contact [email] [T] today. [T] left.', /\bwu\b/],
  ];
  const PCO = await engineWith([['if ((!gluedL || freed(cuts(), s)) && (!gluedR || freed(cuts(), e))) { out.push([s, e]); re.lastIndex = e; }', 'if ((!gluedL || cuts().has(s)) && (!gluedR || cuts().has(e))) { out.push([s, e]); re.lastIndex = e; }']]);
  for (const [T, want, readable] of LI) {
    const { pkg, TEXT } = await docOf(T);
    const ents = syncFloorRows(TEXT, withProtectedTerms(TEXT, [], ['Li Wu'], PRACTICE), PRACTICE);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, ents, ['Li Wu']);
    const WANT = want.replaceAll('[T]', ents.find((e) => e.text === 'Li Wu')?.tag ?? '(no row)');
    const got = await everyPath(TEXT, pkg, ents, plan);
    check(TEXT === T && Object.values(got).every((x) => x === WANT) && plan.verified && !plan.blocked && !plan.holds.length,
      `declared "Li Wu", an address run into it: every path masks the address and the whole term, one text, verified`, JSON.stringify(got));
    const was = docxPlan(PCO, TEXT, pkg, PCO.syncFloorRows(TEXT, PCO.withProtectedTerms(TEXT, [], ['Li Wu'], PRACTICE), PRACTICE), ['Li Wu']);
    check(readable.test(untagged(was.red)) && was.verified && !was.blocked,
      '  CONTROL: with the declared term\'s glued edge taken only where the match ends at it, a word of it ships green — the check above can fail', was.red);
  }
}

// ── LAW 38: why the chosen doctrine did not run ──
console.log('\n— law 38: the note on a doctrine that did not run says why, in the stamp\'s own terms —');
{
  // The note travels on the receipt. A run the frozen pipeline was sent and answered with nothing
  // usable is not an engine that could not be reached: the document did go to it.
  const { missedWhy } = await import('file:///' + bundle.replace(/\\/g, '/'));
  const failed = missedWhy({ runFailed: true, runStopped: false });
  check(/sent this document and returned no result the app could use/.test(failed) && !/unreachable|stopped/.test(failed)
    && /stopped partway/.test(missedWhy({ runFailed: false, runStopped: true })) && /unreachable/.test(missedWhy(null)),
    'a failed run, a stopped run and an engine never reached are each named for what happened', failed);
  const MW = await engineWith([["  if (id?.runFailed) return 'the frozen legal pipeline was sent this document and returned no result the app could use';\n", '']]);
  check(/unreachable/.test(MW.missedWhy({ runFailed: true, runStopped: false })),
    'CONTROL: without the failed-run line, a run the pipeline answered is called unreachable — the check above can fail');
  // a cut: the result refused, often after the pipeline read the whole document (ruling 20); the
  // note said "stopped partway" of a run legal-serve.log records as completed (S7A-1)
  const cut = missedWhy({ runFailed: false, runStopped: true, runCut: true });
  check(/did not use the frozen legal pipeline’s result/.test(cut) && !/stopped partway|unreachable/.test(cut),
    'a cut run is named as a result the app did not use, never as a run stopped partway', cut);
  const MC = await engineWith([["  if (id?.runCut) return 'the app did not use the frozen legal pipeline’s result, because one of the model’s answers was missing, cut off, or did not say it had finished';\n", '']]);
  check(/stopped partway/.test(MC.missedWhy({ runFailed: false, runStopped: true, runCut: true })),
    'CONTROL: without the cut line, a run whose result was refused at its end is called stopped partway — the check above can fail');
}

// ── LAW 39: a name run past a shorter row the lawyer left readable ──
console.log('\n— law 39: a name run past a shorter row the lawyer left readable is masked on every path, and listed late it holds —');
{
  // Every place a row the lawyer left readable stood was a wall to the run-together reading (law
  // 34's O'Brien rule), so a kept name that ran past one was never read: a kept "Anna Tan" in
  // "Ms Anna Tan12" beside a left-readable "Anna" read "████ Tan12", and the name shipped whole in
  // the .txt, both clipboards and the Review preview with verification green while the saved
  // .docx masked it (P13-B1). Listed after the drop, the hold read the export the same way and
  // found nothing: the page shipped, and its receipt said the list's own row masked the term in
  // the .docx and "none of it is readable in the copied text or the .txt" over a .txt that carried
  // it (P13-B2), 2026-09-24. A find is now dropped only where it lies wholly inside such a place
  // and is that row's own name, run together or not (engine.ts inLeft), in placement (both
  // passes), the export's words, the original (runOpen) and the hold (listHolds), where the
  // place counts only for a row the list governs (leftUnderList): containment alone let a
  // left-readable address or firm name that CONTAINS another name hide it (law 41, P1-F1).
  // Compare: its law 20.
  const P = (k, t, tag) => row(k, t, tag, 'PERSON', 'person');
  const C = (k, t, tag) => row(k, t, tag, 'COMPANY', 'org');
  const left = (r) => ({ ...r, dead: true, status: 'ignored' });
  const LW = await engineWith(LEFT_AS_WALLS);
  const KEPT = [
    ['a footnote number', 'Ms Anna Tan12 stated. Anna Tan signed. Anna agreed.', [P('at', 'Anna Tan', '[Person1]'), left(P('a', 'Anna', '[Person2]'))], 'Ms [Person1]12 stated. [Person1] signed. Anna agreed.', /Tan12/],
    ['a CJK reading', 'Anna Tan陈 attended. Anna Tan signed. Anna agreed.', [P('at', 'Anna Tan', '[Person1]'), left(P('a', 'Anna', '[Person2]'))], '[Person1]陈 attended. [Person1] signed. Anna agreed.', /Tan陈/],
    ['a year', 'Ref: Wei Ling Tan2024 file. Wei Ling Tan signed.', [P('w', 'Wei Ling Tan', '[Person1]'), left(P('wl', 'Wei Ling', '[Person2]'))], 'Ref: [Person1]2024 file. [Person1] signed.', /Tan2024/],
    ['a digit', 'Paid to Kestrel Capital Partners2 today. Kestrel Capital Partners signed.', [C('k', 'Kestrel Capital Partners', '[Company1]'), left(C('kc', 'Kestrel Capital', '[Company2]'))], 'Paid to [Company1]2 today. [Company1] signed.', /Partners2/],
  ];
  for (const [label, T, rows, WANT, readable] of KEPT) {
    const { pkg, TEXT } = await docOf(T);
    const ents = syncFloorRows(TEXT, rows, PRACTICE);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, ents, []);
    const got = await everyPath(TEXT, pkg, ents, plan);
    check(TEXT === T && Object.values(got).every((x) => x === WANT) && plan.verified && !plan.blocked,
      `kept "${rows[0].text}" glued to ${label}, beside "${rows[1].text}" left readable: the .txt, the Review preview and the .docx body, header and footer are one text, verified, and the shorter row stays as the lawyer left it`, JSON.stringify(got));
    const was = docxPlan(LW, TEXT, pkg, LW.syncFloorRows(TEXT, rows, PRACTICE), []);
    check(readable.test(untagged(was.red)) && was.verified && !was.blocked,
      '  CONTROL: with the places left readable as walls, as they were, the name ships readable under a green verification — the check above can fail', was.red);
  }

  // declared, and listed after the drop — with nothing else of the term kept, and with its last
  // word kept on its own row, where what the export carries is the term in part
  const JR = P('jr', 'Jane Roe', '[Person1]');
  const LATE = [
    ['beside a signer', 'Ms Anna Tan12 stated. Anna agreed. Jane Roe signed.', [left(P('a', 'Anna', '[Person2]')), JR], false, 'Ms [T]12 stated. Anna agreed. [Person1] signed.'],
    ['beside its last word kept', 'Ms Anna Tan12 stated. Anna agreed. Tan signed.', [left(P('a', 'Anna', '[Person2]')), P('t', 'Tan', '[Person1]')], true, 'Ms [T]12 stated. Anna agreed. [Person1] signed.'],
  ];
  const TERM = ['Anna Tan'];
  for (const [label, T, rows, partly, want] of LATE) {
    const { pkg, TEXT } = await docOf(T);
    const declared = syncFloorRows(TEXT, withProtectedTerms(TEXT, rows, TERM, PRACTICE), PRACTICE);
    const tag = declared.find((e) => e.text === 'Anna Tan' && !isFloorRow(e))?.tag ?? '(no row)';
    const WANT = want.replaceAll('[T]', tag);
    const dp = docxPlan({ exportPlan }, TEXT, pkg, declared, TERM);
    const got = await everyPath(TEXT, pkg, declared, dp);
    check(Object.values(got).every((x) => x === WANT) && dp.verified && !dp.blocked && !dp.holds.length,
      `"Anna Tan" declared before the drop, ${label}, "Anna" left readable: every path masks the term run past it, one text, and the receipt's "none of the listed spans appear in the export" is true`, JSON.stringify(got));
    const dw = docxPlan(LW, TEXT, pkg, LW.syncFloorRows(TEXT, LW.withProtectedTerms(TEXT, rows, TERM, PRACTICE), PRACTICE), TERM);
    check(/Anna (?:Tan|\[Person1\])12/.test(dw.red) && dw.verified && !dw.blocked,
      '  CONTROL: with the walls as they were, the .txt carries the term under a verification that says none of it appears — the check above can fail', dw.red);
    // listed after the drop: held on it, and the press masks what declaring it first masked
    const late = syncFloorRows(TEXT, rows, PRACTICE);
    const lp = docxPlan({ exportPlan }, TEXT, pkg, late, TERM);
    const pressed = syncFloorRows(TEXT, withProtectedTerms(TEXT, late, TERM, PRACTICE), PRACTICE);
    const pp = docxPlan({ exportPlan }, TEXT, pkg, pressed, TERM);
    check(lp.blocked && lp.holds.length === 1 && lp.holds[0].term === 'Anna Tan' && lp.holds[0].why === 'no-row' && lp.holds[0].partly === partly && !lp.stuck.length
      && !pp.blocked && !pp.holds.length && pp.verified && pp.red === dp.red,
      `  listed after the drop, ${label}: the page is held on it${partly ? ' as readable in part' : ''}, and the press masks what declaring it first masked`, JSON.stringify({ red: lp.red, holds: lp.holds, after: pp.red }));
    // the receipt's channel line — the list's row masks it in the saved .docx, "none of it is
    // readable in the copied text or the .txt" — prints on an export nothing holds (Export.tsx)
    const wl = docxPlan(LW, TEXT, pkg, LW.syncFloorRows(TEXT, rows, PRACTICE), TERM);
    const wlW = wl.docx ? await writeRedactedDocx(pkg, { mask: wl.docx.mask }) : { channels: {} };
    const wlCh = channelWritten(wl.docx?.channel ?? [], wlW.channels ?? {}).map((c) => c.e.text);
    check(!wl.blocked && !wl.holds.length && /Anna (?:Tan|\[Person1\])12/.test(wl.red) && (partly || wlCh.includes('Anna Tan')),
      `  CONTROL: with the walls as they were, nothing is held and the .txt carries the term${partly ? '' : ' while the receipt would say the saved .docx masks it and the .txt does not carry it'} — the check above can fail`, JSON.stringify({ red: wl.red, channel: wlCh }));
  }

  // runOpen reads the original as placement reads it: a kept row's find inside a place a row the
  // lawyer left readable stands is that row's text, not the kept name readable. Here a kept
  // "Kessler" cuts the straight-apostrophe firm name the lawyer left readable, so the kept curly
  // one's find there overlaps a cut and is read through the claim.
  {
    const KT = "Signed, O’Brien Kessler LLP. Reply to O'Brien Kessler LLP. Kessler agreed.";
    const krows = [C('c', 'O’Brien Kessler LLP', '[Company1]'), left(C('s', "O'Brien Kessler LLP", '[Company2]')), P('k', 'Kessler', '[Person1]')];
    const { pkg, TEXT } = await docOf(KT);
    const ents = syncFloorRows(TEXT, krows, PRACTICE);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, ents, []);
    const KWANT = "Signed, [Company1]. Reply to O'Brien [Person1] LLP. [Person1] agreed.";
    const got = await everyPath(TEXT, pkg, ents, plan);
    check(Object.values(got).every((x) => x === KWANT) && plan.verified && !plan.blocked,
      'a firm name left readable in one apostrophe with a kept name inside it: the lawyer\'s choice stands on every path, verified, the page not held', JSON.stringify(got));
    const NO = await engineWith(NO_LEFT_OPEN);
    const no = docxPlan(NO, TEXT, pkg, NO.syncFloorRows(TEXT, krows, PRACTICE), []);
    check(!no.verified && no.blocked && no.survivors.map((e) => e.text).join() === 'O’Brien Kessler LLP',
      '  CONTROL: with the original read through that place, the page is held over the lawyer\'s own choice — the check above can fail', `${no.red} · survivors ${JSON.stringify(no.survivors.map((e) => e.text))}`);
    const NTP = await engineWith([NO_LEFT_PLACE[1]]);
    const ntp = docxPlan(NTP, TEXT, pkg, NTP.syncFloorRows(TEXT, krows, PRACTICE), []);
    check(ntp.red.includes('Reply to [Company1].'),
      '  CONTROL: placed through the claim without that test, the form the lawyer left readable is masked — the check above can fail (law 34 pins the first pass\'s)', ntp.red);
  }

  // A window runsThrough reads ends where its count of letters runs out, often inside a word, and
  // refFind reads a slice's first letter as a word's first: only a find that overlaps what the
  // mask claimed is taken from it. Measured with the filter out: a kept "Ong" read in the "ong" of
  // "Wong", the width of the window from a kept "Margaret Tan".
  {
    const WT = 'Mr Wong then advised Margaret Tan on the deal.';
    const wrows = [P('o', 'Ong', '[Person2]'), P('m', 'Margaret Tan', '[Person1]')];
    const { pkg, TEXT } = await docOf(WT);
    const ents = syncFloorRows(TEXT, wrows, PRACTICE);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, ents, []);
    const got = await everyPath(TEXT, pkg, ents, plan);
    check(Object.values(got).every((x) => x === 'Mr Wong then advised [Person1] on the deal.') && plan.verified,
      '"Wong" eleven letters from a kept "Margaret Tan", beside a kept "Ong": every path leaves "Wong" whole', JSON.stringify(got));
    // two guards each keep "Wong" whole now: only a find that overlaps a claim is taken, and the
    // window is taken out to the spaces either side (law 41), so refFind never reads a slice
    // that begins at "ong"; the CONTROL takes both out, and each alone is measured to hold it
    const RE = await engineWith([
      ['      if (!reaches(g, i0, i1) || !keep(g)) continue;\n', '      if (!keep(g)) continue;\n'],
        ...NO_SNAP_PAIRS,
    ]);
    const re = RE.exportPlan({ text: TEXT, entities: RE.syncFloorRows(TEXT, wrows, PRACTICE), reviewed: true, engineComplete: true, kind: 'text' }, [], PRACTICE);
    check(re.red.startsWith('Mr W[Person2] then') && re.verified,
      '  CONTROL: taking every find in a window cut where its count of letters runs out, "Wong" is masked "W[Person2]" — another person\'s name told to the model as the kept one\'s, verified green — the check above can fail', re.red);
  }

  // runsThrough's contract, asked directly: a find that overlaps a range is taken whatever its
  // edges need read, and what gives refFind those edges is the window's slack of three letters
  // and, since law 41, its reach out to the spaces either side, each alone enough here. No claim
  // the engine makes today covers a single letter of the longest name, so no export shows it —
  // over 6,000 generated texts (nine tables, run-together and glued forms, fillers) taking the
  // slack out changed none (2026-09-24). Pinned so that narrowing it is a decision.
  {
    const { refNames } = await import('file:///' + writerBundle.replace(/\\/g, '/'));
    const EXPORT_IT = ['function runsThrough(', 'export function runsThrough('];
    const EL = await engineWith([EXPORT_IT]);
    const EN = await engineWith([EXPORT_IT, ['const reach = names.reduce((m, n) => Math.max(m, n.c.length), 0) + 3;', 'const reach = names.reduce((m, n) => Math.max(m, n.c.length), 0);'],
      ...NO_SNAP_PAIRS]);
    const namesOf = (xs) => refNames(Object.assign(() => { throw new Error('law 39: refNames called the mask'); }, { names: xs }));
    const EDGES = [
      // a capital run's last letter is cut from it only with two letters read past it
      ['MR TANCorp signed', ['Tan'], [[3, 4]], 'TAN'],
      ['signed by MRSvan Os today', ['van Os'], [[18, 19]], 'van Os'],
      ['LI WUCorp filed', ['Li Wu'], [[0, 1]], 'LI WU'],
    ];
    for (const [w, ns, near, want] of EDGES) {
      const a = EL.runsThrough(w, namesOf(ns), near, () => true).map((f) => w.slice(f.s, f.e));
      const b = EN.runsThrough(w, namesOf(ns), near, () => true).map((f) => w.slice(f.s, f.e));
      check(a.join() === want && !b.length,
        `"${want}" in "${w}", a range over one letter of it: found through the claim; CONTROL: with no slack past the longest name and the window cut where its count runs out, not found — the check can fail`, JSON.stringify({ live: a, noSlack: b }));
    }
  }
}

// ── LAW 40: a name inside other characters, read as the writer reads it ──
console.log('\n— law 40: a client number inside a reference, a name inside a plain word, a name written with %20 — one text on every path, as the writer reads it —');
{
  // The writer's reading of text a reader sees changed under owner rulings 8, 9 and 10
  // (2026-09-24), and engine.ts imports it (refFind 'text': its run-together pass, the reading
  // through a claim, the export's words, the hold) rather than keep a copy that could drift.
  // This law pins that the two agree on each of the rulings' cases. Before them a client
  // number on the table shipped readable inside the IBAN, the wire and the DMS reference that
  // carried it; a party's name was masked inside "Margaret Tang", "Wong Wei Ming" and
  // "supporter", telling the model another person's name was the party's; and a pasted
  // SharePoint link carried the client's name as "Margaret%20Tan" on every path. Each CONTROL
  // changes the writer's reading in the copy of docxWrite.ts the engine bundles — back as it
  // was before the ruling, or with a reading the ruling keeps taken out.
  // "Wong" beside a row "Ong" alone is law 39's (a window's edge); the Compare clipboard is
  // compare-refusal.mjs's law 21.
  const P = (k, t, tag) => row(k, t, tag, 'PERSON', 'person');
  const C = (k, t, tag) => row(k, t, tag, 'COMPANY', 'org');
  const ID = (k, t, tag) => row(k, t, tag, 'ID', 'id');
  const eng = JSON.stringify(join(here, '..', 'src', 'lib', 'engine.ts').replace(/\\/g, '/'));
  const wasOf = (pairs) => mutantOf(join(here, '..', 'src', 'lib', 'extract', 'docxWrite.ts'), pairs, [], { contents: `export * from ${eng};`, resolveDir: join(here, '..'), loader: 'ts' });
  const WHY = {
    digits: 'a row of digits alone read inside no token, as before ruling 9',
    prose: 'a row from six letters read anywhere inside a word, as before ruling 8',
    pct: 'a percent-escape read as written, as before ruling 10',
    np: 'no row read inside a token that is not a word of prose',
    s: 'no row read before the ending s',
    five: 'the floor for a row of digits at five',
  };
  const WAS = { digits: await wasOf(DIGITS_NOT_LOOSE), prose: await wasOf(INSIDE_PROSE), pct: await wasOf(PCT_AS_WRITTEN), np: await wasOf(NP_AS_PROSE), s: await wasOf(NO_ENDING_S), five: await wasOf(FIVE_DIGITS) };
  const SP = 'https://firm.sharepoint.com/sites/Clients/Shared%20Documents';
  const CASES = [
    // what the text says, its table, what every path must read, and each CONTROL: the reading
    // changed, and what its .txt then carries that the check above refuses
    ['a client number inside an IBAN', 'Pay into account 31926819 (IBAN GB29NWBK60161331926819) by Friday.', [ID('i', '31926819', '[ID1]')],
      'Pay into account [ID1] (IBAN GB29NWBK601613[ID1]) by Friday.', [['digits', /GB29NWBK60161331926819/]]],
    ['a client number inside a wire reference', 'Wire ref CHK0001234567890 for account 1234567890.', [ID('i', '1234567890', '[ID1]')],
      'Wire ref CHK000[ID1] for account [ID1].', [['digits', /CHK0001234567890/]]],
    ['a matter number inside a DMS number', 'Filed as DMS441790201 and ACCT44179020001, matter 4417902.', [ID('i', '4417902', '[ID1]')],
      'Filed as DMS[ID1]01 and ACCT[ID1]0001, matter [ID1].', [['digits', /DMS441790201/]]],
    // under six digits a row is found only standing alone: five digits turn up inside the
    // numbers of any reference, and ruling 9 set the floor where a name's is
    ['a five-digit row beside a reference that carries its digits', 'Filed as ACCT44179020001, matter 44179.', [ID('i', '44179', '[ID1]')],
      'Filed as ACCT44179020001, matter [ID1].', [['five', /ACCT\[ID1\]020001/]]],
    ['"Margaret Tang" beside a row "Margaret Tan"', 'Margaret Tang, not Margaret Tan, signed.', [P('m', 'Margaret Tan', '[Person1]')],
      'Margaret Tang, not [Person1], signed.', [['prose', /\[Person1\]g, not/]]],
    ['"Wong Wei Ming" beside a row "Ong Wei Ming"', 'Wong Wei Ming gave evidence after Ong Wei Ming.', [P('o', 'Ong Wei Ming', '[Person1]')],
      'Wong Wei Ming gave evidence after [Person1].', [['prose', /^W\[Person1\] gave/]]],
    ['"supporter", "importer", "reporter" and "Porterfield" beside a row "Porter"', 'Mr Porter, a supporter of the importer, and the reporter met Porterfield.', [P('p', 'Porter', '[Person1]')],
      'Mr [Person1], a supporter of the importer, and the reporter met Porterfield.', [['prose', /sup\[Person1\]/]]],
    ['a name in an address, a handle and a file name, and "the Smiths"', 'See www.kestrelcorp.com and kestrel_capital and porter2024. Costs against the Smiths. Smith signed.',
      [C('k', 'Kestrel', '[Company1]'), P('p', 'Porter', '[Person1]'), P('s', 'Smith', '[Person2]')],
      'See www.[Company1]corp.com and [Company1]_capital and [Person1]2024. Costs against the [Person2]s. [Person2] signed.', [['np', /www\.kestrelcorp\.com/], ['s', /the Smiths/]]],
    ['a client\'s name written with %20 in a SharePoint link', `Filed at ${SP}/Margaret%20Tan%20Matter/brief.docx today. Margaret Tan signed.`, [P('m', 'Margaret Tan', '[Person1]')],
      `Filed at ${SP}/[Person1]%20Matter/brief.docx today. [Person1] signed.`, [['pct', /Margaret%20Tan/]]],
  ];
  for (const [label, T, rows, WANT, controls] of CASES) {
    const { pkg, TEXT } = await docOf(T);
    const ents = syncFloorRows(TEXT, rows, PRACTICE);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, ents, []);
    const got = await everyPath(TEXT, pkg, ents, plan);
    check(TEXT === T && Object.values(got).every((x) => x === WANT) && plan.verified && !plan.blocked,
      `${label}: the .txt, the Review preview and the .docx body, header and footer are one text, verified`, JSON.stringify(got));
    for (const [was, shows] of controls) {
      const W = WAS[was];
      const wp = docxPlan(W, TEXT, pkg, W.syncFloorRows(TEXT, rows, PRACTICE), []);
      check(shows.test(wp.red) && wp.red !== WANT,
        `  CONTROL: with ${WHY[was]}, the .txt reads ${shows} — the check above can fail`, wp.red);
    }
  }
  // listed after the drop, with no row: the hold reads the export's words as the writer reads
  // them, so a listed number inside an IBAN and a listed name written with %20 hold the page;
  // pressed, every path masks them. Read as they were, nothing held and the .txt carried them.
  const JR = P('jr', 'Jane Roe', '[Person1]');
  const LATE = [
    ['a client number inside an IBAN', 'Pay IBAN GB29NWBK60161331926819 now. Jane Roe agreed.', '31926819', 'digits', /GB29NWBK60161331926819/],
    ['a client\'s name written with %20 in a link', `Link ${SP}/Margaret%20Tan%20Matter/x now. Jane Roe agreed.`, 'Margaret Tan', 'pct', /Margaret%20Tan/],
  ];
  for (const [label, T, term, was, shows] of LATE) {
    const { pkg, TEXT } = await docOf(T);
    const late = syncFloorRows(TEXT, [JR], PRACTICE);
    const lp = docxPlan({ exportPlan }, TEXT, pkg, late, [term]);
    const pressed = syncFloorRows(TEXT, withProtectedTerms(TEXT, late, [term], PRACTICE), PRACTICE);
    const pp = docxPlan({ exportPlan }, TEXT, pkg, pressed, [term]);
    const got = await everyPath(TEXT, pkg, pressed, pp);
    const one = Object.values(got).every((x) => x === got.txt) && !shows.test(got.txt);
    check(lp.blocked && lp.holds.length === 1 && lp.holds[0].term === term && lp.holds[0].why === 'no-row' && !pp.blocked && pp.verified && one,
      `${label}, listed after the drop: the page is held on it, and pressed, every path masks it in one text`, JSON.stringify({ holds: lp.holds, after: got }));
    const W = WAS[was];
    const wl = docxPlan(W, TEXT, pkg, W.syncFloorRows(TEXT, [JR], PRACTICE), [term]);
    check(!wl.blocked && !wl.holds.length && shows.test(wl.red),
      `  CONTROL: with ${WHY[was]}, nothing holds and the .txt carries it — the check above can fail`, wl.red);
  }
}

// ── LAW 41: a row left readable hides only its own name; a name run into an address is read through a claim as the writer reads it ──
console.log('\n— law 41: a row left readable hides only its own name, a name run into an address behind a shorter claim is read as the writer reads it, and an escape that writes no character holds — one text on every path —');
{
  // Three readings the .txt, the Review preview and both clipboards did not share with the saved
  // .docx, each shipped under a green verification (2026-09-24):
  // (a) a find wholly inside ANY place a row left readable stood was dropped, so a kept, declared
  //     or late "Kestrel Capital" inside a web address or a firm name the lawyer left readable
  //     ("www.kestrelcapital.com", "KestrelCapital Holdings Ltd") shipped while the .docx masked
  //     it, and the receipt said none of it was readable in the text (P1-F1, P1-F2). A place now
  //     hides only its own row's name, and at the hold only a row the list governs;
  // (b) a name read through a claim was taken only at a word's break, and the writer reads it
  //     inside any token that is not a word of prose: "kestrel-capitalgroup.com" beside a kept
  //     "Kestrel" shipped "[Company2]-capitalgroup.com" while the .docx masked "[Company1]group",
  //     and listed late, "www.margarettanlaw.com" beside a kept "Margaret" held nothing (P1-F4,
  //     P1-T1, P1-T2);
  // (c) a percent-escape that writes no character where a kept name could stand
  //     ("Ren%E9%20Tan") was verified absent while the writer held the .docx on it (P1-F5).
  // Each CONTROL takes the one reading back as it was. The Compare clipboard is
  // compare-refusal.mjs's law 22.
  const P = (k, t, tag) => row(k, t, tag, 'PERSON', 'person');
  const C = (k, t, tag) => row(k, t, tag, 'COMPANY', 'org');
  const U = (t) => row('u', t, '[URL1]', 'URL', 'id');
  const left = (r) => ({ ...r, dead: true, status: 'ignored' });
  const JR = P('jr', 'Jane Roe', '[Person1]');
  const one = (got) => Object.values(got).every((x) => x === got.txt);
  const pressOf = (M, T, ents, terms) => M.syncFloorRows(T, M.withProtectedTerms(T, ents, terms, PRACTICE), PRACTICE);
  const OC = await engineWith(OLD_CONTAINMENT);

  // (a) kept, declared, and listed late, inside a place a DIFFERENT row left readable stands
  const URL_T = 'Visit www.kestrelcapital.com for the data room.';
  const IN = [
    ['kept, inside a web address left readable', `${URL_T} Kestrel Capital signed.`, (M, T) => M.syncFloorRows(T, [left(U('www.kestrelcapital.com')), C('k', 'Kestrel Capital', '[Company1]')], PRACTICE), []],
    ['declared, inside a web address left readable', `${URL_T} Jane Roe signed.`, (M, T) => pressOf(M, T, M.syncFloorRows(T, [left(U('www.kestrelcapital.com')), JR], PRACTICE), ['Kestrel Capital']), ['Kestrel Capital']],
  ];
  for (const [label, T, table, terms] of IN) {
    const { pkg, TEXT } = await docOf(T);
    const ents = table({ syncFloorRows, withProtectedTerms }, TEXT);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, ents, terms);
    const got = await everyPath(TEXT, pkg, ents, plan);
    check(one(got) && !/kestrel/i.test(untagged(got.txt)) && plan.verified && !plan.blocked && !plan.holds.length,
      `"Kestrel Capital" ${label}: the .txt, the Review preview and the .docx body, header and footer are one text, the name masked, verified`, JSON.stringify(got));
    const was = docxPlan(OC, TEXT, pkg, table(OC, TEXT), terms);
    const wasGot = await everyPath(TEXT, pkg, table(OC, TEXT), was);
    check(/kestrelcapital/.test(was.red) && !/kestrelcapital/.test(wasGot.body) && was.verified && !was.blocked,
      '  CONTROL: with any find inside a place left readable dropped, as it was, the .txt carries it under a green verification while the .docx masks it — the check above can fail', `${was.red} · ${wasGot.body}`);
  }
  const LATE_IN = [
    ['a web address left readable', `${URL_T} Jane Roe signed.`, [left(U('www.kestrelcapital.com')), JR], 'inside', /kestrelcapital/],
    ['a firm name left readable', 'KestrelCapital Holdings Ltd signed the deed. Jane Roe agreed.', [left(C('kh', 'KestrelCapital Holdings Ltd', '[Company2]')), JR], 'inside', /KestrelCapital/],
    // the late term run together IS the row left readable: held as left visible, and the press
    // revives that row, as it revives one written as the term (withProtectedTerms, owner ruling 1)
    ['the same name run together, left readable', 'KestrelCapital signed. Jane Roe agreed.', [left(C('kc', 'KestrelCapital', '[Company2]')), JR], 'left-visible', /KestrelCapital/],
  ];
  const NKP = await engineWith([['    if ((!lower.has(termKey(e.text)) && !kin(e)) || leftUnderList(e)) next.push(e);', '    if (!lower.has(termKey(e.text)) || leftUnderList(e)) next.push(e);']]);
  const NKH = await engineWith([['    const kin = kc ? left.filter((e) => termKey(e.text) !== k && refCompact(e.text).c === kc) : [];', '    const kin: Entity[] = [];']]);
  for (const [label, T, rows, why, readable] of LATE_IN) {
    const { pkg, TEXT } = await docOf(T);
    const late = syncFloorRows(TEXT, rows, PRACTICE);
    const lp = docxPlan({ exportPlan }, TEXT, pkg, late, ['Kestrel Capital']);
    const pressed = pressOf({ syncFloorRows, withProtectedTerms }, TEXT, late, ['Kestrel Capital']);
    const pp = docxPlan({ exportPlan }, TEXT, pkg, pressed, ['Kestrel Capital']);
    const got = await everyPath(TEXT, pkg, pressed, pp);
    check(lp.blocked && lp.holds.length === 1 && lp.holds[0].term === 'Kestrel Capital' && lp.holds[0].why === why && !lp.stuck.length
      && one(got) && !readable.test(got.txt) && !pp.blocked && pp.verified && !pp.holds.length,
      `"Kestrel Capital" listed after the drop inside ${label}: held (${why}), and pressed, every path masks it in one text`, JSON.stringify({ holds: lp.holds, after: got }));
    const was = docxPlan(OC, TEXT, pkg, OC.syncFloorRows(TEXT, rows, PRACTICE), ['Kestrel Capital']);
    check(!was.blocked && !was.holds.length && readable.test(was.red),
      '  CONTROL: with any find inside a place left readable dropped, as it was, nothing holds and the .txt carries it — the check above can fail', was.red);
    if (why !== 'left-visible') continue;
    const nkp = docxPlan(NKP, TEXT, pkg, NKP.syncFloorRows(TEXT, rows, PRACTICE), ['Kestrel Capital']);
    const nkpAfter = docxPlan(NKP, TEXT, pkg, pressOf(NKP, TEXT, NKP.syncFloorRows(TEXT, rows, PRACTICE), ['Kestrel Capital']), ['Kestrel Capital']);
    check(nkp.stuck.includes('Kestrel Capital') && nkpAfter.blocked && readable.test(nkpAfter.red),
      '  CONTROL: with the press reviving only a row written as the term, the hold has no button and pressing leaves the page held — the check above can fail', nkpAfter.red);
    const nkh = docxPlan(NKH, TEXT, pkg, NKH.syncFloorRows(TEXT, rows, PRACTICE), ['Kestrel Capital']);
    check(nkh.holds.length === 1 && nkh.holds[0].why !== 'left-visible',
      '  CONTROL: with the hold counting only a row written as the term, it is said to be something other than a row the lawyer left visible — the check above can fail', nkh.holds[0]?.why);
  }
  // the list's own row of the term run together, left readable under Protected terms, governs
  // the hold: nothing is held, and a kept "Kestrel" inside it is masked as the .docx masks it.
  // The hold's reading of the original asks it too; without that, the page is held on a term
  // the press cannot clear (P1-T3)
  {
    const { pkg, TEXT } = await docOf('Wire to KestrelCapital today. Kestrel signed.');
    const rows = (M) => M.withProtectedTerms(TEXT, [C('k', 'Kestrel', '[Company1]')], ['KestrelCapital'], PRACTICE).map((e) => (e.cat === 'protected' ? left(e) : e));
    const terms = ['KestrelCapital', 'Kestrel Capital'];
    const plan = docxPlan({ exportPlan }, TEXT, pkg, rows({ withProtectedTerms }), terms);
    const got = await everyPath(TEXT, pkg, rows({ withProtectedTerms }), plan);
    check(one(got) && got.txt === 'Wire to [Company1]Capital today. [Company1] signed.' && plan.verified && !plan.blocked,
      'a list term run together and left readable under Protected terms, a kept "Kestrel" inside it, the term listed again with its words apart: nothing is held, one text on every path', JSON.stringify(got));
    const NB = await engineWith([[' && !inLeft(leftAt, f, wantC.get(f.name) ?? []))) : new Map', ')) : new Map']]);
    const nb = docxPlan(NB, TEXT, pkg, rows(NB), terms);
    check(nb.blocked && nb.stuck.includes('Kestrel Capital'),
      '  CONTROL: with the hold reading the original past that choice, the page is held on "Kestrel Capital" with no button that clears it — the check above can fail', JSON.stringify({ holds: nb.holds, stuck: nb.stuck }));
  }

  // (b) a kept name run into an address, a handle or a file name behind a shorter kept row
  const NO_PROBE = [['      np ??= nonProse(slice, names);\n      if (np.has(`${f.s}:${f.e}:${f.name}`)) out.push(g);\n', '']];
  const NO_SNAP = [...NO_SNAP_PAIRS];
  const THROUGH = { probe: await engineWith(NO_PROBE), snap: await engineWith(NO_SNAP) };
  const THROUGH_WHY = { probe: 'a name read through a claim only at a word\'s break, as before', snap: 'the window cut where its count of letters runs out, not at a space' };
  const KM = [C('k', 'Kestrel Capital', '[Company1]'), C('k2', 'Kestrel', '[Company2]')];
  const MM = [P('m', 'Margaret Tan', '[Person1]'), P('m2', 'Margaret', '[Person2]')];
  const RUN = [
    ['a hyphenated host', 'See https://kestrel-capitalgroup.com/deals now. Kestrel Capital signed. Kestrel agreed.', KM, 'See https://[Company1]group.com/deals now. [Company1] signed. [Company2] agreed.', [['probe', /-capitalgroup/]]],
    ['a file name', 'Open margaret-tanfiles.pdf now. Margaret Tan signed. Margaret agreed.', MM, 'Open [Person1]files.pdf now. [Person1] signed. [Person2] agreed.', [['probe', /-tanfiles/]]],
    ['a dotted host', 'See www.margaret.tanlaw.com and ask Margaret Tan. Margaret agreed.', MM, 'See www.[Person1]law.com and ask [Person1]. [Person2] agreed.', [['probe', /\.tanlaw/]]],
    ['a path whose slash stands past the window', 'Open margaret-tanlawpartnershipdocs/brief today. Margaret Tan signed. Margaret agreed.', MM, 'Open [Person1]lawpartnershipdocs/brief today. [Person1] signed. [Person2] agreed.', [['probe', /-tanlaw/], ['snap', /-tanlaw/]]],
    ['a handle whose @ stands before the window', 'Handle @thefirmslitigationteam-margaret-tanlaw today. Margaret Tan signed. Margaret agreed.', MM, 'Handle @thefirmslitigationteam-[Person1]law today. [Person1] signed. [Person2] agreed.', [['probe', /-tanlaw/], ['snap', /-tanlaw/]]],
  ];
  for (const [label, T, rows, WANT, controls] of RUN) {
    const { pkg, TEXT } = await docOf(T);
    const ents = syncFloorRows(TEXT, rows, PRACTICE);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, ents, []);
    const got = await everyPath(TEXT, pkg, ents, plan);
    check(TEXT === T && Object.values(got).every((x) => x === WANT) && plan.verified && !plan.blocked,
      `kept "${rows[0].text}" run into ${label} behind a kept "${rows[1].text}": one text on every path, masked whole under its own tag, verified`, JSON.stringify(got));
    for (const [was, shows] of controls) {
      const W = THROUGH[was];
      const wp = docxPlan(W, TEXT, pkg, W.syncFloorRows(TEXT, rows, PRACTICE), []);
      check(shows.test(wp.red) && wp.verified && !wp.blocked,
        `  CONTROL: with ${THROUGH_WHY[was]}, the .txt reads ${shows} under a green verification — the check above can fail`, wp.red);
    }
  }
  // listed after the drop beside the kept shorter row: held in part, and pressed, one text
  const LATE_RUN = [
    ['a host', 'See www.margarettanlaw.com and ask Margaret.', [P('m2', 'Margaret', '[Person1]')], 'Margaret Tan', /tanlaw/],
    ['a handle', 'Her handle is @weilingtanlaw and Wei Ling replied.', [P('w', 'Wei Ling', '[Person1]')], 'Wei Ling Tan', /tanlaw/],
  ];
  for (const [label, T, rows, term, readable] of LATE_RUN) {
    const { pkg, TEXT } = await docOf(T);
    const late = syncFloorRows(TEXT, rows, PRACTICE);
    const lp = docxPlan({ exportPlan }, TEXT, pkg, late, [term]);
    const pressed = pressOf({ syncFloorRows, withProtectedTerms }, TEXT, late, [term]);
    const pp = docxPlan({ exportPlan }, TEXT, pkg, pressed, [term]);
    const got = await everyPath(TEXT, pkg, pressed, pp);
    check(lp.blocked && lp.holds.length === 1 && lp.holds[0].term === term && lp.holds[0].partly && !lp.stuck.length && one(got) && !readable.test(got.txt) && !pp.blocked && pp.verified,
      `"${term}" listed after the drop, run into ${label} beside a kept "${rows[0].text}": held in part, and pressed, every path masks it in one text`, JSON.stringify({ holds: lp.holds, after: got }));
    const W = THROUGH.probe;
    const wl = docxPlan(W, TEXT, pkg, W.syncFloorRows(TEXT, rows, PRACTICE), [term]);
    const wlGot = await everyPath(TEXT, pkg, W.syncFloorRows(TEXT, rows, PRACTICE), wl);
    check(!wl.blocked && !wl.holds.length && readable.test(wl.red) && !readable.test(wlGot.body),
      `  CONTROL: with ${THROUGH_WHY.probe}, nothing holds and the .txt carries it while the .docx masks it — the check above can fail`, `${wl.red} · ${wlGot.body}`);
  }
  // what it does not read: a longer word of prose ("Margaret Tanner" is not "Margaret Tan" run on)
  {
    const T = 'Ask Margaret Tanner today. Margaret agreed.';
    const { pkg, TEXT } = await docOf(T);
    const late = syncFloorRows(TEXT, [P('m2', 'Margaret', '[Person1]')], PRACTICE);
    const lp = docxPlan({ exportPlan }, TEXT, pkg, late, ['Margaret Tan']);
    const got = await everyPath(TEXT, pkg, late, lp);
    check(one(got) && got.txt === 'Ask [Person1] Tanner today. [Person1] agreed.' && !lp.blocked && !lp.holds.length,
      '"Margaret Tan" listed after the drop beside "Margaret Tanner": not read into the longer word, nothing held, one text', JSON.stringify(got));
    // the non-prose reading is asked of the writer's refFind, never copied, so it moves with the
    // writer: with its reading as it was before ruling 8, the hold follows it into the word
    const eng = JSON.stringify(join(here, '..', 'src', 'lib', 'engine.ts').replace(/\\/g, '/'));
    const IP = await mutantOf(join(here, '..', 'src', 'lib', 'extract', 'docxWrite.ts'), INSIDE_PROSE, [], { contents: `export * from ${eng};`, resolveDir: join(here, '..'), loader: 'ts' });
    const ip = docxPlan(IP, TEXT, pkg, IP.syncFloorRows(TEXT, [P('m2', 'Margaret', '[Person1]')], PRACTICE), ['Margaret Tan']);
    check(ip.blocked && ip.holds.some((h) => h.term === 'Margaret Tan'),
      '  CONTROL: with the writer reading a row from six letters anywhere inside a word, as before ruling 8, the page is held on "Margaret Tan" over "Margaret Tanner" — the check above can fail', JSON.stringify(ip.holds));
  }

  // (c) a percent-escape that writes no character where a name could stand
  const SP = 'https://firm.sharepoint.com/sites/Clients';
  const NO_ESC = await engineWith([["  if (!rm.divergence && hasEscape(readable)) {", '  if (false) {']]);
  const NO_ESC_HOLD = await engineWith([['    if (esc) at.push([esc.at, esc.at + esc.esc.length]);\n', '']]);
  {
    const T = `Filed at ${SP}/Ren%E9%20Tan/x.docx today. René Tan signed.`;
    const rows = [P('r', 'René Tan', '[Person1]')];
    const { pkg, TEXT } = await docOf(T);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, syncFloorRows(TEXT, rows, PRACTICE), []);
    check(plan.blocked && !plan.verified && plan.survivors.map((e) => e.text).join() === 'René Tan' && JSON.stringify(plan.escaped) === JSON.stringify({ esc: '%E9', name: 'René Tan' }),
      'a kept "René Tan" beside "Ren%E9%20Tan" in a link: the page is held on it, and the plan names the escape for the page to say', JSON.stringify({ red: plan.red, escaped: plan.escaped }));
    const was = docxPlan(NO_ESC, TEXT, pkg, NO_ESC.syncFloorRows(TEXT, rows, PRACTICE), []);
    check(was.verified && !was.blocked && /Ren%E9%20Tan/.test(was.red),
      '  CONTROL: with the escape not asked, the .txt carries it under "none of the listed spans appear" while the writer holds the .docx — the check above can fail', was.red);
    // listed after the drop: held, and no press clears it — no row can be read into an escape
    const lT = TEXT.replace('René Tan signed', 'Jane Roe signed');
    const lpkg = (await docOf(lT)).pkg;
    const lplan = docxPlan({ exportPlan }, lT, lpkg, syncFloorRows(lT, [JR], PRACTICE), ['René Tan']);
    check(lplan.blocked && lplan.holds.length === 1 && lplan.holds[0].term === 'René Tan' && lplan.stuck.includes('René Tan'),
      '  "René Tan" listed after the drop, written only as "Ren%E9%20Tan": held, with no button, since no press can mask an escape', JSON.stringify({ holds: lplan.holds, stuck: lplan.stuck }));
    const lw = docxPlan(NO_ESC_HOLD, lT, lpkg, NO_ESC_HOLD.syncFloorRows(lT, [JR], PRACTICE), ['René Tan']);
    check(!lw.blocked && !lw.holds.length && /Ren%E9%20Tan/.test(lw.red),
      '  CONTROL: with the hold not asking the escape, nothing holds and the .txt carries it — the check above can fail', lw.red);
  }
  // and what it does not hold: an escape that writes a character, and a percent sign that starts none
  for (const [T, rows] of [
    [`Filed at ${SP}/Margaret%20Tan%20Matter/x.docx today. Margaret Tan signed.`, [P('m', 'Margaret Tan', '[Person1]')]],
    ['A 50%25 discount applies. Margaret Tan signed.', [P('m', 'Margaret Tan', '[Person1]')]],
    ['Owned 100%Bedrock by value. Bedrock Holdings signed.', [C('b', 'Bedrock', '[Company1]')]],
  ]) {
    const { pkg, TEXT } = await docOf(T);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, syncFloorRows(TEXT, rows, PRACTICE), []);
    check(plan.escaped === null && plan.verified && !plan.blocked,
      `  CONTROL of the hold's reach: "${T.slice(0, 48)}…" holds nothing`, plan.red);
  }
}

// ── LAW 42: the fragment check reads what a reader reads ──
console.log('\n— law 42: the fragment check counts a piece of a listed name glued to a digit, a superscript or an escape, and not one inside a longer word —');
{
  // The check is the receipt's backstop for what the mask did not read: it names the pieces of
  // kept names still readable (Export's ⚠, 18z), counts them on the receipt and the Compare
  // clipboard (compare-refusal law 23), and holds nothing. Asked at the footprint's edges of the
  // export as written (lib-core footprintRegex refuses a digit on either side), it was blind to
  // the shapes the mask misses most — footnote numbers, superscripts, file names, matter
  // references, escapes in a pasted link — and the receipt said no fragment survived with the
  // surname readable in the copy (F-FRAG, owner ruling 21, 2026-09-24). Each CONTROL takes one
  // part of the reading back out, so each is shown to be the one that finds its case.
  const P = (k, t, tag) => row(k, t, tag, 'PERSON', 'person');
  const SK = [P('sk', 'Søren Kierkegaard', '[Person2]')];
  // The check as it was, a reading at a time: at the round's start (FRAG_ROUND_START), and
  // since the second pass of ruling 21 with the escapes read as written alone — a %-escape and a
  // character reference, in the copy of docxWrite.ts the engine bundles, whose refFind the check
  // reads by (engine.ts survivingFragments). Named as the copy writes each (P1T-5).
  const DECODE_NONE = [["const runs = f.includes('%') ? pctRuns(f) : [];", 'const runs: never[] = [];'], ["const refs = !runs.length && !f.includes('%') && f.includes('&') ? pctRuns(f) : runs;", 'const refs = runs;']];
  const WAS = {
    old: ['the piece read at the footprint\'s edges of the export as written, as it was', await engineWith(FRAG_ROUND_START)],
    decoded: ['the escapes read as written alone', await engineWriterWith(DECODE_NONE)],
  };
  const PP = 'https://urldefense.proofpoint.com/v2/url?u=https-3A__dms.example.com_find-3Fq-3DDr.-2520Kierkegaard&d=DwMF';
  const MT = [P('mt', 'Margaret Tan', '[Person1]')];
  const MP = [P('mp', 'Mr Porter', '[Person1]')];
  const FOUND = [
    ['a footnote\'s number after the surname', 'Kierkegaard12 replied.', SK, 'Kierkegaard', null],
    ['a superscript note mark', 'Kierkegaard¹ replied.', SK, 'Kierkegaard', null],
    ['a year before it', 'See the 2024Kierkegaard memo.', SK, 'Kierkegaard', null],
    ['a file name', 'Open Kierkegaard2024.pdf now.', SK, 'Kierkegaard', null],
    ['a matter reference in capitals', 'Ref: KIERKEGAARD01.', SK, 'KIERKEGAARD', null],
    // read as written, a digit stands before it; decoded, a space: either reading finds it alone
    ['%20 before it in a link', 'See https://dms.example.com/find?q=Dr.%20Kierkegaard now.', SK, 'Kierkegaard', null],
    ['a Proofpoint v2 link', `See ${PP} now.`, SK, 'Kierkegaard', null],
    ['a letter of it written as an escape', 'See /clients/Kierkeg%61ard/memo now.', SK, 'Kierkeg%61ard', 'decoded'],
    ['the given name written with escapes', 'See /clients/S%C3%B8ren/memo now.', SK, 'S%C3%B8ren', 'decoded'],
    ['the given name written as character references', 'See &#83;&#248;ren here.', SK, '&#83;&#248;ren', 'decoded'],
    // a capitalised plural is the family (refFind's closed ending): "the Tans", "the Porters"
    ['"the Tans" beside a kept "Margaret Tan"', 'The Tans came.', MT, 'Tan', null],
    ['"the Porters" beside a kept "Mr Porter"', 'The Porters came.', MP, 'Porter', null],
  ];
  for (const [label, T, kept, piece, part] of FOUND) {
    const live = survivingFragments(T, kept);
    check(live.join() === piece, `${label} ("${T}"): the check counts "${piece}"`, JSON.stringify(live));
    for (const was of part ? ['old', part] : ['old']) {
      const [why, M] = WAS[was];
      const got = M.survivingFragments(T, kept);
      check(got.length === 0, `  CONTROL: with ${why}, nothing is counted — the check above can fail`, JSON.stringify(got));
    }
  }
  // what it does not count: a piece inside a longer word, which no reader takes for the name —
  // the mask leaves it too (law 40, owner ruling 8) — a plural written in small letters, which is
  // a noun ("the porters", "the supporters"), and a short piece written in small letters ("the
  // tan leather"). A capitalised plural is counted since the second pass: over TAB's 12,860
  // names as the table and the 99 opinions it adds 85 pieces to 12,621 (measured 2026-09-24),
  // and none across the opinions' own caption parties.
  const NOT = [
    ['"supporter" beside a kept "Mr Porter"', 'A supporter came.', MP],
    ['"Porterfield" beside a kept "Mr Porter"', 'Porterfield came.', MP],
    ['"Kierkegaardian" beside a kept "Søren Kierkegaard"', 'Kierkegaardian thought.', SK],
    ['"the porters" beside a kept "Mr Porter"', 'Then the porters came.', MP],
    ['"the supporters" beside a kept "Mr Porter"', 'Then the supporters came.', MP],
    ['"the tan leather" beside a kept "Margaret Tan"', 'Then the tan leather came.', MT],
  ];
  for (const [label, T, kept] of NOT) {
    const live = survivingFragments(T, kept);
    check(live.length === 0, `${label}: nothing is counted`, JSON.stringify(live));
  }
  // CONTROL: the check read as the .docx writer reads a name in its code — from RUN_FLOOR
  // anywhere inside a word — counts each word above that carries the name
  const UNGUARDED = await engineWith([["for (const f of refFind(exported.split(TAG_BLANK).join(WALL), runNames([...letters]), 'text')) {", "for (const f of refFind(exported.split(TAG_BLANK).join(WALL), runNames([...letters]), 'all')) {"]]);
  const ug = NOT.slice(0, 5).map(([, T, kept]) => UNGUARDED.survivingFragments(T, kept).join());
  check(ug.join('|') === 'porter|Porter|Kierkegaard|porter|porter',
    '  CONTROL: read inside a word, "supporter", "Porterfield", "Kierkegaardian", "the porters" and "the supporters" are each counted — the checks above can fail', JSON.stringify(ug));
  const ANY_CASE = await engineWith([["      if (short.has(f.name) && !/^[\\p{Lu}%&]/u.test(w)) continue;\n", '']]);
  const ac = ANY_CASE.survivingFragments(NOT[5][1], NOT[5][2]);
  check(ac.join() === 'tan',
    '  CONTROL: with a short piece read in any case, "the tan leather" is counted "tan" — the check above can fail', JSON.stringify(ac));
}

// ── LAW 43: a token longer than a window once stopped at ──
console.log('\n— law 43: a name run into a token of any length behind a shorter kept name is read through the claim as in a short one, on every path —');
{
  // runsThrough reads a find's ends with refFind, which reads whether a token is prose from the
  // whole of what stands between two spaces (law 41). Its window was taken out to those spaces
  // at most 256 characters, so in a longer token refFind read the part it was handed as a word
  // of prose and never took the name: a kept "Margaret Tan" beside a kept "Margaret" in a path
  // whose slash stood 300 letters on shipped "[Person2]-tanlaw…/brief" on every path, verified
  // green (P13-SNAP, 2026-09-24). The CONTROL puts the cap back: at 200 letters it still masks,
  // at 300 it ships the surname — the cap is what the check tells apart.
  const P = (k, t, tag) => row(k, t, tag, 'PERSON', 'person');
  const MM = [P('m', 'Margaret Tan', '[Person1]'), P('m2', 'Margaret', '[Person2]')];
  const L = (n) => 'abcdefghij'.repeat(Math.ceil(n / 10)).slice(0, n);
  const HY = (n) => 'abcdefghi-'.repeat(Math.ceil(n / 10)).slice(0, n);
  const CAPPED = await engineWith([
    ['  while (i > 0 && !/\\s/.test(s[i - 1])) i--;', '  for (let k = 0; k < 256 && i > 0 && !/\\s/.test(s[i - 1]); k++) i--;'],
    ['  while (i < s.length && !/\\s/.test(s[i])) i++;', '  for (let k = 0; k < 256 && i < s.length && !/\\s/.test(s[i]); k++) i++;'],
  ]);
  const LONG = [
    ['a slash 300 letters on', `Filed at margaret-tanlaw${L(300)}/brief today.`, `Filed at [Person1]law${L(300)}/brief today.`, true],
    ['a slash 200 letters on', `Filed at margaret-tanlaw${L(200)}/brief today.`, `Filed at [Person1]law${L(200)}/brief today.`, false],
    ['a slash 300 characters before', `Filed at docs/${HY(300)}margaret-tanlaw today.`, `Filed at docs/${HY(300)}[Person1]law today.`, true],
    ['a year 300 letters on', `Ref margaret-tanlaw${L(300)}2024 today.`, `Ref [Person1]law${L(300)}2024 today.`, true],
  ];
  for (const [label, S, W, cut] of LONG) {
    // alone in its text: a claim past the token's other end has a window of its own, and two
    // capped windows that meet were merged into one that held the whole token
    const T = S;
    const WANT = W;
    const { pkg, TEXT } = await docOf(T);
    const ents = syncFloorRows(TEXT, MM, PRACTICE);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, ents, []);
    const got = await everyPath(TEXT, pkg, ents, plan);
    check(TEXT === T && Object.values(got).every((x) => x === WANT) && plan.verified && !plan.blocked,
      `kept "Margaret Tan" run into a token with ${label}, behind a kept "Margaret": one text on every path, masked whole under its own tag, verified`, JSON.stringify(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.slice(0, 40)]))));
    const was = docxPlan(CAPPED, TEXT, pkg, CAPPED.syncFloorRows(TEXT, MM, PRACTICE), []);
    check(cut ? /\[Person2\]-tanlaw/.test(was.red) && was.verified && !was.blocked : was.red === WANT,
      cut ? '  CONTROL: with the window taken out at most 256 characters, as it was, the .txt reads "[Person2]-tanlaw" under a green verification — the check above can fail'
        : '  CONTROL: with the window capped, as it was, a token short enough for the cap is masked the same — so the case above fails on the cap and nothing else', was.red.slice(0, 40));
  }
  // Uncapped, a window taken out to its spaces before it is merged walked every claim inside one
  // token back to the token's start and on to its end: 4,000 claims in a 90,000-character token
  // took 13.8 s here (F7-SNAP, 2026-09-24), 0.19 s merged first. Counted in steps, not timed, so
  // the law does not turn on the machine: each step of snapBack and snapOn is counted in a copy
  // of engine.ts that exports the count.
  const COUNT = [
    ['function snapBack(s: string, i: number): number {', 'export const SNAP_STEPS = { n: 0 };\nfunction snapBack(s: string, i: number): number {'],
    ['  while (i > 0 && !/\\s/.test(s[i - 1])) i--;', '  while (i > 0 && !/\\s/.test(s[i - 1])) { i--; SNAP_STEPS.n++; }'],
    ['  while (i < s.length && !/\\s/.test(s[i])) i++;', '  while (i < s.length && !/\\s/.test(s[i])) { i++; SNAP_STEPS.n++; }'],
  ];
  const N = 500, UNIT = 'Margaret-Tan_file/xxxx';
  const ST = `Memo. ${UNIT.repeat(N)} ends. Margaret Tan signed.`;
  const tokenLen = UNIT.length * N;
  const stepsOf = (M) => {
    M.SNAP_STEPS.n = 0;
    const plan = M.exportPlan({ text: ST, entities: M.syncFloorRows(ST, [P('m', 'Margaret Tan', '[Person1]')], PRACTICE), reviewed: true, engineComplete: true, kind: 'text' }, [], PRACTICE);
    return { steps: M.SNAP_STEPS.n, plan };
  };
  // an export reads names run together through a claim more than once (placements, then the
  // check of what the mask left open), each reading walking the token about once: 32,934 steps
  // here, against 11,000 per walk (measured 2026-09-24)
  const live = stepsOf(await engineWith(COUNT));
  check(live.steps > 0 && live.steps <= 4 * tokenLen && !/Tan/.test(live.plan.red) && live.plan.verified && !live.plan.blocked,
    `${N} claims of a kept "Margaret Tan" inside one ${tokenLen.toLocaleString('en-US')}-character token: every one masked, verified, and the windows taken out to their spaces in a few walks of the token, however many claims it holds`, `${live.steps.toLocaleString('en-US')} steps · ${live.plan.red.slice(0, 60)}`);
  const snapFirst = stepsOf(await engineWith([...COUNT, ['    const lo = stepLetters(w, s, -reach), hi = stepLetters(w, e, reach);', '    const lo = snapBack(w, stepLetters(w, s, -reach)), hi = snapOn(w, stepLetters(w, e, reach));']]));
  check(snapFirst.steps >= (N * tokenLen) / 2 && snapFirst.plan.red === live.plan.red,
    '  CONTROL: with each window taken out to its spaces before it is merged, as it was, the same text walks the token once per claim — the check above can fail, and the mask is the same', `${snapFirst.steps.toLocaleString('en-US')} steps`);
}

// ── LAW 44: the second pass's cases on every path (owner rulings 18 and 19, 2026-09-24) ──
console.log('\n— law 44: a name the writer reads since rulings 18 and 19 is masked the same on the .txt, the Review preview and the saved .docx body, header and footer —');
{
  // SECOND's cases, each in the body, the header and the footer of one .docx. Every path is
  // compared with whitespace as one space (a <w:tab/> in the saved body reads as one), and the
  // fragment check is asked of the .txt: a name masked whole leaves no piece of it. Each CONTROL
  // is the ruling as it was, in the copy of docxWrite.ts the engine bundles: the .txt then
  // carries the name, which is what every path carried before the ruling reached the engine.
  const one = (s) => s.replace(/\s+/g, ' ');
  for (const c of SECOND) {
    const body = c.xml ?? para(c.T);
    const pkg = await makeDocx({ body, header: body, footer: body });
    const TEXT = await textOf(pkg);
    const ents = syncFloorRows(TEXT, c.rows(), PRACTICE);
    const plan = docxPlan({ exportPlan }, TEXT, pkg, ents, []);
    const got = Object.fromEntries(Object.entries(await everyPath(TEXT, pkg, ents, plan)).map(([k, v]) => [k, one(v)]));
    const frag = survivingFragments(plan.red, ents.filter((e) => !e.dead && e.status !== 'rejected'));
    check(one(TEXT) === one(c.T) && Object.values(got).every((x) => x === c.want) && plan.verified && !plan.blocked && frag.length === 0,
      `${c.label}: one text on every path, verified, no fragment counted`, `${JSON.stringify(got)} · fragments ${JSON.stringify(frag)}`);
    const W = await engineWriterWith(RULING_WAS[c.was]);
    const was = docxPlan(W, TEXT, pkg, W.syncFloorRows(TEXT, c.rows(), PRACTICE), []);
    check(c.ships.test(was.red), `  CONTROL: with ${c.why}, the .txt carries ${c.ships} — the check above can fail`, JSON.stringify(was.red));
  }
  // 19a in the engine's own two readings of a name run together (SHORT_AS_WAS): with the long
  // word asked where the short form ends, "Hickson Corporation" goes out "[Company1]oration"
  {
    const c = SECOND[1];
    const { pkg, TEXT } = await docOf(c.T);
    const S = await engineWith(SHORT_AS_WAS);
    const was = docxPlan(S, TEXT, pkg, S.syncFloorRows(TEXT, c.rows(), PRACTICE), []);
    check(was.red.startsWith('[Company1]oration'), '  CONTROL: with the engine reading the find where the short form ends, as it was, the .txt reads "[Company1]oration" — the engine\'s side of 19a can fail on its own', JSON.stringify(was.red));
  }
  // listed after the drop, with the name written only in the form the ruling reads: the page is
  // held on the term until its row is added. Under the ruling as it was the term was not read
  // there, so the page was not held and the .txt carried it.
  for (const c of SECOND.filter((x) => x.late)) {
    const [term, T, xml] = c.late;
    const kept = [row('j', 'Jane Roe', '[Person9]', 'PERSON', 'person')];
    const pkg = await makeDocx({ body: xml ?? para(T) });
    const TEXT = await textOf(pkg);
    const live = docxPlan({ exportPlan }, TEXT, pkg, syncFloorRows(TEXT, kept, PRACTICE), [term]);
    const held = live.holds.map((h) => h.term);
    check(held.includes(term) && live.blocked, `${c.label}, the term listed after the drop and written only that way: the page is held on "${term}" until its row is added`, `${JSON.stringify(held)} · ${JSON.stringify(live.red)}`);
    const W = await engineWriterWith(RULING_WAS[c.was]);
    const was = docxPlan(W, TEXT, pkg, W.syncFloorRows(TEXT, kept, PRACTICE), [term]);
    check(!was.holds.some((h) => h.term === term) && c.ships.test(was.red),
      `  CONTROL: with ${c.why}, the page is not held on it and the .txt carries ${c.ships} — the check above can fail`, `${JSON.stringify(was.holds.map((h) => h.term))} · ${JSON.stringify(was.red)}`);
  }
}

// ── LAW 45: the fragment check's second pass (owner ruling 21, 2026-09-24) ──
console.log('\n— law 45: the fragment check counts a kept row\'s piece in every form the mask reads, named as the copy writes it —');
{
  // Each text below carries a piece of a kept row that no mask took, in a form the first pass of
  // ruling 21 did not count: split at a hyphen or an apostrophe (F2), folded, hidden by an
  // invisible character or a character reference, run into a domain, a handle, a hashtag, a file
  // name or camel case (F3), under a Proofpoint v3 gateway (F3), with a superscript letter glued
  // on (F4), shorter than four letters and capitalised (F6), and run into kana (P1T-4). The piece
  // is named as the copy writes it (P1T-5): a lawyer searching the copy for the row's spelling
  // does not find "M%C3%BCller". Each CONTROL is the first pass put back (FRAG_FIRST_PASS).
  const P = (k, t, tag = '[Person1]') => row(k, t, tag, 'PERSON', 'person');
  const SK = [P('sk', 'Søren Kierkegaard', '[Person2]')];
  const CASES = [
    ['a curly apostrophe in the row, a straight one in the text', 'Ms O\'Brien replied.', [P('o', 'Siobhan O’Brien')], 'O\'Brien'],
    ['the first half of a hyphenated surname', 'Mendez was removable.', [P('m', 'Maria Mendez-Gutierrez')], 'Mendez'],
    ['a company\'s first word before its hyphen', '("Hewlett") filed.', [row('h', 'Hewlett-Packard Company', '[Company1]', 'COMPANY', 'org')], 'Hewlett'],
    ['a surname without its tilde', 'Munoz replied.', [P('m', 'Ana Muñoz')], 'Munoz'],
    ['a surname with a ligature', 'Mr Griﬃths replied.', [P('g', 'Ann Griffiths')], 'Griﬃths'],
    ['a soft hyphen inside the surname', 'Kierke­gaard replied.', SK, 'Kierke­gaard'],
    ['a zero-width space inside the surname', 'Kierke​gaard replied.', SK, 'Kierke​gaard'],
    ['"&shy;" inside the surname', 'Kierke&shy;gaard replied.', SK, 'Kierke&shy;gaard'],
    ['the surname in full-width letters', 'Ｋｉｅｒｋｅｇａａｒｄ replied.', SK, 'Ｋｉｅｒｋｅｇａａｒｄ'],
    ['the surname in a handle', 'Follow @kierkegaardlaw now.', SK, 'kierkegaard'],
    ['the surname in a hashtag', 'Tag #kierkegaardfamily now.', SK, 'kierkegaard'],
    ['the surname in a domain', 'Visit www.kierkegaardlaw.com now.', SK, 'kierkegaard'],
    ['the surname in a file name', 'Open KierkegaardFamilyTrust.pdf now.', SK, 'Kierkegaard'],
    ['the surname in camel case', 'The KierkegaardLaw team.', SK, 'Kierkegaard'],
    ['the given name under a Proofpoint v3 gateway', 'See https://urldefense.com/v3/__https://dms.example.com/clients/S*ren/memo__;w7g!!ABC$ now.', SK, 'S*ren'],
    ['the surname run into kana', 'Kierkegaardキルケゴール wrote.', SK, 'Kierkegaard'],
    ['a superscript letter glued to the surname (F4)', 'Kierkegaardᵃ replied.', SK, 'Kierkegaard'],
    ['a surname of three letters, capitalised (F6)', 'Mr Tan replied.', [P('m', 'Margaret Tan')], 'Tan'],
    ['the umlaut written as escapes (P1T-5)', 'See /clients/M%C3%BCller/memo now.', [P('h', 'Hans Müller')], 'M%C3%BCller'],
  ];
  for (const [label, T, kept, piece] of CASES) {
    const live = survivingFragments(T, kept);
    check(live.includes(piece), `${label}: "${piece}" is counted as the copy writes it`, JSON.stringify(live));
  }
  const First = await engineWith(FRAG_FIRST_PASS);
  const firstGot = CASES.map(([, T, kept]) => First.survivingFragments(T, kept));
  // the first pass named the escaped umlaut "Müller", which is not in the copy; every other case
  // it did not count
  const firstOk = firstGot.every((g, i) => (CASES[i][0].includes('P1T-5') ? g.join() === 'Müller' : g.length === 0));
  check(firstOk, '  CONTROL: with the first pass put back, none of the above is counted, and the escaped umlaut is named "Müller" — the checks above can fail', JSON.stringify(firstGot.map((g, i) => (g.length ? `${i}:${g.join('+')}` : '')).filter(Boolean)));
  // a piece of four or five letters run into a web address or a hashtag (P1T-4): refFind reads a
  // name inside a token that is not a word of prose only from six letters, as the mask does, so
  // the check asks such a token for the piece itself (inTokenFinds) and names it as the token
  // writes it
  const IN_TOKEN = [
    ['a given name of five letters in a web address', 'Visit tanyalaw.com now.', [P('t', 'Mei Tanya')], 'tanya'],
    ['a given name of four letters in a hashtag', 'Tag #hansfamily now.', [P('h', 'Hans Holm')], 'hans'],
  ];
  const NoToken = await engineWith([['    if (inToken.size) finds.push(...inTokenFinds(exported, [...inToken]).filter((t) => !finds.some((f) => f.n === t.n && t.s <= f.s && f.e <= t.e)));\n', '']]);
  for (const [label, T, kept, piece] of IN_TOKEN) {
    const live = survivingFragments(T, kept);
    check(live.join() === piece, `${label}: "${piece}" is counted as the copy writes it`, JSON.stringify(live));
    check(NoToken.survivingFragments(T, kept).length === 0, '  CONTROL: with the token not asked for a piece under six letters, nothing is counted — the check above can fail', JSON.stringify(NoToken.survivingFragments(T, kept)));
  }
  // the export as written, beside its escapes decoded (P1T-7): "%61" after the surname is an
  // escape of "a", so decoded the surname runs on into a longer word — as written, it does not
  const AW = 'Kierkegaard%61 replied.';
  check(survivingFragments(AW, SK).includes('Kierkegaard'), 'the surname before an escape it runs on into, "Kierkegaard%61": counted as written', JSON.stringify(survivingFragments(AW, SK)));
  const NoView = await engineWith([['    for (const p of letters) {\n      if (short.has(p)) continue;', '    for (const p of [] as string[]) {\n      if (short.has(p)) continue;']]);
  check(NoView.survivingFragments(AW, SK).length === 0, '  CONTROL: with the export read only with its escapes decoded, nothing is counted — the check above can fail', JSON.stringify(NoView.survivingFragments(AW, SK)));
  // the always-redact list's terms beside the rows (F5): a word of a term with no row
  const KT = 'Mr Kestrel12 replied.';
  check(survivingFragments(KT, [], ['Kestrel Capital Partners']).join() === 'Kestrel', 'a word of a listed term with no row, "Mr Kestrel12": counted "Kestrel"', JSON.stringify(survivingFragments(KT, [], ['Kestrel Capital Partners'])));
  check(First.survivingFragments(KT, [], ['Kestrel Capital Partners']).length === 0, '  CONTROL: with the first pass, which read the rows alone, nothing is counted — the check above can fail');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
