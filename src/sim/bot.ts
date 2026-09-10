// Scripted player for smoke tests, screenshots and the title-screen demo. Not clever, just busy.
import type { Input, State } from './types.ts'
import { bossVulnerable } from './sim.ts'

export function botInput(s: State): Input {
  const p = s.player
  const out: Input = { mx: 0, mz: 0, scream: false, poop: false, jump: false }
  const b = s.boss
  const period = s.tick % 120

  if (b && b.state !== 'enter' && b.state !== 'dead') {
    const dx = b.x - p.x
    const dz = b.z - p.z
    const d = Math.hypot(dx, dz) || 1
    if (b.state === 'attack' || b.state === 'telegraph') {
      out.mx = -dz / d
      out.mz = dx / d
      if (b.attack === 'stomp' && d < 5 && s.tick % 20 === 0) out.jump = true
    } else if (d > 4.5) {
      out.mx = dx / d
      out.mz = dz / d
    } else if (bossVulnerable(b)) {
      out.mx = (dx / d) * 0.2
      out.mz = (dz / d) * 0.2
      out.scream = period < 45
      out.poop = period % 30 < 4
    }
    return out
  }

  let pickup: { x: number; z: number; d: number } | null = null
  for (const k of s.pickups) {
    const d = Math.hypot(k.x - p.x, k.z - p.z)
    if (d < 6 && (!pickup || d < pickup.d)) pickup = { x: k.x, z: k.z, d }
  }
  if (pickup) {
    out.mx = (pickup.x - p.x) / pickup.d
    out.mz = (pickup.z - p.z) / pickup.d
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
