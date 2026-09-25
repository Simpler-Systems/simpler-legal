// The ROUTER SEAT (owner doctrine 2026-07-22: "the model routes, it does not think" +
// "give it an umbrella term like government — its job is just to label").
// Code nominates candidates (v1 table rows + context from the original document); Gemma
// answers ONE grammar-forced umbrella word; POLICY stays in code and is raced as a grid
// (5 labels x mask/keep = 32 configs — the one legitimately finite policy space here).
// Mirrors red's railsPass classify mechanics: unique-candidate dedup, 100-char context
// windows, GBNF grammar, temperature 0.

export const UMBRELLA_GRAMMAR = 'root ::= "echr-organ" | "government" | "court" | "company" | "other"'

export const UMBRELLA_SYSTEM = `You label what an organization name refers to inside a legal judgment. Answer with exactly one word:
  echr-organ - the European Court of Human Rights itself, its Chambers, Registry, or the European Commission of Human Rights
  government - a state, national government, ministry, or other organ of a country's executive (e.g. a Ministry, a State, "the Government" of a country, a tax or immigration authority)
  court      - a national or local court, tribunal, or prosecutor's office
  company    - a private company, employer, union, association, school or other non-state organization
  other      - none of the above
Answer with the single label only.`

/** Collect unique institutional candidates from a v1 entity table. */
export function collectCandidates(table, originalText) {
  const seen = new Map()
  for (const row of table) {
    if (row.cls !== 'COMPANY') continue
    const key = row.span.toLowerCase().replace(/[’']s?$/, '')
    if (seen.has(key)) continue
    // context: first occurrence, 100 chars each side (red's classify window)
    const esc = row.span.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp(esc.replace(/\s+/g, '\\s+')).exec(originalText)
    const ctx = m
      ? originalText.slice(Math.max(0, m.index - 100), m.index + m[0].length + 100).replace(/\s+/g, ' ')
      : ''
    seen.set(key, { span: row.span, tag: row.tag, ctx })
  }
  return [...seen.values()]
}

/** Label every candidate via the umbrella contract. Returns Map span-key -> label. */
export async function labelCandidates(candidates, complete) {
  const labels = new Map()
  const stats = { calls: 0, failedCalls: 0 }
  for (const c of candidates) {
    let raw
    try {
      raw = await complete(UMBRELLA_SYSTEM, `Context: "...${c.ctx}..."\nOrganization: "${c.span}"`, {
        grammar: UMBRELLA_GRAMMAR,
        maxTokens: 6,
      })
      stats.calls++
    } catch {
      stats.failedCalls++
      continue
    }
    const v = (raw || '').trim().toLowerCase()
    if (['echr-organ', 'government', 'court', 'company', 'other'].includes(v)) labels.set(c.span.toLowerCase().replace(/[’']s?$/, ''), v)
  }
  return { labels, stats, complete: stats.failedCalls === 0 }
}

/** Apply a label->keep policy to the restore decision. policy = {label: true(restore)|false(stay masked)} */
export function restoreByPolicy(text, table, labels, policy) {
  const restored = []
  let out = text
  for (const row of table) {
    if (row.cls !== 'COMPANY' || !out.includes(row.tag)) continue
    const label = labels.get(row.span.toLowerCase().replace(/[’']s?$/, '')) || 'other'
    if (!policy[label]) continue
    out = out.split(row.tag).join(row.span)
    restored.push({ tag: row.tag, span: row.span, label })
  }
  return { text: out, restored }
}

/** All 32 label->keep policies, named. */
export function allPolicies() {
  const labels = ['echr-organ', 'government', 'court', 'company', 'other']
  const out = []
  for (let bits = 0; bits < 32; bits++) {
    const policy = {}
    labels.forEach((l, i) => (policy[l] = Boolean(bits & (1 << i))))
    out.push({ name: labels.filter((l) => policy[l]).map((l) => l.slice(0, 4)).join('+') || 'none', policy })
  }
  return out
}
