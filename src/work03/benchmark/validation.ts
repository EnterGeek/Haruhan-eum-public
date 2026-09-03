import type {
  BenchmarkExpectations,
  NormalizedMelody,
  ValidationCheck,
} from './types'

export const MAX_BENCHMARK_EVENTS = 4_096 as const
export const MAX_BENCHMARK_INPUT_ITEMS = 4_096 as const
export const MAX_DECLARED_DURATIONS = 256 as const
export const MAX_PROVENANCE_VALUES_PER_EVENT = 256 as const
export const BENCHMARK_NUMERIC_EPSILON = 1e-9

const check = (
  id: string,
  scope: ValidationCheck['scope'],
  passed: boolean,
  passMessage: string,
  failMessage: string,
): ValidationCheck => ({
  id,
  scope,
  passed,
  message: passed ? passMessage : failMessage,
})

const unavailableCheck = (
  id: string,
  scope: ValidationCheck['scope'],
  message: string,
): ValidationCheck => ({
  id,
  scope,
  passed: false,
  available: false,
  message,
})

const allFinite = (values: readonly number[]): boolean =>
  values.every(Number.isFinite)

const approximatelyEqual = (left: number, right: number): boolean =>
  Math.abs(left - right) <= BENCHMARK_NUMERIC_EPSILON *
    Math.max(1, Math.abs(left), Math.abs(right))

export function validateNormalizedMelody(
  melody: NormalizedMelody,
  inputLength: number,
  expectations?: BenchmarkExpectations,
): readonly ValidationCheck[] {
  const eventsBounded = melody.events.length > 0 &&
    melody.events.length <= MAX_BENCHMARK_EVENTS
  const durationsBounded = melody.allowedDurationsBeats.length > 0 &&
    melody.allowedDurationsBeats.length <= MAX_DECLARED_DURATIONS
  const sourcesBounded = eventsBounded && melody.events.every((event) =>
    event.source.presentedOrders.length <= MAX_PROVENANCE_VALUES_PER_EVENT &&
    event.source.selectionDirections.length <= MAX_PROVENANCE_VALUES_PER_EVENT &&
    event.source.contourPositions.length <= MAX_PROVENANCE_VALUES_PER_EVENT)
  const grammarShape = Number.isFinite(melody.tempoBpm) && melody.tempoBpm > 0 &&
    Number.isFinite(melody.totalBeats) && melody.totalBeats > 0 &&
    Number.isFinite(melody.minimumMidi) &&
    Number.isFinite(melody.maximumMidi) &&
    melody.minimumMidi <= melody.maximumMidi &&
    durationsBounded
  const eventShape = sourcesBounded && melody.events.every((event, index) =>
    event.eventIndex === index &&
    event.source.presentedOrders.length > 0 &&
    event.source.presentedOrders.length === event.source.selectionDirections.length &&
    event.source.presentedOrders.length === event.source.contourPositions.length)
  const schemaValid = grammarShape && eventShape

  const scalarValues = [
    melody.totalBeats,
    melody.tempoBpm,
    melody.minimumMidi,
    melody.maximumMidi,
    melody.tonicMidi,
    melody.maximumMelodicLeapSemitones,
  ]
  const finiteNumbersAvailable = eventsBounded && sourcesBounded && durationsBounded
  const finiteNumbers = finiteNumbersAvailable &&
    allFinite(scalarValues) &&
    allFinite(melody.allowedDurationsBeats) &&
    melody.events.every((event) =>
      allFinite([event.eventIndex, event.startBeat, event.durationBeats]) &&
      (event.kind === 'rest' || Number.isFinite(event.midiNote)) &&
      allFinite(event.source.presentedOrders) &&
      allFinite(event.source.contourPositions))

  const allowedDurationsFinite =
    durationsBounded &&
    allFinite(melody.allowedDurationsBeats) &&
    melody.allowedDurationsBeats.every((duration) => duration > 0)
  const durationValidityAvailable = eventsBounded && durationsBounded
  const durationValid = durationValidityAvailable && allowedDurationsFinite &&
    melody.events.every((event) =>
      Number.isFinite(event.durationBeats) &&
      event.durationBeats > 0 &&
      melody.allowedDurationsBeats.some((duration) =>
        approximatelyEqual(duration, event.durationBeats)))

  let expectedStart = 0
  const contiguous = eventsBounded && melody.events.every((event) => {
    if (!Number.isFinite(event.startBeat) || !Number.isFinite(event.durationBeats)) {
      return false
    }
    const startsCorrectly = approximatelyEqual(event.startBeat, expectedStart)
    expectedStart = event.startBeat + event.durationBeats
    return startsCorrectly
  })
  const totalBeatConsistency = eventsBounded && contiguous &&
    Number.isFinite(melody.totalBeats) &&
    approximatelyEqual(expectedStart, melody.totalBeats)

  const noteBounds = eventsBounded &&
    Number.isInteger(melody.minimumMidi) &&
    Number.isInteger(melody.maximumMidi) &&
    melody.minimumMidi <= melody.maximumMidi &&
    melody.events.every((event) => event.kind === 'rest' || (
      Number.isInteger(event.midiNote) &&
      event.midiNote >= melody.minimumMidi &&
      event.midiNote <= melody.maximumMidi
    ))

  const seenOrders = new Set<number>()
  let previousOrder = 0
  const inputLengthBounded = Number.isSafeInteger(inputLength) &&
    inputLength > 0 &&
    inputLength <= MAX_BENCHMARK_INPUT_ITEMS
  let provenanceValid = sourcesBounded && inputLengthBounded
  if (sourcesBounded && inputLengthBounded) {
    for (const event of melody.events) {
      const source = event.source
      if (
        source.presentedOrders.length === 0 ||
        source.presentedOrders.length !== source.selectionDirections.length ||
        source.presentedOrders.length !== source.contourPositions.length
      ) {
        provenanceValid = false
        continue
      }
      source.presentedOrders.forEach((order, index) => {
        const direction = source.selectionDirections[index]
        const contour = source.contourPositions[index]
        if (
          !Number.isSafeInteger(order) ||
          order < 1 ||
          order > inputLength ||
          order < previousOrder ||
          (direction !== 'left' && direction !== 'right') ||
          !Number.isFinite(contour) ||
          contour < 0 ||
          contour > 1
        ) {
          provenanceValid = false
        }
        previousOrder = order
        seenOrders.add(order)
        if (expectations) {
          const expectedIndex = order - 1
          if (
            expectations.presentedOrders[expectedIndex] !== order ||
            expectations.selectionDirections[expectedIndex] !== direction ||
            (expectations.contourPositions !== undefined &&
              !approximatelyEqual(expectations.contourPositions[expectedIndex], contour))
          ) {
            provenanceValid = false
          }
        }
      })
    }
  }
  if (inputLengthBounded) {
    for (let order = 1; order <= inputLength; order += 1) {
      if (!seenOrders.has(order)) provenanceValid = false
    }
  }

  return [
    check(
      'SCHEMA_VALIDITY',
      'schema',
      schemaValid,
      'Normalized output has a bounded, inspectable schema.',
      `Normalized output schema is invalid or exceeds ${MAX_BENCHMARK_EVENTS} events.`,
    ),
    finiteNumbersAvailable
      ? check(
          'FINITE_NUMBERS',
          'finite-numbers',
          finiteNumbers,
          'All inspected numeric values are finite.',
          'At least one inspected numeric value is non-finite.',
        )
      : unavailableCheck(
          'FINITE_NUMBERS',
          'finite-numbers',
          'Numeric scan was not run because a traversal bound was exceeded.',
        ),
    durationValidityAvailable
      ? check(
          'DURATION_VALIDITY',
          'duration',
          durationValid,
          'Every event has a positive declared duration.',
          'An event duration is non-positive, non-finite, or outside the declared vocabulary.',
        )
      : unavailableCheck(
          'DURATION_VALIDITY',
          'duration',
          'Duration scan was not run because a traversal bound was exceeded.',
        ),
    eventsBounded
      ? check(
          'TOTAL_BEATS',
          'timeline',
          totalBeatConsistency,
          'The event timeline is contiguous and ends at totalBeats.',
          'The event timeline has a gap, overlap, invalid start, or mismatched ending.',
        )
      : unavailableCheck(
          'TOTAL_BEATS',
          'timeline',
          'Timeline scan was not run because the event bound was exceeded.',
        ),
    eventsBounded
      ? check(
          'NOTE_BOUNDS',
          'note-bounds',
          noteBounds,
          'All notes are integers inside the declared register.',
          'At least one note is non-integer or outside the declared register.',
        )
      : unavailableCheck(
          'NOTE_BOUNDS',
          'note-bounds',
          'Note scan was not run because the event bound was exceeded.',
        ),
    sourcesBounded && inputLengthBounded
      ? check(
          'PROVENANCE',
          'provenance',
          provenanceValid,
          'Output provenance is ordered, complete, and input-correlated where declared.',
          'Output provenance is malformed, incomplete, out of order, or disagrees with input.',
        )
      : unavailableCheck(
          'PROVENANCE',
          'provenance',
          'Provenance scan was not run because a traversal or input bound was exceeded.',
        ),
  ]
}
