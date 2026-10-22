---
id: 2026-10-22-2021-form-label-not-linked-to-custom-control
title: Model-driven forms don't link the field label to a custom field control
applies_when: >
  building a PCF field control for a model-driven form and deciding its accessible
  name (aria-label or labelling)
rule: >
  When a PCF field control renders an input, set its aria-label from
  context.mode.label (falling back to the column display name), because the form's
  label isn't associated with a custom control and the column name may differ from
  the label on the form.
lesson_type: pitfall
phase: implementation
domain: [pcf-controls, accessibility, model-driven-forms]
tech: [pcf, fluent-ui]
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
  evidence: "issue #7, PR #32 (commit 045dcff), controls/RagChoice/docs/decisions.md \"Accessible name\"; controls/RagChoice/docs/decisions.md Accessible name"
  author:
related: []
proposed_tags: []
---

When a PCF field control sits on a model-driven form, the form's field label isn't associated with it, so without its own `aria-label` the control has no name or the wrong one.

## What happened
RagChoice 0.1.0 used the column's display name as `aria-label`. On the test form, fields labelled "RAG status (left bar)" announced as the column name instead, unlike the platform's own controls next to them.

## Why it happened
The form renders the label as a `<label>` with no `for` and puts no `aria-labelledby` on the control. The platform's own controls set `aria-label` to the **form** label, which a maker can change per form.

## What to do instead
Use `context.mode.label` (Microsoft Learn: "The defined control label"), falling back to `context.parameters.<prop>.attributes.DisplayName`. RagChoice does this in `ariaLabelFor` in `RagChoice/logic.ts`. Check the accessibility tree shows the same name and role as the platform's control for the same field.

## How to recognise it early
In the browser's accessibility tree, the custom control's name differs from the visible form label, or is empty.

## When this does NOT apply
Grid customizers and dataset controls, which aren't labelled by a form field. Not yet confirmed with a real screen reader (#7).
