import type { TonalMode } from './types'

export interface TonalModeDefinition {
  mode: TonalMode
  semitoneOffsets: readonly number[]
  /** Relative pitch-class weights indexed 0..11 from the tonal center. */
  stabilityWeights: readonly number[]
}

const mode = (
  name: TonalMode,
  semitoneOffsets: readonly number[],
  stableDegrees: Readonly<Record<number, number>>,
): Readonly<TonalModeDefinition> => {
  const stabilityWeights = Array.from(
    { length: 12 },
    (_, pitchClass) => stableDegrees[pitchClass] ?? 0,
  )
  return Object.freeze({
    mode: name,
    semitoneOffsets: Object.freeze([...semitoneOffsets]),
    stabilityWeights: Object.freeze(stabilityWeights),
  })
}

export const TONAL_MODE_DEFINITIONS: Readonly<
  Record<TonalMode, Readonly<TonalModeDefinition>>
> = Object.freeze({
  'major-pentatonic': mode(
    'major-pentatonic',
    [0, 2, 4, 7, 9],
    { 0: 1, 2: 0.35, 4: 0.6, 7: 0.75, 9: 0.35 },
  ),
  'minor-pentatonic': mode(
    'minor-pentatonic',
    [0, 3, 5, 7, 10],
    { 0: 1, 3: 0.6, 5: 0.4, 7: 0.75, 10: 0.45 },
  ),
  dorian: mode(
    'dorian',
    [0, 2, 3, 5, 7, 9, 10],
    { 0: 1, 2: 0.25, 3: 0.6, 5: 0.4, 7: 0.75, 9: 0.35, 10: 0.45 },
  ),
  mixolydian: mode(
    'mixolydian',
    [0, 2, 4, 5, 7, 9, 10],
    { 0: 1, 2: 0.25, 4: 0.6, 5: 0.4, 7: 0.75, 9: 0.35, 10: 0.45 },
  ),
})
