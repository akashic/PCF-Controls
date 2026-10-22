---
id: 2026-10-22-2021-form-subgrid-needs-own-grid-control
title: A table's grid customizer doesn't reach form subgrids; each subgrid needs its own
applies_when: >
  putting a Power Apps grid customizer (such as GridFormatter) on a subgrid on a
  model-driven form, when the table's main grid already uses it
rule: >
  When a subgrid should use a grid customizer, give the subgrid its own Power Apps
  grid control with the customizer set, because the table-level grid setting only
  covers the table's views and a subgrid without it renders as the plain grid.
lesson_type: pitfall
phase: implementation
domain: [grid-customizer, model-driven-forms]
tech: [power-apps-grid, dataverse]
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
  evidence: PR #29 (commit 23d5cf5), docs/testing/gridformatter-test-environment.md §4.7
  author:
related: []
proposed_tags: []
---

When a table's main grid already uses a Power Apps grid customizer and you add a subgrid of that table to a form, the subgrid isn't formatted: it renders as the plain read-only grid.

## What happened
GridFormatter was set on `wb_gridspike` through the table's grid setting (`customcontroldefaultconfig.controldescriptionxml`), and every view was formatted. A "Child rows" subgrid added to the table's main form showed no formatting at all.

## Why it happened
The table-level setting applies to the table's views only. A form subgrid picks its control from the form XML: a `<controlDescription forControl="{uniqueid}">` inside `<form><controlDescriptions>`, pointing at the subgrid `<control>`'s `uniqueid` attribute. A new subgrid has neither, so it gets the default grid.

## What to do instead
- In the form designer: select the subgrid → **Components** → add **Power Apps grid control**, and set its **Customizer control** to the customizer's full name. Steps are in the GridFormatter README, "Subgrids on forms".
- By script: `scripts/test-env/add-gridspike-subgrid.mjs` adds the `uniqueid`, copies the table's `controlDescription`, sets `forControl`, and swaps each `<data-set name="Items">` for the subgrid's view, target table, relationship and `FilteredViewIds`. The `mailbox` main form is a working example in every environment.
- Publish the table, then hard-reload the form.

## How to recognise it early
The main grid is formatted but the same rows in a subgrid aren't, and the subgrid looks like the older read-only grid.

## When this does NOT apply
Main grids and views: the table-level setting covers them.
