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
    scope: 'schema',
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
      'ROBUST_NONDETERMINISTIC',
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
      'CONTRACT_GENERATOR_THROW',
    )
    expect(evaluation.resultCategory).toBe('hard-contract-violation')
  })
})
