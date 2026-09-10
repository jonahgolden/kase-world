// Pure data. No DOM, no three.js. Everything here is JSON-serializable.
import type { Rng } from './rng.ts'

export interface Input {
  mx: number // -1..1, +x right
  mz: number // -1..1, +z toward camera (down on screen)
  scream: boolean // hold to charge, release to fire
  poop: boolean // tap
  jump: boolean // tap
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
}

export type NpcKind = 'adult' | 'dog'
export type NpcState = 'wander' | 'chase' | 'flee' | 'stunned' | 'recoil' | 'cower'

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

export interface Player {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  facing: number // radians; direction vector = (sin, cos)
  r: number
  hp: number
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
  poopMeter: number
  poopCd: number
  poopHeld: boolean
  jumpHeld: boolean
}

export type DuoState = 'chase' | 'peck' | 'hurt'

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
}

export type BossAttack = 'charge' | 'stomp'
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
}

export type EventType =
  | 'smash'
  | 'propHit'
  | 'scream'
  | 'poopThrow'
  | 'splat'
  | 'score'
  | 'npcScared'
  | 'npcHit'
  | 'playerHurt'
  | 'bossEnter'
  | 'bossTelegraph'
  | 'bossAttack'
  | 'bossStomp'
  | 'bossBlocked'
  | 'bossHurt'
  | 'bossPhase'
  | 'bossDead'
  | 'duoGrow'
  | 'duoShrink'
  | 'duoPeck'
  | 'levelPhase'
  | 'gameOver'
  | 'win'
  | 'multUp'
  | 'multLost'
  | 'jump'
  | 'land'

export interface GameEvent {
  t: EventType
  x?: number
  y?: number
  z?: number
  points?: number
  mult?: number
  big?: number // 0..1 intensity for shake / hitstop
  label?: string
  color?: number
  facing?: number
  range?: number
  id?: number
}

export type Phase = 'wreck' | 'boss' | 'won' | 'over'

export interface Stats {
  smashed: number
  scared: number
  screams: number
  poops: number
  directHits: number
  bossHits: number
  bossesBeaten: number
  damageTaken: number
  bestMult: number
}

export interface State {
  version: string
  runId: string
  seed: number
  rng: Rng
  tick: number
  time: number
  runTime: number
  levelId: string
  levelIndex: number
  levelsCleared: number
  phase: Phase
  phaseT: number
  timer: number
  arena: { w: number; d: number }
  player: Player
  props: Prop[]
  npcs: Npc[]
  poops: Poop[]
  splats: Splat[]
  debris: Debris[]
  duo: Duogringo
  boss: Boss | null
  score: number
  mult: number
  chainT: number
  stats: Stats
  events: GameEvent[]
  nextId: number
}
