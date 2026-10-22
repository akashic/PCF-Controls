---
id: 2026-10-22-2021-subgrid-page-table-is-form-table
title: In a grid customizer on a form subgrid, context.page.entityTypeName is the form's table
applies_when: >
  a grid customizer works out which table its grid shows (to load per-table config
  or metadata) and may run in a subgrid on a form of another table
rule: >
  When a grid customizer needs its grid's table, read the subgrid's TargetEntityType
  (context.factory._customControlProperties.descriptor.Parameters.TargetEntityType)
  first and fall back to context.page.entityTypeName, because on a form the page
  table is the form's table, not the subgrid's.
lesson_type: pitfall
phase: implementation
domain: [grid-customizer, model-driven-forms]
tech: [pcf, power-apps-grid]
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
  evidence: "issue #30, PR #31 (commit cce8edf), controls/GridFormatter/docs/decisions.md V9; issue #30 (probe tint check)"
  author:
related: [2026-10-22-2021-form-subgrid-needs-own-grid-control]
proposed_tags: []
---

When a grid customizer runs in a subgrid on a form of another table, `context.page.entityTypeName` gives the form's table, so anything keyed by table loads the wrong table's config.

## What happened
GridFormatter 0.1.0 loaded `wb_/GridFormatter/<context.page.entityTypeName>.json`. A temporary Users subgrid on the `wb_gridspike` form was formatted with `wb_gridspike.json`'s rules, and a probe `systemuser.json` was ignored (#30). Same-table subgrids hid the bug, because the form's table and the subgrid's table were the same.

## Why it happened
`context.page` describes the page, and on a form the page is the record's form. The subgrid's own table appears only in the undocumented `context.factory._customControlProperties.descriptor.Parameters.TargetEntityType`. The main grid doesn't have it, and `context.mode.contextInfo.entityId` is set on forms but not on the main grid.

## What to do instead
- Read `TargetEntityType` first, then the page's table: `controls/GridFormatter/GridFormatter/engine/gridTable.ts` (`gridTableOf`).
- Warn when the grid is on a form (`contextInfo.entityId` set) but `TargetEntityType` is missing, so a platform change shows up as a console warning rather than silently using the wrong rules.
- Test with a subgrid of a **different** table and a visible probe rule.

## How to recognise it early
A subgrid of another table is formatted with the form table's rules, or not at all, while the same table's main grid is correct.

## When this does NOT apply
A table's main grid and same-table subgrids: the page's table is correct there. Recheck if the platform documents a supported way to get the grid's table.
