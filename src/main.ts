import './ui/styles.css'
import { DT, VERSION, createState, currentLevel, devBeatBoss, goalTarget, nextLevelState, skipToBoss, step, fightOf } from './sim/sim.ts'
import { botInput } from './sim/bot.ts'
import { LEVELS } from './sim/levels.ts'
import type { GameEvent, State } from './sim/types.ts'
import { Renderer } from './render/renderer.ts'
import type { PrevSnap } from './render/renderer.ts'
import { Globe } from './render/globe.ts'
import { InputDriver } from './input/input.ts'
import { AudioDriver } from './audio/audio.ts'
import { Ui, goalShort, medalFor } from './ui/ui.ts'
import { adminCheck, adminClearBoard, adminToken, fetchBoard, fmtMs, householdNames, localBests, playerName, rememberName, saveLocalBest, submitTime } from './net/leaderboard.ts'
import type { TimeRow } from './net/leaderboard.ts'
import { GHOST_DT, GHOST_MAX, loadGhost, packGhost, saveGhost } from './ghost.ts'
import type { GhostPoint } from './ghost.ts'

const params = new URLSearchParams(location.search)
// ?admin=<token> once on a device keeps admin on; admin implies dev (every level open)
if (params.get('admin')) adminToken.set(params.get('admin')!)
let admin = !!adminToken.get()
const dev = params.has('dev') || admin
let adminSkipOnStart = false
const bot = params.has('bot')
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window

const canvas = document.getElementById('c') as HTMLCanvasElement
const uiRoot = document.getElementById('ui') as HTMLElement

type Mode = 'title' | 'choose' | 'fly' | 'play' | 'paused' | 'won' | 'over' | 'board' | 'help' | 'admin'
const GLOBE_MODES: Mode[] = ['title', 'choose', 'fly', 'board', 'help', 'admin']
let mode: Mode = 'title'
let state: State | null = null
let acc = 0
let last = performance.now()
let hitstop = 0
let name = 'KASE'
let endTimer = 0
let runStartIndex = 0
const prevSnap: PrevSnap = { player: { x: 0, y: 0, z: 0, facing: 0 }, duo: { x: 0, y: 0, z: 0 }, boss: null, npcs: new Map(), props: new Map(), poops: new Map() }

function snapshot(s: State) {
  prevSnap.player.x = s.player.x
  prevSnap.player.y = s.player.y
  prevSnap.player.z = s.player.z
  prevSnap.player.facing = s.player.facing
  prevSnap.duo.x = s.duo.x
  prevSnap.duo.y = s.duo.y
  prevSnap.duo.z = s.duo.z
  prevSnap.boss = s.boss ? { x: s.boss.x, y: s.boss.y, z: s.boss.z } : null
  prevSnap.npcs.clear()
  for (const n of s.npcs) prevSnap.npcs.set(n.id, { x: n.x, z: n.z })
  prevSnap.props.clear()
  for (const pr of s.props) if (!pr.broken && (pr.vx !== 0 || pr.vz !== 0 || pr.angVel !== 0)) prevSnap.props.set(pr.id, { x: pr.x, z: pr.z, rot: pr.rot })
  prevSnap.poops.clear()
  for (const q of s.poops) prevSnap.poops.set(q.id, { x: q.x, y: q.y, z: q.z })
}
let chosen = 0
let helpFromGame = false

const PROGRESS_KEY = 'kw.progress'
const BABY_TALK = ['mm milk', 'car car!', 'MINE', "where's my hat", 'ba ba boo', 'goo?', 'num num', 'no nap!', 'uh oh', 'bapple', 'doggy!', 'moo', 'dada?', 'MORE!', 'blah bleh', 'ni-ni', 'wawa', 'bubbles', 'tickle tickle', 'ooh shiny']
let babyTalkIdx = Math.floor(Math.random() * BABY_TALK.length)
function loadUnlocked(): number {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as { unlocked?: number }
    return Math.min(LEVELS.length - 1, Math.max(0, p.unlocked ?? 0))
  } catch {
    return 0
  }
}
function saveUnlocked(i: number) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ unlocked: Math.max(loadUnlocked(), i) }))
  } catch {
    /* ignore */
  }
}
let unlocked = dev ? LEVELS.length - 1 : loadUnlocked()

const audio = new AudioDriver()
audio.muted = params.has('mute')
void audio.loadManifest()

const ui = new Ui(
  uiRoot,
  {
    onPlay: (n, levelId) => launch(n, levelId ?? LEVELS[0].id),
    onNext: () => nextLevel(),
    onRestart: () => restartLevel(),
    onRestartLevel: () => restartLevel(true),
    onTitle: () => goTitle(),
    onResume: () => resume(),
    onPause: () => pause(),
    onToggleSound: () => {
      audio.muted = !audio.muted
      return !audio.muted
    },
    onBoard: (b) => void showBoard(b),
    onChoose: () => openChooser(true),
    onChooseMove: (dir) => moveChoice(dir),
    onGo: () => launch((uiRoot.querySelector('#name') as HTMLInputElement).value.trim(), LEVELS[chosen].id),
    onAdminOpen: () => {
      audio.play('ui')
      mode = 'admin'
      ui.show('admin')
    },
    onAdminLevel: (id) => launch((uiRoot.querySelector('#name') as HTMLInputElement).value.trim() || 'admin', id),
    onAdminSkipToggle: () => (adminSkipOnStart = !adminSkipOnStart),
    onAdminSkipNow: () => {
      if (state && mode === 'paused') {
        skipToBoss(state)
        resume()
      }
    },
    onAdminBeatBoss: () => {
      if (state && mode === 'paused') {
        if (!devBeatBoss(state)) skipToBoss(state)
        resume()
      }
    },
    onAdminResetLocal: () => {
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith('kw.') && k !== 'kw.admin' && k !== 'kw.name') localStorage.removeItem(k)
      } catch {
        /* ignore */
      }
      unlocked = dev ? LEVELS.length - 1 : 0
      globe.setProgress({ unlocked, bests: localBests() }, null)
    },
    onAdminClearBoard: (b) => adminClearBoard(b),
    onAdminLogout: () => {
      adminToken.set('')
      admin = false
      adminSkipOnStart = false
      ui.setAdmin(false, false)
      goTitle()
    },
  },
  touch,
  dev,
)
const input = new InputDriver(uiRoot, canvas)
const renderer = new Renderer(canvas, touch)
input.aimProvider = (sx, sy) => {
  if (!state) return null
  const hit = renderer.groundPoint(sx, sy, state.player.y)
  if (!hit) return null
  const dx = hit.x - state.player.x
  const dz = hit.z - state.player.z
  const d = Math.hypot(dx, dz)
  if (d < 0.6) return null
  return { x: dx / d, z: dz / d }
}
const globe = new Globe()

ui.setName(params.get('name') ?? playerName.get())
ui.show('title')
if (admin) {
  ui.setAdmin(true, adminSkipOnStart)
  void adminCheck().then((ok) => {
    if (!ok) ui.adminMsg('Admin token not accepted by the server (offline, or the secret changed).')
  })
}

function unlockAudio() {
  audio.unlock()
}
window.addEventListener('pointerdown', unlockAudio, { passive: true })
window.addEventListener('keydown', unlockAudio)

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && (mode === 'over' || mode === 'won' || mode === 'paused')) restartLevel()
  if (e.code === 'Enter' && mode === 'won') nextLevel()
  if (e.code === 'KeyM') audio.muted = !audio.muted
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') pause()
    else if (mode === 'paused') resume()
    else if (mode === 'help' || mode === 'board' || mode === 'choose' || mode === 'admin') goTitle()
  }
  if (mode === 'choose') {
    if (e.code === 'ArrowLeft') moveChoice(-1)
    if (e.code === 'ArrowRight') moveChoice(1)
    if (e.code === 'Enter') launch((uiRoot.querySelector('#name') as HTMLInputElement).value.trim(), LEVELS[chosen].id)
  }
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play' && !bot) pause()
  acc = 0
  last = performance.now()
})

function setName(n: string) {
  name = (n || 'KASE').toUpperCase().slice(0, 12)
  playerName.set(name)
}

// Title -> fly to the continent -> level.
function launch(n: string, levelId: string) {
  setName(n)
  rememberName(n)
  const idx = Math.max(0, LEVELS.findIndex((l) => l.id === levelId))
  if (idx > unlocked && !dev) return
  runStartIndex = idx
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1_000_000)
  const next = createState({ seed, levelId, assist: assistFor(levelId) })
  audio.unlock()
  audio.play('ui')
  flyInto(next, true)
}

function flyInto(next: State, fresh: boolean) {
  mode = 'fly'
  ui.show('title')
  uiRoot.querySelector<HTMLElement>('#title')!.hidden = true
  globe.setProgress({ unlocked, bests: localBests() }, next.levelId)
  globe.flyTo(next.levelId, true, () => {
    ui.fade(true)
    window.setTimeout(() => {
      state = next
      beginLevel(fresh)
      window.setTimeout(() => ui.fade(false), 120)
    }, 380)
  })
}

function nextLevel() {
  if (!state) return
  const next = nextLevelState(state)
  if (!next) return
  ui.fade(true)
  window.setTimeout(() => {
    globe.spin()
    globe.flyTo(state!.levelId, false, undefined, 0.01)
    window.setTimeout(() => {
      ui.fade(false)
      flyInto(next, false)
    }, 100)
  }, 380)
}

// A boss loss retries the boss: same seed (same continent), clock resumed from when he landed.
function restartLevel(whole = false) {
  if (!state) return
  const atBoss = !whole && state.phase === 'over' && !!state.boss
  const seed = atBoss ? state.seed : Number(params.get('seed')) || Math.floor(Math.random() * 1_000_000)
  const wreckTime = atBoss ? Math.max(0, state.time - state.phaseT) : 0
  state = createState({ seed, levelId: state.levelId, assist: assistFor(state.levelId), timeOffset: wreckTime })
  if (atBoss) skipToBoss(state)
  beginLevel(!atBoss)
}

// Quiet difficulty help: every game over on a level buys one extra heart next try (max 2), gone on a clear.
const FAILS_KEY = 'kw.fails'
function loadFails(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FAILS_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}
function saveFails(f: Record<string, number>) {
  try {
    localStorage.setItem(FAILS_KEY, JSON.stringify(f))
  } catch {
    /* ignore */
  }
}
function assistFor(levelId: string): number {
  return Math.min(2, loadFails()[levelId] ?? 0)
}
function noteFail(levelId: string) {
  const f = loadFails()
  f[levelId] = (f[levelId] ?? 0) + 1
  saveFails(f)
}
function clearFails(levelId: string) {
  const f = loadFails()
  if (f[levelId]) {
    delete f[levelId]
    saveFails(f)
  }
}
let thiefWarns = 0
// collecting streak: pickups close together climb in pitch
let pickupAt = -10
let pickupStreak = 0
function pickupPitch(): number {
  const now = performance.now() / 1000
  pickupStreak = now - pickupAt < 2 ? Math.min(5, pickupStreak + 1) : 0
  pickupAt = now
  return 1 + pickupStreak * 0.08
}
// personal-best ghost: this run's path, sampled every GHOST_DT
let ghostRec: GhostPoint[] = []
let ghostNextT = 0

function beginLevel(fresh: boolean) {
  if (!state) return
  if ((params.get('skip') === 'boss' || adminSkipOnStart) && fresh) skipToBoss(state)
  thiefWarns = 0
  acc = 0
  hitstop = 0
  endTimer = 0
  ghostRec = []
  ghostNextT = 0
  renderer.setLevel(state)
  if (params.get('ghost') === 'demo') {
    // dev: a synthetic lap so the ghost can be seen without a saved best
    const demo: GhostPoint[] = []
    for (let i = 0; i < 600; i++) demo.push({ x: Math.cos(i * 0.05) * 8, y: 0, z: Math.sin(i * 0.05) * 8 })
    renderer.setGhost(packGhost(demo))
  } else renderer.setGhost(bot ? null : loadGhost(state.levelId))
  ui.show('hud')
  ui.updateHud(state, 0)
  ui.showCard(state)
  mode = 'play'
  audio.unlock()
  audio.play('levelPhase', { vol: 0.4 })
  audio.music(!!currentLevel(state).sky)
  if (touch && !bot && !params.has('auto') && !document.fullscreenElement) {
    try {
      document.documentElement.requestFullscreen?.()?.catch(() => {})
    } catch {
      /* iOS: no element fullscreen */
    }
  }
}

function pause() {
  if (mode !== 'play') return
  mode = 'paused'
  ui.hideCard()
  ui.showHelp(true, !audio.muted, state ?? undefined)
  audio.play('ui')
}

function resume() {
  if (mode !== 'paused') return
  mode = 'play'
  acc = 0
  last = performance.now()
  ui.show('hud')
  audio.play('ui')
}

function goTitle() {
  audio.play('ui')
  audio.music(false)
  mode = 'title'
  state = null
  helpFromGame = false
  ui.hideCard()
  ui.fade(false)
  ui.show('title')
  globe.setProgress({ unlocked, bests: localBests() }, null)
  globe.spin()
}

function openChooser(fromPlay = false) {
  audio.play('ui')
  mode = 'choose'
  chosen = fromPlay ? unlocked : Math.min(unlocked, chosen)
  ui.show('choose')
  showChoice()
}

function moveChoice(dir: -1 | 1) {
  chosen = (chosen + dir + LEVELS.length) % LEVELS.length
  audio.play('ui')
  showChoice()
}

function showChoice() {
  const lvl = LEVELS[chosen]
  const locked = chosen > unlocked && !dev
  const best = localBests()[lvl.id]
  const medal = best !== undefined ? medalFor(best) : null
  const sub = locked
    ? `Locked. Conquer ${LEVELS[chosen - 1].name} first.`
    : best !== undefined
      ? `Your best: ${fmtMs(best)} ${medal === 'gold' ? '🥇' : medal === 'silver' ? '🥈' : medal === 'bronze' ? '🥉' : ''} · boss: ${lvl.boss.name}`
      : `Not conquered yet · boss: ${lvl.boss.name}`
  ui.setChoice(lvl.name, sub, locked)
  globe.setProgress({ unlocked, bests: localBests() }, lvl.id)
  globe.flyTo(lvl.id, false, undefined, 0.8)
}

async function onLevelCleared(s: State) {
  clearFails(s.levelId)
  const timeMs = Math.round(s.clearTime * 1000)
  const isBest = saveLocalBest(s.levelId, timeMs)
  if (isBest && !bot && ghostRec.length > 10) saveGhost(s.levelId, packGhost(ghostRec))
  if (s.levelIndex + 1 > unlocked) {
    unlocked = Math.min(LEVELS.length - 1, s.levelIndex + 1)
    saveUnlocked(unlocked)
  }
  const hasNext = s.levelIndex + 1 < LEVELS.length
  mode = 'won'
  ui.showWon(s, hasNext, timeMs, isBest)
  const levelId = s.levelId
  const res = bot
    ? { ok: false as const, error: 'bot' }
    : await submitTime({ name, kind: 'level', level: levelId, timeMs, levelsCleared: s.levelsCleared, version: VERSION, stats: { ...s.stats } })
  let sub = res.ok ? `World rank #${res.rank} for ${currentLevel(s).name}` : `Time kept on this device (${res.error ?? 'offline'})`
  if (isBest) sub = 'NEW PERSONAL BEST! ' + sub
  if (!hasNext && runStartIndex === 0 && s.levelsCleared >= LEVELS.length && !bot) {
    const runMs = Math.round(s.runTime * 1000)
    saveLocalBest('world', runMs)
    const w = await submitTime({ name, kind: 'world', level: 'world', timeMs: runMs, levelsCleared: s.levelsCleared, version: VERSION, stats: { ...s.stats } })
    sub += w.ok ? ` · Whole world in ${fmtMs(runMs)}, rank #${w.rank}` : ` · Whole world in ${fmtMs(runMs)}`
  }
  const rows = await fetchBoard(levelId, 8)
  if (rows) {
    const mine = rows.findIndex((r) => r.name === name && r.timeMs === timeMs)
    if (mine >= 0) rows[mine].mine = true
    // the household contest: whoever else in this house holds the best time here
    const house = householdNames().filter((h) => h !== name)
    let rival: TimeRow | null = null
    for (const r of rows) {
      if (!house.includes(r.name)) continue
      r.home = true
      if (!rival || r.timeMs < rival.timeMs) rival = r
    }
    if (rival) {
      const diff = Math.abs(rival.timeMs - timeMs)
      sub += timeMs < rival.timeMs ? ` · You beat ${rival.name} by ${fmtMs(diff)}!` : ` · ${rival.name} is ${fmtMs(diff)} ahead. Get 'em!`
    }
    ui.renderBoard('won-board', rows, undefined, levelId)
  }
  ui.setWonSub(sub)
}

async function showBoard(board: string) {
  audio.play('ui')
  mode = 'board'
  ui.show('board')
  ui.setBoardTab(board)
  ui.renderBoard('board-list', [], 'Loading...')
  const rows = await fetchBoard(board, 20)
  const best = localBests()[board]
  if (rows) {
    const house = householdNames()
    for (const r of rows) if (house.includes(r.name)) r.home = true
    ui.renderBoard('board-list', rows, best ? `No times online yet. Your best here: ${fmtMs(best)}` : undefined, board)
  }
  else ui.renderBoard('board-list', null, best ? `Offline. Your best here: ${fmtMs(best)}` : 'Offline')
}

function handleEvents(s: State) {
  for (const e of s.events) {
    renderer.onEvent(e, s)
    playSound(e)
    switch (e.t) {
      case 'wreck': {
        const pt = renderer.project(e.x ?? s.player.x, 1.4, e.z ?? s.player.z)
        const pct = Math.round((e.pct ?? 0) * 100)
        const color = e.color !== undefined ? '#' + e.color.toString(16).padStart(6, '0') : '#ffd23f'
        if (e.label) ui.popup(e.label, pt.x, pt.y, color, 0.6)
        else if (pct >= 1) ui.popup(`+${pct}%`, pt.x, pt.y, '#ffd23f', Math.min(1.4, pct / 6))
        break
      }
      case 'combo': {
        if ((e.combo ?? 0) >= 3) {
          const pt = renderer.project(s.player.x, 2.1, s.player.z)
          ui.popup(`COMBO x${e.combo}`, pt.x + 30, pt.y, '#ff5c5c', 0.5 + Math.min(1, (e.combo ?? 0) / 8))
        }
        break
      }
      case 'smash':
        hitstop = Math.max(hitstop, 0.02 + (e.big ?? 0) * 0.06)
        break
      case 'playerHurt': {
        hitstop = Math.max(hitstop, 0.06)
        buzz(30)
        const pt = renderer.project(e.x ?? 0, 2.6, e.z ?? 0)
        ui.popup(e.label ?? 'OUCH!', pt.x, pt.y, '#ff5c5c', 0.9)
        break
      }
      case 'pickup': {
        const pt = renderer.project(e.x ?? 0, 1.6, e.z ?? 0)
        const labels: Record<string, [string, string]> = {
          milk: [BABY_TALK[babyTalkIdx++ % BABY_TALK.length], '#ff5c5c'],
          pacifier: ['MEGA SCREAM!', '#ffd23f'],
          rattle: ['POOP STORM!', '#d9a066'],
          clock: ['', '#4cd137'],
          skateboard: ['SKATEBOARD!', '#ff8fab'],
          quad: ['', '#ff5c5c'],
          megaphone: ['MEGAPHONE!', '#ff5c5c'],
          fedora: ['FEDORA! EPIC MODE!', '#9b6bff'],
          wings: ['WINGS! Hold JUMP to glide', '#bfe6ff'],
          goggles: ['SPY GOGGLES! Map shows every find', '#4cd137'],
          potato: ['HOT POTATOES ×3', '#d9a066'],
          conga: ['CONGA TIME! Lead them into stuff', '#ff8fab'],
          giant: ['GIANT BABY! Giant poops too', '#4cd137'],
          egg: ['', '#ffd23f'],
          nap: ['NAP BOMBS ×2! Throw = Zzz', '#4aa3ff'],
          boomerang: ['BOOMERANG BINKY! Throw it, it comes back', '#ffd23f'],
          giraffe: ['', '#f2c14e'],
          decoy: ['DECOY BABY! They chase it, not you', '#ff8fab'],
          finger: ['', '#ffd23f'],
        }
        if (e.kind === 'fedora' && s.goal.kind === 'find') break
        if (e.kind === 'wings') {
          ui.popup(s.player.flying ? 'BOOST! Hold JUMP for speed' : 'WINGS! Hold JUMP to fly', pt.x, pt.y, '#bfe6ff', 0.8)
          break
        }
        const [label, color] = labels[e.kind ?? ''] ?? ['', '#fff']
        if (label) ui.popup(label, pt.x, pt.y, color, 0.8)
        break
      }
      case 'timeBonus': {
        const pt = renderer.project(e.x ?? 0, 2.2, e.z ?? 0)
        ui.popup(e.label ?? `-${e.points}s`, pt.x, pt.y, '#4cd137', 1.1)
        ui.flashClock()
        break
      }
      case 'rideOff':
        ui.toast(e.kind === 'quad' ? 'Quad wrecked! Grab it back!' : e.kind === 'giraffe' ? 'Fell off the giraffe! Grab it back!' : 'Lost the skateboard! Grab it back!', 1400)
        break
      case 'rideOn':
        if (e.kind === 'quad') ui.toast('QUAD! Smash everything!', 1400, 'good')
        if (e.kind === 'giraffe') ui.toast('GIRAFFE RIDE! Tall, fast, and the stampede runs under you', 1800, 'good')
        break
      case 'nap':
        ui.toast('Zzz... they are asleep', 1200, 'good')
        break
      case 'decoy':
        if ((e.big ?? 0) === 0) ui.toast('The decoy popped. They are onto you!', 1300)
        break
      case 'found': {
        const pt = renderer.project(e.x ?? 0, 2, e.z ?? 0)
        const g = s.goal
        const total = g.kind === 'find' || g.kind === 'chase' || g.kind === 'protect' || g.kind === 'hunt' ? g.count : g.kind === 'race' ? g.checkpoints : '?'
        const icon = e.kind === 'egg' ? '🥚' : e.kind === 'finger' ? '🍗 CHICKEN FINGER' : e.kind === 'thief' ? '🍼 SAVED' : e.kind === 'gate' ? '🏁 GATE' : e.kind === 'jelly' ? '🪼 POPPED' : '🎩'
        ui.popup(`${icon} ${e.points} / ${total}`, pt.x, pt.y, e.kind === 'egg' ? '#ffd23f' : e.kind === 'gate' || e.kind === 'thief' ? '#4cd137' : '#9b6bff', 1.2)
        if (e.kind === 'finger' && e.points === total) ui.toast('HE DROPPED THE PACIFIER AND RAN HOME! Grab it!', 2200, 'good')
        else if (e.kind === 'finger') ui.toast('CRISPY SPEED! Find the king again', 1300, 'good')
        break
      }
      case 'trampled':
        hitstop = Math.max(hitstop, 0.1)
        ui.toast('TRAMPLED! Keep running!', 1200, 'boss')
        break
      case 'stuckHint':
        ui.toast(`${goalShort(s.goal)} · follow the green arrow`, 2600, 'go')
        break
      case 'kingPoof': {
        if ((e.big ?? 0) > 0) {
          hitstop = Math.max(hitstop, 0.1)
          const pt = renderer.project(e.x ?? 0, 2.2, e.z ?? 0)
          ui.popup('POOF! GRAB THE FINGER 🍗', pt.x, pt.y, '#ffd23f', 1.2)
        }
        break
      }
      case 'erupt':
        if ((e.big ?? 0) > 0) ui.toast('POODOOM ERUPTS! 💩🌋', 1300, 'boss')
        else ui.toast('Poodoom is rumbling...', 900)
        break
      case 'npcPop': {
        const pt = renderer.project(e.x ?? 0, 1.8, e.z ?? 0)
        ui.popup(e.kind === 'jelly' ? 'POP!' : 'SWAT!', pt.x, pt.y, e.kind === 'jelly' ? '#ff7ab8' : '#ffffff', 0.9)
        break
      }
      case 'poopedOn': {
        const pt = renderer.project(e.x ?? 0, 2.4, e.z ?? 0)
        ui.popup('POOPED ON! EW!', pt.x, pt.y, '#d9a066', 0.9)
        break
      }
      case 'surge':
        if ((e.big ?? 0) > 0) ui.toast('STAMPEDE SURGE!', 1200, 'boss')
        else ui.toast('rumble rumble...', 900)
        break
      case 'snowMilestone': {
        hitstop = Math.max(hitstop, 0.08)
        const pt = renderer.project(e.x ?? 0, 3, e.z ?? 0)
        ui.popup(`⛄ ${e.label ?? ''}`, pt.x, pt.y, '#bfe6ff', 1.4)
        break
      }
      case 'melting': {
        const pt = renderer.project(e.x ?? 0, 2.5, e.z ?? 0)
        ui.popup('MELTING! Get it out of the water!', pt.x, pt.y, '#bfe6ff', 0.6)
        break
      }
      case 'npcScared':
        if (e.kind === 'thief' && (e.big ?? 0) === 0 && thiefWarns < 2) {
          thiefWarns++
          ui.toast('🍼 A thief is coming for the milk! Scream or poop him', 2000, 'boss')
        }
        if (e.kind === 'pigeon' && (e.big ?? 0) === 0) ui.toast('The pigeon stopped to peck at something. Go go go!', 1400, 'good')
        break
      case 'milkGone':
        hitstop = Math.max(hitstop, 0.1)
        ui.toast('THEY DRANK THE MILK! Refilled, but that cost a heart', 2200, 'boss')
        break
      case 'rivalWin':
        hitstop = Math.max(hitstop, 0.1)
        ui.toast('THE PIGEON FINISHED A LAP! Move it!', 1800, 'boss')
        break
      case 'needScream':
      case 'needPoop': {
        const pt = renderer.project(e.x ?? 0, 2.6, e.z ?? 0)
        ui.popup(e.t === 'needScream' ? 'SCREAM IT!' : 'POOP IT!', pt.x, pt.y - 20, '#ffffff', 0.5)
        break
      }
      case 'bossSlip': {
        const pt = renderer.project(e.x ?? 0, 2.5, e.z ?? 0)
        ui.popup(e.label ?? 'SLIPPED! HIT HIM!', pt.x, pt.y, '#4cd137', 1)
        break
      }
      case 'bossTelegraph':
        if (e.label === 'race') ui.toast('READY...', 800, 'boss')
        if (e.label === 'set') ui.toast('SET...', 700, 'boss')
        break
      case 'bossAttack':
        if (e.label === 'race') ui.toast('GO! RUN THE TRACK!', 900, 'go')
        break
      case 'bossStomp': {
        if (e.label === 'emu' || e.label === 'spike') {
          const pt = renderer.project(e.x ?? 0, 2.5, e.z ?? 0)
          ui.popup(e.label === 'emu' ? 'EMU WINS THE LAP!' : 'OUCH! SPIKES!', pt.x, pt.y, '#ff5c5c', 0.8)
        }
        break
      }
      case 'tooClose': {
        const pt = renderer.project(e.x ?? 0, 4.6, e.z ?? 0)
        ui.popup('TOO CLOSE! BACK UP AND LOB IT', pt.x, pt.y, '#ffffff', 0.5)
        break
      }
      case 'frozen': {
        const pt = renderer.project(e.x ?? 0, 2, e.z ?? 0)
        ui.popup(e.kind === 'chicken' ? 'FROZEN BAWK' : 'FROZEN!', pt.x, pt.y, '#d9a066', 0.8)
        break
      }
      case 'miniHatch':
        ui.toast('Mini Duogringo hatched!', 900)
        break
      case 'congaSmash': {
        const pt = renderer.project(e.x ?? 0, 1.4, e.z ?? 0)
        ui.popup('CONGA SMASH!', pt.x, pt.y, '#ff8fab', 0.6)
        break
      }
      case 'powerEnd':
        if (e.kind === 'giant') ui.toast('Back to baby size', 1000)
        if (e.kind === 'conga') ui.toast('Conga over. They are dizzy!', 1200)
        break
      case 'bossLand':
        hitstop = Math.max(hitstop, 0.25)
        ui.showBossCard(s)
        break
      case 'explode':
        hitstop = Math.max(hitstop, 0.1)
        break
      case 'goalReached':
        hitstop = Math.max(hitstop, 0.15)
        ui.toast('100% WRECKED. BOSS TIME!', 2200, 'boss')
        break
      case 'levelPhase':
        if (s.boss) ui.toast(s.boss.def.hintShort, 3200, 'go')
        break
      case 'bossExposed':
        if ((e.big ?? 0) > 0) {
          const f = s.boss ? fightOf(s.boss) : 'charge'
          ui.toast(f === 'horse' ? 'HE IS DOWN! SCREAM AT HIM!' : f === 'group' ? 'DAZED! HIT IT!' : 'NOW! SCREAM OR POOP AT HIM!', 1800, 'go')
        }
        break
      case 'bossHurt':
        hitstop = Math.max(hitstop, 0.09)
        buzz(15)
        if (e.label) {
          const pt = renderer.project(e.x ?? 0, 3, e.z ?? 0)
          ui.popup(e.label, pt.x, pt.y, '#ff5c5c', 1)
        }
        break
      case 'bossPhase':
        hitstop = Math.max(hitstop, 0.12)
        if (e.kind === 'part' && e.label) ui.toast(e.label, 3600, 'go')
        else ui.toast(`${s.boss?.def.name.toUpperCase()} IS ANGRY!`, 1400, 'boss')
        break
      case 'bossDead': {
        hitstop = Math.max(hitstop, 0.25)
        buzz(60)
        // the kill sequence: the boss gets a last word, then the game says it out loud
        const pt = renderer.project(e.x ?? 0, 3.4, e.z ?? 0)
        if (e.kind) ui.popup(`"${e.kind}"`, pt.x, pt.y, '#ffffff', 2.2)
        ui.toast(`${e.label?.toUpperCase()} DEFEATED!`, 2200, 'good')
        break
      }
      case 'duoGrow':
        if (s.duo.power > 0.66 && s.duo.power - 0.16 <= 0.66) ui.toast('DUOGRINGO IS HUGE! SCREAM AT HIM!', 1600, 'boss')
        else if (s.duo.power > 0.33 && s.duo.power - 0.16 <= 0.33) ui.toast('Duogringo is growing...', 1200)
        break
      case 'bossBlocked': {
        const pt = renderer.project(e.x ?? s.boss?.x ?? 0, 2.5, e.z ?? s.boss?.z ?? 0)
        ui.popup(e.label ?? 'WAIT FOR THE GREEN RING', pt.x, pt.y, '#ffffff', 0.3)
        break
      }
      case 'gameOver':
        endTimer = 1.6
        if (!bot) noteFail(s.levelId)
        break
      case 'win':
        endTimer = 2.4
        break
    }
  }
}

function playSound(e: GameEvent) {
  switch (e.t) {
    case 'wreck':
    case 'propHit':
    case 'bossExposed':
    case 'comboLost':
    case 'powerEnd':
    case 'rideOff':
      return
    case 'combo':
      if ((e.combo ?? 0) >= 2) audio.play('multUp', { pitch: 1 + Math.min(2, ((e.combo ?? 1) - 1) * 0.12) })
      return
    case 'scream':
      audio.play('scream', { big: e.big, vol: 0.7 + (e.big ?? 0) * 0.4, pitch: 1.1 - (e.big ?? 0) * 0.25 })
      return
    case 'pickup':
    case 'rideOn':
      audio.play(e.kind === 'giant' ? 'levelPhase' : e.kind === 'conga' ? 'win' : 'bossPhase', { vol: 0.5, pitch: pickupPitch() })
      return
    case 'found':
      audio.play('win', { vol: 0.45, pitch: 1.2 + (pickupPitch() - 1) })
      return
    case 'needScream':
    case 'needPoop':
    case 'tooClose':
      audio.play('bossBlocked')
      return
    case 'frozen':
      audio.play('splat', { vol: 0.8, pitch: 0.7 })
      return
    case 'screamReady':
      audio.play('screamReady')
      return
    case 'flap':
      audio.play('flap', { vol: e.big ?? 0.3 })
      return
    case 'miniHatch':
      audio.play('chicken', { pitch: 0.7 })
      return
    case 'bossSlip':
      audio.play('splat', { vol: 1.2 })
      return
    case 'congaSmash':
      audio.play('smash', { big: 0.4 })
      return
    case 'timeBonus':
      audio.play('win', { vol: 0.35 })
      return
    case 'goalReached':
      audio.play('levelPhase')
      return
    case 'bossLand':
      audio.play('bossStomp', { big: 1 })
      audio.play('bossPhase', { vol: 0.6 })
      return
    case 'npcScared':
      if ((e.kind === 'thief' || e.kind === 'pigeon') && (e.big ?? 0) === 0) return
      audio.play(e.kind === 'chicken' ? 'chicken' : 'npcScared', { pitch: vary() })
      return
    case 'snowMilestone':
      audio.play('win', { vol: 0.4, pitch: 1 + (e.big ?? 0) * 0.4 })
      return
    case 'kingPoof':
      audio.play('chicken', { pitch: (e.big ?? 0) > 0 ? 0.6 : 1.2, vol: 0.9 })
      return
    case 'rockHint':
      audio.play('rockHint', { pitch: 0.7 + (e.big ?? 0) * 0.9, vol: 0.5 + (e.big ?? 0) * 0.5 })
      return
    case 'smash':
    case 'splat':
    case 'propHit':
      audio.play(e.t, { big: e.big, pitch: 0.92 + Math.random() * 0.16 })
      return
    default:
      audio.play(e.t, { big: e.big, pitch: vary() })
  }
}

// ±6% on every repeated cue so a hundred smashes never sound like one sample on loop
function vary(): number {
  return 0.94 + Math.random() * 0.12
}

// Haptics are additive: Android phones buzz, iOS silently ignores, and never more than a few times a second.
let buzzAt = 0
function buzz(ms: number) {
  if (!touch || typeof navigator.vibrate !== 'function') return
  const now = performance.now()
  if (now - buzzAt < 120) return
  buzzAt = now
  try {
    navigator.vibrate(ms)
  } catch {
    /* ignore */
  }
}

function loop(now: number) {
  requestAnimationFrame(loop)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const globeMode = GLOBE_MODES.includes(mode) && !(mode === 'help' && helpFromGame)
  if (globeMode) {
    globe.resize(renderer.camera.aspect)
    globe.update(dt)
    renderer.gl.render(globe.scene, globe.camera)
    return
  }
  if (state) {
    if (mode === 'play') {
      if (hitstop > 0) {
        hitstop -= dt
      } else {
        acc += dt
        let n = 0
        while (acc >= DT && n < 4) {
          const inp = bot ? botInput(state) : input.read()
          snapshot(state)
          step(state, inp)
          handleEvents(state)
          if (state.phase === 'wreck' || state.phase === 'boss') {
            if (state.time >= ghostNextT && ghostRec.length < GHOST_MAX) {
              ghostRec.push({ x: state.player.x, y: state.player.y, z: state.player.z })
              ghostNextT += GHOST_DT
            }
          }
          acc -= DT
          n++
        }
        if (n === 4) acc = 0
        renderer.prev = prevSnap
        renderer.alpha = Math.max(0, Math.min(1, acc / DT))
      }
      ui.updateHud(state, dt)
      if (state.tick % 4 === 0) ui.drawMinimap(state)
      if (state.tick % 3 === 0) {
        // objective arrow: only when the thing the meter wants is off screen
        const t = goalTarget(state)
        if (t) {
          const pt = renderer.project(t.x, 0.8, t.z)
          const m = 24
          const off = pt.x < m || pt.y < m || pt.x > window.innerWidth - m || pt.y > window.innerHeight - m
          ui.setArrow(pt.x, pt.y, off)
        } else ui.setArrow(0, 0, false)
      }
      if (endTimer > 0) {
        endTimer -= dt
        if (endTimer <= 0) {
          if (state.phase === 'won') void onLevelCleared(state)
          else if (state.phase === 'over') {
            mode = 'over'
            ui.showOver(state)
          }
        }
      }
      renderer.sync(state, dt)
    } else if (mode === 'won' || mode === 'over') {
      acc += dt
      let n = 0
      while (acc >= DT && n < 4) {
        snapshot(state)
        step(state, { mx: 0, mz: 0, scream: false, poop: false, jump: false })
        acc -= DT
        n++
      }
      renderer.prev = prevSnap
      renderer.alpha = Math.max(0, Math.min(1, acc / DT))
      renderer.sync(state, dt)
    } else {
      renderer.sync(state, 0)
    }
  }
  renderer.render()
}

async function boot() {
  await Promise.all([renderer.load(), globe.load()])
  globe.setProgress({ unlocked, bests: localBests() }, null)
  if (bot || params.has('auto')) {
    setName(params.get('name') ?? (bot ? 'BOT' : playerName.get()))
    const levelId = params.get('level') ?? LEVELS[0].id
    runStartIndex = Math.max(0, LEVELS.findIndex((l) => l.id === levelId))
    state = createState({ seed: Number(params.get('seed')) || 1, levelId })
    beginLevel(true)
  }
  requestAnimationFrame(loop)
}

uiRoot.querySelector('#how-btn')!.addEventListener('click', () => {
  helpFromGame = false
  mode = 'help'
})
uiRoot.querySelector('#btn-help')!.addEventListener('click', () => {
  helpFromGame = true
})
uiRoot.querySelector('#help-title')!.addEventListener('click', () => {
  if (mode === 'help') goTitle()
})

void boot()
