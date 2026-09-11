// Scripted player for smoke tests, screenshots and the title-screen demo. Not clever, just busy.
import type { Input, State } from './types.ts'
import { activePart, bossVulnerable, fightOf } from './sim.ts'

export function botInput(s: State): Input {
  const p = s.player
  const out: Input = { mx: 0, mz: 0, scream: false, poop: false, jump: false }
  const b = s.boss
  const period = s.tick % 120

  if (p.flying) {
    // hover toward the boss when stunned, else the nearest egg or wings; hold JUMP when the target is higher
    let tx = 0
    let tz = 0
    let ty = 3
    let best = Infinity
    if (b && b.def.fight === 'nest') {
      tx = s.duo.x
      tz = s.duo.z
      ty = s.duo.y
      best = 0
    }
    for (const k of s.pickups) {
      const d = Math.hypot(k.x - p.x, k.z - p.z)
      if (d < best) {
        best = d
        tx = k.x
        tz = k.z
        ty = k.y
      }
    }
    const dx = tx - p.x
    const dz = tz - p.z
    const d = Math.hypot(dx, dz) || 1
    out.mx = dx / d
    out.mz = dz / d
    out.jump = ty > p.y + 0.3 || (p.y < 1.5 && s.tick % 90 < 45)
    if (b && b.def.fight === 'nest') {
      const dd = Math.hypot(s.duo.x - p.x, s.duo.z - p.z)
      out.scream = dd < 7 && period < 40 && s.duo.state !== 'stun'
      out.poop = dd < 8 && s.duo.state === 'stun' && period % 20 < 3
    }
    return out
  }

  if (b && b.state !== 'enter' && b.state !== 'dead' && s.phase === 'boss') {
    // walk up to the boss and use the verb its fight wants; enough for screenshots and soak tests
    const fight = fightOf(b)
    const part = activePart(b)
    const w = part?.def.weakness
    const dx = b.x - p.x
    const dz = b.z - p.z
    const d = Math.hypot(dx, dz) || 1
    const want = w === 'race' ? 0 : fight === 'horse' ? 6 : 3.5
    if (d > want + 0.5) {
      out.mx = dx / d
      out.mz = dz / d
    }
    for (const k of s.pickups) {
      if (k.kind !== 'potato' || p.potatoes > 0) continue
      const kd = Math.hypot(k.x - p.x, k.z - p.z)
      if (kd < 9) {
        out.mx = (k.x - p.x) / kd
        out.mz = (k.z - p.z) / kd
      }
    }
    const scream = w === 'scream' || w === 'sumo' || fight === 'horse' || (w !== 'poop' && w !== 'bomb' && w !== 'hidden' && fight !== 'poopcover')
    if (fight === 'horse') out.scream = b.state === 'attack' && d < 5
    else if (scream) out.scream = period < 55 && (w === 'scream' || w === 'sumo' || bossVulnerable(b))
    else out.poop = period % 30 < 3
    if (w === 'sumo') out.poop = false
    return out
  }

  // level goals with a thing to chase, push or reach
  const g = s.goal
  if (s.phase === 'wreck') {
    let tx: number | null = null
    let tz = 0
    let shout = false
    if (g.kind === 'chase') {
      const king = s.npcs.find((n) => n.kind === 'king')
      if (king) {
        tx = king.x
        tz = king.z
        shout = Math.hypot(king.x - p.x, king.z - p.z) < 5
      }
    } else if (g.kind === 'grow') {
      const ball = s.props.find((pr) => pr.kind === 'snowball')
      if (ball) {
        // push from the side away from the arena center so the ball rolls somewhere open
        const dx = ball.x - p.x
        const dz = ball.z - p.z
        const d = Math.hypot(dx, dz) || 1
        tx = ball.x + (d > 1.3 ? 0 : dx / d) * 0.5
        tz = ball.z + (d > 1.3 ? 0 : dz / d) * 0.5
      }
    } else if (g.kind === 'protect') {
      let best: { x: number; z: number; d: number } | null = null
      for (const n of s.npcs) {
        if (n.kind !== 'thief' || (n.state !== 'raid' && n.state !== 'drink')) continue
        const d = Math.hypot(n.x - p.x, n.z - p.z)
        if (!best || d < best.d) best = { x: n.x, z: n.z, d }
      }
      if (best) {
        tx = best.x
        tz = best.z
        shout = best.d < 5
      }
    } else if (g.kind === 'hunt') {
      let best: { x: number; z: number; d: number } | null = null
      for (const n of s.npcs) {
        if (n.kind !== g.npc) continue
        const d = Math.hypot(n.x - p.x, n.z - p.z)
        if (!best || d < best.d) best = { x: n.x, z: n.z, d }
      }
      if (best) {
        tx = best.x
        tz = best.z
        shout = best.d < 4.5
        if (best.d < 1.6) {
          // do not sit on a jelly
          tx = p.x + (p.x - best.x)
          tz = p.z + (p.z - best.z)
        }
      }
    } else if ((g.kind === 'escape' || g.kind === 'race') && s.goalPos) {
      tx = s.goalPos.x
      tz = s.goalPos.z
      if (g.kind === 'race' && s.rival && Math.hypot(s.rival.x - p.x, s.rival.z - p.z) < 5) shout = period < 30
    }
    if (tx !== null) {
      const d = Math.hypot(tx - p.x, tz - p.z) || 1
      out.mx = (tx - p.x) / d
      out.mz = (tz - p.z) / d
      out.scream = shout && period < 40
      out.poop = g.kind === 'hunt' && shout && period >= 60 && period < 64
      if (s.tick % 200 === 0) out.jump = true
      return out
    }
  }

  let pickup: { x: number; z: number; d: number; y: number } | null = null
  for (const k of s.pickups) {
    if (k.y > 1.5) continue // tall platforms need a fan; the bot is not that clever
    const d = Math.hypot(k.x - p.x, k.z - p.z)
    const want = s.goal.kind === 'find' && k.kind === s.goal.item ? 999 : 6
    if (d < want && (!pickup || d < pickup.d)) pickup = { x: k.x, z: k.z, d, y: k.y }
  }
  if (s.goal.kind === 'find' && !pickup) {
    for (const pr of s.props) {
      if (pr.broken || pr.kind !== 'crate') continue
      const d = Math.hypot(pr.x - p.x, pr.z - p.z)
      if (!pickup || d < pickup.d) pickup = { x: pr.x, z: pr.z, d, y: 0 }
    }
  }
  if (pickup) {
    out.mx = (pickup.x - p.x) / pickup.d
    out.mz = (pickup.z - p.z) / pickup.d
    if (pickup.y > 0.3 && pickup.d < 5.5 && s.tick % 25 === 0) out.jump = true
    return out
  }

  let best: { x: number; z: number; d: number } | null = null
  for (const pr of s.props) {
    if (pr.broken) continue
    const d = Math.hypot(pr.x - p.x, pr.z - p.z)
    if (!best || d < best.d) best = { x: pr.x, z: pr.z, d }
  }
  let nearNpc: { x: number; z: number; d: number } | null = null
  for (const n of s.npcs) {
    const d = Math.hypot(n.x - p.x, n.z - p.z)
    if (!nearNpc || d < nearNpc.d) nearNpc = { x: n.x, z: n.z, d }
  }
  if (nearNpc && nearNpc.d < 5) {
    out.mx = (nearNpc.x - p.x) / nearNpc.d
    out.mz = (nearNpc.z - p.z) / nearNpc.d
    out.scream = period < 40
    out.poop = period >= 60 && period < 64
    return out
  }
  if (best) {
    out.mx = (best.x - p.x) / best.d
    out.mz = (best.z - p.z) / best.d
  }
  if (period >= 90 && period < 93) out.poop = true
  if (s.tick % 400 === 0) out.jump = true
  return out
}
