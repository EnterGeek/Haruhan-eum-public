import { useMemo, useState } from 'react'
import type { StructuralMetrics } from '../evaluation/types'
import type { GrammarMelodyOutput } from '../grammar/types'
import {
  DEFAULT_WORK03_LAB_SELECTION,
  WORK03_LAB_FIXTURE_IDS,
  WORK03_LAB_METHODS,
  WORK03_LAB_PROFILE_IDS,
  createWork03LabResult,
  type Work03LabSelection,
} from './model'

const METHOD_LABELS: Readonly<Record<Work03LabSelection['method'], string>> = {
  'absolute-hue': 'A · Absolute Hue',
  'relative-hue': 'B · Relative Hue',
  hybrid: 'C · Hybrid',
}

type MetricKey = Exclude<keyof StructuralMetrics, 'version'>

const METRIC_ROWS: readonly Readonly<{ key: MetricKey; label: string }>[] = [
  { key: 'pitchClassDiversityCount', label: 'Pitch-class diversity · count' },
  { key: 'pitchClassDiversityRatio', label: 'Pitch-class diversity · ratio' },
  { key: 'pitchClassEntropy', label: 'Pitch-class entropy proxy' },
  { key: 'exactRepetitionRatio', label: 'Exact repetition ratio' },
  { key: 'motifLength', label: 'Motif length' },
  { key: 'motifRecurrenceCount', label: 'Motif recurrence count' },
  { key: 'rhythmicDiversityCount', label: 'Rhythmic diversity · count' },
  { key: 'rhythmicEntropy', label: 'Rhythmic entropy proxy' },
  { key: 'restRatio', label: 'Rest ratio' },
  { key: 'phraseCount', label: 'Phrase count' },
  { key: 'phraseLengthTicks', label: 'Phrase lengths · ticks' },
  { key: 'phraseLengthMinimumTicks', label: 'Phrase length · minimum ticks' },
  { key: 'phraseLengthMaximumTicks', label: 'Phrase length · maximum ticks' },
  { key: 'phraseLengthMeanTicks', label: 'Phrase length · mean ticks' },
  { key: 'largeLeapCount', label: 'Large leap count' },
  { key: 'unresolvedLeapCount', label: 'Unresolved leap count' },
  { key: 'registerUtilization', label: 'Register utilization' },
  { key: 'edgeHitRatio', label: 'Register edge-hit ratio' },
  { key: 'longestEdgeRun', label: 'Longest register-edge run' },
  { key: 'contourAgreement', label: 'Contour agreement' },
  { key: 'eligibleContourComparisons', label: 'Eligible contour comparisons' },
  { key: 'finalStability', label: 'Final stability' },
  { key: 'eventDensity', label: 'Sounding event density' },
  { key: 'soundingRatio', label: 'Sounding timeline ratio' },
  { key: 'tonalCenterDrift', label: 'Tonal-center drift' },
  { key: 'intervalDirectionEntropy', label: 'Interval-direction entropy proxy' },
]

export type Work03LabExportHandler = (
  fileName: string,
  json: string,
) => void

export interface Work03LabProps {
  initialSelection?: Readonly<Work03LabSelection>
  onExport?: Work03LabExportHandler
}

const formatMetric = (value: StructuralMetrics[MetricKey]): string =>
  Array.isArray(value) ? value.join(' · ') : String(value)

const noteCount = (output: { events: readonly { kind: string }[] }): number =>
  output.events.filter((event) => event.kind === 'note').length

const restCount = (output: { events: readonly { kind: string }[] }): number =>
  output.events.filter((event) => event.kind === 'rest').length

const directionMark = (direction: 'left' | 'right'): string =>
  direction === 'left' ? 'L' : 'R'

const downloadJson = (fileName: string, json: string): void => {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function MetricTable({
  baseline,
  grammarV1,
}: {
  baseline: StructuralMetrics
  grammarV1: StructuralMetrics
}) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      aria-label="Scrollable structural metrics comparison"
    >
      <table className="metric-table">
        <caption>
          Deterministic structural diagnostics — not a universal musical-quality score
        </caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Work 02 baseline</th>
            <th scope="col">Work 03 Grammar v1</th>
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map(({ key, label }) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td><code>{formatMetric(baseline[key])}</code></td>
              <td><code>{formatMetric(grammarV1[key])}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PhraseAndMotif({ output }: { output: GrammarMelodyOutput }) {
  return (
    <section className="panel" aria-labelledby="phrase-motif-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Bounded form</p>
          <h2 id="phrase-motif-title">Phrase and motif plan</h2>
        </div>
        <code>{output.motif.seedRhythmCellId}</code>
      </div>

      <dl className="summary-list summary-list--three">
        <div><dt>Seed notes</dt><dd>{output.motif.seedEventCount}</dd></div>
        <div><dt>Occurrences</dt><dd>{output.motif.occurrences.length}</dd></div>
        <div><dt>Scale steps</dt><dd><code>{output.motif.seedScaleSteps.join(' · ')}</code></dd></div>
      </dl>

      <div className="phrase-grid">
        {output.phrases.map((phrase) => {
          const occurrence = output.motif.occurrences.find(
            (candidate) => candidate.phraseIndex === phrase.phraseIndex,
          )
          return (
            <article key={phrase.phraseIndex} className="phrase-card">
              <h3>Phrase {phrase.phraseIndex + 1}</h3>
              <dl>
                <div><dt>Function</dt><dd>{phrase.function}</dd></div>
                <div><dt>Relationship</dt><dd>{phrase.relationship}</dd></div>
                <div><dt>Beats</dt><dd>{phrase.startBeat}–{phrase.endBeat}</dd></div>
                <div><dt>Transformation</dt><dd>{occurrence?.transformation ?? '—'}</dd></div>
              </dl>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function Work03Lab({
  initialSelection = DEFAULT_WORK03_LAB_SELECTION,
  onExport,
}: Work03LabProps) {
  const [fixtureId, setFixtureId] = useState(initialSelection.fixtureId)
  const [method, setMethod] = useState(initialSelection.method)
  const [profile, setProfile] = useState(initialSelection.profile)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const lab = useMemo(() => createWork03LabResult({
    fixtureId,
    method,
    profile,
  }), [fixtureId, method, profile])
  const output = lab.grammarV1.result.melodyOutput
  const trace = lab.grammarV1.result.grammarTrace
  const diagnostics = lab.grammarV1.result.diagnostics
  const schedule = lab.grammarV1.audioSchedule
  const passedChecks = diagnostics.checks.filter((check) => check.passed).length

  const exportResult = () => {
    const handler = onExport ?? downloadJson
    handler(lab.exportFileName, lab.exportJson)
    setExportStatus(`Download requested: ${lab.exportFileName}`)
  }

  return (
    <main className="work03-lab-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">HARUHAN-EUM · Work 03</p>
          <h1>Deterministic Music Grammar Lab</h1>
          <p id="lab-boundary" className="boundary-copy">
            Independent R&amp;D only. Structural metrics are diagnostics, not a
            universal quality score, emotional reading, or psychological diagnosis.
          </p>
        </div>
        <span className="status-chip">PUBLIC FIXTURES ONLY</span>
      </header>

      <section className="panel controls-panel" aria-labelledby="controls-title">
        <fieldset aria-describedby="lab-boundary">
          <legend id="controls-title">Deterministic comparison controls</legend>
          <div className="control-grid">
            <label>
              Public fixture
              <select
                id="work03-fixture"
                value={fixtureId}
                onChange={(event) => {
                  setExportStatus(null)
                  setFixtureId(event.target.value as Work03LabSelection['fixtureId'])
                }}
              >
                {WORK03_LAB_FIXTURE_IDS.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            <label>
              Interpretation method
              <select
                id="work03-method"
                value={method}
                onChange={(event) => {
                  setExportStatus(null)
                  setMethod(event.target.value as Work03LabSelection['method'])
                }}
              >
                {WORK03_LAB_METHODS.map((id) => (
                  <option key={id} value={id}>{METHOD_LABELS[id]}</option>
                ))}
              </select>
            </label>
            <label>
              Grammar profile
              <select
                id="work03-profile"
                value={profile}
                onChange={(event) => {
                  setExportStatus(null)
                  setProfile(event.target.value as Work03LabSelection['profile'])
                }}
              >
                {WORK03_LAB_PROFILE_IDS.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <p className="selection-status" aria-live="polite">
          Comparing <code>{fixtureId}</code> · {METHOD_LABELS[method]} · <code>{profile}</code>
        </p>
      </section>

      <section className="comparison-grid" aria-label="Work 02 and Work 03 summaries">
        <article className="panel comparison-card comparison-card--baseline">
          <p className="eyebrow">Control</p>
          <h2>Work 02 baseline</h2>
          <dl className="summary-list">
            <div><dt>Generator</dt><dd><code>{lab.baseline.melodyOutput.versions.generator}</code></dd></div>
            <div><dt>Events / notes / rests</dt><dd>{lab.baseline.melodyOutput.events.length} / {noteCount(lab.baseline.melodyOutput)} / {restCount(lab.baseline.melodyOutput)}</dd></div>
            <div><dt>Timeline</dt><dd>{lab.baseline.melodyOutput.totalBeats} beats</dd></div>
          </dl>
        </article>

        <article className="panel comparison-card comparison-card--grammar">
          <p className="eyebrow">Candidate</p>
          <h2>Work 03 Grammar v1</h2>
          <dl className="summary-list">
            <div><dt>Generator</dt><dd><code>{output.versions.generator}</code></dd></div>
            <div><dt>Profile / tonal frame</dt><dd><code>{output.grammar.profile}</code> · {output.grammar.tonalFrame.mode} · tonic MIDI {output.grammar.tonalFrame.tonicMidi}</dd></div>
            <div><dt>Events / notes / rests</dt><dd>{output.events.length} / {noteCount(output)} / {restCount(output)}</dd></div>
            <div><dt>Diagnostics</dt><dd>{passedChecks}/{diagnostics.checks.length} passed · {diagnostics.warnings.length} warnings</dd></div>
          </dl>
        </article>
      </section>

      <section className="panel" aria-labelledby="metrics-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Measured structure</p>
            <h2 id="metrics-title">Baseline comparison</h2>
          </div>
          <code>{lab.grammarV1.metrics.version}</code>
        </div>
        <MetricTable
          baseline={lab.baseline.metrics}
          grammarV1={lab.grammarV1.metrics}
        />
      </section>

      <PhraseAndMotif output={output} />

      <section className="panel" aria-labelledby="trace-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Deterministic rationale codes</p>
            <h2 id="trace-title">Grammar trace</h2>
          </div>
          <code>{trace.version}</code>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          aria-label="Scrollable deterministic grammar trace"
        >
          <table className="trace-table">
            <caption>Ordered Grammar v1 decision trace</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Stage</th>
                <th scope="col">Rationale code</th>
                <th scope="col">Source orders</th>
                <th scope="col">Values</th>
              </tr>
            </thead>
            <tbody>
              {trace.entries.map((entry) => (
                <tr key={entry.sequence}>
                  <td>{entry.sequence}</td>
                  <td>{entry.stage}</td>
                  <td><code>{entry.code}</code></td>
                  <td><code>{entry.sourcePresentedOrders.join(' · ') || '—'}</code></td>
                  <td><code>{JSON.stringify(entry.values)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel schedule-panel" aria-labelledby="schedule-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Validated projection</p>
            <h2 id="schedule-title">Audio schedule compatibility</h2>
          </div>
          <span className="validation-chip">SOURCE-CHECKED</span>
        </div>
        <dl className="summary-list summary-list--three">
          <div><dt>Schedule / adapter</dt><dd><code>{schedule.versions.scheduleContract}</code><br /><code>{schedule.versions.adapter}</code></dd></div>
          <div><dt>Source grammar</dt><dd><code>{schedule.versions.melodyOutputContract}</code><br /><code>{schedule.versions.musicGrammar}</code></dd></div>
          <div><dt>Timeline</dt><dd>{schedule.tempoBpm} BPM · {schedule.totalBeats} beats · {schedule.totalDurationSeconds}s</dd></div>
          <div><dt>Projected notes</dt><dd>{schedule.notes.length} one-to-one source notes</dd></div>
          <div><dt>Playback profile</dt><dd><code>{schedule.versions.playbackProfile}</code></dd></div>
          <div><dt>Source seed</dt><dd><code>{schedule.source.seed}</code></dd></div>
        </dl>
        <p className="boundary-copy">
          Playback is intentionally omitted: no truthful Work03-compatible player
          is part of this isolated lab. Schedule validation does not claim audible,
          browser, or device playback evidence.
        </p>
      </section>

      <section className="panel export-panel" aria-labelledby="export-title">
        <div>
          <p className="eyebrow">Reproducible artifact</p>
          <h2 id="export-title">Compact deterministic JSON</h2>
          <p>
            Minified public-fixture replay data only. No time, locale, upload,
            telemetry, or private-session fields are added.
          </p>
          <code>{lab.exportFileName}</code>
        </div>
        <button type="button" onClick={exportResult}>
          Download deterministic JSON
        </button>
        <p className="export-status" role="status" aria-live="polite" aria-atomic="true">
          {exportStatus ?? ''}
        </p>
      </section>

      <footer>
        <span>Directions: <code>{lab.directions.map(directionMark).join(' ')}</code></span>
        <span>Seed: <code>{lab.seed}</code></span>
      </footer>
    </main>
  )
}
