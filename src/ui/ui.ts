// HTML overlay: title, HUD, end screens, leaderboard, popups. Reads state, never mutates it.
import { LEVELS } from '../sim/levels.ts'
import { CFG, bossPhase, currentLevel } from '../sim/sim.ts'
import type { State } from '../sim/types.ts'
import type { ScoreRow } from '../net/leaderboard.ts'

export interface UiCallbacks {
  onPlay: (name: string, levelId: string | null) => void
  onNext: () => void
  onEndRun: () => void
  onRestart: () => void
  onBoard: () => void
  onBack: () => void
}

const fmtTime = (t: number) => {
  const s = Math.max(0, Math.ceil(t))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

const fmt = (n: number) => n.toLocaleString('en-US')

export class Ui {
  private root: HTMLElement
  private screens: Record<string, HTMLElement> = {}
  private hud: HTMLElement
  private popups: HTMLElement
  private el = new Map<string, HTMLElement>()
  private lastMult = 1
  private lastPhase = ''
  private devTaps = 0

  constructor(root: HTMLElement, private cb: UiCallbacks, private touch: boolean, dev: boolean) {
    this.root = root
    root.innerHTML = `
      <div id="hud" class="screen">
        <div class="hud-top">
          <div class="hud-score"><div id="score">0</div><div class="mult-row"><span id="mult" class="mult">x1</span><div class="chain"><div id="chain"></div></div></div></div>
          <div class="hud-mid"><div id="timer">1:15</div><div id="boss-hud" hidden><div id="boss-name"></div><div id="boss-pips"></div></div></div>
          <div class="hud-right"><div class="hp"><div id="hp"></div></div><div class="duo"><span>🐦</span><div class="duo-bar"><div id="duo"></div></div></div></div>
        </div>
        <div id="toast"></div>
        <div id="popups"></div>
        <div id="joy-zone"><div id="joy"><div id="joy-knob"></div></div></div>
        <div class="meters"><div class="meter"><label>SCREAM</label><div><div id="scream-meter"></div></div></div><div class="meter"><label>POOP</label><div><div id="poop-meter"></div></div></div></div>
        <div class="buttons">
          <button id="btn-jump" class="btn">JUMP</button>
          <button id="btn-poop" class="btn">💩</button>
          <button id="btn-scream" class="btn big">SCREAM</button>
        </div>
      </div>
      <div id="title" class="screen panel">
        <h1 id="logo">KASE<br>WORLD</h1>
        <p class="sub">a game by <b>Nova & Louie</b></p>
        <input id="name" maxlength="12" placeholder="YOUR NAME" autocomplete="off" spellcheck="false">
        <button id="play" class="cta">PLAY</button>
        <button id="board-btn" class="ghost">LEADERBOARD</button>
        <p class="hint">${
          this.touch
            ? 'Left side: drag to move · SCREAM: hold · 💩: tap · JUMP: tap'
            : 'Move: WASD or arrows · Scream: hold SPACE · Poop: E · Jump: SHIFT'
        }</p>
        <div id="levels" ${dev ? '' : 'hidden'}></div>
      </div>
      <div id="won" class="screen panel" hidden>
        <h2 id="won-title">CLEARED!</h2>
        <div class="big-score"><span>SCORE</span><b id="won-score">0</b></div>
        <p id="won-sub"></p>
        <button id="next" class="cta">NEXT CONTINENT ▶</button>
        <button id="end-run" class="ghost">END RUN & SAVE SCORE</button>
      </div>
      <div id="over" class="screen panel" hidden>
        <h2 id="over-title">GAME OVER</h2>
        <div class="big-score"><span>SCORE</span><b id="over-score">0</b></div>
        <p id="over-sub"></p>
        <div id="over-board" class="board"></div>
        <button id="restart" class="cta">PLAY AGAIN</button>
      </div>
      <div id="board" class="screen panel" hidden>
        <h2>LEADERBOARD</h2>
        <div class="tabs"><button data-board="alltime" class="tab on">ALL TIME</button><button data-board="today" class="tab">TODAY</button></div>
        <div id="board-list" class="board"></div>
        <button id="back" class="ghost">BACK</button>
      </div>
    `
    for (const id of ['hud', 'title', 'won', 'over', 'board']) this.screens[id] = root.querySelector(`#${id}`)!
    this.hud = this.screens.hud
    this.popups = root.querySelector('#popups')!
    for (const id of ['score', 'mult', 'chain', 'timer', 'boss-hud', 'boss-name', 'boss-pips', 'hp', 'duo', 'toast', 'scream-meter', 'poop-meter', 'name', 'won-title', 'won-score', 'won-sub', 'next', 'over-title', 'over-score', 'over-sub', 'over-board', 'board-list', 'levels']) {
      this.el.set(id, root.querySelector(`#${id}`)!)
    }
    const nameEl = this.get('name') as HTMLInputElement
    root.querySelector('#play')!.addEventListener('click', () => this.cb.onPlay(nameEl.value.trim(), null))
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.cb.onPlay(nameEl.value.trim(), null)
    })
    root.querySelector('#board-btn')!.addEventListener('click', () => this.cb.onBoard())
    root.querySelector('#back')!.addEventListener('click', () => this.cb.onBack())
    root.querySelector('#next')!.addEventListener('click', () => this.cb.onNext())
    root.querySelector('#end-run')!.addEventListener('click', () => this.cb.onEndRun())
    root.querySelector('#restart')!.addEventListener('click', () => this.cb.onRestart())
    root.querySelector('#logo')!.addEventListener('click', () => {
      if (++this.devTaps >= 5) this.get('levels').hidden = false
    })
    const levels = this.get('levels')
    levels.innerHTML = '<div class="lv-title">JUMP TO CONTINENT</div>'
    for (const l of LEVELS) {
      const b = document.createElement('button')
      b.className = 'lv'
      b.textContent = l.name
      b.addEventListener('click', () => this.cb.onPlay(nameEl.value.trim(), l.id))
      levels.appendChild(b)
    }
  }

  get(id: string): HTMLElement {
    return this.el.get(id)!
  }

  setName(name: string) {
    ;(this.get('name') as HTMLInputElement).value = name
  }

  show(id: 'title' | 'hud' | 'won' | 'over' | 'board') {
    for (const [k, el] of Object.entries(this.screens)) el.hidden = k !== id && !(id !== 'title' && id !== 'board' && k === 'hud')
    if (id === 'title') this.screens.hud.hidden = true
    this.root.classList.toggle('playing', id === 'hud')
    if (id === 'title') setTimeout(() => (this.get('name') as HTMLInputElement).focus(), 50)
  }

  updateHud(s: State) {
    const p = s.player
    this.get('score').textContent = fmt(s.score)
    const mult = this.get('mult')
    if (s.mult !== this.lastMult) {
      mult.textContent = `x${s.mult}`
      mult.classList.toggle('hot', s.mult >= 5)
      mult.classList.remove('pop')
      void mult.offsetWidth
      mult.classList.add('pop')
      this.lastMult = s.mult
    }
    this.get('chain').style.width = `${(s.chainT / CFG.chainTime) * 100}%`
    this.get('hp').style.width = `${(p.hp / p.maxHp) * 100}%`
    this.get('hp').classList.toggle('low', p.hp <= 30)
    const duo = this.get('duo')
    duo.style.width = `${s.duo.power * 100}%`
    duo.style.background = s.duo.power > 0.66 ? '#ff3b3b' : s.duo.power > 0.33 ? '#ffb020' : '#4cd137'
    this.get('scream-meter').style.width = `${p.screamCharging ? p.screamCharge * 100 : p.screamCd > 0 ? 0 : 100}%`
    this.get('scream-meter').classList.toggle('charging', p.screamCharging)
    this.get('poop-meter').style.width = `${p.poopMeter * 100}%`
    this.root.querySelector('#btn-scream')!.classList.toggle('ready', p.screamCd <= 0)
    this.root.querySelector('#btn-poop')!.classList.toggle('ready', p.poopMeter >= CFG.player.poopCost)

    const timer = this.get('timer')
    const bossHud = this.get('boss-hud')
    if (s.phase === 'wreck') {
      timer.hidden = false
      bossHud.hidden = true
      timer.textContent = fmtTime(s.timer)
      timer.classList.toggle('urgent', s.timer < 10)
    } else if (s.boss) {
      timer.hidden = true
      bossHud.hidden = false
      const b = s.boss
      if (this.lastPhase !== s.levelId + b.def.id) {
        this.get('boss-name').innerHTML = `${b.def.name} <small>drawn by ${b.def.drawnBy}</small>`
        this.lastPhase = s.levelId + b.def.id
      }
      const pips = this.get('boss-pips')
      const ph = bossPhase(b)
      let html = ''
      for (let i = 0; i < b.totalHits; i++) {
        const cls = i < b.hits ? 'hit' : Math.floor(i / b.def.hitsPerPhase) === ph ? 'now' : ''
        html += `<i class="${cls}"></i>`
      }
      pips.innerHTML = html
      bossHud.classList.toggle('open', b.state === 'exposed')
    }
  }

  popup(text: string, x: number, y: number, color = '#fff', size = 1) {
    if (this.popups.childElementCount > 24) this.popups.firstElementChild?.remove()
    const el = document.createElement('div')
    el.className = 'pop'
    el.textContent = text
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.color = color
    el.style.fontSize = `${Math.min(3.2, 1.1 + size)}rem`
    this.popups.appendChild(el)
    setTimeout(() => el.remove(), 900)
  }

  toast(text: string, ms = 1400, cls = '') {
    const t = this.get('toast')
    t.textContent = text
    t.className = 'show ' + cls
    clearTimeout((t as unknown as { _t: number })._t)
    ;(t as unknown as { _t: number })._t = window.setTimeout(() => (t.className = ''), ms)
  }

  showWon(s: State, hasNext: boolean) {
    this.get('won-title').textContent = `${currentLevel(s).name.toUpperCase()} CLEARED!`
    this.get('won-score').textContent = fmt(s.score)
    this.get('won-sub').textContent = hasNext
      ? `${s.boss?.def.name ?? 'The boss'} is toast. ${LEVELS.length - s.levelsCleared} continents left.`
      : 'You wrecked the whole world. Nova and Louie salute you.'
    this.get('next').hidden = !hasNext
    this.show('won')
  }

  showOver(s: State, title: string, sub: string) {
    this.get('over-title').textContent = title
    this.get('over-score').textContent = fmt(s.score)
    this.get('over-sub').textContent = sub
    this.get('over-board').innerHTML = ''
    this.show('over')
  }

  setOverSub(sub: string) {
    this.get('over-sub').textContent = sub
  }

  renderBoard(target: 'over-board' | 'board-list', rows: ScoreRow[] | null, note?: string) {
    const el = this.get(target)
    if (!rows) {
      el.innerHTML = `<div class="empty">${note ?? 'Leaderboard offline'}</div>`
      return
    }
    if (rows.length === 0) {
      el.innerHTML = `<div class="empty">${note ?? 'No scores yet. Be first!'}</div>`
      return
    }
    el.innerHTML = rows
      .map(
        (r, i) =>
          `<div class="row ${r.mine ? 'mine' : ''}"><span class="rank">${i + 1}</span><span class="nm">${escapeHtml(r.name)}</span><span class="lv">${levelShort(r.level, r.levelsCleared)}</span><span class="sc">${fmt(r.score)}</span></div>`,
      )
      .join('')
  }

  bindBoardTabs(fn: (board: 'alltime' | 'today') => void) {
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('.tab')) {
      b.addEventListener('click', () => {
        for (const o of this.root.querySelectorAll('.tab')) o.classList.remove('on')
        b.classList.add('on')
        fn(b.dataset.board as 'alltime' | 'today')
      })
    }
  }
}

function levelShort(level: string, cleared: number) {
  const l = LEVELS.find((x) => x.id === level)
  return `${cleared}🌍 ${l ? l.name.split(' ').map((w) => w[0]).join('') : ''}`
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
