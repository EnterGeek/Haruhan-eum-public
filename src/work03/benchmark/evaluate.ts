import { canonicalJson, stableHash } from './canonical'
import { createInitialMetrics } from './emptyMetrics'
import type {
  BenchmarkProfile,
  EvaluateGeneratorOptions,
  Finding,
  GeneratorEvaluation,
  ResultCategory,
  ValidationCheck,
} from './types'

const elapsed = (startedAt: number): number => performance.now() - startedAt

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const resultCategoryFor = (findings: readonly Finding[]): ResultCategory => {
  if (findings.some((finding) => finding.resultCategory === 'hard-contract-violation')) {
    return 'hard-contract-violation'
  }
  if (
    findings.some(
      (finding) => finding.resultCategory === 'high-confidence-structural-risk',
    )
  ) {
    return 'high-confidence-structural-risk'
  }
  if (findings.length > 0) return 'low-confidence-structural-observation'
  return 'abstain-no-finding'
}

export async function evaluateGenerator<
  TSession,
  TOutput,
  TProfile extends BenchmarkProfile<TSession, TOutput>,
>(
  options: EvaluateGeneratorOptions<TSession, TOutput, TProfile>,
): Promise<GeneratorEvaluation<TOutput>> {
  const { generate, generatorId, profile, seed, session } = options
  const checks: ValidationCheck[] = []
  const findings: Finding[] = []

  let output: TOutput | null = null
  let repeatedOutput: TOutput | null = null
  let firstRunMilliseconds = 0
  let repeatRunMilliseconds = 0

  try {
    const startedAt = performance.now()
    output = await generate({ session, seed, profile })
    firstRunMilliseconds = elapsed(startedAt)
    checks.push({
      id: 'GENERATOR_COMPLETED',
      scope: 'generator',
      passed: true,
      message: 'Generator returned an output.',
    })
  } catch (error) {
    checks.push({
      id: 'GENERATOR_COMPLETED',
      scope: 'generator',
      passed: false,
      message: errorMessage(error),
    })
    findings.push({
      code: 'CONTRACT_GENERATOR_THROW',
      category: 'CONTRACT_FAILURE',
      severity: 'critical',
      resultCategory: 'hard-contract-violation',
      rationale: 'The generator did not return an inspectable output.',
      evidence: { generatorId, message: errorMessage(error) },
    })
  }

  if (output !== null) {
    try {
      const startedAt = performance.now()
      repeatedOutput = await generate({ session, seed, profile })
      repeatRunMilliseconds = elapsed(startedAt)
    } catch (error) {
      checks.push({
        id: 'GENERATOR_REPEAT_COMPLETED',
        scope: 'generator',
        passed: false,
        message: errorMessage(error),
      })
      findings.push({
        code: 'ROBUST_REPEAT_THROW',
        category: 'CONTRACT_FAILURE',
        severity: 'high',
        resultCategory: 'hard-contract-violation',
        rationale: 'The same-seed repeat call did not return an output.',
        evidence: { generatorId, message: errorMessage(error) },
      })
    }
  }

  let inspection = null
  if (output !== null) {
    const context = { session, output, generatorId, seed, profile }
    try {
      checks.push(...profile.validateOutput(output, context))
    } catch (error) {
      checks.push({
        id: 'ADAPTER_OUTPUT_VALIDATION',
        scope: 'schema',
        passed: false,
        message: errorMessage(error),
      })
    }
    try {
      inspection = profile.inspectOutput(output, context)
    } catch (error) {
      checks.push({
        id: 'ADAPTER_OUTPUT_INSPECTION',
        scope: 'schema',
        passed: false,
        message: errorMessage(error),
      })
    }
    if (profile.validateSchedule) {
      try {
        checks.push(profile.validateSchedule(output, context))
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

  checks
    .filter((check) => !check.passed)
    .forEach((check) => {
      findings.push({
        code: `CONTRACT_${check.id}`,
        category: 'CONTRACT_FAILURE',
        severity: check.scope === 'schedule' ? 'high' : 'critical',
        resultCategory: 'hard-contract-violation',
        rationale: check.message,
        evidence: { checkId: check.id, scope: check.scope },
      })
    })

  const deterministic = output !== null && repeatedOutput !== null
    ? canonicalJson(output) === canonicalJson(repeatedOutput)
    : null
  if (deterministic === false) {
    findings.push({
      code: 'ROBUST_NONDETERMINISTIC',
      category: 'STRUCTURAL_MUSICAL_RISK',
      severity: 'high',
      resultCategory: 'high-confidence-structural-risk',
      rationale: 'Two same-seed calls returned different canonical outputs.',
      evidence: { generatorId, profileId: profile.id, seed },
    })
  }

  const scheduleChecks = checks.filter((check) => check.scope === 'schedule')
  const scheduleCompatible = scheduleChecks.length === 0
    ? null
    : scheduleChecks.every((check) => check.passed)
  const generatorCompleted = checks.some(
    (check) => check.id === 'GENERATOR_COMPLETED' && check.passed,
  )
  const contractChecks = checks.filter(
    (check) => check.scope !== 'schedule' && check.scope !== 'generator',
  )
  const contractValid = generatorCompleted &&
    contractChecks.length > 0 &&
    contractChecks.every((check) => check.passed)
  const validation = {
    generatorCompleted,
    inspectionAvailable: inspection !== null,
    contractValid,
    scheduleCompatible,
    checks: [...checks].sort((left, right) => left.id.localeCompare(right.id)),
  }
  const metrics = createInitialMetrics({
    deterministic,
    runtime: {
      firstRunMilliseconds,
      repeatRunMilliseconds,
      perturbationRunMilliseconds: null,
    },
    inputItems: profile.inputLength(session),
    outputEvents: inspection?.events.length ?? null,
    scheduleCompatible,
  })
  const stableFindings = [...findings].sort((left, right) =>
    left.code.localeCompare(right.code))
  const failureSignature = `work03-failure-v1:${stableHash({
    generatorId,
    profileId: profile.id,
    failures: stableFindings.map(({ code, category, severity }) => ({
      code,
      category,
      severity,
    })),
    failedChecks: validation.checks
      .filter((check) => !check.passed)
      .map((check) => check.id),
  })}`

  return {
    output,
    validation,
    metrics,
    findings: stableFindings,
    failureSignature,
    resultCategory: resultCategoryFor(stableFindings),
  }
}
