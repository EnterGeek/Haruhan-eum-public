import { describe, expect, it } from 'vitest'
import { interpretFlow } from '../../work02/interpretation/interpretFlow'
import type { FlowInterpretation } from '../../work02/interpretation/types'
import { generateMelody } from '../../work02/music/generator'
import { createMusicGrammarSnapshot } from '../../work02/music/grammar'
import type { MelodyEvent, MelodyOutput } from '../../work02/music/types'
import {
  FLOW_INTERPRETATION_CONTRACT_VERSION,
  HYBRID_HUE_INTERPRETER_VERSION,
  MELODY_GENERATOR_VERSION,
  MELODY_OUTPUT_CONTRACT_VERSION,
  MUSIC_GRAMMAR_VERSION,
} from '../../work02/versions'
import { createWork03PublicFixtureInput } from '../fixtures/publicFixtures'
import { generateGrammarV1 } from '../grammar/generator'
import { WORK03_STRUCTURAL_METRICS_VERSION } from '../versions'
import {
  countUniqueCanonicalRuns,
  measureGrammarV1Structure,
  measureWork02BaselineStructure,
} from './metrics'

interface EventSpec {
  kind: 'note' | 'rest'
  durationBeats: 0.5 | 1 | 1.5 | 2
  orders: readonly number[]
  midiNote?: number
}

const interpretationWithConstantContour = (): FlowInterpretation => {
  const interpretation: any = structuredClone(interpretFlow(
    createWork03PublicFixtureInput('constant-blocks'),
    'hybrid',
  ))
  interpretation.registerContourCandidates =
    interpretation.registerContourCandidates.map((candidate: any) => ({
      ...candidate,
      normalizedPosition: 0.5,
    }))
  return interpretation
}

const baselineFrom = (
  interpretation: FlowInterpretation,
  specs: readonly EventSpec[],
): MelodyOutput => {
  let startBeat = 0
  const events = specs.map((spec, eventIndex): MelodyEvent => {
    const source = {
      presentedOrders: [...spec.orders],
      selectionDirections: spec.orders.map((order) =>
        interpretation.items[order - 1].selectionDirection),
      contourPositions: spec.orders.map(() => 0.5),
    }
    const common = {
      eventIndex,
      startBeat,
      durationBeats: spec.durationBeats,
      source,
    }
    startBeat += spec.durationBeats
    return spec.kind === 'rest'
      ? { ...common, kind: 'rest' }
      : { ...common, kind: 'note', midiNote: spec.midiNote ?? 60 }
  })
  expect(startBeat).toBe(12)
  return {
    versions: {
      outputContract: MELODY_OUTPUT_CONTRACT_VERSION,
      grammar: MUSIC_GRAMMAR_VERSION,
      interpretationContract: FLOW_INTERPRETATION_CONTRACT_VERSION,
      interpreter: HYBRID_HUE_INTERPRETER_VERSION,
      generator: MELODY_GENERATOR_VERSION,
    },
    method: 'hybrid',
    grammar: createMusicGrammarSnapshot(),
    totalBeats: 12,
    events,
  }
}

describe('structural metric formulas', () => {
  it('matches a hand-computed baseline with a rest and terminal large leap', () => {
    const interpretation = interpretationWithConstantContour()
    const specs: EventSpec[] = Array.from({ length: 12 }, (_, index) => ({
      kind: index === 5 ? 'rest' : 'note',
      durationBeats: 1,
      orders: index === 6 ? [6, 7] : [index + 1],
      midiNote: index === 11 ? 67 : 60,
    }))
    const metrics = measureWork02BaselineStructure(
      baselineFrom(interpretation, specs),
      interpretation,
    )

    expect(metrics).toEqual({
      version: WORK03_STRUCTURAL_METRICS_VERSION,
      pitchClassDiversityCount: 2,
      pitchClassDiversityRatio: 0.4,
      exactRepetitionRatio: 0.9,
      motifLength: 0,
      motifRecurrenceCount: 0,
      rhythmicDiversityCount: 1,
      rhythmicEntropy: 0,
      restRatio: 0.083333,
      phraseCount: 1,
      phraseLengthTicks: [24],
      phraseLengthMinimumTicks: 24,
      phraseLengthMaximumTicks: 24,
      phraseLengthMeanTicks: 24,
      largeLeapCount: 1,
      unresolvedLeapCount: 1,
      registerUtilization: 0.4375,
      edgeHitRatio: 0.909091,
      longestEdgeRun: 10,
      contourAgreement: 0,
      eligibleContourComparisons: 0,
      finalStability: 0.75,
      eventDensity: 0.916667,
      soundingRatio: 0.916667,
      tonalCenterDrift: 0,
      pitchClassEntropy: 0.189281,
      intervalDirectionEntropy: 0.295903,
    })
  })

  it('normalizes four equally represented rhythms to one and zeroes degenerate entropy', () => {
    const interpretation = interpretationWithConstantContour()
    const specs: EventSpec[] = [
      { kind: 'note', durationBeats: 0.5, orders: [1, 2] },
      { kind: 'note', durationBeats: 0.5, orders: [3, 4] },
      { kind: 'note', durationBeats: 1, orders: [5, 6] },
      { kind: 'note', durationBeats: 1, orders: [7, 8] },
      { kind: 'note', durationBeats: 1.5, orders: [9] },
      { kind: 'note', durationBeats: 1.5, orders: [10] },
      { kind: 'note', durationBeats: 2, orders: [11] },
      { kind: 'note', durationBeats: 2, orders: [12] },
      { kind: 'rest', durationBeats: 2, orders: [12] },
    ]
    const metrics = measureWork02BaselineStructure(
      baselineFrom(interpretation, specs),
      interpretation,
    )

    expect(metrics).toMatchObject({
      pitchClassDiversityCount: 1,
      pitchClassDiversityRatio: 0.2,
      exactRepetitionRatio: 0.571429,
      rhythmicDiversityCount: 4,
      rhythmicEntropy: 1,
      restRatio: 0.166667,
      registerUtilization: 0,
      edgeHitRatio: 1,
      longestEdgeRun: 8,
      contourAgreement: 0,
      eligibleContourComparisons: 0,
      finalStability: 1,
      eventDensity: 0.666667,
      soundingRatio: 0.833333,
      pitchClassEntropy: 0,
      intervalDirectionEntropy: 0,
      largeLeapCount: 0,
      unresolvedLeapCount: 0,
    })
  })

  it('counts rests as explicit time without letting them break note adjacency', () => {
    const interpretation = interpretationWithConstantContour()
    const specs: EventSpec[] = Array.from({ length: 12 }, (_, index) => ({
      kind: index === 5 ? 'rest' : 'note',
      durationBeats: 1,
      orders: index === 6 ? [6, 7] : [index + 1],
      midiNote: 60,
    }))
    const metrics = measureWork02BaselineStructure(
      baselineFrom(interpretation, specs),
      interpretation,
    )
    // Eleven sounding notes yield ten comparisons. Ignoring the rest leaves
    // all ten adjacent (pitch, duration) tuples identical.
    expect(metrics.exactRepetitionRatio).toBe(1)
    expect(metrics.restRatio).toBe(0.083333)
    expect(metrics.soundingRatio).toBe(0.916667)
  })
})

describe('Work 02 and Work 03 comparison views', () => {
  it('represents the same interpreted flow as one unplanned baseline span versus four planned phrases', () => {
    const interpretation = interpretFlow(
      createWork03PublicFixtureInput('same-deck-baseline'),
      'hybrid',
    )
    const baseline = measureWork02BaselineStructure(
      generateMelody(interpretation),
      interpretation,
    )
    const grammar = measureGrammarV1Structure(generateGrammarV1({
      interpretation,
      seed: 'metrics-shape-coverage',
      profile: 'BALANCED_LYRICAL',
    }))

    expect(baseline).toMatchObject({
      version: WORK03_STRUCTURAL_METRICS_VERSION,
      phraseCount: 1,
      phraseLengthTicks: [24],
      motifLength: 0,
      motifRecurrenceCount: 0,
      tonalCenterDrift: 0,
    })
    expect(grammar).toMatchObject({
      version: WORK03_STRUCTURAL_METRICS_VERSION,
      phraseCount: 4,
      phraseLengthTicks: [6, 6, 6, 6],
      phraseLengthMinimumTicks: 6,
      phraseLengthMaximumTicks: 6,
      phraseLengthMeanTicks: 6,
      motifLength: 3,
      motifRecurrenceCount: 3,
      unresolvedLeapCount: 0,
      tonalCenterDrift: 0,
    })
    Object.entries(grammar).forEach(([key, value]) => {
      if (key === 'version' || Array.isArray(value)) return
      expect(Number.isFinite(value), key).toBe(true)
    })
  })

  it('measures the profile-dependent final-stability contract directly', () => {
    const interpretation = interpretFlow(
      createWork03PublicFixtureInput('same-deck-baseline'),
      'hybrid',
    )
    const resolved = measureGrammarV1Structure(generateGrammarV1({
      interpretation,
      seed: 'metrics-cadence',
      profile: 'RESOLVED',
    }))
    const open = measureGrammarV1Structure(generateGrammarV1({
      interpretation,
      seed: 'metrics-cadence',
      profile: 'OPEN_ENDED',
    }))
    expect(resolved.finalStability).toBe(1)
    expect(open.finalStability).toBeGreaterThan(0)
    expect(open.finalStability).toBeLessThan(1)
  })

  it('rejects a valid interpretation from a different method than the baseline melody', () => {
    const input = createWork03PublicFixtureInput('same-deck-baseline')
    const hybrid = interpretFlow(input, 'hybrid')
    const relative = interpretFlow(input, 'relative-hue')
    expect(() => measureWork02BaselineStructure(
      generateMelody(hybrid),
      relative,
    )).toThrow(/melody and interpretation contracts must match/)
  })

  it('rejects malformed baseline anchor input before measuring it', () => {
    const interpretation: any = interpretationWithConstantContour()
    const melody = generateMelody(interpretation)
    interpretation.registerContourCandidates[0].normalizedPosition = Number.NaN
    expect(() => measureWork02BaselineStructure(melody, interpretation))
      .toThrow(/must be finite and in \[0, 1\]/)
  })
})

describe('canonical identical-run counting', () => {
  it('returns zero for no runs and ignores object key insertion order recursively', () => {
    expect(countUniqueCanonicalRuns([])).toBe(0)
    const first = { z: 2, nested: { beta: true, alpha: 1 } }
    const reordered = { nested: { alpha: 1, beta: true }, z: 2 }
    const before = structuredClone(first)
    expect(countUniqueCanonicalRuns([first, reordered])).toBe(1)
    expect(first).toEqual(before)
  })

  it('preserves meaningful array order and scalar differences', () => {
    expect(countUniqueCanonicalRuns([
      { values: [1, 2, 3], enabled: true },
      { enabled: true, values: [3, 2, 1] },
      { enabled: false, values: [1, 2, 3] },
    ])).toBe(3)
  })
})
