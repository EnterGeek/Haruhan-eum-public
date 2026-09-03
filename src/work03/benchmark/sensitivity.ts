import {
  BROKEN_GENERATOR_CASES,
  type GeneratorFailureInjectionId,
} from './broken'
import {
  createWork02BenchmarkProfile,
  generateWork02Baseline,
  WORK02_BASELINE_GENERATOR_ID,
} from './adapters/work02'
import { buildSessionCorpus } from './corpus'
import { evaluateGenerator } from './evaluate'

export interface BrokenGeneratorSensitivityRow {
  id: GeneratorFailureInjectionId
  generatorId: string
  sessionId: string
  expectedFindingCodes: readonly string[]
  observedFindingCodes: readonly string[]
  unexpectedFindingCodes: readonly string[]
  missedFindingCodes: readonly string[]
  controlFindingCodes: readonly string[]
  falsePositiveFindingCodes: readonly string[]
  passed: boolean
}

export interface BrokenGeneratorSensitivityResult {
  profileId: string
  seed: number
  rows: readonly BrokenGeneratorSensitivityRow[]
  passed: boolean
}

const sorted = (values: Iterable<string>): string[] => [...values].sort()

/**
 * Evaluates each bounded failure injection beside an unmodified Work 02
 * control on the exact same synthetic session. A control collision is reported
 * as a possible false positive; it is never silently subtracted.
 */
export async function runBrokenGeneratorSensitivity(
  seed = 0x3_03_2026,
): Promise<BrokenGeneratorSensitivityResult> {
  const sessions = new Map(
    buildSessionCorpus().map((item) => [item.id, item.session]),
  )
  const profile = createWork02BenchmarkProfile('absolute-hue')
  const rows: BrokenGeneratorSensitivityRow[] = []

  for (const testCase of BROKEN_GENERATOR_CASES) {
    const session = sessions.get(testCase.recommendedSessionId)
    if (!session) {
      throw new Error(
        `Missing recommended session ${testCase.recommendedSessionId} for ${testCase.id}.`,
      )
    }
    const control = await evaluateGenerator({
      session,
      generate: generateWork02Baseline,
      generatorId: WORK02_BASELINE_GENERATOR_ID,
      seed,
      profile,
    })
    const injected = await evaluateGenerator({
      session,
      generate: testCase.createGenerator(),
      generatorId: testCase.generatorId,
      seed,
      profile,
    })
    const expected = new Set<string>(testCase.expectedFindingCodes)
    const observed = new Set(injected.findings.map((item) => item.code))
    const controlCodes = new Set(control.findings.map((item) => item.code))
    const missed = sorted([...expected].filter((code) => !observed.has(code)))
    const unexpected = sorted([...observed].filter(
      (code) => !expected.has(code) && !controlCodes.has(code),
    ))
    const falsePositives = sorted(
      [...expected].filter((code) => controlCodes.has(code)),
    )
    rows.push({
      id: testCase.id,
      generatorId: testCase.generatorId,
      sessionId: testCase.recommendedSessionId,
      expectedFindingCodes: sorted(expected),
      observedFindingCodes: sorted(observed),
      unexpectedFindingCodes: unexpected,
      missedFindingCodes: missed,
      controlFindingCodes: sorted(controlCodes),
      falsePositiveFindingCodes: falsePositives,
      passed: missed.length === 0 &&
        unexpected.length === 0 &&
        falsePositives.length === 0,
    })
  }

  return {
    profileId: profile.id,
    seed,
    rows,
    passed: rows.every((row) => row.passed),
  }
}
