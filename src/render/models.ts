// Primitive 3D builds for characters: the animal groups, Kacone, the giraffe ride. Pure functions of a
// toon-material factory, so they stay out of the renderer's way. The kids' drawings stay on the HUD cards.
import * as THREE from 'three'
import type { Npc, PropKind } from '../sim/types.ts'

export interface Flashable {
  mats: THREE.MeshToonMaterial[]
}

export type Toon = (c: number) => THREE.MeshToonMaterial

export type NpcView = THREE.Group & Flashable & { eyes: THREE.Object3D; body: THREE.Object3D }

// What a builder may borrow from the renderer: toon materials, the shared gradient, emoji prompt sprites.
export interface ModelCtx {
  toon: Toon
  gradient: THREE.Texture
  promptSprite: (text: string) => THREE.Sprite
}

// A rideable giraffe: Kase sits on its back, high above stampedes.
export function makeGiraffe(toon: Toon): THREE.Group {
  const g = new THREE.Group()
  const yellow = toon(0xf2c14e)
  const brown = toon(0x8b5a2b)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1.4), yellow)
  body.position.y = 1.15
  body.castShadow = true
  g.add(body)
  for (const [x, z] of [
    [-0.28, 0.5],
    [0.28, 0.5],
    [-0.28, -0.5],
    [0.28, -0.5],
  ]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.9, 8), yellow)
    leg.position.set(x, 0.45, z)
    leg.name = 'leg'
    g.add(leg)
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.3, 8), yellow)
  neck.position.set(0, 1.95, 0.75)
  neck.rotation.x = -0.35
  g.add(neck)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.55), yellow)
  head.position.set(0, 2.6, 1.05)
  g.add(head)
  for (const x of [-0.1, 0.1]) {
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), brown)
    horn.position.set(x, 2.85, 0.95)
    g.add(horn)
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
    eye.position.set(x * 1.8, 2.68, 1.3)
    g.add(eye)
  }
  for (const [x, y, z] of [
    [0.41, 1.2, 0.3],
    [-0.41, 1.05, -0.2],
    [0.41, 1.0, -0.45],
    [-0.41, 1.3, 0.45],
    [0, 1.46, 0.1],
  ]) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), brown)
    spot.position.set(x, y, z)
    spot.scale.set(0.5, 1, 1)
    g.add(spot)
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.5, 5), brown)
  tail.position.set(0, 1.1, -0.8)
  tail.rotation.x = 0.5
  g.add(tail)
  return g
}

// Nova's animal groups as primitive 3D builds. The drawing stays on the HUD and the boss card.
export function makePartModel(toon: Toon, kind: string): (THREE.Group & Flashable) | null {
  const g = new THREE.Group() as THREE.Group & Flashable
  g.mats = []
  const mat = (c: number) => {
    const m = toon(c)
    g.mats.push(m)
    return m
  }
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    g.add(mesh)
    return mesh
  }
  const eyes = (y: number, z: number, dx: number, r = 0.09, color = 0x111111) => {
    for (const x of [-dx, dx]) add(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color }), x, y, z)
  }
  switch (kind) {
    case 'kangaroo': {
      const fur = mat(0xb87a4a)
      const body = add(new THREE.CapsuleGeometry(0.5, 0.9, 6, 12), fur, 0, 1.35)
      body.rotation.x = 0.25
      add(new THREE.SphereGeometry(0.36, 12, 10), fur, 0, 2.3, 0.35)
      add(new THREE.BoxGeometry(0.28, 0.24, 0.42), mat(0x8b5a2b), 0, 2.15, 0.75)
      for (const x of [-0.18, 0.18]) {
        const ear = add(new THREE.ConeGeometry(0.1, 0.45, 6), fur, x, 2.75, 0.25)
        ear.rotation.z = -x * 1.2
      }
      eyes(2.38, 0.66, 0.15, 0.06)
      const tail = add(new THREE.CylinderGeometry(0.1, 0.22, 1.6, 8), fur, 0, 0.5, -0.9)
      tail.rotation.x = 1.15
      for (const side of [-1, 1]) {
        const leg = new THREE.Group()
        const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), fur)
        thigh.position.y = 0.5
        thigh.rotation.x = 0.4
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.95), mat(0x8b5a2b))
        foot.position.set(0, 0.08, 0.25)
        thigh.castShadow = foot.castShadow = true
        leg.add(thigh, foot)
        leg.position.x = side * 0.32
        leg.name = side < 0 ? 'legL' : 'legR'
        g.add(leg)
        const glove = add(new THREE.SphereGeometry(0.22, 10, 8), mat(0xd93a3a), side * 0.45, 1.55, 0.5)
        glove.name = side < 0 ? 'gloveL' : 'gloveR'
      }
      return g
    }
    case 'emu': {
      const grey = mat(0x6b7a99)
      const body = add(new THREE.SphereGeometry(0.62, 12, 10), grey, 0, 1.45)
      body.scale.set(1, 0.85, 1.25)
      add(new THREE.SphereGeometry(0.5, 10, 8), mat(0x3aa0e8), 0, 1.5, -0.3)
      const neck = add(new THREE.CylinderGeometry(0.1, 0.14, 1.3, 8), grey, 0, 2.3, 0.45)
      neck.rotation.x = -0.25
      add(new THREE.SphereGeometry(0.2, 10, 8), grey, 0, 2.95, 0.62)
      const beak = add(new THREE.ConeGeometry(0.07, 0.3, 6), mat(0xffb020), 0, 2.9, 0.9)
      beak.rotation.x = Math.PI / 2
      eyes(3.0, 0.74, 0.1, 0.05)
      for (const side of [-1, 1]) {
        const leg = new THREE.Group()
        const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.2, 6), mat(0xd0c8a0))
        shin.position.y = 0.6
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.4), mat(0xd0c8a0))
        foot.position.set(0, 0.04, 0.1)
        shin.castShadow = true
        leg.add(shin, foot)
        leg.position.set(side * 0.22, 0, 0)
        leg.name = side < 0 ? 'legL' : 'legR'
        g.add(leg)
      }
      return g
    }
    case 'rockfish': {
      const rock = mat(0x7a6a5a)
      const body = add(new THREE.SphereGeometry(0.85, 12, 8), rock, 0, 0.3)
      body.scale.set(1, 0.42, 0.8)
      for (let i = 0; i < 7; i++) {
        const sp = add(new THREE.ConeGeometry(0.08, 0.35 + (i % 2) * 0.15, 5), mat(i % 2 ? 0x9a8a7a : 0x5a4a3a), -0.6 + i * 0.2, 0.62, 0)
        sp.rotation.z = (i - 3) * 0.15
      }
      add(new THREE.ConeGeometry(0.25, 0.4, 4), rock, 0, 0.3, -0.95).rotation.x = -Math.PI / 2
      eyes(0.5, 0.55, 0.28, 0.08, 0xff2020)
      add(new THREE.BoxGeometry(0.4, 0.06, 0.1), mat(0xffffff), 0, 0.32, 0.72)
      return g
    }
    case 'devil': {
      const black = mat(0x1e1e26)
      const body = add(new THREE.CapsuleGeometry(0.45, 0.5, 6, 10), black, 0, 0.95)
      body.rotation.x = 0.35
      add(new THREE.BoxGeometry(0.5, 0.12, 0.3), mat(0xffffff), 0, 0.95, 0.42)
      add(new THREE.SphereGeometry(0.34, 12, 10), black, 0, 1.55, 0.4)
      for (const x of [-0.2, 0.2]) add(new THREE.ConeGeometry(0.1, 0.3, 6), mat(0xff8fab), x, 1.9, 0.3)
      eyes(1.62, 0.7, 0.14, 0.06, 0xff2020)
      add(new THREE.BoxGeometry(0.42, 0.14, 0.2), mat(0xd93a3a), 0, 1.4, 0.68)
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.06, 0.1, 0.06), mat(0xffffff), -0.15 + i * 0.1, 1.46, 0.76)
      for (const side of [-1, 1]) {
        const leg = add(new THREE.CylinderGeometry(0.09, 0.1, 0.55, 6), black, side * 0.24, 0.28, 0.1)
        leg.name = side < 0 ? 'legL' : 'legR'
      }
      return g
    }
    case 'lion': {
      const gold = mat(0xf2c14e)
      const body = add(new THREE.CapsuleGeometry(0.55, 1.2, 6, 12), gold, 0, 1.15)
      body.rotation.x = Math.PI / 2
      const mane = add(new THREE.SphereGeometry(0.72, 12, 10), mat(0x6b3a1e), 0, 1.45, 0.95)
      mane.scale.set(1, 1, 0.7)
      add(new THREE.SphereGeometry(0.45, 12, 10), gold, 0, 1.45, 1.15)
      add(new THREE.BoxGeometry(0.5, 0.12, 0.16), mat(0xffffff), 0, 1.25, 1.58)
      add(new THREE.BoxGeometry(0.5, 0.06, 0.12), mat(0x2b1a10), 0, 1.33, 1.6)
      eyes(1.58, 1.5, 0.17, 0.07)
      for (const [x, z] of [
        [-0.35, 0.6],
        [0.35, 0.6],
        [-0.35, -0.6],
        [0.35, -0.6],
      ]) {
        const leg = add(new THREE.CylinderGeometry(0.13, 0.15, 0.9, 8), gold, x, 0.45, z)
        leg.name = z > 0 ? (x < 0 ? 'legL' : 'legR') : 'leg'
        add(new THREE.SphereGeometry(0.17, 8, 6), gold, x, 0.08, z)
      }
      const tail = add(new THREE.CylinderGeometry(0.04, 0.05, 1.0, 6), gold, 0, 1.2, -1.3)
      tail.rotation.x = 0.9
      add(new THREE.SphereGeometry(0.12, 8, 6), mat(0x6b3a1e), 0, 1.5, -1.7)
      return g
    }
    case 'giraffe': {
      const yellow = mat(0xf2c14e)
      const brown = mat(0x8b5a2b)
      const body = add(new THREE.BoxGeometry(0.9, 0.7, 1.5), yellow, 0, 1.4)
      void body
      for (const [x, z] of [
        [-0.32, 0.55],
        [0.32, 0.55],
        [-0.32, -0.55],
        [0.32, -0.55],
      ]) {
        const leg = add(new THREE.CylinderGeometry(0.1, 0.09, 1.1, 8), yellow, x, 0.55, z)
        leg.name = z > 0 ? (x < 0 ? 'legL' : 'legR') : 'leg'
      }
      const neck = add(new THREE.CylinderGeometry(0.16, 0.2, 1.7, 8), yellow, 0, 2.5, 0.75)
      neck.rotation.x = -0.3
      add(new THREE.BoxGeometry(0.36, 0.32, 0.6), yellow, 0, 3.35, 1.1)
      for (const x of [-0.1, 0.1]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), brown, x, 3.62, 1.0)
      eyes(3.42, 1.42, 0.16, 0.05)
      for (const [x, y, z] of [
        [0.46, 1.5, 0.3],
        [-0.46, 1.35, -0.2],
        [0.46, 1.25, -0.5],
        [-0.46, 1.6, 0.5],
        [0, 1.78, 0.1],
        [0.1, 2.5, 0.72],
        [-0.1, 2.9, 0.85],
      ]) {
        const spot = add(new THREE.SphereGeometry(0.12, 6, 5), brown, x, y, z)
        spot.scale.set(0.5, 1, 1)
      }
      return g
    }
    case 'rhino': {
      const grey = mat(0x8a8a94)
      const body = add(new THREE.CapsuleGeometry(0.7, 1.3, 6, 12), grey, 0, 1.1)
      body.rotation.x = Math.PI / 2
      add(new THREE.BoxGeometry(0.8, 0.7, 0.9), grey, 0, 1.05, 1.25)
      const horn = add(new THREE.ConeGeometry(0.14, 0.7, 8), mat(0xe8e0d0), 0, 1.35, 1.75)
      horn.rotation.x = -0.5
      const horn2 = add(new THREE.ConeGeometry(0.09, 0.35, 8), mat(0xe8e0d0), 0, 1.5, 1.35)
      horn2.rotation.x = -0.3
      for (const x of [-0.3, 0.3]) add(new THREE.ConeGeometry(0.1, 0.25, 6), grey, x, 1.5, 0.95)
      eyes(1.25, 1.55, 0.3, 0.06)
      for (const [x, z] of [
        [-0.42, 0.6],
        [0.42, 0.6],
        [-0.42, -0.6],
        [0.42, -0.6],
      ]) {
        const leg = add(new THREE.CylinderGeometry(0.18, 0.2, 0.8, 8), grey, x, 0.4, z)
        leg.name = z > 0 ? (x < 0 ? 'legL' : 'legR') : 'leg'
      }
      return g
    }
    case 'elephant': {
      const grey = mat(0x9aa0b0)
      const body = add(new THREE.SphereGeometry(1.0, 14, 10), grey, 0, 1.6)
      body.scale.set(1, 0.9, 1.3)
      add(new THREE.SphereGeometry(0.62, 12, 10), grey, 0, 1.9, 1.35)
      for (const side of [-1, 1]) {
        const ear = add(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16), grey, side * 0.75, 1.95, 1.2)
        ear.rotation.y = side * 0.5
      }
      const trunk = add(new THREE.CylinderGeometry(0.1, 0.18, 1.4, 8), grey, 0, 1.25, 1.95)
      trunk.rotation.x = 0.35
      trunk.name = 'trunk'
      for (const x of [-0.25, 0.25]) {
        const tusk = add(new THREE.ConeGeometry(0.06, 0.6, 6), mat(0xfff3d6), x, 1.55, 1.85)
        tusk.rotation.x = Math.PI / 2 + 0.3
      }
      eyes(2.1, 1.85, 0.25, 0.07)
      for (const [x, z] of [
        [-0.55, 0.7],
        [0.55, 0.7],
        [-0.55, -0.7],
        [0.55, -0.7],
      ]) {
        const leg = add(new THREE.CylinderGeometry(0.24, 0.26, 1.0, 10), grey, x, 0.5, z)
        leg.name = z > 0 ? (x < 0 ? 'legL' : 'legR') : 'leg'
      }
      return g
    }
    default:
      return null
  }
}

// Kacone by Louie: a spiky head with a big grin on striped robot legs.
export function makeKacone(toon: Toon): THREE.Group & Flashable {
  const g = new THREE.Group() as THREE.Group & Flashable
  g.mats = []
  const mat = (c: number) => {
    const m = toon(c)
    g.mats.push(m)
    return m
  }
  const legs = new THREE.Group()
  legs.name = 'legs'
  for (const side of [-1, 1]) {
    const leg = new THREE.Group()
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.32, 10), mat(i % 2 ? 0x2b2b3a : 0xd0d4dc))
      seg.position.y = 0.16 + i * 0.32
      seg.castShadow = true
      leg.add(seg)
    }
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.8), mat(0x2b2b3a))
    foot.position.set(0, 0.09, 0.12)
    leg.add(foot)
    leg.position.x = side * 0.45
    leg.name = side < 0 ? 'legL' : 'legR'
    legs.add(leg)
  }
  g.add(legs)
  const hips = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.8), mat(0x555566))
  hips.position.y = 1.45
  g.add(hips)
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 1), mat(0xfff1e0))
  head.position.y = 2.6
  head.castShadow = true
  head.name = 'head'
  g.add(head)
  const spike = mat(0xff3b3b)
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    const el = Math.sin(i * 1.7) * 0.5
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 5), spike)
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) + 0.25, Math.sin(a) * Math.cos(el)).normalize()
    sp.position.copy(dir).multiplyScalar(1.2)
    sp.position.y += 2.6
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    g.add(sp)
  }
  for (const x of [-0.35, 0.35]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }))
    eye.position.set(x, 2.85, 0.9)
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
    pupil.position.set(x, 2.85, 1.07)
    g.add(eye, pupil)
  }
  const grin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.2), mat(0x2b2b3a))
  grin.position.set(0, 2.3, 0.95)
  g.add(grin)
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.1), mat(0xffffff))
    tooth.position.set(-0.3 + i * 0.2, 2.36, 1.06)
    g.add(tooth)
  }
  return g
}

export function makeQuad(ctx: ModelCtx): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.3), ctx.toon(0xff5c5c))
  body.position.y = 0.45
  body.castShadow = true
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.6), ctx.toon(0x1b1b2f))
  seat.position.set(0, 0.68, -0.1)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.06), ctx.toon(0x333344))
  bar.position.set(0, 0.95, 0.5)
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), ctx.toon(0x333344))
  post.position.set(0, 0.75, 0.5)
  g.add(body, seat, bar, post)
  const wm = ctx.toon(0x222233)
  for (const [x, z] of [
    [-0.5, 0.45],
    [0.5, 0.45],
    [-0.5, -0.45],
    [0.5, -0.45],
  ]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.24, 10), wm)
    w.rotation.z = Math.PI / 2
    w.position.set(x, 0.26, z)
    w.castShadow = true
    g.add(w)
  }
  return g
}

export function makeHat(ctx: ModelCtx): THREE.Group {
  const g = new THREE.Group()
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), ctx.toon(0x2b2b3a))
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.3, 20), ctx.toon(0x2b2b3a))
  crown.position.y = 0.17
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 20), ctx.toon(0xff5c5c))
  band.position.y = 0.07
  g.add(brim, crown, band)
  g.position.y = 1.02
  g.rotation.z = -0.15
  return g
}

export function makeWings(ctx: ModelCtx): THREE.Group {
  const g = new THREE.Group()
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.35), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ctx.gradient, side: THREE.DoubleSide }))
    w.position.set(side * 0.32, 0.72, -0.2)
    w.rotation.y = side * 0.6
    w.rotation.z = side * 0.4
    g.add(w)
  }
  return g
}

export function makeSkateboard(ctx: ModelCtx): THREE.Group {
  const g = new THREE.Group()
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 1.1), ctx.toon(0xff8fab))
  deck.position.y = 0.12
  deck.castShadow = true
  g.add(deck)
  const wm = ctx.toon(0x333344)
  for (const [x, z] of [
    [-0.2, 0.35],
    [0.2, 0.35],
    [-0.2, -0.35],
    [0.2, -0.35],
  ]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), wm)
    w.rotation.z = Math.PI / 2
    w.position.set(x, 0.07, z)
    g.add(w)
  }
  return g
}

export function makeProp(ctx: ModelCtx, kind: PropKind, color: number): THREE.Group & Flashable {
  const g = new THREE.Group() as THREE.Group & Flashable
  g.mats = []
  const mat = (c: number) => {
    const m = ctx.toon(c)
    g.mats.push(m)
    return m
  }
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    g.add(mesh)
    return mesh
  }
  switch (kind) {
    case 'box':
      add(new THREE.BoxGeometry(0.85, 0.85, 0.85), mat(color), 0, 0.43)
      break
    case 'barrel':
      add(new THREE.CylinderGeometry(0.4, 0.4, 1, 12), mat(color), 0, 0.5)
      add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), mat(0x2b2b3a), 0, 0.3)
      add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), mat(0x2b2b3a), 0, 0.72)
      break
    case 'cone':
      add(new THREE.ConeGeometry(0.28, 0.7, 10), mat(color), 0, 0.35)
      add(new THREE.BoxGeometry(0.55, 0.06, 0.55), mat(0x333344), 0, 0.03)
      break
    case 'mailbox':
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), mat(0x5a4a3a), 0, 0.4)
      add(new THREE.BoxGeometry(0.5, 0.35, 0.3), mat(color), 0, 0.98)
      add(new THREE.BoxGeometry(0.05, 0.25, 0.05), mat(0xff3b3b), 0.27, 1.05)
      break
    case 'hydrant':
      add(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 10), mat(color), 0, 0.35)
      add(new THREE.SphereGeometry(0.22, 10, 8), mat(color), 0, 0.75)
      add(new THREE.BoxGeometry(0.62, 0.14, 0.14), mat(color), 0, 0.45)
      break
    case 'car': {
      add(new THREE.BoxGeometry(2.4, 0.6, 1.3), mat(color), 0, 0.55)
      add(new THREE.BoxGeometry(1.3, 0.5, 1.15), mat(0xbfe6ff), -0.1, 1.1)
      const wm = mat(0x222233)
      for (const [x, z] of [
        [-0.8, 0.62],
        [0.8, 0.62],
        [-0.8, -0.62],
        [0.8, -0.62],
      ]) {
        const w = add(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 10), wm, x, 0.26, z)
        w.rotation.x = Math.PI / 2
      }
      break
    }
    case 'tree':
      add(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 8), mat(0x7a4a2a), 0, 0.6)
      add(new THREE.SphereGeometry(0.9, 10, 8), mat(color), 0, 1.7)
      add(new THREE.SphereGeometry(0.6, 10, 8), mat(color), 0.4, 2.2, 0.2)
      break
    case 'bench':
      add(new THREE.BoxGeometry(1.6, 0.08, 0.5), mat(color), 0, 0.45)
      add(new THREE.BoxGeometry(1.6, 0.4, 0.08), mat(color), 0, 0.7, -0.22)
      add(new THREE.BoxGeometry(0.08, 0.45, 0.45), mat(0x444455), -0.7, 0.22)
      add(new THREE.BoxGeometry(0.08, 0.45, 0.45), mat(0x444455), 0.7, 0.22)
      break
    case 'sign':
      add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), mat(0x888899), 0, 0.8)
      add(new THREE.OctahedronGeometry(0.35, 0), mat(color), 0, 1.65)
      break
    case 'trash':
      add(new THREE.CylinderGeometry(0.32, 0.28, 0.85, 10), mat(color), 0, 0.43)
      add(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 10), mat(0x333344), 0, 0.9)
      break
    case 'glass': {
      const gm = new THREE.MeshToonMaterial({ color: 0xbfe6ff, gradientMap: ctx.gradient, transparent: true, opacity: 0.55 })
      g.mats.push(gm)
      add(new THREE.CylinderGeometry(0.45, 0.35, 0.16, 12), mat(0x556677), 0, 0.08)
      const vase = add(new THREE.SphereGeometry(0.42, 12, 10), gm, 0, 0.75)
      vase.scale.set(1, 1.5, 1)
      add(new THREE.CylinderGeometry(0.18, 0.28, 0.35, 10), gm, 0, 1.45)
      const icon = ctx.promptSprite('🔊')
      icon.position.y = 2.15
      icon.scale.setScalar(0.9)
      g.add(icon)
      break
    }
    case 'statue': {
      add(new THREE.BoxGeometry(1.1, 0.35, 1.1), mat(0x8a8a9a), 0, 0.18)
      add(new THREE.CylinderGeometry(0.3, 0.4, 1.0, 10), mat(color), 0, 0.85)
      add(new THREE.SphereGeometry(0.32, 12, 10), mat(color), 0, 1.6)
      add(new THREE.BoxGeometry(0.9, 0.12, 0.3), mat(color), 0, 1.2)
      const splat = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshToonMaterial({ color: 0x6b3e1e, gradientMap: ctx.gradient, transparent: true, opacity: 0 }))
      splat.position.y = 1.0
      splat.scale.set(1.1, 1.6, 1.1)
      splat.name = 'cover'
      g.add(splat)
      const icon = ctx.promptSprite('💩')
      icon.position.y = 2.5
      icon.scale.setScalar(0.9)
      g.add(icon)
      break
    }
    case 'evilbaby': {
      const skin = mat(color)
      add(new THREE.CylinderGeometry(1.2, 1.4, 0.5, 16), mat(0x555566), 0, 0.25)
      const head = add(new THREE.SphereGeometry(1.35, 16, 12), skin, 0, 2.0)
      head.scale.set(1, 1.1, 1)
      add(new THREE.SphereGeometry(0.22, 8, 6), mat(0xffffff), -0.5, 2.3, 1.1)
      add(new THREE.SphereGeometry(0.22, 8, 6), mat(0xffffff), 0.5, 2.3, 1.1)
      add(new THREE.SphereGeometry(0.1, 8, 6), mat(0x111111), -0.5, 2.3, 1.3)
      add(new THREE.SphereGeometry(0.1, 8, 6), mat(0x111111), 0.5, 2.3, 1.3)
      const browL = add(new THREE.BoxGeometry(0.55, 0.12, 0.12), mat(0x2b2b3a), -0.5, 2.62, 1.15)
      browL.rotation.z = -0.5
      const browR = add(new THREE.BoxGeometry(0.55, 0.12, 0.12), mat(0x2b2b3a), 0.5, 2.62, 1.15)
      browR.rotation.z = 0.5
      add(new THREE.BoxGeometry(0.7, 0.1, 0.1), mat(0x2b2b3a), 0, 1.85, 1.28)
      add(new THREE.SphereGeometry(0.16, 8, 6), mat(0xffd9b8), 0, 2.0, 1.32)
      const tuft = add(new THREE.ConeGeometry(0.12, 0.5, 6), mat(0x8b5a2b), 0, 3.5, 0)
      tuft.rotation.z = 0.3
      const splat = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), new THREE.MeshToonMaterial({ color: 0x6b3e1e, gradientMap: ctx.gradient, transparent: true, opacity: 0 }))
      splat.position.y = 2.0
      splat.scale.set(1.05, 1.15, 1.05)
      splat.name = 'cover'
      g.add(splat)
      const icon = ctx.promptSprite('🎯')
      icon.position.y = 4.4
      icon.scale.setScalar(1.3)
      g.add(icon)
      break
    }
    case 'nest': {
      const twig = mat(0x8b5a2b)
      const ring = add(new THREE.TorusGeometry(1.1, 0.32, 8, 20), twig, 0, 0.35)
      ring.rotation.x = Math.PI / 2
      ring.scale.y = 0.7
      add(new THREE.CylinderGeometry(0.9, 1.0, 0.3, 16), mat(0x6e4520), 0, 0.15)
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        const st = add(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5), mat(i % 2 ? 0xa0703a : 0x5a3a1a), Math.cos(a) * 1.1, 0.45, Math.sin(a) * 1.1)
        st.rotation.z = Math.cos(a) * 1.1
        st.rotation.x = Math.sin(a) * 1.1
      }
      for (const [x, z] of [
        [0.3, 0.1],
        [-0.35, 0.2],
        [0.05, -0.4],
      ]) {
        const egg = add(new THREE.SphereGeometry(0.28, 10, 8), mat(0xd5f5d0), x, 0.55, z)
        egg.scale.set(1, 1.25, 1)
      }
      const splat = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), new THREE.MeshToonMaterial({ color: 0x6b3e1e, gradientMap: ctx.gradient, transparent: true, opacity: 0 }))
      splat.position.y = 0.5
      splat.scale.set(1.1, 0.6, 1.1)
      splat.name = 'cover'
      g.add(splat)
      const icon = ctx.promptSprite('💩')
      icon.position.y = 2.2
      icon.scale.setScalar(0.9)
      g.add(icon)
      break
    }
    case 'snowball': {
      // unit sphere, scaled by the sim radius every frame; spots so the roll reads
      const ball = add(new THREE.SphereGeometry(1, 16, 12), mat(0xf4f8ff), 0, 1)
      ball.name = 'ball'
      const spot = mat(0x9aa4b8)
      for (const [x, y, z] of [
        [0.55, 1.6, 0.5],
        [-0.7, 0.7, 0.4],
        [0.2, 0.4, -0.85],
        [-0.3, 1.5, -0.6],
      ]) {
        const sp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), spot)
        sp.position.set(x, y, z)
        ball.add(sp)
      }
      break
    }
    case 'bigmilk': {
      const glass = new THREE.MeshToonMaterial({ color: 0xe8f4ff, gradientMap: ctx.gradient, transparent: true, opacity: 0.45 })
      g.mats.push(glass)
      add(new THREE.CylinderGeometry(0.9, 0.95, 2.0, 16), glass, 0, 1.0)
      const milk = add(new THREE.CylinderGeometry(0.8, 0.85, 1.9, 16), mat(0xffffff), 0, 0.98)
      milk.name = 'milk'
      add(new THREE.CylinderGeometry(0.55, 0.9, 0.35, 16), glass, 0, 2.15)
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 16), mat(0x3aa0e8), 0, 2.4)
      add(new THREE.SphereGeometry(0.28, 12, 10), mat(0xffb27a), 0, 2.7)
      const icon = ctx.promptSprite('🍼')
      icon.position.y = 3.6
      icon.scale.setScalar(1.3)
      g.add(icon)
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }))
      pillar.position.y = 3.5
      g.add(pillar)
      break
    }
    case 'crate':
      add(new THREE.BoxGeometry(0.95, 0.85, 0.95), mat(color), 0, 0.43)
      add(new THREE.BoxGeometry(1.0, 0.1, 1.0), mat(0xffd23f), 0, 0.85)
      add(new THREE.BoxGeometry(1.0, 0.1, 1.0), mat(0xffd23f), 0, 0.05)
      add(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 10), mat(0xff3b3b), 0, 0.98)
      break
    case 'gift':
      add(new THREE.BoxGeometry(0.9, 0.8, 0.9), mat(color), 0, 0.4)
      add(new THREE.BoxGeometry(0.95, 0.85, 0.16), mat(0xffd23f), 0, 0.4)
      add(new THREE.BoxGeometry(0.16, 0.85, 0.95), mat(0xffd23f), 0, 0.4)
      add(new THREE.SphereGeometry(0.16, 8, 6), mat(0xffd23f), 0, 0.9)
      break
  }
  return g
}

// Creatures: grown-ups, thieves, dogs, chickens, the Chicken King, minis, Louie's jellies and flies.
export function buildNpc(ctx: ModelCtx, n: Npc): NpcView {
  const g = new THREE.Group() as NpcView
  g.mats = []
  const mat = (c: number) => {
    const m = ctx.toon(c)
    g.mats.push(m)
    return m
  }
  const body = new THREE.Group()
  if (n.kind === 'adult' || n.kind === 'thief') {
    const thief = n.kind === 'thief'
    const shirt = thief ? 0x222233 : [0x4aa3ff, 0xff8fab, 0xffb020, 0x9b6bff, 0x4cd137][n.id % 5]
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 10), mat(shirt))
    torso.position.y = 0.62
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat(0xffd9b8))
    head.position.y = 1.22
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.3), mat(thief ? 0x222233 : 0x33415c))
    legs.position.y = 0.18
    torso.castShadow = head.castShadow = legs.castShadow = true
    body.add(torso, head, legs)
    if (thief) {
      for (const y of [0.45, 0.65, 0.85]) {
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.06, 10), mat(0xffffff))
        stripe.position.y = y
        body.add(stripe)
      }
      const mask = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), mat(0x111111))
      mask.position.set(0, 1.26, 0.14)
      body.add(mask)
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0xd9a066))
      sack.position.set(-0.3, 0.9, -0.2)
      body.add(sack)
    }
    const eyes = new THREE.Group()
    for (const x of [-0.09, 0.09]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }))
      e.position.set(x, 1.26, 0.2)
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
      p.position.set(x, 1.26, 0.25)
      eyes.add(e, p)
    }
    g.eyes = eyes
    body.add(eyes)
  } else if (n.kind === 'mini') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(0x2e9e3a))
    body.position.y = 0.34
    const hatb = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 10), mat(0xf2c14e))
    hatb.position.y = 0.66
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), mat(0xffb020))
    beak.rotation.x = Math.PI / 2
    beak.position.set(0, 0.34, 0.3)
    body.castShadow = true
    const wrap = new THREE.Group()
    wrap.add(body, hatb, beak)
    const eyes = new THREE.Group()
    for (const x of [-0.09, 0.09]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }))
      e.position.set(x, 0.42, 0.24)
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
      pu.position.set(x, 0.42, 0.28)
      eyes.add(e, pu)
    }
    wrap.add(eyes)
    g.eyes = eyes
    g.body = wrap
    g.add(wrap)
    addCoverBlob(ctx, g, 0.45, 0.4)
    return g
  } else if (n.kind === 'jelly') {
    // Kelly Jelly by Louie: a toothy dome with spikes and tentacles
    const jellyMat = new THREE.MeshToonMaterial({ color: 0xff7ab8, gradientMap: ctx.gradient, transparent: true, opacity: 0.8 })
    g.mats.push(jellyMat)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), jellyMat)
    dome.position.y = 0.35
    dome.castShadow = true
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.48, 0.18, 14), jellyMat)
    skirt.position.y = 0.27
    body.add(dome, skirt)
    const spike = mat(0xffd23f)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), i % 2 ? spike : mat(0xff3b3b))
      sp.position.set(Math.cos(a) * 0.4, 0.78, Math.sin(a) * 0.4)
      sp.rotation.z = -Math.cos(a) * 0.6
      sp.rotation.x = Math.sin(a) * 0.6
      body.add(sp)
    }
    const tent = mat(0xff9ccb)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 5), tent)
      t.position.set(Math.cos(a) * 0.3, 0.02, Math.sin(a) * 0.3)
      t.name = 'tentacle'
      body.add(t)
    }
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.08), mat(0xffffff))
    teeth.position.set(0, 0.42, 0.5)
    body.add(teeth)
    const eyes = new THREE.Group()
    for (const x of [-0.16, 0.16]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }))
      e.position.set(x, 0.62, 0.46)
      eyes.add(e)
    }
    g.eyes = eyes
    body.add(eyes)
    g.body = body
    g.add(body)
    addCoverBlob(ctx, g, 0.45, 0.6)
    return g
  } else if (n.kind === 'fly' || n.kind === 'bigfly') {
    const big = n.kind === 'bigfly'
    const k = big ? 1.8 : 1
    const bug = new THREE.Mesh(new THREE.SphereGeometry(0.2 * k, 8, 6), mat(0x222222))
    bug.position.y = 1.0
    bug.scale.set(1, 0.8, 1.3)
    bug.castShadow = true
    body.add(bug)
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * k, 0.16 * k), wingMat)
      w.position.set(side * 0.2 * k, 1.1, 0)
      w.rotation.x = -Math.PI / 2
      w.name = side < 0 ? 'wingL' : 'wingR'
      body.add(w)
    }
    const eyes = new THREE.Group()
    for (const x of [-0.08, 0.08]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05 * k, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }))
      e.position.set(x * k, 1.06, 0.22 * k)
      eyes.add(e)
    }
    g.eyes = eyes
    body.add(eyes)
    g.body = body
    g.add(body)
    addCoverBlob(ctx, g, 1.0, 0.3 * k)
    return g
  } else if (n.kind === 'chicken' || n.kind === 'king') {
    const king = n.kind === 'king'
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(king ? 0xfff2c4 : 0xffffff))
    body.position.y = 0.34
    body.scale.set(1, 0.9, 1.15)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(0xffffff))
    head.position.set(0, 0.62, 0.22)
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.16), mat(0xff3b3b))
    comb.position.set(0, 0.76, 0.2)
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), mat(0xffb020))
    beak.rotation.x = Math.PI / 2
    beak.position.set(0, 0.6, 0.4)
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 6), mat(0xffffff))
    tail.rotation.x = -Math.PI / 2.5
    tail.position.set(0, 0.45, -0.3)
    body.castShadow = head.castShadow = true
    body.add(tail)
    body.add(head, comb, beak)
    const eyes = new THREE.Group()
    for (const x of [-0.07, 0.07]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
      e.position.set(x, 0.66, 0.34)
      eyes.add(e)
    }
    g.eyes = eyes
    body.add(eyes)
    body.position.y = 0.34
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), mat(0xffb020))
    legs.position.y = 0.1
    body.add(legs)
    body.name = 'chickenBody'
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 8), ctx.toon(0xff8fab))
    hat.position.set(0, 0.9, 0.2)
    hat.name = 'partyhat'
    hat.visible = false
    body.add(hat)
    if (king) {
      const gold = mat(0xffd23f)
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.12, 8), gold)
      crown.position.set(0, 0.8, 0.2)
      body.add(crown)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const pt = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), gold)
        pt.position.set(Math.cos(a) * 0.12, 0.9, 0.2 + Math.sin(a) * 0.12)
        body.add(pt)
      }
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.05), mat(0xd93a3a))
      cape.position.set(0, 0.3, -0.3)
      cape.rotation.x = 0.3
      body.add(cape)
      // a floating crown tag so the king reads from across the continent
      const tag = ctx.promptSprite('👑')
      tag.position.y = 1.5
      tag.scale.setScalar(1.1)
      g.add(tag)
    }
    const wrap = new THREE.Group()
    wrap.add(body)
    body.position.y = 0
    wrap.position.y = 0.05
    // reuse the group as body so bob/tilt apply
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    g.add(wrap)
    g.body = wrap
    addCoverBlob(ctx, g, 0.4, 0.38)
    return g
  } else {
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10), mat(0xc49a6c))
    torso.rotation.x = Math.PI / 2
    torso.position.y = 0.35
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0xc49a6c))
    head.position.set(0, 0.55, 0.42)
    const ear1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.05), mat(0x8b5a2b))
    ear1.position.set(-0.15, 0.72, 0.4)
    const ear2 = ear1.clone()
    ear2.position.x = 0.15
    torso.castShadow = head.castShadow = true
    body.add(torso, head, ear1, ear2)
    const eyes = new THREE.Group()
    for (const x of [-0.08, 0.08]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
      e.position.set(x, 0.6, 0.6)
      eyes.add(e)
    }
    g.eyes = eyes
    body.add(eyes)
  }
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), ctx.toon(0xff8fab))
  hat.position.y = n.kind === 'adult' ? 1.55 : 0.85
  hat.name = 'partyhat'
  hat.visible = false
  body.add(hat)
  g.body = body
  g.add(body)
  addCoverBlob(ctx, g, n.kind === 'adult' ? 0.75 : 0.4, n.kind === 'adult' ? 0.55 : 0.35)
  return g
}

function addCoverBlob(ctx: ModelCtx, g: THREE.Group, y: number, r: number) {
  const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshToonMaterial({ color: 0x6b3e1e, gradientMap: ctx.gradient, transparent: true, opacity: 0 }))
  blob.position.y = y
  blob.scale.set(1.15, 1.35, 1.15)
  blob.name = 'cover'
  g.add(blob)
}
