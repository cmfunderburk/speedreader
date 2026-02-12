# Reader — Project Context

Reading and training app with three top-level activities:
- `paced-reading` (RSVP/saccade reading surface)
- `active-recall` (prediction/recall on passages)
- `training` (article paragraph loop + random drill)

Stack: React 18 + TypeScript + Vite, with optional Electron for local PDF/EPUB support.

## Architecture

```
src/
  components/     App shell + reading/exercise/training surfaces
  hooks/          useRSVP (core orchestrator), usePlaybackTimer, useKeyboard
  lib/            tokenizer, saccade, rsvp timing, levenshtein, extractor,
                  feeds, wikipedia, storage, trainingDrill
  types/          shared app/electron types
electron/         main.ts, preload.ts, lib/ (pdf, epub, library, cleanup)
shared/           Electron IPC contract types shared by preload + renderer
```

## Main Data Flow

1. Content enters via URL extraction, pasted text, RSS feeds, or Electron file loading.
2. `useRSVP` tokenizes content into `Chunk[]` based on display mode and token mode.
3. Playback modes (RSVP/saccade) advance via `usePlaybackTimer` and mode-specific timing.
4. Prediction/Recall are self-paced and update scoring state per chunk.
5. Training manages a read -> recall -> feedback state machine in `TrainingReader`.
6. Local storage persists articles, settings, WPM by activity, training history, passages, and drill state.

## Training/Drill Invariants

- Random Drill rounds are exactly one sentence (`getDrillRound`).
- Auto-adjust drill difficulty is bounded WPM-only:
  - user picks min/max WPM,
  - adjustments are fixed `+/-10` WPM (`DRILL_WPM_STEP`),
  - no hidden sentence-length or char-limit adaptation.
- In no-scaffold Random Drill recall:
  - `Tab` triggers timed preview of remaining words at current WPM,
  - preview then hides,
  - previewed words are forfeited (practice allowed, score stays zero for those words).
- Detail words (names/dates) may be included or excluded from score via toggle.

## Important Patterns

- **State/ref split in `useRSVP`**:
  state drives renders; refs keep timer callbacks in sync without recreating timers.
- **`goToIndex` vs `advanceSelfPaced`**:
  `advanceSelfPaced` can reach completion boundary (`chunks.length`) for end-state transitions.
- **Mode-dependent tokenization**:
  switching display modes retokenizes and remaps position proportionally.
- **Storage migration discipline**:
  when adding/changing persisted fields, keep backward compatibility in loaders and add tests.
- **IPC contract discipline**:
  shared preload/renderer contracts live in `shared/electron-contract.ts`; avoid duplicating interface declarations.

## Build & Test

```bash
bun run dev
bun run electron:dev
bun run lint
bun run test:run
bun run verify
bun run build
bun run electron:build  # when electron/** changes
```

## Conventions

- Persistence is localStorage-based (plus Electron local library files where applicable).
- No global state framework; React state + hooks.
- Scoring logic relies on typo-tolerant matching (`levenshtein` helpers).
- Tests use Vitest + Testing Library and should cover regressions in playback, mode switching, storage, and training.
