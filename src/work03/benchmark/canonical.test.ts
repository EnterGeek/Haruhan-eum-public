import { describe, expect, it } from 'vitest'
import { CanonicalizationError, canonicalJson } from './canonical'

describe('type-aware canonical output', () => {
  it('does not collapse special values into user strings', () => {
    expect(canonicalJson(Number.NaN)).not.toBe(canonicalJson('NaN'))
    expect(canonicalJson(undefined)).not.toBe(canonicalJson('undefined'))
    expect(canonicalJson(1n)).not.toBe(canonicalJson('1'))
  })

  it('distinguishes a sparse array hole from explicit undefined', () => {
    const sparse = Array<unknown>(1)
    expect(canonicalJson(sparse)).not.toBe(canonicalJson([undefined]))
  })

  it('supports dates, maps, and sets without collapsing them to empty objects', () => {
    expect(canonicalJson(new Date('2026-01-01T00:00:00.000Z')))
      .not.toBe(canonicalJson({}))
    expect(canonicalJson(new Map([['key', 1]]))).not.toBe(canonicalJson({}))
    expect(canonicalJson(new Set([1]))).not.toBe(canonicalJson({}))
  })

  it('rejects cycles explicitly', () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(() => canonicalJson(cyclic)).toThrow(CanonicalizationError)
  })
})
