// The whole game, as data in and data out. No DOM, no three.js.
// step(state, input) advances one fixed tick and fills state.events for the drivers.
import { makeRng, rand, range, pick } from './rng.ts'
import { LEVELS, NPC_STATS, PROP_STATS, levelById } from './levels.ts'
import type { LevelDef } from './levels.ts'
import { CONTINENTS } from './continents.ts'
import { closestOnRing, pointInRing } from './geom.ts'
import type {
  Arena,
  Bomb,
  Boss,
  BossAttack,
  Debris,
  Duogringo,
  Feature,
  GameEvent,
  Input,
  Npc,
  NpcKind,
  Pickup,
  PickupKind,
  Player,
  Poop,
  Prop,
  PropKind,
  State,
} from './types.ts'

export const VERSION = '0.4.0'
export const DT = 1 / 60
export const HEART = 20

export const CFG = {
  gravity: 22,
  player: {
    r: 0.42,
    hp: 100,
    speed: 4.6,
    accel: 14,
    jumpV: 7.5,
    smashSpeed: 2.0,
    smashDamagePerSpeed: 9,
    chargeTime: 0.9,
    minCharge: 0.25,
    fullHoldGrace: 0.4,
    screamCooldown: 0.15,
    poopHoldMax: 0.5,
    poopAutoThrow: 0.9,
    poopCooldown: 0.25,
    hurtInvuln: 1.0,
    hurtStun: 0.3,
    powerTime: 12,
    glideFall: -1.6,
    lakeSpeed: 0.45,
    stepUp: 0.35,
  },
  ride: {
    skateboard: { speed: 1.7, accel: 0.55, smash: 1.8, push: 1.5, hp: 1 },
    quad: { speed: 2.2, accel: 0.5, smash: 2.6, push: 2.2, hp: 2 },
  },
  fedora: { speed: 1.25, range: 1.3 },
  megaphone: { range: 1.4, charge: 0.7 },
  scream: {
    baseRange: 3.2,
    rangePerCharge: 4.8,
    halfAngle: Math.PI / 3,
    propDamage: 18,
    propDamagePerCharge: 42,
    knock: 5,
    knockPerCharge: 9,
    npcDamage: 25,
    scareTime: 3.0,
    pacifierRange: 1.5,
  },
  poop: {
    speed: 10,
    speedPerPower: 7,
    upV: 5,
    upPerPower: 2.5,
    r: 0.22,
    stun: 2.2,
    propDamage: 25,
    rattleSpread: 0.35,
  },
  potato: { fuse: 1.2, radius: 3.6, damage: 150, count: 3 },
  conga: { time: 14, radius: 6.5, spacing: 1.1, smashPerSec: 60, dizzy: 1.5 },
  giant: { time: 8, scale: 2.4, speed: 1.2, smash: 4, scare: 7 },
  fan: { up: 13, push: 7, cd: 0.8 },
  portal: { cd: 1.5 },
  duo: {
    baseR: 0.45,
    rPerPower: 0.9,
    baseSpeed: 1.4,
    speedPerPower: 2.8,
    peckTime: 0.45,
    peckCd: 1.4,
    growPerScream: 0.05,
    growPerCharge: 0.1,
    shrinkPerHit: 0.25,
    decayPerSec: 0.012,
  },
  combo: { window: 2.0, max: 10, gainPerStep: 0.1 },
  wreck: {
    duoShrink: 100,
    boom: 80,
    dropChance: 0.1,
    maxDrops: 3,
  },
  time: { clock: 5, perfectBoss: 10 },
  boss: {
    telegraph: [0.85, 0.65, 0.5],
    exposed: [2.2, 1.9, 1.6],
    idle: [1.1, 0.9, 0.7],
    chargeTime: 0.75,
    chargeMult: [1, 1.2, 1.4],
    stompRadius: 3.4,
    hurtTime: 0.45,
    phaseChangeTime: 1.3,
    enterTime: 1.9,
    ringR: 8.5,
  },
  seenRadius: 9,
  caps: { splats: 220, debris: 700 },
}

const GIFT_DROPS: PickupKind[] = ['clock', 'clock', 'skateboard', 'megaphone', 'pacifier', 'rattle', 'milk', 'milk', 'potato', 'wings', 'conga', 'giant']

export interface CreateOpts {
  seed?: number
  levelId?: string
  runId?: string
  carry?: { levelsCleared: number; runTime: number; stats: State['stats']; hp: number }
}

function newId(s: State): number {
  return s.nextId++
}

function ev(s: State, e: GameEvent) {
  s.events.push(e)
}

function dist(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(bx - ax, bz - az)
}

export function arenaFor(levelId: string): Arena {
  const c = CONTINENTS[levelId] ?? CONTINENTS['north-america']
  return { ring: c.ring, minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ, w: c.maxX - c.minX, d: c.maxZ - c.minZ }
}

export function createState(opts: CreateOpts = {}): State {
  const level = (opts.levelId && levelById(opts.levelId)) || LEVELS[0]
  const levelIndex = LEVELS.indexOf(level)
  const seed = opts.seed ?? 1
  const rng = makeRng(seed * 7919 + levelIndex * 104729 + 17)
  const P = CFG.player
  const player: Player = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 0,
    r: P.r,
    hp: Math.max(HEART * 2, opts.carry?.hp ?? P.hp),
    maxHp: P.hp,
    grounded: true,
    jumpCd: 0,
    invuln: 0,
    hitstun: 0,
    screamCharging: false,
    screamCharge: 0,
    screamHoldFull: 0,
    screamCd: 0,
    screamFlash: 0,
    poopHeld: false,
    poopHoldT: 0,
    poopCd: 0,
    jumpHeld: false,
    pacifierT: 0,
    rattleT: 0,
    ride: null,
    rideHp: 0,
    megaphone: false,
    fedora: false,
    wings: false,
    goggles: false,
    potatoes: 0,
    portalCd: 0,
    inLake: false,
    gy: 0,
    baseR: P.r,
    congaT: 0,
    giantT: 0,
  }
  const s: State = {
    version: VERSION,
    runId: opts.runId ?? `${Date.now().toString(36)}-${seed}`,
    seed,
    rng,
    tick: 0,
    time: 0,
    runTime: opts.carry?.runTime ?? 0,
    levelId: level.id,
    levelIndex,
    levelsCleared: opts.carry?.levelsCleared ?? 0,
    phase: 'wreck',
    phaseT: 0,
    clearTime: 0,
    bossDamage: 0,
    arena: arenaFor(level.id),
    player,
    props: [],
    npcs: [],
    poops: [],
    splats: [],
    debris: [],
    pickups: [],
    features: [],
    bombs: [],
    seen: [],
    duo: { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, power: 0, state: 'chase', stateT: 0, peckCd: 2, hitFlash: 0 },
    boss: null,
    bossRing: null,
    conga: [],
    goal: level.goal,
    found: 0,
    wreck: 0,
    wreckPoints: 0,
    wreckGoalPoints: 1,
    combo: 0,
    comboT: 0,
    stats: opts.carry?.stats ?? {
      smashed: 0,
      scared: 0,
      screams: 0,
      poops: 0,
      directHits: 0,
      bossHits: 0,
      bossesBeaten: 0,
      damageTaken: 0,
      bestCombo: 0,
      pickups: 0,
      timeBonus: 0,
    },
    events: [],
    nextId: 1,
  }
  populate(s, level)
  return s
}

// ---------------------------------------------------------------- world queries

function coastClear(s: State, x: number, z: number): number {
  if (!pointInRing(x, z, s.arena.ring)) return -1
  return closestOnRing(x, z, s.arena.ring).d
}

function featureAt(s: State, x: number, z: number, kinds: Feature['kind'][], pad = 0): Feature | null {
  for (const f of s.features) {
    if (!kinds.includes(f.kind)) continue
    if (dist(x, z, f.x, f.z) < f.r + pad) return f
  }
  return null
}

export function lakeAt(s: State, x: number, z: number): Feature | null {
  const lake = featureAt(s, x, z, ['lake'])
  if (!lake) return null
  const island = featureAt(s, x, z, ['platform'])
  return island && island.island ? null : lake
}

// Highest platform top under (x, z) reachable from height y. Platforms far above y are walls, not floors.
export function groundY(s: State, x: number, z: number, y: number): number {
  let g = 0
  for (const f of s.features) {
    if (f.kind !== 'platform') continue
    if (f.h > y + CFG.player.stepUp) continue
    if (dist(x, z, f.x, f.z) < f.r - 0.05 && f.h > g) g = f.h
  }
  return g
}

// Push a ground-level body out of platforms it cannot climb.
function pushOutOfPlatforms(s: State, o: { x: number; z: number; vx: number; vz: number }, r: number, y = 0) {
  for (const f of s.features) {
    if (f.kind !== 'platform' || f.h <= y + CFG.player.stepUp) continue
    const dx = o.x - f.x
    const dz = o.z - f.z
    const minD = f.r + r
    if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue
    const d = Math.hypot(dx, dz)
    if (d < minD) {
      const nx = d > 0.001 ? dx / d : 1
      const nz = d > 0.001 ? dz / d : 0
      o.x = f.x + nx * minD
      o.z = f.z + nz * minD
      const vn = o.vx * nx + o.vz * nz
      if (vn < 0) {
        o.vx -= vn * nx
        o.vz -= vn * nz
      }
    }
  }
}

function pushOutOfLakes(s: State, o: { x: number; z: number; vx: number; vz: number }, r: number) {
  for (const f of s.features) {
    if (f.kind !== 'lake') continue
    const dx = o.x - f.x
    const dz = o.z - f.z
    const d = Math.hypot(dx, dz)
    if (d < f.r + r) {
      const nx = d > 0.001 ? dx / d : 1
      const nz = d > 0.001 ? dz / d : 0
      o.x = f.x + nx * (f.r + r)
      o.z = f.z + nz * (f.r + r)
    }
  }
}

function randomInside(s: State, margin: number, tries = 40): { x: number; z: number } | null {
  const A = s.arena
  for (let i = 0; i < tries; i++) {
    const x = range(s.rng, A.minX + margin, A.maxX - margin)
    const z = range(s.rng, A.minZ + margin, A.maxZ - margin)
    if (coastClear(s, x, z) < margin) continue
    return { x, z }
  }
  return null
}

function farPoint(s: State, fromX: number, fromZ: number, margin: number, samples = 16, ok?: (x: number, z: number) => boolean): { x: number; z: number } {
  let best = { x: 0, z: 0 }
  let bestD = -1
  for (let i = 0; i < samples; i++) {
    const p = randomInside(s, margin, 10)
    if (!p) continue
    if (ok && !ok(p.x, p.z)) continue
    const d = dist(p.x, p.z, fromX, fromZ)
    if (d > bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

// ---------------------------------------------------------------- populate

function populate(s: State, level: LevelDef) {
  const placed: { x: number; z: number; r: number }[] = []
  const free = (x: number, z: number, r: number) => {
    for (const p of placed) if (dist(x, z, p.x, p.z) < r + p.r + 0.7) return false
    return true
  }
  const onFeature = (x: number, z: number, r: number) => featureAt(s, x, z, ['platform', 'lake', 'fan', 'portal'], r + 0.5)

  // 1. features first: they shape everything else
  const F = level.features
  const spots: { x: number; z: number }[] = []
  const farFromAll = (margin: number, minGap: number, tries = 30): { x: number; z: number } | null => {
    let best: { x: number; z: number } | null = null
    let bestD = -1
    for (let i = 0; i < tries; i++) {
      const p = randomInside(s, margin, 10)
      if (!p) continue
      let d = Math.hypot(p.x, p.z)
      for (const q of spots) d = Math.min(d, dist(p.x, p.z, q.x, q.z))
      for (const f of s.features) d = Math.min(d, dist(p.x, p.z, f.x, f.z) - f.r)
      if (d > bestD) {
        bestD = d
        best = p
      }
    }
    return best && bestD >= Math.min(minGap, 3) ? best : null
  }
  const addFeature = (kind: Feature['kind'], x: number, z: number, r: number, h = 0, island = false): Feature => {
    const f: Feature = { id: newId(s), kind, x, z, r, h, pair: -1, dirX: 0, dirZ: 1, cd: 0, island }
    s.features.push(f)
    return f
  }
  for (let i = 0; i < (F.lake ?? 0); i++) {
    const p = farFromAll(7, 8)
    if (!p) continue
    const lake = addFeature('lake', p.x, p.z, range(s.rng, 4.2, 5.4))
    addFeature('platform', lake.x + range(s.rng, -0.8, 0.8), lake.z + range(s.rng, -0.8, 0.8), 1.5, 0.5, true)
  }
  for (let i = 0; i < (F.platform ?? 0); i++) {
    const p = farFromAll(5, 6)
    if (p) addFeature('platform', p.x, p.z, range(s.rng, 3, 4), 1.0)
  }
  for (let i = 0; i < (F.tall ?? 0); i++) {
    const p = farFromAll(5, 6)
    if (!p) continue
    const t = addFeature('platform', p.x, p.z, range(s.rng, 2.6, 3.4), 2.2)
    // a fan a few units away, blowing toward the platform
    const a = rand(s.rng) * Math.PI * 2
    for (let k = 0; k < 8; k++) {
      const ang = a + (k * Math.PI) / 4
      const fx = t.x + Math.cos(ang) * (t.r + 3.2)
      const fz = t.z + Math.sin(ang) * (t.r + 3.2)
      if (coastClear(s, fx, fz) > 1.5 && !featureAt(s, fx, fz, ['platform', 'lake'], 1.2)) {
        const f = addFeature('fan', fx, fz, 1.2)
        const d = Math.hypot(t.x - fx, t.z - fz) || 1
        f.dirX = (t.x - fx) / d
        f.dirZ = (t.z - fz) / d
        break
      }
    }
  }
  for (let i = 0; i < (F.fan ?? 0); i++) {
    const p = farFromAll(3, 4)
    if (!p) continue
    const f = addFeature('fan', p.x, p.z, 1.2)
    const a = rand(s.rng) * Math.PI * 2
    f.dirX = Math.cos(a)
    f.dirZ = Math.sin(a)
  }
  for (let i = 0; i < (F.portal ?? 0); i++) {
    const a = farFromAll(3, 6)
    if (!a) continue
    const pa = addFeature('portal', a.x, a.z, 1.0)
    const b = farPoint(s, a.x, a.z, 3, 20, (x, z) => !featureAt(s, x, z, ['platform', 'lake', 'fan', 'portal'], 2))
    const pb = addFeature('portal', b.x, b.z, 1.0)
    pa.pair = pb.id
    pb.pair = pa.id
  }

  // 2. spots: clusters of props far from each other and from the spawn
  const palette: PropKind[] = []
  for (const [kind, w] of Object.entries(level.props) as [PropKind, number][]) for (let i = 0; i < w; i++) palette.push(kind)
  const placeProp = (kind: PropKind, cx: number, cz: number, radius: number, minFromSpawn: number): boolean => {
    const st = PROP_STATS[kind]
    for (let tries = 0; tries < 30; tries++) {
      const a = rand(s.rng) * Math.PI * 2
      const d = radius * Math.sqrt(rand(s.rng))
      const x = cx + Math.cos(a) * d
      const z = cz + Math.sin(a) * d
      if (coastClear(s, x, z) < st.r + 0.4) continue
      if (Math.hypot(x, z) < minFromSpawn + st.r) continue
      if (onFeature(x, z, st.r)) continue
      if (!free(x, z, st.r)) continue
      placed.push({ x, z, r: st.r })
      s.props.push({
        id: newId(s),
        kind,
        x,
        z,
        y: 0,
        vx: 0,
        vz: 0,
        vy: 0,
        rot: range(s.rng, 0, Math.PI * 2),
        angVel: 0,
        r: st.r,
        h: st.h,
        hp: st.hp,
        maxHp: st.hp,
        mass: st.mass,
        points: st.points,
        color: st.color,
        broken: false,
        hitFlash: 0,
        drop: null,
      })
      return true
    }
    return false
  }
  for (let i = 0; i < level.spots; i++) {
    const c = farFromAll(4, 7) ?? farFromAll(2.5, 3) ?? randomInside(s, 2.5, 20)
    if (!c) continue
    spots.push(c)
    const n = level.propsPerSpot + Math.floor(rand(s.rng) * 3) - 1
    for (let k = 0; k < n; k++) placeProp(pick(s.rng, palette), c.x, c.z, 5, 3.5)
  }
  for (let i = 0; i < level.singles; i++) {
    const p = randomInside(s, 2, 12)
    if (p) placeProp(pick(s.rng, palette), p.x, p.z, 2.5, 4)
  }
  for (let i = 0; i < 2 && spots.length; i++) {
    const c = spots[i % spots.length]
    placeProp('gift', c.x, c.z, 6, 3.5)
  }
  // find levels: about half the lanterns hide in red crates, the rest sit in hard-to-reach places
  const lanternCount = level.goal.kind === 'find' ? level.goal.count : 0
  const crateCount = Math.floor(lanternCount / 2)
  for (let i = 0; i < crateCount && spots.length; i++) {
    const c = spots[(i * 2 + 1) % spots.length]
    placeProp('crate', c.x, c.z, 6, 3.5)
  }
  let drops = 0
  let total = 0
  for (const pr of s.props) {
    total += pr.points
    if (pr.kind === 'crate') pr.drop = 'lantern'
    else if (pr.kind === 'gift') pr.drop = pick(s.rng, GIFT_DROPS)
    else if (drops < CFG.wreck.maxDrops && rand(s.rng) < CFG.wreck.dropChance) {
      const roll = rand(s.rng)
      pr.drop = roll < 0.5 ? 'milk' : roll < 0.75 ? 'pacifier' : 'rattle'
      drops++
    }
  }
  s.wreckGoalPoints = Math.max(1, Math.round(total * (level.goal.kind === 'wreck' ? level.goal.pct : 1)))

  // 3. creatures
  for (const [kind, count] of Object.entries(level.npcs) as [NpcKind, number][]) {
    const st = NPC_STATS[kind]
    for (let i = 0; i < count; i++) {
      let pos: { x: number; z: number } | null = null
      for (let t = 0; t < 30 && !pos; t++) {
        const p = randomInside(s, st.r + 1, 10)
        if (p && Math.hypot(p.x, p.z) > 7 && !onFeature(p.x, p.z, st.r) && free(p.x, p.z, st.r)) pos = p
      }
      if (!pos) continue
      placed.push({ x: pos.x, z: pos.z, r: st.r })
      s.npcs.push({
        id: newId(s),
        kind,
        x: pos.x,
        z: pos.z,
        vx: 0,
        vz: 0,
        facing: 0,
        r: st.r,
        hp: st.hp,
        state: 'wander',
        stateT: range(s.rng, 0.5, 2),
        targetX: pos.x,
        targetZ: pos.z,
        scaredCd: 0,
        color: st.color,
        hitFlash: 0,
      })
    }
  }

  // 4. finds: on top of platforms, on islands, or far along the coast
  const tallTops = s.features.filter((f) => f.kind === 'platform' && f.h > 1.5 && !f.island)
  const lowTops = s.features.filter((f) => f.kind === 'platform' && f.h <= 1.5 && !f.island)
  const islands = s.features.filter((f) => f.kind === 'platform' && f.island)
  const usedTops = new Set<number>()
  const onTop = (list: Feature[], kind: PickupKind): boolean => {
    for (const f of list) {
      if (usedTops.has(f.id)) continue
      usedTops.add(f.id)
      s.pickups.push({ id: newId(s), kind, x: f.x, y: f.h, z: f.z, vy: 0, age: 0 })
      return true
    }
    return false
  }
  const farFind = (kind: PickupKind, margin: number) => {
    const p = farPoint(s, 0, 0, margin, 24, (x, z) => !onFeature(x, z, 0.4) && free(x, z, 0.4))
    placed.push({ x: p.x, z: p.z, r: 0.4 })
    s.pickups.push({ id: newId(s), kind, x: p.x, y: 0, z: p.z, vy: 0, age: 0 })
  }
  const nearFind = (kind: PickupKind) => {
    for (let t = 0; t < 30; t++) {
      const p = randomInside(s, 1.2, 10)
      if (!p || Math.hypot(p.x, p.z) < 6 || onFeature(p.x, p.z, 0.4) || !free(p.x, p.z, 0.4)) continue
      placed.push({ x: p.x, z: p.z, r: 0.4 })
      s.pickups.push({ id: newId(s), kind, x: p.x, y: 0, z: p.z, vy: 0, age: 0 })
      return
    }
  }
  const finds: [PickupKind, number][] = Object.entries(level.finds) as [PickupKind, number][]
  const cratesPlaced = s.props.filter((p) => p.kind === 'crate').length
  if (lanternCount - cratesPlaced > 0) finds.unshift(['lantern', lanternCount - cratesPlaced])
  for (const [kind, count] of finds) {
    for (let i = 0; i < count; i++) {
      switch (kind) {
        case 'clock':
        case 'megaphone':
          if (!onTop(tallTops, kind)) farFind(kind, 1.5)
          break
        case 'goggles':
        case 'wings':
          if (!onTop(lowTops, kind)) farFind(kind, 1.5)
          break
        case 'fedora':
          if (!onTop(islands, kind)) farFind(kind, 1.5)
          break
        case 'lantern':
          if (!onTop(i % 2 === 0 ? tallTops : lowTops, kind) && !onTop(islands, kind)) farFind(kind, 1.5)
          break
        case 'giant':
          farFind(kind, 1.5)
          break
        case 'quad':
        case 'skateboard':
          farFind(kind, 1.2)
          break
        default:
          nearFind(kind)
      }
    }
  }
  const duoStart = farPoint(s, 0, 0, 2)
  s.duo.x = duoStart.x
  s.duo.z = duoStart.z
}

export function currentLevel(s: State): LevelDef {
  return LEVELS[s.levelIndex]
}

export function nextLevelState(s: State, seed?: number): State | null {
  const next = LEVELS[s.levelIndex + 1]
  if (!next) return null
  return createState({
    seed: seed ?? s.seed + 1,
    levelId: next.id,
    runId: s.runId,
    carry: { levelsCleared: s.levelsCleared, runTime: s.runTime, stats: s.stats, hp: s.player.maxHp },
  })
}

export function hearts(p: Player): number {
  return p.hp / HEART
}

// ---------------------------------------------------------------- step

export function step(s: State, input: Input) {
  s.events.length = 0
  s.tick++
  s.time += DT
  s.phaseT += DT
  decayFlashes(s)
  if (s.phase === 'over' || s.phase === 'won') {
    updateDebris(s)
    updatePoops(s, { ...input, poop: false })
    updateBombs(s)
    updatePickups(s)
    return
  }
  s.runTime += DT
  updatePlayer(s, input)
  updateScream(s, input)
  updatePoops(s, input)
  updateBombs(s)
  updateProps(s)
  updateNpcs(s)
  updateConga(s)
  updateDuogringo(s)
  updateBoss(s)
  updateDebris(s)
  updatePickups(s)
  updateCombo(s)
  updatePhase(s)
}

function decayFlashes(s: State) {
  const p = s.player
  p.screamFlash = Math.max(0, p.screamFlash - DT)
  s.duo.hitFlash = Math.max(0, s.duo.hitFlash - DT)
  if (s.boss) s.boss.hitFlash = Math.max(0, s.boss.hitFlash - DT)
  for (const pr of s.props) if (pr.hitFlash > 0) pr.hitFlash = Math.max(0, pr.hitFlash - DT)
  for (const n of s.npcs) if (n.hitFlash > 0) n.hitFlash = Math.max(0, n.hitFlash - DT)
  for (const f of s.features) if (f.cd > 0) f.cd = Math.max(0, f.cd - DT)
}

// Keeps o at least r inside the coast (and inside the boss ring when there is one). Returns true when it touched a wall.
export function clampArena(s: State, o: { x: number; z: number; vx: number; vz: number }, r: number, ring = true): boolean {
  let touched = false
  const R = s.arena.ring
  const inside = pointInRing(o.x, o.z, R)
  const h = closestOnRing(o.x, o.z, R)
  if (!inside) {
    o.x = h.x + h.nx * r
    o.z = h.z + h.nz * r
    o.vx *= 0.3
    o.vz *= 0.3
    touched = true
  } else if (h.d < r) {
    const push = r - h.d
    o.x += h.nx * push
    o.z += h.nz * push
    const vn = o.vx * h.nx + o.vz * h.nz
    if (vn < 0) {
      o.vx -= vn * h.nx * 1.3
      o.vz -= vn * h.nz * 1.3
    }
    touched = true
  }
  if (ring && s.bossRing) {
    const br = s.bossRing
    const dx = o.x - br.x
    const dz = o.z - br.z
    const d = Math.hypot(dx, dz)
    const maxD = br.r - r
    if (d > maxD && d > 0.001) {
      o.x = br.x + (dx / d) * maxD
      o.z = br.z + (dz / d) * maxD
      const vn = (o.vx * dx + o.vz * dz) / d
      if (vn > 0) {
        o.vx -= (vn * dx) / d
        o.vz -= (vn * dz) / d
      }
      touched = true
    }
  }
  return touched
}

// ---------------------------------------------------------------- player

function updatePlayer(s: State, input: Input) {
  const p = s.player
  const C = CFG.player
  let mx = input.mx
  let mz = input.mz
  const len = Math.hypot(mx, mz)
  if (len > 1) {
    mx /= len
    mz /= len
  }
  const ride = p.ride ? CFG.ride[p.ride] : null
  const giant = p.giantT > 0
  p.r = p.baseR * (giant ? CFG.giant.scale : 1)
  p.inLake = p.y <= 0.05 && !!lakeAt(s, p.x, p.z)
  const slow = (p.screamCharging ? 0.5 : 1) * (p.inLake ? C.lakeSpeed : 1)
  const speed = C.speed * (ride ? ride.speed : 1) * (p.fedora ? CFG.fedora.speed : 1) * (giant ? CFG.giant.speed : 1) * slow
  const accel = C.accel * (ride ? ride.accel : 1)
  if (p.hitstun > 0) {
    p.hitstun -= DT
    p.vx *= 1 - 3 * DT
    p.vz *= 1 - 3 * DT
  } else {
    const k = Math.min(1, accel * DT)
    p.vx += (mx * speed - p.vx) * k
    p.vz += (mz * speed - p.vz) * k
    if (len > 0.1) p.facing = Math.atan2(mx, mz)
  }
  p.jumpCd = Math.max(0, p.jumpCd - DT)
  if (input.jump && !p.jumpHeld && p.grounded && p.jumpCd <= 0 && !p.inLake) {
    p.vy = C.jumpV
    p.grounded = false
    p.jumpCd = 0.2
    ev(s, { t: 'jump', x: p.x, z: p.z })
  }
  p.jumpHeld = input.jump
  p.x += p.vx * DT
  p.z += p.vz * DT
  pushOutOfPlatforms(s, p, p.r, p.y)
  clampArena(s, p, p.r)
  const gy = groundY(s, p.x, p.z, p.y)
  p.gy = gy
  if (p.grounded && p.y > gy + 0.01) p.grounded = false
  if (!p.grounded) {
    p.vy -= CFG.gravity * DT
    if (p.wings && input.jump && p.vy < C.glideFall) p.vy = C.glideFall
    p.y += p.vy * DT
    if (p.y <= gy) {
      p.y = gy
      p.vy = 0
      p.grounded = true
      ev(s, { t: 'land', x: p.x, z: p.z })
    }
  } else {
    p.y = gy
  }
  // fans and portals
  if (p.y < 1.2) {
    const fan = featureAt(s, p.x, p.z, ['fan'])
    if (fan && fan.cd <= 0) {
      fan.cd = CFG.fan.cd
      p.vy = CFG.fan.up
      p.vx += fan.dirX * CFG.fan.push
      p.vz += fan.dirZ * CFG.fan.push
      p.grounded = false
      p.y = Math.max(p.y, 0.05)
      ev(s, { t: 'fan', x: p.x, z: p.z })
    }
  }
  p.portalCd = Math.max(0, p.portalCd - DT)
  if (p.portalCd <= 0 && p.y < 1) {
    const portal = featureAt(s, p.x, p.z, ['portal'])
    const other = portal ? s.features.find((f) => f.id === portal.pair) : null
    if (portal && other) {
      ev(s, { t: 'portal', x: p.x, z: p.z })
      const dx = other.x - portal.x
      const dz = other.z - portal.z
      const d = Math.hypot(dx, dz) || 1
      p.x = other.x + (dx / d) * 1.4
      p.z = other.z + (dz / d) * 1.4
      p.portalCd = CFG.portal.cd
      ev(s, { t: 'portal', x: p.x, z: p.z, big: 1 })
    }
  }
  p.invuln = Math.max(0, p.invuln - DT)
  if (p.pacifierT > 0) {
    p.pacifierT -= DT
    if (p.pacifierT <= 0) {
      p.pacifierT = 0
      ev(s, { t: 'powerEnd', kind: 'pacifier' })
    }
  }
  if (p.rattleT > 0) {
    p.rattleT -= DT
    if (p.rattleT <= 0) {
      p.rattleT = 0
      ev(s, { t: 'powerEnd', kind: 'rattle' })
    }
  }
  if (p.giantT > 0) {
    p.giantT -= DT
    if (p.giantT <= 0) {
      p.giantT = 0
      p.r = p.baseR
      ev(s, { t: 'powerEnd', kind: 'giant' })
    }
  }
  // remember nearby finds for the minimap
  for (const k of s.pickups) {
    if (dist(k.x, k.z, p.x, p.z) < CFG.seenRadius && !s.seen.includes(k.id)) s.seen.push(k.id)
  }
}

export function hurtPlayer(s: State, dmg: number, fromX: number, fromZ: number, big = 0.5) {
  const p = s.player
  if (p.invuln > 0 || s.phase === 'over' || p.giantT > 0) return false
  dmg = Math.max(10, Math.round(dmg / 10) * 10)
  p.hp = Math.max(0, p.hp - dmg)
  s.stats.damageTaken += dmg
  if (s.phase === 'boss') s.bossDamage += dmg
  p.invuln = CFG.player.hurtInvuln
  p.hitstun = CFG.player.hurtStun
  const dx = p.x - fromX
  const dz = p.z - fromZ
  const d = Math.hypot(dx, dz) || 1
  p.vx = (dx / d) * 7
  p.vz = (dz / d) * 7
  if (s.combo >= 3) ev(s, { t: 'comboLost', x: p.x, z: p.z, combo: s.combo })
  s.combo = 0
  s.comboT = 0
  if (p.ride) {
    p.rideHp--
    if (p.rideHp <= 0) {
      const kind = p.ride
      p.ride = null
      spawnPickup(s, kind, p.x - (dx / d) * 1.5, p.z - (dz / d) * 1.5, 6)
      ev(s, { t: 'rideOff', x: p.x, z: p.z, kind })
    }
  }
  ev(s, { t: 'playerHurt', x: p.x, z: p.z, big, points: dmg })
  if (p.hp <= 0) {
    s.phase = 'over'
    s.phaseT = 0
    ev(s, { t: 'gameOver' })
  }
  return true
}

// ---------------------------------------------------------------- wreck + combo

export function addWreck(s: State, pts: number, x: number, z: number, label?: string, color?: number) {
  if (s.phase === 'over') return
  if (s.comboT > 0 && s.combo < CFG.combo.max) s.combo++
  else if (s.comboT <= 0) s.combo = 1
  if (s.combo > s.stats.bestCombo) s.stats.bestCombo = s.combo
  s.comboT = CFG.combo.window
  const gain = Math.round(pts * (1 + CFG.combo.gainPerStep * (s.combo - 1)))
  const before = s.wreckPoints
  s.wreckPoints = Math.min(s.wreckGoalPoints, s.wreckPoints + gain)
  if (s.goal.kind === 'wreck') s.wreck = s.wreckPoints / s.wreckGoalPoints
  const pct = s.goal.kind === 'wreck' ? (s.wreckPoints - before) / s.wreckGoalPoints : 0
  ev(s, { t: 'wreck', x, z, points: gain, pct, combo: s.combo, label, color })
  if (s.combo >= 2) ev(s, { t: 'combo', x, z, combo: s.combo })
}

function updateCombo(s: State) {
  if (s.comboT > 0) {
    s.comboT -= DT
    if (s.comboT <= 0) {
      s.comboT = 0
      if (s.combo >= 3) ev(s, { t: 'comboLost', x: s.player.x, z: s.player.z, combo: s.combo })
      s.combo = 0
    }
  }
}

function addTimeBonus(s: State, seconds: number, x: number, z: number, label: string) {
  s.time = Math.max(0, s.time - seconds)
  s.stats.timeBonus += seconds
  ev(s, { t: 'timeBonus', x, z, points: seconds, label })
}

// ---------------------------------------------------------------- scream

export function screamRange(p: Player, charge: number): number {
  const S = CFG.scream
  return (S.baseRange + S.rangePerCharge * charge) * (p.pacifierT > 0 ? S.pacifierRange : 1) * (p.megaphone ? CFG.megaphone.range : 1) * (p.fedora ? CFG.fedora.range : 1)
}

function updateScream(s: State, input: Input) {
  const p = s.player
  const C = CFG.player
  p.screamCd = Math.max(0, p.screamCd - DT)
  if (input.scream && p.screamCd <= 0 && !p.inLake) {
    p.screamCharging = true
    const chargeTime = C.chargeTime * (p.megaphone ? CFG.megaphone.charge : 1)
    p.screamCharge = p.pacifierT > 0 ? 1 : Math.min(1, p.screamCharge + DT / chargeTime)
    if (p.screamCharge >= 1) {
      p.screamHoldFull += DT
      if (p.screamHoldFull > C.fullHoldGrace) fireScream(s, 1)
    }
  } else if (p.screamCharging) {
    fireScream(s, Math.max(C.minCharge, p.screamCharge))
  }
}

function inCone(px: number, pz: number, facing: number, tx: number, tz: number, tr: number, rangeLen: number, halfAngle: number) {
  const dx = tx - px
  const dz = tz - pz
  const d = Math.hypot(dx, dz)
  if (d > rangeLen + tr) return false
  if (d < tr + 0.6) return true
  const ang = Math.atan2(dx, dz)
  let diff = ang - facing
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return Math.abs(diff) < halfAngle + Math.atan2(tr, d)
}

function scareNpc(s: State, n: Npc, fromX: number, fromZ: number, push: number, label = 'SCARED!') {
  const st = NPC_STATS[n.kind]
  const wasScared = n.state === 'flee' || n.state === 'stunned'
  n.hitFlash = 0.3
  if (n.state !== 'cower') {
    n.state = 'flee'
    n.stateT = CFG.scream.scareTime
  }
  const dx = n.x - fromX
  const dz = n.z - fromZ
  const d = Math.hypot(dx, dz) || 1
  n.vx += (dx / d) * push
  n.vz += (dz / d) * push
  if (!wasScared) {
    s.stats.scared++
    addWreck(s, st.scare, n.x, n.z, n.kind === 'chicken' ? 'BAWK!' : label, st.color)
    ev(s, { t: 'npcScared', x: n.x, z: n.z, id: n.id, kind: n.kind })
  }
}

export function fireScream(s: State, charge: number) {
  const p = s.player
  const S = CFG.scream
  p.screamCharging = false
  p.screamCharge = 0
  p.screamHoldFull = 0
  p.screamCd = CFG.player.screamCooldown
  p.screamFlash = 0.35
  s.stats.screams++
  const rangeLen = screamRange(p, charge)
  const fx = Math.sin(p.facing)
  const fz = Math.cos(p.facing)
  ev(s, { t: 'scream', x: p.x, z: p.z, big: charge, facing: p.facing, range: rangeLen })

  for (const pr of s.props) {
    if (pr.broken) continue
    if (!inCone(p.x, p.z, p.facing, pr.x, pr.z, pr.r, rangeLen, S.halfAngle)) continue
    const dx = pr.x - p.x
    const dz = pr.z - p.z
    const d = Math.hypot(dx, dz) || 1
    const falloff = 1 - Math.min(1, d / (rangeLen + pr.r)) * 0.5
    const knock = ((S.knock + S.knockPerCharge * charge) * falloff) / Math.max(0.5, pr.mass * 0.6)
    pr.vx += (dx / d) * knock + fx * knock * 0.3
    pr.vz += (dz / d) * knock + fz * knock * 0.3
    pr.angVel += range(s.rng, -4, 4)
    damageProp(s, pr, (S.propDamage + S.propDamagePerCharge * charge) * falloff)
  }
  for (const n of s.npcs) {
    if (!inCone(p.x, p.z, p.facing, n.x, n.z, n.r, rangeLen, S.halfAngle)) continue
    n.hp -= S.npcDamage * (0.5 + charge)
    scareNpc(s, n, p.x, p.z, 5)
  }
  const duo = s.duo
  const duoR = duoRadius(duo)
  if (inCone(p.x, p.z, p.facing, duo.x, duo.z, duoR, rangeLen, S.halfAngle)) {
    duo.power = Math.max(0, duo.power - CFG.duo.shrinkPerHit)
    duo.state = 'hurt'
    duo.stateT = 0.8
    duo.hitFlash = 0.4
    const dx = duo.x - p.x
    const dz = duo.z - p.z
    const d = Math.hypot(dx, dz) || 1
    duo.vx = (dx / d) * 9
    duo.vz = (dz / d) * 9
    addWreck(s, CFG.wreck.duoShrink, duo.x, duo.z, 'DUOGRINGO SHRUNK!', 0x4cd137)
    ev(s, { t: 'duoShrink', x: duo.x, z: duo.z, big: 0.6 })
  } else {
    duo.power = Math.min(1, duo.power + CFG.duo.growPerScream + CFG.duo.growPerCharge * charge)
    ev(s, { t: 'duoGrow', x: duo.x, z: duo.z, big: duo.power })
  }
  const b = s.boss
  if (b && inCone(p.x, p.z, p.facing, b.x, b.z, b.r, rangeLen, S.halfAngle)) {
    bossHit(s, 'scream')
  }
}

// ---------------------------------------------------------------- poop + potatoes

function throwPoop(s: State, power: number) {
  const p = s.player
  const P = CFG.poop
  if (p.fedora) power = 1
  if (p.potatoes > 0) {
    p.potatoes--
    const fx = Math.sin(p.facing)
    const fz = Math.cos(p.facing)
    const speed = P.speed + P.speedPerPower * power
    s.bombs.push({ id: newId(s), x: p.x + fx * 0.5, y: 0.9 + p.y, z: p.z + fz * 0.5, vx: fx * speed + p.vx * 0.4, vy: P.upV + P.upPerPower * power, vz: fz * speed + p.vz * 0.4, fuse: CFG.potato.fuse })
    p.poopCd = CFG.player.poopCooldown
    p.poopHoldT = 0
    ev(s, { t: 'poopThrow', x: p.x, z: p.z, big: power, kind: 'potato' })
    return
  }
  const n = p.rattleT > 0 ? 3 : 1
  for (let i = 0; i < n; i++) {
    const spread = n === 1 ? 0 : (i - 1) * P.rattleSpread
    const fx = Math.sin(p.facing + spread)
    const fz = Math.cos(p.facing + spread)
    const speed = P.speed + P.speedPerPower * power
    s.poops.push({
      id: newId(s),
      x: p.x + fx * 0.5,
      y: 0.8 + p.y,
      z: p.z + fz * 0.5,
      vx: fx * speed + p.vx * 0.4,
      vy: P.upV + P.upPerPower * power,
      vz: fz * speed + p.vz * 0.4,
      r: P.r,
    })
  }
  s.stats.poops += n
  p.poopCd = p.rattleT > 0 ? CFG.player.poopCooldown * 0.4 : CFG.player.poopCooldown
  p.poopHoldT = 0
  ev(s, { t: 'poopThrow', x: p.x, z: p.z, big: power })
}

function hitNpcWithProjectile(s: State, n: Npc, label: string, stun: number) {
  const st = NPC_STATS[n.kind]
  n.state = 'stunned'
  n.stateT = stun
  n.hp -= 20
  n.hitFlash = 0.4
  s.stats.directHits++
  addWreck(s, st.bonk, n.x, n.z, label, st.color)
  ev(s, { t: 'npcHit', x: n.x, z: n.z, id: n.id, kind: n.kind })
}

function updatePoops(s: State, input: Input) {
  const p = s.player
  const C = CFG.player
  const P = CFG.poop
  p.poopCd = Math.max(0, p.poopCd - DT)
  const playing = s.phase !== 'over' && s.phase !== 'won' && !p.inLake
  if (playing && input.poop) {
    if (!p.poopHeld) p.poopHoldT = 0
    p.poopHoldT += DT
    if (p.poopHoldT >= C.poopAutoThrow && p.poopCd <= 0) throwPoop(s, 1)
  } else if (playing && p.poopHeld && p.poopCd <= 0) {
    throwPoop(s, Math.min(1, p.poopHoldT / C.poopHoldMax))
  }
  p.poopHeld = playing && input.poop

  for (let i = s.poops.length - 1; i >= 0; i--) {
    const q = s.poops[i]
    q.vy -= CFG.gravity * DT
    q.x += q.vx * DT
    q.y += q.vy * DT
    q.z += q.vz * DT
    let hit = false
    if (q.y < 1.4) {
      for (const n of s.npcs) {
        if (dist(q.x, q.z, n.x, n.z) < q.r + n.r) {
          hitNpcWithProjectile(s, n, 'DIRECT HIT!', P.stun)
          hit = true
          break
        }
      }
      const b = s.boss
      if (!hit && b && b.state !== 'enter' && b.state !== 'dead' && dist(q.x, q.z, b.x, b.z) < q.r + b.r) {
        bossHit(s, 'poop')
        hit = true
      }
      if (!hit) {
        for (const pr of s.props) {
          if (pr.broken || q.y > pr.h) continue
          if (dist(q.x, q.z, pr.x, pr.z) < q.r + pr.r) {
            damageProp(s, pr, P.propDamage)
            pr.vx += q.vx * 0.15
            pr.vz += q.vz * 0.15
            hit = true
            break
          }
        }
      }
    }
    const floor = groundY(s, q.x, q.z, q.y)
    if (hit || q.y <= floor) {
      addSplat(s, q.x, q.z, 0.45 + rand(s.rng) * 0.25)
      ev(s, { t: 'splat', x: q.x, y: floor, z: q.z })
      s.poops.splice(i, 1)
    }
  }
}

function explode(s: State, x: number, z: number) {
  const R = CFG.potato.radius
  ev(s, { t: 'explode', x, z, big: 1, range: R })
  for (const pr of s.props) {
    if (pr.broken) continue
    const d = dist(x, z, pr.x, pr.z)
    if (d < R + pr.r) {
      const dx = pr.x - x
      const dz = pr.z - z
      const dd = Math.hypot(dx, dz) || 1
      pr.vx += (dx / dd) * 9
      pr.vz += (dz / dd) * 9
      pr.angVel += range(s.rng, -8, 8)
      damageProp(s, pr, CFG.potato.damage * (1 - (d / (R + pr.r)) * 0.4))
    }
  }
  for (const n of s.npcs) {
    if (dist(x, z, n.x, n.z) < R + n.r) hitNpcWithProjectile(s, n, 'BOOM!', 2.5)
  }
  const duo = s.duo
  if (dist(x, z, duo.x, duo.z) < R + duoRadius(duo)) {
    duo.power = Math.max(0, duo.power - CFG.duo.shrinkPerHit)
    duo.hitFlash = 0.4
    ev(s, { t: 'duoShrink', x: duo.x, z: duo.z, big: 0.6 })
  }
  const b = s.boss
  if (b && b.state !== 'enter' && b.state !== 'dead' && dist(x, z, b.x, b.z) < R + b.r) bossHit(s, 'poop')
  const p = s.player
  if (dist(x, z, p.x, p.z) < R * 0.6 && p.y < 1.5) {
    const dx = p.x - x
    const dz = p.z - z
    const dd = Math.hypot(dx, dz) || 1
    p.vx += (dx / dd) * 6
    p.vz += (dz / dd) * 6
    p.vy = Math.max(p.vy, 5)
    p.grounded = false
  }
}

function updateBombs(s: State) {
  for (let i = s.bombs.length - 1; i >= 0; i--) {
    const b = s.bombs[i]
    b.fuse -= DT
    b.vy -= CFG.gravity * DT
    b.x += b.vx * DT
    b.y += b.vy * DT
    b.z += b.vz * DT
    const floor = groundY(s, b.x, b.z, b.y)
    if (b.y <= floor) {
      b.y = floor
      b.vy = Math.abs(b.vy) > 1.5 ? -b.vy * 0.3 : 0
      b.vx *= 1 - Math.min(1, 20 * DT)
      b.vz *= 1 - Math.min(1, 20 * DT)
    }
    let contact = false
    if (b.y < 1.5) {
      for (const pr of s.props) if (!pr.broken && b.y < pr.h && dist(b.x, b.z, pr.x, pr.z) < 0.3 + pr.r) contact = true
      for (const n of s.npcs) if (dist(b.x, b.z, n.x, n.z) < 0.3 + n.r) contact = true
      const bs = s.boss
      if (bs && bs.state !== 'enter' && bs.state !== 'dead' && dist(b.x, b.z, bs.x, bs.z) < 0.3 + bs.r) contact = true
    }
    if (b.fuse <= 0 || contact) {
      explode(s, b.x, b.z)
      s.bombs.splice(i, 1)
    }
  }
}

function addSplat(s: State, x: number, z: number, r: number) {
  s.splats.push({ id: newId(s), x, z, r })
  if (s.splats.length > CFG.caps.splats) s.splats.shift()
}

// ---------------------------------------------------------------- pickups

function spawnPickup(s: State, kind: PickupKind, x: number, z: number, vy = 0) {
  const k: Pickup = { id: newId(s), kind, x, y: 0.5, z, vy, age: 0 }
  clampArena(s, { x: k.x, z: k.z, vx: 0, vz: 0 }, 0.5, false)
  s.pickups.push(k)
}

function collect(s: State, k: Pickup) {
  const p = s.player
  s.stats.pickups++
  switch (k.kind) {
    case 'milk':
      p.hp = Math.min(p.maxHp, p.hp + HEART)
      break
    case 'pacifier':
      p.pacifierT = CFG.player.powerTime
      break
    case 'rattle':
      p.rattleT = CFG.player.powerTime
      break
    case 'clock':
      addTimeBonus(s, CFG.time.clock, k.x, k.z, `-${CFG.time.clock}s`)
      break
    case 'skateboard':
    case 'quad':
      if (p.ride && p.ride !== k.kind) spawnPickup(s, p.ride, p.x - Math.sin(p.facing) * 1.5, p.z - Math.cos(p.facing) * 1.5, 4)
      p.ride = k.kind
      p.rideHp = CFG.ride[k.kind].hp
      ev(s, { t: 'rideOn', x: k.x, z: k.z, kind: k.kind })
      break
    case 'megaphone':
      p.megaphone = true
      break
    case 'fedora':
      p.fedora = true
      break
    case 'wings':
      p.wings = true
      break
    case 'goggles':
      p.goggles = true
      break
    case 'potato':
      p.potatoes += CFG.potato.count
      break
    case 'conga':
      p.congaT = CFG.conga.time
      break
    case 'giant':
      p.giantT = CFG.giant.time
      break
    case 'lantern':
      s.found++
      if (s.goal.kind === 'find') s.wreck = s.found / s.goal.count
      ev(s, { t: 'found', x: k.x, z: k.z, points: s.found })
      break
  }
  ev(s, { t: 'pickup', x: k.x, z: k.z, kind: k.kind })
}

function updatePickups(s: State) {
  const p = s.player
  for (let i = s.pickups.length - 1; i >= 0; i--) {
    const k = s.pickups[i]
    k.age += DT
    const floor = groundY(s, k.x, k.z, k.y + 1)
    if (k.vy !== 0 || k.y > floor) {
      k.vy -= CFG.gravity * DT
      k.y += k.vy * DT
      if (k.y <= floor) {
        k.y = floor
        k.vy = 0
      }
    }
    if (s.phase === 'over' || s.phase === 'won') continue
    if (k.age > 0.3 && Math.abs(k.y - p.y) < 0.9 && dist(k.x, k.z, p.x, p.z) < p.r + 0.6) {
      collect(s, k)
      s.pickups.splice(i, 1)
    }
  }
}

// ---------------------------------------------------------------- props

function damageProp(s: State, pr: Prop, dmg: number, wreckScale = 1) {
  if (pr.broken) return
  pr.hp -= dmg
  pr.hitFlash = 0.25
  if (pr.hp <= 0) {
    breakProp(s, pr, wreckScale)
  } else {
    ev(s, { t: 'propHit', x: pr.x, z: pr.z, big: Math.min(1, dmg / 60), color: pr.color })
  }
}

function breakProp(s: State, pr: Prop, wreckScale: number) {
  pr.broken = true
  s.stats.smashed++
  const n = 4 + Math.min(6, Math.floor(pr.mass))
  for (let i = 0; i < n; i++) {
    const a = rand(s.rng) * Math.PI * 2
    const sp = range(s.rng, 1.5, 4) + pr.mass * 0.2
    s.debris.push({
      id: newId(s),
      x: pr.x + Math.cos(a) * pr.r * 0.5,
      y: 0.2 + rand(s.rng) * pr.h,
      z: pr.z + Math.sin(a) * pr.r * 0.5,
      vx: Math.cos(a) * sp + pr.vx * 0.5,
      vy: range(s.rng, 3, 7),
      vz: Math.sin(a) * sp + pr.vz * 0.5,
      rot: rand(s.rng) * Math.PI,
      angVel: range(s.rng, -8, 8),
      size: range(s.rng, 0.15, 0.32) * Math.min(2, 0.6 + pr.r),
      color: pr.color,
      settled: false,
    })
  }
  if (s.debris.length > CFG.caps.debris) s.debris.splice(0, s.debris.length - CFG.caps.debris)
  if (pr.drop) spawnPickup(s, pr.drop, pr.x, pr.z, 6)
  if (wreckScale > 0) addWreck(s, pr.points * wreckScale, pr.x, pr.z, pr.kind === 'gift' ? 'SURPRISE!' : undefined, pr.color)
  ev(s, { t: 'smash', x: pr.x, z: pr.z, big: Math.min(1, pr.mass / 6), color: pr.color, points: pr.points })
}

function updateProps(s: State) {
  const p = s.player
  const C = CFG.player
  const ride = p.ride ? CFG.ride[p.ride] : null
  for (const pr of s.props) {
    if (pr.broken) continue
    const damp = 1 - Math.min(1, 3.5 * DT)
    pr.vx *= damp
    pr.vz *= damp
    pr.angVel *= 1 - Math.min(1, 2.5 * DT)
    pr.x += pr.vx * DT
    pr.z += pr.vz * DT
    pr.rot += pr.angVel * DT
    pushOutOfPlatforms(s, pr, pr.r)
    clampArena(s, pr, pr.r, false)

    if (p.y < pr.h) {
      const dx = pr.x - p.x
      const dz = pr.z - p.z
      const d = Math.hypot(dx, dz)
      const minD = pr.r + p.r
      if (d < minD) {
        const nx = d > 0.001 ? dx / d : 1
        const nz = d > 0.001 ? dz / d : 0
        const overlap = minD - d
        const speed = Math.hypot(p.vx, p.vz)
        const heavy = pr.mass / (pr.mass + 1)
        p.x -= nx * overlap * heavy
        p.z -= nz * overlap * heavy
        pr.x += nx * overlap * (1 - heavy)
        pr.z += nz * overlap * (1 - heavy)
        if (speed > C.smashSpeed) {
          const giant = p.giantT > 0
          const push = ((speed * 1.6) / Math.max(0.6, pr.mass * 0.5)) * (ride ? ride.push : 1) * (giant ? 2 : 1)
          pr.vx += nx * push
          pr.vz += nz * push
          pr.angVel += range(s.rng, -6, 6)
          damageProp(s, pr, speed * C.smashDamagePerSpeed * (ride ? ride.smash : 1) * (p.fedora ? 1.5 : 1) * (giant ? CFG.giant.smash : 1))
          const slow = ride ? 0.3 : 0.6
          p.vx *= 1 - heavy * slow
          p.vz *= 1 - heavy * slow
        }
      }
    }
  }
  const live = s.props.filter((q) => !q.broken)
  for (let i = 0; i < live.length; i++) {
    const a = live[i]
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const minD = a.r + b.r
      if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue
      const d = Math.hypot(dx, dz)
      if (d >= minD) continue
      const nx = d > 0.001 ? dx / d : 1
      const nz = d > 0.001 ? dz / d : 0
      const overlap = minD - d
      const ta = a.mass + b.mass
      a.x -= nx * overlap * (b.mass / ta)
      a.z -= nz * overlap * (b.mass / ta)
      b.x += nx * overlap * (a.mass / ta)
      b.z += nz * overlap * (a.mass / ta)
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz
      if (rel > 0) {
        const imp = rel * 0.8
        a.vx -= nx * imp * (b.mass / ta)
        a.vz -= nz * imp * (b.mass / ta)
        b.vx += nx * imp * (a.mass / ta)
        b.vz += nz * imp * (a.mass / ta)
        if (rel > 2.5) {
          damageProp(s, b, rel * 4 * a.mass)
          damageProp(s, a, rel * 1.5 * b.mass)
        }
      }
    }
  }
  for (const pr of live) {
    const sp = Math.hypot(pr.vx, pr.vz)
    if (sp < 3) continue
    for (const n of s.npcs) {
      if (dist(pr.x, pr.z, n.x, n.z) < pr.r + n.r && n.state !== 'stunned') {
        n.vx += pr.vx * 0.5
        n.vz += pr.vz * 0.5
        pr.vx *= 0.4
        pr.vz *= 0.4
        hitNpcWithProjectile(s, n, 'BONK!', 1.2)
      }
    }
  }
}

// ---------------------------------------------------------------- npcs

function moveToward(o: { x: number; z: number; vx: number; vz: number; facing: number }, tx: number, tz: number, speed: number, k = 8) {
  const dx = tx - o.x
  const dz = tz - o.z
  const d = Math.hypot(dx, dz)
  if (d < 0.05) return d
  const kk = Math.min(1, k * DT)
  o.vx += ((dx / d) * speed - o.vx) * kk
  o.vz += ((dz / d) * speed - o.vz) * kk
  o.facing = Math.atan2(o.vx, o.vz)
  return d
}

function updateNpcs(s: State) {
  const p = s.player
  for (const n of s.npcs) {
    const st = NPC_STATS[n.kind]
    n.stateT -= DT
    n.scaredCd = Math.max(0, n.scaredCd - DT)
    const dp = dist(n.x, n.z, p.x, p.z)
    if (p.giantT > 0 && dp < CFG.giant.scare && (n.state === 'wander' || n.state === 'chase' || n.state === 'recoil')) {
      scareNpc(s, n, p.x, p.z, 4, 'GIANT!')
    }
    switch (n.state) {
      case 'wander': {
        if (n.stateT <= 0) {
          const t = n.kind === 'chicken' ? { x: n.x + range(s.rng, -5, 5), z: n.z + range(s.rng, -5, 5) } : randomInside(s, 1.5, 10)
          if (t) {
            n.targetX = t.x
            n.targetZ = t.z
          }
          n.stateT = n.kind === 'chicken' ? range(s.rng, 0.6, 1.4) : range(s.rng, 2, 4.5)
        }
        const d = moveToward(n, n.targetX, n.targetZ, st.wanderSpeed, 4)
        if (d < 0.6) {
          n.vx *= 0.8
          n.vz *= 0.8
        }
        if (dp < st.detect && n.scaredCd <= 0 && s.phase === 'wreck') {
          if (n.kind === 'chicken') {
            n.state = 'flee'
            n.stateT = 1.5
          } else {
            n.state = 'chase'
            n.stateT = 0
          }
        }
        break
      }
      case 'chase': {
        moveToward(n, p.x, p.z, st.chaseSpeed, 6)
        if (dp > st.detect + 4 || p.y > 0.9 || p.inLake) {
          n.state = 'wander'
          n.stateT = 0
        } else if (dp < n.r + p.r + 0.1) {
          if (hurtPlayer(s, st.damage, n.x, n.z, 0.4)) {
            n.state = 'recoil'
            n.stateT = 0.7
            n.vx = -(p.x - n.x) * 2
            n.vz = -(p.z - n.z) * 2
          }
        }
        break
      }
      case 'recoil': {
        n.vx *= 1 - 4 * DT
        n.vz *= 1 - 4 * DT
        if (n.stateT <= 0) n.state = 'chase'
        break
      }
      case 'flee': {
        const dx = n.x - p.x
        const dz = n.z - p.z
        const d = Math.hypot(dx, dz) || 1
        const wob = Math.sin(s.time * 9 + n.id) * (n.kind === 'chicken' ? 1.2 : 0.5)
        moveToward(n, n.x + (dx / d) * 5 + wob, n.z + (dz / d) * 5 - wob, st.fleeSpeed, 7)
        if (n.stateT <= 0) {
          n.state = 'wander'
          n.stateT = 0
          n.scaredCd = n.kind === 'chicken' ? 0.5 : 2.5
        }
        break
      }
      case 'stunned': {
        n.vx *= 1 - 6 * DT
        n.vz *= 1 - 6 * DT
        if (n.stateT <= 0) {
          n.state = 'flee'
          n.stateT = 2
        }
        break
      }
      case 'follow': {
        const idx = s.conga.indexOf(n.id)
        const leader = idx <= 0 ? null : s.npcs.find((m) => m.id === s.conga[idx - 1])
        const lx = leader ? leader.x : p.x
        const lz = leader ? leader.z : p.z
        const dx = n.x - lx
        const dz = n.z - lz
        const d = Math.hypot(dx, dz) || 1
        const gap = CFG.conga.spacing + (leader ? leader.r : p.r) + n.r
        if (d > gap) moveToward(n, lx + (dx / d) * gap, lz + (dz / d) * gap, st.chaseSpeed * 1.25 + 1, 9)
        else {
          n.vx *= 1 - 6 * DT
          n.vz *= 1 - 6 * DT
        }
        break
      }
      case 'cower': {
        const h = closestOnRing(n.x, n.z, s.arena.ring)
        const d = moveToward(n, h.x + h.nx * 1.2, h.z + h.nz * 1.2, st.fleeSpeed, 6)
        if (d < 0.5) {
          n.vx *= 0.7
          n.vz *= 0.7
        }
        break
      }
    }
    n.x += n.vx * DT
    n.z += n.vz * DT
    pushOutOfPlatforms(s, n, n.r)
    pushOutOfLakes(s, n, n.r)
    clampArena(s, n, n.r, false)
    for (const pr of s.props) {
      if (pr.broken) continue
      const dx = n.x - pr.x
      const dz = n.z - pr.z
      const minD = n.r + pr.r
      if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue
      const d = Math.hypot(dx, dz)
      if (d < minD && d > 0.001) {
        if (n.state === 'follow') {
          // conga dancers smash what they bump into
          damageProp(s, pr, CFG.conga.smashPerSec * DT * 10)
          pr.vx += (-dx / d) * 2
          pr.vz += (-dz / d) * 2
          if (pr.broken) ev(s, { t: 'congaSmash', x: pr.x, z: pr.z, id: n.id })
        }
        n.x += (dx / d) * (minD - d)
        n.z += (dz / d) * (minD - d)
      }
    }
  }
  for (let i = 0; i < s.npcs.length; i++) {
    for (let j = i + 1; j < s.npcs.length; j++) {
      const a = s.npcs[i]
      const b = s.npcs[j]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const minD = a.r + b.r
      const d = Math.hypot(dx, dz)
      if (d < minD && d > 0.001) {
        const push = (minD - d) / 2
        a.x -= (dx / d) * push
        a.z -= (dz / d) * push
        b.x += (dx / d) * push
        b.z += (dz / d) * push
      }
    }
  }
}

// ---------------------------------------------------------------- conga line

function updateConga(s: State) {
  const p = s.player
  if (p.congaT > 0) {
    p.congaT -= DT
    for (const n of s.npcs) {
      if (s.conga.includes(n.id) || n.state === 'cower') continue
      if (dist(n.x, n.z, p.x, p.z) < CFG.conga.radius) {
        s.conga.push(n.id)
        n.state = 'follow'
        n.stateT = 0
        n.hitFlash = 0.3
      }
    }
    if (p.congaT <= 0) {
      p.congaT = 0
      for (const id of s.conga) {
        const n = s.npcs.find((m) => m.id === id)
        if (!n) continue
        n.state = 'stunned'
        n.stateT = CFG.conga.dizzy
        n.hitFlash = 0.4
        addWreck(s, 40, n.x, n.z, 'DIZZY!', NPC_STATS[n.kind].color)
      }
      s.conga.length = 0
      ev(s, { t: 'powerEnd', kind: 'conga' })
    }
  } else if (s.conga.length) {
    s.conga.length = 0
  }
}

// ---------------------------------------------------------------- duogringo

export function duoRadius(d: Duogringo) {
  return CFG.duo.baseR + CFG.duo.rPerPower * d.power
}

function updateDuogringo(s: State) {
  const d = s.duo
  const D = CFG.duo
  const p = s.player
  d.stateT -= DT
  d.peckCd = Math.max(0, d.peckCd - DT)
  d.power = Math.max(0, d.power - D.decayPerSec * DT)
  const r = duoRadius(d)
  const speed = D.baseSpeed + D.speedPerPower * d.power
  const dp = dist(d.x, d.z, p.x, p.z)
  d.y = p.y * 0.8
  switch (d.state) {
    case 'chase': {
      moveToward(d, p.x, p.z, speed, 3)
      if (dp < r + p.r + 0.25 && d.peckCd <= 0) {
        d.state = 'peck'
        d.stateT = D.peckTime
        ev(s, { t: 'duoPeck', x: d.x, z: d.z, big: d.power })
      }
      break
    }
    case 'peck': {
      d.vx *= 1 - 5 * DT
      d.vz *= 1 - 5 * DT
      if (d.stateT <= 0) {
        if (dp < r + p.r + 0.6) {
          hurtPlayer(s, 10 + Math.round(d.power * 2) * 10, d.x, d.z, 0.3 + d.power * 0.5)
        }
        d.peckCd = D.peckCd
        d.state = 'chase'
      }
      break
    }
    case 'hurt': {
      d.vx *= 1 - 3 * DT
      d.vz *= 1 - 3 * DT
      if (d.stateT <= 0) d.state = 'chase'
      break
    }
  }
  d.x += d.vx * DT
  d.z += d.vz * DT
  clampArena(s, d, r)
}

// ---------------------------------------------------------------- boss

function spawnBoss(s: State) {
  const def = currentLevel(s).boss
  const p = s.player
  const r = def.scale * 0.32
  const R = CFG.boss.ringR
  const clearOfFeatures = (x: number, z: number) => !featureAt(s, x, z, ['platform', 'lake', 'fan', 'portal'], R * 0.5)
  let c = farPoint(s, p.x, p.z, R * 0.75, 30, clearOfFeatures)
  if (c.x === 0 && c.z === 0) c = farPoint(s, p.x, p.z, R * 0.6, 30)
  s.bossRing = { x: c.x, z: c.z, r: R }
  const b: Boss = {
    def,
    x: c.x,
    y: 12,
    z: c.z,
    vx: 0,
    vz: 0,
    facing: 0,
    r,
    hits: 0,
    totalHits: def.hitsPerPhase * def.phases,
    state: 'enter',
    stateT: CFG.boss.enterTime,
    attack: 'charge',
    dirX: 0,
    dirZ: 1,
    invuln: 0,
    exposedLeft: 0,
    hitFlash: 0,
    everExposed: false,
  }
  s.boss = b
  s.bossDamage = 0
  s.conga.length = 0
  p.congaT = 0
  for (const n of s.npcs) {
    n.state = 'cower'
    n.stateT = 999
  }
  ev(s, { t: 'bossEnter', x: b.x, z: b.z, label: def.name })
}

function bossLand(s: State, b: Boss) {
  const ring = s.bossRing!
  // the stage clears itself: everything inside the ring goes flying
  for (const pr of s.props) {
    if (pr.broken) continue
    const d = dist(ring.x, ring.z, pr.x, pr.z)
    if (d < ring.r + 1) {
      const dx = pr.x - ring.x
      const dz = pr.z - ring.z
      const dd = Math.hypot(dx, dz) || 1
      pr.vx += (dx / dd) * 12
      pr.vz += (dz / dd) * 12
      damageProp(s, pr, 999, 0)
    }
  }
  const p = s.player
  const dp = dist(ring.x, ring.z, p.x, p.z)
  if (dp < 5) {
    const dx = p.x - ring.x
    const dz = p.z - ring.z
    const dd = Math.hypot(dx, dz) || 1
    p.vx += (dx / dd) * 8
    p.vz += (dz / dd) * 8
    p.vy = Math.max(p.vy, 4)
    p.grounded = false
  }
  // the player is pulled onto the stage if they are outside
  if (dp > ring.r - p.r) {
    const dx = p.x - ring.x
    const dz = p.z - ring.z
    const dd = Math.hypot(dx, dz) || 1
    p.x = ring.x + (dx / dd) * (ring.r - p.r - 0.5)
    p.z = ring.z + (dz / dd) * (ring.r - p.r - 0.5)
  }
  ev(s, { t: 'bossLand', x: b.x, z: b.z, big: 1, range: ring.r })
}

export function bossPhase(b: Boss) {
  return Math.min(b.def.phases - 1, Math.floor(b.hits / b.def.hitsPerPhase))
}

export function bossVulnerable(b: Boss) {
  return b.state === 'exposed' && b.invuln <= 0
}

export function bossHit(s: State, src: 'scream' | 'poop'): boolean {
  const b = s.boss
  if (!b || b.state === 'dead') return false
  if (!bossVulnerable(b)) {
    ev(s, { t: 'bossBlocked', x: b.x, z: b.z })
    return false
  }
  b.hits++
  s.stats.bossHits++
  b.hitFlash = 0.4
  b.invuln = 0.6
  const ph = bossPhase(b)
  ev(s, { t: 'bossHurt', x: b.x, z: b.z, big: 0.7, label: src === 'poop' ? 'POOP HIT!' : 'SCREAM HIT!' })
  if (b.hits >= b.totalHits) {
    b.state = 'dead'
    b.stateT = 0
    s.phase = 'won'
    s.phaseT = 0
    s.bossRing = null
    if (s.bossDamage === 0) addTimeBonus(s, CFG.time.perfectBoss, b.x, b.z, `PERFECT! -${CFG.time.perfectBoss}s`)
    s.clearTime = s.time
    s.levelsCleared++
    s.stats.bossesBeaten++
    ev(s, { t: 'bossDead', x: b.x, z: b.z, big: 1, label: b.def.name })
    ev(s, { t: 'win', label: currentLevel(s).name })
    return true
  }
  const newPhase = bossPhase(b)
  if (newPhase !== ph) {
    b.state = 'phaseChange'
    b.stateT = CFG.boss.phaseChangeTime
    ev(s, { t: 'bossPhase', x: b.x, z: b.z, big: 0.8, combo: newPhase })
  } else {
    b.exposedLeft = Math.max(0.8, b.stateT)
    b.state = 'hurt'
    b.stateT = CFG.boss.hurtTime
    const dx = b.x - s.player.x
    const dz = b.z - s.player.z
    const d = Math.hypot(dx, dz) || 1
    b.vx = (dx / d) * 4
    b.vz = (dz / d) * 4
  }
  return true
}

function enterExposed(s: State, b: Boss, t: number) {
  b.state = 'exposed'
  b.stateT = t
  ev(s, { t: 'bossExposed', x: b.x, z: b.z, big: b.everExposed ? 0 : 1 })
  b.everExposed = true
}

function updateBoss(s: State) {
  const b = s.boss
  if (!b || b.state === 'dead') return
  const B = CFG.boss
  const p = s.player
  const ph = bossPhase(b)
  b.stateT -= DT
  b.invuln = Math.max(0, b.invuln - DT)
  const dp = dist(b.x, b.z, p.x, p.z)
  const dmg = Math.max(10, Math.round(b.def.damage / 10) * 10)
  let touchedWall = false
  switch (b.state) {
    case 'enter': {
      const k = Math.max(0, b.stateT / B.enterTime)
      b.y = 12 * k * k
      if (b.stateT <= 0) {
        b.y = 0
        bossLand(s, b)
        b.state = 'idle'
        b.stateT = B.idle[ph] + 1.2
        ev(s, { t: 'levelPhase', label: 'boss', big: 1, x: b.x, z: b.z })
      }
      break
    }
    case 'idle': {
      moveToward(b, p.x, p.z, b.def.speed, 3)
      if (b.stateT <= 0) {
        b.attack = pickAttack(s, b, ph)
        b.state = 'telegraph'
        b.stateT = B.telegraph[ph]
        const dx = p.x - b.x
        const dz = p.z - b.z
        const d = Math.hypot(dx, dz) || 1
        b.dirX = dx / d
        b.dirZ = dz / d
        b.vx *= 0.2
        b.vz *= 0.2
        ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: b.attack })
      }
      break
    }
    case 'telegraph': {
      b.vx *= 1 - 6 * DT
      b.vz *= 1 - 6 * DT
      if (ph >= 2 || dp < 3) {
        const dx = p.x - b.x
        const dz = p.z - b.z
        const d = Math.hypot(dx, dz) || 1
        b.dirX = dx / d
        b.dirZ = dz / d
      }
      if (b.stateT <= 0) {
        b.state = 'attack'
        b.stateT = b.attack === 'charge' ? B.chargeTime : 0.35
        ev(s, { t: 'bossAttack', x: b.x, z: b.z, label: b.attack, big: 0.5 })
      }
      break
    }
    case 'attack': {
      if (b.attack === 'charge') {
        const sp = b.def.chargeSpeed * B.chargeMult[ph]
        b.vx = b.dirX * sp
        b.vz = b.dirZ * sp
        if (dp < b.r + p.r && p.y < 1.2) hurtPlayer(s, dmg, b.x, b.z, 0.8)
        for (const pr of s.props) {
          if (pr.broken) continue
          if (dist(b.x, b.z, pr.x, pr.z) < b.r + pr.r) {
            pr.vx += b.dirX * 8
            pr.vz += b.dirZ * 8
            damageProp(s, pr, 200, 0)
          }
        }
      } else {
        b.vx *= 1 - 8 * DT
        b.vz *= 1 - 8 * DT
        if (b.stateT <= 0) {
          const R = B.stompRadius * (0.8 + b.def.scale * 0.1)
          if (dp < R + p.r && p.grounded) hurtPlayer(s, dmg, b.x, b.z, 0.8)
          for (const pr of s.props) {
            if (pr.broken) continue
            const d = dist(b.x, b.z, pr.x, pr.z)
            if (d < R + pr.r) {
              const dx = pr.x - b.x
              const dz = pr.z - b.z
              const dd = Math.hypot(dx, dz) || 1
              pr.vx += (dx / dd) * 7
              pr.vz += (dz / dd) * 7
              damageProp(s, pr, 60, 0)
            }
          }
          for (const n of s.npcs) {
            if (dist(b.x, b.z, n.x, n.z) < R + n.r) {
              n.state = 'stunned'
              n.stateT = 1
            }
          }
          ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: 1, range: R })
          enterExposed(s, b, B.exposed[ph])
        }
      }
      break
    }
    case 'exposed': {
      b.vx *= 1 - 6 * DT
      b.vz *= 1 - 6 * DT
      if (b.stateT <= 0) {
        b.state = 'idle'
        b.stateT = B.idle[ph]
      }
      break
    }
    case 'hurt': {
      b.vx *= 1 - 4 * DT
      b.vz *= 1 - 4 * DT
      if (b.stateT <= 0) {
        b.state = 'exposed'
        b.stateT = b.exposedLeft
      }
      break
    }
    case 'phaseChange': {
      b.vx *= 1 - 4 * DT
      b.vz *= 1 - 4 * DT
      if (b.stateT <= 0) {
        b.state = 'idle'
        b.stateT = B.idle[bossPhase(b)]
      }
      break
    }
  }
  b.x += b.vx * DT
  b.z += b.vz * DT
  touchedWall = clampArena(s, b, b.r)
  if (b.state === 'attack' && b.attack === 'charge' && (b.stateT <= 0 || touchedWall)) {
    b.vx = 0
    b.vz = 0
    ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: touchedWall ? 0.7 : 0.3, label: 'skid' })
    enterExposed(s, b, B.exposed[ph] + (touchedWall ? 0.5 : 0))
  }
  if (b.state !== 'attack') {
    const dx = p.x - b.x
    const dz = p.z - b.z
    b.facing = Math.atan2(dx, dz)
  }
}

function pickAttack(s: State, b: Boss, ph: number): BossAttack {
  const dp = dist(b.x, b.z, s.player.x, s.player.z)
  if (ph === 0) return 'charge'
  if (dp < 3.5 && rand(s.rng) < 0.7) return 'stomp'
  return pick(s.rng, ph === 1 ? (['charge', 'charge', 'stomp'] as const) : (['charge', 'stomp'] as const))
}

// ---------------------------------------------------------------- debris

function updateDebris(s: State) {
  for (const d of s.debris) {
    if (d.settled) continue
    d.vy -= CFG.gravity * DT
    d.x += d.vx * DT
    d.y += d.vy * DT
    d.z += d.vz * DT
    d.rot += d.angVel * DT
    if (d.y <= d.size * 0.5) {
      d.y = d.size * 0.5
      if (Math.abs(d.vy) < 1.5) {
        d.settled = true
        d.vx = d.vy = d.vz = 0
        d.angVel = 0
      } else {
        d.vy = -d.vy * 0.35
        d.vx *= 0.6
        d.vz *= 0.6
        d.angVel *= 0.5
      }
    }
  }
}

// ---------------------------------------------------------------- phase

function updatePhase(s: State) {
  const done = s.goal.kind === 'find' ? s.found >= s.goal.count : s.wreckPoints >= s.wreckGoalPoints
  if (s.phase === 'wreck' && done) {
    s.wreck = 1
    s.phase = 'boss'
    s.phaseT = 0
    ev(s, { t: 'goalReached', x: s.player.x, z: s.player.z, big: 1 })
    spawnBoss(s)
  }
}

export function skipToBoss(s: State) {
  if (s.phase === 'wreck') {
    s.wreckPoints = s.wreckGoalPoints
    if (s.goal.kind === 'find') s.found = s.goal.count
    s.wreck = 1
  }
}

export type { State, Input, Player, Prop, Npc, Poop, Debris, Boss, Duogringo, GameEvent, Pickup, Feature, Bomb }
