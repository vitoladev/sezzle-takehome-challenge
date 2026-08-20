---
name: coding-guidelines
description: |
  Coding guidelines for this repo. Use when writing, reviewing, or
  refactoring code to avoid overcomplication, make surgical changes, surface
  assumptions, and define verifiable success criteria.
---

# Coding Guidelines

**Tradeoff:** these guidelines bias toward caution over speed. For trivial
tasks, use judgment.

> This file is canonical. The executor agents
> (`.claude/agents/backend-executor.md`, `frontend-executor.md`) carry a
> condensed copy adapted for unattended runs — when editing a rule here,
> update their "Coding rules" sections to match. `docs/CODING_STANDARDS.md`
> restates these rules as numbered, citable entries for review — edit it in
> the same change.

## 1. Think Before Coding

**Surface assumptions and tradeoffs before implementing.**

- State your assumptions explicitly; when uncertain, ask.
- When multiple interpretations of a request exist, present them instead of
  picking one silently.
- When a simpler approach exists, say so — push back when warranted.
- When something is unclear, stop, name what's confusing, and ask.

## 2. Simplicity First

**The minimum code that solves the problem. Nothing speculative.**

- Only features that were asked for.
- No abstractions around single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for scenarios that cannot occur.
- If 200 lines could be 50, rewrite them.

Test: would a senior engineer call this overcomplicated? If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Leave adjacent code, comments, and formatting as they are.
- Refactor only what the task requires.
- Match the existing style, even where you'd choose differently.
- Mention unrelated dead code you notice — leave removing it to a separate,
  requested change.

When your changes create orphans, remove the imports, variables, and
functions that *your* change made unused — and nothing older than that.

Test: every changed line traces directly to the user's request.

## 4. Documentation Freshness

**Fix the docs your change made stale, in the same change.**

- Renaming a module path, moving a file, changing a command, a default, or a
  described behaviour obliges you to update every document that states the old
  fact — `README.md`, `CLAUDE.md`, `CONTEXT.md`, `docs/**`, and the skill and
  agent files under `.claude/`.
- Never defer it to a later task, a docs-only pass, or the slice that "owns
  documentation". By then the next task has already read the stale fact and
  planned against it, and the mistake compounds downstream.
- This is not a conflict with Surgical Changes: repairing what *your* change
  invalidated traces to the request, exactly as removing the orphans your
  change created does. Documentation your change did not touch stays untouched.

Test: after the change, does any document still state something the change made
untrue? If yes, it belongs in this change.

## 5. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "write tests for invalid inputs, then make them pass"
- "Fix the bug" → "write a test that reproduces it, then make it pass"
- "Refactor X" → "tests pass before and after"

For multi-step tasks, state a brief plan where every step ends in a check:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

Strong success criteria let you loop independently; weak ones ("make it
work") force constant clarification.

## 6. Comments

**Do not narrate comments or overstate what the code already provides.**

- No restating a function name, type, or the next line.
- No step-by-step play-by-play above obvious logic.
- Prefer silence; comment only non-obvious *why* (invariants, surprising
  constraints, deliberate deviations).

Test: if deleting the comment loses no information, delete it.

## 7. Frontend State (apps/web)

**Never park state on `window.*` — no `history.pushState`/`replaceState`, no `localStorage`/`sessionStorage`, no globals hung off `window`.**

- UI state lives in React (`useState`/refs) owned by the feature's composition root; server state lives in TanStack Query. Those two places, nothing else.
- If a future feature will need a value, hand it over in React state and let that feature choose its own persistence when it exists. Inventing a protocol for it now (URL params, storage keys, history entries) locks the next slice to an accidental shape.
- Browser-global writes create extra sources of truth with no reader: they desync on Back/reload and no test fails until a human notices.
