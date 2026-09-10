// Tiny polygon helpers for arena bounds. Rings are counter-clockwise in (x, z); interior is left of each edge.
export type Ring = [number, number][]

export function pointInRing(x: number, z: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const zi = ring[i][1]
    const xj = ring[j][0]
    const zj = ring[j][1]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export interface RingHit {
  x: number
  z: number
  d: number
  nx: number // inward normal
  nz: number
}

const hit: RingHit = { x: 0, z: 0, d: 0, nx: 0, nz: 1 }

// Closest point on the boundary. Returns a shared object; copy what you need.
export function closestOnRing(x: number, z: number, ring: Ring): RingHit {
  let best = Infinity
  let bx = 0
  let bz = 0
  let bnx = 0
  let bnz = 1
  for (let i = 0; i < ring.length; i++) {
    const ax = ring[i][0]
    const az = ring[i][1]
    const cx = ring[(i + 1) % ring.length][0]
    const cz = ring[(i + 1) % ring.length][1]
    const dx = cx - ax
    const dz = cz - az
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
    const px = ax + t * dx
    const pz = az + t * dz
    const d = (x - px) * (x - px) + (z - pz) * (z - pz)
    if (d < best) {
      best = d
      bx = px
      bz = pz
      const len = Math.sqrt(len2)
      bnx = -dz / len
      bnz = dx / len
    }
  }
  hit.x = bx
  hit.z = bz
  hit.d = Math.sqrt(best)
  hit.nx = bnx
  hit.nz = bnz
  return hit
}
