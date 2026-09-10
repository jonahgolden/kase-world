// Low-poly globe hub: vertex-colored icosphere with the seven continents, a boss card on each.
import * as THREE from 'three'
import { LEVELS } from '../sim/levels.ts'
import { CONTINENTS } from '../sim/continents.ts'
import { pointInRing } from '../sim/geom.ts'
import { ASSETS } from './assets.ts'

type LonLat = [number, number]
interface ContinentPolys {
  id: string
  polys: LonLat[][][] // [poly][ring][pt]; ring 0 is the outer ring
}

const NAME_TO_ID: Record<string, string> = {
  'North America': 'north-america',
  'South America': 'south-america',
  Antarctica: 'antarctica',
  Asia: 'asia',
  Africa: 'africa',
  Oceania: 'australia',
  Europe: 'europe',
}
const OCEAN = 0x3aa0e8
const ELEV = THREE.MathUtils.degToRad(10)

function lonLatToVec(lon: number, lat: number, r: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.setFromSphericalCoords(r, THREE.MathUtils.degToRad(90 - lat), THREE.MathUtils.degToRad(lon + 90))
}

export interface GlobeProgress {
  unlocked: number // highest level index the player may start
  bests: Record<string, number>
}

export class Globe {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  readonly group = new THREE.Group()
  readonly R = 6
  mode: 'spin' | 'fly' | 'focus' = 'spin'
  private markers = new Map<string, { group: THREE.Group; lock: THREE.Sprite; medal: THREE.Sprite }>()
  private baby: THREE.Sprite
  private fromQ = new THREE.Quaternion()
  private toQ = new THREE.Quaternion()
  private flyT = 0
  private flyDur = 1
  private zoomFrom = 17
  private zoomTo = 17
  private camDist = 17
  private onDone: (() => void) | null = null
  private time = 0
  private tex = new Map<string, THREE.Texture>()
  loaded = false

  constructor() {
    this.scene.background = new THREE.Color(0x0e1633)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223355, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(6, 8, 10)
    this.scene.add(sun)
    this.scene.add(this.group)
    this.group.rotation.x = 0.35
    this.camera.position.set(0, 0, this.camDist)
    this.camera.lookAt(0, 0, 0)
    this.baby = this.textSprite('👶', 1.4)
    this.baby.visible = false
    this.group.add(this.baby)
    this.addStars()
  }

  private addStars() {
    const n = 300
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20)
      pos.set([v.x, v.y, v.z], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, sizeAttenuation: true })))
  }

  resize(aspect: number) {
    this.camera.aspect = aspect
    this.camera.fov = aspect < 1 ? 52 : 38
    this.camera.updateProjectionMatrix()
  }

  async load() {
    let continents: ContinentPolys[] = []
    try {
      const res = await fetch('/continents.geojson')
      const fc = (await res.json()) as { features: { properties: { CONTINENT: string }; geometry: { type: string; coordinates: unknown } }[] }
      continents = fc.features
        .map((f) => {
          const id = NAME_TO_ID[f.properties.CONTINENT]
          const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as LonLat[][][]
          return { id, polys }
        })
        .filter((c) => c.id)
    } catch (e) {
      console.warn('globe data failed', e)
    }
    this.buildSphere(continents)
    for (const lvl of LEVELS) this.addMarker(lvl.id)
    this.loaded = true
  }

  private buildSphere(continents: ContinentPolys[]) {
    const geo = new THREE.IcosahedronGeometry(this.R, 18)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    const v = new THREE.Vector3()
    const themeOf = (id: string) => LEVELS.find((l) => l.id === id)?.theme.ground ?? 0x7ec850
    for (let f = 0; f < pos.count; f += 3) {
      v.set(0, 0, 0)
      for (let k = 0; k < 3; k++) v.add(new THREE.Vector3(pos.getX(f + k), pos.getY(f + k), pos.getZ(f + k)))
      v.multiplyScalar(1 / 3).normalize()
      const lat = THREE.MathUtils.radToDeg(Math.asin(v.y))
      const lon = THREE.MathUtils.radToDeg(Math.atan2(-v.z, v.x))
      let land: string | null = null
      for (const ct of continents) {
        for (const poly of ct.polys) {
          if (!pointInRing(lon, lat, poly[0])) continue
          let inHole = false
          for (let h = 1; h < poly.length; h++) if (pointInRing(lon, lat, poly[h])) inHole = true
          if (!inHole) {
            land = ct.id
            break
          }
        }
        if (land) break
      }
      c.set(land ? themeOf(land) : OCEAN)
      if (land) c.offsetHSL(0, 0, ((f / 3) % 7) * 0.006 - 0.02)
      for (let k = 0; k < 3; k++) {
        colors.set([c.r, c.g, c.b], (f + k) * 3)
        if (land) {
          const s = 1.025
          pos.setXYZ(f + k, pos.getX(f + k) * s, pos.getY(f + k) * s, pos.getZ(f + k) * s)
        }
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
    this.group.add(mesh)
    const rim = new THREE.Mesh(new THREE.SphereGeometry(this.R * 1.08, 32, 24), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.12, side: THREE.BackSide }))
    this.group.add(rim)
  }

  private cardTexture(file: string): THREE.Texture {
    const cached = this.tex.get(file)
    if (cached) return cached
    const cv = document.createElement('canvas')
    cv.width = 256
    cv.height = 320
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#fffaf0'
    ctx.beginPath()
    ctx.roundRect(0, 0, cv.width, cv.height, 20)
    ctx.fill()
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const img = new Image()
    img.onload = () => {
      const pad = 14
      const w = cv.width - pad * 2
      const h = cv.height - pad * 2
      const s = Math.max(w / img.width, h / img.height)
      const dw = img.width * s
      const dh = img.height * s
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(pad, pad, w, h, 12)
      ctx.clip()
      ctx.drawImage(img, pad + (w - dw) / 2, pad + (h - dh) / 2, dw, dh)
      ctx.restore()
      tex.needsUpdate = true
    }
    img.src = ASSETS.drawing(file)
    this.tex.set(file, tex)
    return tex
  }

  private textSprite(text: string, size: number): THREE.Sprite {
    const cv = document.createElement('canvas')
    cv.width = 128
    cv.height = 128
    const ctx = cv.getContext('2d')!
    ctx.font = '96px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 64, 70)
    const tex = new THREE.CanvasTexture(cv)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
    sp.scale.setScalar(size)
    return sp
  }

  private addMarker(id: string) {
    const lvl = LEVELS.find((l) => l.id === id)!
    const c = CONTINENTS[id]
    const dir = lonLatToVec(c.lonLat[0], c.lonLat[1], 1).normalize()
    const g = new THREE.Group()
    g.position.copy(dir).multiplyScalar(this.R * 1.04)
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), new THREE.MeshLambertMaterial({ color: lvl.theme.accent }))
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
    pin.position.copy(dir).multiplyScalar(0.25)
    g.add(pin)
    const card = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.cardTexture(lvl.boss.drawing), transparent: true }))
    card.scale.set(1.6, 2.0, 1)
    card.position.copy(dir).multiplyScalar(1.45)
    g.add(card)
    const lock = this.textSprite('🔒', 1.1)
    lock.position.copy(dir).multiplyScalar(1.5)
    g.add(lock)
    const medal = this.textSprite('🥇', 0.9)
    medal.position.copy(dir).multiplyScalar(1.5).add(new THREE.Vector3(0.7, -0.8, 0))
    medal.visible = false
    g.add(medal)
    this.group.add(g)
    this.markers.set(id, { group: g, lock, medal })
  }

  setProgress(p: GlobeProgress, currentId: string | null) {
    LEVELS.forEach((lvl, i) => {
      const m = this.markers.get(lvl.id)
      if (!m) return
      m.lock.visible = i > p.unlocked
      const best = p.bests[lvl.id]
      m.medal.visible = best !== undefined
      if (best !== undefined) {
        const t = best <= 120_000 ? '🥇' : best <= 180_000 ? '🥈' : '🥉'
        const mat = m.medal.material as THREE.SpriteMaterial
        mat.map = this.textSprite(t, 1).material.map
        mat.needsUpdate = true
      }
    })
    if (currentId) {
      const c = CONTINENTS[currentId]
      const dir = lonLatToVec(c.lonLat[0], c.lonLat[1], 1).normalize()
      this.baby.position.copy(dir).multiplyScalar(this.R * 1.04).add(new THREE.Vector3(-0.9, 0.6, 0))
      this.baby.visible = true
    } else {
      this.baby.visible = false
    }
  }

  private orientationFor(id: string): THREE.Quaternion {
    const c = CONTINENTS[id]
    const lat = THREE.MathUtils.degToRad(c.lonLat[1])
    const theta = THREE.MathUtils.degToRad(c.lonLat[0] + 90)
    const e = new THREE.Euler(lat - ELEV, -theta, 0, 'XYZ')
    return new THREE.Quaternion().setFromEuler(e)
  }

  // Rotate the globe so `id` faces the camera; zoom in when `zoom` is set; call `done` at the end.
  flyTo(id: string, zoom: boolean, done?: () => void, dur = 1.5) {
    this.mode = 'fly'
    this.fromQ.copy(this.group.quaternion)
    this.toQ.copy(this.orientationFor(id))
    this.flyT = 0
    this.flyDur = dur
    this.zoomFrom = this.camDist
    this.zoomTo = zoom ? 7.2 : 15
    this.onDone = done ?? null
  }

  spin() {
    this.mode = 'spin'
    this.zoomTo = 17
    this.onDone = null
  }

  update(dt: number) {
    this.time += dt
    if (this.mode === 'spin') {
      const e = new THREE.Euler().setFromQuaternion(this.group.quaternion, 'XYZ')
      this.group.rotation.set(0.35, e.y + dt * 0.12, 0, 'XYZ')
      this.camDist += (this.zoomTo - this.camDist) * Math.min(1, dt * 2)
    } else if (this.mode === 'fly') {
      this.flyT = Math.min(this.flyDur, this.flyT + dt)
      const k = this.flyT / this.flyDur
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      this.group.quaternion.slerpQuaternions(this.fromQ, this.toQ, ease)
      const zk = Math.max(0, (k - 0.35) / 0.65)
      this.camDist = this.zoomFrom + (this.zoomTo - this.zoomFrom) * zk * zk
      if (this.flyT >= this.flyDur) {
        this.mode = 'focus'
        const cb = this.onDone
        this.onDone = null
        cb?.()
      }
    } else {
      this.camDist += (this.zoomTo - this.camDist) * Math.min(1, dt * 2)
    }
    for (const m of this.markers.values()) {
      const s = 1 + Math.sin(this.time * 2.2 + m.group.position.x) * 0.04
      m.group.scale.setScalar(s)
    }
    this.camera.position.set(0, 0.4, this.camDist)
    this.camera.lookAt(0, 0.2, 0)
  }
}
