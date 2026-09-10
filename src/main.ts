import './ui/styles.css'
import { DT, VERSION, createState, currentLevel, nextLevelState, skipToBoss, step } from './sim/sim.ts'
import { botInput } from './sim/bot.ts'
import { LEVELS } from './sim/levels.ts'
import type { GameEvent, State } from './sim/types.ts'
import { Renderer } from './render/renderer.ts'
import { InputDriver } from './input/input.ts'
import { AudioDriver } from './audio/audio.ts'
import { Ui } from './ui/ui.ts'
import { fetchBoard, fmtMs, localBests, playerName, saveLocalBest, submitTime } from './net/leaderboard.ts'

const params = new URLSearchParams(location.search)
const dev = params.has('dev')
const bot = params.has('bot')
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window

const canvas = document.getElementById('c') as HTMLCanvasElement
const uiRoot = document.getElementById('ui') as HTMLElement

type Mode = 'title' | 'play' | 'paused' | 'won' | 'over' | 'board' | 'help'
let mode: Mode = 'title'
let state: State | null = null
let attract: State | null = null
let attractAcc = 0
let acc = 0
let last = performance.now()
let hitstop = 0
let startLevelId: string | null = null
let name = 'KASE'
let endTimer = 0
let helpFrom: Mode = 'title'

const audio = new AudioDriver()
audio.muted = params.has('mute')
void audio.loadManifest()

const ui = new Ui(
  uiRoot,
  {
    onPlay: (n, levelId) => startRun(n, levelId),
    onNext: () => nextLevel(),
    onRestart: () => startRun(name, state?.levelId ?? startLevelId),
    onTitle: () => goTitle(),
    onResume: () => resume(),
    onPause: () => pause(),
    onToggleSound: () => {
      audio.muted = !audio.muted
      return !audio.muted
    },
    onBoard: (b) => void showBoard(b),
  },
  touch,
  dev,
)
const input = new InputDriver(uiRoot, canvas)
const renderer = new Renderer(canvas, touch)

ui.setName(params.get('name') ?? playerName.get())
ui.show('title')

function unlockAudio() {
  audio.unlock()
}
window.addEventListener('pointerdown', unlockAudio, { passive: true })
window.addEventListener('keydown', unlockAudio)

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && (mode === 'over' || mode === 'won' || mode === 'paused')) startRun(name, state?.levelId ?? startLevelId)
  if (e.code === 'Enter' && mode === 'won') nextLevel()
  if (e.code === 'KeyM') audio.muted = !audio.muted
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') pause()
    else if (mode === 'paused') resume()
    else if (mode === 'help') goTitle()
  }
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play' && !bot) pause()
  acc = 0
  last = performance.now()
})

function startRun(n: string, levelId: string | null) {
  name = (n || 'KASE').toUpperCase().slice(0, 12)
  playerName.set(name)
  startLevelId = levelId
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1_000_000)
  state = createState({ seed, levelId: levelId ?? params.get('level') ?? undefined })
  beginLevel(true)
}

function nextLevel() {
  if (!state) return
  const next = nextLevelState(state)
  if (!next) return
  state = next
  beginLevel(false)
}

function beginLevel(fresh: boolean) {
  if (!state) return
  if (params.get('skip') === 'boss' && fresh) skipToBoss(state)
  acc = 0
  hitstop = 0
  endTimer = 0
  attract = null
  renderer.setLevel(state)
  ui.show('hud')
  ui.updateHud(state, 0)
  ui.showCard(state)
  mode = 'play'
  audio.unlock()
  audio.play('ui')
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
  ui.showHelp(true, !audio.muted)
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
  mode = 'title'
  state = null
  ui.hideCard()
  ui.show('title')
  startAttract()
}

async function onLevelCleared(s: State) {
  const timeMs = Math.round(s.clearTime * 1000)
  const isBest = saveLocalBest(s.levelId, timeMs)
  const hasNext = s.levelIndex + 1 < LEVELS.length
  mode = 'won'
  ui.showWon(s, hasNext, timeMs, isBest)
  const levelId = s.levelId
  const res = bot
    ? { ok: false as const, error: 'bot' }
    : await submitTime({ name, kind: 'level', level: levelId, timeMs, levelsCleared: s.levelsCleared, version: VERSION, stats: { ...s.stats } })
  let sub = res.ok ? `World rank #${res.rank} for ${currentLevel(s).name}` : `Time kept on this device (${res.error ?? 'offline'})`
  if (isBest) sub = 'NEW PERSONAL BEST! ' + sub
  if (!hasNext && s.levelsCleared >= LEVELS.length && !bot) {
    const runMs = Math.round(s.runTime * 1000)
    saveLocalBest('world', runMs)
    const w = await submitTime({ name, kind: 'world', level: 'world', timeMs: runMs, levelsCleared: s.levelsCleared, version: VERSION, stats: { ...s.stats } })
    sub += w.ok ? ` · Whole world in ${fmtMs(runMs)}, rank #${w.rank}` : ` · Whole world in ${fmtMs(runMs)}`
  }
  ui.setWonSub(sub)
  const rows = await fetchBoard(levelId, 8)
  if (rows) {
    const mine = rows.findIndex((r) => r.name === name && r.timeMs === timeMs)
    if (mine >= 0) rows[mine].mine = true
    ui.renderBoard('won-board', rows)
  }
}

async function showBoard(board: string) {
  audio.play('ui')
  mode = 'board'
  ui.show('board')
  ui.setBoardTab(board)
  ui.renderBoard('board-list', [], 'Loading...')
  const rows = await fetchBoard(board, 20)
  const best = localBests()[board]
  if (rows) ui.renderBoard('board-list', rows, best ? `No times online yet. Your best here: ${fmtMs(best)}` : undefined)
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
      case 'playerHurt':
        hitstop = Math.max(hitstop, 0.06)
        break
      case 'pickup': {
        const pt = renderer.project(e.x ?? 0, 1.6, e.z ?? 0)
        const label = e.kind === 'milk' ? '+1 HEART' : e.kind === 'pacifier' ? 'MEGA SCREAM!' : 'POOP STORM!'
        ui.popup(label, pt.x, pt.y, e.kind === 'milk' ? '#ff5c5c' : e.kind === 'pacifier' ? '#ffd23f' : '#d9a066', 0.8)
        break
      }
      case 'goalReached':
        hitstop = Math.max(hitstop, 0.15)
        ui.toast('100% WRECKED. BOSS TIME!', 2200, 'boss')
        break
      case 'levelPhase':
        if (s.boss) ui.toast(s.boss.def.taunt, 2600, 'boss')
        break
      case 'bossExposed':
        if ((e.big ?? 0) > 0) ui.toast('NOW! SCREAM OR POOP AT HIM!', 1800, 'go')
        break
      case 'bossHurt':
        hitstop = Math.max(hitstop, 0.09)
        if (e.label) {
          const pt = renderer.project(e.x ?? 0, 3, e.z ?? 0)
          ui.popup(e.label, pt.x, pt.y, '#ff5c5c', 1)
        }
        break
      case 'bossPhase':
        hitstop = Math.max(hitstop, 0.12)
        ui.toast(`${s.boss?.def.name.toUpperCase()} IS ANGRY!`, 1400, 'boss')
        break
      case 'bossDead':
        hitstop = Math.max(hitstop, 0.25)
        ui.toast(`${e.label?.toUpperCase()} DEFEATED!`, 2200, 'good')
        break
      case 'duoGrow':
        if (s.duo.power > 0.66 && s.duo.power - 0.16 <= 0.66) ui.toast('DUOGRINGO IS HUGE! SCREAM AT HIM!', 1600, 'boss')
        else if (s.duo.power > 0.33 && s.duo.power - 0.16 <= 0.33) ui.toast('Duogringo is growing...', 1200)
        break
      case 'bossBlocked': {
        const pt = renderer.project(s.boss?.x ?? 0, 2.5, s.boss?.z ?? 0)
        ui.popup('WAIT FOR THE GREEN RING', pt.x, pt.y, '#ffffff', 0.25)
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

function playSound(e: GameEvent) {
  switch (e.t) {
    case 'wreck':
    case 'propHit':
    case 'bossExposed':
    case 'comboLost':
    case 'powerEnd':
      return
    case 'combo':
      if ((e.combo ?? 0) >= 2) audio.play('multUp', { pitch: 1 + Math.min(2, ((e.combo ?? 1) - 1) * 0.12) })
      return
    case 'scream':
      audio.play('scream', { big: e.big, vol: 0.7 + (e.big ?? 0) * 0.4, pitch: 1.1 - (e.big ?? 0) * 0.25 })
      return
    case 'pickup':
      audio.play('bossPhase', { vol: 0.5 })
      return
    case 'goalReached':
      audio.play('levelPhase')
      return
    default:
      audio.play(e.t, { big: e.big })
  }
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
  if (attract && (mode === 'title' || mode === 'board' || (mode === 'help' && !state))) {
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
  } else if (state) {
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
      ui.updateHud(state, dt)
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
        step(state, { mx: 0, mz: 0, scream: false, poop: false, jump: false })
        acc -= DT
        n++
      }
      renderer.sync(state, dt)
    } else {
      renderer.sync(state, 0)
    }
  }
  renderer.render()
}

async function boot() {
  await renderer.load()
  if (bot || params.has('auto')) startRun(params.get('name') ?? (bot ? 'BOT' : playerName.get()), params.get('level'))
  else startAttract()
  requestAnimationFrame(loop)
}

uiRoot.querySelector('#how-btn')!.addEventListener('click', () => {
  helpFrom = mode
  mode = 'help'
})
uiRoot.querySelector('#help-title')!.addEventListener('click', () => {
  if (helpFrom === 'title' && mode === 'help') goTitle()
})

void boot()
