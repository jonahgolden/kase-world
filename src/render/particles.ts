import * as THREE from 'three'

const MAX = 500

export class Particles {
  private mesh: THREE.InstancedMesh
  private px = new Float32Array(MAX)
  private py = new Float32Array(MAX)
  private pz = new Float32Array(MAX)
  private vx = new Float32Array(MAX)
  private vy = new Float32Array(MAX)
  private vz = new Float32Array(MAX)
  private life = new Float32Array(MAX)
  private max = new Float32Array(MAX)
  private size = new Float32Array(MAX)
  private color: THREE.Color[] = []
  private next = 0
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private v = new THREE.Vector3()
  private s = new THREE.Vector3()
  private e = new THREE.Euler()

  constructor(scene: THREE.Scene, gradient: THREE.Texture) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient }), MAX)
    this.mesh.count = 0
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    for (let i = 0; i < MAX; i++) this.color.push(new THREE.Color(0xffffff))
    scene.add(this.mesh)
  }

  clear() {
    this.life.fill(0)
    this.mesh.count = 0
  }

  burst(x: number, y: number, z: number, n: number, color: number, speed: number, size: number) {
    for (let k = 0; k < n; k++) {
      const i = this.next
      this.next = (this.next + 1) % MAX
      const a = Math.random() * Math.PI * 2
      const up = Math.random()
      const sp = speed * (0.4 + Math.random() * 0.8)
      this.px[i] = x
      this.py[i] = y
      this.pz[i] = z
      this.vx[i] = Math.cos(a) * sp * (1 - up * 0.5)
      this.vz[i] = Math.sin(a) * sp * (1 - up * 0.5)
      this.vy[i] = sp * (0.4 + up)
      this.max[i] = this.life[i] = 0.4 + Math.random() * 0.5
      this.size[i] = size * (0.6 + Math.random() * 0.8)
      this.color[i].set(color)
      if (Math.random() < 0.25) this.color[i].offsetHSL(0, 0, 0.2)
    }
  }

  update(dt: number) {
    let count = 0
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      this.vy[i] -= 18 * dt
      this.px[i] += this.vx[i] * dt
      this.py[i] += this.vy[i] * dt
      this.pz[i] += this.vz[i] * dt
      if (this.py[i] < 0.02) {
        this.py[i] = 0.02
        this.vy[i] = -this.vy[i] * 0.3
        this.vx[i] *= 0.7
        this.vz[i] *= 0.7
      }
      const k = Math.max(0, this.life[i] / this.max[i])
      const sz = this.size[i] * (0.3 + k * 0.7)
      this.q.setFromEuler(this.e.set(this.life[i] * 6, this.life[i] * 9, 0))
      this.m.compose(this.v.set(this.px[i], this.py[i], this.pz[i]), this.q, this.s.set(sz, sz, sz))
      this.mesh.setMatrixAt(count, this.m)
      this.mesh.setColorAt(count, this.color[i])
      count++
    }
    this.mesh.count = count
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}
