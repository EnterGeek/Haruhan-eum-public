import goldenSessions from '../../../docs/golden-sessions/representative-sessions.json'
import type { Direction } from '../../domain/types'
import { expandGoldenCase } from '../../work02/golden/expandGoldenCase'
import type { Work02Input, Work02InputItem } from '../../work02/types'

export const WORK03_GOLDEN_FIXTURE_IDS = [
  'same-deck-baseline',
  'all-left-fast-buttons',
  'all-right-same-deck-replay',
  'undo-and-reselect',
  'swipe-only',
  'mixed-button-and-swipe',
  'pause-and-resume',
] as const

export const WORK03_MATHEMATICAL_FIXTURE_IDS = [
  'asc-right',
  'desc-left',
  'wrap-alternating',
  'constant-blocks',
  'antipodal',
  'narrow-wrap',
  'irregular',
] as const

export const WORK03_DIRECTION_DENSITY_FIXTURE_IDS = [
  'sparse-direction',
  'dense-direction',
] as const

export const WORK03_PUBLIC_FIXTURE_IDS = [
  ...WORK03_GOLDEN_FIXTURE_IDS,
  ...WORK03_MATHEMATICAL_FIXTURE_IDS,
  ...WORK03_DIRECTION_DENSITY_FIXTURE_IDS,
] as const

export type Work03PublicFixtureId = typeof WORK03_PUBLIC_FIXTURE_IDS[number]

const mathematicalFixtures: Readonly<Record<
  typeof WORK03_MATHEMATICAL_FIXTURE_IDS[number],
  Readonly<{ hues: readonly number[]; directions: string }>
>> = Object.freeze({
  'asc-right': Object.freeze({
    hues: Object.freeze([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]),
    directions: 'RRRRRRRRRRRR',
  }),
  'desc-left': Object.freeze({
    hues: Object.freeze([330, 300, 270, 240, 210, 180, 150, 120, 90, 60, 30, 0]),
    directions: 'LLLLLLLLLLLL',
  }),
  'wrap-alternating': Object.freeze({
    hues: Object.freeze([0, 359, 1, 180, 181, 179, 90, 270, 45, 225, 135, 315]),
    directions: 'LRLRLRLRLRLR',
  }),
  'constant-blocks': Object.freeze({
    hues: Object.freeze(Array(12).fill(15) as number[]),
    directions: 'LLLLLLRRRRRR',
  }),
  antipodal: Object.freeze({
    hues: Object.freeze([10, 190, 10, 190, 10, 190, 10, 190, 10, 190, 10, 190]),
    directions: 'RLLRLLRLLRLL',
  }),
  'narrow-wrap': Object.freeze({
    hues: Object.freeze([359, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21]),
    directions: 'LRRRLRRRLRRR',
  }),
  irregular: Object.freeze({
    hues: Object.freeze([42, 287, 103, 221, 8, 354, 176, 64, 299, 138, 250, 19]),
    directions: 'RLLRRLRLRLLR',
  }),
})

const toDirections = (encoded: string): Direction[] =>
  [...encoded].map((value) => value === 'L' ? 'left' : 'right')

const isGoldenId = (
  fixtureId: string,
): fixtureId is typeof WORK03_GOLDEN_FIXTURE_IDS[number] =>
  (WORK03_GOLDEN_FIXTURE_IDS as readonly string[]).includes(fixtureId)

const isMathematicalId = (
  fixtureId: string,
): fixtureId is typeof WORK03_MATHEMATICAL_FIXTURE_IDS[number] =>
  (WORK03_MATHEMATICAL_FIXTURE_IDS as readonly string[]).includes(fixtureId)

const makeMathematicalInput = (
  fixtureId: typeof WORK03_MATHEMATICAL_FIXTURE_IDS[number],
): Work02Input => {
  const fixture = mathematicalFixtures[fixtureId]
  const directions = toDirections(fixture.directions)
  return fixture.hues.map((hue, index): Work02InputItem => ({
    index: index + 1,
    cardId: `work03-math-v1:${fixtureId}:${String(index + 1).padStart(2, '0')}`,
    color: { hue, lightness: 0.6, chroma: 0.12 },
    direction: directions[index],
  })) as unknown as Work02Input
}

const makeDirectionDensityInput = (
  fixtureId: typeof WORK03_DIRECTION_DENSITY_FIXTURE_IDS[number],
): Work02Input => {
  const directions = toDirections(
    fixtureId === 'sparse-direction' ? 'LLLLRLLLLRLL' : 'RRRRLRRRRLRR',
  )
  const baseline = expandGoldenCase(goldenSessions, 'same-deck-baseline')
  return baseline.map((item, index): Work02InputItem => ({
    index: item.index,
    cardId: item.cardId,
    color: { ...item.color },
    direction: directions[index],
  })) as unknown as Work02Input
}

export function createWork03PublicFixtureInput(
  fixtureId: Work03PublicFixtureId,
): Work02Input {
  if (isGoldenId(fixtureId)) return expandGoldenCase(goldenSessions, fixtureId)
  if (isMathematicalId(fixtureId)) return makeMathematicalInput(fixtureId)
  if ((WORK03_DIRECTION_DENSITY_FIXTURE_IDS as readonly string[]).includes(fixtureId)) {
    return makeDirectionDensityInput(
      fixtureId as typeof WORK03_DIRECTION_DENSITY_FIXTURE_IDS[number],
    )
  }
  throw new RangeError(`Unsupported Work 03 public fixture: ${String(fixtureId)}`)
}

export function work03EvaluationSeed(
  fixtureId: Work03PublicFixtureId,
  method: 'absolute-hue' | 'relative-hue' | 'hybrid',
  profile: string,
): string {
  return `work03-public-eval-v1|${fixtureId}|${method}|${profile}`
}
