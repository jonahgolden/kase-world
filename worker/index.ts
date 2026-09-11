import { LEVEL_IDS } from '../src/sim/levels.ts'

interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  SUBMIT_LIMIT: RateLimit
  ADMIN_TOKEN?: string // wrangler secret; unlocks DELETE /api/times and GET /api/admin
}

const MAX_NAME = 12
const MAX_LIMIT = 50
const MIN_LEVEL_MS = 15_000
const MAX_LEVEL_MS = 2 * 60 * 60 * 1000

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  })

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)
    try {
      if (url.pathname === '/api/health') return json({ ok: true })
      if (url.pathname === '/api/times' && req.method === 'GET') return getTimes(url, env)
      if (url.pathname === '/api/times' && req.method === 'POST') return postTime(req, env)
      if (url.pathname === '/api/admin' && req.method === 'GET') return isAdmin(req, env) ? json({ ok: true }) : json({ error: 'no' }, 401)
      if (url.pathname === '/api/times' && req.method === 'DELETE') return deleteTimes(req, url, env)
      return json({ error: 'not found' }, 404)
    } catch (e) {
      return json({ error: 'server error', detail: String(e) }, 500)
    }
  },
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _\-!?.]/gu, '')
    .trim()
    .slice(0, MAX_NAME)
  return name.length >= 1 ? name : null
}

function parseBoard(url: URL): { kind: 'level' | 'world'; level: string } | null {
  const board = url.searchParams.get('board') ?? 'world'
  if (board === 'world') return { kind: 'world', level: 'world' }
  if (LEVEL_IDS.includes(board)) return { kind: 'level', level: board }
  return null
}

async function getTimes(url: URL, env: Env): Promise<Response> {
  const board = parseBoard(url)
  if (!board) return json({ error: 'bad board' }, 400)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 20))
  const { results } = await env.DB.prepare(
    `SELECT id, name, level, time_ms AS timeMs, levels_cleared AS levelsCleared, created_at AS createdAt
     FROM times WHERE kind = ? AND level = ? ORDER BY time_ms ASC, created_at ASC LIMIT ?`,
  )
    .bind(board.kind, board.level, limit)
    .all()
  return json({ board: board.level, times: results }, 200, { 'cache-control': 'public, max-age=5' })
}

async function postTime(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await env.SUBMIT_LIMIT.limit({ key: ip })
  if (!success) return json({ error: 'slow down' }, 429)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  const name = cleanName(body.name)
  const kind = body.kind === 'world' ? 'world' : 'level'
  const level = kind === 'world' ? 'world' : String(body.level ?? '')
  const timeMs = Math.floor(Number(body.timeMs) || 0)
  const levelsCleared = Math.max(0, Math.min(LEVEL_IDS.length, Math.floor(Number(body.levelsCleared) || 0)))
  const version = String(body.version ?? '').slice(0, 20)
  const stats = body.stats && typeof body.stats === 'object' ? JSON.stringify(body.stats).slice(0, 2000) : null

  if (!name) return json({ error: 'bad name' }, 400)
  if (kind === 'level' && !LEVEL_IDS.includes(level)) return json({ error: 'bad level' }, 400)
  if (kind === 'world' && levelsCleared < LEVEL_IDS.length) return json({ error: 'world run incomplete' }, 400)
  const minMs = kind === 'world' ? MIN_LEVEL_MS * LEVEL_IDS.length : MIN_LEVEL_MS
  const maxMs = kind === 'world' ? MAX_LEVEL_MS * LEVEL_IDS.length : MAX_LEVEL_MS
  if (timeMs < minMs || timeMs > maxMs) return json({ error: 'implausible time' }, 400)

  const ipHash = await sha256(ip + '|kase')
  const ins = await env.DB.prepare(
    `INSERT INTO times (name, kind, level, time_ms, levels_cleared, version, stats, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(name, kind, level, timeMs, levelsCleared, version, stats, ipHash)
    .run()
  const rankRow = await env.DB.prepare('SELECT COUNT(*) AS faster FROM times WHERE kind = ? AND level = ? AND time_ms < ?')
    .bind(kind, level, timeMs)
    .first<{ faster: number }>()
  const rank = (rankRow?.faster ?? 0) + 1
  return json({ ok: true, id: ins.meta.last_row_id, rank })
}

function isAdmin(req: Request, env: Env): boolean {
  const token = env.ADMIN_TOKEN
  if (!token) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${token}`
}

// Admin: wipe one board (?board=<level>|world) or everything (?board=all).
async function deleteTimes(req: Request, url: URL, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return json({ error: 'no' }, 401)
  const board = url.searchParams.get('board') ?? ''
  let res
  if (board === 'all') res = await env.DB.prepare('DELETE FROM times').run()
  else {
    const parsed = parseBoard(url)
    if (!parsed) return json({ error: 'bad board' }, 400)
    res = await env.DB.prepare('DELETE FROM times WHERE kind = ? AND level = ?').bind(parsed.kind, parsed.level).run()
  }
  return json({ ok: true, deleted: res.meta.changes ?? 0 })
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}
