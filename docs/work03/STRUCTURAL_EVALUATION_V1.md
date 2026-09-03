# Work 03 Structural Evaluation v1

- Protocol: `work03-structural-evaluation-v1`
- Grammar under test: `work03-music-grammar-v1`
- Baseline: `work02-melody-generator-v0` at repository baseline
  `1ed513a7733c1229d3bdca00f2058509597aa223`
- Status: pre-registered before the Grammar v1 generator implementation

This protocol tests declared musical structure. It does not measure listener
preference, emotional correctness, therapeutic effect, or universal musical
quality. No metric is combined into a universal quality score.

## Canonicalization

Validate an output before measuring it. Convert beats to integer ticks with the
grammar's `ticksPerBeat` and reject timing outside that grid. Use validated
`eventIndex` order. Counts and ticks remain integers. Ratios and entropy values
are rounded to six decimal places. A zero denominator produces `0`, never
`NaN`, infinity, or a missing field. Determinism comparison uses canonical JSON
with stable object-key ordering and no date, clock, performance, or locale data.

Unless a metric says otherwise, “notes” means sounding note events in order and
excludes rests. Pitch class is `((midi % 12) + 12) % 12`.

## Metrics

1. **Pitch-class diversity**
   - Count: number of unique sounding-note pitch classes.
   - Ratio: count divided by the declared pitch-collection size.

2. **Exact repetition ratio**
   - For each adjacent sounding-note pair after the first, compare the tuple
     `(midiNote, durationTicks)`.
   - Ratio is matching adjacent tuples divided by `max(1, noteCount - 1)`.
   - Rests do not hide repeated-note runs.

3. **Motif recurrence**
   - Seed length is the seed occurrence's sounding-note count and must be 2–5.
   - Count only non-seed occurrence records that independently validate as one
     of the declared transformations: exact repeat, rhythmic variation,
     constant contour transposition, final-note variation, or bounded
     inversion.
   - Occurrences must be chronological and non-overlapping, and their declared
     event indices must match actual events. A rationale code alone is not
     evidence. Every profile must produce 1–3 validated recurrences.

4. **Rhythmic diversity and entropy**
   - Diversity count is the number of unique sounding-note duration ticks.
   - Entropy is normalized Shannon entropy:
     `-sum(p(d) * log2(p(d))) / log2(K)`, where `K` is the grammar's declared
     rhythmic-vocabulary size. If `K <= 1`, the value is `0`.

5. **Rest ratio**
   - Sum of explicit rest-duration ticks divided by total timeline ticks.

6. **Phrase-length distribution**
   - Use consecutive differences of `[0, ...phraseEndTicks]`.
   - Report the exact ordered array plus minimum, maximum, and mean.
   - Ends must increase, align to event ends, and finish at total ticks. Every
     event belongs to exactly one phrase. Functions must follow
     opening → middle → middle → cadential.

7. **Large leaps**
   - Count adjacent sounding-note intervals whose absolute size is at least the
     frozen threshold of seven semitones.

8. **Unresolved leaps**
   - A large leap landing on note `i` is recovered only when note `i + 1`
     exists, moves in the opposite direction, and moves 1–4 semitones.
   - A terminal large leap is unresolved.
   - A forced-leap unit fixture and a mutation-negative test must show this
     metric is not vacuously zero.

9. **Register use**
   - Utilization is `(maximumUsedMidi - minimumUsedMidi) /
     max(1, grammarMaximumMidi - grammarMinimumMidi)`.
   - Also report the ratio of notes at either register boundary and the longest
     consecutive boundary-note run. The Work 03 maximum edge run is two.

10. **Contour agreement**
    - Work 03 declares exactly one representative source anchor for each
      `presentedOrder` 1–12. Multiple orders may deliberately share a note.
    - For adjacent orders whose target scale index changes, compare the sign of
      the anchor-note MIDI change with the sign of the target-index change.
    - Report agreements divided by eligible comparisons, or `0` if none.
      Cadence and recovery adjustments remain visible in this raw metric.

11. **Final stability**
    - Look up the final sounding note's pitch class relative to the declared
      tonic in the mode's frozen 12-entry stability table. The value is in
      `[0, 1]`; tonic is `1`.

12. **Event density**
    - Sounding-note onset count divided by total beats.
    - Also report sounding-note duration ticks divided by total ticks.

13. **Tonal-center drift**
    - Maximum circular pitch-class distance, 0–6 semitones, between each
      phrase's validated tonal center and the piece tonal center.
    - Grammar v1 expects zero. This is a guard, not an improvement axis.

14. **Additional entropy proxies**
    - Pitch-class entropy uses the declared pitch-collection size as `K`.
    - Interval-direction entropy uses the alphabet `{-1, 0, +1}`.
    - Both use the normalized formula and rounding rule above.

15. **Identical-run determinism**
    - Generate three independently constructed identical requests and report
      the number of unique canonical JSON results. The hard expected value is
      one.
    - A committed compact summary is also compared across supported Node 22
      and 24 CI runs when the branch is within CI scope.

## Frozen public fixture matrix

Existing public golden cases are loaded only through `expandGoldenCase()`:

- `same-deck-baseline`
- `all-left-fast-buttons`
- `all-right-same-deck-replay`
- `undo-and-reselect`
- `swipe-only`
- `mixed-button-and-swipe`
- `pause-and-resume`

Mathematical fixtures use Lightness `0.60`, Chroma `0.12`, and card IDs
`work03-math-v1:<fixture-id>:<01..12>`:

| Fixture | Hues | Directions |
|---|---|---|
| `asc-right` | `0,30,60,90,120,150,180,210,240,270,300,330` | `RRRRRRRRRRRR` |
| `desc-left` | `330,300,270,240,210,180,150,120,90,60,30,0` | `LLLLLLLLLLLL` |
| `wrap-alternating` | `0,359,1,180,181,179,90,270,45,225,135,315` | `LRLRLRLRLRLR` |
| `constant-blocks` | twelve `15` values | `LLLLLLRRRRRR` |
| `antipodal` | alternating `10,190` | `RLLRLLRLLRLL` |
| `narrow-wrap` | `359,1,3,5,7,9,11,13,15,17,19,21` | `LRRRLRRRLRRR` |
| `irregular` | `42,287,103,221,8,354,176,64,299,138,250,19` | `RLLRRLRLRLLR` |

Two additional direction-density fixtures immutably reuse public
`synthetic-deck-a` colors:

- `sparse-direction`: `LLLLRLLLLRLL`
- `dense-direction`: `RRRRLRRRRLRR`

These direction labels are grammar inputs, never descriptions of user emotion.

Run all 16 fixtures through all three existing interpretation methods. Generate
one Work 02 baseline for each fixture/method pair (48 outputs), then all six
Work 03 profiles (288 candidate outputs). Generate every candidate three times.
The candidate seed is exactly:

```text
work03-public-eval-v1|<fixtureId>|<method>|<profile>
```

Fixture metadata, undo events, input method, timing, and pause data are not
music inputs. A separate invariance test mutates those ignored fields and
requires identical expanded Work 03 input.

## Pre-registered hypotheses

- **H1 — Form:** every candidate has exactly four valid phrases; the baseline
  comparison view has one 12-beat unplanned span.
- **H2 — Motif:** every candidate has a 2–5-note seed and 1–3 independently
  validated recurrences. The baseline has no declared or verified planned
  motif.
- **H3 — Repetition/rhythm:** on `asc-right`, `constant-blocks`,
  `sparse-direction`, and `dense-direction`, both `BALANCED_LYRICAL` and
  `RESOLVED` have rhythmic-diversity count at least two. On `constant-blocks`,
  their exact-repetition ratio is strictly below the paired baseline.
- **H4 — Leap recovery:** every candidate has zero unresolved large leaps. On
  `antipodal` or `irregular`, at least one paired candidate is strictly below
  its baseline, proving a non-vacuous comparative change.
- **H5 — Cadence:** `RESOLVED` final stability is at least the paired baseline
  for every pair and strictly greater wherever the baseline is below one.
  `RESOLVED` is strictly more stable than `OPEN_ENDED` for every fixture/method.
  `OPEN_ENDED` still has no terminal unresolved leap.
- **H6 — Profiles:** for every fixture/method,
  `restRatio(CALM_SPARSE) > restRatio(PULSING)` and
  `eventDensity(PULSING) > eventDensity(CALM_SPARSE)`. All profiles pass the
  same hard validators.
- **H7 — Contour/register safety:** raw contour agreement is no more than
  one missed eligible transition below its paired Work 02 baseline, expressed
  as `allowedDrop = 1 / max(1, eligibleContourComparisons)`. Profile
  register-utilization bands and edge-run caps pass, and tonal-center drift is
  zero.

Greater pitch diversity or entropy is not inherently better. Those values are
reported but are not improvement hypotheses.

## Verdict rule

`MUSICAL_STRUCTURE_IMPROVED = SUPPORTED` only when all hard gates pass and all
H1–H7 pass exactly. Hard gates are output validity, identical-run determinism,
public/private boundary, unchanged Work 02 snapshot behavior, and the Work 03
audio-adapter contract.

`MIXED` applies when every hard gate passes and at least one, but not all,
hypotheses pass. `NOT_SUPPORTED` applies when a hard gate fails, no hypothesis
passes, the comparison report is absent, or this fixture/policy set changes
without a new evaluation-protocol version.

Even `SUPPORTED` means only that these pre-registered deterministic structural
hypotheses hold on this public synthetic matrix. It does not establish perceived
coherence, pleasantness, emotional correctness, or production readiness.
`PRODUCTION_REPLACEMENT_RECOMMENDED` remains `NO` for Work 03.
