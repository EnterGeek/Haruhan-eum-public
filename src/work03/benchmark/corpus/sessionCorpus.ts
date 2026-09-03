import type { Direction, InputMethod } from '../../../domain/types'
import {
  buildHueDeck,
  buildRepeatedColorDeck,
  buildSyntheticSession,
  commitSteps,
  type SyntheticSessionStep,
} from './builders'
import type { InputPatternFamily, SessionCorpusCase } from './types'

export const MINIMUM_VALID_SESSION_EVENT_COUNT = 14 as const
export const MAXIMUM_BOUNDED_UNDO_COUNT = 32 as const
export const MAXIMUM_BOUNDED_SESSION_EVENT_COUNT =
  MINIMUM_VALID_SESSION_EVENT_COUNT + MAXIMUM_BOUNDED_UNDO_COUNT * 2

const LEFT: Direction = 'left'
const RIGHT: Direction = 'right'
const alternating = Array.from(
  { length: 12 },
  (_, index): Direction => index % 2 === 0 ? LEFT : RIGHT,
)
const mixed = [
  RIGHT, LEFT, LEFT, RIGHT, RIGHT, LEFT,
  RIGHT, LEFT, RIGHT, LEFT, LEFT, RIGHT,
] as const

const makeCase = (
  id: string,
  dayOffset: number,
  family: InputPatternFamily,
  directions: readonly Direction[],
  options: {
    deckSeed?: string
    advanceMs?: number
    advancesMs?: readonly number[]
    inputMethods?: readonly InputMethod[]
  } = {},
): SessionCorpusCase => ({
  id,
  families: [family],
  session: buildSyntheticSession({
    caseId: id,
    dayOffset,
    deckSeed: options.deckSeed ?? `work03-${id}`,
    steps: commitSteps(directions, options),
  }),
})

const makeUndoReselectSteps = (): SyntheticSessionStep[] => {
  const steps = commitSteps(mixed)
  steps.splice(2, 0,
    { kind: 'commit', direction: RIGHT, inputMethod: 'swipe', advanceMs: 500 },
    { kind: 'undo', advanceMs: 500 },
  )
  steps.splice(9, 0,
    { kind: 'commit', direction: LEFT, inputMethod: 'button', advanceMs: 500 },
    { kind: 'undo', advanceMs: 500 },
  )
  return steps
}

const makeRepeatedCardSteps = (): SyntheticSessionStep[] => [
  ...Array.from({ length: 6 }, (_, index): SyntheticSessionStep[] => [
    {
      kind: 'commit',
      direction: index % 2 === 0 ? LEFT : RIGHT,
      inputMethod: index % 2 === 0 ? 'button' : 'swipe',
      advanceMs: 20,
    },
    { kind: 'undo', advanceMs: 20 },
  ]).flat(),
  ...commitSteps(mixed, { advanceMs: 20 }),
]

const makeMaximumBoundedSteps = (): SyntheticSessionStep[] => [
  ...Array.from(
    { length: MAXIMUM_BOUNDED_UNDO_COUNT },
    (_, index): SyntheticSessionStep[] => [
      {
        kind: 'commit',
        direction: index % 2 === 0 ? LEFT : RIGHT,
        inputMethod: index % 3 === 0 ? 'swipe' : 'button',
        advanceMs: 1,
      },
      { kind: 'undo', advanceMs: 1 },
    ],
  ).flat(),
  ...commitSteps(alternating, { advanceMs: 1 }),
]

const buildCases = (): SessionCorpusCase[] => {
  const replaySeed = 'work03-same-deck-replay'
  const edgeHues = [
    0, 359.999, 0.001, 180, 179.999, 180.001,
    1, 358.999, 90, 270, 0.5, 359.5,
  ] as const
  const allLeft = Array<Direction>(12).fill(LEFT)
  const allRight = Array<Direction>(12).fill(RIGHT)

  return [
    makeCase('all-left', 0, 'all-left', allLeft),
    makeCase('all-right', 1, 'all-right', allRight),
    makeCase('alternating', 2, 'alternating', alternating),
    makeCase(
      'long-same-direction-runs',
      3,
      'long-same-direction-runs',
      [LEFT, LEFT, LEFT, LEFT, LEFT, RIGHT, RIGHT, RIGHT, RIGHT, LEFT, LEFT, LEFT],
    ),
    makeCase(
      'palindromic-choices',
      4,
      'palindromic-choices',
      [LEFT, RIGHT, RIGHT, LEFT, LEFT, RIGHT, RIGHT, LEFT, LEFT, RIGHT, RIGHT, LEFT],
    ),
    makeCase('sparse-interactions', 5, 'sparse-interactions', mixed, {
      advanceMs: 60_000,
    }),
    makeCase('dense-interactions', 6, 'dense-interactions', mixed, {
      advanceMs: 100,
    }),
    makeCase(
      'very-fast-interaction-timestamps',
      7,
      'very-fast-interaction-timestamps',
      mixed,
      { advanceMs: 1 },
    ),
    makeCase('long-pauses', 8, 'long-pauses', mixed, {
      advancesMs: [
        1_000, 1_000, 1_000, 1_000, 1_000, 1_000,
        600_000, 1_000, 1_000, 1_000, 1_000, 1_000,
      ],
    }),
    {
      id: 'repeated-same-card-and-deck-patterns',
      families: ['repeated-same-card/deck-patterns'],
      session: buildSyntheticSession({
        caseId: 'repeated-same-card-and-deck-patterns',
        dayOffset: 9,
        deckSeed: 'work03-repeated-source-colors',
        deck: buildRepeatedColorDeck('work03-repeated-source-colors'),
        steps: makeRepeatedCardSteps(),
      }),
    },
    {
      id: 'undo-then-reselect',
      families: ['undo-then-reselect'],
      session: buildSyntheticSession({
        caseId: 'undo-then-reselect',
        dayOffset: 10,
        deckSeed: 'work03-undo-then-reselect',
        steps: makeUndoReselectSteps(),
      }),
    },
    {
      id: 'pause-and-resume',
      families: ['pause/resume'],
      session: buildSyntheticSession({
        caseId: 'pause-and-resume',
        dayOffset: 11,
        deckSeed: 'work03-pause-and-resume',
        steps: [
          ...commitSteps(mixed.slice(0, 4)),
          { kind: 'wait', durationMs: 1_800_000 },
          ...commitSteps(mixed.slice(4)),
        ],
      }),
    },
    makeCase('mixed-button-and-swipe', 12, 'mixed-button/swipe', mixed, {
      inputMethods: Array.from(
        { length: 12 },
        (_, index): InputMethod => index % 2 === 0 ? 'button' : 'swipe',
      ),
    }),
    makeCase('same-deck-replay-original', 13, 'same-deck-replay', mixed, {
      deckSeed: replaySeed,
    }),
    makeCase('same-deck-replay-repeat', 14, 'same-deck-replay', mixed, {
      deckSeed: replaySeed,
    }),
    {
      id: 'edge-hue-transitions',
      families: ['edge-hue-transitions'],
      session: buildSyntheticSession({
        caseId: 'edge-hue-transitions',
        dayOffset: 15,
        deckSeed: 'work03-edge-hue-transitions',
        deck: buildHueDeck('work03-edge-hue-transitions', edgeHues),
        steps: commitSteps(alternating),
      }),
    },
    makeCase(
      'minimum-valid-session',
      16,
      'minimum-valid-session',
      allRight,
      { advanceMs: 1 },
    ),
    {
      id: 'maximum-bounded-session',
      families: ['maximum-bounded-session'],
      session: buildSyntheticSession({
        caseId: 'maximum-bounded-session',
        dayOffset: 17,
        deckSeed: 'work03-maximum-bounded-session',
        steps: makeMaximumBoundedSteps(),
      }),
    },
  ]
}

/** Returns fresh, mutation-independent fixtures in stable ID order. */
export function buildSessionCorpus(): readonly SessionCorpusCase[] {
  return buildCases()
}
