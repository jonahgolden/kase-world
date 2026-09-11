// Scripted player for smoke tests, screenshots and the title-screen demo. Not clever, just busy.
import type { Input, State } from './types.ts'
import { bossVulnerable } from './sim.ts'

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
