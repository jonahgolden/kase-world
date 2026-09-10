# Kase World

Browser game for phones first, then iPad, then laptop. You are Kase, a baby wrecking a continent
for 75 s, then fighting that continent's boss. Bosses are Nova's and Louie's drawings. Score chains
a multiplier; runs go on a global leaderboard by name.

Live: https://kase-world.kase-world.workers.dev · Repo: github.com/jonahgolden/kase-world (`main`)

## Architecture rule

`src/sim/` is the whole game as pure data: no DOM, no three.js, deterministic given seed + inputs.
`step(state, input)` advances one 60 Hz tick and fills `state.events`. Everything else is a thin
driver that reads state and events: `render/` (three.js), `input/` (keyboard + touch), `audio/`
(Web Audio, manifest + synth fallback), `ui/` (HTML overlay), `net/` (leaderboard client),
`worker/` (Cloudflare Worker: static assets + `/api/scores` on D1). Keep it that way. New gameplay
goes in `sim/` with a test; new visuals go in `render/renderer.ts`.

## Commands

- `pnpm dev` game on :5173 · `pnpm dev:api` worker on :8787 (vite proxies `/api`)
- `pnpm test` sim tests · `pnpm typecheck` game + worker
- `pnpm shot [--mobile] [--only=wreck|boss|title]` headless bot playtest, PNGs in `shots/` (needs `pnpm dev` running)
- `pnpm deploy` build + `wrangler deploy` · `pnpm db:migrate` apply `worker/schema.sql` to remote D1

## URL params (dev)

`?dev=1` level select on title (or tap the logo 5×) · `?level=<id>` · `?seed=N` · `?bot=1` scripted
player · `?auto=1` skip title · `?skip=boss` boss in 2 s · `?mute=1` · `?name=X`

## Swapping art and sound

- Models: `src/render/assets.ts` names every GLB and a yaw fix per model. `public/assets/models/`.
- Bosses: `public/assets/drawings/<file>.jpg` + a `BossDef` in `src/sim/levels.ts` (name, drawnBy,
  stats, taunt). The renderer turns the drawing into a bordered paper card.
- Sounds: drop files in `public/assets/audio/`, list them in `manifest.json` under the event name.
  Any event without files is synthesized. Event names = `EventType` in `src/sim/types.ts`.
- Tuning: every number lives in `CFG` (`src/sim/sim.ts`), `PROP_STATS` / `NPC_STATS` / `LEVELS` (`levels.ts`).

## Status

See the bottom of this file. Update it at the end of every session; keep it short.

### 2026-09-10 — session 1 (v0.1 then v0.2 after first parent feedback)
v0.1: fresh build, level 1 playable, points + countdown, deployed. Parent feedback: goal unclear,
points/timer/bars felt disconnected, scream cone backwards, poop key undiscoverable.
v0.2 (deployed): one WRECK meter per level (boss at 100%), stopwatch, time-based boards per
continent + world (`/api/times`, table `times`), hearts, boss gauge only in boss mode, hold-to-charge
scream/poop with charge shown on the baby, pickups (milk, pacifier, rattle), level card, help/pause
overlay (`?`, Esc), click-to-poop, attract demo on title. All 7 continents share one boss behavior.
Research memos (design + continent-arena recipe) are summarized in ~/.claude/TODO.md queue.
Next: user's answers on level goal variety, unlock ladder, globe hub; then continent-shaped arenas.
