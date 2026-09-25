/* ============================================================================
 * facets.mjs — build-time, deterministic, extractive synopsis + disposition.
 * Imported by graph.mjs; every emitted string is a verbatim contiguous span of
 * the opinion text. No model, no network, no paraphrase.
 *
 * Doctrine: fail-closed. A wrong verdict is catastrophic; a refusal is safe.
 * Every refusal carries a machine-readable reason, and the viewer prints it.
 *
 * Measured over the 99-doc corpus (2026-09-12):
 *   disposition 88/99 emitted, 11 refused — no-operative-disposition-found 8,
 *     conflicting-dispositions-in-opinion 1,
 *     multiple-appeals-single-outcome-in-truncated-text 2
 *   rails: A/D-prose 81, E-byline 4, C-decretal 3; median span 97 chars
 *   synopsis 99/99, median 258 chars; 72 of the 88 disposition spans come from
 *     text the archive truncated, which is why sourceTruncated ships with them
 *   agreement against independent corpus signals: 9/9 standalone decretal
 *     lines, 7/7 Fourth-Circuit bylines, 0 disagreements; guard selftest 40/40
 *
 * dispositionVerbs is a FILTERING signal only. It is not a summary of the
 * outcome and must never be rendered as a badge — a span reading "we affirm
 * in part and reverse in part" yields {affirm, reverse} with no scope, and a
 * chip saying "AFFIRMED · REVERSED" would state something the court did not.
 * ========================================================================== */

const TRUNC_MARKER = '[truncated for spike corpus]';

/* ---------- 1. abbreviation-aware sentence splitting ---------------------- */

const ABBREV = new Set([
  'v', 'vs', 'no', 'nos', 'inc', 'corp', 'co', 'ltd', 'llc', 'llp', 'bros', 'assn', 'ass',
  'u.s', 'u.s.c', 'u.s.c.a', 's.ct', 'l.ed', 'f.2d', 'f.3d', 'f.supp', 'fed', 'cir', 'ct',
  'app', 'dist', 'div', 'supp', 'stat', 'ann', 'cl', 'ch', 'art', 'sec', 'para', 'pt',
  'id', 'ibid', 'cf', 'eg', 'ie', 'etc', 'al', 'ex', 'rel', 'jr', 'sr', 'dr', 'mr', 'mrs',
  'ms', 'st', 'mt', 'hon', 'dept', "dep't", 'gov', 'natl', 'intl', 'jan', 'feb', 'mar',
  'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'r.civ.p', 'fed.r.civ.p',
  'fed.r.evid', 'n.y', 'n.j', 'd.c', 'p.2d', 'p.3d', 'a.2d', 'n.e', 'n.w', 's.e', 's.w',
  'so.2d', 'bankr', 'civ', 'crim', 'proc', 'evid', 'univ', 'natl', 'comm', 'admin',
]);

function splitSentences(text) {
  const out = [];
  let start = 0;
  const re = /([.!?])(["'’”)\]]*)(\s+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const endIdx = m.index + m[0].length;
    const nextCh = text[endIdx];
    if (!nextCh || !/[A-Z“"'(\[§À-Ü]/.test(nextCh)) continue;
    const before = text.slice(start, m.index);
    const lastTok = (before.match(/([A-Za-z.’']+)$/) || [''])[0];
    const bare = lastTok.replace(/[’']/g, '').toLowerCase().replace(/^\.+/, '');
    if (m[1] === '.') {
      if (ABBREV.has(bare)) continue;                   // "Inc." "Cir." "U.S.C."
      if (/^[A-Za-z]$/.test(lastTok)) continue;         // initial: "Elizabeth E."
      if (/[A-Za-z]\.[A-Za-z]/.test(lastTok)) continue; // "F.3d" "U.S."
    }
    const sent = text.slice(start, endIdx).trim();
    if (sent) out.push({ text: sent, start, end: endIdx });
    start = endIdx;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push({ text: tail, start, end: text.length });
  return out;
}

/* ---------- 2. structural segmentation ----------------------------------- */

function isFootnote(p) { return /^\.\s/.test(p); }

function isByline(p) {
  if (p.length > 300) return false;
  return (
    /^[A-ZÀ-Ü][A-Za-zÀ-ÿ'’.\- ]*,\s*(Chief\s+|Senior\s+)?(Circuit|District|Senior|Chief)?\s*Judge[.,:]?\s*$/.test(p) ||
    (/\b(Circuit|District|Chief|Senior)\s+Judge\b.*[:.]$/.test(p) && /[A-Z]{3,}/.test(p)) ||
    /^(PER CURIAM|OPINION OF THE COURT|OPINION|ORDER)\b[.:]?$/i.test(p) ||
    /^Opinion (for|of|by)\b/i.test(p) ||
    /\bby published opinion\b/i.test(p) ||
    /^Before\b.*\bJudges?\b/.test(p)
  );
}

function isHeading(p) {
  if (p.length > 90) return false;
  const letters = p.replace(/[^A-Za-z]/g, '');
  if (!letters) return true;
  const upper = (p.match(/[A-Z]/g) || []).length / letters.length;
  return upper > 0.7;
}

// A separate opinion's byline is a short FRAGMENT ("dissenting.", "concurring in
// part and dissenting in part:"), not a sentence.
function isSeparateOpinionStart(p) {
  const fragment = (/:$/.test(p) && p.length < 90) || (p.length < 40 && /\.$/.test(p));
  if (!fragment) return false;
  return /\b(?:dissent|concurr)\w*\b[^.?!]{0,45}[:.]?$/i.test(p) &&
         !/\bby published opinion\b/i.test(p) &&
         !/^Opinion (for|of|by)\b/i.test(p);
}

function parseOpinion(raw) {
  const lines = raw.split(/\r?\n/);
  const header = {};
  for (let i = 0; i < 5; i++) {
    const m = /^([A-Za-z]+):\s*(.*)$/.exec(lines[i] || '');
    if (m) header[m[1].toLowerCase()] = m[2].trim();
  }
  const truncated = raw.includes(TRUNC_MARKER);
  const paras = lines.slice(6).map(s => s.trim()).filter(s => s !== '' && s !== TRUNC_MARKER);

  let majorityEnd = paras.length;
  for (let i = 1; i < paras.length; i++) {
    if (isSeparateOpinionStart(paras[i])) {
      majorityEnd = i;
      if (i > 0 && paras[i - 1].length < 130 && /\bJudge\b/.test(paras[i - 1])) majorityEnd = i - 1;
      break;
    }
  }
  return { header, truncated, paras, majorityEnd };
}

/* ---------- 3. disposition grammar --------------------------------------- */

const OPERATIVE = '(?:affirms?|reverses?|vacates?|remands?|dismisses|dismiss|denies|deny|grants?|reinstates?|modif(?:y|ies))';
const FILLER = "(?:will|now|therefore|thus|must|shall|also|hereby|accordingly|again|further|consequently|likewise|hence|do|instead|respectfully|nonetheless|nevertheless|agree|disagree|concur|\\w+ly)";

// RAIL A — "we affirm", "we will AFFIRM", "this court affirms", "we disagree and affirm".
const RAIL_A = new RegExp(
  `\\b(?:we|this court)\\s+(?:${FILLER}\\s+){0,3}(?:and\\s+)?(${OPERATIVE})\\b`, 'i');

// RAIL A2 — the routine appellate formula the {0,3}-filler window cannot reach:
// "We have jurisdiction under 28 U.S.C. § 1291 and will affirm ... but will reverse ...".
// Measured: 5/99 files use it; on 2 of them the subject is NOT repeated after "and",
// so RAIL A alone silently drops the court's own statement of its whole judgment
// and falls through to a narrower sub-holding (this is the Saldana v. Kmart defect).
// Deliberately narrow: the bridge must be a jurisdiction clause, no clause-final
// punctuation, so it cannot hop to another actor's verb.
const RAIL_A2 = new RegExp(
  `\\b(?:we|this court)\\s+(?:have|exercise|possess|retain)\\s+(?:appellate\\s+|subject[- ]matter\\s+)?jurisdiction\\b[^;:]{0,100}?\\b(?:and|but)\\s+(?:${FILLER}\\s+){0,2}(${OPERATIVE})\\b`, 'i');

// RAIL D — passive decretal sentence, present tense only.
const RAIL_D = new RegExp(
  `\\b(?:the\\s+)?(?:judgments?|orders?|decisions?|rulings?|decrees?|sentences?|convictions?|awards?|petitions?)\\b[^.;]{0,220}?\\b(?:is|are)\\s*,?\\s*(?:(?:hereby|therefore|accordingly|thus|consequently)\\s*,?\\s*){0,2}(affirmed|reversed|vacated|remanded|dismissed|denied|granted|reinstated|modified)`,
  'i');

function quotedRanges(s) {
  const r = [];
  const re = /[“"]([^”"]{0,400})[”"]/g;
  let m; while ((m = re.exec(s)) !== null) r.push([m.index, m.index + m[0].length]);
  return r;
}

// G1b — a rule statement can put its conditional FIRST ("If the findings are not
// clearly erroneous, we affirm."). A guard that only inspects the text after the
// verb is defeated by word order alone.
const LEADING_CONDITIONAL = /^\s*(?:if|unless|when|whenever|where|wherever|absent|provided that|so long as|assuming)\b[^.?!]{0,200}?,\s/i;

function isDispositionSentence(s) {
  const mA = RAIL_A.exec(s) || RAIL_A2.exec(s);
  const mD = mA ? null : RAIL_D.exec(s);
  const m = mA || mD;
  if (!m) return false;

  // G7 — the VERB itself sits inside quoted text (a quoted rule, or another
  // court's order). Test the verb's own offset, not the match start.
  const verbAt = m.index + m[0].length - m[1].length;
  for (const [a, b] of quotedRanges(s)) if (verbAt >= a && verbAt < b) return false;

  // G1 — standard-of-review / generic rule statement.
  if (/\b(?:we|this court)\s+(?:\w+\s+){0,2}reviews?\b/i.test(s)) return false;
  if (/\breviews?\s+(?:de novo|for (?:clear|abuse)|grants?|denials?)/i.test(s)) return false;
  const after = s.slice(m.index + m[0].length);
  if (/^[^.]{0,200}?\b(?:only if|if|unless|when|whenever|where|provided that|to the extent that)\b/i.test(after)) return false;
  if (LEADING_CONDITIONAL.test(s) && LEADING_CONDITIONAL.exec(s)[0].length < verbAt) return false;

  // G4 — prior appeal / procedural history.
  if (/^(?:In \d{4}|In an earlier|In the (?:first|prior|previous|earlier)|Previously|On remand|After (?:argument|remand)|Earlier)\b/i.test(s)) return false;
  if (/\b(?:we|this court)\s+(?:previously|earlier|already|then)\b/i.test(s)) return false;

  // G5 — a party asking for relief is not the court granting it.
  if (/\b(?:urge|urges|ask|asks|argu\w*|contend\w*|move[sd]?|request\w*|invite[sd]?|petition\w*|insist\w*|maintain\w*|submit\w*|press\w*|seek\w*)\s+(?:that\s+)?(?:this court|us|we|the court)\b/i.test(s)) return false;
  if (/\b(?:would have|urges?|asks?)\s+(?:us|this court)\b/i.test(s)) return false;
  if (/\b(?:we|this court)\s+(?:\w+\s+){0,2}(?:should|would|could|might|may|cannot|can|need not)\b/i.test(s)) return false;

  // G2 — the "verb" is really a noun ("the grant of summary judgment").
  if (/(?:\bthe|\ba|\ban|\bany|\bthat|\bthis|\bits|\bhis|\bher|\btheir)\s+$/i.test(s.slice(Math.max(0, verbAt - 12), verbAt))) return false;

  // G9 — another court's words introduced by a colon, with no quote marks around
  // them (CAP renders many block quotations bare).
  if (/(?:Supreme Court|[A-Z][a-z]+ Circuit|[Cc]ourt of [Aa]ppeals|panel)[^.:]{0,60}:\s*(?:we|this court)\s/.test(s)) return false;

  // G10 — an order on a motion (rehearing, reconsideration, stay) is not the
  // judgment in the case. "The motion for rehearing is denied." would otherwise
  // read as a verdict through the passive rail.
  if (/\b(?:motions?|petitions?|applications?)\s+(?:for\s+)?(?:re-?hearing|reconsideration|stay|extension|leave)\b/i.test(s)) return false;

  // G6 — disposing of an argument is not disposing of the appeal.
  if (/\b(?:dismiss|reject)\w*\s+(?:\w+\s+){0,3}(?:argument|contention|assertion|suggestion)/i.test(s)) return false;

  return true;
}

const VERB_TOKEN = /\b(affirm|reverse|vacate|remand|dismiss|deny|grant|reinstate|modify)(?:s|es)?\b/gi;
const PARTICIPLE = /\b(?:affirmed|reversed|vacated|remanded|dismissed|denied|granted|reinstated|modified)\b/gi;
const PART_BASE = {
  affirmed: 'affirm', reversed: 'reverse', vacated: 'vacate', remanded: 'remand',
  dismissed: 'dismiss', denied: 'deny', granted: 'grant', reinstated: 'reinstate', modified: 'modify',
};
function operativeVerbHits(span) {
  const hits = [];
  let m;
  VERB_TOKEN.lastIndex = 0;
  while ((m = VERB_TOKEN.exec(span)) !== null) {
    const pre = span.slice(Math.max(0, m.index - 12), m.index);
    if (/(?:\bthe|\ba|\ban|\bany|\bthat|\bthis|\bits|\bhis|\bher|\btheir)\s+$/i.test(pre)) continue;
    if (/['’]s\s+$/.test(pre)) continue;                // "the District Court's grant"
    hits.push(m[1].toLowerCase());
  }
  PARTICIPLE.lastIndex = 0;
  // Where the last "is/are <participle>" landed. A second participle coordinated
  // with it by "and"/"or" inside the SAME sentence shares that verb:
  //   "the judgment ... is affirmed-in-part and reversed-in-part"
  // Only "affirmed" sits next to the "is", so without this "reversed" was dropped
  // and a half-reversed judgment was classified as affirmed outright.
  let passiveAt = -1;
  while ((m = PARTICIPLE.exec(span)) !== null) {
    const pre = span.slice(Math.max(0, m.index - 30), m.index);
    const decretal = span.length <= 120 && (m.index === 0 || /\b(?:and|or)\s+$/i.test(pre));
    const passive = /\b(?:is|are)\s*,?\s*(?:(?:hereby|therefore|accordingly|thus|consequently)\s*,?\s*){0,2}$/i.test(pre);
    // the gap back to that "is": same sentence, joined by and/or, nothing else claimed
    const gap = passiveAt < 0 ? null : span.slice(passiveAt, m.index);
    const coordinated =
      gap !== null && !/[.!?]/.test(gap) && /\b(?:and|or)\b/i.test(gap) && gap.length <= 60;
    if (passive || decretal || coordinated) {
      hits.push(PART_BASE[m[0].toLowerCase()]);
      if (passive || coordinated) passiveAt = m.index + m[0].length;
    }
  }
  return hits;
}
const operativeVerbs = (span) => new Set(operativeVerbHits(span));

// Rail C / C2 — the standalone decretal line.
const STANDALONE = /^(?:AFFIRMED|REVERSED|VACATED|REMANDED|DISMISSED|AFFIRMED IN PART|PETITION (?:DENIED|GRANTED)|SO ORDERED|Affirmed|Reversed|Vacated|Remanded|Dismissed|So ordered)\b[A-Za-z ;,'’-]*\.?$/;
const DISP_WORD = /\b(affirm|revers|vacat|remand|dismiss|den(?:y|ie)|grant|reinstate|modif)/i;
function isStandaloneDisposition(p) {
  return p.length <= 120 && !isFootnote(p) && STANDALONE.test(p) && DISP_WORD.test(p);
}
// Rail E — Fourth Circuit byline carries the judgment in the first body paragraph.
const RAIL_E = /^((?:Affirmed|Reversed|Vacated|Remanded|Dismissed|Affirmed in part)[A-Za-z ,;'’-]{0,80}?\bby published opinion\.)/;

// Which side does a verb set favour? Used only to decide whether a span states a
// SINGLE-DIRECTION outcome, never to print a one-word badge.
const FOR_APPELLANT = new Set(['reverse', 'vacate', 'grant', 'reinstate', 'modify']);
const FOR_APPELLEE = new Set(['affirm', 'deny', 'dismiss']);
/* ---------- 4b. outcome direction -----------------------------------------
 * One axis, three values, derived ONLY from the verbatim span already emitted:
 * did the court leave the decision below in place, undo it, or split.
 *
 * The axis is deliberately "stands / disturbed", not "won / lost". On an appeal
 * an affirmance is a win for whoever won below, and the firm reading this map can
 * be on either side of any case in it, so a good/bad reading would be wrong about
 * half the library. The card prints the word next to the colour for the same
 * reason: nobody should have to decode a hue to learn what a court did.
 *
 * Returns null wherever the span does not settle it. A node with no outcome gets
 * no colour — the same fail-closed rule the disposition itself follows.
 * ======================================================================== */

// "affirmed-in-part and reversed-in-part" is one hyphenated token to a reader and
// two to a regex, so the hyphenated spellings are listed explicitly.
//
// This line was once written through a chain of shell + Python string layers, each
// of which ate one backslash, so every \b arrived as a literal backspace byte. The
// regex still PARSED and still ran — it just matched nothing, and a case the court
// had half reversed came out classified as affirmed. A regex that silently matches
// nothing is the worst possible failure here, so graph.mjs selftest now asserts on
// this one directly and the file is checked for stray control bytes.
const PARTIAL_SCOPE =
  /\bin[- ]part\b|\b(?:affirmed|reversed|vacated|granted|denied|dismissed|remanded)-in-part\b|\bin all other respects\b|\bexcept (?:as to|for|that)\b|\bsave (?:for|as to)\b/i;

export function outcomeClass(disposition, verbs) {
  if (!disposition || !verbs || !verbs.length) return null;
  const forAppellant = verbs.some((v) => FOR_APPELLANT.has(v));
  const forAppellee = verbs.some((v) => FOR_APPELLEE.has(v));
  if ((forAppellant && forAppellee) || PARTIAL_SCOPE.test(disposition)) return 'mixed';
  if (forAppellant) return 'disturbed';
  if (forAppellee) return 'stands';
  return null;
}

function singleDirection(verbs) {
  const a = [...verbs].some(v => FOR_APPELLANT.has(v));
  const b = [...verbs].some(v => FOR_APPELLEE.has(v));
  return !(a && b);
}

/* ---------- 4. disposition extraction ------------------------------------ */

// Does the opinion's own opening text announce more than one appeal?
const MULTI_APPEAL = /\bcross[- ]appeals?\b|\bconsolidat\w+\s+(?:appeals?|cases?|actions?)\b|\b(?:appeals?|cases?)\b[^.]{0,40}\bconsolidat\w+\b|\bcompanion (?:case|appeal)\b|\bboth appeals\b|\bthese (?:consolidated )?appeals\b|\bappeals?\b[^.]{0,140}\bwhile\b[^.]{0,140}\bappeals?\b/i;
// A span that says how far it reaches already answers the scope question.
const SCOPED = /\bin part\b|\bin-part\b|\bin all respects\b|\bin its entirety\b|\bin all other respects\b|\bon (?:all|both) (?:counts|claims|grounds|appeals)\b/i;

function extractDisposition(parsed, openingText) {
  const { paras, majorityEnd, truncated } = parsed;

  let railE = null;
  if (paras.length) {
    const e = RAIL_E.exec(paras[0]);
    if (e) railE = { text: e[1], rail: 'E-byline', para: 0, verbs: operativeVerbs(e[1]) };
  }

  const hits = [];
  for (let i = 0; i < majorityEnd; i++) {
    const p = paras[i];
    if (isFootnote(p)) continue;
    if (isStandaloneDisposition(p)) { hits.push({ text: p, rail: 'C-decretal', para: i }); continue; }
    if (isHeading(p)) continue;
    if (i === 0 && isByline(p)) continue;
    // G8 — a paragraph that opens as a block quotation is another court's text.
    if (/^[“"]/.test(p)) continue;

    const sents = splitSentences(p);
    let first = -1, last = -1;
    for (let k = 0; k < sents.length; k++) {
      if (isDispositionSentence(sents[k].text)) { if (first < 0) first = k; last = k; }
    }
    if (first >= 0) {
      const span = p.slice(sents[first].start, sents[last].end).trim();
      hits.push({ text: span, rail: 'A/D-prose', para: i });
    }
  }

  if (!hits.length) {
    return railE
      ? { ...railE, verbs: railE.verbs, corroborated: true }
      : { text: null, rail: null, reason: 'no-operative-disposition-found' };
  }

  const prose = hits.filter(h => h.rail === 'A/D-prose');
  const pool = prose.length ? prose : hits;   // a bare decretal line only when no prose states the judgment
  for (const h of pool) { const v = operativeVerbHits(h.text); h.verbs = new Set(v); h.nVerb = v.length; }

  // Rank: most distinct outcomes, then most outcomes enumerated, then earliest.
  let pick = pool.reduce((best, h) =>
    (h.verbs.size !== best.verbs.size) ? (h.verbs.size > best.verbs.size ? h : best)
      : (h.nVerb > best.nVerb ? h : best), pool[0]);
  if (pick.text.length < 40) {
    const same = pool.filter(h => h.verbs.size === pick.verbs.size && [...h.verbs].every(v => pick.verbs.has(v)));
    pick = same.reduce((a, b) => (b.text.length > a.text.length ? b : a), pick);
  }

  // R1 — fail-closed: another paragraph states an outcome sharing NO verb with
  // the pick. One span cannot honestly represent both.
  for (const h of pool) {
    if (h === pick || !h.verbs.size || !pick.verbs.size) continue;
    if (![...h.verbs].some(v => pick.verbs.has(v))) {
      return { text: null, rail: null, reason: 'conflicting-dispositions-in-opinion' };
    }
  }

  // R2 — a standalone decretal line disagreeing with the prose pick.
  const decretal = hits.find(h => h.rail === 'C-decretal');
  // A decretal line or a Fourth Circuit byline IS the court's own judgment line:
  // it is self-corroborating, and the scope guard below is aimed at prose
  // sub-holdings, not at decretal text.
  let corroborated = pick.rail !== 'A/D-prose';
  if (decretal && pick.rail === 'A/D-prose') {
    const vset = t => new Set((t.toLowerCase().match(/\b(affirm|revers|vacat|remand|dismiss|den|grant)/g) || []));
    const a = vset(decretal.text), b = vset(pick.text);
    if (![...a].some(v => b.has(v))) {
      return { text: null, rail: null, reason: 'decretal-line-conflicts-with-prose' };
    }
    corroborated = true;
  }

  if (railE) {
    const covers = [...railE.verbs].every(v => pick.verbs && pick.verbs.has(v));
    if (!covers) return { ...railE, corroborated: true };
    if (pick.verbs.size === railE.verbs.size && railE.text.length > pick.text.length) {
      return { ...railE, corroborated: true };
    }
    corroborated = true;
  }

  // R3 — SCOPE GUARD, the truncation-amputation class. The intra-document
  // conflict rails above can only see what truncation left behind: when the
  // 16,002-char cut removes the second half of a split judgment there is nothing
  // left to conflict with, and the surviving half ships at full confidence.
  // Refuse when all four hold: the file was cut, the span points one way only,
  // nothing independent (decretal line / byline) corroborates it, and the
  // opinion's own opening announces more than one appeal.
  if (truncated && !corroborated && pick.nVerb === 1 && singleDirection(pick.verbs)
      && !SCOPED.test(pick.text) && MULTI_APPEAL.test(openingText)) {
    return { text: null, rail: null, reason: 'multiple-appeals-single-outcome-in-truncated-text' };
  }

  return { ...pick, corroborated };
}

/* ---------- 5. synopsis extraction --------------------------------------- */

const SYN_MIN = 180;   // read whole sentences until the reader is oriented
const SYN_CAP = 560;   // hover-card budget

// Outcome language anywhere in the synopsis — this court's or a lower court's.
// The UI needs this because a refusing verdict field sits next to this text:
// Ward v. Dretke refuses the disposition while its orientation paragraph reads
// "We hold that the district court correctly denied Ward's petition as to his
// conviction, but erred in granting his petition as to his sentence."
const OUTCOME_LANGUAGE = /\b(affirm(?:s|ed|ing)?|revers(?:e|es|ed|ing)|vacat(?:e|es|ed|ing)|remand(?:s|ed|ing)?|dismiss(?:es|ed|ing)?|den(?:y|ies|ied|ying)|grant(?:s|ed|ing)?|holds?|held|erred)\b/i;

function extractSynopsis(parsed) {
  const { paras, majorityEnd } = parsed;
  for (let i = 0; i < Math.min(majorityEnd, 6); i++) {
    const p = paras[i];
    if (isFootnote(p) || isHeading(p) || isByline(p)) continue;
    if (/^[“"]/.test(p)) continue;
    if (p.length < 150) continue;
    const sents = splitSentences(p);
    if (!sents.length) continue;
    let out = '';
    for (const s of sents) {
      if (out && (out.length >= SYN_MIN || out.length + 1 + s.text.length > SYN_CAP)) break;
      out = out ? `${out} ${s.text}` : s.text;
    }
    out = out.trim();
    const shape = /\b(?:the question|this (?:case|appeal) (?:requires|concerns|turns|presents|tests)|we must decide|the issue in this case|question of first impression)\b/i.test(p)
      ? 'issue-framing'
      : /\b(?:appeals?|appellant|petitions? for review|cross-appeal)\b/i.test(sents[0].text)
        ? 'party-posture' : 'fact-narrative';
    return {
      text: out, para: i, shape,
      partial: out.length < p.length,
      mentionsOutcome: OUTCOME_LANGUAGE.test(out),
      fullParagraph: p,
    };
  }
  return { text: null, reason: 'no-orientation-paragraph' };
}

/* ---------- 6. entry point ----------------------------------------------- */

export function extractFacets(raw) {
  const parsed = parseOpinion(raw);
  const s = extractSynopsis(parsed);
  const openingText = parsed.paras.slice(0, 8).join(' ');
  const d = extractDisposition(parsed, openingText);
  return {
    sourceTruncated: parsed.truncated,
    synopsis: s.text || null,
    synopsisShape: s.text ? s.shape : null,
    synopsisPara: s.text ? s.para : null,
    synopsisPartial: s.text ? s.partial : null,
    synopsisMentionsOutcome: s.text ? s.mentionsOutcome : null,
    synopsisUnavailable: s.text ? null : s.reason,
    disposition: d.text || null,
    dispositionRail: d.text ? d.rail : null,
    dispositionPara: d.text ? d.para : null,
    dispositionVerbs: d.text ? [...(d.verbs || [])].sort() : [],
    dispositionCorroborated: d.text ? !!d.corroborated : null,
    dispositionUnavailable: d.text ? null : d.reason,
    outcome: d.text ? outcomeClass(d.text, [...(d.verbs || [])]) : null,
  };
}

/* ---------- 7. selftest ---------------------------------------------------
 * The guard corpus travels with the guard. Every REJECT line below is a real
 * sentence shape that an earlier build emitted as a verdict and should not
 * have; every ACCEPT line is one an earlier build refused and should not have.
 * Two of the ACCEPT lines are the record of specific defects:
 *   "…we have jurisdiction under 28 U.S.C. S 1291 and will affirm … but will
 *    reverse with respect to Rohn" is corpus/c7-negligence-doc4.txt, where a
 *    short subject-to-verb window read only the first clause and emitted a
 *    verdict that was wrong about half the case.
 *   "The judgment below is, therefore, affirmed." is corpus/c4-bankruptcy-doc4.txt,
 *    where one comma defeated the passive rail and the file was refused.
 * Run: node graph.mjs selftest
 * ======================================================================== */

const REJECT = [
  // leading conditional rule statements (defeated strategy 2 by word order alone)
  'If the district court’s findings are not clearly erroneous, we affirm.',
  'When the record supports the verdict, we affirm the judgment.',
  'Unless the error was harmless, we reverse the conviction.',
  'Where a plaintiff fails to exhaust, we dismiss the appeal.',
  // trailing conditional rule statements
  'We will affirm that grant if there is no genuine issue as to any material fact.',
  'We reverse the denial of a motion for a new trial if the district court has made a mistake of law.',
  // standard of review
  'We review the district court’s decision to dismiss for lack of subject matter jurisdiction de novo.',
  'This court also reviews grants of summary judgment without deference.',
  // party requests, incl. verbs strategy 2 did not list
  'The SEC urges this Court to reverse the District Court’s decision.',
  'Appellant insists that we reverse the judgment of the district court.',
  'Kmart maintains that this court should affirm the judgment below.',
  'VHS asks us to vacate the injunction.',
  // lower-court actor
  'The district court affirmed.',
  'Accordingly, the court granted injunctive relief to plaintiff-appellee Victoria Pietras.',
  // prior appeal
  'In 1995, we vacated and remanded a decision on damages awarded by the United States District Court.',
  'In the first appeal, we vacated the award and remanded for a new trial.',
  // noun, not verb
  'We see no error in the grant of summary judgment with respect to direct infringement.',
  // argument, not appeal
  'Before addressing infringement, we first address and dismiss Finnigan’s argument concerning claim 17.',
  // quoted / attributed text of another court
  'However, we have held that “[g]ranting a motion to dismiss based on a limitations defense is entirely appropriate.”',
  'The Ninth Circuit put it plainly: we affirm the judgment of the district court.',
];
const ACCEPT = [
  'We affirm.',
  'We affirm in all respects.',
  'Concluding that they abandoned their interests in the hotel room and its contents, we affirm.',
  'We disagree and affirm the judgment of the district court.',
  'Because claim 22 does not cover any dialer units with a keypad, this court affirms.',
  'We have jurisdiction under 28 U.S.C. § 158(d), and we reverse.',
  'We exercise jurisdiction under 28 U.S.C. § 1291 and affirm.',
  'Suffice it to say that we have jurisdiction under 28 U.S.C. S 1291 and will affirm the District Court’s December 20, 1999 decision with respect to Saldana, but will reverse with respect to Rohn.',
  'For the following reasons, we AFFIRM in part and REVERSE and REMAND in part.',
  'For this reason, we Reverse the district court’s dismissal, and RemaND for proceedings consistent with this opinion.',
  'Accordingly, we will affirm the District Court’s grant of summary judgment.',
  'We affirm the district court’s denial of SOPO’s motion to dismiss on both counts.',
  'The judgment of the district court is affirmed.',
  'The judgment below is, therefore, affirmed.',
  'The judgment of the District Court sustaining the motion to suppress is reversed and the case is remanded for further proceedings.',
  'Concluding the BIA did not abuse its discretion, we deny the petition for review.',
  // hyphenated coordinate participles: both verbs must register, or the colour lies
  'Accordingly, with respect to MEMC’s appeal, the judgment of the district court is affirmed-in-part and reversed-in-part and the case is remanded to the district court for further proceedings.',
];

// decretal-paragraph whitelist must not swallow a court's order on a motion
const SELFTEST_NOT_DECRETAL = [
  'The motion for rehearing is denied.',
  'Petition for rehearing en banc is denied.',
  'So ordered.',
];

export function selftestFacets() {
  const fails = [];
  for (const s of REJECT) if (isDispositionSentence(s)) fails.push('FALSE ACCEPT: ' + s);
  for (const s of ACCEPT) if (!isDispositionSentence(s)) fails.push('FALSE REJECT: ' + s);
  for (const d of SELFTEST_NOT_DECRETAL) {
    const r = extractFacets(`Case: x
Court: x
Date: x
Citation: x
Source: x

A
${d}
`);
    if (r.disposition === d) fails.push('FALSE DECRETAL: ' + d);
  }
  return { total: REJECT.length + ACCEPT.length + SELFTEST_NOT_DECRETAL.length, fails };
}
