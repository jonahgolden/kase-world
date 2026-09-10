export interface ScoreRow {
  id?: number
  name: string
  score: number
  level: string
  levelsCleared: number
  createdAt?: string
  mine?: boolean
}

export type Board = 'alltime' | 'today'

const NAME_KEY = 'kw.name'
const LOCAL_KEY = 'kw.scores'

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

export function localScores(): ScoreRow[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as ScoreRow[]
  } catch {
    return []
  }
}

export function saveLocal(row: ScoreRow) {
  const rows = localScores()
  rows.push(row)
  rows.sort((a, b) => b.score - a.score)
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(0, 30)))
  } catch {
    /* ignore */
  }
}

export function localBest(): number {
  return localScores()[0]?.score ?? 0
}

export async function fetchBoard(board: Board, limit = 20): Promise<ScoreRow[] | null> {
  try {
    const res = await fetch(`/api/scores?board=${board}&limit=${limit}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { scores: ScoreRow[] }
    return data.scores
  } catch {
    return null
  }
}

export interface SubmitPayload {
  name: string
  score: number
  level: string
  levelsCleared: number
  durationMs: number
  version: string
  stats: Record<string, number>
}

export async function submitScore(payload: SubmitPayload): Promise<{ ok: boolean; rank?: number; error?: string }> {
  try {
    const res = await fetch('/api/scores', {
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
