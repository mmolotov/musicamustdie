import type { FrettingFinger } from './types'
import { pick } from '../i18n'

export type ScaleStepGrid = readonly (readonly number[])[]

export interface CanonicalCagedTemplate {
  id: 'c' | 'a' | 'g' | 'e' | 'd'
  name: 'C' | 'A' | 'G' | 'E' | 'D'
  anchorString: number
  startOffset: number
  endOffset: number
  steps: ScaleStepGrid
  popularity: number
}

/**
 * Exact diatonic-step maps for the five movable CAGED scale forms.
 * A step of 0 is the tonic at the anchor; negative steps are notes below it.
 * Storing steps instead of fret windows keeps the shapes intact in every key.
 */
export const CANONICAL_CAGED_TEMPLATES: readonly CanonicalCagedTemplate[] = [
  {
    id: 'c',
    name: 'C',
    anchorString: 1,
    startOffset: -3,
    endOffset: 0,
    steps: [[-5, -4, -3], [-2, -1, 0], [1, 2, 3], [4, 5], [6, 7, 8], [9, 10, 11]],
    popularity: 88,
  },
  {
    id: 'a',
    name: 'A',
    anchorString: 1,
    startOffset: -1,
    endOffset: 2,
    steps: [[-3, -2], [-1, 0, 1], [2, 3, 4], [5, 6, 7], [8, 9], [11, 12]],
    popularity: 94,
  },
  {
    id: 'g',
    name: 'G',
    anchorString: 0,
    startOffset: -4,
    endOffset: 0,
    steps: [[-2, -1, 0], [1, 2, 3], [4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14]],
    popularity: 84,
  },
  {
    id: 'e',
    name: 'E',
    anchorString: 0,
    startOffset: -1,
    endOffset: 2,
    steps: [[-1, 0, 1], [2, 3, 4], [5, 6, 7], [8, 9, 10], [11, 12], [13, 14, 15]],
    popularity: 98,
  },
  {
    id: 'd',
    name: 'D',
    anchorString: 2,
    startOffset: -1,
    endOffset: 3,
    steps: [[-6, -5, -4], [-3, -2], [-1, 0, 1], [2, 3, 4], [5, 6, 7], [8, 9, 10]],
    popularity: 86,
  },
]

export interface PositionalScaleTemplate {
  id: string
  position: number
  anchorString: 0
  anchorStep: number
  steps: ScaleStepGrid
}

/** Seven exact major-system positional maps (Berklee/Leavitt-style). */
export const POSITIONAL_SCALE_TEMPLATES: readonly PositionalScaleTemplate[] = [
  { id: 'p1', position: 1, anchorString: 0, anchorStep: -2, steps: [[-4, -3, -2], [-1, 0, 1], [2, 3, 4], [5, 6, 7], [8, 9], [10, 11, 12]] },
  { id: 'p2', position: 2, anchorString: 0, anchorStep: -1, steps: [[-3, -2, -1], [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10], [11, 12, 13]] },
  { id: 'p3', position: 3, anchorString: 0, anchorStep: 0, steps: [[-2, -1, 0], [1, 2, 3], [4, 5, 6], [7, 8, 9], [9, 10, 11], [12, 13, 14]] },
  { id: 'p4', position: 4, anchorString: 0, anchorStep: 1, steps: [[-1, 0, 1], [2, 3, 4], [5, 6, 7], [8, 9, 10], [11, 12], [13, 14, 15]] },
  { id: 'p5', position: 5, anchorString: 0, anchorStep: 2, steps: [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13], [14, 15, 16]] },
  { id: 'p6', position: 6, anchorString: 0, anchorStep: 3, steps: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [12, 13, 14], [15, 16, 17]] },
  { id: 'p7', position: 7, anchorString: 0, anchorStep: 4, steps: [[2, 3, 4], [5, 6, 7], [8, 9, 10], [11, 12], [13, 14, 15], [16, 17, 18]] },
]

export interface CanonicalThreeNpsTemplate {
  id: string
  position: number
  startDegree: number
}

/** Seven standard 3NPS positions, one for every starting scale degree. */
export const CANONICAL_THREE_NPS_TEMPLATES: readonly CanonicalThreeNpsTemplate[] =
  Array.from({ length: 7 }, (_, startDegree) => ({
    id: `degree-${startDegree + 1}`,
    position: startDegree + 1,
    startDegree,
  }))

export interface OneOctaveTopology {
  id: 'compact' | 'forward'
  name: string
  steps: ScaleStepGrid
  popularity: number
}

export const ONE_OCTAVE_TOPOLOGIES: readonly OneOctaveTopology[] = [
  {
    id: 'compact',
    get name() {
      return pick('Компактная', 'Compact')
    },
    steps: [[0, 1], [2, 3, 4], [5, 6, 7]],
    popularity: 96,
  },
  {
    id: 'forward',
    get name() {
      return pick('Поточная', 'Flowing')
    },
    steps: [[0, 1, 2], [3, 4, 5], [6, 7]],
    popularity: 94,
  },
]

export interface TwoOctaveHybridTopology {
  id: 'two-three-three-three-four' | 'one-three-three-three-three-two'
  name: string
  shortName: string
  /** Complete 15-note route grouped across consecutive strings. */
  stringDistribution: readonly number[]
  /** Full tonic-to-tonic-to-tonic route expressed as diatonic steps 0...14. */
  steps: ScaleStepGrid
  /** Entry fingering keeps the first string aligned with the next position. */
  entryFingers: readonly FrettingFinger[]
  popularity: number
}

function sequentialSteps(distribution: readonly number[]): ScaleStepGrid {
  let nextStep = 0
  return distribution.map((count) =>
    Array.from({ length: count }, () => {
      const step = nextStep
      nextStep += 1
      return step
    }),
  )
}

const FIVE_STRING_HYBRID_DISTRIBUTION = [2, 3, 3, 3, 4] as const
const SIX_STRING_HYBRID_DISTRIBUTION = [1, 3, 3, 3, 3, 2] as const

/**
 * Hybrid two-octave routes with the exact requested note counts per string.
 * Both distributions contain all fifteen notes including all three tonics.
 */
export const TWO_OCTAVE_HYBRID_TOPOLOGIES: readonly TwoOctaveHybridTopology[] = [
  {
    id: 'two-three-three-three-four',
    name: '2 + 3 + 3 + 3 + 4',
    shortName: '2–3–3–3–4',
    stringDistribution: FIVE_STRING_HYBRID_DISTRIBUTION,
    steps: sequentialSteps(FIVE_STRING_HYBRID_DISTRIBUTION),
    entryFingers: [2, 4],
    popularity: 98,
  },
  {
    id: 'one-three-three-three-three-two',
    name: '1 + 3 + 3 + 3 + 3 + 2',
    shortName: '1–3–3–3–3–2',
    stringDistribution: SIX_STRING_HYBRID_DISTRIBUTION,
    steps: sequentialSteps(SIX_STRING_HYBRID_DISTRIBUTION),
    entryFingers: [4],
    popularity: 96,
  },
]
