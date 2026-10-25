// What the pane draws: rebuilt every tick from the pet and the window. The LCD frame travels separately, by blit.
export type HitodamaView = {
  mode: 'care' | 'game' | 'stats'
  title: string
  call: boolean
  room: string
  msg: string
  bars: string[] // fullness, energy, mood, health, discipline, window load
  stats: string[]
  log: string[] // newest first
  meta: string
}

declare module 'claude-code' {
  interface PluginState {
    hitodama: { view: Shaped<HitodamaView> }
  }
}
