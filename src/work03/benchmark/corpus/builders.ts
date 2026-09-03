import { oklchToHex } from '../../../domain/color'
import { generateDeck } from '../../../domain/deck'
import {
  DECK_VERSION,
  SESSION_SCHEMA_VERSION,
  type ColorDeck,
  type Decision,
  type Direction,
  type InputMethod,
  type InteractionEvent,
  type SessionExport,
} from '../../../domain/types'
import { validateSessionExport } from '../../../work02/sessionAdapter'

export type SyntheticSessionStep =
  | {
      kind: 'commit'
      direction: Direction
      inputMethod: InputMethod
      advanceMs?: number
    }
  | {
      kind: 'undo'
      advanceMs?: number
    }
  | {
      kind: 'wait'
      durationMs: number
    }

export interface SyntheticSessionOptions {
  caseId: string
  dayOffset: number
  deckSeed: string
  steps: readonly SyntheticSessionStep[]
  deck?: ColorDeck
}

type EventWithoutSequence<T = InteractionEvent> =
  T extends InteractionEvent ? Omit<T, 'sequence'> : never

const requireNonNegativeInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`)
  }
}

const occurredAt = (epochMs: number): string => new Date(epochMs).toISOString()

/**
 * Builds a complete Work 01 session without consulting the clock, locale, UUID,
 * browser state, or randomness outside the versioned deck seed.
 */
export function buildSyntheticSession(
  options: SyntheticSessionOptions,
): SessionExport {
  if (!options.caseId.trim()) throw new Error('caseId must not be empty.')
  requireNonNegativeInteger(options.dayOffset, 'dayOffset')

  const deck = options.deck ?? generateDeck(options.deckSeed)
  if (deck.deckVersion !== DECK_VERSION || deck.deckSeed !== options.deckSeed) {
    throw new Error('The supplied deck must match the Work 01 version and deckSeed.')
  }

  const createdEpochMs = Date.UTC(2035, 0, 1 + options.dayOffset)
  let eventEpochMs = createdEpochMs + 1_000
  const startedAt = occurredAt(eventEpochMs)
  const decisions: Decision[] = []
  const interactionEvents: InteractionEvent[] = [{
    sequence: 1,
    type: 'session_started',
    occurredAt: startedAt,
  }]

  const appendEvent = (event: EventWithoutSequence): void => {
    interactionEvents.push({
      ...event,
      sequence: interactionEvents.length + 1,
    } as InteractionEvent)
  }

  options.steps.forEach((step, stepIndex) => {
    if (step.kind === 'wait') {
      requireNonNegativeInteger(step.durationMs, `steps[${stepIndex}].durationMs`)
      eventEpochMs += step.durationMs
      return
    }

    const advanceMs = step.advanceMs ?? 1_000
    requireNonNegativeInteger(advanceMs, `steps[${stepIndex}].advanceMs`)
    eventEpochMs += advanceMs

    if (step.kind === 'undo') {
      const previous = decisions.at(-1)
      if (!previous) throw new Error(`steps[${stepIndex}] cannot undo an empty session.`)
      decisions.pop()
      appendEvent({
        type: 'decision_undone',
        occurredAt: occurredAt(eventEpochMs),
        cardId: previous.cardId,
        presentedOrder: previous.presentedOrder,
        previousDirection: previous.direction,
      })
      return
    }

    const card = deck.cards[decisions.length]
    if (!card) {
      throw new Error(`steps[${stepIndex}] commits after all cards are decided.`)
    }
    const decision: Decision = {
      ...card,
      direction: step.direction,
      deckVersion: deck.deckVersion,
      deckSeed: deck.deckSeed,
    }
    decisions.push(decision)
    appendEvent({
      type: 'decision_committed',
      occurredAt: occurredAt(eventEpochMs),
      cardId: card.cardId,
      presentedOrder: card.presentedOrder,
      direction: step.direction,
      inputMethod: step.inputMethod,
    })
  })

  if (decisions.length !== deck.cards.length) {
    throw new Error(
      `Synthetic session must end with ${deck.cards.length} decisions; got ${decisions.length}.`,
    )
  }
  const completedAt = occurredAt(eventEpochMs)
  appendEvent({ type: 'session_completed', occurredAt: completedAt })

  return validateSessionExport({
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: `work03-synthetic-${options.caseId}`,
    localDate: occurredAt(createdEpochMs).slice(0, 10),
    timeZone: 'UTC',
    createdAt: occurredAt(createdEpochMs),
    startedAt,
    completedAt,
    deck,
    decisions,
    interactionEvents,
  })
}

export function commitSteps(
  directions: readonly Direction[],
  options: {
    inputMethods?: readonly InputMethod[]
    advanceMs?: number
    advancesMs?: readonly number[]
  } = {},
): SyntheticSessionStep[] {
  if (options.inputMethods && options.inputMethods.length !== directions.length) {
    throw new RangeError('inputMethods must match the direction count.')
  }
  if (options.advancesMs && options.advancesMs.length !== directions.length) {
    throw new RangeError('advancesMs must match the direction count.')
  }
  return directions.map((direction, index) => ({
    kind: 'commit',
    direction,
    inputMethod: options.inputMethods?.[index] ?? 'button',
    advanceMs: options.advancesMs?.[index] ?? options.advanceMs,
  }))
}

export function buildHueDeck(
  deckSeed: string,
  hues: readonly number[],
): ColorDeck {
  if (hues.length !== 12) throw new RangeError('A hue deck requires exactly 12 hues.')
  const base = generateDeck(deckSeed)
  return {
    ...base,
    cards: base.cards.map((card, index) => {
      const hue = hues[index]
      if (!Number.isFinite(hue) || hue < 0 || hue >= 360) {
        throw new RangeError(`hues[${index}] must be finite and in [0, 360).`)
      }
      return {
        ...card,
        hue,
        hex: oklchToHex(card.lightness, card.chroma, hue),
      }
    }),
  }
}

export function buildRepeatedColorDeck(deckSeed: string): ColorDeck {
  const base = generateDeck(deckSeed)
  const source = base.cards[0]
  return {
    ...base,
    cards: base.cards.map((card) => ({
      ...card,
      hex: source.hex,
      hue: source.hue,
      lightness: source.lightness,
      chroma: source.chroma,
    })),
  }
}
