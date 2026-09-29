#!/usr/bin/env node
// site/family.json: the same file simpler.capital publishes at /family.json.
//
//   node tools/family-json.mjs            write site/family.json
//   node tools/family-json.mjs --check    exit 1 if site/family.json is not what capital publishes
//
// The family's one source is simpler-capital/family.json, which also carries working notes and
// sites that are not live yet. Neither is public. What simpler.capital serves from it is
// publishedFamily() in its scripts/family.mjs: the live entries only, no notes, written as
// JSON.stringify(..., null, 2) plus a newline. This file calls that same function and writes it
// the same way, so every Simpler site hands out the same bytes and nothing here restates which
// fields are public. It is never a copy of the source file.
//
// Run it after the family changes and before a site cut or a deploy. `npm run verify` runs the
// --check (gate `family-json`), and skips it with the reason when simpler-capital is not beside
// this repository.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'site');
export const CAPITAL_FAMILY = join(ROOT, '..', 'simpler-capital', 'scripts', 'family.mjs');

export async function familyJson() {
  if (!existsSync(CAPITAL_FAMILY)) throw new Error(`no ${CAPITAL_FAMILY}: the family is read from simpler-capital, which is not beside this repository`);
  const { publishedFamily } = await import(pathToFileURL(CAPITAL_FAMILY).href);
  const json = JSON.stringify(publishedFamily(), null, 2) + '\n';
  if (json.includes('\r')) throw new Error('CR in family.json');
  return json;
}

// ---- CLI --------------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const json = await familyJson();
  const path = join(SITE, 'family.json');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (process.argv.includes('--check')) {
    console.log(existing === json ? 'same  family.json' : `DRIFT family.json${existing === null ? ' (missing)' : ''}: run node tools/family-json.mjs`);
    process.exit(existing === json ? 0 : 1);
  }
  if (existing === json) console.log('same  family.json');
  else { writeFileSync(path, json, 'utf8'); console.log(`wrote family.json${existing === null ? ' (new)' : ''}`); }
}
