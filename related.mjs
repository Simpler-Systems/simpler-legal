// related.mjs — the Related-cases core: text in, graph out. No disk, no network, no state that
// outlives a build, so the same code ranks the example library at build time (graph.mjs) and a
// lawyer's own documents inside the app (app/frontend/src/screens/Related.tsx).
//
// Legal-specific: citations are rails (MODEL_TUNING.md) — regex-extracted reporter cites, never
// judgments. Three edge types, mechanical only:
//   cites      A's text cites B's own citation (direct precedent link)
//   authority  A and B cite the same outside authority (bibliographic coupling, IDF-weighted so
//              boilerplate citations — standards of review etc. — count little)
//   text       TF-IDF cosine similarity (same layer as pipeline.mjs), top-K per node
// Nothing here thinks: edges are counted, weighted, thresholded — all constants printed with the
// measured distributions that justify them (node graph.mjs build).

import { extractFacets } from './facets.mjs'

// ---- tuning constants (justified by distributions printed at build time) ----
export const AUTH_MIN_W = 0 // keep every shared-authority pair; IDF weight (not a cutoff) carries specificity
export const TEXT_TOP_K = 3 // text-similarity neighbors kept per node
export const TEXT_MIN_COS = 0.05 // floor under top-K so isolated nodes don't get noise edges

// ---- citation rails (regex over rigid reporter formats; longest alternatives first) ----
const REPORTERS = [
  ['U\\.\\s?S\\.(?!\\s?C)', 'U.S.'],
  ['S\\.\\s?Ct\\.', 'S.Ct.'],
  ['L\\.\\s?Ed\\.\\s?2d', 'L.Ed.2d'],
  ['L\\.\\s?Ed\\.', 'L.Ed.'],
  ['F\\.\\s?Supp\\.\\s?2d', 'F.Supp.2d'],
  ['F\\.\\s?Supp\\.', 'F.Supp.'],
  ['F\\.3d', 'F.3d'],
  ['F\\.2d', 'F.2d'],
  ["Fed\\.\\s?Appx\\.", 'Fed.Appx.'],
  ['F\\.\\s?R\\.\\s?D\\.', 'F.R.D.'],
  ['B\\.\\s?R\\.', 'B.R.'],
  ['N\\.\\s?E\\.\\s?2d', 'N.E.2d'],
  ['N\\.\\s?W\\.\\s?2d', 'N.W.2d'],
  ['S\\.\\s?E\\.\\s?2d', 'S.E.2d'],
  ['S\\.\\s?W\\.\\s?[23]d', 'S.W.2d'],
  ['So\\.\\s?[23]d', 'So.2d'],
  ['P\\.\\s?[23]d', 'P.2d'],
  ['A\\.\\s?[23]d', 'A.2d'],
  ['Cal\\.\\s?Rptr\\.\\s?[23]d', 'Cal.Rptr.'],
]
export const CITE_RE = new RegExp(
  `\\b(\\d{1,4})\\s+(${REPORTERS.map(([re]) => re).join('|')})\\s+(\\d{1,5})\\b`,
  'g',
)
const canonReporter = (raw) => {
  for (const [re, canon] of REPORTERS) if (new RegExp(`^${re}$`).test(raw)) return canon
  return raw.replace(/\s+/g, '')
}
// Singapore, UK and Commonwealth forms: a bracketed year, an optional volume, a neutral-citation
// court code or a law-report series, then a number. "[2019] SGCA 12", "[2013] 4 SLR 1",
// "[2005] 2 SLR(R) 123", "[2015] UKSC 11", "[2011] EWCA Civ 1047", "[1932] AC 562". The example
// library is US federal opinions, and this rail finds nothing in it: the build is byte-identical
// with and without it. It is here for a firm's own papers, which cite these.
const CW_SERIES = [
  ['SGCA\\s?\\(I\\)', 'SGCA(I)'],
  ['SGHC\\s?\\(I\\)', 'SGHC(I)'],
  ['SGHC\\s?\\(A\\)', 'SGHC(A)'],
  ['SGHCF', 'SGHCF'],
  ['SGHCR', 'SGHCR'],
  ['SGCA', 'SGCA'],
  ['SGHC', 'SGHC'],
  ['SGDC', 'SGDC'],
  ['SGMC', 'SGMC'],
  ['SGFC', 'SGFC'],
  ['SLR\\s?\\(R\\)', 'SLR(R)'],
  ['SLR', 'SLR'],
  ['MLJ', 'MLJ'],
  ['UKSC', 'UKSC'],
  ['UKHL', 'UKHL'],
  ['UKPC', 'UKPC'],
  ['EWCA\\s+Civ', 'EWCA Civ'],
  ['EWCA\\s+Crim', 'EWCA Crim'],
  ['EWHC', 'EWHC'],
  ['All\\s+ER', 'All ER'],
  ["Lloyd['’]s\\s+Rep", "Lloyd's Rep"],
  ['WLR', 'WLR'],
  ['AC', 'AC'],
  ['QB', 'QB'],
  ['KB', 'KB'],
  ['Ch', 'Ch'],
  ['HKCFAR', 'HKCFAR'],
  ['HKCFA', 'HKCFA'],
  ['HKCA', 'HKCA'],
  ['HCA', 'HCA'],
  ['NZSC', 'NZSC'],
  ['NZCA', 'NZCA'],
]
export const CW_CITE_RE = new RegExp(
  `\\[(\\d{4})\\]\\s+(?:(\\d{1,2})\\s+)?(${CW_SERIES.map(([re]) => re).join('|')})\\s+(\\d{1,5})\\b`,
  'g',
)
const canonSeries = (raw) => {
  for (const [re, canon] of CW_SERIES) if (new RegExp(`^${re}$`).test(raw)) return canon
  return raw.replace(/\s+/g, ' ')
}
// Every citation in the text, in order, as { index, end, key }. Where the two rails overlap the
// earlier match wins.
function citeMatches(text) {
  const all = []
  for (const m of text.matchAll(CITE_RE)) all.push({ index: m.index, end: m.index + m[0].length, key: `${m[1]} ${canonReporter(m[2])} ${m[3]}` })
  for (const m of text.matchAll(CW_CITE_RE)) all.push({ index: m.index, end: m.index + m[0].length, key: `[${m[1]}] ${m[2] ? m[2] + ' ' : ''}${canonSeries(m[3])} ${m[4]}` })
  all.sort((a, b) => a.index - b.index)
  const out = []
  for (const c of all) if (!out.length || c.index >= out[out.length - 1].end) out.push(c)
  return out
}
// Raw cite occurrences plus parallel-cite grouping: "477 U.S. 242, 106 S.Ct. 2505, 91 L.Ed.2d
// 202" is ONE case cited in three reporters. Cites separated by only a comma are grouped; groups
// are merged corpus-wide by union-find so every doc counts the same case as the same authority.
export function extractCiteRuns(text) {
  const runs = []
  let cur = null
  let lastEnd = -1
  for (const m of citeMatches(text)) {
    const key = m.key
    const gap = text.slice(lastEnd, m.index)
    // parallel-cite gap: commas with optional pincites/footnote refs between reporter forms,
    // e.g. ", " or ", 322-23, " or ", 14 n.3, " — anything else (year, case name) ends the run
    if (cur && /^\s*,(?:\s*\d+(?:\s*[-–—]\s*\d+)?(?:\s*&?\s*nn?\.\s*\d+(?:\s*[-–—]\s*\d+)?)?\s*,)*\s*$/.test(gap))
      cur.push(key)
    else {
      cur = [key]
      cur.start = m.index // runs carry positions so signal rails can bound their windows
      // cert-disposition rail: "cert. denied, 522 U.S. 1061" is procedural history, not an
      // authority being relied on — flagged so downstream consumers can discount it. Allows
      // the unassigned-reporter placeholder form "cert. denied, — U.S. —, 118 S.Ct. 721".
      cur.cert = /cert\.?\s+(?:denied|granted|dismissed)[,.]?\s*(?:[—–-]+\s*U\.?\s?S\.?\s*[—–-]+,?\s*)?$/i.test(
        text.slice(Math.max(0, m.index - 45), m.index),
      )
      runs.push(cur)
    }
    cur.end = m.end
    lastEnd = cur.end
  }
  return runs
}

// ---- Bluebook signal rails (PLAN_MAP6 Phase C) ----
// Introductory signals are a formal grammar preceding the case name that precedes the cite —
// rails, not judgments. Association is bounded: signal end -> run start <= SIG_WINDOW chars
// (the case name sits in between). Treatment phrases ("overruled by X") attach NEGATIVE
// treatment to the PREVIOUS run (the treated authority); the run that follows is the treating
// case. Precision is measured on a printed hand-check sample (`node graph.mjs signals`), not
// assumed.
const SIG_WINDOW = 100
const SIG_RE = /\b(but\s+see|but\s+cf\.|contra|see\s+also|accord|compare|citing|quoting|cf\.|e\.g\.|see)(?=[\s,])/gi
const TREAT_RE = /\b(overruled|abrogated|superseded|reversed|vacated|rejected|criticized|distinguished|called\s+into\s+doubt)(?:\s+in\s+part)?\s+(?:by|in)\b/gi
const SIG_CLASS = (token) =>
  token.startsWith('but') || token === 'contra' ? 'contrary'
    : token === 'cf.' || token === 'compare' ? 'neutral'
      : 'support'
export function extractSignals(text, runs) {
  const sigs = [] // parallel to runs: {cls, token} or null; cls 'treating' marks the treating case
  const treatments = [] // {target: runIdx of treated authority, by: runIdx of treating case, token}
  for (let k = 0; k < runs.length; k++) {
    const winStart = Math.max(k > 0 ? runs[k - 1].end : 0, runs[k].start - 250)
    const win = text.slice(winStart, runs[k].start)
    let treat = null
    for (const m of win.matchAll(TREAT_RE)) treat = m
    if (treat && k > 0 && win.length - (treat.index + treat[0].length) <= SIG_WINDOW) {
      treatments.push({ target: k - 1, by: k, token: treat[1].toLowerCase() })
      sigs.push({ cls: 'treating', token: treat[1].toLowerCase() })
      continue
    }
    let last = null
    for (const m of win.matchAll(SIG_RE)) last = m
    if (last && win.length - (last.index + last[0].length) <= SIG_WINDOW) {
      const token = last[1].toLowerCase().replace(/\s+/g, ' ')
      sigs.push({ cls: SIG_CLASS(token), token })
    } else sigs.push(null)
  }
  return { sigs, treatments }
}

// ---- authorities: union-find over cite strings, one context per build ----
// It used to be module state, which is harmless in a CLI that builds once and exits, and wrong
// in an app that builds again every time a document is added: the second build would inherit
// the first one's authorities.
function newAuthorities() {
  const parent = new Map()
  const find = (x) => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)
    while (parent.get(x) !== x) {
      const n = parent.get(x)
      parent.set(x, r)
      x = n
    }
    return r
  }
  const union = (a, b) => {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    const [ra, rb] = [find(a), find(b)]
    if (ra !== rb) parent.set(ra, rb)
  }
  return {
    parent,
    find,
    union,
    rootMembers: new Map(), // root -> Set of member cite strings
    certEvents: new Map(), // root -> [certFlagged, total] across the whole library
  }
}
// display name for an authority: prefer U.S. > F.3d > F.2d > everything else
const REP_PREF = ['U.S.', 'F.3d', 'F.2d']
function displayOf(ctx, root) {
  const members = [...(ctx.rootMembers.get(root) || [root])]
  for (const rep of REP_PREF) {
    const hit = members.find((c) => c.includes(` ${rep} `))
    if (hit) return hit
  }
  return members.sort()[0]
}

// ---- TF-IDF layer (same mechanics as pipeline.mjs; duplicated because pipeline is a CLI) ----
const STOP = new Set(
  ('the a an and or but if then of to in on at by for with from as is are was were be been being ' +
    'this that these those it its he she his her they them their we you your i not no nor so such ' +
    'do does did done have has had having will would shall should can could may might must than ' +
    'there here when where which who whom what why how all any both each few more most other some ' +
    'own same too very just also into over under again further once about against between through ' +
    'during before after above below up down out off only because while until upon within without ' +
    'per said one two three patient history normal noted well see').split(/\s+/),
)
const tokenize = (text) => {
  const out = []
  for (const m of text.toLowerCase().matchAll(/[a-z][a-z']{2,}/g)) if (!STOP.has(m[0])) out.push(m[0])
  return out
}
function tfVector(tokens) {
  const c = new Map()
  for (const t of tokens) c.set(t, (c.get(t) || 0) + 1)
  return c
}
function weight(d, idf) {
  const v = new Map()
  let norm = 0
  for (const [t, c] of d.tf) {
    const w = (1 + Math.log(c)) * (idf.get(t) || 1)
    v.set(t, w)
    norm += w * w
  }
  d.vec = v
  d.norm = Math.sqrt(norm) || 1
}
export function cosine(a, b) {
  const [small, big] = a.vec.size <= b.vec.size ? [a, b] : [b, a]
  let dot = 0
  for (const [t, w] of small.vec) {
    const w2 = big.vec.get(t)
    if (w2) dot += w * w2
  }
  return dot / (a.norm * b.norm)
}
const topTerms = (a, b, n = 5) => {
  const pairs = []
  for (const [t, w] of a.vec) {
    const w2 = b.vec.get(t)
    if (w2) pairs.push([t, w * w2])
  }
  return pairs.sort((x, y) => y[1] - x[1]).slice(0, n).map(([t]) => t)
}

// ---- parse ----
// kind: 'corpus' | 'new' (the example library) | 'mine' (a document the lawyer added).
// opts.name names a document that carries no Case:/Matter: header (a lawyer's file: its
// filename). opts.facets 'always' runs the synopsis/disposition extractor on every file, as the
// example build does; otherwise it runs only on a file with a Case: header, because facets.mjs
// was measured on court opinions and a contract or a memo is not one. opts.warn receives the
// header complaints the CLI prints.
export function parseDoc(text, file, kind, opts = {}) {
  const warn = opts.warn || (() => {})
  const g = (re) => {
    const m = text.match(re)
    return m ? m[1].trim() : null
  }
  const base = String(file).split(/[\\/]/).pop()
  const caseName = g(/^Case\s*:\s*(.+)$/im)
  const matterName = g(/^Matter\s*:\s*(.+)$/im) // firm-internal docs carry Matter:/Doc: headers
  const docType = g(/^Doc\s*:\s*(.+)$/im)
  const doc = {
    file: base,
    kind,
    name: caseName || (matterName ? `${matterName}${docType ? ' · ' + docType : ''}` : opts.name || null),
    matter: matterName,
    court: g(/^Court\s*:\s*(.+)$/im),
    date: g(/^Date\s*:\s*(.+)$/im),
    ownCite: g(/^Citation\s*:\s*(.+)$/im),
    cluster: Number((base.match(/^c(\d+)-/) || [])[1] || 0),
    topic: kind === 'mine' ? '' : (base.match(/^c\d+-(.+?)-(?:m\d+-)?(?:doc\d+|new)\.txt$/) || [])[1] || '?',
    // a Commonwealth citation is counted once, as an authority — left in the text it would
    // count again as "similar language: slr, sgca"
    tf: tfVector(tokenize(text.replace(CW_CITE_RE, ' '))),
    citeRuns: extractCiteRuns(text),
  }
  doc.citeSignals = extractSignals(text, doc.citeRuns)
  // What the case is about and how it ended, extracted verbatim from this file
  // (facets.mjs). Refusals are fields too: a node with no disposition carries
  // dispositionUnavailable, and the viewer prints that instead of guessing.
  doc.facets = opts.facets === 'always' || caseName ? extractFacets(text) : null
  if (!doc.name) warn(`WARN: ${doc.file} missing Case:/Matter: header`)
  if (caseName && !doc.ownCite) warn(`WARN: ${doc.file} is a court opinion missing Citation:`)
  if (doc.ownCite) {
    const runs = extractCiteRuns(doc.ownCite)
    if (runs.length) doc.ownCiteNorm = runs[0][0]
    else warn(`WARN: ${doc.file} own citation unparseable: ${doc.ownCite}`)
  }
  return doc
}

// ---- prepare: canonicalise authorities across the library, then weight the text layer ----
export function prepareDocs(docs) {
  const ctx = newAuthorities()
  // canonicalize authorities library-wide: group parallel cites, then count per doc by root
  for (const d of docs) {
    for (const run of d.citeRuns) {
      if (!ctx.parent.has(run[0])) ctx.parent.set(run[0], run[0])
      for (let k = 1; k < run.length; k++) ctx.union(run[0], run[k])
    }
    if (d.ownCiteNorm && !ctx.parent.has(d.ownCiteNorm)) ctx.parent.set(d.ownCiteNorm, d.ownCiteNorm)
  }
  for (const key of ctx.parent.keys()) {
    const r = ctx.find(key)
    if (!ctx.rootMembers.has(r)) ctx.rootMembers.set(r, new Set())
    ctx.rootMembers.get(r).add(key)
  }
  for (const d of docs) {
    d.cites = new Map() // authority root -> citation events
    for (const run of d.citeRuns) {
      const r = ctx.find(run[0])
      d.cites.set(r, (d.cites.get(r) || 0) + 1)
      const ce = ctx.certEvents.get(r) || [0, 0]
      ce[0] += run.cert ? 1 : 0
      ce[1]++
      ctx.certEvents.set(r, ce)
    }
    if (d.ownCiteNorm) {
      d.ownRoot = ctx.find(d.ownCiteNorm)
      d.cites.delete(d.ownRoot) // never self-cite
    }
    // per-authority signal aggregation (roots only exist after library-wide union-find)
    d.sigByRoot = new Map()
    const bump = (root, cls) => {
      if (d.ownRoot === root) return
      if (!d.sigByRoot.has(root)) d.sigByRoot.set(root, { support: 0, neutral: 0, contrary: 0, negTreated: 0 })
      d.sigByRoot.get(root)[cls]++
    }
    const { sigs, treatments } = d.citeSignals
    for (let k = 0; k < d.citeRuns.length; k++) {
      const s = sigs[k]
      if (s && s.cls !== 'treating') bump(ctx.find(d.citeRuns[k][0]), s.cls)
    }
    for (const t of treatments) bump(ctx.find(d.citeRuns[t.target][0]), 'negTreated')
  }
  // token IDF for text layer
  const df = new Map()
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1)
  const idf = new Map()
  for (const [t, n] of df) idf.set(t, Math.log((docs.length + 1) / (n + 1)) + 1)
  for (const d of docs) weight(d, idf)
  // the library's authorities travel with its documents (an array property: JSON never sees it)
  docs.ctx = ctx
  return docs
}

// ---- edges ----
export function buildEdges(docs) {
  const N = docs.length
  const byCite = new Map(docs.filter((d) => d.ownRoot).map((d) => [d.ownRoot, d]))
  // citation IDF: how many docs cite a given authority (df>=1); common cites weigh little
  const cdf = new Map()
  for (const d of docs) for (const c of d.cites.keys()) cdf.set(c, (cdf.get(c) || 0) + 1)
  const cIdf = (c) => Math.log(N / (cdf.get(c) || 1))
  const show = (c) => displayOf(docs.ctx, c)

  const edges = []
  const key = (i, j) => (i < j ? `${i}|${j}` : `${j}|${i}`)
  const seen = new Map() // pair-key -> edge list index per type guard

  // 1. direct citation edges
  for (const [i, a] of docs.entries()) {
    for (const [cite, n] of a.cites) {
      const b = byCite.get(cite)
      if (!b || b === a) continue
      const j = docs.indexOf(b)
      edges.push({ s: i, t: j, type: 'cites', w: n, detail: `${a.name} cites ${show(cite)} (${n}x)` })
      seen.set(key(i, j) + '|cites', true)
    }
  }

  // 2. shared-authority edges (IDF-weighted overlap) — collect all pair weights for the
  //    distribution printout, threshold after
  const authAll = []
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const [a, b] = [docs[i], docs[j]]
      const [small, big] = a.cites.size <= b.cites.size ? [a, b] : [b, a]
      let w = 0
      const sharedList = []
      for (const c of small.cites.keys()) {
        if (big.cites.has(c)) {
          w += cIdf(c)
          sharedList.push([c, cIdf(c)])
        }
      }
      if (sharedList.length) authAll.push({ i, j, w, sharedList })
    }
  }
  // opposition (Phase C): both docs signal the same authority, one supportive, one contrary /
  // negatively treated — the shared authority is contested ground, not agreement
  const stance = (d, c) => {
    const s = d.sigByRoot.get(c)
    if (!s) return null
    const neg = s.contrary + s.negTreated
    if (s.support > 0 && neg === 0) return 'pos'
    if (neg > 0 && s.support === 0) return 'neg'
    return null // mixed or neutral-only: no stance claimed
  }
  for (const { i, j, w, sharedList } of authAll) {
    if (w < AUTH_MIN_W) continue
    const opp = sharedList
      .filter(([c]) => {
        const [sa, sb] = [stance(docs[i], c), stance(docs[j], c)]
        return (sa === 'pos' && sb === 'neg') || (sa === 'neg' && sb === 'pos')
      })
      .map(([c]) => show(c))
    const top = sharedList.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => show(c))
    const e = { s: i, t: j, type: 'authority', w: +w.toFixed(2), detail: `shared: ${top.join('; ')}` }
    if (opp.length) {
      e.opp = opp
      e.detail += ` · OPPOSITION on ${opp.join('; ')}`
    }
    edges.push(e)
  }

  // 3. text-similarity edges: top-K per node above floor, deduped
  const textPairs = new Map()
  for (let i = 0; i < N; i++) {
    const sims = []
    for (let j = 0; j < N; j++) {
      if (i === j) continue
      sims.push([j, cosine(docs[i], docs[j])])
    }
    sims.sort((a, b) => b[1] - a[1])
    for (const [j, c] of sims.slice(0, TEXT_TOP_K)) {
      if (c < TEXT_MIN_COS) break
      const k = key(i, j)
      if (!textPairs.has(k) || textPairs.get(k).w < c) {
        textPairs.set(k, { s: Math.min(i, j), t: Math.max(i, j), w: +c.toFixed(3) })
      }
    }
  }
  for (const e of textPairs.values()) {
    edges.push({ ...e, type: 'text', detail: `terms: ${topTerms(docs[e.s], docs[e.t]).join(', ')}` })
  }
  return { edges, authAll, cdf }
}

// ---- per-node synergy lists (commander mode) ----
// For EVERY node, a ranked top-N list of its most synergistic other nodes, blended across the
// whole library (NOT limited to the pruned top-K text edges). Components mirror the edge types;
// the 3/2/1 blend follows the measured intra-topic order (cites 100% > text 73.8% > authority
// 55.3%, 2026-07-21). Each component is normalized to its corpus max so the blend mixes
// comparable units.
export const SYNERGY_TOP_N = 12
export const SYNERGY_W = { cites: 3, text: 2, authority: 1 }
// Hub correction (PLAN_MAP6 Phase B, EDHREC's lift lesson): a candidate that is similar to
// EVERYTHING (an anchor / "Sol Ring") must be MORE similar to the commander than to its own
// corpus average to rank. Modes: 'max' (raw component / corpus max — the original), 'lift'
// (component / (candidate mean + global mean) — shrinkage keeps isolated docs from blowing
// up), 'sub' (component - candidate mean, floored at 0). Applied to text and authority only;
// a direct cite is never generic, so cites stays raw. Lists are asymmetric under lift/sub:
// the hub sees its partners normally, the partners see the hub penalized — intended.
// SYN_MODE default is set by the measured Phase B decision recorded in PLAN_MAP6.md.
export const SYN_MODE = 'lift'
// E1 (Ravel lesson): all-pairs is O(N²). Beyond this trigger, implement recall-then-rerank
// (cites/authority partners + top-M text via inverted index) per PLAN_MAP6 Phase E1 — the
// panel contract (top-N shown) never changes. Warn loudly; do not silently degrade.
export const SYNERGY_ALLPAIRS_MAX = 2000
// minText: a similarity floor for the text component. The example build runs without one (its
// measured lists are the record); a lawyer's own library uses TEXT_MIN_COS, the same floor the
// text edges use, because among a handful of documents two that share only a word or two ("act")
// would otherwise be listed as related.
export function buildSynergy(docs, cdf, mode = SYN_MODE, minText = 0) {
  const N = docs.length
  if (N > SYNERGY_ALLPAIRS_MAX)
    console.error(`WARN: all-pairs synergy at N=${N} > ${SYNERGY_ALLPAIRS_MAX} — implement recall-then-rerank (PLAN_MAP6 E1) before scaling further`)
  const cIdf = (c) => Math.log(N / (cdf.get(c) || 1))
  // pass 1: raw components for every unordered pair + per-node means over ALL pairs
  const pairs = []
  const meanT = new Array(N).fill(0), meanA = new Array(N).fill(0)
  let maxCite = 0
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const [a, b] = [docs[i], docs[j]]
      const t = cosine(a, b)
      // direct citation events either way (A cites B's own reporter citation, or vice versa)
      const cAB = b.ownRoot ? a.cites.get(b.ownRoot) || 0 : 0
      const cBA = a.ownRoot ? b.cites.get(a.ownRoot) || 0 : 0
      const c = cAB + cBA
      let r = 0
      const shared = []
      const [small, big] = a.cites.size <= b.cites.size ? [a, b] : [b, a]
      for (const cite of small.cites.keys()) {
        if (big.cites.has(cite)) { r += cIdf(cite); shared.push([cite, cIdf(cite)]) }
      }
      meanT[i] += t; meanT[j] += t
      meanA[i] += r; meanA[j] += r
      if (c > maxCite) maxCite = c
      const tk = t >= minText ? t : 0 // under the floor, shared words are not a reason
      if (tk > 0 || r > 0 || c > 0) pairs.push({ i, j, t: tk, r, c, cAB, cBA, shared })
    }
  }
  for (let i = 0; i < N; i++) { meanT[i] /= N - 1; meanA[i] /= N - 1 }
  const gmT = meanT.reduce((a, x) => a + x, 0) / N
  const gmA = meanA.reduce((a, x) => a + x, 0) / N
  // adjusted component of candidate `cand` as seen from the other end of the pair
  const adjT = (t, cand) =>
    mode === 'lift' ? t / (meanT[cand] + gmT) : mode === 'sub' ? Math.max(0, t - meanT[cand]) : t
  const adjA = (r, cand) =>
    mode === 'lift' ? r / (meanA[cand] + gmA) : mode === 'sub' ? Math.max(0, r - meanA[cand]) : r
  // pass 2a: corpus maxima of ADJUSTED directed components (so the blend mixes comparable units)
  let maxText = 0, maxAuth = 0
  for (const { i, j, t, r } of pairs) {
    for (const [cand] of [[i], [j]]) {
      const at = adjT(t, cand), ar = adjA(r, cand)
      if (at > maxText) maxText = at
      if (ar > maxAuth) maxAuth = ar
    }
  }
  // pass 2b: normalize, blend, keep top N per node (directed: candidate-side correction)
  const lists = docs.map(() => [])
  for (const { i, j, t, r, c, cAB, cBA, shared } of pairs) {
    const why = []
    if (cAB) why.push(`${docs[i].name} cites ${docs[j].name}${cAB > 1 ? ` (${cAB}x)` : ''}`)
    if (cBA) why.push(`${docs[j].name} cites ${docs[i].name}${cBA > 1 ? ` (${cBA}x)` : ''}`)
    if (shared.length)
      why.push(`shared: ${shared.sort((x, y) => y[1] - x[1]).slice(0, 3).map(([cite]) => displayOf(docs.ctx, cite)).join('; ')}`)
    if (t > 0) why.push(`terms: ${topTerms(docs[i], docs[j], 3).join(', ')}`)
    const whyStr = why.join(' · ')
    for (const [holder, cand] of [[i, j], [j, i]]) {
      const comps = [
        ['cites', SYNERGY_W.cites * (maxCite ? c / maxCite : 0)],
        ['text', SYNERGY_W.text * (maxText ? adjT(t, cand) / maxText : 0)],
        ['authority', SYNERGY_W.authority * (maxAuth ? adjA(r, cand) / maxAuth : 0)],
      ].filter(([, w]) => w > 0).sort((x, y) => y[1] - x[1])
      const score = +comps.reduce((acc, [, w]) => acc + w, 0).toFixed(3)
      if (score <= 0) continue
      lists[holder].push({ id: cand, score, why: whyStr, types: comps.map(([n]) => n) })
    }
  }
  for (const l of lists) {
    l.sort((a, b) => b.score - a.score)
    l.length = Math.min(l.length, SYNERGY_TOP_N)
  }
  return lists
}

// ---- seed-set synergy (PLAN_MAP6 Phase E2, matter-as-commander) ----
// A real matter is multiple documents; the commander becomes a SEED SET. Blend: max score per
// candidate across members' lists, seeds excluded, `via` records which member carried it.
// SCOPE: merged from members' already-truncated top-N lists — an approximation, not a full
// set-vs-corpus recompute. Measured claims about matter-anchoring wait for the private-matter
// corpus shape (next-move 3); this is the mechanics, selftested on real corpus docs.
export function synergyForSeeds(docs, cdf, seedIds, mode = SYN_MODE) {
  const lists = buildSynergy(docs, cdf, mode)
  const seeds = new Set(seedIds)
  const best = new Map()
  for (const s of seedIds) {
    for (const e of lists[s] || []) {
      if (seeds.has(e.id)) continue
      if (!best.has(e.id) || best.get(e.id).score < e.score) best.set(e.id, { ...e, via: s })
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, SYNERGY_TOP_N)
}

// ---- missing authorities (PLAN_MAP6 Phase D2, the CARA lesson) ----
// For each node: high-IDF authorities cited by >=2 of its top-N synergy neighbors that the
// node itself does NOT cite — "authorities to check", scored n×IDF. Computed mechanically
// from data already extracted; truncated text makes these suggestions lower bounds too.
const MISSING_MIN_NEIGHBORS = 2
const MISSING_TOP = 5
export function missingAuthorities(docs, synergy, cdf) {
  const N = docs.length
  const cIdf = (c) => Math.log(N / (cdf.get(c) || 1))
  return docs.map((d, i) => {
    const counts = new Map()
    const citedBy = new Map() // authority -> node ids of the synergy neighbors relying on it
    for (const l of synergy[i]) {
      for (const c of docs[l.id].cites.keys()) {
        if (d.cites.has(c) || d.ownRoot === c) continue
        const ce = docs.ctx.certEvents.get(c)
        if (ce && ce[0] === ce[1]) continue // cert-disposition-only corpus-wide: procedural noise
        counts.set(c, (counts.get(c) || 0) + 1)
        if (!citedBy.has(c)) citedBy.set(c, [])
        citedBy.get(c).push(l.id)
      }
    }
    return [...counts]
      .filter(([, n]) => n >= MISSING_MIN_NEIGHBORS)
      .map(([c, n]) => ({ name: displayOf(docs.ctx, c), n, idf: +cIdf(c).toFixed(2), score: n * cIdf(c), by: citedBy.get(c) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MISSING_TOP)
      .map(({ name, n, idf, by }) => ({ name, n, idf, by }))
  })
}

// ---- metrics ----
function gini(values) {
  const v = [...values].sort((a, b) => a - b)
  const n = v.length
  const sum = v.reduce((a, x) => a + x, 0)
  if (!n || !sum) return 0
  let cum = 0
  for (let i = 0; i < n; i++) cum += (2 * (i + 1) - n - 1) * v[i]
  return cum / (n * sum)
}
export function metrics(docs, edges) {
  const N = docs.length
  const byType = {}
  for (const e of edges) (byType[e.type] ??= []).push(e)
  // normalize weights per type so node strength mixes comparable units
  const strength = new Array(N).fill(0)
  const degree = new Array(N).fill(0)
  for (const type of Object.keys(byType)) {
    const max = Math.max(...byType[type].map((e) => e.w))
    for (const e of byType[type]) {
      const w = e.w / max
      strength[e.s] += w
      strength[e.t] += w
      degree[e.s]++
      degree[e.t]++
    }
  }
  const intra = (list) => list.filter((e) => docs[e.s].cluster === docs[e.t].cluster).length / (list.length || 1)
  const intraW = (list) => {
    const tot = list.reduce((a, e) => a + e.w, 0)
    return tot ? list.filter((e) => docs[e.s].cluster === docs[e.t].cluster).reduce((a, e) => a + e.w, 0) / tot : 0
  }
  // chance baseline: probability a random pair shares a cluster
  const sizes = new Map()
  for (const d of docs) sizes.set(d.cluster, (sizes.get(d.cluster) || 0) + 1)
  const samePairs = [...sizes.values()].reduce((a, n) => a + (n * (n - 1)) / 2, 0)
  const chance = N > 1 ? samePairs / ((N * (N - 1)) / 2) : 0
  return {
    nodes: N,
    edges: edges.length,
    byType: Object.fromEntries(
      Object.entries(byType).map(([t, l]) => [
        t,
        { count: l.length, intraTopic: +intra(l).toFixed(3), intraTopicWeighted: +intraW(l).toFixed(3) },
      ]),
    ),
    intraChance: +chance.toFixed(3),
    coverage: N ? +(degree.filter((d) => d > 0).length / N).toFixed(3) : 0,
    gini: +gini(strength).toFixed(3),
    strength,
    degree,
  }
}

// ---- the viewer's data ----
// One shape for both libraries, so synergy-viewer.html has one reader. `extra` carries what only
// the example build prints (scope, measured metrics).
export function graphNodes(docs, m, synergy, missing) {
  return docs.map((d, i) => ({
    id: i, file: d.file, name: d.name, matter: d.matter, court: d.court, date: d.date,
    cite: d.ownCite, cluster: d.cluster, topic: d.topic, kind: d.kind, outCites: d.cites.size,
    strength: +m.strength[i].toFixed(3), degree: m.degree[i],
    synergy: synergy[i], missing: missing[i],
    ...d.facets,
  }))
}

// The lawyer's own library, built inside the app from the documents added this session:
// inputs = [{ id, name, text }]. Each document is ranked against the others and nothing else —
// the example library is not mixed in. Nothing is read from disk and nothing is kept: the
// graph lives as long as the screen that asked for it.
export function buildLibrary(inputs) {
  const docs = prepareDocs(inputs.map((x) => parseDoc(x.text || '', x.id, 'mine', { name: x.name })))
  const { edges, cdf } = buildEdges(docs)
  const synergy = docs.length > 1 ? buildSynergy(docs, cdf, SYN_MODE, TEXT_MIN_COS) : docs.map(() => [])
  const missing = missingAuthorities(docs, synergy, cdf)
  const m = metrics(docs, edges)
  return {
    library: 'mine',
    scope:
      `Every document you added this session, ranked against the others on this machine. ` +
      `Citations are read in US reporter form and in Singapore, UK and Commonwealth neutral and law-report form ` +
      `(for example [2019] SGCA 12, [2013] 4 SLR 1, [2015] UKSC 11); a citation in any other form counts only through its words.`,
    constants: { AUTH_MIN_W, TEXT_TOP_K, TEXT_MIN_COS, SYNERGY_TOP_N, SYNERGY_W, SYN_MODE },
    metrics: { nodes: m.nodes, edges: m.edges, byType: m.byType, coverage: m.coverage, gini: m.gini },
    nodes: graphNodes(docs, m, synergy, missing),
    edges,
  }
}
