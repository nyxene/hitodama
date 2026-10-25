// What to show: state by priority, the title, the bars and the stats text.
import { lang, pad, t as tr, width } from './i18n'
import { LINES, lineOf, lineName } from './lines'
import { causeText, nameOf, stageOf, type Ev, type History, type Pet } from './sim'
import { tuning as T } from './tuning'

export type Win = {
  sid: string; room: string; alive: number; lastInput: number; lastActivity: number; typingAt: number
  load: number; model: string; effort: string; turn: boolean; agents: number; errors: number
  limit5: number; limitResetsAt?: string
  seq: number; events: Ev[]
}
export type Ctx = {
  now: number; isOwner: boolean; ownerRoom: string; limit5: number; limitResetsAt?: string
  idleMin: number; anim?: { id: string; until: number; msg: string } | null
}

const EFF: Record<string, string> = { low: 'think_low', medium: 'think_med', high: 'think_high', xhigh: 'think_high', max: 'think_max' }

// Pads to n columns, and always leaves one space after a label longer than that.
const col = (s: string, n: number) => pad(s, Math.max(n, width(s) + 1))

// The five-hour limit to show: the fullest window whose reset has not passed (an idle window keeps an old figure).
export function limitOf(wins: Win[], now: number): { limit5: number; limitResetsAt?: string } {
  const live = wins.filter(w => !w.limitResetsAt || !(Date.parse(w.limitResetsAt) <= now))
  const top = [...live].sort((a, b) => b.limit5 - a.limit5)[0]
  return { limit5: top?.limit5 ?? 0, limitResetsAt: top?.limitResetsAt }
}

function left(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000))
  return m >= 60 ? tr().hm(Math.floor(m / 60), m % 60) : tr().min(m)
}

// The first matching state wins.
export function decide(p: Pet, w: Win, c: Ctx): { scene: string; msg: string } {
  const n = nameOf(p.ch)
  if (p.dead) return { scene: 'dead', msg: tr().dead(n, causeText(p.dead.cause), p.ageDays) }
  if (!c.isOwner) return { scene: 'away', msg: tr().away(n, c.ownerRoom) }
  if (p.ch === 'egg') return { scene: 'egg', msg: tr().eggWait(left(p.bornAt + lineOf(p.line).hatchMinutes * 60_000 - c.now)) }
  if (c.now - p.evolvedAt < 6000) {
    return stageOf(p) === 'baby'
      ? { scene: 'hatch', msg: tr().hatch(n) }
      : { scene: 'evolve', msg: tr().evolve(n) }
  }
  if (c.limit5 >= T.limits.fiveHourHit) {
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
  if (c.limit5 >= T.limits.fiveHourTired) return { scene: 'limit_tired', msg: tr().limitTired(Math.round(c.limit5)) }
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

export function bar(label: string, v: number, tag = ''): string {
  const n = Math.max(0, Math.min(10, Math.round(v / 10)))
  return `${col(label, 11)}${'█'.repeat(n)}${'░'.repeat(10 - n)} ${String(Math.round(v)).padStart(3)}${tag ? '  ' + tag : ''}`
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString(lang(), { day: 'numeric', month: 'short' })
const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0]

export function statsText(p: Pet, h: History, now: number): string {
  const seen = new Set([...h.seen, ...p.path])
  const s = p.stats, L = tr(), S = L.stat
  const model = top(s.models), effort = top(s.efforts)
  const num = (v: number) => v.toLocaleString(lang())
  // Two label-value pairs per row; widths count terminal columns.
  const row = (a: string, av: string, b?: string, bv?: string) => (col(a, 17) + (b ? col(av, 8) + col(b, 19) + bv : av)).trimEnd()
  const lines = [
    `${nameOf(p.ch).toUpperCase()} · ${lineName(lineOf(p.line))} · ${L.life(p.life)} · ${p.dead ? L.dead_ : L.stage[stageOf(p)]} · ${age(p, now)}`,
    p.path.length ? p.path.map(nameOf).join(' → ') : L.inEggYet,
    '',
    row(S.cm, num(p.cm), S.dm, num(p.dm)),
    row(S.weight, `${p.weight} g`, S.disc, `${p.disc}%`),
    row(S.turns, num(s.turns), S.night, num(s.nightTurns)),
    row(S.tokens, num(s.tokens)),
    row(S.meals, num(s.meals), S.snacks, num(s.snacks)),
    row(S.games, num(s.games), S.agents, num(s.agents)),
    row(S.compacts, num(s.compacts), S.sick, num(s.sick)),
    row(S.maxLoad, `${s.maxLoad}%`),
  ]
  if (model) lines.push(L.favModel(model[0], Math.round((model[1] / Math.max(1, s.turns)) * 100), effort?.[0] ?? ''))
  for (const line of Object.values(LINES)) {
    const all = Object.keys(line.chars)
    lines.push('', L.collection(lineName(line), all.filter(c => seen.has(c)).length, all.length))
    lines.push(all.map(c => (seen.has(c) ? `● ${nameOf(c)}` : c === line.secret.to ? '○ ???' : `○ ${nameOf(c)}`)).join('  '))
  }
  if (h.lives.length) {
    const best = Math.max(...h.lives.map(l => l.days))
    const avg = Math.round(h.lives.reduce((a, l) => a + l.days, 0) / h.lives.length)
    lines.push('', L.memorial(L.days(best), L.days(avg)))
    for (const l of h.lives.slice(0, 10)) lines.push(`#${l.n}  ${fmtDate(l.from)} – ${fmtDate(l.to)}  ${nameOf(l.ch)}  ${causeText(l.cause)}  ${L.days(l.days)}`)
  }
  return lines.join('\n')
}
