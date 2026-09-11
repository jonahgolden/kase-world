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

export const VERSION = '0.6.0'
export const DT = 1 / 60
export const HEART = 20

export const CFG = {
  gravity: 22,
  player: {
    r: 0.42,
    hp: 100,
    speed: 4.2,
    accel: 12,
    jumpV: 7.5,
    smashSpeed: 2.0,
    smashDamagePerSpeed: 9,
    chargeTime: 0.9,
    minCharge: 0.25,
    fullHoldGrace: 0.4,
    screamCooldown: 0.25,
    poopHoldMax: 0.5,
    poopAutoThrow: 0.9,
    poopCooldown: 0.3,
    hurtInvuln: 1.0,
    hurtStun: 0.3,
    powerTime: 12,
    glideFall: -1.6,
    lakeSpeed: 0.45,
    cloudSpeed: 0.6,
    stepUp: 0.35,
    aimAssistAngle: 1.05, // acquire within ~60 degrees
    aimMinDist: 1.0,
    aimModeSpeed: 0.12, // movement while holding an attack: you turn, you barely move
    airControl: 0.5,
    launchControl: 0.05,
    launchTime: 0.55,
  },
  skyGravity: 0.65,
  flight: { rise: 5.5, riseAccel: 40, fuelPerWings: 3.5, maxFuel: 7 },
  fly: {
    // hover model: hold JUMP to lift, let go to sink; stick moves you like on the ground
    gravity: 0.42, // fraction of normal gravity
    lift: 30, // upward acceleration while holding JUMP
    riseMax: 6,
    fallMax: 7,
    airSpeed: 1.25, // horizontal speed multiplier in the air
    boostSpeed: 1.5,
    boostLift: 1.35,
    maxY: 14,
    boostPerWings: 3,
    maxBoost: 9,
  },
  cover: { perPoop: 1.0, sizeRef: 0.28, decay: 0.05, freezeAt: 0.95, max: 3, hitstun: 0.35 },
  evilbaby: { minDist: 7, hits: 5 },
  ride: {
    skateboard: { speed: 1.7, accel: 0.55, smash: 1.8, push: 1.5, hp: 1 },
    quad: { speed: 2.2, accel: 0.5, smash: 2.6, push: 2.2, hp: 2 },
  },
  fedora: { speed: 1.25, range: 1.3 },
  megaphone: { range: 1.4, charge: 0.7 },
  scream: {
    baseRange: 3.2,
    rangePerCharge: 4.8,
    halfAngle: Math.PI / 3.4,
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
    statueCover: 0.34,
  },
  potato: { fuse: 1.2, radius: 3.6, damage: 150, count: 3 },
  conga: { time: 14, radius: 6.5, spacing: 1.1, smashPerSec: 60, dizzy: 1.5 },
  giant: { time: 8, scale: 2.4, speed: 1.2, smash: 4, scare: 7, poopR: 2.2, poopDamage: 3 },
  fan: { up: 14, push: 9, cd: 0.8 },
  portal: { cd: 1.5 },
  duo: {
    baseR: 0.45,
    rPerPower: 0.9,
    baseSpeed: 1.4,
    speedPerPower: 2.8,
    peckTime: 0.45,
    peckCd: 1.4,
    growPerScream: 0.06,
    growPerCharge: 0.12,
    shrinkPerHit: 0.34,
    decayPerSec: 0.01,
    stunTime: 3.5,
    layCd: 3.0,
    layPower: 0.5,
    maxMinis: 6,
  },
  combo: { window: 2.0, max: 10, gainPerStep: 0.1 },
  wreck: { duoShrink: 100, boom: 80 },
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
    runnerRingR: 11,
    runSpeed: [7, 8.5, 10],
    slipTime: 2.4,
    coverPerPoop: 1 / 14,
    coverPerBomb: 4 / 14,
  },
  seenRadius: 9,
  caps: { splats: 220, debris: 700 },
}

const GIFT_DROPS: PickupKind[] = ['clock', 'milk', 'potato', 'conga', 'giant', 'wings']
export type DamageSource = 'bump' | 'scream' | 'poop' | 'bomb' | 'boss' | 'other'

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

function skyRing(): [number, number][] {
  const pts: [number, number][] = []
  const n = 40
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 30 + Math.sin(a * 3) * 2.5 + Math.cos(a * 5 + 1) * 1.5
    pts.push([Math.round(Math.cos(a) * r * 100) / 100, Math.round(Math.sin(a) * r * 100) / 100])
  }
  return pts
}

export function arenaFor(levelId: string): Arena {
  const c = CONTINENTS[levelId]
  if (!c) {
    const ring = skyRing()
    const xs = ring.map((p) => p[0])
    const zs = ring.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)
    return { ring, minX, maxX, minZ, maxZ, w: maxX - minX, d: maxZ - minZ }
  }
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
    wingFuel: 0,
    hasAim: false,
    hats: 0,
    launchT: 0,
    flying: false,
    pitch: 0,
    turnV: 0,
    boostFuel: 0,
    boosting: false,
    aimPower: -1,
    aiming: false,
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
    duo: { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, power: 0, state: 'chase', stateT: 0, peckCd: 2, hitFlash: 0, active: false, layCd: 0 },
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

export function isSky(s: State): boolean {
  return !!LEVELS[s.levelIndex]?.sky
}

export function gravityFor(s: State): number {
  return CFG.gravity * (isSky(s) ? CFG.skyGravity : 1)
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
  const spots: { x: number; z: number; y: number }[] = []
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
  const addFan = (x: number, z: number, dirX: number, dirZ: number) => {
    const f = addFeature('fan', x, z, 1.2)
    f.dirX = dirX
    f.dirZ = dirZ
    return f
  }
  const fanFor = (t: Feature) => {
    const a = rand(s.rng) * Math.PI * 2
    for (let k = 0; k < 8; k++) {
      const ang = a + (k * Math.PI) / 4
      const fx = t.x + Math.cos(ang) * (t.r + 3.2)
      const fz = t.z + Math.sin(ang) * (t.r + 3.2)
      if (coastClear(s, fx, fz) > 1.5 && !featureAt(s, fx, fz, ['platform', 'lake'], 1.2)) {
        const d = Math.hypot(t.x - fx, t.z - fz) || 1
        addFan(fx, fz, (t.x - fx) / d, (t.z - fz) / d)
        return
      }
    }
  }

  // 1. terrain
  if (level.sky) {
    const heights = [1, 1, 2, 3, 4, 5, 3, 2, 4, 6, 1, 5, 2, 3]
    for (const h of heights) {
      const p = farFromAll(4, 7)
      if (!p) continue
      const isl = addFeature('platform', p.x, p.z, range(s.rng, 2.6, 4.2), h)
      if (h <= 6 && rand(s.rng) < 0.85) fanFor(isl)
    }
    for (let i = 0; i < 3; i++) {
      const p = farFromAll(3, 4)
      if (!p) continue
      const a = rand(s.rng) * Math.PI * 2
      addFan(p.x, p.z, Math.cos(a), Math.sin(a))
    }
  } else {
    const F = level.features
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
      fanFor(addFeature('platform', p.x, p.z, range(s.rng, 2.6, 3.4), 2.2))
    }
    for (let i = 0; i < (F.fan ?? 0); i++) {
      const p = farFromAll(3, 4)
      if (!p) continue
      const a = rand(s.rng) * Math.PI * 2
      addFan(p.x, p.z, Math.cos(a), Math.sin(a))
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
  }

  // 2. wreckable stuff in spots (on islands for the sky)
  const palette: PropKind[] = []
  for (const [kind, w] of Object.entries(level.props) as [PropKind, number][]) for (let i = 0; i < w; i++) palette.push(kind)
  const placeProp = (kind: PropKind, cx: number, cz: number, radius: number, minFromSpawn: number, y = 0, onIsland?: Feature): boolean => {
    const st = PROP_STATS[kind]
    for (let tries = 0; tries < 30; tries++) {
      const a = rand(s.rng) * Math.PI * 2
      const d = radius * Math.sqrt(rand(s.rng))
      const x = cx + Math.cos(a) * d
      const z = cz + Math.sin(a) * d
      if (onIsland) {
        if (dist(x, z, onIsland.x, onIsland.z) > onIsland.r - st.r - 0.3) continue
      } else {
        if (coastClear(s, x, z) < st.r + 0.4) continue
        if (onFeature(x, z, st.r)) continue
      }
      if (Math.hypot(x, z) < minFromSpawn + st.r) continue
      if (!free(x, z, st.r)) continue
      placed.push({ x, z, r: st.r })
      s.props.push({
        id: newId(s),
        kind,
        x,
        z,
        y,
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
        cover: 0,
        promptCd: 0,
      })
      return true
    }
    return false
  }
  if (level.sky) {
    for (const isl of s.features.filter((f) => f.kind === 'platform')) {
      spots.push({ x: isl.x, z: isl.z, y: isl.h })
      const n = 1 + Math.floor(rand(s.rng) * 3)
      for (let k = 0; k < n; k++) placeProp(pick(s.rng, palette), isl.x, isl.z, isl.r, 0, isl.h, isl)
    }
  } else {
    for (let i = 0; i < level.spots; i++) {
      const c = farFromAll(4, 7) ?? farFromAll(2.5, 3) ?? randomInside(s, 2.5, 20)
      if (!c) continue
      spots.push({ x: c.x, z: c.z, y: 0 })
      const n = level.propsPerSpot + Math.floor(rand(s.rng) * 3) - 1
      for (let k = 0; k < n; k++) placeProp(pick(s.rng, palette), c.x, c.z, 5, 3.5)
    }
    for (let i = 0; i < level.singles; i++) {
      const p = randomInside(s, 2, 12)
      if (p) placeProp(pick(s.rng, palette), p.x, p.z, 2.5, 4)
    }
    if (spots.length) placeProp('gift', spots[0].x, spots[0].z, 6, 3.5)
  }
  // find levels: about half the goal items hide in crates in the wreck spots
  const goalCount = level.goal.kind === 'find' ? level.goal.count : 0
  const crateCount = level.sky ? 0 : Math.floor(goalCount / 2)
  for (let i = 0; i < crateCount && spots.length; i++) {
    const c = spots[(i * 2 + 1) % spots.length]
    placeProp('crate', c.x, c.z, 6, 3.5)
  }
  let total = 0
  for (const pr of s.props) {
    total += pr.points
    if (pr.kind === 'crate' && level.goal.kind === 'find') pr.drop = level.goal.item
    else if (pr.kind === 'gift') pr.drop = pick(s.rng, GIFT_DROPS)
  }
  s.wreckGoalPoints = Math.max(1, Math.round(total * (level.goal.kind === 'wreck' ? level.goal.pct : 1)))

  // 3. creatures
  for (const [kind, count] of Object.entries(level.npcs) as [NpcKind, number][]) {
    const st = NPC_STATS[kind]
    for (let i = 0; i < count; i++) {
      const scale = kind === 'chicken' ? range(s.rng, 0.8, 1.7) : 1
      const r = st.r * scale
      let pos: { x: number; z: number } | null = null
      for (let t = 0; t < 30 && !pos; t++) {
        const p = randomInside(s, r + 1, 10)
        if (p && Math.hypot(p.x, p.z) > 7 && !onFeature(p.x, p.z, r) && free(p.x, p.z, r)) pos = p
      }
      if (!pos) continue
      placed.push({ x: pos.x, z: pos.z, r })
      s.npcs.push({
        id: newId(s),
        kind,
        x: pos.x,
        z: pos.z,
        vx: 0,
        vz: 0,
        facing: 0,
        r,
        hp: st.hp,
        state: 'wander',
        stateT: range(s.rng, 0.5, 2),
        targetX: pos.x,
        targetZ: pos.z,
        scaredCd: 0,
        color: st.color,
        hitFlash: 0,
        scale,
        cover: 0,
      })
    }
  }

  // 3b. the evil baby: a distance-shooting target on the lake island (or far away) on every continent
  if (!level.sky) {
    const island = s.features.find((f) => f.kind === 'platform' && f.island)
    const st = PROP_STATS.evilbaby
    const at = island ? { x: island.x, z: island.z, y: island.h } : { ...farPoint(s, 0, 0, 3, 20), y: 0 }
    s.props.push({
      id: newId(s),
      kind: 'evilbaby',
      x: at.x,
      z: at.z,
      y: at.y,
      vx: 0,
      vz: 0,
      vy: 0,
      rot: Math.atan2(-at.x, -at.z),
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
      drop: 'clock',
      cover: 0,
      promptCd: 0,
    })
    if (island) placed.push({ x: island.x, z: island.z, r: 2 })
  }

  // 4. finds: on top of platforms, on islands, in the air (sky), or far along the coast
  const platforms = s.features.filter((f) => f.kind === 'platform')
  const tallTops = platforms.filter((f) => f.h > 1.5 && !f.island).sort((a, b) => b.h - a.h)
  const lowTops = platforms.filter((f) => f.h <= 1.5 && !f.island)
  const usedTops = new Set<number>()
  const addPickup = (kind: PickupKind, x: number, y: number, z: number, float = false) => s.pickups.push({ id: newId(s), kind, x, y, z, vy: 0, age: 0, float })
  const onTop = (list: Feature[], kind: PickupKind): boolean => {
    for (const f of list) {
      if (usedTops.has(f.id)) continue
      usedTops.add(f.id)
      addPickup(kind, f.x, f.h, f.z)
      return true
    }
    return false
  }
  const farFind = (kind: PickupKind, margin: number) => {
    const p = farPoint(s, 0, 0, margin, 24, (x, z) => !onFeature(x, z, 0.4) && free(x, z, 0.4))
    placed.push({ x: p.x, z: p.z, r: 0.4 })
    addPickup(kind, p.x, 0, p.z)
  }
  const nearFind = (kind: PickupKind) => {
    for (let t = 0; t < 30; t++) {
      const p = randomInside(s, 1.2, 10)
      if (!p || Math.hypot(p.x, p.z) < 6 || onFeature(p.x, p.z, 0.4) || !free(p.x, p.z, 0.4)) continue
      placed.push({ x: p.x, z: p.z, r: 0.4 })
      addPickup(kind, p.x, 0, p.z)
      return
    }
  }
  const airFind = (kind: PickupKind) => {
    const p = randomInside(s, 2, 20)
    if (p) addPickup(kind, p.x, range(s.rng, 2.5, 6.5), p.z, true)
  }
  const finds: [PickupKind, number][] = Object.entries(level.finds) as [PickupKind, number][]
  const cratesPlaced = s.props.filter((p) => p.kind === 'crate').length
  if (goalCount - cratesPlaced > 0 && level.goal.kind === 'find') finds.unshift([level.goal.item, goalCount - cratesPlaced])
  for (const [kind, count] of finds) {
    for (let i = 0; i < count; i++) {
      if (level.sky) {
        if (kind === 'wings') airFind(kind)
        else if (kind === 'egg') {
          if (i % 2 === 0 || !onTop(tallTops, kind)) {
            const p = farPoint(s, 0, 0, 3, 12, (x, z) => s.pickups.every((k) => dist(k.x, k.z, x, z) > 7))
            addPickup(kind, p.x, range(s.rng, 2, 9), p.z, true)
          }
        } else if (!onTop(lowTops, kind) && !onTop(tallTops, kind)) nearFind(kind)
        continue
      }
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
        case 'egg':
          if (!onTop(i % 2 === 0 ? tallTops : lowTops, kind)) farFind(kind, 1.5)
          break
        case 'quad':
        case 'skateboard':
        case 'giant':
          farFind(kind, 1.2)
          break
        default:
          nearFind(kind)
      }
    }
  }
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
  for (const pr of s.props) {
    if (pr.hitFlash > 0) pr.hitFlash = Math.max(0, pr.hitFlash - DT)
    if (pr.promptCd > 0) pr.promptCd = Math.max(0, pr.promptCd - DT)
  }
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

function playerTimers(s: State, input: Input) {
  const p = s.player
  void input
  p.invuln = Math.max(0, p.invuln - DT)
  for (const [key, kind] of [
    ['pacifierT', 'pacifier'],
    ['rattleT', 'rattle'],
    ['giantT', 'giant'],
  ] as const) {
    if (p[key] > 0) {
      p[key] -= DT
      if (p[key] <= 0) {
        p[key] = 0
        if (kind === 'giant') p.r = p.baseR
        ev(s, { t: 'powerEnd', kind })
      }
    }
  }
  for (const k of s.pickups) {
    if (dist(k.x, k.z, p.x, p.z) < CFG.seenRadius && !s.seen.includes(k.id)) s.seen.push(k.id)
  }
}

// Sky level: hover flight. Hold JUMP to lift, let go to sink, stick moves you like on the ground.
function updateFlight(s: State, input: Input) {
  const p = s.player
  const C = CFG.player
  const F = CFG.fly
  p.flying = true
  p.wings = true
  let mx = input.mx
  let mz = input.mz
  const len = Math.hypot(mx, mz)
  if (len > 1) {
    mx /= len
    mz /= len
  }
  p.boosting = input.jump && p.boostFuel > 0
  if (p.boosting) p.boostFuel = Math.max(0, p.boostFuel - DT)
  p.aiming = false
  p.aimPower = input.aimPower ?? -1
  const speed = C.speed * (p.grounded ? 1 : F.airSpeed) * (p.boosting ? F.boostSpeed : 1) * (p.fedora ? CFG.fedora.speed : 1)
  p.launchT = Math.max(0, p.launchT - DT)
  if (p.hitstun > 0) {
    p.hitstun -= DT
    p.vx *= 1 - 3 * DT
    p.vz *= 1 - 3 * DT
  } else {
    const control = p.launchT > 0 ? C.launchControl : p.grounded ? 1 : 0.6
    const k = Math.min(1, C.accel * control * DT)
    p.vx += (mx * speed - p.vx) * k
    p.vz += (mz * speed - p.vz) * k
  }
  const aimLen = input.aimX !== undefined && input.aimZ !== undefined ? Math.hypot(input.aimX, input.aimZ) : 0
  if (aimLen > 0.1 && p.hitstun <= 0) {
    p.facing = Math.atan2(input.aimX!, input.aimZ!)
    p.hasAim = true
  } else {
    p.hasAim = false
    if (len > 0.1 && p.hitstun <= 0) p.facing = Math.atan2(mx, mz)
  }
  p.turnV = 0
  p.pitch = 0
  if (input.jump) {
    const cap = F.riseMax * (p.boosting ? F.boostLift : 1)
    // riding a fan launch: let it decay down to the hover cap instead of cutting it
    if (p.vy > cap) p.vy = Math.max(cap, p.vy - CFG.gravity * F.gravity * DT)
    else p.vy = Math.min(cap, p.vy + F.lift * (p.boosting ? F.boostLift : 1) * DT)
    p.grounded = false
    if (s.tick % 15 === 0) ev(s, { t: 'flap', x: p.x, y: p.y, z: p.z, big: p.boosting ? 1 : 0.3 })
  } else if (!p.grounded) {
    p.vy = Math.max(-F.fallMax, p.vy - CFG.gravity * F.gravity * DT)
  }
  p.x += p.vx * DT
  p.z += p.vz * DT
  pushOutOfPlatforms(s, p, p.r, p.y)
  clampArena(s, p, p.r)
  const gy = groundY(s, p.x, p.z, p.y)
  p.gy = gy
  if (p.grounded && p.y > gy + 0.01) p.grounded = false
  if (!p.grounded) {
    p.y += p.vy * DT
    if (p.y <= gy) {
      p.y = gy
      p.vy = 0
      p.grounded = true
      ev(s, { t: 'land', x: p.x, z: p.z })
    }
    if (p.y > F.maxY) {
      p.y = F.maxY
      p.vy = Math.min(0, p.vy)
    }
  } else {
    p.y = gy
  }
  fanLaunch(s)
  p.jumpHeld = input.jump
  playerTimers(s, input)
}

// Fans on the cloud floor / ground: hop over one at low height and it throws you up and along its arrow.
function fanLaunch(s: State) {
  const p = s.player
  if (p.y - p.gy >= 1.2) return
  const fan = featureAt(s, p.x, p.z, ['fan'])
  if (!fan || fan.cd > 0) return
  fan.cd = CFG.fan.cd
  p.vy = CFG.fan.up
  p.vx = fan.dirX * CFG.fan.push
  p.vz = fan.dirZ * CFG.fan.push
  p.grounded = false
  p.launchT = CFG.player.launchTime
  p.y = Math.max(p.y, p.gy + 0.05)
  ev(s, { t: 'fan', x: p.x, z: p.z })
}

function updatePlayer(s: State, input: Input) {
  const p = s.player
  const C = CFG.player
  if (isSky(s)) return updateFlight(s, input)
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
  const sky = isSky(s)
  p.inLake = !sky && p.y <= 0.05 && !!lakeAt(s, p.x, p.z)
  const onCloud = sky && p.y <= 0.05
  p.aiming = (input.scream || input.poop) && p.grounded
  p.aimPower = input.aimPower ?? -1
  const slow = (p.aiming ? C.aimModeSpeed : 1) * (p.inLake ? C.lakeSpeed : 1) * (onCloud ? C.cloudSpeed : 1)
  const speed = C.speed * (ride ? ride.speed : 1) * (p.fedora ? CFG.fedora.speed : 1) * (giant ? CFG.giant.speed : 1) * slow
  const accel = C.accel * (ride ? ride.accel : 1)
  p.launchT = Math.max(0, p.launchT - DT)
  if (p.hitstun > 0) {
    p.hitstun -= DT
    p.vx *= 1 - 3 * DT
    p.vz *= 1 - 3 * DT
  } else {
    // in the air you steer less, so fan launches and glides keep their momentum
    const flying = p.wingFuel > 0 && input.jump
    const control = p.grounded || flying ? 1 : p.launchT > 0 ? C.launchControl : C.airControl
    const k = Math.min(1, accel * control * DT)
    p.vx += (mx * speed - p.vx) * k
    p.vz += (mz * speed - p.vz) * k
  }
  const aimLen = input.aimX !== undefined && input.aimZ !== undefined ? Math.hypot(input.aimX, input.aimZ) : 0
  if (aimLen > 0.1 && p.hitstun <= 0) {
    p.facing = Math.atan2(input.aimX!, input.aimZ!)
    p.hasAim = true
  } else {
    p.hasAim = false
    if (len > 0.1 && p.hitstun <= 0) p.facing = Math.atan2(mx, mz)
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
    if (p.wingFuel > 0 && input.jump && p.jumpCd <= 0) {
      p.vy = Math.min(CFG.flight.rise, p.vy + CFG.flight.riseAccel * DT)
      p.wingFuel = Math.max(0, p.wingFuel - DT)
      if (s.tick % 12 === 0) ev(s, { t: 'flap', x: p.x, y: p.y, z: p.z })
    } else {
      p.vy -= gravityFor(s) * DT
      if (p.wings && input.jump && p.vy < C.glideFall) p.vy = C.glideFall
    }
    p.y += p.vy * DT
    if (p.y <= gy) {
      p.y = gy
      p.vy = 0
      p.grounded = true
      ev(s, { t: 'land', x: p.x, z: p.z })
      if (p.wings && p.wingFuel <= 0) {
        p.wings = false
        ev(s, { t: 'powerEnd', kind: 'wings' })
      }
    }
  } else {
    p.y = gy
  }
  fanLaunch(s)
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
  playerTimers(s, input)
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
  if (!p.flying) {
    p.vx = (dx / d) * 7
    p.vz = (dz / d) * 7
  }
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

// ---------------------------------------------------------------- aim + scream

// Without a mouse, snap the facing toward the best target roughly ahead. Pure; the renderer uses it too.
export function aimTarget(s: State, rangeLen: number): { x: number; z: number; angle: number } | null {
  const p = s.player
  let best: { x: number; z: number; angle: number } | null = null
  let bestScore = Infinity
  const consider = (x: number, z: number, r: number) => {
    const dx = x - p.x
    const dz = z - p.z
    const d = Math.hypot(dx, dz)
    if (d > rangeLen + r || d < CFG.player.aimMinDist) return
    const ang = Math.atan2(dx, dz)
    let diff = ang - p.facing
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    if (Math.abs(diff) > CFG.player.aimAssistAngle) return
    const score = Math.abs(diff) * 3 + d * 0.15
    if (score < bestScore) {
      bestScore = score
      best = { x, z, angle: ang }
    }
  }
  for (const n of s.npcs) if (n.state !== 'cower') consider(n.x, n.z, n.r)
  if (s.boss && s.boss.state !== 'enter' && s.boss.state !== 'dead') consider(s.boss.x, s.boss.z, s.boss.r)
  if (s.duo.active) consider(s.duo.x, s.duo.z, duoRadius(s.duo))
  for (const pr of s.props) if (!pr.broken && (pr.kind === 'glass' || pr.kind === 'statue' || pr.kind === 'crate' || pr.kind === 'evilbaby')) consider(pr.x, pr.z, pr.r)
  return best
}

function assistAim(s: State, rangeLen: number): number | null {
  return aimTarget(s, rangeLen)?.angle ?? null
}

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
    const before = p.screamCharge
    p.screamCharge = p.pacifierT > 0 ? 1 : Math.min(1, p.screamCharge + DT / chargeTime)
    if (before < 1 && p.screamCharge >= 1) ev(s, { t: 'screamReady', x: p.x, z: p.z })
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
    addWreck(s, Math.round(st.scare * n.scale), n.x, n.z, n.kind === 'chicken' ? (n.scale > 1.4 ? 'BIG BAWK!' : 'BAWK!') : label, st.color)
    ev(s, { t: 'npcScared', x: n.x, z: n.z, id: n.id, kind: n.kind, big: n.scale })
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
  if (!p.hasAim) {
    const a = assistAim(s, rangeLen)
    if (a !== null) p.facing = a
  }
  const fx = Math.sin(p.facing)
  const fz = Math.cos(p.facing)
  ev(s, { t: 'scream', x: p.x, z: p.z, big: charge, facing: p.facing, range: rangeLen })

  for (const pr of s.props) {
    if (pr.broken) continue
    if (!inCone(p.x, p.z, p.facing, pr.x, pr.z, pr.r, rangeLen, S.halfAngle)) continue
    if (Math.abs(pr.y - p.y) > 2.5) continue
    const dx = pr.x - p.x
    const dz = pr.z - p.z
    const d = Math.hypot(dx, dz) || 1
    const falloff = 1 - Math.min(1, d / (rangeLen + pr.r)) * 0.5
    const knock = ((S.knock + S.knockPerCharge * charge) * falloff) / Math.max(0.5, pr.mass * 0.6)
    if (pr.kind !== 'statue') {
      pr.vx += (dx / d) * knock + fx * knock * 0.3
      pr.vz += (dz / d) * knock + fz * knock * 0.3
      pr.angVel += range(s.rng, -4, 4)
    }
    damageProp(s, pr, (S.propDamage + S.propDamagePerCharge * charge) * falloff, 1, 'scream')
  }
  for (const n of s.npcs) {
    if (!inCone(p.x, p.z, p.facing, n.x, n.z, n.r, rangeLen, S.halfAngle)) continue
    n.hp -= S.npcDamage * (0.5 + charge)
    scareNpc(s, n, p.x, p.z, 5)
  }
  const duo = s.duo
  if (duo.active) {
    const duoR = duoRadius(duo)
    if (inCone(p.x, p.z, p.facing, duo.x, duo.z, duoR, rangeLen, S.halfAngle) && duo.state !== 'stun') {
      duoShrink(s, CFG.duo.shrinkPerHit)
      const dx = duo.x - p.x
      const dz = duo.z - p.z
      const d = Math.hypot(dx, dz) || 1
      duo.vx = (dx / d) * 9
      duo.vz = (dz / d) * 9
    } else if (duo.state !== 'stun') {
      duo.power = Math.min(1, duo.power + CFG.duo.growPerScream + CFG.duo.growPerCharge * charge)
      ev(s, { t: 'duoGrow', x: duo.x, z: duo.z, big: duo.power })
    } else if (inCone(p.x, p.z, p.facing, duo.x, duo.z, duoR, rangeLen, S.halfAngle)) {
      bossHit(s, 'scream')
    }
  }
  const b = s.boss
  if (b && b.def.fight !== 'nest' && inCone(p.x, p.z, p.facing, b.x, b.z, b.r, rangeLen, S.halfAngle)) {
    bossHit(s, 'scream')
  }
}

function duoShrink(s: State, amount: number) {
  const duo = s.duo
  duo.power = Math.max(0, duo.power - amount)
  duo.hitFlash = 0.4
  if (duo.power <= 0 && s.boss?.def.fight === 'nest') {
    duo.state = 'stun'
    duo.stateT = CFG.duo.stunTime
    duo.vx = duo.vz = 0
    ev(s, { t: 'bossExposed', x: duo.x, z: duo.z, big: s.boss.everExposed ? 0 : 1 })
    s.boss.everExposed = true
  } else {
    duo.state = 'hurt'
    duo.stateT = 0.8
  }
  addWreck(s, CFG.wreck.duoShrink, duo.x, duo.z, 'DUOGRINGO SHRUNK!', 0x4cd137)
  ev(s, { t: 'duoShrink', x: duo.x, z: duo.z, big: 0.6 })
}

// ---------------------------------------------------------------- poop + potatoes

function throwPoop(s: State, power: number) {
  const p = s.player
  const P = CFG.poop
  if (p.fedora) power = 1
  if (!p.hasAim) {
    const a = assistAim(s, 9)
    if (a !== null) p.facing = a
  }
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
  const giant = p.giantT > 0
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
      vy: p.flying && !p.grounded ? p.vy * 0.4 + 2.5 : P.upV + P.upPerPower * power,
      vz: fz * speed + p.vz * 0.4,
      r: P.r * (giant ? CFG.giant.poopR : 1),
      ox: p.x,
      oz: p.z,
    })
  }
  s.stats.poops += n
  p.poopCd = p.rattleT > 0 ? CFG.player.poopCooldown * 0.4 : CFG.player.poopCooldown
  p.poopHoldT = 0
  ev(s, { t: 'poopThrow', x: p.x, z: p.z, big: power })
}

// Poop sticks: small creatures freeze from one hit, big ones slow down and need more. It wears off slowly.
function hitNpcWithProjectile(s: State, n: Npc, label: string, stun: number, poop = true) {
  const st = NPC_STATS[n.kind]
  n.hp -= 20
  n.hitFlash = 0.4
  s.stats.directHits++
  if (poop) {
    const before = n.cover
    const size = (n.r / CFG.cover.sizeRef) * Math.sqrt(n.scale)
    n.cover = Math.min(CFG.cover.max, n.cover + CFG.cover.perPoop / size)
    if (n.state !== 'cower' && n.state !== 'follow') {
      n.state = 'stunned'
      n.stateT = CFG.cover.hitstun
    }
    const frozen = n.cover >= CFG.cover.freezeAt
    addWreck(s, Math.round(st.bonk * n.scale * (before >= 1 ? 0.4 : 1)), n.x, n.z, frozen && before < CFG.cover.freezeAt ? 'FROZEN!' : label, st.color)
    if (frozen && before < CFG.cover.freezeAt) ev(s, { t: 'frozen', x: n.x, z: n.z, id: n.id, kind: n.kind })
  } else {
    n.state = 'stunned'
    n.stateT = stun
    addWreck(s, Math.round(st.bonk * n.scale), n.x, n.z, label, st.color)
  }
  ev(s, { t: 'npcHit', x: n.x, z: n.z, id: n.id, kind: n.kind, big: Math.min(1, n.cover) })
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
    throwPoop(s, p.aimPower >= 0 ? p.aimPower : Math.min(1, p.poopHoldT / C.poopHoldMax))
  }
  p.poopHeld = playing && input.poop

  const giantDmg = p.giantT > 0 ? CFG.giant.poopDamage : 1
  for (let i = s.poops.length - 1; i >= 0; i--) {
    const q = s.poops[i]
    q.vy -= CFG.gravity * DT
    q.x += q.vx * DT
    q.y += q.vy * DT
    q.z += q.vz * DT
    let hit = false
    for (const n of s.npcs) {
      if (Math.abs(q.y - 0.5) < 1.2 && dist(q.x, q.z, n.x, n.z) < q.r + n.r) {
        hitNpcWithProjectile(s, n, 'DIRECT HIT!', P.stun)
        hit = true
        break
      }
    }
    const b = s.boss
    if (!hit && b && b.state !== 'enter' && b.state !== 'dead') {
      const bx = b.def.fight === 'nest' ? s.duo.x : b.x
      const bz = b.def.fight === 'nest' ? s.duo.z : b.z
      const br = b.def.fight === 'nest' ? duoRadius(s.duo) : b.r
      const by = b.def.fight === 'nest' ? s.duo.y : 0
      if (Math.abs(q.y - by) < 2.5 && dist(q.x, q.z, bx, bz) < q.r + br) {
        bossHit(s, 'poop')
        hit = true
      }
    }
    if (!hit) {
      for (const pr of s.props) {
        if (pr.broken || q.y > pr.y + pr.h || q.y < pr.y - 0.3) continue
        if (dist(q.x, q.z, pr.x, pr.z) < q.r + pr.r) {
          poopFlightDist = dist(q.ox, q.oz, q.x, q.z)
          damageProp(s, pr, P.propDamage * giantDmg, 1, 'poop')
          if (pr.kind !== 'statue') {
            pr.vx += q.vx * 0.15
            pr.vz += q.vz * 0.15
          }
          hit = true
          break
        }
      }
    }
    const floor = groundY(s, q.x, q.z, q.y)
    if (hit || q.y <= floor) {
      addSplat(s, q.x, q.z, (0.45 + rand(s.rng) * 0.25) * (q.r / P.r))
      ev(s, { t: 'splat', x: q.x, y: floor, z: q.z, big: q.r / P.r })
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
      if (pr.kind !== 'statue') {
        pr.vx += (dx / dd) * 9
        pr.vz += (dz / dd) * 9
        pr.angVel += range(s.rng, -8, 8)
      }
      damageProp(s, pr, CFG.potato.damage * (1 - (d / (R + pr.r)) * 0.4), 1, 'bomb')
    }
  }
  for (const n of s.npcs) {
    if (dist(x, z, n.x, n.z) < R + n.r) {
      n.cover = Math.min(CFG.cover.max, n.cover + 0.6)
      hitNpcWithProjectile(s, n, 'BOOM!', 2.5, false)
    }
  }
  if (s.duo.active && dist(x, z, s.duo.x, s.duo.z) < R + duoRadius(s.duo)) {
    if (s.duo.state === 'stun') bossHit(s, 'poop')
    else duoShrink(s, CFG.duo.shrinkPerHit)
  }
  const b = s.boss
  if (b && b.def.fight !== 'nest' && b.state !== 'enter' && b.state !== 'dead' && dist(x, z, b.x, b.z) < R + b.r) bossHit(s, 'poop', true)
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
      for (const pr of s.props) if (!pr.broken && b.y < pr.y + pr.h && dist(b.x, b.z, pr.x, pr.z) < 0.3 + pr.r) contact = true
      for (const n of s.npcs) if (dist(b.x, b.z, n.x, n.z) < 0.3 + n.r) contact = true
      const bs = s.boss
      if (bs && bs.state !== 'enter' && bs.state !== 'dead' && bs.def.fight !== 'nest' && dist(b.x, b.z, bs.x, bs.z) < 0.3 + bs.r) contact = true
      if (s.duo.active && dist(b.x, b.z, s.duo.x, s.duo.z) < 0.3 + duoRadius(s.duo)) contact = true
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
  const k: Pickup = { id: newId(s), kind, x, y: 0.5, z, vy, age: 0, float: false }
  clampArena(s, { x: k.x, z: k.z, vx: 0, vz: 0 }, 0.5, false)
  s.pickups.push(k)
}

function collect(s: State, k: Pickup) {
  const p = s.player
  s.stats.pickups++
  const goalItem = s.goal.kind === 'find' && s.goal.item === k.kind
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
      if (goalItem) {
        p.hats++
        s.found++
        s.wreck = s.found / (s.goal as { count: number }).count
        ev(s, { t: 'found', x: k.x, z: k.z, points: s.found, kind: 'fedora' })
      } else p.fedora = true
      break
    case 'egg':
      s.found++
      if (s.goal.kind === 'find') s.wreck = s.found / s.goal.count
      ev(s, { t: 'found', x: k.x, z: k.z, points: s.found, kind: 'egg' })
      break
    case 'wings':
      if (isSky(s)) {
        p.boostFuel = Math.min(CFG.fly.maxBoost, p.boostFuel + CFG.fly.boostPerWings)
      } else {
        p.wings = true
        p.wingFuel = Math.min(CFG.flight.maxFuel, p.wingFuel + CFG.flight.fuelPerWings)
      }
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
  }
  ev(s, { t: 'pickup', x: k.x, y: k.y, z: k.z, kind: k.kind })
}

function updatePickups(s: State) {
  const p = s.player
  for (let i = s.pickups.length - 1; i >= 0; i--) {
    const k = s.pickups[i]
    k.age += DT
    if (!k.float) {
      const floor = groundY(s, k.x, k.z, k.y + 1)
      if (k.vy !== 0 || k.y > floor) {
        k.vy -= CFG.gravity * DT
        k.y += k.vy * DT
        if (k.y <= floor) {
          k.y = floor
          k.vy = 0
        }
      }
    }
    if (s.phase === 'over' || s.phase === 'won') continue
    if (k.age > 0.3 && Math.abs(k.y - p.y) < (k.float ? 1.4 : 0.9) && dist(k.x, k.z, p.x, p.z) < p.r + 0.6) {
      collect(s, k)
      s.pickups.splice(i, 1)
    }
  }
}

// ---------------------------------------------------------------- props

let poopFlightDist = 0 // distance the current poop flew, set before damageProp on a poop hit

function damageProp(s: State, pr: Prop, dmg: number, wreckScale = 1, src: DamageSource = 'other') {
  if (pr.broken) return
  if (pr.kind === 'evilbaby') {
    if (src !== 'poop' && src !== 'bomb') {
      if (src !== 'boss' && pr.promptCd <= 0) {
        pr.promptCd = 0.8
        ev(s, { t: 'needPoop', x: pr.x, z: pr.z, id: pr.id })
      }
      return
    }
    if (src === 'poop' && poopFlightDist < CFG.evilbaby.minDist) {
      if (pr.promptCd <= 0) {
        pr.promptCd = 0.8
        ev(s, { t: 'tooClose', x: pr.x, z: pr.z, id: pr.id })
      }
      return
    }
    pr.hp -= 1
    pr.hitFlash = 0.3
    pr.cover = 1 - pr.hp / pr.maxHp
    if (pr.hp <= 0) breakProp(s, pr, wreckScale, 'BULLSEYE! EVIL BABY DOWN!')
    else {
      addWreck(s, 60, pr.x, pr.z, `HIT! ${pr.maxHp - pr.hp}/${pr.maxHp}`, 0x6b3e1e)
      ev(s, { t: 'propHit', x: pr.x, z: pr.z, big: 0.5, color: 0x6b3e1e })
    }
    return
  }
  if (pr.kind === 'glass' && src !== 'scream' && src !== 'boss') {
    if (pr.promptCd <= 0) {
      pr.promptCd = 0.8
      ev(s, { t: 'needScream', x: pr.x, z: pr.z, id: pr.id })
    }
    return
  }
  if (pr.kind === 'statue') {
    if (src === 'poop' || src === 'bomb') {
      pr.cover = Math.min(1, pr.cover + (src === 'bomb' ? 1 : CFG.poop.statueCover))
      pr.hitFlash = 0.25
      if (pr.cover >= 1) {
        ev(s, { t: 'covered', x: pr.x, z: pr.z, id: pr.id })
        breakProp(s, pr, wreckScale, 'COVERED!')
      } else ev(s, { t: 'propHit', x: pr.x, z: pr.z, big: 0.3, color: 0x6b3e1e })
    } else if (src !== 'boss' && pr.promptCd <= 0) {
      pr.promptCd = 0.8
      ev(s, { t: 'needPoop', x: pr.x, z: pr.z, id: pr.id })
    }
    return
  }
  pr.hp -= dmg
  pr.hitFlash = 0.25
  if (pr.hp <= 0) {
    breakProp(s, pr, wreckScale)
  } else {
    ev(s, { t: 'propHit', x: pr.x, z: pr.z, big: Math.min(1, dmg / 60), color: pr.color })
  }
}

function breakProp(s: State, pr: Prop, wreckScale: number, label?: string) {
  pr.broken = true
  s.stats.smashed++
  const n = 4 + Math.min(6, Math.floor(pr.mass))
  for (let i = 0; i < n; i++) {
    const a = rand(s.rng) * Math.PI * 2
    const sp = range(s.rng, 1.5, 4) + pr.mass * 0.2
    s.debris.push({
      id: newId(s),
      x: pr.x + Math.cos(a) * pr.r * 0.5,
      y: pr.y + 0.2 + rand(s.rng) * pr.h,
      z: pr.z + Math.sin(a) * pr.r * 0.5,
      vx: Math.cos(a) * sp + pr.vx * 0.5,
      vy: range(s.rng, 3, 7),
      vz: Math.sin(a) * sp + pr.vz * 0.5,
      rot: rand(s.rng) * Math.PI,
      angVel: range(s.rng, -8, 8),
      size: range(s.rng, 0.15, 0.32) * Math.min(2, 0.6 + pr.r),
      color: pr.kind === 'statue' ? 0x6b3e1e : pr.color,
      settled: false,
    })
  }
  if (s.debris.length > CFG.caps.debris) s.debris.splice(0, s.debris.length - CFG.caps.debris)
  if (pr.drop) spawnPickup(s, pr.drop, pr.x, pr.z, 6)
  if (wreckScale > 0) addWreck(s, pr.points * wreckScale, pr.x, pr.z, label ?? (pr.kind === 'gift' ? 'SURPRISE!' : pr.kind === 'glass' ? 'SHATTERED!' : undefined), pr.color)
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
    pushOutOfPlatforms(s, pr, pr.r, pr.y)
    clampArena(s, pr, pr.r, false)
    if (pr.y > 0) pr.y = groundY(s, pr.x, pr.z, pr.y + 1)

    const overlapY = p.y < pr.y + pr.h && p.y + 1 > pr.y
    if (overlapY) {
      const dx = pr.x - p.x
      const dz = pr.z - p.z
      const d = Math.hypot(dx, dz)
      const minD = pr.r + p.r
      if (d < minD) {
        const nx = d > 0.001 ? dx / d : 1
        const nz = d > 0.001 ? dz / d : 0
        const overlap = minD - d
        const speed = Math.hypot(p.vx, p.vz)
        const heavy = pr.kind === 'statue' || pr.kind === 'evilbaby' ? 1 : pr.mass / (pr.mass + 1)
        p.x -= nx * overlap * heavy
        p.z -= nz * overlap * heavy
        pr.x += nx * overlap * (1 - heavy)
        pr.z += nz * overlap * (1 - heavy)
        if (speed > C.smashSpeed) {
          const giant = p.giantT > 0
          const push = ((speed * 1.6) / Math.max(0.6, pr.mass * 0.5)) * (ride ? ride.push : 1) * (giant ? 2 : 1)
          if (pr.kind !== 'statue' && pr.kind !== 'evilbaby') {
            pr.vx += nx * push
            pr.vz += nz * push
            pr.angVel += range(s.rng, -6, 6)
          }
          damageProp(s, pr, speed * C.smashDamagePerSpeed * (ride ? ride.smash : 1) * (p.fedora ? 1.5 : 1) * (giant ? CFG.giant.smash : 1), 1, giant ? 'boss' : 'bump')
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
      if (Math.abs(a.y - b.y) > 0.5) continue
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
          damageProp(s, b, rel * 4 * a.mass, 1, 'bump')
          damageProp(s, a, rel * 1.5 * b.mass, 1, 'bump')
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
        hitNpcWithProjectile(s, n, 'BONK!', 1.2, false)
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
    if (n.cover > 0) n.cover = Math.max(0, n.cover - CFG.cover.decay * DT)
    const covered = Math.min(1, n.cover)
    const frozen = n.cover >= CFG.cover.freezeAt
    const sp = (frozen ? 0 : 1 - covered * 0.85) / Math.sqrt(n.scale)
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
        const d = moveToward(n, n.targetX, n.targetZ, st.wanderSpeed * sp, 4)
        if (d < 0.6) {
          n.vx *= 0.8
          n.vz *= 0.8
        }
        if (dp < st.detect && n.scaredCd <= 0 && (s.phase === 'wreck' || n.kind === 'mini')) {
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
        moveToward(n, p.x, p.z, st.chaseSpeed * sp, 6)
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
        moveToward(n, n.x + (dx / d) * 5 + wob, n.z + (dz / d) * 5 - wob, st.fleeSpeed * sp, 7)
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
    if (frozen) {
      n.vx *= 1 - 10 * DT
      n.vz *= 1 - 10 * DT
    }
    n.x += n.vx * DT
    n.z += n.vz * DT
    pushOutOfPlatforms(s, n, n.r)
    pushOutOfLakes(s, n, n.r)
    clampArena(s, n, n.r, false)
    for (const pr of s.props) {
      if (pr.broken || pr.y > 0.5) continue
      const dx = n.x - pr.x
      const dz = n.z - pr.z
      const minD = n.r + pr.r
      if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue
      const d = Math.hypot(dx, dz)
      if (d < minD && d > 0.001) {
        if (n.state === 'follow') {
          damageProp(s, pr, CFG.conga.smashPerSec * DT * 10, 1, 'bump')
          if (pr.kind !== 'statue') {
            pr.vx += (-dx / d) * 2
            pr.vz += (-dz / d) * 2
          }
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

// ---------------------------------------------------------------- duogringo (only in his own fight)

export function duoRadius(d: Duogringo) {
  return CFG.duo.baseR + CFG.duo.rPerPower * d.power
}

function updateDuogringo(s: State) {
  const d = s.duo
  if (!d.active) return
  const D = CFG.duo
  const p = s.player
  d.stateT -= DT
  d.peckCd = Math.max(0, d.peckCd - DT)
  d.layCd = Math.max(0, d.layCd - DT)
  if (d.state !== 'stun') d.power = Math.max(0, d.power - D.decayPerSec * DT)
  const r = duoRadius(d)
  const speed = D.baseSpeed + D.speedPerPower * d.power
  const dp = dist(d.x, d.z, p.x, p.z)
  d.y += ((p.flying ? p.y : p.y * 0.8) + 0.3 * d.power - d.y) * Math.min(1, 3 * DT)
  switch (d.state) {
    case 'chase': {
      moveToward(d, p.x, p.z, speed, 3)
      if (dp < r + p.r + 0.25 && d.peckCd <= 0) {
        d.state = 'peck'
        d.stateT = D.peckTime
        ev(s, { t: 'duoPeck', x: d.x, z: d.z, big: d.power })
      }
      const minis = s.npcs.filter((n) => n.kind === 'mini').length
      if (d.power >= D.layPower && d.layCd <= 0 && minis < D.maxMinis) {
        d.state = 'lay'
        d.stateT = 0.8
      }
      break
    }
    case 'peck': {
      d.vx *= 1 - 5 * DT
      d.vz *= 1 - 5 * DT
      if (d.stateT <= 0) {
        if (dp < r + p.r + 0.6) hurtPlayer(s, 10 + Math.round(d.power * 2) * 10, d.x, d.z, 0.3 + d.power * 0.5)
        d.peckCd = D.peckCd
        d.state = 'chase'
      }
      break
    }
    case 'lay': {
      d.vx *= 1 - 5 * DT
      d.vz *= 1 - 5 * DT
      if (d.stateT <= 0) {
        const st = NPC_STATS.mini
        s.npcs.push({
          id: newId(s),
          kind: 'mini',
          x: d.x + range(s.rng, -0.5, 0.5),
          z: d.z + range(s.rng, -0.5, 0.5),
          vx: 0,
          vz: 0,
          facing: 0,
          r: st.r,
          hp: st.hp,
          state: 'chase',
          stateT: 0,
          targetX: d.x,
          targetZ: d.z,
          scaredCd: 0,
          color: st.color,
          hitFlash: 0.3,
          scale: 1,
          cover: 0,
        })
        ev(s, { t: 'miniHatch', x: d.x, z: d.z })
        d.layCd = D.layCd
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
    case 'stun': {
      d.vx = d.vz = 0
      if (d.stateT <= 0) {
        d.state = 'chase'
        d.power = 0.35
      }
      break
    }
  }
  d.x += d.vx * DT
  d.z += d.vz * DT
  clampArena(s, d, r, false)
  if (s.boss && s.boss.def.fight === 'nest') {
    s.boss.x = d.x
    s.boss.z = d.z
    s.boss.y = d.y
    s.boss.r = r
    s.boss.facing = d.facing
    s.boss.state = d.state === 'stun' ? 'exposed' : 'idle'
    s.boss.hitFlash = d.hitFlash
  }
}

// ---------------------------------------------------------------- boss

function spawnBoss(s: State) {
  const def = currentLevel(s).boss
  const p = s.player
  const r = def.scale * 0.32
  const R = def.fight === 'runner' ? CFG.boss.runnerRingR : CFG.boss.ringR
  const clearOfFeatures = (x: number, z: number) => !featureAt(s, x, z, ['platform', 'lake', 'fan', 'portal'], R * 0.5)
  let c = farPoint(s, p.x, p.z, R * 0.75, 30, clearOfFeatures)
  if (c.x === 0 && c.z === 0) c = farPoint(s, p.x, p.z, R * 0.6, 30)
  s.bossRing = def.fight === 'nest' ? null : { x: c.x, z: c.z, r: R }
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
    cover: 0,
    lap: 0,
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
  const ring = s.bossRing
  if (!ring) {
    if (b.def.fight === 'nest') {
      const d = s.duo
      d.active = true
      d.x = b.x
      d.z = b.z
      d.y = 0.5
      d.power = 0.3
      d.state = 'chase'
      d.layCd = 1.5
      d.peckCd = 1.5
    }
    ev(s, { t: 'bossLand', x: b.x, z: b.z, big: 0.6 })
    return
  }
  for (const pr of s.props) {
    if (pr.broken) continue
    const d = dist(ring.x, ring.z, pr.x, pr.z)
    if (d < ring.r + 1) {
      const dx = pr.x - ring.x
      const dz = pr.z - ring.z
      const dd = Math.hypot(dx, dz) || 1
      pr.vx += (dx / dd) * 12
      pr.vz += (dz / dd) * 12
      damageProp(s, pr, 999, 0, 'boss')
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
  if (b.def.fight === 'poopcover') return b.state !== 'enter' && b.state !== 'dead'
  return b.state === 'exposed' && b.invuln <= 0
}

export function bossHit(s: State, src: 'scream' | 'poop', bomb = false): boolean {
  const b = s.boss
  if (!b || b.state === 'dead' || b.state === 'enter') return false
  if (b.def.fight === 'poopcover') {
    if (src === 'scream') {
      ev(s, { t: 'bossBlocked', x: b.x, z: b.z, label: 'POOP HIM!' })
      return false
    }
    b.cover = Math.min(1, b.cover + (bomb ? CFG.boss.coverPerBomb : CFG.boss.coverPerPoop))
    b.hits = Math.min(b.totalHits, Math.round(b.cover * b.totalHits))
    s.stats.bossHits++
    b.hitFlash = 0.3
    ev(s, { t: 'bossHurt', x: b.x, z: b.z, big: 0.4, label: 'SPLAT!' })
    if (b.cover >= 1) return bossDefeated(s, b)
    return true
  }
  if (b.def.fight === 'nest') {
    if (s.duo.state !== 'stun') {
      ev(s, { t: 'bossBlocked', x: s.duo.x, z: s.duo.z, label: 'SHRINK HIM FIRST!' })
      return false
    }
    if (b.invuln > 0) return false
    b.hits++
    s.stats.bossHits++
    b.invuln = 0.5
    s.duo.hitFlash = 0.4
    ev(s, { t: 'bossHurt', x: s.duo.x, z: s.duo.z, big: 0.7, label: src === 'poop' ? 'POOP HIT!' : 'SCREAM HIT!' })
    if (b.hits >= b.totalHits) return bossDefeated(s, b)
    if (b.hits % b.def.hitsPerPhase === 0) {
      s.duo.state = 'chase'
      s.duo.stateT = 0
      s.duo.power = 0.45
      ev(s, { t: 'bossPhase', x: s.duo.x, z: s.duo.z, big: 0.8, combo: bossPhase(b) })
    }
    return true
  }
  if (!bossVulnerable(b)) {
    ev(s, { t: 'bossBlocked', x: b.x, z: b.z, label: b.def.fight === 'runner' ? 'MAKE HIM SLIP!' : undefined })
    return false
  }
  b.hits++
  s.stats.bossHits++
  b.hitFlash = 0.4
  b.invuln = 0.6
  const ph = bossPhase(b)
  ev(s, { t: 'bossHurt', x: b.x, z: b.z, big: 0.7, label: src === 'poop' ? 'POOP HIT!' : 'SCREAM HIT!' })
  if (b.hits >= b.totalHits) return bossDefeated(s, b)
  const newPhase = bossPhase(b)
  if (newPhase !== ph) {
    b.state = 'phaseChange'
    b.stateT = CFG.boss.phaseChangeTime
    ev(s, { t: 'bossPhase', x: b.x, z: b.z, big: 0.8, combo: newPhase })
  } else if (b.def.fight === 'charge') {
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

function bossDefeated(s: State, b: Boss): boolean {
  b.state = 'dead'
  b.stateT = 0
  s.phase = 'won'
  s.phaseT = 0
  s.bossRing = null
  if (s.duo.active) {
    s.duo.active = false
    s.npcs = s.npcs.filter((n) => n.kind !== 'mini')
  }
  if (s.bossDamage === 0) addTimeBonus(s, CFG.time.perfectBoss, b.x, b.z, `PERFECT! -${CFG.time.perfectBoss}s`)
  s.clearTime = s.time
  s.levelsCleared++
  s.stats.bossesBeaten++
  ev(s, { t: 'bossDead', x: b.x, z: b.z, big: 1, label: b.def.name })
  ev(s, { t: 'win', label: currentLevel(s).name })
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
  if (b.state === 'enter') {
    const k = Math.max(0, b.stateT / B.enterTime)
    b.y = 12 * k * k
    if (b.stateT <= 0) {
      b.y = 0
      bossLand(s, b)
      b.state = 'idle'
      b.stateT = B.idle[ph] + 1.2
      ev(s, { t: 'levelPhase', label: 'boss', big: 1, x: b.x, z: b.z })
    }
    return
  }
  if (b.def.fight === 'nest') return
  if (b.def.fight === 'runner') return updateRunner(s, b, ph)
  if (b.def.fight === 'poopcover') return updatePoopcover(s, b, ph)
  const dp = dist(b.x, b.z, p.x, p.z)
  const dmg = Math.max(10, Math.round(b.def.damage / 10) * 10)
  let touchedWall = false
  switch (b.state) {
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
            damageProp(s, pr, 200, 0, 'boss')
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
              damageProp(s, pr, 60, 0, 'boss')
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

// Insane Bolt runs laps around the ring. Poop on the track makes him slip; only then can he be hit.
function updateRunner(s: State, b: Boss, ph: number) {
  const ring = s.bossRing!
  const p = s.player
  const trackR = ring.r - 1.4
  const dmg = Math.max(10, Math.round(b.def.damage / 10) * 10)
  if (b.state === 'idle' && b.stateT <= 0) b.state = 'attack'
  if (b.state === 'attack') {
    const sp = CFG.boss.runSpeed[ph]
    b.lap += (sp / trackR) * DT
    const nx = ring.x + Math.cos(b.lap) * trackR
    const nz = ring.z + Math.sin(b.lap) * trackR
    b.vx = (nx - b.x) / DT
    b.vz = (nz - b.z) / DT
    b.x = nx
    b.z = nz
    b.facing = Math.atan2(b.vx, b.vz)
    if (dist(b.x, b.z, p.x, p.z) < b.r + p.r && p.y < 1.2) hurtPlayer(s, dmg, b.x, b.z, 0.8)
    for (let i = s.splats.length - 1; i >= 0; i--) {
      const sp2 = s.splats[i]
      if (dist(b.x, b.z, sp2.x, sp2.z) < b.r * 0.6 + sp2.r) {
        s.splats.splice(i, 1)
        b.vx = b.vz = 0
        ev(s, { t: 'bossSlip', x: b.x, z: b.z, big: 0.8 })
        enterExposed(s, b, CFG.boss.slipTime)
        break
      }
    }
  } else if (b.state === 'exposed') {
    if (b.stateT <= 0) b.state = 'attack'
  } else if (b.state === 'phaseChange') {
    if (b.stateT <= 0) b.state = 'attack'
  } else if (b.state === 'idle') {
    // waiting at the line
  }
}

// President Jeff waddles and slides; screams do nothing, poop covers him.
function updatePoopcover(s: State, b: Boss, ph: number) {
  const p = s.player
  const B = CFG.boss
  const dp = dist(b.x, b.z, p.x, p.z)
  const dmg = Math.max(10, Math.round(b.def.damage / 10) * 10)
  switch (b.state) {
    case 'idle': {
      // the more covered he is, the more he panics
      moveToward(b, p.x, p.z, b.def.speed * (1 + ph * 0.3 + b.cover * 0.8), 2.5)
      if (b.stateT <= 0) {
        b.state = 'telegraph'
        b.stateT = B.telegraph[ph]
        const dx = p.x - b.x
        const dz = p.z - b.z
        const d = Math.hypot(dx, dz) || 1
        b.dirX = dx / d
        b.dirZ = dz / d
        ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: 'slide' })
      }
      break
    }
    case 'telegraph': {
      b.vx *= 1 - 6 * DT
      b.vz *= 1 - 6 * DT
      if (b.stateT <= 0) {
        b.state = 'attack'
        b.stateT = 1.1
        ev(s, { t: 'bossAttack', x: b.x, z: b.z, label: 'slide', big: 0.5 })
      }
      break
    }
    case 'attack': {
      const sp = b.def.chargeSpeed * (0.8 + ph * 0.2)
      b.vx = b.dirX * sp
      b.vz = b.dirZ * sp
      if (dp < b.r + p.r && p.y < 1.2) hurtPlayer(s, dmg, b.x, b.z, 0.8)
      if (b.stateT <= 0) {
        b.state = 'idle'
        b.stateT = B.idle[ph] + 0.8
      }
      break
    }
    default:
      b.state = 'idle'
  }
  b.x += b.vx * DT
  b.z += b.vz * DT
  const wall = clampArena(s, b, b.r)
  if (wall && b.state === 'attack') {
    b.state = 'idle'
    b.stateT = B.idle[ph] + 1.0
    b.vx = b.vz = 0
    ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: 0.5, label: 'skid' })
  }
  if (b.state !== 'attack') b.facing = Math.atan2(p.x - b.x, p.z - b.z)
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
