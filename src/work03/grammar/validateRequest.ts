import { validateFlowInterpretationForMelody } from '../../work02/music/generator'
import { interpretFlow } from '../../work02/interpretation/interpretFlow'
import type { FlowInterpretation } from '../../work02/interpretation/types'
import type { Work02Input } from '../../work02/types'
import { COMMON_FEATURES_VERSION } from '../../work02/versions'
import { getGrammarProfile, isGrammarProfileId } from './profiles'
import type {
  GenerateGrammarV1Request,
  GrammarConstraintOverrides,
  ResolvedGrammarConstraints,
  ValidatedGrammarV1Request,
} from './types'

export class GrammarV1RequestValidationError extends Error {
  constructor(message: string) {
    super(`Invalid Grammar v1 request: ${message}`)
    this.name = 'GrammarV1RequestValidationError'
  }
}

const fail = (message: string): never => {
  throw new GrammarV1RequestValidationError(message)
}

const object = (value: unknown, path: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : fail(`${path} must be an object.`)

const integer = (value: unknown, path: string): number =>
  typeof value === 'number' && Number.isInteger(value)
    ? value
    : fail(`${path} must be a finite integer.`)

const allowedOverrideKeys = new Set<keyof GrammarConstraintOverrides>([
  'minimumMidi',
  'maximumMidi',
  'maximumMelodicLeapSemitones',
  'maximumSyncopatedEvents',
  'maximumEvents',
  'restsAllowed',
])

const allowedRequestKeys = new Set([
  'interpretation',
  'seed',
  'profile',
  'constraints',
])

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

const validateStrictInterpretation = (
  input: FlowInterpretation,
): FlowInterpretation => {
  if (input.versions.commonFeatures !== COMMON_FEATURES_VERSION) {
    fail('interpretation common-features version is unsupported.')
  }

  input.items.forEach((item, index) => {
    if (typeof item.cardId !== 'string' || item.cardId.length === 0) {
      fail(`interpretation item ${index + 1} must preserve a non-empty cardId.`)
    }
    if (!Number.isFinite(item.normalizedHue) ||
        item.normalizedHue < 0 || item.normalizedHue >= 360) {
      fail(`interpretation item ${index + 1} normalizedHue must be in [0, 360).`)
    }
    if (!Number.isFinite(item.normalizedHuePosition) ||
        item.normalizedHuePosition < 0 || item.normalizedHuePosition > 1) {
      fail(
        `interpretation item ${index + 1} normalizedHuePosition must be in [0, 1].`,
      )
    }
    if (!Number.isFinite(item.lightness) ||
        item.lightness < 0 || item.lightness > 1) {
      fail(`interpretation item ${index + 1} lightness must be in [0, 1].`)
    }
    if (!Number.isFinite(item.chroma) || item.chroma < 0) {
      fail(`interpretation item ${index + 1} chroma must be non-negative.`)
    }
  })

  const reconstructed = input.items.map((item) => ({
    index: item.presentedOrder,
    cardId: item.cardId,
    color: {
      hue: item.normalizedHue,
      lightness: item.lightness,
      chroma: item.chroma,
    },
    direction: item.selectionDirection,
  })) as unknown as Work02Input
  const expected = interpretFlow(reconstructed, input.method)
  if (
    JSON.stringify(canonicalize(input)) !==
    JSON.stringify(canonicalize(expected))
  ) {
    fail(
      'interpretation must exactly match the deterministic official Work 02 interpreter output.',
    )
  }
  return input
}

const resolveConstraints = (
  overridesInput: unknown,
  profileMaximumSyncopatedEvents: number,
  profileMotifEventCount: number,
): Readonly<ResolvedGrammarConstraints> => {
  const overrides = overridesInput === undefined
    ? {}
    : object(overridesInput, 'constraints')
  Object.keys(overrides).forEach((key) => {
    if (!allowedOverrideKeys.has(key as keyof GrammarConstraintOverrides)) {
      fail(`constraints.${key} is unsupported.`)
    }
  })

  const minimumMidi = overrides.minimumMidi === undefined
    ? 55
    : integer(overrides.minimumMidi, 'constraints.minimumMidi')
  const maximumMidi = overrides.maximumMidi === undefined
    ? 79
    : integer(overrides.maximumMidi, 'constraints.maximumMidi')
  if (minimumMidi < 55 || minimumMidi > 67) {
    fail('constraints.minimumMidi must be in [55, 67].')
  }
  if (maximumMidi < 67 || maximumMidi > 79) {
    fail('constraints.maximumMidi must be in [67, 79].')
  }
  if (maximumMidi - minimumMidi < 12) {
    fail('the resolved MIDI register must span at least 12 semitones.')
  }

  const maximumMelodicLeapSemitones =
    overrides.maximumMelodicLeapSemitones === undefined
      ? 7
      : integer(
          overrides.maximumMelodicLeapSemitones,
          'constraints.maximumMelodicLeapSemitones',
        )
  if (maximumMelodicLeapSemitones < 2 || maximumMelodicLeapSemitones > 7) {
    fail('constraints.maximumMelodicLeapSemitones must be in [2, 7].')
  }

  const maximumSyncopatedEvents = overrides.maximumSyncopatedEvents === undefined
    ? profileMaximumSyncopatedEvents
    : integer(
        overrides.maximumSyncopatedEvents,
        'constraints.maximumSyncopatedEvents',
      )
  if (
    maximumSyncopatedEvents < 0 ||
    maximumSyncopatedEvents > profileMaximumSyncopatedEvents
  ) {
    fail(
      'constraints.maximumSyncopatedEvents must be non-negative and must not widen the profile limit.',
    )
  }

  const maximumEvents = overrides.maximumEvents === undefined
    ? 20
    : integer(overrides.maximumEvents, 'constraints.maximumEvents')
  if (maximumEvents < 8 || maximumEvents > 20) {
    fail('constraints.maximumEvents must be in [8, 20].')
  }
  if (maximumEvents < profileMotifEventCount * 4) {
    fail(
      'constraints.maximumEvents cannot contain four occurrences of the selected profile motif.',
    )
  }

  const rawRestsAllowed = overrides.restsAllowed === undefined
    ? true
    : overrides.restsAllowed
  if (typeof rawRestsAllowed !== 'boolean') {
    fail('constraints.restsAllowed must be a boolean.')
  }
  const restsAllowed = rawRestsAllowed as boolean

  return Object.freeze({
    minimumMidi,
    maximumMidi,
    maximumMelodicLeapSemitones,
    maximumSyncopatedEvents,
    maximumEvents,
    restsAllowed,
    totalBeats: 12,
    phraseCount: 4,
    phraseLengthBeats: 3,
    allowedDurationsBeats: Object.freeze([0.5, 1, 1.5, 2] as const),
    minimumMotifEvents: 2,
    maximumMotifEvents: 5,
    ticksPerBeat: 2,
    largeLeapThresholdSemitones: 7,
    recoveryMaximumStepSemitones: 4,
    maximumEdgeRun: 2,
  })
}

export function validateGrammarV1Request(
  input: unknown,
): ValidatedGrammarV1Request {
  const request = object(input, 'request')
  Object.keys(request).forEach((key) => {
    if (!allowedRequestKeys.has(key)) {
      fail(`request.${key} is unsupported.`)
    }
  })
  const rawSeed = request.seed
  if (typeof rawSeed !== 'string' || rawSeed.length === 0) {
    fail('seed must be a non-empty string.')
  }
  const seed = rawSeed as string
  if (seed.length > 128) fail('seed must not exceed 128 characters.')
  const rawProfile = request.profile
  if (!isGrammarProfileId(rawProfile)) {
    fail('profile is unsupported.')
  }
  const profileId = rawProfile as GenerateGrammarV1Request['profile']

  const profile = getGrammarProfile(profileId)
  let interpretation
  try {
    interpretation = validateStrictInterpretation(validateFlowInterpretationForMelody(
      request.interpretation as GenerateGrammarV1Request['interpretation'],
    ))
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown validation error'
    return fail(`interpretation was rejected by the Work 02 boundary: ${detail}`)
  }

  return {
    interpretation,
    seed,
    profile,
    constraints: resolveConstraints(
      request.constraints,
      profile.limits.maximumSyncopatedEvents,
      profile.limits.motifEventCount,
    ),
  }
}
