import { describe, expect, it } from 'vitest'
import goldenSessions from '../../../docs/golden-sessions/representative-sessions.json'
import { expandGoldenCase } from '../../work02/golden/expandGoldenCase'
import { interpretFlow } from '../../work02/interpretation/interpretFlow'
import { FLOW_INTERPRETATION_CONTRACT_VERSION } from '../../work02/versions'
import {
  WORK03_AUDIO_ADAPTER_VERSION,
  WORK03_AUDIO_SCHEDULE_CONTRACT_VERSION,
  WORK03_DETERMINISTIC_CHOICE_VERSION,
  WORK03_DIAGNOSTICS_VERSION,
  WORK03_GRAMMAR_GENERATOR_VERSION,
  WORK03_GRAMMAR_TRACE_VERSION,
  WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
  WORK03_MUSIC_GRAMMAR_VERSION,
  WORK03_STRUCTURAL_EVALUATION_VERSION,
  WORK03_STRUCTURAL_METRICS_VERSION,
} from '../versions'
import { GRAMMAR_PROFILES, getGrammarProfile } from './profiles'
import { TONAL_MODE_DEFINITIONS } from './tonalModes'
import {
  GRAMMAR_PROFILE_IDS,
  type GenerateGrammarV1Request,
  type GrammarProfileDefinition,
} from './types'
import {
  GrammarV1RequestValidationError,
  validateGrammarV1Request,
} from './validateRequest'

const interpretation = () => interpretFlow(
  expandGoldenCase(goldenSessions, 'same-deck-baseline'),
  'hybrid',
)

const request = (): GenerateGrammarV1Request => ({
  interpretation: interpretation(),
  seed: 'work03-contract-test',
  profile: 'BALANCED_LYRICAL',
})

const expectBoundedProfile = (definition: GrammarProfileDefinition) => {
  expect(definition.id).toBeTruthy()
  Object.values(definition.weights).forEach((weight) => {
    expect(weight).toBeGreaterThanOrEqual(0)
    expect(weight).toBeLessThanOrEqual(1)
  })
  expect(definition.limits.motifEventCount).toBeGreaterThanOrEqual(2)
  expect(definition.limits.motifEventCount).toBeLessThanOrEqual(5)
  expect(definition.limits.restRatioTarget).toBeGreaterThanOrEqual(0)
  expect(definition.limits.restRatioTarget).toBeLessThanOrEqual(0.5)
  expect(definition.limits.maximumSyncopatedEvents).toBeGreaterThanOrEqual(0)
  expect(definition.limits.maximumSyncopatedEvents).toBeLessThanOrEqual(5)
  expect(definition.limits.allowedModes.length).toBeGreaterThan(0)
  expect(definition.limits.tempoBpm).toBeGreaterThanOrEqual(60)
  expect(definition.limits.tempoBpm).toBeLessThanOrEqual(100)
}

describe('Work 03 versioned grammar contract', () => {
  it('publishes isolated, stable contract identifiers without changing Work 02', () => {
    expect(WORK03_MUSIC_GRAMMAR_VERSION).toBe('work03-music-grammar-v1')
    expect(WORK03_MELODY_OUTPUT_CONTRACT_VERSION).toBe('work03-melody-output-v1')
    expect(WORK03_GRAMMAR_GENERATOR_VERSION).toBe('work03-grammar-generator-v1')
    expect(WORK03_GRAMMAR_TRACE_VERSION).toBe('work03-grammar-trace-v1')
    expect(WORK03_DIAGNOSTICS_VERSION).toBe('work03-structural-diagnostics-v1')
    expect(WORK03_AUDIO_ADAPTER_VERSION).toBe('work03-audio-adapter-v1')
    expect(WORK03_AUDIO_SCHEDULE_CONTRACT_VERSION).toBe('work03-audio-schedule-v1')
    expect(WORK03_DETERMINISTIC_CHOICE_VERSION).toBe('work03-choice-fnv1a32-v1')
    expect(WORK03_STRUCTURAL_EVALUATION_VERSION)
      .toBe('work03-structural-evaluation-v1')
    expect(WORK03_STRUCTURAL_METRICS_VERSION)
      .toBe('work03-structural-metrics-v1')
    expect(FLOW_INTERPRETATION_CONTRACT_VERSION)
      .toBe('work02-flow-interpretation-v2')
  })

  it('defines exactly the six requested non-diagnostic profiles', () => {
    expect(GRAMMAR_PROFILE_IDS).toEqual([
      'CALM_SPARSE',
      'BALANCED_LYRICAL',
      'PULSING',
      'RESTLESS_CONTOUR',
      'OPEN_ENDED',
      'RESOLVED',
    ])
    expect(Object.keys(GRAMMAR_PROFILES)).toEqual(GRAMMAR_PROFILE_IDS)
    GRAMMAR_PROFILE_IDS.forEach((profileId) => {
      const definition = getGrammarProfile(profileId)
      expect(definition.id).toBe(profileId)
      expectBoundedProfile(definition)
      expect(Object.isFrozen(definition)).toBe(true)
      expect(Object.isFrozen(definition.weights)).toBe(true)
      expect(Object.isFrozen(definition.limits)).toBe(true)
      expect(Object.isFrozen(definition.limits.allowedModes)).toBe(true)
    })
  })

  it('locks the complete profile policy instead of asserting against itself', () => {
    expect(GRAMMAR_PROFILES).toEqual({
      CALM_SPARSE: {
        id: 'CALM_SPARSE',
        weights: {
          contour: 0.35,
          repetition: 0.8,
          rhythmicVariation: 0.2,
          inversion: 0,
          rest: 0.8,
          closure: 0.65,
        },
        limits: {
          density: 'sparse',
          motifEventCount: 2,
          restRatioTarget: 0.25,
          maximumSyncopatedEvents: 1,
          closureStrength: 'moderate',
          allowedModes: ['major-pentatonic', 'minor-pentatonic'],
          tempoBpm: 72,
        },
      },
      BALANCED_LYRICAL: {
        id: 'BALANCED_LYRICAL',
        weights: {
          contour: 0.65,
          repetition: 0.65,
          rhythmicVariation: 0.55,
          inversion: 0.15,
          rest: 0.35,
          closure: 0.7,
        },
        limits: {
          density: 'balanced',
          motifEventCount: 3,
          restRatioTarget: 0.1,
          maximumSyncopatedEvents: 2,
          closureStrength: 'moderate',
          allowedModes: ['major-pentatonic', 'dorian'],
          tempoBpm: 80,
        },
      },
      PULSING: {
        id: 'PULSING',
        weights: {
          contour: 0.5,
          repetition: 0.8,
          rhythmicVariation: 0.7,
          inversion: 0.1,
          rest: 0.2,
          closure: 0.55,
        },
        limits: {
          density: 'dense',
          motifEventCount: 5,
          restRatioTarget: 0.05,
          maximumSyncopatedEvents: 4,
          closureStrength: 'moderate',
          allowedModes: ['mixolydian', 'minor-pentatonic'],
          tempoBpm: 88,
        },
      },
      RESTLESS_CONTOUR: {
        id: 'RESTLESS_CONTOUR',
        weights: {
          contour: 0.9,
          repetition: 0.35,
          rhythmicVariation: 0.75,
          inversion: 0.65,
          rest: 0.1,
          closure: 0.35,
        },
        limits: {
          density: 'dense',
          motifEventCount: 5,
          restRatioTarget: 0,
          maximumSyncopatedEvents: 5,
          closureStrength: 'open',
          allowedModes: ['dorian', 'minor-pentatonic'],
          tempoBpm: 92,
        },
      },
      OPEN_ENDED: {
        id: 'OPEN_ENDED',
        weights: {
          contour: 0.7,
          repetition: 0.55,
          rhythmicVariation: 0.6,
          inversion: 0.3,
          rest: 0.45,
          closure: 0.1,
        },
        limits: {
          density: 'balanced',
          motifEventCount: 3,
          restRatioTarget: 0.15,
          maximumSyncopatedEvents: 3,
          closureStrength: 'open',
          allowedModes: ['dorian', 'mixolydian'],
          tempoBpm: 76,
        },
      },
      RESOLVED: {
        id: 'RESOLVED',
        weights: {
          contour: 0.55,
          repetition: 0.7,
          rhythmicVariation: 0.4,
          inversion: 0.1,
          rest: 0.25,
          closure: 1,
        },
        limits: {
          density: 'balanced',
          motifEventCount: 3,
          restRatioTarget: 0.05,
          maximumSyncopatedEvents: 2,
          closureStrength: 'strong',
          allowedModes: ['major-pentatonic', 'minor-pentatonic'],
          tempoBpm: 78,
        },
      },
    })
  })

  it('freezes the finite mode vocabulary and final-stability weights', () => {
    expect(Object.keys(TONAL_MODE_DEFINITIONS)).toEqual([
      'major-pentatonic',
      'minor-pentatonic',
      'dorian',
      'mixolydian',
    ])
    Object.values(TONAL_MODE_DEFINITIONS).forEach((definition) => {
      expect(definition.semitoneOffsets[0]).toBe(0)
      expect(definition.stabilityWeights).toHaveLength(12)
      expect(definition.stabilityWeights[0]).toBe(1)
      expect(definition.stabilityWeights.every((weight) =>
        weight >= 0 && weight <= 1)).toBe(true)
      expect(Object.isFrozen(definition)).toBe(true)
      expect(Object.isFrozen(definition.semitoneOffsets)).toBe(true)
      expect(Object.isFrozen(definition.stabilityWeights)).toBe(true)
    })
  })

  it('accepts the existing validated FlowInterpretation v2 contract', () => {
    const validated = validateGrammarV1Request(request())
    expect(validated.interpretation).toEqual(interpretation())
    expect(validated.profile.id).toBe('BALANCED_LYRICAL')
    expect(validated.seed).toBe('work03-contract-test')
    expect(validated.constraints).toEqual({
      minimumMidi: 55,
      maximumMidi: 79,
      maximumMelodicLeapSemitones: 7,
      maximumSyncopatedEvents: 2,
      maximumEvents: 20,
      restsAllowed: true,
      totalBeats: 12,
      phraseCount: 4,
      phraseLengthBeats: 3,
      allowedDurationsBeats: [0.5, 1, 1.5, 2],
      minimumMotifEvents: 2,
      maximumMotifEvents: 5,
      ticksPerBeat: 2,
      largeLeapThresholdSemitones: 7,
      recoveryMaximumStepSemitones: 4,
      maximumEdgeRun: 2,
    })
  })

  it('allows only narrowing bounded register, leap, syncopation, events, and rests', () => {
    const validated = validateGrammarV1Request({
      ...request(),
      constraints: {
        minimumMidi: 57,
        maximumMidi: 72,
        maximumMelodicLeapSemitones: 5,
        maximumSyncopatedEvents: 1,
        maximumEvents: 16,
        restsAllowed: false,
      },
    })
    expect(validated.constraints).toMatchObject({
      minimumMidi: 57,
      maximumMidi: 72,
      maximumMelodicLeapSemitones: 5,
      maximumSyncopatedEvents: 1,
      maximumEvents: 16,
      restsAllowed: false,
    })
  })

  it.each([
    ['empty seed', (value: any) => { value.seed = '' }],
    ['unknown profile', (value: any) => { value.profile = 'DIAGNOSIS' }],
    ['widened register low', (value: any) => { value.constraints = { minimumMidi: 54 } }],
    ['widened register high', (value: any) => { value.constraints = { maximumMidi: 80 } }],
    ['narrow register span', (value: any) => {
      value.constraints = { minimumMidi: 60, maximumMidi: 70 }
    }],
    ['widened leap', (value: any) => {
      value.constraints = { maximumMelodicLeapSemitones: 8 }
    }],
    ['widened syncopation', (value: any) => {
      value.constraints = { maximumSyncopatedEvents: 3 }
    }],
    ['event explosion', (value: any) => { value.constraints = { maximumEvents: 21 } }],
    ['irreconcilable profile event cap', (value: any) => {
      value.profile = 'PULSING'
      value.constraints = { maximumEvents: 19 }
    }],
    ['unknown request field', (value: any) => { value.timestamp = 1234 }],
    ['unknown constraint', (value: any) => { value.constraints = { mood: 'sad' } }],
  ])('rejects %s instead of widening or repairing the request', (_, mutate) => {
    const invalid: any = structuredClone(request())
    mutate(invalid)
    expect(() => validateGrammarV1Request(invalid))
      .toThrow(GrammarV1RequestValidationError)
  })

  it('delegates malformed interpretation rejection to the preserved Work 02 boundary', () => {
    const invalid: any = structuredClone(request())
    invalid.interpretation.versions.contract = 'silently-upgraded'
    expect(() => validateGrammarV1Request(invalid)).toThrow(
      /rejected by the Work 02 boundary/,
    )
  })

  it.each([
    ['common-features version', (value: any) => {
      value.interpretation.versions.commonFeatures = 'unknown'
    }],
    ['non-finite color feature', (value: any) => {
      value.interpretation.items[0].lightness = Number.NaN
    }],
    ['relabelled derived summary', (value: any) => {
      value.interpretation.directionSummary.leftCount += 1
    }],
    ['mathematically altered contour', (value: any) => {
      value.interpretation.registerContourCandidates[0].normalizedPosition = 0.25
    }],
  ])('rejects a %s mutation that the narrow Work 02 melody boundary does not inspect', (
    _,
    mutate,
  ) => {
    const invalid: any = structuredClone(request())
    mutate(invalid)
    expect(() => validateGrammarV1Request(invalid))
      .toThrow(GrammarV1RequestValidationError)
  })

  it('does not mutate the request or interpretation while resolving constraints', () => {
    const original = request()
    const before = structuredClone(original)
    validateGrammarV1Request(original)
    expect(original).toEqual(before)
  })
})
