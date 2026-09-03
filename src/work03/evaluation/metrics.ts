import type { FlowInterpretation } from '../../work02/interpretation/types'
import {
  buildScaleNotes,
  quantizeContourIndex,
  validateFlowInterpretationForMelody,
} from '../../work02/music/generator'
import type { MelodyOutput } from '../../work02/music/types'
import { validateMelodyOutput } from '../../work02/music/validateMelody'
import type {
  GrammarMelodyEvent,
  GrammarV1Result,
  SourceAnchor,
} from '../grammar/types'
import { validateGrammarV1Result } from '../grammar/validateOutput'
import { TONAL_MODE_DEFINITIONS } from '../grammar/tonalModes'
import { WORK03_STRUCTURAL_METRICS_VERSION } from '../versions'
import type { StructuralMetrics } from './types'

interface MetricEvent {
  eventIndex: number
  kind: 'note' | 'rest'
  startBeat: number
  durationBeats: number
  midiNote?: number
}

interface MetricAnchor {
  presentedOrder: number
  targetScaleIndex: number
  eventIndex: number
}

interface MetricView {
  events: readonly MetricEvent[]
  totalBeats: number
  ticksPerBeat: number
  pitchCollectionSize: number
  rhythmicVocabularySize: number
  minimumMidi: number
  maximumMidi: number
  tonalCenterPitchClass: number
  stabilityWeights: readonly number[]
  phraseEndBeats: readonly number[]
  phraseTonalCenters: readonly number[]
  motifLength: number
  motifRecurrenceCount: number
  anchors: readonly MetricAnchor[]
  largeLeapThresholdSemitones: number
  recoveryMaximumStepSemitones: number
}

const roundSix = (value: number): number =>
  Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000

const ratio = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : roundSix(numerator / denominator)

const mod12 = (value: number): number => ((value % 12) + 12) % 12

const circularPitchClassDistance = (first: number, second: number): number => {
  const direct = Math.abs(mod12(first) - mod12(second))
  return Math.min(direct, 12 - direct)
}

const normalizedEntropy = (
  values: readonly (string | number)[],
  alphabetSize: number,
): number => {
  if (values.length === 0 || alphabetSize <= 1) return 0
  const counts = new Map<string | number, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  const entropy = [...counts.values()].reduce((sum, count) => {
    const probability = count / values.length
    return sum - probability * Math.log2(probability)
  }, 0)
  return roundSix(entropy / Math.log2(alphabetSize))
}

const beatToTicks = (beat: number, ticksPerBeat: number): number => {
  const ticks = beat * ticksPerBeat
  if (!Number.isInteger(ticks)) {
    throw new RangeError('Validated metric timing must lie on the declared tick grid.')
  }
  return ticks
}

const longestBoundaryRun = (
  midiNotes: readonly number[],
  minimumMidi: number,
  maximumMidi: number,
): number => {
  let longest = 0
  let current = 0
  midiNotes.forEach((midi) => {
    if (midi === minimumMidi || midi === maximumMidi) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  })
  return longest
}

const measure = (view: MetricView): StructuralMetrics => {
  const totalTicks = beatToTicks(view.totalBeats, view.ticksPerBeat)
  const notes = view.events.flatMap((event) => event.kind === 'note'
    ? [{
        eventIndex: event.eventIndex,
        midiNote: event.midiNote as number,
        durationTicks: beatToTicks(event.durationBeats, view.ticksPerBeat),
      }]
    : [])
  const midiNotes = notes.map((note) => note.midiNote)
  const pitchClasses = midiNotes.map(mod12)
  const durationTicks = notes.map((note) => note.durationTicks)
  const restTicks = view.events.reduce((sum, event) =>
    sum + (event.kind === 'rest'
      ? beatToTicks(event.durationBeats, view.ticksPerBeat)
      : 0), 0)

  const exactRepeatCount = notes.slice(1).reduce((count, note, index) => {
    const previous = notes[index]
    return count + (
      note.midiNote === previous.midiNote &&
      note.durationTicks === previous.durationTicks
        ? 1
        : 0
    )
  }, 0)

  const leaps = midiNotes.slice(1).map((midi, index) => midi - midiNotes[index])
  let largeLeapCount = 0
  let unresolvedLeapCount = 0
  leaps.forEach((leap, index) => {
    if (Math.abs(leap) < view.largeLeapThresholdSemitones) return
    largeLeapCount += 1
    const recovery = leaps[index + 1]
    const recovered = recovery !== undefined &&
      Math.sign(recovery) === -Math.sign(leap) &&
      Math.abs(recovery) >= 1 &&
      Math.abs(recovery) <= view.recoveryMaximumStepSemitones
    if (!recovered) unresolvedLeapCount += 1
  })

  const usedMinimum = midiNotes.length === 0 ? view.minimumMidi : Math.min(...midiNotes)
  const usedMaximum = midiNotes.length === 0 ? view.minimumMidi : Math.max(...midiNotes)
  const registerSpan = Math.max(1, view.maximumMidi - view.minimumMidi)
  const edgeHits = midiNotes.filter(
    (midi) => midi === view.minimumMidi || midi === view.maximumMidi,
  ).length

  const eventsByIndex = new Map(view.events.map((event) => [event.eventIndex, event]))
  const anchors = [...view.anchors].sort(
    (first, second) => first.presentedOrder - second.presentedOrder,
  )
  let contourAgreements = 0
  let eligibleContourComparisons = 0
  anchors.slice(1).forEach((anchor, index) => {
    const previous = anchors[index]
    const targetChange = Math.sign(anchor.targetScaleIndex - previous.targetScaleIndex)
    if (targetChange === 0) return
    const previousEvent = eventsByIndex.get(previous.eventIndex)
    const event = eventsByIndex.get(anchor.eventIndex)
    if (previousEvent?.kind !== 'note' || event?.kind !== 'note') {
      throw new RangeError('Metric anchors must reference sounding note events.')
    }
    eligibleContourComparisons += 1
    if (Math.sign((event.midiNote as number) - (previousEvent.midiNote as number)) ===
        targetChange) {
      contourAgreements += 1
    }
  })

  const phraseEnds = view.phraseEndBeats.map((beat) =>
    beatToTicks(beat, view.ticksPerBeat))
  const phraseLengthTicks = phraseEnds.map(
    (end, index) => end - (index === 0 ? 0 : phraseEnds[index - 1]),
  )
  const finalMidi = midiNotes.at(-1)
  const finalRelativePitchClass = finalMidi === undefined
    ? 0
    : mod12(finalMidi - view.tonalCenterPitchClass)
  const tonalCenterDrift = view.phraseTonalCenters.reduce(
    (maximum, center) => Math.max(
      maximum,
      circularPitchClassDistance(center, view.tonalCenterPitchClass),
    ),
    0,
  )
  const intervalDirections = leaps.map((leap) => Math.sign(leap))

  return {
    version: WORK03_STRUCTURAL_METRICS_VERSION,
    pitchClassDiversityCount: new Set(pitchClasses).size,
    pitchClassDiversityRatio: ratio(
      new Set(pitchClasses).size,
      view.pitchCollectionSize,
    ),
    exactRepetitionRatio: ratio(exactRepeatCount, Math.max(1, notes.length - 1)),
    motifLength: view.motifLength,
    motifRecurrenceCount: view.motifRecurrenceCount,
    rhythmicDiversityCount: new Set(durationTicks).size,
    rhythmicEntropy: normalizedEntropy(durationTicks, view.rhythmicVocabularySize),
    restRatio: ratio(restTicks, totalTicks),
    phraseCount: phraseLengthTicks.length,
    phraseLengthTicks,
    phraseLengthMinimumTicks: phraseLengthTicks.length === 0
      ? 0
      : Math.min(...phraseLengthTicks),
    phraseLengthMaximumTicks: phraseLengthTicks.length === 0
      ? 0
      : Math.max(...phraseLengthTicks),
    phraseLengthMeanTicks: ratio(
      phraseLengthTicks.reduce((sum, length) => sum + length, 0),
      phraseLengthTicks.length,
    ),
    largeLeapCount,
    unresolvedLeapCount,
    registerUtilization: roundSix((usedMaximum - usedMinimum) / registerSpan),
    edgeHitRatio: ratio(edgeHits, notes.length),
    longestEdgeRun: longestBoundaryRun(
      midiNotes,
      view.minimumMidi,
      view.maximumMidi,
    ),
    contourAgreement: ratio(contourAgreements, eligibleContourComparisons),
    eligibleContourComparisons,
    finalStability: view.stabilityWeights[finalRelativePitchClass] ?? 0,
    eventDensity: ratio(notes.length, view.totalBeats),
    soundingRatio: ratio(
      durationTicks.reduce((sum, duration) => sum + duration, 0),
      totalTicks,
    ),
    tonalCenterDrift,
    pitchClassEntropy: normalizedEntropy(
      pitchClasses,
      view.pitchCollectionSize,
    ),
    intervalDirectionEntropy: normalizedEntropy(intervalDirections, 3),
  }
}

export function measureGrammarV1Structure(
  input: GrammarV1Result,
): StructuralMetrics {
  const result = validateGrammarV1Result(input)
  const output = result.melodyOutput
  return measure({
    events: output.events,
    totalBeats: output.totalBeats,
    ticksPerBeat: output.grammar.constraints.ticksPerBeat,
    pitchCollectionSize: output.grammar.tonalFrame.semitoneOffsets.length,
    rhythmicVocabularySize: output.grammar.constraints.allowedDurationsBeats.length,
    minimumMidi: output.grammar.constraints.minimumMidi,
    maximumMidi: output.grammar.constraints.maximumMidi,
    tonalCenterPitchClass: output.grammar.tonalFrame.tonicPitchClass,
    stabilityWeights: output.grammar.tonalFrame.stabilityWeights,
    phraseEndBeats: output.phrases.map((phrase) => phrase.endBeat),
    phraseTonalCenters: output.phrases.map((phrase) => phrase.tonalCenterPitchClass),
    motifLength: output.motif.seedEventCount,
    motifRecurrenceCount: output.motif.occurrences.length - 1,
    anchors: output.sourceAnchors,
    largeLeapThresholdSemitones:
      output.grammar.constraints.largeLeapThresholdSemitones,
    recoveryMaximumStepSemitones:
      output.grammar.constraints.recoveryMaximumStepSemitones,
  })
}

const baselineAnchors = (
  melody: MelodyOutput,
  interpretation: FlowInterpretation,
): SourceAnchor[] => {
  const scaleNotes = buildScaleNotes(melody.grammar)
  return interpretation.registerContourCandidates.map((candidate) => {
    const event = melody.events.find(
      (candidateEvent) => candidateEvent.kind === 'note' &&
        candidateEvent.source.presentedOrders.includes(candidate.presentedOrder),
    )
    if (!event || event.kind !== 'note') {
      throw new RangeError('Work 02 baseline is missing a source anchor note.')
    }
    return {
      presentedOrder: candidate.presentedOrder,
      targetScaleIndex: quantizeContourIndex(
        candidate.normalizedPosition,
        scaleNotes.length,
      ),
      eventIndex: event.eventIndex,
    }
  })
}

export function measureWork02BaselineStructure(
  input: MelodyOutput,
  interpretation: FlowInterpretation,
): StructuralMetrics {
  const melody = validateMelodyOutput(input)
  const validatedInterpretation = validateFlowInterpretationForMelody(interpretation)
  if (
    melody.method !== validatedInterpretation.method ||
    melody.versions.interpreter !== validatedInterpretation.versions.interpreter ||
    melody.versions.interpretationContract !==
      validatedInterpretation.versions.contract
  ) {
    throw new RangeError(
      'Work 02 baseline melody and interpretation contracts must match.',
    )
  }
  const majorPentatonic = TONAL_MODE_DEFINITIONS['major-pentatonic']
  return measure({
    events: melody.events,
    totalBeats: melody.totalBeats,
    ticksPerBeat: 2,
    pitchCollectionSize: melody.grammar.scale.semitoneOffsets.length,
    rhythmicVocabularySize: melody.grammar.allowedDurationsBeats.length,
    minimumMidi: melody.grammar.minimumMidi,
    maximumMidi: melody.grammar.maximumMidi,
    tonalCenterPitchClass: mod12(melody.grammar.tonicMidi),
    stabilityWeights: majorPentatonic.stabilityWeights,
    phraseEndBeats: [melody.totalBeats],
    phraseTonalCenters: [mod12(melody.grammar.tonicMidi)],
    motifLength: 0,
    motifRecurrenceCount: 0,
    anchors: baselineAnchors(melody, validatedInterpretation),
    largeLeapThresholdSemitones: 7,
    recoveryMaximumStepSemitones: 4,
  })
}

export function countUniqueCanonicalRuns(results: readonly unknown[]): number {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize)
    if (typeof value !== 'object' || value === null) return value
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize((value as Record<string, unknown>)[key])
        return result
      }, {})
  }
  return new Set(results.map((result) => JSON.stringify(canonicalize(result)))).size
}

export function asMetricEvents(
  events: readonly GrammarMelodyEvent[],
): readonly MetricEvent[] {
  return events
}
