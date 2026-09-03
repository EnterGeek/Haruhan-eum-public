import { describe, expect, it } from 'vitest'
import type {
  NormalizedEventSource,
  NormalizedMelody,
  NormalizedMelodyEvent,
} from '../types'
import { analyzeMetrics } from './index'

const source = (
  contourPosition: number,
  presentedOrder = 1,
): NormalizedEventSource => ({
  presentedOrders: [presentedOrder],
  selectionDirections: ['right'],
  contourPositions: [contourPosition],
})

const note = (
  eventIndex: number,
  startBeat: number,
  midiNote: number,
  contourPosition: number,
  durationBeats = 1,
): NormalizedMelodyEvent => ({
  kind: 'note',
  eventIndex,
  startBeat,
  durationBeats,
  midiNote,
  source: source(contourPosition, eventIndex + 1),
})

const rest = (
  eventIndex: number,
  startBeat: number,
  durationBeats = 1,
): NormalizedMelodyEvent => ({
  kind: 'rest',
  eventIndex,
  startBeat,
  durationBeats,
  source: source(0.5, eventIndex + 1),
})

const melody = (
  events: readonly NormalizedMelodyEvent[],
  overrides: Partial<NormalizedMelody> = {},
): NormalizedMelody => ({
  totalBeats: events.reduce((sum, event) => sum + event.durationBeats, 0),
  tempoBpm: 60,
  minimumMidi: 60,
  maximumMidi: 72,
  tonicMidi: 60,
  maximumMelodicLeapSemitones: 3,
  allowedDurationsBeats: [0.5, 1],
  events,
  ...overrides,
})

const valueOf = <T>(observation: {
  status: 'measured'
  value: T
} | { status: 'unavailable' }): T => {
  expect(observation.status).toBe('measured')
  if (observation.status === 'unavailable') {
    throw new Error('Expected a measured observation.')
  }
  return observation.value
}

const completeContext = {
  schemaValid: true,
  scheduleCompatible: true,
  sameSeedDeterminism: true,
  perturbationSensitivity: 0.125,
  runtime: {
    firstRunMilliseconds: 2,
    repeatRunMilliseconds: 1,
    perturbationRunMilliseconds: 3,
  },
  outputSizeScaling: {
    inputItems: 12,
    outputEvents: 6,
    eventsPerInput: 0.5,
  },
} as const

describe('independent Work 03 metrics', () => {
  it('buckets decimal-equivalent durations under the shared tolerance', () => {
    const normalized = melody([
      note(0, 0, 60, 0.25, 0.3),
      note(1, 0.3, 62, 0.75, 0.1 + 0.2),
    ], {
      totalBeats: 0.6,
      allowedDurationsBeats: [0.3, 0.5],
    })
    const metrics = analyzeMetrics(normalized, completeContext)

    expect(valueOf(metrics.rhythm.durationDiversity)).toBe(0.5)
  })

  it('computes validity, pitch, rhythm, and form observations without an aggregate', () => {
    const pitches = [60, 62, 64, 60, 62, 64]
    const contours = [0.1, 0.2, 0.3, 0.1, 0.2, 0.3]
    const normalized = melody(
      pitches.map((pitch, index) => note(
        index,
        index,
        pitch,
        contours[index],
      )),
    )

    const metrics = analyzeMetrics(normalized, {
      ...completeContext,
      phraseBoundaryBeats: [3],
      expectations: {
        presentedOrders: [1, 2, 3, 4, 5, 6],
        selectionDirections: [
          'right',
          'right',
          'right',
          'right',
          'right',
          'right',
        ],
        contourPositions: contours,
      },
    })

    expect(metrics.validity).toMatchObject({
      schemaValidity: { status: 'measured', value: true },
      finiteNumbers: { status: 'measured', value: true },
      durationValidity: { status: 'measured', value: true },
      totalBeatConsistency: { status: 'measured', value: true },
      noteBounds: { status: 'measured', value: true },
      scheduleCompatibility: { status: 'measured', value: true },
    })

    expect(valueOf(metrics.pitch.pitchClassDiversity)).toBeCloseTo(0.5)
    expect(valueOf(metrics.pitch.intervalHistogram)).toEqual({
      '-4': 1,
      '+2': 4,
    })
    expect(valueOf(metrics.pitch.largeLeapRate)).toBeCloseTo(0.2)
    expect(valueOf(metrics.pitch.unresolvedLeapRate)).toBe(0)
    expect(valueOf(metrics.pitch.repeatedNoteRunLength)).toBe(1)
    expect(valueOf(metrics.pitch.registerUtilization)).toBeCloseTo(1 / 3)
    expect(valueOf(metrics.pitch.edgeOccupancy)).toBeCloseTo(2 / 3)
    expect(metrics.pitch.tonalCenterDriftProxy.status).toBe('unavailable')

    expect(valueOf(metrics.rhythm.durationDiversity)).toBe(0.5)
    expect(valueOf(metrics.rhythm.onsetDensity)).toBe(1)
    expect(valueOf(metrics.rhythm.restRatio)).toBe(0)
    expect(valueOf(metrics.rhythm.longestUninterruptedRun)).toBe(6)
    expect(valueOf(metrics.rhythm.identicalCellRepetition)).toBeCloseTo(0.6)
    expect(valueOf(metrics.rhythm.microNoteRate)).toBe(0)
    expect(valueOf(metrics.rhythm.phraseBoundaryAlignmentProxy)).toBe(0)

    expect(valueOf(metrics.form.motifRecurrence)).toBe(0.5)
    expect(valueOf(metrics.form.exactCopyRatio)).toBeCloseTo(1 / 3)
    expect(valueOf(metrics.form.variationRatio)).toBe(0)
    expect(valueOf(metrics.form.phraseLengthDistribution)).toEqual([6])
    expect(valueOf(metrics.form.cadenceFinalStabilityProxy)).toBeCloseTo(1 / 3)
    expect(valueOf(metrics.form.openingEndingSimilarity)).toBe(1)
    expect(valueOf(metrics.form.contourAgreement)).toBe(1)

    expect(Object.keys(metrics).sort()).toEqual([
      'form',
      'pitch',
      'rhythm',
      'robustness',
      'validity',
    ])
  })

  it('keeps no-large-leap and missing-target denominators unavailable instead of zero', () => {
    const normalized = melody([
      note(0, 0, 60, 0.1),
      note(1, 1, 62, 0.2),
    ])
    const metrics = analyzeMetrics(normalized, {
      schemaValid: true,
      scheduleCompatible: null,
    })

    expect(metrics.pitch.largeLeapRate).toMatchObject({
      status: 'measured',
      value: 0,
    })
    expect(metrics.pitch.unresolvedLeapRate.status).toBe('unavailable')
    expect(metrics.rhythm.phraseBoundaryAlignmentProxy.status).toBe('unavailable')
    expect(metrics.form.motifRecurrence.status).toBe('unavailable')
    expect(metrics.form.variationRatio.status).toBe('unavailable')
    expect(metrics.validity.scheduleCompatibility.status).toBe('unavailable')
  })

  it('uses independent expected contours and never output-carried contours as its target', () => {
    const normalized = melody([
      note(0, 0, 60, 0.9),
      note(1, 1, 62, 0.6),
      note(2, 2, 64, 0.3),
      note(3, 3, 65, 0.1),
    ])
    const withIndependentTarget = analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: null,
      expectations: {
        presentedOrders: [1, 2, 3, 4],
        selectionDirections: ['right', 'right', 'right', 'right'],
        contourPositions: [0.1, 0.3, 0.6, 0.9],
      },
    })
    const withoutIndependentTarget = analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: null,
    })
    const withLengthMismatch = analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: null,
      expectations: {
        presentedOrders: [1, 2, 3, 4],
        selectionDirections: ['right'],
        contourPositions: [0.1, 0.3, 0.6, 0.9],
      },
    })

    expect(valueOf(withIndependentTarget.form.contourAgreement)).toBe(1)
    expect(withoutIndependentTarget.form.contourAgreement.status).toBe('unavailable')
    expect(withLengthMismatch.form.contourAgreement.status).toBe('unavailable')
  })

  it('measures rests, phrase boundaries, repeated-note runs, and micro notes explicitly', () => {
    const events = [
      note(0, 0, 60, 0.2, 0.125),
      note(1, 0.125, 60, 0.2, 0.125),
      rest(2, 0.25, 0.75),
      note(3, 1, 62, 0.3, 0.5),
      rest(4, 1.5, 0.5),
    ]
    const normalized = melody(events, {
      totalBeats: 2,
      allowedDurationsBeats: [0.125, 0.5, 0.75],
    })
    const metrics = analyzeMetrics(normalized, {
      schemaValid: true,
      scheduleCompatible: true,
      phraseBoundaryBeats: [1],
    })

    expect(valueOf(metrics.pitch.repeatedNoteRunLength)).toBe(2)
    expect(valueOf(metrics.rhythm.restRatio)).toBeCloseTo(0.625)
    expect(valueOf(metrics.rhythm.longestUninterruptedRun)).toBe(0.5)
    expect(valueOf(metrics.rhythm.microNoteRate)).toBeCloseTo(0.4)
    expect(valueOf(metrics.rhythm.phraseBoundaryAlignmentProxy)).toBe(1)
    expect(valueOf(metrics.form.phraseLengthDistribution)).toEqual([0.25, 0.5])
  })

  it('detects unresolved leaps and first-to-last-third pitch-class drift', () => {
    const pitches = [60, 60, 60, 72, 72, 72, 61, 61, 61]
    const normalized = melody(
      pitches.map((pitch, index) => note(index, index, pitch, index / 8)),
      { maximumMelodicLeapSemitones: 7 },
    )
    const metrics = analyzeMetrics(normalized, completeContext)

    expect(valueOf(metrics.pitch.largeLeapRate)).toBeCloseTo(2 / 8)
    expect(valueOf(metrics.pitch.unresolvedLeapRate)).toBe(1)
    expect(valueOf(metrics.pitch.tonalCenterDriftProxy)).toBe(1)
  })

  it('reports independent contract failures and does not throw on NaN or Infinity', () => {
    const normalized = melody([
      note(0, 0, Number.POSITIVE_INFINITY, Number.NaN, Number.NaN),
    ], {
      totalBeats: Number.POSITIVE_INFINITY,
      allowedDurationsBeats: [1, Number.NaN],
    })

    expect(() => analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: false,
      perturbationSensitivity: Number.NaN,
      runtime: {
        firstRunMilliseconds: Number.POSITIVE_INFINITY,
        repeatRunMilliseconds: 1,
        perturbationRunMilliseconds: null,
      },
    })).not.toThrow()

    const metrics = analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: false,
      perturbationSensitivity: Number.NaN,
    })
    expect(metrics.validity).toMatchObject({
      schemaValidity: { status: 'measured', value: false },
      finiteNumbers: { status: 'measured', value: false },
      durationValidity: { status: 'measured', value: false },
      totalBeatConsistency: { status: 'measured', value: false },
      noteBounds: { status: 'measured', value: false },
      scheduleCompatibility: { status: 'measured', value: false },
    })
    expect(metrics.pitch.pitchClassDiversity.status).toBe('unavailable')
    expect(metrics.rhythm.durationDiversity.status).toBe('unavailable')
    expect(metrics.form.motifRecurrence.status).toBe('unavailable')
    expect(metrics.robustness.perturbationSensitivity.status).toBe('unavailable')
  })

  it('abstains from pitch-derived metrics for a finite fractional MIDI value', () => {
    const normalized = melody([
      note(0, 0, 60.5, 0.1),
      note(1, 1, 62, 0.2),
    ])
    const metrics = analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: false,
    })

    expect(metrics.validity.finiteNumbers).toMatchObject({
      status: 'measured',
      value: true,
    })
    expect(metrics.validity.noteBounds).toMatchObject({
      status: 'measured',
      value: false,
    })
    expect(metrics.pitch.pitchClassDiversity.status).toBe('unavailable')
    expect(metrics.pitch.intervalHistogram.status).toBe('unavailable')
    expect(metrics.form.motifRecurrence.status).toBe('unavailable')
  })

  it('never reports overflow-derived duration values as measured', () => {
    const normalized = melody([
      note(0, 0, 60, 0.1, Number.MAX_VALUE),
      note(1, Number.MAX_VALUE, 62, 0.2, Number.MAX_VALUE),
    ], {
      totalBeats: Number.MAX_VALUE,
      allowedDurationsBeats: [Number.MAX_VALUE],
    })

    const metrics = analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: false,
    })
    expect(metrics.rhythm.restRatio.status).toBe('unavailable')
    expect(metrics.rhythm.longestUninterruptedRun.status).toBe('unavailable')
    expect(metrics.form.phraseLengthDistribution.status).toBe('unavailable')
  })

  it('marks a discontinuous or wrong-length timeline inconsistent', () => {
    const normalized = melody([
      note(0, 0, 60, 0.1),
      note(1, 2, 62, 0.2),
    ], { totalBeats: 3 })
    const metrics = analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: false,
    })

    expect(metrics.validity.totalBeatConsistency).toMatchObject({
      status: 'measured',
      value: false,
    })
  })

  it('abstains from event-derived metrics over the traversal limit while retaining supplied evidence', () => {
    const normalized = melody([
      note(0, 0, 60, 0.1),
      note(1, 1, 62, 0.2),
      note(2, 2, 64, 0.3),
    ])
    const metrics = analyzeMetrics(normalized, {
      ...completeContext,
      traversalLimit: 2,
    })

    expect(metrics.validity.schemaValidity).toMatchObject({
      status: 'measured',
      value: true,
    })
    expect(metrics.validity.finiteNumbers.status).toBe('unavailable')
    expect(metrics.pitch.pitchClassDiversity.status).toBe('unavailable')
    expect(metrics.rhythm.onsetDensity.status).toBe('unavailable')
    expect(metrics.form.motifRecurrence.status).toBe('unavailable')
    expect(metrics.robustness.sameSeedDeterminism).toMatchObject({
      status: 'measured',
      value: true,
    })
  })

  it('does not allocate beat cells for an absurd declared totalBeats', () => {
    const normalized = melody([
      note(0, 0, 60, 0.1),
      note(1, 1, 62, 0.2),
    ], { totalBeats: Number.MAX_SAFE_INTEGER })

    expect(() => analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: false,
    })).not.toThrow()

    const metrics = analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: false,
    })
    expect(metrics.rhythm.identicalCellRepetition).toMatchObject({
      status: 'unavailable',
    })
    expect(metrics.rhythm.identicalCellRepetition.rationale).toContain('4096')
  })

  it('bounds sparse event, declaration, provenance, and expectation arrays', () => {
    const sparseEvents = new Array<NormalizedMelodyEvent>(3)
    sparseEvents[0] = note(0, 0, 60, 0.1)
    const sparseEventMelody = melody(sparseEvents, { totalBeats: 3 })
    expect(() => analyzeMetrics(sparseEventMelody, {
      schemaValid: false,
      scheduleCompatible: null,
    })).not.toThrow()
    expect(analyzeMetrics(sparseEventMelody, {
      schemaValid: false,
      scheduleCompatible: null,
    }).pitch.pitchClassDiversity.status).toBe('unavailable')

    const hugeSparseNumbers = new Array<number>(1_000_000)
    hugeSparseNumbers[0] = 1
    const event = note(0, 0, 60, 0.1)
    const nestedSparseMelody = melody([{
      ...event,
      source: {
        ...event.source,
        presentedOrders: hugeSparseNumbers,
      },
    }], {
      allowedDurationsBeats: hugeSparseNumbers,
    })
    const metrics = analyzeMetrics(nestedSparseMelody, {
      schemaValid: false,
      scheduleCompatible: null,
      phraseBoundaryBeats: hugeSparseNumbers,
      expectations: {
        presentedOrders: hugeSparseNumbers,
        selectionDirections: new Array<'left' | 'right'>(1_000_000),
        contourPositions: hugeSparseNumbers,
      },
    })

    expect(metrics.validity.finiteNumbers.status).toBe('unavailable')
    expect(metrics.validity.durationValidity.status).toBe('unavailable')
    expect(metrics.rhythm.durationDiversity.status).toBe('unavailable')
    expect(metrics.rhythm.phraseBoundaryAlignmentProxy.status).toBe('unavailable')
    expect(metrics.form.contourAgreement.status).toBe('unavailable')
  })

  it('passes through valid robustness evidence but keeps fixed-input scaling unavailable', () => {
    const metrics = analyzeMetrics(melody([
      note(0, 0, 60, 0.5),
    ]), completeContext)

    expect(metrics.robustness).toMatchObject({
      sameSeedDeterminism: { status: 'measured', value: true },
      perturbationSensitivity: { status: 'measured', value: 0.125 },
      runtime: {
        status: 'measured',
        value: {
          firstRunMilliseconds: 2,
          repeatRunMilliseconds: 1,
          perturbationRunMilliseconds: 3,
        },
      },
      outputSizeScaling: {
        status: 'measured',
        value: {
          inputItems: 12,
          outputEvents: 6,
          eventsPerInput: 0.5,
        },
      },
      inputLengthScaling: { status: 'unavailable' },
    })
    expect(metrics.robustness.inputLengthScaling.rationale).toContain(
      'exactly twelve final decisions',
    )
  })
})
