// Procedural music as data: which note to play on which step. Pure, so the loop structure can be tested.
// A short pattern repeats into a jingle in seconds; bars of A A B A C A B A' with rests and an octave lift push the
// loop past 20 s, which is what keeps it from registering as repetition.
export type MusicMode = 'play' | 'calm' | 'boss'

export const STEPS_PER_BAR = 16
export const BARS = 8
export const LOOP_STEPS = STEPS_PER_BAR * BARS

const REST = -1

const PATTERNS: Record<MusicMode, { A: number[]; B: number[]; C: number[] }> = {
  play: {
    A: [0, 4, 7, 4, 5, 7, 8, 7, 4, 2, 4, 7, 5, 4, 2, 0],
    B: [7, 7, 8, REST, 5, 7, 4, REST, 2, 4, 5, 4, 2, REST, 0, REST],
    C: [0, REST, 4, REST, 7, 8, 7, 5, 4, REST, 2, REST, 4, 5, 4, 2],
  },
  calm: {
    A: [0, 2, 4, 7, 4, 2, 5, 3, 0, 3, 5, 7, 6, 4, 2, 1],
    B: [4, 2, 0, 2, 4, 5, 7, 5, 4, 2, 3, 5, 4, 2, 1, 0],
    C: [7, 6, 5, 4, 3, 2, 1, 0, 2, 4, 5, 7, 5, 4, 2, 0],
  },
  boss: {
    A: [0, 0, 7, 0, 5, 0, 7, 8, 0, 0, 7, 0, 3, 5, 3, 1],
    B: [0, REST, 0, 7, REST, 7, 8, 7, 0, REST, 0, 5, REST, 5, 3, 1],
    C: [8, 8, 7, 5, 8, 8, 7, 3, 0, 0, 7, 0, 5, 3, 1, 0],
  },
}

// Bar sequence A A B A C A B A', where A' is A lifted an octave.
const FORM: ('A' | 'B' | 'C' | 'A1')[] = ['A', 'A', 'B', 'A', 'C', 'A', 'B', 'A1']

export interface MusicNote {
  note: number // scale degree, or -1 for a rest
  octave: 0 | 1
  downbeat: boolean
}

export function musicStep(mode: MusicMode, step: number): MusicNote {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS
  const bar = Math.floor(s / STEPS_PER_BAR)
  const i = s % STEPS_PER_BAR
  const which = FORM[bar]
  const p = PATTERNS[mode]
  const src = which === 'A1' ? p.A : p[which]
  return { note: src[i], octave: which === 'A1' ? 1 : 0, downbeat: i % 4 === 0 }
}

export function stepMs(mode: MusicMode): number {
  return mode === 'calm' ? 260 : mode === 'boss' ? 170 : 210
}
