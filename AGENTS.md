# Repository Guidelines

## Project Structure
- `src/`: React + TypeScript renderer app.
- `src/components/`: UI modules (reader surfaces, training, settings, library).
- `src/hooks/`: playback/state hooks (`useRSVP`, timers, keyboard handling).
- `src/lib/`: pure logic (tokenization, saccade layout, storage, Wikipedia/feed ingestion).
- `src/test/`: shared test helpers.
- `electron/`: Electron main/preload and local file extraction.
- `library/`: local source content and processed references for personal use.
- `docs/`: roadmap, runbooks, and maintenance notes.
- Build artifacts (`dist/`, `dist-electron/`, `dist-electron-build/`) are generated; do not edit.

## Build, Test, Dev
- `bun install`: install dependencies.
- `bun run dev`: web app via Vite.
- `bun run electron:dev`: Electron dev flow.
- `bun run lint`: ESLint.
- `bun run test`: Vitest watch mode.
- `bun run test:run`: Vitest single run.
- `bun run build`: type-check + web build.
- `bun run electron:build`: Electron package build (required when touching `electron/**`).

## Coding Conventions
- TypeScript strict mode is enabled. Keep module boundaries typed.
- Use 2-space indentation and single quotes; match semicolon style in touched files.
- Components: PascalCase files/exports.
- Hooks: `useX` camelCase names.
- Tests: `.test.ts` / `.test.tsx`, colocated or in `src/test/`.

## Testing Expectations
- Add regression tests for logic changes in core reading/training paths.
- Prefer deterministic tests (fake timers for timing-dependent behavior).
- Quality gates before commit/PR:
  - `bun run lint`
  - `bun run test:run`
  - `bun run build`

## Product-Specific Repo Policy
- Content-specific extraction scripts (especially copyrighted personal-source processing) are local-use tooling and should not be committed.
- Keep product code, tests, and generic tooling in commits; keep one-off local ingestion/debug scripts out of commits.
- If modifying persistence schema (`src/lib/storage.ts`), include migration/backfill behavior and tests.

## Documentation Maintenance
- Update `README.md` for user-visible behavior changes (controls, scoring, mode semantics).
- Update `CLAUDE.md` when architecture/data-flow assumptions change.
- Prefer behavior-focused wording over roadmap language in top-level docs.
- Avoid brittle details (for example, exact file counts) unless they are part of an automated check.

## Commit / PR Guidance
- Use short imperative commit titles.
- Keep commits focused; avoid unrelated refactors.
- PRs should include: root cause, user impact, scope, and verification notes.
- Include screenshots for visible UI changes.
