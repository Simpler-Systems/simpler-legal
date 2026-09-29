// build-answers.mjs — the answer pages: site/<slug>.html and its markdown twin
// site/<slug>.md, both written from one source in site-src/answers/<slug>.md.
//
//   node site-src/build-answers.mjs            # write them
//   node site-src/build-answers.mjs --check    # exit 1 if a file on disk differs,
//                                              # or a page is missing from the
//                                              # sitemap or llms.txt
//
// WHY ONE SOURCE. The page a person reads and the twin an agent reads are the
// same sentences by construction, so there is nothing to hold together later.
//
// WHY IT READS THE LANDING. Each page ends with what Simpler Legal does, and
// that box may only say what the site already says. HELD lists the sentences it
// leans on; if index.html or llms.txt stops saying one, the build refuses, and
// the box is re-read before anything ships. The Organization node is copied from
// index.html's JSON-LD, which HQ's stamp keeps, so a stamp that changes it turns
// --check red until this is re-run.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'site-src', 'answers')
const SITE = join(ROOT, 'site')
const ORIGIN = 'https://simpler.legal'
const CHECK = process.argv.includes('--check')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

const die = (msg) => { console.error(`build-answers: ${msg}`); process.exit(1) }

// ── what the landing and llms.txt must still say ─────────────────────────────
const landingHtml = readFileSync(join(SITE, 'index.html'), 'utf8')
const llms = readFileSync(join(SITE, 'llms.txt'), 'utf8')
const visible = (html) => html
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&mdash;/g, '—')
  .replace(/&rsquo;|&#8217;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
const said = visible(landingHtml) + ' ' + llms.replace(/\s+/g, ' ')
const HELD = [
  'no account',
  'v0.1.0 for Windows, not code-signed',
  'It never uploads — there is nowhere to upload to.',
  'PDF, Word (.docx) and plain text',
  '[Person1]',
  'Everything found, in one table',
  'separately and only if you ask, the key that maps tags back to names',
  'Dates, amounts, business facts and most places stay on purpose',
  'by default so do company names that are not the document',
  'Tags follow spellings, not people',
  'Scanned or image-only pages need OCR, which isn',
  'Windows SmartScreen will warn',
  '3.35 GB',
]
for (const h of HELD) if (!said.includes(h)) die(`the landing no longer says "${h}" — re-read the product box against it`)

const ldMatch = landingHtml.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)
if (!ldMatch) die('no JSON-LD in site/index.html')
const ORG = JSON.parse(ldMatch[1])['@graph'].find((n) => n['@type'] === 'Organization')
if (!ORG) die('no Organization node in site/index.html')

// ── markdown, the subset the sources use ─────────────────────────────────────
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const smart = (s) => s
  .replace(/(^|[\s(\[])"/g, '$1“').replace(/"/g, '”')
  .replace(/'/g, '’')
// Same-site links go relative so they resolve on any host the site is served from.
const href = (u) => u === `${ORIGIN}/` ? './' : u.startsWith(`${ORIGIN}/`) ? u.slice(ORIGIN.length + 1) : u
// A placeholder such as [Party A], or a size such as 3.35 GB, never breaks across a line.
const words = (s) => esc(smart(s))
  .replace(/\[([A-Z][a-z]+) ([A-Z0-9]+)\]/g, '[$1&nbsp;$2]')
  .replace(/(\d) ([KMG]B)\b/g, '$1&nbsp;$2')
function inline(s) {
  return s.split(/(`[^`]+`)/).map((part) => {
    if (/^`[^`]+`$/.test(part)) return `<code>${esc(part.slice(1, -1))}</code>`
    let out = ''
    let last = 0
    // A URL may carry one level of parentheses, as the PDPC's file names do.
    for (const m of part.matchAll(/\[([^\]]+)\]\(([^()\s]+(?:\([^()\s]*\)[^()\s]*)*)\)/g)) {
      out += words(part.slice(last, m.index)) + `<a href="${esc(href(m[2]))}">${words(m[1])}</a>`
      last = m.index + m[0].length
    }
    return out + words(part.slice(last))
  }).join('')
    // Bold last, so it may wrap a link.
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
}
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function blocks(md) {
  return md.trim().split(/\n{2,}/).map((b) => {
    const lines = b.split('\n')
    if (lines[0].startsWith('## ')) return { type: 'h2', text: lines[0].slice(3) }
    if (lines.every((l) => /^\d+\. /.test(l))) return { type: 'ol', items: lines.map((l) => l.replace(/^\d+\. /, '')) }
    if (lines.every((l) => l.startsWith('- '))) return { type: 'ul', items: lines.map((l) => l.slice(2)) }
    return { type: 'p', text: lines.join(' ') }
  })
}
// The last two words of a paragraph or item stay together, so no line ends on one word.
const glue = (h) => h.replace(/ ([^ <>]*(?:<[^>]*>[^ <>]*)*)$/, '&nbsp;$1')
const render = (b) => b.type === 'p' ? `<p>${glue(inline(b.text))}</p>`
  : `<${b.type}>\n${b.items.map((i) => `  <li>${glue(inline(i))}</li>`).join('\n')}\n</${b.type}>`

// ── one page ─────────────────────────────────────────────────────────────────
const PRODUCT_H2 = 'Is there a free app that swaps the names for you?'
const SOURCES_H2 = 'Sources'
const NOTE = 'Not legal advice.'
const isNote = (b) => b.type === 'p' && b.text === NOTE

function build(file) {
  const raw = readFileSync(join(SRC, file), 'utf8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fm) die(`${file}: no front matter`)
  const meta = Object.fromEntries(fm[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]))
  const body = fm[2]
  for (const k of ['slug', 'title', 'description', 'h1', 'crumb', 'checked']) if (!meta[k]) die(`${file}: front matter lacks ${k}`)
  if (`${meta.slug}.md` !== file) die(`${file}: slug ${meta.slug} does not match the file name`)
  const [y, mo, d] = meta.checked.split('-').map(Number)
  const checkedWords = `${d} ${MONTHS[mo - 1]} ${y}`
  const url = `${ORIGIN}/${meta.slug}`

  const bs = blocks(body)
  const last = bs.pop()
  if (last.type !== 'p' || last.text !== `Sources checked on ${checkedWords}.`) die(`${file}: must end "Sources checked on ${checkedWords}."`)
  const firstH2 = bs.findIndex((b) => b.type === 'h2')
  const lead = bs.slice(0, firstH2)
  const answer = lead.filter((b) => !isNote(b))
  if (!answer.length || answer.some((b) => b.type !== 'p')) die(`${file}: the answer must be paragraphs before the first heading`)
  if (!lead.some(isNote)) die(`${file}: the answer must be followed by "${NOTE}"`)

  const sections = []
  for (const b of bs.slice(firstH2)) {
    if (b.type === 'h2') sections.push({ h2: b.text, id: slugify(b.text), body: [] })
    else sections.at(-1).body.push(b)
  }
  const product = sections.find((s) => s.h2 === PRODUCT_H2)
  if (!product) die(`${file}: no "${PRODUCT_H2}" section`)
  if (!product.body.some(isNote)) die(`${file}: the product section must close with "${NOTE}"`)
  const sources = sections.at(-1)
  if (sources.h2 !== SOURCES_H2 || sections.indexOf(product) !== sections.length - 2) die(`${file}: the sections must end with the product section, then "${SOURCES_H2}"`)

  const note = `<p class="note">${NOTE}</p>`
  const sectionHtml = (s) => s === product
    ? `<section class="product" id="${s.id}">
  <p class="kicker">Do it in Simpler Legal</p>
  <h2>${inline(s.h2)}</h2>
${s.body.filter((b) => !isNote(b)).map(render).join('\n')}
  <div class="cta">
    <a class="btn-red" href="./#download">Download for Windows</a>
    <a class="btn-plain" href="./#how">How it works</a>
  </div>
</section>
${note}`
    : `<section${s === sources ? ' class="sources"' : ''} id="${s.id}">
<h2>${inline(s.h2)}</h2>
${s.body.map(render).join('\n')}
</section>`

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      ORG,
      {
        '@type': 'Article', '@id': `${url}#article`, url, headline: meta.h1, description: meta.description,
        inLanguage: 'en', datePublished: meta.checked, dateModified: meta.checked,
        author: { '@id': ORG['@id'] }, publisher: { '@id': ORG['@id'] },
        isPartOf: { '@id': `${ORIGIN}/#website` }, about: { '@id': `${ORIGIN}/#app` },
      },
      {
        '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Simpler Legal', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: meta.crumb, item: url },
        ],
      },
    ],
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(smart(meta.title))}</title>
<!-- Written by site-src/build-answers.mjs from site-src/answers/${file}. Do not edit by hand: edit the source and re-run the build. -->
<meta name="description" content="${esc(meta.description)}" />
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
<link rel="canonical" href="${url}" />
<link rel="alternate" type="text/markdown" href="${url}.md" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${url}" />
<meta property="og:site_name" content="Simpler Legal" />
<meta property="og:title" content="${esc(smart(meta.title))}" />
<meta property="og:description" content="${esc(meta.description)}" />
<meta property="og:image" content="${ORIGIN}/assets/og-card.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${ORIGIN}/assets/og-card.png" />
<script type="application/ld+json">
${JSON.stringify(ld)}
</script>
<link rel="stylesheet" href="fonts.css" />
<style>
  /* the site's tokens, as it.html and index.html carry them */
  :root{
    color-scheme:light;
    --table:#F0E9DD; --chrome:#F7F2E9; --paper:#FFFEFA; --card:#FAF6ED;
    --hair:#E3DACA; --border:#CFC5B2; --border-strong:#8D8371; --hover:#EAE1D2;
    --ink:#37352F; --sec:#5D5951; --mut:#665F55;
    --red:#16324F; --red-hover:#0F2438; --on-red:#fff;
    --sh-card:0 1px 3px rgba(31,29,26,.05);
    --sans:'IBM Plex Sans','Segoe UI',system-ui,sans-serif;
    --serif:'IBM Plex Serif','Charter',Georgia,Cambria,serif;
    --mono:'IBM Plex Mono','Cascadia Code',Consolas,ui-monospace,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{overflow-x:clip}
  :focus-visible{outline:2px solid var(--border-strong);outline-offset:2px;border-radius:3px}
  body{background:var(--table);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.65}
  a{color:var(--ink);text-decoration:underline;text-underline-offset:2.5px;text-decoration-color:var(--border)}
  a:hover{color:var(--red);text-decoration-color:var(--red)}
  code{font-family:var(--mono);font-size:.86em;background:var(--card);border:1px solid var(--hair);border-radius:5px;padding:1px 5px;white-space:nowrap}
  .wrap{max-width:760px;margin:0 auto;padding:0 24px}

  .navbar{position:sticky;top:14px;z-index:50;display:flex;justify-content:center;padding:0 16px}
  .navpill{display:flex;align-items:center;gap:22px;background:rgba(255,253,247,.92);backdrop-filter:blur(8px);
    border:1px solid var(--hair);border-radius:999px;padding:9px 20px;box-shadow:var(--sh-card);flex-wrap:nowrap;white-space:nowrap}
  .navpill .brand{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);padding:4px;margin:-4px}
  .navpill .brand b{font-size:13.5px;font-weight:600}
  .navpill nav{display:flex;gap:18px;font-size:13px;flex-wrap:nowrap}
  .navpill nav a{color:var(--sec);text-decoration:none;padding:4px 0}
  .navpill nav a:hover{color:var(--ink)}
  @media (max-width:520px){.navpill .brand b{display:none}.navpill{gap:12px;padding:9px 16px}.navpill nav{gap:12px}}

  .head{padding:52px 0 0}
  .crumbs{font-size:13.5px;color:var(--mut);margin-bottom:14px}
  .crumbs a{color:var(--mut)}
  .head h1{font-family:var(--serif);font-size:34px;font-weight:600;line-height:1.18;letter-spacing:-.01em;text-wrap:balance}
  .answer{margin-top:22px;background:var(--paper);border:1px solid var(--hair);border-left:3px solid var(--red);
    border-radius:0 10px 10px 0;padding:18px 22px;box-shadow:var(--sh-card)}
  .answer p{font-size:18px;line-height:1.6;color:var(--ink);text-wrap:pretty}
  .answer p+p{margin-top:12px}
  .note{margin-top:12px;font-size:13.5px;color:var(--mut)}

  section{padding:40px 0 0}
  section[id]{scroll-margin-top:88px}
  section h2{font-family:var(--serif);font-size:23px;font-weight:600;line-height:1.3;letter-spacing:-.01em;margin-bottom:12px;text-wrap:balance}
  section p, section li{color:var(--sec);line-height:1.7;max-width:35em;text-wrap:pretty}
  section b{color:var(--ink);font-weight:600}
  section p+p, section ol+p, section ul+p, section p+ol, section p+ul{margin-top:14px}
  section ol, section ul{padding-left:1.4em}
  section li{margin-top:10px;padding-left:.2em}
  section li::marker{color:var(--mut)}

  .product{max-width:calc(35em + 54px);margin-top:48px;padding:26px 26px 28px;background:var(--paper);border:1px solid var(--hair);border-radius:12px;box-shadow:var(--sh-card)}
  .kicker{font-size:12.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-bottom:8px}
  .cta{display:flex;gap:12px;margin-top:22px;flex-wrap:wrap;align-items:center}
  .btn-red{display:inline-block;background:var(--red);color:var(--on-red);font-size:15px;font-weight:600;
    padding:12px 22px;border-radius:9px;text-decoration:none;box-shadow:0 1px 2px rgba(31,29,26,.18)}
  .btn-red:hover{background:var(--red-hover);color:var(--on-red)}
  .btn-plain{display:inline-block;background:var(--paper);border:1px solid var(--border);color:var(--ink);
    font-size:15px;font-weight:600;padding:11px 21px;border-radius:9px;text-decoration:none;box-shadow:var(--sh-card)}
  .btn-plain:hover{background:var(--hover);color:var(--ink)}

  .sources h2{font-size:19px}
  .sources li{font-size:14.5px;margin-top:6px}
  .checked{margin-top:20px;font-size:13.5px;color:var(--mut)}

  footer{border-top:1px solid var(--hair);background:var(--chrome);margin-top:56px;padding:22px 0 40px;color:var(--mut);font-size:13px}
  footer .row{display:flex;gap:10px 20px;flex-wrap:wrap;align-items:center}
  footer .spacer{flex:1}
  footer a{color:var(--sec);display:inline-block;padding:4px 0}

  @media (max-width:600px){
    .wrap{padding:0 16px}
    .head{padding-top:40px}
    .head h1{font-size:28px}
    .answer{padding:16px 18px}
    .answer p{font-size:17px}
    section h2{font-size:21px}
    .product{padding:22px 18px 24px}
  }

  @media (prefers-color-scheme: dark){
    :root{
      color-scheme:dark;
      --table:#232220; --chrome:#2A2826; --paper:#2F2D2A; --card:#282624;
      --hair:#3B3835; --border:#4A4641; --border-strong:#767068; --hover:#35322E;
      --ink:#E7E4DE; --sec:#B4AEA5; --mut:#9B958B;
      /* the dark scheme's light blue carries dark text: white on it would be 3:1 */
      --red:#6E96BE; --red-hover:#86A9CC; --on-red:#1F1D1A;
      --sh-card:0 1px 3px rgba(0,0,0,.35);
    }
    .navpill{background:rgba(42,40,38,.94)}
    .btn-red{box-shadow:0 1px 2px rgba(0,0,0,.4)}
  }

  @media print{
    :root{--table:#fff; --chrome:#fff; --paper:#fff; --card:#f5f2ec; --ink:#1c1a17; --sec:#3d3a34; --mut:#5c574e; --sh-card:none}
    .navbar, .cta{display:none}
    footer{background:none;margin-top:24px;padding:12px 0 0}
  }
</style>
</head>
<body>

<div class="navbar">
  <div class="navpill">
    <a class="brand" href="./"><img src="favicon.svg" alt="" width="20" height="20" style="border-radius:5px" /><b>Simpler Legal</b></a>
    <nav>
      <a href="./">Home</a>
      <a href="research">Research</a>
      <a href="./#download">Download</a>
      <a href="https://github.com/Simpler-Systems/simpler-legal">Source</a>
    </nav>
  </div>
</div>

<main class="wrap">
<article>
<div class="head">
  <p class="crumbs"><a href="./">Simpler Legal</a> / ${esc(meta.crumb)}</p>
  <h1>${inline(meta.h1)}</h1>
  <div class="answer">
${answer.map(render).join('\n')}
  </div>
  ${note}
</div>

${sections.map(sectionHtml).join('\n\n')}

<p class="checked">Sources checked on ${checkedWords}.</p>
</article>
</main>

<footer>
  <div class="wrap row">
    <span>Simpler Legal · simpler.legal/${meta.slug}</span>
    <span>© 2026 Simpler Terminal Value Systems Pte Ltd · Apache-2.0 licensed</span>
    <span class="spacer"></span>
    <a href="./">Home</a>
    <a href="research">Research</a>
    <a href="https://github.com/Simpler-Systems/simpler-legal">GitHub</a>
  </div>
</footer>

</body>
</html>
`

  // The twin: the source's own words under a header naming the page.
  const twin = `# ${meta.h1}

Source: ${url}

Page description: ${meta.description}

${body.trim()}
`

  // ── gates ──
  for (const [name, text] of [[`${meta.slug}.html`, html], [`${meta.slug}.md`, twin]]) {
    if (text.includes('\r')) die(`${name}: carries a CR`)
    if (text.includes('—') || text.includes('&mdash;')) die(`${name}: carries an em dash`)
    if (/\bundefined\b|\bNaN\b|TODO/.test(text)) die(`${name}: carries undefined, NaN or TODO`)
  }
  if ((html.match(/<h1\b/g) || []).length !== 1) die(`${meta.slug}.html: must carry exactly one h1`)
  if (meta.title.length > 60) die(`${file}: title is ${meta.title.length} characters, over 60`)
  if (meta.description.length > 160) die(`${file}: description is ${meta.description.length} characters, over 160`)
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const h = m[1]
    if (/^(https?:|mailto:)/.test(h)) continue
    const path = h.split('#')[0]
    const target = path === './' || path === '' ? 'index.html' : /\.[a-z]+$/.test(path) ? path : `${path}.html`
    const answerPage = existsSync(join(SRC, target.replace(/\.html$/, '.md')))
    if (!existsSync(join(SITE, target)) && !answerPage) die(`${meta.slug}.html: links to ${h}, which site/ does not have`)
  }

  // Every place that lists pages carries this one.
  {
    const sitemap = readFileSync(join(SITE, 'sitemap.xml'), 'utf8')
    if (!sitemap.includes(`<loc>${url}</loc><lastmod>${meta.checked}</lastmod>`)) die(`sitemap.xml lacks ${url} at lastmod ${meta.checked}`)
    if (!llms.includes(`](${url}):`)) die(`llms.txt's Pages list lacks ${url}`)
    if (!llms.includes(`](${url}.md)`)) die(`llms.txt's For agents list lacks ${url}.md`)
  }

  return [[`${meta.slug}.html`, html], [`${meta.slug}.md`, twin]]
}

const outputs = readdirSync(SRC).filter((f) => f.endsWith('.md')).sort().flatMap(build)
let stale = 0
for (const [name, text] of outputs) {
  const path = join(SITE, name)
  const onDisk = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (CHECK) {
    if (onDisk !== text) { stale++; console.error(`build-answers: site/${name} is STALE — run: node site-src/build-answers.mjs`) }
  } else if (onDisk !== text) {
    writeFileSync(path, text)
    console.log(`wrote site/${name} (${Buffer.byteLength(text)} bytes)`)
  }
}
if (CHECK && stale) process.exit(1)
console.log(`build-answers: ${outputs.length / 2} page(s), ${HELD.length} landing sentences held${CHECK ? ', every file current' : ''}`)
