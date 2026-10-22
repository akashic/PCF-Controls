---
id: 2026-10-22-2031-grid-reuses-cell-containers
title: The grid reuses cell containers; set or clear every owned style on every render
applies_when: >
  writing or changing a grid customizer cell renderer that styles `cellContainerElement`
rule: >
  When a renderer styles the cell container, set or clear every property it owns on every call, even when no rule matches, because the grid reuses containers across rows and a leftover style shows on the wrong row.
lesson_type: pitfall
phase: implementation
domain: [grid-customizer]
tech: [power-apps-grid, react]
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
  evidence: "controls/GridFormatter/docs/decisions.md V6 decision; PR #26 (container reuse evidence); issue #15 (fast-scroll and paging checks)"
  author:
related: [2026-10-22-2031-grid-tint-as-background-image]
proposed_tags: []
---

When a grid customizer renderer styles the cell container only when a rule matches, a previous row's style stays on the container after the grid reuses it for another row.

## What happened
The spike found the grid reuses cell containers across rows (V6). PR #26's browser check watched one container go grey and italic, then green, then cleared as it was reused. GridFormatter's `applyContainerStyle` therefore always writes `backgroundImage`, `fontStyle` and `textDecoration`, using `""` to clear. Issue #15's fast-scroll and paging checks then found no stale tints.

## Why it happened
The grid virtualises rows and recycles DOM elements. Inline styles set on a container aren't reset by the grid.

## What to do instead
- Write every owned property on every renderer call; `""` clears it. Leave other inline styles alone.
- After changes, scroll fast and page through, and run `__wbCheck()` / `__wbStress()` from `scripts/test-env/browser/grid-checks.js`.

## How to recognise it early
A tint or italic on a row that no rule matches, usually after scrolling or paging.

## When this does NOT apply
Content returned as React elements, which React reconciles. An editable grid not restyling the rest of a row after an inline edit is a different issue (the grid doesn't redraw those cells).
