import type {
  BenchmarkMetrics,
  MetricObservation,
  RobustnessMetrics,
  RuntimeObservation,
  ScalingObservation,
} from './types'

const unavailable = <T>(rationale: string): MetricObservation<T> => ({
  status: 'unavailable',
  confidence: 'insufficient',
  rationale,
})

export function createInitialMetrics(options: {
  deterministic: boolean | null
  runtime: RuntimeObservation
  inputItems: number
  outputEvents: number | null
  scheduleCompatible: boolean | null
}): BenchmarkMetrics {
  const pending = 'Available after normalized output metric analysis.'
  const scaling: MetricObservation<ScalingObservation> =
    options.outputEvents === null || options.inputItems <= 0
      ? unavailable('Input or output size is unavailable.')
      : {
          status: 'measured',
          confidence: 'low',
          value: {
            inputItems: options.inputItems,
            outputEvents: options.outputEvents,
            eventsPerInput: options.outputEvents / options.inputItems,
          },
          rationale: 'Single fixed-length observation; this is not a scaling slope.',
        }
  const robustness: RobustnessMetrics = {
    sameSeedDeterminism: options.deterministic === null
      ? unavailable('The generator did not complete both same-seed runs.')
      : {
          status: 'measured',
          confidence: 'high',
          value: options.deterministic,
          rationale: 'Canonical outputs from two same-seed calls are compared exactly.',
        },
    perturbationSensitivity: unavailable('No perturbed-session pass has run yet.'),
    inputLengthScaling: unavailable(
      'Work 01 fixes valid generator input at exactly twelve final decisions.',
    ),
    runtime: {
      status: 'measured',
      confidence: 'low',
      value: options.runtime,
      rationale: 'Local wall-clock samples are environment evidence, not a stable score.',
    },
    outputSizeScaling: scaling,
  }
  return {
    validity: {
      schemaValidity: unavailable(pending),
      finiteNumbers: unavailable(pending),
      durationValidity: unavailable(pending),
      totalBeatConsistency: unavailable(pending),
      noteBounds: unavailable(pending),
      scheduleCompatibility: options.scheduleCompatible === null
        ? unavailable('This adapter does not expose schedule validation.')
        : {
            status: 'measured',
            confidence: 'contract',
            value: options.scheduleCompatible,
            rationale: 'Reported by the generator-specific schedule adapter.',
          },
    },
    pitch: {
      pitchClassDiversity: unavailable(pending),
      intervalHistogram: unavailable(pending),
      largeLeapRate: unavailable(pending),
      unresolvedLeapRate: unavailable(pending),
      repeatedNoteRunLength: unavailable(pending),
      registerUtilization: unavailable(pending),
      edgeOccupancy: unavailable(pending),
      tonalCenterDriftProxy: unavailable(pending),
    },
    rhythm: {
      durationDiversity: unavailable(pending),
      onsetDensity: unavailable(pending),
      restRatio: unavailable(pending),
      longestUninterruptedRun: unavailable(pending),
      identicalCellRepetition: unavailable(pending),
      microNoteRate: unavailable(pending),
      phraseBoundaryAlignmentProxy: unavailable(pending),
    },
    form: {
      motifRecurrence: unavailable(pending),
      exactCopyRatio: unavailable(pending),
      variationRatio: unavailable(pending),
      phraseLengthDistribution: unavailable(pending),
      cadenceFinalStabilityProxy: unavailable(pending),
      openingEndingSimilarity: unavailable(pending),
      contourAgreement: unavailable(pending),
    },
    robustness,
  }
}
