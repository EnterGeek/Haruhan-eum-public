import { describe, expect, it } from 'vitest'
import { evaluateGenerator } from './evaluate'
import type { BenchmarkProfile, NormalizedMelody } from './types'

interface TestOutput {
  events: number[]
}

const normalized: NormalizedMelody = {
  totalBeats: 1,
  tempoBpm: 60,
  minimumMidi: 60,
  maximumMidi: 72,
  tonicMidi: 60,
  maximumMelodicLeapSemitones: 7,
  allowedDurationsBeats: [1],
  events: [{
    kind: 'note',
    eventIndex: 0,
    startBeat: 0,
    durationBeats: 1,
    midiNote: 60,
    source: {
      presentedOrders: [1],
      selectionDirections: ['right'],
      contourPositions: [0.5],
    },
  }],
}

const profile: BenchmarkProfile<{ items: number[] }, TestOutput> = {
  id: 'test-profile',
  inputLength: (session) => session.items.length,
  inspectOutput: () => normalized,
  validateOutput: () => [{
    id: 'TEST_CONTRACT',
    scope: 'adapter-contract',
    passed: true,
    message: 'valid',
  }],
}

describe('generator-independent benchmark envelope', () => {
  it('returns the required shape with stable same-seed determinism', async () => {
    const evaluation = await evaluateGenerator({
      session: { items: [1] },
      generate: ({ seed }) => ({ events: [seed] }),
      generatorId: 'test-generator',
      seed: 17,
      profile,
    })

    expect(evaluation.output).toEqual({ events: [17] })
    expect(evaluation.validation.contractValid).toBe(true)
    expect(evaluation.metrics.robustness.sameSeedDeterminism).toMatchObject({
      status: 'measured',
      value: true,
    })
    expect(evaluation.findings).toEqual([])
    expect(evaluation.failureSignature).toMatch(/^work03-failure-v1:[0-9a-f]{8}$/)
    expect(evaluation.resultCategory).toBe('abstain-no-finding')
  })

  it('detects same-seed nondeterminism without using runtime in the signature', async () => {
    let counter = 0
    const evaluation = await evaluateGenerator({
      session: { items: [1] },
      generate: () => ({ events: [counter += 1] }),
      generatorId: 'stateful-test-generator',
      seed: 1,
      profile,
    })

    expect(evaluation.findings.map((finding) => finding.code)).toContain(
      'ROBUSTNESS.NONDETERMINISTIC',
    )
    expect(evaluation.resultCategory).toBe('high-confidence-structural-risk')
  })

  it('captures generator errors as hard contract failures', async () => {
    const evaluation = await evaluateGenerator({
      session: { items: [1] },
      generate: () => {
        throw new Error('synthetic failure')
      },
      generatorId: 'throwing-test-generator',
      seed: 1,
      profile,
    })

    expect(evaluation.output).toBeNull()
    expect(evaluation.validation.generatorCompleted).toBe(false)
    expect(evaluation.findings.map((finding) => finding.code)).toContain(
      'CONTRACT.GENERATOR_THROW',
    )
    expect(evaluation.resultCategory).toBe('hard-contract-violation')
  })

  it('bounds a never-resolving asynchronous generator call', async () => {
    const evaluation = await evaluateGenerator({
      session: { items: [1] },
      generate: () => new Promise<TestOutput>(() => undefined),
      generatorId: 'never-resolving-test-generator',
      seed: 1,
      profile,
      timeoutMilliseconds: 5,
    })

    expect(evaluation.validation.generatorCompleted).toBe(false)
    expect(evaluation.findings.map((finding) => finding.code)).toContain(
      'CONTRACT.GENERATOR_TIMEOUT',
    )
    expect(evaluation.metrics.robustness.runtime.status).toBe('unavailable')
  })

  it('isolates fresh session and profile data from an impure generator', async () => {
    const originalSession = { items: [1] }
    const originalProfile: BenchmarkProfile<typeof originalSession, TestOutput> = {
      ...profile,
      id: 'mutation-isolation-profile',
    }
    const evaluation = await evaluateGenerator({
      session: originalSession,
      generate: ({ session: receivedSession, profile: receivedProfile }) => {
        receivedSession.items.push(2)
        receivedProfile.id = 'mutated-inside-generator'
        return { events: [receivedSession.items.length, receivedProfile.id.length] }
      },
      generatorId: 'impure-test-generator',
      seed: 3,
      profile: originalProfile,
    })

    expect(originalSession).toEqual({ items: [1] })
    expect(originalProfile.id).toBe('mutation-isolation-profile')
    expect(evaluation.metrics.robustness.sameSeedDeterminism).toMatchObject({
      status: 'measured',
      value: true,
    })
  })

  it('detects a generator that reuses and mutates one output object', async () => {
    const shared: TestOutput = { events: [0] }
    let invocation = 0
    const evaluation = await evaluateGenerator({
      session: { items: [1] },
      generate: () => {
        shared.events[0] = invocation += 1
        return shared
      },
      generatorId: 'shared-reference-test-generator',
      seed: 1,
      profile,
    })

    expect(evaluation.output).toEqual({ events: [1] })
    expect(evaluation.findings.map((finding) => finding.code)).toContain(
      'ROBUSTNESS.NONDETERMINISTIC',
    )
  })

  it('returns an uncertainty envelope when output canonicalization rejects a cycle', async () => {
    interface CyclicOutput { self?: CyclicOutput }
    const cyclicProfile: BenchmarkProfile<{ items: number[] }, CyclicOutput> = {
      id: 'cyclic-profile',
      inputLength: (value) => value.items.length,
      inspectOutput: () => normalized,
      validateOutput: () => [],
    }
    const evaluation = await evaluateGenerator({
      session: { items: [1] },
      generate: () => {
        const output: CyclicOutput = {}
        output.self = output
        return output
      },
      generatorId: 'cyclic-output-generator',
      seed: 1,
      profile: cyclicProfile,
    })

    expect(evaluation.validation.generatorCompleted).toBe(true)
    expect(evaluation.metrics.robustness.sameSeedDeterminism.status)
      .toBe('unavailable')
    expect(evaluation.findings.map((finding) => finding.code)).toContain(
      'METRIC.DETERMINISM_UNAVAILABLE',
    )
  })

  it('rejects an adapter validator that impersonates benchmark schema scope', async () => {
    const invalidProfile: BenchmarkProfile<{ items: number[] }, TestOutput> = {
      ...profile,
      validateOutput: () => [{
        id: 'IMPERSONATED_SCHEMA',
        scope: 'schema',
        passed: false,
        message: 'not an adapter-owned scope',
      }],
    }
    const evaluation = await evaluateGenerator({
      session: { items: [1] },
      generate: () => ({ events: [1] }),
      generatorId: 'wrong-scope-adapter-generator',
      seed: 1,
      profile: invalidProfile,
    })

    expect(evaluation.validation.contractValid).toBe(false)
    expect(evaluation.findings).toContainEqual(expect.objectContaining({
      code: 'CONTRACT.ADAPTER_CONTRACT_INVALID',
      resultCategory: 'hard-contract-violation',
    }))
  })

  it('keeps an unevaluated schedule check unavailable rather than incompatible', async () => {
    const scheduleUnavailableProfile: BenchmarkProfile<
      { items: number[] },
      TestOutput
    > = {
      ...profile,
      validateSchedule: () => ({
        id: 'TEST_SCHEDULE_UNAVAILABLE',
        scope: 'schedule',
        passed: false,
        available: false,
        message: 'Schedule validation was not run.',
      }),
    }
    const evaluation = await evaluateGenerator({
      session: { items: [1] },
      generate: () => ({ events: [1] }),
      generatorId: 'schedule-unavailable-generator',
      seed: 1,
      profile: scheduleUnavailableProfile,
    })

    expect(evaluation.validation.scheduleCompatible).toBeNull()
    expect(evaluation.validation.contractValid).toBe(false)
    expect(evaluation.metrics.validity.scheduleCompatibility.status)
      .toBe('unavailable')
    expect(evaluation.findings.map((finding) => finding.code)).toContain(
      'METRIC.SCHEDULE_VALIDATION_UNAVAILABLE',
    )
    expect(evaluation.findings.map((finding) => finding.code)).not.toContain(
      'CONTRACT.SCHEDULE_INCOMPATIBLE',
    )
  })
})
