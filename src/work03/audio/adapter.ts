import { midiNoteToFrequencyHz } from '../../work02/audio/frequency'
import { createAudioPlaybackProfileSnapshot } from '../../work02/audio/profile'
import { AUDIO_PLAYBACK_PROFILE_VERSION } from '../../work02/versions'
import type { GrammarV1Result } from '../grammar/types'
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
  Work03ScheduledAudioNote,
} from './types'
import { validateWork03AudioSchedule } from './validateSchedule'

/**
 * Converts a fully validated Grammar v1 result to an immutable, deterministic
 * schedule. Rests consume their original beat span but do not become notes.
 */
export function createWork03AudioSchedule(
  result: GrammarV1Result,
): Work03AudioSchedule {
  const validated = validateGrammarV1Result(result)
  const output = validated.melodyOutput
  const secondsPerBeat = 60 / output.grammar.tempoBpm
  const notes: Work03ScheduledAudioNote[] = []

  output.events.forEach((event) => {
    if (event.kind === 'rest') return
    const startSeconds = event.startBeat * secondsPerBeat
    const durationSeconds = event.durationBeats * secondsPerBeat
    notes.push(Object.freeze({
      noteIndex: notes.length,
      sourceEventIndex: event.eventIndex,
      startSeconds,
      durationSeconds,
      endSeconds: startSeconds + durationSeconds,
      midiNote: event.midiNote,
      frequencyHz: midiNoteToFrequencyHz(event.midiNote),
    }))
  })

  const schedule: Work03AudioSchedule = Object.freeze({
    versions: Object.freeze({
      scheduleContract: WORK03_AUDIO_SCHEDULE_CONTRACT_VERSION,
      adapter: WORK03_AUDIO_ADAPTER_VERSION,
      playbackProfile: AUDIO_PLAYBACK_PROFILE_VERSION,
      melodyOutputContract: WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
      melodyGenerator: WORK03_GRAMMAR_GENERATOR_VERSION,
      musicGrammar: WORK03_MUSIC_GRAMMAR_VERSION,
    }),
    source: Object.freeze({
      profile: output.grammar.profile,
      seed: output.grammar.seed,
    }),
    method: output.method,
    profile: createAudioPlaybackProfileSnapshot(),
    tempoBpm: output.grammar.tempoBpm,
    totalBeats: output.totalBeats,
    totalDurationSeconds: output.totalBeats * secondsPerBeat,
    notes: Object.freeze(notes),
  })

  return validateWork03AudioSchedule(schedule, validated)
}
