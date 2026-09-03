import { FLOW_INTERPRETATION_CONTRACT_VERSION } from '../../work02/versions'
import {
  WORK03_DETERMINISTIC_CHOICE_VERSION,
  WORK03_DIAGNOSTICS_VERSION,
  WORK03_GRAMMAR_GENERATOR_VERSION,
  WORK03_GRAMMAR_TRACE_VERSION,
  WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
  WORK03_MUSIC_GRAMMAR_VERSION,
} from '../versions'
import {
  deterministicChoice,
  deterministicIndex,
  deterministicUnitInterval,
} from './deterministicChoice'
import {
  getRhythmCellFor,
  isSyncopatedNote,
  restDuration,
  type RhythmCell,
} from './rhythm'
import { TONAL_MODE_DEFINITIONS } from './tonalModes'
import type {
  GenerateGrammarV1Request,
  GrammarDiagnosticCheck,
  GrammarDiagnostics,
  GrammarMelodyEvent,
  GrammarMelodyOutput,
  GrammarNoteEvent,
  GrammarRationaleCode,
  GrammarTrace,
  GrammarTraceEntry,
  GrammarTraceStage,
  GrammarTraceValue,
  GrammarV1Result,
  MotifOccurrence,
  MotifTransformation,
  PhraseFunction,
  PhrasePlan,
  PhraseRelationship,
  ResolvedGrammarConstraints,
  SourceAnchor,
  TonalFrame,
  ValidatedGrammarV1Request,
} from './types'
import { validateGrammarV1Result } from './validateOutput'
import { validateGrammarV1Request } from './validateRequest'

const PHRASE_RELATIONSHIPS: readonly PhraseRelationship[] = [
  'antecedent',
  'antecedent',
  'consequent',
  'consequent',
]

const PHRASE_FUNCTIONS: readonly PhraseFunction[] = [
  'opening',
  'middle',
  'middle',
  'cadential',
]

const ALL_PRESENTED_ORDERS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => index + 1),
)

const roundSix = (value: number): number =>
  Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const relativePitchClass = (midiNote: number, tonicPitchClass: number): number =>
  ((midiNote - tonicPitchClass) % 12 + 12) % 12

export function quantizeGrammarContourIndex(
  normalizedPosition: number,
  scaleNoteCount: number,
): number {
  if (!Number.isFinite(normalizedPosition) ||
      normalizedPosition < 0 || normalizedPosition > 1) {
    throw new RangeError('normalizedPosition must be finite and in [0, 1].')
  }
  if (!Number.isInteger(scaleNoteCount) || scaleNoteCount <= 0) {
    throw new RangeError('scaleNoteCount must be a positive integer.')
  }
  return Math.floor(normalizedPosition * (scaleNoteCount - 1) + 0.5)
}

export function buildGrammarScaleNotes(
  tonicPitchClass: number,
  semitoneOffsets: readonly number[],
  minimumMidi: number,
  maximumMidi: number,
): readonly number[] {
  const notes: number[] = []
  for (let midiNote = minimumMidi; midiNote <= maximumMidi; midiNote += 1) {
    if (semitoneOffsets.includes(relativePitchClass(midiNote, tonicPitchClass))) {
      notes.push(midiNote)
    }
  }
  if (notes.length === 0) {
    throw new RangeError('The resolved tonal frame has no in-register scale notes.')
  }
  return notes
}

/**
 * Selects the smallest opposite-direction scale step after a forced large
 * leap. The generator itself keeps realized intervals below the large-leap
 * threshold, while this helper makes the recovery rule directly testable.
 */
export function selectOppositeLeapRecovery(
  scaleNotes: readonly number[],
  approachMidi: number,
  landingMidi: number,
  recoveryMaximumStepSemitones = 4,
): number {
  const leapDirection = Math.sign(landingMidi - approachMidi)
  if (leapDirection === 0) {
    throw new RangeError('A leap recovery requires a non-zero approach interval.')
  }
  const candidates = scaleNotes.filter((midiNote) => {
    const recovery = midiNote - landingMidi
    return Math.sign(recovery) === -leapDirection &&
      Math.abs(recovery) >= 1 &&
      Math.abs(recovery) <= recoveryMaximumStepSemitones
  })
  if (candidates.length === 0) {
    throw new RangeError('No scale note provides a bounded opposite-step recovery.')
  }
  return candidates.reduce((best, candidate) => {
    const candidateStep = Math.abs(candidate - landingMidi)
    const bestStep = Math.abs(best - landingMidi)
    return candidateStep < bestStep ||
      (candidateStep === bestStep && candidate < best)
      ? candidate
      : best
  })
}

const interpretationKey = (
  request: ValidatedGrammarV1Request,
): string => request.interpretation.items.map((item) => [
  item.presentedOrder,
  item.selectionDirection,
  Math.round(item.normalizedHue * 1_000),
  Math.round(item.normalizedHuePosition * 1_000_000),
].join(':')).join('|')

const chooseBest = (
  candidates: readonly number[],
  score: (candidate: number) => number,
  seed: string,
  key: string,
): number => {
  if (candidates.length === 0) {
    throw new RangeError(`No bounded candidate exists for ${key}.`)
  }
  const minimumScore = Math.min(...candidates.map(score))
  const best = candidates.filter((candidate) => score(candidate) === minimumScore)
  return deterministicChoice(seed, key, best)
}

const nearestMidiIndex = (
  candidates: readonly number[],
  scaleNotes: readonly number[],
  targetMidi: number,
  seed: string,
  key: string,
): number => chooseBest(
  candidates,
  (candidate) => Math.abs(scaleNotes[candidate] - targetMidi),
  seed,
  key,
)

const buildTonalFrame = (
  request: ValidatedGrammarV1Request,
): TonalFrame => {
  const signature = interpretationKey(request)
  const tonicPitchClass = deterministicIndex(
    request.seed,
    `tonal-frame|tonic|${request.profile.id}|${signature}`,
    12,
  )
  const mode = deterministicChoice(
    request.seed,
    `tonal-frame|mode|${request.profile.id}|${signature}`,
    request.profile.limits.allowedModes,
  )
  const definition = TONAL_MODE_DEFINITIONS[mode]
  const scaleNotes = buildGrammarScaleNotes(
    tonicPitchClass,
    definition.semitoneOffsets,
    request.constraints.minimumMidi,
    request.constraints.maximumMidi,
  )
  const tonicCandidates = scaleNotes.flatMap((midiNote, index) =>
    relativePitchClass(midiNote, tonicPitchClass) === 0 ? [index] : [])
  const registerMiddle = (
    request.constraints.minimumMidi + request.constraints.maximumMidi
  ) / 2
  const tonicIndex = nearestMidiIndex(
    tonicCandidates,
    scaleNotes,
    registerMiddle,
    request.seed,
    'tonal-frame|tonic-register',
  )

  return {
    tonicPitchClass,
    tonicMidi: scaleNotes[tonicIndex],
    mode,
    semitoneOffsets: [...definition.semitoneOffsets],
    scaleNotes,
    stabilityWeights: [...definition.stabilityWeights],
  }
}

const usableScaleIndices = (
  tonalFrame: TonalFrame,
  constraints: ResolvedGrammarConstraints,
): number[] => {
  const interior = tonalFrame.scaleNotes.flatMap((midiNote, index) =>
    midiNote > constraints.minimumMidi && midiNote < constraints.maximumMidi
      ? [index]
      : [])
  return interior.length > 0
    ? interior
    : tonalFrame.scaleNotes.map((_, index) => index)
}

const chooseCadenceScaleIndex = (
  request: ValidatedGrammarV1Request,
  tonalFrame: TonalFrame,
): number => {
  const candidates = usableScaleIndices(tonalFrame, request.constraints)
  const allIndices = tonalFrame.scaleNotes.map((_, index) => index)
  const interiorTonicCandidates = candidates.filter((index) =>
    relativePitchClass(
      tonalFrame.scaleNotes[index],
      tonalFrame.tonicPitchClass,
    ) === 0)
  const tonicCandidates = interiorTonicCandidates.length > 0
    ? interiorTonicCandidates
    : allIndices.filter((index) => relativePitchClass(
      tonalFrame.scaleNotes[index],
      tonalFrame.tonicPitchClass,
    ) === 0)
  const nonTonicCandidates = candidates.filter((index) => {
    const pitchClass = relativePitchClass(
      tonalFrame.scaleNotes[index],
      tonalFrame.tonicPitchClass,
    )
    const stability = tonalFrame.stabilityWeights[pitchClass]
    return pitchClass !== 0 && stability > 0 && stability < 1
  })
  const middle = (
    request.constraints.minimumMidi + request.constraints.maximumMidi
  ) / 2
  const tonic = nearestMidiIndex(
    tonicCandidates,
    tonalFrame.scaleNotes,
    middle,
    request.seed,
    'cadence|tonic-register',
  )
  const nonTonic = nearestMidiIndex(
    nonTonicCandidates,
    tonalFrame.scaleNotes,
    middle,
    request.seed,
    `cadence|non-tonic|${request.profile.id}`,
  )

  if (request.profile.limits.closureStrength === 'strong') return tonic
  if (request.profile.limits.closureStrength === 'open') return nonTonic
  return deterministicUnitInterval(
    request.seed,
    `cadence|moderate|${request.profile.id}|${interpretationKey(request)}`,
  ) < request.profile.weights.closure
    ? tonic
    : nonTonic
}

const chooseMotifAnchorScaleIndex = (
  request: ValidatedGrammarV1Request,
  tonalFrame: TonalFrame,
  cadenceScaleIndex: number,
): number => {
  const cadenceMidi = tonalFrame.scaleNotes[cadenceScaleIndex]
  const realizedMaximumLeap = Math.min(
    request.constraints.maximumMelodicLeapSemitones,
    request.constraints.largeLeapThresholdSemitones - 1,
  )
  const candidates = usableScaleIndices(tonalFrame, request.constraints).filter(
    (index) => index !== cadenceScaleIndex &&
      Math.abs(tonalFrame.scaleNotes[index] - cadenceMidi) <=
        realizedMaximumLeap,
  )
  return chooseBest(
    candidates,
    (index) => Math.abs(tonalFrame.scaleNotes[index] - cadenceMidi) * 100 +
      Math.abs(index - cadenceScaleIndex),
    request.seed,
    `motif|cadence-neighbour|${request.profile.id}`,
  )
}

const constructSeedScaleSteps = (
  request: ValidatedGrammarV1Request,
  tonalFrame: TonalFrame,
  motifEventCount: number,
  anchorScaleIndex: number,
  cadenceScaleIndex: number,
): number[] => {
  const anchorMidi = tonalFrame.scaleNotes[anchorScaleIndex]
  const cadenceMidi = tonalFrame.scaleNotes[cadenceScaleIndex]
  const realizedMaximumLeap = Math.min(
    request.constraints.maximumMelodicLeapSemitones,
    request.constraints.largeLeapThresholdSemitones - 1,
  )
  const localCandidates = usableScaleIndices(tonalFrame, request.constraints)
    .filter((index) =>
      Math.abs(tonalFrame.scaleNotes[index] - anchorMidi) <=
        realizedMaximumLeap &&
      Math.abs(tonalFrame.scaleNotes[index] - cadenceMidi) <=
        realizedMaximumLeap)
  const freeCount = motifEventCount === 2 ? 1 : motifEventCount - 2
  const result: number[] = []

  for (let position = 0; position < freeCount; position += 1) {
    const sourceIndex = freeCount === 1
      ? 0
      : Math.round(position * 11 / (freeCount - 1))
    const target = quantizeGrammarContourIndex(
      request.interpretation.registerContourCandidates[sourceIndex]
        .normalizedPosition,
      tonalFrame.scaleNotes.length,
    )
    let candidates = localCandidates.filter((index) =>
      result.length === 0 ||
      Math.abs(
        tonalFrame.scaleNotes[index] -
        tonalFrame.scaleNotes[result[result.length - 1]],
      ) <= realizedMaximumLeap)
    if (position === 0) {
      const nonAnchor = candidates.filter((index) => index !== anchorScaleIndex)
      if (nonAnchor.length > 0) candidates = nonAnchor
    }
    result.push(chooseBest(
      candidates,
      (index) => Math.abs(index - target),
      request.seed,
      `motif|seed-step|${position}|${target}`,
    ))
  }

  if (motifEventCount >= 3) result.push(anchorScaleIndex)
  result.push(anchorScaleIndex)
  return result
}

const intervalsWithinLimit = (
  scaleIndices: readonly number[],
  tonalFrame: TonalFrame,
  maximumLeap: number,
): boolean => scaleIndices.every((scaleIndex, index) =>
  index === 0 || Math.abs(
    tonalFrame.scaleNotes[scaleIndex] -
    tonalFrame.scaleNotes[scaleIndices[index - 1]],
  ) <= maximumLeap)

const chooseMiddleTransformation = (
  request: ValidatedGrammarV1Request,
  tonalFrame: TonalFrame,
  seedScaleSteps: readonly number[],
): { transformation: MotifTransformation; scaleSteps: number[] } => {
  if (request.profile.id !== 'RESTLESS_CONTOUR') {
    return { transformation: 'rhythmic-variation', scaleSteps: [...seedScaleSteps] }
  }

  const maximumLeap = Math.min(
    request.constraints.maximumMelodicLeapSemitones,
    request.constraints.largeLeapThresholdSemitones - 1,
  )
  const usable = new Set(usableScaleIndices(tonalFrame, request.constraints))
  const deltas = [-1, 1].filter((delta) => {
    const shifted = seedScaleSteps.map((scaleIndex) => scaleIndex + delta)
    if (!shifted.every((scaleIndex) => usable.has(scaleIndex))) return false
    if (!intervalsWithinLimit(shifted, tonalFrame, maximumLeap)) return false
    const previousPhraseLast = tonalFrame.scaleNotes[
      seedScaleSteps[seedScaleSteps.length - 1]
    ]
    const shiftedFirst = tonalFrame.scaleNotes[shifted[0]]
    const shiftedLast = tonalFrame.scaleNotes[shifted[shifted.length - 1]]
    const followingPhraseFirst = tonalFrame.scaleNotes[seedScaleSteps[0]]
    return Math.abs(previousPhraseLast - shiftedFirst) <= maximumLeap &&
      Math.abs(shiftedLast - followingPhraseFirst) <= maximumLeap
  })

  if (deltas.length === 0) {
    return { transformation: 'rhythmic-variation', scaleSteps: [...seedScaleSteps] }
  }
  const delta = deterministicChoice(
    request.seed,
    `motif|middle-transposition|${interpretationKey(request)}`,
    deltas,
  )
  return {
    transformation: 'contour-transposition',
    scaleSteps: seedScaleSteps.map((scaleIndex) => scaleIndex + delta),
  }
}

const choosePhraseRhythmCells = (
  request: ValidatedGrammarV1Request,
  motifEventCount: number,
  middleTransformation: MotifTransformation,
): readonly Readonly<RhythmCell>[] => {
  const availableRestEvents = request.constraints.maximumEvents -
    motifEventCount * request.constraints.phraseCount
  const baseRestProfiles = new Set([
    'CALM_SPARSE',
    'BALANCED_LYRICAL',
    'OPEN_ENDED',
  ])
  const mayRest = request.constraints.restsAllowed && motifEventCount < 5 &&
    request.profile.limits.restRatioTarget > 0
  const baseRested = mayRest && availableRestEvents >= 3 &&
    baseRestProfiles.has(request.profile.id)
  const afterBase = availableRestEvents - (baseRested ? 3 : 0)
  const wantsFourthRest = request.profile.id === 'OPEN_ENDED' ||
    request.profile.id === 'RESOLVED' || !baseRested
  const middleRested = middleTransformation === 'rhythmic-variation' &&
    mayRest && afterBase >= 1 && wantsFourthRest

  const base = getRhythmCellFor(motifEventCount, 'a', baseRested)
  const middle = middleTransformation === 'rhythmic-variation'
    ? getRhythmCellFor(motifEventCount, 'b', middleRested)
    : base
  return [base, base, middle, base]
}

const sourceForOrders = (
  request: ValidatedGrammarV1Request,
  presentedOrders: readonly number[],
) => {
  return {
    presentedOrders: [...presentedOrders],
    selectionDirections: presentedOrders.map((order) =>
      request.interpretation.items[order - 1].selectionDirection),
    contourPositions: presentedOrders.map((order) =>
      request.interpretation.registerContourCandidates[order - 1]
        .normalizedPosition),
  }
}

const noteSourceOrdersForPhrase = (
  phraseIndex: number,
  noteCount: number,
): readonly (readonly number[])[] => {
  const first = phraseIndex * 3 + 1
  switch (noteCount) {
    case 2: return [[first, first + 1], [first + 2]]
    case 3: return [[first], [first + 1], [first + 2]]
    case 4: return [[first], [first + 1], [first + 1], [first + 2]]
    case 5: return [[first], [first], [first + 1], [first + 1], [first + 2]]
    default: throw new RangeError('Motif source partition requires 2-5 notes.')
  }
}

const tensionForNote = (
  phraseIndex: number,
  midiNote: number,
  startBeat: number,
  durationBeats: number,
  tonalFrame: TonalFrame,
  constraints: ResolvedGrammarConstraints,
): number => {
  const phraseTension = [0.25, 0.4, 0.65, 0.15][phraseIndex]
  const registerDistance = Math.abs(midiNote - tonalFrame.tonicMidi) /
    Math.max(1, constraints.maximumMidi - constraints.minimumMidi)
  const pitchClass = relativePitchClass(midiNote, tonalFrame.tonicPitchClass)
  const instability = 1 - tonalFrame.stabilityWeights[pitchClass]
  const rhythmicTension = isSyncopatedNote(startBeat, durationBeats) ? 0.1 : 0
  return roundSix(clamp(
    phraseTension + registerDistance * 0.2 + instability * 0.15 + rhythmicTension,
    0,
    1,
  ))
}

const rationaleForTransformation = (
  transformation: MotifTransformation,
): GrammarRationaleCode => {
  switch (transformation) {
    case 'seed': return 'MOTIF_CONTOUR_QUANTIZED'
    case 'exact-repeat': return 'MOTIF_EXACT_REPEAT'
    case 'rhythmic-variation': return 'MOTIF_RHYTHM_VARIATION'
    case 'contour-transposition': return 'MOTIF_CONTOUR_TRANSPOSED'
    case 'final-note-variation': return 'MOTIF_FINAL_NOTE_VARIED'
    case 'bounded-inversion': return 'MOTIF_BOUNDED_INVERSION'
  }
}

const diagnostic = (
  code: string,
  actual: number,
  minimum?: number,
  maximum?: number,
): GrammarDiagnosticCheck => ({
  code,
  passed: (minimum === undefined || actual >= minimum) &&
    (maximum === undefined || actual <= maximum),
  actual: roundSix(actual),
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
})

const maximumEdgeRun = (
  notes: readonly GrammarNoteEvent[],
  constraints: ResolvedGrammarConstraints,
): number => {
  let current = 0
  let maximum = 0
  notes.forEach((note) => {
    if (note.midiNote === constraints.minimumMidi ||
        note.midiNote === constraints.maximumMidi) {
      current += 1
      maximum = Math.max(maximum, current)
    } else {
      current = 0
    }
  })
  return maximum
}

const unresolvedLargeLeapCount = (
  notes: readonly GrammarNoteEvent[],
  constraints: ResolvedGrammarConstraints,
): number => {
  let unresolved = 0
  for (let index = 1; index < notes.length; index += 1) {
    const leap = notes[index].midiNote - notes[index - 1].midiNote
    if (Math.abs(leap) < constraints.largeLeapThresholdSemitones) continue
    const next = notes[index + 1]
    const recovery = next === undefined ? 0 : next.midiNote - notes[index].midiNote
    if (next === undefined || Math.sign(recovery) !== -Math.sign(leap) ||
        Math.abs(recovery) < 1 ||
        Math.abs(recovery) > constraints.recoveryMaximumStepSemitones) {
      unresolved += 1
    }
  }
  return unresolved
}

/**
 * Generates the isolated Work 03 melody contract. The implementation has no
 * clock, mutable PRNG, I/O, crypto, locale, or external runtime dependency.
 */
export function generateGrammarV1(
  input: GenerateGrammarV1Request,
): GrammarV1Result {
  const request = validateGrammarV1Request(input)
  const traceEntries: GrammarTraceEntry[] = []
  const trace = (
    stage: GrammarTraceStage,
    code: GrammarRationaleCode,
    sourcePresentedOrders: readonly number[],
    values: Readonly<Record<string, GrammarTraceValue>>,
  ) => {
    traceEntries.push({
      sequence: traceEntries.length,
      stage,
      code,
      sourcePresentedOrders: [...sourcePresentedOrders],
      values: { ...values },
    })
  }

  trace('input', 'INPUT_CONTRACT_ACCEPTED', ALL_PRESENTED_ORDERS, {
    itemCount: request.interpretation.items.length,
    method: request.interpretation.method,
  })
  trace('input', 'PROFILE_LIMITS_APPLIED', ALL_PRESENTED_ORDERS, {
    profile: request.profile.id,
    maximumEvents: request.constraints.maximumEvents,
    maximumLeap: request.constraints.maximumMelodicLeapSemitones,
  })

  const tonalFrame = buildTonalFrame(request)
  trace('tonal-frame', 'TONIC_SEED_BUCKET', ALL_PRESENTED_ORDERS, {
    tonicPitchClass: tonalFrame.tonicPitchClass,
    tonicMidi: tonalFrame.tonicMidi,
  })
  trace('tonal-frame', 'MODE_PROFILE_CHOICE', ALL_PRESENTED_ORDERS, {
    mode: tonalFrame.mode,
    allowedModeCount: request.profile.limits.allowedModes.length,
  })

  const motifEventCount = request.profile.limits.motifEventCount
  const cadenceScaleIndex = chooseCadenceScaleIndex(request, tonalFrame)
  const anchorScaleIndex = chooseMotifAnchorScaleIndex(
    request,
    tonalFrame,
    cadenceScaleIndex,
  )
  const seedScaleSteps = constructSeedScaleSteps(
    request,
    tonalFrame,
    motifEventCount,
    anchorScaleIndex,
    cadenceScaleIndex,
  )
  const middle = chooseMiddleTransformation(request, tonalFrame, seedScaleSteps)
  const phraseScaleSteps = [
    [...seedScaleSteps],
    [...seedScaleSteps],
    middle.scaleSteps,
    [...seedScaleSteps.slice(0, -1), cadenceScaleIndex],
  ]
  const transformations: readonly MotifTransformation[] = [
    'seed',
    'exact-repeat',
    middle.transformation,
    'final-note-variation',
  ]
  const rhythmCells = choosePhraseRhythmCells(
    request,
    motifEventCount,
    middle.transformation,
  )

  trace('motif', 'MOTIF_CONTOUR_QUANTIZED', [1, 2, 3], {
    seedEventCount: motifEventCount,
    firstScaleIndex: seedScaleSteps[0],
    finalScaleIndex: seedScaleSteps[seedScaleSteps.length - 1],
  })

  const events: GrammarMelodyEvent[] = []
  const occurrences: MotifOccurrence[] = []
  const phrases: PhrasePlan[] = []
  const scaleIndexByEvent = new Map<number, number>()

  for (let phraseIndex = 0; phraseIndex < 4; phraseIndex += 1) {
    const phraseStart = phraseIndex * 3
    const phraseOrders = ALL_PRESENTED_ORDERS.slice(
      phraseIndex * 3,
      phraseIndex * 3 + 3,
    )
    const cell = rhythmCells[phraseIndex]
    const noteSourceOrders = noteSourceOrdersForPhrase(
      phraseIndex,
      motifEventCount,
    )
    const eventIndices: number[] = []
    const motifEventIndices: number[] = []
    let startBeat = phraseStart
    let noteIndex = 0

    cell.slots.forEach((slotDefinition) => {
      const eventIndex = events.length
      const sourceOrders = slotDefinition.kind === 'note'
        ? noteSourceOrders[noteIndex]
        : [noteSourceOrders[Math.max(0, noteIndex - 1)].at(-1) as number]
      const source = sourceForOrders(request, sourceOrders)
      const common = {
        eventIndex,
        startBeat,
        durationBeats: slotDefinition.durationBeats,
        phraseIndex,
        motifOccurrenceIndex: phraseIndex,
        source: {
          presentedOrders: source.presentedOrders,
          selectionDirections: source.selectionDirections,
          contourPositions: source.contourPositions,
        },
      }
      if (slotDefinition.kind === 'note') {
        const scaleIndex = phraseScaleSteps[phraseIndex][noteIndex]
        const midiNote = tonalFrame.scaleNotes[scaleIndex]
        events.push({
          ...common,
          kind: 'note',
          midiNote,
          tensionLevel: tensionForNote(
            phraseIndex,
            midiNote,
            startBeat,
            slotDefinition.durationBeats,
            tonalFrame,
            request.constraints,
          ),
        })
        scaleIndexByEvent.set(eventIndex, scaleIndex)
        motifEventIndices.push(eventIndex)
        noteIndex += 1
      } else {
        events.push({
          ...common,
          kind: 'rest',
          tensionLevel: roundSix(Math.max(0, [0.25, 0.4, 0.65, 0.15][phraseIndex] - 0.15)),
        })
      }
      eventIndices.push(eventIndex)
      startBeat += slotDefinition.durationBeats
    })

    if (noteIndex !== motifEventCount || startBeat !== phraseStart + 3) {
      throw new Error(`Internal Work 03 rhythm invariant failed in phrase ${phraseIndex}.`)
    }
    occurrences.push({
      occurrenceIndex: phraseIndex,
      phraseIndex,
      transformation: transformations[phraseIndex],
      eventIndices: motifEventIndices,
    })
    phrases.push({
      phraseIndex,
      startBeat: phraseStart,
      endBeat: phraseStart + 3,
      relationship: PHRASE_RELATIONSHIPS[phraseIndex],
      function: PHRASE_FUNCTIONS[phraseIndex],
      tonalCenterPitchClass: tonalFrame.tonicPitchClass,
      eventIndices,
    })

    trace(
      'motif',
      rationaleForTransformation(transformations[phraseIndex]),
      phraseOrders,
      {
        occurrenceIndex: phraseIndex,
        noteCount: motifEventIndices.length,
      },
    )
    trace(
      'phrase',
      phraseIndex < 2
        ? 'PHRASE_ANTECEDENT_OPENED'
        : 'PHRASE_CONSEQUENT_ANSWERED',
      phraseOrders,
      {
        phraseIndex,
        function: PHRASE_FUNCTIONS[phraseIndex],
        relationship: PHRASE_RELATIONSHIPS[phraseIndex],
      },
    )
    trace('rhythm', 'RHYTHM_CELL_SELECTED', phraseOrders, {
      phraseIndex,
      rhythmCellId: cell.id,
      restBeats: restDuration(cell),
    })
  }

  const sourceAnchors: SourceAnchor[] = request.interpretation.items.map(
    (item, itemIndex) => {
      const phraseIndex = Math.floor(itemIndex / 3)
      const targetScaleIndex = quantizeGrammarContourIndex(
        request.interpretation.registerContourCandidates[itemIndex]
          .normalizedPosition,
        tonalFrame.scaleNotes.length,
      )
      const occurrenceEventIndices = occurrences[phraseIndex].eventIndices.filter(
        (eventIndex) => events[eventIndex].source.presentedOrders.includes(
          item.presentedOrder,
        ),
      )
      const bestDistance = Math.min(...occurrenceEventIndices.map((eventIndex) =>
        Math.abs((scaleIndexByEvent.get(eventIndex) as number) - targetScaleIndex)))
      const closestEvents = occurrenceEventIndices.filter((eventIndex) =>
        Math.abs((scaleIndexByEvent.get(eventIndex) as number) - targetScaleIndex) ===
          bestDistance)
      return {
        presentedOrder: item.presentedOrder,
        targetScaleIndex,
        eventIndex: deterministicChoice(
          request.seed,
          `source-anchor|${item.presentedOrder}|${targetScaleIndex}`,
          closestEvents,
        ),
      }
    },
  )

  const notes = events.filter((event): event is GrammarNoteEvent =>
    event.kind === 'note')
  const rests = events.filter((event) => event.kind === 'rest')
  const syncopatedEvents = notes.filter((note) =>
    isSyncopatedNote(note.startBeat, note.durationBeats)).length
  const leaps = notes.slice(1).map((note, index) =>
    Math.abs(note.midiNote - notes[index].midiNote))
  const maximumLeap = leaps.length === 0 ? 0 : Math.max(...leaps)
  const unresolvedLeaps = unresolvedLargeLeapCount(notes, request.constraints)
  const edgeRun = maximumEdgeRun(notes, request.constraints)
  const restBeats = rests.reduce((sum, event) => sum + event.durationBeats, 0)
  const finalNote = notes[notes.length - 1]
  const finalPitchClass = relativePitchClass(
    finalNote.midiNote,
    tonalFrame.tonicPitchClass,
  )
  const finalStability = tonalFrame.stabilityWeights[finalPitchClass]

  trace('rhythm', 'REST_BUDGET_APPLIED', ALL_PRESENTED_ORDERS, {
    restEventCount: rests.length,
    restBeats,
    restsAllowed: request.constraints.restsAllowed,
  })
  trace('rhythm', 'SYNCOPATION_BUDGET_APPLIED', ALL_PRESENTED_ORDERS, {
    actual: syncopatedEvents,
    maximum: request.constraints.maximumSyncopatedEvents,
  })
  trace('register', 'REGISTER_CONTOUR_TARGETED', ALL_PRESENTED_ORDERS, {
    anchorCount: sourceAnchors.length,
    usedMinimumMidi: Math.min(...notes.map((note) => note.midiNote)),
    usedMaximumMidi: Math.max(...notes.map((note) => note.midiNote)),
  })
  trace('register', 'REGISTER_OCTAVE_CORRECTED', ALL_PRESENTED_ORDERS, {
    correctionCount: 0,
    maximumLeap,
  })
  trace('tension', 'TENSION_PROXY_APPLIED', ALL_PRESENTED_ORDERS, {
    maximumTension: Math.max(...events.map((event) => event.tensionLevel)),
    cadentialTension: finalNote.tensionLevel,
  })
  trace('cadence', 'CADENCE_STABILITY_TARGETED', [10, 11, 12], {
    closureStrength: request.profile.limits.closureStrength,
    finalMidi: finalNote.midiNote,
    finalStability,
  })
  trace('density', 'DENSITY_LIMIT_APPLIED', ALL_PRESENTED_ORDERS, {
    density: request.profile.limits.density,
    eventCount: events.length,
    noteCount: notes.length,
  })

  const grammar = {
    version: WORK03_MUSIC_GRAMMAR_VERSION,
    profile: request.profile.id,
    seed: request.seed,
    choiceAlgorithm: WORK03_DETERMINISTIC_CHOICE_VERSION,
    tempoBpm: request.profile.limits.tempoBpm,
    meter: { numerator: 3 as const, denominator: 4 as const },
    totalBeats: 12 as const,
    phraseLengthBeats: 3 as const,
    tonalFrame,
    constraints: request.constraints,
  }
  const melodyOutput: GrammarMelodyOutput = {
    versions: {
      outputContract: WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
      grammar: WORK03_MUSIC_GRAMMAR_VERSION,
      interpretationContract: FLOW_INTERPRETATION_CONTRACT_VERSION,
      interpreter: request.interpretation.versions.interpreter,
      generator: WORK03_GRAMMAR_GENERATOR_VERSION,
    },
    method: request.interpretation.method,
    grammar,
    totalBeats: 12,
    motif: {
      seedEventCount: motifEventCount,
      seedScaleSteps,
      seedRhythmCellId: rhythmCells[0].id,
      occurrences,
    },
    phrases,
    sourceAnchors,
    events,
  }

  const timingViolations = events.filter((event, index) => {
    const previousEnd = index === 0
      ? 0
      : events[index - 1].startBeat + events[index - 1].durationBeats
    return event.startBeat !== previousEnd ||
      !request.constraints.allowedDurationsBeats.includes(
        event.durationBeats as 0.5 | 1 | 1.5 | 2,
      )
  }).length
  const midiViolations = notes.filter((note) =>
    note.midiNote < request.constraints.minimumMidi ||
    note.midiNote > request.constraints.maximumMidi).length
  const provenanceOrders = new Set(events.flatMap((event) =>
    event.source.presentedOrders))
  const diagnostics: GrammarDiagnostics = {
    version: WORK03_DIAGNOSTICS_VERSION,
    checks: [
      diagnostic('TOTAL_BEATS', events.at(-1)!.startBeat + events.at(-1)!.durationBeats, 12, 12),
      diagnostic('PHRASE_COUNT', phrases.length, 4, 4),
      diagnostic('EVENT_COUNT', events.length, 8, request.constraints.maximumEvents),
      diagnostic('MOTIF_SEED_EVENT_COUNT', motifEventCount, 2, 5),
      diagnostic('MOTIF_RECURRENCE_COUNT', occurrences.length - 1, 1, 3),
      diagnostic('TIMING_VIOLATIONS', timingViolations, 0, 0),
      diagnostic('MIDI_RANGE_VIOLATIONS', midiViolations, 0, 0),
      diagnostic(
        'MAXIMUM_MELODIC_LEAP',
        maximumLeap,
        0,
        request.constraints.maximumMelodicLeapSemitones,
      ),
      diagnostic('UNRESOLVED_LARGE_LEAPS', unresolvedLeaps, 0, 0),
      diagnostic('MAXIMUM_EDGE_RUN', edgeRun, 0, request.constraints.maximumEdgeRun),
      diagnostic(
        'SYNCOPATED_EVENTS',
        syncopatedEvents,
        0,
        request.constraints.maximumSyncopatedEvents,
      ),
      diagnostic('REST_RATIO', restBeats / 12, 0, 1),
      diagnostic('SOURCE_ANCHORS', sourceAnchors.length, 12, 12),
      diagnostic('SOURCE_ORDER_COVERAGE', provenanceOrders.size, 12, 12),
      diagnostic('FINAL_STABILITY', finalStability, 0, 1),
      diagnostic(
        'MODE_PROFILE_BOUND',
        request.profile.limits.allowedModes.includes(tonalFrame.mode) ? 1 : 0,
        1,
        1,
      ),
    ],
    warnings: [
      ...(request.profile.limits.restRatioTarget > 0 && restBeats === 0
        ? ['REST_TARGET_NARROWED_BY_REQUEST_OR_EVENT_LIMIT']
        : []),
    ],
  }
  const grammarTrace: GrammarTrace = {
    version: WORK03_GRAMMAR_TRACE_VERSION,
    entries: traceEntries,
  }

  return validateGrammarV1Result({ melodyOutput, grammarTrace, diagnostics })
}
