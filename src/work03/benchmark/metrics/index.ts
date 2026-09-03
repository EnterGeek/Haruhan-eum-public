import type {
  BenchmarkExpectations,
  BenchmarkMetrics,
  FormMetrics,
  MetricConfidence,
  MetricObservation,
  NormalizedMelody,
  NormalizedMelodyEvent,
  PitchMetrics,
  RhythmMetrics,
  RobustnessMetrics,
  RuntimeObservation,
  ScalingObservation,
  ValidityMetrics,
} from '../types'
import {
  BENCHMARK_NUMERIC_EPSILON,
  MAX_BENCHMARK_EVENTS,
  MAX_DECLARED_DURATIONS,
  MAX_PROVENANCE_VALUES_PER_EVENT,
} from '../validation'

export const DEFAULT_EVENT_TRAVERSAL_LIMIT = MAX_BENCHMARK_EVENTS

const MAX_PHRASE_BOUNDARIES = 256
const MAX_EXACT_BEAT_CELLS = MAX_BENCHMARK_EVENTS
const MOTIF_NOTE_COUNT = 3
const EDGE_BAND_SEMITONES = 2
const RESOLUTION_MAX_SEMITONES = 4
const MICRO_NOTE_BEATS = 0.25

export interface MetricAnalysisContext {
  /** Result from the benchmark-owned normalized-shape validator. */
  schemaValid: boolean | null
  /** Result from the adapter's native audio-schedule validator. */
  scheduleCompatible: boolean | null
  /** Exact canonical comparison of two same-seed generator calls. */
  sameSeedDeterminism?: boolean | null
  /** Caller-defined, documented perturbation distance. */
  perturbationSensitivity?: number | null
  /** Caller-measured wall-clock samples. */
  runtime?: RuntimeObservation | null
  /** A single input/output size observation, not a fitted slope. */
  outputSizeScaling?: ScalingObservation | null
  /** Optional expected phrase boundaries used by the alignment proxy. */
  phraseBoundaryBeats?: readonly number[] | null
  /** Independent input expectations; output-carried provenance is not a target. */
  expectations?: BenchmarkExpectations | null
  /** Test/debug override. Production callers should normally use the default. */
  traversalLimit?: number
}

const measured = <T>(
  value: T,
  confidence: MetricConfidence,
  rationale: string,
): MetricObservation<T> => ({
  status: 'measured',
  value,
  confidence,
  rationale,
})

const unavailable = <T>(rationale: string): MetricObservation<T> => ({
  status: 'unavailable',
  confidence: 'insufficient',
  rationale,
})

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isDenseArray = (value: readonly unknown[]): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false
  }
  return true
}

const isBoundedDenseArray = (
  value: unknown,
  maximumLength: number,
): value is readonly unknown[] =>
  Array.isArray(value) &&
  value.length <= maximumLength &&
  isDenseArray(value)

const approximatelyEqual = (left: number, right: number): boolean =>
  Math.abs(left - right) <= BENCHMARK_NUMERIC_EPSILON *
    Math.max(1, Math.abs(left), Math.abs(right))

/** Stable key for equality-based metric buckets under the shared tolerance. */
const numericMetricKey = (value: number): string =>
  Object.is(value, -0) ? '0' : Number(value.toPrecision(9)).toString()

const ratio = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value))

const pitchClass = (midiNote: number): number =>
  ((midiNote % 12) + 12) % 12

const direction = (value: number): -1 | 0 | 1 => {
  if (Math.abs(value) <= BENCHMARK_NUMERIC_EPSILON) return 0
  return value < 0 ? -1 : 1
}

const metricUnavailableReason = (reason: string): string =>
  `Metric unavailable: ${reason}`

const unavailablePitch = (reason: string): PitchMetrics => ({
  pitchClassDiversity: unavailable(reason),
  intervalHistogram: unavailable(reason),
  largeLeapRate: unavailable(reason),
  unresolvedLeapRate: unavailable(reason),
  repeatedNoteRunLength: unavailable(reason),
  registerUtilization: unavailable(reason),
  edgeOccupancy: unavailable(reason),
  tonalCenterDriftProxy: unavailable(reason),
})

const unavailableRhythm = (reason: string): RhythmMetrics => ({
  durationDiversity: unavailable(reason),
  onsetDensity: unavailable(reason),
  restRatio: unavailable(reason),
  longestUninterruptedRun: unavailable(reason),
  identicalCellRepetition: unavailable(reason),
  microNoteRate: unavailable(reason),
  phraseBoundaryAlignmentProxy: unavailable(reason),
})

const unavailableForm = (reason: string): FormMetrics => ({
  motifRecurrence: unavailable(reason),
  exactCopyRatio: unavailable(reason),
  variationRatio: unavailable(reason),
  phraseLengthDistribution: unavailable(reason),
  cadenceFinalStabilityProxy: unavailable(reason),
  openingEndingSimilarity: unavailable(reason),
  contourAgreement: unavailable(reason),
})

const schemaValidityFor = (
  context: MetricAnalysisContext,
): MetricObservation<boolean> => typeof context.schemaValid === 'boolean'
  ? measured(
      context.schemaValid,
      'contract',
      'The value is supplied by the benchmark-owned normalized-shape validator.',
    )
  : unavailable(
      'The benchmark did not supply a normalized-shape validation result.',
    )

const scheduleCompatibilityFor = (
  context: MetricAnalysisContext,
): MetricObservation<boolean> => typeof context.scheduleCompatible === 'boolean'
  ? measured(
      context.scheduleCompatible,
      'contract',
      'The value is supplied by the generator adapter native schedule validator.',
    )
  : unavailable(
      'The generator adapter did not supply a native schedule-validation result.',
    )

const unavailableEventMetrics = (
  context: MetricAnalysisContext,
  robustness: RobustnessMetrics,
  reason: string,
): BenchmarkMetrics => ({
  validity: {
    schemaValidity: schemaValidityFor(context),
    finiteNumbers: unavailable(reason),
    durationValidity: unavailable(reason),
    totalBeatConsistency: unavailable(reason),
    noteBounds: unavailable(reason),
    scheduleCompatibility: scheduleCompatibilityFor(context),
  },
  pitch: unavailablePitch(reason),
  rhythm: unavailableRhythm(reason),
  form: unavailableForm(reason),
  robustness,
})

const eventNumericFieldsAreFinite = (event: NormalizedMelodyEvent): boolean => {
  if (
    !isFiniteNumber(event.eventIndex) ||
    !isFiniteNumber(event.startBeat) ||
    !isFiniteNumber(event.durationBeats)
  ) {
    return false
  }
  if (event.kind === 'note' && !isFiniteNumber(event.midiNote)) return false
  const { contourPositions, presentedOrders } = event.source
  return (
    Array.isArray(contourPositions) &&
    contourPositions.every(isFiniteNumber) &&
    Array.isArray(presentedOrders) &&
    presentedOrders.every(isFiniteNumber)
  )
}

const sourceTraversalIsBounded = (events: readonly NormalizedMelodyEvent[]): boolean =>
  events.every((event) =>
    isBoundedDenseArray(
      event.source.contourPositions,
      MAX_PROVENANCE_VALUES_PER_EVENT,
    ) &&
    isBoundedDenseArray(
      event.source.presentedOrders,
      MAX_PROVENANCE_VALUES_PER_EVENT,
    ) &&
    isBoundedDenseArray(
      event.source.selectionDirections,
      MAX_PROVENANCE_VALUES_PER_EVENT,
    ))

const hasInspectableEventShell = (
  value: unknown,
): value is NormalizedMelodyEvent => {
  if (!isRecord(value) || (value.kind !== 'note' && value.kind !== 'rest')) {
    return false
  }
  if (!isRecord(value.source)) return false
  return Array.isArray(value.source.contourPositions) &&
    Array.isArray(value.source.presentedOrders) &&
    Array.isArray(value.source.selectionDirections)
}

function analyzeValidity(
  normalized: NormalizedMelody,
  events: readonly NormalizedMelodyEvent[],
  context: MetricAnalysisContext,
  sourceTraversalBounded: boolean,
): ValidityMetrics {
  const schemaValidity = schemaValidityFor(context)
  const scheduleCompatibility = scheduleCompatibilityFor(context)

  const scalarFields = [
    normalized.totalBeats,
    normalized.tempoBpm,
    normalized.minimumMidi,
    normalized.maximumMidi,
    normalized.tonicMidi,
    normalized.maximumMelodicLeapSemitones,
  ]
  const durationsWithinLimit = Array.isArray(normalized.allowedDurationsBeats) &&
    normalized.allowedDurationsBeats.length <= MAX_DECLARED_DURATIONS
  const durationsDense = durationsWithinLimit &&
    isDenseArray(normalized.allowedDurationsBeats)
  const finiteNumbers = !sourceTraversalBounded || !durationsWithinLimit
    ? unavailable<boolean>(
        'A declared-duration or per-event source array exceeded the bounded numeric traversal budget.',
      )
    : measured(
        durationsDense &&
          scalarFields.every(isFiniteNumber) &&
          normalized.allowedDurationsBeats.every(isFiniteNumber) &&
          events.every(eventNumericFieldsAreFinite),
        'contract',
        'All normalized scalar, duration, event, pitch, and numeric provenance fields were checked with Number.isFinite.',
      )

  const allowedDurations = durationsWithinLimit
    ? normalized.allowedDurationsBeats
    : null
  const durationValidity = allowedDurations === null
    ? unavailable<boolean>(
        'The declared duration set exceeded the bounded traversal budget.',
      )
    : measured(
        durationsDense &&
          events.length > 0 &&
          allowedDurations.length > 0 &&
          allowedDurations.every((duration) =>
            isFiniteNumber(duration) && duration > 0) &&
          events.every((event) =>
            isFiniteNumber(event.durationBeats) &&
            event.durationBeats > 0 &&
            allowedDurations.some((allowed) =>
              approximatelyEqual(event.durationBeats, allowed))),
        'contract',
        'Every event duration must be finite, positive, and equal to one declared allowed duration.',
      )

  let timelineConsistent =
    isFiniteNumber(normalized.totalBeats) && normalized.totalBeats > 0 &&
    events.length > 0
  let cursor = 0
  if (timelineConsistent) {
    for (const event of events) {
      if (
        !isFiniteNumber(event.startBeat) ||
        !isFiniteNumber(event.durationBeats) ||
        event.durationBeats <= 0 ||
        !approximatelyEqual(event.startBeat, cursor)
      ) {
        timelineConsistent = false
        break
      }
      cursor += event.durationBeats
      if (!Number.isFinite(cursor)) {
        timelineConsistent = false
        break
      }
    }
    timelineConsistent = timelineConsistent &&
      approximatelyEqual(cursor, normalized.totalBeats)
  }

  const totalBeatConsistency = measured(
    timelineConsistent,
    'contract',
    'In event order, the timeline must start at beat 0, contain no gaps or overlaps, and end at declared totalBeats.',
  )

  const boundsValid =
    Number.isSafeInteger(normalized.minimumMidi) &&
    Number.isSafeInteger(normalized.maximumMidi) &&
    normalized.minimumMidi <= normalized.maximumMidi &&
    events.every((event) =>
      event.kind !== 'note' ||
      (Number.isSafeInteger(event.midiNote) &&
        event.midiNote >= normalized.minimumMidi &&
        event.midiNote <= normalized.maximumMidi))
  const noteBounds = measured(
    boundsValid,
    'contract',
    'Every note must be a safe integer inside the inclusive safe-integer declared MIDI register.',
  )

  return {
    schemaValidity,
    finiteNumbers,
    durationValidity,
    totalBeatConsistency,
    noteBounds,
    scheduleCompatibility,
  }
}

const notesFrom = (
  events: readonly NormalizedMelodyEvent[],
): readonly Extract<NormalizedMelodyEvent, { kind: 'note' }>[] =>
  events.filter(
    (event): event is Extract<NormalizedMelodyEvent, { kind: 'note' }> =>
      event.kind === 'note',
  )

const intervalHistogramFor = (
  intervals: readonly number[],
): Readonly<Record<string, number>> => {
  const counts = new Map<number, number>()
  intervals.forEach((interval) => {
    counts.set(interval, (counts.get(interval) ?? 0) + 1)
  })
  const result: Record<string, number> = {}
  ;[...counts.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([interval, count]) => {
      const key = interval > 0 ? `+${interval}` : String(interval)
      result[key] = count
    })
  return result
}

const longestRepeatedNoteRun = (
  events: readonly NormalizedMelodyEvent[],
): number => {
  let longest = 0
  let current = 0
  let previousPitch: number | null = null
  for (const event of events) {
    if (event.kind === 'rest') {
      current = 0
      previousPitch = null
      continue
    }
    if (previousPitch !== null && event.midiNote === previousPitch) {
      current += 1
    } else {
      current = 1
    }
    previousPitch = event.midiNote
    longest = Math.max(longest, current)
  }
  return longest
}

const jensenShannonPitchClassDivergence = (
  first: readonly number[],
  last: readonly number[],
): number => {
  const histogram = (values: readonly number[]): number[] => {
    const counts = Array.from({ length: 12 }, () => 0)
    values.forEach((value) => {
      counts[pitchClass(value)] += 1
    })
    return counts.map((count) => count / values.length)
  }
  const left = histogram(first)
  const right = histogram(last)
  const midpoint = left.map((value, index) => (value + right[index]) / 2)
  const divergence = (distribution: readonly number[]): number =>
    distribution.reduce((sum, probability, index) =>
      probability === 0
        ? sum
        : sum + probability * Math.log2(probability / midpoint[index]), 0)
  return clampUnit((divergence(left) + divergence(right)) / 2)
}

function analyzePitch(
  normalized: NormalizedMelody,
  events: readonly NormalizedMelodyEvent[],
): PitchMetrics {
  const notes = notesFrom(events)
  if (notes.length === 0) {
    return unavailablePitch(
      metricUnavailableReason('the normalized output contains no note events.'),
    )
  }
  if (notes.some((note) => !Number.isSafeInteger(note.midiNote))) {
    return unavailablePitch(
      metricUnavailableReason(
        'at least one MIDI note is fractional, non-finite, or outside the safe-integer range.',
      ),
    )
  }

  const pitches = notes.map((note) => note.midiNote)
  const intervals = pitches.slice(1).map((pitch, index) => pitch - pitches[index])
  if (intervals.some((interval) => !Number.isSafeInteger(interval))) {
    return unavailablePitch(
      metricUnavailableReason(
        'at least one derived pitch interval is outside the safe-integer range.',
      ),
    )
  }
  const uniquePitchClasses = new Set(pitches.map(pitchClass)).size
  const pitchClassDiversity = measured(
    clampUnit(ratio(uniquePitchClasses, Math.min(12, pitches.length))),
    'high',
    'Unique observed pitch classes divided by min(12, note count); range [0, 1].',
  )

  const intervalHistogram = intervals.length === 0
    ? unavailable<Readonly<Record<string, number>>>(
        'At least two notes are required to observe a melodic interval.',
      )
    : measured(
        intervalHistogramFor(intervals),
        'high',
        'Raw signed-semitone counts between consecutive note events; intervening rests do not create pitch samples.',
      )

  const leapLimit = normalized.maximumMelodicLeapSemitones
  const leapMetricsAvailable = intervals.length > 0 &&
    isFiniteNumber(leapLimit) && leapLimit >= 0
  const largeLeapIndexes = leapMetricsAvailable
    ? intervals.flatMap((interval, index) =>
        Math.abs(interval) > leapLimit ? [index] : [])
    : []
  const largeLeapRate = leapMetricsAvailable
    ? measured(
        ratio(largeLeapIndexes.length, intervals.length),
        'high',
        'Intervals whose absolute size exceeds maximumMelodicLeapSemitones divided by all observed pitch intervals.',
      )
    : unavailable<number>(
        'A finite non-negative leap threshold and at least one pitch interval are required.',
      )

  let unresolvedCount = 0
  for (const index of largeLeapIndexes) {
    const leap = intervals[index]
    const following = intervals[index + 1]
    const resolves = following !== undefined &&
      direction(following) === -direction(leap) &&
      Math.abs(following) >= 1 &&
      Math.abs(following) <= RESOLUTION_MAX_SEMITONES
    if (!resolves) unresolvedCount += 1
  }
  const unresolvedLeapRate = !leapMetricsAvailable || largeLeapIndexes.length === 0
    ? unavailable<number>(
        'No large leap exists, so an unresolved-large-leap denominator is unavailable.',
      )
    : measured(
        unresolvedCount / largeLeapIndexes.length,
        'high',
        'Among large leaps only, a leap is resolved when the next pitch interval reverses direction by 1 to 4 semitones.',
      )

  const repeatedNoteRunLength = measured(
    longestRepeatedNoteRun(events),
    'high',
    'Maximum consecutive equal-pitch note count in event order; every rest breaks the run.',
  )

  const registerAvailable =
    Number.isSafeInteger(normalized.minimumMidi) &&
    Number.isSafeInteger(normalized.maximumMidi)
  const registerWidth = registerAvailable
    ? normalized.maximumMidi - normalized.minimumMidi
    : Number.NaN
  const observedSpan = Math.max(...pitches) - Math.min(...pitches)
  const registerRatioAvailable = registerAvailable &&
    Number.isSafeInteger(registerWidth) && registerWidth > 0 &&
    Number.isSafeInteger(observedSpan) && observedSpan >= 0 &&
    Number.isSafeInteger(normalized.minimumMidi + EDGE_BAND_SEMITONES) &&
    Number.isSafeInteger(normalized.maximumMidi - EDGE_BAND_SEMITONES)
  const registerUtilization = registerRatioAvailable
    ? measured(
        observedSpan / registerWidth,
        'high',
        'Observed MIDI span divided by the positive declared MIDI-register span.',
      )
    : unavailable<number>(
        'A safe-integer declared register and finite positive safe-integer span are required.',
      )
  const edgeOccupancy = registerRatioAvailable
    ? measured(
        ratio(
          pitches.filter((pitch) =>
            pitch <= normalized.minimumMidi + EDGE_BAND_SEMITONES ||
            pitch >= normalized.maximumMidi - EDGE_BAND_SEMITONES).length,
          pitches.length,
        ),
        'high',
        'Notes within two semitones (inclusive) of either declared register edge divided by note count.',
      )
    : unavailable<number>(
        'A safe-integer declared register and finite positive safe-integer span are required.',
      )

  const thirdSize = Math.floor(pitches.length / 3)
  const tonalCenterDriftProxy = thirdSize < 3
    ? unavailable<number>(
        'At least nine notes are required to compare first and last thirds with three notes per window.',
      )
    : measured(
        jensenShannonPitchClassDivergence(
          pitches.slice(0, thirdSize),
          pitches.slice(-thirdSize),
        ),
        'low',
        'Base-2 Jensen-Shannon divergence between pitch-class histograms in the first and last thirds; range [0, 1].',
      )

  return {
    pitchClassDiversity,
    intervalHistogram,
    largeLeapRate,
    unresolvedLeapRate,
    repeatedNoteRunLength,
    registerUtilization,
    edgeOccupancy,
    tonalCenterDriftProxy,
  }
}

const exactEventCellSignature = (
  events: readonly NormalizedMelodyEvent[],
  totalBeats: number,
): readonly string[] | null => {
  if (
    !Number.isInteger(totalBeats) ||
    totalBeats < 2 ||
    totalBeats > MAX_EXACT_BEAT_CELLS
  ) return null
  const cells = Array.from({ length: totalBeats }, () => [] as string[])
  for (const event of events) {
    if (
      !isFiniteNumber(event.startBeat) ||
      !isFiniteNumber(event.durationBeats) ||
      event.startBeat < 0 ||
      event.durationBeats <= 0
    ) {
      return null
    }
    const cellIndex = Math.floor(event.startBeat)
    if (
      cellIndex < 0 ||
      cellIndex >= cells.length ||
      event.startBeat + event.durationBeats >
        cellIndex + 1 + BENCHMARK_NUMERIC_EPSILON
    ) {
      return null
    }
    const relativeStart = event.startBeat - cellIndex
    if (event.kind === 'note' && !Number.isSafeInteger(event.midiNote)) {
      return null
    }
    cells[cellIndex].push(event.kind === 'note'
      ? `n:${numericMetricKey(relativeStart)}:${numericMetricKey(event.durationBeats)}:${event.midiNote}`
      : `r:${numericMetricKey(relativeStart)}:${numericMetricKey(event.durationBeats)}`)
  }
  return cells.map((cell) => cell.join('|'))
}

const phraseBoundaryAlignment = (
  events: readonly NormalizedMelodyEvent[],
  totalBeats: number,
  boundaries: readonly number[] | null | undefined,
): MetricObservation<number> => {
  if (!isFiniteNumber(totalBeats) || totalBeats <= 0) {
    return unavailable('Declared totalBeats must be finite and positive.')
  }
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    return unavailable(
      'No explicit expected phrase-boundary beats were supplied by the profile.',
    )
  }
  if (
    boundaries.length > MAX_PHRASE_BOUNDARIES ||
    !isDenseArray(boundaries) ||
    !boundaries.every((beat) =>
      isFiniteNumber(beat) && beat > 0 && beat < totalBeats)
  ) {
    return unavailable(
      'Expected phrase boundaries must be bounded finite beats strictly inside the output timeline.',
    )
  }
  const uniqueBoundaries = [...new Map(
    boundaries.map((boundary) => [numericMetricKey(boundary), boundary]),
  ).values()]
  const restEdges: number[] = []
  for (const event of events) {
    if (event.kind !== 'rest') continue
    if (!isFiniteNumber(event.startBeat) || !isFiniteNumber(event.durationBeats)) {
      return unavailable('Every rest boundary must be finite.')
    }
    const restEnd = event.startBeat + event.durationBeats
    if (!Number.isFinite(restEnd)) {
      return unavailable('A derived rest boundary overflowed the finite range.')
    }
    restEdges.push(event.startBeat, restEnd)
  }
  const aligned = uniqueBoundaries.filter((boundary) =>
    restEdges.some((restEdge) => approximatelyEqual(boundary, restEdge))).length
  return measured(
    aligned / uniqueBoundaries.length,
    'low',
    'Expected phrase boundaries touching the start or end of a rest divided by all supplied unique boundaries.',
  )
}

function analyzeRhythm(
  normalized: NormalizedMelody,
  events: readonly NormalizedMelodyEvent[],
  context: MetricAnalysisContext,
): RhythmMetrics {
  if (events.length === 0) {
    return unavailableRhythm(
      metricUnavailableReason('the normalized output contains no events.'),
    )
  }
  const durationFieldsFinite = events.every((event) =>
    isFiniteNumber(event.durationBeats) && event.durationBeats > 0)
  if (!durationFieldsFinite) {
    return unavailableRhythm(
      metricUnavailableReason('at least one event duration is non-finite or non-positive.'),
    )
  }

  const durations = events.map((event) => event.durationBeats)
  const declaredDurations = normalized.allowedDurationsBeats
  const declaredDurationSetValid =
    Array.isArray(declaredDurations) &&
    declaredDurations.length > 0 &&
    declaredDurations.length <= MAX_DECLARED_DURATIONS &&
    isDenseArray(declaredDurations) &&
    declaredDurations.every((duration) => isFiniteNumber(duration) && duration > 0)
  const durationDiversity = declaredDurationSetValid
    ? measured(
        clampUnit(
          new Set(durations.map(numericMetricKey)).size /
            Math.min(
              events.length,
              new Set(declaredDurations.map(numericMetricKey)).size,
            ),
        ),
        'high',
        'Unique observed event durations divided by min(event count, unique declared allowed-duration count).',
      )
    : unavailable<number>(
        'A non-empty bounded set of finite positive declared durations is required.',
      )

  const notes = notesFrom(events)
  const onsetDensityValue = isFiniteNumber(normalized.totalBeats) &&
    normalized.totalBeats > 0
    ? notes.length / normalized.totalBeats
    : null
  const onsetDensity = onsetDensityValue !== null &&
    Number.isFinite(onsetDensityValue)
    ? measured(
        onsetDensityValue,
        'high',
        'Note-event onsets divided by declared total beats.',
      )
    : unavailable<number>('Declared totalBeats must be finite and positive.')

  const observedBeats = durations.reduce((sum, duration) => sum + duration, 0)
  const restBeats = events.reduce((sum, event) =>
    event.kind === 'rest' ? sum + event.durationBeats : sum, 0)
  const restRatio = observedBeats > 0 && Number.isFinite(observedBeats)
    ? measured(
        restBeats / observedBeats,
        'high',
        'Summed rest-event beats divided by summed duration beats across all events.',
      )
    : unavailable<number>('A finite positive observed-duration denominator is required.')

  let longestRun = 0
  let currentRun = 0
  let runOverflowed = false
  for (const event of events) {
    if (event.kind === 'rest') {
      currentRun = 0
    } else {
      currentRun += event.durationBeats
      if (!Number.isFinite(currentRun)) {
        runOverflowed = true
        break
      }
      longestRun = Math.max(longestRun, currentRun)
    }
  }
  const longestUninterruptedRun = runOverflowed
    ? unavailable<number>('A summed uninterrupted-note run overflowed the finite range.')
    : measured(
        longestRun,
        'high',
        'Maximum summed note duration in a consecutive event run; every rest resets the run to zero beats.',
      )

  const cellSignatures = exactEventCellSignature(events, normalized.totalBeats)
  const identicalCellRepetition = cellSignatures === null
    ? unavailable<number>(
        `Exact one-beat cells require integer totalBeats from 2 through ${MAX_EXACT_BEAT_CELLS} and events contained within individual cells.`,
      )
    : measured(
        (cellSignatures.length - new Set(cellSignatures).size) /
          (cellSignatures.length - 1),
        'high',
        'Duplicate exact one-beat cell signatures divided by cellCount - 1; pitch, kind, relative onset, and duration are retained.',
      )

  const microNoteRate = measured(
    events.filter((event) => event.durationBeats < MICRO_NOTE_BEATS).length /
      events.length,
    'high',
    'Events shorter than 0.25 beats divided by all events.',
  )

  return {
    durationDiversity,
    onsetDensity,
    restRatio,
    longestUninterruptedRun,
    identicalCellRepetition,
    microNoteRate,
    phraseBoundaryAlignmentProxy: phraseBoundaryAlignment(
      events,
      normalized.totalBeats,
      context.phraseBoundaryBeats,
    ),
  }
}

interface NoteFeature {
  midiNote: number
  startBeat: number
  durationBeats: number
  contourPosition: number | null
}

type ContourExpectations = BenchmarkExpectations & {
  contourPositions: readonly number[]
}

const hasUsableContourExpectations = (
  expectations: BenchmarkExpectations | null | undefined,
): expectations is ContourExpectations => {
  if (expectations === null || expectations === undefined) return false
  const { contourPositions, presentedOrders, selectionDirections } = expectations
  if (
    !isBoundedDenseArray(contourPositions, MAX_PROVENANCE_VALUES_PER_EVENT) ||
    !isBoundedDenseArray(presentedOrders, MAX_PROVENANCE_VALUES_PER_EVENT) ||
    !isBoundedDenseArray(selectionDirections, MAX_PROVENANCE_VALUES_PER_EVENT) ||
    contourPositions.length === 0 ||
    contourPositions.length !== presentedOrders.length ||
    contourPositions.length !== selectionDirections.length
  ) {
    return false
  }
  return contourPositions.every((position) =>
    isFiniteNumber(position) && position >= 0 && position <= 1) &&
    presentedOrders.every((order, index) =>
      Number.isSafeInteger(order) && order === index + 1) &&
    selectionDirections.every((value) => value === 'left' || value === 'right')
}

const noteFeaturesFrom = (
  events: readonly NormalizedMelodyEvent[],
  expectations: BenchmarkExpectations | null | undefined,
): readonly NoteFeature[] | null => {
  const result: NoteFeature[] = []
  const contourExpectations = hasUsableContourExpectations(expectations)
    ? expectations
    : null
  for (const event of events) {
    if (event.kind !== 'note') continue
    if (
      !Number.isSafeInteger(event.midiNote) ||
      !isFiniteNumber(event.startBeat) ||
      !isFiniteNumber(event.durationBeats)
    ) {
      return null
    }
    const positions = contourExpectations?.contourPositions
    const presentedOrders = event.source?.presentedOrders
    let contourPosition: number | null = null
    if (
      contourExpectations !== null &&
      positions !== undefined &&
      isBoundedDenseArray(presentedOrders, MAX_PROVENANCE_VALUES_PER_EVENT) &&
      presentedOrders.length > 0 &&
      presentedOrders.every((order) =>
        Number.isSafeInteger(order) &&
        order >= 1 &&
        order <= positions.length &&
        contourExpectations.presentedOrders[order - 1] === order &&
        isFiniteNumber(positions[order - 1]))
    ) {
      contourPosition = presentedOrders.reduce(
        (sum, order) => sum + positions[order - 1],
        0,
      ) / presentedOrders.length
    }
    result.push({
      midiNote: event.midiNote,
      startBeat: event.startBeat,
      durationBeats: event.durationBeats,
      contourPosition,
    })
  }
  return result
}

const featureList = (window: readonly NoteFeature[]): readonly number[] => [
  window[1].midiNote - window[0].midiNote,
  window[2].midiNote - window[1].midiNote,
  window[0].durationBeats,
  window[1].durationBeats,
  window[2].durationBeats,
  window[1].startBeat - window[0].startBeat,
  window[2].startBeat - window[1].startBeat,
]

const transpositionInvariantMotifKey = (
  window: readonly NoteFeature[],
): string => featureList(window).map(numericMetricKey).join(',')

const exactMotifKey = (window: readonly NoteFeature[]): string => [
  window[0].midiNote,
  window[1].midiNote,
  window[2].midiNote,
  ...featureList(window).slice(2),
].map(numericMetricKey).join(',')

const phraseLengths = (
  events: readonly NormalizedMelodyEvent[],
): readonly number[] | null => {
  const lengths: number[] = []
  let current = 0
  for (const event of events) {
    if (event.kind === 'rest') {
      if (current > 0) lengths.push(current)
      current = 0
    } else {
      current += event.durationBeats
      if (!Number.isFinite(current)) return null
    }
  }
  if (current > 0) lengths.push(current)
  return lengths
}

const circularPitchClassDistance = (left: number, right: number): number => {
  const direct = Math.abs(pitchClass(left) - pitchClass(right))
  return Math.min(direct, 12 - direct)
}

function analyzeForm(
  normalized: NormalizedMelody,
  events: readonly NormalizedMelodyEvent[],
  context: MetricAnalysisContext,
): FormMetrics {
  const notes = noteFeaturesFrom(events, context.expectations)
  if (notes === null || notes.length === 0) {
    return unavailableForm(
      metricUnavailableReason('finite note features are unavailable.'),
    )
  }

  const windows: NoteFeature[][] = []
  for (let index = 0; index <= notes.length - MOTIF_NOTE_COUNT; index += 1) {
    windows.push(notes.slice(index, index + MOTIF_NOTE_COUNT))
  }
  const motifFeaturesFinite = windows.every((window) => {
    const features = featureList(window)
    return Number.isSafeInteger(features[0]) &&
      Number.isSafeInteger(features[1]) &&
      features.slice(2).every(isFiniteNumber)
  })
  const motifDataAvailable = windows.length >= 2 && motifFeaturesFinite
  const motifClassKeys = motifFeaturesFinite
    ? windows.map(transpositionInvariantMotifKey)
    : []
  const exactKeys = motifFeaturesFinite ? windows.map(exactMotifKey) : []
  const motifClassCounts = new Map<string, number>()
  const exactVariantsByClass = new Map<string, Map<string, number>>()
  motifClassKeys.forEach((motifClass, index) => {
    motifClassCounts.set(
      motifClass,
      (motifClassCounts.get(motifClass) ?? 0) + 1,
    )
    const exactVariants = exactVariantsByClass.get(motifClass) ?? new Map()
    const exactKey = exactKeys[index]
    exactVariants.set(exactKey, (exactVariants.get(exactKey) ?? 0) + 1)
    exactVariantsByClass.set(motifClass, exactVariants)
  })
  let recurrentWindowCount = 0
  motifClassCounts.forEach((count) => {
    if (count > 1) recurrentWindowCount += count
  })

  const motifRecurrence = motifDataAvailable
    ? measured(
        recurrentWindowCount / windows.length,
        'high',
        'Three-note windows belonging to a repeated transposition-invariant interval/rhythm class divided by all such windows.',
      )
    : unavailable<number>(
        'At least four notes and finite, safe derived motif features are required.',
      )
  const exactCopyRatio = motifDataAvailable
    ? measured(
        (windows.length - new Set(exactKeys).size) / (windows.length - 1),
        'high',
        'Duplicate absolute-pitch three-note windows divided by windowCount - 1; onset gaps and durations are part of equality.',
      )
    : unavailable<number>(
        'At least four notes and finite, safe derived motif features are required.',
      )

  let variationRatio: MetricObservation<number>
  if (!motifDataAvailable || recurrentWindowCount === 0) {
    variationRatio = unavailable(
      'No recurrent transposition-invariant motif class exists, so variation within recurrence has no denominator.',
    )
  } else {
    let mostFrequentExactVariants = 0
    for (const [motifClass, count] of motifClassCounts) {
      if (count <= 1) continue
      let largestExactVariant = 0
      exactVariantsByClass.get(motifClass)?.forEach((variantCount) => {
        largestExactVariant = Math.max(largestExactVariant, variantCount)
      })
      mostFrequentExactVariants += largestExactVariant
    }
    variationRatio = measured(
      1 - mostFrequentExactVariants / recurrentWindowCount,
      'high',
      'Within recurrent motif-class windows, one minus the share accounted for by each class most frequent exact-pitch variant.',
    )
  }

  const lengths = phraseLengths(events)
  const phraseLengthDistribution = lengths === null || lengths.length === 0
    ? unavailable<readonly number[]>(
        lengths === null
          ? 'A summed phrase length overflowed the finite range.'
          : 'No note phrase is present.',
      )
    : measured(
        lengths,
        'high',
        'Sounding-note beat totals for consecutive note runs separated by one or more rest events.',
      )

  const finalNote = notes[notes.length - 1]
  const cadenceFinalStabilityProxy = Number.isSafeInteger(normalized.tonicMidi)
    ? measured(
        1 - circularPitchClassDistance(finalNote.midiNote, normalized.tonicMidi) / 6,
        'low',
        'One minus circular pitch-class distance from the final note to the declared tonic divided by six; this is a proximity proxy, not a cadence judgment.',
      )
    : unavailable<number>('A safe-integer declared tonic and a final note are required.')

  let openingEndingSimilarity: MetricObservation<number>
  if (notes.length < MOTIF_NOTE_COUNT * 2) {
    openingEndingSimilarity = unavailable(
      'At least six notes are required for disjoint opening and ending three-note windows.',
    )
  } else {
    const opening = featureList(notes.slice(0, MOTIF_NOTE_COUNT))
    const ending = featureList(notes.slice(-MOTIF_NOTE_COUNT))
    const featuresFinite = [...opening, ...ending].every(isFiniteNumber) &&
      opening.slice(0, 2).every(Number.isSafeInteger) &&
      ending.slice(0, 2).every(Number.isSafeInteger)
    if (!featuresFinite) {
      openingEndingSimilarity = unavailable(
        'An opening or ending feature overflowed its finite, safe range.',
      )
    } else {
      const equalFeatures = opening.filter((value, index) =>
        approximatelyEqual(value, ending[index])).length
      openingEndingSimilarity = measured(
        equalFeatures / opening.length,
        'low',
        'Exact-match share across two pitch intervals, three durations, and two onset gaps in disjoint opening/ending windows.',
      )
    }
  }

  let contourAgreement: MetricObservation<number>
  if (
    notes.length < 2 ||
    notes.some((note) => note.contourPosition === null)
  ) {
    contourAgreement = unavailable(
      'At least two notes must map to finite independent expected contour positions by presentedOrder.',
    )
  } else {
    let agreements = 0
    let contourIntervalsSafe = true
    for (let index = 1; index < notes.length; index += 1) {
      const pitchInterval = notes[index].midiNote - notes[index - 1].midiNote
      if (!Number.isSafeInteger(pitchInterval)) {
        contourIntervalsSafe = false
        break
      }
      const pitchDirection = direction(pitchInterval)
      const contourDirection = direction(
        (notes[index].contourPosition as number) -
          (notes[index - 1].contourPosition as number),
      )
      if (pitchDirection === contourDirection) agreements += 1
    }
    contourAgreement = contourIntervalsSafe
      ? measured(
          agreements / (notes.length - 1),
          'low',
          'Consecutive note pairs whose pitch direction equals independently expected contour direction divided by all consecutive note pairs.',
        )
      : unavailable(
          'A derived pitch interval exceeded the safe-integer range.',
        )
  }

  return {
    motifRecurrence,
    exactCopyRatio,
    variationRatio,
    phraseLengthDistribution,
    cadenceFinalStabilityProxy,
    openingEndingSimilarity,
    contourAgreement,
  }
}

const validRuntime = (runtime: RuntimeObservation): boolean =>
  isFiniteNumber(runtime.firstRunMilliseconds) &&
  runtime.firstRunMilliseconds >= 0 &&
  isFiniteNumber(runtime.repeatRunMilliseconds) &&
  runtime.repeatRunMilliseconds >= 0 &&
  (runtime.perturbationRunMilliseconds === null ||
    (isFiniteNumber(runtime.perturbationRunMilliseconds) &&
      runtime.perturbationRunMilliseconds >= 0))

const validScaling = (scaling: ScalingObservation): boolean =>
  Number.isSafeInteger(scaling.inputItems) &&
  scaling.inputItems > 0 &&
  Number.isSafeInteger(scaling.outputEvents) &&
  scaling.outputEvents >= 0 &&
  isFiniteNumber(scaling.eventsPerInput) &&
  scaling.eventsPerInput >= 0 &&
  approximatelyEqual(
    scaling.eventsPerInput,
    scaling.outputEvents / scaling.inputItems,
  )

function analyzeRobustness(context: MetricAnalysisContext): RobustnessMetrics {
  const sameSeedDeterminism = typeof context.sameSeedDeterminism === 'boolean'
    ? measured(
        context.sameSeedDeterminism,
        'high',
        'Supplied result of exact canonical comparison between two same-seed outputs.',
      )
    : unavailable<boolean>('Two completed same-seed outputs were not supplied.')
  const perturbationSensitivity = isFiniteNumber(context.perturbationSensitivity) &&
    context.perturbationSensitivity >= 0
    ? measured(
        context.perturbationSensitivity,
        'low',
        'Caller-supplied non-negative perturbation distance; interpretation depends on the adapter documented distance.',
      )
    : unavailable<number>('A finite non-negative perturbation distance was not supplied.')
  const runtime = context.runtime !== null &&
    context.runtime !== undefined &&
    validRuntime(context.runtime)
    ? measured(
        context.runtime,
        'low',
        'Caller-supplied local wall-clock samples; environment-sensitive timings are evidence, not a quality score.',
      )
    : unavailable<RuntimeObservation>('Complete finite non-negative runtime samples were not supplied.')
  const outputSizeScaling = context.outputSizeScaling !== null &&
    context.outputSizeScaling !== undefined &&
    validScaling(context.outputSizeScaling)
    ? measured(
        context.outputSizeScaling,
        'low',
        'One consistent input/output-size observation; eventsPerInput is descriptive and not a fitted scaling slope.',
      )
    : unavailable<ScalingObservation>('A consistent finite input/output-size observation was not supplied.')

  return {
    sameSeedDeterminism,
    perturbationSensitivity,
    inputLengthScaling: unavailable(
      'Work 01 fixes valid generator input at exactly twelve final decisions, so input-length scaling cannot be estimated from valid inputs.',
    ),
    runtime,
    outputSizeScaling,
  }
}

/**
 * Computes independent metric groups from a generator-neutral melody view.
 *
 * The function intentionally returns no aggregate musicality score. Missing
 * denominators, missing profile targets, malformed numeric data, and traversal
 * limits produce explicit unavailable observations instead of fabricated zeros.
 */
export function analyzeMetrics(
  normalized: NormalizedMelody,
  context: MetricAnalysisContext,
): BenchmarkMetrics {
  const robustness = analyzeRobustness(context)
  const eventsValue: unknown = normalized?.events
  if (!Array.isArray(eventsValue)) {
    const reason = metricUnavailableReason(
      'normalized events are not an inspectable array.',
    )
    return unavailableEventMetrics(context, robustness, reason)
  }

  const requestedLimit = context.traversalLimit ?? DEFAULT_EVENT_TRAVERSAL_LIMIT
  const traversalLimit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, DEFAULT_EVENT_TRAVERSAL_LIMIT)
    : DEFAULT_EVENT_TRAVERSAL_LIMIT
  if (eventsValue.length > traversalLimit) {
    const reason = metricUnavailableReason(
      `event count ${eventsValue.length} exceeds the ${traversalLimit}-event traversal limit.`,
    )
    return unavailableEventMetrics(context, robustness, reason)
  }

  if (!isDenseArray(eventsValue) || !eventsValue.every(hasInspectableEventShell)) {
    const reason = metricUnavailableReason(
      'normalized events are sparse or contain a malformed event/source shell.',
    )
    return unavailableEventMetrics(context, robustness, reason)
  }

  const events = eventsValue
  const sourceTraversalBounded = sourceTraversalIsBounded(events)
  return {
    validity: analyzeValidity(
      normalized,
      events,
      context,
      sourceTraversalBounded,
    ),
    pitch: analyzePitch(normalized, events),
    rhythm: analyzeRhythm(normalized, events, context),
    form: analyzeForm(normalized, events, context),
    robustness,
  }
}
