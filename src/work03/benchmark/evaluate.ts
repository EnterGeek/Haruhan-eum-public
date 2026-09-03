import {
  canonicalJson,
  compareCanonicalStrings,
  stableHash,
} from './canonical'
import { createInitialMetrics } from './emptyMetrics'
import { deriveFindings, resultCategoryFor } from './findings'
import { analyzeMetrics } from './metrics'
import type {
  BenchmarkAdapterContext,
  BenchmarkExpectations,
  BenchmarkMetrics,
  BenchmarkProfile,
  EvaluateGeneratorOptions,
  Finding,
  GeneratorEvaluation,
  NormalizedMelody,
  ValidationCheck,
} from './types'
import {
  MAX_BENCHMARK_EVENTS,
  MAX_BENCHMARK_INPUT_ITEMS,
  validateNormalizedMelody,
} from './validation'

export const DEFAULT_GENERATOR_TIMEOUT_MILLISECONDS = 2_000 as const
export const MAX_GENERATOR_TIMEOUT_MILLISECONDS = 60_000 as const
const MAX_ADAPTER_CHECKS = 256
const MAX_CHECK_TEXT_CHARACTERS = 2_048
const VALIDATION_SCOPES = new Set<ValidationCheck['scope']>([
  'generator',
  'adapter-contract',
  'schema',
  'finite-numbers',
  'duration',
  'timeline',
  'note-bounds',
  'provenance',
  'schedule',
])

export class GeneratorEvaluationTimeoutError extends Error {
  constructor(milliseconds: number) {
    super(`Generator call exceeded the ${milliseconds} ms asynchronous timeout.`)
    this.name = 'GeneratorEvaluationTimeoutError'
  }
}

const elapsed = (startedAt: number): number => performance.now() - startedAt

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const cloneData = <T>(value: T): T => structuredClone(value)

/**
 * Copies profile state while retaining its callable adapter methods. Every
 * generator call receives a fresh copy, so mutations cannot change a later
 * call's independent oracle. Function closures remain adapter-owned state.
 */
const cloneProfile = <TProfile extends object>(profile: TProfile): TProfile => {
  const clone = Object.create(Object.getPrototypeOf(profile)) as TProfile
  for (const key of Reflect.ownKeys(profile)) {
    const descriptor = Object.getOwnPropertyDescriptor(profile, key)
    if (!descriptor) continue
    if ('value' in descriptor && typeof descriptor.value !== 'function') {
      descriptor.value = cloneData(descriptor.value)
    }
    Object.defineProperty(clone, key, descriptor)
  }
  return clone
}

const timeoutFor = (requested: number | undefined): number =>
  typeof requested === 'number' && Number.isFinite(requested) && requested > 0
    ? Math.min(requested, MAX_GENERATOR_TIMEOUT_MILLISECONDS)
    : DEFAULT_GENERATOR_TIMEOUT_MILLISECONDS

const runWithTimeout = async <T>(
  operation: () => T | Promise<T>,
  milliseconds: number,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(
      () => reject(new GeneratorEvaluationTimeoutError(milliseconds)),
      milliseconds,
    )
  })
  try {
    // Promise.resolve defers ordinary synchronous calls into the caught chain.
    // It cannot preempt a generator that blocks the JavaScript thread itself.
    return await Promise.race([Promise.resolve().then(operation), timeout])
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId)
  }
}

const boundedCheck = (value: unknown): ValidationCheck => {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Adapter validation check must be an object.')
  }
  const candidate = value as Partial<ValidationCheck>
  if (
    typeof candidate.id !== 'string' ||
    candidate.id.length === 0 ||
    candidate.id.length > MAX_CHECK_TEXT_CHARACTERS ||
    typeof candidate.scope !== 'string' ||
    !VALIDATION_SCOPES.has(candidate.scope as ValidationCheck['scope']) ||
    typeof candidate.passed !== 'boolean' ||
    (candidate.available !== undefined && typeof candidate.available !== 'boolean') ||
    typeof candidate.message !== 'string' ||
    candidate.message.length > MAX_CHECK_TEXT_CHARACTERS
  ) {
    throw new TypeError('Adapter validation check has invalid or oversized fields.')
  }
  return {
    id: candidate.id,
    scope: candidate.scope as ValidationCheck['scope'],
    passed: candidate.passed,
    ...(candidate.available === undefined ? {} : { available: candidate.available }),
    message: candidate.message,
  }
}

const boundedCheckForScope = (
  value: unknown,
  requiredScope: ValidationCheck['scope'],
): ValidationCheck => {
  const result = boundedCheck(value)
  if (result.scope !== requiredScope) {
    throw new TypeError(
      `Adapter check ${result.id} must use the ${requiredScope} scope.`,
    )
  }
  return result
}

const boundedChecks = (
  value: readonly ValidationCheck[],
  requiredScope: ValidationCheck['scope'],
): readonly ValidationCheck[] => {
  if (
    !Array.isArray(value) ||
    value.length > MAX_ADAPTER_CHECKS ||
    !Array.from({ length: value.length }, (_, index) => index in value).every(Boolean)
  ) {
    throw new TypeError(
      `Adapter validation must return at most ${MAX_ADAPTER_CHECKS} dense checks.`,
    )
  }
  return value.map((check) => boundedCheckForScope(check, requiredScope))
}

const structuralDistance = (
  left: NormalizedMelody,
  right: NormalizedMelody,
): number | null => {
  if (
    !Array.isArray(left.events) ||
    !Array.isArray(right.events) ||
    left.events.length > MAX_BENCHMARK_EVENTS ||
    right.events.length > MAX_BENCHMARK_EVENTS
  ) return null
  const eventView = (event: NormalizedMelody['events'][number]) => ({
    kind: event.kind,
    startBeat: event.startBeat,
    durationBeats: event.durationBeats,
    midiNote: event.kind === 'note' ? event.midiNote : null,
  })
  const maximumLength = Math.max(left.events.length, right.events.length)
  if (maximumLength === 0) return 0
  let changed = 0
  for (let index = 0; index < maximumLength; index += 1) {
    const leftEvent = left.events[index]
    const rightEvent = right.events[index]
    if (
      leftEvent === undefined ||
      rightEvent === undefined ||
      canonicalJson(eventView(leftEvent)) !== canonicalJson(eventView(rightEvent))
    ) changed += 1
  }
  return changed / maximumLength
}

const uncertaintyFinding = (
  code: string,
  rationale: string,
): Finding => ({
  code,
  category: 'METRIC_UNCERTAINTY',
  severity: 'info',
  resultCategory: 'low-confidence-structural-observation',
  rationale,
  evidence: { stage: code },
})

export async function evaluateGenerator<
  TSession,
  TOutput,
  TProfile extends BenchmarkProfile<TSession, TOutput>,
>(
  options: EvaluateGeneratorOptions<TSession, TOutput, TProfile>,
): Promise<GeneratorEvaluation<TOutput>> {
  const { generate, generatorId, profile, seed, session } = options
  const timeoutMilliseconds = timeoutFor(options.timeoutMilliseconds)
  const checks: ValidationCheck[] = []
  const profileId = typeof profile.id === 'string'
    ? profile.id.slice(0, 512)
    : '__invalid-profile-id__'

  let sessionSnapshot: TSession | null = null
  let inputLength = 0
  let inputLengthAvailable = false
  let expectations: BenchmarkExpectations | undefined
  let perturbedSessionSnapshot: TSession | null = null

  try {
    sessionSnapshot = cloneData(session)
  } catch (error) {
    checks.push({
      id: 'ADAPTER_SESSION_SNAPSHOT',
      scope: 'generator',
      passed: false,
      message: errorMessage(error),
    })
  }

  if (sessionSnapshot !== null) {
    try {
      const oracleProfile = cloneProfile(profile)
      const oracleSession = cloneData(sessionSnapshot)
      const measuredLength = oracleProfile.inputLength(oracleSession)
      if (
        !Number.isSafeInteger(measuredLength) ||
        measuredLength <= 0 ||
        measuredLength > MAX_BENCHMARK_INPUT_ITEMS
      ) {
        throw new RangeError(
          `Adapter input length must be a safe integer from 1 to ${MAX_BENCHMARK_INPUT_ITEMS}.`,
        )
      }
      inputLength = measuredLength
      inputLengthAvailable = true
    } catch (error) {
      checks.push({
        id: 'ADAPTER_INPUT_LENGTH',
        scope: 'provenance',
        passed: false,
        message: errorMessage(error),
      })
    }

    if (profile.expectations) {
      try {
        const oracleProfile = cloneProfile(profile)
        expectations = cloneData(
          oracleProfile.expectations!(cloneData(sessionSnapshot)),
        )
      } catch (error) {
        checks.push({
          id: 'ADAPTER_EXPECTATIONS',
          scope: 'provenance',
          passed: false,
          message: errorMessage(error),
        })
      }
    }

    if (profile.perturbSession) {
      try {
        const oracleProfile = cloneProfile(profile)
        perturbedSessionSnapshot = cloneData(
          oracleProfile.perturbSession!(cloneData(sessionSnapshot)),
        )
      } catch (error) {
        checks.push({
          id: 'PERTURBATION_PREPARATION',
          scope: 'generator',
          passed: false,
          message: errorMessage(error),
        })
      }
    }
  }

  const invokeGenerator = async (sourceSession: TSession): Promise<TOutput> =>
    runWithTimeout(
      () => generate({
        session: cloneData(sourceSession),
        seed,
        profile: cloneProfile(profile),
      }),
      timeoutMilliseconds,
    )

  let output: TOutput | null = null
  let firstRawOutput: TOutput | null = null
  let firstCanonical: string | null = null
  let repeatCanonical: string | null = null
  let generatorCompleted = false
  let firstRunMilliseconds: number | null = null
  let repeatRunMilliseconds: number | null = null
  let perturbationRunMilliseconds: number | null = null
  let perturbationSensitivity: number | null = null
  let inspection: NormalizedMelody | null = null
  const normalizedValidationChecks: ValidationCheck[] = []

  if (sessionSnapshot !== null) {
    try {
      const startedAt = performance.now()
      firstRawOutput = await invokeGenerator(sessionSnapshot)
      firstRunMilliseconds = elapsed(startedAt)
      generatorCompleted = true
      checks.push({
        id: 'GENERATOR_COMPLETED',
        scope: 'generator',
        passed: true,
        message: 'Generator returned an output.',
      })
      try {
        firstCanonical = canonicalJson(firstRawOutput)
      } catch (error) {
        checks.push({
          id: 'OUTPUT_CANONICALIZATION',
          scope: 'generator',
          passed: false,
          message: errorMessage(error),
        })
      }
      try {
        output = cloneData(firstRawOutput)
      } catch (error) {
        output = firstRawOutput
        checks.push({
          id: 'OUTPUT_SNAPSHOT',
          scope: 'schema',
          passed: false,
          message: errorMessage(error),
        })
      }
    } catch (error) {
      checks.push({
        id: 'GENERATOR_COMPLETED',
        scope: 'generator',
        passed: false,
        message: errorMessage(error),
      })
    }
  }

  if (generatorCompleted) {
    const generatedOutput = output as TOutput
    const adapterProfile = cloneProfile(profile)
    const context: BenchmarkAdapterContext<TSession, TOutput, TProfile> = {
      session: cloneData(sessionSnapshot as TSession),
      output: generatedOutput,
      generatorId,
      seed,
      profile: adapterProfile,
    }
    try {
      const returnedChecks = boundedChecks(
        adapterProfile.validateOutput(generatedOutput, context),
        'adapter-contract',
      )
      checks.push(...returnedChecks)
    } catch (error) {
      const failedCheck: ValidationCheck = {
        id: 'ADAPTER_OUTPUT_VALIDATION',
        scope: 'adapter-contract',
        passed: false,
        message: errorMessage(error),
      }
      checks.push(failedCheck)
    }
    try {
      inspection = cloneData(adapterProfile.inspectOutput(generatedOutput, context))
    } catch (error) {
      checks.push({
        id: 'ADAPTER_OUTPUT_INSPECTION',
        scope: 'schema',
        passed: false,
        message: errorMessage(error),
      })
    }
    if (adapterProfile.validateSchedule) {
      try {
        checks.push(boundedCheckForScope(
          adapterProfile.validateSchedule(generatedOutput, context),
          'schedule',
        ))
      } catch (error) {
        checks.push({
          id: 'ADAPTER_SCHEDULE_VALIDATION',
          scope: 'schedule',
          passed: false,
          message: errorMessage(error),
        })
      }
    }
  }

  if (inspection !== null && inputLengthAvailable) {
    try {
      normalizedValidationChecks.push(
        ...validateNormalizedMelody(inspection, inputLength, expectations),
      )
      checks.push(...normalizedValidationChecks)
    } catch (error) {
      checks.push({
        id: 'BENCHMARK_NORMALIZED_VALIDATION',
        scope: 'schema',
        passed: false,
        message: errorMessage(error),
      })
    }
  }

  if (generatorCompleted && sessionSnapshot !== null) {
    try {
      const startedAt = performance.now()
      const repeatedRawOutput = await invokeGenerator(sessionSnapshot)
      repeatRunMilliseconds = elapsed(startedAt)
      checks.push({
        id: 'GENERATOR_REPEAT_COMPLETED',
        scope: 'generator',
        passed: true,
        message: 'Same-seed repeat returned an output.',
      })
      try {
        // Captured before any adapter hook and before another generator call.
        repeatCanonical = canonicalJson(repeatedRawOutput)
      } catch (error) {
        checks.push({
          id: 'REPEAT_OUTPUT_CANONICALIZATION',
          scope: 'generator',
          passed: false,
          message: errorMessage(error),
        })
      }
      try {
        const repeatOutput = cloneData(repeatedRawOutput)
        const repeatProfile = cloneProfile(profile)
        repeatProfile.inspectOutput(repeatOutput, {
          session: cloneData(sessionSnapshot),
          output: repeatOutput,
          generatorId,
          seed,
          profile: repeatProfile,
        })
      } catch (error) {
        checks.push({
          id: 'ADAPTER_REPEAT_INSPECTION',
          scope: 'schema',
          passed: false,
          message: errorMessage(error),
        })
      }
    } catch (error) {
      checks.push({
        id: 'GENERATOR_REPEAT_COMPLETED',
        scope: 'generator',
        passed: false,
        message: errorMessage(error),
      })
    }
  }

  const deterministic = firstCanonical !== null && repeatCanonical !== null
    ? firstCanonical === repeatCanonical
    : null

  if (
    generatorCompleted &&
    inspection !== null &&
    perturbedSessionSnapshot !== null
  ) {
    try {
      const startedAt = performance.now()
      const perturbedOutput = await invokeGenerator(perturbedSessionSnapshot)
      perturbationRunMilliseconds = elapsed(startedAt)
      const perturbProfile = cloneProfile(profile)
      const perturbedInspection = cloneData(perturbProfile.inspectOutput(
        cloneData(perturbedOutput),
        {
          session: cloneData(perturbedSessionSnapshot),
          output: cloneData(perturbedOutput),
          generatorId,
          seed,
          profile: perturbProfile,
        },
      ))
      perturbationSensitivity = structuralDistance(inspection, perturbedInspection)
      if (perturbationSensitivity === null) {
        throw new RangeError('Perturbation distance exceeded the normalized event cap.')
      }
      checks.push({
        id: 'PERTURBATION_COMPLETED',
        scope: 'generator',
        passed: true,
        message: 'Perturbed-session output was inspected inside the traversal cap.',
      })
    } catch (error) {
      perturbationRunMilliseconds = null
      perturbationSensitivity = null
      checks.push({
        id: 'PERTURBATION_COMPLETED',
        scope: 'generator',
        passed: false,
        message: errorMessage(error),
      })
    }
  }

  const scheduleChecks = checks.filter((check) => check.scope === 'schedule')
  const availableScheduleChecks = scheduleChecks.filter(
    (check) => check.available !== false,
  )
  const scheduleCompatible = availableScheduleChecks.length === 0
    ? null
    : availableScheduleChecks.every((check) => check.passed)
  const schemaCheck = normalizedValidationChecks.find(
    (check) => check.id === 'SCHEMA_VALIDITY' && check.available !== false,
  )
  const schemaValid = schemaCheck ? schemaCheck.passed : null
  const runtime = {
    firstRunMilliseconds,
    repeatRunMilliseconds,
    perturbationRunMilliseconds,
  }

  let metrics: BenchmarkMetrics
  try {
    metrics = inspection === null
      ? createInitialMetrics({
          deterministic,
          runtime,
          inputItems: inputLength,
          outputEvents: null,
          scheduleCompatible,
        })
      : analyzeMetrics(inspection, {
          schemaValid,
          scheduleCompatible,
          sameSeedDeterminism: deterministic,
          perturbationSensitivity,
          runtime,
          outputSizeScaling: inputLengthAvailable &&
            Array.isArray(inspection.events) &&
            inspection.events.length <= MAX_BENCHMARK_EVENTS
            ? {
                inputItems: inputLength,
                outputEvents: inspection.events.length,
                eventsPerInput: inspection.events.length / inputLength,
              }
            : null,
          phraseBoundaryBeats: expectations?.phraseBoundaryBeats,
          expectations,
        })
  } catch (error) {
    checks.push({
      id: 'METRIC_ANALYSIS',
      scope: 'schema',
      passed: false,
      message: errorMessage(error),
    })
    metrics = createInitialMetrics({
      deterministic,
      runtime,
      inputItems: inputLength,
      outputEvents: null,
      scheduleCompatible,
    })
  }

  const nonContractCheckIds = new Set([
    'OUTPUT_CANONICALIZATION',
    'REPEAT_OUTPUT_CANONICALIZATION',
    'PERTURBATION_PREPARATION',
    'PERTURBATION_COMPLETED',
    'METRIC_ANALYSIS',
  ])
  const contractChecks = checks.filter((check) => !nonContractCheckIds.has(check.id))
  const contractValid = generatorCompleted &&
    inspection !== null &&
    contractChecks.length > 0 &&
    contractChecks.every((check) => check.passed && check.available !== false) &&
    scheduleCompatible !== false

  const sortedChecks = [...checks].sort(
    (left, right) => compareCanonicalStrings(left.id, right.id),
  )
  let stableFindings: readonly Finding[]
  try {
    stableFindings = deriveFindings({
      metrics,
      normalized: inspection,
      validationChecks: sortedChecks,
      expectations,
    })
  } catch (error) {
    checks.push({
      id: 'FINDING_DERIVATION',
      scope: 'schema',
      passed: false,
      message: errorMessage(error),
    })
    stableFindings = [uncertaintyFinding(
      'METRIC.FINDING_DERIVATION_UNAVAILABLE',
      'Finding derivation rejected a malformed or unsafe normalized view.',
    )]
  }

  const finalChecks = [...checks].sort(
    (left, right) => compareCanonicalStrings(left.id, right.id),
  )
  let failureDigest = 'unavailable'
  try {
    failureDigest = stableHash({
      generatorId: generatorId.slice(0, 512),
      profileId,
      failures: stableFindings.map(({ code, category, severity }) => ({
        code,
        category,
        severity,
      })),
      failedChecks: finalChecks
        .filter((check) => !check.passed)
        .map((check) => ({ available: check.available !== false, id: check.id })),
    })
  } catch {
    // This data is internally bounded; the literal remains deterministic if a
    // hostile string still defeats canonical signature construction.
  }

  return {
    output,
    validation: {
      generatorCompleted,
      inspectionAvailable: inspection !== null,
      contractValid,
      scheduleCompatible,
      checks: finalChecks,
    },
    metrics,
    findings: stableFindings,
    failureSignature: `work03-failure-v1:${failureDigest}`,
    resultCategory: resultCategoryFor(stableFindings),
  }
}
