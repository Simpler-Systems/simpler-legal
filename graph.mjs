#!/usr/bin/env node
// simpler-legal synergy graph — corpus-as-web (every case a node, relationships as typed edges).
// Legal-specific: citations are rails (MODEL_TUNING.md) — regex-extracted reporter cites, never
// judgments. Three edge types, mechanical only:
//   cites      A's text cites B's own reporter citation (direct precedent link)
//   authority  A and B cite the same outside authority (bibliographic coupling, IDF-weighted so
//              boilerplate citations — standards of review etc. — count little)
//   text       TF-IDF cosine similarity (same layer as pipeline.mjs), top-K per node
// Nothing here thinks: edges are counted, weighted, thresholded — all constants printed with the
// measured distributions that justify them.
//
// Commands:
//   node graph.mjs build     write out/graph.json + out/synergy.html, print measured stats
//
// Scope (fail-loud): edges are computed from the spike corpus text as archived, which is
// truncated ("[truncated for spike corpus]") — citation sets are lower bounds, not complete.
//
// The ranking itself lives in related.mjs, which reads no disk and keeps no state, so the app
// runs the same code over a lawyer's own documents. This file is the example library's side:
// it reads corpus/ and newcases/, builds, measures, and writes the viewer.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFacets, selftestFacets, outcomeClass } from './facets.mjs'
import {
  AUTH_MIN_W, TEXT_TOP_K, TEXT_MIN_COS, SYNERGY_TOP_N, SYNERGY_W, SYN_MODE, SYNERGY_ALLPAIRS_MAX,
  CW_CITE_RE, extractCiteRuns, extractSignals, parseDoc, prepareDocs, cosine,
  buildEdges, buildSynergy, synergyForSeeds, missingAuthorities, metrics, graphNodes, buildLibrary,
} from './related.mjs'
export { CITE_RE, extractCiteRuns, extractSignals, buildEdges, buildSynergy, synergyForSeeds, missingAuthorities } from './related.mjs'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const argv = process.argv.slice(2)
const flagVal = (name) => {
  const i = argv.indexOf(name)
  if (i >= 0) {
    const v = argv[i + 1]
    argv.splice(i, 2)
    return v
  }
  return null
}
const SET = flagVal('--set') || '.'
const DIR = (sub) => join(ROOT, SET, sub)

// ---- load: the example library from disk ----
export function loadDocs() {
  const load = (dir, kind) =>
    readdirSync(DIR(dir))
      .filter((f) => f.endsWith('.txt'))
      .map((f) => parseDoc(readFileSync(join(DIR(dir), f), 'utf8'), f, kind, { facets: 'always', warn: (m) => console.error(m) }))
  return prepareDocs([...load('corpus', 'corpus'), ...load('newcases', 'new')])
}

const pct = (x) => (100 * x).toFixed(1) + '%'

// ---- eval (PLAN_MAP6 Phase A: yardstick before tuning) ----
// Topic-based baselines carry the known day-zero ground-truth flaws (negligence misfile) —
// they are regression axes, not truth. The cross-signal axis judges the TEXT layer against
// authority coupling, which is computed independently of it.
function synergyBaselines(docs, synergy) {
  const rows = docs.map((d, i) => ({ d, top: synergy[i] }))
  const top1 = (list) => list.filter(({ d, top }) => top[0] && docs[top[0].id].topic === d.topic).length
  const news = rows.filter((r) => r.d.kind === 'new')
  const newTop5 = news.reduce((a, { d, top }) => a + top.slice(0, 5).filter((l) => docs[l.id].topic === d.topic).length, 0)
  return { newTop1: top1(news), newN: news.length, newTop5, newTop5Denom: news.length * 5, allTop1: top1(rows), allN: rows.length }
}
// Cross-signal (PMC-Patients adapted): ground truth = strong authority-coupling pairs
// (weight >= p75 of coupled pairs). Does text cosine alone rank a doc's true coupling
// partners above seeded-random? Direct held-out-cites is too sparse here (see stub below).
const COUPLING_GT_QUANTILE = 0.75
function textVsCoupling(docs, authAll) {
  const ws = [...authAll.map((p) => p.w)].sort((a, b) => a - b)
  const thr = ws[Math.floor(COUPLING_GT_QUANTILE * (ws.length - 1))]
  const rel = new Map()
  for (const { i, j, w } of authAll) {
    if (w < thr) continue
    if (!rel.has(i)) rel.set(i, new Set())
    if (!rel.has(j)) rel.set(j, new Set())
    rel.get(i).add(j)
    rel.get(j).add(i)
  }
  let seed = 12345
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const TRIALS = 20
  let mrr = 0, rec10 = 0, rmrr = 0, rrec10 = 0, nq = 0
  for (const [q, partners] of rel) {
    const ranked = docs
      .map((_, j) => j)
      .filter((j) => j !== q)
      .map((j) => [j, cosine(docs[q], docs[j])])
      .sort((a, b) => b[1] - a[1])
      .map(([j]) => j)
    const ranks = [...partners].map((p) => ranked.indexOf(p) + 1)
    mrr += 1 / Math.min(...ranks)
    rec10 += ranked.slice(0, 10).filter((j) => partners.has(j)).length / partners.size
    for (let t = 0; t < TRIALS; t++) {
      const shuf = [...ranked]
      for (let k = shuf.length - 1; k > 0; k--) {
        const r = Math.floor(rand() * (k + 1))
        ;[shuf[k], shuf[r]] = [shuf[r], shuf[k]]
      }
      rmrr += 1 / Math.min(...[...partners].map((p) => shuf.indexOf(p) + 1)) / TRIALS
      rrec10 += shuf.slice(0, 10).filter((j) => partners.has(j)).length / partners.size / TRIALS
    }
    nq++
  }
  return { thr: +thr.toFixed(2), queries: nq, mrr: +(mrr / nq).toFixed(3), rec10: +(rec10 / nq).toFixed(3), randMrr: +(rmrr / nq).toFixed(3), randRec10: +(rrec10 / nq).toFixed(3) }
}
const HELDOUT_MIN_CITES = 30
function cmdEval() {
  const docs = loadDocs()
  const { edges, authAll, cdf } = buildEdges(docs)
  console.log(`baselines by synergy mode (topic labels — regression axes, known flaws stated in PLAN_MAP6):`)
  const byMode = {}
  for (const mode of ['max', 'lift', 'sub']) {
    const bm = synergyBaselines(docs, buildSynergy(docs, cdf, mode))
    byMode[mode] = bm
    console.log(
      `  ${mode.padEnd(4)}${mode === SYN_MODE ? '*' : ' '} new-case top-1 ${bm.newTop1}/${bm.newN}  top-5 ${bm.newTop5}/${bm.newTop5Denom}   all-node top-1 ${bm.allTop1}/${bm.allN}`,
    )
  }
  const b = byMode[SYN_MODE]
  const x = textVsCoupling(docs, authAll)
  console.log(`cross-signal (text ranks strong-coupling partners; gt = coupling weight >= p${COUPLING_GT_QUANTILE * 100} = ${x.thr}, ${x.queries} query docs):`)
  console.log(`  text  MRR ${x.mrr}  recall@10 ${x.rec10}`)
  console.log(`  rand  MRR ${x.randMrr}  recall@10 ${x.randRec10}   (seeded, 20 trials/query)`)
  const nCites = edges.filter((e) => e.type === 'cites').length
  if (nCites >= HELDOUT_MIN_CITES) {
    console.log(`held-out-cites eval: ACTIVATE — ${nCites} in-corpus cites edges >= ${HELDOUT_MIN_CITES}; implement per PLAN_MAP6 Phase A before trusting this line`)
  } else {
    console.log(`held-out-cites eval: SKIPPED — ${nCites} in-corpus cites edges < ${HELDOUT_MIN_CITES} (activates on a citation-dense corpus)`)
  }
  const out = { mode: SYN_MODE, baselines: b, baselinesByMode: byMode, crossSignal: x, citesEdges: nCites }
  if (!existsSync(DIR('out'))) mkdirSync(DIR('out'), { recursive: true })
  writeFileSync(join(DIR('out'), 'graph-eval.json'), JSON.stringify(out, null, 1))
  console.log(`wrote ${join(SET, 'out', 'graph-eval.json')}`)
  return out
}

// ---- signals hand-check (PLAN_MAP6 Phase C gate) ----
// Prints a seeded 30-sample of extracted signals with source context so precision can be
// hand-verified against the text and recorded. Not a unit test — a measurement.
function cmdSignals() {
  const files = []
  for (const [dir, kind] of [['corpus', 'corpus'], ['newcases', 'new']])
    for (const f of readdirSync(DIR(dir)).filter((f) => f.endsWith('.txt'))) files.push([join(DIR(dir), f), kind])
  const hits = []
  for (const [path] of files) {
    const text = readFileSync(path, 'utf8')
    const runs = extractCiteRuns(text)
    const { sigs, treatments } = extractSignals(text, runs)
    for (let k = 0; k < runs.length; k++) {
      if (!sigs[k]) continue
      const ctx = text.slice(Math.max(0, runs[k].start - 90), runs[k].end).replace(/\s+/g, ' ')
      hits.push({ file: basename(path), cls: sigs[k].cls, token: sigs[k].token, cite: runs[k][0], ctx })
    }
    for (const t of treatments) {
      // context already covered by the 'treating' entry above; nothing extra needed here
    }
  }
  let seed = 20260722
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const sample = []
  const pool = [...hits]
  while (sample.length < Math.min(30, pool.length)) sample.push(...pool.splice(Math.floor(rand() * pool.length), 1))
  console.log(`${hits.length} signalled runs total; seeded 30-sample for hand-check:\n`)
  for (const [n, h] of sample.entries())
    console.log(`${String(n + 1).padStart(2)}. [${h.cls}:${h.token}] ${h.file} → ${h.cite}\n    …${h.ctx}\n`)
}

// ---- selftest (PLAN_MAP6 Phase E gate; fail-closed) ----
function cmdSelftest() {
  const docs = loadDocs()
  const { cdf } = buildEdges(docs)
  const lists = buildSynergy(docs, cdf)
  let n = 0
  const assert = (cond, msg) => {
    n++
    if (!cond) {
      console.error(`SELFTEST FAIL ${n}: ${msg}`)
      process.exit(1)
    }
  }
  // pseudo-matter: two same-cluster corpus docs (mechanics test, not a matter-anchoring claim)
  const c1 = docs.map((d, i) => ({ d, i })).filter((x) => x.d.cluster === 1 && x.d.kind === 'corpus')
  const seeds = [c1[0].i, c1[1].i]
  const merged = synergyForSeeds(docs, cdf, seeds)
  assert(merged.length > 0 && merged.length <= SYNERGY_TOP_N, 'merged list within top-N bound')
  assert(merged.every((e) => !seeds.includes(e.id)), 'seeds excluded from results')
  assert(merged.every((e) => seeds.includes(e.via)), 'via always points to a seed')
  assert(
    merged.every((e) => {
      const fromLists = seeds
        .flatMap((s) => lists[s].filter((x) => x.id === e.id))
        .reduce((a, x) => Math.max(a, x.score), 0)
      return Math.abs(fromLists - e.score) < 1e-9
    }),
    'each score is the max over member lists',
  )
  const sorted = merged.every((e, k) => k === 0 || merged[k - 1].score >= e.score)
  assert(sorted, 'merged list sorted by score desc')
  const single = synergyForSeeds(docs, cdf, [seeds[0]])
  assert(
    single.length === lists[seeds[0]].length && single.every((e, k) => e.id === lists[seeds[0]][k].id),
    'single-seed set reduces to that node\'s own list',
  )
  const again = synergyForSeeds(docs, cdf, seeds)
  assert(JSON.stringify(again) === JSON.stringify(merged), 'deterministic across calls')
  assert(SYNERGY_ALLPAIRS_MAX === 2000, 'E1 scale trigger constant stated')

  // The lawyer's own library (related.mjs buildLibrary, what the app runs). Three made-up
  // documents: two that rely on the same Singapore authorities and one that shares nothing.
  const MINE = [
    { id: 'a', name: 'Opinion on the charge.docx', text: 'Our view on the floating charge. In Re Lim [2019] SGCA 12 the court held the charge void; see also Tan v Ong [2013] 4 SLR 1 at [23] and Beta v Gamma [2005] 2 SLR(R) 123. The debenture was never registered.' },
    { id: 'b', name: 'Draft submissions.pdf', text: 'The unregistered debenture fails against the liquidator: Re Lim [2019] SGCA 12; Tan v Ong [2013] 4 SLR 1. English authority is to the same effect, Salomon v Salomon [1897] AC 22, and see [2015] UKSC 11.' },
    { id: 'c', name: 'Lease.txt', text: 'THIS LEASE is made between the landlord and the tenant. The tenant shall pay rent monthly and keep the premises in good repair.' },
  ]
  const lib = buildLibrary(MINE)
  const cw = extractCiteRuns(MINE[0].text + ' ' + MINE[1].text).map((r) => r[0])
  assert(
    ['[2019] SGCA 12', '[2013] 4 SLR 1', '[2005] 2 SLR(R) 123', '[1897] AC 22', '[2015] UKSC 11'].every((k) => cw.includes(k)),
    'Singapore and UK citations are read: neutral, SLR, SLR(R), AC, UKSC',
  )
  const ab = lib.nodes[0].synergy.find((l) => l.id === 1)
  assert(ab && ab.types.includes('authority') && /\[2019\] SGCA 12/.test(ab.why), 'two documents relying on the same Singapore authority are related through it')
  assert(lib.nodes[0].synergy[0]?.id === 1 && lib.nodes[1].synergy[0]?.id === 0, 'each of the pair ranks the other first, above the unrelated lease')
  assert(lib.nodes.every((n) => n.kind === 'mine' && n.topic === '' && !('outcome' in n)), 'own documents carry no topic and no outcome: facets were measured on opinions only')
  assert(lib.nodes[0].name === MINE[0].name && lib.nodes[0].file === 'a', 'a document with no header is named by its file, keyed by its id')
  // No state survives a build: a library built after the example one, or twice, is the same.
  assert(JSON.stringify(buildLibrary(MINE)) === JSON.stringify(lib), 'buildLibrary is deterministic and keeps nothing between builds')
  assert(buildLibrary([MINE[2]]).nodes[0].synergy.length === 0 && buildLibrary([]).nodes.length === 0, 'one document, or none, builds without error')
  // The Commonwealth rail finds nothing in the example library, which is why adding it left
  // the example build byte-identical. If a corpus file ever carries one, this says so.
  let cwInCorpus = 0
  for (const dir of ['corpus', 'newcases'])
    for (const f of readdirSync(DIR(dir)).filter((x) => x.endsWith('.txt')))
      cwInCorpus += [...readFileSync(join(DIR(dir), f), 'utf8').matchAll(CW_CITE_RE)].length
  assert(cwInCorpus === 0, `the Commonwealth citation rail matches nothing in the example library (${cwInCorpus} matches)`)

  // No stray control bytes in the extractor. This is not paranoia: PARTIAL_SCOPE was
  // once written through a chain of string layers that each ate a backslash, so every
  // \b arrived as a literal backspace (0x08). The regex still parsed and still ran —
  // it just matched nothing, and a judgment the court had half reversed was classified
  // as affirmed outright. A regex that silently matches nothing leaves no other trace.
  const facetSrc = readFileSync(join(ROOT, 'facets.mjs'), 'utf8')
  const ctrl = facetSrc.match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g)
  if (ctrl) console.error('SELFTEST FAIL (facets): ' + ctrl.length + ' stray control byte(s) in facets.mjs')
  assert(!ctrl, 'facets.mjs is free of stray control bytes')
  // and the exact rail that bit: partial scope must actually fire
  assert(
    outcomeClass('the judgment is affirmed-in-part and reversed-in-part', ['affirm']) === 'mixed' &&
      outcomeClass('we affirm in part and reverse in part', ['affirm']) === 'mixed' &&
      outcomeClass('we affirm the judgment of the district court', ['affirm']) === 'stands' &&
      outcomeClass('we reverse and remand', ['reverse', 'remand']) === 'disturbed' &&
      outcomeClass('we affirm.', []) === null,
    'outcome direction: stands / disturbed / mixed all reachable, and null without verbs',
  )

  // facets: the disposition guard, against the sentence shapes that broke earlier
  // builds. A regression here means a node card could state a verdict the court
  // did not reach, so it fails the build loudly rather than degrading quietly.
  const fx = selftestFacets()
  for (const f of fx.fails) console.error('SELFTEST FAIL (facets): ' + f)
  assert(fx.fails.length === 0, `facets disposition guard: ${fx.fails.length} of ${fx.total} cases wrong`)
  // and the spans on the real corpus must be verbatim, not paraphrase
  let nonVerbatim = 0
  for (const dir of ['corpus', 'newcases']) {
    for (const f of readdirSync(DIR(dir)).filter((x) => x.endsWith('.txt'))) {
      const raw = readFileSync(join(DIR(dir), f), 'utf8').replace(/\s+/g, ' ')
      const r = extractFacets(readFileSync(join(DIR(dir), f), 'utf8'))
      for (const span of [r.synopsis, r.disposition]) {
        if (span && !raw.includes(span.replace(/\s+/g, ' '))) {
          console.error(`SELFTEST FAIL (facets): ${f} emitted a span that is not in the file`)
          nonVerbatim++
        }
      }
    }
  }
  assert(nonVerbatim === 0, `every emitted facet span is a verbatim substring of its own file (${nonVerbatim} were not)`)

  console.log(`selftest PASS ${n}/${n} (seed-set mechanics on real corpus docs; matter-anchoring claims deferred per PLAN_MAP6 E2)`)
  console.log(`  facets: disposition guard ${fx.total}/${fx.total}, every emitted span verbatim across ${docs.length} files`)
}

// ---- build ----
function cmdBuild() {
  const docs = loadDocs()
  const { edges, authAll, cdf } = buildEdges(docs)
  const synergy = buildSynergy(docs, cdf)
  const missing = missingAuthorities(docs, synergy, cdf)
  const m = metrics(docs, edges)

  // measured justification printout
  const citeCounts = docs.map((d) => d.cites.size)
  console.log(`docs: ${m.nodes} (${docs.filter((d) => d.kind === 'corpus').length} corpus + ${docs.filter((d) => d.kind === 'new').length} new)`)
  console.log(
    `out-citations per doc: min ${Math.min(...citeCounts)}  median ${citeCounts.sort((a, b) => a - b)[Math.floor(citeCounts.length / 2)]}  max ${Math.max(...citeCounts)}`,
  )
  const ws = authAll.map((p) => p.w).sort((a, b) => a - b)
  const q = (p) => ws[Math.floor(p * (ws.length - 1))]?.toFixed(2)
  console.log(
    `shared-authority pairs: ${ws.length} of ${(m.nodes * (m.nodes - 1)) / 2} possible; weight p50 ${q(0.5)}  p75 ${q(0.75)}  p90 ${q(0.9)}  p99 ${q(0.99)}  (threshold ${AUTH_MIN_W})`,
  )
  console.log(`\nedges: ${m.edges} total`)
  for (const [t, s] of Object.entries(m.byType)) {
    console.log(
      `  ${t.padEnd(10)} ${String(s.count).padStart(4)}   intra-topic ${pct(s.intraTopic)} unweighted / ${pct(s.intraTopicWeighted)} weighted  (chance ${pct(m.intraChance)})`,
    )
  }
  console.log(`coverage: ${pct(m.coverage)} of nodes have >=1 edge   strength gini: ${m.gini}`)

  // signal rails (Phase C): coverage is a LOWER BOUND — corpus text is truncated
  const sigStats = { support: 0, neutral: 0, contrary: 0, treating: 0, none: 0, runs: 0 }
  for (const d of docs) {
    sigStats.runs += d.citeRuns.length
    for (const s of d.citeSignals.sigs) (s ? sigStats[s.cls]++ : sigStats.none++)
  }
  const oppEdges = edges.filter((e) => e.opp)
  console.log(
    `signal rails: ${sigStats.runs - sigStats.none}/${sigStats.runs} cite runs signalled (lower bound; truncated text) — ` +
      `support ${sigStats.support}, neutral ${sigStats.neutral}, contrary ${sigStats.contrary}, treatment ${sigStats.treating}; ` +
      `opposition edges ${oppEdges.length}/${edges.filter((e) => e.type === 'authority').length} authority`,
  )

  // measured justification for the synergy blend (commander mode)
  const top1 = synergy.map((l) => l[0]?.score || 0).sort((a, b) => a - b)
  const synCite = synergy.filter((l) => l.some((s) => s.types.includes('cites'))).length
  const synAuth = synergy.filter((l) => l.some((s) => s.types.includes('authority'))).length
  console.log(
    `synergy lists (top ${SYNERGY_TOP_N}/node, blend cites/text/authority = ${SYNERGY_W.cites}/${SYNERGY_W.text}/${SYNERGY_W.authority}, hub correction '${SYN_MODE}', normalized to corpus max): ` +
      `top-1 score median ${top1[Math.floor(top1.length / 2)].toFixed(3)} max ${top1[top1.length - 1].toFixed(3)}; ` +
      `nodes with a cites component ${synCite}/${m.nodes}, authority ${synAuth}/${m.nodes}`,
  )

  const hubs = docs
    .map((d, i) => ({ i, name: d.name, s: m.strength[i], deg: m.degree[i] }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
  console.log(`\nanchors (top strength): ${hubs.map((h) => `${h.name} (${h.s.toFixed(2)})`).join('; ')}`)

  // facets: the per-node synopsis and disposition, and — as loudly — the refusals.
  const fx = docs.map((d) => d.facets)
  const fxCount = (key) => fx.reduce((a, f) => a + (f[key] ? 1 : 0), 0)
  const tally = (key, pred) =>
    fx.reduce((a, f) => (pred(f) ? ((a[f[key]] = (a[f[key]] || 0) + 1), a) : a), {})
  const facetStats = {
    synopsis: fxCount('synopsis'),
    synopsisRefused: tally('synopsisUnavailable', (f) => !f.synopsis),
    disposition: fxCount('disposition'),
    dispositionRails: tally('dispositionRail', (f) => !!f.disposition),
    dispositionRefused: tally('dispositionUnavailable', (f) => !f.disposition),
    dispositionCorroborated: fxCount('dispositionCorroborated'),
    fromTruncatedSource: fx.reduce((a, f) => a + (f.disposition && f.sourceTruncated ? 1 : 0), 0),
  }
  console.log(
    `
facets: synopsis ${facetStats.synopsis}/${docs.length}, disposition ${facetStats.disposition}/${docs.length} ` +
      `(${facetStats.fromTruncatedSource} from truncated text, ${facetStats.dispositionCorroborated} corroborated by a second signal); ` +
      `refused ${docs.length - facetStats.disposition} — ${Object.entries(facetStats.dispositionRefused).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
  )

  const out = {
    builtAt: new Date().toISOString(),
    scope:
      `Edges computed mechanically from the ${docs.length}-doc ${SET === '.' ? 'spike corpus (truncated archival text; citation sets are lower bounds)' : `'${SET}' set (synthetic firm-internal documents — no real matters, no real persons)`}. ` +
      `cites: regex reporter citations resolving to in-corpus cases. authority: IDF-weighted shared out-citations, threshold ${AUTH_MIN_W}. ` +
      `text: TF-IDF cosine, top-${TEXT_TOP_K} per node. Topic labels are keyword-classified ground truth from the day-zero spike, not lawyer labels. ` +
      `Per-node synergy lists (commander mode): top ${SYNERGY_TOP_N} of the whole library, blend cites/text/authority = ${SYNERGY_W.cites}/${SYNERGY_W.text}/${SYNERGY_W.authority}, hub-corrected mode '${SYN_MODE}' (text/authority divided by candidate corpus-mean + global mean; cites raw), normalized to corpus max. ` +
      `synopsis and disposition are VERBATIM contiguous spans lifted from each opinion (facets.mjs) — extraction, never paraphrase, and never a model. ` +
      `A node with no disposition is a refusal, not an oversight: dispositionUnavailable names the reason. ` +
      `sourceTruncated marks a span taken from text the archive cut, where a later passage could have said more.`,
    constants: { AUTH_MIN_W, TEXT_TOP_K, TEXT_MIN_COS, SYNERGY_TOP_N, SYNERGY_W, SYN_MODE },
    metrics: {
      nodes: m.nodes, edges: m.edges, byType: m.byType, intraChance: m.intraChance,
      coverage: m.coverage, gini: m.gini,
      signals: { ...sigStats, oppositionEdges: oppEdges.length },
      facets: facetStats,
    },
    nodes: graphNodes(docs, m, synergy, missing),
    edges,
  }
  if (!existsSync(DIR('out'))) mkdirSync(DIR('out'), { recursive: true })
  writeFileSync(join(DIR('out'), 'graph.json'), JSON.stringify(out, null, 1))
  console.log(`\nwrote ${join(SET, 'out', 'graph.json')}`)

  // viewer: inject data into the template -> self-contained HTML (works from file://)
  const tplPath = join(ROOT, 'synergy-viewer.html')
  if (existsSync(tplPath)) {
    const html = readFileSync(tplPath, 'utf8').replace(
      '/*__GRAPH_DATA__*/ null',
      JSON.stringify(out),
    )
    writeFileSync(join(DIR('out'), 'synergy.html'), html)
    console.log(`wrote ${join(SET, 'out', 'synergy.html')}`)
  } else {
    console.log('synergy-viewer.html template missing — skipped HTML build')
  }
}

// run as CLI only when invoked directly (stays importable for its citation rails)
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const [cmd] = argv
  if (cmd === 'build') cmdBuild()
  else if (cmd === 'eval') cmdEval()
  else if (cmd === 'signals') cmdSignals()
  else if (cmd === 'selftest') cmdSelftest()
  else {
    console.log('usage: node graph.mjs [--set <dir>] build | eval | signals | selftest')
    process.exit(1)
  }
}
