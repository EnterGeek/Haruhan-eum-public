import type { SessionExport } from '../../../domain/types'
import type {
  FlowInterpretation,
  InterpretationMethod,
} from '../../../work02/interpretation/types'

export const INPUT_PATTERN_FAMILIES = [
  'all-left',
  'all-right',
  'alternating',
  'long-same-direction-runs',
  'palindromic-choices',
  'sparse-interactions',
  'dense-interactions',
  'very-fast-interaction-timestamps',
  'long-pauses',
  'repeated-same-card/deck-patterns',
  'undo-then-reselect',
  'pause/resume',
  'mixed-button/swipe',
  'same-deck-replay',
  'edge-hue-transitions',
  'minimum-valid-session',
  'maximum-bounded-session',
] as const

export type InputPatternFamily = typeof INPUT_PATTERN_FAMILIES[number]

export const INTERPRETATION_STRESS_FAMILIES = [
  'monotonic-contour',
  'zig-zag-contour',
  'flat-contour',
  'extreme-contour-span',
  'contradictory-candidate-tendencies',
  'repeated-source-values',
  'boundary-hue-values',
  'provenance-mistakes-for-negative-tests',
] as const

export type InterpretationStressFamily =
  typeof INTERPRETATION_STRESS_FAMILIES[number]

export interface SessionCorpusCase {
  id: string
  families: readonly InputPatternFamily[]
  session: SessionExport
}

export interface InterpretationCorpusCase {
  id: string
  families: readonly InterpretationStressFamily[]
  session: SessionExport
  method: InterpretationMethod
  interpretation: FlowInterpretation
  expectedValidity: 'valid' | 'invalid-provenance'
}
