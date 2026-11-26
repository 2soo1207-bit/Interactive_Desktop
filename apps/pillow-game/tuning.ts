/** All distances are world units, time is seconds, and angles are radians. */
export const PILLOW_TUNING = {
  target: 13,
  width: 260,
  height: 66,
  platformHalfWidth: 185,
  gravity: 1240,
  // Leave room for the photographed upright package to turn onto its side.
  dropHeight: 420,
  fixedStep: 1 / 120,
  maxFrameTime: 0.1,
  settleTime: 0.74,
  collapseTime: 2.65,
  historyMs: 700,
  supportInset: 9,
  supportFailureTime: 0.12,
  compressionStiffness: 125,
  compressionDamping: 11,
  lateralStiffness: 24,
  lateralDamping: 7.8,
  angularStiffness: 23,
  angularDamping: 5.8,
  floorRestitution: 0.23,
  floorFriction: 0.87,
  shoulderSlope: .38,
  slideGravity: .22,
  kineticFrictionRatio: .72,
  impactRebound: .09,
} as const

export interface PillowDifficulty {
  amplitude: number
  angularSpeed: number
  wind: number
  perfectDistance: number
  supportInset: number
  staticFriction: number
}

/** These three tiers are the only difficulty settings. No random failures. */
export const DIFFICULTY_TIERS = [
  { from: 1, to: 4, speed: [1.05, 1.36], amplitude: [202, 216], wind: [.5, 1.1], friction: [.14, .115], perfect: 17, inset: 9 },
  { from: 5, to: 8, speed: [1.5, 1.94], amplitude: [224, 238], wind: [1.4, 2.4], friction: [.11, .085], perfect: 14, inset: 11 },
  { from: 9, to: 13, speed: [2.1, 2.65], amplitude: [243, 259], wind: [2.6, 4], friction: [.08, .06], perfect: 11, inset: 13 },
] as const

export function levelDifficulty(level: number): PillowDifficulty {
  const safe = Math.max(1, Math.min(PILLOW_TUNING.target, level))
  const tier = DIFFICULTY_TIERS.find(value => safe >= value.from && safe <= value.to)!
  const p = (safe - tier.from) / (tier.to - tier.from)
  const mix = (a: number, b: number) => a + (b - a) * p
  return {
    amplitude: mix(tier.amplitude[0], tier.amplitude[1]),
    angularSpeed: mix(tier.speed[0], tier.speed[1]),
    wind: mix(tier.wind[0], tier.wind[1]),
    perfectDistance: tier.perfect,
    supportInset: tier.inset,
    staticFriction: mix(tier.friction[0], tier.friction[1]),
  }
}
