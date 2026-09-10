import { LEVEL_IDS } from '../src/sim/levels.ts'

interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  SUBMIT_LIMIT: RateLimit
}

const MAX_NAME = 12
const MAX_LIMIT = 50
const MAX_POINTS_PER_SEC = 3000
const MIN_DURATION_MS = 4000

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
      if (url.pathname === '/api/scores' && req.method === 'GET') return getScores(url, env)
      if (url.pathname === '/api/scores' && req.method === 'POST') return postScore(req, env)
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

async function getScores(url: URL, env: Env): Promise<Response> {
  const board = url.searchParams.get('board') === 'today' ? 'today' : 'alltime'
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 20))
  const where = board === 'today' ? "WHERE created_at >= strftime('%Y-%m-%dT00:00:00Z', 'now')" : ''
  const { results } = await env.DB.prepare(
    `SELECT id, name, score, level, levels_cleared AS levelsCleared, created_at AS createdAt
     FROM scores ${where} ORDER BY score DESC, created_at ASC LIMIT ?`,
  )
    .bind(limit)
    .all()
  return json({ board, scores: results }, 200, { 'cache-control': 'public, max-age=5' })
}

async function postScore(req: Request, env: Env): Promise<Response> {
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
  const score = Number(body.score)
  const level = String(body.level ?? '')
  const levelsCleared = Math.max(0, Math.min(LEVEL_IDS.length, Math.floor(Number(body.levelsCleared) || 0)))
  const durationMs = Math.floor(Number(body.durationMs) || 0)
  const version = String(body.version ?? '').slice(0, 20)
  const stats = body.stats && typeof body.stats === 'object' ? JSON.stringify(body.stats).slice(0, 2000) : null

  if (!name) return json({ error: 'bad name' }, 400)
  if (!Number.isFinite(score) || score < 0 || score > 50_000_000 || Math.floor(score) !== score) return json({ error: 'bad score' }, 400)
  if (!LEVEL_IDS.includes(level)) return json({ error: 'bad level' }, 400)
  if (durationMs < MIN_DURATION_MS) return json({ error: 'too short' }, 400)
  if (score > (durationMs / 1000) * MAX_POINTS_PER_SEC + 5000 + levelsCleared * 6000) return json({ error: 'implausible' }, 400)

  const ipHash = await sha256(ip + '|kase')
  const ins = await env.DB.prepare(
    `INSERT INTO scores (name, score, level, levels_cleared, duration_ms, version, stats, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(name, score, level, levelsCleared, durationMs, version, stats, ipHash)
    .run()
  const rankRow = await env.DB.prepare('SELECT COUNT(*) AS above FROM scores WHERE score > ?').bind(score).first<{ above: number }>()
  const rank = (rankRow?.above ?? 0) + 1
  return json({ ok: true, id: ins.meta.last_row_id, rank })
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}
