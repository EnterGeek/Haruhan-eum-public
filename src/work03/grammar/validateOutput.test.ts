import { describe, expect, it } from 'vitest'
import {
  FLOW_INTERPRETATION_CONTRACT_VERSION,
  HYBRID_HUE_INTERPRETER_VERSION,
} from '../../work02/versions'
import {
  WORK03_DETERMINISTIC_CHOICE_VERSION,
  WORK03_DIAGNOSTICS_VERSION,
  WORK03_GRAMMAR_GENERATOR_VERSION,
  WORK03_GRAMMAR_TRACE_VERSION,
  WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
  WORK03_MUSIC_GRAMMAR_VERSION,
} from '../versions'
import type {
  GrammarMelodyEvent,
  GrammarV1Result,
} from './types'
import {
  GrammarV1ResultValidationError,
  validateGrammarV1Result,
} from './validateOutput'

const SCALE_NOTES = [55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79] as const
const STABILITY = [1, 0, 0.35, 0, 0.6, 0, 0, 0.75, 0, 0.35, 0, 0] as const

const source = (presentedOrder: number) => ({
  presentedOrders: [presentedOrder],
  selectionDirections: [presentedOrder % 2 === 0 ? 'left' as const : 'right' as const],
  contourPositions: [(presentedOrder - 1) / 11],
})

const makeEvents = (): GrammarMelodyEvent[] => {
  const phraseScaleSteps = [
    [2, 3, 4],
    [2, 3, 4],
    [2, 3, 4],
    [2, 3, 3],
  ]
  const phraseSlots = [
    [
      ['note', 0.5], ['rest', 0.5], ['note', 1], ['note', 1],
    ],
    [
      ['note', 0.5], ['rest', 0.5], ['note', 1], ['note', 1],
    ],
    [
      ['note', 1], ['note', 0.5], ['rest', 0.5], ['note', 1],
    ],
    [
      ['note', 0.5], ['rest', 0.5], ['note', 1], ['note', 1],
    ],
  ]
  const events: GrammarMelodyEvent[] = []
  let startBeat = 0
  phraseScaleSteps.forEach((steps, phraseIndex) => {
    let noteIndex = 0
    phraseSlots[phraseIndex].forEach(([kind, duration]) => {
      const durationBeats = duration as 0.5 | 1
      const common = {
        eventIndex: events.length,
        startBeat,
        durationBeats,
        phraseIndex,
        motifOccurrenceIndex: phraseIndex,
      }
      if (kind === 'note') {
        const presentedOrder = phraseIndex * 3 + noteIndex + 1
        events.push({
          ...common,
          kind: 'note',
          midiNote: SCALE_NOTES[steps[noteIndex]],
          tensionLevel: phraseIndex === 3 ? 0.2 : 0.4,
          source: source(presentedOrder),
        })
        noteIndex += 1
      } else {
        events.push({
          ...common,
          kind: 'rest',
          tensionLevel: 0.1,
          source: source(phraseIndex * 3 + 1),
        })
      }
      startBeat += durationBeats
    })
  })
  return events
}

/** A self-contained valid value; it deliberately does not depend on the generator. */
const validResult = (): GrammarV1Result => {
  const events = makeEvents()
  return {
    melodyOutput: {
      versions: {
        outputContract: WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
        grammar: WORK03_MUSIC_GRAMMAR_VERSION,
        interpretationContract: FLOW_INTERPRETATION_CONTRACT_VERSION,
        interpreter: HYBRID_HUE_INTERPRETER_VERSION,
        generator: WORK03_GRAMMAR_GENERATOR_VERSION,
      },
      method: 'hybrid',
      grammar: {
        version: WORK03_MUSIC_GRAMMAR_VERSION,
        profile: 'BALANCED_LYRICAL',
        seed: 'validator-self-contained-fixture',
        choiceAlgorithm: WORK03_DETERMINISTIC_CHOICE_VERSION,
        tempoBpm: 80,
        meter: { numerator: 3, denominator: 4 },
        totalBeats: 12,
        phraseLengthBeats: 3,
        tonalFrame: {
          tonicPitchClass: 0,
          tonicMidi: 60,
          mode: 'major-pentatonic',
          semitoneOffsets: [0, 2, 4, 7, 9],
          scaleNotes: SCALE_NOTES,
          stabilityWeights: STABILITY,
        },
        constraints: {
          minimumMidi: 55,
          maximumMidi: 79,
          maximumMelodicLeapSemitones: 7,
          maximumSyncopatedEvents: 2,
          maximumEvents: 20,
          restsAllowed: true,
          totalBeats: 12,
          phraseCount: 4,
          phraseLengthBeats: 3,
          allowedDurationsBeats: [0.5, 1, 1.5, 2],
          minimumMotifEvents: 2,
          maximumMotifEvents: 5,
          ticksPerBeat: 2,
          largeLeapThresholdSemitones: 7,
          recoveryMaximumStepSemitones: 4,
          maximumEdgeRun: 2,
        },
      },
      totalBeats: 12,
      motif: {
        seedEventCount: 3,
        seedScaleSteps: [2, 3, 4],
        seedRhythmCellId: 'n3-rested-a',
        occurrences: [
          {
            occurrenceIndex: 0,
            phraseIndex: 0,
            transformation: 'seed',
            eventIndices: [0, 2, 3],
          },
          {
            occurrenceIndex: 1,
            phraseIndex: 1,
            transformation: 'exact-repeat',
            eventIndices: [4, 6, 7],
          },
          {
            occurrenceIndex: 2,
            phraseIndex: 2,
            transformation: 'rhythmic-variation',
            eventIndices: [8, 9, 11],
          },
          {
            occurrenceIndex: 3,
            phraseIndex: 3,
            transformation: 'final-note-variation',
            eventIndices: [12, 14, 15],
          },
        ],
      },
      phrases: [0, 1, 2, 3].map((phraseIndex) => ({
        phraseIndex,
        startBeat: phraseIndex * 3,
        endBeat: (phraseIndex + 1) * 3,
        relationship: phraseIndex < 2 ? 'antecedent' as const : 'consequent' as const,
        function: phraseIndex === 0
          ? 'opening' as const
          : phraseIndex === 3 ? 'cadential' as const : 'middle' as const,
        tonalCenterPitchClass: 0,
        eventIndices: [0, 1, 2, 3].map((offset) => phraseIndex * 4 + offset),
      })),
      sourceAnchors: Array.from({ length: 12 }, (_, index) => {
        const presentedOrder = index + 1
        return {
          presentedOrder,
          targetScaleIndex: Math.floor(((presentedOrder - 1) / 11) * 10 + 0.5),
          eventIndex: Math.floor(index / 3) * 4 +
            [[0, 2, 3], [0, 2, 3], [0, 1, 3], [0, 2, 3]][Math.floor(index / 3)][index % 3],
        }
      }),
      events,
    },
    grammarTrace: {
      version: WORK03_GRAMMAR_TRACE_VERSION,
      entries: [
        {
          sequence: 0,
          stage: 'input',
          code: 'INPUT_CONTRACT_ACCEPTED',
          sourcePresentedOrders: [1, 2, 3],
          values: { method: 'hybrid', accepted: true, itemCount: 12 },
        },
        {
          sequence: 1,
          stage: 'motif',
          code: 'MOTIF_CONTOUR_QUANTIZED',
          sourcePresentedOrders: [1, 2, 3],
          values: { seedEventCount: 3 },
        },
      ],
    },
    diagnostics: {
      version: WORK03_DIAGNOSTICS_VERSION,
      checks: [
        { code: 'TIMELINE_COMPLETE', passed: true, actual: 12, minimum: 12, maximum: 12 },
        { code: 'UNRESOLVED_LEAPS', passed: true, actual: 0, maximum: 0 },
      ],
      warnings: ['STRUCTURAL_METRICS_ONLY'],
    },
  }
}

type Mutation = (value: any) => void

const mutationCases: readonly [string, Mutation][] = [
  ['an unsupported top-level field', (value) => { value.repaired = true }],
  ['the output contract version', (value) => { value.melodyOutput.versions.outputContract = 'other' }],
  ['the versioned grammar identity', (value) => { value.melodyOutput.versions.grammar = 'other' }],
  ['the interpretation contract version', (value) => { value.melodyOutput.versions.interpretationContract = 'other' }],
  ['the interpreter version', (value) => { value.melodyOutput.versions.interpreter = 'other' }],
  ['the generator version', (value) => { value.melodyOutput.versions.generator = 'other' }],
  ['an unsupported interpretation method', (value) => { value.melodyOutput.method = 'semantic-diagnosis' }],
  ['the grammar snapshot version', (value) => { value.melodyOutput.grammar.version = 'other' }],
  ['an unsupported profile', (value) => { value.melodyOutput.grammar.profile = 'SAD' }],
  ['the deterministic choice algorithm', (value) => { value.melodyOutput.grammar.choiceAlgorithm = 'random' }],
  ['profile tempo', (value) => { value.melodyOutput.grammar.tempoBpm = 81 }],
  ['the frozen meter', (value) => { value.melodyOutput.grammar.meter.denominator = 8 }],
  ['the grammar total', (value) => { value.melodyOutput.grammar.totalBeats = 11 }],
  ['an unsupported tonal mode', (value) => { value.melodyOutput.grammar.tonalFrame.mode = 'chromatic' }],
  ['a mode forbidden by the profile', (value) => { value.melodyOutput.grammar.tonalFrame.mode = 'mixolydian' }],
  ['the frozen semitone offsets', (value) => { value.melodyOutput.grammar.tonalFrame.semitoneOffsets[1] = 1 }],
  ['the frozen stability table', (value) => { value.melodyOutput.grammar.tonalFrame.stabilityWeights[0] = 0.9 }],
  ['the exhaustive scale note list', (value) => { value.melodyOutput.grammar.tonalFrame.scaleNotes.pop() }],
  ['a mismatched tonic pitch class', (value) => { value.melodyOutput.grammar.tonalFrame.tonicPitchClass = 1 }],
  ['a widened register constraint', (value) => { value.melodyOutput.grammar.constraints.minimumMidi = 54 }],
  ['the duration vocabulary', (value) => { value.melodyOutput.grammar.constraints.allowedDurationsBeats[0] = 0.25 }],
  ['the event maximum', (value) => { value.melodyOutput.grammar.constraints.maximumEvents = 15 }],
  ['an off-grid event start', (value) => { value.melodyOutput.events[1].startBeat = 0.25 }],
  ['a duration outside the vocabulary', (value) => { value.melodyOutput.events[0].durationBeats = 0.75 }],
  ['a timeline gap', (value) => { value.melodyOutput.events[4].startBeat = 3.5 }],
  ['an event crossing a phrase boundary', (value) => { value.melodyOutput.events[3].durationBeats = 1.5 }],
  ['the phrase count', (value) => { value.melodyOutput.phrases.pop() }],
  ['an exact phrase boundary', (value) => { value.melodyOutput.phrases[1].startBeat = 2.5 }],
  ['the phrase relationship sequence', (value) => { value.melodyOutput.phrases[1].relationship = 'consequent' }],
  ['the phrase function sequence', (value) => { value.melodyOutput.phrases[3].function = 'middle' }],
  ['a phrase tonal center', (value) => { value.melodyOutput.phrases[2].tonalCenterPitchClass = 2 }],
  ['exact phrase membership including rests', (value) => { value.melodyOutput.phrases[0].eventIndices.pop() }],
  ['the profile motif seed count', (value) => { value.melodyOutput.motif.seedEventCount = 2 }],
  ['the seed scale-step data', (value) => { value.melodyOutput.motif.seedScaleSteps[1] = 4 }],
  ['an unknown seed rhythm cell', (value) => { value.melodyOutput.motif.seedRhythmCellId = 'invented-cell' }],
  ['a seed rhythm cell whose note durations do not match', (value) => { value.melodyOutput.motif.seedRhythmCellId = 'n3-continuous-a' }],
  ['the occurrence count', (value) => { value.melodyOutput.motif.occurrences.pop() }],
  ['a rest in motif occurrence membership', (value) => { value.melodyOutput.motif.occurrences[0].eventIndices[1] = 1 }],
  ['overlapping motif occurrences', (value) => { value.melodyOutput.motif.occurrences[1].eventIndices[0] = 3 }],
  ['an unsupported transformation label', (value) => { value.melodyOutput.motif.occurrences[2].transformation = 'retrograde' }],
  ['a false exact-repeat label', (value) => { value.melodyOutput.motif.occurrences[2].transformation = 'exact-repeat' }],
  ['a false contour-transposition label', (value) => { value.melodyOutput.motif.occurrences[2].transformation = 'contour-transposition' }],
  ['a false final-note-variation label', (value) => { value.melodyOutput.events[15].midiNote = 64 }],
  ['an out-of-range MIDI note', (value) => { value.melodyOutput.events[0].midiNote = 84 }],
  ['an off-scale MIDI note', (value) => { value.melodyOutput.events[0].midiNote = 61 }],
  ['a melodic leap above the maximum', (value) => { value.melodyOutput.events[1].midiNote = 72 }],
  ['a terminal unresolved seven-semitone leap', (value) => { value.melodyOutput.events[15].midiNote = 69 }],
  ['three consecutive register-edge notes', (value) => {
    value.melodyOutput.events[0].midiNote = 55
    value.melodyOutput.events[2].midiNote = 55
    value.melodyOutput.events[3].midiNote = 55
  }],
  ['a rest when rests are forbidden', (value) => { value.melodyOutput.grammar.constraints.restsAllowed = false }],
  ['misaligned source arrays', (value) => { value.melodyOutput.events[0].source.contourPositions = [] }],
  ['an out-of-range source order', (value) => { value.melodyOutput.events[0].source.presentedOrders[0] = 0 }],
  ['nonchronological provenance within a source', (value) => {
    value.melodyOutput.events[0].source.presentedOrders = [2, 1]
    value.melodyOutput.events[0].source.selectionDirections = ['left', 'right']
    value.melodyOutput.events[0].source.contourPositions = [0.1, 0]
  }],
  ['missing provenance coverage', (value) => {
    value.melodyOutput.events[13].source.presentedOrders[0] = 11
    value.melodyOutput.events[15].source.presentedOrders[0] = 11
  }],
  ['the source-anchor count', (value) => { value.melodyOutput.sourceAnchors.pop() }],
  ['an anchor targeting a rest', (value) => { value.melodyOutput.sourceAnchors[0].eventIndex = 1 }],
  ['an out-of-range anchor scale index', (value) => { value.melodyOutput.sourceAnchors[0].targetScaleIndex = 11 }],
  ['an anchor whose event source omits its order', (value) => { value.melodyOutput.sourceAnchors[0].eventIndex = 1 }],
  ['a non-integer anchor scale index', (value) => { value.melodyOutput.sourceAnchors[0].targetScaleIndex = 1.5 }],
  ['the trace version', (value) => { value.grammarTrace.version = 'other' }],
  ['a non-zero-based trace sequence', (value) => { value.grammarTrace.entries[1].sequence = 2 }],
  ['an unknown trace stage', (value) => { value.grammarTrace.entries[0].stage = 'emotion' }],
  ['an unknown rationale code', (value) => { value.grammarTrace.entries[0].code = 'FREE_TEXT' }],
  ['a rationale code in the wrong stage', (value) => { value.grammarTrace.entries[0].stage = 'motif' }],
  ['an invalid trace source reference', (value) => { value.grammarTrace.entries[0].sourcePresentedOrders[0] = 0 }],
  ['duplicate trace source references', (value) => { value.grammarTrace.entries[0].sourcePresentedOrders = [1, 1] }],
  ['a nested trace value', (value) => { value.grammarTrace.entries[0].values.detail = { prose: true } }],
  ['a non-finite trace value', (value) => { value.grammarTrace.entries[0].values.itemCount = Number.NaN }],
  ['the diagnostics version', (value) => { value.diagnostics.version = 'other' }],
  ['an empty diagnostics check list', (value) => { value.diagnostics.checks = [] }],
  ['a failed diagnostic', (value) => { value.diagnostics.checks[0].passed = false }],
  ['a non-finite diagnostic', (value) => { value.diagnostics.checks[0].actual = Infinity }],
  ['an explicitly undefined diagnostic bound', (value) => { value.diagnostics.checks[0].minimum = undefined }],
  ['a contradictory passing diagnostic', (value) => { value.diagnostics.checks[0].actual = 11 }],
  ['a prose warning instead of a stable code', (value) => { value.diagnostics.warnings[0] = 'This is only structural.' }],
  ['a duplicate warning code', (value) => { value.diagnostics.warnings.push('STRUCTURAL_METRICS_ONLY') }],
]

describe('validateGrammarV1Result', () => {
  it('accepts a complete result, returns the same reference, and does not mutate it', () => {
    const result = validResult()
    const before = structuredClone(result)
    expect(validateGrammarV1Result(result)).toBe(result)
    expect(result).toEqual(before)
    expect(result.melodyOutput.phrases[0].eventIndices).toContain(1)
    expect(result.melodyOutput.motif.occurrences[0].eventIndices).not.toContain(1)
  })

  it('accepts non-vacuous seven-semitone leaps with immediate opposite-step recovery', () => {
    const result: any = validResult()
    const perPhraseSteps = [
      [5, 2, 3],
      [5, 2, 3],
      [5, 2, 3],
      [5, 2, 4],
    ]
    result.melodyOutput.motif.seedScaleSteps = [5, 2, 3]
    perPhraseSteps.forEach((steps, phraseIndex) => {
      steps.forEach((step, noteIndex) => {
        const eventOffset = [[0, 2, 3], [0, 2, 3], [0, 1, 3], [0, 2, 3]][phraseIndex][noteIndex]
        result.melodyOutput.events[phraseIndex * 4 + eventOffset].midiNote = SCALE_NOTES[step]
      })
    })
    expect(validateGrammarV1Result(result)).toBe(result)

    result.melodyOutput.events[3].midiNote = 57
    expect(() => validateGrammarV1Result(result))
      .toThrow(/opposite-step recovery/)
  })

  it('enforces tonic stability for strong closure profiles', () => {
    const result: any = validResult()
    result.melodyOutput.grammar.profile = 'RESOLVED'
    result.melodyOutput.grammar.tempoBpm = 78
    result.melodyOutput.events[15].midiNote = 60
    expect(validateGrammarV1Result(result)).toBe(result)

    result.melodyOutput.events[15].midiNote = 62
    expect(() => validateGrammarV1Result(result))
      .toThrow(/stability 1 for a strong closure/)
  })

  it('requires a non-tonic stable scale degree for open closure profiles', () => {
    const result: any = validResult()
    const dorianScale = [55, 57, 58, 60, 62, 63, 65, 67, 69, 70, 72, 74, 75, 77, 79]
    const perPhraseSteps = [
      [3, 4, 5],
      [3, 4, 5],
      [3, 4, 5],
      [3, 4, 4],
    ]
    const noteOffsets = [[0, 2, 3], [0, 2, 3], [0, 1, 3], [0, 2, 3]]
    result.melodyOutput.grammar.profile = 'OPEN_ENDED'
    result.melodyOutput.grammar.tempoBpm = 76
    result.melodyOutput.grammar.tonalFrame.mode = 'dorian'
    result.melodyOutput.grammar.tonalFrame.semitoneOffsets = [0, 2, 3, 5, 7, 9, 10]
    result.melodyOutput.grammar.tonalFrame.stabilityWeights = [
      1, 0, 0.25, 0.6, 0, 0.4, 0, 0.75, 0, 0.35, 0.45, 0,
    ]
    result.melodyOutput.grammar.tonalFrame.scaleNotes = dorianScale
    result.melodyOutput.motif.seedScaleSteps = [3, 4, 5]
    perPhraseSteps.forEach((steps, phraseIndex) => {
      steps.forEach((step, noteIndex) => {
        const eventIndex = phraseIndex * 4 + noteOffsets[phraseIndex][noteIndex]
        result.melodyOutput.events[eventIndex].midiNote = dorianScale[step]
      })
    })
    expect(validateGrammarV1Result(result)).toBe(result)

    result.melodyOutput.events[15].midiNote = 60
    expect(() => validateGrammarV1Result(result))
      .toThrow(/strictly between 0 and 1 for an open closure/)
  })

  it.each(mutationCases)('rejects %s instead of repairing it', (_, mutate) => {
    const invalid: any = structuredClone(validResult())
    mutate(invalid)
    expect(() => validateGrammarV1Result(invalid))
      .toThrow(GrammarV1ResultValidationError)
  })
})
