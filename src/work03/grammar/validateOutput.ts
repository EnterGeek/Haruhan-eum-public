import {
  ABSOLUTE_HUE_INTERPRETER_VERSION,
  FLOW_INTERPRETATION_CONTRACT_VERSION,
  HYBRID_HUE_INTERPRETER_VERSION,
  RELATIVE_HUE_INTERPRETER_VERSION,
  WORK02_INPUT_CARD_COUNT,
} from '../../work02/versions'
import {
  WORK03_DETERMINISTIC_CHOICE_VERSION,
  WORK03_DIAGNOSTICS_VERSION,
  WORK03_GRAMMAR_GENERATOR_VERSION,
  WORK03_GRAMMAR_TRACE_VERSION,
  WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
  WORK03_MUSIC_GRAMMAR_VERSION,
} from '../versions'
import { getGrammarProfile, isGrammarProfileId } from './profiles'
import { getRhythmCell, isSyncopatedNote, noteDurations } from './rhythm'
import { TONAL_MODE_DEFINITIONS } from './tonalModes'
import type {
  GrammarMelodyEvent,
  GrammarMelodyOutput,
  GrammarNoteEvent,
  GrammarRationaleCode,
  GrammarTraceStage,
  GrammarV1Result,
  MotifTransformation,
  ResolvedGrammarConstraints,
  TonalMode,
} from './types'

export class GrammarV1ResultValidationError extends Error {
  constructor(message: string) {
    super(`Invalid Grammar v1 result: ${message}`)
    this.name = 'GrammarV1ResultValidationError'
  }
}

const fail = (message: string): never => {
  throw new GrammarV1ResultValidationError(message)
}

const object = (value: unknown, path: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : fail(`${path} must be an object.`)

const array = (value: unknown, path: string): unknown[] =>
  Array.isArray(value) ? value : fail(`${path} must be an array.`)

const finite = (value: unknown, path: string): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail(`${path} must be a finite number.`)

const integer = (value: unknown, path: string): number => {
  const number = finite(value, path)
  return Number.isInteger(number) ? number : fail(`${path} must be an integer.`)
}

const exactKeys = (
  value: Record<string, unknown>,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void => {
  const allowed = new Set([...required, ...optional])
  required.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail(`${path}.${key} is required.`)
    }
  })
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) fail(`${path}.${key} is unsupported.`)
  })
}

const exactNumberArray = (
  value: unknown,
  expected: readonly number[],
  path: string,
): readonly number[] => {
  const values = array(value, path)
  if (
    values.length !== expected.length ||
    values.some((entry, index) =>
      typeof entry !== 'number' ||
      !Number.isFinite(entry) ||
      entry !== expected[index])
  ) {
    fail(`${path} must exactly match the frozen grammar values.`)
  }
  return value as readonly number[]
}

const stableCode = (value: unknown, path: string): string => {
  if (
    typeof value !== 'string' ||
    !/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value)
  ) {
    fail(`${path} must be a stable upper-snake-case code.`)
  }
  return value as string
}

const modulo12 = (value: number): number => ((value % 12) + 12) % 12

const EXPECTED_RELATIONSHIPS = [
  'antecedent',
  'antecedent',
  'consequent',
  'consequent',
] as const

const EXPECTED_FUNCTIONS = [
  'opening',
  'middle',
  'middle',
  'cadential',
] as const

const TRANSFORMATIONS = new Set<MotifTransformation>([
  'seed',
  'exact-repeat',
  'rhythmic-variation',
  'contour-transposition',
  'final-note-variation',
  'bounded-inversion',
])

const TRACE_STAGES = new Set<GrammarTraceStage>([
  'input',
  'tonal-frame',
  'motif',
  'phrase',
  'rhythm',
  'register',
  'tension',
  'cadence',
  'density',
])

const TRACE_CODE_STAGE: Readonly<Record<GrammarRationaleCode, GrammarTraceStage>> = {
  INPUT_CONTRACT_ACCEPTED: 'input',
  PROFILE_LIMITS_APPLIED: 'input',
  TONIC_SEED_BUCKET: 'tonal-frame',
  MODE_PROFILE_CHOICE: 'tonal-frame',
  MOTIF_CONTOUR_QUANTIZED: 'motif',
  MOTIF_EXACT_REPEAT: 'motif',
  MOTIF_RHYTHM_VARIATION: 'motif',
  MOTIF_CONTOUR_TRANSPOSED: 'motif',
  MOTIF_FINAL_NOTE_VARIED: 'motif',
  MOTIF_BOUNDED_INVERSION: 'motif',
  PHRASE_ANTECEDENT_OPENED: 'phrase',
  PHRASE_CONSEQUENT_ANSWERED: 'phrase',
  RHYTHM_CELL_SELECTED: 'rhythm',
  REST_BUDGET_APPLIED: 'rhythm',
  SYNCOPATION_BUDGET_APPLIED: 'rhythm',
  REGISTER_CONTOUR_TARGETED: 'register',
  REGISTER_OCTAVE_CORRECTED: 'register',
  LEAP_PREPARED: 'register',
  LEAP_RECOVERED: 'register',
  TENSION_PROXY_APPLIED: 'tension',
  CADENCE_STABILITY_TARGETED: 'cadence',
  DENSITY_LIMIT_APPLIED: 'density',
}

const expectedInterpreter = (method: unknown): string => {
  switch (method) {
    case 'absolute-hue': return ABSOLUTE_HUE_INTERPRETER_VERSION
    case 'relative-hue': return RELATIVE_HUE_INTERPRETER_VERSION
    case 'hybrid': return HYBRID_HUE_INTERPRETER_VERSION
    default: return fail('melodyOutput.method is unsupported.')
  }
}

const validateConstraints = (
  value: unknown,
  profileMaximumSyncopatedEvents: number,
): Readonly<ResolvedGrammarConstraints> => {
  const constraints = object(value, 'melodyOutput.grammar.constraints')
  exactKeys(constraints, 'melodyOutput.grammar.constraints', [
    'minimumMidi',
    'maximumMidi',
    'maximumMelodicLeapSemitones',
    'maximumSyncopatedEvents',
    'maximumEvents',
    'restsAllowed',
    'totalBeats',
    'phraseCount',
    'phraseLengthBeats',
    'allowedDurationsBeats',
    'minimumMotifEvents',
    'maximumMotifEvents',
    'ticksPerBeat',
    'largeLeapThresholdSemitones',
    'recoveryMaximumStepSemitones',
    'maximumEdgeRun',
  ])

  const minimumMidi = integer(
    constraints.minimumMidi,
    'melodyOutput.grammar.constraints.minimumMidi',
  )
  const maximumMidi = integer(
    constraints.maximumMidi,
    'melodyOutput.grammar.constraints.maximumMidi',
  )
  if (minimumMidi < 55 || minimumMidi > 67) {
    fail('melodyOutput.grammar.constraints.minimumMidi must be in [55, 67].')
  }
  if (maximumMidi < 67 || maximumMidi > 79) {
    fail('melodyOutput.grammar.constraints.maximumMidi must be in [67, 79].')
  }
  if (maximumMidi - minimumMidi < 12) {
    fail('melodyOutput.grammar.constraints register must span at least 12 semitones.')
  }

  const maximumMelodicLeapSemitones = integer(
    constraints.maximumMelodicLeapSemitones,
    'melodyOutput.grammar.constraints.maximumMelodicLeapSemitones',
  )
  if (
    maximumMelodicLeapSemitones < 2 ||
    maximumMelodicLeapSemitones > 7
  ) {
    fail('melodyOutput.grammar.constraints.maximumMelodicLeapSemitones must be in [2, 7].')
  }

  const maximumSyncopatedEvents = integer(
    constraints.maximumSyncopatedEvents,
    'melodyOutput.grammar.constraints.maximumSyncopatedEvents',
  )
  if (
    maximumSyncopatedEvents < 0 ||
    maximumSyncopatedEvents > profileMaximumSyncopatedEvents
  ) {
    fail('melodyOutput.grammar.constraints.maximumSyncopatedEvents widens the profile limit.')
  }

  const maximumEvents = integer(
    constraints.maximumEvents,
    'melodyOutput.grammar.constraints.maximumEvents',
  )
  if (maximumEvents < 8 || maximumEvents > 20) {
    fail('melodyOutput.grammar.constraints.maximumEvents must be in [8, 20].')
  }
  if (typeof constraints.restsAllowed !== 'boolean') {
    fail('melodyOutput.grammar.constraints.restsAllowed must be a boolean.')
  }

  const exactConstants: Readonly<Record<string, number>> = {
    totalBeats: 12,
    phraseCount: 4,
    phraseLengthBeats: 3,
    minimumMotifEvents: 2,
    maximumMotifEvents: 5,
    ticksPerBeat: 2,
    largeLeapThresholdSemitones: 7,
    recoveryMaximumStepSemitones: 4,
    maximumEdgeRun: 2,
  }
  Object.entries(exactConstants).forEach(([key, expected]) => {
    if (constraints[key] !== expected) {
      fail(`melodyOutput.grammar.constraints.${key} must equal ${expected}.`)
    }
  })
  exactNumberArray(
    constraints.allowedDurationsBeats,
    [0.5, 1, 1.5, 2],
    'melodyOutput.grammar.constraints.allowedDurationsBeats',
  )

  return value as Readonly<ResolvedGrammarConstraints>
}

interface ValidatedTonalFrame {
  tonicPitchClass: number
  tonicMidi: number
  mode: TonalMode
  scaleNotes: readonly number[]
}

const validateGrammarSnapshot = (
  value: unknown,
): {
  output: GrammarMelodyOutput['grammar']
  tonalFrame: ValidatedTonalFrame
  constraints: Readonly<ResolvedGrammarConstraints>
} => {
  const grammar = object(value, 'melodyOutput.grammar')
  exactKeys(grammar, 'melodyOutput.grammar', [
    'version',
    'profile',
    'seed',
    'choiceAlgorithm',
    'tempoBpm',
    'meter',
    'totalBeats',
    'phraseLengthBeats',
    'tonalFrame',
    'constraints',
  ])
  if (grammar.version !== WORK03_MUSIC_GRAMMAR_VERSION) {
    fail('melodyOutput.grammar.version is unsupported.')
  }
  if (!isGrammarProfileId(grammar.profile)) {
    fail('melodyOutput.grammar.profile is unsupported.')
  }
  const profile = getGrammarProfile(grammar.profile as GrammarMelodyOutput['grammar']['profile'])
  if (
    typeof grammar.seed !== 'string' ||
    grammar.seed.length === 0 ||
    grammar.seed.length > 128
  ) {
    fail('melodyOutput.grammar.seed must be a non-empty string of at most 128 characters.')
  }
  if (grammar.choiceAlgorithm !== WORK03_DETERMINISTIC_CHOICE_VERSION) {
    fail('melodyOutput.grammar.choiceAlgorithm is unsupported.')
  }
  if (grammar.tempoBpm !== profile.limits.tempoBpm) {
    fail('melodyOutput.grammar.tempoBpm must exactly match the profile.')
  }
  const meter = object(grammar.meter, 'melodyOutput.grammar.meter')
  exactKeys(meter, 'melodyOutput.grammar.meter', ['numerator', 'denominator'])
  if (meter.numerator !== 3 || meter.denominator !== 4) {
    fail('melodyOutput.grammar.meter must be exactly 3/4.')
  }
  if (grammar.totalBeats !== 12 || grammar.phraseLengthBeats !== 3) {
    fail('melodyOutput.grammar must declare the frozen 12-beat, 3-beat-phrase form.')
  }

  const constraints = validateConstraints(
    grammar.constraints,
    profile.limits.maximumSyncopatedEvents,
  )
  const tonalFrame = object(grammar.tonalFrame, 'melodyOutput.grammar.tonalFrame')
  exactKeys(tonalFrame, 'melodyOutput.grammar.tonalFrame', [
    'tonicPitchClass',
    'tonicMidi',
    'mode',
    'semitoneOffsets',
    'scaleNotes',
    'stabilityWeights',
  ])
  const tonicPitchClass = integer(
    tonalFrame.tonicPitchClass,
    'melodyOutput.grammar.tonalFrame.tonicPitchClass',
  )
  if (tonicPitchClass < 0 || tonicPitchClass > 11) {
    fail('melodyOutput.grammar.tonalFrame.tonicPitchClass must be in [0, 11].')
  }
  const tonicMidi = integer(
    tonalFrame.tonicMidi,
    'melodyOutput.grammar.tonalFrame.tonicMidi',
  )
  if (
    tonicMidi < constraints.minimumMidi ||
    tonicMidi > constraints.maximumMidi ||
    modulo12(tonicMidi) !== tonicPitchClass
  ) {
    fail('melodyOutput.grammar.tonalFrame.tonicMidi must be an in-range tonic matching tonicPitchClass.')
  }
  if (
    typeof tonalFrame.mode !== 'string' ||
    !(tonalFrame.mode in TONAL_MODE_DEFINITIONS)
  ) {
    fail('melodyOutput.grammar.tonalFrame.mode is unsupported.')
  }
  const mode = tonalFrame.mode as TonalMode
  if (!profile.limits.allowedModes.includes(mode)) {
    fail('melodyOutput.grammar.tonalFrame.mode is forbidden by the profile.')
  }
  const modeDefinition = TONAL_MODE_DEFINITIONS[mode]
  exactNumberArray(
    tonalFrame.semitoneOffsets,
    modeDefinition.semitoneOffsets,
    'melodyOutput.grammar.tonalFrame.semitoneOffsets',
  )
  exactNumberArray(
    tonalFrame.stabilityWeights,
    modeDefinition.stabilityWeights,
    'melodyOutput.grammar.tonalFrame.stabilityWeights',
  )
  const expectedScaleNotes: number[] = []
  for (
    let midi = constraints.minimumMidi;
    midi <= constraints.maximumMidi;
    midi += 1
  ) {
    if (modeDefinition.semitoneOffsets.includes(modulo12(midi - tonicMidi))) {
      expectedScaleNotes.push(midi)
    }
  }
  const scaleNotes = exactNumberArray(
    tonalFrame.scaleNotes,
    expectedScaleNotes,
    'melodyOutput.grammar.tonalFrame.scaleNotes',
  )
  if (!scaleNotes.includes(tonicMidi)) {
    fail('melodyOutput.grammar.tonalFrame.scaleNotes must contain tonicMidi.')
  }

  return {
    output: value as GrammarMelodyOutput['grammar'],
    tonalFrame: { tonicPitchClass, tonicMidi, mode, scaleNotes },
    constraints,
  }
}

interface ValidatedEvents {
  events: readonly GrammarMelodyEvent[]
  notes: readonly GrammarNoteEvent[]
  notesByEventIndex: ReadonlyMap<number, GrammarNoteEvent>
  provenanceOrders: ReadonlySet<number>
}

const validateEventSource = (
  value: unknown,
  path: string,
): { orders: readonly number[]; contours: readonly number[] } => {
  const source = object(value, path)
  exactKeys(source, path, [
    'presentedOrders',
    'selectionDirections',
    'contourPositions',
  ])
  const orders = array(source.presentedOrders, `${path}.presentedOrders`)
  const directions = array(source.selectionDirections, `${path}.selectionDirections`)
  const contours = array(source.contourPositions, `${path}.contourPositions`)
  if (
    orders.length === 0 ||
    orders.length !== directions.length ||
    orders.length !== contours.length
  ) {
    fail(`${path} arrays must have the same non-zero length.`)
  }

  let previousOrder = 0
  const validatedOrders: number[] = []
  const validatedContours: number[] = []
  orders.forEach((rawOrder, index) => {
    const order = integer(rawOrder, `${path}.presentedOrders[${index}]`)
    if (order < 1 || order > WORK02_INPUT_CARD_COUNT) {
      fail(`${path}.presentedOrders[${index}] must be in [1, 12].`)
    }
    if (order <= previousOrder) {
      fail(`${path}.presentedOrders must be unique and increasing.`)
    }
    previousOrder = order
    validatedOrders.push(order)
    if (directions[index] !== 'left' && directions[index] !== 'right') {
      fail(`${path}.selectionDirections[${index}] is invalid.`)
    }
    const contour = finite(contours[index], `${path}.contourPositions[${index}]`)
    if (contour < 0 || contour > 1) {
      fail(`${path}.contourPositions[${index}] must be in [0, 1].`)
    }
    validatedContours.push(contour)
  })

  return { orders: validatedOrders, contours: validatedContours }
}

const onTickGrid = (beats: number, ticksPerBeat: number): boolean =>
  Number.isInteger(beats * ticksPerBeat)

const validateEvents = (
  value: unknown,
  constraints: Readonly<ResolvedGrammarConstraints>,
  scaleNotes: readonly number[],
): ValidatedEvents => {
  const rawEvents = array(value, 'melodyOutput.events')
  if (rawEvents.length === 0) fail('melodyOutput.events must be non-empty.')
  if (rawEvents.length > constraints.maximumEvents) {
    fail('melodyOutput.events exceeds grammar.constraints.maximumEvents.')
  }

  const events: GrammarMelodyEvent[] = []
  const notes: GrammarNoteEvent[] = []
  const notesByEventIndex = new Map<number, GrammarNoteEvent>()
  const provenanceOrders = new Set<number>()
  let expectedStart = 0
  let syncopatedEvents = 0

  rawEvents.forEach((rawEvent, index) => {
    const path = `melodyOutput.events[${index}]`
    const event = object(rawEvent, path)
    if (event.kind === 'note') {
      exactKeys(event, path, [
        'kind',
        'midiNote',
        'eventIndex',
        'startBeat',
        'durationBeats',
        'phraseIndex',
        'motifOccurrenceIndex',
        'tensionLevel',
        'source',
      ])
    } else if (event.kind === 'rest') {
      exactKeys(event, path, [
        'kind',
        'eventIndex',
        'startBeat',
        'durationBeats',
        'phraseIndex',
        'motifOccurrenceIndex',
        'tensionLevel',
        'source',
      ])
    } else {
      fail(`${path}.kind is unsupported.`)
    }
    if (event.eventIndex !== index) fail(`${path}.eventIndex must equal ${index}.`)
    const startBeat = finite(event.startBeat, `${path}.startBeat`)
    const durationBeats = finite(event.durationBeats, `${path}.durationBeats`)
    if (
      startBeat < 0 ||
      durationBeats <= 0 ||
      !onTickGrid(startBeat, constraints.ticksPerBeat) ||
      !onTickGrid(durationBeats, constraints.ticksPerBeat)
    ) {
      fail(`${path} timing must be positive and lie on the two-tick beat grid.`)
    }
    if (!constraints.allowedDurationsBeats.some((allowed) => allowed === durationBeats)) {
      fail(`${path}.durationBeats is outside the frozen duration vocabulary.`)
    }
    if (startBeat !== expectedStart) {
      fail(`${path} must start at ${expectedStart}; gaps and overlaps are invalid.`)
    }
    const endBeat = startBeat + durationBeats
    expectedStart = endBeat

    const phraseIndex = integer(event.phraseIndex, `${path}.phraseIndex`)
    if (phraseIndex < 0 || phraseIndex >= constraints.phraseCount) {
      fail(`${path}.phraseIndex is out of range.`)
    }
    const phraseStart = phraseIndex * constraints.phraseLengthBeats
    const phraseEnd = phraseStart + constraints.phraseLengthBeats
    if (startBeat < phraseStart || endBeat > phraseEnd) {
      fail(`${path} crosses or lies outside its declared phrase boundary.`)
    }
    const occurrenceIndex = integer(
      event.motifOccurrenceIndex,
      `${path}.motifOccurrenceIndex`,
    )
    if (occurrenceIndex !== phraseIndex) {
      fail(`${path}.motifOccurrenceIndex must equal phraseIndex.`)
    }
    const tensionLevel = finite(event.tensionLevel, `${path}.tensionLevel`)
    if (tensionLevel < 0 || tensionLevel > 1) {
      fail(`${path}.tensionLevel must be in [0, 1].`)
    }

    const validatedSource = validateEventSource(
      event.source,
      `${path}.source`,
    )
    validatedSource.orders.forEach((order) => provenanceOrders.add(order))

    if (event.kind === 'rest') {
      if (!constraints.restsAllowed) {
        fail(`${path} is a rest forbidden by grammar.constraints.restsAllowed.`)
      }
    } else {
      const midiNote = integer(event.midiNote, `${path}.midiNote`)
      if (
        midiNote < constraints.minimumMidi ||
        midiNote > constraints.maximumMidi
      ) {
        fail(`${path}.midiNote is outside the grammar register.`)
      }
      if (!scaleNotes.includes(midiNote)) {
        fail(`${path}.midiNote is outside the declared scale.`)
      }
      const note = rawEvent as GrammarNoteEvent
      notes.push(note)
      notesByEventIndex.set(index, note)
      if (isSyncopatedNote(startBeat, durationBeats)) {
        syncopatedEvents += 1
      }
    }
    events.push(rawEvent as GrammarMelodyEvent)
  })

  if (expectedStart !== constraints.totalBeats) {
    fail('melodyOutput.events must end exactly at totalBeats.')
  }
  if (notes.length === 0) fail('melodyOutput.events must contain a sounding note.')
  if (syncopatedEvents > constraints.maximumSyncopatedEvents) {
    fail('melodyOutput.events exceeds grammar.constraints.maximumSyncopatedEvents.')
  }
  for (let order = 1; order <= WORK02_INPUT_CARD_COUNT; order += 1) {
    if (!provenanceOrders.has(order)) {
      fail(`melodyOutput.events provenance does not cover presentedOrder ${order}.`)
    }
  }

  for (let index = 1; index < notes.length; index += 1) {
    const interval = notes[index].midiNote - notes[index - 1].midiNote
    if (Math.abs(interval) > constraints.maximumMelodicLeapSemitones) {
      fail(`melodyOutput.events note ${index} exceeds the maximum melodic leap.`)
    }
    if (Math.abs(interval) >= constraints.largeLeapThresholdSemitones) {
      const recovery = notes[index + 1]
      if (recovery === undefined) {
        fail('melodyOutput.events ends with an unresolved large leap.')
      }
      const recoveryInterval = recovery.midiNote - notes[index].midiNote
      if (
        recoveryInterval === 0 ||
        Math.sign(recoveryInterval) === Math.sign(interval) ||
        Math.abs(recoveryInterval) > constraints.recoveryMaximumStepSemitones
      ) {
        fail(`melodyOutput.events note ${index} has no valid opposite-step recovery.`)
      }
    }
  }

  let edgeRun = 0
  notes.forEach((note) => {
    if (
      note.midiNote === constraints.minimumMidi ||
      note.midiNote === constraints.maximumMidi
    ) {
      edgeRun += 1
      if (edgeRun > constraints.maximumEdgeRun) {
        fail('melodyOutput.events exceeds grammar.constraints.maximumEdgeRun.')
      }
    } else {
      edgeRun = 0
    }
  })

  return { events, notes, notesByEventIndex, provenanceOrders }
}

const validatePhrases = (
  value: unknown,
  events: readonly GrammarMelodyEvent[],
  tonicPitchClass: number,
): void => {
  const phrases = array(value, 'melodyOutput.phrases')
  if (phrases.length !== 4) fail('melodyOutput.phrases must contain exactly four phrases.')
  phrases.forEach((rawPhrase, index) => {
    const path = `melodyOutput.phrases[${index}]`
    const phrase = object(rawPhrase, path)
    exactKeys(phrase, path, [
      'phraseIndex',
      'startBeat',
      'endBeat',
      'relationship',
      'function',
      'tonalCenterPitchClass',
      'eventIndices',
    ])
    if (phrase.phraseIndex !== index) fail(`${path}.phraseIndex must equal ${index}.`)
    if (phrase.startBeat !== index * 3 || phrase.endBeat !== (index + 1) * 3) {
      fail(`${path} must declare the exact frozen three-beat boundary.`)
    }
    if (phrase.relationship !== EXPECTED_RELATIONSHIPS[index]) {
      fail(`${path}.relationship does not match the frozen phrase form.`)
    }
    if (phrase.function !== EXPECTED_FUNCTIONS[index]) {
      fail(`${path}.function does not match the frozen phrase form.`)
    }
    if (phrase.tonalCenterPitchClass !== tonicPitchClass) {
      fail(`${path}.tonalCenterPitchClass must equal the piece tonal center.`)
    }
    const expectedEventIndices = events
      .filter((event) => event.phraseIndex === index)
      .map((event) => event.eventIndex)
    const eventIndices = array(phrase.eventIndices, `${path}.eventIndices`)
    if (
      eventIndices.length === 0 ||
      eventIndices.length !== expectedEventIndices.length ||
      eventIndices.some((eventIndex, eventOffset) =>
        eventIndex !== expectedEventIndices[eventOffset])
    ) {
      fail(`${path}.eventIndices must exactly list all phrase events, including rests.`)
    }
  })
}

const sameNumbers = (left: readonly number[], right: readonly number[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const validateTransformation = (
  transformation: MotifTransformation,
  occurrenceScaleSteps: readonly number[],
  occurrenceDurations: readonly number[],
  seedScaleSteps: readonly number[],
  seedDurations: readonly number[],
  path: string,
): void => {
  const samePitches = sameNumbers(occurrenceScaleSteps, seedScaleSteps)
  const sameRhythm = sameNumbers(occurrenceDurations, seedDurations)
  switch (transformation) {
    case 'exact-repeat':
      if (!samePitches || !sameRhythm) {
        fail(`${path} does not algebraically match exact-repeat.`)
      }
      return
    case 'rhythmic-variation':
      if (!samePitches || sameRhythm) {
        fail(`${path} does not algebraically match rhythmic-variation.`)
      }
      return
    case 'contour-transposition': {
      const offset = occurrenceScaleSteps[0] - seedScaleSteps[0]
      if (
        offset === 0 ||
        !sameRhythm ||
        occurrenceScaleSteps.some(
          (step, index) => step - seedScaleSteps[index] !== offset,
        )
      ) {
        fail(`${path} does not algebraically match contour-transposition.`)
      }
      return
    }
    case 'final-note-variation':
      if (
        !sameRhythm ||
        occurrenceScaleSteps.at(-1) === seedScaleSteps.at(-1) ||
        occurrenceScaleSteps.slice(0, -1).some(
          (step, index) => step !== seedScaleSteps[index],
        )
      ) {
        fail(`${path} does not algebraically match final-note-variation.`)
      }
      return
    case 'bounded-inversion': {
      const seedOrigin = seedScaleSteps[0]
      const occurrenceOrigin = occurrenceScaleSteps[0]
      const isNonTrivial = seedScaleSteps.some((step) => step !== seedOrigin)
      if (
        !isNonTrivial ||
        !sameRhythm ||
        occurrenceScaleSteps.some((step, index) =>
          step - occurrenceOrigin !== -(seedScaleSteps[index] - seedOrigin))
      ) {
        fail(`${path} does not algebraically match bounded-inversion.`)
      }
      return
    }
    case 'seed':
      return fail(`${path} may not reuse the seed transformation.`)
  }
}

const validateMotif = (
  value: unknown,
  expectedMotifEventCount: number,
  events: readonly GrammarMelodyEvent[],
  notes: readonly GrammarNoteEvent[],
  notesByEventIndex: ReadonlyMap<number, GrammarNoteEvent>,
  scaleNotes: readonly number[],
): void => {
  const motif = object(value, 'melodyOutput.motif')
  exactKeys(motif, 'melodyOutput.motif', [
    'seedEventCount',
    'seedScaleSteps',
    'seedRhythmCellId',
    'occurrences',
  ])
  const seedEventCount = integer(
    motif.seedEventCount,
    'melodyOutput.motif.seedEventCount',
  )
  if (
    seedEventCount < 2 ||
    seedEventCount > 5 ||
    seedEventCount !== expectedMotifEventCount
  ) {
    fail('melodyOutput.motif.seedEventCount must be 2-5 and match the profile.')
  }
  const rawSeedScaleSteps = array(
    motif.seedScaleSteps,
    'melodyOutput.motif.seedScaleSteps',
  )
  if (rawSeedScaleSteps.length !== seedEventCount) {
    fail('melodyOutput.motif.seedScaleSteps length must equal seedEventCount.')
  }
  const seedScaleSteps = rawSeedScaleSteps.map((rawStep, index) => {
    const step = integer(rawStep, `melodyOutput.motif.seedScaleSteps[${index}]`)
    if (step < 0 || step >= scaleNotes.length) {
      fail(`melodyOutput.motif.seedScaleSteps[${index}] is out of range.`)
    }
    return step
  })
  const seedRhythmCellId = motif.seedRhythmCellId
  if (typeof seedRhythmCellId !== 'string') {
    fail('melodyOutput.motif.seedRhythmCellId must be a non-empty bounded string.')
  }
  const seedRhythmCell = (() => {
    try {
      return getRhythmCell(seedRhythmCellId as string)
    } catch {
      return fail('melodyOutput.motif.seedRhythmCellId is outside the frozen rhythm vocabulary.')
    }
  })()
  if (seedRhythmCell.noteCount !== seedEventCount) {
    fail('melodyOutput.motif.seedRhythmCellId note count must match seedEventCount.')
  }

  const occurrences = array(motif.occurrences, 'melodyOutput.motif.occurrences')
  if (occurrences.length !== 4) {
    fail('melodyOutput.motif.occurrences must contain exactly four occurrences.')
  }
  const claimedNoteIndices = new Set<number>()
  let previousFinalEventIndex = -1
  let seedDurations: readonly number[] = []
  occurrences.forEach((rawOccurrence, index) => {
    const path = `melodyOutput.motif.occurrences[${index}]`
    const occurrence = object(rawOccurrence, path)
    exactKeys(occurrence, path, [
      'occurrenceIndex',
      'phraseIndex',
      'transformation',
      'eventIndices',
    ])
    if (occurrence.occurrenceIndex !== index || occurrence.phraseIndex !== index) {
      fail(`${path} must use the zero-based occurrence and phrase index ${index}.`)
    }
    if (
      typeof occurrence.transformation !== 'string' ||
      !TRANSFORMATIONS.has(occurrence.transformation as MotifTransformation)
    ) {
      fail(`${path}.transformation is unsupported.`)
    }
    const transformation = occurrence.transformation as MotifTransformation
    if ((index === 0) !== (transformation === 'seed')) {
      fail(`${path}.transformation must label only occurrence zero as seed.`)
    }
    const rawEventIndices = array(occurrence.eventIndices, `${path}.eventIndices`)
    if (rawEventIndices.length !== seedEventCount) {
      fail(`${path}.eventIndices must contain exactly seedEventCount note indices.`)
    }
    const occurrenceNotes = rawEventIndices.map((rawEventIndex, eventOffset) => {
      const eventIndex = integer(rawEventIndex, `${path}.eventIndices[${eventOffset}]`)
      if (eventIndex <= previousFinalEventIndex && eventOffset === 0) {
        fail(`${path} must be chronological and non-overlapping.`)
      }
      if (
        eventOffset > 0 &&
        eventIndex <= (rawEventIndices[eventOffset - 1] as number)
      ) {
        fail(`${path}.eventIndices must be strictly increasing.`)
      }
      if (claimedNoteIndices.has(eventIndex)) {
        fail(`${path}.eventIndices overlaps another occurrence.`)
      }
      const note = notesByEventIndex.get(eventIndex) ??
        fail(`${path}.eventIndices must reference sounding note events only.`)
      if (note.phraseIndex !== index || note.motifOccurrenceIndex !== index) {
        fail(`${path}.eventIndices references a note assigned to another occurrence.`)
      }
      claimedNoteIndices.add(eventIndex)
      return note
    })
    previousFinalEventIndex = occurrenceNotes.at(-1)?.eventIndex ?? previousFinalEventIndex
    const occurrenceScaleSteps = occurrenceNotes.map((note) =>
      scaleNotes.indexOf(note.midiNote))
    const occurrenceDurations = occurrenceNotes.map((note) => note.durationBeats)
    if (index === 0) {
      if (!sameNumbers(occurrenceScaleSteps, seedScaleSteps)) {
        fail('melodyOutput.motif.seedScaleSteps must exactly describe the seed notes.')
      }
      seedDurations = occurrenceDurations
      if (!sameNumbers(seedDurations, noteDurations(seedRhythmCell))) {
        fail('melodyOutput.motif seed note durations must match seedRhythmCellId.')
      }
    } else {
      validateTransformation(
        transformation,
        occurrenceScaleSteps,
        occurrenceDurations,
        seedScaleSteps,
        seedDurations,
        path,
      )
    }
  })

  if (
    claimedNoteIndices.size !== notes.length ||
    notes.some((note) => !claimedNoteIndices.has(note.eventIndex))
  ) {
    fail('melodyOutput.motif.occurrences must partition every sounding note exactly once.')
  }
  events.filter((event) => event.kind === 'rest').forEach((rest) => {
    if (claimedNoteIndices.has(rest.eventIndex)) {
      fail('melodyOutput.motif occurrence data must exclude rests.')
    }
  })
}

const validateSourceAnchors = (
  value: unknown,
  events: readonly GrammarMelodyEvent[],
  scaleNotes: readonly number[],
): void => {
  const anchors = array(value, 'melodyOutput.sourceAnchors')
  if (anchors.length !== WORK02_INPUT_CARD_COUNT) {
    fail('melodyOutput.sourceAnchors must contain exactly 12 anchors.')
  }
  anchors.forEach((rawAnchor, index) => {
    const path = `melodyOutput.sourceAnchors[${index}]`
    const anchor = object(rawAnchor, path)
    exactKeys(anchor, path, ['presentedOrder', 'targetScaleIndex', 'eventIndex'])
    const presentedOrder = integer(anchor.presentedOrder, `${path}.presentedOrder`)
    if (presentedOrder !== index + 1) {
      fail(`${path}.presentedOrder must provide ordered, unique coverage of 1..12.`)
    }
    const targetScaleIndex = integer(anchor.targetScaleIndex, `${path}.targetScaleIndex`)
    if (targetScaleIndex < 0 || targetScaleIndex >= scaleNotes.length) {
      fail(`${path}.targetScaleIndex is out of range.`)
    }
    const eventIndex = integer(anchor.eventIndex, `${path}.eventIndex`)
    const event = events[eventIndex]
    if (event === undefined || event.kind !== 'note') {
      fail(`${path}.eventIndex must reference a sounding note event.`)
    }
    if (!event.source.presentedOrders.includes(presentedOrder)) {
      fail(`${path}.eventIndex source does not include presentedOrder.`)
    }
  })
}

const validateTrace = (value: unknown): void => {
  const trace = object(value, 'grammarTrace')
  exactKeys(trace, 'grammarTrace', ['version', 'entries'])
  if (trace.version !== WORK03_GRAMMAR_TRACE_VERSION) {
    fail('grammarTrace.version is unsupported.')
  }
  const entries = array(trace.entries, 'grammarTrace.entries')
  if (entries.length === 0) fail('grammarTrace.entries must be non-empty.')
  entries.forEach((rawEntry, index) => {
    const path = `grammarTrace.entries[${index}]`
    const entry = object(rawEntry, path)
    exactKeys(entry, path, [
      'sequence',
      'stage',
      'code',
      'sourcePresentedOrders',
      'values',
    ])
    if (entry.sequence !== index) fail(`${path}.sequence must equal ${index}.`)
    if (typeof entry.stage !== 'string' || !TRACE_STAGES.has(entry.stage as GrammarTraceStage)) {
      fail(`${path}.stage is unsupported.`)
    }
    if (
      typeof entry.code !== 'string' ||
      !(entry.code in TRACE_CODE_STAGE)
    ) {
      fail(`${path}.code is unsupported.`)
    }
    if (TRACE_CODE_STAGE[entry.code as GrammarRationaleCode] !== entry.stage) {
      fail(`${path}.code does not belong to its declared stage.`)
    }
    const sourceOrders = array(
      entry.sourcePresentedOrders,
      `${path}.sourcePresentedOrders`,
    )
    let previousOrder = 0
    sourceOrders.forEach((rawOrder, sourceIndex) => {
      const order = integer(
        rawOrder,
        `${path}.sourcePresentedOrders[${sourceIndex}]`,
      )
      if (order < 1 || order > WORK02_INPUT_CARD_COUNT || order <= previousOrder) {
        fail(`${path}.sourcePresentedOrders must be unique, increasing references in [1, 12].`)
      }
      previousOrder = order
    })
    const values = object(entry.values, `${path}.values`)
    Object.entries(values).forEach(([key, rawValue]) => {
      if (key.length === 0) fail(`${path}.values keys must be non-empty.`)
      if (
        typeof rawValue !== 'string' &&
        typeof rawValue !== 'boolean' &&
        !(typeof rawValue === 'number' && Number.isFinite(rawValue))
      ) {
        fail(`${path}.values.${key} must be a JSON-safe scalar.`)
      }
    })
  })
}

const validateDiagnostics = (value: unknown): void => {
  const diagnostics = object(value, 'diagnostics')
  exactKeys(diagnostics, 'diagnostics', ['version', 'checks', 'warnings'])
  if (diagnostics.version !== WORK03_DIAGNOSTICS_VERSION) {
    fail('diagnostics.version is unsupported.')
  }
  const checks = array(diagnostics.checks, 'diagnostics.checks')
  if (checks.length === 0) fail('diagnostics.checks must be non-empty.')
  const checkCodes = new Set<string>()
  checks.forEach((rawCheck, index) => {
    const path = `diagnostics.checks[${index}]`
    const check = object(rawCheck, path)
    exactKeys(check, path, ['code', 'passed', 'actual'], ['minimum', 'maximum'])
    const code = stableCode(check.code, `${path}.code`)
    if (checkCodes.has(code)) fail(`${path}.code must be unique.`)
    checkCodes.add(code)
    if (check.passed !== true) fail(`${path}.passed must be true.`)
    const actual = finite(check.actual, `${path}.actual`)
    const hasMinimum = Object.prototype.hasOwnProperty.call(check, 'minimum')
    const hasMaximum = Object.prototype.hasOwnProperty.call(check, 'maximum')
    const minimum = hasMinimum
      ? finite(check.minimum, `${path}.minimum`)
      : undefined
    const maximum = hasMaximum
      ? finite(check.maximum, `${path}.maximum`)
      : undefined
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      fail(`${path}.minimum must not exceed maximum.`)
    }
    if (
      (minimum !== undefined && actual < minimum) ||
      (maximum !== undefined && actual > maximum)
    ) {
      fail(`${path}.actual contradicts its passing bounds.`)
    }
  })
  const warnings = array(diagnostics.warnings, 'diagnostics.warnings')
  const warningCodes = new Set<string>()
  warnings.forEach((warning, index) => {
    const code = stableCode(warning, `diagnostics.warnings[${index}]`)
    if (warningCodes.has(code)) {
      fail(`diagnostics.warnings[${index}] must be unique.`)
    }
    warningCodes.add(code)
  })
}

/**
 * Strictly validates an entire Work 03 result and returns the original object.
 * The validator deliberately does not normalize, clone, repair, or mutate data.
 */
export function validateGrammarV1Result(input: unknown): GrammarV1Result {
  const result = object(input, 'result')
  exactKeys(result, 'result', ['melodyOutput', 'grammarTrace', 'diagnostics'])
  const output = object(result.melodyOutput, 'melodyOutput')
  exactKeys(output, 'melodyOutput', [
    'versions',
    'method',
    'grammar',
    'totalBeats',
    'motif',
    'phrases',
    'sourceAnchors',
    'events',
  ])
  const versions = object(output.versions, 'melodyOutput.versions')
  exactKeys(versions, 'melodyOutput.versions', [
    'outputContract',
    'grammar',
    'interpretationContract',
    'interpreter',
    'generator',
  ])
  if (versions.outputContract !== WORK03_MELODY_OUTPUT_CONTRACT_VERSION) {
    fail('melodyOutput.versions.outputContract is unsupported.')
  }
  if (versions.grammar !== WORK03_MUSIC_GRAMMAR_VERSION) {
    fail('melodyOutput.versions.grammar is unsupported.')
  }
  if (versions.interpretationContract !== FLOW_INTERPRETATION_CONTRACT_VERSION) {
    fail('melodyOutput.versions.interpretationContract is unsupported.')
  }
  if (versions.interpreter !== expectedInterpreter(output.method)) {
    fail('melodyOutput.method and versions.interpreter do not match.')
  }
  if (versions.generator !== WORK03_GRAMMAR_GENERATOR_VERSION) {
    fail('melodyOutput.versions.generator is unsupported.')
  }

  const validatedGrammar = validateGrammarSnapshot(output.grammar)
  if (versions.grammar !== validatedGrammar.output.version) {
    fail('melodyOutput grammar versions do not match.')
  }
  if (output.totalBeats !== 12 || output.totalBeats !== validatedGrammar.output.totalBeats) {
    fail('melodyOutput.totalBeats must exactly match the frozen grammar form.')
  }
  const profile = getGrammarProfile(validatedGrammar.output.profile)
  const validatedEvents = validateEvents(
    output.events,
    validatedGrammar.constraints,
    validatedGrammar.tonalFrame.scaleNotes,
  )
  validatePhrases(
    output.phrases,
    validatedEvents.events,
    validatedGrammar.tonalFrame.tonicPitchClass,
  )
  validateMotif(
    output.motif,
    profile.limits.motifEventCount,
    validatedEvents.events,
    validatedEvents.notes,
    validatedEvents.notesByEventIndex,
    validatedGrammar.tonalFrame.scaleNotes,
  )
  validateSourceAnchors(
    output.sourceAnchors,
    validatedEvents.events,
    validatedGrammar.tonalFrame.scaleNotes,
  )
  const finalNote = validatedEvents.notes.at(-1) ??
    fail('melodyOutput.events must contain a final sounding note.')
  const finalRelativePitchClass = modulo12(
    finalNote.midiNote - validatedGrammar.tonalFrame.tonicMidi,
  )
  const finalStability = TONAL_MODE_DEFINITIONS[
    validatedGrammar.tonalFrame.mode
  ].stabilityWeights[finalRelativePitchClass]
  if (
    profile.limits.closureStrength === 'strong' &&
    finalStability !== 1
  ) {
    fail('melodyOutput final note must have stability 1 for a strong closure profile.')
  }
  if (
    profile.limits.closureStrength === 'open' &&
    !(finalStability > 0 && finalStability < 1)
  ) {
    fail('melodyOutput final note stability must be strictly between 0 and 1 for an open closure profile.')
  }
  validateTrace(result.grammarTrace)
  validateDiagnostics(result.diagnostics)

  return input as GrammarV1Result
}
