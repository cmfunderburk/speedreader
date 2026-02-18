# Reader

Paced reading and recall training app, with a saccade-first workflow and integrated practice loops.

Last updated: February 2026.

## Product Scope
Reader currently supports four connected workflows:
1. **Paced Reading** (`Saccade`, `RSVP`, and `Generation`) for throughput and focus.
2. **Active Exercise** (`Prediction` and `Recall`) on saved passages.
3. **Training** (`Article` and `Random Drill`) for repeated read-recall-feedback practice.
4. **Comprehension Check** (LLM-generated question sets) for passage-grounded understanding feedback.

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

### Generation
- Line-paced reading with selective letter masking cues inspired by generation-effect tasks.
- Masking excludes function words, proper nouns, acronyms, and numbers.
- Difficulty presets (`Normal`, `Hard`) adjust per-word mask limits (`<=25%` / `<=40%`).
- Optional `Sweep reveal` progressively unmasks letters as the pacer passes.
- Hold `R` to temporarily reveal full text; pacing pauses while held.
- Uses the same page navigation and passage-capture workflow as saccade mode.

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

### Comprehension Check
- Launcher entry: select `Comprehension Check` from Home, then choose an article.
- Post-reading entry: when paced reading reaches the end of a text, launch a check directly from the reader surface.
- Closed-book -> open-book sequencing:
  - factual questions first (passage hidden),
  - inferential/structural/evaluative questions next (passage available).
- Mixed formats supported in one check: multiple choice, true/false, short answer, essay.
- Generated questions now include key-point checklists, and free-response scoring prioritizes key-point coverage.
- True/false items require both a True/False selection and a brief explanation (`<= 2` sentences), and grading reflects both parts.
- Results emphasize per-question explanatory feedback and persist attempt history locally.
- `Standard`/`Deep` results include key-point hit/miss breakdown when available.
- Results support `Quick`/`Standard`/`Deep` review depth plus `All questions` / `Needs review` filtering.
- Review prior attempts from Home via `Comprehension Check -> Review History`.
- Configure API key in `Settings -> Comprehension Check API Key` (this key is only required for comprehension checks).
- Configure model in `Settings -> Comprehension Check API Key` (currently `gemini-3-pro-preview` or `gemini-3-flash-preview`).
- In Electron builds, API keys are stored in OS-backed secure encrypted storage when available (with local app-storage fallback if the OS keyring is unavailable); in web builds they use browser local storage.
- Current Gemini REST integration sends the API key via `x-goog-api-key` request header.

## Workflow Features
- Passage workspace in paced reading:
  - `Save Sentence`
  - `Save Paragraph`
  - `Save Last 3`
  - review queue actions (`Recall`, `Predict`, `Hard`, `Easy`, `Done`)
- Explicit `Return to Reading` from active exercise.
- Session snapshot restore for reading/exercise continuity.
- Per-activity WPM persistence (`paced-reading`, `active-recall`, `training`, `comprehension-check`).

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
- Generation mode: hold `R` to reveal current page text (pacing pauses while held).
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
bun run verify:ci
bun run build
```

Dev server defaults to `http://127.0.0.1:5417` and uses strict port binding (it will fail fast if occupied, rather than shifting or taking over other ports). Override with `READER_DEV_PORT`, for example:

```bash
READER_DEV_PORT=5517 bun run dev
```

## Electron Build

```bash
bun run electron:build
```

## Quality Gates
Run these before commit/PR:
- `bun run verify`
- `bun run verify:ci` (matches CI lint + coverage + build gate)
- `bun run typecheck`
- `bun run lint`
- `bun run test:run`
- `bun run build`

If `electron/**` or Electron-relevant shared/type/config surfaces changed, also run:
- `bun run electron:build`

## Project Docs
- Agent/repo workflow: `AGENTS.md`
- AI implementation context: `CLAUDE.md`
- Comprehension research synthesis: `docs/Comprehension-Check-Research.md`
- Comprehension milestone board: `docs/Comprehension-Improvement-Milestone-Board.md`
