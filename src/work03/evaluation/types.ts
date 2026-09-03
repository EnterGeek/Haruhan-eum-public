import type { WORK03_STRUCTURAL_METRICS_VERSION } from '../versions'

export interface StructuralMetrics {
  version: typeof WORK03_STRUCTURAL_METRICS_VERSION
  pitchClassDiversityCount: number
  pitchClassDiversityRatio: number
  exactRepetitionRatio: number
  motifLength: number
  motifRecurrenceCount: number
  rhythmicDiversityCount: number
  rhythmicEntropy: number
  restRatio: number
  phraseCount: number
  phraseLengthTicks: readonly number[]
  phraseLengthMinimumTicks: number
  phraseLengthMaximumTicks: number
  phraseLengthMeanTicks: number
  largeLeapCount: number
  unresolvedLeapCount: number
  registerUtilization: number
  edgeHitRatio: number
  longestEdgeRun: number
  contourAgreement: number
  eligibleContourComparisons: number
  finalStability: number
  eventDensity: number
  soundingRatio: number
  tonalCenterDrift: number
  pitchClassEntropy: number
  intervalDirectionEntropy: number
}
