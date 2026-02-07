# Reader

A reading training application. Load articles, books, and feeds, then practice with five modes designed to build different reading skills — from raw speed to deep comprehension and recall.

## Reading Modes

### RSVP

Rapid Serial Visual Presentation. Words or short phrases are displayed one at a time at the center of the screen, with the optimal recognition point (ORP) highlighted. This trains fast intake by eliminating eye movement overhead.

- **Chunking**: single word or custom width (5-20 chars), respecting punctuation as natural break points
- Character-based timing (5 chars = 1 word) with punctuation pauses and word-length multipliers
- Configurable WPM (100-800) with optional WPM ramp
- **ORP highlight**: amber highlight on the optimal recognition point (toggle on/off)
- **Alternate colors**: optional color-phase switching between consecutive chunks

### Saccade

Full-page reading with a continuous sweep pacer. Text is laid out in fixed-width lines (80 chars) across configurable pages. A smooth sweep bar animates across each line at your target WPM, training your eyes to move at a steady pace through natural text.

- **Sweep pacer**: continuous character-based animation across each line, with duration proportional to line length
- **OVP markers**: amber fixation points placed by a scored selection model that penalizes short words and function words, with configurable saccade length (7-15 chars)
- **Sweep-synced ORP animation**: fixation markers decolor to plain text as the sweep passes, future lines dimmed
- Independent toggles for pacer, OVP markers, and sweep bar
- Preserves headings and paragraph structure
- Configurable lines per page (5-30)
- Manual page navigation when pacer is off

### Prediction

Next-word prediction training. You see the text accumulated so far and type what you think comes next. Correct guesses advance instantly (flow state); misses pause and show the actual word with a loss score.

- First-letter hint for the current word
- Levenshtein-based scoring (0 = exact match, 1 = completely wrong)
- Tab to preview ahead at your selected WPM, then resume predicting
- Session stats: words attempted, exact match %, average loss

### Recall

First-letter scaffold reconstruction. Each word shows only its first letter with the rest replaced by a dotted underline showing character positions. You type to reconstruct each word from memory and context.

- Words validate as you type and advance automatically
- Correct words appear in green, misses in red
- Uses saccade page layout for stable line positioning
- Session stats tracked the same as prediction mode

### Training

A structured read-recall-adjust loop that combines saccade reading with recall testing to train comprehension at increasing speeds.

1. **Setup** — A paragraph table of contents shows previews, word counts, and any previous scores. Select a starting paragraph and initial WPM.
2. **Read** — The paragraph is displayed in saccade layout with a sweep pacer at your current WPM. A brief lead-in shows static ORP markers before the sweep begins.
3. **Recall** — The same paragraph reappears as first-letter scaffolds. Type each word from memory; words auto-advance on correct input, with miss feedback and Levenshtein scoring.
4. **Feedback** — Shows your score (0-100%) and exact match count. WPM adjusts automatically:
   - Below 90%: WPM decreases by 25, paragraph repeats
   - 90-94%: no change, advance to next paragraph
   - 95%+: WPM increases by 15, advance to next paragraph
5. **Complete** — Session summary: paragraphs completed, words recalled, average score, WPM progression, and repeat count.

Per-paragraph training history (score, WPM, timestamp) persists across sessions.

## Adding Content

**From a URL** — Click "+ Add" and paste an article link. The app extracts readable content automatically using Mozilla Readability.

**Paste text** — In the same dialog, switch to the Paste Text tab and enter content directly.

**Bookmarklet** — Drag the "Save to SpeedRead" button to your bookmarks bar. Click it on any article page to send the full HTML to Reader for Readability extraction. Works with paywalled content you're logged into.

**RSS/Atom feeds** — Add feed URLs in the Feeds panel. Articles appear in the feed list; click to add them to your reading queue.

**Local files (Electron only)** — Configure library directories in Library Settings. The app scans recursively for PDF and EPUB files.

## Controls

### Playback (RSVP / Saccade)

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| Left Arrow | Previous chunk |
| Right Arrow | Next chunk |
| `[` | Decrease WPM by 10 |
| `]` | Increase WPM by 10 |
| Escape | Pause / exit current view |

### Prediction Mode

| Key | Action |
|-----|--------|
| Space / Enter | Submit prediction |
| Tab | Toggle preview (when input focused or previewing) |
| `` ` `` | Reset to beginning |

### Recall Mode

| Key | Action |
|-----|--------|
| Type | Fill in each word; auto-advances on correct input |
| Space / Enter | Continue after incorrect word feedback |
| `` ` `` | Reset to beginning |

### Training Mode

| Key | Action |
|-----|--------|
| Space / Enter | Continue from feedback screen |
| Space / Enter | Continue after miss (during recall phase) |
| Pause / Exit buttons | Toggle pause or return to paragraph list |

## Settings

Click the gear icon in the header to configure:

- **Font sizes** for RSVP, saccade, and prediction modes (independent sliders)
- **Prediction line width** — narrow (50ch), medium (65ch), or wide (85ch)
- **WPM ramp** — gradually increase speed during a session
  - **Curve**: linear (fixed rate per interval) or logarithmic (asymptotic half-life)
  - **Start**: 10-90% of target WPM
  - **Rate/interval** (linear) or **half-life** (logarithmic)
  - Visual graph showing the ramp progression

Reader controls at the bottom of the main view provide:

- **WPM slider** (100-800) with optional ramp toggle
- **Display mode** selector (RSVP / Saccade / Prediction / Recall / Training)
- **Chunking mode** selector (Word / Custom) for RSVP
- **ORP** and **alternate colors** toggles for RSVP
- **Pacer**, **OVP**, and **sweep** toggles for saccade mode
- **Saccade length** slider (7-15 chars) for fixation spacing
- **Lines per page** for saccade and recall modes

## Running

```bash
# Install dependencies
npm install

# Web version (localhost:5173)
npm run dev

# Electron version (adds local PDF/EPUB support)
npm run electron:dev

# Run tests
npm test

# Production build (web)
npm run build

# Production build (Electron distributable)
npm run electron:build
```
