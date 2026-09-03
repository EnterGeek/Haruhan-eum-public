import { describe, expect, it } from 'vitest'
import type { MelodyOutput } from '../../../work02/music/types'
import { buildSessionCorpus } from '../corpus/sessionCorpus'
import { evaluateGenerator } from '../evaluate'
import {
  generateWork02Baseline,
  perturbWork02Session,
  WORK02_BASELINE_GENERATOR_ID,
  WORK02_BENCHMARK_PROFILES,
} from './work02'

describe('Work 02 baseline benchmark adapter', () => {
  it('runs the current generator through all three interpretation profiles', async () => {
    const session = buildSessionCorpus()[0].session
    for (const profile of WORK02_BENCHMARK_PROFILES) {
      const evaluation = await evaluateGenerator({
        session,
        generate: generateWork02Baseline,
        generatorId: WORK02_BASELINE_GENERATOR_ID,
        seed: 23,
        profile,
      })
      expect(evaluation.validation).toMatchObject({
        generatorCompleted: true,
        inspectionAvailable: true,
        contractValid: true,
        scheduleCompatible: true,
      })
      expect(evaluation.metrics.robustness.sameSeedDeterminism).toMatchObject({
        status: 'measured',
        value: true,
      })
      expect(evaluation.metrics.rhythm.phraseBoundaryAlignmentProxy.status)
        .toBe('measured')
      expect(evaluation.output).not.toBeNull()
    }
  })

  it('perturbs a session without mutating its card/decision consistency', () => {
    const session = buildSessionCorpus()[0].session
    const perturbed = perturbWork02Session(session)

    expect(perturbed).not.toBe(session)
    expect(perturbed.deck.cards[0].hue).not.toBe(session.deck.cards[0].hue)
    expect(perturbed.deck.cards[0].hue).toBe(perturbed.decisions[0].hue)
    expect(session.deck.cards[0].hue).toBe(session.decisions[0].hue)
  })

  it('catches provenance that is shape-valid but disagrees with the source session', async () => {
    const session = buildSessionCorpus().find((item) => item.id === 'all-right')!.session
    const profile = WORK02_BENCHMARK_PROFILES[0]
    const evaluation = await evaluateGenerator({
      session,
      generate: async (options) => {
        const output = structuredClone(
          await generateWork02Baseline(options) as MelodyOutput,
        )
        const first = output.events[0]
        first.source.selectionDirections = ['left']
        return output
      },
      generatorId: 'work03-provenance-negative-control',
      seed: 1,
      profile,
    })

    expect(evaluation.validation.checks.find(
      (item) => item.id === 'WORK02_MELODY_CONTRACT',
    )?.passed).toBe(true)
    expect(evaluation.validation.contractValid).toBe(false)
    expect(evaluation.findings.map((item) => item.code)).toContain(
      'CONTRACT.PROVENANCE_INVALID',
    )
  })

  it('contains a sparse malformed output as a schema failure instead of throwing', async () => {
    const session = buildSessionCorpus()[0].session
    const profile = WORK02_BENCHMARK_PROFILES[0]
    const evaluation = await evaluateGenerator({
      session,
      generate: async (options) => {
        const output = structuredClone(
          await generateWork02Baseline(options) as MelodyOutput,
        )
        output.events = Array<MelodyOutput['events'][number]>(12)
        return output
      },
      generatorId: 'work03-sparse-output-control',
      seed: 2,
      profile,
    })

    expect(evaluation.validation.inspectionAvailable).toBe(false)
    expect(evaluation.validation.contractValid).toBe(false)
    expect(evaluation.findings).toContainEqual(expect.objectContaining({
      code: 'CONTRACT.SCHEMA_INVALID',
      resultCategory: 'hard-contract-violation',
    }))
  })
})
