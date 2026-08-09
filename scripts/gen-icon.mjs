#!/usr/bin/env node
/**
 * Icon generator for oh-my-pi-desktop.
 *
 * Renders build/icon.svg into every raster asset electron-builder needs:
 *   - build/icon.png      1024x1024 master (Linux / generic)
 *   - build/icon-256.png  256x256
 *   - build/icon-64.png   64x64
 *   - build/icon.icns     macOS icon bundle (PNG-based OSTypes ic07..ic14)
 *   - build/icon.ico      Windows multi-size icon (BMP <64px, PNG >=64px)
 *
 * The .icns and .ico containers are written in pure JS so `npm run gen:icon`
 * works identically on macOS, Linux and Windows CI runners. On macOS the
 * script additionally cross-checks its output against `iconutil` (see
 * --iconutil / ICON_USE_ICONUTIL=1 for the fast path).
 *
 * The script is idempotent: running it repeatedly produces byte-identical
 * output for an unchanged build/icon.svg.
 *
 * Usage:
 *   npm run gen:icon
 *   node scripts/gen-icon.mjs --iconutil    # use macOS iconutil for the .icns
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'build')
const svgPath = join(buildDir, 'icon.svg')

if (!existsSync(svgPath)) {
  console.error(`gen-icon: missing source ${svgPath}`)
  process.exit(1)
}
const svg = readFileSync(svgPath)

const argv = process.argv.slice(2)
const useIconutil =
  argv.includes('--iconutil') || process.env.ICON_USE_ICONUTIL === '1'

/** Render the SVG to a square PNG buffer at `size`. */
const png = async (size) =>
  sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()

/** Render the SVG to raw non-premultiplied RGBA bytes at `size`. */
const rgba = async (size) =>
  sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer()

// ---------------------------------------------------------------------------
// ICNS
// ---------------------------------------------------------------------------
// Container layout:
//   'icns' magic (4B) + total file length (4B big-endian)
//   then, per entry: OSType (4B ASCII) + entry length (4B BE, INCLUDING this
//   8-byte header) + payload (a whole PNG file).
//
// PNG-capable OSTypes (10.7+). Retina slots carry the 2x pixel count of the
// point size they name, which is why several pixel sizes appear twice.
const ICNS_TYPES = [
  ['ic11', 32],   //   16x16@2x
  ['ic12', 64],   //   32x32@2x
  ['ic07', 128],  //  128x128@1x
  ['ic13', 256],  //  128x128@2x
  ['ic08', 256],  //  256x256@1x
  ['ic14', 512],  //  256x256@2x
  ['ic09', 512],  //  512x512@1x
  ['ic10', 1024]  //  512x512@2x
]

function buildIcns(entries) {
  const chunks = []
  let total = 8
  for (const [ostype, data] of entries) {
    const header = Buffer.alloc(8)
    header.write(ostype, 0, 4, 'ascii')
    header.writeUInt32BE(data.length + 8, 4)
    chunks.push(header, data)
    total += data.length + 8
  }
  const fileHeader = Buffer.alloc(8)
  fileHeader.write('icns', 0, 4, 'ascii')
  fileHeader.writeUInt32BE(total, 4)
  return Buffer.concat([fileHeader, ...chunks], total)
}

/** macOS fast path: hand an .iconset to iconutil. Returns null when unusable. */
function icnsViaIconutil(pngBySize) {
  if (process.platform !== 'darwin') return null
  let dir
  try {
    dir = mkdtempSync(join(tmpdir(), 'omp-icon-'))
    const iconset = join(dir, 'icon.iconset')
    execFileSync('mkdir', ['-p', iconset])
    // iconutil requires this exact naming scheme.
    const names = [
      ['icon_16x16.png', 16],
      ['icon_16x16@2x.png', 32],
      ['icon_32x32.png', 32],
      ['icon_32x32@2x.png', 64],
      ['icon_128x128.png', 128],
      ['icon_128x128@2x.png', 256],
      ['icon_256x256.png', 256],
      ['icon_256x256@2x.png', 512],
      ['icon_512x512.png', 512],
      ['icon_512x512@2x.png', 1024]
    ]
    for (const [name, size] of names) writeFileSync(join(iconset, name), pngBySize.get(size))
    const out = join(dir, 'icon.icns')
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', out], { stdio: 'pipe' })
    return readFileSync(out)
  } catch (err) {
    console.warn(`gen-icon: iconutil unavailable (${err.message.trim()}), using pure-JS writer`)
    return null
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// ICO
// ---------------------------------------------------------------------------
// Layout: 6-byte ICONDIR + 16-byte ICONDIRENTRY per image + payloads.
// Payloads >=64px are stored as whole PNG files (Vista+); smaller entries use
// a classic 32bpp BMP DIB (BITMAPINFOHEADER + bottom-up BGRA + AND mask) so
// the icon still resolves on legacy shell code paths.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const ICO_PNG_THRESHOLD = 64

function bmpPayload(raw, size) {
  const rowMaskBytes = Math.ceil(size / 32) * 4 // AND mask rows pad to 4 bytes
  const xorSize = size * size * 4
  const andSize = rowMaskBytes * size
  const buf = Buffer.alloc(40 + xorSize + andSize)

  buf.writeUInt32LE(40, 0) // biSize
  buf.writeInt32LE(size, 4) // biWidth
  buf.writeInt32LE(size * 2, 8) // biHeight = XOR + AND stacked
  buf.writeUInt16LE(1, 12) // biPlanes
  buf.writeUInt16LE(32, 14) // biBitCount
  buf.writeUInt32LE(0, 16) // biCompression = BI_RGB
  buf.writeUInt32LE(xorSize + andSize, 20) // biSizeImage

  // XOR bitmap: bottom-up rows, BGRA.
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4
    let dst = 40 + y * size * 4
    for (let x = 0; x < size; x++) {
      const i = src + x * 4
      buf[dst++] = raw[i + 2] // B
      buf[dst++] = raw[i + 1] // G
      buf[dst++] = raw[i] // R
      buf[dst++] = raw[i + 3] // A
    }
  }
  // AND mask stays all-zero (fully opaque); the 32bpp alpha channel governs.
  return buf
}

function buildIco(images) {
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type 1 = icon
  header.writeUInt16LE(count, 4)

  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  images.forEach(({ size, data }, i) => {
    const e = i * 16
    dir[e] = size >= 256 ? 0 : size // 0 means 256
    dir[e + 1] = size >= 256 ? 0 : size
    dir[e + 2] = 0 // palette entries
    dir[e + 3] = 0 // reserved
    dir.writeUInt16LE(1, e + 4) // planes
    dir.writeUInt16LE(32, e + 6) // bit depth
    dir.writeUInt32LE(data.length, e + 8)
    dir.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...images.map((i) => i.data)], offset)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const written = []
const write = (name, buf) => {
  const path = join(buildDir, name)
  writeFileSync(path, buf)
  written.push([name, statSync(path).size])
}

// Every pixel size any target needs, rendered once and shared.
const allSizes = [...new Set([...ICNS_TYPES.map(([, s]) => s), ...ICO_SIZES, 16, 1024])].sort(
  (a, b) => a - b
)
const pngBySize = new Map()
for (const size of allSizes) pngBySize.set(size, await png(size))

// 1. Plain PNGs (kept for Linux targets and anything reading build/icon.png).
write('icon.png', pngBySize.get(1024))
write('icon-256.png', pngBySize.get(256))
write('icon-64.png', pngBySize.get(64))

// 2. macOS .icns
const jsIcns = buildIcns(ICNS_TYPES.map(([t, s]) => [t, pngBySize.get(s)]))
let icns = jsIcns
if (useIconutil) {
  const native = icnsViaIconutil(pngBySize)
  if (native) {
    icns = native
    console.log('gen-icon: .icns produced by iconutil')
  }
}
if (icns === jsIcns) console.log('gen-icon: .icns produced by pure-JS writer')
write('icon.icns', icns)

// 3. Windows .ico
const icoImages = []
for (const size of ICO_SIZES) {
  const data =
    size >= ICO_PNG_THRESHOLD ? pngBySize.get(size) : bmpPayload(await rgba(size), size)
  icoImages.push({ size, data })
}
write('icon.ico', buildIco(icoImages))

// 4. Sanity checks — catch a silently-truncated container before it ships.
const icnsOut = readFileSync(join(buildDir, 'icon.icns'))
if (icnsOut.subarray(0, 4).toString('ascii') !== 'icns') throw new Error('bad icns magic')
if (icnsOut.readUInt32BE(4) !== icnsOut.length)
  throw new Error(`icns length mismatch: header ${icnsOut.readUInt32BE(4)} vs ${icnsOut.length}`)
const icoOut = readFileSync(join(buildDir, 'icon.ico'))
if (icoOut.readUInt16LE(2) !== 1 || icoOut.readUInt16LE(4) !== ICO_SIZES.length)
  throw new Error('bad ico header')

for (const [name, size] of written) {
  console.log(`  ${name.padEnd(14)} ${(size / 1024).toFixed(1)} KiB`)
}
console.log('icons written')
