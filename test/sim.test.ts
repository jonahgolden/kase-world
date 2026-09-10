import { describe, expect, it } from 'vitest'
import { CFG, DT, addScore, bossHit, createState, fireScream, nextLevelState, skipToBoss, step } from '../src/sim/sim.ts'
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

  it('bot soak: 100 s without NaN, with score and smashed props', () => {
    const s = createState({ seed: 7 })
    run(s, 100, botInput)
    expect(hasNaN(s)).toBe(false)
    expect(s.score).toBeGreaterThan(0)
    expect(s.stats.smashed).toBeGreaterThan(3)
    expect(s.phase === 'boss' || s.phase === 'won' || s.phase === 'over').toBe(true)
  })

  it('every level populates and runs', () => {
    for (const lvl of LEVELS) {
      const s = createState({ seed: 3, levelId: lvl.id })
      expect(s.props.length).toBeGreaterThan(20)
      expect(s.npcs.length).toBeGreaterThan(2)
      run(s, 5, botInput)
      expect(hasNaN(s)).toBe(false)
    }
  })

  it('bumping a prop at crawl speed smashes it and scores', () => {
    const s = createState({ seed: 1 })
    const box = s.props.find((p) => p.kind === 'box')!
    box.x = 2.5
    box.z = 0
    const before = s.score
    run(s, 2, { ...EMPTY_INPUT, mx: 1 })
    expect(box.broken).toBe(true)
    expect(s.score).toBeGreaterThan(before)
    expect(s.debris.length).toBeGreaterThan(0)
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

  it('chain multiplier climbs within the window and resets after it', () => {
    const s = createState({ seed: 1 })
    addScore(s, 100, 0, 0)
    expect(s.mult).toBe(1)
    run(s, 1)
    addScore(s, 100, 0, 0)
    expect(s.mult).toBe(2)
    run(s, CFG.chainTime + 0.5)
    expect(s.mult).toBe(1)
    expect(s.events.some((e) => e.t === 'multLost') || s.chainT === 0).toBe(true)
  })

  it('timer end spawns the boss and the boss can be beaten', () => {
    const s = createState({ seed: 5 })
    skipToBoss(s)
    run(s, 3)
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
  })

  it('boss ignores hits while not exposed', () => {
    const s = createState({ seed: 5 })
    skipToBoss(s)
    run(s, 3)
    const b = s.boss!
    b.state = 'idle'
    expect(bossHit(s, 'scream')).toBe(false)
    expect(b.hits).toBe(0)
  })

  it('carries score into the next level', () => {
    const s = createState({ seed: 1 })
    s.score = 1234
    s.levelsCleared = 1
    const n = nextLevelState(s)!
    expect(n.levelId).toBe(LEVELS[1].id)
    expect(n.score).toBe(1234)
    expect(n.player.hp).toBe(CFG.player.hp)
  })

  it('player dies at zero hp and the game is over', () => {
    const s = createState({ seed: 1 })
    s.player.hp = 5
    const n = s.npcs[0]
    n.x = s.player.x + 0.5
    n.z = s.player.z
    n.state = 'chase'
    run(s, 2)
    expect(s.phase).toBe('over')
  })
})
