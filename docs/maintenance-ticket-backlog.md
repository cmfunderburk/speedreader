# Maintenance Ticket Backlog (Initial 10)

Prioritized for reliability and code health, with emphasis on core hooks and timing behavior.

## MNT-001 - Add `useRSVP` regression test harness

- Priority: P1
- Effort: L
- Problem: `useRSVP` has high behavioral surface area and currently lacks dedicated tests.
- Scope: `src/hooks/useRSVP.ts`, new `src/hooks/useRSVP.test.ts`
- Acceptance criteria:
  - Covers load/reset/play/pause basics
  - Covers mode switch retokenization index mapping
  - Covers `goToIndex` clamp behavior
  - Covers `advanceSelfPaced` allowing completion index

## MNT-002 - Harden playback completion and persistence boundaries

- Priority: P1
- Effort: M
- Problem: completion and persistence updates can drift at edge indices.
- Scope: `src/hooks/useRSVP.ts`, `src/lib/storage.ts`, tests
- Acceptance criteria:
  - Position persistence verified at pause, periodic save, and completion
  - No out-of-range index persisted
  - Regression tests for last-chunk and empty-chunk edge cases

## MNT-003 - Expand `usePlaybackTimer` timing correctness tests

- Priority: P1
- Effort: M
- Problem: timer drift/min-delay behavior needs stronger guardrails.
- Scope: `src/hooks/usePlaybackTimer.test.ts`
- Acceptance criteria:
  - Tests for `minDelayFactor` clamping behavior
  - Tests for pause/resume expected-time reset behavior
  - Tests for `enabled` flip while playing

## MNT-004 - Validate ramp parameter boundaries and defaults

- Priority: P2
- Effort: M
- Problem: invalid ramp settings can produce unstable effective WPM.
- Scope: `src/hooks/useRSVP.ts`, `src/lib/rsvp.ts`, tests
- Acceptance criteria:
  - Ramp inputs are bounded and validated
  - Effective WPM never drops below safe minimum
  - Unit tests for extreme ramp values and elapsed time behavior

## MNT-005 - Add mode-switch race condition tests

- Priority: P1
- Effort: M
- Problem: rapid display mode changes can expose state/ref sync edge cases.
- Scope: new tests around `useRSVP` mode changes
- Acceptance criteria:
  - Rapid RSVP <-> saccade <-> prediction transitions do not break index state
  - Prediction position is preserved when leaving/re-entering prediction mode
  - No timer continues running when mode should be self-paced

## MNT-006 - Stabilize prediction preview interval lifecycle

- Priority: P2
- Effort: M
- Problem: preview interval behavior in prediction mode can regress silently.
- Scope: `src/components/PredictionReader.tsx` + tests
- Acceptance criteria:
  - Interval created once per preview start
  - Interval always cleaned on stop/unmount/mode exit
  - Regression test for double-start prevention

## MNT-007 - Extract and test index mapping utility

- Priority: P2
- Effort: M
- Problem: proportional index mapping is duplicated and easy to break.
- Scope: new utility in `src/lib`, update `useRSVP.ts`, tests
- Acceptance criteria:
  - Single shared mapping utility used for mode/mode-setting retokenization
  - Utility handles empty arrays and boundary rounding consistently
  - Property-style tests for monotonic mapping invariants

## MNT-008 - Introduce deterministic storage mocks for hook tests

- Priority: P2
- Effort: S
- Problem: persistence side effects are hard to assert consistently in tests.
- Scope: test utilities + hook tests
- Acceptance criteria:
  - Reusable storage mock helper available
  - Tests assert `updateArticlePosition` and prediction position writes deterministically
  - No flaky tests caused by persisted state leakage

## MNT-009 - Add CI workflow for strict merge gates

- Priority: P1
- Effort: S
- Problem: strict gates are policy but not yet automated in repository CI.
- Scope: `.github/workflows/ci.yml`
- Acceptance criteria:
  - Runs lint, tests, and build on PRs and main pushes
  - Failing job blocks merge
  - CI status visible in PR checks

## MNT-010 - Create playback debug diagnostics toggle

- Priority: P3
- Effort: M
- Problem: timing bugs are expensive to diagnose without structured instrumentation.
- Scope: `useRSVP`, `usePlaybackTimer`, optional dev-only logger
- Acceptance criteria:
  - Optional debug output for schedule duration, expected time, and index transitions
  - Disabled by default in normal usage
  - Documentation added for enabling diagnostics during bug triage

## Execution Order

Recommended first wave: MNT-001, MNT-003, MNT-002, MNT-005, MNT-009.
