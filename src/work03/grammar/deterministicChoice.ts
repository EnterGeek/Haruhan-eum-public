/**
 * Frozen deterministic choice primitive for Work 03.
 *
 * FNV-1a is not used for security. It is a small, fully specified replay
 * primitive whose only job is to make keyed grammar tie-breaks stable.
 */
export function fnv1a32(value: string): number {
  if (typeof value !== 'string') {
    throw new TypeError('FNV-1a input must be a string.')
  }

  let hash = 0x811c9dc5
  const bytes = new TextEncoder().encode(value)
  bytes.forEach((byte) => {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
  })
  return hash
}

const framedKey = (seed: string, key: string): string =>
  `${seed.length}:${seed}\u0000${key.length}:${key}`

/** Returns a stable unsigned 32-bit hash for an independently named choice. */
export function keyedHash32(seed: string, key: string): number {
  if (typeof seed !== 'string' || typeof key !== 'string') {
    throw new TypeError('Deterministic choice seed and key must be strings.')
  }
  return fnv1a32(framedKey(seed, key))
}

/** Returns a stable value in the half-open interval [0, 1). */
export function deterministicUnitInterval(seed: string, key: string): number {
  return keyedHash32(seed, key) / 0x1_0000_0000
}

/** Returns a stable index in [0, length). */
export function deterministicIndex(
  seed: string,
  key: string,
  length: number,
): number {
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new RangeError('Deterministic choice length must be a positive integer.')
  }
  return keyedHash32(seed, key) % length
}

/** Selects one element without consuming mutable pseudo-random state. */
export function deterministicChoice<T>(
  seed: string,
  key: string,
  values: readonly T[],
): T {
  if (values.length === 0) {
    throw new RangeError('Deterministic choice values must not be empty.')
  }
  return values[deterministicIndex(seed, key, values.length)]
}

export interface WeightedChoice<T> {
  value: T
  weight: number
}

/**
 * Selects from explicit non-negative weights. Zero-weight entries are never
 * selected; array order is the deterministic boundary tie-break.
 */
export function deterministicWeightedChoice<T>(
  seed: string,
  key: string,
  choices: readonly WeightedChoice<T>[],
): T {
  if (choices.length === 0) {
    throw new RangeError('Weighted choices must not be empty.')
  }
  let total = 0
  choices.forEach(({ weight }) => {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError('Deterministic choice weights must be finite and non-negative.')
    }
    total += weight
  })
  if (!(total > 0) || !Number.isFinite(total)) {
    throw new RangeError('Deterministic choice weights must have a finite positive sum.')
  }

  const threshold = deterministicUnitInterval(seed, key) * total
  let cumulative = 0
  for (const choice of choices) {
    cumulative += choice.weight
    if (choice.weight > 0 && threshold < cumulative) return choice.value
  }

  // Floating-point accumulation can only reach this branch at the upper edge.
  for (let index = choices.length - 1; index >= 0; index -= 1) {
    if (choices[index].weight > 0) return choices[index].value
  }
  throw new RangeError('Weighted choices contain no selectable entry.')
}
