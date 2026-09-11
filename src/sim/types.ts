// Pure data. No DOM, no three.js. Everything here is JSON-serializable.
import type { Rng } from './rng.ts'

export interface Input {
  mx: number // -1..1, +x right
  mz: number // -1..1, +z toward camera (down on screen)
  scream: boolean // hold to charge, release to fire
  poop: boolean // tap to throw, hold to lob further
  jump: boolean // tap; hold with wings to fly
  aimX?: number // optional world-space aim direction (mouse or drag). Without it the sim aim-assists.
  aimZ?: number
  aimPower?: number // optional 0..1 throw range from drag distance
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
  | 'evilbaby' // poop only, from a distance
  | 'snowball' // grow levels: push it and it grows
  | 'bigmilk' // protect levels: the bottle the thieves want
  | 'nest' // Duogringo's nest: poop-cover it and he cannot lay minis

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

export type NpcKind = 'adult' | 'dog' | 'chicken' | 'mini' | 'king' | 'thief' | 'jelly' | 'fly' | 'bigfly'
export type NpcState = 'wander' | 'chase' | 'flee' | 'stunned' | 'recoil' | 'cower' | 'follow' | 'raid' | 'drink' | 'sleep'

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
  cover: number // poop coverage; slows, then freezes; decays slowly
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
  ox: number // where it was thrown from
  oz: number
  hot?: boolean // volcano poop: lands on Kase too
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

export type PickupKind = 'milk' | 'pacifier' | 'rattle' | 'clock' | 'skateboard' | 'megaphone' | 'fedora' | 'quad' | 'wings' | 'goggles' | 'potato' | 'conga' | 'giant' | 'egg' | 'nap' | 'boomerang' | 'giraffe' | 'decoy' | 'finger'
export type RideKind = 'skateboard' | 'quad' | 'giraffe'

export type GoalItem = 'fedora' | 'egg'
export type Goal =
  | { kind: 'wreck'; pct: number }
  | { kind: 'find'; count: number; item: GoalItem }
  | { kind: 'chase'; count: number } // catch the Chicken King this many times; he has the pacifier
  | { kind: 'grow'; size: number } // roll the snowball until its radius reaches size
  | { kind: 'escape' } // reach the flag with the stampede on your heels
  | { kind: 'protect'; count: number } // chase off this many milk thieves
  | { kind: 'race'; checkpoints: number } // through the gates before the pigeon finishes its lap
  | { kind: 'hunt'; count: number; npc: NpcKind } // pop this many of a creature (Kacone's guardians)

export interface Stampede {
  dirX: number // the herd runs this way
  dirZ: number
  front: number // herd front, as a projection onto dir
  start: number // where the front began (meter 0)
  end: number // the flag's projection (meter 100)
  speed: number
  surgeT: number // seconds of surge left (<0 while resting)
  warnT: number // seconds until the next surge; a rumble warns first
  hitCd: number
}

export interface Rival {
  x: number
  y: number
  z: number
  vx: number
  vz: number
  facing: number
  cp: number // next checkpoint index
  stallT: number // seconds of stall left after a scream
  hitFlash: number
  laps: number // laps the pigeon has finished (each one costs Kase a heart)
  peckT: number // seconds until the next distraction while far ahead
}

export type FeatureKind = 'platform' | 'fan' | 'portal' | 'lake' | 'volcano'

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
  kind?: 'potato' | 'nap'
}

export interface Boomerang {
  x: number
  y: number
  z: number
  vx: number
  vz: number
  t: number // seconds left flying out
  out: boolean
  hits: number[] // npc ids already hit this flight
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
  ride: RideKind | null // lost when hurt (quad and giraffe take two hits), can be picked back up
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
  flying: boolean // sky level: always airborne
  pitch: number // flight pitch, radians (+ up)
  turnV: number // smoothed turn input -1..1
  boostFuel: number // seconds of boost left (sky wings)
  boosting: boolean
  aimPower: number // -1 when the hold time decides the throw range
  aiming: boolean // holding an attack: arrows turn in place instead of moving
  naps: number // Zzz nap bombs left to throw
  boomerang: boolean // the binky comes back: throws launch it instead of poop
  crispyT: number // seconds of chicken-finger speed left
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
  nestWrecked: boolean // the nest is covered in poop: no more minis
}

export type BossAttack = 'charge' | 'stomp'
export type BossFight = 'charge' | 'poopcover' | 'runner' | 'nest' | 'horse' | 'group' | 'games' | 'remix' | 'stomper'
// what a boss part answers to: any hit while exposed, screams (charged), poop, bombs, a wall slam first,
// sumo shoves out of the ring, a race you must win, or a hidden thing you must find and poop
export type Weakness = 'any' | 'scream' | 'poop' | 'bomb' | 'wall' | 'sumo' | 'race' | 'hidden'

export interface BossPartDef {
  kind: string // lion, giraffe, rhino, elephant, kangaroo, emu, rockfish, devil
  name: string
  uv: [number, number, number, number] // crop of the group drawing, fractions, top-left origin: x0 y0 x1 y1
  scale: number // card height in world units
  weakness: Weakness
  hint: string // toast when this part steps up
  blocked: string // popup for the wrong verb
  decor?: boolean // stands at the edge and heckles, never fought
}

export interface BossPart {
  def: BossPartDef
  x: number // idle spot at the ring edge, or where it fell
  z: number
  facing: number
  done: boolean
}
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
  beaten: string // what the boss says when he goes down: the kill-sequence payoff
  parts?: BossPartDef[] // group fights: one card per animal, fought in order
  coverPoops?: number // poopcover phases: poops for full cover (default CFG.boss.coverPoops)
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
  parts: BossPart[]
  plap: number // race: player's accumulated lap angle
  pang: number // race: player's last angle around the ring
  roundT: number // race: boss lap progress this round; elephant: potato respawn timer
  hideT: number // rockfish: seconds until it burrows again; emu: seconds left tripped
  charges: number // horse: charges left in this pass
  status: string // one line for the HUD under the boss name (round, lap, event)
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
  | 'tooClose'
  | 'frozen'
  | 'screamReady'
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
  | 'trampled'
  | 'kingPoof'
  | 'rockHint'
  | 'snowMilestone'
  | 'nap'
  | 'boomerang'
  | 'decoy'
  | 'erupt'
  | 'npcPop'
  | 'poopedOn'
  | 'surge'
  | 'melting'
  | 'milkGone'
  | 'rivalWin'
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
  goalDone: boolean // dev skip: pretend the goal is met
  goalPos: { x: number; z: number } | null // flag, milk bottle, or the current checkpoint
  stampede: Stampede | null
  checkpoints: { x: number; z: number }[]
  rival: Rival | null
  milk: number // protect: 0..1 left in the bottle
  waveT: number // protect: seconds until the next thief
  boomerang: Boomerang | null
  decoy: { x: number; z: number; t: number } | null // grown-ups chase this instead of Kase
  found: number // goal count: items found, king catches, thieves repelled, checkpoints passed
  wreck: number // 0..1 progress toward the boss
  wreckPoints: number
  wreckGoalPoints: number
  combo: number
  comboT: number
  stats: Stats
  events: GameEvent[]
  nextId: number
}
