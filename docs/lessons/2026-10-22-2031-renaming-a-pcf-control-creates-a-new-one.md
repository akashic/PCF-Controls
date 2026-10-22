---
id: 2026-10-22-2031-renaming-a-pcf-control-creates-a-new-one
title: Changing a PCF control's namespace or name creates a second control
applies_when: >
  changing a PCF manifest's `namespace` or `constructor` after the control has been imported into any environment
rule: >
  When changing a control's namespace or name, treat it as a new control: re-point every grid customizer setting and form field to the new name, then delete the old control after checking its dependencies, because an import doesn't replace or remove the old one.
lesson_type: pitfall
phase: deployment
domain: [solutions-alm, grid-customizer]
tech: [pcf, dataverse]
scope: this-stack
cost_if_ignored: outage
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "PR #25 and PR #26 (Merge Danger); issue #15 (old control deleted); docs/testing/gridformatter-test-environment.md §8 step 4"
  author:
related: []
proposed_tags: []
---

When a PCF control's namespace or constructor changes, importing the new build adds a second control alongside the old one, and everything configured with the old name keeps running the old bundle.

## What happened
The namespace changed from `WB` to `Controls` (PR #25), so `wb_WB.GridFormatter` became `wb_Controls.GridFormatter`. In `LowCode`, the `wb_gridspike` grid kept running the old 0.0.5 spike bundle until its `GridCustomizerControlFullName` was changed. The old control was then deleted (issue #15).

## Why it happened
Dataverse identifies a control by its full name. A different name is a different component, and forms and grid settings refer to it by name.

## What to do instead
- Before any shared environment has the control, the rename is cheap. After a UAT or prod import, plan it as a migration.
- Re-point every grid customizer setting and form field control to the new name.
- Check `RetrieveDependenciesForDelete(ObjectId=<id>,ComponentType=66)` and that no `customcontroldefaultconfig` mentions the old name, then `DELETE customcontrols(<id>)`.

## How to recognise it early
Two controls with the same display name in the component picker, or old behaviour after importing a new version.

## When this does NOT apply
Version bumps with the same namespace and name, which update the existing control.
