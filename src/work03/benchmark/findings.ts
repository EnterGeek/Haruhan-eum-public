import { compareCanonicalStrings } from './canonical'
import type {
  BenchmarkExpectations,
  BenchmarkMetrics,
  Finding,
  FindingCategory,
  FindingSeverity,
  MetricObservation,
  NormalizedMelody,
  ResultCategory,
  ValidationCheck,
} from './types'
import { MAX_BENCHMARK_EVENTS } from './validation'

export const FINDING_THRESHOLDS = Object.freeze({
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

interface DeriveFindingsOptions {
  metrics: BenchmarkMetrics
  normalized: NormalizedMelody | null
  validationChecks: readonly ValidationCheck[]
  expectations?: BenchmarkExpectations
}

const valueOf = <T>(observation: MetricObservation<T>): T | undefined =>
  observation.status === 'measured' ? observation.value : undefined

const finding = (
  code: string,
  category: FindingCategory,
  severity: FindingSeverity,
  resultCategory: Exclude<ResultCategory, 'abstain-no-finding'>,
  rationale: string,
  evidence: Finding['evidence'],
): Finding => ({ code, category, severity, resultCategory, rationale, evidence })

const contourSpan = (expectations?: BenchmarkExpectations): number | null => {
  const values = expectations?.contourPositions
  if (!values || values.length === 0 || values.length > MAX_BENCHMARK_EVENTS) {
    return null
  }
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    minimum = Math.min(minimum, value)
    maximum = Math.max(maximum, value)
  }
  return minimum === Number.POSITIVE_INFINITY ? null : maximum - minimum
}

const monotonicDirection = (
  values: readonly number[] | undefined,
): -1 | 0 | 1 | null => {
  if (!values || values.length < 2 || values.length > MAX_BENCHMARK_EVENTS) return null
  let sawPositive = false
  let sawNegative = false
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1]
    if (!Number.isFinite(delta)) return null
    if (delta > 1e-9) sawPositive = true
    if (delta < -1e-9) sawNegative = true
    if (sawPositive && sawNegative) return null
  }
  return sawPositive ? 1 : sawNegative ? -1 : 0
}

const expectedContourExplainsEdgeConcentration = (
  expectations?: BenchmarkExpectations,
): boolean => {
  const values = expectations?.contourPositions
  if (!values || values.length === 0 || values.length > MAX_BENCHMARK_EVENTS) {
    return false
  }
  const finite = values.filter(Number.isFinite)
  if (finite.length !== values.length) return false
  const span = contourSpan(expectations)
  const edgeShare = finite.filter((value) =>
    value <= FINDING_THRESHOLDS.expectedEdgeBand ||
    value >= 1 - FINDING_THRESHOLDS.expectedEdgeBand).length / finite.length
  return span !== null &&
    span <= FINDING_THRESHOLDS.expectedEdgeMaximumSpan &&
    edgeShare >= FINDING_THRESHOLDS.expectedEdgeShare
}

const contractFinding = (
  code: string,
  rationale: string,
  evidence: Finding['evidence'],
): Finding => finding(
  code,
  'CONTRACT_FAILURE',
  'critical',
  'hard-contract-violation',
  rationale,
  evidence,
)

export function deriveFindings(options: DeriveFindingsOptions): readonly Finding[] {
  const { expectations, metrics, normalized, validationChecks } = options
  const byCode = new Map<string, Finding>()
  const add = (item: Finding): void => {
    if (!byCode.has(item.code)) byCode.set(item.code, item)
  }

  const validityRules: readonly [
    MetricObservation<boolean>,
    string,
    string,
  ][] = [
    [metrics.validity.schemaValidity, 'CONTRACT.SCHEMA_INVALID',
      'The generator-specific output contract rejected the output.'],
    [metrics.validity.finiteNumbers, 'CONTRACT.NON_FINITE_NUMBER',
      'At least one required numeric value is not finite.'],
    [metrics.validity.durationValidity, 'CONTRACT.DURATION_INVALID',
      'At least one duration is invalid for the declared output contract.'],
    [metrics.validity.totalBeatConsistency, 'CONTRACT.TOTAL_BEATS_MISMATCH',
      'The event timeline is not contiguous through the declared total beats.'],
    [metrics.validity.noteBounds, 'CONTRACT.NOTE_OUT_OF_BOUNDS',
      'At least one note is outside the declared register.'],
    [metrics.validity.scheduleCompatibility, 'CONTRACT.SCHEDULE_INCOMPATIBLE',
      'The generator-specific audio schedule adapter rejected the output.'],
  ]
  validityRules.forEach(([metric, code, rationale]) => {
    if (valueOf(metric) === false) add(contractFinding(code, rationale, { metric: code }))
  })

  const failedChecks = validationChecks.filter(
    (check) => !check.passed && check.available !== false,
  )
  const checkFindingCodes: Readonly<Record<string, [string, string]>> = {
    SCHEMA_VALIDITY: [
      'CONTRACT.SCHEMA_INVALID',
      'The benchmark-owned normalized output schema is invalid or exceeds its traversal bound.',
    ],
    FINITE_NUMBERS: [
      'CONTRACT.NON_FINITE_NUMBER',
      'The benchmark-owned numeric scan found a non-finite value.',
    ],
    DURATION_VALIDITY: [
      'CONTRACT.DURATION_INVALID',
      'The benchmark-owned duration scan found an invalid duration.',
    ],
    TOTAL_BEATS: [
      'CONTRACT.TOTAL_BEATS_MISMATCH',
      'The benchmark-owned timeline scan found a gap, overlap, or wrong ending.',
    ],
    NOTE_BOUNDS: [
      'CONTRACT.NOTE_OUT_OF_BOUNDS',
      'The benchmark-owned note scan found a pitch outside the declared register.',
    ],
    ADAPTER_OUTPUT_INSPECTION: [
      'CONTRACT.SCHEMA_INVALID',
      'The adapter could not produce the bounded normalized view required by the benchmark.',
    ],
    ADAPTER_REPEAT_INSPECTION: [
      'CONTRACT.SCHEMA_INVALID',
      'The adapter could not inspect the same-seed repeat output.',
    ],
    OUTPUT_SNAPSHOT: [
      'CONTRACT.SCHEMA_INVALID',
      'The output could not be isolated as bounded structured data.',
    ],
    BENCHMARK_NORMALIZED_VALIDATION: [
      'CONTRACT.SCHEMA_INVALID',
      'The benchmark could not safely validate the normalized output view.',
    ],
    ADAPTER_OUTPUT_VALIDATION: [
      'CONTRACT.ADAPTER_CONTRACT_INVALID',
      'The generator adapter did not return a bounded validation result.',
    ],
  }
  failedChecks.forEach((check) => {
    const mapped = checkFindingCodes[check.id]
    if (mapped) add(contractFinding(mapped[0], mapped[1], { checkId: check.id }))
  })
  if (failedChecks.some((check) => check.scope === 'provenance')) {
    add(contractFinding(
      'CONTRACT.PROVENANCE_INVALID',
      'Output provenance is incomplete, malformed, or disagrees with the evaluated input.',
      { checkId: 'PROVENANCE' },
    ))
  }
  if (failedChecks.some((check) => check.scope === 'adapter-contract')) {
    add(contractFinding(
      'CONTRACT.ADAPTER_CONTRACT_INVALID',
      'The output failed the generator-specific native adapter contract.',
      { checkId: 'ADAPTER_CONTRACT' },
    ))
  }
  const primaryGeneratorFailure = failedChecks.find(
    (check) => check.id === 'GENERATOR_COMPLETED',
  )
  if (primaryGeneratorFailure) {
    const timedOut = primaryGeneratorFailure.message.includes('asynchronous timeout')
    add(contractFinding(
      timedOut ? 'CONTRACT.GENERATOR_TIMEOUT' : 'CONTRACT.GENERATOR_THROW',
      timedOut
        ? 'The generator did not resolve within the bounded asynchronous timeout.'
        : 'The generator did not return an inspectable output.',
      { checkId: 'GENERATOR_COMPLETED' },
    ))
  }
  const repeatGeneratorFailure = failedChecks.find(
    (check) => check.id === 'GENERATOR_REPEAT_COMPLETED',
  )
  if (repeatGeneratorFailure) {
    const timedOut = repeatGeneratorFailure.message.includes('asynchronous timeout')
    add(contractFinding(
      timedOut ? 'CONTRACT.REPEAT_TIMEOUT' : 'CONTRACT.REPEAT_THROW',
      timedOut
        ? 'The same-seed repeat did not resolve within the bounded asynchronous timeout.'
        : 'The same-seed repeat call did not return an inspectable output.',
      { checkId: 'GENERATOR_REPEAT_COMPLETED' },
    ))
  }
  if (failedChecks.some((check) => check.id === 'ADAPTER_SESSION_SNAPSHOT')) {
    add(contractFinding(
      'CONTRACT.SESSION_NOT_CLONEABLE',
      'The input session is not structured-cloneable benchmark data.',
      { checkId: 'ADAPTER_SESSION_SNAPSHOT' },
    ))
  }
  if (failedChecks.some((check) =>
    check.id === 'OUTPUT_CANONICALIZATION' ||
    check.id === 'REPEAT_OUTPUT_CANONICALIZATION')) {
    add(finding(
      'METRIC.DETERMINISM_UNAVAILABLE',
      'METRIC_UNCERTAINTY',
      'info',
      'low-confidence-structural-observation',
      'Same-seed comparison was unavailable because an output exceeded the bounded canonical data contract.',
      { checkId: 'OUTPUT_CANONICALIZATION' },
    ))
  }
  if (failedChecks.some((check) => check.id === 'METRIC_ANALYSIS')) {
    add(finding(
      'METRIC.ANALYSIS_UNAVAILABLE',
      'METRIC_UNCERTAINTY',
      'info',
      'low-confidence-structural-observation',
      'One or more independent metrics could not be computed safely.',
      { checkId: 'METRIC_ANALYSIS' },
    ))
  }
  if (failedChecks.some((check) =>
    check.id === 'PERTURBATION_PREPARATION' ||
    check.id === 'PERTURBATION_COMPLETED')) {
    add(finding(
      'METRIC.PERTURBATION_UNAVAILABLE',
      'METRIC_UNCERTAINTY',
      'info',
      'low-confidence-structural-observation',
      'The adapter-declared perturbation pass could not be measured safely.',
      { checkId: 'PERTURBATION_COMPLETED' },
    ))
  }
  if (validationChecks.some((check) =>
    check.scope === 'schedule' && check.available === false)) {
    add(finding(
      'METRIC.SCHEDULE_VALIDATION_UNAVAILABLE',
      'METRIC_UNCERTAINTY',
      'info',
      'low-confidence-structural-observation',
      'The adapter declared schedule validation unavailable for this output.',
      { checkId: 'SCHEDULE_UNAVAILABLE' },
    ))
  }

  if (
    normalized !== null &&
    Array.isArray(normalized.events) &&
    normalized.events.length <= MAX_BENCHMARK_EVENTS
  ) {
    const notes = normalized.events.filter(
      (event): event is Extract<typeof event, { kind: 'note' }> => event.kind === 'note',
    )
    const pitches = notes.map((note) => note.midiNote).filter(Number.isFinite)
    const intervals = pitches.slice(1).map((pitch, index) => pitch - pitches[index])
    const nonZeroIntervals = intervals.filter((interval) => interval !== 0)
    const expectedContourSpan = contourSpan(expectations)

    const diversity = valueOf(metrics.pitch.pitchClassDiversity)
    const uniquePitches = new Set(pitches).size
    if (
      pitches.length >= FINDING_THRESHOLDS.minimumNotesForPattern &&
      diversity !== undefined &&
      uniquePitches === 1
    ) {
      const expectedFlat = expectedContourSpan !== null && expectedContourSpan <= 1e-9
      add(finding(
        'PITCH.CONSTANT',
        expectedFlat ? 'VALID_BUT_UNUSUAL_OUTPUT' : 'STRUCTURAL_MUSICAL_RISK',
        expectedFlat ? 'low' : 'high',
        expectedFlat
          ? 'low-confidence-structural-observation'
          : 'high-confidence-structural-risk',
        expectedFlat
          ? 'Pitch is constant, but the declared source contour is also flat.'
          : 'At least eight notes collapse to one absolute pitch despite a non-flat or unknown source contour.',
        {
          noteCount: pitches.length,
          pitchClassDiversity: diversity,
          uniquePitches,
          expectedContourSpan,
        },
      ))
    }

    if (nonZeroIntervals.length >= FINDING_THRESHOLDS.minimumNonZeroIntervalsForMonotony) {
      const positiveShare = nonZeroIntervals.filter((interval) => interval > 0).length /
        nonZeroIntervals.length
      const directionShare = Math.max(positiveShare, 1 - positiveShare)
      if (directionShare >= FINDING_THRESHOLDS.monotonicDirectionShare) {
        const outputDirection = positiveShare >= 0.5 ? 1 : -1
        const expectedDirection = monotonicDirection(expectations?.contourPositions)
        const sourceAligned = expectedDirection !== null &&
          expectedDirection !== 0 && expectedDirection === outputDirection
        add(finding(
          'PITCH.MONOTONIC',
          sourceAligned ? 'VALID_BUT_UNUSUAL_OUTPUT' : 'STRUCTURAL_MUSICAL_RISK',
          sourceAligned ? 'low' : 'high',
          sourceAligned
            ? 'low-confidence-structural-observation'
            : 'high-confidence-structural-risk',
          sourceAligned
            ? 'The pitch path is monotonic in the same non-zero direction as the declared contour.'
            : 'At least 90% of six or more non-zero intervals move in one direction.',
          {
            directionShare,
            expectedDirection,
            nonZeroIntervalCount: nonZeroIntervals.length,
            outputDirection,
          },
        ))
      }
    }

    if (intervals.length >= FINDING_THRESHOLDS.minimumNotesForPattern) {
      const octaveShare = intervals.filter((interval) => Math.abs(interval) === 12).length /
        intervals.length
      const nonZeroSigns = nonZeroIntervals.map((interval) => Math.sign(interval))
      const alternatingShare = nonZeroSigns.length < 2
        ? 0
        : nonZeroSigns.slice(1).filter(
            (sign, index) => sign === -nonZeroSigns[index],
          ).length / (nonZeroSigns.length - 1)
      if (
        octaveShare >= FINDING_THRESHOLDS.octavePingPongShare &&
        alternatingShare >= FINDING_THRESHOLDS.octavePingPongShare
      ) {
        add(finding(
          'PITCH.OCTAVE_PING_PONG',
          'REGISTER_RHYTHM_PATHOLOGY',
          'high',
          'high-confidence-structural-risk',
          'Octave-sized intervals dominate and repeatedly alternate direction.',
          { octaveShare, alternatingShare },
        ))
      }
    }

    const largeLeapRate = valueOf(metrics.pitch.largeLeapRate)
    if (
      largeLeapRate !== undefined &&
      largeLeapRate >= FINDING_THRESHOLDS.largeLeapRateHigh
    ) {
      add(finding(
        'PITCH.LARGE_LEAP_RATE_HIGH',
        'REGISTER_RHYTHM_PATHOLOGY',
        'high',
        'high-confidence-structural-risk',
        'At least half of consecutive pitch intervals exceed the declared leap limit.',
        { largeLeapRate },
      ))
    }

    const unresolvedLeapRate = valueOf(metrics.pitch.unresolvedLeapRate)
    if (
      unresolvedLeapRate !== undefined &&
      unresolvedLeapRate >= FINDING_THRESHOLDS.unresolvedLeapRateHigh
    ) {
      add(finding(
        'PITCH.UNRESOLVED_LEAP_RATE_HIGH',
        'STRUCTURAL_MUSICAL_RISK',
        'high',
        'high-confidence-structural-risk',
        'At least 75% of large leaps lack the declared immediate contrary-step proxy.',
        { unresolvedLeapRate },
      ))
    }

    const repeatedRun = valueOf(metrics.pitch.repeatedNoteRunLength)
    if (repeatedRun !== undefined && repeatedRun >= FINDING_THRESHOLDS.repeatedNoteRun) {
      add(finding(
        'PITCH.REPEATED_NOTE_RUN',
        'REPETITION_MONOTONY',
        'high',
        'high-confidence-structural-risk',
        'Eight or more equal-pitch notes occur consecutively without a rest.',
        { repeatedNoteRunLength: repeatedRun },
      ))
    }

    const edgeOccupancy = valueOf(metrics.pitch.edgeOccupancy)
    const registerUtilization = valueOf(metrics.pitch.registerUtilization)
    if (
      pitches.length >= FINDING_THRESHOLDS.minimumNotesForPattern &&
      edgeOccupancy !== undefined &&
      registerUtilization !== undefined &&
      edgeOccupancy >= FINDING_THRESHOLDS.registerEdgeOccupancy &&
      registerUtilization <= FINDING_THRESHOLDS.registerUtilizationLow
    ) {
      const sourceExplained = expectedContourExplainsEdgeConcentration(expectations)
      add(finding(
        'PITCH.REGISTER_EDGE_TRAP',
        sourceExplained ? 'VALID_BUT_UNUSUAL_OUTPUT' : 'REGISTER_RHYTHM_PATHOLOGY',
        sourceExplained ? 'low' : 'high',
        sourceExplained
          ? 'low-confidence-structural-observation'
          : 'high-confidence-structural-risk',
        sourceExplained
          ? 'The edge concentration is consistent with an independently declared low-span edge contour.'
          : 'Notes remain concentrated near a register edge while using at most one quarter of the declared span.',
        { edgeOccupancy, registerUtilization, sourceExplained },
      ))
    }

    const restRatio = valueOf(metrics.rhythm.restRatio)
    if (
      restRatio === 0 &&
      expectations?.expectedRestRatio !== undefined &&
      expectations.expectedRestRatio > 0
    ) {
      add(finding(
        'RHYTHM.ZERO_RESTS',
        'STRUCTURAL_MUSICAL_RISK',
        'medium',
        'low-confidence-structural-observation',
        'The output has no rests although this adapter declares a non-zero expected rest share.',
        { expectedRestRatio: expectations.expectedRestRatio, restRatio },
      ))
    }
    if (restRatio !== undefined && restRatio >= FINDING_THRESHOLDS.restRatioHigh) {
      add(finding(
        'RHYTHM.REST_RATIO_HIGH',
        'REGISTER_RHYTHM_PATHOLOGY',
        'high',
        'high-confidence-structural-risk',
        'Rest events occupy at least three quarters of the observed timeline.',
        { restRatio },
      ))
    }

    const durationDiversity = valueOf(metrics.rhythm.durationDiversity)
    if (
      normalized.events.length >= FINDING_THRESHOLDS.minimumNotesForPattern &&
      durationDiversity !== undefined &&
      durationDiversity <= FINDING_THRESHOLDS.durationDiversityCollapsed
    ) {
      add(finding(
        'RHYTHM.DURATION_COLLAPSE',
        'VALID_BUT_UNUSUAL_OUTPUT',
        'low',
        'low-confidence-structural-observation',
        'Only one quarter or less of the declared duration vocabulary is used.',
        { durationDiversity, eventCount: normalized.events.length },
      ))
    }

    const cellRepetition = valueOf(metrics.rhythm.identicalCellRepetition)
    if (
      cellRepetition !== undefined &&
      cellRepetition >= FINDING_THRESHOLDS.identicalCellRepetitionHigh
    ) {
      add(finding(
        'RHYTHM.IDENTICAL_CELL_REPETITION_HIGH',
        'REPETITION_MONOTONY',
        'medium',
        'low-confidence-structural-observation',
        'At least three quarters of normalized one-beat cell repetitions are exact duplicates.',
        { identicalCellRepetition: cellRepetition },
      ))
    }

    const microNoteRate = valueOf(metrics.rhythm.microNoteRate)
    if (
      microNoteRate !== undefined &&
      microNoteRate >= FINDING_THRESHOLDS.microNoteRateHigh
    ) {
      add(finding(
        'RHYTHM.MICRO_NOTE_RATE_HIGH',
        'REGISTER_RHYTHM_PATHOLOGY',
        'high',
        'high-confidence-structural-risk',
        'At least half of events are shorter than 0.25 beats.',
        { microNoteRate, eventCount: normalized.events.length },
      ))
    }

    const exactCopyRatio = valueOf(metrics.form.exactCopyRatio)
    if (
      exactCopyRatio !== undefined &&
      exactCopyRatio >= FINDING_THRESHOLDS.exactCopyRatioHigh
    ) {
      add(finding(
        'FORM.EXACT_COPY_HIGH',
        'REPETITION_MONOTONY',
        'high',
        'high-confidence-structural-risk',
        'At least three quarters of eligible three-note windows are exact copies.',
        { exactCopyRatio },
      ))
    }

    const motifRecurrence = valueOf(metrics.form.motifRecurrence)
    if (
      pitches.length >= FINDING_THRESHOLDS.minimumNotesForPattern &&
      motifRecurrence === 0
    ) {
      add(finding(
        'FORM.NO_MOTIF_RECURRENCE',
        'VALID_BUT_UNUSUAL_OUTPUT',
        'low',
        'low-confidence-structural-observation',
        'No repeated transposition-invariant three-note motif class was observed.',
        { motifRecurrence, noteCount: pitches.length },
      ))
    }

    const contourAgreement = valueOf(metrics.form.contourAgreement)
    if (
      contourAgreement !== undefined &&
      expectedContourSpan !== null &&
      expectedContourSpan > 0 &&
      contourAgreement <= FINDING_THRESHOLDS.contourAgreementLow
    ) {
      add(finding(
        'FORM.CONTOUR_AGREEMENT_LOW',
        'STRUCTURAL_MUSICAL_RISK',
        'medium',
        'low-confidence-structural-observation',
        'Pitch direction agrees with source-contour direction for at most one third of adjacent notes.',
        { contourAgreement, expectedContourSpan },
      ))
    }
  }

  if (valueOf(metrics.robustness.sameSeedDeterminism) === false) {
    add(finding(
      'ROBUSTNESS.NONDETERMINISTIC',
      'STRUCTURAL_MUSICAL_RISK',
      'high',
      'high-confidence-structural-risk',
      'Two same-seed calls returned different canonical outputs.',
      { sameSeedDeterminism: false },
    ))
  }

  if (
    normalized !== null &&
    metrics.pitch.pitchClassDiversity.status === 'unavailable'
  ) {
    add(finding(
      'METRIC.PITCH_ANALYSIS_UNAVAILABLE',
      'METRIC_UNCERTAINTY',
      'info',
      'low-confidence-structural-observation',
      'Pitch-derived metrics could not be measured from this output.',
      { reason: metrics.pitch.pitchClassDiversity.rationale },
    ))
  }

  return [...byCode.values()].sort(
    (left, right) => compareCanonicalStrings(left.code, right.code),
  )
}

export function resultCategoryFor(findings: readonly Finding[]): ResultCategory {
  if (findings.some((item) => item.resultCategory === 'hard-contract-violation')) {
    return 'hard-contract-violation'
  }
  if (findings.some(
    (item) => item.resultCategory === 'high-confidence-structural-risk',
  )) {
    return 'high-confidence-structural-risk'
  }
  if (findings.length > 0) return 'low-confidence-structural-observation'
  return 'abstain-no-finding'
}
