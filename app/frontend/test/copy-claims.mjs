// COPY CLAIMS — the sentences on screen and in the documents of record that state a number
// or a guarantee, held to the file that is their evidence.
// Run from app/frontend:   node test/copy-claims.mjs
//
// Each law reads the evidence (a ledger table, the committed boards, the code that does the
// thing) and the sentence that reports it, and fails when they disagree. Each has CONTROLS:
// the sentence as it shipped before 2026-09-23, and the live sentence reworded back into the
// over-claim in the other words it could take, run through the same check, must fail.
// Without them a check that can never fail would read as a pass — the first version of this
// file passed "about 3.5 seconds", "verifies both" and "no party … left readable" (review
// 2026-09-23, D23-5). Where a law can be an allowlist (what the "no …" may name, that a limit
// is stated, that every stored thing is named) it is one; where it reads words for an
// over-claim (law 4's verbs) it catches the words it lists and the rewordings in its controls,
// not every phrasing. A control that no longer changes the live sentence throws rather than
// passing.
// Registered in tools/verify.mjs as 'copy-claims'.
//
//   1. THE SPEED ON THE DROP SCREEN IS THE RUN IT CITES. The screen gave "about 2.6 seconds
//      per 1,000 characters" for a run whose own seconds add to 642.6 over 161,051
//      characters: 3.99. A lawyer sizing a batch before a deadline was told it would take
//      about two thirds of the time it takes. The stated rate must be the true rate rounded
//      to the precision the sentence states.
//   2. THE SETTINGS CARD SAYS DIRECT. "zero identity leaks" over the 46 documents whose
//      boards also show 245 of 503 quasi-identifiers readable. Every other surface says
//      DIRECT; the one card where a lawyer picks a doctrine did not.
//   3. THE PROXY REFUSAL IS STATED AT ITS REAL CONDITION. serve-legal.mjs refuses only when
//      Node is switched to use the proxy; with HTTP_PROXY alone it starts (and Node does not
//      use it). "refuses to run under them" said it refuses in the common case.
//   4. THE /slots CHECK IS NOT CLAIMED AS INDEPENDENT. The probe carries no key, so while the
//      key is in force it reads 401 whether /slots is off or not. "checks both" claimed two
//      observed layers where one is observed. Every surface must state that limit, and no
//      observing verb it lists may sit on both/each/all, or on /slots being off.
//   5. "NO PERSON LEFT READABLE" IS SCOPED TO WHAT THE HAND LIST AND THE ENGINE DID. On all
//      five surfaces that give the firm figures: the "no …" names people, email and phone
//      only (party companies and a law firm WERE readable — OPS_LEDGER 2026-09-14 finding 2),
//      the passage says so, says judges and officials were not counted, and its "by design"
//      clause names every class the courts stages release: judges (LN2), counsel on a
//      counsel line (LN3) and courts or public bodies (LN1), read from apply-ln.mjs. The
//      whole negated clause before "left readable" (or "stayed", "remained", "kept", or
//      "unmasked", "visible", "in the clear") is read, and the clause after it; a clause that
//      opens on its negation is read with no verb before "readable" too, and with "survived",
//      "reached the model", "leaked" or "got through", and such a clause that names a party,
//      a company, a client, a firm, an organisation, an identifier or a name is read whatever
//      its verb; an address is not one of the things the "no …" may name (the ledger records
//      one split and readable); and "every party was masked" (or anonymised, pseudonymised,
//      redacted, blacked out and the other words DONE lists — a list, since "all party
//      companies were readable" has the same shape and is true), or "masked in every filing",
//      is refused, with controls on the README and the published page as well as About.
//   6. THE MODEL SIZE ON SETUP IS THE PINNED FILE'S.
//   7. HISTORY NAMES EVERYTHING KEPT BETWEEN SESSIONS. Every localStorage key the app
//      writes, every log file engine.rs opens (kept until the next start rewrites it), and —
//      while engine.rs sweeps stale runs at launch — that a run cut short by closing the app
//      leaves its working copies until the engine next starts.
//   8. THE FIRM NOTE SAYS WHAT THE CITATION RAIL RELEASES. Settings said company names are
//      "never released" on the firm doctrine; every citation it keeps carries its parties'
//      names, and the rail's guard skips stop-list words and short words, so a client named
//      only in them can have its own earlier case released. The generic words the note names
//      must be in CITE_TOKEN_STOP and its floor must be identityToks' floor.
//   9. THE RUN-TOGETHER FLOOR CARRIES THE PLAIN-WORD RULE. README, BENCHMARK and the audit
//      said a name is found "from six letters and digits, anywhere inside a longer word"; in
//      text a reader sees textHolds never reads one inside a plain word of letters (owner
//      ruling 8), so "kestrelholdings" and "Margaret Tanand" ship. Every statement of the floor
//      inside a longer word, by the RUN_FLOOR token or in words (the floor as a word or a
//      digit, in letters or characters; inside, within or run into a word), must carry that
//      rule and not the short-word exception it replaced, with the floor read from docxWrite.ts.
//  10. THE TWO EXPORTS ARE NOT SAID TO MASK ALIKE. The .txt is the body masked by exportPlan,
//      the .docx every part masked by the writer; until W7F-1 the .txt shipped a name the .docx
//      masked from the same body. Owner ruling 13: no document of record, About or the
//      published page says they mask identically, and README, BENCHMARK and the audit each say
//      they are not claimed to.
//  11. THE PROOFPOINT ESCAPE IN THE TEXT EXPORTS IS STATED AS engine.ts HAS IT. The documents
//      listed "Ren-E9-20Tan" shipping from the .txt and the copied text as open after exportPlan
//      began asking hasEscape (2026-09-24). Read both ways: closed with hasEscape named while
//      the code asks it, open while it does not.
//  12. THE TOKEN LIST NAMES EVERY MARK docxWrite.ts JOINS ON. Owner ruling 18 put "#" in
//      JOINER and HANDLE; the documents still listed "`@` or `_`" and "one an `@` starts", and
//      "#kestrelholdings" sat in the open list after the code masked it. Every statement of the
//      list must carry each mark of both sets, read from the code.
//  13. THE DIGIT GROUPINGS ARE STATED AS DIGIT_SEP READS THEM. README named "a slash", "a
//      bullet" and "a space of any kind" as read, where the code reads "/", "•" and "∙" and
//      Unicode's space separators only ("3192‣6819" and "3192⁄6819" shipped from both exports
//      under a clean gate), and its list of what is not read left out a line break, which a
//      mail program's wrap puts exactly where the grouping space was.
//  14. THE WRAPPED-LINK CLOSURE CARRIES ITS CONDITION AND ITS REMAINDER. Law 79 reads a
//      Proofpoint link across a bare line break only: with "> " on the next line, as every mail
//      program quotes a reply, the name shipped from 72 of 100 places, and the documents said a
//      wrapped link is masked. "47 of 100 … now masked" also counted the 9 places a link inside
//      the name's letters that still ship.
//  15. THE INTAKE NO-REGRESSION CLAIM COUNTS THE RULES THAT RECORD IT. README said each of that
//      day's five intake changes records that no ordinary link was newly held; detect.ts records
//      it at three.
//  16. THE FRAGMENT CHECK AND THE LOOK-ALIKE SIGNS ARE STATED AS THE CODE READS THEM. The
//      check flags a capitalised plural ("the Kierkegaards") where the documents said "never
//      inside a plain word of letters"; it reads a tag only with the plain "#" or "@", where
//      they said "a handle or a tag"; and the mask reads three named look-alike signs, where
//      the audit said "a small or look-alike `#` or `@`" ("⌗kestrelcapitaldeal" ships). A tag
//      behind a look-alike the mask reads is read for a piece from RUN_FLOOR, not "not read".
//  17. THE WRAPPED -E9 LINK IS NOT SAID TO HOLD THE .docx. The writer saved the name at the
//      same 7 places a link the .txt ships from, under a gate of 0 leaks; the documents said
//      "the `.docx` holds".

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function check(ok, what, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${what}`); }
  else { fail++; console.log(`  FAIL  ${what}${detail ? `\n          ${detail}` : ''}`); }
}

// ── 1. the Drop screen's speed ──
console.log('\n— 1. the speed on the Drop screen —');
{
  const ledger = read('OPS_LEDGER.md');
  const at = ledger.indexOf('**The run: started 9 · results 9');
  if (at < 0) throw new Error('OPS_LEDGER.md: the 2026-09-14 run header moved; this law reads its table');
  const table = ledger.slice(at, ledger.indexOf('\n\n**The check.**', at));
  const rows = [...table.matchAll(/^\| (\d\d) \| ([\d,]+) \| (\w+) \| \d+ \| ([\d.]+) \|/gm)]
    .map((m) => ({ chars: Number(m[2].replace(/,/g, '')), genre: m[3], secs: Number(m[4]) }));
  const secs = rows.reduce((s, r) => s + r.secs, 0);
  const chars = rows.reduce((s, r) => s + r.chars, 0);
  const courts = rows.filter((r) => r.genre === 'courts').map((r) => (r.secs / r.chars) * 1000);
  check(rows.length === 9, 'the ledger table has the nine documents the sentence counts', String(rows.length));

  // What the sentence says, read back as numbers.
  const said = (sentence) => {
    const n = (re) => { const m = sentence.match(re); return m ? Number(m[1].replace(/,/g, '')) : NaN; };
    const s = n(/\(([\d.]+) seconds\)/);
    return {
      chars: n(/([\d,]+) characters in all/),
      secs: Number.isFinite(s) ? s : n(/took ([\d.]+) minutes/) * 60,
      rate: n(/about ([\d.]+) seconds per 1,000 characters/),
      courts: (sentence.match(/took ([\d.]+) to ([\d.]+) seconds per 1,000/) || []).slice(1).map(Number),
    };
  };
  // The stated rate must be the true rate rounded to the precision the sentence states it at:
  // "about 4" passes for 3.99, "about 4.4" or "about 3.5" does not. A tolerance band (the
  // previous version allowed ±0.5) passes a reworded under-statement as readily as the truth.
  const places = (sentence) => ((sentence.match(/about ([\d.]+) seconds per 1,000 characters/) || [])[1] || '').split('.')[1]?.length ?? 0;
  const agrees = (sentence) => {
    const x = said(sentence);
    const p = 10 ** places(sentence);
    return x.chars === chars && Math.abs(x.secs - secs) < 1 && x.rate === Math.round((secs / chars) * 1000 * p) / p
      && (x.courts.length === 0 || (x.courts[0] === Math.round(Math.min(...courts) * 10) / 10
        && x.courts[1] === Math.round(Math.max(...courts) * 10) / 10));
  };
  const DROP = read('app', 'frontend', 'src', 'screens', 'Drop.tsx');
  const sentence = (DROP.match(/How long it takes depends on the computer:[^']*/) || [''])[0];
  check(sentence.length > 0, 'the Drop screen still carries its speed sentence');
  check(agrees(sentence), `the stated rate is the cited run's own: ${secs.toFixed(1)} s over ${chars.toLocaleString('en-US')} characters`, sentence);
  const OLD = 'How long it takes depends on the computer: on a laptop graphics card (RTX 4060), nine court filings, 161,051 characters in all, took 10.7 minutes, about 2.6 seconds per 1,000 characters. No timing without a graphics card is on record.';
  check(!agrees(OLD), 'CONTROL: the sentence as it shipped ("about 2.6 seconds per 1,000") fails the same check');
  for (const wrong of ['3.5', '4.4', '3']) {
    const reworded = sentence.replace(/about [\d.]+ seconds per 1,000 characters/, `about ${wrong} seconds per 1,000 characters`);
    if (reworded === sentence) throw new Error('Drop.tsx: the rate phrase moved; the controls below would test nothing');
    check(!agrees(reworded), `CONTROL: the current sentence with "about ${wrong}" in place of its rate fails the same check`);
  }
  check(said(sentence).courts.length === 2, 'the court-judgment range is read, so the check above covers it');
  check(!agrees(sentence.replace(/took ([\d.]+) to ([\d.]+) seconds per 1,000/, 'took 2.1 to 3.0 seconds per 1,000')),
    'CONTROL: a court-judgment range the ledger does not give fails the same check');
}

// ── 2. the Settings card ──
console.log('\n— 2. the Settings card says DIRECT —');
{
  const runs = join('pii-bench', 'runs');
  const boards = ['ROUND5-edgar-firstcontact.json', 'ROUND6-edgar-firstcontact.json', 'ROUND7-edgar-firstcontact.json', 'PUREOOS-firstcontact.json'];
  let docs = 0, dl = 0, qt = 0, ql = 0;
  for (const b of boards) {
    for (const r of JSON.parse(read(runs, b)).perDoc.filter((r) => !r.missing && !r.withheld)) {
      docs++; dl += r.direct.leaked; qt += r.quasi.total; ql += r.quasi.leaked;
    }
  }
  check(docs === 46 && dl === 0, 'the four boards hold 46 documents and no DIRECT leak', `${docs} docs, ${dl} DIRECT leaked`);
  const PROFILE = read('app', 'frontend', 'src', 'lib', 'profile.ts');
  const auto = (PROFILE.slice(PROFILE.indexOf("id: 'auto'")).match(/measured: '([^']*)'/) || [])[1] || '';
  const honest = (m) => !/zero identity leaks|zero leaks/i.test(m)
    && /zero DIRECT/.test(m) && m.includes(`${ql} of their ${qt} quasi-identifiers`);
  check(honest(auto), `the card says the claim is DIRECT and states the quasi-identifiers the same boards leave readable (${ql} of ${qt})`, auto.slice(0, 160));
  const OLD = 'zero identity leaks over 46 unseen business agreements in four consecutive draws — 45 ran the engine before the freeze, one ran it frozen (FREEZE.md, C1).';
  check(!honest(OLD), 'CONTROL: "zero identity leaks", as it shipped, fails the same check');
}

// ── 3. the proxy refusal ──
console.log('\n— 3. the proxy refusal is stated at its condition —');
{
  const SERVE = read('serve-legal.mjs');
  const src = (SERVE.match(/export function proxyHazard[\s\S]*?\n}\n/) || [''])[0];
  if (!src) throw new Error('serve-legal.mjs: proxyHazard moved; this law runs it');
  const proxyHazard = new Function(`${src.replace('export function', 'return function')}`)();
  const plain = proxyHazard({ HTTP_PROXY: 'http://proxy.example:8080' }, []);
  const switched = proxyHazard({ HTTP_PROXY: 'http://proxy.example:8080', NODE_USE_ENV_PROXY: '1' }, []);
  check(plain === null && switched !== null, 'serve-legal starts under HTTP_PROXY alone and refuses only with Node switched to use it', `${plain} / ${switched}`);
  const conditioned = (t) => t.length > 0 && !/refuses to run under (them|one)\b/.test(t) && !/refuses to start by hand under the same settings/.test(t)
    && (!/refuses to (run|start)/.test(t) || /NODE_USE_ENV_PROXY|when Node is told/.test(t));
  const ABOUT = read('app', 'frontend', 'src', 'screens', 'About.tsx');
  const README = read('README.md');
  const FREEZE = read('FREEZE.md');
  const aboutProxy = (ABOUT.match(/Proxy settings[^<]*/) || [''])[0];
  check(conditioned(aboutProxy), 'About states the refusal at its condition', aboutProxy);
  check(conditioned((README.match(/Redaction itself talks to 127\.0\.0\.1[\s\S]*?\(see "Running the app"\)/) || [''])[0]), 'README states it at its condition');
  check(conditioned((FREEZE.match(/`serve-legal\.mjs`, which is not frozen,[\s\S]*?\n\n/) || [''])[0]), 'FREEZE.md states it at its condition');
  check(!conditioned("Proxy settings in Windows' environment are removed from every process the app starts, and an engine service started by hand refuses to run under them"),
    'CONTROL: the About sentence as it shipped fails the same check');
}

// ── 4. the /slots check ──
console.log('\n— 4. the /slots check is not claimed as independent —');
{
  const ENGINE = read('app', 'src-tauri', 'src', 'engine.rs');
  const keyless = /fn probe_model\([^)]*\)[^{]*\{\s*let t = crate::relay::Target \{[^}]*key: None/.test(ENGINE);
  const silent401 = /"\/slots"[\s\S]{0,400}_ => \{\} \/\/ 401/.test(ENGINE);
  check(keyless && silent401, 'engine.rs probes /slots without the key and passes a 401 silently', `keyless ${keyless}, silent 401 ${silent401}`);
  // Two tests, because neither holds alone. (a) The limit is stated: every surface that
  // describes the check says that the keyless probe cannot tell /slots switched off from /slots
  // behind the key. That is an allowlist — deleting the limit fails whatever else the page
  // says. (b) No paragraph that mentions /slots puts an observing verb on both / each / all of
  // the settings, or on /slots being off or in force. (b) is a word list and catches only the
  // verbs it names — "makes sure", "proves" and "establishes" passed its first version (review
  // 2026-09-23, D2L-3) — so a rewording that keeps the limit and uses a verb not listed here
  // still passes; (a) is what leaves such a rewording contradicting itself on the page. A verb
  // after "cannot" / "does not", or a noun followed by "cannot" / "fails" ("the second check
  // cannot tell"; "if either check fails"), is not an observation and is let through.
  const VERB = String.raw`(?<!(?:cannot|can't|can not|does not|doesn't|not)\s+)\b(?:check|checks|checked|verif(?:y|ies|ied)|confirm(?:s|ed)?|tests|tested|probes|probed|observe(?:s|d)?|ensure(?:s|d)?|make(?:s)? sure|made sure|prove(?:s|d|n)?|establish(?:es|ed)?|ascertain(?:s|ed)?|validate(?:s|d)?|guarantee(?:s|d)?|assure(?:s|d)?|determine(?:s|d)?|detect(?:s|ed)?|attest(?:s|ed)?|sees|saw|knows|finds)\b(?!\s+(?:cannot|can't|can not|does not|doesn't|fails?)\b)`;
  const BOTH = new RegExp(`${VERB}[^.;]{0,80}\\b(?:both|each|all)\\b`, 'i');
  const SLOTS_OFF = new RegExp(`${VERB}[^.;]{0,80}/slots\\b[^.;]{0,30}\\b(?:is|was|are|be|been)\\s+(?:switched\\s+|turned\\s+)?(?:off|disabled|in force)`, 'i');
  const LIMIT = /cannot tell|not observed|cannot confirm/i;
  // The paragraphs that talk about /slots: a blank-line paragraph in a document, one srow span
  // on the About screen.
  const slotsParas = (t) => t.split(/\n\s*\n|<div className="srow">/).filter((p) => /\/slots/.test(p));
  const overclaims = (t) => keyless && silent401 && slotsParas(t).some((p) => BOTH.test(p) || SLOTS_OFF.test(p));
  const statesLimit = (t) => slotsParas(t).some((p) => LIMIT.test(p));
  const surfaces = [['About', read('app', 'frontend', 'src', 'screens', 'About.tsx')], ['README', read('README.md')], ['FREEZE.md', read('FREEZE.md')]];
  for (const [name, text] of surfaces) {
    const hit = slotsParas(text).map((p) => (p.match(BOTH) || p.match(SLOTS_OFF) || [''])[0]).find(Boolean) || '';
    check(!overclaims(text), `${name} does not say the app observes both settings or /slots being off`, hit);
    check(statesLimit(text), `${name} says the keyless /slots probe cannot tell switched off from behind the key`);
  }
  // Controls, each set into the live About paragraph, so they are read the way the page is.
  const ABOUT = surfaces[0][1];
  const inAbout = (s) => ABOUT.replace(/and says so on screen if either check fails\./, `and says so on screen if either check fails. ${s}.`);
  if (inAbout('x') === ABOUT) throw new Error('About.tsx: the /slots sentence moved; the controls below would test nothing');
  for (const s of [
    'the app checks both and says so on screen if either is not in force',  // as it shipped
    'the app verifies both settings on the running server',
    'at launch the app confirms that /slots is switched off',
    'the app makes sure both settings are in force on the running server',
    'the app proves both settings on the running server',
    'the app verifies that the key and /slots are both in force',
    'on every launch the app establishes that /slots is switched off',
  ]) check(overclaims(inAbout(s)), `CONTROL: "${s}" fails the same check`);
  const noLimit = ABOUT.replace(/ While the key is in force the second check cannot tell[^.]*\./, '');
  if (noLimit === ABOUT) throw new Error('About.tsx: the /slots limit sentence moved; re-aim the control');
  check(!statesLimit(noLimit), 'CONTROL: the About line with its limit sentence deleted fails the same check');
  check(!overclaims('Network: the probe carries no key, so the app cannot confirm that /slots is off while the key is in force'),
    'the honest form ("cannot confirm that /slots is off") is not read as the over-claim');
}

// ── 5. judges ──
console.log('\n— 5. "no person left readable" says judges were not counted —');
{
  const LEDGER = read('OPS_LEDGER.md');
  const excluded = /Judges and other public officials are scored\s+separately and never enter the direct-identifier count/.test(LEDGER);
  check(excluded, 'the ledger records that judges and officials were left out of the hand count');
  // What the evidence says was readable, and what the courts route releases by design.
  const partyCo = /the (plaintiff|defendant) company's name/.test(LEDGER);
  const lawFirm = /law firm's name/.test(LEDGER);
  check(partyCo && lawFirm, 'the ledger records a party company\'s name and a law firm\'s name left readable (2026-09-14, finding 2)');
  const LN = read('apply-ln.mjs');
  const release = {
    judge: /LN2/.test(LN),
    counsel: /LN3: counsel-line rail/.test(LN),
    'court or public body': /LN1: institutional orgs/.test(LN),
  };
  check(release.judge && release.counsel && release['court or public body'], 'apply-ln.mjs still carries LN1 (institutions), LN2 (judges) and LN3 (counsel lines)');
  const FREEZE = read('FREEZE.md');
  check(/apply-ln\.mjs\s+--ln 0,1,2,3/.test(FREEZE), 'FREEZE.md runs all three on the courts route');

  // A passage is honest when (a) every "no … left readable" names only people, email and phone
  // — never identifiers, organisations, companies, firms or an unqualified "party", because
  // party companies and a law firm WERE readable; (b) it says those companies were readable;
  // (c) it says judges and officials were not counted; (d) its "by design" clause names every
  // class the courts stages release — a judges-only clause hides counsel and institutions.
  const ALLOWED = new Set(['no', 'person', 'persons', 'people', 'individual', 'individuals', 'parties', 'counsel', 'included',
    'on', 'in', 'the', 'that', 'hand', 'list', 'lists', 'email', 'emails', 'phone', 'phones', 'telephone', 'and', 'or', 'nor']);
  // Not "address": the ledger records a street address split with its number and name readable
  // (OPS_LEDGER, `1700 Broadway`), and with "address" allowed "no email, no phone and no address
  // was left readable" passed on About, the README and the published page (review 2026-09-24,
  // D2J-5).
  // The WHOLE clause that ends in "left readable" is read, from the sentence or list boundary
  // before it, whenever it carries a negation. The first version captured from the word "no"
  // onward, so "None of the parties or counsel on the hand list, no email and no phone" was read
  // as "email and no phone" and passed on the README and the published page (review 2026-09-24,
  // D23R-1). A clause with no negation ("Identifiers left readable: 27 of 296") states what WAS
  // readable and is not a universal.
  const NEGATION = /\b(?:no|none|not|never|nothing|nobody|neither|nor|zero|without)\b/i;
  // The verb is any of the ways the sentence can say it: "stayed readable", "remained readable",
  // "left unmasked", "kept in the clear". And the clause AFTER the verb is read too, up to the
  // next boundary, so "…phone was left readable, nor any party or company name" cannot carry the
  // over-claim past the check. Only "left readable" was read until review 2026-09-24 (D2L-4),
  // and each of those rewordings passed on the README. The verb before "readable" is optional,
  // and "survived", "reached the model", "leaked" and "got through" say the same thing: with
  // the verb required, "No party name was readable.", "No party name survived." and "No party or
  // company name reached the model." passed on every surface (review 2026-09-24, D23-2). Those
  // shorter forms are read only where the clause OPENS on its negation: read anywhere in the
  // clause, "zero DIRECT identity leaks … (round 4 … leaked 3 DIRECT spans" on About, a true
  // statement that one round leaked, read as a universal over identities.
  const OPENS_NO = String.raw`(?:no|none|not one|nothing|nobody|neither|nor|zero)\b`;
  // A clause that opens on its negation and names a party, a company, a client, a firm, an
  // organisation, an identifier or a name is read whatever its verb: the verbs above are a list,
  // and "No party name could be read", "Not one client name was exposed", "no company name made
  // it to the model" and "No party name escaped" each passed on About with every list in place
  // (review 2026-09-24, D2J-8). "individual parties" is the scope About states, not a claim.
  const PARTYLIKE = /\b(?:part(?:y|ies)|compan(?:y|ies)|clients?|counterpart(?:y|ies)|firms?|organi[sz]ations?|identifiers?|names?)\b/i;
  const universals = (t) => [
    ...[
      ...t.matchAll(/(?:^|[.;:|])\s*([^.;:|]*?)\s+(?:was |were )?(?:left|stayed|remained|kept)\s+(?:readable|unmasked|visible|in (?:the )?clear)([^.;:|]*)/gi),
      ...t.matchAll(new RegExp(String.raw`(?:^|[.;:|])\s*(${OPENS_NO}[^.;:|]*?)\s+(?:(?:was|were)\s+)?(?:(?:(?:left|stayed|remained|kept)\s+)?(?:readable|unmasked|visible|in (?:the )?clear)|survived|reached (?:the )?model|leaked|got through)\b([^.;:|]*)`, 'gi')),
    ].flatMap((m) => [m[1], m[2]]),
    ...[...t.matchAll(new RegExp(String.raw`(?:^|[.;:|])\s*(${OPENS_NO}[^.;:|]*)`, 'gi'))].map((m) => m[1]).filter((c) => PARTYLIKE.test(c.replace(/individual part(?:y|ies)/gi, ''))),
  ].filter((c) => NEGATION.test(c));
  // "…, and every party was masked" says the same thing without a "no": a quantifier over a
  // party, company, firm, organisation, name or identifier beside a masking verb, either order.
  // "anonymised" and "pseudonymised" are masking verbs too: "Every party name was anonymised."
  // passed while only the six below were read (D23-2).
  const NOUN = String.raw`(?:part(?:y|ies)|compan(?:y|ies)|firms?|organi[sz]ations?|names?|identifiers?|counsel)`;
  // Still a list, since "All party companies were readable" is a true sentence of the same
  // shape: "Every party's name was blacked out" passed until the out-forms and the other
  // ordinary words for it were added (D2J-8).
  const DONE = String.raw`(?:masked|redacted|replaced|withheld|removed|hidden|caught|anonymi[sz]ed|pseudonymi[sz]ed|blacked out|struck (?:out|through)|scrubbed|stripped|concealed|obscured|erased|deleted|suppressed|sanitised|sanitized|de-?identified|tokeni[sz]ed|taken out|covered)`;
  // The fourth arm puts the quantifier on the place, not the noun: "Party names were masked in
  // every filing" (D2L-4).
  const ALL_MASKED = new RegExp(String.raw`\b(?:every|all|each)\b[^.;:|]{0,60}?\b${NOUN}\b[^.;:|]{0,40}?\b${DONE}\b|\b${NOUN}\b[^.;:|]{0,40}?\b(?:all|every one|each)\b[^.;:|]{0,20}?\b${DONE}\b|\b${DONE}\b[^.;:|]{0,20}?\b(?:every|all|each)\b[^.;:|]{0,30}?\b${NOUN}\b|\b${NOUN}\b[^.;:|]{0,40}?\b${DONE}\b[^.;:|]{0,25}?\b(?:in every|in all|in each|always|throughout)\b`, 'i');
  const why = (raw) => {
    const t = raw.replace(/\s+/g, ' ');  // the docs wrap mid-phrase; read them as prose
    if (!t) return 'passage not found';
    const all = t.match(ALL_MASKED);
    if (all) return `"${all[0]}" says every one was masked, and party companies were readable`;
    const us = universals(t);
    if (us.length === 0) return 'no "no … left readable" statement found (the passage moved or was cut)';
    for (const u of us) {
      if (/identifier|organi[sz]ation|compan|firm|business/i.test(u)) return `"no ${u}" covers what was readable`;
      if (/\bpart(y|ies)\b/i.test(u.replace(/individual part(y|ies)/gi, ''))) return `"no ${u}" says no party, and party companies were readable`;
      // Allowlist: the rules above name the over-claims already seen; a word list of them let
      // "no name", "no identity", "no one named" and "no client or counterparty" through
      // (review 2026-09-23, D2L-3). Every word of the "no …" must be one of these.
      const stray = u.toLowerCase().split(/[^a-z']+/).filter((w) => w && !ALLOWED.has(w));
      if (stray.length) return `"no ${u}" names more than people, email and phone ("${stray.join('", "')}")`;
    }
    if (partyCo && !/party compan/i.test(t)) return 'does not say party companies\' names were readable';
    if (lawFirm && !/firm/i.test(t.replace(/law firm's (own )?shapes|a law firm's own paper|shapes a firm writes/gi, ''))) return 'does not say a law firm\'s name was readable';
    if (excluded && !/judges and other (public )?officials (were|are) not (counted|in the count)/i.test(t)) return 'does not say judges and officials were not counted';
    const design = (t.match(/by design[\s\S]{0,320}/i) || [''])[0];
    if (!design) return 'no by-design clause';
    for (const [cls, on] of Object.entries(release)) {
      const re = cls === 'court or public body' ? /court or public body|public bod|institution/i : new RegExp(cls, 'i');
      if (on && !re.test(design)) return `by-design clause omits ${cls}`;
    }
    return '';
  };
  const ABOUT = read('app', 'frontend', 'src', 'screens', 'About.tsx');
  const README = read('README.md');
  const BENCH = read('BENCHMARK.md');
  const HTML = read('app', 'frontend', 'public', 'benchmark.html');
  const between = (t, a, b) => { const i = t.indexOf(a); if (i < 0) return ''; const j = t.indexOf(b, i + a.length); return j < 0 ? '' : t.slice(i, j); };
  const passages = [
    ['About, Measured', (ABOUT.match(/<span className="k">Measured<\/span><span>[^<]*/) || [''])[0]],
    ['README, introduction', between(README, 'has since met 20 scorable', 'Before those')],
    ['README, firm row', README.split('\n').find((l) => l.startsWith('| The frozen configuration on a law firm')) || ''],
    ['BENCHMARK.md, firm section', between(BENCH, '## The frozen configuration on a law firm\'s own shapes', '\n## ')],
    ['benchmark.html, firm item', between(HTML, '<b>A law firm\'s own paper:</b>', '</li>')],
  ];
  for (const [name, t] of passages) {
    const w = why(t);
    check(w === '', `${name}: people-only claim, party companies and a firm named as readable, judges not counted, all three by-design releases named`, w);
  }

  // Controls: each regression the check exists to catch, applied to the live About span so the
  // control moves with the sentence. A transform that no longer changes the text throws — a
  // control that tests the unchanged sentence proves nothing. Each control must fail for ITS
  // reason, so one rule cannot stand in for another it happens to share a sentence with.
  const about = passages[0][1];
  const regress = (label, from, to, reason) => {
    const t = about.replace(from, to);
    if (t === about) throw new Error(`About.tsx: the "${label}" control no longer applies (the sentence moved); re-aim it`);
    check(reason.test(why(t)), `CONTROL: ${label} fails the same check, for that reason`, why(t) || '(passed)');
  };
  check(why('not against sealed gold: no person, email or phone left readable; an organisation name') !== '', 'CONTROL: the About line as it shipped (2026-09-14) fails the same check');
  regress('"no identifier on the hand list left readable"', /no person on the hand list \(individual parties and counsel included\), no email and no phone left readable/, 'no identifier on the hand list left readable', /covers what was readable/);
  regress('"no party, counsel or other private person on the hand list …"', /no person on the hand list \(individual parties and counsel included\)/, 'no party, counsel or other private person on the hand list', /says no party/);
  regress('party companies left out of what was readable', /party companies' names among them \([^)]*\), /, '', /party companies/);
  regress('a law firm left out of what was readable', /a law firm's name, /, '', /law firm/);
  regress('the judges-not-counted scope deleted', /Judges and other public officials were not counted, and /, '', /not counted/);
  regress('a judges-only by-design disclosure', /a name it reads as a judge's[^·]*/, 'a name it reads as a judge\'s ', /omits counsel/);
  regress('counsel named, institutions not', /, and the name of a court or public body acting officially/, ' ', /omits court or public body/);
  regress('the whole judges clause deleted', /Judges and other public officials were not counted, and on papers[^·]*/, '', /not counted/);
  for (const to of ['no name on the hand list', 'no identity', 'no one named', 'no client or counterparty on the hand list'])
    regress(`"${to} … left readable"`, /no person on the hand list \(individual parties and counsel included\)/, to, /names more than people/);

  // The same over-claim reworded without a leading "no", and "every party was masked", set into
  // every surface that carries the claim, not only About: the README introduction, the README's
  // firm row and the published page are what a lawyer choosing the tool reads (D23R-1).
  const onEach = (label, from, to, reason) => {
    for (const [i, name] of [[0, 'About'], [1, 'README introduction'], [2, 'README firm row'], [4, 'benchmark.html']]) {
      const src = passages[i][1];
      const t = src.replace(from, to);
      if (t === src) throw new Error(`${name}: the "${label}" control no longer applies (the sentence moved); re-aim it`);
      check(reason.test(why(t)), `CONTROL: ${name}, ${label}, fails the same check for that reason`, why(t) || '(passed)');
    }
  };
  const WHO = /no person on (?:the hand|that) list\s+\(individual parties and counsel included\)/i;
  onEach('"None of the parties or counsel on the hand list, no email and no phone"', WHO, 'None of the parties or counsel on the hand list', /says no party/);
  onEach('"Not one party or counsel on the hand list, no email and no phone"', WHO, 'Not one party or counsel on the hand list', /says no party/);
  onEach('"None of the people, organisations or firms on the hand list"', WHO, 'None of the people, organisations or firms on the hand list', /covers what was readable/);
  onEach('", and every party was masked" after "left readable"', /(no\s+phone(?: was)?\s+left readable)/, '$1, and every party was masked', /every one was masked/);
  onEach('"all party names were masked" after "left readable"', /(no\s+phone(?: was)?\s+left readable)/, '$1; all party names were masked', /every one was masked/);
  // An address in the "no …" list (D2J-5), and the verbs, the tail clause and the place
  // quantifier (D2L-4), each on every surface.
  const PHONE = /(no\s+phone(?: was)?\s+left readable)/;
  onEach('"no email, no phone and no address was left readable"', /no email and no\s+phone(?: was)?\s+left readable/, 'no email, no phone and no address was left readable', /names more than people/);
  onEach('"no person, and no address, on the hand list"', WHO, 'no person, and no address, on the hand list', /names more than people/);
  onEach('"No party\'s name stayed readable"', PHONE, '$1. No party\'s name stayed readable', /says no party/);
  onEach('"No company name remained readable"', PHONE, '$1. No company name remained readable', /covers what was readable/);
  onEach('"No organisation was left unmasked"', PHONE, '$1. No organisation was left unmasked', /covers what was readable/);
  onEach('"No party name was kept in the clear"', PHONE, '$1. No party name was kept in the clear', /says no party/);
  onEach('", nor any party or company name" after "left readable"', PHONE, '$1, nor any party or company name', /covers what was readable/);
  onEach('"Party names were masked in every filing"', PHONE, '$1. Party names were masked in every filing', /every one was masked/);
  // One control per verb the universal reads without "left" (D23-2), each on every surface.
  onEach('"No party name was readable"', PHONE, '$1. No party name was readable', /says no party/);
  onEach('"No party name survived"', PHONE, '$1. No party name survived', /says no party/);
  onEach('"No party or company name reached the model"', PHONE, '$1. No party or company name reached the model', /covers what was readable/);
  onEach('"No party name leaked"', PHONE, '$1. No party name leaked', /says no party/);
  onEach('"No company name got through"', PHONE, '$1. No company name got through', /covers what was readable/);
  onEach('"Every party name was anonymised"', PHONE, '$1. Every party name was anonymised', /every one was masked/);
  onEach('"Every party name was pseudonymised"', PHONE, '$1. Every party name was pseudonymised', /every one was masked/);
  onEach('"Every company name was redacted"', PHONE, '$1. Every company name was redacted', /every one was masked/);
  // The verb-free reading of a clause that opens on its negation (D2J-8): each rewording below
  // passed with the verb lists alone.
  onEach('"No party name could be read"', PHONE, '$1. No party name could be read', /says no party/);
  onEach('"Not one client name was exposed"', PHONE, '$1. Not one client name was exposed', /names more than people/);
  onEach('"no company name made it to the model"', PHONE, '$1; no company name made it to the model', /covers what was readable/);
  onEach('"No party name escaped"', PHONE, '$1. No party name escaped', /says no party/);
  onEach('"Every party\'s name was blacked out"', PHONE, '$1. Every party\'s name was blacked out', /every one was masked/);
  // And the scope About states is not read as the claim: with "individual parties" read as
  // "parties", the live sentence itself would fail.
  check(why(about) === '' && PARTYLIKE.test(about.match(/no person on the hand list \([^)]*\)/)[0]), 'CONTROL: About\'s "no person on the hand list (individual parties and counsel included)" names parties as its scope and passes');
}

// ── 6. the model size ──
console.log('\n— 6. the model size on Setup —');
{
  const MAIN = read('app', 'src-tauri', 'src', 'main.rs');
  const bytes = Number(((MAIN.match(/MODEL_BYTES: u64 = ([\d_]+);/) || [])[1] || '').replace(/_/g, ''));
  const SETUP = read('app', 'frontend', 'src', 'screens', 'Setup.tsx');
  const says = (t) => {
    const b = Number(((t.match(/([\d,]{9,}) bytes/) || [])[1] || '').replace(/,/g, ''));
    const gb = Number((t.match(/([\d.]+) GB/) || [])[1]);
    return b === bytes && Math.abs(gb - bytes / 1e9) < 0.005;
  };
  check(bytes > 0 && says(SETUP), `Setup states the pinned file's size, ${bytes.toLocaleString('en-US')} bytes`);
  check(!says('Simpler Legal needs one model file (3.0 GB, pinned by SHA-256).'), 'CONTROL: "3.0 GB", as it shipped, fails the same check');
}

// ── 7. what History says persists ──
console.log('\n— 7. History names everything kept between sessions —');
{
  // Evidence: every localStorage key the app writes, and whether the engine sweeps the working
  // copies of a run cut short. A new key with no mapping here fails loudly, so a setting added
  // later cannot silently join "history doesn't persist".
  const LABEL = { 'simpler-legal.protected-terms': /protected-terms list/, 'simpler-legal.practice': /\bPractice\b/, 'simpler-legal.profile': /These documents/ };
  const keys = [];
  const SRC = join(ROOT, 'app', 'frontend', 'src');
  for (const f of readdirSync(SRC, { recursive: true })) {
    if (!/\.(ts|tsx)$/.test(f)) continue;
    const src = readFileSync(join(SRC, f), 'utf8');
    if (/sessionStorage|indexedDB/.test(src)) throw new Error(`${f}: a browser store this law does not read; extend it before trusting the History line`);
    if (!/localStorage\.setItem/.test(src)) continue;
    const k = [...src.matchAll(/const KEY = '([^']+)'/g)].map((m) => m[1]);
    if (k.length === 0) throw new Error(`${f}: writes localStorage without a const KEY this law can read`);
    keys.push(...k);
  }
  for (const k of keys) if (!LABEL[k]) throw new Error(`a localStorage key with no History label here: ${k}`);
  check(keys.length >= 3, 'the app writes the three keys History has to name', keys.join(', '));
  const ENGINE = read('app', 'src-tauri', 'src', 'engine.rs');
  const sweeps = /fn sweep_stale_once\(/.test(ENGINE) && /\n\s*sweep_stale_once\(/.test(ENGINE);
  // The engine's log files outlive the session too: log_file() creates and truncates, so each
  // stays on disk until the next start rewrites it (review 2026-09-23, D2-J3). Every name
  // attach_logs is given must be on the line, with where it lives and that it is rewritten.
  const logs = [...ENGINE.matchAll(/attach_logs\(&mut \w+, "([^"]+)"\)/g)].map((m) => `${m[1]}.log`);
  const truncates = /fn log_file\([\s\S]{0,400}\.truncate\(true\)/.test(ENGINE);
  const logDir = /fn log_dir\([\s\S]{0,300}"LOCALAPPDATA"[\s\S]{0,300}join\("Simpler AI"\)\.join\("logs"\)/.test(ENGINE);
  if (logs.length === 0 || !truncates || !logDir) throw new Error('engine.rs: attach_logs / log_file / log_dir moved; this law reads them');
  // Not only attach_logs: any file the crate names under the logs folder outlives the session.
  // exit_guard.rs added legal-app-exit.log beside the engine's two, and this law, reading
  // attach_logs alone, passed with it named nowhere (review wf_b6f6bdfd-0fa).
  const RS = join(ROOT, 'app', 'src-tauri', 'src');
  const named = new Set();
  for (const f of readdirSync(RS)) {
    if (!f.endsWith('.rs')) continue;
    for (const m of readFileSync(join(RS, f), 'utf8').matchAll(/\.join\("([\w.-]+\.log)"\)/g)) named.add(m[1]);
  }
  const extra = [...named].filter((l) => !logs.includes(l));
  check(extra.includes('legal-app-exit.log'), 'the crate-wide log search finds the exit log, which attach_logs does not name', [...named].join(', '));
  // The exit log is written only when the app had to end itself: a line per ordinary close
  // would be a record of when the app was used, and History would have to say so.
  const GUARD = read('app', 'src-tauri', 'src', 'exit_guard.rs');
  const requested = (GUARD.match(/pub fn requested\(\) \{[\s\S]*?\n\}/) || [''])[0];
  if (!requested) throw new Error('exit_guard.rs: requested() moved; this law reads it');
  check(!/\bnote\(/.test(requested), 'an ordinary close writes nothing to legal-app-exit.log (requested() calls no note)');
  const honest = (t) => t.length > 0 && keys.every((k) => LABEL[k].test(t))
    && !/the only thing kept between them/i.test(t)
    && (!sweeps || (/cut short|closing the app/i.test(t) && /until the engine next starts/i.test(t)))
    && logs.every((l) => t.includes(l)) && /%LOCALAPPDATA%\\Simpler AI\\logs/.test(t) && /rewritten each time/i.test(t)
    && extra.every((l) => t.includes(l)) && (!extra.includes('legal-app-exit.log') || /has to end itself/i.test(t));
  const HIST = read('app', 'frontend', 'src', 'screens', 'History.tsx');
  const sub = (HIST.match(/Every redaction stays on this machine[^<]*/) || [''])[0];
  check(honest(sub), `History names the protected terms, Practice and These documents, the logs (${[...logs, ...extra].join(', ')}) and the run cut short`, sub);
  const OLD = "Every redaction stays on this machine — files, decisions, receipts. This session's activity is below; history doesn't persist between sessions, and the only thing kept between them is your protected-terms list. When the frozen local engine runs a document it writes working copies to a scratch folder and deletes them at the end of the run; the in-app core writes nothing to disk.";
  check(!honest(OLD), 'CONTROL: the History line as it shipped fails the same check');
  for (const [label, from] of [
    ['Practice left out', /,? Practice and These documents/],
    ['the run cut short left out', /; a run cut short[^;.]*/],
    ['the engine logs left out', /, and the local engine's two logs of its last start[^.]*/],
    ['the exit log left out', / If the app ever has to end itself[^.]*\.log[^.]*\./],
  ]) {
    const t = sub.replace(from, '');
    if (t === sub) throw new Error(`History.tsx: the "${label}" control no longer applies (the sentence moved); re-aim it`);
    check(!honest(t), `CONTROL: the current History line with ${label} fails the same check`);
  }
}

// ── 8. the firm doctrine's note ──
console.log('\n— 8. the firm doctrine\'s Settings note says what the citation rail releases —');
{
  // Evidence: the rail keeps citations readable, party names and all, and its guard compares
  // words with a stop list and a three-letter floor (lib-legal/legal-rails.mjs, frozen, read
  // only). "Company and brand names are never released" on the Settings card was false twice
  // over: every kept citation carries company names, and a client named only in stop-list words
  // has nothing for the guard to compare, so its own earlier case was released (review
  // 2026-09-24, D2L-5).
  const RAIL = read('lib-legal', 'legal-rails.mjs');
  const stop = new Set(((RAIL.match(/const CITE_TOKEN_STOP = new Set\(\[([^\]]*)\]/) || [])[1] || '').match(/'[^']+'/g)?.map((w) => w.slice(1, -1)) ?? []);
  const floor = Number((RAIL.match(/const identityToks = [^\n]*t\.length >= (\d+)/) || [])[1]);
  if (!stop.size || !floor || !/export function citationKeepSpans/.test(RAIL)) throw new Error('legal-rails.mjs: CITE_TOKEN_STOP / identityToks / citationKeepSpans moved; this law reads them');
  const PROFILE = read('app', 'frontend', 'src', 'lib', 'profile.ts');
  const firmNote = ((PROFILE.match(/id: 'firm',[\s\S]*?note: '((?:[^'\\]|\\.)*)'/) || [])[1] || '').replace(/\\u2019/g, '’').replace(/\\u2014/g, '—');
  const WORDS = ['one', 'two', 'three', 'four', 'five'];
  const honest = (t) => {
    if (!t) return 'firm note not found';
    if (/never released/i.test(t) && !/never released outside/i.test(t)) return '"never released" with no citation exception';
    if (!/not released outside a reported case citation/i.test(t)) return 'does not say company names are released inside a kept citation';
    if (!/names of their parties included|party names included|company names in them included/i.test(t)) return 'does not say a kept citation keeps its parties\' names';
    const named = ((t.match(/generic words such as ([^,]*(?:, [^,]*)*?) (?:or|and) (\w+),/) || []).slice(1).join(', ')).split(/,\s*/).filter(Boolean).map((w) => w.toLowerCase());
    if (named.length === 0) return 'names no generic word the guard skips';
    const notStop = named.filter((w) => !stop.has(w));
    if (notStop.length) return `names as uncompared a word the guard compares: ${notStop.join(', ')}`;
    if (!new RegExp(`words under ${WORDS[floor - 1] ?? floor} letters`).test(t)) return `does not state the guard's ${floor}-letter floor`;
    if (!/own earlier case/i.test(t)) return 'does not say the client\'s own earlier case can be left readable';
    return '';
  };
  check(honest(firmNote) === '', 'the firm note says company names are released inside kept citations, and states the guard\'s stop words and floor as the rail has them', honest(firmNote));
  check(honest('company and brand names are never released — on a firm’s paper the party organisation IS the matter — and reported case citations are kept readable, because they are usually why the file is going to a model at all') !== '',
    'CONTROL: the note as it shipped before 2026-09-24 fails the same check');
  const reword = (label, from, to, reason) => {
    const t = firmNote.replace(from, to);
    if (t === firmNote) throw new Error(`profile.ts: the "${label}" control no longer applies (the note moved); re-aim it`);
    check(reason.test(honest(t)), `CONTROL: ${label} fails the same check, for that reason`, honest(t) || '(passed)');
  };
  reword('a word the guard compares named as generic', /such as Global/, 'such as Kestrel', /guard compares/);
  reword('the floor stated as four letters', /under three letters/, 'under four letters', /floor/);
  reword('the own-case consequence cut', /, so a client whose name[^]*$/, '', /own earlier case/);
}

// ── 9. the run-together floor is stated with the plain-word rule ──
console.log('\n— 9. the documents state the run-together floor with the rule that text a reader sees is never read inside a plain word —');
{
  // Evidence: docxWrite.ts reads a name inside a longer word from RUN_FLOOR letters and digits in
  // the file's code, but in text a reader sees textHolds counts a find only where each of its
  // ends is a break (or, from RUN_FLOOR, inside a token that is not a word of prose), so a name
  // run into a plain word of letters ships: "kestrelholdings" for a row "Kestrel", "Margaret
  // Tanand" for "Margaret Tan" (owner ruling 8, 2026-09-24). "From six letters and digits,
  // anywhere inside a longer word" said it was caught (review 2026-09-24, D2J-3), and the
  // short-word exception that replaced it (gluedHolds, "three letters or more past it") left the
  // code with ruling 8, so a document still stating it describes a rule that no longer runs. A
  // statement is found by the RUN_FLOOR token or, without it, by "inside a (longer) word" within
  // 120 characters of the floor written in words: the first version found the token only, and a
  // sentence that gave the floor in words alone passed unread (review 2026-09-24, D23-3).
  const W = read('app', 'frontend', 'src', 'lib', 'extract', 'docxWrite.ts');
  const floor = Number((W.match(/export const RUN_FLOOR = (\d+);/) || [])[1]);
  const plain = W.includes('function textHolds(') && W.includes('if (!k.cuts.has(at) && !(loose && k.np[at])) return false;');
  if (!floor || !plain) throw new Error('docxWrite.ts: RUN_FLOOR or textHolds moved; this law reads them');
  const N = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  // Written with "within", "into" or "run into", or with the floor as a digit or counted in
  // characters, the same claim passed (review 2026-09-24, D2J-9: "A name of 6 letters or more is
  // found anywhere inside a longer word", "…found within any word it is run into", "…six
  // characters or more is caught inside any longer word").
  const INSIDE = /(?:anywhere )?(?:inside|within|into) (?:a|any|the) (?:longer |plain |ordinary )?word|run (?:in)?to (?:a|any|the) (?:longer )?word/;
  const anchors = (t) => {
    const at = new Set([...t.matchAll(/RUN_FLOOR/g)].map((m) => m.index).filter((i) => /longer word/.test(t.slice(Math.max(0, i - 160), i + 40))));
    for (const m of t.matchAll(new RegExp(`\\b(?:${N[floor]}|${floor}) (?:letters|characters)`, 'g'))) if (INSIDE.test(t.slice(Math.max(0, m.index - 120), m.index + 120))) at.add(m.index);
    return [...at];
  };
  const states = (t) => {
    const ats = anchors(t);
    if (ats.length === 0) return 'no statement of the floor inside a longer word found';
    for (const i of ats) {
      const around = t.slice(Math.max(0, i - 160), i + 300).replace(/\s+/g, ' ');
      if (!/never (?:read|found|masked) inside a (?:plain )?word of letters/.test(around) || /letters or more (?:beyond|past) it/.test(around))
        return `"…${t.slice(Math.max(0, i - 60), i + 40).replace(/\s+/g, ' ')}…" gives the floor without the rule that text a reader sees is never read inside a plain word of letters`;
    }
    return '';
  };
  const DOCS = [['README.md', read('README.md')], ['BENCHMARK.md', read('BENCHMARK.md')], ['REDACTION_AUDIT.md', read('REDACTION_AUDIT.md')]];
  for (const [name, t] of DOCS) check(states(t) === '', `${name} states the floor of ${floor} with the plain-word rule textHolds keeps`, states(t));
  const OLD = 'word break, and, from six letters and digits (`RUN_FLOOR`), anywhere inside a longer word. A';
  check(states(OLD) !== '', 'CONTROL: the README sentence as it stood before 2026-09-24 fails the same check');
  const GLUED = 'word break, and, from six letters and digits (`RUN_FLOOR`), inside a longer word, save that in text a reader sees a first or last word of it shorter than six letters is not read where the longer word runs on three letters or more past it (`gluedHolds`), so `Margaret Tanand` ships whole for a row `Margaret Tan`.';
  check(states(GLUED) !== '', 'CONTROL: the README sentence under the short-word exception (before ruling 8) fails the same check');
  const WORDS = 'A name is found run together from six letters and digits, anywhere inside a longer word.';
  check(states(WORDS) !== '', 'CONTROL: the floor given in words, with no RUN_FLOOR token, is found and fails the same check', states(WORDS) || '(passed)');
  for (const s of ['A name of 6 letters or more is found anywhere inside a longer word.', 'From six letters and digits a name is found within any word it is run into, so kestrelholdings is masked.', 'A name of six characters or more is caught inside any longer word.'])
    check(states(s) !== '', `CONTROL: "${s}" is found and fails the same check (D2J-9)`, states(s) || '(passed)');
  for (const [name, t] of DOCS) {
    const cut = t.replace(/,? save that in\s+text a reader sees[^]*?plain\s+word\s+of\s+letters/, '');
    if (cut === t) throw new Error(`${name}: the plain-word clause moved; re-aim the control`);
    check(states(cut) !== '', `CONTROL: ${name} with the plain-word clause cut fails the same check`);
  }
}

// The documents of record laws 10 to 12 read, and the sentences of a document: whitespace run
// together, cut where a sentence ends ("`.txt`" has no space after its dot, so it is not an end).
const RECORD = () => [['README.md', read('README.md')], ['BENCHMARK.md', read('BENCHMARK.md')], ['REDACTION_AUDIT.md', read('REDACTION_AUDIT.md')]];
const sentences = (t) => t.replace(/\s+/g, ' ').split(/(?<=[.;])\s+(?=[A-Z`(*])/);

// ── 10. the two exports are not said to mask alike ──
console.log('\n— 10. no document says the .txt and the .docx mask alike, and each says they are not claimed to —');
{
  // Evidence: the .txt and the copied text are the body alone, masked by exportPlan (engine.ts);
  // the .docx is every part, masked run by run by docxWrite.ts and re-walked by readOutput. Two
  // readers of two different texts: until W7F-1 (docx-parts law 77) a space before a tracked
  // deletion dropped out of the .txt's text only, and the .txt shipped "Margaret Tan" that the
  // .docx masked. Owner ruling 13 (2026-09-24): nothing says the two mask identically. The
  // positive half is the disclaimer each document of record carries; a sameness claim is read
  // in any sentence that names a text export and the .docx, unless the sentence negates it.
  const ENGINE = read('app', 'frontend', 'src', 'lib', 'engine.ts');
  const WRITER = read('app', 'frontend', 'src', 'lib', 'extract', 'docxWrite.ts');
  if (!/export function exportPlan\(/.test(ENGINE) || !/export function readOutput\(|function readOutput\(/.test(WRITER)) throw new Error('engine.ts exportPlan or docxWrite.ts readOutput moved; this law names them as the two readers');
  // SAME reads the plain rewordings too ("exactly as", "the same masks", "every name the .docx
  // masks, the .txt masks too"), and NEG excuses a sentence only for saying how the two differ,
  // not for any "differ" in it: "mask identically, however their formats differ" passed (D2J-5).
  const SAME = /\b(?:identical(?:ly)?|alike|equally|exactly as|the same (?:way|names|masks?|masking|redaction|result))\b|\bmatch(?:es)? (?:each other|the `?\.(?:txt|docx))|\bevery (?:name|row|term|identifier)\b.*?\bmasks?\b.*?\btoo\b/i;
  const BOTH = (s) => /\.txt\b|text exports?|copied text|clipboard/i.test(s) && /\.docx\b/.test(s);
  const NEG = /\b(?:not|never|no longer) (?:claimed to |said to |stated to )?(?:mask|redact|read)|\bnot claimed\b|\bdiffer(?:s|ed|ently)? (?:in|on) (?:what|which|how|where)\b/i;
  const claims = (t) => sentences(t).filter((s) => BOTH(s) && SAME.test(s) && /\bmask|\bredact/i.test(s) && !NEG.test(s));
  const DISCLAIM = /not claimed to mask alike \(owner ruling 13\)/;
  const judge = (t) => {
    const c = claims(t);
    if (c.length) return `says the two exports mask alike: "${c[0].slice(0, 160)}"`;
    if (!DISCLAIM.test(t.replace(/\s+/g, ' '))) return 'does not state that the .txt and the .docx are not claimed to mask alike (ruling 13)';
    return '';
  };
  for (const [name, t] of RECORD()) check(judge(t) === '', `${name} makes no claim that the .txt and the .docx mask alike, and says so`, judge(t));
  for (const [name, t] of [['About.tsx', read('app', 'frontend', 'src', 'screens', 'About.tsx')], ['benchmark.html', read('app', 'frontend', 'public', 'benchmark.html')]])
    check(claims(t).length === 0, `${name} makes no claim that the .txt and the .docx mask alike`, claims(t)[0]?.slice(0, 160));
  const [, README] = RECORD()[0];
  const CLAIM = [
    'The `.txt` and the `.docx` mask identically: a name masked in one is masked in the other.',
    'The copied text is masked the same way as the saved `.docx`.',
    'The text exports and the `.docx` redact alike, from one table.',
    'The `.txt` carries the same masks as the `.docx`.',
    'Every name the `.docx` masks, the `.txt` masks too.',
    'The `.txt` is masked exactly as the `.docx` is.',
    'The `.txt` and the `.docx` mask identically, however their formats differ.',
  ];
  for (const s of CLAIM) check(judge(`${README}\n${s}\n`) !== '', `CONTROL: "${s}" added to the README fails the same check`, judge(`${README}\n${s}\n`) || '(passed)');
  const DIFFER = 'The `.txt` and the `.docx` differ in what they mask.';
  check(judge(`${README}\n${DIFFER}\n`) === '', `a sentence saying how the two differ ("${DIFFER}") is not read as a sameness claim`, judge(`${README}\n${DIFFER}\n`));
  const cut = README.replace(/The `\.txt` and the `\.docx` are not claimed to mask alike \(owner ruling 13\)\./, '');
  if (cut === README) throw new Error('README.md: the ruling-13 sentence moved; re-aim the control');
  check(judge(cut) !== '', 'CONTROL: the README with its ruling-13 sentence cut fails the same check', judge(cut) || '(passed)');
}

// ── 11. the Proofpoint escape in the text exports is stated as the code has it ──
console.log('\n— 11. the documents state the text exports\' hold on a Proofpoint escape as engine.ts has it —');
{
  // Evidence: exportPlan asks the writer's pctHidden of the readable text where docxWrite's
  // hasEscape finds an escape, which reads a Proofpoint v2 "-E9" and v3 "*E9" as well as "%E9".
  // Until 2026-09-24 it asked only where the text held a "%", and the .txt and the copied text
  // shipped "Ren-E9-20Tan" and "Ren*E9*20Tan" for a row "René Tan" under a verified export while
  // the .docx held; README, BENCHMARK and the audit listed that as open. Probed closed on
  // 2026-09-24 (exportPlan: blocked on both links). A document must state it the way the code
  // stands: closed, with hasEscape named, while engine.ts gates on hasEscape; open while it
  // does not. Both directions are run, so a document that goes stale either way fails.
  const ENGINE = read('app', 'frontend', 'src', 'lib', 'engine.ts');
  const W = read('app', 'frontend', 'src', 'lib', 'extract', 'docxWrite.ts');
  if (!/export function hasEscape\(/.test(W) || !/Proofpoint/.test(W)) throw new Error('docxWrite.ts: hasEscape or its Proofpoint reading moved; this law reads them');
  const closedInCode = /if \(!rm\.divergence && hasEscape\(readable\)\)/.test(ENGINE);
  const OPEN = /(?:the `\.txt` and the (?:copied text|clipboard copy) carry it|but ships in the `\.txt`|asks? (?:`pctHidden` )?(?:after such an escape )?only\s+where (?:a `%` is written|the readable text holds a `%`))/;
  const CLOSED = /hasEscape/;
  // a sentence on the escape, and the two after it, where the closure is stated
  const judge = (t, closed) => {
    const all = sentences(t);
    const at = all.map((s, i) => (/Proofpoint/.test(s) && /E9/.test(s) ? i : -1)).filter((i) => i >= 0);
    if (!at.length) return 'no sentence on a Proofpoint link\'s "E9" escape';
    const open = at.map((i) => all[i]).find((s) => OPEN.test(s));
    const named = at.some((i) => { const w = all.slice(i, i + 3).join(' '); return CLOSED.test(w) && /\.txt/.test(w); });
    if (closed && open) return `states the text exports' gap as open while engine.ts asks hasEscape: "${open.slice(0, 160)}"`;
    if (closed && !named) return 'does not state that the text exports hold on it (hasEscape)';
    if (!closed && !open) return 'engine.ts no longer asks hasEscape, and the document does not state the gap in the text exports';
    return '';
  };
  for (const [name, t] of RECORD()) check(judge(t, closedInCode) === '', `${name} states the text exports' hold on a Proofpoint escape as engine.ts has it (${closedInCode ? 'closed' : 'open'})`, judge(t, closedInCode));
  const OLD = 'Open on 2026-09-24: - a link rewritten by Proofpoint\'s gateway that writes, where a name stands, a byte that is no character — v2 writes it `-E9` (`…_Ren-E9-20Tan_…`), v3 `*E9` (`…/Ren*E9*20Tan/…`), for a row `René Tan`: the `.docx` writer holds the file on either, but the `.txt` and the copied text carry it under an export that reports itself verified, because `engine.ts` asks after such an escape only where a `%` is written; the same link written with `%E9` blocks the text exports too;';
  check(judge(OLD, true) !== '', 'CONTROL: the README bullet as it stood before this round fails the same check while engine.ts asks hasEscape', judge(OLD, true) || '(passed)');
  for (const [name, t] of RECORD()) check(judge(t, !closedInCode) !== '', `CONTROL: ${name} fails the same check against the code the other way (${closedInCode ? 'open' : 'closed'})`, judge(t, !closedInCode) || '(passed)');
}

// ── 12. the token list names every mark the writer joins a token on ──
console.log('\n— 12. the documents list every mark that makes a token no word of prose, as docxWrite.ts has them —');
{
  // Evidence: textHolds reads a name inside a token from RUN_FLOOR where the token has one of
  // JOINER's marks inside it or one of HANDLE's before it (docxWrite.ts). Owner ruling 18 added
  // "#" to both; the documents listed "`.`, `/`, `\`, `:`, `@` or `_`" and "one an `@` starts",
  // and "#kestrelholdings" was still in the open list after the code masked it. Every statement
  // of that list in the documents of record must name each mark, as a code span, from the
  // code's own sets.
  const W = read('app', 'frontend', 'src', 'lib', 'extract', 'docxWrite.ts');
  const set = (name) => {
    const m = W.match(new RegExp(`const ${name} = /\\^?\\[([^\\]]+)\\]\\$?/;`));
    if (!m) throw new Error(`docxWrite.ts: ${name} moved; this law reads it`);
    return [...m[1].replace(/\\\\/g, '\u0000').replace(/\\/g, '').replace(/\u0000/g, '\\')];
  };
  const JOIN = set('JOINER'), LEAD = set('HANDLE');
  if (!JOIN.includes('@') || !LEAD.includes('@')) throw new Error('docxWrite.ts: JOINER or HANDLE read wrong; re-aim this law');
  const lists = (t) => [...t.replace(/\s+/g, ' ').matchAll(/inside a token (?:that is not a word of prose: one )?with a digit, ([^]*?) in it,? or (?:one )?(?:an? )?([^]*?) (?:starts|before it)/g)];
  const judge = (t) => {
    const ls = lists(t);
    if (!ls.length) return 'no statement of the token list found';
    for (const m of ls) {
      const inner = new Set([...m[1].matchAll(/`([^`])`/g)].map((x) => x[1]));
      const lead = new Set([...m[2].matchAll(/`([^`])`/g)].map((x) => x[1]));
      const miss = JOIN.filter((c) => !inner.has(c)), missL = LEAD.filter((c) => !lead.has(c));
      if (miss.length || missL.length) return `"…${m[0].slice(0, 140)}…" leaves out ${[...miss.map((c) => `${c} inside`), ...missL.map((c) => `${c} before`)].join(', ')}`;
    }
    return '';
  };
  for (const [name, t] of RECORD()) check(judge(t) === '', `${name} names ${JOIN.join(' ')} inside a token and ${LEAD.join(' ')} before one, as docxWrite.ts has them`, judge(t));
  const OLD = 'and, from six, inside a token that is not a word of prose: one with a digit, `.`, `/`, `\\`, `:`, `@` or `_` in it, or one an `@` starts (`www.kestrelcorp.com`, `porter2024`, `@kestrelholdings`).';
  check(judge(OLD) !== '', 'CONTROL: the README list as it stood before ruling 18 fails the same check', judge(OLD) || '(passed)');
  const [, AUDIT] = RECORD()[2];
  const cut = AUDIT.replace('`:`, `@`, `#` or\n`_` in it or an `@` or a `#` before it', '`:`, `@` or\n`_` in it or an `@` or a `#` before it');
  if (cut === AUDIT) throw new Error('REDACTION_AUDIT.md: the token list moved; re-aim the control');
  check(judge(cut) !== '', 'CONTROL: the audit\'s list with "#" cut from the marks inside a token fails the same check', judge(cut) || '(passed)');
}

// The units laws 13 to 16 read: each list item and each sentence of a document, whitespace run
// together, cut only where a sentence ends on a full stop (sentences() also cuts at "; `",
// which splits "ruling 19; `DIGIT_SEP`" from the clause it closes).
const units = (t) => t.split(/\n\s*-\s+|\n\s*\n/).flatMap((p) => p.replace(/\s+/g, ' ').trim().split(/(?<=\.)\s+(?=[A-Z])/)).filter(Boolean);

// ── 13. the digit groupings are stated as DIGIT_SEP reads them ──
console.log('\n— 13. the documents state the marks a row of digits is read across as DIGIT_SEP reads them —');
{
  // Evidence: refFind finds a row of digits across one mark that DIGIT_SEP matches (docxWrite.ts;
  // docx-parts laws 70 and 81), and the engine's plan asks the same refFind. Probed on 2026-09-24
  // through the .txt and the .docx: "3192‣6819", "3192◦6819", "3192⁃6819", "3192⁄6819",
  // "3192∕6819", "3192\n6819" and a w:br between the groups each shipped under a verified plan
  // and a gate of 0 leaks, while README said "a slash … or a bullet" and "a space of any kind"
  // were read and named no line break among what is not (D2J-4, D2L7-2, D2L7-4). A found clause
  // (from "across" or "grouped by" to `DIGIT_SEP`) may name a class only where the code reads
  // every member of it this law samples, and each mark it writes as code; a not-found clause
  // ("grouped by" / "Grouped any other way" … "not found" or "does not read") may name no mark
  // the code reads, and names a line break while the code does not read one. Read both ways.
  const W = read('app', 'frontend', 'src', 'lib', 'extract', 'docxWrite.ts');
  const m = W.match(/export const DIGIT_SEP = \/(.+)\/([a-z]*);/);
  if (!m) throw new Error('docxWrite.ts: DIGIT_SEP moved; this law reads it');
  const SEP = new RegExp(m[1], m[2]);
  if (!SEP.test(' - ') || !SEP.test('/') || !SEP.test('•')) throw new Error('docxWrite.ts: DIGIT_SEP read wrong; re-aim this law');
  const CLASS = [
    ['a bullet', /\ba bullet\b(?!\s*(?:`|other))/, ['•', '∙', '‣', '◦', '⁃']],
    ['a slash', /\ba slash\b(?!\s*`)(?! with a space)/, ['/', '⁄', '∕']],
    ['a space of any kind', /\ba space of any (?:kind|width)\b|\bany space\b/, [' ', ' ', ' ', '᠎']],
    ['a line break', /\ba line break\b|\ba new ?line\b/, ['\n']],
  ];
  // the marks a clause writes as code: one character, or a mark with a space either side; a
  // span with a digit in it is an example number, and "other than `•` and `∙`" excepts them
  const marks = (w) => [...w.replace(/other than (?:`[^`]+`(?:,? (?:and|or) )?)+/g, '').matchAll(/`([^`]+)`/g)].map((x) => x[1]).filter((x) => !/\d/.test(x) && ([...x].length === 1 || /^ \S $/.test(x)));
  const judge = (t, sep) => {
    const out = [];
    let pos = 0, neg = 0;
    for (const s of units(t)) {
      const at = s.indexOf('`DIGIT_SEP`');
      if (at >= 0) {
        const head = s.slice(0, at);
        const a = [...head.matchAll(/\bacross\b|\bgrouped by\b/g)].at(-1);
        if (a && !/does not read|not found|other way|not read/.test(head.slice(a.index) + s.slice(at, at + 40))) {
          pos++;
          const clause = head.slice(a.index).replace(/"[^"]*"/g, '');
          for (const [word, re, members] of CLASS) if (re.test(clause) && !members.every((c) => sep.test(c))) out.push(`names "${word}" as read, where DIGIT_SEP does not read ${members.filter((c) => !sep.test(c)).map((c) => JSON.stringify(c)).join(' ')}: "…${clause.slice(0, 110)}…"`);
          for (const c of marks(clause)) if (!sep.test(c)) out.push(`names ${JSON.stringify(c)} as read, which DIGIT_SEP does not read`);
        }
      }
      const g = s.match(/\b[Gg]rouped (?:by|any other way)\b/);
      if (g && /not found|does not read|not read/.test(s.slice(g.index))) {
        neg++;
        const w = s.slice(g.index);
        for (const c of marks(w)) if (sep.test(c)) out.push(`names ${JSON.stringify(c)} as not read, which DIGIT_SEP reads`);
        if (!sep.test('\n') && !/\bline break\b/.test(w)) out.push(`does not name a line break among the groupings not read: "${w.slice(0, 110)}…"`);
        if (sep.test('\n') && /\bline break\b/.test(w)) out.push('names a line break as not read, which DIGIT_SEP reads');
      }
    }
    if (!pos) out.push('no statement of the marks a row of digits is read across (a clause ending `DIGIT_SEP`)');
    if (!neg) out.push('no statement of the groupings it is not found across');
    return out.join(' | ');
  };
  for (const [name, t] of RECORD()) check(judge(t, SEP) === '', `${name} names as read only marks DIGIT_SEP reads, and a line break among those it does not`, judge(t, SEP));
  const OLD = 'A row of six digits or more is found wherever its digits stand together, inside a longer number, an IBAN or a reference, and in text a reader sees across one mark that groups them: a space of any kind or a tab, a dot, a slash, a hyphen or dash of any kind, a minus sign, a middle dot or a bullet, ` - `, or a closing bracket and a space (ruling 9, widened by ruling 19; `DIGIT_SEP`, laws 70 and 81). Grouped by a comma, an underscore, a colon, two spaces, or an en dash, an em dash or a slash with a space either side (`3192 – 6819`), it is not found, in the `.txt` as probed on 2026-09-24, nor by the writer, which reads the same `DIGIT_SEP`.';
  const bad = judge(OLD, SEP);
  check(/"a bullet"/.test(bad) && /"a slash"/.test(bad) && /"a space of any kind"/.test(bad) && /line break/.test(bad), 'CONTROL: the README sentences as they stood before this pass fail on "a bullet", "a slash", "a space of any kind" and the missing line break', bad || '(passed)');
  const OLD_AUDIT = 'Closed: - a row of digits grouped by an em dash, a minus sign, a tab, a middle dot, a bullet, a space of any kind, ` - ` or a closing bracket and a space (ruling 19, `DIGIT_SEP`; laws 70 and 81): masked in text a reader sees. Grouped by a line break it is not found.';
  check(judge(OLD_AUDIT, SEP) !== '', 'CONTROL: the audit\'s closed item as it stood before this pass fails the same check', judge(OLD_AUDIT, SEP) || '(passed)');
  const WRONG = 'It is found across a dot (`DIGIT_SEP`). Grouped any other way (a line break, or the bullet `•`), it is not found.';
  check(/as not read/.test(judge(WRONG, SEP)), 'CONTROL: a not-found list naming "•", which DIGIT_SEP reads, fails the same check', judge(WRONG, SEP) || '(passed)');
  const wide = m[1].replace('[\\t', '[\\n\\t‣');
  if (wide === m[1]) throw new Error('docxWrite.ts: DIGIT_SEP\'s class moved; re-aim the control');
  const SEP2 = new RegExp(wide, m[2]);
  const [, README] = RECORD()[0];
  check(judge(README, SEP2) !== '', 'CONTROL: README fails the same check against a DIGIT_SEP that reads a line break and "‣"', judge(README, SEP2) || '(passed)');
}

// ── 14. the wrapped-link closure carries its condition and its remainder ──
console.log('\n— 14. the documents state the wrapped Proofpoint link as law 79 reads it —');
{
  // Evidence: the writer reads a link across a line break only where nothing is written at the
  // start of the next line (docxWrite.ts: BR, and LINK_BROKEN's "\r?\n(?=[^\s<>"])"; a ">" or a
  // space after the break ends the link). Probed on 2026-09-24 through the .txt (LF, CRLF) and
  // the .docx (w:br): with "> " on the next line the name shipped from 72 of 100 places in a v2
  // link and 70 of 77 in a v3 one, from both, under a verified plan and a gate of 0 leaks
  // (D2J-1). Law 79's own comment gives the LF count before it landed and the 9 places a link
  // inside the name's letters it leaves (docx-parts.mjs); the documents said "47 of 100 … now
  // masked", which counts those 9 (D2L7-1). A statement that a wrapped link is read must carry
  // the bare-break condition while the code has it, each document must list the quoted reply as
  // shipping, and a before-count must come with what it now masks (the count less the 9).
  const W = read('app', 'frontend', 'src', 'lib', 'extract', 'docxWrite.ts');
  const DP = read('app', 'frontend', 'test', 'docx-parts.mjs');
  const hasBr = W.includes("const BR = '(?:\\\\r?\\\\n)?';"), hasLink = W.includes('\\r?\\n(?=[^\\s<>"])');
  if (!hasBr || !hasLink) throw new Error('docxWrite.ts: BR or LINK_BROKEN\'s break moved; this law reads them');
  const c = DP.replace(/\s*\n\s*\/\/\s*/g, ' ').match(/of (\d+) of 100 places in a v2 link and (\d+) of 77 in a v3 one/);
  const rem = DP.replace(/\s*\n\s*\/\/\s*/g, ' ').match(/stated remainder, (\d+) places a link/);
  if (!c || !rem) throw new Error('docx-parts.mjs: law 79\'s counts moved; this law reads them');
  const [v2, v3, r] = [+c[1], +c[2], +rem[1]];
  const judge = (t, bareOnly) => {
    const us = units(t), out = [];
    const closure = us.filter((s) => /Proofpoint link/.test(s) && /wrapped over a/.test(s));
    if (!closure.length) return 'no statement that a wrapped Proofpoint link is read';
    if (bareOnly) for (const s of closure) if (!/bare line break|nothing written at the start of the next line/.test(s)) out.push(`states the wrapped link read with no condition on the next line: "…${s.slice(s.indexOf('wrapped over a') - 40, s.indexOf('wrapped over a') + 90)}…"`);
    const quoted = us.filter((s) => /quoted reply/.test(s) && /\bship/.test(s));
    if (bareOnly && !quoted.length) out.push('does not state that a link wrapped in a quoted reply ships');
    if (!bareOnly && quoted.length) out.push('states a link wrapped in a quoted reply as shipping, which the code reads');
    for (const s of us.filter((u) => u.includes(`${v2} of 100`))) if (!s.includes(`${v2 - r} and ${v3 - r}`)) out.push(`gives ${v2} of 100 / ${v3} of 77 without the ${v2 - r} and ${v3 - r} now masked (${r} a link still ship)`);
    return out.join(' | ');
  };
  for (const [name, t] of RECORD()) check(judge(t, true) === '', `${name} states the wrapped-link closure on a bare break, the quoted reply as shipping, and ${v2 - r} and ${v3 - r} of ${v2} and ${v3} as masked`, judge(t, true));
  const [, README] = RECORD()[0];
  // any run of whitespace between its words, so a reflow of the paragraph does not move it
  const NOW = new RegExp("a Proofpoint link a mail program wrapped over a line, in LF or CRLF, with nothing written at the start of the next line, inside its address, its path or an escape, and a link on Proofpoint's `urldefense.us` host (masked; before, with an LF, the name in such a link shipped from 47 of 100 places a break can stand in a v2 link and 34 of 77 in a v3 one; 38 and 25 of those are now masked, and the 9 in each that fall inside the name's own letters still ship, open below; law 79)".replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
  const old = README.replace(NOW, 'a Proofpoint link a mail program wrapped over a line, in LF or CRLF, inside its address, its path or an escape, and a link on Proofpoint\'s `urldefense.us` host (masked; before, the name in such a link shipped from 47 of 100 places a break can stand in a v2 link and 34 of 77 in a v3 one, law 79)');
  if (old === README) throw new Error('README.md: the wrapped-link closure moved; re-aim the control');
  const bo = judge(old, true);
  check(/no condition/.test(bo) && /now masked/.test(bo), 'CONTROL: the README closure as it stood before this pass fails on the missing condition and the uncounted 9', bo || '(passed)');
  const OLD_B = 'Closed: a Proofpoint link wrapped over a line in LF or CRLF, and one on `urldefense.us`. Open: a Proofpoint link wrapped in a quoted reply ships.';
  check(judge(OLD_B, true) !== '', 'CONTROL: the BENCHMARK closure as it stood before this pass fails the same check', judge(OLD_B, true) || '(passed)');
  const cut = README.replace(/- a Proofpoint link wrapped in a quoted reply[^]*?does not read the `\.docx` body\);\n/, '');
  if (cut === README) throw new Error('README.md: the quoted-reply item moved; re-aim the control');
  check(judge(cut, true) !== '', 'CONTROL: the README with its quoted-reply item cut fails the same check', judge(cut, true) || '(passed)');
  for (const [name, t] of RECORD()) check(judge(t, false) !== '', `CONTROL: ${name} fails the same check against a reader that takes a quoted next line`, judge(t, false) || '(passed)');
}

// ── 15. the intake no-regression claim counts the rules that record it ──
console.log('\n— 15. README counts the intake rules that record no new hold on an ordinary link as detect.ts does —');
{
  // Evidence: of that day's five intake changes, detect.ts records at three (the glued prefix,
  // the carried redirect, the hash route) that no print of an ordinary link under any gateway was
  // newly held; the proportional-font rule records only that monospace prints and attachments
  // keep their reasons, the key=value rule only that encoded bodies are held as before. README
  // said "each of which records" it (D2J-6, D2L7-6). The count README gives must be the code's.
  const D = read('app', 'frontend', 'src', 'lib', 'extract', 'detect.ts');
  const n = (D.replace(/\s*\n\s*\/\/\s*/g, ' ').match(/no print held that was not held before|were the same, print for print/g) || []).length;
  if (!n) throw new Error('detect.ts: the ordinary-link records moved; this law reads them');
  const WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const judge = (t, count) => {
    const us = units(t).filter((s) => /records? that no print of an ordinary link/.test(s));
    if (!us.length) return 'no statement that intake changes record no new hold on an ordinary link';
    for (const s of us) {
      const k = s.match(/\b(each|all|every|one|two|three|four|five|six|\d+) of which\b/);
      const v = k && (WORD[k[1]] ?? (/^\d+$/.test(k[1]) ? +k[1] : NaN));
      if (!k || v !== count) return `"…${s.slice(Math.max(0, (k?.index ?? 0) - 40), (k?.index ?? 0) + 120)}…" does not give ${count}, the rules detect.ts records it at`;
    }
    return '';
  };
  const [, README] = RECORD()[0];
  check(judge(README, n) === '', `README says ${n} of the intake changes record no new hold on an ordinary link, as detect.ts does`, judge(README, n));
  const OLD = 'Each count is one random draw (lane I\'s harnesses, re-run against `detect.ts` as it stood before that day\'s last intake changes, below, each of which records that no print of an ordinary link under any gateway was held that was not held before): a Zoom invitation.';
  check(judge(OLD, n) !== '', 'CONTROL: the README sentence as it stood before this pass fails the same check', judge(OLD, n) || '(passed)');
  check(judge(README, n + 1) !== '', 'CONTROL: README fails the same check against a detect.ts that records it at one rule more', judge(README, n + 1) || '(passed)');
}

// ── 16. the fragment check and the look-alike signs are stated as the code reads them ──
console.log('\n— 16. the documents state the fragment check\'s plural and tag reading, and the signs read as # and @, as the code has them —');
{
  // Evidence: survivingFragments reads a piece with refFind 'text' (engine.ts), which reads a
  // capitalised plural ending, so "the Kierkegaards" and "two Tans" flag (D2J-8). Its second
  // pass reads a piece from four letters inside a token only where the token has one of its
  // pre-filter's marks, which holds the plain "#" and "@" alone; its first pass, refFind 'text',
  // reads a tag behind a sign the mask reads as "#" or "@" only from RUN_FLOOR. Probed
  // 2026-09-25 (scratch frag4.mjs): "#wongfamily" and "@lopezfamily" flag, "﹟wongfamily",
  // "＃lopezfamily" and the rest of the look-alikes do not, "﹟porterfamily" and
  // "♯kierkegaardfamily" flag, and nothing behind "⌗" or "⋕" flags at any length (D2L7-5). The
  // dead first draft of this pass wrote that such a tag "is not read for one" at all and that
  // "Wong is under six letters" is why the mask leaves it; the mask leaves "#kierkegaardfamily"
  // and "Mr Kierkegaard" too, since it does not mask one word of a two-word row alone (frag3.mjs).
  // The mask reads as "#" or "@" the fullwidth forms (foldFullwidth) and three named signs
  // (symbolRead); "⌗" and "⋕" ship (D2J-7). A sentence may name as read only the signs the code
  // reads and must not claim the class ("look-alike") while a look-alike ships; a fragment
  // sentence saying "never inside a plain word of letters" carries the plural while the check
  // reads one; one saying it reads a handle or a tag says "the plain `@` or `#`" while the
  // pre-filter lacks the others, the document says a tag with one of the others is read from
  // RUN_FLOOR (never that it is "not read for" a piece), and says one behind a sign the code does
  // not read is read for none. A reader told "not read" checks every such tag by hand; one told
  // nothing assumes "﹟wongfamily" was checked.
  const W = read('app', 'frontend', 'src', 'lib', 'extract', 'docxWrite.ts');
  const ENGINE = read('app', 'frontend', 'src', 'lib', 'engine.ts');
  const sym = W.match(/return u === (0x[0-9a-f]+) \|\| u === (0x[0-9a-f]+) \? '#' : u === (0x[0-9a-f]+) \? '@' : ch;/);
  const pre = ENGINE.match(/if \(!\/\[([^\]]+)\]\/u\.test\(tok\) \|\| !nonProseToken\(tok\)\) continue;/);
  const plural = ENGINE.includes("runNames([...letters]), 'text')");
  const rf = W.match(/export const RUN_FLOOR = (\d+);/);
  if (!sym || !pre || !rf || !/import \{ foldFullwidth \}/.test(W)) throw new Error('docxWrite.ts symbolRead, foldFullwidth or RUN_FLOOR, or engine.ts\'s fragment pre-filter, moved; this law reads them');
  const FLOOR = { 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight' }[rf[1]];
  if (!FLOOR) throw new Error('docxWrite.ts: RUN_FLOOR is outside the words this law spells; re-aim it');
  const READ = new Set(['#', '@', '＃', '＠', ...sym.slice(1).map((h) => String.fromCodePoint(parseInt(h, 16)))]);
  const FRAG = new Set([...READ].filter((ch) => pre[1].includes(ch)));
  const SIGNS = ['#', '@', '＃', '＠', '﹟', '﹫', '♯', '⌗', '⋕'];
  const NONE = SIGNS.filter((ch) => !READ.has(ch));
  const spans = (w) => [...w.matchAll(/`([^`]+)`/g)].map((x) => x[1]).filter((x) => SIGNS.includes(x));
  const judge = (t, read, frag, pl) => {
    const out = [];
    const gap = [...read].some((ch) => !frag.has(ch));
    // a sign the mask reads as "#" or "@" other than those two, named in the sentence
    const other = (s) => spans(s).some((ch) => read.has(ch) && ch !== '#' && ch !== '@');
    let tagSentence = false, gapSaid = false, noneSaid = !NONE.length;
    for (const s of units(t)) {
      const k = s.search(/read as one\b/);
      if (k >= 0 && /`[#@]`/.test(s)) {
        if (/look-alike `#` or `@`/.test(s) && !['⌗', '⋕'].every((ch) => read.has(ch))) out.push(`claims every look-alike "#" or "@" is read, while ${['⌗', '⋕'].filter((ch) => !read.has(ch)).join(' ')} is not: "…${s.slice(Math.max(0, k - 80), k + 20)}…"`);
        for (const ch of spans(s.slice(0, k))) if (!read.has(ch)) out.push(`names "${ch}" as read as one, which the code does not read`);
        const nt = s.slice(k).search(/\b(?:are|is) not\b/);
        if (nt >= 0) for (const ch of spans(s.slice(k + nt))) if (read.has(ch)) out.push(`names "${ch}" as not read, which the code reads`);
      }
      const fragS = /\bflags?\b|\bpiece\b|fragment/i.test(s);
      if (fragS && pl && /never (?:elsewhere )?inside a plain word of letters/.test(s) && !/plural/.test(s)) out.push(`says the fragment check never reads inside a plain word of letters, without the plural it reads: "…${s.slice(s.search(/never (?:elsewhere )?inside/) - 60, s.search(/never (?:elsewhere )?inside/) + 60)}…"`);
      if (fragS && /inside an address, a path,? (?:a |or a )?handle or (?:a )?tag/i.test(s)) {
        tagSentence = true;
        if (gap && !/plain `@` or `#`/.test(s)) out.push('says the fragment check reads a handle or a tag without "the plain `@` or `#`", while its pre-filter reads no other sign');
      }
      if (other(s) && new RegExp(`\\bfrom ${FLOOR}\\b`).test(s)) gapSaid = true;
      if (other(s) && /\bnot read for (?:a|one)\b/.test(s)) out.push(`says a tag or handle with another sign is not read for a piece, which the check reads from ${FLOOR} letters: "…${s.slice(Math.max(0, s.search(/\bnot read for/) - 80), s.search(/\bnot read for/) + 40)}…"`);
      if (spans(s).some((ch) => NONE.includes(ch)) && /\breads none\b|\bread for none\b/.test(s)) noneSaid = true;
    }
    if (tagSentence && gap && !gapSaid) out.push(`does not say a tag or handle written with another sign is read for a piece only from ${FLOOR} letters`);
    if (tagSentence && !gap && gapSaid) out.push(`says a tag or handle with another sign is read only from ${FLOOR} letters, which the check now reads from four`);
    if (tagSentence && !noneSaid) out.push(`does not say a tag behind ${NONE.join(' or ')}, which the code does not read as a sign, is read for none`);
    return out.join(' | ');
  };
  const [[, README], , [, AUDIT]] = RECORD();
  for (const [name, t] of [['README.md', README], ['REDACTION_AUDIT.md', AUDIT]]) check(judge(t, READ, FRAG, plural) === '', `${name} states the fragment check's plural and plain-sign reading, and names as read as "#"/"@" only ${[...READ].join(' ')}`, judge(t, READ, FRAG, plural));
  const OLD_R = 'It reads a piece under four letters only where the row and the export both write it with a capital, and never inside a plain word of letters (`Kierkegaardian` is not flagged for a row `Søren Kierkegaard`; probed 2026-09-24).';
  check(/plural/.test(judge(OLD_R, READ, FRAG, plural)), 'CONTROL: the README fragment sentence as it stood before this pass fails on the plural', judge(OLD_R, READ, FRAG, plural) || '(passed)');
  const OLD_A = 'A fragment check looks for a piece: found at word breaks, through escapes, and from four letters inside an address, a path, a handle or a tag, never inside a plain word of letters. It flags and never holds.';
  const oa = judge(OLD_A, READ, FRAG, plural);
  check(/plural/.test(oa) && /plain `@` or `#`/.test(oa) && /another sign/.test(oa), 'CONTROL: the audit\'s fragment sentence as it stood before this pass fails on the plural, the plain sign and the unstated gap', oa || '(passed)');
  const OLD_S = '`#` now joins a token and starts one as `@` does (`JOINER`, `HANDLE`; `#kestrelholdings` reads `#[Company1]holdings`; a small or look-alike `#` or `@` is read as one, law 82).';
  check(/look-alike/.test(judge(OLD_S, READ, FRAG, plural)), 'CONTROL: the audit\'s sign sentence as it stood before this pass fails on "look-alike"', judge(OLD_S, READ, FRAG, plural) || '(passed)');
  const NAMED = 'The small `#`, `﹟` and `⌗`, are each read as one.';
  check(/"⌗" as read/.test(judge(NAMED, READ, FRAG, plural)), 'CONTROL: a sentence naming "⌗" as read as one fails the same check', judge(NAMED, READ, FRAG, plural) || '(passed)');
  const ALL = new Set(READ);
  for (const [name, t] of [['README.md', README], ['REDACTION_AUDIT.md', AUDIT]]) check(judge(t, READ, ALL, plural) !== '', `CONTROL: ${name} fails the same check against a fragment pre-filter that reads every sign`, judge(t, READ, ALL, plural) || '(passed)');
  // the dead first draft of this pass (2026-09-24 21:22–21:43), which said "not read for one"
  // and gave the wrong reason the mask leaves the tag
  const DEAD_R = 'Inside an address, a path, a handle or a tag it reads a piece from four letters where the token has the plain `@` or `#`; a tag or handle written with a fullwidth, small or look-alike sign (`＃`, `﹟`, `♯`, `＠`, `﹫`) is not read for one, so `﹟wongfamily` beside a row `Anna Wong` is neither masked (`Wong` is under six letters) nor flagged (probed 2026-09-24).';
  const dr = judge(DEAD_R, READ, FRAG, plural);
  check(/not read for a piece/.test(dr) && new RegExp(`only from ${FLOOR} letters`).test(dr) && /read for none/.test(dr), 'CONTROL: the README fragment sentence of the dead first draft fails on "not read for one", the unstated floor and the unstated "⌗"', dr || '(passed)');
  const DEAD_A = 'A fragment check reads a piece from four letters inside an address, a path, or a handle or tag written with the plain `@` or `#`, before a plural `s`, never elsewhere inside a plain word of letters. A tag or handle written with a fullwidth, small or look-alike sign (`＃`, `﹟`, `♯`, `＠`, `﹫`), which the mask reads as `#` or `@`, is not read for a piece: `﹟wongfamily` beside a row `Anna Wong` is neither masked (`Wong` is under `RUN_FLOOR`) nor flagged, while `#wongfamily` flags `wong`.';
  const da = judge(DEAD_A, READ, FRAG, plural);
  check(/not read for a piece/.test(da) && new RegExp(`only from ${FLOOR} letters`).test(da), 'CONTROL: the audit\'s fragment sentence of the dead first draft fails on "not read for a piece" and the unstated floor', da || '(passed)');
}

// ── 17. the wrapped -E9 / *E9 link is not said to hold the .docx ──
console.log('\n— 17. the documents state the wrapped -E9 / *E9 link as shipping from the .docx too —');
{
  // Evidence: a probe, not a code read, since the places a wrap undoes the hold follow from how
  // BR, LINK_BROKEN and hasEscape meet and no one constant states them. Probed 2026-09-25
  // (scratch j7docx.mjs, the writer at every place a w:br can stand in the link of law 64, row
  // "René Tan"): v2 held 90 of 97 places and saved the name at 7, v3 held 78 of 85 and saved it
  // at 7, each with 0 leaks, at the same 7 places the .txt ships from (D2J-2, D2L7-3). The dead
  // first draft of this pass probed three places only, none of the seven, and wrote "the `.docx`
  // holds"; a reader told that sends the .docx of a wrapped mail. Each document must state the
  // wrapped escape as open for the .docx as well, and no sentence about it may say the .docx
  // holds. While the writer asks hasEscape of what it reads, the law runs; the anchors below
  // throw when they move.
  const W = read('app', 'frontend', 'src', 'lib', 'extract', 'docxWrite.ts');
  const E = read('app', 'frontend', 'src', 'lib', 'engine.ts');
  if (!W.includes("const BR = '(?:\\\\r?\\\\n)?';") || !/if \(!rm\.divergence && hasEscape\(readable\)\)/.test(E)) throw new Error('docxWrite.ts BR or engine.ts\'s hasEscape call moved; re-probe the wrapped -E9 link (j7docx.mjs) and re-aim this law');
  const judge = (t) => {
    const out = [];
    const about = units(t).filter((s) => /[-*]E9/.test(s) && /\bwrap/.test(s));
    if (!about.length) return 'no statement of the -E9 / *E9 link wrapped by a mail program';
    const HOLDS = /`\.docx`,? (?:holds|is held)\b/;
    for (const s of about) if (HOLDS.test(s)) out.push(`says the .docx holds the wrapped link: "…${s.slice(Math.max(0, s.search(HOLDS) - 80), s.search(HOLDS) + 30)}…"`);
    if (!about.some((s) => /(?:from|nor) the `\.docx`|the `\.docx` is not held|nor the `\.docx`/.test(s) && /\bwrap/.test(s))) out.push('does not state the wrapped link as open for the .docx');
    return out.join(' | ');
  };
  for (const [name, t] of RECORD()) check(judge(t) === '', `${name} states the wrapped -E9 / *E9 link as open for the .docx too`, judge(t));
  const DEAD_R = '- a Proofpoint link that writes a byte that is no character (`-E9`, `*E9`), wrapped just before that escape or inside the escape after it: the `.txt` and the copied text are neither held nor masked, at 3 places a link besides those inside the name\'s letters, LF and CRLF; the `.docx` holds (probed 2026-09-24);';
  const dr = judge(DEAD_R);
  check(/holds the wrapped/.test(dr) && /open for the \.docx/.test(dr), 'CONTROL: the README item of the dead first draft fails on "the `.docx` holds"', dr || '(passed)');
  const DEAD_B = 'Open on 2026-09-24: a Proofpoint link that writes a byte that is no character (`-E9`, `*E9`), wrapped just before or inside that escape, which the `.txt` and the copied text neither hold nor mask at 3 places a link besides those inside the name\'s letters (the `.docx` holds); a Symbol-font letter.';
  check(judge(DEAD_B) !== '', 'CONTROL: the BENCHMARK item of the dead first draft fails the same check', judge(DEAD_B) || '(passed)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
