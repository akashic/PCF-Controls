---
id: 2026-10-22-2031-dark-mode-grid-text-contrast
title: Fixed hex text colours fail contrast on the dark-mode grid; use theme tokens
applies_when: >
  writing GridFormatter rules or control styles that set a text colour
rule: >
  When a rule sets a text colour, use a Fluent theme token such as `colorPaletteRedForeground1` rather than a fixed hex, and check it with `&flags=themeOption%3Ddarkmode`, because a hex that passes in light mode can fail badly on the dark grid and the engine's contrast warning only checks light mode.
lesson_type: pitfall
phase: design
domain: [grid-customizer, accessibility]
tech: [fluent-ui, power-apps-grid]
scope: this-stack
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "issue #15 (dark mode check); PR #27 (overdue recipe); docs/testing/gridformatter-test-environment.md (dark mode flag)"
  author:
related: []
proposed_tags: []
---

When a grid rule's text colour is a fixed hex chosen in light mode, it can be unreadable in dark mode.

## What happened
The overdue recipe used `#C50F1F`. In dark mode it measured 2.4:1 on dark grey rows and 1.8:1 on dark amber-tinted rows (issue #15). PR #27 changed the recipe to `{ "token": "colorPaletteRedForeground1" }`, which gives 5.85:1 on white and 5.2:1 on the dark grid. On an amber-tinted dark row it's about 3.5:1 (computed, not measured). `colorStatusDangerForeground1` was worse in dark mode.

## Why it happened
A hex colour doesn't change with the theme. The engine's contrast warning is computed against the light theme only, so it doesn't catch dark-mode failures.

## What to do instead
- Use token colours for text (the schema lists the allowed token names).
- Check every text colour rule in dark mode: add `&flags=themeOption%3Ddarkmode` to the URL.
- Avoid stacking coloured text on tinted rows; tints change the background too.

## When this does NOT apply
`fromOption` colours come from the choice metadata and can't adapt either way; pills pick black or white text for contrast.
