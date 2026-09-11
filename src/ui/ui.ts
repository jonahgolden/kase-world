// HTML overlay: title, HUD, level card, help/pause, end screens, boards, popups. Reads state, never mutates it.
import { LEVELS } from '../sim/levels.ts'
import { HEART, bossPhase, currentLevel } from '../sim/sim.ts'
import type { State } from '../sim/types.ts'
import { fmtMs } from '../net/leaderboard.ts'
import type { TimeRow } from '../net/leaderboard.ts'

export interface UiCallbacks {
  onPlay: (name: string, levelId: string | null) => void
  onNext: () => void
  onRestart: () => void
  onTitle: () => void
  onResume: () => void
  onPause: () => void
  onToggleSound: () => boolean
  onBoard: (board: string) => void
  onChoose: () => void
  onChooseMove: (dir: -1 | 1) => void
  onGo: () => void
}

const fmtClock = (t: number) => {
  const s = Math.max(0, Math.floor(t))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

export function medalFor(ms: number): 'gold' | 'silver' | 'bronze' | null {
  if (ms <= 120_000) return 'gold'
  if (ms <= 180_000) return 'silver'
  if (ms <= 300_000) return 'bronze'
  return null
}

const MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉' }

export class Ui {
  private root: HTMLElement
  private screens: Record<string, HTMLElement> = {}
  private popups: HTMLElement
  private el = new Map<string, HTMLElement>()
  private lastHearts = -1
  private lastBoss = ''
  private lastPct = -1
  private devTaps = 0
  private hintT = 0

  constructor(root: HTMLElement, private cb: UiCallbacks, private touch: boolean, dev: boolean) {
    this.root = root
    const controls = this.touch
      ? `<div class="ctl"><b>MOVE</b><span>drag anywhere on the left half. Screams and poop auto-aim at what is ahead</span></div>
         <div class="ctl"><b>SCREAM</b><span>hold the red button. Longer hold = bigger scream</span></div>
         <div class="ctl"><b>💩 POOP</b><span>tap to throw, hold to throw further</span></div>
         <div class="ctl"><b>JUMP</b><span>tap. Jump over the boss stomp</span></div>`
      : `<div class="ctl"><b>MOVE</b><span>WASD or arrow keys</span></div>
         <div class="ctl"><b>AIM</b><span>Kase faces the mouse. Screams and poop go where you point</span></div>
         <div class="ctl"><b>SCREAM</b><span>hold SPACE (or right mouse). Longer hold = bigger scream</span></div>
         <div class="ctl"><b>POOP</b><span>click, or E. Hold to throw further</span></div>
         <div class="ctl"><b>JUMP</b><span>SHIFT. Jump over the boss stomp</span></div>
         <div class="ctl"><b>PAUSE</b><span>ESC or P</span></div>`
    root.innerHTML = `
      <div id="hud" class="screen">
        <div class="hud-top">
          <div class="hearts" id="hearts"><span class="who">👶</span><span id="heart-row"></span><span id="powers"></span></div>
          <div class="hud-mid">
            <div id="goal-wrap">
              <div id="goal-label">NORTH AMERICA</div>
              <div class="goal-bar"><div id="goal-fill"></div><div id="goal-text">WRECK IT!</div></div>
              <img id="goal-boss" alt="">
            </div>
            <div id="boss-wrap" hidden>
              <img id="boss-img" alt="">
              <div class="boss-col"><div id="boss-name"></div><div class="boss-bar"><div id="boss-fill"></div><div id="boss-segs"></div></div></div>
            </div>
          </div>
          <div class="hud-right"><div id="clock">0:00</div><button id="btn-help" class="round" aria-label="help">?</button></div>
        </div>
        <div id="toast"></div>
        <div id="hint"></div>
        <canvas id="minimap" width="140" height="140"></canvas>
        <div id="popups"></div>
        <div id="joy-zone"><div id="joy"><div id="joy-knob"></div></div></div>
        <div class="buttons">
          <button id="btn-jump" class="btn">JUMP</button>
          <button id="btn-poop" class="btn">💩</button>
          <button id="btn-scream" class="btn big"><i id="scream-ring"></i><span>SCREAM</span></button>
        </div>
      </div>
      <div id="bosscard" class="screen card" hidden>
        <div class="card-box boss-box">
          <img id="bosscard-img" alt="">
          <div><div id="bosscard-name">BOSS</div><div id="bosscard-by">drawn by</div><div id="bosscard-taunt"></div><div id="bosscard-hint"></div></div>
        </div>
      </div>
      <div id="card" class="screen card" hidden>
        <div class="card-box">
          <div id="card-name">NORTH AMERICA</div>
          <div class="card-goal"><span id="card-goal">Wreck 60% of it</span> <span class="arrow">→</span> <img id="card-boss" alt=""> <span id="card-boss-name">boss</span></div>
        </div>
      </div>
      <div id="help" class="screen panel" hidden>
        <h2>HOW TO PLAY</h2>
        <p class="goal-line">Fill the <b>WRECK</b> meter by smashing stuff and scaring grown-ups. The boss shows up at 100%. Dodge its attacks, then hit it while the <b class="green">green ring</b> is on.</p>
        <div class="ctls">${controls}</div>
        <p class="goal-line small">🔊 glass things only break from screams · 💩 statues only get covered by poop · Finds glow with a light pillar. ⏱ clock = 5 s off your time · 🛹 skateboard and 🏍 quad = fast and smashy, lost when hit · 🎩 fedora = EPIC mode · 🪽 wings = hold JUMP to glide · 🥽 goggles = every find on the map · 🥔 hot potatoes = boom · 💃 conga rattle = grown-ups follow you and smash what they bump · 🧪 giant formula = huge and unhurtable for 8 s · 📣 megaphone · 🍼 milk = a heart · 🎁 gifts hide a surprise · 🐦 Duogringo grows every time you scream. Scream <i>at</i> him to shrink him. Fans launch you, portals teleport you, lakes are safe from grown-ups.</p>
        <div class="row-btns">
          <button id="help-resume" class="cta">RESUME</button>
          <button id="help-restart" class="ghost">RESTART LEVEL</button>
          <button id="help-sound" class="ghost">SOUND: ON</button>
          <button id="help-title" class="ghost">QUIT TO TITLE</button>
        </div>
      </div>
      <div id="title" class="screen panel">
        <h1 id="logo">KASE<br>WORLD</h1>
        <p class="sub">a game by <b>Nova & Louie</b></p>
        <input id="name" maxlength="12" placeholder="YOUR NAME" autocomplete="off" spellcheck="false">
        <button id="play" class="cta">PLAY</button>
        <div class="row-btns"><button id="choose-btn" class="ghost">🌍 CHOOSE CONTINENT</button><button id="board-btn" class="ghost">BEST TIMES</button><button id="how-btn" class="ghost">HOW TO PLAY</button></div>
        <div id="levels" ${dev ? '' : 'hidden'}></div>
      </div>
      <div id="won" class="screen panel" hidden>
        <h2 id="won-title">CONQUERED!</h2>
        <div class="big-time"><span id="won-medal"></span><b id="won-time">0:00.0</b></div>
        <p id="won-sub"></p>
        <div id="won-board" class="board"></div>
        <div class="row-btns"><button id="next" class="cta">NEXT CONTINENT ▶</button><button id="won-title-btn" class="ghost">TITLE</button></div>
      </div>
      <div id="over" class="screen panel" hidden>
        <h2 id="over-title">KASE NEEDS A NAP</h2>
        <p id="over-sub"></p>
        <div class="row-btns"><button id="restart" class="cta">TRY AGAIN</button><button id="over-title-btn" class="ghost">TITLE</button></div>
      </div>
      <div id="choose" class="screen choose" hidden>
        <div class="choose-card">
          <div class="choose-row"><button id="prev" class="round">◀</button><div class="choose-mid"><div id="choose-name">NORTH AMERICA</div><div id="choose-sub"></div></div><button id="nextc" class="round">▶</button></div>
          <div class="row-btns"><button id="go" class="cta">GO</button><button id="choose-back" class="ghost">BACK</button></div>
        </div>
      </div>
      <div id="board" class="screen panel" hidden>
        <h2>BEST TIMES</h2>
        <div class="tabs" id="board-tabs"></div>
        <div id="board-list" class="board"></div>
        <button id="back" class="ghost">BACK</button>
      </div>
      <div id="fade"></div>
    `
    for (const id of ['hud', 'card', 'bosscard', 'help', 'title', 'won', 'over', 'board', 'choose']) this.screens[id] = root.querySelector(`#${id}`)!
    this.popups = root.querySelector('#popups')!
    for (const el of root.querySelectorAll<HTMLElement>('[id]')) this.el.set(el.id, el)
    const nameEl = this.get('name') as HTMLInputElement
    const play = () => this.cb.onPlay(nameEl.value.trim(), null)
    this.get('play').addEventListener('click', play)
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') play()
    })
    this.get('board-btn').addEventListener('click', () => this.cb.onBoard('north-america'))
    this.get('choose-btn').addEventListener('click', () => this.cb.onChoose())
    this.get('prev').addEventListener('click', () => this.cb.onChooseMove(-1))
    this.get('nextc').addEventListener('click', () => this.cb.onChooseMove(1))
    this.get('go').addEventListener('click', () => this.cb.onGo())
    this.get('choose-back').addEventListener('click', () => this.cb.onTitle())
    this.get('how-btn').addEventListener('click', () => this.showHelp(false))
    this.get('back').addEventListener('click', () => this.cb.onTitle())
    this.get('next').addEventListener('click', () => this.cb.onNext())
    this.get('restart').addEventListener('click', () => this.cb.onRestart())
    this.get('won-title-btn').addEventListener('click', () => this.cb.onTitle())
    this.get('over-title-btn').addEventListener('click', () => this.cb.onTitle())
    this.get('btn-help').addEventListener('click', () => this.cb.onPause())
    this.get('help-resume').addEventListener('click', () => this.cb.onResume())
    this.get('help-restart').addEventListener('click', () => this.cb.onRestart())
    this.get('help-title').addEventListener('click', () => this.cb.onTitle())
    this.get('help-sound').addEventListener('click', () => {
      const on = this.cb.onToggleSound()
      this.get('help-sound').textContent = `SOUND: ${on ? 'ON' : 'OFF'}`
    })
    this.get('logo').addEventListener('click', () => {
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
    const tabs = this.get('board-tabs')
    for (const l of [...LEVELS.map((x) => ({ id: x.id, name: x.name })), { id: 'world', name: '🌍 WORLD' }]) {
      const b = document.createElement('button')
      b.className = 'tab'
      b.dataset.board = l.id
      b.textContent = l.name.toUpperCase()
      b.addEventListener('click', () => this.cb.onBoard(l.id))
      tabs.appendChild(b)
    }
  }

  get(id: string): HTMLElement {
    return this.el.get(id)!
  }

  setName(name: string) {
    ;(this.get('name') as HTMLInputElement).value = name
  }

  show(id: 'title' | 'hud' | 'won' | 'over' | 'board' | 'help' | 'choose') {
    const hudVisible = id === 'hud' || id === 'won' || id === 'over' || id === 'help'
    for (const [k, el] of Object.entries(this.screens)) {
      if (k === 'card' || k === 'bosscard') continue
      el.hidden = k === 'hud' ? !hudVisible : k !== id
    }
    this.root.classList.toggle('playing', id === 'hud')
    if (id === 'title') setTimeout(() => (this.get('name') as HTMLInputElement).focus(), 50)
  }

  setChoice(name: string, sub: string, locked: boolean) {
    this.get('choose-name').textContent = name.toUpperCase()
    this.get('choose-sub').textContent = sub
    this.get('choose-sub').classList.toggle('locked', locked)
    ;(this.get('go') as HTMLButtonElement).disabled = locked
  }

  fade(on: boolean) {
    this.get('fade').classList.toggle('on', on)
  }

  flashClock() {
    const c = this.get('clock')
    c.classList.remove('bonus')
    void c.offsetWidth
    c.classList.add('bonus')
  }

  showHelp(inGame: boolean, soundOn = true) {
    this.get('help-resume').hidden = !inGame
    this.get('help-restart').hidden = !inGame
    this.get('help-title').textContent = inGame ? 'QUIT TO TITLE' : 'BACK'
    this.get('help-sound').textContent = `SOUND: ${soundOn ? 'ON' : 'OFF'}`
    this.show('help')
  }

  showCard(s: State) {
    const lvl = currentLevel(s)
    this.get('card-name').textContent = lvl.name.toUpperCase()
    this.get('card-goal').textContent =
      lvl.goal.kind === 'find'
        ? lvl.goal.item === 'fedora'
          ? `Find ${lvl.goal.count} fedoras 🎩 (red hat boxes hide some)`
          : `Fly and find ${lvl.goal.count} golden eggs 🥚`
        : `Wreck ${Math.round(lvl.goal.pct * 100)}% of it`
    ;(this.get('card-boss') as HTMLImageElement).src = `/assets/drawings/${lvl.boss.drawing}`
    this.get('card-boss-name').textContent = lvl.boss.name
    const card = this.screens.card
    card.hidden = false
    card.classList.remove('out')
    window.setTimeout(() => card.classList.add('out'), 2600)
    window.setTimeout(() => (card.hidden = true), 3100)
    this.hintT = this.touch ? 0 : 9
    this.get('hint').textContent = 'hold SPACE to scream · click to poop · SHIFT to jump'
    this.get('hint').classList.toggle('show', this.hintT > 0)
  }

  hideCard() {
    this.screens.card.hidden = true
    this.screens.bosscard.hidden = true
  }

  showBossCard(s: State) {
    const b = s.boss
    if (!b) return
    ;(this.get('bosscard-img') as HTMLImageElement).src = `/assets/drawings/${b.def.drawing}`
    this.get('bosscard-name').textContent = b.def.name.toUpperCase()
    this.get('bosscard-by').textContent = `drawn by ${b.def.drawnBy}`
    this.get('bosscard-taunt').textContent = `"${b.def.taunt}"`
    this.get('bosscard-hint').textContent = b.def.hint
    const card = this.screens.bosscard
    card.hidden = false
    card.classList.remove('out')
    window.setTimeout(() => card.classList.add('out'), 2600)
    window.setTimeout(() => (card.hidden = true), 3100)
  }

  // Continent outline, the player, remembered finds, features and the boss ring.
  drawMinimap(s: State) {
    const cv = this.get('minimap') as HTMLCanvasElement
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const W = cv.width
    const H = cv.height
    const A = s.arena
    const pad = 8
    const sc = Math.min((W - pad * 2) / A.w, (H - pad * 2) / A.d)
    const ox = W / 2 - ((A.minX + A.maxX) / 2) * sc
    const oz = H / 2 - ((A.minZ + A.maxZ) / 2) * sc
    const X = (x: number) => ox + x * sc
    const Z = (z: number) => oz + z * sc
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(58,160,232,0.55)'
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = s.phase === 'boss' ? '#3d5a2a' : '#7ec850'
    ctx.strokeStyle = '#1b1b2f'
    ctx.lineWidth = 2
    ctx.beginPath()
    A.ring.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    for (const f of s.features) {
      ctx.beginPath()
      ctx.arc(X(f.x), Z(f.z), Math.max(2, f.r * sc), 0, Math.PI * 2)
      ctx.fillStyle = f.kind === 'lake' ? '#3aa0e8' : f.kind === 'platform' ? (f.island ? '#e8d59a' : '#5a8a3a') : f.kind === 'portal' ? '#9b6bff' : '#bfe6ff'
      ctx.fill()
    }
    for (const pr of s.props) {
      if (pr.broken) continue
      ctx.fillStyle = 'rgba(27,27,47,0.45)'
      ctx.fillRect(X(pr.x) - 1, Z(pr.z) - 1, 2, 2)
    }
    for (const k of s.pickups) {
      if (!s.player.goggles && !s.seen.includes(k.id)) continue
      ctx.fillStyle = '#ffd23f'
      ctx.strokeStyle = '#1b1b2f'
      ctx.lineWidth = 1
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.strokeText('★', X(k.x), Z(k.z) + 4)
      ctx.fillText('★', X(k.x), Z(k.z) + 4)
    }
    if (s.bossRing) {
      ctx.strokeStyle = '#ff5c5c'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(X(s.bossRing.x), Z(s.bossRing.z), s.bossRing.r * sc, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (s.boss) {
      ctx.fillStyle = '#ff5c5c'
      ctx.beginPath()
      ctx.arc(X(s.boss.x), Z(s.boss.z), 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#4cd137'
    ctx.beginPath()
    ctx.arc(X(s.duo.x), Z(s.duo.z), 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#1b1b2f'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(X(s.player.x), Z(s.player.z), 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    ctx.strokeStyle = '#1b1b2f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, W / 2 - 1.5, 0, Math.PI * 2)
    ctx.stroke()
  }

  updateHud(s: State, dt: number) {
    const p = s.player
    const lvl = currentLevel(s)
    const hearts = Math.round((p.hp / HEART) * 2) / 2
    if (hearts !== this.lastHearts) {
      let html = ''
      for (let i = 0; i < p.maxHp / HEART; i++) {
        const v = hearts - i
        html += `<i class="${v >= 1 ? 'full' : v >= 0.5 ? 'half' : 'empty'}"></i>`
      }
      this.get('heart-row').innerHTML = html
      this.get('hearts').classList.toggle('low', hearts <= 1)
      this.lastHearts = hearts
    }
    const powers: string[] = []
    if (p.pacifierT > 0) powers.push(`<span class="chip gold">MEGA SCREAM ${Math.ceil(p.pacifierT)}</span>`)
    if (p.rattleT > 0) powers.push(`<span class="chip brown">POOP STORM ${Math.ceil(p.rattleT)}</span>`)
    if (p.ride === 'skateboard') powers.push('<span class="chip pink">🛹</span>')
    if (p.ride === 'quad') powers.push(`<span class="chip red">🏍${'♥'.repeat(p.rideHp)}</span>`)
    if (p.megaphone) powers.push('<span class="chip red">📣</span>')
    if (p.fedora) powers.push('<span class="chip purple">🎩 EPIC</span>')
    if (p.wings) powers.push(`<span class="chip blue">🪽 ${p.wingFuel > 0 ? Math.ceil(p.wingFuel) : 'glide'}</span>`)
    if (p.goggles) powers.push('<span class="chip green">🥽</span>')
    if (p.potatoes > 0) powers.push(`<span class="chip brown">🥔×${p.potatoes}</span>`)
    if (p.congaT > 0) powers.push(`<span class="chip pink">💃 CONGA ${Math.ceil(p.congaT)}</span>`)
    if (p.giantT > 0) powers.push(`<span class="chip green">🦣 GIANT ${Math.ceil(p.giantT)}</span>`)
    const ph = powers.join('')
    if (this.get('powers').innerHTML !== ph) this.get('powers').innerHTML = ph

    this.get('clock').textContent = fmtClock(s.time)

    if (s.phase === 'wreck') {
      this.get('goal-wrap').hidden = false
      this.get('boss-wrap').hidden = true
      const pct = Math.floor(s.wreck * 100)
      if (pct !== this.lastPct) {
        this.get('goal-fill').style.width = `${pct}%`
        if (s.goal.kind === 'find') this.get('goal-text').textContent = `${s.goal.item === 'fedora' ? '🎩' : '🥚'} ${s.found} / ${s.goal.count} ${s.goal.item === 'fedora' ? 'FEDORAS' : 'EGGS'}`
        else this.get('goal-text').textContent = pct === 0 ? 'WRECK IT!' : `${pct}% WRECKED`
        this.get('goal-wrap').classList.toggle('almost', pct >= 85)
        this.lastPct = pct
      }
      if (this.lastBoss !== lvl.id) {
        this.get('goal-label').textContent = lvl.name.toUpperCase()
        ;(this.get('goal-boss') as HTMLImageElement).src = `/assets/drawings/${lvl.boss.drawing}`
        ;(this.get('boss-img') as HTMLImageElement).src = `/assets/drawings/${lvl.boss.drawing}`
        this.get('boss-name').innerHTML = `${lvl.boss.name} <small>by ${lvl.boss.drawnBy}</small>`
        this.lastBoss = lvl.id
      }
    } else if (s.boss) {
      this.get('goal-wrap').hidden = true
      this.get('boss-wrap').hidden = false
      const b = s.boss
      const pc = b.def.fight === 'poopcover'
      this.get('boss-fill').style.width = `${pc ? b.cover * 100 : (1 - b.hits / b.totalHits) * 100}%`
      this.get('boss-fill').classList.toggle('cover', pc)
      const segs = this.get('boss-segs')
      if (segs.childElementCount !== b.def.phases) {
        segs.innerHTML = Array.from({ length: b.def.phases }, () => '<i></i>').join('')
      }
      this.get('boss-wrap').classList.toggle('open', b.state === 'exposed')
      this.get('boss-wrap').classList.toggle('angry', bossPhase(b) >= 1)
    }

    const ring = this.get('scream-ring')
    const ch = p.screamCharging ? p.screamCharge : 0
    ring.style.setProperty('--ch', `${ch * 360}deg`)
    this.get('btn-scream').classList.toggle('charging', p.screamCharging)
    this.get('btn-poop').classList.toggle('charging', p.poopHeld && p.poopHoldT > 0.12)

    if (this.hintT > 0) {
      this.hintT -= dt
      if (this.hintT <= 0) this.get('hint').classList.remove('show')
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
    el.style.fontSize = `${Math.min(3.2, 1.0 + size)}rem`
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

  showWon(s: State, hasNext: boolean, timeMs: number, isBest: boolean) {
    const medal = medalFor(timeMs)
    this.get('won-title').textContent = `${currentLevel(s).name.toUpperCase()} CONQUERED!`
    this.get('won-time').textContent = fmtMs(timeMs)
    this.get('won-medal').textContent = medal ? MEDAL[medal] : '⏱️'
    this.get('won-sub').textContent = isBest ? 'NEW PERSONAL BEST! Saving...' : 'Saving...'
    this.get('won-board').innerHTML = ''
    this.get('next').hidden = !hasNext
    this.show('won')
  }

  setWonSub(text: string) {
    this.get('won-sub').textContent = text
  }

  showOver(s: State) {
    const lvl = currentLevel(s)
    const pct = Math.floor(s.wreck * 100)
    this.get('over-sub').textContent =
      s.phase === 'over' && s.boss
        ? `${lvl.boss.name} won this time. You got ${s.boss.hits} of ${s.boss.totalHits} hits in.`
        : `You wrecked ${pct}% of ${lvl.name} in ${fmtClock(s.time)}.`
    this.show('over')
  }

  renderBoard(target: 'won-board' | 'board-list', rows: TimeRow[] | null, note?: string) {
    const el = this.get(target)
    if (!rows) {
      el.innerHTML = `<div class="empty">${note ?? 'Leaderboard offline'}</div>`
      return
    }
    if (rows.length === 0) {
      el.innerHTML = `<div class="empty">${note ?? 'No times yet. Be first!'}</div>`
      return
    }
    el.innerHTML = rows
      .map((r, i) => {
        const medal = medalFor(r.timeMs)
        return `<div class="row ${r.mine ? 'mine' : ''}"><span class="rank">${i + 1}</span><span class="nm">${escapeHtml(r.name)}</span><span class="md">${medal ? MEDAL[medal] : ''}</span><span class="tm">${fmtMs(r.timeMs)}</span></div>`
      })
      .join('')
  }

  setBoardTab(board: string) {
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('#board-tabs .tab')) b.classList.toggle('on', b.dataset.board === board)
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
