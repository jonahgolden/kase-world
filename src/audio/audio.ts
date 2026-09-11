// Web Audio driver. Files from /assets/audio/manifest.json win; anything missing is synthesized.
import type { EventType } from '../sim/types.ts'

type Manifest = Record<string, string[] | string>

export class AudioDriver {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private manifest: Manifest = {}
  private buffers = new Map<string, AudioBuffer[]>()
  private loading = new Set<string>()
  private voices = 0
  private lastPlay = new Map<string, number>()
  private musicTimer: number | null = null
  private musicGain: GainNode | null = null
  private musicStep = 0
  muted = false

  constructor(private base = '/assets/audio/') {}

  async loadManifest() {
    try {
      const res = await fetch(this.base + 'manifest.json')
      if (res.ok) this.manifest = (await res.json()) as Manifest
    } catch {
      /* offline: synth only */
    }
  }

  // Call from a user gesture. Safe to call repeatedly.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.8
      this.master.connect(this.ctx.destination)
      for (const key of Object.keys(this.manifest)) if (!key.startsWith('_')) void this.ensure(key)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private async ensure(key: string) {
    if (!this.ctx || this.buffers.has(key) || this.loading.has(key)) return
    const files = ([] as string[]).concat(this.manifest[key] ?? [])
    if (files.length === 0) return
    this.loading.add(key)
    const out: AudioBuffer[] = []
    for (const f of files) {
      try {
        const res = await fetch(this.base + f)
        if (!res.ok) continue
        out.push(await this.ctx.decodeAudioData(await res.arrayBuffer()))
      } catch {
        /* skip */
      }
    }
    if (out.length) this.buffers.set(key, out)
    this.loading.delete(key)
  }

  // A soft looping lullaby-ish arpeggio for the sky. Pentatonic, quiet, no drums.
  music(on: boolean) {
    if (!on) {
      if (this.musicTimer !== null) window.clearInterval(this.musicTimer)
      this.musicTimer = null
      if (this.musicGain && this.ctx) {
        this.musicGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.8)
      }
      return
    }
    if (!this.ctx || !this.master || this.musicTimer !== null) return
    const ctx = this.ctx
    this.musicGain = ctx.createGain()
    this.musicGain.gain.value = 0.11
    this.musicGain.connect(this.master)
    const notes = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3]
    const pattern = [0, 2, 4, 7, 4, 2, 5, 3, 0, 3, 5, 7, 6, 4, 2, 1]
    const stepMs = 260
    this.musicStep = 0
    const tick = () => {
      if (!this.ctx || !this.musicGain || this.muted) return
      const t = this.ctx.currentTime
      const n = notes[pattern[this.musicStep % pattern.length]]
      const o = this.ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = n
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(1, t + 0.04)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
      o.connect(g).connect(this.musicGain)
      o.start(t)
      o.stop(t + 0.75)
      if (this.musicStep % 4 === 0) {
        const pad = this.ctx.createOscillator()
        pad.type = 'sine'
        pad.frequency.value = n / 2
        const pg = this.ctx.createGain()
        pg.gain.setValueAtTime(0.0001, t)
        pg.gain.exponentialRampToValueAtTime(0.5, t + 0.2)
        pg.gain.exponentialRampToValueAtTime(0.001, t + 1.0)
        pad.connect(pg).connect(this.musicGain)
        pad.start(t)
        pad.stop(t + 1.05)
      }
      this.musicStep++
    }
    tick()
    this.musicTimer = window.setInterval(tick, stepMs)
  }

  play(event: EventType | string, opts: { vol?: number; pitch?: number; big?: number } = {}) {
    if (!this.ctx || !this.master || this.muted) return
    const now = this.ctx.currentTime
    const last = this.lastPlay.get(event) ?? -1
    const minGap = event === 'score' ? 0.05 : 0.03
    if (now - last < minGap) return
    this.lastPlay.set(event, now)
    if (this.voices > 14) return
    const bufs = this.buffers.get(event)
    if (bufs && bufs.length) {
      const src = this.ctx.createBufferSource()
      src.buffer = bufs[Math.floor(Math.random() * bufs.length)]
      src.playbackRate.value = (opts.pitch ?? 1) * (0.92 + Math.random() * 0.16)
      const g = this.ctx.createGain()
      g.gain.value = opts.vol ?? 1
      src.connect(g).connect(this.master)
      this.voice(src, g, now, src.buffer.duration / src.playbackRate.value)
      return
    }
    this.synth(event, opts)
  }

  private voice(node: AudioScheduledSourceNode, _g: GainNode, when: number, dur: number) {
    this.voices++
    node.start(when)
    node.stop(when + dur + 0.05)
    node.onended = () => {
      this.voices--
    }
  }

  private noise(dur: number) {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    return src
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, when = 0, curve: 'exp' | 'lin' = 'exp') {
    const ctx = this.ctx!
    const t = ctx.currentTime + when
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    else o.frequency.linearRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g).connect(this.master!)
    this.voice(o, g, t, dur)
  }

  private burst(dur: number, vol: number, filterType: BiquadFilterType, freq: number, when = 0, q = 1) {
    const ctx = this.ctx!
    const t = ctx.currentTime + when
    const n = this.noise(dur)
    const f = ctx.createBiquadFilter()
    f.type = filterType
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    n.connect(f).connect(g).connect(this.master!)
    this.voice(n, g, t, dur)
  }

  private synth(event: string, opts: { vol?: number; pitch?: number; big?: number }) {
    const big = opts.big ?? 0.5
    const v = opts.vol ?? 1
    const p = opts.pitch ?? 1
    switch (event) {
      case 'scream':
        this.tone('sawtooth', 520 * p, 780 * p, 0.55, 0.25 * v)
        this.tone('square', 1040 * p, 900 * p, 0.5, 0.06 * v)
        this.burst(0.5, 0.15 * v, 'bandpass', 1800, 0, 0.7)
        break
      case 'smash':
        this.burst(0.16 + big * 0.2, 0.5 * v, 'bandpass', 700 - big * 300, 0, 0.8)
        this.tone('sine', 110, 40, 0.18 + big * 0.15, 0.6 * v)
        break
      case 'propHit':
        this.burst(0.06, 0.25 * v, 'highpass', 1200)
        break
      case 'splat':
        this.tone('sine', 190, 55, 0.16, 0.5 * v)
        this.burst(0.1, 0.25 * v, 'lowpass', 900)
        break
      case 'poopThrow':
        this.burst(0.16, 0.2 * v, 'highpass', 2500)
        break
      case 'npcScared':
        this.tone('square', 680 * p, 960 * p, 0.09, 0.14 * v)
        this.tone('square', 960 * p, 720 * p, 0.12, 0.12 * v, 0.1)
        break
      case 'npcHit':
        this.tone('triangle', 320, 110, 0.14, 0.4 * v)
        break
      case 'playerHurt':
        this.tone('sawtooth', 220, 80, 0.28, 0.35 * v)
        this.burst(0.12, 0.2 * v, 'lowpass', 600)
        break
      case 'bossTelegraph':
        this.tone('square', 70, 62, 0.45, 0.22 * v, 0, 'lin')
        this.tone('square', 105, 93, 0.45, 0.1 * v, 0, 'lin')
        break
      case 'bossAttack':
        this.burst(0.35, 0.3 * v, 'lowpass', 900)
        this.tone('sawtooth', 160, 90, 0.3, 0.2 * v)
        break
      case 'bossStomp':
        this.tone('sine', 65, 28, 0.5, 0.7 * v)
        this.burst(0.25, 0.4 * v, 'lowpass', 400)
        break
      case 'bossHurt':
        this.tone('square', 420, 240, 0.16, 0.25 * v)
        this.burst(0.1, 0.25 * v, 'bandpass', 1500)
        break
      case 'bossBlocked':
        this.tone('square', 200, 180, 0.08, 0.12 * v, 0, 'lin')
        break
      case 'bossPhase':
        for (let i = 0; i < 3; i++) this.tone('square', 220 * (1 + i * 0.5), 220 * (1 + i * 0.5), 0.14, 0.15 * v, i * 0.12, 'lin')
        break
      case 'bossDead':
      case 'win':
        for (let i = 0; i < 6; i++) this.tone('square', [262, 330, 392, 523, 659, 784][i], [262, 330, 392, 523, 659, 784][i], 0.22, 0.14 * v, i * 0.1, 'lin')
        break
      case 'duoGrow':
        this.tone('sine', 300, 900 + big * 600, 0.2, 0.12 * v)
        break
      case 'duoShrink':
        this.tone('sine', 900, 260, 0.28, 0.16 * v)
        break
      case 'duoPeck':
        this.tone('square', 900, 700, 0.05, 0.1 * v)
        this.tone('square', 900, 700, 0.05, 0.1 * v, 0.08)
        break
      case 'jump':
        this.tone('sine', 280, 620, 0.12, 0.12 * v)
        break
      case 'land':
        this.burst(0.05, 0.1 * v, 'lowpass', 500)
        break
      case 'multUp':
        this.tone('square', 440 * p, 440 * p, 0.07, 0.1 * v, 0, 'lin')
        break
      case 'multLost':
        this.tone('square', 330, 330, 0.1, 0.1 * v, 0, 'lin')
        this.tone('square', 220, 220, 0.16, 0.1 * v, 0.1, 'lin')
        break
      case 'gameOver':
        for (let i = 0; i < 4; i++) this.tone('sawtooth', [392, 349, 311, 262][i], [392, 349, 311, 262][i] * 0.97, 0.3, 0.12 * v, i * 0.25, 'lin')
        break
      case 'levelPhase':
        this.tone('sawtooth', 110, 55, 0.6, 0.3 * v)
        this.burst(0.5, 0.3 * v, 'lowpass', 300)
        break
      case 'ui':
        this.tone('square', 600, 600, 0.05, 0.08 * v, 0, 'lin')
        break
      case 'chicken':
        this.tone('square', 900 * p, 1300 * p, 0.06, 0.12 * v)
        this.tone('square', 1200 * p, 800 * p, 0.09, 0.1 * v, 0.07)
        break
      case 'portal':
        this.tone('sine', 300, 1400, 0.35, 0.18 * v)
        this.tone('triangle', 150, 700, 0.35, 0.1 * v, 0.05)
        break
      case 'fan':
        this.burst(0.4, 0.3 * v, 'bandpass', 900, 0, 0.5)
        this.tone('sine', 200, 900, 0.3, 0.12 * v)
        break
      case 'flap':
        this.burst(0.12, 0.05 * v, 'lowpass', 500)
        break
      case 'explode':
        this.tone('sine', 90, 30, 0.5, 0.8 * v)
        this.burst(0.45, 0.6 * v, 'lowpass', 700)
        this.burst(0.2, 0.3 * v, 'highpass', 2000, 0.05)
        break
      case 'bossLand':
        this.tone('sine', 60, 25, 0.7, 0.9 * v)
        this.burst(0.5, 0.5 * v, 'lowpass', 300)
        break
      default:
        break
    }
  }
}
