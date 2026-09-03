import { describe, expect, it } from 'vitest'
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
})
