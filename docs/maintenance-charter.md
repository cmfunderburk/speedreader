# Maintenance Charter

## Objective

Shift the project to a maintenance-first operating model that improves reliability and code health without freezing feature progress.

## Operating Model

- Phase type: rolling ongoing (no fixed end date)
- Capacity split: 80% maintenance, 20% feature work
- Planning style: ad hoc intake, event-driven execution
- Core technical focus: playback hooks and timing paths (`useRSVP`, `usePlaybackTimer`, mode-switch boundaries)

## Scope

In scope:

- Defect reduction and regression prevention
- Test hardening for high-risk logic
- Refactors that lower complexity in hook/timer orchestration
- Documentation for triage, release, and maintenance flow

Out of scope unless explicitly prioritized:

- New mode development
- Visual redesign work not tied to defects
- Broad architecture rewrites without a reliability trigger

## Primary KPI

Primary metric: open bug backlog by severity.

Target backlog caps:

- P0: 0 open
- P1: 3 open or fewer
- P2: 12 open or fewer

Aging targets:

- P0: same day resolution or rollback
- P1: no item older than 14 days
- P2: no item older than 45 days

## Severity Definitions

- P0: crash, data loss/corruption, cannot read, or blocked core workflow
- P1: major workflow degradation with workaround or intermittent failure
- P2: minor functional defect with low risk and clear workaround
- P3: cosmetic/documentation issue not affecting core behavior

## Merge Quality Gates (Strict)

All maintenance and feature PRs must pass before merge:

```bash
bun run lint
bun run test:run
bun run build
```

Additional gate when `electron/**` is touched:

```bash
bun run electron:build
```

Policy:

- No bypass of failing checks
- No known flaky test accepted as pass
- Bug fixes in core paths require a regression test unless technically impossible (must be documented in PR)

## Intake and Prioritization Rules

Ad hoc maintenance work is triggered by:

- New production/user-reported bug
- Regression discovered during testing
- Flaky or failing CI check
- Risky area touched by ongoing work
- Dependency/security update with runtime impact

Prioritization order:

1. Severity (P0/P1 before P2/P3)
2. Blast radius (how many modes/users are affected)
3. Reproducibility (deterministic issues first)
4. Fix leverage (changes that prevent whole classes of defects)

## Definition of Done (Maintenance Work)

- Root cause identified and documented in the issue/PR
- Automated test added or updated for the failure mode
- Quality gates pass
- Backlog item severity and status updated
- Follow-up refactor/doc task logged if debt remains

## Review Cadence (Lightweight)

- No fixed sprint ritual required
- Triggered review whenever backlog caps are exceeded or a P0/P1 incident closes
- Monthly 20-minute health snapshot recommended to recalibrate caps and ticket mix
