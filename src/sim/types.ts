// Pure data. No DOM, no three.js. Everything here is JSON-serializable.
import type { Rng } from './rng.ts'

export interface Input {
  mx: number // -1..1, +x right
  mz: number // -1..1, +z toward camera (down on screen)
  scream: boolean // hold to charge, release to fire
  poop: boolean // tap to throw, hold to lob further
  jump: boolean // tap; hold with wings to fly
  aimX?: number // optional world-space aim direction (mouse). Without it the sim aim-assists.
  aimZ?: number
}

export const EMPTY_INPUT: Input = { mx: 0, mz: 0, scream: false, poop: false, jump: false }

export type PropKind =
  | 'box'
  | 'barrel'
  | 'cone'
  | 'mailbox'
  | 'hydrant'
  | 'car'
  | 'tree'
  | 'bench'
  | 'sign'
  | 'trash'
  | 'gift'
  | 'crate'
  | 'glass' // scream only
  | 'statue' // poop only: cover it

export interface Prop {
  id: number
  kind: PropKind
  x: number
  z: number
  y: number
  vx: number
  vz: number
  vy: number
  rot: number
  angVel: number
  r: number
  h: number
  hp: number
  maxHp: number
  mass: number
  points: number
  color: number
  broken: boolean
  hitFlash: number
  drop: PickupKind | null
  cover: number // 0..1 poop coverage (statues)
  promptCd: number
}

export type NpcKind = 'adult' | 'dog' | 'chicken' | 'mini'
export type NpcState = 'wander' | 'chase' | 'flee' | 'stunned' | 'recoil' | 'cower' | 'follow'

export interface Npc {
  id: number
  kind: NpcKind
  x: number
  z: number
  vx: number
  vz: number
  facing: number
  r: number
  hp: number
  state: NpcState
  stateT: number
  targetX: number
  targetZ: number
  scaredCd: number
  color: number
  hitFlash: number
  scale: number
}

export interface Poop {
  id: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  r: number
}

export interface Splat {
  id: number
  x: number
  z: number
  r: number
}

export interface Debris {
  id: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  rot: number
  angVel: number
  size: number
  color: number
  settled: boolean
}

export type PickupKind = 'milk' | 'pacifier' | 'rattle' | 'clock' | 'skateboard' | 'megaphone' | 'fedora' | 'quad' | 'wings' | 'goggles' | 'potato' | 'conga' | 'giant' | 'egg'

export type GoalItem = 'fedora' | 'egg'
export type Goal = { kind: 'wreck'; pct: number } | { kind: 'find'; count: number; item: GoalItem }

export type FeatureKind = 'platform' | 'fan' | 'portal' | 'lake'

export interface Feature {
  id: number
  kind: FeatureKind
  x: number
  z: number
  r: number
  h: number // platform top height
  pair: number // portal partner id
  dirX: number // fan push direction
  dirZ: number
  cd: number
  island: boolean // platform inside a lake
}

export interface Bomb {
  id: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  fuse: number
}

export interface Pickup {
  id: number
  kind: PickupKind
  x: number
  y: number
  z: number
  vy: number
  age: number
  float: boolean // stays in the air (sky wings, eggs)
}

export interface Player {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  facing: number // radians; direction vector = (sin, cos)
  r: number
  hp: number // hearts = hp / 20
  maxHp: number
  grounded: boolean
  jumpCd: number
  invuln: number
  hitstun: number
  screamCharging: boolean
  screamCharge: number
  screamHoldFull: number
  screamCd: number
  screamFlash: number
  poopHeld: boolean
  poopHoldT: number
  poopCd: number
  jumpHeld: boolean
  pacifierT: number // seconds of mega scream left
  rattleT: number // seconds of poop storm left
  ride: 'skateboard' | 'quad' | null // lost when hurt (quad takes two hits), can be picked back up
  rideHp: number
  megaphone: boolean // level-long scream upgrade
  fedora: boolean // epic mode for the level
  wings: boolean // hold jump to glide
  goggles: boolean // minimap shows every find
  potatoes: number // hot potatoes left to throw
  portalCd: number
  inLake: boolean
  gy: number // ground height under the player
  baseR: number
  congaT: number // seconds of conga line left
  giantT: number // seconds of giant mode left
  wingFuel: number // seconds of powered flight left
  hasAim: boolean // true when the input supplied an aim direction this tick
  hats: number // goal fedoras stacked on the head
  launchT: number // seconds since a fan launch during which steering is weak
}

export type DuoState = 'chase' | 'peck' | 'hurt' | 'stun' | 'lay'

export interface Duogringo {
  x: number
  y: number
  z: number
  vx: number
  vz: number
  facing: number
  power: number // 0..1, grows when Kase screams, shrinks when hit directly
  state: DuoState
  stateT: number
  peckCd: number
  hitFlash: number
  active: boolean // only present in his own fight
  layCd: number
}

export type BossAttack = 'charge' | 'stomp'
export type BossFight = 'charge' | 'poopcover' | 'runner' | 'nest'
export type BossState =
  | 'enter'
  | 'idle'
  | 'telegraph'
  | 'attack'
  | 'exposed'
  | 'hurt'
  | 'phaseChange'
  | 'dead'

export interface BossDef {
  id: string
  name: string
  drawnBy: string
  drawing: string // file under /assets/drawings
  hitsPerPhase: number
  phases: number
  speed: number
  chargeSpeed: number
  damage: number
  scale: number // card height in world units
  taunt: string
  fight: BossFight
  hint: string // one line shown when the fight starts
}

export interface Boss {
  def: BossDef
  x: number
  y: number
  z: number
  vx: number
  vz: number
  facing: number
  r: number
  hits: number
  totalHits: number
  state: BossState
  stateT: number
  attack: BossAttack
  dirX: number
  dirZ: number
  invuln: number
  exposedLeft: number
  hitFlash: number
  everExposed: boolean
  cover: number // poopcover fights: 0..1
  lap: number // runner fights: angle along the track
}

export type EventType =
  | 'smash'
  | 'propHit'
  | 'scream'
  | 'poopThrow'
  | 'splat'
  | 'wreck'
  | 'combo'
  | 'comboLost'
  | 'npcScared'
  | 'npcHit'
  | 'playerHurt'
  | 'pickup'
  | 'powerEnd'
  | 'timeBonus'
  | 'rideOn'
  | 'rideOff'
  | 'bossLand'
  | 'portal'
  | 'fan'
  | 'explode'
  | 'splash'
  | 'congaSmash'
  | 'found'
  | 'needScream'
  | 'needPoop'
  | 'covered'
  | 'bossSlip'
  | 'flap'
  | 'miniHatch'
  | 'goalReached'
  | 'bossEnter'
  | 'bossTelegraph'
  | 'bossAttack'
  | 'bossStomp'
  | 'bossBlocked'
  | 'bossExposed'
  | 'bossHurt'
  | 'bossPhase'
  | 'bossDead'
  | 'duoGrow'
  | 'duoShrink'
  | 'duoPeck'
  | 'levelPhase'
  | 'gameOver'
  | 'win'
  | 'jump'
  | 'land'

export interface GameEvent {
  t: EventType
  x?: number
  y?: number
  z?: number
  points?: number // wreck points gained
  pct?: number // wreck fraction gained (0..1)
  combo?: number
  big?: number // 0..1 intensity for shake / hitstop
  label?: string
  color?: number
  facing?: number
  range?: number
  id?: number
  kind?: string
}

export type Phase = 'wreck' | 'boss' | 'won' | 'over'

export interface Arena {
  ring: [number, number][] // counter-clockwise in (x, z)
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  w: number
  d: number
}

export interface Stats {
  smashed: number
  scared: number
  screams: number
  poops: number
  directHits: number
  bossHits: number
  bossesBeaten: number
  damageTaken: number
  bestCombo: number
  pickups: number
  timeBonus: number
}

export interface State {
  version: string
  runId: string
  seed: number
  rng: Rng
  tick: number
  time: number // seconds in this level
  runTime: number // seconds in the whole run (levels only, not end screens)
  levelId: string
  levelIndex: number
  levelsCleared: number
  phase: Phase
  phaseT: number
  clearTime: number // level time when the boss fell, 0 until then
  bossDamage: number // damage taken during the boss phase (0 = perfect)
  arena: Arena
  player: Player
  props: Prop[]
  npcs: Npc[]
  poops: Poop[]
  splats: Splat[]
  debris: Debris[]
  pickups: Pickup[]
  features: Feature[]
  bombs: Bomb[]
  seen: number[] // pickup ids the player has been near (minimap memory)
  duo: Duogringo
  boss: Boss | null
  bossRing: { x: number; z: number; r: number } | null
  conga: number[] // npc ids in the conga line, in order
  goal: Goal
  found: number // lanterns collected on find levels
  wreck: number // 0..1 progress toward the boss
  wreckPoints: number
  wreckGoalPoints: number
  combo: number
  comboT: number
  stats: Stats
  events: GameEvent[]
  nextId: number
}
