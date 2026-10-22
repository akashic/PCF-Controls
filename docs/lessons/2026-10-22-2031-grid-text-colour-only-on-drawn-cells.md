---
id: 2026-10-22-2031-grid-text-colour-only-on-drawn-cells
title: Grid container colour and bold don't reach cell text; draw only simple non-primary cells
applies_when: >
  a grid customizer rule needs to set a cell's text colour or font weight
rule: >
  When a grid rule needs text colour or bold, return your own element rendering `formattedValue`, and only for simple non-primary column types, because container `color` and `font-weight` aren't inherited and drawing the primary name column loses its open-record link.
lesson_type: pitfall
phase: design
domain: [grid-customizer]
tech: [power-apps-grid]
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
  evidence: "controls/GridFormatter/docs/decisions.md V7; PR #21; PR #24 (canDrawCell)"
  author:
related: [2026-10-22-2031-grid-tint-as-background-image]
proposed_tags: []
---

When a grid customizer sets `color` or `font-weight` on a cell container, the text doesn't change, because the grid's inner elements reset both.

## What happened
In the spike (V7), container `color` and `font-weight` had no visible effect. Inside every cell the grid renders `ms-Shimmer-container` → … → `ms-Label` / `ms-Link` / `ms-Persona`. An inner wrapper resets `font-weight` to 400 and `ms-Label` sets its own `color` (`rgb(36, 36, 36)`). Italic and underline do inherit, except on Owner (`Persona`).

## Why it happened
The grid's content components style themselves. Only properties they don't set are inherited from the container.

## What to do instead
- For colour or bold, return your own element that renders `formattedValue` (GridFormatter's `StyledCell`, or a `Pill`).
- Draw only the types in `canDrawCell` (`engine/resolveStyle.ts`): non-primary Text, Integer, Decimal, FloatingPoint, Currency, DateOnly, DateAndTime, OptionSet and TwoOptions. Lookups, Customer, Owner, multi-select, File, Image and the primary name keep the grid's rendering, which carries links and personas.
- On an unsupported column, skip the property with one warning naming the rule.

## When this does NOT apply
Background, italic and underline, which work on the container.
