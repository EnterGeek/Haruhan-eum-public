import { describe, expect, it } from 'vitest'
import type { NormalizedMelody } from './types'
import { analyzeMetrics } from './metrics'
import { deriveFindings, FINDING_THRESHOLDS, resultCategoryFor } from './findings'

const melodyFor = (pitches: readonly number[]): NormalizedMelody => ({
  totalBeats: pitches.length,
  tempoBpm: 80,
  minimumMidi: 60,
  maximumMidi: 76,
  tonicMidi: 60,
  maximumMelodicLeapSemitones: 7,
  allowedDurationsBeats: [0.5, 1, 1.5, 2],
  events: pitches.map((midiNote, index) => ({
    kind: 'note',
    eventIndex: index,
    startBeat: index,
    durationBeats: 1,
    midiNote,
    source: {
      presentedOrders: [index + 1],
      selectionDirections: ['right'],
      contourPositions: [index / Math.max(1, pitches.length - 1)],
    },
  })),
})

const findingsFor = (normalized: NormalizedMelody) => deriveFindings({
  normalized,
  metrics: analyzeMetrics(normalized, {
    schemaValid: true,
    scheduleCompatible: true,
    sameSeedDeterminism: true,
  }),
  validationChecks: [],
  expectations: {
    presentedOrders: normalized.events.map((_, index) => index + 1),
    selectionDirections: normalized.events.map(() => 'right'),
    contourPositions: normalized.events.map((_, index) =>
      index / Math.max(1, normalized.events.length - 1)),
  },
})

describe('stable finding rules', () => {
  it('freezes the v1 threshold authority', () => {
    expect(FINDING_THRESHOLDS).toEqual({
      minimumNotesForPattern: 8,
      minimumNonZeroIntervalsForMonotony: 6,
      monotonicDirectionShare: 0.9,
      octavePingPongShare: 0.75,
      largeLeapRateHigh: 0.5,
      unresolvedLeapRateHigh: 0.75,
      repeatedNoteRun: 8,
      registerEdgeOccupancy: 0.75,
      registerUtilizationLow: 0.25,
      restRatioHigh: 0.75,
      durationDiversityCollapsed: 0.25,
      identicalCellRepetitionHigh: 0.75,
      microNoteRateHigh: 0.5,
      exactCopyRatioHigh: 0.75,
      contourAgreementLow: 0.33,
      expectedEdgeBand: 0.2,
      expectedEdgeMaximumSpan: 0.25,
      expectedEdgeShare: 0.75,
    })
  })

  it('uses stable unique sorted rationale codes and never returns a score', () => {
    const findings = findingsFor(melodyFor(Array<number>(12).fill(60)))
    const codes = findings.map((item) => item.code)
    expect(codes).toEqual([...codes].sort())
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes).toContain('PITCH.CONSTANT')
    expect(findings.some((item) => 'score' in item)).toBe(false)
  })

  it.each([
    [FINDING_THRESHOLDS.largeLeapRateHigh - 0.01, false],
    [FINDING_THRESHOLDS.largeLeapRateHigh, true],
    [FINDING_THRESHOLDS.largeLeapRateHigh + 0.01, true],
  ])('pins the inclusive large-leap boundary at %s', (largeLeapRate, expected) => {
    const normalized = melodyFor([60, 72, 60, 72, 60, 72, 60, 72, 60])
    const metrics = analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: false,
      sameSeedDeterminism: true,
    })
    metrics.pitch.largeLeapRate = {
      status: 'measured',
      confidence: 'high',
      rationale: 'boundary test',
      value: largeLeapRate,
    }
    const codes = deriveFindings({ normalized, metrics, validationChecks: [] })
      .map((item) => item.code)
    expect(codes.includes('PITCH.LARGE_LEAP_RATE_HIGH')).toBe(expected)
  })

  it('classifies contract, high-confidence risk, observation, and abstention separately', () => {
    expect(resultCategoryFor([])).toBe('abstain-no-finding')
    const constant = findingsFor(melodyFor(Array<number>(12).fill(60)))
    expect(resultCategoryFor(constant)).toBe('high-confidence-structural-risk')

    const normalized = melodyFor([60, 62, 64, 67, 69, 72, 74, 76])
    const metrics = analyzeMetrics(normalized, {
      schemaValid: false,
      scheduleCompatible: true,
      sameSeedDeterminism: true,
    })
    const contract = deriveFindings({ normalized, metrics, validationChecks: [] })
    expect(resultCategoryFor(contract)).toBe('hard-contract-violation')
  })

  it('downgrades a constant pitch when the declared source contour is flat', () => {
    const normalized = melodyFor(Array<number>(12).fill(60))
    const metrics = analyzeMetrics(normalized, {
      schemaValid: true,
      scheduleCompatible: true,
      sameSeedDeterminism: true,
    })
    const findings = deriveFindings({
      normalized,
      metrics,
      validationChecks: [],
      expectations: {
        presentedOrders: Array.from({ length: 12 }, (_, index) => index + 1),
        selectionDirections: Array<'right'>(12).fill('right'),
        contourPositions: Array<number>(12).fill(0.5),
      },
    })
    expect(findings.find((item) => item.code === 'PITCH.CONSTANT')).toMatchObject({
      category: 'VALID_BUT_UNUSUAL_OUTPUT',
      severity: 'low',
    })
  })

  it.each([
    ['same ascending direction', [0, 1, 2, 3, 4, 5, 6, 7], 'low'],
    ['opposite descending direction', [7, 6, 5, 4, 3, 2, 1, 0], 'high'],
    ['flat source', [0, 0, 0, 0, 0, 0, 0, 0], 'high'],
  ] as const)(
    'uses independent source direction for a monotonic %s classification',
    (_, contourPositions, expectedSeverity) => {
      const normalized = melodyFor([60, 62, 64, 65, 67, 69, 71, 72])
      const metrics = analyzeMetrics(normalized, {
        schemaValid: true,
        scheduleCompatible: true,
        sameSeedDeterminism: true,
      })
      const findings = deriveFindings({
        normalized,
        metrics,
        validationChecks: [],
        expectations: {
          presentedOrders: normalized.events.map((_, index) => index + 1),
          selectionDirections: normalized.events.map(() => 'right'),
          contourPositions,
        },
      })
      expect(findings.find((item) => item.code === 'PITCH.MONOTONIC')?.severity)
        .toBe(expectedSeverity)
    },
  )

  it('downgrades register-edge concentration explained by a low-span edge contour', () => {
    const normalized = melodyFor([60, 62, 60, 62, 60, 62, 60, 62])
    const metrics = analyzeMetrics(normalized, {
      schemaValid: true,
      scheduleCompatible: true,
      sameSeedDeterminism: true,
    })
    const findings = deriveFindings({
      normalized,
      metrics,
      validationChecks: [],
      expectations: {
        presentedOrders: normalized.events.map((_, index) => index + 1),
        selectionDirections: normalized.events.map(() => 'right'),
        contourPositions: normalized.events.map(() => 0.1),
      },
    })
    expect(findings.find((item) => item.code === 'PITCH.REGISTER_EDGE_TRAP'))
      .toMatchObject({ category: 'VALID_BUT_UNUSUAL_OUTPUT', severity: 'low' })
  })

  it('turns an adapter inspection failure into a hard schema finding', () => {
    const normalized = melodyFor([60, 62, 64, 65, 67, 69, 71, 72])
    const findings = deriveFindings({
      normalized: null,
      metrics: analyzeMetrics(normalized, {
        schemaValid: null,
        scheduleCompatible: null,
      }),
      validationChecks: [{
        id: 'ADAPTER_OUTPUT_INSPECTION',
        scope: 'schema',
        passed: false,
        message: 'not inspectable',
      }],
    })
    expect(findings).toContainEqual(expect.objectContaining({
      code: 'CONTRACT.SCHEMA_INVALID',
      resultCategory: 'hard-contract-violation',
    }))
  })
})
