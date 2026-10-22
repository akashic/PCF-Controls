---
id: 2026-10-22-2031-editable-grid-row-restyle-waits-for-refresh
title: In an editable grid, an inline edit restyles only the edited cell until Refresh
applies_when: >
  a Power Apps grid has editing enabled and GridFormatter row-scope rules depend on an editable column
rule: >
  When testing or documenting row-scope formatting on an editable grid, expect only the edited cell to restyle until the user selects Refresh or reloads, because the grid only re-runs renderers for the cells it redraws.
lesson_type: pitfall
phase: testing
domain: [grid-customizer]
tech: [power-apps-grid]
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "issue #15 (editable grid check); commit dead894; controls/GridFormatter/docs/configuration.md line 645"
  author:
related: [2026-10-22-2031-grid-reuses-cell-containers]
proposed_tags: []
---

When a user edits a value inline in an editable Power Apps grid, only that cell is redrawn, so row-scope formatting that depends on the value doesn't update across the row until a refresh.

## What happened
Changing Spike row 03's RAG from Unknown to Red inline gave an immediate red pill in the edited cell, but the row's other cells kept their old tint until the grid was refreshed (issue #15). The limitation was documented in commit dead894.

## Why it happened
The grid re-runs renderers only for cells it redraws. There's no supported API for a customizer to repaint a row.

## What to do instead
- Document it for users: select **Refresh** on the grid after an inline edit to update row-wide formatting.
- In testing, don't mistake it for leftover container styles; reload and check again.

## When this does NOT apply
Read-only grids and edits made on the form, which reload the grid. The day changing at midnight is similar: "today" only moves when rows are next drawn.
