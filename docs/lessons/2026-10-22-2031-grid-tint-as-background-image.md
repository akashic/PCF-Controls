---
id: 2026-10-22-2031-grid-tint-as-background-image
title: Grid cell backgrounds are forced with !important; paint tints as a background-image layer
applies_when: >
  a Power Apps grid customizer renderer needs to colour a cell or a whole row
rule: >
  When a grid customizer colours a cell or row, set a translucent `linear-gradient(c, c)` on `cellContainerElement.style.backgroundImage`, because the grid theme forces `background-color` with `!important` and an opaque fill would hide hover and selection.
lesson_type: pitfall
phase: implementation
domain: [grid-customizer]
tech: [power-apps-grid, pcf]
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
  evidence: "controls/GridFormatter/docs/decisions.md V6; PR #21; issue #15 (hover and selection check)"
  author:
related: []
proposed_tags: []
---

When a Power Apps grid customizer tries to colour a cell or row with `background-color`, nothing shows, because the grid theme overrides it with `!important`.

## What happened
In the GridFormatter spike (V6), an inline `style.backgroundColor` on the cell container wasn't visible. The theme sets `.ag-cell { background-color: … !important }`, including on hover, focus and range selection. Adding `!important` ourselves worked but hid the grid's own hover and selection colours. Drawing the cell content ourselves left gaps at the cell padding.

## Why it happened
The grid owns the cell's `background-color` for its interaction states. A `background-image` layer is painted over the background colour, so it shows through the theme's rule while hover and selection stay visible underneath a translucent tint.

## What to do instead
- Set `cellContainerElement.style.backgroundImage = "linear-gradient(c, c)"` with a **translucent** colour (`tintAlpha`, or `color-mix(in srgb, var(--token) N%, transparent)` for tokens).
- In browser checks, read `style.backgroundImage`, not `backgroundColor`.

## How to recognise it early
A rule matches (debug log says so) but the cell looks unstyled; computed `background-color` is the theme's.

## When this does NOT apply
Field controls on forms, which style their own elements. Selection on a tinted row is still subtle (issue #15).
