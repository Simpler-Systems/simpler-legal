// The practice tables — a second structured floor, per jurisdiction, run AFTER the frozen
// one (lib-core FLOOR_RULES, FREEZE.md) over its output by the same pass (engine.ts
// applyFloor). The frozen table is Singapore-shaped (NRIC / FIN, +65 phone numbers); a
// practice in another jurisdiction has identifiers that table never names. Nothing here
// widens a frozen rule: a practice table only adds rules, and the frozen pass has already
// run when they are applied ("add sweeps, never widen them").
//
// Plain .mjs on purpose: engine.ts imports it (allowJs) and so does the repo-root scorer
// score-floor-tables.mjs, which measures every rule below over the TAB judgments — one
// file, no twin to drift.
//
// A rule is { re, tag, valid? }: the regex nominates, the optional check validates the
// nominated text (a checksum, a prefix list), and a nominee that fails the check is not a
// match in either of applyFloor's runs — the reference run and the shipping run see one
// match set.

/** the practices a user can choose; `sg` is the frozen table alone */
export const PRACTICES = [
  { id: 'sg', label: 'Singapore', note: 'the frozen table only — NRIC / FIN, +65 phone numbers, card numbers, email addresses, long digit runs' },
  { id: 'us', label: 'United States', note: 'adds Social Security numbers, employer identification numbers and punctuated 10-digit phone numbers' },
  { id: 'uk', label: 'United Kingdom', note: 'adds National Insurance numbers, NHS numbers and 07 mobile numbers' },
];
export const DEFAULT_PRACTICE = 'sg';
export const isPractice = (v) => PRACTICES.some((p) => p.id === v);
export const practiceLabel = (id) => PRACTICES.find((p) => p.id === id)?.label ?? id;

// ── validators ──────────────────────────────────────────────────────────────
const digits = (s) => s.replace(/\D/g, '');

/** IRS campus / internet prefixes actually assigned; 07–09, 17–19, 28–29, 49, 69–70, 78–79,
 *  89, 96–97 are not EINs */
const EIN_PREFIX = new Set([
  '01', '02', '03', '04', '05', '06', '10', '11', '12', '13', '14', '15', '16', '20', '21', '22', '23', '24', '25', '26', '27',
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48',
  '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66', '67', '68',
  '71', '72', '73', '74', '75', '76', '77', '80', '81', '82', '83', '84', '85', '86', '87', '88', '90', '91', '92', '93', '94', '95', '98', '99',
]);
export const validEin = (s) => EIN_PREFIX.has(digits(s).slice(0, 2));

/** an NHS number is ten digits whose last is a modulus-11 check digit */
export function validNhs(s) {
  const d = digits(s);
  if (d.length !== 10) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (+d[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === +d[9];
}

/** a National Insurance prefix: neither letter D, F, I, Q, U or V, the second letter not O
 *  either, and none of the pairs never issued */
const NINO_NEVER = new Set(['BG', 'GB', 'NK', 'KN', 'TN', 'NT', 'ZZ']);
export function validNino(s) {
  const p = s.replace(/\s/g, '').slice(0, 2).toUpperCase();
  if (/[DFIQUV]/.test(p) || p[1] === 'O') return false;
  return !NINO_NEVER.has(p);
}

// ── the tables ──────────────────────────────────────────────────────────────
// Every rule opens and closes on a boundary the frozen rules respect. Bare digit runs
// (an unpunctuated SSN, NHS number or phone number) are already the frozen [number]
// rule's (\b\d{9,16}\b) before these run; the rules below are the PUNCTUATED shapes that
// rule leaves readable.
export const JURISDICTION_RULES = {
  sg: [],
  us: [
    // 123-45-6789: area not 000/666/9xx, group not 00, serial not 0000
    { re: /\b(?!000|666|9\d\d)\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g, tag: '[ssn]' },
    // 12-3456789 with an assigned prefix
    { re: /\b\d{2}-\d{7}\b/g, tag: '[ein]', valid: validEin },
    // (415) 555-0173 · 415-555-0173 · 415.555.0173 · +1 415 555 0173 — separators required
    { re: /(?:\+?1[ .-])?\(?\b[2-9]\d{2}\)?[ .-][2-9]\d{2}[ .-]\d{4}\b/g, tag: '[phone]' },
  ],
  uk: [
    // AB 12 34 56 C — the letter rules and the never-issued prefixes checked
    { re: /\b[A-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g, tag: '[nino]', valid: validNino },
    // 943 476 5919 — spaced or hyphenated, modulus-11 check digit
    { re: /\b\d{3}[ -]\d{3}[ -]\d{4}\b/g, tag: '[nhs]', valid: validNhs },
    // 07700 900123 · 07700 900 123 · +44 7700 900123 — the boundary sits before the 0,
    // never before the +: "\b\+44" is no boundary after a space (suite, 2026-09-13)
    { re: /(?:\+44[ -]?|\b0)7\d{3}[ -]?\d{3}[ -]?\d{3}\b/g, tag: '[phone]' },
  ],
};

/** the tags a practice table can write, in words, for receipts and keys */
export const PRACTICE_TAG_WORD = {
  '[ssn]': 'Social Security number',
  '[ein]': 'employer identification number',
  '[nino]': 'National Insurance number',
  '[nhs]': 'NHS number',
};
