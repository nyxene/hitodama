# Hitodama

A Claude Code mod: a virtual pet in a pane. `hooks/register.tsx` is the hooks module; everything it imports lives in `hooks/`, apart from the pane's view type in `types/`.

- `sim.ts` is the pet as pure data (no `$`), `view.ts` decides what the pane shows, `i18n.ts` holds every visible word in nine languages (English is the reference; add a key to `en` and the type check demands it in every language; the type check runs locally only, once the mod has been loaded).
- `lines.ts` registers character lines; `yokai.ts` is the yokai line with its rules, names and sprites; `draw.ts` holds the pixel primitives.
- Weights are in `tuning.ts`. Sprites are previewed with `bun scripts/art.ts` (writes the icon and `assets/yokai.png`).

Rules:

- Conventional Commits, subject states the result. No session-attribution lines or links to private AI sessions anywhere; `.githooks/commit-msg` and `scripts/privacy.sh` refuse them, and `scripts/privacy-hook.sh` refuses them in `gh` commands.
- Work goes through a branch and a pull request; `main` takes no direct commits.
- Never add characters, names or sprites from existing franchises.
- Run `scripts/gates.sh` before saying something works.
