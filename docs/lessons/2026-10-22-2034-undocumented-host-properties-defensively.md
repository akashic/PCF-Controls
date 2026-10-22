---
id: 2026-10-22-2034-undocumented-host-properties-defensively
title: Read undocumented PCF host properties defensively, with a fallback and a warning
applies_when: >
  the only source for something a control needs is an undocumented property of the PCF context or host
rule: >
  When a control relies on an undocumented host property, read it through a never-throwing accessor with a documented fallback, warn once when the fallback is used where the property was expected, and record it in the control's `decisions.md`, because a platform update can remove it without notice.
lesson_type: convention
phase: design
domain: [pcf-controls, grid-customizer]
tech: [pcf]
scope: this-project
cost_if_ignored: outage
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "controls/GridFormatter/docs/decisions.md V3 and V9; PR #31; PR #32 (IsHidden)"
  author:
related: [2026-10-22-2031-option-colours-in-attribute-descriptor, 2026-10-22-2021-subgrid-page-table-is-form-table, 2026-10-22-2031-field-control-hidden-options]
proposed_tags: []
---

When a control in this repo needs a value that only an undocumented property of the PCF context provides, it reads it defensively so a platform change degrades the control instead of breaking it.

## What happened
It has happened three times, each time after a spike showed no documented API gives the value:
- option colours in `attributeDescriptor.OptionSet[].Color` (GridFormatter V3), with the Web API metadata endpoint as fallback;
- a form subgrid's table in `context.factory._customControlProperties.descriptor.Parameters.TargetEntityType` (V9, `engine/gridTable.ts`), with the page's table as fallback and a warning when a grid on a form lacks it;
- `IsHidden` on each choice option (RagChoice), where anything other than `true` means visible.

## Why it works
Reading through a small accessor that never throws keeps the risk in one place, and each fallback is the behaviour the control had before. The warning makes a silent platform change visible.

## What to do instead
- Prove in a spike that no documented API exists; record the evidence in `decisions.md`.
- Write one accessor that returns a typed value or a fallback, with unit tests for missing, wrong-typed and throwing inputs.
- List the property in the control README's limitations, and recheck it after platform updates.

## When this does NOT apply
When a documented API gives the value, even awkwardly; use that.
