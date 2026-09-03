import { midiNoteToFrequencyHz } from '../../work02/audio/frequency'
import { DEFAULT_AUDIO_PLAYBACK_PROFILE } from '../../work02/audio/profile'
import type { AudioPlaybackProfileSnapshot } from '../../work02/audio/profile'
import { AUDIO_PLAYBACK_PROFILE_VERSION } from '../../work02/versions'
import { getGrammarProfile, isGrammarProfileId } from '../grammar/profiles'
import type {
  GrammarMelodyOutput,
  GrammarV1Result,
} from '../grammar/types'
import { validateGrammarV1Result } from '../grammar/validateOutput'
import {
  WORK03_AUDIO_ADAPTER_VERSION,
  WORK03_AUDIO_SCHEDULE_CONTRACT_VERSION,
  WORK03_GRAMMAR_GENERATOR_VERSION,
  WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
  WORK03_MUSIC_GRAMMAR_VERSION,
} from '../versions'
import type {
  Work03AudioSchedule,
  Work03AudioScheduleSource,
  Work03ScheduledAudioNote,
} from './types'

export class Work03AudioScheduleValidationError extends Error {
  constructor(message: string) {
    super(`Invalid Work03AudioSchedule: ${message}`)
    this.name = 'Work03AudioScheduleValidationError'
  }
}

const fail = (message: string): never => {
  throw new Work03AudioScheduleValidationError(message)
}

const object = (value: unknown, path: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : fail(`${path} must be an object.`)

const exactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void => {
  const actual = Object.keys(value).sort()
  const required = [...expected].sort()
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    fail(`${path} must contain exactly: ${expected.join(', ')}.`)
  }
}

const finite = (value: unknown, path: string): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail(`${path} must be a finite number.`)

const positive = (value: unknown, path: string): number => {
  const result = finite(value, path)
  return result > 0 ? result : fail(`${path} must be positive.`)
}

const exceedsTimeline = (value: number, limit: number): boolean => {
  const arithmeticRoundoff = Number.EPSILON *
    Math.max(1, Math.abs(value), Math.abs(limit)) * 8
  return value - limit > arithmeticRoundoff
}

const validateVersions = (value: unknown): void => {
  const versions = object(value, 'versions')
  exactKeys(versions, [
    'scheduleContract',
    'adapter',
    'playbackProfile',
    'melodyOutputContract',
    'melodyGenerator',
    'musicGrammar',
  ], 'versions')
  if (versions.scheduleContract !== WORK03_AUDIO_SCHEDULE_CONTRACT_VERSION) {
    fail('schedule contract version is unsupported.')
  }
  if (versions.adapter !== WORK03_AUDIO_ADAPTER_VERSION) {
    fail('audio adapter version is unsupported.')
  }
  if (versions.playbackProfile !== AUDIO_PLAYBACK_PROFILE_VERSION) {
    fail('playback profile version is unsupported.')
  }
  if (versions.melodyOutputContract !== WORK03_MELODY_OUTPUT_CONTRACT_VERSION) {
    fail('source melody output contract version is unsupported.')
  }
  if (versions.melodyGenerator !== WORK03_GRAMMAR_GENERATOR_VERSION) {
    fail('source melody generator version is unsupported.')
  }
  if (versions.musicGrammar !== WORK03_MUSIC_GRAMMAR_VERSION) {
    fail('source music grammar version is unsupported.')
  }
}

const validateSource = (value: unknown): Work03AudioScheduleSource => {
  const source = object(value, 'source')
  exactKeys(source, ['profile', 'seed'], 'source')
  if (!isGrammarProfileId(source.profile)) {
    fail('source.profile is unsupported.')
  }
  if (
    typeof source.seed !== 'string' ||
    source.seed.length === 0 ||
    source.seed.length > 128
  ) {
    fail('source.seed must be a non-empty string of at most 128 characters.')
  }
  return value as Work03AudioScheduleSource
}

const validateMethod = (value: unknown): void => {
  if (value !== 'absolute-hue' && value !== 'relative-hue' && value !== 'hybrid') {
    fail('method is unsupported.')
  }
}

const validateProfile = (value: unknown): AudioPlaybackProfileSnapshot => {
  const profile = object(value, 'profile')
  exactKeys(profile, [
    'version',
    'waveform',
    'masterGain',
    'attackSeconds',
    'releaseSeconds',
  ], 'profile')
  if (profile.version !== AUDIO_PLAYBACK_PROFILE_VERSION) {
    fail('profile.version is unsupported.')
  }
  if (profile.waveform !== DEFAULT_AUDIO_PLAYBACK_PROFILE.waveform) {
    fail('profile.waveform must match the shared playback profile.')
  }
  const masterGain = finite(profile.masterGain, 'profile.masterGain')
  const attackSeconds = finite(profile.attackSeconds, 'profile.attackSeconds')
  const releaseSeconds = finite(profile.releaseSeconds, 'profile.releaseSeconds')
  if (
    masterGain !== DEFAULT_AUDIO_PLAYBACK_PROFILE.masterGain ||
    attackSeconds !== DEFAULT_AUDIO_PLAYBACK_PROFILE.attackSeconds ||
    releaseSeconds !== DEFAULT_AUDIO_PLAYBACK_PROFILE.releaseSeconds
  ) {
    fail('profile must match the immutable shared playback profile values.')
  }
  return value as AudioPlaybackProfileSnapshot
}

const validateNote = (
  value: unknown,
  index: number,
  totalDurationSeconds: number,
  previousSourceEventIndex: number,
  previousStartSeconds: number,
): Work03ScheduledAudioNote => {
  const path = `notes[${index}]`
  const note = object(value, path)
  exactKeys(note, [
    'noteIndex',
    'sourceEventIndex',
    'startSeconds',
    'durationSeconds',
    'endSeconds',
    'midiNote',
    'frequencyHz',
  ], path)
  if (note.noteIndex !== index) {
    fail(`${path}.noteIndex must equal ${index}.`)
  }
  const sourceEventIndex = note.sourceEventIndex
  if (
    typeof sourceEventIndex !== 'number' ||
    !Number.isInteger(sourceEventIndex) ||
    sourceEventIndex < 0
  ) {
    fail(`${path}.sourceEventIndex must be a non-negative integer.`)
  }
  const validatedSourceEventIndex = sourceEventIndex as number
  if (validatedSourceEventIndex <= previousSourceEventIndex) {
    fail(`${path}.sourceEventIndex must be strictly increasing.`)
  }

  const startSeconds = finite(note.startSeconds, `${path}.startSeconds`)
  const durationSeconds = positive(note.durationSeconds, `${path}.durationSeconds`)
  const endSeconds = finite(note.endSeconds, `${path}.endSeconds`)
  if (startSeconds < 0) fail(`${path}.startSeconds must be non-negative.`)
  if (startSeconds <= previousStartSeconds) {
    fail(`${path}.startSeconds must be strictly increasing.`)
  }
  if (endSeconds !== startSeconds + durationSeconds) {
    fail(`${path}.endSeconds must equal startSeconds + durationSeconds.`)
  }
  // BPMs such as 72 produce recurring binary fractions: independently exact
  // start/duration projections can add to a few ULPs above the total formula.
  if (exceedsTimeline(endSeconds, totalDurationSeconds)) {
    fail(`${path} exceeds the total timeline.`)
  }

  if (typeof note.midiNote !== 'number' || !Number.isInteger(note.midiNote)) {
    fail(`${path}.midiNote must be an integer.`)
  }
  const expectedFrequency = (() => {
    try {
      return midiNoteToFrequencyHz(note.midiNote as number)
    } catch {
      return fail(`${path}.midiNote must be in the standard MIDI range.`)
    }
  })()
  if (note.frequencyHz !== expectedFrequency) {
    fail(`${path}.frequencyHz must match the MIDI frequency formula.`)
  }
  return value as Work03ScheduledAudioNote
}

const assertSourceProjection = (
  schedule: Work03AudioSchedule,
  source: GrammarMelodyOutput,
): void => {
  if (schedule.method !== source.method) {
    fail('method must match the source melody output.')
  }
  if (
    schedule.source.profile !== source.grammar.profile ||
    schedule.source.seed !== source.grammar.seed
  ) {
    fail('source profile and seed must match the source melody output.')
  }
  if (
    schedule.tempoBpm !== source.grammar.tempoBpm ||
    schedule.totalBeats !== source.totalBeats
  ) {
    fail('tempoBpm and totalBeats must match the source melody output.')
  }

  const secondsPerBeat = 60 / source.grammar.tempoBpm
  const sourceNotes = source.events.filter((event) => event.kind === 'note')
  if (schedule.notes.length !== sourceNotes.length) {
    fail('notes must contain exactly one entry for every source note event.')
  }
  sourceNotes.forEach((event, noteIndex) => {
    const note = schedule.notes[noteIndex]
    const startSeconds = event.startBeat * secondsPerBeat
    const durationSeconds = event.durationBeats * secondsPerBeat
    if (
      note.noteIndex !== noteIndex ||
      note.sourceEventIndex !== event.eventIndex ||
      note.startSeconds !== startSeconds ||
      note.durationSeconds !== durationSeconds ||
      note.endSeconds !== startSeconds + durationSeconds ||
      note.midiNote !== event.midiNote ||
      note.frequencyHz !== midiNoteToFrequencyHz(event.midiNote)
    ) {
      fail(`notes[${noteIndex}] must exactly project source note event ${event.eventIndex}.`)
    }
  })
}

/**
 * Validates the Work 03 schedule boundary without sorting, clamping, repairing,
 * or mutating it. Passing the original result additionally proves the exact
 * one-note-per-note-event projection and the omission of rest oscillators.
 */
export function validateWork03AudioSchedule(
  input: unknown,
  sourceResult?: GrammarV1Result,
): Work03AudioSchedule {
  const schedule = object(input, 'schedule')
  exactKeys(schedule, [
    'versions',
    'source',
    'method',
    'profile',
    'tempoBpm',
    'totalBeats',
    'totalDurationSeconds',
    'notes',
  ], 'schedule')
  validateVersions(schedule.versions)
  const source = validateSource(schedule.source)
  validateMethod(schedule.method)
  const profile = validateProfile(schedule.profile)
  const tempoBpm = positive(schedule.tempoBpm, 'tempoBpm')
  if (tempoBpm !== getGrammarProfile(source.profile).limits.tempoBpm) {
    fail('tempoBpm must match the declared Work 03 grammar profile.')
  }
  const totalBeats = schedule.totalBeats
  if (totalBeats !== 12) {
    fail('totalBeats must equal the Work 03 twelve-beat contract.')
  }
  const validatedTotalBeats = totalBeats as 12
  const totalDurationSeconds = positive(
    schedule.totalDurationSeconds,
    'totalDurationSeconds',
  )
  if (totalDurationSeconds !== validatedTotalBeats * (60 / tempoBpm)) {
    fail('totalDurationSeconds must exactly match totalBeats and tempoBpm.')
  }
  const notes = schedule.notes
  if (!Array.isArray(notes) || notes.length === 0) {
    fail('notes must be a non-empty array.')
  }
  const rawNotes = notes as unknown[]

  let previousSourceEventIndex = -1
  let previousStartSeconds = -1
  for (let index = 0; index < rawNotes.length; index += 1) {
    const note = validateNote(
      rawNotes[index],
      index,
      totalDurationSeconds,
      previousSourceEventIndex,
      previousStartSeconds,
    )
    previousSourceEventIndex = note.sourceEventIndex
    previousStartSeconds = note.startSeconds

    const durationHalf = note.durationSeconds / 2
    const effectiveAttack = Math.min(profile.attackSeconds, durationHalf)
    const effectiveRelease = Math.min(profile.releaseSeconds, durationHalf)
    const attackEnd = note.startSeconds + effectiveAttack
    const releaseStart = Math.max(attackEnd, note.endSeconds - effectiveRelease)
    if (attackEnd > releaseStart || releaseStart > note.endSeconds) {
      fail(`notes[${index}] has an impossible attack/release envelope.`)
    }
  }

  const validated = input as Work03AudioSchedule
  if (sourceResult !== undefined) {
    const validatedSource = validateGrammarV1Result(sourceResult)
    assertSourceProjection(validated, validatedSource.melodyOutput)
  }
  return validated
}
