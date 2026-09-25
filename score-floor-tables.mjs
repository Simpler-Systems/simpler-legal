// score-floor-tables.mjs — the practice tables (app/frontend/src/lib/floorTables.mjs)
// measured over TAB, the 1,268 hand-annotated ECtHR judgments in raw/tab/ (rebuild:
// node build-pii-bench.mjs). For every rule of every practice table: how often it fires on
// real legal prose, how much of that lands on a gold mention (any annotator, any category),
// and what the rest looks like — the false-positive rate on 1.2 M words of court text.
// TAB has no Social Security or NHS numbers to find, so recall is not measured here; what
// is measured is what each rule would take out of a judgment that is not its target.
//
// The frozen table runs first in the app, so a nominee that overlaps a frozen-rule match
// is counted apart: the app never sees it.
//
//   node score-floor-tables.mjs            → pii-bench/floor-tables-tab.json + a table on stdout
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { JURISDICTION_RULES, PRACTICES } from './app/frontend/src/lib/floorTables.mjs';
import { FLOOR_RULES } from './lib-core/anonymize.mjs';

const splits = ['train', 'dev', 'test'].map((s) => `raw/tab/echr_${s}.json`);
if (!splits.every(existsSync)) { console.error('raw/tab/echr_{train,dev,test}.json missing — run node build-pii-bench.mjs first'); process.exit(2); }
const docs = splits.flatMap((p) => JSON.parse(readFileSync(p, 'utf8')));
const words = docs.reduce((a, d) => a + d.text.split(/\s+/).length, 0);

const overlaps = (s, e, spans) => spans.some(([a, b]) => s < b && e > a);
const ctx = (t, s, e) => `${t.slice(Math.max(0, s - 30), s).replace(/\s+/g, ' ')}«${t.slice(s, e)}»${t.slice(e, e + 30).replace(/\s+/g, ' ')}`;
const result = { source: 'TAB (NorskRegnesentral/text-anonymization-benchmark), raw/tab/', docs: docs.length, words, measuredAt: new Date().toISOString(), practices: {} };

for (const p of PRACTICES) {
  const rules = JURISDICTION_RULES[p.id];
  if (!rules.length) continue;
  const out = (result.practices[p.id] = { label: p.label, rules: [] });
  for (const rule of rules) {
    const rec = { tag: rule.tag, re: rule.re.source, nominated: 0, rejectedByCheck: 0, matches: 0, onGold: 0, goldTypes: {}, offGold: 0, underFrozen: 0, docsHit: 0, samplesOffGold: [] };
    for (const d of docs) {
      const text = d.text;
      const gold = [];
      const goldType = new Map();
      for (const ann of Object.values(d.annotations)) for (const m of ann.entity_mentions) { gold.push([m.start_offset, m.end_offset]); goldType.set(`${m.start_offset}-${m.end_offset}`, m.entity_type); }
      const frozen = [];
      for (const [re] of FLOOR_RULES) for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) frozen.push([m.index, m.index + m[0].length]);
      let hit = false;
      for (const m of text.matchAll(new RegExp(rule.re.source, rule.re.flags))) {
        rec.nominated++;
        if (rule.valid && !rule.valid(m[0])) { rec.rejectedByCheck++; continue; }
        rec.matches++;
        hit = true;
        const s = m.index, e = s + m[0].length;
        if (overlaps(s, e, frozen)) rec.underFrozen++;
        if (overlaps(s, e, gold)) {
          rec.onGold++;
          const g = gold.find(([a, b]) => s < b && e > a);
          const t = goldType.get(`${g[0]}-${g[1]}`) || '?';
          rec.goldTypes[t] = (rec.goldTypes[t] || 0) + 1;
        } else {
          rec.offGold++;
          if (rec.samplesOffGold.length < 8) rec.samplesOffGold.push(`${d.doc_id}: ${ctx(text, s, e)}`);
        }
      }
      if (hit) rec.docsHit++;
    }
    out.rules.push(rec);
  }
}

writeFileSync('pii-bench/floor-tables-tab.json', JSON.stringify(result, null, 1));
console.log(`TAB: ${docs.length} judgments, ${words.toLocaleString()} words`);
console.log('practice  tag       nominated  rejected-by-check  matches  on-gold  off-gold  under-frozen  docs-hit');
for (const [id, p] of Object.entries(result.practices)) {
  for (const r of p.rules) {
    console.log(`${id.padEnd(9)} ${r.tag.padEnd(9)} ${String(r.nominated).padStart(9)}  ${String(r.rejectedByCheck).padStart(17)}  ${String(r.matches).padStart(7)}  ${String(r.onGold).padStart(7)}  ${String(r.offGold).padStart(8)}  ${String(r.underFrozen).padStart(12)}  ${String(r.docsHit).padStart(8)}   gold types ${JSON.stringify(r.goldTypes)}`);
    for (const s of r.samplesOffGold.slice(0, 4)) console.log(`            off-gold: ${s}`);
  }
}
console.log('written: pii-bench/floor-tables-tab.json');
