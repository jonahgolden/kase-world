// Personal-best ghost: Kase's path sampled at 10 Hz, packed as a flat array of tenths so it fits localStorage.
// Pure helpers; the driver (main.ts) records and saves, the renderer draws.
export const GHOST_DT = 0.1
export const GHOST_MAX = 6000 // 10 minutes

export interface GhostPoint {
  x: number
  y: number
  z: number
}

export function packGhost(points: GhostPoint[]): number[] {
  const out: number[] = []
  for (const p of points.slice(0, GHOST_MAX)) out.push(Math.round(p.x * 10), Math.round(p.y * 10), Math.round(p.z * 10))
  return out
}

// Position at time t along the track, linearly interpolated; null once the track has ended.
export function ghostAt(track: number[], t: number): GhostPoint | null {
  const n = track.length / 3
  if (n === 0 || t < 0) return null
  const f = t / GHOST_DT
  const i = Math.floor(f)
  if (i >= n - 1) return i >= n + 5 ? null : { x: track[(n - 1) * 3] / 10, y: track[(n - 1) * 3 + 1] / 10, z: track[(n - 1) * 3 + 2] / 10 }
  const k = f - i
  const a = i * 3
  const b = a + 3
  return { x: (track[a] + (track[b] - track[a]) * k) / 10, y: (track[a + 1] + (track[b + 1] - track[a + 1]) * k) / 10, z: (track[a + 2] + (track[b + 2] - track[a + 2]) * k) / 10 }
}

const GHOST_KEY = 'kw.ghost.'

export function loadGhost(levelId: string): number[] | null {
  try {
    const raw = localStorage.getItem(GHOST_KEY + levelId)
    if (!raw) return null
    const arr = JSON.parse(raw) as number[]
    return Array.isArray(arr) && arr.length >= 6 ? arr : null
  } catch {
    return null
  }
}

export function saveGhost(levelId: string, track: number[]) {
  try {
    localStorage.setItem(GHOST_KEY + levelId, JSON.stringify(track))
  } catch {
    /* storage full or blocked: no ghost, no harm */
  }
}
