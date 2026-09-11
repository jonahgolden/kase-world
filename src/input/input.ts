// Keyboard + mouse + touch -> Input. The only place that knows about DOM events.
import type { Input } from '../sim/types.ts'

const JOY_RADIUS = 52

export class InputDriver {
  readonly touch: boolean
  private keys = new Set<string>()
  private joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 }
  private held = { scream: false, poop: false, jump: false }
  private mouse = { poop: false, scream: false, x: 0, y: 0, movedAt: -1e9 }
  aimProvider: ((sx: number, sy: number) => { x: number; z: number } | null) | null = null
  private joyEl: HTMLElement
  private knobEl: HTMLElement
  private zoneEl: HTMLElement

  constructor(
    private root: HTMLElement,
    canvas: HTMLCanvasElement,
  ) {
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
    root.classList.toggle('touch', this.touch)
    this.zoneEl = root.querySelector('#joy-zone')!
    this.joyEl = root.querySelector('#joy')!
    this.knobEl = root.querySelector('#joy-knob')!
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      this.keys.add(e.code)
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.clear())
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return
      this.mouse.x = e.clientX
      this.mouse.y = e.clientY
      this.mouse.movedAt = performance.now()
    })
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return
      if (e.button === 0) this.mouse.poop = true
      if (e.button === 2) this.mouse.scream = true
      e.preventDefault()
    })
    const mouseUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (e.button === 0) this.mouse.poop = false
      if (e.button === 2) this.mouse.scream = false
    }
    window.addEventListener('pointerup', mouseUp)
    window.addEventListener('pointercancel', mouseUp)
    this.bindJoystick()
    this.bindButton('#btn-scream', 'scream')
    this.bindButton('#btn-poop', 'poop')
    this.bindButton('#btn-jump', 'jump')
  }

  clear() {
    this.keys.clear()
    this.held = { scream: false, poop: false, jump: false }
    this.mouse.poop = false
    this.mouse.scream = false
  }

  private bindJoystick() {
    const z = this.zoneEl
    z.addEventListener('pointerdown', (e) => {
      if (this.joy.active) return
      this.joy.active = true
      this.joy.id = e.pointerId
      this.joy.ox = e.clientX
      this.joy.oy = e.clientY
      this.joy.x = 0
      this.joy.y = 0
      z.setPointerCapture(e.pointerId)
      this.joyEl.style.left = `${e.clientX}px`
      this.joyEl.style.top = `${e.clientY}px`
      this.joyEl.classList.add('on')
      this.knobEl.style.transform = 'translate(0px, 0px)'
      e.preventDefault()
    })
    z.addEventListener('pointermove', (e) => {
      if (!this.joy.active || e.pointerId !== this.joy.id) return
      let dx = e.clientX - this.joy.ox
      let dy = e.clientY - this.joy.oy
      const d = Math.hypot(dx, dy)
      if (d > JOY_RADIUS) {
        dx *= JOY_RADIUS / d
        dy *= JOY_RADIUS / d
      }
      // scaled-radial dead zone, then squared magnitude for fine control near the centre
      const mag = Math.min(1, Math.hypot(dx, dy) / JOY_RADIUS)
      const dz = 0.15
      const m = mag < dz ? 0 : ((mag - dz) / (1 - dz)) ** 2
      const nx = mag > 0 ? dx / (mag * JOY_RADIUS) : 0
      const ny = mag > 0 ? dy / (mag * JOY_RADIUS) : 0
      this.joy.x = nx * m
      this.joy.y = ny * m
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`
    })
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joy.id) return
      this.joy.active = false
      this.joy.x = 0
      this.joy.y = 0
      this.joyEl.classList.remove('on')
    }
    z.addEventListener('pointerup', end)
    z.addEventListener('pointercancel', end)
  }

  private bindButton(sel: string, key: 'scream' | 'poop' | 'jump') {
    const el = this.root.querySelector<HTMLElement>(sel)!
    const down = (e: PointerEvent) => {
      this.held[key] = true
      el.classList.add('down')
      el.setPointerCapture(e.pointerId)
      e.preventDefault()
    }
    const up = () => {
      this.held[key] = false
      el.classList.remove('down')
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('lostpointercapture', up)
  }

  private key(...codes: string[]) {
    for (const c of codes) if (this.keys.has(c)) return true
    return false
  }

  read(): Input {
    let mx = 0
    let mz = 0
    if (this.key('KeyA', 'ArrowLeft')) mx -= 1
    if (this.key('KeyD', 'ArrowRight')) mx += 1
    if (this.key('KeyW', 'ArrowUp')) mz -= 1
    if (this.key('KeyS', 'ArrowDown')) mz += 1
    if (this.joy.active) {
      mx += this.joy.x
      mz += this.joy.y
    }
    const len = Math.hypot(mx, mz)
    if (len > 1) {
      mx /= len
      mz /= len
    }
    const out: Input = {
      mx,
      mz,
      scream: this.held.scream || this.mouse.scream || this.key('Space', 'KeyJ'),
      poop: this.held.poop || this.mouse.poop || this.key('KeyE', 'KeyF', 'KeyK', 'Enter'),
      jump: this.held.jump || this.key('ShiftLeft', 'ShiftRight', 'KeyL', 'KeyQ'),
    }
    // mouse aim: the baby faces the cursor for a few seconds after it moves
    if (!this.touch && this.aimProvider && performance.now() - this.mouse.movedAt < 4000) {
      const a = this.aimProvider(this.mouse.x, this.mouse.y)
      if (a) {
        out.aimX = a.x
        out.aimZ = a.z
      }
    }
    return out
  }
}
