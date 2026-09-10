// The whole game, as data in and data out. No DOM, no three.js.
// step(state, input) advances one fixed tick and fills state.events for the drivers.
import { makeRng, rand, range, pick } from './rng.ts'
import { LEVELS, NPC_STATS, PROP_STATS, levelById } from './levels.ts'
import type { LevelDef } from './levels.ts'
import { CONTINENTS } from './continents.ts'
import { closestOnRing, pointInRing } from './geom.ts'
import type {
  Arena,
  Boss,
  BossAttack,
  Debris,
  Duogringo,
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

export const VERSION = '0.3.0'
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
  },
  ride: {
    speed: 1.7,
    accel: 0.55,
    smash: 1.8,
    push: 1.5,
  },
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
    scare: 60,
    directHit: 80,
    bonk: 80,
    duoShrink: 100,
    dropChance: 0.1,
    maxDrops: 4,
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
    enterTime: 1.6,
  },
  caps: { splats: 220, debris: 700 },
}

const GIFT_DROPS: PickupKind[] = ['clock', 'clock', 'skateboard', 'megaphone', 'pacifier', 'rattle', 'milk', 'milk']
const FAR_FINDS: PickupKind[] = ['clock', 'skateboard', 'megaphone']

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
    megaphone: false,
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
    duo: {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vz: 0,
      facing: 0,
      power: 0,
      state: 'chase',
      stateT: 0,
      peckCd: 2,
      hitFlash: 0,
    },
    boss: null,
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

// Random point inside the arena at least `margin` from the coast; null if unlucky.
function randomInside(s: State, margin: number, tries = 40): { x: number; z: number } | null {
  const A = s.arena
  for (let i = 0; i < tries; i++) {
    const x = range(s.rng, A.minX + margin, A.maxX - margin)
    const z = range(s.rng, A.minZ + margin, A.maxZ - margin)
    if (!pointInRing(x, z, A.ring)) continue
    if (closestOnRing(x, z, A.ring).d < margin) continue
    return { x, z }
  }
  return null
}

function farPoint(s: State, fromX: number, fromZ: number, margin: number, samples = 16): { x: number; z: number } {
  let best = { x: 0, z: 0 }
  let bestD = -1
  for (let i = 0; i < samples; i++) {
    const p = randomInside(s, margin, 10)
    if (!p) continue
    const d = dist(p.x, p.z, fromX, fromZ)
    if (d > bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

function populate(s: State, level: LevelDef) {
  const placed: { x: number; z: number; r: number }[] = []
  const free = (x: number, z: number, r: number) => {
    for (const p of placed) if (dist(x, z, p.x, p.z) < r + p.r + 0.7) return false
    return true
  }
  const place = (r: number, minFromSpawn: number): { x: number; z: number } | null => {
    for (let tries = 0; tries < 50; tries++) {
      const p = randomInside(s, r + 0.6, 12)
      if (!p) continue
      if (Math.hypot(p.x, p.z) < minFromSpawn + r) continue
      if (!free(p.x, p.z, r)) continue
      placed.push({ x: p.x, z: p.z, r })
      return p
    }
    return null
  }
  const placeFar = (r: number): { x: number; z: number } | null => {
    let best: { x: number; z: number } | null = null
    let bestD = -1
    for (let i = 0; i < 24; i++) {
      const p = randomInside(s, r + 1.0, 12)
      if (!p || !free(p.x, p.z, r)) continue
      const d = Math.hypot(p.x, p.z)
      if (d > bestD) {
        bestD = d
        best = p
      }
    }
    if (best) placed.push({ x: best.x, z: best.z, r })
    return best
  }
  let total = 0
  let drops = 0
  for (const [kind, count] of Object.entries(level.props) as [PropKind, number][]) {
    const st = PROP_STATS[kind]
    for (let i = 0; i < count; i++) {
      const pos = place(st.r, 3.5)
      if (!pos) continue
      let drop: PickupKind | null = null
      if (kind === 'gift') drop = pick(s.rng, GIFT_DROPS)
      else if (drops < CFG.wreck.maxDrops && rand(s.rng) < CFG.wreck.dropChance) {
        const roll = rand(s.rng)
        drop = roll < 0.5 ? 'milk' : roll < 0.75 ? 'pacifier' : 'rattle'
        drops++
      }
      s.props.push({
        id: newId(s),
        kind,
        x: pos.x,
        z: pos.z,
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
        drop,
      })
      total += st.points
    }
  }
  s.wreckGoalPoints = Math.max(1, Math.round(total * level.goalPct))
  for (const [kind, count] of Object.entries(level.npcs) as [NpcKind, number][]) {
    const st = NPC_STATS[kind]
    for (let i = 0; i < count; i++) {
      const pos = place(st.r, 7)
      if (!pos) continue
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
  for (const [kind, count] of Object.entries(level.finds) as [PickupKind, number][]) {
    for (let i = 0; i < count; i++) {
      const pos = FAR_FINDS.includes(kind) ? placeFar(0.4) : place(0.4, 6)
      if (!pos) continue
      s.pickups.push({ id: newId(s), kind, x: pos.x, y: 0, z: pos.z, vy: 0, age: 0 })
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
    updatePickups(s)
    return
  }
  s.runTime += DT
  updatePlayer(s, input)
  updateScream(s, input)
  updatePoops(s, input)
  updateProps(s)
  updateNpcs(s)
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
}

// Keeps o at least r inside the coast. Returns true when it touched the coast this tick.
export function clampArena(s: State, o: { x: number; z: number; vx: number; vz: number }, r: number): boolean {
  const ring = s.arena.ring
  const inside = pointInRing(o.x, o.z, ring)
  const h = closestOnRing(o.x, o.z, ring)
  if (!inside) {
    o.x = h.x + h.nx * r
    o.z = h.z + h.nz * r
    o.vx *= 0.3
    o.vz *= 0.3
    return true
  }
  if (h.d < r) {
    const push = r - h.d
    o.x += h.nx * push
    o.z += h.nz * push
    const vn = o.vx * h.nx + o.vz * h.nz
    if (vn < 0) {
      o.vx -= vn * h.nx * 1.3
      o.vz -= vn * h.nz * 1.3
    }
    return true
  }
  return false
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
  const riding = p.ride === 'skateboard'
  const slow = p.screamCharging ? 0.5 : 1
  const speed = C.speed * (riding ? CFG.ride.speed : 1) * slow
  const accel = C.accel * (riding ? CFG.ride.accel : 1)
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
  if (input.jump && !p.jumpHeld && p.grounded && p.jumpCd <= 0) {
    p.vy = C.jumpV
    p.grounded = false
    p.jumpCd = 0.2
    ev(s, { t: 'jump', x: p.x, z: p.z })
  }
  p.jumpHeld = input.jump
  if (!p.grounded) {
    p.vy -= CFG.gravity * DT
    p.y += p.vy * DT
    if (p.y <= 0) {
      p.y = 0
      p.vy = 0
      p.grounded = true
      ev(s, { t: 'land', x: p.x, z: p.z })
    }
  }
  p.x += p.vx * DT
  p.z += p.vz * DT
  clampArena(s, p, p.r)
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
}

export function hurtPlayer(s: State, dmg: number, fromX: number, fromZ: number, big = 0.5) {
  const p = s.player
  if (p.invuln > 0 || s.phase === 'over') return false
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
    p.ride = null
    spawnPickup(s, 'skateboard', p.x - (dx / d) * 1.5, p.z - (dz / d) * 1.5, 6)
    ev(s, { t: 'rideOff', x: p.x, z: p.z })
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
  s.wreck = s.wreckPoints / s.wreckGoalPoints
  const pct = (s.wreckPoints - before) / s.wreckGoalPoints
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
  return (S.baseRange + S.rangePerCharge * charge) * (p.pacifierT > 0 ? S.pacifierRange : 1) * (p.megaphone ? CFG.megaphone.range : 1)
}

function updateScream(s: State, input: Input) {
  const p = s.player
  const C = CFG.player
  p.screamCd = Math.max(0, p.screamCd - DT)
  if (input.scream && p.screamCd <= 0) {
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
    const wasScared = n.state === 'flee' || n.state === 'stunned'
    n.hp -= S.npcDamage * (0.5 + charge)
    n.hitFlash = 0.3
    if (n.state !== 'cower') {
      n.state = 'flee'
      n.stateT = S.scareTime + charge
    }
    const dx = n.x - p.x
    const dz = n.z - p.z
    const d = Math.hypot(dx, dz) || 1
    n.vx += (dx / d) * 5
    n.vz += (dz / d) * 5
    if (!wasScared) {
      s.stats.scared++
      addWreck(s, CFG.wreck.scare, n.x, n.z, 'SCARED!', 0x8ab4f8)
      ev(s, { t: 'npcScared', x: n.x, z: n.z, id: n.id })
    }
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

// ---------------------------------------------------------------- poop

function throwPoop(s: State, power: number) {
  const p = s.player
  const P = CFG.poop
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

function updatePoops(s: State, input: Input) {
  const p = s.player
  const C = CFG.player
  const P = CFG.poop
  p.poopCd = Math.max(0, p.poopCd - DT)
  const playing = s.phase !== 'over' && s.phase !== 'won'
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
          n.state = 'stunned'
          n.stateT = P.stun
          n.hp -= 20
          n.hitFlash = 0.4
          s.stats.directHits++
          addWreck(s, CFG.wreck.directHit, n.x, n.z, 'DIRECT HIT!', 0x8b5a2b)
          ev(s, { t: 'npcHit', x: n.x, z: n.z, id: n.id })
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
    if (hit || q.y <= 0) {
      addSplat(s, q.x, q.z, 0.45 + rand(s.rng) * 0.25)
      ev(s, { t: 'splat', x: q.x, z: q.z })
      s.poops.splice(i, 1)
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
  clampArena(s, { x: k.x, z: k.z, vx: 0, vz: 0 }, 0.5)
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
      p.ride = 'skateboard'
      ev(s, { t: 'rideOn', x: k.x, z: k.z })
      break
    case 'megaphone':
      p.megaphone = true
      break
  }
  ev(s, { t: 'pickup', x: k.x, z: k.z, kind: k.kind })
}

function updatePickups(s: State) {
  const p = s.player
  for (let i = s.pickups.length - 1; i >= 0; i--) {
    const k = s.pickups[i]
    k.age += DT
    if (k.vy !== 0 || k.y > 0) {
      k.vy -= CFG.gravity * DT
      k.y += k.vy * DT
      if (k.y <= 0) {
        k.y = 0
        k.vy = 0
      }
    }
    if (s.phase === 'over' || s.phase === 'won') continue
    if (k.age > 0.3 && k.y < 0.6 && dist(k.x, k.z, p.x, p.z) < p.r + 0.55 && p.y < 1) {
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
  const riding = p.ride === 'skateboard'
  for (const pr of s.props) {
    if (pr.broken) continue
    const damp = 1 - Math.min(1, 3.5 * DT)
    pr.vx *= damp
    pr.vz *= damp
    pr.angVel *= 1 - Math.min(1, 2.5 * DT)
    pr.x += pr.vx * DT
    pr.z += pr.vz * DT
    pr.rot += pr.angVel * DT
    clampArena(s, pr, pr.r)

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
          const push = ((speed * 1.6) / Math.max(0.6, pr.mass * 0.5)) * (riding ? CFG.ride.push : 1)
          pr.vx += nx * push
          pr.vz += nz * push
          pr.angVel += range(s.rng, -6, 6)
          damageProp(s, pr, speed * C.smashDamagePerSpeed * (riding ? CFG.ride.smash : 1))
          const slow = riding ? 0.35 : 0.6
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
        n.state = 'stunned'
        n.stateT = 1.2
        n.hp -= 15
        n.hitFlash = 0.4
        n.vx += pr.vx * 0.5
        n.vz += pr.vz * 0.5
        pr.vx *= 0.4
        pr.vz *= 0.4
        addWreck(s, CFG.wreck.bonk, n.x, n.z, 'BONK!', pr.color)
        ev(s, { t: 'npcHit', x: n.x, z: n.z, id: n.id })
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
    switch (n.state) {
      case 'wander': {
        if (n.stateT <= 0) {
          const t = randomInside(s, 1.5, 10)
          if (t) {
            n.targetX = t.x
            n.targetZ = t.z
          }
          n.stateT = range(s.rng, 2, 4.5)
        }
        const d = moveToward(n, n.targetX, n.targetZ, st.wanderSpeed, 4)
        if (d < 0.6) {
          n.vx *= 0.8
          n.vz *= 0.8
        }
        if (dp < st.detect && n.scaredCd <= 0 && s.phase === 'wreck') {
          n.state = 'chase'
          n.stateT = 0
        }
        break
      }
      case 'chase': {
        moveToward(n, p.x, p.z, st.chaseSpeed, 6)
        if (dp > st.detect + 4) {
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
        const wob = Math.sin(s.time * 9 + n.id) * 0.5
        moveToward(n, n.x + (dx / d) * 5 + wob, n.z + (dz / d) * 5 - wob, st.fleeSpeed, 7)
        if (n.stateT <= 0) {
          n.state = 'wander'
          n.stateT = 0
          n.scaredCd = 2.5
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
    clampArena(s, n, n.r)
    for (const pr of s.props) {
      if (pr.broken) continue
      const dx = n.x - pr.x
      const dz = n.z - pr.z
      const minD = n.r + pr.r
      if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue
      const d = Math.hypot(dx, dz)
      if (d < minD && d > 0.001) {
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
  const pos = farPoint(s, p.x, p.z, r + 1, 16)
  const b: Boss = {
    def,
    x: pos.x,
    y: 9,
    z: pos.z,
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
  for (const n of s.npcs) {
    n.state = 'cower'
    n.stateT = 999
  }
  ev(s, { t: 'bossEnter', x: b.x, z: b.z, label: def.name })
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
  let touchedCoast = false
  switch (b.state) {
    case 'enter': {
      b.y = Math.max(0, (b.stateT / B.enterTime) * 9)
      if (b.stateT <= 0) {
        b.y = 0
        b.state = 'idle'
        b.stateT = B.idle[ph] + 0.6
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
  touchedCoast = clampArena(s, b, b.r)
  if (b.state === 'attack' && b.attack === 'charge' && (b.stateT <= 0 || touchedCoast)) {
    b.vx = 0
    b.vz = 0
    ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: touchedCoast ? 0.7 : 0.3, label: 'skid' })
    enterExposed(s, b, B.exposed[ph] + (touchedCoast ? 0.5 : 0))
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
  if (s.phase === 'wreck' && s.wreckPoints >= s.wreckGoalPoints) {
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
    s.wreck = 1
  }
}

export type { State, Input, Player, Prop, Npc, Poop, Debris, Boss, Duogringo, GameEvent, Pickup }
