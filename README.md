# Reader

Paced reading + recall training app with a Saccade-first workflow.

Last updated: February 2026.

## What It Does
Reader is designed around a tight loop:
1. Read in Saccade mode.
2. Capture a sentence/paragraph while paused.
3. Practice on the captured passage (Recall or Prediction).
4. Return to the exact reading context.

The goal is to reduce context-switch friction between throughput reading and retention practice.

## Core Modes

### Saccade (default paced-reading entrypoint)
- Full-page reading with sweep/focus pacer styles.
- OVP/fixation guidance and configurable saccade length.
- Figure/image rendering support, including paused click-to-zoom.
- Page navigation controls and line-count controls.
- Passage capture tools in the workspace.

### RSVP
- Word/custom chunk presentation with ORP highlighting.
- Optional WPM ramp and alternate color phase.
- Shared saccade-length tuning for custom chunking behavior.

### Prediction
- Next-word prediction with typo-tolerant scoring.
- Tab preview supports either:
  - next N sentences (default N=2), or
  - unlimited preview until toggled off.

### Recall
- First-letter scaffold reconstruction with inline correctness coloring.
- Same saccade layout anchoring for stable spatial memory.

### Training
- Read -> Recall -> Feedback loop for article paragraphs and random drill corpora.
- Random Drill uses adaptive tuning (WPM and length limits) and inline miss marking.
- Per-paragraph history persists for article training.

## Workflow Features
- Passage Workspace in paced reading:
  - `Save Sentence`
  - `Save Paragraph`
  - `Save Last 3`
  - review queue with Recall/Predict/Hard/Easy/Done actions
- Active exercise supports explicit `Return to Reading`.
- Session continuity restores reading context after passage exercises.
- Per-activity WPM persistence (paced-reading, active-recall, training) so speed tuning does not bleed across modes.

## Content Sources
- URL import (Readability extraction).
- Paste text.
- RSS/Atom feeds.
- Local library content in Electron (PDF/EPUB workflows).
- Library sharing via `Export Manifest` / `Import Manifest` (manifest + shared source folders).
- Wikipedia daily/random featured ingestion with reader-focused normalization.

## Theme and Display
- Theme: Dark / Light / System.
- Mode-specific font sizing.
- Prediction line width controls.
- Ramp controls (curve, start %, rate/interval).

## Keyboard (high-level)
- `Space`: play/pause in playback modes.
- `[` / `]`: adjust WPM for current activity.
- `Esc`: back/exit depending on surface.
- Prediction: `Tab` preview toggle.
- Recall/training recall: `Enter`/`Space` submit or continue as context requires.

## Development

```bash
npm install
npm run dev
npm run electron:dev
npm run lint
npm run test:run
npm run build
```

## Electron Build

```bash
npm run electron:build
```

## Docs
- Product roadmap: `docs/brainstorming/saccade-entrypoint-product-roadmap.md`
- Theme notes: `docs/brainstorming/theme-token-map.md`
- Ops/runbook: `docs/operational-runbook.md`
