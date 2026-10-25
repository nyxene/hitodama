// Icons and screen scenes. A scene → Uint8Array (1 = pixel on). Characters live in their lines.
import { bmp, bubble, E, grid, H, rect, shape, W, type CharDraw, type Grid, type Mask, type Shape } from './draw'
import { DRAW } from './lines'

export { H, W }

type Look = { dx: number; dy: number }
type Pose = {
  ch: string; cx: number; gy: number; phase: number; eyes: string; mouth: string
  feet: boolean | 'tap'; sq?: number; look?: Look; pack?: { w: number; h: number } | null
}
type Bounds = { top: number; right: number; left: number; cy: number; cx: number }

const IC = {
  z: ['####', '..#.', '.#..', '####'],
  heart: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  rice: ['..##..', '.#..#.', '#....#', '#.##.#', '######'],
  candy: ['#.###.#', '###.###', '#.###.#'],
  poop: ['..#..', '.##..', '.###.', '#####'],
  skull: ['.###.', '#.#.#', '#####', '.#.#.'],
  plus: ['.#.', '###', '.#.'],
  syringe: ['....#', '...#.', '####.', '#oo#.', '####.'],
  drop: ['.#', '##'],
  vein: ['##.##', '#...#', '.....', '#...#', '##.##'],
  clock: ['.###.', '#.#.#', '#.###', '#...#', '.###.'],
  friend: ['.###.', '#.#.#', '#####'],
  bang: ['#', '#', '.', '#'],
  bigBang: ['##', '##', '##', '##', '..', '##'],
  no: ['#.#', '.#.', '#.#'],
  arrowR: ['#.', '##', '#.'],
  arrowL: ['.#', '##', '.#'],
}
const EYE: Record<string, string[]> = {
  open: ['#', '#'], closed: ['...', '###'], happy: ['.#.', '#.#'], x: ['#.#', '.#.', '#.#'],
  half: ['..', '##'], wide: ['##', '##'], angry: ['#..', '.#.', '.#.'],
}
const MOUTH: Record<string, string[]> = {
  smile: ['#..#', '.##.'], grin: ['####', '.##.'], flat: ['.##.'], open: ['.##.', '#..#', '.##.'],
  o: ['.##.', '.##.'], frown: ['.##.', '#..#'], wavy: ['#.#.', '.#.#'], chew: ['####'],
}

const CH: Record<string, CharDraw> = {
  ...DRAW,
  // The ghost shown after death, shared by every line.
  obake: (cx, gy, _q, ph) => {
    const cy = gy - 7, head = E(cx, cy, 5, 4.5)
    const m: Mask = (x, y) => {
      if (y + 0.5 <= cy) return head(x, y)
      if (Math.abs((x + 0.5 - cx) / 5) >= 1) return false
      return y + 0.5 <= cy + 4.5 - ((((x + ph) % 4) + 4) % 4 < 2 ? 1 : 0)
    }
    return {
      m, top: cy - 4.5, left: cx - 5, right: cx + 5, cy,
      eye: { y: Math.round(cy) - 2, gap: 2 }, mouth: { y: Math.round(cy) + 1 },
      deco: g => { g.set(cx - 6, cy + 1); g.set(cx + 5, cy + 1) },
    }
  },
}
function eyes(g: Grid, cx: number, e: Shape['eye'], o: Pose) {
  let kind = o.eyes
  if (kind === 'open' && e.big) kind = 'wide'
  const rows = e.beady && kind === 'open' ? ['#'] : EYE[kind] ?? EYE.open!
  const w = rows[0]!.length, dx = o.look?.dx ?? 0, dy = o.look?.dy ?? 0
  const lx = cx - e.gap - Math.floor((w - 1) / 2), rx = 2 * cx - 1 - (lx + w - 1), ink = e.ink === 0 ? 0 : 1
  bmp(g, lx + dx, e.y + dy, rows, false, ink)
  bmp(g, rx + dx, e.y + dy, rows, true, ink)
}
function mouth(g: Grid, cx: number, m: NonNullable<Shape['mouth']>, o: Pose) {
  const rows = m.small ? ['.##.'] : MOUTH[o.mouth] ?? MOUTH.smile!
  const dx = o.look?.dx ?? 0, dy = Math.max(0, o.look?.dy ?? 0)
  bmp(g, cx - rows[0]!.length / 2 + dx, m.y + dy, rows, false, m.ink === 0 ? 0 : 1)
}
function drawPet(g: Grid, o: Pose): Bounds {
  const cx = Math.round(o.cx), C = (CH[o.ch] ?? CH.obake!)(cx, Math.round(o.gy), o.sq ?? 0, o.phase)
  if (o.pack) {
    const { w, h } = o.pack, px = Math.round(C.left - w + 3), py = Math.round(C.cy - h / 2 + 1)
    rect(g, px, py, w, h)
    for (let i = 1; i < w - 1; i++) g.set(px + i, py + 2, 1)
  }
  shape(g, C.m, C.solid)
  C.deco?.(g)
  if (C.feet && o.feet !== false) C.feet.forEach((leg, i) => leg.forEach(([x, y]) => g.set(x, y - (o.feet === 'tap' && i === 1 ? o.phase % 2 : 0))))
  eyes(g, C.eye.cx ?? cx, C.eye, o)
  if (C.mouth) mouth(g, cx, C.mouth, o)
  C.over?.(g)
  return { top: Math.floor(C.top), right: Math.round(C.right), left: Math.round(C.left), cy: Math.round(C.cy), cx }
}
function drawEgg(g: Grid, cx: number, cy: number, part: 'whole' | 'top' | 'bottom') {
  const zig = (x: number) => cy - 1 + (((x % 2) + 2) % 2)
  shape(g, (x, y) => {
    const dy = y + 0.5 - cy, ry = dy < 0 ? 6.5 : 4.6, dx = (x + 0.5 - cx) / 4.6
    if (dx * dx + (dy / ry) ** 2 > 1) return false
    return part === 'whole' || (part === 'bottom' ? y >= zig(x) : y < zig(x))
  })
  if (part !== 'top') { g.set(cx - 2, cy + 1); g.set(cx - 1, cy + 1); g.set(cx + 1, cy + 2) }
  if (part !== 'bottom') { g.set(cx - 1, cy - 4); g.set(cx + 1, cy - 3); g.set(cx + 2, cy - 3) }
}
function packFor(load: number) {
  if (load < 50) return null
  if (load < 80) return { w: 4, h: 5 }
  if (load < 90) return { w: 5, h: 7 }
  return { w: 7, h: 9 }
}
const WALK = [0, 1, 2, 1, 0, -1, -2, -1]

export type SceneOpts = { ch: string; load?: number; poops?: number; agents?: number; game?: { dir: number; wins: boolean[] } }

export function scene(id: string, o: SceneOpts, t: number): Uint8Array {
  const g = grid()
  const p: Pose = { ch: o.ch, cx: 16 + WALK[t % 8]!, gy: 19, phase: t, eyes: t % 9 === 0 ? 'closed' : 'open', mouth: 'smile', feet: true }
  let showPet = true, load = o.load ?? 0, poops = o.poops ?? 0, agents = o.agents ?? 0, invert = false
  let B: Bounds = { top: 8, right: 22, left: 10, cy: 12, cx: 16 }
  const before: (() => void)[] = [], after: (() => void)[] = []
  const sweat = () => { if (t % 2) bmp(g, B.right + 1, B.top, IC.drop) }
  switch (id) {
    case 'egg':
      showPet = false; drawEgg(g, 16 + [0, 1, 0, -1][t % 4]!, 12, 'whole'); break
    case 'hatch':
      Object.assign(p, { cx: 16, gy: 14, eyes: 'wide', feet: false }); load = 0
      after.push(() => { drawEgg(g, 16, 12, 'bottom'); drawEgg(g, 16 + (t % 2 ? 1 : -1), 6 - (t % 2), 'top') })
      break
    case 'evolve':
      Object.assign(p, { cx: 16, eyes: 'happy' }); invert = t % 2 === 0; break
    case 'listen':
      Object.assign(p, { cx: 16, look: { dx: -1, dy: 1 }, mouth: 'flat' })
      after.push(() => { for (let i = 0; i <= t % 4; i++) g.set(2 + i * 2, 22) })
      break
    case 'happy':
      Object.assign(p, { cx: 16, eyes: 'happy', mouth: 'grin' }); p.gy -= t % 2 ? 3 : 0
      after.push(() => [[3, 4], [27, 6], [4, 15], [27, 15]].forEach(([x, y], i) => { if ((t + i) % 2) bmp(g, x!, y!, IC.plus) }))
      break
    case 'angry':
      Object.assign(p, { cx: 16 + (t % 2 ? 1 : -1), eyes: 'angry', mouth: 'frown' })
      after.push(() => { if (t % 2) bmp(g, 25, 2, IC.vein) })
      break
    case 'bored':
      Object.assign(p, { cx: 14, eyes: 'half', mouth: 'flat', look: { dx: 1, dy: 0 } })
      after.push(() => { for (let i = 0; i < t % 4; i++) g.set(24 + i * 2, 5) })
      break
    case 'call':
      Object.assign(p, { cx: 15, mouth: t % 2 ? 'open' : 'o' })
      after.push(() => { if (t % 2) { bmp(g, B.right + 2, B.top, IC.bang); bmp(g, B.right + 4, B.top - 1, IC.bang) } })
      break
    case 'hungry':
      Object.assign(p, { cx: 13, mouth: t % 2 ? 'open' : 'o' })
      after.push(() => { bubble(g, 21, 0, 10, 8); if (t % 2) bmp(g, 23, 1, IC.rice); g.set(20, 8); g.set(19, 9) })
      break
    case 'dirty':
      Object.assign(p, { eyes: 'half', mouth: 'frown' }); poops = Math.max(poops, 2); break
    case 'tired':
      Object.assign(p, { cx: 15, eyes: 'half', mouth: 'flat', sq: 0.5 }); after.push(sweat); break
    case 'sick':
      Object.assign(p, { cx: 13, eyes: 'half', mouth: 'wavy' })
      after.push(() => { if (t % 2) bmp(g, B.right + 2, B.top, IC.skull) })
      break
    case 'sleep': case 'limit_hit':
      Object.assign(p, { cx: 15, eyes: 'closed', mouth: 'flat', sq: 1, feet: false })
      after.push(() => {
        ;[[23, 7], [25, 4], [27, 1]].slice(0, (t % 3) + 1).forEach(([x, y]) => bmp(g, x!, y!, IC.z))
        if (id === 'limit_hit') bmp(g, 3, 2, IC.clock)
      })
      break
    case 'night_grumpy':
      Object.assign(p, { cx: 15, eyes: 'half', mouth: 'frown' })
      after.push(() => { g.set(22, 8); if (t % 2) { g.set(24, 6); bmp(g, 3, 3, IC.vein) } })
      break
    case 'tantrum':
      Object.assign(p, { cx: 17 + (t % 2 ? 1 : 0), eyes: 'angry', mouth: 'frown', look: { dx: 1, dy: 0 } })
      after.push(() => { bmp(g, 2, 13, IC.rice); bmp(g, 3, 9, IC.no); if (t % 2) bmp(g, 26, 2, IC.bang) })
      break
    case 'scold':
      Object.assign(p, { cx: 18, eyes: 'closed', mouth: 'frown', sq: 0.5 })
      after.push(() => { if (t % 2) bmp(g, 4, 5, IC.bigBang); sweat() })
      break
    case 'refuse':
      Object.assign(p, { cx: 16 + (t % 2 ? 1 : -1), eyes: 'closed', mouth: 'frown', look: { dx: t % 2 ? 1 : -1, dy: 0 } })
      after.push(() => bmp(g, 3, 9, IC.no))
      break
    case 'eat':
      Object.assign(p, { cx: 12, eyes: t % 2 ? 'closed' : 'happy', mouth: t % 2 ? 'chew' : 'o' })
      after.push(() => { bmp(g, 23, 13, IC.rice); for (let i = 0; i < t % 5; i++) for (let y = 13; y < 18; y++) g.set(23 + i, y, 0) })
      break
    case 'snack':
      Object.assign(p, { cx: 12, eyes: 'happy', mouth: t % 2 ? 'chew' : 'smile' })
      after.push(() => { bmp(g, 23, 15, IC.candy); bmp(g, 22, 5 - (t % 3), IC.heart) })
      break
    case 'game': {
      const dir = o.game?.dir ?? 0
      Object.assign(p, { cx: 16, look: { dx: dir, dy: 0 }, mouth: dir ? 'grin' : 'flat', eyes: dir ? 'happy' : 'open' })
      after.push(() => {
        if (dir) bmp(g, dir < 0 ? 2 : 28, 11, dir < 0 ? IC.arrowL : IC.arrowR)
        else if (t % 2) { bmp(g, 2, 11, IC.arrowL); bmp(g, 28, 11, IC.arrowR) }
        const wins = o.game?.wins ?? []
        for (let i = 0; i < 5; i++) { const x = 11 + i * 2; if (wins[i]) g.set(x, 1); if (i < wins.length) g.set(x, 2) }
      })
      break
    }
    case 'heal':
      Object.assign(p, { cx: 13, eyes: t % 3 === 0 ? 'closed' : 'happy', mouth: t % 3 === 0 ? 'frown' : 'smile' })
      after.push(() => { bmp(g, 24, 8, IC.syringe); if (t % 2) bmp(g, 26, 2, IC.plus) })
      break
    case 'clean': {
      Object.assign(p, { cx: 11, eyes: 'happy' }); poops = 0
      const sh = (t % 5) * 3
      after.push(() => { [18, 24].forEach(x => bmp(g, x + sh, 20, IC.poop)); for (let y = 19; y < 24; y += 2) g.set(16 + sh, y) })
      break
    }
    case 'think_low': case 'think_med': case 'think_high': case 'think_max': {
      const lvl = { think_low: 1, think_med: 2, think_high: 3, think_max: 4 }[id]
      Object.assign(p, { cx: 13, look: { dx: 0, dy: -1 }, mouth: 'flat' })
      after.push(() => {
        if (lvl === 1) { if (t % 2) g.set(21, 7); return }
        g.set(21, 7); if (lvl === 2 && t % 3 === 0) return
        g.set(22, 5)
        if (lvl === 2) return
        bubble(g, 23, 0, 9, 6)
        if (lvl === 3) { for (let i = 0; i <= t % 3; i++) g.set(25 + i * 2, 3) }
        else {
          if (t % 2) { bmp(g, 25, 1, IC.bang); bmp(g, 27, 1, IC.bang); bmp(g, 29, 1, IC.bang) }
          g.set(B.cx - 2, B.top - 2 - (t % 2)); g.set(B.cx + 1, B.top - 3 + (t % 2))
          sweat()
        }
      })
      break
    }
    case 'waiting':
      Object.assign(p, { cx: 12, look: { dx: 1, dy: 0 }, mouth: 'flat', feet: 'tap' }); agents = 0
      after.push(() => { rect(g, 26, 7, 6, 13); g.set(27, 14); if (t % 2) bmp(g, 19, 1, IC.clock) })
      break
    case 'load_heavy':
      Object.assign(p, { cx: 16 + Math.round(WALK[t % 8]! / 2), eyes: 'half' }); break
    case 'load_max':
      Object.assign(p, { cx: 17, eyes: 'half', mouth: 'wavy', sq: 1 })
      after.push(() => { bubble(g, 25, 0, 7, 7); if (t % 2) { bmp(g, 27, 1, IC.bang); bmp(g, 29, 1, IC.bang) } })
      break
    case 'relief':
      Object.assign(p, { cx: 19, eyes: 'happy', mouth: 'grin' }); p.gy -= t % 2 ? 2 : 0; load = 0
      after.push(() => {
        rect(g, 2, 15, 7, 8); for (let i = 1; i < 6; i++) g.set(2 + i, 17)
        const k = t % 3; g.set(11, 6 - k); g.set(10, 7 - k); g.set(28, 6 - k); g.set(29, 7 - k)
      })
      break
    case 'limit_tired':
      Object.assign(p, { cx: 15, eyes: 'half', mouth: t % 2 ? 'open' : 'o' }); after.push(sweat); break
    case 'away':
      showPet = false
      after.push(() => {
        for (let x = 12, i = 0; x < 28; x += 4, i++) { const y = 21 + (i % 2); g.set(x, y); g.set(x + 1, y) }
        if (t % 2) bmp(g, 29, 10, IC.arrowR)
        const pk = packFor(load)
        if (pk) { rect(g, 3, 22 - pk.h, pk.w + 1, pk.h); for (let i = 1; i < pk.w; i++) g.set(3 + i, 24 - pk.h) }
      })
      poops = 0; agents = 0
      break
    case 'dead':
      Object.assign(p, { ch: 'obake', cx: 10, gy: 18 - (t % 4), eyes: 'closed', mouth: 'flat', feet: false }); load = 0; poops = 0
      before.push(() => {
        bubble(g, 20, 7, 9, 13); for (let y = 9; y < 15; y++) g.set(24, y); for (let x = 22; x < 27; x++) g.set(x, 11)
        for (let x = 15; x < 32; x++) g.set(x, 20)
      })
      after.push(() => { for (let x = B.left + 2; x < B.right - 1; x++) g.set(x, B.top - 2) })
      break
  }
  before.forEach(f => f())
  if (showPet) {
    if (load >= 50) p.pack = packFor(load)
    if (load >= 90 && !p.sq) p.sq = 1
    B = drawPet(g, p)
  }
  after.forEach(f => f())
  if (showPet && load >= 80 && !['tired', 'limit_tired', 'think_max', 'scold'].includes(id)) sweat()
  for (let i = 0; i < Math.min(poops, 4); i++) {
    const x = 26 - i * 6
    bmp(g, x, 20, IC.poop)
    if ((t + i) % 2) { g.set(x + 1, 18); g.set(x + 3, 17) } else { g.set(x + 1, 17); g.set(x + 3, 18) }
  }
  const spots = [[2, 1], [8, 2], [14, 1]]
  for (let i = 0; i < Math.min(agents, 3); i++) bmp(g, spots[i]![0]!, spots[i]![1]! + ((t + i) % 2), IC.friend)
  if (invert) for (let i = 0; i < g.a.length; i++) g.a[i] = g.a[i]! ^ 1
  return g.a
}

// Two pixels per cell: the top one is the ▀ glyph colour, the bottom one the background.
const LCD = { day: { bg: 0xc4ccb2, px: 0x232820 }, night: { bg: 0x8a947b, px: 0x181c14 } }
// s is the scale: the screen takes 32·s columns and 12·s rows.
export function cells(px: Uint8Array, night: boolean, s = 1): string {
  const P = night ? LCD.night : LCD.day
  const cols = W * s, rows = (H / 2) * s
  const words = new Uint32Array(cols * rows * 3)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = (r * cols + c) * 3, x = Math.floor(c / s)
    words[i] = 0x2580
    words[i + 1] = px[Math.floor((2 * r) / s) * W + x] ? P.px : P.bg
    words[i + 2] = px[Math.floor((2 * r + 1) / s) * W + x] ? P.px : P.bg
  }
  return base64(new Uint8Array(words.buffer))
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < b.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < b.length ? B64[n & 63]! : '=')
  }
  return s
}
