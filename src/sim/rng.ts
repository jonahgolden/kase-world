export interface Rng {
  s: number
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 || 1 }
}

// mulberry32: tiny, fast, deterministic across platforms
export function rand(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0
  let t = r.s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function range(r: Rng, a: number, b: number): number {
  return a + rand(r) * (b - a)
}

export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rand(r) * arr.length)]
}
