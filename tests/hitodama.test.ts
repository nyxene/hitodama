import type { On } from 'claude-code'
import { expect, test as kitTest, type Engine, type TestBody } from 'claude-code/testing'

import { LANGS, setLang, t as tr } from '../hooks/i18n'
import { CHARS } from '../hooks/lines'
import { act, advance, finishGame, isHistory, isPet, newEgg, step, type Pet } from '../hooks/sim'
import { cells, scene } from '../hooks/sprites'
import { bar, decide, limitOf, statsText, title, type Ctx, type Win } from '../hooks/view'

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR
const T0 = Date.UTC(2026, 9, 24, 12) // noon UTC
const utc = (t: number) => new Date(t).getUTCHours()
const win: Win = { sid: 'a', room: 'r', alive: 0, lastInput: 0, lastActivity: 0, typingAt: 0, load: 0, model: '', effort: 'high', turn: false, agents: 0, errors: 0, limit5: 0, seq: 0, events: [] }
const ctx = (now: number, over: Partial<Ctx> = {}): Ctx => ({ now, isOwner: true, ownerRoom: 'r', limit5: 0, idleMin: 0, anim: null, ...over })
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
  const limited: Win = { ...win, sid: 's2', alive: T0 + HOUR, limit5: 100, limitResetsAt: new Date(T0 + 5 * HOUR).toISOString() }
  let notified = 0
  on('ui.notify', () => { notified += 1; return { value: { isSent: true, channel: 'ghostty' } as const } })
  // Timer ticks, not /hd: /hd counts as typing, and nobody is notified while typing.
  const s = await session($, on, { 'pet.json': JSON.stringify(p), 'seen/s2.json': JSON.stringify(limited) }, { timer: true })
  for (let i = 0; i < 5; i++) await s.timerTick()
  expect(JSON.parse(s.writes['pet.json'] ?? '{}').call?.reason).toBe('hungry')
  expect(notified).toBe(0)
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
// timer: the three-second tick runs once per timerTick() instead of at once.
async function session($: Engine, on: On, files: Record<string, string>, opts: { listFails?: boolean; timer?: boolean } = {}) {
  const dir = '/h/.claude/hitodama/', writes: Record<string, string> = {}, logs: string[] = []
  let now = T0
  const waiting: (() => void)[] = []
  on('clock.now', () => ({ value: (now += 3000) }))
  on('clock.every', (_, e) => !opts.timer ? { value: undefined }
    : new Promise(done => { if (e.ms === 3000) waiting.push(() => done({ value: undefined })) }))
  on('ui.blit', () => ({ value: {} }))
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
  on('fs.write', (_, e) => { writes[e.path.slice(dir.length)] = e.text; return { value: undefined } })
  on('ui.log', (_, e) => { logs.push(e.text); return { value: undefined } })
  on('command.register', () => ({ value: { command: 'hd' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const hd = { command: 'hd', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
  // The runtime has timers, the mod types do not declare them.
  const settle = () => new Promise<void>(done => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(done, 50))
  const timerTick = async () => { await settle(); waiting.shift()?.(); await settle() }
  return { files, writes, logs, hd: () => $.command.run(hd), timerTick }
}

test('a pet file cut off mid-write is left as it is, said once, and never replaced by an egg', async ($, on) => {
  const s = await session($, on, { 'pet.json': '{"v":1,"life":' })
  for (let i = 0; i < 5; i++) await s.hd()
  expect(s.writes['pet.json']).toBeUndefined()
  expect(s.logs.filter(l => l.includes('pet.json')).length).toBe(1)
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
  expect(limitOf([{ ...win, limit5: 100, limitResetsAt: at(-MIN) }, { ...win, limit5: 40, limitResetsAt: at(HOUR) }], now)).toEqual({ limit5: 40, limitResetsAt: at(HOUR) })
  expect(limitOf([{ ...win, limit5: 100, limitResetsAt: at(-MIN) }], now).limit5).toBe(0)
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
