// Adaptive quality policy: pure so it can be tested. The renderer applies the tier, main.ts feeds frame times.
export type Quality = 'high' | 'mid' | 'low'

export const QUALITY_DOWN_MS = 22 // 30-frame average above this: step down (about 45 fps)
export const QUALITY_UP_MS = 13 // 30-frame average below this: step up (about 75 fps headroom)
export const QUALITY_WINDOW = 30

const ORDER: Quality[] = ['low', 'mid', 'high']

// One step at a time, with a dead band between the thresholds so it never flaps.
export function nextQuality(current: Quality, avgFrameMs: number): Quality {
  const i = ORDER.indexOf(current)
  if (avgFrameMs > QUALITY_DOWN_MS && i > 0) return ORDER[i - 1]
  if (avgFrameMs < QUALITY_UP_MS && i < ORDER.length - 1) return ORDER[i + 1]
  return current
}

export function pixelRatioFor(q: Quality, touch: boolean): number {
  const cap = q === 'high' ? (touch ? 1.75 : 2) : q === 'mid' ? 1.25 : 1
  return Math.min(window.devicePixelRatio || 1, cap)
}

export function shadowMapFor(q: Quality, touch: boolean): number {
  return q === 'high' ? (touch ? 1024 : 2048) : q === 'mid' ? 512 : 0
}
