import { createWork03AudioSchedule } from '../audio/adapter'
import { validateWork03AudioSchedule } from '../audio/validateSchedule'
import {
  WORK03_PUBLIC_FIXTURE_IDS,
  createWork03PublicFixtureInput,
  work03EvaluationSeed,
  type Work03PublicFixtureId,
} from '../fixtures/publicFixtures'
import { generateGrammarV1 } from '../grammar/generator'
import {
  GRAMMAR_PROFILE_IDS,
  type GrammarProfileId,
} from '../grammar/types'
import { validateGrammarV1Result } from '../grammar/validateOutput'
import { interpretFlow } from '../../work02/interpretation/interpretFlow'
import type { InterpretationMethod } from '../../work02/interpretation/types'
import { generateMelody } from '../../work02/music/generator'
import { validateMelodyOutput } from '../../work02/music/validateMelody'
import {
  MELODY_GENERATOR_VERSION,
  MELODY_OUTPUT_CONTRACT_VERSION,
  MUSIC_GRAMMAR_VERSION,
} from '../../work02/versions'
import {
  WORK03_MUSIC_GRAMMAR_VERSION,
  WORK03_STRUCTURAL_EVALUATION_VERSION,
  WORK03_STRUCTURAL_METRICS_VERSION,
} from '../versions'
import {
  countUniqueCanonicalRuns,
  measureGrammarV1Structure,
  measureWork02BaselineStructure,
} from './metrics'
import type { StructuralMetrics } from './types'

export const WORK03_EVALUATION_METHODS: readonly InterpretationMethod[] =
  Object.freeze(['absolute-hue', 'relative-hue', 'hybrid'])

const PROTOCOL_FIXTURE_IDS: readonly Work03PublicFixtureId[] = [
  'same-deck-baseline',
  'all-left-fast-buttons',
  'all-right-same-deck-replay',
  'undo-and-reselect',
  'swipe-only',
  'mixed-button-and-swipe',
  'pause-and-resume',
  'asc-right',
  'desc-left',
  'wrap-alternating',
  'constant-blocks',
  'antipodal',
  'narrow-wrap',
  'irregular',
  'sparse-direction',
  'dense-direction',
]

export type Work03HardGateId =
  | 'OUTPUT_VALIDITY'
  | 'IDENTICAL_RUN_DETERMINISM'
  | 'PUBLIC_PRIVATE_BOUNDARY'
  | 'WORK02_SNAPSHOT_BEHAVIOR'
  | 'AUDIO_ADAPTER_CONTRACT'

export type Work03HypothesisId = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7'
export type Work03StructureVerdict = 'SUPPORTED' | 'MIXED' | 'NOT_SUPPORTED'

type NumericMetricKey = Exclude<
  keyof StructuralMetrics,
  'version' | 'phraseLengthTicks'
>

const NUMERIC_METRIC_KEYS: readonly NumericMetricKey[] = [
  'pitchClassDiversityCount',
  'pitchClassDiversityRatio',
  'exactRepetitionRatio',
  'motifLength',
  'motifRecurrenceCount',
  'rhythmicDiversityCount',
  'rhythmicEntropy',
  'restRatio',
  'phraseCount',
  'phraseLengthMinimumTicks',
  'phraseLengthMaximumTicks',
  'phraseLengthMeanTicks',
  'largeLeapCount',
  'unresolvedLeapCount',
  'registerUtilization',
  'edgeHitRatio',
  'longestEdgeRun',
  'contourAgreement',
  'eligibleContourComparisons',
  'finalStability',
  'eventDensity',
  'soundingRatio',
  'tonalCenterDrift',
  'pitchClassEntropy',
  'intervalDirectionEntropy',
]

export interface MetricAggregate {
  minimum: number
  maximum: number
  mean: number
}

export type StructuralMetricAggregateTable = Readonly<
  Record<NumericMetricKey, Readonly<MetricAggregate>>
>

export interface Work02BaselineEvaluationRow {
  fixtureId: Work03PublicFixtureId
  method: InterpretationMethod
  metrics: Readonly<StructuralMetrics>
}

export interface Work03CandidateEvaluationRow {
  fixtureId: Work03PublicFixtureId
  method: InterpretationMethod
  profile: GrammarProfileId
  seed: string
  independentRunCount: 3
  validatedRunCount: 3
  audioScheduleValidationCount: 3
  uniqueCanonicalRuns: number
  metrics: Readonly<StructuralMetrics>
}

export interface Work03ProfileAggregateRow {
  profile: GrammarProfileId
  candidateCount: number
  validatedRunCount: number
  audioScheduleValidationCount: number
  deterministicCandidateCount: number
  metrics: StructuralMetricAggregateTable
  meanDeltaFromBaseline: Readonly<Record<NumericMetricKey, number>>
}

export interface EvaluationFailureExample {
  fixtureId: string
  method: string
  profile: string
  code: string
  actual: number
  expected: string
}

export interface Work03HardGateResult {
  id: Work03HardGateId
  passed: boolean
  evaluatedChecks: number
  failedChecks: number
  evidence: string
}

export interface Work03HypothesisResult {
  id: Work03HypothesisId
  name: string
  passed: boolean
  evaluatedConditions: number
  failedConditions: number
  summary: string
  failureExamples: readonly EvaluationFailureExample[]
}

export interface Work03StructuralEvaluationReport {
  versions: Readonly<{
    evaluation: typeof WORK03_STRUCTURAL_EVALUATION_VERSION
    metrics: typeof WORK03_STRUCTURAL_METRICS_VERSION
    grammar: typeof WORK03_MUSIC_GRAMMAR_VERSION
    baselineOutput: typeof MELODY_OUTPUT_CONTRACT_VERSION
    baselineGrammar: typeof MUSIC_GRAMMAR_VERSION
    baselineGenerator: typeof MELODY_GENERATOR_VERSION
  }>
  counts: Readonly<{
    fixtureCount: number
    methodCount: number
    profileCount: number
    baselineCount: number
    candidateCount: number
    candidateGenerationCount: number
    candidateValidationCount: number
    audioScheduleValidationCount: number
    inputMutationCheckCount: number
    inputMutationFailureCount: number
  }>
  sourcePolicy: Readonly<{
    fixtureIds: readonly Work03PublicFixtureId[]
    usesOnlyRepositoryPublicFixtures: boolean
    consumesRawSessionMetadata: false
    usesExternalIo: false
  }>
  baselines: readonly Work02BaselineEvaluationRow[]
  candidates: readonly Work03CandidateEvaluationRow[]
  baselineMetrics: StructuralMetricAggregateTable
  profileTable: readonly Work03ProfileAggregateRow[]
  hardGates: readonly Work03HardGateResult[]
  hypotheses: readonly Work03HypothesisResult[]
  verdict: Readonly<{
    hardGatesPassed: boolean
    hypothesesPassed: number
    hypothesesTotal: 7
    musicalStructureImproved: Work03StructureVerdict
    productionReplacementRecommended: 'NO'
  }>
  notes: readonly string[]
}

interface HypothesisCondition {
  passed: boolean
  failure: EvaluationFailureExample
}

const roundSix = (value: number): number =>
  Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000

const rowKey = (
  fixtureId: Work03PublicFixtureId,
  method: InterpretationMethod,
): string => `${fixtureId}|${method}`

const candidateKey = (
  fixtureId: Work03PublicFixtureId,
  method: InterpretationMethod,
  profile: GrammarProfileId,
): string => `${fixtureId}|${method}|${profile}`

const exactKeys = (value: object, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
}

const isRepositoryPublicInput = (
  input: ReturnType<typeof createWork03PublicFixtureInput>,
): boolean => input.length === 12 && input.every((item, index) =>
  exactKeys(item, ['index', 'cardId', 'color', 'direction']) &&
  exactKeys(item.color, ['hue', 'lightness', 'chroma']) &&
  item.index === index + 1 &&
  typeof item.cardId === 'string' && item.cardId.length > 0 &&
  Number.isFinite(item.color.hue) &&
  Number.isFinite(item.color.lightness) &&
  Number.isFinite(item.color.chroma) &&
  (item.direction === 'left' || item.direction === 'right'))

const aggregateMetrics = (
  rows: readonly Readonly<StructuralMetrics>[],
): StructuralMetricAggregateTable => {
  if (rows.length === 0) {
    throw new RangeError('Structural metric aggregation requires at least one row.')
  }
  return Object.fromEntries(NUMERIC_METRIC_KEYS.map((key) => {
    const values = rows.map((metrics) => metrics[key])
    return [key, {
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      mean: roundSix(values.reduce((sum, value) => sum + value, 0) / values.length),
    }]
  })) as StructuralMetricAggregateTable
}

const condition = (
  passed: boolean,
  fixtureId: string,
  method: string,
  profile: string,
  code: string,
  actual: number,
  expected: string,
): HypothesisCondition => ({
  passed,
  failure: { fixtureId, method, profile, code, actual, expected },
})

const hypothesis = (
  id: Work03HypothesisId,
  name: string,
  summary: string,
  conditions: readonly HypothesisCondition[],
): Work03HypothesisResult => {
  const failures = conditions.filter((item) => !item.passed)
  return {
    id,
    name,
    passed: failures.length === 0,
    evaluatedConditions: conditions.length,
    failedConditions: failures.length,
    summary,
    failureExamples: failures.slice(0, 12).map((item) => item.failure),
  }
}

const evaluateHypotheses = (
  baselines: readonly Work02BaselineEvaluationRow[],
  candidates: readonly Work03CandidateEvaluationRow[],
): readonly Work03HypothesisResult[] => {
  const baselinesByPair = new Map(baselines.map((row) => [
    rowKey(row.fixtureId, row.method),
    row,
  ]))
  const candidatesByKey = new Map(candidates.map((row) => [
    candidateKey(row.fixtureId, row.method, row.profile),
    row,
  ]))
  const candidateFor = (
    fixtureId: Work03PublicFixtureId,
    method: InterpretationMethod,
    profile: GrammarProfileId,
  ): Work03CandidateEvaluationRow => candidatesByKey.get(
    candidateKey(fixtureId, method, profile),
  ) as Work03CandidateEvaluationRow

  const h1Conditions: HypothesisCondition[] = [
    ...baselines.map((row) => condition(
      row.metrics.phraseCount === 1 &&
        row.metrics.phraseLengthTicks.length === 1 &&
        row.metrics.phraseLengthTicks[0] === 24,
      row.fixtureId,
      row.method,
      'WORK02_BASELINE',
      'BASELINE_UNPLANNED_SPAN',
      row.metrics.phraseCount,
      'one 24-tick comparison span',
    )),
    ...candidates.map((row) => condition(
      row.metrics.phraseCount === 4 &&
        row.metrics.phraseLengthTicks.length === 4 &&
        row.metrics.phraseLengthTicks.every((ticks) => ticks === 6),
      row.fixtureId,
      row.method,
      row.profile,
      'FOUR_PHRASE_FORM',
      row.metrics.phraseCount,
      'four 6-tick phrases',
    )),
  ]

  const h2Conditions: HypothesisCondition[] = [
    ...baselines.map((row) => condition(
      row.metrics.motifLength === 0 && row.metrics.motifRecurrenceCount === 0,
      row.fixtureId,
      row.method,
      'WORK02_BASELINE',
      'BASELINE_HAS_NO_PLANNED_MOTIF',
      row.metrics.motifRecurrenceCount,
      '0 planned recurrences',
    )),
    ...candidates.map((row) => condition(
      row.metrics.motifLength >= 2 && row.metrics.motifLength <= 5 &&
        row.metrics.motifRecurrenceCount >= 1 &&
        row.metrics.motifRecurrenceCount <= 3,
      row.fixtureId,
      row.method,
      row.profile,
      'BOUNDED_MOTIF_RECURRENCE',
      row.metrics.motifRecurrenceCount,
      'motif length 2-5 and recurrence count 1-3',
    )),
  ]

  const h3Fixtures = new Set<Work03PublicFixtureId>([
    'asc-right',
    'constant-blocks',
    'sparse-direction',
    'dense-direction',
  ])
  const h3Profiles = new Set<GrammarProfileId>([
    'BALANCED_LYRICAL',
    'RESOLVED',
  ])
  const h3Conditions: HypothesisCondition[] = candidates
    .filter((row) => h3Fixtures.has(row.fixtureId) && h3Profiles.has(row.profile))
    .map((row) => condition(
      row.metrics.rhythmicDiversityCount >= 2,
      row.fixtureId,
      row.method,
      row.profile,
      'RHYTHMIC_DIVERSITY',
      row.metrics.rhythmicDiversityCount,
      'at least 2',
    ))
  candidates
    .filter((row) => row.fixtureId === 'constant-blocks' && h3Profiles.has(row.profile))
    .forEach((row) => {
      const baseline = baselinesByPair.get(rowKey(row.fixtureId, row.method))!
      h3Conditions.push(condition(
        row.metrics.exactRepetitionRatio < baseline.metrics.exactRepetitionRatio,
        row.fixtureId,
        row.method,
        row.profile,
        'EXACT_REPETITION_BELOW_BASELINE',
        row.metrics.exactRepetitionRatio,
        `< ${baseline.metrics.exactRepetitionRatio}`,
      ))
    })

  const h4Conditions: HypothesisCondition[] = candidates.map((row) => condition(
    row.metrics.unresolvedLeapCount === 0,
    row.fixtureId,
    row.method,
    row.profile,
    'NO_UNRESOLVED_LARGE_LEAPS',
    row.metrics.unresolvedLeapCount,
    '0',
  ))
  const nonVacuousLeapImprovements = candidates.filter((row) => {
    if (row.fixtureId !== 'antipodal' && row.fixtureId !== 'irregular') return false
    const baseline = baselinesByPair.get(rowKey(row.fixtureId, row.method))!
    return row.metrics.unresolvedLeapCount < baseline.metrics.unresolvedLeapCount
  }).length
  h4Conditions.push(condition(
    nonVacuousLeapImprovements > 0,
    'antipodal-or-irregular',
    'all',
    'ALL_PROFILES',
    'STRICT_LEAP_IMPROVEMENT_EXISTS',
    nonVacuousLeapImprovements,
    'at least 1 paired improvement',
  ))

  const h5Conditions: HypothesisCondition[] = []
  baselines.forEach((baseline) => {
    const resolved = candidateFor(
      baseline.fixtureId,
      baseline.method,
      'RESOLVED',
    )
    const open = candidateFor(
      baseline.fixtureId,
      baseline.method,
      'OPEN_ENDED',
    )
    const resolvedComparison = resolved.metrics.finalStability >=
      baseline.metrics.finalStability &&
      (baseline.metrics.finalStability >= 1 ||
        resolved.metrics.finalStability > baseline.metrics.finalStability)
    h5Conditions.push(condition(
      resolvedComparison,
      baseline.fixtureId,
      baseline.method,
      'RESOLVED',
      'RESOLVED_AT_LEAST_BASELINE',
      resolved.metrics.finalStability,
      baseline.metrics.finalStability < 1
        ? `> ${baseline.metrics.finalStability}`
        : `>= ${baseline.metrics.finalStability}`,
    ))
    h5Conditions.push(condition(
      resolved.metrics.finalStability > open.metrics.finalStability,
      baseline.fixtureId,
      baseline.method,
      'RESOLVED',
      'RESOLVED_STRONGER_THAN_OPEN',
      resolved.metrics.finalStability - open.metrics.finalStability,
      '> 0',
    ))
    h5Conditions.push(condition(
      open.metrics.unresolvedLeapCount === 0,
      baseline.fixtureId,
      baseline.method,
      'OPEN_ENDED',
      'OPEN_HAS_NO_TERMINAL_UNRESOLVED_LEAP',
      open.metrics.unresolvedLeapCount,
      '0',
    ))
  })

  const h6Conditions: HypothesisCondition[] = []
  baselines.forEach((baseline) => {
    const calm = candidateFor(
      baseline.fixtureId,
      baseline.method,
      'CALM_SPARSE',
    )
    const pulsing = candidateFor(
      baseline.fixtureId,
      baseline.method,
      'PULSING',
    )
    h6Conditions.push(condition(
      calm.metrics.restRatio > pulsing.metrics.restRatio,
      baseline.fixtureId,
      baseline.method,
      'CALM_SPARSE',
      'CALM_REST_RATIO_ABOVE_PULSING',
      calm.metrics.restRatio - pulsing.metrics.restRatio,
      '> 0',
    ))
    h6Conditions.push(condition(
      pulsing.metrics.eventDensity > calm.metrics.eventDensity,
      baseline.fixtureId,
      baseline.method,
      'PULSING',
      'PULSING_DENSITY_ABOVE_CALM',
      pulsing.metrics.eventDensity - calm.metrics.eventDensity,
      '> 0',
    ))
  })

  const h7Conditions: HypothesisCondition[] = candidates.map((row) => {
    const baseline = baselinesByPair.get(rowKey(row.fixtureId, row.method))!
    const allowedDrop = 1 / Math.max(1, row.metrics.eligibleContourComparisons)
    const contourMinimum = baseline.metrics.contourAgreement - allowedDrop
    const contourPass = row.metrics.contourAgreement + 0.000001 >= contourMinimum
    const registerPass = row.metrics.registerUtilization >= 0 &&
      row.metrics.registerUtilization <= 1
    const edgePass = row.metrics.longestEdgeRun <= 2
    const driftPass = row.metrics.tonalCenterDrift === 0
    const failedCodes = [
      ...(contourPass ? [] : ['CONTOUR']),
      ...(registerPass ? [] : ['REGISTER_RANGE']),
      ...(edgePass ? [] : ['EDGE_RUN']),
      ...(driftPass ? [] : ['TONAL_DRIFT']),
    ]
    return condition(
      failedCodes.length === 0,
      row.fixtureId,
      row.method,
      row.profile,
      failedCodes.length === 0 ? 'CONTOUR_REGISTER_SAFETY' : failedCodes.join('_'),
      row.metrics.contourAgreement,
      `contour >= ${roundSix(contourMinimum)}; register in [0,1]; edge <= 2; drift = 0`,
    )
  })

  return [
    hypothesis(
      'H1',
      'Form',
      'Every candidate has four planned phrases; every baseline has one comparison span.',
      h1Conditions,
    ),
    hypothesis(
      'H2',
      'Motif',
      'Every candidate has a bounded verified motif recurrence; baselines declare none.',
      h2Conditions,
    ),
    hypothesis(
      'H3',
      'Repetition and rhythm',
      'Registered lyrical/resolved fixtures meet diversity and repetition comparisons.',
      h3Conditions,
    ),
    hypothesis(
      'H4',
      'Leap recovery',
      'Candidates have no unresolved leap and the edge fixtures include strict improvements.',
      h4Conditions,
    ),
    hypothesis(
      'H5',
      'Cadence',
      'Resolved closure meets baseline and exceeds open closure without an open terminal leap.',
      h5Conditions,
    ),
    hypothesis(
      'H6',
      'Profiles',
      'Calm is rest-heavier and pulsing is onset-denser for every fixture/method pair.',
      h6Conditions,
    ),
    hypothesis(
      'H7',
      'Contour and register safety',
      'Uses the registered one-transition contour tolerance, [0,1] utilization range, edge cap, and zero drift.',
      h7Conditions,
    ),
  ]
}

/**
 * Builds the complete frozen Work 03 comparison report. No report timestamp,
 * host fact, locale value, file-system state, or external service is consulted.
 */
export function buildWork03StructuralEvaluationReport(): Work03StructuralEvaluationReport {
  const baselines: Work02BaselineEvaluationRow[] = []
  const candidates: Work03CandidateEvaluationRow[] = []
  let candidateValidationCount = 0
  let audioScheduleValidationCount = 0
  let inputMutationCheckCount = 0
  let inputMutationFailureCount = 0
  let publicBoundaryFailureCount = 0
  let work02SnapshotFailureCount = 0

  const protocolFixtureSetMatches =
    JSON.stringify(WORK03_PUBLIC_FIXTURE_IDS) === JSON.stringify(PROTOCOL_FIXTURE_IDS)

  WORK03_PUBLIC_FIXTURE_IDS.forEach((fixtureId) => {
    const policyInput = createWork03PublicFixtureInput(fixtureId)
    if (!isRepositoryPublicInput(policyInput)) publicBoundaryFailureCount += 1

    WORK03_EVALUATION_METHODS.forEach((method) => {
      const baselineInput = createWork03PublicFixtureInput(fixtureId)
      const baselineInputBefore = JSON.stringify(baselineInput)
      const baselineInterpretation = interpretFlow(baselineInput, method)
      const baselineInterpretationBefore = JSON.stringify(baselineInterpretation)
      const baselineMelody = validateMelodyOutput(generateMelody(baselineInterpretation))
      const baselineMetrics = measureWork02BaselineStructure(
        baselineMelody,
        baselineInterpretation,
      )
      inputMutationCheckCount += 2
      if (JSON.stringify(baselineInput) !== baselineInputBefore) {
        inputMutationFailureCount += 1
      }
      if (JSON.stringify(baselineInterpretation) !== baselineInterpretationBefore) {
        inputMutationFailureCount += 1
      }
      if (
        baselineMelody.versions.outputContract !== MELODY_OUTPUT_CONTRACT_VERSION ||
        baselineMelody.versions.grammar !== MUSIC_GRAMMAR_VERSION ||
        baselineMelody.versions.generator !== MELODY_GENERATOR_VERSION ||
        baselineMetrics.phraseCount !== 1
      ) {
        work02SnapshotFailureCount += 1
      }
      baselines.push({ fixtureId, method, metrics: baselineMetrics })

      GRAMMAR_PROFILE_IDS.forEach((profile) => {
        const seed = work03EvaluationSeed(fixtureId, method, profile)
        const independentResults = Array.from({ length: 3 }, () => {
          const runInput = createWork03PublicFixtureInput(fixtureId)
          const runInputBefore = JSON.stringify(runInput)
          const runInterpretation = interpretFlow(runInput, method)
          const runInterpretationBefore = JSON.stringify(runInterpretation)
          const result = validateGrammarV1Result(generateGrammarV1({
            interpretation: runInterpretation,
            seed,
            profile,
          }))
          candidateValidationCount += 1
          const schedule = createWork03AudioSchedule(result)
          validateWork03AudioSchedule(schedule, result)
          audioScheduleValidationCount += 1
          inputMutationCheckCount += 2
          if (JSON.stringify(runInput) !== runInputBefore) {
            inputMutationFailureCount += 1
          }
          if (JSON.stringify(runInterpretation) !== runInterpretationBefore) {
            inputMutationFailureCount += 1
          }
          return result
        })
        candidates.push({
          fixtureId,
          method,
          profile,
          seed,
          independentRunCount: 3,
          validatedRunCount: 3,
          audioScheduleValidationCount: 3,
          uniqueCanonicalRuns: countUniqueCanonicalRuns(independentResults),
          metrics: measureGrammarV1Structure(independentResults[0]),
        })
      })
    })
  })

  const baselineMetricTable = aggregateMetrics(
    baselines.map((row) => row.metrics),
  )
  const profileTable: Work03ProfileAggregateRow[] = GRAMMAR_PROFILE_IDS.map(
    (profile) => {
      const rows = candidates.filter((row) => row.profile === profile)
      const metrics = aggregateMetrics(rows.map((row) => row.metrics))
      return {
        profile,
        candidateCount: rows.length,
        validatedRunCount: rows.reduce(
          (sum, row) => sum + row.validatedRunCount,
          0,
        ),
        audioScheduleValidationCount: rows.reduce(
          (sum, row) => sum + row.audioScheduleValidationCount,
          0,
        ),
        deterministicCandidateCount: rows.filter((row) =>
          row.uniqueCanonicalRuns === 1).length,
        metrics,
        meanDeltaFromBaseline: Object.fromEntries(NUMERIC_METRIC_KEYS.map((key) => [
          key,
          roundSix(metrics[key].mean - baselineMetricTable[key].mean),
        ])) as Record<NumericMetricKey, number>,
      }
    },
  )

  const candidateGenerationCount = candidates.reduce(
    (sum, row) => sum + row.independentRunCount,
    0,
  )
  const deterministicFailures = candidates.filter((row) =>
    row.uniqueCanonicalRuns !== 1).length
  const hypotheses = evaluateHypotheses(baselines, candidates)
  const hardGates: Work03HardGateResult[] = [
    {
      id: 'OUTPUT_VALIDITY',
      passed: candidateValidationCount === candidateGenerationCount &&
        inputMutationFailureCount === 0,
      evaluatedChecks: candidateGenerationCount + inputMutationCheckCount,
      failedChecks: candidateGenerationCount - candidateValidationCount +
        inputMutationFailureCount,
      evidence: 'Every independent result passed the strict Work 03 validator; inputs and interpretations remained unchanged.',
    },
    {
      id: 'IDENTICAL_RUN_DETERMINISM',
      passed: deterministicFailures === 0,
      evaluatedChecks: candidates.length,
      failedChecks: deterministicFailures,
      evidence: 'Every candidate group contained one unique canonical JSON result across three independently constructed runs.',
    },
    {
      id: 'PUBLIC_PRIVATE_BOUNDARY',
      passed: protocolFixtureSetMatches && publicBoundaryFailureCount === 0,
      evaluatedChecks: WORK03_PUBLIC_FIXTURE_IDS.length + 1,
      failedChecks: (protocolFixtureSetMatches ? 0 : 1) + publicBoundaryFailureCount,
      evidence: 'Only the exact 16 repository-authorized public fixture IDs and narrow Work 02 input fields were consumed.',
    },
    {
      id: 'WORK02_SNAPSHOT_BEHAVIOR',
      passed: baselines.length === 48 && work02SnapshotFailureCount === 0,
      evaluatedChecks: baselines.length,
      failedChecks: work02SnapshotFailureCount + (baselines.length === 48 ? 0 : 1),
      evidence: 'All 48 baseline outputs passed the unchanged Work 02 validator and exact output, grammar, and generator version chain.',
    },
    {
      id: 'AUDIO_ADAPTER_CONTRACT',
      passed: audioScheduleValidationCount === candidateGenerationCount,
      evaluatedChecks: candidateGenerationCount,
      failedChecks: candidateGenerationCount - audioScheduleValidationCount,
      evidence: 'Every independent candidate projected through and passed the strict Work 03 audio schedule validator.',
    },
  ]
  const hardGatesPassed = hardGates.every((gate) => gate.passed)
  const hypothesesPassed = hypotheses.filter((item) => item.passed).length
  const musicalStructureImproved: Work03StructureVerdict = !hardGatesPassed ||
    hypothesesPassed === 0
    ? 'NOT_SUPPORTED'
    : hypothesesPassed === hypotheses.length
      ? 'SUPPORTED'
      : 'MIXED'

  return {
    versions: {
      evaluation: WORK03_STRUCTURAL_EVALUATION_VERSION,
      metrics: WORK03_STRUCTURAL_METRICS_VERSION,
      grammar: WORK03_MUSIC_GRAMMAR_VERSION,
      baselineOutput: MELODY_OUTPUT_CONTRACT_VERSION,
      baselineGrammar: MUSIC_GRAMMAR_VERSION,
      baselineGenerator: MELODY_GENERATOR_VERSION,
    },
    counts: {
      fixtureCount: WORK03_PUBLIC_FIXTURE_IDS.length,
      methodCount: WORK03_EVALUATION_METHODS.length,
      profileCount: GRAMMAR_PROFILE_IDS.length,
      baselineCount: baselines.length,
      candidateCount: candidates.length,
      candidateGenerationCount,
      candidateValidationCount,
      audioScheduleValidationCount,
      inputMutationCheckCount,
      inputMutationFailureCount,
    },
    sourcePolicy: {
      fixtureIds: [...WORK03_PUBLIC_FIXTURE_IDS],
      usesOnlyRepositoryPublicFixtures:
        protocolFixtureSetMatches && publicBoundaryFailureCount === 0,
      consumesRawSessionMetadata: false,
      usesExternalIo: false,
    },
    baselines,
    candidates,
    baselineMetrics: baselineMetricTable,
    profileTable,
    hardGates,
    hypotheses,
    verdict: {
      hardGatesPassed,
      hypothesesPassed,
      hypothesesTotal: 7,
      musicalStructureImproved,
      productionReplacementRecommended: 'NO',
    },
    notes: [
      'Structural metrics are diagnostics, not a universal musical-quality score.',
      'No profile-specific register-utilization bands were numerically pre-registered; H7 therefore checks only the metric contract range [0,1] and the frozen maximum edge run of 2.',
      'The Work 02 snapshot gate validates the frozen runtime contract and version chain; repository SHA and CI regression status remain external release evidence.',
      'Ordinary Grammar v1 generation avoids intervals at or above 7 semitones; forced leap-recovery behavior is covered separately by a deterministic unit fixture.',
    ],
  }
}
