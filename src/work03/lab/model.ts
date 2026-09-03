import type { Direction } from '../../domain/types'
import { createWork03AudioSchedule } from '../audio/adapter'
import type { Work03AudioSchedule } from '../audio/types'
import { validateWork03AudioSchedule } from '../audio/validateSchedule'
import {
  measureGrammarV1Structure,
  measureWork02BaselineStructure,
} from '../evaluation/metrics'
import type { StructuralMetrics } from '../evaluation/types'
import {
  WORK03_PUBLIC_FIXTURE_IDS,
  createWork03PublicFixtureInput,
  work03EvaluationSeed,
  type Work03PublicFixtureId,
} from '../fixtures/publicFixtures'
import { generateGrammarV1 } from '../grammar/generator'
import { isGrammarProfileId } from '../grammar/profiles'
import {
  GRAMMAR_PROFILE_IDS,
  type GrammarProfileId,
  type GrammarV1Result,
} from '../grammar/types'
import { interpretFlow } from '../../work02/interpretation/interpretFlow'
import type {
  FlowInterpretation,
  InterpretationMethod,
} from '../../work02/interpretation/types'
import { generateMelody } from '../../work02/music/generator'
import type { MelodyOutput } from '../../work02/music/types'

export const WORK03_LAB_EXPORT_VERSION = 'work03-lab-export-v1' as const

export const WORK03_LAB_FIXTURE_IDS: readonly Work03PublicFixtureId[] =
  Object.freeze([...WORK03_PUBLIC_FIXTURE_IDS])

export const WORK03_LAB_METHODS: readonly InterpretationMethod[] = Object.freeze([
  'absolute-hue',
  'relative-hue',
  'hybrid',
])

export const WORK03_LAB_PROFILE_IDS: readonly GrammarProfileId[] =
  Object.freeze([...GRAMMAR_PROFILE_IDS])

export interface Work03LabSelection {
  readonly fixtureId: Work03PublicFixtureId
  readonly method: InterpretationMethod
  readonly profile: GrammarProfileId
}

export interface Work03LabBaselineResult {
  readonly melodyOutput: MelodyOutput
  readonly metrics: StructuralMetrics
}

export interface Work03LabGrammarResult {
  readonly result: GrammarV1Result
  readonly metrics: StructuralMetrics
  readonly audioSchedule: Work03AudioSchedule
}

export interface Work03LabExportPayload {
  readonly version: typeof WORK03_LAB_EXPORT_VERSION
  readonly selection: Readonly<Work03LabSelection & { seed: string }>
  readonly baseline: Work03LabBaselineResult
  readonly grammarV1: Work03LabGrammarResult
}

export interface Work03LabResult {
  readonly selection: Readonly<Work03LabSelection>
  readonly seed: string
  readonly directions: readonly Direction[]
  readonly interpretation: FlowInterpretation
  readonly baseline: Readonly<Work03LabBaselineResult>
  readonly grammarV1: Readonly<Work03LabGrammarResult>
  readonly exportFileName: string
  readonly exportJson: string
}

export const DEFAULT_WORK03_LAB_SELECTION: Readonly<Work03LabSelection> =
  Object.freeze({
    fixtureId: 'same-deck-baseline',
    method: 'hybrid',
    profile: 'BALANCED_LYRICAL',
  })

const isFixtureId = (value: unknown): value is Work03PublicFixtureId =>
  typeof value === 'string' &&
  (WORK03_LAB_FIXTURE_IDS as readonly string[]).includes(value)

const isMethod = (value: unknown): value is InterpretationMethod =>
  typeof value === 'string' &&
  (WORK03_LAB_METHODS as readonly string[]).includes(value)

const validateSelection = (
  input: Readonly<{ fixtureId: string; method: string; profile: string }>,
): Readonly<Work03LabSelection> => {
  if (!isFixtureId(input.fixtureId)) {
    throw new RangeError(`Unsupported Work 03 Lab fixture: ${input.fixtureId}`)
  }
  if (!isMethod(input.method)) {
    throw new RangeError(`Unsupported Work 03 Lab method: ${input.method}`)
  }
  if (!isGrammarProfileId(input.profile)) {
    throw new RangeError(`Unsupported Work 03 Lab profile: ${input.profile}`)
  }
  return Object.freeze({
    fixtureId: input.fixtureId,
    method: input.method,
    profile: input.profile,
  })
}

const createExportPayload = (
  selection: Readonly<Work03LabSelection>,
  seed: string,
  baseline: Readonly<Work03LabBaselineResult>,
  grammarV1: Readonly<Work03LabGrammarResult>,
): Work03LabExportPayload => ({
  version: WORK03_LAB_EXPORT_VERSION,
  selection: {
    fixtureId: selection.fixtureId,
    method: selection.method,
    profile: selection.profile,
    seed,
  },
  baseline,
  grammarV1,
})

/**
 * Builds one deterministic, public-fixture-only Work 02/Work 03 comparison.
 * The export deliberately contains no wall-clock, locale, upload, or telemetry
 * metadata, so identical selections produce byte-identical JSON.
 */
export function createWork03LabResult(
  input: Readonly<{ fixtureId: string; method: string; profile: string }>,
): Work03LabResult {
  const selection = validateSelection(input)
  const fixture = createWork03PublicFixtureInput(selection.fixtureId)
  const interpretation = interpretFlow(fixture, selection.method)
  const baselineMelody = generateMelody(interpretation)
  const baseline = Object.freeze({
    melodyOutput: baselineMelody,
    metrics: measureWork02BaselineStructure(baselineMelody, interpretation),
  })

  const seed = work03EvaluationSeed(
    selection.fixtureId,
    selection.method,
    selection.profile,
  )
  const grammarResult = generateGrammarV1({
    interpretation,
    seed,
    profile: selection.profile,
  })
  const audioSchedule = validateWork03AudioSchedule(
    createWork03AudioSchedule(grammarResult),
    grammarResult,
  )
  const grammarV1 = Object.freeze({
    result: grammarResult,
    metrics: measureGrammarV1Structure(grammarResult),
    audioSchedule,
  })
  const exportJson = JSON.stringify(createExportPayload(
    selection,
    seed,
    baseline,
    grammarV1,
  ))

  return Object.freeze({
    selection,
    seed,
    directions: Object.freeze(fixture.map((item) => item.direction)),
    interpretation,
    baseline,
    grammarV1,
    exportFileName: `haruhan-eum-work03-${selection.fixtureId}-${selection.method}-${selection.profile}.json`,
    exportJson,
  })
}
