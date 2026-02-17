# Refactor PR Readiness Plan

Last updated: February 12, 2026.

## Purpose
This document defines the end-state for the `refactor` branch and the objective criteria for opening a PR to `main`.

The earlier phased plan tracked extraction work. This plan is the PR decision framework: what must be true, what evidence is required, and what remains intentionally out of scope.

## Scope
In scope:
- Renderer orchestration refactor (`App`, `TrainingReader`, extracted planner/helper modules).
- Persistence boundary hardening (`src/lib/storage.ts`).
- Shared Electron contract typing and quality gates.
- Test and CI confidence for changed behavior.

Out of scope for this PR:
- Full rewrite of `App.tsx` or `TrainingReader.tsx`.
- New product features unrelated to refactor risk reduction.
- Storage backend migration to IndexedDB/SQLite in this branch.

## Idealized Finished State
The refactor is considered finished for PR when all items below are true.

### 1) Boundaries Are Explicit And Enforced
- Domain branching logic for changed flows lives in pure planner/helper modules under `src/lib/**`.
- `src/components/App.tsx` and `src/components/TrainingReader.tsx` primarily orchestrate wiring, side effects, and rendering.
- App-owned browser persistence is centralized in `src/lib/storage.ts`.
- Electron IPC contract types are shared from `shared/electron-contract.ts` and used by preload + renderer typings.

### 2) Behavior Parity Is Demonstrated
- Existing user flows continue to work with no regressions in navigation, session continuation, passage capture/review, and training recall transitions.
- High-risk transitions are covered by deterministic unit tests for planner logic plus integration smoke tests.
- No known high-severity behavior gaps remain open.

### 3) Quality Gates Are Reliable
- `bun run verify` passes locally on the branch.
- `bun run verify:ci` passes locally and in CI.
- CI includes web lint/test/build and Electron build checks for relevant changes.
- Coverage thresholds enforce minimum confidence for critical extracted modules and component layer.

### 4) Documentation Is Internally Consistent
- Refactor docs reflect actual branch status (commits, completed phases, open work).
- Decision records are explicit for deferred items (notably storage backend choice).
- PR description can be assembled directly from this plan and completion evidence.

## Baseline Snapshot (As Of February 12, 2026)
- Branch: `refactor`
- Commits ahead of `main`: 15
- Diff size vs `main`: 61 files, +6182 / -11179
- Test status: 31 files, 237 tests passing
- Coverage (`bun run verify:ci`):
  - Statements: 62.41%
  - Branches: 54.21%
  - Functions: 60.95%
  - Lines: 64.11%

## Workstream Status Snapshot (February 12, 2026)
- [x] Workstream A: Documentation Alignment (initial sync complete; continue keeping docs updated as work lands).
- [x] Workstream B: Behavior Parity Matrix (scenario mapping complete; residual moderate-risk areas explicitly documented).
- [x] Workstream C: Orchestrator Hardening (scoped completion; high-value daily/random launch branch consolidation landed in `App.tsx`).
- [x] Workstream D: CI/Gate Hardening (Electron change detection expanded beyond `electron/**`).
- [x] Workstream E: Storage Strategy Decision (localStorage for this PR scope).
- [x] Workstream F: PR Packaging And Evidence (complete for current scope; draft and verification evidence are ready for PR use).

## Scope Closure
Current refactor scope is considered complete and PR-ready.
Remaining concerns are intentionally tracked as future improvement work, not blockers for this PR.

## Workstreams To Reach PR-Ready
All workstreams in this section are now complete for current scope. The detail is retained as an implementation record.

### Workstream A: Documentation Alignment
Deliverables:
- Refresh `docs/refactor-session-handoff-2026-02-12.md` to current HEAD and validation totals.
- Update `docs/refactor-phased-plan.md` Phase 4 status to match chosen storage strategy.
- Keep this plan synchronized as tasks close.

Done criteria:
- No contradictions across refactor docs.
- A reviewer can identify current status from docs alone without checking git history.

### Workstream B: Behavior Parity Matrix
Deliverables:
- Create a scenario matrix covering changed high-risk flows:
  - Home -> content browser -> preview -> active reader -> home.
  - Active exercise close behavior with and without valid reading snapshot.
  - Daily/random featured launch including cached daily path.
  - Passage capture (sentence/paragraph/last-lines) and queue ordering.
  - Training recall transitions (miss, continue, finish, feedback, repeat/advance).
- Map each scenario to existing tests and add missing tests for uncovered transitions.

Done criteria:
- Every scenario is linked to at least one automated test.
- Any residual untested edge case is documented with rationale and risk level.

### Workstream C: Orchestrator Hardening (Targeted, Not Rewrite)
Deliverables:
- Reduce fragile inline branching in `App.tsx` and `TrainingReader.tsx` where practical and high-value.
- Keep new branching logic in pure modules with focused tests.
- Avoid broad stylistic churn without behavioral value.

Done criteria:
- Net reduction in high-risk branching inside component callbacks touched by this refactor.
- Added/changed logic paths have corresponding tests in `src/lib/*.test.ts` or integration tests.

### Workstream D: CI/Gate Hardening
Deliverables:
- Expand Electron-change detection in CI to include shared contract/type surfaces (`shared/**`, relevant TS config/scripts) that can affect Electron correctness.
- Confirm `bun run verify:ci` remains the authoritative PR gate command.
- Tune thresholds only with explicit justification tied to risk and current test strategy.

Done criteria:
- CI fails when Electron-relevant contract changes break build expectations.
- Gate behavior is deterministic and documented.

### Workstream E: Storage Strategy Decision (LocalStorage For Now)
Decision:
- Keep `localStorage` as the persistence backend for this PR.

Required documentation for this decision:
- Record why localStorage is acceptable now (scope, complexity, current product scale).
- Record explicit re-evaluation triggers (for example: quota pressure, write latency, payload growth, or frequent parse failures).
- Ensure persistence access remains centralized through `src/lib/storage.ts`.

Done criteria:
- Deferred migration is intentional, documented, and reviewable.
- No new direct app-owned `localStorage` access outside storage helpers.

### Workstream F: PR Packaging And Evidence
Deliverables:
- PR narrative with:
  - root cause and motivation,
  - user impact,
  - architectural changes,
  - risk areas,
  - verification results.
- Attach or summarize outputs of:
  - `bun run verify`
  - `bun run verify:ci`
  - `bun run electron:build` when Electron-relevant files changed
- Include screenshots only if UI behavior changed visibly.

Done criteria:
- Reviewer can validate claims without reproducing private context.
- Remaining risks are explicit, bounded, and acceptable.

## PR Go/No-Go Checklist
All must be true before opening PR:
- [x] No open high-severity regressions in refactor-touched flows.
- [x] Workstream A complete.
- [x] Workstream B complete.
- [x] Workstream C complete or explicitly scoped down with rationale.
- [x] Workstream D complete.
- [x] Workstream E complete.
- [x] `bun run verify` passes.
- [x] `bun run verify:ci` passes.
- [x] `bun run electron:build` run when required by changed files.
- [x] Refactor docs are synchronized with actual branch state.
- [x] PR write-up includes verification evidence and known residual risks.

## Residual Risks We Accept For This PR
- `App.tsx` and `TrainingReader.tsx` remain large orchestration components even after extraction.
- Component-level integration coverage is improving but not exhaustive.
- Storage backend remains browser localStorage until scale/perf triggers justify migration work.

## Future Pass Improvement Areas
- Decompose `App.tsx` and `TrainingReader.tsx` further into smaller orchestration units once this PR is merged.
- Expand integration coverage for paragraph/last-lines capture and drill preview-forfeit (`Tab`) paths.
- Revisit storage backend choice if persistence payload size, parse latency, or quota pressure increases.
- Continue gradual CI hardening to ensure Electron packaging remains deterministic across host toolchains.
