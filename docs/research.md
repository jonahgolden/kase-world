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

## 2026-09-10 (late) — water levels, session length, enemy roles, touch controls

- Water levels are hated when controls go slow and floaty. The ones people love (DKC Tropical Freeze,
  Odyssey's Lake Kingdom) keep speed and responsiveness, use open spaces, and add a *different*
  propulsion idea instead of "slow walking underwater".
  ([NeoGAF thread](https://www.neogaf.com/threads/platformers-that-do-swimming-right.907088/),
  [ResetEra thread](https://www.resetera.com/threads/water-levels-in-platformers-are-they-ever-fun.2719/page-3),
  [GameMaker forum](https://forum.gamemaker.io/index.php?threads%2Fideas-about-making-water-levels-fun-in-platformers.34217%2F=))
  **→ Louie's water level: Kase floats in an inner tube at 0.95x ground speed, screams double as a
  jet (recoil pushes you backwards), islands to hop onto, no "underwater" at all.**
- Mobile sessions average 4–5 min; kids 6–8 are fine with longer if the game has clean chapter ends.
  Kids' games ship 6–10 bite-size mechanics of 30–120 s each. Length matters less than a clean stop.
  ([Udonis](https://www.blog.udonis.co/mobile-marketing/mobile-games/session-length),
  [CAS.AI kids design](https://cas.ai/blog/make-kids-mobile-games-they-love-to-play-variety-ux-monetization/),
  [JMH age guide](https://jmhdevelopers.com/guides/how-to-choose-age-appropriate-games/))
  **→ Levels at 2–3 min + boss are the right size. Keep the level card / result screen as the stop.**
- Enemies: a recognizable silhouette and a *different pattern* per enemy, not the same pattern with
  bigger numbers. Roles: rusher, turret, grabber, "doesn't react until poked".
  ([Seed of Life devlog](https://akela-morse.itch.io/seed-of-life/devlog/303588/making-enemies-that-are-engaging-and-fun-to-fight))
  **→ Kelly Jelly = slow drifting turret that stings on touch; flies = fast erratic rushers; Poodoom =
  stationary volcano hazard on a timer.**
- Touch: the joystick should re-center to where the thumb lands (Brawl Stars), keep a button "held"
  when the thumb drifts off it, allow direction changes without lifting, dead zone 3–5%.
  ([ACM study on virtual joysticks](https://dl.acm.org/doi/fullHtml/10.1145/3623264.3624461),
  [MDN mobile touch](https://developer.mozilla.org/en-US/docs/Games/Techniques/Control_mechanisms/Mobile_touch))
  **→ verify `src/input/input.ts` floats the stick to the touch point; if fixed, change it.**

## 2026-09-11 (early) — medals, iOS home screen, kids compete

- Medal thresholds: bronze = a clean run with one small mistake (1–3 tries), silver = clean and
  taking risks (2–5 tries), gold = perfect and fast (5+ tries). Missing a medal never fails the level.
  ([Steam guide on medal times](https://steamcommunity.com/sharedfiles/filedetails/?id=133079373),
  [TV Tropes: Time Trial](https://tvtropes.org/pmwiki/pmwiki.php/Main/TimeTrial))
  **→ per-level `par` (gold/silver/bronze ms) replaces the global 2/3/5 min thresholds.**
- iOS 26: every site added to the Home Screen opens as a web app; the manifest `display: standalone`,
  `start_url`, icons all work; `display: fullscreen` (status bar hidden) is not reliable on iPhone.
  Keep `apple-mobile-web-app-capable`; add a manifest and PNG icons (iOS ignores SVG icons).
  ([MobiLoud PWA on iOS 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios/),
  [OJapp iOS PWA guide](https://tips.ojapp.app/en/pwa-ios-2026-complete-guide/))
- Kids 10–13 in playtests lock in hardest when racing each other; a visible stopwatch was praised;
  they asked for reset buttons and speedrun-style levels. Social comparison beats solo scores.
  ([Playtesting with kids 1](https://askoldh.itch.io/project-c/devlog/940706/playtesting-with-kids-1),
  [Playtesting with kids 2](https://askoldh.itch.io/project-c/devlog/949192/playtesting-with-kids-2))
  **→ household board on the won screen: names used on this device get a 🏠 and a "beat X by N s"
  line, so Nova vs Louie vs Mom is the visible contest.**
- Family-friendly bosses (Kirby) test without stressing: readable telegraphs, one trick, no guide
  needed. ([gamedesignskills boss design](https://gamedesignskills.com/game-design/game-boss-design/))

## 2026-09-11 (timer pass 1) — kill sequence, hit-stop, wave pacing, chase beats, DDA, shake

- Kill sequence: the boss must *look* beaten (wounded, out of breath) and the game must say "you did it"
  before the results screen, or tension never releases. A short line from the boss works.
  ([Boss Battle Design and Structure](https://www.gamedeveloper.com/design/boss-battle-design-and-structure),
  [gamedesignskills boss design](https://gamedesignskills.com/game-design/game-boss-design/))
  **→ applied: every `BossDef` has a `beaten` line; `bossDead` toasts it before "DEFEATED!".**
- Hit-stop: 6 frames (100 ms) on heavy hits in Capcom beat-em-ups; heavier = longer.
  ([Hitstop in Capcom beat 'em ups](https://shane-sicienski.com/blog/blog-post-title-one-55pmn),
  [CritPoints on hitstop](https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/))
  Ours: boss hit 90 ms, boss dead 250 ms, smash 20–80 ms. In range; left alone.
- Tower-defense waves: a countdown/grace before wave 1, early waves slow (20–35 s to clear), staggered
  spawns as a "drumbeat", micro-narratives of cluster → breath → next.
  ([CraftMyGame wave system](https://craftmygame.com/features/wave-spawn),
  [Sean Duggan, TD flow](https://medium.com/@sean.duggan/tower-defense-general-gameplay-flow-529b317a8ef9))
  **→ applied: first thief at 6 s instead of 3, and the first two spawns toast "a thief is coming".**
- Chase beats: let the player feel safe, then throw something that slows them so the pursuer closes in.
  ([Outlast 2 chase design](https://www.gamedeveloper.com/audio/the-art-of-the-chase-level-design-and-player-orientation-in-i-outlast-2-i-),
  [TV Tropes auto-scroller](https://tvtropes.org/pmwiki/pmwiki.php/Main/AutoScrollingLevel))
  Ours: surges every 8 s with a 1 s rumble do this. Keep.
- Dynamic difficulty for kids: after repeated failure, quietly reduce pressure (fewer enemies, more
  checkpoints); assistance that goes unnoticed improves survival without hurting pride.
  ([IntechOpen DDA chapter](https://www.intechopen.com/chapters/1228576),
  [Wikipedia: dynamic difficulty](https://en.wikipedia.org/wiki/Dynamic_game_difficulty_balancing))
  **→ applied: each game over on a level adds one extra heart on the next try (max +2), reset on a clear.**
- Screen shake: trauma squared, nonlinear decay, 50–100 ms with a flash, small amplitudes for weak hits.
  ([Godot recipes: screen shake](https://kidscancode.org/godot_recipes/4.x/2d/screen_shake/index.html),
  [BetterLink game feel post](https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/))
  Ours already squares the shake value and decays it; fine.

## 2026-09-11 (timer pass 2) — rubber-banding, Katamari growth, onboarding, kid sound, knockback

- Rubber-banding is hated when it is a hidden speed cheat; accepted when the rival adapts through
  *visible behavior* and the player behind gets the help, never the leader. Wins must still feel earned.
  ([TV Tropes: Rubber-Band AI](https://tvtropes.org/pmwiki/pmwiki.php/Main/RubberBandAI),
  [Game AI Pro ch. 42, rubber-banding system](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter42_A_Rubber-Banding_System_for_Gameplay_and_Race_Management.pdf),
  [gamedesignskills: racing](https://gamedesignskills.com/game-design/racing/))
  **→ applied: when the pigeon is two gates ahead it stops to peck for 1.5 s every 4 s (a toast says so).
  Never speeds up against a leading player.**
- Katamari: growth must be continuous and *visible*, milestones change what you can do, the camera
  zooms out with size, and every pickup wiggles + clicks. ([Game Developer: Katamari's scale](https://www.gamedeveloper.com/design/analysis-how-i-katamari-i-s-scale-makes-you-high),
  [Mandeville breakdown](https://alexiamandeville.medium.com/game-design-breakdown-katamari-damacy-e3f927f9a392))
  **→ applied: snowball milestones BIG / HUGE / GIGANTIC with a popup and chime; the camera pulls back as
  the ball grows.**
- Onboarding: "how do I let them discover" not "how do I teach"; three escalating encounters per idea;
  no passive tutorial. ([Game Wisdom onboarding](https://game-wisdom.com/critical/onboarding-game-design),
  [Nintendo Life: Miyamoto & Trinen](https://www.nintendolife.com/news/2016/07/shigeru_miyamoto_and_bill_trinen_explain_some_of_the_key_principles_that_define_nintendo_games))
  Ours: the card + hint bar say the one rule; the rest is discovered. Keep. Watch in playtest whether the
  level-1 wreck goal teaches scream vs poop before the glass/statue prompts do.
- Kids' game audio: event-based cues, cheerful confirmation chimes, pitch/volume shape the feeling;
  repetition fatigue is real, so vary repeated sounds. ([gamedesignskills: sound](https://gamedesignskills.com/game-design/sound/),
  [Speequal: psychology of audio feedback](https://speequalgames.com/the-human-psychology-behind-game-auido-feedback/))
  **→ applied: smash, splat and prop-hit sounds get ±8% random pitch.**
- Knockback: separate force from duration, keep motion fluid with a small bounce-back on collision, low
  friction so nobody gets stuck. ([G2A: knockback](https://www.g2a.com/news/glossary/what-is-knockback-in-gaming-meaning-example-and-how-it-works-in-games/))
  **→ applied: the kangaroo bounces back a little when its punch lands, so bouts stay fluid.**
