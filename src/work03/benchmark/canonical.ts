export const MAX_CANONICAL_CHARACTERS = 1_048_576 as const
export const MAX_CANONICAL_NODES = 65_536 as const
export const MAX_CANONICAL_DEPTH = 128 as const

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanonicalizationError'
  }
}

interface CanonicalState {
  readonly active: WeakSet<object>
  nodes: number
  characters: number
}

const append = (state: CanonicalState, value: string): string => {
  state.characters += value.length
  if (state.characters > MAX_CANONICAL_CHARACTERS) {
    throw new CanonicalizationError(
      `Canonical output exceeds ${MAX_CANONICAL_CHARACTERS} characters.`,
    )
  }
  return value
}

const visit = (state: CanonicalState, depth: number): void => {
  state.nodes += 1
  if (state.nodes > MAX_CANONICAL_NODES) {
    throw new CanonicalizationError(
      `Canonical output exceeds ${MAX_CANONICAL_NODES} visited values.`,
    )
  }
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new CanonicalizationError(
      `Canonical output exceeds depth ${MAX_CANONICAL_DEPTH}.`,
    )
  }
}

const canonicalNumber = (value: number): string => {
  if (Number.isNaN(value)) return 'd:NaN'
  if (value === Number.POSITIVE_INFINITY) return 'd:+Infinity'
  if (value === Number.NEGATIVE_INFINITY) return 'd:-Infinity'
  if (Object.is(value, -0)) return 'd:-0'
  return `d:${JSON.stringify(value)}`
}

const encode = (value: unknown, state: CanonicalState, depth: number): string => {
  visit(state, depth)
  if (value === null) return append(state, 'null')
  if (typeof value === 'number') return append(state, canonicalNumber(value))
  if (typeof value === 'string') return append(state, `s:${JSON.stringify(value)}`)
  if (typeof value === 'boolean') return append(state, `b:${value ? '1' : '0'}`)
  if (typeof value === 'undefined') return append(state, 'undefined')
  if (typeof value === 'bigint') return append(state, `i:${value.toString()}`)
  if (typeof value === 'symbol' || typeof value === 'function') {
    throw new CanonicalizationError(`Unsupported canonical value type: ${typeof value}.`)
  }

  if (state.active.has(value)) {
    throw new CanonicalizationError('Cyclic output cannot be canonicalized.')
  }
  state.active.add(value)
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_CANONICAL_NODES) {
        throw new CanonicalizationError('Canonical array exceeds the visited-value limit.')
      }
      const entries: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        entries.push(index in value ? encode(value[index], state, depth + 1) : 'hole')
      }
      return append(state, `array:[${entries.join(',')}]`)
    }
    if (value instanceof Date) {
      const time = value.getTime()
      return append(state, Number.isNaN(time) ? 'date:Invalid' : `date:${value.toISOString()}`)
    }
    if (value instanceof Map) {
      if (value.size > MAX_CANONICAL_NODES) {
        throw new CanonicalizationError('Canonical map exceeds the visited-value limit.')
      }
      const entries = [...value.entries()]
        .map(([key, item]) =>
          `${encode(key, state, depth + 1)}=>${encode(item, state, depth + 1)}`)
        .sort(compareCanonicalStrings)
      return append(state, `map:{${entries.join(',')}}`)
    }
    if (value instanceof Set) {
      if (value.size > MAX_CANONICAL_NODES) {
        throw new CanonicalizationError('Canonical set exceeds the visited-value limit.')
      }
      const entries = [...value]
        .map((item) => encode(item, state, depth + 1))
        .sort(compareCanonicalStrings)
      return append(state, `set:{${entries.join(',')}}`)
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalizationError(
        `Unsupported canonical object prototype: ${prototype?.constructor?.name ?? 'unknown'}.`,
      )
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new CanonicalizationError('Symbol-keyed output cannot be canonicalized.')
    }
    const object = value as Record<string, unknown>
    const keys = Object.keys(object).sort(compareCanonicalStrings)
    if (keys.length > MAX_CANONICAL_NODES) {
      throw new CanonicalizationError('Canonical object exceeds the visited-value limit.')
    }
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${encode(object[key], state, depth + 1)}`,
    )
    return append(state, `object:{${entries.join(',')}}`)
  } finally {
    state.active.delete(value)
  }
}

/**
 * Produces a deterministic, type-tagged representation of bounded acyclic
 * data. Unsupported prototypes, functions, symbols, cycles, and oversized
 * values are rejected instead of being silently collapsed.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, {
    active: new WeakSet<object>(),
    nodes: 0,
    characters: 0,
  }, 0)
}

/** Stable non-cryptographic identifier used only to group equal failures. */
export function stableHash(value: unknown): string {
  const input = canonicalJson(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
