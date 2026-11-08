import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { HitodamaView } from '../types'
import { LANGS, langFrom, setLang, t as tr, width, type Lang } from './i18n'
import { act, advance, applyEvent, bury, canPlay, causeText, finishGame, isHistory, isPet, nameOf, newEgg, note, remember, turnCost, type Act, type Ev, type History, type Pet } from './sim'
import { cells, colorOf, scene, screenRows, W, type Detail } from './sprites'
import { tuning as T } from './tuning'
import { VERSION } from './version'
import { bar, busy as isBusy, decide, lastActive, limitOf, newer, paceOf, restFrom, statsText, title, wrapRows, type Ctx, type Limit, type LimitKind, type Win } from './view'

const NAME = 'Hitodama'
const PANE = 'hitodama'
const BLANK: HitodamaView = { mode: 'care', title: NAME, call: false, room: '', msg: '', bars: [], stats: [], log: [], meta: '' }
const view = atom({ plugin: 'hitodama', key: 'view' } as const, BLANK, { shape: 'view-2' })
const PANE_COLUMNS = T.screen.maxCols + 2 // the dock opens as wide as the widest screen

type Press = Act | 'stats' | 'left' | 'right' | 'quit'
const ACTIONS: [string, Press][] = [['1', 'eat'], ['2', 'snack'], ['3', 'game'], ['4', 'clean'], ['5', 'heal'], ['6', 'light'], ['7', 'scold'], ['8', 'stats']]

export const register: Register = (on, options) => {
  // A language set by hand wins; auto (the default) follows Claude Code's own language setting, else English.
  const auto = !LANGS.includes(options.language as Lang)
  setLang(auto ? 'en' : options.language)
  const follow = (claude: unknown) => { if (auto) setLang(langFrom(claude) ?? 'en') }
  // Each window keeps itself in seen/<session>.json, so other windows see it and it survives a mod reload.
  let win: Win = { sid: '', room: '', alive: 0, lastInput: 0, lastActivity: 0, typingAt: 0, load: 0, model: '', effort: 'medium', turn: false, agents: 0, errors: 0, limit: 0, seq: 0, events: [], v: VERSION }
  let pet: Pet | null = null
  let history: History = { lives: [], seen: [] }
  let anim: Ctx['anim'] = null
  let game: { wins: boolean[]; dir: number } | null = null
  let statsOpen = false
  let frame = 0
  let screenCols = W // the screen's width, chosen by the terminal render from the pane size; blit frames must match it
  let shown = { scene: 'idle', night: false }
  let followed: Limit = { limit: 0 } // the usage limit of all live windows at the last tick, which prices this window's turns
  // File work lives in the session.start closure: $ may not be passed to functions.
  let dir = '' // ~/.claude/hitodama, set on session start
  let io: { tick: (action?: (p: Pet, now: number) => void) => Promise<void>; flush: () => Promise<void> } | null = null
  // Saved events up to this seq wait for a pet that reads: the pet file did not read at session start (see there).
  // A window that closes before then writes only the events of this run.
  let unchecked: number | null = null
  const onDisk = () => JSON.stringify(unchecked !== null ? { ...win, events: win.events.filter(ev => ev.seq > unchecked!) } : win)

  const push = (e: Ev extends infer E ? (E extends Ev ? Omit<E, 'seq'> : never) : never) => {
    win.seq += 1
    win.events = [...win.events, { ...e, seq: win.seq } as Ev].slice(-200)
  }
  const touch = (now: number, typing = false) => {
    win.lastInput = now
    win.lastActivity = now
    if (typing) win.typingAt = now
  }
  // The look the settings ask for; anything else falls back to the default. The screen is in colour unless
  // colourScreen is off (then an LCD); the bars only when colourBars is on.
  const lcd = options.colourScreen === false, colourBars = options.colourBars === true
  const detail: Detail = options.detail === 'braille' ? 'braille' : 'pixel'
  const setting = (key: string) => options[key] !== false
  // A render and the timer often ask for the same frame: the last one is kept and given again.
  let lastFrame = { key: '', cells: '' }
  const frameCells = (sceneId: string, night: boolean) => {
    const g = game ? { dir: game.dir, wins: game.wins } : undefined
    const o = { ch: pet?.ch ?? 'egg', load: win.load, poops: pet?.poops ?? 0, agents: win.agents, game: g }
    const key = JSON.stringify([sceneId, night, frame, screenCols, o])
    if (key === lastFrame.key) return lastFrame.cells
    const color = colorOf(sceneId === 'dead' ? 'obake' : o.ch)
    lastFrame = {
      key,
      cells: cells(scene(sceneId, o, frame), night, screenCols, {
        lcd, detail, color, fine: setting('smallPixels'), kinds: setting('itemColours'), scenery: setting('scenery'), particles: setting('particles'),
        scene: sceneId, t: frame,
      }),
    }
    return lastFrame.cells
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
        if (msg === null) return
        note(p, now, tr().logGame(msg))
        anim = { id: wins >= 3 ? 'happy' : 'bored', until: now + 3000, msg }
      })
    }
    return io.tick((p, now) => {
      const r = act(p, a, now)
      if (r.anim === 'game') { game = { wins: [], dir: 0 }; anim = null; return }
      if (!r.noop) note(p, now, r.msg)
      anim = { id: r.anim, until: now + 3000, msg: r.msg }
    })
  }

  on('session.start', async ($, e, next) => {
    // A `claude -p` run or the SDK has nobody at the prompt: it must not take the pet from a window that has.
    if (!e.isInteractive) return next(e)
    if (auto) follow((await $.config.list().catch(() => [])).find(r => r.key === 'language')?.value)
    const sid = await $.session.id()
    const cwd = e.cwd
    // No home folder, no pet: never fall back to writing into the project, as a relative path would.
    const absolute = (p?: string) => (p && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)) ? p : undefined)
    const home = absolute(await $.env.get('HOME')) ?? absolute(await $.env.get('USERPROFILE'))
    if (!home) {
      $.ui.log(tr().noHome)
      return next(e)
    }
    dir = `${home}/.claude/hitodama`
    const seenPath = (id: string) => `${dir}/seen/${id}.json`
    // Another window's version, counted only as plain "major.minor.patch": anything else, which the pane could not draw,
    // is no version.
    const versionOf = (v: unknown) => (typeof v === 'string' && /^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(v) ? v : undefined)
    // Another window's room name, as the pane shows it: a short single line, whatever its file holds.
    const roomOf = (room: unknown) => [...String(room ?? '').slice(0, 64)].map(ch => { const c = ch.codePointAt(0)!; return c < 32 || (c >= 127 && c < 160) || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 ? ' ' : ch }).join('')
    const readJson = async <V,>(path: string): Promise<V | null> => {
      try { return JSON.parse(await $.fs.read(path)) as V } catch { return null }
    }
    // Mods cannot rename files, so a write can be cut short (a window closing, a second writer). The pet and the
    // history are written to a spare copy first, then to their own file. One that is there but does not read gives
    // way to its spare copy, written just before it, without a word: with many windows that is mostly a read while
    // another window writes, nothing a window wrote is lost, and the next write puts the file right.
    const spareOf = (path: string) => path.replace(/\.json$/, '.prev.json')
    const readText = (path: string) => $.fs.read(path).catch(() => '')
    const parse = (text: string): unknown => { try { return JSON.parse(text) } catch { return null } }
    const writeSafe = async (path: string, value: unknown) => {
      const text = JSON.stringify(value)
      await $.fs.write(spareOf(path), text)
      await $.fs.write(path, text)
    }
    // The file when it reads, else its spare copy when that reads; null when the file is gone or neither reads.
    const readSafe = async <V,>(path: string, ok: (v: unknown) => v is V): Promise<V | null> => {
      if (!(await $.fs.exists(path))) return null
      const v = parse(await readText(path))
      if (ok(v)) return v
      const spare = parse(await readText(spareOf(path)))
      return ok(spare) ? spare : null
    }
    const historyPath = `${dir}/history.json`
    // A history that is there but does not read, nor its spare copy, is null and not written over: a death or a new
    // character goes unrecorded there until one reads again. One that is gone starts from the one in memory.
    const readHistory = async () => ((await $.fs.exists(historyPath)) ? readSafe(historyPath, isHistory) : history)
    // A pet file that is gone means a new egg. One that is there but does not read, nor its spare copy, is left alone:
    // the tick is skipped, never replaced by an egg.
    const petPath = `${dir}/pet.json`
    const readPet = async (): Promise<Pet | null> => {
      if (!(await $.fs.exists(petPath))) return null
      const p = await readSafe(petPath, isPet)
      // Its message is the line the owner reads, in the pet's language.
      if (!p) throw Object.assign(new Error(tr().unreadable(petPath)), { name: 'unreadable' })
      return p
    }
    // date from /bin, then /usr/bin, then PATH (NixOS), each only when the one before gave no offset; else the
    // runtime's offset.
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
    // The newer version a live window runs while this one runs an older one; the pane says so, the transcript does not.
    let outdated: string | null = null

    // active: when any window was last active, as the tick found it. asking: the rooms of other windows where Claude
    // asked for permission.
    const refresh = async (now: number, isOwner: boolean, ownerRoom: string, active: number, asking: string[] = []) => {
      const p = pet
      if (!p) return
      const limit = followed
      const ctx: Ctx = {
        ...limit, now, isOwner, ownerRoom, anim, asking,
        idleMin: (now - active) / 60_000,
      }
      const shownNow = game && isOwner && !asking.length ? { scene: 'game', msg: tr().gameRound(game.wins.length + 1) } : decide(p, win, ctx)
      const d = outdated ? { ...shownNow, msg: tr().outdated(outdated, VERSION) } : shownNow
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
        meta: tr().meta(win.model, win.effort, win.agents,
          limit.limitKind ? tr().limitLine(Math.round(limit.limit), limit.limitKind === 'seven_day') : '', p.weight, p.cm),
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
      // While saved events wait to be checked, no events go to disk: no owner applies them unchecked, and the ones of
      // this run, a tick later, still reach it in order.
      await $.fs.write(seenPath(sid), JSON.stringify(unchecked !== null ? { ...win, events: [] } : win))

      // Mods cannot delete files, so old session files stay; only recently written ones are read.
      // A listing that fails says nothing about who is gone: nothing is forgotten on that tick.
      const listing = await $.fs.list(`${dir}/seen`).catch(() => null)
      const listed = (listing ?? []).filter(f => f.name.endsWith('.json') && f.name !== `${sid}.json`)
      const recent = listed.filter(f => now - f.mtimeMs < T.presence.staleAfterMinutes * 60_000)
      // A window counts only under its own file name, and no later than now, so one file cannot claim the pet for good.
      // A window that has just closed (alive 0) no longer counts, but its last events are still applied.
      const written = (await Promise.all(recent.map(async f => ({ name: f.name, w: await readJson<Win>(`${dir}/seen/${f.name}`) }))))
        .flatMap(({ name, w }) => w && typeof w.sid === 'string' && name === `${w.sid}.json`
          ? [{ ...w, room: roomOf(w.room), lastInput: Math.min(w.lastInput, now), lastActivity: Math.min(w.lastActivity, now), v: versionOf(w.v) }] : [])
      const others = written.filter(w => now - w.alive < T.presence.staleAfterMinutes * 60_000)
      const fresh = [win, ...others]
      followed = limitOf(fresh, now)
      const active = lastActive(fresh, now)
      // A window on an older version than another live one leaves the pet to the newer ones, never owning it. Windows
      // of 0.5.2 and before record no version and choose as before, by input over all windows: the owner is that
      // choice, unless it fell on an outdated window, which gives way to the newest one by input. So every window,
      // old or new, sees one owner, and only one writes.
      const latest = fresh.reduce((m, w) => (w.v && newer(w.v, m) ? w.v : m), VERSION)
      outdated = latest !== VERSION ? latest : null
      const pick = (ws: Win[]) => [...ws].sort((a, b) => b.lastInput - a.lastInput || a.sid.localeCompare(b.sid))[0]!
      const first = pick(fresh)
      const owner = first.v && newer(latest, first.v) ? pick(fresh.filter(w => w.v === latest)) : first
      const isOwner = owner.sid === sid

      // An outdated window that cannot read a pet a newer version wrote goes on showing the last one it read, never
      // owning it, so its pane still says to restart.
      const p = (await readPet().catch(err => { if (outdated && pet) return pet; throw err })) ?? newEgg(now)
      if (unchecked !== null) {
        const base = unchecked
        const applied = p.applied[sid]
        if (applied === undefined) win.events = win.events.filter(ev => ev.seq > base)
        // A window file cut short as well numbered this run from below what the pet has applied: it moves up past it.
        else if (applied > base) {
          win.events = win.events.map(ev => (ev.seq > base ? { ...ev, seq: ev.seq + applied - base } : ev))
          win.seq += applied - base
        }
        unchecked = null
      }
      if (isOwner) {
        const was = { call: p.call?.reason, tantrum: !!p.tantrum, dead: !!p.dead, ch: p.ch }
        const resting = followed.limit >= T.limits.hit
        advance(p, now, hourAt, resting, restFrom(active, p.at), isBusy(owner, now))
        for (const w of [win, ...written]) for (const ev of w.events) {
          if (ev.seq > (p.applied[w.sid] ?? 0)) { applyEvent(p, ev, now); p.applied[w.sid] = ev.seq }
        }
        // Forget sessions gone for a day; one that comes back drops the events it kept (see session start).
        if (listing) for (const s of Object.keys(p.applied)) {
          const f = listed.find(f => f.name === `${s}.json`)
          if (s !== sid && (!f || now - f.mtimeMs > T.presence.forgetAfterDays * 86_400_000)) delete p.applied[s]
        }
        action?.(p, now)
        // A game left open ends once the pet cannot play, so its state shows again.
        if (game && !canPlay(p)) game = null
        // Notify only when you are not typing in any window, and only for a call or tantrum that has just begun: one
        // that waits (at the limit, in focus) restarts its clock every tick without calling again.
        const quiet = now - Math.max(...fresh.map(w => w.lastInput)) > T.notify.quietMinutes * 60_000
        const notify = (text: string) => { if (quiet) void $.ui.notify(text, { title: NAME }).catch(() => {}) }
        if (p.call && p.call.reason !== was.call) notify(tr().notifyCall(nameOf(p.ch), tr().callWord[p.call.reason]))
        if (p.tantrum && !was.tantrum) notify(tr().notifyTantrum(nameOf(p.ch)))
        if (p.dead && !was.dead) {
          const h = await readHistory()
          if (h) await writeSafe(historyPath, (history = bury(p, h)))
          notify(tr().notifyDeath(nameOf(p.ch), causeText(p.dead.cause)))
        }
        if (p.ch !== was.ch) {
          const h = await readHistory()
          if (h) await writeSafe(historyPath, (history = remember(h, p.ch)))
        }
        const kept = p.dead && now - p.dead.at > T.death.newEggSeconds * 1000 ? { ...newEgg(now, p.life + 1), applied: p.applied } : p
        // Known limit: the previous owner may write one more tick after ownership moves; fine while a tick is 3 seconds.
        await writeSafe(petPath, kept)
        pet = kept
      } else pet = p

      win.events = win.events.filter(ev => ev.seq > (pet!.applied[sid] ?? 0))
      // The window showing the prompt has it on screen; the others point at it.
      await refresh(now, isOwner, owner.room, active, [...new Set(others.filter(w => (w.asking ?? 0) > 0).map(w => w.room))])
    }
    // Timer ticks and presses run one at a time so files are never read and written in a race.
    // A tick can fail once in passing (a file read while another window writes it); three in a row are said once. Only
    // a pet that does not read, which waits for the owner, reaches the transcript; anything else goes on trying and is
    // said in the debug log alone.
    let failures = 0
    const tick = (action?: (p: Pet, now: number) => void) =>
      (busy = busy.then(() => tickNow(action)).then(() => { failures = 0 }, err => {
        failures += 1
        if (failures !== 3) return
        // An outdated window may only fail to read a pet a newer version wrote: it is told to restart, not to delete it.
        if (err instanceof Error && err.name === 'unreadable') { if (!outdated) $.ui.log(err.message) }
        else $.ui.log(tr().stuck(err instanceof Error ? err.message : String(err)), { to: 'debug' })
      }))

    const kept = await readJson<Win>(seenPath(sid))
    // A pet file that does not read says nothing about this session: its saved events wait for the first tick that
    // reads it, which drops them if the pet has no record of the session. Events of this run are never held back.
    const saved = await readPet().catch(() => undefined)
    const known = saved === undefined || saved?.applied[sid] !== undefined
    // A resumed session's turn and helpers died with its old process, and their ends never come.
    win = { ...win, ...kept, sid, v: VERSION, turn: false, agents: 0, asking: 0, ...(known ? {} : { events: [] }) }
    // A window file cut short reads as none and would number events from 0, below what the pet has already applied,
    // so they would be dropped: numbering goes on from there.
    win.seq = Math.max(win.seq, saved?.applied[sid] ?? 0)
    unchecked = saved === undefined ? win.seq : null
    history = (await readHistory()) ?? history
    io = {
      tick: async action => {
        touch(await $.clock.now())
        return tick(action)
      },
      flush: () => tick(),
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
    // The owner applies its own last events now; any other window's are picked up from its file by the next owner.
    await io?.flush()
    win.alive = 0
    if (win.sid && dir) {
      await $.fs.write(`${dir}/seen/${win.sid}.json`, onDisk()).catch(() => {})
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
  // Claude Code's language changed in /config: an auto pet follows it at once.
  on('config.set', async ($, e, next) => {
    const res = await next(e)
    if (e.key === 'language' && res.deny === undefined) {
      follow(res.value)
      await io?.tick()
    }
    return res
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    touch(await $.clock.now())
    win.asking = 0
    return next(e)
  }).catch(($, e, next) => next(e))

  // Claude Code says when it shows a permission prompt; only that it does is kept, not the tool or the text. The mark
  // goes once a tool call ends (the one that asked, allowed or refused), the turn ends, or a prompt is submitted.
  // ponytail: no event marks the moment you allow a call, so the mark stays while an allowed tool runs (the pane says
  // Claude *asked*); and any other tool call ending, in parallel or in a helper, clears it while the prompt may still
  // be open. Match tool_use_id through tool.check's ask if that matters.
  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt') win.asking = await $.clock.now()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    win.lastActivity = await $.clock.now() // a turn may start with no prompt: a background task, a scheduled run
    if (e.agentId) {
      win.agents += 1
      push({ k: 'agent' })
    } else {
      win.turn = true
      win.asking = 0
    }
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
    // The turn or helper is over even when a hook below fails, or the window would count as busy.
    let res: Awaited<ReturnType<typeof next>>
    try {
      res = await next(e)
    } finally {
      if (e.agentId) win.agents = Math.max(0, win.agents - 1)
      else {
        win.turn = false
        win.asking = 0
      }
      win.lastActivity = await $.clock.now()
    }
    if (e.agentId) return res
    const now = win.lastActivity
    if (e.isAborted) push({ k: 'abort' })
    const tokens = e.usage?.output_tokens ?? 0
    const cut = e.isAborted || !e.usage // interrupted, or ended on an API error: what it streamed is not counted
    const cost = turnCost(win.model, tokens, win.load, !!pet?.asleep, paceOf(followed, now), cut)
    // Night is when the turn was made, not when an owner applies it, which can be hours later. A window that has not
    // read the pet leaves it unmarked, for the owner to decide.
    push({ k: 'turn', cost, model: win.model, effort: win.effort, tokens, load: win.load, night: pet?.asleep })
    return res
  })

  on('tool.call', async ($, e, next) => {
    const res = await next(e)
    win.asking = 0 // its permission, if it asked, is settled
    win.lastActivity = await $.clock.now() // a long turn shows it is still working
    if (!e.agentId && res.deny === undefined) {
      win.errors = res.isError ? win.errors + 1 : 0
      if (win.errors === T.mood.errorStreak) push({ k: 'errors' })
    }
    return res
  }).catch(($, e, next) => next(e))

  // A reading with neither limit (before the first response, or off a subscription) keeps the last figure.
  on('session.measure', async ($, e, next) => {
    if (e.context.percent !== undefined) win.load = Math.round(e.context.percent)
    const r = e.rateLimits.find(r => r.kind === 'five_hour') ?? e.rateLimits.find(r => r.kind === 'seven_day')
    if (r) {
      win.limit = r.percentUsed
      win.limitKind = r.kind as LimitKind
      win.limitResetsAt = r.resetsAt
      win.limitAt = await $.clock.now()
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
    const L = tr().buttons
    const buttons: [string, string, Press][] =
      v.mode === 'game' ? [['1', L.left, 'left'], ['2', L.right, 'right'], ['9', L.quit, 'quit']]
      : v.mode === 'stats' ? [['8', L.back, 'stats']]
      : ACTIONS.map(([k, a]) => [k, L[a as keyof typeof L], a])
    // Bars in two columns where they fit side by side: fullness | health, energy | discipline, mood | load.
    const barsAt = (w: number) => w >= 2 * width(v.bars[0] ?? ''.padEnd(25)) + 3
      ? [[0, 3], [1, 4], [2, 5]] : v.bars.map((_, i) => [i])
    // With colourBars on, the filled part of a bar takes the theme's colour for its level: low needs, or a heavy
    // load (the last bar), warn.
    const barEl = (i: number) => {
      const s = v.bars[i] ?? '', a = s.search(/[█░]/), b = s.lastIndexOf('░') + 1 || s.lastIndexOf('█') + 1
      if (!colourBars || a < 0) return s
      const n = Number(s.slice(b).trim().split(/\s+/)[0])
      const tone = i === 5 ? (n >= T.load.bands[2]! ? 'error' : n >= T.load.bands[1]! ? 'warning' : 'success')
        : n < T.needs.sad ? 'error' : n < 50 ? 'warning' : 'success'
      const filled = s.slice(a, b).replace(/░/g, '')
      // An empty bar has nothing to colour: its number takes the colour instead.
      if (!filled) return <Text>{s.slice(0, b)}<Text color={tone}>{s.slice(b)}</Text></Text>
      return <Text>{s.slice(0, a)}<Text color={tone}>{filled}</Text>{s.slice(a + filled.length)}</Text>
    }
    // The main needs on one line, for a pane too small for the bars: "Fullness 81 · Energy 0 · Mood 0 · Health 83".
    const compactLine = [0, 1, 2, 3].map(i => {
      const s = v.bars[i] ?? '', a = s.search(/[█░]/)
      return a < 0 ? s.trim() : `${s.slice(0, a).trim()} ${s.slice(a).replace(/[█░]/g, '').trim().split(/\s+/)[0]}`
    }).join(' · ')
    const lines = wrapRows
    // Buttons flow in rows, one column apart, each "<key>: <label>".
    const buttonRows = (w: number) => {
      let rowsUsed = 1, x = 0
      for (const [, l] of buttons) {
        const n = width(l) + 3
        if (x > 0 && x + 1 + n > w) { rowsUsed += 1; x = n } else x += (x > 0 ? 1 : 0) + n
      }
      return rowsUsed
    }
    const textRows = (w: number, meta = true, compact = false) => lines(v.msg, w)
      + (v.mode === 'stats' ? v.stats.reduce((n, l) => n + lines(l, w), 0)
        : (compact ? lines(compactLine, w) : barsAt(w).length) + (meta ? lines(v.meta, w) : 0))
      + buttonRows(w)
    // The layout the pane's size allows, with the screen as wide as fits, 32 to maxCols columns: on top with
    // everything under it as wide as the screen, like the body of a pocket device; beside the text in a wide and short
    // pane; left out when it fits neither way, the model line too if that is what keeps the buttons in.
    let layout: 'stack' | 'side' | 'text' = isTerminal ? 'text' : 'stack', sw = W
    if (isTerminal) {
      for (let w = Math.min(T.screen.maxCols, cols); w >= W && layout === 'text'; w--) {
        if (1 + screenRows(w) + textRows(w) <= rows) { layout = 'stack'; sw = w }
      }
      // Beside the text: the widest screen the height allows whose text, without the model line, still fits.
      for (let w = Math.min(T.screen.maxCols, cols - 30, Math.floor(((rows - 1) * 8) / 3)); w >= W && layout === 'text'; w--) {
        if (1 + textRows(cols - w - 2, false) <= rows) { layout = 'side'; sw = w }
      }
      // The animation frames are cut to this width too.
      screenCols = sw
    }
    const screenH = isTerminal ? screenRows(sw) : 1, sideW = cols - sw - 2
    const stackW = isTerminal ? sw : cols
    let screen = <Text dimColor>{tr().terminalOnly}</Text>
    if (isTerminal) {
      const { Raster } = $.ui.resolve(e)
      screen = <Raster key="lcd" columns={sw} rows={screenH} cells={frameCells(shown.scene, shown.night)} />
    }
    const textW = layout === 'side' ? sideW : layout === 'stack' ? stackW : cols
    // Too small even without the model line, the text alone shows the main needs on one line instead of six bars.
    const compact = layout === 'text' && v.mode !== 'stats' && 1 + textRows(cols, false) > rows
    const meta = layout === 'stack' || (!compact && 1 + textRows(textW) <= rows)
    const text = (
      <Box flexDirection="column" width={layout === 'side' ? sideW : undefined}>
        <Text>{v.msg}</Text>
        {v.mode === 'stats'
          ? v.stats.map(l => <Text>{l || ' '}</Text>)
          : compact
            ? <Text>{compactLine}</Text>
            : barsAt(textW).map(g => <Text wrap="truncate-end">{g.map((i, k) => (k ? <Text>{"   "}{barEl(i)}</Text> : barEl(i)))}</Text>)}
        {v.mode !== 'stats' && meta && <Text dimColor>{v.meta}</Text>}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {buttons.map(([k, l, a]) => <Button key={`b-${a}`} hotkey={k} plain label={l} onPress={() => press(a)} />)}
        </Box>
      </Box>
    )
    const used = 1 + (layout === 'side' ? Math.max(screenH, textRows(sideW, meta)) : (layout === 'stack' ? screenH : 0) + textRows(textW, meta, compact)) + 2
    const logRows = Math.max(0, rows - used)
    // Journal entries wrap under their text, the time standing alone on the left; as many whole entries as fit.
    const logW = isTerminal && layout === 'stack' ? stackW : cols, TIME = 7, textCol = Math.max(1, logW - TIME)
    const entries: { time: string; text: string }[] = []
    for (let i = 0, left = logRows - 1; i < v.log.length; i++) {
      const l = v.log[i]!, text = l.slice(TIME), n = lines(text, textCol)
      if (n > left) break
      entries.push({ time: l.slice(0, TIME), text }); left -= n
    }
    // The title takes the pane's whole width; under it, a stacked terminal pane is as wide as the screen.
    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold>{v.title}</Text>
          {v.call ? <Text color="yellow" bold> (!)</Text> : ''}
          <Text dimColor> {v.room}</Text>
        </Text>
        <Box flexDirection="column" width={isTerminal && layout === 'stack' ? stackW : undefined}>
          {layout === 'stack' && screen}
          {layout === 'side'
            ? <Box flexDirection="row" columnGap={2}>{screen}{text}</Box>
            : text}
          {v.mode !== 'stats' && entries.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor>{tr().journal}</Text>
              {entries.map(e => (
                <Box flexDirection="row">
                  <Box width={TIME}><Text dimColor>{e.time}</Text></Box>
                  <Box width={textCol}><Text dimColor>{e.text}</Text></Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
