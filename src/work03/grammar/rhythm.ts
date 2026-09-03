export type RhythmSlotKind = 'note' | 'rest'

export interface RhythmSlot {
  kind: RhythmSlotKind
  durationBeats: 0.5 | 1 | 1.5 | 2
}

export interface RhythmCell {
  id: string
  noteCount: number
  slots: readonly RhythmSlot[]
}

const slot = (
  kind: RhythmSlotKind,
  durationBeats: RhythmSlot['durationBeats'],
): Readonly<RhythmSlot> => Object.freeze({ kind, durationBeats })

const cell = (
  id: string,
  noteCount: number,
  slots: readonly Readonly<RhythmSlot>[],
): Readonly<RhythmCell> => {
  const duration = slots.reduce((sum, item) => sum + item.durationBeats, 0)
  const actualNotes = slots.filter((item) => item.kind === 'note').length
  if (duration !== 3 || actualNotes !== noteCount) {
    throw new Error(`Invalid frozen rhythm cell: ${id}`)
  }
  return Object.freeze({ id, noteCount, slots: Object.freeze([...slots]) })
}

/**
 * The complete Work 03 rhythm vocabulary. Every cell fills one 3/4 phrase,
 * every duration is on the half-beat grid, and no runtime cell is accepted.
 */
export const RHYTHM_CELLS: readonly Readonly<RhythmCell>[] = Object.freeze([
  cell('n2-continuous-a', 2, [slot('note', 2), slot('note', 1)]),
  cell('n2-continuous-b', 2, [slot('note', 1), slot('note', 2)]),
  cell('n2-rested-a', 2, [slot('note', 1), slot('rest', 1), slot('note', 1)]),
  cell('n2-rested-b', 2, [slot('note', 1.5), slot('rest', 0.5), slot('note', 1)]),

  cell('n3-continuous-a', 3, [slot('note', 2), slot('note', 0.5), slot('note', 0.5)]),
  cell('n3-continuous-b', 3, [slot('note', 0.5), slot('note', 0.5), slot('note', 2)]),
  cell('n3-rested-a', 3, [
    slot('note', 0.5), slot('rest', 0.5), slot('note', 1), slot('note', 1),
  ]),
  cell('n3-rested-b', 3, [
    slot('note', 1), slot('note', 0.5), slot('rest', 0.5), slot('note', 1),
  ]),

  cell('n4-continuous-a', 4, [
    slot('note', 0.5), slot('note', 0.5), slot('note', 1), slot('note', 1),
  ]),
  cell('n4-continuous-b', 4, [
    slot('note', 1), slot('note', 0.5), slot('note', 0.5), slot('note', 1),
  ]),
  cell('n4-rested-a', 4, [
    slot('note', 0.5), slot('rest', 0.5), slot('note', 0.5),
    slot('note', 0.5), slot('note', 1),
  ]),
  cell('n4-rested-b', 4, [
    slot('note', 1), slot('note', 0.5), slot('rest', 0.5),
    slot('note', 0.5), slot('note', 0.5),
  ]),

  cell('n5-continuous-a', 5, [
    slot('note', 1), slot('note', 0.5), slot('note', 0.5),
    slot('note', 0.5), slot('note', 0.5),
  ]),
  cell('n5-continuous-b', 5, [
    slot('note', 0.5), slot('note', 0.5), slot('note', 1),
    slot('note', 0.5), slot('note', 0.5),
  ]),
])

const cellsById = new Map(RHYTHM_CELLS.map((definition) => [
  definition.id,
  definition,
] as const))

export function getRhythmCell(id: string): Readonly<RhythmCell> {
  const definition = cellsById.get(id)
  if (!definition) throw new RangeError(`Unknown Work 03 rhythm cell: ${id}`)
  return definition
}

export function getRhythmCellFor(
  noteCount: number,
  variant: 'a' | 'b',
  rested: boolean,
): Readonly<RhythmCell> {
  if (!Number.isInteger(noteCount) || noteCount < 2 || noteCount > 5) {
    throw new RangeError('Work 03 rhythm cells require 2-5 notes.')
  }
  // Five minimum-duration notes already consume 2.5 beats. Although a rested
  // five-note cell fits the grid, four such cells would exceed the global
  // default maximumEvents=20, so it is deliberately absent from the grammar.
  const family = rested && noteCount < 5 ? 'rested' : 'continuous'
  return getRhythmCell(`n${noteCount}-${family}-${variant}`)
}

export function noteDurations(cellDefinition: Readonly<RhythmCell>): number[] {
  return cellDefinition.slots.flatMap((item) =>
    item.kind === 'note' ? [item.durationBeats] : [])
}

export function restDuration(cellDefinition: Readonly<RhythmCell>): number {
  return cellDefinition.slots.reduce(
    (sum, item) => sum + (item.kind === 'rest' ? item.durationBeats : 0),
    0,
  )
}

/**
 * Work 03's bounded syncopation proxy counts an offbeat attack whose release
 * is also offbeat. A half-beat subdivision that resolves on the next integer
 * beat is therefore not treated as syncopation.
 */
export function isSyncopatedNote(
  startBeat: number,
  durationBeats: number,
): boolean {
  const endBeat = startBeat + durationBeats
  return !Number.isInteger(startBeat) && !Number.isInteger(endBeat)
}
