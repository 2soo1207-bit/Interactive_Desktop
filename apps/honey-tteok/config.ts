export const COLOR_IDS = ['rose-pink', 'honey-beige'] as const
export type TteokColor = typeof COLOR_IDS[number]

interface ColorSpec {
  label: string
  hex: string
  tteokImage: string | null
  productImage: string | null
}

// Image paths are relative to public/, for example app-assets/honey-tteok/rose.webp.
export const COLOR_SPECS: Record<TteokColor, ColorSpec> = {
  'rose-pink': {
    label: 'ROSE PINK',
    hex: '#D88CA0',
    tteokImage: 'app-assets/honey-tteok/rose-pink.webp',
    productImage: null,
  },
  'honey-beige': {
    label: 'HONEY BEIGE',
    hex: '#E5CDA2',
    tteokImage: 'app-assets/honey-tteok/honey-beige.webp',
    productImage: null,
  },
}

export const RULES = {
  durationMs: 45_000,
  targetPoints: 100,
  wrongPoints: -50,
  comboThreshold: 3,
  comboMultiplier: 2,
  initialDropIntervalMs: 785,
  finalDropIntervalMs: 375,
  initialFallSpeed: 0.22,
  finalFallSpeed: 0.44,
  frenzyStartMs: 20_500,
  frenzyDurationMs: 4_300,
  frenzyIntervalMs: 265,
  frenzyBurstSize: 6,
  biteGraceMs: 275,
} as const

export const RANKING_LIMIT = 10
export const NICKNAME_LIMIT = 20
