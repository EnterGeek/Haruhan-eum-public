import { describe, expect, it } from 'vitest'
import type { SessionExport } from '../../../domain/types'
import { canonicalJson } from '../canonical'
import {
  WORK02_BENCHMARK_PROFILES,
  generateWork02Baseline,
  inspectWork02Output,
} from '../adapters/work02'
import { buildSessionCorpus } from '../corpus'
import {
  BROKEN_GENERATOR_CASES,
  BROKEN_GENERATOR_EXPECTATIONS,
  GENERATOR_FAILURE_INJECTION_IDS,
  MAX_BROKEN_OUTPUT_EVENTS,
  MAX_BROKEN_OUTPUT_JSON_BYTES,
  REQUIRED_BROKEN_FINDING_CODES,
  createBrokenGenerator,
  type BrokenGeneratorExpectation,
  type GeneratorFailureInjectionId,
} from './index'

const profile = WORK02_BENCHMARK_PROFILES[0]
const sessions = new Map(
  buildSessionCorpus().map((item) => [item.id, item.session] as const),
)

const sessionFor = (expectation: BrokenGeneratorExpectation): SessionExport => {
  const session = sessions.get(expectation.recommendedSessionId)
  if (!session) throw new Error(
    `Missing recommended session ${expectation.recommendedSessionId}.`,
  )
  return session
}

const optionsFor = (expectation: BrokenGeneratorExpectation) => ({
  session: sessionFor(expectation),
  seed: 20260904,
  profile,
})

const expectationFor = (
  id: GeneratorFailureInjectionId,
): BrokenGeneratorExpectation => {
  const result = BROKEN_GENERATOR_EXPECTATIONS.find((item) => item.id === id)
  if (!result) throw new Error(`Missing expectation for ${id}.`)
  return result
}

const notePitches = (output: unknown): readonly number[] =>
  inspectWork02Output(output).events.flatMap(
    (event) => event.kind === 'note' ? [event.midiNote] : [],
  )

const adjacentIntervals = (pitches: readonly number[]): readonly number[] =>
  pitches.slice(1).map((pitch, index) => pitch - pitches[index])

describe('broken generator registry', () => {
  it('covers all sixteen Prompt 7 injections once in stable order', () => {
    expect(BROKEN_GENERATOR_EXPECTATIONS.map((item) => item.id)).toEqual(
      GENERATOR_FAILURE_INJECTION_IDS,
    )
    expect(BROKEN_GENERATOR_CASES.map((item) => item.id)).toEqual(
      GENERATOR_FAILURE_INJECTION_IDS,
    )
    expect(BROKEN_GENERATOR_CASES).toHaveLength(16)
    expect(new Set(BROKEN_GENERATOR_CASES.map((item) => item.id)).size).toBe(16)
    expect(new Set(BROKEN_GENERATOR_CASES.map((item) => item.generatorId)).size)
      .toBe(16)
  })

  it('uses only documented stable finding codes as non-empty required subsets', () => {
    const allowed = new Set<string>(REQUIRED_BROKEN_FINDING_CODES)
    BROKEN_GENERATOR_EXPECTATIONS.forEach((item) => {
      expect(item.expectedFindingCodes.length).toBeGreaterThan(0)
      expect(new Set(item.expectedFindingCodes).size).toBe(
        item.expectedFindingCodes.length,
      )
      item.expectedFindingCodes.forEach((code) => {
        expect(code).toMatch(
          /^(CONTRACT|FORM|PITCH|RHYTHM|ROBUSTNESS)\.[A-Z0-9_]+$/,
        )
        expect(allowed.has(code)).toBe(true)
      })
      expect(sessions.has(item.recommendedSessionId)).toBe(true)
    })
  })

  it('exposes a fresh factory for every expectation', () => {
    BROKEN_GENERATOR_CASES.forEach((item) => {
      expect(typeof item.createGenerator()).toBe('function')
      expect(item.createGenerator()).not.toBe(item.createGenerator())
    })
  })
})

describe('broken generator determinism and bounds', () => {
  it.each(BROKEN_GENERATOR_EXPECTATIONS)(
    '$id preserves the Work 02 envelope and stays inside fixture limits',
    async (expectation) => {
      const generator = createBrokenGenerator(expectation.id)
      const options = optionsFor(expectation)
      const template = await generateWork02Baseline(options)
      const first = await generator(options)
      const second = await generator(options)
      const inspection = inspectWork02Output(first)

      expect((first as { versions: unknown }).versions).toEqual(
        (template as { versions: unknown }).versions,
      )
      expect((first as { grammar: unknown }).grammar).toEqual(
        (template as { grammar: unknown }).grammar,
      )
      expect(inspection.events.length).toBeGreaterThan(0)
      expect(inspection.events.length).toBeLessThanOrEqual(MAX_BROKEN_OUTPUT_EVENTS)
      expect(new TextEncoder().encode(JSON.stringify(first)).byteLength)
        .toBeLessThanOrEqual(MAX_BROKEN_OUTPUT_JSON_BYTES)

      if (expectation.id === 'nondeterministic-tie-breaking') {
        expect(canonicalJson(second)).not.toBe(canonicalJson(first))
      } else {
        expect(canonicalJson(second)).toBe(canonicalJson(first))
      }
    },
  )

  it('resets the intentional nondeterminism when a fresh factory is created', async () => {
    const expectation = expectationFor('nondeterministic-tie-breaking')
    const options = optionsFor(expectation)
    const firstFactoryOutput = await createBrokenGenerator(expectation.id)(options)
    const secondFactoryOutput = await createBrokenGenerator(expectation.id)(options)
    expect(canonicalJson(secondFactoryOutput)).toBe(canonicalJson(firstFactoryOutput))
  })
})

describe('broken generator mutation shapes', () => {
  it.each(GENERATOR_FAILURE_INJECTION_IDS)(
    '%s creates its bounded adversarial shape',
    async (id) => {
      const expectation = expectationFor(id)
      const generator = createBrokenGenerator(id)
      const first = await generator(optionsFor(expectation))
      const melody = inspectWork02Output(first)
      const pitches = notePitches(first)
      const rests = melody.events.filter((event) => event.kind === 'rest')
      const durations = melody.events.map((event) => event.durationBeats)

      switch (id) {
        case 'constant-pitch':
          expect(new Set(pitches)).toEqual(new Set([64]))
          break
        case 'endless-ascending-sequence':
          expect(pitches.some((pitch, index) => index > 0 && pitch > pitches[index - 1]))
            .toBe(true)
          expect(pitches.every((pitch, index) => index === 0 || pitch >= pitches[index - 1]))
            .toBe(true)
          break
        case 'endless-descending-sequence':
          expect(pitches.some((pitch, index) => index > 0 && pitch < pitches[index - 1]))
            .toBe(true)
          expect(pitches.every((pitch, index) => index === 0 || pitch <= pitches[index - 1]))
            .toBe(true)
          break
        case 'octave-ping-pong':
          expect(new Set(adjacentIntervals(pitches).map(Math.abs))).toEqual(new Set([12]))
          break
        case 'unresolved-leaps': {
          const intervals = adjacentIntervals(pitches)
          expect(intervals.some((interval, index) =>
            Math.abs(interval) > melody.maximumMelodicLeapSemitones &&
            index + 1 < intervals.length &&
            Math.sign(intervals[index + 1]) === Math.sign(interval),
          )).toBe(true)
          break
        }
        case 'zero-rests':
          expect(rests).toHaveLength(0)
          break
        case 'too-many-rests':
          expect(pitches).toHaveLength(1)
          expect(rests.length / melody.events.length).toBeGreaterThan(0.9)
          break
        case 'identical-duration':
          expect(new Set(durations)).toEqual(new Set([0.5]))
          expect(melody.events).toHaveLength(24)
          break
        case 'micro-note-explosion':
          expect(melody.events).toHaveLength(MAX_BROKEN_OUTPUT_EVENTS)
          expect(Math.max(...durations)).toBe(1 / 16)
          break
        case 'out-of-range-notes':
          expect(pitches.every((pitch) =>
            pitch < melody.minimumMidi || pitch > melody.maximumMidi,
          )).toBe(true)
          break
        case 'invalid-total-beats':
          expect(melody.totalBeats).not.toBe(
            (first as { grammar: { totalBeats: number } }).grammar.totalBeats,
          )
          break
        case 'abrupt-ending': {
          const last = melody.events.at(-1)
          expect(last).toBeDefined()
          expect((last?.startBeat ?? 0) + (last?.durationBeats ?? 0))
            .toBeLessThan(melody.totalBeats)
          break
        }
        case 'excessive-motif-copy':
          expect(pitches.every((pitch, index) => pitch === [60, 62, 64][index % 3]))
            .toBe(true)
          break
        case 'no-motif-recurrence': {
          const pairs = pitches.slice(1).map(
            (pitch, index) => `${pitches[index]}:${pitch}`,
          )
          expect(new Set(pairs).size).toBe(pairs.length)
          break
        }
        case 'register-edge-trapping':
          expect(pitches.every((pitch) =>
            pitch <= melody.minimumMidi + 2 || pitch >= melody.maximumMidi - 2,
          )).toBe(true)
          break
        case 'nondeterministic-tie-breaking': {
          const second = await generator(optionsFor(expectation))
          expect(canonicalJson(second)).not.toBe(canonicalJson(first))
          break
        }
        default: {
          const exhaustive: never = id
          throw new Error(`Unhandled broken generator ID: ${exhaustive}`)
        }
      }
    },
  )
})
