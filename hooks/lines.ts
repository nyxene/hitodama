// Character lines. Each new egg belongs to a random line from LINES.
import { yokai } from './yokai'
import type { CharDraw } from './draw'
import { lang, type Lang } from './i18n'

export type Stage = 'egg' | 'baby' | 'child' | 'teen' | 'adult' | 'secret'

export type Rule = {
  to: string
  care?: [number, number] // care mistakes at this stage
  dm?: [number, number] // discipline mistakes
  teenStartDisc?: number // discipline the teen started with
  fullDisc?: boolean // discipline at 100%
}

export type Char = {
  name: string // in Latin script; names for languages that write it differently
  names?: Partial<Record<Lang, string>>
  stage: Stage
  sleep?: [number, number] // bedtime, wake-up hour
  weight: number
  lifeDays?: number
}

export type Line = {
  name: string
  names?: Partial<Record<Lang, string>>
  baby: string; child: string
  hatchMinutes: number; childAfterMinutes: number; teenOnDay: number; adultOnDay: number
  teen: Rule[]
  adult: Record<string, Rule[]> // keyed by teen; the first list is the fallback
  secret: { from: string; teenStartDisc: number; onDay: number; to: string }
  chars: Record<string, Char>
  draw: Record<string, CharDraw> // each character's sprite
}

export const LINES: Record<string, Line> = { yokai }
export const CHARS: Record<string, Char> = Object.assign({}, ...Object.values(LINES).map(l => l.chars))
export const DRAW: Record<string, CharDraw> = Object.assign({}, ...Object.values(LINES).map(l => l.draw))
export const lineOf = (key?: string): Line => LINES[key ?? 'yokai'] ?? Object.values(LINES)[0]!
export const randomLine = (r = Math.random()) => { const k = Object.keys(LINES); return k[Math.floor(r * k.length)]! }
export const lineName = (l: Line) => l.names?.[lang()] ?? l.name

export type Grow = { care: number; dm: number; disc: number; teenStartDisc: number }

const within = (v: number, r?: [number, number]) => !r || (v >= r[0] && v <= r[1])

export function pick(rules: Rule[], g: Grow): string {
  const hit = rules.find(r =>
    within(g.care, r.care) && within(g.dm, r.dm) &&
    (r.teenStartDisc === undefined || r.teenStartDisc === g.teenStartDisc) &&
    (!r.fullDisc || g.disc >= 100))
  return (hit ?? rules[rules.length - 1]!).to
}
