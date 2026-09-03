import { describe, expect, it } from 'vitest'
import type { InteractionEvent } from '../../../domain/types'
import { adaptSessionExport, validateSessionExport } from '../../../work02/sessionAdapter'
import {
  INPUT_PATTERN_FAMILIES,
  buildSessionCorpus,
} from './index'
import {
  MAXIMUM_BOUNDED_SESSION_EVENT_COUNT,
  MAXIMUM_BOUNDED_UNDO_COUNT,
  MINIMUM_VALID_SESSION_EVENT_COUNT,
} from './sessionCorpus'

const eventTime = (event: InteractionEvent): number => Date.parse(event.occurredAt)

describe('deterministic adversarial session corpus', () => {
  it('covers every requested input-pattern family with stable unique IDs', () => {
    const corpus = buildSessionCorpus()
    const covered = [...new Set(corpus.flatMap((item) => item.families))].sort()

    expect(covered).toEqual([...INPUT_PATTERN_FAMILIES].sort())
    expect(new Set(corpus.map((item) => item.id)).size).toBe(corpus.length)
  })

  it('builds fresh but deeply deterministic values', () => {
    const first = buildSessionCorpus()
    const second = buildSessionCorpus()

    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(second[0].session).not.toBe(first[0].session)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('keeps every synthetic session inside the Work 01 and Work 02 boundaries', () => {
    buildSessionCorpus().forEach((item) => {
      expect(validateSessionExport(item.session)).toEqual(item.session)
      const input = adaptSessionExport(item.session)
      expect(input).toHaveLength(12)
      expect(input.map((entry) => entry.index)).toEqual(
        Array.from({ length: 12 }, (_, index) => index + 1),
      )
    })
  })

  it('pins the minimum and maximum event-count boundaries', () => {
    const corpus = buildSessionCorpus()
    const minimum = corpus.find((item) => item.id === 'minimum-valid-session')
    const maximum = corpus.find((item) => item.id === 'maximum-bounded-session')

    expect(minimum?.session.interactionEvents).toHaveLength(
      MINIMUM_VALID_SESSION_EVENT_COUNT,
    )
    expect(maximum?.session.interactionEvents).toHaveLength(
      MAXIMUM_BOUNDED_SESSION_EVENT_COUNT,
    )
    expect(maximum?.session.interactionEvents.filter(
      (event) => event.type === 'decision_undone',
    )).toHaveLength(MAXIMUM_BOUNDED_UNDO_COUNT)
  })

  it('preserves undo/reselect history while retaining only final decisions', () => {
    const corpus = buildSessionCorpus()
    const undoCase = corpus.find((item) => item.id === 'undo-then-reselect')
    const repeatedCase = corpus.find(
      (item) => item.id === 'repeated-same-card-and-deck-patterns',
    )

    expect(undoCase?.session.interactionEvents.filter(
      (event) => event.type === 'decision_undone',
    )).toHaveLength(2)
    expect(undoCase?.session.decisions).toHaveLength(12)

    const repeatedEvents = repeatedCase?.session.interactionEvents.filter(
      (event) => 'presentedOrder' in event && event.presentedOrder === 1,
    ) ?? []
    expect(repeatedEvents).toHaveLength(13)
    expect(repeatedCase?.session.decisions).toHaveLength(12)
    expect(new Set(repeatedCase?.session.deck.cards.map((card) => card.cardId)).size)
      .toBe(12)
    expect(new Set(repeatedCase?.session.deck.cards.map((card) => card.hue)).size)
      .toBe(1)
  })

  it('models pauses as deterministic timestamp gaps without inventing event types', () => {
    const corpus = buildSessionCorpus()
    const paused = corpus.find((item) => item.id === 'pause-and-resume')
    const events = paused?.session.interactionEvents ?? []
    const gaps = events.slice(1).map(
      (event, index) => eventTime(event) - eventTime(events[index]),
    )

    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(1_800_000)
    expect(events.every((event) => [
      'session_started',
      'decision_committed',
      'decision_undone',
      'session_completed',
    ].includes(event.type))).toBe(true)
  })

  it('separates sparse, dense, and very-fast timing deterministically', () => {
    const corpus = buildSessionCorpus()
    const commitGaps = (id: string): number[] => {
      const session = corpus.find((item) => item.id === id)?.session
      const commits = session?.interactionEvents.filter(
        (event) => event.type === 'decision_committed',
      ) ?? []
      return commits.slice(1).map(
        (event, index) => eventTime(event) - eventTime(commits[index]),
      )
    }

    expect(new Set(commitGaps('sparse-interactions'))).toEqual(new Set([60_000]))
    expect(new Set(commitGaps('dense-interactions'))).toEqual(new Set([100]))
    expect(new Set(commitGaps('very-fast-interaction-timestamps')))
      .toEqual(new Set([1]))
  })

  it('uses an identical deck for the paired same-deck replay sessions', () => {
    const replayCases = buildSessionCorpus().filter(
      (item) => item.families.includes('same-deck-replay'),
    )

    expect(replayCases).toHaveLength(2)
    expect(replayCases[1].session.deck).toEqual(replayCases[0].session.deck)
    expect(replayCases[1].session.decisions.map((decision) => decision.direction))
      .toEqual(replayCases[0].session.decisions.map((decision) => decision.direction))
    expect(replayCases[1].session.sessionId).not.toBe(replayCases[0].session.sessionId)
  })

  it('retains exact hue wrap and antipodal edge values', () => {
    const edge = buildSessionCorpus().find((item) => item.id === 'edge-hue-transitions')
    expect(edge?.session.deck.cards.map((card) => card.hue)).toEqual([
      0, 359.999, 0.001, 180, 179.999, 180.001,
      1, 358.999, 90, 270, 0.5, 359.5,
    ])
  })
})
