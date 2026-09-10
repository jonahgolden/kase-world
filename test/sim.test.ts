import { describe, expect, it } from 'vitest'
import { CFG, DT, HEART, addWreck, bossHit, createState, fireScream, nextLevelState, skipToBoss, step } from '../src/sim/sim.ts'
import { botInput } from '../src/sim/bot.ts'
import { EMPTY_INPUT } from '../src/sim/types.ts'
import type { Input, State } from '../src/sim/types.ts'
import { LEVELS } from '../src/sim/levels.ts'

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
    const n = s.npcs[0]
    n.x = 0
    n.z = 3
    s.player.facing = 0
    s.duo.x = -15
    s.duo.z = -15
    const power = s.duo.power
    fireScream(s, 1)
    expect(n.state).toBe('flee')
    expect(s.stats.scared).toBe(1)
    expect(s.duo.power).toBeGreaterThan(power)
  })

  it('a direct scream hit shrinks Duogringo', () => {
    const s = createState({ seed: 1 })
    s.duo.power = 0.8
    s.duo.x = 0
    s.duo.z = 2
    s.player.facing = 0
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
    s.player.hp = 60
    s.pickups = [{ id: 999, kind: 'milk', x: 0.2, y: 0, z: 0.2, vy: 0, age: 0 }]
    run(s, 0.1)
    expect(s.player.hp).toBe(60 + HEART)
    expect(s.pickups.length).toBe(0)
    s.pickups = [{ id: 998, kind: 'pacifier', x: 0.2, y: 0, z: 0.2, vy: 0, age: 0 }]
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
    expect(s.clearTime).toBeGreaterThan(0)
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
