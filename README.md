# Reader

Paced reading and recall training app, with a saccade-first workflow and integrated practice loops.

Last updated: February 2026.

## Product Scope
Reader currently supports three connected workflows:
1. **Paced Reading** (`Saccade` and `RSVP`) for throughput and focus.
2. **Active Exercise** (`Prediction` and `Recall`) on saved passages.
3. **Training** (`Article` and `Random Drill`) for repeated read-recall-feedback practice.

The design goal is to reduce friction between reading and retention practice by keeping context, pacing, and controls consistent across workflows.

## Core Modes

### Saccade
- Full-page reading with sweep/focus pacer styles.
- OVP/fixation guidance and configurable saccade length.
- Figure/image support, including paused click-to-zoom.
- Passage capture actions from the same reading surface.

### RSVP
- Word/custom chunk presentation with ORP highlighting.
- Optional WPM ramp and alternate color phase.
- Shared pacing controls with other modes.

### Prediction
- Next-word prediction with typo-tolerant scoring.
- `Tab` preview supports either next `N` sentences or continuous preview (configurable in Settings).

### Recall
- Word reconstruction anchored to the same saccade layout.
- Optional first-letter scaffold.
- Inline correctness marking.

### Training
- Read -> Recall -> Feedback loop for:
  - selected article paragraphs, or
  - random drill corpora.
- Random Drill supports two corpus families (`Wikipedia`, `Prose`) with readability tiers (`Easy`, `Medium`, `Hard`).
- Drill rounds are one sentence.
- Optional auto-adjust difficulty uses a user-selected WPM range and fixed `+/-10` WPM steps.
- In Random Drill with scaffold off, `Tab` previews remaining words at current WPM; those previewed words become practice-only (score `0`) even if typed correctly afterward.

## Workflow Features
- Passage workspace in paced reading:
  - `Save Sentence`
  - `Save Paragraph`
  - `Save Last 3`
  - review queue actions (`Recall`, `Predict`, `Hard`, `Easy`, `Done`)
- Explicit `Return to Reading` from active exercise.
- Session snapshot restore for reading/exercise continuity.
- Per-activity WPM persistence (`paced-reading`, `active-recall`, `training`).

## Content Sources
- URL import (Readability extraction).
- Paste text.
- RSS/Atom feeds.
- Local library content in Electron (PDF/EPUB workflows).
- Library sharing via `Export Manifest` / `Import Manifest`.
- Wikipedia daily/random featured ingestion with reader-specific normalization.

## Keyboard (High-Level)
- `Space`: play/pause in playback modes.
- `[` / `]`: adjust WPM for current activity.
- `Esc`: back/exit/skip depending on surface.
- Prediction: `Tab` preview toggle.
- Recall/training recall: `Enter`/`Space` submit or continue depending on state.
- Training Random Drill (no scaffold): `Tab` timed preview of remaining words (previewed words are unscored).

## Development

```bash
bun install
bun run dev
bun run electron:dev
bun run typecheck
bun run lint
bun run test:run
bun run verify
bun run build
```

## Electron Build

```bash
bun run electron:build
```

## Quality Gates
Run these before commit/PR:
- `bun run verify`
- `bun run typecheck`
- `bun run lint`
- `bun run test:run`
- `bun run build`

If `electron/**` changed, also run:
- `bun run electron:build`

## Project Docs
- Agent/repo workflow: `AGENTS.md`
- AI implementation context: `CLAUDE.md`
- Product roadmap: `docs/brainstorming/saccade-entrypoint-product-roadmap.md`
- Random drill corpus discussion: `docs/brainstorming/expanding-random-drill.txt`
- Ops runbook: `docs/operational-runbook.md`
