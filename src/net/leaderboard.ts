export interface TimeRow {
  id?: number
  name: string
  level: string
  timeMs: number
  levelsCleared: number
  createdAt?: string
  mine?: boolean
  home?: boolean // a name that has played on this device
}

const NAME_KEY = 'kw.name'
const BEST_KEY = 'kw.best'
const HOUSE_KEY = 'kw.names'

// Everyone who has typed a name on this device: the household board.
export function householdNames(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HOUSE_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function rememberName(n: string) {
  if (!n) return
  const names = householdNames()
  if (names.includes(n)) return
  names.push(n)
  try {
    localStorage.setItem(HOUSE_KEY, JSON.stringify(names.slice(-12)))
  } catch {
    /* ignore */
  }
}

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

const ADMIN_KEY = 'kw.admin'

export const adminToken = {
  get(): string {
    try {
      return localStorage.getItem(ADMIN_KEY) ?? ''
    } catch {
      return ''
    }
  },
  set(v: string) {
    try {
      if (v) localStorage.setItem(ADMIN_KEY, v)
      else localStorage.removeItem(ADMIN_KEY)
    } catch {
      /* ignore */
    }
  },
}

export async function adminCheck(): Promise<boolean> {
  const t = adminToken.get()
  if (!t) return false
  try {
    const res = await fetch('/api/admin', { headers: { authorization: `Bearer ${t}` }, cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

// Wipe a leaderboard: a level id, 'world', or 'all'. Returns the number of rows removed, or -1 on failure.
export async function adminClearBoard(board: string): Promise<number> {
  const t = adminToken.get()
  if (!t) return -1
  try {
    const res = await fetch(`/api/times?board=${encodeURIComponent(board)}`, { method: 'DELETE', headers: { authorization: `Bearer ${t}` } })
    if (!res.ok) return -1
    const data = (await res.json()) as { deleted?: number }
    return data.deleted ?? 0
  } catch {
    return -1
  }
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
