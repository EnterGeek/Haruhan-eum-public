import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Work03Lab } from './Work03Lab'
import {
  DEFAULT_WORK03_LAB_SELECTION,
  createWork03LabResult,
} from './model'

afterEach(() => cleanup())

const select = (name: string): HTMLSelectElement =>
  screen.getByRole('combobox', { name }) as HTMLSelectElement

describe('Work03Lab', () => {
  it('renders a single labelled R&D surface with all frozen control options', () => {
    render(<Work03Lab />)

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', {
      level: 1,
      name: 'Deterministic Music Grammar Lab',
    })).toBeTruthy()
    expect(screen.getByText(/Independent R&D only/)).toBeTruthy()
    expect(screen.getByText(/not a universal quality score/)).toBeTruthy()
    expect(screen.getByText(/psychological diagnosis/)).toBeTruthy()
    expect(screen.getByText('PUBLIC FIXTURES ONLY')).toBeTruthy()
    expect(screen.getByText(/No time, locale, upload/)).toBeTruthy()

    const fixture = select('Public fixture')
    const method = select('Interpretation method')
    const profile = select('Grammar profile')
    expect(fixture.options).toHaveLength(16)
    expect(method.options).toHaveLength(3)
    expect(profile.options).toHaveLength(6)
    expect(fixture.value).toBe(DEFAULT_WORK03_LAB_SELECTION.fixtureId)
    expect(method.value).toBe(DEFAULT_WORK03_LAB_SELECTION.method)
    expect(profile.value).toBe(DEFAULT_WORK03_LAB_SELECTION.profile)
  })

  it('keeps controls and the deterministic model synchronized', async () => {
    const user = userEvent.setup()
    render(<Work03Lab />)

    await user.selectOptions(select('Public fixture'), 'irregular')
    await user.selectOptions(select('Interpretation method'), 'relative-hue')
    await user.selectOptions(select('Grammar profile'), 'OPEN_ENDED')

    expect(select('Public fixture').value).toBe('irregular')
    expect(select('Interpretation method').value).toBe('relative-hue')
    expect(select('Grammar profile').value).toBe('OPEN_ENDED')
    expect(screen.getAllByText(
      'work03-public-eval-v1|irregular|relative-hue|OPEN_ENDED',
    ).length).toBeGreaterThan(0)
    expect(screen.getAllByText('OPEN_ENDED').length).toBeGreaterThan(0)
    expect(screen.getByText(/Comparing/).textContent).toContain('B · Relative Hue')
  })

  it('renders neutral baseline metrics, form, trace, and schedule evidence', () => {
    const expected = createWork03LabResult(DEFAULT_WORK03_LAB_SELECTION)
    const { container } = render(<Work03Lab />)

    expect(screen.getByRole('heading', { name: 'Work 02 baseline' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Work 03 Grammar v1' })).toBeTruthy()

    const metrics = screen.getByRole('table', {
      name: /Deterministic structural diagnostics/,
    })
    expect(within(metrics).getAllByRole('columnheader')).toHaveLength(3)
    expect(within(metrics).getAllByRole('rowheader').length).toBeGreaterThan(20)
    expect(within(metrics).getByText('Motif recurrence count')).toBeTruthy()
    expect(within(metrics).getByText('Unresolved leap count')).toBeTruthy()
    expect(within(metrics).getByText('Final stability')).toBeTruthy()

    expect(container.querySelectorAll('.phrase-card')).toHaveLength(4)
    expect(screen.getByText('Phrase 1')).toBeTruthy()
    expect(screen.getByText('Phrase 4')).toBeTruthy()
    expect(screen.getAllByText('cadential').length).toBeGreaterThan(0)

    const trace = screen.getByRole('table', {
      name: 'Ordered Grammar v1 decision trace',
    })
    expect(within(trace).getAllByRole('row')).toHaveLength(
      expected.grammarV1.result.grammarTrace.entries.length + 1,
    )
    expect(within(trace).getByText('INPUT_CONTRACT_ACCEPTED')).toBeTruthy()
    expect(within(trace).getByText('CADENCE_STABILITY_TARGETED')).toBeTruthy()

    expect(screen.getByText('SOURCE-CHECKED')).toBeTruthy()
    expect(screen.getByText('work03-audio-schedule-v1')).toBeTruthy()
    expect(screen.getByText('work03-audio-adapter-v1')).toBeTruthy()
    expect(screen.getByText(/one-to-one source notes/)).toBeTruthy()
    expect(screen.getByText(/Playback is intentionally omitted/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /play/i })).toBeNull()
  })

  it('exposes labelled keyboard-focusable horizontal evidence regions', () => {
    render(<Work03Lab />)

    const metricsRegion = screen.getByLabelText(
      'Scrollable structural metrics comparison',
    )
    const traceRegion = screen.getByLabelText(
      'Scrollable deterministic grammar trace',
    )
    expect(metricsRegion.getAttribute('tabindex')).toBe('0')
    expect(traceRegion.getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('status').getAttribute('aria-atomic')).toBe('true')
  })

  it('requests the exact deterministic export without claiming disk completion', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    render(<Work03Lab onExport={onExport} />)
    const expected = createWork03LabResult(DEFAULT_WORK03_LAB_SELECTION)
    const exportButton = screen.getByRole('button', {
      name: 'Download deterministic JSON',
    })

    await user.click(exportButton)
    await user.click(exportButton)

    expect(onExport).toHaveBeenCalledTimes(2)
    expect(onExport).toHaveBeenNthCalledWith(
      1,
      expected.exportFileName,
      expected.exportJson,
    )
    expect(onExport).toHaveBeenNthCalledWith(
      2,
      expected.exportFileName,
      expected.exportJson,
    )
    expect(screen.getByRole('status').textContent).toBe(
      `Download requested: ${expected.exportFileName}`,
    )
    expect(screen.getByRole('status').textContent).not.toMatch(/saved|complete/i)
  })

  it('exports the newly selected payload and clears stale request status', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    render(<Work03Lab onExport={onExport} />)

    await user.click(screen.getByRole('button', {
      name: 'Download deterministic JSON',
    }))
    expect(screen.getByRole('status').textContent).toContain('Download requested')

    await user.selectOptions(select('Grammar profile'), 'RESOLVED')
    expect(screen.getByRole('status').textContent).toBe('')
    await user.click(screen.getByRole('button', {
      name: 'Download deterministic JSON',
    }))

    const expected = createWork03LabResult({
      ...DEFAULT_WORK03_LAB_SELECTION,
      profile: 'RESOLVED',
    })
    expect(onExport).toHaveBeenLastCalledWith(
      expected.exportFileName,
      expected.exportJson,
    )
    const json = onExport.mock.calls.at(-1)?.[1] as string
    expect(json).not.toContain('\n')
    expect(json).not.toMatch(
      /"(?:createdAt|timestamp|timeZone|locale|telemetry)"/,
    )
  })
})
