import type {
  MelodyEvent,
  MelodyEventSource,
  MelodyNoteEvent,
  MelodyOutput,
  MelodyRestEvent,
} from '../../../work02/music/types'
import { generateWork02Baseline } from '../adapters/work02'
import type {
  BrokenBenchmarkGenerator,
  BrokenGeneratorFactory,
  GeneratorFailureInjectionId,
} from './types'

const ASCENDING_NOTES = [
  60, 62, 64, 67, 69, 72, 74, 76, 76, 76, 76, 76,
] as const
const DESCENDING_NOTES = [...ASCENDING_NOTES].reverse()
const UNRESOLVED_LEAP_NOTES = [
  60, 69, 76, 60, 69, 76, 60, 69, 76, 60, 69, 76,
] as const
const NO_RECURRENCE_NOTES = [
  60, 62, 67, 64, 69, 72, 76, 74, 69, 67, 60, 64,
] as const
const MICRO_NOTES_PER_INPUT = 16
const MICRO_NOTE_DURATION_BEATS = 1 / MICRO_NOTES_PER_INPUT

type GeneratorOptions = Parameters<BrokenBenchmarkGenerator>[0]
type OutputMutation = (output: MelodyOutput) => MelodyOutput

const copySource = (source: MelodyEventSource): MelodyEventSource => ({
  presentedOrders: [...source.presentedOrders],
  selectionDirections: [...source.selectionDirections],
  contourPositions: [...source.contourPositions],
})

const copyEvent = (event: MelodyEvent): MelodyEvent => event.kind === 'note'
  ? { ...event, source: copySource(event.source) }
  : { ...event, source: copySource(event.source) }

const templateFor = async (options: GeneratorOptions): Promise<MelodyOutput> => {
  const output = await generateWork02Baseline(options)
  return structuredClone(output) as MelodyOutput
}

const deterministicFactory = (
  mutate: OutputMutation,
): BrokenGeneratorFactory => () => async (options) => mutate(
  await templateFor(options),
)

const mapNotePitches = (
  output: MelodyOutput,
  pitchFor: (noteIndex: number, note: MelodyNoteEvent) => number,
): MelodyOutput => {
  let noteIndex = 0
  return {
    ...output,
    events: output.events.map((event): MelodyEvent => {
      if (event.kind === 'rest') return copyEvent(event)
      const next = {
        ...event,
        midiNote: pitchFor(noteIndex, event),
        source: copySource(event.source),
      }
      noteIndex += 1
      return next
    }),
  }
}

const withoutRests = (output: MelodyOutput): MelodyOutput => {
  let previousMidi = 64
  return {
    ...output,
    events: output.events.map((event): MelodyEvent => {
      if (event.kind === 'note') {
        previousMidi = event.midiNote
        return copyEvent(event)
      }
      return {
        ...event,
        kind: 'note',
        midiNote: previousMidi,
        source: copySource(event.source),
      }
    }),
  }
}

const withOnlyFirstNote = (output: MelodyOutput): MelodyOutput => {
  let retainedNote = false
  return {
    ...output,
    events: output.events.map((event): MelodyEvent => {
      if (event.kind === 'rest' || !retainedNote) {
        if (event.kind === 'note') retainedNote = true
        return copyEvent(event)
      }
      const rest: MelodyRestEvent = {
        kind: 'rest',
        eventIndex: event.eventIndex,
        startBeat: event.startBeat,
        durationBeats: event.durationBeats,
        source: copySource(event.source),
      }
      return rest
    }),
  }
}

const notesFrom = (output: MelodyOutput): readonly MelodyNoteEvent[] =>
  output.events.filter((event): event is MelodyNoteEvent => event.kind === 'note')

const withIdenticalDurations = (output: MelodyOutput): MelodyOutput => {
  const events = output.events.flatMap((event): MelodyEvent[] => {
    if (event.durationBeats === 0.5) return [copyEvent(event)]
    return [0, 1].map((half): MelodyEvent => ({
      ...copyEvent(event),
      eventIndex: -1,
      startBeat: event.startBeat + half * 0.5,
      durationBeats: 0.5,
    }))
  }).map((event, eventIndex) => ({ ...event, eventIndex }))
  return { ...output, events }
}

const withMicroNoteExplosion = (output: MelodyOutput): MelodyOutput => {
  const events = notesFrom(output).flatMap((note, noteIndex): MelodyNoteEvent[] =>
    Array.from({ length: MICRO_NOTES_PER_INPUT }, (_, microIndex) => ({
      kind: 'note',
      eventIndex: noteIndex * MICRO_NOTES_PER_INPUT + microIndex,
      startBeat: noteIndex + microIndex * MICRO_NOTE_DURATION_BEATS,
      durationBeats: MICRO_NOTE_DURATION_BEATS,
      midiNote: note.midiNote,
      source: copySource(note.source),
    })))
  return { ...output, events }
}

const withAbruptEnding = (output: MelodyOutput): MelodyOutput => ({
  ...output,
  events: output.events.slice(0, -1).map(copyEvent),
})

const nondeterministicTieFactory: BrokenGeneratorFactory = () => {
  let invocation = 0
  return async (options) => {
    const output = await templateFor(options)
    const selectedTiePitch = invocation % 2 === 0 ? 62 : 64
    invocation += 1
    return mapNotePitches(output, (index, note) =>
      index === 0 ? selectedTiePitch : note.midiNote)
  }
}

export const BROKEN_GENERATOR_FACTORIES: Readonly<Record<
  GeneratorFailureInjectionId,
  BrokenGeneratorFactory
>> = Object.freeze({
  'constant-pitch': deterministicFactory((output) =>
    mapNotePitches(output, () => 64)),
  'endless-ascending-sequence': deterministicFactory((output) =>
    mapNotePitches(output, (index) => ASCENDING_NOTES[index % ASCENDING_NOTES.length])),
  'endless-descending-sequence': deterministicFactory((output) =>
    mapNotePitches(output, (index) => DESCENDING_NOTES[index % DESCENDING_NOTES.length])),
  'octave-ping-pong': deterministicFactory((output) =>
    mapNotePitches(output, (index) => index % 2 === 0 ? 60 : 72)),
  'unresolved-leaps': deterministicFactory((output) =>
    mapNotePitches(
      output,
      (index) => UNRESOLVED_LEAP_NOTES[index % UNRESOLVED_LEAP_NOTES.length],
    )),
  'zero-rests': deterministicFactory(withoutRests),
  'too-many-rests': deterministicFactory(withOnlyFirstNote),
  'identical-duration': deterministicFactory(withIdenticalDurations),
  'micro-note-explosion': deterministicFactory(withMicroNoteExplosion),
  'out-of-range-notes': deterministicFactory((output) =>
    mapNotePitches(output, (index) => index % 2 === 0 ? 59 : 77)),
  'invalid-total-beats': deterministicFactory((output) => ({
    ...output,
    totalBeats: output.totalBeats - 1,
    events: output.events.map(copyEvent),
  })),
  'abrupt-ending': deterministicFactory(withAbruptEnding),
  'excessive-motif-copy': deterministicFactory((output) =>
    mapNotePitches(output, (index) => [60, 62, 64][index % 3])),
  'no-motif-recurrence': deterministicFactory((output) =>
    mapNotePitches(
      output,
      (index) => NO_RECURRENCE_NOTES[index % NO_RECURRENCE_NOTES.length],
    )),
  'register-edge-trapping': deterministicFactory((output) =>
    mapNotePitches(output, (index) => index % 2 === 0 ? 60 : 62)),
  'nondeterministic-tie-breaking': nondeterministicTieFactory,
})

export function createBrokenGenerator(
  id: GeneratorFailureInjectionId,
): BrokenBenchmarkGenerator {
  return BROKEN_GENERATOR_FACTORIES[id]()
}
