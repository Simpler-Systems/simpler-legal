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

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFacets, selftestFacets, outcomeClass } from './facets.mjs'

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

// ---- tuning constants (justified by distributions printed at build time) ----
const AUTH_MIN_W = 0 // keep every shared-authority pair; IDF weight (not a cutoff) carries specificity
const TEXT_TOP_K = 3 // text-similarity neighbors kept per node
const TEXT_MIN_COS = 0.05 // floor under top-K so isolated nodes don't get noise edges

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
// Raw cite occurrences plus parallel-cite grouping: "477 U.S. 242, 106 S.Ct. 2505, 91 L.Ed.2d
// 202" is ONE case cited in three reporters. Cites separated by only a comma are grouped; groups
// are merged corpus-wide by union-find so every doc counts the same case as the same authority.
export function extractCiteRuns(text) {
  const runs = []
  let cur = null
  let lastEnd = -1
  for (const m of text.matchAll(CITE_RE)) {
    const key = `${m[1]} ${canonReporter(m[2])} ${m[3]}`
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
    cur.end = m.index + m[0].length
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

// union-find over cite strings
const ufParent = new Map()
const ufFind = (x) => {
  let r = x
  while (ufParent.get(r) !== r) r = ufParent.get(r)
  while (ufParent.get(x) !== x) {
    const n = ufParent.get(x)
    ufParent.set(x, r)
    x = n
  }
  return r
}
const ufUnion = (a, b) => {
  if (!ufParent.has(a)) ufParent.set(a, a)
  if (!ufParent.has(b)) ufParent.set(b, b)
  const [ra, rb] = [ufFind(a), ufFind(b)]
  if (ra !== rb) ufParent.set(ra, rb)
}
// display name for an authority: prefer U.S. > F.3d > F.2d > everything else
const REP_PREF = ['U.S.', 'F.3d', 'F.2d']
const rootMembers = new Map() // root -> Set of member cite strings
const certEvents = new Map() // root -> [certFlagged, total] across the whole corpus
function registerRuns(runs) {
  for (const run of runs) {
    if (!ufParent.has(run[0])) ufParent.set(run[0], run[0])
    for (let k = 1; k < run.length; k++) ufUnion(run[0], run[k])
  }
}
function displayOf(root) {
  const members = [...(rootMembers.get(root) || [root])]
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
function cosine(a, b) {
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

// ---- load ----
function parseDoc(text, file, kind) {
  const g = (re) => {
    const m = text.match(re)
    return m ? m[1].trim() : null
  }
  const caseName = g(/^Case\s*:\s*(.+)$/im)
  const matterName = g(/^Matter\s*:\s*(.+)$/im) // firm-internal docs carry Matter:/Doc: headers
  const docType = g(/^Doc\s*:\s*(.+)$/im)
  const doc = {
    file: basename(file),
    kind, // 'corpus' | 'new'
    name: caseName || (matterName ? `${matterName}${docType ? ' · ' + docType : ''}` : null),
    matter: matterName,
    court: g(/^Court\s*:\s*(.+)$/im),
    date: g(/^Date\s*:\s*(.+)$/im),
    ownCite: g(/^Citation\s*:\s*(.+)$/im),
    cluster: Number((basename(file).match(/^c(\d+)-/) || [])[1] || 0),
    topic: (basename(file).match(/^c\d+-(.+?)-(?:m\d+-)?(?:doc\d+|new)\.txt$/) || [])[1] || '?',
    tf: tfVector(tokenize(text)),
    citeRuns: extractCiteRuns(text),
  }
  doc.citeSignals = extractSignals(text, doc.citeRuns)
  // What the case is about and how it ended, extracted verbatim from this file
  // (facets.mjs). Refusals are fields too: a node with no disposition carries
  // dispositionUnavailable, and the viewer prints that instead of guessing.
  doc.facets = extractFacets(text)
  if (!doc.name) console.error(`WARN: ${doc.file} missing Case:/Matter: header`)
  if (caseName && !doc.ownCite) console.error(`WARN: ${doc.file} is a court opinion missing Citation:`)
  if (doc.ownCite) {
    const m = doc.ownCite.match(CITE_RE)
    if (m) {
      const runs = extractCiteRuns(doc.ownCite)
      doc.ownCiteNorm = runs[0][0]
    } else console.error(`WARN: ${doc.file} own citation unparseable: ${doc.ownCite}`)
  }
  return doc
}
export function loadDocs() {
  const load = (dir, kind) =>
    readdirSync(DIR(dir))
      .filter((f) => f.endsWith('.txt'))
      .map((f) => parseDoc(readFileSync(join(DIR(dir), f), 'utf8'), f, kind))
  const docs = [...load('corpus', 'corpus'), ...load('newcases', 'new')]
  // canonicalize authorities corpus-wide: group parallel cites, then count per doc by root
  for (const d of docs) {
    registerRuns(d.citeRuns)
    if (d.ownCiteNorm && !ufParent.has(d.ownCiteNorm)) ufParent.set(d.ownCiteNorm, d.ownCiteNorm)
  }
  for (const key of ufParent.keys()) {
    const r = ufFind(key)
    if (!rootMembers.has(r)) rootMembers.set(r, new Set())
    rootMembers.get(r).add(key)
  }
  for (const d of docs) {
    d.cites = new Map() // authority root -> citation events
    for (const run of d.citeRuns) {
      const r = ufFind(run[0])
      d.cites.set(r, (d.cites.get(r) || 0) + 1)
      const ce = certEvents.get(r) || [0, 0]
      ce[0] += run.cert ? 1 : 0
      ce[1]++
      certEvents.set(r, ce)
    }
    if (d.ownCiteNorm) {
      d.ownRoot = ufFind(d.ownCiteNorm)
      d.cites.delete(d.ownRoot) // never self-cite
    }
    // per-authority signal aggregation (roots only exist after corpus-wide union-find)
    d.sigByRoot = new Map()
    const bump = (root, cls) => {
      if (d.ownRoot === root) return
      if (!d.sigByRoot.has(root)) d.sigByRoot.set(root, { support: 0, neutral: 0, contrary: 0, negTreated: 0 })
      d.sigByRoot.get(root)[cls]++
    }
    const { sigs, treatments } = d.citeSignals
    for (let k = 0; k < d.citeRuns.length; k++) {
      const s = sigs[k]
      if (s && s.cls !== 'treating') bump(ufFind(d.citeRuns[k][0]), s.cls)
    }
    for (const t of treatments) bump(ufFind(d.citeRuns[t.target][0]), 'negTreated')
  }
  // token IDF for text layer
  const df = new Map()
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1)
  const idf = new Map()
  for (const [t, n] of df) idf.set(t, Math.log((docs.length + 1) / (n + 1)) + 1)
  for (const d of docs) weight(d, idf)
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

  const edges = []
  const key = (i, j) => (i < j ? `${i}|${j}` : `${j}|${i}`)
  const seen = new Map() // pair-key -> edge list index per type guard

  // 1. direct citation edges
  for (const [i, a] of docs.entries()) {
    for (const [cite, n] of a.cites) {
      const b = byCite.get(cite)
      if (!b || b === a) continue
      const j = docs.indexOf(b)
      edges.push({ s: i, t: j, type: 'cites', w: n, detail: `${a.name} cites ${displayOf(cite)} (${n}x)` })
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
      .map(([c]) => displayOf(c))
    const top = sharedList.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => displayOf(c))
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
const SYNERGY_TOP_N = 12
const SYNERGY_W = { cites: 3, text: 2, authority: 1 }
// Hub correction (PLAN_MAP6 Phase B, EDHREC's lift lesson): a candidate that is similar to
// EVERYTHING (an anchor / "Sol Ring") must be MORE similar to the commander than to its own
// corpus average to rank. Modes: 'max' (raw component / corpus max — the original), 'lift'
// (component / (candidate mean + global mean) — shrinkage keeps isolated docs from blowing
// up), 'sub' (component - candidate mean, floored at 0). Applied to text and authority only;
// a direct cite is never generic, so cites stays raw. Lists are asymmetric under lift/sub:
// the hub sees its partners normally, the partners see the hub penalized — intended.
// SYN_MODE default is set by the measured Phase B decision recorded in PLAN_MAP6.md.
const SYN_MODE = 'lift'
// E1 (Ravel lesson): all-pairs is O(N²). Beyond this trigger, implement recall-then-rerank
// (cites/authority partners + top-M text via inverted index) per PLAN_MAP6 Phase E1 — the
// panel contract (top-N shown) never changes. Warn loudly; do not silently degrade.
const SYNERGY_ALLPAIRS_MAX = 2000
export function buildSynergy(docs, cdf, mode = SYN_MODE) {
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
      if (t > 0 || r > 0 || c > 0) pairs.push({ i, j, t, r, c, cAB, cBA, shared })
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
      why.push(`shared: ${shared.sort((x, y) => y[1] - x[1]).slice(0, 3).map(([cite]) => displayOf(cite)).join('; ')}`)
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
        const ce = certEvents.get(c)
        if (ce && ce[0] === ce[1]) continue // cert-disposition-only corpus-wide: procedural noise
        counts.set(c, (counts.get(c) || 0) + 1)
        if (!citedBy.has(c)) citedBy.set(c, [])
        citedBy.get(c).push(l.id)
      }
    }
    return [...counts]
      .filter(([, n]) => n >= MISSING_MIN_NEIGHBORS)
      .map(([c, n]) => ({ name: displayOf(c), n, idf: +cIdf(c).toFixed(2), score: n * cIdf(c), by: citedBy.get(c) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MISSING_TOP)
      .map(({ name, n, idf, by }) => ({ name, n, idf, by }))
  })
}

// ---- metrics ----
const pct = (x) => (100 * x).toFixed(1) + '%'
function gini(values) {
  const v = [...values].sort((a, b) => a - b)
  const n = v.length
  const sum = v.reduce((a, x) => a + x, 0)
  if (!n || !sum) return 0
  let cum = 0
  for (let i = 0; i < n; i++) cum += (2 * (i + 1) - n - 1) * v[i]
  return cum / (n * sum)
}
function metrics(docs, edges) {
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
  const chance = samePairs / ((N * (N - 1)) / 2)
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
    coverage: +(degree.filter((d) => d > 0).length / N).toFixed(3),
    gini: +gini(strength).toFixed(3),
    strength,
    degree,
  }
}

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
    nodes: docs.map((d, i) => ({
      id: i, file: d.file, name: d.name, matter: d.matter, court: d.court, date: d.date,
      cite: d.ownCite, cluster: d.cluster, topic: d.topic, kind: d.kind, outCites: d.cites.size,
      strength: +m.strength[i].toFixed(3), degree: m.degree[i],
      synergy: synergy[i], missing: missing[i],
      ...d.facets,
    })),
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
