import type { SessionExport } from '../../../domain/types'
import { createAudioSchedule } from '../../../work02/audio/schedule'
import { interpretFlow } from '../../../work02/interpretation/interpretFlow'
import type { InterpretationMethod } from '../../../work02/interpretation/types'
import { generateMelody } from '../../../work02/music/generator'
import type { MelodyOutput } from '../../../work02/music/types'
import { validateMelodyOutput } from '../../../work02/music/validateMelody'
import { adaptSessionExport } from '../../../work02/sessionAdapter'
import type {
  BenchmarkGenerate,
  BenchmarkProfile,
  NormalizedEventSource,
  NormalizedMelody,
  NormalizedMelodyEvent,
  ValidationCheck,
} from '../types'

export const WORK02_BASELINE_GENERATOR_ID = 'work02-melody-generator-v0' as const

export interface Work02BenchmarkProfile
  extends BenchmarkProfile<SessionExport, unknown> {
  method: InterpretationMethod
}

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`)
  }
  return value as Record<string, unknown>
}

const number = (value: unknown, path: string): number => {
  if (typeof value !== 'number') throw new TypeError(`${path} must be a number.`)
  return value
}

const numberArray = (value: unknown, path: string): readonly number[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'number')) {
    throw new TypeError(`${path} must be a number array.`)
  }
  return value as number[]
}

const directionArray = (
  value: unknown,
  path: string,
): readonly ('left' | 'right')[] => {
  if (
    !Array.isArray(value) ||
    value.some((item) => item !== 'left' && item !== 'right')
  ) {
    throw new TypeError(`${path} must be a left/right array.`)
  }
  return value as ('left' | 'right')[]
}

const inspectSource = (value: unknown, path: string): NormalizedEventSource => {
  const source = object(value, path)
  return {
    presentedOrders: numberArray(source.presentedOrders, `${path}.presentedOrders`),
    selectionDirections: directionArray(
      source.selectionDirections,
      `${path}.selectionDirections`,
    ),
    contourPositions: numberArray(source.contourPositions, `${path}.contourPositions`),
  }
}

/**
 * Tolerant extraction for benchmark metrics. Contract validity is evaluated
 * separately, so out-of-range and non-finite numeric values remain observable.
 */
export function inspectWork02Output(value: unknown): NormalizedMelody {
  const output = object(value, 'output')
  const grammar = object(output.grammar, 'output.grammar')
  if (!Array.isArray(output.events)) {
    throw new TypeError('output.events must be an array.')
  }
  const events: NormalizedMelodyEvent[] = output.events.map((rawEvent, index) => {
    const event = object(rawEvent, `output.events[${index}]`)
    const source = inspectSource(event.source, `output.events[${index}].source`)
    const base = {
      eventIndex: number(event.eventIndex, `output.events[${index}].eventIndex`),
      startBeat: number(event.startBeat, `output.events[${index}].startBeat`),
      durationBeats: number(
        event.durationBeats,
        `output.events[${index}].durationBeats`,
      ),
      source,
    }
    if (event.kind === 'rest') return { kind: 'rest' as const, ...base }
    if (event.kind !== 'note') {
      throw new TypeError(`output.events[${index}].kind is unsupported.`)
    }
    return {
      kind: 'note' as const,
      ...base,
      midiNote: number(event.midiNote, `output.events[${index}].midiNote`),
    }
  })

  return {
    totalBeats: number(output.totalBeats, 'output.totalBeats'),
    tempoBpm: number(grammar.tempoBpm, 'output.grammar.tempoBpm'),
    minimumMidi: number(grammar.minimumMidi, 'output.grammar.minimumMidi'),
    maximumMidi: number(grammar.maximumMidi, 'output.grammar.maximumMidi'),
    tonicMidi: number(grammar.tonicMidi, 'output.grammar.tonicMidi'),
    maximumMelodicLeapSemitones: number(
      grammar.maximumMelodicLeapSemitones,
      'output.grammar.maximumMelodicLeapSemitones',
    ),
    allowedDurationsBeats: numberArray(
      grammar.allowedDurationsBeats,
      'output.grammar.allowedDurationsBeats',
    ),
    events,
  }
}

const validateNativeOutput = (output: unknown): readonly ValidationCheck[] => {
  try {
    validateMelodyOutput(output)
    return [{
      id: 'WORK02_MELODY_CONTRACT',
      scope: 'schema',
      passed: true,
      message: 'Output passes the exact Work 02 melody contract.',
    }]
  } catch (error) {
    return [{
      id: 'WORK02_MELODY_CONTRACT',
      scope: 'schema',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    }]
  }
}

const validateNativeSchedule = (output: unknown): ValidationCheck => {
  try {
    createAudioSchedule(output as MelodyOutput)
    return {
      id: 'WORK02_AUDIO_SCHEDULE',
      scope: 'schedule',
      passed: true,
      message: 'Output converts to the exact Work 02 audio schedule.',
    }
  } catch (error) {
    return {
      id: 'WORK02_AUDIO_SCHEDULE',
      scope: 'schedule',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function perturbWork02Session(session: SessionExport): SessionExport {
  const cards = session.deck.cards.map((card, index) =>
    index === 0 ? { ...card, hue: (card.hue + 0.25) % 360 } : { ...card })
  const decisions = session.decisions.map((decision, index) =>
    index === 0
      ? { ...decision, hue: cards[0].hue }
      : { ...decision })
  return {
    ...session,
    deck: { ...session.deck, cards },
    decisions,
    interactionEvents: session.interactionEvents.map((event) => ({ ...event })),
  }
}

export function createWork02BenchmarkProfile(
  method: InterpretationMethod,
): Work02BenchmarkProfile {
  return {
    id: `work02-baseline:${method}`,
    method,
    inputLength: (session) => session.decisions.length,
    inspectOutput: (output) => inspectWork02Output(output),
    validateOutput: (output) => validateNativeOutput(output),
    validateSchedule: (output) => validateNativeSchedule(output),
    perturbSession: perturbWork02Session,
  }
}

export const WORK02_BENCHMARK_PROFILES = Object.freeze([
  createWork02BenchmarkProfile('absolute-hue'),
  createWork02BenchmarkProfile('relative-hue'),
  createWork02BenchmarkProfile('hybrid'),
])

export const generateWork02Baseline: BenchmarkGenerate<
  SessionExport,
  unknown,
  Work02BenchmarkProfile
> = ({ session, profile }) => {
  const input = adaptSessionExport(session)
  const interpretation = interpretFlow(input, profile.method)
  return generateMelody(interpretation)
}
