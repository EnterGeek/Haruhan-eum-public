import type { Direction } from '../../domain/types'
import type {
  FlowInterpretation,
  InterpretationMethod,
  InterpreterVersion,
} from '../../work02/interpretation/types'
import type { FLOW_INTERPRETATION_CONTRACT_VERSION } from '../../work02/versions'
import type {
  WORK03_DIAGNOSTICS_VERSION,
  WORK03_DETERMINISTIC_CHOICE_VERSION,
  WORK03_GRAMMAR_GENERATOR_VERSION,
  WORK03_GRAMMAR_TRACE_VERSION,
  WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
  WORK03_MUSIC_GRAMMAR_VERSION,
} from '../versions'

export const GRAMMAR_PROFILE_IDS = [
  'CALM_SPARSE',
  'BALANCED_LYRICAL',
  'PULSING',
  'RESTLESS_CONTOUR',
  'OPEN_ENDED',
  'RESOLVED',
] as const

export type GrammarProfileId = typeof GRAMMAR_PROFILE_IDS[number]
export type GrammarDensity = 'sparse' | 'balanced' | 'dense'
export type ClosureStrength = 'open' | 'moderate' | 'strong'
export type TonalMode =
  | 'major-pentatonic'
  | 'minor-pentatonic'
  | 'dorian'
  | 'mixolydian'

export type MotifTransformation =
  | 'seed'
  | 'exact-repeat'
  | 'rhythmic-variation'
  | 'contour-transposition'
  | 'final-note-variation'
  | 'bounded-inversion'

export type PhraseRelationship = 'antecedent' | 'consequent'
export type PhraseFunction = 'opening' | 'middle' | 'cadential'

export interface GrammarProfileWeights {
  contour: number
  repetition: number
  rhythmicVariation: number
  inversion: number
  rest: number
  closure: number
}

export interface GrammarProfileLimits {
  density: GrammarDensity
  motifEventCount: number
  restRatioTarget: number
  maximumSyncopatedEvents: number
  closureStrength: ClosureStrength
  allowedModes: readonly TonalMode[]
  tempoBpm: number
}

export interface GrammarProfileDefinition {
  id: GrammarProfileId
  weights: Readonly<GrammarProfileWeights>
  limits: Readonly<GrammarProfileLimits>
}

/**
 * Caller controls may only narrow Work 03's bounded defaults. They do not add
 * scales, durations, event types, or semantic labels at runtime.
 */
export interface GrammarConstraintOverrides {
  minimumMidi?: number
  maximumMidi?: number
  maximumMelodicLeapSemitones?: number
  maximumSyncopatedEvents?: number
  maximumEvents?: number
  restsAllowed?: boolean
}

export interface ResolvedGrammarConstraints {
  minimumMidi: number
  maximumMidi: number
  maximumMelodicLeapSemitones: number
  maximumSyncopatedEvents: number
  maximumEvents: number
  restsAllowed: boolean
  totalBeats: 12
  phraseCount: 4
  phraseLengthBeats: 3
  allowedDurationsBeats: readonly [0.5, 1, 1.5, 2]
  minimumMotifEvents: 2
  maximumMotifEvents: 5
  ticksPerBeat: 2
  largeLeapThresholdSemitones: 7
  recoveryMaximumStepSemitones: 4
  maximumEdgeRun: 2
}

export interface GenerateGrammarV1Request {
  interpretation: FlowInterpretation
  seed: string
  profile: GrammarProfileId
  constraints?: Readonly<GrammarConstraintOverrides>
}

export interface ValidatedGrammarV1Request {
  interpretation: FlowInterpretation
  seed: string
  profile: Readonly<GrammarProfileDefinition>
  constraints: Readonly<ResolvedGrammarConstraints>
}

export interface TonalFrame {
  tonicPitchClass: number
  tonicMidi: number
  mode: TonalMode
  semitoneOffsets: readonly number[]
  scaleNotes: readonly number[]
  stabilityWeights: readonly number[]
}

export interface GrammarSnapshot {
  version: typeof WORK03_MUSIC_GRAMMAR_VERSION
  profile: GrammarProfileId
  seed: string
  choiceAlgorithm: typeof WORK03_DETERMINISTIC_CHOICE_VERSION
  tempoBpm: number
  meter: Readonly<{ numerator: 3; denominator: 4 }>
  totalBeats: 12
  phraseLengthBeats: 3
  tonalFrame: Readonly<TonalFrame>
  constraints: Readonly<ResolvedGrammarConstraints>
}

export interface GrammarEventSource {
  presentedOrders: readonly number[]
  selectionDirections: readonly Direction[]
  contourPositions: readonly number[]
}

interface GrammarEventBase {
  eventIndex: number
  startBeat: number
  durationBeats: number
  phraseIndex: number
  motifOccurrenceIndex: number
  tensionLevel: number
  source: GrammarEventSource
}

export interface GrammarNoteEvent extends GrammarEventBase {
  kind: 'note'
  midiNote: number
}

export interface GrammarRestEvent extends GrammarEventBase {
  kind: 'rest'
}

export type GrammarMelodyEvent = GrammarNoteEvent | GrammarRestEvent

export interface MotifOccurrence {
  occurrenceIndex: number
  phraseIndex: number
  transformation: MotifTransformation
  eventIndices: readonly number[]
}

export interface MotifPlan {
  seedEventCount: number
  seedScaleSteps: readonly number[]
  seedRhythmCellId: string
  occurrences: readonly MotifOccurrence[]
}

export interface PhrasePlan {
  phraseIndex: number
  startBeat: number
  endBeat: number
  relationship: PhraseRelationship
  function: PhraseFunction
  tonalCenterPitchClass: number
  eventIndices: readonly number[]
}

export interface SourceAnchor {
  presentedOrder: number
  targetScaleIndex: number
  eventIndex: number
}

export interface GrammarMelodyOutput {
  versions: {
    outputContract: typeof WORK03_MELODY_OUTPUT_CONTRACT_VERSION
    grammar: typeof WORK03_MUSIC_GRAMMAR_VERSION
    interpretationContract: typeof FLOW_INTERPRETATION_CONTRACT_VERSION
    interpreter: InterpreterVersion
    generator: typeof WORK03_GRAMMAR_GENERATOR_VERSION
  }
  method: InterpretationMethod
  grammar: Readonly<GrammarSnapshot>
  totalBeats: 12
  motif: Readonly<MotifPlan>
  phrases: readonly PhrasePlan[]
  sourceAnchors: readonly SourceAnchor[]
  events: readonly GrammarMelodyEvent[]
}

export type GrammarTraceStage =
  | 'input'
  | 'tonal-frame'
  | 'motif'
  | 'phrase'
  | 'rhythm'
  | 'register'
  | 'tension'
  | 'cadence'
  | 'density'

export type GrammarRationaleCode =
  | 'INPUT_CONTRACT_ACCEPTED'
  | 'PROFILE_LIMITS_APPLIED'
  | 'TONIC_SEED_BUCKET'
  | 'MODE_PROFILE_CHOICE'
  | 'MOTIF_CONTOUR_QUANTIZED'
  | 'MOTIF_EXACT_REPEAT'
  | 'MOTIF_RHYTHM_VARIATION'
  | 'MOTIF_CONTOUR_TRANSPOSED'
  | 'MOTIF_FINAL_NOTE_VARIED'
  | 'MOTIF_BOUNDED_INVERSION'
  | 'PHRASE_ANTECEDENT_OPENED'
  | 'PHRASE_CONSEQUENT_ANSWERED'
  | 'RHYTHM_CELL_SELECTED'
  | 'REST_BUDGET_APPLIED'
  | 'SYNCOPATION_BUDGET_APPLIED'
  | 'REGISTER_CONTOUR_TARGETED'
  | 'REGISTER_OCTAVE_CORRECTED'
  | 'LEAP_PREPARED'
  | 'LEAP_RECOVERED'
  | 'TENSION_PROXY_APPLIED'
  | 'CADENCE_STABILITY_TARGETED'
  | 'DENSITY_LIMIT_APPLIED'

export type GrammarTraceValue = string | number | boolean

export interface GrammarTraceEntry {
  sequence: number
  stage: GrammarTraceStage
  code: GrammarRationaleCode
  sourcePresentedOrders: readonly number[]
  values: Readonly<Record<string, GrammarTraceValue>>
}

export interface GrammarTrace {
  version: typeof WORK03_GRAMMAR_TRACE_VERSION
  entries: readonly GrammarTraceEntry[]
}

export interface GrammarDiagnosticCheck {
  code: string
  passed: boolean
  actual: number
  minimum?: number
  maximum?: number
}

export interface GrammarDiagnostics {
  version: typeof WORK03_DIAGNOSTICS_VERSION
  checks: readonly GrammarDiagnosticCheck[]
  warnings: readonly string[]
}

export interface GrammarV1Result {
  melodyOutput: GrammarMelodyOutput
  grammarTrace: GrammarTrace
  diagnostics: GrammarDiagnostics
}
