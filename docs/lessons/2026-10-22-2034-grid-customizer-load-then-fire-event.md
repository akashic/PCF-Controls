---
id: 2026-10-22-2034-grid-customizer-load-then-fire-event
title: "Grid customizers: load async data in init, then fireEvent, with a timeout"
applies_when: >
  a Power Apps grid customizer needs config or metadata loaded asynchronously before the grid's first paint
rule: >
  When a grid customizer needs async data, load it in `init` and call `context.factory.fireEvent` once it's ready, with a timeout of about 3 seconds that fires unstyled renderers anyway, because the grid waits for the event, so the first paint is already formatted and a slow load can't leave the grid blank.
lesson_type: convention
phase: design
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
  evidence: "controls/GridFormatter/docs/decisions.md V5; PR #21; PR #26 (stores/startup.ts)"
  author:
related: []
proposed_tags: []
---

When a Power Apps grid customizer needs data from the server before it can format anything, it should load that data in `init` and only then hand its renderers to the grid with `fireEvent`.

## What happened
The spike (V5) delayed `fireEvent` by 2 seconds. The grid waited: its first renderer call came at 2,085 ms and was already styled. GridFormatter 0.1.0 (#26) loads the table's rules and option colours, then fires, using `startWhenLoaded` in `stores/startup.ts` with a 3-second timeout.

## Why it works
The grid holds its first render until the customizer event, so there's no unstyled flash and no re-render after data arrives. In the first second the grid called renderers 448 times for 30 rows × 16 columns, so renderers must be fast and never fetch.

## What to do instead
- Start loading in `init`; never fetch in a renderer.
- Fire exactly once: with the data, or with renderers that style nothing after the timeout (one warning). Ignore a late result so the grid never changes style part-way through.
- Cache loads per page so several grids share one request.

## When this does NOT apply
Field controls, which render through `updateView` and can show their own loading state.
