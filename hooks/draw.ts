// The 32 × 24 pixel grid and the primitives every character is drawn with.
export const W = 32
export const H = 24

export type Grid = { a: Uint8Array; set: (x: number, y: number, v?: number) => void }
export type Mask = (x: number, y: number) => boolean
export type Shape = {
  m: Mask; solid?: boolean; top: number; left: number; right: number; cy: number
  eye: { cx?: number; y: number; gap: number; ink?: number; big?: boolean; beady?: boolean }
  mouth: { y: number; small?: boolean; ink?: number } | null
  deco?: (g: Grid) => void; over?: (g: Grid) => void; feet?: [number, number][][]
}
// A character: (centre, ground line, squat 0..1, animation phase) → shape
export type CharDraw = (cx: number, gy: number, q: number, ph: number) => Shape

export function grid(): Grid {
  const a = new Uint8Array(W * H)
  return {
    a,
    set(x, y, v = 1) {
      x = Math.floor(x); y = Math.floor(y)
      if (x >= 0 && x < W && y >= 0 && y < H) a[y * W + x] = v
    },
  }
}
export function bmp(g: Grid, x0: number, y0: number, rows: string[], mirror = false, ink = 1) {
  x0 = Math.floor(x0); y0 = Math.floor(y0)
  rows.forEach((r, y) => {
    const s = mirror ? [...r].reverse() : [...r]
    s.forEach((c, x) => {
      if (c === '#') g.set(x0 + x, y0 + y, ink)
      else if (c === 'o') g.set(x0 + x, y0 + y, 0)
    })
  })
}
export function rect(g: Grid, x: number, y: number, w: number, h: number) {
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) g.set(x + i, y + j, i === 0 || j === 0 || i === w - 1 || j === h - 1 ? 1 : 0)
}
export function bubble(g: Grid, x: number, y: number, w: number, h: number) {
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
    const ci = i === 0 || i === w - 1, cj = j === 0 || j === h - 1
    if (ci && cj) continue
    g.set(x + i, y + j, ci || cj ? 1 : 0)
  }
}
export const E = (cx: number, cy: number, rx: number, ry: number): Mask => (x, y) => {
  const a = (x + 0.5 - cx) / rx, b = (y + 0.5 - cy) / ry
  return a * a + b * b <= 1
}
export const OR = (...ms: Mask[]): Mask => (x, y) => ms.some(m => m(x, y))
// Rotated ellipse: ry is the long axis, a the clockwise tilt from vertical.
export const RE = (cx: number, cy: number, rx: number, ry: number, a: number): Mask => {
  const c = Math.cos(a), s = Math.sin(a)
  return (x, y) => { const dx = x + 0.5 - cx, dy = y + 0.5 - cy, u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry; return u * u + v * v <= 1 }
}
// Upward triangle: height h, k is the half-width per pixel of height.
export const TRI = (ax: number, ay: number, h: number, k: number): Mask => (x, y) => { const d = y + 0.5 - ay; return d >= 0 && d <= h && Math.abs(x + 0.5 - ax) <= d * k + 0.5 }
export function shape(g: Grid, m: Mask, solid?: boolean) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (m(x, y)) g.set(x, y, solid || !m(x - 1, y) || !m(x + 1, y) || !m(x, y - 1) || !m(x, y + 1) ? 1 : 0)
  }
}
