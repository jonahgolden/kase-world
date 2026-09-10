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
- `node scripts/build-continents.ts` regenerates `src/sim/continents.ts` + `public/continents.geojson`
  from `data/continents.geojson` (Natural Earth 110m, dissolved + simplified with mapshaper)

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
- Arenas are the real continent outlines (`src/sim/continents.ts`, generated). `finds` per level in
  `levels.ts` place clocks/skateboard/megaphone far from spawn (detours), milk/pacifier/rattle nearer.
  Gift props drop a seeded surprise. Globe hub: `src/render/globe.ts` (icosphere colored by the GeoJSON).

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
v0.3 (deployed): arenas are continent-shaped cutouts with coast + water; globe hub on the title with
boss cards + locks, fly-in transition into each level, continent chooser with saved progress
(`kw.progress`); finds with detour trade-offs (⏱ clock -5 s, 🛹 skateboard fast until hit, 📣 megaphone,
🎁 gifts); perfect boss = -10 s. Time boards are global, per continent + world.
v0.4 (deployed): parent feedback round 2 → boss fight mode (boss lands, clears a torch-lit ring,
night lighting + spotlight, title card, player kept in the ring); sparser wrecking in 4-7 clustered
spots per continent with open space between; traversal features (jumpable platforms, tall ones with
launch fans, portal pairs, lakes with an island, safe from grown-ups); finds glow with light pillars
and sit on platforms/islands/far coasts; minimap (continent outline, remembered finds, boss ring);
chickens; NPC scares worth more; new finds: fedora (EPIC), quad (2 hits), wings (glide), goggles
(map reveal), hot potatoes (contact bombs). Credits read "the Erbalaban Bros" except Louie's water
monsters. Bot soak + 21 sim tests cover platforms, fans, portals, lakes, ring, bombs.
Next: family playtest of v0.4 → tune; then goal shapes (find N, chase) and per-continent boss attacks.
