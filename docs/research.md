# Research log

Dense notes with sources. Each section is dated. Findings that changed a number or a rule say so in
**→ applied**. Older memos (fun/juice, stack, level goals, arenas, flight, action controls) lived in
`~/.claude/TODO.md` and were lost; this file is the durable home now.

## 2026-09-10 — boss fights, telegraphs, juice, mini-games, chase

### Boss fights
- Signature move is the memory hook: players describe a boss by the one move they had to learn.
  Telegraphed move that takes ~3 attempts to learn = memorable. Teach *during* the fight.
  ([Boss Battles, Medium](https://medium.com/@foster_sawyer2/boss-battles-how-to-design-one-733c788e5494),
  [GDC Boss Up, Itay Keren](https://www.gdcvault.com/play/1024921/Boss-Up-Boss-Battle-Design))
- Readability over speed: punish bad timing, never bad visual design. Phases must be *different*, not
  just harder. Pattern over RNG. A fair death = "next time I dodge left", never "that was BS".
  ([itch.io: Designing the perfect boss battle](https://itch.io/blog/1024105/designing-the-perfect-boss-battle-a-game-developers-holy-grail.amp))
- Zelda model: repeat the procedure three times; the boss tests the tool taught in the level. Odyssey
  final boss = culmination of every mechanic. ([Boss-Design guide](https://kistofe.github.io/Boss-Design/),
  [Zelda Dungeon](https://www.zeldadungeon.net/how-to-design-your-ultimate-dungeon-boss/))
- Eight beats: build-up, reveal, business as usual, escalation, midpoint twist (false victory /
  transformation), all-out, kill sequence (boss visibly beaten, kneels), victory reward.
  ([Boss Battle Design and Structure, Game Developer](https://www.gamedeveloper.com/design/boss-battle-design-and-structure))
- Mistakes: HP scaling as difficulty, hidden requirements the game never states, breaking the game's
  own rules (immune to what worked elsewhere), too much randomness.
- Telegraph = wind-up animation + particle build-up + audio charge + optional voice callout. Stylized
  games can use multi-second wind-ups and still read fair.
  ([Enemy Attacks and Telegraphing](https://www.gamedeveloper.com/design/enemy-attacks-and-telegraphing))

**→ applied / to apply in Kase World**
- Every fight: one signature move, one verb that works, wrong verb gets a loud `bossBlocked` label.
- Three repetitions per phase (`hitsPerPhase: 3` already), phases change the *shape* not the numbers.
- Kill sequence: boss card kneels/wobbles, taunt flips to a whimper, then victory card. (todo, render)
- Never let a boss be immune to a verb without saying so on screen the first time it is tried.

### Speed ratios (chase feel)
- Chase feel is ratio-based, not absolute. Enemies slightly *slower* than the player let the player
  win by moving but get caught when they stop to act; enemies faster than the player only work with a
  short pursuit and a safe zone. Random speed bands (e.g. 0.55x–1.1x player) stop the player from
  kiting forever. ([Unity forum](https://forum.unity.com/threads/enemy-to-chase-player-at-same-speed-acceleration.225066/),
  [PekoeBlaze on chase sequences](https://pekoeblaze.wordpress.com/2022/06/18/how-horror-games-make-chase-sequences-suspenseful/))
- Current Kase World: player 4.2, adult chase 2.7 (0.64x), dog 3.8 (0.90x), mini 3.6 (0.86x),
  boss charge 9–13 (2.1x–3.1x, short bursts, telegraphed). Ratios are in the healthy band already;
  stampede (escape goal) should sit at ~1.15x so it *feels* faster but detours + fans let you keep ahead.

### Juice
- Vlambeer "Art of Screenshake": ~30 tricks. Hit-stop 60–80 ms on a destructive confirm, a few tenths
  of a degree of camera rotation reads as force, camera kick in the direction of the action, squash
  and stretch, permanence (debris stays), muzzle flash / white hit flash for a fraction of a second.
  ([Game feel on the web](https://valdemird.com/blog/game-feel-on-the-web/),
  [Dawnosaur 7 tricks](https://dawnosaur.substack.com/p/7-game-feel-tricks-to-improve-your),
  [Squeezing more juice](https://www.gamedeveloper.com/design/squeezing-more-juice-out-of-your-game-design-))
- Do not over-use rumble/shake; reserve the big ones for key moments (boss hit, phase change).

### Mini-games against a boss
- Mario Party: clear rules with hidden depth; 30-second stories ("I stole first with a well-timed
  shell") beat raw scores. Low luck. ([5 lessons from Mario Party](https://brandonthegamedev.com/5-lessons-from-mario-party-for-board-game-developers/),
  [TechRadar top minigames](https://www.techradar.com/news/super-mario-party-the-5-best-minigames-from-nintendos-ultimate-party-game))
- Sumo party games: one button, stay in the ring, push the other out, jiggly physics, matches under a
  minute. Ring-out is instantly readable on a phone. ([Sumo Party](https://poki.com/en/g/sumo-party))
- Chase/thief: thief wants his hideout, player wants the purse; drop-loot trails and a reachable
  hideout give the chase a clock. ([Earthdawn chase scenes](https://fasagames.com/earthdawn/chase-scenes/))

**→ decisions for the four new fights** (fit boss + continent, mix real fights and competitions)
- Genghis Khan (Asia): true fight, scream-only. Horse charges in straight lines; a scream in the cone
  spooks the horse mid-charge, throws him, he is exposed. Poop bounces off ("SCREAM THE HORSE!").
- African Animal Group: true fight, four cards at once, one weakness each. Lion = poop-cover,
  giraffe = scream-only (long neck, fedora-height), rhino = wall charge (Rump), elephant = bomb/potato
  only (spawns potatoes in the ring).
- Australian Animal Group: **Outback Games**, three short competitions in one ring: kangaroo boxing
  (sumo: push it out of the ring with screams before it pushes you out), emu dash (race it one lap,
  poop makes it trip), rockfish (find it, it is camouflaged, poop it). Devil (fourth animal in the
  drawing) heckles from the side.
- Columbus (Europe): **remix**. Three phases borrow Rump's charge, Bolt's laps and Jeff's cover; the
  arena spawns glass and statue gates so scream-only and poop-only both come back.

### Kids 8–15
- Nintendo: one primary action everything flows from, teach as you play, repeat what works, small
  element count combined many ways (1-1 uses nine elements). Design for adults and kids will enjoy it.
  ([NYFA on Nintendo](https://www.nyfa.edu/student-resources/nintendo-can-teach-us-game-design/),
  [Doan, designing for kids](https://medium.com/black-shell-media/gamedev-thoughts-how-to-design-games-for-kids-and-younger-audiences-1e6e96fd416a))
- Difficult, not punishing: failure costs seconds, not progress. ([Valério](https://ricardo-valerio.medium.com/make-it-difficult-not-punishing-7198334573b8))
