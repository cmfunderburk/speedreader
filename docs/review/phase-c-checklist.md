# Phase C Checklist

Date: 2026-02-18

Goal: reduce `App.tsx` settings-update duplication without changing behavior.

- [x] Add a single `updateDisplaySettings` helper to centralize `setDisplaySettings + saveSettings`.
- [x] Add a `patchDisplaySettings` helper for common partial updates.
- [x] Migrate repeated settings handlers (ramp, RSVP/saccade toggles, generation options, last-session save) to helpers.
- [x] Keep behavior-preserving WPM/session update semantics in `App`.
- [x] Run verification (`bun run verify`) and confirm green.
