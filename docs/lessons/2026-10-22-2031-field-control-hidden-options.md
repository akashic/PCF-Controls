---
id: 2026-10-22-2031-field-control-hidden-options
title: PCF field controls get hidden choice options too; leave them out like the platform
applies_when: >
  a PCF field control renders a choice column's options itself
rule: >
  When a field control lists choice options, leave out options whose undocumented `IsHidden` is `true`, but keep a hidden option that is the current value as disabled and selected, because the form host sends hidden options and the platform's dropdown behaves this way.
lesson_type: pitfall
phase: implementation
domain: [pcf-controls, model-driven-forms]
tech: [pcf, dataverse]
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
  evidence: "issue #7; PR #32 (commit 045dcff); controls/RagChoice/docs/decisions.md Hidden options"
  author:
related: [2026-10-22-2031-option-colours-in-attribute-descriptor]
proposed_tags: []
---

When a field control builds its own option list from `context.parameters.<prop>.attributes.Options`, it lists options a maker marked **Hidden**, which the platform's dropdown leaves out.

## What happened
RagChoice 0.1.0 listed "Retired (hidden)" on the test form while the platform's dropdown next to it didn't. The host passes each option as `{ Color, Label, Value, TransitionData, IsHidden }`. `IsHidden` isn't in `@types/powerapps-component-framework` 1.3.18 or on Microsoft Learn's OptionDescriptor page.

## Why it happened
The host sends every option and leaves filtering to the control. The client API `getOptions()` includes hidden options too, so it can't tell them apart.

## What to do instead
- Treat only `IsHidden === true` as hidden (`buildChoiceItems` in `controls/RagChoice/RagChoice/logic.ts`). Anything else means visible, so the control degrades to listing everything if the platform stops sending it.
- If the current value is hidden, keep it in the list, disabled and selected, as the platform does.
- To set Hidden in a test, call `UpdateOptionValue` with `IsHidden: true`; the `attributepicklistvalue` table can't be queried.

## When this does NOT apply
Multi-select choices, where Microsoft says the Hidden property isn't supported.
