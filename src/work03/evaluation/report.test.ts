import { describe, expect, it } from 'vitest'
import { GRAMMAR_PROFILE_IDS } from '../grammar/types'
import {
  WORK03_PUBLIC_FIXTURE_IDS,
  createWork03PublicFixtureInput,
  work03EvaluationSeed,
} from '../fixtures/publicFixtures'
import {
  WORK03_EVALUATION_METHODS,
  buildWork03StructuralEvaluationReport,
} from './report'

const report = buildWork03StructuralEvaluationReport()

const expectJsonSafe = (value: unknown, path = 'report'): void => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return
  }
  if (typeof value === 'number') {
    expect(Number.isFinite(value), path).toBe(true)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectJsonSafe(item, `${path}[${index}]`))
    return
  }
  expect(typeof value, path).toBe('object')
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    expect(item, `${path}.${key} must not be undefined`).not.toBeUndefined()
    expectJsonSafe(item, `${path}.${key}`)
  })
}

describe('Work 03 structural evaluation report matrix', () => {
  it('builds the exact frozen baseline, candidate, replay, and validation counts', () => {
    expect(report.counts).toEqual({
      fixtureCount: 16,
      methodCount: 3,
      profileCount: 6,
      baselineCount: 48,
      candidateCount: 288,
      candidateGenerationCount: 864,
      candidateValidationCount: 864,
      audioScheduleValidationCount: 864,
      inputMutationCheckCount: 1824,
      inputMutationFailureCount: 0,
    })
    expect(report.baselines).toHaveLength(48)
    expect(report.candidates).toHaveLength(288)
  })

  it('preserves deterministic cartesian ordering and the exact seed namespace', () => {
    const expectedBaselineKeys = WORK03_PUBLIC_FIXTURE_IDS.flatMap((fixtureId) =>
      WORK03_EVALUATION_METHODS.map((method) => `${fixtureId}|${method}`))
    const expectedCandidateKeys = WORK03_PUBLIC_FIXTURE_IDS.flatMap((fixtureId) =>
      WORK03_EVALUATION_METHODS.flatMap((method) =>
        GRAMMAR_PROFILE_IDS.map((profile) =>
          `${fixtureId}|${method}|${profile}`)))
    expect(report.baselines.map((row) => `${row.fixtureId}|${row.method}`))
      .toEqual(expectedBaselineKeys)
    expect(report.candidates.map((row) =>
      `${row.fixtureId}|${row.method}|${row.profile}`))
      .toEqual(expectedCandidateKeys)
    report.candidates.forEach((row) => {
      expect(row.seed).toBe(work03EvaluationSeed(
        row.fixtureId,
        row.method,
        row.profile,
      ))
      expect(row).toMatchObject({
        independentRunCount: 3,
        validatedRunCount: 3,
        audioScheduleValidationCount: 3,
        uniqueCanonicalRuns: 1,
      })
    })
  })

  it('keeps every baseline and candidate comparison view structurally valid', () => {
    report.baselines.forEach((row) => {
      expect(row.metrics).toMatchObject({
        phraseCount: 1,
        phraseLengthTicks: [24],
        motifLength: 0,
        motifRecurrenceCount: 0,
      })
    })
    report.candidates.forEach((row) => {
      expect(row.metrics.phraseCount).toBe(4)
      expect(row.metrics.phraseLengthTicks).toEqual([6, 6, 6, 6])
      expect(row.metrics.motifLength).toBeGreaterThanOrEqual(2)
      expect(row.metrics.motifLength).toBeLessThanOrEqual(5)
      expect(row.metrics.motifRecurrenceCount).toBe(3)
      expect(row.metrics.unresolvedLeapCount).toBe(0)
      expect(row.metrics.tonalCenterDrift).toBe(0)
      expect(row.metrics.registerUtilization).toBeGreaterThanOrEqual(0)
      expect(row.metrics.registerUtilization).toBeLessThanOrEqual(1)
      expect(row.metrics.longestEdgeRun).toBeLessThanOrEqual(2)
    })
  })

  it('records all documented hard gates as executed passes', () => {
    expect(report.hardGates.map((gate) => gate.id)).toEqual([
      'OUTPUT_VALIDITY',
      'IDENTICAL_RUN_DETERMINISM',
      'PUBLIC_PRIVATE_BOUNDARY',
      'WORK02_SNAPSHOT_BEHAVIOR',
      'AUDIO_ADAPTER_CONTRACT',
    ])
    expect(report.hardGates.every((gate) => gate.passed)).toBe(true)
    expect(report.hardGates.every((gate) => gate.failedChecks === 0)).toBe(true)
    expect(report.hardGates.map((gate) => gate.evaluatedChecks)).toEqual([
      2688,
      288,
      17,
      48,
      864,
    ])
  })

  it('uses only the exact repository public fixture surface', () => {
    expect(report.sourcePolicy).toEqual({
      fixtureIds: WORK03_PUBLIC_FIXTURE_IDS,
      usesOnlyRepositoryPublicFixtures: true,
      consumesRawSessionMetadata: false,
      usesExternalIo: false,
    })
    expect(new Set(report.sourcePolicy.fixtureIds).size).toBe(16)
  })
})

describe('Work 03 deterministic aggregate and hypothesis verdict', () => {
  it('builds one ordered 48-candidate aggregate row for every profile', () => {
    expect(report.profileTable.map((row) => row.profile)).toEqual(
      GRAMMAR_PROFILE_IDS,
    )
    report.profileTable.forEach((row) => {
      expect(row.candidateCount).toBe(48)
      expect(row.validatedRunCount).toBe(144)
      expect(row.audioScheduleValidationCount).toBe(144)
      expect(row.deterministicCandidateCount).toBe(48)
      Object.entries(row.metrics).forEach(([key, aggregate]) => {
        expect(Number.isFinite(aggregate.minimum), key).toBe(true)
        expect(Number.isFinite(aggregate.maximum), key).toBe(true)
        expect(Number.isFinite(aggregate.mean), key).toBe(true)
        expect(aggregate.minimum, key).toBeLessThanOrEqual(aggregate.mean)
        expect(aggregate.mean, key).toBeLessThanOrEqual(aggregate.maximum)
      })
      Object.values(row.meanDeltaFromBaseline).forEach((value) => {
        expect(Number.isFinite(value)).toBe(true)
      })
    })
    expect(Object.keys(report.baselineMetrics)).toHaveLength(25)
  })

  it('retains the intended sparse, dense, and cadence separations in aggregates', () => {
    const profiles = Object.fromEntries(report.profileTable.map((row) => [
      row.profile,
      row,
    ]))
    expect(profiles.CALM_SPARSE.metrics.restRatio.minimum).toBeGreaterThan(
      profiles.PULSING.metrics.restRatio.maximum,
    )
    expect(profiles.PULSING.metrics.eventDensity.minimum).toBeGreaterThan(
      profiles.CALM_SPARSE.metrics.eventDensity.maximum,
    )
    expect(profiles.RESOLVED.metrics.finalStability).toEqual({
      minimum: 1,
      maximum: 1,
      mean: 1,
    })
    expect(profiles.OPEN_ENDED.metrics.finalStability.maximum).toBeLessThan(1)
  })

  it('locks H1-H6 as passes and the documented H7 contour result as a failure', () => {
    expect(report.hypotheses.map((item) => [
      item.id,
      item.passed,
      item.failedConditions,
      item.evaluatedConditions,
    ])).toEqual([
      ['H1', true, 0, 336],
      ['H2', true, 0, 336],
      ['H3', true, 0, 30],
      ['H4', true, 0, 289],
      ['H5', true, 0, 144],
      ['H6', true, 0, 96],
      ['H7', false, 234, 288],
    ])
    const h7 = report.hypotheses[6]
    expect(h7.failureExamples).toHaveLength(12)
    expect(h7.failureExamples.every((failure) =>
      failure.code.includes('CONTOUR'))).toBe(true)
  })

  it('returns the pre-registered MIXED and production-NO verdict', () => {
    expect(report.verdict).toEqual({
      hardGatesPassed: true,
      hypothesesPassed: 6,
      hypothesesTotal: 7,
      musicalStructureImproved: 'MIXED',
      productionReplacementRecommended: 'NO',
    })
    expect(report.notes).toContain(
      'No profile-specific register-utilization bands were numerically pre-registered; H7 therefore checks only the metric contract range [0,1] and the frozen maximum edge run of 2.',
    )
  })
})

describe('Work 03 report replay and input safety', () => {
  it('performs and passes every before/after input mutation check', () => {
    expect(report.counts.inputMutationCheckCount).toBe(1824)
    expect(report.counts.inputMutationFailureCount).toBe(0)

    const fixtureInputs = WORK03_PUBLIC_FIXTURE_IDS.map((fixtureId) =>
      createWork03PublicFixtureInput(fixtureId))
    const before = structuredClone(fixtureInputs)
    buildWork03StructuralEvaluationReport()
    expect(fixtureInputs).toEqual(before)
  })

  it('is replay-deterministic and entirely JSON-safe', () => {
    const replay = buildWork03StructuralEvaluationReport()
    expect(replay).toEqual(report)
    expect(JSON.stringify(replay)).toBe(JSON.stringify(report))
    expectJsonSafe(report)
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })
})
