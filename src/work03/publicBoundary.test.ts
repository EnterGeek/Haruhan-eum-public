/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'
import goldenSessions from '../../docs/golden-sessions/representative-sessions.json'
import { expandGoldenCase } from '../work02/golden/expandGoldenCase'
import { interpretFlow } from '../work02/interpretation/interpretFlow'
import { generateGrammarV1 } from './grammar/generator'

const implementationSources = import.meta.glob<string>('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const scannedImplementationSources = (): readonly [string, string][] =>
  Object.entries(implementationSources)
    .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
    .sort(([first], [second]) => first.localeCompare(second))

describe('Work 03 public/private and runtime boundary', () => {
  it('keeps implementation source free of network, telemetry, storage, and entropy APIs', () => {
    const forbidden: readonly [string, RegExp][] = [
      ['fetch', /\bfetch\s*\(/],
      ['XMLHttpRequest', /\bXMLHttpRequest\b/],
      ['WebSocket', /\bWebSocket\b/],
      ['EventSource', /\bEventSource\b/],
      ['sendBeacon', /\bsendBeacon\b/],
      ['localStorage', /\blocalStorage\b/],
      ['sessionStorage', /\bsessionStorage\b/],
      ['indexedDB', /\bindexedDB\b/],
      ['Math.random', /\bMath\.random\b/],
      ['Date.now', /\bDate\.now\b/],
      ['new Date', /\bnew\s+Date\s*\(/],
      ['crypto entropy', /\bcrypto\.(?:getRandomValues|randomUUID)\b/],
      ['remote URL', /https?:\/\//],
      ['private repository path', /Haruhan-eum-engine-private/i],
    ]

    expect(scannedImplementationSources().length).toBeGreaterThan(0)
    scannedImplementationSources().forEach(([path, source]) => {
      forbidden.forEach(([label, pattern]) => {
        expect(pattern.test(source), `${path} must not use ${label}`).toBe(false)
      })
    })
  })

  it('proves ignored synthetic metadata and interaction history do not enter music input', () => {
    const mutated: any = structuredClone(goldenSessions)
    const fixture = mutated.cases.find((candidate: any) =>
      candidate.id === 'undo-and-reselect')
    expect(fixture).toBeDefined()
    Object.assign(fixture, {
      sourceFile: 'ignored-private-name.pdc',
      sessionId: 'ignored-account-like-id',
      localDate: '2099-12-31',
      timeZone: 'Pacific/Chatham',
      createdAt: '2099-12-31T00:00:00.000Z',
      startedAt: '2099-12-31T12:34:56.000Z',
      completedAt: '2100-01-01T12:34:56.000Z',
      commitInputs: 'SSSSSSSSSSSSSSS',
      commitOrders: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      undoEvents: [[1, 'L'], [12, 'R'], [4, 'L']],
    })

    const canonicalInput = expandGoldenCase(goldenSessions, 'undo-and-reselect')
    const metadataMutatedInput = expandGoldenCase(mutated, 'undo-and-reselect')
    expect(metadataMutatedInput).toEqual(canonicalInput)

    const seed = 'work03-public-boundary-invariance-v1'
    const canonical = generateGrammarV1({
      interpretation: interpretFlow(canonicalInput, 'hybrid'),
      profile: 'BALANCED_LYRICAL',
      seed,
    })
    const mutatedResult = generateGrammarV1({
      interpretation: interpretFlow(metadataMutatedInput, 'hybrid'),
      profile: 'BALANCED_LYRICAL',
      seed,
    })
    expect(mutatedResult).toEqual(canonical)
  })
})
