import { describe, expect, it } from 'vitest'
import { GENERATOR_FAILURE_INJECTION_IDS } from './broken'
import { runBrokenGeneratorSensitivity } from './sensitivity'

describe('broken-generator sensitivity matrix', () => {
  it('detects every required finding while retaining unexpected and control collisions', async () => {
    const result = await runBrokenGeneratorSensitivity()

    expect(result.rows.map((row) => row.id)).toEqual(
      GENERATOR_FAILURE_INJECTION_IDS,
    )
    expect(result.rows).toHaveLength(16)
    expect(result.rows
      .filter((row) => row.missedFindingCodes.length > 0)
      .map((row) => ({ id: row.id, missed: row.missedFindingCodes })))
      .toEqual([])
    expect(result.rows
      .filter((row) => row.falsePositiveFindingCodes.length > 0)
      .map((row) => ({ id: row.id, falsePositives: row.falsePositiveFindingCodes })))
      .toEqual([])
    expect(result.rows
      .filter((row) => row.unexpectedFindingCodes.length > 0)
      .map((row) => ({ id: row.id, unexpected: row.unexpectedFindingCodes })))
      .toEqual([])
    expect(result.rows.every((row) => row.passed)).toBe(true)
    expect(result.passed).toBe(true)
    result.rows.forEach((row) => {
      expect(row.expectedFindingCodes.length).toBeGreaterThan(0)
      expect(row.observedFindingCodes).toEqual([...row.observedFindingCodes].sort())
      expect(row.unexpectedFindingCodes).toEqual([...row.unexpectedFindingCodes].sort())
      expect(row.falsePositiveFindingCodes).toEqual(
        [...row.falsePositiveFindingCodes].sort(),
      )
    })
  })

  it('is semantically repeatable with fresh broken-generator factories', async () => {
    const first = await runBrokenGeneratorSensitivity(29)
    const second = await runBrokenGeneratorSensitivity(29)

    expect(second).toEqual(first)
  })
})
