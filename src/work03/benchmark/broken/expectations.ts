import type { BrokenGeneratorExpectation } from './types'

const expectation = (
  value: BrokenGeneratorExpectation,
): BrokenGeneratorExpectation => Object.freeze({
  ...value,
  expectedFindingCodes: Object.freeze([...value.expectedFindingCodes]),
})

export const BROKEN_GENERATOR_EXPECTATIONS = Object.freeze([
  expectation({
    id: 'constant-pitch',
    generatorId: 'work03-broken-constant-pitch-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: [
      'FORM.CONTOUR_AGREEMENT_LOW',
      'FORM.EXACT_COPY_HIGH',
      'PITCH.CONSTANT',
      'PITCH.REPEATED_NOTE_RUN',
      'RHYTHM.IDENTICAL_CELL_REPETITION_HIGH',
    ],
  }),
  expectation({
    id: 'endless-ascending-sequence',
    generatorId: 'work03-broken-endless-ascending-sequence-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: ['PITCH.MONOTONIC'],
  }),
  expectation({
    id: 'endless-descending-sequence',
    generatorId: 'work03-broken-endless-descending-sequence-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: ['PITCH.MONOTONIC'],
  }),
  expectation({
    id: 'octave-ping-pong',
    generatorId: 'work03-broken-octave-ping-pong-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: [
      'CONTRACT.ADAPTER_CONTRACT_INVALID',
      'CONTRACT.SCHEDULE_INCOMPATIBLE',
      'FORM.EXACT_COPY_HIGH',
      'PITCH.OCTAVE_PING_PONG',
      'PITCH.LARGE_LEAP_RATE_HIGH',
      'PITCH.UNRESOLVED_LEAP_RATE_HIGH',
      'RHYTHM.IDENTICAL_CELL_REPETITION_HIGH',
    ],
  }),
  expectation({
    id: 'unresolved-leaps',
    generatorId: 'work03-broken-unresolved-leaps-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: [
      'CONTRACT.ADAPTER_CONTRACT_INVALID',
      'CONTRACT.SCHEDULE_INCOMPATIBLE',
      'FORM.EXACT_COPY_HIGH',
      'PITCH.LARGE_LEAP_RATE_HIGH',
      'PITCH.UNRESOLVED_LEAP_RATE_HIGH',
      'RHYTHM.IDENTICAL_CELL_REPETITION_HIGH',
    ],
  }),
  expectation({
    id: 'zero-rests',
    generatorId: 'work03-broken-zero-rests-v1',
    recommendedSessionId: 'all-left',
    expectedFindingCodes: ['RHYTHM.ZERO_RESTS'],
  }),
  expectation({
    id: 'too-many-rests',
    generatorId: 'work03-broken-too-many-rests-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: [
      'RHYTHM.IDENTICAL_CELL_REPETITION_HIGH',
      'RHYTHM.REST_RATIO_HIGH',
    ],
  }),
  expectation({
    id: 'identical-duration',
    generatorId: 'work03-broken-identical-duration-v1',
    recommendedSessionId: 'palindromic-choices',
    expectedFindingCodes: ['RHYTHM.DURATION_COLLAPSE'],
  }),
  expectation({
    id: 'micro-note-explosion',
    generatorId: 'work03-broken-micro-note-explosion-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: [
      'CONTRACT.ADAPTER_CONTRACT_INVALID',
      'CONTRACT.DURATION_INVALID',
      'CONTRACT.SCHEDULE_INCOMPATIBLE',
      'FORM.EXACT_COPY_HIGH',
      'PITCH.REPEATED_NOTE_RUN',
      'RHYTHM.MICRO_NOTE_RATE_HIGH',
    ],
  }),
  expectation({
    id: 'out-of-range-notes',
    generatorId: 'work03-broken-out-of-range-notes-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: [
      'CONTRACT.ADAPTER_CONTRACT_INVALID',
      'CONTRACT.NOTE_OUT_OF_BOUNDS',
      'CONTRACT.SCHEDULE_INCOMPATIBLE',
      'FORM.EXACT_COPY_HIGH',
      'PITCH.LARGE_LEAP_RATE_HIGH',
      'PITCH.UNRESOLVED_LEAP_RATE_HIGH',
      'RHYTHM.IDENTICAL_CELL_REPETITION_HIGH',
    ],
  }),
  expectation({
    id: 'invalid-total-beats',
    generatorId: 'work03-broken-invalid-total-beats-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: [
      'CONTRACT.ADAPTER_CONTRACT_INVALID',
      'CONTRACT.SCHEDULE_INCOMPATIBLE',
      'CONTRACT.TOTAL_BEATS_MISMATCH',
    ],
  }),
  expectation({
    id: 'abrupt-ending',
    generatorId: 'work03-broken-abrupt-ending-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: [
      'CONTRACT.ADAPTER_CONTRACT_INVALID',
      'CONTRACT.PROVENANCE_INVALID',
      'CONTRACT.SCHEDULE_INCOMPATIBLE',
      'CONTRACT.TOTAL_BEATS_MISMATCH',
    ],
  }),
  expectation({
    id: 'excessive-motif-copy',
    generatorId: 'work03-broken-excessive-motif-copy-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: [
      'FORM.EXACT_COPY_HIGH',
      'RHYTHM.IDENTICAL_CELL_REPETITION_HIGH',
    ],
  }),
  expectation({
    id: 'no-motif-recurrence',
    generatorId: 'work03-broken-no-motif-recurrence-v1',
    recommendedSessionId: 'palindromic-choices',
    expectedFindingCodes: ['FORM.NO_MOTIF_RECURRENCE'],
  }),
  expectation({
    id: 'register-edge-trapping',
    generatorId: 'work03-broken-register-edge-trapping-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: [
      'FORM.EXACT_COPY_HIGH',
      'PITCH.REGISTER_EDGE_TRAP',
      'RHYTHM.IDENTICAL_CELL_REPETITION_HIGH',
    ],
  }),
  expectation({
    id: 'nondeterministic-tie-breaking',
    generatorId: 'work03-broken-nondeterministic-tie-breaking-v1',
    recommendedSessionId: 'all-right',
    expectedFindingCodes: ['ROBUSTNESS.NONDETERMINISTIC'],
  }),
] satisfies readonly BrokenGeneratorExpectation[])
