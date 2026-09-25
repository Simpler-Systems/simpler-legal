export const meta = {
  name: 'utility-benchmark-v1',
  description: 'Post-AI utility metric: frontier Q&A agreement on masked-vs-original round-4 docs',
  phases: [
    { title: 'Questions', detail: 'per-doc analytical question generation from originals' },
    { title: 'Answer', detail: 'blind analysts: original vs masked' },
    { title: 'Judge', detail: 'substance-equivalence per question' },
  ],
}
const A = typeof args === 'string' ? JSON.parse(args) : args
const DOCS = A.docs
const Q_SCHEMA = { type: 'object', properties: { questions: { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 5 } }, required: ['questions'] }
const ANS_SCHEMA = { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, answer: { type: 'string' } }, required: ['q', 'answer'] } } }, required: ['answers'] }
const J_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, verdict: { type: 'string', enum: ['EQUIVALENT', 'PARTIAL', 'DIVERGENT'] }, reason: { type: 'string' } }, required: ['q', 'verdict'] } } }, required: ['verdicts'] }
// Paths come from the caller so this harness runs on any machine: pass
// {repo: "/path/to/simpler-legal"} in args, or set it to wherever your rebuilt
// corpus lives. (Was hardcoded to the author's Windows profile, which made the
// receipt behind the 0.968 utility number unrunnable for anyone else.)
const REPO = (A.repo || '.').replace(/[\\/]+$/, '')
const ORIG = A.origDir || `${REPO}/raw/round4`
const maskedDir = (d) => (d.startsWith('edgar') ? (A.edgarDir || `${REPO}/raw/stripped/r4-edgar-FINAL`) : (A.courtsDir || `${REPO}/raw/stripped/r4-courts-FINAL`))
const results = await pipeline(
  DOCS,
  (doc) =>
    agent(
      `Read the ENTIRE legal document at ${ORIG}/${doc} (use offset Reads if long). Write EXACTLY 5 analytical questions a lawyer would ask to test real understanding of this document's substance: obligations, procedural posture, outcomes, remedies, risk allocation, argument structure. Questions must be answerable from the document alone. Do NOT ask questions whose answer is a name, date, address, or other identity — the point is the document's analytical content, not its identifiers.`,
      { label: `q:${doc}`, phase: 'Questions', schema: Q_SCHEMA, model: 'opus', effort: 'high' },
    ),
  (qres, doc) =>
    parallel([
      () =>
        agent(
          `Read the ENTIRE document at ${ORIG}/${doc}. Answer each question below strictly and only from this document, 2-4 sentences each, precise legal substance.\n${JSON.stringify(qres.questions)}`,
          { label: `ansO:${doc}`, phase: 'Answer', schema: ANS_SCHEMA, model: 'opus', effort: 'high' },
        ),
      () =>
        agent(
          `Read the ENTIRE document at ${maskedDir(doc)}/${doc}. It is a REDACTED legal document: identities appear as placeholders like [Person1], [Company2], [X]. That is expected — reason about the placeholders as consistent actors. Answer each question below strictly and only from this document, 2-4 sentences each, precise legal substance.\n${JSON.stringify(qres.questions)}`,
          { label: `ansM:${doc}`, phase: 'Answer', schema: ANS_SCHEMA, model: 'opus', effort: 'high' },
        ),
    ]).then(([o, m]) => ({ questions: qres.questions, orig: o, masked: m })),
  (pair, doc) => {
    if (!pair || !pair.orig || !pair.masked) return null
    const items = pair.questions.map((q, i) => ({ q, answerA: pair.orig.answers[i]?.answer || '', answerB: pair.masked.answers[i]?.answer || '' }))
    return agent(
      `You judge whether two analysts extracted the SAME legal substance. Answer A came from an original document; Answer B from a redacted copy where identities are placeholders ([Person1], [Company2]) — placeholder-for-name substitutions are EXPECTED and count as equivalent IF the structural/legal claim matches. Judge each pair: EQUIVALENT (same substance), PARTIAL (overlapping but one misses or garbles a material element), DIVERGENT (contradictory or answer B could not extract the substance). One-line reason each.\n${JSON.stringify(items)}`,
      { label: `judge:${doc}`, phase: 'Judge', schema: J_SCHEMA, model: 'opus', effort: 'high' },
    ).then((j) => ({ doc, verdicts: j.verdicts }))
  },
)
const perDoc = results.filter(Boolean)
let eq = 0, part = 0, div = 0
const rows = []
for (const r of perDoc) {
  let e = 0, p = 0, d = 0
  for (const v of r.verdicts) { if (v.verdict === 'EQUIVALENT') e++; else if (v.verdict === 'PARTIAL') p++; else d++ }
  eq += e; part += p; div += d
  rows.push({ doc: r.doc, utility: +((e + 0.5 * p) / (e + p + d)).toFixed(3), e, p, d, divergentReasons: r.verdicts.filter((v) => v.verdict === 'DIVERGENT').map((v) => v.reason || v.q).slice(0, 3) })
}
return { aggregateUtility: +((eq + 0.5 * part) / (eq + part + div)).toFixed(3), eq, part, div, perDoc: rows }