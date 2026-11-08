// What to show: state by priority, the title, the bars and the stats text.
import { lang, pad, t as tr, width } from './i18n'
import { LINES, lineOf, lineName } from './lines'
import { causeText, nameOf, stageOf, type Ev, type History, type Pet } from './sim'
import { tuning as T } from './tuning'
import type { HitodamaView } from '../types'

export type Win = {
  sid: string; room: string; alive: number; lastInput: number; lastActivity: number; typingAt: number
  load: number; model: string; effort: string; turn: boolean; agents: number; errors: number
  // The usage limit the pet follows: the five-hour one when Claude Code reports it, else the weekly one.
  limit: number; limitKind?: LimitKind; limitResetsAt?: string; limitAt?: number
  seq: number; events: Ev[]
  asking?: number // when Claude Code showed a permission prompt in this window; 0 or absent: none showing
  v?: string // the mod version the window runs; absent in windows of 0.5.2 and before
}
export type LimitKind = 'five_hour' | 'seven_day'
export type Limit = { limit: number; limitKind?: LimitKind; limitResetsAt?: string }
export type Ctx = Limit & {
  now: number; isOwner: boolean; ownerRoom: string
  idleMin: number; anim?: { id: string; until: number; msg: string } | null
  asking?: string[] // the rooms of other live windows where Claude asked for permission
}

const EFF: Record<string, string> = { low: 'think_low', medium: 'think_med', high: 'think_high', xhigh: 'think_high', max: 'think_max' }

// Pads to n columns, and always leaves one space after a label longer than that.
const col = (s: string, n: number) => pad(s, Math.max(n, width(s) + 1))

const SPAN: Record<LimitKind, number> = { five_hour: 5 * 3_600_000, seven_day: 7 * 86_400_000 }

// The limit to show: the fullest window whose reset has not passed (an idle window keeps an old figure), the five-hour
// limit before the weekly one in every window. A figure without a reset time that reads lasts one span of its limit
// from when it was measured, as its reset can come no later.
export function limitOf(wins: Win[], now: number): Limit {
  const live = wins.filter(w => {
    if (!w.limitKind) return false // a window an older version wrote holds limit5 only
    const reset = w.limitResetsAt ? Date.parse(w.limitResetsAt) : NaN
    const end = Number.isFinite(reset) ? reset : (w.limitAt ?? -Infinity) + SPAN[w.limitKind]
    return end > now
  })
  const five = live.filter(w => w.limitKind === 'five_hour')
  const top = [...(five.length ? five : live)].sort((a, b) => b.limit - a.limit)[0]
  return top ? { limit: top.limit, limitKind: top.limitKind, limitResetsAt: top.limitResetsAt } : { limit: 0 }
}

// How far ahead of the limit's pace the session runs, as a factor on turn cost: 1 + (percent used − percent of its
// window passed) / perPoint, within min..max. 1 with no limit or no reset time, as then the window's start is unknown.
export function paceOf(l: Limit, now: number): number {
  const reset = l.limitResetsAt ? Date.parse(l.limitResetsAt) : NaN
  if (!l.limitKind || !Number.isFinite(reset)) return 1
  const passed = Math.max(0, Math.min(100, 100 * (1 - (reset - now) / SPAN[l.limitKind])))
  return Math.max(T.pace.min, Math.min(T.pace.max, 1 + (l.limit - passed) / T.pace.perPoint))
}

// When any window was last active: now while one runs a turn or helpers, else its last event (input, a turn or helper
// starting or ending, a tool call). A turn or helpers whose end never came stop counting busyHours after that event.
export const busy = (w: Win, now: number) =>
  (w.turn || w.agents > 0) && now - Math.max(w.lastActivity, w.lastInput) < T.rest.busyHours * 3_600_000
export const lastActive = (wins: Win[], now: number) =>
  Math.max(...wins.map(w => (busy(w, now) ? now : Math.max(w.lastActivity, w.lastInput))))

// From when an awake pet rests: afterMinutes past the last activity (lastActive). Activity since the pet last lived
// (livedTo: typing, a press, a running turn) counts as at that time, so the first thing done after a long gap does not
// undo the rest within it.
// ponytail: windows keep only their latest event, so activity inside a gap counts from the gap's start.
export const restFrom = (active: number, livedTo: number) => Math.min(active, livedTo) + T.rest.afterMinutes * 60_000

function left(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000))
  return m >= 60 ? tr().hm(Math.floor(m / 60), m % 60) : tr().min(m)
}

// The first matching state wins.
// Another window where Claude asked for permission takes the line under the screen over everything but death; the
// screen shows what it would anyway.
export function decide(p: Pet, w: Win, c: Ctx): { scene: string; msg: string } {
  const d = pick(p, w, c)
  return c.asking?.length && !p.dead ? { scene: d.scene, msg: tr().asking(c.asking.join(', ')) } : d
}

function pick(p: Pet, w: Win, c: Ctx): { scene: string; msg: string } {
  const n = nameOf(p.ch)
  if (p.dead) return { scene: 'dead', msg: tr().dead(n, causeText(p.dead.cause), p.ageDays) }
  if (!c.isOwner) return { scene: 'away', msg: tr().away(n, c.ownerRoom) }
  if (p.ch === 'egg') return { scene: 'egg', msg: tr().eggWait(left(p.bornAt + lineOf(p.line).hatchMinutes * 60_000 - c.now)) }
  if (c.now - p.evolvedAt < 6000) {
    return stageOf(p) === 'baby'
      ? { scene: 'hatch', msg: tr().hatch(n) }
      : { scene: 'evolve', msg: tr().evolve(n) }
  }
  if (c.limit >= T.limits.hit) {
    const reset = c.limitResetsAt ? Date.parse(c.limitResetsAt) - c.now : NaN
    return { scene: 'limit_hit', msg: Number.isFinite(reset) ? tr().limitHit(left(reset)) : tr().limitHitNoTime }
  }
  if (c.anim && c.anim.until > c.now) return { scene: c.anim.id || 'idle', msg: c.anim.msg }
  if (p.sick) return { scene: 'sick', msg: tr().callMsg.sick }
  if (p.tantrum) return { scene: 'tantrum', msg: tr().tantrum }
  if (w.turn) return p.asleep
    ? { scene: 'night_grumpy', msg: tr().nightGrumpy }
    : { scene: EFF[w.effort] ?? 'think_high', msg: tr().thinking(w.effort) }
  if (w.agents > 0) return { scene: 'waiting', msg: tr().waiting(w.agents) }
  if (w.errors >= T.mood.errorStreak) return { scene: 'angry', msg: tr().angry(w.errors) }
  if (w.load >= T.load.bands[2]!) return { scene: 'load_max', msg: tr().loadMax(w.load) }
  if (p.asleep) return { scene: 'sleep', msg: p.lightsOff ? tr().sleeping : tr().callMsg.light }
  if (p.call?.reason === 'hungry') return { scene: 'hungry', msg: tr().callMsg.hungry }
  if (p.call?.reason === 'sad') return { scene: 'call', msg: tr().callMsg.sad }
  if (c.idleMin >= T.idle.nap) return { scene: 'sleep', msg: tr().nap(Math.round(c.idleMin)) }
  if (p.poops >= T.needs.dirtyAt) return { scene: 'dirty', msg: tr().dirty }
  if (c.limit >= T.limits.tired) return { scene: 'limit_tired', msg: tr().limitTired(Math.round(c.limit), c.limitKind === 'seven_day') }
  if (p.en < T.needs.tired) return { scene: 'tired', msg: tr().tired }
  if (c.idleMin >= T.idle.bored) return { scene: 'bored', msg: tr().bored }
  if (w.load >= T.load.bands[1]!) return { scene: 'load_heavy', msg: tr().loadHeavy(w.load) }
  if (c.now - w.typingAt < 5000) return { scene: 'listen', msg: tr().listen }
  if (w.load >= T.load.bands[0]!) return { scene: 'idle', msg: tr().loadLight(w.load) }
  return { scene: 'idle', msg: c.idleMin >= T.idle.playAlone ? tr().playAlone : tr().walking }
}

export function age(p: Pet, now: number): string {
  if (p.ch === 'egg') return tr().min(Math.max(0, Math.round((now - p.bornAt) / 60_000)))
  const st = stageOf(p)
  if (st === 'baby') return tr().min(Math.round((now - p.hatchAt) / 60_000))
  return tr().days(p.ageDays)
}

export function title(p: Pet, now: number): string {
  if (p.ch === 'egg') return `${tr().egg} · ${age(p, now)}`
  return `${nameOf(p.ch)} · ${tr().stage[stageOf(p)]} · ${age(p, now)}`
}

// Rows a text takes at a width, wrapped at spaces as the terminal wraps it: a word longer than the width (or a run of
// CJK text, which has no spaces) breaks between characters, a wide character never split; a line break starts a row.
export function wrapRows(s: string, w: number): number {
  w = Math.max(1, w)
  return s.split('\n').reduce((rows, line) => {
    let n = 1, x = 0
    for (const word of line.split(' ')) {
      const k = width(word)
      if (k <= w) {
        if (x > 0 && x + 1 + k > w) { n += 1; x = 0 }
        x += (x > 0 ? 1 : 0) + k
        continue
      }
      if (x > 0) { n += 1; x = 0 }
      for (const ch of word) {
        const c = width(ch)
        if (x + c > w) { n += 1; x = 0 }
        x += c
      }
    }
    return rows + n
  }, 0)
}

export function bar(label: string, v: number, tag = ''): string {
  const n = Math.max(0, Math.min(10, Math.round(v / 10)))
  return `${col(label, 11)}${'█'.repeat(n)}${'░'.repeat(10 - n)} ${String(Math.round(v)).padStart(3)}${tag ? '  ' + tag : ''}`
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString(lang(), { day: 'numeric', month: 'short' })
const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0]

// The statistics as rows the pane lays out at its width: a text line, the label-value pairs, a collection's names, or
// the memorial's lives.
export type StatsRow = HitodamaView['stats'][number]

export function statsRows(p: Pet, h: History, now: number): StatsRow[] {
  const seen = new Set([...h.seen, ...p.path])
  const s = p.stats, L = tr(), S = L.stat
  const model = top(s.models), effort = top(s.efforts)
  const num = (v: number) => v.toLocaleString(lang())
  const rows: StatsRow[] = [
    `${nameOf(p.ch).toUpperCase()} · ${lineName(lineOf(p.line))} · ${L.life(p.life)} · ${p.dead ? L.dead_ : L.stage[stageOf(p)]} · ${age(p, now)}`,
    p.path.length ? p.path.map(nameOf).join(' → ') : L.inEggYet,
    '',
    // Related figures side by side; the two odd ones share the last row.
    { pairs: [
      [S.cm, num(p.cm), S.dm, num(p.dm)],
      [S.weight, `${p.weight} g`, S.disc, `${p.disc}%`],
      [S.turns, num(s.turns), S.night, num(s.nightTurns)],
      [S.meals, num(s.meals), S.snacks, num(s.snacks)],
      [S.games, num(s.games), S.agents, num(s.agents)],
      [S.compacts, num(s.compacts), S.sick, num(s.sick)],
      [S.tokens, num(s.tokens), S.maxLoad, `${s.maxLoad}%`],
    ] },
  ]
  if (model) rows.push('', L.favModel(model[0], Math.round((model[1] / Math.max(1, s.turns)) * 100), effort?.[0] ?? ''))
  for (const line of Object.values(LINES)) {
    const all = Object.keys(line.chars)
    rows.push('', L.collection(lineName(line), all.filter(c => seen.has(c)).length, all.length))
    rows.push({ grid: all.map(c => (seen.has(c) ? `● ${nameOf(c)}` : c === line.secret.to ? '○ ???' : `○ ${nameOf(c)}`)) })
  }
  if (h.lives.length) {
    const best = Math.max(...h.lives.map(l => l.days))
    const avg = Math.round(h.lives.reduce((a, l) => a + l.days, 0) / h.lives.length)
    rows.push('', L.memorial(L.days(best), L.days(avg)))
    rows.push({ lives: h.lives.slice(0, 10).map(l => [`#${l.n}`, `${fmtDate(l.from)} – ${fmtDate(l.to)}`, nameOf(l.ch), causeText(l.cause), L.days(l.days)]) })
  }
  return rows
}

// A table: each column as wide as its widest cell, columns gap apart; the columns named in right are right-aligned.
function table(rows: string[][], right: number[], gap = 2): string[] {
  const ws = rows[0]!.map((_, i) => Math.max(...rows.map(r => width(r[i] ?? ''))))
  const cell = (c: string, i: number) => (right.includes(i) ? ' '.repeat(ws[i]! - width(c)) + c : pad(c, ws[i]!))
  return rows.map(r => r.map(cell).join(' '.repeat(gap)).trimEnd())
}

// A line wider than the pane breaks only between its items (" · ", " → ", two spaces), the next row indented by two,
// so "3 d" or a name never splits; an item wider than the pane is left for the terminal to wrap.
function fit(line: string, w: number): string[] {
  if (width(line) <= w) return [line]
  const parts = line.split(/( · | → | {2,})/)
  const out: string[] = []
  let cur = parts[0]!
  for (let i = 1; i < parts.length; i += 2) {
    const next = cur + parts[i] + parts[i + 1]
    if (width(next) <= w) cur = next
    else { out.push(cur.trimEnd()); cur = '  ' + parts[i + 1] }
  }
  return [...out, cur]
}

// The statistics laid out for w columns: pairs two to a row when they fit, else one; values right-aligned; a
// collection in as many columns as fit; the memorial's dates on a row of their own when its table does not fit.
export function layoutStats(rows: StatsRow[], w: number): string[] {
  return rows.flatMap(r => {
    if (typeof r === 'string') return fit(r, w)
    if ('pairs' in r) {
      const two = table(r.pairs.map(([a, av, b, bv]) => [a!, av!, '', b!, bv!]), [1, 4])
      if (two.every(l => width(l) <= w)) return two
      // One to a row, three columns apart, closer where the pane is narrower.
      const one = (gap: number) => table(r.pairs.flatMap(([a, av, b, bv]) => [[a!, av!], [b!, bv!]]), [1], gap)
      return [3, 2].map(one).find(t => t.every(l => width(l) <= w)) ?? one(1)
    }
    if ('grid' in r) {
      const cell = Math.max(...r.grid.map(width)) + 2, per = Math.max(1, Math.floor((w + 2) / cell)), out: string[] = []
      for (let i = 0; i < r.grid.length; i += per) out.push(r.grid.slice(i, i + per).map(x => pad(x, cell)).join('').trimEnd())
      return out
    }
    const wide = table(r.lives, [4])
    if (wide.every(l => width(l) <= w)) return wide
    const indent = ' '.repeat(Math.max(...r.lives.map(l => width(l[0]!))) + 2)
    return table(r.lives.map(([n, , name, cause, days]) => [n!, name!, cause!, days!]), [3]).flatMap((l, i) => [l, indent + r.lives[i]![1]])
  })
}

// The statistics as text for the chat, laid out for 64 columns.
export const statsText = (p: Pet, h: History, now: number): string => layoutStats(statsRows(p, h, now), 64).join('\n')

// Whether version a is newer than b, both "major.minor.patch"; anything else is never newer.
export function newer(a: string, b: string): boolean {
  const x = a.split(".").map(Number), y = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}
