import { describe, expect, it } from 'vitest'
import type { NormalizedMelody } from './types'
import { MAX_BENCHMARK_EVENTS, validateNormalizedMelody } from './validation'

const source = {
  presentedOrders: [1],
  selectionDirections: ['right'] as const,
  contourPositions: [0.5],
}

const valid = (): NormalizedMelody => ({
  totalBeats: 1,
  tempoBpm: 80,
  minimumMidi: 60,
  maximumMidi: 76,
  tonicMidi: 60,
  maximumMelodicLeapSemitones: 7,
  allowedDurationsBeats: [0.5, 1],
  events: [{
    kind: 'note',
    eventIndex: 0,
    startBeat: 0,
    durationBeats: 1,
    midiNote: 60,
    source,
  }],
})

const failedIds = (melody: NormalizedMelody): string[] =>
  validateNormalizedMelody(melody, 1).filter((item) => !item.passed).map((item) => item.id)

describe('benchmark-owned structural validation', () => {
  it('accepts a bounded normalized timeline without using Work 02 version literals', () => {
    expect(validateNormalizedMelody(valid(), 1).every((item) => item.passed)).toBe(true)
  })

  it.each([
    ['non-finite', (melody: NormalizedMelody) => {
      (melody.events[0] as { durationBeats: number }).durationBeats = Number.NaN
    }, 'FINITE_NUMBERS'],
    ['duration', (melody: NormalizedMelody) => {
      (melody.events[0] as { durationBeats: number }).durationBeats = 0.25
    }, 'DURATION_VALIDITY'],
    ['timeline', (melody: NormalizedMelody) => {
      (melody.events[0] as { startBeat: number }).startBeat = 0.5
    }, 'TOTAL_BEATS'],
    ['note bounds', (melody: NormalizedMelody) => {
      (melody.events[0] as { midiNote: number }).midiNote = 77
    }, 'NOTE_BOUNDS'],
    ['provenance', (melody: NormalizedMelody) => {
      (melody.events[0].source.presentedOrders as number[])[0] = 2
    }, 'PROVENANCE'],
  ])('isolates %s failures', (_, corrupt, expectedId) => {
    const melody = structuredClone(valid())
    corrupt(melody)
    expect(failedIds(melody)).toContain(expectedId)
  })

  it('rejects output above the traversal cap', () => {
    const melody = valid()
    ;(melody as { events: NormalizedMelody['events'] }).events = Array.from(
      { length: MAX_BENCHMARK_EVENTS + 1 },
      (_, index) => ({
      ...melody.events[0],
      eventIndex: index,
      startBeat: index,
      }),
    )
    const checks = validateNormalizedMelody(melody, 1)
    expect(failedIds(melody)).toContain('SCHEMA_VALIDITY')
    expect(checks.filter((item) => item.available === false).map((item) => item.id))
      .toEqual([
        'FINITE_NUMBERS',
        'DURATION_VALIDITY',
        'TOTAL_BEATS',
        'NOTE_BOUNDS',
        'PROVENANCE',
      ])
  })

  it('cross-checks directions and contours when an adapter provides expectations', () => {
    const checks = validateNormalizedMelody(valid(), 1, {
      presentedOrders: [1],
      selectionDirections: ['left'],
      contourPositions: [0.5],
    })
    expect(checks.find((item) => item.id === 'PROVENANCE')?.passed).toBe(false)
  })

  it('accepts decimal duration arithmetic within the frozen numeric tolerance', () => {
    const melody: NormalizedMelody = {
      ...valid(),
      totalBeats: 0.3,
      allowedDurationsBeats: [0.1, 0.2],
      events: [
        {
          ...valid().events[0],
          eventIndex: 0,
          startBeat: 0,
          durationBeats: 0.1,
        },
        {
          ...valid().events[0],
          eventIndex: 1,
          startBeat: 0.1,
          durationBeats: 0.2,
        },
      ],
    }

    const checks = validateNormalizedMelody(melody, 1)
    expect(checks.find((item) => item.id === 'DURATION_VALIDITY')?.passed).toBe(true)
    expect(checks.find((item) => item.id === 'TOTAL_BEATS')?.passed).toBe(true)
  })
})
