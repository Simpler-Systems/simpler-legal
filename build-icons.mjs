#!/usr/bin/env node
// build-icons.mjs — regenerate the app icon set from app/frontend/public/favicon.svg.
//
// Run by hand when the logo changes:  node build-icons.mjs
// Needs Playwright's Chromium as the rasterizer (same one the viewer checks use). It is a
// design-time tool like build-corpus.mjs, not part of the app build, and it is not wired
// into predev/prebuild — regenerating binaries on every dev server start would be worse
// than the problem it solves.
//
// WHY THIS EXISTS
// ---------------
// The taskbar icon was soft, and two separate causes were measured (2026-09-12):
//
//  1. icon.ico carried TWO DIFFERENT DRAWINGS. Every slot at 48px and below held an older
//     revision — heavier cross, no tail — and only 64px and above held the current logo.
//     Proof: at 48px the tail is 2.53 device px wide, which no resampling can erase, yet
//     the 48px slot has zero gold in the bottom 14% of the square and the 64px slot has 35.
//     The taskbar draws 24-48px, so the taskbar was showing a logo the app no longer uses.
//
//  2. The current drawing has features that cannot exist at taskbar sizes. Measured against
//     the 168-unit viewBox: the cross stroke lands at 0.81px at 16px, 1.22px at 24px; the
//     tail at 0.84px and 1.27px. A sub-pixel feature does not render thin, it renders as a
//     grey smear, and at 16px the cross never reaches its own navy at all (darkest
//     luminance 67 against a stroke navy of 45 and a gold of 172).
//
// So "just regenerate the icons from the current SVG" makes the taskbar WORSE, not better:
// a straight downscale drops cross weight from the stale art's 30-35% of the kite to
// 17-23%. The generator therefore does not downscale. It rasterizes a per-size rendition.
//
// THE RULE
// --------
// No feature of the mark may be thinner than FLOOR(N) = 1 + 0.035N device pixels at icon
// size N. Where the drawing as authored already exceeds that, it is used untouched.
//
//   * the cross is thickened by raising stroke-width
//   * the tail is a filled outline, so it is thickened by stroking it in its own gold
//   * nothing is moved, rescaled, recoloured or restyled — the only quantity that changes
//     is width, and only where width had fallen below a pixel
//
// The rule is a no-op from 64px up, which is exactly where the stale-art boundary already
// sat, so nothing above 64px changes and the repair is confined to the sizes Windows uses.
//
// One exception, stated rather than hidden: the tail is DROPPED below 30px. Reaching the
// floor there would mean thickening it by more than a third (1.45x at 24px, 1.85x at 16px),
// and a feature drawn a third heavier than authored is no longer that drawing — it renders
// as a blob fused to the kite's lower tip. Below 30px the kite and its cross are the mark.
// Between 30 and 48px the tail needs 30% or less and is kept.
//
// Sizes: the set includes 30, 36 and 42, which the old icon.ico lacked. Windows draws the
// taskbar at 24px at 100% DPI, 30 at 125%, 36 at 150%, 42 at 175% and 48 at 200%; a missing
// size makes Windows rescale by a non-integer factor, which is a second blur on top of the
// first.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const SVG_PATH = path.join(ROOT, 'app/frontend/public/favicon.svg')
const ICONS = path.join(ROOT, 'app/src-tauri/icons')

// ---------------------------------------------------------------------------
// Read the logo, and FAIL if it is not the shape this generator knows how to
// re-render. Silently emitting last year's geometry is the defect being fixed.
// ---------------------------------------------------------------------------
function parseLogo(svg) {
  const one = (re, what) => {
    const m = svg.match(re)
    if (!m) throw new Error('favicon.svg no longer matches this generator: could not find ' + what
      + '.\nThe icon set would be built from geometry the logo no longer has. Update build-icons.mjs.')
    return m
  }
  const outer = one(/<g transform="translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)">/, 'the outer transform')
  const inner = one(/<g transform="translate\((-?[\d.]+) (-?[\d.]+)\) rotate\(45\) scale\(([\d.]+)\)">/, 'the kite transform')
  const kite = one(/<path d="(M 0,-140[^"]*)" fill="(#[0-9A-Fa-f]{6})"\/>/, 'the kite body')
  const strokes = [...svg.matchAll(/<path d="([^"]+)" fill="none" stroke="(#[0-9A-Fa-f]{6})" stroke-width="([\d.]+)" stroke-linecap="round"\/>/g)]
  if (strokes.length !== 2) throw new Error('expected exactly 2 cross strokes in favicon.svg, found ' + strokes.length)
  if (strokes[0][3] !== strokes[1][3]) throw new Error('the two cross strokes have different widths; this generator assumes one')
  const tail = one(/<path d="(M 123\.86[^"]*)" fill="(#[0-9A-Fa-f]{6})"\/>/, 'the tail')
  const ground = one(/<rect width="168" height="168" rx="(\d+)" fill="(#[0-9A-Fa-f]{6})"\/>/, 'the rounded-square ground')
  const viewBox = one(/viewBox="0 0 (\d+) \1"/, 'a square viewBox')
  return {
    vb: +viewBox[1],
    ground: { r: +ground[1], fill: ground[2] },
    outer: { x: +outer[1], y: +outer[2], k: +outer[3] },
    inner: { x: +inner[1], y: +inner[2], k: +inner[3] },
    kite: { d: kite[1], fill: kite[2] },
    cross: { ds: strokes.map((s) => s[1]), stroke: strokes[0][2], width: +strokes[0][3] },
    tail: { d: tail[1], fill: tail[2] },
  }
}

const L = parseLogo(fs.readFileSync(SVG_PATH, 'utf8'))
// device px per unit of cross stroke-width, per px of icon size
const CROSS_K = (L.outer.k * L.inner.k) / L.vb

export const FLOOR = (N) => 1 + 0.035 * N
// Below this the tail would have to be thickened by more than TAIL_MAX_BOOST to reach the
// floor, so it is dropped instead. Both numbers are stated, not tuned per size.
const TAIL_MAX_BOOST = 1.30

// ---------------------------------------------------------------------------
// The per-size rendition
// ---------------------------------------------------------------------------
function rendition(N, tailPxPerIconPx) {
  const floor = FLOOR(N)
  const crossPx = L.cross.width * CROSS_K * N
  const sw = crossPx >= floor ? L.cross.width : floor / (CROSS_K * N)
  const tailPx = tailPxPerIconPx * N
  const boost = floor / tailPx
  const keepTail = boost <= TAIL_MAX_BOOST
  const tailSw = keepTail && boost > 1 ? (floor - tailPx) * (L.vb / N) / L.outer.k : 0
  return {
    N,
    sw: +sw.toFixed(3),
    tailSw: +tailSw.toFixed(3),
    keepTail,
    crossPx: +Math.max(crossPx, floor).toFixed(2),
    tailPx: keepTail ? +Math.max(tailPx, floor).toFixed(2) : 0,
    authoredCrossPx: +crossPx.toFixed(2),
    authoredTailPx: +tailPx.toFixed(2),
    untouched: sw === L.cross.width && tailSw === 0 && keepTail,
  }
}

function svgFor(r) {
  const g = '<g transform="translate(' + L.outer.x + ' ' + L.outer.y + ') scale(' + L.outer.k + ')">'
  return '<svg viewBox="0 0 ' + L.vb + ' ' + L.vb + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="simpler.legal">'
    + '<defs><clipPath id="t"><rect width="' + L.vb + '" height="' + L.vb + '" rx="' + L.ground.r + '"/></clipPath></defs>'
    + '<rect width="' + L.vb + '" height="' + L.vb + '" rx="' + L.ground.r + '" fill="' + L.ground.fill + '"/>'
    + '<g clip-path="url(#t)">'
    + (r.keepTail
      ? g + '<path d="' + L.tail.d + '" fill="' + L.tail.fill + '"'
        + (r.tailSw > 0.005 ? ' stroke="' + L.tail.fill + '" stroke-width="' + r.tailSw + '" stroke-linejoin="round"' : '')
        + '/></g>'
      : '')
    + g + '<g transform="translate(' + L.inner.x + ' ' + L.inner.y + ') rotate(45) scale(' + L.inner.k + ')">'
    + '<path d="' + L.kite.d + '" fill="' + L.kite.fill + '"/>'
    + L.cross.ds.map((d) => '<path d="' + d + '" fill="none" stroke="' + L.cross.stroke
      + '" stroke-width="' + r.sw + '" stroke-linecap="round"/>').join('')
    + '</g></g></g></svg>'
}

// ---------------------------------------------------------------------------
// PNG encode / decode (8-bit RGBA). Small and dependency-free on purpose: this
// script already needs a browser, it should not also need an image library.
// ---------------------------------------------------------------------------
const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c }
  return t
})()
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePng({ w, h, data }) {
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 4)] = 0; data.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4) }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}
export function decodePng(buf) {
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9] }
    else if (type === 'IDAT') idat.push(data)
    p += 12 + len
  }
  if (depth !== 8 || ctype !== 6) throw new Error('expected 8-bit RGBA PNG')
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * 4, out = Buffer.alloc(h * stride)
  let q = 0
  for (let y = 0; y < h; y++) {
    const f = raw[q++], line = raw.subarray(q, q + stride); q += stride
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0
      let v = line[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 255
    }
  }
  return { w, h, data: out }
}

// ---------------------------------------------------------------------------
// ICO container. Entry: width@+0 height@+1 (0 means 256), bpp@+6, length@+8,
// offset@+12. PNG payloads, which is what Windows and tauri both already use here.
// ---------------------------------------------------------------------------
export function buildIco(images) {
  const dirLen = 6 + 16 * images.length
  let off = dirLen
  const head = Buffer.alloc(dirLen)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4)
  images.forEach((im, i) => {
    const p = 6 + 16 * i
    head.writeUInt8(im.size >= 256 ? 0 : im.size, p)
    head.writeUInt8(im.size >= 256 ? 0 : im.size, p + 1)
    head.writeUInt16LE(1, p + 4); head.writeUInt16LE(32, p + 6)
    head.writeUInt32LE(im.buf.length, p + 8); head.writeUInt32LE(off, p + 12)
    off += im.buf.length
  })
  return Buffer.concat([head, ...images.map((im) => im.buf)])
}
export function readIco(file) {
  const b = fs.readFileSync(file)
  if (b.readUInt16LE(0) !== 0 || b.readUInt16LE(2) !== 1) throw new Error(file + ' is not an ICO')
  const out = []
  for (let i = 0, n = b.readUInt16LE(4); i < n; i++) {
    const p = 6 + 16 * i
    const len = b.readUInt32LE(p + 8), off = b.readUInt32LE(p + 12)
    out.push({ size: b.readUInt8(p) || 256, bpp: b.readUInt16LE(p + 6), buf: b.subarray(off, off + len) })
  }
  return out
}

// ---------------------------------------------------------------------------
// Targets. ICO_SIZES covers the taskbar at every common Windows DPI plus the
// conventional set. The PNG files are the ones tauri.conf.json and the Windows
// Store manifests name; each is rendered at its own size, never resized.
//
// ORDER MATTERS, and 32 is first on purpose. Tauri makes the running window's icon from the
// FIRST frame only (tauri-codegen 2.6.3, src/image.rs: `icon_dir.entries()[0]`), and until
// 2026-09-25 that was 16px: the taskbar stretched it to 36px at 150% scaling and the button was
// blurry, even though every frame in the file was right. Explorer and the shell pick frames by
// size, so the order changes only that one road. 32 first is what `tauri icon` writes, and what
// simpler-harness ships with no blur. The window no longer depends on it: window_icon.rs loads
// the frame the display asks for at runtime. This is the fallback if that fails.
// ---------------------------------------------------------------------------
const ICO_SIZES = [32, 16, 20, 24, 30, 36, 40, 42, 48, 64, 96, 128, 256]
const PNG_TARGETS = {
  '32x32.png': 32, '64x64.png': 64, '128x128.png': 128, '128x128@2x.png': 256,
  '256x256.png': 256, 'icon.png': 512,
  'Square30x30Logo.png': 30, 'Square44x44Logo.png': 44, 'Square71x71Logo.png': 71,
  'Square89x89Logo.png': 89, 'Square107x107Logo.png': 107, 'Square142x142Logo.png': 142,
  'Square150x150Logo.png': 150, 'Square284x284Logo.png': 284, 'Square310x310Logo.png': 310,
  'StoreLogo.png': 50,
}

async function main(mode) {
  let chromium
  try { ({ chromium } = await import('playwright')) } catch {
    console.error('build-icons.mjs needs Playwright to rasterize the SVG.\n'
      + '  npm i -D playwright && npx playwright install chromium\n'
      + 'This is a design-time tool; the app build does not depend on it.')
    process.exit(1)
  }
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent('<body style="margin:0">')
  const raster = async (svg, size) => {
    const url = await page.evaluate(async ([t, s]) => {
      const img = new Image()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t)
      await img.decode()
      const c = document.createElement('canvas')
      c.width = c.height = s
      c.getContext('2d').drawImage(img, 0, 0, s, s)
      return c.toDataURL('image/png')
    }, [svg, size])
    return decodePng(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))
  }

  // Measure the tail's authored width from the artwork itself, so the rule keeps
  // holding if the tail is ever redrawn. Median ink run strictly below the kite.
  const noCross = svgFor({ sw: 0.0001, tailSw: 0, keepTail: true })
  const probe = await raster(noCross, 512)
  const gold = L.tail.fill.slice(1).match(/../g).map((h) => parseInt(h, 16))
  const runs = []
  for (let y = Math.floor(512 * 0.84); y < 512; y++) {
    let run = 0
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4
      const near = probe.data[i + 3] > 200
        && Math.hypot(probe.data[i] - gold[0], probe.data[i + 1] - gold[1], probe.data[i + 2] - gold[2]) < 70
      if (near) run++; else { if (run) runs.push(run); run = 0 }
    }
    if (run) runs.push(run)
  }
  if (runs.length < 8) throw new Error('could not measure the tail: found ' + runs.length + ' ink runs below the kite')
  runs.sort((a, b) => a - b)
  const TAIL_PX_PER = runs[runs.length >> 1] / 512

  console.log('logo: viewBox ' + L.vb + ', ground ' + L.ground.fill + ' r' + L.ground.r
    + ', kite ' + L.kite.fill + ', cross ' + L.cross.stroke + ' w' + L.cross.width)
  console.log('measured tail width: ' + (TAIL_PX_PER * 100).toFixed(2) + 'px per 100px of icon\n')
  console.log('  N   floor    cross authored -> used      tail authored -> used     rendition')

  const rendered = new Map()
  for (const N of [...new Set([...ICO_SIZES, ...Object.values(PNG_TARGETS)])].sort((a, b) => a - b)) {
    const r = rendition(N, TAIL_PX_PER)
    rendered.set(N, { r, im: await raster(svgFor(r), N) })
    console.log(String(N).padStart(4) + FLOOR(N).toFixed(2).padStart(8) + '   '
      + (r.authoredCrossPx + 'px -> ' + r.crossPx + 'px').padEnd(26)
      + (r.authoredTailPx + 'px -> ' + (r.keepTail ? r.tailPx + 'px' : 'dropped')).padEnd(26)
      + (r.untouched ? 'as authored' : 'cross ' + r.sw + (r.tailSw > 0.005 ? ', tail +' + r.tailSw : '')))
  }

  const wanted = new Map([['icon.ico', buildIco(ICO_SIZES.map((size) => ({ size, buf: encodePng(rendered.get(size).im) })))]])
  for (const [file, size] of Object.entries(PNG_TARGETS)) wanted.set(file, encodePng(rendered.get(size).im))
  await browser.close()

  // `check` is the guard. The defect this generator repairs is an asset that had silently
  // stopped matching its own source — icon.ico held a previous revision of the logo in
  // every slot the taskbar draws, and nothing in the repo could have noticed. Now something
  // can: run `node build-icons.mjs check` and it fails loudly instead.
  if (mode === 'check') {
    const stale = []
    for (const [file, buf] of wanted) {
      const p = path.join(ICONS, file)
      if (!fs.existsSync(p)) { stale.push(file + ' — missing'); continue }
      const on = fs.readFileSync(p)
      if (!on.equals(buf)) stale.push(file + ' — ' + on.length + ' bytes on disk, generator produces ' + buf.length)
    }
    if (stale.length) {
      console.error('\nFAIL: ' + stale.length + ' of ' + wanted.size + ' icon files do not match favicon.svg:')
      for (const s of stale) console.error('  ' + s)
      console.error('\nRun `node build-icons.mjs` to regenerate them.')
      process.exit(1)
    }
    console.log('\nok — all ' + wanted.size + ' icon files match favicon.svg')
    return
  }

  for (const [file, buf] of wanted) fs.writeFileSync(path.join(ICONS, file), buf)
  console.log('\nicon.ico: ' + ICO_SIZES.length + ' sizes — ' + ICO_SIZES.join(', '))
  console.log(Object.keys(PNG_TARGETS).length + ' PNGs written')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main(process.argv[2])
