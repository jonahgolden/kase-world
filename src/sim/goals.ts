// Level goals that need per-tick work or hooks: the Chicken King chase, snowball meter, stampede,
// milk thieves, the pigeon race, jelly hunt. Pure data; helpers come from sim.ts (functions only).
import { closestOnRing } from './geom.ts'
import { NPC_STATS, PROP_STATS } from './levels.ts'
import { CFG, DT, addWreck, coastClear, damageProp, dist, ev, farPoint, hurtPlayer, inCone, moveToward, newId, randomInside, spawnPickup } from './sim.ts'
import type { Npc, State } from './types.ts'

// ---------------------------------------------------------------- level goals

export function goalCount(s: State): number {
  const g = s.goal
  return g.kind === 'find' || g.kind === 'chase' || g.kind === 'protect' || g.kind === 'hunt' ? g.count : g.kind === 'race' ? g.checkpoints : 0
}

// A catch: touch him, scream him, or poop him. He poofs into a floating chicken finger (grab it: that is
// the +1) and pops back up far away with a head start. The last catch is the last of him.
export function kingCaught(s: State, n: Npc) {
  if (s.goal.kind !== 'chase' || s.phase !== 'wreck' || n.scaredCd > 0) return
  const pending = s.pickups.filter((k) => k.kind === 'finger').length
  if (s.found + pending >= s.goal.count) return
  const p = s.player
  addWreck(s, NPC_STATS.king.bonk, n.x, n.z, 'CAUGHT!', 0xffd23f)
  ev(s, { t: 'kingPoof', x: n.x, z: n.z, big: 1 })
  s.pickups.push({ id: newId(s), kind: 'finger', x: n.x, y: 1.1, z: n.z, vy: 0, age: 0, float: true })
  n.scaredCd = CFG.king.catchCd
  if (s.found + pending + 1 >= s.goal.count) {
    // that was his last life: he runs home crying
    n.hp = -999
    s.npcs = s.npcs.filter((m) => m !== n)
    return
  }
  const far = farPoint(s, p.x, p.z, 2, 30, (x, z) => dist(x, z, p.x, p.z) > CFG.king.fleeDist)
  if (far.x !== 0 || far.z !== 0) {
    n.x = far.x
    n.z = far.z
  }
  n.vx = n.vz = 0
  n.state = 'wander'
  n.stateT = CFG.king.taunt
  n.cover = 0
  ev(s, { t: 'kingPoof', x: n.x, z: n.z, big: 0 })
}

export function thiefRepelled(s: State, n: Npc) {
  if (s.goal.kind !== 'protect' || s.phase !== 'wreck' || (n.state !== 'raid' && n.state !== 'drink')) return
  s.found++
  s.wreck = Math.min(1, s.found / s.goal.count)
  n.scaredCd = 99 // leaving for good
  addWreck(s, NPC_STATS.thief.bonk, n.x, n.z, 'MILK SAVED!', 0xbfe6ff)
  ev(s, { t: 'found', x: n.x, z: n.z, points: s.found, kind: 'thief' })
}

function spawnThief(s: State) {
  const p = s.player
  let best: { x: number; z: number } | null = null
  let bestD = -1
  for (let i = 0; i < 24; i++) {
    const q = randomInside(s, 1.2, 4)
    if (!q) continue
    const h = closestOnRing(q.x, q.z, s.arena.ring)
    const x = h.x + h.nx * 1.0
    const z = h.z + h.nz * 1.0
    const d = dist(x, z, p.x, p.z)
    if (d > bestD) {
      bestD = d
      best = { x, z }
    }
  }
  if (!best) return
  const st = NPC_STATS.thief
  s.npcs.push({ id: newId(s), kind: 'thief', x: best.x, z: best.z, vx: 0, vz: 0, facing: 0, r: st.r, hp: st.hp, state: 'raid', stateT: 0, targetX: best.x, targetZ: best.z, scaredCd: 0, color: st.color, hitFlash: 0, scale: 1, cover: 0 })
  ev(s, { t: 'npcScared', x: best.x, z: best.z, kind: 'thief', big: 0 })
}

// Where "that way" is right now: the thing the meter wants next. Null when there is nothing to point at.
export function goalTarget(s: State): { x: number; z: number } | null {
  const p = s.player
  const nearest = <T extends { x: number; z: number }>(list: T[]): T | null => {
    let best: T | null = null
    let bd = Infinity
    for (const o of list) {
      const d = dist(o.x, o.z, p.x, p.z)
      if (d < bd) {
        bd = d
        best = o
      }
    }
    return best
  }
  if (s.phase === 'boss' && s.boss) return s.boss.def.fight === 'nest' ? { x: s.duo.x, z: s.duo.z } : { x: s.boss.x, z: s.boss.z }
  if (s.phase !== 'wreck') return null
  const g = s.goal
  switch (g.kind) {
    case 'wreck':
      return nearest(s.props.filter((pr) => !pr.broken && pr.kind !== 'evilbaby' && pr.kind !== 'statue' && pr.kind !== 'glass'))
    case 'find':
      return nearest([...s.pickups.filter((k) => k.kind === g.item), ...s.props.filter((pr) => !pr.broken && pr.kind === 'crate')])
    case 'chase':
      return nearest(s.pickups.filter((k) => k.kind === 'finger')) ?? nearest(s.npcs.filter((n) => n.kind === 'king'))
    case 'grow':
      return nearest(s.props.filter((pr) => pr.kind === 'snowball' && !pr.broken))
    case 'escape':
    case 'race':
      return s.goalPos
    case 'protect':
      return nearest(s.npcs.filter((n) => n.kind === 'thief' && (n.state === 'raid' || n.state === 'drink'))) ?? s.goalPos
    case 'hunt':
      return nearest(s.npcs.filter((n) => n.kind === g.npc))
  }
}

// Stuck? 25 s without the meter moving and the game points the way (repeats while still stuck).
function updateStuck(s: State) {
  if (s.phase !== 'wreck') return
  if (s.wreck > s.lastWreck + 1e-6) {
    s.progressT = 0
    s.lastWreck = s.wreck
  } else s.progressT += DT
  if (s.progressT >= CFG.hint.stuckAfter) {
    s.progressT = 0
    ev(s, { t: 'stuckHint', x: s.player.x, z: s.player.z })
  }
}

// Stampede front, milk thieves, the pigeon, the snowball meter: everything a goal shape needs per tick.
export function updateGoal(s: State) {
  updateGoalInner(s)
  updateStuck(s)
}

function updateGoalInner(s: State) {
  if (s.phase !== 'wreck') return
  const p = s.player
  const g = s.goal
  if (g.kind === 'grow') {
    const ball = s.props.find((pr) => pr.kind === 'snowball' && !pr.broken)
    const r0 = PROP_STATS.snowball.r
    s.wreck = ball ? Math.max(0, Math.min(1, (ball.r - r0) / (g.size - r0))) : 0
  } else if (g.kind === 'escape' && s.stampede && s.goalPos) {
    const st = s.stampede
    const S = CFG.stampede
    st.hitCd = Math.max(0, st.hitCd - DT)
    if (st.surgeT > 0) st.surgeT -= DT
    else {
      st.warnT -= DT
      if (st.warnT <= 0) {
        st.surgeT = S.surgeTime
        st.warnT = S.every
        ev(s, { t: 'surge', big: 1 })
      } else if (st.warnT <= S.warn && st.warnT + DT > S.warn) ev(s, { t: 'surge', big: 0 })
    }
    st.front += (st.surgeT > 0 ? S.surge : S.speed) * DT
    const proj = (x: number, z: number) => x * st.dirX + z * st.dirZ
    const pp = proj(p.x, p.z)
    s.wreck = Math.max(0, Math.min(1, (pp - st.start) / (st.end - st.start)))
    // the herd flattens what it runs over
    for (const pr of s.props) {
      if (pr.broken || pr.kind === 'evilbaby') continue
      const q = proj(pr.x, pr.z)
      if (q < st.front && q > st.front - 3) {
        pr.vx += st.dirX * 9
        pr.vz += st.dirZ * 9
        damageProp(s, pr, 500, 0, 'boss')
      }
    }
    for (const n of s.npcs) {
      const q = proj(n.x, n.z)
      if (q < st.front && q > st.front - 2.5 && n.state !== 'stunned' && n.state !== 'cower') {
        n.state = 'stunned'
        n.stateT = 1.5
        n.vx += st.dirX * 6
        n.vz += st.dirZ * 6
      }
    }
    if (pp < st.front && p.y < 0.9 && p.ride !== 'giraffe' && st.hitCd <= 0) {
      st.hitCd = S.hitCd
      hurtPlayer(s, S.damage, p.x - st.dirX * 2, p.z - st.dirZ * 2, 0.9, 'TRAMPLED!')
      p.vx += st.dirX * S.shove
      p.vz += st.dirZ * S.shove
      p.vy = Math.max(p.vy, 4)
      p.grounded = false
      ev(s, { t: 'trampled', x: p.x, z: p.z, big: 1 })
    }
  } else if (g.kind === 'protect' && s.goalPos) {
    s.waveT -= DT
    if (s.waveT <= 0) {
      spawnThief(s)
      s.waveT = Math.max(CFG.protect.waveMin, CFG.protect.wave - s.found * 0.2)
    }
    // full or frightened thieves leave the continent
    s.npcs = s.npcs.filter((n) => !(n.kind === 'thief' && n.state === 'flee' && dist(n.x, n.z, p.x, p.z) > CFG.protect.leaveDist && coastClear(s, n.x, n.z) < 3))
    s.wreck = Math.min(1, s.found / g.count)
  } else if (g.kind === 'race' && s.rival) {
    const R = CFG.race
    const rv = s.rival
    rv.hitFlash = Math.max(0, rv.hitFlash - DT)
    // far ahead? the pigeon gets distracted and pecks at something: help for the player behind, never a cheat
    if (rv.stallT <= 0 && rv.cp - s.found >= R.distractLead) {
      rv.peckT -= DT
      if (rv.peckT <= 0) {
        rv.peckT = R.distractEvery
        rv.stallT = R.distractFor
        ev(s, { t: 'npcScared', x: rv.x, z: rv.z, kind: 'pigeon', big: 0 })
      }
    } else if (rv.cp - s.found < R.distractLead) rv.peckT = R.distractEvery
    if (rv.stallT > 0) {
      rv.stallT -= DT
      rv.vx *= 1 - 5 * DT
      rv.vz *= 1 - 5 * DT
    } else {
      const t = s.checkpoints[rv.cp]
      if (t) {
        const d = moveToward(rv, t.x, t.z, R.pigeonSpeed, 4)
        if (d < 1.2) rv.cp++
      }
      if (rv.cp >= s.checkpoints.length) {
        rv.cp = 0
        rv.laps++
        rv.x = 0
        rv.z = 0
        hurtPlayer(s, R.penalty, p.x + 1, p.z, 0.6, 'PIGEON LAPPED YOU!')
        ev(s, { t: 'rivalWin', x: p.x, z: p.z, big: 1 })
      }
    }
    rv.x += rv.vx * DT
    rv.z += rv.vz * DT
    rv.y = R.pigeonY + Math.sin(s.time * 3) * 0.2
    const gate = s.goalPos
    if (gate && p.y < 2 && dist(p.x, p.z, gate.x, gate.z) < R.gateR + p.r) {
      s.found++
      s.wreck = s.found / g.checkpoints
      addWreck(s, 150, gate.x, gate.z, `GATE ${s.found}!`, 0x4cd137)
      ev(s, { t: 'found', x: gate.x, z: gate.z, points: s.found, kind: 'gate' })
      s.goalPos = s.checkpoints[s.found] ?? null
    }
  }
}

// The pigeon in the scream cone loses its nerve for a moment.
export function screamRival(s: State, rangeLen: number) {
  const rv = s.rival
  const p = s.player
  if (!rv || s.goal.kind !== 'race') return
  if (inCone(p.x, p.z, p.facing, rv.x, rv.z, 0.5, rangeLen, CFG.scream.halfAngle)) {
    rv.stallT = CFG.race.stall
    rv.hitFlash = 0.4
    addWreck(s, 120, rv.x, rv.z, 'PIGEON STALLED!', 0xbfe6ff)
    ev(s, { t: 'npcScared', x: rv.x, z: rv.z, kind: 'pigeon', big: 1 })
  }
}

export function goalMet(s: State): boolean {
  if (s.goalDone) return true
  const g = s.goal
  switch (g.kind) {
    case 'wreck':
      return s.wreckPoints >= s.wreckGoalPoints
    case 'find':
    case 'chase':
    case 'protect':
    case 'hunt':
      return s.found >= g.count
    case 'race':
      return s.found >= g.checkpoints
    case 'grow': {
      const ball = s.props.find((pr) => pr.kind === 'snowball' && !pr.broken)
      return !!ball && ball.r >= g.size
    }
    case 'escape':
      return !!s.goalPos && dist(s.player.x, s.player.z, s.goalPos.x, s.goalPos.z) < CFG.stampede.flagR
  }
}
