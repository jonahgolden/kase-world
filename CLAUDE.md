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
v0.5 (deployed): Conga Rattle (grown-ups within 6.5 join a line behind Kase, smash what they bump,
end dizzy), Giant Formula (2.4x baby, unhurtable, smashes on touch, scares everyone, 8 s), and the
second goal shape: Asia is a FIND level (7 lanterns, 3 in red crates in the wreck spots, 4 on
platforms/islands/far coast; meter shows the count). `LevelDef.goal` is `{kind:'wreck',pct}` or
`{kind:'find',count}`. Bot handles find levels and hops onto low platforms.
v0.6 (deployed): parent feedback round 3. Slower, more skillful: mouse aim on desktop (Kase faces the
cursor; screams/poop go there), aim assist on touch, fewer random finds (thematic set per level, one
gift, no random drops), continents 70% bigger, more chickens in sizes. Scream-only glass and
poop-only statues with 🔊/💩 prompts. Wings = real flight (hold JUMP, fuel refilled by more wings,
glide when empty). New SKY level between N. America and S. America: floating islands, fans, wings
in the air, 5 golden eggs, boss = Duogringo's nest (grows with screams, lays mini-Duogringos, shrink
him to stun, then poop him). Duogringo no longer roams other levels. Boss fights differ: charge ring
(Rump, Khan, groups, Columbus), runner (Bolt laps a track, poop makes him slip), poop-cover (Jeff:
14 poops, screams do nothing), nest. Asia hunts fedoras (stacked on Kase's head). Giant mode throws
giant poops. `BossDef.fight` + `hint`; `LevelDef.sky`.
v0.6.1: sky uses an over-the-shoulder chase camera (input rotated by camera yaw in main.ts, camera
climbs over islands); other levels follow the baby's height. Air control 0.5, fan launches keep
momentum for 0.55 s, sky gravity 65%, fans on every island up to height 6.
v0.6.2: sky = real flight model (`updateFlight`): always airborne, stick x = turn (rate-limited,
smoothed), stick y = climb/dive with auto-level, JUMP = boost from wing pickups, mouse steers the
heading; chase camera looks ahead with an FOV kick on boost. Render interpolation (main snapshots
positions before each sim step, renderer lerps by `alpha`) removed the 60 Hz judder. Flying pose
tilts the walk model belly-down and banks. Globe shows the animated 3D baby on the chosen continent.
v0.7: feedback round 4. Globe title/chooser has 8 cloned Kases (SkeletonUtils) wandering and pooping
on each other. Milk bottles say rotating baby phrases (`BABY_TALK` in main.ts). Poop coverage on
creatures (`Npc.cover`): small ones freeze from one hit, big ones slow then freeze, stacks to 3, decays
0.05/s, brown blob + shiver. Sky flight is now hover: hold JUMP to lift, release to sink, stick moves as on
the ground, wings = boost fuel, land on islands; upright model; fixed-yaw follow camera that tracks
height; soft flap + procedural lullaby (`audio.music`). Touch attack buttons drag-to-aim (Brawl Stars
style), tap = auto-aim; aim arrow + dashed poop arc shown while holding. Evil baby target on every
continent's lake island: poop only, only from ≥7 units away, 5 hits, drops a clock.
Next: apply the controls memo (pending), distinct fights for Khan/animal groups/Columbus, chase goal,
Zzz nap bomb, decoy baby, boomerang binky, giraffe ride; sky level art (clouds) and tuning.
