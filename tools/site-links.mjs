#!/usr/bin/env node
// The site's own links and the sitemap, as Google reads them.
//
//   node tools/site-links.mjs        exit 1 on any finding
//
// Google Search Console wrote on 7 Oct 2026 that simpler.legal had pages "with redirect": the
// pages linked each other at it.html, research.html and index.html, and Cloudflare answers each
// with a 307 to the clean address. A 307 is temporary, so Google keeps crawling the .html
// addresses. And the sitemap's lastmod said 28 Sep for pages that changed on 29 and 30 Sep.
//
// So this holds four things:
//   1. no page, markdown twin or llms.txt links to an .html address of this site, or to /index
//      (Cloudflare redirects both; link to `it`, `research`, `./`);
//   2. every link from a page to a page lands on a page site/ has (same case: Cloudflare's paths
//      are case-sensitive even where Windows is not), and every #anchor on an id that page has;
//   3. the sitemap has exactly one row per page, at its clean address, each with a date;
//   4. no sitemap lastmod is older than the last commit that changed its page. With no git
//      history (a `git archive` cut) or a shallow one (`git clone --depth 1`, CI's default),
//      this one is skipped and says so: a shallow clone's oldest commit seems to change every file.
//      Edits not yet committed are not seen; commit, then run it.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'site');
const read = (f) => readFileSync(join(SITE, f), 'utf8');
const files = readdirSync(SITE);
const pages = files.filter((f) => f.endsWith('.html'));
const twins = files.filter((f) => f.endsWith('.md') || f === 'llms.txt');
const listed = pages.filter((f) => f !== '404.html');
const bad = [];

// A same-site href as a path from the site's root ('' for the page itself, as in "#top"),
// or null for another site, mailto: and the like.
const ORIGIN = /^https?:\/\/(www\.)?simpler\.legal(?=[/?#]|$)/i;
const local = (href) => {
  if (ORIGIN.test(href)) return href.replace(ORIGIN, '') || '/';
  return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href) ? null : href;
};
const split = (path) => {
  const [p, frag = null] = path.split('#');
  return [p.split('?')[0], frag];
};
const unclean = (p) => /\.html$/i.test(p) || /^(\.?\/)?index$/i.test(p);
const fileFor = (p, from) => {
  if (p === '') return from;
  const q = p.replace(/^\.?\//, '');
  if (q === '') return 'index.html';
  return /\.[a-z0-9]+$/i.test(q) ? q : `${q}.html`;
};
const ids = new Map();
const idsOf = (f) => {
  if (!ids.has(f)) ids.set(f, new Set([...read(f).matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1])));
  return ids.get(f);
};

for (const f of pages) {
  for (const m of read(f).matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const href = m[1] ?? m[2] ?? m[3];
    const path = local(href);
    if (path === null) continue;
    const [p, frag] = split(path);
    if (unclean(p)) { bad.push(`${f}: href="${href}" (link to the clean address)`); continue; }
    const to = fileFor(p, f);
    const there = to.includes('/') ? existsSync(join(SITE, to)) : files.includes(to);
    if (!there) { bad.push(`${f}: href="${href}" lands on no page in site/`); continue; }
    // "#top" scrolls to the top with or without an id (HTML's own rule)
    if (frag && frag !== 'top' && to.endsWith('.html') && !idsOf(to).has(decodeURIComponent(frag))) {
      bad.push(`${f}: href="${href}": ${to} has no id="${frag}"`);
    }
  }
}
for (const f of twins) {
  for (const m of read(f).matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)) {
    const path = local(m[1]);
    if (path !== null && unclean(split(path)[0])) bad.push(`${f}: (${m[1]}) (link to the clean address)`);
  }
}

// The sitemap: one dated row per page, at its clean address.
const rows = [];
const seen = new Set();
for (const m of read('sitemap.xml').matchAll(/<loc>\s*([^<\s]*)\s*<\/loc>\s*(?:<lastmod>\s*([^<\s]*)\s*<\/lastmod>)?/g)) {
  const [, loc, lastmod] = m;
  const slug = /^https:\/\/simpler\.legal\//.test(loc) ? loc.slice('https://simpler.legal/'.length) : null;
  if (slug === null) { bad.push(`sitemap.xml: ${loc} is not at https://simpler.legal/`); continue; }
  if (unclean(slug)) { bad.push(`sitemap.xml: ${loc} (list the clean address)`); continue; }
  const file = slug === '' ? 'index.html' : `${slug}.html`;
  if (!files.includes(file)) { bad.push(`sitemap.xml lists /${slug}, which site/ does not have`); continue; }
  if (seen.has(file)) { bad.push(`sitemap.xml lists /${slug} twice`); continue; }
  seen.add(file);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod ?? '')) { bad.push(`sitemap.xml /${slug}: no lastmod date`); continue; }
  rows.push([slug, file, lastmod]);
}
for (const f of listed) if (!seen.has(f)) bad.push(`sitemap.xml has no row for ${f}`);

const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const lastCommit = (file) => {
  const r = git('log', '-1', '--format=%cs', '--', `site/${file}`);
  return r.status === 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.stdout.trim()) ? r.stdout.trim() : null;
};
let dates = 'dates not compared';
if (lastCommit('index.html') === null) {
  console.log('site-links: no git history here (a git archive cut), so the lastmod dates were not compared');
} else if (git('rev-parse', '--is-shallow-repository').stdout.trim() === 'true') {
  console.log('site-links: a shallow clone (its oldest commit seems to change every file), so the lastmod dates were not compared');
} else {
  dates = 'no date older than its page\'s last commit';
  for (const [slug, file, lastmod] of rows) {
    const changed = lastCommit(file);
    if (changed && lastmod < changed) bad.push(`sitemap.xml /${slug}: lastmod ${lastmod}, but the page last changed ${changed}`);
  }
}

if (bad.length) {
  console.error(`site-links: ${bad.length} finding(s)\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`site-links: ${pages.length} pages and ${twins.length} markdown files link clean addresses; the sitemap has one dated row per page (${dates})`);
