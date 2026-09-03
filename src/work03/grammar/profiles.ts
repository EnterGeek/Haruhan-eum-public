import {
  GRAMMAR_PROFILE_IDS,
  type GrammarProfileDefinition,
  type GrammarProfileId,
} from './types'

const profile = (
  definition: GrammarProfileDefinition,
): Readonly<GrammarProfileDefinition> => Object.freeze({
  id: definition.id,
  weights: Object.freeze({ ...definition.weights }),
  limits: Object.freeze({
    ...definition.limits,
    allowedModes: Object.freeze([...definition.limits.allowedModes]),
  }),
})

export const GRAMMAR_PROFILES: Readonly<
  Record<GrammarProfileId, Readonly<GrammarProfileDefinition>>
> = Object.freeze({
  CALM_SPARSE: profile({
    id: 'CALM_SPARSE',
    weights: {
      contour: 0.35,
      repetition: 0.8,
      rhythmicVariation: 0.2,
      inversion: 0,
      rest: 0.8,
      closure: 0.65,
    },
    limits: {
      density: 'sparse',
      motifEventCount: 2,
      restRatioTarget: 0.25,
      maximumSyncopatedEvents: 1,
      closureStrength: 'moderate',
      allowedModes: ['major-pentatonic', 'minor-pentatonic'],
      tempoBpm: 72,
    },
  }),
  BALANCED_LYRICAL: profile({
    id: 'BALANCED_LYRICAL',
    weights: {
      contour: 0.65,
      repetition: 0.65,
      rhythmicVariation: 0.55,
      inversion: 0.15,
      rest: 0.35,
      closure: 0.7,
    },
    limits: {
      density: 'balanced',
      motifEventCount: 3,
      restRatioTarget: 0.1,
      maximumSyncopatedEvents: 2,
      closureStrength: 'moderate',
      allowedModes: ['major-pentatonic', 'dorian'],
      tempoBpm: 80,
    },
  }),
  PULSING: profile({
    id: 'PULSING',
    weights: {
      contour: 0.5,
      repetition: 0.8,
      rhythmicVariation: 0.7,
      inversion: 0.1,
      rest: 0.2,
      closure: 0.55,
    },
    limits: {
      density: 'dense',
      motifEventCount: 5,
      restRatioTarget: 0.05,
      maximumSyncopatedEvents: 4,
      closureStrength: 'moderate',
      allowedModes: ['mixolydian', 'minor-pentatonic'],
      tempoBpm: 88,
    },
  }),
  RESTLESS_CONTOUR: profile({
    id: 'RESTLESS_CONTOUR',
    weights: {
      contour: 0.9,
      repetition: 0.35,
      rhythmicVariation: 0.75,
      inversion: 0.65,
      rest: 0.1,
      closure: 0.35,
    },
    limits: {
      density: 'dense',
      motifEventCount: 5,
      restRatioTarget: 0,
      maximumSyncopatedEvents: 5,
      closureStrength: 'open',
      allowedModes: ['dorian', 'minor-pentatonic'],
      tempoBpm: 92,
    },
  }),
  OPEN_ENDED: profile({
    id: 'OPEN_ENDED',
    weights: {
      contour: 0.7,
      repetition: 0.55,
      rhythmicVariation: 0.6,
      inversion: 0.3,
      rest: 0.45,
      closure: 0.1,
    },
    limits: {
      density: 'balanced',
      motifEventCount: 3,
      restRatioTarget: 0.15,
      maximumSyncopatedEvents: 3,
      closureStrength: 'open',
      allowedModes: ['dorian', 'mixolydian'],
      tempoBpm: 76,
    },
  }),
  RESOLVED: profile({
    id: 'RESOLVED',
    weights: {
      contour: 0.55,
      repetition: 0.7,
      rhythmicVariation: 0.4,
      inversion: 0.1,
      rest: 0.25,
      closure: 1,
    },
    limits: {
      density: 'balanced',
      motifEventCount: 3,
      restRatioTarget: 0.05,
      maximumSyncopatedEvents: 2,
      closureStrength: 'strong',
      allowedModes: ['major-pentatonic', 'minor-pentatonic'],
      tempoBpm: 78,
    },
  }),
})

export function isGrammarProfileId(value: unknown): value is GrammarProfileId {
  return typeof value === 'string' &&
    (GRAMMAR_PROFILE_IDS as readonly string[]).includes(value)
}

export function getGrammarProfile(
  profileId: GrammarProfileId,
): Readonly<GrammarProfileDefinition> {
  return GRAMMAR_PROFILES[profileId]
}
