import { describe, expect, it } from 'vitest'
import goldenSessions from '../../../docs/golden-sessions/representative-sessions.json'
import { expandGoldenCase } from '../../work02/golden/expandGoldenCase'
import { interpretFlow } from '../../work02/interpretation/interpretFlow'
import { generateMelody } from '../../work02/music/generator'
import { createAudioSchedule } from '../../work02/audio/schedule'
import { midiNoteToFrequencyHz } from '../../work02/audio/frequency'
import { DEFAULT_AUDIO_PLAYBACK_PROFILE } from '../../work02/audio/profile'
import { validateAudioSchedule } from '../../work02/audio/validateSchedule'
import {
  AUDIO_PLAYBACK_PROFILE_VERSION,
  AUDIO_SCHEDULE_CONTRACT_VERSION,
  MELODY_GENERATOR_VERSION,
  MELODY_OUTPUT_CONTRACT_VERSION,
  MUSIC_GRAMMAR_VERSION,
} from '../../work02/versions'
import { generateGrammarV1 } from '../grammar/generator'
import type {
  GrammarProfileId,
  GrammarV1Result,
} from '../grammar/types'
import {
  WORK03_AUDIO_ADAPTER_VERSION,
  WORK03_AUDIO_SCHEDULE_CONTRACT_VERSION,
  WORK03_GRAMMAR_GENERATOR_VERSION,
  WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
  WORK03_MUSIC_GRAMMAR_VERSION,
} from '../versions'
import { createWork03AudioSchedule } from './adapter'
import type { Work03AudioSchedule } from './types'
import {
  validateWork03AudioSchedule,
  Work03AudioScheduleValidationError,
} from './validateSchedule'

const interpretation = () => interpretFlow(
  expandGoldenCase(goldenSessions, 'same-deck-baseline'),
  'hybrid',
)

const resultFor = (
  profile: GrammarProfileId = 'BALANCED_LYRICAL',
  seed = 'work03-contract-test',
): GrammarV1Result => generateGrammarV1({
  interpretation: interpretation(),
  profile,
  seed,
})

const scheduleFor = (
  profile: GrammarProfileId = 'BALANCED_LYRICAL',
): Work03AudioSchedule => createWork03AudioSchedule(resultFor(profile))

const mutableSchedule = (
  profile: GrammarProfileId = 'BALANCED_LYRICAL',
): Record<string, any> => structuredClone(scheduleFor(profile)) as Record<string, any>

describe('Work 03 Grammar v1 audio compatibility adapter', () => {
  it('uses only honest Work 03 schedule and source versions', () => {
    const result = resultFor()
    const before = structuredClone(result)
    const schedule = createWork03AudioSchedule(result)

    expect(schedule.versions).toEqual({
      scheduleContract: 'work03-audio-schedule-v1',
      adapter: 'work03-audio-adapter-v1',
      playbackProfile: 'work02-audio-profile-v0',
      melodyOutputContract: 'work03-melody-output-v1',
      melodyGenerator: 'work03-grammar-generator-v1',
      musicGrammar: 'work03-music-grammar-v1',
    })
    expect(schedule.versions).toEqual({
      scheduleContract: WORK03_AUDIO_SCHEDULE_CONTRACT_VERSION,
      adapter: WORK03_AUDIO_ADAPTER_VERSION,
      playbackProfile: AUDIO_PLAYBACK_PROFILE_VERSION,
      melodyOutputContract: WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
      melodyGenerator: WORK03_GRAMMAR_GENERATOR_VERSION,
      musicGrammar: WORK03_MUSIC_GRAMMAR_VERSION,
    })
    expect(schedule.versions.scheduleContract).not.toBe(
      AUDIO_SCHEDULE_CONTRACT_VERSION,
    )
    expect(schedule.source).toEqual({
      profile: result.melodyOutput.grammar.profile,
      seed: result.melodyOutput.grammar.seed,
    })
    expect(schedule.method).toBe(result.melodyOutput.method)
    expect(result).toEqual(before)
    expect(validateWork03AudioSchedule(schedule, result)).toBe(schedule)
  })

  it('projects each source note exactly once and retains its event index', () => {
    const result = resultFor('PULSING')
    const schedule = createWork03AudioSchedule(result)
    const sourceNotes = result.melodyOutput.events.filter(
      (event) => event.kind === 'note',
    )

    expect(schedule.notes).toHaveLength(sourceNotes.length)
    expect(schedule.notes.map((note) => note.noteIndex)).toEqual(
      sourceNotes.map((_, index) => index),
    )
    expect(schedule.notes.map((note) => note.sourceEventIndex)).toEqual(
      sourceNotes.map((event) => event.eventIndex),
    )
    expect(schedule.notes.map((note) => note.midiNote)).toEqual(
      sourceNotes.map((event) => event.midiNote),
    )
  })

  it('omits rests while retaining their absolute time on the beat timeline', () => {
    const result = resultFor('CALM_SPARSE')
    const output = result.melodyOutput
    const schedule = createWork03AudioSchedule(result)
    const restIndices = output.events
      .filter((event) => event.kind === 'rest')
      .map((event) => event.eventIndex)
    const secondsPerBeat = 60 / output.grammar.tempoBpm

    expect(restIndices.length).toBeGreaterThan(0)
    expect(schedule.notes).toHaveLength(output.events.length - restIndices.length)
    expect(schedule.notes.every(
      (note) => !restIndices.includes(note.sourceEventIndex),
    )).toBe(true)
    schedule.notes.forEach((note) => {
      const source = output.events[note.sourceEventIndex]
      expect(source.kind).toBe('note')
      expect(note.startSeconds).toBe(source.startBeat * secondsPerBeat)
    })

    const restWithFollowingNote = output.events.find((event, index) =>
      event.kind === 'rest' && output.events.slice(index + 1).some(
        (candidate) => candidate.kind === 'note',
      ))
    expect(restWithFollowingNote).toBeDefined()
    const following = output.events.find((event) =>
      event.kind === 'note' &&
      event.eventIndex > (restWithFollowingNote?.eventIndex ?? Number.MAX_SAFE_INTEGER))
    const projected = schedule.notes.find(
      (note) => note.sourceEventIndex === following?.eventIndex,
    )
    expect(projected?.startSeconds).toBe(
      (following?.startBeat ?? Number.NaN) * secondsPerBeat,
    )
    expect(schedule.totalDurationSeconds).toBe(
      output.totalBeats * secondsPerBeat,
    )
  })

  it('uses exact beat-to-seconds timing and the shared MIDI frequency formula', () => {
    const result = resultFor('OPEN_ENDED')
    const output = result.melodyOutput
    const schedule = createWork03AudioSchedule(result)
    const secondsPerBeat = 60 / output.grammar.tempoBpm

    schedule.notes.forEach((note) => {
      const source = output.events[note.sourceEventIndex]
      if (source.kind !== 'note') throw new Error('unexpected rest projection')
      const expectedStart = source.startBeat * secondsPerBeat
      const expectedDuration = source.durationBeats * secondsPerBeat
      expect(note.startSeconds).toBe(expectedStart)
      expect(note.durationSeconds).toBe(expectedDuration)
      expect(note.endSeconds).toBe(expectedStart + expectedDuration)
      expect(note.frequencyHz).toBe(
        440 * 2 ** ((source.midiNote - 69) / 12),
      )
      expect(note.frequencyHz).toBe(midiNoteToFrequencyHz(source.midiNote))
    })
  })

  it('emits an immutable, deterministic, JSON-safe value', () => {
    const result = resultFor('RESOLVED', 'immutable-schedule')
    const first = createWork03AudioSchedule(result)
    const second = createWork03AudioSchedule(structuredClone(result))

    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.versions)).toBe(true)
    expect(Object.isFrozen(first.source)).toBe(true)
    expect(Object.isFrozen(first.profile)).toBe(true)
    expect(Object.isFrozen(first.notes)).toBe(true)
    expect(first.notes.every(Object.isFrozen)).toBe(true)
    expect(first.profile).toEqual(DEFAULT_AUDIO_PLAYBACK_PROFILE)
    expect(first.profile).not.toBe(DEFAULT_AUDIO_PLAYBACK_PROFILE)
  })

  it('rejects malformed full results before schedule projection', () => {
    const invalid: any = structuredClone(resultFor())
    invalid.grammarTrace.version = 'unvalidated-trace'

    expect(() => createWork03AudioSchedule(invalid)).toThrow(
      /Invalid Grammar v1 result/,
    )
  })
})

describe('Work03AudioSchedule validation boundary', () => {
  it.each([
    ['Work 02 schedule relabel', (value: any) => {
      value.versions.scheduleContract = AUDIO_SCHEDULE_CONTRACT_VERSION
    }],
    ['adapter version', (value: any) => { value.versions.adapter = 'wrong' }],
    ['output version', (value: any) => {
      value.versions.melodyOutputContract = MELODY_OUTPUT_CONTRACT_VERSION
    }],
    ['generator version', (value: any) => {
      value.versions.melodyGenerator = MELODY_GENERATOR_VERSION
    }],
    ['grammar version', (value: any) => {
      value.versions.musicGrammar = MUSIC_GRAMMAR_VERSION
    }],
    ['source profile', (value: any) => { value.source.profile = 'DIAGNOSIS' }],
    ['source seed', (value: any) => { value.source.seed = '' }],
    ['method', (value: any) => { value.method = 'unknown' }],
    ['profile value', (value: any) => { value.profile.masterGain = 0.5 }],
    ['tempo', (value: any) => { value.tempoBpm += 1 }],
    ['total beats', (value: any) => { value.totalBeats = 11 }],
    ['total duration', (value: any) => { value.totalDurationSeconds += 1 }],
    ['empty notes', (value: any) => { value.notes = [] }],
    ['note index', (value: any) => { value.notes[0].noteIndex = 1 }],
    ['source event index', (value: any) => { value.notes[0].sourceEventIndex = -1 }],
    ['negative start', (value: any) => { value.notes[0].startSeconds = -1 }],
    ['zero duration', (value: any) => { value.notes[0].durationSeconds = 0 }],
    ['wrong end', (value: any) => { value.notes[0].endSeconds += 0.5 }],
    ['non-MIDI note', (value: any) => { value.notes[0].midiNote = 128 }],
    ['wrong frequency', (value: any) => { value.notes[0].frequencyHz += 1 }],
    ['extra schedule key', (value: any) => { value.legacySchedule = true }],
  ])('rejects %s instead of repairing it', (_, mutate) => {
    const invalid = mutableSchedule()
    mutate(invalid)
    expect(() => validateWork03AudioSchedule(invalid)).toThrow(
      Work03AudioScheduleValidationError,
    )
  })

  it('cross-checks a structurally valid schedule against its exact source notes', () => {
    const result = resultFor()
    const changed: any = structuredClone(createWork03AudioSchedule(result))
    changed.notes[0].midiNote += 1
    changed.notes[0].frequencyHz = midiNoteToFrequencyHz(changed.notes[0].midiNote)

    expect(validateWork03AudioSchedule(changed)).toBe(changed)
    expect(() => validateWork03AudioSchedule(changed, result)).toThrow(
      /must exactly project source note event/,
    )
  })
})

describe('preserved Work 02 audio contracts', () => {
  it('leaves the original versions and validator behavior unchanged', () => {
    const melody = generateMelody(interpretation())
    const schedule = createAudioSchedule(melody)

    expect(schedule.versions).toEqual({
      scheduleContract: 'work02-audio-schedule-v1',
      playbackProfile: 'work02-audio-profile-v0',
      melodyOutputContract: 'work02-melody-output-v2',
      melodyGenerator: 'work02-melody-generator-v0',
    })
    expect(schedule.versions.scheduleContract).toBe(AUDIO_SCHEDULE_CONTRACT_VERSION)
    expect(validateAudioSchedule(schedule)).toBe(schedule)
  })
})
