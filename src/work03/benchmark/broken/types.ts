import type { SessionExport } from '../../../domain/types'
import type {
  BenchmarkGenerate,
} from '../types'
import type { Work02BenchmarkProfile } from '../adapters/work02'

export const GENERATOR_FAILURE_INJECTION_IDS = [
  'constant-pitch',
  'endless-ascending-sequence',
  'endless-descending-sequence',
  'octave-ping-pong',
  'unresolved-leaps',
  'zero-rests',
  'too-many-rests',
  'identical-duration',
  'micro-note-explosion',
  'out-of-range-notes',
  'invalid-total-beats',
  'abrupt-ending',
  'excessive-motif-copy',
  'no-motif-recurrence',
  'register-edge-trapping',
  'nondeterministic-tie-breaking',
] as const

export type GeneratorFailureInjectionId =
  typeof GENERATOR_FAILURE_INJECTION_IDS[number]

export const REQUIRED_BROKEN_FINDING_CODES = [
  'CONTRACT.ADAPTER_CONTRACT_INVALID',
  'CONTRACT.PROVENANCE_INVALID',
  'CONTRACT.SCHEDULE_INCOMPATIBLE',
  'CONTRACT.DURATION_INVALID',
  'CONTRACT.NOTE_OUT_OF_BOUNDS',
  'CONTRACT.TOTAL_BEATS_MISMATCH',
  'FORM.CONTOUR_AGREEMENT_LOW',
  'FORM.EXACT_COPY_HIGH',
  'FORM.NO_MOTIF_RECURRENCE',
  'PITCH.CONSTANT',
  'PITCH.LARGE_LEAP_RATE_HIGH',
  'PITCH.MONOTONIC',
  'PITCH.OCTAVE_PING_PONG',
  'PITCH.REPEATED_NOTE_RUN',
  'PITCH.REGISTER_EDGE_TRAP',
  'PITCH.UNRESOLVED_LEAP_RATE_HIGH',
  'RHYTHM.DURATION_COLLAPSE',
  'RHYTHM.MICRO_NOTE_RATE_HIGH',
  'RHYTHM.IDENTICAL_CELL_REPETITION_HIGH',
  'RHYTHM.REST_RATIO_HIGH',
  'RHYTHM.ZERO_RESTS',
  'ROBUSTNESS.NONDETERMINISTIC',
] as const

export type RequiredBrokenFindingCode =
  typeof REQUIRED_BROKEN_FINDING_CODES[number]

export type BrokenBenchmarkGenerator = BenchmarkGenerate<
  SessionExport,
  unknown,
  Work02BenchmarkProfile
>

export type BrokenGeneratorFactory = () => BrokenBenchmarkGenerator

export interface BrokenGeneratorExpectation {
  id: GeneratorFailureInjectionId
  generatorId: `work03-broken-${GeneratorFailureInjectionId}-v1`
  recommendedSessionId: string
  /**
   * Complete expected delta versus the unmodified control on the recommended
   * session. Any other injected-only code remains an unexpected finding.
   */
  expectedFindingCodes: readonly RequiredBrokenFindingCode[]
}

export interface BrokenGeneratorCase extends BrokenGeneratorExpectation {
  createGenerator: BrokenGeneratorFactory
}

export const MAX_BROKEN_OUTPUT_EVENTS = 192 as const
export const MAX_BROKEN_OUTPUT_JSON_BYTES = 256 * 1024
