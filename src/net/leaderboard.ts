export interface TimeRow {
  id?: number
  name: string
  level: string
  timeMs: number
  levelsCleared: number
  createdAt?: string
  mine?: boolean
}

const NAME_KEY = 'kw.name'
const BEST_KEY = 'kw.best'

export const playerName = {
  get(): string {
    try {
      return localStorage.getItem(NAME_KEY) ?? ''
    } catch {
      return ''
    }
  },
  set(v: string) {
    try {
      localStorage.setItem(NAME_KEY, v)
    } catch {
      /* ignore */
    }
  },
}

export function localBests(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

// Returns true when this time is a new personal best for the board.
export function saveLocalBest(board: string, timeMs: number): boolean {
  const bests = localBests()
  const prev = bests[board]
  if (prev !== undefined && prev <= timeMs) return false
  bests[board] = timeMs
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(bests))
  } catch {
    /* ignore */
  }
  return true
}

export async function fetchBoard(board: string, limit = 20): Promise<TimeRow[] | null> {
  try {
    const res = await fetch(`/api/times?board=${encodeURIComponent(board)}&limit=${limit}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { times: TimeRow[] }
    return data.times
  } catch {
    return null
  }
}

export interface SubmitPayload {
  name: string
  kind: 'level' | 'world'
  level: string
  timeMs: number
  levelsCleared: number
  version: string
  stats: Record<string, number>
}

export async function submitTime(payload: SubmitPayload): Promise<{ ok: boolean; rank?: number; error?: string }> {
  try {
    const res = await fetch('/api/times', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await res.json()) as { ok?: boolean; rank?: number; error?: string }
    return { ok: !!data.ok, rank: data.rank, error: data.error }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export function fmtMs(ms: number): string {
  const s = ms / 1000
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`
}
