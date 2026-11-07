// Icons and screen scenes. A scene → Uint8Array of inks (0 nothing, 1 the pet, from 2 kinds of things: K). Characters
// live in their lines.
import { bmp, bubble, E, grid, H, rect, shape, W, type CharDraw, type Grid, type Mask, type Shape } from './draw'
import { CHARS, DRAW } from './lines'

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
// What a pixel is, so the screen can colour it: 0 nothing, 1 the pet (and the egg), from 2 the kinds of things around
// it, 15 the backpack, after the scenery. The LCD draws them all alike.
export const K = { pet: 1, food: 2, dirt: 3, pale: 4, love: 5, care: 6, alert: 7, pack: 15 } as const
const INK: Record<keyof typeof IC, number> = {
  z: K.pale, heart: K.love, rice: K.food, candy: K.food, poop: K.dirt, skull: K.alert, plus: K.care, syringe: K.care,
  drop: K.care, vein: K.alert, clock: K.pale, friend: K.pale, bang: K.alert, bigBang: K.alert, no: K.alert,
  arrowR: K.food, arrowL: K.food,
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
  const cx = Math.round(o.cx), C = ((Object.hasOwn(CH, o.ch) ? CH[o.ch] : undefined) ?? CH.obake!)(cx, Math.round(o.gy), o.sq ?? 0, o.phase)
  if (o.pack) {
    const { w, h } = o.pack, px = Math.round(C.left - w + 3), py = Math.round(C.cy - h / 2 + 1)
    rect(g, px, py, w, h, K.pack)
    for (let i = 1; i < w - 1; i++) g.set(px + i, py + 2, K.pack)
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
  const sweat = () => { if (t % 2) bmp(g, B.right + 1, B.top, IC.drop, false, INK.drop) }
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
      after.push(() => { for (let i = 0; i <= t % 4; i++) g.set(2 + i * 2, 22, K.pale) })
      break
    case 'happy':
      Object.assign(p, { cx: 16, eyes: 'happy', mouth: 'grin' }); p.gy -= t % 2 ? 3 : 0
      after.push(() => [[3, 4], [27, 6], [4, 15], [27, 15]].forEach(([x, y], i) => { if ((t + i) % 2) bmp(g, x!, y!, IC.plus, false, INK.plus) }))
      break
    case 'angry':
      Object.assign(p, { cx: 16 + (t % 2 ? 1 : -1), eyes: 'angry', mouth: 'frown' })
      after.push(() => { if (t % 2) bmp(g, 25, 2, IC.vein, false, INK.vein) })
      break
    case 'bored':
      Object.assign(p, { cx: 14, eyes: 'half', mouth: 'flat', look: { dx: 1, dy: 0 } })
      after.push(() => { for (let i = 0; i < t % 4; i++) g.set(24 + i * 2, 5, K.pale) })
      break
    case 'call':
      Object.assign(p, { cx: 15, mouth: t % 2 ? 'open' : 'o' })
      after.push(() => { if (t % 2) { bmp(g, B.right + 2, B.top, IC.bang, false, INK.bang); bmp(g, B.right + 4, B.top - 1, IC.bang, false, INK.bang) } })
      break
    case 'hungry':
      Object.assign(p, { cx: 13, mouth: t % 2 ? 'open' : 'o' })
      after.push(() => { bubble(g, 21, 0, 10, 8, K.pale); if (t % 2) bmp(g, 23, 1, IC.rice, false, INK.rice); g.set(20, 8, K.pale); g.set(19, 9, K.pale) })
      break
    case 'dirty':
      Object.assign(p, { eyes: 'half', mouth: 'frown' }); poops = Math.max(poops, 2); break
    case 'tired':
      Object.assign(p, { cx: 15, eyes: 'half', mouth: 'flat', sq: 0.5 }); after.push(sweat); break
    case 'sick':
      Object.assign(p, { cx: 13, eyes: 'half', mouth: 'wavy' })
      after.push(() => { if (t % 2) bmp(g, B.right + 2, B.top, IC.skull, false, INK.skull) })
      break
    case 'sleep': case 'limit_hit':
      Object.assign(p, { cx: 15, eyes: 'closed', mouth: 'flat', sq: 1, feet: false })
      after.push(() => {
        ;[[23, 7], [25, 4], [27, 1]].slice(0, (t % 3) + 1).forEach(([x, y]) => bmp(g, x!, y!, IC.z, false, INK.z))
        if (id === 'limit_hit') bmp(g, 3, 2, IC.clock, false, INK.clock)
      })
      break
    case 'night_grumpy':
      Object.assign(p, { cx: 15, eyes: 'half', mouth: 'frown' })
      after.push(() => { g.set(22, 8, K.pale); if (t % 2) { g.set(24, 6, K.pale); bmp(g, 3, 3, IC.vein, false, INK.vein) } })
      break
    case 'tantrum':
      Object.assign(p, { cx: 17 + (t % 2 ? 1 : 0), eyes: 'angry', mouth: 'frown', look: { dx: 1, dy: 0 } })
      after.push(() => { bmp(g, 2, 13, IC.rice, false, INK.rice); bmp(g, 3, 9, IC.no, false, INK.no); if (t % 2) bmp(g, 26, 2, IC.bang, false, INK.bang) })
      break
    case 'scold':
      Object.assign(p, { cx: 18, eyes: 'closed', mouth: 'frown', sq: 0.5 })
      after.push(() => { if (t % 2) bmp(g, 4, 5, IC.bigBang, false, INK.bigBang); sweat() })
      break
    case 'refuse':
      Object.assign(p, { cx: 16 + (t % 2 ? 1 : -1), eyes: 'closed', mouth: 'frown', look: { dx: t % 2 ? 1 : -1, dy: 0 } })
      after.push(() => bmp(g, 3, 9, IC.no, false, INK.no))
      break
    case 'eat':
      Object.assign(p, { cx: 12, eyes: t % 2 ? 'closed' : 'happy', mouth: t % 2 ? 'chew' : 'o' })
      after.push(() => { bmp(g, 23, 13, IC.rice, false, INK.rice); for (let i = 0; i < t % 5; i++) for (let y = 13; y < 18; y++) g.set(23 + i, y, 0) })
      break
    case 'snack':
      Object.assign(p, { cx: 12, eyes: 'happy', mouth: t % 2 ? 'chew' : 'smile' })
      after.push(() => { bmp(g, 23, 15, IC.candy, false, INK.candy); bmp(g, 22, 5 - (t % 3), IC.heart, false, INK.heart) })
      break
    case 'game': {
      const dir = o.game?.dir ?? 0
      Object.assign(p, { cx: 16, look: { dx: dir, dy: 0 }, mouth: dir ? 'grin' : 'flat', eyes: dir ? 'happy' : 'open' })
      after.push(() => {
        if (dir) bmp(g, dir < 0 ? 2 : 28, 11, dir < 0 ? IC.arrowL : IC.arrowR, false, INK.arrowR)
        else if (t % 2) { bmp(g, 2, 11, IC.arrowL, false, INK.arrowL); bmp(g, 28, 11, IC.arrowR, false, INK.arrowR) }
        const wins = o.game?.wins ?? []
        for (let i = 0; i < 5; i++) { const x = 11 + i * 2; if (wins[i]) g.set(x, 1, K.food); if (i < wins.length) g.set(x, 2, K.food) }
      })
      break
    }
    case 'heal':
      Object.assign(p, { cx: 13, eyes: t % 3 === 0 ? 'closed' : 'happy', mouth: t % 3 === 0 ? 'frown' : 'smile' })
      after.push(() => { bmp(g, 24, 8, IC.syringe, false, INK.syringe); if (t % 2) bmp(g, 26, 2, IC.plus, false, INK.plus) })
      break
    case 'clean': {
      Object.assign(p, { cx: 11, eyes: 'happy' }); poops = 0
      const sh = (t % 5) * 3
      after.push(() => { [18, 24].forEach(x => bmp(g, x + sh, 20, IC.poop, false, INK.poop)); for (let y = 19; y < 24; y += 2) g.set(16 + sh, y, K.care) })
      break
    }
    case 'think_low': case 'think_med': case 'think_high': case 'think_max': {
      const lvl = { think_low: 1, think_med: 2, think_high: 3, think_max: 4 }[id]
      Object.assign(p, { cx: 13, look: { dx: 0, dy: -1 }, mouth: 'flat' })
      after.push(() => {
        if (lvl === 1) { if (t % 2) g.set(21, 7, K.pale); return }
        g.set(21, 7, K.pale); if (lvl === 2 && t % 3 === 0) return
        g.set(22, 5, K.pale)
        if (lvl === 2) return
        bubble(g, 23, 0, 9, 6, K.pale)
        if (lvl === 3) { for (let i = 0; i <= t % 3; i++) g.set(25 + i * 2, 3, K.pale) }
        else {
          if (t % 2) { bmp(g, 25, 1, IC.bang, false, INK.bang); bmp(g, 27, 1, IC.bang, false, INK.bang); bmp(g, 29, 1, IC.bang, false, INK.bang) }
          g.set(B.cx - 2, B.top - 2 - (t % 2), K.care); g.set(B.cx + 1, B.top - 3 + (t % 2), K.care)
          sweat()
        }
      })
      break
    }
    case 'waiting':
      Object.assign(p, { cx: 12, look: { dx: 1, dy: 0 }, mouth: 'flat', feet: 'tap' }); agents = 0
      after.push(() => { rect(g, 26, 7, 6, 13, K.pale); g.set(27, 14, K.pale); if (t % 2) bmp(g, 19, 1, IC.clock, false, INK.clock) })
      break
    case 'load_heavy':
      Object.assign(p, { cx: 16 + Math.round(WALK[t % 8]! / 2), eyes: 'half' }); break
    case 'load_max':
      Object.assign(p, { cx: 17, eyes: 'half', mouth: 'wavy', sq: 1 })
      after.push(() => { bubble(g, 25, 0, 7, 7, K.pale); if (t % 2) { bmp(g, 27, 1, IC.bang, false, INK.bang); bmp(g, 29, 1, IC.bang, false, INK.bang) } })
      break
    case 'relief':
      Object.assign(p, { cx: 19, eyes: 'happy', mouth: 'grin' }); p.gy -= t % 2 ? 2 : 0; load = 0
      after.push(() => {
        rect(g, 2, 15, 7, 8, K.pale); for (let i = 1; i < 6; i++) g.set(2 + i, 17, K.pale)
        const k = t % 3; g.set(11, 6 - k, K.love); g.set(10, 7 - k, K.love); g.set(28, 6 - k, K.love); g.set(29, 7 - k, K.love)
      })
      break
    case 'limit_tired':
      Object.assign(p, { cx: 15, eyes: 'half', mouth: t % 2 ? 'open' : 'o' }); after.push(sweat); break
    case 'away':
      showPet = false
      after.push(() => {
        for (let x = 12, i = 0; x < 28; x += 4, i++) { const y = 21 + (i % 2); g.set(x, y, K.pale); g.set(x + 1, y, K.pale) }
        if (t % 2) bmp(g, 29, 10, IC.arrowR, false, INK.arrowR)
        const pk = packFor(load)
        if (pk) { rect(g, 3, 22 - pk.h, pk.w + 1, pk.h, K.pale); for (let i = 1; i < pk.w; i++) g.set(3 + i, 24 - pk.h, K.pale) }
      })
      poops = 0; agents = 0
      break
    case 'dead':
      Object.assign(p, { ch: 'obake', cx: 10, gy: 18 - (t % 4), eyes: 'closed', mouth: 'flat', feet: false }); load = 0; poops = 0
      before.push(() => {
        bubble(g, 20, 7, 9, 13, K.pale); for (let y = 9; y < 15; y++) g.set(24, y, K.pale); for (let x = 22; x < 27; x++) g.set(x, 11, K.pale)
        for (let x = 15; x < 32; x++) g.set(x, 20, K.pale)
      })
      after.push(() => { for (let x = B.left + 2; x < B.right - 1; x++) g.set(x, B.top - 2, K.pale) })
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
    bmp(g, x, 20, IC.poop, false, INK.poop)
    if ((t + i) % 2) { g.set(x + 1, 18, K.dirt); g.set(x + 3, 17, K.dirt) } else { g.set(x + 1, 17, K.dirt); g.set(x + 3, 18, K.dirt) }
  }
  const spots = [[2, 1], [8, 2], [14, 1]]
  for (let i = 0; i < Math.min(agents, 3); i++) bmp(g, spots[i]![0]!, spots[i]![1]! + ((t + i) % 2), IC.friend, false, INK.friend)
  if (invert) for (let i = 0; i < g.a.length; i++) g.a[i] = g.a[i] ? 0 : K.pet
  return g.a
}

// How the screen is drawn. lcd: two greys as on a pocket LCD, every pixel alike; otherwise a dark screen with the
// pet in its own colour. detail: pixel, two pixels per cell (▀ and its background); braille, the picture smoothed
// and drawn in braille dots, one colour per cell. Above 32 columns, fine smooths the picture to twice the pixels
// (Scale2x), each half as big. kinds colours items by kind (else all yellow); scenery adds the ground, clouds by
// day and stars by night; particles, hearts rising while it eats or walks. scene and t: what is shown and the frame.
export type Detail = 'pixel' | 'braille'
export type ScreenLook = {
  lcd: boolean; detail: Detail; color: number
  fine?: boolean; kinds?: boolean; scenery?: boolean; particles?: boolean; scene?: string; t?: number
}
const LCD = { day: { bg: 0xc4ccb2, px: 0x232820 }, night: { bg: 0x8a947b, px: 0x181c14 } }
const DARK = { day: 0x1b1f27, night: 0x0f1218 }
// Ink colours from K.food on: food, dirt, pale, love, care, alert.
const KIND = [0xf2c14e, 0x9b6b43, 0xe8edf5, 0xff7aa2, 0x8fd3ff, 0xff6b5a]
// Scenery and particles, after the inks: ground, ground dots, star, dim star, cloud, sparkle, heart.
const S = { ground: 8, dots: 9, star: 10, dim: 11, cloud: 12, spark: 13, heart: 14 } as const
// The backpack, graphite, so it stands apart from any pet; item colours off leave it as it is.
const PACK = 0x6e6e78
const SCENERY = { day: [0x2b3340, 0x252c37, 0, 0, 0x2f3847, 0xfff4c2, 0xff7aa2], night: [0x1c2230, 0x171c27, 0xc9d1e3, 0x59617a, 0, 0xfff4c2, 0xb75b77] }
// The egg and the ghost a dead pet becomes are not characters of a line.
const OWN: Record<string, number> = { egg: 0xe9e2cf, obake: 0xcfd8e3 }
export const colorOf = (ch: string) => (Object.hasOwn(CHARS, ch) ? CHARS[ch]?.color : undefined) ?? (Object.hasOwn(OWN, ch) ? OWN[ch] : undefined) ?? 0xd6d9de

const mix = (a: number, b: number, t: number) =>
  [16, 8, 0].reduce((n, sh) => n | (Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t) << sh), 0)

// The colour of each ink, then of the scenery, then of the backpack.
function palette(look: ScreenLook, night: boolean): number[] {
  if (look.lcd) { const P = night ? LCD.night : LCD.day; return [P.bg, ...Array(15).fill(P.px)] }
  const bg = night ? DARK.night : DARK.day, dim = (c: number) => (night ? mix(c, bg, 0.35) : c)
  const items = look.kinds ? KIND : KIND.map(() => KIND[0]!)
  return [bg, dim(look.color), ...items.map(dim), ...(night ? SCENERY.night : SCENERY.day), dim(PACK)]
}

// Scale2x: each pixel becomes four, with corners rounded where neighbours agree.
function scale2x(g: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(w * h * 4)
  const at = (x: number, y: number) => g[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1)
    const i = 2 * y * 2 * w + 2 * x
    o[i] = C === A && C !== D && A !== B ? A : P
    o[i + 1] = A === B && A !== C && B !== D ? B : P
    o[i + 2 * w] = D === C && D !== B && C !== A ? C : P
    o[i + 2 * w + 1] = B === D && B !== A && D !== C ? D : P
  }
  return o
}

const STARS = [[6, 4], [18, 9], [33, 3], [47, 7], [58, 12], [26, 15], [52, 2]]
const CLOUD = ['..####....', '.######.##', '##########', '.########.']
const SPARKS = [[-10, 2], [-12, 6], [12, 9]]
// Scenery behind the picture and particles over it, on a w × h picture (32 × 24 or larger).
function decorate(g: Uint8Array, w: number, h: number, look: ScreenLook, night: boolean) {
  const t = look.t ?? 0, k = w / 64, s = Math.max(1, Math.round(k))
  const put = (x: number, y: number, v: number, over = false) => {
    x = Math.round(x); y = Math.round(y)
    if (x >= 0 && x < w && y >= 0 && y < h && (over || !g[y * w + x])) g[y * w + x] = v
  }
  // A pixel of a drawing made for 64 × 48, as an s × s block on a larger picture.
  const block = (x: number, y: number, v: number, over = false) => { for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) put(x + i, y + j, v, over) }
  if (look.scenery) {
    const floor = Math.round((h * 45) / 48)
    for (let x = 0; x < w; x++) { put(x, floor, S.ground); if ((x + t) % 3 === 0) put(x, floor + 1, S.dots) }
    if (night) STARS.forEach(([x, y]) => put(x! * k, y! * k, (x! + t) % 4 ? S.star : S.dim))
    else CLOUD.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#' && (k >= 1 || (x % 2 === 0 && y % 2 === 0))) block((4 + (t % 20) + x) * k, (3 + y) * k, S.cloud) }))
  }
  if (look.particles && ['eat', 'snack', 'idle', 'happy'].includes(look.scene ?? '')) {
    let top = h, sx = 0, n = 0
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x] === K.pet) { top = Math.min(top, y); sx += x; n++ }
    if (!n) return
    const cx = sx / n, rise = (t % 8) * 2 * Math.max(1, k)
    IC.heart.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') block(cx + 6 * s + (t % 2) + x * s, top - 2 - rise - 4 * (s - 1) + y * s, S.heart, true) }))
    if (t % 4 === 1) SPARKS.forEach(([dx, dy]) => put(cx + dx! * Math.max(1, k), top + dy! * Math.max(1, k), S.spark, true))
  }
}

const DOTS = [[0x1, 0x8], [0x2, 0x10], [0x4, 0x20], [0x40, 0x80]]
// The screen's rows for a width in columns: 32 × 12 cells hold 32 × 24 pixels, so the picture keeps its shape.
export const screenRows = (cols: number) => Math.round((cols * 3) / 8)
// The screen at a width of cols columns. Each cell takes the pixels under it; at a width that is not a whole
// multiple of the picture's, some pixels take one column more than others.
export function cells(px: Uint8Array, night: boolean, cols = W, look: ScreenLook = { lcd: true, detail: 'pixel', color: 0 }): string {
  const ink = palette(look, night)
  const rows = screenRows(cols)
  const words = new Uint32Array(cols * rows * 3)
  let g: Uint8Array = px, w = W, h = H
  if (look.detail === 'braille') while (w < 2 * cols) { g = scale2x(g, w, h); w *= 2; h *= 2 }
  else if (look.fine && cols > W) { g = scale2x(g, w, h); w *= 2; h *= 2 }
  if (!look.lcd && (look.scenery || look.particles)) { g = Uint8Array.from(g); decorate(g, w, h, look, night) }
  if (look.detail === 'braille') {
    // 2 × 4 dots per cell, in the colour most of them have.
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let bits = 0, top: number = K.pet, best = 0
      COUNT.fill(0)
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
        const v = g[Math.floor(((4 * r + dy) * h) / (4 * rows)) * w + Math.floor(((2 * c + dx) * w) / (2 * cols))]!
        if (v) { bits |= DOTS[dy]![dx]!; if (++COUNT[v]! > best) { best = COUNT[v]!; top = v } }
      }
      const i = (r * cols + c) * 3
      words[i] = 0x2800 + bits
      words[i + 1] = ink[top]!
      words[i + 2] = ink[0]!
    }
    return base64(new Uint8Array(words.buffer))
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = (r * cols + c) * 3, x = Math.floor((c * w) / cols)
    words[i] = 0x2580
    words[i + 1] = ink[g[Math.floor((2 * r * h) / (2 * rows)) * w + x]!]!
    words[i + 2] = ink[g[Math.floor(((2 * r + 1) * h) / (2 * rows)) * w + x]!]!
  }
  return base64(new Uint8Array(words.buffer))
}

const COUNT = new Uint8Array(16)
const B64 = new TextEncoder().encode('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), ASCII = new TextDecoder()
// The input is always whole Uint32 words times 3, so a multiple of 3 bytes: no padding.
function base64(b: Uint8Array): string {
  const o = new Uint8Array((b.length / 3) * 4)
  for (let i = 0, j = 0; i < b.length; i += 3, j += 4) {
    const n = (b[i]! << 16) | (b[i + 1]! << 8) | b[i + 2]!
    o[j] = B64[n >> 18]!; o[j + 1] = B64[(n >> 12) & 63]!; o[j + 2] = B64[(n >> 6) & 63]!; o[j + 3] = B64[n & 63]!
  }
  return ASCII.decode(o)
}
