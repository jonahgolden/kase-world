import './ui/styles.css'
import { DT, VERSION, createState, currentLevel, nextLevelState, skipToBoss, step } from './sim/sim.ts'
import { botInput } from './sim/bot.ts'
import { LEVELS } from './sim/levels.ts'
import type { GameEvent, State } from './sim/types.ts'
import { Renderer } from './render/renderer.ts'
import { InputDriver } from './input/input.ts'
import { AudioDriver } from './audio/audio.ts'
import { Ui } from './ui/ui.ts'
import { fetchBoard, localBest, localScores, playerName, saveLocal, submitScore } from './net/leaderboard.ts'
import type { Board, ScoreRow } from './net/leaderboard.ts'

const params = new URLSearchParams(location.search)
const dev = params.has('dev')
const bot = params.has('bot')
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window

const canvas = document.getElementById('c') as HTMLCanvasElement
const uiRoot = document.getElementById('ui') as HTMLElement

type Mode = 'title' | 'play' | 'won' | 'over' | 'board'
let mode: Mode = 'title'
let state: State | null = null
let attract: State | null = null
let attractAcc = 0
let acc = 0
let last = performance.now()
let hitstop = 0
let startLevelId: string | null = null
let name = 'KASE'
let runStartMs = 0
let submitted = false
let lastSubmitId: number | undefined
let endTimer = 0

const audio = new AudioDriver()
audio.muted = params.has('mute')
void audio.loadManifest()

const ui = new Ui(
  uiRoot,
  {
    onPlay: (n, levelId) => startRun(n, levelId),
    onNext: () => nextLevel(),
    onEndRun: () => finishRun('WORLD TOUR OVER', 'You called it quits. Respectable.'),
    onRestart: () => startRun(name, startLevelId),
    onBoard: () => showBoard(),
    onBack: () => {
      audio.play('ui')
      ui.show('title')
      mode = 'title'
    },
  },
  touch,
  dev,
)
const input = new InputDriver(uiRoot)
const renderer = new Renderer(canvas, touch)

ui.setName(params.get('name') ?? playerName.get())
ui.show('title')
ui.bindBoardTabs((b) => void loadBoard(b))

function unlockAudio() {
  audio.unlock()
}
window.addEventListener('pointerdown', unlockAudio, { passive: true })
window.addEventListener('keydown', unlockAudio)

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && (mode === 'over' || mode === 'won')) startRun(name, startLevelId)
  if (e.code === 'Enter' && mode === 'won') nextLevel()
  if (e.code === 'KeyM') audio.muted = !audio.muted
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden) acc = 0
  last = performance.now()
})

function startRun(n: string, levelId: string | null) {
  name = (n || 'KASE').toUpperCase().slice(0, 12)
  playerName.set(name)
  startLevelId = levelId
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1_000_000)
  state = createState({ seed, levelId: levelId ?? params.get('level') ?? undefined })
  if (params.get('skip') === 'boss') skipToBoss(state)
  submitted = false
  lastSubmitId = undefined
  runStartMs = performance.now()
  acc = 0
  hitstop = 0
  endTimer = 0
  attract = null
  renderer.setLevel(state)
  ui.show('hud')
  ui.updateHud(state)
  mode = 'play'
  audio.unlock()
  audio.play('ui')
  ui.toast(`${currentLevel(state).name.toUpperCase()}: WRECK IT!`, 1800, 'good')
  if (touch && !bot && !params.has('auto') && !document.fullscreenElement) {
    try {
      document.documentElement.requestFullscreen?.()?.catch(() => {})
    } catch {
      /* iOS: no element fullscreen; PWA standalone covers it */
    }
  }
}

function nextLevel() {
  if (!state) return
  const next = nextLevelState(state)
  if (!next) return
  state = next
  acc = 0
  hitstop = 0
  endTimer = 0
  renderer.setLevel(state)
  ui.show('hud')
  ui.updateHud(state)
  mode = 'play'
  audio.play('ui')
  ui.toast(`${currentLevel(state).name.toUpperCase()}: WRECK IT!`, 1800, 'good')
}

async function finishRun(title: string, sub: string) {
  if (!state) return
  mode = 'over'
  const s = state
  const durationMs = Math.max(1, Math.round(s.runTime * 1000))
  const best = localBest()
  const isBest = s.score > best
  ui.showOver(s, title, isBest && best > 0 ? `NEW PERSONAL BEST! (was ${best.toLocaleString('en-US')})` : sub)
  const row: ScoreRow = { name, score: s.score, level: s.levelId, levelsCleared: s.levelsCleared, mine: true }
  saveLocal(row)
  if (!submitted && !bot) {
    submitted = true
    ui.setOverSub('Saving score...')
    const res = await submitScore({
      name,
      score: s.score,
      level: s.levelId,
      levelsCleared: s.levelsCleared,
      durationMs,
      version: VERSION,
      stats: { ...s.stats },
    })
    if (res.ok) {
      lastSubmitId = undefined
      ui.setOverSub(`Saved! World rank #${res.rank}${isBest ? ' · new personal best' : ''}`)
    } else {
      ui.setOverSub(`Score kept on this device (${res.error ?? 'offline'})`)
    }
  }
  const rows = await fetchBoard('alltime', 10)
  if (rows) {
    const mineIdx = rows.findIndex((r) => r.name === name && r.score === s.score)
    if (mineIdx >= 0) rows[mineIdx].mine = true
    ui.renderBoard('over-board', rows)
  } else {
    ui.renderBoard('over-board', localScores().slice(0, 10), 'Offline: scores on this device')
  }
  void lastSubmitId
}

async function showBoard() {
  audio.play('ui')
  mode = 'board'
  ui.show('board')
  await loadBoard('alltime')
}

async function loadBoard(board: Board) {
  ui.renderBoard('board-list', [], 'Loading...')
  const rows = await fetchBoard(board, 20)
  if (rows) ui.renderBoard('board-list', rows)
  else ui.renderBoard('board-list', localScores().slice(0, 20), 'Offline: scores on this device')
}

function handleEvents(s: State) {
  for (const e of s.events) {
    renderer.onEvent(e, s)
    playSound(e, s)
    switch (e.t) {
      case 'score': {
        const pt = renderer.project(e.x ?? s.player.x, 1.4, e.z ?? s.player.z)
        const color = e.color !== undefined ? '#' + e.color.toString(16).padStart(6, '0') : '#ffffff'
        ui.popup(`+${e.points}`, pt.x, pt.y, (e.mult ?? 1) >= 5 ? '#ff5c5c' : '#ffd23f', Math.min(1.6, (e.points ?? 0) / 400))
        if (e.label) ui.popup(e.label, pt.x, pt.y - 34, color, 0.5)
        break
      }
      case 'multUp': {
        const pt = renderer.project(s.player.x, 2.0, s.player.z)
        ui.popup(`x${e.mult}`, pt.x + 40, pt.y, '#ffd23f', 0.4 + Math.min(1, (e.mult ?? 1) / 10))
        break
      }
      case 'smash':
        hitstop = Math.max(hitstop, 0.02 + (e.big ?? 0) * 0.06)
        break
      case 'playerHurt':
        hitstop = Math.max(hitstop, 0.06)
        break
      case 'bossHurt':
        hitstop = Math.max(hitstop, 0.09)
        break
      case 'bossPhase':
        hitstop = Math.max(hitstop, 0.12)
        ui.toast(`${s.boss?.def.name.toUpperCase()} IS ANGRY!`, 1400, 'boss')
        break
      case 'bossDead':
        hitstop = Math.max(hitstop, 0.25)
        ui.toast(`${e.label?.toUpperCase()} DEFEATED!`, 2200, 'good')
        break
      case 'bossEnter':
        ui.toast('BOSS INCOMING!', 1500, 'boss')
        break
      case 'levelPhase':
        if (s.boss) ui.toast(s.boss.def.taunt, 2600, 'boss')
        break
      case 'duoGrow':
        if (s.duo.power > 0.66 && s.duo.power - 0.16 <= 0.66) ui.toast('DUOGRINGO IS HUGE!', 1400, 'boss')
        else if (s.duo.power > 0.33 && s.duo.power - 0.16 <= 0.33) ui.toast('Duogringo is growing...', 1200)
        break
      case 'bossBlocked': {
        const pt = renderer.project(s.boss?.x ?? 0, 2.5, s.boss?.z ?? 0)
        ui.popup('WAIT FOR IT...', pt.x, pt.y, '#ffffff', 0.3)
        break
      }
      case 'gameOver':
        endTimer = 1.6
        break
      case 'win':
        endTimer = 2.4
        break
    }
  }
}

function playSound(e: GameEvent, s: State) {
  switch (e.t) {
    case 'score':
    case 'propHit':
      return
    case 'multUp':
      audio.play('multUp', { pitch: 1 + Math.min(2, ((e.mult ?? 1) - 1) * 0.12) })
      return
    case 'scream':
      audio.play('scream', { big: e.big, vol: 0.7 + (e.big ?? 0) * 0.4, pitch: 1.1 - (e.big ?? 0) * 0.25 })
      return
    default:
      audio.play(e.t, { big: e.big })
  }
  void s
}

function startAttract() {
  attract = createState({ seed: 7 + Math.floor(Math.random() * 1000), levelId: params.get('level') ?? undefined, runId: 'attract' })
  attractAcc = 0
  renderer.setLevel(attract)
}

function loop(now: number) {
  requestAnimationFrame(loop)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (attract && (mode === 'title' || mode === 'board')) {
    attractAcc += dt
    let n = 0
    while (attractAcc >= DT && n < 4) {
      step(attract, botInput(attract))
      for (const e of attract.events) renderer.onEvent(e, attract)
      attractAcc -= DT
      n++
    }
    if ((attract.phase === 'over' || attract.phase === 'won') && attract.phaseT > 3) startAttract()
    renderer.sync(attract, dt)
  } else if (state && (mode === 'play' || (mode !== 'title' && mode !== 'board'))) {
    if (mode === 'play') {
      if (hitstop > 0) {
        hitstop -= dt
      } else {
        acc += dt
        let n = 0
        while (acc >= DT && n < 4) {
          const inp = bot ? botInput(state) : input.read()
          step(state, inp)
          handleEvents(state)
          acc -= DT
          n++
        }
        if (n === 4) acc = 0
      }
      ui.updateHud(state)
      if (endTimer > 0) {
        endTimer -= dt
        if (endTimer <= 0) {
          if (state.phase === 'won') {
            mode = 'won'
            const hasNext = state.levelIndex + 1 < LEVELS.length
            if (hasNext) ui.showWon(state, true)
            else void finishRun('WORLD CONQUERED!', 'Every continent wrecked. Nova and Louie salute you.')
          } else if (state.phase === 'over') {
            void finishRun('GAME OVER', 'Kase needs a nap.')
          }
        }
      }
    } else {
      // keep the world ticking gently behind end screens
      acc += dt
      while (acc >= DT) {
        step(state, { mx: 0, mz: 0, scream: false, poop: false, jump: false })
        acc -= DT
      }
    }
    renderer.sync(state, dt)
  }
  renderer.render()
}

async function boot() {
  await renderer.load()
  if (bot || params.has('auto')) startRun(params.get('name') ?? (bot ? 'BOT' : playerName.get()), params.get('level'))
  else startAttract()
  requestAnimationFrame(loop)
}

void boot()
