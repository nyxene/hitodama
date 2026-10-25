// The pet as plain data: time → needs, calls, care mistakes, growth, death. No $, so tests cover all of it.
import { CHARS, lineOf, pick, randomLine, type Stage } from './lines'
import { lang, t as tr } from './i18n'
import { tuning as T } from './tuning'

const MIN = 60_000, HOUR = 60 * MIN

export type Call = { reason: 'hungry' | 'sad' | 'light' | 'sick'; since: number; missed: boolean }
export type Life = {
  n: number; ch: string; path: string[]; from: number; to: number; days: number; cause: string
}
export type Stats = {
  turns: number; nightTurns: number; tokens: number; meals: number; snacks: number; games: number
  agents: number; compacts: number; sick: number; maxLoad: number; models: Record<string, number>; efforts: Record<string, number>
}
export type Pet = {
  v: 1
  life: number
  ch: string // 'egg' or a key of CHARS
  line?: string // key of LINES; absent in old saves
  path: string[]
  bornAt: number; hatchAt: number; at: number
  ageDays: number
  asleep: boolean; lightsOff: boolean
  sat: number; en: number; joy: number; hp: number; weight: number
  disc: number; teenStartDisc: number; cm: number; dm: number
  poops: number; poopClock: number; starve: number
  sick: boolean; snackTimes: number[]
  call: Call | null
  tantrum: { since: number } | null; nextTantrum: number
  evolvedAt: number
  wokeAt?: number // when it last woke; absent in old saves
  dead: { at: number; cause: string } | null
  applied: Record<string, number> // last applied event number of each window
  stats: Stats
  log: { t: number; text: string }[] // journal for the pane, last 40 entries
}
export type History = { lives: Life[]; seen: string[] }

export type Ev =
  | { seq: number; k: 'turn'; cost: number; model: string; effort: string; tokens: number; load: number }
  | { seq: number; k: 'abort' }
  | { seq: number; k: 'compact' }
  | { seq: number; k: 'errors' }
  | { seq: number; k: 'agent' }

const clamp = (v: number) => Math.max(0, Math.min(100, v))
const emptyStats = (): Stats => ({ turns: 0, nightTurns: 0, tokens: 0, meals: 0, snacks: 0, games: 0, agents: 0, compacts: 0, sick: 0, maxLoad: 0, models: {}, efforts: {} })

export function newEgg(now: number, life = 1, line = randomLine()): Pet {
  return {
    v: 1, life, ch: 'egg', line, path: [], bornAt: now, hatchAt: 0, at: now, ageDays: 0,
    asleep: false, lightsOff: false, sat: 80, en: 80, joy: 80, hp: 100, weight: 5,
    disc: 0, teenStartDisc: 0, cm: 0, dm: 0, poops: 0, poopClock: 0, starve: 0,
    sick: false, snackTimes: [], call: null, tantrum: null, nextTantrum: 0, evolvedAt: 0,
    dead: null, applied: {}, stats: emptyStats(), log: [{ t: now, text: tr().logNewEgg(life) }],
  }
}

// What every tick touches; a saved file without it is damaged, never a reason to start a new egg.
export const isPet = (p: unknown): p is Pet => {
  const o = p as Partial<Pet> | null
  return !!o && typeof o === 'object' && typeof o.at === 'number' && typeof o.ch === 'string'
    && !!o.applied && typeof o.applied === 'object' && !!o.stats && typeof o.stats === 'object'
    && Array.isArray(o.path) && Array.isArray(o.snackTimes)
}

export const isHistory = (h: unknown): h is History =>
  !!h && Array.isArray((h as History).lives) && Array.isArray((h as History).seen)

export const causeText = (key: string) => tr().cause[key] ?? key

export function note(p: Pet, t: number, text: string) {
  p.log = [...(p.log ?? []), { t, text }].slice(-40)
}

export const stageOf = (p: Pet): Stage => (p.ch === 'egg' ? 'egg' : CHARS[p.ch]?.stage ?? 'adult')
export const nameOf = (ch: string) => (ch === 'egg' ? tr().egg : (CHARS[ch]?.names?.[lang()] ?? CHARS[ch]?.name ?? ch))

export function isSleepHour(ch: string, hour: number): boolean {
  const s = CHARS[ch]?.sleep
  if (!s) return false
  const [from, to] = s
  return from > to ? hour >= from || hour < to : hour >= from && hour < to
}

function evolveTo(p: Pet, ch: string, t: number) {
  p.ch = ch
  p.path.push(ch)
  note(p, t, CHARS[ch]?.stage === 'baby' ? tr().logHatched(nameOf(ch)) : tr().logEvolved(nameOf(ch)))
  p.evolvedAt = t
  p.cm = 0
  p.dm = 0
  p.weight = Math.max(p.weight, CHARS[ch]?.weight ?? p.weight)
}

function die(p: Pet, t: number, cause: string) {
  p.dead = { at: t, cause }
  note(p, t, tr().logDied(causeText(cause)))
  p.call = null
  p.tantrum = null
}

function maybeGrow(p: Pet, t: number) {
  const L = lineOf(p.line)
  const st = stageOf(p)
  const g = { care: p.cm, dm: p.dm, disc: p.disc, teenStartDisc: p.teenStartDisc }
  if (st === 'child' && p.ageDays >= L.teenOnDay) {
    p.teenStartDisc = p.disc >= 75 ? 50 : 0
    evolveTo(p, pick(L.teen, g), t)
    p.disc = p.teenStartDisc
  } else if (st === 'teen' && p.ageDays >= L.adultOnDay) {
    evolveTo(p, pick(L.adult[p.ch] ?? Object.values(L.adult)[0]!, g), t)
  } else if (p.ch === L.secret.from && p.teenStartDisc === L.secret.teenStartDisc && p.ageDays >= L.secret.onDay) {
    evolveTo(p, L.secret.to, t)
  }
}

const rand = (seed: number) => {
  const x = Math.sin(seed) * 10_000
  return x - Math.floor(x)
}
function scheduleTantrum(p: Pet, t: number) {
  const [a, b] = T.discipline.everyHours
  p.nextTantrum = t + (a + rand(t) * (b - a)) * HOUR
}

// One time step. offline: Claude was closed, so everything is slower and there are no calls or tantrums.
export function step(p: Pet, t: number, dtMs: number, hour: number, offline: boolean): void {
  if (p.dead) return
  const h = dtMs / HOUR
  const st = stageOf(p)

  const L = lineOf(p.line)
  if (st === 'egg') {
    if (t - p.bornAt >= L.hatchMinutes * MIN) {
      p.hatchAt = t
      evolveTo(p, L.baby, t)
    }
    return
  }
  if (st === 'baby' && t - p.hatchAt >= L.childAfterMinutes * MIN) {
    evolveTo(p, L.child, t)
    scheduleTantrum(p, t)
  }

  // Sleep follows the schedule; a day of age is added on waking. Within 12 hours of waking it falls asleep only at
  // bedtime, so a form that comes out on waking with a later wake-up hour does not drop off again at once.
  const sleepy = isSleepHour(p.ch, hour)
  if (sleepy && !p.asleep && (hour === CHARS[p.ch]?.sleep?.[0] || !(t - (p.wokeAt ?? 0) < 12 * HOUR))) p.asleep = true
  if (!sleepy && p.asleep) {
    p.asleep = false
    p.wokeAt = t
    p.lightsOff = false
    p.ageDays += 1
    maybeGrow(p, t)
  }

  const life = CHARS[p.ch]?.lifeDays
  const old = life !== undefined && p.ageDays >= life * 0.8
  const off = offline ? T.offline.decayFactor : 1
  const mul = (old ? T.stageDecay.old : T.stageDecay[st]) * (p.asleep ? T.asleepFactor : 1) * off

  p.sat = clamp(p.sat - T.decayPerHour.satiety * mul * h)
  p.joy = clamp(p.joy - T.decayPerHour.joy * mul * h)
  p.en = clamp(p.asleep ? p.en + T.sleepRecoverPerHour * h : p.en - T.decayPerHour.energy * mul * h)

  if (!p.asleep) {
    p.poopClock += h * off
    if (p.poopClock >= T.poop.everyAwakeHours) {
      p.poopClock = 0
      p.poops = Math.min(T.poop.max, p.poops + 1)
    }
  }
  // In the pocket nothing is fatal: health stops at the sickness line and hunger does not count towards starving.
  const floor = offline ? Math.min(p.hp, T.needs.sick) : 0
  p.hp = Math.max(floor, clamp(p.hp - (T.poop.healthPerHourEach * p.poops + (p.sick ? T.sick.hpPerHour : 0)) * h * off))
  if (p.hp < T.needs.sick && !p.sick) {
    p.sick = true
    p.stats.sick += 1
    note(p, t, tr().logSick)
  }

  // Hunger counts towards starving only while it can be fed: not in the pocket, not asleep.
  p.starve = p.sat > 0 ? 0 : offline || p.asleep ? p.starve : p.starve + h
  if (p.starve >= T.death.starveHours) return die(p, t, 'starve')
  if (p.hp <= 0) return die(p, t, 'sick')
  if (life !== undefined && p.ageDays >= life) return die(p, t, 'old')

  // In the pocket an open call or tantrum waits: its 15 minutes start again when Claude is back.
  if (offline) {
    if (p.call) p.call.since = t
    if (p.tantrum) p.tantrum.since = t
    return
  }

  // A call unanswered for 15 minutes is a care mistake. Asleep it calls only for what can be done at night.
  const need: Call['reason'] | null = p.asleep
    ? (p.sick ? 'sick' : !p.lightsOff ? 'light' : null)
    : p.sat < T.needs.hungry ? 'hungry' : p.joy < T.needs.sad ? 'sad' : p.sick ? 'sick' : null
  if (!need) p.call = null
  else if (!p.call || p.call.reason !== need) {
    p.call = { reason: need, since: t, missed: false }
    note(p, t, tr().logCall(tr().callWord[need]))
  } else if (!p.call.missed && t - p.call.since >= T.attention.answerMinutes * MIN) {
    p.call.missed = true
    p.cm += 1
    note(p, t, tr().logCareMiss(T.attention.answerMinutes))
  }

  // Children and teens throw tantrums; one left for 15 minutes is a discipline mistake.
  if ((st === 'child' || st === 'teen') && !p.asleep) {
    if (p.tantrum && t - p.tantrum.since >= T.discipline.tantrumMinutes * MIN) {
      p.tantrum = null
      p.dm += 1
      note(p, t, tr().logDiscMiss)
      scheduleTantrum(p, t)
    } else if (!p.tantrum && p.nextTantrum && t >= p.nextTantrum) {
      p.tantrum = { since: t }
      note(p, t, tr().logTantrum)
    }
  } else p.tantrum = null
}

// Catches up from p.at to now in one-minute steps. A gap longer than staleAfter means "in the pocket".
export function advance(p: Pet, now: number, hourAt: (t: number) => number): void {
  const gap = now - p.at
  const offline = gap > T.presence.staleAfterMinutes * MIN
  const from = Math.max(p.at, now - 30 * 24 * HOUR)
  for (let t = from; t < now; t += MIN) {
    const dt = Math.min(MIN, now - t)
    step(p, t + dt, dt, hourAt(t + dt), offline)
  }
  p.at = now
}

// Window events: turns cost energy, aborts and errors cost mood, /compact cheers it up.
export function applyEvent(p: Pet, e: Ev, t = p.at): void {
  if (p.dead || p.ch === 'egg') return
  switch (e.k) {
    case 'turn':
      p.en = clamp(p.en - e.cost)
      p.stats.turns += 1
      p.stats.tokens += e.tokens
      p.stats.maxLoad = Math.max(p.stats.maxLoad, e.load)
      p.stats.models[e.model] = (p.stats.models[e.model] ?? 0) + 1
      p.stats.efforts[e.effort] = (p.stats.efforts[e.effort] ?? 0) + 1
      if (p.asleep) {
        p.stats.nightTurns += 1
        p.joy = clamp(p.joy + T.night.joyPerTurn)
      }
      break
    case 'abort': p.joy = clamp(p.joy + T.mood.abort); break
    case 'compact': p.joy = clamp(p.joy + T.load.compactJoy); p.stats.compacts += 1; note(p, t, tr().logCompact); break
    case 'errors': p.joy = clamp(p.joy + T.mood.errorJoy); note(p, t, tr().logErrors); break
    case 'agent': p.stats.agents += 1; break
  }
}

export function turnCost(model: string, effort: string, load: number, asleep: boolean): number {
  const m = Object.entries(T.turn.model).find(([k]) => model.toLowerCase().includes(k))?.[1] ?? 1
  const band = T.load.bands.filter(b => load >= b).length
  return T.turn.energy * (T.turn.effort[effort] ?? 1) * m * T.load.energyMul[band]! * (asleep ? T.night.energyMul : 1)
}

export type Act = 'eat' | 'snack' | 'game' | 'clean' | 'heal' | 'light' | 'scold'
// Returns which animation to show and what to say. refuse means it said no.
export function act(p: Pet, a: Act, t: number): { anim: string; msg: string } {
  const name = nameOf(p.ch)
  if (p.dead || p.ch === 'egg') return { anim: '', msg: p.dead ? tr().gone : tr().eggNoTouch }
  if (p.asleep && a !== 'light' && a !== 'heal') return { anim: '', msg: tr().asleep(name) }
  switch (a) {
    case 'eat':
      if (p.tantrum) return { anim: 'refuse', msg: tr().tantrumNoEat }
      if (p.sick) return { anim: 'refuse', msg: tr().sickNoEat }
      if (p.sat >= 100) return { anim: 'refuse', msg: tr().notHungry }
      p.sat = clamp(p.sat + T.care.meal)
      p.weight += T.weight.meal
      p.stats.meals += 1
      return { anim: 'eat', msg: tr().ate(T.care.meal, T.weight.meal) }
    case 'snack': {
      if (p.sick) return { anim: 'refuse', msg: tr().sickNoSnack }
      p.joy = clamp(p.joy + T.care.snackJoy)
      p.weight += T.weight.snack
      p.stats.snacks += 1
      p.snackTimes = [...p.snackTimes.filter(s => t - s < HOUR), t]
      if (p.snackTimes.length >= T.weight.snacksPerHourSick && !p.sick) {
        p.sick = true
        p.hp = Math.min(p.hp, T.needs.sick - 1)
        p.stats.sick += 1
        return { anim: 'sick', msg: tr().candySick }
      }
      return { anim: 'snack', msg: tr().candy(T.care.snackJoy, T.weight.snack) }
    }
    case 'game':
      if (p.sick) return { anim: 'refuse', msg: tr().sickNoGame }
      return { anim: 'game', msg: tr().gameStart }
    case 'clean':
      if (!p.poops) return { anim: '', msg: tr().alreadyClean }
      p.poops = 0
      return { anim: 'clean', msg: tr().cleaned }
    case 'heal':
      if (!p.sick) return { anim: 'refuse', msg: tr().healthy }
      p.hp = clamp(p.hp + T.care.heal)
      if (p.hp >= T.care.cure) p.sick = false
      return { anim: 'heal', msg: p.sick ? tr().healAgain : tr().healed }
    case 'light':
      p.lightsOff = !p.lightsOff
      return { anim: '', msg: p.lightsOff ? tr().lightOff : tr().lightOn }
    case 'scold':
      if (p.tantrum) {
        p.tantrum = null
        p.disc = Math.min(100, p.disc + T.discipline.step)
        scheduleTantrum(p, t)
        return { anim: 'scold', msg: tr().scolded(T.discipline.step) }
      }
      p.joy = clamp(p.joy + T.mood.scoldNoReason)
      return { anim: 'scold', msg: tr().scoldNoReason }
  }
}

// Result of the left-or-right game: 5 rounds, 3 wins make it happy. Null when the pet can no longer play.
export function finishGame(p: Pet, wins: number): string | null {
  if (!canPlay(p)) return null
  p.weight = Math.max(CHARS[p.ch]?.weight ?? 1, p.weight + T.weight.game)
  p.en = clamp(p.en + T.care.gameEnergy)
  p.stats.games += 1
  if (wins >= 3) {
    p.joy = clamp(p.joy + T.mood.gameWin)
    return tr().gameWin(wins, T.mood.gameWin)
  }
  return tr().gameLose(wins)
}

export const canPlay = (p: Pet) => !p.dead && p.ch !== 'egg' && !p.asleep && !p.sick

export function bury(p: Pet, h: History): History {
  const life: Life = {
    n: p.life, ch: p.ch, path: p.path, from: p.hatchAt || p.bornAt, to: p.dead?.at ?? p.at,
    days: p.ageDays, cause: p.dead?.cause ?? '',
  }
  return { ...h, lives: [life, ...h.lives] }
}

export function remember(h: History, ch: string): History {
  return ch === 'egg' || h.seen.includes(ch) ? h : { ...h, seen: [...h.seen, ch] }
}
