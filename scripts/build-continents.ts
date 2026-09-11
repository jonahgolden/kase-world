// data/continents.geojson -> src/sim/continents.ts (flat arena rings in game units) + public/continents.geojson (globe).
// Run: node scripts/build-continents.ts
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { geoArea, geoAzimuthalEqualArea, geoCentroid } from 'd3-geo'
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson'

const NAME_TO_ID: Record<string, string> = {
  'North America': 'north-america',
  'South America': 'south-america',
  Antarctica: 'antarctica',
  Asia: 'asia',
  Africa: 'africa',
  Oceania: 'australia',
  Europe: 'europe',
}
const TARGET_AREA = 2400 // square game units, about a 49 x 49 arena

type Pt = [number, number]

function shoelace(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i]
    const [x2, z2] = pts[(i + 1) % pts.length]
    a += x1 * z2 - x2 * z1
  }
  return a / 2
}

function pointInRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

function distToRing(x: number, z: number, ring: Pt[]): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]
    const [bx, bz] = ring[(i + 1) % ring.length]
    const dx = bx - ax
    const dz = bz - az
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
    const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz))
    if (d < best) best = d
  }
  return best
}

function poleOfInaccessibility(ring: Pt[]): Pt {
  const xs = ring.map((p) => p[0])
  const zs = ring.map((p) => p[1])
  let minX = Math.min(...xs)
  let maxX = Math.max(...xs)
  let minZ = Math.min(...zs)
  let maxZ = Math.max(...zs)
  let best: Pt = [(minX + maxX) / 2, (minZ + maxZ) / 2]
  let bestD = -1
  for (let pass = 0; pass < 3; pass++) {
    const n = 48
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const x = minX + ((maxX - minX) * i) / n
        const z = minZ + ((maxZ - minZ) * j) / n
        if (!pointInRing(x, z, ring)) continue
        const d = distToRing(x, z, ring)
        if (d > bestD) {
          bestD = d
          best = [x, z]
        }
      }
    }
    const span = Math.max(maxX - minX, maxZ - minZ) / n
    minX = best[0] - span * 2
    maxX = best[0] + span * 2
    minZ = best[1] - span * 2
    maxZ = best[1] + span * 2
  }
  return best
}

const fc = JSON.parse(readFileSync('data/continents.geojson', 'utf8')) as { features: Feature<Polygon | MultiPolygon, { CONTINENT: string }>[] }
const out: Record<string, unknown> = {}
const order: string[] = []

for (const f of fc.features) {
  const id = NAME_TO_ID[f.properties.CONTINENT]
  if (!id) continue
  const polys: Position[][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  let main = polys[0]
  let mainArea = -1
  for (const p of polys) {
    const a = geoArea({ type: 'Polygon', coordinates: [p[0]] })
    if (a > mainArea) {
      mainArea = a
      main = p
    }
  }
  let ring = main[0].slice() as Pt[]
  if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop()
  let proj
  if (id === 'antarctica') {
    ring = ring.filter(([lon, lat]) => lat > -89.9 && Math.abs(lon) < 179.99)
    proj = geoAzimuthalEqualArea().rotate([0, 90]).scale(1).translate([0, 0])
  } else {
    const [lon, lat] = geoCentroid({ type: 'Polygon', coordinates: [main[0]] })
    proj = geoAzimuthalEqualArea().rotate([-lon, -lat]).scale(1).translate([0, 0])
  }
  let pts = ring.map((ll) => proj(ll)!) as Pt[]
  const area = Math.abs(shoelace(pts))
  const s = Math.sqrt(TARGET_AREA / area)
  pts = pts.map(([x, y]) => [x * s, y * s])
  const spawn = poleOfInaccessibility(pts)
  pts = pts.map(([x, y]) => [Math.round((x - spawn[0]) * 100) / 100, Math.round((y - spawn[1]) * 100) / 100])
  if (shoelace(pts) < 0) pts.reverse()
  // sanity: inward normal convention (left of edge direction for CCW ring in x,z)
  const [ax, az] = pts[0]
  const [bx, bz] = pts[1]
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  const mx = (ax + bx) / 2 + (-dz / len) * 0.05
  const mz = (az + bz) / 2 + (dx / len) * 0.05
  if (!pointInRing(mx, mz, pts)) throw new Error(`inward normal check failed for ${id}`)
  if (!pointInRing(0, 0, pts)) throw new Error(`spawn not inside ${id}`)
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  const lonLat = geoCentroid(f)
  out[id] = {
    ring: pts,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    spawnClearance: Math.round(distToRing(0, 0, pts) * 100) / 100,
    lonLat: [Math.round(lonLat[0] * 100) / 100, Math.round(lonLat[1] * 100) / 100],
  }
  order.push(id)
  console.log(id, 'verts', pts.length, 'bbox', Math.round(Math.max(...xs) - Math.min(...xs)), 'x', Math.round(Math.max(...zs) - Math.min(...zs)), 'spawn clearance', (out[id] as { spawnClearance: number }).spawnClearance)
}

const ts = `// Generated by scripts/build-continents.ts from data/continents.geojson (Natural Earth, public domain). Do not edit.
export interface ContinentShape {
  ring: [number, number][] // counter-clockwise in (x, z); interior is left of each edge
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  spawnClearance: number // distance from (0,0) to the nearest coast
  lonLat: [number, number] // centroid for the globe marker
}

export const CONTINENTS: Record<string, ContinentShape> = ${JSON.stringify(out)}
`
writeFileSync('src/sim/continents.ts', ts)
copyFileSync('data/continents.geojson', 'public/continents.geojson')
console.log('wrote src/sim/continents.ts and public/continents.geojson')
