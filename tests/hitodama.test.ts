import type { On } from 'claude-code'
import { expect, test as kitTest, type Engine, type TestBody } from 'claude-code/testing'

import { LANGS, setLang, t as tr } from '../hooks/i18n'
import { CHARS } from '../hooks/lines'
import { act, advance, applyEvent, finishGame, isHistory, isPet, newEgg, step, turnCost, type Ev, type History, type Pet } from '../hooks/sim'
import { cells, scene } from '../hooks/sprites'
import { bar, decide, lastActive, limitOf, paceOf, restFrom, statsText, title, type Ctx, type Win } from '../hooks/view'

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR
const T0 = Date.UTC(2026, 9, 24, 12) // noon UTC
const utc = (t: number) => new Date(t).getUTCHours()
const win: Win = { sid: 'a', room: 'r', alive: 0, lastInput: 0, lastActivity: 0, typingAt: 0, load: 0, model: '', effort: 'high', turn: false, agents: 0, errors: 0, limit: 0, seq: 0, events: [] }
const ctx = (now: number, over: Partial<Ctx> = {}): Ctx => ({ now, isOwner: true, ownerRoom: 'r', limit: 0, idleMin: 0, anim: null, ...over })
const egg = () => newEgg(T0, 1, 'yokai')
// The kit's 5 s limit is wall-clock time: on a loaded machine the drawing and session tests ran up to fifteen
// times slower than idle, and a run failed once and passed on rerun (#13). They check results, not speed.
const test = (name: string, body: TestBody) => kitTest(name, { timeoutMs: 60_000 }, body)

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

test('perfect care grows a Kyūbi', () => {
  const p = egg()
  liveWell(p, T0, T0 + 3 * DAY + 2 * HOUR)
  expect(p.ch).toBe('kitsune')
  expect(p.teenStartDisc).toBe(50)
  liveWell(p, p.at, T0 + 6 * DAY + 2 * HOUR)
  expect(p.path).toEqual(['hitodama', 'sunekosuri', 'kitsune', 'kyubi'])
})

test('an awake child loses mood at an adult rate, 3 an hour, and fullness and energy at twice an adult rate', () => {
  const p = egg()
  advance(p, T0 + 72 * MIN, utc)
  expect(p.ch).toBe('sunekosuri')
  p.joy = p.sat = p.en = 80
  const t = p.at
  for (let i = 1; i <= 60; i++) step(p, t + i * MIN, MIN, utc(t), false)
  expect([Math.round(p.joy), Math.round(p.sat), Math.round(p.en)]).toEqual([77, 68, 72])
})

// Lives `minutes` more minutes from p.at, in focus or not, at the given UTC hour (noon: awake).
function live(p: Pet, minutes: number, focus: boolean, hour = 12) {
  const t = p.at
  for (let i = 1; i <= minutes; i++) step(p, t + i * MIN, MIN, hour, false, false, Infinity, focus)
  p.at = t + minutes * MIN
}
const tenth = (x: number) => Math.round(x * 10) / 10

test('in focus an awake child loses mood and fullness at half the rate, and energy as before', () => {
  const p = child()
  p.joy = p.sat = p.en = 80
  live(p, 60, true)
  expect([tenth(p.joy), tenth(p.sat), tenth(p.en)]).toEqual([78.5, 74, 72])
})

test('in focus an open call is not missed and a due tantrum waits; both count again once focus ends', () => {
  const p = child()
  p.joy = 10
  p.nextTantrum = p.at
  live(p, 1, false)
  expect(p.call?.reason).toBe('sad')
  p.tantrum = null
  live(p, 30, true)
  expect([p.cm, p.dm, p.tantrum]).toEqual([0, 0, null])
  live(p, 16, false)
  expect([p.cm, p.dm]).toEqual([1, 1])
})

test('an open tantrum gets its full 15 minutes again once focus ends', () => {
  const p = child()
  p.tantrum = { since: p.at }
  live(p, 30, true)
  live(p, 14, false)
  expect([p.dm, !!p.tantrum]).toEqual([0, true])
  live(p, 2, false)
  expect(p.dm).toBe(1)
})

test('in focus a starving or sick pet still calls and its call is missed, and no tantrum starts', () => {
  for (const make of [(p: Pet) => { p.sat = 0 }, (p: Pet) => { p.sick = true }]) {
    const p = child()
    make(p)
    p.nextTantrum = p.at
    live(p, 16, true)
    expect([p.call?.missed, p.cm, p.tantrum]).toEqual([true, 1, null])
  }
})

test('in focus a sleeping pet is as it would be without', () => {
  const a = child(), b = child()
  live(a, 60, true, 22)
  live(b, 60, false, 22)
  expect(a.asleep).toBe(true)
  expect([a.sat, a.joy, a.cm, a.call?.reason]).toEqual([b.sat, b.joy, b.cm, b.call?.reason])
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

test('old age waits while Claude is closed, and comes once it is back', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  p.ch = 'kyubi'; p.ageDays = (CHARS.kyubi!.lifeDays ?? 0) - 1
  advance(p, p.at + 3 * DAY, utc)
  expect(p.ageDays).toBeGreaterThanOrEqual(CHARS.kyubi!.lifeDays!)
  expect(p.dead).toBeNull()
  step(p, p.at + MIN, MIN, utc(p.at + MIN), false)
  expect(p.dead?.cause).toBe('old')
})

test('at the five-hour limit a hungry pet rests: no call and no care mistake until the reset', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  p.sat = 10
  const t = p.at
  for (let i = 1; i <= 30; i++) step(p, t + i * MIN, MIN, utc(t), false, true)
  expect(p.call).toBeNull()
  expect(p.cm).toBe(0)
  for (let i = 31; i <= 46; i++) step(p, t + i * MIN, MIN, utc(t), false)
  expect(p.call?.reason).toBe('hungry')
  expect(p.cm).toBe(1)
})

test('at the five-hour limit nothing kills it, and a call it no longer needs closes', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  p.sat = 0; p.hp = 30; p.poops = 4
  step(p, p.at + MIN, MIN, utc(p.at), false)
  expect(p.call?.reason).toBe('hungry')
  const t = p.at + MIN
  for (let i = 1; i <= 24 * 60; i++) step(p, t + i * MIN, MIN, utc(t + i * MIN), false, true)
  expect(p.dead).toBeNull()
  expect(p.hp).toBeGreaterThan(0)
  p.sat = 90; p.joy = 90; p.sick = false
  step(p, t + 24 * 60 * MIN + MIN, MIN, utc(t), false, true)
  expect(p.call).toBeNull()
})

test('at the five-hour limit an open call sends no notification on every tick', async ($, on) => {
  const p = child()
  p.sat = 10
  advance(p, T0 + 3000, utc)
  expect(p.call?.reason).toBe('hungry')
  const limited: Win = { ...win, sid: 's2', alive: T0 + HOUR, limit: 100, limitKind: 'five_hour', limitResetsAt: new Date(T0 + 5 * HOUR).toISOString() }
  let notified = 0
  on('ui.notify', () => { notified += 1; return { value: { isSent: true, channel: 'ghostty' } as const } })
  // Timer ticks, not /hd: /hd counts as typing, and nobody is notified while typing.
  const s = await session($, on, { 'pet.json': JSON.stringify(p), 'seen/s2.json': JSON.stringify(limited) }, { timer: true })
  for (let i = 0; i < 5; i++) await s.timerTick()
  const saved = JSON.parse(s.writes['pet.json'] ?? '{}') as Pet
  expect(saved.at).toBeGreaterThan(T0 + 4 * 3000) // the timer ticks ran, not only the one at session start
  expect(saved.call?.reason).toBe('hungry')
  expect(notified).toBe(0)
})

// A child with fullness `sat` and a tantrum due, in a session whose window runs a turn: the pet it writes after five
// timer ticks, and how many notifications were sent.
async function focused($: Engine, on: On, sat: number, open: boolean, tantrum = false) {
  const p = child()
  p.sat = sat
  p.nextTantrum = p.at + HOUR
  if (open) advance(p, T0 + 3000, utc)
  if (tantrum) p.tantrum = { since: p.at }
  let notified = 0
  on('ui.notify', () => { notified += 1; return { value: { isSent: true, channel: 'ghostty' } as const } })
  // A calm pet for the tick at session start, before the turn; the one under test from the first tick in focus.
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) }, { timer: true })
  await s.timerTick() // the tick at session start has run by now
  await $.turn.start({ text: '', turnId: 't1' })
  s.files['pet.json'] = JSON.stringify(p)
  for (let i = 0; i < 5; i++) {
    await s.timerTick()
    s.files['pet.json'] = s.writes['pet.json']! // each tick reads what the last one wrote
  }
  return { saved: JSON.parse(s.writes['pet.json'] ?? '{}') as Pet, notified }
}

test('a call held while Claude works in the pet\'s window sends no notification on every tick', async ($, on) => {
  const { saved, notified } = await focused($, on, 10, true)
  expect(saved.call?.reason).toBe('hungry')
  expect(notified).toBe(0)
})

test('a tantrum held while Claude works in the pet\'s window sends no notification on every tick', async ($, on) => {
  const { saved, notified } = await focused($, on, 80, false, true)
  expect(saved.tantrum).not.toBeNull()
  expect(notified).toBe(0)
})

test('a starving pet still calls while Claude works in its window, notified once', async ($, on) => {
  const { saved, notified } = await focused($, on, 0, false)
  expect(saved.call?.reason).toBe('hungry')
  expect(notified).toBe(1)
})

test('a tantrum due while Claude works in the pet\'s window starts once the turn ends', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  const p = child()
  p.nextTantrum = p.at
  p.tantrum = null
  // The timer ticks one at a time here; without it, ticks run on their own between the steps of the test.
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) }, { timer: true })
  await s.timerTick() // the tick at session start has run by now
  await $.turn.start({ text: '', turnId: 't1' })
  s.files['pet.json'] = JSON.stringify(p)
  await s.timerTick()
  expect((JSON.parse(s.writes['pet.json'] ?? '{}') as Pet).tantrum).toBeNull()
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(1000) })
  await s.timerTick()
  expect((JSON.parse(s.writes['pet.json'] ?? '{}') as Pet).tantrum).not.toBeNull()
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

test('a saved pet and history are told apart from damaged files', () => {
  expect(isPet(JSON.parse(JSON.stringify(egg())))).toBe(true)
  for (const bad of [null, {}, [], 'egg', { ...egg(), applied: undefined }, { ...egg(), stats: null }]) expect(isPet(bad)).toBe(false)
  expect(isHistory({ lives: [], seen: [] })).toBe(true)
  for (const bad of [null, {}, { lives: {}, seen: [] }, { lives: [] }]) expect(isHistory(bad)).toBe(false)
})

test('a run with nobody at the prompt leaves the pet alone', async ($, on) => {
  // The first thing a window does is learn its session id; a run that stays out never asks.
  let asked = 0
  on('session.id', () => { asked += 1; return { value: 's1' } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  expect(asked).toBe(0)
})

// A child that hatched an hour before the session's clock starts.
const child = () => { const p = newEgg(T0 - 71 * MIN, 1, 'yokai'); advance(p, T0, utc); return p }

// A session over a fake home folder: files maps a name under ~/.claude/hitodama to its content.
// Each /hd runs one tick, three seconds after the last; a failing one is said after three in a row.
// timer: the three-second tick runs once per timerTick(), and the animation frame once per frameTick(), instead of at once.
// blits holds the length of every animation frame sent.
async function session($: Engine, on: On, files: Record<string, string>, opts: { listFails?: boolean; timer?: boolean } = {}) {
  const dir = '/h/.claude/hitodama/', writes: Record<string, string> = {}, order: string[] = [], logs: string[] = [], blits: number[] = []
  let now = T0
  const waiting: (() => void)[] = [], frames: (() => void)[] = []
  on('clock.now', () => ({ value: (now += 3000) }))
  on('clock.every', (_, e) => !opts.timer ? { value: undefined }
    : new Promise(done => { (e.ms === 3000 ? waiting : frames).push(() => done({ value: undefined })) }))
  on('ui.blit', (_, e) => { if ('cells' in e) blits.push(e.cells.length); return { value: {} } })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('command.run', () => ({ text: '' }))
  on('session.id', () => ({ value: 's1' }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/h' : undefined }))
  on('process.run', () => ({ value: { stdout: '+0000\n', stderr: '', exitCode: 0, isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.repo', () => ({ value: null }))
  on('fs.exists', (_, e) => ({ value: e.path.slice(dir.length) in files }))
  on('fs.read', (_, e) => ({ value: files[e.path.slice(dir.length)] ?? 'null' }))
  on('fs.list', () => {
    if (opts.listFails) throw new Error('listing failed')
    return { value: Object.keys(files).filter(n => n.startsWith('seen/')).map(n => ({ name: n.slice(5), kind: 'file', size: 1, mtimeMs: now, isLink: false })) }
  })
  on('fs.write', (_, e) => { writes[e.path.slice(dir.length)] = e.text; order.push(e.path.slice(dir.length)); return { value: undefined } })
  on('ui.log', (_, e) => { logs.push(e.text); return { value: undefined } })
  on('command.register', () => ({ value: { command: 'hd' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const hd = { command: 'hd', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
  // The runtime has timers, the mod types do not declare them.
  const settle = () => new Promise<void>(done => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(done, 50))
  const timerTick = async () => { await settle(); waiting.shift()?.(); await settle() }
  const frameTick = async () => { await settle(); frames.shift()?.(); await settle() }
  return { files, writes, order, logs, blits, hd: () => $.command.run(hd), timerTick, frameTick }
}

// Usage readings as session.measure brings them.
const measure = ($: Engine, ...rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]) =>
  $.session.measure({ context: { window: 200_000 }, rateLimits, changed: ['rateLimits'] })
const pane = ($: Engine, surface: 'terminal' | 'desktop', bodyColumns: number, bodyRows: number) => $.ui.mount({
  plugin: 'hitodama', surface, component: 'Pane', requestId: 'hitodama',
  props: { title: 'Hitodama', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
})

test('without a five-hour limit the weekly one puts the pet to sleep at 100%, and the pane names it', async ($, on) => {
  const p = child()
  p.sat = 10
  const s = await session($, on, { 'pet.json': JSON.stringify(p) })
  await measure($, { kind: 'seven_day', percentUsed: 100, resetsAt: new Date(T0 + 2 * DAY).toISOString() })
  await s.hd()
  expect((JSON.parse(s.writes['pet.json'] ?? '{}') as Pet).call).toBeNull()
  const ui = await pane($, 'terminal', 70, 60)
  expect(await ui.find({ type: 'Text', text: /weekly limit 100%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Sleeping until reset/ })).toBeDefined()
  await ui.unmount()
})

test('with both limits reported the pet follows the five-hour one', async ($, on) => {
  const p = child()
  p.sat = 10
  const s = await session($, on, { 'pet.json': JSON.stringify(p) })
  await measure($, { kind: 'seven_day', percentUsed: 100 }, { kind: 'five_hour', percentUsed: 30 })
  await s.hd()
  expect((JSON.parse(s.writes['pet.json'] ?? '{}') as Pet).call?.reason).toBe('hungry')
  const ui = await pane($, 'terminal', 70, 60)
  expect(await ui.find({ type: 'Text', text: /5h limit 30%/ })).toBeDefined()
  await ui.unmount()
})

test('with no limit reported the pane shows none', async ($, on) => {
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) })
  await s.hd()
  const ui = await pane($, 'terminal', 70, 60)
  expect(await ui.find({ type: 'Text', text: /helpers 0 · \d+ g/ })).toBeDefined()
  await ui.unmount()
})

test('only the terminal pane sets the size the animation frames are cut to', async ($, on) => {
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) }, { timer: true })
  const wide = Math.ceil((64 * 24 * 12) / 3) * 4
  for (const [surface, cols, rows] of [['terminal', 70, 60], ['desktop', 40, 30]] as const) await (await pane($, surface, cols, rows)).unmount()
  await s.frameTick()
  expect(s.blits.at(-1)).toBe(wide)
})

test('a closing window applies its last events and says it is gone', async ($, on) => {
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) })
  await s.hd()
  await $.turn.start({ text: '', turnId: 't1', agentId: 'a1' })
  await $.session.end({ reason: 'other', sessionId: 's1', resume: { id: 's1' } })
  expect((JSON.parse(s.writes['pet.json'] ?? '{}') as Pet).stats.agents).toBe(1)
  expect((JSON.parse(s.writes['seen/s1.json'] ?? '{}') as Win).alive).toBe(0)
})

// A session started while pet.json did not read, with one saved event and one more of its own, then a tick once the
// file reads as this pet: how many agents the pet counted.
async function startUnread($: Engine, on: On, applied: Record<string, number>) {
  const own: Win = { ...win, sid: 's1', seq: 1, events: [{ seq: 1, k: 'agent' }] }
  const s = await session($, on, { 'pet.json': '{"v":1,"life":', 'seen/s1.json': JSON.stringify(own) })
  await s.hd() // skipped, as the file still does not read
  expect((JSON.parse(s.writes['seen/s1.json'] ?? '{}') as Win).events).toEqual([]) // no owner can apply it yet
  await $.turn.start({ text: '', turnId: 't1', agentId: 'a1' })
  await s.hd()
  expect((JSON.parse(s.writes['seen/s1.json'] ?? '{}') as Win).events).toEqual([]) // its own one waits, to keep the order
  s.files['pet.json'] = JSON.stringify({ ...child(), applied })
  await s.hd()
  return (JSON.parse(s.writes['pet.json'] ?? '{}') as Pet).stats.agents
}

test('a pet file that does not read at session start keeps the saved events for a pet that knows the session', async ($, on) => {
  expect(await startUnread($, on, { s1: 0 })).toBe(2)
})

test('a pet file that does not read at session start, then a pet that does not know the session, drops only them', async ($, on) => {
  expect(await startUnread($, on, {})).toBe(1)
})

test('a pet file cut off mid-write with no spare copy is left as it is, said once, and never replaced by an egg', async ($, on) => {
  const s = await session($, on, { 'pet.json': '{"v":1,"life":' })
  for (let i = 0; i < 5; i++) await s.hd()
  expect(s.writes['pet.json']).toBeUndefined()
  expect(s.logs.filter(l => l.includes('pet.json')).length).toBe(1)
})

test('a pet file cut off mid-write gives way to the spare copy, and the pet goes on without a word', async ($, on) => {
  const p = child()
  const s = await session($, on, { 'pet.json': JSON.stringify(p).slice(0, -1), 'pet.prev.json': JSON.stringify(p) })
  await s.hd()
  const saved = JSON.parse(s.writes['pet.json'] ?? '{}') as Pet
  expect(saved.ch).toBe(p.ch)
  expect(saved.at).toBeGreaterThan(p.at)
  expect(s.logs.filter(l => l.includes('pet.prev.json'))).toEqual([]) // the spare copy holds that text whole
})

test('a pet file damaged other than cut short gives way to the spare copy, said once', async ($, on) => {
  const p = child()
  const s = await session($, on, { 'pet.json': JSON.stringify(p).replace('{', '{,'), 'pet.prev.json': JSON.stringify(p) })
  await s.hd()
  await s.hd()
  expect((JSON.parse(s.writes['pet.json'] ?? '{}') as Pet).ch).toBe(p.ch)
  expect(s.logs.filter(l => l.includes('pet.prev.json')).length).toBe(1) // at session start and on the ticks
})

test('a history file cut off mid-write gives way to its spare copy, and a death writes both, the spare first', async ($, on) => {
  const h = { lives: [{ n: 1, ch: 'kappa', path: [], from: 0, to: 0, days: 14, cause: 'old' }], seen: ['kappa'] }
  const dying = { ...child(), hp: 0.001, sick: true, poops: 4 }
  const s = await session($, on, { 'pet.json': JSON.stringify(dying), 'history.json': '{"lives":[', 'history.prev.json': JSON.stringify(h) })
  await s.hd()
  const written = JSON.parse(s.writes['history.json'] ?? '{}') as History
  expect(written.lives.map(l => l.n)).toEqual([1, 1]) // this death, then the life the spare copy kept
  expect(s.writes['history.prev.json']).toBe(s.writes['history.json'])
  const histories = s.order.filter(f => f.startsWith('history'))
  expect(histories.slice(-2)).toEqual(['history.prev.json', 'history.json'])
})

test('a window that has not read the pet leaves its turns unmarked, for the owner to decide', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  const s = await session($, on, { 'pet.json': '{"v":1,"life":' })
  await $.turn.start({ text: '', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(1000) })
  await $.session.end({ reason: 'other', sessionId: 's1', resume: { id: 's1' } }) // writes the events of this run
  const events = (JSON.parse(s.writes['seen/s1.json'] ?? '{}') as Win).events
  expect(events.map(e => e.k)).toEqual(['turn'])
  expect('night' in events[0]!).toBe(false)
})

test('a window file cut off mid-write still has its turns applied, numbered after what the pet has', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  const s = await session($, on, { 'pet.json': JSON.stringify({ ...child(), applied: { s1: 400 } }), 'seen/s1.json': '{"sid":"s1","seq":' })
  await s.timerTick()
  await $.turn.start({ text: '', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(1000) })
  await s.hd()
  const p = JSON.parse(s.writes['pet.json'] ?? '{}') as Pet
  expect([p.stats.turns, p.applied.s1]).toEqual([1, 401])
})

test('a window file cut off while the pet file does not read either still has its events applied once the pet reads', async ($, on) => {
  const s = await session($, on, { 'pet.json': '{"v":1,"life":', 'seen/s1.json': '{"sid":"s1","seq":' })
  await $.turn.start({ text: '', turnId: 't1', agentId: 'a1' })
  await s.hd()
  s.files['pet.json'] = JSON.stringify({ ...child(), applied: { s1: 400 } })
  await s.hd()
  const p = JSON.parse(s.writes['pet.json'] ?? '{}') as Pet
  expect([p.stats.agents, p.applied.s1]).toEqual([1, 401])
})

test('a pet file that is gone means a new egg, even with a spare copy there', async ($, on) => {
  const p = child()
  const s = await session($, on, { 'pet.prev.json': JSON.stringify(p) })
  await s.hd()
  expect((JSON.parse(s.writes['pet.json'] ?? '{}') as Pet).ch).not.toBe(p.ch)
})

test('going on from the spare copy is said again once the file has read in between', async ($, on) => {
  const p = child()
  const damaged = JSON.stringify(p).replace('{', '{,')
  const s = await session($, on, { 'pet.json': damaged, 'pet.prev.json': JSON.stringify(p) })
  await s.hd()
  s.files['pet.json'] = JSON.stringify(p)
  await s.hd() // the file reads again
  s.files['pet.json'] = damaged
  await s.hd()
  expect(s.logs.filter(l => l.includes('pet.prev.json')).length).toBe(2)
})

test('a history file that does not read, nor its spare copy, is not written over by a death', async ($, on) => {
  const dying = { ...child(), hp: 0.001, sick: true, poops: 4 }
  const s = await session($, on, { 'pet.json': JSON.stringify(dying), 'history.json': '{"lives":[' })
  await s.hd()
  expect((JSON.parse(s.writes['pet.json'] ?? '{}') as Pet).dead).toBeTruthy()
  expect(s.writes['history.json']).toBeUndefined()
})

test('every pet the owner writes goes to the spare copy first, the same', async ($, on) => {
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) })
  await s.hd()
  const pets = s.order.filter(f => f.startsWith('pet'))
  expect(pets.slice(-2)).toEqual(['pet.prev.json', 'pet.json'])
  expect(s.writes['pet.prev.json']).toBe(s.writes['pet.json'])
})

test('a session marks a turn made while the pet is awake as a day turn', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) })
  await s.timerTick()
  await $.turn.start({ text: '', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(1000) })
  await s.hd()
  expect((JSON.parse(s.writes['seen/s1.json'] ?? '{}') as Win).events.flatMap(e => (e.k === 'turn' ? [e.night] : []))).toEqual([false])
})

test('a turn counts as made at night by when it was made, not when it is applied', () => {
  const turn = (night?: boolean): Ev => ({ seq: 1, k: 'turn', cost: 0, model: 'm', effort: 'high', tokens: 0, load: 0, night })
  const asleep = { ...child(), asleep: true, joy: 50 }
  applyEvent(asleep, turn(false))
  expect([asleep.joy, asleep.stats.nightTurns]).toEqual([50, 0]) // a day turn applied once it sleeps
  const awake = { ...child(), joy: 50 }
  applyEvent(awake, turn(true))
  expect([awake.joy, awake.stats.nightTurns]).toEqual([49, 1])
  const older = { ...child(), asleep: true, joy: 50 }
  applyEvent(older, turn())
  expect([older.joy, older.stats.nightTurns]).toEqual([49, 1]) // an older event with no mark: as before
})

test('the pane shows the pet the session has read', async ($, on) => {
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) })
  await s.hd()
  const ui = await $.ui.mount({
    plugin: 'hitodama', surface: 'terminal', component: 'Pane', requestId: 'hitodama',
    props: { title: 'Hitodama', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  })
  expect((await ui.find({ type: 'Text', text: /Sunekosuri/ }))?.text).toContain(tr().stage.child)
  expect(await ui.find({ key: 'b-eat' })).toBeDefined()
  await ui.unmount()
})

test('the last events of a window that has just closed still reach the pet', async ($, on) => {
  const closed: Win = { ...win, sid: 's2', alive: 0, seq: 1, events: [{ seq: 1, k: 'agent' }] }
  const s = await session($, on, { 'pet.json': JSON.stringify(child()), 'seen/s2.json': JSON.stringify(closed) })
  await s.hd()
  const saved = JSON.parse(s.writes['pet.json'] ?? '{}') as Pet
  expect(saved.stats.agents).toBe(1)
  expect(saved.applied.s2).toBe(1)
})

test('a call or tantrum open when Claude closes gets its full 15 minutes after reopening', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  p.sat = 10
  p.nextTantrum = p.at + 1000
  advance(p, p.at + 3000, utc)
  expect(p.call?.reason).toBe('hungry')
  expect(p.tantrum).not.toBeNull()
  advance(p, p.at + 3 * HOUR, utc) // in the pocket
  for (let i = 1; i <= 14; i++) advance(p, p.at + MIN, utc)
  expect(p.cm).toBe(0)
  expect(p.dm).toBe(0)
  for (let i = 1; i <= 2; i++) advance(p, p.at + MIN, utc)
  expect(p.cm).toBe(1)
  expect(p.dm).toBe(1)
})

test('asleep it calls only for the light or when sick, so a hungry night costs no care mistake', () => {
  const p = egg()
  liveWell(p, T0, Date.UTC(2026, 9, 24, 20, 30))
  expect(p.asleep).toBe(true)
  p.sat = 20; p.joy = 20
  for (let i = 1; i <= 60; i++) step(p, p.at + i * MIN, MIN, 21, false)
  expect(p.call).toBeNull()
  expect(p.cm).toBe(0)
  p.lightsOff = false
  step(p, p.at + 61 * MIN, MIN, 21, false)
  expect(p.call?.reason).toBe('light')
})

test('an adult that comes out on waking stays up until its own bedtime and ages one day', () => {
  for (const [teen, cm, adult] of [['kitsune', 3, 'kappa'], ['tanuki', 8, 'nuppeppo']] as const) {
    const p = egg()
    Object.assign(p, { ch: teen, path: ['hitodama', 'sunekosuri', teen], hatchAt: T0, ageDays: 5, asleep: true, lightsOff: true, cm, sat: 100, joy: 100 })
    const from = Date.UTC(2026, 9, 25, 8, 58)
    for (let i = 1; i <= 3 * 60; i++) step(p, from + i * MIN, MIN, utc(from + i * MIN), false)
    expect(p.ch).toBe(adult)
    expect(p.asleep).toBe(false)
    expect(p.ageDays).toBe(6)
  }
})

test('a five-hour limit whose reset has passed is not shown', () => {
  const now = T0
  const at = (ms: number) => new Date(now + ms).toISOString()
  const five = { ...win, limitKind: 'five_hour' } as const
  expect(limitOf([{ ...five, limit: 100, limitResetsAt: at(-MIN) }, { ...five, limit: 40, limitResetsAt: at(HOUR) }], now))
    .toEqual({ limit: 40, limitKind: 'five_hour', limitResetsAt: at(HOUR) })
  expect(limitOf([{ ...five, limit: 100, limitResetsAt: at(-MIN) }], now)).toEqual({ limit: 0 })
})

test('a limit with no reset time lasts one span of that limit from when it was measured', () => {
  const at = T0 - 5 * HOUR
  expect(limitOf([{ ...win, limit: 100, limitKind: 'five_hour', limitAt: at + MIN }], T0).limit).toBe(100)
  expect(limitOf([{ ...win, limit: 100, limitKind: 'five_hour', limitAt: at }], T0).limit).toBe(0)
  expect(limitOf([{ ...win, limit: 100, limitKind: 'seven_day', limitAt: at }], T0).limit).toBe(100)
  expect(limitOf([{ ...win, limit: 100, limitKind: 'seven_day', limitAt: T0 - 7 * DAY }], T0).limit).toBe(0)
  // A reset time that does not read counts as none.
  expect(limitOf([{ ...win, limit: 100, limitKind: 'five_hour', limitResetsAt: 'soon', limitAt: at + MIN }], T0).limit).toBe(100)
  expect(limitOf([{ ...win, limit: 100, limitKind: 'five_hour', limitResetsAt: 'soon', limitAt: at }], T0).limit).toBe(0)
  // A window written by an older version holds limit5 only, and hides no live figure.
  const { limit: _, ...older } = win
  const olderLimit = { ...older, limit5: 100, limitResetsAt: new Date(T0 + HOUR).toISOString() } as unknown as Win
  expect(limitOf([olderLimit, { ...win, limit: 90, limitKind: 'seven_day', limitAt: T0 }], T0).limit).toBe(90)
})

test('the five-hour limit of any window comes before the weekly one', () => {
  const wins: Win[] = [{ ...win, limit: 100, limitKind: 'seven_day', limitAt: T0 }, { ...win, limit: 30, limitKind: 'five_hour', limitAt: T0 }]
  expect(limitOf(wins, T0)).toEqual({ limit: 30, limitKind: 'five_hour', limitResetsAt: undefined })
})

test('every label keeps a space before its value in every language', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  for (const l of LANGS) {
    setLang(l)
    const rows = statsText(p, { lives: [], seen: [] }, p.at).split('\n')
    // A label stuck to its number reads as a letter followed by a digit.
    for (const r of rows.slice(3, 11)) expect(r).not.toMatch(/\p{L}\d/u)
    for (const label of Object.values(tr().bars)) expect(bar(label, 50).startsWith(label + ' ')).toBe(true)
  }
  setLang('en')
})

test('a game finished after the pet fell asleep, sickened or died changes nothing', () => {
  const p = egg()
  advance(p, T0 + 70 * MIN, utc)
  for (const change of [{ asleep: true }, { sick: true }, { dead: { at: p.at, cause: 'old' } }, { ch: 'egg' }]) {
    const q: Pet = { ...structuredClone(p), ...change }
    expect(finishGame(q, 5)).toBeNull()
    expect(q.stats.games).toBe(0)
  }
  expect(finishGame(p, 5)).toBe(tr().gameWin(5, 15))
})

test('an egg laid in the evening sleeps through its first night and wakes a day older', () => {
  const p = newEgg(Date.UTC(2026, 9, 24, 20, 30), 1, 'yokai')
  let asleepMin = 0
  for (let t = p.at; t < Date.UTC(2026, 9, 25, 9, 30); t += MIN) { step(p, t + MIN, MIN, utc(t + MIN), false); if (p.asleep) asleepMin += 1 }
  expect(p.ch).toBe('sunekosuri')
  expect(asleepMin).toBeGreaterThan(10 * 60)
  expect(p.ageDays).toBe(1)
})

test('a pet asleep on an empty stomach wakes hungry, not dead', () => {
  const p = egg()
  liveWell(p, T0, Date.UTC(2026, 9, 24, 20, 30))
  p.sat = 0
  for (let t = p.at; t < Date.UTC(2026, 9, 25, 9, 1); t += MIN) step(p, t + MIN, MIN, utc(t + MIN), false)
  expect(p.dead).toBeNull()
  expect(p.call?.reason).toBe('hungry')
})

test('a game left open ends once the pet falls ill, and the care buttons come back', async ($, on) => {
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) })
  await s.hd()
  const mount = () => $.ui.mount({
    plugin: 'hitodama', surface: 'terminal', component: 'Pane', requestId: 'hitodama',
    props: { title: 'Hitodama', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  })
  let ui = await mount()
  await ui.press({ key: 'b-game' })
  await ui.unmount()
  ui = await mount()
  expect(await ui.find({ key: 'b-left' })).toBeDefined()
  await ui.unmount()
  s.files['pet.json'] = JSON.stringify({ ...JSON.parse(s.writes['pet.json']!), sick: true })
  await s.hd()
  ui = await mount()
  expect(await ui.find({ key: 'b-left' })).toBeUndefined()
  expect(await ui.find({ key: 'b-eat' })).toBeDefined()
  await ui.unmount()
})

test('a tick that cannot list the windows forgets none of them', async ($, on) => {
  const s = await session($, on, { 'pet.json': JSON.stringify({ ...child(), applied: { s2: 5 } }) }, { listFails: true })
  await s.hd()
  expect((JSON.parse(s.writes['pet.json'] ?? '{}') as Pet).applied.s2).toBe(5)
})

test('a turn costs energy by its reply tokens and model, whatever the effort', () => {
  const r = (n: number) => Math.round(n * 1000) / 1000
  expect(r(turnCost('claude-opus-5-5', 6000, 0, false))).toBe(1.68) // what an average Opus turn cost before at high effort
  expect(turnCost('claude-opus-5-5', 0, 0, false)).toBe(0)
  expect(r(turnCost('claude-sonnet-5-5', 1000, 0, false))).toBe(0.2)
  expect(r(turnCost('claude-sonnet-5-5', 1000, 95, true, 2))).toBe(r(0.2 * 2.2 * 1.5 * 2))
})

test('the pace of the usage limit: ahead of it turns tire more, behind it less, within 0.5 and 2', () => {
  const week = (used: number, passedHours: number) =>
    paceOf({ limit: used, limitKind: 'seven_day', limitResetsAt: new Date(T0 + 7 * DAY - passedHours * HOUR).toISOString() }, T0)
  expect(Math.round(week(5, 7) * 1000) / 1000).toBe(1.033) // 5% used, 4.2% of the week passed
  expect(week(50, 0)).toBe(2)
  expect(week(10, 84)).toBe(0.5)
  expect(week(50, 84)).toBe(1)
  expect(paceOf({ limit: 50, limitKind: 'five_hour' }, T0)).toBe(1) // no reset time: the window's start is unknown
  expect(paceOf({ limit: 0 }, T0)).toBe(1)
})

test('an awake pet regains energy only from the moment no window is active', () => {
  const p = child()
  p.en = 50
  for (let t = T0; t < T0 + HOUR; t += MIN) step(p, t + MIN, MIN, utc(t + MIN), false, false, T0 + 30 * MIN)
  expect(Math.round(p.en)).toBe(50 - 4 + 5) // half an hour awake at 8 an hour, then half an hour resting at 10
})

test('a window running a turn or helpers is active now, else from its last input or finished turn', () => {
  expect(lastActive([{ ...win, lastInput: T0 - HOUR, lastActivity: T0 - MIN }, { ...win, lastInput: T0 - 2 * MIN }], T0)).toBe(T0 - MIN)
  expect(lastActive([{ ...win, lastActivity: T0 - HOUR }, { ...win, turn: true, lastInput: T0 - HOUR }], T0)).toBe(T0)
  expect(lastActive([{ ...win, agents: 1, lastActivity: T0 - HOUR }], T0)).toBe(T0)
})

const usage = (output_tokens: number) => ({ model: 'm', input_tokens: 0, output_tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })

test('a session prices its turns by reply tokens and the pace of the limit it reports', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) })
  await s.timerTick() // the tick a session runs as it starts, so each turn below lands in the tick of its own /hd
  const costs = async (id: string) => {
    await $.turn.start({ text: '', turnId: id })
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, reason: 'answer', usage: usage(5000) })
    await s.hd()
    return (JSON.parse(s.writes['seen/s1.json'] ?? '{}') as Win).events.flatMap(e => (e.k === 'turn' ? [Math.round(e.cost * 1000) / 1000] : []))
  }
  expect(await costs('t1')).toEqual([1]) // 5 thousand tokens of an unknown model, no limit
  await measure($, { kind: 'seven_day', percentUsed: 50, resetsAt: new Date(T0 + 7 * DAY).toISOString() })
  await s.hd() // the tick that takes in the reading
  expect(await costs('t2')).toEqual([2]) // half the week used as it starts: the most a turn can cost
})

test('a turn is priced by the limit of all live windows, as the pane shows it', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  const s2: Win = { ...win, sid: 's2', alive: T0 + HOUR, limit: 50, limitKind: 'seven_day', limitResetsAt: new Date(T0 + 7 * DAY).toISOString() }
  const s = await session($, on, { 'pet.json': JSON.stringify(child()), 'seen/s2.json': JSON.stringify(s2) })
  await s.timerTick()
  await $.turn.start({ text: '', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(5000) })
  await s.hd()
  expect((JSON.parse(s.writes['seen/s1.json'] ?? '{}') as Win).events.flatMap(e => (e.k === 'turn' ? [Math.round(e.cost * 1000) / 1000] : []))).toEqual([2])
})

test('one turn costs at most the cap, however long its reply', () => {
  expect(turnCost('claude-opus-5-5', 60_000, 95, true, 2)).toBe(15)
})

test('a running turn or helpers stop counting as activity two hours after the window last did anything', () => {
  expect(lastActive([{ ...win, agents: 1, lastActivity: T0 - HOUR }], T0)).toBe(T0)
  expect(lastActive([{ ...win, agents: 1, lastActivity: T0 - 3 * HOUR }], T0)).toBe(T0 - 3 * HOUR)
  expect(lastActive([{ ...win, turn: true, lastInput: T0 - 3 * HOUR }], T0)).toBe(T0 - 3 * HOUR)
})

test('rest starts 15 minutes after the last activity, and activity since the pet last lived counts as then', () => {
  const from = (w: Partial<Win>) => restFrom(lastActive([{ ...win, ...w }], T0), T0 - 30 * MIN)
  expect(from({ lastActivity: T0 - HOUR })).toBe(T0 - 45 * MIN)
  expect(from({ lastActivity: T0 - HOUR, turn: true })).toBe(T0 - 15 * MIN)
  expect(from({ lastInput: T0 - MIN })).toBe(T0 - 15 * MIN)
})

test('an interrupted turn, or one with no usage, costs at least half a point', () => {
  expect(turnCost('claude-opus-5-5', 0, 0, false, 1, true)).toBe(0.5)
  expect(Math.round(turnCost('claude-opus-5-5', 6000, 0, false, 1, true) * 1000) / 1000).toBe(1.68)
  expect(turnCost('claude-opus-5-5', 0, 0, false)).toBe(0)
})

test('a session charges the least for a turn interrupted with no usage', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) })
  await s.timerTick()
  await $.turn.start({ text: '', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  await s.hd()
  expect((JSON.parse(s.writes['seen/s1.json'] ?? '{}') as Win).events.flatMap(e => (e.k === 'turn' ? [e.cost] : []))).toEqual([0.5])
})

test('a turn starting with no prompt and every tool call count as activity', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) }, { timer: true })
  const last = async () => { await s.timerTick(); return (JSON.parse(s.writes['seen/s1.json'] ?? '{}') as Win).lastActivity }
  const before = await last()
  await $.turn.start({ text: '', turnId: 't1' })
  const started = await last()
  expect(started).toBeGreaterThan(before)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'true' } as never)
  expect(await last()).toBeGreaterThan(started)
})

test('a turn whose completion fails still ends, and a helper starting counts as activity', async ($, on) => {
  on('turn.complete', () => { throw new Error('a hook below failed') })
  const s = await session($, on, { 'pet.json': JSON.stringify(child()) }, { timer: true })
  const seen = () => JSON.parse(s.writes['seen/s1.json'] ?? '{}') as Win
  await $.turn.start({ text: '', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' }).catch(() => {})
  await s.timerTick() // a timer tick, not /hd, which counts as input
  const ended = seen()
  expect(ended.turn).toBe(false)
  await $.turn.start({ text: '', turnId: 't2', agentId: 'a1' })
  await s.timerTick()
  expect(seen().lastActivity).toBeGreaterThan(ended.lastActivity)
})

// A child last lived `away` ago with half its energy, the window s2 alongside it, and this session's own saved file.
async function hourAway($: Engine, on: On, s2: Partial<Win>, own: Partial<Win> = {}, away = HOUR) {
  const other: Win = { ...win, sid: 's2', alive: T0 + HOUR, ...s2 } // alive for as long as the test's clock runs
  const s = await session($, on, {
    'pet.json': JSON.stringify({ ...child(), en: 50, at: T0 - away }),
    'seen/s2.json': JSON.stringify(other), 'seen/s1.json': JSON.stringify({ ...win, sid: 's1', ...own }),
  })
  await s.timerTick() // the tick a session runs as it starts
  const p = JSON.parse(s.writes['pet.json'] ?? '{}') as Pet
  return { en: p.en, hours: (p.at - (T0 - away)) / HOUR }
}

test('an hour with no window active gives an awake pet its energy back', async ($, on) => {
  const { en, hours } = await hourAway($, on, {})
  expect(Math.round((en - 50) / hours)).toBe(10)
})

test('rest starts 15 minutes after the last activity', async ($, on) => {
  const { en, hours } = await hourAway($, on, { lastActivity: T0 - HOUR - 5 * MIN })
  // Ten minutes in the pocket at 8 × 0.3 an hour, then rest.
  expect(Math.abs(en - (50 - 0.4 + 10 * (hours - 1 / 6)))).toBeLessThan(0.05)
})

// Lived up to the session's start, with s2 last active an hour before.
test('a pet whose windows have been quiet for an hour rests', async ($, on) => {
  expect((await hourAway($, on, { lastActivity: T0 - HOUR }, {}, 0)).en).toBeGreaterThan(50)
})

test('a turn running in another window keeps it from resting', async ($, on) => {
  expect((await hourAway($, on, { lastActivity: T0 - HOUR, turn: true }, {}, 0)).en).toBeLessThan(50)
})

test('what is done right after a long gap does not undo the rest within it', async ($, on) => {
  const { en, hours } = await hourAway($, on, {}, { lastInput: T0 + HOUR }) // input stamped at the end of the gap
  expect(Math.abs(en - (50 - 0.6 + 10 * (hours - 1 / 4)))).toBeLessThan(0.05) // rests from 15 minutes into it
})

test('a resumed session forgets the helpers its old process left running', async ($, on) => {
  const { en, hours } = await hourAway($, on, {}, { agents: 1 })
  expect(Math.round((en - 50) / hours)).toBe(10) // rests all along, not only from 15 minutes in
})

// Whether the pane shows `text` for a child: this window quiet for four hours, s2 last active `s2Quiet` ago, running a
// turn or not.
async function quietPane($: Engine, on: On, s2Quiet: number, busy: boolean, text: RegExp) {
  // Typed in both four hours ago, so this window, first by name, holds the pet.
  const s = await session($, on, {
    'pet.json': JSON.stringify(child()),
    'seen/s1.json': JSON.stringify({ ...win, sid: 's1', lastInput: T0 - 4 * HOUR, lastActivity: T0 - 4 * HOUR }),
    'seen/s2.json': JSON.stringify({ ...win, sid: 's2', alive: T0 + HOUR, turn: busy, lastInput: T0 - 4 * HOUR, lastActivity: T0 - s2Quiet }),
  })
  await s.timerTick()
  const ui = await pane($, 'terminal', 70, 60)
  const shown = (await ui.find({ type: 'Text', text })) !== undefined
  await ui.unmount()
  return shown
}

test('four quiet hours make it doze off', async ($, on) => {
  expect(await quietPane($, on, 4 * HOUR, false, /Dozed off/)).toBe(true)
})

test('an hour and a half of quiet bores it', async ($, on) => {
  expect(await quietPane($, on, 90 * MIN, false, /Bored/)).toBe(true)
})

test('a turn running in another window keeps it from getting bored', async ($, on) => {
  expect(await quietPane($, on, 90 * MIN, true, /Bored/)).toBe(false)
})

test('a turn that has given no sign for four hours no longer keeps it awake', async ($, on) => {
  expect(await quietPane($, on, 4 * HOUR, true, /Dozed off/)).toBe(true)
})
