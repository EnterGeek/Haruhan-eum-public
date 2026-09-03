import type { Direction } from '../../../domain/types'
import { interpretFlow } from '../../../work02/interpretation/interpretFlow'
import type {
  FlowInterpretation,
  InterpretationMethod,
} from '../../../work02/interpretation/types'
import { validateFlowInterpretationForMelody } from '../../../work02/music/generator'
import { adaptSessionExport } from '../../../work02/sessionAdapter'
import {
  buildHueDeck,
  buildRepeatedColorDeck,
  buildSyntheticSession,
  commitSteps,
} from './builders'
import type {
  InterpretationCorpusCase,
  InterpretationStressFamily,
} from './types'

const directions = Array.from(
  { length: 12 },
  (_, index): Direction => index % 2 === 0 ? 'left' : 'right',
)

const sourceFor = (interpretation: FlowInterpretation): string =>
  `${interpretation.method}@${interpretation.versions.interpreter}`

const withContour = (
  interpretation: FlowInterpretation,
  positions: readonly number[],
): FlowInterpretation => {
  if (positions.length !== 12) throw new RangeError('A stress contour requires 12 values.')
  return {
    ...interpretation,
    registerContourCandidates: positions.map((normalizedPosition, index) => ({
      presentedOrder: index + 1,
      normalizedPosition,
      source: sourceFor(interpretation),
    })),
  }
}

const makeCase = (
  id: string,
  dayOffset: number,
  family: InterpretationStressFamily,
  hues: readonly number[],
  contour: readonly number[],
  method: InterpretationMethod = 'absolute-hue',
): InterpretationCorpusCase => {
  const deckSeed = `work03-interpretation-${id}`
  const deck = family === 'repeated-source-values'
    ? buildRepeatedColorDeck(deckSeed)
    : buildHueDeck(deckSeed, hues)
  const session = buildSyntheticSession({
    caseId: `interpretation-${id}`,
    dayOffset: 30 + dayOffset,
    deckSeed,
    deck,
    steps: commitSteps(directions),
  })
  return {
    id,
    families: [family],
    session,
    method,
    interpretation: withContour(
      interpretFlow(adaptSessionExport(session), method),
      contour,
    ),
    expectedValidity: 'valid',
  }
}

const invalidateProvenance = (
  source: InterpretationCorpusCase,
  id: string,
  mutate: (interpretation: FlowInterpretation) => FlowInterpretation,
): InterpretationCorpusCase => ({
  ...source,
  id,
  families: ['provenance-mistakes-for-negative-tests'],
  interpretation: mutate(source.interpretation),
  expectedValidity: 'invalid-provenance',
})

const ascendingHues = Array.from({ length: 12 }, (_, index) => index * 30)
const ascendingContour = Array.from({ length: 12 }, (_, index) => index / 11)
const descendingContour = [...ascendingContour].reverse()
const zigZagContour = Array.from(
  { length: 12 },
  (_, index) => index % 2 === 0 ? 0.05 : 0.95,
)
const flatContour = Array<number>(12).fill(0.5)
const boundaryHues = [
  0, 359.999, 0.001, 180, 179.999, 180.001,
  1, 358.999, 90, 270, 0.5, 359.5,
] as const

const buildCases = (): InterpretationCorpusCase[] => {
  const valid = [
    makeCase(
      'monotonic-contour',
      0,
      'monotonic-contour',
      ascendingHues,
      ascendingContour,
    ),
    makeCase(
      'zig-zag-contour',
      1,
      'zig-zag-contour',
      ascendingHues,
      zigZagContour,
    ),
    makeCase(
      'flat-contour',
      2,
      'flat-contour',
      ascendingHues,
      flatContour,
    ),
    makeCase(
      'extreme-contour-span',
      3,
      'extreme-contour-span',
      ascendingHues,
      [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    ),
    makeCase(
      'contradictory-candidate-tendencies',
      4,
      'contradictory-candidate-tendencies',
      ascendingHues,
      descendingContour,
    ),
    makeCase(
      'repeated-source-values',
      5,
      'repeated-source-values',
      Array<number>(12).fill(120),
      flatContour,
    ),
    makeCase(
      'boundary-hue-values',
      6,
      'boundary-hue-values',
      boundaryHues,
      zigZagContour,
      'relative-hue',
    ),
  ]

  const provenanceSource = valid[0]
  const wrongMethodSource = invalidateProvenance(
    provenanceSource,
    'provenance-wrong-method-source',
    (interpretation) => ({
      ...interpretation,
      registerContourCandidates: interpretation.registerContourCandidates.map(
        (candidate, index) => index === 4
          ? { ...candidate, source: `relative-hue@${interpretation.versions.interpreter}` }
          : candidate,
      ),
    }),
  )
  const staleVersionSource = invalidateProvenance(
    provenanceSource,
    'provenance-stale-interpreter-source',
    (interpretation) => ({
      ...interpretation,
      registerContourCandidates: interpretation.registerContourCandidates.map(
        (candidate, index) => index === 7
          ? { ...candidate, source: 'absolute-hue@work02-absolute-hue-v0' }
          : candidate,
      ),
    }),
  )
  const wrongOrderSource = invalidateProvenance(
    provenanceSource,
    'provenance-wrong-presented-order',
    (interpretation) => ({
      ...interpretation,
      registerContourCandidates: interpretation.registerContourCandidates.map(
        (candidate, index) => index === 2
          ? { ...candidate, presentedOrder: 4 }
          : candidate,
      ),
    }),
  )

  return [
    ...valid,
    wrongMethodSource,
    staleVersionSource,
    wrongOrderSource,
  ]
}

/**
 * Returns seven valid interpretation stresses and three provenance-negative
 * controls. Every case still carries a valid synthetic SessionExport.
 */
export function buildInterpretationCorpus(): readonly InterpretationCorpusCase[] {
  const cases = buildCases()
  cases.forEach((item) => {
    if (item.expectedValidity === 'valid') {
      validateFlowInterpretationForMelody(item.interpretation)
    }
  })
  return cases
}
