import { BROKEN_GENERATOR_EXPECTATIONS } from './expectations'
import { BROKEN_GENERATOR_FACTORIES } from './generators'
import type { BrokenGeneratorCase } from './types'

export const BROKEN_GENERATOR_CASES: readonly BrokenGeneratorCase[] = Object.freeze(
  BROKEN_GENERATOR_EXPECTATIONS.map((item) => Object.freeze({
    ...item,
    createGenerator: BROKEN_GENERATOR_FACTORIES[item.id],
  })),
)
