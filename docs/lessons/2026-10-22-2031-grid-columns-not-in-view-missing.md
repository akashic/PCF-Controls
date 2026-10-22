---
id: 2026-10-22-2031-grid-columns-not-in-view-missing
title: Grid rules on columns that aren't in the view never fire, with no warning
applies_when: >
  a GridFormatter rule shows no formatting on some view or subgrid, or a rule reads a column the view may not include
rule: >
  When a grid rule doesn't apply on a view, first check the view contains every column the rule reads (`when`, `{column}` operands, `fromOption`), because the customizer's `rowData` only has the view's columns and such rules are skipped silently.
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
  evidence: "controls/GridFormatter/docs/decisions.md V2; issue #15 (Active Grid spikes view); issue #30 (Impact)"
  author:
related: []
proposed_tags: []
---

When a GridFormatter rule reads a column that isn't in the current view, the rule is skipped and the grid looks unformatted, with nothing in the console.

## What happened
On the system "Active Grid spikes" view (Name and Created On only), `rowData` held only `wb_name` and `createdon` (spike V2), so the RAG rules didn't apply there. The same effect hid #30: on a subgrid of another table, the wrong table's rules mostly did nothing because their columns weren't in the subgrid's view.

## Why it happened
The grid only fetches the view's columns. The customizer can't see the view id either (V4), so it can't choose rules per view. Skipping silently is deliberate: it lets config authors opt a view out by leaving a column out.

## What to do instead
- Add the columns the rule reads to the view, or accept that the view isn't formatted.
- Turn on the debug log (`sessionStorage.setItem("wb_GridFormatDebug","1")`, reload) to see which rules matched each row.
- When testing a table-selection change, use a probe rule on a column that's in the view.

## When this does NOT apply
Columns that are in the view but empty: those are evaluated (as empty).
