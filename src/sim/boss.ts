// Boss fights: spawn, landing, the ring, hit rules per fight, and every fight's per-tick behavior.
// Pure data like the rest of sim/. Shared helpers come from sim.ts (functions only, so the cycle is harmless).
import { pick, rand, range } from './rng.ts'
import { PROP_STATS } from './levels.ts'
import { pointInRing } from './geom.ts'
import { CFG, DT, addTimeBonus, addWreck, clampArena, currentLevel, damageProp, dist, ev, farPoint, featureAt, hurtPlayer, moveToward, newId, spawnPickup } from './sim.ts'
import type { Boss, BossAttack, BossFight, BossPart, State } from './types.ts'

// ---------------------------------------------------------------- boss

export function spawnBoss(s: State) {
  const def = currentLevel(s).boss
  const p = s.player
  const r = def.scale * 0.32
  const R = def.fight === 'runner' ? CFG.boss.runnerRingR : def.fight === 'games' ? CFG.boss.gamesRingR : def.fight === 'nest' ? CFG.boss.nestRingR : CFG.boss.ringR
  const clearOfFeatures = (x: number, z: number) => !featureAt(s, x, z, ['platform', 'lake', 'fan', 'portal'], R * 0.5)
  // fights with a track need the whole ring on land; the others may clip the coast a little
  const onLand = def.fight === 'runner' || def.fight === 'games' || def.fight === 'remix'
  let c = onLand ? farPoint(s, p.x, p.z, R + 0.4, 40, clearOfFeatures) : { x: 0, z: 0 }
  if (c.x === 0 && c.z === 0) c = farPoint(s, p.x, p.z, R * 0.75, 30, clearOfFeatures)
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
    cover: 0,
    lap: 0,
    parts: (def.parts ?? []).map((pd, i, arr) => {
      const a = (i / arr.length) * Math.PI * 2 + Math.PI / 4
      return { def: pd, x: c.x + Math.cos(a) * (R - 1.6), z: c.z + Math.sin(a) * (R - 1.6), facing: 0, done: false }
    }),
    plap: 0,
    pang: 0,
    roundT: 0,
    hideT: 0,
    charges: 0,
    status: '',
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
  if (b.def.fight === 'nest') {
    // Duogringo lands in his nest; the nest itself is a poop target that ends the minis
    const d = s.duo
    d.active = true
    d.x = b.x
    d.z = b.z
    d.y = 0.5
    d.power = 0.3
    d.state = 'chase'
    d.layCd = 1.5
    d.peckCd = 1.5
    d.nestWrecked = false
    const st = PROP_STATS.nest
    s.props.push({ id: newId(s), kind: 'nest', x: b.x, z: b.z, y: 0, vx: 0, vz: 0, vy: 0, rot: 0, angVel: 0, r: st.r, h: st.h, hp: st.hp, maxHp: st.hp, mass: st.mass, points: st.points, color: st.color, broken: false, hitFlash: 0, drop: null, cover: 0, promptCd: 0 })
  }
  if (!ring) {
    ev(s, { t: 'bossLand', x: b.x, z: b.z, big: 0.6 })
    return
  }
  for (const pr of s.props) {
    if (pr.broken || pr.kind === 'nest') continue
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

// The behavior in play right now. Columbus remixes three earlier fights, one per phase.
export function fightOf(b: Boss): BossFight {
  if (b.def.fight !== 'remix') return b.def.fight
  return (['charge', 'runner', 'poopcover'] as const)[Math.min(2, bossPhase(b))]
}

// Group fights: the animal currently stepping up. Decor parts never fight.
export function activePart(b: Boss): BossPart | null {
  const live = b.parts.filter((pt) => !pt.def.decor)
  if (!live.length) return null
  return live[Math.min(live.length - 1, bossPhase(b))]
}

// Round within the current phase (sumo bout, race lap): 0, 1, 2.
export function bossRound(b: Boss): number {
  return b.hits - bossPhase(b) * b.def.hitsPerPhase
}

export function bossVulnerable(b: Boss) {
  if (fightOf(b) === 'poopcover') return b.state !== 'enter' && b.state !== 'dead'
  return b.state === 'exposed' && b.invuln <= 0
}

export function bossHit(s: State, src: 'scream' | 'poop', bomb = false, charge = 1): boolean {
  const b = s.boss
  if (!b || b.state === 'dead' || b.state === 'enter') return false
  const fight = fightOf(b)
  const blocked = (label?: string) => {
    ev(s, { t: 'bossBlocked', x: b.x, z: b.z, label })
    return false
  }
  if (fight === 'poopcover') {
    if (src === 'scream') return blocked('POOP HIM!')
    const poops = b.def.coverPoops ?? CFG.boss.coverPoops
    b.cover = Math.min(1, b.cover + (bomb ? CFG.boss.bombPoops : 1) / poops)
    const remix = b.def.fight === 'remix'
    const base = remix ? bossPhase(b) * b.def.hitsPerPhase : 0
    const span = remix ? b.def.hitsPerPhase : b.totalHits
    b.hits = Math.min(b.totalHits, base + Math.round(b.cover * span))
    s.stats.bossHits++
    b.hitFlash = 0.3
    ev(s, { t: 'bossHurt', x: b.x, z: b.z, big: 0.4, label: 'SPLAT!' })
    if (b.hits >= b.totalHits) return bossDefeated(s, b)
    return true
  }
  if (fight === 'nest') {
    if (s.duo.state !== 'stun') return blocked('SHRINK HIM FIRST!')
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
  if (fight === 'horse') {
    if (src === 'poop') return blocked('SCREAM THE HORSE!')
    if (b.state === 'attack') {
      // the parry: a scream in the horse's face mid-charge throws the rider
      landHit(s, b, 'SPOOKED!')
      if (bossLive(b)) {
        b.state = 'hurt'
        b.stateT = CFG.boss.horse.thrown
        const dx = b.x - s.player.x
        const dz = b.z - s.player.z
        const d = Math.hypot(dx, dz) || 1
        b.vx = (dx / d) * 6
        b.vz = (dz / d) * 6
        b.charges = 0
      }
      return true
    }
    if (b.state === 'exposed' && b.invuln <= 0) return landHit(s, b, 'SCREAM HIT!')
    if (b.state === 'hurt' || b.invuln > 0) return false
    return blocked('WAIT FOR THE CHARGE!')
  }
  if (fight === 'group') {
    const part = activePart(b)
    if (!part || b.state === 'phaseChange') return false
    const w = part.def.weakness
    if (w === 'poop' && src !== 'poop') return blocked(part.def.blocked)
    if (w === 'scream') {
      if (src !== 'scream') return blocked(part.def.blocked)
      if (charge < CFG.boss.group.giraffeCharge) return blocked('HOLD SCREAM TO CHARGE IT!')
    }
    if (w === 'bomb' && !bomb) return blocked(part.def.blocked)
    if (w === 'wall' && b.state !== 'exposed') return blocked(part.def.blocked)
    if (b.invuln > 0) return false
    return landHit(s, b, bomb ? 'BOOM!' : src === 'poop' ? 'POOP HIT!' : 'SCREAM HIT!')
  }
  if (fight === 'games') {
    const part = activePart(b)
    if (!part || b.state === 'phaseChange') return false
    const w = part.def.weakness
    if (w === 'sumo') {
      if (src !== 'scream') return blocked(part.def.blocked)
      if (b.state === 'hurt') return false
      const dx = b.x - s.player.x
      const dz = b.z - s.player.z
      const d = Math.hypot(dx, dz) || 1
      const k = CFG.boss.sumo.shove + CFG.boss.sumo.shovePerCharge * charge
      b.vx += (dx / d) * k
      b.vz += (dz / d) * k
      b.hitFlash = 0.2
      ev(s, { t: 'bossHurt', x: b.x, z: b.z, big: 0.3, label: 'SHOVE!' })
      return true
    }
    if (w === 'race') return blocked(part.def.blocked)
    if (src !== 'poop') return blocked(part.def.blocked)
    landHit(s, b, 'GOT IT!')
    if (bossLive(b)) rockfishHide(s, b)
    return true
  }
  if (!bossVulnerable(b)) return blocked(fight === 'runner' ? 'MAKE HIM SLIP!' : undefined)
  return landHit(s, b, src === 'poop' ? 'POOP HIT!' : 'SCREAM HIT!')
}

// One registered hit. Always true (it landed); check bossLive(b) afterwards before touching him.
function landHit(s: State, b: Boss, label: string): boolean {
  const fight = fightOf(b)
  const prev = bossPhase(b)
  b.hits++
  s.stats.bossHits++
  b.hitFlash = 0.4
  b.invuln = 0.6
  ev(s, { t: 'bossHurt', x: b.x, z: b.z, big: 0.7, label })
  if (b.hits >= b.totalHits) return bossDefeated(s, b)
  if (bossPhase(b) !== prev) {
    if (b.parts.length) {
      const part = activePartAt(b, prev)
      if (part) {
        part.done = true
        part.x = b.x
        part.z = b.z
      }
      activatePart(s, b, true)
    } else {
      b.state = 'phaseChange'
      b.stateT = CFG.boss.phaseChangeTime
      b.vx = b.vz = 0
      b.cover = 0
      b.lap = 0
      ev(s, { t: 'bossPhase', x: b.x, z: b.z, big: 0.8, combo: bossPhase(b) })
    }
  } else if (fight === 'charge') {
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

// Fresh read after a hit landed (TS keeps the narrowed state otherwise): still fighting, not dead or switching.
function bossLive(b: Boss): boolean {
  return b.state !== 'dead' && b.state !== 'phaseChange'
}

function activePartAt(b: Boss, phase: number): BossPart | null {
  const live = b.parts.filter((pt) => !pt.def.decor)
  return live[Math.min(live.length - 1, phase)] ?? null
}

// A new animal steps into the ring: the boss body jumps to its spot and the fight resets for it.
function activatePart(s: State, b: Boss, announce: boolean) {
  const part = activePart(b)
  if (!part) return
  b.x = part.x
  b.z = part.z
  b.vx = b.vz = 0
  b.y = 0
  b.r = part.def.weakness === 'hidden' ? CFG.boss.rock.r : part.def.scale * 0.32
  b.cover = 0
  b.lap = 0
  b.plap = 0
  b.roundT = 0
  b.hideT = 0
  b.charges = 0
  b.invuln = 0
  b.state = 'phaseChange'
  b.stateT = CFG.boss.phaseChangeTime
  b.status = part.def.name.toUpperCase()
  if (part.def.weakness === 'bomb') spawnPotatoes(s, CFG.boss.group.potatoes)
  if (part.def.weakness === 'hidden') rockfishHide(s, b)
  if (announce) ev(s, { t: 'bossPhase', x: b.x, z: b.z, big: 0.8, combo: bossPhase(b), kind: 'part', label: part.def.hint })
}

function spawnPotatoes(s: State, n: number) {
  const ring = s.bossRing
  if (!ring) return
  const p = s.player
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 12; tries++) {
      const a = rand(s.rng) * Math.PI * 2
      const d = ring.r * (0.3 + 0.45 * rand(s.rng))
      const x = ring.x + Math.cos(a) * d
      const z = ring.z + Math.sin(a) * d
      if (dist(x, z, p.x, p.z) < 2.5 || !pointInRing(x, z, s.arena.ring)) continue
      spawnPickup(s, 'potato', x, z, 5)
      break
    }
  }
}

// The rockfish burrows and pops up somewhere else in the ring, never right under Kase.
function rockfishHide(s: State, b: Boss) {
  const ring = s.bossRing
  if (!ring) return
  const p = s.player
  for (let tries = 0; tries < 20; tries++) {
    const a = rand(s.rng) * Math.PI * 2
    const d = ring.r * 0.8 * Math.sqrt(rand(s.rng))
    const x = ring.x + Math.cos(a) * d
    const z = ring.z + Math.sin(a) * d
    if (dist(x, z, p.x, p.z) < 3.5 || !pointInRing(x, z, s.arena.ring)) continue
    b.x = x
    b.z = z
    break
  }
  b.vx = b.vz = 0
  b.y = 0
  b.hideT = CFG.boss.rock.hideEvery
  b.hitFlash = 0
  ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: 'hide' })
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
  ev(s, { t: 'bossDead', x: b.x, z: b.z, big: 1, label: b.def.name, kind: b.def.beaten })
  ev(s, { t: 'win', label: currentLevel(s).name })
  return true
}

function enterExposed(s: State, b: Boss, t: number) {
  b.state = 'exposed'
  b.stateT = t
  ev(s, { t: 'bossExposed', x: b.x, z: b.z, big: b.everExposed ? 0 : 1 })
  b.everExposed = true
}

export function updateBoss(s: State) {
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
      if (b.parts.length) activatePart(s, b, false)
      ev(s, { t: 'levelPhase', label: 'boss', big: 1, x: b.x, z: b.z })
    }
    return
  }
  const fight = fightOf(b)
  if (fight === 'nest') return
  if (fight === 'runner') return updateRunner(s, b, ph)
  if (fight === 'poopcover') return updatePoopcover(s, b, ph)
  if (fight === 'horse') return updateHorse(s, b, ph)
  if (fight === 'group') return updateGroup(s, b, ph)
  if (fight === 'games') return updateGames(s, b, ph)
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


function aimAt(b: Boss, x: number, z: number) {
  const dx = x - b.x
  const dz = z - b.z
  const d = Math.hypot(dx, dz) || 1
  b.dirX = dx / d
  b.dirZ = dz / d
}

function friction(b: Boss, k: number) {
  b.vx *= Math.max(0, 1 - k * DT)
  b.vz *= Math.max(0, 1 - k * DT)
}

function facePlayer(s: State, b: Boss) {
  b.facing = Math.atan2(s.player.x - b.x, s.player.z - b.z)
}

function chargeSmash(s: State, b: Boss, dmg: number) {
  const p = s.player
  if (dist(b.x, b.z, p.x, p.z) < b.r + p.r && p.y < 1.2) hurtPlayer(s, dmg, b.x, b.z, 0.8)
  for (const pr of s.props) {
    if (pr.broken) continue
    if (dist(b.x, b.z, pr.x, pr.z) < b.r + pr.r) {
      pr.vx += b.dirX * 8
      pr.vz += b.dirZ * 8
      damageProp(s, pr, 200, 0, 'boss')
    }
  }
}

function stomp(s: State, b: Boss, R: number, dmg: number) {
  const p = s.player
  if (dist(b.x, b.z, p.x, p.z) < R + p.r && p.grounded) hurtPlayer(s, dmg, b.x, b.z, 0.8)
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
}

// Genghis Khan: straight-line horse charges. A scream in the horse's face mid-charge throws him.
function updateHorse(s: State, b: Boss, ph: number) {
  const B = CFG.boss
  const H = CFG.boss.horse
  const p = s.player
  switch (b.state) {
    case 'idle': {
      moveToward(b, p.x, p.z, b.def.speed, 3)
      if (b.stateT <= 0) {
        aimAt(b, p.x, p.z)
        b.charges = ph >= 2 ? 2 : 1
        b.state = 'telegraph'
        b.stateT = B.telegraph[ph] + 0.25
        b.vx *= 0.2
        b.vz *= 0.2
        ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: 'charge' })
      }
      break
    }
    case 'telegraph': {
      friction(b, 6)
      aimAt(b, p.x, p.z)
      if (b.stateT <= 0) {
        b.state = 'attack'
        b.stateT = H.chargeTime
        ev(s, { t: 'bossAttack', x: b.x, z: b.z, label: 'charge', big: 0.5 })
      }
      break
    }
    case 'attack': {
      const sp = b.def.chargeSpeed * B.chargeMult[ph]
      b.vx = b.dirX * sp
      b.vz = b.dirZ * sp
      b.roundT = Math.max(0, b.roundT - DT)
      if (b.roundT > 0 && dist(b.x, b.z, p.x, p.z) < H.earlyRange) {
        b.roundT = 0
        bossHit(s, 'scream', false, 1)
        break
      }
      chargeSmash(s, b, b.def.damage)
      break
    }
    case 'hurt': {
      friction(b, 4)
      if (b.stateT <= 0) enterExposed(s, b, H.down)
      break
    }
    case 'exposed': {
      friction(b, 6)
      if (b.stateT <= 0) {
        b.state = 'idle'
        b.stateT = B.idle[ph]
      }
      break
    }
    case 'phaseChange': {
      friction(b, 4)
      if (b.stateT <= 0) {
        b.state = 'idle'
        b.stateT = B.idle[bossPhase(b)]
      }
      break
    }
  }
  b.x += b.vx * DT
  b.z += b.vz * DT
  const wall = clampArena(s, b, b.r)
  if (b.state === 'attack' && (b.stateT <= 0 || wall)) {
    b.charges--
    b.vx = b.vz = 0
    if (b.charges > 0) {
      // last phase: he wheels around for a second pass with a short warning
      aimAt(b, p.x, p.z)
      b.state = 'telegraph'
      b.stateT = H.rechargeTelegraph
      ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: 'charge' })
    } else {
      b.state = 'idle'
      b.stateT = B.idle[ph]
      ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: wall ? 0.6 : 0.2, label: 'skid' })
    }
  }
  if (b.state !== 'attack') facePlayer(s, b)
  b.status = ''
}

// The African Animal Group: four cards, one at a time, each with its own trick.
function updateGroup(s: State, b: Boss, ph: number) {
  const part = activePart(b)
  if (!part) return
  const B = CFG.boss
  const G = CFG.boss.group
  const p = s.player
  const ti = Math.min(2, ph)
  const dp = dist(b.x, b.z, p.x, p.z)
  const dmg = b.def.damage
  const kind = part.def.kind
  if (b.state === 'phaseChange') {
    friction(b, 4)
    if (b.stateT <= 0) {
      b.state = 'idle'
      b.stateT = B.idle[ti] + 0.5
    }
    facePlayer(s, b)
    return
  }
  if (kind === 'lion') {
    switch (b.state) {
      case 'idle':
        moveToward(b, p.x, p.z, b.def.speed, 3)
        if (b.stateT <= 0) {
          aimAt(b, p.x, p.z)
          b.state = 'telegraph'
          b.stateT = 0.7
          ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: 'pounce' })
        }
        break
      case 'telegraph':
        friction(b, 6)
        aimAt(b, p.x, p.z)
        if (b.stateT <= 0) {
          const d = Math.min(dp, G.pounceMax)
          const sp = d / G.pounceTime
          b.vx = b.dirX * sp
          b.vz = b.dirZ * sp
          b.state = 'attack'
          b.stateT = G.pounceTime
          ev(s, { t: 'bossAttack', x: b.x, z: b.z, label: 'pounce', big: 0.5 })
        }
        break
      case 'attack':
        b.y = Math.sin(Math.PI * (1 - Math.max(0, b.stateT) / G.pounceTime)) * 1.4
        if (b.stateT <= 0) {
          b.y = 0
          b.vx = b.vz = 0
          if (dp < G.pounceR + p.r && p.y < 1.2) hurtPlayer(s, dmg, b.x, b.z, 0.8)
          ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: 0.6, range: G.pounceR })
          b.state = 'exposed' // panting, but poop works any time
          b.stateT = 1.2
        }
        break
      case 'exposed':
        friction(b, 6)
        if (b.stateT <= 0) {
          b.state = 'idle'
          b.stateT = B.idle[ti]
        }
        break
      default:
        b.state = 'idle'
    }
  } else if (kind === 'giraffe') {
    switch (b.state) {
      case 'idle':
        moveToward(b, p.x, p.z, b.def.speed * 0.7, 2.5)
        if (b.stateT <= 0 && dp < 3.8) {
          b.state = 'telegraph'
          b.stateT = 0.9
          ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: 'stomp' })
        }
        break
      case 'telegraph':
        friction(b, 6)
        if (b.stateT <= 0) {
          b.state = 'attack'
          b.stateT = 0.3
          ev(s, { t: 'bossAttack', x: b.x, z: b.z, label: 'stomp', big: 0.5 })
        }
        break
      case 'attack':
        friction(b, 8)
        if (b.stateT <= 0) {
          stomp(s, b, G.kickR, dmg)
          b.state = 'idle'
          b.stateT = B.idle[ti] + 0.6
        }
        break
      default:
        b.state = 'idle'
    }
  } else if (kind === 'rhino') {
    switch (b.state) {
      case 'idle':
        moveToward(b, p.x, p.z, b.def.speed, 3)
        if (b.stateT <= 0) {
          aimAt(b, p.x, p.z)
          b.state = 'telegraph'
          b.stateT = B.telegraph[ti]
          b.vx *= 0.2
          b.vz *= 0.2
          ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: 'charge' })
        }
        break
      case 'telegraph':
        friction(b, 6)
        aimAt(b, p.x, p.z)
        if (b.stateT <= 0) {
          b.state = 'attack'
          b.stateT = G.rhinoCharge
          ev(s, { t: 'bossAttack', x: b.x, z: b.z, label: 'charge', big: 0.5 })
        }
        break
      case 'attack': {
        const sp = b.def.chargeSpeed * B.chargeMult[ti]
        b.vx = b.dirX * sp
        b.vz = b.dirZ * sp
        chargeSmash(s, b, dmg)
        break
      }
      case 'exposed':
        friction(b, 6)
        if (b.stateT <= 0) {
          b.state = 'idle'
          b.stateT = B.idle[ti]
        }
        break
      default:
        b.state = 'idle'
    }
  } else {
    // elephant
    switch (b.state) {
      case 'idle':
        moveToward(b, p.x, p.z, b.def.speed * 0.6, 2.5)
        if (b.stateT <= 0 && dp < 4.2) {
          b.state = 'telegraph'
          b.stateT = 1.0
          ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: 'stomp' })
        }
        break
      case 'telegraph':
        friction(b, 6)
        if (b.stateT <= 0) {
          b.state = 'attack'
          b.stateT = 0.35
          ev(s, { t: 'bossAttack', x: b.x, z: b.z, label: 'stomp', big: 0.6 })
        }
        break
      case 'attack':
        friction(b, 8)
        if (b.stateT <= 0) {
          stomp(s, b, G.stompR, dmg)
          b.state = 'idle'
          b.stateT = B.idle[ti] + 0.8
        }
        break
      default:
        b.state = 'idle'
    }
    // keep potatoes coming: when Kase has none and none are lying around, drop two more
    b.roundT = Math.max(0, b.roundT - DT)
    if (p.potatoes <= 0 && !s.pickups.some((k) => k.kind === 'potato') && !s.bombs.length) {
      if (b.roundT <= 0) {
        spawnPotatoes(s, 2)
        b.roundT = G.potatoRespawn
      }
    }
  }
  b.x += b.vx * DT
  b.z += b.vz * DT
  const wall = clampArena(s, b, b.r)
  if (kind === 'rhino' && b.state === 'attack' && (wall || b.stateT <= 0)) {
    b.vx = b.vz = 0
    if (wall) {
      ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: 0.8, label: 'skid' })
      enterExposed(s, b, G.dazed)
    } else {
      ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: 0.2, label: 'skid' })
      b.state = 'idle'
      b.stateT = B.idle[ti]
    }
  }
  if (b.state !== 'attack') facePlayer(s, b)
  b.status = part.def.name.toUpperCase()
}

// READY... for the emu dash. A skateboard waits on the track just ahead of Kase: grab it and fly.
function raceCountdown(s: State, b: Boss) {
  const ring = s.bossRing
  if (!ring) return
  const R = CFG.boss.race
  b.state = 'telegraph'
  b.stateT = R.countdown
  ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: 'race' })
  const p = s.player
  if (!p.ride && !s.pickups.some((k) => k.kind === 'skateboard')) {
    const a = Math.atan2(p.z - ring.z, p.x - ring.x) + R.boardAhead
    const trackR = ring.r - 1.4
    spawnPickup(s, 'skateboard', ring.x + Math.cos(a) * trackR, ring.z + Math.sin(a) * trackR, 4)
  }
}

// The Outback Games: kangaroo boxing (sumo), the emu dash (race), the rockfish (hide and seek).
function updateGames(s: State, b: Boss, ph: number) {
  const part = activePart(b)
  const ring = s.bossRing
  if (!part || !ring) return
  const p = s.player
  const round = Math.min(2, bossRound(b))
  const kind = part.def.kind
  if (b.state === 'phaseChange') {
    friction(b, 4)
    if (b.stateT <= 0) {
      if (kind === 'emu') {
        b.lap = Math.atan2(b.z - ring.z, b.x - ring.x)
        raceCountdown(s, b)
      } else {
        b.state = 'idle'
        b.stateT = 0.8
      }
    }
    facePlayer(s, b)
    return
  }
  if (kind === 'kangaroo') {
    const S = CFG.boss.sumo
    const fr = S.friction[round]
    const dp = dist(b.x, b.z, p.x, p.z)
    switch (b.state) {
      case 'idle':
        friction(b, fr)
        if (b.stateT <= 0) {
          aimAt(b, p.x, p.z)
          b.state = 'telegraph'
          b.stateT = S.crouch
          ev(s, { t: 'bossTelegraph', x: b.x, z: b.z, label: 'hop' })
        }
        break
      case 'telegraph':
        friction(b, fr)
        if (b.stateT <= 0) {
          aimAt(b, p.x, p.z)
          const d = Math.min(dp, S.hopDist)
          const sp = d / S.hopTime
          b.vx = b.dirX * sp
          b.vz = b.dirZ * sp
          b.state = 'attack'
          b.stateT = S.hopTime
          ev(s, { t: 'bossAttack', x: b.x, z: b.z, label: 'hop', big: 0.4 })
        }
        break
      case 'attack':
        b.y = Math.sin(Math.PI * (1 - Math.max(0, b.stateT) / S.hopTime)) * 1.6
        if (b.stateT <= 0) {
          b.y = 0
          b.vx *= 0.2
          b.vz *= 0.2
          if (dp < S.punchR + p.r && p.y < 1.2 && hurtPlayer(s, S.punch, b.x, b.z, 0.6)) {
            // a little bounce-back keeps the bout fluid instead of a dead stop
            b.vx = -b.dirX * 3
            b.vz = -b.dirZ * 3
          }
          ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: 0.5, range: S.punchR, label: 'punch' })
          b.state = 'idle'
          b.stateT = 0.7 - round * 0.1
        }
        break
      case 'hurt':
        // knocked out of the ring: dazed, then hops back to the middle
        friction(b, 4)
        if (b.stateT <= 0) {
          b.x = ring.x + range(s.rng, -2, 2)
          b.z = ring.z + range(s.rng, -2, 2)
          b.vx = b.vz = 0
          b.state = 'idle'
          b.stateT = 0.8
          ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: 0.4, label: 'skid' })
        }
        break
      default:
        b.state = 'idle'
    }
    b.x += b.vx * DT
    b.z += b.vz * DT
    clampArena(s, b, b.r, false)
    if (b.state !== 'hurt' && dist(b.x, b.z, ring.x, ring.z) > ring.r - 0.2) {
      landHit(s, b, 'RING OUT!')
      if (bossLive(b)) {
        b.state = 'hurt'
        b.stateT = S.out
        b.y = 0
      }
    }
    if (b.state !== 'attack') facePlayer(s, b)
    b.status = `BOUT ${Math.min(3, bossRound(b) + 1)} OF 3 · SHOVE IT OUT`
    return
  }
  if (kind === 'emu') {
    const R = CFG.boss.race
    const trackR = ring.r - 1.4
    const ang = (x: number, z: number) => Math.atan2(z - ring.z, x - ring.x)
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
    const onTrack = Math.abs(dist(p.x, p.z, ring.x, ring.z) - trackR) < R.band
    if (b.state === 'idle' || b.state === 'exposed' || b.state === 'hurt') raceCountdown(s, b)
    // the emu always stands on the track
    b.x = ring.x + Math.cos(b.lap) * trackR
    b.z = ring.z + Math.sin(b.lap) * trackR
    b.y = 0
    if (b.state === 'telegraph') {
      b.pang = ang(p.x, p.z)
      b.plap = 0
      b.roundT = 0
      b.hideT = 0
      if (b.stateT <= 0) {
        b.state = 'attack'
        ev(s, { t: 'bossAttack', x: b.x, z: b.z, label: 'race', big: 0.5 })
      }
      b.status = `LAP ${Math.min(3, bossRound(b) + 1)} OF 3 · READY...`
      return
    }
    // racing
    if (b.hideT > 0) {
      b.hideT -= DT
    } else {
      const da = (R.speed[round] / trackR) * DT
      b.lap += da
      b.roundT += da
      b.facing = Math.atan2(-Math.sin(b.lap), Math.cos(b.lap)) + Math.PI / 2
      for (let i = s.splats.length - 1; i >= 0; i--) {
        const sp2 = s.splats[i]
        if (dist(b.x, b.z, sp2.x, sp2.z) < b.r * 0.6 + sp2.r) {
          s.splats.splice(i, 1)
          b.hideT = R.trip
          b.hitFlash = 0.3
          ev(s, { t: 'bossSlip', x: b.x, z: b.z, big: 0.8, label: 'TRIPPED!' })
          break
        }
      }
    }
    const a = ang(p.x, p.z)
    const d = wrap(a - b.pang)
    b.pang = a
    if (onTrack) b.plap += d
    else if (s.tick % 90 === 0 && Math.hypot(p.vx, p.vz) > 0.5) ev(s, { t: 'bossBlocked', x: p.x, z: p.z, label: 'GET ON THE TRACK!' })
    const you = Math.min(1, Math.abs(b.plap) / (Math.PI * 2))
    const emu = Math.min(1, b.roundT / (Math.PI * 2))
    if (you >= 1) {
      landHit(s, b, 'YOU WIN THE LAP!')
      if (bossLive(b)) raceCountdown(s, b)
    } else if (emu >= 1) {
      hurtPlayer(s, R.kick, b.x, b.z, 0.5)
      ev(s, { t: 'bossStomp', x: p.x, z: p.z, big: 0.6, label: 'emu' })
      raceCountdown(s, b)
    }
    b.status = `LAP ${Math.min(3, bossRound(b) + 1)} OF 3 · YOU ${Math.round(you * 100)}% · EMU ${Math.round(emu * 100)}%`
    return
  }
  // rockfish
  const K = CFG.boss.rock
  b.r = K.r
  b.state = 'idle'
  b.hideT -= DT
  if (b.hideT <= 0) rockfishHide(s, b)
  // hot and cold: a bubble sound, faster and higher the closer Kase is
  const dd = dist(b.x, b.z, p.x, p.z)
  b.roundT -= DT
  if (dd < K.hintRange && b.roundT <= 0) {
    const near = 1 - dd / K.hintRange
    b.roundT = K.hintMin + (1 - near) * (K.hintMax - K.hintMin)
    ev(s, { t: 'rockHint', x: p.x, z: p.z, big: near })
  }
  if (p.y < 0.5 && p.invuln <= 0 && dist(b.x, b.z, p.x, p.z) < b.r + p.r) {
    hurtPlayer(s, K.spike, b.x, b.z, 0.6)
    b.hitFlash = K.reveal
    ev(s, { t: 'bossStomp', x: b.x, z: b.z, big: 0.5, label: 'spike' })
  }
  b.status = 'FIND THE ROCKFISH · POOP IT'
}

function pickAttack(s: State, b: Boss, ph: number): BossAttack {
  if (b.def.fight === 'stomper') return 'stomp'
  const dp = dist(b.x, b.z, s.player.x, s.player.z)
  if (ph === 0) return 'charge'
  if (dp < 3.5 && rand(s.rng) < 0.7) return 'stomp'
  return pick(s.rng, ph === 1 ? (['charge', 'charge', 'stomp'] as const) : (['charge', 'stomp'] as const))
}
