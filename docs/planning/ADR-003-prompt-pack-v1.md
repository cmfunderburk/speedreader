# ADR-003: Prompt Pack Architecture for V1 Discussion

Status: Proposed
Date: 2026-02-17

## Context
Discussion quality and debuggability depend on stable prompt assembly and mode behavior. We need a maintainable structure.

## Options Considered
1. Single monolithic prompt string.
   - Pro: simple initial implementation.
   - Con: hard to evolve/test mode-specific behavior.
2. Base prompt + mode prompts (versioned pack).
   - Pro: modular, testable, aligns with KnOS design pattern.
   - Con: requires prompt metadata persistence.

## Decision
Adopt a versioned prompt pack with:
1. mode-agnostic base prompt
2. `clarify` mode prompt
3. `socratic` mode prompt

Persist pack id/version on each discussion session.

## Consequences
1. Supports controlled prompt evolution and reproducible behavior.
2. Adds schema fields and test obligations for pack metadata.
3. Enables gradual expansion to additional modes in later versions.
