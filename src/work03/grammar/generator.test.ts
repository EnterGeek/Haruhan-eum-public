import { describe, expect, it } from 'vitest'
import type { Direction } from '../../domain/types'
import goldenSessions from '../../../docs/golden-sessions/representative-sessions.json'
import { expandGoldenCase } from '../../work02/golden/expandGoldenCase'
import { interpretFlow } from '../../work02/interpretation/interpretFlow'
import type { InterpretationMethod } from '../../work02/interpretation/types'
import type { Work02Input } from '../../work02/types'
import {
  WORK03_PUBLIC_FIXTURE_IDS,
  createWork03PublicFixtureInput,
  work03EvaluationSeed,
} from '../fixtures/publicFixtures'
import { getGrammarProfile } from './profiles'
import { RHYTHM_CELLS, isSyncopatedNote } from './rhythm'
import {
  deterministicChoice,
  deterministicIndex,
  fnv1a32,
  keyedHash32,
} from './deterministicChoice'
import {
  generateGrammarV1,
  quantizeGrammarContourIndex,
  selectOppositeLeapRecovery,
} from './generator'
import type {
  GenerateGrammarV1Request,
  GrammarNoteEvent,
  GrammarProfileId,
  GrammarV1Result,
} from './types'
import { GRAMMAR_PROFILE_IDS } from './types'
import { validateGrammarV1Result } from './validateOutput'

const requestFor = (
  profile: GrammarProfileId = 'BALANCED_LYRICAL',
  caseId = 'same-deck-baseline',
  method: InterpretationMethod = 'hybrid',
  seed = `work03-generator-test|${caseId}|${method}|${profile}`,
): GenerateGrammarV1Request => ({
  interpretation: interpretFlow(expandGoldenCase(goldenSessions, caseId), method),
  seed,
  profile,
})

const notesOf = (result: GrammarV1Result): GrammarNoteEvent[] =>
  result.melodyOutput.events.filter((event): event is GrammarNoteEvent =>
    event.kind === 'note')

const scaleStepsOf = (
  result: GrammarV1Result,
  occurrenceIndex: number,
): number[] => {
  const output = result.melodyOutput
  return output.motif.occurrences[occurrenceIndex].eventIndices.map((eventIndex) =>
    output.grammar.tonalFrame.scaleNotes.indexOf(
      (output.events[eventIndex] as GrammarNoteEvent).midiNote,
    ))
}

const durationsOf = (
  result: GrammarV1Result,
  occurrenceIndex: number,
): number[] => result.melodyOutput.motif.occurrences[occurrenceIndex]
  .eventIndices.map((eventIndex) =>
    result.melodyOutput.events[eventIndex].durationBeats)

const expectBoundedResult = (result: GrammarV1Result) => {
  expect(validateGrammarV1Result(result)).toBe(result)
  const output = result.melodyOutput
  const constraints = output.grammar.constraints
  expect(output.phrases.map((phrase) => [
    phrase.startBeat,
    phrase.endBeat,
    phrase.relationship,
    phrase.function,
  ])).toEqual([
    [0, 3, 'antecedent', 'opening'],
    [3, 6, 'antecedent', 'middle'],
    [6, 9, 'consequent', 'middle'],
    [9, 12, 'consequent', 'cadential'],
  ])
  expect(output.events.length).toBeLessThanOrEqual(constraints.maximumEvents)

  let nextStart = 0
  output.events.forEach((event, eventIndex) => {
    expect(event.eventIndex).toBe(eventIndex)
    expect(event.startBeat).toBe(nextStart)
    expect(constraints.allowedDurationsBeats).toContain(event.durationBeats)
    expect(event.durationBeats).toBeGreaterThan(0)
    expect(Number.isInteger(event.startBeat * constraints.ticksPerBeat)).toBe(true)
    expect(Number.isInteger(event.durationBeats * constraints.ticksPerBeat)).toBe(true)
    nextStart += event.durationBeats
    if (event.kind === 'note') {
      expect(event.midiNote).toBeGreaterThanOrEqual(constraints.minimumMidi)
      expect(event.midiNote).toBeLessThanOrEqual(constraints.maximumMidi)
      expect(output.grammar.tonalFrame.scaleNotes).toContain(event.midiNote)
    }
  })
  expect(nextStart).toBe(12)

  expect(output.motif.occurrences).toHaveLength(4)
  output.motif.occurrences.forEach((occurrence, index) => {
    expect(occurrence).toMatchObject({ occurrenceIndex: index, phraseIndex: index })
    expect(occurrence.eventIndices).toHaveLength(output.motif.seedEventCount)
    occurrence.eventIndices.forEach((eventIndex) => {
      expect(output.events[eventIndex].kind).toBe('note')
      expect(output.events[eventIndex].motifOccurrenceIndex).toBe(index)
    })
  })

  const notes = notesOf(result)
  notes.slice(1).forEach((note, index) => {
    const interval = note.midiNote - notes[index].midiNote
    expect(Math.abs(interval)).toBeLessThanOrEqual(
      constraints.maximumMelodicLeapSemitones,
    )
    if (Math.abs(interval) >= constraints.largeLeapThresholdSemitones) {
      const recovery = notes[index + 2]
      expect(recovery).toBeDefined()
      const recoveryInterval = recovery.midiNote - note.midiNote
      expect(Math.sign(recoveryInterval)).toBe(-Math.sign(interval))
      expect(Math.abs(recoveryInterval)).toBeLessThanOrEqual(
        constraints.recoveryMaximumStepSemitones,
      )
    }
  })
  expect(notes.slice(1).every((note, index) =>
    Math.abs(note.midiNote - notes[index].midiNote) <
      constraints.largeLeapThresholdSemitones)).toBe(true)

  expect(output.sourceAnchors.map((anchor) => anchor.presentedOrder)).toEqual(
    Array.from({ length: 12 }, (_, index) => index + 1),
  )
  output.sourceAnchors.forEach((anchor) => {
    const event = output.events[anchor.eventIndex]
    expect(event.kind).toBe('note')
    expect(event.source.presentedOrders).toContain(anchor.presentedOrder)
    const sourceOffset = event.source.presentedOrders.indexOf(anchor.presentedOrder)
    expect(anchor.targetScaleIndex).toBe(quantizeGrammarContourIndex(
      event.source.contourPositions[sourceOffset],
      output.grammar.tonalFrame.scaleNotes.length,
    ))
  })

  expect(result.grammarTrace.entries.map((entry) => entry.sequence)).toEqual(
    result.grammarTrace.entries.map((_, index) => index),
  )
  result.grammarTrace.entries.forEach((entry) => {
    Object.values(entry.values).forEach((value) => {
      expect(
        typeof value === 'string' || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)),
      ).toBe(true)
    })
  })
  expect(result.diagnostics.checks.every((check) => check.passed)).toBe(true)
  result.diagnostics.checks.forEach((check) => {
    expect(Number.isFinite(check.actual)).toBe(true)
    if (check.minimum !== undefined) expect(Number.isFinite(check.minimum)).toBe(true)
    if (check.maximum !== undefined) expect(Number.isFinite(check.maximum)).toBe(true)
  })
}

describe('Work 03 deterministic choice and rhythm vocabulary', () => {
  it('uses standard UTF-8 FNV-1a32 and independent framed keys', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('hello')).toBe(0x4f9f2cab)
    expect(keyedHash32('ab', 'c')).not.toBe(keyedHash32('a', 'bc'))
    expect(deterministicIndex('seed', 'key', 7)).toBe(
      deterministicIndex('seed', 'key', 7),
    )
    expect(deterministicChoice('seed', 'choice', ['a', 'b', 'c'])).toBe(
      deterministicChoice('seed', 'choice', ['a', 'b', 'c']),
    )
  })

  it('freezes a finite 3-beat, half-grid vocabulary with 2-5 notes', () => {
    expect(RHYTHM_CELLS).toHaveLength(14)
    RHYTHM_CELLS.forEach((cell) => {
      expect(cell.slots.reduce((sum, slot) => sum + slot.durationBeats, 0)).toBe(3)
      expect(cell.slots.filter((slot) => slot.kind === 'note')).toHaveLength(
        cell.noteCount,
      )
      expect(cell.noteCount).toBeGreaterThanOrEqual(2)
      expect(cell.noteCount).toBeLessThanOrEqual(5)
      expect(cell.slots.every((slot) => [0.5, 1, 1.5, 2]
        .includes(slot.durationBeats))).toBe(true)
      expect(Object.isFrozen(cell)).toBe(true)
      expect(Object.isFrozen(cell.slots)).toBe(true)
    })
  })

  it('makes the large-leap recovery rule non-vacuous with a forced fixture', () => {
    expect(selectOppositeLeapRecovery([60, 62, 64, 67], 60, 67)).toBe(64)
    expect(() => selectOppositeLeapRecovery([67, 69, 72], 60, 67, 1))
      .toThrow(/No scale note/)
    expect(isSyncopatedNote(0.5, 1)).toBe(true)
    expect(isSyncopatedNote(0.5, 0.5)).toBe(false)
  })
})

describe('generateGrammarV1', () => {
  it('returns byte-identical data for independently constructed identical requests', () => {
    const firstInput = requestFor()
    const before = structuredClone(firstInput)
    const results = Array.from({ length: 3 }, () =>
      generateGrammarV1(requestFor()))
    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(1)
    expect(firstInput).toEqual(before)
    expectBoundedResult(generateGrammarV1(firstInput))
  })

  it.each(GRAMMAR_PROFILE_IDS)('keeps %s inside the common hard bounds', (profile) => {
    const result = generateGrammarV1(requestFor(profile))
    expect(result.melodyOutput.motif.seedEventCount).toBe(
      getGrammarProfile(profile).limits.motifEventCount,
    )
    expect(getGrammarProfile(profile).limits.allowedModes).toContain(
      result.melodyOutput.grammar.tonalFrame.mode,
    )
    expectBoundedResult(result)
  })

  it('algebraically declares seed, exact repeat, variation, and cadence occurrences', () => {
    GRAMMAR_PROFILE_IDS.forEach((profile) => {
      const result = generateGrammarV1(requestFor(profile))
      const motif = result.melodyOutput.motif
      const seedSteps = scaleStepsOf(result, 0)
      const seedDurations = durationsOf(result, 0)
      expect(motif.seedScaleSteps).toEqual(seedSteps)
      expect(motif.occurrences.map((occurrence) => occurrence.transformation)[0])
        .toBe('seed')
      expect(scaleStepsOf(result, 1)).toEqual(seedSteps)
      expect(durationsOf(result, 1)).toEqual(seedDurations)

      const middleSteps = scaleStepsOf(result, 2)
      const middleDurations = durationsOf(result, 2)
      if (motif.occurrences[2].transformation === 'rhythmic-variation') {
        expect(middleSteps).toEqual(seedSteps)
        expect(middleDurations).not.toEqual(seedDurations)
      } else {
        expect(motif.occurrences[2].transformation).toBe('contour-transposition')
        const offset = middleSteps[0] - seedSteps[0]
        expect(offset).not.toBe(0)
        expect(middleSteps.every((step, index) =>
          step - seedSteps[index] === offset)).toBe(true)
        expect(middleDurations).toEqual(seedDurations)
      }

      const cadenceSteps = scaleStepsOf(result, 3)
      expect(cadenceSteps.slice(0, -1)).toEqual(seedSteps.slice(0, -1))
      expect(cadenceSteps.at(-1)).not.toBe(seedSteps.at(-1))
      expect(durationsOf(result, 3)).toEqual(seedDurations)
    })
  })

  it('separates sparse/dense behavior and enforces profile cadence strength', () => {
    const calm = generateGrammarV1(requestFor('CALM_SPARSE'))
    const pulsing = generateGrammarV1(requestFor('PULSING'))
    const open = generateGrammarV1(requestFor('OPEN_ENDED'))
    const resolved = generateGrammarV1(requestFor('RESOLVED'))
    const restBeats = (result: GrammarV1Result) => result.melodyOutput.events
      .reduce((sum, event) => sum + (event.kind === 'rest' ? event.durationBeats : 0), 0)
    expect(restBeats(calm)).toBeGreaterThan(restBeats(pulsing))
    expect(notesOf(pulsing).length / 12).toBeGreaterThan(notesOf(calm).length / 12)

    const finalRelativePitchClass = (result: GrammarV1Result) => {
      const output = result.melodyOutput
      const final = notesOf(result).at(-1)!
      return ((final.midiNote - output.grammar.tonalFrame.tonicMidi) % 12 + 12) % 12
    }
    expect(finalRelativePitchClass(resolved)).toBe(0)
    expect(finalRelativePitchClass(open)).not.toBe(0)
    expect(open.melodyOutput.grammar.tonalFrame.stabilityWeights[
      finalRelativePitchClass(open)
    ]).toBeLessThan(1)
  })

  it.each([
    'all-left-fast-buttons',
    'all-right-same-deck-replay',
    'undo-and-reselect',
  ])('keeps the public %s edge fixture bounded across every profile', (caseId) => {
    GRAMMAR_PROFILE_IDS.forEach((profile) => {
      expectBoundedResult(generateGrammarV1(requestFor(profile, caseId)))
    })
  })

  it.each(WORK03_PUBLIC_FIXTURE_IDS)(
    'validates the complete method/profile matrix for frozen fixture %s',
    (fixtureId) => {
      const methods: readonly InterpretationMethod[] = [
        'absolute-hue',
        'relative-hue',
        'hybrid',
      ]
      methods.forEach((method) => {
        GRAMMAR_PROFILE_IDS.forEach((profile) => {
          const result = generateGrammarV1({
            interpretation: interpretFlow(
              createWork03PublicFixtureInput(fixtureId),
              method,
            ),
            seed: work03EvaluationSeed(fixtureId, method, profile),
            profile,
          })
          expect(validateGrammarV1Result(result)).toBe(result)
        })
      })
    },
  )

  it('keeps an alternating mathematical direction fixture bounded', () => {
    const base = expandGoldenCase(goldenSessions, 'same-deck-baseline')
    const alternating = base.map((item, index) => ({
      ...item,
      direction: (index % 2 === 0 ? 'left' : 'right') as Direction,
    })) as unknown as Work02Input
    GRAMMAR_PROFILE_IDS.forEach((profile) => {
      const result = generateGrammarV1({
        interpretation: interpretFlow(alternating, 'hybrid'),
        seed: `work03-alternating|${profile}`,
        profile,
      })
      expect(validateGrammarV1Result(result)).toBe(result)
    })
  })

  it('honors the narrowest register/leap/syncopation/rest controls for a compatible profile', () => {
    const input = requestFor('CALM_SPARSE')
    const result = generateGrammarV1({
      ...input,
      constraints: {
        minimumMidi: 67,
        maximumMidi: 79,
        maximumMelodicLeapSemitones: 2,
        maximumSyncopatedEvents: 0,
        maximumEvents: 8,
        restsAllowed: false,
      },
    })
    expect(result.melodyOutput.events).toHaveLength(8)
    expect(result.melodyOutput.events.every((event) => event.kind === 'note')).toBe(true)
    expect(result.melodyOutput.events.every((event) =>
      !isSyncopatedNote(event.startBeat, event.durationBeats))).toBe(true)
    expectBoundedResult(result)
  })
})
