# Work 03 Structural Comparison Report v1

## Outcome

This report compares the unchanged Work 02 deterministic melody baseline with
the isolated Work 03 bounded music grammar. It measures declared structure;
it does not measure listener preference, emotional correctness, therapeutic
effect, or universal musical quality.

```text
GRAMMAR_V1 = PASS
DETERMINISM = PASS
WORK02_COMPATIBILITY = PASS
MUSICAL_STRUCTURE_IMPROVED = MIXED
PRODUCTION_REPLACEMENT_RECOMMENDED = NO
```

All five executable hard gates passed and six of seven pre-registered
structural hypotheses passed. H7 failed because recurrent 2–5-note motifs did
not preserve Work 02's one-note-per-source raw contour agreement within the
registered tolerance in 234 of 288 candidates. That negative result is retained
instead of tuning the generator or evaluation after the comparison.

## Authority and isolation

- Repository: `EnterGeek/Haruhan-eum-public`
- Verified base: `1ed513a7733c1229d3bdca00f2058509597aa223`
- Branch: `lab/work03-music-grammar-v1`
- Milestone 2 implementation commit:
  `680acd7ca0588648318e7cbffc9d16daa9cf1a39`
- Grammar implementation and lab live only under `src/work03/` plus the
  standalone `/work03-lab.html` entry.
- Production `src/App.tsx`, Work 02 behavior, golden expected outputs,
  workflows, deployment, and external services are unchanged.

## Version chain

| Boundary | Version |
|---|---|
| Compatible input | `work02-flow-interpretation-v2` |
| Music grammar | `work03-music-grammar-v1` |
| Melody output | `work03-melody-output-v1` |
| Generator | `work03-grammar-generator-v1` |
| Deterministic choice | `work03-choice-fnv1a32-v1` |
| Grammar trace | `work03-grammar-trace-v1` |
| Diagnostics | `work03-structural-diagnostics-v1` |
| Structural metrics | `work03-structural-metrics-v1` |
| Evaluation | `work03-structural-evaluation-v1` |
| Audio adapter | `work03-audio-adapter-v1` |
| Audio schedule | `work03-audio-schedule-v1` |
| Lab export | `work03-lab-export-v1` |

The Work 03 output and schedule are new contracts. They are never relabelled as
Work 02 output or schedule versions.

## Profiles

| Profile | Density | Motif notes | Rest target | Syncopation cap | Closure | Tempo | Allowed modes |
|---|---:|---:|---:|---:|---|---:|---|
| `CALM_SPARSE` | sparse | 2 | 0.25 | 1 | moderate | 72 | major/minor pentatonic |
| `BALANCED_LYRICAL` | balanced | 3 | 0.10 | 2 | moderate | 80 | major pentatonic, dorian |
| `PULSING` | dense | 5 | 0.05 | 4 | moderate | 88 | mixolydian, minor pentatonic |
| `RESTLESS_CONTOUR` | dense | 5 | 0 | 5 | open | 92 | dorian, minor pentatonic |
| `OPEN_ENDED` | balanced | 3 | 0.15 | 3 | open | 76 | dorian, mixolydian |
| `RESOLVED` | balanced | 3 | 0.05 | 2 | strong | 78 | major/minor pentatonic |

These are bounded product-grammar choices, not user-state or psychological
labels. Every profile crosses the same strict request and output validators.

## Rule hierarchy

1. **Input boundary** — accept only an exact, reproducible official Work 02
   `FlowInterpretation`; reject unknown fields and malformed derived values.
2. **Tonal frame** — select a seeded tonic and one profile-allowed frozen
   pitch collection; constrain every note to MIDI 55–79 unless the caller
   narrows the register.
3. **Motif** — construct a profile-sized 2–5-note seed and four verified
   occurrences: seed, exact repeat, rhythmic variation or bounded contour
   transposition, and final-note variation.
4. **Phrase/form** — emit four contiguous three-beat phrases with
   `antecedent, antecedent, consequent, consequent` relationships and
   `opening, middle, middle, cadential` functions.
5. **Rhythm/rests** — use a finite half-beat-grid vocabulary containing only
   0.5, 1, 1.5, and 2 beat events; rests are explicit first-class events;
   syncopation and total event counts are capped.
6. **Contour/register** — derive source anchors from the chosen Work 02
   contour, apply deterministic in-register pitch selection, avoid register
   edge trapping, and keep ordinary generated intervals below seven semitones.
7. **Leap rule** — reject unresolved leaps at or above seven semitones; a
   forced unit fixture proves deterministic opposite-direction 1–4-semitone
   recovery. Ordinary candidates currently avoid large leaps instead of using
   recovery.
8. **Cadence/tension/density** — apply a grammar-local numeric tension proxy,
   profile density, and frozen final-stability hierarchy. `RESOLVED` ends on
   the tonic; `OPEN_ENDED` ends on a stable, non-tonic degree.
9. **Validation/provenance** — validate transformation algebra, timing,
   cadence, range, source anchors, complete presented-order coverage,
   deterministic rationale codes, and finite diagnostics before return.
10. **Audio projection** — validate again, omit rests while preserving absolute
    timing, and map every sounding event exactly once into the separately
    versioned Work 03 schedule.

## Evaluation matrix

| Executed item | Count | Result |
|---|---:|---|
| Public fixtures | 16 | exact frozen set |
| Interpretation methods | 3 | absolute, relative, hybrid |
| Work 02 baseline rows | 48 | validated |
| Work 03 profile candidates | 288 | validated |
| Independent Work 03 generations | 864 | validated |
| Validated Work 03 audio schedules | 864 | validated |
| Input/interpretation non-mutation checks | 1,824 | 0 failures |
| Unique canonical results per three identical runs | 1 | all 288 candidates |

The fixture set contains all seven existing public golden sessions, seven
mathematical contour/direction fixtures, and two direction-density fixtures.
It explicitly includes all-left, all-right, alternating, wrap, antipodal,
irregular, undo/reselect-expanded, sparse-direction, and dense-direction cases.
Fixture time, time zone, source filename, input modality, pause data, and undo
history are excluded from music input; a mutation-invariance test proves those
ignored fields do not alter the expanded input or generated result.

## Aggregate metrics

All values below are arithmetic means across the 48 rows for that baseline or
profile. They are diagnostics, not a combined score. Full min/max/mean data and
all 336 rows are emitted by `npm run report:work03` as deterministic JSON.

| Baseline/profile | Pitch classes | Exact repeat | Motif recurrences | Rhythm diversity | Rest ratio | Unresolved leaps | Register use | Contour agreement | Final stability | Onset density |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Work 02 baseline | 3.895833 | 0.246212 | 0 | 1.75 | 0.223958 | 1.833333 | 0.638021 | 0.853399 | 0.557292 | 1.000000 |
| `CALM_SPARSE` | 2.666667 | 0.047619 | 3 | 2 | 0.250000 | 0 | 0.161458 | 0.217750 | 0.795833 | 0.666667 |
| `BALANCED_LYRICAL` | 2.666667 | 0.181818 | 3 | 3 | 0.125000 | 0 | 0.155382 | 0.359163 | 0.879167 | 1.000000 |
| `PULSING` | 3.229167 | 0.253289 | 3 | 2 | 0 | 0 | 0.223090 | 0.476791 | 0.814583 | 1.666667 |
| `RESTLESS_CONTOUR` | 4.083333 | 0.246711 | 3 | 2 | 0 | 0 | 0.286458 | 0.467182 | 0.475000 | 1.666667 |
| `OPEN_ENDED` | 2.479167 | 0.181818 | 3 | 2 | 0.166667 | 0 | 0.129340 | 0.399961 | 0.427083 | 1.000000 |
| `RESOLVED` | 2.687500 | 0.181818 | 3 | 3 | 0.041667 | 0 | 0.163194 | 0.398079 | 1.000000 | 1.000000 |

| Baseline/profile | Rhythm entropy | Large leaps | Edge-hit ratio | Maximum edge run | Sounding ratio | Max tonal drift | Pitch entropy | Direction entropy | Phrase ticks |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Work 02 baseline | 0.326983 | 1.937500 | 0.090278 | 12 | 0.776042 | 0 | 0.705909 | 0.694867 | 24 |
| `CALM_SPARSE` | 0.271782 | 0 | 0 | 0 | 0.750000 | 0 | 0.540601 | 0.719107 | 6/6/6/6 |
| `BALANCED_LYRICAL` | 0.662506 | 0 | 0 | 0 | 0.875000 | 0 | 0.461967 | 0.985681 | 6/6/6/6 |
| `PULSING` | 0.360964 | 0 | 0 | 0 | 1.000000 | 0 | 0.573606 | 0.927089 | 6/6/6/6 |
| `RESTLESS_CONTOUR` | 0.360964 | 0 | 0 | 0 | 1.000000 | 0 | 0.689519 | 0.938969 | 6/6/6/6 |
| `OPEN_ENDED` | 0.459148 | 0 | 0 | 0 | 0.833333 | 0 | 0.400378 | 0.988295 | 6/6/6/6 |
| `RESOLVED` | 0.692216 | 0 | 0 | 0 | 0.958333 | 0 | 0.511071 | 0.985246 | 6/6/6/6 |

Work 03 deliberately trades some raw source-contour tracking and register span
for recurrent motif identity, bounded form, cadence, and interval safety. The
table does not imply that lower or higher diversity, entropy, density, or rest
ratio is inherently better.

## Hard gates

| Gate | Evaluated checks | Failed | Result |
|---|---:|---:|---|
| Output validity and input immutability | 2,688 | 0 | PASS |
| Identical-run determinism | 288 | 0 | PASS |
| Public fixture/input boundary | 17 | 0 | PASS |
| Work 02 runtime contract/version chain | 48 | 0 | PASS |
| Work 03 audio adapter contract | 864 | 0 | PASS |

The Work 02 gate inside the report validates the frozen runtime contract and
version chain. Repository-wide unchanged behavior is separately covered by the
full Work 02 regression suite and Git diff review; it is not inferred from the
report alone.

## Hypotheses

| Hypothesis | Failed / evaluated | Result |
|---|---:|---|
| H1 — Four-phrase form versus one baseline span | 0 / 336 | PASS |
| H2 — Bounded, independently validated motif recurrence | 0 / 336 | PASS |
| H3 — Registered repetition/rhythm conditions | 0 / 30 | PASS |
| H4 — No unresolved leaps plus non-vacuous baseline improvement | 0 / 289 | PASS |
| H5 — Resolved/open cadence hierarchy | 0 / 144 | PASS |
| H6 — Sparse/dense profile separation | 0 / 96 | PASS |
| H7 — Contour and register safety | 234 / 288 | FAIL |

H7 failures by profile are 40 `CALM_SPARSE`, 39 each for
`BALANCED_LYRICAL`, `PULSING`, `OPEN_ENDED`, and `RESOLVED`, and 38
`RESTLESS_CONTOUR`. By interpretation method they are 85 absolute, 66
relative, and 83 hybrid cases. Register utilization remained finite in `[0,1]`,
edge-run caps passed, and tonal-center drift was zero; the failing component was
the raw contour-agreement tolerance.

## Audio compatibility

`createWork03AudioSchedule()` reuses the Work 02 scheduled-note shape,
frequency conversion, and immutable playback-profile values while retaining
truthful Work 03 contract versions and source profile/seed provenance. Rests are
omitted from oscillator notes but preserve their absolute timeline positions.
Every one of the 864 independent schedules passed standalone validation and
exact source-result projection checks.

The existing Work 02 player rejects Work 03 schedule versions by design.
The standalone Work 03 lab therefore displays validated schedule evidence but
does not expose a Play button. This report is not browser, audible, speaker,
headphone, or physical-device playback proof.

## Validation evidence

| Scope | Command/evidence | Result |
|---|---|---|
| Default Node 24 gate | `npm run check` on Node 24.17.0 | 531 passed, 2 intentional stress skips; TypeScript and four-entry Vite build passed |
| Nightly paths | `HARUHAN_STRESS=1 npm test` | 533 passed, 0 skipped, including 10,000 deck seeds and 256 grammar seeds × 6 profiles × 2 replays |
| Node 22 gate | Node 22.23.2 running Vitest, `tsc -b`, and Vite directly | 531 passed, 2 intentional stress skips; typecheck and build passed |
| Work 03 production entry | Vite output | `dist/work03-lab.html` plus isolated Work 03 assets emitted |
| Desktop render | in-app Chromium, 1440×1000 | 1,425 CSS-pixel client/document width, no page overflow, 3 control columns, 4 phrase columns |
| Phone render | in-app Chromium, 390×844 | 375 CSS-pixel client/document width, no page overflow, 1-column controls/phrases, focusable trace overflow region |
| Dynamic render | `irregular` / `relative-hue` / `OPEN_ENDED` | selectors, seed, model, schedule, and export filename updated together |
| Browser diagnostics | console warning/error capture | none |

The rendered audit is local Chromium evidence only. It is not WebKit, audible,
speaker/headphone, physical-device, accessibility-certification, or production
deployment evidence.

## Deterministic report reproduction

```bash
npm ci
npm run check
npm run report:work03
```

The compact report JSON was generated independently under Node `v22.23.2` and
Node `v24.17.0`:

| Runtime | UTF-8 bytes | SHA-256 |
|---|---:|---|
| Node 22.23.2 | 333,477 | `add44df5b5194402e2a64ba6d96528edf73e41b12a2092f6b53461e4cf30a1fb` |
| Node 24.17.0 | 333,477 | `add44df5b5194402e2a64ba6d96528edf73e41b12a2092f6b53461e4cf30a1fb` |

This is byte-identical local evidence for the report harness. Branch-scoped
remote CI is not claimed because the existing workflow push filters do not
include `lab/work03-music-grammar-v1`, and no workflow dispatch was authorized.

## Musical and evidentiary limitations

- The grammar proves bounded deterministic structure, not perceived coherence,
  pleasantness, novelty, expressiveness, or emotional fit.
- H7 shows that motif recurrence currently loses substantial raw contour
  fidelity relative to the one-note-per-source Work 02 baseline.
- Normal candidates avoid large leaps. Recovery is executable and unit-tested,
  but is not exercised by ordinary generation in this version.
- Tonal choice and color-to-music mappings are explicit product grammar choices,
  not objective color meaning or user diagnosis.
- No copyrighted melody corpus, MIDI scrape, private regression input, ML,
  generative-AI runtime, external API, upload, or telemetry is used.
- Automated DOM semantics and responsive rendering do not constitute listening
  evidence, physical-device proof, user research, or production readiness.

## Next experiment

The next bounded experiment should target the measured H7 trade-off without
weakening motif validation: derive a phrase-level contour envelope from the
twelve source anchors, then select only transformation candidates that preserve
motif identity *and* improve anchor-direction agreement. Freeze a Pareto-style
protocol before implementation, reporting motif recurrence and contour
agreement separately rather than combining them into a quality score. Include
ordinary generated large-leap/recovery cases only in a separately versioned
profile so leap recovery becomes non-vacuous without destabilizing every
candidate. A later listening study or Work 03-native audio renderer requires a
separate authorization and evidence plan.
