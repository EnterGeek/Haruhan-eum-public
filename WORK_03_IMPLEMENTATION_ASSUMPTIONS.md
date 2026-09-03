# Work 03 — Deterministic Music Grammar v1 Assumptions

Work 03 is isolated research. It does not select a production mapping, replace
Work 02, or assign psychological meaning to a color or selection direction.

## Contract boundary

TEMPORARY EXPERIMENT ASSUMPTION

- Input remains `work02-flow-interpretation-v2`.
- The grammar contract is `work03-music-grammar-v1`.
- Output is explicitly versioned as `work03-melody-output-v1`; it does not
  pretend to be the existing `work02-melody-output-v2` contract.
- The generator, trace, diagnostics, and audio adapter have independent Work 03
  versions. Work 02 version constants and validators remain unchanged.
- Structural metrics and the verdict rule are frozen before generator work in
  `docs/work03/STRUCTURAL_EVALUATION_V1.md`.

This boundary is necessary because Work 02 deliberately accepts one fixed
major-pentatonic grammar and one fixed generator version. Work 03 needs phrase,
motif, profile, mode, and cadence metadata that Work 02 does not contain.

## Bounded form

TEMPORARY EXPERIMENT ASSUMPTION

- The timeline remains 12 beats but uses four 3-beat research phrases in 3/4.
- The timing grid is two ticks per beat; timings outside that half-beat grid are
  invalid.
- A seed motif contains 2–5 events.
- Durations remain in the finite vocabulary `0.5`, `1`, `1.5`, and `2` beats.
- Output contains at most 20 events.
- A caller-provided event cap must still contain four full occurrences of the
  selected profile's 2–5-event motif; irreconcilable combinations are rejected
  instead of silently weakening the profile.
- The default research register is MIDI 55–79 and callers may only narrow it
  while retaining at least one octave.
- The default maximum melodic leap is seven semitones and callers may only
  reduce it to 2–7 semitones.
- A seven-semitone-or-larger leap requires an opposite-direction recovery of
  one to four semitones on the following sounding note; a terminal large leap
  is unresolved.
- No more than two consecutive notes may remain on a register boundary.
- A profile owns the maximum syncopation budget. A caller may reduce, but not
  widen, that budget.

The values are grammar choices for falsifiable structural experiments, not
claims about universal musical quality.

## Tonal frame

TEMPORARY EXPERIMENT ASSUMPTION

The finite mode vocabulary is major pentatonic, minor pentatonic, Dorian, and
Mixolydian. Profile and seed may select among the modes explicitly allowed by a
profile. This is a deterministic product-grammar choice; it is not an inference
that a color, direction, or person has an objectively correct musical mode.

## Profiles

`CALM_SPARSE`, `BALANCED_LYRICAL`, `PULSING`, `RESTLESS_CONTOUR`,
`OPEN_ENDED`, and `RESOLVED` are arrangement profiles. Their names describe
output behavior only. They are not emotion, personality, mental-health, or
user-state diagnoses. Profiles adjust bounded weights and limits and never
bypass input or output validation.

## Trace and diagnostics

`grammarTrace` contains stable rationale codes plus JSON-safe scalar values.
It does not contain generated explanations or claims about why the user made a
selection. Structural diagnostics are measurements and constraint checks, not
a universal quality score.

## Rejection conditions

Revise or discard this grammar if deterministic replay fails, Work 02 contracts
change as a side effect, bounded fixtures produce invalid timing/MIDI/provenance,
or the declared structural metrics do not distinguish the grammar from the
Work 02 baseline on the frozen public evaluation cases.
