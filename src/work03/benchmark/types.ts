export type FindingCategory =
  | 'CONTRACT_FAILURE'
  | 'STRUCTURAL_MUSICAL_RISK'
  | 'REPETITION_MONOTONY'
  | 'REGISTER_RHYTHM_PATHOLOGY'
  | 'VALID_BUT_UNUSUAL_OUTPUT'
  | 'METRIC_UNCERTAINTY'

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type ResultCategory =
  | 'hard-contract-violation'
  | 'high-confidence-structural-risk'
  | 'low-confidence-structural-observation'
  | 'abstain-no-finding'

export interface Finding {
  code: string
  category: FindingCategory
  severity: FindingSeverity
  resultCategory: Exclude<ResultCategory, 'abstain-no-finding'>
  rationale: string
  evidence: Readonly<Record<string, boolean | number | string | null>>
}

export type MetricConfidence = 'contract' | 'high' | 'low' | 'insufficient'

export type MetricObservation<T> =
  | {
      status: 'measured'
      value: T
      confidence: MetricConfidence
      rationale: string
    }
  | {
      status: 'unavailable'
      confidence: 'insufficient'
      rationale: string
    }

export interface ValidityMetrics {
  schemaValidity: MetricObservation<boolean>
  finiteNumbers: MetricObservation<boolean>
  durationValidity: MetricObservation<boolean>
  totalBeatConsistency: MetricObservation<boolean>
  noteBounds: MetricObservation<boolean>
  scheduleCompatibility: MetricObservation<boolean>
}

export interface PitchMetrics {
  pitchClassDiversity: MetricObservation<number>
  intervalHistogram: MetricObservation<Readonly<Record<string, number>>>
  largeLeapRate: MetricObservation<number>
  unresolvedLeapRate: MetricObservation<number>
  repeatedNoteRunLength: MetricObservation<number>
  registerUtilization: MetricObservation<number>
  edgeOccupancy: MetricObservation<number>
  tonalCenterDriftProxy: MetricObservation<number>
}

export interface RhythmMetrics {
  durationDiversity: MetricObservation<number>
  onsetDensity: MetricObservation<number>
  restRatio: MetricObservation<number>
  longestUninterruptedRun: MetricObservation<number>
  identicalCellRepetition: MetricObservation<number>
  microNoteRate: MetricObservation<number>
  phraseBoundaryAlignmentProxy: MetricObservation<number>
}

export interface FormMetrics {
  motifRecurrence: MetricObservation<number>
  exactCopyRatio: MetricObservation<number>
  variationRatio: MetricObservation<number>
  phraseLengthDistribution: MetricObservation<readonly number[]>
  cadenceFinalStabilityProxy: MetricObservation<number>
  openingEndingSimilarity: MetricObservation<number>
  contourAgreement: MetricObservation<number>
}

export interface RuntimeObservation {
  firstRunMilliseconds: number
  repeatRunMilliseconds: number
  perturbationRunMilliseconds: number | null
}

export interface ScalingObservation {
  inputItems: number
  outputEvents: number
  eventsPerInput: number
}

export interface RobustnessMetrics {
  sameSeedDeterminism: MetricObservation<boolean>
  perturbationSensitivity: MetricObservation<number>
  inputLengthScaling: MetricObservation<ScalingObservation>
  runtime: MetricObservation<RuntimeObservation>
  outputSizeScaling: MetricObservation<ScalingObservation>
}

export interface BenchmarkMetrics {
  validity: ValidityMetrics
  pitch: PitchMetrics
  rhythm: RhythmMetrics
  form: FormMetrics
  robustness: RobustnessMetrics
}

export type ValidationScope =
  | 'generator'
  | 'schema'
  | 'finite-numbers'
  | 'duration'
  | 'timeline'
  | 'note-bounds'
  | 'provenance'
  | 'schedule'

export interface ValidationCheck {
  id: string
  scope: ValidationScope
  passed: boolean
  message: string
}

export interface ValidationReport {
  generatorCompleted: boolean
  inspectionAvailable: boolean
  contractValid: boolean
  scheduleCompatible: boolean | null
  checks: readonly ValidationCheck[]
}

export interface NormalizedEventSource {
  presentedOrders: readonly number[]
  selectionDirections: readonly ('left' | 'right')[]
  contourPositions: readonly number[]
}

export type NormalizedMelodyEvent =
  | {
      kind: 'note'
      eventIndex: number
      startBeat: number
      durationBeats: number
      midiNote: number
      source: NormalizedEventSource
    }
  | {
      kind: 'rest'
      eventIndex: number
      startBeat: number
      durationBeats: number
      source: NormalizedEventSource
    }

export interface NormalizedMelody {
  totalBeats: number
  tempoBpm: number
  minimumMidi: number
  maximumMidi: number
  tonicMidi: number
  maximumMelodicLeapSemitones: number
  allowedDurationsBeats: readonly number[]
  events: readonly NormalizedMelodyEvent[]
}

export interface BenchmarkAdapterContext<
  TSession,
  TOutput,
  TProfile extends BenchmarkProfile<TSession, TOutput>,
> {
  session: TSession
  output: TOutput
  generatorId: string
  seed: number
  profile: TProfile
}

export interface BenchmarkProfile<TSession, TOutput> {
  id: string
  inputLength(session: TSession): number
  inspectOutput(
    output: TOutput,
    context: BenchmarkAdapterContext<TSession, TOutput, this>,
  ): NormalizedMelody
  validateOutput(
    output: TOutput,
    context: BenchmarkAdapterContext<TSession, TOutput, this>,
  ): readonly ValidationCheck[]
  validateSchedule?(
    output: TOutput,
    context: BenchmarkAdapterContext<TSession, TOutput, this>,
  ): ValidationCheck
  perturbSession?(session: TSession): TSession
}

export type BenchmarkGenerate<
  TSession,
  TOutput,
  TProfile extends BenchmarkProfile<TSession, TOutput>,
> = (options: {
  session: TSession
  seed: number
  profile: TProfile
}) => TOutput | Promise<TOutput>

export interface EvaluateGeneratorOptions<
  TSession,
  TOutput,
  TProfile extends BenchmarkProfile<TSession, TOutput>,
> {
  session: TSession
  generate: BenchmarkGenerate<TSession, TOutput, TProfile>
  generatorId: string
  seed: number
  profile: TProfile
}

export interface GeneratorEvaluation<TOutput> {
  output: TOutput | null
  validation: ValidationReport
  metrics: BenchmarkMetrics
  findings: readonly Finding[]
  failureSignature: string
  resultCategory: ResultCategory
}
