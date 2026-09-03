import { describe, expect, it } from 'vitest'
import {
  WORK03_DIRECTION_DENSITY_FIXTURE_IDS,
  WORK03_GOLDEN_FIXTURE_IDS,
  WORK03_MATHEMATICAL_FIXTURE_IDS,
  WORK03_PUBLIC_FIXTURE_IDS,
  createWork03PublicFixtureInput,
  work03EvaluationSeed,
} from './publicFixtures'

describe('Work 03 frozen public fixture matrix', () => {
  it('contains exactly seven golden, seven mathematical, and two density fixtures', () => {
    expect(WORK03_GOLDEN_FIXTURE_IDS).toHaveLength(7)
    expect(WORK03_MATHEMATICAL_FIXTURE_IDS).toHaveLength(7)
    expect(WORK03_DIRECTION_DENSITY_FIXTURE_IDS).toHaveLength(2)
    expect(WORK03_PUBLIC_FIXTURE_IDS).toHaveLength(16)
    expect(new Set(WORK03_PUBLIC_FIXTURE_IDS).size).toBe(16)
  })

  it.each(WORK03_PUBLIC_FIXTURE_IDS)('constructs deterministic valid-shaped %s input', (
    fixtureId,
  ) => {
    const first = createWork03PublicFixtureInput(fixtureId)
    const second = createWork03PublicFixtureInput(fixtureId)
    expect(second).toEqual(first)
    expect(first).toHaveLength(12)
    expect(first.map((item) => item.index)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    )
    first.forEach((item) => {
      expect(item.color.lightness).toBeGreaterThanOrEqual(0)
      expect(item.color.lightness).toBeLessThanOrEqual(1)
      expect(item.color.chroma).toBeGreaterThanOrEqual(0)
      expect(item.direction === 'left' || item.direction === 'right').toBe(true)
    })
  })

  it('freezes exact direction-density proxies without changing public deck colors', () => {
    const baseline = createWork03PublicFixtureInput('same-deck-baseline')
    const sparse = createWork03PublicFixtureInput('sparse-direction')
    const dense = createWork03PublicFixtureInput('dense-direction')
    expect(sparse.map((item) => item.direction).join('')).toBe(
      'leftleftleftleftrightleftleftleftleftrightleftleft',
    )
    expect(dense.filter((item) => item.direction === 'right')).toHaveLength(10)
    expect(sparse.filter((item) => item.direction === 'left')).toHaveLength(10)
    expect(sparse.map((item) => item.color)).toEqual(baseline.map((item) => item.color))
    expect(dense.map((item) => item.color)).toEqual(baseline.map((item) => item.color))
  })

  it('uses the pre-registered seed namespace exactly', () => {
    expect(work03EvaluationSeed(
      'undo-and-reselect',
      'hybrid',
      'BALANCED_LYRICAL',
    )).toBe(
      'work03-public-eval-v1|undo-and-reselect|hybrid|BALANCED_LYRICAL',
    )
  })
})
