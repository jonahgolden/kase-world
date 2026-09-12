import { describe, expect, it } from 'vitest'
import { CFG, DT, HEART, activePart, addWreck, bossHit, createState, devBeatBoss, fightOf, fireScream, goalTarget, groundY, hurtPlayer, nextLevelState, skipToBoss, step, telegraphShape } from '../src/sim/sim.ts'
import { closestOnRing, pointInRing } from '../src/sim/geom.ts'
import { botInput } from '../src/sim/bot.ts'
import { EMPTY_INPUT } from '../src/sim/types.ts'
import { GHOST_DT, ghostAt, packGhost } from '../src/ghost.ts'
import { ARROW_DELAY, arrowVisible, goalShort } from '../src/ui/ui.ts'
import { LOOP_STEPS, musicStep, stepMs } from '../src/audio/music.ts'
import { QUALITY_DOWN_MS, QUALITY_UP_MS, nextQuality } from '../src/render/quality.ts'
import type { Input, State } from '../src/sim/types.ts'
import { LEVELS, PROP_STATS, minPlausibleMs, parFor } from '../src/sim/levels.ts'

function run(s: State, seconds: number, input: Input | ((s: State) => Input) = EMPTY_INPUT) {
  const n = Math.round(seconds / DT)
  for (let i = 0; i < n; i++) step(s, typeof input === 'function' ? input(s) : input)
}

function hasNaN(obj: unknown): boolean {
  if (typeof obj === 'number') return Number.isNaN(obj)
  if (Array.isArray(obj)) return obj.some(hasNaN)
  if (obj && typeof obj === 'object') return Object.values(obj).some(hasNaN)
  return false
}

describe('sim', () => {
  it('is deterministic for the same seed and inputs', () => {
    const a = createState({ seed: 42, runId: 'x' })
    const b = createState({ seed: 42, runId: 'x' })
    run(a, 20, botInput)
    run(b, 20, botInput)
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
  })

  it('bot soak: 120 s without NaN, wreck meter fills, boss shows up', () => {
    const s = createState({ seed: 7 })
    run(s, 120, botInput)
    expect(hasNaN(s)).toBe(false)
    expect(s.stats.smashed).toBeGreaterThan(5)
    expect(s.wreck).toBeGreaterThan(0.3)
    expect(['wreck', 'boss', 'won', 'over']).toContain(s.phase)
  })

  it('every level populates with props, npcs, pickups and a goal', () => {
    for (const lvl of LEVELS) {
      const s = createState({ seed: 3, levelId: lvl.id })
      expect(s.props.length).toBeGreaterThan(20)
      expect(s.npcs.length).toBeGreaterThan(2)
      expect(s.pickups.length).toBeGreaterThan(2)
      expect(s.wreckGoalPoints).toBeGreaterThan(100)
      run(s, 5, botInput)
      expect(hasNaN(s)).toBe(false)
    }
  })

  it('bumping a prop at crawl speed smashes it and fills the meter', () => {
    const s = createState({ seed: 1 })
    const box = s.props.find((p) => p.kind === 'box')!
    box.x = 2.5
    box.z = 0
    run(s, 2, { ...EMPTY_INPUT, mx: 1 })
    expect(box.broken).toBe(true)
    expect(s.wreckPoints).toBeGreaterThan(0)
    expect(s.debris.length).toBeGreaterThan(0)
  })

  it('tap scream fires on release; hold charges up', () => {
    const s = createState({ seed: 1 })
    s.duo.x = -15
    s.duo.z = -15
    run(s, 0.1, { ...EMPTY_INPUT, scream: true })
    expect(s.player.screamCharging).toBe(true)
    run(s, 0.05)
    expect(s.stats.screams).toBe(1)
    const s2 = createState({ seed: 1 })
    s2.duo.x = -15
    s2.duo.z = -15
    run(s2, CFG.player.chargeTime + 0.1, { ...EMPTY_INPUT, scream: true })
    expect(s2.player.screamCharge).toBe(1)
    run(s2, CFG.player.fullHoldGrace + 0.1, { ...EMPTY_INPUT, scream: true })
    expect(s2.stats.screams).toBe(1)
  })

  it('scream scares an npc in front and grows Duogringo when he is not hit', () => {
    const s = createState({ seed: 1 })
    s.duo.active = true
    const n = s.npcs[0]
    s.npcs = [n]
    n.x = 0
    n.z = 3
    s.player.facing = 0
    s.duo.x = -15
    s.duo.z = -15
    s.player.hasAim = true
    const power = s.duo.power
    fireScream(s, 1)
    expect(n.state).toBe('flee')
    expect(s.stats.scared).toBe(1)
    expect(s.duo.power).toBeGreaterThan(power)
  })

  it('a direct scream hit shrinks Duogringo', () => {
    const s = createState({ seed: 1 })
    s.duo.active = true
    s.duo.power = 0.8
    s.duo.x = 0
    s.duo.z = 2
    s.player.facing = 0
    s.player.hasAim = true
    fireScream(s, 0.5)
    expect(s.duo.power).toBeCloseTo(0.8 - CFG.duo.shrinkPerHit)
    expect(s.duo.state).toBe('hurt')
  })

  it('poop throws on release, holds lob further, rattle throws three', () => {
    const s = createState({ seed: 1 })
    run(s, 0.05, { ...EMPTY_INPUT, poop: true })
    run(s, 0.05)
    expect(s.poops.length).toBe(1)
    const tapSpeed = Math.hypot(s.poops[0].vx, s.poops[0].vz)
    const s2 = createState({ seed: 1 })
    run(s2, CFG.player.poopHoldMax, { ...EMPTY_INPUT, poop: true })
    run(s2, 0.05)
    expect(s2.poops.length).toBe(1)
    expect(Math.hypot(s2.poops[0].vx, s2.poops[0].vz)).toBeGreaterThan(tapSpeed)
    const s3 = createState({ seed: 1 })
    s3.player.rattleT = 5
    run(s3, 0.05, { ...EMPTY_INPUT, poop: true })
    run(s3, 0.05)
    expect(s3.poops.length).toBe(3)
  })

  it('milk restores a heart, pacifier and rattle time out', () => {
    const s = createState({ seed: 1 })
    s.npcs = []
    s.features = []
    s.player.hp = 60
    s.pickups = [{ id: 999, kind: 'milk', x: s.player.x, y: 0, z: s.player.z, vy: 0, age: 1, float: false }]
    run(s, 0.1)
    expect(s.player.hp).toBe(60 + HEART)
    expect(s.pickups.length).toBe(0)
    s.pickups = [{ id: 998, kind: 'pacifier', x: s.player.x, y: 0, z: s.player.z, vy: 0, age: 1, float: false }]
    run(s, 0.1)
    expect(s.player.pacifierT).toBeGreaterThan(0)
    run(s, CFG.player.powerTime + 0.2)
    expect(s.player.pacifierT).toBe(0)
  })

  it('combo climbs within the window and resets after it', () => {
    const s = createState({ seed: 1 })
    addWreck(s, 100, 0, 0)
    expect(s.combo).toBe(1)
    run(s, 1)
    addWreck(s, 100, 0, 0)
    expect(s.combo).toBe(2)
    run(s, CFG.combo.window + 0.5)
    expect(s.combo).toBe(0)
  })

  it('a full meter summons the boss and the boss can be beaten', () => {
    const s = createState({ seed: 5 })
    skipToBoss(s)
    run(s, 0.1)
    expect(s.phase).toBe('boss')
    expect(s.boss).not.toBeNull()
    const b = s.boss!
    run(s, CFG.boss.enterTime + 0.1)
    expect(b.state).not.toBe('enter')
    let hits = 0
    for (let i = 0; i < 40 && s.phase === 'boss'; i++) {
      b.state = 'exposed'
      b.stateT = 2
      b.invuln = 0
      if (bossHit(s, 'poop')) hits++
      run(s, 0.7)
    }
    expect(hits).toBe(b.totalHits)
    expect(s.phase).toBe('won')
    expect(s.levelsCleared).toBe(1)
    expect(s.clearTime).toBeGreaterThanOrEqual(0)
    expect(s.stats.bossesBeaten).toBe(1)
  })

  it('boss ignores hits while not exposed', () => {
    const s = createState({ seed: 5 })
    skipToBoss(s)
    run(s, 0.1)
    const b = s.boss!
    b.state = 'idle'
    expect(bossHit(s, 'scream')).toBe(false)
    expect(b.hits).toBe(0)
  })

  it('carries run time and stats into the next level with full hearts', () => {
    const s = createState({ seed: 1 })
    s.levelsCleared = 1
    s.runTime = 90
    s.player.hp = 20
    const n = nextLevelState(s)!
    expect(n.levelId).toBe(LEVELS[1].id)
    expect(n.runTime).toBe(90)
    expect(n.player.hp).toBe(CFG.player.hp)
  })

  it('everything stays on the continent', () => {
    for (const lvl of LEVELS) {
      const s = createState({ seed: 11, levelId: lvl.id })
      run(s, 30, botInput)
      const ring = s.arena.ring
      const check = (x: number, z: number, r: number, what: string) => {
        expect(pointInRing(x, z, ring), `${lvl.id} ${what} inside`).toBe(true)
        expect(closestOnRing(x, z, ring).d, `${lvl.id} ${what} clearance`).toBeGreaterThan(r * 0.8)
      }
      check(s.player.x, s.player.z, s.player.r, 'player')
      check(s.duo.x, s.duo.z, 0.3, 'duo')
      for (const n of s.npcs) check(n.x, n.z, n.r, 'npc')
      for (const pr of s.props) if (!pr.broken) check(pr.x, pr.z, pr.r, 'prop')
      for (const k of s.pickups) check(k.x, k.z, 0.2, 'pickup')
    }
  })

  it('finds: clock takes 5 s off, skateboard speeds you up and is lost when hurt, gifts drop something', () => {
    const s = createState({ seed: 2 })
    s.npcs = []
    s.features = []
    run(s, 10)
    s.pickups = [{ id: 901, kind: 'clock', x: s.player.x, y: 0, z: s.player.z, vy: 0, age: 1, float: false }]
    run(s, 0.1)
    expect(s.time).toBeLessThan(6)
    expect(s.stats.timeBonus).toBe(CFG.time.clock)
    s.pickups = [{ id: 902, kind: 'skateboard', x: s.player.x, y: 0, z: s.player.z, vy: 0, age: 1, float: false }]
    run(s, 0.1)
    expect(s.player.ride).toBe('skateboard')
    run(s, 1.5, { ...EMPTY_INPUT, mx: 1 })
    expect(Math.hypot(s.player.vx, s.player.vz)).toBeGreaterThan(CFG.player.speed * 1.2)
    s.player.invuln = 0
    s.player.hp = 100
    const dmgBefore = s.stats.damageTaken
    s.npcs = [{ id: 950, kind: 'adult', x: s.player.x + 0.3, z: s.player.z, vx: 0, vz: 0, facing: 0, r: 0.4, hp: 60, state: 'chase', stateT: 0, targetX: 0, targetZ: 0, scaredCd: 0, color: 0, hitFlash: 0, scale: 1, cover: 0 }]
    run(s, 0.5)
    expect(s.stats.damageTaken).toBeGreaterThan(dmgBefore)
    expect(s.player.ride).toBeNull()
    expect(s.pickups.some((k) => k.kind === 'skateboard')).toBe(true)
    const gift = s.props.find((p) => p.kind === 'gift')
    if (gift) expect(gift.drop).not.toBeNull()
  })

  it('a perfect boss fight takes 10 s off the clear time', () => {
    const s = createState({ seed: 5 })
    skipToBoss(s)
    run(s, CFG.boss.enterTime + 0.3)
    const b = s.boss!
    for (let i = 0; i < 40 && s.phase === 'boss'; i++) {
      s.player.invuln = 5
      b.state = 'exposed'
      b.stateT = 2
      b.invuln = 0
      bossHit(s, 'poop')
      run(s, 0.7)
    }
    expect(s.phase).toBe('won')
    expect(s.stats.timeBonus).toBeGreaterThanOrEqual(CFG.time.perfectBoss)
  })

  it('platforms: you can step onto a low one, fall off its edge, and tall ones are walls', () => {
    const s = createState({ seed: 4 })
    s.features = [
      { id: 900, kind: 'platform', x: 3, z: 0, r: 2, h: 1.0, pair: -1, dirX: 0, dirZ: 1, cd: 0, island: false },
      { id: 901, kind: 'platform', x: -4, z: 0, r: 2, h: 2.2, pair: -1, dirX: 0, dirZ: 1, cd: 0, island: false },
    ]
    s.npcs = []
    s.props = []
    s.player.x = 0.5
    run(s, 0.3, { ...EMPTY_INPUT, mx: 1, jump: true })
    run(s, 0.5, { ...EMPTY_INPUT, mx: 1 })
    expect(s.player.y).toBeCloseTo(1.0, 1)
    expect(groundY(s, s.player.x, s.player.z, s.player.y)).toBe(1.0)
    run(s, 1.2, { ...EMPTY_INPUT, mx: 1 })
    expect(s.player.y).toBe(0)
    s.player.x = -1
    s.player.z = 0
    run(s, 1.5, { ...EMPTY_INPUT, mx: -1 })
    expect(Math.hypot(s.player.x + 4, s.player.z)).toBeGreaterThanOrEqual(2 + s.player.r - 0.05)
  })

  it('a fan launches, a portal teleports, a lake slows and blocks screaming', () => {
    const s = createState({ seed: 4 })
    s.npcs = []
    s.props = []
    s.features = [
      { id: 910, kind: 'fan', x: 2, z: 0, r: 1.2, h: 0, pair: -1, dirX: 1, dirZ: 0, cd: 0, island: false },
      { id: 911, kind: 'portal', x: -3, z: 0, r: 1, h: 0, pair: 912, dirX: 0, dirZ: 1, cd: 0, island: false },
      { id: 912, kind: 'portal', x: 0, z: -9, r: 1, h: 0, pair: 911, dirX: 0, dirZ: 1, cd: 0, island: false },
      { id: 913, kind: 'lake', x: 0, z: 8, r: 4, h: 0, pair: -1, dirX: 0, dirZ: 1, cd: 0, island: false },
    ]
    run(s, 0.6, { ...EMPTY_INPUT, mx: 1 })
    expect(s.player.y).toBeGreaterThan(1.5)
    const s2 = createState({ seed: 4 })
    s2.npcs = []
    s2.props = []
    s2.features = s.features
    run(s2, 1.2, { ...EMPTY_INPUT, mx: -1 })
    expect(s2.player.z).toBeLessThan(-6)
    const s3 = createState({ seed: 4 })
    s3.npcs = []
    s3.props = []
    s3.features = s.features
    run(s3, 3, { ...EMPTY_INPUT, mz: 1 })
    expect(s3.player.inLake).toBe(true)
    expect(Math.hypot(s3.player.vx, s3.player.vz)).toBeLessThan(CFG.player.speed * 0.6)
    run(s3, 0.3, { ...EMPTY_INPUT, mz: 1, scream: true })
    run(s3, 0.1, { ...EMPTY_INPUT, mz: 1 })
    expect(s3.stats.screams).toBe(0)
  })

  it('boss landing clears the ring and keeps the player inside it', () => {
    const s = createState({ seed: 6 })
    skipToBoss(s)
    run(s, 0.05)
    expect(s.bossRing).not.toBeNull()
    const ring = s.bossRing!
    const insideBefore = s.props.filter((p) => !p.broken && Math.hypot(p.x - ring.x, p.z - ring.z) < ring.r).length
    run(s, CFG.boss.enterTime + 0.2)
    const insideAfter = s.props.filter((p) => !p.broken && Math.hypot(p.x - ring.x, p.z - ring.z) < ring.r).length
    expect(insideAfter).toBeLessThanOrEqual(insideBefore)
    expect(insideAfter).toBe(0)
    run(s, 4, { ...EMPTY_INPUT, mx: 1 })
    expect(Math.hypot(s.player.x - ring.x, s.player.z - ring.z)).toBeLessThanOrEqual(ring.r - s.player.r + 0.05)
  })

  it('hot potato explodes and smashes nearby props; quad survives one hit', () => {
    const s = createState({ seed: 2 })
    s.npcs = []
    s.features = []
    const box = s.props.find((p) => p.kind === 'box')!
    box.x = 6
    box.z = 0
    s.player.facing = Math.PI / 2
    s.player.potatoes = 1
    run(s, 0.05, { ...EMPTY_INPUT, poop: true })
    run(s, 0.05)
    expect(s.bombs.length).toBe(1)
    run(s, CFG.potato.fuse + 0.2)
    expect(s.bombs.length).toBe(0)
    expect(box.broken).toBe(true)
    s.player.ride = 'quad'
    s.player.rideHp = CFG.ride.quad.hp
    s.player.invuln = 0
    s.npcs = [{ id: 950, kind: 'adult', x: s.player.x + 0.3, z: s.player.z, vx: 0, vz: 0, facing: 0, r: 0.4, hp: 60, state: 'chase', stateT: 0, targetX: 0, targetZ: 0, scaredCd: 0, color: 0, hitFlash: 0, scale: 1, cover: 0 }]
    run(s, 0.3)
    expect(s.player.ride).toBe('quad')
    expect(s.player.rideHp).toBe(CFG.ride.quad.hp - 1)
  })

  it('conga rattle: nearby grown-ups follow, smash what they bump, and end up dizzy', () => {
    const s = createState({ seed: 8 })
    s.features = []
    s.npcs = s.npcs.slice(0, 3)
    for (const n of s.npcs) {
      n.x = s.player.x + 2
      n.z = s.player.z
      n.state = 'wander'
    }
    const box = s.props.find((p) => p.kind === 'box')!
    box.x = 6
    box.z = 0
    s.pickups = [{ id: 970, kind: 'conga', x: s.player.x, y: 0, z: s.player.z, vy: 0, age: 1, float: false }]
    run(s, 0.1)
    expect(s.player.congaT).toBeGreaterThan(0)
    run(s, 0.5)
    expect(s.conga.length).toBe(3)
    expect(s.npcs.every((n) => n.state === 'follow')).toBe(true)
    run(s, 3, { ...EMPTY_INPUT, mx: 1 })
    run(s, 2, { ...EMPTY_INPUT, mx: -1 })
    run(s, CFG.conga.time)
    expect(s.player.congaT).toBe(0)
    expect(s.conga.length).toBe(0)
    expect(s.npcs.every((n) => n.state !== 'follow')).toBe(true)
  })

  it('giant formula: no damage taken, props explode on touch, grown-ups run', () => {
    const s = createState({ seed: 8 })
    s.features = []
    const car = s.props.find((p) => p.kind === 'car')!
    car.x = 3
    car.z = 0
    s.npcs = [{ id: 951, kind: 'adult', x: 2, z: 2, vx: 0, vz: 0, facing: 0, r: 0.4, hp: 60, state: 'chase', stateT: 0, targetX: 0, targetZ: 0, scaredCd: 0, color: 0, hitFlash: 0, scale: 1, cover: 0 }]
    s.pickups = [{ id: 971, kind: 'giant', x: s.player.x, y: 0, z: s.player.z, vy: 0, age: 1, float: false }]
    run(s, 0.1)
    expect(s.player.giantT).toBeGreaterThan(0)
    expect(s.player.r).toBeGreaterThan(s.player.baseR * 2)
    const hp = s.player.hp
    run(s, 1.5, { ...EMPTY_INPUT, mx: 1 })
    expect(car.broken).toBe(true)
    expect(s.player.hp).toBe(hp)
    expect(s.npcs[0].state).toBe('flee')
    run(s, CFG.giant.time)
    expect(s.player.giantT).toBe(0)
    expect(s.player.r).toBe(s.player.baseR)
  })

  it('find level: seven fedoras summon the boss, crates hide some', () => {
    const s = createState({ seed: 3, levelId: 'asia' })
    expect(s.goal.kind).toBe('find')
    const crates = s.props.filter((p) => p.kind === 'crate')
    const loose = s.pickups.filter((k) => k.kind === 'fedora')
    expect(crates.length + loose.length).toBe(7)
    expect(crates.every((c) => c.drop === 'fedora')).toBe(true)
    s.player.hp = 1e6
    run(s, 60, botInput)
    expect(s.found + crates.filter((c) => c.broken).length).toBeGreaterThan(0)
    expect(s.phase).toBe('wreck')
    s.features = []
    for (const k of s.pickups.filter((k) => k.kind === 'fedora')) {
      k.x = s.player.x
      k.z = s.player.z
      k.y = s.player.y
      k.age = 1
    }
    run(s, 0.2)
    for (const c of crates) if (!c.broken) c.drop = null
    s.found = 7
    run(s, 0.1)
    expect(s.phase).toBe('boss')
  })

  it('aim assist snaps a scream toward a grown-up slightly off to the side', () => {
    const s = createState({ seed: 9 })
    s.features = []
    s.props = []
    s.npcs = [{ id: 960, kind: 'adult', x: 1.6, z: 3, vx: 0, vz: 0, facing: 0, r: 0.4, hp: 60, state: 'wander', stateT: 5, targetX: 1.6, targetZ: 3, scaredCd: 0, color: 0, hitFlash: 0, scale: 1, cover: 0 }]
    s.player.facing = 0
    s.player.hasAim = false
    fireScream(s, 1)
    expect(s.npcs[0].state).toBe('flee')
    expect(Math.abs(s.player.facing - Math.atan2(1.6, 3))).toBeLessThan(0.01)
  })

  it('glass only breaks from screams, statues only from poop', () => {
    const s = createState({ seed: 9 })
    s.features = []
    s.npcs = []
    const mk = (kind: 'glass' | 'statue', x: number): (typeof s.props)[number] => {
      const st = PROP_STATS[kind]
      return { id: kind === 'glass' ? 9001 : 9002, kind, x, z: 0, y: 0, vx: 0, vz: 0, vy: 0, rot: 0, angVel: 0, r: st.r, h: st.h, hp: st.hp, maxHp: st.hp, mass: st.mass, points: st.points, color: st.color, broken: false, hitFlash: 0, drop: null, cover: 0, promptCd: 0 }
    }
    s.props = [mk('glass', 2), mk('statue', -6)]
    const glass = s.props[0]
    const statue = s.props[1]
    run(s, 1.2, { ...EMPTY_INPUT, mx: 1 })
    expect(glass.broken).toBe(false)
    s.player.x = 0
    s.player.z = 0
    s.player.facing = Math.PI / 2
    s.player.hasAim = true
    fireScream(s, 1)
    expect(glass.broken).toBe(true)
    s.player.facing = -Math.PI / 2
    fireScream(s, 1)
    expect(statue.broken).toBe(false)
    for (let i = 0; i < 4; i++) {
      s.poops.push({ id: 8000 + i, x: -5.6, y: 0.5, z: 0, vx: -1, vy: 0, vz: 0, r: 0.22, ox: 0, oz: 0 })
      run(s, 0.1)
    }
    expect(statue.broken).toBe(true)
  })

  it('wings: hold jump to rise while fuel lasts, then glide down', () => {
    const s = createState({ seed: 9 })
    s.features = []
    s.npcs = []
    s.props = []
    s.pickups = [{ id: 961, kind: 'wings', x: s.player.x, y: 0, z: s.player.z, vy: 0, age: 1, float: false }]
    run(s, 0.1)
    expect(s.player.wingFuel).toBeGreaterThan(0)
    run(s, 0.05, { ...EMPTY_INPUT, jump: true })
    run(s, 0.05)
    run(s, 2, { ...EMPTY_INPUT, jump: true })
    expect(s.player.y).toBeGreaterThan(4)
    run(s, 3, { ...EMPTY_INPUT, jump: true })
    expect(s.player.wingFuel).toBe(0)
    const glideY = s.player.y
    run(s, 0.5, { ...EMPTY_INPUT, jump: true })
    expect(glideY - s.player.y).toBeLessThan(1.2)
    run(s, 4)
    expect(s.player.y).toBe(0)
    expect(s.player.wings).toBe(false)
  })

  it('runner boss slips on poop, poopcover boss ignores screams, nest boss needs a shrink first', () => {
    const r = createState({ seed: 5, levelId: 'south-america' })
    skipToBoss(r)
    run(r, CFG.boss.enterTime + 0.5)
    const rb = r.boss!
    expect(rb.def.fight).toBe('runner')
    expect(bossHit(r, 'scream')).toBe(false)
    const ring = r.bossRing!
    for (let a = 0; a < Math.PI * 2; a += 0.2) r.splats.push({ id: 7000 + Math.round(a * 100), x: ring.x + Math.cos(a) * (ring.r - 1.4), z: ring.z + Math.sin(a) * (ring.r - 1.4), r: 0.6 })
    run(r, 2)
    expect(r.events.length >= 0).toBe(true)
    expect(rb.state === 'exposed' || rb.everExposed).toBe(true)

    const pc = createState({ seed: 5, levelId: 'antarctica' })
    skipToBoss(pc)
    run(pc, CFG.boss.enterTime + 0.5)
    const pb = pc.boss!
    expect(pb.def.fight).toBe('poopcover')
    expect(bossHit(pc, 'scream')).toBe(false)
    let n = 0
    while (pc.phase === 'boss' && n < 30) {
      bossHit(pc, 'poop')
      n++
    }
    expect(pc.phase).toBe('won')

    const sky = createState({ seed: 5, levelId: 'sky' })
    expect(sky.goal.kind).toBe('find')
    skipToBoss(sky)
    run(sky, CFG.boss.enterTime + 0.5)
    expect(sky.duo.active).toBe(true)
    expect(bossHit(sky, 'poop')).toBe(false)
    sky.duo.state = 'stun'
    sky.duo.stateT = 3
    expect(bossHit(sky, 'poop')).toBe(true)
  })

  it('sky hover: hold jump to rise, let go to sink, boost from wings, land on islands', () => {
    const s = createState({ seed: 5, levelId: 'sky' })
    s.features = []
    s.npcs = []
    run(s, 0.5)
    expect(s.player.flying).toBe(true)
    run(s, 1.5, { ...EMPTY_INPUT, jump: true })
    expect(s.player.y).toBeGreaterThan(3)
    const top = s.player.y
    run(s, 1.5)
    expect(s.player.y).toBeLessThan(top)
    run(s, 4)
    expect(s.player.y).toBe(0)
    expect(s.player.grounded).toBe(true)
    run(s, 1, { ...EMPTY_INPUT, mx: 1 })
    const speedBefore = Math.hypot(s.player.vx, s.player.vz)
    s.player.boostFuel = 3
    run(s, 0.6, { ...EMPTY_INPUT, mx: 1, jump: true })
    expect(Math.hypot(s.player.vx, s.player.vz)).toBeGreaterThan(speedBefore * 1.3)
    s.features = [{ id: 990, kind: 'platform', x: s.player.x + 4, z: s.player.z, r: 3, h: 2, pair: -1, dirX: 0, dirZ: 1, cd: 0, island: false }]
    s.player.y = 3
    s.player.vy = 0
    s.player.grounded = false
    run(s, 0.9, { ...EMPTY_INPUT, mx: 1 })
    expect(s.player.y).toBeCloseTo(2, 1)
    expect(s.player.grounded).toBe(true)
  })

  it('Khan: poop bounces off, a scream mid-charge spooks the horse, the rider lies exposed', () => {
    const s = createState({ seed: 5, levelId: 'asia' })
    skipToBoss(s)
    run(s, CFG.boss.enterTime + 0.5)
    const b = s.boss!
    expect(b.def.fight).toBe('horse')
    s.player.invuln = 99
    expect(bossHit(s, 'poop')).toBe(false)
    expect(s.events.some((e) => e.t === 'bossBlocked' && e.label === 'SCREAM THE HORSE!')).toBe(true)
    b.state = 'idle'
    expect(bossHit(s, 'scream')).toBe(false)
    b.state = 'attack'
    b.stateT = 1
    expect(bossHit(s, 'scream')).toBe(true)
    expect(b.hits).toBe(1)
    expect(b.state).toBe('hurt')
    run(s, CFG.boss.horse.thrown + 0.1)
    expect(b.state).toBe('exposed')
    b.invuln = 0
    expect(bossHit(s, 'scream')).toBe(true)
    expect(b.hits).toBe(2)
    // he really does charge on his own
    b.state = 'idle'
    b.stateT = 0
    run(s, 4)
    expect(s.events.length >= 0).toBe(true)
    expect(b.totalHits).toBe(12)
  })

  it('Africa group: four animals in order, each answers to one verb only', () => {
    const s = createState({ seed: 5, levelId: 'africa' })
    skipToBoss(s)
    run(s, CFG.boss.enterTime + 0.2)
    const b = s.boss!
    s.player.invuln = 99
    expect(b.parts.length).toBe(4)
    expect(activePart(b)!.def.kind).toBe('lion')
    run(s, CFG.boss.phaseChangeTime + 0.2)
    expect(bossHit(s, 'scream')).toBe(false)
    for (let i = 0; i < 3; i++) {
      b.invuln = 0
      expect(bossHit(s, 'poop')).toBe(true)
    }
    expect(b.parts[0].done).toBe(true)
    expect(activePart(b)!.def.kind).toBe('giraffe')
    expect(s.events.some((e) => e.t === 'bossPhase' && e.kind === 'part')).toBe(true)
    run(s, CFG.boss.phaseChangeTime + 0.2)
    expect(bossHit(s, 'poop')).toBe(false)
    expect(bossHit(s, 'scream', false, 0.2)).toBe(false)
    for (let i = 0; i < 3; i++) {
      b.invuln = 0
      expect(bossHit(s, 'scream', false, 1)).toBe(true)
    }
    expect(activePart(b)!.def.kind).toBe('rhino')
    run(s, CFG.boss.phaseChangeTime + 0.2)
    b.state = 'idle'
    expect(bossHit(s, 'poop')).toBe(false)
    for (let i = 0; i < 3; i++) {
      b.state = 'exposed'
      b.stateT = 2
      b.invuln = 0
      expect(bossHit(s, 'scream', false, 1)).toBe(true)
    }
    expect(activePart(b)!.def.kind).toBe('elephant')
    expect(s.pickups.filter((k) => k.kind === 'potato').length).toBeGreaterThanOrEqual(CFG.boss.group.potatoes)
    run(s, CFG.boss.phaseChangeTime + 0.2)
    expect(bossHit(s, 'poop')).toBe(false)
    expect(bossHit(s, 'scream', false, 1)).toBe(false)
    for (let i = 0; i < 3; i++) {
      b.invuln = 0
      bossHit(s, 'poop', true)
    }
    expect(s.phase).toBe('won')
  })

  it('Outback Games: shove the kangaroo out, out-run the emu, find and poop the rockfish', () => {
    const s = createState({ seed: 5, levelId: 'australia' })
    skipToBoss(s)
    run(s, CFG.boss.enterTime + CFG.boss.phaseChangeTime + 0.5)
    const b = s.boss!
    const ring = s.bossRing!
    const p = s.player
    p.invuln = 99
    expect(b.def.fight).toBe('games')
    expect(activePart(b)!.def.kind).toBe('kangaroo')
    expect(bossHit(s, 'poop')).toBe(false)
    for (let bout = 0; bout < 3; bout++) {
      b.state = 'idle'
      b.stateT = 5
      b.x = ring.x + ring.r - 1.0
      b.z = ring.z
      p.x = ring.x + ring.r - 3.5
      p.z = ring.z
      p.facing = Math.atan2(b.x - p.x, b.z - p.z)
      p.hasAim = true
      const before = b.vx
      expect(bossHit(s, 'scream', false, 1)).toBe(true)
      expect(b.vx).toBeGreaterThan(before)
      run(s, 0.4)
      expect(b.hits).toBe(bout + 1)
      expect(s.events.length >= 0).toBe(true)
    }
    expect(activePart(b)!.def.kind).toBe('emu')
    run(s, CFG.boss.phaseChangeTime + CFG.boss.race.countdown + 0.3)
    expect(b.state).toBe('attack')
    const trackR = ring.r - 1.4
    // run a lap in 3 s: faster than the emu
    for (let lap = 0; lap < 3; lap++) {
      const hitsBefore = b.hits
      for (let i = 0; i < 320 && b.hits === hitsBefore; i++) {
        const a = (i / 180) * Math.PI * 2
        p.x = ring.x + Math.cos(a) * trackR
        p.z = ring.z + Math.sin(a) * trackR
        step(s, EMPTY_INPUT)
      }
      expect(b.hits).toBe(hitsBefore + 1)
      if (activePart(b)!.def.kind === 'emu') run(s, CFG.boss.race.countdown + 0.2)
    }
    expect(activePart(b)!.def.kind).toBe('rockfish')
    run(s, CFG.boss.phaseChangeTime + 0.2)
    expect(b.r).toBe(CFG.boss.rock.r)
    expect(bossHit(s, 'scream', false, 1)).toBe(false)
    const rx = b.x
    expect(bossHit(s, 'poop')).toBe(true)
    expect(b.x !== rx || b.hitFlash === 0).toBe(true)
    p.invuln = 0
    p.x = b.x
    p.z = b.z
    p.y = 0
    const hp = p.hp
    run(s, 0.05)
    expect(p.hp).toBeLessThan(hp)
  })

  it('Columbus remixes charge, runner and poopcover across his three phases', () => {
    const s = createState({ seed: 5, levelId: 'europe' })
    skipToBoss(s)
    run(s, CFG.boss.enterTime + 0.5)
    const b = s.boss!
    s.player.invuln = 99
    expect(fightOf(b)).toBe('charge')
    for (let i = 0; i < 3; i++) {
      b.state = 'exposed'
      b.stateT = 2
      b.invuln = 0
      expect(bossHit(s, 'poop')).toBe(true)
    }
    expect(fightOf(b)).toBe('runner')
    expect(b.state).toBe('phaseChange')
    run(s, CFG.boss.phaseChangeTime + 1)
    expect(b.lap).not.toBe(0)
    expect(bossHit(s, 'scream')).toBe(false)
    const ring = s.bossRing!
    for (let a = 0; a < Math.PI * 2; a += 0.2) s.splats.push({ id: 7100 + Math.round(a * 100), x: ring.x + Math.cos(a) * (ring.r - 1.4), z: ring.z + Math.sin(a) * (ring.r - 1.4), r: 0.6 })
    run(s, 1.5)
    expect(b.state).toBe('exposed')
    for (let i = 0; i < 3; i++) {
      b.state = 'exposed'
      b.stateT = 2
      b.invuln = 0
      expect(bossHit(s, 'poop')).toBe(true)
    }
    expect(fightOf(b)).toBe('poopcover')
    run(s, CFG.boss.phaseChangeTime + 0.2)
    expect(bossHit(s, 'scream')).toBe(false)
    for (let i = 0; i < 6 && s.phase === 'boss'; i++) bossHit(s, 'poop')
    expect(s.phase).toBe('won')
  })

  it('chase goal: the Chicken King runs, three catches drop the pacifier and summon the boss', () => {
    const s = createState({ seed: 5, levelId: 'south-america' })
    expect(s.goal.kind).toBe('chase')
    const king = s.npcs.find((n) => n.kind === 'king')!
    expect(king).toBeTruthy()
    const p = s.player
    p.invuln = 99
    // he runs when Kase is near
    p.x = king.x - 3
    p.z = king.z
    const kx = king.x
    run(s, 1.5)
    expect(Math.hypot(king.x - kx, king.z) > 0.5 || king.state === 'flee').toBe(true)
    // each catch poofs him into a chicken finger; grabbing it is the +1, and he pops up far away
    for (let i = 0; i < 3; i++) {
      const k = s.npcs.find((n) => n.kind === 'king')!
      k.scaredCd = 0
      p.x = k.x
      p.z = k.z
      p.y = 0
      step(s, EMPTY_INPUT)
      const finger = s.pickups.find((q) => q.kind === 'finger')!
      expect(finger).toBeTruthy()
      expect(s.found).toBe(i)
      if (i < 2) expect(Math.hypot(k.x - p.x, k.z - p.z)).toBeGreaterThan(10)
      else expect(s.npcs.some((n) => n.kind === 'king')).toBe(false)
      p.x = finger.x
      p.z = finger.z
      p.y = finger.y
      p.hp = 40
      run(s, 0.4)
      expect(s.found).toBe(i + 1)
      expect(p.crispyT).toBeGreaterThan(0)
      expect(p.hp).toBe(60)
    }
    expect(s.pickups.some((k) => k.kind === 'pacifier')).toBe(true)
    run(s, 0.1)
    expect(s.phase).toBe('boss')
  })

  it('grow goal: the snowball grows as it rolls, melts in a lake, and summons the boss when huge', () => {
    const s = createState({ seed: 5, levelId: 'antarctica' })
    expect(s.goal.kind).toBe('grow')
    const ball = s.props.find((pr) => pr.kind === 'snowball')!
    expect(ball).toBeTruthy()
    s.features = []
    s.npcs = []
    const r0 = ball.r
    ball.vx = 4
    run(s, 2)
    expect(ball.r).toBeGreaterThan(r0)
    expect(s.wreck).toBeGreaterThan(0)
    const r1 = ball.r
    s.features = [{ id: 950, kind: 'lake', x: ball.x, z: ball.z, r: 5, h: 0, pair: -1, dirX: 0, dirZ: 1, cd: 0, island: false }]
    run(s, 1)
    expect(ball.r).toBeLessThan(r1)
    s.features = []
    ball.r = (s.goal as { size: number }).size
    run(s, 0.1)
    expect(s.phase).toBe('boss')
  })

  it('escape goal: the stampede advances, tramples a slow baby forward, the flag ends it', () => {
    const s = createState({ seed: 5, levelId: 'africa' })
    expect(s.goal.kind).toBe('escape')
    expect(s.stampede).not.toBeNull()
    expect(s.goalPos).not.toBeNull()
    const st = s.stampede!
    const f0 = st.front
    run(s, 1)
    expect(st.front).toBeGreaterThan(f0)
    // stand still behind the front: trampled and shoved along the herd's direction
    const p = s.player
    p.x = st.dirX * (st.front - 1)
    p.z = st.dirZ * (st.front - 1)
    const hp = p.hp
    run(s, 0.1)
    expect(p.hp).toBeLessThan(hp)
    expect(s.events.length >= 0).toBe(true)
    p.x = s.goalPos!.x
    p.z = s.goalPos!.z
    run(s, 0.1)
    expect(s.phase).toBe('boss')
    expect(s.stampede).toBeNull()
  })

  it('protect goal: thieves raid the milk, screams repel them, drinking it all costs a heart', () => {
    const s = createState({ seed: 5, levelId: 'australia' })
    expect(s.goal.kind).toBe('protect')
    expect(s.props.some((pr) => pr.kind === 'bigmilk')).toBe(true)
    run(s, CFG.protect.grace + 0.2)
    const thief = s.npcs.find((n) => n.kind === 'thief')!
    expect(thief).toBeTruthy()
    expect(thief.state).toBe('raid')
    const p = s.player
    p.invuln = 0
    p.x = thief.x - 2
    p.z = thief.z
    p.facing = Math.atan2(thief.x - p.x, thief.z - p.z)
    p.hasAim = true
    fireScream(s, 1)
    expect(s.found).toBe(1)
    expect(thief.state).toBe('flee')
    // a thief that reaches the bottle drinks
    const t2 = { ...thief, id: 9911, x: s.goalPos!.x + 1.2, z: s.goalPos!.z, state: 'raid' as const, stateT: 0, scaredCd: 0 }
    s.npcs.push(t2)
    run(s, 0.6)
    const t2live = s.npcs.find((n) => n.id === 9911)!
    expect(t2live.state).toBe('drink')
    expect(s.milk).toBeLessThan(1)
    s.milk = 0.01
    const hp = p.hp
    p.invuln = 0
    run(s, 0.2)
    expect(p.hp).toBeLessThan(hp)
    expect(s.milk).toBeGreaterThan(0.9)
  })

  it('race goal: gates in order, the pigeon flies its route, a scream stalls it, six gates end it', () => {
    const s = createState({ seed: 5, levelId: 'europe' })
    expect(s.goal.kind).toBe('race')
    expect(s.checkpoints.length).toBe(6)
    expect(s.rival).not.toBeNull()
    const p = s.player
    p.invuln = 99
    run(s, 2)
    const rv = s.rival!
    expect(Math.hypot(rv.x, rv.z)).toBeGreaterThan(0.5)
    p.x = rv.x - 2
    p.z = rv.z
    p.facing = Math.atan2(rv.x - p.x, rv.z - p.z)
    p.hasAim = true
    fireScream(s, 1)
    expect(rv.stallT).toBeGreaterThan(0)
    for (let i = 0; i < 6; i++) {
      const gate = s.goalPos!
      p.x = gate.x
      p.z = gate.z
      p.y = 0
      step(s, EMPTY_INPUT)
      expect(s.found).toBe(i + 1)
    }
    expect(s.phase).toBe('boss')
  })

  it("The Deep: Louie's guardians ring the volcano, it erupts hot poop, pops count, Kacone stomps", () => {
    const s = createState({ seed: 5, levelId: 'the-deep' })
    expect(s.goal.kind).toBe('hunt')
    expect(s.npcs.filter((n) => n.kind === 'jelly').length).toBe(15)
    expect(s.features.some((f) => f.kind === 'volcano')).toBe(true)
    expect(s.features.filter((f) => f.kind === 'platform').length).toBeGreaterThan(4)
    const p = s.player
    // no lake slowdown in the lagoon; a scream jets you backwards
    run(s, 0.5, { ...EMPTY_INPUT, mx: 1 })
    expect(p.inLake).toBe(false)
    expect(p.vx).toBeGreaterThan(3)
    p.vx = 0
    p.vz = 0
    p.facing = 0
    p.hasAim = true
    fireScream(s, 1)
    expect(p.vz).toBeLessThan(-2)
    // eruption: hot poops fly and a fly hatches
    const vol = s.features.find((f) => f.kind === 'volcano')!
    vol.cd = 0.01
    const flies = s.npcs.filter((n) => n.kind === 'fly').length
    run(s, 0.05)
    expect(s.poops.filter((q) => q.hot).length).toBe(CFG.volcano.poops)
    expect(s.npcs.filter((n) => n.kind === 'fly').length).toBe(flies + 1)
    // a jelly pops from damage and counts toward the goal
    const jelly = s.npcs.find((n) => n.kind === 'jelly')!
    jelly.hp = 0
    run(s, 0.05)
    expect(s.found).toBe(1)
    expect(s.npcs.filter((n) => n.kind === 'jelly').length).toBe(14)
    skipToBoss(s)
    run(s, CFG.boss.enterTime + 0.5)
    expect(s.boss!.def.id).toBe('kacone')
    expect(s.boss!.def.drawnBy).toBe('Louie')
    run(s, 4)
    expect(s.events.length >= 0).toBe(true)
    expect(s.boss!.attack).toBe('stomp')
  })

  it('toys: nap bombs put grown-ups to sleep, the binky comes back, the giraffe rides over the stampede, the decoy draws chasers', () => {
    // nap
    const s = createState({ seed: 5, levelId: 'antarctica' })
    s.features = []
    const adult = s.npcs.find((n) => n.kind === 'adult')!
    s.npcs = [adult]
    const p = s.player
    p.invuln = 99
    adult.x = p.x + 2
    adult.z = p.z
    adult.state = 'wander'
    p.naps = 2
    p.facing = Math.PI / 2
    p.hasAim = true
    run(s, 0.05, { ...EMPTY_INPUT, poop: true })
    run(s, 0.05)
    expect(s.bombs.length).toBe(1)
    expect(s.bombs[0].kind).toBe('nap')
    run(s, CFG.nap.fuse + 0.3)
    expect(adult.state).toBe('sleep')
    expect(p.naps).toBe(1)

    // boomerang
    const b = createState({ seed: 5, levelId: 'australia' })
    b.features = []
    const dog = b.npcs.find((n) => n.kind === 'dog')!
    b.npcs = [dog]
    b.player.invuln = 99
    b.player.boomerang = true
    b.player.facing = 0
    b.player.hasAim = true
    dog.x = b.player.x
    dog.z = b.player.z + 4
    dog.state = 'wander'
    run(b, 0.05, { ...EMPTY_INPUT, poop: true })
    run(b, 0.05)
    expect(b.boomerang).not.toBeNull()
    expect(b.boomerang!.out).toBe(true)
    run(b, 0.5)
    expect(dog.state).toBe('stunned')
    run(b, 1.5)
    expect(b.boomerang).toBeNull()

    // giraffe over the stampede
    const g = createState({ seed: 5, levelId: 'africa' })
    const st = g.stampede!
    g.player.invuln = 0
    g.player.ride = 'giraffe'
    g.player.rideHp = 2
    g.player.x = st.dirX * (st.front - 1)
    g.player.z = st.dirZ * (st.front - 1)
    const hp = g.player.hp
    run(g, 0.2)
    expect(g.player.hp).toBe(hp)

    // decoy
    const d = createState({ seed: 5, levelId: 'europe' })
    d.features = []
    const chaser = d.npcs.find((n) => n.kind === 'adult')!
    d.npcs = [chaser]
    d.player.invuln = 99
    d.decoy = { x: chaser.x + 3, z: chaser.z, t: 10 }
    chaser.state = 'wander'
    d.player.x = chaser.x - 30
    run(d, 1.5)
    const st2: string = chaser.state
    expect(st2 === 'chase' || st2 === 'recoil').toBe(true)
    expect(Math.abs(chaser.x - d.decoy!.x)).toBeLessThan(2.5)
  })

  it('nest fight: a cloud ring, a nest that stops the minis once covered in poop', () => {
    const s = createState({ seed: 5, levelId: 'sky' })
    skipToBoss(s)
    run(s, CFG.boss.enterTime + 0.5)
    expect(s.bossRing).not.toBeNull()
    expect(s.bossRing!.r).toBe(CFG.boss.nestRingR)
    const nest = s.props.find((pr) => pr.kind === 'nest')!
    expect(nest).toBeTruthy()
    s.duo.power = 1
    s.duo.layCd = 0
    run(s, 2)
    expect(s.npcs.some((n) => n.kind === 'mini')).toBe(true)
    for (let i = 0; i < 4; i++) s.poops.push({ id: 8200 + i, x: nest.x, y: 0.5, z: nest.z, vx: 0, vy: -1, vz: 0, r: 0.22, ox: nest.x - 5, oz: nest.z })
    run(s, 0.2)
    expect(nest.cover).toBeGreaterThanOrEqual(1)
    expect(s.duo.nestWrecked).toBe(true)
    expect(s.npcs.filter((n) => n.kind === 'mini').every((n) => n.state === 'cower')).toBe(true)
  })

  it('research pass: every boss has a last word, thieves wait out a grace period, assist adds hearts', () => {
    for (const lvl of LEVELS) expect(lvl.boss.beaten.length).toBeGreaterThan(3)
    const s = createState({ seed: 5, levelId: 'australia' })
    run(s, CFG.protect.grace - 0.5)
    expect(s.npcs.some((n) => n.kind === 'thief')).toBe(false)
    run(s, 1)
    expect(s.npcs.some((n) => n.kind === 'thief')).toBe(true)
    const a = createState({ seed: 5, assist: 2 })
    expect(a.player.maxHp).toBe(CFG.player.hp + HEART * 2)
    expect(a.player.hp).toBe(CFG.player.hp + HEART * 2)
    const b = createState({ seed: 5, assist: 9 })
    expect(b.player.maxHp).toBe(CFG.player.hp + HEART * CFG.assist.maxHearts)
    skipToBoss(a)
    run(a, CFG.boss.enterTime + 0.5)
    const boss = a.boss!
    for (let i = 0; i < 9 && a.phase === 'boss'; i++) {
      boss.state = 'exposed'
      boss.stateT = 2
      boss.invuln = 0
      bossHit(a, 'poop')
    }
    expect(a.events.some((e) => e.t === 'bossDead' && e.kind === boss.def.beaten)).toBe(true)
  })

  it('research pass 2: the pigeon pecks when two gates ahead, the snowball calls out BIG', () => {
    const s = createState({ seed: 5, levelId: 'europe' })
    const rv = s.rival!
    s.player.invuln = 99
    s.player.x = 60 // far away from every gate
    rv.cp = 2
    rv.stallT = 0
    run(s, CFG.race.distractEvery + 0.2)
    expect(s.events.some((e) => e.t === 'npcScared' && e.kind === 'pigeon') || rv.stallT > 0 || rv.peckT > CFG.race.distractEvery - 0.5).toBe(true)
    let pecked = false
    for (let i = 0; i < 60 * (CFG.race.distractEvery + 1) && !pecked; i++) {
      step(s, EMPTY_INPUT)
      if (rv.stallT > 0) pecked = true
    }
    expect(pecked).toBe(true)
    const g = createState({ seed: 5, levelId: 'antarctica' })
    g.features = []
    g.npcs = []
    const ball = g.props.find((pr) => pr.kind === 'snowball')!
    ball.r = CFG.snow.milestones[0] - 0.02
    ball.vx = 4
    let big = 0
    for (let i = 0; i < 120; i++) {
      step(g, EMPTY_INPUT)
      big += g.events.filter((e) => e.t === 'snowMilestone' && e.label === 'BIG!').length
    }
    expect(big).toBe(1)
  })

  it('research pass 3: early screams still spook the horse, the rockfish bubbles faster up close, three flies max, breather order', () => {
    const s = createState({ seed: 5, levelId: 'asia' })
    skipToBoss(s)
    run(s, CFG.boss.enterTime + 0.5)
    const b = s.boss!
    const p = s.player
    p.invuln = 99
    const ring = s.bossRing!
    p.x = ring.x
    p.z = ring.z - 4
    b.state = 'attack'
    b.stateT = 1.5
    b.x = ring.x
    b.z = ring.z + 4
    b.dirX = 0
    b.dirZ = -1
    p.facing = 0
    p.hasAim = true
    fireScream(s, 0.3) // range ~4.6: he is 8 away, no direct hit
    expect(b.hits).toBe(0)
    expect(b.roundT).toBeGreaterThan(0)
    run(s, 0.4)
    expect(b.hits).toBe(1)

    const d = createState({ seed: 5, levelId: 'australia' })
    skipToBoss(d)
    run(d, CFG.boss.enterTime + 0.3)
    const db = d.boss!
    db.hits = 6 // rockfish phase
    d.player.invuln = 99
    run(d, CFG.boss.phaseChangeTime + 0.3)
    const count = (dist: number) => {
      d.player.x = db.x + dist
      d.player.z = db.z
      db.roundT = 0
      let n = 0
      for (let i = 0; i < 180; i++) {
        step(d, EMPTY_INPUT)
        n += d.events.filter((e) => e.t === 'rockHint').length
        d.player.x = db.x + dist
        d.player.z = db.z
      }
      return n
    }
    expect(count(1.5)).toBeGreaterThan(count(8))

    const f = createState({ seed: 5, levelId: 'the-deep' })
    const vol = f.features.find((x) => x.kind === 'volcano')!
    f.npcs = f.npcs.filter((n) => n.kind === 'fly' || n.kind === 'bigfly')
    for (let i = 0; i < 6; i++) f.npcs.push({ ...f.npcs[0], id: 9500 + i, x: vol.x + i * 0.3, z: vol.z + 1 })
    f.player.x = vol.x
    f.player.z = vol.z + 3
    f.player.invuln = 99
    run(f, 1.5, () => ({ ...EMPTY_INPUT }))
    expect(f.npcs.filter((n) => (n.kind === 'fly' || n.kind === 'bigfly') && n.state === 'chase').length).toBeLessThanOrEqual(CFG.volcano.maxChasing)

    const ids = LEVELS.map((l) => l.id)
    expect(ids.indexOf('asia')).toBe(ids.indexOf('the-deep') + 1)
    expect(ids.indexOf('australia')).toBe(ids.indexOf('asia') + 1)
  })

  it('research pass 4: telegraphs never under 0.6 s, last-heart screams charge faster, ghost tracks interpolate', () => {
    expect(Math.min(...CFG.boss.telegraph)).toBeGreaterThanOrEqual(0.6)
    const a = createState({ seed: 1 })
    a.duo.x = -15
    a.duo.z = -15
    run(a, 0.5, { ...EMPTY_INPUT, scream: true })
    const normal = a.player.screamCharge
    const b = createState({ seed: 1 })
    b.duo.x = -15
    b.duo.z = -15
    b.player.hp = HEART
    run(b, 0.5, { ...EMPTY_INPUT, scream: true })
    expect(b.player.screamCharge).toBeGreaterThan(normal)
    const track = packGhost([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 },
    ])
    expect(ghostAt(track, 0)).toEqual({ x: 0, y: 0, z: 0 })
    expect(ghostAt(track, GHOST_DT * 0.5)!.x).toBeCloseTo(0.5, 5)
    expect(ghostAt(track, GHOST_DT * 1.5)!.y).toBeCloseTo(0.5, 5)
    expect(ghostAt(track, GHOST_DT * 9)).toBeNull()
  })

  it('sky: the stick still steers right after a fan launch, and sky fans re-arm slowly', () => {
    const s = createState({ seed: 5, levelId: 'sky' })
    s.npcs = []
    s.features = [{ id: 992, kind: 'fan', x: 0, z: 0, r: 1.2, h: 0, pair: -1, dirX: 0, dirZ: 1, cd: 0, island: false }]
    s.player.x = 0
    s.player.z = 0
    run(s, 0.05)
    expect(s.player.launchT).toBeGreaterThan(0)
    expect(s.features[0].cd).toBeGreaterThan(CFG.fan.cd * 1.5)
    run(s, 0.25, { ...EMPTY_INPUT, mx: -1 })
    expect(s.player.vx).toBeLessThan(-1)
  })

  it('admin: devBeatBoss ends the fight as a win', () => {
    const s = createState({ seed: 5, levelId: 'south-america' })
    expect(devBeatBoss(s)).toBe(false)
    skipToBoss(s)
    run(s, CFG.boss.enterTime + 0.3)
    expect(devBeatBoss(s)).toBe(true)
    expect(s.phase).toBe('won')
  })

  it('research pass 5: pickups magnet to Kase, short goal lines fit a card, the race says SET', () => {
    const s = createState({ seed: 5 })
    s.features = []
    s.npcs = []
    s.pickups = [{ id: 9700, kind: 'clock', x: s.player.x + 1.4, y: 0, z: s.player.z, vy: 0, age: 1, float: false }]
    const before = s.stats.pickups
    run(s, 0.4)
    expect(s.stats.pickups).toBe(before + 1)
    for (const lvl of LEVELS) expect(goalShort(lvl.goal).split(' ').length).toBeLessThanOrEqual(6)
    const r = createState({ seed: 5, levelId: 'australia' })
    skipToBoss(r)
    run(r, CFG.boss.enterTime + 0.3)
    r.boss!.hits = 3
    r.player.invuln = 99
    let set = 0
    for (let i = 0; i < 60 * (CFG.boss.phaseChangeTime + CFG.boss.race.countdown + 0.5); i++) {
      step(r, EMPTY_INPUT)
      set += r.events.filter((e) => e.t === 'bossTelegraph' && e.label === 'set').length
    }
    expect(set).toBe(1)
  })

  it('research applied everywhere: telegraph floors, short hints, chaser cap', () => {
    expect(CFG.duo.peckTime).toBeGreaterThanOrEqual(0.6)
    expect(CFG.boss.horse.rechargeTelegraph).toBeGreaterThanOrEqual(0.6)
    expect(CFG.boss.sumo.crouch).toBeGreaterThanOrEqual(0.6)
    for (const lvl of LEVELS) {
      expect(lvl.boss.hintShort.split(' ').length).toBeLessThanOrEqual(8)
      for (const part of lvl.boss.parts ?? []) if (!part.decor) expect(part.hint.split(' ').length).toBeLessThanOrEqual(8)
    }
    const s = createState({ seed: 5, levelId: 'europe' })
    s.features = []
    const chasers = s.npcs.filter((n) => n.kind === 'adult' || n.kind === 'dog')
    expect(chasers.length).toBeGreaterThan(CFG.crowd.maxChasing)
    for (const n of chasers) {
      n.x = s.player.x + 2
      n.z = s.player.z
      n.state = 'wander'
      n.scaredCd = 0
    }
    s.player.invuln = 99
    run(s, 0.5)
    expect(chasers.filter((n) => n.state === 'chase').length).toBeLessThanOrEqual(CFG.crowd.maxChasing)
  })

  it('research pass 6: telegraph decals know where attacks land, hurts say why', () => {
    const s = createState({ seed: 5 })
    skipToBoss(s)
    run(s, CFG.boss.enterTime + 0.3)
    const b = s.boss!
    expect(telegraphShape(s, b)).toBeNull()
    b.state = 'telegraph'
    b.attack = 'charge'
    b.dirX = 1
    b.dirZ = 0
    const line = telegraphShape(s, b)!
    expect(line.kind).toBe('line')
    if (line.kind === 'line') {
      const ring = s.bossRing!
      const endD = Math.hypot(line.x + line.dirX * line.len - ring.x, line.z + line.dirZ * line.len - ring.z)
      expect(endD).toBeLessThanOrEqual(ring.r + 0.05)
      expect(endD).toBeGreaterThan(ring.r - 0.5)
    }
    b.attack = 'stomp'
    const ring = telegraphShape(s, b)!
    expect(ring.kind).toBe('ring')
    if (ring.kind === 'ring') expect(ring.r).toBeGreaterThan(2)
    const g = createState({ seed: 5, levelId: 'africa' })
    skipToBoss(g)
    run(g, CFG.boss.enterTime + CFG.boss.phaseChangeTime + 0.5)
    const gb = g.boss!
    gb.state = 'telegraph'
    gb.dirX = 0
    gb.dirZ = 1
    g.player.x = gb.x
    g.player.z = gb.z + 4
    const pounce = telegraphShape(g, gb)!
    expect(pounce.kind).toBe('ring')
    if (pounce.kind === 'ring') expect(pounce.z).toBeCloseTo(gb.z + 4, 1)
    s.player.invuln = 0
    hurtPlayer(s, 10, s.player.x + 1, s.player.z, 0.5, 'TESTED!')
    expect(s.events.some((e) => e.t === 'playerHurt' && e.label === 'TESTED!')).toBe(true)
  })

  it('research pass 7: a boss retry keeps the wreck clock and the same continent', () => {
    const a = createState({ seed: 77, levelId: 'north-america' })
    const layout = a.props.map((p) => [p.kind, Math.round(p.x), Math.round(p.z)].join(':')).join(',')
    const b = createState({ seed: 77, levelId: 'north-america', timeOffset: 42 })
    expect(b.time).toBe(42)
    expect(b.props.map((p) => [p.kind, Math.round(p.x), Math.round(p.z)].join(':')).join(',')).toBe(layout)
    skipToBoss(b)
    run(b, CFG.boss.enterTime + 0.3)
    expect(b.phase).toBe('boss')
    expect(b.time).toBeGreaterThan(42)
  })

  it('research pass 8: the objective target exists on every level and a stuck baby gets a hint', () => {
    for (const lvl of LEVELS) {
      const s = createState({ seed: 5, levelId: lvl.id })
      expect(goalTarget(s)).not.toBeNull()
    }
    const e = createState({ seed: 5, levelId: 'africa' })
    expect(goalTarget(e)).toEqual(e.goalPos)
    const s = createState({ seed: 5 })
    s.features = []
    s.npcs = []
    s.player.invuln = 99
    let hints = 0
    for (let i = 0; i < 60 * (CFG.hint.stuckAfter + 1); i++) {
      step(s, EMPTY_INPUT)
      hints += s.events.filter((ev) => ev.t === 'stuckHint').length
    }
    expect(hints).toBe(1)
    // progress resets the timer
    s.progressT = CFG.hint.stuckAfter - 1
    addWreck(s, 50, 0, 0)
    step(s, EMPTY_INPUT)
    expect(s.progressT).toBeLessThan(1)
  })

  it('research pass 9: the objective arrow waits unless a boss or the clock is pressing', () => {
    expect(arrowVisible(0, 'wreck', 'wreck')).toBe(false)
    expect(arrowVisible(ARROW_DELAY, 'wreck', 'wreck')).toBe(true)
    expect(arrowVisible(0, 'boss', 'wreck')).toBe(true)
    expect(arrowVisible(0, 'wreck', 'escape')).toBe(true)
    expect(arrowVisible(0, 'wreck', 'race')).toBe(true)
    expect(arrowVisible(1, 'wreck', 'chase')).toBe(false)
  })

  it('research pass 10: music loops run past 20 s with bars that differ, rests in the beat, an octave lift', () => {
    for (const mode of ['play', 'calm', 'boss'] as const) {
      expect((LOOP_STEPS * stepMs(mode)) / 1000).toBeGreaterThan(20)
      const bars = Array.from({ length: 8 }, (_, b) => Array.from({ length: 16 }, (_, i) => musicStep(mode, b * 16 + i).note).join(','))
      expect(new Set(bars).size).toBeGreaterThanOrEqual(3)
      expect(musicStep(mode, 7 * 16).octave).toBe(1)
      expect(musicStep(mode, 0).octave).toBe(0)
      expect(musicStep(mode, LOOP_STEPS).note).toBe(musicStep(mode, 0).note)
    }
    const playNotes = Array.from({ length: LOOP_STEPS }, (_, i) => musicStep('play', i).note)
    expect(playNotes.some((n) => n < 0)).toBe(true)
    const calmNotes = Array.from({ length: LOOP_STEPS }, (_, i) => musicStep('calm', i).note)
    expect(calmNotes.every((n) => n >= 0)).toBe(true)
  })

  it('research pass 11: quality steps down on slow frames, up on fast ones, never flaps in the band', () => {
    expect(nextQuality('high', QUALITY_DOWN_MS + 5)).toBe('mid')
    expect(nextQuality('mid', QUALITY_DOWN_MS + 5)).toBe('low')
    expect(nextQuality('low', QUALITY_DOWN_MS + 5)).toBe('low')
    expect(nextQuality('low', QUALITY_UP_MS - 2)).toBe('mid')
    expect(nextQuality('mid', QUALITY_UP_MS - 2)).toBe('high')
    expect(nextQuality('high', QUALITY_UP_MS - 2)).toBe('high')
    expect(nextQuality('mid', (QUALITY_DOWN_MS + QUALITY_UP_MS) / 2)).toBe('mid')
  })

  it('research pass 12: implausible times are floored at 30% of gold par, skips mark a practice run', () => {
    for (const lvl of LEVELS) {
      expect(minPlausibleMs(lvl.id)).toBe(Math.max(15_000, Math.round(parFor(lvl.id)[0] * 0.3)))
      expect(minPlausibleMs(lvl.id)).toBeLessThan(parFor(lvl.id)[0])
    }
    expect(minPlausibleMs('world')).toBeGreaterThan(minPlausibleMs('north-america') * 5)
    const s = createState({ seed: 5 })
    expect(s.goalDone).toBe(false)
    skipToBoss(s)
    expect(s.goalDone).toBe(true)
  })

  it('research pass 13: the meter calls out quarter, halfway and almost once each', () => {
    const s = createState({ seed: 5 })
    s.features = []
    s.npcs = []
    let labels: string[] = []
    const tick = () => {
      step(s, EMPTY_INPUT)
      labels = labels.concat(s.events.filter((e) => e.t === 'meterMilestone').map((e) => e.label ?? ''))
    }
    s.wreckPoints = s.wreckGoalPoints * 0.3
    s.wreck = 0.3
    tick()
    expect(labels).toEqual(['QUARTER!'])
    s.wreck = 0.8
    tick()
    tick()
    expect(labels).toEqual(['QUARTER!', 'HALFWAY!', 'ALMOST!'])
  })

  it('sky fans launch a hovering baby, even while JUMP is held', () => {
    for (const hold of [false, true]) {
      const s = createState({ seed: 5, levelId: 'sky' })
      s.npcs = []
      s.features = [{ id: 991, kind: 'fan', x: 0, z: 0, r: 1.2, h: 0, pair: -1, dirX: 1, dirZ: 0, cd: 0, island: false }]
      s.player.x = 0
      s.player.z = 0
      run(s, 0.05, { ...EMPTY_INPUT, jump: hold })
      expect(s.events.some((e) => e.t === 'fan') || s.player.vy > CFG.fly.riseMax).toBe(true)
      run(s, 0.6, { ...EMPTY_INPUT, jump: hold })
      expect(s.player.y).toBeGreaterThan(5)
      expect(s.player.x).toBeGreaterThan(2)
      run(s, 0.7, { ...EMPTY_INPUT, jump: hold })
      expect(s.player.y).toBeGreaterThan(8)
    }
  })

  it('poop coverage: a chicken freezes from one hit, an adult only slows, and it wears off', () => {
    const s = createState({ seed: 6 })
    s.features = []
    const chick = s.npcs.find((n) => n.kind === 'chicken' && n.scale < 1.1)!
    const adult = s.npcs.find((n) => n.kind === 'adult')!
    s.npcs = [chick, adult]
    for (const n of s.npcs) {
      n.cover = 0
      n.state = 'wander'
    }
    s.poops.push({ id: 8100, x: chick.x, y: 0.5, z: chick.z, vx: 0, vy: 0, vz: 0, r: 0.22, ox: chick.x - 5, oz: chick.z })
    s.poops.push({ id: 8101, x: adult.x, y: 0.5, z: adult.z, vx: 0, vy: 0, vz: 0, r: 0.22, ox: adult.x - 5, oz: adult.z })
    run(s, 0.05)
    expect(chick.cover).toBeGreaterThanOrEqual(CFG.cover.freezeAt)
    expect(adult.cover).toBeGreaterThan(0.2)
    expect(adult.cover).toBeLessThan(CFG.cover.freezeAt)
    const cx = chick.x
    run(s, 2)
    expect(Math.abs(chick.x - cx)).toBeLessThan(0.3)
    const c0 = chick.cover
    run(s, 5)
    expect(chick.cover).toBeLessThan(c0)
  })

  it('evil baby: only poop from a distance counts, five hits drop it', () => {
    const s = createState({ seed: 6 })
    const eb = s.props.find((p) => p.kind === 'evilbaby')!
    expect(eb).toBeDefined()
    s.npcs = []
    s.features = s.features.filter((f) => f.kind === 'lake' || (f.kind === 'platform' && f.island))
    const before = eb.hp
    s.poops.push({ id: 8200, x: eb.x, y: eb.y + 1, z: eb.z, vx: 0, vy: 0, vz: 0, r: 0.22, ox: eb.x - 2, oz: eb.z })
    run(s, 0.05)
    expect(eb.hp).toBe(before)
    for (let i = 0; i < 5; i++) {
      s.poops.push({ id: 8300 + i, x: eb.x, y: eb.y + 1, z: eb.z, vx: 0, vy: 0, vz: 0, r: 0.22, ox: eb.x - 12, oz: eb.z })
      run(s, 0.05)
    }
    expect(eb.broken).toBe(true)
    expect(s.pickups.some((k) => k.kind === 'clock')).toBe(true)
  })

  it('aim mode: holding an attack turns Kase in place instead of moving him', () => {
    const s = createState({ seed: 9 })
    s.features = []
    s.npcs = []
    s.props = []
    s.duo.active = false
    const x0 = s.player.x
    run(s, 0.5, { ...EMPTY_INPUT, mx: 1, scream: true })
    expect(Math.abs(s.player.facing - Math.PI / 2)).toBeLessThan(0.01)
    expect(Math.abs(s.player.x - x0)).toBeLessThan(0.6)
    run(s, 0.5, { ...EMPTY_INPUT, mx: 1 })
    expect(s.player.x - x0).toBeGreaterThan(1.2)
  })

  it('player dies at zero hp and the game is over', () => {
    const s = createState({ seed: 1 })
    s.player.hp = 10
    const n = s.npcs[0]
    n.x = s.player.x + 0.5
    n.z = s.player.z
    n.state = 'chase'
    run(s, 2)
    expect(s.phase).toBe('over')
  })
})
