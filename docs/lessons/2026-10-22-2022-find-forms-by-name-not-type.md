---
id: 2026-10-22-2022-find-forms-by-name-not-type
title: Scripts that take the first main form of a table break when a second one is added
applies_when: >
  a Web API script reads or patches a table's form XML by querying systemforms for
  the table's main forms (type eq 2) and taking the first result
rule: >
  When a script edits a form, select it by name (or formid) as well as table and
  type, because a table can have several main forms and adding one, for example a
  test form, changes which form comes first.
lesson_type: pitfall
phase: testing
domain: [testing, model-driven-forms]
tech: [dataverse-web-api]
scope: this-project
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "PR #31 (commit cce8edf, scripts/test-env/add-gridspike-subgrid.mjs), PR #32 (scripts/test-env/add-ragchoice-form.mjs)"
  author:
related: []
proposed_tags: []
---

When a test script takes the first main form of a table from `systemforms` (`type eq 2`), it silently edits the wrong form once a second main form exists.

## What happened
`add-gridspike-subgrid.mjs` read `value[0]` of the `wb_gridspike` main forms. While it ran, a subagent working on #7 added a second main form, "RagChoice test", and warned that the subgrid scripts could now pick it. The query was narrowed to `name eq 'Information'`. The browser also started opening records in the new form, so test URLs gained `&formid=`.

## Why it happened
A table can have many main forms, and the Web API's order isn't the order you expect. One-form assumptions hold only until someone adds a form.

## What to do instead
- Filter on `objecttypecode`, `type eq 2` **and** `name` (or use the `formid`).
- Put `&formid=<id>` in test URLs so the right form opens.
- When parallel agents share a test table, have each one add its own form rather than editing a shared one.

## How to recognise it early
A script reports success but the change isn't on the form you're looking at, or a record opens in an unexpected form.

## When this does NOT apply
Tables with a single main form that no one else changes, though the filter costs nothing.
