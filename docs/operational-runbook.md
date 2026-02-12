# Operational Runbook

This runbook defines how maintenance work is executed, from bug intake to release closure.

## 1) Trigger Conditions

Start this runbook when any of the following occurs:

- User-reported defect
- Regression in test/build/lint
- Bug found during feature work in core reading flows
- Incident in playback timing, mode switching, or saved-position behavior

## 2) Triage Workflow

1. Capture issue with reproducible steps, expected behavior, actual behavior, and environment.
2. Assign severity using the matrix below.
3. Check for duplicates and linked regressions.
4. Decide immediate action:
   - P0/P1: active fix now
   - P2/P3: queue in maintenance backlog

Severity matrix:

- P0: crash/data loss/unusable core flow -> immediate response
- P1: major degradation in core flow -> fix within 1-3 days
- P2: minor functional issue -> next available maintenance slot
- P3: polish/docs only -> batch with related work

## 3) Reproduction Standard

Every triaged bug should include:

- Minimal deterministic reproduction steps
- Affected mode(s): RSVP, saccade, prediction, recall
- Whether persisted state affects repro (localStorage/article position/settings)
- First known commit/version where issue appears (if known)

Use this template:

```md
### Repro
1. ...
2. ...

### Expected
...

### Actual
...

### Scope
- Modes:
- Browser/Electron:
- Data dependence (saved positions/settings):
```

## 4) Fix Protocol

1. Confirm root cause in code.
2. Write or update test that fails before the fix.
3. Implement minimal safe fix.
4. Refactor only if it reduces near-term defect risk.
5. Re-run tests and full gates.

Required gate commands:

```bash
bun run lint
bun run test:run
bun run build
```

If `electron/**` changed:

```bash
bun run electron:build
```

## 5) PR Checklist

- Issue linked
- Severity and impact stated
- Root cause written in PR description
- Regression test included (or explicit reason not possible)
- No unrelated refactor noise
- Quality gates pass

## 6) High-Risk Areas Checklist

When changes touch these areas, add focused verification notes:

- `src/hooks/useRSVP.ts` state/ref sync paths
- `src/hooks/usePlaybackTimer.ts` scheduling and pause/resume behavior
- `goToIndex` (clamped) versus `advanceSelfPaced` (allows completion index)
- Mode-switch retokenization and index mapping
- Prediction preview interval lifecycle in `src/components/PredictionReader.tsx`

## 7) Release and Closure

Before closing maintenance issue:

1. Verify bug no longer reproduces with original steps.
2. Confirm no new regressions in adjacent mode(s).
3. Update backlog status and severity board.
4. Add follow-up debt ticket if needed.

For emergency rollback:

1. Revert offending change in a new PR.
2. Re-run strict gates.
3. Ship rollback.
4. Re-open original issue with incident notes.

## 8) Backlog Hygiene Rules

- Keep P0 at zero
- Keep P1 at three or fewer
- Escalate any P1 older than 14 days
- Combine duplicate symptom reports under one root-cause ticket

## 9) Operational Artifacts

Maintain the following in each issue/PR:

- Repro block
- Root cause note
- Verification notes
- Preventive action (test/refactor/doc)
