import { expect, test } from 'claude-code/testing'

import { LANGS, setLang, t as tr } from '../hooks/i18n'
import { CHARS } from '../hooks/lines'
import { act, advance, newEgg, step, type Pet } from '../hooks/sim'
import { cells, scene } from '../hooks/sprites'
import { decide, statsText, title, type Ctx, type Win } from '../hooks/view'

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR
const T0 = Date.UTC(2026, 9, 24, 12) // noon UTC
const utc = (t: number) => new Date(t).getUTCHours()
const win: Win = { sid: 'a', room: 'r', alive: 0, lastInput: 0, lastActivity: 0, typingAt: 0, load: 0, model: '', effort: 'high', turn: false, agents: 0, errors: 0, limit5: 0, seq: 0, events: [] }
const ctx = (now: number, over: Partial<Ctx> = {}): Ctx => ({ now, isOwner: true, ownerRoom: 'r', limit5: 0, idleMin: 0, anim: null, ...over })
const egg = () => newEgg(T0, 1, 'yokai')

// Lives online, always fed and cleaned up: perfect care.
function liveWell(p: Pet, from: number, to: number) {
  for (let t = from; t < to; t += MIN) {
    step(p, t + MIN, MIN, utc(t + MIN), false)
    if (p.sat < 60) { p.sat = 90 }
    p.joy = 90; p.poops = 0; p.hp = 100
    if (p.asleep) p.lightsOff = true
    if (p.tantrum) act(p, 'scold', t)
  }
  p.at = to
}

test('the egg hatches after 5 minutes and the baby grows after 65 more', () => {
  const p = egg()
  advance(p, T0 + 4 * MIN, utc)
  expect(p.ch).toBe('egg')
  advance(p, T0 + 6 * MIN, utc)
  expect(p.ch).toBe('hitodama')
  advance(p, T0 + 72 * MIN, utc)
  expect(p.ch).toBe('sunekosuri')
})

test('perfect care grows a Kyubi', () => {
  const p = egg()
  liveWell(p, T0, T0 + 3 * DAY + 2 * HOUR)
  expect(p.ch).toBe('kitsune')
  expect(p.teenStartDisc).toBe(50)
  liveWell(p, p.at, T0 + 6 * DAY + 2 * HOUR)
  expect(p.path).toEqual(['hitodama', 'sunekosuri', 'kitsune', 'kyubi'])
})

test('a call left unanswered for 15 minutes is one care mistake', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  p.sat = 10
  const t = p.at
  step(p, t + MIN, MIN, utc(t), false)
  expect(p.call?.reason).toBe('hungry')
  for (let i = 2; i <= 16; i++) step(p, t + i * MIN, MIN, utc(t), false)
  expect(p.cm).toBe(1)
  for (let i = 17; i <= 40; i++) step(p, t + i * MIN, MIN, utc(t), false)
  expect(p.cm).toBe(1) // one call, one mistake
})

test('while Claude is closed a hungry pet makes no calls and needs drop slower', () => {
  const online = egg(), offline = egg()
  advance(online, T0 + 70 * MIN, utc)
  advance(offline, T0 + 70 * MIN, utc)
  online.sat = offline.sat = 20
  const t = online.at
  for (let i = 1; i <= 60; i++) step(online, t + i * MIN, MIN, utc(t), false)
  advance(offline, t + 60 * MIN, utc) // a gap over 2 minutes means "in the pocket"
  expect(offline.sat).toBeGreaterThan(online.sat)
  expect(online.cm).toBe(1)
  expect(offline.cm).toBe(0)
  expect(offline.call).toBeNull()
})

test('a weekend with Claude closed is not fatal: the pet comes back hungry', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  p.poops = 4
  advance(p, p.at + 3 * DAY, utc)
  expect(p.dead).toBeNull()
  expect(p.sat).toBe(0)
  expect(p.hp).toBeGreaterThanOrEqual(20)
})

test('medicine: a badly sick pet needs a second dose', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  p.sick = true; p.hp = 5
  expect(act(p, 'heal', p.at).msg).toBe(tr().healAgain)
  expect(p.sick).toBe(true)
  expect(act(p, 'heal', p.at).msg).toBe(tr().healed)
  expect(p.sick).toBe(false)
})

test('12 hours at zero fullness is death by hunger', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  p.sat = 0
  for (let i = 1; i <= 13 * 60; i++) step(p, p.at + i * MIN, MIN, 14, false)
  expect(p.dead?.cause).toBe('starve')
})

test('priority: death, then another window, then sickness over a running turn', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  p.sick = true
  expect(decide(p, { ...win, turn: true }, ctx(p.at + 10_000)).scene).toBe('sick')
  expect(decide(p, win, ctx(p.at, { isOwner: false })).scene).toBe('away')
  p.dead = { at: p.at, cause: 'sick' }
  expect(decide(p, win, ctx(p.at, { isOwner: false })).scene).toBe('dead')
})

test('every language names the pet and its stage, and shows stats', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  for (const l of LANGS) {
    setLang(l)
    expect(title(p, p.at)).toContain(tr().stage.child)
    expect(statsText(p, { lives: [], seen: [] }, p.at)).toContain(tr().stat.cm)
  }
  setLang('ru')
  expect(title(p, p.at)).toContain('Сунэкосури')
  setLang('en')
  expect(title(p, p.at)).toContain('Sunekosuri')
})

test('every character draws itself in every scene at 32 × 12 cells', () => {
  const scenes = ['egg', 'hatch', 'evolve', 'idle', 'listen', 'call', 'happy', 'angry', 'bored', 'hungry', 'dirty', 'tired', 'sick', 'sleep',
    'night_grumpy', 'tantrum', 'refuse', 'eat', 'snack', 'game', 'heal', 'clean', 'scold', 'think_low', 'think_med', 'think_high', 'think_max',
    'waiting', 'load_heavy', 'load_max', 'relief', 'limit_tired', 'limit_hit', 'away', 'dead']
  for (const ch of Object.keys(CHARS)) for (const id of scenes) for (let t = 0; t < 4; t++) {
    const px = scene(id, { ch, load: 95, poops: 3, agents: 2 }, t)
    expect(px.some(Boolean)).toBe(true)
    const c = cells(px, t % 2 === 0)
    expect(c.length).toBe(Math.ceil((32 * 12 * 12) / 3) * 4)
  }
})

test('the pane draws its screen, title and care buttons, doubling the screen when it fits', async $ => {
  for (const [surface, bodyColumns, bodyRows, lcd] of [['terminal', 40, 30, 32], ['terminal', 70, 60, 64], ['desktop', 40, 30, 0]] as const) {
    const ui = await $.ui.mount({
      plugin: 'hitodama', surface, component: 'Pane', requestId: 'hitodama',
      props: { title: 'Hitodama', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
    })
    expect((await ui.find({ type: 'Text', text: /Hitodama/ }))?.text).toContain('Hitodama')
    expect(await ui.find({ key: 'b-eat' })).toBeDefined()
    expect((await ui.find({ key: 'lcd' }))?.props.columns).toBe(lcd || undefined)
    await ui.unmount()
  }
})

test('the large screen is 64 × 24 cells, two columns per pixel', () => {
  const px = scene('idle', { ch: 'kyubi' }, 0)
  expect(cells(px, false, 2).length).toBe(Math.ceil((64 * 24 * 12) / 3) * 4)
})
