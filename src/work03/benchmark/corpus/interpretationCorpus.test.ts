import { describe, expect, it } from 'vitest'
import { validateFlowInterpretationForMelody } from '../../../work02/music/generator'
import { validateSessionExport } from '../../../work02/sessionAdapter'
import {
  INTERPRETATION_STRESS_FAMILIES,
  buildInterpretationCorpus,
} from './index'

describe('deterministic interpretation stress corpus', () => {
  it('covers every requested family and remains deterministic', () => {
    const first = buildInterpretationCorpus()
    const second = buildInterpretationCorpus()
    const covered = [...new Set(first.flatMap((item) => item.families))].sort()

    expect(covered).toEqual([...INTERPRETATION_STRESS_FAMILIES].sort())
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length)
  })

  it('attaches a valid synthetic SessionExport to every interpretation case', () => {
    buildInterpretationCorpus().forEach((item) => {
      expect(validateSessionExport(item.session)).toEqual(item.session)
    })
  })

  it('accepts all positive stresses and rejects all provenance-negative controls', () => {
    const corpus = buildInterpretationCorpus()
    const valid = corpus.filter((item) => item.expectedValidity === 'valid')
    const invalid = corpus.filter(
      (item) => item.expectedValidity === 'invalid-provenance',
    )

    expect(valid).toHaveLength(7)
    valid.forEach((item) => {
      expect(validateFlowInterpretationForMelody(item.interpretation))
        .toBe(item.interpretation)
    })

    expect(invalid).toHaveLength(3)
    invalid.forEach((item) => {
      expect(() => validateFlowInterpretationForMelody(item.interpretation))
        .toThrow(/Invalid FlowInterpretation for melody/)
    })
  })

  it('pins monotonic, zig-zag, flat, extreme, and contradictory contours', () => {
    const corpus = buildInterpretationCorpus()
    const positions = (id: string): readonly number[] =>
      corpus.find((item) => item.id === id)?.interpretation
        .registerContourCandidates.map((candidate) => candidate.normalizedPosition) ?? []

    expect(positions('monotonic-contour')).toEqual(
      Array.from({ length: 12 }, (_, index) => index / 11),
    )
    expect(positions('zig-zag-contour')).toEqual(
      Array.from({ length: 12 }, (_, index) => index % 2 === 0 ? 0.05 : 0.95),
    )
    expect(new Set(positions('flat-contour'))).toEqual(new Set([0.5]))
    expect(new Set(positions('extreme-contour-span'))).toEqual(new Set([0, 1]))

    const contradictory = corpus.find(
      (item) => item.id === 'contradictory-candidate-tendencies',
    )
    expect(contradictory?.interpretation.items.map((item) => item.normalizedHuePosition))
      .toEqual(Array.from({ length: 12 }, (_, index) => index * 30 / 360))
    expect(positions('contradictory-candidate-tendencies'))
      .toEqual(Array.from({ length: 12 }, (_, index) => (11 - index) / 11))
  })

  it('preserves repeated source values and boundary hue values exactly', () => {
    const corpus = buildInterpretationCorpus()
    const repeated = corpus.find((item) => item.id === 'repeated-source-values')
    const boundary = corpus.find((item) => item.id === 'boundary-hue-values')

    expect(new Set(repeated?.interpretation.items.map((item) => JSON.stringify([
      item.normalizedHue,
      item.lightness,
      item.chroma,
    ]))).size).toBe(1)
    expect(boundary?.session.deck.cards.map((card) => card.hue)).toEqual([
      0, 359.999, 0.001, 180, 179.999, 180.001,
      1, 358.999, 90, 270, 0.5, 359.5,
    ])
  })

  it('uses three distinct provenance failures rather than malformed sessions', () => {
    const invalid = buildInterpretationCorpus().filter(
      (item) => item.expectedValidity === 'invalid-provenance',
    )

    expect(invalid.map((item) => item.id)).toEqual([
      'provenance-wrong-method-source',
      'provenance-stale-interpreter-source',
      'provenance-wrong-presented-order',
    ])
    invalid.forEach((item) => {
      expect(() => validateFlowInterpretationForMelody(item.interpretation)).toThrow()
      expect(() => validateSessionExport(item.session)).not.toThrow()
    })
  })
})
