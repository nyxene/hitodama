// Shared weights. Minutes, hours and percents as labelled.
export const tuning = {
  decayPerHour: { satiety: 6, energy: 4, joy: 3 }, // loss for an awake adult
  sleepRecoverPerHour: 15, // energy regained while asleep
  stageDecay: { egg: 0, baby: 8, child: 2, teen: 1.5, adult: 1, secret: 1, old: 3 }, // old: the last 20% of its life
  asleepFactor: 0.3,
  offline: { decayFactor: 0.3 }, // Claude closed: "in the pocket", no calls
  needs: { hungry: 25, sad: 25, tired: 25, sick: 20, dirtyAt: 2 },
  attention: { answerMinutes: 15 }, // an unanswered call is a care mistake
  discipline: { step: 25, tantrumMinutes: 15, everyHours: [2, 5] as const }, // key 7; a missed tantrum is a discipline mistake
  weight: { meal: 1, snack: 2, game: -1, snacksPerHourSick: 5 },
  sick: { hpPerHour: 2 },

  turn: {
    // energy cost of one model turn
    energy: 0.8,
    effort: { low: 0.5, medium: 1, high: 1.5, xhigh: 2, max: 3 } as Record<string, number>,
    model: { haiku: 0.6, sonnet: 1, opus: 1.4, fable: 1.8 } as Record<string, number>,
  },
  load: { bands: [50, 80, 90], energyMul: [1, 1.3, 1.7, 2.2], compactJoy: 8 },
  night: { energyMul: 1.5, joyPerTurn: -1 }, // work while it sleeps
  limits: { fiveHourTired: 80, fiveHourHit: 100 },
  mood: { gameWin: 15, errorStreak: 3, errorJoy: -4, abort: -2, scoldNoReason: -5 },
  care: { meal: 35, snackJoy: 10, heal: 40, cure: 50, gameEnergy: -5 }, // a dose adds heal; health at cure ends the illness
  poop: { everyAwakeHours: 3, max: 4, healthPerHourEach: 3 },
  idle: { playAlone: 15, bored: 60, nap: 180 }, // minutes
  presence: { tickSeconds: 3, staleAfterMinutes: 2, forgetAfterDays: 1 },
  death: { starveHours: 12, newEggSeconds: 60 },
  notify: { quietMinutes: 1 }, // notify only after this many minutes without input
}
