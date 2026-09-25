#!/usr/bin/env node
// SUPERSEDED for the Windows asset set by `build-icons.mjs` at the repo root (2026-09-12),
// which fixed a defect this script does not: icon.ico carried a stale drawing in every slot
// the taskbar draws. Both write to app/src-tauri/icons/, so RUNNING THIS ONE REVERTS THAT FIX
// for icon.ico and the Square*/StoreLogo PNGs. `node build-icons.mjs check` is the guard and
// currently passes on all 17 files. This script is kept because it is still the only generator
// for icon.icns and the android/ios sets, which the root one does not produce and which
// `bundle.targets: ["nsis"]` does not currently ship. If a macOS or mobile target is ever
// added, reconcile the two rather than running both.
//
// tools/make-icons.mjs — regenerate the app icon set from the canonical simpler.legal mark.
//
// Why this exists. app/ was vendored wholesale from simpler-red and rebranded by a STRING sweep
// (commit 0232e03). Strings cannot see PNGs, so every file under app/src-tauri/icons/ stayed
// byte-identical to red's — including icon.ico, which tauri_build embeds as the Windows
// executable icon, which is what the taskbar shows. The SVG favicons were navy+gold; the
// binaries were still red's kite.
//
// One source of truth: app/frontend/public/favicon.svg (navy #16324F tile, gold #D4AF37 kite).
//
// Fidelity: every icon is rasterised from the VECTOR at its own final pixel size. Resampling one
// large master down to 16px (what `tauri icon` does, and what the first cut of this script did)
// smears the kite spars and loses the tail entirely — a 64:1 box filter cannot preserve a
// one-pixel stroke. Instead all the sizes are laid out on a single atlas page and rasterised in
// one headless pass, so each is hinted and antialiased by the renderer at its true scale, and the
// whole set still costs one browser launch.
//
// Usage:  node tools/make-icons.mjs            write the set, print a sha256 manifest
//         node tools/make-icons.mjs --check    regenerate in memory, diff against disk, exit 1 on drift
//         node tools/make-icons.mjs --atlas    also keep the raw atlas PNG for inspection
//
// Fail-closed: if the rasteriser silently produces a blank or off-brand cell (it will, if the
// profile directory is locked by a running Chrome), the colour assertions below stop the run
// before anything is written.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const SRC_SVG = path.join(ROOT, 'app', 'frontend', 'public', 'favicon.svg')
const MASTER = path.join(ROOT, 'app', 'src-tauri', 'icon-source.png')
const CHECK = process.argv.includes('--check')
const KEEP_ATLAS = process.argv.includes('--atlas')

const NAVY = [0x16, 0x32, 0x4f]
const GOLD = [0xd4, 0xaf, 0x37]
const RED = [0xc0, 0x33, 0x2b] // simpler-red's brand fill — must not appear anywhere
const GOLD_HEX = '#D4AF37'

// ─── PNG ────────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function pngEncode({ w, h, data }) {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function pngDecode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let o = 8
  let w = 0, h = 0, depth = 0, colour = 0, interlace = 0
  const idat = []
  while (o < buf.length) {
    const len = buf.readUInt32BE(o)
    const type = buf.toString('ascii', o + 4, o + 8)
    const body = buf.subarray(o + 8, o + 8 + len)
    if (type === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4)
      depth = body[8]; colour = body[9]; interlace = body[12]
    } else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
    o += 12 + len
  }
  if (depth !== 8 || interlace !== 0 || (colour !== 6 && colour !== 2))
    throw new Error(`unsupported PNG: depth=${depth} colour=${colour} interlace=${interlace}`)
  const ch = colour === 6 ? 4 : 3
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(w * h * 4)
  const line = Buffer.alloc(stride)
  const prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    raw.copy(line, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0
      const b = prev[i]
      const c = i >= ch ? prev[i - ch] : 0
      let v = line[i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      line[i] = v & 0xff
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 4
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]
      out[d + 3] = ch === 4 ? line[s + 3] : 255
    }
    line.copy(prev)
  }
  return { w, h, data: out }
}

// ─── pixel ops ──────────────────────────────────────────────────────────────────

// Flatten onto an opaque background — an iOS AppIcon may not carry alpha.
function overBackground(img, [br, bg, bb]) {
  const out = Buffer.from(img.data)
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255
    out[i] = Math.round(out[i] * a + br * (1 - a))
    out[i + 1] = Math.round(out[i + 1] * a + bg * (1 - a))
    out[i + 2] = Math.round(out[i + 2] * a + bb * (1 - a))
    out[i + 3] = 255
  }
  return { w: img.w, h: img.h, data: out }
}

// Centre an already-rasterised tile on a larger transparent canvas; optionally clip it to a
// circle (android ic_launcher_round). The tile arrives at its final pixel size — nothing is
// resampled here.
function place(content, size, circular) {
  const c = content.w
  const off = Math.round((size - c) / 2)
  const out = Buffer.alloc(size * size * 4)
  const cx = size / 2, cy = size / 2, r = c / 2
  for (let y = 0; y < c; y++) {
    for (let x = 0; x < c; x++) {
      const dx = off + x, dy = off + y
      const s = (y * c + x) * 4, d = (dy * size + dx) * 4
      let a = content.data[s + 3]
      if (circular) {
        // 4x4 supersampled coverage keeps the circle edge from stairstepping at 48px.
        let cov = 0
        for (let sy = 0; sy < 4; sy++) {
          for (let sx = 0; sx < 4; sx++) {
            const qx = dx + (sx + 0.5) / 4 - cx, qy = dy + (sy + 0.5) / 4 - cy
            if (qx * qx + qy * qy <= r * r) cov++
          }
        }
        a = Math.round((a * cov) / 16)
      }
      out[d] = content.data[s]; out[d + 1] = content.data[s + 1]; out[d + 2] = content.data[s + 2]
      out[d + 3] = a
    }
  }
  return { w: size, h: size, data: out }
}

// ─── containers ─────────────────────────────────────────────────────────────────

function buildIco(parts) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(parts.length, 4)
  let offset = 6 + parts.length * 16
  const dir = [], bodies = []
  for (const { size, png } of parts) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12)
    dir.push(e); bodies.push(png); offset += png.length
  }
  return Buffer.concat([head, ...dir, ...bodies])
}

// ICNS run-length coding: a byte >= 0x80 means a run of (b - 0x7D) copies of the next byte,
// otherwise a literal run of (b + 1) bytes. Channels are stored R, then G, then B.
function icnsRle(img) {
  const out = []
  for (let c = 0; c < 3; c++) {
    const plane = Buffer.alloc(img.w * img.h)
    for (let i = 0; i < plane.length; i++) plane[i] = img.data[i * 4 + c]
    let i = 0
    while (i < plane.length) {
      let run = 1
      while (run < 130 && i + run < plane.length && plane[i + run] === plane[i]) run++
      if (run >= 3) {
        out.push(Buffer.from([run + 0x7d, plane[i]]))
        i += run
      } else {
        let lit = 0
        while (lit < 128 && i + lit < plane.length) {
          if (i + lit + 2 < plane.length &&
              plane[i + lit] === plane[i + lit + 1] &&
              plane[i + lit] === plane[i + lit + 2]) break
          lit++
        }
        out.push(Buffer.from([lit - 1]), plane.subarray(i, i + lit))
        i += lit
      }
    }
  }
  return Buffer.concat(out)
}

function icnsAlpha(img) {
  const a = Buffer.alloc(img.w * img.h)
  for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4 + 3]
  return a
}

function buildIcns(parts) {
  const entries = parts.map(([type, body]) => {
    const h = Buffer.alloc(8)
    h.write(type, 0, 'ascii')
    h.writeUInt32BE(body.length + 8, 4)
    return Buffer.concat([h, body])
  })
  const total = 8 + entries.reduce((n, e) => n + e.length, 0)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(total, 4)
  return Buffer.concat([head, ...entries])
}

// ─── rasteriser ─────────────────────────────────────────────────────────────────

function findChrome() {
  const local = process.env.LOCALAPPDATA
  const candidates = [
    process.env.SIMPLER_CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    local && path.join(local, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean)
  for (const c of candidates) if (fs.existsSync(c)) return c
  throw new Error('no Chromium binary found — set SIMPLER_CHROME to one')
}

// Inlining the mark 40-odd times puts 40 copies of its clipPath id in one document, and every
// url(#t) would then resolve to the first. Suffix the ids per instance.
function svgInstance(svg, i) {
  let out = svg
  for (const [, id] of svg.matchAll(/id="([^"]+)"/g)) {
    out = out.split(`id="${id}"`).join(`id="${id}_${i}"`)
    out = out.split(`url(#${id})`).join(`url(#${id}_${i})`)
  }
  return out
}

const ATLAS_W = 2048
const GUTTER = 8

// Optical sizing. The mark carries a hairline tail and two thin spars; at 168 units they are
// fine, but below ~48px the tail falls under one pixel and renders as a smudge while the spars
// thin to nothing, which is what "low fidelity in the taskbar" actually looks like. Gold on navy
// starts ~33% behind red's white-on-red in luminance contrast, so legal's mark hits that floor
// sooner than red's does. For the small sizes only, drop the tail and thicken the spars so the
// kite still reads as a kite. Set SMALL_MAX = 0 to ship the full mark at every size.
const SMALL_MAX = 48

function simplify(svg) {
  const paths = [...svg.matchAll(/<path\b[^>]*\/>/g)].map(m => m[0])
  const tail = paths.reduce((a, b) => (b.length > a.length ? b : a), '')
  if (tail.length < 1000) throw new Error('could not identify the tail path to drop')
  const out = svg.split(tail).join('').replace(/stroke-width="16"/g, 'stroke-width="26"')
  if (!out.includes(GOLD_HEX)) throw new Error('simplified mark lost its gold')
  return out
}

// Shelf-pack every requested size onto one page, rasterise once, cut the cells back out.
function renderAll(sizes) {
  const svg = fs.readFileSync(SRC_SVG, 'utf8')
  const small = SMALL_MAX ? simplify(svg) : svg
  const uniq = [...new Set(sizes)].sort((a, b) => b - a)
  const cells = []
  let x = 0, y = 0, rowH = 0
  for (const size of uniq) {
    if (x + size > ATLAS_W) { x = 0; y += rowH + GUTTER; rowH = 0 }
    cells.push({ size, x, y })
    x += size + GUTTER
    rowH = Math.max(rowH, size)
  }
  const H = y + rowH

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simpler-icons-'))
  const html = path.join(tmp, 'atlas.html')
  const shot = path.join(tmp, 'atlas.png')
  const body = cells.map((c, i) =>
    `<div style="position:absolute;left:${c.x}px;top:${c.y}px;width:${c.size}px;height:${c.size}px">` +
    svgInstance(c.size <= SMALL_MAX ? small : svg, i) + '</div>').join('')
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent}
#a{position:absolute;left:0;top:0;width:${ATLAS_W}px;height:${H}px}
#a svg{display:block;width:100%;height:100%}
</style><div id="a">${body}</div>`)

  // A dedicated --user-data-dir is load-bearing: without it Chrome blocks on the profile lock
  // held by the developer's own running browser and writes a blank screenshot.
  execFileSync(findChrome(), [
    '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--default-background-color=00000000',
    `--user-data-dir=${path.join(tmp, 'profile')}`,
    `--screenshot=${shot}`, `--window-size=${ATLAS_W + 80},${H + 80}`,
    'file:///' + html.replace(/\\/g, '/'),
  ], { stdio: 'ignore', timeout: 180000 })
  if (!fs.existsSync(shot)) throw new Error('rasteriser wrote no file')

  const atlas = pngDecode(fs.readFileSync(shot))
  if (atlas.w < ATLAS_W || atlas.h < H) throw new Error(`atlas ${atlas.w}x${atlas.h} < ${ATLAS_W}x${H}`)
  if (KEEP_ATLAS) fs.writeFileSync(path.join(ROOT, 'atlas-debug.png'), fs.readFileSync(shot))

  const out = new Map()
  for (const { size, x: cx, y: cy } of cells) {
    const data = Buffer.alloc(size * size * 4)
    for (let row = 0; row < size; row++) {
      const from = ((cy + row) * atlas.w + cx) * 4
      atlas.data.copy(data, row * size * 4, from, from + size * 4)
    }
    out.set(size, { w: size, h: size, data })
  }
  fs.rmSync(tmp, { recursive: true, force: true })
  return out
}

function px(img, x, y) {
  const i = (y * img.w + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
}

const near = (a, b, tol = 12) =>
  Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol

// Checked on every cell, not just the master: a mis-packed atlas would otherwise ship a
// half-cropped icon that still looks navy at a glance.
function assertMark(img, label) {
  const S = img.w
  // Nothing positional beyond the tile itself: at 24px the centre pixel lands on a kite spar,
  // so "the middle is navy" is only true at large sizes. Census the whole cell instead.
  // Half-covered is fine: at 16px the corner radius is 2.3px, so the corner pixel legitimately
  // antialiases to ~29% alpha. A square tile would read 255 here.
  if (px(img, 0, 0)[3] > 128) throw new Error(`${label}: corner opaque — tile radius lost`)
  if (px(img, S >> 1, Math.max(1, S >> 5))[3] < 250) throw new Error(`${label}: top edge transparent — tile did not fill`)
  let navy = 0, gold = 0, red = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] <= 128) continue
    const p = [img.data[i], img.data[i + 1], img.data[i + 2]]
    if (near(p, NAVY, 20)) navy++
    if (near(p, GOLD, 30)) gold++
    if (near(p, RED, 24)) red++
  }
  if (navy < S * S * 0.15) throw new Error(`${label}: ${navy} navy pixels — tile missing`)
  if (gold < Math.max(3, S * 0.4)) throw new Error(`${label}: ${gold} gold pixels — kite missing`)
  if (red > 0) throw new Error(`${label}: ${red} simpler-red pixels — wrong mark`)
  return gold
}

// ─── the set ────────────────────────────────────────────────────────────────────

// Every file that exists under app/src-tauri/icons/, with the variant each platform wants.
// tile   — full-bleed rounded tile, transparent corners (desktop, Windows Store, android fg)
// opaque — the same tile flattened on white; an iOS AppIcon may not carry alpha
// inset  — tile at 5/6 of the canvas (android legacy launcher)
// round  — tile at 11/12 of the canvas, clipped to a circle (android round launcher)
// The geometry mirrors what `tauri icon` emitted for red, so the two verticals stay parallel.
const TARGETS = [
  ['32x32.png', 32, 'tile'], ['64x64.png', 64, 'tile'],
  ['128x128.png', 128, 'tile'], ['128x128@2x.png', 256, 'tile'],
  ['256x256.png', 256, 'tile'], ['icon.png', 512, 'tile'],
  ['Square30x30Logo.png', 30, 'tile'], ['Square44x44Logo.png', 44, 'tile'],
  ['Square71x71Logo.png', 71, 'tile'], ['Square89x89Logo.png', 89, 'tile'],
  ['Square107x107Logo.png', 107, 'tile'], ['Square142x142Logo.png', 142, 'tile'],
  ['Square150x150Logo.png', 150, 'tile'], ['Square284x284Logo.png', 284, 'tile'],
  ['Square310x310Logo.png', 310, 'tile'], ['StoreLogo.png', 50, 'tile'],
  ['ios/AppIcon-20x20@1x.png', 20, 'opaque'], ['ios/AppIcon-20x20@2x.png', 40, 'opaque'],
  ['ios/AppIcon-20x20@2x-1.png', 40, 'opaque'], ['ios/AppIcon-20x20@3x.png', 60, 'opaque'],
  ['ios/AppIcon-29x29@1x.png', 29, 'opaque'], ['ios/AppIcon-29x29@2x.png', 58, 'opaque'],
  ['ios/AppIcon-29x29@2x-1.png', 58, 'opaque'], ['ios/AppIcon-29x29@3x.png', 87, 'opaque'],
  ['ios/AppIcon-40x40@1x.png', 40, 'opaque'], ['ios/AppIcon-40x40@2x.png', 80, 'opaque'],
  ['ios/AppIcon-40x40@2x-1.png', 80, 'opaque'], ['ios/AppIcon-40x40@3x.png', 120, 'opaque'],
  ['ios/AppIcon-60x60@2x.png', 120, 'opaque'], ['ios/AppIcon-60x60@3x.png', 180, 'opaque'],
  ['ios/AppIcon-76x76@1x.png', 76, 'opaque'], ['ios/AppIcon-76x76@2x.png', 152, 'opaque'],
  ['ios/AppIcon-83.5x83.5@2x.png', 167, 'opaque'], ['ios/AppIcon-512@2x.png', 1024, 'opaque'],
  ['android/mipmap-mdpi/ic_launcher.png', 48, 'inset'],
  ['android/mipmap-mdpi/ic_launcher_round.png', 48, 'round'],
  ['android/mipmap-mdpi/ic_launcher_foreground.png', 108, 'tile'],
  ['android/mipmap-hdpi/ic_launcher.png', 49, 'inset'],
  ['android/mipmap-hdpi/ic_launcher_round.png', 49, 'round'],
  ['android/mipmap-hdpi/ic_launcher_foreground.png', 162, 'tile'],
  ['android/mipmap-xhdpi/ic_launcher.png', 96, 'inset'],
  ['android/mipmap-xhdpi/ic_launcher_round.png', 96, 'round'],
  ['android/mipmap-xhdpi/ic_launcher_foreground.png', 216, 'tile'],
  ['android/mipmap-xxhdpi/ic_launcher.png', 144, 'inset'],
  ['android/mipmap-xxhdpi/ic_launcher_round.png', 144, 'round'],
  ['android/mipmap-xxhdpi/ic_launcher_foreground.png', 324, 'tile'],
  ['android/mipmap-xxxhdpi/ic_launcher.png', 192, 'inset'],
  ['android/mipmap-xxxhdpi/ic_launcher_round.png', 192, 'round'],
  ['android/mipmap-xxxhdpi/ic_launcher_foreground.png', 432, 'tile'],
]

const INSET_FRAC = 5 / 6
const ROUND_FRAC = 11 / 12
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]

const contentSize = (size, kind) =>
  kind === 'inset' ? Math.round(size * INSET_FRAC)
  : kind === 'round' ? Math.round(size * ROUND_FRAC)
  : size

// Collect every pixel size the renderer has to produce, so each one is drawn from the vector.
const NEEDED = new Set([...ICO_SIZES, ...ICNS_SIZES, 1024])
for (const [, size, kind] of TARGETS) NEEDED.add(contentSize(size, kind))

const sha = b => crypto.createHash('sha256').update(b).digest('hex')

const tiles = renderAll([...NEEDED])
let goldTotal = 0
for (const [size, img] of tiles) goldTotal += assertMark(img, `${size}px cell`)
console.log(`${tiles.size} sizes rasterised from the vector in one pass — ${goldTotal} gold px, 0 red px`)

const at = size => {
  const t = tiles.get(size)
  if (!t) throw new Error(`no cell rasterised at ${size}px`)
  return t
}

function variant(size, kind) {
  if (kind === 'tile') return at(size)
  if (kind === 'opaque') return overBackground(at(size), [255, 255, 255])
  if (kind === 'inset') return place(at(contentSize(size, kind)), size, false)
  if (kind === 'round') return place(at(contentSize(size, kind)), size, true)
  throw new Error(`unknown variant ${kind}`)
}

const files = new Map()
files.set(path.relative(ROOT, MASTER), pngEncode(at(1024)))
for (const [rel, size, kind] of TARGETS) {
  files.set(path.join('app/src-tauri/icons', rel), pngEncode(variant(size, kind)))
}
files.set('app/src-tauri/icons/icon.ico',
  buildIco(ICO_SIZES.map(size => ({ size, png: pngEncode(at(size)) }))))
files.set('app/src-tauri/icons/icon.icns', buildIcns([
  ['is32', icnsRle(at(16))], ['s8mk', icnsAlpha(at(16))],
  ['il32', icnsRle(at(32))], ['l8mk', icnsAlpha(at(32))],
  ['ic07', pngEncode(at(128))], ['ic08', pngEncode(at(256))],
  ['ic09', pngEncode(at(512))], ['ic10', pngEncode(at(1024))],
  ['ic11', pngEncode(at(32))], ['ic12', pngEncode(at(64))],
  ['ic13', pngEncode(at(256))], ['ic14', pngEncode(at(512))],
]))

let drift = 0
const manifest = []
for (const [rel, buf] of [...files].sort()) {
  const abs = path.join(ROOT, rel)
  const before = fs.existsSync(abs) ? sha(fs.readFileSync(abs)) : null
  const after = sha(buf)
  const state = before === after ? 'same' : before === null ? 'new' : 'changed'
  if (state !== 'same') drift++
  if (!CHECK) {
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, buf)
  }
  manifest.push(`${after.slice(0, 16)}  ${String(buf.length).padStart(8)}  ${state.padEnd(7)}  ${rel.replace(/\\/g, '/')}`)
}

console.log(manifest.join('\n'))
console.log(`\n${files.size} files, ${drift} ${CHECK ? 'drifted from' : 'written to'} disk`)
if (CHECK && drift) {
  console.error('DRIFT: icons on disk do not match the mark in favicon.svg')
  process.exit(1)
}
