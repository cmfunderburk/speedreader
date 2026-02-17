# Refactor PR Draft

## Title
Refactor app/training orchestration boundaries, strengthen quality gates, and expand regression coverage

## Root Cause
Core orchestration logic had grown inside large renderer components (`App.tsx`, `TrainingReader.tsx`), with domain branching, side effects, and UI wiring interleaved. This made behavior-sensitive changes risky and regression detection uneven.

## User Impact
- No intended user-facing feature changes.
- Improved stability in high-risk transitions:
  - session continue/launch paths,
  - active-exercise close/resume behavior,
  - featured daily/random launch handling,
  - training recall transitions (including no-scaffold tokenized flow).
- Faster and more reliable regression detection through stronger CI/test gates.

## Scope
Included:
- Extraction of planner/helper logic from renderer orchestration paths.
- Persistence boundary hardening in `src/lib/storage.ts`.
- Shared Electron IPC contract typing (`shared/electron-contract.ts`) across preload/renderer.
- CI quality gate updates (`verify`, `verify:ci`, Electron-aware build trigger widening).
- Integration coverage expansion for key app/training flows.
- Refactor readiness documentation (plan, parity matrix, handoff).

Explicitly deferred:
- Storage backend migration (IndexedDB/SQLite). This PR keeps localStorage with documented re-evaluation triggers.
- Full decomposition rewrite of `App.tsx`/`TrainingReader.tsx`.

## Key Changes
- Added PR readiness planning and acceptance docs:
  - `docs/refactor-pr-readiness-plan.md`
  - `docs/refactor-behavior-parity-matrix.md`
- Updated phased + handoff docs to current status:
  - `docs/refactor-phased-plan.md`
  - `docs/refactor-session-handoff-2026-02-12.md`
- Expanded App integration smoke coverage:
  - cached daily launch without refetch,
  - active-recall launch/exit fallback,
  - snapshot-backed resume-to-reading,
  - continue training from last session,
  - sentence passage capture wiring.
- Expanded TrainingReader integration coverage:
  - no-scaffold tokenized recall submission path.
- Reduced duplicated branching in `App.tsx` by consolidating daily/random featured launch flow into shared launch handler.
- Hardened CI Electron build trigger scope:
  - now includes shared/type/config surfaces that can affect Electron correctness.

## Verification
Current branch verification:
- `bun run verify` passed.
- `bun run verify:ci` passed.
- `bun run electron:build` passed in the current Bun-based local environment.

Automated totals:
- Test files: 31
- Tests: 237

Coverage (`verify:ci`):
- Statements: 62.41%
- Branches: 54.21%
- Functions: 60.95%
- Lines: 64.11%

## Residual Risks
- `App.tsx` and `TrainingReader.tsx` remain large orchestration components (improved, not fully decomposed).
- Passage capture UI integration coverage is strongest for sentence capture; paragraph/last-lines rely more on planner/unit coverage.
- Drill-specific no-scaffold preview-forfeit (`Tab`) remains mostly planner-covered.
- Electron packaging remains toolchain-sensitive across host environments; CI electron build remains the authoritative gate.

## Future Improvement Areas (Post-PR)
- Further decompose `App.tsx` and `TrainingReader.tsx` orchestration callbacks into smaller modules.
- Add targeted integration tests for paragraph/last-lines capture paths.
- Add targeted integration coverage for drill no-scaffold preview-forfeit behavior.
- Re-evaluate storage backend when localStorage scale/performance triggers are observed.

## Reviewer Notes
- Focus review on behavior parity in transitions and coverage adequacy for remaining moderate-risk scenarios.
- Confirm acceptance of documented deferred items (storage backend migration, deeper orchestrator decomposition) for this PR scope.
