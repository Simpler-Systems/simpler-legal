// REGION-BASED MASKING over immutable original text (the corruption fix, 2026-07-22).
// Principle: the original document is never string-edited. We compute REGIONS
// [{start, end, tag, row}] — first by aligning v1's masked output against the original
// (recovering every tag occurrence's exact source span), then rails ADD regions via regex
// over the ORIGINAL, restores REMOVE regions per-occurrence. Rendering substitutes tags at
// region boundaries only at the very end; offsets for the official scorer are the regions
// themselves. Corruption is structurally impossible: restored text IS original text.

const TAG_AT = /^\[[A-Za-z]+\d*\]/
const isWs = (c) => /\s/.test(c)
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Align v1 masked output against the (folded) original. Returns
 *  { ok, regions: [{start, end, tag}], failAt } — one region per tag RUN (consecutive tags
 *  and glue punctuation fold into one region; over-wide by at most the glue). */
export function alignTags(orig, masked) {
  const regions = []
  let i = 0, j = 0, guard = 0
  while (j < masked.length && i < orig.length) {
    if (++guard > 400000) return { ok: false, failAt: [i, j], regions, why: 'runaway' }
    if (isWs(orig[i]) && isWs(masked[j])) {
      while (i < orig.length && isWs(orig[i])) i++
      while (j < masked.length && isWs(masked[j])) j++
      continue
    }
    if (orig[i] === masked[j]) { i++; j++; continue }
    // divergence must begin a tag run — allowing 1-2 stray brackets before the first tag
    // (FS5e: "12 U.S.C. 1828(k" masked inside parens renders "[[Id17])" — stray '[' first)
    if (!TAG_AT.test(masked.slice(j))) {
      let skipped = 0
      for (const len of [1, 2, 3]) {
        if (/^[\[\]]+$/.test(masked.slice(j, j + len)) && TAG_AT.test(masked.slice(j + len))) { skipped = len; break }
      }
      if (!skipped) return { ok: false, failAt: [i, j], regions, why: 'no-tag' }
      j += skipped
    }
    const spanStart = i
    const tags = []
    // consume: tags, whitespace, glue punctuation between/around tags (incl. literal
    // brackets around masked years: "[[Date]]"), until stable text resumes
    let progressed = true
    while (progressed) {
      progressed = false
      while (j < masked.length && isWs(masked[j])) { j++; progressed = true }
      const t = TAG_AT.exec(masked.slice(j))
      if (t) { tags.push(t[0]); j += t[0].length; progressed = true; continue }
      if (j < masked.length && '[](),.;:“”‘’"\'§–—-'.includes(masked[j])) {
        // glue punct is only consumed if a tag follows soon (within 3 chars) — otherwise it
        // is real resuming text
        const ahead = masked.slice(j + 1, j + 5)
        if (TAG_AT.test(ahead.replace(/^[\s[\]ytics]*/, '')) || TAG_AT.test(masked.slice(j + 1)) || /^[\s\[\]().,;:“”‘’"'§–—-]{0,3}\[/.test(masked.slice(j + 1))) {
          j++
          progressed = true
        }
      }
    }
    if (j >= masked.length) {
      regions.push({ start: spanStart, end: orig.length, tag: tags[0] || '[Region]' })
      i = orig.length
      break
    }
    // re-anchor: next stable text (up to next tag START, not any '['), ws-run tolerant.
    // If the stable text between tags is tiny ("of", "v."), fold it and the next tag into
    // the same region (over-wide by a word — the safe direction) and keep folding.
    let nextTag = masked.slice(j).search(/\[[A-Za-z]+\d*\]/)
    while (nextTag !== -1 && masked.slice(j, j + nextTag).replace(/\s+/g, '').length < 4) {
      j += nextTag
      const t2 = TAG_AT.exec(masked.slice(j))
      if (!t2) break
      tags.push(t2[0])
      j += t2[0].length
      nextTag = masked.slice(j).search(/\[[A-Za-z]+\d*\]/)
    }
    const anchorEnd = nextTag === -1 ? masked.length : j + nextTag
    let anchor = masked.slice(j, Math.min(j + 48, anchorEnd))
    // FS5d walker hardening (the 4 EDGAR align failures): literal brackets around masked
    // years ("Insurance Act [[Date]]") leave stray [ ] at anchor edges and inside anchors.
    // Leading strays are consumed (the orig-side remnant folds into the region, over-wide by
    // a few chars — the safe direction); interior brackets match optionally.
    const lead = /^[\[\]]{1,3}/.exec(anchor)
    if (lead) { anchor = anchor.slice(lead[0].length); j += lead[0].length }
    if (anchor.replace(/\s+/g, '').length < 2) {
      anchor = masked.slice(j, Math.min(j + 120, masked.length)).replace(/^[\[\]]{1,3}/, '')
      if (anchor.replace(/\s+/g, '').length < 2) {
        // FS5e: a trailing tag-run leaving ≤4 stray chars (page number after a masked
        // signature block) closes to end-of-doc — over-wide by the stray, the safe direction
        if (j >= masked.length - 1 || masked.slice(j).replace(/\s+/g, '').length <= 4) { regions.push({ start: spanStart, end: orig.length, tag: tags[0] || '[Region]', tags }); i = orig.length; break }
        return { ok: false, failAt: [i, j], regions, why: 'anchor-too-short' }
      }
    }
    const re = new RegExp(escRe(anchor).replace(/(\s|\\\s)+/g, '\\s+').replace(/\\\[|\\\]/g, '[\\[\\]]?'))
    const m = re.exec(orig.slice(i))
    if (!m) return { ok: false, failAt: [i, j], regions, why: 'anchor-not-found:' + JSON.stringify(anchor.slice(0, 24)) }
    const found = i + m.index
    if (found > spanStart) regions.push({ start: spanStart, end: found, tag: tags[0] || '[Region]', tags })
    i = found
  }
  return { ok: true, regions }
}

/** Add regions from regex rules run over the ORIGINAL text (with protected ranges). */
export function addRuleRegions(orig, rules, protectedRanges, inProtected, existing, clsPrefix = '') {
  const out = [...existing]
  for (const { cls, re } of rules) {
    for (const m of orig.matchAll(re)) {
      if (inProtected(protectedRanges, m.index, m.index + m[0].length)) continue
      out.push({ start: m.index, end: m.index + m[0].length, tag: `[${clsPrefix}${cls}]` })
    }
  }
  return out
}

/** Merge overlapping regions (earliest tag wins the label). */
export function mergeRegions(regions) {
  const sorted = [...regions].sort((a, b) => a.start - b.start || b.end - a.end)
  const out = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

/** Render: original text with regions replaced by their tags. Pure, corruption-free. */
export function render(orig, regions) {
  const merged = mergeRegions(regions)
  let out = ''
  let pos = 0
  for (const r of merged) {
    out += orig.slice(pos, r.start) + r.tag
    pos = r.end
  }
  return out + orig.slice(pos)
}

/** Offsets for the official scorer: the merged regions as [start,end] pairs. */
export const toOffsets = (regions) => mergeRegions(regions).map((r) => [r.start, r.end])
