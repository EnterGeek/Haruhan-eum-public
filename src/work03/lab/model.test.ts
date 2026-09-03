import { describe, expect, it } from 'vitest'
import { validateWork03AudioSchedule } from '../audio/validateSchedule'
import { WORK03_STRUCTURAL_METRICS_VERSION } from '../versions'
import {
  DEFAULT_WORK03_LAB_SELECTION,
  WORK03_LAB_EXPORT_VERSION,
  WORK03_LAB_FIXTURE_IDS,
  WORK03_LAB_METHODS,
  WORK03_LAB_PROFILE_IDS,
  createWork03LabResult,
} from './model'

describe('Work 03 standalone Lab model', () => {
  it('publishes exactly the frozen 16-fixture, 3-method, and 6-profile controls', () => {
    expect(WORK03_LAB_FIXTURE_IDS).toHaveLength(16)
    expect(new Set(WORK03_LAB_FIXTURE_IDS).size).toBe(16)
    expect(WORK03_LAB_METHODS).toEqual([
      'absolute-hue',
      'relative-hue',
      'hybrid',
    ])
    expect(WORK03_LAB_PROFILE_IDS).toEqual([
      'CALM_SPARSE',
      'BALANCED_LYRICAL',
      'PULSING',
      'RESTLESS_CONTOUR',
      'OPEN_ENDED',
      'RESOLVED',
    ])
    expect(Object.isFrozen(WORK03_LAB_FIXTURE_IDS)).toBe(true)
    expect(Object.isFrozen(WORK03_LAB_METHODS)).toBe(true)
    expect(Object.isFrozen(WORK03_LAB_PROFILE_IDS)).toBe(true)
  })

  it('builds the requested Work 02 baseline and validated Work 03 comparison', () => {
    const lab = createWork03LabResult(DEFAULT_WORK03_LAB_SELECTION)

    expect(lab.selection).toEqual(DEFAULT_WORK03_LAB_SELECTION)
    expect(lab.directions).toHaveLength(12)
    expect(lab.baseline.melodyOutput.versions).toMatchObject({
      outputContract: 'work02-melody-output-v2',
      generator: 'work02-melody-generator-v0',
      grammar: 'work02-music-grammar-v0',
    })
    expect(lab.baseline.metrics.version).toBe(WORK03_STRUCTURAL_METRICS_VERSION)
    expect(lab.grammarV1.result.melodyOutput.versions).toMatchObject({
      outputContract: 'work03-melody-output-v1',
      generator: 'work03-grammar-generator-v1',
      grammar: 'work03-music-grammar-v1',
    })
    expect(lab.grammarV1.result.melodyOutput.grammar.profile).toBe(
      DEFAULT_WORK03_LAB_SELECTION.profile,
    )
    expect(lab.grammarV1.metrics.version).toBe(WORK03_STRUCTURAL_METRICS_VERSION)
    expect(validateWork03AudioSchedule(
      lab.grammarV1.audioSchedule,
      lab.grammarV1.result,
    )).toBe(lab.grammarV1.audioSchedule)
  })

  it.each(WORK03_LAB_FIXTURE_IDS)(
    'supports every method/profile combination for public fixture %s',
    (fixtureId) => {
      WORK03_LAB_METHODS.forEach((method) => {
        WORK03_LAB_PROFILE_IDS.forEach((profile) => {
          const lab = createWork03LabResult({ fixtureId, method, profile })
          expect(lab.selection).toEqual({ fixtureId, method, profile })
          expect(lab.seed).toBe(
            `work03-public-eval-v1|${fixtureId}|${method}|${profile}`,
          )
          expect(lab.baseline.melodyOutput.method).toBe(method)
          expect(lab.grammarV1.result.melodyOutput.method).toBe(method)
          expect(lab.grammarV1.result.melodyOutput.grammar.profile).toBe(profile)
          expect(validateWork03AudioSchedule(
            lab.grammarV1.audioSchedule,
            lab.grammarV1.result,
          )).toBe(lab.grammarV1.audioSchedule)
        })
      })
    },
  )

  it('creates byte-identical compact exports without ambient metadata', () => {
    const selection = {
      fixtureId: 'irregular',
      method: 'relative-hue',
      profile: 'OPEN_ENDED',
    } as const
    const first = createWork03LabResult(selection)
    const second = createWork03LabResult(selection)
    const payload = JSON.parse(first.exportJson)

    expect(second.exportJson).toBe(first.exportJson)
    expect(first.exportJson).not.toContain('\n')
    expect(payload.version).toBe(WORK03_LAB_EXPORT_VERSION)
    expect(payload.selection).toEqual({
      ...selection,
      seed: 'work03-public-eval-v1|irregular|relative-hue|OPEN_ENDED',
    })
    expect(payload.baseline.metrics).toEqual(first.baseline.metrics)
    expect(payload.grammarV1.result).toEqual(first.grammarV1.result)
    expect(payload.grammarV1.audioSchedule).toEqual(
      first.grammarV1.audioSchedule,
    )
    expect(first.exportJson).not.toMatch(
      /"(?:createdAt|timestamp|timeZone|locale|telemetry)"/,
    )
    expect(first.exportFileName).toBe(
      'haruhan-eum-work03-irregular-relative-hue-OPEN_ENDED.json',
    )
  })

  it('returns an immutable envelope without mutating deterministic results', () => {
    const first = createWork03LabResult(DEFAULT_WORK03_LAB_SELECTION)
    const before = structuredClone(first.grammarV1.result)
    const second = createWork03LabResult(DEFAULT_WORK03_LAB_SELECTION)

    expect(first.grammarV1.result).toEqual(before)
    expect(second).toEqual(first)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.selection)).toBe(true)
    expect(Object.isFrozen(first.directions)).toBe(true)
    expect(Object.isFrozen(first.baseline)).toBe(true)
    expect(Object.isFrozen(first.grammarV1)).toBe(true)
  })

  it.each([
    [{ fixtureId: 'private-session', method: 'hybrid', profile: 'RESOLVED' }, 'fixture'],
    [{ fixtureId: 'irregular', method: 'random', profile: 'RESOLVED' }, 'method'],
    [{ fixtureId: 'irregular', method: 'hybrid', profile: 'DIAGNOSIS' }, 'profile'],
  ])('rejects unsupported public-boundary selection %o', (selection, label) => {
    expect(() => createWork03LabResult(selection)).toThrow(
      new RegExp(`Unsupported Work 03 Lab ${label}`),
    )
  })
})
