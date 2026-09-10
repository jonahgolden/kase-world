// Every swappable art piece is named here. Replace a file, or a path, and nothing else changes.
export const ASSETS = {
  models: {
    baby: '/assets/models/baby.glb', // rigged, clips: 'walk', 'walk-idle'
    duogringo: '/assets/models/duogringo.glb', // rigged, clips: 'Attack', 'Idle', 'Walk'
  },
  // Model forward-axis corrections (radians). Tweak if a model walks sideways.
  yaw: {
    baby: 0,
    duogringo: 0,
  },
  drawing: (file: string) => `/assets/drawings/${file}`,
}
