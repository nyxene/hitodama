// The Yokai line: Japanese folklore in the public domain (after Edo-period scrolls, prints and cards).
// Drawn from scratch, not from any modern franchise.
import { bmp, E, OR, RE, shape, TRI, type Mask } from './draw'
import type { Line } from './lines'

export const yokai: Line = {
  name: 'Yokai',
  names: { ru: 'Ёкай', ja: '妖怪', zh: '妖怪', ko: '요괴' },
  baby: 'hitodama',
  child: 'sunekosuri',
  hatchMinutes: 5,
  childAfterMinutes: 65,
  teenOnDay: 3,
  adultOnDay: 6,
  teen: [
    { to: 'kitsune', care: [0, 2] },
    { to: 'tanuki', care: [3, 99] },
  ],
  adult: {
    kitsune: [
      { to: 'kyubi', care: [0, 2], dm: [0, 0], teenStartDisc: 50 },
      { to: 'tengu', care: [0, 2], dm: [1, 1] },
      { to: 'bakeneko', care: [3, 99], fullDisc: true },
      { to: 'kappa', care: [0, 3] },
      { to: 'tsuchinoko', care: [4, 7] },
      { to: 'nuppeppo', care: [8, 99] },
    ],
    tanuki: [
      { to: 'bakeneko', care: [0, 3], fullDisc: true },
      { to: 'tsuchinoko', care: [0, 7] },
      { to: 'nuppeppo', care: [8, 99] },
    ],
  },
  secret: { from: 'kappa', teenStartDisc: 0, onDay: 10, to: 'karakasa' },
  chars: {
    hitodama: { name: 'Hitodama', names: { ru: 'Хитодама', ja: 'ひとだま', zh: '人魂', ko: '히토다마' }, stage: 'baby', weight: 5 }, // a soul flame
    sunekosuri: { name: 'Sunekosuri', names: { ru: 'Сунэкосури', ja: 'すねこすり', zh: '擦脛怪', ko: '스네코스리' }, stage: 'child', sleep: [20, 9], weight: 10 }, // rubs against travellers' legs
    kitsune: { name: 'Kitsune', names: { ru: 'Кицунэ', ja: 'きつね', zh: '狐', ko: '키츠네' }, stage: 'teen', sleep: [21, 9], weight: 15 }, // a shape-shifting fox kit
    tanuki: { name: 'Tanuki', names: { ru: 'Тануки', ja: 'たぬき', zh: '狸', ko: '타누키' }, stage: 'teen', sleep: [21, 9], weight: 15 }, // a shape-shifter with a leaf on its head
    kyubi: { name: 'Kyūbi', names: { ru: 'Кюби', ja: 'きゅうび', zh: '九尾狐', ko: '큐비' }, stage: 'adult', sleep: [22, 9], weight: 30, lifeDays: 21 }, // the many-tailed fox
    tengu: { name: 'Tengu', names: { ru: 'Тэнгу', ja: 'てんぐ', zh: '天狗', ko: '텐구' }, stage: 'adult', sleep: [22, 9], weight: 30, lifeDays: 18 }, // a long-nosed mountain spirit
    bakeneko: { name: 'Bakeneko', names: { ru: 'Бакэнэко', ja: 'ばけねこ', zh: '化猫', ko: '바케네코' }, stage: 'adult', sleep: [22, 9], weight: 20, lifeDays: 16 }, // a cat with a towel on its head
    kappa: { name: 'Kappa', names: { ru: 'Каппа', ja: 'かっぱ', zh: '河童', ko: '갓파' }, stage: 'adult', sleep: [23, 11], weight: 25, lifeDays: 14 }, // a river imp with a dish of water on its head
    tsuchinoko: { name: 'Tsuchinoko', names: { ru: 'Цутиноко', ja: 'ツチノコ', zh: '槌之子', ko: '츠치노코' }, stage: 'adult', sleep: [22, 9], weight: 10, lifeDays: 10 }, // a fat snake
    nuppeppo: { name: 'Nuppeppo', names: { ru: 'Нуппэппо', ja: 'ぬっぺっぽう', zh: '肉块怪', ko: '눗페포' }, stage: 'adult', sleep: [22, 10], weight: 20, lifeDays: 9 }, // a lump of flesh
    karakasa: { name: 'Karakasa', names: { ru: 'Каракаса', ja: 'からかさ', zh: '唐伞妖', ko: '카라카사' }, stage: 'secret', sleep: [23, 10], weight: 30, lifeDays: 20 }, // an old umbrella come alive: one eye, one leg
  },
  draw: {
    hitodama: (cx, gy, q, ph) => {
      const cy = gy - 3.5 + q * 0.5, sw = ph % 2 ? 1 : -1, c = Math.round(cy)
      const tail: Mask = (x, y) => { const d = cy - (y + 0.5); if (d < 0 || d > 7.5 - q) return false; const k = d / 7.5; return Math.abs(x + 0.5 - (cx + sw * k * 2)) <= 3.6 * (1 - k) }
      return {
        m: OR(E(cx, cy, 4, 3.5), tail), solid: true, top: cy - 7.5, left: cx - 4, right: cx + 3, cy,
        eye: { y: c - 1, gap: 2, ink: 0 }, mouth: { y: c + 1, small: true, ink: 0 },
      }
    },
    sunekosuri: (cx, gy, q, ph) => {
      const cy = gy - 4.5 + q * 0.8, c = Math.round(cy), w = ph % 2
      return {
        m: OR(E(cx, cy, 5 + q * 0.5, 4 - q * 0.8), TRI(cx - 3, cy - 5.5, 2, 0.5), TRI(cx + 3, cy - 5.5, 2, 0.5)), top: cy - 5.5, left: cx - 6, right: cx + 7, cy,
        eye: { y: c - 1, gap: 2 }, mouth: { y: c + 1 },
        deco: g => {
          g.set(cx - 6, c - 1 + w); g.set(cx - 6, c + 2 - w); g.set(cx + 5, c + 2)
          ;[[5, 0], [6, -1], [6, -2], [5, -3]].forEach(([x, y]) => g.set(cx + x! + w, c + y!))
        },
        feet: [[[cx - 3, gy]], [[cx + 2, gy]]],
      }
    },
    kitsune: (cx, gy, q) => {
      const cy = gy - 5 + q, c = Math.round(cy), tail = RE(cx + 7, cy, 2.2, 4.5, 0.5)
      return {
        m: OR(E(cx, cy, 5 + q * 0.5, 4.5 - q), TRI(cx - 3, cy - 8, 4, 0.5), TRI(cx + 3, cy - 8, 4, 0.5), tail), top: cy - 8, left: cx - 6, right: cx + 10, cy,
        eye: { y: c - 1, gap: 2 }, mouth: { y: c + 1, small: true },
        deco: g => shape(g, (x, y) => tail(x, y) && E(cx + 9, cy - 4, 2, 2)(x, y), true),
        feet: [[[cx - 3, gy]], [[cx + 2, gy]]],
      }
    },
    tanuki: (cx, gy, q) => {
      const cy = gy - 5 + q, c = Math.round(cy), ey = c - 2
      return {
        m: OR(E(cx, cy, 5.5 + q * 0.5, 4.5 - q), E(cx - 3.5, cy - 4.2, 1.4, 1.4), E(cx + 3.5, cy - 4.2, 1.4, 1.4)), top: cy - 9, left: cx - 6, right: cx + 6, cy,
        eye: { y: ey, gap: 2, ink: 0 }, mouth: { y: c, small: true },
        deco: g => { shape(g, E(cx - 1.5, ey + 1, 1.8, 1.4), true); shape(g, E(cx + 1.5, ey + 1, 1.8, 1.4), true); shape(g, E(cx, cy + 2.5, 2.5, 1.6)) },
        over: g => bmp(g, cx - 1, Math.floor(cy - 4.5) - 3, ['..##', '.##.', '##..', '#...']),
        feet: [[[cx - 3, gy]], [[cx + 2, gy]]],
      }
    },
    kyubi: (cx, gy, q) => {
      const hy = gy - 9 + q * 1.5, c = Math.round(hy), head = OR(E(cx, hy, 5, 4 - q * 0.5), TRI(cx - 3, hy - 7, 4, 0.5), TRI(cx + 3, hy - 7, 4, 0.5))
      const tails = [-1.1, -0.7, -0.3, 0.3, 0.7, 1.1].map(a => RE(cx + 6.5 * Math.sin(a), gy - 3 - 6.5 * Math.cos(a), 1.7, 4.2, a))
      return {
        m: OR(E(cx, gy - 3, 3.5, 3), ...tails), top: hy - 7, left: cx - 11, right: cx + 11, cy: hy,
        eye: { y: c - 1, gap: 2 }, mouth: { y: c + 1, small: true },
        deco: g => shape(g, head),
        feet: [[[cx - 2, gy]], [[cx + 1, gy]]],
      }
    },
    tengu: (cx, gy, q) => {
      const cy = gy - 6.5 + q, ry = 6 - q, t = Math.round(cy - ry), ey = t + 4
      return {
        m: E(cx, cy, 5, ry), top: t - 2, left: cx - 6, right: cx + 10, cy,
        eye: { y: ey, gap: 2 }, mouth: null,
        deco: g => bmp(g, cx - 1, t - 2, ['##', '##']),
        over: g => { bmp(g, cx, ey + 3, ['#########', '.######..']); g.set(cx - 3, ey - 2); g.set(cx - 2, ey - 1); g.set(cx + 2, ey - 2); g.set(cx + 1, ey - 1) },
        feet: [[[cx - 3, gy], [cx - 2, gy]], [[cx + 1, gy], [cx + 2, gy]]],
      }
    },
    bakeneko: (cx, gy, q, ph) => {
      const hy = gy - 8 + q, c = Math.round(hy), w = ph % 2
      return {
        m: OR(E(cx, hy, 5.5, 4.5 - q * 0.5), TRI(cx - 3.5, hy - 7.5, 4, 0.4), TRI(cx + 3.5, hy - 7.5, 4, 0.4), E(cx, gy - 2.5, 3, 2.5)), top: hy - 7.5, left: cx - 8, right: cx + 9, cy: hy,
        eye: { y: c, gap: 2 }, mouth: { y: c + 2, small: true },
        deco: g => {
          for (let x = cx - 5; x < cx + 5; x++) { g.set(x, c - 3); g.set(x, c - 2) }
          bmp(g, cx + 5, c - 3, ['###', '.##', '..#'])
          ;[[3, -2], [4, -3], [5, -4], [5, -5], [6, -6], [6, -7]].forEach(([x, y]) => g.set(cx + x!, gy + y!))
          g.set(cx - 4, gy - 4 - w); g.set(cx - 5, gy - 5 - w)
        },
        over: g => { g.set(cx - 6, c + 1); g.set(cx - 7, c + 1); g.set(cx - 6, c + 3); g.set(cx + 5, c + 1); g.set(cx + 6, c + 1); g.set(cx + 5, c + 3) },
        feet: [[[cx - 2, gy]], [[cx + 1, gy]]],
      }
    },
    kappa: (cx, gy, q) => {
      const cy = gy - 7 + q, c = Math.round(cy)
      return {
        m: E(cx, cy, 5.5, 5 - q * 0.5), top: cy - 6, left: cx - 7, right: cx + 6, cy,
        eye: { y: c - 1, gap: 3 }, mouth: null,
        deco: g => {
          shape(g, E(cx, cy - 4.8, 3.5, 1.3))
          for (let x = cx - 5; x < cx + 5; x++) if (Math.abs(x + 0.5 - cx) > 2.5) g.set(x, c - 3 + (x % 2))
          g.set(cx - 6, c + 2); g.set(cx - 7, c + 2); g.set(cx + 5, c + 2); g.set(cx + 6, c + 2)
        },
        over: g => bmp(g, cx - 3, c + 1, ['.####.', '######', '.####.']),
        feet: [[[cx - 3, gy - 1], [cx - 3, gy], [cx - 4, gy]], [[cx + 2, gy - 1], [cx + 2, gy], [cx + 3, gy]]],
      }
    },
    tsuchinoko: (cx, gy, q, ph) => {
      const by = gy - 3.5 + q * 0.5, hy = gy - 5, w = ph % 2
      return {
        m: OR(E(cx + 1, by, 6.5, 3.5 - q * 0.5), E(cx - 5, hy, 3.2, 2.8)), top: hy - 3, left: cx - 10, right: cx + 10, cy: hy,
        eye: { cx: cx - 5, y: hy - 1, gap: 2 }, mouth: null,
        deco: g => {
          for (let i = 0; i < 4; i++) g.set(cx - 1 + i * 2, Math.round(by))
          ;[[8, 0], [9, -1], [10, -1 - w]].forEach(([x, y]) => g.set(cx + x!, Math.round(by) + y!))
        },
        over: g => { if (w) { g.set(cx - 9, hy + 1); g.set(cx - 10, hy); g.set(cx - 10, hy + 2) } },
      }
    },
    nuppeppo: (cx, gy, q, ph) => {
      const cy = gy - 6 + q, c = Math.round(cy), w = ph % 2 ? 0.4 : -0.4
      return {
        m: OR(E(cx, cy, 6, 5.5 - q), E(cx - 4, cy + 3, 3 + w, 2.5), E(cx + 4, cy + 3, 3 - w, 2.5)), top: cy - 5.5, left: cx - 8, right: cx + 8, cy,
        eye: { y: c - 2, gap: 2, beady: true }, mouth: { y: c, small: true },
        deco: g => {
          for (let x = cx - 3; x < cx + 3; x++) g.set(x, c + 3)
          g.set(cx - 4, c + 2); g.set(cx + 3, c + 2)
          g.set(cx - 7, c); g.set(cx - 8, c - 1); g.set(cx + 6, c); g.set(cx + 7, c - 1)
        },
      }
    },
    karakasa: (cx, gy, _q, ph) => {
      const g0 = gy - (ph % 2), ap = g0 - 15, base = ap + 7
      const dome: Mask = (x, y) => { const d = y + 0.5 - ap; return d >= 0 && d <= 7.5 && Math.abs(x + 0.5 - cx) <= 7.5 * Math.sqrt(d / 7.5) + 0.3 }
      return {
        m: dome, top: ap - 1, left: cx - 8, right: cx + 8, cy: ap + 4,
        eye: { y: ap + 3, gap: 0 }, mouth: null,
        deco: g => {
          g.set(cx - 1, ap - 1); g.set(cx, ap - 1)
          for (let x = cx - 7; x < cx + 7; x += 2) g.set(x, base + 1)
          for (let i = 2; i < 7; i++) { g.set(cx - 1 - Math.round(i * 0.75), ap + i); g.set(cx + Math.round(i * 0.75), ap + i) }
          for (let y = base + 1; y < g0; y++) g.set(cx - 1, y)
        },
        over: g => bmp(g, cx - 1 + (ph % 2), ap + 5, ['##', '##', '##', '.#']),
        feet: [[[cx - 2, g0], [cx - 1, g0], [cx, g0]]],
      }
    },
  },
}
