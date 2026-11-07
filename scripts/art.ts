// Renders the plugin icon and the documentation pictures from the same screen code the mod draws with: the README's
// line-up and animation, each character for docs/yokai.md, and each setting off and on for docs/settings.md.
// Run with `bun scripts/art.ts` after changing a sprite or the screen.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

import { cells, colorOf, scene, screenRows, W, type ScreenLook } from '../hooks/sprites'

mkdirSync('assets/settings', { recursive: true })
mkdirSync('assets/yokai', { recursive: true })

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ihdr = (w: number, h: number) => { const b = Buffer.alloc(13); b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4); b[8] = 8; b[9] = 2; return b }
const rows = (w: number, h: number, rgb: Uint8Array) => {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1)
  return deflateSync(raw)
}
const png = (w: number, h: number, rgb: Uint8Array) =>
  Buffer.concat([SIG, chunk('IHDR', ihdr(w, h)), chunk('IDAT', rows(w, h, rgb)), chunk('IEND', Buffer.alloc(0))])
// Animated PNG: every frame the same size, `ms` each, looping.
function apng(w: number, h: number, frames: Uint8Array[], ms: number) {
  const parts = [SIG, chunk('IHDR', ihdr(w, h))]
  const actl = Buffer.alloc(8); actl.writeUInt32BE(frames.length, 0); actl.writeUInt32BE(0, 4)
  parts.push(chunk('acTL', actl))
  let seq = 0
  frames.forEach((rgb, i) => {
    const fc = Buffer.alloc(26)
    fc.writeUInt32BE(seq++, 0); fc.writeUInt32BE(w, 4); fc.writeUInt32BE(h, 8); fc.writeUInt32BE(0, 12); fc.writeUInt32BE(0, 16)
    fc.writeUInt16BE(ms, 20); fc.writeUInt16BE(1000, 22); fc[24] = 0; fc[25] = 0
    parts.push(chunk('fcTL', fc))
    const data = rows(w, h, rgb)
    if (i === 0) parts.push(chunk('IDAT', data))
    else { const s = Buffer.alloc(4); s.writeUInt32BE(seq++); parts.push(chunk('fdAT', Buffer.concat([s, data]))) }
  })
  parts.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

// A screen as an RGB picture: each cell `px` pixels wide and 2·px tall (a terminal cell), drawn as the terminal
// draws ▀ (top half the glyph colour, bottom the background) or a braille pattern (dots on the background).
type Pic = { w: number; h: number; rgb: Uint8Array }
function picture(b64: string, cols: number, px = 6): Pic {
  const bytes = Buffer.from(b64, 'base64'), words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4)
  const r = screenRows(cols), w = cols * px, h = r * px * 2, rgb = new Uint8Array(w * h * 3)
  const put = (x: number, y: number, c: number) => { const i = (y * w + x) * 3; rgb[i] = c >> 16; rgb[i + 1] = (c >> 8) & 255; rgb[i + 2] = c & 255 }
  for (let cy = 0; cy < r; cy++) for (let cx = 0; cx < cols; cx++) {
    const i = (cy * cols + cx) * 3, ch = words[i]!, fg = words[i + 1]!, bg = words[i + 2]!
    for (let y = 0; y < px * 2; y++) for (let x = 0; x < px; x++) {
      let c = bg
      if (ch === 0x2580) c = y < px ? fg : bg
      else if (ch >= 0x2800 && ch <= 0x28ff) {
        const bits = ch - 0x2800, dx = x < px / 2 ? 0 : 1, dy = Math.floor((y * 4) / (px * 2))
        const bit = [[0x1, 0x8], [0x2, 0x10], [0x4, 0x20], [0x40, 0x80]][dy]![dx]!
        // Each dot sits at the centre of its quarter column and eighth row, a round dot with room around it.
        const cx = (dx + 0.5) * (px / 2), cy = (dy + 0.5) * (px / 2), r = px * 0.17
        if (bits & bit && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) c = fg
      }
      put(cx * px + x, cy * px * 2 + y, c)
    }
  }
  return { w, h, rgb }
}
// Pictures side by side on a backdrop, `gap` pixels apart.
function row(pics: Pic[], gap = 18, back = 0x15171c): Pic {
  const w = pics.reduce((n, p) => n + p.w, 0) + gap * (pics.length + 1), h = Math.max(...pics.map(p => p.h)) + gap * 2
  const rgb = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = back >> 16; rgb[i * 3 + 1] = (back >> 8) & 255; rgb[i * 3 + 2] = back & 255 }
  let x0 = gap
  for (const p of pics) {
    for (let y = 0; y < p.h; y++) rgb.set(p.rgb.subarray(y * p.w * 3, (y + 1) * p.w * 3), ((y + gap) * w + x0) * 3)
    x0 += p.w + gap
  }
  return { w, h, rgb }
}
function grid(pics: Pic[], perRow: number, gap = 18): Pic {
  const lines: Pic[] = []
  for (let i = 0; i < pics.length; i += perRow) lines.push(row(pics.slice(i, i + perRow), gap))
  const w = Math.max(...lines.map(l => l.w)), h = lines.reduce((n, l) => n + l.h, 0) - gap * (lines.length - 1)
  const rgb = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = 0x15; rgb[i * 3 + 1] = 0x17; rgb[i * 3 + 2] = 0x1c }
  let y0 = 0
  for (const l of lines) { for (let y = 0; y < l.h; y++) rgb.set(l.rgb.subarray(y * l.w * 3, (y + 1) * l.w * 3), ((y + y0) * w) * 3); y0 += l.h - gap }
  return { w, h, rgb }
}
const save = (path: string, p: Pic) => writeFileSync(path, png(p.w, p.h, p.rgb))

// Icon: the soul flame alone, 16 × 16 LCD pixels on a 512 px square, in the LCD's two greys.
{
  const flame = scene('idle', { ch: 'hitodama' }, 4), crop = { x: 9, y: 7, w: 14, h: 14 }, scale = 32, gap = 1
  const w = (crop.w + 2 * gap) * scale, h = (crop.h + 2 * gap) * scale, rgb = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) rgb.set([0xc4, 0xcc, 0xb2], i * 3)
  for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) {
    if (!flame[(y + crop.y) * W + x + crop.x]) continue
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) rgb.set([0x23, 0x28, 0x20], (((gap + y) * scale + dy) * w + (gap + x) * scale + dx) * 3)
  }
  writeFileSync('.claude-plugin/icon.png', png(w, h, rgb))
}

// The default look, as register.tsx passes it, and one screen of it.
const DEFAULT = { lcd: false, detail: 'pixel', fine: true, kinds: true, scenery: true, particles: true } as const
const screen = (ch: string, id: string, t: number, cols = 32, over: Partial<ScreenLook> = {}, night = false, px = 6) =>
  picture(cells(scene(id, { ch, poops: id === 'dirty' ? 2 : 0 }, t), night, cols, { ...DEFAULT, color: colorOf(ch), scene: id, t, ...over }), cols, px)

const LINE = ['egg', 'hitodama', 'sunekosuri', 'kitsune', 'tanuki', 'kyubi', 'tengu', 'bakeneko', 'kappa', 'tsuchinoko', 'nuppeppo', 'karakasa']
save('assets/yokai.png', grid(LINE.map(ch => screen(ch, ch === 'egg' ? 'egg' : 'idle', 2, 32, { particles: false }, false, 4)), 6, 14))
for (const ch of LINE.slice(1)) save(`assets/yokai/${ch}.png`, screen(ch, 'idle', 2, 32, { particles: false }, false, 4))

// The pet eating, 64 columns, eight frames at the pane's half second.
const eat = Array.from({ length: 8 }, (_, t) => screen('kitsune', 'eat', t, 64, {}, false, 4))
writeFileSync('assets/eat.png', apng(eat[0]!.w, eat[0]!.h, eat.map(f => f.rgb), 500))

// Each setting off and on.
const pair = (name: string, off: Pic, on: Pic) => save(`assets/settings/${name}.png`, row([off, on]))
pair('colour-screen', screen('kitsune', 'eat', 1, 32, { lcd: true }), screen('kitsune', 'eat', 1))
pair('detail', screen('kitsune', 'idle', 2, 32, {}, false, 12), screen('kitsune', 'idle', 2, 32, { detail: 'braille' }, false, 12))
pair('small-pixels', screen('kappa', 'idle', 2, 64, { fine: false }, false, 4), screen('kappa', 'idle', 2, 64, {}, false, 4))
pair('item-colours', screen('tanuki', 'dirty', 1, 32, { kinds: false }), screen('tanuki', 'dirty', 1))
pair('scenery', screen('tengu', 'sleep', 1, 32, { scenery: false }, true), screen('tengu', 'sleep', 1, 32, {}, true))
pair('particles', screen('bakeneko', 'eat', 0, 32, { particles: false }), screen('bakeneko', 'eat', 0))
