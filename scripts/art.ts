// Renders the plugin icon and the README line-up from the same sprite code the mod draws with.
// Run with `bun scripts/art.ts` after changing a sprite.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

import { yokai } from '../hooks/yokai'
import { H, scene, W } from '../hooks/sprites'

const BG = [0xc4, 0xcc, 0xb2], PX = [0x23, 0x28, 0x20]

function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// Paints pixel art at `scale` pixels per LCD pixel, `gap` LCD pixels between frames.
function sheet(frames: Uint8Array[], cols: number, scale: number, crop = { x: 0, y: 0, w: W, h: H }, gap = 2) {
  const rows = Math.ceil(frames.length / cols)
  const w = (cols * crop.w + (cols + 1) * gap) * scale, h = (rows * crop.h + (rows + 1) * gap) * scale
  const rgb = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) rgb.set(BG, i * 3)
  frames.forEach((px, i) => {
    const ox = gap + (i % cols) * (crop.w + gap), oy = gap + Math.floor(i / cols) * (crop.h + gap)
    for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) {
      if (!px[(y + crop.y) * W + x + crop.x]) continue
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) rgb.set(PX, (((oy + y) * scale + dy) * w + (ox + x) * scale + dx) * 3)
    }
  })
  return png(w, h, rgb)
}

// Icon: the soul flame alone, 16 × 16 LCD pixels on a 512 px square.
const flame = scene('idle', { ch: 'hitodama' }, 4)
writeFileSync('.claude-plugin/icon.png', sheet([flame], 1, 32, { x: 9, y: 7, w: 14, h: 14 }, 1))
// Line-up for the README: the egg, then every character of the line standing still.
const still = [scene('egg', { ch: 'egg' }, 0), ...Object.keys(yokai.chars).map(ch => scene('idle', { ch }, 4))]
writeFileSync('assets/yokai.png', sheet(still, 6, 6))
