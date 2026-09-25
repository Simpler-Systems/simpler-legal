// The practice tables' suite (lib/floorTables.mjs + engine.ts remask). Run from app/frontend:
//   node test/floor-tables.mjs
// It bundles src/lib/engine.ts with esbuild (a vite dependency, already installed) into a
// temp file and drives remask() the way the app does — the b2-remask shape: every claim
// is a check that prints PASS or FAIL, the invariants are the export's own (placements +
// floor hits rebuild the bytes; tags in the bytes = placements + non-exempt hits;
// maskedCount says the same number), and the practice pass may never leave readable a
// token the frozen table hid. Exit 1 on any FAIL.
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const dir = mkdtempSync(join(tmpdir(), 'floor-tables-'));
const bundle = join(dir, 'engine.mjs');
await build({ entryPoints: [join(here, '..', 'src', 'lib', 'engine.ts')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' });

// the engine bundle touches window/localStorage on import (tauri.ts inTauri, the settings)
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { remask, maskedCount, syncFloorRows, isFloorRow, FLOOR_WORD, floorTablesLabel } = await import('file:///' + bundle.replace(/\\/g, '/'));
const { validNhs, validNino, validEin } = await import('../src/lib/floorTables.mjs');

let pass = 0, fail = 0;
const check = (ok, what, detail = '') => { console.log((ok ? '  PASS  ' : '  FAIL  ') + what + (detail ? '\n          ' + detail : '')); ok ? pass++ : fail++; };
const TAG_RE = /\[[A-Za-z]+-?\d+\]|\[(?:email|nric|card|phone|number|ssn|ein|nino|nhs)\]/g;
const tagsIn = (s) => (s.match(TAG_RE) ?? []).length;
const floorTags = (r) => r.floorHits.filter((h) => !h.exempt).length;
const rebuild = (text, r) => {
  const spans = [...r.placements, ...r.floorHits.filter((h) => !h.exempt)].sort((a, b) => a.s - b.s);
  let out = '', pos = 0;
  for (const sp of spans) { if (sp.s < pos) return null; out += text.slice(pos, sp.s) + sp.tag; pos = sp.e; }
  return out + text.slice(pos);
};
const tokens = (s) => { const m = new Map(); for (const t of s.replace(TAG_RE, ' ').match(/[\p{L}\p{N}]+/gu) ?? []) m.set(t, (m.get(t) ?? 0) + 1); return m; };
/** a token readable in `b` that `a` hid — null when none */
const neverLessMasked = (a, b) => { const o = tokens(a); for (const [t, n] of tokens(b)) if ((o.get(t) ?? 0) < n) return t; return null; };
const row = (key, text, tag, cat = 'person') => ({ key, text, tag, cat, prov: 'both passes', occ: 1, status: 'confirmed' });
/** every invariant one remask result must satisfy */
const invariants = (label, text, entities, practice) => {
  const r = remask(text, entities, practice);
  check(r.divergence === null, `${label}: no divergence`, r.divergence ?? '');
  if (r.divergence) return r;
  check(r.practice === practice, `${label}: result names its practice (${r.practice})`);
  check(rebuild(text, r) === r.text, `${label}: placements + floor hits rebuild the bytes`);
  check(tagsIn(r.text) === r.placements.length + floorTags(r), `${label}: tags in bytes (${tagsIn(r.text)}) = placements (${r.placements.length}) + floor tags (${floorTags(r)})`);
  check(maskedCount(text, entities, practice) === tagsIn(r.text), `${label}: maskedCount agrees with the bytes`);
  return r;
};

console.log('— validators —');
check(validNhs('943 476 5919'), 'NHS: 943 476 5919 passes the modulus-11 check');
check(!validNhs('943 476 5918'), 'NHS: 943 476 5918 fails it (check digit off by one)');
check(!validNhs('123 456 7890'), 'NHS: 123 456 7890 fails it');
check(validNino('QQ 12 34 56 C') === false, 'NINO: QQ prefix is not issued (Q is never a first letter)');
check(validNino('AB 12 34 56 C'), 'NINO: AB 12 34 56 C is a valid shape');
check(!validNino('BG123456A') && !validNino('NT 12 34 56 A'), 'NINO: BG and NT are never issued');
check(!validNino('AO 12 34 56 A'), 'NINO: O is never a second letter');
check(validEin('12-3456789') && !validEin('07-1234567') && !validEin('89-1234567'), 'EIN: prefix 12 assigned, 07 and 89 not');

console.log('\n— the tables, one document each —');
const US = `Employee Jane Roe, SSN 123-45-6789, phone (415) 555-0173 or 415.555.0173, employer Acme Corp EIN 12-3456789.
Invalid shapes stay readable: 000-12-3456, 666-12-3456, 900-12-3456, 123-00-3456, 123-45-0000, 07-1234567, and a plain 4155550173 is the frozen table's.
Singapore stays first: +65 6438 2210 and S1234567A.`;
const UK = `Patient NHS number 943 476 5919 (not 943 476 5918), NI number AB 12 34 56 C and QQ 12 34 56 C, mobile 07700 900123 or +44 7700 900 123, and bare 07700900123.
Singapore stays first: +65 6438 2210 and S1234567A.`;
const ents = [row('roe', 'Jane Roe', '[PERSON-1]'), row('acme', 'Acme Corp', '[COMPANY-1]', 'org')];
{
  const sg = invariants('us text, sg practice', US, ents, 'sg');
  const us = invariants('us text, us practice', US, ents, 'us');
  check(!/\[ssn\]|\[ein\]/.test(sg.text), 'sg: no practice tag in the output');
  check(/SSN \[ssn\]/.test(us.text), 'us: the SSN is [ssn]', us.text.split('\n')[0]);
  check(/EIN \[ein\]/.test(us.text), 'us: the EIN is [ein]');
  check(/phone \[phone\] or \[phone\]/.test(us.text), 'us: both punctuated phone shapes are [phone]');
  check(/000-12-3456, 666-12-3456, 900-12-3456, 123-00-3456, 123-45-0000, 07-1234567/.test(us.text), 'us: the invalid SSN/EIN shapes stay readable');
  check(/plain \[number\] is/.test(us.text), 'us: the bare 10-digit run is the frozen [number]');
  // the frozen phone rule takes the +65 with the number: "first: [phone] and [nric]."
  check(/first: \[phone\] and \[nric\]\./.test(us.text) && /first: \[phone\] and \[nric\]\./.test(sg.text), 'us: the frozen Singapore rules ran first, unchanged', us.text.split('\n')[2]);
  check(neverLessMasked(sg.text, us.text) === null, 'us: no token readable that the frozen table hid');
  check(us.floorHits.filter((h) => h.tag === '[ssn]').length === 1 && us.floorHits.filter((h) => h.tag === '[ein]').length === 1, 'us: one [ssn] hit, one [ein] hit');
}
{
  const sg = invariants('uk text, sg practice', UK, ents, 'sg');
  const uk = invariants('uk text, uk practice', UK, ents, 'uk');
  check(/number \[nhs\] \(not 943 476 5918\)/.test(uk.text), 'uk: the NHS number is [nhs], the one that fails its check digit stays', uk.text.split('\n')[0]);
  check(/NI number \[nino\] and QQ 12 34 56 C/.test(uk.text), 'uk: the NI number is [nino], the unissued prefix stays');
  check(/mobile \[phone\] or \[phone\], and bare \[number\]/.test(uk.text), 'uk: both spaced mobiles are [phone]; the bare run is the frozen [number]');
  check(neverLessMasked(sg.text, uk.text) === null, 'uk: no token readable that the frozen table hid');
  check(floorTablesLabel('uk') === 'the frozen table (Singapore), then the United Kingdom table' && floorTablesLabel('sg') === 'the frozen table (Singapore)', 'receipt label names the tables that ran');
}
{
  // the setting is what remask reads when no practice is passed
  store.set('simpler-legal.practice', 'uk');
  const r = remask(UK, ents);
  check(r.practice === 'uk' && /\[nhs\]/.test(r.text), 'default practice comes from the setting (uk)');
  store.set('simpler-legal.practice', 'nonsense');
  check(remask(UK, ents).practice === 'sg', 'an unknown stored value falls back to sg');
  store.delete('simpler-legal.practice');
  check(remask(UK, ents).practice === 'sg', 'no setting → sg');
}

console.log('\n— rows and exemptions —');
{
  const s1 = syncFloorRows(US, ents, 'us');
  const synced = syncFloorRows(US, s1, 'us');
  check(synced === s1, 'sync: idempotent');
  const kinds = s1.filter(isFloorRow).map((e) => e.tag).sort();
  check(kinds.includes('[ssn]') && kinds.includes('[ein]') && kinds.includes('[phone]') && kinds.includes('[nric]') && kinds.includes('[number]'), `sync: floor rows for every kind that fired (${kinds.join(' ')})`);
  check(s1.filter(isFloorRow).every((e) => FLOOR_WORD[e.tag]), 'every floor row has a word for the receipt');
  const dead = s1.map((e) => (e.tag === '[ssn]' && isFloorRow(e) ? { ...e, dead: true, status: 'ignored' } : e));
  const r = invariants('us, SSN row switched off', US, dead, 'us');
  check(/SSN 123-45-6789/.test(r.text) && r.floorHits.some((h) => h.tag === '[ssn]' && h.exempt), 'a dead [ssn] row is an exemption: the SSN stays readable and the hit is marked exempt');
}

console.log('\n— fuzz: random documents × practices —');
{
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const words = ['the', 'client', 'Jane', 'Roe', 'signed', 'on', 'Acme', 'Corp', 'ref', 'x', '12', 'A1', '2024', 'and', 'Ltd', 'S1234567A', '+65', '6438', '2210', '4155550173', '123-45-6789', '12-3456789', '(415)', '555-0173', '943', '476', '5919', 'AB', '12', '34', '56', 'C', '07700', '900123', '+44', '7700', 'a@b.co', '4111', '1111', '1111', '1111', 'nhs:', 'ssn:', '-', '.', ',', '\n'];
  let n = 0, bad = 0, less = 0, div = 0;
  for (let i = 0; i < 1500; i++) {
    const text = Array.from({ length: 5 + Math.floor(rnd() * 40) }, () => pick(words)).join(pick([' ', ' ', ' ', '  ', '\n']));
    const es = rnd() < 0.7 ? ents : [];
    const base = remask(text, es, 'sg');
    for (const p of ['us', 'uk']) {
      n++;
      const r = remask(text, es, p);
      if (r.divergence) { div++; continue; }
      if (rebuild(text, r) !== r.text || tagsIn(r.text) !== r.placements.length + floorTags(r)) { bad++; if (bad < 4) console.log('     bad:', JSON.stringify(text), JSON.stringify(r.text)); }
      if (!base.divergence && neverLessMasked(base.text, r.text)) { less++; if (less < 4) console.log('     less masked:', JSON.stringify(base.text), JSON.stringify(r.text)); }
    }
  }
  check(div === 0, `fuzz: ${n} runs, ${div} divergences`);
  check(bad === 0, `fuzz: ${bad} accounting failures (rebuild / tag count)`);
  check(less === 0, `fuzz: ${less} runs where a practice table left readable a token the frozen table hid`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
