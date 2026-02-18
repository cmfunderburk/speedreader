# ADR-005: Local Discussion Session Persistence with Attempt-Scoped Resume

Status: Proposed
Date: 2026-02-17

## Context
Continuation discussions must be durable enough for return visits and review, while preserving Reader's local-first posture.

## Options Considered
1. Ephemeral sessions.
   - Pro: minimal storage complexity.
   - Con: no meaningful continuation/resume.
2. Local persistence with one session per attempt, resume same thread.
   - Pro: matches continuation-first learning loop and local-first policy.
   - Con: requires migration and link integrity handling.
3. Multiple sessions per attempt.
   - Pro: flexible branching.
   - Con: added UX and selection complexity for V1.

## Decision
Persist discussions locally by default, keyed to attempts, with single-session-per-attempt resume semantics.

## Consequences
1. Introduces new storage key and schema migration requirements.
2. Requires deterministic reopen/resume behavior.
3. Provides strong continuity for post-check remediation without added backend dependencies.
