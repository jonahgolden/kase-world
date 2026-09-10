import type { BossDef, FeatureKind, NpcKind, PickupKind, PropKind } from './types.ts'

export interface PropStat {
  r: number
  h: number
  hp: number
  mass: number
  points: number
  color: number
}

export const PROP_STATS: Record<PropKind, PropStat> = {
  box: { r: 0.45, h: 0.9, hp: 20, mass: 1, points: 50, color: 0xd9a066 },
  barrel: { r: 0.4, h: 1.0, hp: 30, mass: 1.5, points: 75, color: 0x5b7fbf },
  cone: { r: 0.3, h: 0.7, hp: 10, mass: 0.5, points: 25, color: 0xff7f27 },
  mailbox: { r: 0.3, h: 1.2, hp: 35, mass: 2, points: 100, color: 0x3b5ba5 },
  hydrant: { r: 0.3, h: 0.9, hp: 60, mass: 4, points: 150, color: 0xe03a3a },
  car: { r: 1.3, h: 1.2, hp: 160, mass: 8, points: 300, color: 0xf2c14e },
  tree: { r: 0.5, h: 3.0, hp: 120, mass: 6, points: 200, color: 0x3f8f3f },
  bench: { r: 0.8, h: 0.6, hp: 45, mass: 2.5, points: 80, color: 0x8b5a2b },
  sign: { r: 0.25, h: 1.8, hp: 25, mass: 1, points: 60, color: 0xffd23f },
  trash: { r: 0.35, h: 0.9, hp: 15, mass: 0.8, points: 40, color: 0x556b2f },
  gift: { r: 0.5, h: 1.0, hp: 30, mass: 1.5, points: 60, color: 0xff5cad },
}

export interface NpcStat {
  r: number
  hp: number
  wanderSpeed: number
  chaseSpeed: number
  fleeSpeed: number
  detect: number
  damage: number
  color: number
  scare: number // wreck points for scaring it
  bonk: number // wreck points for a poop hit or a prop hit
}

export const NPC_STATS: Record<NpcKind, NpcStat> = {
  adult: { r: 0.4, hp: 60, wanderSpeed: 1.4, chaseSpeed: 2.7, fleeSpeed: 4.2, detect: 6, damage: 10, color: 0x8ab4f8, scare: 100, bonk: 150 },
  dog: { r: 0.3, hp: 30, wanderSpeed: 2.2, chaseSpeed: 3.8, fleeSpeed: 5.5, detect: 7, damage: 10, color: 0xc49a6c, scare: 100, bonk: 150 },
  chicken: { r: 0.28, hp: 20, wanderSpeed: 2.4, chaseSpeed: 0, fleeSpeed: 5.8, detect: 4, damage: 0, color: 0xffffff, scare: 80, bonk: 150 },
}

export interface Theme {
  ground: number
  ground2: number
  sky: number
  fog: number
  accent: number
}

export interface LevelDef {
  id: string
  name: string
  continent: string
  goalPct: number // fraction of prop points to wreck before the boss shows up
  spots: number // clusters of wreckable stuff
  propsPerSpot: number
  singles: number // loose props between spots
  props: Partial<Record<PropKind, number>> // palette weights
  npcs: Partial<Record<NpcKind, number>>
  finds: Partial<Record<PickupKind, number>>
  features: Partial<Record<FeatureKind | 'tall', number>>
  boss: BossDef
  theme: Theme
}

const boss = (b: Omit<BossDef, 'hitsPerPhase' | 'phases'> & Partial<Pick<BossDef, 'hitsPerPhase' | 'phases'>>): BossDef => ({
  hitsPerPhase: 3,
  phases: 3,
  ...b,
})

const SUBURB: Partial<Record<PropKind, number>> = {
  car: 2,
  mailbox: 3,
  hydrant: 2,
  cone: 4,
  box: 5,
  tree: 3,
  bench: 2,
  sign: 2,
  trash: 3,
  barrel: 2,
}

const FEATURES_BASIC: Partial<Record<FeatureKind | 'tall', number>> = { platform: 2, tall: 1, fan: 1, portal: 1, lake: 1 }
const FINDS_BASIC: Partial<Record<PickupKind, number>> = {
  milk: 2,
  pacifier: 1,
  rattle: 1,
  clock: 2,
  skateboard: 1,
  quad: 1,
  fedora: 1,
  wings: 1,
  goggles: 1,
  potato: 1,
}
const BROS = 'the Erbalaban Bros'

export const LEVELS: LevelDef[] = [
  {
    id: 'north-america',
    name: 'North America',
    continent: 'North America',
    goalPct: 0.5,
    spots: 4,
    propsPerSpot: 6,
    singles: 4,
    props: SUBURB,
    npcs: { adult: 5, dog: 2, chicken: 4 },
    finds: FINDS_BASIC,
    features: FEATURES_BASIC,
    boss: boss({ id: 'donald-rump', name: 'Donald Rump', drawnBy: BROS, drawing: 'donald-rump.jpg', speed: 2.2, chargeSpeed: 9, damage: 15, scale: 2.6, taunt: 'Tremendous baby. The best baby. Sad!' }),
    theme: { ground: 0x7ec850, ground2: 0x6db544, sky: 0x9fd8ff, fog: 0xbfe6ff, accent: 0xff5c5c },
  },
  {
    id: 'south-america',
    name: 'South America',
    continent: 'South America',
    goalPct: 0.55,
    spots: 5,
    propsPerSpot: 6,
    singles: 4,
    props: { ...SUBURB, tree: 6, cone: 5 },
    npcs: { adult: 5, dog: 2, chicken: 5 },
    finds: { ...FINDS_BASIC, megaphone: 1 },
    features: { platform: 2, tall: 2, fan: 2, portal: 1, lake: 1 },
    boss: boss({ id: 'insane-bolt', name: 'Insane Bolt', drawnBy: BROS, drawing: 'insane-bolt.jpg', speed: 3.4, chargeSpeed: 13, damage: 10, scale: 2.4, taunt: 'Catch me if you can, baby!' }),
    theme: { ground: 0x5fbf5a, ground2: 0x4fa84a, sky: 0xa8e0ff, fog: 0xcdeeff, accent: 0xffd23f },
  },
  {
    id: 'antarctica',
    name: 'Antarctica',
    continent: 'Antarctica',
    goalPct: 0.55,
    spots: 5,
    propsPerSpot: 6,
    singles: 4,
    props: { box: 5, barrel: 4, cone: 4, sign: 3, bench: 2, trash: 2, car: 1 },
    npcs: { adult: 5, dog: 3, chicken: 5 },
    finds: { ...FINDS_BASIC, clock: 3 },
    features: { platform: 3, tall: 1, fan: 1, portal: 1, lake: 2 },
    boss: boss({ id: 'president-jeff', name: 'President Jeff', drawnBy: BROS, drawing: 'president-jeff.jpg', speed: 1.7, chargeSpeed: 8, damage: 12, scale: 2.4, taunt: 'As president of Antarctica, I order you to nap.' }),
    theme: { ground: 0xeef6ff, ground2: 0xdbe9f7, sky: 0xcfe6ff, fog: 0xe8f3ff, accent: 0x3b5ba5 },
  },
  {
    id: 'asia',
    name: 'Asia',
    continent: 'Asia',
    goalPct: 0.6,
    spots: 6,
    propsPerSpot: 6,
    singles: 5,
    props: { ...SUBURB, sign: 4, barrel: 4 },
    npcs: { adult: 6, dog: 2, chicken: 6 },
    finds: { ...FINDS_BASIC, rattle: 2, megaphone: 1 },
    features: { platform: 3, tall: 2, fan: 2, portal: 2, lake: 1 },
    boss: boss({ id: 'genghis-khan', name: 'Genghis Khan', drawnBy: BROS, drawing: 'genghis-khan.jpg', speed: 2.8, chargeSpeed: 11, damage: 18, scale: 2.8, taunt: 'I like horses. I do not like babies.' }),
    theme: { ground: 0xc9b26b, ground2: 0xb9a25b, sky: 0xffd9a0, fog: 0xffe8c0, accent: 0xd93a3a },
  },
  {
    id: 'africa',
    name: 'Africa',
    continent: 'Africa',
    goalPct: 0.6,
    spots: 6,
    propsPerSpot: 6,
    singles: 5,
    props: { tree: 6, box: 4, barrel: 3, cone: 3, bench: 2, trash: 2, sign: 2, car: 1 },
    npcs: { adult: 6, dog: 3, chicken: 7 },
    finds: { ...FINDS_BASIC, milk: 3, megaphone: 1 },
    features: { platform: 3, tall: 2, fan: 2, portal: 1, lake: 2 },
    boss: boss({ id: 'africa-group', name: 'The African Animal Group', drawnBy: BROS, drawing: 'africa-group.jpg', speed: 2.4, chargeSpeed: 10, damage: 20, scale: 3.2, taunt: 'ROAR. (That was all of us.)' }),
    theme: { ground: 0xd9a55a, ground2: 0xc9954a, sky: 0xffc98a, fog: 0xffdcb0, accent: 0x7a3f1f },
  },
  {
    id: 'australia',
    name: 'Australia',
    continent: 'Australia',
    goalPct: 0.6,
    spots: 6,
    propsPerSpot: 6,
    singles: 5,
    props: { ...SUBURB, tree: 4, hydrant: 3 },
    npcs: { adult: 6, dog: 3, chicken: 6 },
    finds: { ...FINDS_BASIC, pacifier: 2, clock: 3 },
    features: { platform: 3, tall: 2, fan: 2, portal: 1, lake: 2 },
    boss: boss({ id: 'australia-group', name: 'The Australian Animal Group', drawnBy: BROS, drawing: 'australia-group.jpg', speed: 2.6, chargeSpeed: 10, damage: 16, scale: 3.0, taunt: "G'day, baby. Prepare to be bounced." }),
    theme: { ground: 0xe0925a, ground2: 0xd0824a, sky: 0xffe0b0, fog: 0xffeacc, accent: 0x2e8b57 },
  },
  {
    id: 'europe',
    name: 'Europe',
    continent: 'Europe',
    goalPct: 0.65,
    spots: 7,
    propsPerSpot: 6,
    singles: 6,
    props: { ...SUBURB, car: 3, mailbox: 4, sign: 3 },
    npcs: { adult: 7, dog: 3, chicken: 6 },
    finds: { ...FINDS_BASIC, clock: 3, megaphone: 1 },
    features: { platform: 4, tall: 2, fan: 2, portal: 2, lake: 2 },
    boss: boss({ id: 'columbus', name: 'Columbus', drawnBy: BROS, drawing: 'columbus.jpg', speed: 2.6, chargeSpeed: 11, damage: 22, scale: 3.0, taunt: 'I discovered this baby first.' }),
    theme: { ground: 0x86b86a, ground2: 0x76a85a, sky: 0xb8d8ff, fog: 0xd0e6ff, accent: 0x5b3a8b },
  },
]

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id)
}

export const LEVEL_IDS: string[] = LEVELS.map((l) => l.id)
