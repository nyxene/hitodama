import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { HitodamaView } from '../types'
import { setLang, t as tr, width } from './i18n'
import { act, advance, applyEvent, bury, causeText, finishGame, isHistory, isPet, nameOf, newEgg, note, remember, turnCost, type Act, type Ev, type History, type Pet } from './sim'
import { cells, scene } from './sprites'
import { tuning as T } from './tuning'
import { bar, decide, statsText, title, type Ctx, type Win } from './view'

const NAME = 'Hitodama'
const PANE = 'hitodama'
const BLANK: HitodamaView = { mode: 'care', title: NAME, call: false, room: '', msg: '', bars: [], stats: [], log: [], meta: '' }
const view = atom({ plugin: 'hitodama', key: 'view' } as const, BLANK, { shape: 'view-2' })
const WIDE_SCALE = 2 // a 64 × 24 cell screen when the pane has room
const PANE_COLUMNS = 32 * WIDE_SCALE + 2

type Press = Act | 'stats' | 'left' | 'right' | 'quit'
const ACTIONS: [string, Press][] = [['1', 'eat'], ['2', 'snack'], ['3', 'game'], ['4', 'clean'], ['5', 'heal'], ['6', 'light'], ['7', 'scold'], ['8', 'stats']]

export const register: Register = (on, options) => {
  setLang(options.language)
  // Each window keeps itself in seen/<session>.json, so other windows see it and it survives a mod reload.
  let win: Win = { sid: '', room: '', alive: 0, lastInput: 0, lastActivity: 0, typingAt: 0, load: 0, model: '', effort: 'medium', turn: false, agents: 0, errors: 0, limit5: 0, seq: 0, events: [] }
  let pet: Pet | null = null
  let history: History = { lives: [], seen: [] }
  let anim: Ctx['anim'] = null
  let game: { wins: boolean[]; dir: number } | null = null
  let statsOpen = false
  let frame = 0
  let scale = 1 // chosen by the render from the pane size; blit frames must match it
  let shown = { scene: 'idle', night: false }
  // File work lives in the session.start closure: $ may not be passed to functions.
  let dir = '' // ~/.claude/hitodama, set on session start
  let io: { tick: (action?: (p: Pet, now: number) => void) => Promise<void> } | null = null

  const push = (e: Ev extends infer E ? (E extends Ev ? Omit<E, 'seq'> : never) : never) => {
    win.seq += 1
    win.events = [...win.events, { ...e, seq: win.seq } as Ev].slice(-200)
  }
  const touch = (now: number, typing = false) => {
    win.lastInput = now
    win.lastActivity = now
    if (typing) win.typingAt = now
  }
  const frameCells = (sceneId: string, night: boolean) => {
    const g = game ? { dir: game.dir, wins: game.wins } : undefined
    return cells(scene(sceneId, { ch: pet?.ch ?? 'egg', load: win.load, poops: pet?.poops ?? 0, agents: win.agents, game: g }, frame), night, scale)
  }

  function press(a: Press) {
    if (!io) return
    statsOpen = a === 'stats' ? !statsOpen : false
    if (a === 'stats') return io.tick()
    if (a === 'quit') { game = null; return io.tick() }
    if (a === 'left' || a === 'right') {
      const g = game
      if (!g) return io.tick()
      const turn = Math.random() < 0.5 ? -1 : 1
      g.wins.push(turn === (a === 'left' ? -1 : 1))
      g.dir = turn
      if (g.wins.length < 5) return io.tick()
      const wins = g.wins.filter(Boolean).length
      game = null
      return io.tick((p, now) => {
        const msg = finishGame(p, wins)
        note(p, now, tr().logGame(msg))
        anim = { id: wins >= 3 ? 'happy' : 'bored', until: now + 3000, msg }
      })
    }
    return io.tick((p, now) => {
      const r = act(p, a, now)
      if (r.anim === 'game') { game = { wins: [], dir: 0 }; anim = null; return }
      note(p, now, r.msg)
      anim = { id: r.anim, until: now + 3000, msg: r.msg }
    })
  }

  on('session.start', async ($, e, next) => {
    // A `claude -p` run or the SDK has nobody at the prompt: it must not take the pet from a window that has.
    if (!e.isInteractive) return next(e)
    const sid = await $.session.id()
    const cwd = e.cwd
    // No home folder, no pet: never fall back to writing into the project, as a relative path would.
    const absolute = (p?: string) => (p && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)) ? p : undefined)
    const home = absolute(await $.env.get('HOME')) ?? absolute(await $.env.get('USERPROFILE'))
    if (!home) {
      $.ui.log('hitodama: neither HOME nor USERPROFILE is an absolute path, the pet stays away')
      return next(e)
    }
    dir = `${home}/.claude/hitodama`
    const seenPath = (id: string) => `${dir}/seen/${id}.json`
    const readJson = async <V,>(path: string): Promise<V | null> => {
      try { return JSON.parse(await $.fs.read(path)) as V } catch { return null }
    }
    // A history that does not read is not written over with less: the one in memory stands.
    const readHistory = async () => { const h = await readJson<unknown>(`${dir}/history.json`); return isHistory(h) ? h : history }
    // A pet file that is there but does not read is left alone: the tick is skipped, never replaced by an egg.
    const petPath = `${dir}/pet.json`
    const readPet = async (): Promise<Pet | null> => {
      if (!(await $.fs.exists(petPath))) return null
      const p = await readJson<unknown>(petPath)
      if (!isPet(p)) throw new Error(`${petPath} does not read as a pet; it is kept as it is until it reads again, is fixed or is removed`)
      return p
    }
    // date from where systems keep it, PATH only where neither exists (NixOS); else the runtime's offset.
    let m: RegExpMatchArray | null | undefined = null
    for (const date of ['/bin/date', '/usr/bin/date', 'date']) {
      m ??= (await $.process.run([date, '+%z']).catch(() => null))?.stdout.trim().match(/^([+-])(\d\d)(\d\d)$/)
    }
    const offsetMin = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : -new Date().getTimezoneOffset()
    const hourAt = (t: number) => new Date(t + offsetMin * 60_000).getUTCHours()

    // Room name: the repository's folder, else the working folder. The transcript is never read.
    const roomName = async () => {
      const repo = await $.session.repo().catch(() => null)
      return (repo?.root ?? cwd).split('/').filter(Boolean).pop() ?? 'claude'
    }
    let roomCheckedAt = 0
    let busy = Promise.resolve()

    const refresh = async (now: number, isOwner: boolean, fresh: Win[], ownerRoom: string) => {
      const p = pet
      if (!p) return
      const limit5 = Math.max(...fresh.map(w => w.limit5))
      const ctx: Ctx = {
        now, isOwner, ownerRoom, limit5, anim,
        limitResetsAt: fresh.find(w => w.limitResetsAt)?.limitResetsAt,
        idleMin: (now - Math.max(...fresh.map(w => Math.max(w.lastActivity, w.lastInput)))) / 60_000,
      }
      const d = game && isOwner ? { scene: 'game', msg: tr().gameRound(game.wins.length + 1) } : decide(p, win, ctx)
      const night = p.asleep && isOwner
      shown = { scene: d.scene, night }
      const hhmm = (t: number) => {
        const d = new Date(t + offsetMin * 60_000)
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
      }
      const B = tr().bars
      const v: HitodamaView = {
        mode: statsOpen ? 'stats' : game && isOwner ? 'game' : 'care',
        title: title(p, now),
        call: !!(p.call || p.tantrum),
        room: win.room,
        msg: d.msg,
        bars: [bar(B.sat, p.sat), bar(B.en, p.en), bar(B.joy, p.joy), bar(B.hp, p.hp), bar(B.disc, p.disc), bar(B.load, win.load)],
        stats: statsOpen ? statsText(p, history, now).split('\n') : [],
        log: [...(p.log ?? [])].reverse().map(l => `${hhmm(l.t)}  ${l.text}`),
        meta: tr().meta(win.model, win.effort, win.agents, Math.round(limit5), p.weight, p.cm),
      }
      const old = await read($, view)
      if (JSON.stringify(old) !== JSON.stringify(v)) await update($, view, () => v)
    }

    // One tick: check in, find which window owns the pet; the owner lives the time and writes it.
    const tickNow = async (action?: (p: Pet, now: number) => void) => {
      const now = await $.clock.now()
      win.alive = now
      if (now - roomCheckedAt > 5 * 60_000) {
        roomCheckedAt = now
        win.room = await roomName()
      }
      await $.fs.write(seenPath(sid), JSON.stringify(win))

      // Mods cannot delete files, so old session files stay; only recently written ones are read.
      const listed = (await $.fs.list(`${dir}/seen`).catch(() => [])).filter(f => f.name.endsWith('.json') && f.name !== `${sid}.json`)
      const recent = listed.filter(f => now - f.mtimeMs < T.presence.staleAfterMinutes * 60_000)
      // A window counts only under its own file name, and no later than now, so one file cannot claim the pet for good.
      const others = (await Promise.all(recent.map(async f => ({ name: f.name, w: await readJson<Win>(`${dir}/seen/${f.name}`) }))))
        .flatMap(({ name, w }) => w && typeof w.sid === 'string' && name === `${w.sid}.json` && now - w.alive < T.presence.staleAfterMinutes * 60_000
          ? [{ ...w, lastInput: Math.min(w.lastInput, now), lastActivity: Math.min(w.lastActivity, now) }] : [])
      const fresh = [win, ...others]
      const owner = [...fresh].sort((a, b) => b.lastInput - a.lastInput || a.sid.localeCompare(b.sid))[0]!
      const isOwner = owner.sid === sid

      const p = (await readPet()) ?? newEgg(now)
      if (isOwner) {
        const was = { call: p.call?.since, tantrum: p.tantrum?.since, dead: !!p.dead, ch: p.ch }
        advance(p, now, hourAt)
        for (const w of fresh) for (const ev of w.events) {
          if (ev.seq > (p.applied[w.sid] ?? 0)) { applyEvent(p, ev, now); p.applied[w.sid] = ev.seq }
        }
        // Forget sessions gone for a day; one that comes back drops the events it kept (see session start).
        for (const s of Object.keys(p.applied)) {
          const f = listed.find(f => f.name === `${s}.json`)
          if (s !== sid && (!f || now - f.mtimeMs > T.presence.forgetAfterDays * 86_400_000)) delete p.applied[s]
        }
        action?.(p, now)
        // Notify only when you are not typing in any window.
        const quiet = now - Math.max(...fresh.map(w => w.lastInput)) > T.notify.quietMinutes * 60_000
        const notify = (text: string) => { if (quiet) void $.ui.notify(text, { title: NAME }).catch(() => {}) }
        if (p.call && p.call.since !== was.call) notify(tr().notifyCall(nameOf(p.ch), tr().callWord[p.call.reason]))
        if (p.tantrum && p.tantrum.since !== was.tantrum) notify(tr().notifyTantrum(nameOf(p.ch)))
        if (p.dead && !was.dead) {
          history = bury(p, await readHistory())
          await $.fs.write(`${dir}/history.json`, JSON.stringify(history))
          notify(tr().notifyDeath(nameOf(p.ch), causeText(p.dead.cause)))
        }
        if (p.ch !== was.ch) {
          history = remember(await readHistory(), p.ch)
          await $.fs.write(`${dir}/history.json`, JSON.stringify(history))
        }
        const kept = p.dead && now - p.dead.at > T.death.newEggSeconds * 1000 ? { ...newEgg(now, p.life + 1), applied: p.applied } : p
        // Known limit: the previous owner may write one more tick after ownership moves; fine while a tick is 3 seconds.
        await $.fs.write(petPath, JSON.stringify(kept))
        pet = kept
      } else pet = p

      win.events = win.events.filter(ev => ev.seq > (pet!.applied[sid] ?? 0))
      await refresh(now, isOwner, fresh, owner.room)
    }
    // Timer ticks and presses run one at a time so files are never read and written in a race.
    // A tick can fail once in passing (a file read while another window writes it); three in a row are said once.
    let failures = 0
    const tick = (action?: (p: Pet, now: number) => void) =>
      (busy = busy.then(() => tickNow(action)).then(() => { failures = 0 }, err => {
        failures += 1
        if (failures === 3) $.ui.log(`hitodama: ticks are skipped: ${String(err)}`)
      }))

    const kept = await readJson<Win>(seenPath(sid))
    const known = (await readJson<Pet>(petPath))?.applied?.[sid] !== undefined
    win = { ...win, ...kept, sid, turn: false, ...(known ? {} : { events: [] }) }
    history = await readHistory()
    io = {
      tick: async action => {
        touch(await $.clock.now())
        return tick(action)
      },
    }

    await $.command.register({ name: 'hd', description: tr().command, argumentHint: '[stats]' })
    void $.ui.open({ id: PANE, title: NAME, columns: PANE_COLUMNS })
    $.clock.every(T.presence.tickSeconds * 1000, () => { void tick() })
    $.clock.every(500, () => {
      frame += 1
      void $.ui.blit({ requestId: PANE, key: 'lcd', cells: frameCells(shown.scene, shown.night) }).catch(() => {})
    })
    void tick()
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    win.alive = 0
    if (win.sid && dir) {
      await $.fs.write(`${dir}/seen/${win.sid}.json`, JSON.stringify(win)).catch(() => {})
    }
    return next(e)
  })

  on('command.run', { command: 'hd' }, async ($, e) => {
    await io?.tick()
    if (/^\s*stats\b/.test(e.args)) return { text: pet ? statsText(pet, history, await $.clock.now()) : tr().noPet }
    await $.ui.open({ id: PANE, title: NAME, columns: PANE_COLUMNS })
    return { text: tr().inPane }
  })

  on('prompt.change', async ($, e, next) => {
    if (e.origin.kind !== 'clear') touch(await $.clock.now(), true)
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    touch(await $.clock.now())
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', ($, e, next) => {
    if (e.agentId) {
      win.agents += 1
      push({ k: 'agent' })
    } else win.turn = true
    return next(e)
  })
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      win.model = e.model
      if (typeof e.effort === 'string') win.effort = e.effort
    }
    return yield* next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const res = await next(e)
    if (e.agentId) {
      win.agents = Math.max(0, win.agents - 1)
      return res
    }
    win.turn = false
    win.lastActivity = await $.clock.now()
    if (e.isAborted) push({ k: 'abort' })
    push({ k: 'turn', cost: turnCost(win.model, win.effort, win.load, !!pet?.asleep), model: win.model, effort: win.effort, tokens: e.usage?.output_tokens ?? 0, load: win.load })
    return res
  })

  on('tool.call', async ($, e, next) => {
    const res = await next(e)
    if (!e.agentId && res.deny === undefined) {
      win.errors = res.isError ? win.errors + 1 : 0
      if (win.errors === T.mood.errorStreak) push({ k: 'errors' })
    }
    return res
  }).catch(($, e, next) => next(e))

  on('session.measure', ($, e, next) => {
    if (e.context.percent !== undefined) win.load = Math.round(e.context.percent)
    const five = e.rateLimits.find(r => r.kind === 'five_hour')
    if (five) {
      win.limit5 = five.percentUsed
      win.limitResetsAt = five.resetsAt
    }
    return next(e)
  })
  on('session.compact', async ($, e, next) => {
    const res = await next(e)
    if (!e.agentId && 'messages' in res) {
      win.load = 0
      push({ k: 'compact' })
      anim = { id: 'relief', until: (await $.clock.now()) + 4000, msg: tr().relief(T.load.compactJoy) }
    }
    return res
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const v = await read($, view)
    const { Box, Text, Button } = $.ui.resolve(e)
    const cols = e.props.bodyColumns, rows = e.props.scroll.bodyRows
    const isTerminal = e.surface === 'terminal'
    // Double-size screen when it fits the width and leaves room for text below.
    scale = isTerminal && cols >= 32 * WIDE_SCALE && rows >= 12 * WIDE_SCALE + 14 ? WIDE_SCALE : 1
    let screen = <Text dimColor>{tr().terminalOnly}</Text>
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      screen = <Raster key="lcd" columns={32 * scale} rows={12 * scale} cells={frameCells(shown.scene, shown.night)} />
    }
    const L = tr().buttons
    const buttons: [string, string, Press][] =
      v.mode === 'game' ? [['1', L.left, 'left'], ['2', L.right, 'right'], ['9', L.quit, 'quit']]
      : v.mode === 'stats' ? [['8', L.back, 'stats']]
      : ACTIONS.map(([k, a]) => [k, L[a as keyof typeof L], a])
    // Bars in two columns on a wide pane: fullness | health, energy | discipline, mood | load.
    const pairs = cols >= 2 * width(v.bars[0] ?? ''.padEnd(25)) + 3
    const barRows = pairs ? [0, 1, 2].map(i => `${v.bars[i] ?? ''}   ${v.bars[i + 3] ?? ''}`) : v.bars
    const lines = (s: string) => Math.max(1, Math.ceil(width(s) / Math.max(1, cols)))
    const buttonsLen = buttons.reduce((n, [, l]) => n + width(l) + 4, 0)
    const used = 1 + (isTerminal ? 12 * scale : 1) + lines(v.msg) + barRows.length + lines(v.meta) + lines(' '.repeat(buttonsLen)) + 2
    const logRows = Math.max(0, rows - used)
    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold>{v.title}</Text>
          {v.call ? <Text color="yellow" bold> (!)</Text> : ''}
          <Text dimColor> {v.room}</Text>
        </Text>
        {screen}
        <Text>{v.msg}</Text>
        {v.mode === 'stats'
          ? v.stats.map(l => <Text>{l || ' '}</Text>)
          : barRows.map(l => <Text wrap="truncate-end">{l}</Text>)}
        {v.mode !== 'stats' && <Text dimColor>{v.meta}</Text>}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {buttons.map(([k, l, a]) => <Button key={`b-${a}`} hotkey={k} plain label={l} onPress={() => press(a)} />)}
        </Box>
        {v.mode !== 'stats' && logRows > 1 && v.log.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>{tr().journal}</Text>
            {v.log.slice(0, logRows - 1).map(l => <Text wrap="truncate-end" dimColor>{l}</Text>)}
          </Box>
        )}
      </Box>
    )
  })
}
