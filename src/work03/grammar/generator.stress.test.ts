import { describe, expect, it } from 'vitest'
import goldenSessions from '../../../docs/golden-sessions/representative-sessions.json'
import { expandGoldenCase } from '../../work02/golden/expandGoldenCase'
import { interpretFlow } from '../../work02/interpretation/interpretFlow'
import { GRAMMAR_PROFILE_IDS } from './types'
import { generateGrammarV1 } from './generator'
import { validateGrammarV1Result } from './validateOutput'

const runtime = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
}
const stressDescribe = runtime.process?.env?.HARUHAN_STRESS === '1'
  ? describe
  : describe.skip

stressDescribe('Work 03 deterministic grammar nightly stress', () => {
  it('replays 256 seeds across all six profiles without contract drift', () => {
    const input = expandGoldenCase(goldenSessions, 'same-deck-baseline')
    const interpretation = interpretFlow(input, 'hybrid')

    for (let seedIndex = 0; seedIndex < 256; seedIndex += 1) {
      GRAMMAR_PROFILE_IDS.forEach((profile) => {
        const request = {
          interpretation,
          profile,
          seed: `work03-nightly-stress-v1|${seedIndex}|${profile}`,
        } as const
        const first = validateGrammarV1Result(generateGrammarV1(request))
        const replay = validateGrammarV1Result(generateGrammarV1({
          ...request,
          interpretation: structuredClone(interpretation),
        }))
        expect(replay).toEqual(first)
      })
    }
  })
})
