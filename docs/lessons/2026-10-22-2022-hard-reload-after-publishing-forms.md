---
id: 2026-10-22-2022-hard-reload-after-publishing-forms
title: After publishing a form or grid setting, a plain reload still shows the old version
applies_when: >
  checking a just-published form, subgrid, grid customizer setting or control
  version in a model-driven app in the browser
rule: >
  When checking a change you've just published, hard-reload the page (Cmd+Shift+R
  or Ctrl+Shift+R) before judging the result, because the app caches forms and
  grid settings and a plain reload can show the previous version.
lesson_type: pitfall
phase: testing
domain: [testing, model-driven-forms]
tech: [dataverse, claude-in-chrome]
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
  evidence: "PR #29 (commit 23d5cf5), docs/testing/gridformatter-test-environment.md §4.7; PR #26 (rules cached per tab); docs/testing/gridformatter-test-environment.md §4.5, §4.6; PR #71 (commit efd65b5), controls/ChoiceCounts/docs/decisions.md C-5 (form script missing on the first load after publishing)"
  author:
related: [2026-10-22-2021-form-subgrid-needs-own-grid-control]
proposed_tags: []
---

When a form, subgrid or grid setting has just been published, a plain browser reload of the model-driven app can still show the old version, which looks like the change didn't work.

## What happened
After adding the Child rows subgrid to the `wb_gridspike` form and publishing, the first plain reload still showed the old form (the Owner field only). A hard reload showed the subgrid.

## Why it happened
The model-driven app caches form definitions and grid settings in the browser. Publishing doesn't invalidate that cache for an open tab.

## What to do instead
- Hard-reload (Cmd+Shift+R or Ctrl+Shift+R) after every publish, before drawing conclusions.
- For a new control bundle, also bump the manifest version (the repo README's rule), or Dataverse may keep serving the cached bundle.
- GridFormatter also caches each table's rules per page, so a changed rules file needs a reload too.
- The same goes for **form scripts**. On 1 Nov 2026, the first load after adding the ChoiceCounts drill-through library and its OnLoad handler ran without them: selecting a count did nothing, and there were no console errors. A fresh load ran the handler. Before suspecting a form script's registration, reload.

## How to recognise it early
The page shows exactly what was there before publishing, not a broken version of the change.

## When this does NOT apply
Record data changes, which a normal refresh picks up.
